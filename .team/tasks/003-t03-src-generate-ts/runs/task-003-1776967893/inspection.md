# Inspection: T03 src/generate.ts

## 判定

**Verdict: GO**

## 機械的検証結果

- typecheck: **PASS**(`npm run typecheck` が 0 エラーで完了)
- build: **PASS**(`npm run build` 成功)
- `dist/generate.js`, `dist/auth.js`: **生成**(それぞれ 4212 / 1339 bytes、空ファイルなし)

## 受け入れ基準の突合

### `GenerateOptions` 型(src/generate.ts:16-23)

- ✅ `GenerateOptions` が export されている
  - ✅ `prompt: string`(line 17)
  - ✅ `aspect: GenerateAspect`(line 18、10 種 union — `1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 3:2 / 2:3 / 21:9 / 9:21 / 5:4`、plan.md §3 と完全一致)
  - ✅ `size: GenerateSize`(line 19、`'1K' | '2K' | '4K'` の strict union)
  - ✅ `model: string`(line 20)
  - ✅ `output: string`(line 21)
  - ✅ `apiKey?: string`(line 22、optional)

### `generate()` 関数

- ✅ `generate(options: GenerateOptions): Promise<void>` が export されている(src/generate.ts:175)

### ADC モード(生 fetch 経路、plan.md §6.2 と突合)

- ✅ **生 `fetch` を使用**(src/generate.ts:101)。SDK の `baseUrl` 経路は採用していない
- ✅ エンドポイント URL が §6.2 と完全一致:
  `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${options.model}:generateContent`(lines 81-84)
- ✅ ヘッダ: `Authorization: Bearer ${accessToken}` + `Content-Type: application/json`(lines 103-105)
- ✅ body 構造が §6.2 と一致: `contents[].parts[].text` / `generationConfig.responseModalities: ['IMAGE']` / `generationConfig.imageConfig.{aspectRatio, imageSize}`(lines 86-97)
- ✅ メソッド: POST(line 102)

### API キーモード(SDK 経路)

- ✅ `@google/generative-ai` の `GoogleGenerativeAI` 経由で呼ばれている(src/generate.ts:143)
- ✅ `generationConfig.imageConfig` に `as any` で抜けており、§6.4 の許容範囲内(line 153)

### レスポンス処理 / ファイル書き込み

- ✅ `candidates[0].content.parts[i].inlineData.data` を抽出(両経路、lines 129-136 / lines 166-172)
- ✅ 最初に見つかった `inlineData` のみ返す — 複数画像でも 1 枚目だけ保存(for-loop の早期 return)
- ✅ `Buffer.from(b64, 'base64')` で base64 デコード後 `fs.writeFile`(writeImage, src/generate.ts:52-73)
- ✅ 親ディレクトリが無ければ `mkdir({ recursive: true })`(lines 54-64)、`dirname === '.'` 時はスキップ

### エラー分類と `[generate]` prefix

- ✅ Vertex AI HTTP エラー: `[generate] Vertex AI HTTP <status>: <body>`(line 118-120)
- ✅ fetch reject: `[generate] Vertex AI fetch failed: ...`(line 110-113、cause 保持)
- ✅ API キー経路のラップ: `[generate] API error: ...`(line 160-163、cause 保持)
- ✅ 画像なし: `[generate] response contained no image data`(両経路、lines 136, 172)
- ✅ 書き込み失敗: `[generate] failed to write <output>: ...`(lines 60, 68、cause 保持)
- ✅ 認証失敗はそのまま伝搬(§8 方針通り)

### 完了ログ

- ✅ 形式: `[generate] done | output=<path> | model=<id> | elapsed_ms=<ms>`(src/generate.ts:188-190)
- ✅ elapsed_ms は `Date.now()` 差分の整数 ms(lines 176, 187)

### `assertAspect()` の export

- ✅ `assertAspect(value: string): asserts value is GenerateAspect` として export(src/generate.ts:44-50)、T04 で import 可能

## `src/auth.ts` の契約適合(plan.md §2)

