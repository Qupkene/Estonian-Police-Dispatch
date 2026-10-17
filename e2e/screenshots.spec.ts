/**
 * README screenshots. Run with: SHOTS=1 npm run e2e -- screenshots
 * Writes docs/screenshots/*.png (1600×900). The simulation is advanced directly through the
 * console handle (window.__epd) so the run is fast and repeatable.
 */
import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env.SHOTS, 'set SHOTS=1 to regenerate README screenshots');
test.setTimeout(300_000);

const OUT = 'docs/screenshots';
const MIN = 60_000;

const epd = <T = unknown>(page: Page, body: string) =>
  page.evaluate(`(() => { const e = window.__epd; ${body} })()`) as Promise<T>;

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

/** Advance the shift by `minutes` game minutes and let a bot accept and dispatch everything. */
async function play(page: Page, minutes: number) {
  await epd(
    page,
    `const g = e.game.getState(); const s = g.sim; const { step, cmd, sel } = e.engine;
     for (let m = 0; m < ${minutes}; m++) {
       step(s, ${MIN});
       for (const inc of sel.queue(s)) {
         if (inc.state === 'incoming') cmd.acknowledge(s, inc.id);
         if (!inc.assigned.length) {
           const r = sel.recommendUnits(s, inc.id).find((x) => x.fit === 'ideal' || x.fit === 'need');
           if (r) cmd.dispatchUnits(s, inc.id, [r.unit.id]);
         }
       }
     }
     g.bump();`,
  );
}

test('capture README screenshots', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect.poll(() => epd(page, 'return e.game.getState().screen')).toBe('login');
  await shot(page, 'login');
  await page.getByRole('tab', { name: 'Klassika' }).click();
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => epd(page, 'return e.game.getState().screen')).toBe('menu');
  await shot(page, 'menu');

  await page.getByRole('button', { name: /Kiirmäng/ }).first().click();
  await expect.poll(() => epd(page, 'return e.game.getState().screen')).toBe('briefing');
  await shot(page, 'briefing');

  // A Friday night in Tallinn, 22:00.
  await epd(
    page,
    `e.game.getState().startShift({ seed: 2026, regionId: 'pohja', mode: 'free', difficulty: 'normal',
       start: Date.UTC(2026, 9, 16, 19, 0), hours: 8, playerName: 'Ott Koppel' });
     e.game.getState().setSpeed(0);`,
  );
  await expect.poll(() => epd(page, 'return e.game.getState().screen')).toBe('game');
  await play(page, 75);

  // Busy CAD view: select an incident that has units en route or on scene.
  await epd(
    page,
    `const g = e.game.getState(); const s = g.sim;
     const pick = s.incidentOrder.map((id) => s.incidents[id])
       .filter((i) => i.state === 'dispatched' || i.state === 'onscene')
       .sort((a, b) => a.priority - b.priority)[0];
     if (pick) { g.select({ incidentId: pick.id }, 'incident'); g.focusMap(pick.location.coord, 12.5); }`,
  );
  await shot(page, 'game');

  // Andmebaas: the 2025 legend.
  await epd(page, `e.game.getState().openRegistry('person', 'Okimum')`);
  await page.waitForTimeout(700);
  await shot(page, 'registry');

  // 112 call: advance minute by minute until Häirekeskus connects a caller, then talk.
  const gotCall = await epd<boolean>(
    page,
    `const g = e.game.getState(); const s = g.sim; const { step } = e.engine;
     for (let m = 0; m < 240 && !s.calls.some((c) => !c.endedAt); m++) step(s, ${MIN});
     g.bump(); return s.calls.some((c) => !c.endedAt);`,
  );
  if (gotCall) {
    await epd(
      page,
      `const g = e.game.getState(); const s = g.sim; const { step, cmd } = e.engine;
       const c = s.calls.find((x) => !x.endedAt);
       cmd.answerCall(s, c.id);
       for (const q of ['what', 'where', 'injured', 'suspect']) { cmd.askCall(s, c.id, q); step(s, 8000); }
       g.select({}, 'incident'); g.bump();`,
    );
    await page.waitForTimeout(2500);
    await shot(page, 'call');
    await epd(
      page,
      `const s = e.game.getState().sim; const c = s.calls.find((x) => !x.endedAt);
       if (c) e.engine.cmd.endCall(s, c.id, { action: 'create', priority: s.incidents[c.incidentId].truePriority });`,
    );
  }

  // Statistics after a few more hours.
  await play(page, 150);
  await epd(page, `e.game.getState().setRightTab('stats')`);
  await shot(page, 'stats');

  // End of shift: report with the newspaper.
  await epd(page, 'e.game.getState().endShift()');
  await expect.poll(() => epd(page, 'return e.game.getState().screen')).toBe('report');
  await shot(page, 'report');
  await page.locator('article.sh-paper').scrollIntoViewIfNeeded();
  await shot(page, 'newspaper');

  // Career HQ with a fresh profile.
  await epd(page, `e.career.getState().create('Ott Koppel', '085', 'pohja'); e.game.getState().setScreen('career');`);
  await shot(page, 'career');
});
