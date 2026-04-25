# T16 design-review.md — v0.6.0 doctor の CLOUDSDK_CONFIG 対応 plan レビュー

- Reviewer: Design Reviewer Agent (cmux-team)
- Plan: `runs/task-016-1777152365/plan.md`
- Task spec: `tasks/016-t16-v0-6-0-doctor-cloudsdk-config-adc/task.md`
- Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-016-1777152365`
- Base commit: `7d29ac8` (T15 / v0.5.0)

---

## 1. 判定

**Changes Requested**

## 2. 判定理由

設計の幹（案 a 採用、JSON schema additive、TDD 順序、secrets masking 維持）は十分に妥当で、9 つの受け入れ基準もほぼ網羅されている。ただし (a) 受け入れ基準 §4 のテキスト例に `resolved: effective-default` と書かれているのに plan の §6.3 例は `resolved: default` のままで、JSON kind と text 表示の対応関係を plan が明示的に裁定していない、(b) 受け入れ基準 §6 第 4 ケース「`GAC set + CLOUDSDK_CONFIG set` で env が勝ちつつ `CLOUDSDK_CONFIG_OVERRIDE` warning も発火」を直接 assert するテストが §7 に存在しない、(c) plan §9 が `.claude-plugin/plugin.json` に top-level `version` フィールドが無い前提で書かれているが実際には L3 に存在するので CI 同期の手順記述が事実とずれている、の 3 点が実装段階で具体的に詰まる原因になり得るため、軽微な修正を入れてから着手するのが安全。

---

## 3. 強み

1. **案 a を選ぶ根拠が定量的で論理的**。「v0.5 consumer の現実の分岐は `kind === 'default'` がほぼ全部、`'cloudsdk-config'` 分岐は実質誰も書いていない」「kind 集合のエントロピーを下げる」「`external_account` の同等概念が将来出ても kind を増やさずに済む」と将来拡張までスコープしており、summary.md に貼る決定根拠としてそのまま使える完成度。
2. **JSON schema が完全 additive**。`schema: nanobanana-adc-doctor/v1` を維持しつつ `effectiveDefault` 追加 + `defaultLocation` を alias 化 + `cloudsdkConfig` を omit、という 3 段の互換戦略を明示的にトレードオフ表（§4.1, §4.2）で示しており、v1 schema の同一性を主張する根拠が読み手に伝わる。
3. **TDD 順序が厳密**。§10 で「テスト #70–#84 をすべて先に追加して RED 確認 → 型 → resolveAdcSource 実装 → resolveGcloudConfigDir → warning → renderer → leak canary 拡張 → version → docs」と段階を切っており、各 step で何が GREEN になるべきかが一対一に紐づいている。
4. **secrets masking / leak canary を §12 で独立に明示**。`gcloudConfigDir.presence` がファイル**内容**を読まず stat だけで作る制約、`readDirCount` がファイル**名**を破棄して件数だけ保存する設計、`gcloudConfigDir.resolved` のパス自体が canary パターンと衝突しないことの assert、まで 6 項目に分けて保証している。T15 の `parseAdcMeta` を変更しないことも明記。
5. **exit 0 不変条件の網羅**。CLOUDSDK_CONFIG dir 不在 / EACCES / `homeDir()` 空文字 / gcloud not in PATH の各エッジケースについて「exit 0 で扱う」と §3.4・§11 で明示しており、`classify` の規約表（§3.3）も stat 結果と kind=file/dir の組み合わせを網羅している。

---

## 4. 指摘事項 (Recommendations)

### Must fix

#### M1. テキスト出力の `resolved:` 表示文字列が受け入れ基準 §4 と不一致

タスク §4 の text 出力例は

```
ADC source
  resolved:                       effective-default   (env GOOGLE_APPLICATION_CREDENTIALS unset)
```

と `resolved: effective-default` を要求しているが、plan §6.3 の after 例は

```
ADC source
  resolved:                         default   (env GOOGLE_APPLICATION_CREDENTIALS unset)
