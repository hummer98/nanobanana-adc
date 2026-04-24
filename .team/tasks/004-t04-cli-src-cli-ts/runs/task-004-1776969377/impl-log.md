# T04 Implementation Log — CLI エントリーポイント (`src/cli.ts`)

## 実装概要

T01 で配置されていた空の `src/cli.ts`（shebang + no-op `main()`）を plan.md §4 のとおり
commander ベースの実装に置き換えた。差分の要点:

- `commander` から `Command` / `Option` を ESM named import
- 内部モジュールは `./generate.js`（Node16 moduleResolution の規約）
- `resolveAuth` は直接 import しない（`generate()` 内で呼ばれるため二重実行を避ける）
- オプション定義:
  - `-p, --prompt <text>` → `requiredOption`
  - `-o, --output <path>` → default `output.png`
  - `-a, --aspect <ratio>` → default `1:1`、description に 10 種列挙、ランタイムは `assertAspect()` で narrow
  - `-s, --size <size>` → `new Option().choices(['1K','2K','4K']).default('1K')`
  - `-m, --model <id>` → default `gemini-3-pro-image-preview`
  - `--api-key <key>` → 任意
- `main()` は `program.parse` → `assertAspect(opts.aspect)` → `GenerateOptions` 構築 → `generate()` await
- `main().catch()` で `err.stack ?? err.message` を stderr に書き出し `process.exit(1)`
- shebang `#!/usr/bin/env node` を維持

## 検証結果（すべてパス）

| # | コマンド | 期待 | 実測 |
|---|----------|------|------|
| 1 | `npx tsc --noEmit` | exit 0 / 型エラーゼロ | ✅ exit 0 |
| 2 | `npx tsc && node dist/cli.js --help` | Usage / Options / Defaults 表示、exit 0 | ✅ 既定値（`output.png` / `1:1` / `1K` / `gemini-3-pro-image-preview`）と choices（`1K`,`2K`,`4K`）が表示、exit 0 |
| 3 | `node dist/cli.js -p test -a 7:11` | `assertAspect` が stderr + exit 1 | ✅ `[generate] unsupported aspect: 7:11. supported: ...` を stderr に出力、exit 1 |
| 4 | `node dist/cli.js -p test -s 8K` | commander の `choices` が拒否 exit 1 | ✅ `option '-s, --size <size>' argument '8K' is invalid. Allowed choices are 1K, 2K, 4K.` で exit 1 |

ネットワーク呼び出しは発生していない（aspect エラー・size エラーはいずれも `generate()` 呼び出し前に投げられる）。

## 引っかかった点

特になし。plan.md がそのまま使えた。

- commander 12 の ESM named export は期待どおり動作（`import { Command, Option } from 'commander'`）
- `program.opts<T>()` のジェネリクス指定で `aspect` を一旦 `string` 受けし、`assertAspect` で narrow する設計は plan.md 記載どおりで型エラーなく通った
- `--api-key` のキャメルケース化（`apiKey`）は commander の既定動作どおり、`GenerateOptions.apiKey` と整合

## 作業境界の遵守

- 変更したファイル: `src/cli.ts` のみ
- `package.json` / `tsconfig.json` / 他 src ファイルには触っていない
- 新規ファイル・依存追加なし
- `dist/` は build artifact（`.gitignore` 対象）で commit 対象外
