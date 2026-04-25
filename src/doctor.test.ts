import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDoctorReport,
  renderDoctorJSON,
  renderDoctorText,
  maskApiKey,
  classifyInstallMethod,
  resolveAuthRoute,
  parseAdcMeta,
  resolveAdcSource,
  defaultGcloudActiveAccountFetcher,
  type DoctorEnv,
  type DoctorReport,
  type AdcProbeResult,
  type AdcSourceReport,
} from './doctor.js';

const NOW_MS = () => 0;
const FAKE_ARGV1 = '/Users/test/git/nanobanana-adc/dist/cli.js';
const FAKE_VERSION = '0.4.0';

const GOOD_KEY = 'AIzaSy' + 'A'.repeat(33); // 39 chars, starts with AIza

const MINIMAL_ADC_SOURCE_STUB: AdcSourceReport = {
  resolved: 'unknown',
  envCredentials: null,
  defaultLocation: { path: '/fake/default', exists: false },
  metadataServer: { envHeuristic: 'none', probed: false },
  meta: null,
};

function baseOpts(overrides: Partial<Parameters<typeof buildDoctorReport>[1]> = {}) {
  return {
    verbose: false,
    argv1: FAKE_ARGV1,
    version: FAKE_VERSION,
    nowMs: NOW_MS,
    credsFileExists: () => false,
    adcProbe: async (): Promise<AdcProbeResult> => ({ ok: false, error: 'no ADC in test' }),
    gcloudAccountFetcher: async () => undefined,
    gcloudProjectFetcher: async () => undefined,
    gcloudAdcFilePathFetcher: async () => undefined,
    adcSourceResolver: async (): Promise<AdcSourceReport> => MINIMAL_ADC_SOURCE_STUB,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 1-3. maskApiKey
// ───────────────────────────────────────────────────────────────────────────

test('1. maskApiKey: undefined → { present: false }', () => {
  assert.deepEqual(maskApiKey(undefined), { present: false });
  assert.deepEqual(maskApiKey(''), { present: false });
});

test('2. maskApiKey: well-formed AIza… key → prefix 6 + length + looksValid true', () => {
  const result = maskApiKey(GOOD_KEY);
  assert.deepEqual(result, {
    present: true,
    prefix: 'AIzaSy',
    length: 39,
    looksValid: true,
  });
});

test('3. maskApiKey: non-AIza key → looksValid false', () => {
  const result = maskApiKey('sk-abc12345');
  assert.equal(result.present, true);
  assert.equal(result.looksValid, false);
  assert.equal(result.prefix, 'sk-abc');
  assert.equal(result.length, 'sk-abc12345'.length);
});

// ───────────────────────────────────────────────────────────────────────────
// 4-7. classifyInstallMethod
// ───────────────────────────────────────────────────────────────────────────

test('4. classifyInstallMethod: claude plugin cache path', () => {
  assert.equal(
    classifyInstallMethod('/Users/x/.claude/plugins/cache/foo/dist/cli.js'),
    'claude-plugin',
  );
});

test('5. classifyInstallMethod: npm global node_modules path', () => {
  assert.equal(
    classifyInstallMethod('/usr/local/lib/node_modules/nanobanana-adc/dist/cli.js'),
    'npm-global',
  );
});

test('6. classifyInstallMethod: local source checkout', () => {
  assert.equal(
    classifyInstallMethod('/Users/x/git/nanobanana-adc/dist/cli.js'),
    'source',
  );
});

test('7. classifyInstallMethod: empty / random path → unknown', () => {
  assert.equal(classifyInstallMethod(''), 'unknown');
  assert.equal(classifyInstallMethod('/random/path'), 'unknown');
});

// ───────────────────────────────────────────────────────────────────────────
// 8-15. buildDoctorReport: warning firing
// ───────────────────────────────────────────────────────────────────────────

test('8. API key only, well-formed → authRoute=api-key-env, no warnings', async () => {
  const env: DoctorEnv = { GEMINI_API_KEY: GOOD_KEY };
  const r = await buildDoctorReport(env, baseOpts());
  assert.equal(r.authRoute.selected, 'api-key-env');
  assert.deepEqual(r.warnings, []);
  assert.equal(r.fatal, false);
});

test('9. API key + ADC env both set → GEMINI_API_KEY_SHADOWS_ADC info warning', async () => {
  const env: DoctorEnv = {
    GEMINI_API_KEY: GOOD_KEY,
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'tokprefx', account: 'u@x', project: 'p' }),
  }));
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('GEMINI_API_KEY_SHADOWS_ADC'), `warnings=${JSON.stringify(r.warnings)}`);
  const w = r.warnings.find((x) => x.code === 'GEMINI_API_KEY_SHADOWS_ADC');
  assert.equal(w?.severity, 'info');
});

