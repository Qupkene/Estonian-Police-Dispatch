import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, probeBackend, request, resetProbe } from '@/net/api';
import {
  backoffMs,
  decideSlot,
  nameProblem,
  needsBackup,
  parseMeta,
  planSync,
  sameData,
  sanitizeSettings,
  validAutosave,
  validCareer,
  type LocalSide,
  type SaveResponse,
  type Side,
  type Slot,
} from '@/net/sync';
import { isRanked, parseScores, scoreBody, unrankedReason } from '@/net/scores';
import { accountErrorText } from '@/ui/screens/shell/accountText';
import { t as translate } from '@/i18n';
import type { ShiftReport } from '@/sim/types';

const remote = (data: unknown, updated = 0): Side => ({ data, updated });
const local = (data: unknown, base = 0, dirty = false): LocalSide => ({ data, base, dirty });
const empty = remote(null, 0);

describe('decideSlot: server versions only, never a client clock', () => {
  it('does nothing when the server still has the version we synced and nothing changed here', () => {
    expect(decideSlot(local({ a: 1 }, 2000), remote({ a: 2 }, 2000))).toBe('none');
  });
  it('uploads a local change on top of the version the server still has', () => {
    expect(decideSlot(local({ a: 1 }, 2000, true), remote({ a: 2 }, 2000))).toBe('push');
  });
  it('a local delete on top of the current server version is pushed (as a delete)', () => {
    expect(decideSlot(local(null, 4000, true), remote({ a: 1 }, 4000))).toBe('push');
  });
  it('takes a newer server version when nothing changed here', () => {
    expect(decideSlot(local({ a: 1 }, 1000), remote({ a: 2 }, 2000))).toBe('pull');
  });
  it('a conflict (changed on both sides) goes to the cloud copy; the local one needs a backup', () => {
    const l = local({ a: 1 }, 1000, true);
    const r = remote({ a: 2 }, 2000);
    expect(decideSlot(l, r)).toBe('pull');
    expect(needsBackup(l, r)).toBe(true);
  });
  it('a deletion marker newer than our copy is pulled (another device finished the shift)', () => {
    expect(decideSlot(local({ shift: 1 }, 1000), remote(null, 3000))).toBe('pull');
  });
  it('restores the cloud from the browser when the server lost writes we had seen', () => {
    // No row any more, or a database restored from a backup: server versions only ever grow.
    expect(decideSlot(local({ day: 50 }, 5000), empty)).toBe('push');
    expect(decideSlot(local({ day: 50 }, 5000), remote({ day: 40 }, 4000))).toBe('push');
  });
  it('a slow or fast client clock changes nothing: an unsent local save is uploaded after a reload', () => {
    // The tab closed before its last autosave reached the server (keepalive cap). Whatever the clock
    // said, the server still holds the version the browser built on, so the browser copy wins.
    expect(decideSlot(local({ now: 2 }, 7_000, true), remote({ now: 1 }, 7_000))).toBe('push');
  });
  it('identical data needs nothing, whatever the versions', () => {
    expect(decideSlot(local({ a: 1 }, 1, true), remote({ a: 1 }, 9))).toBe('none');
  });
});

describe('decideSlot: guest or foreign data never overwrites a cloud slot', () => {
  it('fills a slot the server never had', () => {
    expect(decideSlot(local({ a: 1 }, 0, true), empty, true)).toBe('push');
  });
  it('fills a slot whose cloud copy was deleted', () => {
    expect(decideSlot(local({ a: 1 }, 0, true), remote(null, 500), true)).toBe('push');
  });
  it('takes the cloud copy when there is one, however new the browser data looks', () => {
    expect(decideSlot(local({ a: 1 }, 9_999_999, true), remote({ a: 2 }, 1), true)).toBe('pull');
  });
  it('a guest without anything never deletes a cloud copy', () => {
    expect(decideSlot(local(null, 0, true), remote({ a: 2 }, 5), true)).toBe('pull');
    expect(decideSlot(local(null, 0, true), empty, true)).toBe('none');
  });
});

describe('needsBackup', () => {
  it('only for local data that exists nowhere else and differs from the cloud copy', () => {
    expect(needsBackup(local({ a: 1 }, 0, true), remote({ a: 2 }, 5))).toBe(true);
    expect(needsBackup(local({ a: 1 }, 0, false), remote({ a: 2 }, 5))).toBe(false);
    expect(needsBackup(local({ a: 1 }, 0, true), remote({ a: 1 }, 5))).toBe(false);
    expect(needsBackup(local(null, 0, true), remote({ a: 1 }, 5))).toBe(false);
  });
});

