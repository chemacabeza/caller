import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { answerTwiml, repeatTwiml, thanksTwiml } from '../src/twiml.js';

const cfg = loadConfig({ GREETING_PAUSE_SECONDS: '2', TTS_VOICE: 'Polly.Lucia-Neural' });

describe('TwiML', () => {
  it('pauses, speaks the message with the es-ES voice, then gathers Spanish speech', () => {
    const xml = answerTwiml(cfg, 'Buenos días, ¿a qué hora abren hoy, por favor?', 'https://e.example/twilio/gather/1?attempt=1');
    expect(xml).toMatch(/^<\?xml.*<Response><Pause length="2"\/><Say voice="Polly.Lucia-Neural" language="es-ES">/);
    expect(xml).toContain('<prosody rate="95%">Buenos días, ¿a qué hora abren hoy, por favor?</prosody>');
    expect(xml).toMatch(/<Gather input="speech" language="es-ES" action="https:\/\/e.example\/twilio\/gather\/1\?attempt=1"[^>]*actionOnEmptyResult="true"/);
    // The question is spoken before (not inside) Gather, so it cannot be interrupted.
    expect(xml.indexOf('</Say>')).toBeLessThan(xml.indexOf('<Gather'));
    expect(xml).not.toContain('<Record');
  });

  it('escapes user text', () => {
    expect(repeatTwiml(cfg, '<Hangup/> & más', 'https://x')).toContain('&lt;Hangup/&gt; &amp; más');
  });

  it('says thanks and hangs up', () => {
    const xml = thanksTwiml(cfg);
    expect(xml).toContain('Muchas gracias. Que tenga un buen día.');
    expect(xml).toMatch(/<\/Say><Hangup\/><\/Response>$/);
  });

  it('can use a non-Polly voice without SSML', () => {
    const xml = thanksTwiml(loadConfig({ TTS_VOICE: 'Google.es-ES-Neural2-A' }));
    expect(xml).toContain('<Say voice="Google.es-ES-Neural2-A" language="es-ES">Muchas gracias.');
  });
});
