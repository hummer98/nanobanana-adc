export interface PngChunk {
  type: string;
  data: Buffer;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n >>> 0;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function parsePng(buf: Buffer): { signature: Buffer; chunks: PngChunk[] } {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('[png] invalid PNG signature');
  }
  const signature = Buffer.from(buf.subarray(0, 8));
  const chunks: PngChunk[] = [];
  let offset = 8;
  let sawIend = false;
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const typeBuf = buf.subarray(offset + 4, offset + 8);
    const type = typeBuf.toString('latin1');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) {
      throw new Error(`[png] chunk ${type} length exceeds buffer`);
    }
    const data = Buffer.from(buf.subarray(dataStart, dataEnd));
    chunks.push({ type, data });
    offset = dataEnd + 4;
    if (type === 'IEND') {
      sawIend = true;
      break;
    }
  }
  if (!sawIend) {
    throw new Error('[png] IEND chunk not found');
  }
  if (offset !== buf.length) {
    throw new Error('[png] trailing bytes after IEND');
  }
  return { signature, chunks };
}

export function serializePng(signature: Buffer, chunks: PngChunk[]): Buffer {
  const parts: Buffer[] = [signature];
  for (const c of chunks) {
    if (c.type.length !== 4) {
      throw new Error(`[png] chunk type must be 4 chars, got ${JSON.stringify(c.type)}`);
    }
    const typeBuf = Buffer.from(c.type, 'latin1');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(c.data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, c.data])), 0);
    parts.push(len, typeBuf, c.data, crc);
  }
  return Buffer.concat(parts);
}

export function buildTextChunk(keyword: string, text: string): PngChunk {
  if (keyword.length < 1 || keyword.length > 79) {
    throw new Error(`[png] tEXt keyword length must be 1..79 bytes, got ${keyword.length}`);
  }
  if (keyword.includes('\0')) {
    throw new Error('[png] tEXt keyword must not contain null bytes');
  }
  const keywordBytes = Buffer.from(keyword, 'latin1');
  const textBytes = Buffer.from(text, 'utf8');
  const data = Buffer.concat([keywordBytes, Buffer.from([0x00]), textBytes]);
  return { type: 'tEXt', data };
}

export function insertTextChunkBeforeIend(
  buf: Buffer,
  keyword: string,
  text: string,
): Buffer {
  const { signature, chunks } = parsePng(buf);
  const iendIdx = chunks.findIndex((c) => c.type === 'IEND');
  if (iendIdx < 0) {
    throw new Error('[png] IEND chunk not found');
  }
  const newChunk = buildTextChunk(keyword, text);
  const newChunks = [
    ...chunks.slice(0, iendIdx),
    newChunk,
    ...chunks.slice(iendIdx),
  ];
  return serializePng(signature, newChunks);
}
