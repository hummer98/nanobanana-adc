import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  appendHistory,
  buildHistoryRecord,
  formatTimestamp,
  inspectHistory,
  isHistoryEnabled,
  resolveHistoryPath,
  type HistoryRecordInput,
} from './history.js';
import { generate, type GenerateOptions } from './generate.js';
import { resolveAuth, type AuthResult } from './auth.js';

const FAKE_API_KEY = 'AIzaSy' + 'K'.repeat(33);
const FAKE_ACCESS_TOKEN = 'ya29.FAKE-ACCESS-TOKEN-' + 'T'.repeat(40);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const USAGE = {
  promptTokenCount: 7,
  candidatesTokenCount: 1290,
  thoughtsTokenCount: 120,
  totalTokenCount: 1417,
};

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'history-'));
}

function readLines(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function baseInput(overrides: Partial<HistoryRecordInput> = {}): HistoryRecordInput {
  return {
    startedAt: new Date(2026, 9, 5, 9, 30, 0, 0),
    elapsedMs: 1234,
    cwd: '/work/dir',
    prompt: 'a cat',
    model: 'gemini-3-pro-image',
    aspect: '16:9',
    size: '2K',
    output: 'out.png',
    mime: 'image/png',
    authRoute: 'adc',
    project: 'my-project',
    location: 'global',
    usage: USAGE,
    version: '9.9.9',
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// resolveHistoryPath
// ───────────────────────────────────────────────────────────────────────────

test('resolveHistoryPath: XDG_STATE_HOME set → $XDG_STATE_HOME/nanobanana-adc/history.jsonl', () => {
  assert.deepEqual(resolveHistoryPath({ XDG_STATE_HOME: '/xdg/state' }, '/home/u'), {
    path: join('/xdg/state', 'nanobanana-adc', 'history.jsonl'),
    source: 'xdg-state-home',
  });
});

test('resolveHistoryPath: XDG_STATE_HOME unset → ~/.local/state fallback', () => {
  assert.deepEqual(resolveHistoryPath({}, '/home/u'), {
    path: join('/home/u', '.local', 'state', 'nanobanana-adc', 'history.jsonl'),
    source: 'default',
  });
});

test('resolveHistoryPath: empty / relative XDG_STATE_HOME is ignored', () => {
  assert.equal(resolveHistoryPath({ XDG_STATE_HOME: '' }, '/home/u').source, 'default');
  assert.equal(
    resolveHistoryPath({ XDG_STATE_HOME: 'relative/state' }, '/home/u').source,
    'default',
  );
});

test('resolveHistoryPath: NANOBANANA_ADC_HISTORY overrides XDG and default', () => {
  assert.deepEqual(
    resolveHistoryPath(
      { XDG_STATE_HOME: '/xdg/state', NANOBANANA_ADC_HISTORY: '/custom/h.jsonl' },
      '/home/u',
    ),
    { path: resolve('/custom/h.jsonl'), source: 'env-override' },
  );
});

test('resolveHistoryPath: relative NANOBANANA_ADC_HISTORY is made absolute', () => {
  const r = resolveHistoryPath({ NANOBANANA_ADC_HISTORY: 'h.jsonl' }, '/home/u');
  assert.equal(r.path, resolve('h.jsonl'));
});

// ───────────────────────────────────────────────────────────────────────────
// isHistoryEnabled
// ───────────────────────────────────────────────────────────────────────────

test('isHistoryEnabled: on by default', () => {
  assert.equal(isHistoryEnabled(undefined, {}), true);
  assert.equal(isHistoryEnabled(true, {}), true);
});

test('isHistoryEnabled: --no-history (flag=false) disables', () => {
  assert.equal(isHistoryEnabled(false, {}), false);
});

test('isHistoryEnabled: NANOBANANA_ADC_NO_HISTORY=1 disables; 0 / false / empty do not', () => {
  assert.equal(isHistoryEnabled(undefined, { NANOBANANA_ADC_NO_HISTORY: '1' }), false);
  assert.equal(isHistoryEnabled(true, { NANOBANANA_ADC_NO_HISTORY: 'true' }), false);
  assert.equal(isHistoryEnabled(undefined, { NANOBANANA_ADC_NO_HISTORY: '0' }), true);
  assert.equal(isHistoryEnabled(undefined, { NANOBANANA_ADC_NO_HISTORY: 'false' }), true);
  assert.equal(isHistoryEnabled(undefined, { NANOBANANA_ADC_NO_HISTORY: '' }), true);
});

// ───────────────────────────────────────────────────────────────────────────
// formatTimestamp / buildHistoryRecord
// ───────────────────────────────────────────────────────────────────────────

test('formatTimestamp: ISO 8601 with numeric offset, same instant', () => {
  const d = new Date(1791160200123);
  const s = formatTimestamp(d);
  assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
  assert.equal(new Date(s).getTime(), d.getTime());
});

test('buildHistoryRecord: success record shape (ADC)', () => {
  const r = buildHistoryRecord(
    baseInput({ references: ['refs/a.png', '/abs/b.jpg'], personGeneration: 'ALLOW_ADULT' }),
  );
  assert.deepEqual(Object.keys(r), [
    'timestamp', 'status', 'prompt', 'model', 'aspect', 'size',
    'personGeneration', 'references', 'output', 'mime', 'authRoute',
    'project', 'location', 'cwd', 'elapsedMs', 'usage', 'version',
  ]);
  assert.equal(r.status, 'ok');
  assert.equal(r.prompt, 'a cat');
  assert.equal(r.model, 'gemini-3-pro-image');
  assert.equal(r.aspect, '16:9');
  assert.equal(r.size, '2K');
  assert.equal(r.personGeneration, 'ALLOW_ADULT');
  assert.deepEqual(r.references, [resolve('/work/dir', 'refs/a.png'), resolve('/abs/b.jpg')]);
  assert.equal(r.output, resolve('/work/dir', 'out.png'));
  assert.equal(r.mime, 'image/png');
  assert.equal(r.authRoute, 'adc');
  assert.equal(r.project, 'my-project');
  assert.equal(r.location, 'global');
  assert.equal(r.cwd, '/work/dir');
  assert.equal(r.elapsedMs, 1234);
  assert.deepEqual(r.usage, USAGE);
  assert.equal(r.version, '9.9.9');
  assert.equal('error' in r, false);
});

test('buildHistoryRecord: API-key routes carry no project / location', () => {
  const r = buildHistoryRecord(
    baseInput({ authRoute: 'api-key-env', project: 'leftover', location: 'global' }),
  );
  assert.equal(r.authRoute, 'api-key-env');
  assert.equal('project' in r, false);
  assert.equal('location' in r, false);
  assert.equal(r.personGeneration, null);
  assert.deepEqual(r.references, []);
});

test('buildHistoryRecord: error record shape', () => {
  const r = buildHistoryRecord(
    baseInput({
      output: null,
      mime: null,
      usage: undefined,
      error: '[generate] Vertex AI HTTP 403: denied',
    }),
  );
  assert.equal(r.status, 'error');
  assert.equal(r.error, '[generate] Vertex AI HTTP 403: denied');
  assert.equal(r.output, null);
  assert.equal(r.mime, null);
  assert.equal(r.usage, null);
  assert.equal(r.prompt, 'a cat');
});

test('buildHistoryRecord: credentials never reach the serialized line', () => {
  const r = buildHistoryRecord(
    baseInput({
      authRoute: 'api-key-flag',
      error: `API error: bad key ${FAKE_API_KEY} / Bearer ${FAKE_ACCESS_TOKEN}`,
      usage: { echoed: FAKE_API_KEY },
      secrets: [FAKE_API_KEY, FAKE_ACCESS_TOKEN, undefined, ''],
    }),
  );
  const line = JSON.stringify(r);
  assert.ok(!line.includes(FAKE_API_KEY));
  assert.ok(!line.includes(FAKE_ACCESS_TOKEN));
  assert.match(r.error ?? '', /\[REDACTED\]/);
  assert.equal(/apiKey|accessToken/i.test(Object.keys(r).join(',')), false);
});

// ───────────────────────────────────────────────────────────────────────────
// appendHistory
// ───────────────────────────────────────────────────────────────────────────

test('appendHistory: creates the parent directory and appends one JSON line', async () => {
  const path = join(tmpDir(), 'nested', 'state', 'history.jsonl');
  assert.equal(await appendHistory(path, buildHistoryRecord(baseInput())), true);
  assert.equal(
    await appendHistory(path, buildHistoryRecord(baseInput({ prompt: 'line1\nline2 🌸' }))),
    true,
  );
  const raw = readFileSync(path, 'utf8');
  assert.ok(raw.endsWith('\n'));
  const lines = readLines(path);
  assert.equal(lines.length, 2);
  assert.equal(lines[1]!.prompt, 'line1\nline2 🌸');
  if (process.platform !== 'win32') {
    assert.equal(statSync(path).mode & 0o777, 0o600);
  }
});

test('appendHistory: exactly one appendFile call per entry', async () => {
  const calls: Array<{ path: string; data: string }> = [];
  const ok = await appendHistory('/nowhere/history.jsonl', buildHistoryRecord(baseInput()), {
    mkdir: async () => undefined,
    appendFile: async (path, data) => {
      calls.push({ path, data });
    },
  });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.data.split('\n').length, 2);
  assert.ok(calls[0]!.data.endsWith('\n'));
});

test('appendHistory: concurrent appends leave every line parseable', async () => {
  const path = join(tmpDir(), 'history.jsonl');
  const n = 50;
  await Promise.all(
    Array.from({ length: n }, (_, i) =>
      appendHistory(
        path,
        buildHistoryRecord(baseInput({ prompt: `prompt ${i} ` + 'x'.repeat(2000) })),
      ),
    ),
  );
  const lines = readLines(path);
  assert.equal(lines.length, n);
  assert.equal(new Set(lines.map((l) => l.prompt)).size, n);
});

test('appendHistory: write failure warns once and does not throw', async () => {
  const dir = tmpDir();
  const blocker = join(dir, 'not-a-dir');
  writeFileSync(blocker, 'x');
  const warnings: string[] = [];
  const ok = await appendHistory(
    join(blocker, 'history.jsonl'),
    buildHistoryRecord(baseInput()),
    { warn: (l) => warnings.push(l) },
  );
  assert.equal(ok, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /^\[history\] warning: could not write /);
  assert.equal(warnings[0]!.includes('\n'), false);
});

// ───────────────────────────────────────────────────────────────────────────
// inspectHistory (doctor's probe)
// ───────────────────────────────────────────────────────────────────────────

test('inspectHistory: missing file under a writable ancestor → writable, creates nothing', async () => {
  const dir = tmpDir();
  const path = join(dir, 'a', 'b', 'history.jsonl');
  const s = await inspectHistory({ NANOBANANA_ADC_HISTORY: path }, '/home/u');
  assert.deepEqual(s, {
    path,
    source: 'env-override',
    enabled: true,
    exists: false,
    writable: true,
  });
  assert.equal(existsSync(join(dir, 'a')), false);
});

test('inspectHistory: existing file → exists + writable', async () => {
  const path = join(tmpDir(), 'history.jsonl');
  writeFileSync(path, '');
  const s = await inspectHistory({ NANOBANANA_ADC_HISTORY: path }, '/home/u');
  assert.equal(s.exists, true);
  assert.equal(s.writable, true);
});

test('inspectHistory: parent is a regular file → not writable', async () => {
  const blocker = join(tmpDir(), 'not-a-dir');
  writeFileSync(blocker, 'x');
  const s = await inspectHistory(
    { NANOBANANA_ADC_HISTORY: join(blocker, 'history.jsonl') },
    '/home/u',
  );
  assert.equal(s.writable, false);
});

test('inspectHistory: NANOBANANA_ADC_NO_HISTORY=1 → enabled false', async () => {
  const s = await inspectHistory(
    { NANOBANANA_ADC_HISTORY: join(tmpDir(), 'h.jsonl'), NANOBANANA_ADC_NO_HISTORY: '1' },
    '/home/u',
  );
  assert.equal(s.enabled, false);
});

// ───────────────────────────────────────────────────────────────────────────
// resolveAuth: route (flag vs env)
// ───────────────────────────────────────────────────────────────────────────

async function withGeminiEnv<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const saved = process.env.GEMINI_API_KEY;
  if (value === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = value;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
}

test('resolveAuth: --api-key → route api-key-flag, even when GEMINI_API_KEY is set', async () => {
  const auth = await withGeminiEnv('env-key-value', () => resolveAuth(FAKE_API_KEY));
  assert.equal(auth.mode, 'api-key');
  assert.equal(auth.route, 'api-key-flag');
});

test('resolveAuth: GEMINI_API_KEY only → route api-key-env', async () => {
  const auth = await withGeminiEnv(FAKE_API_KEY, () => resolveAuth(undefined));
  assert.equal(auth.mode, 'api-key');
  assert.equal(auth.route, 'api-key-env');
});

// ───────────────────────────────────────────────────────────────────────────
// generate() end to end — the network is stubbed, no model API is called.
// ───────────────────────────────────────────────────────────────────────────

interface FetchCall {
  url: string;
}

async function withFetch<T>(
  respond: (url: string) => Response,
  fn: (calls: FetchCall[]) => Promise<T>,
): Promise<T> {
  const saved = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    calls.push({ url });
    return respond(url);
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = saved;
  }
}

async function captureStderr<T>(fn: () => Promise<T>): Promise<{ result: T; stderr: string }> {
  const saved = process.stderr.write;
  let stderr = '';
  process.stderr.write = ((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    const result = await fn();
    return { result, stderr };
  } finally {
    process.stderr.write = saved;
  }
}

function imageResponse(mimeType: string, bytes: Buffer): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ inlineData: { mimeType, data: bytes.toString('base64') } }] } },
      ],
      usageMetadata: USAGE,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const ADC_AUTH: AuthResult = {
  mode: 'adc',
  route: 'adc',
  accessToken: FAKE_ACCESS_TOKEN,
  project: 'my-project',
  location: 'global',
};

