# T15 v0.5.0 — `nanobanana-adc doctor` ADC source + quota mismatch (Implementer summary)

Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-015-1777147332`
Branch:   `task-015-1777147332/task`
Date:     2026-04-26

## 結果

- **Build**: green (`npm run build`)
- **Typecheck**: 0 エラー (`tsc --noEmit`)
- **Test**: **105 / 105 pass** (T14 既存 30 本 + T15 新規 39 本 = doctor.test.ts は計 69 件、+ generate.test.ts と png.test.ts)
- **Version**: 0.4.0 → 0.5.0 を 4 箇所同期 (`package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` / `src/cli.ts` × 2)
- **動作確認**: a / c / d は実機で green、b は test 53 で mock 代替 (verify.txt 参照)

## 変更ファイル (10 件)

| ファイル | 変更概要 |
|---|---|
| `src/doctor.ts` | `DoctorEnv` に 5 key 追加 (`K_SERVICE` / `GAE_APPLICATION` / `KUBERNETES_SERVICE_HOST` / `CLOUD_BUILD_BUILDID` / `CLOUDSDK_CONFIG`)。`AdcSourceKind` / `AdcCredentialType` / `AdcSourceFileInfo` / `AdcSourceMeta` / `AdcSourceReport` / `ResolveAdcSourceDeps` / `ResolveAdcSourceOptions` 型追加。`parseAdcMeta` / `resolveAdcSource` / `defaultGcloudActiveAccountFetcher` / `defaultMetadataServerProbe` / `defaultStatAsync` / `defaultReadJsonAsync` / `fileInfo` / 3 つの新 warning 関数 (`warnAdcQuotaProjectMismatch` / `warnAdcFileMissing` / `warnAdcTypeUnusual`) 実装。`buildDoctorReport` に `adcSourceResolver` / `probeMetadataServer` opts と `adcSource` フィールドを wire。text renderer に `ADC source` セクション追加 (`renderFileExtras` / `renderMetadataServer` helper)。`kv()` の padding 計算を改善 (key が KV_WIDTH を超える場合に最低 1 スペース確保)。 |
| `src/doctor.test.ts` | 新規 39 テスト (31〜67) 追加。`baseOpts` に `adcSourceResolver: async () => MINIMAL_ADC_SOURCE_STUB` を 1 行追加し、既存 30 テストは無修正で green。`LEAK_CANARY_*` 多軸 secret leak 検査 (キー名 / PEM ヘッダ / text renderer / positive case)。Windows / GCE / k8s / directory 誤指定 / 巨大 JSON / probe stub の throw 経路までカバー。 |
| `src/cli.ts` | `--probe-metadata-server` flag 追加。`process.env` から `DoctorEnv` を **9 key** で組み立てる (T15 追加 5 key 含む)。`CLI_VERSION` / `.version()` を `0.5.0` に。 |
| `package.json` | `0.4.0` → `0.5.0` |
| `package-lock.json` | npm が version sync で自動更新 (このコミットには直接の依存変更なし) |
| `.claude-plugin/plugin.json` | `0.4.0` → `0.5.0` |
| `.claude-plugin/marketplace.json` | `plugins[0].version` を `0.5.0` に |
| `README.md` | `## Diagnostics (doctor)` の出力例を v0.5.0 形式に。新 warning 3 種の表、`--probe-metadata-server` 追記、`jq .adcSource` 例。camelCase の説明 1 行を README にも追加 (R-v2-rec-3 吸収)。 |
| `README.ja.md` | 同上の日本語版。Warning 対訳テーブルに 3 行追加。 |
| `CHANGELOG.md` | `## [0.5.0] - 2026-04-26` セクション追加。Added / Changed / Notes (deprecation roadmap, 命名規約, secret 防御, Out of scope を明記)。 |

## TDD ステップ進行 (1〜11)

各ステップ Red → Green を遵守。実装は SoT (`plan.md`) に沿って 1 commit 単位で
進められる粒度で行ったが、Conductor の指示で **最終 1 commit 化を Implementer
判断に委ねる**ため commit はまだ作成していない (worktree 上は未 commit)。

| Step | 内容 | 状態 |
|---|---|---|
| 1 | `parseAdcMeta` (6 + 1 ケース) | ✅ |
| 2 | `resolveAdcSource` (15 ケース) | ✅ |
| 3 | 3 新 warning (6 ケース) | ✅ |
| 4 | `buildDoctorReport` 統合 + LEAK_CANARY 多軸検査 | ✅ |
| 5 | text renderer ADC source セクション | ✅ |
| 6 | `--probe-metadata-server` flag + 9 key DoctorEnv | ✅ |
| 7 | `gcloud auth list` ベースの active account fetcher | ✅ |
| 8 | `defaultMetadataServerProbe` (実装のみ。unit test は deps stub 経由) | ✅ |
| 9 | version 4 way sync | ✅ |
| 10 | README / README.ja / CHANGELOG | ✅ |
| 11 | 動作確認 4 パターン (verify.txt) | ✅ |

## 判断ポイント

### R-v2-rec-1 — JSON における unset key の扱い: **「key omit」採用**

`cloudsdkConfig` / `accountError` / `cloudsdkConfig` などは **key 自体を出さない**
方針を採った (interface でも `?` optional)。理由:

