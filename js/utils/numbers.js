export function toNumber(value, fallback = 0) {
  if (value === '' || value == null) return fallback;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function clampPercent(value) {
  const n = toNumber(value);
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

export function safeDivide(a, b) {
  return b ? a / b : 0;
}

export function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round((toNumber(value) + Number.EPSILON) * p) / p;
}
