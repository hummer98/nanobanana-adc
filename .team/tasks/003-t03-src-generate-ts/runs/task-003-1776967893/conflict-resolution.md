# Conflict Resolution — T03 rebase on main

## Context

- taskRunId: `task-003-1776967893`
- branch: `task-003-1776967893/task`
- rebase target: `main`（local、remote なし）
- pre-rebase HEAD: `b837e16955527741e37cc32849b250d537df132b`
- post-rebase HEAD: `e3d2a4b` (feat: T03 image generation core — src/generate.ts)

## 衝突 commit

| role | SHA | summary |
|---|---|---|
| cherry-pick 元 (my branch) | `b837e16` | feat: T03 image generation core — src/generate.ts |
| upstream (main) | `2200a9a` | feat: T02 auth layer — src/auth.ts |

いずれも `src/auth.ts` を新規追加する add/add conflict。

## 衝突ファイル別採用方針

### `src/auth.ts` — **main 側を全面採用**

両ブランチが独立に `src/auth.ts` を新規追加したため add/add conflict。
main 側の T02 canonical 実装を採用し、worktree 側の provisional 実装は破棄。

理由:
- **T02 タスク本文（docs/tasks.md / .team/tasks/002-.../task.md）の受け入れ基準** は「認証失敗時は stderr に出して `process.exit(1)`」を要求している
- main 側 T02 (`2200a9a`) はこの受け入れ基準に厳密に従っている（`failWith` → `process.exit(1)`）
- T03 plan.md §2 は Planner 判断で「throw / no-exit」の契約を定義したが、これは **T02 タスク本文の受け入れ基準との整合性を欠いた Planning の誤り**
- T03 の plan.md §10 自身が「マージ競合時は T02 側を採用」と明記している

結果: `src/auth.ts` = main 側と完全一致（本 rebase 後 `git diff main -- src/auth.ts` は空）

### `src/generate.ts` — **呼び出し側を main の T02 contract に書き換え**

`src/generate.ts` は conflict marker は出していないが、main の T02 contract に合わせて以下を調整:

| 変更点 | 旧 (provisional) | 新 (T02 canonical) |
|---|---|---|
| import 型 | `type ResolvedAuth` | `type AuthResult` |
| 呼び出し | `resolveAuth({ apiKey: options.apiKey })` | `resolveAuth(options.apiKey)` |
| 内部ヘルパ型 | `generateViaVertexFetch(auth: ResolvedAuth, …)` | `generateViaVertexFetch(auth: AdcAuth, …)` (Extract narrowed) |
| 内部ヘルパ型 | `generateViaSdk(auth: ResolvedAuth, …)` | `generateViaSdk(auth: ApiKeyAuth, …)` (Extract narrowed) |
| API キー展開 | `new GoogleGenerativeAI(auth.apiKey!)` | `new GoogleGenerativeAI(auth.apiKey)` (narrowed なので non-null) |

discriminated union の narrowing を活かすことで non-null assertion (`!`) を排除。

### `src/generate.ts` の副次的影響（plan.md §2 との乖離）

plan.md §2 の Planner 想定（`resolveAuth` は throw で返す）は main の T02 canonical では実現されない。T02 は `process.exit(1)` を呼ぶため、T03 `generate()` の catch には到達せず、CLI 層 (T04) で独自に exit code を制御する余地は失われる。**plan.md §2 と T02 本実装の仕様乖離は本 rebase では解消しない**（T02 タスク本文が優先されるため）。T04 実装時にこの挙動差を前提に組めばよい。

## Resolution Strategy

1. `git checkout --ours src/auth.ts` で main 側を採用（rebase 中なので `--ours` が upstream 側）
2. `src/generate.ts` を T02 contract に合わせて 4 箇所修正（import / 呼び出し / 2 ヘルパの型 / non-null 除去）
3. `npx tsc --noEmit` が 0 エラーであることを確認してから `git rebase --continue`

## Verification

### (1) scope_violation 検知

- ALLOWED = `ALL_CONFLICT_FILES ∪ (cherry-pick changes)` = `{src/auth.ts, src/generate.ts}`
- CHANGED (main..HEAD) = `{src/generate.ts}`（src/auth.ts は main と同一に戻したため diff なし）
- EXTRA = ∅（違反なし）

### (2) test

- テストフレームワーク未導入・`.test.ts` 0 個。「tests 無し = 0 fail」扱い

### (3) tsc --noEmit

- 新規エラー 0 件（rebase 前 pass → rebase 後も pass）
- `npm run build` も成功、`dist/auth.js` / `dist/generate.js` 再生成済み

## Iterations

1 回のみ。`src/auth.ts` は `--ours` 一発で解決。`src/generate.ts` の追従修正は 4 エディットで完了し、新たな conflict は発生していない。
