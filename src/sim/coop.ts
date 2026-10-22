/**
 * Mitmikmängu ühisvahetus (co-op, docs/MULTIPLAYER.md sections 4 and 5): deterministic lockstep over a command log
 * that the server orders. Every client runs the same shift from the same seed; every input that changes shared
 * state is a log command that takes effect at a fixed turn; the same commands at the same turns give the same
 * state everywhere. This module is pure: the turn loop, the commands with their permission matrix, the per-seat
 * counters and the state digest that detects drift. No store, no network, no clock.
 *
 * A turn is one second of real time. Its game length follows from shared state only (the speed the host set and
 * the 112 slow-down), and it is stepped in TURN_PIECES equal pieces, so the substep boundaries fall on the same
 * game instants on every client and the map can still move twenty times a second.
 */
import {
  closeIncident as cClose,
  acknowledge as cAck,
  answerCall,
  askCall,
  correctQuery,
  dispatchUnits,
  endCall,
  markChecked,
  pursuitAction,
  recallUnit,
  replyRadio,
  requestAgency,
  setPriority,
  setUnitBreak,
  toggleInterpreter,
} from './commands';
import {
  answerDeskHandover,
  answerLend,
  callDesk,
  defaultDesk,
  deskDigest,
  deskRows,
  incidentDesk,
  initDesks,
  msgDesk,
  requestLend,
  seatDesk,
  syncDeskSeats,
  tickLends,
  unitDesk,
  type DeskRow,
  type DeskState,
} from './desks';
import { emit } from './internal';
import { searchPersons, searchVehicles } from './registry';
import { hashString } from './rng';
import { updateShiftScore } from './scoring';
import { step } from './engine';
import type { Agency, CallQuestionId, Priority, ShiftReport, SimState, Text } from './types';

const T = (et: string, en: string): Text => ({ et, en });

/** Game seconds per real second for each speed step (index 0 = paused). The single-player store uses the same. */
export const TURN_SPEEDS = [0, 15, 30, 60, 120] as const;
/** Game seconds per real second while a 112 call rings or is in progress. */
export const CALL_SPEED = 2;
/** Real length of a turn (ms). */
export const TURN_MS = 1000;
/** A turn is stepped in this many equal pieces (every turn length divides evenly). */
export const TURN_PIECES = 20;
/** Input delay: a command posted while the server is at turn T takes effect at T + this. */
export const INPUT_DELAY = 2;
/** Clients report their digest every this many turns. */
export const HASH_EVERY = 10;
/** The host uploads a snapshot every this many turns. */
export const SNAPSHOT_EVERY = 60;
/** Seat number of commands the server itself sequences (setup, seats leaving and coming back, host changes). */
export const SERVER_SEAT = -1;
const MAX_PINGS = 60;

// ── Roles ────────────────────────────────────────────────────────────────────

/**
 * Role co-op desks. `calls` (Kõnevastuvõtja) answers 112 and creates the incidents; `dispatch` (Dispetšer)
 * acknowledges, sets priorities, sends and recalls crews, closes incidents; `radio` (Raadio ja registrid) answers
 * the crews on the radio, gives breaks and runs the registry checks. With two players the dispatcher also holds the
 * radio; with four, two players may share a role (two dispatchers split the queue between them, two call-takers
 * split the ringing calls: whoever answers first takes the call).
 */
export type CoopRole = 'calls' | 'dispatch' | 'radio';
export const COOP_ROLES: CoopRole[] = ['calls', 'dispatch', 'radio'];
/** Who covers a role nobody present holds, in order. */
const FALLBACK: Record<CoopRole, CoopRole[]> = {
  calls: ['dispatch', 'radio'],
  dispatch: ['radio', 'calls'],
  radio: ['dispatch', 'calls'],
};
/** Default roles by seat: two players split calls and dispatch, a third takes the radio, a fourth dispatches too. */
export const DEFAULT_ROLES: CoopRole[] = ['dispatch', 'calls', 'radio', 'dispatch'];

export function isCoopRole(v: unknown): v is CoopRole {
  return typeof v === 'string' && (COOP_ROLES as string[]).includes(v);
}

export interface CoopSeat {
  seat: number;
  name: string;
  role: CoopRole;
  /** Sector co-op: the desk (sector id) the seat runs. Missing in role co-op. */
  desk?: string;
  /** False after `left` until `back`. */
  present: boolean;
}

