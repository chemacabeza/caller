import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, FINAL_STATUSES, watchCall, type Call, type ServerConfig, type UiStatus } from './api';
import { usePreview } from './usePreview';
import { I18nProvider, LANGS, Rich, useI18n, type Lang, type ServerMessage } from './i18n';

/** Turns any thrown value into a translatable message. */
function toMessage(err: unknown): ServerMessage {
  if (err instanceof ApiError) return { text: err.message, code: err.code, params: err.params };
  return { text: err instanceof Error ? err.message : String(err) };
}

export function App({ initialLang }: { initialLang?: Lang } = {}) {
  return (
    <I18nProvider initial={initialLang}>
      <Shell />
    </I18nProvider>
  );
}

function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          className={l === lang ? 'active' : ''}
          aria-pressed={l === lang}
          title={t(`lang.${l}`)}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/**
 * Password from a login link such as https://host/#clave=SECRET (printed by start.sh).
 * The part after "#" never leaves the browser (it is not sent to Cloudflare or the server).
 * It is removed from the address bar right away so it doesn't stay on screen.
 */
export function takeLinkPassword(): string {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return '';
  const params = new URLSearchParams(hash);
  const password = params.get('clave') ?? params.get('password') ?? '';
  if (password) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return password.trim();
}

function Shell() {
  const { t, tm } = useI18n();
  const [auth, setAuth] = useState<'checking' | 'out' | 'in'>('checking');
  // Used for one automatic login only, so "Cerrar sesión" really logs out.
  const [linkPassword, setLinkPassword] = useState(takeLinkPassword);
  const [bootError, setBootError] = useState<ServerMessage | null>(null);

  useEffect(() => {
    api
      .health()
      .then((h) => setAuth(h.authenticated ? 'in' : 'out'))
      .catch((e) => {
        setBootError(toMessage(e));
        setAuth('out');
      });
  }, []);

  return (
    <div className="page">
      <header className="header">
        <h1>
          <span aria-hidden="true">📞</span> {t('app.title')}
        </h1>
        <div className="header-actions">
          <LanguageSwitch />
          {auth === 'in' && (
            <button
              className="link"
              onClick={async () => {
                await api.logout().catch(() => undefined);
                setAuth('out');
              }}
            >
              {t('auth.logout')}
            </button>
          )}
        </div>
      </header>
      {bootError && <p className="alert error" role="alert">{tm(bootError)}</p>}
      {auth === 'checking' && <p className="muted">{t('common.loading')}</p>}
      {auth === 'out' && (
        <Login
          initialPassword={linkPassword}
          onLoggedIn={() => { setBootError(null); setLinkPassword(''); setAuth('in'); }}
          onAutoLoginFailed={() => setLinkPassword('')}
        />
      )}
      {auth === 'in' && <Caller onUnauthorized={() => setAuth('out')} />}
    </div>
  );
}

