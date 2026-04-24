# タスク割り当て

## タスク内容

---
id: 007
title: T07: README・ドキュメント整備
priority: medium
depends_on: [005]
created_by: surface:724
created_at: 2026-04-23T04:21:01.821Z
---

## タスク
docs/tasks.md の T07 を実装する。GitHub で公開できる状態にする。

## 受け入れ基準
- [ ] `README.md` 作成（英語でよい、内容は下記）
  - プロジェクトの説明（ADC 対応が唯一の差別化軸であること）
  - インストール方法 × 2（Claude Code plugin / npm install -g）
  - 使い方（CLI オプション例 3〜5 個）
  - 環境変数一覧
  - ADC セットアップ手順（`gcloud auth application-default login` → GCP プロジェクト設定 → 画像生成まで）
  - API キー での利用方法（フォールバック）
- [ ] `LICENSE` 追加（MIT）
  - Copyright holder: docs/seed.md に記載がないので「nanobanana-adc contributors」などで OK
  - year: 2026
- [ ] `package.json` に以下を追加
  - `description`
  - `keywords` (gemini, nano-banana, vertex-ai, adc, image-generation, claude-code-plugin, etc.)
  - `repository` (未確定でも placeholder で OK)
  - `homepage` (未確定でも placeholder で OK)
  - `license: "MIT"`

## 参考
- docs/seed.md 全体
- docs/tasks.md の T07

## 注意
- T06 と並行実装可能
- README は英語が望ましい（npm / GitHub でのリーチのため）。判断に迷うなら英語で書く


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-007-1776970557` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-007-1776970557
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-007-1776970557/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/007-t07-readme/runs/task-007-1776970557
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/007-t07-readme/runs/task-007-1776970557/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
