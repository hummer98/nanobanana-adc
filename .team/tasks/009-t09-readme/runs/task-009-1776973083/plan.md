# T09 実装計画書: README を英語・日本語のバイリンガル化

## 1. 目的とスコープ

公開用に README を英語版・日本語版の 2 ファイル構成で整備する。

- **英語版** (`README.md`): T07 で整備済み（143 行）。内容はそのまま維持し、言語切替リンクのみ追加。
- **日本語版** (`README.ja.md`): 新規作成。英語版と 1:1 対応する構造・情報量で書く。
- **`package.json`**: `files` フィールドに `README.ja.md` を追加し、npm パッケージに同梱する。
- **検証**: `npm publish --dry-run` で両ファイルがパッケージに含まれることを確認。

スコープ外: ロゴ画像、CHANGELOG.ja.md、その他のドキュメント翻訳。

---

## 2. 変更ファイル一覧

| 種別 | パス | 概要 |
|------|------|------|
| 修正 | `README.md` | 先頭に言語切替リンク 1 行を挿入（既存の英語本文は変更しない） |
| 追加 | `README.ja.md` | 日本語版を新規作成（英語版と同一構造） |
| 修正 | `package.json` | `files` 配列に `"README.ja.md"` を追加 |

合計: 修正 2 ファイル / 追加 1 ファイル / 削除 0 ファイル。

---

## 3. README.md の変更内容（言語切替リンクの配置）

`# nanobanana-adc` 見出しの直後（1 行目と 3 行目の間）にリンク行を 1 行追加する。

### 変更箇所（diff イメージ）

```diff
 # nanobanana-adc

+English · [日本語](./README.ja.md)
+
 > Gemini 3 Pro Image (Nano Banana Pro) CLI with first-class Application Default Credentials support — use Vertex AI from CI, Cloud Run, or any gcloud-authenticated workstation without handing out API keys.
```

### 設計判断

- 「現在表示中の言語はリンクにせず素のテキスト、もう一方の言語のみリンクにする」スタイル（GitHub README で一般的）。
- バッジ風 (`[![ja](...)](...)`) ではなくプレーンテキストで揃える（既存 README にバッジ無し）。
- 区切りは `·` (中点)。`|` よりも視覚的に軽い。
- タイトルからも本文（`>` 引用）からも 1 行空ける。

---

## 4. README.ja.md のセクション構成

英語版 `README.md` の見出し構成と完全に 1:1 対応させる。先頭にもう一方（英語版）へのリンクを置く。

| # | 英語版見出し | 日本語版見出し | 主な内容 |
|---|--------------|----------------|----------|
| 0 | （言語切替行） | `[English](./README.md) · 日本語` | 1 行 |
| 0 | `# nanobanana-adc` | `# nanobanana-adc` | プロジェクト名（共通） |
| 0 | `>` 引用（タグライン） | `>` 引用（日本語タグライン） | 1 文サマリ |
| 1 | `## Why nanobanana-adc?` | `## なぜ nanobanana-adc なのか` | ADC 対応が差別化軸である理由（seed.md の「唯一の差別化軸は ADC 対応」を踏襲） |
| 2 | `## Features` | `## 特徴` | 6 項目の箇条書き（ADC、API キーフォールバック、10 アスペクト比、3 解像度、npm + plugin 両配布、TypeScript strict + Node ≥ 18） |
| 3 | `## Installation` | `## インストール` | サブセクション 2 個 |
| 3a | `### As a Claude Code plugin` | `### Claude Code plugin として` | `/plugin marketplace add ...` + SessionStart フック説明 |
| 3b | `### As a standalone CLI (npm install -g)` | `### スタンドアロン CLI として（npm install -g）` | `npm install -g` / `npx` |
| 4 | `## Quick start` | `## クイックスタート` | 環境変数 export + ADC ログイン + コマンド 1 例 |
| 5 | `## Usage` | `## 使い方` | サブセクション 2 個 |
| 5a | `### Examples` | `### 使用例` | CLI 例 5 個（英語版と同じ） |
| 5b | `### Options` | `### オプション一覧` | 表（Flag / Alias / Default / Description）。表ヘッダは「フラグ / 別名 / 既定値 / 説明」 |
| 6 | `## Authentication` | `## 認証` | サブセクション 3 個 |
| 6a | `### Option A — Application Default Credentials (recommended)` | `### 方式 A — Application Default Credentials（推奨）` | `gcloud auth application-default login` → 環境変数 → 生成コマンドの 3 ステップ |
| 6b | `### Option B — API key (fallback)` | `### 方式 B — API キー（フォールバック）` | `GEMINI_API_KEY` export または `--api-key` |
| 6c | `### Resolution order` | `### 認証の優先順位` | 1) `--api-key` 2) `GEMINI_API_KEY` 3) ADC（推奨）。seed.md と同じ並び |
| 7 | `## Environment variables` | `## 環境変数` | 表。ヘッダは「変数 / 必須 / 用途」、行は seed.md の用語に合わせる |
| 8 | `## Development` | `## 開発` | `npm install` → `npm run build` → `node dist/cli.js --help` |
| 9 | `## License` | `## ライセンス` | MIT — `LICENSE` ファイル参照 |