- TypeScript interface 側の `cloudsdkConfig?: AdcSourceFileInfo | null` と整合
- JSON consumer は `obj.cloudsdkConfig === undefined` 判定の方が自然
- JSON サイズも僅かに小さくなる

CHANGELOG Notes にこの方針を 1 行明記済み。

### R-v2-rec-2 — `accountError` 文言固定の機械的保証

test 65 を追加し、`accountError` がセットされたとき `gcloud unavailable or no
active account` 文言が JSON 出力にもそのまま現れることを `assert.match(json,
/gcloud unavailable or no active account/)` で検証。

### R-v2-rec-3 — README にも camelCase 統一を 1 行明記

README.md / README.ja.md の `## Diagnostics (doctor)` セクションに「JSON output
uses camelCase keys throughout」を 1 行追加。CHANGELOG だけでなく README で
JSON consumer が混乱しないようにした。

### text renderer の `kv()` padding

実機ラン時に `env GOOGLE_APPLICATION_CREDENTIALS:` (35 chars + colon) が
`KV_WIDTH = 34` を超え、value と密着する不具合を発見したため、`kv()` の
padding 計算を「key が KV_WIDTH 以上なら +1 space」に変更。既存 24 テストの
`Warnings (\d+)` 等の regex は破壊しない (確認済み)。

### `--probe-metadata-server` のローカル smoke

ローカル環境では 169.254.169.254 へのリクエストが ENETUNREACH or
connection-refused or 5s TCP timeout のいずれかになる。実装は AbortController
で 300ms 上限。実環境 (GCE / Cloud Run) での確認はスコープ外として
verify.txt に明記。

### 実機 ADC ファイルのレース観測

verify-a の実機実行時、`gcloud auth list` 呼び出し直後に ADC ファイルが
388B → 351B → 388B と短時間振動し、瞬間的に `quota_project_id` フィールドが
消える挙動を観測した。これは gcloud CLI 側の挙動 (token refresh 周り) と
推察される。本実装は **stat → read** を 1 回しか行わない設計のため、レース
で `quota_project_id` が消えた瞬間を読むと warning が一時的に出ない可能性は
ある。原則は「次のランで安定する」。verify.txt に注記。

## 未決事項 / 後段への申し送り

1. **コミット粒度**: タスク文「commit 粒度は plan のステップに沿わせるか、
   最終 1 commit でもよい」に従い、Conductor の判断に委ねる。Implementer は
   commit を作成していない。
2. **`defaultMetadataServerProbe` の実機検証**: GCE / Cloud Run 環境での
   probe 成功 (`probeOk: true`) は、当該環境にアクセスできる reviewer が
   別途確認することを推奨 (CI / ローカル PC からは検証不可)。
3. **`CREDS_FILE_MISSING` の deprecation**: CHANGELOG Notes に v1.0 で
   廃止予定として記載。実装は v1.0 で `warnCredsFileMissing` を削除する形で
   行う想定 (今回 PR では並列発火のまま温存)。
4. **WIF / impersonation deep parse**: スコープ外 (CHANGELOG `Out of
   scope` に明記)。
5. **既存 verify.txt 内の jq コマンド**: plan.md の verify-d 例
   `jq -e '.adcSource.resolved | inside([...])'` は jq の `inside` セマンティクス
   (container/element 関係) と型不整合のためそのままでは error 5 になる。
   verify.txt では `[.adcSource.resolved] | inside([...])` および
   `.adcSource.resolved | IN([...])` の 2 種で代替実証。Implementer 判断で
   plan の jq 例自体は修正していない (SoT は変更しない方針)。

## 受け入れ基準チェックリスト

| # | 項目 | 状態 |
|---|---|---|
| 1 | `resolveAdcSource()` 関数追加、解決順序 (env / default / cloudsdk-config / metadata-server / unknown) | ✅ |
| 2 | metadata server の heuristic 検出 (env vars + `--probe-metadata-server` opt-in) | ✅ |
| 3 | ADC JSON のメタ情報抽出 (private_key / refresh_token / private_key_id を絶対に出さない) | ✅ (LEAK_CANARY 多軸 assert) |
| 4 | account resolution (gcloud auth list best-effort、unavailable 時 `accountError = 'gcloud unavailable or no active account'`) | ✅ |
| 5 | 新 warning 3 つ | ✅ (`ADC_QUOTA_PROJECT_MISMATCH` / `ADC_FILE_MISSING` / `ADC_TYPE_UNUSUAL`) |
| 6 | JSON schema 拡張 (adcSource セクション、後方互換) | ✅ (schema 名 `nanobanana-adc-doctor/v1` 維持) |
| 7 | テスト網羅 (Step 2/3/4/5/6/7/8) | ✅ (105 tests pass) |
| 8 | masking / privacy (secret 絶対出さない) | ✅ |
| 9 | README / README.ja / CHANGELOG 更新 | ✅ |
| 10 | version 同期 4 箇所 | ✅ (`pkg=0.5.0 plugin=0.5.0 market=0.5.0 cli=0.5.0`) |
| 11 | 動作確認 4 パターン (a/c/d 実機、b mock) | ✅ (verify.txt) |
