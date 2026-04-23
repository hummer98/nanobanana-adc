# タスク割り当て

## タスク内容

---
id: 010
title: T10: .gitignore / .npmignore / package.json files の再点検
priority: medium
created_by: surface:724
created_at: 2026-04-23T19:31:43.144Z
---

## タスク
公開前提で、リポジトリと npm パッケージに含めるファイルの境界を再点検する。

## 背景
- 現 `package.json` は `files` フィールドで allowlist 制御（ベストプラクティス）
- `.gitignore` に `.worktrees/` が未追加（cmux-team の worktree ディレクトリが untracked のまま残っている）
- `.npmignore` は存在しない（`files` 方式なので通常は不要だが、改めて判断）
- `prepublishOnly` スクリプトがないため `npm publish` 前の `dist/` ビルド忘れリスクがある

## 受け入れ基準
- [ ] **`.gitignore` の更新**
  - `.worktrees/` を追加（cmux-team が生成する worktree ディレクトリ）
  - その他、現状 untracked になっているが無視すべきファイル/ディレクトリがあれば追加（実装者判断、ただし追加した理由を summary に書く）
- [ ] **`.npmignore` の要否判定**
  - `files` フィールドがあると npm は allowlist モードになる
  - `.npmignore` は原則不要という結論を summary に書く（もし作る必要があると判断したら理由と共に作る）
- [ ] **`package.json` の `files` フィールド再点検**
  - 現在: `dist/`, `bin/`, `SKILL.md`, `settings.json`, `README.md`, `LICENSE`
  - `README.ja.md` 追加は T09 側で扱うのでここでは触らない（T09 と conflict させない）
  - その他の過不足を確認し、必要なら調整
- [ ] **`prepublishOnly` スクリプト追加**
  - `package.json` の `scripts` に `"prepublishOnly": "npm run build"` を追加
  - これで `npm publish` 時に自動で `dist/` が最新にビルドされる
- [ ] **`npm pack --dry-run` で最終確認**
  - summary に tarball に含まれるファイル一覧を貼る
  - 含まれるべき: `dist/` 配下の JS, `bin/nanobanana-adc`, `SKILL.md`, `settings.json`, `README.md`, `LICENSE`, `package.json`
  - 含まれないべき: `src/`, `.team/`, `.worktrees/`, `.config/`, `.envrc`, `docs/`, `tsconfig.json`, `.gitignore`, `node_modules/`, `package-lock.json` 等

## 参考
- docs/seed.md
- docs/tasks.md の T08

## 注意
- T09 と並行実行可能だが、両方が `package.json` を編集する可能性がある。T10 は `scripts` フィールドの追加がメインで、`files` には触らない。conflict は最小化される設計
- 実 `npm publish` は **しない**（T08 と同様、`--dry-run` までに留める）


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-010-1776973089` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-010-1776973089
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-010-1776973089/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/010-t10-gitignore-npmignore-package-json-files/runs/task-010-1776973089
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/010-t10-gitignore-npmignore-package-json-files/runs/task-010-1776973089/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
