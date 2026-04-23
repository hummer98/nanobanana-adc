---
id: 011
title: T11: /release slash command を nanobanana-adc 向けに移植
priority: medium
created_by: surface:724
created_at: 2026-04-23T19:32:52.686Z
---

## タスク
`~/git/cmux-team/.claude/commands/release.md` にある `/release` slash command を参考にして、nanobanana-adc に移植する。

## 背景
cmux-team には `/release` という slash command があり、Master が `--exclusive` タスクとして release 作業を起票 → Conductor が単独実行する運用になっている。
nanobanana-adc でも同じ仕組みを使えるようにしたいが、プロジェクト構成の違いに合わせて調整が必要。

## 参考（読み込み必須）
- `/Users/yamamoto/git/cmux-team/.claude/commands/release.md` — 移植元
- `/Users/yamamoto/git/cmux-team/.github/workflows/release.yml` — GitHub Actions の release flow（参考）

## 受け入れ基準

### 必須
- [ ] `.claude/commands/release.md` を新規作成
- [ ] nanobanana-adc の構成に合わせた手順になっていること（後述の差分を反映）
- [ ] `/release` 実行時に `cmux-team create-task --status ready --priority high --exclusive` でリリースタスクが起票される形式を維持
- [ ] タスク本文内で Conductor が「サブエージェントを spawn しない」operational task として動く指示になっていること
- [ ] バージョン引数（`/release 0.2.0`）と自動判定（`/release`）の両方をサポート
- [ ] `CHANGELOG.md` がなければ新規作成、あれば追記する分岐を入れる

### nanobanana-adc 向けの差分調整
移植元 cmux-team との違い:

1. **バージョン管理対象ファイル**
   - cmux-team: `package.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`
   - nanobanana-adc: `package.json` のみ（現時点で `.claude-plugin/` は未整備）
   - 将来 `.claude-plugin/plugin.json` を追加する可能性があるので、**存在する場合のみ更新するパターン**で書く（cmux-team の marketplace.json と同様の分岐）

2. **npm パッケージ名**
   - cmux-team: `@hummer98/cmux-team`（scoped）
   - nanobanana-adc: `nanobanana-adc`（unscoped）
   - publish コマンドとインストールコマンドを書き換える

3. **plugin marketplace キャッシュ操作**
   - cmux-team は `~/.claude/plugins/marketplaces/hummer98-cmux-team` 等を触る
   - nanobanana-adc はまだ marketplace 未公開。**該当ディレクトリが存在する場合のみ実行**する分岐にする（将来対応しやすくするため）

4. **GitHub Actions 監視**
   - cmux-team: `release.yml` があるので `gh run watch`
   - nanobanana-adc: `.github/workflows/release.yml` は未整備。**workflow がなければスキップ**する分岐にする（将来対応しやすくするため）
   - このタスクで `release.yml` 自体は作らない（別タスクで扱う）

5. **npm publish の扱い**
   - cmux-team: `npm install -g @hummer98/cmux-team`（インストールテスト）
   - nanobanana-adc: `npm publish` を **Conductor が実行してよい**（nanobanana-adc は npm 配布が主目的のため）
   - ただし `package.json` の `name` が registry で空いているか先に `npm view nanobanana-adc` で確認し、取得できたら警告する
   - `npm publish --dry-run` → OK なら本番 publish → 失敗したら journal に記録

### ドキュメント
- [ ] `.claude/commands/release.md` の先頭に `---` フロントマターで `description: "リリース作業を --exclusive タスクとして起票する"` と `allowed-tools: Bash` を記述
- [ ] 参考元（cmux-team の /release）へのリンクを summary に書く
- [ ] `/release` の使い方を README.md（または README.ja.md、T09 側）に書き足すのは**このタスクのスコープ外**（別タスクで扱う）

### 動作確認
- [ ] `.claude/commands/release.md` が Claude Code から `/release` として認識されることを確認（実行はしない、ファイルフォーマットの正しさと bash 構文のチェックまで）
- [ ] `bash -n .claude/commands/release.md 中の bash ブロック` に相当する構文チェックを可能な範囲で行う

## 注意
- **実 `npm publish` はこのタスクでは実行しない**（`.claude/commands/release.md` を作成するだけ。実際のリリースは後日 `/release` 経由で実行する）
- T09 / T10 と並行実行可能
