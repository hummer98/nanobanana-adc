# T13 実装サマリ — AIview 互換 tEXt parameters 埋め込み + JPEG 拡張子 bug 修正

バージョン: `0.2.0` → `0.3.0` (minor)
worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-013-1777021189`
branch: `task-013-1777021189/task`

## 1. 変更ファイル一覧

### 新規
- `src/png.ts` — PNG parse / serialize / tEXt 挿入 + 自前 CRC32（IEEE
  0xEDB88320、テーブルベース）。
- `src/png.test.ts` — 14 ケースのユニットテスト（crc32 known vector, parse/
  serialize round-trip, buildTextChunk, insertTextChunkBeforeIend、non-ASCII
  UTF-8、caBX 保持、CRC 再検証、IEND 欠落エラーなど）。
- `src/generate.test.ts` — 22 ケース（`buildParametersString`・
  `resolveOutputPath`・`resolveMimeType`・`writeImage` integration）。

### 変更
- `src/generate.ts` — `writeImage` シグネチャを
  `(desiredOutputPath, imageBytes, mimeType, metadataPayload|null)` にリファクタ。
  `buildParametersString` / `resolveOutputPath` / `resolveMimeType` を新設。
  SDK / Vertex 各 generator の返り値を `{ base64, mimeType }` に変更。
  `generate()` で拡張子補正 → mime→embed 判定 → `writeImage` の順で結線。
  `GenerateOptions.embedMetadata: boolean` を required で追加。
- `src/cli.ts` — `.option('--no-embed-metadata', ...)` を追加、`.version('0.3.0')`
  に引き上げ、`program.opts<...>()` に `embedMetadata: boolean` を追加し
  `GenerateOptions` に伝搬。
- `package.json` — version `0.3.0`、`scripts.test`
  (`node --test --import tsx src/png.test.ts src/generate.test.ts`)、
  `devDependencies.tsx: "4.21.0"` を exact pin で追加（`save-exact=true` と
  整合、postinstall script なし = `ignore-scripts=true` と整合）。
- `package-lock.json` — `tsx` とその推移依存の追加分のみ（`npm install` で
  自動生成）。
- `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` — version
  `0.3.0`。
- `tsconfig.json` — `exclude` に `"src/**/*.test.ts"` を追加（test が npm
  publish の `dist/` に混入しないようにする。Recommendation #1）。
- `CHANGELOG.md` — `[0.3.0] - 2026-04-24` セクションを追加。Added / Fixed /
  Notes 構造。
- `README.md` / `README.ja.md` — Features / Options 表 / Metadata セクション /
  Development セクション（Node 20+ 開発要件の明記）を更新。

## 2. 設計判断の記録

### Option B（tEXt に UTF-8 バイト直書き）を採用
- 根拠: AIview `MetadataExtractor.swift:210` の `extractFromPNGTextChunk` は
  `String(data: parameterData, encoding: .utf8)` で復号する。Latin-1 で
  書くと日本語・絵文字を含むプロンプトが parse 段階で `nil` になり、本
  タスクの主目的（AIview でプロンプトが読める）を満たさない。
- 実装: `src/png.ts::buildTextChunk` は `Buffer.from(text, 'utf8')` で
  バイト化。Latin-1 変換は一切しない。keyword 部分のみ ASCII 扱い。
- 参考: Automatic1111 WebUI の `modules/images.py::save_image_with_geninfo`
  も同様に PIL 経由で tEXt に UTF-8 バイトを書き込んでおり、de facto で
  互換性が確立している。

### JPEG 拡張子の自動補正 + stderr warning（方式 a）
- 根拠: 拡張子と中身の不一致はすべてのビューアで誤認の原因になる。
  `-o foo.png` を明示していても、API が JPEG を返す以上 PNG として保存
  するのは不正。変換（方式 c）は依存追加 + 画質劣化で重い。
- 実装: `src/generate.ts::resolveOutputPath` で `inlineData.mimeType` を
  参照して拡張子を決定（`image/png` → `.png`、`image/jpeg` → `.jpg` / `.jpeg`
  は許容、未知 mime → `.bin`）。現在の拡張子（大小無視）が許容集合に無ければ
  置換し、stderr に `[generate] warning: API returned image/jpeg; saving to
  .../X.jpg instead of .../X.png` を出す。`[generate] done | output=...` は
  補正後のパス。
- mime 欠落に備え `resolveMimeType(declared, sample)` が PNG（magic
  `89 50 4E 47 0D 0A 1A 0A`）/ JPEG（magic `FF D8 FF`）を先頭バイトで
  判定し、どちらでも無ければ `application/octet-stream` を返す。

### JPEG への metadata 埋め込みは v0.3.0 スコープ外
- **一次理由**: CLAUDE.md の原則どおり「ADC is the primary axis」であり、
  ADC 経路が返す PNG への metadata 埋め込みこそが本 repo の差別化軸。
  JPEG を返す AI Studio (api-key) 経路は fallback であり、その道への
  APP1 / APP13 writer 投資は優先度が低い。PNG 経路を robust に仕上げる
  ことを優先した（Recommendation #3 反映）。
- 二次理由: `sharp` は ネイティブビルドが `.npmrc: ignore-scripts=true`
  と噛み合わない。`piexifjs` は純 JS だが dep 追加は供給連鎖のリスクを
  広げる。自前 APP1 (EXIF UserComment) の実装はスコープが大きい。
- 挙動: JPEG の場合、拡張子のみ補正 + warning。`embedMetadata === true`
  のときは補足 warning
  `[generate] warning: metadata embedding skipped for non-PNG output
  (mime=image/jpeg); use the ADC path for PNG + metadata`
  を stderr に出す。`--no-embed-metadata` 指定時はこの warning は出さない。

### `--no-embed-metadata` のデフォルトは OFF（= デフォルト埋め込む）
- 根拠: ユーザーは AIview で画像を閲覧する動機で本 CLI を使っており、
  トレーサビリティ重視が主ペルソナ。プライバシー配慮は 1 フラグで
  opt-out 可能。
- commander の `.option('--no-embed-metadata', ...)` を使用。
  無指定時 `embedMetadata: true`、`--no-embed-metadata` 指定時 `false`。

### CRC32 は自前 table-based 実装（`zlib.crc32` を使わない）
- 根拠: `zlib.crc32()` は Node.js v22.2.0 追加。`package.json: engines >=18`
  を minor bump の範囲で維持したい（エンドユーザー Node 18/20 互換性）。
- 実装: `src/png.ts` の `CRC_TABLE` (256 エントリ)＋`crc32(buf)`
  （IEEE 0xEDB88320）。既知ベクタ `"123456789" = 0xCBF43926` と、
  IHDR(1x1 RGB) = 0x907753DE をテストで検証（`zlib.crc32` の出力と一致）。

## 3. Recommendations 1〜5 の反映箇所

| # | 内容 | 反映箇所 |
|---|------|---------|
| 1 | `tsconfig.json` の `exclude` に `"src/**/*.test.ts"` 追加 | `tsconfig.json` L17。`npm run build` 後 `dist/` に `png.js` / `generate.js` / `cli.js` / `auth.js` のみが残ることを確認。 |
| 2 | 開発時 Node 20+ 要件を明記 | `CHANGELOG.md` の `[0.3.0] Notes` 末尾に記載。`README.md` `Development` / `README.ja.md` `開発` セクションにも 1 行追加。`engines.node` は `>=18` のまま維持。 |
| 3 | JPEG スキップの一次理由を「ADC/PNG が差別化軸」に差し替え | 本 summary §2「JPEG への metadata 埋め込みは v0.3.0 スコープ外」、および `CHANGELOG.md` [0.3.0] Notes の最初の箇条書き。supply-chain risk は二次理由として格下げ。 |
| 4 | 実機確認の責務と summary.md 貼り付け要件 | 本 summary §6 に「ADC default」「AI Studio JPEG」「`--no-embed-metadata`」の 3 パターンの実行結果（`exiftool` / `file` / PNG チャンク列挙）を貼った。課金発生は本実装者が許容範囲で実行した（各 1 枚、合計 3 枚）。 |
| 5 | AIview parser の先勝ち検索前提を summary に脚注化 | 本 summary §7「AIview 互換性と先勝ち検索」に記載。 |

## 4. テスト結果

### `npm test`（最終）
```
# tests 36
# suites 0
# pass 36
# fail 0
# cancelled 0
# skipped 0
# todo 0
```
内訳:
- `src/png.test.ts` 14 件
  - `crc32`: empty / known vector `"123456789"` = 0xCBF43926 / IHDR 1x1 RGB
    = 0x907753DE の 3 件
  - `parsePng` bad signature throw
  - `parsePng` / `serializePng` round-trip byte-identical
  - `buildTextChunk` null separator + UTF-8 verbatim + keyword validation の 3 件
  - `insertTextChunkBeforeIend`: IEND 直前配置 / IHDR・IDAT・IEND 保持 /
    caBX 保持（private chunk byte-for-byte）/ 非 ASCII UTF-8 round-trip /
    CRC 再検証 / IEND 欠落 throw の 6 件
- `src/generate.test.ts` 22 件
  - `buildParametersString`: 最小 / personGeneration / 2K・4K / 非正方 aspect /
    非 ASCII / 改行 prompt の 6 件
  - `resolveOutputPath`: 一致 / PNG→JPEG 補正 / JPG 一致 / JPEG 一致 /
    大文字拡張子 / 無拡張子 / webp 誤指定 / 未知 mime の 8 件
  - `resolveMimeType`: 宣言優先 2 件 / PNG magic / JPEG magic / 未知 の 4 件
  - `writeImage`: PNG 埋め込み / null skip / JPEG 非埋め込み / 親 dir 作成 の
    4 件

### `npm run typecheck`
```
> nanobanana-adc@0.3.0 typecheck
> tsc --noEmit
(exit 0, errors: 0)
```

### `npm run build`
```
> nanobanana-adc@0.3.0 build
> tsc
(exit 0)
$ ls dist/
auth.js
cli.js
generate.js
png.js
```
→ Recommendation #1 のとおり `dist/*.test.js` が生成されていない。

### `node dist/cli.js --help` 抜粋
```
--no-embed-metadata         do not embed AIview-compatible parameters metadata
                            (PNG only; default: embed)
```

## 5. 受け入れ基準 1〜8 のチェック状況

| # | 基準 | 状態 | 根拠 |
|---|------|------|------|
| 1 | PNG tEXt 埋め込み（IEND 直前 / `parameters` / A1111 互換文字列 / 既存チャンク非破壊 / CRC 正 / 非 ASCII 対応） | ✅ | `src/png.ts::insertTextChunkBeforeIend` ユニット 6 件 + 実機 ADC 生成の chunk 列挙 `IHDR → zTXt → iTXt → caBX → IDAT*N → tEXt → IEND`。Option B（UTF-8 直書き）採用、理由は §2。 |
| 2 | JPEG 拡張子補正 + `inlineData.mimeType` 尊重 + ADC 経路の念のため対応 + JPEG metadata は skip 容認 | ✅ | `src/generate.ts::resolveOutputPath`（test 8 件 + 実機 AI Studio 実行で warning と `.jpg` 保存を確認）。JPEG metadata 埋め込みは summary §2 のとおりスコープ外（task.md の "summary に明記すれば OK" を満たす）。 |
| 3 | `--no-embed-metadata` (default: ON) | ✅ | `src/cli.ts` の commander `--no-embed-metadata` + `GenerateOptions.embedMetadata: boolean`（default `true`、実機確認で opt-out 時に tEXt 非生成を確認）。 |
| 4 | `writeImage` のリファクタ / `buildParametersString` / `src/png.ts` / 型エラーゼロ・strict | ✅ | `src/generate.ts` リファクタ、`src/png.ts` 新設、`tsc --noEmit` 0 errors、既存 `tsconfig.json` の `"strict": true` 維持。 |
| 5 | テスト各種 | ✅ | `buildParametersString` 6 件、PNG round-trip + 挿入テスト 14 件、AIview 互換性根拠は §7 + 実機確認。 |
| 6 | README / README.ja.md / CHANGELOG 更新 | ✅ | 本 run の diff 参照。`--no-embed-metadata` 行追加、Metadata セクション新設、CHANGELOG `[0.3.0]` セクション追加。 |
| 7 | 4 箇所の version を `0.3.0` に揃える | ✅ | `package.json` L3 / `.claude-plugin/plugin.json` L3 / `.claude-plugin/marketplace.json` L12 / `src/cli.ts` `.version('0.3.0')`。`package-lock.json` の `"version"` は `npm install` で追従済み。 |
| 8 | `npm run typecheck` / `npm run build` / 実機動作確認 | ✅ | §4 の結果、および §6 の 3 パターン実機ログ。 |

## 6. 実機動作確認

本実装者は `GEMINI_API_KEY` と ADC（gcloud application-default credentials
+ `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION`）が揃っていたため、
3 パターンすべてを実行済み（課金発生。各 1 枚、合計 3 枚の生成）。

### 6.1 AI Studio 経路（`-o foo.png` で JPEG 受け取り）

```bash
$ node dist/cli.js -p "a tiny origami crane on a desk" -o /tmp/t13-adc.png
[auth] using: api-key
[generate] warning: API returned image/jpeg; saving to /tmp/t13-adc.jpg instead of /tmp/t13-adc.png
[generate] warning: metadata embedding skipped for non-PNG output (mime=image/jpeg); use the ADC path for PNG + metadata
[generate] done | output=/tmp/t13-adc.jpg | model=gemini-3-pro-image-preview | elapsed_ms=19024

$ file /tmp/t13-adc.jpg
/tmp/t13-adc.jpg: JPEG image data, JFIF standard 1.01, resolution (DPI), density 300x300,
segment length 16, baseline, precision 8, 1024x1024, components 3

$ ls /tmp/t13-adc.png 2>&1
ls: /tmp/t13-adc.png: No such file or directory
```

→ 期待どおり `.png` ファイルは作成されず、`.jpg` に補正。stderr に 2 行
warning（拡張子補正 + metadata skip）。stdout は `output=...jpg`。

### 6.2 ADC 経路（default = embed metadata）

`GEMINI_API_KEY` が環境にあると認証優先順位 1 で api-key が当たるため、
ADC 経路検証時のみ `env -u GEMINI_API_KEY` で ADC を強制。

```bash
$ env -u GEMINI_API_KEY node dist/cli.js -p "a tiny origami crane on a desk" -o /tmp/t13-adc.png
[auth] using: adc
[generate] done | output=/tmp/t13-adc.png | model=gemini-3-pro-image-preview | elapsed_ms=36514

$ file /tmp/t13-adc.png
/tmp/t13-adc.png: PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced

$ exiftool /tmp/t13-adc.png | grep -iE "parameters|mime|image size"
MIME Type                       : image/png
Parameters                      : a tiny origami crane on a desk.Steps: 1, Sampler: gemini, Size: 1024x1024, Model: gemini-3-pro-image-preview, Aspect: 1:1
Image Size                      : 1024x1024
```

（`exiftool` は tEXt 内の改行を `.` に置換して表示する仕様。バイト列
レベルでは `a tiny origami crane on a desk\nSteps: 1, Sampler: gemini, ...`
の 2 行が保持されている。下記 chunk 列挙でも確認。）

チャンク列挙（Python `struct`）:

```
IHDR  len=13
zTXt  len=137
iTXt  len=647
caBX  len=7605
IDAT  len=8192  (× 多数)
...
tEXt  len=132
IEND  len=0
```

→ Google の `zTXt (IPTC)` / `iTXt (XMP)` / `caBX (C2PA)` がいずれも
保持され、我々の `tEXt parameters` が IDAT 列の末尾、IEND の直前に 1 つだけ
挿入されていることを確認。

### 6.3 `--no-embed-metadata` 指定

```bash
$ env -u GEMINI_API_KEY node dist/cli.js -p "a single origami crane" \
    -o /tmp/t13-noembed.png --no-embed-metadata
[auth] using: adc
[generate] done | output=/tmp/t13-noembed.png | model=gemini-3-pro-image-preview | elapsed_ms=32781

$ file /tmp/t13-noembed.png
/tmp/t13-noembed.png: PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced

$ exiftool /tmp/t13-noembed.png | grep -i parameters || echo "(expected: no parameters field)"
(expected: no parameters field)

$ python3 -c "... chunk list ..."
unique chunks in order: ['IHDR', 'zTXt', 'iTXt', 'caBX', 'IDAT', 'IEND']
has tEXt? False
```

→ tEXt チャンク無し。既存チャンク（zTXt/iTXt/caBX）は引き続き保持。

### 6.4 AIview 実機での表示確認

本実装者は macOS での `~/git/AIview/AIview.app` 起動まで行っていない。
受け入れ基準 5 の「AIview が自分の画像を読めるはずという根拠」は §7 の
parser 挙動トレース + PNG 出力バイト列の仕様適合で担保。最終確認として
Conductor または Reviewer 側で `/tmp/t13-adc.png` を AIview で開いて
prompt 欄に `a tiny origami crane on a desk` が表示されれば完了
（推奨、必須ではない）。

## 7. AIview 互換性と先勝ち検索（Recommendation #5 脚注）

AIview `MetadataExtractor.swift::extractFromPNGTextChunk` は次の順で動く:

1. PNG バイト全体から `parameters\0` のバイト列を検索（先頭から最初の
   ヒットを採用 = 先勝ち検索）。
2. その手前 4 バイトを `tEXt` type フィールドとして解釈。
3. 更にその前 4 バイトを BE u32 の chunk length として読み取り。
4. `parameters\0` の直後から `length - (10)` バイトを UTF-8 decode。

我々が出力する PNG では:
- `tEXt parameters` チャンクは IEND 直前に 1 つだけ挿入され、
  `[len BE u32][tEXt][parameters\0<UTF-8 text>][crc BE u32]` の素直な形。
- data 部の keyword `parameters` + `\0` は PNG 仕様どおり。
- Google の既存チャンク（`zTXt` IPTC / `iTXt` XMP / `caBX` C2PA）の中に
  偶然 `parameters\0` のバイト列が含まれるケースは理論的にはあり得る:
  - `iTXt` (XMP) は `parameters="..."` を持ち得るが、XMP の構文上
    `parameters` の直後は `=` / `"` / 空白であり `\0` は現れない。
  - `zTXt` (IPTC) は deflate 圧縮されており、復号前のバイト列に
    `parameters\0` のリテラルが混ざる確率は実用上無視できる。
  - `caBX` (C2PA, JUMBF) は binary/CBOR で、キーワード
    `parameters` + NUL byte が連続する確率は同じく無視できる。
- 仮に既存チャンクに `parameters\0` が現れた場合でも、**AIview は先勝ち
  検索なので、より前（IDAT 群より前）の既存チャンクがヒットしてしまう
  リスクが理論上ある**（後勝ちではない）。この場合、我々の tEXt が IEND
  直前にあっても AIview は古いマッチを採用する。実運用上このパスは
  ほぼ起こらない想定だが、将来 mis-detection が報告されたら AIview 側で
  `tEXt` chunk 境界を先に確立してから keyword を検索する実装に
  切り替えるのが正攻法。本 repo 側は仕様どおりの PNG を出力することで
  最大限の互換性を担保する。

## 8. スコープ外（確認）

- リリース (`git tag v0.3.0` / push / `/release 0.3.0` / `npm publish`)
  は実施していない。Conductor 側で別途 `/release 0.3.0` で実施する。
- AIview 側の iTXt 対応は別リポ。触っていない。
- 画像編集 / バッチ生成 / MCP も触っていない。
- `ci.yml` への `npm test` ステップ追加は、今回は見送り（設計レビュー
  §6.6 で「実装者判断」とされていた）。CI 整備は別タスク候補。

## 9. 作業境界

- 作業はすべて `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-013-1777021189`
  または `.team/tasks/013-t13-aiview-text-parameters-jpeg-bug/runs/task-013-1777021189/`
  配下で実施。main ブランチには触っていない。
- コミット / push / merge は未実施（Conductor 側で実施予定）。
- 実機生成の成果物（`/tmp/t13-*.png`, `/tmp/t13-aistudio.jpg`）は worktree
  外なのでそのまま残置。Conductor が不要になった時点で削除可。
