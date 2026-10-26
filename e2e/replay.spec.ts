import { expect, test, type Page } from '@playwright/test';

/**
 * Kordus (docs/REPLAY.md, 2.39.0): a shift is recorded while it is played; its report offers the replay, which plays
 * the shift on the map with a timeline of the calls, the crews sent and the pursuits, can be paused, scrubbed and
 * jumped through, shows an incident and follows a crew, and closes back to the report. The shift here is played fast
 * by a dispatcher in the page (a pursuit among its incidents). REPLAY_SHOTS=<dir> saves screenshots.
 */

type EpdWindow = Window & {
  __epd: {
    game: {
      getState: () => {
        screen: string;
        sim: null | Record<string, unknown>;
        startShift: (opts: unknown) => void;
        setSpeed: (i: number) => void;
        bump: () => void;
      };
    };
    replay: {
      getState: () => {
        last: null | {
          key: string;
          from: number;
          to: number;
          units: unknown[];
          calls: unknown[];
          marks: { k: string }[];
          incidents: { pu?: unknown[] }[];
        };
      };
    };
  };
};

const SHOTS = process.env.REPLAY_SHOTS;
const screen = (page: Page) => page.evaluate(() => (window as unknown as EpdWindow).__epd.game.getState().screen);
const clock = (page: Page) => page.locator('.rp-clock__time').innerText();

test('a shift plays back on the map from its report: timeline, pause, jumps, an incident and a crew followed', async ({ page }) => {
  // The map draws in software on a runner: every step of the viewer takes its time.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
  await page.getByRole('tab', { name: 'Klassika' }).click();
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('menu');

  await page.evaluate(() =>
    (window as unknown as EpdWindow).__epd.game.getState().startShift({
      seed: 390390,
      regionId: 'pohja',
      mode: 'free',
      difficulty: 'veteran',
      start: Date.UTC(2026, 9, 23, 16, 0),
      hours: 3,
      playerName: 'Magnus',
      weather: 'clear',
    }),
  );
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('game');
  // The game loop's first frames start the recording (it first looks for one kept from before a reload).
  await page.waitForTimeout(2000);

  // Two and a half hours in a few seconds: 20 game seconds a step, each recorded as the game loop records a frame (not
  // paced by frames, which a runner drawing the map in software gives few of), a dispatcher every third step, a car
  // that does not stop for a patrol half an hour in.
  const played = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        type Any = Record<string, any>;
        const e = (window as unknown as { __epd: Any }).__epd;
        const g = e.game.getState();
        g.setSpeed(0);
        const s = g.sim as Any;
        let n = 0;
        let chased = false;
        const one = () => {
          if (!chased && s.now > s.startTime + 30 * 60_000) {
            chased = true;
            const pat = Object.values(s.units as Record<string, Any>).find((u) => u.type === 'patrol' && u.status === 'available' && !u.move);
            if (pat) {
              const id = e.engine.cmd.directorSpawn(s, { templateId: 'traffic_mittepeatumine', coord: [pat.pos[0] + 0.01, pat.pos[1] + 0.004] });
              if (id) e.engine.cmd.dispatchUnits(s, id, [pat.id]);
            }
          }
          e.engine.step(s, 20_000);
          if (++n % 3 === 0) {
            for (const call of s.calls) {
              if (call.endedAt) continue;
              if (!call.answeredAt) e.engine.cmd.answerCall(s, call.id);
              else e.engine.cmd.endCall(s, call.id, { action: 'create', priority: s.incidents[call.incidentId]?.truePriority ?? 3 });
            }
            for (const inc of e.engine.sel.queue(s)) {
              if (inc.state === 'incoming') e.engine.cmd.acknowledge(s, inc.id);
              if (!inc.assigned.length) {
                const r = e.engine.sel.recommendUnits(s, inc.id).find((x: Any) => x.fit === 'ideal' || x.fit === 'need');
                if (r) e.engine.cmd.dispatchUnits(s, inc.id, [r.unit.id]);
              }
            }
          }
          e.engine.record(s);
        };
        // In slices, so the page keeps breathing.
        const slice = () => {
          for (let i = 0; i < 30; i++) {
            if (s.now > s.startTime + 150 * 60_000) {
              g.bump();
              resolve(s.incidentOrder.length);
              return;
            }
            one();
          }
          setTimeout(slice, 0);
        };
        slice();
      }),
  );
  expect(played).toBeGreaterThan(5);

  // End it early through the pause menu: the report comes with its replay.
  await page.locator('.gm-top__menu').click();
  await page.getByRole('button', { name: /Lõpeta vahetus/ }).first().click();
  await page.getByRole('button', { name: /Jah, lõpeta vahetus/ }).click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('report');
  const card = page.getByTestId('replay-card');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText('saatmist');
  await expect(card.locator('svg.vk-rthumb path.vk-rthumb__run')).toHaveCount(1);
  const rep = (await page.evaluate(() => (window as unknown as EpdWindow).__epd.replay.getState().last))!;
  expect(rep.to - rep.from).toBeGreaterThan(140 * 60_000);
  expect(rep.marks.filter((m) => m.k === 'send').length).toBeGreaterThan(5);
  expect(rep.incidents.some((x) => x.pu?.length)).toBe(true);
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/replay-card.png` });

  // The replay: it plays at once, the clock moves.
  await page.getByTestId('replay-open').click();
  const replay = page.getByTestId('replay');
  await expect(replay).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.maplibregl-canvas, .epdm-nogl').first()).toBeVisible({ timeout: 20_000 });
  const tl = page.getByTestId('replay-timeline');
  await expect(tl.locator('.rp-tl__send').first()).toBeVisible();
  await expect(tl.locator('.rp-tl__pursuit')).not.toHaveCount(0);
  const t0 = await clock(page);
  await expect.poll(() => clock(page), { timeout: 10_000 }).not.toBe(t0);
  await expect(page.getByTestId('replay-feed')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/replay-playing.png` });

  // Space pauses: the clock stands.
  await page.keyboard.press('Space');
  const paused = await clock(page);
  await page.waitForTimeout(800);
  expect(await clock(page)).toBe(paused);

  // A crew sent, on the timeline: its incident and the crew, followed.
  const send = await tl.locator('.rp-tl__send').nth(3).boundingBox();
  await page.mouse.click(send!.x + send!.width / 2, send!.y + send!.height / 2);
  await expect(page.getByTestId('replay-incident')).toBeVisible();
  await expect(page.getByTestId('replay-crew')).toBeVisible();
  await expect(page.getByTestId('replay-crew').locator('.rp-follow')).toHaveAttribute('aria-pressed', 'true');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/replay-incident.png` });

  // The next event jumps on; the pursuit is watched slowed down.
  const before = await clock(page);
  await page.keyboard.press('PageDown');
  await expect.poll(() => clock(page)).not.toBe(before);
  const pursuit = await tl.locator('.rp-tl__pursuit').first().boundingBox();
  await page.mouse.click(pursuit!.x + 2, pursuit!.y + pursuit!.height / 2);
  await page.keyboard.press('Space');
  await expect(page.locator('.rp-clock__slow')).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(1500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/replay-pursuit.png` });
  await page.keyboard.press('Space');

  // Escape: the incident, the crew, then the replay; the report is still there.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(replay).toBeHidden();
  expect(await screen(page)).toBe('report');
  // A highlight of the report opens the replay at its incident.
  const watch = page.locator('.vk-rwatch').first();
  if (await watch.count()) {
    await watch.click();
    await expect(page.getByTestId('replay-incident')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(replay).toBeHidden();
  }

  expect(errors, errors.join('\n')).toEqual([]);
});
