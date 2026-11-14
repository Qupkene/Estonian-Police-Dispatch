import { expect, test, type Page } from '@playwright/test';

// Kaamerad (docs/CCTV.md section 14): a street fight under a surveillance camera. The card shows the camera, the
// chunk loads only when it is opened, the picture goes live and moves, the patrol's car arrives on it, the map keeps
// the incident in sight, and closing lets every graphics context go. A camera that throws while drawing, or whose
// chunk cannot be fetched, ends in a note whose button can work and never loses a shift it cannot save. An answered
// 112 call folds the window to its title bar above the call card.
//
// The waits are a software renderer's on a loaded machine (the first frame can come seconds after "live"), not a
// fast desktop's.

const screen = (page: Page) => page.evaluate(() => (window as unknown as { __epd: { game: { getState: () => { screen: string } } } }).__epd.game.getState().screen);
const epd = <T = unknown>(page: Page, body: string) => page.evaluate(`(() => { const e = window.__epd; ${body} })()`) as Promise<T>;

/**
 * Before the page loads: keep a weak handle on every WebGL context and the canvas it belongs to, so a test can ask
 * whether the camera's were let go; and a switch that makes drawing on the camera's canvas throw.
 */
const HOOKS = `(() => {
  const ctxs = [];
  window.__cam = { ctxs, boom: false };
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const c = orig.call(this, type, ...rest);
    if (c && /webgl/.test(type) && !ctxs.some((x) => x.ref.deref() === c)) ctxs.push({ ref: new WeakRef(c), cam: this.classList.contains('gm-cam__canvas') });
    return c;
  };
  const draw = WebGL2RenderingContext.prototype.drawElements;
  WebGL2RenderingContext.prototype.drawElements = function (...a) {
    if (window.__cam.boom && this.canvas && this.canvas.classList && this.canvas.classList.contains('gm-cam__canvas')) throw new Error('test: drawing failed');
    return draw.apply(this, a);
  };
  window.__cam.liveCams = () => ctxs.filter((x) => x.cam).map((x) => x.ref.deref()).filter((c) => c && !c.isContextLost()).length;
})();`;

/** Camera contexts that are still alive (not lost). */
const liveCams = (page: Page) => page.evaluate(() => (window as unknown as { __cam: { liveCams: () => number } }).__cam.liveCams());

/** WebGL 2 contexts the page still holds after a garbage collection, lost or not (Chrome DevTools protocol). */
async function heldContexts(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('HeapProfiler.collectGarbage');
    const proto = await cdp.send('Runtime.evaluate', { expression: 'WebGL2RenderingContext.prototype' });
    const found = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId! });
    const n = await cdp.send('Runtime.callFunctionOn', { objectId: found.objects.objectId!, functionDeclaration: 'function () { return this.length; }', returnByValue: true });
    return n.result.value as number;
  } finally {
    await cdp.detach();
  }
}

async function bootAndLegacyLogin(page: Page) {
  await page.addInitScript(HOOKS);
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('login');
  await page.getByRole('tab', { name: 'Klassika' }).click();
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('menu');
}

/**
 * A paused shift in Tallinn at `hour` (local), and a street fight 1.5 to 3 km from a free patrol at a place a
 * camera sees: tried at a few points around the patrol, the ones without a camera taken out again.
 */
async function fightUnderCamera(page: Page, hour = 12, mode: 'free' | 'director' = 'free'): Promise<{ id: string; unitId: string; camera: string }> {
  await epd(
    page,
    `return e.game.getState().startShift({ seed: 2041, regionId: 'pohja', mode: '${mode}', difficulty: 'normal',
       start: Date.UTC(2026, 9, 16, ${hour - 3}, 0), hours: 8, playerName: 'Test', weather: 'clear' })
     .then(() => e.game.getState().setSpeed(0));`,
  );
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('game');
  await expect(page.locator('.maplibregl-canvas, .map-fallback').first()).toBeVisible({ timeout: 20_000 });
  const found = await epd<{ id: string; unitId: string; camera: string } | null>(
    page,
    `const g = e.game.getState(); const s = g.sim; const { cmd } = e.engine;
     const unit = s.unitOrder.map((u) => s.units[u]).find((u) => u.type === 'patrol' && u.status === 'available' && u.pos[1] > 59.4 && u.pos[1] < 59.47 && u.pos[0] > 24.65 && u.pos[0] < 24.85);
     if (!unit) return null;
     for (let i = 0; i < 80; i++) {
       const a = i * 2.39996, r = 0.015 + (i % 7) * 0.0025;
       const id = cmd.directorSpawn(s, { templateId: 'violence_bar_fight_outside', coord: [unit.pos[0] + Math.cos(a) * r * 1.9, unit.pos[1] + Math.sin(a) * r] });
       if (!id) continue;
       const inc = s.incidents[id];
       const cam = e.camera.cameraOf(inc, s.now);
       if (cam) {
         inc.expiresAt = undefined;
         g.select({ incidentId: id }, 'incident');
         g.focusMap(inc.location.coord, 15);
         g.bump();
         return { id, unitId: unit.id, camera: cam.name };
       }
       delete s.incidents[id];
       s.incidentOrder = s.incidentOrder.filter((x) => x !== id);
     }
     return null;`,
  );
  expect(found, 'a street fight under a camera').not.toBeNull();
  return found!;
}