### 行数目安

英語版が 143 行なので、日本語版もおおむね同程度（130〜160 行）に収める。コードブロックは英語版から流用するので、日本語化されるのは見出し・地の文・表ヘッダ・補足説明のみ。

---

## 5. 日本語訳で注意すべき用語（seed.md の用法と揃える）

`docs/seed.md` で使われている表記をそのまま採用し、表記揺れを防ぐ。

| 英語 | 日本語訳（採用） | 採用理由 / seed.md の出典 |
|------|------------------|----------------------------|
| Application Default Credentials | ADC（Application Default Credentials） | seed.md L6, L26, L67-71 で「ADC」表記が定着 |
| Vertex AI | Vertex AI | seed.md L9, L27（カタカナ化しない） |
| Cloud Run | Cloud Run | seed.md L10（カタカナ化しない） |
| API key | API キー | seed.md L26, L60, L71 |
| fallback | フォールバック | seed.md L26, L71 |
| plugin | plugin（Claude Code plugin の文脈） | seed.md L17, L80 で英語表記のまま使われている |
| skill | skill | seed.md L8（既存 skill 名と揃える） |
| environment variable | 環境変数 | seed.md L9, L63 |
| service account | サービスアカウント | seed.md には無いが一般的な訳語 |
| aspect ratio | アスペクト比 | 一般訳 |
| resolution | 解像度 | 一般訳 |
| project | プロジェクト | seed.md L67 |
| region | リージョン | seed.md L68 |
| recommended | 推奨 | seed.md L77 「既定かつ主目的」をニュアンスに含める |
| differentiating axis | 差別化軸 | seed.md L6 |
| enterprise environment | 企業環境 | seed.md L10 |
| CI/CD pipeline | CI/CD | seed.md L10（パイプラインまでは付けない） |

### 文体

- 「である調」より「ですます調」を採用（README は読み手に向けた文書のため）。
- ただし表ヘッダ・箇条書きの短文は体言止め可（例: 「GCP プロジェクト ID」）。
- 命令形（`gcloud auth ...` など）は英語コマンドのまま。

### コードブロック

- コードブロックの中身は英語版と完全に同一にする（コマンドや環境変数名を翻訳しない）。
- コードブロック前後の説明文だけを日本語化する。

### 任意で追加する 1 行コメント（受け入れ基準の任意項目）

英語版・日本語版の双方で、ファイル末尾の `## License` 直前または直後に HTML コメントを 1 行入れる案：

```html
<!-- Keep README.md and README.ja.md in sync. Update both when changing user-facing docs. -->
```

採否は実装時に判断。受け入れ基準では任意なので、「入れない」を既定とし、レビュー時に簡潔さを優先する。

---

## 6. package.json の変更箇所

`files` 配列（L34-41）に `"README.ja.md"` を追加する。`README.md` の直後に置いて関連性を視覚化する。

### 変更箇所（diff イメージ）

```diff
   "files": [
     "dist/",
     "bin/",
     "SKILL.md",
     "settings.json",
     "README.md",
+    "README.ja.md",
     "LICENSE"
   ],
```

これ以外のフィールド（`description`, `keywords`, etc.）は変更しない。`description` を日本語化することは行わない（npm registry での検索性を英語のまま維持するため）。

---

## 7. 検証手順

### 7.1 ファイル存在の確認

```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-009-1776973083
test -f README.md && test -f README.ja.md && echo "OK: both files exist"
```

### 7.2 言語切替リンクの確認

```bash
# 英語版に日本語版へのリンクがあること
grep -n "README.ja.md" README.md

# 日本語版に英語版へのリンクがあること
grep -n "README.md" README.ja.md
```

期待値: それぞれ少なくとも 1 件ヒット。

### 7.3 セクション数の対応確認

