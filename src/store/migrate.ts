// Saved data survives every update (docs/DESIGN.md, "Salvestuste ühilduvus").
//
// Everything a player has played lives in this browser (epd:career, epd:settings, epd:autosave) and, for
// account users, in the cloud. Each identity has its own keys: the guest the plain ones, every account a cache
// namespace epd:acct:<id>:* (see "Storage namespaces" below and src/store/space.ts). This module is the single
// place that reads such data defensively:
// - normalisers that turn whatever an older, newer or broken client stored into a shape the game can run,
//   keeping unknown fields and dropping invalid entries one by one (never a whole list or profile);
// - a zustand persist guard: a migrate step per version, a deep merge over the current defaults, and
//   storage that is never written over when it holds a version this code does not know;
// - bounded backups (epd:backup.*) of anything that is about to be replaced.
// No stores and no network here: src/store/* and src/net/* use these helpers.
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { REGION_IDS } from '@/data/regions';
import { START_MONEY, START_REPUTATION } from '@/data/economy';
import { isLaterSectorId, withSectors } from '@/sim/careerSectors';
import { sectorsOf } from '@/sim/sectors';
import type {
  Candidate,
  CareerProfile,
  FleetVehicle,
  LedgerEntry,
  RegionId,
  StaffMember,
  Text,
  UnitType,
} from '@/sim/types';

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// ── Storage namespaces ──────────────────────────────────────────────────────
// Account data and guest data never mix in the browser. The guest keeps the plain keys (epd:career,
// epd:settings, epd:autosave, epd:sync, epd:backup.*); every account has a cache of its server data under
// epd:acct:<id>: (epd:acct:7:career, epd:acct:7:backup.career ...). Everything in this module and in the stores
// reads and writes the active namespace; src/store/space.ts switches it (and rebinds the stores).

/** Account whose namespace is active; null = the guest (plain keys). */
let space: number | null = null;

export function activeSpace(): number | null {
  return space;
}

/** Only src/store/space.ts calls this: it rebinds the persisted stores at the same time. */
export function setActiveSpace(id: number | null): void {
  space = id;
}

/** `epd:` for the guest, `epd:acct:<id>:` for an account. */
export function spacePrefix(id: number | null = space): string {
  return id === null ? 'epd:' : `epd:acct:${id}:`;
}

/** Storage key of `name` (career, settings, autosave, sync) in a namespace, by default the active one. */
export function spaceKey(name: string, id: number | null = space): string {
  return spacePrefix(id) + name;
}

// ── Storage access (blocked or missing storage never throws) ────────────────

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked
  }
}

