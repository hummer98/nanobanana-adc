# T03 実装計画書 — 画像生成コア (`src/generate.ts`)

## 0. 前提と対象リポジトリ

- 作業ディレクトリ: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-003-1776967893`
- 対象ファイル: `src/generate.ts`(新規)、`src/auth.ts`(T02 先行実装 = provisional implementation を同梱 ※本計画の方針)
- TypeScript: strict / ES2022 / Node16(既存 `tsconfig.json` を使用)
- 依存: 既存 `package.json` に `@google/generative-ai`, `google-auth-library`, `commander` が入っている

> **Planner の見解(seed.md §技術スタックに対する補足)**
> seed.md は「`@google/generative-ai`(`GOOGLE_GENAI_USE_VERTEXAI=true` モード)」と記述するが、現実には `@google/generative-ai` 0.21 系は当該環境変数を参照しない(後継 SDK `@google/genai` の仕様)。したがって **Vertex AI への到達は生 `fetch` で実装する** ことを本計画の方針とする(§6 参照)。将来 `@google/genai` へ乗り換える時点で再整理の余地あり。

---

## 1. 実装方針の要約

1. `GenerateOptions` 型と `generate()` 関数を `src/generate.ts` から export する。
2. 認証は `src/auth.ts` の `resolveAuth()` に完全委譲し、`generate.ts` は認証詳細を知らない。
3. T02 が未マージの状況に対応するため、本 worktree 内に **T02 先行実装(provisional implementation)の `src/auth.ts` を同梱**する(T02 マージ時に置き換えられる前提で、契約を厳密に合わせる)。
4. **認証モード別の API 呼び出し経路**:
   - **ADC モード(本命)**: 生 `fetch` で Vertex AI エンドポイント(`https://{location}-aiplatform.googleapis.com/v1/...`)に直接 POST する。
   - **API キーモード**: `@google/generative-ai` SDK(`GoogleGenerativeAI`)を引き続き使う。
   - この方針転換の根拠は §0 の Planner 見解および §6 参照。
5. 画像レスポンスは `inlineData.data`(base64)を `Buffer.from(b64, 'base64')` でデコードし、出力先ディレクトリを `fs.mkdir({ recursive: true })` で作ってから `fs.writeFile` する。
6. 生成完了ログは 1 行固定形式で `stdout` へ出す。

---

## 2. `resolveAuth()` の契約定義(T02 との協定)

`src/auth.ts` は次の契約を満たすこと。**T03 実装者はこの契約だけを参照する。**

```ts
// src/auth.ts

/** 認証モード。ログ出力と generate.ts 側の分岐に使う。 */
export type AuthMode = 'api-key' | 'adc';

/** resolveAuth() が返す資格情報。 */
export interface ResolvedAuth {
  /** どの経路で解決されたか。 */
  mode: AuthMode;

  /**
   * API キーモード時の API キー。mode === 'api-key' のときのみ非 undefined。
   * `--api-key` フラグ > `GEMINI_API_KEY` 環境変数 の順で解決される。
   */
  apiKey?: string;

  /**
   * ADC モード時の Google Cloud access token(Bearer に載せる生トークン)。
   * mode === 'adc' のときのみ非 undefined。
   */
  accessToken?: string;

  /** ADC モード時の GCP プロジェクト ID。`GOOGLE_CLOUD_PROJECT` から取得。 */
  project?: string;

  /** ADC モード時のリージョン。`GOOGLE_CLOUD_LOCATION` から取得。 */
  location?: string;
}

/**
 * 認証情報を解決する。
 * 優先順位: options.apiKey → process.env.GEMINI_API_KEY → ADC
 * ADC の場合は google-auth-library の GoogleAuth で access token を取得する。
 *
 * ログ契約(固定文字列 2 パターン):
 *   - API キーモード: `[auth] using: api-key`
 *   - ADC モード:    `[auth] using: adc`
 *   ※ `[auth] using: adc | api-key` のようなパイプ区切り単一文字列は誤解釈であり、
 *     モードごとに 1 行を出力する。
 *
 * 失敗時の契約:
 *   - Error を throw する(例: 資格情報なし / access token 取得失敗)。
 *   - `process.exit()` は呼ばない(CLI 層 = T04 の責務)。
 */
export function resolveAuth(options?: { apiKey?: string }): Promise<ResolvedAuth>;
```

