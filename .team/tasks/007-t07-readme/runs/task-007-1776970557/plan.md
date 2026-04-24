# T07 実装計画 — README・ドキュメント整備

## 1. 概要

本タスクの成果物は以下 3 ファイル（うち 1 つは新規、1 つは更新、1 つは新規）。

| 操作 | パス | 内容 |
|------|------|------|
| 新規 | `README.md` | 英語で書くプロジェクト README。ADC 対応を中核メッセージに据える。 |
| 新規 | `LICENSE` | MIT License 標準文面。`2026 nanobanana-adc contributors`。 |
| 更新 | `package.json` | `keywords` / `repository` / `homepage` / `license` を追加。`description` は既存のまま維持（十分記述的）。 |

作業境界:
- Planner は plan.md を書くのみ。コード/設定には手を入れない。
- `src/cli.ts` / `src/auth.ts` / `src/generate.ts` の実装と docs/seed.md の記述に齟齬はほぼ無いが、**1 点だけ注意点あり**（後述 §6）。

---

## 2. README.md の章立て案

言語: **英語**（npm / GitHub でのリーチ優先。日本語版は今回スコープ外）。
ファイル末尾に改行を含める。行末トレイリング空白なし。

### 2.1 推奨セクション順

```
# nanobanana-adc

> One-line tagline (see below)

## Why nanobanana-adc?
## Features
## Installation
  ### As a Claude Code plugin
  ### As a standalone CLI (npm install -g)
## Quick start
## Usage
  ### Examples
  ### Options
## Authentication
  ### Option A — Application Default Credentials (recommended)
  ### Option B — API key (fallback)
  ### Resolution order
## Environment variables
## Development
## License
```

### 2.2 各セクションに書く要点

**タグライン（H1 直下の blockquote）**
- 例: `> Gemini 3 Pro Image (Nano Banana Pro) CLI with first-class Application Default Credentials support — use Vertex AI from CI, Cloud Run, or any gcloud-authenticated workstation without handing out API keys.`
- **ADC 対応が唯一の差別化軸である**ことを最初の 1 行で読ませる。

**Why nanobanana-adc?**
- 既存 Claude Code skill（cc-nano-banana / ccskill-nanobanana / skill-nano-banana 等）は `GEMINI_API_KEY` しか受けない。
- Vertex AI + ADC が必須になる企業環境・CI/CD・Cloud Run での空白地帯を埋めるのがこの CLI の存在理由。
- seed.md の「唯一の差別化軸は ADC 対応」を英語で言い換えて明示する。

**Features**
- 箇条書き 4〜6 個:
  - ADC authentication via `google-auth-library` (default).
  - `GEMINI_API_KEY` fallback for lightweight setups.
  - 10 aspect ratios (1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, 5:4) — `ASPECT_MAP` の実装と一致。
  - 3 resolutions: 1K / 2K / 4K.
  - Ships as both an npm binary and a Claude Code plugin from the same repo.
  - TypeScript, strict mode, Node.js ≥ 18.

**Installation — As a Claude Code plugin**
```bash
/plugin marketplace add yamamoto/nanobanana-adc
```
- SessionStart フックが `npm install --omit=dev` を `${CLAUDE_PLUGIN_DATA}` 側で走らせる旨を 1〜2 行で言及。
- seed.md の該当節に沿う。

**Installation — As a standalone CLI**
```bash
npm install -g nanobanana-adc
# or: npx nanobanana-adc --prompt "..."
```

**Quick start**
- 最短コマンド 1 本（ADC 前提）:
```bash
export GOOGLE_CLOUD_PROJECT=my-project
export GOOGLE_CLOUD_LOCATION=us-central1
export GOOGLE_GENAI_USE_VERTEXAI=true
gcloud auth application-default login
nanobanana-adc --prompt "a cat in space" --output cat.png
```

**Usage — Examples（5 例。seed.md + src/cli.ts と整合）**
1. Basic — `nanobanana-adc --prompt "a cat in space" --output cat.png`
2. Aspect + size — `nanobanana-adc -p "neon skyline at dusk" -a 16:9 -s 2K -o skyline.png`
3. Portrait, 4K — `nanobanana-adc -p "..." --aspect 9:16 --size 4K`
4. Override model — `nanobanana-adc -p "..." --model gemini-3-pro-image-preview`
5. API-key fallback — `nanobanana-adc -p "..." --api-key "$GEMINI_API_KEY"`

**Usage — Options テーブル**

| Flag | Alias | Default | Description |
|------|-------|---------|-------------|
| `--prompt` | `-p` | — (required) | Prompt text. |
| `--output` | `-o` | `output.png` | Output file path. |
| `--aspect` | `-a` | `1:1` | Aspect ratio. One of 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, 5:4. |
| `--size` | `-s` | `1K` | Image size. One of 1K, 2K, 4K. |
| `--model` | `-m` | `gemini-3-pro-image-preview` | Model ID. |
| `--api-key` | — | — | Explicit Gemini API key (overrides env / ADC). |

（デフォルト値・alias は `src/cli.ts:17-30` と完全一致。§6 で再確認済。）