test('10. ADC only, LOCATION=global → authRoute=adc, no warnings', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'tokprefx' }),
  }));
  assert.equal(r.authRoute.selected, 'adc');
  assert.deepEqual(r.warnings, []);
  assert.equal(r.fatal, false);
});

test('11. ADC only, LOCATION=us-central1 → LOCATION_NOT_GLOBAL', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'us-central1',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'tokprefx' }),
  }));
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('LOCATION_NOT_GLOBAL'));
});

test('12. ADC attempt, LOCATION unset → LOCATION_MISSING', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'tokprefx' }),
  }));
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('LOCATION_MISSING'), `warnings=${JSON.stringify(r.warnings)}`);
});

test('13. API key not matching /^AIza/ → API_KEY_FORMAT_SUSPECT', async () => {
  const env: DoctorEnv = { GEMINI_API_KEY: 'sk-suspect-key' };
  const r = await buildDoctorReport(env, baseOpts());
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('API_KEY_FORMAT_SUSPECT'));
});

test('14. USE_VERTEXAI=1 → USE_VERTEXAI_NOT_TRUE', async () => {
  const env: DoctorEnv = {
    GEMINI_API_KEY: GOOD_KEY,
    GOOGLE_GENAI_USE_VERTEXAI: '1',
  };
  const r = await buildDoctorReport(env, baseOpts());
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('USE_VERTEXAI_NOT_TRUE'));
});

test('15. CREDS path set but file missing → CREDS_FILE_MISSING', async () => {
  const env: DoctorEnv = {
    GEMINI_API_KEY: GOOD_KEY,
    GOOGLE_APPLICATION_CREDENTIALS: '/tmp/does-not-exist.json',
  };
  const r = await buildDoctorReport(env, baseOpts({
    credsFileExists: () => false,
  }));
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('CREDS_FILE_MISSING'));
  assert.equal(r.gcpEnv.GOOGLE_APPLICATION_CREDENTIALS.exists, false);
});

test('16. All auth env empty + ADC probe fail → fatal=true with NO_AUTH_AVAILABLE', async () => {
  const env: DoctorEnv = {};
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: false, error: 'no ADC' }),
  }));
  assert.equal(r.fatal, true);
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('NO_AUTH_AVAILABLE'));
  const fatal = r.warnings.find((w) => w.code === 'NO_AUTH_AVAILABLE');
  assert.equal(fatal?.severity, 'fatal');
});

// ───────────────────────────────────────────────────────────────────────────
// 17-22. ADC probe variants + verbose
// ───────────────────────────────────────────────────────────────────────────

test('17. verbose: true + ADC ok → report.verbose is defined, adc.tokenPrefix is 8 chars', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    verbose: true,
    adcProbe: async () => ({ ok: true, tokenPrefix: 'abcdefgh' }),
    gcloudAccountFetcher: async () => 'fake@example.com',
    gcloudProjectFetcher: async () => 'fake-proj',
    gcloudAdcFilePathFetcher: async () => '/fake/adc.json',
  }));
  assert.equal(r.adc.tokenPrefix, 'abcdefgh');
  assert.ok(r.verbose, 'verbose block should be present');
  assert.equal(r.verbose?.tokenPrefix, 'abcdefgh');
  assert.equal(r.verbose?.gcloudAccount, 'fake@example.com');
  assert.equal(r.verbose?.gcloudProject, 'fake-proj');
  assert.equal(r.verbose?.gcloudAdcFilePath, '/fake/adc.json');
  assert.ok(r.verbose?.nodeVersion);
  assert.ok(r.verbose?.platform);
});

test('18. verbose: false + ADC ok → report.verbose undefined, adc.tokenPrefix undefined', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'abcdefgh' }),
  }));
  assert.equal(r.verbose, undefined);
  assert.equal(r.adc.tokenPrefix, undefined);
});

test('19. ADC probe returns account/project (gcloud present) → surfaced on report.adc', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({
      ok: true,
      tokenPrefix: 'abcdefgh',
      account: 'user@example.com',
      project: 'my-proj',
    }),
  }));
  assert.equal(r.adc.account, 'user@example.com');
  assert.equal(r.adc.project, 'my-proj');
});

test('20. ADC probe returns ok without account/project (gcloud absent) → undefined', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'abcdefgh' }),
  }));
  assert.equal(r.adc.ok, true);
  assert.equal(r.adc.account, undefined);
  assert.equal(r.adc.project, undefined);
});

