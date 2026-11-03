import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { errorBody, msg } from './messages.js';

export const COOKIE_NAME = 'llamadas_sid';
const SESSION_HOURS = 12;

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

/** Password login with an HttpOnly, SameSite=Strict session cookie. Sessions are kept in memory. */
export class Auth {
  private sessions = new Map<string, number>(); // id -> expiry (ms)
  private failures = new Map<string, { count: number; until: number }>();

  constructor(private password: string, private cookieSecure: boolean) {}

  login(req: Request, res: Response): void {
    const ip = req.ip ?? 'unknown';
    const f = this.failures.get(ip);
    if (f && f.until > Date.now()) {
      res.status(429).json(errorBody(msg('auth.throttled')));
      return;
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!safeEqual(password, this.password)) {
      const count = (f?.count ?? 0) + 1;
      this.failures.set(ip, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
      res.status(401).json(errorBody(msg('auth.wrong_password')));
      return;
    }
    this.failures.delete(ip);
    const id = randomBytes(32).toString('base64url');
    this.sessions.set(id, Date.now() + SESSION_HOURS * 3600_000);
    res.cookie(COOKIE_NAME, id, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.cookieSecure,
      maxAge: SESSION_HOURS * 3600_000,
      path: '/',
    });
    res.json({ ok: true });
  }

  /** Forget failed-login counters (used by tests). */
  clearFailures(): void {
    this.failures.clear();
  }

  logout(req: Request, res: Response): string | undefined {
    const id = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (id) this.sessions.delete(id);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return id;
  }

  sessionOf(req: Request): string | undefined {
    const id = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!id) return undefined;
    const exp = this.sessions.get(id);
    if (!exp || exp < Date.now()) {
      this.sessions.delete(id);
      return undefined;
    }
    return id;
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
