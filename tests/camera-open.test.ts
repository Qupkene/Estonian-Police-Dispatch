// @vitest-environment jsdom
// Kaamerad (docs/CCTV.md section 14): one camera at a time, opened from the incident card or the K key, and opened
// by itself when the player accepts an incident whose place has a camera (Settings.autoCamera). On a phone the
// window is on the map tab: a camera open there but out of sight is shown again by the card's button, not closed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stopLoop, useGame } from '@/store/game';
import { useSettings } from '@/store/settings';
import { createShift } from '@/sim/engine';
import { tallinnTime } from '@/sim/time';
import type { Incident } from '@/sim/types';
import { cameraView, toggleCamera, useGameUi } from '@/ui/game/uiStore';
import { acknowledge } from '@/ui/game/actions';

/** Incidents whose place a camera sees: every other incident has none. */
const SEEN = new Set(['inc-a', 'inc-b']);
vi.mock('@/cctv/coverage', async (orig) => ({
  ...(await orig<typeof import('@/cctv/coverage')>()),
  cameraOf: (inc: Incident) => (SEEN.has(inc.id) ? { id: 'K-0001', name: 'K-0001 · Narva mnt', seed: 1 } : null),
}));

let phone = false;
vi.stubGlobal('matchMedia', (q: string) => ({ matches: phone, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
vi.stubGlobal('requestAnimationFrame', () => 1);
vi.stubGlobal('cancelAnimationFrame', () => {});

function shift(): void {
  const sim = createShift({ seed: 7, regionId: 'pohja', mode: 'free', difficulty: 'normal', start: tallinnTime(2026, 10, 16, 12, 0), hours: 8, playerName: 'Test' });
  for (const id of ['inc-a', 'inc-b', 'inc-c']) {
    sim.incidents[id] = {
      id,
      number: `P-261016-${id}`,
      state: 'incoming',
      source: 'call',
      details: [],
      hiddenDetails: [],
      timeline: [],
      assigned: [],
      unitHistory: [],
      location: { address: 'Narva mnt 25', coord: [24.75, 59.43], city: 'Tallinn', placeKind: 'gasstation', zone: 'mainland' },
    } as unknown as Incident;
    sim.incidentOrder.push(id);
  }
  useGame.setState({ sim, screen: 'game', speedIndex: 0 });
}

beforeEach(() => {
  phone = false;
  stopLoop();
  shift();
  useSettings.setState({ autoCamera: undefined });
  useGameUi.setState({ camera: null, mobileTab: 'map' });
});

afterEach(() => {
  useGameUi.setState({ camera: null, mobileTab: 'map' });
  useGame.setState({ sim: null, screen: 'menu' });
});

const open = () => useGameUi.getState().camera?.incidentId ?? null;

describe('one camera at a time', () => {
  it("opening the next incident's camera closes the one before; its own button opens it again with one press", () => {
    toggleCamera('inc-a');
    expect(open()).toBe('inc-a');
    toggleCamera('inc-b');
    expect(open()).toBe('inc-b');
    expect(cameraView(useGameUi.getState(), 'inc-a')).toBe('closed');
    toggleCamera('inc-a');
    expect(open()).toBe('inc-a');
    toggleCamera('inc-a');
    expect(open()).toBeNull();
  });

  it('on a phone, the button of a camera that is open on the map tab shows it again from another tab instead of closing it', () => {
    phone = true;
    toggleCamera('inc-a');
    expect(open()).toBe('inc-a');
    expect(useGameUi.getState().mobileTab).toBe('map');
    // The player goes back to the incident's card: the window is out of sight there.
    useGameUi.setState({ mobileTab: 'panel' });
    expect(cameraView(useGameUi.getState(), 'inc-a')).toBe('away');
    toggleCamera('inc-a');
    expect(open()).toBe('inc-a');
    expect(useGameUi.getState().mobileTab).toBe('map');
    // On the map tab with its window in sight, the same button closes it.
    expect(cameraView(useGameUi.getState(), 'inc-a')).toBe('open');
    toggleCamera('inc-a');
    expect(open()).toBeNull();
  });
});

describe('the camera opens when the player accepts its incident', () => {
  it('accepting an incident under a camera opens its picture, in place of the one that was open (the setting is on when never set)', () => {
    expect(useSettings.getState().autoCamera).toBeUndefined();
    toggleCamera('inc-b');
    acknowledge('inc-a');
    expect(useGame.getState().sim!.incidents['inc-a'].state).toBe('queued');
    expect(open()).toBe('inc-a');
    expect(useGameUi.getState().camera?.byKey).toBeFalsy();
  });

  it('an incident no camera sees opens nothing, and the open camera stays', () => {
    toggleCamera('inc-b');
    acknowledge('inc-c');
    expect(useGame.getState().sim!.incidents['inc-c'].state).toBe('queued');
    expect(open()).toBe('inc-b');
  });

  it('with the setting off nothing opens', () => {
    useSettings.setState({ autoCamera: false });
    acknowledge('inc-a');
    expect(useGame.getState().sim!.incidents['inc-a'].state).toBe('queued');
    expect(open()).toBeNull();
  });

  it('accepting again, or an incident that was already accepted, does not reopen a camera the player closed', () => {
    acknowledge('inc-a');
    toggleCamera('inc-a');
    expect(open()).toBeNull();
    acknowledge('inc-a');
    expect(open()).toBeNull();
  });

  it('on a phone the picture opens on the map tab without taking the player off the tab they accepted on', () => {
    phone = true;
    useGameUi.setState({ mobileTab: 'queue' });
    acknowledge('inc-a');
    expect(open()).toBe('inc-a');
    expect(useGameUi.getState().mobileTab).toBe('queue');
    expect(cameraView(useGameUi.getState(), 'inc-a')).toBe('away');
  });
});

describe('the setting is kept', () => {
  it('turned off, it is stored and read back as off; never touched, stored settings do not gain it', async () => {
    localStorage.clear();
    await useSettings.persist.rehydrate();
    useSettings.getState().set({ hints: true });
    expect(JSON.parse(localStorage.getItem('epd:settings')!).state).not.toHaveProperty('autoCamera');
    useSettings.getState().set({ autoCamera: false });
    const stored = localStorage.getItem('epd:settings')!;
    expect(JSON.parse(stored).state.autoCamera).toBe(false);
    // Another visit: the game starts with it on, the stored settings say off.
    useSettings.setState({ autoCamera: true });
    localStorage.setItem('epd:settings', stored);
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().autoCamera).toBe(false);
    // A value that is not a yes or no is not taken.
    localStorage.setItem('epd:settings', JSON.stringify({ ...JSON.parse(stored), state: { ...JSON.parse(stored).state, autoCamera: 'nope' } }));
    useSettings.setState({ autoCamera: undefined });
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().autoCamera).not.toBe('nope');
  });
});
