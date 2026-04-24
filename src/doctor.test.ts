import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDoctorReport,
  renderDoctorJSON,
  renderDoctorText,
  maskApiKey,
  classifyInstallMethod,
  resolveAuthRoute,
  type DoctorEnv,
  type DoctorReport,
  type AdcProbeResult,
} from './doctor.js';

const NOW_MS = () => 0;
const FAKE_ARGV1 = '/Users/test/git/nanobanana-adc/dist/cli.js';
const FAKE_VERSION = '0.4.0';

const GOOD_KEY = 'AIzaSy' + 'A'.repeat(33); // 39 chars, starts with AIza

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
