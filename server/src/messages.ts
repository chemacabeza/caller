/**
 * Every user-facing message the server produces, keyed by a stable code.
 * The server always sends the Spanish text plus the code and parameters, so
 * the web client can show it in another language (see web/src/i18n.ts).
 */
export const MESSAGES = {
  // Phone number validation
  'phone.empty': 'Introduzca un número de teléfono.',
  'phone.chars': 'El número solo puede contener dígitos, espacios, guiones, puntos, paréntesis y el signo +.',
  'phone.plus': 'El signo + solo puede aparecer al principio del número.',
  'phone.unsupported_country': 'Incluya el prefijo internacional del país con + o 00 (p. ej. +44 20 7946 0958). Solo los números españoles de 9 dígitos se pueden escribir sin prefijo.',
  'phone.intl_invalid': 'Número no válido para su país. Compruebe el prefijo internacional y la cantidad de dígitos (p. ej. +44 20 7946 0958, +52 55 1234 5678).',
  'phone.intl_premium': 'No se permiten números de tarificación especial ni de coste compartido.',
  'phone.it_invalid': 'Número italiano no válido: use +39 seguido del móvil (p. ej. +39 312 345 6789) o del fijo con su 0 inicial (p. ej. +39 06 1234 5678).',
  'phone.it_premium': 'No se permiten números italianos de tarificación especial (89x, 16x, 14x, 178, 199).',
  'phone.de_invalid': 'Número alemán no válido: use +49 seguido del móvil (p. ej. +49 171 1234567) o del prefijo de zona y el número.',
  'phone.de_premium': 'No se permiten números alemanes de tarificación especial (0900, 0137, 0118, 0180).',
  'phone.fr_invalid': 'Número francés no válido: use +33 seguido de 9 dígitos (p. ej. +33 6 39 98 12 34).',
  'phone.fr_premium': 'No se permiten números franceses de tarificación especial (08, salvo 080).',
  'phone.nanp_invalid': 'Número de EE. UU./Canadá no válido: use +1 seguido de 10 dígitos (p. ej. +1 707 555 0123).',
  'phone.nanp_premium': 'No se permiten números de tarificación especial de EE. UU. (900, 976).',
  'phone.cn_invalid': 'Número chino no válido: use un móvil de 11 dígitos que empiece por 1 (p. ej. +86 138 0013 8000) o un fijo con su prefijo de zona.',
  'phone.length': 'Un número español debe tener 9 dígitos después de +34 y empezar por 5, 6, 7, 8 o 9.',
  'phone.premium': 'No se permiten números de tarificación especial (803, 806, 807, 905, 907).',

  // Request validation / call control
  'message.empty': 'Escriba el mensaje que se reproducirá.',
  'message.too_long': 'El mensaje no puede superar {max} caracteres.',
  'demo.bad_scenario': 'Escenario de demostración no válido.',
  'config.missing': 'Faltan variables de entorno en el servidor: {vars}. Use el modo demostración o complete la configuración.',
  'config.public_url_invalid': 'PUBLIC_BASE_URL no es válida: debe ser una URL pública HTTPS.',
  'call.same_as_from': 'El número de destino no puede ser el mismo que TWILIO_FROM_NUMBER.',
  'call.active': 'Ya hay una llamada en curso. Cuélguela antes de iniciar otra.',
  'call.starting': 'Ya se está iniciando una llamada.',
  'call.unexpected': 'Error inesperado al iniciar la llamada.',
  'call.not_found': 'Llamada no encontrada (las transcripciones solo se conservan durante la sesión).',
  'call.hangup_failed': 'No se pudo colgar la llamada.',
  'call.failed': 'La llamada falló (estado de Twilio: {status}).',
  'call.failed_code': 'La llamada falló (estado de Twilio: {status}, código {errorCode}).',
  'auth.required': 'Inicie sesión para continuar.',
  'auth.wrong_password': 'Contraseña incorrecta.',
  'auth.throttled': 'Demasiados intentos. Espere un minuto e inténtelo de nuevo.',
  'request.json_required': 'Se esperaba Content-Type: application/json.',
  'server.internal': 'Error interno del servidor.',

  // Configuration problems
  'problem.public_url_https': 'PUBLIC_BASE_URL debe empezar por https:// (Twilio necesita una URL pública HTTPS).',
  'problem.public_url_localhost': 'PUBLIC_BASE_URL apunta a localhost; Twilio no puede alcanzarla. Use un túnel HTTPS (ngrok, cloudflared).',
  'problem.sid_format': 'TWILIO_ACCOUNT_SID no tiene el formato esperado (AC seguido de 32 caracteres hexadecimales).',
  'problem.from_format': 'TWILIO_FROM_NUMBER debe estar en formato E.164, por ejemplo +34600000000.',
  'problem.default_destination_invalid': 'DEFAULT_DESTINATION_NUMBER no es un número válido (incluya el prefijo internacional, p. ej. +44 20 7946 0958); se usa el número por defecto.',
  'problem.saved_numbers_invalid': 'Se han ignorado números no admitidos en SAVED_NUMBERS: {numbers}.',
  'problem.signature_disabled': 'La validación de firmas de Twilio está desactivada (TWILIO_VALIDATE_SIGNATURE=false). No lo use con un túnel público.',

  // Twilio REST errors
  'provider.20003': 'Twilio rechazó las credenciales. Revise TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN.',
  'provider.21210': 'TWILIO_FROM_NUMBER no es un número de Twilio ni un identificador de llamada verificado en su cuenta.',
  'provider.21211': 'Twilio considera que el número de destino no es válido.',
  'provider.21212': 'TWILIO_FROM_NUMBER no es válido.',
  'provider.21214': 'Twilio no puede llamar a este número de destino.',
  'provider.21215': 'Su cuenta de Twilio no permite llamar a este destino ({prefix}). Actívelo en Voice > Settings > Geo permissions; si el país no aparece en la lista (p. ej. China), consulte con el soporte de Twilio.',
  'provider.21216': 'Twilio no permite que su cuenta llame a este destino ({prefix}). No se puede activar desde la configuración: solicítelo al soporte de Twilio o use otro proveedor.',
  'provider.21217': 'Twilio considera que el número de destino no es válido.',
  'provider.21219': 'Con una cuenta de prueba solo puede llamar a números verificados. Verifique el número de destino o actualice la cuenta.',
  'provider.21220': 'No se pudo colgar: la llamada ya no está activa.',
  'provider.13227': 'Las llamadas a este país ({prefix}) no están habilitadas en los permisos geográficos de Twilio (Voice > Settings > Geo permissions).',
  'provider.20404': 'Twilio no encuentra el recurso solicitado (¿la llamada ya terminó?).',
  'provider.unknown': 'Error del proveedor de telefonía: {message}',

  // Call log
  'log.requesting': 'Solicitando llamada a Twilio…',
  'log.accepted': 'Twilio aceptó la llamada.',
  'log.answered': 'Llamada contestada. Reproduciendo el mensaje.',
  'log.repeating': 'No se detectó voz. Repitiendo la pregunta.',
  'log.answer_received': 'Respuesta recibida.',
  'log.no_answer': 'No se recibió una respuesta.',
  'log.hanging_up': 'Colgando…',
  'log.hung_up': 'Llamada colgada por el usuario.',
  'log.cancelled_before_connect': 'Llamada cancelada antes de conectar.',
  'log.provider_status': 'Estado de Twilio: {status}',
  'log.demo_created': 'Llamada simulada creada.',
  'log.demo_ringing': '[SIMULADO] Sonando…',
  'log.demo_busy': '[SIMULADO] La línea está ocupada.',
  'log.demo_no_answer': '[SIMULADO] Nadie contestó.',
  'log.demo_answered': '[SIMULADO] Llamada contestada. Reproduciendo el mensaje.',
  'log.demo_repeating': '[SIMULADO] No se detectó voz. Repitiendo la pregunta.',
  'log.demo_thanks': '[SIMULADO] Diciendo: «Muchas gracias. Que tenga un buen día.»',
  'log.demo_ended': '[SIMULADO] Llamada finalizada.',
  'log.demo_hung_up': '[SIMULADO] Llamada colgada por el usuario.',
} as const;

export type MessageCode = keyof typeof MESSAGES;
export type MessageParams = Record<string, string | number>;

/** A message in a form the client can translate: stable code + params + Spanish text. */
export interface Msg {
  code: MessageCode;
  params?: MessageParams;
  text: string;
}

export function interpolate(template: string, params: MessageParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

export function msg(code: MessageCode, params?: MessageParams): Msg {
  return { code, ...(params ? { params } : {}), text: interpolate(MESSAGES[code], params) };
}

/** JSON body for an error response: Spanish text in `error`, plus code/params for translation. */
export function errorBody(m: Msg, extra: Record<string, unknown> = {}) {
  return { error: m.text, code: m.code, ...(m.params ? { params: m.params } : {}), ...extra };
}