function genOptions(dir: string, overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    prompt: 'a red bicycle\nsecond line',
    aspect: '16:9',
    size: '2K',
    model: 'gemini-3-pro-image',
    output: join(dir, 'out.png'),
    embedMetadata: false,
    cliVersion: '9.9.9',
    ...overrides,
  };
}

test('generate: ADC success appends exactly one line with prompt + final output path', async () => {
  const dir = tmpDir();
  const historyPath = join(dir, 'state', 'history.jsonl');
  await withFetch(
    () => imageResponse('image/png', PNG_BYTES),
    async (calls) => {
      await generate(genOptions(dir), {
        resolveAuth: async () => ADC_AUTH,
        historyEnv: { NANOBANANA_ADC_HISTORY: historyPath },
        cwd: dir,
      });
      assert.equal(calls.length, 1);
      assert.match(calls[0]!.url, /^https:\/\/aiplatform\.googleapis\.com\//);
    },
  );
  const raw = readFileSync(historyPath, 'utf8');
  const lines = readLines(historyPath);
  assert.equal(lines.length, 1);
  const r = lines[0]!;
  assert.equal(r.status, 'ok');
  assert.equal(r.prompt, 'a red bicycle\nsecond line');
  assert.equal(r.output, join(dir, 'out.png'));
  assert.ok(existsSync(r.output as string));
  assert.equal(r.mime, 'image/png');
  assert.equal(r.authRoute, 'adc');
  assert.equal(r.project, 'my-project');
  assert.equal(r.location, 'global');
  assert.equal(r.model, 'gemini-3-pro-image');
  assert.equal(r.aspect, '16:9');
  assert.equal(r.size, '2K');
  assert.equal(r.cwd, dir);
  assert.deepEqual(r.usage, USAGE);
  assert.equal(r.version, '9.9.9');
  assert.equal(typeof r.elapsedMs, 'number');
  assert.ok(!raw.includes(FAKE_ACCESS_TOKEN));
});

test('generate: API-key success with JPEG logs the renamed .jpg path, no key in file', async () => {
  const dir = tmpDir();
  const historyPath = join(dir, 'history.jsonl');
  const { stderr } = await captureStderr(() =>
    withGeminiEnv(undefined, () =>
      withFetch(
        () => imageResponse('image/jpeg', JPEG_BYTES),
        () =>
          generate(genOptions(dir, { apiKey: FAKE_API_KEY, embedMetadata: true }), {
            historyEnv: { NANOBANANA_ADC_HISTORY: historyPath },
            cwd: dir,
          }),
      ),
    ),
  );
  assert.match(stderr, /saving to .*out\.jpg/);
  const raw = readFileSync(historyPath, 'utf8');
  const lines = readLines(historyPath);
  assert.equal(lines.length, 1);
  const r = lines[0]!;
  assert.equal(r.status, 'ok');
  assert.equal(r.prompt, 'a red bicycle\nsecond line');
  assert.equal(r.output, join(dir, 'out.jpg'));
  assert.ok(existsSync(join(dir, 'out.jpg')));
  assert.equal(r.mime, 'image/jpeg');
  assert.equal(r.authRoute, 'api-key-flag');
  assert.equal('project' in r, false);
  assert.equal('location' in r, false);
  assert.deepEqual(r.usage, USAGE);
  assert.ok(!raw.includes(FAKE_API_KEY));
});

test('generate: personGeneration is logged as resolved (ADC keeps it, API-key drops it)', async () => {
  const dir = tmpDir();
  const historyPath = join(dir, 'history.jsonl');
  await withFetch(
    () => imageResponse('image/png', PNG_BYTES),
    () =>
      generate(genOptions(dir, { personGeneration: 'ALLOW_ADULT' }), {
        resolveAuth: async () => ADC_AUTH,
        historyEnv: { NANOBANANA_ADC_HISTORY: historyPath },
        cwd: dir,
      }),
  );
  const { stderr } = await captureStderr(() =>
    withGeminiEnv(undefined, () =>
      withFetch(
        () => imageResponse('image/jpeg', JPEG_BYTES),
        () =>
          generate(genOptions(dir, { apiKey: FAKE_API_KEY, personGeneration: 'ALLOW_ADULT' }), {
            historyEnv: { NANOBANANA_ADC_HISTORY: historyPath },
            cwd: dir,
          }),
      ),
    ),
  );
  assert.match(stderr, /--person-generation ALLOW_ADULT is ignored under API-key auth/);
  const lines = readLines(historyPath);
  assert.equal(lines.length, 2);
  assert.equal(lines[0]!.personGeneration, 'ALLOW_ADULT');
  assert.equal(lines[1]!.personGeneration, null);
});

test('generate: GEMINI_API_KEY path logs authRoute api-key-env', async () => {
  const dir = tmpDir();
  const historyPath = join(dir, 'history.jsonl');
  await captureStderr(() =>
    withGeminiEnv(FAKE_API_KEY, () =>
      withFetch(
        () => imageResponse('image/jpeg', JPEG_BYTES),
        () =>
          generate(genOptions(dir), {
            historyEnv: { NANOBANANA_ADC_HISTORY: historyPath },
            cwd: dir,
          }),
      ),
    ),
  );
  const raw = readFileSync(historyPath, 'utf8');
  const lines = readLines(historyPath);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.authRoute, 'api-key-env');
  assert.ok(!raw.includes(FAKE_API_KEY));
});

