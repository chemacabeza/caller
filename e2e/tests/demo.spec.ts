import { test, expect, DEMO_URL } from '../support/fixtures';
import type { Page } from '@playwright/test';

async function runScenario(page: Page, scenario: string) {
  await page.getByLabel('Escenario simulado').selectOption(scenario);
  await page.getByRole('button', { name: 'Llamar (simulado)' }).click();
}

const status = (page: Page) => page.locator('.status');

test.describe('Modo demostración (servidor sin Twilio)', () => {
  test('explains the missing configuration and forces demo mode', async ({ demoPage: page }) => {
    const notice = page.locator('.alert.info');
    await expect(notice).toContainText('Las llamadas reales están desactivadas.');
    for (const v of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'PUBLIC_BASE_URL']) {
      await expect(notice).toContainText(v);
    }
    const demo = page.getByLabel(/Modo demostración/);
    await expect(demo).toBeChecked();
    await expect(demo).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Llamar (simulado)' })).toBeVisible();
    await expect(page.locator('.alert.real')).toHaveCount(0);
  });

  test('lists all simulated scenarios', async ({ demoPage: page }) => {
    await expect(page.getByLabel('Escenario simulado').locator('option')).toHaveText([
      'Responde con un horario',
      'Responde sin indicar la hora',
      'Contesta pero no dice nada',
      'Línea ocupada',
      'Nadie contesta',
    ]);
  });

  test('answered call: Llamando → En llamada → Finalizada with a simulated transcript', async ({ demoPage: page }) => {
    await runScenario(page, 'respuesta');
    await expect(status(page)).toHaveText('Llamando');
    await expect(page.locator('.status-row .tag.sim')).toHaveText('SIMULADO');
    await expect(status(page)).toHaveText('En llamada');
    await expect(page.locator('.transcript')).toHaveText('Escuchando la respuesta…');
    await expect(status(page)).toHaveText('Finalizada');

    const transcript = page.locator('.transcript');
    await expect(transcript).toHaveClass(/simulated/);
    await expect(transcript).toContainText('Resultado simulado — no es una respuesta real');
    await expect(transcript.locator('blockquote')).toHaveText(/^«\[SIMULADO\] Buenos días\. Hoy abrimos a las nueve y media/);
    await expect(transcript).toContainText('confianza 90 %');
    await expect(transcript.locator('.analysis')).toContainText('a las nueve y media de la mañana; hasta las dos');
    await expect(transcript.locator('.analysis')).toContainText('compruébelo en la transcripción');
    await expect(page.locator('.facts')).toContainText('Recibida');
  });

  test('answer without a time: says so instead of inventing one', async ({ demoPage: page }) => {
    await runScenario(page, 'respuesta_sin_hora');
    await expect(status(page)).toHaveText('Finalizada');
    await expect(page.locator('.transcript blockquote')).toContainText('no sabría decirle');
    await expect(page.locator('.transcript .analysis')).toHaveText('La respuesta no incluye una hora de apertura clara. Lea la transcripción literal.');
  });

  test('silence: question repeated once, then "No se recibió una respuesta."', async ({ demoPage: page }) => {
    await runScenario(page, 'silencio');
    await expect(page.locator('.facts')).toContainText('Repetida una vez');
    await expect(status(page)).toHaveText('Finalizada');
    await expect(page.locator('.transcript .no-answer')).toHaveText('No se recibió una respuesta.');
    await expect(page.locator('.transcript')).toContainText('Resultado simulado');
    await expect(page.locator('.facts')).toContainText('No se recibió una respuesta');
  });

  test('busy line: status Ocupado, completion tracked separately from the answer', async ({ demoPage: page }) => {
    await runScenario(page, 'ocupado');
    await expect(status(page)).toHaveText('Ocupado');
    await expect(status(page)).toHaveClass(/warn/);
    await expect(page.locator('.facts')).toContainText('No se recibió una respuesta');
    await expect(page.getByRole('button', { name: /Colgar/ })).toBeDisabled();
  });

  test('nobody answers: status Sin respuesta', async ({ demoPage: page }) => {
    await runScenario(page, 'sin_respuesta');
    await expect(status(page)).toHaveText('Sin respuesta');
    await expect(page.locator('.transcript .no-answer')).toHaveText('No se recibió una respuesta.');
  });

  test('Colgar ends a simulated call immediately', async ({ demoPage: page }) => {
    await runScenario(page, 'respuesta');
    await expect(status(page)).toHaveText('Llamando');
    await page.getByRole('button', { name: /Colgar/ }).click();
    await expect(status(page)).toHaveText('Finalizada');
    // The simulation must not continue after hanging up.
    await page.waitForTimeout(2500);
    await expect(status(page)).toHaveText('Finalizada');
    await expect(page.locator('.transcript blockquote')).toHaveCount(0);
  });

  test('shows a call log with timestamps, all marked simulated', async ({ demoPage: page }) => {
    await runScenario(page, 'respuesta');
    await expect(status(page)).toHaveText('Finalizada');
    await page.getByText('Registro de la llamada').click();
    const items = page.locator('.log li');
    await expect(items.first()).toContainText('Llamada simulada creada.');
    await expect(items.filter({ hasText: '[SIMULADO] Sonando…' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'Muchas gracias. Que tenga un buen día.' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'Llamada finalizada.' })).toHaveCount(1);
    await expect(items.first().locator('time')).toHaveText(/^\d{1,2}:\d{2}:\d{2}$/);
  });

  test('"Nueva llamada" resets the panel to Preparado', async ({ demoPage: page }) => {
    await runScenario(page, 'ocupado');
    await expect(status(page)).toHaveText('Ocupado');
    await page.getByRole('button', { name: 'Nueva llamada' }).click();
    await expect(status(page)).toHaveText('Preparado');
    await expect(page.locator('.transcript')).toHaveText('Aquí aparecerá lo que diga la persona que conteste.');
    await expect(page.locator('.status-row .tag.sim')).toHaveCount(0);
  });

  test('a second call can be made after the first finishes', async ({ demoPage: page }) => {
    await runScenario(page, 'ocupado');
    await expect(status(page)).toHaveText('Ocupado');
    await runScenario(page, 'sin_respuesta');
    await expect(status(page)).toHaveText('Sin respuesta');
  });

  test('the edited message is the one used for the call', async ({ demoPage: page }) => {
    await page.getByLabel('Mensaje que se reproducirá').fill('¿Tienen pan sin gluten?');
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/calls') && r.request().method() === 'POST'),
      runScenario(page, 'ocupado'),
    ]);
    const body = await res.json();
    expect(body.call.message).toBe('¿Tienen pan sin gluten?');
    expect(body.call.simulated).toBe(true);
  });

  test('refuses a real call on an unconfigured server even if the API is called directly', async ({ demoPage: page }) => {
    const res = await page.request.post(`${DEMO_URL}/api/calls`, {
      data: { to: '+34955748835', message: 'Hola', demo: false },
    });
    expect(res.status()).toBe(503);
    expect((await res.json()).error).toContain('Faltan variables de entorno en el servidor');
  });
});
