import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import {
  buildParametersString,
  resolveOutputPath,
  resolveMimeType,
  writeImage,
} from './generate.js';
import { parsePng, serializePng } from './png.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeMinimalPngBuffer(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(Buffer.from([0x00, 0xff, 0x00, 0x00]));
  return serializePng(PNG_SIGNATURE, [
    { type: 'IHDR', data: ihdr },
    { type: 'IDAT', data: idat },
    { type: 'IEND', data: Buffer.alloc(0) },
  ]);
}

test('buildParametersString: minimal case (prompt + 1K + aspect 1:1)', () => {
  const s = buildParametersString({
    prompt: 'a cat',
    sizePx: 1024,
    model: 'gemini-3-pro-image-preview',
    aspect: '1:1',
  });
  assert.equal(
    s,
    'a cat\nSteps: 1, Sampler: gemini, Size: 1024x1024, Model: gemini-3-pro-image-preview, Aspect: 1:1',
  );
});

test('buildParametersString: personGeneration token appended when provided', () => {
  const s = buildParametersString({
    prompt: 'a cat',
    sizePx: 1024,
    model: 'gemini-3-pro-image-preview',
    aspect: '1:1',
    personGeneration: 'ALLOW_ADULT',
  });
  assert.equal(
    s,
    'a cat\nSteps: 1, Sampler: gemini, Size: 1024x1024, Model: gemini-3-pro-image-preview, Aspect: 1:1, Person generation: ALLOW_ADULT',
  );
});

test('buildParametersString: 2K / 4K sizes map to 2048 / 4096', () => {
  const s2 = buildParametersString({
    prompt: 'x',
    sizePx: 2048,
    model: 'm',
    aspect: '1:1',
  });
  assert.match(s2, /Size: 2048x2048/);
  const s4 = buildParametersString({
    prompt: 'x',
    sizePx: 4096,
    model: 'm',
    aspect: '1:1',
  });
  assert.match(s4, /Size: 4096x4096/);
});

test('buildParametersString: non-square aspect surfaced in Aspect field', () => {
  const s = buildParametersString({
    prompt: 'x',
    sizePx: 1024,
    model: 'm',
    aspect: '16:9',
  });
  assert.match(s, /Aspect: 16:9/);
});

test('buildParametersString: non-ASCII prompt is preserved verbatim', () => {
  const s = buildParametersString({
    prompt: 'こんにちは 🌸',
    sizePx: 1024,
    model: 'm',
    aspect: '1:1',
  });
  assert.ok(s.startsWith('こんにちは 🌸\n'));
});

test('buildParametersString: multi-line prompt preserved on first line(s)', () => {
  const s = buildParametersString({
    prompt: 'line1\nline2',
    sizePx: 1024,
    model: 'm',
    aspect: '1:1',
  });
  assert.ok(s.startsWith('line1\nline2\nSteps: 1'));
});

test('resolveOutputPath: .png + image/png stays as-is', () => {
  assert.deepEqual(resolveOutputPath('a.png', 'image/png'), {
    path: 'a.png',
    warning: null,
  });
});

test('resolveOutputPath: .png + image/jpeg rewrites to .jpg + warning', () => {
  const r = resolveOutputPath('a.png', 'image/jpeg');
  assert.equal(r.path, 'a.jpg');
  assert.match(r.warning ?? '', /image\/jpeg/);
  assert.match(r.warning ?? '', /a\.jpg/);
});

test('resolveOutputPath: .jpg + image/jpeg stays as-is', () => {
  assert.deepEqual(resolveOutputPath('a.jpg', 'image/jpeg'), {
    path: 'a.jpg',
    warning: null,
  });
});

test('resolveOutputPath: .jpeg + image/jpeg stays as-is', () => {
  assert.deepEqual(resolveOutputPath('a.jpeg', 'image/jpeg'), {
    path: 'a.jpeg',
    warning: null,
  });
});