export function storageGet(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** False when the browser refused the write (storage full or blocked). */
export function storageSet(key: string, value: string): boolean {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ── Backups ─────────────────────────────────────────────────────────────────

/** Every backup key of the guest starts with this (src/net/account.ts used it first for cloud conflicts). */
export const BACKUP_PREFIX = 'epd:backup.';

/** Backup keys of a namespace: `epd:backup.` (guest) or `epd:acct:<id>:backup.`, by default the active one. */
export function backupPrefix(id: number | null = space): string {
  return spacePrefix(id) + 'backup.';
}
/** The older of two kept copies: `epd:backup.<name>.prev`. */
const PREV = '.prev';

/** A replaced value: `epd:backup.career`, `epd:backup.settings`, `epd:backup.autosave` (+ `.prev`), per namespace. */
export interface BackupEntry {
  /** Browser time of the backup (unix ms). */
  at: number;
  /** Why it was replaced: 'cloud' (a cloud copy was pulled), 'reset', 'create', 'replaced' ... */
  reason: string;
  /** The data existed nowhere else (guest data or changes never uploaded): kept over other backups. */
  unique: boolean;
  /** Account the data was last synced with, when known (null = guest data). */
  owner?: number | null;
  data: unknown;
}

function readEntry(key: string): BackupEntry | null {
  const raw = storageGet(key);
  if (!raw) return null;
  try {
    const e: unknown = JSON.parse(raw);
    if (!isPlainObject(e) || !('data' in e)) return null;
    // The first backups (`{ at, owner, data }`) were only written for data found nowhere else.
    return { ...(e as unknown as BackupEntry), unique: e.unique !== false };
  } catch {
    return null;
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Keep `data` before it is replaced, in `epd:backup.<name>` (newest) and, with `keep: 2`, `epd:backup.<name>.prev`.
 * Bounded: when more than `keep` copies would exist, the oldest copy that is not `unique` goes first, so
 * guest progress or unsynced changes are not pushed out by copies that also existed elsewhere. A copy equal
 * to one already kept is not stored twice. Returns false when nothing could be stored (storage full).
 */
export function keepBackup(
  name: string,
  data: unknown,
  opts: { reason: string; unique?: boolean; owner?: number | null; keep?: 1 | 2; space?: number | null },
): boolean {
  if (data === null || data === undefined) return true;
  const key = backupPrefix(opts.space === undefined ? space : opts.space) + name;
  const keep = opts.keep ?? 2;
  const kept = [readEntry(key), readEntry(key + PREV)]
    .filter((e): e is BackupEntry => e !== null)
    .slice(0, keep);
  if (kept.some((e) => sameJson(e.data, data))) return true;
  const entry: BackupEntry = { at: Date.now(), reason: opts.reason, unique: opts.unique === true, data };
  if (opts.owner !== undefined) entry.owner = opts.owner;
  const list = [entry, ...kept];
  while (list.length > keep) {
    let drop = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].unique) {
        drop = i;
        break;
      }
    }
    list.splice(drop < 0 ? list.length - 1 : drop, 1);
  }
  if (!list.includes(entry)) return true; // older unique copies win over this one
  // The older copy moves first: when storage is full, the newest kept copy is still there.
  if (keep > 1 && list[1] && !storageSet(key + PREV, JSON.stringify(list[1]))) return false;
  return storageSet(key, JSON.stringify(list[0]));
}

/** Kept copies, newest first (of the active namespace unless `id` names another). */
export function readBackups(name: string, id: number | null = space): BackupEntry[] {
  const key = backupPrefix(id) + name;
  return [readEntry(key), readEntry(key + PREV)].filter((e): e is BackupEntry => e !== null);
}

/**
 * Keep a stored string exactly as it was (`epd:backup.<name>`, the one before it in `.prev`): values this
 * version cannot read or resume, an older version before migration, data that had to be repaired.
 * Restoring is copying the string back to its key. False when storage refused it.
 */
export function keepRawBackup(name: string, raw: string, id: number | null = space): boolean {
  const key = backupPrefix(id) + name;
  const old = storageGet(key);
  if (old === raw || storageGet(key + PREV) === raw) return true;
  if (old !== null && !storageSet(key + PREV, old)) return false;
  return storageSet(key, raw);
}

// ── Value helpers ───────────────────────────────────────────────────────────

/** Paths of stored values that had to be dropped or replaced (a repair lost something). */
export type Issues = string[];

/** A finite number (or a numeric string from a sloppy writer), else `d`. */
function num(v: unknown, d: number, issues: Issues, path: string): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  if (v !== undefined) issues.push(path);
  return d;
}

function str(v: unknown, d: string, issues: Issues, path: string): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (v !== undefined) issues.push(path);
  return d;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], d: T, issues: Issues, path: string): T {
  if (allowed.includes(v as T)) return v as T;
  if (v !== undefined) issues.push(path);
  return d;
}

/** A bilingual text: `{ et, en }`, a plain string for both, or one language copied to the other. */
export function toText(v: unknown, issues: Issues = [], path = 'text'): Text {
  if (typeof v === 'string') return { et: v, en: v };
  if (isPlainObject(v) && (typeof v.et === 'string' || typeof v.en === 'string')) {
    const et = typeof v.et === 'string' ? v.et : (v.en as string);
    const en = typeof v.en === 'string' ? v.en : (v.et as string);
    return { ...v, et, en } as Text;
  }
  if (v !== undefined) issues.push(path);
  return { et: '', en: '' };
}

/** An array of valid entries: invalid ones are dropped one by one, a non-array becomes []. */
function list<T>(v: unknown, fn: (x: unknown, i: number) => T | null, issues: Issues, path: string): T[] {
  if (!Array.isArray(v)) {
    if (v !== undefined) issues.push(path);
    return [];
  }
  const out: T[] = [];
  v.forEach((x, i) => {
    const e = fn(x, i);
    if (e === null) issues.push(`${path}[${i}]`);
    else out.push(e);
  });
  return out;
}

