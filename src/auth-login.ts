import { spawn as nodeSpawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { delimiter, dirname, basename, join } from 'node:path';

export interface LoginCliOptions {
  configDir?: string;
  quotaProject?: string | false;
  scopes?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface SpawnResult {
  exitCode: number;
  signal?: NodeJS.Signals | null;
}

export interface SpawnFn {
  (
    cmd: string,
    args: string[],
    opts: { env: NodeJS.ProcessEnv; stdio: 'inherit' | 'pipe' },
  ): Promise<SpawnResult>;
}

export interface LoginDeps {
  whichGcloud: () => Promise<string | undefined>;
  env: NodeJS.ProcessEnv;
  mkdirP: (path: string) => Promise<void>;
  spawn: SpawnFn;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

export type ConfigDirSource = 'flag' | 'env' | 'gac-dirname' | 'gcloud-default';

export type ResolvedConfigDir =
  | { kind: 'ok'; path: string | null; source: ConfigDirSource }
  | { kind: 'fail'; message: string };

export interface ResolvedQuotaProject {
  action: 'set' | 'skip';
  projectId?: string;
  reason: 'flag' | 'env' | 'no-flag' | 'unset';
}

export interface EnvOverride {
  set?: Partial<NodeJS.ProcessEnv>;
  unset?: Array<string>;
}

export type LoginPlan =
  | {
      kind: 'ok';
      configDir: Extract<ResolvedConfigDir, { kind: 'ok' }>;
      quota: ResolvedQuotaProject;
      scopesCsv?: string;
      loginArgv: string[];
      quotaArgv?: string[];
      envOverride: EnvOverride;
    }
  | { kind: 'fail'; message: string };

const ADC_BASENAME = 'application_default_credentials.json';

function nonEmptyString(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function resolveConfigDir(
  cliOptions: Pick<LoginCliOptions, 'configDir'>,
  envSnapshot: Pick<NodeJS.ProcessEnv, 'CLOUDSDK_CONFIG' | 'GOOGLE_APPLICATION_CREDENTIALS'>,
): ResolvedConfigDir {
  if (nonEmptyString(cliOptions.configDir)) {
    return { kind: 'ok', path: cliOptions.configDir, source: 'flag' };
  }
  if (nonEmptyString(envSnapshot.CLOUDSDK_CONFIG)) {
    return { kind: 'ok', path: envSnapshot.CLOUDSDK_CONFIG, source: 'env' };
  }
  const gac = envSnapshot.GOOGLE_APPLICATION_CREDENTIALS;
  if (nonEmptyString(gac)) {
    if (basename(gac) === ADC_BASENAME) {
      return { kind: 'ok', path: dirname(gac), source: 'gac-dirname' };
    }
    return {
      kind: 'fail',
      message:
        `GOOGLE_APPLICATION_CREDENTIALS は service-account JSON を指しているように見えます (${gac})。` +
        '`auth login` は ADC slot 用なので `--config-dir` で明示してください。',
    };
  }
  return { kind: 'ok', path: null, source: 'gcloud-default' };
}

export function resolveQuotaProject(
  cliOptions: Pick<LoginCliOptions, 'quotaProject'>,
  envSnapshot: Pick<NodeJS.ProcessEnv, 'GOOGLE_CLOUD_PROJECT'>,
): ResolvedQuotaProject {
  if (cliOptions.quotaProject === false) {
    return { action: 'skip', reason: 'no-flag' };
  }
  if (typeof cliOptions.quotaProject === 'string' && cliOptions.quotaProject.length > 0) {
    return { action: 'set', projectId: cliOptions.quotaProject, reason: 'flag' };
  }
  const envProj = envSnapshot.GOOGLE_CLOUD_PROJECT;
  if (nonEmptyString(envProj)) {
    return { action: 'set', projectId: envProj, reason: 'env' };
  }
  return { action: 'skip', reason: 'unset' };
}

export function buildLoginPlan(
  cliOptions: LoginCliOptions,
  envSnapshot: Pick<
    NodeJS.ProcessEnv,
    'CLOUDSDK_CONFIG' | 'GOOGLE_APPLICATION_CREDENTIALS' | 'GOOGLE_CLOUD_PROJECT'
  >,
): LoginPlan {
  const configDir = resolveConfigDir(cliOptions, envSnapshot);
  if (configDir.kind === 'fail') {
    return { kind: 'fail', message: configDir.message };
  }
  const quota = resolveQuotaProject(cliOptions, envSnapshot);

  const loginArgv: string[] = ['auth', 'application-default', 'login'];
  let scopesCsv: string | undefined;
  if (nonEmptyString(cliOptions.scopes)) {
    scopesCsv = cliOptions.scopes;
    loginArgv.push(`--scopes=${cliOptions.scopes}`);
  }

  let quotaArgv: string[] | undefined;
  if (quota.action === 'set' && quota.projectId) {
    quotaArgv = ['auth', 'application-default', 'set-quota-project', quota.projectId];
  }

  let envOverride: EnvOverride;
  switch (configDir.source) {
    case 'flag':
    case 'gac-dirname':
      envOverride = { set: { CLOUDSDK_CONFIG: configDir.path as string } };
      break;
    case 'env':
      envOverride = {};
      break;
    case 'gcloud-default':
      envOverride = { unset: ['CLOUDSDK_CONFIG'] };
      break;
  }

  return {
    kind: 'ok',
    configDir,
    quota,
    scopesCsv,
    loginArgv,
    quotaArgv,
    envOverride,
  };
}

export function renderDryRun(plan: Extract<LoginPlan, { kind: 'ok' }>): string {
  const lines: string[] = [];
  lines.push('[auth-login] dry-run plan');

  const cd = plan.configDir;
  if (cd.source === 'gcloud-default') {
    lines.push(`  config dir: <gcloud default> (source: gcloud-default)`);
  } else {
    lines.push(`  config dir: ${cd.path} (source: ${cd.source})`);
  }

  if (plan.quota.action === 'set') {
    lines.push(`  quota project: ${plan.quota.projectId} (source: ${plan.quota.reason})`);
  } else {
    lines.push(`  quota project: skipped (source: ${plan.quota.reason})`);
  }

  if (plan.scopesCsv) {
    lines.push(`  scopes: ${plan.scopesCsv}`);
  } else {
    lines.push(`  scopes: <gcloud default>`);
  }

  lines.push(`  command: gcloud ${plan.loginArgv.join(' ')}`);
  if (plan.quotaArgv) {
    lines.push(`  command: gcloud ${plan.quotaArgv.join(' ')}`);
  }

  switch (cd.source) {
    case 'flag':
    case 'gac-dirname':
      lines.push(`  env override: CLOUDSDK_CONFIG=${cd.path}`);
      break;
    case 'env':
      lines.push(`  env: inherited from parent (CLOUDSDK_CONFIG=${cd.path})`);
      break;
    case 'gcloud-default':
      lines.push(`  env: CLOUDSDK_CONFIG unset (gcloud uses OS default)`);
      break;
  }

  lines.push('[auth-login] dry-run: gcloud は起動しません');
  return lines.join('\n') + '\n';
}

async function whichGcloudDefault(): Promise<string | undefined> {
  const path = process.env.PATH ?? '';
  if (path.length === 0) return undefined;
  const candidates =
    process.platform === 'win32'
      ? ['gcloud.cmd', 'gcloud.bat', 'gcloud.exe']
      : ['gcloud'];
  const { existsSync } = await import('node:fs');
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    for (const c of candidates) {
      const full = join(dir, c);
      try {
        if (existsSync(full)) return full;
      } catch {
        // ignore
      }
    }
  }
  return undefined;
}

function defaultDeps(): LoginDeps {
  return {
    whichGcloud: whichGcloudDefault,
    env: process.env,
    mkdirP: async (p: string) => {
      await mkdir(p, { recursive: true });
    },
    spawn: (cmd, args, opts) =>
      new Promise<SpawnResult>((resolve) => {
        const child = nodeSpawn(cmd, args, opts);
        child.on('error', (err) => {
          process.stderr.write(`[auth-login] error: failed to spawn gcloud (${err.message})\n`);
          resolve({ exitCode: 127, signal: null });
        });
        child.on('exit', (code, signal) => resolve({ exitCode: code ?? 1, signal }));
      }),
    stdout: process.stdout,
    stderr: process.stderr,
  };
}

function fmtConfigDirLine(cd: Extract<ResolvedConfigDir, { kind: 'ok' }>): string {
  switch (cd.source) {
    case 'flag':
      return `[auth-login] using config dir: ${cd.path} (source: flag)\n`;
    case 'env':
      return `[auth-login] using config dir: ${cd.path} (source: env, inherited)\n`;
    case 'gac-dirname':
      return `[auth-login] using config dir: ${cd.path} (source: gac-dirname)\n`;
    case 'gcloud-default':
      return `[auth-login] using config dir: <gcloud default> (source: gcloud-default)\n`;
  }
}

function fmtQuotaLine(q: ResolvedQuotaProject): string {
  if (q.action === 'set') {
    return `[auth-login] quota project: ${q.projectId} (source: ${q.reason})\n`;
  }
  return `[auth-login] quota project: skipped (source: ${q.reason})\n`;
}

export async function runAuthLogin(
  cliOptions: LoginCliOptions,
  deps?: Partial<LoginDeps>,
): Promise<number> {
  const merged: LoginDeps = { ...defaultDeps(), ...deps };

  const plan = buildLoginPlan(cliOptions, merged.env as Pick<
    NodeJS.ProcessEnv,
    'CLOUDSDK_CONFIG' | 'GOOGLE_APPLICATION_CREDENTIALS' | 'GOOGLE_CLOUD_PROJECT'
  >);
  if (plan.kind === 'fail') {
    merged.stderr.write(`[auth-login] error: ${plan.message}\n`);
    return 1;
  }

  if (cliOptions.dryRun) {
    merged.stdout.write(renderDryRun(plan));
    return 0;
  }

  let gcloudPath: string | undefined;
  try {
    gcloudPath = await merged.whichGcloud();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    merged.stderr.write(`[auth-login] error: ${msg}\n`);
    return 1;
  }
  if (!gcloudPath) {
    merged.stderr.write(
      '[auth-login] error: gcloud SDK が必要です。https://cloud.google.com/sdk/docs/install を参照してインストールしてください。\n',
    );
    return 1;
  }

  merged.stdout.write(fmtConfigDirLine(plan.configDir));

  const childEnv: NodeJS.ProcessEnv = { ...merged.env, ...(plan.envOverride.set ?? {}) };
  for (const k of plan.envOverride.unset ?? []) {
    delete childEnv[k];
  }

  if (plan.configDir.path !== null) {
    try {
      await merged.mkdirP(plan.configDir.path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      merged.stderr.write(`[auth-login] error: failed to mkdir ${plan.configDir.path}: ${msg}\n`);
      return 1;
    }
  }

  if (cliOptions.verbose) {
    merged.stdout.write(`[auth-login] running: gcloud ${plan.loginArgv.join(' ')}\n`);
  }

  const loginRes = await merged.spawn(gcloudPath, plan.loginArgv, {
    env: childEnv,
    stdio: 'inherit',
  });
  if (loginRes.exitCode !== 0) {
    merged.stderr.write(`[auth-login] error: gcloud login exited with code ${loginRes.exitCode}\n`);
    return loginRes.exitCode;
  }

  merged.stdout.write(fmtQuotaLine(plan.quota));

  if (plan.quotaArgv) {
    if (cliOptions.verbose) {
      merged.stdout.write(`[auth-login] running: gcloud ${plan.quotaArgv.join(' ')}\n`);
    }
    const quotaRes = await merged.spawn(gcloudPath, plan.quotaArgv, {
      env: childEnv,
      stdio: 'inherit',
    });
    if (quotaRes.exitCode !== 0) {
      merged.stderr.write(
        `[auth-login] error: set-quota-project exited with code ${quotaRes.exitCode}; login 自体は成功しています。手動で再実行してください: gcloud auth application-default set-quota-project ${plan.quota.projectId}\n`,
      );
      return quotaRes.exitCode;
    }
  } else if (plan.quota.reason === 'unset') {
    merged.stdout.write(
      '[auth-login] notice: GOOGLE_CLOUD_PROJECT 未設定のため set-quota-project を実行しませんでした。後から `gcloud auth application-default set-quota-project <ID>` を実行するか、`--quota-project <ID>` 付きで auth login を再実行してください。\n',
    );
  }

  merged.stdout.write('[auth-login] done\n');
  return 0;
}
