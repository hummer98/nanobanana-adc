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
