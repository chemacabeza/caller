import { test, expect, login, waitForCreatedCall, twilioWebhook, pathOf, fakeTwilio, resetServer, REAL_URL, DEMO_URL } from '../support/fixtures';

test.describe('Robustez', () => {
  test('double and triple clicks on Llamar place exactly one call', async ({ realPage: page, request }) => {
    await request.post(`${REAL_URL}/__e2e/twilio/delay`, { data: { ms: 800 } });
    const posts: string[] = [];
    page.on('request', (r) => r.url().endsWith('/api/calls') && r.method() === 'POST' && posts.push(r.url()));
    const button = page.getByRole('button', { name: '📞 Llamar', exact: true });
    await button.dblclick();
    await page.getByRole('button', { name: /Iniciando|Llamar/ }).click({ force: true }).catch(() => undefined);
    await expect(page.locator('.status')).toHaveText('Llamando');
    await page.waitForTimeout(1000);
    expect(posts).toHaveLength(1);
    expect((await fakeTwilio(request)).created).toHaveLength(1);
  });

  test('the button shows "Iniciando…" while the request is in flight', async ({ realPage: page, request }) => {
    await request.post(`${REAL_URL}/__e2e/twilio/delay`, { data: { ms: 1000 } });
    await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Iniciando…' })).toBeDisabled();
    await expect(page.locator('.status')).toHaveText('Llamando');
  });

  test('concurrent API requests from two tabs only create one call', async ({ realPage: page, request }) => {
    await request.post(`${REAL_URL}/__e2e/twilio/delay`, { data: { ms: 500 } });
    const body = { data: { to: '+34955748835', message: 'Hola' } };
    const results = await Promise.all([1, 2, 3, 4].map(() => page.request.post(`${REAL_URL}/api/calls`, body)));
    const codes = results.map((r) => r.status()).sort();
    expect(codes).toEqual([201, 409, 409, 409]);
    expect((await fakeTwilio(request)).created).toHaveLength(1);
  });

  test('a second tab sees "Ya hay una llamada en curso" while a call is active', async ({ realPage: page, context, request }) => {
    await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
    await waitForCreatedCall(request);
    const tab2 = await context.newPage();
    await tab2.goto(REAL_URL);
    await expect(tab2.getByRole('heading', { name: 'Nueva llamada' })).toBeVisible();
    await expect(tab2.getByText(/Voz telefónica: Polly/)).toBeVisible();
    await tab2.getByRole('button', { name: '📞 Llamar', exact: true }).click();
    await expect(tab2.getByRole('alert')).toContainText('Ya hay una llamada en curso. Cuélguela antes de iniciar otra.');
    // Tab 2 picks up the existing call (same session) and can hang it up.
    await expect(tab2.locator('.status')).toHaveText('Llamando');
    await tab2.getByRole('button', { name: /Colgar/ }).click();
    await expect(tab2.locator('.status')).toHaveText('Finalizada');
    expect((await fakeTwilio(request)).created).toHaveLength(1);
  });

  test('falls back to polling when server-sent events are unavailable', async ({ page, request }) => {
    await page.addInitScript(() => {
      // @ts-expect-error simulate a browser/proxy without EventSource
      window.EventSource = undefined;
    });
    await resetServer(request, REAL_URL);
    await login(page, REAL_URL);
    const polls: string[] = [];
    page.on('request', (r) => /\/api\/calls\/[0-9a-f-]{36}$/.test(r.url()) && polls.push(r.url()));
    await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
    const call = await waitForCreatedCall(request);
    await twilioWebhook(request, pathOf(call.answerUrl), { CallSid: call.sid });
    await expect(page.locator('.status')).toHaveText('En llamada');
    const id = pathOf(call.answerUrl).split('/').pop()!;
    await twilioWebhook(request, `/twilio/gather/${id}?attempt=1`, { CallSid: call.sid, SpeechResult: 'A las once.' });
    await twilioWebhook(request, pathOf(call.statusCallbackUrl), { CallSid: call.sid, CallStatus: 'completed' });
    await expect(page.locator('.status')).toHaveText('Finalizada');
    await expect(page.locator('.transcript blockquote')).toHaveText('«A las once.»');
    expect(polls.length).toBeGreaterThan(0);
    // Polling stops once the call is final.
    const count = polls.length;
    await page.waitForTimeout(2500);
    expect(polls.length).toBe(count);
    await resetServer(request, REAL_URL);
  });

  test('falls back to polling when the event stream breaks', async ({ realPage: page, request }) => {
    await page.route('**/events', (route) => route.abort());
    const polls: string[] = [];
    page.on('request', (r) => /\/api\/calls\/[0-9a-f-]{36}$/.test(r.url()) && polls.push(r.url()));
    await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
    const call = await waitForCreatedCall(request);
    await twilioWebhook(request, pathOf(call.statusCallbackUrl), { CallSid: call.sid, CallStatus: 'busy' });
    await expect(page.locator('.status')).toHaveText('Ocupado');
    expect(polls.length).toBeGreaterThan(0);
  });

  test('uses server-sent events normally (no polling)', async ({ realPage: page, request }) => {
    const polls: string[] = [];
    const streams: string[] = [];
    page.on('request', (r) => {
      if (/\/api\/calls\/[0-9a-f-]{36}$/.test(r.url())) polls.push(r.url());
      if (r.url().endsWith('/events')) streams.push(r.url());
    });
    await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
    const call = await waitForCreatedCall(request);
    await twilioWebhook(request, pathOf(call.statusCallbackUrl), { CallSid: call.sid, CallStatus: 'no-answer' });
    await expect(page.locator('.status')).toHaveText('Sin respuesta');
    expect(streams).toHaveLength(1);
    expect(polls).toHaveLength(0);
  });

  test('explains when the backend is unreachable', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort('connectionrefused'));
    await page.goto(DEMO_URL);
    await expect(page.getByRole('alert').first()).toContainText('No se puede contactar con el servidor');
  });

  test('unknown client routes still load the app (SPA fallback)', async ({ page }) => {
    await page.goto(`${DEMO_URL}/alguna/ruta`);
    await expect(page.getByRole('heading', { name: 'Llamadas en Español' })).toBeVisible();
  });

  test('the page language is Spanish', async ({ page }) => {
    await page.goto(DEMO_URL);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page).toHaveTitle('Llamadas en Español');
  });
});
