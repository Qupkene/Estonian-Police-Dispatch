// Accounts and cloud saves (docs/SERVER.md). Guests never send anything beyond the health probe:
// their progress stays in this browser exactly as before. While logged in, career and settings are
// uploaded 2 s after the last change and the shift autosave at most every 30 s.
// Sync never compares the browser's clock with the server's: every slot remembers the server version it
// was last synced with (`base`) and whether it changed here since (`dirty`). Each upload names its base,
// so a stale tab or device can never overwrite newer progress (the server answers 409 and this tab reads
// the cloud again), and a tab re-reads the cloud when it becomes visible. Browser data that a cloud copy
// replaces while it exists nowhere else (guest progress, unsynced changes) is kept in epd:backup.<slot>.
// Failures never block the game: the cloud state turns 'error' and uploads retry with backoff.
import { create } from 'zustand';
import { useCareer } from '@/store/career';
import { useSettings, type Settings } from '@/store/settings';
import { autosave, autosaveHooks, clearAutosave, isValidSave, loadAutosave, shiftKeyOf, useGame } from '@/store/game';
import { BACKUP_PREFIX as BACKUPS, keepBackup, keepRawBackup, normalizeCareerState } from '@/store/migrate';
import type { SimState } from '@/sim/types';
import { apiHooks, bindUser, probeBackend, request, toApiError, type ApiError } from './api';
import {
  backoffMs,
  dataOf,
  isObj,
  legacyMeta,
  needsBackup,
  num,
  parseMeta,
  planSync,
  remoteSide,
  sameData,
  sanitizeSettings,
  SLOTS,
  validCareer,
  type LocalSide,
  type Meta,
  type SaveResponse,
  type Side,
  type Slot,
  type SlotMeta,
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
  /** The server rejected our session while syncing (it expired, or another tab signed in as someone else). */
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
  /**
   * The player chose a guest, e-ID or 2024 login: end any account session, and never start one from a
   * /api/me answer that is still on its way.
   */
  decline: () => void;
  /** "Delete all data": like decline, and also ends a server session this tab is not syncing with. */
  forget: () => Promise<void>;
  deleteAccount: (password: string) => Promise<boolean>;
  clearError: () => void;
  setIntent: (intent: AccountStore['intent']) => void;
}

const DEBOUNCE_MS = 2000;
const AUTOSAVE_INTERVAL_MS = 30_000;
/** Browsers refuse keepalive bodies above 64 kB (all keepalive requests of a page together). */
const KEEPALIVE_MAX_BYTES = 60_000;
const LOGOUT_FLUSH_MS = 3000;
/** Focus and visibilitychange usually fire together: one cloud check is enough. */
const CHECK_MIN_MS = 1000;

const toAccountError = (e: unknown): AccountError => {
  const err: ApiError = toApiError(e);
  return { status: err.status, code: err.code, message: err.serverMessage };
};

const isUser = (u: unknown): u is AccountUser =>
  typeof u === 'object' && u !== null && typeof (u as AccountUser).name === 'string' && (u as AccountUser).id !== undefined;

/** The server no longer accepts this tab's session: it expired, or the cookie belongs to another account now. */
const sessionGone = (err: ApiError) => err.status === 401 || (err.status === 409 && err.code === 'user_mismatch');

// ── Local sync metadata ─────────────────────────────────────────────────────

const META_KEY = 'epd:sync';
/**
 * Browser data that a cloud copy replaced: `epd:backup.<slot>` (newest) and, for the career,
 * `epd:backup.<slot>.prev`. Copies that existed nowhere else (guest data, unsynced changes) are kept over
 * the others (src/store/migrate.ts keepBackup).
 */
export const BACKUP_PREFIX = BACKUPS;

function readStoredMeta(): Meta {
  try {
    return parseMeta(typeof localStorage !== 'undefined' ? localStorage.getItem(META_KEY) : null);
  } catch {
    return parseMeta(null); // storage blocked
  }
}

/** This tab's view. Other tabs of the browser keep their own and write only the slots they change. */
const meta: Meta = readStoredMeta();

/**
 * Write slot entries (and, when given, the signed-in account) into the stored metadata. The stored copy
 * is read first, so the entries other tabs wrote for other slots stay. With `ifStored`, the slot is only
 * written while the stored entry is still the one this tab wrote (an upload result must not overwrite the
 * entry of a newer local change another tab made meanwhile).
 */
