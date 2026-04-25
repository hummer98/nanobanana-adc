# T14 — v0.4.0 `nanobanana-adc doctor` サブコマンド追加 実装計画 (rev 2)

作成日: 2026-04-25
改訂日: 2026-04-25（Design Review の Changes Requested を反映）
対象 worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659`
ブランチ: `task-014-1777063659/task`
planner: T14 計画書

---

## 1. ゴールと成功条件

### 1.1 ゴール

環境・認証状態を 1 コマンドで自己診断できる `nanobanana-adc doctor` を v0.4.0 として追加する。CLAUDE.md の invariant —
"ADC is the primary axis" / "Fail loudly on auth ambiguity" / "Region-less host for `location=global`"
— をユーザー自身が実行時に検査できる公式手段になる。

### 1.2 成功条件 checklist

- [ ] `nanobanana-adc --prompt ...` が従来通り動く（後方互換ゼロ破壊）
- [ ] `nanobanana-adc doctor` がテキスト出力する
- [ ] `nanobanana-adc doctor --json` が parseable な JSON を出力する
- [ ] `nanobanana-adc doctor --verbose` が ACCESS_TOKEN 先頭 8 文字と gcloud 設定・ランタイム情報を含む `verbose` block を追加する（§4.1 参照）
- [ ] `nanobanana-adc --help` に `generate` / `doctor` が両方並ぶ
- [ ] 7 パターンの warning が期待どおり発火する（§5）
- [ ] マスキング規則が守られる（API key = prefix6+len, ADC token 非出力, creds ファイル非 open）
- [ ] ADC 成功時は `adc.account` と `adc.project` が report に載る（取得できた場合のみ。fail-open）
- [ ] `npm run typecheck` / `npm run build` / `npm test` が通る
- [ ] `doctor.ts` の unit test が新規追加され、`node --test --import tsx src/doctor.test.ts` が通る
- [ ] CI の `validate-plugin` ジョブが通る（4 箇所の version が `0.4.0` で揃う）
- [ ] `README.md` / `README.ja.md` / `CLAUDE.md` / `CHANGELOG.md` を更新
- [ ] 3 環境パターン（§8）の実行結果を `.team/tasks/014-t14-v0-4-0-nanobanana-adc-doctor/runs/task-014-1777063659/summary.md` に貼る
- [ ] summary.md に「exit code を常に 0 に倒した理由」「`--verbose` は CI transcript / デモ録画には向かない」を明記

### 1.3 スコープ外（再確認）

- `/release 0.4.0` 本体（T14 完了後、別タスク）
- Claude Code 側 plugin state 検査（`claude plugin list` との突き合わせ）
- 実モデル API call（課金発生を回避）
- `CLI_VERSION_STALE` warning（`npm view` 呼び出し）— §9.3 で v0.4.0 不採用を決定、v0.5.0 以降の拡張ポイントとして CHANGELOG Notes に記す

---

## 2. アーキテクチャ判断

### 2.1 commander のサブコマンド化戦略

**採用案: `program.command('generate', { isDefault: true }).action(...)` + `program.command('doctor').action(...)`**

| 候補 | 後方互換 | help の見え方 | 判定 |
|------|---------|--------------|------|
| A. `program` 直に `.action()` を足し、`program.command('doctor')` を並置 | ○ (既存のまま) | `doctor` が表示されるが `generate` は "(default)" 扱いされず視認性が落ちる | △ |
| **B. `program.command('generate', { isDefault: true }).action(...)` + `program.command('doctor').action(...)`** | ○ (isDefault=true により `--prompt` を program に渡せば generate に routing) | `generate`/`doctor` の 2 行が並ぶ、`generate` に `[default]` マーカー | **◎（採用）** |
| C. `program.action()` + `program.command('doctor')` | ○ | `doctor` だけ表示される (generate 側の option が program 直なので見やすい) | ○ だが help 体裁が非対称 |

**採用理由 (B):**

1. 既存 `program.requiredOption('--prompt')` のように program に直接オプションを付けていた構造を、`generate` サブコマンドに一式移すことで **doctor 呼び出し時に `--prompt` required が誤爆しない**。これは案 C より明確に安全。
2. `isDefault: true` により `nanobanana-adc --prompt foo ...` は commander が `generate` サブコマンドに routing する。後方互換 ✓。
3. help 表示で `generate` / `doctor` が同じ階層に並び、"1 binary 2 subcommands" の意図が使用者に見える。
4. 将来 `edit` / `inpaint` などを追加する際の素直な拡張点になる。

**実装メモ:**

```ts
// src/cli.ts (要点)
const program = new Command()
  .name('nanobanana-adc')
  .description('Gemini 3 Pro Image CLI with ADC support')
  .version('0.4.0');

program
  .command('generate', { isDefault: true })
  .description('Generate an image (default)')
  .requiredOption('-p, --prompt <text>', 'prompt text (required)')
  // ... 既存 option を全部ここへ ...
  .action(async (opts) => { /* generate() を呼ぶ */ });

program
  .command('doctor')
  .description('Diagnose auth / env state')
  .option('--json', 'emit machine-readable JSON')
  .option('-v, --verbose', 'include debug fields (ACCESS_TOKEN prefix, gcloud raw, etc.)')
  .action(async (opts) => { /* runDoctor() を呼ぶ */ });

await program.parseAsync(process.argv);
```

### 2.2 `src/doctor.ts` の公開 API（3 分割）

テスト容易性を最優先し、**環境読取／レポート構築／レンダリング** を分離する。

```ts
// src/doctor.ts
export interface DoctorEnv {
  GEMINI_API_KEY?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_GENAI_USE_VERTEXAI?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
}

export interface DoctorOptions {
  apiKeyFlag?: string;        // --api-key 相当（内部用。cli.ts の doctor action では現状渡さない）
  verbose: boolean;
  argv1: string;              // process.argv[1]
  version: string;            // CLI version (package.json から)
  adcProbe?: () => Promise<AdcProbeResult>;   // テストで差替え可能
  credsFileExists?: (path: string) => boolean; // テストで差替え可能
  gcloudAccountFetcher?: () => Promise<string | undefined>;  // verbose & ADC 時に呼ぶ
  gcloudProjectFetcher?: () => Promise<string | undefined>;  // verbose & ADC 時に呼ぶ
  gcloudAdcFilePathFetcher?: () => Promise<string | undefined>;
  nowMs?: () => number;
}

