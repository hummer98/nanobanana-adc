# T10 実装計画書: .gitignore / .npmignore / package.json files の再点検

## 1. 概要

npm 公開前提として、リポジトリ追跡と npm パッケージ同梱の境界を再点検する。具体的には `.gitignore` に `.worktrees/` を追加し、`package.json` の `scripts` に `prepublishOnly` を追加する。`.npmignore` は作成しない。

---

## 2. 変更対象ファイル一覧

| ファイル | 操作 | 備考 |
|---|---|---|
| `.gitignore` | 編集 | `.worktrees/` 他の追記 |
| `package.json` | 編集 | `scripts.prepublishOnly` 追加（`files` は触らない） |
| `.npmignore` | **作成しない** | 判断根拠は summary に記載 |

---

## 3. 具体的な変更内容

### 3.1 `.gitignore`

**現状（全 7 行）**:
```
node_modules/
dist/
*.js
!bin/nanobanana-adc
.env
.envrc
.config/
```

**変更後**:
```
node_modules/
dist/
*.js
!bin/nanobanana-adc
.env
.envrc
.config/

# cmux-team が生成する git worktree ディレクトリ
.worktrees/

# macOS / エディタの生成物
.DS_Store
```

**判断根拠**:

- **`.worktrees/`**: 受け入れ基準 1 の明示要件。現在 main 側で untracked のまま残っており、cmux-team が各タスク毎に `.worktrees/task-XXX-*/` を生成する運用なので永続的に無視が必要。
- **`.DS_Store`**: macOS Finder が自動生成するメタファイル。開発環境が macOS（`Platform: darwin`）であり、将来 `git add .` で誤って取り込むリスクを抑える軽微な予防策。現時点で untracked 一覧には存在しないが、ディスカバリを行った `ls -la` 出力にも現れておらず、無ければ無害、あれば無視できる。
- **他に追加しないもの**:
  - `package-lock.json` はリポジトリに commit されておりリリースに有用な場合があるため維持（Node エコシステム標準）。
  - `.team/` は cmux-team のセッション管理用ディレクトリで、`.team/.gitignore` 内で session 固有のものを個別に無視しつつ `tasks/` などは追跡対象として運用されているため、トップレベルでは無視しない。
  - `logs/`, `*.log`, `coverage/`, `.nyc_output/`, `.idea/`, `.vscode/` 等は現状 untracked に存在せず、プロジェクト規模に対して不要な先回り。YAGNI。
  - `.env*` は既に `.env` と `.envrc` で必要分が無視済み。

### 3.2 `package.json`

**変更箇所**: `scripts` セクションのみ。`files` フィールドには **触らない**（T09 との conflict 最小化のため）。

**現状**:
```json
"scripts": {
  "build": "tsc",
  "typecheck": "tsc --noEmit"
}
```

**変更後**:
```json
"scripts": {
  "build": "tsc",
  "typecheck": "tsc --noEmit",
  "prepublishOnly": "npm run build"
}
```

**判断根拠**:
- 受け入れ基準 4 の明示要件。
- `npm publish` / `npm pack` の直前に npm が自動実行するライフサイクルフック。これにより `dist/` の古いビルドで publish される事故を防ぐ。
- `prepublishOnly` は `npm install` では実行されず publish 系のみで走るため、開発体験を損なわない（`prepublish`/`prepare` との違い）。

### 3.3 `files` フィールド（再点検のみ、変更なし）

**現状**:
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

**点検結果**:
- `dist/` — コンパイル済み JS（必須）
- `bin/` — `nanobanana-adc` 実行スクリプト（`package.json.bin` から参照、必須）
- `SKILL.md` — Claude Code プラグインの skill 定義（必須）
- `settings.json` — Claude Code プラグイン設定（必須）
- `README.md` — ユーザー向けドキュメント（必須）
- `LICENSE` — MIT ライセンス（npm 推奨・必須扱い）

**結論**: 過不足なし。T10 では変更しない。
- `package.json` 自体、`README.md`、`LICENSE` は npm が自動で常に含める（files に書いても書かなくても同じ）が、明示することで意図が読みやすく、現状で良い。
- `README.ja.md` は T09 側のスコープ。ここでは触らない。

### 3.4 `.npmignore` — 作成しない