function Login({
  onLoggedIn,
  initialPassword = '',
  onAutoLoginFailed,
}: {
  onLoggedIn: () => void;
  initialPassword?: string;
  onAutoLoginFailed?: () => void;
}) {
  const { t, tm } = useI18n();
  const [password, setPassword] = useState(initialPassword);
  const [error, setError] = useState<ServerMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const doLogin = useCallback(
    async (value: string, auto = false) => {
      setBusy(true);
      setError(null);
      try {
        await api.login(value);
        onLoggedIn();
      } catch (err) {
        setError(toMessage(err));
        if (auto) onAutoLoginFailed?.();
      } finally {
        setBusy(false);
      }
    },
    [onLoggedIn, onAutoLoginFailed],
  );

  // Login link: the password is filled in from the link and submitted automatically.
  const autoTried = useRef(false);
  useEffect(() => {
    if (initialPassword && !autoTried.current) {
      autoTried.current = true;
      void doLogin(initialPassword, true);
    }
  }, [initialPassword, doLogin]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await doLogin(password);
  };

  const [before, after] = t('auth.help').split('{env}');
  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>{t('auth.title')}</h2>
      <p className="muted">
        {before}<code>APP_PASSWORD</code>{after}
      </p>
      <label htmlFor="password">{t('auth.password')}</label>
      <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="alert error" role="alert">{tm(error)}</p>}
      <button className="btn primary" disabled={busy || !password}>
        {busy ? t('auth.submitting') : t('auth.submit')}
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
  const { t, tm, scenarioLabel, locale } = useI18n();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [configError, setConfigError] = useState<ServerMessage | null>(null);
  // The call is always in Spanish, so the default message stays Spanish in both interface languages.
  const [number, setNumber] = useState('+34 955 74 88 35');
  const numberEdited = useRef(false);
  const [message, setMessage] = useState('Buenos días, ¿a qué hora abren hoy, por favor?');
  const [demo, setDemo] = useState(true);
  const [scenario, setScenario] = useState('respuesta');
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState<{ msg: ServerMessage; field?: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [hangingUp, setHangingUp] = useState(false);
  const startingRef = useRef(false); // synchronous guard against double clicks
  const preview = usePreview();

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) return onUnauthorized();
      const field = err instanceof ApiError ? (err.body.field as string | undefined) : undefined;
      setError({ msg: toMessage(err), field });
    },
    [onUnauthorized],
  );

  // Last known value of realCallsPossible, so a refresh only changes the demo checkbox when the
  // server's capability actually changes (it never overrides the user's own choice otherwise).
  const realCallsRef = useRef<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .config()
        .then((c) => {
          if (cancelled) return;
          setConfig(c);
          setConfigError(null);
          if (realCallsRef.current !== c.realCallsPossible) {
            realCallsRef.current = c.realCallsPossible;
            setDemo(!c.realCallsPossible);
          }
          // Pre-fill the server's DEFAULT_DESTINATION_NUMBER unless the user already typed one.
          if (!numberEdited.current && c.defaults?.number) setNumber(c.defaults.number);
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 401) onUnauthorized();
          else setConfigError(toMessage(err));
        });
    load();
    // The server may be restarted with a new configuration (e.g. ./start.sh creates a new tunnel and
    // enables real calls) while this tab stays open; re-read it when the tab becomes visible again
    // and every 30 s, so the page never stays stuck in demo mode.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = window.setInterval(onVisible, 30_000);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(timer);
    };
  }, [onUnauthorized]);

  const callId = call?.id;
  useEffect(() => {
    if (!callId) return;
    return watchCall(callId, setCall, (err) => setError({ msg: toMessage(err) }));
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

  const browserVoice = preview.voice ? `${preview.voice.name}, ${preview.voice.lang}` : t('preview.noSpanishVoice');

  return (
    <main className="layout">
      <section className="card" aria-labelledby="form-title">
        <h2 id="form-title">{t('form.title')}</h2>

        <ConfigNotice config={config} error={configError} />

        <form onSubmit={startCall} noValidate>
          <label htmlFor="number">{t('form.number')}</label>
          <input
            id="number"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={number}
            onChange={(e) => {
              numberEdited.current = true;
              setNumber(e.target.value);
            }}
            disabled={active || starting}
            aria-invalid={error?.field === 'to'}
            aria-describedby="number-help"
          />
          <p id="number-help" className="help">{t('form.numberHelp')}</p>
          {config?.savedNumbers && config.savedNumbers.length > 0 && (
            <div className="saved-numbers" role="group" aria-label={t('form.savedNumbers')}>
              <span className="help">{t('form.savedNumbers')}:</span>
              {config.savedNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chip${n === number ? ' active' : ''}`}
                  aria-pressed={n === number}
                  disabled={active || starting}
                  onClick={() => {
                    numberEdited.current = true;
                    setNumber(n);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          <label htmlFor="message">{t('form.message')}</label>
          <textarea
            id="message"
            lang="es"
            rows={3}
            maxLength={maxLen}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={active || starting}
            aria-invalid={error?.field === 'message'}
            aria-describedby="message-help"
          />
          <p id="message-help" className="help">
            {t('form.messageHelp', { count: message.length, max: maxLen, voice: config?.voice ?? '…', language: config?.language ?? 'es-ES' })}
            {t('form.callLanguageNote') && <><br />{t('form.callLanguageNote')}</>}
          </p>

          <div className="preview">
            <button
              type="button"
              className="btn secondary"
              onClick={() => (preview.speaking ? preview.stop() : preview.play(message))}
              disabled={!preview.supported || !message.trim()}
            >
              {preview.speaking ? t('preview.stop') : t('preview.play')}
            </button>
            <span className="tag">{t('preview.tag')}</span>
            <p className="help">
              {preview.supported
                ? t('preview.voiceInfo', { browserVoice, callVoice: config?.voice ?? t('preview.twilioVoice') })
                : t('preview.unsupported')}
            </p>
          </div>

          <fieldset className="mode" disabled={active || starting}>
            <legend>{t('mode.legend')}</legend>
            {/* Real calls only when the server can place them; demo mode is shown (and forced) only otherwise. */}
            {config && !config.realCallsPossible && (
              <label className="check">
                <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} disabled />
                {t('mode.demo')}
              </label>
            )}
            {demo && config && (
              <>
                <label htmlFor="scenario">{t('mode.scenario')}</label>
                <select id="scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}>
                  {Object.entries(config.demoScenarios).map(([k, v]) => (
                    <option key={k} value={k}>{scenarioLabel(k, v)}</option>
                  ))}
                </select>
              </>
            )}
            {!demo && (
              <p className="alert real">
                <Rich text={t('mode.realWarning', { number })} />
              </p>
            )}
            {!demo && /^(\+|00)86/.test(number.replace(/[\s\-().]/g, '')) && (
              <p className="alert real" data-testid="china-warning">{t('mode.chinaWarning')}</p>
            )}
          </fieldset>

          {error && <p className="alert error" role="alert">{tm(error.msg)}</p>}

          <div className="actions">
            <button type="submit" className="btn call" disabled={active || starting || !config || !message.trim() || !number.trim()}>
              {starting ? t('action.starting') : demo ? t('action.callDemo') : t('action.call')}
            </button>
            <button type="button" className="btn hangup" onClick={hangup} disabled={!active || hangingUp}>
              {hangingUp ? t('action.hangingUp') : t('action.hangup')}
            </button>
          </div>
        </form>
      </section>

      <section className="card" aria-labelledby="status-title" aria-live="polite">
        <h2 id="status-title">{t('status.title')}</h2>
        <div className="status-row">
          <span className={`status ${STATUS_CLASS[status]}`} data-status={status}>{t(`call.status.${status}`)}</span>
          {call?.simulated && <span className="tag sim">{t('status.simulated')}</span>}
          {call && !active && (
            <button className="link" onClick={reset}>{t('status.newCall')}</button>
          )}
        </div>
        {call && (
          <dl className="facts">
            <dt>{t('facts.destination')}</dt>
            <dd>{call.toDisplay}</dd>
            <dt>{t('facts.answer')}</dt>
            <dd>{t(call.answerStatus === 'recibida' ? 'answer.received' : call.answerStatus === 'sin_respuesta' ? 'answer.none' : 'answer.pending')}</dd>
            {call.questionAttempts > 1 && (<><dt>{t('facts.question')}</dt><dd>{t('facts.repeated')}</dd></>)}
            {call.durationSeconds !== null && (<><dt>{t('facts.duration')}</dt><dd>{call.durationSeconds} s</dd></>)}
          </dl>
        )}
        {call?.error && <p className="alert error">{tm({ text: call.error, code: call.errorCode, params: call.errorParams })}</p>}

        <h2 className="transcript-title">{t('transcript.title')}</h2>
        <Transcript call={call} />

        {call && call.log.length > 0 && (
          <details className="log">
            <summary>{t('log.title')}</summary>
            <ol>
              {call.log.map((l, i) => (
                <li key={i}>
                  <time>{new Date(l.at).toLocaleTimeString(locale)}</time> {tm(l)}
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>
    </main>
  );
}

function Transcript({ call }: { call: Call | null }) {
  const { t, analysisSummary } = useI18n();
  if (!call) return <p className="transcript empty">{t('transcript.empty')}</p>;
  if (call.answerStatus === 'recibida' && call.transcript) {
    return (
      <div className={`transcript${call.simulated ? ' simulated' : ''}`}>
        {call.simulated && <p className="tag sim">{t('transcript.simulated')}</p>}
        {/* The recipient's actual words, always shown literally in Spanish. */}
        <blockquote lang="es">«{call.transcript}»</blockquote>
        <p className="help">
          {t('transcript.literal')}
          {call.confidence !== null ? t('transcript.confidence', { pct: Math.round(call.confidence * 100) }) : ''}.
        </p>
        {call.analysis && <p className="analysis">{analysisSummary(call.analysis)}</p>}
      </div>
    );
  }
  if (call.answerStatus === 'sin_respuesta') {
    return (
      <div className={`transcript${call.simulated ? ' simulated' : ''}`}>
        {call.simulated && <p className="tag sim">{t('transcript.simulatedShort')}</p>}
        <p className="no-answer">{t('transcript.noAnswer')}</p>
      </div>
    );
  }
  return <p className="transcript empty">{call.status === 'En llamada' ? t('transcript.listening') : t('transcript.waiting')}</p>;
}

function ConfigNotice({ config, error }: { config: ServerConfig | null; error: ServerMessage | null }) {
  const { t, tm } = useI18n();
  if (error) return <p className="alert error">{tm(error)}</p>;
  if (!config) return null;
  if (config.realCallsPossible && config.problems.length === 0) return null;
  const [before, after] = t('notice.missing').split('{vars}');
  return (
    <div className="alert info">
      {!config.realCallsPossible && (
        <>
          <p>
            <Rich text={t('notice.disabled')} />
          </p>
          {config.missing.length > 0 && (
            <p>
              {before.replace('{file}', 'server/.env')}
              {config.missing.map((m) => <code key={m}>{m} </code>)}
              {after}
            </p>
          )}
        </>
      )}
      {config.problems.map((p) => (
        <p key={p.code}>{tm(p)}</p>
      ))}
    </div>
  );
}
