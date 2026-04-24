# タスク割り当て

## タスク内容

---
id: 012
title: T12: v0.2.0 — Gemini 3 Pro Image API オプションを CLI に拡充
priority: medium
created_by: surface:724
created_at: 2026-04-24T04:04:48.071Z
---

## タスク
v0.1.x では prompt / aspect / size / model しか API に渡していない。残りの主要な画像生成パラメータを CLI に露出させ、v0.2.0 (minor) としてリリースする。

## 背景
v0.1.x の受け入れ基準は「ADC 経路が機能する」までで、API パラメータ面は最小限だった。公開後のフィードバックに耐えるために、実用的なオプション一式を整備する。

## 受け入れ基準

### 0. 前提調査（実装前に必須）
- [ ] 現時点の **Vertex AI** および **AI Studio** の `gemini-3-pro-image-preview` で、以下がどの名前・どの構造で渡せるかを一次ソース（Google Cloud docs / AI Studio docs / `@google/generative-ai` の型）で確認し、summary に記録:
  - 複数画像生成（`generationConfig.imageConfig.numberOfImages` か `generationConfig.candidateCount` か）
  - 人物生成制御（`imageConfig.personGeneration` の enum 値: `ALLOW_ALL` / `ALLOW_ADULT` / `BLOCK_ALL` など）
  - seed 指定（`imageConfig.seed`）
  - 出力 MIME（`imageConfig.mimeType`: `image/png` / `image/jpeg`）
  - ネガティブプロンプト（存在すれば `imageConfig.negativePrompt`）
- [ ] 実際の REST API と `@google/generative-ai` SDK で**互換性のあるパラメータだけ**を対象とする。片方にしかないものは今回は採用しない

### 1. CLI オプション追加（`src/cli.ts`）
- [ ] `-n, --count <n>` — 1〜4 の整数。default 1
- [ ] `--seed <n>` — 整数。未指定時は送信しない
- [ ] `--person <mode>` — 選択肢は調査で確定した enum 値（大小文字は CLI では小文字表記、送信時にマッピング）
- [ ] `--mime <type>` — `png` / `jpeg` の選択肢。default `png`
- [ ] `--negative-prompt <text>` — API が対応していれば。未対応なら採用しない
- [ ] `--help` の表示が更新される

### 2. 型と API body（`src/generate.ts`）
- [ ] `GenerateOptions` に `count`, `seed?`, `person?`, `mime`, `negativePrompt?` を追加
- [ ] Vertex AI fetch path と AI Studio SDK path の両方で上記を body に反映
- [ ] 2 つの経路で API name が違う場合は、auth mode 分岐内で適切にマッピング

### 3. 複数画像の出力命名規則
- [ ] `--count 1`（default）: `--output foo.png` → `foo.png` にそのまま保存（後方互換）
- [ ] `--count N (N>1)`: `--output foo.png` → `foo-0.png`, `foo-1.png`, ..., `foo-(N-1).png` に連番保存
- [ ] 拡張子なしの output パス（例: `--output /tmp/out`）の場合の扱いも決める（自動で `-0.png` のような形か、エラーか）

### 4. `--mime` と `--output` の整合
- [ ] `--mime png` と `--output foo.jpg` のように拡張子と MIME が食い違う場合、stderr に warning を出す（失敗させない）
- [ ] `--output` 未指定時の default は `output.png`（`--mime jpeg` 時は `output.jpg`）

### 5. ドキュメント
- [ ] `README.md` と `README.ja.md` の Usage / CLI options セクションに新オプションを追記（英日両方）
- [ ] `docs/seed.md` の「今後の拡張候補（スコープ外）」は触らない（画像編集・バッチ・MCP は依然スコープ外）

### 6. CHANGELOG
- [ ] `CHANGELOG.md` の冒頭に `## [0.2.0] - YYYY-MM-DD` セクションを追加し、Added / Changed を記載

### 7. バージョン
- [ ] 以下 4 箇所を `0.2.0` に揃える（`/release` を使わない場合は手動）:
  - `package.json`
  - `.claude-plugin/plugin.json`
  - `.claude-plugin/marketplace.json`（`plugins[0].version`）
  - `src/cli.ts`（`.version('...')`）

### 8. 動作確認
- [ ] `npm run typecheck` と `npm run build` が通る
- [ ] ローカルで `--help` が新オプションを表示する
- [ ] 実画像生成テストは **API key 経路で 1 枚・ADC 経路で 1 枚** を summary に記録（`/tmp/` に保存）。課金を抑えるため `--size 1K --count 1` で OK
- [ ] `--count 2` のテスト 1 回（API key 経路、課金最小）で連番ファイル命名が機能することを確認

## スコープ外
- 画像入力（編集・inpainting・outpainting）— `seed.md` で将来拡張とされている
- `safetySettings` — HARM_CATEGORY_* の閾値調整。v0.3.x 以降で検討
- バッチ生成（ファイルからプロンプトリストを読む）— seed.md で将来拡張
- リリース作業（`git tag v0.2.0`、push、CI publish）— 本タスクの外。完了後に別途 `/release 0.2.0` で実施

## 参考
- `src/cli.ts` / `src/generate.ts`（既存実装パターン）
- `docs/seed.md`（差別化軸と将来拡張）
- `CLAUDE.md`（ADC-first、region-less host invariant）
- `@google/generative-ai` の型定義（node_modules 内）と Vertex AI REST API のドキュメント

## 注意
- `ignore-scripts=true` なので `prepublishOnly` は走らない。release.yml が明示的に build を走らせる
- `dependencies` は exact version 固定（`.npmrc` の `save-exact=true`）。新しい依存を追加する場合もこの方針
- ADC 経路の URL は `location === 'global'` で host が region-less になる分岐を維持（Gemini 3 Pro Image 特有）


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-012-1777016849` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-012-1777016849
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-012-1777016849/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/012-t12-v0-2-0-gemini-3-pro-image-api-cli/runs/task-012-1777016849
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/012-t12-v0-2-0-gemini-3-pro-image-api-cli/runs/task-012-1777016849/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
