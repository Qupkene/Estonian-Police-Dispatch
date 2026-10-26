/**
 * Ühine raport (2.36.0, docs/MULTIPLAYER.md section 14): the joint report of a co-op shift. The seats' awards
 * (Päeva kangelane, Kiireim käsi, Abivalmis naaber, Raudne närv and, in jest, Tigu), the summary a room keeps of
 * each co-op round for its history, and the strict reader of a summary that came back from the server. Pure.
 */
import { COOP_ROLES, seatWork, type CoopReport, type CoopReportSeat, type SeatStats } from './coop';
import type { DeskRow } from './desks';
import type { CoopMoment, CoopMomentKind, IncidentMoment, ReportMoment } from './moments';
import type { Difficulty, RegionId, ShiftReport, Text } from './types';

// ── Awards ───────────────────────────────────────────────────────────────────

export type AwardId = 'hero' | 'fastest' | 'helper' | 'nerve' | 'snail';
/** In the order the report shows them. */
export const AWARD_IDS: AwardId[] = ['hero', 'fastest', 'helper', 'nerve', 'snail'];

export interface Award {
  id: AwardId;
  seat: number;
  /** What won it: work points, the average ms to the first crew, help points, the most urgent incidents. */
  value: number;
}

/** First crews a seat must have sent before its speed counts for an award. */
export const SPEED_MIN = 3;
/** Tigu goes only to a seat this many times slower than the fastest (between equals it is no joke). */
const SNAIL_GAP = 1.25;

/** A seat's average game ms from an incident's appearance to its first crew, or null before any. */
export function avgResponse(st: Pick<SeatStats, 'respSum' | 'respN'>): number | null {
  return st.respN ? Math.round((st.respSum ?? 0) / st.respN) : null;
}

/**
 * Help points: in sector co-op crews lent to a neighbour, a neighbour's incidents and calls for help reached,
 * pursuits handed over and taken over, empty desks taken over; in role co-op the crews' radio answered and the
 * registry checks run for them.
 */
export function helpPoints(mode: CoopReport['mode'], st: SeatStats): number {
  return mode === 'sector'
    ? st.lent * 2 + st.helped * 3 + st.handover + st.takeover + (st.took ?? 0) * 3
    : st.radio + st.queries;
}

/** The seat with the best value (the higher, or with `low` the lower), the more incidents worked on breaking a tie. */
function best(
  seats: readonly CoopReportSeat[],
  value: (x: CoopReportSeat) => number | null,
  low = false,
): { seat: number; value: number } | null {
  let top: { seat: number; value: number; worked: number } | null = null;
  for (const x of seats) {
    const v = value(x);
    if (v === null || !Number.isFinite(v)) continue;
    const worked = x.worked ?? 0;
    const better = !top || (low ? v < top.value : v > top.value) || (v === top.value && worked > top.worked);
    if (better) top = { seat: x.seat, value: v, worked };
  }
  return top && { seat: top.seat, value: top.value };
}

/**
 * The awards of a co-op shift, for two players or more. One seat may win several; an award nobody earned is left
 * out (nobody sent a crew to a truly urgent incident: no Raudne närv).
 */
export function coopAwards(coop: Pick<CoopReport, 'mode' | 'seats'>): Award[] {
  const seats = coop.seats;
  if (seats.length < 2) return [];
  const out: Award[] = [];
  const add = (id: AwardId, w: { seat: number; value: number } | null) => {
    if (w) out.push({ id, ...w });
  };
  const work = (x: CoopReportSeat) => {
    const v = seatWork(x.stats);
    return v > 0 ? v : null;
  };
  const speed = (x: CoopReportSeat) => ((x.stats.respN ?? 0) >= SPEED_MIN ? avgResponse(x.stats) : null);
  add('hero', best(seats, work));
  const fastest = best(seats, speed, true);
  add('fastest', fastest);
  add(
    'helper',
    best(seats, (x) => helpPoints(coop.mode, x.stats) || null),
  );
  add(
    'nerve',
    best(seats, (x) => x.p1 || null),
  );
  const timed = seats.filter((x) => speed(x) !== null);
  const snail = timed.length >= 2 ? best(seats, speed) : null;
  if (snail && fastest && snail.seat !== fastest.seat && snail.value >= fastest.value * SNAIL_GAP)
    add('snail', snail);
  return out;
}