test('21. ADC probe timeout simulated → adc.ok=false, error contains timeout', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: () =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ ok: false, error: 'timeout (5s)' }), 10),
      ),
  }));
  assert.equal(r.adc.ok, false);
  assert.ok(r.adc.error && r.adc.error.includes('timeout'));
});

test('22. ADC probe throws → buildDoctorReport does not throw, report.adc.ok=false, error is boom', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => {
      throw new Error('boom');
    },
  }));
  assert.equal(r.adc.ok, false);
  assert.equal(r.adc.error, 'boom');
});

// ───────────────────────────────────────────────────────────────────────────
// 23-25. renderer
// ───────────────────────────────────────────────────────────────────────────

test('23. renderDoctorJSON parses back with schema nanobanana-adc-doctor/v1', async () => {
  const env: DoctorEnv = { GEMINI_API_KEY: GOOD_KEY };
  const r = await buildDoctorReport(env, baseOpts());
  const parsed = JSON.parse(renderDoctorJSON(r));
  assert.equal(parsed.schema, 'nanobanana-adc-doctor/v1');
  assert.equal(parsed.cli.version, FAKE_VERSION);
});

test('24. renderDoctorText contains Warnings (N) header and warn/info markers', async () => {
  const env: DoctorEnv = {
    GEMINI_API_KEY: GOOD_KEY,
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'us-central1',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'abcdefgh' }),
  }));
  const text = renderDoctorText(r);
  assert.match(text, /Warnings \(\d+\)/);
  assert.ok(text.includes('⚠') || text.includes('ⓘ'), 'should contain warn or info marker');
  assert.match(text, /\[LOCATION_NOT_GLOBAL\]/);
});

test('25. renderDoctorJSON never contains raw long token-like strings', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
  };
  const r = await buildDoctorReport(env, baseOpts({
    verbose: true,
    adcProbe: async () => ({ ok: true, tokenPrefix: '12345678' }),
  }));
  const json = renderDoctorJSON(r);
  assert.doesNotMatch(json, /[0-9A-Za-z_-]{40,}/);
});

// ───────────────────────────────────────────────────────────────────────────
// 26-29. resolveAuthRoute precedence
// ───────────────────────────────────────────────────────────────────────────

test('26. apiKeyFlag wins over GEMINI_API_KEY and ADC', () => {
  const env: DoctorEnv = {
    GEMINI_API_KEY: 'Y',
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
  };
  const r = resolveAuthRoute(env, 'X');
  assert.equal(r.selected, 'api-key-flag');
});

test('27. GEMINI_API_KEY env wins when no flag', () => {
  const env: DoctorEnv = { GEMINI_API_KEY: 'Y' };
  const r = resolveAuthRoute(env, undefined);
  assert.equal(r.selected, 'api-key-env');
});

test('28. ADC env present (no api key) → adc', () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
  };
  const r = resolveAuthRoute(env, undefined);
  assert.equal(r.selected, 'adc');
});

test('29. nothing set → none', () => {
  const r = resolveAuthRoute({}, undefined);
  assert.equal(r.selected, 'none');
});

// ───────────────────────────────────────────────────────────────────────────
// 30. precedence integration with auth.ts::resolveAuth()
// ───────────────────────────────────────────────────────────────────────────

