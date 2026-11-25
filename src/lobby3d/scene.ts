// Juhtimiskeskuse saal: what the multiplayer screen's 3D control room shows, as plain data (docs/MULTIPLAYER.md
// section 19). `describeScene` turns the screen's state (a guest, the create form's choice, or a room) into the seats
// with their states and colours, the words on the monitors and what the video wall says. No three.js and no DOM in
// here: room3d.ts draws such a description, the stage (LobbyStage.tsx) reports it to the tests, and the unit tests
// check it against rooms.
import type { Room, RoomPlayer } from '@/net/rooms';
import { DEFAULT_ROLES } from '@/sim/coop';
import { defaultDesk, defaultDesks, validDesks } from '@/sim/desks';
import { displayRoomCode, roomStart, ROOM_MAX_PLAYERS, type RoomMode, type RoomOptions } from '@/sim/room';
import { sectorById } from '@/sim/sectors';
import { hhmm, HOUR } from '@/sim/time';
import type { RegionId } from '@/sim/types';

/** The room's colours: the dark Valvekaart tokens (vk.css) as sRGB, for three.js and the canvases. */
export const PALETTE = {
  /** --vk-sea: the room's air, fog and floor. */
  navy: '#07111b',
  /** --vk-panel-2 and --vk-raise: furniture. */
  desk: '#161b21',
  deskEdge: '#1d232a',
  /** --vk-line: frames and seams. */
  line: '#2b3138',
  /** --vk-text-0, -2 and -3: the words on the screens. */
  text: '#eef2f5',
  textDim: '#9ca6ae',
  textFaint: '#8c97a0',
  /** --vk-acc: the player's own, an inviting console. */
  cyan: '#5fc8fa',
  /** --vk-amb: waiting. */
  amber: '#e7af5c',
  /** --vk-ok: ready. */
  green: '#6fd395',
  /** An offline player's strip, a console nobody sits at. */
  grey: '#4a535c',
  /** The host's mark. */
  gold: '#f2c14e',
  /** A screen that is off. */
  off: '#05090e',
} as const;

/** One colour per desk of a sector room, in the desks' order. None of them is the ready green or the waiting amber. */
export const SECTOR_COLOURS = ['#4db8ff', '#b497ff', '#ff8fb3', '#3fd6c6'] as const;

export type StagePhase = 'standby' | 'create' | 'lobby' | 'running' | 'finished';
/**
 * dark: powered off (a guest's room). open: lit and empty, nobody's yet (the create page). invite: the console that
 * waits for the player (the create page). free: a seat of the room nobody has taken. seated: a player's.
 */
export type SeatState = 'dark' | 'open' | 'invite' | 'free' | 'seated';
/** The LED strip along a desk's edge. */
export type LedState = 'off' | 'idle' | 'invite' | 'ready' | 'waiting' | 'offline';

export const LED_COLOUR: Record<LedState, string> = {
  off: PALETTE.off,
  idle: PALETTE.grey,
  invite: PALETTE.cyan,
  ready: PALETTE.green,
  waiting: PALETTE.amber,
  offline: PALETTE.grey,
};

export interface SeatDesc {
  index: number;
  state: SeatState;
  led: LedState;
  /** The first monitor: whose console it is (a player's name, the free seat's words, or nothing). */
  name: string;
  /** The picture on the first monitor: the player's stored avatar and name (as PlayerAvatar takes them). */
  picture: { avatar: string; name: string } | null;
  /** The second monitor's caption: the seat's role, its sector, or its number. */
  title: string;
  /** The second monitor's state line: ready, waiting, on shift and so on. */
  status: string;
  /** The room's host sits here (a gold mark), and the word for it. */
  host: boolean;
  hostWord: string;
  /** The viewer's own seat. */
  me: boolean;
  /** A sector room: the desk this console runs and its colour. */
  sector: string | null;
  tint: string | null;
}

export interface WallMap {
  /** The prefecture lit on the map (none: the whole country, unlit). */
  regionId: RegionId | null;
  /** The whole country, or the prefecture filling the map. */
  zoom: 'country' | 'region';
  /** A sector room's desks in their colours. */
  sectors: { id: string; name: string; colour: string }[];
  /** The map over the whole wall, or in its left wing next to the board. */
  span: 'full' | 'wing';
}

