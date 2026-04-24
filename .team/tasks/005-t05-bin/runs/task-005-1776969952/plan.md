# T05 実装計画書: ビルド・bin 配線

## 1. 概要

`nanobanana-adc` コマンドを「ビルドして `npm link` すれば即実行できる」状態にする。具体的には下記 3 点を成立させる:

1. `tsc` によって `src/*.ts` → `dist/*.js` (ESM) にビルドされる。
2. `bin/nanobanana-adc` が shebang 付きのエントリスクリプトとして存在し、`dist/cli.js` をロードする。
3. `package.json` の `bin` / `files` 設定によって、`npm link` / `npm publish` の両方で正しく配布・露出される。

本プロジェクトは `"type": "module"` の ESM プロジェクトなので、bin 側も ESM として書く。

T01〜T04 は既に完了しており、`src/auth.ts` / `src/cli.ts` / `src/generate.ts` はそろっている。本タスクで新規に書くコードは `bin/nanobanana-adc` 一点のみで、それ以外は `package.json` への `files` フィールド追加と検証作業が中心となる。

---

## 2. 対象ファイル一覧

### 新規作成

| パス | 目的 |
| --- | --- |
| `bin/nanobanana-adc` | shebang 付きの ESM 起動スクリプト。`dist/cli.js` を import する |

### 変更

| パス | 変更内容 |
| --- | --- |
| `package.json` | `files` フィールド追加（`dist/`, `bin/`, `SKILL.md`, `settings.json`, `README.md`, `LICENSE` を列挙） |

### 確認のみ（変更不要）

| パス | 確認内容 |
| --- | --- |
| `tsconfig.json` | `outDir: "dist"`, `rootDir: "src"`, `target: ES2022`, `module: Node16` が既に設定済み |
| `package.json` の `bin` | `"nanobanana-adc": "./bin/nanobanana-adc"` が既に設定済み |
| `src/cli.ts` | 先頭に `#!/usr/bin/env node` が既に付いている（bin 側にも付けるので両方に残る形） |

### 生成物（コミット対象外）

- `dist/cli.js`, `dist/auth.js`, `dist/generate.js` — `npm run build` の成果物。`.gitignore` で除外済みを前提。

---

## 3. 実装ステップ

以下の順で作業する。各ステップで「何を・どのファイルに・なぜ」書くかを具体化する。

### Step 1: `tsconfig.json` の確認

- `outDir: "dist"` と `rootDir: "src"` が設定されていることを目視確認する。
- 既に設定済みなので変更は発生しない。

### Step 2: 一度ビルドして `dist/cli.js` が生成されることを確認

- ワークツリー直下で `npm run build` を実行。
- `dist/cli.js` / `dist/auth.js` / `dist/generate.js` が生成されることを `ls dist/` で確認する。
- `node dist/cli.js --help` が動作することを確認（shebang の有無に関わらず、明示的に `node` で起動すれば必ず動く。ここで動作しなければ T01-T04 側に問題がある）。

### Step 3: `bin/nanobanana-adc` を新規作成

- ディレクトリ `bin/` を作成する。
- 中身は以下の通り:

  ```js
  #!/usr/bin/env node
  import '../dist/cli.js';
  ```

- ESM 静的 import を副作用目的で使う形。`cli.ts` 側は `main()` を呼ぶトップレベルコードを含むため、import されるだけでエントリが走る。
- 拡張子を付けない理由: `package.json` の `bin` 設定が `./bin/nanobanana-adc`（拡張子なし）で固定されているため。extensionless ファイルは、親 `package.json` の `"type": "module"` に従って ESM として評価されるので問題なく動作する（Node v18+ の仕様）。

### Step 4: `bin/nanobanana-adc` に実行権限を付与

- `chmod +x bin/nanobanana-adc` を実行。
- `ls -l bin/nanobanana-adc` で `-rwxr-xr-x` 的な表示になることを確認。
- **重要**: このファイルは Git 管理下に入るので、executable bit もコミットされる。`git add` 後 `git diff --cached --summary` で `mode 100755` になることを確認する（100644 になっていたら chmod し直してから再 add）。

### Step 5: `package.json` の `bin` フィールドを確認

- 現在 `"bin": { "nanobanana-adc": "./bin/nanobanana-adc" }` と設定済み。変更不要。

### Step 6: `package.json` に `files` フィールドを追加

- `npm pack` / `npm publish` で含まれる配布物を明示する。T06（SKILL.md / settings.json）や T07（README / LICENSE）で追加される予定のファイルもあらかじめ列挙しておく（存在しなければ npm は黙って無視するので前倒し記載しても副作用なし）。

  ```json
  "files": [
    "dist/",
    "bin/",
    "SKILL.md",
    "settings.json",
    "README.md",
    "LICENSE"
  ]
  ```

