import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { _testing, interpolate } from './i18n';
import { MESSAGES } from '../../server/src/messages';
import { App } from './App';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translation catalogues', () => {
  it('English and Spanish UI dictionaries have the same keys', () => {
    expect(Object.keys(_testing.ui.en).sort()).toEqual(Object.keys(_testing.ui.es).sort());
  });

  it('UI translations use the same placeholders in both languages', () => {
    for (const key of Object.keys(_testing.ui.es) as (keyof typeof _testing.ui.es)[]) {
      expect(placeholders(_testing.ui.en[key]), key).toEqual(placeholders(_testing.ui.es[key]));
    }
  });

  it('every server message code has an English translation with the same placeholders', () => {
    for (const [code, es] of Object.entries(MESSAGES)) {
      expect(_testing.serverEn[code], `missing English for ${code}`).toBeDefined();
      expect(placeholders(_testing.serverEn[code]), code).toEqual(placeholders(es));
    }
    // ...and no stale translations for codes the server no longer has.
    for (const code of Object.keys(_testing.serverEn)) expect(MESSAGES, code).toHaveProperty([code]);
  });

  it('bold markup is balanced', () => {
    for (const dict of [_testing.ui.es, _testing.ui.en]) {
      for (const [k, v] of Object.entries(dict)) {
        expect((v.match(/<b>/g) ?? []).length, k).toBe((v.match(/<\/b>/g) ?? []).length);
      }
    }
  });

  it('interpolates', () => {
    expect(interpolate('{a} y {b}', { a: 1, b: 'dos' })).toBe('1 y dos');
  });
});

const config = {
  realCallsPossible: false,
  missing: ['TWILIO_FROM_NUMBER'],
  problems: [{ code: 'problem.sid_format', text: 'TWILIO_ACCOUNT_SID no tiene el formato esperado (AC seguido de 32 caracteres hexadecimales).' }],
  voice: 'Polly.Lucia-Neural',
  language: 'es-ES',
  fromNumberConfigured: false,
  greetingPauseSeconds: 2,
  maxCallSeconds: 120,
  maxMessageLength: 500,
  defaults: { number: '+34 955 74 88 35', message: 'Buenos días, ¿a qué hora abren hoy, por favor?' },
  demoScenarios: { respuesta: 'Responde con un horario', ocupado: 'Línea ocupada' },
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('language switch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('EventSource', undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/health') return json({ ok: true, authenticated: true });
        if (url === '/api/config') return json(config);
        if (url === '/api/calls' && init?.method === 'POST') {
          return json({ error: 'Por ahora solo se admiten números de España (+34) y China (+86). Los números chinos deben incluir +86.', code: 'phone.unsupported_country', field: 'to' }, 400);
        }
        return json({}, 404);
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('defaults to Spanish', async () => {
    render(<App />);
    expect(await screen.findByLabelText('Número de teléfono')).toBeTruthy();
    expect(document.documentElement.lang).toBe('es');
    expect(screen.getByRole('button', { name: 'ES' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('switches the whole interface to English and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText('Número de teléfono');
    await user.click(screen.getByRole('button', { name: 'EN' }));

    expect(screen.getByLabelText('Phone number')).toBeTruthy();
    expect(screen.getByLabelText('Message to be spoken')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Answer received' })).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Approximate preview')).toBeTruthy();
    expect(screen.getByText(/Real calls are disabled/)).toBeTruthy();
    expect(screen.getByText(/TWILIO_ACCOUNT_SID does not have the expected format/)).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Line busy' })).toBeTruthy();
    expect(screen.getByText(/The call is made in Spanish/)).toBeTruthy();
    // The spoken message itself stays Spanish.
    expect(screen.getByLabelText('Message to be spoken')).toHaveProperty('value', 'Buenos días, ¿a qué hora abren hoy, por favor?');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('llamadas.lang')).toBe('en');

    cleanup();
    render(<App />);
    expect(await screen.findByLabelText('Phone number')).toBeTruthy();
  });

  it('translates server errors by code, and re-translates when switching back', async () => {
    const user = userEvent.setup();
    render(<App initialLang="en" />);
    const button = await screen.findByRole('button', { name: /Call \(simulated\)/ });
    await user.clear(screen.getByLabelText('Phone number'));
    await user.type(screen.getByLabelText('Phone number'), '+44 20 7946 0958');
    await user.click(button);
    expect((await screen.findByRole('alert')).textContent).toBe('Only Spanish (+34) and Chinese (+86) numbers are supported for now. Chinese numbers must include +86.');
    await user.click(screen.getByRole('button', { name: 'ES' }));
    expect(screen.getByRole('alert').textContent).toBe('Por ahora solo se admiten números de España (+34) y China (+86). Los números chinos deben incluir +86.');
  });
});
