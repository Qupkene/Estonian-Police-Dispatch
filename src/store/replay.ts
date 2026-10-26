// Kordus (2.39.0, docs/REPLAY.md): the recording of the running shift (src/sim/replay.ts) and the replays kept on this
// device.
//
// The game loop calls `recordFrame` every frame: the first frame of a shift starts its recording, or goes on with the
// one kept from before a reload; the others add what changed. Every 30 s and when the page is hidden the recording is
// kept (`keepRecording`); `finishReplay` ends it when the report is made, and the report and the history open it.
//
// Kept in IndexedDB ('epd-replays'), never in localStorage: a shift's save already takes a good part of the browser's
// storage there, and a recording must never be what pushes a save out. Per identity (the guest's or an account's
// namespace, src/store/space.ts); the last KEEP_DONE finished ones stay, an unfinished one (a shift saved and left)
// for KEEP_OPEN_DAYS. Without IndexedDB (a private window in some browsers, the tests) they live as long as the page.
import { create } from 'zustand';
import { finishRecording, isReplay, observe, resumeRecording, startRecording, type ReplayRecorder, type ShiftReplay } from '@/sim/replay';
import type { ShiftReport, SimState } from '@/sim/types';
import { spacePrefix } from './migrate';

/** Finished replays kept per identity. */
export const KEEP_DONE = 12;
/** An unfinished recording (its shift saved and left) is kept this many days. */
export const KEEP_OPEN_DAYS = 7;

/** What finds a kept replay without opening it (its own small record, so a list never reads the recordings). */
export interface ReplayEntry {
  /** `${space}|${key}`. */
  id: string;
  space: string;
  key: string;
  done: boolean;
  /** When it was kept (wall clock). */
  at: number;
  seed: number;
  start: number;
  room?: string;
  mode: ShiftReplay['mode'];
  regionId: ShiftReplay['regionId'];
  score?: number;
}

// ── Storage ─────────────────────────────────────────────────────────────────

