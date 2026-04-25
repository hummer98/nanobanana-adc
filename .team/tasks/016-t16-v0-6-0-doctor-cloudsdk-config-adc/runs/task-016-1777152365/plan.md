# T16 plan.md — v0.6.0 doctor の CLOUDSDK_CONFIG 対応と ADC 探索アルゴリズム正規化

- Task: 016 / surface:103
- Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-016-1777152365`
- Branch: `task-016-1777152365/task`
- Base: `7d29ac8` (T15 / v0.5.0 archived)

## 0. ゴールの再確認

T15 で導入した `resolveAdcSource` を `google-auth-library` の実動作 (CLOUDSDK_CONFIG が set のとき OS default を一切見ない) に揃える。あわせて CLOUDSDK_CONFIG を「gcloud 設定 dir 全体の override」として doctor の独立セクションで露出する。schema 名 `nanobanana-adc-doctor/v1` は維持し、v0.5 consumer を壊さない。secrets masking / leak canary は厳守する。

リリース作業は T16 のスコープ外（タスク本文 §「スコープ外」）。本タスクは plan.md 出力のみで完結する。

---

## 1. 設計判断: 案 a vs 案 b

| 観点 | 案 a (`default` 再定義) | 案 b (新 kind `effective-default`) |
|---|---|---|
| `adcSource.kind` 値 | `default` 維持。意味だけ「effective default = CLOUDSDK_CONFIG override or OS default」に変更。`cloudsdk-config` は v1 では出力しない (deprecated reserved) | `effective-default` を新設。`default` / `cloudsdk-config` は v0.6 では出力しない (deprecated reserved) |
| v0.5 consumer (`if kind === 'default'`) | **動作継続**。値は引き続き `default` | **壊れる**。`'default'` を期待する分岐に当たらない |
| v0.5 consumer (`if kind === 'cloudsdk-config'`) | 二度と当たらない (v0.5 でも実機ではほぼ未到達のレアパス) | 二度と当たらない (同上) |
| 「effective default」という名前の自明性 | △ (`default` の意味がドキュメント次第) | ◎ (kind 自体が説明的) |
| schema 仕様の安定性 | ◎ (kind の値集合が縮小、仕様反例ゼロ) | ○ (新 kind 1 個追加、deprecated 2 個記録) |
| README migration note の必要量 | 小 (「`default` の path は CLOUDSDK_CONFIG override により変動する」だけ) | 中 (`default` / `cloudsdk-config` → `effective-default` の対応表) |

**採用: 案 a** (タスク本文の推奨に同意)。

理由:
1. v0.5 の現実の consumer は「`if kind === 'default'`」だけ書いているケースが圧倒的に多い (CHANGELOG 0.5.0 でも `default` を主役として説明している)。これを動かさないのが最も低コストな互換性維持。
2. `cloudsdk-config` kind は v0.5 でも「CLOUDSDK_CONFIG が set かつそのパスに ADC が存在する」極めて狭い条件下でしか当たらず、本番の consumer 分岐に書かれている可能性は低い。v0.6 で生成停止しても破壊的影響は実質ない。
3. `effective-default` という新 kind を追加するより、`default` の semantics を「effective default」に寄せるほうが kind 集合のエントロピーが下がる。今後 `external_account` の同等概念が出ても kind を増やさずに済む。
4. summary.md にこの決定根拠を貼る (タスク本文 §2 案 a の要件)。

### 1.1 text 表示文字列の裁定 (Design Review M1)

JSON の `adcSource.resolved` (= kind 値) は案 a に従い `'default'` のままだが、text renderer の `resolved:` 行はユーザビリティのため次の表現を採用する:

> `resolved: default (effective default)`

これは Design Review §M1 の選択肢 **C** に相当する。選定理由:

1. **JSON kind と text を「乖離」させない**: 選択肢 B (text のみ `effective-default`) は JSON consumer と text 読者の語彙が完全に分かれてしまい、CLI 出力を見ながらドキュメントの JSON 例を当たる利用者が混乱する。
2. **タスク本文 §4 の例 (`effective-default`) との橋渡し**: 純粋な選択肢 A (text も `default` のみ) ではタスク本文の意図 (「effective default である」と読み手に分かる) が失われるが、C なら括弧書きで意味を補強できる。
3. **案 a の趣旨 (kind 集合エントロピー最小化) を破らない**: 表示は派生情報なので、JSON schema には影響しない。
4. **CHANGELOG / README への反映**: §8.3 CHANGELOG `Changed` の `ADC source` text 段落と §4.3 / §8.1-8.2 README migration note に「text 表示は `default (effective default)` と表記する」と明記する。

この裁定は §6.3 の after 例に反映し、test #83b で assert する (§7.4 参照)。

**TypeScript の `AdcSourceKind` 型** は v0.6 で次のとおり再定義する:

```ts
// kind の値集合は v0.5 から変更しない (型レベル後方互換)。
// ただし 'cloudsdk-config' は v0.6 では runtime で生成しない。
// JSDoc に @deprecated を付け、v1.0 で型からも削除する予告コメントを残す。
export type AdcSourceKind =
  | 'env'
  | 'default'              // v0.6+: "effective default" — path is CLOUDSDK_CONFIG/<file> if set, else $HOME/.config/gcloud/<file>
  | 'cloudsdk-config'      // @deprecated v0.6: never produced; kept in type for v1 schema compat. Removed in v2.
  | 'metadata-server'
  | 'unknown';
