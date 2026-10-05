import {
  appendFile as fsAppendFile,
  mkdir as fsMkdir,
  stat as fsStat,
  access as fsAccess,
  constants as fsConstants,
} from 'node:fs/promises';
import * as os from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export interface HistoryEnv {
  XDG_STATE_HOME?: string;
  NANOBANANA_ADC_HISTORY?: string;
  NANOBANANA_ADC_NO_HISTORY?: string;
}

export type HistoryPathSource = 'env-override' | 'xdg-state-home' | 'default';

export interface HistoryLocation {
  path: string;
  source: HistoryPathSource;
}

export type HistoryAuthRoute = 'api-key-flag' | 'api-key-env' | 'adc';

/**
 * One line of history.jsonl. Values are "as resolved, not as typed".
 * Fields that are unknown at the point of failure are `null`; `project` /
 * `location` exist on the ADC path only, `error` on failed calls only.
 */
export interface HistoryRecord {
  timestamp: string;
  status: 'ok' | 'error';
  prompt: string;
  model: string;
  aspect: string;
  size: string;
  personGeneration: string | null;
  references: string[];
  output: string | null;
  mime: string | null;
  authRoute: HistoryAuthRoute | null;
  project?: string;
  location?: string;
  cwd: string;
  elapsedMs: number;
  usage: unknown;
  error?: string;
  version: string | null;
}

export interface HistoryRecordInput {
  /** When the generate call started. */
  startedAt: Date;
  elapsedMs: number;
  cwd: string;
  prompt: string;
  model: string;
  aspect: string;
  size: string;
  personGeneration?: string;
  /** Reference paths as typed; resolved against `cwd`. */
  references?: readonly string[];
  /** Path actually written (after the png → jpg rename), or null on failure. */
  output: string | null;
  mime: string | null;
  authRoute: HistoryAuthRoute | null;
  project?: string;
  location?: string;
  /** `usageMetadata` from the API response, verbatim. */
  usage?: unknown;
  /** Set for failed calls; switches `status` to "error". */
  error?: string;
  version?: string;
  /** API key / access token values to scrub from every string field. */
  secrets?: ReadonlyArray<string | undefined>;
}

export interface HistoryStatus extends HistoryLocation {
  enabled: boolean;
  exists: boolean;
  writable: boolean;
}

export interface AppendHistoryDeps {
  appendFile?: (path: string, data: string, opts: { mode: number }) => Promise<void>;
  mkdir?: (path: string, opts: { recursive: true; mode: number }) => Promise<unknown>;
  warn?: (line: string) => void;
}

// ───────────────────────────────────────────────────────────────────────────
// Pure helpers
// ───────────────────────────────────────────────────────────────────────────

const HISTORY_DIR_NAME = 'nanobanana-adc';
const HISTORY_FILE_NAME = 'history.jsonl';
const REDACTED = '[REDACTED]';

/**
 * Priority: NANOBANANA_ADC_HISTORY → $XDG_STATE_HOME → ~/.local/state.
 * A relative XDG_STATE_HOME is ignored, as the XDG Base Directory spec asks.
 */
export function resolveHistoryPath(
  env: HistoryEnv,
  homeDir: string = os.homedir(),
): HistoryLocation {
  const override = env.NANOBANANA_ADC_HISTORY;
  if (override && override.length > 0) {
    return { path: resolve(override), source: 'env-override' };
  }
  const xdg = env.XDG_STATE_HOME;
  if (xdg && isAbsolute(xdg)) {
    return {
      path: join(xdg, HISTORY_DIR_NAME, HISTORY_FILE_NAME),
      source: 'xdg-state-home',
    };
  }
  return {
    path: join(homeDir, '.local', 'state', HISTORY_DIR_NAME, HISTORY_FILE_NAME),
    source: 'default',
  };
}

/**
 * History is on unless `--no-history` was passed (`flag === false`) or
 * NANOBANANA_ADC_NO_HISTORY is set to anything other than "" / "0" / "false".
 */
export function isHistoryEnabled(
  flag: boolean | undefined,
  env: HistoryEnv,
): boolean {
  if (flag === false) return false;
  const v = env.NANOBANANA_ADC_NO_HISTORY;
  if (v === undefined) return true;
  const normalized = v.trim().toLowerCase();
  return normalized === '' || normalized === '0' || normalized === 'false';
}

