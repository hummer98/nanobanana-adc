# T06 実装計画 — Claude Code plugin 設定（`SKILL.md` / `settings.json`）

## 1. 概要

`/plugin marketplace add <owner>/nanobanana-adc` でインストールされたとき、Claude Code が初回セッションから `nanobanana-adc` CLI を起動できるようにする。リポジトリ直下に 2 ファイルを追加する:

- `SKILL.md` — Skill（slash-command）定義。frontmatter + 使い方 + 環境変数表。
- `settings.json` — SessionStart フック。`${CLAUDE_PLUGIN_DATA}` に `node_modules` を展開し、必要なら `dist/` を build する。

コード側の変更は行わない。`bin/nanobanana-adc`（T05 完了済）は Claude Code 公式仕様により plugin の `bin/` が Bash ツールの PATH に自動追加されるため、そのままで実行可能になる。

---

## 2. 設計判断

### 2.1 slash command 名 → **`/nanobanana-adc:nanobanana-adc`**

- Skill 名は plugin 名と揃える（`name: nanobanana-adc`）。plugin namespace が付くので発話は `/nanobanana-adc:nanobanana-adc ...`。
- 根拠:
  - CLI 名・npm パッケージ名と一致 → 検索性・記憶しやすさ。
  - 既存スキル（`cc-nano-banana` / `skill-nano-banana`）はいずれも本体名ベース。
  - 短縮名（`/nb` / `/generate-image`）は衝突リスクがあるため採用しない。
- 公式 Skill 仕様（`code.claude.com/docs/en/plugins-reference.md` 参照）では plugin 配下の skill は `/<plugin>:<skill>` 形式で呼ばれる。

### 2.2 `SKILL.md` frontmatter

Anthropic の Skill 仕様に基づき以下を採用:

```yaml
---
name: nanobanana-adc
description: Generate images with Google's Nano Banana Pro (Gemini 3 Pro Image) using Application Default Credentials (ADC) or a GEMINI_API_KEY. Use this when the user asks to create, generate, draw, or render an image via Google/Vertex AI/Gemini.
---
```

- **`name`**: plugin 名と同じ `nanobanana-adc`。
- **`description`**: モデル自動起動のためのトリガ情報を含める。「create / generate / draw / render」「Google / Vertex AI / Gemini」等のキーワードを意図的に詰める。
- `allowed-tools` 等の任意フィールドは最小構成のため指定しない（Implementer が必要と判断したら追記）。

### 2.3 `SKILL.md` 本文構成

1. **Overview**（1 段落）— 何ができる skill か。ADC 対応が差別化軸であることを明示。
2. **When to use** — モデル向けトリガ条件（「画像生成を頼まれたとき」「Vertex AI / ADC 構成が必要なとき」等）。
3. **Quick examples**（2〜3 個）— 最低でも ADC モード・API key モードを示す。
4. **Options** — `--prompt` / `--output` / `--aspect` / `--size` / `--model` / `--api-key` の簡易表（`src/cli.ts:13-30` と一致させる）。
5. **Environment variables** — 表形式（下の 3.3 節に具体値）。
6. **Authentication priority** — `--api-key` → `GEMINI_API_KEY` → ADC の順（seed.md の「認証優先順位」と一致）。
7. **Troubleshooting** — ADC 未設定、プロジェクト未設定、`gcloud auth application-default login` 必要時の対処 1〜2 項目。

### 2.4 PATH 注入方針 → **自動 PATH（公式仕様）に依存、SessionStart での PATH 操作はしない**

- `code.claude.com/docs/en/plugins-reference.md` に "Executables in `bin/` are added to the Bash tool's PATH. Files here are invokable as bare commands in any Bash tool call while the plugin is enabled." と明記。
- したがって `bin/nanobanana-adc` は plugin 有効時、Bash ツールから `nanobanana-adc --prompt ...` と **そのまま**呼べる。
- `settings.json` 側で `export PATH=...` を SessionStart する案は採用しない。理由:
  1. hook プロセスの export は後続 Bash ツール呼び出しに伝播しない（独立シェル）。
  2. 公式仕様で自動化されている領域を二重化する必要がない。

### 2.5 `${CLAUDE_PLUGIN_DATA}` での `npm install` 冪等性 → **seed.md の `diff -q` パターンを踏襲**

