# タスク割り当て

## タスク内容

---
id: 002
title: T02: 認証レイヤー (src/auth.ts)
priority: high
depends_on: [001]
created_by: surface:724
created_at: 2026-04-23T04:20:07.289Z
---

## タスク
docs/tasks.md の T02 を実装する。ADC / API キー の切り替えを `src/auth.ts` に閉じ込める。

## 受け入れ基準
- [ ] `resolveAuth()` を export する（引数で `apiKey?: string` を受け取る）
- [ ] 優先順位: `--api-key` フラグ → `GEMINI_API_KEY` 環境変数 → ADC
- [ ] ADC パスでは `google-auth-library` の `GoogleAuth` を使い access token を取得
- [ ] 認証モードを 1 行ログ出力: `[auth] using: adc` / `[auth] using: api-key`
- [ ] 認証失敗時は人間に分かるエラーメッセージを stderr に出して `process.exit(1)`
- [ ] `npx tsc --noEmit` が通る

## 返り値の形（方針だけ、細部は実装者判断）
`@google/generative-ai` + Vertex AI モードを呼ぶ src/generate.ts から使いやすい形にする。
例えば `{ mode: 'adc' | 'api-key', apiKey?: string, accessToken?: string, project?: string, location?: string }` のような discriminated union。
`GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` の読み取りもここで行う。

## 参考
- docs/seed.md の「環境変数」「認証優先順位」
- docs/tasks.md の T02

## 注意
- このタスクは T03 と並行実装可能。どちらも T01 完了後に着手できる
- CLI 引数解析はこのタスクではやらない（T04）


## 作業ディレクトリ

すべての作業は git worktree `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-002-1776967889` 内で行う。
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-002-1776967889
```
main ブランチに直接変更を加えてはならない。

ブランチ名: `task-002-1776967889/task`

## 作業開始前の確認（ブートストラップ）

worktree は tracked files のみ含む。作業開始前に以下を確認すること:
- `package.json` があれば `npm install` を実行
- `.gitignore` に記載されたランタイムディレクトリ（`node_modules/`, `dist/`, `workspace/` 等）の有無を確認し、必要なら再構築
- `.envrc` や環境変数の設定

## 出力ディレクトリ

```
/Users/yamamoto/git/nanobanana-adc/.team/tasks/002-t02-src-auth-ts/runs/task-002-1776967889
```

結果サマリーは `/Users/yamamoto/git/nanobanana-adc/.team/tasks/002-t02-src-auth-ts/runs/task-002-1776967889/summary.md` に書き出す。

## マージ先ブランチ

このタスクの成果は `main` にマージすること。
納品方法（ローカルマージ or PR）は conductor-role.md の完了時の処理に従う。

## 完了通知

完了処理は `conductor-role.md` の「完了時の処理」（Step 1〜12）に従う。特に:
- Step 11: `cmux-team close-task --task-id <TASK_ID> --deliverable-kind <files|merged|pr|none> ... --journal "..."` がタスクを close し、内部で daemon に CONDUCTOR_DONE を送信する。**`--deliverable-kind` は必須**で Step 9 の納品方式と対応付ける（merged / pr / files / none）。詳細は `conductor-role.md` Step 11 を参照
- Step 12: 完了レポートをセッション上に表示する

**`cmux-team send CONDUCTOR_DONE --success true` を自分で呼び出さない** — close-task がその役割を果たす。rebase 衝突等で close-task を呼ばず abort したい場合のみ `conductor-role.md` Step 8 の `--success false` 経路を使う。
