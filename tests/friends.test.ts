/**
 * Sõbrad (2.40.0, src/net/friends.ts, src/store/friends.ts): the client reads the server's friends, presence and
 * invitation answers defensively, says what the player does (a shift, a room, the menu) at the right pace, and the
 * store keeps the list and what waits current, dropping answers that come after a sign-out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addFriend,
  canJoin,
  friendErrorKey,
  inviteDone,
  parseFriendList,
  parseInvite,
  parsePresence,
  sendInvites,
  sendPresence,
} from '@/net/friends';
import { ApiError } from '@/net/api';
import { markRoom } from '@/sim/room';
import { presenceDelay, presenceOf, PresenceLoop, useFriends } from '@/store/friends';
import type { SimState } from '@/sim/types';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const room = (over: Record<string, unknown> = {}) => ({
  code: 'K7M2QX',
  mode: 'role',
  state: 'lobby',
  players: 2,
  max: 4,
  ...over,
});

describe('reading the answers', () => {
  it('reads the friends list: online first as sent, offline friends without what they do, bad rows left out', () => {
    const list = parseFriendList({
      friends: [
        { id: 2, name: 'Liis.K', avatar: 'face:12', online: true, since: 100, what: 'room', room: room() },
        { id: 3, name: 'Mart.S', online: true, since: 90, what: 'shift' },
        // Offline: whatever else came is not shown.
        { id: 4, name: 'Nora_V', online: false, since: 80, what: 'menu', room: room() },
        // A closed room is no room to show.
        { id: 5, name: 'Peeter', online: true, since: 70, what: 'room', room: room({ state: 'closed' }) },
        { id: 'x', name: 'Bad' },
        { id: 6 },
        null,
      ],
      asked: [{ id: 7, name: 'Kalle', since: 50 }, { name: 'no id' }],
      asking: [{ id: 8, name: 'Tiina', avatar: '', since: 60 }],
    });
    expect(list.friends.map((f) => f.name)).toEqual(['Liis.K', 'Mart.S', 'Nora_V', 'Peeter']);
    expect(list.friends[0]).toEqual({
      id: 2,
      name: 'Liis.K',
      avatar: 'face:12',
      online: true,
      since: 100,
      what: 'room',
      room: { code: 'K7M2QX', mode: 'role', state: 'lobby', players: 2, max: 4 },
    });
    expect(list.friends[1]).toEqual({ id: 3, name: 'Mart.S', online: true, since: 90, what: 'shift' });
    expect(list.friends[2]).toEqual({ id: 4, name: 'Nora_V', online: false, since: 80 });
    expect(list.friends[3].room).toBeUndefined();
    expect(list.asked).toEqual([{ id: 7, name: 'Kalle', since: 50 }]);
    // An empty avatar is the name's drawing.
    expect(list.asking).toEqual([{ id: 8, name: 'Tiina', since: 60 }]);
    expect(parseFriendList(null)).toEqual({ friends: [], asked: [], asking: [] });
    expect(parseFriendList({ friends: 'x' })).toEqual({ friends: [], asked: [], asking: [] });
  });

  it('reads invitations to a room and to a challenge, and leaves out what it cannot use', () => {
    const from = { id: 2, name: 'Liis.K', avatar: 'draw:7' };
    expect(
      parseInvite({
        id: 11,
        kind: 'room',
        code: 'k7m2qx',
        at: 1000,
        from,
        room: { mode: 'sector', players: 3, max: 4, regionId: 'louna' },
      }),
    ).toEqual({
      id: 11,
      kind: 'room',
      code: 'K7M2QX',
      at: 1000,
      from,
      room: { mode: 'sector', players: 3, max: 4, regionId: 'louna' },
    });
    expect(
      parseInvite({
        id: 12,
        kind: 'challenge',
        code: 'ABC234',
        at: 5,
        from,
        challenge: { regionId: 'ida', score: 1240 },
      }),
    ).toMatchObject({ kind: 'challenge', challenge: { regionId: 'ida', score: 1240 } });
    // No score of the sender's on the board; an unknown prefecture reads as Põhja.
    expect(
      parseInvite({
        id: 13,
        kind: 'challenge',
        code: 'ABC234',
        at: 5,
        from,
        challenge: { regionId: 'mars', score: null },
      }),
    ).toMatchObject({ challenge: { regionId: 'pohja', score: null } });
    expect(parseInvite({ id: 14, kind: 'party', code: 'ABC234', from })).toBeNull();
    expect(parseInvite({ id: 15, kind: 'room', code: 'ABC23', from, room: { mode: 'role' } })).toBeNull();
    expect(parseInvite({ id: 16, kind: 'room', code: 'ABC234', from })).toBeNull();
    expect(parseInvite({ id: 17, kind: 'challenge', code: 'ABC234', from })).toBeNull();
    expect(
      parseInvite({ id: 18, kind: 'room', code: 'ABC234', from: { name: 'x' }, room: { mode: 'role' } }),
    ).toBeNull();
  });

  it('reads a presence answer', () => {
    const p = parsePresence({
      invites: [
        {
          id: 1,
          kind: 'challenge',
          code: 'ABC234',
          at: 1,
          from: { id: 2, name: 'A' },
          challenge: { regionId: 'ida' },
        },
        { id: 'bad' },
      ],
      asking: 2,
      online: 'x',
    });
    expect(p.invites).toHaveLength(1);
    expect(p.asking).toBe(2);
    expect(p.online).toBe(0);
    expect(parsePresence(undefined)).toEqual({ invites: [], asking: 0, online: 0 });
  });

  it('lets the player join a friend’s room only while it takes players', () => {
    const r = parseFriendList({ friends: [{ id: 1, name: 'A', online: true, room: room() }] }).friends[0]
      .room;
    expect(canJoin(r)).toBe(true);
    expect(canJoin(r && { ...r, state: 'finished' })).toBe(true);
    expect(canJoin(r && { ...r, state: 'running' })).toBe(false);
    expect(canJoin(r && { ...r, players: 4 })).toBe(false);
    expect(canJoin(undefined)).toBe(false);
  });

  it('turns a failed request into a known message', () => {
    expect(friendErrorKey(new ApiError(404, 'friend_not_found', 'x'))).toBe('friends.err.friend_not_found');
    expect(friendErrorKey(new ApiError(429, 'rate_limited', 'x'))).toBe('friends.err.rate_limited');
    expect(friendErrorKey(new ApiError(500, 'server_error', 'x'))).toBe('friends.err.other');
    expect(friendErrorKey(new Error('boom'))).toBe('friends.err.network');
  });
});

describe('what the player does', () => {
  const sim = (coop?: string, raceRoom?: string) => {
    const s = { flags: {}, ...(coop ? { coop: { code: coop } } : {}) } as unknown as SimState;
    if (raceRoom) markRoom(s, raceRoom);
    return s;
  };

  it('says a shift (with its room), a room in the lobby or the menu', () => {
    expect(presenceOf('game', sim(), null)).toEqual({ what: 'shift', room: null });
    expect(presenceOf('game', sim('K7M2QX'), null)).toEqual({ what: 'shift', room: 'K7M2QX' });
    expect(presenceOf('game', sim(undefined, 'ABC234'), null)).toEqual({ what: 'shift', room: 'ABC234' });
    expect(presenceOf('lobby', null, 'K7M2QX')).toEqual({ what: 'room', room: 'K7M2QX' });
    expect(presenceOf('lobby', null, null)).toEqual({ what: 'menu', room: null });
    // A room the lobby showed is not where the player is once they are on another screen.
    expect(presenceOf('report', null, 'K7M2QX')).toEqual({ what: 'menu', room: null });
  });

  it('says it often enough to stay online, less often in a shift or a hidden page, backing off after failures', () => {
    expect(presenceDelay('menu', true, 0)).toBe(20_000);
    expect(presenceDelay('game', true, 0)).toBe(60_000);
    expect(presenceDelay('menu', false, 0)).toBe(100_000);
    // Every pace stays inside the server's 150 seconds.
    for (const d of [
      presenceDelay('menu', true, 0),
      presenceDelay('game', true, 0),
      presenceDelay('lobby', false, 0),
    ])
      expect(d).toBeLessThan(150_000);
    expect(presenceDelay('menu', true, 1)).toBe(40_000);
    expect(presenceDelay('menu', true, 9)).toBe(5 * 60_000);
  });
});

describe('requests and the presence loop', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    useFriends.getState().reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sends what the routes expect', async () => {
    fetchMock.mockImplementation(async () =>
      json({ state: 'friends', friends: [], asked: [], asking: [], sent: 2 }),
    );
    expect((await addFriend('  Liis.K ')).state).toBe('friends');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/friends');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ name: 'Liis.K' });
    await sendPresence('room', 'K7M2QX');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/presence');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ what: 'room', room: 'K7M2QX' });
    await sendPresence('menu', null);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ what: 'menu' });
    expect(await sendInvites('challenge', 'ABC234', [2, 3])).toBe(2);
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({
      kind: 'challenge',
      code: 'ABC234',
      to: [2, 3],
    });
    await inviteDone(11);
    expect(fetchMock.mock.calls[4][0]).toBe('/api/invites/11/done');
  });

  it('says it is here on start, again after the delay, at once when asked, and stops', async () => {
    vi.useFakeTimers();
    let what: 'menu' | 'room' = 'menu';
    const answers: number[] = [];
    fetchMock.mockImplementation(async () => json({ invites: [], asking: 0, online: answers.length + 1 }));
    const loop = new PresenceLoop({
      state: () => ({ what, room: what === 'room' ? 'K7M2QX' : null }),
      delay: () => 20_000,
      onPresence: (p) => answers.push(p.online),
    });
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    what = 'room';
    loop.now();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ what: 'room', room: 'K7M2QX' });
    expect(answers).toEqual([1, 2, 3]);
    loop.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('asks again right after a call on its way when what the player does changed meanwhile', async () => {
    vi.useFakeTimers();
    let release: (() => void) | null = null;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>(
          (resolve) => (release = () => resolve(json({ invites: [], asking: 0, online: 0 }))),
        ),
    );
    fetchMock.mockImplementation(async () => json({ invites: [], asking: 0, online: 0 }));
    const loop = new PresenceLoop({
      state: () => ({ what: 'menu', room: null }),
      delay: () => 20_000,
      onPresence: () => {},
    });
    loop.start();
    loop.now();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('keeps going after a failure, with the failure count for the delay', async () => {
    vi.useFakeTimers();
    const counts: number[] = [];
    fetchMock.mockResolvedValueOnce(json({ error: 'server_error' }, 500));
    fetchMock.mockImplementation(async () => json({ invites: [], asking: 0, online: 0 }));
    const loop = new PresenceLoop({
      state: () => ({ what: 'menu', room: null }),
      delay: (n) => (counts.push(n), 1000),
      onPresence: () => {},
    });
    loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(counts).toEqual([1, 0]);
    loop.stop();
  });

  it('refreshes the list while a panel shows it and when somebody new asked, and drops answers after a reset', async () => {
    const list = { friends: [{ id: 2, name: 'Liis.K', online: true, since: 1 }], asked: [], asking: [] };
    fetchMock.mockImplementation(async () => json(list));
    const store = useFriends.getState();
    const unwatch = store.watch();
    await vi.waitFor(() => expect(useFriends.getState().list?.friends).toHaveLength(1));
    expect(useFriends.getState().online).toBe(1);
    fetchMock.mockClear();
    store.applyPresence({ invites: [], asking: 0, online: 1 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unwatch();
    fetchMock.mockClear();
    // Nobody watching and nothing new: no list call.
    store.applyPresence({ invites: [], asking: 0, online: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    // A new friend request: the notice needs the name.
    fetchMock.mockImplementation(async () => json({ ...list, asking: [{ id: 9, name: 'Tiina', since: 5 }] }));
    store.applyPresence({ invites: [], asking: 1, online: 1 });
    await vi.waitFor(() => expect(useFriends.getState().list?.asking).toHaveLength(1));

    // A sign-out while a request is on its way: its answer does not come back into the next account's store.
    let release: (() => void) | null = null;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = () => resolve(json({ state: 'asked', ...list })))),
    );
    const adding = useFriends.getState().add('Mart.S');
    useFriends.getState().reset();
    release!();
    await adding;
    expect(useFriends.getState().list).toBeNull();
  });

  it('takes an invitation off the list at once and tells the server; a removed friend’s invitations go too', async () => {
    fetchMock.mockImplementation(async () => json({ friends: [], asked: [], asking: [] }));
    const inv = (id: number, from: number) =>
      parseInvite({
        id,
        kind: 'challenge',
        code: 'ABC234',
        at: id,
        from: { id: from, name: 'x' },
        challenge: { regionId: 'ida' },
      })!;
    useFriends.getState().applyPresence({ invites: [inv(1, 2), inv(2, 3), inv(3, 2)], asking: 0, online: 0 });
    useFriends.getState().done(2);
    expect(useFriends.getState().invites.map((i) => i.id)).toEqual([1, 3]);
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/invites/2/done')).toBe(true);
    await useFriends.getState().remove(2);
    expect(useFriends.getState().invites).toEqual([]);
  });
});
