# Design Review v2: T15 v0.5.0 doctor ADC source

## Verdict

**Approved**

前回の Issues (I1〜I5) と Recommendations (R-rec-1〜R-rec-7) はすべて plan.md に反映済み。Implementer が plan.md だけで着手できる状態に達した。残る指摘は Renderer / JSON example の整合に関する軽微な改善 1 件のみで、Implementer のコード判断で吸収可能なので **Recommendations** に留め、Approved とする。

## Strengths

- **I1 が完全に解消されている** (§ Step 9 / § 9 / § 11.2 / § 7 R12)。`plugin.json` line 3 の既存 `version` を 0.4.0 → 0.5.0 に書き換えるだけ、4 way sync (5 way ではない)、CI 調査・user 確認は不要、と明快に書かれている。事実誤認に基づく無駄な探索を Implementer から完全に取り除けた。
- **I2 が Planner 責任で確定** (§ 3.1 表 / § 3.4 / § 6 verify-d / § 11.1)。`adcSource` (camelCase) で JSON / 受け入れ基準 11.d の `jq` コマンド / README / verify-d.txt まで一貫して書き換えられている。`quotaProjectId` / `clientId` / `clientEmail` / `envCredentials` / `defaultLocation` / `cloudsdkConfig` / `metadataServer` / `envHeuristic` / `probeOk` / `probeError` / `accountError` も全部 camelCase。snake_case 混在は排除済み。
- **I3 の `DoctorEnv` 拡張が型レベルで完結** (§ 3.2)。5 key (`K_SERVICE` / `GAE_APPLICATION` / `KUBERNETES_SERVICE_HOST` / `CLOUD_BUILD_BUILDID` / `CLOUDSDK_CONFIG`) を optional string で追加し、`cli.ts` 側で `process.env` から **9 key** を組み立てるコード例まで明示。さらに § 3.3 の解決順序フローと Step 2 実装コードでは `env.CLOUDSDK_CONFIG` / `env.K_SERVICE` 等を **`env.*` 経由** で参照しており、コメント "(★ env 経由 — I3)" / "(★ すべて env.* 経由 — I3)" で意図を明文化。`process.env` 直読みは完全排除されている。
- **I4 の挙動一本化** (§ 3.3 step 8 / Step 7 / Step 2 test 11)。「`runGcloud` は throw しない・gcloud 不在も空 stdout も両方 `undefined`」を脚注で確認した上で、option (b)「`account === undefined` → `accountError = 'gcloud unavailable or no active account'` 一本化」を採用。テストも throw 経路と undefined 経路を別ケースで書いて両方が同一文言になることを確認している。文言固定 (引き継ぎノート 4) も明示。
- **I5 の `meta === null` text 出力が確定** (§ 3.5 (b))。「3 行 (`type` / `quotaProjectId` / `clientId`) を省略 + `meta:  (not available — file unreadable or not parsed)` を 1 行」で Planner 責任で決め切っている。Step 5 のテストにも `assert.match(text, /meta: +\(not available — file unreadable or not parsed\)/)` と `assert.doesNotMatch(text, /quotaProjectId:/)` の両アサートが含まれており、緩い検査に逃げていない。
- **R-rec-2 が個別 canary 検査として強化** (§ 5.5)。`LEAK_CANARY_PRIVATE_KEY_BODY` / `LEAK_CANARY_KEY_ID` / `LEAK_CANARY_REFRESH_TOKEN` の 3 トークンを個別に `assert.doesNotMatch` し、さらに「キー名としても出ない」「`-----BEGIN ... PRIVATE KEY-----` 形式が出ない」「text renderer 出力にも出ない」「positive case として `client_email` は service_account のとき出る」までカバー。regex 1 本に頼らない多重防御。
- **R-rec-3 の `fileInfo` helper が § 3.3 内に明文化** (lines 188-200)。`exists: false` が「不在 / directory / symlink-to-dir のいずれか」を意味する契約まで `AdcSourceFileInfo` の comment (line 137) に書かれており、将来の reader にも伝わる設計。
- **R-rec-4 の `--probe-metadata-server` 挙動を § 3.3 step 7 のコメントで明示** (lines 252-254)。「Cloud Run でない環境からのデバッグ probe を許容する明示の方針」「タスク文の『heuristic 一致時の probe』とも非衝突」と書かれており、Implementer の解釈ブレを完全に防いでいる。Step 2 test 15 で「envHeuristic === 'none' でも probe される」を明示テスト化。
- **R-rec-5 の複数行対応が Step 7 で固定** (lines 627-630)。`split(/\r?\n/)[0]?.trim()` で最初の 1 行のみ採用し、unit test (Step 7 step 4) に「改行混じり → 最初の 1 行」ケースを書いている。
- **R-rec-6 の `MINIMAL_ADC_SOURCE_STUB` から `accountError` を omit** (§ 5.6)。既存 30 テストにノイズを混入させない最小 stub 設計。account 検証する新規テストでは個別に値を組み立てる方針も明示。
- **R-rec-7 の deprecation roadmap が Step 10 / R11 で確定** (lines 678-679, 839)。「v1.0 で `CREDS_FILE_MISSING` を deprecate し `ADC_FILE_MISSING` 一本化を予定。JSON consumer は早めに移行を推奨」と CHANGELOG Notes に明記する方針。

## Issues (Must Fix)

なし。

## Recommendations

### R-v2-rec-1. § 3.4 JSON example の `null` 表示と実装の「キー omit」の不整合 (Implementer に判断委譲可)

§ 3.4 の JSON example では:
- `"cloudsdkConfig": null`  (line 316)
- `"accountError": null`  (line 330)

と書かれている。一方、§ 3.3 interface と Step 2 実装コード (lines 565, 569) は:

