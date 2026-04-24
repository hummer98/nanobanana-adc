# T04: CLI エントリーポイント (src/cli.ts) — Summary

## 完了したサブタスク

- Phase 1 Planner: `plan.md` 作成
- Phase 3 Implementer: `src/cli.ts` 実装（T01 の空実装を置き換え）
- Phase 4 Inspector: 受け入れ基準 11 項目と実機検証 6 ケースをパス、判定 GO

## 変更ファイル

- `src/cli.ts` — commander 12 ベースの CLI 実装（shebang 維持、内部 import は `.js` 拡張子）

## 実装のハイライト

- `commander` の `Command` / `Option` を ESM named import
- `--prompt` は `requiredOption`、`--size` は `choices(['1K','2K','4K'])` で静的制限、`--aspect` は `assertAspect()` でランタイム narrowing
- `resolveAuth()` は CLI から直接呼ばず、`generate()` 内部の呼び出しに委ねて二重認証を回避
- エラーは `main().catch()` に集約し、`err.stack ?? err.message` を stderr に出力して `process.exit(1)`

## 検証結果（Inspector 実機確認）

| # | コマンド | 期待 | 結果 |
|---|----------|------|------|
| 1 | `npx tsc --noEmit` | exit 0 | ✅ |
| 2 | `node dist/cli.js --help` | Usage/Options/Defaults、exit 0 | ✅ |
| 3 | `node dist/cli.js --version` | `0.1.0` + exit 0 | ✅ |
| 4 | `node dist/cli.js` | `--prompt` 欠落エラー + exit 1 | ✅ |
| 5 | `node dist/cli.js -p test -a 7:11` | `assertAspect` エラー + exit 1 | ✅ |
| 6 | `node dist/cli.js -p test -s 8K` | choices 拒否 + exit 1 | ✅ |

## 成果物

- マージコミット: `50bcfaf` (ff-only into main)
- ブランチ: `task-004-1776969377/task`
- マージ先: `main`
