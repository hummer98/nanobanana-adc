# nanobanana-adc

[English](./README.md) · 日本語

> Gemini 3 Pro Image（Nano Banana Pro）の CLI。ADC（Application Default Credentials）を第一級サポートし、CI・Cloud Run・gcloud 認証済みワークステーションから API キーを配布せずに Vertex AI を利用できます。

## なぜ nanobanana-adc なのか

Gemini 画像生成向けの既存 Claude Code skill（cc-nano-banana、ccskill-nanobanana、skill-nano-banana など）はいずれも `GEMINI_API_KEY` のみを受け付けます。API キーの取り扱いが推奨されず、Vertex AI と ADC による認証が求められる企業環境・CI/CD パイプライン・Cloud Run デプロイにおいては、このままでは使えません。

**nanobanana-adc はこのギャップを埋めるために存在します。** ADC 対応が唯一の差別化軸です。`gcloud auth application-default login` を設定済み、ワークロードにサービスアカウントをアタッチ済み、または `GOOGLE_APPLICATION_CREDENTIALS` が JSON キーを指している場合、この CLI が自動で検出します。キーの取り回しは不要です。

## 特徴

- `google-auth-library` による ADC 認証（既定）。
- `GEMINI_API_KEY` フォールバック（軽量セットアップ向け）。
- 10 種類のアスペクト比: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, 5:4。
- 3 種類の解像度: 1K, 2K, 4K。
- 同一リポジトリから npm バイナリと Claude Code plugin の両方を配布。
- TypeScript、strict モード、Node.js ≥ 18。

## インストール

### Claude Code plugin として

```bash
/plugin marketplace add yamamoto/nanobanana-adc
```

plugin の `SessionStart` hook が初回起動時に `npm install --omit=dev` を実行し、ランタイム依存を `${CLAUDE_PLUGIN_DATA}` にインストールします。追加セットアップは不要です。

### スタンドアロン CLI として（npm install -g）

```bash
npm install -g nanobanana-adc
# インストールせずに実行する場合:
npx nanobanana-adc --prompt "a cat in space"
```

## クイックスタート

```bash
export GOOGLE_CLOUD_PROJECT=my-project
export GOOGLE_CLOUD_LOCATION=us-central1
export GOOGLE_GENAI_USE_VERTEXAI=true
gcloud auth application-default login

nanobanana-adc --prompt "a cat in space" --output cat.png
```

## 使い方

### 使用例

```bash
# 1. 基本
nanobanana-adc --prompt "a cat in space" --output cat.png

# 2. アスペクト比とサイズ
nanobanana-adc -p "neon skyline at dusk" -a 16:9 -s 2K -o skyline.png

# 3. 縦長・4K
nanobanana-adc -p "a lone lighthouse in a storm" --aspect 9:16 --size 4K

# 4. モデル上書き
nanobanana-adc -p "retro poster art" --model gemini-3-pro-image-preview

# 5. API キーでのフォールバック
nanobanana-adc -p "a cat in space" --api-key "$GEMINI_API_KEY"
```

### オプション一覧

| フラグ | 別名 | 既定値 | 説明 |
|--------|------|--------|------|
| `--prompt` | `-p` | —（必須） | プロンプト文字列。 |
| `--output` | `-o` | `output.png` | 出力ファイルパス。 |
| `--aspect` | `-a` | `1:1` | アスペクト比。1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, 5:4 のいずれか。 |
| `--size` | `-s` | `1K` | 画像サイズ。1K, 2K, 4K のいずれか。 |
| `--model` | `-m` | `gemini-3-pro-image-preview` | モデル ID。 |
| `--api-key` | — | — | 明示的に渡す Gemini API キー（環境変数・ADC より優先）。 |

## 認証

### 方式 A — Application Default Credentials（推奨）

```bash
# 1. application-default credentials でサインイン。
gcloud auth application-default login

# 2. Vertex AI のプロジェクトとリージョンを指定。
export GOOGLE_CLOUD_PROJECT=my-project
export GOOGLE_CLOUD_LOCATION=us-central1
export GOOGLE_GENAI_USE_VERTEXAI=true

# 3. 画像生成 — API キーは不要。
nanobanana-adc --prompt "a cat in space" --output cat.png
```

CI や Cloud Run では `gcloud auth application-default login` は使わず、`GOOGLE_APPLICATION_CREDENTIALS` にサービスアカウント JSON ファイルのパスを設定するか、ワークロードにサービスアカウントをアタッチしてください。ADC が自動で解決します。

### 方式 B — API キー（フォールバック）

```bash
export GEMINI_API_KEY=...
nanobanana-adc --prompt "a cat in space" --output cat.png

# またはインラインで渡す:
nanobanana-adc --prompt "a cat in space" --api-key "$GEMINI_API_KEY"
```

### 認証の優先順位

認証情報は次の順序で解決され、最初に一致したものが使われます:

1. `--api-key` CLI フラグ。
2. `GEMINI_API_KEY` 環境変数。
3. `google-auth-library` による ADC（主たる推奨経路）。

## 環境変数

| 変数 | 必須 | 用途 |
|------|------|------|
| `GOOGLE_CLOUD_PROJECT` | ADC モード | GCP プロジェクト ID。 |
| `GOOGLE_CLOUD_LOCATION` | ADC モード | リージョン（例: `us-central1`）。 |
| `GOOGLE_GENAI_USE_VERTEXAI` | ADC モード | `true` に設定して Vertex AI モードを明示。 |
| `GOOGLE_APPLICATION_CREDENTIALS` | 任意 | サービスアカウント JSON キーのパス。未設定時は gcloud ユーザー認証情報にフォールバック。 |
| `GEMINI_API_KEY` | フォールバック | ADC 環境が未設定のときに使用。 |

## 開発

```bash
npm install
npm run build
node dist/cli.js --help
# もしくは `npm link` 後:
nanobanana-adc --help
```

Node.js ≥ 18 が必要です。

## ライセンス

MIT — [LICENSE](./LICENSE) を参照。
