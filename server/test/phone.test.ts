import { describe, expect, it } from 'vitest';
import { normalizeSpanishNumber } from '../src/phone.js';

describe('normalizeSpanishNumber', () => {
  it.each([
    ['+34 955 74 88 35', '+34955748835'],
    ['+34955748835', '+34955748835'],
    ['0034 955-748-835', '+34955748835'],
    ['955 74 88 35', '+34955748835'],
    ['(+34) 612.34.56.78', '+34612345678'],
  ])('normalizes %s', (input, expected) => {
    const r = normalizeSpanishNumber(input);
    expect(r).toMatchObject({ ok: true, e164: expected });
  });

  it('formats for display', () => {
    expect(normalizeSpanishNumber('+34955748835')).toMatchObject({ display: '+34 955 74 88 35' });
  });

  it.each([
    ['', 'Introduzca'],
    ['+44 20 7946 0958', 'España'],
    ['+34 955 74 88', '9 dígitos'],
    ['+34 155 74 88 35', '9 dígitos'],
    ['+34 806 12 34 56', 'tarificación especial'],
    ['955abc', 'solo puede contener'],
    ['34+955748835', 'signo +'],
  ])('rejects %s', (input, msg) => {
    const r = normalizeSpanishNumber(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });

  it('rejects non-strings', () => {
    expect(normalizeSpanishNumber(12345).ok).toBe(false);
  });
});