export interface AdcProbeResult {
  ok: boolean;
  tokenPrefix?: string;   // 先頭 8 文字（--verbose 時のみ DoctorReport に載せる）
  account?: string;       // ADC principal（client.getCredentials() の client_email / principal）
  project?: string;       // gcloud config get-value project / GOOGLE_CLOUD_PROJECT fallback
  error?: string;         // 失敗理由（GoogleAuth の Error.message）
}

export async function buildDoctorReport(
  env: DoctorEnv,
  opts: DoctorOptions,
): Promise<DoctorReport>;   // 副作用なし、戻り値だけ

export function renderDoctorText(report: DoctorReport): string;
export function renderDoctorJSON(report: DoctorReport): string;  // JSON.stringify(report, null, 2)

// 内部 function（test から importable）
export function resolveAuthRoute(env: DoctorEnv, apiKeyFlag?: string): DoctorReport['authRoute'];
export function computeWarnings(ctx: { env: DoctorEnv; apiKey: DoctorReport['apiKey']; adc: DoctorReport['adc']; credsExists: boolean | null }): DoctorWarning[];
export function maskApiKey(key: string | undefined): DoctorReport['apiKey'];
export function classifyInstallMethod(argv1: string): DoctorReport['cli']['installMethod'];
```

`cli.ts` の doctor action は薄く:

```ts
const env = process.env as DoctorEnv;
const report = await buildDoctorReport(env, {
  verbose: !!opts.verbose,
  argv1: process.argv[1] ?? '',
  version: CLI_VERSION,
});
process.stdout.write(
  opts.json ? renderDoctorJSON(report) + '\n' : renderDoctorText(report),
);
```

**`DoctorOptions.apiKeyFlag` について:** doctor サブコマンドは現状 `--api-key` を受け取らない。しかし `resolveAuthRoute()` は `auth.ts::resolveAuth()` と同じ優先順位を実装するので、将来 `doctor --api-key` を増やす時に備えて引数は残す。これにより §7.1 test 22（`apiKeyFlag='X'` 指定ケース）は **内部 API 純度** として意味を持つ。cli.ts の doctor action には常に undefined を渡す旨をコメントで明記する。

### 2.3 ADC 疎通確認の責務分離

`src/auth.ts::resolveAuth()` は **一切触らない**（成功時に `console.log('[auth] using: ...')` を出す副作用があり、doctor では邪魔）。

doctor は独立に `GoogleAuth` を使う:

```ts
async function defaultAdcProbe(): Promise<AdcProbeResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 5000);
  timeoutHandle.unref();   // §9.1 の resource leak 対策（後述）
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    // AbortSignal を渡して metadata server 打鍵も cancel 可能にする
    const tokenResp = await client.getAccessToken();
    const token = typeof tokenResp === 'string' ? tokenResp : tokenResp?.token;
    if (!token) return { ok: false, error: 'no token returned' };

    // account / project は fail-open で集める（失敗は undefined）
    let account: string | undefined;
    let project: string | undefined;
    try {
      const creds = await client.getCredentials();
      account = (creds as { client_email?: string; principal?: string }).client_email
             ?? (creds as { principal?: string }).principal;
    } catch { /* noop */ }
    try {
      project = (await auth.getProjectId()) ?? process.env.GOOGLE_CLOUD_PROJECT;
    } catch {
      project = process.env.GOOGLE_CLOUD_PROJECT;
    }

    return {
      ok: true,
      tokenPrefix: token.slice(0, 8),
      account,
      project,
    };
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, error: 'timeout (5s)' };
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
```

テストでは `opts.adcProbe` を fake に差し替え、実際の `GoogleAuth` を呼ばない。fake には「ok + account/project あり」「ok + account/project なし（gcloud 未導入想定）」「fail（timeout）」「throw」の 4 パターンを用意して §7.1 で検証する。

**precedence 二重実装の整合性:** `resolveAuth()`（auth.ts）と `resolveAuthRoute()`（doctor.ts）は同じ優先順位ロジックを持つ。将来 auth.ts 側が変わっても doctor が silent に乖離しないよう、**integration test を 1 本** 入れる（§7.1 test 26）。同一 env を両方に与え、`resolveAuth().mode` と `resolveAuthRoute(env).selected` が一致することを確認する。ADC 経路は `resolveAuth` が実ネットワーク呼ぶので対象外とし、`--api-key` flag / `GEMINI_API_KEY` env の 2 パターンに絞る。

### 2.4 マスキング関数（純関数として切り出し）

```ts
export function maskApiKey(key: string | undefined): {
  present: boolean;
  prefix?: string;   // 先頭 6 文字
  length?: number;
  looksValid?: boolean;  // /^AIza/.test(key)
} {
  if (!key) return { present: false };       // 空文字列も present: false として扱う
  return {
    present: true,
    prefix: key.slice(0, 6),
    length: key.length,
    looksValid: /^AIza/.test(key),
  };
}
```

**空文字列の扱い:** `!key` は `''` を falsy にするので `{ present: false }` を返す。「env が空文字 export されている」ケースの誤検出を避ける。test 1 に明記。

---

### 2.5 exit code の設計判断

**採用: 「常に exit 0」**

**理由:**

1. タスク本文 受け入れ基準 §4 が "機械 parse しやすさ優先" を primary に挙げており、shell pipeline から `jq` で `.fatal` を読める方が誤爆しにくい。
2. ADC 失敗は一過性（ネットワーク一時断、trusted proxy 経由、プロビジョニング直後の env 未整備）のことがあり、exit 1 を返すと CI が機械的に落ちてしまう。doctor は **情報を出すだけの tool** であって gate ではない。
3. `exit 1` 運用をしたくなったユーザーは `nanobanana-adc doctor --json | jq -e '.fatal | not'` で gating できる（JSON が authoritative）。
4. `brew doctor` や `gcloud info` など先行事例も **診断出力＝exit 0** が主流。"fatal でも exit 0" の違和感は doctor 特有の設計哲学として summary で明記する。

例外: doctor 自身が crash（環境読めない、GoogleAuth module load 失敗など想定外）は catch せず exit 1 を通常の Node プロセス終了として通す（`cli.ts` 最上段の `.catch(...)` で）。

---

## 3. ファイル変更計画

### 3.1 新規

| ファイル | 内容 | サイズ目安 |
|---------|------|-----------|
| `src/doctor.ts` | DoctorEnv / DoctorReport / buildDoctorReport / renderDoctorText / renderDoctorJSON / maskApiKey / resolveAuthRoute / computeWarnings / defaultAdcProbe / classifyInstallMethod | 260-340 行 |
| `src/doctor.test.ts` | 環境変数パターン別 warning、`--json` schema、install method 判定、masking、precedence 整合性、account/project 有無、timeout / throw 耐性 | 220-320 行 |

### 3.2 変更

| ファイル | 変更内容 |
|---------|---------|
| `src/cli.ts` | program → `.command('generate', { isDefault: true })` へ移設、`.command('doctor')` 追加、`.version('0.3.0')` → `'0.4.0'` |
| `package.json` | `"version": "0.3.0"` → `"0.4.0"`、`"scripts.test"` に `src/doctor.test.ts` を追加 |
| `.claude-plugin/plugin.json` | `"version": "0.3.0"` → `"0.4.0"` に更新（※既に version フィールドは存在する。新規追加ではない） |
| `.claude-plugin/marketplace.json` | `plugins[0].version` を `0.3.0` → `0.4.0` に |
| `CHANGELOG.md` | `[0.4.0] - 2026-04-25` セクションを冒頭に追加（Added: doctor サブコマンド、--json、--verbose。Notes: 後方互換維持／exit code は常に 0／`--verbose` は CI transcript・デモ録画には向かない／`CLI_VERSION_STALE` は v0.5.0 以降の拡張ポイント） |
| `README.md` | `## Usage` 配下に `### Diagnostics (doctor)` を追加、出力例 1 つ、`--json` 例 1 つ、`--verbose` 注意書き |
| `README.ja.md` | 同上（日本語版）。warning code は英語のまま残し、各 code に**対訳の短い注釈を日本語で付ける**方針（例: `LOCATION_NOT_GLOBAL — location が global ではありません`）。JSON schema 互換性を保つため code 文字列は不変。 |
| `CLAUDE.md` | "ファイル責務" 表に `src/doctor.ts` 行を追加 |

