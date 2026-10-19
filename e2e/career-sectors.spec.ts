/**
 * Career with sectors (docs/SECTORS.md): a new career picks Tartu linn on the onboarding screen, the HQ shows
 * the area, the briefing names it and passes it to the shift, and the map fits and dims it. A career from
 * before sectors keeps the whole prefecture.
 */
import { expect, test, type Page } from '@playwright/test';

// The game screen and its map load lazily; under a busy machine that takes a while.
test.setTimeout(180_000);
const LOAD = { timeout: 60_000 };

const epd = <T = unknown>(page: Page, body: string) =>
  page.evaluate(`(() => { const e = window.__epd; ${body} })()`) as Promise<T>;
const screen = (page: Page) => epd<string>(page, 'return e.game.getState().screen');

async function bootAndLegacyLogin(page: Page) {
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect.poll(() => screen(page), { timeout: 30_000 }).toBe('login');
  await page.getByRole('tab', { name: 'Klassika' }).click();
  await page.locator('form.sh-legacy button[type="submit"]').click();
  await expect.poll(() => screen(page), { timeout: 30_000 }).toBe('menu');
}

test('a new career at the Tartu linn desk plays its own area', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await bootAndLegacyLogin(page);
  await epd(page, 'e.career.getState().reset()');

  // Onboarding: the prefecture, then the first sector.
  await page
    .getByRole('button', { name: /Karjäär/ })
    .first()
    .click();
  await expect.poll(() => screen(page)).toBe('career');
  const name = page.getByLabel('Dispetšeri nimi');
  await name.fill('Mari Maasikas');
  await page.locator('.cr-regioncard--louna').click();
  const sectors = page.getByRole('radiogroup', { name: 'Sinu esimene sektor' });
  await expect(sectors.getByRole('radio')).toHaveCount(2);
  const tartu = sectors.getByRole('radio', { name: /Tartu linn/ });
  await expect(tartu).toContainText('keskmine');
  await sectors.getByRole('radio', { name: /Viljandimaa/ }).click();
  await expect(
    page.locator('.cr-onb__sectors svg [data-sector="louna-viljandi"].is-picked').first(),
  ).toBeAttached();
  await tartu.click();
  await expect(tartu).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.locator('.cr-onb__sectors svg [data-sector="louna-tartu"].is-picked').first(),
  ).toBeAttached();
  await page.getByRole('button', { name: 'Asu ametisse' }).click();

  await expect
    .poll(() =>
      epd(
        page,
        'const p = e.career.getState().profile; return p && { region: p.regionId, sectors: p.sectors }',
      ),
    )
    .toEqual({ region: 'louna', sectors: { louna: ['louna-tartu'] } });

  // HQ: the position and the area of responsibility.
  await expect(page.locator('.cr-head__pos')).toHaveText('operatiivinfo haldur');
  const area = page.locator('.cr-area');
  await expect(area).toContainText('Vastutusala');
  await expect(area.locator('.cr-area__row.is-covered')).toHaveText(/Tartu linn/);
  await expect(area.locator('.cr-area__row.is-neighbour')).toContainText('Tartumaa ja Elva');

  // Briefing: the shift's area and the roster by station.
  await page.getByRole('button', { name: /Alusta vahetust · päev/ }).click();
  await expect.poll(() => screen(page)).toBe('briefing');
  const brief = page.locator('.sh-brief__area');
  await expect(brief).toBeVisible();
  await expect(brief.locator('.sh-brief__areaNames')).toHaveText('Tartu linn');
  await expect(brief).toContainText('Tartumaa ja Elva');
  await expect(page.locator('.sh-order__area')).toContainText('Vastutusala: Tartu linn.');
  await expect(page.locator('.sh-roster__station').first()).toContainText('Tartu');

  await page
    .getByRole('button', { name: /Alusta vahetust/ })
    .first()
    .click();
  await expect.poll(() => screen(page), LOAD).toBe('game');
  await epd(page, 'e.game.getState().setSpeed(0)');

  // The shift covers the sector and its crews come from its station.
  const sim = await epd<{ sectors?: string[]; stations: string[] }>(
    page,
    'const s = e.game.getState().sim; return { sectors: s.sectors, stations: [...new Set(Object.values(s.units).map((u) => u.stationId))] }',
  );
  expect(sim.sectors).toEqual(['louna-tartu']);
  expect(sim.stations).toEqual(['lo-tartu']);
  // The game screen loads lazily after the switch.
  await expect(page.locator('.gm-top__area')).toHaveText('Tartu linn', LOAD);

  // The map: the area chip, and the dimmed area once the map has drawn it.
  const map = page.locator('.epdm');
  await expect(map).toHaveAttribute('data-area', 'louna-tartu', LOAD);
  await expect(page.locator('.epdm-area')).toContainText('Tartu linn');
  if (await page.locator('.maplibregl-canvas').count()) {
    await expect(map).toHaveAttribute('data-area-shown', 'louna-tartu', LOAD);
  }

  // A colleague's call for help reads "Abipalve · <sector>".
  const helped = await epd<boolean>(
    page,
    `const g = e.game.getState(); const s = g.sim;
     for (let m = 0; m < 240 && !s.incidentOrder.length; m++) e.engine.step(s, 60000);
     const inc = s.incidents[s.incidentOrder[0]];
     if (!inc) return false;
     inc.tags.push('help:louna-tartumaa');
     g.select({ incidentId: inc.id }, 'incident'); g.bump(); return true;`,
  );
  if (helped) await expect(page.locator('.gm-help').first()).toContainText('Abipalve · Tartumaa ja Elva');

  expect(errors).toEqual([]);
});

test('a career from before sectors keeps the whole prefecture', async ({ page }) => {
  await bootAndLegacyLogin(page);
  // As an old save loads: no sectors, no sectorsChangedDay.
  await epd(
    page,
    `const c = e.career.getState(); c.reset(); c.create('Ott Koppel', '085', 'pohja');
     c.update((p) => { const { sectors, sectorsChangedDay, offer, openPosts, ...old } = p; return old; });
     e.game.getState().setScreen('career');`,
  );
  await expect(page.locator('.cr-head__pos')).toHaveText('vahetuse vanem');
  await expect(page.locator('.cr-area .cr-area__region')).toContainText(/kõik \d+ sektorit/);
  await expect(page.locator('.cr-offer')).toHaveCount(0);

  await page.getByRole('button', { name: /Alusta vahetust · päev/ }).click();
  await expect.poll(() => screen(page)).toBe('briefing');
  await expect(page.locator('.sh-brief__area')).toHaveCount(0);
  await page
    .getByRole('button', { name: /Alusta vahetust/ })
    .first()
    .click();
  await expect.poll(() => screen(page), LOAD).toBe('game');
  expect(await epd(page, 'return e.game.getState().sim.sectors ?? null')).toBeNull();
  await expect(page.locator('.epdm')).toBeVisible(LOAD);
  await expect(page.locator('.gm-top')).toContainText('Juhtimiskeskus');
  await expect(page.locator('.epdm')).not.toHaveAttribute('data-area', /./);
  await expect(page.locator('.epdm-area')).toHaveCount(0);
  await expect(page.locator('.gm-top__area')).toHaveCount(0);
});
