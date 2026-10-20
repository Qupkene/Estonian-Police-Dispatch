/**
 * Mitmikmäng (src/sim/room.ts, src/net/rooms.ts): a started room's shift follows from its seed, day and options
 * alone, the client reads the server's room answers defensively, polls with ?v= and backs off, and a room run's
 * result goes to the room once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROOM_OPTIONS,
  displayRoomCode,
  markRoom,
  normalizeRoomCode,
  roomCodeOf,
  roomShiftOptions,
  roomStart,
  type RoomShift,
} from '@/sim/room';
import { SLOT_HOURS } from '@/sim/daily';
import { createShift, step } from '@/sim/engine';
import { HOUR, MIN, wall } from '@/sim/time';
import {
  isHost,
  joinRoom,
  myResult,
  parseRoom,
  pollDelay,
  pollRoom,
  RoomPoller,
  roomErrorKey,
  roomResultBody,
  roomShiftOf,
  startBlock,
  stillPlaying,
  submitRoomResultOnce,
  type Room,
} from '@/net/rooms';
import { ApiError } from '@/net/api';
import type { ShiftReport } from '@/sim/types';

const SHIFT: RoomShift = {
  code: 'K7M2QX',
  seed: 123456789,
  day: '2026-10-20',
  options: { regionId: 'louna', sector: 'louna-tartu', difficulty: 'veteran', hours: 2, slot: 'night' },
};

/** A room as the server sends it (server/lib/rooms.php epd_room_public). */
function serverRoom(over: Record<string, unknown> = {}) {
  return {
    code: 'K7M2QX',
    mode: 'race',
    state: 'lobby',
    v: '3.3',
    host: 1,
    me: 1,
    max: 4,
    options: { regionId: 'louna', sector: 'louna-tartu', difficulty: 'normal', hours: 3, slot: 'evening' },
    seed: null,
    day: null,
    created: 1_792_400_000_000,
    started: null,
    players: [
      { id: 2, name: 'Ivo', seat: 1, host: false, ready: false, online: true, left: false, done: false },
      { id: 1, name: 'Hanna', seat: 0, host: true, ready: true, online: true, left: false, done: false },
    ],
    results: [],
    ...over,
  };
}

describe('room codes', () => {
  it('reads a code as typed and rejects anything else', () => {
    expect(normalizeRoomCode('k7m 2qx')).toBe('K7M2QX');
    expect(normalizeRoomCode(' K7M-2QX ')).toBe('K7M2QX');
    for (const bad of ['K7M2Q', 'K7M2QXX', 'IOIOIO', '0123AB', '', null, 42])
      expect(normalizeRoomCode(bad)).toBeNull();
    expect(displayRoomCode('K7M2QX')).toBe('K7M 2QX');
  });

  it('marks a room run and finds the mark again, also after a save', () => {
    const sim = { flags: {} as Record<string, string | number | boolean> };
    expect(roomCodeOf(sim)).toBeNull();
    markRoom(sim, 'K7M2QX');
    expect(roomCodeOf(JSON.parse(JSON.stringify(sim)))).toBe('K7M2QX');
    expect(roomCodeOf(null)).toBeNull();
  });
});

