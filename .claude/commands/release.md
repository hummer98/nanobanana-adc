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

### 0. プラグインマニフェスト検証（preflight）

`.claude-plugin/plugin.json` と `.claude-plugin/marketplace.json` の整合性・スキーマ準拠・ファイル存在を確認する。CI の `validate-plugin` ジョブでも同じチェックが走るが、手元で先に潰したほうが速い:

```
cd "$PROJECT_ROOT"

# claude plugin validate: スキーマ・整合性チェック
claude plugin validate . || { echo "plugin validate failed; aborting" >&2; exit 1; }

# version 三者 (+ src/cli.ts) が揃っているか確認。揃っていなければこの後のバンプ時に同時更新する
PKG=$(node -p "require('./package.json').version")
PLUGIN=$(node -p "require('./.claude-plugin/plugin.json').version")
MARKET=$(node -p "require('./.claude-plugin/marketplace.json').plugins.find(p => p.name === 'nanobanana-adc').version")
CLI=$(grep -oE "\.version\('([^']+)'\)" src/cli.ts | sed -E "s/.*'([^']+)'.*/\1/")
echo "versions — package=$PKG plugin=$PLUGIN marketplace=$MARKET cli=$CLI"
if [ "$PKG" != "$PLUGIN" ] || [ "$PKG" != "$MARKET" ] || [ "$PKG" != "$CLI" ]; then
  echo "WARNING: version fields are out of sync. The version bump step below must update all four." >&2
fi
```

失敗時は aborting。manifest 側の構造的な問題なのでコードを直してから再実行する。

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

### 6. GitHub Actions の release workflow を監視

tag push を契機に `release.yml` が自動発火し、OIDC Trusted Publishing で `npm publish --provenance --access public` と GitHub Release 作成を行う。Conductor は完了を待って結果を確認する:

```
sleep 5
RUN_ID=$(gh run list --workflow=release.yml --limit=1 --json databaseId --jq '.[0].databaseId')
if [ -n "$RUN_ID" ]; then
  gh run watch "$RUN_ID" --exit-status
  WORKFLOW_STATUS="ok"
else
  echo "no release workflow run detected; tag push may have failed to trigger" >&2
  WORKFLOW_STATUS="not-triggered"
fi
```

### 7. npm registry で新バージョンが見えることを確認

CI が publish に成功していれば `npm view` に新バージョンが反映される:

```
PUBLISHED=$(npm view "nanobanana-adc@${NEW_VERSION}" version 2>/dev/null || echo "")
if [ "$PUBLISHED" = "${NEW_VERSION}" ]; then
  echo "npm publish verified: nanobanana-adc@${NEW_VERSION}"
  PUBLISH_STATUS="ok"
else
  echo "npm publish NOT verified on registry" >&2
  PUBLISH_STATUS="missing"
fi
```

### 8. plugin marketplace キャッシュと plugin 本体を更新

npm と GitHub が更新されても、Claude Code のローカル plugin キャッシュは手動更新しない限り古いまま残る（実際に v0.3.0 リリース時もこれで "release されていないように見える" 混乱が発生した）。`claude plugin` CLI で反映させる:

```
# 8.1 marketplace のソースキャッシュを最新 main に追従
if claude plugin marketplace list 2>/dev/null | grep -q "hummer98-nanobanana-adc"; then
  claude plugin marketplace update hummer98-nanobanana-adc
else
  echo "marketplace hummer98-nanobanana-adc not registered; skipping"
fi

# 8.2 user scope にインストール済みなら新バージョンへ更新
if claude plugin list 2>/dev/null | grep -q "nanobanana-adc@hummer98-nanobanana-adc"; then
  claude plugin update nanobanana-adc@hummer98-nanobanana-adc
  echo "Claude Code のリスタートが必要: plugin.json / SessionStart hook を再読込するために手動で再起動してください"
else
  echo "plugin not installed via marketplace; skipping"
fi
```

### 9. （任意）旧バージョンの plugin キャッシュを削除

`plugin update` が行うインストール後、古い version ディレクトリが残ることがある。ディスクを節約したければ最新だけ残して削除する（残っていても動作に支障はない）:

```
CACHE_BASE="${HOME}/.claude/plugins/cache/hummer98-nanobanana-adc/nanobanana-adc"
if [ -d "$CACHE_BASE" ]; then
  LATEST=$(ls -d "$CACHE_BASE"/*/ 2>/dev/null | sort -V | tail -1)
  for dir in "$CACHE_BASE"/*/; do
    [ "$dir" != "$LATEST" ] && rm -rf "$dir"
  done
fi
```

### 10. （任意）グローバル CLI をローカル反映

`npm install -g nanobanana-adc` を使っているユーザー向け。CI publish 後に `npm view` に新バージョンが出てから実行する:

```
npm install -g "nanobanana-adc@${NEW_VERSION}" 2>/dev/null || echo "npm install -g skipped (not globally installed)"
```

### 11. close-task で完了記録

journal にスキップ内訳を含めて `cmux-team close-task --task-id <id> --journal "..."` を実行:

```
cmux-team close-task --task-id <id> --journal "$(cat <<EOF
リリース完了: v${CURRENT} → v${NEW_VERSION}
- タグ: v${NEW_VERSION}
- CHANGELOG.md: 更新済み
- package.json / plugin.json / marketplace.json / src/cli.ts: 更新済み
- GitHub Actions release.yml: ${WORKFLOW_STATUS:-skipped}
- npm registry 反映: ${PUBLISH_STATUS:-skipped} (nanobanana-adc@${NEW_VERSION})
- plugin cache: ${MARKETPLACE_DIR:+updated}
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
- **nanobanana-adc 固有**: npm publish は GitHub Actions の `release.yml` が OIDC Trusted Publishing で実行する。npm 側の Trusted Publisher 設定（`hummer98/nanobanana-adc` repo / `release.yml` workflow）が前提
- **nanobanana-adc 固有**: `.claude-plugin/plugin.json` + `marketplace.json` は `hummer98-nanobanana-adc` marketplace として公開済み。リリース後は §8 の `claude plugin marketplace update` + `claude plugin update` でローカル反映が必要

<!-- 参考元: cmux-team/.claude/commands/release.md (hummer98/cmux-team) -->
