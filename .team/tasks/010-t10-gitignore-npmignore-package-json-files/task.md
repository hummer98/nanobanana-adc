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
