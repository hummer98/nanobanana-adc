# T02 Inspection Report

## 判定

**GO**

## 受け入れ基準チェック

| # | 基準 | 結果 | 備考 |
|---|------|------|------|
| 1 | `resolveAuth()` を export（引数 `apiKey?: string`） | ✓ | `src/auth.ts:7` `export async function resolveAuth(apiKey?: string): Promise<AuthResult>` |
| 2 | 優先順位 引数 → `GEMINI_API_KEY` → ADC | ✓ | lines 8–11（引数）/ 13–17（env）/ 19–51（ADC）の順。分岐ロジックは plan.md §2 と一致 |
| 3 | ADC パスで `google-auth-library` の `GoogleAuth` を使い access token を取得 | ✓ | line 1 で `import { GoogleAuth } from 'google-auth-library'`、lines 29–33 で `new GoogleAuth({ scopes: [...] }) → getClient() → getAccessToken()` |
| 4 | 認証モードログ `[auth] using: adc` / `[auth] using: api-key` | ✓ | lines 9, 15 に `api-key`、line 50 に `adc`。文言一致 |
| 5 | 認証失敗時は stderr + `process.exit(1)` | ✓ | `failWith`（lines 54–57）が `process.stderr.write` + `process.exit(1)` を実行。ADC 3 箇所から呼ばれる |
| 6 | `npx tsc --noEmit` が通る | ✓ | 下の「tsc 結果」参照、exit 0 / 出力なし |
| 7 | plan.md §3.1 のエラーメッセージが一致 | ✓ | 3 つのケース全部で文字列一致を確認（下記「文言対照」参照） |
| 8 | 空文字 `''` を「未指定」と等価に扱う | ✓ | `apiKey && apiKey.length > 0`（line 8）、`envApiKey && envApiKey.length > 0`（line 14）で空文字は false に落ちる |
| 9 | `getAccessToken()` の戻り値が `string` / `{ token?: string \| null }` 両対応 | ✓ | lines 34–35 `typeof tokenResp === 'string' ? tokenResp : tokenResp?.token`。直後に `if (!token)` で `null`/`undefined`/空文字を弾く |
| 10 | `failWith` が `never` 返り値 | ✓ | line 54 `function failWith(msg: string): never` |
| 11 | `@google/generative-ai` を import していない | ✓ | import は `google-auth-library` のみ（line 1）。責務分離の約束どおり |

### 文言対照（基準 7 の詳細）

| ケース | plan.md §3.1 | 実装 (`src/auth.ts`) | 一致 |
|--------|--------------|---------------------|------|
| project/location 未設定 | `ADC mode requires GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION. Either set them, or pass --api-key / set GEMINI_API_KEY.` | line 23 完全一致 | ✓ |
| GoogleAuth 例外 | `ADC authentication failed. Run \`gcloud auth application-default login\` or set GOOGLE_APPLICATION_CREDENTIALS. Underlying error: <msg>` | lines 45–47 完全一致（`Underlying error: ` + `msg` 連結） | ✓ |
| getAccessToken 空 | `Failed to obtain access token from ADC. Run \`gcloud auth application-default login\`.` | lines 37–39 完全一致 | ✓ |

## tsc 結果

```
$ npx tsc --noEmit
(出力なし)
EXIT: 0
```

型エラー 0 件。strict mode で通過。

## セキュリティ確認

- credential が log に漏れていないか: ✓
  - `apiKey` の値そのものを log に書いている箇所なし。stdout に出るのは `[auth] using: api-key` / `[auth] using: adc` のモード名だけ。
  - `accessToken` を log に書いている箇所なし。
  - stderr のエラーメッセージに含まれるのは `err.message` のみ（`google-auth-library` 由来）。ライブラリが credential 本体をエラーに載せる既知の挙動はないので実質的リスクは低いが、「underlying error」をそのまま露出する点はここで記録しておく。運用上の懸念にはならない。
- stdout/stderr の使い分け: ✓
  - 通常ログ: `console.log`（stdout）
  - エラー: `process.stderr.write`（stderr）+ `process.exit(1)`
  - plan.md §5 に明記の方針どおり。
- 副次チェック: `.env` の値をダンプするような副作用なし。例外の rethrow なし（catch 内で `failWith`）。

## UX 確認

- エラーメッセージは英語で簡潔、かつ復旧コマンド (`gcloud auth application-default login`、`GOOGLE_APPLICATION_CREDENTIALS`、`--api-key` / `GEMINI_API_KEY`) を明示。人間可読。
- `[auth] error:` 接頭辞で grep 可能。
- 認証モードの 1 行ログで「どの経路で通ったか」が CI ログからも追える。

## 備考（GO のまま、微小な観察事項）

1. 実装では `[auth] using: adc` ログ（line 50）を try/catch の外に出している。plan.md §2 疑似コードでは try 内にあるが、`failWith` が `never` でプロセスを exit するため、try を抜けて到達するのは success パスのみ。意味は等価。
2. `let accessToken: string;` → try 内代入 → catch 内 `failWith`（`never`）→ try/catch 後に使用、という流れで TypeScript の制御フロー解析が成立しており、plan.md §9 の骨格どおり。
3. plan.md §8「作業境界」遵守: `src/cli.ts` / `package.json` / `tsconfig.json` への変更なし（`git status` 上も `?? src/auth.ts` のみ）。

## 総評

plan.md に忠実に実装されており、受け入れ基準 11 項目すべてに適合する。`resolveAuth` の分岐ロジック、エラーメッセージ文言、`getAccessToken` の両対応、`failWith: never` による narrowing、`@google/generative-ai` 非依存の責務分離、いずれも期待どおり。`npx tsc --noEmit` も strict mode でクリーン通過。

セキュリティ面でも credential 露出なし、stdout/stderr 分離も適切、UX として復旧コマンドを含む人間可読なエラー設計。過剰な抽象化や余計な依存追加もなく、T02 のスコープ内に収まっている。T03 (`src/generate.ts`) が `resolveAuth()` 1 関数で認証情報を受け取れる前提が整ったと判断し、**GO** とする。
