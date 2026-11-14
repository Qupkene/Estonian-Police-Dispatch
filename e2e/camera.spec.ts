import { expect, test, type Page } from '@playwright/test';

// Kaamerad (docs/CCTV.md section 14): a street fight under a surveillance camera. The card shows the camera, the
// chunk loads only when it is opened, the picture goes live, the patrol arrives on it, and closing leaves nothing.

const screen = (page: Page) => page.evaluate(() => (window as unknown as { __epd: { game: { getState: () => { screen: string } } } }).__epd.game.getState().screen);
const epd = <T = unknown>(page: Page, body: string) => page.evaluate(`(() => { const e = window.__epd; ${body} })()`) as Promise<T>;

async function bootAndLegacyLogin(page: Page) {
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
async function fightUnderCamera(page: Page, hour = 12): Promise<{ id: string; unitId: string; camera: string }> {
  await epd(
    page,
    `return e.game.getState().startShift({ seed: 2041, regionId: 'pohja', mode: 'free', difficulty: 'normal',
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

/** How many distinct colours (in steps of 16) a screenshot of the picture holds: a flat colour has one. */
async function colours(page: Page): Promise<number> {
  const png = await page.locator('.gm-cam__canvas').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 7) seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    return seen.size;
  }, png.toString('base64'));
}

const win = (page: Page) => page.getByTestId('camera-window');

test.describe('surveillance camera', () => {
  test('opens from the card, plays the patrol arriving and leaves nothing behind', async ({ page }) => {
    test.slow();
    const errors: string[] = [];
    const warnings: string[] = [];
    const chunk: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (/too many active WebGL contexts/i.test(m.text())) warnings.push(m.text());
    });
    page.on('request', (r) => {
      if (/\/assets\/(?:cctv-[^/]+\.js|human-[^/]+\.glb)$/.test(r.url())) chunk.push(r.url());
    });
    await bootAndLegacyLogin(page);
    const { id, unitId, camera } = await fightUnderCamera(page);

    // The card names the camera; the queue marks the row.
    const line = page.locator('.gm-inc__cam');
    await expect(line).toBeVisible({ timeout: 15_000 });
    await expect(line).toContainText(camera);
    await expect(page.locator(`.gm-card[data-incident="${id}"] .gm-card__cam`)).toHaveCount(1);
    const button = page.locator(`[data-camera-toggle="${id}"]`);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    // Nothing of the camera has come down the wire yet.
    expect(chunk).toEqual([]);
    const canvasesBefore = await page.locator('canvas').count();

    await button.click();
    await expect(win(page)).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(win(page)).toHaveAttribute('aria-label', new RegExp(camera.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect.poll(() => win(page).getAttribute('data-state'), { timeout: 90_000, intervals: [500] }).toBe('live');
    expect(chunk.some((u) => /cctv-/.test(u))).toBe(true);
    expect(chunk.some((u) => /human-/.test(u))).toBe(true);
    await expect.poll(() => colours(page), { timeout: 30_000 }).toBeGreaterThan(12);
    await expect(win(page)).toHaveAttribute('data-phase', 'open');

    // Send the patrol, run the game until it is on scene: the camera plays it arriving.
    await epd(
      page,
      `const g = e.game.getState(); const s = g.sim; const { cmd, step } = e.engine;
       cmd.acknowledge(s, '${id}');
       cmd.dispatchUnits(s, '${id}', ['${unitId}']);
       for (let i = 0; i < 400 && s.units['${unitId}'].status !== 'onscene'; i++) step(s, 2000);
       g.setSpeed(1);
       g.bump();`,
    );
    expect(await epd(page, `return e.game.getState().sim.units['${unitId}'].status`)).toBe('onscene');
    await expect.poll(() => win(page).getAttribute('data-phase'), { timeout: 60_000, intervals: [500] }).not.toBe('open');
    await epd(page, 'e.game.getState().setSpeed(0);');

    // The size button: the native size and back.
    const small = (await win(page).boundingBox())!.width;
    await page.getByTestId('camera-size').click();
    await expect.poll(async () => (await win(page).boundingBox())!.width).toBeGreaterThan(small + 100);
    await page.getByTestId('camera-size').click();
    await expect.poll(async () => (await win(page).boundingBox())!.width).toBeLessThan(small + 2);

    // K closes it and opens it again (the chunk is there now); Escape closes it.
    await page.locator('.gm-inc__title').click();
    await page.keyboard.press('k');
    await expect(win(page)).toHaveCount(0);
    await page.keyboard.press('k');
    await expect(win(page)).toBeVisible();
    // Opened by key, the focus is on its close button.
    await expect(page.getByTestId('camera-close')).toBeFocused();
    await expect.poll(() => win(page).getAttribute('data-state'), { timeout: 60_000, intervals: [500] }).toBe('live');
    await page.keyboard.press('Escape');
    await expect(win(page)).toHaveCount(0);
    // Escape closed the camera, not the selection; the focus went back to the card's button.
    expect(await epd(page, 'return e.game.getState().selection.incidentId')).toBe(id);
    await expect(button).toBeFocused();
    await expect(page.locator('canvas')).toHaveCount(canvasesBefore);

    expect(errors, errors.join('\n')).toEqual([]);
    expect(warnings, warnings.join('\n')).toEqual([]);
  });

  test('opened and closed twenty times, it leaves no WebGL context behind', async ({ page }) => {
    test.slow();
    const warnings: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (/too many active WebGL contexts|CONTEXT_LOST/i.test(m.text())) warnings.push(m.text());
    });
    await bootAndLegacyLogin(page);
    const { id } = await fightUnderCamera(page);
    const button = page.locator(`[data-camera-toggle="${id}"]`);
    for (let i = 0; i < 20; i++) {
      await button.click();
      await expect.poll(() => win(page).getAttribute('data-state'), { timeout: 60_000, intervals: [250] }).toBe('live');
      await button.click();
      await expect(win(page)).toHaveCount(0);
    }
    expect(warnings, warnings.join('\n')).toEqual([]);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('on a phone it docks at the top of the map pane, with 44 px controls', async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    await bootAndLegacyLogin(page);
    const { id } = await fightUnderCamera(page);
    // The card is on the panel tab; opening the camera goes to the map, where the picture is.
    await page.locator('.gm-mnav__btn').nth(2).click();
    await page.locator(`[data-camera-toggle="${id}"]`).click();
    await expect(win(page)).toBeVisible();
    await expect.poll(() => win(page).getAttribute('data-state'), { timeout: 90_000, intervals: [500] }).toBe('live');
    const box = (await win(page).boundingBox())!;
    expect(box.x).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThanOrEqual(388);
    const close = (await page.getByTestId('camera-close').boundingBox())!;
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('camera-size')).toBeHidden();
    // Another tab hides it; the map tab shows it again.
    await page.locator('.gm-mnav__btn').nth(1).click();
    await expect(win(page)).toBeHidden();
    await page.locator('.gm-mnav__btn').nth(0).click();
    await expect(win(page)).toBeVisible();
    await page.getByTestId('camera-close').click();
    await expect(win(page)).toHaveCount(0);
  });
});
