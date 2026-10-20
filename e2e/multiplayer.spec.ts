import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Mitmikmäng against the real PHP API (playwright.config.ts): a guest only gets the sign-in hint; two accounts
 * in two browser contexts create a room, join it with the code, mark ready and start; both play the same shift
 * (same seed, start and room mark), end it and send their results, and the report shows the room's live board.
 * Two more players join and play through the API, so the board has four rows. Nothing reaches the normal
 * leaderboard. MP_SHOTS=<dir> also saves screenshots of the lobby (1440 dark and light, 390) and the report board.
 */

type EpdWindow = Window & {
  __epd: {
    game: {
      getState: () => {
        screen: string;
        sim: null | {
          seed: number;
          mode: string;
          difficulty: string;
          regionId: string;
          startTime: number;
          endTime: number;
          sectors?: string[];
          flags: Record<string, unknown>;
          stats: { incidents: number };
        };
        setSpeed: (i: number) => void;
        bump: () => void;
      };
    };
    settings: { getState: () => { set: (p: { theme?: 'dark' | 'light' }) => void } };
    engine: { step: (s: unknown, ms: number) => void };
  };
};

const SHOTS = process.env.MP_SHOTS;
const STAMP = Date.now().toString(36);
const HOST = `host_${STAMP}`;
const GUEST = `kylal_${STAMP}`;
const PASS = 'Salajane-parool-2026';
const H = { 'X-EPD': '1' };

const screen = (page: Page) =>
  page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().screen);
const simInfo = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as EpdWindow).__epd.game.getState().sim;
    return s
      ? {
          seed: s.seed,
          mode: s.mode,
          difficulty: s.difficulty,
          regionId: s.regionId,
          start: s.startTime,
          hours: (s.endTime - s.startTime) / 3_600_000,
          sector: s.sectors?.[0] ?? '',
          room: s.flags.room,
        }
      : null;
  });

async function boot(page: Page) {
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
}

async function register(browser: Browser, name: string, width = 1440, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);
  await page.getByRole('tab', { name: 'Klassika' }).click();
  await page.getByRole('button', { name: 'Pole veel kontot? Loo konto' }).click();
  await page.getByLabel('Kasutajanimi').fill(name);
  await page.getByLabel('Parool', { exact: true }).fill(PASS);
  await page.getByLabel('Korda parooli').fill(PASS);
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('menu');
  return { ctx, page, errors };
}

/** A player who only talks to the API (a browser context's request client keeps the session cookie). */
async function apiPlayer(browser: Browser, name: string): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  const reg = await ctx.request.post('/api/register', { headers: H, data: { name, password: PASS } });
  expect(reg.ok()).toBe(true);
  return ctx;
}

async function openRooms(page: Page) {
  await page
    .getByRole('button', { name: /Mitmikmäng/ })
    .first()
    .click();
  await expect.poll(() => screen(page)).toBe('lobby');
}

/** Run the clock (paused, stepped through the console handle) until the first incident, then end the shift. */
async function playAndEnd(page: Page) {
  const incidents = await page.evaluate(() => {
    const e = (window as unknown as EpdWindow).__epd;
    const g = e.game.getState();
    g.setSpeed(0);
    const s = g.sim!;
    for (let m = 0; m < 170 && !s.stats.incidents; m++) e.engine.step(s, 60_000);
    g.bump();
    return s.stats.incidents;
  });
  expect(incidents).toBeGreaterThan(0);
  await page.locator('.gm-top__menu').click();
  await page
    .getByRole('button', { name: /Lõpeta vahetus/ })
    .first()
    .click();
  await page.getByRole('button', { name: /Jah, lõpeta vahetus/ }).click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('report');
}