describe("a room's shift", () => {
  it('is the same free shift for every player, at an hour of the chosen part of the day', () => {
    const a = roomShiftOptions(SHIFT, 'Hanna');
    const b = roomShiftOptions(SHIFT, 'Ivo');
    expect({ ...a, playerName: '' }).toEqual({ ...b, playerName: '' });
    expect(a).toMatchObject({
      seed: SHIFT.seed,
      regionId: 'louna',
      mode: 'free',
      difficulty: 'veteran',
      hours: 2,
      sectors: ['louna-tartu'],
      fixedSchedule: true,
    });
    const w = wall(a.start);
    expect([w.year, w.month, w.day]).toEqual([2026, 10, 20]);
    expect(SLOT_HOURS.night).toContain(w.hour);
    expect(w.minute).toBe(0);
    // The whole prefecture without a sector.
    expect(
      roomShiftOptions({ ...SHIFT, options: { ...SHIFT.options, sector: '' } }, 'x').sectors,
    ).toBeUndefined();
  });

  it('picks its start hour from the seed', () => {
    const hours = new Set<number>();
    for (let seed = 1; seed < 40; seed++) hours.add(wall(roomStart({ ...SHIFT, seed })).hour);
    expect([...hours].sort()).toEqual([...SLOT_HOURS.night].sort());
    expect(() => roomStart({ ...SHIFT, day: '2026-02-30' })).toThrow();
  });

  it('builds the same world and the same calls for two players', { timeout: 60_000 }, () => {
    const one = createShift(roomShiftOptions(SHIFT, 'Hanna'));
    const two = createShift(roomShiftOptions(SHIFT, 'Ivo'));
    expect(one.startTime).toBe(roomStart(SHIFT));
    expect(one.endTime - one.startTime).toBe(2 * HOUR);
    expect(Object.keys(two.units)).toEqual(Object.keys(one.units));
    expect(two.weather).toEqual(one.weather);
    for (let m = 0; m < 60; m++) {
      step(one, MIN);
      step(two, MIN);
    }
    const calls = (s: typeof one) =>
      s.incidentOrder.map((id) => [s.incidents[id].templateId, s.incidents[id].createdAt]);
    expect(calls(one).length).toBeGreaterThan(0);
    expect(calls(two)).toEqual(calls(one));
  });

  it('defaults to a shift that can be built', () => {
    const s = createShift(
      roomShiftOptions({ code: 'AAAAAA', seed: 7, day: '2026-10-20', options: DEFAULT_ROOM_OPTIONS }, 'x'),
    );
    expect(s.sectors).toEqual([DEFAULT_ROOM_OPTIONS.sector]);
  });
});

describe('room answers', () => {
  it('parses a room, sorting the seats and filling gaps', () => {
    const room = parseRoom(serverRoom())!;
    expect(room.players.map((p) => p.name)).toEqual(['Hanna', 'Ivo']);
    expect(isHost(room)).toBe(true);
    expect(roomShiftOf(room)).toBeNull();
    const odd = parseRoom(
      serverRoom({
        state: 'weird',
        options: { regionId: 'mars', hours: 5 },
        players: [null, { id: 'x' }],
        max: 0,
      }),
    )!;
    expect(odd.state).toBe('closed');
    expect(odd.options).toEqual({
      regionId: 'pohja',
      sector: '',
      difficulty: 'normal',
      hours: 3,
      slot: 'evening',
    });
    expect(odd.players).toEqual([]);
    expect(odd.max).toBe(4);
    expect(parseRoom({ code: 'nope' })).toBeNull();
    expect(parseRoom('x')).toBeNull();
  });

  it('knows when the host may start, with the same rules as the server', () => {
    const room = parseRoom(serverRoom())!;
    expect(startBlock(room)).toBe('not_ready');
    room.players[1].ready = true;
    expect(startBlock(room)).toBeNull();
    expect(startBlock({ ...room, me: 2 })).toBe('not_host');
    expect(startBlock({ ...room, players: [room.players[0]] })).toBe('too_few');
    expect(startBlock({ ...room, players: [room.players[0], { ...room.players[1], left: true }] })).toBe(
      'too_few',
    );
    expect(startBlock({ ...room, state: 'running' })).toBe('state');
  });

  it('gives the shift once started, and tells who is still playing', () => {
    const room = parseRoom(
      serverRoom({
        state: 'running',
        seed: 99,
        day: '2026-10-20',
        started: 1,
        results: [{ id: 2, name: 'Ivo', score: 81, grade: 'A', incidents: 9, arrests: 1, at: 5, rank: 0 }],
      }),
    )!;
    expect(roomShiftOf(room)).toEqual({
      code: 'K7M2QX',
      mode: 'race',
      seed: 99,
      day: '2026-10-20',
      options: room.options,
    });
    expect(room.results[0].rank).toBe(1);
    expect(myResult(room)).toBeUndefined();
    expect(stillPlaying(room).map((p) => p.name)).toEqual(['Hanna']);
  });

  it('maps errors to messages', () => {
    expect(roomErrorKey(new ApiError(409, 'room_full', 'x'))).toBe('rooms.err.room_full');
    expect(roomErrorKey(new ApiError(500, 'server_error', 'x'))).toBe('rooms.err.other');
    expect(roomErrorKey(new Error('offline'))).toBe('rooms.err.network');
  });

  it('polls about once a second, slower in the background and after failures', () => {
    expect(pollDelay(true, 0)).toBe(1000);
    expect(pollDelay(false, 0)).toBe(5000);
    expect(pollDelay(true, 1)).toBe(2000);
    expect(pollDelay(true, 3)).toBe(8000);
    expect(pollDelay(true, 10)).toBe(15_000);
    expect(pollDelay(true, 0, 2000)).toBe(2000);
  });
});