test('resolveOutputPath: .PNG (uppercase) + image/jpeg → .jpg + warning', () => {
  const r = resolveOutputPath('dir/a.PNG', 'image/jpeg');
  assert.equal(r.path, 'dir/a.jpg');
  assert.notEqual(r.warning, null);
});

test('resolveOutputPath: no extension + image/png → appends .png + warning', () => {
  const r = resolveOutputPath('a', 'image/png');
  assert.equal(r.path, 'a.png');
  assert.notEqual(r.warning, null);
});

test('resolveOutputPath: mismatched .webp + image/png → .png + warning', () => {
  const r = resolveOutputPath('a.webp', 'image/png');
  assert.equal(r.path, 'a.png');
  assert.notEqual(r.warning, null);
});

test('resolveOutputPath: unknown mime → .bin extension + warning', () => {
  const r = resolveOutputPath('a.png', 'application/octet-stream');
  assert.equal(r.path, 'a.bin');
  assert.notEqual(r.warning, null);
});

test('resolveMimeType: prefers declared mime over magic number', () => {
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(resolveMimeType('image/png', pngMagic), 'image/png');
  assert.equal(resolveMimeType('image/jpeg', pngMagic), 'image/jpeg');
});

test('resolveMimeType: falls back to PNG magic number when mime absent', () => {
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  assert.equal(resolveMimeType(undefined, pngMagic), 'image/png');
});

test('resolveMimeType: falls back to JPEG magic number when mime absent', () => {
  const jpegMagic = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  assert.equal(resolveMimeType(undefined, jpegMagic), 'image/jpeg');
});

test('resolveMimeType: unknown bytes map to application/octet-stream', () => {
  assert.equal(
    resolveMimeType(undefined, Buffer.from([0x00, 0x00, 0x00])),
    'application/octet-stream',
  );
});

test('writeImage: embeds tEXt parameters in PNG and preserves other chunks', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't13-png-'));
  const outPath = join(tmp, 'out.png');
  const png = makeMinimalPngBuffer();
  const { actualPath } = await writeImage(
    outPath,
    png,
    'image/png',
    'cat\nSteps: 1, Sampler: gemini, Size: 1024x1024, Model: m, Aspect: 1:1',
  );
  assert.equal(actualPath, outPath);
  const written = readFileSync(actualPath);
  const { chunks } = parsePng(written);
  const types = chunks.map((c) => c.type);
  assert.deepEqual(types, ['IHDR', 'IDAT', 'tEXt', 'IEND']);
  const text = chunks[2]!;
  const nul = text.data.indexOf(0);
  assert.equal(text.data.subarray(0, nul).toString('latin1'), 'parameters');
  assert.ok(
    text.data.subarray(nul + 1).toString('utf8').startsWith('cat\nSteps: 1'),
  );
});

test('writeImage: null payload skips embedding', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't13-png-noembed-'));
  const outPath = join(tmp, 'out.png');
  const png = makeMinimalPngBuffer();
  const { actualPath } = await writeImage(outPath, png, 'image/png', null);
  assert.equal(actualPath, outPath);
  const written = readFileSync(actualPath);
  assert.ok(written.equals(png), 'null payload must write bytes verbatim');
});

test('writeImage: JPEG mime writes bytes verbatim (no embed)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't13-jpeg-'));
  const outPath = join(tmp, 'out.jpg');
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const { actualPath } = await writeImage(
    outPath,
    jpegBytes,
    'image/jpeg',
    'payload that should be ignored',
  );
  assert.equal(actualPath, outPath);
  const written = readFileSync(actualPath);
  assert.ok(written.equals(jpegBytes));
});

test('writeImage: creates parent directory if missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't13-mkdir-'));
  const outPath = join(tmp, 'nested', 'sub', 'out.png');
  const png = makeMinimalPngBuffer();
  await writeImage(outPath, png, 'image/png', null);
  assert.ok(existsSync(outPath));
});