test('generate: failed call appends one status:"error" line, rethrows, leaks no token', async () => {
  const dir = tmpDir();
  const historyPath = join(dir, 'history.jsonl');
  await withFetch(
    // Upstream error body that echoes the bearer token back.
    () => new Response(`permission denied for Bearer ${FAKE_ACCESS_TOKEN}`, { status: 403 }),
    async () => {
      await assert.rejects(
        generate(genOptions(dir), {
          resolveAuth: async () => ADC_AUTH,
          historyEnv: { NANOBANANA_ADC_HISTORY: historyPath },
          cwd: dir,
        }),
        /Vertex AI HTTP 403/,
      );
    },
  );
  const raw = readFileSync(historyPath, 'utf8');
  const lines = readLines(historyPath);
  assert.equal(lines.length, 1);
  const r = lines[0]!;
  assert.equal(r.status, 'error');
  assert.match(r.error as string, /Vertex AI HTTP 403/);
  assert.equal(r.prompt, 'a red bicycle\nsecond line');
  assert.equal(r.output, null);
  assert.equal(r.mime, null);
  assert.equal(r.authRoute, 'adc');
  assert.ok(!raw.includes(FAKE_ACCESS_TOKEN));
  assert.equal(existsSync(join(dir, 'out.png')), false);
});

