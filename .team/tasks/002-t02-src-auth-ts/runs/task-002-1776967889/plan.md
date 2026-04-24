# T02 実装計画 — `src/auth.ts`

## 目的

ADC / API キーの認証切り替えを単一モジュール (`src/auth.ts`) に閉じ込め、T03 (`src/generate.ts`) が `resolveAuth()` 1 関数だけ呼べば認証情報が取れる状態にする。

受け入れ基準（再掲）:

- [ ] `resolveAuth()` を export する（引数で `apiKey?: string` を受け取る）
- [ ] 優先順位: `--api-key` フラグ（引数） → `GEMINI_API_KEY` 環境変数 → ADC
- [ ] ADC パスでは `google-auth-library` の `GoogleAuth` を使い access token を取得
- [ ] 認証モードを 1 行ログ出力: `[auth] using: adc` / `[auth] using: api-key`
- [ ] 認証失敗時は人間に分かるエラーメッセージを stderr に出して `process.exit(1)`
- [ ] `npx tsc --noEmit` が通る

---

## 1. 実装する API の確定

### 1.1 型定義

```ts
// src/auth.ts
export type AuthResult =
  | { mode: 'api-key'; apiKey: string }
  | {
      mode: 'adc';
      accessToken: string;
      project: string;
      location: string;
    };
```

理由:
- T03 は Vertex AI モード (`GOOGLE_GENAI_USE_VERTEXAI=true`) のとき `project` / `location` が必須なので、ADC パスでまとめて取得して返す（seed.md「環境変数」表）。
- API キーモードでは project / location は不要（Generative Language API 直叩き）。discriminated union で T03 側の分岐を明確にする。
- `accessToken` は string 固定（`getAccessToken()` の null / undefined はここで吸収）。

### 1.2 関数シグネチャ

```ts
export async function resolveAuth(apiKey?: string): Promise<AuthResult>;
```

- 引数 `apiKey` は CLI の `--api-key` フラグ由来。undefined / 空文字は「未指定」として扱う。
- `Promise<AuthResult>` — ADC パスは `getAccessToken()` が非同期なので全体を async に統一。
- 失敗時は `process.exit(1)` で終了するので、返り値は常に解決済みの `AuthResult`（reject しない設計）。

---

## 2. 認証優先順位のフロー（疑似コード）

```ts
export async function resolveAuth(apiKey?: string): Promise<AuthResult> {
  // 1) --api-key フラグ（空文字は未指定扱い）
  if (apiKey && apiKey.length > 0) {
    console.log('[auth] using: api-key');
    return { mode: 'api-key', apiKey };
  }

  // 2) GEMINI_API_KEY 環境変数（空文字は未指定扱い）
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.length > 0) {
    console.log('[auth] using: api-key');
    return { mode: 'api-key', apiKey: envKey };
  }

  // 3) ADC フォールバック
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION;
  if (!project || !location) {
    failWith(
      'ADC mode requires GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION. ' +
      'Either set them, or pass --api-key / set GEMINI_API_KEY.'
    );
  }

  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const tokenResp = await client.getAccessToken();
    const accessToken = typeof tokenResp === 'string' ? tokenResp : tokenResp?.token;
    if (!accessToken) {
      failWith('Failed to obtain access token from ADC. Run `gcloud auth application-default login`.');
    }
    console.log('[auth] using: adc');
    return { mode: 'adc', accessToken, project, location };
  } catch (err) {
    failWith(
      'ADC authentication failed. Run `gcloud auth application-default login` or set GOOGLE_APPLICATION_CREDENTIALS. ' +
      `Underlying error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function failWith(msg: string): never {
  process.stderr.write(`[auth] error: ${msg}\n`);
  process.exit(1);
}
```

ポイント:
- API キーモードの判定は「true かつ非空」を共通化（`apiKey && apiKey.length > 0`）。
- ADC に落ちる前に `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` を先に検証する（`GoogleAuth` が通ってから env 不足に気づくと UX が悪い）。
- `failWith` は `never` 返しで TypeScript のフロー解析を通す（try 内で `accessToken` が string に narrowing される）。
- `GOOGLE_GENAI_USE_VERTEXAI` は T03 の責務なので本モジュールでは触らない（auth レイヤーの関心事ではない）。

---

## 3. エラー処理方針

### 3.1 ADC 失敗時のメッセージ

stderr に人間可読な 1〜2 文で出す。いずれも exit code 1。

| ケース | メッセージ |
|--------|-----------|
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` 未設定 | `ADC mode requires GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION. Either set them, or pass --api-key / set GEMINI_API_KEY.` |
| `GoogleAuth` 例外（credentials 無し等） | `ADC authentication failed. Run \`gcloud auth application-default login\` or set GOOGLE_APPLICATION_CREDENTIALS. Underlying error: <msg>` |
| `getAccessToken()` が空 | `Failed to obtain access token from ADC. Run \`gcloud auth application-default login\`.` |

