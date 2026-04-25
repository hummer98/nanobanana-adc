# Design Review: T15 v0.5.0 doctor ADC source

## Verdict

**Changes Requested**

骨格 (型設計 / 解決順序 / 純関数化 / secret 抽出 → 詰め替え / TDD ステップ / mock 戦略) は健全だが、(a) 既存ファイルに対する**事実誤認**と (b) **未確定の設計判断を Implementer に丸投げ**している箇所があり、現状 plan.md だけでは手戻り無しに着手できない。下記 Issues を修正すれば Approved。

## Strengths

- **secret leak の構造的防御**が設計の中心に据えられている。`parseAdcMeta` が**新オブジェクトに詰め替え**ることで、source object の `private_key` 等が accidental serialize されるリスクを型で排除している (§ 3.2 末尾コメント、R1)。さらに § 5.5 で regex ベースの黒箱検査を二重化しており防御深度が十分。
- **既存 7 warning + 30 テストの後方互換**が明示的に保護されている (§ 3.5 で `CREDS_FILE_MISSING` と `ADC_FILE_MISSING` の重複発火を採用、§ 5.6 で `baseOpts` に `adcSourceResolver` stub を 1 行追加するだけで全 pass する設計)。
- **deps 注入による network/fs/子プロセスの完全隔離**設計。`fileExistsAsync` / `statAsync` / `readJsonAsync` / `gcloudActiveAccountFetcher` / `metadataServerProbe` / `homeDir` / `appDataDir` / `platform` がすべて injectable で、ユニットテストは fs / 169.254.169.254 / `gcloud` を一切叩かない (§ 5.2)。
- **資源耐性の設計**: ADC JSON サイズ上限 1 MB、JSON parse 失敗時 fall-through、`stat().isFile()` で directory 誤指定対処 (R3, R4)、`AbortController` + 300ms timeout で metadata server probe を抑制 (Step 8) — いずれも妥当。
- **TDD step 1→11 の粒度とコミット粒度**が均等で、各 step 後に CI が green であることを担保している。
- **タスク文と plan の不整合点を Planner 視点で複数列挙**している (§ 3.1 「camelCase vs snake_case」「ADC_FILE_MISSING の扱い」など) — 隠さず正面から議論しているのは良い。
- **スコープ外の明示** (§ 10) — WIF deep parse / impersonation chain は触らず、CHANGELOG Notes に追記する方針。YAGNI 違反を起こしにくい。

## Issues (Must Fix)

### I1. **`plugin.json` に version 欠落」は事実誤認**(§ Step 9 / § 7 R12 / § 9 表 / § 11 引き継ぎノート 2)

plan は `plugin.json` に `version` キーが「**存在しない**」と複数箇所で主張し、Implementer に「user に確認」「CI スクリプトに bug がある可能性」を投げている。しかし実ファイル `.claude-plugin/plugin.json` line 3 には既に `"version": "0.4.0"` が**存在**しており、`.github/workflows/ci.yml` line 58 がこの値を読んで package.json / marketplace.json / src/cli.ts と 4 way 比較している(line 62 で不一致なら exit 1)。**現行 v0.4.0 リリース時点でこの 4 way sync は機能している**。

**修正要件**: § Step 9 / § 9 表 / § 11.2 / R12 の plugin.json に関する記述を「既存 `version` を `0.4.0` → `0.5.0` に更新する」だけに書き直す。**version 同期箇所は 4 (5 ではない)**。「version field の追加」「CI 側 bug の調査」など**不要な作業を Implementer から削除**する。これを直さないと Implementer が無駄な調査・user 確認に時間を使う。

### I2. **`adcSource` vs `adc_source` の naming を Planner として確定せよ**(§ 3.3 / R9 / § 11.1)

タスク文受け入れ基準は `adc_source` (snake_case) と書かれているのに、plan は「Planner として `adcSource` (camelCase) を推奨。Implementer は user 確認 or PR で明示すること」と判断を逃している。これは **plan.md だけでは Implementer が着手できない**ことを意味する(受け入れ基準 / README / テスト / `jq` 動作確認コマンドのすべてに波及する判断)。

**修正要件**: Planner が責任をもってどちらか一方に確定する。既存 `gcpEnv` / `authRoute` / `apiKey` が camelCase である事実は十分強いので **`adcSource` で確定**を推奨。確定した上で:
- 受け入れ基準 11.d の `jq .adc_source` は `jq .adcSource` に書き換える
- README JSON 例 / CHANGELOG Notes / verify-d.txt のサンプルを camelCase で統一
- §3.4 内 `meta` / `type` / `quota_project_id` / `client_id` は **JSON 出力でも camelCase** にする(snake_case 混在を排除)

「Planner 推奨」と書きつつ user 確認を待つのは責任移譲。Planner の役割で決め切るべき。