function saveMeta(slots: readonly Slot[], account?: number | null, ifStored?: SlotMeta) {
  try {
    const stored = readStoredMeta();
    for (const slot of slots) {
      if (ifStored && JSON.stringify(stored.slots[slot]) !== JSON.stringify(ifStored)) continue;
      stored.slots[slot] = { ...meta.slots[slot] };
    }
    if (account !== undefined) stored.account = account;
    // `owner` and `updated` (format 1) keep a rollback to 92ed7f5 from pulling the cloud over this browser's changes.
    const legacy = legacyMeta(stored, Date.now());
    localStorage.setItem(META_KEY, JSON.stringify({ v: 2, account: stored.account, slots: stored.slots, ...legacy }));
  } catch {
    /* storage blocked */
  }
}

function markLocal(slot: Slot) {
  meta.slots[slot].dirty = true;
  saveMeta([slot]);
}

/**
 * Keep browser data that a pull is about to replace with different data. Data that exists nowhere else
 * (needsBackup) is marked unique so later copies never push it out. False when storage refused it.
 */
function writeBackup(slot: Slot, local: LocalSide, remote: Side): boolean {
  if (local.data == null) return true;
  return keepBackup(slot, local.data, {
    reason: 'cloud',
    unique: needsBackup(local, remote),
    owner: meta.slots[slot].owner,
    keep: slot === 'career' ? 2 : 1,
  });
}

/**
 * A cloud autosave this version will not resume (another SimState version, a shift whose report is still
 * pending, a damaged copy) is kept in this browser (epd:backup.autosave.cloud), so a later upload from here
 * can never be the end of it.
 */
function keepUnusableCloudAutosave(res: SaveResponse) {
  const v = res.autosave;
  if (!isObj(v) || remoteSide(res, 'autosave').data !== null) return;
  if (isObj(v.flags) && v.flags.shiftReported) return; // settled: its report exists
  keepBackup('autosave.cloud', v, { reason: 'cloud-unusable', unique: true, keep: 1 });
}

// ── Local snapshots ─────────────────────────────────────────────────────────

const careerData = () => {
  const s = useCareer.getState();
  return { profile: s.profile, inbox: s.inbox };
};
const settingsData = () => dataOf(useSettings.getState());

function localSide(slot: Slot): LocalSide {
  const { base, dirty } = meta.slots[slot];
  switch (slot) {
    case 'career':
      return { data: useCareer.getState().profile ? careerData() : null, base, dirty };
    case 'settings':
      return { data: settingsData(), base, dirty };
    case 'autosave':
      return { data: loadAutosave(), base, dirty };
  }
}

/** The browser's autosave is exactly `sim` (writing it can fail when storage is full). */
function storedAutosaveIs(sim: SimState): boolean {
  const s = loadAutosave();
  return !!s && shiftKeyOf(s) === shiftKeyOf(sim) && s.now === sim.now;
}

// ── Sync engine ─────────────────────────────────────────────────────────────

