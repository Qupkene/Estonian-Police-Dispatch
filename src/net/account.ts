// Accounts and cloud saves (docs/SERVER.md). Guests never send anything beyond the health probe:
// their progress stays in this browser exactly as before. While logged in, career and settings are
// uploaded 2 s after the last change and the shift autosave at most every 30 s.
// Failures never block the game: the cloud state turns 'error' and uploads retry with backoff.
import { create } from 'zustand';
import { useCareer } from '@/store/career';
import { useSettings, type Settings } from '@/store/settings';
import { autosave, autosaveHooks, clearAutosave, loadAutosave } from '@/store/game';
import type { CareerProfile, SimState, Text } from '@/sim/types';
import { probeBackend, request, toApiError, type ApiError } from './api';
import {
  backoffMs,
  dataOf,
  planSync,
  remoteSide,
  sameData,
  sanitizeSettings,
  SLOTS,
  validCareer,
  type SaveResponse,
  type Side,
  type Slot,
} from './sync';

export interface AccountUser {
  id: number;
  name: string;
  /** Unix ms (or whatever the server sent). */
  created: number;
}

export type Backend = 'unknown' | 'online' | 'offline';

/**
 * off: not logged in · saving: an upload is waiting or running · saved: the server has everything ·
 * error: the last upload failed, a retry is scheduled.
 */
export type CloudState = 'off' | 'saving' | 'saved' | 'error';

/** Serializable copy of an ApiError for the UI. */
export interface AccountError {
  status: number;
  code: string;
  /** The server's Estonian message, when it sent one. */
  message: string | null;
}

interface AccountStore {
  backend: Backend;
  user: AccountUser | null;
  busy: boolean;
  error: AccountError | null;
  cloud: CloudState;
  /** The server rejected our session while syncing (it expired): the player has to log in again. */
  sessionLost: boolean;
  /** Bumped whenever server data was written into the local stores (the menu re-reads the autosave). */
  pulls: number;
  /** Which form the login screen should open with (set by the menu's "Create account" button). */
  intent: 'login' | 'register' | null;

  /** Probe the backend and pick up an existing session. Safe to call many times. */
  init: () => Promise<void>;
  register: (name: string, password: string) => Promise<boolean>;
  login: (name: string, password: string) => Promise<boolean>;
  /** Stop syncing (after a last best-effort upload) and end the server session. Local data stays. */
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<boolean>;
  clearError: () => void;
  setIntent: (intent: AccountStore['intent']) => void;
}

const DEBOUNCE_MS = 2000;
const AUTOSAVE_INTERVAL_MS = 30_000;
/** Browsers refuse keepalive bodies above 64 kB (all keepalive requests of a page together). */
const KEEPALIVE_MAX_BYTES = 60_000;
const LOGOUT_FLUSH_MS = 3000;

const toAccountError = (e: unknown): AccountError => {
  const err: ApiError = toApiError(e);
  return { status: err.status, code: err.code, message: err.serverMessage };
};

const isUser = (u: unknown): u is AccountUser =>
  typeof u === 'object' && u !== null && typeof (u as AccountUser).name === 'string' && (u as AccountUser).id !== undefined;

// ── Local sync metadata (owner + per-slot change times) ─────────────────────

const META_KEY = 'epd:sync';

interface Meta {
  /** Account the browser data was last synced with; null = guest data. */
  owner: number | null;
  /** When each slot last changed locally, or the server time of the copy we hold. 0 = unknown. */
  updated: Record<Slot, number>;
}

function readMeta(): Meta {
  const meta: Meta = { owner: null, updated: { career: 0, settings: 0, autosave: 0 } };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(META_KEY) : null;
    if (!raw) return meta;
    const m = JSON.parse(raw) as Partial<Meta>;
    if (typeof m.owner === 'number') meta.owner = m.owner;
    for (const slot of SLOTS) {
      const v = m.updated?.[slot];
      if (typeof v === 'number' && Number.isFinite(v)) meta.updated[slot] = v;
    }
  } catch {
    /* storage blocked or garbage: start fresh */
  }
  return meta;
}

const meta = readMeta();

function writeMeta() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* storage blocked */
  }
}

function markLocal(slot: Slot, at = Date.now()) {
  meta.updated[slot] = at;
  writeMeta();
}

