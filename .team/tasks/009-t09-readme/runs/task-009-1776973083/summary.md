# T09 実装サマリー: README バイリンガル化

## 変更ファイル一覧

| 種別 | パス | 概要 |
|------|------|------|
| 修正 | `README.md` | 先頭（タイトル直後）に `English · [日本語](./README.ja.md)` の 1 行を追加。他の本文は未変更。 |
| 追加 | `README.ja.md` | 日本語版を新規作成。英語版と 1:1 対応（`##` 9 個 / `###` 7 個が一致）。先頭に `[English](./README.md) · 日本語` を配置。 |
| 修正 | `package.json` | `files` 配列の `"README.md"` 直後に `"README.ja.md"` を追加。他フィールドは未変更。 |

## `npm publish --dry-run` の Tarball Contents

```
npm notice
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
npm notice Tarball Details
npm notice name: nanobanana-adc
npm notice version: 0.1.0
npm notice filename: nanobanana-adc-0.1.0.tgz
npm notice package size: 8.8 kB
npm notice unpacked size: 25.1 kB
npm notice shasum: 6dc31a51f9e1f0c280ff9b9bf94d1fcd3bcfcf65
npm notice integrity: sha512-vEBHdXGqCW782[...]XT3JmG8VOaiJA==
npm notice total files: 10
npm notice
npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access (dry-run)
+ nanobanana-adc@0.1.0
```

完全なログ: `/tmp/npm-dry-run.log`

## `npm run build` / `npm run typecheck` 結果

- `npm run build` (`tsc`): 成功（エラー・警告なし）。
- `npm run typecheck` (`tsc --noEmit`): 成功（エラー・警告なし）。

## 完了条件チェックリスト

- [x] `README.md` 先頭に言語切替行がある（3 行目: `English · [日本語](./README.ja.md)`）。
- [x] `README.md` の本文は変更されていない（言語切替行 + 空行のみ追加）。
- [x] `README.ja.md` が新規作成されており、先頭に言語切替行（`[English](./README.md) · 日本語`）がある。
- [x] `## ` 見出し数が両ファイルで一致（9 / 9）。`### ` も一致（7 / 7）。
- [x] 必須コンテンツ:
  - [x] プロジェクト説明（`## なぜ nanobanana-adc なのか` / `## 特徴`）。
  - [x] インストール 2 種（Claude Code plugin / npm install -g）。
  - [x] CLI 例 5 個（基本 / アスペクト比 + サイズ / 縦長 4K / モデル上書き / API キー）。
  - [x] オプション表（6 行: `--prompt` / `--output` / `--aspect` / `--size` / `--model` / `--api-key`）。
  - [x] 環境変数表（5 行: `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` / `GOOGLE_GENAI_USE_VERTEXAI` / `GOOGLE_APPLICATION_CREDENTIALS` / `GEMINI_API_KEY`）。
  - [x] ADC 手順（方式 A）。
  - [x] API キー手順（方式 B）。
  - [x] 認証優先順位（`--api-key` → `GEMINI_API_KEY` → ADC）。
  - [x] ライセンス（MIT, LICENSE リンク）。
- [x] `package.json` の `files` に `"README.ja.md"` を追加。
- [x] その他 `package.json` フィールドは未変更。
- [x] `npm publish --dry-run` の Tarball Contents に `README.md` と `README.ja.md` の両方が含まれる。
- [x] `npm run build` / `npm run typecheck` が成功。
