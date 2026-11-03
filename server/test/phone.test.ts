import { describe, expect, it } from 'vitest';
import { normalizePhoneNumber } from '../src/phone.js';

describe('normalizePhoneNumber — Spain (+34)', () => {
  it.each([
    ['+34 955 74 88 35', '+34955748835'],
    ['+34955748835', '+34955748835'],
    ['0034 955-748-835', '+34955748835'],
    ['955 74 88 35', '+34955748835'],
    ['(+34) 612.34.56.78', '+34612345678'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePhoneNumber(input)).toMatchObject({ ok: true, e164: expected, country: 'ES' });
  });

  it('formats for display', () => {
    expect(normalizePhoneNumber('+34955748835')).toMatchObject({ display: '+34 955 74 88 35' });
  });

  it.each([
    ['+34 955 74 88', 'phone.length'],
    ['+34 155 74 88 35', 'phone.length'],
    ['+34 806 12 34 56', 'phone.premium'],
  ])('rejects %s', (input, code) => {
    const r = normalizePhoneNumber(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.msg.code).toBe(code);
  });
});

describe('normalizePhoneNumber — China (+86)', () => {
  it.each([
    ['+86 133 3115 7888', '+8613331157888', '+86 133 3115 7888'],
    ['+8613331157888', '+8613331157888', '+86 133 3115 7888'],
    ['0086 133-3115-7888', '+8613331157888', '+86 133 3115 7888'],
    ['(+86) 199.1234.5678', '+8619912345678', '+86 199 1234 5678'],
    ['+86 10 1234 5678', '+861012345678', '+86 10 1234 5678'], // Beijing landline
    ['+86 (0)10 1234 5678', '+861012345678', '+86 10 1234 5678'], // optional trunk prefix
    ['+86 010 1234 5678', '+861012345678', '+86 10 1234 5678'],
    ['+86 21 6123 4567', '+862161234567', '+86 21 6123 4567'], // Shanghai
    ['+86 755 8123 4567', '+8675581234567', '+86 755 8123 4567'], // Shenzhen, 8-digit local
    ['+86 571 812 3456', '+865718123456', '+86 571 812 3456'], // 7-digit local
    ['+86 400 123 4567', '+864001234567', '+86 400 123 4567'], // service number
  ])('normalizes %s', (input, e164, display) => {
    expect(normalizePhoneNumber(input)).toMatchObject({ ok: true, e164, display, country: 'CN' });
  });

  it.each([
    '+86 133 3115 788', // too short
    '+86 133 3115 78889', // too long
    '+86 123 4567 8901', // mobiles start with 13–19
    '+86 1 2345', // nonsense
  ])('rejects %s', (input) => {
    const r = normalizePhoneNumber(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.msg.code).toBe('phone.cn_invalid');
  });

  it('requires the country code for Chinese numbers', () => {
    const r = normalizePhoneNumber('13331157888');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.msg.code).toBe('phone.unsupported_country');
  });
});

describe('normalizePhoneNumber — general', () => {
  it.each([
    ['', 'phone.empty'],
    ['+44 20 7946 0958', 'phone.unsupported_country'],
    ['+1 608 888 0239', 'phone.unsupported_country'],
    ['955abc', 'phone.chars'],
    ['34+955748835', 'phone.plus'],
  ])('rejects %s', (input, code) => {
    const r = normalizePhoneNumber(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.msg.code).toBe(code);
  });

  it('rejects non-strings', () => {
    expect(normalizePhoneNumber(12345).ok).toBe(false);
  });
});
