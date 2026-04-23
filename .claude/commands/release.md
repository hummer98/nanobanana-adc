---
allowed-tools: Bash
description: "リリース作業を --exclusive タスクとして起票する"
---

# /nanobanana-adc:release

nanobanana-adc のリリース作業を `--exclusive` タスクとして起票する。Master 自身は作業しない。オープンタスクが全て closed になった後、idle Conductor が release タスクを単独実行する（走行中は他の assignment が停止される）。

## 引数

`$ARGUMENTS` でバージョンを指定できる（省略時は Conductor がコミット履歴から自動判定）:

- `/release` — タスク実行時に自動判定
- `/release 0.2.0` — 指定バージョンで固定

## 手順

### タスク作成（Master はこれだけ）

```bash
VERSION_ARG="$ARGUMENTS"
if [ -n "$VERSION_ARG" ]; then
  TITLE="リリース v$VERSION_ARG"
else
  TITLE="リリース（バージョン自動判定）"
fi

cmux-team create-task \
  --title "$TITLE" \
  --status ready \
  --priority high \
  --exclusive \
  --body "$(cat <<'TASK_BODY'
# リリースタスク

nanobanana-adc のリリース作業を Conductor 自身が直接実行する。

## 実行ポリシー（重要）

このタスクは **operational task（運用作業）** である。コード変更や設計判断を伴わないため以下を守る:

- **サブエージェントは spawn しない**（Researcher / Planner / Implementer / Inspector いずれも起動しない）
- Conductor 自身が Bash で順次コマンドを実行する
- worktree 内での TDD / Plan / Inspection フェーズは不要
- 失敗時は該当ステップだけやり直す（全体リトライ不要）

## バージョン指定の読み取り方

タスクタイトルに `v<X.Y.Z>` が含まれていればそれを新バージョンとして採用する。`（バージョン自動判定）` と記載されていればコミット履歴から自動判定する。

## 重要な前提（worktree と main の扱い）

- このタスクは worktree 内で起動されているが、**リリースコミット/タグは main ブランチに直接打つ**
- `cd "$PROJECT_ROOT"` で main ブランチ側のプロジェクトルートに移動してから編集・commit・push を行う
- worktree 内にはリリース関連の差分を残さない

## 手順

### 1. 現在のバージョンとコミット履歴を取得

nanobanana-adc は npm パッケージなのでバージョンは `package.json` から取得する（`.claude-plugin/plugin.json` ではない）。

```
cd "$PROJECT_ROOT"
# 推奨: node
CURRENT=$(node -p "require('./package.json').version")
# フォールバック（node が PATH に無い場合）:
#   CURRENT=$(python3 -c "import json; print(json.load(open('package.json'))['version'])")
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  COMMITS=$(git log ${LAST_TAG}..HEAD --oneline)
else
  COMMITS=$(git log --oneline -20)