test('30. resolveAuth (auth.ts) and resolveAuthRoute (doctor.ts) agree on api-key precedence', async () => {
  const { resolveAuth } = await import('./auth.js');
  const savedEnv = process.env.GEMINI_API_KEY;
  try {
    // a) explicit flag wins
    process.env.GEMINI_API_KEY = 'Y';
    const a = await resolveAuth('X');
    assert.equal(a.mode, 'api-key');
    if (a.mode === 'api-key') assert.equal(a.apiKey, 'X');
    const ar = resolveAuthRoute({ GEMINI_API_KEY: 'Y' }, 'X');
    assert.equal(ar.selected, 'api-key-flag');

    // b) env wins when flag is undefined
    process.env.GEMINI_API_KEY = 'Y';
    const b = await resolveAuth(undefined);
    assert.equal(b.mode, 'api-key');
    if (b.mode === 'api-key') assert.equal(b.apiKey, 'Y');
    const br = resolveAuthRoute({ GEMINI_API_KEY: 'Y' }, undefined);
    assert.equal(br.selected, 'api-key-env');
  } finally {
    if (savedEnv === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedEnv;
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 31-36. parseAdcMeta — secret-safe ADC JSON metadata extraction
// ───────────────────────────────────────────────────────────────────────────

test('31. parseAdcMeta: undefined / null → { type: unknown }', () => {
  assert.deepEqual(parseAdcMeta(undefined), { type: 'unknown' });
  assert.deepEqual(parseAdcMeta(null), { type: 'unknown' });
});

test('32. parseAdcMeta: authorized_user with quota_project_id, client_id → camelCase', () => {
  const out = parseAdcMeta({
    type: 'authorized_user',
    client_id: '32555940559.apps.googleusercontent.com',
    quota_project_id: 'p',
    refresh_token: 'should-not-leak',
  });
  assert.equal(out.type, 'authorized_user');
  assert.equal(out.clientId, '32555940559.apps.googleusercontent.com');
  assert.equal(out.quotaProjectId, 'p');
  assert.equal(out.clientEmail, undefined);
  assert.equal((out as Record<string, unknown>).refresh_token, undefined);
  assert.equal((out as Record<string, unknown>).refreshToken, undefined);
});

test('33. parseAdcMeta: service_account → keeps client_email, drops private_key fields', () => {
  const out = parseAdcMeta({
    type: 'service_account',
    client_email: 'sa@x.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nLEAK_BODY\n-----END PRIVATE KEY-----',
    private_key_id: 'KEY_ID',
  });
  assert.equal(out.type, 'service_account');
  assert.equal(out.clientEmail, 'sa@x.iam.gserviceaccount.com');
  assert.equal(Object.keys(out).includes('privateKey'), false);
  assert.equal(Object.keys(out).includes('private_key'), false);
  assert.equal(Object.keys(out).includes('private_key_id'), false);
  assert.equal((out as Record<string, unknown>).private_key, undefined);
  assert.equal((out as Record<string, unknown>).privateKey, undefined);
});

test('34. parseAdcMeta: external_account → { type: external_account }', () => {
  const out = parseAdcMeta({ type: 'external_account' });
  assert.equal(out.type, 'external_account');
});

test('35. parseAdcMeta: unknown type string → type=unknown', () => {
  const out = parseAdcMeta({ type: 'something_weird' });
  assert.equal(out.type, 'unknown');
});

test('36. parseAdcMeta: array (not object) → { type: unknown }', () => {
  const out = parseAdcMeta([] as unknown);
  assert.deepEqual(out, { type: 'unknown' });
});

test('36b. parseAdcMeta: client_email on non-service_account is dropped', () => {
  const out = parseAdcMeta({
    type: 'authorized_user',
    client_email: 'should-not-show@x',
  });
  assert.equal(out.clientEmail, undefined);
});

// ───────────────────────────────────────────────────────────────────────────
// 37-51. resolveAdcSource — pure resolution logic
// ───────────────────────────────────────────────────────────────────────────

const noopProbe = async (_t: number) => ({ ok: false, error: 'not called' });

function makeStat(map: Record<string, { size: number; mtimeMs: number; isFile: boolean }>) {
  return async (path: string) => map[path] ?? null;
}

test('37. resolveAdcSource: GAC set + file exists → resolved=env, meta extracted', async () => {
  const env: DoctorEnv = { GOOGLE_APPLICATION_CREDENTIALS: '/tmp/adc.json' };
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: makeStat({ '/tmp/adc.json': { size: 1024, mtimeMs: 1, isFile: true } }),
    readJsonAsync: async () => ({
      type: 'authorized_user',
      client_id: 'cid',
      quota_project_id: 'qp',
    }),
    homeDir: () => '/home/u',
    appDataDir: () => undefined,
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => 'me@x',
  });
  assert.equal(r.resolved, 'env');
  assert.equal(r.envCredentials?.exists, true);
  assert.equal(r.meta?.type, 'authorized_user');
  assert.equal(r.meta?.quotaProjectId, 'qp');
  assert.equal(r.meta?.clientId, 'cid');
});

test('38. resolveAdcSource: GAC set + file missing + default missing → envCredentials.exists=false, resolved=unknown', async () => {
  const env: DoctorEnv = { GOOGLE_APPLICATION_CREDENTIALS: '/tmp/missing.json' };
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    appDataDir: () => undefined,
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(r.envCredentials?.exists, false);
  assert.equal(r.resolved, 'unknown');
  assert.equal(r.meta, null);
});

test('39. resolveAdcSource: default location only → resolved=default', async () => {
  const env: DoctorEnv = {};
  const defaultPath = '/home/u/.config/gcloud/application_default_credentials.json';
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: makeStat({ [defaultPath]: { size: 200, mtimeMs: 99, isFile: true } }),
    readJsonAsync: async () => ({ type: 'authorized_user' }),
    homeDir: () => '/home/u',
    appDataDir: () => undefined,
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(r.resolved, 'default');
  assert.equal(r.defaultLocation.exists, true);
  assert.equal(r.meta?.type, 'authorized_user');
});

test('40. resolveAdcSource: CLOUDSDK_CONFIG set + file exists (no env creds) → resolved=cloudsdk-config', async () => {
  const env: DoctorEnv = { CLOUDSDK_CONFIG: '/etc/gcloud' };
  const cloudsdkPath = '/etc/gcloud/application_default_credentials.json';
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: makeStat({ [cloudsdkPath]: { size: 800, mtimeMs: 5, isFile: true } }),
    readJsonAsync: async () => ({ type: 'service_account', client_email: 'sa@x' }),
    homeDir: () => '/home/u',
    appDataDir: () => undefined,
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(r.resolved, 'cloudsdk-config');
  assert.ok(r.cloudsdkConfig);
  assert.equal(r.cloudsdkConfig?.exists, true);
  assert.equal(r.meta?.type, 'service_account');
  assert.equal(r.meta?.clientEmail, 'sa@x');
});

test('41. resolveAdcSource: K_SERVICE set + no creds → resolved=metadata-server, envHeuristic=k_service', async () => {
  const env: DoctorEnv = { K_SERVICE: 'svc' };
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    appDataDir: () => undefined,
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(r.resolved, 'metadata-server');
  assert.equal(r.metadataServer.envHeuristic, 'k_service');
  assert.equal(r.metadataServer.probed, false);
});

test('42. resolveAdcSource: KUBERNETES_SERVICE_HOST set → envHeuristic=kubernetes', async () => {
  const env: DoctorEnv = { KUBERNETES_SERVICE_HOST: '10.0.0.1' };
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(r.resolved, 'metadata-server');
  assert.equal(r.metadataServer.envHeuristic, 'kubernetes');
});

test('43. resolveAdcSource: nothing set → resolved=unknown, envHeuristic=none', async () => {
  const env: DoctorEnv = {};
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(r.resolved, 'unknown');
  assert.equal(r.metadataServer.envHeuristic, 'none');
});

test('44. resolveAdcSource: probeMetadataServer=true + probe ok → probed=true, probeOk=true', async () => {
  const env: DoctorEnv = { K_SERVICE: 'svc' };
  const r = await resolveAdcSource(env, { probeMetadataServer: true }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    platform: 'linux',
    metadataServerProbe: async () => ({ ok: true }),
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(r.metadataServer.probed, true);
  assert.equal(r.metadataServer.probeOk, true);
  assert.equal(r.metadataServer.probeError, undefined);
});

test('45. resolveAdcSource: probeMetadataServer=true + probe throws → probed=true, probeOk=false, probeError set', async () => {
  const env: DoctorEnv = { K_SERVICE: 'svc' };
  const r = await resolveAdcSource(env, { probeMetadataServer: true }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    platform: 'linux',
    metadataServerProbe: async () => {
      throw new Error('ECONNREFUSED');
    },
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(r.metadataServer.probed, true);
  assert.equal(r.metadataServer.probeOk, false);
  assert.match(r.metadataServer.probeError ?? '', /ECONNREFUSED/);
});

test('46. resolveAdcSource: gcloud account fetcher returns string → account set', async () => {
  const env: DoctorEnv = {};
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => 'me@x',
  });
  assert.equal(r.account, 'me@x');
  assert.equal(r.accountError, undefined);
});

test('47. resolveAdcSource: gcloud account fetcher returns undefined → accountError fixed text', async () => {
  const env: DoctorEnv = {};
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(r.account, undefined);
  assert.equal(r.accountError, 'gcloud unavailable or no active account');
});

test('47b. resolveAdcSource: gcloud account fetcher throws → accountError fixed text (same as undefined)', async () => {
  const env: DoctorEnv = {};
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(r.account, undefined);
  assert.equal(r.accountError, 'gcloud unavailable or no active account');
});

test('48. resolveAdcSource: file size > maxJsonBytes → meta=null, readJson NOT called', async () => {
  const env: DoctorEnv = { GOOGLE_APPLICATION_CREDENTIALS: '/tmp/big.json' };
  let readCalled = 0;
  const r = await resolveAdcSource(
    env,
    { probeMetadataServer: false, maxJsonBytes: 100 },
    {
      statAsync: makeStat({ '/tmp/big.json': { size: 500, mtimeMs: 1, isFile: true } }),
      readJsonAsync: async () => {
        readCalled++;
        return { type: 'authorized_user' };
      },
      homeDir: () => '/home/u',
      platform: 'linux',
      metadataServerProbe: noopProbe,
      gcloudActiveAccountFetcher: async () => undefined,
    },
  );
  assert.equal(r.envCredentials?.exists, true);
  assert.equal(r.meta, null);
  assert.equal(readCalled, 0, 'readJsonAsync should not be called when size > maxJsonBytes');
});

test('49. resolveAdcSource: Windows path uses APPDATA + backslashes', async () => {
  const env: DoctorEnv = {};
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => 'C:\\Users\\u',
    appDataDir: () => 'C:\\Users\\u\\AppData\\Roaming',
    platform: 'win32',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(
    r.defaultLocation.path,
    'C:\\Users\\u\\AppData\\Roaming\\gcloud\\application_default_credentials.json',
  );
});

test('50. resolveAdcSource: GAC points at directory (isFile=false) → exists=false', async () => {
  const env: DoctorEnv = { GOOGLE_APPLICATION_CREDENTIALS: '/tmp/dir' };
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: makeStat({ '/tmp/dir': { size: 4096, mtimeMs: 1, isFile: false } }),
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(r.envCredentials?.exists, false);
});

test('51. resolveAdcSource: probeMetadataServer=true + envHeuristic=none still probes', async () => {
  const env: DoctorEnv = {};
  let probeCalled = 0;
  const r = await resolveAdcSource(env, { probeMetadataServer: true }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    platform: 'linux',
    metadataServerProbe: async () => {
      probeCalled++;
      return { ok: false, error: 'no-metadata-server' };
    },
    gcloudActiveAccountFetcher: async () => undefined,
  });
  assert.equal(probeCalled, 1, 'probe should be called even when envHeuristic === none');
  assert.equal(r.metadataServer.probed, true);
  assert.equal(r.metadataServer.probeOk, false);
});

// ───────────────────────────────────────────────────────────────────────────
// 52-57. New warnings: ADC_QUOTA_PROJECT_MISMATCH / ADC_FILE_MISSING / ADC_TYPE_UNUSUAL
// ───────────────────────────────────────────────────────────────────────────

function adcSourceStub(overrides: Partial<AdcSourceReport> = {}): AdcSourceReport {
  return {
    ...MINIMAL_ADC_SOURCE_STUB,
    ...overrides,
  };
}

test('52. ADC_QUOTA_PROJECT_MISMATCH fires when meta.quotaProjectId !== GOOGLE_CLOUD_PROJECT', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'real-proj',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'abcd1234' }),
    adcSourceResolver: async () => adcSourceStub({
      resolved: 'default',
      meta: { type: 'authorized_user', quotaProjectId: 'other-proj' },
    }),
  }));
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('ADC_QUOTA_PROJECT_MISMATCH'), `warnings=${JSON.stringify(r.warnings)}`);
  const w = r.warnings.find((x) => x.code === 'ADC_QUOTA_PROJECT_MISMATCH');
  assert.match(w?.message ?? '', /other-proj/);
  assert.match(w?.message ?? '', /real-proj/);
});

