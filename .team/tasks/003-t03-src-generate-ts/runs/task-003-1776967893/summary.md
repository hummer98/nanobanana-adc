# T03 Summary — 画像生成コア (src/generate.ts)

## 完了フェーズ

- Phase 1 Plan: plan.md 初版作成 → Design Reviewer レビュー
- Phase 2 Design Review: Changes Requested → Planner 改訂 → Approved
- Phase 3 Implementation: src/generate.ts + src/auth.ts (provisional) 実装、typecheck / build pass
- Phase 4 Inspection: GO 判定

## 変更ファイル

- `src/generate.ts`（新規、約 190 行）
  - `GenerateOptions` / `GenerateAspect`(10 種 union) / `GenerateSize`(1K/2K/4K) 型
  - `ASPECT_MAP` / `SIZE_PX` 定数、`assertAspect()` ガード関数
  - `generate(options: GenerateOptions): Promise<void>` 本体
  - ADC モード: 生 fetch で Vertex AI `:generateContent` エンドポイントを叩く
  - API キーモード: `@google/generative-ai` SDK 経由
  - `[generate]` prefix 統一のエラーハンドリング、完了ログ
- `src/auth.ts`（T02 先行実装）
  - Provisional 実装。rebase 時に main 側の T02 canonical 実装と衝突するため semantic resolution で main 側を採用する前提

## 検証結果

- `npm run typecheck`: PASS
- `npm run build`: PASS（`dist/generate.js`, `dist/auth.js` 生成済み）
- Inspector 判定: **GO**

## 設計判断（Design Review で確定）

1. **ADC 経路は生 fetch を本命採用**: `@google/generative-ai` 0.21 系は `GOOGLE_GENAI_USE_VERTEXAI` を参照しないため、Vertex AI エンドポイントへは生 fetch で到達する。SDK の `baseUrl` + `customHeaders` 経路は不採用（plan.md §6.4 参考情報として残置）。
2. **`resolveAuth()` 契約のログ文言を 2 パターン固定化**（`[auth] using: api-key` / `[auth] using: adc`）。T02 との協定として plan.md §2 に明記。
3. **`assertAspect()` を export**: T04 が `string` → `GenerateAspect` 変換に使える。

## 残課題・懸念

- **main 側 T02 契約との不整合**: Inspector が指摘した通り、本 worktree の provisional `src/auth.ts` と main の T02 canonical 実装（`AuthResult` discriminated union, `resolveAuth(apiKey?: string)`, `process.exit` 呼び出し）は契約が違う。rebase 時に `src/auth.ts` で conflict が発生し、`src/generate.ts` 側の呼び出しを main 契約に合わせて修正する必要がある（Step 8 semantic resolution で対応）。

## マージ情報

- rebase 後 commit: `e3d2a4b feat: T03 image generation core — src/generate.ts`
- main に ff-only マージ済み（`2200a9a..e3d2a4b`）
- 納品方式: ローカル ff-only マージ
- rebase 時の conflict は `conflict-resolution.md` に記録（`src/auth.ts` add/add conflict を main 側 T02 canonical で解決、`src/generate.ts` を T02 contract に追従修正）
