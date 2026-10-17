// @vitest-environment jsdom
// Paths found by the end-to-end upgrade test (the deployed 92ed7f5 build and API, then this version on the
// same origin and database, then back):
// - a career shift that 92ed7f5 saved again after its report (its tab closed on the report screen) is never
//   offered or paid a second time, from the browser or from the cloud;
// - a rollback to 92ed7f5 does not pull the cloud over changes made in this browser: epd:sync keeps the
//   format 1 fields that version reads.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { careerShiftPaid, useCareer } from '@/store/career';
import { autosave, loadAutosave, stopLoop, useGame } from '@/store/game';
import { rosterFromCareer } from '@/sim/career';
import { createShift, step } from '@/sim/engine';
import { DAY, MIN, tallinnTime, wall } from '@/sim/time';
import { legacyMeta, parseMeta, SLOTS, type Slot } from '@/net/sync';
import type { CareerProfile, SimState } from '@/sim/types';

vi.stubGlobal('requestAnimationFrame', () => 1);
vi.stubGlobal('cancelAnimationFrame', () => {});

const fixture = (set: string, f: string) => readFileSync(join(__dirname, 'fixtures', 'saves', set, f), 'utf8');
/** 92ed7f5 in Chromium: career paid for day 1, and day 1's shift saved again after its report. */
const PAID_CAREER = fixture('92ed7f5-chromium', 'epd-career-paid.json');
const SAVED_AFTER_REPORT = fixture('92ed7f5-chromium', 'epd-autosave-after-report.json');

type CareerData = { profile: CareerProfile | null; inbox: unknown[] };
const stateOf = (raw: string) => (JSON.parse(raw) as { state: CareerData }).state;

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
    expect(page.useCareer.getState().profile).toEqual(stateOf(PAID_CAREER).profile);
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

  it('in sync: 92ed7f5 moves nothing', async () => {
    api.cookie = 7;
    api.write(7, 'career', career('Mari', 100));
    const page = await boot();
    expect(page.useCareer.getState().profile?.name).toBe('Mari');
    const local = { career: careerOf(page), settings: settingsOf(page), autosave: null };
    expect(v92.plan(localStorage.getItem('epd:sync'), local, 7)).toEqual({ career: 'none', settings: 'none', autosave: 'none' });
  });

  it('changes that never reached the server are uploaded by 92ed7f5, never replaced by the older cloud copy', async () => {
    api.cookie = 7;
    api.write(7, 'career', career('Mari', 100));
    const page = await boot();
    api.down = true; // the API breaks; the player keeps playing, uploads fail
    page.useCareer.getState().update((p) => ({ ...p, money: 777 }));
    page.useSettings.getState().set({ volume: 0.11 });
    await settle();
    expect(api.json(7, 'career')).toEqual(career('Mari', 100));
    const local = { career: careerOf(page), settings: settingsOf(page), autosave: null };
    const plan = v92.plan(localStorage.getItem('epd:sync'), local, 7);
    expect(plan.career).toBe('push');
    expect(plan.settings).toBe('push');
    expect(plan.autosave).toBe('none');
  });

  it('format 1 fields sit next to format 2 and are not read back by this version', () => {
    const meta = parseMeta(
      JSON.stringify({
        v: 2,
        account: 7,
        slots: {
          career: { owner: 7, base: 50, dirty: false },
          settings: { owner: 7, base: 60, dirty: true },
          autosave: { owner: null, base: 0, dirty: true },
        },
      }),
    );
    expect(legacyMeta(meta, 1000)).toEqual({ owner: 7, updated: { career: 50, settings: 1000, autosave: 1000 } });
    expect(legacyMeta(meta, 10)).toEqual({ owner: 7, updated: { career: 50, settings: 61, autosave: 10 } });
    const stored = JSON.stringify({ ...JSON.parse(JSON.stringify({ v: 2, account: 7, slots: meta.slots })), owner: 9, updated: { career: 1, settings: 1, autosave: 1 } });
    expect(parseMeta(stored)).toEqual(meta);
    // A guest browser: no owner, everything newer than nothing.
    expect(legacyMeta(parseMeta(null), 5).owner).toBeNull();
  });
});

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

type Page = Awaited<ReturnType<typeof boot>>;
const careerOf = (page: Page) => {
  const s = page.useCareer.getState();
  return { profile: s.profile, inbox: s.inbox };
};
const settingsOf = (page: Page) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(page.useSettings.getState())) if (typeof v !== 'function') out[k] = v;
  return out;
};

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

afterEach(() => {
  window.dispatchEvent(new StorageEvent('storage', { key: 'epd:sync', newValue: null }));
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
