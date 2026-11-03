export type CallStatus = 'Llamando' | 'En llamada' | 'Finalizada' | 'Ocupado' | 'Sin respuesta' | 'Error';
export type UiStatus = 'Preparado' | CallStatus;
export type AnswerStatus = 'pendiente' | 'recibida' | 'sin_respuesta';

export interface Call {
  id: string;
  simulated: boolean;
  to: string;
  toDisplay: string;
  message: string;
  voice: string;
  status: CallStatus;
  providerStatus: string | null;
  providerCallSid: string | null;
  answerStatus: AnswerStatus;
  transcript: string | null;
  confidence: number | null;
  analysis: { timesMentioned: string[]; mentionsClosed: boolean; summary: string } | null;
  questionAttempts: number;
  error: string | null;
  errorCode: string | null;
  errorParams: Record<string, string | number> | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  log: { at: string; text: string; code?: string; params?: Record<string, string | number> }[];
}

export interface ServerConfig {
  realCallsPossible: boolean;
  missing: string[];
  problems: { code: string; text: string; params?: Record<string, string | number> }[];
  voice: string;
  language: string;
  fromNumberConfigured: boolean;
  greetingPauseSeconds: number;
  maxCallSeconds: number;
  maxMessageLength: number;
  defaults: { number: string; message: string };
  savedNumbers?: string[];
  demoScenarios: Record<string, string>;
}

export const FINAL_STATUSES: CallStatus[] = ['Finalizada', 'Ocupado', 'Sin respuesta', 'Error'];

export class ApiError extends Error {
  /** Stable message code (server/src/messages.ts, or client.*) for translation. */
  code: string | null;
  params: Record<string, string | number> | null;
  constructor(message: string, public status: number, public body: Record<string, unknown> = {}) {
    super(message);
    this.code = typeof body.code === 'string' ? body.code : null;
    this.params = (body.params as Record<string, string | number> | undefined) ?? null;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('No se puede contactar con el servidor. ¿Está en marcha el backend (npm run dev)?', 0, { code: 'client.unreachable' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!data.error) Object.assign(data, { code: 'client.httpError', params: { status: res.status } });
    throw new ApiError(data.error ?? `Error ${res.status}`, res.status, data);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; authenticated: boolean }>('GET', '/api/health'),
  login: (password: string) => request<{ ok: boolean }>('POST', '/api/session', { password }),
  logout: () => request<{ ok: boolean }>('DELETE', '/api/session'),
  config: () => request<ServerConfig>('GET', '/api/config'),
  startCall: (body: { to: string; message: string; demo: boolean; scenario?: string }) =>
    request<{ call: Call }>('POST', '/api/calls', body),
  getCall: (id: string) => request<{ call: Call }>('GET', `/api/calls/${id}`),
  hangup: (id: string) => request<{ call: Call }>('POST', `/api/calls/${id}/hangup`, {}),
};

/**
 * Follows a call via server-sent events, falling back to polling if SSE fails.
 * Returns an unsubscribe function.
 */
export function watchCall(id: string, onUpdate: (call: Call) => void, onError: (err: unknown) => void): () => void {
  let stopped = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let es: EventSource | undefined;

  const poll = async () => {
    if (stopped) return;
    try {
      const { call } = await api.getCall(id);
      onUpdate(call);
      if (FINAL_STATUSES.includes(call.status)) return;
    } catch (err) {
      onError(err);
    }
    pollTimer = setTimeout(poll, 2000);
  };

  if (typeof EventSource !== 'undefined') {
    es = new EventSource(`/api/calls/${id}/events`);
    es.onmessage = (ev) => {
      const call = JSON.parse(ev.data) as Call;
      onUpdate(call);
      if (FINAL_STATUSES.includes(call.status)) es?.close();
    };
    es.onerror = () => {
      es?.close();
      es = undefined;
      if (!stopped) poll();
    };
  } else {
    poll();
  }

  return () => {
    stopped = true;
    es?.close();
    clearTimeout(pollTimer);
  };
}
