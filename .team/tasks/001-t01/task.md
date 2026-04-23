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