**契約の要点(T02 実装者への明文化):**

1. **ログ出力は 2 パターン固定**
   - API キーモード時に `console.log('[auth] using: api-key')` を出力。
   - ADC モード時に `console.log('[auth] using: adc')` を出力。
   - T03/T04 は文字列一致で grep / 動作確認するため、固定文字列を維持すること。
2. **失敗時は throw、`process.exit()` は呼ばない**
   - tasks.md T02 に「明示的なエラーメッセージで exit 1」とあるが、**exit 1 は CLI 層(T04)で実施**する。
   - `resolveAuth()` は純粋な関数として Error を投げ、呼び出し側が catch する。
   - これにより T03(`generate.ts`)で `try/catch` 可能、ユニットテスト可能となる。

**T03 側の利用例:**

```ts
const auth = await resolveAuth({ apiKey: options.apiKey });
// auth.mode === 'api-key' ? auth.apiKey! : auth.accessToken!
```

**T02 先行実装方針**: T02 未マージのため、T03 worktree には上記シグネチャと契約に厳密に一致する **T02 先行実装(provisional implementation)** を `src/auth.ts` に同梱する(詳細は §10)。

---

## 3. `GenerateOptions` 型の最終定義

```ts
// src/generate.ts

/** サポートするサイズ。ピクセル換算は §5 参照。 */
export type GenerateSize = '1K' | '2K' | '4K';

/** サポートするアスペクト比(10 種)。一覧は §4 参照。 */
export type GenerateAspect =
  | '1:1'
  | '16:9' | '9:16'
  | '4:3'  | '3:4'
  | '3:2'  | '2:3'
  | '21:9' | '9:21'
  | '5:4';

export interface GenerateOptions {
  /** 生成プロンプト(必須)。 */
  prompt: string;

  /** アスペクト比。既定値は CLI 層(T04)で決める。 */
  aspect: GenerateAspect;

  /** 出力サイズ。1K=1024 / 2K=2048 / 4K=4096。 */
  size: GenerateSize;

  /** モデル ID。既定: `gemini-3-pro-image-preview`(呼び出し側が注入)。 */
  model: string;

  /** 画像を書き出すファイルパス。存在しない親ディレクトリは自動作成。 */
  output: string;

  /** 明示指定された API キー。未指定なら GEMINI_API_KEY / ADC にフォールバック。 */
  apiKey?: string;
}
```

### 3.1 `aspect` 型と T04 との契約(断定)

- `GenerateOptions.aspect` の型は **`GenerateAspect` union(strict)** とする。受け入れ基準の `aspect: string` は厳格化する方針で確定。
- **バリデーションの責務は CLI 層(T04)**。T04 は `commander` で受けた `string` を `generate()` に渡す前に `GenerateAspect` に正規化/検証する。
- その用途のために、`generate.ts` から **`assertAspect(value: string): asserts value is GenerateAspect`** を export する(T04 が import して使う)。

```ts
// src/generate.ts から export するガード
export function assertAspect(value: string): asserts value is GenerateAspect {
  if (!(value in ASPECT_MAP)) {
    throw new Error(
      `[generate] unsupported aspect: ${value}. supported: ${Object.keys(ASPECT_MAP).join(', ')}`,
    );
  }
}
```

> 利用側(T04)の想定:
> ```ts
> const raw = options.aspect; // commander から来た string
> assertAspect(raw);          // これ以降 raw は GenerateAspect に narrow される
> await generate({ ..., aspect: raw });
> ```

