# T02 Task Run Summary

## タスク概要

T02: 認証レイヤー (`src/auth.ts`) の新規実装。ADC / API キーの切り替えを単一モジュールに閉じ込めた。

## 完了したサブタスク

- Phase 1 (Plan): Planner が `plan.md` を作成（型定義、フロー、エラー文言、google-auth-library 使い方を網羅）
- Phase 3 (Impl): Implementer が `src/auth.ts` を新規作成
- Phase 4 (Inspection): Inspector が 11 項目の受け入れ基準をチェックし **GO** 判定

## 変更ファイル一覧

- `src/auth.ts` — 新規作成（58 行、`resolveAuth()` + `AuthResult` 型 + `failWith()` ヘルパー）

既存ファイルの変更なし。

## 受け入れ基準の充足

- [x] `resolveAuth()` を export（引数 `apiKey?: string`）
- [x] 優先順位: 引数 → `GEMINI_API_KEY` → ADC
- [x] ADC パスで `GoogleAuth` 経由で access token 取得
- [x] 認証モードログ `[auth] using: adc` / `[auth] using: api-key`（stdout）
- [x] 認証失敗時は stderr にメッセージ + `process.exit(1)`
- [x] `npx tsc --noEmit` が通る（exit 0、出力なし）

## テスト結果

- `npx tsc --noEmit`: clean（strict mode でエラー 0 件）
- 自動テストは未導入（plan.md §6.2 の理由: 外部依存モック導入は T03 と併せて判断）

## 設計判断

1. **`AuthResult` を discriminated union で返す** — T03 (`src/generate.ts`) の Vertex AI モードが `project`/`location` 必須、API キーモードは不要なので、モード別に形を変えて呼び出し側の分岐を強制する。
2. **空文字 `''` を「未指定」扱い** — `.env` で `GEMINI_API_KEY=` と書かれたケースに安全側でフォールバック。
3. **`getAccessToken()` を両形式対応** — `google-auth-library@9.x` のバージョン差で `string` / `{ token?: string | null }` どちらも返り得るため defensive に処理。
4. **`failWith: never`** — try/catch 内の TypeScript 制御フロー解析を成立させ、`accessToken` の definite assignment narrowing を効かせる。

## 作業境界の遵守

- `src/cli.ts` / `package.json` / `tsconfig.json` 未変更
- `@google/generative-ai` の import なし（責務分離）
- テストコード追加なし

## マージ情報

- commit SHA: `2200a9aed09bb3058f90d2e1e03ec349f98fc3d6`
- merge 方式: ローカル ff-only マージ（`main` にダイレクト）
- rebase target: `main`（ahead-behind 差分なしで fast-forward 成立）
