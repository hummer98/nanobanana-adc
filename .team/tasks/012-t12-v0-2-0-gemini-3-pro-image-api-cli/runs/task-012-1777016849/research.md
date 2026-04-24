# Research: Gemini 3 Pro Image API parameters

## 調査日時・環境

- 調査日 (UTC): 2026-04-24T07:54:30Z
- 対象モデル: `gemini-3-pro-image-preview` (Vertex AI / AI Studio 共通モデル ID)
- プロジェクトで利用中の SDK: `@google/generative-ai@0.24.1` (package.json)
- 参考に読んだ Google 公式 SDK: `@google/genai` (js-genai) / `google-genai` (python-genai) — どちらも main ブランチ最新
- Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-012-1777016849`

## サマリ（TL;DR）

Gemini 3 Pro Image の `generateContent` 用 `imageConfig` は **Imagen の `GenerateImagesConfig` と別物**で、サポート項目が大幅に少ない。今回スコープの 5 項目は次のように扱うのが妥当。

| # | CLI オプション候補 | 対応箇所 (body path) | Vertex AI | AI Studio | 採否と根拠 |
|---|---|---|---|---|---|
| 1 | 複数画像生成 (`-n` / `--count`) | `generationConfig.candidateCount` ／ `...imageConfig.numberOfImages` | ❌ 400 `Multiple candidates is not enabled for this model` | ❌ 同上 | **不採用** — モデルが拒否。並列リクエストで代替するよう README で案内。 |
| 2 | `--person-generation <mode>` | `generationConfig.imageConfig.personGeneration` | ✅ `ALLOW_ALL` / `ALLOW_ADULT` / `ALLOW_NONE` | ✅ 同上（Tier によって `ALLOW_ALL` がブロックされる報告あり） | **採用** — default は未指定（モデルデフォルト）。値は enum で検証してから送る。 |
| 3 | `--seed <int>` | `generationConfig.seed` (top-level) / `imageConfig.seed` は存在しない | ⚠️ 一次ソース未記載 (image 用は silently ignored との 2 次情報) | ⚠️ 同上 | **不採用** — gemini-3-pro-image-preview で官公式に保証されていない。今回はスコープ外とし、必要になった時点で再検証。 |
| 4 | `--format png\|jpeg` | `generationConfig.imageConfig.outputMimeType` / `imageOutputOptions.mimeType` | ✅ Vertex のみ | ❌ "not supported in Gemini API" | **不採用** — AI Studio で非対応のため両経路共通の CLI にできない。モデル既定 (PNG) のまま保存し、ユーザーが変換する。 |
| 5 | `--negative-prompt <text>` | `generationConfig.imageConfig.negativePrompt` | ❌ フィールド自体が存在しない (Imagen 専用) | ❌ 同上 | **不採用** — プロンプト内に自然言語で「〜を含めない」と書く運用を README で案内。 |

今回の task-012（v0.2.0 CLI 拡張）で**採用すべきは 2. personGeneration のみ**。他は一次ソースで否定的／未確認のためスコープから外すのが安全。

---

## パラメータ別調査結果

### 1. 複数画像生成

#### Vertex AI REST

- `generationConfig.candidateCount` は `GenerationConfig` スキーマには存在する (`https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/GenerationConfig`) が、`gemini-3-pro-image-preview` ／ `gemini-3-pro-preview` 側が拒否する。Google AI Developers Forum での一次報告:
  - 検証スレッド: <https://discuss.ai.google.dev/t/multiple-candidates-candidatecount-is-not-supported-for-image-generation-models/124694> (取得 2026-04-24)
  - 返却エラー: `400 INVALID_ARGUMENT: "Multiple candidates is not enabled for this model"`
- `imageConfig` 以下には **`numberOfImages` というフィールドは存在しない**。`numberOfImages` は `GenerateImagesConfig` (Imagen 専用 `:predict`) 側のプロパティ (python-genai `types.py` 行 8543 / js-genai `types.ts` 行 3750)。

#### AI Studio SDK

- プロジェクトが使用中の `@google/generative-ai@0.24.1` の `GenerationConfig` 型には `candidateCount?: number` が存在する (dist/generative-ai.d.ts:679) が、サーバ側で同じエラーが返る（Google AI for Developers フォーラムでは AI Studio 経由の再現も報告されている）。
- `@google/genai` (後継 SDK) の `ImageConfig` インタフェース (`js-genai/src/types.ts:2599-2620`) にも `numberOfImages` は無い。これが **両 API 共通の最終形**。
- js-genai 公開ドキュメント: <https://googleapis.github.io/js-genai/release_docs/interfaces/types.ImageConfig.html> (取得 2026-04-24) — `numberOfImages` / `seed` / `negativePrompt` の記載なし。

#### 互換性

- 両経路とも非対応。1 リクエスト＝1 枚。

#### 推奨

- `--count` / `-n` オプションを**追加しない**。どうしても複数欲しい場合は CLI ランナが `Promise.all` で並列投げすべきだが、v0.2.0 スコープ外。README で「1 call = 1 image」として明記する。

---

### 2. personGeneration

#### Vertex AI REST

- `js-genai` ImageConfig インタフェース (`src/types.ts:2607-2609`):
  > `personGeneration?: string;` — "Controls the generation of people. Supported values are: `ALLOW_ALL`, `ALLOW_ADULT`, `ALLOW_NONE`."
- `python-genai` 同等 (`types.py:5398-5402`)。
- 送信位置: `generationConfig.imageConfig.personGeneration`。
- 補足: Imagen の `GenerateImagesConfig.personGeneration` は別の `PersonGeneration` enum（`DONT_ALLOW` / `ALLOW_ADULT` / `ALLOW_ALL`、python-genai `types.py:331-339`）を取るので**値を取り違えないこと**。CLI からはモデル ID を問わず使える薄いラッパにしない。

#### AI Studio SDK

- js-genai のコメントで `ImageConfig.personGeneration` は "Gemini API is supported" (outputMimeType/outputCompressionQuality/imageOutputOptions/prominentPeople と違い、明示的な "not supported in Gemini API" 記述なし)。
- ただし Tier 1 の API キーでは `allow_all` が弾かれるという実運用報告がある:
  - <https://github.com/SillyTavern/SillyTavern/issues/4824> (取得 2026-04-24) — `400 Bad Request: "allow_all for personGeneration is currently not supported."` (Imagen 経路での報告だが、同じ AI Studio 側のレート制限と見て扱いに注意)
- 古い `@google/generative-ai@0.24.1` の `GenerationConfig` 型には `imageConfig` は未定義。既存コードが `as any` で送っているのと同様、`personGeneration` も `as any` で乗せれば JSON 化されて届く (`src/generate.ts:152-161` がすでに同手法)。

#### 互換性

- 両経路でフィールド名 `personGeneration` は一致。`enum` 値も同じ文字列 3 種 (`ALLOW_ALL` / `ALLOW_ADULT` / `ALLOW_NONE`)。

#### 推奨

- `--person-generation <mode>` を追加。enum は CLI 側で `ALLOW_ALL | ALLOW_ADULT | ALLOW_NONE` のみ受理し、それ以外は `assertPersonGeneration` で即エラー。
- デフォルトは**指定しない**（モデル依存の default に任せる）。`ALLOW_ADULT` を強制 default にすると Tier の違う Vertex ユーザーが意図せず制限される恐れがあるため。
- 送信先は `generationConfig.imageConfig.personGeneration`。Vertex (fetch) と AI Studio SDK (`getGenerativeModel().generationConfig`) の双方に同じ文字列を詰める。

---

### 3. seed

#### Vertex AI REST

- `GenerationConfig` スキーマには `seed?: number` が top-level で存在する (Vertex REST ref, `GenerationConfig` #15 フィールド)。対象はテキストモデルで、説明は "A seed for the random number generator. By setting a seed, you can make the model's output mostly deterministic."
- `ImageConfig` には `seed` フィールドが**無い** (`js-genai/src/types.ts:2599-2620`, `python-genai/types.py:5384-5420`)。
- `gemini-3-pro-image-preview` 向けには seed 対応の明示なし。Google AI for Developers Forum でも「seed で再現性が得られるか」という質問自体が未解決 (`https://discuss.ai.google.dev/t/multiple-candidates-candidatecount-is-not-supported-for-image-generation-models/124694`, 取得 2026-04-24)。
- 一次ソース (`https://ai.google.dev/gemini-api/docs/image-generation`, `https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image`, 取得 2026-04-24) のパラメータ表にも seed の記載なし。
- 二次情報 (非公式ブログ、<https://blog.laozhang.ai/en/posts/nano-banana-pro-seed-parameter>, 取得 2026-04-24) は「Nano Banana Pro は autoregressive アーキテクチャのため seed をサポートしない」と主張するが、具体的なエラー挙動（400 で弾かれるのか silently ignored か）は検証していない。

#### AI Studio SDK

- `@google/genai` の `GenerateContentConfig` にも `seed?: number` は top-level に存在 (js-genai `types.ts:2729-2733`) が、image 出力での挙動保証は無し。
- 旧 SDK `@google/generative-ai@0.24.1` の `GenerationConfig` 型には `seed` すら未定義 (dist/generative-ai.d.ts:678-717 参照、`seed` のマッチなし)。

#### 互換性

- フィールド名は両経路で `generationConfig.seed`（camelCase）で一致する「ように見える」が、画像モデルでの効果が**公式に保証されていない**。

#### 推奨

- 今回は**不採用**。CLI に `--seed` を露出させると「指定したのに再現しない」というサポート負荷が発生する。将来 Google が `ImageConfig.seed` を正式公開したら再検討。

---

### 4. mimeType / outputMimeType

#### Vertex AI REST

- `ImageConfig.outputMimeType?: string` (js-genai `types.ts:2612-2614`):
  > "MIME type of the generated image. This field is not supported in Gemini API."
- `ImageConfig.outputCompressionQuality?: number` と `ImageConfig.imageOutputOptions?: { compressionQuality?: number; mimeType?: string }` も同様に **Vertex AI 限定**。
- 値の許容範囲は一次ソース上で明示されていないが、Imagen 側の `GenerateImagesConfig.outputMimeType` (python-genai 8581) は `image/png` と `image/jpeg` を受け付ける慣例があり、Vertex gemini-3-pro-image でも同じ 2 種が想定される（ただし断定不可のため要実機確認）。

#### AI Studio SDK

- 明示的に "not supported in Gemini API" と型定義コメントに記載されている (js-genai `types.ts:2612-2614`, python-genai `types.py:5407-5411`)。

#### 互換性

- **非対称**: Vertex のみ対応。AI Studio では 400 か silently ignored になる。

#### 推奨

- 今回は**不採用**。両経路対称性を CLI の売りにする以上、片方で効かない option を露出するのは CLAUDE.md の設計原則 (“One binary, two distributions” / “No hidden coupling”) に反する。
- 現行の `inlineData.mimeType` をログで拾って拡張子自動推定くらいは将来検討可 (scope beyond task-012)。

---

### 5. negativePrompt

#### Vertex AI REST

- `ImageConfig` (generateContent 用) に `negativePrompt` フィールドは**存在しない** (js-genai `types.ts:2599-2620` および python-genai `types.py:5384-5420`)。
- `negativePrompt` が登場するのは Imagen 系 (`GenerateImagesConfig`, `EditImageConfig`, `RecontextImageConfig`) のみ (python-genai `types.py` 行 8539, 9188, js-genai `types.ts` 行 3748 付近)。

#### AI Studio SDK

- Gemini API 側ドキュメントでも negative prompt の記載なし (<https://ai.google.dev/gemini-api/docs/image-generation>, 取得 2026-04-24)。公式ガイドは「追加してほしくない要素は prompt 内に記述する」スタイルを暗に推奨。

#### 互換性

- 両経路で**未サポート**。

#### 推奨

- CLI オプション化しない。README / SKILL.md で「`--prompt` 内に自然言語で『X は含めない』と書く」ワークアラウンドを紹介する。

---

## 不採用パラメータまとめ

| パラメータ | 不採用理由 |
|---|---|
| `candidateCount` / `numberOfImages` | `gemini-3-pro-image-preview` はサーバサイドで拒否（`Multiple candidates is not enabled for this model`）。並列リクエストで代替を README に記載。 |
| `seed` | ImageConfig に無い。top-level `generationConfig.seed` は画像モデル向けの挙動が一次ソースで保証されていない。 |
| `outputMimeType` / `imageOutputOptions.mimeType` | AI Studio では "not supported in Gemini API" と SDK コメントで明記。Vertex only では両経路対称の売りが崩れる。 |
| `negativePrompt` | そもそも `ImageConfig` に含まれていない（Imagen 系 config 限定）。 |
| `outputCompressionQuality` / `prominentPeople` | 参考情報。`ImageConfig` にあるが SDK コメントで "not supported in Gemini API" と明記。今回スコープ外。 |

## 今回採用してよいパラメータ

| パラメータ | body 内パス | 備考 |
|---|---|---|
| `personGeneration` | `generationConfig.imageConfig.personGeneration` | `ALLOW_ALL` / `ALLOW_ADULT` / `ALLOW_NONE`。CLI 側で enum 検証し、両経路で同じ文字列をそのまま送る。 |
| （既存）`aspectRatio` | `generationConfig.imageConfig.aspectRatio` | 既に `src/generate.ts` で設定済み。 |
| （既存）`imageSize` | `generationConfig.imageConfig.imageSize` | 既に設定済み（1K/2K/4K）。 |

（task-012 の範囲外だが記録しておく）今後 enum 拡張や追加フィールドが公式ドキュメントに反映されたら、この表を更新すること。

---

## 参考文献

すべてアクセス日時 2026-04-24 (UTC)。

### Google 公式ドキュメント

- Gemini 3 Pro Image 概要 (Vertex AI): <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image>
- Gemini 3 Developer Guide (AI Studio): <https://ai.google.dev/gemini-api/docs/gemini-3>
- Nano Banana image generation: <https://ai.google.dev/gemini-api/docs/image-generation>
- Gemini 3 Pro Image Preview model page (AI Studio): <https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image-preview>
- Vertex `GenerationConfig` REST schema: <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/GenerationConfig>
- Image generation guide (Vertex): <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/image-generation>
- Aspect ratio (Imagen 参考): <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/configure-aspect-ratio>
- Responsible AI safety settings (Imagen 参考): <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/configure-responsible-ai-safety-settings>

### 公式 SDK 型定義

- `@google/genai` (js-genai) `ImageConfig` interface: <https://googleapis.github.io/js-genai/release_docs/interfaces/types.ImageConfig.html>
- `@google/genai` 型定義 (GitHub main): `https://raw.githubusercontent.com/googleapis/js-genai/main/src/types.ts` — `ImageConfig` 行 2599-2620、`PersonGeneration`/`ProminentPeople` 注記あり
- `google-genai` (Python) 型定義 (GitHub main): `https://raw.githubusercontent.com/googleapis/python-genai/main/google/genai/types.py` — `ImageConfig` 行 5384-5420、`PersonGeneration` enum 行 331-339
- Google 公式 notebook (`intro_gemini_3_image_gen.ipynb`): <https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/getting-started/intro_gemini_3_image_gen.ipynb> — `image_config` で使っているのは `aspect_ratio` と `image_size` のみ
- 旧 SDK `@google/generative-ai@0.24.1` (本プロジェクトの `node_modules`): `dist/generative-ai.d.ts` `GenerationConfig` 行 678-717 — `candidateCount` あり、`imageConfig` / `seed` なし

### コミュニティ / 2 次ソース（裏取り用）

- Forum: "Multiple candidates (candidateCount) is not supported for image generation models": <https://discuss.ai.google.dev/t/multiple-candidates-candidatecount-is-not-supported-for-image-generation-models/124694>
- SillyTavern #4824 — `"allow_all for personGeneration is currently not supported"`: <https://github.com/SillyTavern/SillyTavern/issues/4824>
- LaoZhang AI Blog — Nano Banana Pro seed workarounds (2 次、裏取り用): <https://blog.laozhang.ai/en/posts/nano-banana-pro-seed-parameter>
- js-genai Issue #1461 — `imageSize` 無視バグの再現 (パラメータ受理経路の参考): <https://github.com/googleapis/js-genai/issues/1461>
- litellm Issue #21070 — `imageConfig` 無視問題の観測: <https://github.com/BerriAI/litellm/issues/21070>