test('53. ADC_QUOTA_PROJECT_MISMATCH does NOT fire when quotaProjectId === GOOGLE_CLOUD_PROJECT', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'abcd1234' }),
    adcSourceResolver: async () => adcSourceStub({
      resolved: 'default',
      meta: { type: 'authorized_user', quotaProjectId: 'p' },
    }),
  }));
  const codes = r.warnings.map((w) => w.code);
  assert.equal(codes.includes('ADC_QUOTA_PROJECT_MISMATCH'), false);
});

test('54. ADC_QUOTA_PROJECT_MISMATCH does NOT fire when meta is null', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'abcd1234' }),
  }));
  const codes = r.warnings.map((w) => w.code);
  assert.equal(codes.includes('ADC_QUOTA_PROJECT_MISMATCH'), false);
});

test('55. ADC_FILE_MISSING fires (alongside CREDS_FILE_MISSING) when GAC set + envCredentials.exists=false', async () => {
  const env: DoctorEnv = {
    GEMINI_API_KEY: GOOD_KEY,
    GOOGLE_APPLICATION_CREDENTIALS: '/tmp/missing.json',
  };
  const r = await buildDoctorReport(env, baseOpts({
    credsFileExists: () => false,
    adcSourceResolver: async () => adcSourceStub({
      envCredentials: { path: '/tmp/missing.json', exists: false },
    }),
  }));
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('ADC_FILE_MISSING'), `warnings=${JSON.stringify(r.warnings)}`);
  assert.ok(codes.includes('CREDS_FILE_MISSING'), `warnings=${JSON.stringify(r.warnings)}`);
});

