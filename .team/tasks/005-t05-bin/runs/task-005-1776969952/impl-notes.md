# T05 実装ノート: ビルド・bin 配線

作業ディレクトリ: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-005-1776969952`
ブランチ: `task-005-1776969952/task`

## 実装概要

plan.md 「3. 実装ステップ」に従い、下記を実施した。

- `npm run build` を実行し `dist/cli.js` / `dist/auth.js` / `dist/generate.js` が生成されることを確認。
- `bin/nanobanana-adc` を新規作成（案 A: ESM 静的 import 方式）。
- `chmod +x bin/nanobanana-adc` を適用（mode 100755 になることを `git diff --cached --summary` で確認済み）。
- `package.json` に `files` フィールドを追加（`dist/` / `bin/` / `SKILL.md` / `settings.json` / `README.md` / `LICENSE` を列挙）。

## 変更ファイル

### 新規

- `bin/nanobanana-adc` (45 バイト, mode 100755)
  ```js
  #!/usr/bin/env node
  import '../dist/cli.js';
  ```

### 変更

- `package.json` — `"bin"` の直下に `"files"` フィールドを追加。

## 検証結果

### 4.1 ビルド検証

```
$ npm run build
> nanobanana-adc@0.1.0 build
> tsc

$ ls -l dist/cli.js dist/auth.js dist/generate.js
-rw-r--r--@ 1 yamamoto  staff  1704  4月 24 03:50 dist/auth.js
-rw-r--r--@ 1 yamamoto  staff  1331  4月 24 03:50 dist/cli.js
-rw-r--r--@ 1 yamamoto  staff  4200  4月 24 03:50 dist/generate.js
```

すべてサイズ > 0、期待通り。

### 4.2 bin ファイル検証

```
$ ls -l bin/nanobanana-adc
-rwxr-xr-x@ 1 yamamoto  staff  45  4月 24 03:51 bin/nanobanana-adc

$ file bin/nanobanana-adc
bin/nanobanana-adc: a /usr/bin/env node script text executable, ASCII text
```

実行権限付与済み、file コマンドも `node script` と認識。

### 4.3 直接実行検証

```
$ ./bin/nanobanana-adc --help
Usage: nanobanana-adc [options]

Gemini 3 Pro Image CLI with ADC support

Options:
  -V, --version         output the version number
  -p, --prompt <text>   prompt text (required)
  -o, --output <path>   output file path (default: "output.png")
  -a, --aspect <ratio>  aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3,
                        21:9, 9:21, 5:4) (default: "1:1")
  -s, --size <size>     image size (choices: "1K", "2K", "4K", default: "1K")
  -m, --model <id>      model id (default: "gemini-3-pro-image-preview")
  --api-key <key>       Gemini API key (falls back to GEMINI_API_KEY / ADC)
  -h, --help            display help for command
```

exit code 0、commander の usage が正しく表示された。

### 4.4 `npm link` 経由の検証

```
$ npm link
added 1 package, and audited 3 packages in 473ms
found 0 vulnerabilities

$ nodenv rehash
$ which nanobanana-adc
/Users/yamamoto/.anyenv/envs/nodenv/shims/nanobanana-adc

# シムの先のシンボリックリンクも確認
$ ls -la /Users/yamamoto/.anyenv/envs/nodenv/versions/22.15.0/bin/nanobanana-adc
lrwxr-xr-x@ 1 yamamoto  staff  53 -> ../lib/node_modules/nanobanana-adc/bin/nanobanana-adc

$ nanobanana-adc --help
Usage: nanobanana-adc [options]

Gemini 3 Pro Image CLI with ADC support
(以下 --help と同内容、省略)

$ nanobanana-adc --version
0.1.0
```

グローバル PATH から呼び出せ、`--help` / `--version` ともに期待通りの出力。plan.md の懸念 6.3（ESM 相対 import とシンボリックリンク解決）は Node 22 環境では問題なく解決された。

補足: 初回 `which nanobanana-adc` で見つからなかったが、これは nodenv の shim を再生成する必要があったため。`nodenv rehash` 後は正常に解決された。

### 4.5 `npm pack --dry-run` による配布物検証

```
$ npm pack --dry-run
npm notice
npm notice 📦  nanobanana-adc@0.1.0
npm notice Tarball Contents
npm notice 45B bin/nanobanana-adc
npm notice 1.7kB dist/auth.js
npm notice 1.3kB dist/cli.js
npm notice 4.2kB dist/generate.js
npm notice 686B package.json
npm notice Tarball Details
npm notice name: nanobanana-adc
npm notice version: 0.1.0
npm notice filename: nanobanana-adc-0.1.0.tgz
npm notice package size: 3.0 kB
npm notice unpacked size: 8.0 kB
npm notice total files: 5
nanobanana-adc-0.1.0.tgz
```

- `dist/` / `bin/nanobanana-adc` / `package.json` が含まれる。
- `src/` / `node_modules/` / `.team/` / `docs/` は含まれない（期待通り）。
- `SKILL.md` / `settings.json` / `README.md` / `LICENSE` は `files` に列挙しているが、T05 時点では未作成のため含まれていない（npm は存在しないファイルを黙って無視するので OK）。

### TypeScript 型検証

```
$ bunx tsc --noEmit
(exit 0, no output)
```

型エラーなし。

### Git mode 確認

```
$ git add bin/nanobanana-adc package.json
$ git diff --cached --summary
 create mode 100755 bin/nanobanana-adc
$ git reset HEAD bin/nanobanana-adc package.json   # Conductor が最終 commit するため一旦 unstage
```

`mode 100755` で追加されることを確認（実行権限ビットが Git に記録される）。その後、作業境界に従い unstage。

## 作業境界遵守

- `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-005-1776969952` 配下のみを変更。
- `git commit` は実行していない（Conductor に委譲）。
- main ブランチに触れていない。

## 完了定義チェック

- [x] `bin/nanobanana-adc` が新規作成され、ESM 静的 import を用いて `dist/cli.js` を起動する。
- [x] `chmod +x` が適用され Git に mode 100755 で検出される（`git diff --cached --summary` で確認済み）。
- [x] `package.json` に `files` フィールドが追加される。
- [x] `npm run build` / `./bin/nanobanana-adc --help` / `npm link` + `nanobanana-adc --help` がすべて成功。
- [x] 検証結果（help 出力・`npm pack --dry-run` のファイル一覧）を本ノートに記録。

## 補足事項

- `npm link` により `/Users/yamamoto/.anyenv/envs/nodenv/versions/22.15.0/lib/node_modules/nanobanana-adc` にシンボリックリンクが残存している。T06 以降でも同じ bin を使うため、そのまま保持。検証者が解除したい場合は `npm unlink -g nanobanana-adc` を実行する。
- `dist/` は `.gitignore` 済みなのでコミット対象外（plan 通り）。
