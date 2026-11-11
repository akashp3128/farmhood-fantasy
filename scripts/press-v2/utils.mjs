import { createHash } from 'node:crypto';

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function finiteNumber(value, label, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  invariant(typeof value === 'number' || typeof value === 'string', `${label} must be a finite number.`);
  if (typeof value === 'string') invariant(value.trim().length > 0, `${label} must be a finite number.`);
  const number = Number(value);
  invariant(Number.isFinite(number), `${label} must be a finite number.`);
  return number;
}

export function integer(value, label, { minimum = Number.MIN_SAFE_INTEGER } = {}) {
  const number = finiteNumber(value, label);
  invariant(Number.isInteger(number) && number >= minimum, `${label} must be an integer greater than or equal to ${minimum}.`);
  return number;
}

export function nonEmptyText(value, label, maximum = 160) {
  const text = String(value ?? '').trim();
  invariant(text.length > 0, `${label} is required.`);
  invariant(text.length <= maximum, `${label} must be ${maximum} characters or fewer.`);
  invariant(!/[\u0000-\u001f\u007f]/.test(text), `${label} contains control characters.`);
  return text;
}

export function identifier(value, label) {
  const text = nonEmptyText(value, label, 120);
  invariant(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(text), `${label} contains unsupported characters.`);
  return text;
}

export function isoTimestamp(value, label) {
  const text = nonEmptyText(value, label, 40);
  invariant(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text), `${label} must be an RFC 3339 timestamp with Z or an explicit offset.`);
  const time = Date.parse(text);
  invariant(Number.isFinite(time), `${label} must be an ISO timestamp.`);
  return new Date(time).toISOString();
}

export function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function digest(value, length = 16) {
  return createHash('sha256').update(stableJson(value)).digest('hex').slice(0, length);
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function unique(values) {
  return [...new Set(values)];
}

export function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
}

export function compareText(left, right) {
  return String(left).localeCompare(String(right), 'en', { sensitivity: 'base' });
}
