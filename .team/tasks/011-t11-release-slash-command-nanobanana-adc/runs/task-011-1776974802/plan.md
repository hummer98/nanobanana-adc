# T11 実装計画書: `/release` slash command を nanobanana-adc 向けに移植

## 1. 目的

`cmux-team/.claude/commands/release.md` を参考に、nanobanana-adc 用の `.claude/commands/release.md` を作成する。Master が `/release [version]` を叩くとリリース作業を `--exclusive` タスクとして起票し、Conductor が単独で nanobanana-adc の package.json バージョン更新 → git tag/push → npm publish までを一気通貫で実行できるようにする。

---

## 2. 成果物

| パス | 役割 | 備考 |
|---|---|---|
| `.claude/commands/` | ディレクトリ | worktree 内で `mkdir -p .claude/commands` で新規作成 |
| `.claude/commands/release.md` | slash command 定義 | フロントマター + Markdown 本文。Claude Code が `/release` として認識する |

**このタスクで触らないもの:**
- `package.json` のバージョン（コマンド定義を作るだけで実行はしない）
- `CHANGELOG.md` の新規作成（コマンド実行時に初めて作られる）
- `.github/workflows/release.yml`（別タスク）
- `.claude-plugin/plugin.json`（未整備。将来対応）

---

## 3. `.claude/commands/release.md` の章構成案

### 3.1 フロントマター

```yaml
---
allowed-tools: Bash
description: "リリース作業を --exclusive タスクとして起票する"
---
```

- `description` は仕様書指定のとおり。
- `allowed-tools: Bash` のみ（Master 側は `cmux-team create-task` を Bash で叩くだけ）。

### 3.2 見出しとイントロ

```markdown
# /nanobanana-adc:release

nanobanana-adc のリリース作業を `--exclusive` タスクとして起票する。Master 自身は作業しない。オープンタスクが全て closed になった後、idle Conductor が release タスクを単独実行する。
```

### 3.3 引数セクション

```markdown
## 引数

`$ARGUMENTS` でバージョンを指定できる（省略時は Conductor がコミット履歴から自動判定）:

- `/release` — タスク実行時に自動判定
- `/release 0.2.0` — 指定バージョンで固定
```

### 3.4 Master 側 bash ブロック（タスク作成のみ）

cmux-team 側と同じ骨格。タイトルだけ差し替える:

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
…（Conductor 向け本文。下 3.5 を埋める）…
TASK_BODY
)"
```

### 3.5 Conductor が実行する本文（heredoc 内）

#### 3.5.1 実行ポリシー（共通、cmux-team からそのまま流用）

- operational task であり、サブエージェントは spawn しない
- Conductor 自身が Bash で順次実行
- TDD / Plan / Inspection フェーズ不要
- 失敗時は該当ステップだけ再試行

#### 3.5.2 バージョン指定の読み取り方

タイトル内の `v<X.Y.Z>` を優先。`（バージョン自動判定）` の場合はコミット履歴から判定。

#### 3.5.3 worktree と main の扱い

- worktree 内で起動されるが、リリースコミット/タグは `$PROJECT_ROOT`（main 側）に打つ
- worktree 内には差分を残さない

#### 3.5.4 11 ステップ（nanobanana-adc 用に書き換え）

**ステップ 1: 現在のバージョンとコミット履歴を取得**

cmux-team は `.claude-plugin/plugin.json` から取得するが、nanobanana-adc は `package.json` から:

```bash
cd "$PROJECT_ROOT"
CURRENT=$(node -p "require('./package.json').version")
# フォールバック（node 無い環境）: python3 -c "import json; print(json.load(open('package.json'))['version'])"
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  COMMITS=$(git log ${LAST_TAG}..HEAD --oneline)
else
  COMMITS=$(git log --oneline -20)
fi
```

**ステップ 2: バージョンを判定**

cmux-team と同じ Conventional Commits 判定表をそのまま記載（major/minor/patch）。

**ステップ 3: CHANGELOG.md を更新（存在しなければ新規作成）**

```bash
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

その上でタイトル直下（`# Changelog` ヘッダ+説明行の後）に新バージョンブロックを追記する方針を明記:

```
## [X.Y.Z] - YYYY-MM-DD

### Added
- 新機能の説明

### Changed
- 変更の説明

### Fixed
- 修正の説明
```

分類ルール: `feat:` → Added / `fix:` → Fixed / それ以外 → Changed。コミットメッセージそのままコピーせず、ユーザ向けに書き直す。

**ステップ 4: バージョンを更新（package.json 必須、plugin.json は分岐）**

```bash
cd "$PROJECT_ROOT"
# package.json（必須）
node -e "const p=require('./package.json'); p.version='${NEW_VERSION}'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')"

# .claude-plugin/plugin.json（存在する場合のみ、将来対応）
if [ -f .claude-plugin/plugin.json ]; then
  node -e "const p=require('./.claude-plugin/plugin.json'); p.version='${NEW_VERSION}'; require('fs').writeFileSync('.claude-plugin/plugin.json', JSON.stringify(p,null,2)+'\n')"
fi

# .claude-plugin/marketplace.json（存在する場合のみ、将来対応）
if [ -f .claude-plugin/marketplace.json ]; then
  node -e "const m=require('./.claude-plugin/marketplace.json'); if(m.plugins && m.plugins[0]) m.plugins[0].version='${NEW_VERSION}'; require('fs').writeFileSync('.claude-plugin/marketplace.json', JSON.stringify(m,null,2)+'\n')"
fi
```

