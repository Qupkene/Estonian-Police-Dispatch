// @vitest-environment jsdom
// Paths found by the end-to-end upgrade test (the deployed 92ed7f5 build and API, then this version on the
// same origin and database, then back):
// - a career shift that 92ed7f5 saved again after its report (its tab closed on the report screen) is never
//   offered or paid a second time, from the browser or from the cloud;
// - a rollback to 92ed7f5 never uploads the guest's data over an account's cloud copy, and loses nothing on
//   the way back: epd:sync keeps the format 1 fields that version reads (it knows only the plain keys, which
//   hold the guest's data since each identity has its own namespace, src/store/space.ts);
// - a rollback to 2.8.0 (d7871ad), the release before sectors, keeps a sector career's fields (its own normaliser runs
//   here), and the career comes back with them.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { careerShiftPaid, useCareer } from '@/store/career';
import { autosave, loadAutosave, stopLoop, useGame } from '@/store/game';
import { rosterFromCareer } from '@/sim/career';
import { sectorsOf } from '@/sim/sectors';
import { createShift, step } from '@/sim/engine';
import { DAY, MIN, tallinnTime, wall } from '@/sim/time';
import { FOREIGN_OWNER, legacyMeta, parseMeta, SLOTS, type Slot } from '@/net/sync';
import type { CareerProfile, SimState } from '@/sim/types';

vi.stubGlobal('requestAnimationFrame', () => 1);
vi.stubGlobal('cancelAnimationFrame', () => {});

const fixture = (set: string, f: string) => readFileSync(join(__dirname, 'fixtures', 'saves', set, f), 'utf8');
/** 92ed7f5 in Chromium: career paid for day 1, and day 1's shift saved again after its report. */
const PAID_CAREER = fixture('92ed7f5-chromium', 'epd-career-paid.json');
const SAVED_AFTER_REPORT = fixture('92ed7f5-chromium', 'epd-autosave-after-report.json');

type CareerData = { profile: CareerProfile | null; inbox: unknown[] };
const stateOf = (raw: string) => (JSON.parse(raw) as { state: CareerData }).state;
/** A career from before sectors as this version loads it: every sector of each unlocked prefecture (docs/SECTORS.md). */
const upgraded = (p: CareerProfile): CareerProfile =>
  p.sectors ? p : { ...p, sectors: Object.fromEntries(p.unlockedRegions.map((r) => [r, sectorsOf(r).map((x) => x.id)])) };

// The first page load transforms the whole module graph: done once here, outside any test's time budget.
beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
  await import('@/net/account'); // every test's beforeEach installs its own fetch
}, 60_000);

