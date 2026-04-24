# タスク割り当て

## タスク内容

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


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-008-1776971445` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-008-1776971445
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-008-1776971445/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/008-t08-npm-publish/runs/task-008-1776971445
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/008-t08-npm-publish/runs/task-008-1776971445/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
