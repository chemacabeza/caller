import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { Auth, COOKIE_NAME } from '../src/auth.js';

function login(auth: Auth, password: string) {
  let cookie: { value: string; opts: Record<string, unknown> } | undefined;
  const res = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json() { return this; },
    cookie(_name: string, value: string, opts: Record<string, unknown>) { cookie = { value, opts }; return this; },
    clearCookie() { return this; },
  };
  auth.login({ ip: `ip-${Math.random()}`, body: { password } } as unknown as Request, res as unknown as Response);
  return { status: res.statusCode, cookie };
}
const req = (token: string) => ({ headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}` } }) as unknown as Request;
const res = { clearCookie() { return this; } } as unknown as Response;

afterEach(() => vi.useRealTimers());

describe('Auth (remember this browser)', () => {
  it('issues a long-lived cookie (default 1 year)', () => {
    const { status, cookie } = login(new Auth('secreto', false), 'secreto');
    expect(status).toBe(200);
    expect(cookie!.opts).toMatchObject({ httpOnly: true, sameSite: 'strict', maxAge: 365 * 24 * 3600_000 });
  });

  it('keeps the browser logged in after a server restart with the same password', () => {
    const token = login(new Auth('secreto', false), 'secreto').cookie!.value;
    const restarted = new Auth('secreto', false);
    expect(restarted.sessionOf(req(token))).toBeTruthy();
  });

  it('logs every browser out when APP_PASSWORD changes', () => {
    const token = login(new Auth('secreto', false), 'secreto').cookie!.value;
    expect(new Auth('otra-clave', false).sessionOf(req(token))).toBeUndefined();
  });

  it('rejects tampered or expired tokens', () => {
    const auth = new Auth('secreto', false, 1);
    const token = login(auth, 'secreto').cookie!.value;
    const [id, exp, mac] = token.split('.');
    expect(auth.sessionOf(req(`${id}.${Number(exp) + 1e12}.${mac}`))).toBeUndefined();
    expect(auth.sessionOf(req(`otro.${exp}.${mac}`))).toBeUndefined();
    expect(auth.sessionOf(req('basura'))).toBeUndefined();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 24 * 3600_000);
    expect(auth.sessionOf(req(token))).toBeUndefined();
  });

  it('refuses the cookie after logout', () => {
    const auth = new Auth('secreto', false);
    const token = login(auth, 'secreto').cookie!.value;
    const id = auth.sessionOf(req(token));
    expect(auth.logout(req(token), res)).toBe(id);
    expect(auth.sessionOf(req(token))).toBeUndefined();
  });
});
