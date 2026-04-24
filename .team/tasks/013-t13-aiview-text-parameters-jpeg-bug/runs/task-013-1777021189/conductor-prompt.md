# タスク割り当て

## タスク内容

---
id: 013
title: T13: 生成画像に AIview 互換メタデータ (tEXt parameters) を埋め込む + JPEG 拡張子 bug 修正
priority: medium
created_by: surface:724
created_at: 2026-04-24T08:47:46.890Z
---

## タスク
~/git/AIview の MetadataExtractor と互換なフォーマットで、生成画像にプロンプトと CLI オプションを埋め込む。さらに AI Studio 経路で JPEG が .png 拡張子で保存される既存 bug も同タスクで直す。v0.3.0 として minor bump する前提。

## 背景
現状 `src/generate.ts:writeImage()` は API が返した base64 をそのまま書き出すのみで、プロンプト・オプション情報を画像に残さない。Google 側は C2PA / IPTC / SynthID を自動付与するが、プロンプト文字列は含まれない。

ユーザーは ~/git/AIview というビューアでこの画像を閲覧する想定で、AIview は Automatic1111 WebUI 互換の `tEXt parameters` チャンクを読む。そこで同フォーマットを出力側で埋め込む。

## 参考（必ず読むこと）
- `~/git/AIview/AIview/Sources/Domain/MetadataExtractor.swift`
  - `extractFromPNGTextChunk`: `tEXt` チャンクで key `parameters` を検索
  - `extractFromXMP`: XMP の `parameters="..."` 属性にフォールバック
  - `parsePrompt`: `Negative prompt:` と `Steps:` をセパレータに分割
- PNG 仕様: https://www.w3.org/TR/png/ の tEXt / iTXt / CRC

## 受け入れ基準

### 1. PNG メタデータ埋め込み
- [ ] PNG 出力時に `tEXt` チャンク (key=`parameters`) を IEND 直前に挿入
- [ ] チャンクデータは Automatic1111 互換文字列:
  ```
  <prompt>
  Steps: 1, Sampler: gemini, Size: <W>x<H>, Model: <model>, Aspect: <aspect>[, Person generation: <mode>]
  ```
  - 先頭行が prompt（改行で区切る）
  - Negative prompt は今の API が未対応なので基本省略。将来対応時に備えて書式だけ残す
  - `Steps: 1, Sampler: gemini` はダミー値だが、AIview の parsePrompt が `Steps:` をセパレータとして期待するため必須
  - `Size: <W>x<H>` は `SIZE_PX` を参照（1K → 1024x1024 等）
  - `Person generation:` は指定時のみ出力
- [ ] 既存チャンク（`caBX` C2PA / `zTXt` IPTC / `iTXt` XMP）を**破壊しない**（Google の provenance 情報を保持）
- [ ] CRC32 を正しく計算（Node.js 標準 `zlib.crc32` または自前実装）
- [ ] 非 ASCII プロンプトの扱いを決定:
  - 選択肢 A: `tEXt` は Latin-1 なので、非 ASCII は `iTXt` (UTF-8) で別途出力（AIview は現状 iTXt を読まないので見えないが、仕様的に正しい）
  - 選択肢 B: `tEXt` に UTF-8 バイトをそのまま書く（PNG 仕様違反だが、AIview は読める）
  - 実装者が根拠を示して選択し、summary.md に理由を記載

### 2. JPEG 経路の修正
現状 AI Studio (api-key) 経路は `image/jpeg` を返すのに `.png` 拡張子で保存される bug がある（ADC 経路は PNG）。
- [ ] API レスポンスの `inlineData.mimeType` を尊重し、以下のいずれかで対応:
  - a. 出力パスの拡張子を自動補正（`output.png` → `output.jpg`）
  - b. MIME と拡張子の不一致を stderr に warning として出し、そのまま保存
  - c. 拡張子を維持して中身も合わせる（JPEG → PNG 変換は重い、推奨しない）
  - → **a 推奨**。ユーザー指定 `-o` との関係は実装者判断で決め、summary に書く