const strings = (v: unknown, issues: Issues, path: string): string[] =>
  list(v, (x) => (typeof x === 'string' ? x : null), issues, path);

/** Ids were always strings; a number is accepted as its string. */
const idOf = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;

// ── Career ──────────────────────────────────────────────────────────────────

const UNIT_TYPES: readonly UnitType[] = [
  'patrol',
  'rapid',
  'k9',
  'traffic',
  'criminal',
  'special',
  'heli',
  'border',
  'aux',
  'community',
  'transport',
  'boat',
];
const STAFF_STATUS: readonly StaffMember['status'][] = ['active', 'injured', 'vacation', 'training'];
const GENDERS = ['M', 'F'] as const;
const GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
const LEDGER_KINDS: readonly LedgerEntry['kind'][] = [
  'budget',
  'bonus',
  'salary',
  'hire',
  'vehicle',
  'upgrade',
  'upkeep',
  'fuel',
  'overtime',
  'fine',
  'other',
];

function staffMember(x: unknown, issues: Issues, path: string): StaffMember | null {
  if (!isPlainObject(x)) return null;
  const id = idOf(x.id);
  if (!id) return null;
  const m: Record<string, unknown> = {
    ...x,
    id,
    badge: str(x.badge, '', issues, `${path}.badge`),
    firstName: str(x.firstName, '', issues, `${path}.firstName`),
    lastName: str(x.lastName, '', issues, `${path}.lastName`),
    gender: oneOf(x.gender, GENDERS, 'M', issues, `${path}.gender`),
    rank: toText(x.rank, issues, `${path}.rank`),
    title: toText(x.title, issues, `${path}.title`),
    years: num(x.years, 0, issues, `${path}.years`),
    skill: num(x.skill, 0.5, issues, `${path}.skill`),
    stress: num(x.stress, 0, issues, `${path}.stress`),
    avatarSeed: num(x.avatarSeed, 1, issues, `${path}.avatarSeed`),
    specialty: oneOf(x.specialty, UNIT_TYPES, 'patrol', issues, `${path}.specialty`),
    salary: num(x.salary, 0, issues, `${path}.salary`),
    hiredDay: num(x.hiredDay, 1, issues, `${path}.hiredDay`),
    status: oneOf(x.status, STAFF_STATUS, 'active', issues, `${path}.status`),
    morale: num(x.morale, 0.7, issues, `${path}.morale`),
    xp: num(x.xp, 0, issues, `${path}.xp`),
    shifts: num(x.shifts, 0, issues, `${path}.shifts`),
  };
  if (x.statusUntil !== undefined) {
    const until = num(x.statusUntil, NaN, issues, `${path}.statusUntil`);
    if (Number.isFinite(until)) m.statusUntil = until;
    else delete m.statusUntil;
  }
  if (x.injured !== undefined && typeof x.injured !== 'boolean') {
    issues.push(`${path}.injured`);
    delete m.injured;
  }
  return m as unknown as StaffMember;
}

function fleetVehicle(x: unknown, issues: Issues, path: string): FleetVehicle | null {
  if (!isPlainObject(x)) return null;
  const id = idOf(x.id);
  if (!id) return null;
  const suits = list(
    x.suits,
    (s) => (UNIT_TYPES.includes(s as UnitType) ? (s as UnitType) : null),
    issues,
    `${path}.suits`,
  );
  return {
    ...x,
    id,
    model: str(x.model, '', issues, `${path}.model`),
    plate: str(x.plate, '', issues, `${path}.plate`),
    suits: suits.length ? suits : ['patrol'],
    condition: num(x.condition, 1, issues, `${path}.condition`),
    boughtDay: num(x.boughtDay, 1, issues, `${path}.boughtDay`),
    price: num(x.price, 0, issues, `${path}.price`),
    upkeep: num(x.upkeep, 0, issues, `${path}.upkeep`),
  } as FleetVehicle;
}

function ledgerEntry(x: unknown, issues: Issues, path: string): LedgerEntry | null {
  if (!isPlainObject(x)) return null;
  const amount = num(x.amount, NaN, [], path);
  if (!Number.isFinite(amount)) return null; // a booking without an amount means nothing
  return {
    ...x,
    day: num(x.day, 1, issues, `${path}.day`),
    kind: oneOf(x.kind, LEDGER_KINDS, 'other', issues, `${path}.kind`),
    amount,
    text: toText(x.text, issues, `${path}.text`),
  } as LedgerEntry;
}