test('generate: failure before auth (bad reference) is logged with authRoute null', async () => {
  const dir = tmpDir();
  const historyPath = join(dir, 'history.jsonl');
  await assert.rejects(
    generate(genOptions(dir, { references: ['missing-ref.png'] }), {
      resolveAuth: async () => ADC_AUTH,
      historyEnv: { NANOBANANA_ADC_HISTORY: historyPath },
      cwd: dir,
    }),
  );
  const lines = readLines(historyPath);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.status, 'error');
  assert.equal(lines[0]!.authRoute, null);
  assert.deepEqual(lines[0]!.references, [join(dir, 'missing-ref.png')]);
});

test('generate: --no-history (history:false) writes nothing', async () => {
  const dir = tmpDir();
  const historyPath = join(dir, 'history.jsonl');
  await withFetch(
    () => imageResponse('image/png', PNG_BYTES),
    () =>
      generate(genOptions(dir, { history: false }), {
        resolveAuth: async () => ADC_AUTH,
        historyEnv: { NANOBANANA_ADC_HISTORY: historyPath },
        cwd: dir,
      }),
  );
  assert.ok(existsSync(join(dir, 'out.png')));
  assert.equal(existsSync(historyPath), false);
});

test('generate: NANOBANANA_ADC_NO_HISTORY=1 writes nothing', async () => {
  const dir = tmpDir();
  const historyPath = join(dir, 'history.jsonl');
  await withFetch(
    () => imageResponse('image/png', PNG_BYTES),
    () =>
      generate(genOptions(dir), {
        resolveAuth: async () => ADC_AUTH,
        historyEnv: {
          NANOBANANA_ADC_HISTORY: historyPath,
          NANOBANANA_ADC_NO_HISTORY: '1',
        },
        cwd: dir,
      }),
  );
  assert.ok(existsSync(join(dir, 'out.png')));
  assert.equal(existsSync(historyPath), false);
});

test('generate: unwritable history path warns on one line and the generation still succeeds', async () => {
  const dir = tmpDir();
  const blocker = join(dir, 'not-a-dir');
  writeFileSync(blocker, 'x');
  const { stderr } = await captureStderr(() =>
    withFetch(
      () => imageResponse('image/png', PNG_BYTES),
      () =>
        generate(genOptions(dir), {
          resolveAuth: async () => ADC_AUTH,
          historyEnv: { NANOBANANA_ADC_HISTORY: join(blocker, 'history.jsonl') },
          cwd: dir,
        }),
    ),
  );
  assert.ok(existsSync(join(dir, 'out.png')));
  const warnings = stderr.split('\n').filter((l) => l.startsWith('[history] warning:'));
  assert.equal(warnings.length, 1);
});
