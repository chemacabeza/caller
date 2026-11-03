export type PhoneResult =
  | { ok: true; e164: string; display: string }
  | { ok: false; error: string };

/** Spanish premium-rate prefixes that we refuse to call to avoid unexpected charges. */
const PREMIUM_PREFIXES = ['803', '806', '807', '905', '907'];

/**
 * Normalizes a Spanish phone number to E.164 (+34XXXXXXXXX).
 * Accepts e.g. "+34 955 74 88 35", "0034 955-748-835", "955748835", "(+34) 955.74.88.35".
 */
export function normalizeSpanishNumber(input: unknown): PhoneResult {
  if (typeof input !== 'string' || !input.trim()) {
    return { ok: false, error: 'Introduzca un número de teléfono.' };
  }
  const raw = input.trim();
  if (!/^[+\d\s\-().]+$/.test(raw)) {
    return { ok: false, error: 'El número solo puede contener dígitos, espacios, guiones, puntos, paréntesis y el signo +.' };
  }
  let digits = raw.replace(/[\s\-().]/g, '');
  if (digits.indexOf('+') > 0 || (digits.match(/\+/g) ?? []).length > 1) {
    return { ok: false, error: 'El signo + solo puede aparecer al principio del número.' };
  }

  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 9) digits = `34${digits}`;

  if (!digits.startsWith('34')) {
    return { ok: false, error: 'Por ahora solo se admiten números de España (+34).' };
  }
  const national = digits.slice(2);
  if (!/^[5-9]\d{8}$/.test(national)) {
    return { ok: false, error: 'Un número español debe tener 9 dígitos después de +34 y empezar por 5, 6, 7, 8 o 9.' };
  }
  if (PREMIUM_PREFIXES.some((p) => national.startsWith(p))) {
    return { ok: false, error: 'No se permiten números de tarificación especial (803, 806, 807, 905, 907).' };
  }
  return { ok: true, e164: `+34${national}`, display: formatSpanishNumber(national) };
}

function formatSpanishNumber(national: string): string {
  // Mobiles are usually written 6XX XX XX XX as well as landlines 9XX XX XX XX.
  return `+34 ${national.slice(0, 3)} ${national.slice(3, 5)} ${national.slice(5, 7)} ${national.slice(7, 9)}`;
}
