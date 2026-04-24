# T11 実行サマリー

## タスク

T11: `/release` slash command を nanobanana-adc 向けに移植

## 完了したサブタスク

1. Planner Agent: `plan.md`（398 行）で移植元との差分を洗い出し、章構成と分岐条件を設計
2. Implementer Agent: `.claude/commands/release.md`（298 行）を新規作成
3. Inspector Agent: 7 カテゴリ全項目 pass で **GO** 判定

## 変更ファイル

- **新規**: `.claude/commands/release.md`

他のファイルへの変更はなし（plan 通りスコープ遵守）。

## 主要な反映内容

- フロントマター: `allowed-tools: Bash` + `description: "リリース作業を --exclusive タスクとして起票する"`
- Master 側: `$ARGUMENTS` でバージョン受け取り、`cmux-team create-task --status ready --priority high --exclusive` で起票
- Conductor 側タスク本文（operational task、サブエージェント spawn 禁止を明記）11 ステップ:
  1. 現在バージョン取得（`package.json` から）+ コミット履歴
  2. バージョン判定（タイトル優先 / Conventional Commits fallback）
  3. `CHANGELOG.md` 新規作成 or 追記分岐
  4. `package.json` 更新 + `.claude-plugin/plugin.json` 存在時のみ追加更新
  5. commit / tag / push
  6. marketplace キャッシュ更新（ディレクトリ存在時のみ）
  7. 旧 plugin キャッシュ削除（該当時のみ）
  8. plugin 再インストール（marketplace 登録済み時のみ）
  9. GitHub Actions 監視（`release.yml` 存在時のみ）
  10. `npm publish`（`npm view` で事前確認 → `--dry-run` → 本番 publish）
  11. `close-task --journal` で完了記録

## 検品結果

- 全チェックリスト pass（ファイル存在 / フロントマター / Master 側 / Conductor 側 / 置換 / bash 構文 / スコープ）
- 詳細: `inspection.md`

## 参考

- 移植元: `/Users/yamamoto/git/cmux-team/.claude/commands/release.md`
- GitHub Actions 参照: `/Users/yamamoto/git/cmux-team/.github/workflows/release.yml`

## マージ情報

- ブランチ: `task-011-1776974802/task`
- マージ先: `main`（ローカル ff-only マージ）
- マージコミット: `32a33f00ac75bc813f3e89476726cd5f6587c84b`
