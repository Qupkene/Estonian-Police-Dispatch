// @vitest-environment jsdom
// Shift lifecycle and robustness of the game store: one report and one payout per shift, saves on
// hide and close, save validation, no re-renders while paused, director state per shift, and the
// app error boundary.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  autosave,
  isValidSave,
  loadAutosave,
  saveNow,
  setCrashed,
  shiftKeyOf,
  stopLoop,
  useGame,
} from '@/store/game';
import { useCareer } from '@/store/career';
import { useDirector } from '@/ui/tools/directorStore';
import { playScene, stopScene } from '@/ui/tools/lib/sceneRunner';
import { SCENES } from '@/ui/tools/lib/scenes';
import { regionSummary } from '@/ui/screens/shell/helpers';
import { AppBoundary, isChunkError } from '@/app/AppBoundary';
import { TEMPLATES } from '@/data/incidents';
import { step } from '@/sim/engine';
import type { LngLat, NewShiftOptions, RegionId, SimState } from '@/sim/types';

// The game loop runs on requestAnimationFrame: drive it by hand.
let rafCb: FrameRequestCallback | null = null;
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  rafCb = cb;
  return 1;
});
vi.stubGlobal('cancelAnimationFrame', () => {
  rafCb = null;
});
const frame = (ts: number) => rafCb?.(ts);

const KEY = 'epd:autosave';
const opts = (over: Partial<NewShiftOptions> = {}): NewShiftOptions => ({
  seed: 7,
  regionId: 'pohja',
  mode: 'free',
  difficulty: 'normal',
  start: Date.UTC(2026, 9, 16, 6, 0),
  hours: 8,
  playerName: 'Test Mängija',
  ...over,
});
const g = () => useGame.getState();
const sim = () => useGame.getState().sim as SimState;
const setVisibility = (v: DocumentVisibilityState) =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });

