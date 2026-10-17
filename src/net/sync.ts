// Pure cloud-save helpers: which side wins per slot, plus validation of what the server sends back.
// No stores, no network: unit-tested in tests/account.test.ts.

export type Slot = 'career' | 'settings' | 'autosave';
export const SLOTS: readonly Slot[] = ['career', 'settings', 'autosave'];

/**
 * The server's copy of a slot. `data` null = nothing stored or a deletion marker; `updated` is the
 * server's version of the slot (unix ms on the server clock, strictly growing), 0 = the server never had it.
 */
export interface Side {
  data: unknown;
  updated: number;
}

/**
 * This browser's copy of a slot. No client clock is involved: `base` is the server version this copy
 * was last synced with, `dirty` says whether it changed locally since.
 */
export interface LocalSide {
  data: unknown;
  /** Server `updated` of the copy last synced (0 = never synced). */
  base: number;
  /** Changed in this browser since the last sync. */
  dirty: boolean;
}

export type SyncAction = 'pull' | 'push' | 'none';

/** GET /api/save */
export interface SaveResponse {
  career: unknown;
  settings: unknown;
  autosave: unknown;
  updated?: Partial<Record<Slot, number | null>>;
}

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A positive finite number, else 0. */
export const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Decide one slot. Only server versions are compared, never a client clock with the server's.
 * - Both copies hold the same data: nothing to do.
 * - `foreign` (guest data, or data last synced with another account): it may only fill a slot the
 *   account has nothing in. Whatever the account has in the cloud wins.
 * - The server still has the version we synced: upload when the browser changed it, else nothing.
 * - The server's version is older than the one we synced (its row is gone, or it was restored from a
 *   backup): upload, so the browser's progress is not lost.
 * - The server has a newer version: take it. When the browser changed the slot too, that is a conflict:
 *   the cloud copy wins and the caller keeps the local one in a backup key (see needsBackup).
 */
export function decideSlot(local: LocalSide, remote: Side, foreign = false): SyncAction {
  const hasLocal = local.data != null;
  const hasRemote = remote.data != null;
  if (hasLocal && hasRemote && sameJson(local.data, remote.data)) return 'none';
  if (foreign) {
    if (hasRemote) return 'pull';
    return hasLocal ? 'push' : 'none';
  }
  if (!hasLocal && !hasRemote && !remote.updated) return 'none';
  if (remote.updated === local.base) return local.dirty ? 'push' : 'none';
  if (remote.updated < local.base) return 'push';
  return 'pull';
}

/**
 * True when pulling would overwrite browser data that exists nowhere else (changed here and not
 * uploaded, or guest data): the caller copies it to a backup key first.
 */
export function needsBackup(local: LocalSide, remote: Side): boolean {
  return local.data != null && local.dirty && !sameJson(local.data, remote.data);
}

export interface PlanOptions {
  /** Account each local slot was last synced with (null: never synced, i.e. guest data). */
  owner: Record<Slot, number | null>;
  /** Account that is logging in now. */
  userId: number;
}

/** Remote side of a slot from GET /api/save, after validating the payload. */
export function remoteSide(res: SaveResponse, slot: Slot): Side {
  const data = slot === 'autosave' ? validAutosave(res.autosave) : isObj(res[slot]) ? res[slot] : null;
  return { data, updated: num(res.updated?.[slot]) };
}

/**
 * Per-slot actions for a sync. Local data that is guest data or was last synced with a different account
 * never overwrites the account's cloud copy (a shared or new browser cannot destroy someone's career);
 * it is only migrated into slots the account has nothing in.
 */
export function planSync(res: SaveResponse, local: Record<Slot, LocalSide>, opts: PlanOptions): Record<Slot, SyncAction> {
  const out = {} as Record<Slot, SyncAction>;
  for (const slot of SLOTS) {
    out[slot] = decideSlot(local[slot], remoteSide(res, slot), opts.owner[slot] !== opts.userId);
  }
  return out;
}

// ── Local sync metadata (localStorage `epd:sync`, kept by src/net/account.ts) ──

export interface SlotMeta {
  /** Account this slot's browser data was last synced with; null = guest data. */
  owner: number | null;
  /** Server version (`updated`) of the copy last synced; 0 = never synced. */
  base: number;
  /** Changed in this browser since the last sync. */
  dirty: boolean;
}

