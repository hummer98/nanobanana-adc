import { realpathSync, existsSync } from 'node:fs';
import { stat as fsStat, readFile as fsReadFile, readdir as fsReaddir } from 'node:fs/promises';
import * as os from 'node:os';
import * as http from 'node:http';
import { sep } from 'node:path';
import { execFile } from 'node:child_process';
import { GoogleAuth } from 'google-auth-library';

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export interface DoctorEnv {
  GEMINI_API_KEY?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_GENAI_USE_VERTEXAI?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  // T15: ADC source resolution heuristics
  K_SERVICE?: string;
  GAE_APPLICATION?: string;
  KUBERNETES_SERVICE_HOST?: string;
  CLOUD_BUILD_BUILDID?: string;
  CLOUDSDK_CONFIG?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// ADC source resolution types (T15)
// ───────────────────────────────────────────────────────────────────────────

/**
 * ADC resolution result kind.
 *
 * v0.6+: the kind value set is the same as v0.5, but the meaning of
 * `'default'` is now "effective default" — i.e. the resolver checked the
 * single ADC default location, which is `$CLOUDSDK_CONFIG/...` when
 * `CLOUDSDK_CONFIG` is set and `$HOME/.config/gcloud/...` (or the Windows
 * equivalent under `%APPDATA%`) otherwise.
 *
 * @remarks
 * `'cloudsdk-config'` is `@deprecated` in v0.6 and is no longer produced at
 * runtime; the kept literal exists only to preserve type-level compat for v1
 * schema consumers and will be removed in v2.
 */
export type AdcSourceKind =
  | 'env'
  | 'default'
  /** @deprecated v0.6+: never produced; kept in type for v1 schema compatibility. Removed in v2. */
  | 'cloudsdk-config'
  | 'metadata-server'
  | 'unknown';

export type AdcCredentialType =
  | 'authorized_user'
  | 'service_account'
  | 'external_account'
  | 'impersonated_service_account'
  | 'unknown';

export interface AdcSourceFileInfo {
  path: string;
  // exists=true means "exists as a regular file". directory / symlink-to-dir / ENOENT all map to exists=false.
  exists: boolean;
  size?: number;
  mtimeMs?: number;
}

export interface AdcSourceMeta {
  type: AdcCredentialType;
  quotaProjectId?: string;
  clientId?: string;
  clientEmail?: string;
}

export interface AdcSourceReport {
  resolved: AdcSourceKind;
  envCredentials: AdcSourceFileInfo | null;
  /**
   * The ADC default location after resolving `CLOUDSDK_CONFIG`. Always present
   * in v0.6+. When `CLOUDSDK_CONFIG` is set, this points under that directory;
   * otherwise it points at `$HOME/.config/gcloud/...` (or the Windows
   * equivalent under `%APPDATA%`).
   */
  effectiveDefault: AdcSourceFileInfo;
  /**
   * @deprecated v0.6: alias of `effectiveDefault` (same object reference) for
   * v0.5 consumers that read `report.adcSource.defaultLocation.path`. Will be
   * removed in v1.0.
   */
  defaultLocation: AdcSourceFileInfo;
  /**
   * @deprecated v0.6: never populated. The dir-level information now lives
   * under the top-level `gcloudConfigDir`. Will be removed in v1.0.
   */
  cloudsdkConfig?: AdcSourceFileInfo | null;
  metadataServer: {
    envHeuristic: 'k_service' | 'gae_application' | 'kubernetes' | 'cloud_build' | 'none';
    probed: boolean;
    probeOk?: boolean;
    probeError?: string;
  };
  meta: AdcSourceMeta | null;
  account?: string;
  accountError?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// gcloud config directory resolution types (T16)
// ───────────────────────────────────────────────────────────────────────────

export type GcloudConfigDirSource = 'env-cloudsdk-config' | 'default';

export interface GcloudConfigDirEntry {
  state: 'exists' | 'missing' | 'unreadable';
  /**
   * For directory entries with `state==='exists'`, this is the best-effort
   * count of entries within the directory. Omitted for files, for missing or
   * unreadable directories, and when the count cannot be obtained.
   */
  entries?: number;
}

export interface GcloudConfigDirReport {
  /** Absolute path of the resolved gcloud config directory. */
  resolved: string;
  source: GcloudConfigDirSource;
  presence: {
    activeConfig: GcloudConfigDirEntry;
    configurations: GcloudConfigDirEntry;
    credentialsDb: GcloudConfigDirEntry;
    accessTokensDb: GcloudConfigDirEntry;
    applicationDefaultCredentialsJson: GcloudConfigDirEntry;
    legacyCredentials: GcloudConfigDirEntry;
  };
  /** Set when `source === 'env-cloudsdk-config'`; explains the override semantics. */
  note?: string;
}

export interface ResolveGcloudConfigDirDeps {
  statAsync?: (
    path: string,
  ) => Promise<{ size: number; mtimeMs: number; isFile: boolean; isDirectory: boolean } | null>;
  readDirCount?: (path: string) => Promise<number | null>;
  homeDir?: () => string;
  appDataDir?: () => string | undefined;
  platform?: NodeJS.Platform;
}

export interface ResolveAdcSourceDeps {
  statAsync?: (
    path: string,
  ) => Promise<{ size: number; mtimeMs: number; isFile: boolean } | null>;
  readJsonAsync?: (path: string, maxBytes: number) => Promise<unknown | null>;
  gcloudActiveAccountFetcher?: () => Promise<string | undefined>;
  metadataServerProbe?: (timeoutMs: number) => Promise<{ ok: boolean; error?: string }>;
  homeDir?: () => string;
  appDataDir?: () => string | undefined;
  platform?: NodeJS.Platform;
}

export interface ResolveAdcSourceOptions {
  probeMetadataServer: boolean;
  maxJsonBytes?: number;
}

export interface AdcProbeResult {
  ok: boolean;
  tokenPrefix?: string;
  account?: string;
  project?: string;
  error?: string;
}

export interface DoctorOptions {
  apiKeyFlag?: string;
  verbose: boolean;
  argv1: string;
  version: string;
  adcProbe?: () => Promise<AdcProbeResult>;
  credsFileExists?: (path: string) => boolean;
  gcloudAccountFetcher?: () => Promise<string | undefined>;
  gcloudProjectFetcher?: () => Promise<string | undefined>;
  gcloudAdcFilePathFetcher?: () => Promise<string | undefined>;
  nowMs?: () => number;
  probeMetadataServer?: boolean;
  adcSourceResolver?: (
    env: DoctorEnv,
    opts: ResolveAdcSourceOptions,
  ) => Promise<AdcSourceReport>;
  gcloudConfigDirResolver?: (env: DoctorEnv) => Promise<GcloudConfigDirReport>;
}

export type InstallMethod = 'claude-plugin' | 'npm-global' | 'source' | 'unknown';

export type AuthRouteSelected = 'api-key-flag' | 'api-key-env' | 'adc' | 'none';

export interface ApiKeyInfo {
  present: boolean;
  prefix?: string;
  length?: number;
  looksValid?: boolean;
}

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
  | 'CLOUDSDK_CONFIG_OVERRIDE';

export interface DoctorWarning {
  code: DoctorWarningCode;
  severity: 'info' | 'warn' | 'fatal';
  message: string;
}

export interface DoctorReport {
  schema: 'nanobanana-adc-doctor/v1';
  generatedAt: string;
  cli: {
    path: string;
    version: string;
    installMethod: InstallMethod;
  };
  authRoute: {
    selected: AuthRouteSelected;
    reason: string;
  };
  apiKey: ApiKeyInfo;
  adc: {
    probed: boolean;
    ok?: boolean;
    account?: string;
    project?: string;
    tokenPrefix?: string;
    error?: string;
  };
  gcpEnv: {
    GOOGLE_CLOUD_PROJECT: string | null;
    GOOGLE_CLOUD_LOCATION: string | null;
    GOOGLE_GENAI_USE_VERTEXAI: string | null;
    GOOGLE_APPLICATION_CREDENTIALS: {
      path: string | null;
      exists: boolean | null;
    };
  };
  model: {
    default: 'gemini-3-pro-image-preview';
    note: 'requires GOOGLE_CLOUD_LOCATION=global on the ADC path';
  };
  adcSource: AdcSourceReport;
  gcloudConfigDir: GcloudConfigDirReport;
  warnings: DoctorWarning[];
  fatal: boolean;
  verbose?: {
    tokenPrefix?: string;
    gcloudAccount?: string;
    gcloudProject?: string;
    gcloudAdcFilePath?: string;
    nodeVersion?: string;
    platform?: string;
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Pure helpers
// ───────────────────────────────────────────────────────────────────────────

export function maskApiKey(key: string | undefined): ApiKeyInfo {
  if (!key) return { present: false };
  return {
    present: true,
    prefix: key.slice(0, 6),
    length: key.length,
    looksValid: /^AIza/.test(key),
  };
}

export function classifyInstallMethod(argv1: string): InstallMethod {
  if (!argv1) return 'unknown';
  let resolved: string;
  try {
    resolved = realpathSync(argv1);
  } catch {
    resolved = argv1;
  }
  const normalized = resolved.split(sep).join('/');
  if (/\/\.claude\/plugins\//.test(normalized)) return 'claude-plugin';
  if (/\/node_modules\/nanobanana-adc\//.test(normalized)) return 'npm-global';
  if (/\/\.worktrees\/|\/git\/nanobanana-adc\//.test(normalized)) return 'source';
  return 'unknown';
}

export function resolveAuthRoute(
  env: DoctorEnv,
  apiKeyFlag?: string,
): DoctorReport['authRoute'] {
  if (apiKeyFlag && apiKeyFlag.length > 0) {
    return {
      selected: 'api-key-flag',
      reason: '--api-key flag set; wins over GEMINI_API_KEY and ADC',
    };
  }
  if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 0) {
    return {
      selected: 'api-key-env',
      reason: 'GEMINI_API_KEY set and no --api-key flag',
    };
  }
  if (
    env.GOOGLE_CLOUD_PROJECT &&
    env.GOOGLE_CLOUD_PROJECT.length > 0 &&
    env.GOOGLE_CLOUD_LOCATION &&
    env.GOOGLE_CLOUD_LOCATION.length > 0
  ) {
    return {
      selected: 'adc',
      reason: 'GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION set; ADC path',
    };
  }
  return {
    selected: 'none',
    reason: 'no API key and ADC env is incomplete',
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Warning computations — each returns DoctorWarning | null so that a warning
// set can be assembled as `[...fns.map(fn => fn(ctx))].filter(Boolean)`.
// ───────────────────────────────────────────────────────────────────────────

interface WarnCtx {
  env: DoctorEnv;
  apiKey: ApiKeyInfo;
  adc: DoctorReport['adc'];
  credsExists: boolean | null;
  adcSource: AdcSourceReport;
}

export function warnNoAuth(ctx: WarnCtx): DoctorWarning | null {
  const apiKeyUsable = ctx.apiKey.present;
  const adcUsable =
    !!ctx.env.GOOGLE_CLOUD_PROJECT &&
    !!ctx.env.GOOGLE_CLOUD_LOCATION &&
    ctx.adc.probed &&
    ctx.adc.ok === true;
  if (apiKeyUsable || adcUsable) return null;
  return {
    code: 'NO_AUTH_AVAILABLE',
    severity: 'fatal',
    message:
      'No usable auth route. Either set GEMINI_API_KEY or configure ADC ' +
      '(gcloud auth application-default login + GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION=global).',
  };
}

export function warnShadowsAdc(ctx: WarnCtx): DoctorWarning | null {
  if (!ctx.apiKey.present) return null;
  if (!ctx.env.GOOGLE_CLOUD_PROJECT) return null;
  return {
    code: 'GEMINI_API_KEY_SHADOWS_ADC',
    severity: 'info',
    message:
      'GEMINI_API_KEY takes precedence over ADC. ' +
      'Use `env -u GEMINI_API_KEY nanobanana-adc ...` to force the ADC path.',
  };
}

export function warnLocationNotGlobal(ctx: WarnCtx): DoctorWarning | null {
  const loc = ctx.env.GOOGLE_CLOUD_LOCATION;
  if (!loc) return null;
  if (loc === 'global') return null;
  return {
    code: 'LOCATION_NOT_GLOBAL',
    severity: 'warn',
    message:
      `GOOGLE_CLOUD_LOCATION=${loc} — Gemini 3 Pro Image is served only at 'global'. ` +
      `Set GOOGLE_CLOUD_LOCATION=global.`,
  };
}

export function warnLocationMissing(ctx: WarnCtx): DoctorWarning | null {
  if (!ctx.env.GOOGLE_CLOUD_PROJECT) return null;
  if (ctx.env.GOOGLE_CLOUD_LOCATION) return null;
  return {
    code: 'LOCATION_MISSING',
    severity: 'warn',
    message:
      'GOOGLE_CLOUD_LOCATION is unset. The ADC path requires it (set to \'global\').',
  };
}

export function warnCredsFileMissing(ctx: WarnCtx): DoctorWarning | null {
  const path = ctx.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) return null;
  if (ctx.credsExists !== false) return null;
  return {
    code: 'CREDS_FILE_MISSING',
    severity: 'warn',
    message: `GOOGLE_APPLICATION_CREDENTIALS=${path}, but file does not exist.`,
  };
}

export function warnUseVertexaiNotTrue(ctx: WarnCtx): DoctorWarning | null {
  const v = ctx.env.GOOGLE_GENAI_USE_VERTEXAI;
  if (v === undefined) return null;
  if (v === 'true') return null;
  return {
    code: 'USE_VERTEXAI_NOT_TRUE',
    severity: 'warn',
    message: `GOOGLE_GENAI_USE_VERTEXAI=${v}. Set to 'true' for consistent SDK behavior.`,
  };
}

export function warnApiKeyFormatSuspect(ctx: WarnCtx): DoctorWarning | null {
  if (!ctx.apiKey.present) return null;
  if (ctx.apiKey.looksValid) return null;
  return {
    code: 'API_KEY_FORMAT_SUSPECT',
    severity: 'warn',
    message:
      "GEMINI_API_KEY does not start with 'AIza' — likely invalid (the CLI will still attempt to use it).",
  };
}

export function warnAdcQuotaProjectMismatch(ctx: WarnCtx): DoctorWarning | null {
  const qp = ctx.adcSource.meta?.quotaProjectId;
  const envProject = ctx.env.GOOGLE_CLOUD_PROJECT;
  if (!qp || !envProject) return null;
  if (qp === envProject) return null;
  return {
    code: 'ADC_QUOTA_PROJECT_MISMATCH',
    severity: 'warn',
    message:
      `ADC quota_project_id (${qp}) differs from GOOGLE_CLOUD_PROJECT (${envProject}). ` +
      `Run \`gcloud auth application-default set-quota-project ${envProject}\` to align them so ` +
      `billing and operations target the same project.`,
  };
}

export function warnAdcFileMissing(ctx: WarnCtx): DoctorWarning | null {
  const path = ctx.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) return null;
  if (ctx.adcSource.envCredentials?.exists !== false) return null;
  return {
    code: 'ADC_FILE_MISSING',
    severity: 'warn',
    message: `GOOGLE_APPLICATION_CREDENTIALS=${path}, but the file does not exist.`,
  };
}

export function warnAdcTypeUnusual(ctx: WarnCtx): DoctorWarning | null {
  const meta = ctx.adcSource.meta;
  if (meta === null) return null;
  if (meta.type !== 'unknown') return null;
  return {
    code: 'ADC_TYPE_UNUSUAL',
    severity: 'info',
    message:
      'ADC credential type is not one of authorized_user / service_account / external_account / impersonated_service_account. ' +
      'The CLI may still work, but this is unexpected.',
  };
}

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

export function computeWarnings(ctx: WarnCtx): DoctorWarning[] {
  const fns = [
    warnNoAuth,
    warnShadowsAdc,
    warnLocationNotGlobal,
    warnLocationMissing,
    warnCredsFileMissing,
    warnUseVertexaiNotTrue,
    warnApiKeyFormatSuspect,
    warnAdcQuotaProjectMismatch,
    warnAdcFileMissing,
    warnAdcTypeUnusual,
    warnCloudsdkConfigOverride,
  ];
  return fns
    .map((f) => f(ctx))
    .filter((w): w is DoctorWarning => w !== null);
}

// ───────────────────────────────────────────────────────────────────────────
// ADC source resolution (T15)
// ───────────────────────────────────────────────────────────────────────────

export function parseAdcMeta(parsed: unknown): AdcSourceMeta {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { type: 'unknown' };
  }
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
  // NOTE: private_key / refresh_token / private_key_id are intentionally not
  // copied. We allocate a fresh object so the source object cannot leak via
  // accidental serialization upstream.
  return out;
}

async function fileInfo(
  path: string,
  statAsync: NonNullable<ResolveAdcSourceDeps['statAsync']>,
): Promise<AdcSourceFileInfo> {
  const s = await statAsync(path);
  if (!s || !s.isFile) return { path, exists: false };
  return { path, exists: true, size: s.size, mtimeMs: s.mtimeMs };
}

async function defaultStatAsync(
  path: string,
): Promise<{ size: number; mtimeMs: number; isFile: boolean } | null> {
  try {
    const s = await fsStat(path);
    return { size: s.size, mtimeMs: s.mtimeMs, isFile: s.isFile() };
  } catch {
    return null;
  }
}

async function defaultDirStatAsync(
  path: string,
): Promise<{ size: number; mtimeMs: number; isFile: boolean; isDirectory: boolean } | null> {
  // Distinct from `defaultStatAsync` because the gcloud config dir resolver
  // needs to distinguish files from directories; an EACCES on stat must
  // bubble out (so the resolver can mark the entry `unreadable`) rather than
  // be swallowed as `null` (which would mean `missing`).
  const s = await fsStat(path).catch((err: NodeJS.ErrnoException) => {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return null;
    }
    throw err;
  });
  if (!s) return null;
  return { size: s.size, mtimeMs: s.mtimeMs, isFile: s.isFile(), isDirectory: s.isDirectory() };
}

async function defaultReadDirCount(path: string): Promise<number | null> {
  try {
    const entries = await fsReaddir(path);
    return entries.length;
  } catch {
    return null;
  }
}

async function defaultReadJsonAsync(
  path: string,
  maxBytes: number,
): Promise<unknown | null> {
  try {
    const buf = await fsReadFile(path);
    if (buf.byteLength > maxBytes) return null;
    return JSON.parse(buf.toString('utf8')) as unknown;
  } catch {
    return null;
  }
}

export async function defaultMetadataServerProbe(
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const handle: NodeJS.Timeout = setTimeout(() => controller.abort(), timeoutMs);
    (handle as unknown as { unref?: () => void }).unref?.();
    let settled = false;
    const settle = (v: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(handle);
      resolve(v);
    };
    try {
      const req = http.request(
        {
          hostname: '169.254.169.254',
          port: 80,
          path: '/computeMetadata/v1/instance/id',
          method: 'GET',
          headers: { 'Metadata-Flavor': 'Google' },
          signal: controller.signal as unknown as AbortSignal,
        },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            settle({ ok: true });
          } else {
            settle({ ok: false, error: `status ${res.statusCode}` });
          }
        },
      );
      req.on('error', (err) => {
        if (controller.signal.aborted) {
          settle({ ok: false, error: `timeout (${timeoutMs}ms)` });
        } else {
          settle({ ok: false, error: (err as Error).message });
        }
      });
      req.end();
    } catch (err) {
      settle({ ok: false, error: (err as Error).message });
    }
  });
}