```

`AdcSourceReport.cloudsdkConfig?: AdcSourceFileInfo | null` も同様に **生成しない** (常に `undefined` で omit) + JSDoc に `@deprecated` を付ける。consumer が `report.adcSource.cloudsdkConfig` を読んだ場合は `undefined` (= JSON 上は absent) になる。

---

## 2. `resolveAdcSource` の新シグネチャ・フロー

### 2.1 シグネチャ

外部シグネチャは現状維持 (`(env, opts, deps) => Promise<AdcSourceReport>`)。`AdcSourceReport` のフィールド集合が変わるが追加と「事実上 omit」のみ。

```ts
export interface AdcSourceReport {
  resolved: AdcSourceKind;
  envCredentials: AdcSourceFileInfo | null;
  effectiveDefault: AdcSourceFileInfo;          // ★ 新規 (always present)
  defaultLocation: AdcSourceFileInfo;           // ★ deprecated alias of effectiveDefault, kept for schema compat
  cloudsdkConfig?: AdcSourceFileInfo | null;    // ★ v0.6 では常に omit (生成しない)
  metadataServer: { ... };                      // 不変
  meta: AdcSourceMeta | null;                   // 不変
  account?: string;                             // 不変
  accountError?: string;                        // 不変
}
```

`defaultLocation` を残すのは「v0.5 で `report.adcSource.defaultLocation.path` を直接読んでいた consumer」を救うため。ただし v0.6 では `defaultLocation === effectiveDefault` (同一オブジェクトを指す) と定義する。今後の deprecation 経路:
- v0.6.x: `defaultLocation` は `effectiveDefault` と同じ値で出力 (互換)
- v1.0: `defaultLocation` を削除、`effectiveDefault` のみ

### 2.2 解決順序の擬似コード

```text
function resolveAdcSource(env, opts, deps):
  envPath = env.GOOGLE_APPLICATION_CREDENTIALS
  envCredentials = envPath ? fileInfo(envPath) : null

  // ★ 新ロジック: effective default は CLOUDSDK_CONFIG の有無で 1 本に絞る
  if env.CLOUDSDK_CONFIG && env.CLOUDSDK_CONFIG.length > 0:
    effectivePath = join(env.CLOUDSDK_CONFIG, "application_default_credentials.json")
  elif platform == "win32":
    effectivePath = join(appDataDir(), "gcloud", "application_default_credentials.json")
  else:
    effectivePath = join(homeDir(), ".config", "gcloud", "application_default_credentials.json")
  effectiveDefault = fileInfo(effectivePath)

  envHeuristic = K_SERVICE | GAE_APPLICATION | KUBERNETES_SERVICE_HOST | CLOUD_BUILD_BUILDID | "none"

  // ★ resolved の優先順位: env → effective-default → metadata-server (heuristic) → unknown
  if envCredentials?.exists:
    resolved = 'env'
    picked = envCredentials
  elif effectiveDefault.exists:
    resolved = 'default'                  // 案 a: kind 値は 'default' のまま
    picked = effectiveDefault
  elif envHeuristic != 'none':
    resolved = 'metadata-server'
    picked = null
  else:
    resolved = 'unknown'
    picked = null

  meta = (picked?.exists && picked.size <= maxBytes)
    ? parseAdcMeta(readJson(picked.path, maxBytes))
    : null

  metadataServer = opts.probeMetadataServer
    ? { envHeuristic, probed: true, probeOk, probeError? }
    : { envHeuristic, probed: false }

  account = await gcloudActiveAccountFetcher() || undefined
  accountError = (account === undefined) ? "gcloud unavailable or no active account" : undefined

  return {
    resolved,
    envCredentials,
    effectiveDefault,
    defaultLocation: effectiveDefault,        // ★ alias
    // cloudsdkConfig: 生成しない (always omit)
    metadataServer,
    meta,
    account?,
    accountError?,
  }
```

差分の要点:
- `cloudsdkConfig` をどのケースでも `report` に含めない。`env.CLOUDSDK_CONFIG` の値そのものは別関数 `resolveGcloudConfigDir` の責務。
- `'cloudsdk-config'` を `resolved` に代入することはない。
- T15 で「envCredentials が exists=false でも resolved='env' にしない」分岐は維持 (envCredentials.exists を見るのは同じ)。
- T15 の `picked?.exists && size <= maxBytes` ガードと `parseAdcMeta` 呼び出しはそのまま (secrets masking 仕様の根拠)。

---

## 3. `resolveGcloudConfigDir` (新規関数) の仕様

### 3.1 型

```ts
export type GcloudConfigDirSource = 'env-cloudsdk-config' | 'default';

export interface GcloudConfigDirEntry {
  // best-effort presence. 'unreadable' は stat 自体が EACCES などで失敗した場合。
  state: 'exists' | 'missing' | 'unreadable';
  // configurations/ のような directory 形式のとき、エントリ数を best-effort で出す。
  // ファイル形式または stat 失敗時は undefined。
  entries?: number;
}

export interface GcloudConfigDirReport {
  resolved: string;             // absolute path of gcloud config dir
  source: GcloudConfigDirSource;
  presence: {
    activeConfig: GcloudConfigDirEntry;                    // active_config (file)
    configurations: GcloudConfigDirEntry;                  // configurations/ (dir)
    credentialsDb: GcloudConfigDirEntry;                   // credentials.db (file)
    accessTokensDb: GcloudConfigDirEntry;                  // access_tokens.db (file)
    applicationDefaultCredentialsJson: GcloudConfigDirEntry; // application_default_credentials.json (file)
    legacyCredentials: GcloudConfigDirEntry;               // legacy_credentials/ (dir)
  };
  // CLOUDSDK_CONFIG override の note。default のときは undefined。
  note?: string;
}

export interface ResolveGcloudConfigDirDeps {
  statAsync?: (path: string) => Promise<{ size: number; mtimeMs: number; isFile: boolean; isDirectory: boolean } | null>;
  readDirCount?: (path: string) => Promise<number | null>; // null = 読み取り不可
  homeDir?: () => string;
  appDataDir?: () => string | undefined;
  platform?: NodeJS.Platform;
}

export async function resolveGcloudConfigDir(
  env: DoctorEnv,
  deps?: ResolveGcloudConfigDirDeps,
): Promise<GcloudConfigDirReport>;
```

### 3.2 フロー

```text
function resolveGcloudConfigDir(env, deps):
  if env.CLOUDSDK_CONFIG && env.CLOUDSDK_CONFIG.length > 0:
    resolved = env.CLOUDSDK_CONFIG
    source = 'env-cloudsdk-config'
    note = "overrides $HOME/.config/gcloud entirely; gcloud auth list / configurations / ADC are isolated from the OS default"
  elif platform == 'win32':
    resolved = join(appDataDir(), "gcloud")
    source = 'default'
    note = undefined
  else:
    resolved = join(homeDir(), ".config", "gcloud")
    source = 'default'
    note = undefined

  presence = {
    activeConfig:                  classify(stat(join(resolved, 'active_config')), kind='file'),
    configurations:                classify(stat(join(resolved, 'configurations')), kind='dir', countDirEntries=true),
    credentialsDb:                 classify(stat(join(resolved, 'credentials.db')), kind='file'),
    accessTokensDb:                classify(stat(join(resolved, 'access_tokens.db')), kind='file'),
    applicationDefaultCredentialsJson:
                                   classify(stat(join(resolved, 'application_default_credentials.json')), kind='file'),
    legacyCredentials:             classify(stat(join(resolved, 'legacy_credentials')), kind='dir'),
  }

  return { resolved, source, presence, note? }
