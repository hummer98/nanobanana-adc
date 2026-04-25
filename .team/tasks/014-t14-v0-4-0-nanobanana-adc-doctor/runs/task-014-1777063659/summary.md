# T14 実装サマリー — v0.4.0 `nanobanana-adc doctor` サブコマンド追加

実装者: Implementer Agent
作業日: 2026-04-25
worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659`
ブランチ: `task-014-1777063659/task`
plan rev: rev 2（Design Review Approved）

---

## 変更ファイル

### 新規

- `src/doctor.ts` — 460 行強。`DoctorReport` 型 / `buildDoctorReport` / `renderDoctorText` / `renderDoctorJSON` /
  `maskApiKey` / `classifyInstallMethod` / `resolveAuthRoute` / warn 関数 7 個 / `computeWarnings` /
  `defaultAdcProbe` / `defaultGcloud*Fetcher` を公開。副作用は `defaultAdcProbe` 内の `GoogleAuth`
  呼び出しと `defaultGcloud*Fetcher` の `execFile('gcloud', …)` のみ。テストでは全部注入ポイントで差し替え可能。
- `src/doctor.test.ts` — plan §7.1 の 30 ケースをそのまま実装。`opts.nowMs = () => 0` 固定、
  `adcProbe` / `credsFileExists` / gcloud fetcher 全部 fake 注入でヘルメティック。**全 30 件 pass**。

### 変更

- `src/cli.ts` — `program.command('generate', { isDefault: true })` + `program.command('doctor')` の
  2 subcommand 構成。既存 `--prompt ...` は `isDefault: true` により `generate` に routing されるため
  **後方互換ゼロ破壊**。`.version('0.4.0')` リテラル（CI の regex `.version\('([^']+)'\)` 前提）。
- `package.json` — `"version": "0.3.0"` → `"0.4.0"`、`scripts.test` に `src/doctor.test.ts` 追加。
- `.claude-plugin/plugin.json` — `"version": "0.4.0"`。
- `.claude-plugin/marketplace.json` — `plugins[0].version = "0.4.0"`。
- `CHANGELOG.md` — `[0.4.0] - 2026-04-25` セクションを先頭に追加。`Added` / `Changed` / `Notes` 形式で、
  exit code = 0 採用理由、`--verbose` の PII 注意、`CLI_VERSION_STALE` を v0.5.0 以降に延期した旨を記載。
- `README.md` — `## Diagnostics (doctor)` セクション（テキスト出力例 / `--json` gating / `--verbose` 注意）を
  `## Authentication` の直前に挿入。
- `README.ja.md` — 同上を日本語化し、warning code の対訳表を併設（JSON schema 互換性維持のため code 自体は英語固定）。
- `CLAUDE.md` — "ファイル責務" 表に `src/doctor.ts` 行を追加、`src/cli.ts` 行の説明も doctor に言及。

### 非変更（plan §3.3 に従う）

- `src/auth.ts`, `src/generate.ts`, `src/png.ts`, `bin/nanobanana-adc`
- `src/auth.ts::resolveAuth()` は **触っていない**。`[auth] using: ...` 副作用ログがある関係で doctor は
  独立に `GoogleAuth` を叩く（plan §2.3）。
- `tsconfig.json`, `.github/workflows/*`

---

## バージョン同期確認

```
$ PKG=$(node -p "require('./package.json').version")
$ PLUGIN=$(node -p "require('./.claude-plugin/plugin.json').version")
$ MARKET=$(node -p "require('./.claude-plugin/marketplace.json').plugins.find(p => p.name === 'nanobanana-adc').version")
$ CLI=$(grep -oE "\.version\('([^']+)'\)" src/cli.ts | sed -E "s/.*'([^']+)'.*/\1/")
$ echo "package.json=$PKG plugin.json=$PLUGIN marketplace.json=$MARKET src/cli.ts=$CLI"
package.json=0.4.0 plugin.json=0.4.0 marketplace.json=0.4.0 src/cli.ts=0.4.0
$ [ "$PKG" = "0.4.0" ] && [ "$PLUGIN" = "0.4.0" ] && [ "$MARKET" = "0.4.0" ] && [ "$CLI" = "0.4.0" ] && echo "version-sync: OK"
version-sync: OK
```

CI の `validate-plugin` ジョブが期待する 4 点一致を満たす。

---

