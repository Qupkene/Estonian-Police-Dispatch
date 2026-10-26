// Each identity's own browser data (docs/DESIGN.md, "Salvestuste ühilduvus").
//
// The guest keeps the plain keys (epd:career, epd:settings, epd:autosave, epd:sync, epd:backup.*). Every account
// has a cache namespace, epd:acct:<id>:career, :settings, :autosave, :sync and :backup.*, which the cloud sync
// (src/net/account.ts) fills from the server and writes back; the server stays the source of truth. Exactly one
// namespace is active: the persisted stores and the autosave read and write only that one, so a guest can never
// see or continue an account's game and an account never gets the guest's data written over its own.
//
// Here: switching the active namespace (the stores are rebound without writing anything), the one-time move
// of account data out of the plain keys for browsers that synced before namespaces existed, and removing an
// account's cache. No network, no UI.
import {
  activeSpace,
  isPlainObject,
  keepBackup,
  keepRawBackup,
  readBackups,
  setActiveSpace,
  spaceKey,
  spacePrefix,
  storageGet,
  storageRemove,
  storageSet,
  withoutPersistWrites,
  type BackupEntry,
} from './migrate';
import { META_VERSION, metaJson, parseMeta, SLOTS, type Meta, type Slot, type SlotMeta } from '@/net/sync';
import { forgetReplays } from './replay';

// ── Stores bound to the active namespace ────────────────────────────────────

interface Rebindable {
  persist: { setOptions: (o: { name: string }) => void; rehydrate: () => unknown };
  setState: (state: never, replace: true) => void;
  getInitialState: () => unknown;
}

const stores: { slot: Slot; store: Rebindable }[] = [];

/** A persisted store whose key follows the active namespace (`slot` is its key name: career, settings). */
export function registerSpaceStore(slot: Slot, store: Rebindable): void {
  stores.push({ slot, store });
}

let switching = false;

/** True while the stores are being rebound: their changes then are not the player's. */
export function isSwitching(): boolean {
  return switching;
}

/**
 * Make `id` (an account, or null for the guest) the active namespace. Every registered store first goes back
 * to its defaults without writing (so neither namespace receives the other's data), then reads the new
 * namespace. False when it already was active.
 */
export function switchSpace(id: number | null): boolean {
  if (id === activeSpace()) return false;
  switching = true;
  try {
    setActiveSpace(id);
    withoutPersistWrites(() => {
      for (const { slot, store } of stores) {
        store.persist.setOptions({ name: spaceKey(slot) });
        store.setState(store.getInitialState() as never, true);
      }
    });
    // Synchronous: the storage is localStorage.
    for (const { store } of stores) void store.persist.rehydrate();
  } finally {
    switching = false;
  }
  return true;
}

// ── Markers ─────────────────────────────────────────────────────────────────

/** epd:sync (guest) or epd:acct:<id>:sync. */
export const metaKey = (id: number | null): string => spaceKey('sync', id);

export function readMeta(id: number | null): Meta {
  return parseMeta(storageGet(metaKey(id)));
}