function candidate(x: unknown, issues: Issues, path: string): Candidate | null {
  if (!isPlainObject(x)) return null;
  const id = idOf(x.id);
  if (!id) return null;
  return {
    ...x,
    id,
    firstName: str(x.firstName, '', issues, `${path}.firstName`),
    lastName: str(x.lastName, '', issues, `${path}.lastName`),
    gender: oneOf(x.gender, GENDERS, 'M', issues, `${path}.gender`),
    age: num(x.age, 30, issues, `${path}.age`),
    specialty: oneOf(x.specialty, UNIT_TYPES, 'patrol', issues, `${path}.specialty`),
    skill: num(x.skill, 0.5, issues, `${path}.skill`),
    salary: num(x.salary, 0, issues, `${path}.salary`),
    years: num(x.years, 0, issues, `${path}.years`),
    avatarSeed: num(x.avatarSeed, 1, issues, `${path}.avatarSeed`),
    bio: toText(x.bio, issues, `${path}.bio`),
  } as Candidate;
}

type HistoryEntry = CareerProfile['history'][number];

function historyEntry(x: unknown, issues: Issues, path: string, home: RegionId): HistoryEntry | null {
  if (!isPlainObject(x)) return null;
  return {
    ...x,
    day: num(x.day, 1, issues, `${path}.day`),
    regionId: oneOf(x.regionId, REGION_IDS, home, issues, `${path}.regionId`),
    score: num(x.score, 0, issues, `${path}.score`),
    grade: oneOf(x.grade, GRADES, 'C', issues, `${path}.grade`),
    incidents: num(x.incidents, 0, issues, `${path}.incidents`),
    earnings: num(x.earnings, 0, issues, `${path}.earnings`),
    reputationDelta: num(x.reputationDelta, 0, issues, `${path}.reputationDelta`),
  } as HistoryEntry;
}

/** An object of counters: every listed key a number (default 0), other keys kept. */
function counters(
  v: unknown,
  keys: readonly string[],
  issues: Issues,
  path: string,
): Record<string, unknown> {
  const src = isPlainObject(v) ? v : {};
  if (v !== undefined && !isPlainObject(v)) issues.push(path);
  const out: Record<string, unknown> = { ...src };
  for (const k of keys) out[k] = num(src[k], 0, issues, `${path}.${k}`);
  return out;
}

/**
 * Sectors covered per prefecture: prefecture keys and ids of that prefecture's sectors (a later version's
 * too, isLaterSectorId), anything else dropped.
 */
function sectorMap(v: unknown, issues: Issues): Partial<Record<RegionId, string[]>> | undefined {
  if (!isPlainObject(v)) {
    issues.push('sectors');
    return undefined;
  }
  const out: Partial<Record<RegionId, string[]>> = {};
  for (const [k, ids] of Object.entries(v)) {
    if (!REGION_IDS.includes(k as RegionId)) {
      issues.push(`sectors.${k}`);
      continue;
    }
    if (!Array.isArray(ids)) {
      issues.push(`sectors.${k}`);
      continue;
    }
    const known = new Set(sectorsOf(k as RegionId).map((x) => x.id));
    out[k as RegionId] = list(
      ids,
      (id) => (typeof id === 'string' && (known.has(id) || isLaterSectorId(k as RegionId, id)) ? id : null),
      issues,
      `sectors.${k}`,
    );
  }
  return out;
}

/** The prefect's standing offer: a known prefecture, string choices and a day, else dropped. */
function sectorOffer(v: unknown, day: number, issues: Issues): CareerProfile['offer'] | undefined {
  if (!isPlainObject(v) || !REGION_IDS.includes(v.regionId as RegionId)) {
    issues.push('offer');
    return undefined;
  }
  return {
    ...v,
    regionId: v.regionId as RegionId,
    choices: strings(v.choices, issues, 'offer.choices'),
    day: num(v.day, day, issues, 'offer.day'),
  };
}

/**
 * The career's story (docs/STORY.md): its numbers checked, bad entries dropped one by one, unknown fields kept (a
 * later version's). An unusable chapter drops the whole story: the career then starts it again at the chapter
 * its state matches, as a career from before the story does.
 */
