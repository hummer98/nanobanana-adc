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
- AIview / Automatic1111 互換の `tEXt parameters` を生成 PNG に埋め込み
  （`--no-embed-metadata` で無効化）。Google の C2PA / SynthID provenance
  チャンクは保持されます。
- 同一リポジトリから npm バイナリと Claude Code plugin の両方を配布。
- TypeScript、strict モード、Node.js ≥ 18。

## インストール

### Claude Code plugin として

```bash
/plugin marketplace add hummer98/nanobanana-adc
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

# 6. 人物生成の制御
nanobanana-adc -p "にぎやかな広場" --person-generation ALLOW_ADULT
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
| `--person-generation` | — | — | 人物生成の制御。`ALLOW_ALL` / `ALLOW_ADULT` / `ALLOW_NONE` のいずれか（大文字小文字を問わず受け付け）。未指定時はモデル既定。 |
| `--no-embed-metadata` | — | 埋め込む | PNG への AIview 互換 `tEXt parameters` チャンクの埋め込みを無効化。JPEG 出力では元々埋め込みません（本リリースでは JPEG への埋め込みは対象外）。 |

> `--person-generation` についての注記: 現状は Vertex AI (ADC) 経路でのみ受理されます。`--api-key` / `GEMINI_API_KEY` 経路で利用される AI Studio v1beta エンドポイントは、`gemini-3-pro-image-preview` においてまだこのフィールドを認識せず `400 Unknown name "personGeneration"` を返します。また、AI Studio の一部 API キー Tier では `ALLOW_ALL` が 400 エラーで弾かれるとの報告もあります（Gemini API 経路での再現は未確認）。いずれの場合も、フラグを省略するか ADC 経路に切り替えてください。

## メタデータ

既定では、生成された PNG ファイルには Automatic1111 / AIview 互換の
`tEXt` チャンク（キーワード `parameters`）が埋め込まれます。本体は 2 行
の文字列で、1 行目がプロンプト、2 行目が CLI オプションのカンマ区切り
リストです:

```
<プロンプト>
Steps: 1, Sampler: gemini, Size: 1024x1024, Model: gemini-3-pro-image-preview, Aspect: 1:1[, Person generation: ALLOW_ADULT]
```

`Steps: 1, Sampler: gemini` は AIview の `parsePrompt`（`Steps:` で分割）
が期待するプレースホルダです。チャンクは `IEND` の直前に挿入され、
Google の C2PA（`caBX`）、IPTC（`zTXt`）、XMP（`iTXt`）チャンクは
バイト単位で保持されます。

無効化するには:

```bash
nanobanana-adc -p "private prompt" --no-embed-metadata -o out.png
```

注意: AI Studio（`--api-key` / `GEMINI_API_KEY`）経路は `image/jpeg` を
返します。その場合、出力拡張子は自動で `.jpg` に補正され、メタデータの
埋め込みはスキップされます（JPEG の APP1/APP13 対応は v0.3.0 では
スコープ外）。

## 診断（doctor）

`nanobanana-adc doctor` で、どの認証経路が選ばれるか・GCP 環境変数が揃って
いるか・ADC トークンが実際に取得できるかを 1 コマンドで確認できます。
モデル API は一切呼ばず、課金は発生しません。

```text
$ nanobanana-adc doctor
nanobanana-adc doctor

CLI
  path:                             /usr/local/lib/node_modules/nanobanana-adc/dist/cli.js
  version:                          0.6.0
  install:                          npm-global

Auth route
  selected:                         adc   (GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION set; ADC path)

API key
  present:                          no

ADC
  probed:                           yes
  status:                           ok
  account:                          user@example.com
  project:                          my-gcp-proj

GCP env
  GOOGLE_CLOUD_PROJECT:             my-gcp-proj
  GOOGLE_CLOUD_LOCATION:            global
  GOOGLE_GENAI_USE_VERTEXAI:        true
  GOOGLE_APPLICATION_CREDENTIALS:   (unset)

Gcloud config dir
  resolved:                         /home/user/.config/gcloud
  source:                           default ($HOME/.config/gcloud)
  presence:
    active_config:                  exists
    configurations/:                exists (1 entry)
    credentials.db:                 exists
    access_tokens.db:               exists
    application_default_credentials.json: exists
    legacy_credentials/:            missing

ADC source
  resolved:                         default (effective default)
  env GOOGLE_APPLICATION_CREDENTIALS: (unset)
  effective default:                /home/user/.config/gcloud/application_default_credentials.json   (exists, 2400 B, 2026-04-26T07:00:00.000Z)
  metadata server:                  not probed (no GCE/Cloud Run env detected)
  type:                             authorized_user
  quotaProjectId:                   my-gcp-proj
  clientId:                         32555940559.apps.googleusercontent.com
  account:                          user@example.com