### 3.3 手を触れない

- `src/auth.ts`, `src/generate.ts`, `src/png.ts`, `bin/nanobanana-adc`, `tsconfig.json`, `.github/workflows/*`
- `src/generate.test.ts`, `src/png.test.ts`

---

## 4. DoctorReport 型スキーマ

### 4.1 TypeScript 型

```ts
export interface DoctorReport {
  schema: 'nanobanana-adc-doctor/v1';
  generatedAt: string;              // ISO8601
  cli: {
    path: string;                   // argv[1] resolved
    version: string;                // '0.4.0'
    installMethod: 'claude-plugin' | 'npm-global' | 'source' | 'unknown';
  };
  authRoute: {
    selected: 'api-key-flag' | 'api-key-env' | 'adc' | 'none';
    reason: string;                 // 'GEMINI_API_KEY set', 'ADC fallback', ...
  };
  apiKey: {
    present: boolean;
    prefix?: string;                // 'AIzaSy'
    length?: number;                // 39
    looksValid?: boolean;           // /^AIza/
  };
  adc: {
    probed: boolean;
    ok?: boolean;
    account?: string;               // ADC principal（成功時のみ、fail-open）
    project?: string;               // gcloud config get-value project / GOOGLE_CLOUD_PROJECT fallback
    tokenPrefix?: string;           // verbose 時のみ
    error?: string;                 // 失敗時のみ
  };
  gcpEnv: {
    GOOGLE_CLOUD_PROJECT: string | null;
    GOOGLE_CLOUD_LOCATION: string | null;
    GOOGLE_GENAI_USE_VERTEXAI: string | null;
    GOOGLE_APPLICATION_CREDENTIALS: {
      path: string | null;
      exists: boolean | null;       // path が null なら null、非 null なら fs.existsSync 結果
    };
  };
  model: {
    default: 'gemini-3-pro-image-preview';
    note: 'requires GOOGLE_CLOUD_LOCATION=global on the ADC path';
  };
  warnings: DoctorWarning[];
  fatal: boolean;                   // 認証経路ゼロのとき true
  verbose?: {
    tokenPrefix?: string;           // adc.tokenPrefix と同値（発見性のため二重掲示）
    gcloudAccount?: string;         // `gcloud config get-value account` 相当
    gcloudProject?: string;         // `gcloud config get-value project` 相当
    gcloudAdcFilePath?: string;     // ~/.config/gcloud/application_default_credentials.json の実在パス
    nodeVersion?: string;           // process.version
    platform?: string;              // `${process.platform}-${process.arch}`
  };
}

export interface DoctorWarning {
  code:
    | 'NO_AUTH_AVAILABLE'
    | 'GEMINI_API_KEY_SHADOWS_ADC'
    | 'LOCATION_NOT_GLOBAL'
    | 'LOCATION_MISSING'
    | 'CREDS_FILE_MISSING'
    | 'USE_VERTEXAI_NOT_TRUE'
    | 'API_KEY_FORMAT_SUSPECT';
  severity: 'info' | 'warn' | 'fatal';
  message: string;
}
```

**`verbose` field の運用:**

