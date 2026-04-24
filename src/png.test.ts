import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

import {
  crc32,
  parsePng,
  serializePng,
  buildTextChunk,
  insertTextChunkBeforeIend,
  type PngChunk,
} from './png.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function u32be(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value >>> 0, 0);
  return b;
}

function encodeChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = crc32(Buffer.concat([typeBuf, data]));
  return Buffer.concat([u32be(data.length), typeBuf, data, u32be(crc)]);
}

function makeIhdr(width = 1, height = 1): PngChunk {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 2;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return { type: 'IHDR', data };
}

function makeIdat1x1(): PngChunk {
  const raw = Buffer.from([0x00, 0xff, 0x00, 0x00]);
  return { type: 'IDAT', data: deflateSync(raw) };
}

function makeIend(): PngChunk {
  return { type: 'IEND', data: Buffer.alloc(0) };
}

function makePrivateChunk(type: string, bytes: Buffer): PngChunk {
  return { type, data: bytes };
}

function makeMinimalPng(): Buffer {
  return serializePng(PNG_SIGNATURE, [makeIhdr(), makeIdat1x1(), makeIend()]);
}

function makeFakePngWithPrivateChunk(caBxData: Buffer): Buffer {
  return serializePng(PNG_SIGNATURE, [
    makeIhdr(),
    makePrivateChunk('caBX', caBxData),
    makeIdat1x1(),
    makeIend(),
  ]);
}

