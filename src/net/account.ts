// Accounts and cloud saves (docs/SERVER.md). Guests never send anything beyond the health probe: their
// progress stays in this browser exactly as before.
// Account data and guest data never mix in the browser (src/store/space.ts): the guest has the plain keys,
// every account a cache namespace (epd:acct:<id>:*). An account's namespace becomes active on sign-in and stops
// being active on sign-out, on account deletion, and when the session ends elsewhere (it expired, or another
// tab signed out or in as someone else); the guest's own data comes back then. The server is the source of
// truth: the cache only makes sign-in fast and keeps changes made while the server was out of reach until
// they are uploaded.
// While logged in, career and settings are uploaded 2 s after the last change and the shift autosave at most
// every 30 s. Sync never compares the browser's clock with the server's: every slot remembers the server
// version it was last synced with (`base`) and whether it changed here since (`dirty`). Each upload names its
// base, so a stale tab or device can never overwrite newer progress (the server answers 409 and this tab reads
// the cloud again), and a tab re-reads the cloud when it becomes visible. Cache data that a cloud copy replaces
// while it exists nowhere else (unsynced changes) is kept in epd:acct:<id>:backup.<slot>.
// Failures never block the game: the cloud state turns 'error' and uploads retry with backoff.
import { create } from 'zustand';
import { useCareer } from '@/store/career';
import { useSettings, type Settings } from '@/store/settings';
import {
  autosave,
  autosaveHooks,
  clearAutosave,
  isValidSave,
  loadAutosave,
  saveNow,
  shiftKeyOf,
  stopLoop,
  useGame,
} from '@/store/game';
import { activeSpace, BACKUP_PREFIX as BACKUPS, keepBackup, keepRawBackup, normalizeCareerState, storageGet } from '@/store/migrate';
import {
  clearAccountSpace,
  guestAutosave,
  guestCareer,
  isSwitching,
  metaKey,
  prepareAccountSpace,
  readMeta,
  switchSpace,
  writeMeta,
} from '@/store/space';
import type { SimState } from '@/sim/types';
import { apiHooks, bindUser, probeBackend, request, toApiError, type ApiError } from './api';
import {
  backoffMs,
  dataOf,
  isObj,
  needsBackup,
  num,
  parseMeta,
  planSync,
  remoteSide,
  sameData,
  sanitizeSettings,
  SLOTS,
  validAutosave,
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
  /** An admin's account: the menu shows the way to the admin panel (/admin/). */
  admin?: boolean;
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
  /**
   * Bumped whenever server data was written into the local stores, or another identity's browser data became
   * active (the menu re-reads the autosave).
   */
  pulls: number;
  /** Account whose browser data the stores hold (its cache namespace); null = the guest's own data. */
  space: number | null;
  /** Which form the login screen should open with (set by the menu's "Create account" button). */
  intent: 'login' | 'register' | null;

  /** Probe the backend and pick up an existing session. Safe to call many times. */
  init: () => Promise<void>;
  register: (name: string, password: string) => Promise<boolean>;
  login: (name: string, password: string) => Promise<boolean>;
  /**
   * Show the guest's own data again, upload what is still waiting (best effort, 3 s), end the server session.
   * The account's cache stays in this browser unless `forget`: then it is removed, except changes the server
   * does not have yet (the next sign-in uploads them).
   */
  logout: (opts?: { forget?: boolean }) => Promise<void>;
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

/** The guest's marker. It also records the account this browser is signed in to, which the other tabs read. */
const META_KEY = metaKey(null);
/**
 * Cache data that a cloud copy replaced: `<namespace>backup.<slot>` (newest) and, for the career, `.prev`
 * (epd:acct:<id>:backup.career while that account is signed in). Copies that existed nowhere else (unsynced
 * changes) are kept over the others (src/store/migrate.ts keepBackup). This is the guest's prefix.
 */
export const BACKUP_PREFIX = BACKUPS;

/**
 * The marker of the active namespace (epd:sync, or epd:acct:<id>:sync while an account is signed in). This
 * tab's view: other tabs of the browser keep their own and write only the slots they change.
 */
let meta: Meta = readMeta(activeSpace());

/**
 * Write slot entries of `m` into the stored marker of a namespace. The stored copy is read first, so the
 * entries other tabs wrote for other slots stay. With `ifStored`, the slot is only written while the stored
 * entry is still the one this tab wrote (an upload result must not overwrite the entry of a newer local
 * change another tab made meanwhile).
 */
function saveMeta(m: Meta, space: number | null, slots: readonly Slot[], ifStored?: SlotMeta) {
  const stored = readMeta(space);
  let changed = false;
  for (const slot of slots) {
    if (ifStored && JSON.stringify(stored.slots[slot]) !== JSON.stringify(ifStored)) continue;
    stored.slots[slot] = { ...m.slots[slot] };
    changed = true;
  }
  if (changed) writeMeta(stored, space);
}

/** Record the account this browser is signed in to (null: signed out) in the guest's marker, for other tabs. */
function saveAccount(account: number | null) {
  const stored = readMeta(null);
  stored.account = account;
  writeMeta(stored, null);
}

function markLocal(slot: Slot) {
  meta.slots[slot].dirty = true;
  saveMeta(meta, activeSpace(), [slot]);
}

/**
 * Keep cache data that a pull is about to replace with different data. Data that exists nowhere else
 * (needsBackup) is marked unique so later copies never push it out. False when storage refused it.
 */
function writeBackup(slot: Slot, local: LocalSide, remote: Side, m: Meta): boolean {
  if (local.data == null) return true;
  // Settings an account new to this browser took over from the guest: the guest still has them.
  if (slot === 'settings' && m.slots.settings.owner === null) return true;
  return keepBackup(slot, local.data, {
    reason: 'cloud',
    unique: needsBackup(local, remote),
    owner: m.slots[slot].owner,
    keep: slot === 'career' ? 2 : 1,
  });
}

/**
 * A cloud autosave this version will not resume (another SimState version, a shift whose report is still
 * pending, a damaged copy) is kept in this browser (epd:acct:<id>:backup.autosave.cloud), so a later upload
 * from here can never be the end of it.
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

function localSide(slot: Slot, m: Meta): LocalSide {
  const { base, dirty } = m.slots[slot];
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
  /** The marker of the account's namespace (the active `meta` as long as that namespace is active). */
  meta: Meta;
  /** The account's namespace was new to this browser: its first cloud read may take guest progress along. */
  fresh: boolean;
  /** The first GET /api/save was merged; uploads are allowed from now on. */
  ready: boolean;
  /** The cloud read that is running, if any. */
  merging: Promise<void> | null;
  /** Another read was asked for while one was running. */
  again: boolean;
  /** Signing out: the stores hold the guest's data already, only the last uploads may still go out. */
  leaving: boolean;
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

/** The session whose data the stores hold and that uploads local changes, if any. */
function syncing(): Session | null {
  const s = session;
  return s && s.ready && !s.leaving && activeSpace() === s.userId ? s : null;
}

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

/** Write a cloud copy into the account's cache (a pull). Data that exists nowhere else goes to the backup key first. */
function applyRemote(slot: Slot, remote: Side, local: LocalSide, s: Session) {
  writeBackup(slot, local, remote, s.meta);
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
  s.meta.slots[slot] = { owner: s.userId, base, dirty: false };
  saveMeta(s.meta, s.userId, [slot]);
}

/** Upload one slot now. `keepalive` for page unload (skips the queue: the page is going away). */
function flush(slot: Slot, keepalive = false): Promise<void> {
  clearTimer(slot);
  const s0 = session;
  // Career and settings go up as the stores hold them now, and only while the stores hold the account's data:
  // once a sign-out has begun they hold the guest's (what was not sent stays marked and goes up next time).
  let body: string | undefined;
  if (slot !== 'autosave') {
    if (!s0?.ready || activeSpace() !== s0.userId) {
      refreshCloud();
      return Promise.resolve();
    }
    body = JSON.stringify(slot === 'career' ? careerData() : settingsData());
  }
  let mySeq = seq[slot];
  const upload = async () => {
    const s = session;
    if (!s?.ready || s !== s0) return;
    let method: 'PUT' | 'DELETE' = 'PUT';
    let raw = body;
    if (slot === 'autosave') {
      if (autosaveRaw === undefined) return;
      mySeq = seq.autosave;
      if (autosaveRaw === null) method = 'DELETE';
      else {
        raw = autosaveRaw;
        lastAutosavePush = Date.now();
      }
      autosaveRaw = undefined;
    }
    const ka = keepalive && (raw === undefined || byteLength(raw) <= KEEPALIVE_MAX_BYTES);
    // The server writes only while it still holds the version this copy builds on.
    const before = { ...s.meta.slots[slot] };
    try {
      const r = await request<{ updated?: unknown }>(method, `/save/${slot}?base=${before.base}`, undefined, {
        rawBody: raw,
        keepalive: ka,
      });
      if (session !== s) return;
      failures[slot] = 0;
      failed.delete(slot);
      const m = s.meta.slots[slot];
      const updated = num(r?.updated);
      if (updated) {
        m.base = updated;
        epoch[slot]++;
      }
      m.owner = s.userId;
      if (seq[slot] === mySeq) m.dirty = false;
      saveMeta(s.meta, s.userId, [slot], before);
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

/** A local change of career or settings (in whichever namespace is active). */
function onLocalChange(slot: Slot) {
  if (applying || isSwitching()) return;
  seq[slot]++;
  markLocal(slot);
  if (syncing()) schedule(slot, DEBOUNCE_MS);
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
      } while (s.again && session === s && !s.leaving);
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
    if (session !== s || s.leaving) return;
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
  // The stores must still hold this account's data (a sign-out may have begun meanwhile).
  if (session !== s || s.leaving || activeSpace() !== s.userId) return;
  failed.delete('load');
  loadFailures = 0;

  keepUnusableCloudAutosave(res);
  const m = s.meta;
  if (s.fresh) adoptGuestProgress(s, res);
  const local = { career: localSide('career', m), settings: localSide('settings', m), autosave: localSide('autosave', m) };
  const owner = { career: m.slots.career.owner, settings: m.slots.settings.owner, autosave: m.slots.autosave.owner };
  const plan = planSync(res, local, { owner, userId: s.userId });
  // A slot whose upload finished while the read was on its way is newer here than in this reply.
  const fresh = (slot: Slot) => epoch[slot] === epochs[slot];
  const before = SLOTS.map((slot) => JSON.stringify(m.slots[slot]));
  let pulled = false;
  applying = true;
  try {
    for (const slot of SLOTS) {
      if (!fresh(slot)) continue;
      const remote = remoteSide(res, slot);
      if (plan[slot] === 'pull') {
        try {
          applyRemote(slot, remote, local[slot], s);
          pulled = true;
        } catch (err) {
          console.warn(`[EPD] could not apply cloud save "${slot}"`, err);
        }
      } else {
        // 'push' uploads on top of the version just read; 'none' means both sides already agree.
        m.slots[slot] = { owner: s.userId, base: remote.updated, dirty: plan[slot] === 'push' };
      }
    }
  } finally {
    applying = false;
  }
  // Only entries this merge changed: another tab may hold a newer entry for a slot that stayed as it was.
  saveMeta(
    m,
    s.userId,
    SLOTS.filter((slot, i) => JSON.stringify(m.slots[slot]) !== before[i]),
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
 * First cloud read of an account new to this browser: guest progress fills the slots the account never had on
 * the server (a copy: the guest keeps its own). An account with a career or a shift in the cloud, even a
 * finished one, gets nothing of the guest's. Settings came along when the namespace was made
 * (src/store/space.ts prepareAccountSpace) and follow the same rule in planSync: the cloud copy wins.
 */
function adoptGuestProgress(s: Session, res: SaveResponse) {
  s.fresh = false;
  applying = true;
  try {
    for (const slot of ['career', 'autosave'] as const) {
      const remote = remoteSide(res, slot);
      if (remote.updated || remote.data != null || s.meta.slots[slot].base) continue;
      if (slot === 'career') {
        const g = guestCareer();
        if (!g || useCareer.getState().profile) continue;
        useCareer.setState(normalizeCareerState(g));
      } else {
        const g = validAutosave(guestAutosave());
        if (!g || !isValidSave(g) || loadAutosave()) continue;
        autosave(g, { cloud: false });
      }
      // Guest data: planSync lets it fill the empty slot and never more.
      s.meta.slots[slot] = { owner: null, base: 0, dirty: true };
    }
  } finally {
    applying = false;
  }
}

/**
 * The tab became visible or got focus: ask the server for its slot versions (a tiny request) and read
 * the cloud again when another tab or device saved something, before the player can change anything here.
 */
async function checkCloud(): Promise<void> {
  const s = syncing();
  if (!s || s.merging || SLOTS.some(busySlot)) return;
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
  if (SLOTS.some((slot) => num(updated[slot]) !== s.meta.slots[slot].base)) await resync(s);
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

/**
 * Make an identity's browser data the active one: an account's cache on sign-in, the guest's own data when
 * the account is left. The stores and the autosave switch at once; nothing of one is written into the other.
 */
function enterSpace(id: number | null): void {
  if (id === activeSpace()) return;
  if (id !== null) prepareAccountSpace(id);
  const was = applying;
  applying = true;
  try {
    switchSpace(id);
  } finally {
    applying = was;
  }
  meta = readMeta(id);
  useAccount.setState((st) => ({ space: id, pulls: st.pulls + 1 }));
}

/**
 * Leave the account's data: the guest's own career, settings and shift come back. A shift of the account that
 * is still running is saved into the account's namespace first (marked as changed there, so the next sign-in
 * uploads it and offers it again). With `kick` the game also goes back to the login screen: the session ended
 * without the player asking (it expired, or another tab signed out or in as someone else).
 */
function toGuest(kick = false): void {
  if (activeSpace() === null) return;
  const g = useGame.getState();
  if (g.sim || g.report) {
    if (g.screen === 'game') saveNow();
    stopLoop();
  }
  const inShift = g.screen === 'game' || g.screen === 'report' || g.screen === 'briefing';
  if (kick && g.user?.method === 'account') {
    useGame.setState({ user: null, sim: null, report: null, screen: 'login', mapFocus: null, selection: {} });
  } else if (g.sim || g.report || inShift) {
    useGame.setState({ sim: null, report: null, mapFocus: null, selection: {}, ...(inShift ? { screen: 'menu' as const } : {}) });
  }
  enterSpace(null);
}

function sessionLost() {
  endSession();
  useAccount.setState({ user: null, sessionLost: true });
  toGuest(true);
}

async function startSession(user: AccountUser): Promise<void> {
  endSession();
  const id = Number(user.id);
  const fresh = storageGet(metaKey(id)) === null;
  enterSpace(id);
  const s: Session = { userId: id, meta, fresh, ready: false, merging: null, again: false, leaving: false };
  session = s;
  bindUser(id);
  // Tell the other tabs which account this browser is signed in to now (one that syncs another account stops).
  saveAccount(id);
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
  space: activeSpace(),
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

  logout: async (opts = {}) => {
    const s = session;
    set({ user: null, error: null, sessionLost: false });
    if (!s) {
      toGuest();
      return;
    }
    s.leaving = true;
    // What is waiting goes up as the account's data is now: taken before the stores switch to the guest's.
    const pending = s.ready ? flushWaiting(false) : Promise.resolve();
    toGuest();
    await Promise.race([pending, new Promise((r) => setTimeout(r, LOGOUT_FLUSH_MS))]);
    // A shared computer: the account's cache goes, except what the server does not have yet (never while
    // that namespace is active again, src/store/space.ts). Another tab of the account may hold such changes
    // too: they are in the stored marker, not in this tab's.
    const forget = () => {
      if (!opts.forget) return;
      const stored = readMeta(s.userId);
      clearAccountSpace(
        s.userId,
        SLOTS.filter((slot) => s.meta.slots[slot].dirty || stored.slots[slot].dirty),
      );
    };
    if (session !== s) {
      // Someone logged in again meanwhile (that login replaced the server session), or the session ended.
      forget();
      return;
    }
    endSession();
    // The server session ends for every tab of this browser: the others stop syncing as well.
    saveAccount(null);
    forget();
    try {
      await request('POST', '/logout', {});
    } catch {
      /* the cookie expires on its own */
    }
  },

  decline: () => {
    declined = true;
    // Also without a session: whatever logs in now plays with the guest's own data.
    void get().logout();
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
      const id = session?.userId ?? activeSpace();
      endSession();
      saveAccount(null);
      toGuest();
      // The account and all its data are gone from the server: its cache in this browser goes as well.
      if (id !== null) clearAccountSpace(id);
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
  if (applying || isSwitching()) return;
  seq.autosave++;
  markLocal('autosave');
  if (!syncing()) return;
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
  if (applying || isSwitching()) return;
  seq.autosave++;
  markLocal('autosave');
  if (!syncing()) return;
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