Model
  default:                          gemini-3-pro-image-preview
  note:                             requires GOOGLE_CLOUD_LOCATION=global on the ADC path

Warnings (0)
  (none)
```

<details>
<summary><code>CLOUDSDK_CONFIG</code> を指定したとき（gcloud 設定 dir 全体を別ディレクトリに切替）</summary>

```text
Gcloud config dir
  resolved:                         /Users/me/git/other-repo/.config/gcloud
  source:                           env CLOUDSDK_CONFIG
  presence:
    active_config:                  exists
    configurations/:                exists (3 entries)
    credentials.db:                 exists
    access_tokens.db:               exists
    application_default_credentials.json: exists
    legacy_credentials/:            missing
  note:                             overrides $HOME/.config/gcloud entirely; gcloud auth list / configurations / ADC are isolated from the OS default

ADC source
  resolved:                         default (effective default)
  env GOOGLE_APPLICATION_CREDENTIALS: (unset)
  effective default:                /Users/me/git/other-repo/.config/gcloud/application_default_credentials.json   (exists, 2400 B, ...)
  ...

Warnings (1)
  ⓘ [CLOUDSDK_CONFIG_OVERRIDE] gcloud config directory is overridden to `/Users/me/git/other-repo/.config/gcloud` via CLOUDSDK_CONFIG; gcloud auth / configurations / ADC are isolated from $HOME/.config/gcloud.
```

</details>

主な使い方:

```bash
# 機械可読 JSON（schema は `nanobanana-adc-doctor/v1` で安定）。
# JSON のキーは camelCase で統一されています（`.adcSource` / `.quotaProjectId`
# など、既存の `.gcpEnv` / `.authRoute` / `.apiKey` と同じスタイル）。
nanobanana-adc doctor --json | jq .

# ADC source セクションだけを覗く:
nanobanana-adc doctor --json | jq .adcSource

# 新規: gcloud 設定 dir の解決先と presence を覗く:
nanobanana-adc doctor --json | jq .gcloudConfigDir

# fatal でないことを gate にする:
nanobanana-adc doctor --json | jq -e '.fatal | not' >/dev/null && echo "ready"

# ADC トークンの先頭・gcloud 設定・ランタイム情報を追加出力:
nanobanana-adc doctor --verbose

# GCE / Cloud Run の metadata server を 300ms で probe（opt-in）:
nanobanana-adc doctor --probe-metadata-server
```

`doctor` は **常に exit code 0** を返します（`fatal: true` でも 0）。これは
診断ツールという設計哲学で、ゲートとして使う場合は `--json | jq` を経由して
ください。詳細は [CHANGELOG.md](./CHANGELOG.md) の v0.4.0 / v0.5.0 / v0.6.0 参照。

### v0.5 からの移行

`adcSource.resolved === 'default'` の意味が v0.6 から変わっています。v0.5
では「OS default のパス（`$HOME/.config/gcloud/...`）にファイルがある」を
意味していましたが、v0.6 からは「**effective default**（`CLOUDSDK_CONFIG`
が set ならそのパス、それ以外は OS default）にファイルがある」を意味します。
実際のパスは `adcSource.effectiveDefault.path` を参照してください
（`adcSource.defaultLocation.path` は v0.6.x の互換 alias として残し、
v1.0 で削除予定）。`adcSource.resolved === 'cloudsdk-config'` は v0.6 で
生成停止です — 該当ケースは `'default'` 分岐に流れ、dir 単位の状態は
新設の top-level `gcloudConfigDir` で確認できます。

### Warning コード対訳

Warning の `code` は JSON schema 互換性維持のため英語のまま固定です。
日本語訳は参考情報として以下を併記します:

| code | 日本語訳 |
|------|----------|
| `NO_AUTH_AVAILABLE` | 認証経路が 1 つも使えない（fatal） |
| `GEMINI_API_KEY_SHADOWS_ADC` | `GEMINI_API_KEY` が設定されているので ADC 経路は選ばれません |
| `LOCATION_NOT_GLOBAL` | `GOOGLE_CLOUD_LOCATION` が `global` ではありません |
| `LOCATION_MISSING` | ADC 経路を試そうとしているが `GOOGLE_CLOUD_LOCATION` が未設定 |
| `CREDS_FILE_MISSING` | `GOOGLE_APPLICATION_CREDENTIALS` のパスにファイルが存在しません |
| `USE_VERTEXAI_NOT_TRUE` | `GOOGLE_GENAI_USE_VERTEXAI` が `true` ではありません |
| `API_KEY_FORMAT_SUSPECT` | `GEMINI_API_KEY` が `AIza` で始まっていません |
| `ADC_QUOTA_PROJECT_MISMATCH` | ADC JSON の `quota_project_id` と `GOOGLE_CLOUD_PROJECT` が食い違っています（課金プロジェクトと操作対象がずれます） |
| `ADC_FILE_MISSING` | `GOOGLE_APPLICATION_CREDENTIALS` のパスが存在しない／ディレクトリです（既存の `CREDS_FILE_MISSING` と並列で発火） |
| `ADC_TYPE_UNUSUAL` | ADC JSON の `type` が想定 4 種（`authorized_user` / `service_account` / `external_account` / `impersonated_service_account`）以外です（info） |
| `CLOUDSDK_CONFIG_OVERRIDE` | `CLOUDSDK_CONFIG` が set されています。gcloud auth list / configurations / ADC は `$HOME/.config/gcloud` から分離されています（info） |

> **注意**: `--verbose` 出力には個人のメールアドレス（`gcloud auth list`
> / `gcloud config get-value account`）やローカルパスが含まれることが
> あります。Issue・CI ログ・デモ録画への貼り付けは内容確認の上で行って
> ください。なお、ADC JSON の secret（`private_key` / `private_key_id`
> / `refresh_token`）は `text` / `json` / `--verbose` のどの出力にも
> 一切出ません（`parseAdcMeta` が新しいオブジェクトに必要なフィールド
> だけを詰め替える設計）。

## 認証

### 方式 A — Application Default Credentials（推奨）

```bash
# 1. application-default credentials を 1 コマンドでサインイン。
nanobanana-adc auth login

