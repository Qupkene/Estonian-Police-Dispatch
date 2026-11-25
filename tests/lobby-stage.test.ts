// @vitest-environment jsdom
// Juhtimiskeskuse saal (src/ui/screens/shell/LobbyStage.tsx, docs/MULTIPLAYER.md section 19): the stage loads the 3D
// room's chunk only when it is on the page, shows it the scene, tells it when it is seen and whether it may move,
// and gives everything back when it closes. Where the room cannot be drawn (no WebGL, no graphics card, a failed
// open, a lost context) it shows the duty map instead and nothing breaks. The room itself (three.js) and the
// browser's renderer are replaced here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import type { OpenRoomOptions, RoomHandle } from '@/lobby3d/room3d';
import type { SceneDesc, StageSource } from '@/lobby3d/scene';
import { useSettings } from '@/store/settings';

const fake = vi.hoisted(() => ({
  /** How many times the room's chunk was evaluated. */
  loads: 0,
  /** What the browser draws with (src/lobby3d/renderer.ts). */
  kind: 'gpu' as 'gpu' | 'software' | 'none',
  /** The room drawn even without a graphics card (localStorage "epd:stage3d"). */
  forced: false,
  failOpen: false,
  /** The room says it is drawn by the processor (no graphics card). */
  software: false,
  opened: [] as {
    canvas: HTMLCanvasElement;
    options: unknown;
    handle: Record<string, ReturnType<typeof vi.fn>>;
  }[],
}));

vi.mock('@/lobby3d/renderer', () => ({
  probeRender: () => fake.kind,
  stageForced: () => fake.forced,
}));

vi.mock('@/lobby3d/room3d', () => {
  fake.loads++;
  return {
    openRoom: async (canvas: HTMLCanvasElement, options: unknown) => {
      if (fake.failOpen) throw new Error('no context');
      const handle = {
        show: vi.fn(),
        resize: vi.fn(),
        setActive: vi.fn(),
        setStill: vi.fn(),
        dispose: vi.fn(),
      };
      fake.opened.push({ canvas, options, handle });
      return { ...handle, frames: 0, software: fake.software } satisfies RoomHandle;
    },
  };
});

const STANDBY: StageSource = { kind: 'standby' };
const CREATE: StageSource = {
  kind: 'create',
  mode: 'role',
  options: { regionId: 'ida', desks: [], hours: 3, slot: 'evening' },
  me: { name: 'Hanna' },
};

async function mount(source: StageSource) {
  const { LobbyStage } = await import('@/ui/screens/shell/LobbyStage');
  const view = render(createElement(LobbyStage, { source }));
  const stage = view.container.querySelector<HTMLElement>('[data-testid="lobby-stage"]')!;
  // The chunk, the probe and the open are promises: let them settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
  return { view, stage, LobbyStage };
}