### I3. **`DoctorEnv` 型の拡張が未定義**(§ 3.2 step 4 / § 3.2 コード例)

`resolveAdcSource(env: DoctorEnv, ...)` は内部で `env.K_SERVICE` / `env.GAE_APPLICATION` / `env.KUBERNETES_SERVICE_HOST` / `env.CLOUD_BUILD_BUILDID` を参照している(§ 3.2 step 4)が、現行 `DoctorEnv` 型(`src/doctor.ts` line 10-16)はこれらを持たない。同じ箇所のコード例 line 413 では `process.env.CLOUDSDK_CONFIG` を直読みしており、テスト時の env 注入を不可能にしている(deps 注入の方針と矛盾)。

**修正要件**:
- `DoctorEnv` に以下 5 つの key を **optional string** で追加することを明示:
  - `K_SERVICE` / `GAE_APPLICATION` / `KUBERNETES_SERVICE_HOST` / `CLOUD_BUILD_BUILDID` / `CLOUDSDK_CONFIG`
- § 3.2 のコード例 line 413 を `env.CLOUDSDK_CONFIG` に直す(`process.env` 直読みを削除)
- `cli.ts` 側で `process.env` から `DoctorEnv` を組み立てるときの読み取りロジックも明示(現行の 4 つに 5 つ追加 = 9 key)
- これにより既存テスト 30 本も互換維持(optional プロパティの追加は破壊的でない)

### I4. **`gcloudActiveAccountFetcher` の "throw vs undefined" 区別ロジックが既存 `runGcloud` の挙動と矛盾**(§ 3.2 step 8 / Step 7)

plan は「**throw された場合** `accountError = 'gcloud not available'`、**undefined を返した場合** `accountError = 'gcloud returned empty'`」と区別する設計だが、既存 `runGcloud` (`src/doctor.ts` line 344-355) は **gcloud 不在時も空 stdout 時も両方 `undefined`**(`execFile` callback 内で `resolve(undefined)`)。throw しないので「gcloud not available」は発火しえない。

**修正要件**: 以下のいずれかで決め直す:
- (a) `defaultGcloudActiveAccountFetcher` を**新規実装**して `err.code === 'ENOENT'` / `err.code === 'ETIMEDOUT'` / その他 を区別し、不在系では throw する(or `accountError` を直接戻す)。`runGcloud` は触らない
- (b) 区別を諦め、`account === undefined` のときは `accountError = 'gcloud unavailable or no active account'` で一本化(現実的)
- どちらでも良いが **plan で確定**し、対応する unit test ケース(§ Step 2 test 11)も書き直す

### I5. **`meta === null` 時の text renderer の挙動が未定義**(§ 3.4)

§ 3.4 のサンプルは `type` / `quota_project_id` / `client_id` を**常に出している**が、`meta === null`(ADC ファイル不在 / JSON parse 失敗 / metadata-server 経路)になるケースが多数あるはず。その場合これらの行を **省略するのか / `(unknown)` で埋めるのか / `(unable to read ADC file)` のような単一行を出すのか** が決まっていない。

**修正要件**: § 3.4 に「`meta === null` の場合のサンプル出力」を 1 ブロック追加し、決定方針を明示。Planner 推奨は「3 行(type / quota_project_id / client_id)を省略し、代わりに `meta:  (not available — file unreadable or not parsed)` を 1 行出す」。

## Recommendations

### R-rec-1. § 3.3 で「snake_case 混在」を完全に排除する文言に直す

I2 を採用する場合、§ 3.3 の JSON 例は現状 `env_credentials` / `default_location` / `metadata_server` / `env_heuristic` / `quota_project_id` / `client_id` / `client_email` / `account_error` など **snake_case 混在**になっている。すべて camelCase に書き直して、既存 schema スタイル(`gcpEnv.GOOGLE_CLOUD_PROJECT` 等の env-var 名はもちろん大文字維持)と整合させる。

### R-rec-2. § 5.5 の secret leak テストで「実際に `private_key` を含む ADC stub を `readJsonAsync` から返す」ことを明示

「ADC JSON stub に意図的に `private_key: '-----BEGIN ...'` を仕込んでも上記が triggered しないことを確認」と書かれているが、test step 名と `readJsonAsync` の戻り値スタブを明示すると Implementer の取りこぼしを防げる。例:

```ts
const stubReadJson = async () => ({
  type: 'service_account',
  client_email: 'sa@x.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nLEAK_CANARY_DO_NOT_SERIALIZE\n-----END PRIVATE KEY-----',
  private_key_id: 'LEAK_CANARY_KEY_ID',
  refresh_token: 'LEAK_CANARY_REFRESH',
});
// then assert json output contains none of LEAK_CANARY_*
```

`LEAK_CANARY_*` 文字列を assert.doesNotMatch で個別に検査すると、regex の取りこぼし(例: 全角ハイフンの混入や line break の差異)も検出できる。

