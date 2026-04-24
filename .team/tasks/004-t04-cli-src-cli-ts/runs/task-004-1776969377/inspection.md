# T04 Inspection Report — CLI エントリーポイント (`src/cli.ts`)

## 1. 検品サマリ

**判定: GO**

- 受け入れ基準 11 項目すべてを実機検証でパス
- `npx tsc --noEmit` / `--help` / `--version` / 必須欠落 / aspect 不正 / size 不正 の挙動は plan.md 記載の期待動作と一致
- 作業境界の逸脱なし（変更は `src/cli.ts` のみ）
- plan.md からの逸脱なし

ただし **1 点の注意事項（ブロッカーではない）** として、`src/cli.ts` の変更がまだコミットされていない（git status 上は modified）。plan.md §11 のコミットステップが未完了なので、Implementer または後続フェーズでコミットが必要。

---

## 2. 受け入れ基準チェック表

| # | 項目 | 期待 | 実測 | 判定 |
|---|------|------|------|------|
| 1 | commander ベース実装 | `new Command()` 利用 | `src/cli.ts:3,11` で `Command` / `Option` を ESM named import、`new Command()` を使用 | ✅ GO |
| 2 | `--prompt` / `-p`（必須） | `requiredOption`、欠落時 exit != 0 | `src/cli.ts:17` で `.requiredOption`、欠落時 stderr + exit 1（実測済） | ✅ GO |
| 3 | `--output` / `-o`（既定 `output.png`） | 既定値正しく、`--help` 表示 | `src/cli.ts:18` で既定 `'output.png'`、`--help` に `(default: "output.png")` 表示 | ✅ GO |
| 4 | `--aspect` / `-a`（既定 `1:1`） | 既定値正しく、不正値でエラー | `src/cli.ts:19-23` で既定 `'1:1'`、`7:11` 入力で `assertAspect` が exit 1（実測済） | ✅ GO |
| 5 | `--size` / `-s`（既定 `1K`） | 既定値・choices・不正値拒否 | `src/cli.ts:24-28` で `.choices(['1K','2K','4K']).default('1K')`、`8K` 入力で commander が exit 1（実測済） | ✅ GO |
| 6 | `--model` / `-m`（既定 `gemini-3-pro-image-preview`） | 既定値正しい | `src/cli.ts:29`、`--help` に反映済 | ✅ GO |
| 7 | `--api-key`（任意、キャメルケース化） | 任意、`apiKey` にマップ | `src/cli.ts:30` で `.option` のみ（required 指定なし）、`opts.apiKey` として受信（コード `src/cli.ts:41,52`） | ✅ GO |
| 8 | `--help` | exit 0 で Usage / Options / Defaults 表示 | 実測で Usage / 全 Options / 全 Defaults / choices が表示、exit 0 | ✅ GO |
| 9 | `GenerateOptions` に正しく詰めて `generate()` 呼び出し | 型一致、プロパティ対応 | `src/cli.ts:46-55` で `GenerateOptions` 構築、6 プロパティすべて対応（`prompt`/`output`/`aspect`/`size`/`model`/`apiKey`）。`size` は `as GenerateSize` で narrow、`aspect` は `assertAspect` で narrow | ✅ GO |
| 10 | 未捕捉例外時 stderr + `process.exit(1)` | stderr に書き出し exit 1 | `src/cli.ts:58-62` で `main().catch()`、`err.stack ?? err.message` を `process.stderr.write`、`process.exit(1)`。aspect 不正の実測で動作確認済 | ✅ GO |
| 11 | `npx tsc --noEmit` 0 exit | 型エラーゼロ | 実測 exit 0 | ✅ GO |

---

## 3. 実装品質観点

| 観点 | 結果 |
|------|------|
| shebang `#!/usr/bin/env node` | ✅ `src/cli.ts:1` に存在 |
| 内部 import の `.js` 拡張子 | ✅ `./generate.js`（`src/cli.ts:9`）。Node16 moduleResolution 規約に適合 |
| `resolveAuth()` の CLI 直接呼び出し回避 | ✅ `auth.ts` を import していない（二重認証の懸念なし。`generate()` 内部の `resolveAuth(options.apiKey)` に委譲、`src/generate.ts:181`） |
| strict / ES2022 正当性 | ✅ `tsc --noEmit` が通過。`program.opts<T>()` のジェネリクス指定で `aspect: string` 受け → `assertAspect` narrow という plan.md 通りの型フロー |
| plan.md からの逸脱 | ✅ なし。§4.1〜§4.4 のコードとほぼ逐語一致 |

### 補足観察

- commander 12 の ESM named export（`Command` / `Option`）が期待通り動作
- `--api-key` のキャメルケース変換（`apiKey`）は `GenerateOptions.apiKey` と整合（追加マッピング不要、plan.md §7 通り）
- `main()` 内で try/catch せず、すべて `.catch()` に集約する設計は plan.md §4.4 通り
- `--help` / `--version` は commander が自動で exit 0、独自 `.catch()` は発火しない（plan.md §10.6 通り）

---

## 4. 作業境界観点