function storyState(v: unknown, day: number, issues: Issues): CareerProfile['story'] | undefined {
  const positive = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 1;
  if (!isPlainObject(v) || !positive(v.chapter)) {
    issues.push('story');
    return undefined;
  }
  const chapter = v.chapter as number;
  const out: Record<string, unknown> = {
    ...v,
    chapter,
    from: positive(v.from) && (v.from as number) <= chapter ? v.from : chapter,
    since: num(v.since, day, issues, 'story.since'),
    shifts: num(v.shifts, 0, issues, 'story.shifts'),
    done: strings(v.done, issues, 'story.done'),
  };
  if (v.from !== undefined && out.from !== v.from) issues.push('story.from');
  if (v.complete !== undefined && typeof v.complete !== 'boolean') {
    issues.push('story.complete');
    delete out.complete;
  }
  if (v.desk !== undefined && typeof v.desk !== 'string') {
    issues.push('story.desk');
    delete out.desk;
  }
  if (v.choice !== undefined) {
    const c = v.choice;
    if (isPlainObject(c) && typeof c.id === 'string')
      out.choice = { ...c, id: c.id, day: num(c.day, day, issues, 'story.choice.day') };
    else {
      issues.push('story.choice');
      delete out.choice;
    }
  }
  if (v.answers !== undefined) {
    if (isPlainObject(v.answers)) {
      const answers: Record<string, string> = {};
      for (const [k, a] of Object.entries(v.answers)) {
        if (typeof a === 'string' && !UNSAFE_KEYS.has(k)) answers[k] = a;
        else issues.push(`story.answers.${k}`);
      }
      out.answers = answers;
    } else {
      issues.push('story.answers');
      delete out.answers;
    }
  }
  if (v.press !== undefined) {
    const pr = v.press;
    if (isPlainObject(pr) && typeof pr.day === 'number' && Number.isFinite(pr.day))
      out.press = {
        ...pr,
        day: pr.day,
        title: toText(pr.title, issues, 'story.press.title'),
        body: toText(pr.body, issues, 'story.press.body'),
        byline: str(pr.byline, '', issues, 'story.press.byline'),
      };
    else {
      issues.push('story.press');
      delete out.press;
    }
  }
  return out as unknown as CareerProfile['story'];
}

const STAT_KEYS = ['shifts', 'incidents', 'arrests', 'bestScore', 'pursuitsCaught'] as const;
const COUNTER_KEYS = ['nightShifts', 'pranksCaught', 'aStreak'] as const;

/**
 * A career profile the game can run, from whatever was stored: missing lists and objects get defaults,
 * invalid entries are dropped one by one, numbers stay numbers, unknown fields (a newer version's, or
 * extras such as `counters`) are kept. A profile from before sectors gets them (withSectors, docs/SECTORS.md).
 * Idempotent: a valid profile comes back deep-equal. Null for "no career".
 * Every stored value that had to be dropped or replaced is listed in `issues`.
 */