export interface WallRank {
  rank: string;
  /** Empty: a rank nobody holds yet (drawn as a rule). */
  name: string;
  score: string;
  me: boolean;
}

/** The middle of the wall. */
export type WallHero =
  | { kind: 'title'; big: string; sub: string }
  | { kind: 'code'; label: string; code: string; sub: string }
  | { kind: 'ranks'; title: string; rows: WallRank[] };

export interface WallDesc {
  /** A room in standby: everything on the wall glows dimly. */
  dim: boolean;
  /** The strip along the top: the room's name at the left, its state and the clock at the right. */
  header: string;
  state: string;
  clock: string;
  map: WallMap;
  hero: WallHero;
  /** The right wing: facts about the room (and a sector room's desks with their colours). */
  side: { label: string; value: string; colour?: string }[];
}

/** How the consoles stand: each on its own (a race), one joined desk (role co-op), or each under its sector. */
export type Arrangement = 'separate' | 'team' | 'sectors';

export interface SceneDesc {
  /** What the description is of: 'standby', 'create', or the room's code. A change of it is a new scene, not news. */
  id: string;
  phase: StagePhase;
  mode: RoomMode | null;
  arrangement: Arrangement;
  seats: SeatDesc[];
  wall: WallDesc;
}

/** What the stage is shown for. */
export type StageSource =
  | { kind: 'standby' }
  | {
      kind: 'create';
      mode: RoomMode;
      options: Pick<RoomOptions, 'regionId' | 'desks' | 'hours' | 'slot'>;
      /** The signed-in player, on the console that waits for them. */
      me: { name: string; avatar?: string };
    }
  | { kind: 'room'; room: Room };

export interface SceneWords {
  /** The UI dictionary in the player's language. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** A sector's name in the player's language. */
  sectorName: (id: string) => string;
  /** The wall clock ("21:07"); empty for none. */
  clock: string;
}

const ARRANGEMENT: Record<RoomMode, Arrangement> = { race: 'separate', role: 'team', sector: 'sectors' };

/** The desks of a sector room (the options' own, or the prefecture's default pair), as the lobby's desk list has them. */
function desksOf(o: Pick<RoomOptions, 'regionId' | 'desks'>): string[] {
  return validDesks(o.regionId, o.desks) ?? defaultDesks(o.regionId);
}

const deskColour = (desks: readonly string[], id: string): string =>
  SECTOR_COLOURS[Math.max(0, desks.indexOf(id)) % SECTOR_COLOURS.length];

/** A seat with nobody and nothing on it; the callers fill in what their phase shows. */
function blankSeat(index: number, state: SeatState, led: LedState): SeatDesc {
  return {
    index,
    state,
    led,
    name: '',
    picture: null,
    title: '',
    status: '',
    host: false,
    hostWord: '',
    me: false,
    sector: null,
    tint: null,
  };
}

/** What a seat is for in its mode: a role, a sector's desk (with its colour), or just its number. */
function seatDuty(
  mode: RoomMode,
  index: number,
  desks: readonly string[],
  w: SceneWords,
  player?: Pick<RoomPlayer, 'role' | 'desk' | 'seat'>,
): Pick<SeatDesc, 'title' | 'sector' | 'tint'> {
  if (mode === 'role')
    return { title: w.t(`coop.role.${player?.role ?? DEFAULT_ROLES[index % 4]}`), sector: null, tint: null };
  if (mode === 'sector' && desks.length) {
    const desk = player?.desk && desks.includes(player.desk) ? player.desk : defaultDesk(desks, index);
    return { title: w.sectorName(desk), sector: desk, tint: deskColour(desks, desk) };
  }
  return { title: w.t('rooms.stage.seat', { n: index + 1 }), sector: null, tint: null };
}

function wallMap(
  mode: RoomMode,
  regionId: RegionId,
  desks: readonly string[],
  span: WallMap['span'],
  w: SceneWords,
): WallMap {
  const sector = mode === 'sector';
  return {
    regionId,
    zoom: sector ? 'region' : 'country',
    sectors: sector ? desks.map((id) => ({ id, name: w.sectorName(id), colour: deskColour(desks, id) })) : [],
    span,
  };
}

