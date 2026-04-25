# Inspection Report: T15 v0.5.0 doctor ADC source

Inspector: 別セッション (このタスク用 inspector agent)
Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-015-1777147332`
Branch:   `task-015-1777147332/task`
Date:     2026-04-26

## Verdict

**GO**

理由: 受け入れ基準 11 項目すべて達成、`tsc --noEmit` 0 エラー、`bun test` 105/105
pass、secret leak は `parseAdcMeta` の新オブジェクト詰め替え + LEAK_CANARY 多軸 assert
(test 62) で構造的に阻止されている、version 4 箇所 sync、設計原則すべて整合。

## Test results

### tsc

```
$ bunx tsc --noEmit
(no output)
```

exit_code: 0

### bun test

```
$ bun test
bun test v1.3.12 (700fc117)

src/doctor.test.ts:
[auth] using: api-key
[auth] using: api-key

 105 pass
 0 fail
Ran 105 tests across 3 files. [657.00ms]
```

exit_code: 0
total: 105
pass: 105
fail: 0

(内訳: doctor.test.ts 67 件 + generate.test.ts + png.test.ts。T14 既存 30 件は無修正で
全 pass、新規 T15 関連テストは `parseAdcMeta` 7 / `resolveAdcSource` 15 / 新 warning 6 /
`buildDoctorReport` 統合 + LEAK_CANARY 5 / renderer 3 / gcloud account fetcher 2 等。)

## 受け入れ基準達成状況

| # | 項目 | 状態 | 備考 |
|---|------|------|------|
| 1 | `resolveAdcSource()` 追加・5 resolved 値 (env / default / cloudsdk-config / metadata-server / unknown) | ✅ | `src/doctor.ts:534`、優先順位 env > cloudsdk-config > default > metadata-server > unknown が `:577-585` に実装。test 37〜43、51 が網羅 |
| 2 | metadata server heuristic + `--probe-metadata-server` opt-in | ✅ | env heuristic は `:567-575` (K_SERVICE / GAE_APPLICATION / KUBERNETES_SERVICE_HOST / CLOUD_BUILD_BUILDID)。flag は `cli.ts:96-99` で `false` default。test 41/42/44/45/51 |
| 3 | ADC JSON meta 抽出 (type / quotaProjectId / clientId / clientEmail) | ✅ | `parseAdcMeta` (`:417-440`) が新オブジェクトに詰め替え。`private_key` / `refresh_token` / `private_key_id` は touch しない。test 31〜36b、62 |
| 4 | account resolution (gcloud auth list、unavailable 時 `'gcloud unavailable or no active account'`) | ✅ | `defaultGcloudActiveAccountFetcher` (`:522-532`) が `--filter=status:ACTIVE --format=value(account)` を呼ぶ。最初の 1 行のみ採用 (R-rec-5)。throw / undefined 両経路で `accountError` 一本化 (`:623-632`)。test 46/47/47b、64/65 |
| 5 | 新 warning 3 種 | ✅ | `warnAdcQuotaProjectMismatch` / `warnAdcFileMissing` / `warnAdcTypeUnusual` (`:356-393`)、`computeWarnings` 末尾に append (`:396-407`)。test 52〜57 |
| 6 | JSON schema に `adcSource` 追加・後方互換 | ✅ | schema 名 `nanobanana-adc-doctor/v1` 維持 (`:149`、`:784`)。`adcSource` は `DoctorReport` トップレベルに additive 追加 (`:182`)。既存 `cli` / `authRoute` / `apiKey` / `adc` / `gcpEnv` / `model` / `warnings` / `fatal` / `verbose` 一切 rename / 削除なし。test 23、59 |
| 7 | テスト網羅 (Step 2/3/4/5/6/7/8) | ✅ | 各 step に対応する unit test を確認。Step 2: 37〜51 (15 ケース)。Step 3: 52〜57。Step 4: 58〜62。Step 5: 60、63〜64。Step 6: 61。Step 7: 66〜67。Step 8 (network) は deps stub 経由で間接検証 (実コードは `defaultMetadataServerProbe` を網経由で呼ばないことを規約化) |
| 8 | masking / privacy (`private_key` / `refresh_token` / `private_key_id` 絶対不出) | ✅ | `parseAdcMeta` が新オブジェクト詰め替え (構造的防御)。test 62 (LEAK_CANARY) が JSON / text 両 renderer 上で `verbose: true` の状況下で `"private_key"` / `"private_key_id"` / `"refresh_token"` の各キー名・値 (`LEAK_CANARY_*`)・PEM ヘッダの 9 軸を assert。`grep -nE 'private_key\|refresh_token\|private_key_id' src/doctor.ts` で出るのはコメント 1 行のみ |
| 9 | README / README.ja / CHANGELOG 更新 | ✅ | README.md `:153` から `ADC source` セクション例 / 新 warning 表 / `--probe-metadata-server` / `jq .adcSource` 例。README.ja.md 同等。CHANGELOG.md `:6` から `[0.5.0]` Added / Changed / Notes (deprecation roadmap、camelCase 統一、Out of scope 明記) |
| 10 | version 4 箇所 sync | ✅ | `package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` / `src/cli.ts` (`CLI_VERSION` + `.version()`) すべて `0.5.0`。`grep -E '"version"'` 結果も `0.5.0`。CI `validate-plugin` の 4-way 比較は手動再現でも一致 |
| 11 | 動作確認 4 パターン (a/c/d 実機、b mock) | ✅ | verify-a.txt: 実機で `ADC_QUOTA_PROJECT_MISMATCH` 単独発火を確認。verify-c.txt: `GOOGLE_APPLICATION_CREDENTIALS=/tmp/nonexistent.json` で `ADC_FILE_MISSING` + 既存 `CREDS_FILE_MISSING` 並列発火。verify-d.txt: `jq .adcSource` で camelCase 構造化 JSON。b は test 53 (`quotaProjectId === GOOGLE_CLOUD_PROJECT` で warning 出ない) で mock 代替 (タスク文許可) |

## 設計原則整合 (CLAUDE.md)

| 原則 | 状態 | 備考 |
|------|------|------|
| ADC is the primary axis | ✅ | ADC 経路は新規 `adcSource` 報告で **強化**。auth.ts は無変更 (`git diff src/auth.ts` 空)。authRoute resolve の優先順位 (`:224-255`) も変更なし |
| Fail loudly on auth ambiguity | ✅ | `auth.ts:9 / 15 / 50` の `[auth] using: ...` 出力は無変更。doctor の `Auth route` セクション (`renderDoctorText:885-887`) も継続 |
| Secret leak 構造的阻止 | ✅ | `parseAdcMeta` の "新オブジェクト詰め替え" 設計 (`:430-439`) で source object の accidental serialize リスク排除。LEAK_CANARY 多軸 assert (test 62) が CI で機械的に保証。`grep` 走査で `console.log` / `JSON.stringify(rawAdc)` / 補間文字列のいずれも該当なし |
| `src/` に Claude Code 固有 env vars (CLAUDE_PLUGIN_ROOT 等) を持ち込まない | ✅ | `grep -rE 'CLAUDE_PLUGIN_ROOT' src/` 結果空 |
| `dist/` 手編集なし | ✅ | `git status` で `dist/` 配下に modified / new file なし。`.gitignore` 通り runtime-only |
| `process.env` 直読みが doctor.ts で発生していないか (DoctorEnv 経由か) | ✅ (条件付き) | `resolveAdcSource` 本体は `env: DoctorEnv` 引数経由。`process.env` 参照は (a) `:545` `appData = (deps.appDataDir ?? (() => process.env.APPDATA))()` ← deps 注入可能で plan § 3.3 仕様通り、(b) `:680/682` `defaultAdcProbe` 内 (T14 既存・無変更)、(c) `:726` `defaultGcloudAdcFilePathFetcher` 内 (T14 既存・無変更)。新規 T15 経路のうち deps 注入が効かない直読みは存在しない |

## 後方互換

| 観点 | 状態 | 備考 |
|------|------|------|
| T14 既存 30 テストが pass | ✅ | `baseOpts` (test:34) に `adcSourceResolver: async () => MINIMAL_ADC_SOURCE_STUB` を 1 行追加するだけで test 1〜30 が無修正で green。`bun test` 全 pass で確認 |
| 既存 JSON フィールド (`gcpEnv` / `authRoute` / `apiKey` / `adc` / `cli` / `model` / `warnings` / `fatal` / `verbose`) が renamed されていない | ✅ | `DoctorReport` interface (`:148-193`) を確認、すべて従来通り。`adcSource` は **追加のみ** |
| schema 名 `nanobanana-adc-doctor/v1` 維持 | ✅ | `:149` 型・`:784` 値とも `'nanobanana-adc-doctor/v1'` |
| 既存 7 warning が温存 (`CREDS_FILE_MISSING` 含む) | ✅ | `DoctorWarningCode` (`:130-140`) に既存 7 種すべて存在。`warnCredsFileMissing` (`:323-332`) も無変更で fns 配列に残存。verify-c.txt で `CREDS_FILE_MISSING` と `ADC_FILE_MISSING` の並列発火を実機確認済 |

## 受け入れ基準 11.b の動作確認 (quota mismatch 解消後)

タスク文では実機書き換えを optional とし mock test 代替を明示的に許可している。
Implementer は test 53 (`53. ADC_QUOTA_PROJECT_MISMATCH does NOT fire when
quotaProjectId === GOOGLE_CLOUD_PROJECT`) で mock 代替を採用しており、`verify.txt`
にもその旨明記済み。verify.txt の 53 番テスト引用は実装と一致。受諾。

## Critical findings

なし。NOGO 要件はすべてクリア。

## Minor findings (Recommendation のみ、GO を阻害しない)

1. **`package-lock.json` の本体 version が `0.4.0` のまま** (`grep '"version":' package-lock.json`)。`package.json` 0.5.0 との乖離。`npm ci --dry-run` および `npm ci` 実機実行で exit 0 を確認済みなので CI は通るが、見栄えとして `npm install` の再実行で `package-lock.json` を `0.5.0` に同期するのが望ましい。リリース直前に Conductor 側で `npm install` を 1 回叩けば自動同期されるレベルの軽微案件。

2. **`renderDoctorText` の `cloudsdkConfig` 分岐に冗長 else-if** (`src/doctor.ts:955-959`)。`cloudsdkConfig === undefined` と `=== null` のどちらも同じ `(unset)` 出力なので、`if (!a.cloudsdkConfig)` 1 本に折りたたみ可能。挙動は正しく、テスト全 pass。リファクタ案件で本 PR スコープ外。

3. **plan.md § 3.2 の "9 key" 表記は実際には 10 key**。実装は 5 既存 + 5 新規 = 10 key で正しい。これは plan の typo であり、実装側に問題なし (Implementer は正しく 10 key で `cli.ts:104-115` を組み立てている)。

4. **plan.md の verify-d 例 `jq -e '.adcSource.resolved | inside([...])'` は jq セマンティクスとずれる**。`inside` は container/element 関係なので scalar string と array の比較で型エラー (exit 5) になる。Implementer は `[.adcSource.resolved] | inside(...)` および `.adcSource.resolved | IN(...)` の 2 経路で代替実証 (verify-d.txt) しており妥当な対応。SoT 修正は不要。

## Sign-off

- [x] 全 11 受け入れ基準達成
- [x] tsc が新規エラー 0 (`bunx tsc --noEmit` exit 0)
- [x] bun test が全 pass (105 / 105)
- [x] secret leak がコード上で構造的に阻止されている (parseAdcMeta 新オブジェクト詰め替え + LEAK_CANARY 多軸 assert)
- [x] version 4 箇所 sync (`package.json` / `plugin.json` / `marketplace.json` / `src/cli.ts` × 2 すべて `0.5.0`)
- [x] dist/ 手編集なし、Claude Code 固有 env vars 持ち込みなし、auth.ts 無変更
- [x] T14 既存テスト 30 本が破壊されていない、schema 名 `nanobanana-adc-doctor/v1` 維持

判定: **GO**
