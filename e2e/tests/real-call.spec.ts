/**
 * Full call flow against the configured server. The browser drives the UI;
 * the test plays the role of Twilio by answering the app's REST request
 * (recorded by the fake provider) with signed webhooks, exactly as Twilio would.
 */
import { test, expect, waitForCreatedCall, twilioWebhook, pathOf, fakeTwilio, REAL_URL, E2E } from '../support/fixtures';
import type { APIRequestContext, Page } from '@playwright/test';

const status = (page: Page) => page.locator('.status');

async function startRealCall(page: Page, request: APIRequestContext, n = 1) {
  await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
  const created = await waitForCreatedCall(request, n);
  return created;
}

test.describe('Llamada real (Twilio simulado por la prueba)', () => {
  test('defaults to real mode with a visible warning and no config notice', async ({ realPage: page }) => {
    await expect(page.locator('.alert.info')).toHaveCount(0);
    const demo = page.getByLabel(/Modo demostración/);
    await expect(demo).not.toBeChecked();
    await expect(demo).toBeEnabled();
    await expect(page.locator('.alert.real')).toContainText('Se realizará una llamada real a +34 955 74 88 35');
    await expect(page.locator('.alert.real')).toContainText('Puede tener coste');
    await expect(page.getByRole('button', { name: '📞 Llamar', exact: true })).toBeVisible();
  });

  test('the warning follows the number as it is edited', async ({ realPage: page }) => {
    await page.getByLabel('Número de teléfono').fill('612 34 56 78');
    await expect(page.locator('.alert.real')).toContainText('612 34 56 78');
  });

  test('sends one Twilio request with E.164 number, webhooks, 2-minute limit', async ({ realPage: page, request }) => {
    const created = await startRealCall(page, request);
    expect(created.to).toBe('+34955748835');
    expect(created.from).toBe(E2E.fromNumber);
    expect(created.timeLimitSeconds).toBe(120);
    expect(created.ringTimeoutSeconds).toBe(30);
    expect(created.answerUrl).toMatch(new RegExp(`^${E2E.publicBaseUrl}/twilio/voice/[0-9a-f-]{36}$`));
    expect(created.statusCallbackUrl).toBe(created.answerUrl.replace('/voice/', '/status/'));
    await expect(status(page)).toHaveText('Llamando');
    await expect(page.locator('.status-row .tag.sim')).toHaveCount(0);
  });

  test('complete flow: ring → answer → question → recognized answer → thanks → hang up', async ({ realPage: page, request }) => {
    const call = await startRealCall(page, request);
    const id = pathOf(call.answerUrl).split('/').pop()!;
    const statusPath = pathOf(call.statusCallbackUrl);

    // 1. Ringing
    expect((await twilioWebhook(request, statusPath, { CallSid: call.sid, CallStatus: 'ringing' })).status()).toBe(204);
    await expect(status(page)).toHaveText('Llamando');

    // 2. Answered → TwiML: pause for greeting, speak message in es-ES, then listen
    const voice = await twilioWebhook(request, pathOf(call.answerUrl), { CallSid: call.sid, CallStatus: 'in-progress' });
    expect(voice.status()).toBe(200);
    expect(voice.headers()['content-type']).toContain('text/xml');
    const twiml = await voice.text();
    expect(twiml).toContain('<Pause length="2"/>');
    expect(twiml).toContain('<Say voice="Polly.Lucia-Neural" language="es-ES">');
    expect(twiml).toContain(E2E.defaultMessage);
    expect(twiml).toMatch(/<Gather input="speech" language="es-ES"[^>]*actionOnEmptyResult="true"/);
    expect(twiml.indexOf('<Pause')).toBeLessThan(twiml.indexOf('<Say'));
    expect(twiml.indexOf('</Say>')).toBeLessThan(twiml.indexOf('<Gather'));
    expect(twiml).not.toMatch(/<Record|<Dial|<Redirect/);
    await expect(status(page)).toHaveText('En llamada');
    await expect(page.locator('.transcript')).toHaveText('Escuchando la respuesta…');

    // 3. Recipient answers → transcript shown; TwiML thanks and hangs up
    const gatherPath = pathOf(twiml.match(/action="([^"]+)"/)![1].replace(/&amp;/g, '&'));
    expect(gatherPath).toBe(`/twilio/gather/${id}?attempt=1`);
    const gather = await twilioWebhook(request, gatherPath, {
      CallSid: call.sid,
      SpeechResult: 'Hoy abrimos a las diez y cerramos a las ocho de la tarde.',
      Confidence: '0.9234',
    });
    const thanks = await gather.text();
    expect(thanks).toContain('Muchas gracias. Que tenga un buen día.');
    expect(thanks).toMatch(/<\/Say><Hangup\/><\/Response>$/);

    const transcript = page.locator('.transcript');
    await expect(transcript.locator('blockquote')).toHaveText('«Hoy abrimos a las diez y cerramos a las ocho de la tarde.»');
    await expect(transcript).not.toHaveClass(/simulated/);
    await expect(transcript).not.toContainText('SIMULADO');
    await expect(transcript).toContainText('confianza 92 %');
    await expect(transcript.locator('.analysis')).toContainText('a las diez; a las ocho de la tarde');
    // Answer received but call still in progress: tracked separately.
    await expect(status(page)).toHaveText('En llamada');
    await expect(page.locator('.facts')).toContainText('Recibida');

    // 4. Completed
    await twilioWebhook(request, statusPath, { CallSid: call.sid, CallStatus: 'completed', CallDuration: '27' });
    await expect(status(page)).toHaveText('Finalizada');
    await expect(page.locator('.facts')).toContainText('27 s');
    await expect(page.getByRole('button', { name: /Colgar/ })).toBeDisabled();
  });

  test('silence: repeats the question once, then ends with "No se recibió una respuesta."', async ({ realPage: page, request }) => {
    const call = await startRealCall(page, request);
    const id = pathOf(call.answerUrl).split('/').pop()!;
    await twilioWebhook(request, pathOf(call.answerUrl), { CallSid: call.sid });

    const first = await (await twilioWebhook(request, `/twilio/gather/${id}?attempt=1`, { CallSid: call.sid })).text();
    expect(first).toContain(E2E.defaultMessage);
    expect(first).toContain(`/twilio/gather/${id}?attempt=2`);
    expect(first).not.toContain('<Hangup');
    await expect(page.locator('.facts')).toContainText('Repetida una vez');

    const second = await (await twilioWebhook(request, `/twilio/gather/${id}?attempt=2`, { CallSid: call.sid, SpeechResult: '   ' })).text();
    expect(second).toContain('<Hangup/>');
    expect(second).not.toContain('<Gather');

    await expect(page.locator('.transcript .no-answer')).toHaveText('No se recibió una respuesta.');
    await twilioWebhook(request, pathOf(call.statusCallbackUrl), { CallSid: call.sid, CallStatus: 'completed', CallDuration: '31' });
    await expect(status(page)).toHaveText('Finalizada');
  });

  test('answer on the second attempt is accepted', async ({ realPage: page, request }) => {
    const call = await startRealCall(page, request);
    const id = pathOf(call.answerUrl).split('/').pop()!;
    await twilioWebhook(request, pathOf(call.answerUrl), { CallSid: call.sid });
    await twilioWebhook(request, `/twilio/gather/${id}?attempt=1`, { CallSid: call.sid });
    const res = await twilioWebhook(request, `/twilio/gather/${id}?attempt=2`, { CallSid: call.sid, SpeechResult: 'A las nueve.' });
    expect(await res.text()).toContain('Muchas gracias');
    await expect(page.locator('.transcript blockquote')).toHaveText('«A las nueve.»');
  });

  test('confidence is optional', async ({ realPage: page, request }) => {
    const call = await startRealCall(page, request);
    const id = pathOf(call.answerUrl).split('/').pop()!;
    await twilioWebhook(request, `/twilio/gather/${id}?attempt=1`, { CallSid: call.sid, SpeechResult: 'Hoy cerramos, es festivo.' });
    await expect(page.locator('.transcript')).toContainText('Transcripción automática literal.');
    await expect(page.locator('.transcript')).not.toContainText('confianza');
    await expect(page.locator('.transcript .analysis')).toContainText('hoy está cerrado');
  });

  for (const [providerStatus, uiStatus] of [
    ['busy', 'Ocupado'],
    ['no-answer', 'Sin respuesta'],
    ['failed', 'Error'],
  ] as const) {
    test(`provider status "${providerStatus}" is shown as "${uiStatus}"`, async ({ realPage: page, request }) => {
      const call = await startRealCall(page, request);
      await twilioWebhook(request, pathOf(call.statusCallbackUrl), { CallSid: call.sid, CallStatus: 'ringing' });
      await twilioWebhook(request, pathOf(call.statusCallbackUrl), { CallSid: call.sid, CallStatus: providerStatus, ErrorCode: '31005' });
      await expect(status(page)).toHaveText(uiStatus);
      await expect(page.locator('.facts')).toContainText('No se recibió una respuesta');
      if (uiStatus === 'Error') await expect(page.locator('section').nth(1).locator('.alert.error')).toContainText('La llamada falló (estado de Twilio: failed, código 31005)');
    });
  }

  test('late or out-of-order callbacks do not move a finished call backwards', async ({ realPage: page, request }) => {
    const call = await startRealCall(page, request);
    const sp = pathOf(call.statusCallbackUrl);
    await twilioWebhook(request, sp, { CallSid: call.sid, CallStatus: 'completed' });
    await expect(status(page)).toHaveText('Finalizada');
    await twilioWebhook(request, sp, { CallSid: call.sid, CallStatus: 'ringing' });
    await twilioWebhook(request, sp, { CallSid: call.sid, CallStatus: 'in-progress' });
    await page.waitForTimeout(500);
    await expect(status(page)).toHaveText('Finalizada');
  });

  test('Colgar while ringing cancels the call through Twilio', async ({ realPage: page, request }) => {
    const call = await startRealCall(page, request);
    await twilioWebhook(request, pathOf(call.statusCallbackUrl), { CallSid: call.sid, CallStatus: 'ringing' });
    await page.getByRole('button', { name: /Colgar/ }).click();
    await expect(status(page)).toHaveText('Finalizada');
    const state = await fakeTwilio(request);
    expect(state.hangups).toEqual([{ sid: call.sid, providerStatus: 'ringing' }]);
    // Twilio then reports "canceled", which is not an error because the user asked for it.
    await twilioWebhook(request, pathOf(call.statusCallbackUrl), { CallSid: call.sid, CallStatus: 'canceled' });
    await page.waitForTimeout(300);
    await expect(status(page)).toHaveText('Finalizada');
  });

  test('Colgar during the conversation hangs up the in-progress call', async ({ realPage: page, request }) => {
    const call = await startRealCall(page, request);
    await twilioWebhook(request, pathOf(call.answerUrl), { CallSid: call.sid });
    await expect(status(page)).toHaveText('En llamada');
    await page.getByRole('button', { name: /Colgar/ }).click();
    await expect(status(page)).toHaveText('Finalizada');
    expect((await fakeTwilio(request)).hangups).toEqual([{ sid: call.sid, providerStatus: 'in-progress' }]);
    // If Twilio fetches TwiML again after hang-up was requested, it only gets <Hangup/>.
    const again = await twilioWebhook(request, pathOf(call.answerUrl), { CallSid: call.sid });
    expect(await again.text()).toMatch(/<Response><Hangup\/><\/Response>$/);
  });

  for (const [code, text] of [
    [21219, 'Con una cuenta de prueba solo puede llamar a números verificados'],
    [21215, 'Su cuenta de Twilio no permite llamar a este destino (+34). Actívelo en Voice > Settings > Geo permissions'],
    [20003, 'Twilio rechazó las credenciales'],
    [21210, 'TWILIO_FROM_NUMBER no es un número de Twilio'],
    [99999, 'Error del proveedor de telefonía: algo raro'],
  ] as const) {
    test(`provider error ${code} is explained in Spanish and the user can retry`, async ({ realPage: page, request }) => {
      await request.post(`${REAL_URL}/__e2e/twilio/fail-next`, { data: { code, message: 'algo raro' } });
      await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(text);
      await expect(status(page)).toHaveText('Error');
      // Not blocked by the failed attempt.
      await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
      await waitForCreatedCall(request, 1);
      await expect(status(page)).toHaveText('Llamando');
    });
  }

  test('demo mode can still be chosen on a configured server and never reaches Twilio', async ({ realPage: page, request }) => {
    await page.getByLabel(/Modo demostración/).check();
    await expect(page.locator('.alert.real')).toHaveCount(0);
    await page.getByLabel('Escenario simulado').selectOption('ocupado');
    await page.getByRole('button', { name: 'Llamar (simulado)' }).click();
    await expect(status(page)).toHaveText('Ocupado');
    await expect(page.locator('.status-row .tag.sim')).toHaveText('SIMULADO');
    expect((await fakeTwilio(request)).created).toHaveLength(0);
  });

  test('the message is XML-escaped in the TwiML sent to Twilio', async ({ realPage: page, request }) => {
    await page.getByLabel('Mensaje que se reproducirá').fill('Hola <Hangup/> & "adiós"');
    const call = await startRealCall(page, request);
    const twiml = await (await twilioWebhook(request, pathOf(call.answerUrl), { CallSid: call.sid })).text();
    expect(twiml).toContain('Hola &lt;Hangup/&gt; &amp; "adiós"');
    expect(twiml.match(/<Hangup\/>/g)).toBeNull();
  });

  test('calls a Chinese mobile (+86) in E.164, still speaking Spanish', async ({ realPage: page, request }) => {
    await page.getByLabel('Número de teléfono').fill('+86 138 0013 8000');
    await expect(page.locator('.alert.real').first()).toContainText('+86 138 0013 8000');
    const call = await startRealCall(page, request);
    expect(call.to).toBe('+8613800138000');
    expect(call.from).toBe(E2E.fromNumber);
    expect(call.timeLimitSeconds).toBe(120);
    await expect(page.locator('.facts')).toContainText('+86 138 0013 8000');
    const twiml = await (await twilioWebhook(request, pathOf(call.answerUrl), { CallSid: call.sid })).text();
    expect(twiml).toContain('language="es-ES"');
    expect(twiml).toContain(E2E.defaultMessage);
  });

  for (const [input, e164, display] of [
    ['+1-707-555-0123', '+17075550123', '+1 707 555 0123'],
    ['+33 6 39 98 12 34', '+33639981234', '+33 6 39 98 12 34'],
    ['+491711234567', '+491711234567', '+49 171 1234567'],
    ['+39 312 345 6789', '+393123456789', '+39 312 345 6789'],
    ['+39 06 1234 5678', '+390612345678', '+39 06 1234 5678'],
  ] as const) {
    test(`calls ${input} in E.164 (${e164})`, async ({ realPage: page, request }) => {
      await page.getByLabel('Número de teléfono').fill(input);
      const call = await startRealCall(page, request);
      expect(call.to).toBe(e164);
      await expect(page.locator('.facts')).toContainText(display);
      const twiml = await (await twilioWebhook(request, pathOf(call.answerUrl), { CallSid: call.sid })).text();
      expect(twiml).toContain('language="es-ES"');
    });
  }

  test('warns that Twilio may not allow China, and shows Twilio\'s rejection with the +86 prefix', async ({ realPage: page, request }) => {
    await page.getByLabel('Número de teléfono').fill('+86 138 0013 8000');
    await expect(page.getByTestId('china-warning')).toContainText('es posible que su cuenta de Twilio no permita llamar a China');
    await page.getByLabel(/Modo demostración/).check();
    await expect(page.getByTestId('china-warning')).toHaveCount(0);
    await page.getByLabel(/Modo demostración/).uncheck();
    await request.post(`${REAL_URL}/__e2e/twilio/fail-next`, { data: { code: 21215, message: 'not allowed' } });
    await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Su cuenta de Twilio no permite llamar a este destino (+86). Actívelo en Voice > Settings > Geo permissions; si el país no aparece en la lista (p. ej. China), consulte con el soporte de Twilio.',
    );
    await expect(page.locator('.status')).toHaveText('Error');
  });

  test('a bare 502 from the tunnel is explained instead of showing "Error 502"', async ({ realPage: page }) => {
    await page.route('**/api/calls', (route) => route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' }));
    await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'No se pudo contactar con la aplicación a través del túnel (HTTP 502). Puede que se esté reiniciando: espere unos segundos y vuelva a intentarlo.',
    );
  });

  test('normalizes Chinese landlines with the optional (0) trunk prefix', async ({ realPage: page, request }) => {
    await page.getByLabel('Número de teléfono').fill('0086 (0)10 1234-5678');
    const call = await startRealCall(page, request);
    expect(call.to).toBe('+861012345678');
    await expect(page.locator('.facts')).toContainText('+86 10 1234 5678');
  });

  test('refuses the caller ID itself as destination', async ({ realPage: page, request }) => {
    await page.getByLabel('Número de teléfono').fill('+34 600 111 222');
    await page.getByRole('button', { name: '📞 Llamar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('no puede ser el mismo que TWILIO_FROM_NUMBER');
    expect((await fakeTwilio(request)).created).toHaveLength(0);
  });
});