/** What one seat did in the shift (the report's per-seat counters). */
export interface SeatStats {
  /** 112 calls answered. */
  calls: number;
  /** Incidents created from a call. */
  created: number;
  /** Calls closed without an incident (advice, referral, prank). */
  callsClosed: number;
  /** Incidents acknowledged. */
  acks: number;
  /** Crews sent. */
  sent: number;
  /** Radio replies. */
  radio: number;
  /** Incidents closed without units. */
  closed: number;
  /** Registry queries. */
  queries: number;
  /** Messages to the other seats. */
  pings: number;
  /** Commands accepted in all. */
  commands: number;
  /** Commands refused (not this seat's role, or nothing left to do). */
  denied: number;
  /** Sector co-op: crews this seat lent to a neighbour's incident. */
  lent: number;
  /** Sector co-op: neighbours' crews this seat's incidents got. */
  borrowed: number;
  /** Sector co-op: neighbours' incidents and colleagues' calls for help this seat's crews reached. */
  helped: number;
  /** Sector co-op: pursuits handed over to a neighbour's desk, and taken over from one. */
  handover: number;
  takeover: number;
}

export interface CoopPing {
  id: number;
  seat: number;
  /** Game time. */
  t: number;
  turn: number;
  text: string;
}

export type CoopMode = 'role' | 'sector';

export interface CoopState {
  code: string;
  /** 'role': one area, the roles split. 'sector': each seat runs one sector's desk (src/sim/desks.ts). */
  mode: CoopMode;
  /** The last completed turn (-1 before the first). */
  turn: number;
  /** Speed index into TURN_SPEEDS (0 = paused). */
  speed: number;
  host: number;
  seats: CoopSeat[];
  stats: Record<string, SeatStats>;
  pings: CoopPing[];
  /** Id of the last log command applied. */
  lastCmd: number;
  /** Call id: the seat that answered it. */
  callSeat: Record<string, number>;
  /** Sector co-op: the desks, who owns what, lend requests (src/sim/desks.ts). Missing in role co-op. */
  sec?: DeskState;
}

/** One command of the server's log. */
export interface LogCmd {
  id: number;
  /** Turn it takes effect at (applied at the start of that turn, in id order). */
  t: number;
  /** Seat that issued it, SERVER_SEAT for the server's own. */
  s: number;
  k: string;
  a: unknown[];
}

/** A command as a client issues it, before the server orders it. */
export interface CoopCommand {
  k: string;
  a: unknown[];
}

export function emptySeatStats(): SeatStats {
  return {
    calls: 0,
    created: 0,
    callsClosed: 0,
    acks: 0,
    sent: 0,
    radio: 0,
    closed: 0,
    queries: 0,
    pings: 0,
    commands: 0,
    denied: 0,
    lent: 0,
    borrowed: 0,
    helped: 0,
    handover: 0,
    takeover: 0,
  };
}

/**
 * Turn a fresh room shift into a co-op one (before turn 0, before any command). A sector room passes its desks: the
 * crews get their desks and the AI colleagues their stream (src/sim/desks.ts).
 */
export function initCoop(
  s: SimState,
  code: string,
  mode: CoopMode = 'role',
  desks: readonly string[] = [],
): CoopState {
  const c: CoopState = {
    code,
    mode: mode === 'sector' && desks.length ? 'sector' : 'role',
    turn: -1,
    speed: 1,
    host: 0,
    seats: [],
    stats: {},
    pings: [],
    lastCmd: 0,
    callSeat: {},
  };
  s.coop = c;
  if (c.mode === 'sector') c.sec = initDesks(s, desks);
  return c;
}

export const isCoop = (s: Pick<SimState, 'coop'> | null | undefined): boolean => !!s?.coop;

function seatOf(c: CoopState, seat: number): CoopSeat | undefined {
  return c.seats.find((x) => x.seat === seat);
}

/**
 * Present seats that hold a role, after the fallback when nobody present holds it. In sector co-op every present seat
 * does all of its own desk's work (the desk check in applyCommand narrows it to the desk's incidents and crews).
 */
