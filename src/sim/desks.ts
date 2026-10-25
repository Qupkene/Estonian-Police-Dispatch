/**
 * Sektorite koostöö (sector co-op, mode a, docs/MULTIPLAYER.md section 8): one shared shift over the room's command
 * log (src/sim/coop.ts), each player at the desk of one sector of the same prefecture. This module holds what the
 * desks add to the lockstep core, all of it pure and deterministic:
 *
 * - Ownership: every incident, 112 call and crew belongs to a desk (DeskState.incDesk, unitDesk). A crew belongs to
 *   the desk whose sector lists its station; the prefecture's on-call assets (K-komando, helicopter) are shared.
 * - Lines: each desk has its own 112 line (`deskLineBusy`), so two desks can talk to callers at once.
 * - Lending: a crew crosses a border only by a request the other desk answers (`lend`, `lendans`). The incident's
 *   desk asks for a neighbour's crew, or a desk offers its own crew to a neighbour's incident.
 * - Help: a crew that reaches a neighbour's incident (lent) or a colleague's call for help counts in its seat's
 *   `helped`, like the single-player AI colleague help.
 * - Hand-over: a pursuit that runs into another player's sector is offered to that desk with the colleague
 *   hand-over prompt; handing over moves the incident to the neighbour's queue, the crews stay on it.
 * - Desks nobody holds (never taken, or the player left): run by the existing AI colleague logic. Their colleague
 *   takes their calls and incidents back (closed as `colleague`, out of the counts), asks the players' desks for help
 *   now and then (src/sim/colleagues.ts with `ColleagueState.area` = the held desks), never uses a player's crew and
 *   lends its own idle crews when asked. It also answers its desk's crews on events they already work (2.34.0): the
 *   best option of a decision, the agency they ask for, the true registry answer, the backup they need.
 * - Taking over (2.34.0): a player may take a desk nobody holds (`take`). Its crews and open events then run under
 *   the player's own desk (`merged`), so every list, line and permission treats them as theirs; `give` hands it
 *   back to the colleague, and the desk's own player coming back gets it back at once.
 *
 * Never imported by single player: everything is reached through `s.coop.sec`, which only a sector room has.
 */
import { REGIONS } from '@/data/regions';
import { COLLEAGUES } from '@/data/sectors';
import { dispatchUnits, replyRadio } from './commands';
import { colleagueName, deskCallsign, HANDOVER_REPLIES, helpSector, newColleagueState } from './colleagues';
import { haversineKm } from './geo';
import { closeByColleague, colleagueAnswer, openIncidentIds } from './incidents';
import { addTimeline, pushRadio } from './internal';
import { nearestStreetName, onStreet } from './pursuit';
import { phrase } from './radio';
import { mainStation, sectorAt, sectorById, sectorOf, sectorsOf } from './sectors';
import { MIN } from './time';
import { typeFits, unitPosAt } from './units';
import type { CoopSeat, CoopState, SeatStats } from './coop';
import type {
  ActiveCall,
  Incident,
  LngLat,
  RadioMsg,
  RegionDef,
  RegionId,
  SimState,
  Text,
  Unit,
  UnitNeed,
} from './types';

const T = (et: string, en: string): Text => ({ et, en });

/** A sector room has two to four desks. */
export const MIN_DESKS = 2;
export const MAX_DESKS = 4;
/** A lend request nobody answered lapses after this many turns (real seconds). */
export const LEND_TURNS = 40;
/** Lend requests kept in the state (the panel shows the latest). */
const MAX_LENDS = 40;

export interface LendRequest {
  id: number;
  /** The incident the crew is wanted for. */
  inc: string;
  unit: string;
  /** Seat that asked. */
  seat: number;
  /** 'ask': the incident's desk asks for a neighbour's crew. 'offer': a desk offers its crew to a neighbour's incident. */
  kind: 'ask' | 'offer';
  /** Desk that asked, and the desk that answers. */
  from: string;
  to: string;
  /** Turn it was made. */
  turn: number;
  state: 'open' | 'accepted' | 'declined' | 'expired' | 'failed';
  /** Seat that answered; -1 for the AI colleague of a desk nobody holds. */
  by?: number;
}