/** The guest marker as stored, or null (missing or garbage). */
function storedGuestMarker(): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(storageGet(metaKey(null)) ?? 'null');
    return isPlainObject(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The guest marker predates namespaces (format 1 or 2: the move below did not finish, storage refused a write,
 * or an older version wrote it again from a tab still open): the plain keys may still hold an account's data.
 */
const layoutPending = (): boolean => {
  const m = storedGuestMarker();
  return m !== null && !(typeof m.v === 'number' && m.v >= META_VERSION);
};

/** `layoutDone`: only migrateLayout, once the plain keys are the guest's. */
export function writeMeta(m: Meta, id: number | null, layoutDone = false): boolean {
  if (id !== null) return storageSet(metaKey(id), metaJson(m, id, Date.now()));
  // The stored format 1 `owner` is set once an account was signed in here (FOREIGN_OWNER, or the account itself
  // before namespaces): a rollback to 92ed7f5 must keep treating the plain keys as foreign (src/net/sync.ts legacyMeta).
  const foreign = typeof storedGuestMarker()?.owner === 'number';
  // A pending move stays pending whoever writes the marker (a sign-in, a guest change): the next load does it.
  const v = !layoutDone && layoutPending() ? META_VERSION - 1 : META_VERSION;
  return storageSet(metaKey(null), metaJson(m, null, Date.now(), foreign, v));
}

const guestSlot = (): SlotMeta => ({ owner: null, base: 0, dirty: true });

// ── Signing in ──────────────────────────────────────────────────────────────

/** Envelope version of the career and settings data this module copies (CAREER_VERSION, SETTINGS_VERSION). */
const STORE_VERSION = 1;

/**
 * Before an account's namespace becomes active (from the guest's):
 * - an account new to this browser starts with the guest's settings (language, sound, accessibility), until
 *   the cloud copy, when there is one, replaces them;
 * - the guest's career is copied to epd:backup.career.guest. Nothing reads it in this version; it is there for a
 *   rollback to 92ed7f5, which knows only the plain keys and would pull the account's cloud career over them.
 */
export function prepareAccountSpace(id: number): void {
  const settings = storageGet(spaceKey('settings', null));
  if (settings !== null && storageGet(spaceKey('settings', id)) === null) storageSet(spaceKey('settings', id), settings);
  // Not while the plain keys may still hold an account's data: the next load's move would give it to the guest.
  const career = layoutPending() ? null : storedState(storageGet(spaceKey('career', null)));
  if (career && isPlainObject(career.profile)) {
    keepBackup('career.guest', career, { reason: 'guest', unique: true, owner: null, keep: 1, space: null });
  }
}

/** The `state` of a persisted envelope of this version, or null. */
function storedState(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isPlainObject(v) && isPlainObject(v.state) && v.version === STORE_VERSION ? v.state : null;
  } catch {
    return null;
  }
}

/** The guest's stored career (`{ profile, inbox }` with a profile), for the first sign-in of an account. */
export function guestCareer(): Record<string, unknown> | null {
  const s = storedState(storageGet(spaceKey('career', null)));
  return s && isPlainObject(s.profile) ? s : null;
}

/** The guest's stored shift, parsed (the caller checks that it can be resumed). */
export function guestAutosave(): unknown {
  const raw = storageGet(spaceKey('autosave', null));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// ── Leaving an account ──────────────────────────────────────────────────────

/** Every key of an account's namespace. */
function spaceKeys(id: number): string[] {
  const prefix = spacePrefix(id);
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
  } catch {
    /* storage blocked */
  }
  return out;
}

/**
 * Remove an account's cache from this browser (sign-out on a shared computer, a deleted account). Slots in
 * `keep` stay with their marker entries: they hold changes the server does not have yet, which the next
 * sign-in uploads. Everything else goes, backups and the replays kept on this device (src/store/replay.ts) included.
 */
export function clearAccountSpace(id: number, keep: readonly Slot[] = []): void {
  if (id === activeSpace()) return; // never under the stores' feet
  void forgetReplays(spacePrefix(id)).catch(() => {});
  const stay = new Set(keep.map((slot) => spaceKey(slot, id)));
  if (keep.length) stay.add(metaKey(id));
  for (const k of spaceKeys(id)) if (!stay.has(k)) storageRemove(k);
  if (keep.length) {
    const m = readMeta(id);
    for (const slot of SLOTS) if (!keep.includes(slot)) m.slots[slot] = guestSlot();
    writeMeta(m, id);
  }
}

// ── Browsers that synced before namespaces existed ──────────────────────────

/** A guest backup worth restoring: the guest's data that an account's cloud copy replaced, or the sign-in copy. */
const isGuestBackup = (e: BackupEntry) => e.owner === null && (!e.reason || e.reason === 'cloud' || e.reason === 'guest');

/**
 * Move one slot's plain key into the account's namespace (settings are copied: the guest keeps the
 * preferences of this browser). 'moved', or 'kept' when the account's cache stays instead, or false when
 * storage refused (nothing lost then).
 * A cache already there (a rollback ran in between) that holds changes the server never got:
 * - the plain copy is the very server version those changes build on (the older version only pulled it):
 *   the cache stays, so the next sign-in uploads the changes; the plain copy is kept as a backup;
 * - else the plain copy is newer and moves in; the cache is kept as epd:acct:<id>:backup.<slot>.replaced.
 */
