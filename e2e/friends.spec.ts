import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Sõbrad (docs/MULTIPLAYER.md section 18, 2.40.0) against the real PHP API: one account adds another by user name on
 * the multiplayer screen; the other gets the request as a notice in the menu and accepts it there. They see each other
 * online and what they do (the menu, a shift). The first creates a room and invites the friend from the lobby; the
 * friend's menu shows the invitation and one click puts them in that room's lobby. A challenge sent from a report goes
 * straight to the friend, whose notice opens it. A third player's request put off with "Hiljem" stays off after a
 * reload and is declined in the panel. FRIENDS_SHOTS=<dir> saves screenshots of the panel, the notices, the lobby's
 * invitation and the challenge sent to a friend.
 */

type EpdWindow = Window & {
  __epd: {
    game: {
      getState: () => {
        screen: string;
        sim: null | { stats: { incidents: number } };
        startShift: (opts: unknown) => void;
        setSpeed: (i: number) => void;
        bump: () => void;
      };
    };
    engine: { step: (s: unknown, ms: number) => void };
    friends: { poke: () => void };
  };
};

const SHOTS = process.env.FRIENDS_SHOTS;
const STAMP = Date.now().toString(36);
const LIIS = `liis_${STAMP}`;
const MART = `mart_${STAMP}`;
const NORA = `nora_${STAMP}`;
const PASS = 'Salajane-parool-2026';
const H = { 'X-EPD': '1' };

const screen = (page: Page) =>
  page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().screen);
/** Say it is here at once, instead of waiting for the next presence call (20 seconds). */
const poke = (page: Page) => page.evaluate(() => (window as unknown as EpdWindow).__epd.friends.poke());

async function register(browser: Browser, name: string, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
  await page.getByRole('tab', { name: 'Klassika' }).click();
  await page.getByRole('button', { name: 'Pole veel kontot? Loo konto' }).click();
  await page.getByLabel('Kasutajanimi').fill(name);
  await page.getByLabel('Parool', { exact: true }).fill(PASS);
  await page.getByLabel('Korda parooli').fill(PASS);
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('menu');
  return { ctx, page, errors };
}

async function openRooms(page: Page) {
  await page
    .getByRole('button', { name: /Mitmikmäng/ })
    .first()
    .click();
  await expect.poll(() => screen(page)).toBe('lobby');
}

/** Poke until the notice of `kind` is there (the presence call brings it). */
async function noticeOf(page: Page, kind: string) {
  const notice = page.getByTestId('friend-notice');
  await expect
    .poll(
      async () => {
        await poke(page);
        return notice.getAttribute('data-kind', { timeout: 1000 }).catch(() => null);
      },
      { timeout: 15_000, intervals: [500, 1000, 1500] },
    )
    .toBe(kind);
  // It has faded in.
  await page.waitForTimeout(300);
  return notice;
}