describe('planSync', () => {
  const sides = (over: Partial<Record<Slot, LocalSide>> = {}): Record<Slot, LocalSide> => ({
    career: local(null, 0, true),
    settings: local({ lang: 'et' }, 0, true),
    autosave: local(null, 0, true),
    ...over,
  });
  const owners = (o: number | null) => ({ career: o, settings: o, autosave: o });
  const save = { version: 2, ended: false, now: 1 };

  it('migrates everything on the first login to an empty account', () => {
    const res: SaveResponse = { career: null, settings: null, autosave: null, updated: {} };
    const plan = planSync(res, sides({ career: local({ profile: { day: 3 }, inbox: [] }, 0, true), autosave: local(save, 0, true) }), {
      owner: owners(null),
      userId: 7,
    });
    expect(plan).toEqual({ career: 'push', settings: 'push', autosave: 'push' });
  });

  it('loads the server copy on a fresh browser', () => {
    const res: SaveResponse = {
      career: { profile: { day: 9 }, inbox: [] },
      settings: { lang: 'en' },
      autosave: save,
      updated: { career: 500, settings: 500, autosave: 500 },
    };
    expect(planSync(res, sides(), { owner: owners(null), userId: 7 })).toEqual({ career: 'pull', settings: 'pull', autosave: 'pull' });
  });

  it("guest progress on a new browser never replaces the account's career or deletes its shift", () => {
    // The account has a day-50 career and a saved shift. A guest on a phone made a career and finished
    // a free shift (autosave deleted locally), with fresh change times. Then they log in.
    const res: SaveResponse = {
      career: { profile: { day: 50, budget: 999_999 }, inbox: [] },
      settings: null,
      autosave: save,
      updated: { career: 1000, autosave: 1000 },
    };
    const plan = planSync(res, sides({ career: local({ profile: { day: 1 }, inbox: [] }, 0, true) }), {
      owner: owners(null),
      userId: 7,
    });
    expect(plan).toEqual({ career: 'pull', settings: 'push', autosave: 'pull' });
  });

  it('follows the server version per slot', () => {
    const res: SaveResponse = {
      career: { profile: { day: 9 }, inbox: [] },
      settings: { lang: 'en' },
      autosave: null,
      updated: { career: 500, settings: 100 },
    };
    const plan = planSync(
      res,
      sides({ career: local({ profile: { day: 2 } }, 400), settings: local({ lang: 'et' }, 100, true), autosave: local(null, 0) }),
      { owner: owners(7), userId: 7 },
    );
    expect(plan.career).toBe('pull');
    expect(plan.settings).toBe('push');
    expect(plan.autosave).toBe('none');
  });

  it("never overwrites another account's cloud save with this browser's data", () => {
    const res: SaveResponse = {
      career: { profile: { day: 9 }, inbox: [] },
      settings: null,
      autosave: null,
      updated: { career: 100 },
    };
    // The local career was synced with account 3 and changed since, but this is account 7.
    const plan = planSync(res, sides({ career: local({ profile: { day: 50 } }, 9_999, true) }), { owner: owners(3), userId: 7 });
    expect(plan.career).toBe('pull');
    expect(plan.settings).toBe('push');
  });

  it('a finished shift on the server: the stale browser copy goes, guest shifts fill the slot', () => {
    const res: SaveResponse = { career: null, settings: null, autosave: { version: 2, ended: true }, updated: { autosave: 50 } };
    // Synced with this account before: the newest state on the server is a finished shift, nothing to resume.
    expect(planSync(res, sides({ autosave: local(save, 10) }), { owner: owners(1), userId: 1 }).autosave).toBe('pull');
    // A guest's own shift may take the empty slot.
    expect(planSync(res, sides({ autosave: local(save, 0, true) }), { owner: owners(null), userId: 1 }).autosave).toBe('push');
  });
});

describe('sync metadata', () => {
  it('reads format 2', () => {
    const m = parseMeta(
      JSON.stringify({ v: 2, account: 7, slots: { career: { owner: 7, base: 123, dirty: false }, settings: { owner: null, base: 0, dirty: true } } }),
    );
    expect(m.account).toBe(7);
    expect(m.slots.career).toEqual({ owner: 7, base: 123, dirty: false });
    expect(m.slots.settings).toEqual({ owner: null, base: 0, dirty: true });
    // Missing: unknown history, counts as changed.
    expect(m.slots.autosave).toEqual({ owner: null, base: 0, dirty: true });
  });
  it('migrates format 1 (mixed clocks) to "changed on top of that version"', () => {
    const m = parseMeta(JSON.stringify({ owner: 3, updated: { career: 50, settings: 0, autosave: 70 } }));
    expect(m.account).toBe(3);
    expect(m.slots.career).toEqual({ owner: 3, base: 50, dirty: true });
    expect(m.slots.autosave).toEqual({ owner: 3, base: 70, dirty: true });
  });
  it('treats missing or broken metadata as guest data with an unknown history', () => {
    for (const raw of [null, '', 'nope', '[1]']) {
      const m = parseMeta(raw);
      expect(m.account).toBeNull();
      expect(m.slots.career).toEqual({ owner: null, base: 0, dirty: true });
    }
  });
});

