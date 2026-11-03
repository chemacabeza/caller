import { useCallback, useEffect, useState } from 'react';

/**
 * Plays the message with a browser es-ES voice. This is never the same voice the
 * phone call uses (Twilio/Amazon Polly), so the UI labels it "Vista previa aproximada".
 */
export function usePreview() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      const esES = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === 'es-es');
      setVoice(
        esES.find((v) => /lucia|lucía|neural|natural|google/i.test(v.name)) ??
          esES[0] ??
          voices.find((v) => v.lang.toLowerCase().startsWith('es')) ??
          null,
      );
    };
    pick();
    window.speechSynthesis.addEventListener('voiceschanged', pick);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', pick);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const play = useCallback(
    (text: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onstart = () => setSpeaking(true);
      u.onend = u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [supported, voice],
  );

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { supported, voice, speaking, play, stop };
}