いずれも接頭辞 `[auth] error:` を付けて他ログと grep 可能にする。

### 3.2 `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` 未設定時

- ADC パスに入った時点で検証（1 つでも欠けていれば即 exit 1）。
- API キーモードでは検証しない（API キーモードは Generative Language API 直叩きでプロジェクト不要）。
- 「未設定」の定義は `undefined` または空文字。

### 3.3 `GEMINI_API_KEY` が空文字

- `''` は「未指定」と等価に扱い、次の優先度 (ADC) に落とす。
- `.env` で `GEMINI_API_KEY=` と書かれているケースを想定した安全側のデフォルト。

### 3.4 `--api-key` 引数が空文字

- 同じく `''` は「未指定」と等価に扱う（CLI で `--api-key ""` を渡されても ADC に落ちる）。

### 3.5 Exit code

- 成功時: 関数は resolve して返す（exit しない）
- 失敗時: すべて exit code 1（受け入れ基準通り）

---

## 4. `google-auth-library` の使い方

### 4.1 scope

```ts
new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
```

- Vertex AI の公式推奨スコープ（`cloud-platform` で generativelanguage / aiplatform 双方を包含）。
- より狭い `aiplatform` 専用スコープもあるが、将来の拡張 (T03+) を考慮し広めに取る。

### 4.2 `getAccessToken()` の戻り値の扱い

`google-auth-library@9.x` の `AuthClient#getAccessToken()` は `Promise<GetAccessTokenResponse>` を返し、型は概ね `{ token?: string | null; res?: ... }`。バージョンによっては `string` を直接返す実装もあるため、両方ハンドルする防御を入れる:

```ts
const tokenResp = await client.getAccessToken();
const accessToken = typeof tokenResp === 'string' ? tokenResp : tokenResp?.token;
if (!accessToken) failWith('Failed to obtain access token from ADC. ...');
```

これで `null` / `undefined` / `{ token: null }` / 空オブジェクトいずれも string narrowing 後の非空保証になる。

### 4.3 client の種類

`auth.getClient()` は環境に応じて `JWT` / `UserRefreshClient` / `Compute` 等を返す。本モジュールではどの client でも `getAccessToken()` を呼ぶだけなので、具体型には依存しない（`AuthClient` 抽象で十分）。

### 4.4 import 形式

`package.json` が `"type": "module"` で tsconfig が `Node16` なので ESM + named import:

```ts
import { GoogleAuth } from 'google-auth-library';
```

---

## 5. ログ出力

| 出力内容 | 出力先 | 理由 |
|---------|--------|------|
| `[auth] using: api-key` / `[auth] using: adc` | **stdout** (`console.log`) | タスク指示書 / tasks.md の例に合わせる。一般的な「進行状況」情報は stdout で OK。 |
| `[auth] error: ...` | **stderr** (`process.stderr.write`) | 受け入れ基準「stderr に出して exit(1)」。`console.error` でも可だが、改行制御が明示的な `process.stderr.write('...\n')` を採用。 |