```

### 3.3 `classify` の規約

| stat 結果 | kind=file 期待 | kind=dir 期待 |
|---|---|---|
| stat 例外 (EACCES など) | `unreadable` | `unreadable` |
| 存在しない (ENOENT → null) | `missing` | `missing` |
| isFile=true | `exists` | `unreadable` (種別違い) |
| isDirectory=true | `unreadable` (種別違い) | `exists` (countDirEntries=true なら `entries` 設定) |
| symlink to file/dir | 上に従う (デフォルト stat は follow) | 同左 |

ディレクトリエントリ数を取る `readDirCount` は EACCES でも例外を投げず `null` を返す。`null` のときは `entries` を omit する。

### 3.4 エラー処理 (タスク本文 §「注意」)

- `CLOUDSDK_CONFIG` が指す dir が存在しない → 各 presence は `missing` で埋まる。doctor は exit 0。
- `CLOUDSDK_CONFIG` が指す dir が EACCES → 各 presence は `unreadable`。doctor は exit 0。
- `homeDir()` が空文字を返す異常系 → presence は missing で埋まる (絶対パス計算は行うが stat は失敗)。doctor は exit 0。

---

## 4. JSON schema 変更

### 4.1 `nanobanana-adc-doctor/v1` の差分

```diff
 {
   "schema": "nanobanana-adc-doctor/v1",
   ...
   "adcSource": {
-    "resolved": "default" | "env" | "cloudsdk-config" | "metadata-server" | "unknown",
+    "resolved": "default" | "env" | "metadata-server" | "unknown",
     // ↑ 値集合は縮小 (型上は 'cloudsdk-config' を残すが v0.6+ では生成しない)。
     "envCredentials": { ... } | null,
+    "effectiveDefault": { "path", "exists", "size?", "mtimeMs?" },
     "defaultLocation": { "path", "exists", "size?", "mtimeMs?" },
     // ↑ v0.6+: effectiveDefault と同値 (alias)。v1.0 で削除予定。
-    "cloudsdkConfig"?: { ... } | null,
+    // cloudsdkConfig: v0.6+ では常に omit。型定義上の互換のみ残す。
     "metadataServer": { ... },
     "meta": { ... } | null,
     "account"?: string,
     "accountError"?: string
   },
+  "gcloudConfigDir": {
+    "resolved": "<absolute path>",
+    "source": "env-cloudsdk-config" | "default",
+    "presence": {
+      "activeConfig": { "state": "exists" | "missing" | "unreadable", "entries"?: number },
+      "configurations": { ... },
+      "credentialsDb": { ... },
+      "accessTokensDb": { ... },
+      "applicationDefaultCredentialsJson": { ... },
+      "legacyCredentials": { ... }
+    },
+    "note"?: string
+  },
   "warnings": [...],
   "fatal": ...
 }
```

### 4.2 互換性ルール

- schema 名 `nanobanana-adc-doctor/v1` 維持。**フィールド名の削除は行わない**。
- `adcSource.defaultLocation` は v0.6.x では `effectiveDefault` の alias として常に出力。v0.7 でも消さない (v1.0 まで温存)。
- `adcSource.cloudsdkConfig` は v0.6.x では常に omit。型上は残す。consumer が `report.adcSource.cloudsdkConfig` を読んだ場合は `undefined` (JSON では absent)。
- `adcSource.resolved` の値として `'cloudsdk-config'` は生成しない (型上は残す)。v0.5 で `cloudsdk-config` を期待していた分岐は v0.6 では到達せず、`'default'` 分岐に流れる (effective default が CLOUDSDK_CONFIG override されたパスを指すため意味的にも自然)。
- `gcloudConfigDir` は新規追加 (additive)。consumer は presence チェック (`obj.gcloudConfigDir === undefined`) を強制されない (v0.6+ では常に存在)。
- camelCase 厳守 (T15 と同じ規約)。`active_config` のようなファイル名フィールドは presence のキーとしては `activeConfig` に変換する。

### 4.3 README migration note (案 a の補足)

> `adcSource.resolved === 'default'` の意味が v0.6 から変わっています: v0.5 では「OS default のパスにファイルがある」だったのが、v0.6 では「effective default (CLOUDSDK_CONFIG が set ならそのパス、それ以外は OS default) にファイルがある」になりました。実際のパスは `adcSource.effectiveDefault.path` (または互換の `adcSource.defaultLocation.path`) を読んでください。`adcSource.resolved === 'cloudsdk-config'` は v0.6 で生成停止しています。

---

## 5. 新 warning `CLOUDSDK_CONFIG_OVERRIDE`

### 5.1 仕様

```ts
export type DoctorWarningCode =
  | 'NO_AUTH_AVAILABLE'
  | 'GEMINI_API_KEY_SHADOWS_ADC'
  | 'LOCATION_NOT_GLOBAL'
  | 'LOCATION_MISSING'
  | 'CREDS_FILE_MISSING'
  | 'USE_VERTEXAI_NOT_TRUE'
  | 'API_KEY_FORMAT_SUSPECT'
  | 'ADC_QUOTA_PROJECT_MISMATCH'
  | 'ADC_FILE_MISSING'
  | 'ADC_TYPE_UNUSUAL'
  | 'CLOUDSDK_CONFIG_OVERRIDE';   // ★ 追加