test('crc32: empty buffer is 0', () => {
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('crc32: known vector "123456789" = 0xCBF43926', () => {
  assert.equal(crc32(Buffer.from('123456789', 'latin1')), 0xcbf43926);
});

test('crc32: known vector "IHDR" + 13-byte 1x1 RGB = 0x907753DE', () => {
  const ihdrType = Buffer.from('IHDR', 'latin1');
  const ihdrData = Buffer.from([
    0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00,
  ]);
  assert.equal(crc32(Buffer.concat([ihdrType, ihdrData])), 0x907753de);
});

test('parsePng throws on bad signature', () => {
  const bad = Buffer.concat([Buffer.from('NOTAPNG!', 'latin1'), Buffer.alloc(4)]);
  assert.throws(() => parsePng(bad), /signature/i);
});

test('parsePng / serializePng round-trip preserves bytes exactly', () => {
  const original = makeMinimalPng();
  const parsed = parsePng(original);
  assert.ok(parsed.signature.equals(PNG_SIGNATURE));
  assert.equal(parsed.chunks.length, 3);
  assert.equal(parsed.chunks[0]?.type, 'IHDR');
  assert.equal(parsed.chunks[1]?.type, 'IDAT');
  assert.equal(parsed.chunks[2]?.type, 'IEND');
  const reserialized = serializePng(parsed.signature, parsed.chunks);
  assert.ok(reserialized.equals(original), 'round-trip must produce identical bytes');
});

test('buildTextChunk: keyword + null separator + UTF-8 text', () => {
  const chunk = buildTextChunk('parameters', 'hello');
  assert.equal(chunk.type, 'tEXt');
  const expected = Buffer.concat([
    Buffer.from('parameters', 'latin1'),
    Buffer.from([0x00]),
    Buffer.from('hello', 'utf8'),
  ]);
  assert.ok(chunk.data.equals(expected));
});

test('buildTextChunk: UTF-8 text is written verbatim (not Latin-1 folded)', () => {
  const text = 'こんにちは 🌸';
  const chunk = buildTextChunk('parameters', text);
  const keywordLen = 'parameters'.length;
  assert.equal(chunk.data[keywordLen], 0x00);
  const decoded = chunk.data.subarray(keywordLen + 1).toString('utf8');
  assert.equal(decoded, text);
});

test('buildTextChunk: keyword validation', () => {
  assert.throws(() => buildTextChunk('', 'x'), /keyword/i);
  assert.throws(() => buildTextChunk('a'.repeat(80), 'x'), /keyword/i);
  assert.throws(() => buildTextChunk('has\0null', 'x'), /null/i);
});

test('insertTextChunkBeforeIend: places tEXt immediately before IEND', () => {
  const before = makeMinimalPng();
  const after = insertTextChunkBeforeIend(before, 'parameters', 'a cat');
  const { chunks } = parsePng(after);
  const types = chunks.map((c) => c.type);
  assert.deepEqual(types, ['IHDR', 'IDAT', 'tEXt', 'IEND']);
  const text = chunks[2]!;
  const keyword = text.data.subarray(0, 'parameters'.length).toString('latin1');
  assert.equal(keyword, 'parameters');
  assert.equal(text.data[10], 0x00);
  assert.equal(text.data.subarray(11).toString('utf8'), 'a cat');
});

test('insertTextChunkBeforeIend: preserves IHDR/IDAT/IEND bytes', () => {
  const before = makeMinimalPng();
  const { chunks: beforeChunks } = parsePng(before);
  const after = insertTextChunkBeforeIend(before, 'parameters', 'a cat');
  const { chunks: afterChunks } = parsePng(after);
  const findByType = (list: PngChunk[], type: string) =>
    list.find((c) => c.type === type);
  const beforeIhdr = findByType(beforeChunks, 'IHDR')!;
  const afterIhdr = findByType(afterChunks, 'IHDR')!;
  assert.ok(beforeIhdr.data.equals(afterIhdr.data));
  const beforeIdat = findByType(beforeChunks, 'IDAT')!;
  const afterIdat = findByType(afterChunks, 'IDAT')!;
  assert.ok(beforeIdat.data.equals(afterIdat.data));
});

test('insertTextChunkBeforeIend: preserves a private caBX chunk byte-for-byte', () => {
  const caBxBytes = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);
  const before = makeFakePngWithPrivateChunk(caBxBytes);
  const after = insertTextChunkBeforeIend(before, 'parameters', 'a cat');
  const { chunks } = parsePng(after);
  const cabx = chunks.find((c) => c.type === 'caBX');
  assert.ok(cabx, 'caBX chunk must survive');
  assert.ok(cabx!.data.equals(caBxBytes), 'caBX data must be preserved byte-for-byte');
  const types = chunks.map((c) => c.type);
  assert.deepEqual(types, ['IHDR', 'caBX', 'IDAT', 'tEXt', 'IEND']);
});

test('insertTextChunkBeforeIend: non-ASCII UTF-8 prompts round-trip', () => {
  const prompt = 'こんにちは 🌸';
  const before = makeMinimalPng();
  const after = insertTextChunkBeforeIend(before, 'parameters', prompt);
  const { chunks } = parsePng(after);
  const tEXt = chunks.find((c) => c.type === 'tEXt');
  assert.ok(tEXt);
  const nul = tEXt!.data.indexOf(0x00);
  const decoded = tEXt!.data.subarray(nul + 1).toString('utf8');
  assert.equal(decoded, prompt);
});

test('insertTextChunkBeforeIend: resulting PNG re-parses with valid CRCs', () => {
  const before = makeMinimalPng();
  const after = insertTextChunkBeforeIend(before, 'parameters', 'verify crc');
  let offset = 8;
  while (offset < after.length) {
    const len = after.readUInt32BE(offset);
    const type = after.subarray(offset + 4, offset + 8);
    const data = after.subarray(offset + 8, offset + 8 + len);
    const storedCrc = after.readUInt32BE(offset + 8 + len);
    const calc = crc32(Buffer.concat([type, data]));
    assert.equal(storedCrc, calc, `CRC mismatch at chunk ${type.toString('latin1')}`);
    if (type.toString('latin1') === 'IEND') break;
    offset += 12 + len;
  }
});

test('insertTextChunkBeforeIend: throws when IEND missing', () => {
  const noIend = serializePng(PNG_SIGNATURE, [makeIhdr(), makeIdat1x1()]);
  assert.throws(() => insertTextChunkBeforeIend(noIend, 'parameters', 'x'));
});
