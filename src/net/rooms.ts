// Mitmikmäng (docs/MULTIPLAYER.md, server/lib/rooms.php): rooms with a 6-character code, the lobby, the poll that
// keeps it current, and a room run's result. Accounts only: every route needs a signed-in player.
// No UI strings here: errors carry the server's code, the UI translates (roomErrorKey).
import type { Difficulty, RegionId, ShiftReport } from '@/sim/types';
import {
  normalizeRoomCode,
  ROOM_DIFFICULTIES,
  ROOM_HOURS,
  ROOM_SLOTS,
  type RoomMode,
  type RoomOptions,
  type RoomShift,
  type RoomSlot,
} from '@/sim/room';
import { ApiError, request, toApiError } from './api';
import { isCoopRole, type CoopRole } from '@/sim/coop';
import { isObj } from './sync';
import { parseCustom, type CustomSetup } from '@/sim/custom';

export type RoomStateName = 'lobby' | 'running' | 'finished' | 'closed';

export interface RoomPlayer {
  id: number;
  name: string;
  seat: number;
  host: boolean;
  /** In the lobby: ready to start (the host always is). Once the round is on: takes part in it. */
  ready: boolean;
  online: boolean;
  /** Left the room after its shift started (stays on the board). */
  left: boolean;
  /** Has sent a result. */
  done: boolean;
  /** Role co-op: the role picked in the lobby (or the seat's default). */
  role?: CoopRole;
  /** Sector co-op: the desk (sector id) picked in the lobby, or the seat's default. */
  desk?: string;
  /** Kohandatud mäng (race and sector rooms): the force the player drafted for themselves or their desk. */
  custom?: CustomSetup;
  /** Profiilipilt (2.35.0, src/gen/faceSearch.ts): 'face:<id>' or 'draw:<seed>'; missing for the name's drawing. */
  avatar?: string;
}

export interface RoomResult {
  id: number;
  name: string;
  /** Profiilipilt (2.35.0): as on the player; missing for the name's drawing. */
  avatar?: string;
  score: number;
  grade: string;
  incidents: number;
  arrests: number;
  /** Co-op: the player's XP from the shift (the team's plus their share). */
  xp: number;
  at: number;
  /** 1 + the number of strictly higher scores in the room. */
  rank: number;
}

/** An earlier round of a room (the one before the current, docs/MULTIPLAYER.md section 11). */
export interface RoomRound {
  round: number;
  mode: RoomMode;
  /** The round's shift seed: a report of that shift has the same (SimState.seed). */
  seed: number;
  results: RoomResult[];
}

export interface Room {
  code: string;
  mode: RoomMode;
  state: RoomStateName;
  /** Rounds played in the room so far, the current one included (1 for a new room). */
  round: number;
  /** The round before the current one, while anybody's result of it is kept. */
  last: RoomRound | null;
  /** Poll tag: send it back as ?v= and an unchanged room answers in a few bytes. */
  v: string;
  /** The host's account id (null when nobody is left). */
  host: number | null;
  /** The caller's account id. */
  me: number;
  max: number;
  options: RoomOptions;
  /** Known once the shift is on. */
  seed: number | null;
  day: string | null;
  created: number;
  started: number | null;
  /** 'server': the game server runs the shared shift (docs/MULTIPLAYER.md section 9); '' lockstep or a race. */
  engine: RoomEngine;
  players: RoomPlayer[];
  results: RoomResult[];
}

export type RoomEngine = 'server' | '';

const REGIONS: RegionId[] = ['pohja', 'ida', 'louna', 'laane'];
const MODES: RoomMode[] = ['race', 'sector', 'role'];
const STATES: RoomStateName[] = ['lobby', 'running', 'finished', 'closed'];

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d;

export function parseOptions(v: unknown): RoomOptions {
  const o = isObj(v) ? v : {};
  const hours = num(o.hours, 3);
  return {
    regionId: oneOf(o.regionId, REGIONS, 'pohja'),
    sector: str(o.sector),
    ...(Array.isArray(o.desks) && o.desks.length
      ? { desks: o.desks.filter((d): d is string => typeof d === 'string').slice(0, 4) }
      : {}),
    difficulty: oneOf<Difficulty>(o.difficulty, ROOM_DIFFICULTIES, 'normal'),
    hours: (ROOM_HOURS as readonly number[]).includes(hours) ? hours : 3,
    slot: oneOf<RoomSlot>(o.slot, ROOM_SLOTS, 'evening'),
    ...customOf(o.custom, oneOf(o.regionId, REGIONS, 'pohja')),
  };
}

/**
 * A room's custom force (src/sim/custom.ts), cleaned; nothing when it has none. In a race or sector room it may have
 * no crews: custom forces are on and every player drafts their own (RoomPlayer.custom).
 */
