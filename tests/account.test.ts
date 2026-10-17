import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, probeBackend, request, resetProbe } from '@/net/api';
import {
  backoffMs,
  decideSlot,
  nameProblem,
  planSync,
  sameData,
  sanitizeSettings,
  validAutosave,
  validCareer,
  type SaveResponse,
  type Side,
  type Slot,
} from '@/net/sync';
import { isRanked, parseScores, scoreBody, unrankedReason } from '@/net/scores';
import { accountErrorText } from '@/ui/screens/shell/accountText';
import type { ShiftReport } from '@/sim/types';

const side = (data: unknown, updated = 0): Side => ({ data, updated });
const none = side(null, 0);

describe('decideSlot: newer wins', () => {
  it('pulls when the server copy is newer', () => {
    expect(decideSlot(side({ a: 1 }, 1000), side({ a: 2 }, 2000))).toBe('pull');
  });
  it('pushes when the browser copy is newer', () => {
    expect(decideSlot(side({ a: 1 }, 3000), side({ a: 2 }, 2000))).toBe('push');
  });
  it('does nothing when both have the same age', () => {
    expect(decideSlot(side({ a: 1 }, 2000), side({ a: 1 }, 2000))).toBe('none');
  });
  it('prefers the server when neither age is known', () => {
    expect(decideSlot(side({ a: 1 }, 0), side({ a: 2 }, 0))).toBe('pull');
  });
  it('a local delete that is newer than the server copy is pushed (as a delete)', () => {
    expect(decideSlot(side(null, 5000), side({ a: 1 }, 4000))).toBe('push');
  });
});

describe('decideSlot: first-login migration', () => {
  it('uploads browser data when the server has never had the slot', () => {
    expect(decideSlot(side({ a: 1 }, 0), none)).toBe('push');
    expect(decideSlot(side({ a: 1 }, 1234), none)).toBe('push');
  });
  it('downloads when the browser never had the slot', () => {
    expect(decideSlot(none, side({ a: 2 }, 99))).toBe('pull');
  });
  it('does nothing when neither side has anything', () => {
    expect(decideSlot(none, none)).toBe('none');
  });
});

describe('planSync', () => {
  const local = (over: Partial<Record<Slot, Side>> = {}): Record<Slot, Side> => ({
    career: none,
    settings: side({ lang: 'et' }, 0),
    autosave: none,
    ...over,
  });
  const save = { version: 2, ended: false, now: 1 };

  it('migrates everything on the first login to an empty account', () => {
    const res: SaveResponse = { career: null, settings: null, autosave: null, updated: {} };
    const plan = planSync(res, local({ career: side({ profile: { day: 3 }, inbox: [] }, 10), autosave: side(save, 10) }), {
      owner: null,
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
    expect(planSync(res, local(), { owner: null, userId: 7 })).toEqual({ career: 'pull', settings: 'pull', autosave: 'pull' });
  });

  it('keeps the newer side per slot', () => {
    const res: SaveResponse = {
      career: { profile: { day: 9 }, inbox: [] },
      settings: { lang: 'en' },
      autosave: null,
      updated: { career: 500, settings: 100 },
    };
    const plan = planSync(res, local({ career: side({ profile: { day: 2 } }, 400), settings: side({ lang: 'et' }, 200) }), {
      owner: 7,
      userId: 7,
    });
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
    // The local career is newer by the clock, but it was synced with account 3, not 7.
    const plan = planSync(res, local({ career: side({ profile: { day: 50 } }, 9_999) }), { owner: 3, userId: 7 });
    expect(plan.career).toBe('pull');
    expect(plan.settings).toBe('push');
  });

  it('ignores a finished or foreign-format autosave from the server', () => {
    const res: SaveResponse = { career: null, settings: null, autosave: { version: 2, ended: true }, updated: { autosave: 50 } };
    const plan = planSync(res, local({ autosave: side(save, 10) }), { owner: null, userId: 1 });
    // The newest state on the server is a finished shift: nothing to resume, the stale browser copy goes.
    expect(plan.autosave).toBe('pull');
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