export function roleHolders(c: CoopState, role: CoopRole): number[] {
  const present = c.seats.filter((x) => x.present);
  if (c.mode === 'sector') return present.map((x) => x.seat);
  for (const r of [role, ...FALLBACK[role]]) {
    const holders = present.filter((x) => x.role === r).map((x) => x.seat);
    if (holders.length) return holders;
  }
  return [];
}

/** Roles a seat covers right now: its own plus those it took over. */
export function rolesOf(c: CoopState, seat: number): CoopRole[] {
  return COOP_ROLES.filter((r) => roleHolders(c, r).includes(seat));
}

export function canAct(c: CoopState, seat: number, role: CoopRole): boolean {
  return seat === SERVER_SEAT || roleHolders(c, role).includes(seat);
}

// ── Commands ─────────────────────────────────────────────────────────────────

type Need = CoopRole | 'any' | 'host' | 'system';

/** The permission matrix: which role a command needs. */
export const COMMAND_ROLE: Record<string, Need> = {
  answer: 'calls',
  ask: 'calls',
  interp: 'calls',
  endcall: 'calls',
  ack: 'dispatch',
  prio: 'dispatch',
  send: 'dispatch',
  recall: 'dispatch',
  close: 'dispatch',
  agency: 'dispatch',
  pursuit: 'dispatch',
  reply: 'radio',
  break: 'radio',
  check: 'radio',
  lend: 'dispatch',
  lendans: 'dispatch',
  q: 'any',
  ping: 'any',
  speed: 'host',
  end: 'host',
  setup: 'system',
  left: 'system',
  back: 'system',
  host: 'system',
};

/**
 * Registry work is everybody's (2.23.1): any player present may answer a crew's registry query and mark a record
 * as checked, whatever their role or desk, so a friend can step in for the busy one.
 */
export function openToAll(s: Pick<SimState, 'radio'>, cmd: Pick<LogCmd, 'k' | 'a'>): boolean {
  if (cmd.k === 'check') return true;
  if (cmd.k !== 'reply') return false;
  const id = Array.isArray(cmd.a) ? str(cmd.a[0]) : '';
  return s.radio.find((m) => m.id === id)?.kind === 'query';
}

/** Kinds a player may post (the server refuses the rest). */
export const PLAYER_KINDS = Object.keys(COMMAND_ROLE).filter((k) => COMMAND_ROLE[k] !== 'system');

export interface CmdResult {
  ok: boolean;
  /** Refused by the permission matrix. */
  denied?: boolean;
  reason?: Text;
}

const AGENCIES: Agency[] = [
  'kiirabi',
  'paaste',
  'keskkonnaamet',
  'kapo',
  'kov',
  'sotsiaal',
  'merepaaste',
  'tolliamet',
  'transpordiamet',
  'veterinaar',
];
const QUESTIONS: CallQuestionId[] = [
  'where',
  'what',
  'injured',
  'weapons',
  'suspect',
  'vehicle',
  'direction',
  'count',
  'when',
  'name',
  'safe',
  'children',
  'intoxicated',
];
const str = (v: unknown, max = 64): string => (typeof v === 'string' ? v.slice(0, max) : '');
const prio = (v: unknown): Priority | undefined => (v === 1 || v === 2 || v === 3 || v === 4 ? v : undefined);
const agency = (v: unknown): Agency | undefined =>
  AGENCIES.includes(v as Agency) ? (v as Agency) : undefined;

function statsOf(c: CoopState, seat: number): SeatStats {
  const k = String(seat);
  return (c.stats[k] ??= emptySeatStats());
}

const DENIED: CmdResult = {
  ok: false,
  denied: true,
  reason: T('See ei ole sinu rolli ülesanne.', 'That is not your role’s task.'),
};
const DESK_DENIED: CmdResult = {
  ok: false,
  denied: true,
  reason: T(
    'See on naaberlaua oma. Ekipaaži saab laenata palvega.',
    'That belongs to a neighbouring desk. A crew can be lent on request.',
  ),
};
const NOOP: CmdResult = { ok: false };

/** The answering seat of a call, if it is still present (a call-taker who left frees their calls). */
function callOwner(c: CoopState, callId: string): number | undefined {
  const seat = c.callSeat[callId];
  return seat !== undefined && seatOf(c, seat)?.present ? seat : undefined;
}

