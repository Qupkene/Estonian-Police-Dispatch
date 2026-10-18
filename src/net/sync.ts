// Pure cloud-save helpers: which side wins per slot, plus validation of what the server sends back.
// No stores, no network: unit-tested in tests/account.test.ts. Cloud data is checked with the same rules as
// browser data (src/store/migrate.ts), so a copy from an older or newer client loads the same way.
import { settingValue, SIM_VERSION, upgradeSave } from '@/store/migrate';

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

// ── Local sync metadata (kept by src/net/account.ts) ──
// Every namespace of browser data (src/store/migrate.ts) has its own marker: `epd:sync` for the guest (it also
// records the account this browser is signed in to, read by the other tabs) and `epd:acct:<id>:sync` for the
// cache of an account.

export interface SlotMeta {
  /** Account this slot's browser data was last synced with; null = guest data. */
  owner: number | null;
  /** Server version (`updated`) of the copy last synced; 0 = never synced. */
  base: number;
  /** Changed in this browser since the last sync. */
  dirty: boolean;
}

export interface Meta {
  /** Account this browser is signed in to (written on sign-in and sign-out, read by other tabs). Guest marker only. */
  account: number | null;
  slots: Record<Slot, SlotMeta>;
}

/**
 * Format 3: browser data has a namespace per identity. A guest marker without it (format 1 of 92ed7f5, format 2
 * of the release before) means the plain keys may still hold an account's data: src/store/space.ts moves them.
 */
export const META_VERSION = 3;

/**
 * The marker as stored. The guest's (`space` null) also carries the signed-in account and the format 1 fields a
 * rollback to 92ed7f5 reads (legacyMeta, `foreign` as there); an account's only its slots. `v` is lower only while
 * src/store/space.ts could not finish moving account data out of the plain keys (the next load tries again).
 */
export function metaJson(m: Meta, space: number | null, now: number, foreign = false, v = META_VERSION): string {
  if (space !== null) return JSON.stringify({ v, slots: m.slots });
  return JSON.stringify({ v, account: m.account, slots: m.slots, ...legacyMeta(m, now, foreign) });
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

/** Format 1 of the marker: all that 92ed7f5 reads (`owner`, and `updated` mixing its own and the server's clock). */
export interface LegacyMeta {
  owner: number | null;
  updated: Record<Slot, number>;
}

/** Format 1 owner that no account has (ids start at 1): 92ed7f5 counts such data as another account's. */
export const FOREIGN_OWNER = 0;

/**
 * The guest marker in format 1, written next to format 3 so that a rollback to 92ed7f5 behaves. That version
 * knows only the plain keys, which hold the guest's data now, and reads only `owner` and `updated`:
 * - signed out in a browser where no account was ever signed in, `owner` is null and a slot changed here counts
 *   as newer than any copy (92ed7f5's own rule for guest data, as before);
 * - while an account is signed in, 92ed7f5 merges the plain keys into it at once after a rollback. `owner` is
 *   then FOREIGN_OWNER, so the guest's data never replaces the account's cloud copy, it only fills empty
 *   slots (the cloud copy that comes down instead does not touch the guest's career: src/store/space.ts keeps
 *   a copy of it in epd:backup.career.guest on sign-in, and the way forward restores it);
 * - signed out after an account was signed in here (`foreign`), the same: the plain keys then hold nothing or a
 *   guest copy older than the account's progress, and every slot would count as changed when the marker was
 *   last written, so 92ed7f5 would upload them over the account's cloud copy at its next sign-in.
 */
export function legacyMeta(m: Meta, now: number, foreign = false): LegacyMeta {
  const owner = m.account === null && !foreign ? null : FOREIGN_OWNER;
  const updated = {} as Record<Slot, number>;
  for (const slot of SLOTS) {
    const e = m.slots[slot];
    updated[slot] = e.dirty ? Math.max(e.base + 1, now) : e.base;
  }
  return { owner, updated };
}

/** A resumable autosave (SimState of this version, or an older one it upgrades; not ended) or null. */
export function validAutosave(v: unknown): Record<string, unknown> | null {
  const u = upgradeSave(v);
  return isObj(u) && u.version === SIM_VERSION && u.ended !== true ? u : null;
}

/** Career slot payload: `{ profile, inbox }` as kept by the career store. */
export function validCareer(v: unknown): { profile: Record<string, unknown> | null; inbox: unknown[] } | null {
  if (!isObj(v) || !('profile' in v)) return null;
  const profile = isObj(v.profile) ? v.profile : null;
  return { profile, inbox: Array.isArray(v.inbox) ? v.inbox : [] };
}

/**
 * Keep only settings the running game knows and can use: each checked like a stored browser setting
 * (src/store/migrate.ts settingValue: allowed values, ranges, else the same primitive type as the current
 * value). An older or newer client may have stored other keys or values.
 */
export function sanitizeSettings(remote: unknown, current: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isObj(remote)) return out;
  for (const [k, v] of Object.entries(current)) {
    if (typeof v === 'function' || !(k in remote)) continue;
    const r = settingValue(k, remote[k], v);
    if (r !== undefined) out[k] = r;
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
