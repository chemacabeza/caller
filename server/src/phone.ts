import { msg, type Msg } from './messages.js';

/** ES = Spain, FR = France, DE = Germany, IT = Italy, CN = China, NANP = North American Numbering Plan (+1: USA, Canada…). */
export type Country = 'ES' | 'FR' | 'DE' | 'IT' | 'CN' | 'NANP';

export type PhoneResult =
  | { ok: true; e164: string; display: string; country: Country }
  | { ok: false; error: string; msg: Msg };

const fail = (m: Msg): PhoneResult => ({ ok: false, error: m.text, msg: m });

/** Spanish premium-rate prefixes that we refuse to call to avoid unexpected charges. */
const ES_PREMIUM_PREFIXES = ['803', '806', '807', '905', '907'];

/**
 * Normalizes a phone number to E.164. Supported destinations: Spain (+34), France (+33),
 * Germany (+49), Italy (+39), China (+86) and the USA/Canada (+1).
 *
 * Spain: "+34 955 74 88 35", "0034 955-748-835", "955748835" (9 digits without a
 *        country code are assumed to be Spanish), "(+34) 955.74.88.35".
 * China: "+86 138 0013 8000", "0086 13800138000", "+86 (0)10 1234 5678".
 *        A country code is required for Chinese numbers.
 * +1:    "+1-707-555-0123", "001 (707) 555 0123". A country code is required.
 * +33:   "+33 6 39 98 12 34", "+33 (0)6 39 98 12 34", "0033 639981234". A country code is required.
 * +49:   "+491711234567", "+49 (0)171 1234567", "0049 30 1234567". A country code is required.
 * +39:   "+39 312 345 6789" (mobile), "+39 06 1234 5678" (landline: the 0 is kept). A country code is required.
 */
export function normalizePhoneNumber(input: unknown): PhoneResult {
  if (typeof input !== 'string' || !input.trim()) {
    return fail(msg('phone.empty'));
  }
  const raw = input.trim();
  if (!/^[+\d\s\-().]+$/.test(raw)) {
    return fail(msg('phone.chars'));
  }
  // "(0)" is a common way to show the optional domestic trunk prefix, e.g. "+86 (0)10 …".
  // In Italy the leading 0 of landlines is part of the international number, so keep it there.
  const isItaly = /^(\+|00)39/.test(raw.replace(/[\s\-.()]/g, ''));
  let digits = (isItaly ? raw.replace(/\((0)\)/g, '$1') : raw.replace(/\(0\)/g, '')).replace(/[\s\-().]/g, '');
  if (digits.indexOf('+') > 0 || (digits.match(/\+/g) ?? []).length > 1) {
    return fail(msg('phone.plus'));
  }

  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 9) digits = `34${digits}`;
  // Without "+" or "00", only Spanish numbers are accepted (9 digits, or 34 + 9 digits);
  // anything else would be ambiguous (e.g. a Chinese mobile 133… vs. a +1 number).
  else if (!(digits.length === 11 && digits.startsWith('34'))) return fail(msg('phone.unsupported_country'));

  if (digits.startsWith('34')) return spain(digits.slice(2));
  if (digits.startsWith('33')) return france(digits.slice(2));
  if (digits.startsWith('49')) return germany(digits.slice(2));
  if (digits.startsWith('39')) return italy(digits.slice(2));
  if (digits.startsWith('86')) return china(digits.slice(2));
  if (digits.startsWith('1')) return nanp(digits.slice(1));
  return fail(msg('phone.unsupported_country'));
}

function spain(national: string): PhoneResult {
  if (!/^[5-9]\d{8}$/.test(national)) {
    return fail(msg('phone.length'));
  }
  if (ES_PREMIUM_PREFIXES.some((p) => national.startsWith(p))) {
    return fail(msg('phone.premium'));
  }
  return {
    ok: true,
    country: 'ES',
    e164: `+34${national}`,
    display: `+34 ${national.slice(0, 3)} ${national.slice(3, 5)} ${national.slice(5, 7)} ${national.slice(7, 9)}`,
  };
}