export async function defaultGcloudActiveAccountFetcher(): Promise<string | undefined> {
  const out = await runGcloud([
    'auth',
    'list',
    '--filter=status:ACTIVE',
    '--format=value(account)',
  ]);
  if (!out) return undefined;
  const firstLine = out.split(/\r?\n/)[0]?.trim();
  return firstLine && firstLine.length > 0 ? firstLine : undefined;
}

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

  const envPath = env.GOOGLE_APPLICATION_CREDENTIALS;
  const envCredentials: AdcSourceFileInfo | null = envPath
    ? await fileInfo(envPath, stat)
    : null;

  // T16: align with google-auth-library — when CLOUDSDK_CONFIG is set, the OS
  // default $HOME/.config/gcloud is NOT consulted. The "effective default" is
  // a single path: $CLOUDSDK_CONFIG/application_default_credentials.json when
  // that env is set (and non-empty), else the OS default.
  const cloudsdkConfigDir = env.CLOUDSDK_CONFIG;
  const useCloudsdkOverride =
    typeof cloudsdkConfigDir === 'string' && cloudsdkConfigDir.length > 0;
  const effectivePath = useCloudsdkOverride
    ? `${cloudsdkConfigDir}/application_default_credentials.json`
    : platform === 'win32'
      ? `${appData ?? ''}\\gcloud\\application_default_credentials.json`
      : `${home}/.config/gcloud/application_default_credentials.json`;
  const effectiveDefault = await fileInfo(effectivePath, stat);

  const envHeuristic: AdcSourceReport['metadataServer']['envHeuristic'] = env.K_SERVICE
    ? 'k_service'
    : env.GAE_APPLICATION
      ? 'gae_application'
      : env.KUBERNETES_SERVICE_HOST
        ? 'kubernetes'
        : env.CLOUD_BUILD_BUILDID
          ? 'cloud_build'
          : 'none';

  const resolved: AdcSourceKind = envCredentials?.exists
    ? 'env'
    : effectiveDefault.exists
      ? 'default'
      : envHeuristic !== 'none'
        ? 'metadata-server'
        : 'unknown';

  let meta: AdcSourceMeta | null = null;
  const picked: AdcSourceFileInfo | null =
    resolved === 'env'
      ? envCredentials
      : resolved === 'default'
        ? effectiveDefault
        : null;
  if (picked?.exists && (picked.size ?? Infinity) <= maxBytes) {
    const parsed = await readJson(picked.path, maxBytes);
    if (parsed !== null) meta = parseAdcMeta(parsed);
  }

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
    effectiveDefault,
    defaultLocation: effectiveDefault,
    metadataServer,
    meta,
    ...(account !== undefined ? { account } : {}),
    ...(accountError !== undefined ? { accountError } : {}),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Gcloud config dir resolution (T16)
