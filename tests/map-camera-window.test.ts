// @vitest-environment jsdom
// Kaamerad on the map (docs/CCTV.md section 14): the camera window opens the camera at the point where the map draws
// the incident's marker, and tells the map what to draw (src/map/cameraCone.ts): the marker at once, the camera's
// pose once the picture is live, nothing of the pose when there is no picture, and nothing at all once it closes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { stopLoop, useGame } from '@/store/game';
import { createShift } from '@/sim/engine';
import { tallinnTime } from '@/sim/time';
import type { Incident, LngLat } from '@/sim/types';
import { useGameUi } from '@/ui/game/uiStore';
import { CameraWindow } from '@/ui/game/CameraWindow';
import { cameraCone, mapLabel } from '@/map/cameraCone';
import type { CameraHandle, OpenOptions } from '@/cctv/live';

/** Where the map draws the marker: on the place's building, away from the incident's own coordinates. */
const SHOWN: LngLat = [24.75312, 59.43671];
const OWN: LngLat = [24.751, 59.4359];
const POSE = { at: [24.7529, 59.4366] as LngLat, spot: [24.7531, 59.43668] as LngLat, bearing: 64, fovH: 78, reach: 42 };

const opened: OpenOptions[] = [];
let answer: 'live' | 'none' | 'nowhere' = 'live';

vi.mock('@/cctv/live', () => ({
  openCamera: async (_canvas: HTMLCanvasElement, o: OpenOptions): Promise<CameraHandle | null> => {
    opened.push(o);
    if (answer === 'none') return null;
    // 'nowhere': a street made up for the picture, which has no place on the map.
    const pose = answer === 'nowhere' ? null : POSE;
    return { update() {}, view() {}, state: 'live', phase: 'open', dead: false, source: answer === 'nowhere' ? 'made' : 'tiles', people: 2, cars: 0, pose, dispose() {} };
  },
}));
vi.mock('@/cctv/coverage', async (orig) => ({
  ...(await orig<typeof import('@/cctv/coverage')>()),
  cameraOf: () => ({ id: 'K-0001', name: 'K-0001 · Narva mnt', seed: 1 }),
}));
// The map's road data has put the marker on the building (roads.ts incidentCoord).
vi.mock('@/map/roads', async (orig) => ({
  ...(await orig<typeof import('@/map/roads')>()),
  roadService: () => ({}),
  roadDisplay: () => ({ incidentCoord: (inc: Incident) => (inc.location.coord === OWN ? SHOWN : null) }),
}));

// The picture's loop and the game loop run on requestAnimationFrame: never here.
vi.stubGlobal('requestAnimationFrame', () => 1);
vi.stubGlobal('cancelAnimationFrame', () => {});
vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));

function shiftWithIncident(): string {
  const sim = createShift({ seed: 7, regionId: 'pohja', mode: 'free', difficulty: 'normal', start: tallinnTime(2026, 10, 16, 12, 0), hours: 8, playerName: 'Test' });
  const id = 'inc-cam';
  sim.incidents[id] = {
    id,
    number: 'P-261016-0001',
    state: 'queued',
    source: 'call',
    unitHistory: [],
    location: { address: 'Narva mnt 25', coord: OWN, city: 'Tallinn', placeKind: 'gasstation', placeName: 'Olerex', zone: 'mainland' },
  } as unknown as Incident;
  sim.incidentOrder.push(id);
  useGame.setState({ sim, screen: 'game', speedIndex: 0 });
  return id;
}

beforeEach(() => {
  opened.length = 0;
  answer = 'live';
  stopLoop();
});

afterEach(() => {
  cleanup();
  useGameUi.setState({ camera: null });
  useGame.setState({ sim: null, screen: 'menu' });
});

describe('the camera window and the map', () => {
  it("opens the camera at the map's marker and shows the map its pose while live, nothing once closed", async () => {
    const id = shiftWithIncident();
    useGameUi.setState({ camera: { incidentId: id } });
    render(createElement(CameraWindow));
    // At once, before the picture: the marker, to bring into view; no cone yet.
    expect(cameraCone()?.marker).toEqual(SHOWN);
    expect(cameraCone()?.pose).toBeNull();
    const first = cameraCone()!.reveal;
    // Opening the window is the player's own request; the camera's incident and place go with it.
    expect(cameraCone()!.auto).toBe(false);
    expect(cameraCone()!.incidentId).toBe(id);
    expect(mapLabel(cameraCone()!.place)).toBe('Narva mnt');
    await waitFor(() => expect(document.querySelector('[data-testid="camera-window"]')?.getAttribute('data-state')).toBe('live'));
    expect(opened).toHaveLength(1);
    expect(opened[0].origin).toEqual(SHOWN);
    expect(opened[0].incident.location.coord).toEqual(OWN);
    // Live: the pose, at zoom 1, shown, and a new request to bring it into view.
    const v = cameraCone()!;
    expect(v.sim).toBe(useGame.getState().sim);
    expect(v.pose).toEqual(POSE);
    expect(v.zoom).toBe(1);
    expect(v.panX).toBe(0);
    expect(v.shown).toBe(true);
    expect(v.reveal).toBeGreaterThan(first);
    // That one comes from the picture, not the player: the map leaves it out if it was moved meanwhile.
    expect(v.auto).toBe(true);
    // A place on the map: no note about it.
    expect(document.querySelector('[data-testid="camera-nomap"]')).toBeNull();
    // The window's zoom narrows the cone.
    act(() => (document.querySelectorAll<HTMLButtonElement>('.gm-cam__btn--zoom')[1]).click());
    expect(cameraCone()!.zoom).toBeCloseTo(1.5, 6);
    act(() => useGameUi.getState().set({ camera: null }));
    expect(cameraCone()).toBeNull();
  });

  it("falls back to the incident's own coordinates when the map has no marker for it, and draws no cone without a picture", async () => {
    const id = shiftWithIncident();
    // The road data is still looking the place up: the marker is where the incident is.
    const inc = useGame.getState().sim!.incidents[id];
    inc.location = { ...inc.location, coord: [24.76, 59.44] };
    answer = 'none';
    useGameUi.setState({ camera: { incidentId: id } });
    render(createElement(CameraWindow));
    await waitFor(() => expect(document.querySelector('[data-testid="camera-window"]')?.getAttribute('data-state')).toBe('unavailable'));
    expect(opened[0].origin).toEqual([24.76, 59.44]);
    expect(cameraCone()?.pose).toBeNull();
  });

  it('says once, small, when the live picture has no place on the map', async () => {
    const id = shiftWithIncident();
    answer = 'nowhere';
    useGameUi.setState({ camera: { incidentId: id } });
    render(createElement(CameraWindow));
    await waitFor(() => expect(document.querySelector('[data-testid="camera-window"]')?.getAttribute('data-state')).toBe('live'));
    expect(cameraCone()?.pose).toBeNull();
    const note = document.querySelector('[data-testid="camera-nomap"]');
    expect(note?.textContent).toBe('Selle kaamera asukohta kaardil ei näidata');
    expect(document.querySelector('.gm-cam__picture')?.getAttribute('title')).toContain('Selle kaamera asukohta kaardil ei näidata');
  });
});
