# T13 実装計画 — AIview 互換 tEXt parameters 埋め込み + JPEG 拡張子 bug 修正

対象 worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-013-1777021189`
バージョン: `0.2.0` → `0.3.0` (minor)

この plan は `task.md` の受け入れ基準すべてをカバーするよう組み立てている。実装者は
この plan だけを読んで着手できる想定。

---

## 1. 設計決定

### 1.1 tEXt の非 ASCII 扱い: **Option B（tEXt に UTF-8 バイト直書き）を採用**

- 根拠:
  - AIview `extractFromPNGTextChunk` は抜き出したチャンクデータを
    `String(data: ..., encoding: .utf8)` で復号している。つまり UTF-8 を期待。
    Latin-1 として書くと日本語 / 絵文字のプロンプトが parse 段階で `nil` になり、
    本タスクの主目的（AIview で読めるようにする）を満たせない。
  - Automatic1111 WebUI / ComfyUI / InvokeAI などの de facto 実装も tEXt に
    UTF-8 を直接書いている（PNG 仕様違反だが広くデプロイ済み）。
  - Option A（iTXt に別途書く）はスコープ外で示した「AIview 側の iTXt 対応追加」
    を前提にしてしまい、納品物単独では機能しない。
- 実装上の扱い:
  - `src/png.ts` の tEXt ビルダーは入力文字列を `Buffer.from(str, 'utf8')` で
    バイト化する。Latin-1 変換は行わない。
  - `summary.md` の「設計判断」セクションに上記根拠を記載する。

### 1.2 JPEG 拡張子の補正方式: **a（自動補正 + stderr warning）を採用**

- 根拠:
  - 拡張子不一致のまま保存すると AIview / Finder / 多くの画像ツールが誤認する
    （実害あり）。
  - ユーザーが `-o foo.png` を明示していても、API が JPEG を返す以上 PNG として
    保存するのは不正。変換（c）は依存追加 + 画質劣化で重い。
  - 透明性を担保するため、補正が走ったときは stderr に 1 行 warning を出す
    （`[generate] warning: API returned image/jpeg; saving to foo.jpg instead of foo.png`）。
- `-o` との関係の具体ルール（`src/generate.ts::resolveOutputPath`）:
  1. `inlineData.mimeType` を参照し、`image/png` なら `.png`、`image/jpeg` なら
     `.jpg`、未知 mime なら `.bin` を「期待拡張子」として決定。
  2. ユーザー指定パスの末尾拡張子 (`path.extname`) と期待拡張子を比較:
     - 一致 → そのまま
     - 不一致 or 拡張子なし → `path.extname` 部分を期待拡張子に置換
       （無い場合は末尾に付与）し、stderr に warning を出す
  3. stdout の `[generate] done | output=...` は置換後のパスを出力する
     （実際に書き込んだパスが正。ユーザーが parse しても破綻しない）。
- Note: AI Studio 経路 (`@google/generative-ai` SDK) は 0.24.1 で
  `response.candidates[*].content.parts[*].inlineData.mimeType` を露出しているので
  `src/generate.ts::generateViaSdk` の返り値を「base64 のみ」から
  `{ base64: string; mimeType: string }` に変更する。Vertex 経路も同様。

### 1.3 JPEG への metadata 埋め込み: **v0.3.0 ではスキップ**

- 根拠:
  - `.npmrc` に `ignore-scripts=true` が入っており、ネイティブビルドを伴う
    `sharp` は postinstall が走らず使えない。
  - `piexifjs` は install script を持たないが、dep 追加 = 供給連鎖リスクを広げる。
    「ADC is the primary axis」という CLAUDE.md の原則からして、JPEG 経路は
    API-key モードの fallback であり最優先ではない。
  - 自前 APP1 (EXIF UserComment) 実装は仕様実装量が大きく、本タスクの主目的
    （AIview で PNG が読める）から外れる。
- 結果として JPEG の場合は:
  - 拡張子のみ補正 + warning
  - metadata 埋め込みはスキップ（`warnJpegMetadataSkipped()` で stderr に 1 行
    「metadata embedding skipped for JPEG; use ADC path for PNG + metadata」と
    補足 warning を出す。`--no-embed-metadata` 指定時は沈黙）
- `summary.md` に「JPEG への metadata 埋め込みは v0.3.0 ではスコープ外。将来
  dependency-free な APP1 writer を追加検討」と明記。

### 1.4 `--no-embed-metadata` のデフォルト: **OFF（= デフォルト埋め込む）**

- 根拠:
  - ユーザーは AIview で画像を閲覧する動機でこの repo を使っている。
    トレーサビリティ重視が主ペルソナ。
  - プライバシー配慮のユーザーには「1 フラグで opt-out できる」ことで明示的
    選択肢を与える。
- commander 実装: `.option('--no-embed-metadata', 'do not embed AIview-compatible parameters metadata')`
  - 自動的に `opts.embedMetadata === true` がデフォルト、`--no-embed-metadata`
    渡すと `false`。

### 1.5 CRC32 実装: **自前 table-based CRC32（zlib.crc32 を使わない）**

- 根拠:
  - `zlib.crc32()` は Node.js v22.2.0 追加。`package.json` は `engines: ">=18"`。
    ここを v22 に引き上げるのは minor bump の範囲を超える（破壊的）。
  - CRC32/IEEE はテーブル生成 + ループで 25 行程度。外部 dep 不要。`src/png.ts`
    内で module-level にテーブルをキャッシュして再利用。
- 実装:
  ```ts
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  export function crc32(buf: Buffer): number {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  ```

### 1.6 バージョン整合箇所（0.2.0 → 0.3.0）

以下 4 箇所を同時更新：

| file | 現在値 | 新値 | 行 |
|------|-------|------|----|
| `package.json` `"version"` | `0.2.0` | `0.3.0` | L3 |
| `.claude-plugin/plugin.json` `"version"` | `0.2.0` | `0.3.0` | L3 |
| `.claude-plugin/marketplace.json` `plugins[0].version` | `0.2.0` | `0.3.0` | L12 |
| `src/cli.ts` `.version('0.2.0')` | `0.2.0` | `0.3.0` | L18 |

加えて:
- `CHANGELOG.md` 冒頭に `## [0.3.0] - 2026-04-24` セクションを追加（1.8 参照）
- `README.md` / `README.ja.md` 更新（1.8 参照）
- `package-lock.json` は `npm install` 実行時に自動更新される（version フィールド）

### 1.7 test runner

- `node:test` (built-in) を使う。Node 18.19+ で stable。
- TypeScript 実行には devDependency `tsx` を exact pin で追加。`tsx` は
  postinstall script を持たないので `ignore-scripts=true` と整合する
  （install 時点で実行される lifecycle scripts なし）。
- `package.json` に追加:
  ```json
  "scripts": {
    "test": "node --test --import tsx src/png.test.ts src/generate.test.ts"
  },
  "devDependencies": {
    "tsx": "<exact latest stable>"
  }
  ```
  - glob 依存を避けるため明示列挙。将来増えたら都度追記。
- 代替案: `npm run build` 後に dist 上で実行する方式は、ソースと乖離した
  ビルド物をテストすることになり TDD 的に不利。tsx を入れて素直にする。

### 1.8 ドキュメント更新（受け入れ基準 6）

**CHANGELOG.md**（冒頭に挿入）:
```md
## [0.3.0] - 2026-04-24

### Added
- PNG tEXt metadata embedding: generated PNGs now carry an Automatic1111 / AIview
  compatible `tEXt` chunk with key `parameters`, containing the original prompt
  and CLI options. Readable by `~/git/AIview`, `exiftool`, and any A1111-aware
  viewer. Google's C2PA (caBX), IPTC (zTXt), and XMP (iTXt) chunks are preserved
  — the new chunk is inserted just before `IEND`.
- `--no-embed-metadata` opt-out flag for privacy-sensitive deployments where
  prompt text should not be persisted to the image.

### Fixed
- AI Studio (api-key) path: when the response mime type is `image/jpeg`, the
  output path extension is now auto-corrected (`output.png` → `output.jpg`) and
  a warning is printed to stderr. Previously the JPEG bytes were silently saved
  under `.png`, confusing viewers and `file(1)`.

### Notes
- JPEG metadata embedding is out of scope for this release (the AI Studio path
  returns JPEG and would require an APP1 / APP13 writer). Use the ADC path for
  PNG + metadata. The `--no-embed-metadata` flag is honored on both paths.
- `engines.node` remains `>=18`; CRC32 is computed in-process rather than via
  `zlib.crc32` (Node >=22.2) to preserve Node 18 / 20 compatibility.
```

**README.md** 変更:
- `## Features` にブレット追加: 「AIview / Automatic1111 compatible `tEXt parameters`
  embedded in generated PNGs (opt-out via `--no-embed-metadata`). Google's C2PA /
  SynthID provenance chunks are preserved.」
- `### Options` 表に `--no-embed-metadata` 行を追加（aliases なし、default:
  embedded, description: 「Disable embedding of AIview-compatible `tEXt parameters`
  chunk in PNG output.」）
- 必要なら `## Metadata` という短い H2 セクションを「Authentication」セクション
  手前に追加し、埋め込まれる文字列例を 6 行程度で提示。

**README.ja.md** 変更:
- 同等の内容を日本語で。特徴一覧に「AIview / Automatic1111 互換の `tEXt parameters`
  を生成 PNG に埋め込み（`--no-embed-metadata` で無効化）」、オプション表に
  `--no-embed-metadata` 行追加。

---

## 2. モジュール分割

### 2.1 `src/png.ts`（新規）

新規モジュール。PNG シリアライズに関する知識をここに閉じ込める。
`src/generate.ts` 以外からは import しない。

```ts
export interface PngChunk {
  type: string;          // "IHDR" | "IDAT" | "tEXt" | ... (ASCII 4 chars)
  data: Buffer;          // チャンクデータ（length / crc を含まない）
}

// PNG バイト列を signature + chunk 配列に分解。signature が 89 50 4E 47 … でなければ throw。
export function parsePng(buf: Buffer): { signature: Buffer; chunks: PngChunk[] };

// signature + chunks を再シリアライズ。各チャンクについて crc32(type + data) を再計算する。
export function serializePng(signature: Buffer, chunks: PngChunk[]): Buffer;

// tEXt チャンクを生成。keyword は ASCII（latin-1）に限定、text は UTF-8 バイトで書く。
// keyword が 1..79 bytes / 非 null 以外を含む場合は throw。
export function buildTextChunk(keyword: string, text: string): PngChunk;

// 既存 PNG バッファに対して、IEND 直前に tEXt チャンクを 1 つ挿入した新しいバッファを返す。
// 既存チャンク（IHDR / zTXt / iTXt / caBX / IDAT / IEND など）は順序・内容を保ったまま保持する。
// IEND が存在しない入力は throw。
export function insertTextChunkBeforeIend(buf: Buffer, keyword: string, text: string): Buffer;

// 単体テスト向けに export（default export にはしない）。
export function crc32(buf: Buffer): number;
```

不変条件 / impl notes:

- `parsePng` はすべてのチャンクを不透明な `Buffer` として保持する。中身の
  解釈はしない。これで Google の `caBX` / `iTXt` (XMP) / `zTXt` (IPTC) を
  破壊なく通過させられる。
- `serializePng` のチャンクフォーマット: `[length BE u32][type 4B][data][crc BE u32]`。
  CRC 入力は `type + data`（length は含まない）。PNG 仕様どおり。
- `insertTextChunkBeforeIend` は最後の `IEND` チャンクの直前に挿入。
  複数 `IEND` が現れる不正 PNG の場合も最後（＝ parse で得た最後の要素）の
  直前に入れる方が安全だが、仕様上 `IEND` は 1 個なので通常ケースで十分。
- CRC32 は `crc32()`（1.5 参照）を使う。

### 2.2 `src/generate.ts` の変更

- `writeImage()` のシグネチャを更新:
  ```ts
  async function writeImage(
    desiredOutputPath: string,
    imageBytes: Buffer,
    mimeType: string,
    metadataPayload: string | null, // null なら埋め込みスキップ
  ): Promise<{ actualPath: string }>;
  ```
  返り値の `actualPath` で拡張子補正後のパスを返す（logging に使う）。

- 新規 helper（同ファイル内に配置。本ファイル 1 箇所でしか使わないので分離不要）:
  ```ts
  export function buildParametersString(opts: {
    prompt: string;
    sizePx: number;               // 1024 / 2048 / 4096
    model: string;
    aspect: GenerateAspect;
    personGeneration?: PersonGeneration;
  }): string;
  ```
  出力フォーマット（受け入れ基準 1 準拠）:
  ```
  <prompt>\n
  Steps: 1, Sampler: gemini, Size: <W>x<H>, Model: <model>, Aspect: <aspect>[, Person generation: <mode>]
  ```
  - 先頭 1 行目 = `prompt`（prompt 自身に改行があってもそのまま出力、A1111 の
    仕様通り）
  - 2 行目 = カンマ区切り。personGeneration が未指定ならその token 自体を省略
    （余計な `, ` もなし）
  - 単体で副作用を持たない pure function。テスト容易。

- `resolveOutputPath(userPath: string, mimeType: string): { path: string; warning: string | null }`
  を同ファイル内に新設。1.2 節のルールを実装。

- 呼び出し箇所:
  - `generateViaVertexFetch` / `generateViaSdk` の返り値を
    `{ base64: string; mimeType: string }` に統一
  - `generate()` で:
    1. `resolveOutputPath` でパス決定、warning があれば `process.stderr.write`
    2. `embedMetadata && isPng(mime)` なら `buildParametersString` → `insertTextChunkBeforeIend` で buf を作る
    3. JPEG で `embedMetadata === true` なら JPEG metadata skip warning を stderr に出す
    4. `writeImage(actualPath, buf, mimeType, payload)` でファイル書き込み
    5. `[generate] done` ログは `actualPath` を出力

- `GenerateOptions` に `embedMetadata: boolean` を追加（required）。
  - CLI から常に明示値が渡るので optional にしない。default は cli 側で決める。

### 2.3 `src/cli.ts` の変更

- `.version('0.2.0')` → `.version('0.3.0')`
- `.option('--no-embed-metadata', 'do not embed AIview-compatible parameters metadata')`
  を追加
- `program.opts<...>()` の型に `embedMetadata: boolean` を追加
  （commander の `--no-X` の挙動: default `true`, 指定時 `false`）
- `generateOptions` に `embedMetadata: opts.embedMetadata` を渡す

### 2.4 触らないファイル

- `src/auth.ts`: 認証優先順位を壊さない（CLAUDE.md「認証優先順位」）。
- `bin/nanobanana-adc`: shebang dispatcher。変更不要。
- `.claude-plugin/plugin.json` の hooks / skills 定義: version のみ。

---

## 3. PNG チャンク挿入の具体的手順

### 3.1 parse アルゴリズム（`parsePng`）

```
input: Buffer
1. signature = buf.subarray(0, 8). 0x89 50 4E 47 0D 0A 1A 0A と一致しなければ throw。
2. offset = 8, chunks = []
3. while offset < buf.length:
   a. length = buf.readUInt32BE(offset)
   b. type   = buf.subarray(offset+4, offset+8).toString('latin1')  // ASCII 4 chars
   c. data   = buf.subarray(offset+8, offset+8+length)
   d. crc    = buf.readUInt32BE(offset+8+length)
   e. (任意) crc を verify し、壊れていたら throw（テスト時 useful）
   f. chunks.push({ type, data })
   g. offset += 12 + length
   h. if type === 'IEND' and offset === buf.length: break
4. 末尾が IEND でない、or offset が buf.length と一致しないなら throw
5. return { signature, chunks }
```

### 3.2 serialize アルゴリズム（`serializePng`）

```
1. parts = [signature]
2. for c in chunks:
   len  = Buffer.alloc(4); len.writeUInt32BE(c.data.length)
   type = Buffer.from(c.type, 'latin1')  // 4 bytes
   crc  = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, c.data])))
   parts.push(len, type, c.data, crc)
3. return Buffer.concat(parts)
```

### 3.3 tEXt チャンク構築（`buildTextChunk`）

- keyword は `parameters`（ASCII、9 bytes）固定だが API としては任意に受ける。
- data = `<keyword bytes> + 0x00 (null separator) + <text utf-8 bytes>`
- return `{ type: 'tEXt', data }`

### 3.4 挿入（`insertTextChunkBeforeIend`）

```
1. { signature, chunks } = parsePng(buf)
2. iendIdx = chunks.findIndex(c => c.type === 'IEND')
   // 通常は最後。findIndex でも lastIndexOf でも結果は同じ前提。
3. if iendIdx < 0 throw
4. newChunk = buildTextChunk(keyword, text)
5. newChunks = [...chunks.slice(0, iendIdx), newChunk, ...chunks.slice(iendIdx)]
6. return serializePng(signature, newChunks)
```

「既存チャンクを破壊しない」の担保:
- parse/serialize は各チャンクを opaque Buffer として保持するだけ
- CRC は再計算するが、`type + data` が同一なら CRC も同一。Google の caBX 等の
  内容は 1 bit も変えない。
- 順序は挿入位置以外変えない（IEND 直前への 1 要素挿入だけ）。

### 3.5 既存 PNG チャンクの保持（受け入れ基準 1 「破壊しない」の証明）

Google 由来の PNG は `IHDR → zTXt → iTXt → caBX → IDAT*N → IEND` の構造
（`/tmp/nanobanana-adc-postrebase.png` で実測）。挿入後は
`IHDR → zTXt → iTXt → caBX → IDAT*N → tEXt(parameters) → IEND` となる。
- C2PA / SynthID の provenance 署名対象は画素データ（IDAT 連鎖）+ 既存チャンクの
  バイトシーケンスに依存するが、我々は IEND 直前に追加しているだけで、既存
  チャンクのバイトは変えない。C2PA の hash は IDAT までのバイト範囲 or manifest
  内の specifc assertions を対象にするので、末尾付加は理論的に影響しない。
  リスク節（§6）で再確認。

---

## 4. 実装順序（TDD）

**順序は依存関係に沿って最下層から積む。各ステップで red → green → commit。**

### step 0: 開発環境整備
1. `npm install` で node_modules を worktree に展開（bootstrap）
2. `tsx` を exact pin で `devDependencies` に追加し `npm install`（これで
   package-lock.json が更新される）
3. `package.json` に `"test"` script を追加

### step 1: CRC32 と PNG helpers のテスト（`src/png.test.ts`）
- `crc32` の known vector テスト:
  - `crc32(Buffer.from('IHDR' + <13 known bytes>))` を既知値と比較（Python
    `zlib.crc32` で事前計算した値を hard-code）
  - 空 buffer → 0
- `parsePng` → `serializePng` の round-trip テスト:
  - 最小 PNG を in-memory で構築（`makeMinimalPng()` ヘルパ）。IHDR + 1x1 IDAT
    (`zlib.deflateSync(Buffer.alloc(3)).slice(...)` で作れる) + IEND
  - `serializePng(parsePng(buf))` が同一バイト列を返すことを assert
- `buildTextChunk('parameters', 'hello')`:
  - `data` = `parameters\0hello` の UTF-8 バイトと等しい
  - type が `'tEXt'`
- `insertTextChunkBeforeIend`:
  - 結果バッファを再度 `parsePng` した chunk 列で、tEXt が IEND の直前にあり
    その data が `parameters\0<text utf-8>` であること
  - 挿入前後で IHDR / IDAT / IEND の data Buffer が一致（`.equals()`）
  - 非 ASCII text（例 `こんにちは 🌸`）でも IEND 直前に入り、再 parse 時に
    UTF-8 で復号できること
- fixture 案: **checked-in 不要**。テスト内で合成 PNG を作る。
  - ただし caBX 相当（private chunk）を保持することの回帰テストとして、
    `makeFakePngWithPrivateChunk()` で `caBX` チャンクをランダムデータで
    埋めた擬似 Google PNG を作り、insertTextChunkBeforeIend 後も caBX data が
    byte-for-byte 保持されることを assert する。

### step 2: `buildParametersString` のテスト（`src/generate.test.ts`）
各組み合わせ:
- 最小（prompt + 1K + aspect 1:1 + モデル既定）
  → `"a cat\nSteps: 1, Sampler: gemini, Size: 1024x1024, Model: gemini-3-pro-image-preview, Aspect: 1:1"`
- personGeneration 指定あり → 末尾に `, Person generation: ALLOW_ADULT` が付く
- 2K 指定 → `Size: 2048x2048`、4K 指定 → `Size: 4096x4096`
- 非正方形 aspect (16:9) 指定 → `Aspect: 16:9` が出る。Size は SIZE_PX × SIZE_PX
  （API が返す実サイズは長辺基準だが、v0.3.0 では単純化し SIZE_PX 正方値を書く。
  aspect で long-side / short-side 算出すべきかは将来改善候補。summary に
  明記）
- prompt が日本語 → 文字列がそのまま（Latin-1 変換しない）
- prompt 内改行が保持される

### step 3: `resolveOutputPath` のテスト（`src/generate.test.ts` 内）
- `('a.png', 'image/png')` → `{ path: 'a.png', warning: null }`
- `('a.png', 'image/jpeg')` → `{ path: 'a.jpg', warning: /returned image\/jpeg/ }`
- `('a.jpg', 'image/jpeg')` → `{ path: 'a.jpg', warning: null }`
- `('dir/a.PNG', 'image/jpeg')` → `{ path: 'dir/a.jpg', warning: /.../ }` （大小区別しない）
- `('a', 'image/png')` → `{ path: 'a.png', warning: /.../ }` （拡張子なし、補完 + warning）
- `('a.webp', 'image/png')` → `{ path: 'a.png', warning: /.../ }`
- 未知 mime (`'application/octet-stream'`) → `.bin` に補正 + warning

### step 4: `writeImage` 統合（既存コードの差し替え）
- `writeImage` にテストは書かない（単純な fs 操作）。代わりに
  `tmp` ディレクトリへ実書き込みする integration test を 1 つ:
  - 合成 PNG を作り `writeImage` で書き出し、読み戻して tEXt parameters が
    入っていること / IDAT 等が保持されていることを検証。

### step 5: `generate()` の結線
- ここは実 API を叩かないため別途のテストは書かない。手動確認は受け入れ基準 8
  に委ねる（§5.2）。

### step 6: `src/cli.ts` 修正 + `program.opts` 型更新

### step 7: version / docs / changelog 更新

### step 8: final check
- `npm run typecheck` → 0 errors
- `npm run build` → dist/ 生成成功
- `npm test` → 全 pass
- `bin/nanobanana-adc --help` で `--no-embed-metadata` が表示される

### 実テスト実行コマンド

```bash
npm install           # tsx の同期
npm test              # node --test --import tsx で *.test.ts 実行
npm run typecheck
npm run build
node dist/cli.js --help
```

ad-hoc で 1 ファイル動かすなら:
```bash
node --test --import tsx src/png.test.ts
```

---

## 5. テスト方針

### 5.1 ユニット / 自動テスト（受け入れ基準 5 の自動化可能部分）

| 受け入れ基準 | テスト対象 | ファイル |
|-------------|-----------|---------|
| 1. tEXt が IEND 直前に入る | `insertTextChunkBeforeIend` で挿入後の chunk 順 | `src/png.test.ts` |
| 1. key = `parameters` | tEXt の keyword bytes を assert | `src/png.test.ts` |
| 1. Auto1111 互換文字列 | `buildParametersString` の golden string 比較 | `src/generate.test.ts` |
| 1. 既存チャンクを破壊しない | caBX / IDAT / IHDR の data Buffer equals | `src/png.test.ts` |
| 1. CRC32 正しい | parse→insert→serialize→parse で全 chunk CRC validate | `src/png.test.ts` |
| 1. 非 ASCII UTF-8 | 日本語 prompt を insert → 再 parse で UTF-8 復号 | `src/png.test.ts` |
| 2. 拡張子自動補正 | `resolveOutputPath` の全分岐 | `src/generate.test.ts` |
| 3. `--no-embed-metadata` | `cli.ts` 側は手動確認（commander の default false 挙動の型検査で十分） | 手動 |
| 4. 型エラーゼロ | `tsc --noEmit` | CI |

### 5.2 実機確認（受け入れ基準 8 = 課金が発生する）

自動テストでは実 API を叩かない（CLAUDE.md やらないこと「課金が発生する実モデル
呼び出しを CI のデフォルトパスで回さない」に従う）。実機確認は 3 回のみ:

1. ADC 経路、default（埋め込み有効）:
   ```bash
   nanobanana-adc -p "a cat in space" -o /tmp/t13-adc.png
   exiftool /tmp/t13-adc.png | grep -i parameters
   python3 -c "import struct; d=open('/tmp/t13-adc.png','rb').read()[8:]; i=0
   while True:
     l=struct.unpack('>I',d[i:i+4])[0]; t=d[i+4:i+8].decode('latin-1'); print(t,l)
     if t=='IEND': break
     i+=12+l"
   ```
   期待: `exiftool` で `Parameters: a cat in space\nSteps: 1, Sampler: gemini, Size: 1024x1024, Model: gemini-3-pro-image-preview, Aspect: 1:1` が読める。
   python 出力で `IHDR → ... → tEXt → IEND` の順序。

2. AI Studio 経路、`-o bug.png` 指定で JPEG を受け取るケース:
   ```bash
   GEMINI_API_KEY=... nanobanana-adc -p "a cat in space" -o /tmp/t13-aistudio.png
   ```
   期待: stderr に `[generate] warning: API returned image/jpeg; saving to /tmp/t13-aistudio.jpg instead of /tmp/t13-aistudio.png`。
   stdout の `[generate] done | output=/tmp/t13-aistudio.jpg` が出る。
   `file /tmp/t13-aistudio.jpg` → `JPEG image data`。
   `/tmp/t13-aistudio.png` は作られていない。

3. `--no-embed-metadata` 指定:
   ```bash
   nanobanana-adc -p "private prompt" -o /tmp/t13-noembed.png --no-embed-metadata
   exiftool /tmp/t13-noembed.png | grep -i parameters || echo "(expected: no parameters field)"
   ```
   期待: `exiftool` 出力に `Parameters` が出ない。

### 5.3 AIview 互換性の根拠（受け入れ基準 5 の最後）

AIview `extractFromPNGTextChunk` のロジック（`MetadataExtractor.swift:170-216`）:
1. `parameters\0` バイト列を全体から検索
2. その手前に `tEXt` チャンク type（4 bytes）を探す
3. `tEXt` の 4 bytes 前の BE u32 を chunk length として読み取り
4. `parameters\0` の直後から `tEXt` + chunk_length の範囲を UTF-8 decode

我々の出力は PNG 仕様どおりの `[len][tEXt][parameters\0<utf-8 text>][crc]`
フォーマットなので、AIview の手順すべてに適合する:
- 検索パターン `parameters\0` が唯一ヒット
- その手前 4 bytes は `tEXt`
- length は data 長（= 10 + text バイト長）が書かれている
- UTF-8 decode は Option B のおかげで成功

実機互換確認: 受け入れ基準 8-2 相当で `/tmp/t13-adc.png` を
`~/git/AIview/AIview.app` で開いて prompt 欄が表示されれば確認完了。
Conductor が実施するか否かは summary.md で「要手動確認（推奨、必須ではない）」
と明記。

### 5.4 PNG fixture 作成方針

- バイナリ fixture を repo にコミットしない。`src/png.test.ts` 内で
  `makeMinimalPng()` / `makeFakePngWithPrivateChunk()` を合成する。
  - 1x1 の IDAT は `zlib.deflateSync(Buffer.from([0x00, 0xFF, 0xFF, 0xFF]))` の
    ようにハードコード、または事前計算した 14 bytes の known-good IDAT を使用。
  - CRC は 1.5 節の自前 `crc32()` で計算して埋める（dogfooding）。
- `/tmp/nanobanana-adc-postrebase.png` は開発時検証用途に留め、テストでは
  参照しない（.team 外に置く、または一切触れない）。

---

## 6. リスクと mitigations

### 6.1 Google C2PA provenance 署名への影響

- リスク: 既存 `caBX` / `zTXt` / `iTXt` の順序やバイトを変えると SynthID /
  C2PA manifest の署名検証が失敗する可能性。
- mitigation:
  - 既存チャンクは一切変更しない（parse/serialize は opaque Buffer 保持）。
  - IEND 直前にのみ追加。C2PA v1.3 spec では「IEND 以降の付加は検証対象外」
    「既存 chunk の挿入位置は末尾で構わない」が一般的（assertion hash は
    対象 asset の特定バイト範囲で計算）。
  - 万一検証が落ちた場合の fallback は `--no-embed-metadata` で opt-out できる
    こと。summary に「実機で `c2patool verify` を回して regression ないか
    1 回確認推奨」と書く。

### 6.2 `@google/generative-ai` SDK の mimeType フィールド

- リスク: SDK 0.24.1 が `inlineData.mimeType` を返さないケース。
- mitigation:
  - fallback: mimeType が `undefined` の場合は base64 先頭数バイトで
    magic number 判定（`0x89 0x50 0x4E 0x47` なら PNG、`0xFF 0xD8 0xFF` なら
    JPEG）。どちらでもないなら `'application/octet-stream'` として扱う。
  - この fallback は `resolveMimeType(candidate, fallbackFromMagic)` ヘルパとして
    `src/generate.ts` に置く。unit test 対象に含める。

### 6.3 CRC32 の off-by-one / 符号バグ

- リスク: `>>> 0` の位置を間違えると負の数が出て PNG 破損。
- mitigation: 既知 vector テスト（IHDR chunk の既知 CRC を Python で事前計算
  して hard-code）で red→green を確認。1.5 節の実装は標準テーブル + IEEE
  0xEDB88320 多項式なので zlib.crc32 と bit-identical。

### 6.4 tEXt への UTF-8 直書きで外部ツールが混乱

- リスク: `exiftool` が Latin-1 として表示してしまう可能性（非 ASCII 部分が
  mojibake に見える）。
- mitigation: AIview 用途が最優先。exiftool での見た目は二次情報。
  CHANGELOG / README に「UTF-8 を直接埋め込む（A1111 互換）」と明記し
  誤解を回避。

### 6.5 依存追加（tsx）の供給連鎖

- リスク: tsx (esbuild 依存) が install script を持つ可能性。
- mitigation: `.npmrc` の `ignore-scripts=true` があるので install script は
  そもそも走らない。esbuild のバイナリは postinstall で展開されないが、
  ランタイム利用では `require.resolve('esbuild-<platform>')` 等で解決される。
  実装時点で `tsx --test` が worktree で動くことを確認してから dep 追加。
  もし動かなければ tsx を諦めて dist 経由の test に切り替える。

### 6.6 CI への影響

- 現行 `ci.yml` は `npm test` を呼んでいない可能性（package.json の `"test"`
  script が未定義のため）。`"test"` を追加することで CI が red にならないか
  確認 → 確認の上、必要なら `ci.yml` に test step を追加。本 plan では
  変更範囲にスコープインする（README の Development セクションで `npm test`
  に言及するなら CI にも入れるのが妥当）。実装者判断で CI 更新可否を決定し、
  summary に記載。

### 6.7 AIview 側のテスト実行

- 受け入れ基準 5 の `~/git/AIview/AIviewTests/MetadataExtractorTests.swift`
  との互換性は、当リポからは xcodebuild を走らせられない前提。テストファイル
  のフォーマット要件（`parameters` keyword, UTF-8 text）だけ参照し、我々の
  出力が合致していることを summary で根拠立てする。実機での AIview.app 起動
  確認は Conductor 判断。

---

## 7. 作業チェックリスト（実装者向け）

- [ ] bootstrap: `cd` to worktree, `npm install`
- [ ] step 0: `tsx` 追加、`package.json` scripts.test 追加
- [ ] step 1: `src/png.ts` + `src/png.test.ts`（red → 実装 → green）
- [ ] step 2: `buildParametersString` + テスト
- [ ] step 3: `resolveOutputPath` + `resolveMimeType` + テスト
- [ ] step 4: `writeImage` シグネチャ変更 + generate.ts 結線 + integration test
- [ ] step 5: SDK / Vertex 各 generator の返り値を `{ base64, mimeType }` へ変更
- [ ] step 6: `src/cli.ts` に `--no-embed-metadata` + version bump
- [ ] step 7: README / README.ja.md / CHANGELOG 更新
- [ ] step 8: `package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` の version を 0.3.0 に
- [ ] step 9: `npm run typecheck` / `npm run build` / `npm test` すべて green
- [ ] step 10: 実機確認 3 パターン（§5.2）、結果を summary.md に貼る
- [ ] step 11: `summary.md` を書いて conductor 完了処理へ

---

## 8. スコープ外の再確認

- リリース (`git tag v0.3.0` / push / OIDC publish): 本タスク完了後に別途 `/release 0.3.0`
- AIview 側の iTXt 対応: 別リポ、今回は触らない
- 画像編集 / バッチ生成 / MCP: seed.md で引き続きスコープ外
- JPEG への metadata 埋め込み: v0.3.0 ではスキップ（§1.3）。将来 issue 化
- `ci.yml` への test step 追加: 実装者判断（§6.6）
