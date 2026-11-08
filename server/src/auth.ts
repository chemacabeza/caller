import { randomBytes, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { errorBody, msg } from './messages.js';

export const COOKIE_NAME = 'llamadas_sid';
/** Default "remember this browser" period. Browsers cap cookie lifetimes at about 400 days. */
export const DEFAULT_SESSION_DAYS = 365;

declare module 'express-serve-static-core' {
  interface Request {
    sessionId?: string;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so lengths always match and timing does not leak the length.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Password login with an HttpOnly, SameSite=Strict session cookie.
 *
 * The cookie is a signed token `<id>.<expiry ms>.<HMAC-SHA256>` keyed on APP_PASSWORD, so the browser
 * stays logged in across server restarts (no session storage on disk), and changing APP_PASSWORD logs
 * every browser out. Logged-out ids are remembered in memory until they expire.
 */
export class Auth {
  private revoked = new Map<string, number>(); // id -> expiry (ms)
  private failures = new Map<string, { count: number; until: number }>();
  private key: Buffer;
  private sessionMs: number;

  constructor(private password: string, private cookieSecure: boolean, sessionDays = DEFAULT_SESSION_DAYS) {
    this.key = createHmac('sha256', password).update('llamadas-session-v1').digest();
    this.sessionMs = sessionDays * 24 * 3600_000;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.key).update(payload).digest('base64url');
  }

  /** Session id of a valid, unexpired, not logged-out token. */
  private verify(token: string | undefined): { id: string; exp: number } | undefined {
    const parts = (token ?? '').split('.');
    if (parts.length !== 3) return undefined;
    const [id, expRaw, mac] = parts;
    const exp = Number(expRaw);
    if (!id || !Number.isFinite(exp) || exp < Date.now()) return undefined;
    if (!safeEqual(mac, this.sign(`${id}.${expRaw}`))) return undefined;
    if (this.revoked.has(id)) return undefined;
    return { id, exp };
  }

  login(req: Request, res: Response): void {
    const ip = req.ip ?? 'unknown';
    const f = this.failures.get(ip);
    if (f && f.until > Date.now()) {
      res.status(429).json(errorBody(msg('auth.throttled')));
      return;
    }
    // Ignore surrounding whitespace (e.g. a space picked up when copying the password).
    const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    if (!safeEqual(password, this.password)) {
      const count = (f?.count ?? 0) + 1;
      this.failures.set(ip, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
      res.status(401).json(errorBody(msg('auth.wrong_password')));
      return;
    }
    this.failures.delete(ip);
    const id = randomBytes(24).toString('base64url');
    const exp = String(Date.now() + this.sessionMs);
    res.cookie(COOKIE_NAME, `${id}.${exp}.${this.sign(`${id}.${exp}`)}`, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.cookieSecure,
      maxAge: this.sessionMs,
      path: '/',
    });
    res.json({ ok: true });
  }

  /** Forget failed-login counters (used by tests). */
  clearFailures(): void {
    this.failures.clear();
  }

  logout(req: Request, res: Response): string | undefined {
    const session = this.verify(parseCookies(req.headers.cookie)[COOKIE_NAME]);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    if (!session) return undefined;
    const now = Date.now();
    for (const [id, exp] of this.revoked) if (exp < now) this.revoked.delete(id);
    this.revoked.set(session.id, session.exp);
    return session.id;
  }

  sessionOf(req: Request): string | undefined {
    return this.verify(parseCookies(req.headers.cookie)[COOKIE_NAME])?.id;
  }

  require = (req: Request, res: Response, next: NextFunction): void => {
    const id = this.sessionOf(req);
    if (!id) {
      res.status(401).json(errorBody(msg('auth.required')));
      return;
    }
    req.sessionId = id;
    next();
  };
}