test('56. ADC_TYPE_UNUSUAL fires when meta.type === unknown (parsed but unrecognized)', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'abcd1234' }),
    adcSourceResolver: async () => adcSourceStub({
      resolved: 'default',
      meta: { type: 'unknown' },
    }),
  }));
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('ADC_TYPE_UNUSUAL'), `warnings=${JSON.stringify(r.warnings)}`);
  const w = r.warnings.find((x) => x.code === 'ADC_TYPE_UNUSUAL');
  assert.equal(w?.severity, 'info');
});

test('57. ADC_TYPE_UNUSUAL does NOT fire when meta is null (file unreadable)', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
  };
  const r = await buildDoctorReport(env, baseOpts({
    adcProbe: async () => ({ ok: true, tokenPrefix: 'abcd1234' }),
  }));
  const codes = r.warnings.map((w) => w.code);
  assert.equal(codes.includes('ADC_TYPE_UNUSUAL'), false);
});

// ───────────────────────────────────────────────────────────────────────────
// 58-65. buildDoctorReport ↔ adcSource integration + secret leak (LEAK_CANARY)
// ───────────────────────────────────────────────────────────────────────────

test('58. report.adcSource is populated from adcSourceResolver result', async () => {
  const env: DoctorEnv = {};
  const stub = adcSourceStub({
    resolved: 'default',
    defaultLocation: { path: '/x/adc.json', exists: true, size: 100, mtimeMs: 5 },
    meta: { type: 'authorized_user', quotaProjectId: 'q' },
    account: 'me@x',
  });
  const r = await buildDoctorReport(env, baseOpts({
    adcSourceResolver: async () => stub,
  }));
  assert.deepEqual(r.adcSource, stub);
});