---

## 4. アスペクト比マッピング表(10 種)

| ラベル  | 目的・用途             | generationConfig へ渡す値(`imageConfig.aspectRatio`) |
| :----- | :--------------------- | :-------------------------------------------------------- |
| `1:1`  | 正方形(SNS アイコン等) | `"1:1"`                                                   |
| `16:9` | ワイド横(動画サムネ等) | `"16:9"`                                                  |
| `9:16` | 縦長(スマホ壁紙等)     | `"9:16"`                                                  |
| `4:3`  | 標準横                 | `"4:3"`                                                   |
| `3:4`  | 標準縦                 | `"3:4"`                                                   |
| `3:2`  | 写真横(35mm 相当)      | `"3:2"`                                                   |
| `2:3`  | 写真縦                 | `"2:3"`                                                   |
| `21:9` | シネスコ横             | `"21:9"`                                                  |
| `9:21` | シネスコ縦             | `"9:21"`                                                  |
| `5:4`  | 中判横(4x5 ライク)     | `"5:4"`                                                   |

実装では以下の `Record` で保持する:

```ts
const ASPECT_MAP: Record<GenerateAspect, string> = {
  '1:1':  '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:3':  '4:3',
  '3:4':  '3:4',
  '3:2':  '3:2',
  '2:3':  '2:3',
  '21:9': '21:9',
  '9:21': '9:21',
  '5:4':  '5:4',
};
```

> 注: Gemini 3 Pro Image / Nano Banana Pro が最終的に未知の比を受け付けない場合があるため、API 仕様のずれは **実装者が API エラーメッセージを見て個別に 400 をラップ**する(§8)。マッピング表は識別子の正規化を主目的とする。

---

## 5. サイズマッピング表

| ラベル | 最長辺ピクセル | generationConfig へ渡す値          |
| :----- | --------------: | :---------------------------------- |
| `1K`   | 1024           | `{ imageSize: '1K' }` または `1024` |
| `2K`   | 2048           | `{ imageSize: '2K' }` または `2048` |
| `4K`   | 4096           | `{ imageSize: '4K' }` または `4096` |

```ts
const SIZE_PX: Record<GenerateSize, number> = {
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
};
```

> API 側が `imageSize: '1K' | '2K' | '4K'` の文字列を直接受ける実装(Nano Banana Pro の新仕様)であればそのまま文字列を渡す。受けない場合は `SIZE_PX` のピクセル値を `width` / `height` 算出に使う。**実装者は呼び出し1回目の検証で決定してよい**。

---

## 6. 画像生成 API 呼び出しパターン

**方針**: 認証モードに応じて **2 つの経路を明確に分岐** する。ADC モードは生 `fetch`(本命)、API キーモードは `@google/generative-ai` SDK(サブ)。

### 6.1 認証モード分岐(全体骨格)

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { resolveAuth } from './auth.js';

const auth = await resolveAuth({ apiKey: options.apiKey });

let base64Image: string;
if (auth.mode === 'adc') {
  base64Image = await generateViaVertexFetch(auth, options); // §6.2
} else {
  base64Image = await generateViaSdk(auth, options);         // §6.3
}

