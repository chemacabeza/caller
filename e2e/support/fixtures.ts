import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import twilio from 'twilio';
import { DEMO_URL, E2E, REAL_URL } from './constants';

export { expect };

/** Logs in through the UI and waits until the call form is ready. */
export async function login(page: Page, baseUrl: string) {
  await page.goto(baseUrl);
  await page.getByLabel('Contraseña').fill(E2E.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Nueva llamada' })).toBeVisible();
  // The config request has loaded once the voice name is rendered.
  await expect(page.getByText(/Voz telefónica: Polly\.Lucia-Neural/)).toBeVisible();
}

export async function resetServer(request: APIRequestContext, baseUrl: string) {
  const res = await request.post(`${baseUrl}/__e2e/reset`);
  expect(res.ok()).toBe(true);
}

export interface FakeTwilioState {
  created: {
    sid: string;
    to: string;
    from: string;
    answerUrl: string;
    statusCallbackUrl: string;
    timeLimitSeconds: number;
    ringTimeoutSeconds: number;
  }[];
  hangups: { sid: string; providerStatus: string | null }[];
}

export async function fakeTwilio(request: APIRequestContext): Promise<FakeTwilioState> {
  return (await request.get(`${REAL_URL}/__e2e/twilio`)).json();
}

/** Waits until the fake Twilio has received exactly `n` create-call requests and returns the last. */
export async function waitForCreatedCall(request: APIRequestContext, n = 1) {
  let state!: FakeTwilioState;
  await expect
    .poll(async () => (state = await fakeTwilio(request)).created.length, { message: 'Twilio createCall was not requested' })
    .toBe(n);
  return state.created[n - 1];
}

/** Path part of an absolute webhook URL that the app gave to Twilio. */
export function pathOf(url: string) {
  expect(url.startsWith(E2E.publicBaseUrl)).toBe(true);
  return url.slice(E2E.publicBaseUrl.length);
}

/**
 * Acts as Twilio: POSTs a form-encoded webhook with a valid X-Twilio-Signature
 * (computed for PUBLIC_BASE_URL + path, exactly like the real service does).
 */
export async function twilioWebhook(request: APIRequestContext, path: string, params: Record<string, string>, opts: { signature?: string } = {}) {
  const signature = opts.signature ?? twilio.getExpectedTwilioSignature(E2E.authToken, `${E2E.publicBaseUrl}${path}`, params);
  return request.post(`${REAL_URL}${path}`, {
    form: params,
    headers: { 'X-Twilio-Signature': signature },
  });
}

/** Makes the browser's speechSynthesis observable (and silent) for preview tests. */
export async function stubSpeechSynthesis(page: Page, voices: { name: string; lang: string }[] = [{ name: 'Mónica', lang: 'es-ES' }]) {
  await page.addInitScript((voiceList) => {
    const spoken: { text: string; lang: string; rate: number; voice: string | null }[] = [];
    (window as unknown as { __spoken: typeof spoken }).__spoken = spoken;
    const listeners: (() => void)[] = [];
    const synth = {
      speaking: false,
      getVoices: () => voiceList.map((v) => ({ ...v, default: false, localService: true, voiceURI: v.name })),
      speak(u: SpeechSynthesisUtterance) {
        spoken.push({ text: u.text, lang: u.lang, rate: u.rate, voice: u.voice?.name ?? null });
        setTimeout(() => u.onstart?.(new Event('start') as SpeechSynthesisEvent), 10);
        // Long enough for the test to observe the "Detener" state.
        (synth as { timer?: number }).timer = window.setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 1500);
      },
      cancel() {
        clearTimeout((synth as { timer?: number }).timer);
      },
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: () => undefined,
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      text: string; lang = ''; rate = 1; voice: { name: string } | null = null;
      onstart?: (e: Event) => void; onend?: (e: Event) => void; onerror?: (e: Event) => void;
      constructor(text: string) { this.text = text; }
    };
  }, voices);
}

/** Per-file fixtures: a logged-in page on the demo or the "real" server. */
export const test = base.extend<{ demoPage: Page; realPage: Page }>({
  demoPage: async ({ page, request }, use) => {
    await resetServer(request, DEMO_URL);
    await login(page, DEMO_URL);
    await use(page);
    await resetServer(request, DEMO_URL);
  },
  realPage: async ({ page, request }, use) => {
    await resetServer(request, REAL_URL);
    await login(page, REAL_URL);
    await use(page);
    await resetServer(request, REAL_URL);
  },
});

export { DEMO_URL, REAL_URL, E2E };
