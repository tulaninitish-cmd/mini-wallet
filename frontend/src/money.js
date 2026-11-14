// Money is handled as integer paise everywhere. No floating point arithmetic.

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export function formatMinor(minor) {
  return inr.format(minor / 100);
}

// "250", "250.5", "250.50" -> paise. Anything else -> null.
export function parseToMinor(text) {
  const s = String(text).trim().replace(/,/g, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const minor = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0') || 0);
  return minor > 0 ? minor : null;
}

export const FLAG_TEXT = {
  LARGE_AMOUNT: 'Large amount',
  NEW_RECIPIENT_LARGE_AMOUNT: 'Large amount to a new recipient',
  HIGH_VELOCITY: 'Many transfers in one minute',
};