注意:
- T03 で生成画像を stdout に流す設計になる可能性は**ない**（出力は `--output` ファイル指定）ので、`[auth] using: ...` を stdout に出してもパイプ汚染の懸念はない。もし将来 JSON を stdout に流すモードを追加するなら、このログを stderr に寄せる再設計が必要 → コメントで将来の拡張メモを残さない（必要になったら変える）。

---

## 6. テスト方針

### 6.1 今回の範囲

- `bun test` は未導入（`package.json` に test script 無し）。新規導入は T02 のスコープ外と判断。
- **必須**: `npx tsc --noEmit` が通ること（受け入れ基準）。
- **手動スモーク**（実装者ローカル、CI には入れない）:
  1. `--api-key xxx` 相当を渡して `[auth] using: api-key` が出ることを確認する一時スクリプト
  2. `GEMINI_API_KEY=xxx` を渡した場合の同上
  3. どちらも未設定 + `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` 設定済みで `[auth] using: adc` + access token 取得が通ること
  4. 全部未設定で exit 1 になること

上記スモークは `src/auth.ts` と同じ場所に一時ファイルは作らない。`node -e '...'` ないしは実装者のローカルメモで済ませ、**コミットしない**。

### 6.2 自動テストを入れない理由

- T02 単体では外部依存 (gcloud credentials) のモックが必要で、モック導入は T03 のテスト方針と合わせて決めたい。
- 受け入れ基準に「テスト追加」が無く、型チェックのみが要求されている。
- 早まった抽象化（DI 用の interface 切り出し等）は避ける（CLAUDE ガイドライン「task が要求する以上に抽象化しない」）。

将来 T03 以降でテストフレームワークが入ったら、`resolveAuth` の env/ argv 分岐ロジックをテストする（`GoogleAuth` をモックする形）。

---

## 7. 実装順序

TDD ではなく、型定義 → 実装 → 型チェックの順で進める（テスト未導入のため）。

1. **型定義**: `AuthResult` discriminated union を先に書いて export する。
2. **API キーパス**: `apiKey` 引数 / `GEMINI_API_KEY` 環境変数の分岐（副作用少、すぐ書ける）。
3. **failWith ヘルパー**: stderr 書き込み + exit を 1 箇所に集約。
4. **ADC パス env バリデーション**: `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` チェック。
5. **ADC パス GoogleAuth**: `new GoogleAuth` → `getClient` → `getAccessToken` → null チェック。
6. **ログ出力**: 2 箇所の `console.log('[auth] using: ...')` を追加。
7. **`npx tsc --noEmit` 実行**: strict mode で通ることを確認。通らなければ narrowing や import を修正。
8. **手動スモーク**: §6.1 の 4 パターンを目視確認。
9. **コミット**: `feat: T02 auth layer — src/auth.ts`（既存コミット 97c6e62 の形式を踏襲）。

---

## 8. 作業境界の確認

- 変更するファイル: `src/auth.ts` の新規作成のみ。
- 変更しないファイル:
  - `src/cli.ts` — T04 で `resolveAuth` を呼ぶ。本タスクでは触らない。
  - `package.json` — `google-auth-library` は既に依存済み。追加不要。
  - `tsconfig.json` — strict のまま。
- 本モジュールは `@google/generative-ai` を import しない（責務分離 — auth だけに閉じる）。

---

## 9. 想定される最終コード構造（骨格のみ）

```ts
// src/auth.ts
import { GoogleAuth } from 'google-auth-library';

export type AuthResult =
  | { mode: 'api-key'; apiKey: string }
  | { mode: 'adc'; accessToken: string; project: string; location: string };

export async function resolveAuth(apiKey?: string): Promise<AuthResult> {
  // §2 の疑似コード通りに実装
}

function failWith(msg: string): never {
  process.stderr.write(`[auth] error: ${msg}\n`);
  process.exit(1);
}
```

行数目安: 60〜80 行（型定義 + 関数本体 + ヘルパー）。
