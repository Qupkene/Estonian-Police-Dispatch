import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Päeva väljakutse against the real PHP API (playwright.config.ts): the menu's daily panel (its Teenistus row
 * opens it and lights the area on the map, a second press starts it), a short daily run as a guest (plays,
 * never counts) and as an account (the first run counts on the day's board, a replay does not, nothing goes
 * to the normal leaderboard). DAILY_SHOTS=<dir> also saves screenshots of the panel, the board, the reports
 * and the panel at phone width there; for them a few other players are put on the board first and the
 * account's first run is played through (a simple dispatcher, see playDaily).
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
          weather: { kind: string };
          sectors?: string[];
          flags: Record<string, unknown>;
          stats: { incidents: number };
          calls: { id: string; incidentId: string; answeredAt?: number; endedAt?: number }[];
          incidents: Record<string, { truePriority?: number }>;
        };
        setSpeed: (i: number) => void;
        bump: () => void;
      };
    };
    engine: {
      step: (s: unknown, ms: number) => void;
      cmd: {
        answerCall: (s: unknown, id: string) => void;
        endCall: (s: unknown, id: string, o: { action: 'create'; priority: number }) => void;
        acknowledge: (s: unknown, id: string) => void;
        dispatchUnits: (s: unknown, id: string, units: string[]) => void;
      };
      sel: {
        queue: (s: unknown) => { id: string; state: string; assigned: unknown[] }[];
        recommendUnits: (s: unknown, id: string) => { unit: { id: string }; fit: string }[];
      };
    };
  };
};

const SHOTS = process.env.DAILY_SHOTS;
const NAME = `paev_${Date.now().toString(36)}`;
const PASS = 'Salajane-parool-2026';

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
          weather: s.weather.kind,
          sector: s.sectors?.[0] ?? '',
          daily: s.flags.daily,
        }
      : null;
  });
/** Today in Tallinn, as the game computes it. */
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Tallinn' }).format(new Date());

async function boot(page: Page) {
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
}

async function freshPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  return ctx.newPage();
}

/** The menu's Päeva väljakutse row. */
const dailyRow = (page: Page) => page.locator('[data-daily-row]');

/** Open the daily panel from its row (when it is not open yet). */
async function openDaily(page: Page) {
  const row = dailyRow(page);
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('daily-tile')).toBeVisible();
}

/**
 * Start the challenge from the menu's daily panel (`viaRow`: by pressing its row a second time), run the clock (paused, stepped through the console handle, so the
 * run does not depend on how busy the day's sector is) until the first incident, then end the shift early.
 * `autoplay`: play almost the whole shift instead, answering every call and sending the best unit.
 */
async function playDaily(page: Page, button: RegExp, autoplay = false, viaRow = false) {
  await openDaily(page);
  const start = page.getByTestId('daily-tile').getByRole('button', { name: button });
  await expect(start).toBeVisible();
  await (viaRow ? dailyRow(page) : start).click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('game');
  const info = await simInfo(page);
  const incidents = await page.evaluate((autoplay) => {
    const e = (window as unknown as EpdWindow).__epd;
    const { cmd, sel } = e.engine;
    const g = e.game.getState();
    g.setSpeed(0);
    const s = g.sim!;
    for (let m = 0; m < 170 && (autoplay || !s.stats.incidents); m++) {
      e.engine.step(s, 60_000);
      if (!autoplay) continue;
      for (const call of s.calls) {
        if (call.endedAt) continue;
        if (!call.answeredAt) cmd.answerCall(s, call.id);
        else
          cmd.endCall(s, call.id, {
            action: 'create',
            priority: s.incidents[call.incidentId]?.truePriority ?? 3,
          });
      }
      for (const inc of sel.queue(s)) {
        if (inc.state === 'incoming') cmd.acknowledge(s, inc.id);
        if (inc.assigned.length) continue;
        const r = sel.recommendUnits(s, inc.id).find((x) => x.fit === 'ideal' || x.fit === 'need');
        if (r) cmd.dispatchUnits(s, inc.id, [r.unit.id]);
      }
    }
    g.bump();
    return s.stats.incidents;
  }, autoplay);
  expect(incidents).toBeGreaterThan(0);
  await page.locator('.gm-top__menu').click();
  await page
    .getByRole('button', { name: /Lõpeta vahetus/ })
    .first()
    .click();
  await page.getByRole('button', { name: /Jah, lõpeta vahetus/ }).click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('report');
  return info;
}