// ── Local snapshots ─────────────────────────────────────────────────────────

const careerData = () => {
  const s = useCareer.getState();
  return { profile: s.profile, inbox: s.inbox };
};
const settingsData = () => dataOf(useSettings.getState());

function localSide(slot: Slot): Side {
  switch (slot) {
    case 'career':
      return { data: useCareer.getState().profile ? careerData() : null, updated: meta.updated.career };
    case 'settings':
      return { data: settingsData(), updated: meta.updated.settings };
    case 'autosave':
      return { data: loadAutosave(), updated: meta.updated.autosave };
  }
}

function applyRemote(slot: Slot, side: Side) {
  if (slot === 'career') {
    const c = validCareer(side.data);
    useCareer.setState({
      profile: (c?.profile ?? null) as CareerProfile | null,
      inbox: (c?.inbox ?? []) as Text[],
    });
  } else if (slot === 'settings') {
    const patch = sanitizeSettings(side.data, settingsData());
    if (Object.keys(patch).length) useSettings.getState().set(patch as Partial<Omit<Settings, 'set'>>);
  } else if (side.data) {
    autosave(side.data as unknown as SimState, { cloud: false });
  } else {
    clearAutosave({ cloud: false });
  }
  meta.updated[slot] = side.updated;
  writeMeta();
}

// ── Sync engine ─────────────────────────────────────────────────────────────

interface Session {
  userId: number;
  /** The first GET /api/save was merged; uploads are allowed from now on. */
  ready: boolean;
}

let session: Session | null = null;
/** True while server data is written into the stores (those changes are not local edits). */
let applying = false;
const timers: Partial<Record<Slot, ReturnType<typeof setTimeout>>> = {};
/** Uploads per slot that are queued or running. */
const queued: Record<Slot, number> = { career: 0, settings: 0, autosave: 0 };
/** Slots (or the initial load) whose last attempt failed. */
const failed = new Set<Slot | 'load'>();
const failures: Record<Slot, number> = { career: 0, settings: 0, autosave: 0 };
/** Bumped on every local change, to know whether an upload result is still the newest state. */
const seq: Record<Slot, number> = { career: 0, settings: 0, autosave: 0 };
/** Uploads of one slot run one after another. */
const chains: Record<Slot, Promise<void>> = {
  career: Promise.resolve(),
  settings: Promise.resolve(),
  autosave: Promise.resolve(),
};
/** Autosave waiting for upload: a JSON string, null = delete it on the server, undefined = nothing. */
let autosaveRaw: string | null | undefined;
let lastAutosavePush = 0;
let loadRetry: ReturnType<typeof setTimeout> | null = null;
let loadFailures = 0;

/** An upload of the slot is scheduled, queued or running. */
const busySlot = (slot: Slot) => timers[slot] !== undefined || queued[slot] > 0;

function refreshCloud() {
  const cloud: CloudState = !session
    ? 'off'
    : failed.size
      ? 'error'
      : !session.ready || SLOTS.some(busySlot)
        ? 'saving'
        : 'saved';
  if (useAccount.getState().cloud !== cloud) useAccount.setState({ cloud });
}

function clearTimer(slot: Slot) {
  const id = timers[slot];
  if (id !== undefined) clearTimeout(id);
  delete timers[slot];
}

function schedule(slot: Slot, ms: number) {
  clearTimer(slot);
  timers[slot] = setTimeout(() => {
    delete timers[slot];
    void flush(slot);
  }, ms);
  refreshCloud();
}

function byteLength(s: string): number {
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).byteLength : s.length * 3;
}

