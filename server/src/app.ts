import express, { type Request, type Response, type NextFunction } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import twilio from 'twilio';
import { configProblems, missingTwilioConfig, type AppConfig } from './config.js';
import { normalizeSpanishNumber } from './phone.js';
import { CallStore, isFinal, mapProviderStatus, type CallRecord } from './callStore.js';
import { createTwilioProvider, ProviderError, type VoiceProvider } from './provider.js';
import { answerTwiml, giveUpTwiml, hangupTwiml, MAX_QUESTION_ATTEMPTS, repeatTwiml, thanksTwiml } from './twiml.js';
import { DEMO_SCENARIOS, DemoSimulator, isDemoScenario } from './demo.js';
import { Auth } from './auth.js';

export const MAX_MESSAGE_LENGTH = 500;
export const DEFAULT_NUMBER = '+34 955 74 88 35';
export const DEFAULT_MESSAGE = 'Buenos días, ¿a qué hora abren hoy, por favor?';

export interface AppDeps {
  cfg: AppConfig;
  /** Injected in tests; defaults to the real Twilio REST client. */
  provider?: VoiceProvider;
  demoStepMs?: number;
}

export function createApp({ cfg, provider, demoStepMs }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  const store = new CallStore(cfg.transcriptTtlMinutes);
  const demo = new DemoSimulator(store, demoStepMs);
  const auth = new Auth(cfg.appPassword, cfg.cookieSecure);
  const missing = missingTwilioConfig(cfg);
  const realCallsPossible = missing.length === 0 && !configProblems(cfg).some((p) => p.startsWith('PUBLIC_BASE_URL'));
  let voice: VoiceProvider | undefined = provider;
  const getProvider = () => (voice ??= createTwilioProvider(cfg));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // ───────────────────────────── Public endpoints ─────────────────────────────
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      authenticated: Boolean(auth.sessionOf(req)),
    });
  });

  app.post('/api/session', express.json({ limit: '4kb' }), (req, res) => auth.login(req, res));
  app.delete('/api/session', (req, res) => {
    const id = auth.logout(req, res);
    if (id) store.deleteSession(id); // forget this session's transcripts
    res.json({ ok: true });
  });

  // ─────────────────────────── Authenticated API ───────────────────────────
  const api = express.Router();
  api.use(auth.require);
  api.use((req, res, next) => {
    // CSRF defence in addition to SameSite=Strict cookies: state-changing calls must be JSON.
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
      res.status(415).json({ error: 'Se esperaba Content-Type: application/json.' });
      return;
    }
    next();
  });
  api.use(express.json({ limit: '16kb' }));

  api.get('/config', (_req, res) => {
    res.json({
      realCallsPossible,
      missing,
      problems: configProblems(cfg),
      voice: cfg.ttsVoice,
      language: cfg.ttsLanguage,
      fromNumberConfigured: Boolean(cfg.twilioFromNumber),
      greetingPauseSeconds: cfg.greetingPauseSeconds,
      maxCallSeconds: cfg.maxCallSeconds,
      maxMessageLength: MAX_MESSAGE_LENGTH,
      defaults: { number: DEFAULT_NUMBER, message: DEFAULT_MESSAGE },
      demoScenarios: DEMO_SCENARIOS,
    });
  });

  api.post('/calls', async (req, res) => {
    const { to, message, demo: demoRequested, scenario } = req.body ?? {};
    const simulated = demoRequested === true;

    const phone = normalizeSpanishNumber(to);
    if (!phone.ok) return void res.status(400).json({ error: phone.error, field: 'to' });

    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) return void res.status(400).json({ error: 'Escriba el mensaje que se reproducirá.', field: 'message' });
    if (text.length > MAX_MESSAGE_LENGTH) {
      return void res.status(400).json({ error: `El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`, field: 'message' });
    }

    if (simulated && !isDemoScenario(scenario)) {
      return void res.status(400).json({ error: 'Escenario de demostración no válido.' });
    }
    if (!simulated) {
      if (missing.length) {
        return void res.status(503).json({ error: `Faltan variables de entorno en el servidor: ${missing.join(', ')}. Use el modo demostración o complete la configuración.` });
      }
      if (!realCallsPossible) {
        return void res.status(503).json({ error: configProblems(cfg).join(' ') });
      }
      if (phone.e164 === cfg.twilioFromNumber) {
        return void res.status(400).json({ error: 'El número de destino no puede ser el mismo que TWILIO_FROM_NUMBER.', field: 'to' });
      }
    }

    // Duplicate-call protection: one active call at a time, plus a lock for the creation window.
    const active = store.active();
    if (active) {
      return void res.status(409).json({ error: 'Ya hay una llamada en curso. Cuélguela antes de iniciar otra.', call: active.sessionId === req.sessionId ? CallStore.toPublic(active) : undefined });
    }
    const lockKey = req.sessionId!;
    if (!store.tryLockStart(lockKey)) {
      return void res.status(409).json({ error: 'Ya se está iniciando una llamada.' });
    }

    let call: CallRecord | undefined;
    try {
      call = store.create({
        sessionId: req.sessionId!,
        simulated,
        to: phone.e164,
        toDisplay: phone.display,
        message: text,
        voice: cfg.ttsVoice,
      });
      if (simulated) {
        demo.start(call.id, scenario);
      } else {
        const result = await getProvider().createCall({
          to: phone.e164,
          from: cfg.twilioFromNumber,
          answerUrl: `${cfg.publicBaseUrl}/twilio/voice/${call.id}`,
          statusCallbackUrl: `${cfg.publicBaseUrl}/twilio/status/${call.id}`,
          timeLimitSeconds: cfg.maxCallSeconds,
          ringTimeoutSeconds: cfg.ringTimeoutSeconds,
        });
        store.update(call.id, { providerCallSid: result.sid, providerStatus: result.status }, 'Twilio aceptó la llamada.');
      }
      res.status(201).json({ call: CallStore.toPublic(store.get(call.id)!) });
    } catch (err) {
      const message = err instanceof ProviderError ? err.message : 'Error inesperado al iniciar la llamada.';
      if (!(err instanceof ProviderError)) console.error(err);
      if (call) store.update(call.id, { status: 'Error', error: message }, message);
      res.status(502).json({ error: message, call: call ? CallStore.toPublic(store.get(call.id)!) : undefined });
    } finally {
      store.unlockStart(lockKey);
    }
  });

  const ownCall = (req: Request, res: Response): CallRecord | undefined => {
    const call = store.get(String(req.params.id));
    if (!call || call.sessionId !== req.sessionId) {
      res.status(404).json({ error: 'Llamada no encontrada (las transcripciones solo se conservan durante la sesión).' });
      return undefined;
    }
    return call;
  };

  api.get('/calls/:id', (req, res) => {
    const call = ownCall(req, res);
    if (call) res.json({ call: CallStore.toPublic(call) });
  });

  api.post('/calls/:id/hangup', async (req, res) => {
    const call = ownCall(req, res);
    if (!call) return;
    if (isFinal(call.status)) return void res.json({ call: CallStore.toPublic(call) });
    store.update(call.id, { hangupRequested: true }, 'Colgando…');
    try {
      if (call.simulated) {
        demo.hangup(call.id);
      } else if (call.providerCallSid) {
        await getProvider().hangup(call.providerCallSid, call.providerStatus);
        store.update(call.id, { status: 'Finalizada' }, 'Llamada colgada por el usuario.');
      } else {
        store.update(call.id, { status: 'Finalizada' }, 'Llamada cancelada antes de conectar.');
      }
      res.json({ call: CallStore.toPublic(store.get(call.id)!) });
    } catch (err) {
      const message = err instanceof ProviderError ? err.message : 'No se pudo colgar la llamada.';
      store.update(call.id, {}, message);
      res.status(502).json({ error: message, call: CallStore.toPublic(store.get(call.id)!) });
    }
  });

  // Server-sent events: pushes the full call snapshot on every change.
  api.get('/calls/:id/events', (req, res) => {
    const call = ownCall(req, res);
    if (!call) return;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    send(CallStore.toPublic(call));
    const unsubscribe = store.subscribe(call.id, send);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.use('/api', api);

  // ───────────────────────────── Twilio webhooks ─────────────────────────────
  const twilioRouter = express.Router();
  twilioRouter.use(express.urlencoded({ extended: false, limit: '64kb' }));
  twilioRouter.use((req: Request, res: Response, next: NextFunction) => {
    if (!cfg.validateTwilioSignature) return next();
    const signature = req.header('X-Twilio-Signature') ?? '';
    const url = `${cfg.publicBaseUrl}${req.originalUrl}`;
    let valid = false;
    try {
      valid = Boolean(cfg.twilioAuthToken && cfg.publicBaseUrl && signature) &&
        twilio.validateRequest(cfg.twilioAuthToken, signature, url, req.body ?? {});
    } catch {
      valid = false; // e.g. malformed PUBLIC_BASE_URL — fail closed
    }
    if (!valid) {
      console.warn(`Firma de Twilio no válida para ${req.originalUrl}`);
      return void res.status(403).type('text/plain').send('Invalid Twilio signature');
    }
    next();
  });

  const sendTwiml = (res: Response, xml: string) => res.type('text/xml').send(xml);
  const gatherUrl = (id: string, attempt: number) => `${cfg.publicBaseUrl}/twilio/gather/${id}?attempt=${attempt}`;

  /** Ignore webhooks for unknown calls or calls whose SID does not match. */
  const webhookCall = (req: Request): CallRecord | undefined => {
    const call = store.get(String(req.params.id));
    if (!call || call.simulated) return undefined;
    const sid = req.body?.CallSid;
    if (call.providerCallSid && sid && sid !== call.providerCallSid) return undefined;
    return call;
  };

  twilioRouter.post('/voice/:id', (req, res) => {
    const call = webhookCall(req);
    if (!call || call.hangupRequested) return void sendTwiml(res, hangupTwiml());
    store.update(
      call.id,
      { status: 'En llamada', providerStatus: 'in-progress', providerCallSid: call.providerCallSid ?? req.body?.CallSid ?? null, questionAttempts: 1 },
      'Llamada contestada. Reproduciendo el mensaje.',
    );
    sendTwiml(res, answerTwiml(cfg, call.message, gatherUrl(call.id, 1)));
  });

  twilioRouter.post('/gather/:id', (req, res) => {
    const call = webhookCall(req);
    if (!call) return void sendTwiml(res, hangupTwiml());
    const attempt = Number.parseInt(String(req.query.attempt ?? '1'), 10) || 1;
    const speech = typeof req.body?.SpeechResult === 'string' ? req.body.SpeechResult.trim() : '';
    const confidence = req.body?.Confidence !== undefined ? Number.parseFloat(req.body.Confidence) : NaN;

    if (speech) {
      store.recordAnswer(call.id, speech, Number.isFinite(confidence) ? confidence : null);
      return void sendTwiml(res, thanksTwiml(cfg));
    }
    if (attempt < MAX_QUESTION_ATTEMPTS) {
      store.update(call.id, { questionAttempts: attempt + 1 }, 'No se detectó voz. Repitiendo la pregunta.');
      return void sendTwiml(res, repeatTwiml(cfg, call.message, gatherUrl(call.id, attempt + 1)));
    }
    store.recordNoAnswer(call.id);
    sendTwiml(res, giveUpTwiml(cfg));
  });

  twilioRouter.post('/status/:id', (req, res) => {
    const call = webhookCall(req);
    if (call) {
      const providerStatus = String(req.body?.CallStatus ?? '');
      const status = mapProviderStatus(providerStatus, call.hangupRequested);
      const duration = Number.parseInt(String(req.body?.CallDuration ?? ''), 10);
      const errorText =
        status === 'Error'
          ? `La llamada falló (estado de Twilio: ${providerStatus || 'desconocido'}${req.body?.ErrorCode ? `, código ${req.body.ErrorCode}` : ''}).`
          : null;
      store.update(
        call.id,
        {
          providerStatus,
          status,
          ...(Number.isFinite(duration) ? { durationSeconds: duration } : {}),
          ...(errorText ? { error: errorText } : {}),
        },
        `Estado de Twilio: ${providerStatus}`,
      );
    }
    res.status(204).end();
  });

  app.use('/twilio', twilioRouter);

  // ───────────────────────────── Frontend (production build) ─────────────────────────────
  if (existsSync(cfg.staticDir)) {
    app.use(express.static(cfg.staticDir, { index: 'index.html' }));
    app.get(/^\/(?!api\/|twilio\/).*/, (_req, res) => res.sendFile(path.join(cfg.staticDir, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return { app, store, auth };
}