/**
 * Apply one log command to the shared state. Every client applies the same commands in the same order and rejects
 * a forbidden one identically. Never throws: a broken command is refused.
 */
export function applyCommand(s: SimState, cmd: LogCmd): CmdResult {
  const c = s.coop;
  if (!c) return NOOP;
  if (cmd.id > c.lastCmd) c.lastCmd = cmd.id;
  const role = COMMAND_ROLE[cmd.k];
  if (!role) return NOOP;
  const open = role !== 'system' && openToAll(s, cmd);
  const need: Need = open ? 'any' : role;
  const seat = cmd.s;
  if (need === 'system' && seat !== SERVER_SEAT) return DENIED;
  if (s.ended && need !== 'system') return NOOP;
  const known = seat === SERVER_SEAT || !!seatOf(c, seat);
  if (!known) return DENIED;
  if (need === 'host' && seat !== c.host) return countDenied(c, seat);
  if (need !== 'any' && need !== 'host' && need !== 'system' && !canAct(c, seat, need))
    return countDenied(c, seat);
  if (c.mode === 'sector' && seat !== SERVER_SEAT && !open && !deskAllows(s, c, cmd)) {
    statsOf(c, seat).denied++;
    return DESK_DENIED;
  }
  let r: CmdResult;
  try {
    r = run(s, c, cmd);
  } catch (err) {
    console.warn('[EPD coop] command failed', cmd.k, err);
    r = NOOP;
  }
  if (seat !== SERVER_SEAT && r.ok) statsOf(c, seat).commands++;
  return r;
}

function countDenied(c: CoopState, seat: number): CmdResult {
  if (seat !== SERVER_SEAT) statsOf(c, seat).denied++;
  return DENIED;
}

/**
 * Sector co-op's permission check (the role matrix's counterpart): a seat works its own desk's calls, incidents and
 * crews. Sending needs the incident and every crew to be the desk's (or a shared on-call asset); a neighbour's crew
 * comes only through `lend`. Recalling is open to the crew's desk and to the desk of the incident it works. A radio
 * message goes to its crew's or its incident's desk. Unknown targets pass here and are refused by the command itself.
 */
function deskAllows(s: SimState, c: CoopState, cmd: LogCmd): boolean {
  const a = Array.isArray(cmd.a) ? cmd.a : [];
  const mine = seatDesk(c, cmd.s);
  if (!mine) return COMMAND_ROLE[cmd.k] === 'any' || COMMAND_ROLE[cmd.k] === 'host';
  const own = (d: string) => d === mine;
  const incOk = (id: unknown) => {
    const inc = s.incidents[str(id)];
    return !inc || own(incidentDesk(s, inc, true));
  };
  switch (cmd.k) {
    case 'answer':
    case 'ask':
    case 'interp':
    case 'endcall': {
      const call = s.calls.find((x) => x.id === str(a[0]));
      return !call || own(callDesk(s, call));
    }
    case 'ack':
    case 'prio':
    case 'close':
    case 'agency':
    case 'pursuit':
    case 'check':
      return incOk(a[0]);
    case 'send': {
      if (!incOk(a[0])) return false;
      const ids = Array.isArray(a[1]) ? a[1] : [];
      return ids.every((id) => {
        const u = s.units[str(id)];
        if (!u) return true;
        const d = unitDesk(s, u);
        return d === '' || own(d);
      });
    }
    case 'recall':
    case 'break': {
      const u = s.units[str(a[0])];
      if (!u) return true;
      const d = unitDesk(s, u);
      if (d === '' || own(d)) return true;
      const inc = u.incidentId ? s.incidents[u.incidentId] : undefined;
      return cmd.k === 'recall' && !!inc && own(incidentDesk(s, inc, true));
    }
    case 'reply': {
      const msg = s.radio.find((m) => m.id === str(a[0]));
      if (!msg) return true;
      const d = msgDesk(s, msg);
      return d === '' || own(d);
    }
    default:
      return true;
  }
}