beforeEach(() => {
  localStorage.clear();
  setCrashed(false);
  stopScene();
  useDirector.getState().reset();
  stopLoop();
  useGame.setState({ sim: null, report: null, screen: 'menu', speedIndex: 1, realtime: false });
  useCareer.getState().reset();
  setVisibility('visible');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a finished shift ends in exactly one report', () => {
  it('ending early settles the shift: no second report, nothing saved on close, never offered again', () => {
    g().startShift(opts());
    const s = sim();
    autosave(s); // a save from earlier in the shift
    expect(loadAutosave()).not.toBeNull();

    const report = g().endShift();
    expect(report).not.toBeNull();
    expect(s.ended).toBe(true);
    expect(report!.shiftKey).toBe(shiftKeyOf(s));
    expect(loadAutosave()).toBeNull();
    // A second click on the report button returns the same report instead of building another one.
    expect(g().endShift()).toBe(report);

    // Closing or hiding the tab on the report screen does not bring the shift back.
    window.dispatchEvent(new Event('beforeunload'));
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(localStorage.getItem(KEY)).toBeNull();
    autosave(s);
    expect(localStorage.getItem(KEY)).toBeNull();

    // Even a copy written by some other route is refused and removed.
    localStorage.setItem(KEY, JSON.stringify(s));
    expect(loadAutosave()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('a shift whose clock ran out survives a reload and opens its report once', () => {
    g().startShift(opts());
    const s = sim();
    s.now = s.endTime;
    s.ended = true; // what the engine does when the time is up
    // The 30 s loop save still runs while the end dialog is open: the report is pending, not lost.
    for (let i = 1; i <= 130; i++) frame(i * 250);
    const saved = loadAutosave();
    expect(saved?.ended).toBe(true);

    // Reload: a fresh page finds the pending report.
    stopLoop();
    useGame.setState({ sim: null, screen: 'menu' });
    g().resumeShift(loadAutosave()!);
    expect(g().screen).toBe('report');
    expect(g().report?.shiftKey).toBe(shiftKeyOf(s));
    expect(loadAutosave()).toBeNull();
  });

  it('a career shift pays out once, also when a copy of its report comes back', () => {
    useCareer.getState().create('Test Mängija', '001', 'pohja');
    g().startShift(opts({ mode: 'career' }));
    const report = g().endShift()!;
    useCareer.getState().applyReport(report);
    const paid = useCareer.getState().profile!;
    expect(paid.paidShifts).toContain(report.shiftKey);

    expect(useCareer.getState().applyReport({ ...report })).toEqual([]);
    expect(useCareer.getState().profile).toBe(paid);

    // The next shift is a different shift and pays.
    g().quitShift();
    g().startShift(opts({ mode: 'career', seed: 8 }));
    const next = g().endShift()!;
    expect(next.shiftKey).not.toBe(report.shiftKey);
    useCareer.getState().applyReport(next);
    expect(useCareer.getState().profile).not.toBe(paid);
    expect(useCareer.getState().profile!.paidShifts).toEqual([report.shiftKey, next.shiftKey]);
  });
});

describe('saved shift validation', () => {
  const realSave = (): Record<string, unknown> => {
    g().startShift(opts());
    const raw = JSON.parse(JSON.stringify(sim())) as Record<string, unknown>;
    g().quitShift();
    return raw;
  };

  it('accepts a real save and repairs the transient event list', () => {
    const raw = realSave();
    delete raw.events;
    expect(isValidSave(raw)).toBe(true);
    expect(raw.events).toEqual([]);
  });

  it('rejects saves the menu or the game cannot use, and removes them from the browser', () => {
    const cases: unknown[] = [
      { version: 2 },
      { ...realSave(), regionId: 'saared' },
      { ...realSave(), mode: 'arcade' },
      { ...realSave(), now: null },
      { ...realSave(), calls: undefined },
      { ...realSave(), weather: undefined },
      { ...realSave(), flags: undefined },
      { ...realSave(), version: 3 },
    ];
    for (const c of cases) {
      expect(isValidSave(c)).toBe(false);
      localStorage.setItem(KEY, JSON.stringify(c));
      expect(loadAutosave()).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
    }
    localStorage.setItem(KEY, '{not json');
    expect(loadAutosave()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('the menu summary never crashes on an unknown prefecture', () => {
    expect(() => regionSummary('saared' as RegionId)).not.toThrow();
    expect(regionSummary('saared' as RegionId).name.et).toBeTruthy();
  });
});

describe('autosave on hide and close', () => {
  it('saves when the tab is hidden or the page is hidden, once per change', () => {
    g().startShift(opts());
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(localStorage.getItem(KEY)).not.toBeNull();

    // pagehide right after visibilitychange: nothing changed, no second write.
    localStorage.clear();
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(KEY)).toBeNull();

    step(sim(), 60_000);
    window.dispatchEvent(new Event('pagehide'));
    expect((JSON.parse(localStorage.getItem(KEY)!) as SimState).now).toBe(sim().now);
  });

  it('does not save director shifts or a crashed screen', () => {
    g().startShift(opts({ mode: 'director' }));
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(KEY)).toBeNull();

    g().quitShift();
    g().startShift(opts());
    setCrashed(true);
    window.dispatchEvent(new Event('beforeunload'));
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(saveNow()).toBe(false);
    setCrashed(false);
    expect(saveNow()).toBe(true);
  });
});

describe('paused game', () => {
  it('does not re-render while paused, does while running', () => {
    g().startShift(opts());
    g().setSpeed(0);
    const t0 = g().tick;
    for (let i = 1; i <= 40; i++) frame(i * 50);
    expect(g().tick).toBe(t0);

    g().setSpeed(1);
    for (let i = 41; i <= 80; i++) frame(i * 50);
    expect(g().tick).toBeGreaterThan(t0);
  });
});

describe('director state stays in its shift', () => {
  it('an armed placement does nothing in the next quick-play shift', () => {
    g().startShift(opts({ mode: 'director' }));
    useDirector.getState().setPlacing({ kind: 'incident', templateId: TEMPLATES[0].id });
    g().quitShift();
    g().startShift(opts({ seed: 9 }));
    const before = sim().incidentOrder.length;
    expect(useDirector.getState().commitPlacing([24.75, 59.43])).toBeNull();
    expect(sim().incidentOrder.length).toBe(before);
    expect(useDirector.getState().placing).toBeNull();
  });

  it('a running scene stops when the shift changes instead of spawning into the new one', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    g().startShift(opts({ mode: 'director' }));
    playScene(SCENES[0]);
    expect(useDirector.getState().scene).not.toBeNull();
    g().quitShift();
    g().startShift(opts({ mode: 'career', seed: 11 }));
    const s = sim();
    const incidents = s.incidentOrder.length;
    const radio = s.radio.length;
    vi.advanceTimersByTime(10 * 60_000);
    expect(s.incidentOrder.length).toBe(incidents);
    expect(s.radio.length).toBe(radio);
    expect(useDirector.getState().scene).toBeNull();
  });

  it('a scene is not started outside director mode', () => {
    g().startShift(opts());
    playScene(SCENES[0]);
    expect(useDirector.getState().scene).toBeNull();
  });

  it('the unit teleport puts the unit on the spot at once', () => {
    g().startShift(opts({ mode: 'director' }));
    const s = sim();
    const id = s.unitOrder.find((u) => s.units[u].status !== 'offduty')!;
    const target: LngLat = [24.7, 59.4];
    useDirector.getState().setPlacing({ kind: 'teleport', unitId: id });
    useDirector.getState().commitPlacing(target);
    expect(s.units[id].pos).toEqual(target);
    expect(s.units[id].move).toBeUndefined();
  });
});

describe('app error boundary', () => {
  function Boom(): never {
    throw new Error('kaboom');
  }
  /** A game screen that throws; the menu it returns to renders fine. */
  function GameOrMenu() {
    if (useGame((s) => s.screen) === 'game') throw new Error('kaboom');
    return createElement('p', null, 'menüü');
  }

  it('pauses the shift, stops automatic saves and offers to save and return to the menu', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    g().startShift(opts());
    expect(rafCb).not.toBeNull();
    render(createElement(AppBoundary, null, createElement(GameOrMenu)));
    expect(screen.getByRole('alert').textContent).toContain('Midagi läks valesti');
    expect(rafCb).toBeNull(); // the loop is stopped: the sim no longer runs
    expect(saveNow({ unload: true })).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Salvesta ja mine menüüsse/ }));
    expect(loadAutosave()).not.toBeNull();
    expect(g().screen).toBe('menu');
    expect(g().sim).toBeNull();
    expect(screen.getByText('menüü')).toBeTruthy();
    // Automatic saves work again for the next shift.
    g().startShift(opts({ seed: 12 }));
    expect(saveNow()).toBe(true);
  });

  it('outside a shift it offers the menu and deleting a saved shift', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    g().startShift(opts());
    autosave(sim());
    g().quitShift();
    render(createElement(AppBoundary, null, createElement(Boom)));
    expect(screen.queryByRole('button', { name: /Salvesta ja mine menüüsse/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Kustuta salvestatud vahetus/ }));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('recognises a failed chunk load', () => {
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/GameScreen-1.js'))).toBe(true);
    expect(isChunkError(new Error('kaboom'))).toBe(false);
  });
});

