import { realpathSync, existsSync } from 'node:fs';
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
  | 'API_KEY_FORMAT_SUSPECT';

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

export function computeWarnings(ctx: WarnCtx): DoctorWarning[] {
  const fns = [
    warnNoAuth,
    warnShadowsAdc,
    warnLocationNotGlobal,
    warnLocationMissing,
    warnCredsFileMissing,
    warnUseVertexaiNotTrue,
    warnApiKeyFormatSuspect,
  ];
  return fns
    .map((f) => f(ctx))
    .filter((w): w is DoctorWarning => w !== null);
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

  const warnings = computeWarnings({
    env,
    apiKey,
    adc: adcBlock,
    credsExists,
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
  const padded = (key + ':').padEnd(KV_WIDTH, ' ');
  return `  ${padded}${v}${extra ? '   ' + extra : ''}`;
}

function severityMarker(sev: DoctorWarning['severity']): string {
  if (sev === 'info') return 'ⓘ';
  return '⚠';
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