seed.md の hook をベースに、依存関係再インストールは `${CLAUDE_PLUGIN_ROOT}/package.json` と `${CLAUDE_PLUGIN_DATA}/package.json` の差分で判定。毎セッション起動時に走るが、差分が無ければ `diff -q` が即 return するため実質 no-op。

### 2.6 `dist/` が無い場合の fallback → **SessionStart で build も行う**

問題: `/plugin marketplace add` は git clone 経路のため、`.gitignore` で除外されている `dist/` は含まれない。`bin/nanobanana-adc` は `import '../dist/cli.js'` を参照する（`bin/nanobanana-adc:2`）。

対策として SessionStart フックを 3 段階チェーンにする:

1. **deps 同期**（seed.md パターン）— `${CLAUDE_PLUGIN_DATA}` に prod 依存をインストール。
2. **`node_modules` リンク** — `${CLAUDE_PLUGIN_ROOT}/node_modules` から `${CLAUDE_PLUGIN_DATA}/node_modules` への symlink を張る。`dist/cli.js` は Node の解決ルールで親ディレクトリを遡って `node_modules` を探すため、これがないと `@google/generative-ai` 等が import できない。
3. **build fallback** — `${CLAUDE_PLUGIN_ROOT}/dist/cli.js` が無ければ、dev deps も含めて install し `npm run build` を実行。`npm publish` 経由のインストールでは `dist/` が同梱されるので通常このブランチは走らない（npm の `files` フィールドに `dist/` が含まれている — `package.json:10-17`）。

**別案と却下理由**:

- 「`dist/` を git 管理」→ 開発 DX を損ねる（毎コミットで差分発生）。
- 「bin を書き換えて DATA 側の `dist/` を参照」→ T06 スコープ外（bin は T05 で fix）。
- 「prepare スクリプトで自動 build」→ `--omit=dev` で TypeScript が入らず build できない。

---

## 3. `SKILL.md` の具体的内容（骨格）

```markdown
---
name: nanobanana-adc
description: Generate images with Google's Nano Banana Pro (Gemini 3 Pro Image) using Application Default Credentials (ADC) or a GEMINI_API_KEY. Use this when the user asks to create, generate, draw, or render an image via Google / Vertex AI / Gemini.
---

# nanobanana-adc

Image generation CLI built on Gemini 3 Pro Image (Nano Banana Pro). Unlike other
Claude Code image skills, this one works with **Application Default Credentials
(ADC)** on Vertex AI — required in enterprise / CI / Cloud Run / Cloud Build
environments where `GEMINI_API_KEY` is not available.

## When to use

Trigger this skill when the user wants to:
- Create / generate / draw / render an image via Google or Vertex AI.
- Use Gemini 3 Pro Image (`gemini-3-pro-image-preview`) from a corporate GCP
  project that uses ADC instead of a bare API key.
- Fall back to `GEMINI_API_KEY` when ADC is not set up.

## Quick examples

```bash
# ADC mode (default — uses gcloud / metadata server)
nanobanana-adc --prompt "a cat astronaut on mars, cinematic" --output cat.png

# 16:9 2K
nanobanana-adc --prompt "futuristic tokyo skyline" --aspect 16:9 --size 2K -o tokyo.png

# API key mode (explicit override)
nanobanana-adc --prompt "..." --api-key "$GEMINI_API_KEY" -o out.png
```

## Options

| Flag               | Default                     | Notes                                                |
|--------------------|-----------------------------|------------------------------------------------------|
| `-p, --prompt`     | (required)                  | Prompt text.                                         |
| `-o, --output`     | `output.png`                | Output file path.                                    |
| `-a, --aspect`     | `1:1`                       | `1:1` / `16:9` / `9:16` / `4:3` / `3:4` / `3:2` / `2:3` / `21:9` / `9:21` / `5:4`. |
| `-s, --size`       | `1K`                        | `1K` / `2K` / `4K`.                                  |
| `-m, --model`      | `gemini-3-pro-image-preview`| Override model.                                      |
| `--api-key`        | —                           | Falls back to `GEMINI_API_KEY` then ADC.             |

## Environment variables

| Variable                           | Required (ADC) | Purpose                                 |
|------------------------------------|----------------|-----------------------------------------|
| `GOOGLE_CLOUD_PROJECT`             | ✓              | GCP project id.                         |
| `GOOGLE_CLOUD_LOCATION`            | ✓              | Region (e.g. `us-central1`).            |
| `GOOGLE_GENAI_USE_VERTEXAI`        | ✓              | Must be `true`.                         |
| `GOOGLE_APPLICATION_CREDENTIALS`   | optional       | Path to ADC key file (else gcloud).     |
| `GEMINI_API_KEY`                   | fallback       | Used when ADC is not configured.        |

## Authentication priority

1. `--api-key` flag
2. `GEMINI_API_KEY` env var
3. ADC (`google-auth-library`)

## Troubleshooting

- **`Could not load the default credentials`** → run `gcloud auth application-default login` and set `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION`.
- **`PERMISSION_DENIED`** → ensure the ADC principal has `roles/aiplatform.user` on the project.
- **No image returned** → verify the model id (`--model gemini-3-pro-image-preview`) and that Vertex AI image generation is enabled on the project.
```