/** Screenshot into DAILY_SHOTS once the page has settled (dialog and menu animations). */
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  // Finite animations (menu entry, dialog) done; endless ones (spinners, pulses) do not count.
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
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Other players' counted runs of today, so the board in the screenshots is not a single row. */
async function seedRivals(browser: Browser, run: NonNullable<Awaited<ReturnType<typeof simInfo>>>) {
  const rivals: [string, number, string][] = [
    ['Kati_K', 91, 'S'],
    ['mart.tamm', 84, 'A'],
    ['Liis', 77, 'B'],
    ['Rein77', 66, 'C'],
    ['Toomas_P', 48, 'D'],
  ];
  for (const [name, score, grade] of rivals) {
    const ctx = await browser.newContext();
    const headers = { 'X-EPD': '1' };
    const reg = await ctx.request.post('/api/register', { headers, data: { name, password: PASS } });
    if (reg.ok())
      await ctx.request.post('/api/daily', {
        headers,
        data: {
          day: today(),
          regionId: run.regionId,
          sector: run.sector,
          score,
          grade,
          incidents: 8 + (score % 7),
          arrests: score % 3,
        },
      });
    await ctx.close();
  }
}

async function toMenu(page: Page) {
  await page.getByRole('button', { name: 'Menüüsse' }).first().click();
  await expect.poll(() => screen(page)).toBe('menu');
}