```ts
...(cloudsdkConfigDir ? { cloudsdkConfig } : {}),
...(accountError !== undefined ? { accountError } : {}),
```

で **キー自体を omit** する設計。つまり `cloudsdkConfig` の値が "存在しないとき出ない" のか "`null` で出る" のかが example と実装で食い違っている。同様に `accountError` も。

**推奨**: いずれかに統一する。Planner 推奨は **「key omit」で統一** (= example の 2 行 `"cloudsdkConfig": null` と `"accountError": null` を削除し、コメントで「unset の場合は key 自体が出ない」と書き添える)。理由は (a) interface 側で `cloudsdkConfig?: ... | null` ではなく `cloudsdkConfig?: AdcSourceFileInfo | null` と書かれており、§ 3.3 interface コメント "CLOUDSDK_CONFIG が立っているときのみ key を出す" と整合、(b) JSON consumer は `obj.cloudsdkConfig === undefined` で判定する方が `null` チェックより自然、(c) JSON サイズも僅かに小さくなる。

実装側を変えて `null` を明示的に出す案も成立するが、その場合 Step 2 の `...(cloudsdkConfigDir ? ... : {})` を `cloudsdkConfig: cloudsdkConfigDir ? ... : null` に書き換える必要があり、interface 型も `cloudsdkConfig: AdcSourceFileInfo | null` (optional ではなく必須) に変える整合作業が発生する。

致命的ではないので Implementer のコード判断で吸収可能 (どちらに倒しても受け入れ基準 11.d の `jq .adcSource` は通る)。ただし、PR description / CHANGELOG に「unset 時は key omit」または「unset 時は null」のどちらを採ったかを 1 行明記してほしい。

### R-v2-rec-2. `accountError` 出力の不変条件を Step 2 / Step 4 のテストでも明示してほしい (微差)

§ 3.3 step 8 で「`account === undefined` のときのみ `accountError` をセット」「文言は固定 `'gcloud unavailable or no active account'`」と決めているが、Step 2 test 11 と Step 4 のテストは「`accountError === '...'`」までは asserted されていない (test 11 では「accountError === '...'」と書かれているが、Step 4 の新規 5 ケースでは accountError 検証ケースが明示的に列挙されていない)。

**推奨**: Step 4 新規 5 テストの 6 つ目として「resolver が `accountError` をセットして返したとき、JSON 出力にもその文言が含まれる (`assert.match(json, /gcloud unavailable or no active account/)`)」を追加。これにより文言固定 (引き継ぎノート 4) を機械的に保証できる。

### R-v2-rec-3. CHANGELOG `Notes` の「camelCase 統一」を README にも 1 行書いてほしい

§ Step 10.3 で CHANGELOG Notes に「JSON 命名は camelCase で統一」と書く方針はあるが、README の `## Diagnostics (doctor)` の JSON 例セクションでも 1 行 (例: "JSON output uses camelCase keys throughout, matching the existing `gcpEnv` / `authRoute` / `apiKey` style.") を添えると、JSON consumer を書く読者がタスク文の `adc_source` 表記を見て混乱する事態を防げる。CHANGELOG はリリース時の差分しか追わない読者がいる。

これも Implementer のドキュメンテーション判断で吸収可能。

## Risk Assessment

- **secret leak risk**: **低 (前回維持)**。`parseAdcMeta` の新オブジェクト詰め替え + § 5.5 の LEAK_CANARY 個別 assert + キー名 / PEM ヘッダ / text renderer / positive case (`client_email`) の 4 軸検査で多重防御が効いている。R1 と § 5.5 の組み合わせは構造的に secret 流出を不可能にする設計。
- **backward compat risk**: **低 (前回 中 → 低に降格)**。I3 (`DoctorEnv` 拡張) が optional string で確定し、§ 5.6 の `MINIMAL_ADC_SOURCE_STUB` が `accountError` を omit したことで「既存 `baseOpts` に 1 行追加するだけ」の互換戦略が成立。`CREDS_FILE_MISSING` 並列発火と deprecation roadmap も明記。schema 名 `nanobanana-adc-doctor/v1` 維持。
- **test coverage risk**: **低 (前回 低〜中 → 低に降格)**。I5 確定により Step 5 の renderer テストが 3 軸 (meta あり / meta null / accountError あり) で具体的な assert を持てるようになった。`resolveAdcSource` 15 ケース / warnings 6 ケース / 統合 5 ケース / secret leak 多軸 / Step 7 fetcher 3 ケース で網羅性は十分。
- **env edge case risk**: **低 (前回 中 → 低に降格)**。I3 で `DoctorEnv` 経由の env 注入が完成し、I4 で `gcloud` 不在挙動が `runGcloud` の事実と整合した。Windows path / `CLOUDSDK_CONFIG` 優先 / metadata server heuristic / directory 誤指定 / 巨大 JSON / malformed JSON / gcloud 不在 はすべて § 7 で 16 件カバーされており、deps 注入で全て unit test 可能。
- **plugin / version sync risk**: **低 (前回 中 → 低に降格)**。I1 の事実誤認が解消され、4 way sync (`package.json` / `plugin.json` / `marketplace.json` / `src/cli.ts` × 2 同一行外) で確定。CI `validate-plugin` の挙動も既知。

## Sign-off

- [x] 全 11 受け入れ基準が計画でカバーされている
- [x] secret leak の防御が設計に組み込まれている (parseAdcMeta 詰め替え + LEAK_CANARY 個別 assert + サイズ上限 + キー名検査 + text renderer 検査の多軸防御)
- [x] Implementer が plan.md だけで実装着手できる (I1〜I5 がすべて確定。Recommendations は Implementer のコード判断で吸収可能)