function run(s: SimState, c: CoopState, cmd: LogCmd): CmdResult {
  const a = Array.isArray(cmd.a) ? cmd.a : [];
  const seat = cmd.s;
  const st = () => statsOf(c, seat);
  switch (cmd.k) {
    // ── System (the server's own) ──
    case 'setup': {
      // [hostSeat, [[seat, role, name], ...]]
      const host = typeof a[0] === 'number' ? a[0] : 0;
      const list = Array.isArray(a[1]) ? a[1] : [];
      c.seats = [];
      for (const row of list) {
        if (!Array.isArray(row) || typeof row[0] !== 'number') continue;
        const n = row[0];
        if (n < 0 || n > 3 || c.seats.some((x) => x.seat === n)) continue;
        if (c.sec) {
          // Sector co-op: [seat, desk, name]; a desk the room does not have becomes the seat's default.
          const desk =
            typeof row[1] === 'string' && c.sec.desks.includes(row[1]) ? row[1] : defaultDesk(c.sec.desks, n);
          c.seats.push({
            seat: n,
            role: 'dispatch',
            desk,
            name: str(row[2], 40) || `#${n + 1}`,
            present: true,
          });
        } else
          c.seats.push({
            seat: n,
            role: isCoopRole(row[1]) ? row[1] : 'dispatch',
            name: str(row[2], 40) || `#${n + 1}`,
            present: true,
          });
        statsOf(c, n);
      }
      c.seats.sort((x, y) => x.seat - y.seat);
      c.host = host;
      syncDeskSeats(s);
      return { ok: true };
    }
    case 'left':
    case 'back': {
      const x = typeof a[0] === 'number' ? seatOf(c, a[0]) : undefined;
      if (!x) return NOOP;
      x.present = cmd.k === 'back';
      syncDeskSeats(s);
      return { ok: true };
    }
    case 'host': {
      if (typeof a[0] !== 'number' || !seatOf(c, a[0])) return NOOP;
      c.host = a[0];
      return { ok: true };
    }
    // ── Host ──
    case 'speed': {
      const i = a[0];
      if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= TURN_SPEEDS.length) return NOOP;
      c.speed = i;
      return { ok: true };
    }
    case 'end': {
      if (s.ended) return NOOP;
      s.ended = true;
      updateShiftScore(s);
      emit(s, { type: 'shift_end', text: T('Vahetus lõpetati', 'Shift ended') });
      return { ok: true };
    }
    // ── Anyone ──
    case 'ping': {
      const text = str(a[0], 140)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim();
      if (!text) return NOOP;
      const last = c.pings[c.pings.length - 1];
      c.pings.push({ id: (last?.id ?? 0) + 1, seat, t: s.now, turn: c.turn + 1, text });
      if (c.pings.length > MAX_PINGS) c.pings.splice(0, c.pings.length - MAX_PINGS);
      st().pings++;
      return { ok: true };
    }
    case 'q': {
      const q = str(a[1], 64);
      if (!q.trim()) return NOOP;
      if (a[0] === 'person') searchPersons(s, q);
      else if (a[0] === 'vehicle') searchVehicles(s, q);
      else return NOOP;
      st().queries++;
      return { ok: true };
    }
    // ── Kõnevastuvõtja ──
    case 'answer': {
      const id = str(a[0]);
      const call = s.calls.find((x) => x.id === id);
      if (!call || call.endedAt !== undefined || call.answeredAt !== undefined) return NOOP;
      answerCall(s, id);
      c.callSeat[id] = seat;
      st().calls++;
      return { ok: true };
    }
    case 'ask':
    case 'interp':
    case 'endcall': {
      const id = str(a[0]);
      const call = s.calls.find((x) => x.id === id);
      if (!call || call.endedAt !== undefined) return NOOP;
      const owner = callOwner(c, id);
      if (owner !== undefined && owner !== seat && seat !== SERVER_SEAT) return countDenied(c, seat);
      if (owner === undefined) {
        // Asking or deciding on a ringing call answers it.
        if (call.answeredAt === undefined) st().calls++;
        c.callSeat[id] = seat;
      }
      if (cmd.k === 'ask') {
        const q = a[1] as CallQuestionId;
        if (!QUESTIONS.includes(q)) return NOOP;
        askCall(s, id, q);
        return { ok: true };
      }
      if (cmd.k === 'interp') {
        toggleInterpreter(s, id);
        return { ok: true };
      }
      const action = a[1];
      if (action !== 'create' && action !== 'prank' && action !== 'refer' && action !== 'advice') return NOOP;
      const p = prio(a[2]);
      if (action === 'create' && !p) return NOOP;
      endCall(s, id, { action, priority: p, agency: agency(a[3]) });
      if (action === 'create') st().created++;
      else st().callsClosed++;
      return { ok: true };
    }
    // ── Dispetšer ──
    case 'ack': {
      const inc = s.incidents[str(a[0])];
      if (!inc || inc.state !== 'incoming') return NOOP;
      cAck(s, inc.id);
      st().acks++;
      return { ok: true };
    }
    case 'prio': {
      const p = prio(a[1]);
      if (!p || !s.incidents[str(a[0])]) return NOOP;
      setPriority(s, str(a[0]), p);
      return { ok: true };
    }
    case 'send': {
      const id = str(a[0]);
      const units = Array.isArray(a[1])
        ? a[1].filter((x): x is string => typeof x === 'string').slice(0, 12)
        : [];
      const inc = s.incidents[id];
      if (!inc || !units.length) return NOOP;
      const before = inc.assigned.length;
      const had = new Set(inc.assigned);
      const r = dispatchUnits(s, id, units);
      const after = s.incidents[id]?.assigned.length ?? before;
      if (r.ok) st().sent += Math.max(0, after - before);
      if (r.ok && c.sec)
        for (const u of s.incidents[id]?.assigned ?? []) if (!had.has(u)) c.sec.crew[u] = seat;
      return r;
    }
    case 'recall': {
      if (!s.units[str(a[0])]) return NOOP;
      recallUnit(s, str(a[0]));
      return { ok: true };
    }
    case 'close': {
      const inc = s.incidents[str(a[0])];
      const how = a[1];
      if (!inc || inc.state === 'closed') return NOOP;
      if (how !== 'referral' && how !== 'phone' && how !== 'duplicate' && how !== 'prank') return NOOP;
      cClose(s, inc.id, how, agency(a[2]));
      st().closed++;
      return { ok: true };
    }
    case 'agency': {
      const ag = agency(a[1]);
      if (!ag || !s.incidents[str(a[0])]) return NOOP;
      requestAgency(s, str(a[0]), ag);
      return { ok: true };
    }
    case 'pursuit': {
      const act = a[1];
      if (act !== 'terminate' && act !== 'heli' && act !== 'spikes') return NOOP;
      pursuitAction(s, str(a[0]), act);
      return { ok: true };
    }
    // ── Raadio ja registrid ──
    case 'reply': {
      const msgId = str(a[0]);
      const msg = s.radio.find((m) => m.id === msgId);
      if (!msg) return NOOP;
      // A correction of a registry answer (src/sim/fallout.ts).
      if (msg.answered) return correctQuery(s, msg, str(a[1])) ? (st().radio++, { ok: true }) : NOOP;
      // Sector co-op: a neighbouring player's offer to take over a pursuit.
      const handed = c.sec ? answerDeskHandover(s, c, msg, str(a[1]), seat) : null;
      if (handed) return handed;
      replyRadio(s, msgId, str(a[1]));
      if (msg.answered) st().radio++;
      return { ok: !!msg.answered };
    }
    case 'break': {
      if (!s.units[str(a[0])]) return NOOP;
      setUnitBreak(s, str(a[0]), a[1] === 1 || a[1] === true);
      return { ok: true };
    }
    case 'check': {
      const id = str(a[0]);
      if (!s.incidents[id]) return NOOP;
      const personId = str(a[1]);
      const plate = str(a[2]);
      markChecked(s, id, { personId: personId || undefined, plate: plate || undefined });
      return { ok: true };
    }
    // ── Sektorid: lending a crew across a border ──
    case 'lend': {
      if (!c.sec) return NOOP;
      return requestLend(s, c, seat, str(a[0]), str(a[1]));
    }
    case 'lendans': {
      if (!c.sec || typeof a[0] !== 'number') return NOOP;
      return answerLend(s, c, seat, a[0], a[1] === 1 || a[1] === true);
    }
    default:
      return NOOP;
  }
}