test.describe.serial('daily challenge', () => {
  test.setTimeout(240_000);
  let guestRun: Awaited<ReturnType<typeof simInfo>> = null;

  test('the menu tile, and a guest run that plays but does not count', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    // The 2024 way in: a guest.
    await page.getByRole('tab', { name: 'Klassika' }).click();
    await page.locator('form.sh-legacy button[type="submit"]').click();
    await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('menu');

    // The panel is closed until its row is pressed: then it slides in, the area is lit on the map and the row
    // says that a second press starts it. Esc and its close button close it again.
    const tile = page.getByTestId('daily-tile');
    const row = dailyRow(page);
    const lit = page.locator('.vk-map.is-lit');
    await expect(tile).toBeHidden();
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(lit).toHaveCount(0);
    await row.click();
    await expect(tile).toBeVisible();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(row).toContainText('vajuta uuesti, et alustada');
    await expect(lit).toHaveCount(1);
    await expect(page.locator('.vk-map__lit')).toHaveCount(1);
    await expect(page.locator('.vk-legend')).toContainText('Väljakutse');
    await page.keyboard.press('Escape');
    await expect(tile).toBeHidden();
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(lit).toHaveCount(0);
    await row.click();
    await tile.getByRole('button', { name: 'Sulge' }).click();
    await expect(tile).toBeHidden();
    await expect(row).toBeFocused();
    // A click elsewhere in the menu closes it too.
    await row.click();
    await expect(tile).toBeVisible();
    await page.locator('.vk-car').click({ position: { x: 20, y: 20 } });
    await expect(tile).toBeHidden();
    await row.click();
    await expect(tile.getByRole('heading', { name: 'Päeva väljakutse' })).toBeVisible();
    await expect(tile.locator('.sh-daily__sector')).not.toBeEmpty();
    await expect(tile).toContainText(/Uus väljakutse (\d+ t )?\d+ min pärast/);
    await expect(tile).toContainText(/(Hommik|Pärastlõuna|Õhtu|Öö) \d\d:00-\d\d:00/);
    await expect(tile).toContainText('Tavaline, 3 tundi');
    await expect(page.getByTestId('daily-status')).toHaveText(/tulemus läheb arvesse ainult kontoga/);

    guestRun = await playDaily(page, /Alusta väljakutset/);
    expect(guestRun).toMatchObject({ mode: 'free', difficulty: 'normal', hours: 3, daily: today() });
    await expect(page.getByTestId('daily-rank')).toHaveText(/külalise tulemus ei lähe arvesse/);
    await expect(page.locator('.sh-head__sub')).toContainText('Päeva väljakutse');

    // Back in the menu: the guest's own result, and the next run is practice.
    await toMenu(page);
    await expect(page.getByTestId('daily-status')).toHaveText(
      /Sinu tulemus: \d+\/100 \([SABCDF]\)\. Arvesse läheb see ainult kontoga\./,
    );
    await expect(tile).toBeHidden();
    await openDaily(page);
    await expect(tile.getByRole('button', { name: /Harjuta uuesti/ })).toBeVisible();
    await expect(dailyRow(page)).toContainText('vajuta uuesti, et harjutada');
    if (SHOTS) {
      await page.setViewportSize({ width: 390, height: 844 });
      await openDaily(page);
      await shot(page, 'daily-mobile');
      await page.setViewportSize({ width: 1600, height: 900 });
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test("an account: the first run counts on the day's board, a replay does not", async ({ browser }) => {
    const page = await freshPage(browser);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/(score|daily)\b/.test(r.url()))
        posts.push(new URL(r.url()).pathname);
    });

    if (SHOTS && guestRun) await seedRivals(browser, guestRun);
    await boot(page);
    await page.getByRole('tab', { name: 'Klassika' }).click();
    await page.getByRole('button', { name: 'Pole veel kontot? Loo konto' }).click();
    await page.getByLabel('Kasutajanimi').fill(NAME);
    await page.getByLabel('Parool', { exact: true }).fill(PASS);
    await page.getByLabel('Korda parooli').fill(PASS);
    await page.locator('form.sh-legacy button[type="submit"]').click();
    await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('menu');
    const tile = page.getByTestId('daily-tile');
    await expect(page.getByTestId('daily-status')).toHaveText(
      /Keegi pole veel mänginud|Täna on mänginud \d+ mängija/,
    );
    await openDaily(page);
    await shot(page, 'daily-tile');

    // The same shift as the guest's: everyone plays the same challenge.
    const run = await playDaily(page, /Alusta väljakutset/, !!SHOTS);
    expect(run).toEqual(guestRun);
    await expect(page.getByTestId('daily-rank')).toHaveText(/^Päeva väljakutse: koht \d+\/\d+/, {
      timeout: 15_000,
    });
    expect(posts).toEqual(['/api/daily']);
    await shot(page, 'daily-report');
    const board = await (await page.request.get(`/api/daily?day=${today()}`)).json();
    expect(board.me).toMatchObject({ name: NAME, rank: expect.any(Number) });
    const scores = await (await page.request.get('/api/scores?limit=50')).json();
    expect(scores.scores.map((s: { name: string }) => s.name)).not.toContain(NAME);

    // The menu tile shows the result and place; another run is practice.
    await toMenu(page);
    await expect(page.getByTestId('daily-status')).toHaveText(
      /Sinu tulemus: \d+\/100 \([SABCDF]\), koht \d+\/\d+ Uus mäng on harjutus ega lähe arvesse\./,
    );
    await openDaily(page);
    await shot(page, 'daily-menu');

    // The board: today has our row, yesterday is another day.
    await tile.getByRole('button', { name: 'Edetabel' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Päeva väljakutse edetabel' })).toBeVisible();
    await expect(dialog.locator('.sh-lb__row.is-me')).toContainText(NAME);
    await shot(page, 'daily-board');
    await dialog.getByRole('radio', { name: 'Eile' }).click();
    await expect(dialog.locator('.sh-lb__row.is-me')).toHaveCount(0);
    await dialog.getByRole('radio', { name: 'Täna' }).click();
    await expect(dialog.locator('.sh-lb__row.is-me')).toContainText(NAME);
    await dialog.getByRole('button', { name: 'Sulge' }).last().click();
    await expect(dialog).toHaveCount(0);
    // The board's dialog did not close the panel under it.
    await expect(tile).toBeVisible();

    // A replay is sent too, but does not count: started with a second press on the menu row.
    await playDaily(page, /Harjuta uuesti/, false, true);
    await expect(page.getByTestId('daily-rank')).toHaveText(
      /^\s*Kordus ei läinud arvesse: kehtib päeva esimene tulemus\.\s*Päeva väljakutse: koht \d+\/\d+/,
      {
        timeout: 15_000,
      },
    );
    expect(posts).toEqual(['/api/daily', '/api/daily']);
    await shot(page, 'daily-replay');
    const again = await (await page.request.get(`/api/daily?day=${today()}`)).json();
    expect(again.me).toEqual(board.me);
    expect(errors, errors.join('\n')).toEqual([]);
    await page.context().close();
  });
});