**ステップ 5: コミット・push・タグ**

`git add` は存在するファイルのみを対象にする:

```bash
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

**ステップ 6: plugin marketplace キャッシュ更新（ディレクトリが存在する場合のみ）**

```bash
MARKETPLACE_DIR="${HOME}/.claude/plugins/marketplaces/yamamoto-nanobanana-adc"
if [ -d "$MARKETPLACE_DIR/.git" ]; then
  (cd "$MARKETPLACE_DIR" && git pull origin main)
else
  echo "marketplace cache not present; skipping"
fi
```

（命名はリポジトリ所有者 `yamamoto` + リポジトリ名 `nanobanana-adc` に合わせる。将来 marketplace 化したら自動的に動き始める。）

**ステップ 7: 旧 plugin キャッシュ削除（ディレクトリが存在する場合のみ）**

```bash
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

**ステップ 8: plugin 再インストール（marketplace 登録済みの場合のみ）**

```bash
if claude plugin list 2>/dev/null | grep -q "nanobanana-adc@yamamoto-nanobanana-adc"; then
  claude plugin uninstall nanobanana-adc@yamamoto-nanobanana-adc
  claude plugin install nanobanana-adc@yamamoto-nanobanana-adc
else
  echo "plugin not installed via marketplace; skipping"
fi
```

**ステップ 9: GitHub Actions 監視（release.yml が存在する場合のみ）**

```bash
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

**ステップ 10: npm publish（Conductor が実行する — nanobanana-adc 固有の振る舞い）**

cmux-team は GitHub Actions 側で publish するが、nanobanana-adc はまだ workflow 未整備なので Conductor が直接 publish する:

```bash
cd "$PROJECT_ROOT"

# 10.1 registry 側で既にこのバージョンが公開されていないかチェック
if npm view "nanobanana-adc@${NEW_VERSION}" version >/dev/null 2>&1; then
  echo "WARNING: nanobanana-adc@${NEW_VERSION} is already published on npm registry" >&2
  # journal に記録して中断
  exit 1
fi

# 10.2 パッケージ名自体が registry に存在するかを先に確認（初回 publish かどうかの判別）
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

# 10.4 本番 publish（失敗しても journal に記録して後続へ）
if npm publish --access public; then
  echo "npm publish succeeded: nanobanana-adc@${NEW_VERSION}"
  PUBLISH_STATUS="ok"
else
  echo "npm publish FAILED; will record in journal" >&2
  PUBLISH_STATUS="failed"
fi
```

補足（本文に明記する運用メモ）:
- `--access public` は unscoped パッケージでは省略可能だが、明示しておく
- 将来 `.github/workflows/release.yml` が整備された後は、このステップを workflow 側に委譲して `npm install` 確認だけに変える余地を残す
- 2FA auth-and-writes が必要な場合は Conductor からは publish できないため、事前に npm トークン認証を済ませておく旨を注記

**ステップ 11: close-task で完了記録**

```bash
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

### 3.6 完了報告ブロック（Master 向け）

cmux-team と同じ体裁:

```
リリースタスクを作成しました (T<id>)。
オープンタスクが全て closed になると Conductor が自動実行します。
進捗: cmux-team status
トレース: cmux-team trace-task <id>
```

### 3.7 注意事項セクション

cmux-team の注意事項をベースに、nanobanana-adc 固有メモを追加:

- `--exclusive` 同士の共存ルール（cmux-team と同じ）
- `RUN_AFTER_ALL_CONFLICT` の扱い（cmux-team と同じ）
- **nanobanana-adc 固有**: npm publish は Conductor が直接実行する。事前に `npm login` か `NPM_TOKEN` 経由の auth を済ませておくこと
- **nanobanana-adc 固有**: 現状 `.claude-plugin/` `.github/workflows/` 未整備。将来整備された場合は該当ステップが自動的に有効化される設計

---

## 4. エッジケース一覧（release.md 本文で明示する分岐）

