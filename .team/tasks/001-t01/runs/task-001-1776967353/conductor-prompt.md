# タスク割り当て

## タスク内容

---
id: 001
title: T01: プロジェクト骨格のセットアップ
priority: high
created_by: surface:724
created_at: 2026-04-23T04:19:55.741Z
---

## タスク
docs/tasks.md の T01 を実装する。後続タスクの土台となるので、ビルド・型チェックが通る空プロジェクトを作る。

## 受け入れ基準
- [ ] `package.json` 作成（name: nanobanana-adc, version, bin, scripts, dependencies 初期値）
- [ ] `tsconfig.json` 作成（strict, ES2022 target, Node16 moduleResolution）
- [ ] `.gitignore` 作成（node_modules, dist, ビルド成果物）
- [ ] `src/cli.ts` 空エントリーポイント作成（空と言っても shebang や最小のエントリ関数スケルトンは入れてよい）
- [ ] `npm install` が成功する
- [ ] `npx tsc --noEmit` が成功する

## 初期依存パッケージ
- `@google/generative-ai`
- `google-auth-library`
- `commander`
- dev: `typescript`, `@types/node`

## 参考
- docs/seed.md の「技術スタック」「リポジトリ構成」
- docs/tasks.md の T01

## 注意
- `dist/` や `*.js` ビルド成果物は `.gitignore` に含める
- `package.json` の `bin` フィールドは T05 で完成させるので、この時点では placeholder でよい
- 実際のロジックは後続タスク（T02〜T04）で実装する。ここではあくまで骨格のみ


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-001-1776967353` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-001-1776967353
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-001-1776967353/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/001-t01/runs/task-001-1776967353
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/001-t01/runs/task-001-1776967353/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