**Authentication — Option A: ADC（推奨、step-by-step）**
```bash
# 1. Sign in for application-default credentials.
gcloud auth application-default login

# 2. Point at your Vertex AI project and region.
export GOOGLE_CLOUD_PROJECT=my-project
export GOOGLE_CLOUD_LOCATION=us-central1
export GOOGLE_GENAI_USE_VERTEXAI=true

# 3. Generate an image — no API key needed.
nanobanana-adc --prompt "a cat in space" --output cat.png
```
- CI / Cloud Run では `GOOGLE_APPLICATION_CREDENTIALS` でサービスアカウント JSON を指す方法も 2 行で補足。

**Authentication — Option B: API key（fallback）**
```bash
export GEMINI_API_KEY=...
nanobanana-adc --prompt "a cat in space" --output cat.png
# or pass inline:
nanobanana-adc --prompt "..." --api-key "$GEMINI_API_KEY"
```

**Authentication — Resolution order**
1. `--api-key` CLI flag
2. `GEMINI_API_KEY` env var
3. ADC (via `google-auth-library`) — default, main use case
- `src/auth.ts:7-51` の優先順と一致。

**Environment variables テーブル**（seed.md を英訳）

| Variable | Required | Purpose |
|----------|----------|---------|
| `GOOGLE_CLOUD_PROJECT` | ADC mode | GCP project ID. |
| `GOOGLE_CLOUD_LOCATION` | ADC mode | Region, e.g. `us-central1`. |
| `GOOGLE_GENAI_USE_VERTEXAI` | ADC mode | Set to `true`. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional | Path to service-account JSON. Falls back to gcloud user credentials if unset. |
| `GEMINI_API_KEY` | Fallback | Used when ADC env is not set. |

**Development**
- `npm install` → `npm run build` → `node dist/cli.js --help`（または `npm link` 後 `nanobanana-adc --help`）。
- Requires Node.js ≥ 18（`engines.node` と一致）。

**License**
- `MIT — see [LICENSE](./LICENSE).` の 1 行。

---

## 3. LICENSE の内容