```

と `default` のままで、§4 と矛盾している。これは案 a を採用したことの自然な帰結（JSON kind は `default` 固定）だが、plan は「テキスト表示でも `default` のまま」を明示的に裁定していない（§6.3 末尾も「任意、テスト 60 と矛盾しない範囲で」と曖昧）。

選択肢:

- **A**. JSON kind と text 表示を一致させる（両方 `default`）。タスク §4 の例とは異なる表示になるが案 a の趣旨に最も忠実。README migration note にこの差分を明記し、CHANGELOG `Changed` で text 表示も `default` に統一したと書く。
- **B**. text renderer のみ kind を `effective-default` と表示（`{default: 'effective-default', env: 'env', ...}` のマッピング）。タスク §4 の例にそのまま追従できるが、JSON consumer と text 読者が違う語彙を見ることになる。
- **C**. text 表示は kind に英文の補足を付け足す（例: `resolved: default (effective default)`）。妥協案。

どれを採るにせよ plan に裁定文と理由、さらにそれを assert する追加テストを 1 ケース足してほしい（現状の test #83 は `resolved` 行の文字列を assert していない）。

#### M2. 「GAC + CLOUDSDK_CONFIG 同時 set」での `CLOUDSDK_CONFIG_OVERRIDE` 発火を assert するテストが無い

タスク §6 第 4 ケース:

> `GOOGLE_APPLICATION_CREDENTIALS` set + `CLOUDSDK_CONFIG` set → env が勝つ（resolved=`env`）。`CLOUDSDK_CONFIG_OVERRIDE` warning は引き続き発火

plan の対応:

- 解決ロジック（resolveAdcSource）側の env 勝利は **#73** で assert 済み。
- しかし「`CLOUDSDK_CONFIG_OVERRIDE` warning が同時発火する」ことを assert するテストが無い。
  - **#79** は `env={CLOUDSDK_CONFIG:'/cs', GEMINI_API_KEY:GOOD_KEY}` で warning 発火を見るが、GAC set パスではない。
  - **#73** は warning 配列を見ない。

`computeWarnings` の実装を `warnCloudsdkConfigOverride` を fns 末尾に追加するだけ、と plan §5 で書いてあるので発火する**はず**だが、これが回帰しないことをテストで保証するのが安全。

**追加テスト #79b 案**:

```ts
test('79b. GAC set + CLOUDSDK_CONFIG set → resolved=env AND CLOUDSDK_CONFIG_OVERRIDE warning fires', async () => {
  const report = await buildDoctorReport({
    env: { GOOGLE_APPLICATION_CREDENTIALS: '/env/sa.json', CLOUDSDK_CONFIG: '/cs', GOOGLE_CLOUD_LOCATION: 'global' },
    adcSourceResolver: async () => adcSourceStub({ resolved: 'env', envCredentials: { path: '/env/sa.json', exists: true, size: 200 } }),
  });
  expect(report.adcSource.resolved).toBe('env');
  expect(report.warnings.map(w => w.code)).toContain('CLOUDSDK_CONFIG_OVERRIDE');
});
```

#### M3. plan §9 の `.claude-plugin/plugin.json` に関する記述が事実と不一致

plan §9 の表は

> `.claude-plugin/plugin.json` | (`version` フィールド — top level に無ければ追加せず、現状の構造を尊重) | — | `marketplace.json` の plugins[].version と一致させる

と書かれており、plan §11 のリスク表にも「現ファイルに version フィールドが無い」と書かれているが、**実際には `.claude-plugin/plugin.json` L3 に `"version": "0.5.0"` が存在し**、CI の `validate-plugin` ジョブ（`.github/workflows/ci.yml` L40〜L65）は `require('./.claude-plugin/plugin.json').version` で値を取り、package.json と等しくないと exit 1 で失敗する。

plan を以下に書き換えること:

| ファイル | 行 | 現在値 | 変更後 |
|---|---|---|---|
| `package.json` | L3 `"version": "0.5.0"` | `0.5.0` | `0.6.0` |
| `.claude-plugin/plugin.json` | L3 `"version": "0.5.0"` | `0.5.0` | `0.6.0` |
| `.claude-plugin/marketplace.json` | L15 `"version": "0.5.0"` | `0.5.0` | `0.6.0` |
| `src/cli.ts` | L19 `const CLI_VERSION = '0.5.0';` / L24 `.version('0.5.0');` | `0.5.0` | 両方 `0.6.0` |

合わせて §11 リスク表からも該当行を削除（または「version フィールドが既に存在しているので 4 箇所一括更新で確実に同期、grep で漏れチェック」と書き換え）。CI の grep ルール（`.version('...')` のみが厳密チェック対象、`CLI_VERSION` は厳密チェック外だが行 L119 の `version: CLI_VERSION` 経由で実 CLI 表示に効く）も注記しておくと実装者が迷わない。

### Nice to have

#### N1. `defaultLocation === effectiveDefault` の同値性を test で固定

plan §2.1 / §4.2 で「v0.6.x では `defaultLocation === effectiveDefault` （同一値）」と仕様化しているが、`adcSourceStub` 経由で別オブジェクトを差し込めるテストヘルパ仕様（§7.6 の case ed = overrides.effectiveDefault ?? overrides.defaultLocation ...）からも分かるように、リファクタの過程で 2 つが分岐する可能性が残る。

`buildDoctorReport` 出力に対する 1 行 assert を追加することを推奨:

```ts
test('85. JSON output: adcSource.defaultLocation deep-equals adcSource.effectiveDefault (alias contract)', async () => {
  const report = await buildDoctorReport({ ... });
  expect(report.adcSource.defaultLocation).toEqual(report.adcSource.effectiveDefault);
});
```

#### N2. presence の JSON camelCase ↔ text 表示文字列のマッピング表を §6 に明記

§6.2 の text 例から類推できるが、JSON 側の camelCase キー（`activeConfig`, `configurations`, `credentialsDb`, `accessTokensDb`, `applicationDefaultCredentialsJson`, `legacyCredentials`）と text 側の表示ラベル（`active_config:`, `configurations/:`, `credentials.db:`, `access_tokens.db:`, `application_default_credentials.json:`, `legacy_credentials/:`）を 6 行の対応表で明示すると、レンダラ実装の取り違えを防げる。特に `applicationDefaultCredentialsJson` → `application_default_credentials.json` は変換ミスが起きやすい。

#### N3. v0.5 consumer 向け migration note に「`'cloudsdk-config'` 分岐」具体例を追記

plan §11 リスク表で「`cloudsdkConfig` JSON フィールドを omit したことで JSON consumer が `obj.cloudsdkConfig.path` で `TypeError`」を挙げているが、もう一つの consumer ミューテーション「`if (kind === 'cloudsdk-config') readPath(report.adcSource.cloudsdkConfig.path)` という分岐が黙って到達しなくなる」も README migration note に明示しておくと安全:

> v0.5 で `adcSource.resolved === 'cloudsdk-config'` 分岐を書いていた consumer は、v0.6 でその分岐に到達しません。effective default が CLOUDSDK_CONFIG override を吸収する仕様変更により `'default'` 分岐に流れます。`cloudsdkConfig.path` を直接読んでいた場合は `effectiveDefault.path`（互換 alias `defaultLocation.path`）に切り替えてください。

これは plan §4.3 の README migration note に 1 段落追加するだけで足りる。

#### N4. ADC_FILE_MISSING の発火条件を裁定文として明記

タスク §5 第 2 ブレット「既存の `ADC_FILE_MISSING` などが effective default のパス missing でも引き続き正しく発火すること」と §6 第 2 ケース「resolved=`unknown` or `effective-default with missing file`、`ADC_FILE_MISSING` 系の warning が出るかは仕様判断」が見かけ上ややねじれている。plan §5.2 は「effective default 自体が missing のときに新 warning は導入しない / 既存の `ADC_FILE_MISSING` は GAC が指す path 不在のときだけ発火（不変）」と裁定しており、これは合理的だが裁定根拠（Cloud Run などで誤発火を避ける）を summary.md に明記し、必要なら follow-up タスク `EFFECTIVE_DEFAULT_MISSING (info)` の起票判断を T16 close 時に conductor へ申し送る、と plan に書いておくと曖昧さが残らない。

#### N5. README 例で「note 行の改行幅」を確認

plan §6.2 の note 例:

```
  note:                             overrides $HOME/.config/gcloud entirely; gcloud auth / configurations / ADC are isolated from the OS default
