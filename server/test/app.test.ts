import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import twilio from 'twilio';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { VoiceProvider } from '../src/provider.js';
import { toProviderError } from '../src/provider.js';

const BASE = 'https://test.example.com';
const TOKEN = 'test_auth_token';
const env = {
  TWILIO_ACCOUNT_SID: 'AC' + '0'.repeat(32),
  TWILIO_AUTH_TOKEN: TOKEN,
  TWILIO_FROM_NUMBER: '+34600000000',
  PUBLIC_BASE_URL: BASE,
  APP_PASSWORD: 'secreto',
  STATIC_DIR: '/nonexistent',
};

function mockProvider() {
  return {
    createCall: vi.fn<VoiceProvider['createCall']>().mockResolvedValue({ sid: 'CA123', status: 'queued' }),
    hangup: vi.fn<VoiceProvider['hangup']>().mockResolvedValue(undefined),
  };
}

function sign(path: string, params: Record<string, string>) {
  return twilio.getExpectedTwilioSignature(TOKEN, `${BASE}${path}`, params);
}

async function setup(overrides: Record<string, string> = {}) {
  const provider = mockProvider();
  const { app, store } = createApp({ cfg: loadConfig({ ...env, ...overrides }), provider, demoStepMs: 5 });
  const agent = request.agent(app);
  await agent.post('/api/session').send({ password: 'secreto' }).expect(200);
  const webhook = (path: string, params: Record<string, string>) =>
    request(app).post(path).set('X-Twilio-Signature', sign(path, params)).type('form').send(params);
  return { app, store, agent, provider, webhook };
}

describe('authentication', () => {
  it('rejects call control without a session', async () => {
    const { app } = createApp({ cfg: loadConfig(env), provider: mockProvider() });
    await request(app).post('/api/calls').send({ to: '+34955748835', message: 'Hola' }).expect(401);
    await request(app).get('/api/config').expect(401);
  });

  it('rejects a wrong password and sets an HttpOnly cookie on success', async () => {
    const { app } = createApp({ cfg: loadConfig(env), provider: mockProvider() });
    await request(app).post('/api/session').send({ password: 'mal' }).expect(401);
    const ok = await request(app).post('/api/session').send({ password: 'secreto' }).expect(200);
    expect(String(ok.headers['set-cookie'])).toMatch(/HttpOnly; SameSite=Strict/);
  });

  it('ignores whitespace around the password', async () => {
    const { app } = createApp({ cfg: loadConfig(env), provider: mockProvider() });
    await request(app).post('/api/session').send({ password: '  secreto \n' }).expect(200);
  });

  it('throttles per client behind a local proxy (X-Forwarded-For)', async () => {
    const { app } = createApp({ cfg: loadConfig(env), provider: mockProvider() });
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/session').set('X-Forwarded-For', '203.0.113.7').send({ password: 'mal' });
    }
    await request(app).post('/api/session').set('X-Forwarded-For', '203.0.113.7').send({ password: 'secreto' }).expect(429);
    // A different visitor through the same tunnel is not locked out.
    await request(app).post('/api/session').set('X-Forwarded-For', '198.51.100.9').send({ password: 'secreto' }).expect(200);
  });

  it('requires JSON for state-changing requests (CSRF)', async () => {
    const { agent } = await setup();
    await agent.post('/api/calls').type('form').send({ to: '+34955748835', message: 'Hola' }).expect(415);
  });
});