/** Upload one slot now. `keepalive` for page unload (skips the queue: the page is going away). */
function flush(slot: Slot, keepalive = false): Promise<void> {
  clearTimer(slot);
  const upload = async () => {
    const s = session;
    if (!s?.ready) return;
    const mySeq = seq[slot];
    let method: 'PUT' | 'DELETE' = 'PUT';
    let raw: string | undefined;
    if (slot === 'autosave') {
      if (autosaveRaw === undefined) return;
      if (autosaveRaw === null) method = 'DELETE';
      else {
        raw = autosaveRaw;
        lastAutosavePush = Date.now();
      }
      autosaveRaw = undefined;
    } else {
      raw = JSON.stringify(slot === 'career' ? careerData() : settingsData());
    }
    const ka = keepalive && (raw === undefined || byteLength(raw) <= KEEPALIVE_MAX_BYTES);
    try {
      const r = await request<{ updated?: unknown }>(method, `/save/${slot}`, undefined, { rawBody: raw, keepalive: ka });
      if (session !== s) return;
      failures[slot] = 0;
      failed.delete(slot);
      if (seq[slot] === mySeq) markLocal(slot, typeof r?.updated === 'number' && r.updated > 0 ? r.updated : Date.now());
    } catch (e) {
      if (session !== s) return;
      const err = toApiError(e);
      if (err.status === 401) {
        sessionLost();
        return;
      }
      failed.add(slot);
      // Put the autosave back for the retry unless a newer one is already waiting.
      if (slot === 'autosave' && autosaveRaw === undefined) autosaveRaw = method === 'DELETE' ? null : (raw ?? null);
      if (err.retryable) {
        failures[slot]++;
        schedule(slot, backoffMs(failures[slot]));
      } else {
        // Permanent (too big, rejected): give up until the next change.
        console.warn(`[EPD] cloud save "${slot}" rejected`, err.status, err.code);
      }
    }
  };
  const run = async () => {
    try {
      await upload();
    } finally {
      queued[slot]--;
      refreshCloud();
    }
  };
  queued[slot]++;
  refreshCloud();
  if (keepalive) return run();
  chains[slot] = chains[slot].then(run, run);
  return chains[slot];
}

/** A local change of career or settings. */
function onLocalChange(slot: Slot) {
  if (applying) return;
  seq[slot]++;
  markLocal(slot);
  if (session?.ready) schedule(slot, DEBOUNCE_MS);
}

/** Upload everything that is waiting, right now (unload, tab hidden, logout). */
function flushWaiting(keepalive: boolean): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const slot of SLOTS) {
    if (timers[slot] !== undefined || (slot === 'autosave' && autosaveRaw !== undefined)) jobs.push(flush(slot, keepalive));
    else if (queued[slot] > 0) jobs.push(chains[slot]);
  }
  return Promise.all(jobs).then(() => undefined);
}

async function loadAndMerge(s: Session): Promise<void> {
  let res: SaveResponse;
  try {
    res = await request<SaveResponse>('GET', '/save');
  } catch (e) {
    if (session !== s) return;
    const err = toApiError(e);
    if (err.status === 401) {
      sessionLost();
      return;
    }
    failed.add('load');
    loadFailures++;
    refreshCloud();
    loadRetry = setTimeout(() => {
      loadRetry = null;
      void loadAndMerge(s);
    }, backoffMs(loadFailures));
    return;
  }
  if (session !== s) return;
  failed.delete('load');
  loadFailures = 0;

  const local = { career: localSide('career'), settings: localSide('settings'), autosave: localSide('autosave') };
  const plan = planSync(res, local, { owner: meta.owner, userId: s.userId });
  let pulled = false;
  applying = true;
  try {
    for (const slot of SLOTS) {
      if (plan[slot] !== 'pull') continue;
      try {
        applyRemote(slot, remoteSide(res, slot));
        pulled = true;
      } catch (err) {
        console.warn(`[EPD] could not apply cloud save "${slot}"`, err);
      }
    }
  } finally {
    applying = false;
  }
  meta.owner = s.userId;
  writeMeta();
  s.ready = true;
  for (const slot of SLOTS) {
    if (plan[slot] !== 'push') continue;
    if (slot === 'autosave') {
      const sim = loadAutosave();
      autosaveRaw = sim ? JSON.stringify(sim) : null;
    }
    void flush(slot);
  }
  if (pulled) useAccount.setState((st) => ({ pulls: st.pulls + 1 }));
  refreshCloud();
}

function endSession() {
  session = null;
  for (const slot of SLOTS) {
    clearTimer(slot);
    failures[slot] = 0;
  }
  if (loadRetry) clearTimeout(loadRetry);
  loadRetry = null;
  loadFailures = 0;
  // Uploads still queued finish on their own: they see the session is gone and do nothing.
  failed.clear();
  autosaveRaw = undefined;
  refreshCloud();
}

function sessionLost() {
  endSession();
  useAccount.setState({ user: null, sessionLost: true });
}