/** The right wing's facts: the mode, the prefecture, the shift, and a sector room's desks. */
function sideFacts(
  mode: RoomMode,
  o: Pick<RoomOptions, 'regionId' | 'hours' | 'slot'>,
  map: WallMap,
  w: SceneWords,
  shift: string | null,
  players: string | null,
): WallDesc['side'] {
  const rows: WallDesc['side'] = [
    { label: w.t('rooms.mode'), value: w.t(`rooms.mode.${mode}`) },
    { label: w.t('rooms.opt.region'), value: w.t(`account.lb.region.${o.regionId}`) },
    {
      label: w.t('rooms.run.title'),
      value: shift ?? `${w.t(`daily.slot.${o.slot}`)} · ${w.t('rooms.opt.hoursN', { n: o.hours })}`,
    },
  ];
  if (players) rows.push({ label: w.t('rooms.players'), value: players });
  for (const s of map.sectors) rows.push({ label: s.name, value: '', colour: s.colour });
  return rows;
}

function standby(w: SceneWords): SceneDesc {
  return {
    id: 'standby',
    phase: 'standby',
    mode: null,
    arrangement: 'separate',
    seats: Array.from({ length: ROOM_MAX_PLAYERS }, (_, i) => blankSeat(i, 'dark', 'off')),
    wall: {
      dim: true,
      header: w.t('rooms.stage.header'),
      state: '',
      clock: '',
      map: { regionId: null, zoom: 'country', sectors: [], span: 'full' },
      hero: { kind: 'title', big: w.t('rooms.stage.standby'), sub: w.t('rooms.title') },
      side: [],
    },
  };
}

function creating(src: Extract<StageSource, { kind: 'create' }>, w: SceneWords): SceneDesc {
  const { mode, options: o } = src;
  const desks = mode === 'sector' ? desksOf(o) : [];
  // A race keeps the map in the wing next to its scoreboard; a shared shift is one map over the whole wall.
  const map = wallMap(mode, o.regionId, desks, mode === 'race' ? 'wing' : 'full', w);
  const seats = Array.from({ length: ROOM_MAX_PLAYERS }, (_, i): SeatDesc => {
    const mine = i === 0;
    return {
      ...blankSeat(i, mine ? 'invite' : 'open', mine ? 'invite' : 'idle'),
      ...seatDuty(mode, i, desks, w),
      name: mine ? src.me.name : '',
      picture: mine ? { avatar: src.me.avatar ?? '', name: src.me.name } : null,
      me: mine,
    };
  });
  const modeName = w.t(`rooms.mode.${mode}`);
  const hero: WallHero =
    mode === 'race'
      ? {
          kind: 'ranks',
          title: modeName,
          rows: seats.map((s) => ({ rank: String(s.index + 1), name: '', score: '', me: false })),
        }
      : { kind: 'title', big: modeName, sub: w.t(`career.region.${o.regionId}.name`) };
  return {
    id: 'create',
    phase: 'create',
    mode,
    arrangement: ARRANGEMENT[mode],
    seats,
    wall: {
      dim: false,
      header: w.t('rooms.stage.header'),
      state: w.t('rooms.create.title'),
      clock: w.clock,
      map,
      hero,
      side: sideFacts(mode, o, map, w, null, null),
    },
  };
}

/** A seated player's strip and state line, in the lobby and once the round is on. */
function seatMood(room: Room, p: RoomPlayer, w: SceneWords): Pick<SeatDesc, 'led' | 'status'> {
  if (!p.online) return { led: 'offline', status: w.t('rooms.p.offline') };
  if (room.state === 'lobby')
    return p.ready
      ? { led: 'ready', status: w.t('rooms.p.ready') }
      : { led: 'waiting', status: w.t('rooms.p.waiting') };
  return p.done
    ? { led: 'ready', status: w.t('rooms.p.done') }
    : { led: 'waiting', status: w.t('rooms.p.playing') };
}