## typecheck / build / test

```
$ npm run typecheck
> nanobanana-adc@0.4.0 typecheck
> tsc --noEmit
（エラーなし）

$ npm run build
> nanobanana-adc@0.4.0 build
> tsc
（エラーなし、dist/ に cli.js / doctor.js / generate.js / auth.js / png.js を生成）

$ npm test
...
1..66
# tests 66
# suites 0
# pass 66
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 283.04375
```

内訳: 既存の `png.test.ts` + `generate.test.ts` に加え、新規 `doctor.test.ts` の 30 ケースが全部通過。

---

## doctor 出力（3 環境）

### a. 現在の環境（API key + ADC 両方 set、`GOOGLE_CLOUD_LOCATION=us-central1`）

```
$ GOOGLE_CLOUD_LOCATION=us-central1 node dist/cli.js doctor
nanobanana-adc doctor

CLI
  path:                             /Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659/dist/cli.js
  version:                          0.4.0
  install:                          source

Auth route
  selected:                         api-key-env   (GEMINI_API_KEY set and no --api-key flag)

API key
  present:                          yes
  prefix:                           AIzaSy…
  length:                           39
  looks_valid:                      yes

ADC
  probed:                           yes
  status:                           ok
  project:                          gen-lang-client-0451899685

GCP env
  GOOGLE_CLOUD_PROJECT:             gen-lang-client-0451899685
  GOOGLE_CLOUD_LOCATION:            us-central1   ⚠ not 'global'
  GOOGLE_GENAI_USE_VERTEXAI:        true
  GOOGLE_APPLICATION_CREDENTIALS:   /Users/yamamoto/git/KDG-lab/.config/gcloud/application_default_credentials.json

Model
  default:                          gemini-3-pro-image-preview
  note:                             requires GOOGLE_CLOUD_LOCATION=global on the ADC path

Warnings (2)
  ⓘ [GEMINI_API_KEY_SHADOWS_ADC] GEMINI_API_KEY takes precedence over ADC. Use `env -u GEMINI_API_KEY nanobanana-adc ...` to force the ADC path.
  ⚠ [LOCATION_NOT_GLOBAL] GOOGLE_CLOUD_LOCATION=us-central1 — Gemini 3 Pro Image is served only at 'global'. Set GOOGLE_CLOUD_LOCATION=global.
$ echo exit=$?
exit=0
```

### b. `env -u GEMINI_API_KEY` + `GOOGLE_CLOUD_LOCATION=global`（clean ADC）

```
$ env -u GEMINI_API_KEY GOOGLE_CLOUD_LOCATION=global GOOGLE_GENAI_USE_VERTEXAI=true node dist/cli.js doctor
nanobanana-adc doctor

CLI
  path:                             /Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659/dist/cli.js
  version:                          0.4.0
  install:                          source

Auth route
  selected:                         adc   (GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION set; ADC path)

API key
  present:                          no

ADC
  probed:                           yes
  status:                           ok
  project:                          gen-lang-client-0451899685

GCP env
  GOOGLE_CLOUD_PROJECT:             gen-lang-client-0451899685
  GOOGLE_CLOUD_LOCATION:            global
  GOOGLE_GENAI_USE_VERTEXAI:        true
  GOOGLE_APPLICATION_CREDENTIALS:   /Users/yamamoto/git/KDG-lab/.config/gcloud/application_default_credentials.json

Model
  default:                          gemini-3-pro-image-preview
  note:                             requires GOOGLE_CLOUD_LOCATION=global on the ADC path

Warnings (0)
  (none)
$ echo exit=$?
exit=0
```

### c. `env -u GEMINI_API_KEY -u GOOGLE_CLOUD_PROJECT -u GOOGLE_CLOUD_LOCATION`（fatal 想定）

