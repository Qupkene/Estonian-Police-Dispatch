// Pure cloud-save helpers: which side wins per slot, plus validation of what the server sends back.
// No stores, no network: unit-tested in tests/account.test.ts.

export type Slot = 'career' | 'settings' | 'autosave';
export const SLOTS: readonly Slot[] = ['career', 'settings', 'autosave'];

/** One side of a slot: `data` null = nothing stored, `updated` 0 = age unknown (unix ms otherwise). */
export interface Side {
  data: unknown;
  updated: number;
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

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Decide one slot.
 * - The server never had it: upload what the browser has (first-login migration).
 * - The browser never had it: take the server's copy.
 * - Both known: the newer `updated` wins; equal ages mean "already in sync", except when both ages are
 *   unknown, then the server is the source of truth.
 */
export function decideSlot(local: Side, remote: Side): SyncAction {
  const hasLocal = local.data != null;
  const hasRemote = remote.data != null;
  if (!hasRemote && !remote.updated) return hasLocal ? 'push' : 'none';
  if (!hasLocal && !local.updated) return hasRemote ? 'pull' : 'none';
  if (remote.updated > local.updated) return 'pull';
  if (local.updated > remote.updated) return 'push';
  return local.updated === 0 && hasRemote ? 'pull' : 'none';
}

export interface PlanOptions {
  /** Account the local data was last synced with (null: never synced, i.e. guest data). */
  owner: number | null;
  /** Account that is logging in now. */
  userId: number;
}

/** Remote side of a slot from GET /api/save, after validating the payload. */
export function remoteSide(res: SaveResponse, slot: Slot): Side {
  const data = slot === 'autosave' ? validAutosave(res.autosave) : isObj(res[slot]) ? res[slot] : null;
  return { data, updated: num(res.updated?.[slot]) };
}

/**
 * Per-slot actions for a login. Local data that was last synced with a different account is treated as
 * being of unknown age, so that account's server copy wins (a shared browser never overwrites someone
 * else's cloud save); when the server has nothing it is still migrated.
 */
export function planSync(res: SaveResponse, local: Record<Slot, Side>, opts: PlanOptions): Record<Slot, SyncAction> {
  const foreign = opts.owner !== null && opts.owner !== opts.userId;
  const out = {} as Record<Slot, SyncAction>;
  for (const slot of SLOTS) {
    const l = local[slot];
    out[slot] = decideSlot(foreign ? { data: l.data, updated: 0 } : l, remoteSide(res, slot));
  }
  return out;
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