- `package.json` 内の位置は `"bin"` フィールドの直下あたりが読みやすい。

### Step 7: `npm link` で挙動検証

- ワークツリー内で `npm link` を実行。
- グローバル `PATH` 上に `nanobanana-adc` が配置される（`which nanobanana-adc` で確認）。
- `nanobanana-adc --help` を実行し、commander が生成する usage が表示されることを確認。
- エラーが出ないこと・非ゼロで終了しないことをログに残す。

### Step 8: （任意）検証後の cleanup

- 検証後、グローバルリンクが残るのが気になる場合は `npm unlink -g nanobanana-adc` で解除できる。T06 以降も同じ bin を使うため、基本的には残したままで良い。

### Step 9: 変更のコミット

- `bin/nanobanana-adc` と `package.json` の差分のみをコミット（`dist/` は `.gitignore` 済みの前提）。
- コミットメッセージ例: `feat: T05 build and bin wiring — bin/nanobanana-adc / files field`

---

## 4. 検証手順

受け入れ基準を 1 つずつ確認するための手順を列挙する。すべて worktree ルート `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-005-1776969952` で実行する。

### 4.1 ビルド検証

```sh
npm run build
ls -l dist/cli.js dist/auth.js dist/generate.js
```

期待: 3 ファイルがいずれも存在し、サイズ > 0。

### 4.2 bin ファイル検証

```sh
ls -l bin/nanobanana-adc
file bin/nanobanana-adc
```

期待:
- 実行権限（`-rwxr-xr-x` など `x` が付いている）。
- `file` の出力に `a /usr/bin/env node script` もしくは類似の表現が出ること。

### 4.3 直接実行検証

```sh
./bin/nanobanana-adc --help
```

期待: commander の usage が標準出力に表示され、exit code 0。

### 4.4 `npm link` 経由の検証

```sh
npm link
which nanobanana-adc
nanobanana-adc --help
nanobanana-adc --version
```

期待:
- `which` で npm のグローバル bin 配下のパスが返る。
- `--help` で usage が表示される。
- `--version` で `0.1.0` が表示される。

### 4.5 package.json 配布物検証（前倒し）

```sh
npm pack --dry-run
```

期待: `dist/`, `bin/nanobanana-adc`, `package.json`, 既存の `README.md`/`LICENSE`/`SKILL.md` 等（存在するもののみ）が出力に含まれ、`src/` や `node_modules/` は含まれない。

### 4.6 summary への記録事項

- `nanobanana-adc --help` の実行結果（先頭 5〜10 行程度の出力）を summary に転記する。
- `npm pack --dry-run` のファイル一覧を summary に転記する（ホワイトリストが期待通りかを残す）。

---

## 5. 設計判断

### 5.1 ESM bin 実装方式の選択

「ESM プロジェクトにおける bin スクリプト」として考えられる 3 案を比較した。

#### 案 A: 拡張子なし `bin/nanobanana-adc` + shebang + ESM 静的 import **[採用]**

```js
#!/usr/bin/env node
import '../dist/cli.js';
```

- **メリット**
  - package.json の `bin` 定義（`"./bin/nanobanana-adc"`）をそのまま使える。変更不要。
  - 静的 `import` はエラーが早期・同期的に判明する（`import(...)` の Promise ハンドリング不要）。
  - 「bin は `bin/` ディレクトリに置く」という慣習に合致し、`dist/` を直接公開するより意図が明示的。
- **デメリット**
  - 拡張子なしファイルが ESM として評価されるのは `"type": "module"` の恩恵に依存（Node v18+ では問題なく解決されるが、古い Node ではフラグが要るケースがあった）。→ 本プロジェクトは `"engines": { "node": ">=18" }` なので許容。
  - ビルドしないと動かない（`dist/cli.js` の存在が前提）。→ T06 の SessionStart フックで `npm install --omit=dev` を走らせる際に `prepare` スクリプト等でビルドを実行する運用と組み合わせる必要がある。この点は T06 側で解決する。

#### 案 B: `import('../dist/cli.js')` の dynamic import

- メリット: 解決タイミングが遅くなるので、理屈上は条件分岐を挟める。
- デメリット: 本件では条件分岐が不要であり、Promise の握り漏れで失敗がサイレントになるリスクだけが増える。

→ 案 A に対する優位性なし。

#### 案 C: `package.json` の `bin` を `"./dist/cli.js"` に直接向ける