test('friends by user name: a request accepted from the menu, who is online, a room invitation joined in one click, a challenge sent to a friend', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const a = await register(browser, LIIS);
  // Mart is on a phone.
  const b = await register(browser, MART, { width: 390, height: 844 });

  // Liis adds Mart by his user name on the multiplayer screen.
  await openRooms(a.page);
  const panel = a.page.getByTestId('friends');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Sul ei ole veel sõpru');
  await panel.getByTestId('friend-name').fill(MART);
  await panel.getByTestId('friend-add').click();
  await expect(panel.getByTestId('friend-note')).toContainText(`Sõbrakutse saadetud: ${MART}`);
  await expect(panel.getByTestId('friends-asked')).toContainText(MART);
  // A name nobody has, and one's own.
  await panel.getByTestId('friend-name').fill(`keegi_${STAMP}`);
  await panel.getByTestId('friend-add').click();
  await expect(panel.getByTestId('friend-note')).toContainText('Sellise kasutajanimega mängijat ei ole');
  await panel.getByTestId('friend-name').fill(LIIS);
  await panel.getByTestId('friend-add').click();
  await expect(panel.getByTestId('friend-note')).toContainText('Iseennast ei saa sõbraks lisada');

  // Mart's menu brings the request; he accepts it there.
  const ask = await noticeOf(b.page, 'ask');
  await expect(ask).toContainText(`${LIIS} soovib sinuga sõbraks saada`);
  if (SHOTS) await b.page.screenshot({ path: `${SHOTS}/friends-notice-ask.png` });
  await ask.getByTestId('friend-notice-yes').click();
  await expect(b.page.getByTestId('friend-notice')).toBeHidden();

  // Liis sees him online, in the menu.
  const martRow = panel.locator(`[data-testid="friend"][data-name="${MART}"]`);
  await expect
    .poll(
      async () => {
        await poke(a.page);
        return martRow
          .getByTestId('friend-what')
          .innerText({ timeout: 1000 })
          .catch(() => '');
      },
      { timeout: 15_000 },
    )
    .toBe('Menüüs');
  await expect(martRow).toHaveClass(/is-on/);
  await expect(panel.getByTestId('friends-online')).toHaveText('1 võrgus');
  // His menu row says so too.
  await expect(b.page.getByRole('button', { name: /Mitmikmäng/ }).first()).toContainText('1 sõber võrgus');

  // Liis creates a room and invites him from the lobby.
  await panel.page().getByRole('button', { name: 'Loo ruum' }).click();
  await expect(a.page.getByTestId('room')).toBeVisible({ timeout: 15_000 });
  const code = (await a.page.getByTestId('room-code').innerText()).replace(/\s/g, '');
  const invitePanel = a.page.getByTestId('friends');
  await expect(invitePanel).toContainText('Kutsu sõpru');
  const invRow = invitePanel.locator(`[data-testid="friend"][data-name="${MART}"]`);
  await invRow.getByTestId('friend-invite').click();
  await expect(invRow.getByTestId('friend-invited')).toBeVisible();
  if (SHOTS) await a.page.screenshot({ path: `${SHOTS}/friends-lobby-invite.png` });

  // Mart's menu brings the invitation: one click and he is in that room's lobby.
  const inv = await noticeOf(b.page, 'room');
  await expect(inv).toContainText(`${LIIS} kutsub sind oma ruumi`);
  await expect(inv).toContainText('Võistlus · Põhja · 1/4 mängijat');
  if (SHOTS) await b.page.screenshot({ path: `${SHOTS}/friends-notice-room.png` });
  await inv.getByTestId('friend-notice-yes').click();
  await expect.poll(() => screen(b.page), { timeout: 15_000 }).toBe('lobby');
  await expect(b.page.getByTestId('room')).toBeVisible({ timeout: 15_000 });
  expect((await b.page.getByTestId('room-code').innerText()).replace(/\s/g, '')).toBe(code);
  await expect(a.page.getByTestId('room-seats')).toContainText(MART, { timeout: 15_000 });
  // In his lobby she is marked as in the room already.
  await expect(b.page.locator(`[data-testid="friend"][data-name="${LIIS}"]`)).toContainText('Ruumis');

  // Liis plays a free shift; Mart, in the lobby, sees her on shift.
  await a.page.evaluate(() =>
    (window as unknown as EpdWindow).__epd.game.getState().startShift({
      seed: 404040,
      regionId: 'pohja',
      mode: 'free',
      difficulty: 'normal',
      start: Date.UTC(2026, 9, 24, 12, 0),
      hours: 3,
      playerName: 'Liis',
      weather: 'clear',
      fixedSchedule: true,
    }),
  );
  await expect.poll(() => screen(a.page), { timeout: 20_000 }).toBe('game');
  const liisRow = b.page.locator(`[data-testid="friend"][data-name="${LIIS}"]`);
  await expect
    .poll(
      async () => {
        await poke(a.page);
        await poke(b.page);
        return liisRow
          .getByTestId('friend-what')
          .innerText({ timeout: 1000 })
          .catch(() => '');
      },
      { timeout: 20_000, intervals: [1000, 1500, 2000] },
    )
    .toBe('Vahetuses');

  // She ends it and sends the challenge straight to Mart.
  const incidents = await a.page.evaluate(() => {
    const e = (window as unknown as EpdWindow).__epd;
    const g = e.game.getState();
    g.setSpeed(0);
    const s = g.sim!;
    for (let m = 0; m < 170 && s.stats.incidents < 2; m++) e.engine.step(s, 60_000);
    g.bump();
    return s.stats.incidents;
  });
  expect(incidents).toBeGreaterThan(0);
  await a.page.locator('.gm-top__menu').click();
  await a.page
    .getByRole('button', { name: /Lõpeta vahetus/ })
    .first()
    .click();
  await a.page.getByRole('button', { name: /Jah, lõpeta vahetus/ }).click();
  await expect.poll(() => screen(a.page), { timeout: 20_000 }).toBe('report');
  const send = a.page.getByTestId('challenge-send');
  await send.getByTestId('challenge-send-go').click();
  await expect(a.page.getByTestId('challenge-link')).toHaveValue(/\/v\/[A-HJ-NP-Z2-9]{6}$/, {
    timeout: 15_000,
  });
  const picker = send.getByTestId('friend-picker');
  await expect(picker).toContainText(MART);
  await picker.getByTestId('friend-send').click();
  await expect(picker.getByTestId('friend-sent')).toBeVisible();
  if (SHOTS) await send.screenshot({ path: `${SHOTS}/friends-challenge-send.png` });

  // Mart's lobby brings it; the notice opens the challenge.
  const ch = await noticeOf(b.page, 'challenge');
  await expect(ch).toContainText(`${LIIS} saatis sulle väljakutse`);
  await expect(ch).toContainText('Põhja');
  if (SHOTS) await b.page.screenshot({ path: `${SHOTS}/friends-notice-challenge.png` });
  await ch.getByTestId('friend-notice-yes').click();
  const modal = b.page.getByTestId('challenge-modal');
  await expect(modal).toBeVisible({ timeout: 15_000 });
  await expect(modal).toContainText(`${LIIS} kutsub sind väljakutsele`);

  // A third player asks Liis; "Hiljem" puts the notice off, also after a reload; she declines in the panel.
  const c = await browser.newContext();
  expect(
    (await c.request.post('/api/register', { headers: H, data: { name: NORA, password: PASS } })).ok(),
  ).toBe(true);
  expect((await c.request.post('/api/friends', { headers: H, data: { name: LIIS } })).ok()).toBe(true);
  const nora = await noticeOf(a.page, 'ask');
  await expect(nora).toContainText(`${NORA} soovib sinuga sõbraks saada`);
  await nora.getByTestId('friend-notice-later').click();
  await expect(a.page.getByTestId('friend-notice')).toBeHidden();
  await a.page.reload();
  await a.page.keyboard.press('Space');
  await a.page.getByRole('button', { name: 'Jätka', exact: true }).click({ timeout: 20_000 });
  await expect.poll(() => screen(a.page), { timeout: 20_000 }).toBe('menu');
  await expect(a.page.getByRole('button', { name: /Mitmikmäng/ }).first()).toContainText('1 kutse ootab', {
    timeout: 15_000,
  });
  await expect(a.page.getByTestId('friend-notice')).toBeHidden();
  await openRooms(a.page);
  const asking = a.page.getByTestId('friends-asking');
  await expect(asking).toContainText(NORA);
  if (SHOTS) await a.page.getByTestId('friends').screenshot({ path: `${SHOTS}/friends-panel.png` });
  await asking.getByRole('button', { name: 'Keeldu' }).click();
  await expect(a.page.getByTestId('friends-asking')).toBeHidden();
  const theirs = await (await c.request.get('/api/friends')).json();
  expect(theirs.asked).toEqual([]);

  expect(a.errors, a.errors.join('\n')).toEqual([]);
  expect(b.errors, b.errors.join('\n')).toEqual([]);
  await Promise.all([a.ctx.close(), b.ctx.close(), c.close()]);
});
