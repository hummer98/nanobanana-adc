# T05 検品結果: ビルド・bin 配線

- 対象タスク: T05 ビルド・bin 配線
- Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-005-1776969952`
- ブランチ: `task-005-1776969952/task`
- 検品実施日: 2026-04-24

---

## 1. 判定: **GO**

受け入れ基準 9 項目すべてを満たしている。実装・検証ともに plan.md の方針（案 A: ESM 静的 import）に沿っており、`npm link` 経由の動作も確認済み。

---

## 2. チェックリスト（受け入れ基準）

| # | 基準 | 判定 | 根拠 |
| --- | --- | --- | --- |
| 1 | `tsconfig.json` に `outDir: "dist"` が設定されている | ✓ | `tsconfig.json:11` `"outDir": "dist"`。併せて `rootDir: "src"` (line 12) も確認。 |
| 2 | `npm run build` で `dist/cli.js` が生成される | ✓ | `npm run build` が正常終了、`ls -l dist/` で `auth.js` (1704B) / `cli.js` (1331B) / `generate.js` (4200B) を確認。 |
| 3 | `bin/nanobanana-adc` が shebang 付きで存在し、`dist/cli.js` を import する | ✓ | `bin/nanobanana-adc` 内容は `#!/usr/bin/env node` + `import '../dist/cli.js';` の 2 行。`file` コマンドでも `a /usr/bin/env node script text executable` と認識される。 |
| 4 | `bin/nanobanana-adc` に実行権限が立っている | ✓ | `ls -l` 出力 `-rwxr-xr-x`。impl-notes.md で `git diff --cached --summary` により `create mode 100755` になることも確認済み。 |
| 5 | `package.json` の `bin` フィールドに `"nanobanana-adc": "./bin/nanobanana-adc"` がある | ✓ | `package.json:7-9` に設定済み（T01 以降から継続）。 |
| 6 | `package.json` の `files` フィールドに配布物が列挙されている | ✓ | `package.json:10-17` に `dist/`, `bin/`, `SKILL.md`, `settings.json`, `README.md`, `LICENSE` の 6 項目が列挙されている。 |
| 7 | `./bin/nanobanana-adc --help` が動作する | ✓ | commander が生成する usage（`Usage: nanobanana-adc [options]` 以下 10 行）が exit 0 で表示されることを実機確認。 |
| 8 | `npm link` 後 `nanobanana-adc --help` が動作する | ✓ | `which nanobanana-adc` → `/Users/yamamoto/.anyenv/envs/nodenv/shims/nanobanana-adc`。`nanobanana-adc --help` / `--version (0.1.0)` ともに正常動作を実機で再確認。 |
| 9 | `bunx tsc --noEmit` で型エラーがない | ✓ | exit 0、出力なし。 |

### 追加検証（plan.md の 4.5 / 6.3 対応）

- **`npm pack --dry-run`**: 同梱ファイルは `bin/nanobanana-adc` / `dist/auth.js` / `dist/cli.js` / `dist/generate.js` / `package.json` の 5 点のみ。`src/`, `node_modules/`, `.team/`, `docs/` は含まれない。`files` に列挙されているが未作成の `SKILL.md` / `settings.json` / `README.md` / `LICENSE` は npm が黙って無視しており期待通り。
- **シンボリックリンク経由の ESM 相対 import (plan.md 6.3)**: Node 22 + nodenv shim 経由でも `import '../dist/cli.js'` が正しく解決され、フォールバック実装（`fileURLToPath` 経由）は不要と確認。

---

## 3. Fix Required

なし（GO のため）。

---

## 4. Notes

- `git status` 時点の変更は `M package.json` と `?? bin/` のみで、`dist/` は `.gitignore` により無視されている。plan.md の方針（`dist/` は Git 管理外）に合致。コミット時の差分範囲は想定通り。
- `npm link` 検証のため、グローバルに `nanobanana-adc` のシンボリックリンクが残存している（`/Users/yamamoto/.anyenv/envs/nodenv/versions/22.15.0/lib/node_modules/nanobanana-adc` → worktree）。T06 以降で再利用するため残置判断は妥当。検証環境をクリーンにしたい場合は `npm unlink -g nanobanana-adc` を実行すること。
- `files` フィールドの先行列挙（T06/T07 で作成予定の `SKILL.md` / `settings.json` / `README.md` / `LICENSE`）は、現時点では `npm pack --dry-run` に現れないが副作用もなし。後続タスクで追加されれば自動的に同梱される。
- impl-notes.md は検証手順・出力・mode 確認まで丁寧に記録されており、検品に必要な情報が揃っている。