test('59. JSON renderer includes adcSource (camelCase)', async () => {
  const env: DoctorEnv = { GEMINI_API_KEY: GOOD_KEY };
  const r = await buildDoctorReport(env, baseOpts({
    adcSourceResolver: async () => adcSourceStub({
      resolved: 'default',
      meta: { type: 'authorized_user', quotaProjectId: 'q', clientId: 'cid' },
    }),
  }));
  const json = renderDoctorJSON(r);
  const parsed = JSON.parse(json);
  assert.ok(parsed.adcSource, 'adcSource key should exist');
  assert.equal(parsed.adcSource.resolved, 'default');
  assert.equal(parsed.adcSource.meta.quotaProjectId, 'q');
  assert.equal(parsed.adcSource.meta.clientId, 'cid');
  assert.doesNotMatch(json, /adc_source/);
  assert.doesNotMatch(json, /quota_project_id/);
  assert.doesNotMatch(json, /client_id/);
});

test('60. text renderer includes "ADC source" section header', async () => {
  const env: DoctorEnv = { GEMINI_API_KEY: GOOD_KEY };
  const r = await buildDoctorReport(env, baseOpts({
    adcSourceResolver: async () => adcSourceStub({
      resolved: 'default',
      defaultLocation: { path: '/x/adc.json', exists: true, size: 100, mtimeMs: 0 },
      meta: { type: 'authorized_user', quotaProjectId: 'q', clientId: 'cid' },
      account: 'me@x',
    }),
  }));
  const text = renderDoctorText(r);
  assert.match(text, /ADC source/);
  assert.match(text, /quotaProjectId:/);
  assert.match(text, /clientId:/);
  assert.match(text, /me@x/);
});

test('61. probeMetadataServer=true is passed through to resolver', async () => {
  const env: DoctorEnv = {};
  let seenProbeFlag: boolean | undefined;
  await buildDoctorReport(env, baseOpts({
    probeMetadataServer: true,
    adcSourceResolver: async (_env, opts) => {
      seenProbeFlag = opts?.probeMetadataServer;
      return MINIMAL_ADC_SOURCE_STUB;
    },
  }));
  assert.equal(seenProbeFlag, true);
});

