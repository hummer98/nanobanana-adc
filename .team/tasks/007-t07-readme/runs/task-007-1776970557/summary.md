# Summary — T07 README・ドキュメント整備

## 概要
GitHub 公開準備のドキュメント整備。ADC 対応を唯一の差別化軸として強調した英語 README、MIT LICENSE、npm 配布メタデータ（keywords / repository / homepage / license）を整備した。

## 完了したサブタスク
- Phase 1 (Planner / surface:759): plan.md (336 行) を出力
- Phase 3 (Implementer / surface:760): README.md / LICENSE / package.json を実装
- Phase 4 (Inspector / surface:761): 全観点 check 済みで GO 判定

## 変更ファイル
- `README.md`（新規、約 143 行、英語）
  - ADC first-class support を冒頭で明示、`Why nanobanana-adc?` で cc-nano-banana / ccskill-nanobanana との差別化軸を明記
  - Installation: Claude Code plugin / npm install -g の 2 系統
  - Quick start: gcloud login → GCP プロジェクト設定 → 画像生成コマンド のステップバイステップ
  - Examples: basic / aspect+size / portrait 4K / model override / api-key fallback の 5 例
  - Options テーブル（src/cli.ts と完全一致）・Authentication 優先順位（--api-key → GEMINI_API_KEY → ADC）・環境変数一覧
- `LICENSE`（新規、MIT 標準文面、Copyright (c) 2026 nanobanana-adc contributors）
- `package.json`（修正）
  - `license: "MIT"` を追加
  - `keywords`: 13 個（gemini, gemini-3, nano-banana, nano-banana-pro, vertex-ai, adc, application-default-credentials, image-generation, text-to-image, claude-code, claude-code-plugin, gcp, cli）
  - `repository`: placeholder URL（`github.com/yamamoto/nanobanana-adc`）
  - `homepage`: placeholder URL
  - `bugs.url`: placeholder URL
  - 既存 `description` / `bin` / `files` / `dependencies` / `scripts` / `engines` は不変

## 検証結果
- `node -e 'JSON.parse(...)'` で package.json パース OK
- `npx tsc --noEmit` 通過（src/ 非変更のためデグレなし）
- `test -x bin/nanobanana-adc` OK（実行権限保持）
- Inspector 全 10 項目 [x]、GO 判定

## 残課題（スコープ外）
- `repository.url` / `homepage` / `bugs.url` の `yamamoto` は GitHub org 確定後に差し替え
- README Installation の plugin marketplace path（`yamamoto/nanobanana-adc`）も同様に差し替え
- `GOOGLE_GENAI_USE_VERTEXAI` は現状 `src/auth.ts` では未参照。README は将来実装を想定した記述になっている（T08 以降で整合を取るか要判断）

## 納品
- ローカル ff-only マージで main へ
- マージコミット: （commit 後に埋まる）
