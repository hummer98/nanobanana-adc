# タスク割り当て

## タスク内容

---
id: 005
title: T05: ビルド・bin 配線
priority: high
depends_on: [004]
created_by: surface:724
created_at: 2026-04-23T04:20:39.942Z
---

## タスク
docs/tasks.md の T05 を実装する。`bin/nanobanana-adc` がそのまま実行できる状態にする。

## 受け入れ基準
- [ ] `tsconfig.json` に `outDir: "dist"` を設定
- [ ] `npm run build` で `dist/cli.js` が生成される
- [ ] `bin/nanobanana-adc` を shebang (`#!/usr/bin/env node`) 付きで作成し、`dist/cli.js` を require/import する
- [ ] `chmod +x bin/nanobanana-adc`
- [ ] `package.json` の `bin` フィールドに `"nanobanana-adc": "./bin/nanobanana-adc"` を設定
- [ ] `npm link` 後 `nanobanana-adc --help` が動作することを確認（確認結果を summary に書く）
- [ ] `package.json` の `files` フィールドに `dist/`, `bin/`, `SKILL.md`, `settings.json` 等、配布に必要なものを列挙

## 実装メモ
- shebang 付き `bin/nanobanana-adc` の中身の例:
  ```
  #!/usr/bin/env node
  require('../dist/cli.js');
  ```
  ESM にする場合は `import('../dist/cli.js')` を使う

## 参考
- docs/tasks.md の T05
- docs/seed.md の「リポジトリ構成」

## 注意
- ここまで完了すると実際に CLI として動く状態になる
- T06（plugin 設定）と T07（README）はこのタスクに依存する


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-005-1776969952` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-005-1776969952
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-005-1776969952/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/005-t05-bin/runs/task-005-1776969952
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/005-t05-bin/runs/task-005-1776969952/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