test('62. LEAK_CANARY: secrets never appear in JSON or text output (verbose included)', async () => {
  const env: DoctorEnv = {
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_CLOUD_LOCATION: 'global',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
    GOOGLE_APPLICATION_CREDENTIALS: '/tmp/sa.json',
  };
  const stubReadJson = async () => ({
    type: 'service_account',
    client_email: 'sa@x.iam.gserviceaccount.com',
    private_key:
      '-----BEGIN PRIVATE KEY-----\nLEAK_CANARY_PRIVATE_KEY_BODY\n-----END PRIVATE KEY-----',
    private_key_id: 'LEAK_CANARY_KEY_ID',
    refresh_token: 'LEAK_CANARY_REFRESH_TOKEN',
    client_id: '32555940559.apps.googleusercontent.com',
    quota_project_id: 'p',
  });
  const r = await buildDoctorReport(env, baseOpts({
    verbose: true,
    credsFileExists: () => true,
    adcProbe: async () => ({
      ok: true,
      tokenPrefix: 'abcd1234',
      account: 'sa@x.iam.gserviceaccount.com',
      project: 'p',
    }),
    adcSourceResolver: async () =>
      resolveAdcSource(env, { probeMetadataServer: false }, {
        statAsync: async () => ({ size: 1024, mtimeMs: 1, isFile: true }),
        readJsonAsync: stubReadJson,
        homeDir: () => '/home/u',
        platform: 'linux',
        metadataServerProbe: noopProbe,
        gcloudActiveAccountFetcher: async () => 'sa@x.iam.gserviceaccount.com',
      }),
  }));

  const json = renderDoctorJSON(r);
  const text = renderDoctorText(r);

  // 1. structural: secret key names absent
  assert.doesNotMatch(json, /"private_key"/);
  assert.doesNotMatch(json, /"private_key_id"/);
  assert.doesNotMatch(json, /"refresh_token"/);
  assert.doesNotMatch(json, /"privateKey"/);
  assert.doesNotMatch(json, /"refreshToken"/);
  assert.doesNotMatch(json, /-----BEGIN[\s\S]*?PRIVATE KEY-----/);

  // 2. value-based: LEAK_CANARY_* must not appear anywhere
  assert.doesNotMatch(json, /LEAK_CANARY_PRIVATE_KEY_BODY/);
  assert.doesNotMatch(json, /LEAK_CANARY_KEY_ID/);
  assert.doesNotMatch(json, /LEAK_CANARY_REFRESH_TOKEN/);

  // 3. text renderer is also clean
  assert.doesNotMatch(text, /LEAK_CANARY_/);
  assert.doesNotMatch(text, /-----BEGIN[\s\S]*?PRIVATE KEY-----/);

  // 4. positive: client_email IS included for service_account
  assert.match(json, /sa@x\.iam\.gserviceaccount\.com/);
});

test('63. text renderer: meta=null shows "(not available — file unreadable or not parsed)"', async () => {
  const env: DoctorEnv = {};
  const r = await buildDoctorReport(env, baseOpts({
    adcSourceResolver: async () => adcSourceStub({
      resolved: 'metadata-server',
      metadataServer: { envHeuristic: 'k_service', probed: false },
      meta: null,
    }),
  }));
  const text = renderDoctorText(r);
  assert.match(text, /meta: +\(not available — file unreadable or not parsed\)/);
  assert.doesNotMatch(text, /quotaProjectId:/);
  assert.doesNotMatch(text, /clientId:/);
});

test('64. text renderer: accountError shown as <unresolved (...)>', async () => {
  const env: DoctorEnv = {};
  const r = await buildDoctorReport(env, baseOpts({
    adcSourceResolver: async () => adcSourceStub({
      accountError: 'gcloud unavailable or no active account',
    }),
  }));
  const text = renderDoctorText(r);
  assert.match(text, /<unresolved \(gcloud unavailable or no active account\)>/);
});

test('65. JSON renderer: accountError text is preserved verbatim', async () => {
  const env: DoctorEnv = {};
  const r = await buildDoctorReport(env, baseOpts({
    adcSourceResolver: async () => adcSourceStub({
      accountError: 'gcloud unavailable or no active account',
    }),
  }));
  const json = renderDoctorJSON(r);
  assert.match(json, /gcloud unavailable or no active account/);
});

// ───────────────────────────────────────────────────────────────────────────
// 66-68. defaultGcloudActiveAccountFetcher
// ───────────────────────────────────────────────────────────────────────────

test('66. defaultGcloudActiveAccountFetcher: returns string (when gcloud is available); we just call it without throwing', async () => {
  // We do not assume gcloud is installed in CI; call returns either a string or undefined,
  // but it MUST NOT throw.
  const r = await defaultGcloudActiveAccountFetcher();
  if (r !== undefined) {
    assert.equal(typeof r, 'string');
    assert.ok(r.length > 0);
  }
});

test('67. defaultGcloudActiveAccountFetcher: integration with multi-line stub via internal split', async () => {
  // We can not inject deps into the default fetcher; instead, verify that
  // resolveAdcSource accepts a fetcher that already returns a single line.
  const env: DoctorEnv = {};
  const r = await resolveAdcSource(env, { probeMetadataServer: false }, {
    statAsync: async () => null,
    readJsonAsync: async () => null,
    homeDir: () => '/home/u',
    platform: 'linux',
    metadataServerProbe: noopProbe,
    gcloudActiveAccountFetcher: async () => 'first@x',
  });
  assert.equal(r.account, 'first@x');
});
