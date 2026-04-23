# 作業指示書

seed.md のコンセプトをもとに `nanobanana-adc` を実装する。
各タスクは独立して着手できるよう粒度を揃えている。

---

## T01 — プロジェクト骨格

**目標**: ビルド・型チェック・lint が通る空プロジェクトを作る

- [ ] `package.json` 作成（name, version, bin, scripts, dependencies 初期値）
- [ ] `tsconfig.json` 作成（strict, ES2022 target, Node16 moduleResolution）
- [ ] `.gitignore` 作成（node_modules, dist, *.js ビルド成果物）
- [ ] `src/cli.ts` 空エントリーポイント作成
- [ ] `npm install` が通ることを確認

**依存パッケージ（初期）**:
```
@google/generative-ai
google-auth-library
commander
```

---

## T02 — 認証レイヤー（`src/auth.ts`）

**目標**: ADC / API キーの切り替えを単一モジュールに閉じ込める

- [ ] `resolveAuth()` 関数: `--api-key` → `GEMINI_API_KEY` → ADC の順で認証情報を解決
- [ ] ADC パスでは `google-auth-library` の `GoogleAuth` を使い access token を取得
- [ ] 認証モードをログに 1 行出力する（`console.log("[auth] using: adc | api-key")`）
- [ ] 認証失敗時は明示的なエラーメッセージで exit 1

---

## T03 — 画像生成コア（`src/generate.ts`）

**目標**: プロンプト・サイズ・モデルを受け取り画像ファイルを保存する

- [ ] `GenerateOptions` 型定義（prompt, aspect, size, model, output, apiKey?）
- [ ] Vertex AI モード（`GOOGLE_GENAI_USE_VERTEXAI=true`）での `@google/generative-ai` 呼び出し
- [ ] アスペクト比・サイズを API パラメータにマッピング
  - size: `1K`=1024px, `2K`=2048px, `4K`=4096px
  - aspect: `1:1`, `16:9`, `9:16`, `4:3`, `3:4` 等 10 種
- [ ] レスポンスの base64 画像データをファイル保存
- [ ] 生成完了ログ（出力パス・モデル名・所要時間）

**既定モデル**: `gemini-3-pro-image-preview`

---

## T04 — CLI エントリーポイント（`src/cli.ts`）

**目標**: `commander` で引数を解析し T02・T03 を呼び出す

- [ ] `--prompt` / `-p`（必須）
- [ ] `--output` / `-o`（既定: `output.png`）
- [ ] `--aspect` / `-a`（既定: `1:1`）
- [ ] `--size` / `-s`（既定: `1K`）
- [ ] `--model` / `-m`（既定: `gemini-3-pro-image-preview`）
- [ ] `--api-key`（任意。ADC フォールバック用）
- [ ] `--help` で使い方が出ることを確認

---

## T05 — ビルド・bin 配線

**目標**: `bin/nanobanana-adc` がそのまま実行できる状態にする

- [ ] `tsconfig.json` に outDir: `dist` を設定
- [ ] `npm run build` で `dist/cli.js` が生成されることを確認
- [ ] `bin/nanobanana-adc` を shebang 付きで作成し `dist/cli.js` を呼ぶ
- [ ] `chmod +x bin/nanobanana-adc`
- [ ] `package.json` の `bin` フィールドに `"nanobanana-adc": "./bin/nanobanana-adc"` を設定
- [ ] `npm link` してローカルで `nanobanana-adc --help` が動くことを確認

---

## T06 — Claude Code plugin 設定

**目標**: `/plugin marketplace add` でインストール後すぐ使えるようにする

- [ ] `SKILL.md` 作成（slash command 定義・使い方・環境変数説明）
- [ ] `settings.json` 作成（SessionStart フックで `npm install --omit=dev`）
- [ ] `bin/` が CC plugin の PATH に追加されることを動作確認
- [ ] `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` を使ったパス解決の確認

---

## T07 — README・ドキュメント整備

**目標**: GitHub で公開できる状態にする

- [ ] README.md（インストール方法 × 2・使い方・環境変数一覧・認証設定手順）
- [ ] ADC セットアップ手順（`gcloud auth application-default login` から画像生成まで）
- [ ] LICENSE 追加（MIT）
- [ ] `package.json` に keywords / description / repository / homepage を追加

---

## T08 — npm publish

**目標**: `npm install -g nanobanana-adc` で動く状態にする

- [ ] `npm pack` でパッケージ内容を確認
- [ ] `node_modules` / `dist` が `.npmignore` or `files` フィールドで正しく制御されている
- [ ] `npm publish --dry-run` で問題がないことを確認
- [ ] `npm publish`

---

## 実装順序の推奨

```
T01 → T02 → T03 → T04 → T05（ここで動作確認）→ T06 → T07 → T08
```

T02〜T04 は並行着手可能。T05 は T02-T04 完了後。
