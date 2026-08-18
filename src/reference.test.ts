import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MAX_REFERENCE_IMAGES,
  assertReferenceCount,
  assertTotalInlineSize,
  buildContentParts,
  loadReferenceImages,
  resolveReferenceMimeType,
  type ReferenceImage,
} from './reference.js';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'latin1'),
]);

function tmpFile(name: string, bytes: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 't14-ref-'));
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

test('resolveReferenceMimeType: PNG magic bytes win over extension', () => {
  assert.equal(resolveReferenceMimeType('a.jpg', PNG_BYTES), 'image/png');
});

test('resolveReferenceMimeType: JPEG magic bytes', () => {
  assert.equal(resolveReferenceMimeType('a.bin', JPEG_BYTES), 'image/jpeg');
});

test('resolveReferenceMimeType: WEBP magic bytes (RIFF....WEBP)', () => {
  assert.equal(resolveReferenceMimeType('a.bin', WEBP_BYTES), 'image/webp');
});

test('resolveReferenceMimeType: falls back to extension when magic unknown', () => {
  const unknown = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  assert.equal(resolveReferenceMimeType('a.png', unknown), 'image/png');
  assert.equal(resolveReferenceMimeType('a.JPEG', unknown), 'image/jpeg');
  assert.equal(resolveReferenceMimeType('a.webp', unknown), 'image/webp');
});

test('resolveReferenceMimeType: unsupported format throws with supported list', () => {
  assert.throws(
    () => resolveReferenceMimeType('a.gif', Buffer.from([0x47, 0x49, 0x46])),
    /unsupported image format.*image\/png/s,
  );
});

test('assertReferenceCount: at the limit passes, over the limit throws', () => {
  const at = Array.from({ length: MAX_REFERENCE_IMAGES }, (_, i) => `${i}.png`);
  assert.doesNotThrow(() => assertReferenceCount(at));
  assert.throws(() => assertReferenceCount([...at, 'extra.png']), /too many/);
});

test('assertTotalInlineSize: rejects payloads over the request budget', () => {
  const big: ReferenceImage = {
    path: 'big.png',
    mimeType: 'image/png',
    base64: 'A'.repeat(21 * 1024 * 1024),
    byteLength: 21 * 1024 * 1024,
  };
  assert.throws(() => assertTotalInlineSize([big]), /too large/);
});

test('loadReferenceImages: empty list returns no references', async () => {
  assert.deepEqual(await loadReferenceImages([]), []);
});

test('loadReferenceImages: reads bytes as base64 with detected mime', async () => {
  const path = tmpFile('master.png', PNG_BYTES);
  const refs = await loadReferenceImages([path]);
  assert.equal(refs.length, 1);
  assert.equal(refs[0]!.mimeType, 'image/png');
  assert.equal(refs[0]!.base64, PNG_BYTES.toString('base64'));
  assert.equal(refs[0]!.byteLength, PNG_BYTES.length);
});

test('loadReferenceImages: preserves order across multiple files', async () => {
  const a = tmpFile('a.png', PNG_BYTES);
  const b = tmpFile('b.jpg', JPEG_BYTES);
  const refs = await loadReferenceImages([a, b]);
  assert.deepEqual(
    refs.map((r) => r.mimeType),
    ['image/png', 'image/jpeg'],
  );
});

test('loadReferenceImages: missing file throws a readable error', async () => {
  await assert.rejects(
    () => loadReferenceImages([join(tmpdir(), 'nope-t14', 'missing.png')]),
    /\[reference\] failed to read/,
  );
});

test('loadReferenceImages: empty file throws', async () => {
  const path = tmpFile('empty.png', Buffer.alloc(0));
  await assert.rejects(() => loadReferenceImages([path]), /empty file/);
});

test('buildContentParts: no references keeps the text-only shape', () => {
  assert.deepEqual(buildContentParts('a cat', []), [{ text: 'a cat' }]);
});

test('buildContentParts: references precede the text part', () => {
  const refs: ReferenceImage[] = [
    { path: 'a.png', mimeType: 'image/png', base64: 'AAA', byteLength: 3 },
    { path: 'b.jpg', mimeType: 'image/jpeg', base64: 'BBB', byteLength: 3 },
  ];
  assert.deepEqual(buildContentParts('same person, surprised', refs), [
    { inlineData: { mimeType: 'image/png', data: 'AAA' } },
    { inlineData: { mimeType: 'image/jpeg', data: 'BBB' } },
    { text: 'same person, surprised' },
  ]);
});
