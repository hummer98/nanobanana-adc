import test from 'node:test';
import assert from 'node:assert/strict';
import { Command, CommanderError } from 'commander';

import {
  resolveConfigDir,
  resolveQuotaProject,
  buildLoginPlan,
  renderDryRun,
  runAuthLogin,
  type LoginDeps,
} from './auth-login.js';
import { buildAuthLoginCommand } from './cli.js';

interface Harness {
  deps: LoginDeps;
  stdoutChunks: string[];
  stderrChunks: string[];
  spawnCalls: Array<{ cmd: string; args: string[]; env: NodeJS.ProcessEnv }>;
  mkdirCalls: string[];
  readonly whichGcloudCalls: number;
}

function makeDeps(overrides: Partial<LoginDeps> = {}): Harness {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const fakeStdout: NodeJS.WritableStream = {
    write: (s: string) => {
      stdoutChunks.push(typeof s === 'string' ? s : String(s));
      return true;
    },
  } as NodeJS.WritableStream;
  const fakeStderr: NodeJS.WritableStream = {
    write: (s: string) => {
      stderrChunks.push(typeof s === 'string' ? s : String(s));
      return true;
    },
  } as NodeJS.WritableStream;
  const spawnCalls: Array<{ cmd: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
  const mkdirCalls: string[] = [];
  let whichGcloudCalls = 0;

  const deps: LoginDeps = {
    whichGcloud: async () => {
      whichGcloudCalls++;
      return '/usr/bin/gcloud';
    },
    env: {},
    mkdirP: async (p: string) => {
      mkdirCalls.push(p);
    },
    spawn: async (cmd, args, opts) => {
      spawnCalls.push({ cmd, args, env: opts.env });
      return { exitCode: 0 };
    },
    stdout: fakeStdout,
    stderr: fakeStderr,
    ...overrides,
  };
  return {
    deps,
    stdoutChunks,
    stderrChunks,
    spawnCalls,
    mkdirCalls,
    get whichGcloudCalls() {
      return whichGcloudCalls;
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// A. resolveConfigDir
// ───────────────────────────────────────────────────────────────────────────

test('1. resolveConfigDir: --config-dir flag wins over env and GAC', () => {
  const r = resolveConfigDir(
    { configDir: '/x' },
    {
      CLOUDSDK_CONFIG: '/y',
      GOOGLE_APPLICATION_CREDENTIALS: '/z/application_default_credentials.json',
    },
  );
  assert.deepEqual(r, { kind: 'ok', path: '/x', source: 'flag' });
});

test('2. resolveConfigDir: env CLOUDSDK_CONFIG used when flag absent', () => {
  const r = resolveConfigDir({}, { CLOUDSDK_CONFIG: '/y' });
  assert.deepEqual(r, { kind: 'ok', path: '/y', source: 'env' });
});

test('3. resolveConfigDir: GAC dirname used when basename === ADC json', () => {
  const r = resolveConfigDir(
    {},
    { GOOGLE_APPLICATION_CREDENTIALS: '/Users/me/.config/gcloud/application_default_credentials.json' },
  );
  assert.deepEqual(r, {
    kind: 'ok',
    path: '/Users/me/.config/gcloud',
    source: 'gac-dirname',
  });
});

test('4. resolveConfigDir: GAC service-account JSON basename → fail', () => {
  const r = resolveConfigDir(
    {},
    { GOOGLE_APPLICATION_CREDENTIALS: '/secrets/sa-key.json' },
  );
  assert.equal(r.kind, 'fail');
  if (r.kind === 'fail') {
    assert.match(r.message, /service-account JSON/);
  }
});

test('5. resolveConfigDir: nothing set → gcloud-default with path null', () => {
  const r = resolveConfigDir({}, {});
  assert.deepEqual(r, { kind: 'ok', path: null, source: 'gcloud-default' });
});

test('6. resolveConfigDir: flag wins over env when both set', () => {
  const r = resolveConfigDir({ configDir: '/x' }, { CLOUDSDK_CONFIG: '/y' });
  assert.deepEqual(r, { kind: 'ok', path: '/x', source: 'flag' });
});

// ───────────────────────────────────────────────────────────────────────────
// B. resolveQuotaProject
// ───────────────────────────────────────────────────────────────────────────

test('7. resolveQuotaProject: --quota-project flag wins', () => {
  const r = resolveQuotaProject({ quotaProject: 'p1' }, { GOOGLE_CLOUD_PROJECT: 'env-proj' });
  assert.deepEqual(r, { action: 'set', projectId: 'p1', reason: 'flag' });
});

test('8. resolveQuotaProject: --no-quota-project skips even if env set', () => {
  const r = resolveQuotaProject({ quotaProject: false }, { GOOGLE_CLOUD_PROJECT: 'env-proj' });
  assert.deepEqual(r, { action: 'skip', reason: 'no-flag' });
});

test('9. resolveQuotaProject: GOOGLE_CLOUD_PROJECT used when no flag', () => {
  const r = resolveQuotaProject({}, { GOOGLE_CLOUD_PROJECT: 'p2' });
  assert.deepEqual(r, { action: 'set', projectId: 'p2', reason: 'env' });
});

test('10. resolveQuotaProject: nothing set → skip with reason unset', () => {
  const r = resolveQuotaProject({}, {});
  assert.deepEqual(r, { action: 'skip', reason: 'unset' });
});

// ───────────────────────────────────────────────────────────────────────────
// C. runAuthLogin orchestrator
// ───────────────────────────────────────────────────────────────────────────

test('11. runAuthLogin: gcloud not on PATH (non-dry-run) → exit 1', async () => {
  const h = makeDeps({ whichGcloud: async () => undefined });
  const code = await runAuthLogin({}, h.deps);
  assert.equal(code, 1);
  assert.equal(h.spawnCalls.length, 0);
  assert.match(h.stderrChunks.join(''), /gcloud SDK が必要です/);
});

test('12. runAuthLogin: GAC service-account JSON → exit 1, no spawn', async () => {
  const h = makeDeps({
    env: { GOOGLE_APPLICATION_CREDENTIALS: '/secrets/sa-key.json' },
  });
  const code = await runAuthLogin({}, h.deps);
  assert.equal(code, 1);
  assert.equal(h.spawnCalls.length, 0);
  assert.equal(h.whichGcloudCalls, 0);
  assert.match(h.stderrChunks.join(''), /service-account JSON/);
});

test('13. runAuthLogin: dry-run prints plan without spawn or whichGcloud', async () => {
  const h = makeDeps({});
  const code = await runAuthLogin(
    { dryRun: true, configDir: '/tmp/cd', quotaProject: 'p', scopes: 'https://www.googleapis.com/auth/cloud-platform' },
    h.deps,
  );
  assert.equal(code, 0);
  assert.equal(h.spawnCalls.length, 0);
  assert.equal(h.whichGcloudCalls, 0);
  assert.match(h.stdoutChunks.join(''), /\[auth-login\] dry-run plan/);
  assert.match(h.stdoutChunks.join(''), /dry-run: gcloud は起動しません/);
});

test('14. runAuthLogin: happy path with --quota-project chains 2 spawns', async () => {
  const h = makeDeps({});
  const code = await runAuthLogin(
    { configDir: '/tmp/cd', quotaProject: 'pp' },
    h.deps,
  );
  assert.equal(code, 0);
  assert.equal(h.spawnCalls.length, 2);
  assert.equal(h.spawnCalls[0]?.env.CLOUDSDK_CONFIG, '/tmp/cd');
  assert.equal(h.spawnCalls[1]?.env.CLOUDSDK_CONFIG, '/tmp/cd');
  assert.deepEqual(h.spawnCalls[0]?.args, ['auth', 'application-default', 'login']);
  assert.deepEqual(h.spawnCalls[1]?.args, [
    'auth',
    'application-default',
    'set-quota-project',
    'pp',
  ]);
});

test('15. runAuthLogin: --no-quota-project skips quota call', async () => {
  const h = makeDeps({ env: { GOOGLE_CLOUD_PROJECT: 'env-proj' } });
  const code = await runAuthLogin(
    { configDir: '/tmp/cd', quotaProject: false },
    h.deps,
  );
  assert.equal(code, 0);
  assert.equal(h.spawnCalls.length, 1);
});

test('16. runAuthLogin: GOOGLE_CLOUD_PROJECT auto-quota when no flag', async () => {
  const h = makeDeps({ env: { GOOGLE_CLOUD_PROJECT: 'env-proj' } });
  const code = await runAuthLogin({ configDir: '/tmp/cd' }, h.deps);
  assert.equal(code, 0);
  assert.equal(h.spawnCalls.length, 2);
  assert.equal(h.spawnCalls[1]?.args[3], 'env-proj');
});

test('17. runAuthLogin: no quota anywhere → notice on stdout, 1 spawn', async () => {
  const h = makeDeps({});
  const code = await runAuthLogin({ configDir: '/tmp/cd' }, h.deps);
  assert.equal(code, 0);
  assert.equal(h.spawnCalls.length, 1);
  const out = h.stdoutChunks.join('');
  assert.match(out, /notice: GOOGLE_CLOUD_PROJECT 未設定/);
  assert.match(out, /quota project: skipped \(source: unset\)/);
});

test('18. runAuthLogin: login spawn non-zero exit propagates, no quota call', async () => {
  let n = 0;
  const h = makeDeps({
    spawn: async (_cmd, _args, _opts) => {
      n++;
      return { exitCode: 7 };
    },
  });
  const code = await runAuthLogin(
    { configDir: '/tmp/cd', quotaProject: 'p' },
    h.deps,
  );
  assert.equal(code, 7);
  assert.equal(n, 1);
});

test('19. runAuthLogin: set-quota-project non-zero propagates as failure', async () => {
  let n = 0;
  const h = makeDeps({
    spawn: async (_cmd, _args, _opts) => {
      n++;
      if (n === 1) return { exitCode: 0 };
      return { exitCode: 9 };
    },
  });
  const code = await runAuthLogin(
    { configDir: '/tmp/cd', quotaProject: 'p' },
    h.deps,
  );
  assert.equal(code, 9);
  assert.equal(n, 2);
});

test('20. runAuthLogin: --scopes appends --scopes=<csv> to login argv', async () => {
  const h = makeDeps({});
  const code = await runAuthLogin(
    {
      configDir: '/tmp/cd',
      quotaProject: false,
      scopes: 'https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/drive',
    },
    h.deps,
  );
  assert.equal(code, 0);
  const args = h.spawnCalls[0]?.args ?? [];
  assert.ok(
    args.includes(
      '--scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/drive',
    ),
    `expected --scopes=... in argv but got ${JSON.stringify(args)}`,
  );
});

test('21. runAuthLogin: gcloud-default config drops CLOUDSDK_CONFIG from child env', async () => {
  const h = makeDeps({ env: { CLOUDSDK_CONFIG: '' } });
  const code = await runAuthLogin({ quotaProject: false }, h.deps);
  assert.equal(code, 0);
  assert.equal(h.spawnCalls[0]?.env.CLOUDSDK_CONFIG, undefined);
  assert.match(h.stdoutChunks.join(''), /\(source: gcloud-default\)/);
});

test('22. runAuthLogin: --verbose prints the spawn argv', async () => {
  const h = makeDeps({});
  const code = await runAuthLogin(
    { configDir: '/tmp/cd', quotaProject: false, verbose: true },
    h.deps,
  );
  assert.equal(code, 0);
  assert.match(h.stdoutChunks.join(''), /running: gcloud auth application-default login/);
});

// ───────────────────────────────────────────────────────────────────────────
// rev2 added: 23-31
// ───────────────────────────────────────────────────────────────────────────

test('23. runAuthLogin: --config-dir triggers mkdirP for the path', async () => {
  const h = makeDeps({});
  await runAuthLogin({ configDir: '/tmp/cd', quotaProject: false }, h.deps);
  assert.ok(h.mkdirCalls.includes('/tmp/cd'), `mkdirCalls=${JSON.stringify(h.mkdirCalls)}`);
});

test('24. runAuthLogin: env source triggers mkdirP for the inherited path', async () => {
  const h = makeDeps({ env: { CLOUDSDK_CONFIG: '/y' } });
  await runAuthLogin({ quotaProject: false }, h.deps);
  assert.ok(h.mkdirCalls.includes('/y'), `mkdirCalls=${JSON.stringify(h.mkdirCalls)}`);
});

test('25. runAuthLogin: gac-dirname source triggers mkdirP for the dirname', async () => {
  const h = makeDeps({
    env: {
      GOOGLE_APPLICATION_CREDENTIALS:
        '/Users/me/.config/gcloud/application_default_credentials.json',
    },
  });
  await runAuthLogin({ quotaProject: false }, h.deps);
  assert.ok(
    h.mkdirCalls.includes('/Users/me/.config/gcloud'),
    `mkdirCalls=${JSON.stringify(h.mkdirCalls)}`,
  );
});

test('26. runAuthLogin: gcloud-default source does NOT call mkdirP', async () => {
  const h = makeDeps({});
  await runAuthLogin({ quotaProject: false }, h.deps);
  assert.equal(h.mkdirCalls.length, 0);
});

test('27. runAuthLogin: env source does NOT inject CLOUDSDK_CONFIG via envOverride.set', async () => {
  // Verify the buildLoginPlan envOverride for env source first
  const plan = buildLoginPlan({}, { CLOUDSDK_CONFIG: '/y' });
  assert.equal(plan.kind, 'ok');
  if (plan.kind !== 'ok') return;
  assert.equal(plan.envOverride.set, undefined);
  assert.equal((plan.envOverride.unset ?? []).length, 0);

  // And that runAuthLogin passes the parent CLOUDSDK_CONFIG through unchanged
  const h = makeDeps({ env: { CLOUDSDK_CONFIG: '/y' } });
  await runAuthLogin({ quotaProject: false }, h.deps);
  assert.equal(h.spawnCalls[0]?.env.CLOUDSDK_CONFIG, '/y');
});

test('28. runAuthLogin: spawn error event maps to exit 127', async () => {
  const h = makeDeps({
    spawn: async (_cmd, _args, _opts) => ({ exitCode: 127, signal: null }),
  });
  const code = await runAuthLogin({ configDir: '/tmp/cd', quotaProject: false }, h.deps);
  assert.equal(code, 127);
  assert.match(h.stderrChunks.join(''), /exited with code 127/);
});

test('29. commander: --quota-project "" fails via argParser', () => {
  const cmd = buildAuthLoginCommand(async () => {
    /* noop */
  });
  cmd.exitOverride();
  let threw = false;
  try {
    cmd.parse(['--quota-project', ''], { from: 'user' });
  } catch (err) {
    threw = true;
    assert.ok(err instanceof CommanderError);
  }
  assert.ok(threw, 'expected commander to throw on empty --quota-project');
});

test('30. commander: --scopes "" fails via argParser', () => {
  const cmd = buildAuthLoginCommand(async () => {
    /* noop */
  });
  cmd.exitOverride();
  let threw = false;
  try {
    cmd.parse(['--scopes', ''], { from: 'user' });
  } catch (err) {
    threw = true;
    assert.ok(err instanceof CommanderError);
  }
  assert.ok(threw, 'expected commander to throw on empty --scopes');
});

test('31. commander spike: --quota-project / --no-quota-project coexistence (last wins)', () => {
  const parseOpts = (argv: string[]): Record<string, unknown> => {
    const cmd = buildAuthLoginCommand(async () => {
      /* noop */
    });
    cmd.exitOverride();
    cmd.parse(argv, { from: 'user' });
    return cmd.opts() as Record<string, unknown>;
  };

  assert.equal(parseOpts([]).quotaProject, undefined);
  assert.equal(parseOpts(['--quota-project', 'p']).quotaProject, 'p');
  assert.equal(parseOpts(['--no-quota-project']).quotaProject, false);
  assert.equal(parseOpts(['--quota-project', 'p', '--no-quota-project']).quotaProject, false);
  assert.equal(parseOpts(['--no-quota-project', '--quota-project', 'p']).quotaProject, 'p');
});

// ───────────────────────────────────────────────────────────────────────────
// D. renderDryRun snapshots (4 sources)
// ───────────────────────────────────────────────────────────────────────────

test('32. renderDryRun: source === flag (config-dir + quota + scopes)', () => {
  const plan = buildLoginPlan(
    {
      configDir: '/tmp/cd',
      quotaProject: 'p',
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    },
    {},
  );
  assert.equal(plan.kind, 'ok');
  if (plan.kind !== 'ok') return;
  const out = renderDryRun(plan);
  const expected = [
    '[auth-login] dry-run plan',
    '  config dir: /tmp/cd (source: flag)',
    '  quota project: p (source: flag)',
    '  scopes: https://www.googleapis.com/auth/cloud-platform',
    '  command: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform',
    '  command: gcloud auth application-default set-quota-project p',
    '  env override: CLOUDSDK_CONFIG=/tmp/cd',
    '[auth-login] dry-run: gcloud は起動しません',
    '',
  ].join('\n');
  assert.equal(out, expected);
});

test('33. renderDryRun: source === env (no quota, no scopes, parent inherited)', () => {
  const plan = buildLoginPlan({ quotaProject: false }, { CLOUDSDK_CONFIG: '/existing/path' });
  assert.equal(plan.kind, 'ok');
  if (plan.kind !== 'ok') return;
  const out = renderDryRun(plan);
  const expected = [
    '[auth-login] dry-run plan',
    '  config dir: /existing/path (source: env)',
    '  quota project: skipped (source: no-flag)',
    '  scopes: <gcloud default>',
    '  command: gcloud auth application-default login',
    '  env: inherited from parent (CLOUDSDK_CONFIG=/existing/path)',
    '[auth-login] dry-run: gcloud は起動しません',
    '',
  ].join('\n');
  assert.equal(out, expected);
});

test('34. renderDryRun: source === gac-dirname (env auto-quota, gcloud default scopes)', () => {
  const plan = buildLoginPlan(
    {},
    {
      GOOGLE_APPLICATION_CREDENTIALS:
        '/Users/me/.config/gcloud/application_default_credentials.json',
      GOOGLE_CLOUD_PROJECT: 'my-proj',
    },
  );
  assert.equal(plan.kind, 'ok');
  if (plan.kind !== 'ok') return;
  const out = renderDryRun(plan);
  const expected = [
    '[auth-login] dry-run plan',
    '  config dir: /Users/me/.config/gcloud (source: gac-dirname)',
    '  quota project: my-proj (source: env)',
    '  scopes: <gcloud default>',
    '  command: gcloud auth application-default login',
    '  command: gcloud auth application-default set-quota-project my-proj',
    '  env override: CLOUDSDK_CONFIG=/Users/me/.config/gcloud',
    '[auth-login] dry-run: gcloud は起動しません',
    '',
  ].join('\n');
  assert.equal(out, expected);
});

test('35. renderDryRun: source === gcloud-default (no quota, no scopes, env unset)', () => {
  const plan = buildLoginPlan({ quotaProject: false }, {});
  assert.equal(plan.kind, 'ok');
  if (plan.kind !== 'ok') return;
  const out = renderDryRun(plan);
  const expected = [
    '[auth-login] dry-run plan',
    '  config dir: <gcloud default> (source: gcloud-default)',
    '  quota project: skipped (source: no-flag)',
    '  scopes: <gcloud default>',
    '  command: gcloud auth application-default login',
    '  env: CLOUDSDK_CONFIG unset (gcloud uses OS default)',
    '[auth-login] dry-run: gcloud は起動しません',
    '',
  ].join('\n');
  assert.equal(out, expected);
});