function customOf(v: unknown, regionId: RegionId, keepEmpty = true): { custom?: CustomSetup } {
  const c = parseCustom(v, regionId);
  return c && (keepEmpty || c.crews.length) ? { custom: c } : {};
}

function parsePlayer(v: unknown): RoomPlayer | null {
  if (!isObj(v) || typeof v.id !== 'number') return null;
  return {
    id: v.id,
    name: str(v.name, '?'),
    seat: num(v.seat),
    host: v.host === true,
    ready: v.ready === true,
    online: v.online === true,
    left: v.left === true,
    done: v.done === true,
    ...(isCoopRole(v.role) ? { role: v.role } : {}),
    ...(typeof v.desk === 'string' && v.desk ? { desk: v.desk } : {}),
    ...(typeof v.avatar === 'string' && v.avatar ? { avatar: v.avatar } : {}),
  };
}

function parseResult(v: unknown, i: number): RoomResult | null {
  if (!isObj(v) || typeof v.id !== 'number') return null;
  const rank = num(v.rank);
  return {
    id: v.id,
    name: str(v.name, '?'),
    ...(typeof v.avatar === 'string' && v.avatar ? { avatar: v.avatar } : {}),
    score: num(v.score),
    grade: str(v.grade),
    incidents: num(v.incidents),
    arrests: num(v.arrests),
    xp: num(v.xp),
    at: num(v.at),
    rank: rank > 0 ? Math.round(rank) : i + 1,
  };
}

const parseResults = (v: unknown): RoomResult[] =>
  Array.isArray(v) ? v.map(parseResult).filter((r): r is RoomResult => !!r) : [];

/** The room's last round, or null (none yet, or nobody's result of it is kept). */
function parseRound(v: unknown): RoomRound | null {
  if (!isObj(v) || typeof v.round !== 'number' || v.round < 1) return null;
  const results = parseResults(v.results);
  if (!results.length) return null;
  return { round: Math.round(v.round), mode: oneOf(v.mode, MODES, 'race'), seed: num(v.seed), results };
}

/** A room from the server, or null when the answer is not one. */
export function parseRoom(v: unknown): Room | null {
  if (!isObj(v)) return null;
  const code = normalizeRoomCode(v.code);
  if (!code) return null;
  const options = parseOptions(v.options);
  const players = Array.isArray(v.players)
    ? v.players
        .map((x) => {
          const p = parsePlayer(x);
          return p && isObj(x) ? { ...p, ...customOf(x.custom, options.regionId, false) } : p;
        })
        .filter((p): p is RoomPlayer => !!p)
        .sort((a, b) => a.seat - b.seat)
    : [];
  const results = parseResults(v.results);
  return {
    code,
    mode: oneOf(v.mode, MODES, 'race'),
    state: oneOf(v.state, STATES, 'closed'),
    round: Math.max(1, Math.round(num(v.round, 1))),
    last: parseRound(v.last),
    v: str(v.v),
    host: typeof v.host === 'number' ? v.host : null,
    me: num(v.me),
    max: num(v.max, 4) || 4,
    options,
    seed: typeof v.seed === 'number' && v.seed > 0 ? v.seed : null,
    day: typeof v.day === 'string' ? v.day : null,
    created: num(v.created),
    started: typeof v.started === 'number' ? v.started : null,
    engine: v.engine === 'server' ? 'server' : '',
    players,
    results,
  };
}

/** The shift of a started room, or null while it waits in the lobby. */
export function roomShiftOf(room: Room): RoomShift | null {
  if (room.state === 'lobby' || room.seed === null || room.day === null) return null;
  return { code: room.code, mode: room.mode, seed: room.seed, day: room.day, options: room.options };
}

export const isHost = (room: Room): boolean => room.host !== null && room.host === room.me;
export const meIn = (room: Room): RoomPlayer | undefined => room.players.find((p) => p.id === room.me);
/** Players who are still in the room. */
export const present = (room: Room): RoomPlayer[] => room.players.filter((p) => !p.left);

/**
 * Why the host cannot start yet, or null when the shift can start. The server checks the same rules: the round is for
 * the host, everybody ready and everybody here (online); somebody here who is not ready holds it up, somebody away
 * (closed the tab after the last round) does not. 'away': there would be players enough, but the others are away.
 */
export function startBlock(room: Room): 'not_host' | 'state' | 'too_few' | 'away' | 'not_ready' | null {
  if (!isHost(room)) return 'not_host';
  if (room.state !== 'lobby') return 'state';
  const here = present(room);
  const part = here.filter((p) => p.host || p.ready || p.online);
  if (part.length < 2) return here.length < 2 ? 'too_few' : 'away';
  if (part.some((p) => !p.ready)) return 'not_ready';
  return null;
}

/** The caller's own result, when sent. */
export const myResult = (room: Room): RoomResult | undefined => room.results.find((r) => r.id === room.me);

