import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

/**
 * Reference image input for character-consistent generation.
 *
 * Gemini 3 Pro Image accepts up to 14 reference images in a single request and
 * keeps the identity of up to 5 people across them. This is *not* mask-based
 * editing (inpainting / outpainting, out of scope per docs/seed.html §10) — the
 * references are conditioning input for a brand-new generation.
 */

export const MAX_REFERENCE_IMAGES = 14;

/**
 * Vertex AI `generateContent` rejects requests whose body exceeds ~20 MB.
 * inline_data is base64, so we budget against the encoded size and fail with a
 * readable message instead of an opaque HTTP 400.
 */
export const MAX_TOTAL_INLINE_BASE64_BYTES = 20 * 1024 * 1024;

export const SUPPORTED_REFERENCE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type ReferenceMimeType = (typeof SUPPORTED_REFERENCE_MIME_TYPES)[number];

export interface ReferenceImage {
  path: string;
  mimeType: ReferenceMimeType;
  base64: string;
  byteLength: number;
}

export interface InlineDataPart {
  inlineData: { mimeType: string; data: string };
}

const MIME_FOR_EXT: Record<string, ReferenceMimeType> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function sniffMimeType(bytes: Buffer): ReferenceMimeType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Resolve the mime type of a reference image: magic bytes first, file extension
 * as fallback. Throws when neither identifies a supported format.
 */
export function resolveReferenceMimeType(
  path: string,
  bytes: Buffer,
): ReferenceMimeType {
  const sniffed = sniffMimeType(bytes);
  if (sniffed) {
    return sniffed;
  }
  const byExt = MIME_FOR_EXT[extname(path).toLowerCase()];
  if (byExt) {
    return byExt;
  }
  throw new Error(
    `[reference] unsupported image format: ${path}. ` +
      `supported: ${SUPPORTED_REFERENCE_MIME_TYPES.join(', ')} (png / jpg / jpeg / webp)`,
  );
}

export function assertReferenceCount(paths: readonly string[]): void {
  if (paths.length > MAX_REFERENCE_IMAGES) {
    throw new Error(
      `[reference] too many reference images: ${paths.length}. ` +
        `the model accepts at most ${MAX_REFERENCE_IMAGES}`,
    );
  }
}

export function assertTotalInlineSize(refs: readonly ReferenceImage[]): void {
  const total = refs.reduce((sum, r) => sum + r.base64.length, 0);
  if (total > MAX_TOTAL_INLINE_BASE64_BYTES) {
    const mb = (total / (1024 * 1024)).toFixed(1);
    const limitMb = (MAX_TOTAL_INLINE_BASE64_BYTES / (1024 * 1024)).toFixed(0);
    throw new Error(
      `[reference] reference images too large: ${mb} MB encoded (limit ${limitMb} MB). ` +
        'downscale the images or pass fewer of them',
    );
  }
}

export async function loadReferenceImages(
  paths: readonly string[],
): Promise<ReferenceImage[]> {
  assertReferenceCount(paths);

  const refs: ReferenceImage[] = [];
  for (const path of paths) {
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch (err) {
      throw new Error(
        `[reference] failed to read ${path}: ${(err as Error).message}`,
        { cause: err },
      );
    }
    if (bytes.length === 0) {
      throw new Error(`[reference] empty file: ${path}`);
    }
    refs.push({
      path,
      mimeType: resolveReferenceMimeType(path, bytes),
      base64: bytes.toString('base64'),
      byteLength: bytes.length,
    });
  }

  assertTotalInlineSize(refs);
  return refs;
}

/**
 * Reference images come before the text part: Gemini follows the instruction
 * more reliably when the conditioning images precede the prompt.
 */
export function buildContentParts(
  prompt: string,
  refs: readonly ReferenceImage[],
): Array<InlineDataPart | { text: string }> {
  return [
    ...refs.map((r) => ({
      inlineData: { mimeType: r.mimeType, data: r.base64 },
    })),
    { text: prompt },
  ];
}
