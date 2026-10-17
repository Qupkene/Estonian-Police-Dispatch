import { create } from 'zustand';
import { createShift, drainEvents, finalizeShift, step } from '@/sim/engine';
import type { GameEvent, LngLat, NewShiftOptions, ShiftReport, SimState } from '@/sim/types';

export type Screen =
  | 'boot'
  | 'login'
  | 'menu'
  | 'briefing'
  | 'game'
  | 'report'
  | 'settings'
  | 'credits'
  | 'career'
  | 'legacy';

export type RightTab = 'incident' | 'unit' | 'registry' | 'stats' | 'bulletins' | 'director';

export interface LoginUser {
  name: string;
  method: 'idcard' | 'mobiilid' | 'smartid' | 'legacy' | 'guest';
  idcode?: string;
}

export interface Selection {
  incidentId?: string;
  unitId?: string;
  personId?: string;
  plate?: string;
}

/** Game seconds per real second for each speed step (index 0 = paused). */
export const SPEEDS = [0, 15, 30, 60, 120] as const;
/** Director mode real-time speed. */
export const REALTIME = 1;
/** Game seconds per real second while a 112 call is ringing or active. */
export const CALL_SPEED = 2;

interface GameStore {
  screen: Screen;
  user: LoginUser | null;
  sim: SimState | null;
  report: ShiftReport | null;
  /** Bumped ~8×/s while a shift runs so components re-render. */
  tick: number;
  speedIndex: number;
  realtime: boolean;
  lastSpeedIndex: number;
  selection: Selection;
  rightTab: RightTab;
  registryQuery: { kind: 'person' | 'vehicle'; q: string; n: number } | null;
  mapFocus: { coord: LngLat; zoom?: number; n: number } | null;
  hud: boolean;
  /** Briefing → game: options chosen on the briefing screen. */
  briefing: Partial<NewShiftOptions> & { shiftKind?: 'day' | 'night' | 'custom' };

  setScreen: (s: Screen) => void;
  login: (u: LoginUser) => void;
  logout: () => void;
  setBriefing: (b: Partial<GameStore['briefing']>) => void;
  startShift: (opts: NewShiftOptions) => void;
  resumeShift: (sim: SimState) => void;
  endShift: () => ShiftReport | null;
  quitShift: () => void;
  select: (sel: Selection, tab?: RightTab) => void;
  setRightTab: (t: RightTab) => void;
  openRegistry: (kind: 'person' | 'vehicle', q: string) => void;
  focusMap: (coord: LngLat, zoom?: number) => void;
  setSpeed: (i: number) => void;
  togglePause: () => void;
  setRealtime: (on: boolean) => void;
  setHud: (on: boolean) => void;
  bump: () => void;
}

export const useGame = create<GameStore>()((set, get) => ({
  screen: 'boot',
  user: null,
  sim: null,
  report: null,
  tick: 0,
  speedIndex: 1,
  realtime: false,
  lastSpeedIndex: 1,
  selection: {},
  rightTab: 'incident',
  registryQuery: null,
  mapFocus: null,
  hud: true,
  briefing: {},

  setScreen: (screen) => set({ screen }),
  login: (user) => set({ user, screen: 'menu' }),
  logout: () => set({ user: null, screen: 'login' }),
  setBriefing: (b) => set({ briefing: { ...get().briefing, ...b } }),
  startShift: (opts) => {
    const sim = createShift(opts);
    set({ sim, report: null, screen: 'game', selection: {}, rightTab: 'incident', speedIndex: 1, tick: 0, realtime: opts.mode === 'director' });
    startLoop();
  },
  resumeShift: (sim) => {
    set({ sim, report: null, screen: 'game', selection: {}, speedIndex: 0, tick: 0 });
    startLoop();
  },
  endShift: () => {
    const sim = get().sim;
    if (!sim) return null;
    stopLoop();
    const report = finalizeShift(sim);
    clearAutosave();
    set({ report, screen: 'report' });
    return report;
  },
  quitShift: () => {
    stopLoop();
    set({ sim: null, screen: 'menu' });
  },
  select: (sel, tab) => set({ selection: sel, ...(tab ? { rightTab: tab } : {}) }),
  setRightTab: (rightTab) => set({ rightTab }),
  openRegistry: (kind, q) =>
    set({ registryQuery: { kind, q, n: (get().registryQuery?.n ?? 0) + 1 }, rightTab: 'registry' }),
  focusMap: (coord, zoom) => set({ mapFocus: { coord, zoom, n: (get().mapFocus?.n ?? 0) + 1 } }),
  setSpeed: (i) => set({ speedIndex: Math.max(0, Math.min(SPEEDS.length - 1, i)), lastSpeedIndex: i > 0 ? i : get().lastSpeedIndex, realtime: false }),
  togglePause: () => {
    const { speedIndex, lastSpeedIndex } = get();
    set(speedIndex === 0 ? { speedIndex: lastSpeedIndex || 1 } : { speedIndex: 0, lastSpeedIndex: speedIndex });
  },
  setRealtime: (realtime) => set({ realtime, speedIndex: realtime ? 1 : get().speedIndex }),
  setHud: (hud) => set({ hud }),
  bump: () => set({ tick: get().tick + 1 }),
}));

// ── Game events bus (engine → audio / toasts) ────────────────────────────────

type Listener = (events: GameEvent[]) => void;
const listeners = new Set<Listener>();
export function onGameEvents(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── Main loop ────────────────────────────────────────────────────────────────

let raf = 0;
let last = 0;
let sinceBump = 0;
let sinceSave = 0;

function frame(ts: number) {
  raf = requestAnimationFrame(frame);
  const g = useGame.getState();
  const sim = g.sim;
  if (!sim) return;
  const dtReal = last ? Math.min(250, ts - last) : 16;
  last = ts;
  let speed = g.realtime ? (g.speedIndex === 0 ? 0 : 1) : SPEEDS[g.speedIndex];
  // While a 112 call rings or is in progress the dispatcher is on the phone: the world slows to
  // near real time so the call can actually be answered and the conversation read.
  if (speed > CALL_SPEED && sim.calls.some((c) => !c.endedAt)) speed = CALL_SPEED;
  if (speed > 0 && !sim.ended) {
    try {
      step(sim, dtReal * speed);
    } catch (err) {
      console.error('[EPD] step failed', err);
    }
  }
  const events = drainEvents(sim);
  if (events.length) listeners.forEach((l) => l(events));
  sinceBump += dtReal;
  if (sinceBump >= 125 || events.length) {
    sinceBump = 0;
    g.bump();
  }
  sinceSave += dtReal;
  if (sinceSave > 30_000 && sim.mode !== 'director') {
    sinceSave = 0;
    autosave(sim);
  }
}

export function startLoop() {
  if (raf) return;
  last = 0;
  raf = requestAnimationFrame(frame);
}

export function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

// ── Autosave ─────────────────────────────────────────────────────────────────

const SAVE_KEY = 'epd:autosave';

export function autosave(sim: SimState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(sim));
  } catch {
    /* storage full or blocked: ignore */
  }
}

export function loadAutosave(): SimState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const sim = JSON.parse(raw) as SimState;
    return sim.version === 2 && !sim.ended ? sim : null;
  } catch {
    return null;
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const sim = useGame.getState().sim;
    if (sim && !sim.ended && sim.mode !== 'director') autosave(sim);
  });
}
