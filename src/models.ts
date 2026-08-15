/**
 * Default model id used by `generate` and reported by `doctor`.
 *
 * `gemini-3-pro-image` (Nano Banana Pro) went GA on Vertex AI on 2026-05-28 and
 * is served only from the global endpoint — see the `location=global` branch in
 * `src/generate.ts`. The former `gemini-3-pro-image-preview` id still resolves
 * but is a preview alias; prefer the GA id.
 */
export const DEFAULT_MODEL = 'gemini-3-pro-image';
