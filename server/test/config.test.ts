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