```bash
# 英語版と日本語版で `## ` 見出しの個数が一致すること
echo "EN: $(grep -c '^## ' README.md)"
echo "JA: $(grep -c '^## ' README.ja.md)"
```

期待値: EN と JA が同数（8 個程度）。

### 7.4 `npm publish --dry-run` でパッケージ内容を確認

```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-009-1776973083
npm install --no-audit --no-fund --ignore-scripts >/dev/null 2>&1 || true
npm run build
npm publish --dry-run 2>&1 | tee /tmp/npm-dry-run.log
```

期待される出力（抜粋）に以下が含まれること:

- `README.md`
- `README.ja.md`
- `LICENSE`
- `SKILL.md`
- `settings.json`
- `dist/cli.js` ほか dist 配下
- `bin/nanobanana-adc`

### 7.5 確認用 grep（自動検証可能）

```bash
grep -E '^npm notice .*README\.ja\.md' /tmp/npm-dry-run.log && echo "OK: README.ja.md is included"
grep -E '^npm notice .*README\.md'    /tmp/npm-dry-run.log && echo "OK: README.md is included"
```

両方とも一致すれば検証 OK。実装担当はこの dry-run の出力（少なくとも `Tarball Contents` セクション）を summary に貼り付ける。

---

## 8. TDD 的「検証可能な完了条件」

実装担当は以下のチェックリスト全項目を満たした時点で完了とする。

- [ ] `README.md` の先頭（タイトル直下）に `English · [日本語](./README.ja.md)` 形式のリンク行が存在する
- [ ] `README.md` の本文（タイトル・タグライン・各セクション）が変更されていない（言語切替行の追加と空行調整のみ）
- [ ] `README.ja.md` が新規作成されており、先頭に `[English](./README.md) · 日本語` 形式のリンク行が存在する
- [ ] `README.ja.md` の `## ` 見出し数が `README.md` と同数（セクション 1:1 対応）
- [ ] `README.ja.md` に以下の必須要素がすべて含まれる:
  - [ ] プロジェクト説明（ADC 対応が差別化軸である旨を明記）
  - [ ] インストール方法 2 種（Claude Code plugin / `npm install -g`）
  - [ ] CLI 使用例 5 個（英語版と同じ）
  - [ ] オプション一覧の表（6 行: prompt / output / aspect / size / model / api-key）
  - [ ] 環境変数一覧の表（5 行: GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION / GOOGLE_GENAI_USE_VERTEXAI / GOOGLE_APPLICATION_CREDENTIALS / GEMINI_API_KEY）
  - [ ] ADC セットアップ手順（`gcloud auth application-default login` → GCP プロジェクト/リージョン設定 → 画像生成コマンド）
  - [ ] API キーでのフォールバック利用方法（`GEMINI_API_KEY` env または `--api-key` フラグ）
  - [ ] 認証の優先順位（1. `--api-key` 2. `GEMINI_API_KEY` 3. ADC）
  - [ ] ライセンス（MIT、`LICENSE` ファイル参照）
- [ ] 用語表（本計画書 §5）に従い、ADC / Vertex AI / Cloud Run / フォールバック / 差別化軸 等の表記が seed.md と一致
- [ ] `package.json` の `files` 配列に `"README.ja.md"` が含まれる
- [ ] `package.json` のその他フィールド（name / version / description / keywords / dependencies 等）が変更されていない
- [ ] `npm publish --dry-run` の `Tarball Contents` 出力に `README.md` と `README.ja.md` が両方含まれる（出力を summary に添付）
- [ ] `npm run build` および `npm run typecheck` が成功する（README 変更で壊れないことの回帰確認）

---

## 9. 想定リスクと対処

| リスク | 影響 | 対処 |
|--------|------|------|
| 英語版と日本語版の情報乖離 | ユーザーが言語によって異なる情報を得る | 受け入れ基準でセクション 1:1 を必須化。任意で同期コメントをファイル末尾に追加 |
| 日本語訳の表記揺れ | ドキュメントの品質低下 | seed.md の用法を §5 で明示し、それに準拠 |
| `package.json` の `files` 追加忘れ | npm にパッケージしても日本語版が同梱されない | dry-run で `Tarball Contents` を必ず確認（§7.4） |
| 言語切替リンクの相対パス誤り | GitHub 上で 404 | `./README.md` / `./README.ja.md` の相対パス形式に統一 |
| 既存 README の英語本文を意図せず改変 | T07 のレビュー結果を上書き | 言語切替行 1 行の追加のみに限定。`git diff README.md` で確認 |

---

## 10. 実装順序（推奨）

1. `README.md` 先頭に言語切替行を 1 行追加（最小修正）。
2. `README.ja.md` を新規作成（英語版を雛形にセクションごとに翻訳）。
3. `package.json` の `files` 配列に `"README.ja.md"` を追加。
4. `npm run build` と `npm run typecheck` で回帰確認。
5. `npm publish --dry-run` を実行し `Tarball Contents` を確認 → summary に貼り付け。
6. §8 のチェックリスト全項目を確認して完了報告。

コード変更ファイルは小さく、相互依存も無いため 1 PR / 1 commit で完結する。
