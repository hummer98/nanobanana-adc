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
