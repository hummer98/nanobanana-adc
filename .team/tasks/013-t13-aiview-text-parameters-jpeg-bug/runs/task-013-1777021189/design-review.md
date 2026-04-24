Verdict: Approved

## Summary

plan.md は task.md の受け入れ基準 1〜8 を網羅し、新規 `src/png.ts`（parse/serialize/
buildTextChunk/insertTextChunkBeforeIend + 自前 CRC32）と `src/generate.ts` の
`writeImage` リファクタ、`resolveOutputPath`、`buildParametersString` へのモジュール
分解を提示。非 ASCII tEXt は Option B（UTF-8 直書き）、JPEG は拡張子自動補正 +
metadata 埋め込みスキップ、CRC32 は zlib 依存を避けて自前テーブル実装、`--no-embed-metadata`
は commander の `--no-X` 既定 ON、version bump は 4 箇所。TDD は最下層（png ヘルパ）
から最上層（cli 結線）へと積む順序。

## Strengths

1. **Option B の根拠が強い**: AIview `MetadataExtractor.swift:210` が
   `String(data: parameterData, encoding: .utf8)` で復号しているのを正しく
   把握している。Latin-1 で書くと日本語プロンプトは `nil` になり目的を満たさない、
   という推論が妥当。
2. **CRC32 を自前実装に落とした判断**: `zlib.crc32` は Node 22.2+ だが
   `engines: ">=18"` の下限を維持するため自前テーブル（IEEE 0xEDB88320）を
   採用。minor bump で engines を引き上げる破壊を避けるという理由付けが
   CLAUDE.md（配布経路の整備を優先する原則）と整合。
3. **opaque Buffer 保持による既存チャンク不変の保証**: `parsePng` が
   各チャンクを解釈せず Buffer のまま通すため、Google の caBX / zTXt / iTXt は
   byte-for-byte で保持され、C2PA 署名リスクを最小化できる設計。serializePng
   で CRC を再計算しても `type + data` が同一なので CRC も bit-identical。
4. **version bump 箇所が網羅されている**: `package.json` / `.claude-plugin/plugin.json`
   / `.claude-plugin/marketplace.json` / `src/cli.ts` の 4 箇所を L 番号付きで列挙。
   CHANGELOG [0.3.0] も Added / Fixed / Notes の構造で提示済み。
5. **「Fail loudly」原則の踏襲**: JPEG 拡張子補正時に stderr に 1 行 warning、
   stdout の done ログは補正後のパスを出すルールが CLAUDE.md の「認証モード
   を常に printfする」思想と整合。

## Findings

### A. 受け入れ基準の網羅性

- **(nit)** 基準 1〜8 はすべてカバーされている。不足なし。

### B. 設計判断の妥当性

- **(minor) piexifjs を退けた根拠が弱い**: §1.3 は「supply-chain risk」を
  挙げるが、piexifjs は純 JS で postinstall なし、`.npmrc` の `ignore-scripts=true` /
  `save-exact=true` に技術的には整合する。task.md も依存追加を明示的に許容して
  いる。実際の主因は CLAUDE.md の優先順位で JPEG 経路が「API-key モードの
  fallback」であることだと思われるので、summary.md ではそちら（＝「差別化軸は
  ADC/PNG。JPEG への投資は優先度が低い」）を一次理由として書いた方が説得力
  が増す。現状の plan で blocker ではないが、論拠を差し替える推奨。
- **(nit) AIview parser の落とし穴**: AIview は「先頭から最初の
  `parameters\0`」→「その手前の最初の `tEXt`」を探すため、もし Google の
  既存チャンクの data 内に偶然 `parameters\0` のバイト列が含まれると mis-parse
  する理論リスクがある。実用上 caBX (JSON-like) / zTXt (deflate) / iTXt (XMP,
  `parameters=`) のいずれも該当しないはずだが、plan §5.3 の「検索パターン
  `parameters\0` が唯一ヒット」の主張に軽い脚注を付け、PNG fixture 合成時に
  「既存 private chunk に `parameters\0` を含めても、我々の tEXt が IEND 直前
  に来ることで後勝ちで壊れるが、幸い AIview は先勝ち検索なので安全側」という
  前提を summary に明記すると親切。
- **(nit) Option B の de facto 互換性の出典**: §1.1 で「A1111 / ComfyUI /
  InvokeAI も tEXt に UTF-8 を直接書いている」と主張しているが出典がない。
  summary.md で A1111 の stable-diffusion-webui `modules/images.py`
  `save_image_with_geninfo` あたりの関数名を添えると、引き継ぎや将来の
  re-review で根拠を追跡しやすい。

### C. モジュール分割とテスト容易性

