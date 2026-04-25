# T16 inspection.md — v0.6.0 doctor の CLOUDSDK_CONFIG 対応 / ADC 探索アルゴリズム正規化 検品結果

- Inspector: Inspector Agent (cmux-team)
- Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-016-1777152365`
- Branch: `task-016-1777152365/task`
- Base: `7d29ac8` (T15 / v0.5.0)
- Plan: `runs/task-016-1777152365/plan.md` (Approved per design-review-v2.md)
- Impl-log: `runs/task-016-1777152365/impl-log.md`

---

## 1. 判定

**GO**

## 2. 判定理由

タスク受け入れ基準 §1〜§9 を全て満たし、plan §1.1 の text 表記裁定 (選択肢 C) も忠実に実装されている。`bun test` 122 pass / 0 fail、`bunx tsc --noEmit` exit 0、4 パターンの動作確認 (a/b/c/d) すべて意図どおりの出力で、secrets masking の regression (#62, #84) も維持されている。Implementer は worktree 内で commit していない (Conductor が後段で commit する想定どおり)。

---

## 3. 受け入れ基準達成状況 (§1〜§9)

| § | 項目 | 結果 | 備考 |
|---|---|---|---|
| **§1** | `resolveAdcSource` アルゴリズム正規化 (case a: kind 'default' 維持) | ✅ | `src/doctor.ts:649–755` で `CLOUDSDK_CONFIG` set 時は OS default を見ず `$CLOUDSDK_CONFIG/application_default_credentials.json` のみを effective default とする。解決順序は `env` → `default` (effective) → `metadata-server` → `unknown`。`'cloudsdk-config'` kind を runtime で生成しない (型上は @deprecated で残置)。 |
| **§2** | JSON schema 後方互換 (`nanobanana-adc-doctor/v1` 維持、`cloudsdkConfig` runtime で生成しない) | ✅ | `schema: 'nanobanana-adc-doctor/v1'` 維持。`adcSource.cloudsdkConfig` は populate しない (`return` 文に含めない)。`adcSource.defaultLocation` は `effectiveDefault` の alias (同一参照) として常時出力。`adcSource.effectiveDefault` を additive で追加。 |
| **§3** | `Gcloud config dir` 独立セクション (text + JSON `gcloudConfigDir`) | ✅ | `resolveGcloudConfigDir` (`src/doctor.ts:787–857`) が新規追加。`presence` 6 項目 (`activeConfig` / `configurations` / `credentialsDb` / `accessTokensDb` / `applicationDefaultCredentialsJson` / `legacyCredentials`) を camelCase で出力。`renderDoctorText` でも独立セクション化済 (`src/doctor.ts:1173–1193`)。 |
| **§4** | ADC source 簡素化 (`effectiveDefault` 1 行に集約) | ✅ | `default location:` / `CLOUDSDK_CONFIG path:` 行は削除され、`effective default:` 1 行に統合 (`src/doctor.ts:1210–1212`)。`renderResolvedKind` で kind==='default' のときだけ `default (effective default)` と表記 (§1.1 裁定通り、選択肢 C)。 |
| **§5** | 新 warning `CLOUDSDK_CONFIG_OVERRIDE` (severity: info) | ✅ | `warnCloudsdkConfigOverride` (`src/doctor.ts:471–481`) を `computeWarnings` の `fns` 配列末尾に追加。GAC 同時 set 時も独立に発火 (test #79b で assert)。message に CLOUDSDK_CONFIG path 文字列を含む。 |
| **§6** | テスト (CLOUDSDK_CONFIG 4 ケース + leak canary regression + JSON parse) | ✅ | #70–#74 (resolveAdcSource 5 件) / #75–#78 (resolveGcloudConfigDir 4 件) / #79, #79b, #80 (warning 3 件) / #81, #82, #83, #83b (renderer/schema 4 件) / #84 (LEAK_CANARY 拡張) — 計 17 ケース追加。既存 #62 LEAK_CANARY も維持。 |
| **§7** | ドキュメント (README.md / README.ja.md / CHANGELOG `[0.6.0]` / warning 表) | ✅ | CHANGELOG `[0.6.0] - 2026-04-26` (Added/Changed/Deprecated/Notes) 完備。README × 2 とも doctor 出力例を新フォーマットに差し替え、`CLOUDSDK_CONFIG_OVERRIDE` 行を warning 表に追加、Migration from v0.5 セクションを追加。 |
| **§8** | バージョン 4 箇所同期 | ✅ | `package.json:3` / `.claude-plugin/plugin.json:3` / `.claude-plugin/marketplace.json:15` / `src/cli.ts:19, 24` すべて `0.6.0`。`grep -rn '"0\.5\.0"' --include='*.json'` 残存ゼロ確認済 (CHANGELOG の history 行のみ)。`package-lock.json` も追従更新。 |
| **§9** | 動作確認 4 パターン | ✅ | `manual-runs/a-default.txt`, `b-empty-cloudsdk.txt`, `c-kdg-cloudsdk.txt`, `d-json-extract.txt` (+ `d-json-full.txt`) すべて期待通り。c は `resolved: default (effective default)` 表記、override warning 発火。d は `gcloudConfigDir` / `adcSource` 両セクションを camelCase で確認。 |

---

## 4. テスト結果

### `bun test`

```
 122 pass
 0 fail