await writeImage(options.output, base64Image); // §7
```

### 6.2 ADC モード(本命): 生 `fetch` で Vertex AI へ POST

seed.md §技術スタックの `GOOGLE_GENAI_USE_VERTEXAI=true` は `@google/generative-ai` 0.21 系では解釈されないため、Vertex AI への到達は **生 `fetch`** で行う(§0 Planner 見解参照)。実装概形:

```ts
async function generateViaVertexFetch(
  auth: ResolvedAuth,
  options: GenerateOptions,
): Promise<string> {
  // mode === 'adc' の契約により accessToken / project / location は非 undefined
  const { accessToken, project, location } = auth;

  const endpoint =
    `https://${location}-aiplatform.googleapis.com/v1` +
    `/projects/${project}/locations/${location}` +
    `/publishers/google/models/${options.model}:generateContent`;

  const body = {
    contents: [
      { role: 'user', parts: [{ text: options.prompt }] },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: ASPECT_MAP[options.aspect],
        imageSize: options.size, // '1K' | '2K' | '4K'
      },
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `[generate] Vertex AI HTTP ${res.status}: ${text.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string } }> };
    }>;
  };

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const data = p.inlineData?.data;
    if (typeof data === 'string' && data.length > 0) {
      return data; // base64 文字列(1 枚目)
    }
  }
  throw new Error('[generate] response contained no image data');
}
```

- エンドポイント: `https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent`
- メソッド: POST
- ヘッダ: `Authorization: Bearer <accessToken>` / `Content-Type: application/json`
- body: `{ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio, imageSize } } }`
- レスポンス抽出: `candidates[0].content.parts[i].inlineData.data` を base64 文字列として取り出す(復号は §7 `writeImage` 側で `Buffer.from(b64, 'base64')`)。
- 画像が複数返っても **1 枚目(最初に見つかった `inlineData`)だけ** を保存する。

### 6.3 API キーモード(サブ): `@google/generative-ai` SDK

API キー経路は従来どおり SDK を使う(Generative Language API の素直な呼び出し):

```ts
async function generateViaSdk(
  auth: ResolvedAuth,
  options: GenerateOptions,
): Promise<string> {
  const client = new GoogleGenerativeAI(auth.apiKey!);

  const model = client.getGenerativeModel({
    model: options.model,
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: ASPECT_MAP[options.aspect],
        imageSize: options.size,
      },
    } as any, // SDK 型定義に `imageConfig` が無い場合の退避(§8)
  });

  const result = await model.generateContent(options.prompt);

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if ('inlineData' in p && p.inlineData?.data) {
      return p.inlineData.data;
    }
  }
  throw new Error('[generate] response contained no image data');
}
```

### 6.4 参考情報(採用しない経路): SDK の `baseUrl` + `customHeaders`

`@google/generative-ai` 0.21 系の `RequestOptions.baseUrl` + `customHeaders` を使って Vertex AI エンドポイントへトンネリングする経路は **実装順では採用しない**(SDK 内部の URL 組み立てロジックと Vertex AI の URL スキーマ `/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent` との整合が取れるかが plan 段階で未検証、かつ 0.21 系は基本的に Generative Language API 向けであるため)。

参考までに擬似的な呼び出しは以下だが、**実装しない**:

```ts
// 参考のみ。採用しないこと。
client.getGenerativeModel(
  { model, generationConfig },
  {
    baseUrl: `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google`,
    customHeaders: new Headers({ Authorization: `Bearer ${accessToken}` }),
  },
);
```

将来 `@google/genai`(Vertex 公式対応)への乗り換え時に再整理する。本タスクでは seed.md 記載の SDK 選定(`@google/generative-ai`)を維持しつつ、ADC 経路のみ生 `fetch` で実装する。

### 6.5 API 挙動の確証が取れない点(実装者へのメモ)

- `imageConfig.aspectRatio` / `imageConfig.imageSize` は Nano Banana Pro 系のフィールド名。SDK 型定義に無ければ `as any` で抜ける(§6.3)。生 fetch 側(§6.2)は TypeScript の型制約を受けないため問題なし。
- Vertex AI API が `imageSize` を文字列(`'1K'` 等)で受けない場合は、§5 の `SIZE_PX` を使ってピクセル値に変換して再試行する(実装者が 1 回目の呼び出しで確認)。
- 上記は **実装者が最初に 1 回手動で呼び出して確認**してよい(ユニットテスト必須ではない §15)。

---

## 7. ファイル保存ロジック

```ts
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

async function writeImage(outputPath: string, base64Data: string): Promise<void> {
  const buf = Buffer.from(base64Data, 'base64');
  const dir = dirname(outputPath);
  if (dir && dir !== '.') {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(outputPath, buf);
}
```

- `dirname('./cat.png')` は `'.'` を返すので `mkdir` をスキップ。
- 既存ファイルは **上書き**(`writeFile` の既定挙動)。本タスクでは上書き確認は不要。

---

## 8. エラーハンドリング方針

`generate()` は `Promise<void>` を返す。異常時は **個別にラップした Error を throw** し、CLI 層(T04)で catch して `exit 1` する想定。

| 分類        | 発生源                                                             | 方針                                                                                                                                                |
| :---------- | :----------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| 認証失敗    | `resolveAuth()` が throw                                           | そのまま上に伝搬。`resolveAuth` 側でメッセージを確定させているため `generate.ts` では包まない。                                                     |
| API 失敗(ADC) | `fetch` が reject、または `res.ok === false`(§6.2)            | `res.ok === false` の場合は `[generate] Vertex AI HTTP <status>: <body>` を throw(§6.2 コード例)。`fetch` 自体の reject は `cause` に保持してラップ。 |
| API 失敗(APIキー) | `model.generateContent()` が throw(§6.3)                   | `throw new Error(\`[generate] API error: \${err.message}\`, { cause: err })` の形でラップ。                                                         |
| 画像なし    | レスポンスに `inlineData` が存在しない(両経路共通)                 | `throw new Error('[generate] response contained no image data')` を投げる。                                                                         |
| 書込失敗    | `mkdir` / `writeFile` が throw                                     | `throw new Error(\`[generate] failed to write \${output}: \${err.message}\`, { cause: err })` でラップ。                                            |

- `try/catch` は **認証解決 〜 API 呼び出し 〜 書き込み** を一つの try にまとめても、3 ブロックに分けてもよい。ラップメッセージの prefix(`[generate]`)だけ統一すれば読み手の特定は可能。
- `options` の **実行時バリデーションはしない**(TypeScript 型で縛るのみ)。CLI 層で union 型に正規化してから渡す前提。

---

## 9. ログフォーマット(生成完了ログ)

成功時、**1 行**で次を出力する(区切りは半角スペース + パイプ + 半角スペース):

```
[generate] done | output=<output-path> | model=<model-id> | elapsed_ms=<ms>
```

**例:**

```
[generate] done | output=./cat.png | model=gemini-3-pro-image-preview | elapsed_ms=5432
```

- 所要時間は `Date.now()` の開始〜終了の差分を整数 ms で。
- 認証モードのログは `resolveAuth()` が別途 `[auth] using: ...` を出すので **`generate` は出さない**。
- 書き込み先の絶対パスではなく `options.output` をそのまま出す(利用者の意図を尊重)。

---

## 10. T02 統合時の整合性リスクと対応

### リスク

- T03 worktree では `src/auth.ts` が存在しない → `import { resolveAuth } from './auth.js'` でコンパイル不能。
- T02 実装者が本計画の契約(§2)から逸脱する可能性。
- T02 マージ後、T03 が同梱した実装が **競合** する可能性。

### 対応

1. **T02 先行実装(provisional implementation)を同梱**: T03 実装者は `src/auth.ts` を §2 の契約に厳密に一致させた T02 先行実装として書く。内容は下記 §10.1。「stub」とは呼ばず「T02 先行実装」と呼称する(実体として `google-auth-library` 呼び出しまで含む実装であり、stub の語彙では実態を表現できないため)。
2. **契約をコメントとして先頭に埋める**: 将来 T02 が上書きするときも契約が消えないよう、契約コメントを `src/auth.ts` 先頭に置く。
3. **PR 説明に明記**: T03 の PR 本文で「`src/auth.ts` は **T02 先行実装(provisional impl)**。T02 マージ時に置き換える」と書く。T02 PR とのマージ順で競合する場合は **T02 側を採用** する方針で統一。
4. **検証テスト**: 先行実装で `npm run typecheck` が通ることを確認。API キー経路は先行実装でも実動作可能。

### 10.1 T02 先行実装の内容

```ts
// src/auth.ts (T03 同梱の T02 先行実装 = provisional implementation。
//              T02 マージ時に上書きされる想定。)
//
// 契約は plan.md §2 を参照。変更する場合は T03 の呼び出し側と同期すること。

import { GoogleAuth } from 'google-auth-library';

export type AuthMode = 'api-key' | 'adc';

export interface ResolvedAuth {
  mode: AuthMode;
  apiKey?: string;
  accessToken?: string;
  project?: string;
  location?: string;
}

export async function resolveAuth(options?: { apiKey?: string }): Promise<ResolvedAuth> {
  const explicit = options?.apiKey;
  const envKey = process.env.GEMINI_API_KEY;

  if (explicit) {
    console.log('[auth] using: api-key');
    return { mode: 'api-key', apiKey: explicit };
  }
  if (envKey) {
    console.log('[auth] using: api-key');
    return { mode: 'api-key', apiKey: envKey };
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION;
  if (!project || !location) {
    throw new Error(
      '[auth] ADC requires GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION env vars',
    );
  }

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;
  if (!accessToken) {
    throw new Error('[auth] failed to obtain ADC access token');
  }

  console.log('[auth] using: adc');
  return { mode: 'adc', accessToken, project, location };
}
```

> これは T02 の必要十分な部分集合に相当するので、T02 実装者が §2 の契約(ログ文言固定 2 パターン / throw / exit しない)を踏襲していれば置換しても挙動差は生じない。

---

## 11. 実装ステップ順(TDD ではなく段階構築)

1. **T02 先行実装の `src/auth.ts` を作成**(§10.1) — `npm run typecheck` 通過を先に確保。
2. **`src/generate.ts` に型だけ先に書く**
   - `GenerateOptions` / `GenerateAspect` / `GenerateSize` / `ASPECT_MAP` / `SIZE_PX`
   - `assertAspect()`(§3.1)を export 済みにしておく
   - `generate()` は `throw new Error('not implemented')` のみ
   - ここで `npm run typecheck` が通ることを確認
3. **ファイル書き込み関数 `writeImage()` を実装**(§7)
4. **API 呼び出し部を実装(認証モードで分岐)**(§6)
   - **ADC モード(本命)**: 生 `fetch` で Vertex AI エンドポイントに POST(§6.2 のコード例どおり)。エンドポイント URL / ヘッダ / body / レスポンス抽出を順に実装。
   - **API キーモード(サブ)**: `@google/generative-ai` SDK 経由(§6.3)。`GoogleGenerativeAI(apiKey)` → `getGenerativeModel()` → `generateContent()` → `candidates[0].content.parts[i].inlineData.data`。
   - **SDK の `baseUrl` + `customHeaders` 経路は実装しない**(§6.4 の参考情報扱い)。
5. **エラーハンドリング**(§8)のラップを最後に足す
6. **ログ出力**(§9)を追加
7. **`npm run typecheck` / `npm run build` の両方が通ることを確認**
8. **(任意)**API キーモードで手動 smoke test(実 API キーがある場合のみ)。ADC モードは GCP プロジェクトと `gcloud auth application-default login` が必要なため任意。

---

## 12. 受け入れ基準のチェックリスト(タスクから転記)

- [ ] `GenerateOptions` 型を定義して export する
  - [ ] `prompt: string`
  - [ ] `aspect: GenerateAspect`(strict union、§3.1。1:1 / 16:9 / 9:16 / 4:3 / 3:4 等、計 10 種をサポート)
  - [ ] `size: '1K' | '2K' | '4K'`(1K=1024px, 2K=2048px, 4K=4096px)
  - [ ] `model: string`(既定: `gemini-3-pro-image-preview`)
  - [ ] `output: string`
  - [ ] `apiKey?: string`
- [ ] `generate(options: GenerateOptions): Promise<void>` を export する
- [ ] `assertAspect(value: string): asserts value is GenerateAspect` を export する(T04 用、§3.1)
- [ ] ADC モードは生 `fetch` で Vertex AI エンドポイントへ POST する(§6.2)
- [ ] API キーモードは `@google/generative-ai` SDK で呼ぶ(§6.3)
- [ ] レスポンスの base64 画像データを `output` パスに書き出す(ディレクトリが無ければ作る)
- [ ] 生成完了ログ: 出力パス・モデル名・所要時間(ms)を 1 行で出力
- [ ] strict TypeScript (ES2022, Node16) でコンパイルが通ること(`npm run typecheck` 成功)
- [ ] 画像が複数返っても 1 枚目だけ保存する
- [ ] `src/auth.ts` の `resolveAuth()` を使って認証情報を取得する(T02 先行実装同梱で対応)

---

## 13. 成果物ファイル一覧

| パス              | 扱い                                                                 |
| :---------------- | :------------------------------------------------------------------- |
| `src/generate.ts` | 新規作成(本タスクの本体)                                           |
| `src/auth.ts`     | 新規作成(T02 先行実装 = provisional implementation、T02 で上書き)  |

---

## 14. スコープ外(やらないこと)

- `src/cli.ts` の改修(T04 の担当)
- `commander` での引数解析(T04 の担当)
- `bin/nanobanana-adc` の作成(T05 の担当)
- ユニットテスト一式(本タスクでは必須ではない — §15)
- `@google/genai` への乗り換え(seed.md の技術選定に反する)

---

## 15. テスト方針

- 受け入れ基準に「実 API 呼び出しテスト」は含まれない(認証情報前提のため)。
- 必須: `npm run typecheck` と `npm run build` が成功すること。
- 任意: API キーが手元にあれば、`node --loader ...` 経由で `generate({ ... })` を一度呼び、`.png` が出力されることだけ確認する。
- ユニットテストを書くならマッピング表(`ASPECT_MAP` / `SIZE_PX`)の整合性確認くらいに留める(費用対効果の観点)。

---

## Revision History

### Rev 2(Design Review 反映)

- **Major #1 対応**: Vertex AI 呼び出しの方針を反転。**生 `fetch` 経路を本命**、SDK 経路はサブに降格。§6 を全面改訂し、§6.2 に生 fetch の具体コード(エンドポイント / ヘッダ / body / レスポンス抽出)を追加。SDK の `baseUrl` + `customHeaders` 経路は §6.4 に参考情報として残すが**実装しない**。§1 の実装方針要約と §11 実装ステップ 4 も同方針で書き換え。
- **Major #2 対応**: §2 `resolveAuth()` 契約を厳密化。
  - ログ出力は **`[auth] using: api-key`** / **`[auth] using: adc`** の固定 2 パターン(パイプ区切り単一文字列は誤解釈)。
  - 失敗時は **Error を throw**、`process.exit()` は呼ばない(CLI 層 = T04 の責務)。
- **Minor 反映**:
  - §0 に Planner 見解(`@google/generative-ai` 0.21 が `GOOGLE_GENAI_USE_VERTEXAI=true` を参照しない旨)を追加。
  - §3.1 で `aspect` を `GenerateAspect` union strict に断定。`assertAspect(value: string): asserts value is GenerateAspect` を `generate.ts` から export して T04 が利用できるようにする方針を明記。
  - §10 / §13 の「最小 stub」を **「T02 先行実装 (provisional implementation)」** に改称。PR 本文記載もこの呼称で統一。
  - §12 の受け入れ基準を strict union と経路分岐に合わせて微修正。
