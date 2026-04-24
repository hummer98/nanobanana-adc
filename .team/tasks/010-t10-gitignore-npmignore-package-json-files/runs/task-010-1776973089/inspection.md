# T10 Inspection Report — `.gitignore` / `.npmignore` / `package.json files` 再点検

## Verdict: **GO**

AC1〜AC5 すべて充足、TypeScript 型チェック PASS、実運用（`npm publish`）上の公開挙動は意図通り。懸念事項は minor のみ（本 PR 範囲外の将来改善余地）。

---

## 1. 検証サマリ (AC1〜AC5)

| AC | 概要 | 判定 |
|---|---|---|
| AC1 | `.gitignore` に `.worktrees/` 追加、既存行 unchanged | [x] |
| AC2 | `.npmignore` 不存在＋根拠記載 | [x] |
| AC3 | `package.json.files` 不変（T09 conflict 回避） | [x] |
| AC4 | `scripts.prepublishOnly === "npm run build"` | [x] |
| AC5 | `npm pack --dry-run` / `npm publish --dry-run` 検証 | [x] |

### AC1 — `.gitignore` 更新
- [x] `.worktrees/` が追加されている（10 行目）
- [x] `.DS_Store` も追加されている（13 行目）
- [x] 既存行（`node_modules/` 等 1〜7 行目）は完全に unchanged（`git diff` 上 `@@ -5,3 +5,9 @@` のみ、削除行ゼロ）
- [x] 独立検証: `git check-ignore -v .worktrees/foo` → `.gitignore:10:.worktrees/	.worktrees/foo` を返し、新規行が発火

### AC2 — `.npmignore` 要否
- [x] `ls .../.npmignore` → `No such file or directory`（不存在）
- [x] summary §5 に「`files` allowlist 存在時は `.npmignore` より狭い側が勝つ」旨の根拠記載あり

### AC3 — `files` フィールド
- [x] `git diff package.json | grep -E '^\+.*"files"|...'` → `files not modified (OK)`
- [x] `node -e "...p.files"` → `["dist/","bin/","SKILL.md","settings.json","README.md","LICENSE"]` は T05 から不変

### AC4 — `prepublishOnly` 追加
- [x] `node -e "require('./package.json').scripts.prepublishOnly"` → `"npm run build"`
- [x] `rm -rf dist/` → `npm publish --dry-run` 実行で `prepublishOnly > npm run build > tsc` が走り `dist/auth.js` `dist/cli.js` `dist/generate.js` が再生成された

### AC5 — `npm pack --dry-run` 検証
- [x] positive checklist 全 9 項目充足（`dist/*.js` × 3, `bin/nanobanana-adc`, `SKILL.md`, `settings.json`, `README.md`, `LICENSE`, `package.json`）
- [x] negative checklist 全 10 項目非含有（`src/*.ts`, `.team/`, `.worktrees/`, `.config/`, `.envrc`, `.env`, `docs/`, `tsconfig.json`, `.gitignore`, `node_modules/`, `package-lock.json`）

---

## 2. npm pack --dry-run 実再実行の結果

### 2.1 `npm pack --dry-run` 単体（dist 削除直後）

```
npm notice 📦  nanobanana-adc@0.1.0
npm notice Tarball Contents
npm notice 1.1kB LICENSE
npm notice 4.9kB README.md
npm notice 3.8kB SKILL.md
npm notice 45B bin/nanobanana-adc
npm notice 1.3kB package.json
npm notice 1.1kB settings.json
npm notice Tarball Details
npm notice total files: 6
```

→ `dist/` が含まれないのは **npm の仕様通り**: `prepublishOnly` は `npm pack` では発火しないため、事前に build 済みでないと dist は tarball に入らない。実際の公開経路 (`npm publish`) では下記 2.2 の通り発火する。

### 2.2 `npm publish --dry-run`（dist 削除直後・本来の検証）

```
> nanobanana-adc@0.1.0 prepublishOnly
> npm run build

> nanobanana-adc@0.1.0 build
> tsc

npm notice 📦  nanobanana-adc@0.1.0
npm notice Tarball Contents
npm notice 1.1kB LICENSE
npm notice 4.9kB README.md
npm notice 3.8kB SKILL.md
npm notice 45B bin/nanobanana-adc
npm notice 1.7kB dist/auth.js
npm notice 1.3kB dist/cli.js
npm notice 4.2kB dist/generate.js
npm notice 1.3kB package.json
npm notice 1.1kB settings.json
npm notice Tarball Details
npm notice name: nanobanana-adc
npm notice version: 0.1.0
npm notice filename: nanobanana-adc-0.1.0.tgz
npm notice package size: 6.8 kB
npm notice unpacked size: 19.5 kB
npm notice total files: 9
npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access (dry-run)
+ nanobanana-adc@0.1.0
```

→ 9 ファイルが意図通り含まれ、 summary §7 の貼付数値（6.8 kB / 19.5 kB / 9 files）と完全一致。独立再実行で再現性を確認。

---

## 3. TypeScript 型チェック結果

```
$ npx tsc --noEmit
exit=0
```

新規エラーなし。

---

## 4. 懸念事項

### 4.1 minor — Inspector 指示書 AC5 の検証手順と npm の実挙動に乖離
- 指示書は「`npm pack --dry-run` → dist が再生成されているか」の確認を求めているが、npm v7+ 以降 `prepublishOnly` は `npm publish` 系でのみ発火し `npm pack` では発火しない（手元の npm 10.9.2 で再現確認済み）。
- Implementer は plan §6.4 の誤解釈（"npm 7+ では pack/publish 両方で発火" → 実際は違う）を避け、summary §8 AC4 注記で仕様差を正直に明記した上で `npm publish --dry-run` で代替検証しており、妥当な対処。AC の**本来意図**（"publish 時に build 漏れが起きない"）は完全に充足。
- **Action**: `prepack` フックへの置換・併設は本 PR の範囲外。将来 CI で `npm pack` を tarball 作成に使う計画が出た時点で別タスク化すれば良い。

### 4.2 minor — summary の「既存 8 行」表現
- summary §3 に「末尾に 6 行追記（既存 8 行は unchanged）」とあるが、既存 `.gitignore` は実質 7 行（+末尾改行）。意味は通るが若干不正確。レポート品質評価のみで、機能面の問題なし。

### 4.3 minor — `.DS_Store` は予防的追加
- 現時点で tracked / untracked いずれにも存在せず、即座の効用はない。macOS 開発環境での誤コミット予防として妥当（plan §6.3 で言及済み）。

---

## 5. summary.md 品質確認

- [x] 変更ファイル一覧（`.gitignore`, `package.json` の 2 点）記載
- [x] `.gitignore` 追加行（`.worktrees/` / `.DS_Store`）の判断根拠明記
- [x] `.npmignore` 不要判断の根拠（files allowlist 優先ルール）明記
- [x] `npm pack --dry-run` の Tarball Contents をコードブロックで貼付
- [x] AC4 の npm 仕様差異を自発的に注記しており透明性高い

---

## 6. 環境情報

- Node: v22.15.0
- npm: 10.9.2
- 作業ディレクトリ: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-010-1776973089`
- branch: `task-010-1776973089/task`
- 検証ログ: `/tmp/t10-inspector-pack.log`, `/tmp/t10-inspector-publish.log`
