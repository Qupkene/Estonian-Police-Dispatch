import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Accounts against the real PHP API (playwright.config.ts starts `php -S` with a throwaway EPD_DATA):
 * register on the Klassika tab, play, get a leaderboard rank, cloud-save, log out and back in, then
 * log in on a second "device" (fresh browser context) and find the career, settings and shift there.
 */

type EpdWindow = Window & {
  __epd: {
    game: {
      getState: () => {
        screen: string;
        user: { name: string; method: string } | null;
        sim: null | { stats: { incidents: number } };
        setSpeed: (i: number) => void;
      };
    };
    career: {
      getState: () => {
        profile: null | { name: string; badge: string };
        create: (name: string, badge: string, regionId: string) => void;
      };
    };
    settings: { getState: () => { hints: boolean; set: (p: { hints: boolean }) => void } };
  };
};

const NAME = `e2e_${Date.now().toString(36)}`;
const PASS = 'Salajane-parool-2026';

const screen = (page: Page) => page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().screen);

async function boot(page: Page) {
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
}

async function openClassic(page: Page) {
  await page.getByRole('tab', { name: 'Klassika' }).click();
  // The register switch only shows once the API answered /api/health.
  await expect(page.locator('form.sh-legacy')).toBeVisible();
}

async function login(page: Page) {
  await openClassic(page);
  await expect(page.getByRole('button', { name: /Loo konto/ })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Kasutajanimi').fill(NAME);
  await page.getByLabel('Parool', { exact: true }).fill(PASS);
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('menu');
}

async function cloudSaved(page: Page) {
  await expect(page.getByTestId('cloud-state').first()).toHaveText('Pilves salvestatud', { timeout: 20_000 });
}

async function startQuickShift(page: Page) {
  await page.getByRole('button', { name: /Kiirmäng/ }).first().click();
  await expect.poll(() => screen(page)).toBe('briefing');
  await page.getByRole('button', { name: /Alusta vahetust/ }).first().click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('game');
}

async function openPauseMenu(page: Page) {
  await page.locator('.gm-top__menu').click();
}

test.describe.serial('accounts', () => {
  test.setTimeout(180_000);

  test('register, play to a ranked report, cloud save, log out and back in', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await boot(page);
    await openClassic(page);
    await page.getByRole('button', { name: 'Pole veel kontot? Loo konto' }).click();
    await expect(page.getByRole('heading', { name: 'Loo konto' })).toBeVisible();

    // Inline rules: a mismatching repeat is caught before anything is sent.
    await page.getByLabel('Kasutajanimi').fill(NAME);
    await page.getByLabel('Parool', { exact: true }).fill(PASS);
    await page.getByLabel('Korda parooli').fill(`${PASS}x`);
    await page.locator('form.sh-legacy button[type="submit"]').click();
    await expect(page.locator('.sh-legacy__err')).toHaveText('Paroolid ei kattu.');

    await page.getByLabel('Korda parooli').fill(PASS);
    await page.locator('form.sh-legacy button[type="submit"]').click();
    await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('menu');
    expect(await page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().user)).toEqual({
      name: NAME,
      method: 'account',
    });
    await expect(page.locator('.sh-acct__name')).toHaveText(NAME);
    await expect(page.getByRole('heading', { name: /Edetabel/ })).toBeVisible();
    await cloudSaved(page);

    // Career and a setting change go to the cloud after the 2 s debounce.
    await page.evaluate(() => {
      const e = (window as unknown as EpdWindow).__epd;
      e.career.getState().create('Kadri Pilv', '4711', 'ida');
      e.settings.getState().set({ hints: false });
    });
    await expect(page.getByTestId('cloud-state').first()).toHaveText('Salvestan pilve…');
    await cloudSaved(page);

    // A quick shift, ended after the first incident: the report shows the leaderboard place.
    // (A shift without any incident stays off the leaderboard.)
    await startQuickShift(page);
    await page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().setSpeed(4));
    await expect
      .poll(() => page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().sim?.stats.incidents ?? 0), {
        timeout: 60_000,
      })
      .toBeGreaterThan(0);
    await openPauseMenu(page);
    await page.getByRole('button', { name: /Lõpeta vahetus/ }).first().click();
    await page.getByRole('button', { name: /Jah, lõpeta vahetus/ }).click();
    await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('report');
    await expect(page.getByTestId('leaderboard-rank')).toHaveText(/Sinu koht edetabelis: \d+/, { timeout: 15_000 });
    const scores = await (await page.request.get('/api/scores?limit=50')).json();
    expect(scores.scores.map((s: { name: string }) => s.name)).toContain(NAME);

    // A second shift, saved and left: the autosave goes to the cloud.
    await page.getByRole('button', { name: 'Menüüsse' }).first().click();
    await expect.poll(() => screen(page)).toBe('menu');
    await startQuickShift(page);
    await openPauseMenu(page);
    await page.getByRole('button', { name: 'Salvesta ja välju' }).click();
    await expect.poll(() => screen(page)).toBe('menu');
    await expect(page.getByRole('button', { name: /Jätka vahetust/ })).toBeVisible();
    await cloudSaved(page);
    const saved = await (await page.request.get('/api/save')).json();
    expect(saved.autosave?.version).toBe(2);
    expect(saved.career?.profile?.name).toBe('Kadri Pilv');
    expect(saved.settings?.hints).toBe(false);

    // Log out: back to the login screen, local data stays, the session is gone.
    await page.getByRole('button', { name: 'Logi välja' }).click();
    await expect.poll(() => screen(page)).toBe('login');
    await expect.poll(async () => (await (await page.request.get('/api/me')).json()).user).toBeNull();

    // Log back in: the menu shows the account and the leaderboard knows us.
    await login(page);
    await expect(page.locator('.sh-acct__name')).toHaveText(NAME);
    await expect(page.locator('.sh-lb__row.is-me')).toContainText(NAME);
    await cloudSaved(page);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the same account on a second device brings career, settings and the shift along', async ({ browser }) => {
    const page = await freshPage(browser);
    await boot(page);
    // A fresh device has nothing local.
    expect(await page.evaluate(() => (window as unknown as EpdWindow).__epd.career.getState().profile)).toBeNull();
    await login(page);
    const state = await page.evaluate(() => {
      const e = (window as unknown as EpdWindow).__epd;
      return { career: e.career.getState().profile?.name, hints: e.settings.getState().hints };
    });
    expect(state).toEqual({ career: 'Kadri Pilv', hints: false });
    await expect(page.getByRole('button', { name: /Jätka vahetust/ })).toBeVisible();
    await page.getByRole('button', { name: /Jätka vahetust/ }).click();
    await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('game');
    await page.context().close();
  });

  test('wrong password shows the server message inline', async ({ browser }) => {
    const page = await freshPage(browser);
    await boot(page);
    await openClassic(page);
    await expect(page.getByRole('button', { name: /Loo konto/ })).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Kasutajanimi').fill(NAME);
    await page.getByLabel('Parool', { exact: true }).fill('vale-parool-123');
    await page.locator('form.sh-legacy button[type="submit"]').click();
    await expect(page.locator('.sh-legacy__err')).toHaveText('Vale kasutajanimi või parool.');
    expect(await screen(page)).toBe('login');
    await page.context().close();
  });
});

