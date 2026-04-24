Verdict: GO

## Summary

実装は task.md の受け入れ基準 1〜8、design-review の Recommendations 1〜5、CLAUDE.md
の原則すべてに整合。`npm run typecheck` / `npm run build` / `npm test`（36 件）
すべて緑。`src/png.ts`（parse/serialize/buildTextChunk/insertTextChunkBeforeIend
+ 自前 CRC32）と `src/generate.ts` の `writeImage` リファクタ + `buildParametersString` /
`resolveOutputPath` / `resolveMimeType` 新設は plan §2 と完全一致。`--no-embed-metadata`
は commander で `default: ON` 配線。version は 4 箇所すべて `0.3.0`。tsconfig.json
の `exclude` に `src/**/*.test.ts` が入っており dist に test 出力が混入しないことを
`ls dist/` で確認済み。ADC 経路の `location === 'global'` region-less host 分岐 /
認証優先順位 / `[auth] using: ...` print はすべて維持。実機 3 パターンの結果が
summary.md §6 に貼られている。critical / major なし。minor 1 件・nit 数件のみ。

## Checks Run

```
$ git status
On branch task-013-1777021189/task
modified:   .claude-plugin/marketplace.json, .claude-plugin/plugin.json, CHANGELOG.md,
            README.ja.md, README.md, package-lock.json, package.json,
            src/cli.ts, src/generate.ts, tsconfig.json
new:        src/generate.test.ts, src/png.test.ts, src/png.ts

$ git diff --stat HEAD
 10 files changed, 811 insertions(+), 22 deletions(-)
 (+ 3 new test/png files)

$ npm run typecheck
> tsc --noEmit
(exit 0, errors: 0)

$ npm run build
> tsc
(exit 0)
$ ls dist/
auth.js  cli.js  generate.js  png.js
→ dist/*.test.js は存在しない（Recommendation #1 の効果を確認）

$ npm test
# tests 36
# pass 36
# fail 0
（src/png.test.ts 14 件 + src/generate.test.ts 22 件、すべて通過）

$ node dist/cli.js --help
…
  --no-embed-metadata         do not embed AIview-compatible parameters metadata
                              (PNG only; default: embed)
（commander 配線、default ON 確認）

$ cat .npmrc
ignore-scripts=true / audit-level=moderate / save-exact=true
→ tsx 4.21.0 は exact pin、postinstall script なしで整合
```

実 API を叩く課金系コマンドは検品範囲では実行していない（summary §6 の
実装者ログのみ確認）。

## Acceptance Criteria

| # | 基準 | 判定 | 根拠 |
|---|------|:---:|------|
| 1 | PNG tEXt（IEND 直前 / `parameters` / A1111 文字列 / 既存 chunk 不変 / CRC 正 / 非 ASCII） | ○ | `src/png.ts:91-108` `insertTextChunkBeforeIend` が `parsePng` で各 chunk を opaque Buffer 保持し、IEND 直前に新 chunk を挿入後 `serializePng` で全 chunk の CRC 再計算。`src/png.ts:78-89` `buildTextChunk` は keyword を Latin-1、text を `Buffer.from(text, 'utf8')` で書き込み Option B を実装。テスト 14 件で IHDR/IDAT/caBX 保持・CRC validate・非 ASCII round-trip を検証。`buildParametersString` (`src/generate.ts:84-96`) は `<prompt>\n<comma-separated tokens>` の A1111 互換 + personGeneration 条件付き付与。 |
| 2 | JPEG 修正 (mimeType 尊重 / 拡張子補正 / ADC でも mime 確認 / metadata skip 容認) | ○ | `src/generate.ts:108-125` `resolveOutputPath` が `inlineData.mimeType` を優先して `.png`/`.jpg`/`.bin` を決定、不一致時に stderr 警告。`generateViaSdk` (L301) と `generateViaVertexFetch` (L262) の両方で `mimeType` を取り出し `GeneratedImage` として返す（ADC 経路にも適用）。JPEG への metadata 埋め込みはスキップで、追加の stderr warning が出る（L342-347）。`--no-embed-metadata` 指定時は警告も出ない。 |
| 3 | `--no-embed-metadata` (default ON) | ○ | `src/cli.ts:46-49` で commander の `--no-embed-metadata` 配線、ヘルプ出力で `default: embed` を確認。`opts.embedMetadata: boolean` を required で `GenerateOptions` に伝搬 (L74)。 |
| 4 | 構造（writeImage シグネチャ / buildParametersString / src/png.ts） | ○ | `writeImage(desiredOutputPath, imageBytes, mimeType, metadataPayload \| null)` (`src/generate.ts:158-188`)。`buildParametersString` 単体関数化済み。`src/png.ts` 独立モジュール化、外部 import は `src/generate.ts` と test のみ。strict mode 維持 (`tsconfig.json:6`)。 |
| 5 | テスト（buildParametersString / round-trip / AIview 互換根拠） | ○ | `src/png.test.ts` 14 ケース（CRC 既知ベクタ 3 / parse-serialize round-trip / buildTextChunk 3 / insertTextChunkBeforeIend 6（caBX 保持・非 ASCII・CRC 再検証含む）/ bad signature・no IEND throw）。`src/generate.test.ts` 22 ケース（buildParametersString 6 / resolveOutputPath 8 / resolveMimeType 4 / writeImage 4）。AIview 互換性は summary §7 に parser トレース + 実機 PNG chunk 列挙で根拠記述。 |
| 6 | README / README.ja.md / CHANGELOG | ○ | README.md L19-20, L89, L93-113 に Features / Options / Metadata セクション。README.ja.md に同等の日本語版。CHANGELOG.md L6-35 に `[0.3.0] - 2026-04-24` を Added / Fixed / Notes 構造で追加。 |
| 7 | version 4 箇所 `0.3.0` | ○ | `package.json:3`, `.claude-plugin/plugin.json` (version field), `.claude-plugin/marketplace.json` (`plugins[0].version`), `src/cli.ts:18` `.version('0.3.0')` すべて確認。 |
| 8 | typecheck / build / 実機動作 | ○ | typecheck・build いずれも exit 0、`dist/` に test ファイル混入なし。実機 3 パターン（ADC default / AI Studio JPEG / `--no-embed-metadata`）は summary §6 に exiftool / file / chunk 列挙のログ付きで記載。検品では課金系は再実行していない（summary 記載を信頼）。 |