- `DoctorOptions.verbose === false` のとき `report.verbose` は `undefined`（JSON では key ごと省略）
- `--verbose` true のときのみ gcloud fetcher を呼ぶ（`gcloud` が PATH に無ければ各 field が undefined で fail-open）
- README / summary に「`--verbose` は CI transcript / デモ録画には向かない」注意書きを必ず入れる（`gcloudAccount` に他テナント email が含まれることがあるため）
- API key 関連は `apiKey.prefix` + `apiKey.length` のみで、`--verbose` でも raw を出さない

### 4.2 マスキング適用後の snapshot 例

```json
{
  "schema": "nanobanana-adc-doctor/v1",
  "generatedAt": "2026-04-25T09:12:34.567Z",
  "cli": {
    "path": "/Users/yamamoto/.claude/plugins/cache/hummer98-nanobanana-adc/nanobanana-adc/dist/cli.js",
    "version": "0.4.0",
    "installMethod": "claude-plugin"
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
    "account": "user@example.com",
    "project": "my-gcp-proj"
  },
  "gcpEnv": {
    "GOOGLE_CLOUD_PROJECT": "my-gcp-proj",
    "GOOGLE_CLOUD_LOCATION": "us-central1",
    "GOOGLE_GENAI_USE_VERTEXAI": "true",
    "GOOGLE_APPLICATION_CREDENTIALS": { "path": null, "exists": null }
  },
  "model": {
    "default": "gemini-3-pro-image-preview",
    "note": "requires GOOGLE_CLOUD_LOCATION=global on the ADC path"
  },
  "warnings": [
    {
      "code": "LOCATION_NOT_GLOBAL",
      "severity": "warn",
      "message": "GOOGLE_CLOUD_LOCATION=us-central1 — Gemini 3 Pro Image is served only at 'global'. Set GOOGLE_CLOUD_LOCATION=global."
    },
    {
      "code": "GEMINI_API_KEY_SHADOWS_ADC",
      "severity": "info",
      "message": "GEMINI_API_KEY is set, so the AI Studio path will be preferred over ADC. Unset GEMINI_API_KEY (e.g. `env -u GEMINI_API_KEY`) to force ADC."
    }
  ],
  "fatal": false
}
```

### 4.3 テキスト出力サンプル（モックアップ）

```
nanobanana-adc doctor

CLI
  path:           /Users/yamamoto/.claude/plugins/cache/.../dist/cli.js
  version:        0.4.0
  install:        claude-plugin

Auth route
  selected:       api-key-env  (GEMINI_API_KEY takes precedence over ADC)

API key
  present:        yes
  prefix:         AIzaSy…
  length:         39
  looks_valid:    yes

ADC
  probed:         yes
  status:         ok
  account:        user@example.com
  project:        my-gcp-proj

GCP env
  GOOGLE_CLOUD_PROJECT:             my-gcp-proj
  GOOGLE_CLOUD_LOCATION:             us-central1   ⚠ not 'global'
  GOOGLE_GENAI_USE_VERTEXAI:         true
  GOOGLE_APPLICATION_CREDENTIALS:    (unset)

Model
  default:        gemini-3-pro-image-preview
  note:           requires GOOGLE_CLOUD_LOCATION=global on the ADC path

Warnings (2)
  ⚠ [LOCATION_NOT_GLOBAL]     Set GOOGLE_CLOUD_LOCATION=global.
  ⓘ [GEMINI_API_KEY_SHADOWS_ADC] Unset GEMINI_API_KEY to force ADC.
```

`--verbose` 時は `ADC` セクション下に `token_prefix`、末尾に `Verbose`（gcloud raw / nodeVersion / platform）ブロックを追加する。

---

## 5. Warning ロジック

### 5.1 判定表

| # | code | condition | severity | message (抜粋) |
|---|------|-----------|----------|----------------|
| 1 | `NO_AUTH_AVAILABLE` | `GEMINI_API_KEY` 未設定 **かつ** (`GOOGLE_CLOUD_PROJECT` 未設定 **または** `GOOGLE_CLOUD_LOCATION` 未設定 **または** ADC probe fail) | **fatal** | "No usable auth route. Either set GEMINI_API_KEY or configure ADC (gcloud auth application-default login + GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION=global)." |
| 2 | `GEMINI_API_KEY_SHADOWS_ADC` | `GEMINI_API_KEY` 設定 **かつ** `GOOGLE_CLOUD_PROJECT` も設定（両方 set → ADC 経路も期待しているユーザー） | info | "GEMINI_API_KEY takes precedence. Use `env -u GEMINI_API_KEY nanobanana-adc ...` to force ADC." |
| 3 | `LOCATION_NOT_GLOBAL` | `GOOGLE_CLOUD_LOCATION` 設定 **かつ** `!== 'global'` | warn | "GOOGLE_CLOUD_LOCATION=<x>. Gemini 3 Pro Image is served only at 'global'." |
| 4 | `LOCATION_MISSING` | `GOOGLE_CLOUD_PROJECT` 設定 **かつ** `GOOGLE_CLOUD_LOCATION` 未設定 (ADC 経路を試すユーザーで欠落) | warn | "GOOGLE_CLOUD_LOCATION is unset. ADC path requires it (set to 'global')." |
| 5 | `CREDS_FILE_MISSING` | `GOOGLE_APPLICATION_CREDENTIALS` 設定 **かつ** ファイル存在せず | warn | "GOOGLE_APPLICATION_CREDENTIALS=<path>, but file does not exist." |
| 6 | `USE_VERTEXAI_NOT_TRUE` | `GOOGLE_GENAI_USE_VERTEXAI` 設定 **かつ** `!== 'true'` | warn | "GOOGLE_GENAI_USE_VERTEXAI=<x>. Set to 'true' for consistent SDK behavior." |
| 7 | `API_KEY_FORMAT_SUSPECT` | `GEMINI_API_KEY` 設定 **かつ** `/^AIza/` にマッチしない | warn | "GEMINI_API_KEY does not start with 'AIza' — likely invalid (the CLI will still attempt to use it)." |

**決定事項:**

