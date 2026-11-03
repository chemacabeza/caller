import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, FINAL_STATUSES, watchCall, type Call, type ServerConfig, type UiStatus } from './api';
import { usePreview } from './usePreview';

export function App() {
  const [auth, setAuth] = useState<'checking' | 'out' | 'in'>('checking');
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    api
      .health()
      .then((h) => setAuth(h.authenticated ? 'in' : 'out'))
      .catch((e: Error) => {
        setBootError(e.message);
        setAuth('out');
      });
  }, []);

  return (
    <div className="page">
      <header className="header">
        <h1>
          <span aria-hidden="true">📞</span> Llamadas en Español
        </h1>
        {auth === 'in' && (
          <button
            className="link"
            onClick={async () => {
              await api.logout().catch(() => undefined);
              setAuth('out');
            }}
          >
            Cerrar sesión
          </button>
        )}
      </header>
      {bootError && <p className="alert error" role="alert">{bootError}</p>}
      {auth === 'checking' && <p className="muted">Cargando…</p>}
      {auth === 'out' && <Login onLoggedIn={() => { setBootError(null); setAuth('in'); }} />}
      {auth === 'in' && <Caller onUnauthorized={() => setAuth('out')} />}
    </div>
  );
}

function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Acceso</h2>
      <p className="muted">
        Introduzca la contraseña definida en <code>APP_PASSWORD</code>. Si no la definió, la contraseña temporal aparece en la consola del servidor.
      </p>
      <label htmlFor="password">Contraseña</label>
      <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="alert error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy || !password}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

const STATUS_CLASS: Record<UiStatus, string> = {
  Preparado: 'idle',
  Llamando: 'progress',
  'En llamada': 'live',
  Finalizada: 'done',
  Ocupado: 'warn',
  'Sin respuesta': 'warn',
  Error: 'bad',
};