## Recommendations 反映

| # | 内容 | 判定 | 反映場所 |
|---|------|:---:|---------|
| 1 | tsconfig.json `exclude` に `src/**/*.test.ts` | ○ | `tsconfig.json:17` `"exclude": ["node_modules", "dist", "src/**/*.test.ts"]`。`ls dist/` で `*.test.js` が無いことを確認。 |
| 2 | Node 20+ 開発要件を CHANGELOG または README に明記 | ○ | `CHANGELOG.md:32-35` Notes 末尾に「**Development** requires Node 20+ because the test runner uses `node --test --import tsx`」と明記。`README.ja.md:181` にも同様の Development 注記あり。`engines.node` は `>=18` 維持。 |
| 3 | JPEG スキップの一次理由を「ADC/PNG が差別化軸」に差し替え | ○ | summary.md §2「JPEG への metadata 埋め込みは v0.3.0 スコープ外」の最初に「**一次理由**: CLAUDE.md の原則どおり『ADC is the primary axis』…」と記述、supply-chain risk は二次理由に格下げ。CHANGELOG `[0.3.0] Notes` 第 1 ブレットにも同方針記載。 |
| 4 | 実機確認結果を summary.md に貼る | ○ | summary.md §6 に AI Studio JPEG / ADC default / `--no-embed-metadata` の 3 パターンを `file` / `exiftool` / Python による chunk 列挙のログ付きで記載。AIview 実機での開封は §6.4 で「Conductor 推奨、必須ではない」と明示。 |
| 5 | AIview parser の先勝ち検索前提を脚注化 | ○ | summary.md §7「AIview 互換性と先勝ち検索」に MetadataExtractor の動作トレース + 既存 chunk に偶然 `parameters\0` が混ざるリスクの理論的考察 + 「先勝ちなので IEND 直前挿入では救えない理論ケース」を脚注化。 |

## Findings

### critical

なし。

### major

なし。

### minor

1. **`writeImage` での mime 判定の二重防御（src/generate.ts:175-178）**:
   `generate()` 側で既に `payloadForWrite = mimeType === 'image/png' ? payload : null`
   と絞り込んでいるのに、`writeImage` 内でも `metadataPayload !== null && mimeType === 'image/png'`
   と再チェックしている。実害なし（むしろ writeImage を独立に呼んだ場合の安全側
   ガード）だが、設計意図としてどちらが authoritative か summary に 1 行残すと
   後から見て混乱しない。GO 判定の妨げにはならない。

### nit

1. **mkdir エラーメッセージが writeFile と同形（src/generate.ts:166-173）**:
   親ディレクトリ作成失敗時のメッセージが `failed to write ${desiredOutputPath}: ...`
   になっており、ユーザーには「mkdir の失敗」か「write の失敗」かが見分けにくい。
   実害なしだが将来 trace で困ることがあれば差別化を検討。
2. **`tsconfig.json` の `exclude` が `dist` を含むため `src/png.test.ts` を
   `dist/` 配下にコピーするような誤運用には脆い**: 現状の運用では問題なし。nit。
3. **`embedMetadata` の型注釈に `?` がない（src/cli.ts:62）が commander の
   `--no-X` 仕様で常に boolean が入るので OK**。型上 required にしているのは
   むしろ正しい意思表示で、これは positive observation。
4. **`resolveOutputPath('a.png', 'application/octet-stream')` → `.bin` 拡張子の
   挙動は plan §1.2 に書かれた通り**だが、ユーザーが意図的に未知 mime を指定
   するケースはほぼないので nit。

### positive observations（記録のため）

- `src/auth.ts` は無変更。認証優先順位（`--api-key` > `GEMINI_API_KEY` > ADC）と
  `[auth] using: ...` 出力（L9, L15, L50）が CLAUDE.md 原則どおり維持。
- `src/generate.ts:202` の `location === 'global'` 分岐 → `aiplatform.googleapis.com`
  を保持。region-less host を壊していない。
- `src/` 配下に `CLAUDE_PLUGIN_ROOT` 等の Claude Code 固有環境変数の漏れなし
  （grep で 0 件）。
- `.npmrc` の `save-exact=true` / `ignore-scripts=true` に整合した依存追加
  （`tsx@4.21.0` exact pin、postinstall なし）。`@esbuild/*` は `optional: true`
  でプラットフォーム依存解決される設計。
- `package-lock.json` の追加分は `tsx` + 推移依存（esbuild family）のみ。
- README / README.ja.md に `GEMINI_API_KEY` のハードコードなし（`$GEMINI_API_KEY`
  はシェル変数参照のサンプル、これは適切）。

## Fix Required

なし。GO 判定。

minor 1 件・nit 数件はいずれも実害なし or future-self への親切なので、
本タスクのリリース前必須修正ではない。Conductor 判断で次の機会に拾うか、
そのまま `/release 0.3.0` に進めて差し支えない。
