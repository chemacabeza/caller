import { test, expect, DEMO_URL } from '../support/fixtures';

test.describe('Móvil', () => {
  test('stacks the panels in one column with no horizontal scrolling', async ({ demoPage: page }) => {
    const form = page.locator('section').nth(0);
    const statusPanel = page.locator('section').nth(1);
    const a = (await form.boundingBox())!;
    const b = (await statusPanel.boundingBox())!;
    expect(b.y).toBeGreaterThan(a.y + a.height - 1);
    expect(Math.abs(a.x - b.x)).toBeLessThan(2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('buttons are big enough to tap', async ({ demoPage: page }) => {
    for (const name of [/Llamar/, /Colgar/, /Escuchar mensaje/]) {
      const box = (await page.getByRole('button', { name }).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(48);
      expect(box.width).toBeGreaterThanOrEqual(100);
    }
  });

  test('the phone field opens the telephone keypad', async ({ demoPage: page }) => {
    const input = page.getByLabel('Número de teléfono');
    await expect(input).toHaveAttribute('type', 'tel');
    await expect(input).toHaveAttribute('inputmode', 'tel');
  });

  test('a full simulated call works by touch, without a microphone', async ({ demoPage: page, context }) => {
    // No microphone permission is ever requested.
    await context.clearPermissions();
    await page.getByLabel('Escenario simulado').selectOption('respuesta');
    await page.getByRole('button', { name: 'Llamar (simulado)' }).tap();
    await expect(page.locator('.status')).toHaveText('Finalizada');
    await page.locator('.transcript').scrollIntoViewIfNeeded();
    await expect(page.locator('.transcript blockquote')).toBeInViewport();
    await expect(page.locator('.transcript blockquote')).toContainText('[SIMULADO]');
  });

  test('base font is readable', async ({ page }) => {
    await page.goto(DEMO_URL);
    const size = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });
});