// ── Turns ────────────────────────────────────────────────────────────────────

/** True while a 112 call rings or is in progress (the game then runs near real time). */
export function callOpen(s: Pick<SimState, 'calls'>): boolean {
  return Array.isArray(s.calls) && s.calls.some((c) => !c.endedAt);
}

/** Game seconds per real second at a speed, with the 112 slow-down. Shared by the single-player loop and the turns. */
export function effectiveSpeed(s: Pick<SimState, 'calls'>, speed: number): number {
  return speed > CALL_SPEED && callOpen(s) ? CALL_SPEED : speed;
}

/** Game length of the next turn (ms), from shared state only. Divisible by TURN_PIECES for every speed. */
export function turnGameMs(s: SimState): number {
  const c = s.coop;
  if (!c || s.ended) return 0;
  const speed = TURN_SPEEDS[c.speed] ?? 0;
  return effectiveSpeed(s, speed) * TURN_MS;
}

/** The commands of one turn, in the order they apply. */
export function commandsOfTurn(log: LogCmd[], turn: number): LogCmd[] {
  return log.filter((x) => x.t === turn).sort((x, y) => x.id - y.id);
}

export interface TurnPlan {
  turn: number;
  /** Game ms of the turn. */
  gameMs: number;
  /** Results of the turn's commands, by command id. */
  results: Map<number, CmdResult>;
}

