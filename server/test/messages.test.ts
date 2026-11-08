import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { MESSAGES, errorBody, interpolate, msg } from '../src/messages.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { toProviderError } from '../src/provider.js';
import { normalizePhoneNumber } from '../src/phone.js';

describe('message catalogue', () => {
  it('interpolates parameters and leaves unknown placeholders visible', () => {
    expect(interpolate('Hola {name}, {n} llamadas', { name: 'Ana', n: 2 })).toBe('Hola Ana, 2 llamadas');
    expect(interpolate('Falta {x}')).toBe('Falta {x}');
  });

  it('builds messages with code, params and Spanish text', () => {
    expect(msg('message.too_long', { max: 500 })).toEqual({
      code: 'message.too_long',
      params: { max: 500 },
      text: 'El mensaje no puede superar 500 caracteres.',
    });
    expect(errorBody(msg('call.active'), { field: 'to' })).toEqual({
      error: MESSAGES['call.active'],
      code: 'call.active',
      field: 'to',
    });
  });

  it('every Spanish template is non-empty', () => {
    for (const [code, text] of Object.entries(MESSAGES)) expect(text.trim(), code).not.toBe('');
  });

  it('phone validation errors carry codes', () => {
    const r = normalizePhoneNumber('+44 1234');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.msg.code).toBe('phone.intl_invalid');
  });

  it('provider errors map Twilio codes, with a generic fallback', () => {
    expect(toProviderError({ code: 21219 }).msg.code).toBe('provider.21219');
    expect(toProviderError({ code: 1, message: 'boom' }).msg).toEqual({
      code: 'provider.unknown',
      params: { message: 'boom' },
      text: 'Error del proveedor de telefonía: boom',
    });
  });
});

describe('API responses are translatable', () => {
  const env = { APP_PASSWORD: 'x', STATIC_DIR: '/nonexistent' };

  it('error responses include code and params', async () => {
    const { app } = createApp({ cfg: loadConfig(env) });
    const agent = request.agent(app);
    const bad = await agent.post('/api/session').send({ password: 'no' }).expect(401);
    expect(bad.body).toMatchObject({ code: 'auth.wrong_password', error: 'Contraseña incorrecta.' });
    await agent.post('/api/session').send({ password: 'x' }).expect(200);
    const res = await agent.post('/api/calls').send({ to: '+34955748835', message: 'Hola' }).expect(503);
    expect(res.body).toMatchObject({ code: 'config.missing', params: { vars: expect.stringContaining('TWILIO_ACCOUNT_SID') } });
    const tooLong = await agent.post('/api/calls').send({ to: '+34955748835', message: 'x'.repeat(501) }).expect(400);
    expect(tooLong.body).toMatchObject({ code: 'message.too_long', params: { max: 500 }, field: 'message' });
  });

  it('call log entries include codes', async () => {
    const { app } = createApp({ cfg: loadConfig(env), demoStepMs: 2 });
    const agent = request.agent(app);
    await agent.post('/api/session').send({ password: 'x' });
    const res = await agent.post('/api/calls').send({ to: '+34955748835', message: 'Hola', demo: true, scenario: 'ocupado' }).expect(201);
    await new Promise((r) => setTimeout(r, 30));
    const call = (await agent.get(`/api/calls/${res.body.call.id}`)).body.call;
    expect(call.log.map((l: { code: string }) => l.code)).toEqual(['log.demo_created', 'log.demo_ringing', 'log.demo_busy']);
    expect(call.log[0].text).toBe('Llamada simulada creada.');
  });

  it('config problems are sent as code + text', async () => {
    const { app } = createApp({ cfg: loadConfig({ ...env, PUBLIC_BASE_URL: 'http://localhost:3001' }) });
    const agent = request.agent(app);
    await agent.post('/api/session').send({ password: 'x' });
    const cfg = (await agent.get('/api/config')).body;
    expect(cfg.problems.map((p: { code: string }) => p.code)).toEqual(['problem.public_url_https', 'problem.public_url_localhost']);
    expect(cfg.problems[0].text).toContain('https://');
  });
});