- タスク本文 §4 の 7 パターンは上記 7 種類で確定。
- `CLI_VERSION_STALE`（`npm view` によるレジストリ死活監視）は **v0.4.0 では実装しない**（§9.3 で決定）。受け入れ基準 §4 の「最新 version と乖離」条件は v0.5.0 以降の拡張ポイントとして CHANGELOG の Notes に記す。
- `GEMINI_API_KEY` のみ set（`GOOGLE_CLOUD_PROJECT` 未設定）のケースは、「ユーザーが意図的に API key 経路のみを使っている」と解釈し `GEMINI_API_KEY_SHADOWS_ADC` は出さない（受け入れ基準 §4.b「`--api-key` 経路を期待していない場合の注意」への対応として、この条件判定を明示）。

### 5.2 Fatal と exit code の対応

| 状況 | `fatal` field | exit code |
|------|---------------|-----------|
| どんな warning でも | — | **0**（§2.5 の決定） |
| 認証経路ゼロ (`NO_AUTH_AVAILABLE`) | true | **0** |
| doctor 自身が throw | — | 1（cli.ts の最上段 catch） |

---

## 6. Install method 判別ロジック

入力: `process.argv[1]`（shebang dispatcher を通っているため `bin/nanobanana-adc` or `dist/cli.js` のいずれか）。

**疑似コード:**

```ts
import { realpathSync } from 'node:fs';
import { sep } from 'node:path';

export function classifyInstallMethod(
  argv1: string,
): DoctorReport['cli']['installMethod'] {
  if (!argv1) return 'unknown';         // Electron 埋め込み等で undefined/'' の場合
  let resolved: string;
  try {
    resolved = realpathSync(argv1);   // symlink 解決（npm global / claude-plugin の両方が symlink を挟む）
  } catch {
    resolved = argv1;                 // 存在しない path（テスト時）はそのまま使う
  }
  const normalized = resolved.split(sep).join('/');
  if (/\/\.claude\/plugins\//.test(normalized)) return 'claude-plugin';
  if (/\/node_modules\/nanobanana-adc\//.test(normalized)) return 'npm-global';
  if (/\/\.worktrees\/|\/git\/nanobanana-adc\//.test(normalized)) return 'source';
  return 'unknown';
}
```

**根拠:**

- Claude Code plugin は `~/.claude/plugins/cache/<owner>-<name>/<plugin>/dist/cli.js` を起動する → `claude-plugin`。
- `npm install -g` の場合、`/usr/local/bin/nanobanana-adc` → `/usr/local/lib/node_modules/nanobanana-adc/bin/nanobanana-adc` への symlink → `realpathSync` 後 `node_modules/nanobanana-adc/` を含む → `npm-global`。
- `tsx` で動かす開発時 (`source`) は worktree / リポルート直下を通る。
- いずれにも当てはまらなければ `unknown`。Windows は `sep` 正規化で forward slash に揃えた後に regex を当てる（best-effort。公式サポートは Unix 系のみ）。

---

## 7. TDD の順序

### 7.1 先に書くテスト (`src/doctor.test.ts`)

**テスト共通規約:**

- `buildDoctorReport` を呼ぶ全テストで `opts.nowMs = () => 0` を必ず渡し、`generatedAt` を固定する（snapshot fragility 回避）
- `cli.path` は機械ごとに変わるので、field 単位の assert のみ（snapshot 的 deep-equal は使わない）
- `opts.adcProbe` は fake を注入し、実 `GoogleAuth` は呼ばない

以下の順で `test()` ブロックを追加する。

**純関数:**

1. `maskApiKey: undefined → { present: false }`；`'' → { present: false }` も含む
2. `maskApiKey: 'AIzaSyABCDEFGHIJ...' (39 chars) → { present: true, prefix: 'AIzaSy', length: 39, looksValid: true }`
3. `maskApiKey: 'sk-abc...' → { ..., looksValid: false }`
4. `classifyInstallMethod: '/Users/x/.claude/plugins/cache/foo/dist/cli.js' → 'claude-plugin'`
5. `classifyInstallMethod: '/usr/local/lib/node_modules/nanobanana-adc/dist/cli.js' → 'npm-global'`
6. `classifyInstallMethod: '/Users/x/git/nanobanana-adc/dist/cli.js' → 'source'`
7. `classifyInstallMethod: '/random/path' → 'unknown'`；`''` → `'unknown'` も含む

**buildDoctorReport (env を直接渡して同期的に使える; adcProbe は fake を注入):**

8. API key only (GEMINI_API_KEY=AIza...39 文字): authRoute=`api-key-env`, warnings なし
9. API key + ADC both (env が full): warnings に `GEMINI_API_KEY_SHADOWS_ADC` が info で入る
10. ADC only, LOCATION=global: authRoute=`adc`, warnings なし
11. ADC only, LOCATION=us-central1: warnings に `LOCATION_NOT_GLOBAL`
12. ADC only, LOCATION 未設定: warnings に `LOCATION_MISSING`
13. API key が `looksValid: false` (sk-xxx): warnings に `API_KEY_FORMAT_SUSPECT`
14. USE_VERTEXAI=1: `USE_VERTEXAI_NOT_TRUE`
15. CREDS=/tmp/nonexistent + `credsFileExists: () => false`: `CREDS_FILE_MISSING`
16. 全 env 空 + adcProbe fail: `fatal: true`, warnings に `NO_AUTH_AVAILABLE`
17. ADC probe が ok かつ `verbose: true` → `report.adc.tokenPrefix` が 8 文字、かつ `report.verbose` が定義される
18. ADC probe が ok かつ `verbose: false` → `report.adc.tokenPrefix` は undefined、`report.verbose` も undefined
19. **ADC probe で account/project が返る（gcloud あり相当）**: `report.adc.account === 'user@example.com'` & `report.adc.project === 'my-proj'`
20. **ADC probe で account/project が undefined（gcloud なし相当）**: `report.adc.account === undefined` & `report.adc.project === undefined`（`ok: true` は維持）
21. **ADC probe timeout ケース**: fake probe に `() => new Promise(resolve => setTimeout(() => resolve({ok: false, error: 'timeout (5s)'}), 10))` 相当を渡し、`report.adc.ok === false` かつ `report.adc.error.includes('timeout')`
22. **ADC probe が throw してもクラッシュしない**: fake probe `() => { throw new Error('boom') }` → `buildDoctorReport` が throw せず `report.adc.ok === false`, `report.adc.error === 'boom'` を返す（defaultAdcProbe の catch を明示的に呼び側でも防御する）

