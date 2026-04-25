# T16 impl-log.md — v0.6.0 doctor の CLOUDSDK_CONFIG 対応 / ADC 探索アルゴリズム正規化

- Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-016-1777152365`
- Branch: `task-016-1777152365/task`
- Base: `7d29ac8` (T15 / v0.5.0)
- Plan: `runs/task-016-1777152365/plan.md` (Approved per design-review-v2.md)

---

## 1. 変更ファイル一覧

```
 M .claude-plugin/marketplace.json   (1 行 / version 0.5.0 → 0.6.0)
 M .claude-plugin/plugin.json        (1 行 / version 0.5.0 → 0.6.0)
 M CHANGELOG.md                      (+63 行 / [0.6.0] エントリ追加)
 M README.ja.md                      (+66/-12 行 / 出力例・warning 表・migration note)
 M README.md                         (+67/-13 行 / 同上 英語版)
 M package-lock.json                 (4 行 / version 0.5.0 → 0.6.0、auto)
 M package.json                      (1 行 / version 0.5.0 → 0.6.0)
 M src/cli.ts                        (CLI_VERSION + .version() ともに 0.6.0)
 M src/doctor.test.ts                (+479 行 / 17 ケース追加 + #40 更新 + stub helper 拡張)
 M src/doctor.ts                     (+327 行 / 型・resolveAdcSource・resolveGcloudConfigDir・warning・renderer)
```

`dist/` は `.gitignore` 配下 (`tsc` で常に再生成)。`npm run build` を実行済み — `dist/cli.js` / `dist/doctor.js` は最新。

---

## 2. テスト結果

### `bun test` (全プロジェクト)

```
 122 pass
 0 fail
Ran 122 tests across 3 files. [664.00ms]
```

内訳:
- 既存 69 ケース (#1–#67, 36b, 47b) は無変更で GREEN を維持
- `#40` を v0.6 セマンティクス (`resolved='default'`, `'cloudsdk-config' kind 廃止`) に書き換え
- 17 ケース追加 (#70–#74 / #75–#78 / #79, #79b, #80 / #81, #82, #83, #83b / #84) — plan §7 のすべての項を網羅
- T15 で導入した LEAK_CANARY regression test (#62) も維持し、CLOUDSDK_CONFIG 配下に置いた service_account JSON を読ませる #84 で `private_key` / `private_key_id` / `refresh_token` / `LEAK_CANARY_*` / `-----BEGIN PRIVATE KEY-----` のいずれも JSON / text / verbose で発覚しないことを再保証

### TDD ライフサイクル

1. **Red** — `src/doctor.test.ts` に新規 17 ケース + 既存 #40 更新を入れた直後、`bun test` は `Export named 'resolveGcloudConfigDir' not found` で 1 fail 1 error。期待どおり全部 RED。
2. **型定義 → 実装 → 緑** — `AdcSourceReport.effectiveDefault` を required 化、`AdcSourceKind` の `'cloudsdk-config'` を `@deprecated`、`GcloudConfigDirReport` 系 4 型を新規追加、`DoctorReport.gcloudConfigDir` を required 化。`resolveAdcSource` を plan §2.2 の擬似コードに置換し、`resolveGcloudConfigDir` を新規追加。`warnCloudsdkConfigOverride` を `computeWarnings` の fns 末尾に追加し、`buildDoctorReport` から `gcloudConfigDirResolver` を呼び出す配線を追加。renderer は `Gcloud config dir` セクションを `ADC source` の直前に挿入し、`ADC source` から `default location:` / `CLOUDSDK_CONFIG path:` 行を削除して `effective default:` 1 行に置換。`renderResolvedKind` で `kind === 'default'` のときだけ `default (effective default)` と表示。
3. **GREEN** — 86 ケース全 pass。既存 LEAK_CANARY の挙動も無変更。

### `bunx tsc --noEmit`

```
tsc exit=0
```

エラー 0。

### `npm run build`

```
> nanobanana-adc@0.6.0 build
> tsc
```

エラー 0。`dist/cli.js`、`dist/doctor.js` (ともに 06:58 タイムスタンプ) を再生成済み。

---

## 3. 動作確認 4 パターン

`runs/task-016-1777152365/manual-runs/` 配下にファイルとして保存。

| pattern | 入力 | 出力ファイル | 結果概要 |
|---|---|---|---|
| **a** | `unset CLOUDSDK_CONFIG; nanobanana-adc doctor` | `manual-runs/a-default.txt` | `Gcloud config dir` の `source: default ($HOME/.config/gcloud)`, presence は `/Users/yamamoto/.config/gcloud` の実体を反映。`Warnings (0)`。`CLOUDSDK_CONFIG_OVERRIDE` 非発火。本環境では `GOOGLE_APPLICATION_CREDENTIALS` が `.envrc` 由来で別リポ配下に向いているため、ADC source の `resolved: env` (effective default は別パスとして表示) になっている — これは v0.6 の仕様どおりの挙動。 |
| **b** | `CLOUDSDK_CONFIG=/tmp/empty-gcloud-dir-016 nanobanana-adc doctor` | `manual-runs/b-empty-cloudsdk.txt` | `resolved: /tmp/empty-gcloud-dir-016`, `source: env CLOUDSDK_CONFIG`, override note 表示, `CLOUDSDK_CONFIG_OVERRIDE` (info) 1 件発火。`application_default_credentials.json: missing`, `legacy_credentials/: missing`。**注**: `defaultAdcProbe()` 内で `GoogleAuth().getClient()` が走るとその副作用で gcloud / google-auth-library が CLOUDSDK_CONFIG dir に `active_config` / `configurations/` / `credentials.db` / `access_tokens.db` などを書き込んでしまうため、capture 後の dir は空ではなくなっている (presence=exists として観測)。これは doctor の挙動ではなく実機 google-auth-library の副作用で、CLI ユーザの実体験に一致する出力。`exit 0` を厳守。 |
| **c** | `CLOUDSDK_CONFIG=$HOME/git/KDG-lab/.config/gcloud nanobanana-adc doctor` | `manual-runs/c-kdg-cloudsdk.txt` | `resolved: /Users/yamamoto/git/KDG-lab/.config/gcloud`, `source: env CLOUDSDK_CONFIG`, `effective default: .../KDG-lab/.../application_default_credentials.json (exists, 403 B, ...)`, `resolved: default (effective default)` (text 表記), ADC type は KDG-lab 側の authorized_user。`CLOUDSDK_CONFIG_OVERRIDE` (info) 発火。 |
| **d** | `CLOUDSDK_CONFIG=$HOME/git/KDG-lab/.config/gcloud nanobanana-adc doctor --json \| jq '{gcloudConfigDir, adcSource}'` | `manual-runs/d-json-extract.txt` (full は `d-json-full.txt`) | `gcloudConfigDir.source === "env-cloudsdk-config"`, `gcloudConfigDir.note` 出力あり, `adcSource.resolved === "default"` (JSON 上は plain literal を維持), `effectiveDefault` 出力, `defaultLocation` が `effectiveDefault` と同じ AdcSourceFileInfo (alias)、`cloudsdkConfig` は absent。 |

スコープ外 (実機環境で skip) のパターン: なし。a/b/c/d すべて実機で実行できた。

### secrets masking 最終確認

```
$ grep -E 'private_key|refresh_token|private_key_id|-----BEGIN PRIVATE KEY-----' manual-runs/*.txt
<no matches — clean>
```

LEAK_CANARY 系の secret は全 4 capture いずれにも一切出ていない。

---

## 4. 完了条件チェック

- [x] `bun test` 全 GREEN (122 pass / 0 fail) — T15 leak canary regression #62 維持、新 #84 で CLOUDSDK_CONFIG 経由のシナリオも追加保証
- [x] `bunx tsc --noEmit` エラー 0
- [x] `npm run build` 成功 — `dist/cli.js` 再生成済み (`06:58` タイムスタンプ)
- [x] バージョン 4 箇所 (`package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `src/cli.ts` の `CLI_VERSION` + `.version()`) すべて `0.6.0` に同期 — `package-lock.json` も追従更新
- [x] README.md / README.ja.md / CHANGELOG.md の `[0.6.0]` 更新 — plan §8.1–§8.3 のドラフトに準拠
- [x] 動作確認 4 パターン (a/b/c/d) すべて `manual-runs/` に保存
- [x] `impl-log.md` 出力 (本ファイル)

---

## 5. 設計判断のまとめ (実装側で固定したもの)

- **案 a 採用** (plan §1): `adcSource.resolved` の値集合は v0.5 から不変。`'default'` の意味だけ "effective default" に再定義。`'cloudsdk-config'` は v0.6 では runtime で生成しない (`AdcSourceKind` の literal は型互換のため `@deprecated` 付きで残置、v2 で削除予定)。
- **案 a-text** (plan §1.1 / Design Review §M1 選択肢 C): JSON `adcSource.resolved` は plain `'default'` リテラル、text の `resolved:` 行のみ `default (effective default)` と表記する。`renderResolvedKind` で `kind === 'default'` のときだけ括弧書きを付与し、`env` / `metadata-server` / `unknown` は素のまま。test #83b で両方向を assert。
- **defaultLocation alias** (plan §2.1): v0.5 consumer の `report.adcSource.defaultLocation.path` を救うため、v0.6 では `defaultLocation === effectiveDefault` (同一 `AdcSourceFileInfo` 参照) を返す。v1.0 で削除予定。
- **`gcloudConfigDir` は additive top-level フィールド** (plan §4.1): `nanobanana-adc-doctor/v1` の schema 名は維持。consumer は presence チェック不要 (v0.6+ では常に存在)。camelCase 厳守。
- **`CLOUDSDK_CONFIG_OVERRIDE` は env のみで判定** (plan §5.1): warning は `ctx.env.CLOUDSDK_CONFIG` を読む。`adcSourceResolver` の結果に依存しないため、`GAC + CLOUDSDK_CONFIG` 同時 set (`resolved=env`) のケースでも併発火する (#79b で assert)。severity は `info`。
- **exit 0 不変条件** (plan §3.4): `CLOUDSDK_CONFIG` が指す dir が存在しない (pattern b)・`EACCES` (test #78)・`gcloud` 不在 (test #66) のいずれでも doctor は exit 0。`resolveGcloudConfigDir` 内の stat 例外は catch して `state: 'unreadable'` に丸める。
- **secrets masking** (plan §12 / 本実装): `parseAdcMeta` は無変更 (T15 で確立した「fresh object に safe field のみコピー」方針を維持)。`gcloudConfigDir.presence` は stat 情報 + ディレクトリ件数のみ; ファイル名や中身は持たない。`gcloudConfigDir.resolved` のパス文字列は secret ではないが、test #84 で LEAK_CANARY 系の値が出ないことを assert。

---

## 6. リスクと申し送り

- **`defaultLocation` の semantic 変更は breaking change** (plan §11 #1): v0.5 で `defaultLocation.path === $HOME/.config/gcloud/...` を仮定していた consumer は、CLOUDSDK_CONFIG override 環境では別パスを受け取る。CHANGELOG `Deprecated` セクションと README migration note に明記済み。minor バンプ (v0.6.0) で吸収する判断。
- **`adcSource.cloudsdkConfig` を omit したことで JSON consumer が `obj.cloudsdkConfig.path` で `TypeError`** (plan §11 #2): T15 [0.5.0] Notes で「`obj.cloudsdkConfig === undefined` を test しろ」と既に書いていた。改めて README v0.5 → v0.6 migration note にも書いた。
- **Windows での `appDataDir` (`process.env.APPDATA`) 未定義** (plan §11 #4): T15 と同じ挙動 (フォールバック未実装)。本タスクのスコープ外として申し送り。
- **pattern b の副作用** (manual-runs §3 b 注): `defaultAdcProbe` 内の `GoogleAuth().getClient()` が google-auth-library 経由で CLOUDSDK_CONFIG dir を初期化してしまうため、capture 直後は presence が `exists` 寄りになる。これは google-auth-library の挙動であり、doctor 側の修正対象ではない。test #76 (mock 注入) で「dir not exist → all missing」のロジック自体は GREEN で保証されている。

---

## 7. 作業境界の遵守

- main ブランチへの直接 commit は **行っていない** (worktree 内で作業)。
- commit も **行っていない** (Conductor が後で commit する想定、本 impl-log もその一環)。
- スコープ外の変更 (画像生成ロジック / generate.ts / png.ts / auth.ts への変更) は **入れていない**。`src/doctor.ts` / `src/doctor.test.ts` / `src/cli.ts` (CLI_VERSION + `.version()` 同期のみ) / `package*.json` / `.claude-plugin/*.json` / README × 2 / CHANGELOG.md / `dist/*` (ビルド成果物) のみ。
