import { randomBytes } from 'node:crypto';
import { msg, type Msg } from './messages.js';

export interface AppConfig {
  port: number;
  /** Twilio credentials. Empty strings when not configured. */
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  /** Public HTTPS base URL that Twilio uses to reach the webhooks (no trailing slash). */
  publicBaseUrl: string;
  /** Twilio <Say> voice, e.g. "Polly.Lucia-Neural". */
  ttsVoice: string;
  ttsLanguage: string;
  /** SSML prosody rate, e.g. "95%". Empty disables the <prosody> wrapper. */
  ttsRate: string;
  /** Seconds of silence after answer, so the recipient can say "¿Diga?". */
  greetingPauseSeconds: number;
  /** Seconds to wait for the recipient to start speaking. */
  gatherTimeoutSeconds: number;
  /** Seconds of silence that ends the recipient's answer. */
  speechTimeoutSeconds: number;
  /** Optional Twilio speechModel. Empty = Twilio default. */
  speechModel: string;
  /** Hard limit for the whole call (Twilio timeLimit). */
  maxCallSeconds: number;
  /** Seconds the phone may ring before Twilio gives up. */
  ringTimeoutSeconds: number;
  thanksMessage: string;
  /** Password protecting the call-control API. */
  appPassword: string;
  appPasswordGenerated: boolean;
  /** Minutes before a finished call (and its transcript) is deleted from memory. */
  transcriptTtlMinutes: number;
  /** Set to "false" only for local testing without a tunnel. */
  validateTwilioSignature: boolean;
  /** Serve the built frontend from this directory, if it exists. */
  staticDir: string;
  cookieSecure: boolean;
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const generated = !env.APP_PASSWORD;
  // TUNNEL_PUBLIC_BASE_URL is set automatically by start.sh for the Cloudflare quick tunnel
  // (its URL changes on every start) and takes precedence over PUBLIC_BASE_URL.
  const publicBaseUrl = (env.TUNNEL_PUBLIC_BASE_URL || env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  return {
    port: int(env.PORT, 3001, 1, 65535),
    twilioAccountSid: (env.TWILIO_ACCOUNT_SID ?? '').trim(),
    twilioAuthToken: (env.TWILIO_AUTH_TOKEN ?? '').trim(),
    // TWILIO_PHONE_NUMBER is accepted as an alias.
    twilioFromNumber: (env.TWILIO_FROM_NUMBER || env.TWILIO_PHONE_NUMBER || '').replace(/[\s\-().]/g, ''),
    publicBaseUrl,
    ttsVoice: (env.TTS_VOICE ?? '').trim() || 'Polly.Lucia-Neural',
    ttsLanguage: (env.TTS_LANGUAGE ?? '').trim() || 'es-ES',
    ttsRate: env.TTS_RATE === undefined ? '95%' : env.TTS_RATE.trim(),
    greetingPauseSeconds: int(env.GREETING_PAUSE_SECONDS, 2, 0, 10),
    gatherTimeoutSeconds: int(env.GATHER_TIMEOUT_SECONDS, 8, 3, 30),
    speechTimeoutSeconds: int(env.SPEECH_TIMEOUT_SECONDS, 3, 1, 10),
    speechModel: (env.SPEECH_MODEL ?? '').trim(),
    maxCallSeconds: int(env.MAX_CALL_SECONDS, 120, 30, 120),
    ringTimeoutSeconds: int(env.RING_TIMEOUT_SECONDS, 30, 5, 60),
    thanksMessage: 'Muchas gracias. Que tenga un buen día.',
    appPassword: env.APP_PASSWORD || randomBytes(9).toString('base64url'),
    appPasswordGenerated: generated,
    transcriptTtlMinutes: int(env.TRANSCRIPT_TTL_MINUTES, 60, 1, 24 * 60),
    validateTwilioSignature: env.TWILIO_VALIDATE_SIGNATURE !== 'false',
    staticDir: env.STATIC_DIR ?? new URL('../../web/dist', import.meta.url).pathname,
    cookieSecure: env.COOKIE_SECURE === 'true',
  };
}

/** Names of environment variables that must be set before real calls are possible. */
export function missingTwilioConfig(cfg: AppConfig): string[] {
  const missing: string[] = [];
  if (!cfg.twilioAccountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!cfg.twilioAuthToken) missing.push('TWILIO_AUTH_TOKEN');
  if (!cfg.twilioFromNumber) missing.push('TWILIO_FROM_NUMBER');
  if (!cfg.publicBaseUrl) missing.push('PUBLIC_BASE_URL');
  return missing;
}

/** Translatable problems with the configuration that are not just "missing". */
export function configProblems(cfg: AppConfig): Msg[] {
  const problems: Msg[] = [];
  if (cfg.publicBaseUrl && !cfg.publicBaseUrl.startsWith('https://')) {
    problems.push(msg('problem.public_url_https'));
  }
  if (cfg.publicBaseUrl && /localhost|127\.0\.0\.1/.test(cfg.publicBaseUrl)) {
    problems.push(msg('problem.public_url_localhost'));
  }
  if (cfg.twilioAccountSid && !/^AC[0-9a-fA-F]{32}$/.test(cfg.twilioAccountSid)) {
    problems.push(msg('problem.sid_format'));
  }
  if (cfg.twilioFromNumber && !/^\+[1-9]\d{6,14}$/.test(cfg.twilioFromNumber)) {
    problems.push(msg('problem.from_format'));
  }
  if (!cfg.validateTwilioSignature) {
    problems.push(msg('problem.signature_disabled'));
  }
  return problems;
}