function Caller({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [number, setNumber] = useState('+34 955 74 88 35');
  const [message, setMessage] = useState('Buenos días, ¿a qué hora abren hoy, por favor?');
  const [demo, setDemo] = useState(true);
  const [scenario, setScenario] = useState('respuesta');
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [hangingUp, setHangingUp] = useState(false);
  const startingRef = useRef(false); // synchronous guard against double clicks
  const preview = usePreview();

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) return onUnauthorized();
      const field = err instanceof ApiError ? (err.body.field as string | undefined) : undefined;
      setError({ text: err instanceof Error ? err.message : String(err), field });
    },
    [onUnauthorized],
  );

  useEffect(() => {
    api
      .config()
      .then((c) => {
        setConfig(c);
        setDemo(!c.realCallsPossible);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
        else setConfigError((err as Error).message);
      });
  }, [onUnauthorized]);

  const callId = call?.id;
  useEffect(() => {
    if (!callId) return;
    return watchCall(callId, setCall, (msg) => setError({ text: msg }));
  }, [callId]);

  const active = call !== null && !FINAL_STATUSES.includes(call.status);
  const status: UiStatus = call?.status ?? 'Preparado';
  const maxLen = config?.maxMessageLength ?? 500;

  const startCall = async (e: FormEvent) => {
    e.preventDefault();
    if (startingRef.current || active) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    preview.stop();
    try {
      const { call } = await api.startCall({ to: number, message, demo, scenario: demo ? scenario : undefined });
      setCall(call);
    } catch (err) {
      if (err instanceof ApiError && err.body.call) setCall(err.body.call as Call);
      handleError(err);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  const hangup = async () => {
    if (!call) return;
    setHangingUp(true);
    try {
      const { call: updated } = await api.hangup(call.id);
      setCall(updated);
    } catch (err) {
      handleError(err);
    } finally {
      setHangingUp(false);
    }
  };

  const reset = () => {
    setCall(null);
    setError(null);
  };

  return (
    <main className="layout">
      <section className="card" aria-labelledby="form-title">
        <h2 id="form-title">Nueva llamada</h2>

        <ConfigNotice config={config} error={configError} />

        <form onSubmit={startCall} noValidate>
          <label htmlFor="number">Número de teléfono</label>
          <input
            id="number"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            disabled={active || starting}
            aria-invalid={error?.field === 'to'}
            aria-describedby="number-help"
          />
          <p id="number-help" className="help">Números de España (+34). Puede escribirlo con espacios.</p>

          <label htmlFor="message">Mensaje que se reproducirá</label>
          <textarea
            id="message"
            rows={3}
            maxLength={maxLen}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={active || starting}
            aria-invalid={error?.field === 'message'}
          />
          <p className="help">
            {message.length}/{maxLen} caracteres · Voz telefónica: {config?.voice ?? '…'} ({config?.language ?? 'es-ES'})
          </p>

          <div className="preview">
            <button
              type="button"
              className="btn secondary"
              onClick={() => (preview.speaking ? preview.stop() : preview.play(message))}
              disabled={!preview.supported || !message.trim()}
            >
              {preview.speaking ? '⏹ Detener' : '🔊 Escuchar mensaje'}
            </button>
            <span className="tag">Vista previa aproximada</span>
            <p className="help">
              {preview.supported
                ? `Se usa la voz del navegador (${preview.voice ? `${preview.voice.name}, ${preview.voice.lang}` : 'voz española no disponible'}). En la llamada sonará la voz ${config?.voice ?? 'de Twilio'}.`
                : 'Su navegador no permite la vista previa de voz.'}
            </p>
          </div>

          <fieldset className="mode" disabled={active || starting}>
            <legend>Modo</legend>
            <label className="check">
              <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} disabled={!config?.realCallsPossible} />
              Modo demostración (simulado, no se realiza ninguna llamada)
            </label>
            {demo && config && (
              <>
                <label htmlFor="scenario">Escenario simulado</label>
                <select id="scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}>
                  {Object.entries(config.demoScenarios).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </>
            )}
            {!demo && (
              <p className="alert real">
                ⚠️ Se realizará una llamada <strong>real</strong> a <strong>{number}</strong>. Puede tener coste en su cuenta de Twilio.
              </p>
            )}
          </fieldset>

          {error && <p className="alert error" role="alert">{error.text}</p>}

          <div className="actions">
            <button type="submit" className="btn call" disabled={active || starting || !config || !message.trim() || !number.trim()}>
              {starting ? 'Iniciando…' : demo ? '📞 Llamar (simulado)' : '📞 Llamar'}
            </button>
            <button type="button" className="btn hangup" onClick={hangup} disabled={!active || hangingUp}>
              {hangingUp ? 'Colgando…' : '✖ Colgar'}
            </button>
          </div>
        </form>
      </section>

      <section className="card" aria-labelledby="status-title" aria-live="polite">
        <h2 id="status-title">Estado de la llamada</h2>
        <div className="status-row">
          <span className={`status ${STATUS_CLASS[status]}`}>{status}</span>
          {call?.simulated && <span className="tag sim">SIMULADO</span>}
          {call && !active && (
            <button className="link" onClick={reset}>Nueva llamada</button>
          )}
        </div>
        {call && (
          <dl className="facts">
            <dt>Destino</dt>
            <dd>{call.toDisplay}</dd>
            <dt>Respuesta</dt>
            <dd>{answerLabel(call)}</dd>
            {call.questionAttempts > 1 && (<><dt>Pregunta</dt><dd>Repetida una vez</dd></>)}
            {call.durationSeconds !== null && (<><dt>Duración</dt><dd>{call.durationSeconds} s</dd></>)}
          </dl>
        )}
        {call?.error && <p className="alert error">{call.error}</p>}

        <h2 className="transcript-title">Respuesta recibida</h2>
        <Transcript call={call} />

        {call && call.log.length > 0 && (
          <details className="log">
            <summary>Registro de la llamada</summary>
            <ol>
              {call.log.map((l, i) => (
                <li key={i}>
                  <time>{new Date(l.at).toLocaleTimeString('es-ES')}</time> {l.text}
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>
    </main>
  );
}

function answerLabel(call: Call): string {
  if (call.answerStatus === 'recibida') return 'Recibida';
  if (call.answerStatus === 'sin_respuesta') return 'No se recibió una respuesta';
  return 'Pendiente';
}

function Transcript({ call }: { call: Call | null }) {
  if (!call) return <p className="transcript empty">Aquí aparecerá lo que diga la persona que conteste.</p>;
  if (call.answerStatus === 'recibida' && call.transcript) {
    return (
      <div className={`transcript${call.simulated ? ' simulated' : ''}`}>
        {call.simulated && <p className="tag sim">Resultado simulado — no es una respuesta real</p>}
        <blockquote lang="es">«{call.transcript}»</blockquote>
        <p className="help">
          Transcripción automática literal{call.confidence !== null ? ` · confianza ${Math.round(call.confidence * 100)} %` : ''}.
        </p>
        {call.analysis && <p className="analysis">{call.analysis.summary}</p>}
      </div>
    );
  }
  if (call.answerStatus === 'sin_respuesta') {
    return (
      <div className={`transcript${call.simulated ? ' simulated' : ''}`}>
        {call.simulated && <p className="tag sim">Resultado simulado</p>}
        <p className="no-answer">No se recibió una respuesta.</p>
      </div>
    );
  }
  return <p className="transcript empty">{call.status === 'En llamada' ? 'Escuchando la respuesta…' : 'Esperando…'}</p>;
}

function ConfigNotice({ config, error }: { config: ServerConfig | null; error: string | null }) {
  if (error) return <p className="alert error">{error}</p>;
  if (!config) return null;
  if (config.realCallsPossible && config.problems.length === 0) return null;
  return (
    <div className="alert info">
      {!config.realCallsPossible && (
        <>
          <p>
            <strong>Las llamadas reales están desactivadas.</strong> Solo está disponible el modo demostración.
          </p>
          {config.missing.length > 0 && (
            <p>
              Faltan estas variables de entorno en <code>server/.env</code>: {config.missing.map((m) => <code key={m}>{m} </code>)}. Consulte el README.
            </p>
          )}
        </>
      )}
      {config.problems.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}
