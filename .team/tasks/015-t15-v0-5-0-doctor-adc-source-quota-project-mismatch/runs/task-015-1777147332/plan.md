# T15 — v0.5.0 `nanobanana-adc doctor`: ADC source 解決 + quota_project mismatch 検出

実装計画書 (Planner Agent 出力 / 後続 Implementer Agent 用)。
Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-015-1777147332`

---

## 1. 背景・現状

T14 (v0.4.0) で `nanobanana-adc doctor` を導入済み。現状の `src/doctor.ts` は次のことを「やっている」:

- `apiRoute` 解決 (`api-key-flag` / `api-key-env` / `adc` / `none`)
- `GoogleAuth` で access token 取得を試行 (`defaultAdcProbe`) — 5 秒 timeout、課金は発生しない
- `GEMINI_API_KEY` のマスク (`prefix(6) + length + looksValid`)
- 4 種の GCP env var 読み取り (`GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` / `GOOGLE_GENAI_USE_VERTEXAI` / `GOOGLE_APPLICATION_CREDENTIALS`)
- `GOOGLE_APPLICATION_CREDENTIALS` のファイル存在確認 (`CREDS_FILE_MISSING` warning)
- 7 種の warning (`NO_AUTH_AVAILABLE` / `GEMINI_API_KEY_SHADOWS_ADC` / `LOCATION_NOT_GLOBAL` / `LOCATION_MISSING` / `CREDS_FILE_MISSING` / `USE_VERTEXAI_NOT_TRUE` / `API_KEY_FORMAT_SUSPECT`)
- text + JSON 両 renderer (`schema: 'nanobanana-adc-doctor/v1'`)
- `--verbose` で `tokenPrefix(8 chars)` / `gcloud config get-value account` / `gcloud config get-value project` / ADC ファイルパスのデフォルト位置 (`$HOME/.config/gcloud/application_default_credentials.json` の存在確認のみ) を表示

T14 が「やっていない」、T15 でやること:

- **ADC が実際にどのファイル / 経路から credential を読んでいるか** を解決して報告する (env / default / cloudsdk-config / metadata-server / unknown)
- ADC JSON のメタ情報 (`type` / `quotaProjectId` / `clientId` / `clientEmail`) を抽出して表示する (`private_key` / `refresh_token` / `private_key_id` は絶対に出さない)
- `quotaProjectId` と `GOOGLE_CLOUD_PROJECT` の食い違いを `ADC_QUOTA_PROJECT_MISMATCH` warning として検出
- metadata server を `--probe-metadata-server` opt-in flag で 300ms probe (デフォルトは env heuristic のみ)
- `account` resolution を `gcloud auth list --filter='status:ACTIVE' --format='value(account)'` に切り替え (現在は `gcloud config get-value account` を verbose 限定で出している。新しいフィールドは normal 出力にも出す)
- 既存 `CREDS_FILE_MISSING` を温存しつつ、新 warning `ADC_FILE_MISSING` を **並列発火** で追加 (後方互換)。CHANGELOG Notes に deprecation roadmap を記述する (R-rec-7)

---

## 2. ゴール (受け入れ基準を満たした最終状態)

`nanobanana-adc doctor` 実行時に:

1. 既存 7 warning がすべて従来通り発火する (T14 既存テスト 30 本が破壊されない)
2. 新セクション `ADC source` が常に表示される (text 出力)
3. JSON 出力に `adcSource` フィールド (camelCase、§ 3.3 で確定) が追加され、schema 名は `nanobanana-adc-doctor/v1` のまま (additive change のみ)
4. 環境のうち、以下の 3 状況で適切な warning が出る:
   - `meta.quotaProjectId` ≠ `GOOGLE_CLOUD_PROJECT` → `ADC_QUOTA_PROJECT_MISMATCH`
   - `GOOGLE_APPLICATION_CREDENTIALS` パスのファイル不在 → `ADC_FILE_MISSING` (+ 既存 `CREDS_FILE_MISSING` も継続発火)
   - ADC JSON の `type` が想定外値 → `ADC_TYPE_UNUSUAL` (informational)
5. `private_key` / `refresh_token` / `private_key_id` は `--verbose` 含めいかなる場合も出力に現れない
6. `--probe-metadata-server` opt-in flag が動く (未指定時は metadata server を probe しない)
7. `account` 表示は best-effort、`gcloud` 不在 / 取得失敗時は `<unresolved (gcloud unavailable or no active account)>` で正直に表示
8. version が `0.4.0` → `0.5.0` に **4 箇所** 同期され、CI `validate-plugin` ジョブが通る (§ Step 9 / § 9)
9. README.md / README.ja.md / CHANGELOG.md が更新済み

---

## 3. 設計

### 3.0 モジュール構造

`src/doctor.ts` (既存) に追加。**新ファイルは作らない** (既存の純関数構造に合わせる)。テストは `src/doctor.test.ts` に追加。

新規追加する純関数 / 型:

| 名前 | 役割 |
|---|---|
| `AdcSourceKind` | `'env' \| 'default' \| 'cloudsdk-config' \| 'metadata-server' \| 'unknown'` |
| `AdcCredentialType` | `'authorized_user' \| 'service_account' \| 'external_account' \| 'impersonated_service_account' \| 'unknown'` |
| `AdcSourceFileInfo` | `{ path: string; exists: boolean; size?: number; mtimeMs?: number }` |
| `AdcSourceMeta` | ADC JSON から抽出する type/quotaProjectId/clientId/clientEmail |
| `AdcSourceReport` | `adcSource` セクション全体 (= `DoctorReport.adcSource` の値) |
| `resolveAdcSource(env, opts, deps)` | 純関数。fs / 子プロセス / network は callbacks で injection |
| `parseAdcMeta(parsed: unknown)` | ADC JSON (parsed) から safe field だけを取り出す |
| `defaultGcloudActiveAccountFetcher()` | `gcloud auth list ...` を best-effort 実行 |
| `defaultMetadataServerProbe(timeoutMs)` | 169.254.169.254 を 300ms で probe |
| `warnAdcQuotaProjectMismatch` / `warnAdcFileMissing` / `warnAdcTypeUnusual` | 新 warning 関数 |
| `fileInfo(path, statAsync)` | `path` を `statAsync` で stat し `AdcSourceFileInfo` を返す helper (R-rec-3 参照) |

### 3.1 設計判断 (Planner 確定済み)

| 判断 | 採用 | 根拠 |
|---|---|---|
| metadata server probe の opt-in flag 名 | **`--probe-metadata-server`** | タスク文準拠・他フラグも長い名前なので一貫性 |
| account resolution の手段 | **`gcloud auth list --filter='status:ACTIVE' --format='value(account)'`** | タスク文に明示。複数行返り得るため最初の 1 行のみ採用 (R-rec-5) |
| `account` を normal 出力に出すか | **A: normal で出す** | 受け入れ基準の「表示項目」に列挙。旧 `gcloud config get-value account` は `verbose.gcloudAccount` に残置 |
| `ADC_FILE_MISSING` の扱い | **B: 既存 `CREDS_FILE_MISSING` を残し、新 `ADC_FILE_MISSING` を並列発火** | 後方互換 (T14 既存テスト + JSON consumer) を破壊しない。CHANGELOG Notes に deprecation roadmap (v1.0 で `CREDS_FILE_MISSING` 廃止予定) を記載 (R-rec-7) |
| metadata server "heuristic" 検出 env vars | **タスク文準拠** (`K_SERVICE` / `GAE_APPLICATION` / `KUBERNETES_SERVICE_HOST` / `CLOUD_BUILD_BUILDID`) | `KUBERNETES_SERVICE_HOST` は GKE 以外でも立つが、heuristic は `metadata-server` カテゴリで OK |
| ADC default location の Windows 対応 | **`process.platform === 'win32'` で `%APPDATA%\gcloud\...`** | タスク文に明記。`process.env.APPDATA` を `appDataDir` deps 経由で参照 |
| `CLOUDSDK_CONFIG` の扱い | **env が立っていたら `${CLOUDSDK_CONFIG}/application_default_credentials.json` を確認し、存在すれば `cloudsdk-config` source として返す。優先度は env > cloudsdk-config > default > metadata-server > unknown** | gcloud の挙動と一致 |
| ADC JSON 読み取りの I/O | **非同期 (`fs/promises.readFile`)** | 既存コードが async ベース |
| ADC JSON parse 失敗時 | **`meta = null` で fall through (throw しない)** | doctor は診断ツール。raw JSON が壊れていても他の診断は出すべき |
| metadata server probe デフォルト timeout | **300ms** | タスク文準拠。link-local IP に対する妥当値 |
| ADC JSON のサイズ制限 | **1 MB upper bound (`maxJsonBytes = 1_048_576`)** | malformed / 巨大ファイル耐性。`stat().size` を見て超過なら `meta = null` |
| **JSON 出力の命名規約** (R-rec-1, I2) | **すべて camelCase で統一する。トップレベル key は `adcSource`、内側も `quotaProjectId` / `clientId` / `clientEmail` / `envCredentials` / `defaultLocation` / `cloudsdkConfig` / `metadataServer` / `envHeuristic` / `probeOk` / `probeError` / `accountError`** | 既存 `gcpEnv` / `authRoute` / `apiKey` が camelCase。タスク文の `adc_source` (snake_case) は **無視し、Planner 責任で `adcSource` に確定**。受け入れ基準 11.d は `jq .adcSource` で実行する |

### 3.2 `DoctorEnv` 型の拡張 (I3 対応)

現行 `DoctorEnv` (`src/doctor.ts` line 10-16) は 5 key (`GEMINI_API_KEY` / `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` / `GOOGLE_GENAI_USE_VERTEXAI` / `GOOGLE_APPLICATION_CREDENTIALS`) のみ。`resolveAdcSource` が以下 5 key を参照するため、`DoctorEnv` を **拡張** する:

```ts
export interface DoctorEnv {
  // 既存 5 key
  GEMINI_API_KEY?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_GENAI_USE_VERTEXAI?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;