describe('payload validation', () => {
  it('accepts only resumable autosaves', () => {
    expect(validAutosave({ version: 2, ended: false })).not.toBeNull();
    expect(validAutosave({ version: 1 })).toBeNull();
    expect(validAutosave({ version: 2, ended: true })).toBeNull();
    expect(validAutosave('x')).toBeNull();
  });
  it('reads the career slot', () => {
    expect(validCareer({ profile: { day: 1 }, inbox: ['x'] })).toEqual({ profile: { day: 1 }, inbox: ['x'] });
    expect(validCareer({ profile: null })).toEqual({ profile: null, inbox: [] });
    expect(validCareer({ nope: 1 })).toBeNull();
  });
  it('keeps only known settings with the right type', () => {
    const current = { lang: 'et', volume: 0.7, sfx: true, set: () => {} };
    expect(sanitizeSettings({ lang: 'en', volume: 'loud', sfx: false, extra: 1, set: 'x' }, current)).toEqual({
      lang: 'en',
      sfx: false,
    });
    expect(sanitizeSettings(null, current)).toEqual({});
  });
  it('compares store data without actions', () => {
    expect(sameData({ a: 1, f: () => 1 }, { a: 1, f: () => 2 })).toBe(true);
    expect(sameData({ a: 1 }, { a: 2 })).toBe(false);
  });
  it('backs off up to a minute', () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(20)).toBe(60_000);
  });
  it('checks names like the server', () => {
    expect(nameProblem('ab')).toBe('short');
    expect(nameProblem('Mari_Tamm.2')).toBeNull();
    expect(nameProblem('Tõnu-Põder')).toBeNull();
    expect(nameProblem('a b c')).toBe('chars');
    expect(nameProblem('Renée')).toBe('chars');
    expect(nameProblem('Андрей')).toBe('chars');
    expect(nameProblem('José')).toBe('chars');
    expect(nameProblem('To\u0303nu')).toBeNull(); // o + combining tilde, NFC makes it õ
    expect(nameProblem('x'.repeat(25))).toBe('long');
  });
});

// ── API client with a mocked fetch ──────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    resetProbe();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sends JSON with credentials and the CSRF header on state changes only', async () => {
    fetchMock.mockResolvedValueOnce(json({ user: { id: 1, name: 'mari', created: 1 } }));
    await request('POST', '/login', { name: 'mari', password: 'salasõna1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/login');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    const headers = init?.headers as Record<string, string>;
    expect(headers['X-EPD']).toBe('1');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'mari', password: 'salasõna1' });

    fetchMock.mockResolvedValueOnce(json({ user: null }));
    await request('GET', '/me');
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>)['X-EPD']).toBeUndefined();
  });

  it("maps HTTP errors to ApiError with the server's code and Estonian message", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'name_taken', message: 'See nimi on juba kasutusel.' }, 409));
    const err = await request('POST', '/register', { name: 'x', password: 'y' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const e = err as ApiError;
    expect(e.status).toBe(409);
    expect(e.code).toBe('name_taken');
    expect(e.serverMessage).toBe('See nimi on juba kasutusel.');
    expect(e.retryable).toBe(false);
  });

  it('maps an error without a JSON body to http_<status>', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<h1>Bad gateway</h1>', { status: 502 }));
    const e = (await request('GET', '/save').catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe('http_502');
    expect(e.serverMessage).toBeNull();
    expect(e.retryable).toBe(true);
  });

  it('maps network failures and non-JSON success replies', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const net = (await request('GET', '/me').catch((x: unknown) => x)) as ApiError;
    expect(net.status).toBe(0);
    expect(net.code).toBe('network');
    expect(net.retryable).toBe(true);

    fetchMock.mockResolvedValueOnce(new Response('<!doctype html><title>EPD</title>', { status: 200 }));
    const html = (await request('GET', '/me').catch((x: unknown) => x)) as ApiError;
    expect(html.code).toBe('bad_response');
  });

  it('times out after 8 seconds', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const p = request('GET', '/save').catch((x: unknown) => x);
    await vi.advanceTimersByTimeAsync(8001);
    const e = (await p) as ApiError;
    expect(e.code).toBe('timeout');
    expect(e.status).toBe(0);
  });

  it('probeBackend: online only for a JSON health answer, and cached', async () => {
    fetchMock.mockResolvedValue(json({ ok: true, version: 'dev', accounts: true }));
    expect(await probeBackend()).toBe(true);
    expect(await probeBackend()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a 404', () => new Response('Not found', { status: 404 })],
    ['an HTML page (static host fallback)', () => new Response('<!doctype html>', { status: 200 })],
    ['a proxy error', () => new Response('', { status: 500 })],
    ['health without ok', () => json({ ok: false })],
  ])('probeBackend: %s means no backend', async (_label, make) => {
    fetchMock.mockResolvedValue(make());
    expect(await probeBackend()).toBe(false);
  });

  it('probeBackend: a network error means no backend', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await probeBackend()).toBe(false);
  });
});

