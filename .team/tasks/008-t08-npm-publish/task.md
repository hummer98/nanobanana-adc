---
id: 008
title: T08: npm publish（公開前の最終確認・実施）
priority: low
depends_on: [006, 007]
created_by: surface:724
created_at: 2026-04-23T04:21:16.052Z
---

## タスク
docs/tasks.md の T08 を実装する。`npm install -g nanobanana-adc` で動く状態にする。

## 重要
**`npm publish` は外部に影響する破壊的操作なので、Agent が自動実行してはいけない。**
このタスクでは `--dry-run` までで停止し、実行結果を summary に書いて終了する。
実際の `npm publish` はユーザーが手動で行う前提とする。

## 受け入れ基準
- [ ] `npm pack` でパッケージ内容を確認し、summary に `npm pack` の出力（含まれるファイル一覧）を貼る
- [ ] `.npmignore` or `package.json` の `files` フィールドが正しく設定されていることを確認
  - 含めるべき: `dist/`, `bin/`, `SKILL.md`, `settings.json`, `README.md`, `LICENSE`, `package.json`
  - 含めないべき: `src/`, `node_modules/`, `.team/`, `docs/`, `tsconfig.json`, `.gitignore` 等
- [ ] `npm publish --dry-run` でエラーが出ないことを確認し、summary に出力を貼る
- [ ] **`npm publish` 本体は実行しない**（ユーザーが手動実行する）

## 参考
- docs/tasks.md の T08

## 注意
- このタスクは T06 / T07 両方の完了後に実行される
- 公開用の `name` が npm で既に取られていた場合は、summary にその旨を書き、リネーム候補を提案する