- [ ] JPEG に対してはメタデータを EXIF UserComment に書く（ライブラリ依存を避けるなら APP13 / APP1 を自前で扱うか、sharp / piexifjs 等の**軽量**な dep を検討）
  - 依存追加する場合は `.npmrc` の `save-exact=true` と `ignore-scripts=true` に整合するものに限る
  - 依存追加を避けたい場合は、JPEG に対してはメタデータ埋め込みをスキップしても OK（summary に明記）
- [ ] ADC 経路でも念のため `inlineData.mimeType` を確認（常に PNG のはずだが、将来変更に備える）

### 3. CLI オプション
- [ ] `--no-embed-metadata` (default: 埋め込む) で opt-out できる
  - 企業環境でプロンプトを画像に残したくないケースへの配慮
  - デフォルト ON がトレーサビリティ重視、デフォルト OFF がプライバシー重視。**デフォルト ON 推奨**（ユーザーが AIview で読む意図があるため）

### 4. 型と実装構造
- [ ] `src/generate.ts` の `writeImage()` を、`buf + mimeType + metadataPayload` を受ける形にリファクタ
- [ ] メタデータ組み立ては `src/generate.ts` 内に専用関数 `buildParametersString(options)` を作って単体テスト可能にする
- [ ] PNG チャンク挿入ロジックは `src/png.ts` のような独立モジュールに切る（テスト容易性）
- [ ] 型エラーゼロ、strict mode を維持

### 5. テスト
- [ ] `buildParametersString` のユニットテスト（各 CLI オプションの組み合わせ）
- [ ] PNG チャンク挿入の round-trip テスト:
  - Google 由来の PNG（`/tmp/nanobanana-adc-postrebase.png` を fixture 化して .team 外に置く、または既存チャンクを偽装した最小 PNG を fixture）に parameters を挿入
  - 既存の `IHDR` / `IDAT` / `IEND` / `caBX` が保持される
  - 新しい `tEXt` が正しい位置（IEND 直前）に入る
  - CRC が正しい（`pngcheck` や自前 verifier で確認）
- [ ] AIview との互換性動作確認:
  - ADC 経路で 1 枚生成 → `exiftool` と `python3 -c 'struct で PNG チャンクを列挙'` の両方で `tEXt parameters` が読める
  - `~/git/AIview/AIviewTests/MetadataExtractorTests.swift` のテスト対象ファイルフォーマットを参照し、AIview が自分の画像を読めるはずという根拠を summary に書く（可能なら実機確認）

### 6. ドキュメント
- [ ] README.md / README.ja.md の Usage セクションに `--no-embed-metadata` を追記
- [ ] 「生成画像には AIview 互換の tEXt parameters が埋め込まれる」「Google 側の C2PA / SynthID は保持される」旨を Features セクションか新規セクションで説明
- [ ] CHANGELOG.md に `[0.3.0]` を追加

### 7. バージョン
- [ ] `package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` / `src/cli.ts` の version を `0.3.0` に揃える

### 8. 動作確認
- [ ] `npm run typecheck` と `npm run build` が通る
- [ ] ADC 経路で実画像生成 1 枚 → `tEXt parameters` が入っていることを `exiftool` で確認
- [ ] AI Studio 経路で実画像生成 1 枚 → JPEG なら `.jpg` 拡張子に補正されて保存される or warning 出力
- [ ] `--no-embed-metadata` で実画像生成 1 枚 → `tEXt parameters` が入っていないことを確認

## スコープ外
- リリース作業（`git tag v0.3.0` / push / CI 経由 publish）— 完了後に別途 `/release 0.3.0` で実施
- AIview 側の iTXt 対応追加 — 別リポ、今回は触らない
- 画像編集 / バッチ生成 / MCP — 引き続き seed.md でスコープ外

## 注意
- `.npmrc` の `save-exact=true` / `ignore-scripts=true` に整合する dependency のみ追加可
- ADC 経路の URL は `location === 'global'` で host が region-less になる分岐を維持
- 既存 PNG の `caBX` / `zTXt (IPTC)` / `iTXt (XMP)` を保持すること（Google provenance の signature は順序含めて保持しないと invalid 扱いになる可能性があるので、IEND 直前挿入が安全）


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-013-1777021189` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-013-1777021189
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-013-1777021189/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/013-t13-aiview-text-parameters-jpeg-bug/runs/task-013-1777021189
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/013-t13-aiview-text-parameters-jpeg-bug/runs/task-013-1777021189/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