### R-rec-3. § 3.2 の `fileInfo()` heller 関数のシグネチャと「directory のとき exists=false」の挙動を §3.2 内に明文化

R4 で言及はあるが、`fileInfo(path, statAsync)` の return 仕様(`stat 結果が isFile() === false なら exists: false`)を § 3.2 のインタフェース節に明記したほうが、`AdcSourceFileInfo.exists` が「**ファイルとして** 存在する」を意味するという契約が Implementer / 将来の reader に伝わる。

### R-rec-4. `--probe-metadata-server` を envHeuristic === 'none' のときも probe するか?

§ 3.2 step 7 では `opts.probeMetadataServer === true` であれば envHeuristic に関係なく probe する設計。これは「Cloud Run でない環境からのデバッグ probe」も許す方針で OK だが、その意図を § 3.2 step 7 のコメントに 1 行入れておくと Implementer の解釈ブレを防げる(タスク文では「heuristic 一致時の probe」とも読める)。

### R-rec-5. `defaultGcloudActiveAccountFetcher` の filter

`gcloud auth list --filter='status:ACTIVE' --format='value(account)'` は **複数ヒットする可能性**がある(複数 account が ACTIVE になることはほぼ無いが、`gcloud config configurations` を弄ると起こりうる)。Implementer は最初の 1 行だけ採るか、明示的に最初の 1 行に絞ることを decide すべき。`runGcloud` は trim しか行わないので、改行を含む文字列が返る可能性に注意。§ Step 7 に 1 行注記推奨。

### R-rec-6. `MINIMAL_ADC_SOURCE_STUB` の `accountError` が誤誘導

§ 5.6 の stub に `accountError: 'gcloud not available'` を入れているが、既存 30 テストの大多数は account 解決を検証していないので、stub は `accountError` を omit したほうが「不要なノイズ」を減らせる。Planner 推奨は `{ resolved: 'unknown', envCredentials: null, defaultLocation: { path: '/fake/default', exists: false }, metadataServer: { envHeuristic: 'none', probed: false }, meta: null }` のみ。

### R-rec-7. `CREDS_FILE_MISSING` の deprecation roadmap を CHANGELOG に書く

§ Step 10 / R11 で言及済みだが、「v1.0 で `CREDS_FILE_MISSING` を deprecate」と書く前提で **新規 `ADC_FILE_MISSING` の message に `(deprecated alias: CREDS_FILE_MISSING)` のような hint を含めるかどうか** の方針も Notes に書いておくと、JSON consumer が早期に migration を始められる。Planner として推奨はするが必須ではない。

## Risk Assessment

- **secret leak risk**: **低**。設計レベルで「新オブジェクトに詰め替える」+ 「regex 検査」+ 「サイズ上限」の三重防御が組まれている (§ 3.2 末尾、§ 5.5、R3)。R-rec-2 の改善でさらに堅牢化できるが、現状の設計で構造的に secret は出ない。
- **backward compat risk**: **中**。schema 名 (`nanobanana-adc-doctor/v1`) を維持し、既存フィールドを一切 rename しない方針は健全。ただし I3 (`DoctorEnv` 拡張) を直さないと既存 30 テストの `baseOpts` 構築コードが TypeScript level でコケる可能性がある。I3 修正で解消。`CREDS_FILE_MISSING` 温存により duplicate emission する点は CHANGELOG Notes 必須。
- **test coverage risk**: **低〜中**。unit test の網羅性(13 ケース for `resolveAdcSource`、6 for warnings、5 for 統合)は十分。ただし I5 が未確定だと renderer のテスト(§ Step 5)で「meta=null 時に何を assert するか」が決まらず、`assert.match(text, /ADC source/)` という緩い検査だけになる懸念。I5 修正で解消。
- **env edge case risk**: **中**。Windows path / `CLOUDSDK_CONFIG` 優先 / metadata server heuristic / directory 誤指定 / 巨大 JSON / malformed JSON / gcloud 不在 — の代表的 edge は § 7 で 15 件カバー済み。ただし I3 (`DoctorEnv` 型に env vars を追加していない) と I4 (`gcloud` の挙動誤解) が未修正だと「env injection したのに `process.env` を直読みしてテスト失敗」「`gcloud` 不在テストで分岐が入らない」等の手戻りが発生する。修正で解消。

## Sign-off

- [x] 全 11 受け入れ基準が計画でカバーされている(ただし I1 の plugin.json 誤認 / I2 の naming 未確定が残っているため、文面上のカバーであり実装可能ではない)
- [x] secret leak の防御が設計に組み込まれている(parseAdcMeta の詰め替え + regex 検査 + サイズ上限の三重)
- [ ] **Implementer が plan.md だけで実装着手できる**(I1〜I5 のいずれかが未解決のため、現状は不可。修正後に再 sign-off 推奨)