// ───────────────────────────────────────────────────────────────────────────

const GCLOUD_CONFIG_DIR_ENTRIES: ReadonlyArray<{
  key: keyof GcloudConfigDirReport['presence'];
  basename: string;
  kind: 'file' | 'dir';
}> = [
  { key: 'activeConfig', basename: 'active_config', kind: 'file' },
  { key: 'configurations', basename: 'configurations', kind: 'dir' },
  { key: 'credentialsDb', basename: 'credentials.db', kind: 'file' },
  { key: 'accessTokensDb', basename: 'access_tokens.db', kind: 'file' },
  {
    key: 'applicationDefaultCredentialsJson',
    basename: 'application_default_credentials.json',
    kind: 'file',
  },
  { key: 'legacyCredentials', basename: 'legacy_credentials', kind: 'dir' },
];

const CLOUDSDK_CONFIG_OVERRIDE_NOTE =
  'overrides $HOME/.config/gcloud entirely; gcloud auth list / configurations / ADC are isolated from the OS default';

function joinPath(base: string, child: string, platform: NodeJS.Platform): string {
  // The choice of separator must match the OS we're emulating in tests; this
  // mirrors what `resolveAdcSource` does so the two reports stay consistent.
  return platform === 'win32' ? `${base}\\${child}` : `${base}/${child}`;
}