function inRoom(room: Room, w: SceneWords): SceneDesc {
  const { mode, options: o } = room;
  const desks = mode === 'sector' ? desksOf(o) : [];
  const count = Math.max(2, Math.min(ROOM_MAX_PLAYERS, room.max));
  const lobby = room.state === 'lobby';
  const seats = Array.from({ length: count }, (_, i): SeatDesc => {
    const p = room.players.find((x) => x.seat === i && !x.left);
    if (!p)
      return {
        ...blankSeat(i, 'free', 'idle'),
        ...seatDuty(mode, i, desks, w),
        name: w.t('rooms.seat.free'),
      };
    return {
      ...blankSeat(i, 'seated', 'idle'),
      ...seatDuty(mode, i, desks, w, p),
      ...seatMood(room, p, w),
      name: p.name,
      picture: { avatar: p.avatar ?? '', name: p.name },
      host: p.host,
      hostWord: p.host ? w.t('rooms.badge.host') : '',
      me: p.id === room.me,
    };
  });
  const map = wallMap(mode, o.regionId, desks, 'wing', w);
  const here = room.players.filter((p) => !p.left).length;
  let shift: string | null = null;
  if (!lobby && room.seed !== null && room.day !== null) {
    const start = roomStart({ seed: room.seed, day: room.day, options: o });
    shift = `${hhmm(start)}-${hhmm(start + o.hours * HOUR)}`;
  }
  let hero: WallHero;
  if (lobby)
    hero = {
      kind: 'code',
      label: w.t('rooms.code'),
      code: displayRoomCode(room.code),
      sub: `${w.t(`rooms.mode.${mode}`)} · ${w.t(`career.region.${o.regionId}.name`)}`,
    };
  else if (room.state === 'running') hero = { kind: 'title', big: w.t('rooms.stage.on'), sub: shift ?? '' };
  else
    hero = {
      kind: 'ranks',
      title: w.t('rooms.board.title'),
      rows: [...room.results]
        .sort((a, b) => a.rank - b.rank || a.at - b.at)
        .slice(0, ROOM_MAX_PLAYERS)
        .map((r) => ({ rank: String(r.rank), name: r.name, score: String(r.score), me: r.id === room.me })),
    };
  return {
    id: room.code,
    phase: lobby ? 'lobby' : room.state === 'running' ? 'running' : 'finished',
    mode,
    arrangement: ARRANGEMENT[mode],
    seats,
    wall: {
      dim: false,
      header: w.t('rooms.stage.header'),
      state: w.t(`rooms.state.${room.state}`),
      clock: w.clock,
      map,
      hero,
      side: sideFacts(mode, o, map, w, shift, `${here}/${room.max}`),
    },
  };
}

/** The scene for what the multiplayer screen shows now. */
export function describeScene(src: StageSource, w: SceneWords): SceneDesc {
  if (src.kind === 'standby') return standby(w);
  if (src.kind === 'create') return creating(src, w);
  return inRoom(src.room, w);
}

/** The words `describeScene` needs, from the dictionary and the sectors' own names. */
export function sceneWords(
  t: SceneWords['t'],
  tx: (text: { et: string; en: string }) => string,
  clock: string,
): SceneWords {
  return { t, sectorName: (id) => tx(sectorById(id)?.name ?? { et: id, en: id }), clock };
}

/** What the stage tells the tests about its seats: one state per seat, in order ("seated,seated,free,free"). */
export const seatStates = (scene: SceneDesc): string => scene.seats.map((s) => s.state).join(',');

/** The seats whose player has just sat down: seated now, not seated in `prev` (the same room's earlier scene). */
export function newlySeated(prev: SceneDesc | null, next: SceneDesc): number[] {
  if (!prev || prev.id !== next.id || next.phase !== 'lobby') return [];
  return next.seats
    .filter((s) => s.state === 'seated' && prev.seats[s.index]?.state !== 'seated')
    .map((s) => s.index);
}

/**
 * Where the consoles stand on their arc before the wall: each seat's angle (radians, 0 straight ahead, negative to
 * the left). A team's desks touch; separate consoles and sector desks keep a gap between them.
 */
export function seatAngles(count: number, arrangement: Arrangement): number[] {
  const step = arrangement === 'team' ? 0.224 : 0.285;
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
}