async function startSession(user: AccountUser): Promise<void> {
  endSession();
  const s: Session = { userId: Number(user.id), ready: false };
  session = s;
  useAccount.setState({ user, error: null, sessionLost: false });
  refreshCloud();
  await loadAndMerge(s);
}

// ── Store ───────────────────────────────────────────────────────────────────

let initPromise: Promise<void> | null = null;

export const useAccount = create<AccountStore>()((set, get) => ({
  backend: 'unknown',
  user: null,
  busy: false,
  error: null,
  cloud: 'off',
  sessionLost: false,
  pulls: 0,
  intent: null,

  init: () => {
    if (initPromise) return initPromise;
    const p = (async () => {
      const online = await probeBackend();
      if (!online) {
        set({ backend: 'offline' });
        initPromise = null; // a later call probes again (the probe itself caches for a minute)
        return;
      }
      set({ backend: 'online' });
      if (get().user) return;
      try {
        const r = await request<{ user?: unknown }>('GET', '/me');
        if (isUser(r.user) && !get().user) await startSession(r.user);
      } catch {
        /* no session or no answer: stay a guest */
      }
    })();
    initPromise = p;
    return p;
  },

  register: (name, password) => authenticate('/register', name, password),
  login: (name, password) => authenticate('/login', name, password),

  logout: async () => {
    const s = session;
    set({ user: null, error: null, sessionLost: false });
    if (!s) return;
    if (s.ready) await Promise.race([flushWaiting(false), new Promise((r) => setTimeout(r, LOGOUT_FLUSH_MS))]);
    if (session !== s) return; // someone logged in again meanwhile: that login replaced the server session
    endSession();
    try {
      await request('POST', '/logout', {});
    } catch {
      /* the cookie expires on its own */
    }
  },

  deleteAccount: async (password) => {
    set({ busy: true, error: null });
    try {
      await request('DELETE', '/me', { password });
      endSession();
      meta.owner = null; // what stays in this browser is guest data again
      writeMeta();
      set({ user: null, sessionLost: false });
      return true;
    } catch (e) {
      set({ error: toAccountError(e) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  clearError: () => set({ error: null }),
  setIntent: (intent) => set({ intent }),
}));

async function authenticate(path: '/login' | '/register', name: string, password: string): Promise<boolean> {
  const st = useAccount.getState();
  if (st.busy) return false;
  useAccount.setState({ busy: true, error: null });
  try {
    if (st.backend !== 'online') {
      await st.init();
      if (useAccount.getState().backend !== 'online') throw toApiError(new Error('backend offline'));
    }
    const r = await request<{ user?: unknown }>('POST', path, { name, password });
    if (!isUser(r.user)) throw toApiError(new Error('no user in reply'));
    await startSession(r.user);
    return true;
  } catch (e) {
    useAccount.setState({ error: toAccountError(e) });
    return false;
  } finally {
    useAccount.setState({ busy: false });
  }
}

// ── Wiring (browser only) ───────────────────────────────────────────────────

useCareer.subscribe((s, prev) => {
  if (s.profile !== prev.profile || s.inbox !== prev.inbox) onLocalChange('career');
});
useSettings.subscribe((s, prev) => {
  if (!sameData(s, prev)) onLocalChange('settings');
});

autosaveHooks.onSave = (raw, kind) => {
  if (applying) return;
  seq.autosave++;
  markLocal('autosave');
  if (!session?.ready) return;
  autosaveRaw = raw;
  if (kind !== 'periodic') {
    // The player saved (or the page is closing): upload now.
    void flush('autosave', kind === 'unload');
    return;
  }
  if (timers.autosave !== undefined) return; // an upload is already scheduled and takes the newest save
  schedule('autosave', Math.max(0, lastAutosavePush + AUTOSAVE_INTERVAL_MS - Date.now()));
};

autosaveHooks.onClear = () => {
  if (applying) return;
  seq.autosave++;
  markLocal('autosave');
  if (!session?.ready) return;
  autosaveRaw = null;
  void flush('autosave');
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (session?.ready) void flushWaiting(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && session?.ready) void flushWaiting(true);
  });
  // Probe early (during the boot screen) so the login screen knows whether accounts exist.
  void useAccount.getState().init();
}
