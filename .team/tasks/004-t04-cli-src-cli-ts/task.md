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
