import { create } from 'zustand';
import { createShift, drainEvents, finalizeShift, step } from '@/sim/engine';
import { REGION_IDS } from '@/data/regions';
import type { GameEvent, GameMode, LngLat, NewShiftOptions, ShiftReport, SimState } from '@/sim/types';

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
  /** 'account' = a real account on the server (src/net/account.ts); everything else is a guest. */
  method: 'idcard' | 'mobiilid' | 'smartid' | 'legacy' | 'guest' | 'account';
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
  /** Bumped ~8×/s while a shift runs (not while paused) so components re-render. */
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
    // mapFocus: null, or the new shift's map would fly to the last shift's focus point on mount.
    set({ sim, report: null, screen: 'game', selection: {}, rightTab: 'incident', speedIndex: 1, tick: 0, realtime: opts.mode === 'director', mapFocus: null });
    startLoop();
  },
  resumeShift: (sim) => {
    set({ sim, report: null, screen: 'game', selection: {}, speedIndex: 0, tick: 0, mapFocus: null });
    if (sim.ended) {
      // The clock ran out before the report was opened (reload, crash, Save & quit): report straight away.
      // If that fails the shift stays on screen with its end dialog, so the player can try again.
      try {
        if (get().endShift()) return;
      } catch (err) {
        console.error('[EPD] endShift failed', err);
      }
    }
    startLoop();
  },
  endShift: () => {
    const { sim, report: done } = get();
    if (!sim) return null;
    // Already settled (a second click on the report button): never build or pay a second report.
    if (done) return done;
    stopLoop();
    // Settled from here on, also when ended early: nothing saves it again and it can never be resumed.
    sim.ended = true;
    const report = finalizeShift(sim);
    report.shiftKey = shiftKeyOf(sim);
    if (sim.flags) sim.flags[REPORTED_FLAG] = true;
    clearAutosave();
    set({ report, screen: 'report' });
    return report;
  },
  quitShift: () => {
    stopLoop();
    set({ sim: null, screen: 'menu', mapFocus: null });
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
  if (speed > CALL_SPEED && Array.isArray(sim.calls) && sim.calls.some((c) => !c.endedAt)) speed = CALL_SPEED;
  const running = speed > 0 && !sim.ended;
  if (running) {
    try {
      step(sim, dtReal * speed);
    } catch (err) {
      console.error('[EPD] step failed', err);
    }
  }
  const events = Array.isArray(sim.events) ? drainEvents(sim) : [];
  if (events.length) listeners.forEach((l) => l(events));
  // Paused or over: nothing moves, so no re-render (UI commands bump on their own, the end of the
  // shift arrives as a 'shift_end' event).
  sinceBump += dtReal;
  if (events.length || (running && sinceBump >= 125)) {
    sinceBump = 0;
    g.bump();
  }
  sinceSave += dtReal;
  if (sinceSave > 30_000) {
    sinceSave = 0;
    saveNow({ periodic: true });
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
/** sim.flags key set once the shift's report exists: such a sim is never saved or resumed again. */
const REPORTED_FLAG = 'shiftReported';

/** Identity of one shift: the same for every save and resume of it, different for every new shift. */
export function shiftKeyOf(sim: Pick<SimState, 'seed' | 'startTime'>): string {
  return `${sim.seed}:${sim.startTime}`;
}

/**
 * Cloud sync hooks, filled in by src/net/account.ts while a player is logged in to an account.
 * The store itself never talks to the network.
 */
export const autosaveHooks: {
  /**
   * A save was written. `raw` is the JSON; `kind` says who saved: the 30 s game loop ('periodic'),
   * the player ('explicit', e.g. Save & quit) or the closing page ('unload').
   */
  onSave?: (raw: string, kind: 'periodic' | 'explicit' | 'unload') => void;
  /** The save was removed (shift ended). */
  onClear?: () => void;
} = {};

export interface AutosaveOptions {
  /** The page is closing (beforeunload): cloud upload must use keepalive. */
  unload?: boolean;
  /** Written by the game loop every 30 s (the cloud copy is throttled), not by the player. */
  periodic?: boolean;
  /** false: write only the browser copy (used when the save came from the cloud). Default true. */
  cloud?: boolean;
}

export function autosave(sim: SimState, opts: AutosaveOptions = {}) {
  // A shift that already has its report is settled: saving it would bring it back.
  if (sim.flags?.[REPORTED_FLAG]) return;
  let raw: string;
  try {
    raw = JSON.stringify(sim);
  } catch {
    return;
  }
  try {
    localStorage.setItem(SAVE_KEY, raw);
  } catch {
    /* storage full or blocked: ignore */
  }
  if (opts.cloud !== false) autosaveHooks.onSave?.(raw, opts.unload ? 'unload' : opts.periodic ? 'periodic' : 'explicit');
}

/**
 * The browser's saved shift, or null. A shift whose clock ran out is still returned (`ended`: its
 * report is pending, resumeShift opens it). A save that cannot be resumed (garbage, another version,
 * an unknown prefecture, missing parts) is removed so it cannot break the menu again.
 */
export function loadAutosave(): SimState | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let sim: unknown = null;
  try {
    sim = JSON.parse(raw);
  } catch {
    /* garbage: removed below */
  }
  if (isValidSave(sim)) return sim;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  return null;
}

export function clearAutosave(opts: Pick<AutosaveOptions, 'cloud'> = {}) {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  if (opts.cloud !== false) autosaveHooks.onClear?.();
}

const GAME_MODES: readonly GameMode[] = ['career', 'free', 'director', 'tutorial'];
const SAVE_OBJECTS = ['units', 'incidents', 'persons', 'vehicles', 'stats', 'weather', 'flags', 'seq'] as const;
const SAVE_ARRAYS = ['unitOrder', 'incidentOrder', 'radio', 'calls', 'bulletins', 'queries'] as const;
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * True when `x` has the shape of a resumable SimState (version 2): a known prefecture and mode, finite
 * clock values and every collection the game reads. Saves come from this browser, another device via the
 * cloud, or an older or newer client, so they are checked before anything renders them. A missing
 * `events` list (transient, drained every frame) is repaired. A shift that was already reported is not
 * resumable.
 */
export function isValidSave(x: unknown): x is SimState {
  if (!isPlainObject(x) || x.version !== 2) return false;
  if (!REGION_IDS.includes(x.regionId as SimState['regionId'])) return false;
  if (!GAME_MODES.includes(x.mode as GameMode)) return false;
  if (![x.now, x.startTime, x.endTime].every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  if (!SAVE_OBJECTS.every((k) => isPlainObject(x[k]))) return false;
  if (!SAVE_ARRAYS.every((k) => Array.isArray(x[k]))) return false;
  if ((x.flags as Record<string, unknown>)[REPORTED_FLAG]) return false;
  if (!Array.isArray(x.events)) x.events = [];
  return true;
}

// ── Save on leave ────────────────────────────────────────────────────────────

/** Set by the app error boundary: automatic saves stop so a broken state never replaces the last good save. */
let crashed = false;
export function setCrashed(on: boolean): void {
  crashed = on;
}

let lastLeaveSave: { sim: SimState; now: number; at: number } | null = null;

/**
 * Save the running shift if there is one worth saving: on the game screen (never once the report is
 * showing), not director mode, not after a crash. Returns whether it saved.
 */
export function saveNow(opts: AutosaveOptions = {}): boolean {
  const g = useGame.getState();
  const sim = g.sim;
  if (!sim || crashed || g.screen !== 'game' || sim.mode === 'director') return false;
  if (opts.unload) {
    // visibilitychange, pagehide and beforeunload often fire together on close: one save is enough.
    const at = Date.now();
    if (lastLeaveSave && lastLeaveSave.sim === sim && lastLeaveSave.now === sim.now && at - lastLeaveSave.at < 2000) return false;
    lastLeaveSave = { sim, now: sim.now, at };
  }
  autosave(sim, opts);
  return true;
}

// Registered before src/net/account.ts adds its own listeners (it imports this module), so the cloud
// flush on hide or close uploads this fresh save. iOS Safari never fires beforeunload and mobile
// browsers kill hidden tabs without it, hence pagehide and visibilitychange as well.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const onLeave = () => {
    saveNow({ unload: true });
  };
  window.addEventListener('beforeunload', onLeave);
  window.addEventListener('pagehide', onLeave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onLeave();
  });
}