/** JSON-safe state of the desks (CoopState.sec). Part of SimState, so it travels in snapshots. */
export interface DeskState {
  /** The room's desks (sector ids), in data order. */
  desks: string[];
  /** Unit id: its desk ('' for a shared on-call asset). */
  unitDesk: Record<string, string>;
  /** Incident id: its desk, fixed when the incident appears (a hand-over moves it). */
  incDesk: Record<string, string>;
  /** Incidents of incidentOrder already given a desk. */
  seen: number;
  lends: LendRequest[];
  lendSeq: number;
  /** Unit id: the seat that sent it (for the help count). */
  crew: Record<string, number>;
  /** "<incident>:<seat>" pairs already counted as help. */
  helped: Record<string, 1>;
  /** Pursuits offered to a neighbouring player's desk: incident id, the offer's message and that desk. */
  handover: Record<string, { msg: string; desk: string }>;
  /** Incidents the AI colleague of a desk nobody held took back, per desk. */
  taken: Record<string, number>;
  /**
   * Desks a player took over (2.34.0): desk id, the desk it runs under now. Missing in shifts from before, as are the
   * three below.
   */
  merged?: Record<string, string>;
  /** Crews and open incidents a take-over moved: id, the desk they belong to without it. */
  homeUnit?: Record<string, string>;
  homeInc?: Record<string, string>;
  /** Seats that took each desk over during the shift (the report). */
  takenBy?: Record<string, number[]>;
  /** Radio messages the colleague of a desk nobody holds has dealt with. */
  answered?: Record<string, 1>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Desks of a prefecture
// ─────────────────────────────────────────────────────────────────────────────

/** True when the sectors form one connected group by their neighbours. */
export function connected(ids: readonly string[]): boolean {
  if (!ids.length) return false;
  const want = new Set(ids);
  const seen = new Set<string>([ids[0]]);
  const todo = [ids[0]];
  while (todo.length) {
    const id = todo.pop()!;
    for (const n of sectorById(id)?.neighbours ?? []) {
      if (want.has(n) && !seen.has(n)) {
        seen.add(n);
        todo.push(n);
      }
    }
  }
  return seen.size === want.size;
}

/**
 * The desks of a sector room as the host chose them: two to four distinct sectors of the prefecture that neighbour
 * each other (one connected group), in data order. Null when the list is not such a group.
 */
export function validDesks(regionId: RegionId, ids: readonly unknown[] | undefined): string[] | null {
  if (!Array.isArray(ids)) return null;
  const all = sectorsOf(regionId).map((x) => x.id);
  const own = all.filter((id) => ids.includes(id));
  if (own.length !== ids.length || own.length < MIN_DESKS || own.length > MAX_DESKS) return null;
  return connected(own) ? own : null;
}

/** Sectors the host can add to a desk list: neighbours of the chosen ones (any sector while none is chosen). */
export function addableDesks(regionId: RegionId, ids: readonly string[]): string[] {
  const all = sectorsOf(regionId);
  if (!ids.length) return all.map((x) => x.id);
  if (ids.length >= MAX_DESKS) return [];
  return all.filter((x) => !ids.includes(x.id) && x.neighbours.some((n) => ids.includes(n))).map((x) => x.id);
}

/** Can this desk leave the list (the rest stay one group of at least two)? */
export function removableDesk(ids: readonly string[], id: string): boolean {
  const rest = ids.filter((x) => x !== id);
  return rest.length >= MIN_DESKS && connected(rest);
}

/** The desks a host gets by default for a prefecture: the first starter sector and its first neighbour. */
export function defaultDesks(regionId: RegionId): string[] {
  const all = sectorsOf(regionId);
  const first = all.find((x) => !!x.starter) ?? all[0];
  if (!first) return [];
  const next = all.find((x) => first.neighbours.includes(x.id));
  return all.filter((x) => x.id === first.id || x.id === next?.id).map((x) => x.id);
}

/** A seat's desk when the player did not pick one: the seats spread over the desks in order. */
export function defaultDesk(desks: readonly string[], seat: number): string {
  return desks.length ? desks[seat % desks.length] : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

const regionOfState = (s: Pick<SimState, 'regionId'>): RegionDef => REGIONS[s.regionId];

/** The desk whose main station is nearest a point. */
function nearestDesk(region: RegionDef, desks: readonly string[], at: LngLat): string {
  let best = desks[0] ?? '';
  let bd = Infinity;
  for (const id of desks) {
    const st = mainStation(region, id);
    if (!st) continue;
    const d = haversineKm(st.coord, at);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

/**
 * Crews to desks: the desk whose sector lists the unit's station (a station two desks list is shared out in turn),
 * else the desk of the station's (or the unit's) point. On-call assets belong to every desk ('').
 */
function assignUnits(s: SimState, desks: readonly string[]): Record<string, string> {
  const region = regionOfState(s);
  const out: Record<string, string> = {};
  const turn = new Map<string, number>();
  for (const id of s.unitOrder) {
    const u = s.units[id];
    if (!u) continue;
    if (u.onCall) {
      out[id] = '';
      continue;
    }
    const listing = desks.filter((d) => sectorById(d)?.stationIds.includes(u.stationId));
    if (listing.length === 1) out[id] = listing[0];
    else if (listing.length > 1) {
      const n = turn.get(u.stationId) ?? 0;
      turn.set(u.stationId, n + 1);
      out[id] = listing[n % listing.length];
    } else {
      const at = region.stations.find((x) => x.id === u.stationId)?.coord ?? u.pos;
      const own = sectorAt(region, at);
      out[id] = desks.includes(own) ? own : nearestDesk(region, desks, at);
    }
  }
  return out;
}

/**
 * Turn a fresh co-op shift into a sector one (initCoop): the desks, every crew's desk, and AI colleagues that run
 * the desks nobody holds and the sectors around the room (their own random stream, like a sector shift's).
 */
export function initDesks(s: SimState, desks: readonly string[]): DeskState {
  const list = [...desks];
  const sec: DeskState = {
    desks: list,
    unitDesk: assignUnits(s, list),
    incDesk: {},
    seen: 0,
    lends: [],
    lendSeq: 0,
    crew: {},
    helped: {},
    handover: {},
    taken: {},
  };
  const st = newColleagueState(s, s.seed, list);
  st.area = [];
  st.crews = [];
  s.colleagues = st;
  return sec;
}

const deskState = (s: Pick<SimState, 'coop'>): DeskState | undefined =>
  s.coop?.mode === 'sector' ? s.coop.sec : undefined;

/** Is this a sector co-op shift? */
export const isDeskShift = (s: Pick<SimState, 'coop'> | null | undefined): boolean => !!s && !!deskState(s);

/** Seats present at a desk. */
export function deskHolders(c: Pick<CoopState, 'seats'>, desk: string): CoopSeat[] {
  return c.seats.filter((x) => x.present && x.desk === desk);
}

/** Desks with at least one player present, their own or one that took them over. */
export function heldDesks(c: Pick<CoopState, 'seats' | 'sec'>): string[] {
  const sec = c.sec;
  return (sec?.desks ?? []).filter((d) => deskHolders(c, runningDesk(sec!, d)).length > 0);
}

/** The desk a desk's work runs under: itself, or the desk of the player who took it over. */
export function runningDesk(sec: Pick<DeskState, 'merged'>, desk: string): string {
  let d = desk;
  for (let i = 0; i < MAX_DESKS && sec.merged?.[d]; i++) d = sec.merged[d];
  return d;
}

/** A seat's desk while it is present ('' when away or not a sector room). */
export function seatDesk(c: Pick<CoopState, 'seats'>, seat: number): string {
  const x = c.seats.find((y) => y.seat === seat);
  return x?.present && x.desk ? x.desk : '';
}

/** The desk a unit belongs to ('' for a shared on-call asset). */
export function unitDesk(
  s: Pick<SimState, 'coop' | 'regionId' | 'units'>,
  u: Pick<Unit, 'id' | 'onCall' | 'stationId' | 'pos'>,
): string {
  const sec = deskState(s);
  if (!sec) return '';
  const known = sec.unitDesk[u.id];
  if (known !== undefined) return known;
  if (u.onCall) return '';
  const region = regionOfState(s);
  const own = sectorById(sectorAt(region, u.pos))?.id ?? '';
  return runningDesk(sec, sec.desks.includes(own) ? own : nearestDesk(region, sec.desks, u.pos));
}

/**
 * The desk of an incident: stored once it is known; else computed (and stored with `store`, which only the sim
 * does: the UI peeks without writing shared state). A colleague's call for help goes to the held desk next to the
 * colleague's sector nearest the call; anything else to the desk of its location (the nearest desk outside them).
 */
export function incidentDesk(
  s: SimState,
  inc: Pick<Incident, 'id' | 'tags' | 'location'>,
  store = false,
): string {
  const sec = deskState(s);
  if (!sec) return '';
  const known = sec.incDesk[inc.id];
  if (known !== undefined) return known;
  const region = regionOfState(s);
  let d: string;
  const help = helpSector(inc);
  if (help !== undefined) {
    const held = heldDesks(s.coop!);
    const near = held.filter(
      (id) =>
        id === help || sectorById(id)?.neighbours.includes(help) || sectorById(help)?.neighbours.includes(id),
    );
    d = nearestDesk(region, near.length ? near : held.length ? held : sec.desks, inc.location.coord);
  } else {
    const own = sectorOf(region, inc.location);
    d = sec.desks.includes(own) ? own : nearestDesk(region, sec.desks, inc.location.coord);
  }
  // A desk a player took over: the event is theirs, and goes back with the desk.
  const run = runningDesk(sec, d);
  if (store) {
    sec.incDesk[inc.id] = run;
    if (run !== d) (sec.homeInc ??= {})[inc.id] = d;
  }
  return run;
}

/** The desk of a 112 call: its incident's. */
export function callDesk(s: SimState, call: Pick<ActiveCall, 'incidentId'>): string {
  const inc = s.incidents[call.incidentId];
  return inc ? incidentDesk(s, inc) : '';
}

/**
 * The desk that answers a radio message: a hand-over offer and anything about an incident goes to the incident's
 * desk, a crew's own message to the crew's desk, the rest ('') to anybody.
 */
export function msgDesk(s: SimState, msg: Pick<RadioMsg, 'unitId' | 'incidentId'>): string {
  if (msg.unitId && s.units[msg.unitId]) {
    const d = unitDesk(s, s.units[msg.unitId]);
    if (d) return d;
  }
  if (msg.incidentId && s.incidents[msg.incidentId]) return incidentDesk(s, s.incidents[msg.incidentId]);
  return '';
}

/**
 * 112 lines in a sector room (calls.maybeCreateCall): each desk has its own line, busy while a call of that desk is
 * open; a desk nobody holds takes no calls (its colleague does, the event comes as a card and goes back to them).
 */
export function deskLineBusy(s: SimState, inc: Incident): boolean {
  const c = s.coop;
  if (!c?.sec) return s.calls.some((x) => x.endedAt === undefined);
  const d = incidentDesk(s, inc, true);
  if (!deskHolders(c, d).length) return true;
  return s.calls.some((x) => x.endedAt === undefined && callDesk(s, x) === d);
}

/** After the seats change (setup, left, back): the colleagues work around the held desks and their crews. */
export function syncDeskSeats(s: SimState): void {
  const c = s.coop;
  const sec = c?.sec;
  const st = s.colleagues;
  if (!c || !sec || !st) return;
  const held = heldDesks(c);
  st.area = held;
  st.crews = s.unitOrder.filter((id) => held.includes(sec.unitDesk[id] ?? ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// Per substep (engine.substep, after the colleagues)
// ─────────────────────────────────────────────────────────────────────────────

function statsFor(c: CoopState, seat: number): SeatStats {
  const k = String(seat);
  return (c.stats[k] ??= blankStats());
}

/** emptySeatStats without importing coop.ts at run time (no cycle through the engine). */
function blankStats(): SeatStats {
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
    took: 0,
  };
}

function deskName(id: string): Text {
  return sectorById(id)?.name ?? T(id, id);
}

/** Names of the players at a desk ("Hanna, Ivo"). */
export function holderNames(c: Pick<CoopState, 'seats'>, desk: string): string {
  return deskHolders(c, desk)
    .map((x) => x.name)
    .join(', ');
}

/**
 * The desks' work in one engine substep: new incidents get their desk, the colleague of a desk nobody holds takes
 * its open incidents without crews back, crews that reach a neighbour's incident count as help, and a pursuit that
 * runs into another player's sector is offered to them.
 */
export function updateDesks(s: SimState): void {
  const c = s.coop;
  const sec = c?.sec;
  if (!c || !sec || c.mode !== 'sector' || s.ended || !c.seats.length) return;
  for (; sec.seen < s.incidentOrder.length; sec.seen++) {
    const inc = s.incidents[s.incidentOrder[sec.seen]];
    if (inc) incidentDesk(s, inc, true);
  }
  takeBack(s, c, sec);
  colleagueRuns(s, c, sec);
  countHelp(s, c, sec);
  offerDeskHandovers(s, c, sec);
}

function takeBack(s: SimState, c: CoopState, sec: DeskState): void {
  for (const id of openIncidentIds(s)) {
    const inc = s.incidents[id];
    if (!inc || inc.state === 'closed' || inc.assigned.length) continue;
    const d = incidentDesk(s, inc, true);
    if (deskHolders(c, d).length) continue;
    const sector = sectorById(d);
    const name = sector ? colleagueName(sector) : '';
    sec.taken[d] = (sec.taken[d] ?? 0) + 1;
    closeByColleague(
      s,
      inc,
      'help',
      T(
        `${name} (${deskName(d).et}) võttis sündmuse oma lauale.`,
        `${name} (${deskName(d).en}) took the event to their desk.`,
      ),
    );
  }
}

/** Game time the colleague of a desk nobody holds lets a crew's question wait before answering it for the desk. */
export const COLLEAGUE_ANSWER_MS = 90 * 1000;
/** Radio messages older than this (game time) are not looked at again. */
const COLLEAGUE_LOOKBACK_MS = 30 * MIN;

/**
 * The colleague of a desk nobody holds works the events its crews are already on: a crew's decision, agency request,
 * registry query or backup call that waited COLLEAGUE_ANSWER_MS gets what a careful dispatcher would give it
 * (incidents.colleagueAnswer). A player who takes the desk over or comes back before then answers it themselves.
 */
function colleagueRuns(s: SimState, c: CoopState, sec: DeskState): void {
  for (let i = s.radio.length - 1; i >= 0; i--) {
    const msg = s.radio[i];
    if (s.now - msg.t > COLLEAGUE_LOOKBACK_MS) break;
    if (msg.answered || sec.answered?.[msg.id] || s.now - msg.t < COLLEAGUE_ANSWER_MS) continue;
    if (msg.kind !== 'choice' && msg.kind !== 'agency' && msg.kind !== 'query' && msg.kind !== 'backup')
      continue;
    if (msg.expiresAt !== undefined && msg.expiresAt < s.now) continue;
    const d = msgDesk(s, msg);
    if (!d || deskHolders(c, d).length) continue;
    (sec.answered ??= {})[msg.id] = 1;
    const a = colleagueAnswer(s, msg);
    if (!a) continue;
    if ('reply' in a) replyRadio(s, msg.id, a.reply);
    else sendColleagueBackup(s, sec, d, a.inc, a.need);
  }
  const done = sec.answered;
  if (done && Object.keys(done).length > 400) {
    const keep = new Set(s.radio.map((m) => m.id));
    for (const id of Object.keys(done)) if (!keep.has(id)) delete done[id];
  }
}

/** The colleague sends the backup a crew of its desk asked for: its nearest free crews of the right kind. */
function sendColleagueBackup(s: SimState, sec: DeskState, desk: string, inc: Incident, need: UnitNeed): void {
  const free: { u: Unit; km: number }[] = [];
  for (const id of s.unitOrder) {
    const u = s.units[id];
    if (!u || u.onCall || sec.unitDesk[id] !== desk || !lendable(u) || !typeFits(need.type, u.type)) continue;
    free.push({ u, km: haversineKm(unitPosAt(u, s.now).pos, inc.location.coord) });
  }
  free.sort((x, y) => x.km - y.km || (x.u.id < y.u.id ? -1 : 1));
  const pick = free.slice(0, Math.max(1, need.count)).map((x) => x.u.id);
  if (pick.length) dispatchUnits(s, inc.id, pick);
}

// ─────────────────────────────────────────────────────────────────────────────
// Taking over a desk nobody holds (2.34.0)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Desks a seat could take over now: the room's desks nobody holds and nobody took over (its own desk never).
 * Empty for a seat that is away or outside a sector room.
 */
export function freeDesks(c: Pick<CoopState, 'seats' | 'sec'>, seat: number): string[] {
  const sec = c.sec;
  const mine = seatDesk(c, seat);
  if (!sec || !mine) return [];
  return sec.desks.filter((d) => d !== mine && !sec.merged?.[d] && !deskHolders(c, d).length);
}

/** Desks running under a desk because a player took them over. */
export function desksTakenInto(sec: Pick<DeskState, 'desks' | 'merged'>, desk: string): string[] {
  return sec.desks.filter((d) => d !== desk && sec.merged?.[d] !== undefined && runningDesk(sec, d) === desk);
}

/**
 * After a take-over or a hand-back: every crew and every open event runs under the desk its own desk runs under
 * now. What a take-over moved remembers its own desk (homeUnit, homeInc) and goes back with it.
 */
function remapDesks(s: SimState, sec: DeskState): void {
  const homeUnit = (sec.homeUnit ??= {});
  const homeInc = (sec.homeInc ??= {});
  for (const id of s.unitOrder) {
    const own = homeUnit[id] ?? sec.unitDesk[id];
    if (!own) continue;
    const run = runningDesk(sec, own);
    sec.unitDesk[id] = run;
    if (run !== own) homeUnit[id] = own;
    else delete homeUnit[id];
  }
  for (const id of openIncidentIds(s)) {
    const own = homeInc[id] ?? sec.incDesk[id];
    if (own === undefined) continue;
    const run = runningDesk(sec, own);
    sec.incDesk[id] = run;
    if (run !== own) homeInc[id] = own;
    else delete homeInc[id];
  }
  // Requests between a desk and the one that took it over make no sense any more.
  for (const req of sec.lends)
    if (req.state === 'open' && runningDesk(sec, req.from) === runningDesk(sec, req.to))
      req.state = 'expired';
}

function deskNotice(s: SimState, text: Text): void {
  pushRadio(s, { from: 'JK', to: 'JK', text, level: 'routine', kind: 'system' });
}

/**
 * `take [desk]`: a player takes over a desk nobody holds. Its crews and open events run under the player's own desk
 * from now on, its 112 calls ring there, and its colleague stops taking its events back.
 */
export function takeDesk(s: SimState, c: CoopState, seat: number, desk: string): LendResult {
  const sec = c.sec;
  const x = c.seats.find((y) => y.seat === seat);
  const mine = seatDesk(c, seat);
  if (!sec || !x || !mine || !sec.desks.includes(desk)) return { ok: false };
  if (!freeDesks(c, seat).includes(desk))
    return {
      ok: false,
      reason: T('Seda lauda ei saa praegu üle võtta.', 'That desk cannot be taken over now.'),
    };
  (sec.merged ??= {})[desk] = mine;
  const by = ((sec.takenBy ??= {})[desk] ??= []);
  if (!by.includes(seat)) by.push(seat);
  statsFor(c, seat).took = (statsFor(c, seat).took ?? 0) + 1;
  remapDesks(s, sec);
  const name = deskName(desk);
  for (const id of openIncidentIds(s))
    if (sec.homeInc?.[id] === desk && s.incidents[id] && !s.flags[`hidden:${id}`])
      addTimeline(
        s,
        s.incidents[id],
        'dispatch',
        T(`${x.name} võttis laua ${name.et} üle.`, `${x.name} took over the ${name.en} desk.`),
      );
  deskNotice(s, T(`${x.name} võttis laua ${name.et} üle.`, `${x.name} took over the ${name.en} desk.`));
  syncDeskSeats(s);
  return { ok: true };
}

/**
 * A desk goes back: `give [desk]` by the player it runs under (to its colleague), or its own player is back (`back`).
 * Its crews and the open events of its sector return to it.
 */
export function giveDesk(s: SimState, c: CoopState, desk: string, seat: number, back = false): LendResult {
  const sec = c.sec;
  if (!sec?.merged?.[desk]) return { ok: false };
  if (!back && runningDesk(sec, desk) !== seatDesk(c, seat))
    return { ok: false, denied: true, reason: NOT_YOURS };
  delete sec.merged[desk];
  remapDesks(s, sec);
  const name = deskName(desk);
  const who = c.seats.find((y) => y.seat === seat)?.name ?? '';
  const sector = sectorById(desk);
  const colleague = sector ? colleagueName(sector) : '';
  deskNotice(
    s,
    back
      ? T(`${who} on tagasi: laud ${name.et} on jälle tema käes.`, `${who} is back at the ${name.en} desk.`)
      : T(
          `${who} andis laua ${name.et} kolleeg ${colleague} kätte.`,
          `${who} handed the ${name.en} desk to colleague ${colleague}.`,
        ),
  );
  syncDeskSeats(s);
  return { ok: true };
}

/** A seat left (`left`): when its desk is now empty, everybody hears that its colleague holds it and it can be taken. */
export function deskSeatLeft(s: SimState, c: CoopState, x: CoopSeat): void {
  const sec = c.sec;
  if (!sec || !x.desk || deskHolders(c, x.desk).length) return;
  const name = deskName(x.desk);
  const sector = sectorById(x.desk);
  const colleague = sector ? colleagueName(sector) : '';
  deskNotice(
    s,
    T(
      `${x.name} ei ole enam ühenduses. Laud ${name.et} on kolleeg ${colleague} käes; selle saab üle võtta.`,
      `${x.name} is no longer connected. Colleague ${colleague} holds the ${name.en} desk; it can be taken over.`,
    ),
  );
}

/** A seat is back (`back`): its own desk, if somebody took it over meanwhile, is its own again. */
export function deskSeatBack(s: SimState, c: CoopState, x: CoopSeat): void {
  if (c.sec && x.desk && c.sec.merged?.[x.desk]) giveDesk(s, c, x.desk, x.seat, true);
}

function countHelp(s: SimState, c: CoopState, sec: DeskState): void {
  for (const id of s.unitOrder) {
    const u = s.units[id];
    if (!u || u.status !== 'onscene' || !u.incidentId) continue;
    const inc = s.incidents[u.incidentId];
    const seat = sec.crew[id];
    if (!inc || seat === undefined) continue;
    const own = sec.unitDesk[id] ?? '';
    const across = own !== '' && own !== incidentDesk(s, inc, true);
    if (!across && helpSector(inc) === undefined) continue;
    const key = `${inc.id}:${seat}`;
    if (sec.helped[key]) continue;
    sec.helped[key] = 1;
    statsFor(c, seat).helped++;
  }
}

function offerDeskHandovers(s: SimState, c: CoopState, sec: DeskState): void {
  const region = regionOfState(s);
  for (const [incId, offer] of Object.entries(sec.handover)) {
    const inc = s.incidents[incId];
    const msg = s.radio.find((m) => m.id === offer.msg);
    if (
      msg &&
      !msg.answered &&
      (!inc ||
        inc.state === 'closed' ||
        !inc.pursuit ||
        inc.pursuit.ended ||
        incidentDesk(s, inc) === offer.desk)
    )
      msg.answered = 'closed';
  }
  for (const id of openIncidentIds(s)) {
    const inc = s.incidents[id];
    const p = inc?.pursuit;
    if (!inc || !p || p.ended || inc.state === 'closed' || sec.handover[inc.id]) continue;
    const area = sectorAt(region, p.suspectPos);
    const into = sec.desks.includes(area) ? runningDesk(sec, area) : area;
    const from = incidentDesk(s, inc, true);
    if (
      into === from ||
      !sec.desks.includes(into) ||
      !deskHolders(c, into).length ||
      !deskHolders(c, from).length
    )
      continue;
    const sector = sectorById(into);
    if (!sector) continue;
    const road = onStreet(nearestStreetName(s, p.suspectPos, inc));
    const msg = pushRadio(s, {
      from: deskCallsign(sector),
      to: 'JK',
      text: phrase(s, 'colleagueHandover', { name: holderNames(c, into), road }),
      level: 'priority',
      kind: 'pursuit',
      incidentId: inc.id,
      replies: HANDOVER_REPLIES,
      expiresAt: s.now + COLLEAGUES.handoverOfferMin * MIN,
    });
    sec.handover[inc.id] = { msg: msg.id, desk: into };
    addTimeline(
      s,
      inc,
      'radio',
      T(
        `Jälitus ületas sektori piiri: ${sector.name.et} (${holderNames(c, into)}) pakub ülevõtmist.`,
        `The pursuit crossed the sector border: ${sector.name.en} (${holderNames(c, into)}) offers to take over.`,
      ),
    );
  }
}

/**
 * A reply to a neighbouring player's hand-over offer (the `reply` command, before the incident's own replies). Null
 * when the message is not one. Handing over moves the incident to the neighbour's desk; the crews stay on it.
 */
export function answerDeskHandover(
  s: SimState,
  c: CoopState,
  msg: RadioMsg,
  replyId: string,
  seat: number,
): { ok: boolean } | null {
  const sec = c.sec;
  const offer = sec && msg.incidentId ? sec.handover[msg.incidentId] : undefined;
  if (!sec || !offer || offer.msg !== msg.id) return null;
  if (msg.answered || !HANDOVER_REPLIES.some((r) => r.id === replyId)) return { ok: false };
  if (msg.expiresAt !== undefined && msg.expiresAt < s.now) return { ok: false };
  const inc = s.incidents[msg.incidentId!];
  const sector = sectorById(offer.desk);
  msg.answered = replyId;
  if (!inc || !sector || inc.state === 'closed' || !inc.pursuit || inc.pursuit.ended) return { ok: false };
  const names = holderNames(c, offer.desk);
  if (replyId === 'keep') {
    pushRadio(s, {
      from: deskCallsign(sector),
      to: 'JK',
      text: phrase(s, 'colleagueHandoverKept', { name: names }),
      level: 'routine',
      kind: 'pursuit',
      incidentId: inc.id,
    });
    addTimeline(
      s,
      inc,
      'radio',
      T(
        `Jälitus jääb meie lauale (${sector.name.et} valmis aitama).`,
        `The pursuit stays with our desk (${sector.name.en} standing by).`,
      ),
    );
    return { ok: true };
  }
  const was = incidentDesk(s, inc);
  sec.incDesk[inc.id] = offer.desk;
  if (sec.homeInc) delete sec.homeInc[inc.id];
  pushRadio(s, {
    from: deskCallsign(sector),
    to: 'JK',
    text: phrase(s, 'colleagueHandoverTaken', { name: names }),
    level: 'priority',
    kind: 'pursuit',
    incidentId: inc.id,
  });
  addTimeline(
    s,
    inc,
    'radio',
    T(
      `Jälitus anti üle lauale ${sector.name.et} (${names}). Meie ekipaažid jätkavad seal.`,
      `Pursuit handed over to the ${sector.name.en} desk (${names}). Our crews stay on it.`,
    ),
  );
  statsFor(c, seat).handover++;
  const taker = deskHolders(c, offer.desk)[0];
  if (taker) statsFor(c, taker.seat).takeover++;
  // The crews already on it now help the neighbour's incident.
  for (const id of inc.assigned)
    if (sec.crew[id] === undefined && sec.unitDesk[id] === was) sec.crew[id] = seat;
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lending a crew across a border
// ─────────────────────────────────────────────────────────────────────────────

/** A crew that can be lent: free at its station or on patrol. */
const lendable = (u: Unit | undefined): u is Unit => !!u && u.status === 'available' && !u.incidentId;

export interface LendResult {
  ok: boolean;
  denied?: boolean;
  reason?: Text;
}

const NOT_YOURS = T(
  'See ei ole sinu laua sündmus ega ekipaaž.',
  'Neither the event nor the crew is your desk’s.',
);

/**
 * `lend [incidentId, unitId]`: the incident's desk asks for a neighbour's crew, or the crew's desk offers it to a
 * neighbour's incident. The other desk answers with `lendans`; a desk nobody holds answers at once through its
 * colleague (its free crews yes, a player's offer no: the colleagues never use the players' crews).
 */
export function requestLend(
  s: SimState,
  c: CoopState,
  seat: number,
  incId: string,
  unitId: string,
): LendResult {
  const sec = c.sec;
  const inc = s.incidents[incId];
  const u = s.units[unitId];
  if (!sec || !inc || inc.state === 'closed' || s.flags[`hidden:${inc.id}`] || !u || u.onCall)
    return { ok: false };
  const iDesk = incidentDesk(s, inc, true);
  const uDesk = unitDesk(s, u);
  if (!uDesk || iDesk === uDesk)
    return {
      ok: false,
      reason: T('Sama laua ekipaaži saab saata otse.', 'A crew of the same desk can be sent directly.'),
    };
  const mine = seatDesk(c, seat);
  const kind: LendRequest['kind'] | null = mine === iDesk ? 'ask' : mine === uDesk ? 'offer' : null;
  if (!kind) return { ok: false, denied: true, reason: NOT_YOURS };
  if (!lendable(u)) return { ok: false, reason: T('Ekipaaž ei ole vaba.', 'The crew is not free.') };
  if (sec.lends.some((r) => r.state === 'open' && r.inc === incId && r.unit === unitId)) return { ok: false };
  const req: LendRequest = {
    id: ++sec.lendSeq,
    inc: incId,
    unit: unitId,
    seat,
    kind,
    from: mine,
    to: kind === 'ask' ? uDesk : iDesk,
    turn: c.turn + 1,
    state: 'open',
  };
  sec.lends.push(req);
  if (sec.lends.length > MAX_LENDS) sec.lends.splice(0, sec.lends.length - MAX_LENDS);
  addTimeline(
    s,
    inc,
    'dispatch',
    kind === 'ask'
      ? T(
          `Laenupalve lauale ${deskName(req.to).et}: ekipaaž ${u.callsign}.`,
          `Lend request to the ${deskName(req.to).en} desk: crew ${u.callsign}.`,
        )
      : T(
          `Laud ${deskName(req.from).et} pakub ekipaaži ${u.callsign}.`,
          `The ${deskName(req.from).en} desk offers crew ${u.callsign}.`,
        ),
  );
  if (!deskHolders(c, req.to).length) colleagueAnswers(s, c, req);
  return { ok: true };
}

/** `lendans [requestId, 1|0]`: the desk the request went to accepts or declines it. */
export function answerLend(s: SimState, c: CoopState, seat: number, reqId: number, yes: boolean): LendResult {
  const sec = c.sec;
  const req = sec?.lends.find((r) => r.id === reqId);
  if (!sec || !req || req.state !== 'open') return { ok: false };
  if (seatDesk(c, seat) !== req.to)
    return {
      ok: false,
      denied: true,
      reason: T('Palve ei ole sinu lauale.', 'The request is not for your desk.'),
    };
  req.by = seat;
  if (!yes) {
    req.state = 'declined';
    const inc = s.incidents[req.inc];
    if (inc)
      addTimeline(
        s,
        inc,
        'dispatch',
        T(
          `Laud ${deskName(req.to).et} ei saa ekipaaži anda.`,
          `The ${deskName(req.to).en} desk cannot spare the crew.`,
        ),
      );
    return { ok: true };
  }
  return doLend(s, c, req, seat);
}

/** The colleague of a desk nobody holds answers a request to it. */
function colleagueAnswers(s: SimState, c: CoopState, req: LendRequest): void {
  req.by = -1;
  if (req.kind === 'offer') {
    req.state = 'declined';
    return;
  }
  doLend(s, c, req, -1);
}

function doLend(s: SimState, c: CoopState, req: LendRequest, answering: number): LendResult {
  const sec = c.sec!;
  const inc = s.incidents[req.inc];
  const u = s.units[req.unit];
  if (!inc || inc.state === 'closed' || !lendable(u)) {
    req.state = 'failed';
    return {
      ok: false,
      reason: T('Ekipaaž või sündmus ei ole enam vaba.', 'The crew or the event is no longer free.'),
    };
  }
  const r = dispatchUnits(s, inc.id, [u.id]);
  if (!r.ok || u.incidentId !== inc.id) {
    req.state = 'failed';
    return { ok: false, reason: r.reason };
  }
  req.state = 'accepted';
  // The lender is the seat at the crew's desk: whoever answered an ask, whoever made an offer.
  const lender = req.kind === 'ask' ? answering : req.seat;
  const borrower = req.kind === 'ask' ? req.seat : answering;
  if (lender >= 0) {
    statsFor(c, lender).lent++;
    sec.crew[u.id] = lender;
  } else sec.crew[u.id] = req.seat;
  if (borrower >= 0) statsFor(c, borrower).borrowed++;
  const lenderDesk = req.kind === 'ask' ? req.to : req.from;
  addTimeline(
    s,
    inc,
    'dispatch',
    T(
      `Ekipaaž ${u.callsign} laenati lauast ${deskName(lenderDesk).et}.`,
      `Crew ${u.callsign} lent by the ${deskName(lenderDesk).en} desk.`,
    ),
  );
  return { ok: true };
}

/**
 * Every turn (coop.beginTurn, after the turn's commands): requests nobody answered in LEND_TURNS lapse, requests whose
 * crew or event is gone lapse, and a request to a desk whose player left is answered by its colleague.
 */
export function tickLends(s: SimState, c: CoopState, turn: number): void {
  const sec = c.sec;
  if (!sec) return;
  for (const req of sec.lends) {
    if (req.state !== 'open') continue;
    const inc = s.incidents[req.inc];
    if (!inc || inc.state === 'closed' || !lendable(s.units[req.unit]) || turn - req.turn >= LEND_TURNS)
      req.state = 'expired';
    else if (!deskHolders(c, req.to).length) colleagueAnswers(s, c, req);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

/** One desk in the report: who held it and what it did. The same on every client. */
export interface DeskRow {
  desk: string;
  /** Seats that sat at the desk. */
  seats: number[];
  /** The desk's AI colleague (ran it while nobody held it). */
  colleague: string;
  /** Incidents of the desk (not those its colleague took back). */
  incidents: number;
  /** Of those, closed. */
  closed: number;
  calls: number;
  sent: number;
  lent: number;
  borrowed: number;
  helped: number;
  handover: number;
  /** Incidents the colleague took back while nobody held the desk. */
  taken: number;
  /** Seats that took the desk over during the shift (2.34.0). */
  takenBy: number[];
}

export function deskRows(s: SimState): DeskRow[] {
  const c = s.coop;
  const sec = c?.sec;
  if (!c || !sec) return [];
  return sec.desks.map((desk) => {
    const seats = c.seats.filter((x) => x.desk === desk).map((x) => x.seat);
    let incidents = 0;
    let closed = 0;
    for (const id of s.incidentOrder) {
      const inc = s.incidents[id];
      if (!inc || inc.closedBy === 'colleague' || (sec.incDesk[id] ?? incidentDesk(s, inc)) !== desk)
        continue;
      if (s.flags[`hidden:${id}`]) continue;
      incidents++;
      if (inc.state === 'closed') closed++;
    }
    const sum = (k: keyof SeatStats) => seats.reduce((a, n) => a + (c.stats[String(n)]?.[k] ?? 0), 0);
    const sector = sectorById(desk);
    return {
      desk,
      seats,
      colleague: sector ? colleagueName(sector) : '',
      incidents,
      closed,
      calls: sum('calls'),
      sent: sum('sent'),
      lent: sum('lent'),
      borrowed: sum('borrowed'),
      helped: sum('helped'),
      handover: sum('handover'),
      taken: sec.taken[desk] ?? 0,
      takenBy: [...(sec.takenBy?.[desk] ?? [])],
    };
  });
}

/** Canonical text of the desks' state for the digest (coop.simDigest). */
export function deskDigest(sec: DeskState): string {
  const lends = sec.lends.map((r) => `${r.id}${r.state[0]}${r.by ?? ''}`).join(',');
  const taken = Object.keys(sec.taken)
    .sort()
    .map((k) => `${k}=${sec.taken[k]}`)
    .join(',');
  const merged = Object.keys(sec.merged ?? {})
    .sort()
    .map((k) => `${k}>${sec.merged![k]}`)
    .join(',');
  return `D${sec.desks.join(',')}|${sec.seen}|${sec.lendSeq}|${lends}|${Object.keys(sec.helped).length}|${Object.keys(sec.handover).length}|${taken}|${merged}|${Object.keys(sec.answered ?? {}).length}`;
}