- メリット: 中間ファイル不要。`src/cli.ts` の shebang がそのまま使える（tsc は shebang を保持する）。
- デメリット
  - 既存の `package.json` の `bin` 設定（`./bin/nanobanana-adc`）を書き換える必要があり、タスクの「`bin/nanobanana-adc` を作成」という受け入れ基準と矛盾する。
  - `tsc` 出力ファイルに execute bit が立たないため、`postbuild` で `chmod +x dist/cli.js` を挟む必要が生じる。build の副作用が増える。
  - `dist/` は gitignore 対象なので、開発者が clone 直後に `npm run build` をしないと bin が存在しない状態になる。`bin/` を Git 管理にしておく案 A の方が「少なくともスタブは repo に存在する」利点がある。

→ 案 A を採用。

### 5.2 `files` フィールドの構成方針

- `.npmignore` ではなく `files` フィールドを採用。「含めるものを列挙する」方式の方が事故リスク（`.env` などの同梱）が低いため。
- T06 / T07 で追加予定のファイルも先行列挙する。存在しないファイル名があっても npm は黙って無視するので副作用はなく、後続タスクでこのフィールドを触り直さずに済む。
- `package.json` / `LICENSE` / `README.md` は `files` で明示しなくても npm が自動同梱するが、可読性重視で `README.md` / `LICENSE` は明示列挙する（`package.json` は npm の自動処理のみに任せる）。

### 5.3 `dist/` を Git 管理に入れるか

- **入れない**。T01 で `.gitignore` に `dist/` を登録済みの想定。
- 配布時は `npm run build` を `prepublishOnly` や CI で走らせるのが一般的。本タスクの範囲では publish 周りの自動化までは踏み込まず、T08 で `prepublishOnly` 等を追加する前提とする。

---

## 6. リスク・懸念

### 6.1 extensionless bin が ESM として解決されない Node バージョン

- 古い Node (v14〜v16) では extensionless エントリポイントの ESM 扱いにフラグが必要なケースがあった。
- 本プロジェクトは `"engines": { "node": ">=18" }` なので基本は問題ないが、ユーザー環境が v18 未満の可能性もゼロではない。→ README（T07）で Node 18+ を前提とする旨を明記することで緩和。

### 6.2 `npm link` 環境の汚染

- `npm link` はグローバル bin にシンボリックリンクを張るため、同名の他パッケージ（公開版の `nanobanana-adc` 等）と衝突しうる。
- T08 まで公開しない予定なので当面問題ないが、検証後に unlink するか、検証者に周知する。

### 6.3 ESM 相対 import とシンボリックリンク

- npm は bin を `node_modules/.bin/` 配下にシンボリックリンクとして配置する。`import '../dist/cli.js'` がリンク解決後の元ファイル基準で `../dist/` を解決するか、リンク位置基準で解決するかは過去に Node のバージョン間で違いがあった。
- Node v18+ ではリンクのターゲット（元ファイル）基準で解決されるので `../dist/` で `dist/` を正しく指す。シンボリックリンク経由で呼んでも動作するはず。
- とはいえ念のため `4.4 npm link 経由の検証` で実動作を確認する。これが失敗した場合は、`import.meta.url` から `fileURLToPath(new URL('../dist/cli.js', import.meta.url))` を組み立てて dynamic import する方式にフォールバックする。

### 6.4 ビルド成果物と bin のバージョン不整合

- `bin/nanobanana-adc` を更新しても `dist/cli.js` が古いと古い挙動のままになる。
- `prepare` スクリプト（npm install 時に走る）で `npm run build` を自動実行する構成が望ましいが、本タスクの範囲外とする。T06 の SessionStart フック or T08 の `prepublishOnly` 追加と合わせて対応方針を明確化する。

### 6.5 `files` フィールドに存在しないファイルを列挙することによる混乱

- T06/T07 で追加予定の `SKILL.md` / `settings.json` / `README.md` / `LICENSE` を先行列挙することで、このタスク時点では実ファイルが存在しない。
- `npm pack` は警告を出さずに無視するので実害はない。
- 検証（4.5）で `npm pack --dry-run` を実行し、存在するもののみが同梱されているかを確認することで正常性を担保する。

---

## 完了定義

- [x] 本計画書を規定パスに保存したこと。
- 以下は実装フェーズ（Builder）で満たす項目:
  - [ ] `bin/nanobanana-adc` が新規作成され、ESM 静的 import を用いて `dist/cli.js` を起動する。
  - [ ] `chmod +x` が適用され Git に mode 100755 でコミットされる。
  - [ ] `package.json` に `files` フィールドが追加される。
  - [ ] `npm run build` / `./bin/nanobanana-adc --help` / `npm link` + `nanobanana-adc --help` が成功する。
  - [ ] 検証結果（help 出力・`npm pack --dry-run` のファイル一覧）が summary に残される。