describe('config endpoint', () => {
  it('sends DEFAULT_DESTINATION_NUMBER as the pre-filled number', async () => {
    const { agent } = await setup({ DEFAULT_DESTINATION_NUMBER: '0086 138 0013 8000' });
    const res = await agent.get('/api/config').expect(200);
    expect(res.body.defaults.number).toBe('+86 138 0013 8000');
  });

  it('sends SAVED_NUMBERS to the client in display format', async () => {
    const { agent } = await setup({ SAVED_NUMBERS: '+1-707-555-0123,+33639981234' });
    const res = await agent.get('/api/config').expect(200);
    expect(res.body.savedNumbers).toEqual(['+1 707 555 0123', '+33 6 39 98 12 34']);
  });

  it('reports missing configuration without leaking secrets', async () => {
    const { agent } = await setup({ TWILIO_AUTH_TOKEN: '', PUBLIC_BASE_URL: '' });
    const res = await agent.get('/api/config').expect(200);
    expect(res.body.realCallsPossible).toBe(false);
    expect(res.body.missing).toEqual(['TWILIO_AUTH_TOKEN', 'PUBLIC_BASE_URL']);
    expect(JSON.stringify(res.body)).not.toContain('AC000');
  });
});

describe('starting a real call (mocked Twilio)', () => {
  it('normalizes the number and calls Twilio with the right webhooks and limits', async () => {
    const { agent, provider } = await setup();
    const res = await agent.post('/api/calls').send({ to: '+34 955 74 88 35', message: 'Buenos días, ¿a qué hora abren hoy, por favor?' }).expect(201);
    const id = res.body.call.id;
    expect(res.body.call).toMatchObject({ to: '+34955748835', status: 'Llamando', simulated: false, providerCallSid: 'CA123' });
    expect(provider.createCall).toHaveBeenCalledWith({
      to: '+34955748835',
      from: '+34600000000',
      answerUrl: `${BASE}/twilio/voice/${id}`,
      statusCallbackUrl: `${BASE}/twilio/status/${id}`,
      timeLimitSeconds: 120,
      ringTimeoutSeconds: 30,
    });
  });

  it('validates input', async () => {
    const { agent, provider } = await setup();
    await agent.post('/api/calls').send({ to: '+44 1234', message: 'Hola' }).expect(400);
    await agent.post('/api/calls').send({ to: '+34955748835', message: '   ' }).expect(400);
    await agent.post('/api/calls').send({ to: '+34955748835', message: 'x'.repeat(501) }).expect(400);
    await agent.post('/api/calls').send({ to: '+34 600 00 00 00', message: 'Hola' }).expect(400); // same as FROM
    expect(provider.createCall).not.toHaveBeenCalled();
  });

  it('refuses real calls when Twilio is not configured', async () => {
    const { agent, provider } = await setup({ TWILIO_FROM_NUMBER: '' });
    const res = await agent.post('/api/calls').send({ to: '+34955748835', message: 'Hola' }).expect(503);
    expect(res.body.error).toContain('TWILIO_FROM_NUMBER');
    expect(provider.createCall).not.toHaveBeenCalled();
  });

  it('prevents duplicate calls from repeated clicks', async () => {
    const { agent, provider } = await setup();
    let resolve!: (v: { sid: string; status: string }) => void;
    provider.createCall.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const body = { to: '+34955748835', message: 'Hola' };
    const first = agent.post('/api/calls').send(body).then((r) => r);
    await new Promise((r) => setTimeout(r, 20));
    const second = await agent.post('/api/calls').send(body);
    expect(second.status).toBe(409);
    resolve({ sid: 'CA1', status: 'queued' });
    expect((await first).status).toBe(201);
    expect((await agent.post('/api/calls').send(body)).status).toBe(409); // still active
    expect(provider.createCall).toHaveBeenCalledTimes(1);
  });

  it('explains geo-permission rejections with the destination prefix, and logs Twilio\'s reason', async () => {
    const { agent, provider } = await setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    provider.createCall.mockRejectedValueOnce(toProviderError({ code: 21215, status: 400, message: 'Account not allowed to call +8613800138000' }));
    const res = await agent.post('/api/calls').send({ to: '+86 138 0013 8000', message: 'Hola' }).expect(422);
    expect(res.body).toMatchObject({ code: 'provider.21215', params: { prefix: '+86' } });
    expect(res.body.error).toContain('(+86)');
    expect(res.body.error).toContain('China');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('código 21215 (HTTP 400): Account not allowed to call'));
    warn.mockRestore();
  });

  it('explains Twilio account blocks (21216) with the destination prefix', async () => {
    const { agent, provider } = await setup();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    provider.createCall.mockRejectedValueOnce(toProviderError({ code: 21216, status: 400, message: 'Account not allowed to call +8613800138000' }));
    const res = await agent.post('/api/calls').send({ to: '+86 138 0013 8000', message: 'Hola' }).expect(422);
    expect(res.body).toMatchObject({ code: 'provider.21216', params: { prefix: '+86' } });
    expect(res.body.error).toBe('Twilio no permite que su cuenta llame a este destino (+86). No se puede activar desde la configuración: solicítelo al soporte de Twilio o use otro proveedor.');
    vi.restoreAllMocks();
  });

  it('shows clear provider errors', async () => {
    const { agent, provider } = await setup();
    provider.createCall.mockRejectedValueOnce(toProviderError({ code: 21219, message: 'unverified' }));
    const res = await agent.post('/api/calls').send({ to: '+34955748835', message: 'Hola' }).expect(422);
    expect(res.body.error).toContain('cuenta de prueba');
    expect(res.body.call.status).toBe('Error');
    // A failed call must not block the next attempt.
    provider.createCall.mockResolvedValueOnce({ sid: 'CA9', status: 'queued' });
    await agent.post('/api/calls').send({ to: '+34955748835', message: 'Hola' }).expect(201);
  });
});