  // T15 で追加する 5 key (すべて optional string)
  K_SERVICE?: string;                  // Cloud Run / Cloud Functions Gen2
  GAE_APPLICATION?: string;            // App Engine
  KUBERNETES_SERVICE_HOST?: string;    // GKE / k8s 一般
  CLOUD_BUILD_BUILDID?: string;        // Cloud Build
  CLOUDSDK_CONFIG?: string;            // gcloud の代替 config dir
}
```

`cli.ts` 側で `process.env` から `DoctorEnv` を組み立てる箇所を **9 key** すべて読むように更新する:

```ts
// src/cli.ts (doctor command の action 内)
const env: DoctorEnv = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
  GOOGLE_GENAI_USE_VERTEXAI: process.env.GOOGLE_GENAI_USE_VERTEXAI,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  K_SERVICE: process.env.K_SERVICE,
  GAE_APPLICATION: process.env.GAE_APPLICATION,
  KUBERNETES_SERVICE_HOST: process.env.KUBERNETES_SERVICE_HOST,
  CLOUD_BUILD_BUILDID: process.env.CLOUD_BUILD_BUILDID,
  CLOUDSDK_CONFIG: process.env.CLOUDSDK_CONFIG,
};
```

`DoctorEnv` への optional 追加は破壊的変更ではないため、既存テスト 30 本の `baseEnv` は無修正で通る。

### 3.3 `resolveAdcSource()` の interface

```ts
export interface AdcSourceFileInfo {
  path: string;
  exists: boolean;        // ★「ファイルとして存在する」を意味する。directory / symlink-to-dir / 不在 はすべて exists=false (R-rec-3)
  size?: number;          // bytes; exists=true のときのみ
  mtimeMs?: number;       // UNIX ms; exists=true のときのみ
}

export interface AdcSourceMeta {
  type: AdcCredentialType;        // 'authorized_user' | 'service_account' | 'external_account' | 'impersonated_service_account' | 'unknown'
  quotaProjectId?: string;        // ADC JSON の "quota_project_id" を camelCase で詰め替え
  clientId?: string;              // OAuth public client id (authorized_user 等)
  clientEmail?: string;           // service_account の場合のみ
}

export interface AdcSourceReport {
  resolved: AdcSourceKind;                           // 'env' | 'default' | 'cloudsdk-config' | 'metadata-server' | 'unknown'
  envCredentials: AdcSourceFileInfo | null;          // GOOGLE_APPLICATION_CREDENTIALS のパス (env unset → null)
  defaultLocation: AdcSourceFileInfo;                // OS 標準位置 (常に exists の真偽だけは入る)
  cloudsdkConfig?: AdcSourceFileInfo | null;         // CLOUDSDK_CONFIG が立っているときのみ key を出す
  metadataServer: {
    envHeuristic: 'k_service' | 'gae_application' | 'kubernetes' | 'cloud_build' | 'none';
    probed: boolean;                                 // --probe-metadata-server 指定時 true
    probeOk?: boolean;                               // probed === true のときのみ出す
    probeError?: string;                             // probe 失敗時のみ
  };
  meta: AdcSourceMeta | null;                        // 読めなかったとき null
  account?: string;                                  // gcloud auth list で取れた active account
  accountError?: string;                             // 取れなかったときのみ。固定文言: 'gcloud unavailable or no active account'
}

export interface ResolveAdcSourceDeps {
  // テスト時に injection 可能 (実 fs / 子プロセス / network は呼ばない)
  statAsync?: (path: string) => Promise<{ size: number; mtimeMs: number; isFile: boolean } | null>;
  readJsonAsync?: (path: string, maxBytes: number) => Promise<unknown | null>;
  gcloudActiveAccountFetcher?: () => Promise<string | undefined>;
  metadataServerProbe?: (timeoutMs: number) => Promise<{ ok: boolean; error?: string }>;
  homeDir?: () => string;                  // 既定: os.homedir()
  appDataDir?: () => string | undefined;   // 既定: process.env.APPDATA (windows のみ意味あり)
  platform?: NodeJS.Platform;              // 既定: process.platform
}

export interface ResolveAdcSourceOptions {
  probeMetadataServer: boolean;     // CLI フラグ。true なら envHeuristic === 'none' でも probe する (R-rec-4)
  maxJsonBytes?: number;            // 既定: 1_048_576
}