const DB = 'epd-replays';
/** The entries, and the recordings by the same id. */
const META = 'meta';
const DATA = 'data';
const mem = new Map<string, { meta: ReplayEntry; rep: ShiftReplay }>();
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  dbp ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(DATA)) d.createObjectStore(DATA, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const d = req.result;
        // Another tab upgrading the database: this connection steps aside and the next use opens it again.
        d.onversionchange = () => {
          d.close();
          dbp = null;
        };
        resolve(d);
      };
      req.onerror = () => resolve(null);
      // Held up by another tab: memory for now, the next use tries again.
      req.onblocked = () => {
        dbp = null;
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

/** One transaction over the stores named; resolves once it is committed (a read: with its result). */
function tx<T>(
  d: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  fn: (t: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    try {
      const t = d.transaction(stores, mode);
      const req = fn(t);
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

function entryOf(rep: ShiftReplay, space: string): ReplayEntry {
  return {
    id: `${space}|${rep.key}`,
    space,
    key: rep.key,
    done: !!rep.done,
    at: Date.now(),
    seed: rep.seed,
    start: rep.start,
    ...(rep.room ? { room: rep.room } : {}),
    mode: rep.mode,
    regionId: rep.regionId,
    ...(rep.score !== undefined ? { score: rep.score } : {}),
  };
}

async function put(rep: ShiftReplay, space: string): Promise<void> {
  const meta = entryOf(rep, space);
  const d = await db();
  if (!d) {
    mem.set(meta.id, { meta, rep });
    return;
  }
  await tx(d, [META, DATA], 'readwrite', (t) => {
    t.objectStore(META).put(meta);
    t.objectStore(DATA).put({ id: meta.id, rep });
  });
}

/** A kept replay by its id: its entry and the recording. */
async function get(id: string): Promise<{ meta: ReplayEntry; rep: ShiftReplay } | undefined> {
  const d = await db();
  let got: { meta: ReplayEntry; rep: ShiftReplay } | undefined;
  if (!d) got = mem.get(id);
  else {
    const meta = await tx<ReplayEntry>(d, [META], 'readonly', (t) => t.objectStore(META).get(id));
    const data = meta ? await tx<{ rep: ShiftReplay }>(d, [DATA], 'readonly', (t) => t.objectStore(DATA).get(id)) : undefined;
    got = meta && data ? { meta, rep: data.rep } : undefined;
  }
  return got && isReplay(got.rep) ? got : undefined;
}

/** The entries of an identity (the recordings are not read). */
async function entries(space: string): Promise<ReplayEntry[]> {
  const d = await db();
  const list = d
    ? ((await tx<ReplayEntry[]>(d, [META], 'readonly', (t) => t.objectStore(META).getAll())) ?? [])
    : [...mem.values()].map((x) => x.meta);
  return list.filter((k) => k?.space === space);
}

async function remove(id: string): Promise<void> {
  const d = await db();
  if (!d) {
    mem.delete(id);
    return;
  }
  await tx(d, [META, DATA], 'readwrite', (t) => {
    t.objectStore(META).delete(id);
    t.objectStore(DATA).delete(id);
  });
}

/** Keep the last KEEP_DONE finished replays and the recent unfinished ones of this identity. */
async function prune(space: string): Promise<void> {
  const list = await entries(space);
  const done = list.filter((k) => k.done).sort((a, b) => b.at - a.at);
  const stale = Date.now() - KEEP_OPEN_DAYS * 86_400_000;
  for (const k of done.slice(KEEP_DONE)) await remove(k.id);
  for (const k of list) if (!k.done && k.at < stale) await remove(k.id);
}

// ── Recording the running shift ─────────────────────────────────────────────

let rec: ReplayRecorder | null = null;
let recKey: string | null = null;
let recSpace = '';
/** The shift whose kept recording is being looked up, and the latest state of it seen meanwhile. */
let loading: string | null = null;
let latest: SimState | null = null;
let lastNow = NaN;
let keptTo = -Infinity;

/** Director mode is a sandbox with no end: nothing to replay. */
const recordable = (sim: SimState) => sim.mode !== 'director';

/**
 * Called by the game loop every frame with the running shift and its key (src/store/game.ts shiftKeyOf): records what
 * changed since the last frame. A shift seen for the first time first looks for its recording kept before a reload.
 */
export function recordFrame(sim: SimState, key: string): void {
  if (!recordable(sim)) return;
  latest = sim;
  if (rec && recKey === key) {
    if (sim.now !== lastNow) {
      lastNow = sim.now;
      try {
        observe(rec, sim);
      } catch (err) {
        console.warn('[EPD] replay: a frame was not recorded', err);
      }
    }
    return;
  }
  if (loading === key) return;
  rec = null;
  recKey = null;
  loading = key;
  const space = spacePrefix();
  void get(`${space}|${key}`).then(
    (kept) => begin(key, space, kept),
    () => begin(key, space, undefined),
  );
}

/**
 * The kept recording looked up: an unfinished one of this shift goes on; a finished one is an earlier run of the
 * same shift (a daily or a challenge played again), which this run's replay replaces.
 */
function begin(key: string, space: string, kept: { rep: ShiftReplay } | undefined): void {
  if (loading !== key) return;
  loading = null;
  const sim = latest;
  if (!sim || sim.ended) return;
  try {
    rec = kept && !kept.rep.done ? resumeRecording(kept.rep, sim) : startRecording(sim, key);
  } catch (err) {
    console.warn('[EPD] replay: the kept recording could not go on, a new one starts', err);
    rec = startRecording(sim, key);
  }
  recKey = key;
  recSpace = space;
  lastNow = sim.now;
  // What is kept is not this recording (an earlier run, or one cut back): the next keep writes it.
  keptTo = -Infinity;
}

/** Keep the recording so far (every 30 s and when the page is hidden): a reload goes on with it. */
export function keepRecording(): void {
  if (!rec || rec.rep.to <= keptTo) return;
  keptTo = rec.rep.to;
  void put(rec.rep, recSpace).catch(() => {});
}

/** The shift was left without a report (saved and quit): its recording stays kept for when it is resumed. */
export function leaveRecording(): void {
  keepRecording();
  rec = null;
  recKey = null;
  loading = null;
  latest = null;
}

/**
 * The shift's report is made: the recording ends and is kept as a finished replay, which becomes the report's. Null
 * when nothing of the shift was recorded on this device (it was played elsewhere).
 */
export async function finishReplay(sim: SimState, key: string, report: ShiftReport | null): Promise<ShiftReplay | null> {
  if (!recordable(sim)) return null;
  let r = recKey === key ? rec : null;
  const space = r ? recSpace : spacePrefix();
  rec = null;
  recKey = null;
  loading = null;
  latest = null;
  try {
    if (!r) {
      // The report right after a reload: this run's recording is the kept unfinished one (a finished one is an
      // earlier run's, not this shift's replay).
      const kept = await get(`${space}|${key}`);
      r = kept && !kept.rep.done ? resumeRecording(kept.rep, sim) : null;
    }
    if (!r) return null;
    const rep = finishRecording(r, sim, report);
    useReplay.setState({ last: rep });
    await put(rep, space);
    await prune(space);
    return rep;
  } catch (err) {
    console.warn('[EPD] replay: the recording could not be finished', err);
    return null;
  }
}

/** Remove every replay of an identity from this device (its namespace's cache is removed: src/store/space.ts). */
export async function forgetReplays(space: string): Promise<void> {
  for (const k of await entries(space)) await remove(k.id);
}

// ── Finding kept replays ────────────────────────────────────────────────────

/** The finished replay of a room's round (its code and the shift's seed), when this device has it. */
export async function findRoomReplay(code: string, seed: number): Promise<ShiftReplay | null> {
  const hit = (await entries(spacePrefix())).find((k) => k.done && k.room === code && k.seed === seed);
  const got = hit ? await get(hit.id) : undefined;
  return got?.rep.done ? got.rep : null;
}

/** The finished replays of this identity, newest first, without their recordings (the tests; a list of them later). */
export async function listReplays(): Promise<ReplayEntry[]> {
  return (await entries(spacePrefix())).filter((k) => k.done).sort((a, b) => b.at - a.at);
}

// ── The viewer ──────────────────────────────────────────────────────────────

/** Where a replay opens: a moment, an incident to show, a crew to follow. */
export interface ReplayOpen {
  rep: ShiftReplay;
  at?: number;
  inc?: string;
  unit?: string;
}

interface ReplayUi {
  /** The replay of the shift whose report was made last. */
  last: ShiftReplay | null;
  /** The replay on screen. */
  open: ReplayOpen | null;
  show: (o: ReplayOpen) => void;
  close: () => void;
}

export const useReplay = create<ReplayUi>()((set) => ({
  last: null,
  open: null,
  show: (open) => set({ open }),
  close: () => set({ open: null }),
}));

/** For tests: forget the recording and the replays kept in memory. */
export function resetReplayStore(): void {
  rec = null;
  recKey = null;
  loading = null;
  latest = null;
  lastNow = NaN;
  keptTo = -Infinity;
  mem.clear();
  useReplay.setState({ last: null, open: null });
}