```

```ts
export function warnCloudsdkConfigOverride(ctx: WarnCtx): DoctorWarning | null {
  const v = ctx.env.CLOUDSDK_CONFIG;
  if (!v || v.length === 0) return null;
  return {
    code: 'CLOUDSDK_CONFIG_OVERRIDE',
    severity: 'info',
    message:
      `gcloud config directory is overridden to \`${v}\` via CLOUDSDK_CONFIG; ` +
      `gcloud auth / configurations / ADC are isolated from $HOME/.config/gcloud.`,
  };
}
```

`computeWarnings` の `fns` 配列末尾に `warnCloudsdkConfigOverride` を追加。順序は info を後ろに寄せる現在の慣習に合わせる。

### 5.2 既存 warning との関係

- `ADC_FILE_MISSING`: 「`GOOGLE_APPLICATION_CREDENTIALS` が指す path が存在しない」のロジックは不変 (envCredentials.exists === false で発火)。effective default 自体が missing のときに新 warning は導入しない (タスク本文 §6 で「`ADC_FILE_MISSING` 系の warning が出るかは仕様判断」と明記)。**結論: 出さない**。理由:
  - `effective default` が missing でも、metadata server (Cloud Run など) で動くケースで誤発火する。
  - existing `NO_AUTH_AVAILABLE` (fatal) が「ADC probe ok=false かつ api key なし」で既にカバーしている。
  - 必要なら follow-up タスクで `EFFECTIVE_DEFAULT_MISSING` を `info` で追加検討。
- `CREDS_FILE_MISSING`: T15 の deprecation roadmap (v1.0 で削除) を維持。並列発火の挙動も不変。
- `ADC_QUOTA_PROJECT_MISMATCH` / `ADC_TYPE_UNUSUAL` / `GEMINI_API_KEY_SHADOWS_ADC` / `LOCATION_NOT_GLOBAL` / `LOCATION_MISSING` / `USE_VERTEXAI_NOT_TRUE` / `API_KEY_FORMAT_SUSPECT` / `NO_AUTH_AVAILABLE`: 全て不変。

---

## 6. text renderer 変更

### 6.1 セクション順序 (差分)

```
nanobanana-adc doctor

CLI
Auth route
API key
ADC
GCP env
Gcloud config dir          ← ★ 新セクション (ADC source の直前)
ADC source                 ← 簡素化 (default location 行 / CLOUDSDK_CONFIG path 行を削除)
Model
Warnings (N)
Verbose (--verbose のみ)
```

### 6.2 `Gcloud config dir` セクションの整形

CLOUDSDK_CONFIG 設定時:

```
Gcloud config dir
  resolved:                         /Users/yamamoto/git/KDG-lab/.config/gcloud
  source:                           env CLOUDSDK_CONFIG
  presence:
    active_config:                  exists
    configurations/:                exists (3 entries)
    credentials.db:                 exists
    access_tokens.db:               exists
    application_default_credentials.json: exists
    legacy_credentials/:            missing
  note:                             overrides $HOME/.config/gcloud entirely; gcloud auth / configurations / ADC are isolated from the OS default
```

CLOUDSDK_CONFIG 未設定時 (note 省略):

```
Gcloud config dir
  resolved:                         /home/user/.config/gcloud
  source:                           default ($HOME/.config/gcloud)
  presence:
    active_config:                  exists
    configurations/:                exists (1 entry)
    credentials.db:                 exists
    access_tokens.db:               exists
    application_default_credentials.json: exists
    legacy_credentials/:            missing
```

実装ヘルパ:

```ts
function renderGcloudPresenceLine(label: string, e: GcloudConfigDirEntry): string {
  if (e.state === 'exists' && e.entries !== undefined) {
    const word = e.entries === 1 ? 'entry' : 'entries';
    return kv(`  ${label}`, `exists (${e.entries} ${word})`);   // 4-space indent + kv
  }
  return kv(`  ${label}`, e.state);
}
```

`presence` 配下は 4-space (KV indent + 2-space nest) で揃える。`KV_WIDTH=34` の枠は維持。

### 6.3 `ADC source` セクションの差分

before (v0.5):
```
ADC source
  resolved:                         default
  env GOOGLE_APPLICATION_CREDENTIALS: (unset)
  default location:                 /home/user/.config/gcloud/application_default_credentials.json   (exists, 2400 B, ...)
  CLOUDSDK_CONFIG path:             (unset)
  metadata server:                  not probed (no GCE/Cloud Run env detected)
  type:                             authorized_user
  ...
```

after (v0.6):
```
ADC source
  resolved:                         default (effective default)   (env GOOGLE_APPLICATION_CREDENTIALS unset)
  env GOOGLE_APPLICATION_CREDENTIALS: (unset)
  effective default:                /home/user/.config/gcloud/application_default_credentials.json   (exists, 2400 B, ...)
  metadata server:                  not probed (no GCE/Cloud Run env detected)
  type:                             authorized_user
  ...
