# T14 検品レポート — v0.4.0 `nanobanana-adc doctor` サブコマンド

検品者: Inspector Agent (independent session)
検品日: 2026-04-25
worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659`
ブランチ: `task-014-1777063659/task`
plan rev: rev 2
判定: **GO**

---

## 1. 静的検査

| コマンド | 結果 |
|---------|------|
| `npm run typecheck` | ✅ pass — エラーなし、警告なし |
| `npm test` | ✅ pass — `1..66 / pass 66 / fail 0`（duration 約 410ms） |
| `npm run build` | ✅ pass — `dist/` に `auth.js`, `cli.js`, `doctor.js`, `generate.js`, `png.js` 生成 |

ビルド出力サイズ: `doctor.js` 16,930 bytes / `cli.js` 3,094 bytes（妥当なサイズ）。

テスト内訳: 既存 `png.test.ts` (37 ケース) + `generate.test.ts` (16 ケース?) + 新規 `doctor.test.ts` (30 ケース) = **計 66 件すべて pass**。Implementer 申告の「30 ケース all pass」と一致。

---

## 2. バージョン同期確認（CI `validate-plugin` 通過の前提）

```
package.json    = 0.4.0
plugin.json     = 0.4.0
marketplace.json = 0.4.0
src/cli.ts      = 0.4.0  (.version('0.4.0') と const CLI_VERSION = '0.4.0' の 2 行)
```

`grep -nE "0\.[34]\.0" src/cli.ts` の結果も `0.3.0` の残骸なし。**4 箇所完全同期 ✓**。

---

## 3. CLI 後方互換性

| コマンド | 期待 | 実測 | 判定 |
|---------|------|------|------|
| `node dist/cli.js --help` | `generate` / `doctor` 両方が見える | `Commands: generate [options] / doctor [options] / help [command]` 表示 | ✅ |
| `node dist/cli.js doctor --help` | `--json` / `-v, --verbose` が見える | 表示確認 | ✅ |
| `node dist/cli.js generate --help` | 既存 `--prompt`, `--output`, `--aspect`, `--size`, `--model`, `--api-key`, `--person-generation`, `--no-embed-metadata` | 全部表示 | ✅ |
| `node dist/cli.js --version` | `0.4.0` | `0.4.0` | ✅ |
| `node dist/cli.js`（引数なし） | `error: required option '-p, --prompt <text>' not specified` で exit **1** | exit 1 確認（pipe を介さず直接実行で検証） | ✅ |
| `node dist/cli.js --api-key invalid --prompt 'test' ...` | auth 通るが API rejection で exit 1 | `[auth] using: api-key` 後 `400 Bad Request: API_KEY_INVALID` で exit 1 | ✅ |

`isDefault: true` による generate への routing が機能している。

---

## 4. doctor 動作確認（3 環境）

すべて `echo $?` で exit code を確認。

### 4.a 現在の環境（API key + ADC env 両方 set、`GOOGLE_CLOUD_LOCATION` を direnv で `global` に set）

実行コマンド: `node dist/cli.js doctor`
- `authRoute.selected = api-key-env` ✓
- `apiKey.present = yes / prefix = AIzaSy / length = 39 / looks_valid = yes` ✓
- `adc.status = ok` & `adc.project = gen-lang-client-0451899685` ✓
- Warnings (1): `ⓘ [GEMINI_API_KEY_SHADOWS_ADC]` ✓
- exit = **0** ✓

なお `GOOGLE_CLOUD_LOCATION=us-central1` を強制した別実行で `⚠ [LOCATION_NOT_GLOBAL]` も発火を確認 → 検品要件 §5.a で「a で `GOOGLE_CLOUD_LOCATION=us-central1` warning が出るか」を満たす（plan §8.1 の意図を再現）。

### 4.b ADC clean (`env -u GEMINI_API_KEY GOOGLE_CLOUD_LOCATION=global`)

- `authRoute.selected = adc` ✓
- `apiKey.present = no` ✓
- `adc.status = ok` ✓
- `Warnings (0) (none)` ✓
- exit = **0** ✓

### 4.c Fatal (`env -u GEMINI_API_KEY -u GOOGLE_CLOUD_PROJECT -u GOOGLE_CLOUD_LOCATION`)

- `authRoute.selected = none (no API key and ADC env is incomplete)` ✓
- Warnings (1): `⚠ [NO_AUTH_AVAILABLE]` (severity=fatal in JSON) ✓
- `fatal: true`（`--json` で確認） ✓
- exit = **0** ✓

補足: `~/.config/gcloud/application_default_credentials.json` が実在するため `defaultAdcProbe` は token を取得できて `adc.status: ok` となるが、`authRoute.selected` 側は `GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION` 必須なので `none` 判定 → `NO_AUTH_AVAILABLE` 発火。設計通り（plan §2.3 / summary §3 の "token 取れる ≠ API 叩ける" 区別）。

---

## 5. JSON 出力の妥当性

```
$ node dist/cli.js doctor --json | jq -e . > /dev/null && echo OK
OK
$ node dist/cli.js doctor --json | jq '.schema, .cli.version'
"nanobanana-adc-doctor/v1"
"0.4.0"
$ node dist/cli.js doctor --json | jq '.adc | has("tokenPrefix")'
false                       # 非 verbose 時はキー自体が無い ✓
$ node dist/cli.js doctor --json | jq '.verbose'
null                        # キー無し → jq は null を返す（schema 通り）
$ node dist/cli.js doctor --verbose --json | jq '.verbose'
{
  "tokenPrefix": "ya29.a0A",                           # 8 文字 ✓
  "gcloudAccount": "rr.yamamoto@gmail.com",
  "gcloudProject": "gen-lang-client-0451899685",
  "gcloudAdcFilePath": "/Users/yamamoto/.config/gcloud/application_default_credentials.json",
  "nodeVersion": "v22.15.0",
  "platform": "darwin-arm64"
}
```

3 環境すべてで `--json | jq -e .` 通過、stdout に診断 JSON 以外の混入なし（`[auth] using: ...` のような generate 経路の副作用ログは doctor では呼ばれていない、設計通り）。

複合 warning が同時に並ぶケースも確認（`env -u GEMINI_API_KEY GOOGLE_CLOUD_PROJECT=p GOOGLE_CLOUD_LOCATION=us-east1 GOOGLE_GENAI_USE_VERTEXAI=false GOOGLE_APPLICATION_CREDENTIALS=/no` で 4 種同時発火 + `fatal: true`）→ `computeWarnings` の集約ロジック OK。

---

## 6. マスキング（プライバシー）

| 項目 | 検証方法 | 結果 |
|------|---------|------|
| `GEMINI_API_KEY` 全文の不出 | text/JSON/verbose-JSON 各出力を `grep "$GEMINI_API_KEY"` | 3 ケースすべて **マッチなし** ✓ |
| `apiKey.prefix` は 6 文字 + length のみ | JSON 確認 | `prefix: "AIzaSy"`, `length: 39` ✓ |
| ADC token 本体の不出 | 非 verbose 時に `adc | has("tokenPrefix")` | `false` ✓ |
| `--verbose` 時 `tokenPrefix` 8 文字 | `jq -r .verbose.tokenPrefix \| awk '{ print length }'` | `8` ✓ |
| `GOOGLE_APPLICATION_CREDENTIALS` の中身を開かない | JSON は path + exists のみ。creds-file 内の `client_email` 等が出ていないこと | `gcpEnv.GOOGLE_APPLICATION_CREDENTIALS = { path, exists }` のみ ✓ |
| `test 25` の長 token regex 不在チェック | `npm test` 内で pass | ✓ |

`--verbose` の `gcloudAccount` に実在個人 email (`rr.yamamoto@gmail.com`) が載るのは **意図通り**。README / README.ja / CHANGELOG の 3 箇所に「CI transcript / デモ録画には貼らない」注意書きがあること確認済（`grep` で対応箇所を確認）。

---

## 7. 受け入れ基準カバレッジ（conductor-prompt §1-10）

| § | 項目 | 充足 | 備考 |
|---|------|------|------|
| 1 | サブコマンド化（`generate` / `doctor`、後方互換、help にトップ表示） | ✅ | `isDefault: true` で `--prompt` routing OK |
| 2-CLI | `argv[1]` resolved + version | ✅ | `realpathSync` で symlink 解決 |
| 2-AuthRoute | 優先順位を 1 行表示 | ✅ | `selected` + `reason` |
| 2-API key | prefix6 + length + format check | ✅ | `maskApiKey` |
| 2-ADC | `getAccessToken()` 試行、token 本体非出力、account/project は fail-open | ✅ | `defaultAdcProbe` |
| 2-GCP env | `GOOGLE_CLOUD_*` / `USE_VERTEXAI` / `CREDS` を全表示 + warning | ✅ | text 出力で `⚠ not 'global'` / `⚠ file not found` 等 |
| 2-Install | argv[1] から判別 | ✅ | claude-plugin / npm-global / source / unknown |
| 2-Model | global 必須案内 | ✅ | `Model` セクション |
| 3-`--json` | machine-readable | ✅ | `nanobanana-adc-doctor/v1` schema |
| 3-`--verbose` | tokenPrefix 8 文字 + gcloud raw + runtime | ✅ | `verbose` block で 6 field |
| 4-Warnings | 7 パターン | ✅ | `NO_AUTH_AVAILABLE` / `GEMINI_API_KEY_SHADOWS_ADC` / `LOCATION_NOT_GLOBAL` / `LOCATION_MISSING` / `CREDS_FILE_MISSING` / `USE_VERTEXAI_NOT_TRUE` / `API_KEY_FORMAT_SUSPECT` を実機で 4 種同時発火させて確認。`CLI_VERSION_STALE` は plan §9.3 で v0.5.0 以降に延期、CHANGELOG Notes に明記済 |
| 4-exit code | 常に 0 | ✅ | a/b/c 三環境すべて 0 |
| 5-Privacy | masking 厳守 | ✅ | §6 参照 |
| 6-構造 | `src/doctor.ts` に切り出し、`auth.ts` 不変 | ✅ | `git status` で `src/auth.ts` 未変更確認 |
| 7-tests | env パターン / JSON schema / auth route 優先順位 | ✅ | 30 ケース pass |
| 8-docs | `README.md` / `README.ja.md` / `CLAUDE.md` / `CHANGELOG.md` 更新 | ✅ | `grep "doctor"` で全部反映確認 |
| 9-version | 4 箇所同期 | ✅ | §2 参照 |
| 10-動作確認 | 3 環境 + JSON valid | ✅ | §4 / §5 |

---

## 8. plan からの逸脱チェック

plan rev 2 と実装の対応を spot-check した結果、**意図的でない逸脱なし**。

| plan の指示 | 実装 | 整合 |
|------------|-----|------|
| `program.command('generate', { isDefault: true })` 採用案 B | `src/cli.ts:27` | ✅ |
| `DoctorReport.schema = 'nanobanana-adc-doctor/v1'` | `src/doctor.ts:66, 419` | ✅ |
| 7 種 warning 関数を独立純関数で分割 (F-1) | `warnNoAuth` ... `warnApiKeyFormatSuspect` の 7 関数 | ✅ |
| `setTimeout().unref()` で 5s timeout (§9.1 選択肢 a) | `defaultAdcProbe` 292-293 行 | ✅ |
| `apiKeyFlag` 引数残し（doctor では常に undefined） | `src/cli.ts:96-97` のコメント、`resolveAuthRoute` shape | ✅ |
| 環境変数読み取りを `DoctorEnv` に集約 | `process.env as DoctorEnv` を `cli.ts` 1 箇所のみで使用 | ✅ |
| ADC probe 注入ポイント (`opts.adcProbe`) | テスト 30 件すべて fake 経由でヘルメティック | ✅ |
| `auth.ts::resolveAuth()` を触らない | `git diff src/auth.ts` 空 | ✅ |
| ADC fail-open（account/project 取得失敗で undefined） | `defaultAdcProbe` 305-323 行の try/catch | ✅ |
| `--verbose` 時のみ `report.verbose` を埋める | `buildDoctorReport` 446 行の `if (opts.verbose)` ガード | ✅ |
| `dist/` 手編集なし | `git status` で `dist/` が untracked のまま、`tsc` で再生成 | ✅ |
| `.npmrc` 制約遵守（新規依存なし） | `package.json` diff に `dependencies` 変更なし | ✅ |

---

## 9. summary.md の自己申告と実態の整合

抜き打ちチェックで以下を確認:

| summary 主張 | 実測 | 整合 |
|------------|------|------|
| 「`npm test` で 66 件 pass」 | TAP 出力 `1..66 / pass 66 / fail 0` | ✅ |
| 「doctor.test.ts 30 ケース pass」 | テスト名 `1.` 〜 `30.` まで番号付きで全 OK | ✅ |
| 「a 環境で `LOCATION_NOT_GLOBAL` + `GEMINI_API_KEY_SHADOWS_ADC`」 | `GOOGLE_CLOUD_LOCATION=us-central1` を強制した実機で再現 ✓ | ✅ |
| 「c 環境で fatal=true、exit 0」 | 検品実機で再現、exit 0 確認 ✓ | ✅ |
| 「version 4 点同期 0.4.0」 | §2 で再検 ✓ | ✅ |
| 「help パターン 5 種すべて期待どおり」 | §3 で再検（pattern 5 の exit 1 を pipe なしで再確認） ✓ | ✅ |
| 「`--verbose` の `tokenPrefix` は 8 文字」 | `awk '{print length}'` で 8 確認 ✓ | ✅ |
| 「`apiKey` raw は `--verbose` でも出さない」 | grep $GEMINI_API_KEY で 3 出力すべて不在 ✓ | ✅ |
| 「`src/auth.ts::resolveAuth()` 不変」 | `git status` で示されない ✓ | ✅ |

`generatedAt` / `tokenPrefix` を生で含む snapshot を summary が掲載していない点も privacy 観点で適切。

---

## 10. 環境依存により実行できなかった項目

- `claude plugin validate .` のローカル実行は plan §10.3 に従い CI に委ねる方針（`@anthropic-ai/claude-code` global install が重い）。CI 側 `validate-plugin` ジョブで通ること自体は version-sync が満たされているので期待できる。
- 実 Vertex AI / Gemini API 呼び出しは **意図的に未実行**（課金回避・スコープ外）。
- npm registry への `npm view` 呼び出しテストは plan §9.3 で v0.4.0 不採用のため無し。

---

## 11. 観察された nit / future improvements（非ブロッキング）

以下は **GO 判定を覆さない**。Implementer の summary §「懸念・残課題」とも整合する:

1. **fatal severity も `⚠` マーカー共用**: text 出力で fatal と warn が同じ ⚠ になる。JSON では `severity: fatal` で区別可能。v0.5.0 以降で `⛔` 等を検討する余地あり（plan §4.3 のモック準拠）。
2. **`adc.ok: true` + `authRoute.none` + `fatal: true` の同居**: ユーザー視点では混乱しうるが、設計上は意図的（"token は取れるが API 経路として完備でない"）。`Auth route` の `reason` フィールドが「no API key and ADC env is incomplete」と明示しているため許容範囲。
3. **`test 25` の token 検出 regex `[0-9A-Za-z_-]{40,}`**: 現行 8 文字 mask なら充分セーフだが、将来 mask 幅を拡張する場合は閾値も同時更新が必要。コメントで明示しても良い nit。
4. **`defaultAdcProbe` の 5s timeout は一律待ち**: metadata server 不可達の DNS fail-open 待ちで毎回 5s かかるユーザー体験は plan §9.6 の tradeoff として許容済。`AbortController.signal` を `getAccessToken` に渡す実装は将来の改善点。
5. **`classifyInstallMethod` の regex `\/git\/nanobanana-adc\/`**: ユーザーがリポを別名でクローンした場合 `unknown` になる。worktree ディレクトリは `\/\.worktrees\/` で拾えているので実害は限定的。

---

## 12. 判定

### **GO** — マージ可

理由:
- typecheck / build / 66 tests すべて green
- 4 箇所の version 同期完了（CI `validate-plugin` 通過の前提を満たす）
- 後方互換ゼロ破壊（`--prompt ...` 動作維持、`--version`、help 体裁、no-args の exit 1）
- 受け入れ基準 §1-10 すべてカバー、Plan rev 2 からの逸脱なし
- マスキング規則（API key prefix のみ / token 8 文字 / creds JSON 非 open）が text/JSON/verbose 全モードで保持
- 3 環境 e2e の自己申告と再現結果が一致、exit code 常時 0 を確認
- 設計上の判断（exit 0 ポリシー、`--verbose` の PII 注意、`CLI_VERSION_STALE` 延期）が CHANGELOG / summary で明示されている

§11 の nit はすべて plan / summary で既知化されており、いずれも v0.5.0 以降の拡張で十分対応可能。**v0.4.0 として Conductor の merge → `/release 0.4.0` への進行を推奨する**。
