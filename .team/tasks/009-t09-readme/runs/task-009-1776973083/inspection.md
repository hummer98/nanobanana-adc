# T09 検品結果

## 判定: GO

T09（README バイリンガル化）の実装は受け入れ基準・検品観点をすべて満たしています。Inspector としての再実行 (`npm run build` → `npm publish --dry-run`) でも `README.md` と `README.ja.md` が Tarball に含まれることを確認しました。

---

## 検品観点別評価

### 1. ファイル存在と構造

- [x] `README.md` が英語のまま、本文に破壊的変更なし
  - `git diff README.md` の結果は L1-3 への言語切替行 1 行 + 空行 1 行の追加のみ。本文（タグライン以降）は完全に未改変。
- [x] `README.ja.md` が新規作成されている（145 行）
- [x] 両ファイルに相互リンクが配置されている
  - `README.md:3`: `English · [日本語](./README.ja.md)`
  - `README.ja.md:3`: `[English](./README.md) · 日本語`
  - 「現在の言語は素のテキスト、もう一方をリンク化」する一般的な GitHub README スタイルに統一されており、相対パス (`./README.md` / `./README.ja.md`) も正しい。
- [x] セクション見出しが 1:1 対応している
  - `## ` 見出し: 英 9 / 日 9（同数、順序も同じ）
    - Why → なぜ / Features → 特徴 / Installation → インストール / Quick start → クイックスタート / Usage → 使い方 / Authentication → 認証 / Environment variables → 環境変数 / Development → 開発 / License → ライセンス
  - `### ` 見出し: 英 7 / 日 7（同数、順序も同じ）
    - As a Claude Code plugin → Claude Code plugin として / As a standalone CLI → スタンドアロン CLI として / Examples → 使用例 / Options → オプション一覧 / Option A → 方式 A / Option B → 方式 B / Resolution order → 認証の優先順位

### 2. 日本語版の品質

- [x] 必須セクションがすべて存在
  - [x] プロジェクト説明（`## なぜ nanobanana-adc なのか` で「ADC 対応が唯一の差別化軸」と明記）
  - [x] インストール 2 種（Claude Code plugin / `npm install -g`）
  - [x] CLI 例 5 個（基本 / アスペクト比+サイズ / 縦長 4K / モデル上書き / API キー）。受け入れ基準の「3〜5 個」を満たす。
  - [x] オプション表 6 行（`--prompt` / `--output` / `--aspect` / `--size` / `--model` / `--api-key`）
  - [x] 環境変数表 5 行（`GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` / `GOOGLE_GENAI_USE_VERTEXAI` / `GOOGLE_APPLICATION_CREDENTIALS` / `GEMINI_API_KEY`）
  - [x] ADC セットアップ手順（`gcloud auth application-default login` → 環境変数で project/region/Vertex 指定 → 画像生成コマンドの 3 ステップ）
  - [x] API キー手順（`GEMINI_API_KEY` env / `--api-key` インライン）
  - [x] 認証優先順位（1. `--api-key` → 2. `GEMINI_API_KEY` → 3. ADC）— seed.md L73-77 と完全一致
  - [x] ライセンス（MIT、`LICENSE` リンク）
- [x] 情報量が英語版と同等
  - 英語版 145 行 / 日本語版 145 行。コードブロックは英語版と同一に保たれており、地の文・見出し・表ヘッダのみが日本語化されている（plan.md §5「コードブロックは翻訳しない」方針通り）。
- [x] 用語が seed.md / ADC 文脈と一致
  - ADC（Application Default Credentials）/ Vertex AI / Cloud Run / フォールバック / 差別化軸 / 企業環境 / CI/CD / リージョン / GCP プロジェクト ID / サービスアカウント / アスペクト比 / 解像度 / プロジェクト / 推奨 — いずれも seed.md および計画書 §5 の用語表に準拠。
  - 「plugin」「skill」「strict モード」など seed.md で英語のまま使われている語は日本語版でも英語のまま維持されており、表記揺れなし。
- [x] 文体の一貫性
  - 地の文は「ですます調」で統一（例: L5「利用できます」/ L11「不要です」/ L30「不要です」/ L100「アタッチしてください」/ L140「必要です」）。
  - 表ヘッダ・箇条書き短文は体言止め（plan.md §5 の方針通り）。
- [x] 不自然な翻訳・誤字脱字なし
  - 全文を目視確認。`google-auth-library` `gcloud` `npm install -g` 等のコマンド・識別子は適切に英語のまま、説明文の日本語は自然。

### 3. package.json

- [x] `files` 配列に `"README.ja.md"` が追加されている（`"README.md"` 直後）
- [x] それ以外のフィールドは未変更
  - `git diff package.json` は `files` 配列への 1 行追加のみ。`name` / `version` / `description` / `keywords` / `bin` / `dependencies` 等は完全に未改変。

### 4. 検証

- [x] summary.md に `npm publish --dry-run` の Tarball Contents が貼ってある（summary.md L13-39）
- [x] Tarball に `README.md`（4.9kB）と `README.ja.md`（5.6kB）の両方が含まれている
- [x] `npm run build` / `npm run typecheck` が成功と記載（summary.md L43-46）

### 5. 実装に沿った検証（自分での再実行結果）

Inspector として作業ディレクトリで以下を再実行:

```bash
npm run build
# > nanobanana-adc@0.1.0 build
# > tsc
# （エラーなし）

npm publish --dry-run | tail -50
```

Tarball Contents（再実行結果、summary 記載と完全一致）:

```
npm notice 📦  nanobanana-adc@0.1.0
npm notice Tarball Contents
npm notice 1.1kB LICENSE
npm notice 5.6kB README.ja.md
npm notice 4.9kB README.md
npm notice 3.8kB SKILL.md
npm notice 45B bin/nanobanana-adc
npm notice 1.7kB dist/auth.js
npm notice 1.3kB dist/cli.js
npm notice 4.2kB dist/generate.js
npm notice 1.2kB package.json
npm notice 1.1kB settings.json
npm notice total files: 10
```

`README.ja.md` (5.6kB) と `README.md` (4.9kB) が両方含まれており、合計 10 ファイル。`npm run typecheck` も成功（出力なし、終了コード 0）。

---

## 発見事項（GO 時の任意の改善提案）

いずれも GO 判定を覆すものではなく、将来の保守性向上のための任意提案です。

1. **同期コメントの追加（任意）** — plan.md §4 で検討された「`<!-- Keep README.md and README.ja.md in sync. -->`」コメントは未採用。現状でも問題ないが、将来 README を片方だけ更新するリスクを下げたい場合は両ファイル末尾に 1 行入れる選択肢あり。
2. **言語切替行の見た目の微差（任意）** — `English · [日本語](./README.ja.md)` と `[English](./README.md) · 日本語` で「素のテキスト → リンク」の順序がそれぞれの言語側で逆転しているが、これは「現在の言語を左に置く」自然な慣用に従っているため意図通り。指摘なし。
3. **`--api-key` の説明文（任意）** — 日本語版 L81「環境変数・ADC より優先」は簡潔で良いが、英語版 L81 が「overrides env and ADC」とより包括的なので、必要なら「環境変数および ADC より優先」と読点を入れる手もある。許容範囲内。