test('an account can be deleted from the chip menu, confirmed with the password', async ({ page }) => {
  const name = `del_${Date.now().toString(36)}`;
  await boot(page);
  await openClassic(page);
  await page.getByRole('button', { name: 'Pole veel kontot? Loo konto' }).click();
  await page.getByLabel('Kasutajanimi').fill(name);
  await page.getByLabel('Parool', { exact: true }).fill(PASS);
  await page.getByLabel('Korda parooli').fill(PASS);
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('menu');

  await page.locator('.sh-acct__btn').click();
  await page.getByRole('menuitem', { name: 'Kustuta konto' }).click();
  await page.getByLabel('Kinnita parooliga').fill('vale-parool-1');
  await page.getByRole('button', { name: 'Kustuta jäädavalt' }).click();
  await expect(page.getByText('Vale parool.')).toBeVisible();
  expect(await screen(page)).toBe('menu');

  await page.getByLabel('Kinnita parooliga').fill(PASS);
  await page.getByRole('button', { name: 'Kustuta jäädavalt' }).click();
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
  const relogin = await page.request.post('/api/login', { headers: { 'X-EPD': '1' }, data: { name, password: PASS } });
  expect(relogin.status()).toBe(401);
});

test('the 2024 easter egg still works with the API online', async ({ page }) => {
  await boot(page);
  await openClassic(page);
  await expect(page.getByRole('button', { name: /Loo konto/ })).toBeVisible({ timeout: 10_000 });
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect(page.getByText('Tere tagasi, 2024!')).toBeVisible();
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('menu');
  expect(await page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().user?.method)).toBe('legacy');
  expect(await page.evaluate(() => localStorage.getItem('epd:legacyLogin'))).toBe('1');
});

test('without a backend: one calm line, and the easter egg still works', async ({ page }) => {
  // GitHub Pages / plain vite: /api answers with a static 404 page.
  await page.route('**/api/**', (route) => route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404</h1>' }));
  await boot(page);
  await openClassic(page);
  await expect(page.getByText('Kontod töötavad politsei.eu serveris. Siin saad mängida külalisena.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Loo konto/ })).toHaveCount(0);
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('menu');
  await expect(page.getByRole('heading', { name: /Edetabel/ })).toHaveCount(0);
});

async function freshPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  return ctx.newPage();
}