/** ISO 8601 in local time with a numeric UTC offset, e.g. 2026-10-05T09:30:00.000+09:00. */
export function formatTimestamp(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function redact<T>(value: T, secrets: readonly string[]): T {
  if (secrets.length === 0) return value;
  if (typeof value === 'string') {
    let out: string = value;
    for (const s of secrets) out = out.split(s).join(REDACTED);
    return out as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, secrets)) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redact(v, secrets)]),
    ) as T;
  }
  return value;
}

export function buildHistoryRecord(input: HistoryRecordInput): HistoryRecord {
  const record: HistoryRecord = {
    timestamp: formatTimestamp(input.startedAt),
    status: input.error === undefined ? 'ok' : 'error',
    prompt: input.prompt,
    model: input.model,
    aspect: input.aspect,
    size: input.size,
    personGeneration: input.personGeneration ?? null,
    references: (input.references ?? []).map((p) => resolve(input.cwd, p)),
    output: input.output === null ? null : resolve(input.cwd, input.output),
    mime: input.mime,
    authRoute: input.authRoute,
    ...(input.authRoute === 'adc' && input.project !== undefined
      ? { project: input.project }
      : {}),
    ...(input.authRoute === 'adc' && input.location !== undefined
      ? { location: input.location }
      : {}),
    cwd: input.cwd,
    elapsedMs: input.elapsedMs,
    usage: input.usage ?? null,
    ...(input.error !== undefined ? { error: input.error } : {}),
    version: input.version ?? null,
  };
  // Credentials are never a field, but an upstream error message could echo
  // one back — scrub every string before it reaches the disk.
  const secrets = (input.secrets ?? []).filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  return redact(record, secrets);
}

// ───────────────────────────────────────────────────────────────────────────
// I/O
// ───────────────────────────────────────────────────────────────────────────

/**
 * Append one record as a single JSON line. The whole line goes out in one
 * `appendFile` call (O_APPEND), so concurrent invocations cannot interleave
 * inside an entry. Never throws: a failure prints a one-line warning and
 * returns false, so history can never fail a generation.
 */
export async function appendHistory(
  path: string,
  record: HistoryRecord,
  deps: AppendHistoryDeps = {},
): Promise<boolean> {
  const appendFile = deps.appendFile ?? fsAppendFile;
  const mkdir = deps.mkdir ?? fsMkdir;
  const warn =
    deps.warn ?? ((line: string) => void process.stderr.write(`${line}\n`));
  try {
    // The file holds full prompts: keep it private to the user (0700 / 0600).
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await appendFile(path, JSON.stringify(record) + '\n', { mode: 0o600 });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(
      `[history] warning: could not write ${path}: ${msg.replace(/\s+/g, ' ')}`,
    );
    return false;
  }
}

function errnoCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code;
}

/**
 * Read-only probe used by `doctor`: reports where history would be written
 * and whether that would succeed. Creates nothing. When the file does not
 * exist yet, "writable" means the nearest existing ancestor is a writable
 * directory (the parent directories are created on first write).
 */
export async function inspectHistory(
  env: HistoryEnv,
  homeDir: string = os.homedir(),
): Promise<HistoryStatus> {
  const location = resolveHistoryPath(env, homeDir);
  const enabled = isHistoryEnabled(undefined, env);

  try {
    const st = await fsStat(location.path);
    let writable = false;
    if (st.isFile()) {
      writable = await fsAccess(location.path, fsConstants.W_OK).then(
        () => true,
        () => false,
      );
    }
    return { ...location, enabled, exists: true, writable };
  } catch (err) {
    if (errnoCode(err) !== 'ENOENT') {
      return { ...location, enabled, exists: false, writable: false };
    }
  }

  let dir = dirname(location.path);
  for (;;) {
    try {
      const st = await fsStat(dir);
      const writable =
        st.isDirectory() &&
        (await fsAccess(dir, fsConstants.W_OK | fsConstants.X_OK).then(
          () => true,
          () => false,
        ));
      return { ...location, enabled, exists: false, writable };
    } catch (err) {
      const parent = dirname(dir);
      if (errnoCode(err) !== 'ENOENT' || parent === dir) {
        return { ...location, enabled, exists: false, writable: false };
      }
      dir = parent;
    }
  }
}