/** Players who take part in the running (or just finished) round: still in the room and ready at its start. */
export const participants = (room: Room): RoomPlayer[] => present(room).filter((p) => p.ready);

/** Players still playing (taking part, no result yet), for the board's waiting rows. */
export function stillPlaying(room: Room): RoomPlayer[] {
  return participants(room).filter((p) => !room.results.some((r) => r.id === p.id));
}

/**
 * The board of the round a report's shift (its seed) belongs to: the room's current round while it is on it, its
 * last round once the room has moved on, or null when that round's results are gone (the room went further, or the
 * shift is not of this room's rounds).
 */
export function roundOfShift(
  room: Room,
  seed: number,
): { round: number; results: RoomResult[]; current: boolean } | null {
  if (room.state !== 'lobby' && room.seed === seed)
    return { round: room.round, results: room.results, current: true };
  if (room.last && room.last.seed === seed)
    return { round: room.last.round, results: room.last.results, current: false };
  return null;
}

// ── Requests ─────────────────────────────────────────────────────────────────

function roomOf(res: unknown): Room {
  const room = parseRoom(isObj(res) ? res.room : null);
  if (!room) throw new ApiError(200, 'bad_response', 'No room in the answer');
  return room;
}

const path = (code: string, rest = '') => `/rooms/${encodeURIComponent(code)}${rest}`;

/** The caller's open room (lobby or running), for a way back after a reload. */
export async function fetchMyRoom(): Promise<Room | null> {
  const res = await request<unknown>('GET', '/rooms');
  return parseRoom(isObj(res) ? res.room : null);
}

export async function createRoom(mode: RoomMode, options: RoomOptions): Promise<Room> {
  return roomOf(await request<unknown>('POST', '/rooms', { mode, ...options }));
}

/** Join by code (any case, spaces allowed). Rejects with ApiError 'bad_code' before asking when it cannot be a code. */
export async function joinRoom(typed: string): Promise<Room> {
  const code = normalizeRoomCode(typed);
  if (!code) throw new ApiError(0, 'bad_code', 'Not a room code');
  return roomOf(await request<unknown>('POST', '/rooms/join', { code }));
}

/** One poll: the room when it changed since `v`, else null. */
export async function pollRoom(code: string, v = ''): Promise<{ v: string; room: Room | null }> {
  const q = v ? `?v=${encodeURIComponent(v)}` : '';
  const res = await request<unknown>('GET', path(code, q), undefined, { timeout: 6000 });
  const o = isObj(res) ? res : {};
  if (o.unchanged === true) return { v: str(o.v, v), room: null };
  const room = roomOf(res);
  return { v: room.v || str(o.v), room };
}

/** The host's options for the next shift; `mode` switches the room's mode too (lobby only). */
export async function updateRoomOptions(code: string, options: RoomOptions, mode?: RoomMode): Promise<Room> {
  return roomOf(await request<unknown>('PUT', path(code), mode ? { ...options, mode } : options));
}

/**
 * Back in the room after a round: a room whose round is over opens for the next one (whoever comes back first opens
 * it); a round still on stays as it is, unless the host ends it for everybody (`end`). `round` is the round the
 * player comes back from: when the room has moved on since, nothing changes.
 */
export async function reopenRoom(code: string, opts: { round?: number; end?: boolean } = {}): Promise<Room> {
  return roomOf(await request<unknown>('POST', path(code, '/reopen'), opts));
}

/** Kohandatud mäng: the player's own draft (race and sector rooms); 409 `officer_taken` when another has one. */
export async function setRoomCustom(code: string, custom: CustomSetup): Promise<Room> {
  return roomOf(await request<unknown>('POST', path(code, '/custom'), { custom }));
}

export async function setRoomReady(code: string, ready: boolean): Promise<Room> {
  return roomOf(await request<unknown>('POST', path(code, '/ready'), { ready }));
}

export async function startRoom(code: string): Promise<Room> {
  return roomOf(await request<unknown>('POST', path(code, '/start')));
}

export async function leaveRoom(code: string): Promise<void> {
  await request<unknown>('POST', path(code, '/leave'));
}

/**
 * The host removes the player in a seat (docs/MULTIPLAYER.md section 12): they are out of the room at once, also
 * from a running round, and cannot come back with the code.
 */
export async function kickPlayer(code: string, seat: number): Promise<Room> {
  return roomOf(await request<unknown>('POST', path(code, '/kick'), { seat }));
}

/**
 * Body of POST /api/rooms/{code}/result (a co-op player adds their own XP). `seed` is the shift's: the room answers
 * `round_over` when its round is over by then. `signed` is the game server's signed result of a shared shift it ran
 * (the API counts that one, whatever the numbers beside it say).
 */
