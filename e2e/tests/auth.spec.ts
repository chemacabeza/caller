import { test, expect, login, DEMO_URL, E2E } from '../support/fixtures';

test.describe('Acceso (login)', () => {
  test('shows the login form first and hides the call form', async ({ page }) => {
    await page.goto(DEMO_URL);
    await expect(page.getByRole('heading', { name: 'Llamadas en Español' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acceso' })).toBeVisible();
    await expect(page.getByText(/APP_PASSWORD/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nueva llamada' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeDisabled();
  });

  test('rejects a wrong password with a clear message', async ({ page }) => {
    await page.goto(DEMO_URL);
    await page.getByLabel('Contraseña').fill('incorrecta');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText('Contraseña incorrecta.');
    await expect(page.getByRole('heading', { name: 'Nueva llamada' })).toHaveCount(0);
  });

  test('logs in with the right password and sets a hardened session cookie', async ({ page, context }) => {
    await login(page, DEMO_URL);
    const cookie = (await context.cookies()).find((c) => c.name === 'llamadas_sid');
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Strict');
    // Not readable from JavaScript.
    expect(await page.evaluate(() => document.cookie)).not.toContain('llamadas_sid');
  });

  test('keeps the session across a page reload', async ({ page }) => {
    await login(page, DEMO_URL);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Nueva llamada' })).toBeVisible();
  });

  test('logs out and the old cookie stops working', async ({ page, context }) => {
    await login(page, DEMO_URL);
    const before = (await context.cookies()).find((c) => c.name === 'llamadas_sid')!;
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Acceso' })).toBeVisible();
    // Replaying the old session id must be refused by the server.
    const res = await page.request.get(`${DEMO_URL}/api/config`, { headers: { Cookie: `llamadas_sid=${before.value}` } });
    expect(res.status()).toBe(401);
  });

  test('returns to the login form when the session disappears mid-use', async ({ page, context }) => {
    await login(page, DEMO_URL);
    await context.clearCookies();
    await page.getByRole('button', { name: /Llamar/ }).click();
    await expect(page.getByRole('heading', { name: 'Acceso' })).toBeVisible();
  });

  test('throttles repeated wrong passwords', async ({ request }) => {
    // 5 failures lock the client out for a minute.
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await request.post(`${DEMO_URL}/api/session`, { data: { password: `mal-${i}` } })).status();
    }
    expect(last).toBe(429);
    // A correct password is also refused while throttled.
    expect((await request.post(`${DEMO_URL}/api/session`, { data: { password: E2E.password } })).status()).toBe(429);
  });
});

test.afterAll(async ({ request }) => {
  await request.post(`${DEMO_URL}/__e2e/reset`);
});
