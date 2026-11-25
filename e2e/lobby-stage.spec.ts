import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Juhtimiskeskuse saal (docs/MULTIPLAYER.md section 19) against the real PHP API: the multiplayer screen's 3D control
 * room draws, and says what it shows through the stage's data attributes. A guest's room is in standby with four dark
 * consoles; the create page lights four and follows the mode chosen; a room seats exactly its players, on both
 * players' screens, and a phone gets the room as a band above the panels. The stage is decoration: hidden from
 * screen readers, with nothing to focus. STAGE_SHOTS=<dir> saves screenshots of each.
 */

type EpdWindow = Window & {
  __epd: { game: { getState: () => { screen: string } } };
};

const SHOTS = process.env.STAGE_SHOTS;
const STAMP = Date.now().toString(36);
const HOST = `saal_${STAMP}`;
const GUEST = `pult_${STAMP}`;
const PASS = 'Salajane-parool-2026';

const screen = (page: Page) =>
  page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().screen);

async function boot(page: Page) {
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
}

async function register(browser: Browser, name: string, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
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

async function openRooms(page: Page) {
  await page
    .getByRole('button', { name: /Mitmikmäng/ })
    .first()
    .click();
  await expect.poll(() => screen(page)).toBe('lobby');
}

const stage = (page: Page) => page.getByTestId('lobby-stage');

/** The room has drawn: its chunk came, the canvas is on the stage and the first frame is on it. */
async function drawn(page: Page) {
  await expect(stage(page)).toHaveAttribute('data-mode', '3d', { timeout: 30_000 });
  await expect(stage(page)).toHaveAttribute('data-drawn', 'true', { timeout: 30_000 });
  await expect(stage(page).locator('canvas.vk-stage__canvas')).toHaveCount(1);
  const size = await stage(page)
    .locator('canvas.vk-stage__canvas')
    .evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height, box: c.getBoundingClientRect().width }));
  expect(size.w).toBeGreaterThan(100);
  expect(size.h).toBeGreaterThan(100);
  expect(size.box).toBeGreaterThan(100);
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

