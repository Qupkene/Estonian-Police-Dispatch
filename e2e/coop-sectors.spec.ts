import { statSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Sektorite koostöö (sector co-op, docs/MULTIPLAYER.md section 8) against the real PHP API: two accounts in two
 * browser contexts make a Sektorid room in Põhja (played on the game server, section 9) with two neighbouring desks
 * (Tallinna kesklinn for the host, Lasnamäe for the guest) and play one shared shift. Each desk sees its own queue and its own 112 calls; the
 * neighbour's events and crews are dimmed. The host asks the guest for a crew on one of its events, the guest
 * accepts it in the co-op panel, the crew goes. Both clients keep the same digest; the host ends the shift and the
 * two reports match, with the per-desk table.
 * Then (2.34.0, section 12): a host removes a third player from the lobby, and in the shared shift removes the guest,
 * whose game says so at once; the guest's desk is free, the host takes it over from the co-op panel.
 * MP_SHOTS=<dir> saves screenshots (the lobby's desk choice, both desks in game, the lend request, the report, the
 * take-over).
 */

type Hash = { turn: number; hash: string };
type Lend = { id: number; inc: string; unit: string; kind: string; from: string; to: string; state: string };
type EpdWindow = Window & {
  __epd: {
    game: {
      getState: () => {
        screen: string;
        sim: null | {
          seed: number;
          startTime: number;
          regionId: string;
          trust: number;
          units: Record<string, { incidentId?: string }>;
          incidents: Record<string, { state: string }>;
          coop?: {
            mode: string;
            turn: number;
            speed: number;
            seats: { seat: number; desk?: string; present: boolean; name: string }[];
            sec?: { desks: string[]; lends: Lend[]; incDesk: Record<string, string> };
          };
        };
        report: null | { score: number; grade: string; stats: Record<string, unknown>; coop?: unknown };
      };
    };
    coop: {
      state: { getState: () => { status: string; seat: number; isHost: boolean } };
      debug: () => null | { hashes: Hash[] };
    };
  };
};

const SHOTS = process.env.MP_SHOTS;
const STAMP = Date.now().toString(36);
const HOST = `kesk_${STAMP}`;
const GUEST = `lasna_${STAMP}`;
const PASS = 'Salajane-parool-2026';

const screen = (page: Page) =>
  page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().screen);
const hashes = (page: Page) =>
  page.evaluate(() => (window as unknown as EpdWindow).__epd.coop.debug()?.hashes ?? []);
const lends = (page: Page) =>
  page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().sim?.coop?.sec?.lends ?? []);