export async function resolveAdcSource(
  env: DoctorEnv,
  opts: ResolveAdcSourceOptions,
  deps?: ResolveAdcSourceDeps,
): Promise<AdcSourceReport>;
```

#### `fileInfo(path, statAsync)` helper (R-rec-3)

```ts
async function fileInfo(
  path: string,
  statAsync: NonNullable<ResolveAdcSourceDeps['statAsync']>,
): Promise<AdcSourceFileInfo> {
  const s = await statAsync(path);
  // s === null (=ENOENT 等) もしくは isFile === false (= directory / symlink-to-dir) は exists=false
  if (!s || !s.isFile) return { path, exists: false };
  return { path, exists: true, size: s.size, mtimeMs: s.mtimeMs };
}
```

#### 解決順序フロー

```
1. envCredentials を組み立てる:
   if env.GOOGLE_APPLICATION_CREDENTIALS:
     fileInfo(env.GOOGLE_APPLICATION_CREDENTIALS, statAsync)  // ★ env.* のみ参照、process.env 直読みしない
   else:
     envCredentials = null

2. cloudsdkConfig を組み立てる:
   if env.CLOUDSDK_CONFIG:                                    // ★ env 経由 (I3)
     candidatePath = `${env.CLOUDSDK_CONFIG}/application_default_credentials.json`
     fileInfo(candidatePath, statAsync)
   else:
     cloudsdkConfig = undefined  (キー自体を出さない)

3. defaultLocation を組み立てる:
   if platform === 'win32':
     defaultPath = `${appDataDir() ?? ''}\\gcloud\\application_default_credentials.json`
   else:
     defaultPath = `${homeDir()}/.config/gcloud/application_default_credentials.json`
   fileInfo(defaultPath, statAsync)

4. metadataServer.envHeuristic を解決:                        // ★ すべて env.* 経由 (I3)
   env.K_SERVICE                ? 'k_service'
 : env.GAE_APPLICATION          ? 'gae_application'
 : env.KUBERNETES_SERVICE_HOST  ? 'kubernetes'
 : env.CLOUD_BUILD_BUILDID      ? 'cloud_build'
 :                                'none'

5. resolved を決定 (top-down):
   a. envCredentials?.exists === true             → 'env'
   b. cloudsdkConfig?.exists === true             → 'cloudsdk-config'
   c. defaultLocation.exists === true             → 'default'
   d. envHeuristic !== 'none'                     → 'metadata-server'
   e. else                                        → 'unknown'

6. meta を読み取り:
   pickedFile =
     resolved === 'env'             ? envCredentials
   : resolved === 'cloudsdk-config' ? cloudsdkConfig
   : resolved === 'default'         ? defaultLocation
   : null
   if pickedFile && pickedFile.exists && (pickedFile.size ?? Infinity) <= maxJsonBytes:
     parsed = await readJsonAsync(pickedFile.path, maxJsonBytes)
     meta = parsed === null ? null : parseAdcMeta(parsed)
   else:
     meta = null

7. metadataServer.probed:
   // ★ R-rec-4: --probe-metadata-server === true なら envHeuristic === 'none' でも probe する。
   //   これは「Cloud Run でない環境からのデバッグ probe」を許容する明示の方針。
   //   タスク文の「heuristic 一致時の probe」とも非衝突 (heuristic 一致時は当然 probe する)。
   if opts.probeMetadataServer === true:
     probed = true
     try   { r = await metadataServerProbe(300); probeOk = r.ok; if r.error then probeError = r.error }
     catch (err) { probeOk = false; probeError = (err as Error).message }
   else:
     probed = false  (probeOk / probeError は省略)

8. account を取得 (best-effort):
   // ★ I4: 既存 runGcloud は gcloud 不在も空 stdout も両方 undefined を返し、throw しない。
   //   よって throw vs undefined の区別はせず、undefined であれば accountError 一本化 (option b)。
   try   { account = await gcloudActiveAccountFetcher() }
   catch { account = undefined }
   if account === undefined:
     accountError = 'gcloud unavailable or no active account'
```

#### `parseAdcMeta` (純関数 / secret 詰め替え)

```ts
export function parseAdcMeta(parsed: unknown): AdcSourceMeta {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { type: 'unknown' };
  const obj = parsed as Record<string, unknown>;
  const rawType = typeof obj.type === 'string' ? obj.type : '';
  const type: AdcCredentialType =
    rawType === 'authorized_user' ||
    rawType === 'service_account' ||
    rawType === 'external_account' ||
    rawType === 'impersonated_service_account'
      ? (rawType as AdcCredentialType)
      : 'unknown';
  const out: AdcSourceMeta = { type };
  if (typeof obj.quota_project_id === 'string') out.quotaProjectId = obj.quota_project_id;
  if (typeof obj.client_id === 'string') out.clientId = obj.client_id;
  if (typeof obj.client_email === 'string' && type === 'service_account') {
    out.clientEmail = obj.client_email;
  }
  return out;
  // NOTE: private_key / refresh_token / private_key_id は **絶対に** 触らない。
  //       新オブジェクト out に詰め替えることで、source object が upstream で
  //       誤って serialize される構造的リスクを排除する (R1)。
}
```

### 3.4 JSON schema 拡張 (`adcSource` セクション完全形 / camelCase 統一)

既存 `DoctorReport` に **常に出す** プロパティとして追加 (additive)。**snake_case 混在は完全排除** (R-rec-1):

```jsonc
{
  "schema": "nanobanana-adc-doctor/v1",
  // ... 既存 (cli, authRoute, apiKey, adc, gcpEnv, model, warnings, fatal, verbose) ...

  "adcSource": {
    "resolved": "default",
    "envCredentials": null,
    "defaultLocation": {
      "path": "/home/user/.config/gcloud/application_default_credentials.json",
      "exists": true,
      "size": 2400,
      "mtimeMs": 1745689200000
    },
    "cloudsdkConfig": null,
    "metadataServer": {
      "envHeuristic": "none",
      "probed": false
      // "probeOk": false,
      // "probeError": "ECONNREFUSED"
    },
    "meta": {
      "type": "authorized_user",
      "quotaProjectId": "my-quota-proj",
      "clientId": "32555940559.apps.googleusercontent.com",
      "clientEmail": "..."           // service_account のときのみ
    },
    "account": "user@example.com",
    "accountError": null              // 任意。account 取得失敗時のみ非 null
  }
}
```

`renderDoctorJSON` は既に `JSON.stringify(report)` で実装済みのため、`DoctorReport` の TS 型を camelCase で正しく作れば JSON も自動的に camelCase になる。**追加の case 変換ロジックは不要**。

### 3.5 テキスト出力フォーマット (`renderDoctorText` 拡張)

`Model` セクションの直前 (= `GCP env` の後) に新セクションを挿入。

#### (a) ADC JSON が読めた場合 (meta !== null)

```text
GCP env
  GOOGLE_CLOUD_PROJECT:             my-gcp-proj
  GOOGLE_CLOUD_LOCATION:            global
  GOOGLE_GENAI_USE_VERTEXAI:        true
  GOOGLE_APPLICATION_CREDENTIALS:   (unset)

ADC source
  resolved:                         default
  env GOOGLE_APPLICATION_CREDENTIALS:  (unset)
  default location:                 /home/user/.config/gcloud/application_default_credentials.json   (exists, 2400 B, 2026-04-26T07:00:00.000Z)
  CLOUDSDK_CONFIG path:             (unset)
  metadata server:                  not probed (no GCE/Cloud Run env detected)
  type:                             authorized_user
  quotaProjectId:                   my-quota-proj
  clientId:                         32555940559.apps.googleusercontent.com
  account:                          user@example.com

Model
  ...