export function normalizeCareerProfile(x: unknown, issues: Issues = []): CareerProfile | null {
  if (x === null || x === undefined) return null;
  if (!isPlainObject(x)) {
    issues.push('profile');
    return null;
  }
  const regionId = oneOf(x.regionId, REGION_IDS, 'pohja', issues, 'regionId');
  const unlocked = list(
    x.unlockedRegions,
    (r) => (REGION_IDS.includes(r as RegionId) ? (r as RegionId) : null),
    issues,
    'unlockedRegions',
  );
  const p: Record<string, unknown> = {
    ...x,
    version: typeof x.version === 'number' && Number.isFinite(x.version) ? x.version : 1,
    name: str(x.name, '', issues, 'name'),
    badge: str(x.badge, '', issues, 'badge'),
    regionId,
    createdAt: num(x.createdAt, 0, issues, 'createdAt'),
    seed: num(x.seed, 1, issues, 'seed'),
    day: num(x.day, 1, issues, 'day'),
    money: num(x.money, START_MONEY, issues, 'money'),
    reputation: num(x.reputation, START_REPUTATION, issues, 'reputation'),
    xp: num(x.xp, 0, issues, 'xp'),
    staff: list(x.staff, (m, i) => staffMember(m, issues, `staff[${i}]`), issues, 'staff'),
    fleet: list(x.fleet, (v, i) => fleetVehicle(v, issues, `fleet[${i}]`), issues, 'fleet'),
    upgrades: strings(x.upgrades, issues, 'upgrades'),
    ledger: list(x.ledger, (e, i) => ledgerEntry(e, issues, `ledger[${i}]`), issues, 'ledger'),
    recruits: list(x.recruits, (c, i) => candidate(c, issues, `recruits[${i}]`), issues, 'recruits'),
    history: list(x.history, (h, i) => historyEntry(h, issues, `history[${i}]`, regionId), issues, 'history'),
    achievements: strings(x.achievements, issues, 'achievements'),
    unlockedRegions: unlocked.includes(regionId) ? unlocked : [regionId, ...unlocked],
    stats: counters(x.stats, STAT_KEYS, issues, 'stats'),
  };
  if (x.paidShifts !== undefined) p.paidShifts = strings(x.paidShifts, issues, 'paidShifts');
  if (x.counters !== undefined) p.counters = counters(x.counters, COUNTER_KEYS, issues, 'counters');
  // Sectors (docs/SECTORS.md): checked here, then made whole by withSectors, which gives a career from before
  // sectors every sector of each unlocked prefecture (it plays exactly as before).
  if (x.sectors !== undefined) {
    const sectors = sectorMap(x.sectors, issues);
    if (sectors) p.sectors = sectors;
    else delete p.sectors;
  }
  if (x.openPosts !== undefined) p.openPosts = strings(x.openPosts, issues, 'openPosts');
  if (x.offer !== undefined) {
    const offer = sectorOffer(x.offer, p.day as number, issues);
    if (offer) p.offer = offer;
    else delete p.offer;
  }
  if (x.sectorsChangedDay !== undefined)
    p.sectorsChangedDay = num(x.sectorsChangedDay, 1, issues, 'sectorsChangedDay');
  // The story (docs/STORY.md): checked here only when stored. A career from before it gets nothing here (it loads
  // deep-equal) and starts the story with its next paid shift (src/sim/story.ts).
  if (x.story !== undefined) {
    const story = storyState(x.story, p.day as number, issues);
    if (story) p.story = story;
    else delete p.story;
  }
  return withSectors(p as unknown as CareerProfile);
}

/** Messages waiting in the career inbox: texts kept, anything else dropped one by one. */
export function normalizeInbox(v: unknown, issues: Issues = []): Text[] {
  const isText = (x: unknown) =>
    typeof x === 'string' || (isPlainObject(x) && (typeof x.et === 'string' || typeof x.en === 'string'));
  return list(v, (x) => (isText(x) ? toText(x) : null), issues, 'inbox');
}

/** The career store's data (`{ profile, inbox }`, the epd:career state and the cloud career slot). */
export function normalizeCareerState(
  x: unknown,
  issues: Issues = [],
): { profile: CareerProfile | null; inbox: Text[] } {
  const src = isPlainObject(x) ? x : {};
  if (x !== undefined && x !== null && !isPlainObject(x)) issues.push('career');
  return { profile: normalizeCareerProfile(src.profile, issues), inbox: normalizeInbox(src.inbox, issues) };
}

/**
 * Stored keys over the current state without touching its actions: what a store's persist merge starts
 * from, so fields this version does not know (a newer version's) survive and are written back.
 */
export function overState<S extends object>(current: S, stored: Record<string, unknown>): S {
  const cur = current as Record<string, unknown>;
  const out: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(stored))
    if (typeof cur[k] !== 'function' && !UNSAFE_KEYS.has(k)) out[k] = v;
  return out as S;
}

/** Keys that would change an object's prototype when assigned. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ── Settings ────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const finite = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      ? Number(v)
      : undefined;
const choice =
  (...allowed: string[]) =>
  (v: unknown) =>
    typeof v === 'string' && allowed.includes(v) ? v : undefined;
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

/** Per-setting checks: the accepted value, or undefined when the stored one is unusable. */
export const SETTING_RULES: Record<string, (v: unknown) => unknown> = {
  lang: choice('et', 'en'),
  volume: (v) => {
    const n = finite(v);
    return n === undefined ? undefined : clamp(n, 0, 1);
  },
  sfx: bool,
  radioVoice: bool,
  ambience: bool,
  mapStyle: choice('tactical', 'dark', 'maaamet', 'foto'),
  reducedMotion: bool,
  theme: choice('dark', 'light'),
  uiScale: (v) => {
    const n = finite(v);
    return n === undefined ? undefined : clamp(n, 0.85, 1.25);
  },
  hints: bool,
  colorblind: bool,
};