async function register(browser: Browser, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

async function expectInSync(a: Page, b: Page, after = -1): Promise<number> {
  let found: { turn: number; a: string; b: string } | null = null;
  await expect
    .poll(
      async () => {
        const [ha, hb] = await Promise.all([hashes(a), hashes(b)]);
        const mb = new Map(hb.map((h) => [h.turn, h.hash]));
        const both = ha.filter((h) => h.turn > after && mb.has(h.turn));
        const last = both[both.length - 1];
        found = last ? { turn: last.turn, a: last.hash, b: mb.get(last.turn)! } : null;
        return found !== null;
      },
      { timeout: 45_000 },
    )
    .toBe(true);
  const f = found as unknown as { turn: number; a: string; b: string };
  expect(f.b, `digest at turn ${f.turn}`).toBe(f.a);
  return f.turn;
}

/** One desk's player: answers their own 112 calls (where, what, create as P2) and accepts their own new events. */
async function work(page: Page): Promise<void> {
  const answer = page.locator('.tl-call__answer');
  if (await answer.isVisible().catch(() => false)) {
    await answer.click({ timeout: 2000 }).catch(() => {});
    return;
  }
  if (
    await page
      .locator('.tl-call:not(.is-ringing)')
      .isVisible()
      .catch(() => false)
  ) {
    for (const q of ['Kus te asute', 'Mis juhtus']) {
      const btn = page.getByRole('button', { name: new RegExp(q) });
      if (await btn.isEnabled({ timeout: 500 }).catch(() => false))
        await btn.click({ timeout: 2000 }).catch(() => {});
    }
    if ((await page.locator('.tl-q.is-asked').count()) >= 2) {
      await page
        .locator('.tl-prio-btn--2')
        .click({ timeout: 2000 })
        .catch(() => {});
      const create = page.getByRole('button', { name: 'Loo sündmus' });
      if (await create.isEnabled({ timeout: 500 }).catch(() => false))
        await create.click({ timeout: 2000 }).catch(() => {});
    }
    return;
  }
  const accept = page
    .locator('.gm-card__actions')
    .getByRole('button', { name: /Võta vastu/ })
    .first();
  if (await accept.isVisible().catch(() => false)) await accept.click({ timeout: 2000 }).catch(() => {});
}

test.describe.serial('sector co-op', () => {
  test.setTimeout(420_000);

  test('two neighbouring desks share a shift, lend a crew and get the same report', async ({ browser }) => {
    const host = await register(browser, HOST);
    const guest = await register(browser, GUEST);

    // The host makes a Sektorid room in Põhja: Tallinna kesklinn and Lasnamäe (the default pair), 6 hours.
    await openRooms(host.page);
    const modes = host.page.getByRole('radiogroup', { name: 'Režiim' });
    await modes.getByRole('radio', { name: /Sektorid/ }).click();
    const desks = host.page.getByTestId('desk-options');
    await expect(desks.getByRole('checkbox', { checked: true })).toHaveText([
      'Tallinna kesklinn',
      'Lasnamäe',
    ]);
    // Lääne-Harju does not touch the chosen desks; Ida-Harju does.
    await expect(desks.getByRole('checkbox', { name: 'Lääne-Harju' })).toBeDisabled();
    await desks.getByRole('checkbox', { name: 'Ida-Harju' }).click();
    await expect(desks.getByRole('checkbox', { checked: true })).toHaveCount(3);
    await desks.getByRole('checkbox', { name: 'Ida-Harju' }).click();
    await expect(desks.getByRole('checkbox', { checked: true })).toHaveCount(2);
    await host.page.getByRole('radio', { name: '6 h' }).click();
    await shot(host.page, 'lobby-sector-picker');
    await host.page.getByRole('button', { name: 'Loo ruum' }).click();
    const code = ((await host.page.getByTestId('room-code').textContent()) ?? '').replace(/\s/g, '');
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    await expect(host.page.getByTestId('desk-options').getByRole('checkbox', { checked: true })).toHaveCount(
      2,
    );

    await openRooms(guest.page);
    await guest.page.getByLabel('Ruumi kood').fill(code);
    await guest.page.getByRole('button', { name: 'Liitu', exact: true }).click();
    await expect(guest.page.getByTestId('room-area')).toContainText('Tallinna kesklinn, Lasnamäe');
    // Seat defaults spread over the desks: the guest gets Lasnamäe. They try the city centre and go back.
    const picker = guest.page.getByTestId('desk-picker');
    await expect(picker.getByRole('radio', { name: /Lasnamäe/ })).toHaveAttribute('aria-checked', 'true');
    await picker.getByRole('radio', { name: /Tallinna kesklinn/ }).click();
    await expect(host.page.getByTestId('seat-desk')).toHaveText(['Tallinna kesklinn', 'Tallinna kesklinn'], {
      timeout: 10_000,
    });
    await expect(guest.page.getByTestId('desk-hint')).toContainText('Vaba lauda juhib AI-kolleeg');
    await picker.getByRole('radio', { name: /Lasnamäe/ }).click();
    await expect(host.page.getByTestId('seat-desk')).toHaveText(['Tallinna kesklinn', 'Lasnamäe'], {
      timeout: 10_000,
    });
    await guest.page.getByRole('button', { name: 'Olen valmis' }).click();
    await expect(host.page.getByTestId('room-block')).toContainText('Kõik on valmis', { timeout: 10_000 });
    await shot(host.page, 'lobby-sector-desks');
    await host.page.getByRole('button', { name: 'Alusta vahetust' }).click();

    // Both on the shared shift, each at their desk.
    await expect.poll(() => screen(host.page), { timeout: 30_000 }).toBe('game');
    await expect.poll(() => screen(guest.page), { timeout: 30_000 }).toBe('game');
    for (const p of [host.page, guest.page])
      await expect(p.getByTestId('coop-status')).toHaveText('Ühendatud', { timeout: 30_000 });
    // "Ühendatud" can show a moment before the first turn (the setup) is played.
    for (const p of [host.page, guest.page])
      await expect
        .poll(
          () =>
            p.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().sim?.coop?.turn ?? -1),
          {
            timeout: 15_000,
          },
        )
        .toBeGreaterThanOrEqual(0);
    const seats = await host.page.evaluate(
      () => (window as unknown as EpdWindow).__epd.game.getState().sim?.coop,
    );
    expect(seats?.mode).toBe('sector');
    expect(seats?.sec?.desks).toEqual(['pohja-kesklinn', 'pohja-lasnamae']);
    expect(seats?.seats.map((x) => [x.seat, x.desk, x.name])).toEqual([
      [0, 'pohja-kesklinn', HOST],
      [1, 'pohja-lasnamae', GUEST],
    ]);
    await expect(host.page.getByTestId('my-desk')).toHaveText('Minu laud: Tallinna kesklinn');
    await expect(guest.page.getByTestId('my-desk')).toHaveText('Minu laud: Lasnamäe');
    await host.page.getByRole('button', { name: '4×' }).click();

    // Play until the host has an event of its own to borrow a Lasnamäe crew for, then ask, and the guest accepts.
    let asked = false;
    let shotDesks = false;
    let accepted: Lend | undefined;
    const t0 = Date.now();
    while (Date.now() - t0 < 240_000 && !accepted) {
      await work(host.page);
      await work(guest.page);
      // Each desk sees only its own queue: no card of the other desk's events.
      for (const [p, desk] of [
        [host.page, 'pohja-kesklinn'],
        [guest.page, 'pohja-lasnamae'],
      ] as const) {
        const cards = await p
          .locator('.gm-queue__list > .gm-card')
          .evaluateAll((els) => els.map((e) => e.getAttribute('data-incident') ?? ''));
        const owner = await p.evaluate(
          () => (window as unknown as EpdWindow).__epd.game.getState().sim!.coop!.sec!.incDesk,
        );
        for (const id of cards) if (owner[id]) expect(owner[id], id).toBe(desk);
      }
      if (!asked) {
        const card = host.page.locator('.gm-card--queued').first();
        if (await card.isVisible().catch(() => false)) {
          await card.click({ timeout: 2000 }).catch(() => {});
          const ask = host.page.getByTestId('lend-ask').getByRole('button', { name: 'Küsi' }).first();
          if (await ask.isVisible({ timeout: 1500 }).catch(() => false)) {
            if (!shotDesks) {
              shotDesks = true;
              await shot(host.page, 'desk-host-kesklinn');
              await shot(guest.page, 'desk-guest-lasnamae');
            }
            // The panel keeps updating at 4x (the crews' distances and the list order move): a click that misses
            // is tried again on the next round; the test still needs the lend to be accepted.
            asked = await ask
              .click({ timeout: 5000 })
              .then(() => true)
              .catch(() => false);
          }
        }
      } else {
        const req = guest.page.getByTestId('lend-request').first();
        if (await req.isVisible().catch(() => false)) {
          await shot(guest.page, 'lend-request');
          // The request card moves with the panel at 4x too: a click that misses is tried on the next round.
          const yes = await req
            .getByTestId('lend-yes')
            .click({ timeout: 5000 })
            .then(() => true)
            .catch(() => false);
          if (!yes) {
            await host.page.waitForTimeout(300);
            continue;
          }
          await expect
            .poll(async () => (await lends(host.page)).find((r) => r.state === 'accepted'), {
              timeout: 20_000,
            })
            .toBeTruthy();
          accepted = (await lends(host.page)).find((r) => r.state === 'accepted');
        } else if ((await lends(host.page)).some((r) => r.state !== 'open')) {
          // The request lapsed or the crew went elsewhere: ask again.
          asked = false;
        }
      }
      await host.page.waitForTimeout(300);
    }
    expect(accepted, 'a Lasnamäe crew was lent to a Kesklinn event').toBeTruthy();
    expect(accepted).toMatchObject({ kind: 'ask', from: 'pohja-kesklinn', to: 'pohja-lasnamae' });
    // The crew goes to the host's event on both clients.
    for (const p of [host.page, guest.page]) {
      const unit = await p.evaluate(
        (id) => (window as unknown as EpdWindow).__epd.game.getState().sim!.units[id].incidentId,
        accepted!.unit,
      );
      const inc = await p.evaluate(
        (id) => (window as unknown as EpdWindow).__epd.game.getState().sim!.incidents[id].state,
        accepted!.inc,
      );
      if (inc !== 'closed') expect(unit).toBe(accepted!.inc);
    }
    await expect(host.page.getByTestId('lend-mine').last()).toContainText('nõustus', { timeout: 10_000 });
    await shot(host.page, 'lend-accepted');
    await expectInSync(host.page, guest.page);

    // The host ends the shift for both; both open the same report with the per-desk table.
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
    const coop = reports[0]!.coop as {
      mode: string;
      desks: { desk: string; seats: number[]; lent: number }[];
    };
    expect(coop.mode).toBe('sector');
    expect(coop.desks.map((d) => [d.desk, d.seats])).toEqual([
      ['pohja-kesklinn', [0]],
      ['pohja-lasnamae', [1]],
    ]);
    expect(coop.desks[1].lent).toBe(1);
    for (const p of [host.page, guest.page]) {
      const table = p.getByTestId('desk-report');
      await expect(table.getByTestId('desk-report-row')).toHaveCount(2);
      await expect(table).toContainText('Tallinna kesklinn');
      await expect(table).toContainText('Lasnamäe');
      await expect(p.getByTestId('coop-xp')).toContainText('Sinu kogemuspunktid');
    }
    await host.page.getByTestId('desk-report').scrollIntoViewIfNeeded();
    await shot(host.page, 'report-desks');
    // The joint report (2.36.0): the moments of the shift, the lent crew among them, and a picture of it all,
    // downloaded where the browser cannot share files.
    await expect(host.page.getByTestId('joint-timeline')).toContainText('laenati');
    const [download] = await Promise.all([
      host.page.waitForEvent('download'),
      host.page.getByTestId('joint-share').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^epd-uhine-raport-[A-Z0-9]{6}\.png$/);
    expect(statSync(await download.path()).size).toBeGreaterThan(20_000);
    if (SHOTS) await download.saveAs(`${SHOTS}/joint-picture.png`);

    expect(host.errors, host.errors.join('\n')).toEqual([]);
    expect(guest.errors, guest.errors.join('\n')).toEqual([]);
    await host.ctx.close();
    await guest.ctx.close();
  });

  test('the host removes players, and takes over the desk of the one removed from the shift', async ({
    browser,
  }) => {
    const host = await register(browser, `kesk2_${STAMP}`);
    const guest = await register(browser, `lasna2_${STAMP}`);
    const third = await register(browser, `kolmas_${STAMP}`);
    await openRooms(host.page);
    await host.page
      .getByRole('radiogroup', { name: 'Režiim' })
      .getByRole('radio', { name: /Sektorid/ })
      .click();
    await host.page.getByRole('button', { name: 'Loo ruum' }).click();
    const code = ((await host.page.getByTestId('room-code').textContent()) ?? '').replace(/\s/g, '');
    for (const p of [guest.page, third.page]) {
      await openRooms(p);
      await p.getByLabel('Ruumi kood').fill(code);
      await p.getByRole('button', { name: 'Liitu', exact: true }).click();
      await expect(p.getByTestId('room-code')).toBeVisible({ timeout: 10_000 });
    }
    await expect(host.page.getByTestId('seat-kick')).toHaveCount(2, { timeout: 10_000 });
    // The lobby: the host removes the third player, who is told so and cannot come back with the code.
    await host.page.getByTestId('seat-kick').last().click();
    await host.page.getByTestId('kick-yes').click();
    await expect(third.page.getByText('Ruumi looja eemaldas sind sellest ruumist.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(host.page.getByTestId('seat-kick')).toHaveCount(1, { timeout: 10_000 });
    await third.page.getByRole('button', { name: 'Uus ruum' }).click();
    await third.page.getByLabel('Ruumi kood').fill(code);
    await third.page.getByRole('button', { name: 'Liitu', exact: true }).click();
    await expect(third.page.getByText('Ruumi looja eemaldas sind sellest ruumist.')).toBeVisible({
      timeout: 10_000,
    });

    await guest.page.getByRole('button', { name: 'Olen valmis' }).click();
    await expect(host.page.getByTestId('room-block')).toContainText('Kõik on valmis', { timeout: 10_000 });
    await host.page.getByRole('button', { name: 'Alusta vahetust' }).click();
    for (const p of [host.page, guest.page]) {
      await expect.poll(() => screen(p), { timeout: 30_000 }).toBe('game');
      await expect(p.getByTestId('coop-status')).toHaveText('Ühendatud', { timeout: 30_000 });
    }
    // The shift: the host removes the guest from the co-op panel; the guest's game says so at once.
    await host.page.getByTestId('coop-kick').click();
    await host.page.getByTestId('coop-kick-yes').click();
    await expect(guest.page.getByTestId('coop-kicked')).toBeVisible({ timeout: 15_000 });
    // Lasnamäe has nobody now: its colleague holds it, and the host can take it over.
    const take = host.page.getByTestId('desk-take-row');
    await expect(take).toContainText('Lasnamäe', { timeout: 15_000 });
    await shot(host.page, 'desk-free');
    await host.page.getByTestId('desk-take').click();
    await expect(host.page.getByTestId('desk-give-row')).toContainText('Lasnamäe: sinu käes', {
      timeout: 10_000,
    });
    await expect(host.page.getByTestId('desk-take-row')).toHaveCount(0);
    const merged = await host.page.evaluate(
      () =>
        (
          (window as unknown as EpdWindow).__epd.game.getState().sim?.coop?.sec as {
            merged?: Record<string, string>;
          }
        )?.merged,
    );
    expect(merged).toEqual({ 'pohja-lasnamae': 'pohja-kesklinn' });
    await shot(host.page, 'desk-taken');
    // The removed guest leaves the shift.
    await guest.page.getByRole('button', { name: 'Välju vahetusest' }).click();
    await expect.poll(() => screen(guest.page), { timeout: 10_000 }).not.toBe('game');

    for (const r of [host, guest, third]) expect(r.errors, r.errors.join('\n')).toEqual([]);
    for (const r of [host, guest, third]) await r.ctx.close();
  });
});
