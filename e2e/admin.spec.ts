import { expect, test, type APIRequestContext } from '@playwright/test';
import { spawnSync } from 'node:child_process';

/**
 * The admin panel (/admin/) against the real PHP API (playwright.config.ts starts `php -S` with a throwaway EPD_DATA):
 * an account made admin on the "server" (server/bin/admin.php), its login unlocks the panel, then the main jobs: a new
 * account with a generated password, a result added and edited, a block, a password reset and the deletion.
 */

const STAMP = Date.now().toString(36);
const ADMIN = `boss_${STAMP}`;
const PASS = 'Admini-parool-2026';
const PLAYER = `mangija_${STAMP}`;

/** The e2e PHP server's data folder (playwright.config.ts). */
const cli = (...args: string[]) =>
  spawnSync('php', ['server/bin/admin.php', ...args], {
    encoding: 'utf8',
    env: { ...process.env, EPD_DATA: './test-results/epd-data' },
  });

/** Another device: the `request` fixture keeps its own cookies, apart from the page's. */
async function registerAdmin(request: APIRequestContext) {
  const r = await request.post('/api/register', {
    data: { name: ADMIN, password: PASS },
    headers: { 'X-EPD': '1' },
  });
  expect(r.status()).toBe(200);
  const made = cli('lisa', ADMIN);
  expect(made.status, made.stderr).toBe(0);
}

test('admin panel: log in, make an account, edit its results, block, reset and delete it', async ({
  page,
  request,
}) => {
  await registerAdmin(request);

  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Logi sisse' })).toBeVisible();
  await page.getByLabel('Kasutajanimi').fill(ADMIN);
  await page.getByLabel('Parool').fill(PASS);
  await page.getByRole('button', { name: 'Logi sisse' }).click();
  await expect(page.getByRole('heading', { name: 'Ülevaade' })).toBeVisible();
  await expect(page.locator('.ad-card').first()).toContainText('Kontod');

  // A new account: the server makes the password and shows it once.
  await page.getByRole('navigation').getByRole('link', { name: 'Kontod' }).click();
  await page.getByRole('button', { name: 'Uus konto' }).click();
  await page.getByLabel('Kasutajanimi').fill(PLAYER);
  await page.getByRole('button', { name: 'Loo konto' }).click();
  const secret = page.locator('.ad-secret__value');
  await expect(secret).toHaveText(/^[a-zA-Z2-9]{14}$/);
  const password = (await secret.textContent())!;
  const login = await request.post('/api/login', {
    data: { name: PLAYER, password },
    headers: { 'X-EPD': '1' },
  });
  expect(login.status()).toBe(200);
  await page.getByRole('button', { name: 'Ava konto' }).click();
  await expect(page.getByRole('heading', { name: PLAYER })).toBeVisible();

  // A leaderboard result: add, then edit.
  await page.getByRole('button', { name: 'Lisa tulemus' }).click();
  await page.getByLabel('Skoor (0 kuni 100)').fill('93');
  await page.getByRole('dialog').getByRole('button', { name: 'Lisa' }).click();
  await expect(page.locator('.ad-panel--tab tbody tr').first()).toContainText('93');
  const board = await request.get('/api/scores?region=pohja');
  expect(((await board.json()) as { scores: { name: string; score: number }[] }).scores).toContainEqual(
    expect.objectContaining({ name: PLAYER, score: 93 }),
  );
  await page.locator('.ad-panel--tab').getByRole('button', { name: 'Muuda' }).click();
  await page.getByLabel('Skoor (0 kuni 100)').fill('41');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvesta' }).click();
  await expect(page.locator('.ad-panel--tab tbody tr').first()).toContainText('41');

  // Block: the badge shows and the login is refused.
  await page.getByRole('button', { name: /Blokeeri konto/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Blokeeri' }).click();
  await expect(page.locator('h1 .ad-badge--bad')).toHaveText('blokeeritud');
  const blocked = await request.post('/api/login', {
    data: { name: PLAYER, password },
    headers: { 'X-EPD': '1' },
  });
  expect(blocked.status()).toBe(403);
  expect(((await blocked.json()) as { error: string }).error).toBe('account_disabled');
  await page.getByRole('button', { name: /Luba konto/ }).click();
  await expect(page.locator('h1 .ad-badge--bad')).toHaveCount(0);

  // A new password, generated.
  await page.getByRole('button', { name: /Uus parool/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tee uus parool' }).click();
  await expect(page.locator('.ad-secret__value')).toHaveText(/^[a-zA-Z2-9]{14}$/);
  await expect(page.locator('.ad-secret__value')).not.toHaveText(password);
  await page.getByRole('button', { name: 'Valmis' }).click();

  // The log lists what was done.
  await page.getByRole('tab', { name: /Logi/ }).click();
  await expect(page.locator('.ad-panel--tab')).toContainText('Vahetas parooli');
  await expect(page.locator('.ad-panel--tab')).toContainText('Lisas tulemuse');

  // Delete: only after the name is typed.
  await page.getByRole('button', { name: /Kustuta konto/ }).click();
  const remove = page.getByRole('dialog').getByRole('button', { name: 'Kustuta jäädavalt' });
  await expect(remove).toBeDisabled();
  await page.getByRole('dialog').getByRole('textbox').fill(PLAYER);
  await remove.click();
  await expect(page.getByRole('heading', { name: 'Kontod' })).toBeVisible();
  const gone = await request.get('/api/scores?region=pohja');
  expect(((await gone.json()) as { scores: { name: string }[] }).scores.map((s) => s.name)).not.toContain(
    PLAYER,
  );

  // Locking closes the panel; the password opens it again.
  await page.getByRole('button', { name: 'Lukusta' }).click();
  await expect(page.getByRole('heading', { name: 'Kinnita parool' })).toBeVisible();
  await page.getByLabel('Parool').fill(PASS);
  await page.getByRole('button', { name: 'Ava paneel' }).click();
  await expect(page.getByRole('heading', { name: 'Kontod' })).toBeVisible();
});

test('admin panel: a player who is not an admin sees no data', async ({ page }) => {
  const name = `tavaline_${STAMP}`;
  expect(
    (
      await page.request.post('/api/register', { data: { name, password: PASS }, headers: { 'X-EPD': '1' } })
    ).status(),
  ).toBe(200);
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Ligipääs puudub' })).toBeVisible();
  await expect(page.locator('.ad-table')).toHaveCount(0);
  expect((await page.request.get('/api/admin/users')).status()).toBe(403);
});