/**
 * A stored setting checked against the running game's value `current`: the setting's rule when there is
 * one, else the same primitive type (a finite number for numbers). Undefined when it cannot be used.
 */
export function settingValue(key: string, v: unknown, current: unknown): unknown {
  const rule = SETTING_RULES[key];
  if (rule) return rule(v);
  if (typeof current === 'number') return finite(v);
  return typeof v === typeof current && typeof v !== 'function' && typeof v !== 'object' ? v : undefined;
}

/**
 * Stored settings over the current state: known keys checked one by one (an unusable value keeps the
 * default and is listed in `issues`), keys a newer version added are kept, actions are never replaced.
 */
export function normalizeSettings<S extends object>(
  stored: Record<string, unknown>,
  current: S,
  issues: Issues = [],
): S {
  const cur = current as Record<string, unknown>;
  const out: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(stored)) {
    if (typeof cur[k] === 'function' || UNSAFE_KEYS.has(k)) continue;
    if (!Object.prototype.hasOwnProperty.call(cur, k)) {
      out[k] = v;
      continue;
    }
    const ok = settingValue(k, v, cur[k]);
    if (ok === undefined) issues.push(k);
    else out[k] = ok;
  }
  return out as S;
}

// ── Shift autosave (SimState) ───────────────────────────────────────────────

/** SimState.version written by this game (src/sim/types.ts). */
export const SIM_VERSION = 2;

/**
 * SIM_STEPS[v] turns a version v save into version v + 1. Add one with every SimState version bump
 * (docs/DESIGN.md). A save older than the first step, or one a step rejects (throws), cannot be resumed and
 * is kept in a backup key instead.
 */
const SIM_STEPS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {};

/** An autosave brought up to SIM_VERSION when steps exist for it; anything else is returned unchanged. */
export function upgradeSave(x: unknown): unknown {
  if (!isPlainObject(x) || typeof x.version !== 'number') return x;
  let s = x;
  try {
    while (typeof s.version === 'number' && s.version < SIM_VERSION && SIM_STEPS[s.version]) {
      const next = SIM_STEPS[s.version](s);
      if (!isPlainObject(next) || next.version === s.version) break;
      s = next;
    }
  } catch (err) {
    console.warn('[EPD] could not upgrade a saved shift', err);
    return x;
  }
  return s;
}

/** Backup name for an autosave that cannot be resumed: `autosave.v<version>`, or `autosave.invalid`. */
export function autosaveBackupName(x: unknown): string {
  return isPlainObject(x) && typeof x.version === 'number' && Number.isFinite(x.version)
    ? `autosave.v${x.version}`
    : 'autosave.invalid';
}

// ── zustand persist guard ───────────────────────────────────────────────────

export interface PersistGuard<S> {
  /** localStorage key of the guest, e.g. 'epd:career' (an account's is epd:acct:<id>:career, src/store/space.ts). */
  name: string;
  /** Short name for backup keys and logs ('career' gives epd:backup.career.v1 ...), also the namespace key name. */
  slot: string;
  /** Version this code writes. Bump only with a step in `steps` (docs/DESIGN.md). */
  version: number;
  /** steps[v] turns the stored state of version v into version v + 1. Pure; may throw on data it cannot use. */
  steps?: Record<number, (state: Record<string, unknown>) => Record<string, unknown>>;
  /** Stored state over the current one (defaults + actions). Push a path to `issues` for every dropped value. */
  normalize: (stored: Record<string, unknown>, current: S, issues: Issues) => S;
}

/**
 * persist() options that never lose stored data. zustand 5 alone throws stored state away when its version
 * differs and there is no `migrate` (it logs and keeps the defaults, and the next change writes them over the
 * old data), when the JSON does not parse, or when `migrate` throws. With these options:
 * - an older version is kept as `epd:backup.<slot>.v<n>` and brought up step by step;
 * - a newer or unknown version is read (normalised) but the key is never written over in this session, and
 *   a copy goes to `epd:backup.<slot>.v<n>`;
 * - unreadable JSON is kept as `epd:backup.<slot>.invalid` before the defaults are used;
 * - the stored state is merged over the current defaults (new fields get defaults, unknown fields survive),
 *   and a value the normaliser had to drop leaves the original in `epd:backup.<slot>.repaired`.
 * When a backup cannot be written, the key is not written over either.
 */
