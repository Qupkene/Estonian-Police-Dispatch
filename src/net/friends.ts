// Sõbrad (2.40.0, docs/MULTIPLAYER.md section 18, server/lib/friends.php): friends by user name, who of them is online
// and what they do, and invitations to a room or to a challenge. Accounts only: every route needs a signed-in player.
// No UI strings here: errors carry the server's code, the UI translates (friendErrorKey).
import { REGION_IDS } from '@/data/regions';
import { normalizeRoomCode, type RoomMode } from '@/sim/room';
import type { RegionId } from '@/sim/types';
import { request, toApiError } from './api';
import type { RoomStateName } from './rooms';
import { isObj } from './sync';

/** What a signed-in client says it does. */
export type FriendWhat = 'menu' | 'shift' | 'room';

/** The room an online friend is in (not a closed one). */
export interface FriendRoom {
  code: string;
  mode: RoomMode;
  state: RoomStateName;
  players: number;
  max: number;
}

export interface Friend {
  id: number;
  name: string;
  /** Profiilipilt (2.35.0): 'face:<id>' or 'draw:<seed>'; missing for the name's drawing. */
  avatar?: string;
  online: boolean;
  /** Friends since (ms). */
  since: number;
  /** Online: what they do. */
  what?: FriendWhat;
  /** Online in a room. */
  room?: FriendRoom;
}

/** A friend request either way: who, and since when. */
export interface FriendRequest {
  id: number;
  name: string;
  avatar?: string;
  since: number;
}

export interface FriendList {
  /** Online first, then by name. */
  friends: Friend[];
  /** The player's requests, waiting for the other. */
  asked: FriendRequest[];
  /** Requests to the player. */
  asking: FriendRequest[];
}

export type InviteKind = 'room' | 'challenge';

export interface Invite {
  id: number;
  kind: InviteKind;
  /** The room's or the challenge's code. */
  code: string;
  /** Sent (ms). */
  at: number;
  from: { id: number; name: string; avatar?: string };
  /** A room invitation: the room as it is now (it takes players: the server leaves out the others). */
  room?: { mode: RoomMode; players: number; max: number; regionId: RegionId };
  /** A challenge: where, and the sender's points (null when they have none on its board). */
  challenge?: { regionId: RegionId; score: number | null };
}

/** The answer of a presence call: what waits for the player. */
export interface Presence {
  /** Newest first. */
  invites: Invite[];
  /** Friend requests waiting for the player. */
  asking: number;
  /** Friends online now. */
  online: number;
}

export const EMPTY_FRIENDS: FriendList = { friends: [], asked: [], asking: [] };

const MODES: RoomMode[] = ['race', 'sector', 'role'];
const STATES: RoomStateName[] = ['lobby', 'running', 'finished', 'closed'];
const WHATS: FriendWhat[] = ['menu', 'shift', 'room'];

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;
const region = (v: unknown): RegionId => oneOf(v, REGION_IDS) ?? 'pohja';
const avatarOf = (v: Record<string, unknown>): { avatar?: string } =>
  typeof v.avatar === 'string' && v.avatar ? { avatar: v.avatar } : {};

function parseFriendRoom(v: unknown): FriendRoom | null {
  if (!isObj(v)) return null;
  const code = normalizeRoomCode(v.code);
  const mode = oneOf(v.mode, MODES);
  const state = oneOf(v.state, STATES);
  if (!code || !mode || !state || state === 'closed') return null;
  return { code, mode, state, players: num(v.players), max: Math.max(1, num(v.max)) };
}

function parseFriend(v: unknown): Friend | null {
  if (!isObj(v) || typeof v.id !== 'number' || typeof v.name !== 'string') return null;
  const online = v.online === true;
  const what = online ? oneOf(v.what, WHATS) : null;
  const room = online ? parseFriendRoom(v.room) : null;
  return {
    id: v.id,
    name: v.name,
    ...avatarOf(v),
    online,
    since: num(v.since),
    ...(what ? { what } : {}),
    ...(room ? { room } : {}),
  };
}

function parseRequest(v: unknown): FriendRequest | null {
  if (!isObj(v) || typeof v.id !== 'number' || typeof v.name !== 'string') return null;
  return { id: v.id, name: v.name, ...avatarOf(v), since: num(v.since) };
}