```

要点:
- §1.1 の裁定に従い、`resolved:` 値の文字列は **`default (effective default)`** とする (JSON 側の kind は `'default'` のまま)。 `kind === 'default'` のときのみ `(effective default)` を付ける。`env` / `metadata-server` / `unknown` は素の文字列を出す。
- `default location` 行と `CLOUDSDK_CONFIG path` 行を削除し、`effective default` 1 行に置き換え。
- `resolved` 行末の envCredentials 状態の補足 (`(env GOOGLE_APPLICATION_CREDENTIALS unset)` / `(env GOOGLE_APPLICATION_CREDENTIALS=/x/y, exists)`) は採用する。テスト #60 は `quotaProjectId:` `clientId:` `me@x` のみを assert しており、`resolved` 行の文字列には依存しないので衝突しない。
- effective default の path が CLOUDSDK_CONFIG override かどうかは `Gcloud config dir` の `source:` で判別する (重複表示しない)。

text renderer 実装の擬似コード:
```ts
function renderResolvedKind(kind: AdcSourceKind): string {
  return kind === 'default' ? 'default (effective default)' : kind;
}
```

---

## 7. テスト計画 (TDD: 先に追加 → 実装で通す)

`src/doctor.test.ts` に番号 70 番台で追加。既存テスト番号 1〜69 は維持。

### 7.1 `resolveAdcSource` ロジック (5 ケース)

| # | 名前 | 入力 | 期待 |
|---|---|---|---|
| 70 | `resolveAdcSource: CLOUDSDK_CONFIG set + ADC exists at that path → resolved=default, effectiveDefault.path under CLOUDSDK_CONFIG` | env={CLOUDSDK_CONFIG:'/cs'}, statAsync は `/cs/application_default_credentials.json` のみ exists | `resolved==='default'`, `effectiveDefault.path==='/cs/application_default_credentials.json'`, `effectiveDefault.exists===true`, `defaultLocation === effectiveDefault`, report に `cloudsdkConfig` キー無し |
| 71 | `resolveAdcSource: CLOUDSDK_CONFIG set + ADC missing → resolved=unknown, effectiveDefault.exists=false` | env={CLOUDSDK_CONFIG:'/cs'}, statAsync は常に null, envHeuristic 無し | `resolved==='unknown'`, `effectiveDefault.path==='/cs/application_default_credentials.json'`, `effectiveDefault.exists===false`, `meta===null` |
| 72 | `resolveAdcSource: CLOUDSDK_CONFIG unset → effectiveDefault uses $HOME/.config/gcloud` | env={}, homeDir='/home/u', platform='linux', statAsync が default path で exists | `effectiveDefault.path==='/home/u/.config/gcloud/application_default_credentials.json'`, `resolved==='default'` |
| 73 | `resolveAdcSource: GOOGLE_APPLICATION_CREDENTIALS wins over CLOUDSDK_CONFIG` | env={GOOGLE_APPLICATION_CREDENTIALS:'/env/sa.json', CLOUDSDK_CONFIG:'/cs'}, statAsync は両方 exists | `resolved==='env'`, `picked` は envCredentials, `effectiveDefault.path==='/cs/application_default_credentials.json'` (情報として残る), `defaultLocation === effectiveDefault` |
| 74 | `resolveAdcSource: CLOUDSDK_CONFIG empty string is treated as unset` | env={CLOUDSDK_CONFIG:''}, homeDir='/home/u' | `effectiveDefault.path` は OS default の `/home/u/.config/gcloud/...` |

### 7.2 `resolveGcloudConfigDir` (4 ケース)

| # | 名前 | 入力 | 期待 |
|---|---|---|---|
| 75 | `resolveGcloudConfigDir: CLOUDSDK_CONFIG set + all files present` | env={CLOUDSDK_CONFIG:'/cs'}, statAsync 各 path で適切な isFile/isDirectory, readDirCount→3 | `resolved==='/cs'`, `source==='env-cloudsdk-config'`, `presence.activeConfig.state==='exists'`, `presence.configurations.state==='exists'`, `presence.configurations.entries===3`, note 文字列に "overrides" を含む |
| 76 | `resolveGcloudConfigDir: CLOUDSDK_CONFIG set + dir does not exist (all stat null)` | env={CLOUDSDK_CONFIG:'/cs'}, statAsync 全 null | 全 presence が `missing`, throw しない, note 出力あり |
| 77 | `resolveGcloudConfigDir: CLOUDSDK_CONFIG unset → source=default, no note` | env={}, homeDir='/home/u', statAsync 適当に exists | `resolved==='/home/u/.config/gcloud'`, `source==='default'`, `note===undefined` |
| 78 | `resolveGcloudConfigDir: stat throws (EACCES) → state=unreadable, no throw` | env={CLOUDSDK_CONFIG:'/cs'}, statAsync が rejection を返す deps を注入 | 該当 presence が `unreadable`, doctor は throw しない |

### 7.3 warning (2 ケース)

| # | 名前 | 入力 | 期待 |
|---|---|---|---|
| 79 | `warnCloudsdkConfigOverride: CLOUDSDK_CONFIG set → info warning fires` | env={CLOUDSDK_CONFIG:'/cs', GEMINI_API_KEY:GOOD_KEY} で buildDoctorReport | `warnings` に `code==='CLOUDSDK_CONFIG_OVERRIDE'`, severity `info`, message に '/cs' を含む |
| 79b | `GAC + CLOUDSDK_CONFIG 同時 set: resolved=env かつ CLOUDSDK_CONFIG_OVERRIDE warning も発火` (Design Review §M2 / タスク本文 §6 第 4 ケース) | env={GOOGLE_APPLICATION_CREDENTIALS:'/env/sa.json', CLOUDSDK_CONFIG:'/cs', GOOGLE_CLOUD_LOCATION:'global'} で buildDoctorReport, adcSourceResolver は `resolved:'env'` + envCredentials.exists=true を返す stub | `report.adcSource.resolved==='env'` AND `report.warnings.map(w => w.code).includes('CLOUDSDK_CONFIG_OVERRIDE')===true` (env が勝っても override warning は同時発火) |
| 80 | `warnCloudsdkConfigOverride: CLOUDSDK_CONFIG unset → not fired` | env={GEMINI_API_KEY:GOOD_KEY} | `codes.includes('CLOUDSDK_CONFIG_OVERRIDE')===false` |

#79b 擬似コード (実装は Phase 3 で行う):

```ts
test('79b. GAC set + CLOUDSDK_CONFIG set → resolved=env AND CLOUDSDK_CONFIG_OVERRIDE warning fires', async () => {
  const report = await buildDoctorReport({
    env: {
      GOOGLE_APPLICATION_CREDENTIALS: '/env/sa.json',
      CLOUDSDK_CONFIG: '/cs',
      GOOGLE_CLOUD_LOCATION: 'global',
    },
    adcSourceResolver: async () =>
      adcSourceStub({
        resolved: 'env',
        envCredentials: { path: '/env/sa.json', exists: true, size: 200 },
      }),
  });
  expect(report.adcSource.resolved).toBe('env');
  expect(report.warnings.map((w) => w.code)).toContain('CLOUDSDK_CONFIG_OVERRIDE');
});
```

### 7.4 schema / renderer (3 ケース)

| # | 名前 | 期待 |
|---|---|---|
| 81 | `JSON renderer includes gcloudConfigDir (camelCase)` | `parsed.gcloudConfigDir.source` が `'env-cloudsdk-config' | 'default'`, `parsed.gcloudConfigDir.presence.activeConfig.state` 存在, `gcloud_config_dir` という snake_case が含まれない |
| 82 | `text renderer includes "Gcloud config dir" section header` | `text.match(/Gcloud config dir/)`, `text.match(/source:/)`, CLOUDSDK_CONFIG set のとき `text.match(/note:.*overrides/)` |
| 83 | `text renderer: ADC source no longer prints "default location" or "CLOUDSDK_CONFIG path" rows` | `text.doesNotMatch(/default location:/)`, `text.doesNotMatch(/CLOUDSDK_CONFIG path:/)`, `text.match(/effective default:/)` |
| 83b | `text renderer: resolved 行は kind==='default' のとき "default (effective default)" と表示する` (Design Review §M1 / §1.1 裁定) | adcSourceResolver stub で `resolved:'default'` を返す → `text.match(/^\s*resolved:\s+default \(effective default\)/m)`. 別途 `resolved:'env'` の stub では `text.match(/^\s*resolved:\s+env(\s|$)/m)` (素の `env` のまま、括弧書きが付かないことも assert)。JSON 側は不変で `parsed.adcSource.resolved === 'default'` のまま。 |

### 7.5 secrets / leak canary 維持 (1 ケース、既存 #62 を参照しつつ新ケースを追加)

| # | 名前 | 期待 |
|---|---|---|
| 84 | `LEAK_CANARY: secrets never appear when CLOUDSDK_CONFIG is set + service_account ADC at that path (verbose included)` | resolveAdcSource を CLOUDSDK_CONFIG=/cs + service_account JSON (private_key/refresh_token/private_key_id を含む) で実行し buildDoctorReport → JSON / text / verbose のいずれにも `LEAK_CANARY_*` / `private_key` / `refresh_token` / `private_key_id` / `-----BEGIN PRIVATE KEY-----` が出ない。`gcloudConfigDir` セクションも同様にチェック (CLOUDSDK_CONFIG path 自体は exposed されてよい — secret ではない) |

合計 17 ケース追加 (#70–#74 5 件 + #75–#78 4 件 + #79, #79b, #80 3 件 + #81, #82, #83, #83b 4 件 + #84 1 件)。タスク本文の「最低 6 ケース」を十分に満たす。

### 7.6 既存テストへの影響

- `#58` `report.adcSource is populated from adcSourceResolver result`: stub の型に `effectiveDefault` 必須化が必要。既存 `defaultLocation` を流用し、`effectiveDefault: defaultLocation` を追加するヘルパに修正。
- `#60` `text renderer includes "ADC source" section header`: `default location:` 行が無くなるので、その文字列に依存していないか確認 (現状は `quotaProjectId:` `clientId:` `me@x` のみ assert。問題なし)。
- `#62` LEAK_CANARY: 既存のまま通過することを CI で確認 (regression)。
- `#67` resolveAdcSource が `gcloudActiveAccountFetcher` を受け取るシグネチャは不変。