> Implementer: 上記本文は骨格。具体的な値は必要に応じて seed.md / `src/cli.ts` と照合して最終化すること。

---

## 4. `settings.json` の具体的内容

seed.md の JSON を起点に、3 段階 hook に拡張:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "diff -q \"${CLAUDE_PLUGIN_ROOT}/package.json\" \"${CLAUDE_PLUGIN_DATA}/package.json\" >/dev/null 2>&1 || (mkdir -p \"${CLAUDE_PLUGIN_DATA}\" && cp \"${CLAUDE_PLUGIN_ROOT}/package.json\" \"${CLAUDE_PLUGIN_DATA}/\" && { [ -f \"${CLAUDE_PLUGIN_ROOT}/package-lock.json\" ] && cp \"${CLAUDE_PLUGIN_ROOT}/package-lock.json\" \"${CLAUDE_PLUGIN_DATA}/\"; true; } && cd \"${CLAUDE_PLUGIN_DATA}\" && npm install --omit=dev --no-audit --no-fund)"
          },
          {
            "type": "command",
            "command": "[ -e \"${CLAUDE_PLUGIN_ROOT}/node_modules\" ] || ln -sfn \"${CLAUDE_PLUGIN_DATA}/node_modules\" \"${CLAUDE_PLUGIN_ROOT}/node_modules\""
          },
          {
            "type": "command",
            "command": "[ -f \"${CLAUDE_PLUGIN_ROOT}/dist/cli.js\" ] || (cd \"${CLAUDE_PLUGIN_DATA}\" && npm install --no-audit --no-fund && cd \"${CLAUDE_PLUGIN_ROOT}\" && \"${CLAUDE_PLUGIN_DATA}/node_modules/.bin/tsc\" -p \"${CLAUDE_PLUGIN_ROOT}/tsconfig.json\")"
          }
        ]
      }
    ]
  }
}
```

**各 hook の意図**:

- **1 本目（deps 同期）**: seed.md の定義そのまま。`package-lock.json` がある場合もコピーして `npm ci` 相当の再現性を得る（`npm install --omit=dev` でもロック整合性が尊重される）。
- **2 本目（node_modules symlink）**: `bin/nanobanana-adc` が読み込む `${CLAUDE_PLUGIN_ROOT}/dist/cli.js` からの `node_modules` 解決を成立させる。`-e` 判定のため symlink 再作成は 1 回限り。
- **3 本目（build fallback）**: `dist/cli.js` が欠けている git clone インストール時のみ走る。dev deps（TypeScript）込みで install し、`tsc` を直接呼ぶ（`npm run build` でも可だが、cwd を ROOT に固定するため直接呼ぶ方が明快）。

**注意点**:

- シェルは plugin ホスト依存だが、Claude Code は Bash 前提。上記は bash/zsh 双方で動く POSIX sh 互換。
- `${CLAUDE_PLUGIN_ROOT}` が read-only にマウントされる実装を Claude Code が採用した場合、2・3 本目は失敗する。その場合は Implementer が確認した上で「ROOT に書かない」方針（dist を DATA に置き、bin 側から参照するラッパを作る）への切り替えを検討（ただし T06 スコープ外になる可能性あり）。

---

## 5. PATH / `dist` 配線の方針

```
plugin 有効化
   │
   ├── Claude Code が ${CLAUDE_PLUGIN_ROOT}/bin/* を Bash ツール PATH に自動追加 ← 公式機能
   │       → `nanobanana-adc` が裸コマンドで呼べる
   │
   └── SessionStart hook
           ├── ${CLAUDE_PLUGIN_DATA}/node_modules に prod deps を install
           ├── ${CLAUDE_PLUGIN_ROOT}/node_modules → DATA/node_modules の symlink
           └── dist/cli.js 不在時のみ tsc build
```

実行時フロー:

```
Bash ツール: nanobanana-adc --prompt "..."
   └─ ${CLAUDE_PLUGIN_ROOT}/bin/nanobanana-adc (shebang: node)
       └─ import '../dist/cli.js'
           └─ require('@google/generative-ai')
               └─ Node が ROOT/node_modules を辿る
                   → symlink 経由で DATA/node_modules を解決 ✓
```

---

## 6. 受け入れ基準との対応表

| 受け入れ基準                                                                 | 対応箇所                                                    |
|------------------------------------------------------------------------------|-------------------------------------------------------------|
| `SKILL.md` 作成（slash command 定義）                                        | §3 の frontmatter `name: nanobanana-adc`                    |
| `SKILL.md` 使い方 2〜3 例                                                    | §3 の Quick examples（ADC / aspect / api-key の 3 例）      |
| `SKILL.md` 環境変数一覧                                                      | §3 の Environment variables 表                              |
| `settings.json` 作成（SessionStart で `npm install --omit=dev`）             | §4 の hook 1 本目                                           |
| seed.md の JSON をベースに                                                   | §4 の hook 1 本目はそのままで、2〜3 本目が拡張              |
| `bin/` が plugin の PATH に追加                                              | §2.4／§5 — 公式の自動 PATH 機能に依存（追加設定不要）         |
| `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` パス解決の検討記述         | §2.6／§4／§5 — dist 問題と node_modules 解決の説明         |

---

## 7. リスクと代替案

| リスク                                                                                             | 影響                                         | 代替／緩和                                                                                 |
|----------------------------------------------------------------------------------------------------|----------------------------------------------|-----------------------------------------------------------------------------------------|
| 実機での plugin install 動作確認が不可能                                                         | 仕様違反に気付けない                         | conductor-prompt.md の記載通り「仕様沿っていれば完了」。T07 で README に手動検証手順を残す|
| Claude Code が将来 `${CLAUDE_PLUGIN_ROOT}` を read-only にすると §4 hook 2・3 本目が失敗          | plugin が起動しない                          | 検出したら DATA 側に dist/ をコピーし、bin を書き換える方針に移行（将来の T09 扱い）      |
| `npm install` 時のネットワーク不通で SessionStart が毎回失敗                                     | Skill 使用不可                                | hook を `|| true` で握り潰すのは非推奨。ユーザに offline 判定を見せる方が親切              |
| plugin 用 `settings.json` が `hooks` キーを読まない実装になっている可能性                         | hook が無視される                            | 代替として `.claude-plugin/hooks/hooks.json` に同内容を置く構成へ差し替え可能。Implementer は docs.claude.com 最新版で要確認 |
| `dist/cli.js` build が `tsconfig.json` の `outDir` 設定に依存                                     | build が期待のパスに出力されない             | T05 commit（`904ac1d`）で `outDir: dist` 済み。変更しない限り問題なし                    |
| skill name が plugin name と同じで `/nanobanana-adc:nanobanana-adc` が冗長                        | UX 上の軽微な不便                            | 将来 `name: generate` に変更する選択肢あり。初版では plugin=skill で整合性優先          |
| `description` の文言が Claude の自動起動判定に弱い                                                 | ユーザが毎回明示的に呼ぶ必要がある           | §2.2 の description はキーワードを詰めている。実測して足りなければ拡張                    |

---

## 8. Implementer 向けチェックリスト

1. `SKILL.md` をリポジトリ直下に作成（§3）。
2. `settings.json` をリポジトリ直下に作成（§4）。
3. `package.json` の `files` フィールドに `SKILL.md` / `settings.json` が既に含まれている（`package.json:10-17`）ことを確認 — 変更不要。
4. 2 ファイルの JSON / Markdown 構文を `jq` / markdown lint で検査。
5. 手動でも `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` を何らかの値に置換して hook コマンドが bash で実行できることをローカルで試す（`CLAUDE_PLUGIN_ROOT=$PWD CLAUDE_PLUGIN_DATA=/tmp/nbadc-data bash -c '<command>'`）。
6. `summary.md` に作成ファイルと受け入れ基準対応を記述。

---

（以上）
