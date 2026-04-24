# T08 — Inspection Report

## 判定
**GO**

## 受け入れ基準チェック
- [x] `npm pack` でパッケージ内容を確認し、summary に `npm pack` の出力（含まれるファイル一覧）を貼っている — summary.md §2 に全 9 ファイルの一覧とサイズ（package 6.8 kB / unpacked 19.4 kB）が記載済み
- [x] `files` フィールドが正しく設定されている — package.json は `["dist/", "bin/", "SKILL.md", "settings.json", "README.md", "LICENSE"]` を宣言。`package.json` 自体は npm が自動同梱
  - 含めるべきもの: dist/auth.js, dist/cli.js, dist/generate.js, bin/nanobanana-adc, SKILL.md, settings.json, README.md, LICENSE, package.json → **全て同梱**
  - 含めないべきもの: src/, node_modules/, .team/, docs/, tsconfig.json, .gitignore, package-lock.json → **いずれも非同梱**
- [x] `npm publish --dry-run` でエラーが出ないことを summary で確認できる — summary.md §3 に最終出力（警告なし）貼付済み。再検証でも警告・エラーなし
- [x] `npm publish` 本体は実行されていない — `npm view nanobanana-adc` が E404 を返却。registry に 0.1.0 未登録

## 独立再検証の結果
- `npm run build`: 省略（dist/ が 04:12 に生成済み、`node bin/nanobanana-adc --help` が正常動作するためビルド済みバイナリが有効と確認）
- `npm pack --dry-run`: **OK**
  - ファイル数: 9
  - package size: 6.8 kB / unpacked size: 19.4 kB
  - 同梱: LICENSE, README.md, SKILL.md, bin/nanobanana-adc, dist/auth.js, dist/cli.js, dist/generate.js, package.json, settings.json
  - 想定外ファイル有無: **なし**（src/, node_modules/, .team/, docs/, tsconfig.json, .gitignore, package-lock.json すべて除外されている）
- `npm publish --dry-run`: **OK**（警告・エラーなし）
  - 出力末尾: `npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access (dry-run)` / `+ nanobanana-adc@0.1.0`
- パッケージ名 `nanobanana-adc` の状況: **空き**（`npm view` が E404 Not Found）
- `node bin/nanobanana-adc --help`: **OK**
  - `Usage: nanobanana-adc [options]` / `Gemini 3 Pro Image CLI with ADC support`
  - オプション `-V`, `-p`, `-o`, `-a`, `-s`, `-m`, `--api-key`, `-h` が commander で正しく列挙される

## 誤公開リスク
- `npm publish` 本体実行の形跡: **なし**
  - registry に nanobanana-adc@0.1.0 が存在しない（E404）
  - コマンド履歴も `--dry-run` のみで、本体実行のログは summary に記載されていない
- `.npmrc` registry override: **なし**
  - worktree 直下 `.npmrc`: 存在しない
  - repo ルート `/Users/yamamoto/git/nanobanana-adc/.npmrc`: 存在しない
  - `~/.npmrc`: `//registry.npmjs.org/:_authToken=...` のみで `registry=` による向き先 override はなし。公開先は公式 registry（https://registry.npmjs.org/）
  - 認証トークンが既に存在するため、ユーザーは `npm login` 省略のまま `npm publish` 実行可能（summary.md の手順は `npm login` が必要としているが、実質既にログイン状態）

## 変更範囲の最小性確認
- `git status`: `package.json`, `package-lock.json` のみ modified
- `git diff package.json`: 1 行のみ。`"nanobanana-adc": "./bin/nanobanana-adc"` → `"nanobanana-adc": "bin/nanobanana-adc"`（`npm pkg fix` 推奨に沿った正規化）
- `git diff package-lock.json`: 1 行のみ。`"license": "MIT"` の自動同期追加（package.json の license 指定との整合）
- src/ への変更: **なし**
- T03〜T05 の既存テンプレート修正: **なし**
- 変更は受け入れ基準が求めるスコープ内（bin path 正規化のみ）であり、最小性を満たす

## ユーザー引き継ぎの実用性
- summary.md §「ユーザーへの引き継ぎ」に以下が揃っており、ユーザーは手動で `npm publish` に進める:
  - 作業ディレクトリ（main ブランチ側での実行推奨）
  - `npm login` → `npm run build` → `npm publish` の順序
  - scoped name ではないので `--access` 不要の明記
  - 公開後の `npm view` による反映確認
- 1 点補足の余地あり: ユーザーの `~/.npmrc` には既に authToken が設定されているため、`npm login` はスキップ可能（実害なし、情報の正確性のみ）

## 備考
- summary.md §「ユーザーへの引き継ぎ」補足の `npm audit` moderate severity 2 件について:
  - 公開物（dist/*, bin/*）は runtime 依存（@google/generative-ai, commander, google-auth-library）の transitive からのものか、dev 依存由来かを個別確認はしていないが、**publish 可否には無関係**（npm は audit 失敗で publish をブロックしない）
  - 本 T08 は「npm publish 準備」であり audit 対応はスコープ外。main ブランチで `npm audit` / `npm audit fix --force` を検討する運用判断に委ねる方針で問題なし
- Conductor が commit 対象を `package.json` のみにするか、`package-lock.json` の `license` 追加も含めるかは要判断。lockfile を commit しない運用なら `.gitignore` 追記で対応。現状 `.gitignore` で lock は追跡対象（modified として status に出る）のため、一貫性を保つなら 2 ファイル両方を commit する方が自然
- worktree に残る `dist/` はローカル生成物で、通常 `.gitignore` で除外されるべき。`.gitignore` の現状は本検品では未確認（Inspector のスコープ外）
- summary.md は「リポジトリルート（この worktree ではなく main ブランチの ...）に移動」と案内しているが、worktree で生成した `dist/` は main では存在しないため、main 側で `npm run build` を改めて実行する必要がある点は summary にも記載済みで一貫している
