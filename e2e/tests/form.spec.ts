import { test, expect, stubSpeechSynthesis, login, DEMO_URL, E2E } from '../support/fixtures';

test.describe('Formulario de llamada', () => {
  test('the help text names both supported countries', async ({ demoPage: page }) => {
    await expect(page.getByText('Números de España (+34), Francia (+33), Alemania (+49), China (+86) o EE. UU./Canadá (+1).')).toBeVisible();
  });

  test('is prefilled with the requested number and message, both editable', async ({ demoPage: page }) => {
    const number = page.getByLabel('Número de teléfono');
    const message = page.getByLabel('Mensaje que se reproducirá');
    await expect(number).toHaveValue(E2E.defaultNumber);
    await expect(message).toHaveValue(E2E.defaultMessage);
    await expect(number).toBeEditable();
    await expect(message).toBeEditable();

    await number.fill('612 34 56 78');
    await message.fill('Hola, ¿tienen mesa para dos esta noche?');
    await expect(number).toHaveValue('612 34 56 78');
    await expect(message).toHaveValue('Hola, ¿tienen mesa para dos esta noche?');
  });

  test('shows the initial status "Preparado" and an empty transcript panel', async ({ demoPage: page }) => {
    await expect(page.locator('.status')).toHaveText('Preparado');
    await expect(page.getByRole('heading', { name: 'Respuesta recibida' })).toBeVisible();
    await expect(page.locator('.transcript')).toHaveText('Aquí aparecerá lo que diga la persona que conteste.');
  });

  test('has large, clearly labelled buttons; Colgar is disabled with no active call', async ({ demoPage: page }) => {
    const call = page.getByRole('button', { name: /Llamar/ });
    const hangup = page.getByRole('button', { name: /Colgar/ });
    const preview = page.getByRole('button', { name: /Escuchar mensaje/ });
    await expect(call).toBeEnabled();
    await expect(hangup).toBeDisabled();
    await expect(preview).toBeVisible();
    for (const b of [call, hangup, preview]) {
      const box = await b.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }
  });

  test('counts characters and enforces the maximum length', async ({ demoPage: page }) => {
    const message = page.getByLabel('Mensaje que se reproducirá');
    await expect(page.getByText(`${E2E.defaultMessage.length}/500 caracteres`)).toBeVisible();
    await message.fill('Hola');
    await expect(page.getByText('4/500 caracteres')).toBeVisible();
    await message.fill('x'.repeat(600));
    await expect(message).toHaveValue('x'.repeat(500));
  });

  test('disables Llamar when the message or number is empty', async ({ demoPage: page }) => {
    const call = page.getByRole('button', { name: /Llamar/ });
    await page.getByLabel('Mensaje que se reproducirá').fill('   ');
    await expect(call).toBeDisabled();
    await page.getByLabel('Mensaje que se reproducirá').fill('Hola');
    await expect(call).toBeEnabled();
    await page.getByLabel('Número de teléfono').fill('');
    await expect(call).toBeDisabled();
  });

  for (const [input, error] of [
    ['+44 20 7946 0958', 'Por ahora solo se admiten números de España (+34), Francia (+33), Alemania (+49), China (+86) y EE. UU./Canadá (+1).'],
    ['+86 138 0013 800', 'Número chino no válido'],
    ['+1 900 555 0123', 'No se permiten números de tarificación especial de EE. UU.'],
    ['+33 891 12 34 56', 'No se permiten números franceses de tarificación especial'],
    ['+49 900 1234567', 'No se permiten números alemanes de tarificación especial'],
    ['13800138000', 'Por ahora solo se admiten números de España (+34), Francia (+33), Alemania (+49), China (+86) y EE. UU./Canadá (+1).'],
    ['+34 955 74', 'Un número español debe tener 9 dígitos'],
    ['+34 806 12 34 56', 'tarificación especial'],
    ['955-abc-835', 'El número solo puede contener'],
  ] as const) {
    test(`validates the number on the server: ${input}`, async ({ demoPage: page }) => {
      await page.getByLabel('Número de teléfono').fill(input);
      await page.getByRole('button', { name: /Llamar/ }).click();
      await expect(page.getByRole('alert')).toContainText(error);
      await expect(page.getByLabel('Número de teléfono')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('.status')).toHaveText('Preparado');
    });
  }

  for (const [input, display] of [
    ['+1-707-555-0123', '+1 707 555 0123'],
    ['001 (707) 555 0123', '+1 707 555 0123'],
    ['+33 6 39 98 12 34', '+33 6 39 98 12 34'],
    ['+33 (0)6 39 98 12 34', '+33 6 39 98 12 34'],
    ['+491711234567', '+49 171 1234567'],
    ['0049 (0)171 123 4567', '+49 171 1234567'],
  ] as const) {
    test(`accepts ${input} and shows it as ${display}`, async ({ demoPage: page }) => {
      await page.getByLabel('Número de teléfono').fill(input);
      await page.getByRole('button', { name: /Llamar/ }).click();
      await expect(page.locator('.facts')).toContainText(display);
    });
  }

  for (const input of ['+86 138 0013 8000', '0086 13800138000', '+8613800138000']) {
    test(`accepts the Chinese mobile ${input} and shows it formatted`, async ({ demoPage: page }) => {
      await page.getByLabel('Número de teléfono').fill(input);
      await page.getByRole('button', { name: /Llamar/ }).click();
      await expect(page.locator('.facts')).toContainText('+86 138 0013 8000');
    });
  }

  for (const input of ['+34 955 74 88 35', '0034 955 748 835', '955748835', '(+34) 955.74.88.35']) {
    test(`accepts and normalizes ${input} to E.164`, async ({ demoPage: page }) => {
      await page.getByLabel('Número de teléfono').fill(input);
      await page.getByRole('button', { name: /Llamar/ }).click();
      await expect(page.locator('.facts')).toContainText('+34 955 74 88 35');
    });
  }

  test('locks the inputs while a call is in progress and unlocks afterwards', async ({ demoPage: page }) => {
    await page.getByRole('button', { name: /Llamar/ }).click();
    await expect(page.getByLabel('Número de teléfono')).toBeDisabled();
    await expect(page.getByLabel('Mensaje que se reproducirá')).toBeDisabled();
    await page.getByRole('button', { name: /Colgar/ }).click();
    await expect(page.locator('.status')).toHaveText('Finalizada');
    await expect(page.getByLabel('Número de teléfono')).toBeEnabled();
  });
});

