import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Ühisvahetus (role co-op, docs/MULTIPLAYER.md) against the real PHP API: two accounts in two browser contexts make a
 * Rollid room, pick their desks (the host dispatches, the guest takes the calls) and play one shared shift over the
 * game server (docs/MULTIPLAYER.md section 9; Playwright starts it). The call-taker answers 112 through the call card,
 * the dispatcher acknowledges and sends crews from the queue; each desk sees only its own controls; text messages go
 * between the seats. Both clients keep the same state digest; a click is answered within a fraction of a second; the
 * guest leaves and rejoins mid-shift; the host ends the shift for both and the two reports match, with per-seat
 * counters. Then both go back to the room, which opens for a second round with their desks; the host starts a new
 * shared shift and ends it at once; the host goes back to the room while the guest sends nothing, the host ends the
 * round there, and the guest's late report is turned away (round over) and leads into the lobby of the third round
 * too. Without the game server the same test plays the lockstep fallback, and checks its resync instead.
 * MP_SHOTS=<dir> saves screenshots (lobby with modes and roles, call-taker and dispatcher views, the report).
 */

type Hash = { turn: number; hash: string };
type EpdWindow = Window & {
  __epd: {
    game: {
      getState: () => {
        screen: string;
        speedIndex: number;
        sim: null | {
          seed: number;
          startTime: number;
          regionId: string;
          trust: number;
          ended: boolean;
          coop?: {
            turn: number;
            speed: number;
            seats: { seat: number; role: string; present: boolean }[];
            stats: Record<string, Record<string, number>>;
          };
        };
        report: null | { score: number; grade: string; stats: Record<string, unknown>; coop?: unknown };
      };
    };
    coop: {
      state: { getState: () => { status: string; seat: number; isHost: boolean; resyncs: number } };
      debug: () => null | { hashes: Hash[]; lastId?: number; engine?: string; trips?: number[] };
    };
  };
};

const SHOTS = process.env.MP_SHOTS;
const STAMP = Date.now().toString(36);
const HOST = `valve_${STAMP}`;
const GUEST = `kone_${STAMP}`;
const PASS = 'Salajane-parool-2026';

const screen = (page: Page) =>
  page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().screen);
const coopState = (page: Page) =>
  page.evaluate(() => (window as unknown as EpdWindow).__epd.coop.state.getState());
const hashes = (page: Page) =>
  page.evaluate(() => (window as unknown as EpdWindow).__epd.coop.debug()?.hashes ?? []);
const coopSim = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as EpdWindow).__epd.game.getState().sim;
    return s
      ? {
          seed: s.seed,
          start: s.startTime,
          region: s.regionId,
          seats: s.coop?.seats,
          turn: s.coop?.turn ?? -1,
          speed: s.coop?.speed,
        }
      : null;
  });

async function boot(page: Page) {
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
}

