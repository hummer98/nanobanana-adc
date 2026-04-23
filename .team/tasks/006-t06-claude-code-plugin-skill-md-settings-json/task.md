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
