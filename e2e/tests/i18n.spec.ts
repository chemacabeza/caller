import { test, expect, waitForCreatedCall, twilioWebhook, pathOf, REAL_URL } from '../support/fixtures';

test.describe('Idioma / Language (ES · EN)', () => {
  test('Spanish is the default and the switch shows which language is active', async ({ demoPage: page }) => {
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    const group = page.getByRole('group', { name: 'Idioma' });
    await expect(group.getByRole('button', { name: 'ES', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('button', { name: 'EN', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });

  test('switches the whole interface to English', async ({ demoPage: page }) => {
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('group', { name: 'Language' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New call' })).toBeVisible();
    await expect(page.getByLabel('Phone number')).toHaveValue('+34 955 74 88 35');
    await expect(page.getByLabel('Message to be spoken')).toHaveValue('Buenos días, ¿a qué hora abren hoy, por favor?');
    await expect(page.getByText('The call is made in Spanish: write the message in Spanish.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Listen to message/ })).toBeVisible();
    await expect(page.getByText('Approximate preview')).toBeVisible();
    await expect(page.getByLabel(/Demo mode \(simulated, no call is made\)/)).toBeChecked();
    await expect(page.getByLabel('Simulated scenario').locator('option')).toHaveText([
      'Answers with opening hours',
      'Answers without giving a time',
      'Picks up but says nothing',
      'Line busy',
      'Nobody answers',
    ]);
    await expect(page.locator('.alert.info')).toContainText('Real calls are disabled.');
    await expect(page.locator('.alert.info')).toContainText('These environment variables are missing in server/.env');
    await expect(page.getByRole('button', { name: '📞 Call (simulated)' })).toBeVisible();
    await expect(page.getByRole('button', { name: '✖ Hang up' })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Call status' })).toBeVisible();
    await expect(page.locator('.status')).toHaveText('Ready');
    await expect(page.getByRole('heading', { name: 'Answer received' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(page).toHaveTitle('Llamadas en Español');
  });

  test('remembers the language after reload and on the login page', async ({ demoPage: page }) => {
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'New call' })).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong password.');
    await page.getByRole('button', { name: 'ES', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Contraseña incorrecta.');
    await expect(page.getByRole('heading', { name: 'Acceso' })).toBeVisible();
  });

  test('a simulated call in English: statuses, transcript, analysis and log', async ({ demoPage: page }) => {
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.getByLabel('Simulated scenario').selectOption('respuesta');
    await page.getByRole('button', { name: '📞 Call (simulated)' }).click();
    await expect(page.locator('.status')).toHaveText('Calling');
    await expect(page.locator('.status-row .tag.sim')).toHaveText('SIMULATED');
    await expect(page.locator('.status')).toHaveText('In call');
    await expect(page.locator('.status')).toHaveText('Finished');
    const transcript = page.locator('.transcript');
    await expect(transcript).toContainText('Simulated result — not a real answer');
    // The recipient's words are shown literally, in Spanish.
    await expect(transcript.locator('blockquote')).toContainText('Hoy abrimos a las nueve y media');
    await expect(transcript).toContainText('Literal automatic transcription (in Spanish) · confidence 90%.');
    await expect(transcript.locator('.analysis')).toHaveText(
      'Times mentioned (automatic detection, check the transcript): a las nueve y media de la mañana; hasta las dos.',
    );
    await expect(page.locator('.facts')).toContainText('Received');
    await page.getByText('Call log').click();
    await expect(page.locator('.log li').first()).toContainText('Simulated call created.');
    await expect(page.locator('.log li').filter({ hasText: '[SIMULATED] Ringing…' })).toHaveCount(1);
    await expect(page.locator('.log li').filter({ hasText: 'Answer received.' })).toHaveCount(1);
  });

  test('switching language mid-call re-translates everything on screen', async ({ demoPage: page }) => {
    await page.getByLabel('Escenario simulado').selectOption('silencio');
    await page.getByRole('button', { name: 'Llamar (simulado)' }).click();
    await expect(page.locator('.status')).toHaveText('Finalizada');
    await expect(page.locator('.transcript .no-answer')).toHaveText('No se recibió una respuesta.');
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.locator('.status')).toHaveText('Finished');
    await expect(page.locator('.transcript .no-answer')).toHaveText('No answer was received.');
    await expect(page.locator('.facts')).toContainText('Repeated once');
    await expect(page.getByRole('button', { name: 'New call' })).toBeVisible();
  });

  test('server validation errors are shown in English', async ({ demoPage: page }) => {
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.getByLabel('Phone number').fill('+44 20 7946 0958');
    await page.getByRole('button', { name: /Call \(simulated\)/ }).click();
    await expect(page.getByRole('alert')).toHaveText('Only Spanish (+34), French (+33), German (+49), Chinese (+86) and US/Canadian (+1) numbers are supported for now. Except for Spanish numbers, include the country code.');
    await page.getByLabel('Phone number').fill('+86 138 0013 800');
    await page.getByRole('button', { name: /Call \(simulated\)/ }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid Chinese number: use an 11-digit mobile starting with 1 (e.g. +86 138 0013 8000) or a landline with its area code.');
    await page.getByLabel('Phone number').fill('+34 806 12 34 56');
    await page.getByRole('button', { name: /Call \(simulated\)/ }).click();
    await expect(page.getByRole('alert')).toHaveText('Premium-rate numbers (803, 806, 807, 905, 907) are not allowed.');
  });

  test('real-call warning, provider errors and Twilio statuses in English', async ({ realPage: page, request }) => {
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.locator('.alert.real')).toContainText('A real call will be made to +34 955 74 88 35. It may be charged to your Twilio account.');
    await request.post(`${REAL_URL}/__e2e/twilio/fail-next`, { data: { code: 21215, message: 'geo' } });
    await page.getByRole('button', { name: '📞 Call', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Calls to this destination are not enabled. Enable Spain under Voice > Settings > Geo permissions.');
    await expect(page.locator('.status')).toHaveText('Error');

    await page.getByRole('button', { name: '📞 Call', exact: true }).click();
    const call = await waitForCreatedCall(request);
    await twilioWebhook(request, pathOf(call.statusCallbackUrl), { CallSid: call.sid, CallStatus: 'failed', ErrorCode: '31005' });
    await expect(page.locator('.status')).toHaveText('Error');
    await expect(page.locator('section').nth(1).locator('.alert.error')).toHaveText('The call failed (Twilio status: failed, code 31005).');
    await page.getByText('Call log').click();
    await expect(page.locator('.log li').filter({ hasText: 'Twilio status: failed' })).toHaveCount(1);
    await expect(page.locator('.log li').filter({ hasText: 'Twilio accepted the call.' })).toHaveCount(1);
  });

  test('the phone call itself stays in Spanish whatever the interface language', async ({ realPage: page, request }) => {
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.getByRole('button', { name: '📞 Call', exact: true }).click();
    const call = await waitForCreatedCall(request);
    const twiml = await (await twilioWebhook(request, pathOf(call.answerUrl), { CallSid: call.sid })).text();
    expect(twiml).toContain('language="es-ES"');
    expect(twiml).toContain('Buenos días, ¿a qué hora abren hoy, por favor?');
    const id = pathOf(call.answerUrl).split('/').pop()!;
    const thanks = await (await twilioWebhook(request, `/twilio/gather/${id}?attempt=1`, { CallSid: call.sid, SpeechResult: 'A las diez.' })).text();
    expect(thanks).toContain('Muchas gracias. Que tenga un buen día.');
  });

  test.afterEach(async ({ page }) => {
    // Leave the stored preference in Spanish for other specs.
    await page.evaluate(() => localStorage.removeItem('llamadas.lang')).catch(() => undefined);
  });

});