test.describe('Escuchar mensaje (vista previa)', () => {
  test('is labelled "Vista previa aproximada" and names both voices', async ({ page, request }) => {
    await stubSpeechSynthesis(page);
    await request.post(`${DEMO_URL}/__e2e/reset`);
    await login(page, DEMO_URL);
    await expect(page.getByText('Vista previa aproximada')).toBeVisible();
    await expect(page.getByText(/voz del navegador \(Mónica, es-ES\)/)).toBeVisible();
    await expect(page.getByText(/En la llamada sonará la voz Polly\.Lucia-Neural/)).toBeVisible();
  });

  test('speaks the current message with an es-ES voice and can be stopped', async ({ page, request }) => {
    await stubSpeechSynthesis(page, [
      { name: 'English', lang: 'en-US' },
      { name: 'Paulina', lang: 'es-MX' },
      { name: 'Mónica', lang: 'es-ES' },
    ]);
    await request.post(`${DEMO_URL}/__e2e/reset`);
    await login(page, DEMO_URL);
    await page.getByLabel('Mensaje que se reproducirá').fill('Prueba de voz');
    await page.getByRole('button', { name: /Escuchar mensaje/ }).click();
    await expect(page.getByRole('button', { name: /Detener/ })).toBeVisible();
    const spoken = await page.evaluate(() => (window as unknown as { __spoken: unknown[] }).__spoken);
    expect(spoken).toEqual([{ text: 'Prueba de voz', lang: 'es-ES', rate: 0.95, voice: 'Mónica' }]);
    await page.getByRole('button', { name: /Detener/ }).click();
    await expect(page.getByRole('button', { name: /Escuchar mensaje/ })).toBeVisible();
  });

  test('never places a call', async ({ page, request }) => {
    await stubSpeechSynthesis(page);
    await request.post(`${DEMO_URL}/__e2e/reset`);
    await login(page, DEMO_URL);
    const calls: string[] = [];
    page.on('request', (r) => r.url().includes('/api/calls') && calls.push(r.url()));
    await page.getByRole('button', { name: /Escuchar mensaje/ }).click();
    await page.waitForTimeout(300);
    expect(calls).toEqual([]);
    await expect(page.locator('.status')).toHaveText('Preparado');
  });

  test('explains when the browser has no speech synthesis', async ({ page, request }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    });
    await request.post(`${DEMO_URL}/__e2e/reset`);
    await login(page, DEMO_URL);
    await expect(page.getByText('Su navegador no permite la vista previa de voz.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Escuchar mensaje/ })).toBeDisabled();
  });
});