`adcSourceStub` ヘルパ (test 内のローカル util) を更新:
```ts
function adcSourceStub(overrides: Partial<AdcSourceReport> = {}): AdcSourceReport {
  const ed = overrides.effectiveDefault ?? overrides.defaultLocation ?? { path: '/home/u/.config/gcloud/application_default_credentials.json', exists: false };
  return {
    resolved: 'unknown',
    envCredentials: null,
    effectiveDefault: ed,
    defaultLocation: ed,                    // alias
    metadataServer: { envHeuristic: 'none', probed: false },
    meta: null,
    ...overrides,
  };
}
```

---

## 8. ドキュメント変更

### 8.1 README.md

- L153–162 (`ADC source` ブロックの例) を新セクション例に置換。`Gcloud config dir` セクション例を追加 (CLOUDSDK_CONFIG unset / set の 2 例を併記し、片方は `<details>` で折りたたみ)。
- L172 周辺の warning 表に `CLOUDSDK_CONFIG_OVERRIDE` 行追加:

  ```md
  | `CLOUDSDK_CONFIG_OVERRIDE` | `info` | `CLOUDSDK_CONFIG` is set; gcloud auth / configurations / ADC are isolated from $HOME/.config/gcloud. |
  ```
- L188 の `jq .adcSource` 例の隣に `jq .gcloudConfigDir` 例を追加。
- 「Migration from v0.5」サブセクションを 1 つ追加 (案 a の README migration note を貼る)。

### 8.2 README.ja.md

- L154 周辺の `ADC source` 例を新セクションに差し替え (英語版と同じ)。
- L212 周辺の warning 対訳表に `CLOUDSDK_CONFIG_OVERRIDE` 行追加 (日本語訳: 「`CLOUDSDK_CONFIG` が set されています。gcloud auth / configurations / ADC は `$HOME/.config/gcloud` から分離されています」)。
- 「v0.5 からの移行」節を追加 (英語版 migration note の対訳)。

### 8.3 CHANGELOG.md draft `[0.6.0]`