// ── The summary a room keeps of a co-op round ────────────────────────────────

/** A co-op round as the room's history shows it again: the team's result and the joint report. */
export interface RoomSummary {
  v: 1;
  regionId: RegionId;
  difficulty: Difficulty;
  /** Game times of the shift. */
  start: number;
  end: number;
  score: number;
  grade: ShiftReport['grade'];
  incidents: number;
  arrests: number;
  /** The team's XP (a seat's own is coopXp of it). */
  xp: number;
  coop: CoopReport;
}

/** The summary of a co-op shift's report, or null for any other shift. */
export function roomSummary(r: ShiftReport): RoomSummary | null {
  if (!r.coop) return null;
  return {
    v: 1,
    regionId: r.regionId,
    difficulty: r.difficulty,
    start: Math.round(r.start),
    end: Math.round(r.end),
    score: Math.max(0, Math.min(100, Math.round(r.score))),
    grade: r.grade,
    incidents: r.stats?.incidents ?? 0,
    arrests: r.stats?.arrests ?? 0,
    xp: Math.max(0, Math.round(r.xp)),
    coop: { ...r.coop, mode: r.coop.mode ?? 'role' },
  };
}

// ── Reading a summary back (it comes from the server: trust nothing) ─────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const REGIONS: RegionId[] = ['pohja', 'ida', 'louna', 'laane'];
const DIFFICULTIES: Difficulty[] = ['cadet', 'normal', 'veteran', 'realistic'];
const GRADES: ShiftReport['grade'][] = ['S', 'A', 'B', 'C', 'D', 'F'];
const MOMENT_KINDS: (CoopMomentKind | IncidentMoment['k'])[] = [
  'lend',
  'take',
  'give',
  'left',
  'back',
  'handover',
  'crisis',
  'cesc',
  'clead',
  'cdec',
  'cend',
  'good',
  'bad',
];
const STAT_KEYS: (keyof SeatStats)[] = [
  'calls',
  'created',
  'callsClosed',
  'acks',
  'sent',
  'radio',
  'closed',
  'queries',
  'pings',
  'commands',
  'denied',
  'lent',
  'borrowed',
  'helped',
  'handover',
  'takeover',
  'took',
  'respSum',
  'respN',
];
const DESK_NUMS = [
  'incidents',
  'closed',
  'calls',
  'sent',
  'lent',
  'borrowed',
  'helped',
  'handover',
  'taken',
] as const;

/** A whole number in range, else `d`. */
function int(v: unknown, min: number, max: number, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : d;
}
/** Text without control characters, at most `max` long; null when not a string. */
function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
}
function text(v: unknown, max: number): Text | null {
  if (!isObj(v)) return null;
  const et = str(v.et, max);
  const en = str(v.en, max);
  return et === null || en === null ? null : { et, en };
}
const seatNo = (v: unknown, other = false): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= (other ? -1 : 0) && v <= 3 ? v : null;
const sectorId = (v: unknown): string | undefined => {
  const s = str(v, 60);
  return s && /^[a-z]+-[a-z0-9-]+$/.test(s) ? s : undefined;
};

function readStats(v: unknown): SeatStats {
  const o = isObj(v) ? v : {};
  const out = {} as Record<keyof SeatStats, number>;
  for (const k of STAT_KEYS) out[k] = int(o[k], 0, k === 'respSum' ? 1e10 : 100000);
  return out as SeatStats;
}

function readSeat(v: unknown): CoopReportSeat | null {
  if (!isObj(v)) return null;
  const seat = seatNo(v.seat);
  const name = str(v.name, 40);
  if (seat === null || !name) return null;
  const role = COOP_ROLES.find((r) => r === v.role) ?? 'dispatch';
  const desk = sectorId(v.desk);
  return {
    seat,
    name,
    role,
    ...(desk ? { desk } : {}),
    present: v.present !== false,
    stats: readStats(v.stats),
    worked: int(v.worked, 0, 100000),
    p1: int(v.p1, 0, 100000),
  };
}