```

#### (b) ADC ファイル不在 / JSON parse 失敗 / metadata-server 経路 (meta === null) — I5 対応

```text
ADC source
  resolved:                         metadata-server
  env GOOGLE_APPLICATION_CREDENTIALS:  (unset)
  default location:                 /home/user/.config/gcloud/application_default_credentials.json   (not found)
  CLOUDSDK_CONFIG path:             (unset)
  metadata server:                  not probed (heuristic: k_service)
  meta:                             (not available — file unreadable or not parsed)
  account:                          <unresolved (gcloud unavailable or no active account)>
```

> **方針**: `meta === null` のときは `type` / `quotaProjectId` / `clientId` の 3 行を **省略** し、代わりに `meta:  (not available — file unreadable or not parsed)` を 1 行だけ出す。`account` は `accountError` があれば `<unresolved (...)>` 表記。

#### (c) GAE/Cloud Run 環境 + `--probe-metadata-server` 指定時

```text
  metadata server:                  probed: ok (300ms)
```

または失敗時:

```text
  metadata server:                  probed: failed (ECONNREFUSED)
```

#### (d) account 取得失敗時 (accountError あり)

```text
  account:                          <unresolved (gcloud unavailable or no active account)>
```

### 3.6 新 warning 3 つ

| code | severity | 検出条件 | message |
|---|---|---|---|
| `ADC_QUOTA_PROJECT_MISMATCH` | `warn` | `adcSource.meta?.quotaProjectId && env.GOOGLE_CLOUD_PROJECT && adcSource.meta.quotaProjectId !== env.GOOGLE_CLOUD_PROJECT` | `` `ADC quota_project_id (${quotaProjectId}) differs from GOOGLE_CLOUD_PROJECT (${envProject}). Run \`gcloud auth application-default set-quota-project ${envProject}\` to align them so billing and operations target the same project.` `` |
| `ADC_FILE_MISSING` | `warn` | `env.GOOGLE_APPLICATION_CREDENTIALS && adcSource.envCredentials?.exists === false` | `` `GOOGLE_APPLICATION_CREDENTIALS=${path}, but the file does not exist.` `` |
| `ADC_TYPE_UNUSUAL` | `info` | `adcSource.meta !== null && adcSource.meta.type === 'unknown'` (= JSON parse できたが `type` が想定外) | `` `ADC credential type is not one of authorized_user / service_account / external_account / impersonated_service_account. The CLI may still work, but this is unexpected.` `` |

`ADC_FILE_MISSING` は既存 `CREDS_FILE_MISSING` と **並列発火** (§ 3.1 / R-rec-7)。
`ADC_TYPE_UNUSUAL` は **JSON が parse できた** ときだけ出す。読めなかった (`meta === null`) ときは出さない。

警告計算側の context (`WarnCtx`) を拡張:

```ts
interface WarnCtx {
  env: DoctorEnv;
  apiKey: ApiKeyInfo;
  adc: DoctorReport['adc'];
  credsExists: boolean | null;
  adcSource: AdcSourceReport;     // 追加
}
```

`computeWarnings` の `fns` に 3 つを append。順序は既存 7 つの後ろ。

---

## 4. 実装ステップ (TDD 順、コミット粒度提案)

順序ごとに **テストを書いて red → 実装して green → リファクタ** を厳守。

### Step 1 — 純関数 `parseAdcMeta` (commit: `feat(doctor): parseAdcMeta safely extracts ADC JSON metadata`)

1. `src/doctor.test.ts` に新セクションを追加: `parseAdcMeta` の 6 ケース
   - `undefined` / `null` → `{ type: 'unknown' }`
   - `{ type: 'authorized_user', client_id: '...', quota_project_id: 'p' }` → `{ type: 'authorized_user', clientId: '...', quotaProjectId: 'p' }`
   - `{ type: 'service_account', client_email: 'sa@x', private_key: 'PRIVATE-DO-NOT-LEAK' }` → `private_key` がプロパティとして存在しないことを `assert.equal(Object.keys(out).includes('privateKey'), false)` および `assert.equal((out as any).private_key, undefined)` で検証
   - `{ type: 'external_account' }` → `{ type: 'external_account' }`
   - `{ type: 'unknown_type' }` → `{ type: 'unknown' }`
   - JSON が `[]` (配列) → `{ type: 'unknown' }`
2. `parseAdcMeta` 実装

### Step 2 — `resolveAdcSource` の純粋ロジック (commit: `feat(doctor): resolveAdcSource resolves credential source via env/default/cloudsdk/metadata`)

注入用 deps をフルスタブして以下のテストを書く:

1. `GOOGLE_APPLICATION_CREDENTIALS` set + ファイル存在 → `resolved === 'env'`、`meta.type` が抽出される
2. `GOOGLE_APPLICATION_CREDENTIALS` set + ファイル不在 → `envCredentials.exists === false`、`resolved === 'default'` (default location 存在時) または `'unknown'` (default 不在時)
3. `default location` 存在のみ → `resolved === 'default'`
4. `CLOUDSDK_CONFIG` set + ファイル存在 (env 不在) → `resolved === 'cloudsdk-config'`
5. すべて不在 + `K_SERVICE` set → `resolved === 'metadata-server'`、`metadataServer.envHeuristic === 'k_service'`、`probed === false`
6. すべて不在 + `KUBERNETES_SERVICE_HOST` set → `resolved === 'metadata-server'`、`envHeuristic === 'kubernetes'`
7. すべて不在 + heuristic env もなし → `resolved === 'unknown'`
8. `opts.probeMetadataServer = true` + probe stub `{ ok: true }` → `metadataServer.probed === true && probeOk === true`
9. `opts.probeMetadataServer = true` + probe stub throws → `probed === true && probeOk === false && probeError === '...'`
10. `gcloudActiveAccountFetcher` returns `'me@x'` → `account === 'me@x'`、`accountError` undefined
11. `gcloudActiveAccountFetcher` returns `undefined` → `account` undefined、`accountError === 'gcloud unavailable or no active account'`
    - **★ I4 確定**: throw 経路と undefined 経路を区別せず、文言一本化
    - 別ケースとして `gcloudActiveAccountFetcher` が **throw** したときも同じ文言になることを確認
12. ADC JSON サイズが maxJsonBytes 超過 → `meta === null` (read しない、`readJsonAsync` が呼ばれないことを spy で確認)
13. Windows (`platform: 'win32'`, `appDataDir: () => 'C:\\Users\\u\\AppData\\Roaming'`) → `defaultLocation.path === 'C:\\Users\\u\\AppData\\Roaming\\gcloud\\application_default_credentials.json'`
14. `statAsync` が `isFile: false` を返す (= directory) → `envCredentials.exists === false` (R-rec-3)
15. `opts.probeMetadataServer = true` かつ `envHeuristic === 'none'` (= GCE 検出されていない) でも probe が呼ばれる (R-rec-4)

実装:

```ts
export async function resolveAdcSource(
  env: DoctorEnv,
  opts: ResolveAdcSourceOptions,
  deps: ResolveAdcSourceDeps = {},
): Promise<AdcSourceReport> {
  const stat = deps.statAsync ?? defaultStatAsync;
  const readJson = deps.readJsonAsync ?? defaultReadJsonAsync;
  const probe = deps.metadataServerProbe ?? defaultMetadataServerProbe;
  const acct = deps.gcloudActiveAccountFetcher ?? defaultGcloudActiveAccountFetcher;
  const platform = deps.platform ?? process.platform;
  const home = (deps.homeDir ?? (() => os.homedir()))();
  const appData = (deps.appDataDir ?? (() => process.env.APPDATA))();
  const maxBytes = opts.maxJsonBytes ?? 1_048_576;

  // 1. envCredentials
  const envPath = env.GOOGLE_APPLICATION_CREDENTIALS;
  const envCredentials: AdcSourceFileInfo | null =
    envPath ? await fileInfo(envPath, stat) : null;

  // 2. cloudsdkConfig (★ env.CLOUDSDK_CONFIG 経由 — I3)
  const cloudsdkConfigDir = env.CLOUDSDK_CONFIG;
  const cloudsdkConfig: AdcSourceFileInfo | null =
    cloudsdkConfigDir
      ? await fileInfo(`${cloudsdkConfigDir}/application_default_credentials.json`, stat)
      : null;

  // 3. defaultLocation
  const defaultPath =
    platform === 'win32'
      ? `${appData ?? ''}\\gcloud\\application_default_credentials.json`
      : `${home}/.config/gcloud/application_default_credentials.json`;
  const defaultLocation = await fileInfo(defaultPath, stat);

  // 4. envHeuristic (★ すべて env.* 経由 — I3)
  const envHeuristic: AdcSourceReport['metadataServer']['envHeuristic'] =
    env.K_SERVICE              ? 'k_service'
  : env.GAE_APPLICATION        ? 'gae_application'
  : env.KUBERNETES_SERVICE_HOST? 'kubernetes'
  : env.CLOUD_BUILD_BUILDID    ? 'cloud_build'
  : 'none';

  // 5. resolved
  const resolved: AdcSourceKind =
    envCredentials?.exists ? 'env'
  : cloudsdkConfig?.exists ? 'cloudsdk-config'
  : defaultLocation.exists ? 'default'
  : envHeuristic !== 'none' ? 'metadata-server'
  : 'unknown';

  // 6. meta
  let meta: AdcSourceMeta | null = null;
  const picked =
    resolved === 'env'             ? envCredentials
  : resolved === 'cloudsdk-config' ? cloudsdkConfig
  : resolved === 'default'         ? defaultLocation
  : null;
  if (picked?.exists && (picked.size ?? Infinity) <= maxBytes) {
    const parsed = await readJson(picked.path, maxBytes);
    if (parsed !== null) meta = parseAdcMeta(parsed);
  }

  // 7. metadataServer.probed (★ R-rec-4: probeMetadataServer=true なら envHeuristic 無関係に probe)
  let metadataServer: AdcSourceReport['metadataServer'];
  if (opts.probeMetadataServer) {
    try {
      const r = await probe(300);
      metadataServer = {
        envHeuristic,
        probed: true,
        probeOk: r.ok,
        ...(r.error ? { probeError: r.error } : {}),
      };
    } catch (err) {
      metadataServer = {
        envHeuristic,
        probed: true,
        probeOk: false,
        probeError: (err as Error).message,
      };
    }
  } else {
    metadataServer = { envHeuristic, probed: false };
  }

  // 8. account (★ I4: throw / undefined を一本化)
  let account: string | undefined;
  let accountError: string | undefined;
  try {
    account = await acct();
  } catch {
    account = undefined;
  }
  if (account === undefined) {
    accountError = 'gcloud unavailable or no active account';
  }

  return {
    resolved,
    envCredentials,
    defaultLocation,
    ...(cloudsdkConfigDir ? { cloudsdkConfig } : {}),
    metadataServer,
    meta,
    ...(account !== undefined ? { account } : {}),
    ...(accountError !== undefined ? { accountError } : {}),
  };
}
```

### Step 3 — 新 warning 3 種 (commit: `feat(doctor): add ADC_QUOTA_PROJECT_MISMATCH / ADC_FILE_MISSING / ADC_TYPE_UNUSUAL warnings`)

1. `WarnCtx` に `adcSource: AdcSourceReport` を追加
2. `warnAdcQuotaProjectMismatch` / `warnAdcFileMissing` / `warnAdcTypeUnusual` を実装
3. `computeWarnings` の `fns` 配列末尾に追加
4. テスト 6 ケース:
   - quotaProjectId ≠ GOOGLE_CLOUD_PROJECT → `ADC_QUOTA_PROJECT_MISMATCH` 発火
   - quotaProjectId == GOOGLE_CLOUD_PROJECT → 発火しない
   - quotaProjectId 未設定 (meta 不在 or undefined) → 発火しない
   - GOOGLE_APPLICATION_CREDENTIALS set + 不在 → `ADC_FILE_MISSING` + 既存 `CREDS_FILE_MISSING` 両方発火
   - meta.type === 'unknown' (parse できた場合) → `ADC_TYPE_UNUSUAL`
   - meta === null (file 不在) → `ADC_TYPE_UNUSUAL` 出ない

### Step 4 — `buildDoctorReport` 統合 (commit: `feat(doctor): wire adcSource into buildDoctorReport`)

1. `DoctorOptions` に `adcSourceResolver?: (env, opts) => Promise<AdcSourceReport>` を追加
2. `DoctorOptions` に `probeMetadataServer?: boolean` を追加
3. `DoctorReport` に `adcSource: AdcSourceReport` を追加
4. `buildDoctorReport` 内で `adcSourceResolver(env, { probeMetadataServer })` (デフォルトは `resolveAdcSource`) を呼び、結果を `report.adcSource` に格納
5. `computeWarnings` への引数を更新 (`adcSource` を渡す)
6. 既存 30 テストを動かし regression なきこと確認 (= テスト本体の `baseOpts` に `adcSourceResolver: async () => MINIMAL_ADC_SOURCE_STUB` を追加)
7. 新規テスト 5 ケース:
   - `adcSource` が `report.adcSource` にそのまま入る
   - JSON renderer が `adcSource` キー (camelCase) を含む
   - text renderer が `ADC source` セクションを含む
   - `--probe-metadata-server` を opts で渡すと `probeMetadataServer: true` で resolver が呼ばれる (spy)
   - `--verbose` でも `private_key` / `refresh_token` / `private_key_id` 文字列が JSON に出ない (regex 検査、§ 5.5 と同じ)

### Step 5 — Renderer 拡張 (commit: `feat(doctor): render ADC source section in text and JSON outputs`)

1. `renderDoctorText` に `ADC source` セクションを追加 (§ 3.5 (a)/(b)/(c)/(d) の 4 パターン)
   - `meta === null` 時は 3 行省略 + `meta:  (not available — file unreadable or not parsed)` (I5)
   - `accountError` あり時は `<unresolved (...)>` 表記
2. `renderDoctorJSON` は既存 `JSON.stringify(report)` で自動的に camelCase 出力 (§ 3.4)
3. テスト:
   - meta あり: `assert.match(text, /ADC source/)`、`assert.match(text, /quotaProjectId:/)`、`assert.match(text, /clientId:/)`
   - meta === null: `assert.match(text, /meta: +\(not available — file unreadable or not parsed\)/)` 、`assert.doesNotMatch(text, /quotaProjectId:/)`
   - accountError あり: `assert.match(text, /<unresolved \(gcloud unavailable or no active account\)>/)`

### Step 6 — CLI 統合 (commit: `feat(cli): add doctor --probe-metadata-server flag`)

1. `src/cli.ts` の `program.command('doctor')` に `.option('--probe-metadata-server', 'probe 169.254.169.254 (300ms) for GCE/Cloud Run metadata server', false)` を追加
2. action callback で `DoctorEnv` を 9 key で組み立てる (§ 3.2 のコード例)
3. `buildDoctorReport(env, { ..., probeMetadataServer: !!opts.probeMetadataServer })` を渡す