```md
## [0.6.0] - 2026-04-2X

### Added
- `Gcloud config dir` section in `nanobanana-adc doctor` text output and
  corresponding `gcloudConfigDir` object in JSON output. Surfaces the resolved
  gcloud config directory (`$CLOUDSDK_CONFIG` or `$HOME/.config/gcloud`),
  its source (`env-cloudsdk-config` / `default`), and best-effort presence of
  six well-known files/dirs (`active_config`, `configurations/`,
  `credentials.db`, `access_tokens.db`,
  `application_default_credentials.json`, `legacy_credentials/`). Read failures
  surface as `unreadable` rather than crashing the doctor.
- `CLOUDSDK_CONFIG_OVERRIDE` warning (severity `info`): fires when
  `CLOUDSDK_CONFIG` is set, indicating that the entire gcloud config dir
  (auth list, configurations, ADC) is isolated from the OS default.
- `adcSource.effectiveDefault`: the single ADC default location after
  resolving `CLOUDSDK_CONFIG` overrides.

### Changed
- `resolveAdcSource` algorithm aligned with `google-auth-library` (and
  python-genai / other GCP SDKs). When `CLOUDSDK_CONFIG` is set, the OS
  default `$HOME/.config/gcloud/application_default_credentials.json` is no
  longer consulted — only `$CLOUDSDK_CONFIG/application_default_credentials.json`
  is. Resolution order is now: `env` (`GOOGLE_APPLICATION_CREDENTIALS`) →
  `default` (effective default per CLOUDSDK_CONFIG) → `metadata-server`
  (heuristic) → `unknown`.
- `adcSource.resolved === 'default'` semantics: now means "ADC found at the
  *effective* default location" (CLOUDSDK_CONFIG-aware). The actual path is in
  `adcSource.effectiveDefault.path`.
- `ADC source` text section simplified: the `default location` and
  `CLOUDSDK_CONFIG path` rows are replaced by a single `effective default` row.

### Deprecated
- `adcSource.resolved === 'cloudsdk-config'` is no longer produced (the kind
  value remains in the type for v1 schema compatibility and will be removed in
  v2).
- `adcSource.cloudsdkConfig` is no longer populated in JSON output (always
  omitted). The dir-level information now lives under the new top-level
  `gcloudConfigDir`. Will be removed in v1.0.
- `adcSource.defaultLocation` is kept as an alias of `effectiveDefault` for
  v0.6.x consumers. Will be removed in v1.0; new consumers should read
  `effectiveDefault`.

### Notes
- Schema name remains `nanobanana-adc-doctor/v1`. No fields are deleted.
- Secret-handling guarantees (T15): `parseAdcMeta` continues to copy only
  safe fields; `private_key` / `private_key_id` / `refresh_token` are never
  surfaced. The `LEAK_CANARY_*` regression test in `doctor.test.ts` is
  extended to cover `CLOUDSDK_CONFIG`-overridden ADC paths.
```

---

## 9. バージョン同期 (4 箇所)

Design Review §M3 の指摘に従い、`.claude-plugin/plugin.json` L3 に **既に `"version": "0.5.0"` が存在する**事実を反映した表に修正:

| ファイル | 行 | 現在値 | 変更後 |
|---|---|---|---|
| `package.json` | L3 `"version": "0.5.0"` | `0.5.0` | `0.6.0` |
| `.claude-plugin/plugin.json` | L3 `"version": "0.5.0"` | `0.5.0` | `0.6.0` |
| `.claude-plugin/marketplace.json` | L15 `"version": "0.5.0"` | `0.5.0` | `0.6.0` |
| `src/cli.ts` | L19 `const CLI_VERSION = '0.5.0';` / L24 `.version('0.5.0');` | `0.5.0` | 両方 `0.6.0` |

CI の `validate-plugin` ジョブ (`.github/workflows/ci.yml` L40〜L65) は `require('./.claude-plugin/plugin.json').version` を取り、`package.json` のそれと一致しないと exit 1 で失敗するため、`.claude-plugin/plugin.json` L3 の更新は **必須**。

CI の grep ルールに関する補足 (実装者向け):
- `.version('...')` (commander) は厳密チェック対象。`src/cli.ts` L24 の引数が `package.json` と等しいか確認される。
- `CLI_VERSION` constant 自体は厳密チェック外だが、L19 で定義され L119 の `version: CLI_VERSION` 経由で実 CLI の `--version` 出力に効くので、`.version(CLI_VERSION)` への置換でない限り両方更新が必要。

実装時に以下で漏れチェック:
```bash
grep -rn '"0\.5\.0"' --include='*.json'
grep -n "0\.5\.0" src/cli.ts
grep -rn "0\.5\.0" .claude-plugin/
```
4 箇所すべてが `0.6.0` に変わっており、それ以外の `0.5.0` 文字列は CHANGELOG の history 部分のみであることを確認する。

---

## 10. 実装順序 (TDD)