beforeEach(() => {
  useCareer.setState(useCareer.getInitialState(), true);
  localStorage.clear();
  stopLoop();
  useGame.setState({ sim: null, report: null, screen: 'menu' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a shift 92ed7f5 saved again after its report', () => {
  it('is not offered, is kept byte for byte, and the career stays as it was', async () => {
    localStorage.setItem('epd:career', PAID_CAREER);
    localStorage.setItem('epd:autosave', SAVED_AFTER_REPORT);
    await useCareer.persist.rehydrate();
    const before = useCareer.getState().profile!;
    expect(before.day).toBe(2);
    expect(careerShiftPaid(before, JSON.parse(SAVED_AFTER_REPORT) as SimState)).toBe(true);

    expect(loadAutosave()).toBeNull();
    expect(localStorage.getItem('epd:autosave')).toBeNull();
    expect(localStorage.getItem('epd:backup.autosave.unresumable')).toBe(SAVED_AFTER_REPORT);
    expect(useCareer.getState().profile).toEqual(before);
    expect(localStorage.getItem('epd:career')).toBe(PAID_CAREER);
  });

  it("this version's own flow: today's shift resumes and pays once, the same save written back is refused", async () => {
    localStorage.setItem('epd:career', fixture('92ed7f5', 'epd-career.json'));
    await useCareer.persist.rehydrate();
    const p = useCareer.getState().profile!;
    // Today's career shift, started the way the briefing starts it (calendar date of the current day).
    const w = wall(p.createdAt + (p.day - 1) * DAY);
    const s = createShift({
      seed: 4242,
      regionId: p.regionId,
      mode: 'career',
      difficulty: 'normal',
      start: tallinnTime(w.year, w.month, w.day, 7, 0),
      hours: 12,
      playerName: p.name,
      roster: rosterFromCareer(p, 'day'),
      upgrades: p.upgrades,
      reputation: p.reputation,
    });
    for (let i = 0; i < 90; i++) step(s, MIN);
    autosave(s, { cloud: false });
    const today = localStorage.getItem('epd:autosave')!;

    const sim = loadAutosave();
    expect(sim).not.toBeNull();
    useGame.getState().resumeShift(sim!);
    const report = useGame.getState().endShift()!;
    useCareer.getState().applyReport(report);
    expect(useCareer.getState().profile!.day).toBe(p.day + 1);

    // What 92ed7f5 did on closing the report's tab: the shift saved again, without this version's flag.
    localStorage.setItem('epd:autosave', today);
    expect(loadAutosave()).toBeNull();
    expect(localStorage.getItem('epd:backup.autosave.unresumable')).toBe(today);
    expect(useCareer.getState().profile!.day).toBe(p.day + 1);
  });

  it("only the career's own record counts: another day, prefecture or incident count is still resumed", () => {
    const sim = JSON.parse(SAVED_AFTER_REPORT) as SimState;
    const p = stateOf(PAID_CAREER).profile!;
    expect(careerShiftPaid(p, sim)).toBe(true);
    expect(careerShiftPaid(p, { ...sim, regionId: 'ida' })).toBe(false);
    expect(careerShiftPaid(p, { ...sim, stats: { ...sim.stats, incidents: sim.stats.incidents + 1 } })).toBe(false);
    expect(careerShiftPaid(p, { ...sim, startTime: sim.startTime + DAY })).toBe(false);
    expect(careerShiftPaid({ ...p, day: 1 }, sim)).toBe(false);
    expect(careerShiftPaid({ ...p, history: [] }, sim)).toBe(false);
    expect(careerShiftPaid({ ...p, createdAt: NaN }, sim)).toBe(false);
    // The 92ed7f5 fixture career and its in-progress shift (dates outside the calendar) stay resumable.
    const c = stateOf(fixture('92ed7f5', 'epd-career.json')).profile!;
    expect(careerShiftPaid(c, JSON.parse(fixture('92ed7f5', 'epd-autosave-career.json')) as SimState)).toBe(false);
  });

  it('a new device whose cloud holds the pair: the career arrives, the stale shift is not offered, nothing is written', async () => {
    api.cookie = 7;
    api.write(7, 'career', stateOf(PAID_CAREER));
    api.write(7, 'settings', { volume: 0.4 });
    api.write(7, 'autosave', JSON.parse(SAVED_AFTER_REPORT));
    const page = await boot();
    expect(page.useCareer.getState().profile).toEqual(upgraded(stateOf(PAID_CAREER).profile!));
    expect(page.game.loadAutosave()).toBeNull();
    expect(api.writes()).toEqual([]);
    expect(api.json(7, 'autosave')).toEqual(JSON.parse(SAVED_AFTER_REPORT));
  });
});

// ── Rollback to 92ed7f5 ─────────────────────────────────────────────────────

/** 92ed7f5's own reading of epd:sync and its sync decision (src/net/account.ts, src/net/sync.ts there). */
const v92 = {
  readMeta(raw: string | null) {
    const meta = { owner: null as number | null, updated: { career: 0, settings: 0, autosave: 0 } as Record<Slot, number> };
    if (!raw) return meta;
    const m = JSON.parse(raw) as { owner?: unknown; updated?: Record<string, unknown> };
    if (typeof m.owner === 'number') meta.owner = m.owner;
    for (const slot of SLOTS) {
      const v = m.updated?.[slot];
      if (typeof v === 'number' && Number.isFinite(v)) meta.updated[slot] = v;
    }
    return meta;
  },
  decideSlot(local: { data: unknown; updated: number }, remote: { data: unknown; updated: number }) {
    const hasLocal = local.data != null;
    const hasRemote = remote.data != null;
    if (!hasRemote && !remote.updated) return hasLocal ? 'push' : 'none';
    if (!hasLocal && !local.updated) return hasRemote ? 'pull' : 'none';
    if (remote.updated > local.updated) return 'pull';
    if (local.updated > remote.updated) return 'push';
    return local.updated === 0 && hasRemote ? 'pull' : 'none';
  },
  /** The plan 92ed7f5 makes when it starts with this browser's epd:sync and the cloud as it is. */
  plan(rawMeta: string | null, local: Record<Slot, unknown>, userId: number) {
    const meta = v92.readMeta(rawMeta);
    const foreign = meta.owner !== null && meta.owner !== userId;
    const out = {} as Record<Slot, string>;
    for (const slot of SLOTS) {
      const row = api.rows.get(`${userId}:${slot}`);
      const data = row ? JSON.parse(row.json) : null;
      out[slot] = v92.decideSlot({ data: local[slot], updated: foreign ? 0 : meta.updated[slot] }, { data, updated: row?.updated ?? 0 });
    }
    return out;
  },
};

describe('a rollback to 92ed7f5', () => {
  const career = (name: string, money: number) => ({
    profile: { ...stateOf(fixture('92ed7f5', 'epd-career-new.json')).profile!, name, money },
    inbox: [],
  });
  /** What 92ed7f5 finds in the plain keys (it knows nothing else). */
  const plainKeys = () => ({
    career: (JSON.parse(localStorage.getItem('epd:career') ?? 'null') as { state?: CareerData } | null)?.state?.profile
      ? (JSON.parse(localStorage.getItem('epd:career')!) as { state: CareerData }).state
      : null,
    settings: (JSON.parse(localStorage.getItem('epd:settings') ?? 'null') as { state?: unknown } | null)?.state ?? null,
    autosave: JSON.parse(localStorage.getItem('epd:autosave') ?? 'null') as unknown,
  });
  /** 92ed7f5 pulled a slot: the cloud copy in the plain key and its server version in a format 1 marker. */
  function v92Pulls(slots: Slot[]) {
    const updated = { career: 0, settings: 0, autosave: 0 } as Record<Slot, number>;
    for (const slot of slots) {
      const row = api.rows.get(`7:${slot}`)!;
      const data = JSON.parse(row.json) as unknown;
      localStorage.setItem(`epd:${slot}`, slot === 'autosave' ? row.json : JSON.stringify({ state: data, version: 1 }));
      updated[slot] = row.updated;
    }
    localStorage.setItem('epd:sync', JSON.stringify({ owner: 7, updated }));
  }

  it("signed in: 92ed7f5 never uploads the guest's data over the account's cloud copy, it only fills empty slots", async () => {
    api.cookie = 7;
    api.write(7, 'career', career('Mari', 100));
    // The guest has a career of its own in this browser.
    localStorage.setItem('epd:career', JSON.stringify({ state: career('Külaline', 5), version: 1 }));
    const page = await boot();
    expect(page.useCareer.getState().profile?.name).toBe('Mari');
    const plan = v92.plan(localStorage.getItem('epd:sync'), plainKeys(), 7);
    expect(plan.career).toBe('pull');
    expect(plan.settings).toBe('pull');
    expect(Object.values(plan)).not.toContain('push');
    // The guest's career is kept for the way back.
    expect(JSON.parse(localStorage.getItem('epd:backup.career.guest')!).data).toEqual(career('Külaline', 5));
  });

  it("the way back after 92ed7f5 pulled: the guest's career returns, the account's cache moves into its namespace", async () => {
    api.cookie = 7;
    api.write(7, 'career', career('Mari', 100));
    localStorage.setItem('epd:career', JSON.stringify({ state: career('Külaline', 5), version: 1 }));
    await boot();
    closePage();
    v92Pulls(['career', 'settings']);
    const page = await boot();
    expect(page.useCareer.getState().profile?.name).toBe('Mari'); // signed in: the account's
    expect(JSON.parse(localStorage.getItem('epd:career')!).state).toEqual(career('Külaline', 5));
    // The 92ed7f5 marker counts the slot as changed: the account's own career may go up with its sectors filled
    // in (docs/SECTORS.md), never the guest's.
    expect(api.json(7, 'career')).toEqual({ ...career('Mari', 100), profile: upgraded(career('Mari', 100).profile) });
    const out = page.useAccount.getState().logout();
    await vi.advanceTimersByTimeAsync(3500);
    await out;
    expect(page.useCareer.getState().profile?.name).toBe('Külaline');
  });

  it("changes that never reached the server wait in the account's namespace and go up on the way back", async () => {
    api.cookie = 7;
    api.write(7, 'career', career('Mari', 100));
    let page = await boot();
    api.down = true; // the API breaks; the player keeps playing, uploads fail
    page.useCareer.getState().update((p) => ({ ...p, money: 777 }));
    page.useSettings.getState().set({ volume: 0.11 });
    await settle();
    expect(api.json(7, 'career')).toEqual(career('Mari', 100));
    closePage();
    // 92ed7f5 does not see them (they are not in the plain keys), so it cannot replace or upload them either.
    api.down = false;
    expect(v92.plan(localStorage.getItem('epd:sync'), plainKeys(), 7).career).toBe('pull');
    v92Pulls(['career']);
    expect(JSON.parse(localStorage.getItem('epd:acct:7:career')!).state.profile.money).toBe(777);
    // This version again: the cache with the changes stays (the plain copy was only the version they build on).
    page = await boot();
    expect((api.json(7, 'career') as CareerData).profile!.money).toBe(777);
    expect(page.useCareer.getState().profile!.money).toBe(777);
    expect(localStorage.getItem('epd:career')).toBeNull();
  });

  it('signed out: guest data keeps the rule 92ed7f5 had for it', async () => {
    const page = await boot();
    page.useCareer.setState(career('Külaline', 5) as never);
    const legacy = JSON.parse(localStorage.getItem('epd:sync')!) as { owner: unknown; updated: Record<Slot, number> };
    expect(legacy.owner).toBeNull();
    expect(legacy.updated.career).toBeGreaterThan(0);
  });

  it("signed out after an account was signed in here: 92ed7f5 uploads neither the guest's older career nor its empty slots over the cloud", async () => {
    localStorage.setItem('epd:career', JSON.stringify({ state: career('Külaline', 5), version: 1 }));
    api.cookie = 7;
    api.write(7, 'career', career('Mari', 100));
    api.write(7, 'autosave', JSON.parse(fixture('92ed7f5', 'epd-autosave-free.json')));
    const page = await boot();
    // The browser's clock and the server's agree in real life: signing out comes after the last upload.
    vi.setSystemTime(new Date(api.clock + 60_000));
    const out = page.useAccount.getState().logout({ forget: true });
    await vi.advanceTimersByTimeAsync(3500);
    await out;
    expect(page.useCareer.getState().profile?.name).toBe('Külaline');
    expect(localStorage.getItem('epd:autosave')).toBeNull();
    expect(v92.plan(localStorage.getItem('epd:sync'), plainKeys(), 7)).toEqual({ career: 'pull', settings: 'pull', autosave: 'pull' });
    // Still so after the guest plays on (the marker is written again).
    page.useSettings.getState().set({ volume: 0.3 });
    expect(v92.plan(localStorage.getItem('epd:sync'), plainKeys(), 7).career).toBe('pull');
  });

  it('format 1 fields sit next to format 3 and are not read back by this version', () => {
    const meta = parseMeta(
      JSON.stringify({
        v: 3,
        account: 7,
        slots: {
          career: { owner: null, base: 0, dirty: false },
          settings: { owner: null, base: 60, dirty: true },
          autosave: { owner: null, base: 0, dirty: true },
        },
      }),
    );
    // Signed in: an owner no account has, so 92ed7f5 counts the plain keys as foreign.
    expect(legacyMeta(meta, 1000)).toEqual({ owner: FOREIGN_OWNER, updated: { career: 0, settings: 1000, autosave: 1000 } });
    expect(legacyMeta(meta, 10)).toEqual({ owner: FOREIGN_OWNER, updated: { career: 0, settings: 61, autosave: 10 } });
    const stored = JSON.stringify({ v: 3, account: 7, slots: meta.slots, owner: 9, updated: { career: 1, settings: 1, autosave: 1 } });
    expect(parseMeta(stored)).toEqual(meta);
    // Signed out: no owner, everything changed here newer than nothing.
    expect(legacyMeta(parseMeta(null), 5)).toEqual({ owner: null, updated: { career: 5, settings: 5, autosave: 5 } });
  });
});

// ── Rollback to the release before sectors (2.8.0, d7871ad) ─────────────────

/** A career of the first version with sectors: one sector, an opened post, the prefect's offer waiting. */
const SECTOR_CAREER = fixture('sectors', 'epd-career.json');

type Normaliser = Pick<typeof import('@/store/migrate'), 'normalizeCareerState'>;

/**
 * The career normaliser of 2.8.0 (d7871ad), run as that release had it: its source is kept byte for byte next to the
 * fixture (tests/fixtures/saves/sectors/README.md). Vite's own transform strips the types; its two imports
 * (region ids, economy defaults) are handed in. 92ed7f5 had no normaliser: zustand's own merge kept the stored
 * profile object as it was.
 */
async function normaliserOf280(): Promise<Normaliser> {
  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(fixture('sectors', 'migrate.d7871ad.ts.txt'), 'migrate.ts', { lang: 'ts' });
  const deps: Record<string, unknown> = { '@/data/regions': await import('@/data/regions'), '@/data/economy': await import('@/data/economy') };
  const names: string[] = [];
  const body = code
    .replace(/^import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?$/gm, (_, list: string, from: string) => {
      if (!(from in deps)) throw new Error(`2.8.0's normaliser imports ${from}`);
      return `const {${list}} = __deps[${JSON.stringify(from)}];`;
    })
    .replace(/^export\s+(function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kind: string, name: string) => {
      names.push(name);
      return `${kind} ${name}`;
    });
  expect(body).not.toMatch(/^\s*(import|export)\s/m);
  return new Function('__deps', `${body}\nreturn { ${names.join(', ')} };`)(deps) as Normaliser;
}

describe('a rollback to 2.8.0, the release before sectors', () => {
  it("keeps a sector career's fields, and this version reads back what it writes unchanged", async () => {
    const v280 = await normaliserOf280();
    const stored = stateOf(SECTOR_CAREER);
    const p0 = stored.profile!;
    expect(p0.sectors).toEqual({ ida: ['ida-laaneviru'] });
    expect(p0.openPosts).toEqual(['ida-tapa']);
    expect(p0.offer).toMatchObject({ regionId: 'ida', choices: ['ida-johvi'] });
    const issues: string[] = [];
    const there = v280.normalizeCareerState(stored, issues);
    expect(issues).toEqual([]);
    expect(there).toEqual(stored);
    expect(there.profile!.sectorsChangedDay).toBe(p0.sectorsChangedDay);
    // Its store writes the normalised state under the same envelope version; this version loads it unchanged.
    localStorage.setItem('epd:career', JSON.stringify({ state: there, version: 1 }));
    await useCareer.persist.rehydrate();
    expect(useCareer.getState().profile).toEqual(p0);
    expect(Object.keys(localStorage).filter((k) => k.includes('backup'))).toEqual([]);
  });

  it('keeps the sectors this version gave an old career, and what 2.8.0 added on the way is filled in', async () => {
    const v280 = await normaliserOf280();
    // An old career as this version stores it: every sector of its unlocked prefectures.
    localStorage.setItem('epd:career', fixture('92ed7f5', 'epd-career.json'));
    await useCareer.persist.rehydrate();
    const converted = useCareer.getState().profile!;
    expect(Object.keys(converted.sectors ?? {}).sort()).toEqual([...converted.unlockedRegions].sort());
    const there = v280.normalizeCareerState({ profile: converted, inbox: [] });
    expect(there.profile).toEqual(converted);
    // 2.8.0 unlocks a prefecture by rank on a sector career without knowing sectors: back here it starts there
    // in one starter sector (a normal one), and nothing else changes.
    const played = { ...p0Sector(), unlockedRegions: ['ida', 'pohja'] as CareerProfile['unlockedRegions'] };
    localStorage.setItem('epd:career', JSON.stringify({ state: v280.normalizeCareerState({ profile: played, inbox: [] }), version: 1 }));
    await useCareer.persist.rehydrate();
    const back = useCareer.getState().profile!;
    expect(back.sectors).toEqual({ ida: ['ida-laaneviru'], pohja: ['pohja-kesklinn'] });
    expect({ ...back, sectors: undefined }).toEqual({ ...played, sectors: undefined });
  });
});

function p0Sector(): CareerProfile {
  return stateOf(SECTOR_CAREER).profile!;
}

// ── In-memory PHP API (server/lib/saves.php: slot versions, ?base= preconditions) ──

class FakeApi {
  cookie: number | null = null;
  down = false;
  rows = new Map<string, { json: string; updated: number }>();
  clock = 1_900_000_000_000;
  calls: { method: string; path: string }[] = [];

  write(uid: number, slot: Slot, data: unknown) {
    this.rows.set(`${uid}:${slot}`, { json: JSON.stringify(data), updated: ++this.clock });
  }
  json(uid: number, slot: Slot): unknown {
    const row = this.rows.get(`${uid}:${slot}`);
    return row ? JSON.parse(row.json) : undefined;
  }
  writes() {
    return this.calls.filter((c) => (c.method === 'PUT' || c.method === 'DELETE') && c.path.startsWith('/api/save/'));
  }

  async fetch(input: unknown, init: RequestInit = {}): Promise<Response> {
    const url = new URL(String(input), 'http://epd.test');
    const method = init.method ?? 'GET';
    const path = url.pathname;
    this.calls.push({ method, path });
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (this.down) return reply({ error: 'server_error' }, 502);
    const user = { id: 7, name: 'mari_tamm', created: 1 };
    if (path === '/api/health') return reply({ ok: true, version: 'test', accounts: true });
    if (path === '/api/me') return reply({ user: this.cookie === null ? null : user });
    if (this.cookie === null) return reply({ error: 'auth_required' }, 401);
    const uid = this.cookie;
    if (path === '/api/save' && method === 'GET') {
      const out: Record<string, unknown> = {};
      const updated: Record<string, number> = {};
      for (const slot of SLOTS) {
        const row = this.rows.get(`${uid}:${slot}`);
        if (url.searchParams.get('versions') !== '1') out[slot] = row ? JSON.parse(row.json) : null;
        if (row) updated[slot] = row.updated;
      }
      return reply({ ...out, updated });
    }
    const m = /^\/api\/save\/(career|settings|autosave)$/.exec(path);
    if (m && (method === 'PUT' || method === 'DELETE')) {
      const key = `${uid}:${m[1]}`;
      const current = this.rows.get(key)?.updated ?? 0;
      const base = url.searchParams.get('base');
      if (base !== null && Number(base) !== current) return reply({ error: 'save_conflict', updated: current }, 409);
      const updated = Math.max(++this.clock, current + 1);
      this.rows.set(key, { json: method === 'PUT' ? String(init.body) : 'null', updated });
      return reply({ ok: true, updated });
    }
    return reply({ error: 'not_found' }, 404);
  }
}

let api: FakeApi;

/** One page load on the current browser storage: fresh modules, stores hydrate, the account syncs. */
async function boot() {
  vi.resetModules();
  const account = await import('@/net/account');
  const careerStore = await import('@/store/career');
  const settingsStore = await import('@/store/settings');
  const game = await import('@/store/game');
  await account.useAccount.getState().init();
  await settle();
  return { useAccount: account.useAccount, useCareer: careerStore.useCareer, useSettings: settingsStore.useSettings, game };
}

const settle = () => vi.advanceTimersByTimeAsync(2500);

beforeEach(() => {
  api = new FakeApi();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: RequestInit) => api.fetch(input, init)),
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
});

/** The page closes: its sync stops without uploading anything more (like a killed tab). */
function closePage() {
  window.dispatchEvent(new StorageEvent('storage', { key: 'epd:sync', newValue: null }));
}

afterEach(() => {
  closePage();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
