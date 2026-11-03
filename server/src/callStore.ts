import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { analyzeAnswer, type AnswerAnalysis } from './answerAnalysis.js';

/** Call progress as shown in the UI. "Preparado" is a client-only state. */
export type CallStatus = 'Llamando' | 'En llamada' | 'Finalizada' | 'Ocupado' | 'Sin respuesta' | 'Error';

/** Whether the recipient answered the question — tracked separately from call completion. */
export type AnswerStatus = 'pendiente' | 'recibida' | 'sin_respuesta';

export interface CallRecord {
  id: string;
  sessionId: string;
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
  analysis: AnswerAnalysis | null;
  /** How many times the question was asked (1 or 2). */
  questionAttempts: number;
  error: string | null;
  hangupRequested: boolean;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  log: { at: string; text: string }[];
}

export type PublicCall = Omit<CallRecord, 'sessionId' | 'hangupRequested'>;

const FINAL: CallStatus[] = ['Finalizada', 'Ocupado', 'Sin respuesta', 'Error'];
export const isFinal = (s: CallStatus) => FINAL.includes(s);

/** Twilio CallStatus → UI status. */
export function mapProviderStatus(providerStatus: string, hangupRequested: boolean): CallStatus {
  switch (providerStatus) {
    case 'queued':
    case 'initiated':
    case 'ringing':
      return 'Llamando';
    case 'in-progress':
    case 'answered':
      return 'En llamada';
    case 'completed':
      return 'Finalizada';
    case 'busy':
      return 'Ocupado';
    case 'no-answer':
      return 'Sin respuesta';
    case 'canceled':
      return hangupRequested ? 'Finalizada' : 'Error';
    default:
      return 'Error';
  }
}

/**
 * In-memory call store. Nothing is written to disk: transcripts live only
 * as long as the server process and are purged after `ttlMinutes`.
 */
export class CallStore {
  private calls = new Map<string, CallRecord>();
  private events = new EventEmitter();
  private pendingStart = new Set<string>();

  constructor(private ttlMinutes: number) {
    this.events.setMaxListeners(100);
  }

  create(input: { sessionId: string; simulated: boolean; to: string; toDisplay: string; message: string; voice: string }): CallRecord {
    const now = new Date().toISOString();
    const call: CallRecord = {
      id: randomUUID(),
      ...input,
      status: 'Llamando',
      providerStatus: null,
      providerCallSid: null,
      answerStatus: 'pendiente',
      transcript: null,
      confidence: null,
      analysis: null,
      questionAttempts: 0,
      error: null,
      hangupRequested: false,
      createdAt: now,
      updatedAt: now,
      endedAt: null,
      durationSeconds: null,
      log: [{ at: now, text: input.simulated ? 'Llamada simulada creada.' : 'Solicitando llamada a Twilio…' }],
    };
    this.calls.set(call.id, call);
    this.emit(call);
    return call;
  }

  get(id: string): CallRecord | undefined {
    return this.calls.get(id);
  }

  /** The (single) non-final call, if any. Only one call may be active at a time. */
  active(): CallRecord | undefined {
    return [...this.calls.values()].find((c) => !isFinal(c.status));
  }

  /** Guards the gap between "button pressed" and "call record created". */
  tryLockStart(key: string): boolean {
    if (this.pendingStart.size > 0) return false;
    this.pendingStart.add(key);
    return true;
  }
  unlockStart(key: string): void {
    this.pendingStart.delete(key);
  }

  update(id: string, patch: Partial<CallRecord>, logText?: string): CallRecord | undefined {
    const call = this.calls.get(id);
    if (!call) return undefined;
    // Once a call is final, its status must not move back (Twilio callbacks may arrive out of order).
    if (patch.status && isFinal(call.status) && patch.status !== call.status) {
      delete patch.status;
    }
    Object.assign(call, patch, { updatedAt: new Date().toISOString() });
    if (patch.status && isFinal(patch.status) && !call.endedAt) {
      call.endedAt = call.updatedAt;
      if (call.answerStatus === 'pendiente') call.answerStatus = 'sin_respuesta';
      this.scheduleCleanup(call.id);
    }
    if (logText) call.log.push({ at: call.updatedAt, text: logText });
    this.emit(call);
    return call;
  }

  recordAnswer(id: string, transcript: string, confidence: number | null): CallRecord | undefined {
    return this.update(
      id,
      { transcript, confidence, answerStatus: 'recibida', analysis: analyzeAnswer(transcript) },
      'Respuesta recibida.',
    );
  }

  recordNoAnswer(id: string): CallRecord | undefined {
    return this.update(
      id,
      { answerStatus: 'sin_respuesta', analysis: analyzeAnswer('') },
      'No se recibió una respuesta.',
    );
  }

  deleteSession(sessionId: string): void {
    for (const [id, call] of this.calls) {
      if (call.sessionId === sessionId && isFinal(call.status)) this.calls.delete(id);
    }
  }

  subscribe(id: string, listener: (call: PublicCall) => void): () => void {
    const name = `call:${id}`;
    this.events.on(name, listener);
    return () => this.events.off(name, listener);
  }

  static toPublic(call: CallRecord): PublicCall {
    const { sessionId: _s, hangupRequested: _h, ...rest } = call;
    return structuredClone(rest);
  }

  private emit(call: CallRecord) {
    this.events.emit(`call:${call.id}`, CallStore.toPublic(call));
  }

  private scheduleCleanup(id: string) {
    setTimeout(() => this.calls.delete(id), this.ttlMinutes * 60_000).unref();
  }
}