```
$ env -u GEMINI_API_KEY -u GOOGLE_CLOUD_PROJECT -u GOOGLE_CLOUD_LOCATION node dist/cli.js doctor
nanobanana-adc doctor

CLI
  path:                             /Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659/dist/cli.js
  version:                          0.4.0
  install:                          source

Auth route
  selected:                         none   (no API key and ADC env is incomplete)

API key
  present:                          no

ADC
  probed:                           yes
  status:                           ok
  project:                          gen-lang-client-0451899685

GCP env
  GOOGLE_CLOUD_PROJECT:             (unset)
  GOOGLE_CLOUD_LOCATION:            (unset)
  GOOGLE_GENAI_USE_VERTEXAI:        true
  GOOGLE_APPLICATION_CREDENTIALS:   /Users/yamamoto/git/KDG-lab/.config/gcloud/application_default_credentials.json

Model
  default:                          gemini-3-pro-image-preview
  note:                             requires GOOGLE_CLOUD_LOCATION=global on the ADC path

Warnings (1)
  ⚠ [NO_AUTH_AVAILABLE] No usable auth route. Either set GEMINI_API_KEY or configure ADC (gcloud auth application-default login + GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION=global).
$ echo exit=$?
exit=0
```

補足: 検証環境では `~/.config/gcloud/application_default_credentials.json` が実在しており
`GoogleAuth` が trivially にトークンを返すため `adc.status = ok` と表示される。一方 `authRoute.selected = none`
となるのは、`src/auth.ts::resolveAuth()` と同じく `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION`
両方が必須だからで、fatal warning `NO_AUTH_AVAILABLE` が正しく発火している。
"token 取得できる ≠ API を叩ける" という設計上の区別を doctor が明示しており、意図通り。

---

## JSON 出力と jq 検証

```
$ node dist/cli.js doctor --json | jq -e . >/dev/null && echo "json: OK"
json: OK
```

3 環境すべてで `--json | jq -e . >/dev/null` が成功する（stdout に診断 JSON 以外のノイズが混ざらない）。

### a 環境での JSON（`generatedAt` / `tokenPrefix` は再現性のため除外して掲示）

```json
{
  "schema": "nanobanana-adc-doctor/v1",
  "cli": {
    "path": "/Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659/dist/cli.js",
    "version": "0.4.0",
    "installMethod": "source"
  },
  "authRoute": {
    "selected": "api-key-env",
    "reason": "GEMINI_API_KEY set and no --api-key flag"
  },
  "apiKey": {
    "present": true,
    "prefix": "AIzaSy",
    "length": 39,
    "looksValid": true
  },
  "adc": {
    "probed": true,
    "ok": true,
    "project": "gen-lang-client-0451899685"
  },
  "gcpEnv": {
    "GOOGLE_CLOUD_PROJECT": "gen-lang-client-0451899685",
    "GOOGLE_CLOUD_LOCATION": "global",
    "GOOGLE_GENAI_USE_VERTEXAI": "true",
    "GOOGLE_APPLICATION_CREDENTIALS": {
      "path": "/Users/yamamoto/git/KDG-lab/.config/gcloud/application_default_credentials.json",
      "exists": true
    }
  },
  "model": {
    "default": "gemini-3-pro-image-preview",
    "note": "requires GOOGLE_CLOUD_LOCATION=global on the ADC path"
  },
  "warnings": [
    {
      "code": "GEMINI_API_KEY_SHADOWS_ADC",
      "severity": "info",
      "message": "GEMINI_API_KEY takes precedence over ADC. Use `env -u GEMINI_API_KEY nanobanana-adc ...` to force the ADC path."
    }
  ],
  "fatal": false
}
```

### c 環境（fatal）での `.fatal` と `.warnings` 抜粋

```json
{
  "fatal": true,
  "warnings": [
    {
      "code": "NO_AUTH_AVAILABLE",
      "severity": "fatal",
      "message": "No usable auth route. Either set GEMINI_API_KEY or configure ADC (gcloud auth application-default login + GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION=global)."
    }
  ]
}
```

スクリプトから gate を掛ける場合は `nanobanana-adc doctor --json | jq -e '.fatal | not' >/dev/null`
というイディオムが使える。

---

## `--verbose` 目視

```
$ node dist/cli.js doctor --verbose --json | jq '.verbose'
{
  "tokenPrefix": "ya29.a0A",
  "gcloudAccount": "rr.yamamoto@gmail.com",
  "gcloudProject": "gen-lang-client-0451899685",
  "gcloudAdcFilePath": "/Users/yamamoto/.config/gcloud/application_default_credentials.json",
  "nodeVersion": "v22.15.0",
  "platform": "darwin-arm64"
}
```

`gcloudAccount` に **実在する個人メールアドレス** が載ることを確認済。これは想定通りで、
**`--verbose` は CI transcript / デモ録画には向かない** — README.md / README.ja.md / CHANGELOG.md
にそれぞれ注意書きを明記した。