**renderer:**

23. `renderDoctorJSON(report)` を JSON.parse したら schema=`nanobanana-adc-doctor/v1`
24. `renderDoctorText(report)` が `Warnings (N)` 行と `⚠` / `ⓘ` マーカーを含む
25. `renderDoctorJSON` 出力に ACCESS_TOKEN 本体が **含まれない** ことを検証（fake probe で `tokenPrefix: '12345678'` を与え、40 文字超連続の base64 風トークンが無い `!/[0-9A-Za-z_-]{40,}/` を assert）

**auth route 判定 (`src/auth.ts` と同じ §1 優先順位):**

26. `opts.apiKeyFlag = 'X'` + `GEMINI_API_KEY = 'Y'` + ADC env あり → `api-key-flag` (X を採用)
27. `apiKeyFlag = undefined` + `GEMINI_API_KEY = 'Y'` → `api-key-env`
28. `apiKeyFlag = undefined` + `GEMINI_API_KEY 空` + ADC env 揃い → `adc`
29. 全部空 → `none`

**precedence 整合性 integration test（新規）:**

30. **`auth.ts::resolveAuth()` と `doctor.ts::resolveAuthRoute()` の整合性**:
    同一 env を両方に与え、`resolveAuth({apiKeyFlag: 'X', env, ...})` の `.mode`（`'api-key'`）と `resolveAuthRoute(env, 'X').selected`（`'api-key-flag'`）、および `resolveAuth({apiKeyFlag: undefined, env: {GEMINI_API_KEY: 'Y'}, ...})` と `resolveAuthRoute({GEMINI_API_KEY: 'Y'}, undefined).selected`（`'api-key-env'`）が対応することを確認。ADC 経路は `resolveAuth` が実ネットワーク呼ぶので対象外（api-key-flag / api-key-env の 2 パターンに絞る）。

### 7.2 次に実装する関数の順序

1. `maskApiKey` （純関数、1〜3 のテスト通す）
2. `classifyInstallMethod` （4〜7 通す）
3. `resolveAuthRoute(env, apiKeyFlag)` 内部関数 （26〜29 通す）
4. **`computeWarnings` を warning code ごとに関数分割**（F-1 反映）:
   - `warnNoAuth(ctx)` / `warnShadowsAdc(ctx)` / `warnLocationNotGlobal(ctx)` / `warnLocationMissing(ctx)` / `warnCredsFileMissing(ctx)` / `warnUseVertexaiNotTrue(ctx)` / `warnApiKeyFormatSuspect(ctx)` を各々独立の純関数とし、`computeWarnings` は `[...fn(ctx)].filter(Boolean)` で集約
   - 各関数は `DoctorWarning | null` を返す。test 8〜15 と 1:1 対応（各 warning を独立に差し込めるので fail の切り分けが容易）
5. `buildDoctorReport` （組み立て、16〜22 通す）
6. `renderDoctorJSON` （23, 25 通す）
7. `renderDoctorText` （24 通す）
8. precedence 整合性 test 30 を最後に足す（`auth.ts` の import が必要なため）

### 7.3 最後に CLI 結線 + e2e 確認

1. `src/cli.ts` リファクタ: program → `generate` サブコマンド移植（既存 `--prompt` テスト可能な範囲で smoke）
2. `doctor` サブコマンド追加（`--json` / `--verbose` オプション）
3. `npm run build` → `dist/cli.js doctor` を直接起動し、stdout を目視
4. §8 の 3 環境パターンを実行して `summary.md`（§10 に保存先明記）に貼る
5. §9.4 の help パターン 5 種を実行して summary.md に添付

---

## 8. 動作確認スクリプト

**共通**: 各ケースで `--json | jq -e .` も併せて走らせて JSON parse 通過を確認する（D4 反映）。

### 8.1 受け入れ基準 10-a (current env, API key + ADC 両方 set, location=us-central1)

```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659
npm run build
# direnv で .envrc が読まれている前提。明示的に上書きしない：
node dist/cli.js doctor
# 期待: Warnings に LOCATION_NOT_GLOBAL と GEMINI_API_KEY_SHADOWS_ADC、fatal: false
node dist/cli.js doctor --json | jq -e . >/dev/null && echo "8.1 json: OK"
```

### 8.2 受け入れ基準 10-b (ADC clean path)

```bash
env -u GEMINI_API_KEY \
  GOOGLE_CLOUD_LOCATION=global \
  GOOGLE_GENAI_USE_VERTEXAI=true \
  node dist/cli.js doctor
# 期待: authRoute.selected = 'adc', warnings = [], fatal: false, adc.account/project が埋まっていれば bonus
env -u GEMINI_API_KEY \
  GOOGLE_CLOUD_LOCATION=global \
  GOOGLE_GENAI_USE_VERTEXAI=true \
  node dist/cli.js doctor --json | jq -e . >/dev/null && echo "8.2 json: OK"
```

### 8.3 受け入れ基準 10-c (fatal)

```bash
env -u GEMINI_API_KEY -u GOOGLE_CLOUD_PROJECT -u GOOGLE_CLOUD_LOCATION \
  node dist/cli.js doctor
# 期待: warnings に NO_AUTH_AVAILABLE (fatal severity), fatal: true, exit code 0
echo "exit: $?"   # 0
env -u GEMINI_API_KEY -u GOOGLE_CLOUD_PROJECT -u GOOGLE_CLOUD_LOCATION \
  node dist/cli.js doctor --json | jq -e . >/dev/null && echo "8.3 json: OK"
```

### 8.4 JSON valid 確認（stdout が純粋な 1 個の JSON であること）

```bash
node dist/cli.js doctor --json | jq -e 'type == "object"' >/dev/null && echo OK
# [auth] using: ... のような副作用ログが混ざらないことを確認（混ざると jq が parse 失敗）
```

