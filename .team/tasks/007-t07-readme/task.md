---
id: 007
title: T07: README・ドキュメント整備
priority: medium
depends_on: [005]
created_by: surface:724
created_at: 2026-04-23T04:21:01.821Z
---

## タスク
docs/tasks.md の T07 を実装する。GitHub で公開できる状態にする。

## 受け入れ基準
- [ ] `README.md` 作成（英語でよい、内容は下記）
  - プロジェクトの説明（ADC 対応が唯一の差別化軸であること）
  - インストール方法 × 2（Claude Code plugin / npm install -g）
  - 使い方（CLI オプション例 3〜5 個）
  - 環境変数一覧
  - ADC セットアップ手順（`gcloud auth application-default login` → GCP プロジェクト設定 → 画像生成まで）
  - API キー での利用方法（フォールバック）
- [ ] `LICENSE` 追加（MIT）
  - Copyright holder: docs/seed.md に記載がないので「nanobanana-adc contributors」などで OK
  - year: 2026
- [ ] `package.json` に以下を追加
  - `description`
  - `keywords` (gemini, nano-banana, vertex-ai, adc, image-generation, claude-code-plugin, etc.)
  - `repository` (未確定でも placeholder で OK)
  - `homepage` (未確定でも placeholder で OK)
  - `license: "MIT"`

## 参考
- docs/seed.md 全体
- docs/tasks.md の T07

## 注意
- T06 と並行実装可能
- README は英語が望ましい（npm / GitHub でのリーチのため）。判断に迷うなら英語で書く