const win = (page: Page) => page.getByTestId('camera-window');
const camState = (page: Page) => win(page).getAttribute('data-state');
const shot = (page: Page) => page.locator('.gm-cam__canvas').screenshot({ timeout: 60_000 });
/** The software renderer's first frame can come seconds after the window turns "live". */
const SLOW = 30_000;

/** Do two boxes overlap? */
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe('surveillance camera', () => {
  test('opens from the card, plays the patrol arriving, keeps the incident in sight and lets everything go', async ({ page }) => {
    // Boot, two opens to live (11 to 20 s each on a loaded software renderer: shaders are compiled before the first
    // frame) and the patrol's arrival: well under this.
    test.setTimeout(420_000);
    const errors: string[] = [];
    const chunk: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => {
      if (/\/assets\/(?:cctv-[^/]+\.js|human-[^/]+\.glb)$/.test(r.url())) chunk.push(r.url());
    });
    await bootAndLegacyLogin(page);
    const { id, unitId, camera } = await fightUnderCamera(page);
    const held = await heldContexts(page);

    // The card names the camera; the queue marks the row.
    const line = page.locator('.gm-inc__cam');
    await expect(line).toBeVisible({ timeout: 15_000 });
    await expect(line).toContainText(camera);
    await expect(page.locator(`.gm-card[data-incident="${id}"] .gm-card__cam`)).toHaveCount(1);
    const button = page.locator(`[data-camera-toggle="${id}"]`);
    await expect(button).toHaveText(/Kaamera/);
    // Nothing of the camera has come down the wire yet.
    expect(chunk).toEqual([]);

    await button.click();
    await expect(win(page)).toBeVisible({ timeout: SLOW });
    // The card's button now closes the camera (its words say so).
    await expect(button).toHaveText(/Sulge kaamera/);
    await expect(win(page)).toHaveAttribute('aria-label', new RegExp(camera.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    // The title names the incident too: two incidents can share a camera.
    const number = await epd<string>(page, `return e.game.getState().sim.incidents['${id}'].number`);
    await expect(page.locator('.gm-cam__name')).toContainText(number);
    await expect.poll(() => camState(page), { timeout: 60_000, intervals: [500] }).toBe('live');
    expect(chunk.some((u) => /cctv-/.test(u))).toBe(true);
    expect(chunk.some((u) => /human-/.test(u))).toBe(true);
    await expect(win(page)).toHaveAttribute('data-phase', 'open', { timeout: SLOW });
    // The fight's people are in the frame; no car yet.
    await expect.poll(async () => Number(await win(page).getAttribute('data-people')), { timeout: SLOW }).toBeGreaterThan(1);

    // The map eased so that the incident's marker shows beside the window, not under it.
    const marker = page.locator('.epdm-inc.is-sel');
    await expect
      .poll(async () => {
        const m = await marker.boundingBox();
        const w = await win(page).boundingBox();
        return !!m && !!w && !overlap(m, w);
      }, { timeout: SLOW })
      .toBe(true);

    // Paused, the picture stands; running, it moves.
    const a = await shot(page);
    await page.waitForTimeout(1000);
    expect((await shot(page)).equals(a)).toBe(true);
    await epd(page, 'e.game.getState().setSpeed(1);');
    await expect.poll(async () => (await shot(page)).equals(a), { timeout: SLOW }).toBe(false);

    // Send the patrol, run the game until it is on scene: its car arrives on the picture.
    await epd(
      page,
      `const g = e.game.getState(); const s = g.sim; const { cmd, step } = e.engine;
       cmd.acknowledge(s, '${id}');
       cmd.dispatchUnits(s, '${id}', ['${unitId}']);
       for (let i = 0; i < 400 && s.units['${unitId}'].status !== 'onscene'; i++) step(s, 2000);
       g.bump();`,
    );
    expect(await epd(page, `return e.game.getState().sim.units['${unitId}'].status`)).toBe('onscene');
    await expect.poll(async () => Number(await win(page).getAttribute('data-cars')), { timeout: 60_000, intervals: [500] }).toBeGreaterThan(0);
    await expect.poll(() => win(page).getAttribute('data-phase'), { timeout: 60_000, intervals: [500] }).not.toBe('open');
    await epd(page, 'e.game.getState().setSpeed(0);');

    // The zoom buttons from the keyboard: at either limit the focus moves to the other button, never to the page.
    const [zoomOut, zoomIn] = [page.locator('.gm-cam__btn--zoom').nth(0), page.locator('.gm-cam__btn--zoom').nth(1)];
    await zoomIn.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Enter');
    await expect(zoomIn).toBeDisabled();
    await expect(zoomOut).toBeFocused();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Enter');
    await expect(zoomOut).toBeDisabled();
    await expect(zoomIn).toBeFocused();

    // The size button: the native size and back. Its label says what it does, with no "pressed" state beside it.
    const size = page.getByTestId('camera-size');
    await expect(size).not.toHaveAttribute('aria-pressed');
    await expect(size).toHaveAttribute('aria-label', 'Suurem pilt');
    const small = (await win(page).boundingBox())!.width;
    await size.click();
    await expect.poll(async () => (await win(page).boundingBox())!.width, { timeout: SLOW }).toBeGreaterThan(small + 100);
    await expect(size).toHaveAttribute('aria-label', 'Väiksem pilt');
    await size.click();
    await expect.poll(async () => (await win(page).boundingBox())!.width, { timeout: SLOW }).toBeLessThan(small + 2);

    // The title bar: the camera's code and the incident's number are never cut, at any width from the least one up,
    // paused or running, in Estonian or English. The whole number shows while it fits beside the code; else only its
    // last part does, and the place name goes.
    const short = number.slice(number.lastIndexOf('-') + 1);
    const title = () =>
      page.evaluate(() => {
        const name = document.querySelector('.gm-cam__name')!.getBoundingClientRect();
        const shown = [...document.querySelectorAll<HTMLElement>('.gm-cam__code, .gm-cam__num, .gm-cam__num-short')].filter((el) => el.offsetWidth > 0);
        const label = document.querySelector<HTMLElement>('.gm-cam__label');
        return {
          width: Math.round(document.querySelector<HTMLElement>('.gm-cam')!.getBoundingClientRect().width),
          shown: shown.map((el) => el.textContent),
          cut: shown.filter((el) => el.getBoundingClientRect().right > name.right + 0.5).length,
          // How much room the place name had left: with the short number shown, the whole one would not have fitted.
          spare: name.right - Math.max(...shown.map((el) => el.getBoundingClientRect().right)) + (label?.offsetWidth ?? 0),
        };
      });
    const fullW = await page.evaluate(() => {
      const num = document.querySelector<HTMLElement>('.gm-cam__num')!;
      const short = document.querySelector<HTMLElement>('.gm-cam__num-short')!;
      // The whole number's width less the short one's, measured off the page's flow.
      const probe = (text: string) => {
        const s = document.createElement('span');
        s.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
        s.textContent = text;
        num.parentElement!.appendChild(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return w;
      };
      return probe(num.textContent!) - probe(short.textContent!);
    });
    const sweep = async (when: string) => {
      for (const w of [240, 260, 280, 300, 304, 312, 320, 336, 360, 372, 384, 400, 448, 520, 640]) {
        await win(page).evaluate((el, px) => (el.style.width = `${px}px`), w);
        // Measured after the window's next fit (a resize observer and a render).
        await expect.poll(async () => (await title()).width, { timeout: SLOW }).toBe(w);
        await expect
          .poll(async () => {
            const r = await title();
            if (r.cut) return `${when} ${w}px: cut ${JSON.stringify(r.shown)}`;
            if (r.shown[1] === number) return 'ok';
            if (r.shown[1] !== short) return `${when} ${w}px: shows ${JSON.stringify(r.shown)}`;
            // Shortened only when the whole number had no room.
            return r.spare < fullW ? 'ok' : `${when} ${w}px: short with ${r.spare}px spare`;
          }, { timeout: SLOW })
          .toBe('ok');
        expect((await title()).shown[0]).toMatch(/^K-\d{4}$/);
      }
      expect((await title()).shown).toEqual([expect.stringMatching(/^K-\d{4}$/), number]);
    };
    await sweep('paused');
    await epd(page, 'e.game.getState().setSpeed(1);');
    await sweep('running');
    await epd(page, 'e.game.getState().setSpeed(0); e.settings.getState().set({ lang: "en" });');
    await sweep('paused, English');
    await epd(page, 'e.settings.getState().set({ lang: "et" });');
    await win(page).evaluate((el) => (el.style.width = '240px'));
    await expect.poll(async () => (await title()).shown, { timeout: SLOW }).toEqual([expect.stringMatching(/^K-\d{4}$/), short]);
    await expect(page.locator('.gm-cam__label')).toBeHidden();
    // The window sets its own width again on the next fit.
    await size.click();
    await size.click();

    // Dragged to the lower right and enlarged there, it stays inside the map.
    const bar = (await page.locator('.gm-cam__bar').boundingBox())!;
    await page.mouse.move(bar.x + 40, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + 900, bar.y + 900, { steps: 6 });
    await page.mouse.up();
    await page.getByTestId('camera-size').click();
    const map = (await page.locator('.gm-map').boundingBox())!;
    await expect
      .poll(async () => {
        const w = (await win(page).boundingBox())!;
        return w.x >= map.x && w.y >= map.y && w.x + w.width <= map.x + map.width + 0.5 && w.y + w.height <= map.y + map.height + 0.5;
      }, { timeout: SLOW })
      .toBe(true);

    // From the card, K goes to the window first; a second K closes it and gives the focus back to the card.
    await page.locator('.gm-inc__title').click();
    await page.keyboard.press('k');
    await expect(page.getByTestId('camera-close')).toBeFocused({ timeout: SLOW });
    await page.keyboard.press('k');
    await expect(win(page)).toHaveCount(0, { timeout: SLOW });
    await expect(button).toBeFocused({ timeout: SLOW });
    expect(await liveCams(page)).toBe(0);
    // K opens it again (the chunk is there now), with the focus on its close button; Escape closes it.
    await page.keyboard.press('k');
    await expect(win(page)).toBeVisible({ timeout: SLOW });
    await expect(page.getByTestId('camera-close')).toBeFocused({ timeout: SLOW });
    await expect.poll(() => camState(page), { timeout: 60_000, intervals: [500] }).toBe('live');
    await page.keyboard.press('Escape');
    await expect(win(page)).toHaveCount(0, { timeout: SLOW });
    // Escape closed the camera, not the selection; the focus went back to the card's button.
    expect(await epd(page, 'return e.game.getState().selection.incidentId')).toBe(id);
    await expect(button).toBeFocused({ timeout: SLOW });

    // Nothing is left: every camera context lost, and none of them still held once garbage is collected.
    expect(await liveCams(page)).toBe(0);
    await expect.poll(() => heldContexts(page), { timeout: SLOW }).toBeLessThanOrEqual(held);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('opened and closed three times, it keeps no graphics context', async ({ page }) => {
    // Three opens to live, each up to the 60 s connect deadline on a slow machine.
    test.setTimeout(360_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await bootAndLegacyLogin(page);
    const { id } = await fightUnderCamera(page);
    const held = await heldContexts(page);
    const button = page.locator(`[data-camera-toggle="${id}"]`);
    for (let i = 0; i < 3; i++) {
      await button.click();
      await expect.poll(() => camState(page), { timeout: 60_000, intervals: [250] }).toBe('live');
      await button.click();
      await expect(win(page)).toHaveCount(0, { timeout: SLOW });
      expect(await liveCams(page)).toBe(0);
      await expect.poll(() => heldContexts(page), { timeout: SLOW }).toBeLessThanOrEqual(held);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a picture that throws while drawing ends in "failed", and its retry brings it back', async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await bootAndLegacyLogin(page);
    const { id } = await fightUnderCamera(page);
    await page.locator(`[data-camera-toggle="${id}"]`).click();
    await expect.poll(() => camState(page), { timeout: 60_000, intervals: [250] }).toBe('live');
    await page.evaluate(() => ((window as unknown as { __cam: { boom: boolean } }).__cam.boom = true));
    // The game runs: the next frame throws.
    await epd(page, 'e.game.getState().setSpeed(1);');
    await expect.poll(() => camState(page), { timeout: SLOW }).toBe('failed');
    await expect(page.getByTestId('camera-retry')).toBeVisible();
    // The failed picture's context is let go at once, not when the window closes.
    expect(await liveCams(page)).toBe(0);
    await page.evaluate(() => ((window as unknown as { __cam: { boom: boolean } }).__cam.boom = false));
    await page.getByTestId('camera-retry').click();
    await expect.poll(() => camState(page), { timeout: 60_000, intervals: [250] }).toBe('live');
    // The game went on all along, and nothing escaped as an uncaught error.
    expect(await screen(page)).toBe('game');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('on a phone it docks at the top of the map pane, with 44 px controls, the map tools below it', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await bootAndLegacyLogin(page);
    const { id } = await fightUnderCamera(page);
    // The card is on the panel tab; opening the camera goes to the map, where the picture is.
    await page.locator('.gm-mnav__btn').nth(2).click();
    await page.locator(`[data-camera-toggle="${id}"]`).click();
    await expect(win(page)).toBeVisible({ timeout: SLOW });
    await expect.poll(() => camState(page), { timeout: 60_000, intervals: [500] }).toBe('live');
    const box = (await win(page).boundingBox())!;
    expect(box.x).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThanOrEqual(388);
    const close = (await page.getByTestId('camera-close').boundingBox())!;
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('camera-size')).toBeHidden();
    // The map's tools are below the window, not under it.
    await expect.poll(async () => (await page.locator('.epdm-tools').boundingBox())!.y, { timeout: SLOW }).toBeGreaterThanOrEqual(box.y + box.height);
    // Another tab hides it; the map tab shows it again.
    await page.locator('.gm-mnav__btn').nth(1).click();
    await expect(win(page)).toBeHidden();
    await page.locator('.gm-mnav__btn').nth(0).click();
    await expect(win(page)).toBeVisible();
    await page.getByTestId('camera-close').click();
    await expect(win(page)).toHaveCount(0);
  });

  test('an answered 112 call folds the window to its title bar above the call card; the call ending unfolds it', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await bootAndLegacyLogin(page);
    const { id } = await fightUnderCamera(page);
    await page.locator(`[data-camera-toggle="${id}"]`).click();
    await expect.poll(() => camState(page), { timeout: 60_000, intervals: [500] }).toBe('live');
    const before = (await win(page).boundingBox())!;
    // A call rings: it may cover the bottom of the picture, the window stays as it is.
    const call = await epd<string>(
      page,
      `const g = e.game.getState(); const s = g.sim; const u = s.units[s.unitOrder.find((x) => s.units[x].type === 'patrol')];
       const inc = s.incidents[e.engine.cmd.directorSpawn(s, { templateId: 'domestic_violence', coord: [u.pos[0] + 0.01, u.pos[1] + 0.004] })];
       inc.source = 'call'; s.flags['hidden:' + inc.id] = true;
       const c = { id: 'c' + (++s.seq.call), incidentId: inc.id, ringingSince: s.now, mood: 'calm', lang: 'et', lines: [], asked: [], learned: [] };
       s.calls.push(c); g.bump(); return c.id;`,
    );
    await expect(page.locator('.tl-call.is-ringing')).toBeVisible({ timeout: SLOW });
    await expect(win(page)).not.toHaveClass(/is-folded/);
    // Answered, the card fills the map: the window folds to its bar (lamp, code, number, close) above the card. Not
    // one frame shows it under the card, also while the screen still gives the map its short row (the first seconds).
    await page.locator('.tl-call__answer').click();
    const under = await page.evaluate(
      () =>
        new Promise<string[]>((done) => {
          const bad: string[] = [];
          const t0 = performance.now();
          const frame = () => {
            const w = document.querySelector('.gm-cam')?.getBoundingClientRect();
            const c = document.querySelector('.tl-call:not(.is-ringing)')?.getBoundingClientRect();
            if (w && c && w.bottom > c.top + 0.5 && w.top < c.bottom && w.left < c.right && c.left < w.right)
              bad.push(`${Math.round(performance.now() - t0)} ms: window ${Math.round(w.top)}-${Math.round(w.bottom)}, card from ${Math.round(c.top)}`);
            if (performance.now() - t0 < 8000) requestAnimationFrame(frame);
            else done(bad);
          };
          requestAnimationFrame(frame);
        }),
    );
    expect(under, under.join('\n')).toEqual([]);
    await expect(win(page)).toHaveClass(/is-folded/, { timeout: SLOW });
    await expect(page.locator('.gm-cam__picture')).toBeHidden();
    await expect(page.locator('.gm-cam__btn--zoom').first()).toBeHidden();
    await expect(page.getByTestId('camera-close')).toBeVisible();
    await expect(page.locator('.gm-cam__code')).toBeVisible();
    await expect(page.locator('.gm-cam__case')).toBeVisible();
    await expect
      .poll(
        async () => {
          const w = (await win(page).boundingBox())!;
          const c = (await page.locator('.tl-call').boundingBox())!;
          return w.y + w.height <= c.y + 0.5;
        },
        { timeout: SLOW },
      )
      .toBe(true);
    // The call ends: the window comes back as it was, drawing again.
    await epd(page, `const g = e.game.getState(); g.sim.calls = g.sim.calls.filter((c) => c.id !== '${call}'); g.bump();`);
    await expect(page.locator('.tl-call')).toHaveCount(0, { timeout: SLOW });
    await expect(win(page)).not.toHaveClass(/is-folded/, { timeout: SLOW });
    await expect(page.locator('.gm-cam__picture')).toBeVisible();
    await expect.poll(async () => (await win(page).boundingBox())!.width, { timeout: SLOW }).toBeCloseTo(before.width, 0);
    expect(await camState(page)).toBe('live');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('surveillance camera without its chunk', () => {
  // The routes below must see the chunk's request, not the service worker.
  test.use({ serviceWorkers: 'block' });
  const CHUNK = /\/assets\/cctv-[^/]+\.js$/;

  test('a chunk that failed to load offers a reload of the page that saves the shift first', async ({ page }) => {
    test.setTimeout(180_000);
    await page.route(CHUNK, (r) => r.abort());
    await bootAndLegacyLogin(page);
    const { id } = await fightUnderCamera(page);
    await page.locator(`[data-camera-toggle="${id}"]`).click();
    await expect.poll(() => camState(page), { timeout: 60_000 }).toBe('reload');
    await expect(page.getByTestId('camera-retry')).toHaveCount(0);
    await expect(win(page)).toContainText('Enne laadimist salvestatakse vahetus.');
    await page.unroute(CHUNK);
    const now = await epd<number>(page, 'return e.game.getState().sim.now');
    // The browser keeps the failed import for the page's life: one press saves the shift and reloads the page.
    const reload = page.waitForEvent('framenavigated', { timeout: SLOW });
    await page.getByTestId('camera-reload').click();
    await reload;
    await page.waitForLoadState('load');
    const saved = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => /autosave$/.test(k))
        .map((k) => JSON.parse(localStorage.getItem(k)!) as { seed: number; mode: string; now: number }),
    );
    expect(saved).toContainEqual(expect.objectContaining({ seed: 2041, mode: 'free', now }));
  });

  test('in a director-mode shift, which cannot be saved, the note says so and only a second press reloads', async ({ page }) => {
    test.setTimeout(180_000);
    await page.route(CHUNK, (r) => r.abort());
    await bootAndLegacyLogin(page);
    const { id } = await fightUnderCamera(page, 12, 'director');
    await page.locator(`[data-camera-toggle="${id}"]`).click();
    await expect.poll(() => camState(page), { timeout: 60_000 }).toBe('reload');
    await expect(win(page)).toContainText('Seda vahetust ei saa salvestada: laadimine lõpetab selle.');
    await expect(win(page)).not.toContainText('salvestatakse');
    await page.unroute(CHUNK);
    let navigated = false;
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) navigated = true;
    });
    // The first press reloads nothing: it asks again.
    const button = page.getByTestId('camera-reload');
    await button.click();
    await expect(button).toHaveText('Lae siiski uuesti', { timeout: SLOW });
    await expect(win(page)).toContainText('Vajuta uuesti, kui oled kindel.');
    await page.waitForTimeout(2000);
    expect(navigated).toBe(false);
    expect(await screen(page)).toBe('game');
    // The second, deliberate press reloads.
    const reload = page.waitForEvent('framenavigated', { timeout: SLOW });
    await button.click();
    await reload;
  });
});