fi
```

### 2. バージョンを判定

タスクタイトルに `v<X.Y.Z>` が含まれていればそれを NEW_VERSION とする。未指定なら Conventional Commits で判定:

| キーワード | 変更レベル |
|---|---|
| `BREAKING CHANGE`, `!:` | major |
| `feat:`, `feat(` | minor |
| `fix:` / `chore:` / `docs:` のみ | patch |

コミット群で最も大きい変更レベルを採用。

### 3. CHANGELOG.md を更新（無ければ新規作成）

`cd "$PROJECT_ROOT"` 後、CHANGELOG.md が無ければヘッダ付きで新規作成する:

```
cd "$PROJECT_ROOT"
if [ ! -f CHANGELOG.md ]; then
  cat > CHANGELOG.md <<'HEADER'
# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

HEADER
fi
```

その上でタイトル直下（`# Changelog` ヘッダと説明行の後）に新バージョンブロックを追記する:

```
## [X.Y.Z] - YYYY-MM-DD

### Added
- 新機能の説明

### Changed
- 変更の説明

### Fixed
- 修正の説明
```

**分類:** `feat:` → Added / `fix:` → Fixed / それ以外 → Changed。ユーザーが読んで意味がわかる説明に書き直す（コミットメッセージそのままコピーしない）。

### 4. バージョンを更新（package.json 必須、plugin 系は分岐）

`package.json` は必須更新。`.claude-plugin/` 配下は存在する場合のみ更新する（nanobanana-adc では現状未整備。将来整備された場合に自動で有効化される）:

```
cd "$PROJECT_ROOT"

# package.json（必須）
node -e "const p=require('./package.json'); p.version='${NEW_VERSION}'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')"

# .claude-plugin/plugin.json（存在する場合のみ）
if [ -f .claude-plugin/plugin.json ]; then
  node -e "const p=require('./.claude-plugin/plugin.json'); p.version='${NEW_VERSION}'; require('fs').writeFileSync('.claude-plugin/plugin.json', JSON.stringify(p,null,2)+'\n')"
fi

# .claude-plugin/marketplace.json（存在する場合のみ）
if [ -f .claude-plugin/marketplace.json ]; then
  node -e "const m=require('./.claude-plugin/marketplace.json'); if(m.plugins && m.plugins[0]) m.plugins[0].version='${NEW_VERSION}'; require('fs').writeFileSync('.claude-plugin/marketplace.json', JSON.stringify(m,null,2)+'\n')"
fi
```

`node` が利用できない環境では `python3` か `jq` でフォールバックしてよい。

### 5. コミット・push・タグ

`git add` は存在するファイルのみを対象にする:

```
cd "$PROJECT_ROOT"
FILES_TO_ADD=("CHANGELOG.md" "package.json")
[ -f .claude-plugin/plugin.json ] && FILES_TO_ADD+=(".claude-plugin/plugin.json")
[ -f .claude-plugin/marketplace.json ] && FILES_TO_ADD+=(".claude-plugin/marketplace.json")
git add "${FILES_TO_ADD[@]}"
git commit -m "chore: release v${NEW_VERSION}"
git tag "v${NEW_VERSION}"
git push origin main
git push origin "v${NEW_VERSION}"
```

### 6. plugin marketplace キャッシュ更新（存在する場合のみ）

```
MARKETPLACE_DIR="${HOME}/.claude/plugins/marketplaces/yamamoto-nanobanana-adc"
if [ -d "$MARKETPLACE_DIR/.git" ]; then
  (cd "$MARKETPLACE_DIR" && git pull origin main)
else
  echo "marketplace cache not present; skipping"
fi
```

### 7. 旧バージョンの plugin キャッシュを削除（存在する場合のみ）

```
CACHE_BASE="${HOME}/.claude/plugins/cache/yamamoto-nanobanana-adc/nanobanana-adc"
if [ -d "$CACHE_BASE" ]; then
  LATEST=$(ls -d "$CACHE_BASE"/*/ 2>/dev/null | sort -V | tail -1)
  for dir in "$CACHE_BASE"/*/; do
    [ "$dir" != "$LATEST" ] && rm -rf "$dir"
  done
else
  echo "plugin cache not present; skipping"
fi
```

### 8. plugin を再インストール（marketplace 登録済みの場合のみ）

```
if claude plugin list 2>/dev/null | grep -q "nanobanana-adc@yamamoto-nanobanana-adc"; then
  claude plugin uninstall nanobanana-adc@yamamoto-nanobanana-adc
  claude plugin install nanobanana-adc@yamamoto-nanobanana-adc
else
  echo "plugin not installed via marketplace; skipping"
fi
```

### 9. GitHub Actions 監視（release.yml が存在する場合のみ）

nanobanana-adc では `.github/workflows/release.yml` 未整備。将来整備されたら自動で有効化される:

```
if [ -f "$PROJECT_ROOT/.github/workflows/release.yml" ]; then
  sleep 5
  RUN_ID=$(gh run list --workflow=release.yml --limit=1 --json databaseId --jq '.[0].databaseId')
  if [ -n "$RUN_ID" ]; then
    gh run watch "$RUN_ID" --exit-status
  fi
else
  echo "release.yml not configured; skipping GitHub Actions monitoring"
fi
```

### 10. npm publish（Conductor が直接実行）

cmux-team は GitHub Actions 側で publish するが、nanobanana-adc はまだ workflow 未整備なので Conductor が直接 publish する。重複 publish を防ぐため先に registry の状態を確認し、`--dry-run` が通ってから本番 publish に進む:

```
cd "$PROJECT_ROOT"

# 10.1 registry 側で既にこのバージョンが公開されていないか確認
if npm view "nanobanana-adc@${NEW_VERSION}" version >/dev/null 2>&1; then
  echo "WARNING: nanobanana-adc@${NEW_VERSION} is already published on npm registry" >&2
  # journal に記録して中断（重複 publish 防止）
  exit 1
fi

# 10.2 パッケージ名が registry に登録済みか確認（初回 publish 判別）
if npm view nanobanana-adc version >/dev/null 2>&1; then
  echo "nanobanana-adc already registered; this is an update"
else
  echo "nanobanana-adc not yet registered; this will be the first publish"
fi

# 10.3 dry-run で検証
if ! npm publish --dry-run --access public; then
  echo "npm publish --dry-run failed; aborting" >&2
  exit 1
fi

# 10.4 本番 publish（失敗しても exit せず journal に記録して後続へ）
if npm publish --access public; then
  echo "npm publish succeeded: nanobanana-adc@${NEW_VERSION}"
  PUBLISH_STATUS="ok"
else
  echo "npm publish FAILED; will record in journal" >&2
  PUBLISH_STATUS="failed"
fi
```

運用メモ:

- `--access public` は unscoped パッケージでは省略可能だが、意図を明示するため付ける
- 将来 `.github/workflows/release.yml` が整備されたら、このステップを workflow 側に委譲して `npm install` 確認だけに置き換える余地を残している
- 2FA `auth-and-writes` が有効になっている場合は Conductor からは publish できないため、事前に `npm login` か `NPM_TOKEN` 経由の認証を済ませておくこと

### 11. close-task で完了記録

journal にスキップ内訳を含めて `cmux-team close-task --task-id <id> --journal "..."` を実行:

```
cmux-team close-task --task-id <id> --journal "$(cat <<EOF
リリース完了: v${CURRENT} → v${NEW_VERSION}
- タグ: v${NEW_VERSION}
- CHANGELOG.md: 更新済み
- package.json: 更新済み
- plugin.json: $([ -f .claude-plugin/plugin.json ] && echo "更新済み" || echo "未整備のためスキップ")
- marketplace: $([ -d "$MARKETPLACE_DIR/.git" ] && echo "更新済み" || echo "未登録のためスキップ")
- GitHub Actions: $([ -f .github/workflows/release.yml ] && echo "監視済み" || echo "未整備のためスキップ")
- npm publish: ${PUBLISH_STATUS:-skipped} (nanobanana-adc@${NEW_VERSION})
EOF
)"
```
TASK_BODY
)"
```

### 完了報告

```
リリースタスクを作成しました (T<id>)。
オープンタスクが全て closed になると Conductor が自動実行します。
進捗: cmux-team status
トレース: cmux-team trace-task <id>
```

## 注意事項

- 既に `--exclusive` タスクが存在しても `/release` は許可され、先行タスクが closed になってから自タスクが drain → 排他実行される（`--exclusive` 同士は共存可能）
- ただし非排他 `--run-after-all` タスクが既に存在する場合は `RUN_AFTER_ALL_CONFLICT` でエラーになる
- バージョン引数はタスクタイトルに埋め込まれ、Conductor がそれを読み取る
- Master はタスク作成以降リリース作業に関与しない
- **nanobanana-adc 固有**: npm publish は Conductor が直接実行する。事前に `npm login` か `NPM_TOKEN` 経由の auth を済ませておくこと
- **nanobanana-adc 固有**: 現状 `.claude-plugin/` および `.github/workflows/` は未整備。将来整備された場合は該当ステップが自動的に有効化される設計

<!-- 参考元: cmux-team/.claude/commands/release.md (hummer98/cmux-team) -->
