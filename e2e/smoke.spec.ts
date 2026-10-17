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
  await expect(page.getByText('Mitteametlik fännimäng', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: /Kiirmäng/ }).first().click();
  await expect.poll(() => screen(page)).toBe('briefing');
  await page.getByRole('button', { name: /Alusta vahetust/ }).first().click();
  await expect.poll(() => screen(page), { timeout: 20_000 }).toBe('game');

  // Map canvas and CAD chrome are up.
  await expect(page.locator('.maplibregl-canvas, .map-fallback, [class*="nowebgl"]').first()).toBeVisible({ timeout: 20_000 });

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
