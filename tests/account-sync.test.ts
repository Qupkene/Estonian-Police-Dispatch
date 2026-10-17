// @vitest-environment jsdom
// The cloud sync engine (src/net/account.ts) against an in-memory copy of the PHP API (docs/SERVER.md 4.1):
// slot versions, `?base=` preconditions with 409, deletion markers, `?versions=1` and `X-EPD-User`.
// Every test boots a fresh copy of the modules on the same browser storage, like a page load.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimState } from '@/sim/types';

type Json = Record<string, unknown>;
type Slot = 'career' | 'settings' | 'autosave';

interface Call {
  method: string;
  path: string;
  base: string | null;
  user: string | null;
}

/** The PHP API's save and account rules, in memory. One cookie jar: shared by every "tab". */
class FakeApi {
  users = new Map<number, { id: number; name: string; created: number }>();
  /** Account the browser's session cookie belongs to. */
  cookie: number | null = null;
  rows = new Map<string, { json: string; updated: number }>();
  /** The server clock, far ahead of the browser's (vi.setSystemTime): no client clock may be compared with it. */
  clock = 1_900_000_000_000;
  calls: Call[] = [];
  /** Lets a test hold GET /api/me (a slow connection). */
  meGate: Promise<void> | null = null;
  /** The next request matching this dies on the way (the page closed, the network dropped). */
  drop: ((c: Call) => boolean) | null = null;

  addUser(id: number, name: string) {
    this.users.set(id, { id, name, created: 1 });
  }
  /** Another device writes a slot. */
  write(uid: number, slot: Slot, data: unknown): number {
    const key = `${uid}:${slot}`;
    const updated = Math.max(++this.clock, (this.rows.get(key)?.updated ?? 0) + 1);
    this.rows.set(key, { json: JSON.stringify(data), updated });
    return updated;
  }
  data(uid: number, slot: Slot): unknown {
    const row = this.rows.get(`${uid}:${slot}`);
    return row ? JSON.parse(row.json) : undefined;
  }
  version(uid: number, slot: Slot): number {
    return this.rows.get(`${uid}:${slot}`)?.updated ?? 0;
  }
  writes(slot?: Slot): Call[] {
    return this.calls.filter((c) => (c.method === 'PUT' || c.method === 'DELETE') && c.path.startsWith('/api/save/') && (!slot || c.path.endsWith(slot)));
  }

  async fetch(input: unknown, init: RequestInit = {}): Promise<Response> {
    const url = new URL(String(input), 'http://epd.test');
    const headers = (init.headers ?? {}) as Record<string, string>;
    const method = init.method ?? 'GET';
    const call: Call = { method, path: url.pathname, base: url.searchParams.get('base'), user: headers['X-EPD-User'] ?? null };
    this.calls.push(call);
    if (this.drop?.(call)) {
      this.drop = null;
      throw new TypeError('Failed to fetch');
    }
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const fail = (status: number, error: string, extra: Json = {}) => reply({ error, message: error, ...extra }, status);
    const body = typeof init.body === 'string' && init.body ? (JSON.parse(init.body) as Json) : {};
    const path = url.pathname;

    if (path === '/api/health') return reply({ ok: true, version: 'test', accounts: true });
    if (path === '/api/me' && method === 'GET') {
      if (this.meGate) await this.meGate;
      return reply({ user: this.cookie === null ? null : this.users.get(this.cookie) });
    }
    if (path === '/api/login') {
      const u = [...this.users.values()].find((x) => x.name === body.name);
      if (!u) return fail(401, 'bad_login');
      this.cookie = u.id;
      return reply({ user: u });
    }
    if (path === '/api/logout') {
      this.cookie = null;
      return reply({ ok: true });
    }
    // Routes that need a login (epd_require_user).
    if (this.cookie === null) return fail(401, 'auth_required');
    if (call.user !== null && call.user !== String(this.cookie)) return fail(409, 'user_mismatch');
    const uid = this.cookie;
    if (path === '/api/save' && method === 'GET') {
      const out: Json = {};
      const updated: Json = {};
      for (const slot of ['career', 'settings', 'autosave'] as const) {
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
      if (call.base !== null && Number(call.base) !== current) return fail(409, 'save_conflict', { updated: current });
      const updated = Math.max(++this.clock, current + 1);
      this.rows.set(key, { json: method === 'PUT' ? String(init.body) : 'null', updated });
      return reply({ ok: true, updated });
    }
    return fail(404, 'not_found');
  }
}

/** A resumable shift (passes isValidSave and the server-side validAutosave). */
function shift(seed: number, now: number): SimState {
  return {
    version: 2,
    seed,
    regionId: 'pohja',
    mode: 'free',
    now,
    startTime: 1000,
    endTime: 999_999,
    ended: false,
    units: {},
    incidents: {},
    persons: {},
    vehicles: {},
    stats: {},
    weather: {},
    flags: {},
    seq: {},
    unitOrder: [],
    incidentOrder: [],
    radio: [],
    calls: [],
    bulletins: [],
    queries: [],
    events: [],
  } as unknown as SimState;
}

const career = (name: string, day: number) => ({ profile: { name, day }, inbox: [] });

let api: FakeApi;

/** One page load: fresh modules on the current browser storage and cookie. */
async function boot() {
  vi.resetModules();
  const account = await import('@/net/account');
  const careerStore = await import('@/store/career');
  const game = await import('@/store/game');
  await account.useAccount.getState().init();
  await settle();
  return { account, useAccount: account.useAccount, useCareer: careerStore.useCareer, game };
}

/** Let debounced uploads and their replies run. */
const settle = () => vi.advanceTimersByTimeAsync(2500);

/** The page closes: its sync stops without uploading anything more (like a killed tab). */
function closePage() {
  window.dispatchEvent(new StorageEvent('storage', { key: 'epd:sync', newValue: null }));
}

const setVisible = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  // The browser clock is 200 days behind the server's.
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  localStorage.clear();
  api = new FakeApi();
  api.addUser(7, 'Mari');
  api.addUser(8, 'Jaan');
  vi.stubGlobal('fetch', vi.fn((input: unknown, init?: RequestInit) => api.fetch(input, init)));
});