describe('main menu and the saved shift', () => {
  const renderMenu = async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    const { MenuScreen } = await import('@/ui/screens/MenuScreen');
    useGame.setState({ user: { name: 'Test', method: 'guest' }, screen: 'menu' });
    render(createElement(MenuScreen));
    return screen.getAllByRole('button').map((b) => b.textContent ?? '');
  };

  it('offers the report, not "Jätka vahetust", for a shift whose clock ran out', async () => {
    g().startShift(opts());
    sim().ended = true;
    autosave(sim());
    g().quitShift();
    const items = await renderMenu();
    expect(items.some((t) => t.includes('Vaata vahetuse aruannet'))).toBe(true);
    expect(items.some((t) => t.includes('Jätka vahetust'))).toBe(false);
  });

  it('never offers a career shift this profile was already paid for, and removes the copy', async () => {
    useCareer.getState().create('Test Mängija', '001', 'pohja');
    g().startShift(opts({ mode: 'career' }));
    const stale = JSON.stringify(sim()); // an old copy, e.g. pulled from the cloud by another device
    useCareer.getState().applyReport(g().endShift()!);
    g().quitShift();
    localStorage.setItem(KEY, stale);
    const items = await renderMenu();
    expect(items.some((t) => t.includes('Jätka vahetust'))).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('a save with an unknown prefecture does not blank the menu', async () => {
    g().startShift(opts());
    localStorage.setItem(KEY, JSON.stringify({ ...sim(), regionId: 'saared' }));
    g().quitShift();
    const items = await renderMenu();
    expect(items.some((t) => t.includes('Üksikmäng'))).toBe(true);
    expect(items.some((t) => t.includes('Jätka vahetust'))).toBe(false);
  });
});
