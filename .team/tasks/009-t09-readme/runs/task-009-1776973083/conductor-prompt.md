# タスク割り当て

## タスク内容

---
id: 009
title: T09: README を英語・日本語のバイリンガル化
priority: medium
created_by: surface:724
created_at: 2026-04-23T19:31:29.288Z
---

## タスク
公開用に README を英語版と日本語版の両方で整備する。

## 背景
現在の `README.md` は英語のみ（T07 で整備、143 行）。
nanobanana-adc は日本語ユーザーがメインターゲットになる可能性が高い（Claude Code plugin・Vertex AI を日本で使う層）ため、日本語ドキュメントの充実度で差別化できる。

## 受け入れ基準
- [ ] `README.md` (英語、既存) と `README.ja.md` (日本語、新規) の 2 ファイル構成
- [ ] 両ファイルの先頭にもう一方へのリンクを配置（例: `[日本語](README.ja.md) · English`）
- [ ] 日本語版は英語版と同じ情報量・構造で書く（機能的に同等）
  - プロジェクト説明（ADC 対応が差別化軸である点）
  - インストール方法 × 2（Claude Code plugin / npm install -g）
  - 使い方（CLI オプション例 3〜5 個）
  - 環境変数一覧
  - ADC セットアップ手順（`gcloud auth application-default login` → GCP プロジェクト設定 → 画像生成まで）
  - API キーでの利用方法（フォールバック）
  - ライセンス
- [ ] `package.json` の `files` フィールドに `README.ja.md` を追加
- [ ] `docs/seed.md` は日本語で書かれているので、文体や用語は seed.md を参考にする
- [ ] `npm publish --dry-run` で両ファイルが含まれることを確認（summary に出力を貼る）

## 実装メモ
- 既存 README.md の英語内容はそのまま維持して、構造のみ小改修（上部に言語切替リンクを追加）
- 日本語版の新規作成がメインスコープ
- 両ファイルの内容が乖離しないよう、将来的な更新は両方同時にする運用である旨を 1 行コメントとして書いてもよい（任意）

## 参考
- 既存 `README.md`
- `docs/seed.md`（日本語、ADC 対応の趣旨）
- `docs/tasks.md` の T07


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-009-1776973083` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-009-1776973083
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-009-1776973083/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/009-t09-readme/runs/task-009-1776973083
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/009-t09-readme/runs/task-009-1776973083/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