beforeEach(() => {
  fake.kind = 'gpu';
  fake.forced = false;
  fake.failOpen = false;
  fake.software = false;
  fake.opened.length = 0;
  useSettings.setState({ reducedMotion: false, lang: 'et' });
  // The duty map's canvas has no 2D context in jsdom.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the lobby stage', () => {
  it('loads the room only once it is on the page, and is decoration to a screen reader', async () => {
    await import('@/ui/screens/shell/LobbyStage');
    expect(fake.loads).toBe(0);
    const { stage } = await mount(STANDBY);
    expect(fake.loads).toBe(1);
    expect(stage.getAttribute('aria-hidden')).toBe('true');
    expect(stage.querySelector('button, a, input, [tabindex]')).toBeNull();
  });

  it('opens the room on a canvas of its own, shows it the scene and reports what it shows', async () => {
    const { stage, view, LobbyStage } = await mount(STANDBY);
    expect(fake.opened).toHaveLength(1);
    const { canvas, handle } = fake.opened[0];
    expect(stage.contains(canvas)).toBe(true);
    expect(stage.dataset.mode).toBe('3d');
    expect(stage.dataset.renderer).toBe('gpu');
    expect(stage.dataset.phase).toBe('standby');
    expect(stage.dataset.seats).toBe('dark,dark,dark,dark');
    expect(stage.querySelector('.vk-map')).toBeNull();
    const first = handle.show.mock.calls.at(-1)![0] as SceneDesc;
    expect(first.phase).toBe('standby');
    expect(handle.setStill).toHaveBeenLastCalledWith(false);
    expect(handle.setActive).toHaveBeenLastCalledWith(true);

    // The create form's choice arrives: the same room is shown the new scene.
    view.rerender(createElement(LobbyStage, { source: CREATE }));
    const next = handle.show.mock.calls.at(-1)![0] as SceneDesc;
    expect(next).toMatchObject({ phase: 'create', mode: 'role', arrangement: 'team' });
    expect(stage.dataset.phase).toBe('create');
    expect(stage.dataset.roomMode).toBe('role');
    expect(stage.dataset.seats).toBe('invite,open,open,open');
    expect(fake.opened).toHaveLength(1);

    // The first frame makes the canvas show.
    expect(stage.dataset.drawn).toBe('false');
    act(() => (fake.opened[0].options as OpenRoomOptions).onFirstFrame());
    expect(stage.dataset.drawn).toBe('true');
  });

  it('draws no frame while the document is hidden, and still frames only with reduced motion', async () => {
    const { handle } = (await mount(STANDBY), fake.opened[0]);
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(handle.setActive).toHaveBeenLastCalledWith(false);
    visibility.mockReturnValue('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(handle.setActive).toHaveBeenLastCalledWith(true);

    act(() => useSettings.setState({ reducedMotion: true }));
    expect(handle.setStill).toHaveBeenLastCalledWith(true);
  });

  it('without a graphics card it shows the duty map and opens no room', async () => {
    fake.kind = 'software';
    const { stage } = await mount(CREATE);
    expect(fake.opened).toHaveLength(0);
    expect(stage.dataset.mode).toBe('still');
    expect(stage.dataset.renderer).toBe('software');
    expect(stage.querySelector('.vk-stage__canvas')).toBeNull();
    expect(stage.querySelector('.vk-stage__still .vk-map')).not.toBeNull();
    expect(stage.dataset.seats).toBe('invite,open,open,open');
  });

  it('asked to draw the room anyway (the e2e tests), a room drawn by the processor stays still', async () => {
    fake.kind = 'software';
    fake.forced = true;
    fake.software = true;
    const { stage } = await mount(STANDBY);
    expect(fake.opened).toHaveLength(1);
    expect(stage.dataset.mode).toBe('3d');
    expect(stage.dataset.renderer).toBe('software');
    expect(stage.dataset.still).toBe('true');
  });

  it('gives the room and its canvas back when the screen closes', async () => {
    const { view, stage } = await mount(STANDBY);
    const { canvas, handle } = fake.opened[0];
    view.unmount();
    expect(handle.dispose).toHaveBeenCalledTimes(1);
    expect(stage.contains(canvas)).toBe(false);
  });

  it('without WebGL it shows the duty map with the prefecture lit, and opens no room', async () => {
    fake.kind = 'none';
    const { stage } = await mount(CREATE);
    expect(fake.opened).toHaveLength(0);
    expect(stage.dataset.mode).toBe('still');
    expect(stage.dataset.drawn).toBe('false');
    expect(stage.querySelector('.vk-stage__canvas')).toBeNull();
    expect(stage.querySelector('.vk-stage__still .vk-map')).not.toBeNull();
    // What it shows is still told: the seats and the phase do not depend on the drawing.
    expect(stage.dataset.seats).toBe('invite,open,open,open');
  });

  it('a room that does not open leaves the still picture, and no canvas behind', async () => {
    fake.failOpen = true;
    const { stage } = await mount(STANDBY);
    expect(stage.dataset.mode).toBe('still');
    expect(stage.querySelector('.vk-stage__canvas')).toBeNull();
    expect(stage.querySelector('.vk-stage__still .vk-map')).not.toBeNull();
  });

  it('a lost graphics context ends the room and shows the still picture', async () => {
    const { stage } = await mount(STANDBY);
    const { handle, options } = fake.opened[0];
    act(() => (options as OpenRoomOptions).onLost());
    expect(handle.dispose).toHaveBeenCalledTimes(1);
    expect(stage.dataset.mode).toBe('still');
    expect(stage.querySelector('.vk-stage__canvas')).toBeNull();
    expect(stage.querySelector('.vk-stage__still .vk-map')).not.toBeNull();
  });
});
