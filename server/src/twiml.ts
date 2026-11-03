import twilio from 'twilio';
import type { AppConfig } from './config.js';

const { VoiceResponse } = twilio.twiml;
type VR = InstanceType<typeof VoiceResponse>;

export const MAX_QUESTION_ATTEMPTS = 2;

function say(vr: VR, cfg: AppConfig, text: string) {
  const attrs = { voice: cfg.ttsVoice as never, language: cfg.ttsLanguage as never };
  // Polly voices accept SSML <prosody>; a slightly slower rate sounds clearer on the phone.
  if (cfg.ttsRate && cfg.ttsVoice.startsWith('Polly.')) vr.say(attrs, '').prosody({ rate: cfg.ttsRate }, text);
  else vr.say(attrs, text);
}

/**
 * Asks the question and then listens. The message is spoken *outside* <Gather>
 * so that a late "¿Diga?" from the recipient cannot interrupt it (barge-in).
 */
function askAndListen(vr: VR, cfg: AppConfig, message: string, gatherActionUrl: string) {
  say(vr, cfg, message);
  vr.gather({
    input: ['speech'],
    language: cfg.ttsLanguage as never,
    action: gatherActionUrl,
    method: 'POST',
    actionOnEmptyResult: true,
    timeout: cfg.gatherTimeoutSeconds,
    speechTimeout: String(cfg.speechTimeoutSeconds),
    profanityFilter: false,
    ...(cfg.speechModel ? { speechModel: cfg.speechModel as never } : {}),
  });
}

/** TwiML returned when the recipient picks up. */
export function answerTwiml(cfg: AppConfig, message: string, gatherActionUrl: string): string {
  const vr = new VoiceResponse();
  if (cfg.greetingPauseSeconds > 0) vr.pause({ length: cfg.greetingPauseSeconds });
  askAndListen(vr, cfg, message, gatherActionUrl);
  return vr.toString();
}

/** TwiML after the recipient answered: thank them and hang up. */
export function thanksTwiml(cfg: AppConfig): string {
  const vr = new VoiceResponse();
  say(vr, cfg, cfg.thanksMessage);
  vr.hangup();
  return vr.toString();
}

/** TwiML when nothing was heard: repeat the question once. */
export function repeatTwiml(cfg: AppConfig, message: string, gatherActionUrl: string): string {
  const vr = new VoiceResponse();
  askAndListen(vr, cfg, message, gatherActionUrl);
  return vr.toString();
}

/** TwiML when nothing was heard twice: polite goodbye and hang up. */
export function giveUpTwiml(cfg: AppConfig): string {
  return thanksTwiml(cfg);
}

export function hangupTwiml(): string {
  const vr = new VoiceResponse();
  vr.hangup();
  return vr.toString();
}
