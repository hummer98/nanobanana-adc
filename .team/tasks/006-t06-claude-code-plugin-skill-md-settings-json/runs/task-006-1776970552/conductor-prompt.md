# タスク割り当て

## タスク内容

---
id: 006
title: T06: Claude Code plugin 設定 (SKILL.md / settings.json)
priority: medium
depends_on: [005]
created_by: surface:724
created_at: 2026-04-23T04:20:51.952Z
---

## タスク
docs/tasks.md の T06 を実装する。`/plugin marketplace add` でインストール後すぐ使える状態にする。

## 受け入れ基準
- [ ] `SKILL.md` 作成
  - slash command 定義
  - 使い方（コマンド例 2〜3 個）
  - 環境変数一覧（`GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` / `GOOGLE_GENAI_USE_VERTEXAI` / `GEMINI_API_KEY` 等）
- [ ] `settings.json` 作成
  - `SessionStart` フックで `${CLAUDE_PLUGIN_DATA}` に `package.json` を展開し `npm install --omit=dev` を実行
  - docs/seed.md の「Claude Code plugin 固有の設定」の JSON をベースに
- [ ] `bin/` が Claude Code plugin の PATH に追加されることを確認（`settings.json` の設定で対応）
- [ ] `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` を使ったパス解決が想定通りか検討して記述

## 参考
- docs/seed.md の「Claude Code plugin 固有の設定」
- docs/tasks.md の T06

## 注意
- 実機での plugin インストール動作確認は難しいので、設定ファイルが仕様に沿っていることをもって完了とする
- T07 と並行実装可能


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-006-1776970552` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-006-1776970552
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-006-1776970552/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/006-t06-claude-code-plugin-skill-md-settings-json/runs/task-006-1776970552
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/006-t06-claude-code-plugin-skill-md-settings-json/runs/task-006-1776970552/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