function readDesk(v: unknown): DeskRow | null {
  if (!isObj(v)) return null;
  const desk = sectorId(v.desk);
  if (!desk) return null;
  const seats = (Array.isArray(v.seats) ? v.seats : [])
    .map((x) => seatNo(x))
    .filter((x): x is number => x !== null);
  const takenBy = (Array.isArray(v.takenBy) ? v.takenBy : [])
    .map((x) => seatNo(x))
    .filter((x): x is number => x !== null);
  const row = {
    desk,
    seats: [...new Set(seats)],
    colleague: str(v.colleague, 60) ?? '',
    takenBy: [...new Set(takenBy)],
  };
  const nums = Object.fromEntries(DESK_NUMS.map((k) => [k, int(v[k], 0, 100000)])) as Record<
    (typeof DESK_NUMS)[number],
    number
  >;
  return { ...row, ...nums };
}

function readMoment(v: unknown): ReportMoment | null {
  if (!isObj(v)) return null;
  const k = MOMENT_KINDS.find((x) => x === v.k);
  const t = int(v.t, 0, 1e15, -1);
  if (!k || t < 0) return null;
  if (k === 'good' || k === 'bad') {
    const title = text(v.title, 160);
    const body = text(v.text, 400);
    if (!title || !body) return null;
    const seats = (Array.isArray(v.seats) ? v.seats : [])
      .map((x) => seatNo(x))
      .filter((x): x is number => x !== null);
    return { t, k, seats: [...new Set(seats)], title, text: body };
  }
  const seat = seatNo(v.seat, true);
  if (seat === null) return null;
  const other = seatNo(v.other, true);
  const desk = sectorId(v.desk);
  const to = sectorId(v.to);
  const unit = str(v.unit, 24);
  const m: CoopMoment = { t, k, seat };
  if (other !== null) m.other = other;
  if (desk) m.desk = desk;
  if (to) m.to = to;
  if (unit) m.unit = unit;
  // A crisis moment (2.37.0): its scenario, task, decision and result.
  const crisis = str(v.crisis, 24);
  const task = str(v.task, 24);
  const option = str(v.option, 49);
  if (crisis && /^[a-z]+$/.test(crisis)) m.crisis = crisis;
  if (task && /^[a-z_]+$/.test(task)) m.task = task;
  if (option && /^[a-z_]+:[a-z_]+$/.test(option)) m.option = option;
  if (typeof v.n === 'number') m.n = int(v.n, 0, 100);
  return m;
}

/** A summary from the server, checked field by field, or null when it is not one. */
export function parseRoomSummary(v: unknown): RoomSummary | null {
  if (!isObj(v) || v.v !== 1 || !isObj(v.coop)) return null;
  const c = v.coop;
  const seats = (Array.isArray(c.seats) ? c.seats.slice(0, 4) : [])
    .map(readSeat)
    .filter((x): x is CoopReportSeat => !!x)
    .filter((x, i, all) => all.findIndex((y) => y.seat === x.seat) === i);
  if (!seats.length) return null;
  const sector = c.mode === 'sector';
  const desks = sector
    ? (Array.isArray(c.desks) ? c.desks.slice(0, 4) : []).map(readDesk).filter((x): x is DeskRow => !!x)
    : [];
  const moments = (Array.isArray(c.moments) ? c.moments.slice(0, 40) : [])
    .map(readMoment)
    .filter((x): x is ReportMoment => !!x);
  return {
    v: 1,
    regionId: REGIONS.find((r) => r === v.regionId) ?? 'pohja',
    difficulty: DIFFICULTIES.find((d) => d === v.difficulty) ?? 'normal',
    start: int(v.start, 0, 1e15),
    end: int(v.end, 0, 1e15),
    score: int(v.score, 0, 100),
    grade: GRADES.find((g) => g === v.grade) ?? 'F',
    incidents: int(v.incidents, 0, 100000),
    arrests: int(v.arrests, 0, 100000),
    xp: int(v.xp, 0, 1000000),
    coop: {
      code: str(c.code, 12) ?? '',
      host: seatNo(c.host) ?? 0,
      ...(sector ? { mode: 'sector' as const, desks } : { mode: 'role' as const }),
      seats,
      moments,
    },
  };
}