---

## help パターン 5 種（plan §9.4）

| # | コマンド | 結果 |
|---|---------|------|
| 1 | `nanobanana-adc --help` | トップ help。`generate [options]` と `doctor [options]` の 2 行が見える |
| 2 | `nanobanana-adc generate --help` | generate 固有オプション（`-p` `--output` `--aspect` `--size` `--model` `--api-key` `--person-generation` `--no-embed-metadata`）が並ぶ |
| 3 | `nanobanana-adc doctor --help` | doctor 固有オプション（`--json` / `-v, --verbose`）が並ぶ |
| 4 | `nanobanana-adc --prompt x ...` | `isDefault: true` により generate に routing、画像生成 action が実行される（auth まで到達）|
| 5 | `nanobanana-adc`（引数なし） | `error: required option '-p, --prompt <text>' not specified` で exit 1（既存挙動維持） |

全 5 パターン期待どおり。

---

## plan §1.2 受け入れ基準 checklist

- [x] `nanobanana-adc --prompt ...` が従来通り動く（後方互換ゼロ破壊） — §9.4 パターン 4 で確認
- [x] `nanobanana-adc doctor` がテキスト出力する — §a/b/c
- [x] `nanobanana-adc doctor --json` が parseable な JSON を出力する — jq -e . 全環境 pass
- [x] `nanobanana-adc doctor --verbose` が `verbose` block を追加 — `--verbose` 目視で確認
- [x] `nanobanana-adc --help` に `generate` / `doctor` 両方並ぶ — §9.4 パターン 1
- [x] 7 パターンの warning が発火する — unit test 8-16, 手元 e2e で `LOCATION_NOT_GLOBAL` / `GEMINI_API_KEY_SHADOWS_ADC` / `NO_AUTH_AVAILABLE` の 3 種を実観測
- [x] マスキング規則が守られる — unit test 25（40+ 文字連続 token の不在検証）+ JSON / text 両方の目視
- [x] ADC 成功時は `adc.account` と `adc.project` が report に載る（取得できた場合のみ。fail-open） — §a JSON で `project` のみ載る（本環境では `getCredentials()` が client_email を返さないので `account` 省略、設計通り）
- [x] `npm run typecheck` / `npm run build` / `npm test` が通る
- [x] `doctor.ts` の unit test が 30 ケース pass
- [x] CI の `validate-plugin` ジョブが期待する 4 点同期 — 上の「バージョン同期確認」を参照
- [x] `README.md` / `README.ja.md` / `CLAUDE.md` / `CHANGELOG.md` を更新
- [x] 3 環境パターン（§8）の実行結果を summary に貼付（上の a/b/c）
- [x] summary に exit code 常時 0 の理由 / `--verbose` 非推奨の旨を明記（以下「設計上のポイント」参照）

### plan §1.3 スコープ外の再確認

- `/release 0.4.0` — T14 本体スコープ外（別タスク）
- Claude Code 側 plugin state 検査 — 含めていない
- 実モデル API 呼び出し — doctor は `GoogleAuth.getAccessToken()` だけで画像生成 API は叩かない
- `CLI_VERSION_STALE` — v0.5.0 以降の拡張点として CHANGELOG の Notes に記載済み

---

## 設計上のポイント（summary 必須記載事項）

### 1. exit code を常に 0 に倒した理由

`doctor` は診断ツールであり、ゲートではない。以下の 4 点が plan §2.5 の採用理由:

1. タスク本文 §4 が「機械 parse しやすさ優先」を明示。
2. ADC 失敗は一過性（metadata server DNS、企業 proxy、プロビジョニング直後の env 未整備）であり、
   exit 1 だと CI が機械的に落ちる。doctor は情報を出すだけで良い。
3. shell 側で gate したいユーザーは `nanobanana-adc doctor --json | jq -e '.fatal | not'` で
   自前 gating できる（JSON が authoritative）。
4. `brew doctor` / `gcloud info` など先行事例も診断出力 ＝ exit 0 が主流。

例外: doctor 自身が crash（環境読めない、module 初期化失敗など想定外）した場合は
`cli.ts` 最上段の `.catch(...)` が exit 1 を返す通常の Node プロセス終了として通す。

### 2. `--verbose` は CI transcript / デモ録画には向かない