```

`KV_WIDTH=34` で 1 行に伸びると CHANGELOG / README の 80 字制約に引っかかる可能性がある。実装時に幅を超えるなら `kv` ヘルパが折り返す挙動を確認するか、message を 2 段（短い文 + 詳細）に分割するかを決めておくと、テスト #82 (`text.match(/note:.*overrides/)`) と整合する。

---

## 5. 想定リスク（実装段階で詰まりそうなポイント）

1. **テキスト renderer での `resolved:` 表示判断（M1 と連動）**: 案 a 採用時に「JSON では `default` だが text では `effective-default` と書く」マッピングを入れるなら、後から JSON consumer / text 読者の語彙差で混乱の種になる。M1 の選択肢 A（両方 `default`）を選ぶのが最もメンテしやすいが、タスク §4 の例から離れる旨を README/CHANGELOG で明文化する必要がある。レビューで一度方針を確定させてから実装したほうが、後出しでテキスト変更が発生するより安い。
2. **`defaultStatAsync` の戻り値拡張**: plan §3.2 / §10 step 4 で「`defaultStatAsync` を `isDirectory` 情報を返すよう `fsStat` から拡張」と書かれているが、既存 doctor.ts の `defaultStatAsync` シグネチャ（現状は `{ size, mtimeMs }` を返している想定）を変えると、既存テスト #37–#51 の `statAsync` モックを全部直す必要が出る。`AdcSourceFileInfo` には `isDirectory` を入れず、`resolveGcloudConfigDir` 専用の `dirStatAsync` を新設するか、または `defaultStatAsync` の戻り値を optional `isDirectory?` を増やす形（既存テスト互換）にするか、で工数が大きく変わる。実装着手前に確認するとよい。
3. **`readDirCount` を `fs.promises.readdir` で実装するときのファイル名メモリ取り扱い**: plan §12 で「ファイル名そのものは破棄」と書かれているが、`readdir(path).length` を取った直後に変数スコープから外れることを test （特に #84 の leak canary）でどう assert するかは抽象的になる。読み取った配列を即時破棄する（`(await readdir(p)).length`）形で書く方針を §10 step 4 に書き加えると、レビュー時に「ファイル名がメモリ常駐していないか」の判断が容易。
4. **`gcloudConfigDir.resolved` が secret じゃないけど LEAK_CANARY パターンと衝突する可能性**: 例えば `CLOUDSDK_CONFIG=/tmp/refresh_token-test/` のように偶然 LEAK_CANARY 一致の文字列が含まれるとテストが偽陽性で落ちる。テスト #84 の assert は「value 内の `private_key` / `refresh_token` / `private_key_id` 文字列が存在しないこと」を見るタイプなので、この path だけは assert から除外する仕様にするか（plan §12 case 3 でほのめかしているが具体テストコードの除外方法を明示すると実装者が迷わない）、テスト用パスを secret-key と無関係な文字に固定するか、plan で先に決めておくとよい。
5. **`presence.configurations.entries` の 0 件と missing の差**: dir が空の `configurations/` のとき `entries: 0` を出す設計（plan §3.3）だが、`renderGcloudPresenceLine` の三項分岐は `state==='exists' && entries !== undefined` なので `0 entries` と表示される。これは仕様上問題ないが、`exists (0 entries)` という表示はユーザに「壊れている」印象を与える可能性がある。テスト #75 でも触れず、edge case として後出しで「空 dir は `entries` を出さない」に変更する判断が出るかもしれない。仕様を 1 行 plan に固定しておくと安全。
6. **CHANGELOG `[0.6.0]` 日付の置換**: plan §8.3 の draft では `2026-04-2X` プレースホルダになっている。task.md には close 日が無いので、conductor merge 時に `git log -1 --format=%cI` などで決め打ちするか、`/release` 起動時にスクリプトが置換するかを決めておかないと CHANGELOG の日付欠落リスクがある。本タスクのスコープ外（リリース）に踏み込まないまま `2026-04-2X` をそのまま CHANGELOG に commit するのは後工程のタスクで再修正が必要になる。
7. **`AdcSourceReport.effectiveDefault` を required にしたことの型影響**: plan §2.1 で `effectiveDefault: AdcSourceFileInfo` (required) と決めている。`adcSourceStub` ヘルパの修正（§7.6）は提示されているが、`adcSourceResolver` をテスト外から差し替えている箇所（公開 API の利用者が居るか）は src 内では `buildDoctorReport` 経由のみなので影響限定的。それでも TypeScript の `--noImplicitAny` や `--strict` 設定下で漏れた箇所が出ないかは `npm run typecheck` で必ず確認すること。

---

## 6. スコープ確認

plan は以下のスコープ外項目に侵食していない（OK）:

- gcloud configurations の個別列挙（plan §3.1 で `entries: number` のみ、name は出さない）
- `credentials.db` / `access_tokens.db` の deep parse（plan §3.1 / §12 で stat のみ）
- `/release` 作業（plan §0 / §10 step 14 で merge or PR まで、tag push せず）
- `effective quota` / `GOOGLE_CLOUD_QUOTA_PROJECT` 拡張（plan §5.2 の `ADC_QUOTA_PROJECT_MISMATCH` は不変、新 warning も追加せず）

---

## 7. レビュー結論

Must fix 3 件（M1: text 表示 `resolved` 文字列の裁定、M2: GAC+CLOUDSDK_CONFIG 同時 set warning テスト追加、M3: plugin.json version フィールド既存の事実反映）を plan に反映してから実装着手するのを推奨。Nice to have 5 件は実装中の判断で取り込むか follow-up に回すかを conductor 判断で構わない。secrets masking / leak canary の保証戦略、TDD 順序、JSON schema 互換戦略は十分な強度で書かれており、これらの修正後に再レビュー不要で Approve 相当。