/** Persisted stores write nothing while this is above 0 (a namespace switch resets them first). */
let writesHeld = 0;

/**
 * Run `fn` without any guarded store writing to storage. src/store/space.ts resets the stores to their defaults
 * this way before they read the other namespace: neither namespace may get the other's data or the defaults.
 */
export function withoutPersistWrites(fn: () => void): void {
  writesHeld++;
  try {
    fn();
  } finally {
    writesHeld--;
  }
}

export function guardedPersist<S>(cfg: PersistGuard<S>) {
  /** The stored string of the last read, for backups taken after parsing. */
  let lastRaw: string | null = null;
  /** The stored value must stay as it is (newer version, failed migration, no room for a backup). */
  let locked = false;
  let warned = false;

  const lock = (why: string) => {
    locked = true;
    console.warn(`[EPD] ${cfg.name}: ${why}; the stored copy is kept as it is`);
  };

  const storage: PersistStorage<S> = {
    getItem: (name) => {
      lastRaw = null;
      locked = false;
      warned = false;
      const raw = storageGet(name);
      if (raw === null) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = undefined;
      }
      if (!isPlainObject(parsed) || !isPlainObject(parsed.state)) {
        if (keepRawBackup(`${cfg.slot}.invalid`, raw))
          console.warn(`[EPD] ${name} could not be read; kept in ${backupPrefix()}${cfg.slot}.invalid`);
        else lock('unreadable and no room for a backup');
        return null;
      }
      const v = parsed.version;
      const known = typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= cfg.version;
      if (!known) {
        keepRawBackup(
          typeof v === 'number' && Number.isFinite(v) ? `${cfg.slot}.v${v}` : `${cfg.slot}.unknown`,
          raw,
        );
        lock(`saved by another version (${String(v)}, this one writes ${cfg.version})`);
      } else if (v < cfg.version && !keepRawBackup(`${cfg.slot}.v${v}`, raw)) {
        lock(`version ${v} needs migrating and there is no room for a backup`);
      }
      lastRaw = raw;
      // A missing or odd version would skip zustand's migrate call: hand it a number that makes it call ours.
      return (known ? parsed : { ...parsed, version: cfg.version + 1 }) as StorageValue<S>;
    },
    setItem: (name, value) => {
      if (writesHeld) return;
      if (locked) {
        if (!warned) console.warn(`[EPD] ${name} is not saved in this session (see the warning above)`);
        warned = true;
        return;
      }
      try {
        storageSet(name, JSON.stringify(value));
      } catch {
        /* not serialisable: keep the last good copy */
      }
    },
    removeItem: (name) => {
      if (!locked && !writesHeld) storageRemove(name);
    },
  };

  const migrate = (state: unknown, from: number): S => {
    if (locked || !(from < cfg.version) || !isPlainObject(state)) return state as S;
    let s = state;
    try {
      for (let v = from; v < cfg.version; v++) {
        const step = cfg.steps?.[v];
        if (step) s = step(s);
      }
      return s as S;
    } catch (err) {
      console.error(`[EPD] ${cfg.name}: migration from version ${from} failed`, err);
      lock('migration failed');
      return state as S;
    }
  };

  const merge = (persisted: unknown, current: S): S => {
    if (!isPlainObject(persisted)) return current;
    const issues: Issues = [];
    let out: S;
    try {
      out = cfg.normalize(persisted, current, issues);
    } catch (err) {
      console.error(`[EPD] ${cfg.name}: stored data could not be used`, err);
      lock('stored data could not be used');
      return current;
    }
    if (issues.length && lastRaw !== null) {
      console.warn(`[EPD] ${cfg.name}: repaired ${issues.length} stored value(s)`, issues.slice(0, 20));
      if (!keepRawBackup(`${cfg.slot}.repaired`, lastRaw))
        lock('repaired, and no room for a backup of the original');
    }
    return out;
  };

  return { name: cfg.name, version: cfg.version, storage, migrate, merge };
}