/** Screenshot into MP_SHOTS once the page has settled (finite animations done). */
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
      null,
      { timeout: 8_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

const theme = (page: Page, t: 'dark' | 'light') =>
  page.evaluate((t) => (window as unknown as EpdWindow).__epd.settings.getState().set({ theme: t }), t);

test.describe.serial('multiplayer rooms', () => {
  test.setTimeout(240_000);

  test('a guest gets the sign-in hint, not a room', async ({ page }) => {
    await boot(page);
    await page.getByRole('tab', { name: 'Klassika' }).click();
    await page.locator('form.sh-legacy button[type="submit"]').click();
    await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('menu');
    await openRooms(page);
    const hint = page.getByTestId('rooms-guest');
    await expect(hint).toContainText('Mitmikmäng vajab kontot');
    await expect(page.getByRole('button', { name: 'Loo ruum' })).toHaveCount(0);
    await hint.getByRole('button', { name: 'Logi sisse' }).click();
    await expect.poll(() => screen(page)).toBe('login');
  });

  test('two accounts create, join, start, play the same shift and both send results', async ({ browser }) => {
    const host = await register(browser, HOST);
    const guest = await register(browser, GUEST);
    const posts: string[] = [];
    for (const p of [host.page, guest.page])
      p.on('request', (r) => {
        if (r.method() === 'POST' && /\/api\/(score|daily|rooms)/.test(r.url()))
          posts.push(new URL(r.url()).pathname);
      });

    // The host creates a room: Lõuna prefecture, Tartu linn, 2 hours.
    await openRooms(host.page);
    await shot(host.page, 'rooms-create-1440');
    await host.page.getByRole('radio', { name: 'Lõuna', exact: true }).click();
    await host.page.getByRole('radio', { name: '2 h' }).click();
    await expect(host.page.getByRole('radio', { name: /Sektorite koostöö/ })).toBeDisabled();
    await host.page.getByRole('button', { name: 'Loo ruum' }).click();
    const codeText = (await host.page.getByTestId('room-code').textContent()) ?? '';
    const code = codeText.replace(/\s/g, '');
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    await expect(host.page.getByTestId('room-block')).toContainText('vähemalt kahte mängijat');
    await expect(host.page.getByRole('button', { name: 'Alusta vahetust' })).toBeDisabled();

    // The guest joins with the code typed in lower case, with a space.
    await openRooms(guest.page);
    await guest.page.getByLabel('Ruumi kood').fill(`${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`);
    await guest.page.getByRole('button', { name: 'Liitu', exact: true }).click();
    await expect(guest.page.getByTestId('room-seats')).toContainText(HOST);
    await expect(guest.page.getByTestId('room-seats')).toContainText(GUEST);
    await expect(host.page.getByTestId('room-seats')).toContainText(GUEST, { timeout: 10_000 });
    await expect(host.page.getByTestId('room-block')).toContainText('Ootan, kuni kõik mängijad on valmis');

    // Two more players through the API, so the board has four rows.
    const kati = await apiPlayer(browser, `kati_${STAMP}`);
    const mart = await apiPlayer(browser, `mart_${STAMP}`);
    for (const ctx of [kati, mart]) {
      const r = await ctx.request.post('/api/rooms/join', { headers: H, data: { code } });
      expect(r.ok()).toBe(true);
    }
    await kati.request.post(`/api/rooms/${code}/ready`, { headers: H, data: { ready: true } });
    await expect(host.page.getByTestId('room-seats').locator('li:not(.is-free)')).toHaveCount(4, {
      timeout: 10_000,
    });

    await expect(host.page.getByTestId('room-seats').locator('.vk-mp__ready.is-ready')).toHaveCount(2, {
      timeout: 10_000,
    });
    await expect(guest.page.getByTestId('room-seats').locator('.vk-mp__ready.is-ready')).toHaveCount(2, {
      timeout: 10_000,
    });
    if (SHOTS) {
      await shot(host.page, 'lobby-1440-dark');
      await theme(host.page, 'light');
      await shot(host.page, 'lobby-1440-light');
      await theme(host.page, 'dark');
      await guest.page.setViewportSize({ width: 390, height: 844 });
      await shot(guest.page, 'lobby-390');
      await guest.page.setViewportSize({ width: 1440, height: 900 });
    }

    await guest.page.getByRole('button', { name: 'Olen valmis' }).click();
    await mart.request.post(`/api/rooms/${code}/ready`, { headers: H, data: { ready: true } });
    await expect(host.page.getByTestId('room-block')).toContainText('Kõik on valmis', { timeout: 10_000 });
    await host.page.getByRole('button', { name: 'Alusta vahetust' }).click();

    // Both go on shift by themselves: the same shift, marked with the room.
    await expect.poll(() => screen(host.page), { timeout: 20_000 }).toBe('game');
    await expect.poll(() => screen(guest.page), { timeout: 20_000 }).toBe('game');
    const a = await simInfo(host.page);
    const b = await simInfo(guest.page);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ mode: 'free', regionId: 'louna', hours: 2, difficulty: 'normal', room: code });
    const started = await (await kati.request.get(`/api/rooms/${code}`)).json();
    expect(started.room.seed).toBe(a!.seed);

    // The API players finish first, then the two browsers.
    await kati.request.post(`/api/rooms/${code}/result`, {
      headers: H,
      data: { score: 91, grade: 'S', incidents: 12, arrests: 3 },
    });
    await mart.request.post(`/api/rooms/${code}/result`, {
      headers: H,
      data: { score: 58, grade: 'D', incidents: 10, arrests: 0 },
    });
    await playAndEnd(guest.page);
    await expect(guest.page.getByTestId('room-rank')).toHaveText(/Ruumis \w{3} \w{3}: koht \d\/4/, {
      timeout: 15_000,
    });
    await expect(guest.page.getByTestId('room-board')).toContainText(HOST);
    await playAndEnd(host.page);
    await expect(host.page.getByTestId('room-rank')).toHaveText(/Ruumis \w{3} \w{3}: koht \d\/4/, {
      timeout: 15_000,
    });
    await expect(host.page.locator('.sh-head__sub')).toContainText('Mitmikmäng');

    // Every report's board ends with all four results.
    for (const p of [host.page, guest.page]) {
      const report = p.getByTestId('room-report');
      await expect(report).toContainText('4/4 lõpetanud', { timeout: 15_000 });
      await expect(report).toContainText('Lõplik');
      await expect(report.locator('tbody tr')).toHaveCount(4);
      await expect(report.locator('.vk-mp__row.is-me')).toHaveCount(1);
    }
    if (SHOTS) {
      await host.page.getByTestId('room-report').scrollIntoViewIfNeeded();
      await shot(host.page, 'report-board');
    }

    // Each browser sent its result once, and nothing went to the normal leaderboard or the daily board.
    expect(posts.filter((p) => p.endsWith('/result'))).toEqual([
      `/api/rooms/${code}/result`,
      `/api/rooms/${code}/result`,
    ]);
    expect(posts.filter((p) => /\/api\/(score|daily)$/.test(p))).toEqual([]);
    const scores = await (await host.page.request.get('/api/scores?limit=50')).json();
    expect(scores.scores.map((s: { name: string }) => s.name)).not.toContain(HOST);
    const board = (await (await kati.request.get(`/api/rooms/${code}`)).json()).room;
    expect(board.state).toBe('finished');
    expect(board.results.map((r: { name: string }) => r.name)).toEqual(
      expect.arrayContaining([HOST, GUEST, `kati_${STAMP}`, `mart_${STAMP}`]),
    );

    // Back to the room from the report: the finished room with its board.
    await host.page.getByRole('button', { name: 'Ruumi', exact: true }).click();
    await expect.poll(() => screen(host.page)).toBe('lobby');
    await expect(host.page.getByTestId('room')).toHaveAttribute('data-state', 'finished');
    await expect(host.page.getByTestId('room-sent')).toContainText('Kõik tulemused on koos');

    expect(host.errors, host.errors.join('\n')).toEqual([]);
    expect(guest.errors, guest.errors.join('\n')).toEqual([]);
    for (const ctx of [host.ctx, guest.ctx, kati, mart]) await ctx.close();
  });
});
