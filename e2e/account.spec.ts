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

async function login(page: Page, name = NAME) {
  await openClassic(page);
  await expect(page.getByRole('button', { name: /Loo konto/ })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Kasutajanimi').fill(name);
  await page.getByLabel('Parool', { exact: true }).fill(PASS);
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('menu');
}

async function register(page: Page, name: string) {
  await openClassic(page);
  await page.getByRole('button', { name: 'Pole veel kontot? Loo konto' }).click();
  await page.getByLabel('Kasutajanimi').fill(name);
  await page.getByLabel('Parool', { exact: true }).fill(PASS);
  await page.getByLabel('Korda parooli').fill(PASS);
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('menu');
}

/** Sign out of the account from the menu chip: confirmed in a dialog, by default removing its data from this browser. */
async function logout(page: Page, opts: { keepData?: boolean } = {}) {
  await page.getByRole('button', { name: 'Logi välja' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', { name: 'Kustuta selle konto andmed sellest brauserist' })).toBeChecked();
  if (opts.keepData) await dialog.getByRole('checkbox').uncheck();
  await dialog.getByRole('button', { name: 'Logi välja' }).click();
  await expect.poll(() => screen(page)).toBe('login');
}

const careerName = (page: Page) =>
  page.evaluate(() => (window as unknown as EpdWindow).__epd.career.getState().profile?.name ?? null);

async function cloudSaved(page: Page) {
  await expect(page.getByTestId('cloud-state').first()).toHaveText('Pilves salvestatud', { timeout: 20_000 });
}

async function startQuickShift(page: Page) {
  // Kiirmäng sits in the menu's Üksikmäng group (2.27.0): open it unless it is open already.
  if (!(await page.getByRole('button', { name: /Kiirmäng/ }).first().isVisible()))
    await page.getByRole('button', { name: /Üksikmäng/ }).first().click();
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

    // Log out (keeping the account's data in this browser): back to the login screen, the session is gone.
    await logout(page, { keepData: true });
    await expect.poll(async () => (await (await page.request.get('/api/me')).json()).user).toBeNull();

    // Log back in: the menu shows the account and the leaderboard knows us.
    await login(page);
    await expect(page.locator('.sh-acct__name')).toHaveText(NAME);
    await expect(page.locator('.vk-lb__row.is-me')).toContainText(NAME);
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
    // Focus goes back to the password (the inputs are not remounted), so the next try can be typed at once.
    await expect(page.getByLabel('Parool', { exact: true })).toBeFocused();
    expect(await screen(page)).toBe('login');
    await page.context().close();
  });
});

test("guest and account data never mix: each one's career and shift come back with it", async ({ page }) => {
  const name = `mix_${Date.now().toString(36)}`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);
  // An account with a career of its own, in the cloud.
  await register(page, name);
  await page.evaluate(() => (window as unknown as EpdWindow).__epd.career.getState().create('Konto Karjäär', '1001', 'pohja'));
  await expect
    .poll(async () => (await (await page.request.get('/api/save')).json()).career?.profile?.name, { timeout: 20_000 })
    .toBe('Konto Karjäär');
  await logout(page);

  // A guest starts a career in the same browser.
  await page.getByRole('button', { name: 'Jätka külalisena' }).click();
  await expect.poll(() => screen(page)).toBe('menu');
  expect(await careerName(page)).toBeNull();
  await page.evaluate(() => (window as unknown as EpdWindow).__epd.career.getState().create('Külalise Karjäär', '2002', 'ida'));
  await page.locator('.sh-user').getByRole('button', { name: 'Logi välja' }).click();
  await expect.poll(() => screen(page)).toBe('login');

  // The account: its own career, then a shift saved and left.
  await login(page, name);
  await expect.poll(() => careerName(page)).toBe('Konto Karjäär');
  await startQuickShift(page);
  await openPauseMenu(page);
  await page.getByRole('button', { name: 'Salvesta ja välju' }).click();
  await expect.poll(() => screen(page)).toBe('menu');
  await expect(page.getByRole('button', { name: /Jätka vahetust/ })).toBeVisible();
  await cloudSaved(page);
  expect((await (await page.request.get('/api/save')).json()).autosave?.version).toBe(2);

  // Signed out: the guest's career is back, the account's shift is not offered, nothing of it stays here.
  await logout(page);
  await page.getByRole('button', { name: 'Jätka külalisena' }).click();
  await expect.poll(() => screen(page)).toBe('menu');
  await expect.poll(() => careerName(page)).toBe('Külalise Karjäär');
  await expect(page.getByRole('button', { name: /Karjäär/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Jätka vahetust/ })).toHaveCount(0);
  const leftovers = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('epd:acct:') || k === 'epd:autosave'),
  );
  expect(leftovers).toEqual([]);

  // Back in the account: its shift is offered again (from the cloud) and resumes.
  await page.locator('.sh-user').getByRole('button', { name: 'Logi välja' }).click();
  await expect.poll(() => screen(page)).toBe('login');
  await login(page, name);
  await expect.poll(() => careerName(page)).toBe('Konto Karjäär');
  await expect(page.getByRole('button', { name: /Jätka vahetust/ })).toBeVisible();
  await page.getByRole('button', { name: /Jätka vahetust/ }).click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('game');
  expect(errors, errors.join('\n')).toEqual([]);
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
  await expect(page.getByRole('alert').filter({ hasText: 'Vale parool.' })).toBeVisible();
  await expect(page.getByLabel('Kinnita parooliga')).toBeFocused();
  expect(await screen(page)).toBe('menu');

  await page.getByLabel('Kinnita parooliga').fill(PASS);
  await page.getByRole('button', { name: 'Kustuta jäädavalt' }).click();
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
  const relogin = await page.request.post('/api/login', { headers: { 'X-EPD': '1' }, data: { name, password: PASS } });
  expect(relogin.status()).toBe(401);
});