export function roomResultBody(r: ShiftReport, xp?: number, seed?: number, signed?: string) {
  return {
    score: Math.max(0, Math.min(100, Math.round(r.score))),
    grade: r.grade,
    incidents: r.stats?.incidents ?? 0,
    arrests: r.stats?.arrests ?? 0,
    ...(xp !== undefined ? { xp: Math.max(0, Math.min(100000, Math.round(xp))) } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(signed ? { signed } : {}),
  };
}

/**
 * Which shift a game server's signed result is of (its room code and seed), read without checking the signature:
 * the report uses it to match the result to its own shift, the API checks it.
 */
export function signedResultShift(token: string | null | undefined): { code: string; seed: number } | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  try {
    const body = token.slice(0, token.indexOf('.')).replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(atob(body + '='.repeat((4 - (body.length % 4)) % 4))) as unknown;
    if (!isObj(p) || typeof p.code !== 'string' || typeof p.seed !== 'number') return null;
    return { code: p.code, seed: p.seed };
  } catch {
    return null;
  }
}

export interface RoomResultReply {
  /** False when this player had already sent a result for the room. */
  counted: boolean;
  rank: number | null;
  room: Room | null;
}

const submitted = new WeakMap<ShiftReport, Promise<RoomResultReply>>();

/** POST the room run's result once per report (StrictMode and re-renders included); a failure may be retried. */
export function submitRoomResultOnce(
  report: ShiftReport,
  code: string,
  xp?: number,
  seed?: number,
  signed?: string,
): Promise<RoomResultReply> {
  let p = submitted.get(report);
  if (!p) {
    p = request<unknown>('POST', path(code, '/result'), roomResultBody(report, xp, seed, signed)).then(
      (res) => {
        const o = isObj(res) ? res : {};
        const rank = num(o.rank);
        return { counted: o.counted !== false, rank: rank > 0 ? rank : null, room: parseRoom(o.room) };
      },
    );
    p.catch(() => submitted.delete(report));
    submitted.set(report, p);
  }
  return p;
}

/** i18n key of a failed room request. */
export function roomErrorKey(e: unknown): string {
  const code = toApiError(e).code;
  const known = [
    'bad_code',
    'room_not_found',
    'room_full',
    'room_started',
    'room_closed',
    'not_host',
    'not_ready',
    'too_few',
    'rate_limited',
    'auth_required',
    'mode_unavailable',
    'empty_shift',
    'left_room',
    'not_coop',
    'not_running',
    'log_full',
    'invalid_command',
    'mp_unavailable',
    'replaced',
    'officer_taken',
    'not_custom',
    'round_over',
    'kicked',
    'unsigned',
    'player_not_found',
    'kick_self',
    'network',
    'timeout',
  ];
  return `rooms.err.${known.includes(code) ? code : 'other'}`;
}

// ── Polling ──────────────────────────────────────────────────────────────────

/** Pause before the next poll: about a second while the page is visible, slower in the background and after failures. */
export function pollDelay(visible: boolean, failures: number, base = 1000): number {
  const backoff = Math.min(15_000, base * 2 ** Math.min(4, failures));
  return Math.max(visible ? base : 5000, failures ? backoff : 0);
}

export interface RoomPollerOptions {
  code: string;
  /** The room whenever it changed (the first answer always counts as a change). */
  onRoom: (room: Room) => void;
  /** A poll failed; `gone` when the room is not there for this player any more (404). */
  onError?: (e: ApiError, gone: boolean) => void;
  /** Base interval in ms (default 1000). */
  every?: number;
  isVisible?: () => boolean;
}

/**
 * Polls a room until stopped: one request at a time, ?v= so an unchanged room costs a few bytes, slower while the
 * page is hidden, backing off after failures, and stopping by itself once the room is gone (404).
 */
export class RoomPoller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private v = '';
  private failures = 0;
  private stopped = true;

  constructor(private readonly opts: RoomPollerOptions) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Poll again at once (after an action of our own). */
  now(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.tick();
  }

  /** Forget the tag so the next answer is a full room. */
  reset(): void {
    this.v = '';
  }

  private visible(): boolean {
    if (this.opts.isVisible) return this.opts.isVisible();
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    try {
      const res = await pollRoom(this.opts.code, this.v);
      if (this.stopped) return;
      this.failures = 0;
      this.v = res.v;
      if (res.room) this.opts.onRoom(res.room);
    } catch (e) {
      if (this.stopped) return;
      const err = toApiError(e);
      // 403 `kicked`: the host removed this player; the room is gone for them as well.
      const gone = err.status === 404 || err.status === 401 || err.status === 403;
      this.failures++;
      this.opts.onError?.(err, gone);
      if (gone) {
        this.stop();
        return;
      }
    }
    if (this.stopped) return;
    this.timer = setTimeout(
      () => void this.tick(),
      pollDelay(this.visible(), this.failures, this.opts.every),
    );
  }
}
