# タスク割り当て

## タスク内容

---
id: 004
title: T04: CLI エントリーポイント (src/cli.ts)
priority: high
depends_on: [002, 003]
created_by: surface:724
created_at: 2026-04-23T04:20:29.500Z
---

## タスク
docs/tasks.md の T04 を実装する。`commander` で引数を解析し、T02 の `resolveAuth()` と T03 の `generate()` を呼び出す。

## 受け入れ基準
- [ ] `src/cli.ts` に `commander` ベースの CLI を実装
- [ ] オプション
  - `--prompt` / `-p` （必須）
  - `--output` / `-o` （既定: `output.png`）
  - `--aspect` / `-a` （既定: `1:1`）
  - `--size` / `-s` （既定: `1K`）
  - `--model` / `-m` （既定: `gemini-3-pro-image-preview`）
  - `--api-key` （任意）
- [ ] `--help` で使い方が出ること
- [ ] 引数を `GenerateOptions` に詰めて `generate()` を呼ぶ
- [ ] 未捕捉例外時は stderr に出して `process.exit(1)`
- [ ] `npx tsc --noEmit` が通る

## 参考
- docs/seed.md の「CLI インターフェース」
- docs/tasks.md の T04

## 注意
- T01 で作った空 `src/cli.ts` を置き換える形で実装する
- T02 / T03 完了後に着手する（依存関係設定済み）
- この時点では `npm link` での動作確認は T05 のスコープとする


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-004-1776969377` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-004-1776969377
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-004-1776969377/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/004-t04-cli-src-cli-ts/runs/task-004-1776969377
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/004-t04-cli-src-cli-ts/runs/task-004-1776969377/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