| # | 条件 | 挙動 |
|---|---|---|
| E1 | `.claude-plugin/plugin.json` が存在しない | ステップ 4 の plugin.json 更新をスキップ、ステップ 5 の `git add` 対象からも除外 |
| E2 | `.claude-plugin/marketplace.json` が存在しない | ステップ 4 の marketplace.json 更新をスキップ、`git add` 対象からも除外 |
| E3 | `~/.claude/plugins/marketplaces/yamamoto-nanobanana-adc` が存在しない | ステップ 6 をスキップしログ出力 |
| E4 | `~/.claude/plugins/cache/yamamoto-nanobanana-adc/nanobanana-adc` が存在しない | ステップ 7 をスキップ |
| E5 | `claude plugin list` に nanobanana-adc が無い | ステップ 8 をスキップ |
| E6 | `.github/workflows/release.yml` が存在しない | ステップ 9 をスキップ |
| E7 | `npm view nanobanana-adc@${NEW_VERSION}` が成功（= 既に公開済み） | 警告出して中断（重複 publish 防止） |
| E8 | `npm view nanobanana-adc` が 404（= 初回 publish） | 「初回 publish」とログしてそのまま続行 |
| E9 | `npm publish --dry-run` が失敗 | abort（本番 publish に進まない） |
| E10 | 本番 `npm publish` が失敗 | `PUBLISH_STATUS=failed` を journal に記録して後続へ（exit せず 11 に進む） |
| E11 | `CHANGELOG.md` が存在しない | ヘッダ付きで新規作成し、その後に新バージョンブロックを追記 |
| E12 | `node` が PATH に無い | `python3 -c "import json; ..."` でフォールバックする旨を本文に注記（JSON 更新は jq があれば jq、無ければ node/python のどれか） |
| E13 | `git describe --tags` がタグなしエラー | `LAST_TAG=""` 扱い、直近 20 コミットから判定（cmux-team と同じ） |

---

## 5. 実装後の検証手順（Inspector 用チェックリスト）

### 5.1 ファイル・構造

- [ ] `.claude/commands/release.md` が存在する（worktree 内、main ブランチに commit される想定）
- [ ] 他のファイルは変更されていない（`package.json` 等は触られていない）

### 5.2 フロントマター

- [ ] 先頭が `---` で開始・終了している
- [ ] `allowed-tools: Bash` が含まれる
- [ ] `description: "リリース作業を --exclusive タスクとして起票する"` が含まれる（文字列完全一致）

### 5.3 Master 側 bash の正しさ

- [ ] `$ARGUMENTS` でバージョンを受け取る
- [ ] `cmux-team create-task --status ready --priority high --exclusive` を呼んでいる
- [ ] タスクタイトルに `v$VERSION_ARG`（引数あり）または「バージョン自動判定」（省略時）を埋め込む
- [ ] heredoc の識別子が `TASK_BODY`（cmux-team と同じ）
- [ ] `bash -n` で文法エラーが出ない（Master 側 bash ブロックを抽出して構文チェック）

### 5.4 Conductor 本文の 11 ステップ網羅性

- [ ] ステップ 1: 現在バージョン取得は `package.json` から（`.claude-plugin/plugin.json` ではない）
- [ ] ステップ 2: Conventional Commits 判定表あり
- [ ] ステップ 3: CHANGELOG.md 新規作成の分岐あり
- [ ] ステップ 4: `package.json` は必須更新、`.claude-plugin/plugin.json` `.claude-plugin/marketplace.json` は `[ -f ... ]` 分岐
- [ ] ステップ 5: `git add` 対象が動的配列で組まれている
- [ ] ステップ 6: marketplace ディレクトリ `yamamoto-nanobanana-adc` を参照し `[ -d .../.git ]` 分岐
- [ ] ステップ 7: cache ディレクトリ存在確認の分岐
- [ ] ステップ 8: `claude plugin list` での存在確認分岐
- [ ] ステップ 9: `.github/workflows/release.yml` の存在確認分岐
- [ ] ステップ 10: `npm view nanobanana-adc@${NEW_VERSION}` 重複チェック → `--dry-run` → 本番 publish の 3 段構え
- [ ] ステップ 11: `close-task --journal` 呼び出しあり、journal 本文に `v${CURRENT} → v${NEW_VERSION}` とスキップ内訳が含まれる

### 5.5 差分の正しさ（cmux-team との対照）

- [ ] npm パッケージ名が `nanobanana-adc`（scope なし）。`@hummer98/cmux-team` が残っていない
- [ ] marketplace 識別子が `yamamoto-nanobanana-adc`。`hummer98-cmux-team` が残っていない
- [ ] cmux-team 特有の `skills/cmux-team/manager` 等のパスが混入していない

### 5.6 bash 構文チェック

- [ ] release.md からコードフェンス内の bash ブロックを抽出し、`bash -n` に通して構文エラーが無いことを確認（Master 側・Conductor 側の両方）
- [ ] heredoc の終端 (`TASK_BODY`) が正しく閉じている

### 5.7 Claude Code からの認識確認（可能なら）

- [ ] `claude /` でコマンド補完候補に `/release` が出る（worktree 配下で起動した Claude Code セッションで確認）
- [ ] `/release 0.2.0` 実行時、実際に `cmux-team create-task` が起動する（**dry-run 用途でのみ**確認。実タスク作成が望ましくない場合はスキップ）

---

## 6. 作業境界・スコープ外

- 本計画はコード変更を行わない。Implementer が `.claude/commands/release.md` を書く
- `.github/workflows/release.yml` は作らない（別タスク）
- `.claude-plugin/plugin.json` `.claude-plugin/marketplace.json` は作らない（将来対応）
- 実際の `npm publish` は実行しない（コマンド定義を作るだけ）
- T09 / T10 と並行実行可能
