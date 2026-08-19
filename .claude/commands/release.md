---
description: nanobanana-adc をリリースする（バージョン判定 → CHANGELOG → tag push → npm publish 確認）
---

# /release

nanobanana-adc のリリースをこのセッションで直接実行する。引数 `$ARGUMENTS` で
バージョンを指定できる:

- `/release` — コミット履歴から自動判定
- `/release 0.9.0` — 指定バージョンで固定

コード変更や設計判断を伴わない運用作業なので、サブエージェントは spawn せず
Bash で順に実行する。失敗したステップだけをやり直せばよい。

## 0. Preflight

```bash
claude plugin validate . || { echo "plugin validate failed; aborting" >&2; exit 1; }

PKG=$(node -p "require('./package.json').version")
PLUGIN=$(node -p "require('./.claude-plugin/plugin.json').version")
MARKET=$(node -p "require('./.claude-plugin/marketplace.json').plugins.find(p => p.name === 'nanobanana-adc').version")
CLI=$(grep -oE "CLI_VERSION = '[^']+'" src/cli.ts)
echo "versions — package=$PKG plugin=$PLUGIN marketplace=$MARKET cli=$CLI"

npm run typecheck && npm test && npm run build
```

4 つのバージョンが揃っていない場合は、後続のバンプで 4 箇所すべてを更新すること。
CI の `validate-plugin` ジョブでも同じ整合性チェックが走る。

作業ツリーに未コミットの変更が残っていないことも確認する。リリースコミットは
CHANGELOG とバージョンファイルしか含めないため、機能変更が未コミットのままだと
そのタグには入らない。

## 1. バージョンを判定

```bash
CURRENT=$(node -p "require('./package.json').version")
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
git log ${LAST_TAG:+${LAST_TAG}..}HEAD --oneline
```

引数指定があればそれを採用。無ければ Conventional Commits で判定する:

| キーワード | 変更レベル |
|---|---|
| `BREAKING CHANGE`, `!:` | major |
| `feat:`, `feat(` | minor |
| `fix:` / `chore:` / `docs:` のみ | patch |

最も大きい変更レベルを採用する。

## 2. CHANGELOG.md を更新

`## [Unreleased]` ブロックがあれば `## [X.Y.Z] - YYYY-MM-DD`（実行日）に書き換える。
無ければタイトル直下に新しいブロックを追加する:

```
## [X.Y.Z] - YYYY-MM-DD

### Added / ### Changed / ### Fixed
```

分類は `feat:` → Added / `fix:` → Fixed / それ以外 → Changed。コミットメッセージを
そのままコピーせず、ユーザーが読んで意味がわかる説明に書き直す。

## 3. バージョンを 4 箇所に反映

```bash
NEW_VERSION=X.Y.Z
node -e "const p=require('./package.json'); p.version='${NEW_VERSION}'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')"
node -e "const p=require('./.claude-plugin/plugin.json'); p.version='${NEW_VERSION}'; require('fs').writeFileSync('.claude-plugin/plugin.json', JSON.stringify(p,null,2)+'\n')"
node -e "const m=require('./.claude-plugin/marketplace.json'); m.plugins.find(p=>p.name==='nanobanana-adc').version='${NEW_VERSION}'; require('fs').writeFileSync('.claude-plugin/marketplace.json', JSON.stringify(m,null,2)+'\n')"
sed -i '' "s/^const CLI_VERSION = '.*';/const CLI_VERSION = '${NEW_VERSION}';/" src/cli.ts

npm run typecheck && npm test && npm run build && ./bin/nanobanana-adc --version
```

## 4. コミット・タグ・push

```bash
git add CHANGELOG.md package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json src/cli.ts
git commit -m "chore: release v${NEW_VERSION}"
git tag "v${NEW_VERSION}"
git push origin main
git push origin "v${NEW_VERSION}"
```

## 5. release workflow を監視

tag push で `.github/workflows/release.yml` が発火し、OIDC Trusted Publishing で
`npm publish --provenance --access public` と GitHub Release 作成を行う。

```bash
sleep 8
RUN_ID=$(gh run list --workflow=release.yml --limit=1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

## 6. npm registry と GitHub Release を確認

```bash
npm view "nanobanana-adc@${NEW_VERSION}" version
gh release view "v${NEW_VERSION}" --json tagName,url --jq '.tagName + " " + .url'
```

## 7. ローカルの plugin キャッシュを更新

npm と GitHub が更新されても Claude Code のローカル plugin キャッシュは古いまま
残る。v0.3.0 のときはこれで「リリースされていないように見える」混乱が起きた。

```bash
claude plugin marketplace update hummer98-nanobanana-adc
claude plugin update nanobanana-adc@hummer98-nanobanana-adc
```

`plugin.json` / SessionStart hook を読み直すには Claude Code の再起動が必要。

## 8. （任意）グローバル CLI を更新

```bash
npm install -g "nanobanana-adc@${NEW_VERSION}"
```

## 注意事項

- npm publish は GitHub Actions が OIDC Trusted Publishing で実行する。npm 側の
  Trusted Publisher 設定（`hummer98/nanobanana-adc` repo / `release.yml`）が前提で、
  未設定だと publish が 401 になる。
- `v*` タグは CHANGELOG / package.json / plugin.json / marketplace.json / src/cli.ts が
  揃っていない状態で push しないこと。