export interface Meta {
  /** Account this browser is signed in to (written on sign-in and sign-out, read by other tabs). */
  account: number | null;
  slots: Record<Slot, SlotMeta>;
}

// Without any metadata the browser's data has an unknown history (e.g. from before accounts existed),
// so it counts as changed: a cloud copy never replaces it without a backup.
const freshSlot = (): SlotMeta => ({ owner: null, base: 0, dirty: true });

/** Stored metadata (format 2, or format 1 `{ owner, updated }` from the first accounts release). */
export function parseMeta(raw: string | null): Meta {
  const meta: Meta = { account: null, slots: { career: freshSlot(), settings: freshSlot(), autosave: freshSlot() } };
  if (!raw) return meta;
  try {
    const m: unknown = JSON.parse(raw);
    if (!isObj(m)) return meta;
    const legacyOwner = typeof m.owner === 'number' ? m.owner : null;
    // Format 1 only knew the last synced account.
    meta.account = typeof m.account === 'number' ? m.account : 'account' in m ? null : legacyOwner;
    for (const slot of SLOTS) {
      const e = isObj(m.slots) ? m.slots[slot] : undefined;
      if (isObj(e)) {
        meta.slots[slot] = { owner: typeof e.owner === 'number' ? e.owner : null, base: num(e.base), dirty: e.dirty === true };
      } else if (isObj(m.updated)) {
        // Format 1 mixed both clocks in `updated`. Keep it as the base and count the data as changed: it is
        // uploaded when the server still has that version and kept in a backup when the cloud has another.
        meta.slots[slot] = { owner: legacyOwner, base: num(m.updated[slot]), dirty: true };
      }
    }
  } catch {
    /* garbage: start fresh */
  }
  return meta;
}

/** A resumable autosave (SimState version 2, not ended) or null. */
export function validAutosave(v: unknown): Record<string, unknown> | null {
  return isObj(v) && v.version === 2 && v.ended !== true ? v : null;
}

/** Career slot payload: `{ profile, inbox }` as kept by the career store. */
export function validCareer(v: unknown): { profile: Record<string, unknown> | null; inbox: unknown[] } | null {
  if (!isObj(v) || !('profile' in v)) return null;
  const profile = isObj(v.profile) ? v.profile : null;
  return { profile, inbox: Array.isArray(v.inbox) ? v.inbox : [] };
}

/**
 * Keep only settings the running game knows, with the same primitive type as the current value
 * (an older or newer client may have stored other keys).
 */
export function sanitizeSettings(remote: unknown, current: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isObj(remote)) return out;
  for (const [k, v] of Object.entries(current)) {
    if (typeof v === 'function' || !(k in remote)) continue;
    const r = remote[k];
    if (typeof r === typeof v && (typeof r !== 'number' || Number.isFinite(r))) out[k] = r;
  }
  return out;
}

/** Plain data of a store state (drops actions). */
export function dataOf(state: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) if (typeof v !== 'function') out[k] = v;
  return out;
}

/** Shallow equality of the data keys of two store states. */
export function sameData(a: object, b: object): boolean {
  const da = dataOf(a);
  const db = dataOf(b);
  const keys = new Set([...Object.keys(da), ...Object.keys(db)]);
  for (const k of keys) if (!Object.is(da[k], db[k])) return false;
  return true;
}

/** Delay before retry number `n` (1-based): 2 s, 4 s, 8 s ... capped at a minute. */
export function backoffMs(n: number): number {
  return Math.min(60_000, 2000 * 2 ** Math.max(0, n - 1));
}

// ── Account form rules (docs/SERVER.md: names and passwords) ────────────────

export const NAME_MIN = 3;
export const NAME_MAX = 24;
export const PASSWORD_MIN = 8;

export type NameProblem = 'short' | 'long' | 'chars' | null;

/** Same character set as the server (server/lib/auth.php EPD_NAME_PATTERN). */
const NAME_CHARS = /^[A-Za-z0-9_.\-õäöüšžÕÄÖÜŠŽ]+$/u;

export function nameProblem(name: string): NameProblem {
  const n = name.trim().normalize('NFC');
  if ([...n].length < NAME_MIN) return 'short';
  if ([...n].length > NAME_MAX) return 'long';
  if (!NAME_CHARS.test(n)) return 'chars';
  return null;
}