### Step 7 — gcloud active-account fetcher (commit: `feat(doctor): use gcloud auth list to resolve active account`)

1. `defaultGcloudActiveAccountFetcher` を新規追加:
   ```ts
   export async function defaultGcloudActiveAccountFetcher(): Promise<string | undefined> {
     const out = await runGcloud(['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)']);
     if (!out) return undefined;
     // ★ R-rec-5: 複数 account が ACTIVE になる場合 (gcloud configurations 等) を考慮し、
     //   最初の 1 行のみ採用する。runGcloud は trim するが改行を残すため明示的に分割。
     const firstLine = out.split(/\r?\n/)[0]?.trim();
     return firstLine && firstLine.length > 0 ? firstLine : undefined;
   }
   ```
2. 既存 `runGcloud` (line 344-355) は触らない。挙動 (gcloud 不在も空 stdout も `undefined` を返す) は既知 (I4)
3. `defaultGcloudAccountFetcher` (= 旧 `gcloud config get-value account`) は **温存**。`--verbose` の `verbose.gcloudAccount` で引き続き使う (新 `adcSource.account` と併存)
4. unit test:
   - `runGcloud` を spy/mock し、`'me@example.com'` 1 行 → `'me@example.com'`
   - 改行混じり `'me@example.com\nother@example.com'` → `'me@example.com'` (R-rec-5)
   - 空 → `undefined`

### Step 8 — Default metadata-server probe (commit: `feat(doctor): default metadata server probe with 300ms timeout`)

1. `defaultMetadataServerProbe(timeoutMs)`:
   - `node:http` で `http://169.254.169.254/computeMetadata/v1/instance/id` に `GET` (header `Metadata-Flavor: Google`)
   - `200` → `{ ok: true }`
   - その他 / abort / network error → `{ ok: false, error: '...' }`
   - timeout は `AbortController` + `setTimeout(...).unref()`
2. **ユニットテストは一切 network を叩かない**。`metadataServerProbe` を deps で stub
3. 動作確認も Cloud Run 環境がない場合は skip 可

### Step 9 — version bump (commit: `chore: bump version to 0.5.0`)

`0.4.0` → `0.5.0` を **4 箇所** で同期する (§ 9 表参照、5 箇所ではない / I1):

| file | 該当箇所 |
|---|---|
| `package.json` | `"version": "0.4.0"` |
| `.claude-plugin/plugin.json` | `"version": "0.4.0"` (line 3、**既存 field を更新するだけ**) |
| `.claude-plugin/marketplace.json` | `plugins[0].version: "0.4.0"` |
| `src/cli.ts` | `const CLI_VERSION = '0.4.0';` および `.version('0.4.0')` (両方) |

> **★ I1 修正**: 旧 plan は「`plugin.json` に version field がない」「CI 側に bug がある可能性」と書いていたが、これは事実誤認。実ファイル `.claude-plugin/plugin.json` line 3 に既に `"version": "0.4.0"` が存在し、`.github/workflows/ci.yml` line 58 で 4 way 比較が機能している。**Implementer は CI スクリプトの調査も user 確認も不要**。単に既存 version 値を `0.5.0` に書き換えるだけ。

`src/doctor.test.ts` の `FAKE_VERSION` (= test 内固定値) は CI 同期検査の対象外なので **更新は任意** (差分最小化のため上げない)。

### Step 10 — ドキュメント (commit: `docs: document v0.5.0 doctor adc-source + quota mismatch`)

1. `README.md` の `## Diagnostics (doctor)` を更新:
   - 出力例に `ADC source` セクションを追加 (§ 3.5 (a) の通り、camelCase で統一)
   - 新 warning 3 種を表 / リストで紹介
   - `--probe-metadata-server` を「Optional flags」に追記
   - JSON 例を `jq .adcSource` で書く
2. `README.ja.md` の同セクションも対応 (Warning 対訳テーブルに 3 行追加)
3. `CHANGELOG.md` に `## [0.5.0] - 2026-04-26` を追加 (`Added` / `Changed` / `Notes`):
   - **Added**: ADC source resolution (`env` / `default` / `cloudsdk-config` / `metadata-server` / `unknown`) / `--probe-metadata-server` flag / 3 new warnings (`ADC_QUOTA_PROJECT_MISMATCH` / `ADC_FILE_MISSING` / `ADC_TYPE_UNUSUAL`) / `gcloud auth list`-based active account resolution / `DoctorEnv` に 5 key 追加 (`K_SERVICE` / `GAE_APPLICATION` / `KUBERNETES_SERVICE_HOST` / `CLOUD_BUILD_BUILDID` / `CLOUDSDK_CONFIG`)
   - **Changed**: text/JSON 出力に `ADC source` / `adcSource` セクション追加 (additive、既存 schema 互換)
   - **Notes**:
     - `private_key` / `refresh_token` / `private_key_id` 完全マスキング保証 (`parseAdcMeta` が新オブジェクトに詰め替える設計)
     - JSON 命名は **camelCase で統一** (`adcSource`、内側も `quotaProjectId` / `clientId` 等)。既存 `gcpEnv` / `authRoute` / `apiKey` のスタイルに合わせる
     - `ADC_FILE_MISSING` と既存 `CREDS_FILE_MISSING` は **重複発火** する (後方互換のため)
     - **`CREDS_FILE_MISSING` deprecation roadmap** (R-rec-7): v1.0 で `CREDS_FILE_MISSING` を deprecate し、`ADC_FILE_MISSING` 一本化を予定。JSON consumer は早めに `ADC_FILE_MISSING` への移行を推奨
     - Out of scope: WIF deep parse, impersonation chain following — tracked for a future release

### Step 11 — 動作確認 (§ 6 参照、commit はせずに summary に貼る)

---

## 5. テスト計画

### 5.1 Test runner / framework

`node --test --import tsx src/png.test.ts src/generate.test.ts src/doctor.test.ts` (= `package.json` line 46)。新規テストは `src/doctor.test.ts` に追加。`package.json` の `test` スクリプト変更は不要。

### 5.2 Mock 戦略

| 対象 | 戦略 |
|---|---|
| ファイル I/O (`statAsync` / `readJsonAsync`) | deps 引数で完全に注入。実 fs は触らない |
| `gcloudActiveAccountFetcher` | deps 注入。実 `gcloud` は呼ばない |
| `metadataServerProbe` | deps 注入。実 169.254.169.254 は **絶対に** 触らない (CI でハングする) |
| `homeDir` / `appDataDir` / `platform` | deps 注入。OS 依存テストは Windows path をテスト時に強制 |
| ADC JSON parse | `readJsonAsync` stub から `{ type: '...' }` を返す |

### 5.3 tmp dir 戦略

不要。ユニットテストは fs を触らない (deps で stub)。**インテグレーションテストはこの PR では追加しない**。受け入れ基準 11 の 4 パターンは「動作確認」フェーズ (§ 6) で人が手動実行する。

### 5.4 env var 操作

既存テスト 30 (`test 30. resolveAuth and resolveAuthRoute agree...`) と同様、`process.env.GEMINI_API_KEY` を一時的に書き換えて finally で復元するパターンを踏襲。新規テストではほぼ不要 (env は `DoctorEnv` 引数で渡せるため)。

### 5.5 secret leak 検査 (R-rec-2)