// ── Requests with a mocked fetch ─────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('room requests', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('joins with a cleaned code and refuses a malformed one without asking', async () => {
    fetchMock.mockResolvedValueOnce(json({ room: serverRoom() }));
    const room = await joinRoom('k7m 2qx');
    expect(room.code).toBe('K7M2QX');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/rooms/join');
    expect(JSON.parse(String(init?.body))).toEqual({ code: 'K7M2QX' });
    expect((init?.headers as Record<string, string>)['X-EPD']).toBe('1');
    await expect(joinRoom('abc')).rejects.toMatchObject({ code: 'bad_code' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('polls with the last tag and reads an unchanged answer as no news', async () => {
    fetchMock.mockResolvedValueOnce(json({ v: '3.3', unchanged: true }));
    expect(await pollRoom('K7M2QX', '3.3')).toEqual({ v: '3.3', room: null });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/rooms/K7M2QX?v=3.3');
    fetchMock.mockResolvedValueOnce(json({ v: '4.3', room: serverRoom({ v: '4.3' }) }));
    const next = await pollRoom('K7M2QX', '3.3');
    expect(next.v).toBe('4.3');
    expect(next.room?.code).toBe('K7M2QX');
  });

  it('keeps polling until the room is gone, sending only changes on', async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    let gone = false;
    fetchMock
      .mockResolvedValueOnce(json({ v: '1.1', room: serverRoom({ v: '1.1' }) }))
      .mockResolvedValueOnce(json({ v: '1.1', unchanged: true }))
      .mockResolvedValueOnce(json({ v: '2.3', room: serverRoom({ v: '2.3', state: 'running' }) }))
      .mockResolvedValueOnce(json({ error: 'room_not_found', message: 'x' }, 404));
    const p = new RoomPoller({
      code: 'K7M2QX',
      isVisible: () => true,
      onRoom: (r: Room) => seen.push(`${r.v}:${r.state}`),
      onError: (_e, isGone) => (gone = isGone),
    });
    p.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(seen).toEqual(['1.1:lobby', '2.3:running']);
    expect(gone).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/rooms/K7M2QX?v=1.1');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    p.stop();
  });

  it('sends a room result once per report, and again after a failure', async () => {
    const report = {
      score: 81.6,
      grade: 'A',
      stats: { incidents: 9, arrests: 2 },
    } as unknown as ShiftReport;
    expect(roomResultBody(report)).toEqual({ score: 82, grade: 'A', incidents: 9, arrests: 2 });
    fetchMock.mockResolvedValueOnce(json({ error: 'server_error', message: 'x' }, 500));
    await expect(submitRoomResultOnce(report, 'K7M2QX')).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockResolvedValueOnce(
      json({ ok: true, counted: true, rank: 1, room: serverRoom({ state: 'running' }) }),
    );
    const a = submitRoomResultOnce(report, 'K7M2QX');
    const b = submitRoomResultOnce(report, 'K7M2QX');
    expect(await a).toMatchObject({ counted: true, rank: 1 });
    expect(await b).toBe(await a);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/rooms/K7M2QX/result');
  });
});