### 8.5 後方互換スモーク

```bash
node dist/cli.js --help | grep -E "generate|doctor"   # 両方見える
# 実 API 呼び出しはしない。parse だけ通る確認:
node dist/cli.js --prompt "test" --output /tmp/should-not-exist.png || true
# 期待: auth 到達まで進む (API 呼び出し前 or 後で失敗してよい)
```

### 8.6 `--verbose` スモーク（情報漏洩の目視）

```bash
node dist/cli.js doctor --verbose --json | jq '.verbose'
# 期待: tokenPrefix / gcloudAccount / gcloudProject / gcloudAdcFilePath / nodeVersion / platform
# gcloud 未導入環境では gcloud* 系が undefined になる（fail-open）
```

---

## 9. リスクと落とし穴

### 9.1 `GoogleAuth.getAccessToken()` の hang と resource leak

`GoogleAuth` は metadata server / gcloud sdk を透過的に探るため、ネットワーク断時に DNS timeout を待つ可能性がある。

**採用: `setTimeout(…).unref()` を使う（Recommendation 5 の選択肢 a、単純・依存なし）**

- 選択肢 a: `setTimeout().unref()` — Node の event loop が他の handle を持たない限り CLI が exit できる。実装簡単。google-auth-library のバージョン依存なし。
- 選択肢 b: `AbortController` を `client.getAccessToken({ signal })` に渡す — google-auth-library 10.x で対応。より筋は良いが、実装時点の google-auth-library が `getAccessToken` で AbortSignal を尊重するかは検証必要。

**判断:** v0.4.0 は選択肢 a を採用。AbortController は `AuthClient.request` のためのもので `getAccessToken` への伝播は SDK バージョン差があり検証コスト高。`setTimeout().unref()` で「本体 probe が走り続けても CLI は exit する」という最低限の保証は得られる。§2.3 の `defaultAdcProbe` 実装は既にこの方針で書いている（`timeoutHandle.unref()` 参照）。test 21 で「timeout 時に buildDoctorReport が解決する」ことを fake 注入で検証。

### 9.2 ADC token 先頭マスクの衝突

「先頭 8 文字」で衝突しうる (`ya29.a0A...` で始まる OAuth access token が多く、先頭 8 文字はほぼ固定)。衝突しても **非秘密** なので情報漏洩には当たらない。ただし summary で「実用上マスクとしての識別性は低い。検証目的の指紋として割り切る」旨を明記。

### 9.3 `npm view` 呼び出しについての決定

**決定: v0.4.0 では `CLI_VERSION_STALE` warning を実装しない。**

理由:

1. YAGNI — doctor 本体の責務は env 診断であり、パッケージレジストリ死活監視は別レイヤ。
2. offline 環境・企業内プロキシ配下で `npm view` が 1.5s でも待たされると UX を損なう。
3. 実装すると injection 点（`remoteVersionFetcher`）・タイムアウト・silent skip の決め事が増え、v0.4.0 の diff が肥大化する。
4. 受け入れ基準 §4 の「最新 version と乖離」条件は v0.5.0 以降の拡張ポイントとして CHANGELOG Notes に記す。

§5.1 の warning 表から `CLI_VERSION_STALE` は削除済み。

### 9.4 commander の default subcommand + help の挙動

`--help` を付けた場合、default subcommand の行動が context 依存で曖昧になりうる。以下 5 パターンを手動検証し summary.md に貼る:

- `nanobanana-adc --help` → program 全体の help（`generate` / `doctor` の 2 行）
- `nanobanana-adc generate --help` → generate の help
- `nanobanana-adc doctor --help` → doctor の help
- `nanobanana-adc --prompt x` → generate に routing（isDefault: true のため）
- **`nanobanana-adc`（引数なし）** → generate に routing され `--prompt required` エラーで exit 1（既存挙動と同じであること）

commander v14 の `enablePositionalOptions()` を使う必要があれば呼ぶ（既存動作優先、不要なら省略）。

### 9.5 `process.argv[1]` が undefined / symlink

npm global 経由の場合 `argv[1]` は `/usr/local/bin/nanobanana-adc` (symlink)。`realpathSync` で解決する (§6)。Windows のパス区切りは `\\` だが、`sep` で正規化後に `/` に揃えて正規表現を当てるので OK。Node の `realpathSync` が throw した場合（権限・削除済み symlink）は fallback で `argv1` をそのまま使い、regex 不一致なら `unknown`。`argv1 === ''`（Electron 埋め込み等）も §6 の guard で `unknown` に落ちる。

### 9.6 `google-auth-library` が metadata server を打つ副作用

GCE / Cloud Run 外で ADC が未設定の場合、`GoogleAuth` は内部で `metadata.google.internal` への HTTP リクエストを試みる。ネットワーク構成次第で数秒ハングする（DNS の fail-open 待ち）。

- §9.1 の 5s timeout で cover されるが、「5s 単位で一律待たされる」のは UX 的に誤誘導になり得る（ユーザが自分の ADC 設定が遅いと勘違いする）。
- 許容可能な設計上の tradeoff として plan に明記する。将来的には `scopes` を限定して `auth.getApplicationDefault()` 経由で `fromMetadataServer` を避ける改善余地があるが、v0.4.0 ではスコープ外。
- summary.md にこの tradeoff を 1 行残す。

### 9.7 `API_KEY_FORMAT_SUSPECT` の偽陰性

`/^AIza/` で弾くのは現行の Google API key prefix に依存。将来 Google が prefix を変えた場合に正規 key を suspect と誤判定する可能性がある。severity は `warn` に留め、message は "likely invalid (the CLI will still attempt to use it)" と書いて動作阻害はしないことを明示する（§5.1 表の message に反映済み）。

### 9.8 `ignore-scripts=true` と新規依存

新規依存は追加しない。`google-auth-library` / `commander` は既に pin 済みで postinstall も無い。gcloud fetcher は `child_process.execFile` の標準 API で実装。

---

