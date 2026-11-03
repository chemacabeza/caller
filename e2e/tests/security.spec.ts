import { test, expect, login, waitForCreatedCall, twilioWebhook, pathOf, fakeTwilio, resetServer, REAL_URL, DEMO_URL, E2E } from '../support/fixtures';

test.describe('Seguridad', () => {
  test('call-control API requires a session', async ({ request }) => {
    for (const [method, path] of [
      ['get', '/api/config'],
      ['post', '/api/calls'],
      ['get', '/api/calls/x'],
      ['post', '/api/calls/x/hangup'],
      ['get', '/api/calls/x/events'],
    ] as const) {
      const res = await request[method](`${REAL_URL}${path}`, method === 'post' ? { data: {} } : undefined);
      expect(res.status(), `${method} ${path}`).toBe(401);
    }
    expect((await fakeTwilio(request)).created).toHaveLength(0);
  });

  test('state-changing requests must be JSON (CSRF defence)', async ({ realPage: page, request }) => {
    const res = await page.request.post(`${REAL_URL}/api/calls`, { form: { to: '+34955748835', message: 'Hola' } });
    expect(res.status()).toBe(415);
    expect((await fakeTwilio(request)).created).toHaveLength(0);
  });

  test('a cross-site form post cannot start a call', async ({ realPage: page, request }) => {
    // Simulate a hostile page on another origin auto-submitting a form to the app.
    await page.goto(DEMO_URL); // different origin (port) — same browser, logged in on REAL_URL
    await page.setContent(`
      <form id="f" method="POST" action="${REAL_URL}/api/calls" enctype="text/plain">
        <input name='{"to":"+34955748835","message":"x","demo":false,"pad":"' value='"}'>
      </form>`);
    await Promise.all([page.waitForLoadState(), page.evaluate(() => (document.getElementById('f') as HTMLFormElement).submit())]);
    await page.waitForTimeout(300);
    expect((await fakeTwilio(request)).created).toHaveLength(0);
  });

  test('webhooks without or with a bad Twilio signature are rejected', async ({ realPage: page, request }) => {
    await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
    const call = await waitForCreatedCall(request);
    const path = pathOf(call.statusCallbackUrl);

    const unsigned = await request.post(`${REAL_URL}${path}`, { form: { CallSid: call.sid, CallStatus: 'completed' } });
    expect(unsigned.status()).toBe(403);
    const forged = await twilioWebhook(request, path, { CallSid: call.sid, CallStatus: 'completed' }, { signature: 'Zm9yZ2Vk' });
    expect(forged.status()).toBe(403);
    // Signature for different params (tampered body) is rejected too.
    const signedOther = await import('twilio').then((t) =>
      t.default.getExpectedTwilioSignature(E2E.authToken, `${E2E.publicBaseUrl}${path}`, { CallSid: call.sid, CallStatus: 'ringing' }),
    );
    const tampered = await twilioWebhook(request, path, { CallSid: call.sid, CallStatus: 'completed' }, { signature: signedOther });
    expect(tampered.status()).toBe(403);

    // A forged answer must not show up in the transcript panel.
    const id = path.split('/').pop()!;
    const fakeGather = await request.post(`${REAL_URL}/twilio/gather/${id}?attempt=1`, { form: { CallSid: call.sid, SpeechResult: 'Mensaje falso' } });
    expect(fakeGather.status()).toBe(403);

    await page.waitForTimeout(300);
    await expect(page.locator('.status')).toHaveText('Llamando');
    await expect(page.getByText('Mensaje falso')).toHaveCount(0);
  });

  test('signed webhooks for another call SID are ignored', async ({ realPage: page, request }) => {
    await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
    const call = await waitForCreatedCall(request);
    await twilioWebhook(request, pathOf(call.statusCallbackUrl), { CallSid: 'CAsomeoneelse', CallStatus: 'completed' });
    const voice = await twilioWebhook(request, pathOf(call.answerUrl), { CallSid: 'CAsomeoneelse' });
    expect(await voice.text()).toMatch(/<Response><Hangup\/><\/Response>$/);
    await page.waitForTimeout(300);
    await expect(page.locator('.status')).toHaveText('Llamando');
  });

  test('webhooks for unknown calls just hang up', async ({ request }) => {
    const res = await twilioWebhook(request, '/twilio/voice/00000000-0000-0000-0000-000000000000', { CallSid: 'CAx' });
    expect(res.status()).toBe(200);
    expect(await res.text()).toMatch(/<Response><Hangup\/><\/Response>$/);
  });

  test('another session cannot see, follow or hang up my call', async ({ realPage: page, browser, request }) => {
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/calls') && r.request().method() === 'POST'),
      page.getByRole('button', { name: '📞 Llamar', exact: true }).click(),
    ]);
    const { call } = await res.json();

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await login(otherPage, REAL_URL);
    for (const [method, path] of [
      ['get', `/api/calls/${call.id}`],
      ['get', `/api/calls/${call.id}/events`],
      ['post', `/api/calls/${call.id}/hangup`],
    ] as const) {
      const r = await otherPage.request[method](`${REAL_URL}${path}`, method === 'post' ? { data: {} } : undefined);
      expect(r.status(), path).toBe(404);
    }
    // ...and starting a second call while mine is active is refused without leaking it.
    const dup = await otherPage.request.post(`${REAL_URL}/api/calls`, { data: { to: '+34955748835', message: 'Hola' } });
    expect(dup.status()).toBe(409);
    expect((await dup.json()).call).toBeUndefined();
    expect((await fakeTwilio(request)).hangups).toHaveLength(0);
    await other.close();
  });

  test('the config endpoint never exposes secrets', async ({ realPage: page }) => {
    const body = await (await page.request.get(`${REAL_URL}/api/config`)).text();
    expect(body).not.toContain(E2E.authToken);
    expect(body).not.toContain(E2E.accountSid);
    expect(body).not.toContain(E2E.fromNumber);
    const html = await (await page.request.get(REAL_URL)).text();
    expect(html).not.toContain(E2E.authToken);
  });

  test('sets protective HTTP headers', async ({ request }) => {
    const res = await request.get(`${REAL_URL}/`);
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['x-frame-options']).toBe('DENY');
    expect(res.headers()['referrer-policy']).toBe('no-referrer');
    expect(res.headers()['x-powered-by']).toBeUndefined();
  });

  test('logout forgets the session transcripts', async ({ realPage: page, request }) => {
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/calls') && r.request().method() === 'POST'),
      page.getByRole('button', { name: '📞 Llamar', exact: true }).click(),
    ]);
    const { call } = await res.json();
    const created = await waitForCreatedCall(request);
    await twilioWebhook(request, `/twilio/gather/${call.id}?attempt=1`, { CallSid: created.sid, SpeechResult: 'Dato privado' });
    await twilioWebhook(request, pathOf(created.statusCallbackUrl), { CallSid: created.sid, CallStatus: 'completed' });
    await expect(page.locator('.transcript blockquote')).toHaveText('«Dato privado»');

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await login(page, REAL_URL);
    const after = await page.request.get(`${REAL_URL}/api/calls/${call.id}`);
    expect(after.status()).toBe(404);
    expect((await request.get(`${REAL_URL}/__e2e/calls/${call.id}`)).status()).toBe(404);
  });

  test.afterAll(async ({ request }) => {
    await resetServer(request, REAL_URL);
  });
});
