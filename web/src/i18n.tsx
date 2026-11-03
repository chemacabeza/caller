import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Interface language. The phone call itself is always in Spanish (es-ES);
 * only the web interface changes.
 */
export type Lang = 'es' | 'en';
export const LANGS: Lang[] = ['es', 'en'];
const STORAGE_KEY = 'llamadas.lang';

type Params = Record<string, string | number>;

const ui = {
  es: {
    'app.title': 'Llamadas en Español',
    'lang.label': 'Idioma',
    'lang.es': 'Español',
    'lang.en': 'English',
    'common.loading': 'Cargando…',
    'auth.logout': 'Cerrar sesión',
    'auth.title': 'Acceso',
    'auth.help': 'Introduzca la contraseña definida en {env}. Si no la definió, la contraseña temporal aparece en la consola del servidor.',
    'auth.password': 'Contraseña',
    'auth.submit': 'Entrar',
    'auth.submitting': 'Entrando…',
    'form.title': 'Nueva llamada',
    'form.number': 'Número de teléfono',
    'form.numberHelp': 'Números de España (+34), Francia (+33), Alemania (+49), Italia (+39), China (+86) o EE. UU./Canadá (+1). Puede escribirlo con espacios o guiones.',
    'form.savedNumbers': 'Números guardados',
    'form.message': 'Mensaje que se reproducirá',
    'form.messageHelp': '{count}/{max} caracteres · Voz telefónica: {voice} ({language})',
    'form.callLanguageNote': '',
    'preview.play': '🔊 Escuchar mensaje',
    'preview.stop': '⏹ Detener',
    'preview.tag': 'Vista previa aproximada',
    'preview.voiceInfo': 'Se usa la voz del navegador ({browserVoice}). En la llamada sonará la voz {callVoice}.',
    'preview.noSpanishVoice': 'voz española no disponible',
    'preview.twilioVoice': 'de Twilio',
    'preview.unsupported': 'Su navegador no permite la vista previa de voz.',
    'mode.legend': 'Modo',
    'mode.demo': 'Modo demostración (simulado, no se realiza ninguna llamada)',
    'mode.scenario': 'Escenario simulado',
    'mode.realWarning': '⚠️ Se realizará una llamada <b>real</b> a <b>{number}</b>. Puede tener coste en su cuenta de Twilio.',
    'action.call': '📞 Llamar',
    'action.callDemo': '📞 Llamar (simulado)',
    'action.starting': 'Iniciando…',
    'action.hangup': '✖ Colgar',
    'action.hangingUp': 'Colgando…',
    'status.title': 'Estado de la llamada',
    'status.simulated': 'SIMULADO',
    'status.newCall': 'Nueva llamada',
    'facts.destination': 'Destino',
    'facts.answer': 'Respuesta',
    'facts.question': 'Pregunta',
    'facts.repeated': 'Repetida una vez',
    'facts.duration': 'Duración',
    'answer.received': 'Recibida',
    'answer.none': 'No se recibió una respuesta',
    'answer.pending': 'Pendiente',
    'transcript.title': 'Respuesta recibida',
    'transcript.empty': 'Aquí aparecerá lo que diga la persona que conteste.',
    'transcript.simulated': 'Resultado simulado — no es una respuesta real',
    'transcript.simulatedShort': 'Resultado simulado',
    'transcript.literal': 'Transcripción automática literal',
    'transcript.confidence': ' · confianza {pct} %',
    'transcript.noAnswer': 'No se recibió una respuesta.',
    'transcript.listening': 'Escuchando la respuesta…',
    'transcript.waiting': 'Esperando…',
    'log.title': 'Registro de la llamada',
    'notice.disabled': '<b>Las llamadas reales están desactivadas.</b> Solo está disponible el modo demostración.',
    'notice.missing': 'Faltan estas variables de entorno en {file}: {vars}. Consulte el README.',
    'call.status.Preparado': 'Preparado',
    'call.status.Llamando': 'Llamando',
    'call.status.En llamada': 'En llamada',
    'call.status.Finalizada': 'Finalizada',
    'call.status.Ocupado': 'Ocupado',
    'call.status.Sin respuesta': 'Sin respuesta',
    'call.status.Error': 'Error',
    'client.unreachable': 'No se puede contactar con el servidor. ¿Está en marcha el backend (npm run dev)?',
    'client.httpError': 'Error {status}',
    'client.gateway': 'No se pudo contactar con la aplicación a través del túnel (HTTP {status}). Puede que se esté reiniciando: espere unos segundos y vuelva a intentarlo.',
    'mode.chinaWarning': 'Atención: es posible que su cuenta de Twilio no permita llamar a China (+86). Si Twilio la rechaza, verá el motivo aquí.',
  },
  en: {
    'app.title': 'Llamadas en Español',
    'lang.label': 'Language',
    'lang.es': 'Español',
    'lang.en': 'English',
    'common.loading': 'Loading…',
    'auth.logout': 'Log out',
    'auth.title': 'Sign in',
    'auth.help': 'Enter the password set in {env}. If you did not set one, the temporary password is printed in the server console.',
    'auth.password': 'Password',
    'auth.submit': 'Sign in',
    'auth.submitting': 'Signing in…',
    'form.title': 'New call',
    'form.number': 'Phone number',
    'form.numberHelp': 'Spanish (+34), French (+33), German (+49), Italian (+39), Chinese (+86) or US/Canadian (+1) numbers. Spaces and hyphens are fine.',
    'form.savedNumbers': 'Saved numbers',
    'form.message': 'Message to be spoken',
    'form.messageHelp': '{count}/{max} characters · Phone voice: {voice} ({language})',
    'form.callLanguageNote': 'The call is made in Spanish: write the message in Spanish.',
    'preview.play': '🔊 Listen to message',
    'preview.stop': '⏹ Stop',
    'preview.tag': 'Approximate preview',
    'preview.voiceInfo': 'Uses your browser’s voice ({browserVoice}). The call will use the voice {callVoice}.',
    'preview.noSpanishVoice': 'no Spanish voice available',
    'preview.twilioVoice': 'from Twilio',
    'preview.unsupported': 'Your browser does not support voice preview.',
    'mode.legend': 'Mode',
    'mode.demo': 'Demo mode (simulated, no call is made)',
    'mode.scenario': 'Simulated scenario',
    'mode.realWarning': '⚠️ A <b>real</b> call will be made to <b>{number}</b>. It may be charged to your Twilio account.',
    'action.call': '📞 Call',
    'action.callDemo': '📞 Call (simulated)',
    'action.starting': 'Starting…',
    'action.hangup': '✖ Hang up',
    'action.hangingUp': 'Hanging up…',
    'status.title': 'Call status',
    'status.simulated': 'SIMULATED',
    'status.newCall': 'New call',
    'facts.destination': 'Destination',
    'facts.answer': 'Answer',
    'facts.question': 'Question',
    'facts.repeated': 'Repeated once',
    'facts.duration': 'Duration',
    'answer.received': 'Received',
    'answer.none': 'No answer was received',
    'answer.pending': 'Pending',
    'transcript.title': 'Answer received',
    'transcript.empty': 'What the person who answers says will appear here.',
    'transcript.simulated': 'Simulated result — not a real answer',
    'transcript.simulatedShort': 'Simulated result',
    'transcript.literal': 'Literal automatic transcription (in Spanish)',
    'transcript.confidence': ' · confidence {pct}%',
    'transcript.noAnswer': 'No answer was received.',
    'transcript.listening': 'Listening for the answer…',
    'transcript.waiting': 'Waiting…',
    'log.title': 'Call log',
    'notice.disabled': '<b>Real calls are disabled.</b> Only demo mode is available.',
    'notice.missing': 'These environment variables are missing in {file}: {vars}. See the README.',
    'call.status.Preparado': 'Ready',
    'call.status.Llamando': 'Calling',
    'call.status.En llamada': 'In call',
    'call.status.Finalizada': 'Finished',
    'call.status.Ocupado': 'Busy',
    'call.status.Sin respuesta': 'No answer',
    'call.status.Error': 'Error',
    'client.unreachable': 'Cannot reach the server. Is the backend running (npm run dev)?',
    'client.httpError': 'Error {status}',
    'client.gateway': 'Could not reach the app through the tunnel (HTTP {status}). It may be restarting: wait a few seconds and try again.',
    'mode.chinaWarning': 'Note: your Twilio account may not be allowed to call China (+86). If Twilio rejects the call, the reason will be shown here.',
  },
} as const satisfies Record<Lang, Record<string, string>>;