**判断根拠**:
- `package.json.files` が設定されている場合、npm は **allowlist モード** で動作し `.npmignore` と `.gitignore` は無視される（[npm docs: files field](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#files) 準拠）。
- 両方置くと二重管理で乖離リスクが生まれ、むしろ混乱の原因になる。
- `.npmignore` を追加する合理的理由は、`files` を廃して blocklist ベースに切り替えたい場合のみ。T10 ではその方針転換を行わない。
- 受け入れ基準 2 の「原則不要」結論と一致。

---

## 4. 検証手順

### 4.1 `.gitignore` の効果確認
```bash
cd /Users/yamamoto/git/nanobanana-adc
# worktree 生成後に main 側で status を取り、.worktrees/ が untracked に現れないことを確認
git status --short
git check-ignore -v .worktrees/task-010-1776973089/ || true
```
期待: `.worktrees/` が ignore 対象として認識される（`check-ignore` が該当ルール行を返す）。

### 4.2 `prepublishOnly` の効果確認（worktree 内）
```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-010-1776973089
# dist/ を削除した状態から dry-run で prepublishOnly が走ることを確認
rm -rf dist/
npm pack --dry-run 2>&1 | tee /tmp/t10-npm-pack.log
# dist/ が再生成されていることを確認
ls -la dist/
```
期待: `npm pack --dry-run` 実行前に `tsc` が走って `dist/*.js` が生成され、dry-run 出力に `dist/` 配下が含まれる。

### 4.3 `npm pack --dry-run` の出力検証

**含まれるべきファイル**（checklist）:
- [ ] `dist/auth.js`
- [ ] `dist/cli.js`
- [ ] `dist/generate.js`
- [ ] `dist/*.d.ts`（tsc 出力次第、必須ではないが害もない）
- [ ] `bin/nanobanana-adc`
- [ ] `SKILL.md`
- [ ] `settings.json`
- [ ] `README.md`
- [ ] `LICENSE`
- [ ] `package.json`

**含まれてはいけないファイル**（negative checklist）:
- [ ] `src/` 配下（`.ts` ソース）
- [ ] `.team/` 配下
- [ ] `.worktrees/` 配下
- [ ] `.config/` 配下
- [ ] `.envrc`, `.env`
- [ ] `docs/` 配下（`seed.md`, `tasks.md`）
- [ ] `tsconfig.json`
- [ ] `.gitignore`
- [ ] `node_modules/`
- [ ] `package-lock.json`

**確認コマンド**:
```bash
npm pack --dry-run 2>&1 | grep -E '^npm notice' | grep -v 'Tarball Details' > /tmp/t10-tarball-files.log
cat /tmp/t10-tarball-files.log
```

summary には `npm pack --dry-run` の Tarball Contents セクションを貼る。

---

## 5. TDD 観点での検証チェックリスト

受け入れ基準 5 項目に 1:1 で対応。

- [ ] **AC1: `.gitignore` 更新**
  - [ ] `.worktrees/` が追記されている
  - [ ] `git check-ignore .worktrees/task-xxx/` が該当ルール行を返す
  - [ ] 追加理由が summary に記載されている（`.worktrees/`, `.DS_Store` 各々）
- [ ] **AC2: `.npmignore` 要否判定**
  - [ ] `.npmignore` ファイルは作成されていない
  - [ ] 不要と判断した理由が summary に記載されている（files allowlist モード）
- [ ] **AC3: `files` フィールド再点検**
  - [ ] `files` に変更が入っていない（T09 conflict 回避）
  - [ ] 現状 6 エントリに過不足がないことを summary で明言
- [ ] **AC4: `prepublishOnly` 追加**
  - [ ] `package.json.scripts.prepublishOnly === "npm run build"`
  - [ ] `dist/` を消してから `npm pack --dry-run` → dist が再生成される
- [ ] **AC5: `npm pack --dry-run` 検証**
  - [ ] 上記 positive checklist 全て含まれている
  - [ ] 上記 negative checklist 全て含まれていない
  - [ ] Tarball Contents を summary に貼付

---

## 6. リスクと考慮事項

### 6.1 T09 との conflict
- T09 は `README.ja.md` 追加に伴い `package.json.files` を編集する可能性がある。
- **緩和策**: T10 は `files` に触らず `scripts` 末尾に 1 行追加するのみ。JSON の別セクションであり、 3-way merge で自動解決されるか、最悪でも trivial な手動解決。
- 既存 `scripts` の最終エントリ（`typecheck`）末尾にカンマが付く変更が発生するため、T09 が `scripts` を触らない限り安全。T09 の計画を事前確認できるなら望ましい。

### 6.2 `prepublishOnly` の副作用
- `npm pack` / `npm publish` 系でのみ走るため、通常の `npm install` / `npm test` には影響しない。
- ただし CI で `npm pack` を使っているケースでは `tsc` が走ることになる。本プロジェクトは現状 CI が未整備なので問題なし。

### 6.3 `.DS_Store` 追加の妥当性
- 現時点で untracked には存在しないため必須ではない。ただし macOS 開発環境で将来混入するリスクは常にある軽微な予防策。削除判断もあり得るが、プロジェクトルートの `.gitignore` に追加することは Node/OSS プロジェクトで標準的な慣行。
- **代替案**: グローバル `~/.gitignore_global` で扱う方針もあるが、他コントリビューターの環境に依存させないためリポジトリ側で吸収する方が堅牢。

### 6.4 `npm pack --dry-run` で `prepublishOnly` が走るか
- npm 7+ では `npm pack` / `npm publish` 両方で `prepublishOnly` が実行される（npm 6 以前は publish のみ）。本プロジェクトは Node 18+ 前提で npm 9+ 相当のため問題なし。
- Node バージョンを確認: `node --version && npm --version` を検証時に記録。

### 6.5 publish は行わない
- 受け入れ基準・注意事項に明記の通り、`--dry-run` のみ。実 `npm publish` は別タスク（または別手順書）で扱う。

---

## 7. 実装順序（Implementer 向け）

1. `.gitignore` を編集 → `.worktrees/` と `.DS_Store` を追記
2. `package.json` の `scripts` に `prepublishOnly` 行を追加（最終行として）
3. `rm -rf dist/` → `npm pack --dry-run` → Tarball Contents を取得
4. Positive / Negative checklist と突き合わせ
5. `git diff` で変更差分を確認、summary にまとめる
6. （`.npmignore` は作成しないので touch しない）