function china(nationalInput: string): PhoneResult {
  // Drop the domestic trunk prefix if it was written after +86 (e.g. +86 010 …).
  const national = nationalInput.replace(/^0/, '');
  const ok = (display: string): PhoneResult => ({ ok: true, country: 'CN', e164: `+86${national}`, display: `+86 ${display}` });

  // Mobile: 1[3-9]X XXXX XXXX
  if (/^1[3-9]\d{9}$/.test(national)) {
    return ok(`${national.slice(0, 3)} ${national.slice(3, 7)} ${national.slice(7)}`);
  }
  // Landline with a 2-digit area code (10 Beijing, 2X major cities) + 8 digits.
  if (/^(10|2\d)\d{8}$/.test(national)) {
    return ok(`${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`);
  }
  // Landline with a 3-digit area code (3XX–9XX) + 7 or 8 digits; also 400/800 service numbers.
  if (/^[3-9]\d{2}\d{7,8}$/.test(national)) {
    const local = national.slice(3);
    const grouped = local.length === 8 ? `${local.slice(0, 4)} ${local.slice(4)}` : `${local.slice(0, 3)} ${local.slice(3)}`;
    return ok(`${national.slice(0, 3)} ${grouped}`);
  }
  return fail(msg('phone.cn_invalid'));
}

function nanp(national: string): PhoneResult {
  // NXX-NXX-XXXX: area code and exchange start with 2–9; N11 codes (211, 911…) are services, not numbers.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national) || /^[2-9]11/.test(national) || /^\d{3}[2-9]11/.test(national)) {
    return fail(msg('phone.nanp_invalid'));
  }
  if (national.startsWith('900') || national.slice(3, 6) === '976') {
    return fail(msg('phone.nanp_premium'));
  }
  return {
    ok: true,
    country: 'NANP',
    e164: `+1${national}`,
    display: `+1 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`,
  };
}

function france(nationalInput: string): PhoneResult {
  // Drop the domestic trunk prefix if it was written after +33 (e.g. +33 07 …).
  const national = nationalInput.replace(/^0/, '');
  if (!/^[1-9]\d{8}$/.test(national)) {
    return fail(msg('phone.fr_invalid'));
  }
  // 08 numbers are special-rate services, except 080 (freephone).
  if (national.startsWith('8') && !national.startsWith('80')) {
    return fail(msg('phone.fr_premium'));
  }
  const pairs = national.slice(1).match(/\d{2}/g)!.join(' ');
  return { ok: true, country: 'FR', e164: `+33${national}`, display: `+33 ${national[0]} ${pairs}` };
}

/** German premium/special-rate prefixes (after +49): 0900 premium, 0137 mass calls, 0118 directory, 0180 shared cost. */
const DE_PREMIUM_PREFIXES = ['900', '137', '118', '180'];

function germany(nationalInput: string): PhoneResult {
  const national = nationalInput.replace(/^0/, '');
  if (DE_PREMIUM_PREFIXES.some((p) => national.startsWith(p))) {
    return fail(msg('phone.de_premium'));
  }
  const ok = (display: string): PhoneResult => ({ ok: true, country: 'DE', e164: `+49${national}`, display: `+49 ${display}` });
  // Mobile: 015x/016x/017x — 10 or 11 digits without the leading 0.
  if (/^1[5-7]\d{8,9}$/.test(national)) {
    return ok(`${national.slice(0, 3)} ${national.slice(3)}`);
  }
  // Freephone 0800 + 7 digits.
  if (/^800\d{7}$/.test(national)) {
    return ok(`800 ${national.slice(3)}`);
  }
  // Landline: area code (2–5 digits, starting 2–9) + subscriber number; 6–11 digits in total.
  // Area-code lengths vary, so the number is shown without guessing where the area code ends.
  if (/^[2-9]\d{5,10}$/.test(national)) {
    return ok(national);
  }
  return fail(msg('phone.de_invalid'));
}

/** Italian premium/special-rate prefixes: 89x premium, 16x/14x/178/199 special services. */
const IT_PREMIUM_PREFIXES = ['89', '16', '14', '178', '199'];

function italy(national: string): PhoneResult {
  const ok = (display: string): PhoneResult => ({ ok: true, country: 'IT', e164: `+39${national}`, display: `+39 ${display}` });
  if (IT_PREMIUM_PREFIXES.some((p) => national.startsWith(p))) {
    return fail(msg('phone.it_premium'));
  }
  // Mobile: 3XX + 6–7 digits (9–10 digits in total).
  if (/^3\d{8,9}$/.test(national)) {
    return ok(`${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`);
  }
  // Landline: starts with 0 (kept in international format), 6–11 digits in total.
  if (/^0\d{5,10}$/.test(national)) {
    return ok(national.startsWith('06') || national.startsWith('02')
      ? `${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`.trim()
      : national);
  }
  // Freephone 800 / 803 + 6 digits.
  if (/^80[03]\d{6}$/.test(national)) {
    return ok(`${national.slice(0, 3)} ${national.slice(3)}`);
  }
  return fail(msg('phone.it_invalid'));
}