Ran 122 tests across 3 files. [645.00ms]
```

- 既存 105 ケース (`#1`–`#67`, `36b`, `47b` および `auth.test.ts` / `cli.test.ts` 分) は GREEN を維持
- 新規 17 ケース (#70–#84) すべて GREEN
- `#40` は v0.6 セマンティクス (`resolved='default'`, `'cloudsdk-config' kind` 廃止) に正しく書き換わっている

### `bunx tsc --noEmit`

```
exit=0
```

エラー 0。

### `git status` / `git diff --stat`

```
M .claude-plugin/marketplace.json
M .claude-plugin/plugin.json
M CHANGELOG.md
M README.ja.md
M README.md
M package-lock.json
M package.json
M src/cli.ts
M src/doctor.test.ts
M src/doctor.ts

10 files changed, 950 insertions(+), 66 deletions(-)
```

staged 変更なし、commit なし — Implementer の方針 (Conductor が後で commit) に準拠。

---

## 5. secrets masking

**漏れなし**。

確認内容:

1. `src/doctor.ts` 内で `private_key` / `refresh_token` / `private_key_id` の登場箇所は **コメント (`parseAdcMeta` 内 L525–527) のみ** 。runtime ロジックでこれらを copy / serialize / 出力する箇所は無い。
2. `parseAdcMeta` (`src/doctor.ts:506–529`) は fresh object に `type` / `quotaProjectId` / `clientId` / `clientEmail` (service_account のみ) を選択的にコピーする方針を維持。T15 で確立した安全規約に変更なし。
3. `resolveGcloudConfigDir` の `presence` は **stat 情報 + ディレクトリ件数のみ** を持ち、ファイル名や内容を保持しない (`readDirCount` は `readdir().length` のみ取得)。
4. **新規テスト #84** で `CLOUDSDK_CONFIG=/cs` + service_account JSON (private_key / private_key_id / refresh_token + LEAK_CANARY_* canary 含む) を読ませ、JSON / text / verbose のいずれにも `LEAK_CANARY_*` / `private_key` / `refresh_token` / `private_key_id` / `-----BEGIN PRIVATE KEY-----` が出ないことを assert (test 通過)。
5. **既存テスト #62** LEAK_CANARY regression は無変更で GREEN を維持。
6. **manual-runs 4 ファイル** に対して `grep -E 'private_key|refresh_token|private_key_id|-----BEGIN PRIVATE KEY-----|LEAK_CANARY'` を実行 → マッチ 0 件で確認済。

---

## 6. 追加検品観点 (§検品観点 1〜10 の補足)

### exit 0 不変条件 (検品観点 6)

`resolveGcloudConfigDir` 内の `try { s = await stat(childPath); } catch { presence[entry.key] = { state: 'unreadable' }; continue; }` (`src/doctor.ts:826–833`) で stat 例外 (EACCES など) を catch して `unreadable` に丸めるため、CLOUDSDK_CONFIG dir が unreadable でも doctor は throw しない。`defaultDirStatAsync` は ENOENT/ENOTDIR を null に変換するので missing 扱いになる。test #76 / #78 で挙動を assert 済。

### schema 互換性 (検品観点 7)

- `adcSource.envCredentials` / `defaultLocation` / `metadataServer` / `meta` / `account` / `accountError` 既存フィールド名はすべて保持。
- `effectiveDefault` を camelCase で additive 追加。
- `gcloudConfigDir` を top-level に camelCase で additive 追加。snake_case (`gcloud_config_dir`) は登場しないことを test #81 が assert。
- 既存 schema 名 `nanobanana-adc-doctor/v1` 維持。

### Plan 忠実度 (検品観点 2)

§1.1 選択肢 C (`resolved: default (effective default)`) は `renderResolvedKind` (`src/doctor.ts:1091–1096`) で `kind === 'default'` のときだけ `(effective default)` を付与する形で実装済み。test #83b が両方向 (`default` 時は括弧書きあり、`env` 時は括弧書きなし) を assert している。JSON 側の `adcSource.resolved` は plain `'default'` リテラルを維持 (case a 採用) — manual-runs/d-json-extract.txt L29 で `"resolved": "default"` を確認。

### スコープ違反 (検品観点 10)

- gcloud configurations の個別列挙: 実装に存在しない (presence の `configurations.entries` はディレクトリ件数のみ)。
- credentials.db の deep parse: 実装に存在しない (stat のみ)。
- リリース作業 (`/release 0.6.0`): 実施されていない (plan / タスクとも明示的にスコープ外)。
- effective quota 計算: 実装に存在しない。
- 触られたファイルは `src/doctor.ts` / `src/doctor.test.ts` / `src/cli.ts` / `package.json` / `package-lock.json` / `.claude-plugin/*.json` / `README.md` / `README.ja.md` / `CHANGELOG.md` の 10 ファイルのみ。`generate.ts` / `auth.ts` / `png.ts` / `bin/*` には触れていない。

### manual-runs の妥当性 (検品観点 8)

- **a (CLOUDSDK_CONFIG unset)**: `Gcloud config dir` source=`default ($HOME/.config/gcloud)`, `CLOUDSDK_CONFIG_OVERRIDE` 不発火 (Warnings 0)。実環境で `.envrc` に `GOOGLE_APPLICATION_CREDENTIALS` が set されているため `ADC source` の `resolved: env` (`effective default` は別パスとして情報表示) になっており、これは v0.6 仕様 (env が勝つ) に正合。
- **b (空 CLOUDSDK_CONFIG)**: `resolved: /tmp/empty-gcloud-dir-016`, `source: env CLOUDSDK_CONFIG`, override note 出力, `CLOUDSDK_CONFIG_OVERRIDE` (info) 発火, `application_default_credentials.json: missing` / `legacy_credentials/: missing`。impl-log の注記どおり、google-auth-library が副作用で `active_config` / `configurations/` / `credentials.db` / `access_tokens.db` を書き込むため presence=exists として観測されている — これは google-auth-library 側の挙動であり doctor 側の不具合ではない (test #76 で「dir 全 missing」のロジック自体は assert 済)。`exit 0` 維持。
- **c (KDG-lab CLOUDSDK_CONFIG)**: `resolved: /Users/yamamoto/git/KDG-lab/.config/gcloud`, `source: env CLOUDSDK_CONFIG`, `effective default` が KDG-lab 配下 (exists, 403 B), text の `resolved` 行は `default (effective default)` (§1.1 裁定通り), ADC type が KDG-lab JSON のもの, override warning 発火。期待どおり。
- **d (--json | jq)**: `gcloudConfigDir.source === "env-cloudsdk-config"`, `gcloudConfigDir.note` 出力あり, `adcSource.resolved === "default"` (JSON 側は plain literal), `effectiveDefault` 出力, `defaultLocation` が `effectiveDefault` と同値 (alias), `cloudsdkConfig` フィールド absent — タスク §4.1 / plan §4.1 の schema 差分どおり。

---

## 7. Critical findings

なし (NOGO の理由となる項目なし)。

---

## 8. Recommendations (任意 / non-blocking)

1. **summary.md 不在**: タスクの完了条件 (`conductor-prompt.md` L161) は `summary.md` の生成を要求しており、plan §10 step 12 でも 4 パターンを summary.md に貼ると記載。Implementer は impl-log.md と manual-runs/ にすべての情報を残しており、検品上の支障はないが、Conductor が後段で `summary.md` を別途生成する必要がある (本タスクでは Inspector のスコープ外)。
2. **N1 follow-up (任意)**: design-review-v2.md §4 で挙げられた「`defaultLocation === effectiveDefault` の同値性 assert」は #70 / #73 で `assert.equal(r.defaultLocation, r.effectiveDefault)` として暗黙的にカバーされている。正式な #85 の追加は v0.7 への follow-up で十分。
3. **pattern b の副作用**: `defaultAdcProbe` が google-auth-library 経由で CLOUDSDK_CONFIG dir に副作用ファイルを書き出す件 (impl-log §3 b 注、本検品 §6 b) は doctor 側の不具合ではないが、ユーザが「空 dir」を指定したときの実機挙動として README の `Migrating from v0.5` 周辺に短い注意書きを追記する選択肢はある (任意、follow-up)。
4. **docs minor**: `README.md:210` / `README.ja.md:237` で「v0.5.0 / v0.6.0 で 4 つの warning 追加」と書いてあるが、warning 表を数えると `ADC_QUOTA_PROJECT_MISMATCH` / `ADC_FILE_MISSING` / `ADC_TYPE_UNUSUAL` / `CLOUDSDK_CONFIG_OVERRIDE` の計 4 件で整合 (T15 で 3 件 + T16 で 1 件)。問題なし。

---

## 9. 総括

すべての受け入れ基準を満たし、テスト・型検査・secrets masking・exit 0 不変条件・schema 互換性のいずれも問題なし。Conductor が `summary.md` を生成し commit / merge を行う後段フェーズに進んで良い。
