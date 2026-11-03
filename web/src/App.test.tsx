import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

const config = {
  realCallsPossible: false,
  missing: ['TWILIO_FROM_NUMBER'],
  problems: [],
  voice: 'Polly.Lucia-Neural',
  language: 'es-ES',
  fromNumberConfigured: false,
  greetingPauseSeconds: 2,
  maxCallSeconds: 120,
  maxMessageLength: 500,
  defaults: { number: '+34 955 74 88 35', message: 'Buenos días, ¿a qué hora abren hoy, por favor?' },
  demoScenarios: { respuesta: 'Responde con un horario', silencio: 'Contesta pero no dice nada' },
};

const baseCall = {
  id: 'c1', simulated: true, to: '+34955748835', toDisplay: '+34 955 74 88 35', message: 'Hola', voice: 'Polly.Lucia-Neural',
  providerStatus: null, providerCallSid: null, confidence: 0.9, questionAttempts: 1, error: null,
  createdAt: '', updatedAt: '', endedAt: null, durationSeconds: null, log: [],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/health') return json({ ok: true, authenticated: true });
    if (url === '/api/config') return json(config);
    if (url === '/api/calls' && init?.method === 'POST') {
      return json({ call: { ...baseCall, status: 'Llamando', answerStatus: 'pendiente', transcript: null, analysis: null } }, 201);
    }
    if (url === '/api/calls/c1') {
      return json({ call: { ...baseCall, status: 'Finalizada', answerStatus: 'recibida', transcript: '[SIMULADO] Abrimos a las nueve.', analysis: { timesMentioned: ['a las nueve'], mentionsClosed: false, summary: 'Horas mencionadas: a las nueve.' } } });
    }
    return json({ error: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('EventSource', undefined); // force polling path
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('shows the defaults, the missing configuration and forces demo mode', async () => {
    render(<App />);
    expect(await screen.findByLabelText('Número de teléfono')).toHaveProperty('value', '+34 955 74 88 35');
    expect(screen.getByLabelText('Mensaje que se reproducirá')).toHaveProperty('value', 'Buenos días, ¿a qué hora abren hoy, por favor?');
    expect(await screen.findByText(/Las llamadas reales están desactivadas/)).toBeTruthy();
    expect(screen.getByText('Preparado')).toBeTruthy();
    expect(screen.getByText('Vista previa aproximada')).toBeTruthy();
    const demo = screen.getByLabelText(/Modo demostración/) as HTMLInputElement;
    expect(demo.checked).toBe(true);
    expect(demo.disabled).toBe(true);
  });

  it('starts a simulated call once and shows the transcript labelled as simulated', async () => {
    const user = userEvent.setup();
    render(<App />);
    const button = await screen.findByRole('button', { name: /Llamar \(simulado\)/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await user.dblClick(button);
    expect(await screen.findByText(/Abrimos a las nueve/)).toBeTruthy();
    expect(screen.getByText(/Resultado simulado/)).toBeTruthy();
    expect(screen.getByText('Finalizada')).toBeTruthy();
    const posts = fetchMock.mock.calls.filter(([url, init]) => url === '/api/calls' && init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body)).toMatchObject({ to: '+34 955 74 88 35', demo: true, scenario: 'respuesta' });
  });
});