# auth login サブコマンドは既定で:
#   - CLOUDSDK_CONFIG を --config-dir / $CLOUDSDK_CONFIG（そのまま継承） /
#     $GOOGLE_APPLICATION_CREDENTIALS の dirname / gcloud 既定 から解決
#   - $GOOGLE_CLOUD_PROJECT が設定されていれば
#     `gcloud auth application-default set-quota-project $GOOGLE_CLOUD_PROJECT` を続けて実行
# 上書きするには --config-dir <path> / --quota-project <id> /
# --no-quota-project / --scopes <csv> を渡してください。

# 2. Vertex AI のプロジェクトとリージョンを指定。
export GOOGLE_CLOUD_PROJECT=my-project
export GOOGLE_CLOUD_LOCATION=us-central1
export GOOGLE_GENAI_USE_VERTEXAI=true

# 3. 画像生成 — API キーは不要。
nanobanana-adc --prompt "a cat in space" --output cat.png
```

手動で行う場合:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project "$GOOGLE_CLOUD_PROJECT"
```

CI や Cloud Run では `nanobanana-adc auth login`（および `gcloud auth application-default login`）は使わず、`GOOGLE_APPLICATION_CREDENTIALS` にサービスアカウント JSON ファイルのパスを設定するか、ワークロードにサービスアカウントをアタッチしてください。ADC が自動で解決します。

#### `auth login` サブコマンド

`nanobanana-adc auth login` は `gcloud auth application-default login` の薄い
ラッパで、`CLOUDSDK_CONFIG` と quota project を `nanobanana-adc doctor` と
同じロジックで解決します。`auth login` 完了後の doctor が示すパスと、ADC が
実際に読みに行くパスが一致するように設計されています。

```bash
# 解決された plan のみを表示（gcloud は起動しない、exit 0）:
nanobanana-adc auth login --dry-run

# spawn する gcloud に渡す argv を表示:
nanobanana-adc auth login --verbose

# scopes を絞る（既定は gcloud の組込み scopes）:
nanobanana-adc auth login --scopes https://www.googleapis.com/auth/cloud-platform

# 解決優先順を含むフル help:
nanobanana-adc auth login --help
```

> **注記**: `--dry-run` は gcloud SDK が未インストールでも動作します
> （gcloud を起動せず、ファイルシステムにも触れません）。実際の
> `auth login` 実行には [gcloud CLI](https://cloud.google.com/sdk/docs/install)
> が `PATH` 上に必要です。

解決優先順（正本は `--help` を参照）:

- `CLOUDSDK_CONFIG`: `--config-dir` → `$CLOUDSDK_CONFIG`（そのまま継承） →
  `$GOOGLE_APPLICATION_CREDENTIALS` の dirname（basename が
  `application_default_credentials.json` のときのみ） → gcloud OS 既定
  （子プロセスでは `CLOUDSDK_CONFIG` を unset）。
- Quota project: `--quota-project <id>` → `--no-quota-project`（skip） →
  `$GOOGLE_CLOUD_PROJECT` → notice 付きで skip。

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
npm test
node dist/cli.js --help
# もしくは `npm link` 後:
nanobanana-adc --help
```

エンドユーザーは Node.js ≥ 18 が必要です（`engines.node`）。
**開発時は Node.js ≥ 20 が必要**です。テストランナーが
`node --test --import tsx` を使用し、`--import` フラグは Node 20+ で
安定しているためです。

## ライセンス

MIT — [LICENSE](./LICENSE) を参照。