`renderDoctorJSON` 出力に対して以下を検査。stub には **意図的に `LEAK_CANARY_*` 文字列を埋め込み**、output に出ないことを個別 assert で確認する:

```ts
const stubReadJson = async () => ({
  type: 'service_account',
  client_email: 'sa@x.iam.gserviceaccount.com',
  private_key:
    '-----BEGIN PRIVATE KEY-----\nLEAK_CANARY_PRIVATE_KEY_BODY\n-----END PRIVATE KEY-----',
  private_key_id: 'LEAK_CANARY_KEY_ID',
  refresh_token: 'LEAK_CANARY_REFRESH_TOKEN',
  client_id: '32555940559.apps.googleusercontent.com',
  quota_project_id: 'q-proj',
});

const report = await buildDoctorReport(env, {
  ...baseOpts,
  adcSourceResolver: async () => resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: async () => ({ size: 1024, mtimeMs: 1, isFile: true }),
    readJsonAsync: stubReadJson,
    homeDir: () => '/home/x',
    platform: 'linux',
    gcloudActiveAccountFetcher: async () => 'sa@x.iam.gserviceaccount.com',
  }),
});

const json = renderDoctorJSON(report);

// 1. 構造的: secret 系のキー名が JSON に存在しない
assert.doesNotMatch(json, /"private_key"/);
assert.doesNotMatch(json, /"private_key_id"/);
assert.doesNotMatch(json, /"refresh_token"/);
assert.doesNotMatch(json, /-----BEGIN[\s\S]*?PRIVATE KEY-----/);

// 2. 値ベース: LEAK_CANARY_* がどこにも現れない
assert.doesNotMatch(json, /LEAK_CANARY_PRIVATE_KEY_BODY/);
assert.doesNotMatch(json, /LEAK_CANARY_KEY_ID/);
assert.doesNotMatch(json, /LEAK_CANARY_REFRESH_TOKEN/);

// 3. text renderer も同様に検査
const text = renderDoctorText(report);
assert.doesNotMatch(text, /LEAK_CANARY_/);
assert.doesNotMatch(text, /-----BEGIN[\s\S]*?PRIVATE KEY-----/);

// 4. positive: client_email は service_account なので出る
assert.match(json, /sa@x\.iam\.gserviceaccount\.com/);
```

`LEAK_CANARY_*` 個別検査により、regex の取りこぼし (line break 差異 / 全角ハイフン混入 / unicode escape など) も検出できる。

### 5.6 既存テスト 30 本の互換確認

`baseOpts` に `adcSourceResolver: async () => MINIMAL_ADC_SOURCE_STUB` を追加するだけで全テストが通る設計にする。`MINIMAL_ADC_SOURCE_STUB` は **`accountError` を omit** (R-rec-6):

```ts
const MINIMAL_ADC_SOURCE_STUB: AdcSourceReport = {
  resolved: 'unknown',
  envCredentials: null,
  defaultLocation: { path: '/fake/default', exists: false },
  metadataServer: { envHeuristic: 'none', probed: false },
  meta: null,
};
```

既存 30 テストの大多数は account 解決を検証していないので、stub に余計な `accountError` ノイズを入れない。account 検証する新規テストでは個別に値を組み立てる。

---

## 6. 動作確認手順 (受け入れ基準 11)

**実行者**: Implementer Agent。コミットを完了し `npm run build` 後、4 パターンを実行して結果を summary (= Implementer が PR description にコピペ) に貼る。

### a. 現在環境 → `ADC_QUOTA_PROJECT_MISMATCH` 発火を確認

```bash
node dist/cli.js doctor 2>&1 | tee .team/tasks/015-t15-v0-5-0-doctor-adc-source-quota-project-mismatch/runs/task-015-1777147332/verify-a.txt
# 期待: Warnings に [ADC_QUOTA_PROJECT_MISMATCH] kdg-context vs gen-lang-client-... が出る
```

### b. mismatch 解消後

実機で `gcloud auth application-default set-quota-project gen-lang-client-0451899685` を実行できる場合:

```bash
gcloud auth application-default set-quota-project gen-lang-client-0451899685
node dist/cli.js doctor 2>&1 | tee .team/tasks/.../verify-b.txt
# 期待: ADC_QUOTA_PROJECT_MISMATCH が出ない
gcloud auth application-default set-quota-project kdg-context  # 元に戻す
```

(b) は環境を破壊的に変更するため、Implementer 判断で **mock 代替可** (= unit test で「mismatch なし条件」をカバーすれば OK)。

### c. ADC_FILE_MISSING

```bash
GOOGLE_APPLICATION_CREDENTIALS=/tmp/nonexistent.json node dist/cli.js doctor 2>&1 | tee .team/tasks/.../verify-c.txt
# 期待: Warnings に [ADC_FILE_MISSING] が出る (+ 既存 [CREDS_FILE_MISSING] も並んで出る)
```

### d. JSON parse 可能 (camelCase で確定済み)

```bash
node dist/cli.js doctor --json | jq .adcSource | tee .team/tasks/.../verify-d.txt
# 期待: 構造化された adcSource オブジェクトが parse される。jq exit 0
node dist/cli.js doctor --json | jq -e '.adcSource.resolved | inside(["env","default","cloudsdk-config","metadata-server","unknown"])'
# 期待: exit 0
```

> **★ I2 確定**: `adcSource` (camelCase) で確定。`jq .adc_source` ではない。

実行ログを `.team/tasks/.../runs/.../verify-{a,b,c,d}.txt` として残し、PR コメントにも貼る。

---

## 7. リスク・落とし穴

| # | リスク | 対策 |
|---|---|---|
| R1 | secret leak (`private_key` 等が出力に混入) | `parseAdcMeta` が **新しいオブジェクトに詰め替える** 設計にして、source object のフィールドが accidentally serialize されることを構造的に防ぐ。さらに § 5.5 の `LEAK_CANARY_*` regex assert で機械的に保証 |
| R2 | ADC JSON が malformed | `readJsonAsync` 内で try/catch → `null` を返す。`parseAdcMeta` も unknown shape に耐性 |
| R3 | ADC JSON が巨大 (e.g. log file が誤指定) | `maxJsonBytes = 1 MB` 上限。`stat().size` を見て超過なら read しない (`meta = null`) |
| R4 | `GOOGLE_APPLICATION_CREDENTIALS` が directory を指す | `statAsync` の `isFile` を見て `false` なら `exists: false` (R-rec-3、`fileInfo` 内で実施) |
| R5 | `gcloud` 未インストール / active account なし | `runGcloud` の既存挙動 (両方 `undefined`) を踏襲。`accountError = 'gcloud unavailable or no active account'` で一本化 (I4) |
| R6 | metadata server probe で本番 instance を spam | デフォルトで probe しない。`--probe-metadata-server` 明示時のみ。1 リクエスト × 300ms timeout で抑制 |
| R7 | macOS / Linux / Windows path 差異 | `platform` を deps 注入可能にして 3 パターンの unit test を書く |
| R8 | Cloud Run 上で `K_SERVICE` 立ってるが metadata server unreachable (= サービス側でブロック) | `probed: true` + `probeOk: false` で正直に表示。warning は出さない (heuristic ヒットだけで上位レイヤを煩わせない) |
| R9 | ~~`adcSource` vs `adc_source` の命名~~ | **解消**: § 3.1 / § 3.4 で **camelCase (`adcSource`) に Planner 確定** (I2) |
| R10 | T14 既存テスト 30 本が破壊 | `baseOpts` に `adcSourceResolver: async () => MINIMAL_ADC_SOURCE_STUB` を 1 行追加するだけで全 pass する設計 |
| R11 | `ADC_FILE_MISSING` と `CREDS_FILE_MISSING` の重複 (consumer の duplicate handling) | CHANGELOG Notes に明記。v1.0 で `CREDS_FILE_MISSING` を deprecate するロードマップを記載 (R-rec-7) |
| R12 | ~~`plugin.json` に version field がない~~ | **解消**: 実ファイル line 3 に `"version": "0.4.0"` 既存 (I1)。Step 9 で値を `0.5.0` に更新するだけ |
| R13 | `gcloud auth list` の出力が複数行 | `defaultGcloudActiveAccountFetcher` で最初の 1 行のみ採用 (R-rec-5) |
| R14 | テスト実行が 1 マシンに依存 (`os.homedir()` 等) | 必ず `homeDir` 等を deps で注入 |
| R15 | `defaultMetadataServerProbe` を unit test で誤って呼ぶ | deps で必ず stub。実装側のデフォルト関数は network を触るが unit test では一切呼ばれないことを規約化 |
| R16 | `DoctorEnv` 拡張で既存 `baseEnv` (テスト) が TS error | optional field の追加なので破壊的でない。既存テストの `baseEnv` は無修正で通る |

