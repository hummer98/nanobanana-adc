# Inspection Report: task-012 / v0.2.0

## Verdict
**GO**

## Summary

Implementer は plan.md / design-review.md / research.md の narrowing 方針を忠実に守り、`--person-generation` 1 オプションのみを両経路に対称に追加した。コードは `assertAspect` と同じ type predicate パターンを踏襲し、条件付き spread により未指定時の挙動を regression-free に保っている。ビルド・型・smoke（invalid reject / lowercase 正規化 / ADC 実生成 1 枚）すべて再現済みで、`/tmp/nanobanana-adc-test-012.png` は 1024×1024 PNG として summary のログと一致した。

design-review の「必須」推奨（ADC 経路 1 枚の実生成復活）は対応済み、「推奨」3 件（lowercase alias / CHANGELOG scope notes の扱い / package-lock sync / Tier rejection 注記のニュアンス）もすべて取り込まれている。scope 外ファイル（`src/auth.ts`, `bin/`, `docs/seed.md`, `skills/.../SKILL.md`, `.gitignore`, `.github/workflows`, `.npmrc`）は diff なしで確認。summary §5.2 で発見された「AI Studio v1beta が `personGeneration` を field レベルで reject する」挙動も再現でき、README / CHANGELOG に正しく反映されている。

## Checklist 結果

### A. コード (Correctness & 規約適合)
- ✅ `PERSON_GENERATION_MODES = ['ALLOW_ALL', 'ALLOW_ADULT', 'ALLOW_NONE'] as const` — 順序・値とも一致 (`src/generate.ts:19-23`)
- ✅ `assertPersonGeneration` が `asserts value is PersonGeneration` の type predicate で `assertAspect` と同じ形 (`src/generate.ts:64-72`)
- ✅ `GenerateOptions.personGeneration?: PersonGeneration` が optional (`src/generate.ts:34`)
- ✅ Vertex fetch body (`src/generate.ts:118-124`) と SDK body (`src/generate.ts:178-184`) の両方に条件付き spread — 未指定時は field 自体を送らない
- ✅ `src/cli.ts` `.version('0.2.0')` (`src/cli.ts:18`)
- ✅ `--person-generation <mode>` を `addOption(new Option(...).choices(...).argParser(...))` で定義 (`src/cli.ts:33-45`)
- ✅ `argParser` で `toUpperCase()` + 再検証 + `InvalidArgumentError` → commander 標準フォーマットで exit 1
- ✅ `if (opts.personGeneration) { assertPersonGeneration(...); ... }` の undefined ガードあり (`src/cli.ts:71-74`)
- ✅ CLAUDE.md 遵守: `src/auth.ts` は diff 0、region-less host 分岐保存 (`src/generate.ts:103-107`)、ADC 経路は条件付き spread のため未指定時挙動完全維持

### B. ビルド / 型 / help 出力
- ✅ `npm run typecheck` → 0 errors
- ✅ `npm run build` → 0 errors、`dist/cli.js` (1931 bytes) 生成
- ✅ `node dist/cli.js --version` → `0.2.0`
- ✅ `node dist/cli.js --help` に `--person-generation <mode>  control person generation (choices: "ALLOW_ALL", "ALLOW_ADULT", "ALLOW_NONE")` が表示
- ✅ `--person-generation invalid` → `exit 1` + `error: option '--person-generation <mode>' argument 'invalid' is invalid. Allowed choices are ALLOW_ALL, ALLOW_ADULT, ALLOW_NONE.`
- ✅ `--person-generation allow_adult --api-key INVALID` → argParser で `ALLOW_ADULT` に正規化された後に `[auth] using: api-key` → API error まで進行 (大文字化 OK の挙動確認)

### C. バージョン同期
- ✅ `package.json` → `0.2.0`
- ✅ `package-lock.json` root → `0.2.0`
- ✅ `.claude-plugin/plugin.json` → `0.2.0`
- ✅ `.claude-plugin/marketplace.json` plugins[0].version → `0.2.0`
- ✅ `src/cli.ts` `.version('0.2.0')`
- ✅ `CHANGELOG.md` に `## [0.2.0] - 2026-04-24` セクション存在

### D. ドキュメント
- ✅ `README.md` Options 表に行追加 (L85)、Usage example §6 (L72)、`> Note on --person-generation` 注記 (L87)
- ✅ `README.ja.md` に対応する日本語訳 (L72, L85, L87)
- ✅ `CHANGELOG.md` の 0.2.0 セクション — design-review §推奨案 (b) に従い Scope notes を `### Added` 直前の段落で見出しなし
- ✅ `.team/` への内部リンクなし (design-review Q3)
- ✅ Tier rejection 注記は "There are also reports that... not yet confirmed for the Gemini API path" のニュアンスを保持
- ✅ summary §5.2 の発見（AI Studio v1beta が `personGeneration` を未認識）が README 注記と CHANGELOG の `## [0.2.0]` 本文に明記