const listOf = <T>(v: unknown, parse: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.map(parse).filter((x): x is T => x !== null) : [];

export function parseFriendList(v: unknown): FriendList {
  const o = isObj(v) ? v : {};
  return {
    friends: listOf(o.friends, parseFriend),
    asked: listOf(o.asked, parseRequest),
    asking: listOf(o.asking, parseRequest),
  };
}

export function parseInvite(v: unknown): Invite | null {
  if (!isObj(v) || typeof v.id !== 'number' || !isObj(v.from) || typeof v.from.id !== 'number') return null;
  const kind = oneOf(v.kind, ['room', 'challenge'] as const);
  const code = normalizeRoomCode(v.code);
  if (!kind || !code || typeof v.from.name !== 'string') return null;
  const base = {
    id: v.id,
    kind,
    code,
    at: num(v.at),
    from: { id: v.from.id, name: v.from.name, ...avatarOf(v.from) },
  };
  if (kind === 'room') {
    if (!isObj(v.room)) return null;
    const mode = oneOf(v.room.mode, MODES);
    if (!mode) return null;
    return {
      ...base,
      room: {
        mode,
        players: num(v.room.players),
        max: Math.max(1, num(v.room.max)),
        regionId: region(v.room.regionId),
      },
    };
  }
  if (!isObj(v.challenge)) return null;
  const score = v.challenge.score;
  return {
    ...base,
    challenge: {
      regionId: region(v.challenge.regionId),
      score: typeof score === 'number' && Number.isFinite(score) ? score : null,
    },
  };
}

export function parsePresence(v: unknown): Presence {
  const o = isObj(v) ? v : {};
  return { invites: listOf(o.invites, parseInvite), asking: num(o.asking), online: num(o.online) };
}

/** Can the player join this friend's room from the list (it takes players)? */
export function canJoin(room: FriendRoom | undefined): room is FriendRoom {
  return !!room && (room.state === 'lobby' || room.state === 'finished') && room.players < room.max;
}

// ── Requests ─────────────────────────────────────────────────────────────────

export async function fetchFriends(): Promise<FriendList> {
  return parseFriendList(await request<unknown>('GET', '/friends'));
}

/** Ask a player by their user name; asking one who asked first makes you friends at once. */
export async function addFriend(name: string): Promise<{ state: 'asked' | 'friends'; list: FriendList }> {
  const res = await request<unknown>('POST', '/friends', { name: name.trim() });
  const state = isObj(res) && res.state === 'friends' ? 'friends' : 'asked';
  return { state, list: parseFriendList(res) };
}

export async function acceptFriend(id: number): Promise<FriendList> {
  return parseFriendList(await request<unknown>('POST', `/friends/${id}/accept`, {}));
}

/** End a friendship, decline a request or take one's own back. */
export async function removeFriend(id: number): Promise<FriendList> {
  return parseFriendList(await request<unknown>('DELETE', `/friends/${id}`));
}

/** The client is here: in the menu, a shift or a room (its code). Answers what waits for the player. */
export async function sendPresence(what: FriendWhat, room: string | null): Promise<Presence> {
  return parsePresence(await request<unknown>('POST', '/presence', room ? { what, room } : { what }));
}

/** Invite friends to the room the player is in, or to a challenge. Answers how many invitations went out. */
export async function sendInvites(kind: InviteKind, code: string, to: number[]): Promise<number> {
  const res = await request<unknown>('POST', '/invites', { kind, code, to });
  return isObj(res) ? num(res.sent) : 0;
}

/** The invitation was taken up or put away. */
export async function inviteDone(id: number): Promise<void> {
  await request<unknown>('POST', `/invites/${id}/done`, {});
}

/** i18n key of a failed friends request. */
export function friendErrorKey(e: unknown): string {
  const code = toApiError(e).code;
  const known = [
    'friend_not_found',
    'friend_self',
    'friends_full',
    'request_not_found',
    'rate_limited',
    'room_not_found',
    'room_started',
    'challenge_not_found',
    'auth_required',
    'network',
    'timeout',
  ];
  return `friends.err.${known.includes(code) ? code : 'other'}`;
}