describe('Twilio webhooks', () => {
  async function startCall() {
    const ctx = await setup();
    const res = await ctx.agent.post('/api/calls').send({ to: '+34955748835', message: 'Buenos días, ¿a qué hora abren hoy, por favor?' });
    return { ...ctx, id: res.body.call.id as string };
  }

  it('rejects requests without a valid signature', async () => {
    const { app, id } = await startCall();
    await request(app).post(`/twilio/voice/${id}`).type('form').send({ CallSid: 'CA123' }).expect(403);
    await request(app).post(`/twilio/voice/${id}`).set('X-Twilio-Signature', 'bogus').type('form').send({ CallSid: 'CA123' }).expect(403);
  });

  it('fails closed (403) when PUBLIC_BASE_URL is missing', async () => {
    const { app } = createApp({ cfg: loadConfig({ ...env, PUBLIC_BASE_URL: '' }), provider: mockProvider() });
    await request(app).post('/twilio/status/x').set('X-Twilio-Signature', 'abc').type('form').send({ CallStatus: 'completed' }).expect(403);
  });

  it('runs the full question → answer → thanks flow', async () => {
    const { webhook, agent, id } = await startCall();
    await webhook(`/twilio/status/${id}`, { CallSid: 'CA123', CallStatus: 'ringing' }).expect(204);
    expect((await agent.get(`/api/calls/${id}`)).body.call.status).toBe('Llamando');

    const voice = await webhook(`/twilio/voice/${id}`, { CallSid: 'CA123', CallStatus: 'in-progress' }).expect(200);
    expect(voice.type).toBe('text/xml');
    expect(voice.text).toContain('¿a qué hora abren hoy, por favor?');
    expect(voice.text).toContain(`action="${BASE}/twilio/gather/${id}?attempt=1"`);
    expect((await agent.get(`/api/calls/${id}`)).body.call.status).toBe('En llamada');

    const path = `/twilio/gather/${id}?attempt=1`;
    const gather = await webhook(path, { CallSid: 'CA123', SpeechResult: 'Abrimos a las diez.', Confidence: '0.87' }).expect(200);
    expect(gather.text).toContain('Muchas gracias. Que tenga un buen día.');
    expect(gather.text).toContain('<Hangup/>');

    await webhook(`/twilio/status/${id}`, { CallSid: 'CA123', CallStatus: 'completed', CallDuration: '25' }).expect(204);
    const call = (await agent.get(`/api/calls/${id}`)).body.call;
    expect(call).toMatchObject({
      status: 'Finalizada',
      answerStatus: 'recibida',
      transcript: 'Abrimos a las diez.',
      confidence: 0.87,
      durationSeconds: 25,
    });
    expect(call.analysis.timesMentioned).toEqual(['a las diez']);
  });

  it('repeats the question once, then gives up', async () => {
    const { webhook, agent, id } = await startCall();
    await webhook(`/twilio/voice/${id}`, { CallSid: 'CA123' }).expect(200);
    const first = await webhook(`/twilio/gather/${id}?attempt=1`, { CallSid: 'CA123' }).expect(200);
    expect(first.text).toContain('¿a qué hora abren hoy');
    expect(first.text).toContain(`attempt=2`);
    const second = await webhook(`/twilio/gather/${id}?attempt=2`, { CallSid: 'CA123' }).expect(200);
    expect(second.text).toContain('<Hangup/>');
    await webhook(`/twilio/status/${id}`, { CallSid: 'CA123', CallStatus: 'completed' });
    const call = (await agent.get(`/api/calls/${id}`)).body.call;
    expect(call).toMatchObject({ status: 'Finalizada', answerStatus: 'sin_respuesta', transcript: null, questionAttempts: 2 });
    expect(call.analysis.summary).toBe('No se recibió una respuesta.');
  });

  it('maps busy / no-answer statuses and ignores out-of-order callbacks', async () => {
    const { webhook, agent, id } = await startCall();
    await webhook(`/twilio/status/${id}`, { CallSid: 'CA123', CallStatus: 'busy' });
    await webhook(`/twilio/status/${id}`, { CallSid: 'CA123', CallStatus: 'ringing' });
    expect((await agent.get(`/api/calls/${id}`)).body.call.status).toBe('Ocupado');
  });

  it('ignores callbacks with a different CallSid', async () => {
    const { webhook, agent, id } = await startCall();
    await webhook(`/twilio/status/${id}`, { CallSid: 'CAother', CallStatus: 'completed' });
    expect((await agent.get(`/api/calls/${id}`)).body.call.status).toBe('Llamando');
  });

  it('hangs up through the provider', async () => {
    const { agent, provider, id } = await startCall();
    const res = await agent.post(`/api/calls/${id}/hangup`).send({}).expect(200);
    expect(provider.hangup).toHaveBeenCalledWith('CA123', 'queued');
    expect(res.body.call.status).toBe('Finalizada');
  });
});

