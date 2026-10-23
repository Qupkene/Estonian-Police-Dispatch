// @vitest-environment jsdom
// The main menu's daily challenge panel (MenuScreen, shell/Daily.tsx): closed until its Teenistus row is pressed,
// then open (the row says a second press starts it, the map lights the area); Esc, its close button and a click
// elsewhere close it; a second press on the row starts today's challenge as the panel's own button does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { stopLoop, useGame } from '@/store/game';
import { useCareer } from '@/store/career';
import { dailyChallenge, dailyDateOf, todayInTallinn } from '@/sim/daily';
import { baseMap, challengeArea, DESKTOP_VIEW, sectorShape } from '@/ui/screens/shell/dutyMap';

// The game loop runs on requestAnimationFrame: never let it run here.
vi.stubGlobal('requestAnimationFrame', () => 1);
vi.stubGlobal('cancelAnimationFrame', () => {});

beforeEach(() => {
  localStorage.clear();
  stopLoop();
  useGame.setState({ sim: null, report: null, screen: 'menu', user: { name: 'Test', method: 'guest' } });
  useCareer.getState().reset();
});

afterEach(() => {
  cleanup();
  stopLoop();
  useGame.setState({ sim: null, screen: 'menu' });
  vi.restoreAllMocks();
});

async function renderMenu() {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
  // The duty map's canvas has no 2D context in jsdom.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { MenuScreen } = await import('@/ui/screens/MenuScreen');
  const view = render(createElement(MenuScreen));
  const row = view.container.querySelector<HTMLButtonElement>('[data-daily-row]')!;
  const slot = view.container.querySelector<HTMLElement>('.vk-menu__daily')!;
  return { view, row, slot };
}

describe('the menu daily challenge panel', () => {
  it('opens from its row, says what a second press does, and closes with Esc, its button or a click elsewhere', async () => {
    const { view, row, slot } = await renderMenu();
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(row.getAttribute('aria-controls')).toBe('vk-day-panel');
    expect(slot.hasAttribute('inert')).toBe(true);
    expect(slot.className).not.toContain('is-open');
    expect(view.container.querySelector('#vk-day-panel')).not.toBeNull();

    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(slot.hasAttribute('inert')).toBe(false);
    expect(slot.className).toContain('is-open');
    expect(row.textContent).toContain('vajuta uuesti, et alustada');
    expect(screen.getByRole('status').textContent).toMatch(
      /on kaardil märgitud\. Vajuta uuesti, et alustada\./,
    );
    expect(useGame.getState().screen).toBe('menu');

    fireEvent.keyDown(row, { key: 'Escape' });
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(slot.hasAttribute('inert')).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('');

    fireEvent.click(row);
    const close = slot.querySelector<HTMLButtonElement>('.vk-day__close')!;
    close.focus();
    fireEvent.click(close);
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(row);

    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    // A click inside the panel keeps it open; one elsewhere in the menu closes it.
    act(() => slot.querySelector<HTMLElement>('.vk-day__body')!.click());
    expect(row.getAttribute('aria-expanded')).toBe('true');
    act(() => view.container.querySelector<HTMLElement>('.vk-car')!.click());
    expect(row.getAttribute('aria-expanded')).toBe('false');

    // Esc with nothing focused (Safari does not focus a clicked button) closes it as well.
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  it("another row's number key closes it; its own number opens it", async () => {
    const { row } = await renderMenu();
    fireEvent.keyDown(row, { key: '2' });
    expect(row.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(row, { key: '3' });
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  it("a second press on the row starts today's challenge", async () => {
    const { row } = await renderMenu();
    fireEvent.click(row);
    expect(useGame.getState().sim).toBeNull();
    fireEvent.click(row);
    const g = useGame.getState();
    expect(g.screen).toBe('game');
    const today = todayInTallinn();
    expect(dailyDateOf(g.sim)).toBe(today);
    expect(g.sim?.regionId).toBe(dailyChallenge(today).regionId);
  });

  it("the panel's own button starts it the same way", async () => {
    const { slot } = await renderMenu();
    fireEvent.click(slot.querySelector<HTMLButtonElement>('.vk-day__start')!);
    expect(useGame.getState().screen).toBe('game');
    expect(dailyDateOf(useGame.getState().sim)).toBe(todayInTallinn());
  });
});

describe('the lit challenge area on the duty map', () => {
  it("is the challenge's sector, or its prefecture when it is played whole", () => {
    const c = dailyChallenge('2026-10-23');
    expect(c.sector).not.toBe('');
    const s = sectorShape(DESKTOP_VIEW, c.sector)!;
    expect(challengeArea(DESKTOP_VIEW, { sector: c.sector, regionId: c.regionId })).toEqual({
      d: s.d,
      clip: s.clip,
      box: s.box,
    });

    const whole = challengeArea(DESKTOP_VIEW, { sector: '', regionId: 'louna' })!;
    expect(whole.d).toBe(baseMap(DESKTOP_VIEW).prefectures.louna);
    expect(whole.clip).toBeNull();
    const [x0, y0, x1, y1] = whole.box;
    expect(x1 - x0).toBeGreaterThan(50);
    expect(y1 - y0).toBeGreaterThan(50);
    expect(x0).toBeGreaterThan(0);
    expect(y1).toBeLessThan(DESKTOP_VIEW.height);

    expect(challengeArea(DESKTOP_VIEW, null)).toBeNull();
  });
});