describe('name rule texts', () => {
  // Only Latin letters (plus õäöüšž) pass: a message that just says "letters" contradicts itself for 'Андрей'.
  it.each(['account.rule.name', 'account.rule.name.chars', 'account.err.invalid_name'])('%s names the allowed letters', (key) => {
    expect(translate(key, 'et')).toMatch(/ladina täh/);
    expect(translate(key, 'et')).toContain('õ, ä, ö, ü, š, ž');
    expect(translate(key, 'en')).toMatch(/Latin letters \(including õ ä ö ü š ž\)/);
  });
});

describe('error texts', () => {
  const err = (status: number, code: string, message: string | null = null) => ({ status, code, message });
  it("shows the server's Estonian message in the Estonian UI", () => {
    expect(accountErrorText(err(401, 'bad_login', 'Vale nimi või parool.'), 'et')).toBe('Vale nimi või parool.');
  });
  it('translates by status in English', () => {
    expect(accountErrorText(err(409, 'name_taken', 'Nimi on võetud.'), 'en')).toBe('That name is already taken.');
    expect(accountErrorText(err(429, 'rate_limited', 'Liiga palju.'), 'en')).toMatch(/Too many attempts/);
    expect(accountErrorText(err(429, 'slow_down'), 'en')).toMatch(/Too many attempts/);
    expect(accountErrorText(err(0, 'network'), 'en')).toMatch(/Could not reach/);
    expect(accountErrorText(err(503, 'http_503'), 'en')).toMatch(/Server error/);
  });
  it('explains a switched account and a save conflict in English', () => {
    expect(accountErrorText(err(409, 'user_mismatch', 'Teine konto.'), 'en')).toBe('Another account has signed in to this browser meanwhile.');
    expect(accountErrorText(err(409, 'save_conflict'), 'en')).toBe('The save has changed on another device meanwhile.');
  });
  it('uses the wrong-password text for account deletion', () => {
    expect(accountErrorText(err(403, 'forbidden'), 'en', 'password')).toBe('Wrong password.');
  });
});

describe('scores', () => {
  const report = {
    regionId: 'pohja',
    mode: 'free',
    difficulty: 'normal',
    score: 87.6,
    grade: 'A',
    start: 123,
    stats: { incidents: 12, arrests: 3 },
  } as unknown as ShiftReport;

  it('builds the POST /api/score body', () => {
    expect(scoreBody(report)).toEqual({
      regionId: 'pohja',
      mode: 'free',
      difficulty: 'normal',
      score: 88,
      grade: 'A',
      incidents: 12,
      arrests: 3,
      start: 123,
    });
  });
  it('ranks free play and career with at least one incident', () => {
    const st = { incidents: 1 };
    expect(isRanked({ mode: 'free', stats: st })).toBe(true);
    expect(isRanked({ mode: 'career', stats: st })).toBe(true);
    expect(unrankedReason({ mode: 'director', stats: st })).toBe('mode');
    expect(unrankedReason({ mode: 'tutorial', stats: st })).toBe('mode');
    // An empty shift scores a flat 72 in the sim: it must not reach the leaderboard.
    expect(unrankedReason({ mode: 'free', stats: { incidents: 0 } })).toBe('empty');
  });
  it('parses the leaderboard defensively', () => {
    expect(parseScores({ scores: [{ name: 'Mari', score: '91', grade: 'S', regionId: 'ida', difficulty: 'veteran', incidents: 4, at: 5 }, 7] })).toEqual([
      { name: 'Mari', score: 91, grade: 'S', regionId: 'ida', difficulty: 'veteran', incidents: 4, at: 5 },
    ]);
    expect(parseScores(null)).toEqual([]);
  });
});