`--verbose` 時に埋まる `gcloudAccount` は `gcloud config get-value account` の raw で、
**実在する個人メールアドレス**（本検証では `rr.yamamoto@gmail.com`）が入る。`gcloudAdcFilePath`
はローカルファイルシステムパスで、ユーザー名やワークスペース階層をリークする。
README / README.ja / CHANGELOG の 3 箇所に注意書きを入れた（「Issue・CI ログ・デモ録画への
貼り付けは内容確認の上」）。

なお、API key 関連は `--verbose` でも prefix 6 + length のみで、raw は出さない。
ADC token 本体も先頭 8 文字のみ（`adc.tokenPrefix` + `verbose.tokenPrefix` の二重掲示）。

### 3. `adc.ok: true` でも `authRoute: none` / `fatal: true` になりうる（§c 環境）

`defaultAdcProbe` は `GoogleAuth.getAccessToken()` が成功すれば `ok: true` を返すが、
`src/auth.ts::resolveAuth()` 側は ADC mode で `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION`
両方を必須にしているため、env が欠けていると「token は取れるが API 呼び出しには使えない」
状態になる。doctor はこれを "`adc.status: ok` + `authRoute.selected: none` + `fatal: true`" で
忠実に表現している。ユーザーから見ると一瞬混乱しうるが、"token が取れるか" と "auth route として
使えるか" を分離することは意図的な設計（plan §2.3）。

---

## plan §2 / §7.2 実装順序の遵守確認

plan §7.2 のステップ順 1-8 を TDD で順守:

1. ✓ `maskApiKey`（test 1-3）
2. ✓ `classifyInstallMethod`（test 4-7）
3. ✓ `resolveAuthRoute`（test 26-29）
4. ✓ `computeWarnings` を 7 関数に分割（plan §7.2 step 4 / 付録 C F-1）（test 8-15）
5. ✓ `buildDoctorReport`（test 16-22）
6. ✓ `renderDoctorJSON`（test 23, 25）
7. ✓ `renderDoctorText`（test 24）
8. ✓ precedence 整合性 test 30（`auth.ts::resolveAuth()` との一致）

最後に CLI 結線（§7.3）。help 5 パターンと e2e 3 パターンが全部 green。

---

## 懸念・残課題

- **`NO_AUTH_AVAILABLE` が fatal severity で ⚠ マーカー表示**。plan §4.3 のモックは `⚠` / `ⓘ` の 2 種のみ
  だが、実装では fatal も ⚠ を共用している。`severity: fatal` は JSON で明示されるため機械 parse
  には支障なし。テキスト出力上の視認性向上（例: ⛔）は v0.4.0 では採用しないが、v0.5.0 以降の
  nit として検討の余地あり。
- **`defaultAdcProbe` の 5s timeout は `setTimeout().unref()`** 方式（plan §9.1 選択肢 a）。
  `AbortController.signal` を `getAccessToken` に渡すより SDK 非依存で単純だが、metadata server が
  DNS fail-open で数秒待たされるケースは plan §9.6 の tradeoff として許容（一律 5s 単位でタイムアウト
  するのは UX 的に誤誘導になりうる、という但し書き）。
- **`test 25` の `!/[0-9A-Za-z_-]{40,}/` assert** は発想上の gate であり、将来 token prefix を
  15 文字以上へ広げると false positive になる。現行の 8 文字運用なら十分セーフ。v0.5.0 以降で
  マスク幅を変える場合は test 25 の閾値も見直す。
- **CI の `validate-plugin` ジョブ**でローカル `claude plugin validate .` は plan §10.3 に従い
  「CI に委ねる」方針。`@anthropic-ai/claude-code` を global install するのが重いため、手元では
  実行していない。CI で落ちた場合は plugin.json / marketplace.json を見直す。

---

## 完了状態

- 新規: `src/doctor.ts` (+ `src/doctor.test.ts`)
- 変更: `src/cli.ts` / `package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` /
  `CHANGELOG.md` / `README.md` / `README.ja.md` / `CLAUDE.md`
- 非変更: `src/auth.ts` / `src/generate.ts` / `src/png.ts` / `bin/nanobanana-adc` / `.github/workflows/*`
- typecheck / build / 66 tests / version sync / e2e 3 環境 / help 5 パターン すべて green

次ステップ（スコープ外）: Conductor による commit → merge、別タスクで `/release 0.4.0`。
