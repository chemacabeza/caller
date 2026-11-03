import type { CallStore } from './callStore.js';

/**
 * Demo mode: drives a call record through the same states a real call would go
 * through, without contacting Twilio. Every call created here has
 * `simulated: true` and every transcript is prefixed with "[SIMULADO]".
 */
export const DEMO_SCENARIOS = {
  respuesta: 'Responde con un horario',
  respuesta_sin_hora: 'Responde sin indicar la hora',
  silencio: 'Contesta pero no dice nada',
  ocupado: 'Línea ocupada',
  sin_respuesta: 'Nadie contesta',
} as const;
export type DemoScenario = keyof typeof DEMO_SCENARIOS;

export function isDemoScenario(v: unknown): v is DemoScenario {
  return typeof v === 'string' && v in DEMO_SCENARIOS;
}

const SIMULATED_ANSWERS: Record<'respuesta' | 'respuesta_sin_hora', string> = {
  respuesta: '[SIMULADO] Buenos días. Hoy abrimos a las nueve y media de la mañana hasta las dos.',
  respuesta_sin_hora: '[SIMULADO] Uy, pues no sabría decirle, pregunte mejor mañana.',
};

export class DemoSimulator {
  private timers = new Map<string, NodeJS.Timeout[]>();

  constructor(private store: CallStore, private stepMs = 1500) {}

  start(callId: string, scenario: DemoScenario) {
    const steps: [number, () => void][] = [];
    const at = (n: number, fn: () => void) => steps.push([n * this.stepMs, fn]);
    const s = this.store;

    at(0.5, () => s.update(callId, { providerStatus: 'ringing', status: 'Llamando' }, '[SIMULADO] Sonando…'));

    if (scenario === 'ocupado') {
      at(2, () => s.update(callId, { providerStatus: 'busy', status: 'Ocupado' }, '[SIMULADO] La línea está ocupada.'));
    } else if (scenario === 'sin_respuesta') {
      at(4, () => s.update(callId, { providerStatus: 'no-answer', status: 'Sin respuesta' }, '[SIMULADO] Nadie contestó.'));
    } else {
      at(2, () => s.update(callId, { providerStatus: 'in-progress', status: 'En llamada', questionAttempts: 1 }, '[SIMULADO] Llamada contestada. Reproduciendo el mensaje.'));
      if (scenario === 'silencio') {
        at(5, () => s.update(callId, { questionAttempts: 2 }, '[SIMULADO] No se detectó voz. Repitiendo la pregunta.'));
        at(8, () => s.recordNoAnswer(callId));
      } else {
        at(5, () => s.recordAnswer(callId, SIMULATED_ANSWERS[scenario], 0.9));
        at(6, () => s.update(callId, {}, '[SIMULADO] Diciendo: «Muchas gracias. Que tenga un buen día.»'));
      }
      const end = scenario === 'silencio' ? 9 : 7;
      at(end, () => s.update(callId, { providerStatus: 'completed', status: 'Finalizada', durationSeconds: Math.round((end - 2) * this.stepMs / 1000) }, '[SIMULADO] Llamada finalizada.'));
    }

    this.timers.set(callId, steps.map(([ms, fn]) => setTimeout(fn, ms)));
  }

  hangup(callId: string) {
    for (const t of this.timers.get(callId) ?? []) clearTimeout(t);
    this.timers.delete(callId);
    this.store.update(callId, { providerStatus: 'completed', status: 'Finalizada' }, '[SIMULADO] Llamada colgada por el usuario.');
  }
}
