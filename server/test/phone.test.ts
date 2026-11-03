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
    ['+86 138 0013 8000', '+8613800138000', '+86 138 0013 8000'],
    ['+8613800138000', '+8613800138000', '+86 138 0013 8000'],
    ['0086 138-0013-8000', '+8613800138000', '+86 138 0013 8000'],
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
    '+86 138 0013 800', // too short
    '+86 138 0013 80009', // too long
    '+86 123 4567 8901', // mobiles start with 13–19
    '+86 1 2345', // nonsense
  ])('rejects %s', (input) => {
    const r = normalizePhoneNumber(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.msg.code).toBe('phone.cn_invalid');
  });

  it('without + or 00, only Spanish numbers are accepted', () => {
    expect(normalizePhoneNumber('34955748835')).toMatchObject({ ok: true, e164: '+34955748835' });
    for (const bare of ['17075550123', '33639981234', '8613800138000', '491711234567']) {
      const r = normalizePhoneNumber(bare);
      expect(r.ok, bare).toBe(false);
      if (!r.ok) expect(r.msg.code).toBe('phone.unsupported_country');
    }
  });

  it('requires the country code for Chinese numbers', () => {
    const r = normalizePhoneNumber('13800138000');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.msg.code).toBe('phone.unsupported_country');
  });
});

describe('normalizePhoneNumber — USA/Canada (+1)', () => {
  it.each([
    ['+1-707-555-0123', '+17075550123', '+1 707 555 0123'],
    ['+1 (707) 555-0123', '+17075550123', '+1 707 555 0123'],
    ['001 707 555 0123', '+17075550123', '+1 707 555 0123'],
    ['+1.416.555.0199', '+14165550199', '+1 416 555 0199'], // Toronto
    ['+1 800 555 0100', '+18005550100', '+1 800 555 0100'], // toll-free
  ])('normalizes %s', (input, e164, display) => {
    expect(normalizePhoneNumber(input)).toMatchObject({ ok: true, e164, display, country: 'NANP' });
  });

  it.each([
    ['+1 707 555 012', 'phone.nanp_invalid'], // too short
    ['+1 707 555 01234', 'phone.nanp_invalid'], // too long
    ['+1 107 555 0123', 'phone.nanp_invalid'], // area code cannot start with 0/1
    ['+1 707 155 0123', 'phone.nanp_invalid'], // exchange cannot start with 0/1
    ['+1 911 555 0123', 'phone.nanp_invalid'], // N11 service code
    ['+1 900 555 0123', 'phone.nanp_premium'],
    ['+1 707 976 0123', 'phone.nanp_premium'],
  ])('rejects %s', (input, code) => {
    const r = normalizePhoneNumber(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.msg.code).toBe(code);
  });
});

describe('normalizePhoneNumber — France (+33)', () => {
  it.each([
    ['+33 6 39 98 12 34', '+33639981234', '+33 6 39 98 12 34'],
    ['+33639981234', '+33639981234', '+33 6 39 98 12 34'],
    ['0033 6 39 98 12 34', '+33639981234', '+33 6 39 98 12 34'],
    ['+33 (0)6 39 98 12 34', '+33639981234', '+33 6 39 98 12 34'],
    ['+33 06 39 98 12 34', '+33639981234', '+33 6 39 98 12 34'],
    ['+33 1 42 68 53 00', '+33142685300', '+33 1 42 68 53 00'], // Paris landline
    ['+33 800 12 34 56', '+33800123456', '+33 8 00 12 34 56'], // freephone
  ])('normalizes %s', (input, e164, display) => {
    expect(normalizePhoneNumber(input)).toMatchObject({ ok: true, e164, display, country: 'FR' });
  });

  it.each([
    ['+33 6 39 98 12 3', 'phone.fr_invalid'],
    ['+33 6 39 98 12 345', 'phone.fr_invalid'],
    ['+33 891 12 34 56', 'phone.fr_premium'],
    ['+33 836 12 34 56', 'phone.fr_premium'],
  ])('rejects %s', (input, code) => {
    const r = normalizePhoneNumber(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.msg.code).toBe(code);
  });

  it('requires the country code (domestic 07… is not accepted)', () => {
    const r = normalizePhoneNumber('06 39 98 12 34');
    expect(r.ok).toBe(false);
  });
});

describe('normalizePhoneNumber — Germany (+49)', () => {
  it.each([
    ['+491711234567', '+491711234567', '+49 171 1234567'],
    ['+49 171 1234567', '+491711234567', '+49 171 1234567'],
    ['+49 (0)171 123 4567', '+491711234567', '+49 171 1234567'],
    ['0049 0171-1234567', '+491711234567', '+49 171 1234567'],
    ['+49 1521 2345678', '+4915212345678', '+49 152 12345678'], // 11-digit mobile
    ['+49 30 1234567', '+49301234567', '+49 301234567'], // Berlin landline
    ['+49 89 12345678', '+498912345678', '+49 8912345678'], // Munich landline
    ['+49 800 1234567', '+498001234567', '+49 800 1234567'], // freephone
  ])('normalizes %s', (input, e164, display) => {
    expect(normalizePhoneNumber(input)).toMatchObject({ ok: true, e164, display, country: 'DE' });
  });

  it.each([
    ['+49 171 12345', 'phone.de_invalid'], // mobile too short
    ['+49 171 123456789', 'phone.de_invalid'], // too long
    ['+49 12 3456789', 'phone.de_invalid'], // 012 is not a valid range
    ['+49 900 1234567', 'phone.de_premium'],
    ['+49 137 1234567', 'phone.de_premium'],
    ['+49 11833', 'phone.de_premium'],
    ['+49 180 1234567', 'phone.de_premium'],
  ])('rejects %s', (input, code) => {
    const r = normalizePhoneNumber(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.msg.code).toBe(code);
  });
});

describe('normalizePhoneNumber — general', () => {
  it.each([
    ['', 'phone.empty'],
    ['+44 20 7946 0958', 'phone.unsupported_country'],
    ['+44 20 7946 0959', 'phone.unsupported_country'],
    ['+39 06 1234 5678', 'phone.unsupported_country'],
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