test.describe.serial('the lobby stage', () => {
  test.setTimeout(240_000);

  test('a guest sees the room in standby, as decoration', async ({ page }) => {
    const three: string[] = [];
    page.on('request', (r) => {
      if (/assets\/(three|lobby3d)-/.test(r.url())) three.push(r.url());
    });
    // Every WebGL draw call is counted: a still room draws nothing while nothing changes.
    await page.addInitScript(() => {
      const w = window as unknown as { __draws: number };
      w.__draws = 0;
      for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
        for (const f of ['drawElements', 'drawArrays'] as const) {
          const orig = C.prototype[f] as (...a: unknown[]) => void;
          (C.prototype as unknown as Record<string, unknown>)[f] = function (this: unknown, ...a: unknown[]) {
            w.__draws++;
            return orig.apply(this, a);
          };
        }
      }
    });
    await boot(page);
    await page.getByRole('button', { name: 'Jätka külalisena' }).click();
    await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('menu');
    // Nothing of the room or of three.js is fetched before the multiplayer screen opens.
    expect(three).toEqual([]);
    await openRooms(page);
    await expect(page.getByTestId('rooms-guest')).toBeVisible();
    await drawn(page);
    expect(three.some((u) => /lobby3d-/.test(u))).toBe(true);
    expect(three.some((u) => /three-/.test(u))).toBe(true);
    await expect(stage(page)).toHaveAttribute('data-phase', 'standby');
    await expect(stage(page)).toHaveAttribute('data-seats', 'dark,dark,dark,dark');
    // The test's browser draws without a graphics card (SwiftShader): the room knows it and stays still, so that it
    // keeps no processor core busy (a player whose browser blocks the card would get the same).
    await expect(stage(page)).toHaveAttribute('data-still', 'true');
    const draws = () => page.evaluate(() => (window as unknown as { __draws: number }).__draws);
    await page.waitForTimeout(1000);
    const before = await draws();
    await page.waitForTimeout(3000);
    expect(await draws()).toBe(before);
    await expect(stage(page)).toHaveAttribute('aria-hidden', 'true');
    expect(await stage(page).locator('button, a, input, select, [tabindex]').count()).toBe(0);
    await shot(page, 'stage-guest-1600');
    // The sign-in notice is still the way on.
    await page.getByTestId('rooms-guest').getByRole('button', { name: 'Logi sisse' }).click();
    await expect.poll(() => screen(page)).toBe('login');
  });

  test('the create page follows the form, and a room seats its players on both screens', async ({
    browser,
  }) => {
    const host = await register(browser, HOST);
    const guest = await register(browser, GUEST, { width: 390, height: 844 });

    // The create page: four consoles lit, the first one the player's; the mode chosen arranges the room.
    await openRooms(host.page);
    await drawn(host.page);
    await expect(stage(host.page)).toHaveAttribute('data-phase', 'create');
    await expect(stage(host.page)).toHaveAttribute('data-seats', 'invite,open,open,open');
    await expect(stage(host.page)).toHaveAttribute('data-room-mode', 'race');
    await shot(host.page, 'stage-create-race-1440');
    await host.page.getByRole('radio', { name: /Rollid/ }).click();
    await expect(stage(host.page)).toHaveAttribute('data-room-mode', 'role');
    await host.page.getByRole('radio', { name: /Sektorid/ }).click();
    await expect(stage(host.page)).toHaveAttribute('data-room-mode', 'sector');
    await shot(host.page, 'stage-create-sector-1440');
    await host.page.getByRole('radio', { name: /Võistlus/ }).click();
    await expect(stage(host.page)).toHaveAttribute('data-room-mode', 'race');

    // On a wide screen the room is the page's background and the panels stand at its sides, clear of its middle.
    const layout = await host.page.evaluate(() => {
      const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const st = rect('[data-testid="lobby-stage"]');
      const cols = [...document.querySelectorAll('.vk-mp > .vk-panel, .vk-mp > .vk-mp__col')].map((e) =>
        e.getBoundingClientRect(),
      );
      const win = rect('.vk-mp__window');
      return {
        stage: { w: st.width, h: st.height },
        view: { w: window.innerWidth, h: window.innerHeight },
        left: cols[0].right,
        right: cols[1].left,
        window: { left: win.left, right: win.right },
      };
    });
    expect(layout.stage).toEqual(layout.view);
    expect(layout.window.left).toBeGreaterThanOrEqual(layout.left);
    expect(layout.window.right).toBeLessThanOrEqual(layout.right);
    expect(layout.window.right - layout.window.left).toBeGreaterThan(400);

    // The room: one player seated, three seats free.
    await host.page.getByRole('button', { name: 'Loo ruum' }).click();
    const code = ((await host.page.getByTestId('room-code').textContent()) ?? '').replace(/\s/g, '');
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    await expect(stage(host.page)).toHaveAttribute('data-phase', 'lobby');
    await expect(stage(host.page)).toHaveAttribute('data-seats', 'seated,free,free,free');
    await shot(host.page, 'stage-room-1-1440');

    // The second player joins on a phone: both stages seat the two players the seats list names.
    await openRooms(guest.page);
    await drawn(guest.page);
    await guest.page.getByLabel('Ruumi kood').fill(code);
    await guest.page.getByRole('button', { name: 'Liitu', exact: true }).click();
    await expect(guest.page.getByTestId('room-seats')).toContainText(HOST);
    await expect(host.page.getByTestId('room-seats')).toContainText(GUEST, { timeout: 10_000 });
    for (const p of [host.page, guest.page]) {
      await expect(stage(p)).toHaveAttribute('data-phase', 'lobby');
      await expect(stage(p)).toHaveAttribute('data-seats', 'seated,seated,free,free', { timeout: 10_000 });
      const taken = await p.getByTestId('room-seats').locator('li:not(.is-free)').count();
      const seats = ((await stage(p).getAttribute('data-seats')) ?? '').split(',');
      expect(seats.filter((s) => s === 'seated')).toHaveLength(taken);
      expect(seats).toHaveLength(await p.getByTestId('room-seats').locator('li').count());
      await drawn(p);
    }
    await shot(host.page, 'stage-room-2-1440');
    await shot(guest.page, 'stage-room-2-390');

    // On the phone the room is a band above the panels, as wide as the screen.
    const band = await guest.page.evaluate(() => {
      const st = document.querySelector('[data-testid="lobby-stage"]')!.getBoundingClientRect();
      const panel = document.querySelector('[data-testid="room"] .vk-panel')!.getBoundingClientRect();
      return { w: st.width, h: st.height, bottom: st.bottom, panelTop: panel.top, vw: window.innerWidth };
    });
    expect(band.w).toBe(band.vw);
    expect(band.h).toBeGreaterThanOrEqual(200);
    expect(band.h).toBeLessThanOrEqual(240);
    expect(band.panelTop).toBeGreaterThanOrEqual(band.bottom);

    // The second player leaves: their console is free again on the host's screen.
    await guest.page.getByRole('button', { name: 'Lahku ruumist' }).click();
    await expect(stage(guest.page)).toHaveAttribute('data-phase', 'create', { timeout: 10_000 });
    await expect(stage(host.page)).toHaveAttribute('data-seats', 'seated,free,free,free', {
      timeout: 10_000,
    });

    expect(host.errors).toEqual([]);
    expect(guest.errors).toEqual([]);
    await host.ctx.close();
    await guest.ctx.close();
  });
});