- **(minor) test ファイルの tsconfig 配置が未記述**: 現在の `tsconfig.json` は
  `"include": ["src/**/*.ts"]` なので、`src/png.test.ts` / `src/generate.test.ts`
  を置くと `tsc` が `dist/png.test.js` / `dist/generate.test.js` を生成し、
  `package.json` の `"files": ["dist/", ...]` によって npm publish 時に
  **テストまで同梱される**。実害はサイズ増と潜在的な混乱。
  - 対策（いずれか）: (1) `tsconfig.json` に
    `"exclude": ["node_modules", "dist", "src/**/*.test.ts"]` を追加、
    (2) test を `tests/` 配下に移して `include` を修正、
    (3) 別 tsconfig（`tsconfig.build.json`）で production build を分離。
  - plan §2.1 で `src/png.ts` 以外からは import しないと書いてあるが、test は
    当然 import するので言い回しも併せて修正推奨。
- **(minor) `tsx` + `--import` の Node 要件と engines の関係**: plan §1.7 は
  `node --test --import tsx` を推奨する。`--import` フラグは Node 20+ が安定、
  Node 18 では未サポート。`engines.node: ">=18"` は「CLI を実行するユーザー」の
  下限であり、開発 / CI の Node 要件は別物。CI matrix は 20/22/24 なので CI は
  通るが、plan と summary.md で「**開発**時は Node 20+ が必要」と 1 行明記する
  と将来 Node 18 環境で試した開発者が詰まらない。

### D. リスクと漏れ

- **(minor) 実機確認のログを summary.md にどう残すか**: 基準 8 は課金発生する
  ので自動化しない旨は §5.2 / §6 で合意済みだが、summary.md に「ADC × default」
  「AI Studio × JPEG」「default × --no-embed-metadata」の 3 実行について
  `exiftool` / `file` 出力を貼ること、および「要手動確認」を明示する合意が
  plan 本体に書かれていない。Conductor が実行するのか実装者が実行するのかを
  §5.2 末尾に 1 行足すと運用が明確になる。
- **(nit) `/tmp/nanobanana-adc-postrebase.png` の取り扱い**: §5.4 で
  「開発時検証用途に留め、テストでは参照しない」と明記されている。良い。
  ただし「既存 PNG の IHDR → zTXt → iTXt → caBX → IDAT*N → IEND」という
  §3.5 の構造把握は `/tmp/nanobanana-adc-postrebase.png` の観察から来ており、
  将来の読者が再現できるよう「この順序は実測値」と summary に注記しておくと
  後追いしやすい。
- **(nit) package-lock.json の扱い**: §1.6 は `npm install` で自動更新とするが、
  `tsx` を追加する場合 lock diff が大きく PR レビュー負荷が上がる。CI が
  `npm audit signatures` を走らせるので supply-chain チェックは効くが、
  summary.md で「tsx + 推移依存の増分を確認済み」と一文あると安心。

### E. 実装順序（TDD）の合理性

- **(nit)** step 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 の依存方向（png ヘルパ →
  pure 関数 → path 解決 → writeImage 結線 → SDK 結線 → cli → docs → 最終
  check）は健全で下層から上層に積んでいる。YAGNI 違反も見当たらない
  （`buildParametersString` は §4 step 2 で最小組み合わせから入り、personGeneration
  分岐は別ケースで追加する形）。
- **(nit) §6.5 の tsx 検証タイミング**: 「実装時点で `tsx --test` が worktree で
  動くことを確認してから dep 追加」は正しい順序だが、step 0（bootstrap）と
  step 1（png.ts 実装）の間に「tsx 動作検証」のサブステップを明示するとより
  安全。具体的には step 0 の最後に
  `node --test --import tsx - <<<'import test from "node:test"; test("sanity", () => {});'`
  のような smoke を入れる合意を plan に書いておくと、dep 追加 PR が誤って
  merge される事故を防げる。

## Recommendations

Approved 判定だが、実装前に以下 5 点を plan か summary に反映すると
downstream の摩擦が大幅に減る（いずれも非破壊な改善）:

1. **tsconfig の `exclude` を plan §2.1 か §4 step 0 に明記**: `"src/**/*.test.ts"`
   を除外しないと npm publish に test が混入する。
2. **Node 20+ が開発要件である旨を CHANGELOG の Notes か README の Development
   セクションに 1 行追加**: `engines` は維持、dev 要件だけ別途。
3. **JPEG スキップの一次理由を「ADC/PNG が差別化軸」に差し替え**: supply-chain
   risk は二次理由。CLAUDE.md の優先順位と揃える。
4. **実機確認の責務（Conductor or 実装者）と summary.md への貼り付け要件を
   §5.2 末尾に 1 行で確定**: 「ADC default / AI Studio JPEG / --no-embed-metadata
   の 3 実行結果（exiftool / file 抜粋）を summary.md に貼る」。
5. **AIview parser の先勝ち検索前提を summary に脚注化**: Google 既存チャンク
   に `parameters\0` のバイト列が含まれないこと、および含まれても我々の tEXt
   が IEND 直前にあるため parse 順序は AIview の挙動次第である点を記録。