async function register(browser: Browser, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

/** The latest turn both clients computed a digest for, with both digests. */
async function commonDigest(
  a: Page,
  b: Page,
  after = -1,
): Promise<{ turn: number; a: string; b: string } | null> {
  const [ha, hb] = await Promise.all([hashes(a), hashes(b)]);
  const mb = new Map(hb.map((h) => [h.turn, h.hash]));
  const both = ha.filter((h) => h.turn > after && mb.has(h.turn));
  const last = both[both.length - 1];
  return last ? { turn: last.turn, a: last.hash, b: mb.get(last.turn)! } : null;
}

async function expectInSync(a: Page, b: Page, after = -1): Promise<number> {
  let found: { turn: number; a: string; b: string } | null = null;
  await expect
    .poll(
      async () => {
        found = await commonDigest(a, b, after);
        return found !== null;
      },
      { timeout: 45_000 },
    )
    .toBe(true);
  const f = found as unknown as { turn: number; a: string; b: string };
  expect(f.b, `digest at turn ${f.turn}`).toBe(f.a);
  return f.turn;
}

test.describe.serial('role co-op', () => {
  test.setTimeout(480_000);

  test('a call-taker and a dispatcher share one shift and get the same report', async ({ browser }) => {
    const host = await register(browser, HOST);
    const guest = await register(browser, GUEST);

    // The host makes a Rollid room: the whole Põhja prefecture, 6 hours (the clock runs 60x in the test).
    await openRooms(host.page);
    const modes = host.page.getByRole('radiogroup', { name: 'Režiim' });
    await expect(modes.getByRole('radio')).toHaveText([/Võistlus/, /Rollid/, /Sektorid/]);
    await expect(modes.getByRole('radio', { name: /Sektorid/ })).toBeEnabled();
    await modes.getByRole('radio', { name: /Rollid/ }).click();
    await host.page.getByLabel('Ala').selectOption('');
    await host.page.getByRole('radio', { name: '6 h' }).click();
    await shot(host.page, 'lobby-modes');
    await host.page.getByRole('button', { name: 'Loo ruum' }).click();
    const code = ((await host.page.getByTestId('room-code').textContent()) ?? '').replace(/\s/g, '');
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    await openRooms(guest.page);
    await guest.page.getByLabel('Ruumi kood').fill(code);
    await guest.page.getByRole('button', { name: 'Liitu', exact: true }).click();
    // Seat defaults: the host dispatches, the second player takes the calls. The guest tries the radio desk and back.
    const picker = guest.page.getByTestId('role-picker');
    await expect(picker.getByRole('radio', { name: /Kõnevastuvõtja/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await picker.getByRole('radio', { name: /Raadio ja registrid/ }).click();
    await expect(host.page.getByTestId('seat-role')).toHaveText(['Dispetšer', 'Raadio ja registrid'], {
      timeout: 10_000,
    });
    await expect(picker.getByRole('radio', { name: /Raadio ja registrid/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(guest.page.getByTestId('role-hint')).toContainText('kõned võtab vastu dispetšer');
    await picker.getByRole('radio', { name: /Kõnevastuvõtja/ }).click();
    await expect(host.page.getByTestId('seat-role')).toHaveText(['Dispetšer', 'Kõnevastuvõtja'], {
      timeout: 10_000,
    });
    await guest.page.getByRole('button', { name: 'Olen valmis' }).click();
    await expect(host.page.getByTestId('room-block')).toContainText('Kõik on valmis', { timeout: 10_000 });
    await shot(host.page, 'lobby-roles');
    await host.page.getByRole('button', { name: 'Alusta vahetust' }).click();

    // Both go on the shared shift: the same world, the same seats, live on the room's log.
    await expect.poll(() => screen(host.page), { timeout: 30_000 }).toBe('game');
    await expect.poll(() => screen(guest.page), { timeout: 30_000 }).toBe('game');
    for (const p of [host.page, guest.page])
      await expect(p.getByTestId('coop-status')).toHaveText('Ühendatud', { timeout: 30_000 });
    // "Ühendatud" can show a moment before the first turn (the setup) is played.
    for (const p of [host.page, guest.page])
      await expect
        .poll(async () => (await coopSim(p))?.turn ?? -1, { timeout: 15_000 })
        .toBeGreaterThanOrEqual(0);
    const a = await coopSim(host.page);
    const b = await coopSim(guest.page);
    expect({ ...a, turn: 0 }).toEqual({ ...b, turn: 0 });
    expect(a!.seats).toEqual([
      { seat: 0, role: 'dispatch', name: HOST, present: true },
      { seat: 1, role: 'calls', name: GUEST, present: true },
    ]);
    expect((await coopState(host.page)).isHost).toBe(true);
    expect((await coopState(guest.page)).isHost).toBe(false);

    // Speed is the host's: 4x (60 game seconds a second) for everybody; the guest's buttons are locked.
    await expect(guest.page.getByRole('button', { name: '4×' })).toBeDisabled();
    await host.page.getByRole('button', { name: '4×' }).click();
    await expect.poll(async () => (await coopSim(guest.page))?.speed, { timeout: 10_000 }).toBe(3);

    // A text message between the desks.
    await guest.page.getByTestId('coop-ping-input').fill('Võtan 112 kõned');
    await guest.page.getByTestId('coop-ping-input').press('Enter');
    await expect(host.page.getByTestId('coop-pings')).toContainText(`${GUEST}: Võtan 112 kõned`, {
      timeout: 10_000,
    });

    // Play: the call-taker answers, asks and creates; the dispatcher accepts and sends. Each desk only sees its own.
    let calls = 0;
    let sent = 0;
    let shotCall = false;
    let shotDispatch = false;
    const t0 = Date.now();
    let lastLog = 0;
    while (Date.now() - t0 < 120_000 && !(calls >= 1 && sent >= 2 && Date.now() - t0 > 30_000)) {
      if (process.env.COOP_DEBUG && Date.now() - lastLog > 5000) {
        lastLog = Date.now();
        for (const [n, p] of [
          ['host', host.page],
          ['guest', guest.page],
        ] as const) {
          const d = await p.evaluate(() => {
            const e = (window as unknown as EpdWindow).__epd;
            const s = e.game.getState().sim as unknown as {
              now: number;
              calls: { endedAt?: number }[];
              coop: { turn: number; speed: number };
            };
            return {
              now: new Date(s.now).toISOString().slice(11, 19),
              turn: s.coop.turn,
              speed: s.coop.speed,
              calls: s.calls.filter((c) => !c.endedAt).length,
              st: e.coop.state.getState(),
              dbg: e.coop.debug(),
            };
          });
          console.log(
            n,
            JSON.stringify({ ...d, dbg: { ...d.dbg, hashes: undefined } }),
            'calls',
            calls,
            'sent',
            sent,
          );
        }
      }
      // Kõnevastuvõtja.
      const answer = guest.page.locator('.tl-call__answer');
      if (await answer.isVisible().catch(() => false)) {
        await answer.click({ timeout: 2000 }).catch(() => {});
      } else if (
        await guest.page
          .locator('.tl-call:not(.is-ringing)')
          .isVisible()
          .catch(() => false)
      ) {
        for (const q of ['Kus te asute', 'Mis juhtus']) {
          const btn = guest.page.getByRole('button', { name: new RegExp(q) });
          if (await btn.isEnabled({ timeout: 1000 }).catch(() => false))
            await btn.click({ timeout: 2000 }).catch(() => {});
        }
        if (!shotCall) {
          shotCall = true;
          await shot(guest.page, 'calltaker-view');
          if (
            await host.page
              .getByTestId('coop-call-strip')
              .isVisible()
              .catch(() => false)
          ) {
            shotDispatch = true;
            await shot(host.page, 'dispatcher-view');
          }
        }
        const asked = await guest.page.locator('.tl-q.is-asked').count();
        if (asked >= 2) {
          await guest.page
            .locator('.tl-prio-btn--2')
            .click({ timeout: 2000 })
            .catch(() => {});
          const create = guest.page.getByRole('button', { name: 'Loo sündmus' });
          if (await create.isEnabled({ timeout: 1000 }).catch(() => false)) {
            await create.click({ timeout: 2000 }).catch(() => {});
            calls++;
          }
        }
      }
      // The dispatcher never gets the call card, only the strip.
      expect(await host.page.locator('.tl-call').count()).toBe(0);
      // Dispetšer.
      const accept = host.page
        .locator('.gm-card__actions')
        .getByRole('button', { name: /Võta vastu/ })
        .first();
      if (await accept.isVisible().catch(() => false)) {
        await accept.click({ timeout: 2000 }).catch(() => {});
        const send = host.page.locator('.gm-recs__actions').getByRole('button', { name: /^Saada/ });
        await expect(send)
          .toBeEnabled({ timeout: 5_000 })
          .catch(() => {});
        if (await send.isEnabled({ timeout: 1000 }).catch(() => false)) {
          await send.click({ timeout: 2000 }).catch(() => {});
          sent++;
        }
      }
      // The call-taker has no dispatch buttons.
      expect(await guest.page.locator('.gm-recs__actions').count()).toBe(0);
      await host.page.waitForTimeout(400);
    }
    expect(sent, 'the dispatcher sent crews').toBeGreaterThan(0);
    if (!shotDispatch) await shot(host.page, 'dispatcher-view');
    if (!shotCall) await shot(guest.page, 'calltaker-view');
    const synced = await expectInSync(host.page, guest.page);
    let resynced = synced;
    const dbg = await Promise.all(
      [host.page, guest.page].map((p) =>
        p.evaluate(() => (window as unknown as EpdWindow).__epd.coop.debug()),
      ),
    );
    if (dbg[0]?.engine === 'server') {
      // The game server answers a click within a fraction of a second (the lockstep log took two to three).
      const trips = dbg.flatMap((d) => d?.trips ?? []).sort((x, y) => x - y);
      test.info().annotations.push({ type: 'round trips (ms)', description: trips.join(' ') });
      expect(trips.length, 'commands sent').toBeGreaterThan(3);
      expect(trips[Math.floor(trips.length / 2)], `round trips ${trips.join(' ')}`).toBeLessThan(500);
    } else {
      // A forced divergence: the guest's state drifts, the server notices it at the next digest, the guest resyncs.
      await guest.page.evaluate(() => {
        const s = (window as unknown as EpdWindow).__epd.game.getState().sim!;
        s.trust += 7;
      });
      await expect
        .poll(async () => (await coopState(guest.page)).resyncs, { timeout: 60_000 })
        .toBeGreaterThan(0);
      await expect(guest.page.getByTestId('coop-status')).toHaveText('Ühendatud', { timeout: 45_000 });
      resynced = await expectInSync(host.page, guest.page, synced);
    }

    // Leaving mid-shift and coming back: the whole state again (lockstep: the latest snapshot plus the log since).
    await guest.page.locator('.gm-top__menu').click();
    await guest.page.getByRole('button', { name: 'Välju (saad naasta)' }).click();
    await expect.poll(() => screen(guest.page)).toBe('menu');
    await openRooms(guest.page);
    await guest.page.getByRole('button', { name: 'Liitu vahetusega' }).click();
    await expect.poll(() => screen(guest.page), { timeout: 20_000 }).toBe('game');
    await expect(guest.page.getByTestId('coop-status')).toHaveText('Ühendatud', { timeout: 45_000 });
    await expectInSync(host.page, guest.page, resynced);

    // The host ends the shift for both; both open the same report.
    await host.page.locator('.gm-top__menu').click();
    await host.page.getByRole('button', { name: 'Lõpeta vahetus kõigile' }).click();
    await host.page.getByRole('button', { name: 'Jah, lõpeta vahetus' }).click();
    for (const p of [host.page, guest.page]) {
      await p.getByRole('button', { name: 'Vaata vahetuse aruannet' }).click({ timeout: 20_000 });
      await expect.poll(() => screen(p), { timeout: 20_000 }).toBe('report');
    }
    const reports = await Promise.all(
      [host.page, guest.page].map((p) =>
        p.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().report),
      ),
    );
    expect(reports[1]!.score).toBe(reports[0]!.score);
    expect(reports[1]!.grade).toBe(reports[0]!.grade);
    expect(reports[1]!.stats).toEqual(reports[0]!.stats);
    expect(reports[1]!.coop).toEqual(reports[0]!.coop);
    for (const p of [host.page, guest.page]) {
      const team = p.getByTestId('coop-report');
      await expect(team.getByTestId('coop-report-row')).toHaveCount(2);
      await expect(team).toContainText('Dispetšer');
      await expect(team).toContainText('Kõnevastuvõtja');
      await expect(p.getByTestId('coop-xp')).toContainText('Sinu kogemuspunktid');
      await expect(p.getByTestId('room-rank')).toHaveText(/Ruumis \w{3} \w{3}: koht 1\/2/, {
        timeout: 15_000,
      });
    }
    const coop = reports[0]!.coop as { seats: { seat: number; stats: { sent: number; calls: number } }[] };
    expect(coop.seats[0].stats.sent).toBeGreaterThan(0);
    if (calls) expect(coop.seats[1].stats.calls).toBeGreaterThan(0);
    await expect(host.page.getByTestId('room-report')).toContainText('2/2 lõpetanud', { timeout: 15_000 });
    await host.page.getByTestId('coop-report').scrollIntoViewIfNeeded();
    await shot(host.page, 'report');

    // The next round in the same room (docs/MULTIPLAYER.md section 11). Both go back: the room opens again with the
    // first round as its last and the desks as they were; the host shortens the shift and starts a new shared shift.
    const back = (p: Page) =>
      p.locator('.vk-page__actions').getByRole('button', { name: 'Tagasi ruumi' }).click();
    for (const p of [guest.page, host.page]) {
      await back(p);
      await expect.poll(() => screen(p)).toBe('lobby');
      await expect(p.getByTestId('room')).toHaveAttribute('data-state', 'lobby', { timeout: 15_000 });
    }
    await expect(host.page.getByTestId('room-meta')).toContainText('2. voor');
    await expect(guest.page.getByTestId('room-last').locator('tbody tr')).toHaveCount(2);
    // The room's history (2.36.0): the first round, and its joint report opens again from it.
    const history = guest.page.getByTestId('room-history');
    await expect(history).toContainText('Koos mängitud: 1 vahetus', { timeout: 15_000 });
    await history.getByTestId('history-row').click();
    const view = guest.page.getByTestId('history-view');
    await expect(view.getByTestId('coop-report-row')).toHaveCount(2);
    await expect(view.getByTestId('joint-timeline')).toContainText('Vahetus algas');
    await guest.page.keyboard.press('Escape');
    await expect(view).toHaveCount(0);
    await expect(
      guest.page.getByTestId('role-picker').getByRole('radio', { name: /Kõnevastuvõtja/ }),
    ).toHaveAttribute('aria-checked', 'true');
    await host.page.getByRole('radio', { name: '2 h' }).click();
    await expect(guest.page.getByTestId('room')).toContainText('2 h', { timeout: 10_000 });
    await guest.page.getByRole('button', { name: 'Olen valmis' }).click();
    await expect(host.page.getByTestId('room-block')).toContainText('Kõik on valmis', { timeout: 10_000 });
    await host.page.getByRole('button', { name: 'Alusta vahetust' }).click();
    await expect.poll(() => screen(host.page), { timeout: 30_000 }).toBe('game');
    await expect.poll(() => screen(guest.page), { timeout: 30_000 }).toBe('game');
    for (const p of [host.page, guest.page]) {
      await expect(p.getByTestId('coop-status')).toHaveText('Ühendatud', { timeout: 30_000 });
      await expect
        .poll(async () => (await coopSim(p))?.turn ?? -1, { timeout: 15_000 })
        .toBeGreaterThanOrEqual(0);
    }
    const c = await coopSim(host.page);
    expect(await coopSim(guest.page)).toMatchObject({ seed: c!.seed, start: c!.start });
    expect(c!.seed).not.toBe(a!.seed);
    // The host ends it straight away and goes back to the room; the guest stays on the end of the shift and sends
    // nothing, so the round waits for the guest's result (whether the short shift had an incident or not, which
    // depends on the round's seed). The host ends the round in the room and both are in the lobby of the third.
    await host.page.locator('.gm-top__menu').click();
    await host.page.getByRole('button', { name: 'Lõpeta vahetus kõigile' }).click();
    await host.page.getByRole('button', { name: 'Jah, lõpeta vahetus' }).click();
    await host.page.getByRole('button', { name: 'Vaata vahetuse aruannet' }).click({ timeout: 20_000 });
    await expect.poll(() => screen(host.page), { timeout: 20_000 }).toBe('report');
    await expect(host.page.getByTestId('room-rank')).toBeVisible({ timeout: 15_000 });
    await expect(guest.page.getByRole('button', { name: 'Vaata vahetuse aruannet' })).toBeVisible({
      timeout: 20_000,
    });
    await back(host.page);
    await expect.poll(() => screen(host.page)).toBe('lobby');
    await expect(host.page.getByTestId('room')).toHaveAttribute('data-state', 'running');
    await host.page.getByRole('button', { name: 'Lõpeta voor' }).click();
    await host.page.getByRole('button', { name: 'Jah, lõpeta voor' }).click();
    await expect(host.page.getByTestId('room')).toHaveAttribute('data-state', 'lobby', { timeout: 15_000 });
    await expect(host.page.getByTestId('room-meta')).toContainText('3. voor');
    // Not back on a shift by itself: the round is over for everybody.
    expect(await screen(host.page)).toBe('lobby');
    // The guest's report comes too late for the board: the round is over (or the shift had no incidents).
    await guest.page.getByRole('button', { name: 'Vaata vahetuse aruannet' }).click();
    await expect.poll(() => screen(guest.page), { timeout: 20_000 }).toBe('report');
    await expect(guest.page.getByTestId('room-rank')).toContainText(/voor oli juba läbi|Sündmusteta/, {
      timeout: 15_000,
    });
    await expect(guest.page.getByTestId('room-report-state')).toContainText('järgmiseks vooruks avatud', {
      timeout: 15_000,
    });
    await back(guest.page);
    await expect.poll(() => screen(guest.page)).toBe('lobby');
    await expect(guest.page.getByTestId('room')).toHaveAttribute('data-state', 'lobby', { timeout: 15_000 });
    await expect(guest.page.getByTestId('room-meta')).toContainText('3. voor');

    expect(host.errors, host.errors.join('\n')).toEqual([]);
    expect(guest.errors, guest.errors.join('\n')).toEqual([]);
    await host.ctx.close();
    await guest.ctx.close();
  });
});