1. **テスト追加 (failing)**:
   1. `src/doctor.test.ts` にテスト #70–#74 (`resolveAdcSource` 5 ケース) を追加。
   2. `src/doctor.test.ts` にテスト #75–#78 (`resolveGcloudConfigDir` 4 ケース) を追加 (関数 export を要するため import 行に `resolveGcloudConfigDir` を追記して RED にする)。
   3. テスト #79–#80 (`CLOUDSDK_CONFIG_OVERRIDE` warning) を追加。
   4. テスト #81–#83 (renderer / schema) を追加。
   5. テスト #84 (LEAK_CANARY 拡張) を追加。
   6. `npm test` を実行し、全部 RED であることを確認 (既存 #1–#69 は GREEN のまま)。
2. **型定義の変更**:
   1. `AdcSourceReport` に `effectiveDefault` を追加 (required)、`defaultLocation` を JSDoc `@deprecated` に。`cloudsdkConfig` フィールドの JSDoc を `@deprecated` に。
   2. `AdcSourceKind` の `'cloudsdk-config'` に `@deprecated` JSDoc を付ける (型からは削除しない)。
   3. `GcloudConfigDirReport` / `GcloudConfigDirEntry` / `GcloudConfigDirSource` / `ResolveGcloudConfigDirDeps` を新規追加。
   4. `DoctorWarningCode` に `'CLOUDSDK_CONFIG_OVERRIDE'` を追加。
   5. `DoctorReport` に `gcloudConfigDir: GcloudConfigDirReport` を追加。
   6. `DoctorOptions` に `gcloudConfigDirResolver?: (env, deps?) => Promise<GcloudConfigDirReport>` を追加 (テストから注入可能に)。
3. **`resolveAdcSource` 実装変更**: §2.2 の擬似コードに置換。`cloudsdkConfig` を report に含めない。`defaultLocation` は `effectiveDefault` と同じ `AdcSourceFileInfo` を入れる。`#70–#74` を GREEN に。
4. **`resolveGcloudConfigDir` 新規実装**: §3.2 の擬似コード。`defaultStatAsync` を再利用 (`isDirectory` 情報を返すよう `fsStat` から拡張)。`defaultReadDirCount` を新規追加 (`fs.promises.readdir(path)` の length, EACCES で null)。`#75–#78` を GREEN に。
5. **`computeWarnings` 変更**: `warnCloudsdkConfigOverride` を fns 末尾に追加。`#79–#80` を GREEN に。
6. **`buildDoctorReport` 変更**: `opts.gcloudConfigDirResolver ?? resolveGcloudConfigDir` を呼び report の `gcloudConfigDir` に差し込む。
7. **renderer 変更**:
   1. `renderDoctorJSON` は構造変更なし (JSON.stringify が新フィールドをそのまま出す)。`#81` を GREEN に。
   2. `renderDoctorText` に `Gcloud config dir` セクション (§6.2) を追加。`ADC source` の `default location` / `CLOUDSDK_CONFIG path` 行を削除し `effective default` 1 行に統合。`#82–#83` を GREEN に。
8. **LEAK_CANARY 拡張**: テスト #84 を GREEN に。`gcloudConfigDir.resolved` に CLOUDSDK_CONFIG path がそのまま入ることは secrets ではないので明示的に許容 (テスト assertion でも除外)。
9. **バージョン同期** (§9): 4 箇所を `0.6.0` に書き換え。`npm run build` / `npm run typecheck` / `npm test` を実行。
10. **ドキュメント更新** (§8.1, §8.2): README.md / README.ja.md の doctor 出力例 / warning 表 / migration note。
11. **CHANGELOG draft 反映**: §8.3 を `CHANGELOG.md` の冒頭 (T15 [0.5.0] の上) に追記。日付は確定時に置換。
12. **動作確認 4 パターン** (タスク本文 §9): summary.md に貼る。
    - a. `unset CLOUDSDK_CONFIG; nanobanana-adc doctor` → `Gcloud config dir source: default ($HOME/.config/gcloud)`, no `CLOUDSDK_CONFIG_OVERRIDE`.
    - b. `CLOUDSDK_CONFIG=/tmp/empty-gcloud-dir nanobanana-adc doctor` → presence 各行が `missing`, override warning 発火.
    - c. `CLOUDSDK_CONFIG=$HOME/git/KDG-lab/.config/gcloud nanobanana-adc doctor` → `effective default` が KDG-lab 配下、override warning、ADC type/quota が KDG-lab JSON のもの.
    - d. `nanobanana-adc doctor --json | jq '{gcloudConfigDir, adcSource}'` で両セクションを抽出して貼る.
13. **secrets masking 最終確認**: `npm test -- --grep LEAK_CANARY` (or 該当テストを単発実行) と、4 パターンの実機出力を `grep -E 'private_key|refresh_token|private_key_id|-----BEGIN PRIVATE KEY-----'` で空であることを確認。
14. **conductor-role.md の close 手順** に従い merge or PR。

---

## 11. リスクと対応

| リスク | 影響 | 対応 |
|---|---|---|
| `defaultLocation` を deprecated にしたが v0.5 consumer がフィールドの**意味**を「OS default 限定」と仮定していた | semantic 変更でユーザの判断ロジックが破綻 | README migration note + CHANGELOG Deprecated セクションで明記。意味変更は **breaking change** と認識した上で minor バンプ (v0.6.0) を選択 (タスク本文の前提) |
| `cloudsdkConfig` JSON フィールドを omit したことで JSON consumer が `obj.cloudsdkConfig.path` で `TypeError: Cannot read property 'path' of undefined` | runtime エラー | T15 で既に「`obj.cloudsdkConfig === undefined` を test しろ」と CHANGELOG に書いている (T15 [0.5.0] Notes 参照)。準拠していなかった consumer は v0.5 でも壊れていた可能性が高い。改めて README に書く |
| `resolveGcloudConfigDir` が `readdir` で大量エントリのある CLOUDSDK_CONFIG dir を走査して遅延 | doctor が遅くなる | `readDirCount` 用の `readdir` は `configurations/` 1 箇所のみ。エントリ数だけ取る (内容は読まない)。EACCES で null を返す |
| Windows での `appDataDir` (`process.env.APPDATA`) が undefined の環境 | `effectiveDefault.path` が `undefined\\gcloud\\...` になる | T15 と同じくフォールバックは現状不在 (T15 のままの挙動)。本タスクスコープでは扱わない (out-of-scope の Windows 対応) |
| 4 箇所 (`package.json` / `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` / `src/cli.ts`) の version 文字列のうち 1 箇所を更新し忘れる | CI `validate-plugin` が exit 1、または CLI `--version` 出力が古い | §9 の表に従い 4 箇所一括更新で確実に同期。`grep -rn '"0\.5\.0"' --include='*.json'` と `grep -n "0\.5\.0" src/cli.ts` を実装後に流して残存ゼロを確認。`.claude-plugin/plugin.json` L3 にも `version` フィールドは既に存在するので新規追加ではなく値の置換のみ |

---

## 12. secrets masking / leak canary の維持 (明示)

タスク本文 §「注意」「完了条件」より、以下を本タスクで**保証する**:

1. `parseAdcMeta` は変更しない (T15 で確立した「fresh object に safe field のみコピー」方針を維持)。
2. `gcloudConfigDir.presence` は **stat 情報のみ** を持つ。ファイル内容を読まない (`readDirCount` は `readdir` でファイル**名**は取得するが、`presence.configurations.entries` には**件数のみ**を保存する。ファイル名そのものは破棄)。
3. `gcloudConfigDir.resolved` は CLOUDSDK_CONFIG / $HOME のパス文字列。これは secret ではないが、テストでは LEAK_CANARY パターンと衝突しないことを assert で明示 (LEAK_CANARY canary に絶対パスを混入させない)。
4. 既存の `LEAK_CANARY` regression test (#62) は無変更で通過することを CI で確認。新規 #84 で「CLOUDSDK_CONFIG override + service_account ADC」シナリオでも canary が漏れないことを追加保証。
5. `--verbose` 出力でも secrets を出さない: `report.verbose` には `tokenPrefix` / `gcloudAccount` / `gcloudProject` / `gcloudAdcFilePath` / `nodeVersion` / `platform` のみで、`gcloudConfigDir.presence` は通常の non-verbose 出力にも出るため verbose 専用の追加開示は無し。
6. doctor の text/JSON 双方で `private_key` / `private_key_id` / `refresh_token` という **キー名**も**値**も surface させない (#62, #84 がこれを assert)。

完了条件:
- 上記 1〜6 を満たす実装を行うことを plan に明記済み (本セクション)。
- TDD 順序 §10 step 1.5, step 8 で leak canary テストを先に追加し、実装が決して secrets を漏らさないことを RED → GREEN で保証する。
