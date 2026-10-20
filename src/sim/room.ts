/**
 * Mitmikmäng, mode `race` (same-seed competition, docs/MULTIPLAYER.md): every player of a room plays the same
 * shift on their own. The shift follows from what the server hands out when the host starts the room: the seed,
 * the day (Europe/Tallinn) and the options the host chose. Like the daily challenge (src/sim/daily.ts) it uses
 * `fixedSchedule`, so the calls come at the same times and places whatever each player does.
 *
 * A room run is an ordinary free shift whose `flags.room` holds the room code; the report posts it to
 * /api/rooms/{code}/result instead of /api/score. Pure functions: no store, no network.
 */
import { parseDate, SLOT_HOURS, type DailySlot } from './daily';
import { Rng } from './rng';
import { tallinnTime } from './time';
import type { Difficulty, NewShiftOptions, RegionId, SimState } from './types';

export type RoomSlot = DailySlot;
export type RoomMode = 'race' | 'sector' | 'role';

/** Shift lengths a host can pick (game hours). */
export const ROOM_HOURS = [2, 3, 4, 6] as const;
export const ROOM_SLOTS: RoomSlot[] = ['morning', 'afternoon', 'evening', 'night'];
export const ROOM_DIFFICULTIES: Difficulty[] = ['cadet', 'normal', 'veteran', 'realistic'];
export const ROOM_MAX_PLAYERS = 4;
/** Modes a room can be created with today: the competition and role co-op (sector co-op comes later). */
export const OPEN_ROOM_MODES: RoomMode[] = ['race', 'role'];
/** Modes that share one shift over the room's command log (src/sim/coop.ts). */
export const COOP_ROOM_MODES: RoomMode[] = ['role'];
export const isCoopMode = (mode: RoomMode): boolean => COOP_ROOM_MODES.includes(mode);

/** What the host chooses in the lobby. */
export interface RoomOptions {
  regionId: RegionId;
  /** A sector of the prefecture, or '' for the whole prefecture. */
  sector: string;
  difficulty: Difficulty;
  hours: number;
  slot: RoomSlot;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  regionId: 'pohja',
  sector: 'pohja-kesklinn',
  difficulty: 'normal',
  hours: 3,
  slot: 'evening',
};

/** The started room's shift: the options plus what the server decided at the start. */
export interface RoomShift {
  code: string;
  seed: number;
  /** 'YYYY-MM-DD', the room's start day in Tallinn. */
  day: string;
  options: RoomOptions;
}

/** Game start of a room's shift: its day at an hour of the chosen part of the day, picked by the seed. */
export function roomStart(shift: Pick<RoomShift, 'seed' | 'day' | 'options'>): number {
  const p = parseDate(shift.day);
  if (!p) throw new Error(`roomStart: bad day ${shift.day}`);
  const hour = new Rng(shift.seed ^ 0x51ab || 1).pick(SLOT_HOURS[shift.options.slot]);
  return tallinnTime(p.y, p.m, p.d, hour, 0);
}

/** Shift options of a started room for a player: the same for every player of the room. */
export function roomShiftOptions(shift: RoomShift, playerName: string): NewShiftOptions {
  const o = shift.options;
  return {
    seed: shift.seed,
    regionId: o.regionId,
    mode: 'free',
    difficulty: o.difficulty,
    start: roomStart(shift),
    hours: o.hours,
    playerName,
    ...(o.sector ? { sectors: [o.sector] } : {}),
    fixedSchedule: true,
  };
}

/** sim.flags key of a room run: the room's code. */
export const ROOM_FLAG = 'room';

export function markRoom(sim: Pick<SimState, 'flags'>, code: string): void {
  sim.flags[ROOM_FLAG] = code;
}

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** A room code as typed (any case, spaces or a dash in the middle), or null when it cannot be one. */
export function normalizeRoomCode(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const code = v.replace(/[\s-]/g, '').toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/** The room code of a room run, or null for any other shift. */
export function roomCodeOf(sim: Pick<SimState, 'flags'> | null | undefined): string | null {
  return normalizeRoomCode(sim?.flags?.[ROOM_FLAG]);
}

/** The code shown to people: two groups of three ("K7M 2QX"). */
export function displayRoomCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