ファイル名: `LICENSE`（拡張子なし、ルート直下）。
標準 MIT License 文面（[opensource.org/license/mit](https://opensource.org/license/mit)）をそのまま使う。
差し替える箇所は copyright 行のみ:

```
MIT License

Copyright (c) 2026 nanobanana-adc contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

固定要素:
- Copyright holder: `nanobanana-adc contributors`
- Year: `2026`
- 末尾に改行 1 つ。

---

## 4. package.json に追加する具体 JSON

既存の `package.json`（T01 で作成済）の構造は保持し、以下のキーを追加する。
`description` は既存値 `"Gemini 3 Pro Image CLI with Application Default Credentials (ADC) support"` をそのまま維持（ADC 対応を明示していて十分洗練されている）。
`license` は現状未設定なので追加必須。

追加するフィールド（挿入位置は `description` 付近・`files` の前あたりが読みやすい）:

```json
{
  "license": "MIT",
  "keywords": [
    "gemini",
    "gemini-3",
    "nano-banana",
    "nano-banana-pro",
    "vertex-ai",
    "adc",
    "application-default-credentials",
    "image-generation",
    "text-to-image",
    "claude-code",
    "claude-code-plugin",
    "gcp",
    "cli"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/yamamoto/nanobanana-adc.git"
  },
  "homepage": "https://github.com/yamamoto/nanobanana-adc#readme",
  "bugs": {
    "url": "https://github.com/yamamoto/nanobanana-adc/issues"
  }
}
```

補足:
- `bugs` はタスク要件には明示されていないが、npm registry が `homepage` / `repository` と併せて自動的に出力する慣習があり、プレースホルダとして載せておくと将来の `yamamoto` → 実 org rename 時の差分が小さくなる（プレースホルダで OK）。必要なら省略可。
- `keywords` は npm 検索で Claude Code plugin と Vertex AI の両軸から見つけられるよう、`claude-code` / `claude-code-plugin` / `vertex-ai` / `adc` / `nano-banana` / `gemini-3` を必ず含める。
- JSON 追加時は既存キーとの重複（特に `description`）を作らない。

---

## 5. 検証手順

Implementer は以下を順に通すこと。

1. **JSON 構文**
   ```bash
   jq . package.json >/dev/null
   ```
   エラー 0 で exit すること。

2. **package.json 必須キー**
   ```bash
   jq -r '.license, .keywords|type, .repository.type, .homepage' package.json
   ```
   順に `MIT`, `array`, `git`, URL 文字列が出ること。

3. **LICENSE の標準 MIT 文面**
   ```bash
   head -1 LICENSE                          # → "MIT License"
   grep -c "Copyright (c) 2026 nanobanana-adc contributors" LICENSE  # → 1
   grep -c "THE SOFTWARE IS PROVIDED \"AS IS\"" LICENSE              # → 1
   ```

4. **README の Markdown が壊れていない**
   - `npx --yes markdownlint-cli README.md` を試す、もしくは
   - GitHub preview / VSCode preview で視覚確認。
   - コードフェンス（```）が全て閉じているか、表が崩れていないかを最低限確認。

5. **ビルド影響が出ていない**
   ```bash
   npm run typecheck
   npm run build
   ```
   既存挙動を壊していないこと（今回のタスクでは `src/` を触らないので通って当然だが念のため）。

6. **`files` フィールドとの整合**
   既存 `package.json:10-17` の `files` には `README.md` と `LICENSE` が既に含まれている。追加ファイルがパッケージに取り込まれることを `npm pack --dry-run` で確認可能（T08 で本格検証するため、本タスクでは任意）。

---

## 6. 既存 src との整合性チェック

Planner として、実装と docs の突き合わせをあらかじめ済ませてある。Implementer は README を書くときに以下の事実に従うこと。

### 6.1 CLI オプション（`src/cli.ts:17-30` で確認）

| README に書く内容 | 実装での根拠 | 一致？ |
|-------------------|--------------|--------|
| `--prompt` / `-p` 必須 | `.requiredOption('-p, --prompt <text>', ...)` | ✓ |
| `--output` / `-o` 既定 `output.png` | `.option('-o, --output <path>', ..., 'output.png')` | ✓ |
| `--aspect` / `-a` 既定 `1:1`、10 種 | `.option('-a, --aspect <ratio>', '...(1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, 5:4)', '1:1')` | ✓ |
| `--size` / `-s` 既定 `1K`、choices `1K/2K/4K` | `.addOption(new Option('-s, --size <size>').choices(['1K','2K','4K']).default('1K'))` | ✓ |
| `--model` / `-m` 既定 `gemini-3-pro-image-preview` | `.option('-m, --model <id>', 'model id', 'gemini-3-pro-image-preview')` | ✓ |
| `--api-key` | `.option('--api-key <key>', ...)` | ✓ |

→ README の Options 表はそのまま上記に従って書いて OK。

### 6.2 認証優先順位（`src/auth.ts:7-51` で確認）

実装は `--api-key` → `GEMINI_API_KEY` → ADC の順。seed.md の §「認証優先順位」と完全一致。README の "Resolution order" セクションもこの順で書く。

### 6.3 環境変数の扱い — **注意点 1 つ**

- `src/auth.ts` が **ADC モード成立のために必須として確認しているのは `GOOGLE_CLOUD_PROJECT` と `GOOGLE_CLOUD_LOCATION` のみ**（`src/auth.ts:19-25`）。
- `GOOGLE_GENAI_USE_VERTEXAI=true` は **コードでは参照されていない**。seed.md と tasks.md は「必須」として載せているが、実装上は Vertex AI モードを `auth.mode === 'adc'` の分岐で強制しており、環境変数では制御していない（`src/generate.ts:182-186`）。
- `GOOGLE_APPLICATION_CREDENTIALS` は `google-auth-library` 側で自動参照される（コード内で明示的には読まない）。

**Implementer への指針:**
- README には **seed.md / tasks.md と整合させる** ため `GOOGLE_GENAI_USE_VERTEXAI=true` を ADC セットアップ手順に含める（受け入れ基準 §1 の「ADC セットアップ手順」に明記されているため）。
- ただし README の Environment variables テーブルでは `GOOGLE_GENAI_USE_VERTEXAI` の "Required" 列を "ADC mode" としつつ、説明文で "Set to `true` to make the Vertex AI mode explicit." のように書くと、将来実装が環境変数を真に参照するようになった時も齟齬が出にくい。
- この不一致を「実装バグ」として直すのは **T07 のスコープ外**（Planner はコード変更しない）。気づきとしてここに記録するに留める。

### 6.4 既定モデル

- `src/cli.ts:29` の `'gemini-3-pro-image-preview'` と docs/tasks.md §T03 の既定モデルは一致。README でも同値を使うこと。

### 6.5 package.json の既存値（`package.json:1-34` で確認）

- `name`: `nanobanana-adc` ✓
- `version`: `0.1.0` ✓
- `description`: 既存のまま維持で OK（ADC 対応を既に明記）。
- `type`: `module` — README の使用例は CJS ではなく ESM 前提なので `node dist/cli.js` で動く。
- `bin`: `./bin/nanobanana-adc` ✓（T05 完了）
- `files`: `dist/`, `bin/`, `SKILL.md`, `settings.json`, `README.md`, `LICENSE` — 本タスクで追加する `README.md` / `LICENSE` は既に `files` に入っている。追加作業不要。
- `license`: **未設定** → 追加必須。
- `keywords` / `repository` / `homepage` / `bugs`: **未設定** → 追加。

---

## 7. 作業順序（Implementer 向け）

1. `LICENSE` を作成（§3 の文面をそのままコピペ）。
2. `package.json` を更新（§4 の JSON を追加、`description` は据え置き）。`jq . package.json` で検証。
3. `README.md` を作成（§2 の章立てに従い英語で執筆、§6 の事実に従って CLI/環境変数を書く）。
4. §5 の検証手順をすべて走らせる。
5. 成果物を PR 用にステージ（`git add README.md LICENSE package.json`）。コミットは Conductor / Executor の慣習に従う。