export async function resolveGcloudConfigDir(
  env: DoctorEnv,
  deps: ResolveGcloudConfigDirDeps = {},
): Promise<GcloudConfigDirReport> {
  const stat = deps.statAsync ?? defaultDirStatAsync;
  const readDirCount = deps.readDirCount ?? defaultReadDirCount;
  const platform = deps.platform ?? process.platform;
  const home = (deps.homeDir ?? (() => os.homedir()))();
  const appData = (deps.appDataDir ?? (() => process.env.APPDATA))();

  const cloudsdkDir = env.CLOUDSDK_CONFIG;
  const useOverride = typeof cloudsdkDir === 'string' && cloudsdkDir.length > 0;

  let resolved: string;
  let source: GcloudConfigDirSource;
  let note: string | undefined;
  if (useOverride) {
    resolved = cloudsdkDir as string;
    source = 'env-cloudsdk-config';
    note = CLOUDSDK_CONFIG_OVERRIDE_NOTE;
  } else if (platform === 'win32') {
    resolved = `${appData ?? ''}\\gcloud`;
    source = 'default';
  } else {
    resolved = `${home}/.config/gcloud`;
    source = 'default';
  }

  const presence = {
    activeConfig: { state: 'missing' } as GcloudConfigDirEntry,
    configurations: { state: 'missing' } as GcloudConfigDirEntry,
    credentialsDb: { state: 'missing' } as GcloudConfigDirEntry,
    accessTokensDb: { state: 'missing' } as GcloudConfigDirEntry,
    applicationDefaultCredentialsJson: { state: 'missing' } as GcloudConfigDirEntry,
    legacyCredentials: { state: 'missing' } as GcloudConfigDirEntry,
  };

  for (const entry of GCLOUD_CONFIG_DIR_ENTRIES) {
    const childPath = joinPath(resolved, entry.basename, platform);
    let s: Awaited<ReturnType<typeof stat>>;
    try {
      s = await stat(childPath);
    } catch {
      // EACCES or any other stat failure → unreadable
      presence[entry.key] = { state: 'unreadable' };
      continue;
    }
    if (s === null) {
      presence[entry.key] = { state: 'missing' };
      continue;
    }
    if (entry.kind === 'file') {
      presence[entry.key] = s.isFile ? { state: 'exists' } : { state: 'unreadable' };
    } else {
      if (!s.isDirectory) {
        presence[entry.key] = { state: 'unreadable' };
      } else {
        const count = await readDirCount(childPath).catch(() => null);
        presence[entry.key] =
          count === null ? { state: 'exists' } : { state: 'exists', entries: count };
      }
    }
  }

  return {
    resolved,
    source,
    presence,
    ...(note !== undefined ? { note } : {}),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Default ADC probe (not called in unit tests — injected)
// ───────────────────────────────────────────────────────────────────────────

export async function defaultAdcProbe(): Promise<AdcProbeResult> {
  const controller = new AbortController();
  const timeoutHandle: NodeJS.Timeout = setTimeout(() => controller.abort(), 5000);
  (timeoutHandle as unknown as { unref?: () => void }).unref?.();
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const tokenResp = await client.getAccessToken();
    const token = typeof tokenResp === 'string' ? tokenResp : tokenResp?.token;
    if (!token) return { ok: false, error: 'no token returned' };

    let account: string | undefined;
    let project: string | undefined;
    try {
      const maybe = client as unknown as {
        getCredentials?: () => Promise<{
          client_email?: string;
          principal?: string;
        }>;
      };
      if (typeof maybe.getCredentials === 'function') {
        const creds = await maybe.getCredentials();
        account = creds.client_email ?? creds.principal;
      }
    } catch {
      // fail-open
    }
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

// ───────────────────────────────────────────────────────────────────────────
// Default gcloud fetchers (verbose only). Fail-open: return undefined on any
// error so the caller never crashes if gcloud is not installed.
// ───────────────────────────────────────────────────────────────────────────

function runGcloud(args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('gcloud', args, { timeout: 3000 }, (err, stdout) => {
      if (err) {
        resolve(undefined);
        return;
      }
      const out = stdout.toString().trim();
      resolve(out.length > 0 ? out : undefined);
    });
  });
}

export async function defaultGcloudAccountFetcher(): Promise<string | undefined> {
  return runGcloud(['config', 'get-value', 'account']);
}

export async function defaultGcloudProjectFetcher(): Promise<string | undefined> {
  return runGcloud(['config', 'get-value', 'project']);
}

export async function defaultGcloudAdcFilePathFetcher(): Promise<string | undefined> {
  const home = process.env.HOME;
  if (!home) return undefined;
  const candidate = `${home}/.config/gcloud/application_default_credentials.json`;
  return existsSync(candidate) ? candidate : undefined;
}

// ───────────────────────────────────────────────────────────────────────────
// buildDoctorReport
// ───────────────────────────────────────────────────────────────────────────

export async function buildDoctorReport(
  env: DoctorEnv,
  opts: DoctorOptions,
): Promise<DoctorReport> {
  const now = opts.nowMs ? opts.nowMs() : Date.now();
  const generatedAt = new Date(now).toISOString();

  const apiKey = maskApiKey(env.GEMINI_API_KEY);
  const authRoute = resolveAuthRoute(env, opts.apiKeyFlag);

  const credsPath = env.GOOGLE_APPLICATION_CREDENTIALS ?? null;
  const credsExistsFn = opts.credsFileExists ?? existsSync;
  const credsExists: boolean | null =
    credsPath === null ? null : credsExistsFn(credsPath);

  const probe = opts.adcProbe ?? defaultAdcProbe;
  let adcResult: AdcProbeResult;
  try {
    adcResult = await probe();
  } catch (err) {
    adcResult = { ok: false, error: (err as Error).message };
  }

  const adcBlock: DoctorReport['adc'] = {
    probed: true,
    ok: adcResult.ok,
    ...(adcResult.account !== undefined ? { account: adcResult.account } : {}),
    ...(adcResult.project !== undefined ? { project: adcResult.project } : {}),
    ...(opts.verbose && adcResult.tokenPrefix !== undefined
      ? { tokenPrefix: adcResult.tokenPrefix }
      : {}),
    ...(adcResult.error !== undefined ? { error: adcResult.error } : {}),
  };

  const probeMetadataServer = !!opts.probeMetadataServer;
  const adcResolver = opts.adcSourceResolver ?? resolveAdcSource;
  const adcSource = await adcResolver(env, { probeMetadataServer });

  const gcloudConfigDirFn = opts.gcloudConfigDirResolver ?? resolveGcloudConfigDir;
  const gcloudConfigDir = await gcloudConfigDirFn(env);

  const warnings = computeWarnings({
    env,
    apiKey,
    adc: adcBlock,
    credsExists,
    adcSource,
  });
  const fatal = warnings.some((w) => w.severity === 'fatal');

  const report: DoctorReport = {
    schema: 'nanobanana-adc-doctor/v1',
    generatedAt,
    cli: {
      path: opts.argv1,
      version: opts.version,
      installMethod: classifyInstallMethod(opts.argv1),
    },
    authRoute,
    apiKey,
    adc: adcBlock,
    gcpEnv: {
      GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT ?? null,
      GOOGLE_CLOUD_LOCATION: env.GOOGLE_CLOUD_LOCATION ?? null,
      GOOGLE_GENAI_USE_VERTEXAI: env.GOOGLE_GENAI_USE_VERTEXAI ?? null,
      GOOGLE_APPLICATION_CREDENTIALS: {
        path: credsPath,
        exists: credsExists,
      },
    },
    model: {
      default: 'gemini-3-pro-image-preview',
      note: 'requires GOOGLE_CLOUD_LOCATION=global on the ADC path',
    },
    adcSource,
    gcloudConfigDir,
    warnings,
    fatal,
  };

  if (opts.verbose) {
    const [gcloudAccount, gcloudProject, gcloudAdcFilePath] = await Promise.all([
      (opts.gcloudAccountFetcher ?? defaultGcloudAccountFetcher)().catch(() => undefined),
      (opts.gcloudProjectFetcher ?? defaultGcloudProjectFetcher)().catch(() => undefined),
      (opts.gcloudAdcFilePathFetcher ?? defaultGcloudAdcFilePathFetcher)().catch(
        () => undefined,
      ),
    ]);
    report.verbose = {
      ...(adcResult.tokenPrefix !== undefined ? { tokenPrefix: adcResult.tokenPrefix } : {}),
      ...(gcloudAccount !== undefined ? { gcloudAccount } : {}),
      ...(gcloudProject !== undefined ? { gcloudProject } : {}),
      ...(gcloudAdcFilePath !== undefined ? { gcloudAdcFilePath } : {}),
      nodeVersion: process.version,
      platform: `${process.platform}-${process.arch}`,
    };
  }

  return report;
}

// ───────────────────────────────────────────────────────────────────────────
// Renderers
// ───────────────────────────────────────────────────────────────────────────

export function renderDoctorJSON(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}

const KV_WIDTH = 34;

function kv(key: string, value: string | undefined, extra = ''): string {
  const v = value === undefined || value === '' ? '(unset)' : value;
  const colon = key + ':';
  const padded = colon.length >= KV_WIDTH ? colon + ' ' : colon.padEnd(KV_WIDTH, ' ');
  return `  ${padded}${v}${extra ? '   ' + extra : ''}`;
}

function severityMarker(sev: DoctorWarning['severity']): string {
  if (sev === 'info') return 'ⓘ';
  return '⚠';
}

function renderFileExtras(info: AdcSourceFileInfo): string {
  if (!info.exists) return '(not found)';
  const parts: string[] = ['exists'];
  if (info.size !== undefined) parts.push(`${info.size} B`);
  if (info.mtimeMs !== undefined) parts.push(new Date(info.mtimeMs).toISOString());
  return `(${parts.join(', ')})`;
}

function renderMetadataServer(ms: AdcSourceReport['metadataServer']): string {
  if (ms.probed) {
    if (ms.probeOk) return 'probed: ok (300ms)';
    return `probed: failed (${ms.probeError ?? 'unknown error'})`;
  }
  if (ms.envHeuristic === 'none') {
    return 'not probed (no GCE/Cloud Run env detected)';
  }
  return `not probed (heuristic: ${ms.envHeuristic})`;
}

function renderResolvedKind(kind: AdcSourceKind): string {
  // T16 §1.1 / §6.3: when kind === 'default', surface "(effective default)" in
  // text only. JSON keeps the raw 'default' literal so that v0.5 consumers
  // doing `if (kind === 'default')` continue to work.
  return kind === 'default' ? 'default (effective default)' : kind;
}

function renderGcloudConfigDirSourceLabel(source: GcloudConfigDirSource): string {
  return source === 'env-cloudsdk-config' ? 'env CLOUDSDK_CONFIG' : 'default ($HOME/.config/gcloud)';
}

function renderPresenceState(e: GcloudConfigDirEntry): string {
  if (e.state === 'exists' && e.entries !== undefined) {
    const word = e.entries === 1 ? 'entry' : 'entries';
    return `exists (${e.entries} ${word})`;
  }
  return e.state;
}

export function renderDoctorText(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push('nanobanana-adc doctor');
  lines.push('');

  lines.push('CLI');
  lines.push(kv('path', report.cli.path));
  lines.push(kv('version', report.cli.version));
  lines.push(kv('install', report.cli.installMethod));
  lines.push('');

  lines.push('Auth route');
  lines.push(kv('selected', report.authRoute.selected, `(${report.authRoute.reason})`));
  lines.push('');

  lines.push('API key');
  lines.push(kv('present', report.apiKey.present ? 'yes' : 'no'));
  if (report.apiKey.present) {
    lines.push(kv('prefix', report.apiKey.prefix ? `${report.apiKey.prefix}…` : undefined));
    lines.push(kv('length', report.apiKey.length !== undefined ? String(report.apiKey.length) : undefined));
    lines.push(kv('looks_valid', report.apiKey.looksValid ? 'yes' : 'no'));
  }
  lines.push('');

  lines.push('ADC');
  lines.push(kv('probed', report.adc.probed ? 'yes' : 'no'));
  lines.push(kv('status', report.adc.ok === true ? 'ok' : 'fail'));
  if (report.adc.account) lines.push(kv('account', report.adc.account));
  if (report.adc.project) lines.push(kv('project', report.adc.project));
  if (report.adc.tokenPrefix) lines.push(kv('token_prefix', `${report.adc.tokenPrefix}…`));
  if (report.adc.error) lines.push(kv('error', report.adc.error));
  lines.push('');

  lines.push('GCP env');
  lines.push(
    kv(
      'GOOGLE_CLOUD_PROJECT',
      report.gcpEnv.GOOGLE_CLOUD_PROJECT ?? undefined,
    ),
  );
  const loc = report.gcpEnv.GOOGLE_CLOUD_LOCATION;
  lines.push(
    kv(
      'GOOGLE_CLOUD_LOCATION',
      loc ?? undefined,
      loc && loc !== 'global' ? "⚠ not 'global'" : '',
    ),
  );
  lines.push(
    kv(
      'GOOGLE_GENAI_USE_VERTEXAI',
      report.gcpEnv.GOOGLE_GENAI_USE_VERTEXAI ?? undefined,
    ),
  );
  const credsPath = report.gcpEnv.GOOGLE_APPLICATION_CREDENTIALS.path;
  const credsExists = report.gcpEnv.GOOGLE_APPLICATION_CREDENTIALS.exists;
  const credsExtra =
    credsPath && credsExists === false ? '⚠ file not found' : '';
  lines.push(
    kv('GOOGLE_APPLICATION_CREDENTIALS', credsPath ?? undefined, credsExtra),
  );
  lines.push('');

  // Gcloud config dir (T16: directory-level state)
  const g = report.gcloudConfigDir;
  lines.push('Gcloud config dir');
  lines.push(kv('resolved', g.resolved));
  lines.push(kv('source', renderGcloudConfigDirSourceLabel(g.source)));
  lines.push('  presence:');
  lines.push(kv('  active_config', renderPresenceState(g.presence.activeConfig)));
  lines.push(kv('  configurations/', renderPresenceState(g.presence.configurations)));
  lines.push(kv('  credentials.db', renderPresenceState(g.presence.credentialsDb)));
  lines.push(kv('  access_tokens.db', renderPresenceState(g.presence.accessTokensDb)));
  lines.push(
    kv(
      '  application_default_credentials.json',
      renderPresenceState(g.presence.applicationDefaultCredentialsJson),
    ),
  );
  lines.push(kv('  legacy_credentials/', renderPresenceState(g.presence.legacyCredentials)));
  if (g.note !== undefined) {
    lines.push(kv('note', g.note));
  }
  lines.push('');

  // ADC source
  const a = report.adcSource;
  lines.push('ADC source');
  lines.push(kv('resolved', renderResolvedKind(a.resolved)));
  if (a.envCredentials === null) {
    lines.push(kv('env GOOGLE_APPLICATION_CREDENTIALS', undefined));
  } else {
    lines.push(
      kv(
        'env GOOGLE_APPLICATION_CREDENTIALS',
        a.envCredentials.path,
        renderFileExtras(a.envCredentials),
      ),
    );
  }
  lines.push(
    kv('effective default', a.effectiveDefault.path, renderFileExtras(a.effectiveDefault)),
  );
  lines.push(kv('metadata server', renderMetadataServer(a.metadataServer)));
  if (a.meta === null) {
    lines.push(kv('meta', '(not available — file unreadable or not parsed)'));
  } else {
    lines.push(kv('type', a.meta.type));
    if (a.meta.quotaProjectId !== undefined) {
      lines.push(kv('quotaProjectId', a.meta.quotaProjectId));
    }
    if (a.meta.clientId !== undefined) {
      lines.push(kv('clientId', a.meta.clientId));
    }
    if (a.meta.clientEmail !== undefined) {
      lines.push(kv('clientEmail', a.meta.clientEmail));
    }
  }
  if (a.account !== undefined) {
    lines.push(kv('account', a.account));
  } else if (a.accountError !== undefined) {
    lines.push(kv('account', `<unresolved (${a.accountError})>`));
  }
  lines.push('');

  lines.push('Model');
  lines.push(kv('default', report.model.default));
  lines.push(kv('note', report.model.note));
  lines.push('');

  lines.push(`Warnings (${report.warnings.length})`);
  if (report.warnings.length === 0) {
    lines.push('  (none)');
  } else {
    for (const w of report.warnings) {
      lines.push(`  ${severityMarker(w.severity)} [${w.code}] ${w.message}`);
    }
  }

  if (report.verbose) {
    lines.push('');
    lines.push('Verbose');
    if (report.verbose.tokenPrefix) {
      lines.push(kv('token_prefix', `${report.verbose.tokenPrefix}…`));
    }
    if (report.verbose.gcloudAccount) {
      lines.push(kv('gcloud_account', report.verbose.gcloudAccount));
    }
    if (report.verbose.gcloudProject) {
      lines.push(kv('gcloud_project', report.verbose.gcloudProject));
    }
    if (report.verbose.gcloudAdcFilePath) {
      lines.push(kv('gcloud_adc_file_path', report.verbose.gcloudAdcFilePath));
    }
    if (report.verbose.nodeVersion) {
      lines.push(kv('node_version', report.verbose.nodeVersion));
    }
    if (report.verbose.platform) {
      lines.push(kv('platform', report.verbose.platform));
    }
  }

  lines.push('');
  return lines.join('\n');
}