## 10. バージョン同期チェックリスト

### 10.1 同期対象 4 箇所

| # | ファイル | 現在値 | 目標値 | 参照キー |
|---|---------|--------|--------|---------|
| 1 | `package.json` | `"version": "0.3.0"` | `"0.4.0"` | `.version` |
| 2 | `.claude-plugin/plugin.json` | `"version": "0.3.0"` | `"0.4.0"` | `.version` |
| 3 | `.claude-plugin/marketplace.json` | `plugins[0].version = "0.3.0"` | `"0.4.0"` | `.plugins.find(p => p.name==='nanobanana-adc').version` |
| 4 | `src/cli.ts` | `.version('0.3.0')` | `.version('0.4.0')` | regex `\.version\('([^']+)'\)` |

（前回 plan の §9.6「plugin.json に version フィールドが無い」は事実誤認であり、本 rev で削除済み。`node -p "require('./.claude-plugin/plugin.json').version"` は現時点で `0.3.0` を返すため、T14 では値の更新のみ行う。）

### 10.2 CI `validate-plugin` ジョブのローカル実行手順

```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-014-1777063659

# CI が行うのと同じ比較
PKG=$(node -p "require('./package.json').version")
PLUGIN=$(node -p "require('./.claude-plugin/plugin.json').version")
MARKET=$(node -p "require('./.claude-plugin/marketplace.json').plugins.find(p => p.name === 'nanobanana-adc').version")
CLI=$(grep -oE "\.version\('([^']+)'\)" src/cli.ts | sed -E "s/.*'([^']+)'.*/\1/")
echo "package.json=$PKG plugin.json=$PLUGIN marketplace.json=$MARKET src/cli.ts=$CLI"

# 4 値が全て '0.4.0' なら OK
[ "$PKG" = "0.4.0" ] && [ "$PLUGIN" = "0.4.0" ] && [ "$MARKET" = "0.4.0" ] && [ "$CLI" = "0.4.0" ] && echo "version-sync: OK"
```

### 10.3 最終確認

- [ ] `npm run typecheck` pass
- [ ] `npm run build` pass（`dist/cli.js` と `dist/doctor.js` が生成される）
- [ ] `node --test --import tsx src/png.test.ts src/generate.test.ts src/doctor.test.ts` pass
- [ ] `package.json` の `scripts.test` に `src/doctor.test.ts` が入っている
- [ ] 上記 version-sync OK
- [ ] §8.1-8.6 の e2e を実行して summary.md に貼付（保存先: `.team/tasks/014-t14-v0-4-0-nanobanana-adc-doctor/runs/task-014-1777063659/summary.md`）
- [ ] `claude plugin validate .` は **CI（`.github/workflows/ci.yml` の `validate-plugin` ジョブ）に委ねる**。`@anthropic-ai/claude-code` を global install する必要があり重いのでローカル必須にはしない。CI で落ちたら plugin.json / marketplace.json を見直す。

---

## 付録 A: doctor 出力テキストの書式ルール

- 先頭行: `nanobanana-adc doctor`（空行 1）
- セクション名: capitalized 1 語 (CLI / Auth route / API key / ADC / GCP env / Model / Warnings / Verbose)
- key/value: 左 32 カラムで右寄せ key を整列（タブではなく space で）
- Warnings セクションは `Verbose` の前、`Warnings (N)` に続いて `⚠ [CODE] message` or `ⓘ [CODE] message`
- Verbose セクションは `--verbose` 時のみ末尾に付く（token_prefix / gcloud_account / gcloud_project / gcloud_adc_file_path / node_version / platform）
- 全て stdout 出力（stderr には出さない。機械 parse で混ざると困る）

## 付録 B: 参考 — 非作業対象ファイル

- `src/auth.ts`（§2.3 により触らない）
- `src/generate.ts`（§2.3 により触らない）
- `src/png.ts` / `src/png.test.ts` / `src/generate.test.ts`
- `.github/workflows/ci.yml`（T14 では validate-plugin を "通す" だけ）
- `bin/nanobanana-adc`（shebang dispatcher のまま）

## 付録 C: rev 2 での変更点（Design Review 対応）

| # | blocker | 反映先 |
|---|---------|-------|
| 1 | §9.6 事実誤認の削除 | §9 から 9.6 を削除、§3.2/§10.1 を「0.3.0 → 0.4.0」に訂正 |
| 2 | ADC probe に account/project 追加 | §2.2 `AdcProbeResult`、§2.3 `defaultAdcProbe`、§4.1 `DoctorReport.adc`、§7.1 test 19/20 |
| 3 | `--verbose` 専用 field を型に明記 | §4.1 `DoctorReport.verbose` block、§3.2 README 注意書き、§1.2 checklist |
| 4 | `CLI_VERSION_STALE` を v0.4.0 で実装しない | §5.1 表から削除、§1.3 スコープ外追記、§9.3 で決定明示、CHANGELOG Notes 追記指示 |
| 5 | ADC probe timeout resource leak | §9.1 で選択肢 a (`setTimeout().unref()`) を採用決定、§2.3 実装に反映、§7.1 test 21 追加 |
| 6 | precedence 整合性 integration test | §2.3 方針明示、§7.1 test 30 追加、§7.2 step 8 追加 |

| Optional | 反映先 |
|---------|-------|
| A2-1 `GEMINI_API_KEY` 単独時の warning 非発火理由 | §5.1「決定事項」末尾 |
| A2-2 summary.md パス | §1.2 checklist、§10.3 |
| C3 `classifyInstallMethod('')` | §6 guard、§7.1 test 7 |
| C7 `nowMs` 固定 inject | §7.1 冒頭「テスト共通規約」 |
| D1 adcProbe throw 耐性 | §7.1 test 22 |
| D4 各 e2e で `--json | jq -e .` | §8 冒頭「共通」、各 §8.1-8.3 |
| E1 metadata server 副作用 note | §9.6 |
| F-1 `computeWarnings` 関数分割 | §7.2 step 4 |
| G-1 `claude plugin validate .` | §10.3（CI に委ねる宣言） |