### E. コミット / git state
- ✅ branch = `task-012-1777016849/task`
- ✅ origin/main から 3 コミット ahead (`feat:` / `docs:` / `chore:`)
- ✅ Conventional Commits 準拠
- ✅ commit 本文に co-author 行や不要な装飾なし（各 commit の body は変更理由の簡潔な説明のみ）
- ✅ `git ls-files | grep -E '^dist/'` → 空（`dist/` untracked）
- ✅ working tree clean

### F. 動作確認
- ✅ `/tmp/nanobanana-adc-test-012.png` 存在、`PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced`、1.77 MiB、mtime `4月 24 17:16` で summary §3 のログと完全一致

### G. scope 逸脱チェック
- ✅ `--count` / `--seed` / `--mime` / `--negative-prompt` は追加されていない（`grep -n "option" src/cli.ts` で新規追加は `--person-generation` のみ確認）
- ✅ `src/auth.ts` / `bin/nanobanana-adc` / `docs/seed.md` / `skills/nanobanana-adc/SKILL.md` の diff 0
- ✅ `.gitignore` の diff 0
- ✅ `.github/workflows/` / `.npmrc` の diff 0

### H. summary.md の信頼性
- ✅ summary の主張（型追加位置、条件付き spread 2 箇所、argParser の toUpperCase、opts 伝搬時の undefined ガード）はすべて `git diff` で実コードと一致
- ✅ §5.2 の「AI Studio v1beta が `400 Unknown name "personGeneration"` を返す」を `env -u GEMINI_API_KEY node dist/cli.js --prompt x --person-generation allow_adult --api-key INVALID` で再現確認（`[auth] using: api-key` → `Error: [generate] API error: [GoogleGenerativeAI Error]: ... [400 Bad Request] Invalid JSON payload received. Unknown name "personGeneration" at 'generation_config.image_config': Cannot find field.` が返る）
- ✅ 判断ログ（§5.1 commander 14 の argParser / choices 評価順序、§5.2 v1beta 未対応、§5.3 README 注記統合、§5.4 env -u 経路）は plan §4 Step 4 / design-review §推奨 / §Q3 と矛盾なし

## Findings

### Critical (修正必須)
なし

### Minor (GO 可能、将来考慮)
- CHANGELOG の冒頭段落（Scope notes の実質本文）に「AI Studio v1beta では field が未認識」の一文が `### Added` 側に入っているため、Notes-then-Added の分担が若干重複している。実害なし、可読性優先の判断として受容可。
- `src/cli.ts` の `argParser` と `choices()` の共存は commander 14 での評価順序依存（summary §5.1 に実装根拠あり）。将来 commander が major bump する際に動作回帰を smoke で再確認する必要あり — plan §11.2 の「enum 拡張時の更新」と併せて残リスクとして記録しておくとよい（本タスクでは NOGO 根拠にしない）。

## Fix Required
（GO のため該当なし）

## References

### 読んだファイル
- `/Users/yamamoto/git/nanobanana-adc/.team/tasks/012-t12-v0-2-0-gemini-3-pro-image-api-cli/runs/task-012-1777016849/plan.md`
- `/Users/yamamoto/git/nanobanana-adc/.team/tasks/012-t12-v0-2-0-gemini-3-pro-image-api-cli/runs/task-012-1777016849/design-review.md`
- `/Users/yamamoto/git/nanobanana-adc/.team/tasks/012-t12-v0-2-0-gemini-3-pro-image-api-cli/runs/task-012-1777016849/summary.md`
- `/Users/yamamoto/git/nanobanana-adc/.team/tasks/012-t12-v0-2-0-gemini-3-pro-image-api-cli/runs/task-012-1777016849/conductor-prompt.md`
- `CLAUDE.md`, `CHANGELOG.md`, `README.md`, `README.ja.md`
- `src/cli.ts`, `src/generate.ts`
- `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

### 実行したコマンド
```bash
git status && git branch --show-current && git log --oneline origin/main..HEAD
git diff origin/main..HEAD --stat
git diff origin/main..HEAD -- src/auth.ts bin/nanobanana-adc docs/seed.md skills/nanobanana-adc/SKILL.md .gitignore .github/workflows .npmrc
git diff origin/main..HEAD src/cli.ts src/generate.ts
git log --format="%H %s%n---%b---" origin/main..HEAD
git ls-files | grep -E '^dist/'
grep -rEn '"version"' package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json
grep -n ".version(" src/cli.ts
grep -n -A 5 "person-generation" README.md README.ja.md
grep -n ".team/" README.md README.ja.md CHANGELOG.md
npm run typecheck
npm run build
node dist/cli.js --version
node dist/cli.js --help
node dist/cli.js --prompt x --person-generation invalid; echo "exit=$?"
env -u GEMINI_API_KEY node dist/cli.js --prompt x --person-generation allow_adult --api-key INVALID
ls -la /tmp/nanobanana-adc-test-012.png && file /tmp/nanobanana-adc-test-012.png
head -10 package-lock.json
```

### 課金実行
なし（plan §10.5 / design-review §必須 に従い、ADC 1 枚生成は Implementer が既に実施済み。Inspector は summary §3 のログと `/tmp/nanobanana-adc-test-012.png` のメタデータで信頼）。