describe('demo mode', () => {
  beforeEach(() => vi.useRealTimers());

  it('never touches Twilio and marks everything as simulated', async () => {
    const { agent, provider } = await setup({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' });
    const res = await agent.post('/api/calls').send({ to: '+34955748835', message: 'Hola', demo: true, scenario: 'respuesta' }).expect(201);
    expect(res.body.call.simulated).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    const call = (await agent.get(`/api/calls/${res.body.call.id}`)).body.call;
    expect(call).toMatchObject({ status: 'Finalizada', answerStatus: 'recibida', simulated: true });
    expect(call.transcript).toMatch(/^\[SIMULADO\]/);
    expect(provider.createCall).not.toHaveBeenCalled();
  });

  it('streams progress over server-sent events', async () => {
    const { app, agent } = await setup();
    const res = await agent.post('/api/calls').send({ to: '+34955748835', message: 'Hola', demo: true, scenario: 'ocupado' }).expect(201);
    const cookie = (await request(app).post('/api/session').send({ password: 'secreto' })).headers['set-cookie'];
    // A different session must not see this call.
    await request(app).get(`/api/calls/${res.body.call.id}/events`).set('Cookie', cookie).expect(404);
    const sse = await agent
      .get(`/api/calls/${res.body.call.id}/events`)
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (chunk: Buffer) => {
          data += chunk.toString();
          if (data.includes('"Ocupado"')) (r as unknown as { destroy(): void }).destroy();
        });
        r.on('close', () => cb(null, data));
        r.on('end', () => cb(null, data));
      });
    expect(sse.headers['content-type']).toContain('text/event-stream');
    expect(sse.body).toContain('"status":"Ocupado"');
  });
});
