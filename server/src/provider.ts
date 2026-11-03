import twilio from 'twilio';
import type { AppConfig } from './config.js';
import { MESSAGES, msg, type MessageCode, type Msg } from './messages.js';

export interface CreateCallParams {
  to: string;
  from: string;
  /** URL Twilio fetches when the call is answered. */
  answerUrl: string;
  statusCallbackUrl: string;
  timeLimitSeconds: number;
  ringTimeoutSeconds: number;
}

/** The subset of Twilio's REST API this app uses — easy to mock in tests. */
export interface VoiceProvider {
  createCall(params: CreateCallParams): Promise<{ sid: string; status: string }>;
  hangup(sid: string, currentProviderStatus: string | null): Promise<void>;
}

export class ProviderError extends Error {
  constructor(public msg: Msg, public code?: number, public httpStatus?: number, public providerMessage?: string) {
    super(msg.text);
  }
}

export function createTwilioProvider(cfg: AppConfig): VoiceProvider {
  const client = twilio(cfg.twilioAccountSid, cfg.twilioAuthToken);
  return {
    async createCall(p) {
      try {
        const call = await client.calls.create({
          to: p.to,
          from: p.from,
          url: p.answerUrl,
          method: 'POST',
          statusCallback: p.statusCallbackUrl,
          statusCallbackMethod: 'POST',
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          timeLimit: p.timeLimitSeconds,
          timeout: p.ringTimeoutSeconds,
          record: false,
        });
        return { sid: call.sid, status: call.status };
      } catch (err) {
        throw toProviderError(err);
      }
    },
    async hangup(sid, currentProviderStatus) {
      // "canceled" only applies to queued/ringing calls; "completed" hangs up an answered call.
      const ringing = currentProviderStatus === null || ['queued', 'initiated', 'ringing'].includes(currentProviderStatus);
      try {
        await client.calls(sid).update({ status: ringing ? 'canceled' : 'completed' });
      } catch (err) {
        if (ringing) {
          try {
            await client.calls(sid).update({ status: 'completed' });
            return;
          } catch (err2) {
            throw toProviderError(err2);
          }
        }
        throw toProviderError(err);
      }
    },
  };
}

/** Maps Twilio REST errors to clear Spanish messages. */
export function toProviderError(err: unknown): ProviderError {
  const e = err as { code?: number; status?: number; message?: string };
  const code = e?.code;
  const key = `provider.${code}` as MessageCode;
  const m = code && key in MESSAGES ? msg(key) : msg('provider.unknown', { message: e?.message ?? String(err) });
  return new ProviderError(m, code, e?.status, e?.message);
}
