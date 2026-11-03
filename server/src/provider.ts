import twilio from 'twilio';
import type { AppConfig } from './config.js';

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
  constructor(message: string, public code?: number, public httpStatus?: number) {
    super(message);
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
  const known: Record<number, string> = {
    20003: 'Twilio rechazó las credenciales. Revise TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN.',
    21210: 'TWILIO_FROM_NUMBER no es un número de Twilio ni un identificador de llamada verificado en su cuenta.',
    21211: 'Twilio considera que el número de destino no es válido.',
    21212: 'TWILIO_FROM_NUMBER no es válido.',
    21214: 'Twilio no puede llamar a este número de destino.',
    21215: 'Las llamadas a este destino no están habilitadas. Active España en Voice > Settings > Geo permissions.',
    21216: 'Este número de destino está bloqueado por Twilio.',
    21219: 'Con una cuenta de prueba solo puede llamar a números verificados. Verifique el número de destino o actualice la cuenta.',
    21217: 'Twilio considera que el número de destino no es válido.',
    21220: 'No se pudo colgar: la llamada ya no está activa.',
    13227: 'Las llamadas a este país no están habilitadas en los permisos geográficos de Twilio.',
    20404: 'Twilio no encuentra el recurso solicitado (¿la llamada ya terminó?).',
  };
  const message = (code && known[code]) || `Error del proveedor de telefonía: ${e?.message ?? String(err)}`;
  return new ProviderError(message, code, e?.status);
}