afterEach(() => {
  closePage();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('guest data never overwrites the account', () => {
  it('a guest career and a finished guest shift on a new phone leave the cloud career and shift alone', async () => {
    api.write(7, 'career', { profile: { name: 'Desktop', day: 50, budget: 999_999 }, inbox: [] });
    api.write(7, 'autosave', shift(1, 500));
    const { useAccount, useCareer, game } = await boot();
    // The guest plays: a new career and a free shift played to the end (its save is removed).
    useCareer.setState(career('Phone Guest', 1) as never);
    game.autosave(shift(2, 10));
    game.clearAutosave();
    expect(await useAccount.getState().login('Mari', 'x')).toBe(true);
    await settle();

    expect(api.writes('career')).toEqual([]);
    expect(api.writes('autosave')).toEqual([]);
    expect(api.data(7, 'career')).toMatchObject({ profile: { name: 'Desktop', day: 50 } });
    expect(api.data(7, 'autosave')).toMatchObject({ seed: 1 });
    // The account's progress is on the phone now, the guest career is kept in the backup key.
    expect(useCareer.getState().profile).toMatchObject({ name: 'Desktop', day: 50 });
    expect(game.loadAutosave()?.seed).toBe(1);
    const backup = JSON.parse(localStorage.getItem('epd:backup.career') ?? 'null');
    expect(backup.data.profile.name).toBe('Phone Guest');
  });

  it('guest progress fills an empty account', async () => {
    const { useAccount, useCareer, game } = await boot();
    useCareer.setState(career('Uus', 1) as never);
    game.autosave(shift(3, 10));
    await useAccount.getState().login('Mari', 'x');
    await settle();
    expect(api.data(7, 'career')).toMatchObject({ profile: { name: 'Uus' } });
    expect(api.data(7, 'autosave')).toMatchObject({ seed: 3 });
    expect(api.writes('career')[0].base).toBe('0');
  });
});

describe('deletions reach other devices', () => {
  it('a shift finished on another device disappears here instead of being uploaded again', async () => {
    api.cookie = 7;
    let page = await boot();
    page.game.autosave(shift(1, 100));
    await settle();
    const v1 = api.version(7, 'autosave');
    expect(api.writes('autosave')).toMatchObject([{ method: 'PUT', base: '0' }]);
    closePage();

    // Device B pulls the shift, finishes it: a deletion marker on top of v1.
    const del = await api.fetch(`/api/save/autosave?base=${v1}`, { method: 'DELETE', headers: { 'X-EPD': '1' } });
    expect(del.status).toBe(200);
    api.calls = [];

    // A opens the game again: the deletion is pulled, nothing is re-uploaded, no "Continue" for a paid shift.
    page = await boot();
    expect(api.writes()).toEqual([]);
    expect(page.game.loadAutosave()).toBeNull();
  });

  it('a finished shift deletes the cloud copy it built on, and a stale delete cannot wipe a newer save', async () => {
    api.cookie = 7;
    const { game } = await boot();
    game.autosave(shift(1, 100));
    await settle();
    const v1 = api.version(7, 'autosave');
    game.clearAutosave();
    await settle();
    expect(api.writes('autosave').at(-1)).toMatchObject({ method: 'DELETE', base: String(v1) });
    expect(api.data(7, 'autosave')).toBeNull();
    expect(api.version(7, 'autosave')).toBeGreaterThan(v1);

    // Another device continues a shift; this one ends an older copy of it.
    game.autosave(shift(5, 100));
    await settle();
    api.write(7, 'autosave', shift(5, 900));
    game.clearAutosave();
    await settle();
    // Refused (409) and read again: the newer save survives, here too.
    expect(api.data(7, 'autosave')).toMatchObject({ seed: 5, now: 900 });
    expect(game.loadAutosave()).toMatchObject({ seed: 5, now: 900 });
  });
});

describe('a stale tab reads the cloud before it writes', () => {
  it('coming back to an old tab pulls the newer career before the player can change it', async () => {
    api.cookie = 7;
    api.write(7, 'career', career('Kadri', 1));
    const { useCareer } = await boot();
    expect(useCareer.getState().profile).toMatchObject({ day: 1 });
    // Meanwhile on the desktop: day 51.
    api.write(7, 'career', career('Kadri', 51));
    api.calls = [];
    setVisible('hidden');
    setVisible('visible');
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(api.calls.some((c) => c.method === 'GET' && c.path === '/api/save')).toBe(true);
    expect(useCareer.getState().profile).toMatchObject({ day: 51 });
    // A change now builds on day 51.
    useCareer.getState().clearInbox();
    useCareer.setState({ inbox: [{ et: 'x', en: 'x' }] as never });
    await settle();
    expect(api.data(7, 'career')).toMatchObject({ profile: { day: 51 } });
  });

  it('an upload on top of an old version is refused (409), the cloud is read again and the local change kept in the backup', async () => {
    api.cookie = 7;
    api.write(7, 'career', career('Kadri', 1));
    const { useCareer } = await boot();
    api.write(7, 'career', career('Kadri', 51));
    // No focus event (e.g. two windows side by side): the stale tab changes its day-1 career.
    useCareer.setState(career('Kadri stale', 1) as never);
    await settle();
    await settle();
    expect(api.calls.some((c) => c.method === 'PUT' && c.path === '/api/save/career' && c.base !== null)).toBe(true);
    expect(api.data(7, 'career')).toMatchObject({ profile: { name: 'Kadri', day: 51 } });
    expect(useCareer.getState().profile).toMatchObject({ day: 51 });
    expect(JSON.parse(localStorage.getItem('epd:backup.career') ?? 'null').data.profile.name).toBe('Kadri stale');
  });
});

describe('no client clock is compared with the server clock', () => {
  it('a save whose upload died with the page is uploaded on the next load, not replaced by the older cloud copy', async () => {
    api.cookie = 7;
    let page = await boot();
    page.game.autosave(shift(1, 100));
    await settle();
    // 1.5 s later the tab closes: the newer save is written locally, its upload dies (over the keepalive cap).
    api.drop = (c) => c.method === 'PUT' && c.path === '/api/save/autosave';
    page.game.autosave(shift(1, 160), { unload: true });
    await vi.advanceTimersByTimeAsync(0);
    closePage();
    expect(api.data(7, 'autosave')).toMatchObject({ now: 100 });

    page = await boot();
    expect(api.data(7, 'autosave')).toMatchObject({ now: 160 });
    expect(page.game.loadAutosave()).toMatchObject({ now: 160 });
  });

  it('an offline career change survives the next load whatever the clocks say', async () => {
    api.cookie = 7;
    api.write(7, 'career', career('Kadri', 5));
    let page = await boot();
    api.drop = () => true;
    page.useCareer.setState(career('Kadri', 6) as never);
    await settle();
    closePage();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z')); // and now the clock is ten years slow
    page = await boot();
    expect(api.data(7, 'career')).toMatchObject({ profile: { day: 6 } });
    expect(page.useCareer.getState().profile).toMatchObject({ day: 6 });
  });
});

describe('a tab whose account changed elsewhere stops writing', () => {
  it('names its account on every request; the server refuses a cookie that belongs to someone else now', async () => {
    api.cookie = 7;
    api.write(8, 'career', career('Jaan', 9));
    const { useAccount, useCareer } = await boot();
    expect(api.calls.filter((c) => c.path.startsWith('/api/save')).every((c) => c.user === '7')).toBe(true);
    // Another tab logs in as Jaan (same cookie jar), but has not written anything yet.
    api.cookie = 8;
    useCareer.setState(career('Mari', 31337) as never);
    await settle();
    expect(api.data(8, 'career')).toMatchObject({ profile: { name: 'Jaan', day: 9 } });
    expect(useAccount.getState().user).toBeNull();
    expect(useAccount.getState().sessionLost).toBe(true);
    expect(useAccount.getState().cloud).toBe('off');
  });

  it('stops as soon as another tab records a different account', async () => {
    api.cookie = 7;
    const { useAccount, useCareer } = await boot();
    window.dispatchEvent(new StorageEvent('storage', { key: 'epd:sync', newValue: JSON.stringify({ v: 2, account: 8, slots: {} }) }));
    expect(useAccount.getState().user).toBeNull();
    api.calls = [];
    useCareer.setState(career('Mari', 2) as never);
    await settle();
    expect(api.writes()).toEqual([]);
  });

  it("writes only its own slots into the shared metadata, never another tab's entries", async () => {
    api.cookie = 7;
    const { useCareer } = await boot();
    // Another tab of this browser changed the settings and recorded that in epd:sync.
    const stored = JSON.parse(localStorage.getItem('epd:sync') ?? '{}');
    stored.slots.settings = { owner: 7, base: 123, dirty: true };
    localStorage.setItem('epd:sync', JSON.stringify(stored));
    useCareer.setState(career('Mari', 2) as never);
    const after = JSON.parse(localStorage.getItem('epd:sync') ?? '{}');
    expect(after.slots.settings).toEqual({ owner: 7, base: 123, dirty: true });
    expect(after.slots.career.dirty).toBe(true);
    expect(after.account).toBe(7);
  });

  it('keeps syncing when another tab of the same account writes', async () => {
    api.cookie = 7;
    const { useAccount } = await boot();
    window.dispatchEvent(new StorageEvent('storage', { key: 'epd:sync', newValue: JSON.stringify({ v: 2, account: 7, slots: {} }) }));
    expect(useAccount.getState().user?.id).toBe(7);
  });
});

describe('declining the account wins over a late /api/me', () => {
  it('a guest login while /me is on its way never starts the session and ends it on the server', async () => {
    api.cookie = 7;
    api.write(7, 'career', career('Mari Pilv', 20));
    let open: () => void = () => {};
    api.meGate = new Promise<void>((r) => (open = r));
    vi.resetModules();
    const account = await import('@/net/account');
    const game = await import('@/store/game');
    const careerStore = await import('@/store/career');
    await vi.advanceTimersByTimeAsync(10);
    // The login screen: the player picks "Jätka külalisena".
    account.useAccount.getState().decline();
    game.useGame.getState().login({ name: 'Külaline', method: 'guest' });
    open();
    await account.useAccount.getState().init();
    await settle();
    expect(account.useAccount.getState().user).toBeNull();
    expect(api.calls.some((c) => c.path === '/api/save')).toBe(false);
    expect(api.calls.some((c) => c.path === '/api/logout')).toBe(true);
    expect(api.cookie).toBeNull();
    expect(careerStore.useCareer.getState().profile).toBeNull();
  });

  it('a guest game started before /me answered (no decline) is not attached to the account either', async () => {
    api.cookie = 7;
    let open: () => void = () => {};
    api.meGate = new Promise<void>((r) => (open = r));
    vi.resetModules();
    const account = await import('@/net/account');
    const game = await import('@/store/game');
    await vi.advanceTimersByTimeAsync(10);
    game.useGame.getState().login({ name: 'Ema', method: 'idcard' });
    open();
    await account.useAccount.getState().init();
    await settle();
    expect(account.useAccount.getState().user).toBeNull();
    expect(api.cookie).toBeNull();
  });

  it('an explicit account login afterwards still works', async () => {
    const { useAccount } = await boot();
    useAccount.getState().decline();
    expect(await useAccount.getState().login('Mari', 'x')).toBe(true);
    expect(useAccount.getState().user?.id).toBe(7);
  });
});

describe('"Delete all data" signs out', () => {
  it('ends the synced session after the last uploads', async () => {
    api.cookie = 7;
    const { useAccount, useCareer } = await boot();
    useCareer.setState(career('Mari', 3) as never);
    await useAccount.getState().forget();
    expect(api.data(7, 'career')).toMatchObject({ profile: { day: 3 } });
    expect(api.cookie).toBeNull();
    expect(useAccount.getState().user).toBeNull();
  });

  it('also ends a cookie session this tab never synced with', async () => {
    const { useAccount } = await boot();
    api.cookie = 7; // e.g. /me failed at boot
    await useAccount.getState().forget();
    expect(api.cookie).toBeNull();
  });
});
