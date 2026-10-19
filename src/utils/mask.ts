const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|account|card/i;

const LONG_NUMBER = /\d[\d-]{8,}\d/g;

const MASK = '[가림]';

export function maskAccountNumber(text: string): string {
  return text.replace(LONG_NUMBER, (match) => {
    const digits = match.replace(/\D/g, ''); 
    return digits.length >= 10 ? `****${digits.slice(-4)}` : match;
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

export function maskSensitive(value: unknown): unknown {
  if (typeof value === 'string') return maskAccountNumber(value);
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, SENSITIVE_KEY.test(key) ? MASK : maskSensitive(v)]),
    );
  }
  return value; 
}