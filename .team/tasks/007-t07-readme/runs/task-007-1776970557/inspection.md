# Inspection Report — T07 README/LICENSE/package.json

## 判定
**GO**

## 検品結果
- [x] README: project description, ADC emphasis
- [x] README: install × 2
- [x] README: CLI examples (≥ 3)
- [x] README: env vars table
- [x] README: ADC setup steps
- [x] README: API key fallback
- [x] README-impl consistency（CLI options match src/cli.ts）
- [x] LICENSE: MIT standard text, 2026, nanobanana-adc contributors
- [x] package.json: license, keywords, repository, homepage added
- [x] tsc --noEmit passes

## 所見

### git status（想定どおり 3 ファイルのみ）
```
 M package.json
?? LICENSE
?? README.md
```
他ファイルへの副作用なし。`src/` は非変更で、作業境界を守っている。

### README.md（143 行、英語）
- 冒頭のタグライン（L3）で「first-class Application Default Credentials support」を明示し、ADC が唯一の差別化軸であることを blockquote で最初に読ませている。
- `## Why nanobanana-adc?` セクションで cc-nano-banana / ccskill-nanobanana / skill-nano-banana が `GEMINI_API_KEY` しか受けないという空白地帯を具体的に指摘し、Vertex AI + ADC が必要な企業環境・CI/CD・Cloud Run を埋めると明言。seed.md の方針と完全に整合。
- Installation: Claude Code plugin（`/plugin marketplace add` + SessionStart hook の言及）と npm install -g の両方を提示。
- Quick start: gcloud login → GCP project/location/vertex 環境変数 → 生成コマンド、の順でステップバイステップ。
- Examples: 5 例（basic / aspect+size / portrait 4K / model override / api-key fallback）。
- Options テーブルが `src/cli.ts:17-30` と完全一致:
  - `--prompt/-p` required
  - `--output/-o` default `output.png`
  - `--aspect/-a` default `1:1`、10 種
  - `--size/-s` default `1K`、choices `1K/2K/4K`
  - `--model/-m` default `gemini-3-pro-image-preview`
  - `--api-key`
- Authentication の Resolution order（`--api-key` → `GEMINI_API_KEY` → ADC）が `src/auth.ts` の実装順と一致。
- Environment variables 表に `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` / `GOOGLE_GENAI_USE_VERTEXAI` / `GOOGLE_APPLICATION_CREDENTIALS` / `GEMINI_API_KEY` をすべて収録。`GOOGLE_GENAI_USE_VERTEXAI` は plan §6.3 の指針どおり "Set to `true` to make the Vertex AI mode explicit." と書かれており、将来実装が env を参照しても齟齬が出ない表現になっている。

### LICENSE
- `head -1` → `MIT License`（OK）
- `Copyright (c) 2026 nanobanana-adc contributors` が 1 行（OK）
- 標準 MIT 文面の `THE SOFTWARE IS PROVIDED "AS IS"` を含む（OK）
- 末尾改行あり。

### package.json
- `jq . package.json` parse OK。
- `license`: `"MIT"` 追加済み。
- `keywords`: 13 個（gemini / gemini-3 / nano-banana / nano-banana-pro / vertex-ai / adc / application-default-credentials / image-generation / text-to-image / claude-code / claude-code-plugin / gcp / cli）。受け入れ基準の gemini / nano-banana / vertex-ai / adc / image-generation / claude-code-plugin をすべて包含。
- `repository`: `{ "type": "git", "url": "git+https://github.com/yamamoto/nanobanana-adc.git" }` 追加済み。
- `homepage`: `https://github.com/yamamoto/nanobanana-adc#readme` 追加済み。
- `bugs.url`: 追加済み（plan §4 の補足どおり）。
- 既存の `description` / `bin` / `files` / `dependencies` / `scripts` / `engines` などはすべて保持。既存 `files` に `README.md` と `LICENSE` が含まれており、追加作業不要という plan §6.5 の観察どおり。

### 既存コード影響
- `npx tsc --noEmit` エラーなし（無出力で成功）。
- `bin/nanobanana-adc` 実行権限保持（`test -x` OK）。

### GO コメント（任意の改善余地、今回の NOGO 条件ではない）
- `repository.url` / `homepage` / `bugs.url` が `yamamoto` プレースホルダのまま。実 GitHub org/user が決まったタイミングで差し替えること（plan §4 補足で既に意識されている）。
- README の Features 箇条書き中「Ships as both an npm binary and a Claude Code plugin from the same repo.」は正しいが、Claude Code plugin marketplace の実 org 名が決まれば Installation セクションの `yamamoto/nanobanana-adc` も同時に更新する必要がある。
- plan §6.3 が指摘している通り、`GOOGLE_GENAI_USE_VERTEXAI` は現状コード上で参照されていない（`src/auth.ts` は `GOOGLE_CLOUD_PROJECT` と `GOOGLE_CLOUD_LOCATION` のみで ADC モードを判定）。本タスクは docs スコープなので修正不要だが、将来の T08 以降で実装整合を取るか、env の記述をさらに明確化するかの判断が必要。

## Fix Required（NOGO のみ）
なし。
