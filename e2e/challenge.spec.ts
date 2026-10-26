import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Väljakutse lingiga (docs/CHALLENGE.md, 2.38.0) against the real PHP API: one account plays a free shift and sends it
 * from the report as a link; a second player opens the link, signs up, takes the challenge, plays the same shift (same
 * seed, start and calls) and sees the two results side by side and the challenge's board. The run never reaches the
 * normal leaderboard. CHALLENGE_SHOTS=<dir> also saves screenshots of the sender's panel, the challenge dialog and the
 * comparison.
 */

type EpdWindow = Window & {
  __epd: {
    game: {
      getState: () => {
        screen: string;
        sim: null | { seed: number; startTime: number; flags: Record<string, unknown>; stats: { incidents: number } };
        startShift: (opts: unknown) => void;
        setSpeed: (i: number) => void;
        bump: () => void;
      };
    };
    engine: { step: (s: unknown, ms: number) => void };
  };
};

const SHOTS = process.env.CHALLENGE_SHOTS;
const STAMP = Date.now().toString(36);
const SENDER = `saatja_${STAMP}`;
const TAKER = `sober_${STAMP}`;
const PASS = 'Salajane-parool-2026';
const START = Date.UTC(2026, 9, 16, 11, 0);

const screen = (page: Page) => page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().screen);

async function signUp(page: Page, name: string) {
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
  await page.getByRole('tab', { name: 'Klassika' }).click();
  await page.getByRole('button', { name: 'Pole veel kontot? Loo konto' }).click();
  await page.getByLabel('Kasutajanimi').fill(name);
  await page.getByLabel('Parool', { exact: true }).fill(PASS);
  await page.getByLabel('Korda parooli').fill(PASS);
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('menu');
}

async function newPlayer(browser: Browser, path: string, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(path);
  await signUp(page, name);
  return { ctx, page, errors };
}

/** Run the paused clock to the first incident and a while on, then end the shift through the pause menu. */
async function playAndEnd(page: Page) {
  const incidents = await page.evaluate(() => {
    const e = (window as unknown as EpdWindow).__epd;
    const g = e.game.getState();
    g.setSpeed(0);
    const s = g.sim!;
    for (let m = 0; m < 170 && s.stats.incidents < 2; m++) e.engine.step(s, 60_000);
    g.bump();
    return s.stats.incidents;
  });
  expect(incidents).toBeGreaterThan(0);
  await page.locator('.gm-top__menu').click();
  await page.getByRole('button', { name: /Lõpeta vahetus/ }).first().click();
  await page.getByRole('button', { name: /Jah, lõpeta vahetus/ }).click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('report');
}

test('a free shift sent as a link is played the same by a friend, and the results are side by side', async ({ browser }) => {
  // The sender plays a free shift (fixed schedule, as the briefing starts it) and sends it.
  const a = await newPlayer(browser, '/', SENDER);
  await a.page.evaluate(
    ({ start, name }) =>
      (window as unknown as EpdWindow).__epd.game.getState().startShift({
        seed: 424299,
        regionId: 'pohja',
        mode: 'free',
        difficulty: 'normal',
        start,
        hours: 4,
        playerName: name,
        weather: 'rain',
        fixedSchedule: true,
      }),
    { start: START, name: SENDER },
  );
  await expect.poll(() => screen(a.page), { timeout: 20_000 }).toBe('game');
  await playAndEnd(a.page);
  const send = a.page.getByTestId('challenge-send');
  await expect(send).toBeVisible();
  await send.getByTestId('challenge-send-go').click();
  const link = a.page.getByTestId('challenge-link');
  await expect(link).toHaveValue(/\/v\/[A-HJ-NP-Z2-9]{6}$/, { timeout: 15_000 });
  await expect(send).toContainText('Kas teed paremini?');
  const url = await link.inputValue();
  const code = url.slice(-6);
  if (SHOTS) await send.screenshot({ path: `${SHOTS}/challenge-send.png` });

  // The friend opens the link: after signing up, the challenge is there.
  const b = await newPlayer(browser, `/v/${code}`, TAKER);
  const modal = b.page.getByTestId('challenge-modal');
  await expect(modal).toBeVisible({ timeout: 15_000 });
  await expect(modal).toContainText(`${SENDER} kutsub sind väljakutsele`);
  await expect(modal).toContainText('Põhja prefektuur');
  await expect(b.page.getByTestId('challenge-board')).toContainText(SENDER);
  expect(new URL(b.page.url()).pathname).toBe('/');
  if (SHOTS) await b.page.screenshot({ path: `${SHOTS}/challenge-modal.png` });
  await b.page.getByTestId('challenge-accept').click();
  await expect.poll(() => screen(b.page), { timeout: 20_000 }).toBe('game');
  const run = await b.page.evaluate(() => {
    const s = (window as unknown as EpdWindow).__epd.game.getState().sim!;
    return { seed: s.seed, start: s.startTime, challenge: s.flags.challenge };
  });
  expect(run).toEqual({ seed: 424299, start: START, challenge: code });
  await playAndEnd(b.page);

  // Side by side, and on the board.
  const panel = b.page.getByTestId('challenge-report');
  await expect(panel.getByTestId('challenge-compare')).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByTestId('challenge-compare')).toContainText(SENDER);
  await expect(panel.getByTestId('challenge-verdict')).toBeVisible();
  await expect(panel).toContainText('Sinu koht väljakutses');
  await expect(panel.getByTestId('challenge-board')).toContainText(TAKER);
  if (SHOTS) await panel.screenshot({ path: `${SHOTS}/challenge-report.png` });
  // The challenge run never goes to the normal leaderboard; the challenge has both runs.
  const board = await b.ctx.request.get(`/api/challenges/${code}`);
  expect((await board.json()).challenge.players).toBe(2);
  const scores = await (await b.ctx.request.get('/api/scores?regionId=pohja&limit=50')).json();
  expect(JSON.stringify(scores)).not.toContain(TAKER);

  // The sender finds it in the multiplayer menu with both runs.
  await a.page.getByRole('button', { name: /Menüüsse|Peamenüü/ }).first().click();
  await expect.poll(() => screen(a.page)).toBe('menu');
  await a.page.getByRole('button', { name: /Mitmikmäng/ }).first().click();
  await expect.poll(() => screen(a.page)).toBe('lobby');
  await expect(a.page.getByTestId('challenge-list')).toContainText('2 mängijat');

  expect(a.errors, a.errors.join('\n')).toEqual([]);
  expect(b.errors, b.errors.join('\n')).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});
