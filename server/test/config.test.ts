import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig public URL', () => {
  it('prefers TUNNEL_PUBLIC_BASE_URL (Cloudflare quick tunnel) over PUBLIC_BASE_URL', () => {
    expect(loadConfig({ PUBLIC_BASE_URL: 'https://fixed.example', TUNNEL_PUBLIC_BASE_URL: 'https://abc.trycloudflare.com/' }).publicBaseUrl)
      .toBe('https://abc.trycloudflare.com');
  });
  it('falls back to PUBLIC_BASE_URL when the tunnel variable is empty', () => {
    expect(loadConfig({ PUBLIC_BASE_URL: 'https://fixed.example/', TUNNEL_PUBLIC_BASE_URL: '' }).publicBaseUrl).toBe('https://fixed.example');
  });
});

describe('DEFAULT_DESTINATION_NUMBER', () => {
  it('defaults to the Spanish example number', () => {
    expect(loadConfig({}).defaultDestination).toBe('+34 955 74 88 35');
  });
  it('accepts and formats a Chinese mobile', () => {
    expect(loadConfig({ DEFAULT_DESTINATION_NUMBER: '+8613800138000' })).toMatchObject({
      defaultDestination: '+86 138 0013 8000',
      defaultDestinationInvalid: false,
    });
  });
  it('falls back and reports a problem when the number is unsupported', async () => {
    const { configProblems } = await import('../src/config.js');
    const cfg = loadConfig({ DEFAULT_DESTINATION_NUMBER: '+44 20 7946 0958' });
    expect(cfg.defaultDestination).toBe('+34 955 74 88 35');
    expect(configProblems(cfg).map((p) => p.code)).toContain('problem.default_destination_invalid');
  });
});

describe('SAVED_NUMBERS', () => {
  it('parses, normalizes and de-duplicates the list', () => {
    const cfg = loadConfig({ SAVED_NUMBERS: '+86 138 0013 8000, +1-707-555-0123; +33 6 39 98 12 34, +8613800138000' });
    expect(cfg.savedNumbers).toEqual(['+86 138 0013 8000', '+1 707 555 0123', '+33 6 39 98 12 34']);
    expect(cfg.savedNumbersInvalid).toEqual([]);
  });
  it('is empty by default', () => {
    expect(loadConfig({}).savedNumbers).toEqual([]);
  });
  it('ignores unsupported entries and reports them', async () => {
    const { configProblems } = await import('../src/config.js');
    const cfg = loadConfig({ SAVED_NUMBERS: '+44 20 7946 0958, +1 707 555 0123' });
    expect(cfg.savedNumbers).toEqual(['+1 707 555 0123']);
    const problem = configProblems(cfg).find((p) => p.code === 'problem.saved_numbers_invalid');
    expect(problem?.params).toEqual({ numbers: '+44 20 7946 0958' });
  });
});