interface Session {
  userId: number;
  /** The first GET /api/save was merged; uploads are allowed from now on. */
  ready: boolean;
  /** The cloud read that is running, if any. */
  merging: Promise<void> | null;
  /** Another read was asked for while one was running. */
  again: boolean;
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
/** Bumped when an upload moved a slot's base: a cloud read that started before must not undo it. */
const epoch: Record<Slot, number> = { career: 0, settings: 0, autosave: 0 };
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
let lastCheck = 0;
/** The player picked a guest, e-ID or 2024 login: a late /api/me answer must not start a session. */
let declined = false;

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

/** Write a cloud copy into the browser (a pull). Data that exists nowhere else goes to the backup key first. */
function applyRemote(slot: Slot, remote: Side, local: LocalSide, userId: number) {
  writeBackup(slot, local, remote);
  // An upload still waiting for this slot would only send the cloud copy back.
  clearTimer(slot);
  if (slot === 'autosave') autosaveRaw = undefined;
  let base = remote.updated;
  if (slot === 'career') {
    // Checked like the browser copy: missing parts get defaults, broken entries go one by one, unknown
    // fields stay. When something had to go, the cloud original is kept as epd:backup.career.repaired.
    const issues: string[] = [];
    const next = normalizeCareerState(validCareer(remote.data) ?? { profile: null, inbox: [] }, issues);
    if (issues.length) {
      console.warn('[EPD] cloud career repaired', issues.slice(0, 20));
      keepRawBackup('career.repaired', JSON.stringify(remote.data));
    }
    useCareer.setState(next);
  } else if (slot === 'settings') {
    const patch = sanitizeSettings(remote.data, settingsData());
    if (Object.keys(patch).length) useSettings.getState().set(patch as Partial<Omit<Settings, 'set'>>);
  } else if (isValidSave(remote.data)) {
    // Checked like a browser save: a copy from an older or newer client must not break the menu.
    const sim = remote.data;
    autosave(sim, { cloud: false });
    if (!storedAutosaveIs(sim)) {
      // Storage is full. The backup stays (it may be the only copy); the replaced shift makes room.
      clearAutosave({ cloud: false });
      autosave(sim, { cloud: false });
      // Still no room: keep nothing that would look synced, and fetch the cloud copy again next time.
      if (!storedAutosaveIs(sim)) {
        clearAutosave({ cloud: false });
        base = 0;
      }
    }
  } else {
    clearAutosave({ cloud: false });
  }
  meta.slots[slot] = { owner: userId, base, dirty: false };
  saveMeta([slot]);
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
    // The server writes only while it still holds the version this copy builds on.
    const before = { ...meta.slots[slot] };
    try {
      const r = await request<{ updated?: unknown }>(method, `/save/${slot}?base=${before.base}`, undefined, {
        rawBody: raw,
        keepalive: ka,
      });
      if (session !== s) return;
      failures[slot] = 0;
      failed.delete(slot);
      const m = meta.slots[slot];
      const updated = num(r?.updated);
      if (updated) {
        m.base = updated;
        epoch[slot]++;
      }
      m.owner = s.userId;
      if (seq[slot] === mySeq) m.dirty = false;
      saveMeta([slot], undefined, before);
    } catch (e) {
      if (session !== s) return;
      const err = toApiError(e);
      if (sessionGone(err)) {
        sessionLost();
        return;
      }
      if (err.status === 409 && err.code === 'save_conflict') {
        // Another tab or device saved this slot since our last sync: read the cloud again instead of
        // overwriting it (the merge keeps whatever exists only here in the backup key).
        failures[slot] = 0;
        failed.delete(slot);
        void resync(s);
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

/** Read the cloud and merge it (one read at a time per session; a request during a read runs once more after it). */
function resync(s: Session): Promise<void> {
  if (s.merging) {
    s.again = true;
    return s.merging;
  }
  const run = async () => {
    await Promise.resolve();
    try {
      do {
        s.again = false;
        await loadAndMerge(s);
      } while (s.again && session === s);
    } finally {
      s.merging = null;
    }
  };
  s.merging = run();
  return s.merging;
}

async function loadAndMerge(s: Session): Promise<void> {
  const epochs = { ...epoch };
  let res: SaveResponse;
  try {
    res = await request<SaveResponse>('GET', '/save');
  } catch (e) {
    if (session !== s) return;
    const err = toApiError(e);
    if (sessionGone(err)) {
      sessionLost();
      return;
    }
    failed.add('load');
    loadFailures++;
    refreshCloud();
    if (loadRetry) clearTimeout(loadRetry);
    loadRetry = setTimeout(() => {
      loadRetry = null;
      void resync(s);
    }, backoffMs(loadFailures));
    return;
  }
  if (session !== s) return;
  failed.delete('load');
  loadFailures = 0;

  keepUnusableCloudAutosave(res);
  const local = { career: localSide('career'), settings: localSide('settings'), autosave: localSide('autosave') };
  const owner = { career: meta.slots.career.owner, settings: meta.slots.settings.owner, autosave: meta.slots.autosave.owner };
  const plan = planSync(res, local, { owner, userId: s.userId });
  // A slot whose upload finished while the read was on its way is newer here than in this reply.
  const fresh = (slot: Slot) => epoch[slot] === epochs[slot];
  const before = SLOTS.map((slot) => JSON.stringify(meta.slots[slot]));
  let pulled = false;
  applying = true;
  try {
    for (const slot of SLOTS) {
      if (!fresh(slot)) continue;
      const remote = remoteSide(res, slot);
      if (plan[slot] === 'pull') {
        try {
          applyRemote(slot, remote, local[slot], s.userId);
          pulled = true;
        } catch (err) {
          console.warn(`[EPD] could not apply cloud save "${slot}"`, err);
        }
      } else {
        // 'push' uploads on top of the version just read; 'none' means both sides already agree.
        meta.slots[slot] = { owner: s.userId, base: remote.updated, dirty: plan[slot] === 'push' };
      }
    }
  } finally {
    applying = false;
  }
  // Only entries this merge changed: another tab may hold a newer entry for a slot that stayed as it was.
  saveMeta(
    SLOTS.filter((slot, i) => JSON.stringify(meta.slots[slot]) !== before[i]),
    s.userId,
  );
  s.ready = true;
  for (const slot of SLOTS) {
    if (plan[slot] !== 'push' || !fresh(slot)) continue;
    if (slot === 'autosave') {
      const sim = loadAutosave();
      autosaveRaw = sim ? JSON.stringify(sim) : null;
    }
    void flush(slot);
  }
  if (pulled) useAccount.setState((st) => ({ pulls: st.pulls + 1 }));
  refreshCloud();
}

/**
 * The tab became visible or got focus: ask the server for its slot versions (a tiny request) and read
 * the cloud again when another tab or device saved something, before the player can change anything here.
 */
async function checkCloud(): Promise<void> {
  const s = session;
  if (!s?.ready || s.merging || SLOTS.some(busySlot)) return;
  const now = Date.now();
  if (now - lastCheck < CHECK_MIN_MS) return;
  lastCheck = now;
  let res: unknown;
  try {
    res = await request<unknown>('GET', '/save?versions=1');
  } catch (e) {
    if (session === s && sessionGone(toApiError(e))) sessionLost();
    return; // offline: the version check on the next upload still protects the cloud
  }
  if (session !== s || !isObj(res)) return;
  const updated = isObj(res.updated) ? res.updated : {};
  if (SLOTS.some((slot) => num(updated[slot]) !== meta.slots[slot].base)) await resync(s);
}

function endSession() {
  session = null;
  bindUser(null);
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
  const s: Session = { userId: Number(user.id), ready: false, merging: null, again: false };
  session = s;
  bindUser(s.userId);
  // Tell the other tabs which account this browser is signed in to now (one that syncs another account stops).
  saveMeta([], s.userId);
  useAccount.setState({ user, error: null, sessionLost: false });
  refreshCloud();
  await resync(s);
}

/** A guest, e-ID or 2024 login was chosen (here or in a game started from it). */
function accountDeclined(): boolean {
  const gu = useGame.getState().user;
  return declined || (gu !== null && gu.method !== 'account');
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
        if (!isUser(r.user) || get().user) return;
        if (accountDeclined()) {
          // The player chose to play without this account while /me was on its way: end that session
          // instead of syncing a guest's game into someone's account.
          void request('POST', '/logout', {}).catch(() => {});
          return;
        }
        await startSession(r.user);
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
    // The server session ends for every tab of this browser: the others stop syncing as well.
    saveMeta([], null);
    try {
      await request('POST', '/logout', {});
    } catch {
      /* the cookie expires on its own */
    }
  },

  decline: () => {
    declined = true;
    if (session || get().user) void get().logout();
  },

  forget: async () => {
    declined = true;
    const had = session !== null;
    await get().logout();
    // A cookie this tab never synced with (e.g. /me failed) is ended too.
    if (!had && get().backend !== 'offline') {
      try {
        await request('POST', '/logout', {});
      } catch {
        /* nothing to end */
      }
    }
  },

  deleteAccount: async (password) => {
    set({ busy: true, error: null });
    try {
      await request('DELETE', '/me', { password });
      endSession();
      // What stays in this browser is guest data again, found nowhere else.
      for (const slot of SLOTS) meta.slots[slot] = { owner: null, base: 0, dirty: true };
      saveMeta(SLOTS, null);
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
  declined = false; // an explicit account login
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

apiHooks.onUserMismatch = () => {
  if (session) sessionLost();
};

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
    if (!session?.ready) return;
    if (document.visibilityState === 'hidden') void flushWaiting(true);
    else void checkCloud();
  });
  window.addEventListener('focus', () => void checkCloud());
  // Another tab signed in as someone else, signed out or cleared the data: this tab stops writing.
  window.addEventListener('storage', (e) => {
    if (!session || (e.key !== META_KEY && e.key !== null)) return;
    if (parseMeta(e.key === null ? null : e.newValue).account !== session.userId) sessionLost();
  });
  // Probe early (during the boot screen) so the login screen knows whether accounts exist.
  void useAccount.getState().init();
}