/**
 * Start the next turn: apply its commands (they must be every command of that turn, in id order) and fix the turn's
 * game length. Then step it with stepPiece() TURN_PIECES times, or run it whole with runTurn().
 */
export function beginTurn(s: SimState, cmds: LogCmd[]): TurnPlan {
  const c = s.coop!;
  const turn = c.turn + 1;
  const results = new Map<number, CmdResult>();
  for (const cmd of cmds) {
    if (cmd.t !== turn || cmd.id <= c.lastCmd) continue;
    results.set(cmd.id, applyCommand(s, cmd));
  }
  if (c.sec && !s.ended) tickLends(s, c, turn);
  return { turn, gameMs: turnGameMs(s), results };
}

/** Step one of the turn's pieces. `piece` is 0..TURN_PIECES-1; the last one closes the turn. */
export function stepPiece(s: SimState, plan: TurnPlan, piece: number): void {
  const h = plan.gameMs / TURN_PIECES;
  if (h > 0) step(s, h);
  if (piece >= TURN_PIECES - 1) s.coop!.turn = plan.turn;
}

/**
 * A server-run shift (docs/MULTIPLAYER.md section 9): one piece of real time. The server applies a player's command
 * the moment it arrives (applyCommand) and steps a twentieth of a turn here, its game length taken from the state as
 * it is now, so a command, a new speed or an answered call counts from the next piece. `piece` is
 * 0..TURN_PIECES-1: lend requests age at the first piece of a turn, as in beginTurn, and the last piece closes it.
 */
export function livePiece(s: SimState, piece: number): void {
  const c = s.coop;
  if (!c) return;
  if (piece === 0 && c.sec && !s.ended) tickLends(s, c, c.turn + 1);
  const h = turnGameMs(s) / TURN_PIECES;
  if (h > 0) step(s, h);
  if (piece >= TURN_PIECES - 1) c.turn += 1;
}

/** A whole turn at once (catching up, tests). */
export function runTurn(s: SimState, cmds: LogCmd[]): TurnPlan {
  const plan = beginTurn(s, cmds);
  for (let i = 0; i < TURN_PIECES; i++) stepPiece(s, plan, i);
  return plan;
}

// ── Digest ───────────────────────────────────────────────────────────────────

function fnv(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const sec = (v: number | undefined): string =>
  typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v / 1000)) : '-';

/**
 * Canonical digest of the shared state, as 16 hex digits: the random streams, the clock, the counters, every
 * incident with its state, priority and crews, every unit with its status and arrival time to the second, the calls
 * and the stats. Floating point values are rounded, so tiny engine differences do not raise false alarms; the
 * resync repairs real drift (docs/MULTIPLAYER.md, 4.2).
 */