| 観点 | 結果 |
|------|------|
| 変更ファイル | `src/cli.ts` のみ（`git diff --stat` で確認、`1 file changed, 55 insertions(+), 4 deletions(-)`） |
| `package.json` 変更 | なし（`git diff package.json` 空） |
| `tsconfig.json` 変更 | なし（`git diff tsconfig.json` 空） |
| `src/auth.ts` 変更 | なし |
| `src/generate.ts` 変更 | なし |
| 新規ファイル追加 | なし（`dist/` は gitignore 済みビルド生成物） |

**補足**: 検品時点で `src/cli.ts` の変更は **未コミット**（working tree に modified 状態で存在）。plan.md §11 のステップ 5「コミット」が未実施。

---

## 5. 実機検証ログ

作業ディレクトリ: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-004-1776969377`

### 5.1 `npx tsc --noEmit`

```
EXIT=0
```

出力なし、型エラーゼロ。期待通り。

### 5.2 `npx tsc`（dist 生成）

```
EXIT=0
# dist/auth.js, dist/cli.js, dist/generate.js が生成
```

### 5.3 `node dist/cli.js --help`

```
Usage: nanobanana-adc [options]

Gemini 3 Pro Image CLI with ADC support

Options:
  -V, --version         output the version number
  -p, --prompt <text>   prompt text (required)
  -o, --output <path>   output file path (default: "output.png")
  -a, --aspect <ratio>  aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3,
                        21:9, 9:21, 5:4) (default: "1:1")
  -s, --size <size>     image size (choices: "1K", "2K", "4K", default: "1K")
  -m, --model <id>      model id (default: "gemini-3-pro-image-preview")
  --api-key <key>       Gemini API key (falls back to GEMINI_API_KEY / ADC)
  -h, --help            display help for command
EXIT=0
```

Usage / 全 Options / 全 Defaults / choices 表示、exit 0。期待通り。

### 5.4 `node dist/cli.js --version`

```
0.1.0
EXIT=0
```

plan.md §10.2 通りのハードコード値。期待通り。

### 5.5 `node dist/cli.js`（`--prompt` 欠落）

```
error: required option '-p, --prompt <text>' not specified
EXIT=1
```

commander が自動で stderr にエラー、exit 1。期待通り。

### 5.6 `node dist/cli.js -p test -a 7:11`（不正 aspect）

```
Error: [generate] unsupported aspect: 7:11. supported: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, 5:4
    at assertAspect (file://.../dist/generate.js:24:15)
    at main (file://.../dist/cli.js:20:5)
    ...
EXIT=1
```

`assertAspect` が例外 → `main().catch()` が stack trace を stderr に書き出し exit 1。`generate()` 呼び出し前に終了（ネットワーク未発火）。期待通り。

### 5.7 `node dist/cli.js -p test -s 8K`（不正 size）

```
error: option '-s, --size <size>' argument '8K' is invalid. Allowed choices are 1K, 2K, 4K.
EXIT=1
```

commander の `.choices()` が拒否、exit 1。期待通り。

### 5.8 `git diff --stat`

```
 src/cli.ts | 59 +++++++++++++++++++++++++++++++++++++++++++++++++++++++----
 1 file changed, 55 insertions(+), 4 deletions(-)
```

`src/cli.ts` のみ変更。

---

## 6. 指摘事項

### 6.1 Fix Required

**なし**。受け入れ基準および実装品質の観点で致命的な欠陥は検出されなかった。

### 6.2 Observation（任意）

- **コミット未実施**: plan.md §11 のステップ 5「コミット」が未完了。`src/cli.ts` は modified のまま working tree に存在。Merger / Conductor フェーズで `feat: T04 CLI entry point — src/cli.ts` として commit する想定と判断すれば問題なし。判定上はブロッカーではない（受け入れ基準にコミット完了が明記されていない）。

---

## 7. 良かった点

1. **plan.md への忠実な実装**: §4.1〜§4.4 のコードサンプルとほぼ逐語一致。逸脱の判断を恣意的に入れずプラン通りに仕上げている。
2. **`resolveAuth()` の二重呼び出し回避**: plan.md §10.1 の判断を踏襲し、`auth.ts` を CLI から import していない。受け入れ基準の文言と実装の最適解にズレがあった箇所を正しく処理している。
3. **型安全性**: `program.opts<T>()` のジェネリクス指定で `aspect: string` と受けて `assertAspect` で narrow、`size: string` を `as GenerateSize` で narrow という plan.md §5 の設計を型エラーなしで実装。
4. **`--help` 出力の UX**: `--aspect` の description に 10 種列挙、`--size` の choices を commander に委譲という使い分けで、ユーザ向けの情報量が十分確保されている。
5. **エラーハンドリングの設計**: `main()` 内で try/catch せず `main().catch()` に集約。commander の `CommanderError`（`--help` / `--version` / `requiredOption` 欠落）は commander 側の exit に委ね、カスタム例外のみ独自 catch で処理という責任分離が明快。
6. **shebang 保持**: T01 の shebang を置き換え後も維持、T05 の `bin/` 配線に備えられている。

---

## 判定

**GO** — 全受け入れ基準（11 項目）および実機検証 6 ケースをパス、plan.md からの逸脱なし、作業境界の逸脱なし。T04 は受け入れ可能。