export type UiKey = keyof (typeof ui)['es'];

/**
 * English versions of messages generated by the server (server/src/messages.ts).
 * In Spanish the server's own text is shown, so only English is listed here.
 */
const serverEn: Record<string, string> = {
  'phone.empty': 'Enter a phone number.',
  'phone.chars': 'The number may only contain digits, spaces, hyphens, dots, parentheses and the + sign.',
  'phone.plus': 'The + sign may only appear at the start of the number.',
  'phone.unsupported_country': 'Only Spanish (+34), French (+33), German (+49), Italian (+39), Chinese (+86) and US/Canadian (+1) numbers are supported for now. Except for Spanish numbers, include the country code.',
  'phone.it_invalid': 'Invalid Italian number: use +39 followed by the mobile number (e.g. +39 312 345 6789) or the landline with its leading 0 (e.g. +39 06 1234 5678).',
  'phone.it_premium': 'Italian special-rate numbers (89x, 16x, 14x, 178, 199) are not allowed.',
  'phone.de_invalid': 'Invalid German number: use +49 followed by the mobile number (e.g. +49 171 1234567) or the area code and number.',
  'phone.de_premium': 'German special-rate numbers (0900, 0137, 0118, 0180) are not allowed.',
  'phone.fr_invalid': 'Invalid French number: use +33 followed by 9 digits (e.g. +33 6 39 98 12 34).',
  'phone.fr_premium': 'French special-rate numbers (08, except 080) are not allowed.',
  'phone.nanp_invalid': 'Invalid US/Canadian number: use +1 followed by 10 digits (e.g. +1 707 555 0123).',
  'phone.nanp_premium': 'US premium-rate numbers (900, 976) are not allowed.',
  'phone.cn_invalid': 'Invalid Chinese number: use an 11-digit mobile starting with 1 (e.g. +86 138 0013 8000) or a landline with its area code.',
  'phone.length': 'A Spanish number must have 9 digits after +34 and start with 5, 6, 7, 8 or 9.',
  'phone.premium': 'Premium-rate numbers (803, 806, 807, 905, 907) are not allowed.',
  'message.empty': 'Write the message to be spoken.',
  'message.too_long': 'The message cannot be longer than {max} characters.',
  'demo.bad_scenario': 'Invalid demo scenario.',
  'config.missing': 'Environment variables missing on the server: {vars}. Use demo mode or complete the configuration.',
  'config.public_url_invalid': 'PUBLIC_BASE_URL is not valid: it must be a public HTTPS URL.',
  'call.same_as_from': 'The destination number cannot be the same as TWILIO_FROM_NUMBER.',
  'call.active': 'A call is already in progress. Hang it up before starting another.',
  'call.starting': 'A call is already being started.',
  'call.unexpected': 'Unexpected error while starting the call.',
  'call.not_found': 'Call not found (transcripts are only kept for the current session).',
  'call.hangup_failed': 'The call could not be hung up.',
  'call.failed': 'The call failed (Twilio status: {status}).',
  'call.failed_code': 'The call failed (Twilio status: {status}, code {errorCode}).',
  'auth.required': 'Please sign in to continue.',
  'auth.wrong_password': 'Wrong password.',
  'auth.throttled': 'Too many attempts. Wait a minute and try again.',
  'request.json_required': 'Expected Content-Type: application/json.',
  'server.internal': 'Internal server error.',
  'problem.public_url_https': 'PUBLIC_BASE_URL must start with https:// (Twilio needs a public HTTPS URL).',
  'problem.public_url_localhost': 'PUBLIC_BASE_URL points to localhost, which Twilio cannot reach. Use an HTTPS tunnel (ngrok, cloudflared).',
  'problem.sid_format': 'TWILIO_ACCOUNT_SID does not have the expected format (AC followed by 32 hex characters).',
  'problem.from_format': 'TWILIO_FROM_NUMBER must be in E.164 format, e.g. +34600000000.',
  'problem.default_destination_invalid': 'DEFAULT_DESTINATION_NUMBER is not a supported number (Spain +34, France +33, Germany +49, Italy +39, China +86 or US/Canada +1); the built-in default is used.',
  'problem.saved_numbers_invalid': 'Unsupported numbers in SAVED_NUMBERS were ignored: {numbers}.',
  'problem.signature_disabled': 'Twilio signature validation is disabled (TWILIO_VALIDATE_SIGNATURE=false). Do not use this with a public tunnel.',
  'provider.20003': 'Twilio rejected the credentials. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
  'provider.21210': 'TWILIO_FROM_NUMBER is not a Twilio number or a verified caller ID on your account.',
  'provider.21211': 'Twilio considers the destination number invalid.',
  'provider.21212': 'TWILIO_FROM_NUMBER is not valid.',
  'provider.21214': 'Twilio cannot call this destination number.',
  'provider.21215': 'Your Twilio account cannot call this destination ({prefix}). Enable it under Voice > Settings > Geo permissions; if the country is not listed (e.g. China), contact Twilio support.',
  'provider.21216': 'Twilio does not allow your account to call this destination ({prefix}). It cannot be enabled in the settings: ask Twilio support or use another provider.',
  'provider.21217': 'Twilio considers the destination number invalid.',
  'provider.21219': 'Trial accounts can only call verified numbers. Verify the destination number or upgrade the account.',
  'provider.21220': 'Could not hang up: the call is no longer active.',
  'provider.13227': 'Calls to this country ({prefix}) are not enabled in your Twilio geo permissions (Voice > Settings > Geo permissions).',
  'provider.20404': 'Twilio cannot find the requested resource (has the call already ended?).',
  'provider.unknown': 'Telephony provider error: {message}',
  'log.requesting': 'Requesting call from Twilio…',
  'log.accepted': 'Twilio accepted the call.',
  'log.answered': 'Call answered. Playing the message.',
  'log.repeating': 'No speech detected. Repeating the question.',
  'log.answer_received': 'Answer received.',
  'log.no_answer': 'No answer was received.',
  'log.hanging_up': 'Hanging up…',
  'log.hung_up': 'Call hung up by the user.',
  'log.cancelled_before_connect': 'Call cancelled before connecting.',
  'log.provider_status': 'Twilio status: {status}',
  'log.demo_created': 'Simulated call created.',
  'log.demo_ringing': '[SIMULATED] Ringing…',
  'log.demo_busy': '[SIMULATED] The line is busy.',
  'log.demo_no_answer': '[SIMULATED] Nobody answered.',
  'log.demo_answered': '[SIMULATED] Call answered. Playing the message.',
  'log.demo_repeating': '[SIMULATED] No speech detected. Repeating the question.',
  'log.demo_thanks': '[SIMULATED] Saying: “Muchas gracias. Que tenga un buen día.”',
  'log.demo_ended': '[SIMULATED] Call finished.',
  'log.demo_hung_up': '[SIMULATED] Call hung up by the user.',
};

