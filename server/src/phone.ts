import { msg, type Msg } from './messages.js';

export type Country = 'ES' | 'CN';

export type PhoneResult =
  | { ok: true; e164: string; display: string; country: Country }
  | { ok: false; error: string; msg: Msg };

const fail = (m: Msg): PhoneResult => ({ ok: false, error: m.text, msg: m });

/** Spanish premium-rate prefixes that we refuse to call to avoid unexpected charges. */
const ES_PREMIUM_PREFIXES = ['803', '806', '807', '905', '907'];

/**
 * Normalizes a phone number to E.164. Supported destinations: Spain (+34) and China (+86).
 *
 * Spain: "+34 955 74 88 35", "0034 955-748-835", "955748835" (9 digits without a
 *        country code are assumed to be Spanish), "(+34) 955.74.88.35".
 * China: "+86 133 3115 7888", "0086 13331157888", "+86 (0)10 1234 5678".
 *        A country code is required for Chinese numbers.
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
  let digits = raw.replace(/\(0\)/g, '').replace(/[\s\-().]/g, '');
  if (digits.indexOf('+') > 0 || (digits.match(/\+/g) ?? []).length > 1) {
    return fail(msg('phone.plus'));
  }

  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 9) digits = `34${digits}`;

  if (digits.startsWith('34')) return spain(digits.slice(2));
  if (digits.startsWith('86')) return china(digits.slice(2));
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