function moveSlot(slot: Slot, id: number, entry: SlotMeta, target: Meta): 'moved' | 'kept' | false {
  const from = spaceKey(slot, null);
  const to = spaceKey(slot, id);
  const raw = storageGet(from);
  if (raw === null) return 'moved'; // only the marker entry moves
  const old = storageGet(to);
  if (old === raw) return 'moved';
  const cache = target.slots[slot];
  if (old !== null && cache.dirty) {
    if (cache.base > 0 && entry.base === cache.base) return keepRawBackup(`${slot}.replaced`, raw, id) ? 'kept' : false;
    if (!keepRawBackup(`${slot}.replaced`, old, id)) return false;
  }
  if (storageSet(to, raw)) return 'moved';
  if (slot === 'settings') return false;
  // Storage is full (a long shift is over a megabyte): the value moves instead of being copied.
  storageRemove(from);
  if (storageSet(to, raw)) return 'moved';
  storageSet(from, raw);
  return false;
}

/** Put the newest guest backup of a moved slot back in the guest's key. The backup stays. */
function restoreGuestBackup(slot: 'career' | 'autosave'): boolean {
  if (storageGet(spaceKey(slot, null)) !== null) return false;
  const found = [...readBackups(`${slot}.guest`, null), ...readBackups(slot, null)]
    .filter(isGuestBackup)
    .filter((e) => isPlainObject(e.data) && (slot !== 'career' || isPlainObject(e.data.profile)))
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0))[0];
  if (!found) return false;
  const raw = slot === 'career' ? JSON.stringify({ state: found.data, version: STORE_VERSION }) : JSON.stringify(found.data);
  return storageSet(spaceKey(slot, null), raw);
}

/**
 * Once per page, before the stores read anything: a browser whose guest marker predates namespaces (format 1
 * of 92ed7f5, format 2 of the release before, or either one written again after a rollback) may hold an
 * account's data in the plain keys, where a guest would see it. Per slot, by the marker's owner:
 * - an account (owner = its id): the data and its marker entry move into that account's namespace. They are a
 *   cache of the server's copy, and changes not uploaded yet stay marked as such, so the next sign-in uploads
 *   them. The guest gets back what an account's cloud copy once replaced (the guest backups), else nothing;
 *   settings stay for the guest as well.
 * - no owner, or no marker: guest data, it stays where it is.
 * Nothing is deleted that exists only here. When storage refuses a write, the plain keys stay as they were and
 * the move is tried again on the next load.
 */
export function migrateLayout(): void {
  const raw = storageGet(metaKey(null));
  if (raw === null) return; // never synced: whatever the plain keys hold is the guest's
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isPlainObject(stored) || (typeof stored.v === 'number' && stored.v >= META_VERSION)) return;
  const meta = parseMeta(raw);
  const guest: Meta = { account: meta.account, slots: { career: guestSlot(), settings: guestSlot(), autosave: guestSlot() } };
  const targets = new Map<number, Meta>();
  const moved: ('career' | 'autosave')[] = [];
  for (const slot of SLOTS) {
    const e = meta.slots[slot];
    const id = e.owner;
    if (id === null || !Number.isSafeInteger(id) || id <= 0) continue; // the guest's
    const target = targets.get(id) ?? readMeta(id);
    const done = moveSlot(slot, id, e, target);
    if (!done) {
      console.warn(`[EPD] no room to move the account's ${slot} out of the guest's keys; trying again next time`);
      return;
    }
    if (done === 'moved') target.slots[slot] = { owner: id, base: e.base, dirty: e.dirty };
    targets.set(id, target);
    if (slot !== 'settings') moved.push(slot);
  }
  for (const [id, m] of targets) {
    if (!writeMeta(m, id)) return;
  }
  for (const slot of moved) storageRemove(spaceKey(slot, null));
  // From here on the plain keys are the guest's: a page that dies now restores no backups, and loses nothing.
  if (!writeMeta(guest, null, true)) return;
  for (const slot of moved) restoreGuestBackup(slot);
}

// Runs when the first store module imports this one, so before any store reads its key.
migrateLayout();