export function simDigest(s: SimState): string {
  const parts: string[] = [];
  const q = s.seq;
  parts.push(
    `${s.rng}|${s.spawnRng ?? '-'}|${s.now}|${s.ended ? 1 : 0}|${q.incident}.${q.radio}.${q.person}.${q.call}.${q.bulletin}|${sec(s.nextSpawnAt)}|${Math.round(s.trust * 10)}`,
  );
  const desks = s.coop?.sec;
  for (const id of s.incidentOrder) {
    const inc = s.incidents[id];
    if (!inc) continue;
    parts.push(
      `${id}:${inc.state}:${inc.priority}:${inc.assigned.join(',')}:${sec(inc.closedAt)}${desks ? `:${desks.incDesk[id] ?? ''}` : ''}`,
    );
  }
  for (const id of s.unitOrder) {
    const u = s.units[id];
    if (!u) continue;
    parts.push(`${id}:${u.status}:${u.incidentId ?? ''}:${sec(u.move?.arriveAt)}`);
  }
  for (const call of s.calls)
    parts.push(`${call.id}:${sec(call.answeredAt)}:${sec(call.endedAt)}:${call.asked.length}`);
  const st = s.stats;
  parts.push(
    [
      st.incidents,
      st.closed,
      st.arrests,
      st.escaped,
      st.expired,
      st.callsAnswered,
      st.callsMissed,
      st.referralsCorrect,
      st.referralsWrong,
      st.repliesCorrect,
      st.repliesWrong,
      st.queries,
      st.pursuits,
      st.pursuitsCaught,
    ].join('.'),
  );
  parts.push(`r${s.radio.length}`);
  const c = s.coop;
  if (c) {
    parts.push(
      `${c.turn}|${c.speed}|${c.host}|${c.lastCmd}|${c.seats.map((x) => `${x.seat}${x.role}${x.desk ?? ''}${x.present ? 1 : 0}`).join(',')}|${c.pings.length}`,
    );
    for (const k of Object.keys(c.stats).sort()) {
      const v = c.stats[k];
      parts.push(
        `${k}:${v.calls}.${v.created}.${v.callsClosed}.${v.acks}.${v.sent}.${v.radio}.${v.closed}.${v.queries}.${v.pings}.${v.commands}.${v.denied}` +
          (c.sec ? `.${v.lent}.${v.borrowed}.${v.helped}.${v.handover}.${v.takeover}` : ''),
      );
    }
    if (c.sec) parts.push(deskDigest(c.sec));
  }
  const all = parts.join('\n');
  return (
    fnv(all, 0x811c9dc5).toString(16).padStart(8, '0') +
    hashString(`${all.length}:${all}`).toString(16).padStart(8, '0')
  );
}

// ── Report and XP ────────────────────────────────────────────────────────────

/** The co-op part of a report: who sat where and what each seat did. */
export interface CoopReport {
  code: string;
  /** Missing in reports from before sector co-op: role co-op. */
  mode?: CoopMode;
  seats: { seat: number; name: string; role: CoopRole; desk?: string; present: boolean; stats: SeatStats }[];
  host: number;
  /** Sector co-op: one row per desk (src/sim/desks.ts deskRows). */
  desks?: DeskRow[];
}

export function coopReport(s: SimState): CoopReport | undefined {
  const c = s.coop;
  if (!c) return undefined;
  return {
    code: c.code,
    host: c.host,
    ...(c.sec ? { mode: 'sector' as const, desks: deskRows(s) } : {}),
    seats: c.seats.map((x) => ({
      seat: x.seat,
      name: x.name,
      role: x.role,
      ...(x.desk ? { desk: x.desk } : {}),
      present: x.present,
      stats: { ...emptySeatStats(), ...c.stats[String(x.seat)] },
    })),
  };
}

/** Points of a seat's own work for the XP share. */
export function seatWork(v: SeatStats): number {
  return (
    v.calls * 2 +
    v.created * 3 +
    v.callsClosed * 2 +
    v.acks +
    v.sent * 2 +
    v.radio * 2 +
    v.closed * 2 +
    Math.min(20, v.queries) +
    (v.lent ?? 0) * 2 +
    (v.helped ?? 0) * 3 +
    (v.handover ?? 0) +
    (v.takeover ?? 0) * 2
  );
}

/**
 * A player's XP from a co-op shift: the team's XP plus a share for their own work (at most half the team's XP).
 * The same for every client, since every client holds the same report.
 */
export function coopXp(report: Pick<ShiftReport, 'xp'>, seat: SeatStats | undefined): number {
  const team = Math.max(0, Math.round(report.xp));
  const own = seat ? Math.min(Math.round(team / 2), seatWork(seat)) : 0;
  return team + own;
}

/** Profile key of a co-op shift's XP, so it is paid once per room (CareerProfile.paidShifts). */
export const coopPaidKey = (code: string): string => `room:${code}`;
