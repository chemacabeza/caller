import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

  it('leaves demo mode once the server is reconfigured for real calls, without a reload', async () => {
    let current: typeof config = config;
    fetchMock.mockImplementation((url: string) =>
      url === '/api/config' ? json(current) : url === '/api/health' ? json({ ok: true, authenticated: true }) : json({}, 404),
    );
    render(<App />);
    const demo = (await screen.findByLabelText(/Modo demostración/)) as HTMLInputElement;
    await waitFor(() => expect(demo.disabled).toBe(true));
    expect(demo.checked).toBe(true);
    // e.g. ./start.sh restarted the server with a tunnel URL while this tab stayed open
    current = { ...config, realCallsPossible: true, missing: [], fromNumberConfigured: true };
    window.dispatchEvent(new Event('focus'));
    // Real calls only: the demo option disappears.
    await waitFor(() => expect(screen.queryByLabelText(/Modo demostración/)).toBeNull());
    expect(screen.queryByText(/Las llamadas reales están desactivadas/)).toBeNull();
    expect(screen.getByRole('button', { name: /^📞 Llamar$/ })).toBeTruthy();
  });

  it('logs in automatically from a login link (#clave=…) and removes the password from the address bar', async () => {
    let loggedIn = false;
    const logins: string[] = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/health') return json({ ok: true, authenticated: loggedIn });
      if (url === '/api/session' && init?.method === 'POST') {
        const { password } = JSON.parse(String(init.body));
        logins.push(password);
        loggedIn = password === 'ab-12 cd';
        return loggedIn ? json({ ok: true }) : json({ error: 'Contraseña incorrecta.' }, 401);
      }
      if (url === '/api/config') return json(config);
      return json({}, 404);
    });
    window.history.replaceState(null, '', '/?x=1#clave=ab-12%20cd');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Nueva llamada' })).toBeTruthy();
    expect(logins).toEqual(['ab-12 cd']);
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?x=1');
    window.history.replaceState(null, '', '/');
  });

  it('shows the normal login form when the link has no password', async () => {
    fetchMock.mockImplementation((url: string) =>
      url === '/api/health' ? json({ ok: true, authenticated: false }) : json({}, 404),
    );
    window.history.replaceState(null, '', '/');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Acceso' })).toBeTruthy();
    expect(screen.getByLabelText('Contraseña')).toHaveProperty('value', '');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/session', expect.anything());
  });

  it('pre-fills the number configured on the server', async () => {
    fetchMock.mockImplementation((url: string) =>
      url === '/api/config'
        ? json({ ...config, defaults: { ...config.defaults, number: '+86 138 0013 8000' } })
        : url === '/api/health' ? json({ ok: true, authenticated: true }) : json({}, 404),
    );
    render(<App />);
    const input = await screen.findByLabelText('Número de teléfono');
    await waitFor(() => expect(input).toHaveProperty('value', '+86 138 0013 8000'));
  });

  it('shows saved numbers as one-tap buttons that fill the phone field', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) =>
      url === '/api/config'
        ? json({ ...config, savedNumbers: ['+86 138 0013 8000', '+1 707 555 0123', '+33 6 39 98 12 34'] })
        : url === '/api/health' ? json({ ok: true, authenticated: true }) : json({}, 404),
    );
    render(<App />);
    const group = await screen.findByRole('group', { name: 'Números guardados' });
    const us = within(group).getByRole('button', { name: '+1 707 555 0123' });
    await user.click(us);
    expect(screen.getByLabelText('Número de teléfono')).toHaveProperty('value', '+1 707 555 0123');
    expect(us.getAttribute('aria-pressed')).toBe('true');
    await user.click(within(group).getByRole('button', { name: '+33 6 39 98 12 34' }));
    expect(screen.getByLabelText('Número de teléfono')).toHaveProperty('value', '+33 6 39 98 12 34');
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
