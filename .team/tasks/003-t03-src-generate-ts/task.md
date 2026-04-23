---
id: 003
title: T03: 画像生成コア (src/generate.ts)
priority: high
depends_on: [001]
created_by: surface:724
created_at: 2026-04-23T04:20:20.470Z
---

## タスク
docs/tasks.md の T03 を実装する。プロンプト・サイズ・モデルを受け取り画像ファイルを保存する。

## 受け入れ基準
- [ ] `GenerateOptions` 型を定義して export する
  - `prompt: string`
  - `aspect: string`（1:1 / 16:9 / 9:16 / 4:3 / 3:4 等、計 10 種をサポート）
  - `size: '1K' | '2K' | '4K'`（1K=1024px, 2K=2048px, 4K=4096px）
  - `model: string`（既定: `gemini-3-pro-image-preview`）
  - `output: string`
  - `apiKey?: string`
- [ ] `generate(options: GenerateOptions): Promise<void>` を export する
- [ ] Vertex AI モード（`GOOGLE_GENAI_USE_VERTEXAI=true`）で `@google/generative-ai` を呼ぶ
- [ ] レスポンスの base64 画像データを `output` パスに書き出す（ディレクトリが無ければ作る）
- [ ] 生成完了ログ: 出力パス・モデル名・所要時間（ms）を 1 行で

## 実装メモ
- `src/auth.ts` の `resolveAuth()` を使って認証情報を取得する
- アスペクト比・サイズは API パラメータにマッピングする（マッピング表は実装者判断）
- 画像が複数返っても 1 枚目だけ保存すればよい

## 参考
- docs/seed.md の「CLI インターフェース」
- docs/tasks.md の T03
- @google/generative-ai の Vertex AI モード使用例（実装者が必要に応じて web 検索）

## 注意
- T02 と並行実装可能だが、`src/auth.ts` の API は T02 に合わせる必要がある
- 実際の API 呼び出しのテストは認証情報がないと難しいので、ユニットテストは必須としない（型と構造を整えること優先）