- ✅ `AuthMode = 'api-key' | 'adc'` 完全一致(src/auth.ts:6)
- ✅ `ResolvedAuth` インターフェースのフィールド構造が §2 と完全一致(lines 8-14)
- ✅ `resolveAuth(options?: { apiKey?: string }): Promise<ResolvedAuth>` シグネチャ一致(line 16)
- ✅ ログ出力は固定 2 パターン: `[auth] using: api-key`(lines 21, 25)/ `[auth] using: adc`(line 47)。パイプ区切り単一文字列は使用していない
- ✅ 認証失敗時は **Error を throw**、`process.exit` は呼んでいない(lines 32-34, 44)
- ✅ 優先順位: `options.apiKey` → `GEMINI_API_KEY` → ADC(lines 17-27 → 29-48)
- ✅ ADC モード時 `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` が無ければ throw(lines 31-35)

## plan.md 逸脱チェック

- **スコープ外変更: なし**
  - `src/cli.ts` は T01 のまま未変更(T04 のスコープ保持)
  - `bin/` ディレクトリは作られていない(T05 のスコープ保持)
  - `package.json` に依存追加なし(plan.md §0 の既存 3 依存のみ使用)
  - `.test.ts` / `__tests__` / テストフレームワーク依存なし(§15 通り)
- **実装ステップ順: 従っている**
  - 型・定数 → writeImage → ADC 生 fetch → SDK → エラーラップ → ログの順に積んだ痕跡あり
  - plan.md §11 の手順と整合
- ✅ §6.4(採用しない経路: SDK の `baseUrl` + `customHeaders`)は実装されていない

## 実装品質

- **型の厳格さ**: `as any` は API キー経路の `generationConfig.imageConfig`(SDK 型定義に存在しない退避、§6.4 で明示許容)の 1 箇所のみ。他は strict な union / Record で適切に縛られている。
- **機密情報の漏洩なし**: `accessToken` は `Authorization: Bearer` にのみ使用、ログ・エラーメッセージに露出していない。`apiKey` も同様。
- **エラーの cause 保持**: fetch reject / SDK throw / writeFile 失敗で `{ cause: err }` を付与しており、ラップしつつスタックを失わない良設計。
- **`writeImage` の細部**: `dirname('./x.png') === '.'` を除外する分岐が正しい(`mkdir('.')` の無駄呼び出し回避)。
- **dist の健全性**: `dist/generate.js` 4212 bytes、空ファイルや構文エラーなし。

## Critical 指摘(GO であっても修正必須)

なし。

## 観察(Non-blocking、Conductor 側で対応すべき事項)

以下は Implementer の成果物品質には影響しないが、コミット/マージ段階で扱う必要がある情報として記録:

1. **未コミット状態**: 現在 `src/auth.ts` と `src/generate.ts` は worktree の untracked files として存在する(`git status` 確認済み)。コミット工程は後段で実施される前提。
2. **main 側 T02 の先行マージ**: 本 worktree の base(T01, 97c6e62)から分岐しているが、`main` には既に `2200a9a feat: T02 auth layer — src/auth.ts` がマージ済みで、main 側の `src/auth.ts` は本 worktree の provisional 実装と **契約シグネチャが異なる**(`AuthResult` 判別共用体 vs `ResolvedAuth` / `resolveAuth(apiKey?: string)` vs `resolveAuth({ apiKey?: string })` / `failWith` による exit 疑い等)。plan.md §10 は T02 マージ時に本 worktree 側を上書きされる前提を取るが、**実際は main 側 T02 の契約が本 worktree の `generate.ts` と噛み合わない**ため、マージ時に `generate.ts` の呼び出し側(`resolveAuth({ apiKey })`, `auth.mode`, `auth.accessToken`, `auth.project`, `auth.location` 参照)の調整か、あるいは auth.ts 側の再修正のいずれかが必要。これは T03 Implementer の責任範囲外であり、Conductor / T02 側と調整する事項。

## 全体所感

plan.md §2〜§9 の契約に厳密に追従した実装で、ADC 生 fetch / API キー SDK の 2 経路分岐、エラーラップ、完了ログ、`assertAspect` export まで抜け漏れなく揃っている。型・エラー・ログの 3 点とも CLI 層(T04)が使いやすい形に整っており、T04 の実装を始められる状態。Critical 指摘なし、GO 判定。