---

## 8. 後方互換

- JSON schema 名は `nanobanana-adc-doctor/v1` のまま。これは additive change のみで satisfied
- 既存フィールド (`cli`, `authRoute`, `apiKey`, `adc`, `gcpEnv`, `model`, `warnings`, `fatal`, `verbose`) を一切削除 / rename しない
- 新フィールド `adcSource` (camelCase) はトップレベルに **追加のみ**
- 既存 7 warning コードはそのまま発火条件も変えない (`CREDS_FILE_MISSING` は新規 `ADC_FILE_MISSING` と並列で残す。CHANGELOG に deprecation roadmap)
- text 出力は append-only (新セクションを `Model` の前に挿入。順序は変えるが、既存セクションの中身は変えない)
- `--verbose` で出る `verbose.gcloudAccount` (= `gcloud config get-value account`) は維持。新フィールド `adcSource.account` (= `gcloud auth list --filter=status:ACTIVE`) と併存
- `DoctorEnv` への 5 key 追加は optional のため破壊的でない
- T14 既存テスト 30 本は全 pass を CI で必須

---

## 9. version 同期 — **4 箇所**

| file | 現値 | 新値 | 検出方法 |
|---|---|---|---|
| `package.json` | `"version": "0.4.0"` | `"0.5.0"` | `node -p "require('./package.json').version"` |
| `.claude-plugin/plugin.json` | `"version": "0.4.0"` (line 3、既存) | `"0.5.0"` | `node -p "require('./.claude-plugin/plugin.json').version"` |
| `.claude-plugin/marketplace.json` | `plugins[0].version: "0.4.0"` | `"0.5.0"` | `node -p "require('./.claude-plugin/marketplace.json').plugins.find(p => p.name === 'nanobanana-adc').version"` |
| `src/cli.ts` (× 2 同一行外) | `const CLI_VERSION = '0.4.0';` および `.version('0.4.0')` | 両方 `'0.5.0'` | grep `CLI_VERSION` / `\.version\(` |

CI `validate-plugin` (`.github/workflows/ci.yml` line 40-65) は **既に 4 way 比較が機能している** ため、Implementer は値を書き換えるだけで通る。手元の確認:

```bash
PKG=$(node -p "require('./package.json').version")
PLUGIN=$(node -p "require('./.claude-plugin/plugin.json').version")
MARKET=$(node -p "require('./.claude-plugin/marketplace.json').plugins.find(p => p.name === 'nanobanana-adc').version")
CLI=$(grep -oE "\.version\('([^']+)'\)" src/cli.ts | sed -E "s/.*'([^']+)'.*/\1/")
echo "$PKG / $PLUGIN / $MARKET / $CLI"  # 期待: 0.5.0 / 0.5.0 / 0.5.0 / 0.5.0
```

`src/doctor.test.ts` の `FAKE_VERSION` (= test 内固定値) は CI 同期検査の対象外。差分最小のため **更新しない**。

> **★ I1 修正サマリ**: 旧 plan は plugin.json に version 欠落と誤認していたが、実ファイル line 3 には既に存在する。同期箇所は 4 (5 ではない)。CI 側の bug 調査・user 確認は不要。

---

## 10. スコープ外の確認

タスク文の「スコープ外」項目を本 PR で **触らない**:

- WIF (Workload Identity Federation) の deep parse — `external_account` の `audience` / `subject_token_type` 等の解析は今回しない
- service account impersonation chain の追跡 — `impersonated_service_account` の `source_credentials` を再帰的に辿らない (type だけ表示)
- リリース作業 (`/release 0.5.0`) — 別タスクとして起票。本 PR は CHANGELOG entry を書くまで
- Claude Code plugin 側の状態診断 — `.claude/plugins/cache/...` の整合性チェック等はしない

これら 4 点の deferred は CHANGELOG `Notes` に「Out of scope: WIF deep parse, impersonation chain following — tracked for a future release.」と明記。

---

## 11. Implementer への引き継ぎノート

1. **JSON 命名は camelCase で確定** (`adcSource` / `quotaProjectId` / `clientId` / `clientEmail` / `envCredentials` / `defaultLocation` / `cloudsdkConfig` / `metadataServer` / `envHeuristic` / `probeOk` / `probeError` / `accountError`)。タスク文の `adc_source` (snake_case) は採用しない。受け入れ基準 11.d の `jq` コマンドも `.adcSource` で実行する。**user 確認不要**
2. **`plugin.json` の version は既存** (line 3 に `"version": "0.4.0"`)。Step 9 で値を `0.5.0` に書き換えるだけ。**user 確認不要、CI 調査不要**
3. **`DoctorEnv` 拡張**: 5 key (`K_SERVICE` / `GAE_APPLICATION` / `KUBERNETES_SERVICE_HOST` / `CLOUD_BUILD_BUILDID` / `CLOUDSDK_CONFIG`) を optional string で追加。`cli.ts` 側で `process.env` から 9 key を組み立てる。`resolveAdcSource` 内では `process.env` 直読みを **しない** (deps 注入の方針と矛盾するため)
4. **`account` resolution の挙動**: `gcloud` 不在 / 空 / throw すべて `accountError = 'gcloud unavailable or no active account'` で一本化。文言を変えないこと
5. TDD 順序は § 4 のステップ通りに 1→11 で進める (1 ステップ = 1 commit)
6. テストは `node --test --import tsx src/doctor.test.ts` で random 順実行されるので、test 同士が `process.env` を共有する場合は finally で必ず restore
7. `defaultMetadataServerProbe` の network コードは **unit test で一切呼ばない**。動作確認 (§ 6) も Cloud Run 環境がない場合は skip 可
8. § 6 動作確認 (a) は実環境 (kdg-context vs gen-lang-client-...) で必須。(b) は判断可、(c)(d) は CI / 開発機で必須
9. secret leak 検査 (§ 5.5) では **`LEAK_CANARY_*` 文字列の各個別 assert** を必ず入れる (R-rec-2)。regex 1 本では取りこぼし得る

以上。
