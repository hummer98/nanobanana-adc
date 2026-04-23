# nanobanana-adc — コンセプト

## 何を作るか

Google Nano Banana Pro（Gemini 3 Pro Image）を使った画像生成 CLI。
**唯一の差別化軸は ADC（Application Default Credentials）対応**。

既存の Claude Code skill（cc-nano-banana, ccskill-nanobanana, skill-nano-banana 等）は
すべて `GEMINI_API_KEY` 環境変数のみ対応しており、Vertex AI + ADC 構成では使えない。
企業環境・CI/CD・Cloud Run 等で Vertex AI を使うユーザーの空白地帯を埋める。

## 配布形態

1 つのリポジトリで 2 通りの配布を兼ねる。

| 用途 | 方法 |
|------|------|
| Claude Code plugin | `/plugin marketplace add user/nanobanana-adc` |
| スタンドアロン CLI | `npm install -g nanobanana-adc` / `npx nanobanana-adc` |
| OpenCode 等の他 AI ツール | `npm install -g` 後にそのまま利用 |

## 技術スタック

- **言語**: TypeScript（strict mode）
- **ランタイム**: Node.js（Claude Code 環境に必ず存在する）
- **認証**: `google-auth-library` による ADC。`GEMINI_API_KEY` フォールバックも提供
- **API**: `@google/generative-ai`（`GOOGLE_GENAI_USE_VERTEXAI=true` モード）
- **CLI フレームワーク**: `commander` または最小構成の `process.argv` 解析

## リポジトリ構成

```
nanobanana-adc/
  src/
    cli.ts          ← エントリーポイント・引数解析
    generate.ts     ← Vertex AI 呼び出しコア
    auth.ts         ← ADC / API キー 認証切り替え
  bin/
    nanobanana-adc  ← shebang 付き実行スクリプト（CC plugin PATH 注入用）
  SKILL.md          ← Claude Code skill 定義
  settings.json     ← CC plugin 設定（SessionStart フック）
  package.json      ← bin フィールドで npm 配布兼用
  tsconfig.json
  .gitignore
```

## CLI インターフェース

```bash
# 基本
nanobanana-adc --prompt "a cat in space" --output cat.png

# サイズ指定
nanobanana-adc --prompt "..." --aspect 16:9 --size 2K

# モデル指定（既定: gemini-3-pro-image-preview）
nanobanana-adc --prompt "..." --model gemini-3-flash-image-preview

# 認証（既定: ADC。API キー明示指定も可）
nanobanana-adc --prompt "..." --api-key $GEMINI_API_KEY
```

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `GOOGLE_CLOUD_PROJECT` | ADC 使用時 ✓ | GCP プロジェクト ID |
| `GOOGLE_CLOUD_LOCATION` | ADC 使用時 ✓ | リージョン（例: `us-central1`） |
| `GOOGLE_GENAI_USE_VERTEXAI` | ADC 使用時 ✓ | `true` 固定 |
| `GOOGLE_APPLICATION_CREDENTIALS` | 任意 | ADC ファイルパス（未設定時は gcloud 認証を使用） |
| `GEMINI_API_KEY` | フォールバック | ADC 未設定時に使用 |

## 認証優先順位

1. `--api-key` フラグ
2. `GEMINI_API_KEY` 環境変数
3. ADC（`google-auth-library` 経由）← **既定かつ主目的**

## Claude Code plugin 固有の設定

`settings.json` に `SessionStart` フックを定義し、
`${CLAUDE_PLUGIN_DATA}` に `node_modules` を展開することで
インストール後の初回セッションから依存なしで動作する。

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "diff -q \"${CLAUDE_PLUGIN_ROOT}/package.json\" \"${CLAUDE_PLUGIN_DATA}/package.json\" >/dev/null 2>&1 || (mkdir -p \"${CLAUDE_PLUGIN_DATA}\" && cp \"${CLAUDE_PLUGIN_ROOT}/package.json\" \"${CLAUDE_PLUGIN_DATA}/\" && cd \"${CLAUDE_PLUGIN_DATA}\" && npm install --omit=dev)"
      }]
    }]
  }
}
```

## 今後の拡張候補（スコープ外）

- 画像編集モード（inpainting / outpainting）
- バッチ生成
- MCP サーバーとしての配布
