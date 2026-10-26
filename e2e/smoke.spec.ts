import { expect, test, type Page } from '@playwright/test';

/** Store handle exposed by main.tsx for tests and power users. */
type EpdWindow = Window & {
  __epd: {
    game: {
      getState: () => {
        screen: string;
        sim: null | {
          incidentOrder: string[];
          incidents: Record<string, { state: string; assigned: string[] }>;
          calls: { endedAt?: number }[];
        };
        setSpeed: (i: number) => void;
      };
    };
  };
};

const screen = (page: Page) => page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().screen);

async function bootAndLegacyLogin(page: Page) {
  await page.goto('/');
  // Boot log: any key skips it.
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
  // The 2024 easter egg: empty username + password on the "Klassika" tab logs in.
  await page.getByRole('tab', { name: 'Klassika' }).click();
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('menu');
}

test('boots, logs in the 2024 way and plays a quick shift to the report', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await bootAndLegacyLogin(page);
  await expect(page.getByText('Mitteametlik ja tasuta fännimäng', { exact: false }).first()).toBeVisible();

  // Kiirmäng sits in the menu's Üksikmäng group (2.27.0): open it unless it is open already.
  if (!(await page.getByRole('button', { name: /Kiirmäng/ }).first().isVisible()))
    await page.getByRole('button', { name: /Üksikmäng/ }).first().click();
  await page.getByRole('button', { name: /Kiirmäng/ }).first().click();
  await expect.poll(() => screen(page)).toBe('briefing');
  await page.getByRole('button', { name: /Alusta vahetust/ }).first().click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('game');

  // Map canvas and CAD chrome are up, the version small in the map's corner.
  await expect(page.locator('.maplibregl-canvas, .map-fallback, [class*="nowebgl"]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.gm-ver')).toHaveText(/^v\d+\.\d+\.\d+$/);

  // Speed up until the first event card arrives (an interactive 112 call may come first: answer it).
  await page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().setSpeed(4));
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const sim = (window as unknown as EpdWindow).__epd.game.getState().sim;
          return sim ? sim.incidentOrder.length : 0;
        }),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);

  const accept = page.getByRole('button', { name: /Võta vastu/ }).first();
  await expect(accept).toBeVisible({ timeout: 60_000 });
  await accept.click();

  // Dispatch from the incident panel and verify a unit got assigned in the simulation.
  const send = page.getByRole('button', { name: /^Saada/ }).first();
  await expect(send).toBeVisible({ timeout: 15_000 });
  await send.click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const sim = (window as unknown as EpdWindow).__epd.game.getState().sim;
          return sim ? Object.values(sim.incidents).some((i) => i.assigned.length > 0 || i.state === 'onscene') : false;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);

  // End the shift through the pause menu and land on the report with its newspaper.
  await page.locator('.gm-top__menu').click();
  await page.getByRole('button', { name: /Lõpeta vahetus/ }).first().click();
  await page.getByRole('button', { name: /Jah, lõpeta vahetus/ }).click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('report');
  await expect(page.locator('article.sh-paper')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pealinna Kuulutaja' })).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('a requested ambulance drives to the scene on the map and opens its incident', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await bootAndLegacyLogin(page);
  const epd = <T = unknown>(body: string) => page.evaluate(`(() => { const e = window.__epd; ${body} })()`) as Promise<T>;
  await epd(
    `e.game.getState().startShift({ seed: 2026, regionId: 'pohja', mode: 'free', difficulty: 'normal',
       start: Date.UTC(2026, 9, 16, 11, 0), hours: 8, playerName: 'Test' });
     e.game.getState().setSpeed(0);`,
  );
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('game');
  await expect(page.locator('.maplibregl-canvas').first()).toBeVisible({ timeout: 20_000 });
  // Paused game: an incident in Tallinn, kiirabi asked for, the game clock moved to 90 % of its trip.
  const id = await epd<string>(
    `const g = e.game.getState(); const s = g.sim; const { step, cmd } = e.engine;
     const pick = () => s.incidentOrder.map((i) => s.incidents[i]).find((i) => i.state !== 'closed' && i.location.city === 'Tallinn' && !s.flags['hidden:' + i.id]);
     for (let m = 0; m < 240 && !pick(); m++) step(s, 60000);
     const inc = pick();
     inc.expiresAt = undefined;
     cmd.requestAgency(s, inc.id, 'kiirabi');
     const rq = inc.agencyNeeds.find((n) => n.agency === 'kiirabi').requested;
     step(s, Math.round(((rq.arriveAt - rq.requestedAt) * 0.9) / 5000) * 5000);
     g.select({}, 'incident');
     g.focusMap(inc.location.coord, 12);
     g.bump();
     return inc.id;`,
  );
  const amb = page.locator('.epdm-mk--agency:has(.epdm-ag--kiirabi.is-enroute.is-lights)');
  await expect(amb).toHaveCount(1, { timeout: 15_000 });
  await expect(amb).toHaveAttribute('title', /^Kiirabi · saabub ~\d+ min$/);
  await expect(amb.locator('.epdm-ag__label')).toHaveText('KIIRABI');
  // Not a police unit: never on the unit board, and a click opens the incident it drives to.
  await expect(page.getByText('KIIRABI', { exact: true })).toHaveCount(1);
  await page.waitForTimeout(2500);
  await amb.click();
  await expect
    .poll(() => epd<{ incidentId?: string; unitId?: string }>('return e.game.getState().selection'))
    .toMatchObject({ incidentId: id });
  expect(await epd('return e.game.getState().selection.unitId ?? null')).toBeNull();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a major incident: the choice, the briefing, the staff, a decision and a task (2.37.0)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await bootAndLegacyLogin(page);
  const epd = <T = unknown>(body: string) => page.evaluate(`(() => { const e = window.__epd; ${body} })()`) as Promise<T>;
  // The free shift's briefing offers the choice: its chance, always, never.
  if (!(await page.getByRole('button', { name: /Kiirmäng/ }).first().isVisible()))
    await page.getByRole('button', { name: /Üksikmäng/ }).first().click();
  await page.getByRole('button', { name: /Kiirmäng/ }).first().click();
  await expect.poll(() => screen(page)).toBe('briefing');
  const choice = page.getByRole('radiogroup', { name: 'Suurõnnetus' });
  await expect(choice.getByRole('radio')).toHaveCount(3);
  await choice.getByRole('radio', { name: /^Kindlasti/ }).click();
  await expect(choice.getByRole('radio', { name: /^Kindlasti/ })).toHaveAttribute('aria-checked', 'true');
  // A paused shift of its own; the bus crash started by hand, as the director's panel does.
  await epd(
    `e.game.getState().startShift({ seed: 2026, regionId: 'pohja', mode: 'free', difficulty: 'normal',
       start: Date.UTC(2026, 9, 16, 11, 0), hours: 8, playerName: 'Test' });
     e.game.getState().setSpeed(0);`,
  );
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('game');
  expect(await epd(`const g = e.game.getState(); const ok = e.engine.crisis.start(g.sim, 'bus'); g.bump(); return ok;`)).toBe(true);
  const brief = page.getByTestId('crisis-brief');
  await expect(brief).toBeVisible({ timeout: 10_000 });
  await expect(brief).toContainText('Bussiõnnetus maanteel');
  await expect(brief.locator('img')).toBeVisible();
  await page.getByTestId('crisis-brief-go').click();
  await expect(page.getByTestId('crisis-panel')).toBeVisible();
  await expect(page.getByTestId('crisis-bar')).toContainText('Suurõnnetus');
  // Its first tasks are in the queue, each marked.
  await expect(page.locator('.gm-ctag')).toHaveCount(3);
  // The staff asks its first decision three minutes in: the commander keeps a lane open.
  await epd(`const g = e.game.getState(); e.engine.step(g.sim, 4 * 60000); g.bump();`);
  const lane = page.getByTestId('crisis-option-road-lane');
  await expect(lane).toBeVisible({ timeout: 10_000 });
  await lane.click();
  await expect.poll(() => epd(`return e.game.getState().sim.crisis.decisions.road ?? null`)).toBe('lane');
  await expect(page.getByTestId('crisis-panel')).toContainText('Jäta üks rada');
  // A task opens its incident, with the crisis's note on it.
  await page.getByTestId('crisis-task-scene').locator('button').click();
  await expect(page.locator('.gm-cnote')).toContainText('Suurõnnetuse ülesanne');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('original versions are bundled', async ({ request }) => {
  for (const f of ['politseimang-2024.html', 'politseimang-2025.html']) {
    const res = await request.get(`/legacy/${f}`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('Politsei Andmebaas');
  }
});

test('menu fits a phone screen', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await bootAndLegacyLogin(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.close();
});
