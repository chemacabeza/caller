/**
 * End-to-end test server. Runs the real backend (createApp) and the built
 * frontend (web/dist) twice:
 *
 *   :3101  "demo" instance — no Twilio configuration, only demo mode works.
 *   :3102  "real" instance — fully configured, but the Twilio REST API is
 *          replaced by an in-memory fake that records every request. Tests
 *          play the part of Twilio by sending correctly signed webhooks.
 *
 * Each instance exposes test-only control endpoints under /__e2e.
 * Nothing here ever contacts Twilio or places a phone call.
 */
import express from 'express';
import { createApp } from '../../server/src/app.js';
import { loadConfig } from '../../server/src/config.js';
import { isFinal } from '../../server/src/callStore.js';
import { toProviderError, type CreateCallParams, type VoiceProvider } from '../../server/src/provider.js';
import { E2E } from './constants.js';

class FakeTwilio implements VoiceProvider {
  created: (CreateCallParams & { sid: string })[] = [];
  hangups: { sid: string; providerStatus: string | null }[] = [];
  failNext: { code: number; message: string } | null = null;
  delayMs = 0;
  private seq = 0;

  async createCall(params: CreateCallParams) {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failNext) {
      const f = this.failNext;
      this.failNext = null;
      throw toProviderError(f);
    }
    const sid = `CAe2e${String(++this.seq).padStart(29, '0')}`;
    this.created.push({ ...params, sid });
    return { sid, status: 'queued' };
  }

  async hangup(sid: string, providerStatus: string | null) {
    this.hangups.push({ sid, providerStatus });
  }

  reset() {
    this.created = [];
    this.hangups = [];
    this.failNext = null;
    this.delayMs = 0;
  }
}

function start(port: number, env: Record<string, string>, fake?: FakeTwilio) {
  const { app, store, auth } = createApp({
    cfg: loadConfig({ APP_PASSWORD: E2E.password, ...env }),
    provider: fake,
    demoStepMs: E2E.demoStepMs,
  });

  const control = express.Router();
  control.use(express.json());
  control.post('/reset', (_req, res) => {
    // Finish any call left over from a previous test so the next one can start.
    let active;
    while ((active = store.active())) store.update(active.id, { status: 'Finalizada' }, '[e2e] reset');
    fake?.reset();
    auth.clearFailures();
    res.json({ ok: true });
  });
  control.get('/twilio', (_req, res) => res.json({ created: fake?.created ?? [], hangups: fake?.hangups ?? [] }));
  control.post('/twilio/fail-next', (req, res) => {
    if (fake) fake.failNext = req.body;
    res.json({ ok: true });
  });
  control.post('/twilio/delay', (req, res) => {
    if (fake) fake.delayMs = Number(req.body.ms) || 0;
    res.json({ ok: true });
  });
  control.get('/calls/:id', (req, res) => {
    const c = store.get(req.params.id);
    res.status(c ? 200 : 404).json(c ? { status: c.status, final: isFinal(c.status), sessionId: Boolean(c.sessionId) } : {});
  });

  const outer = express();
  outer.disable('x-powered-by');
  outer.use('/__e2e', control);
  outer.use(app);
  outer.listen(port, () => console.log(`[e2e] listening on http://localhost:${port}`));
}

start(E2E.demoPort, {
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  TWILIO_FROM_NUMBER: '',
  PUBLIC_BASE_URL: '',
});

start(
  E2E.realPort,
  {
    TWILIO_ACCOUNT_SID: E2E.accountSid,
    TWILIO_AUTH_TOKEN: E2E.authToken,
    TWILIO_FROM_NUMBER: E2E.fromNumber,
    PUBLIC_BASE_URL: E2E.publicBaseUrl,
    TTS_VOICE: 'Polly.Lucia-Neural',
    GREETING_PAUSE_SECONDS: '2',
  },
  new FakeTwilio(),
);
