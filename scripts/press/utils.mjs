import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function asFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function safeId(value, label = 'ID') {
  const id = String(value ?? '');
  assert(/^[A-Za-z0-9_-]{1,64}$/.test(id), `${label} is invalid: ${id || '(empty)'}`);
  return id;
}

export function safeText(value, maximum = 120) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function digest(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function revisionId(prefix, value) {
  return `${prefix}-${digest(value).slice(0, 16)}`;
}

export function repoRoot(metaUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), '..', '..');
}

export async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    throw error;
  }
}

export async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

export async function fetchJson(url, options = {}) {
  const {
    headers = {},
    method = 'GET',
    body,
    timeoutMs = 20_000,
    attempts = 2,
    label = url
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: { Accept: 'application/json', ...headers },
        body,
        signal: controller.signal
      });
      const responseText = await response.text();
      let parsed = null;
      if (responseText) {
        try {
          parsed = JSON.parse(responseText);
        } catch {
          throw new Error(`${label} returned non-JSON content (${response.status}).`);
        }
      }
      if (!response.ok) {
        const detail = safeText(parsed?.error?.message || parsed?.message || response.statusText, 240);
        const error = new Error(`${label} failed (${response.status})${detail ? `: ${detail}` : '.'}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return parsed;
    } catch (error) {
      lastError = error;
      const retryable = error?.name === 'AbortError' || error?.retryable;
      if (!retryable || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  if (lastError?.name === 'AbortError') throw new Error(`${label} timed out.`);
  throw lastError;
}

export function parseCli(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    assert(token.startsWith('--'), `Unexpected argument: ${token}`);
    const key = token.slice(2);
    assert(key, 'An empty CLI option was provided.');
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) values[key] = true;
    else {
      values[key] = next;
      index += 1;
    }
  }
  return values;
}

export function parseSeasonWeek(options, defaults) {
  const season = asFiniteNumber(options.season, defaults.season);
  const week = asFiniteNumber(options.week, defaults.week);
  assert(Number.isInteger(season) && season === 2026, 'Farmhood Press currently supports season 2026 only.');
  assert(Number.isInteger(week) && week >= 1 && week <= 18, 'Week must be an integer from 1 through 18.');
  return { season, week };
}

export function weekSlug(week) {
  return `week-${String(week).padStart(2, '0')}`;
}

export function isoNow(nowOverride) {
  const date = nowOverride ? new Date(nowOverride) : new Date();
  assert(Number.isFinite(date.getTime()), `Invalid --now timestamp: ${nowOverride}`);
  return date.toISOString();
}

export function unique(values) {
  return [...new Set(values)];
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
