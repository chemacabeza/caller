/**
 * Very small, conservative heuristic that looks for clock times in a Spanish
 * transcript. It never invents an answer: when nothing recognisable is found
 * it says so, and the UI always shows the literal transcript next to it.
 */
export interface AnswerAnalysis {
  /** Time expressions literally found in the transcript, in order of appearance. */
  timesMentioned: string[];
  /** The recipient said something that suggests they are closed today. */
  mentionsClosed: boolean;
  /** Short Spanish summary for the UI. */
  summary: string;
}

const NUMBER_WORDS = [
  'una', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce',
  'trece', 'catorce', 'quince', 'dieciséis', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuna', 'veintiuno', 'veintidós', 'veintidos', 'veintitrés', 'veintitres', 'mediodía', 'mediodia',
];
const NUM = `(?:\\d{1,2}(?:[:.h]\\d{2})?(?:\\s?h)?|${NUMBER_WORDS.join('|')})`;
const MINUTES = `(?:\\s+y\\s+(?:media|cuarto|\\d{1,2}|diez|veinte|cuarenta)|\\s+menos\\s+(?:cuarto|diez|veinte|cinco))?`;
const PERIOD = `(?:\\s+de\\s+la\\s+(?:mañana|tarde|noche|madrugada)|\\s+del\\s+mediodía|\\s*(?:am|pm|a\\.\\s?m\\.|p\\.\\s?m\\.))?`;

// "a las nueve", "desde las 9:30", "de 9 a 14", "las diez y media de la mañana", "a mediodía", "9:00"
const TIME_RE = new RegExp(
  `(?:\\b(?:a|desde|hasta|de|sobre|hacia)\\s+(?:las?\\s+)?|\\blas?\\s+)${NUM}${MINUTES}${PERIOD}(?=$|[\\s,.;!?])` +
    `|\\b\\d{1,2}[:.]\\d{2}\\b(?:\\s?h)?${PERIOD}` +
    `|\\ba\\s+mediod[ií]a\\b`,
  'giu',
);

// Things like "de la mañana" alone or "a la una" should still match; plain numbers
// like "dos personas" without a preposition are intentionally ignored.
const CLOSED_RE = /\b(cerrad[oa]s?|no\s+abrimos|no\s+abre|hoy\s+no|festivo|vacaciones)\b/iu;

export function analyzeAnswer(transcript: string): AnswerAnalysis {
  const text = transcript.trim();
  if (!text) {
    return { timesMentioned: [], mentionsClosed: false, summary: 'No se recibió una respuesta.' };
  }
  const timesMentioned = Array.from(text.matchAll(TIME_RE), (m) => m[0].trim()).filter(isPlausibleTime);
  const mentionsClosed = CLOSED_RE.test(text);

  let summary: string;
  if (timesMentioned.length > 0) {
    summary = `Horas mencionadas (detección automática, compruébelo en la transcripción): ${timesMentioned.join('; ')}.`;
  } else if (mentionsClosed) {
    summary = 'La respuesta parece indicar que hoy está cerrado. No se mencionó ninguna hora de apertura.';
  } else {
    summary = 'La respuesta no incluye una hora de apertura clara. Lea la transcripción literal.';
  }
  if (timesMentioned.length > 0 && mentionsClosed) {
    summary += ' La respuesta también menciona que podría estar cerrado.';
  }
  return { timesMentioned, mentionsClosed, summary };
}

function isPlausibleTime(match: string): boolean {
  const digits = match.match(/\d{1,2}(?=[:.h]?\d{0,2})/);
  if (!digits) return true; // word-based time
  const hour = Number.parseInt(digits[0], 10);
  return hour >= 0 && hour <= 24;
}
