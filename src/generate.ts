import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { resolveAuth, type AuthResult } from './auth.js';

type AdcAuth = Extract<AuthResult, { mode: 'adc' }>;
type ApiKeyAuth = Extract<AuthResult, { mode: 'api-key' }>;

export type GenerateSize = '1K' | '2K' | '4K';

export type GenerateAspect =
  | '1:1'
  | '16:9' | '9:16'
  | '4:3'  | '3:4'
  | '3:2'  | '2:3'
  | '21:9' | '9:21'
  | '5:4';

export const PERSON_GENERATION_MODES = [
  'ALLOW_ALL',
  'ALLOW_ADULT',
  'ALLOW_NONE',
] as const;

export type PersonGeneration = (typeof PERSON_GENERATION_MODES)[number];

export interface GenerateOptions {
  prompt: string;
  aspect: GenerateAspect;
  size: GenerateSize;
  model: string;
  output: string;
  apiKey?: string;
  personGeneration?: PersonGeneration;
}

export const ASPECT_MAP: Record<GenerateAspect, string> = {
  '1:1':  '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:3':  '4:3',
  '3:4':  '3:4',
  '3:2':  '3:2',
  '2:3':  '2:3',
  '21:9': '21:9',
  '9:21': '9:21',
  '5:4':  '5:4',
};

export const SIZE_PX: Record<GenerateSize, number> = {
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
};

export function assertAspect(value: string): asserts value is GenerateAspect {
  if (!(value in ASPECT_MAP)) {
    throw new Error(
      `[generate] unsupported aspect: ${value}. supported: ${Object.keys(ASPECT_MAP).join(', ')}`,
    );
  }
}

export function assertPersonGeneration(
  value: string,
): asserts value is PersonGeneration {
  if (!(PERSON_GENERATION_MODES as readonly string[]).includes(value)) {
    throw new Error(
      `[generate] unsupported personGeneration: ${value}. supported: ${PERSON_GENERATION_MODES.join(', ')}`,
    );
  }
}

async function writeImage(outputPath: string, base64Data: string): Promise<void> {
  const buf = Buffer.from(base64Data, 'base64');
  const dir = dirname(outputPath);
  if (dir && dir !== '.') {
    try {
      await mkdir(dir, { recursive: true });
    } catch (err) {
      throw new Error(
        `[generate] failed to write ${outputPath}: ${(err as Error).message}`,
        { cause: err },
      );
    }
  }
  try {
    await writeFile(outputPath, buf);
  } catch (err) {
    throw new Error(
      `[generate] failed to write ${outputPath}: ${(err as Error).message}`,
      { cause: err },
    );
  }
}

async function generateViaVertexFetch(
  auth: AdcAuth,
  options: GenerateOptions,
): Promise<string> {
  const { accessToken, project, location } = auth;

  const host =
    location === 'global'
      ? 'aiplatform.googleapis.com'
      : `${location}-aiplatform.googleapis.com`;
  const endpoint =
    `https://${host}/v1` +
    `/projects/${project}/locations/${location}` +
    `/publishers/google/models/${options.model}:generateContent`;

  const body = {
    contents: [
      { role: 'user', parts: [{ text: options.prompt }] },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: ASPECT_MAP[options.aspect],
        imageSize: options.size,
        ...(options.personGeneration
          ? { personGeneration: options.personGeneration }
          : {}),
      },
    },
  };

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `[generate] Vertex AI fetch failed: ${(err as Error).message}`,
      { cause: err },
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `[generate] Vertex AI HTTP ${res.status}: ${text.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string } }> };
    }>;
  };

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const data = p.inlineData?.data;
    if (typeof data === 'string' && data.length > 0) {
      return data;
    }
  }
  throw new Error('[generate] response contained no image data');
}

async function generateViaSdk(
  auth: ApiKeyAuth,
  options: GenerateOptions,
): Promise<string> {
  const client = new GoogleGenerativeAI(auth.apiKey);

  const model = client.getGenerativeModel({
    model: options.model,
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: ASPECT_MAP[options.aspect],
        imageSize: options.size,
        ...(options.personGeneration
          ? { personGeneration: options.personGeneration }
          : {}),
      },
    } as any,
  });

  let result;
  try {
    result = await model.generateContent(options.prompt);
  } catch (err) {
    throw new Error(
      `[generate] API error: ${(err as Error).message}`,
      { cause: err },
    );
  }

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if ('inlineData' in p && p.inlineData?.data) {
      return p.inlineData.data;
    }
  }
  throw new Error('[generate] response contained no image data');
}

export async function generate(options: GenerateOptions): Promise<void> {
  const startedAt = Date.now();

  const auth = await resolveAuth(options.apiKey);

  const base64Image =
    auth.mode === 'adc'
      ? await generateViaVertexFetch(auth, options)
      : await generateViaSdk(auth, options);

  await writeImage(options.output, base64Image);

  const elapsed = Date.now() - startedAt;
  console.log(
    `[generate] done | output=${options.output} | model=${options.model} | elapsed_ms=${elapsed}`,
  );
}