test('"Delete all data" signs out: the reload neither stays signed in nor pulls the cloud data back', async ({ page }) => {
  const name = `clr_${Date.now().toString(36)}`;
  await boot(page);
  await openClassic(page);
  await page.getByRole('button', { name: 'Pole veel kontot? Loo konto' }).click();
  await page.getByLabel('Kasutajanimi').fill(name);
  await page.getByLabel('Parool', { exact: true }).fill(PASS);
  await page.getByLabel('Korda parooli').fill(PASS);
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('menu');
  await page.evaluate(() => (window as unknown as EpdWindow).__epd.career.getState().create('Mari Pilv', '4711', 'pohja'));
  await expect
    .poll(async () => (await (await page.request.get('/api/save')).json()).career?.profile?.name, { timeout: 20_000 })
    .toBe('Mari Pilv');

  await page.getByRole('button', { name: /Seaded/ }).first().click();
  await expect(page.getByText(/Sinu konto andmed on ka politsei\.eu serveris/)).toBeVisible();
  await page.getByRole('button', { name: /^Kustuta$/ }).click();
  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: /Kinnita/ }).click();
  await reloaded;
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
  expect((await (await page.request.get('/api/me')).json()).user).toBeNull();
  await expect(page.getByText(/Sisse logitud:/)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as EpdWindow).__epd.career.getState().profile)).toBeNull();
  // The account itself and its cloud career are still there.
  const relogin = await page.request.post('/api/login', { headers: { 'X-EPD': '1' }, data: { name, password: PASS } });
  expect(relogin.status()).toBe(200);
  expect((await (await page.request.get('/api/save')).json()).career?.profile?.name).toBe('Mari Pilv');
});

test('a profile picture found by writing what one wants stays with the account (2.35.0)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);
  await register(page, `pic_${Date.now().toString(36)}`);
  const pic = page.locator('.vk-acct__pic').first();
  await expect(pic).toHaveAttribute('data-avatar', 'default');
  await page.locator('.vk-acct__who').first().click();
  await page.getByTestId('chip-picture').click();
  const picker = page.getByTestId('profile-picker');
  await picker.getByRole('radio', { name: 'Foto' }).click();
  await page.getByTestId('profile-search').fill('naine blond');
  await expect(page.getByTestId('profile-count')).toContainText('Leidsin');
  const first = page.getByTestId('profile-faces').locator('button').first();
  const id = await first.getAttribute('data-face');
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  if (process.env.MP_SHOTS) await page.screenshot({ path: `${process.env.MP_SHOTS}/profile-picker.png` });
  await page.getByTestId('profile-save').click();
  await expect(picker).toHaveCount(0);
  await expect(pic).toHaveAttribute('data-avatar', `face:${id}`);
  // Another device (a reload) gets it from the account.
  await page.reload();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Jätka', exact: true }).click({ timeout: 20_000 });
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('menu');
  await expect(page.locator('.vk-acct__pic').first()).toHaveAttribute('data-avatar', `face:${id}`, { timeout: 20_000 });
  expect(errors, errors.join('\n')).toEqual([]);
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
