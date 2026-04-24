# Design Review: T03 plan.md (rev2)

## 判定

**Verdict: Approved**

前回 Changes Requested の主因だった Major 2 件が、設計レベルで過不足なく解消されている。生 `fetch` 経路を本命に据えた §6.2 は endpoint / method / headers / body / レスポンス抽出が実コードで書き切られており、実装者が plan 段階で詰まる余地は無い。§2 の `resolveAuth()` 契約もログ文言固定 2 パターン + throw / no-exit を明文化し、T02 との責任分界が確定した。Critical 指摘なし、残存 Major / Minor なし。

---

## 前回指摘への対応状況

- **Major #1(Vertex AI 呼び出しの具体化)**: ✅ 解消
  - §0 Planner 見解で `@google/generative-ai` 0.21 が `GOOGLE_GENAI_USE_VERTEXAI=true` を参照しない事実を宣言し、「ADC 経路は生 `fetch`」を本計画の方針として確定。
  - §6.1 で認証モード分岐の骨格(ADC → `generateViaVertexFetch` / API キー → `generateViaSdk`)を提示。
  - §6.2(本命)に以下を具体コードで記述:
    - endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`
    - method = POST、headers = `Authorization: Bearer <accessToken>` + `Content-Type: application/json`
    - body = `{ contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio, imageSize } } }`
    - レスポンス抽出 = `candidates[0].content.parts[i].inlineData.data` を base64 文字列として取得、`!res.ok` 時は `[generate] Vertex AI HTTP <status>: <body 先頭 500 字>` を throw、画像が無ければ `[generate] response contained no image data` を throw、複数返っても 1 枚目だけ採用。
  - §6.4 で SDK `baseUrl` + `customHeaders` 経路を「**実装しない**」と明記し、参考情報として擬似コードのみ残置。実装者は本命経路一本で進める。
  - §11 ステップ 4 も「ADC モード(本命)= 生 fetch」「SDK の baseUrl 経路は実装しない」と本方針に同期済み。

- **Major #2(`resolveAuth()` 契約の厳密化)**: ✅ 解消
  - §2 ドキストリングに **ログ契約(固定文字列 2 パターン)** を明記:
    - API キーモード: `[auth] using: api-key`
    - ADC モード: `[auth] using: adc`
    - 「`[auth] using: adc | api-key` のようなパイプ区切り単一文字列は誤解釈」と注意書きまで加えており、tasks.md T02 原文との齟齬を先回りで封じている。
  - §2 ドキストリングの **失敗時の契約** に「Error を throw」「`process.exit()` は呼ばない」「exit 1 は CLI 層 T04 の責務」を明記。
  - §2 末尾の「契約の要点」節で上記 2 点を番号付きで再掲し、T02 実装者が読み落としにくい構成に。
  - §10.1 の T02 先行実装のコード(`console.log('[auth] using: api-key')` / `console.log('[auth] using: adc')` / `throw new Error(...)`)が §2 契約と 1:1 で対応しており、契約と実装が食い違わない。

- **Minor #1-5 の反映状況**: Minor #1(aspect strict union + `assertAspect` export 断定)と Minor #2(「最小 stub」→「T02 先行実装 (provisional implementation)」改称)は §3.1 / §10 / §13 / Revision History に全面反映。Minor #3(ステップ 4 の退避条件)は本命経路を生 fetch へ反転したことで論点自体が消滅(退避の必要が無い)。Minor #4(writeFile 上書き)と Minor #5(ログ区切り文字)は未反映だが **任意**であり Approved を妨げない。

---

## 残存する指摘(もしあれば)

- Critical: なし
- Major: なし
- Minor: なし(前回 Minor #4 / #5 は任意扱い、反映不要で合意済み)

---

## 全体所感

- Major #1 で「SDK の Vertex 対応が曖昧」という外部依存のリスクを **方針反転(生 fetch を本命化)** で根本解決した判断が良い。退避経路を足すのではなく不確実な経路自体を主経路から外したことで、実装者の判断コストがゼロに近づいた。
- Major #2 のログ文言固定化はテスト容易性(T03 grep / T04 動作確認)と T02 実装者の解釈ブレ防止を同時に達成しており、契約設計として堅い。
- §6.5 の「実装者へのメモ」(Nano Banana Pro の `imageConfig.imageSize` が文字列で受け付けられない場合のピクセル値フォールバック)も plan レベルでの未確証点を正直に開示しており、実装段階で詰まっても方針を迷わない。このまま実装フェーズに進んで問題なし。