const demoScenariosEn: Record<string, string> = {
  respuesta: 'Answers with opening hours',
  respuesta_sin_hora: 'Answers without giving a time',
  silencio: 'Picks up but says nothing',
  ocupado: 'Line busy',
  sin_respuesta: 'Nobody answers',
};

export function interpolate(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

/** A message from the server: Spanish text plus an optional code/params for translation. */
export interface ServerMessage {
  text: string;
  code?: string | null;
  params?: Params | null;
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Interface string. */
  t: (key: UiKey, params?: Params) => string;
  /** Server-generated message: Spanish text as sent, or its translation. */
  tm: (m: ServerMessage) => string;
  /** Label of a demo scenario (server sends the Spanish label). */
  scenarioLabel: (id: string, spanishLabel: string) => string;
  /** Summary of the automatic answer analysis, in the interface language. */
  analysisSummary: (a: { timesMentioned: string[]; mentionsClosed: boolean; summary: string }) => string;
  locale: string;
}

const I18nContext = createContext<I18n | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return 'es'; // Spanish is the default interface language.
}

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial ?? initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = ui[lang]['app.title'];
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const t = (key: UiKey, params?: Params) => interpolate(ui[lang][key], params);
    return {
      lang,
      setLang,
      t,
      tm: (m) => {
        if (m.code?.startsWith('client.') && m.code in ui[lang]) return t(m.code as UiKey, m.params ?? {});
        if (lang === 'es' || !m.code || !(m.code in serverEn)) return m.text;
        return interpolate(serverEn[m.code], m.params ?? {});
      },
      scenarioLabel: (id, es) => (lang === 'en' ? demoScenariosEn[id] ?? es : es),
      analysisSummary: (a) => {
        if (lang === 'es') return a.summary;
        let s: string;
        if (a.timesMentioned.length > 0) s = `Times mentioned (automatic detection, check the transcript): ${a.timesMentioned.join('; ')}.`;
        else if (a.mentionsClosed) s = 'The answer suggests it is closed today. No opening time was mentioned.';
        else s = 'The answer does not include a clear opening time. Read the literal transcript.';
        if (a.timesMentioned.length > 0 && a.mentionsClosed) s += ' The answer also mentions it might be closed.';
        return s;
      },
      locale: lang === 'es' ? 'es-ES' : 'en-GB',
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Renders a translation that contains <b>…</b> markup, without using innerHTML. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(<b>.*?<\/b>)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('<b>') ? <strong key={i}>{p.slice(3, -4)}</strong> : p))}
    </>
  );
}

export const _testing = { ui, serverEn, demoScenariosEn };
