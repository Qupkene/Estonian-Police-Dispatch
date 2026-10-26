/**
 * Kordus (2.39.0, docs/REPLAY.md): what happened on the map in a shift, recorded while it is played and played back on
 * the same map afterwards, faster, with a timeline of the calls, the crews sent and the pursuits.
 *
 * The shift cannot be stepped again from its seed to show it (a tab steps real time x speed, so its steps differ from
 * any other run, and outside a room the commands are not logged), so it is watched as it runs: `observe` compares the
 * state with what it saw the frame before and keeps every change of a crew's status and every movement (the engine's
 * own path and times, so a crew can be shown exactly where it was at any moment), when each incident showed, changed
 * state and closed, the calls, the pursued vehicle's track, the searches, the weather and the crisis. None of it is in
 * the simulation state, its saves or its digest: the recording lives beside the shift (src/store/replay.ts keeps it on
 * the device) and never changes how the shift plays. `src/sim/replayFrame.ts` builds a state for any moment that the
 * game's own map draws.
 *
 * Times are game ms. A status change takes the crew's own `statusSince`, a movement its own departure and arrival, an
 * incident's closing its `closedAt`; the rest is the time of the frame that saw it (a few game seconds at most).
 */
import { CRISIS_TAG } from './crisis';
import { along, cumulative, haversineKm } from './geo';
import type {
  Agency,
  GameMode,
  Difficulty,
  Incident,
  IncidentCategory,
  IncidentState,
  LngLat,
  Movement,
  OutcomeResult,
  PlaceKind,
  Priority,
  PursuitState,
  RegionId,
  ShiftReport,
  SimState,
  Text,
  Unit,
  UnitStatus,
  UnitType,
  Weather,
} from './types';

export const REPLAY_VERSION = 1;

/** Coordinates are kept to five decimals (about a metre), the same way everywhere, so equal points stay equal. */
export const rnd = (x: number): number => Math.round(x * 1e5) / 1e5;
const pt = (p: LngLat): LngLat => [rnd(p[0]), rnd(p[1])];

/** A crew's movement as the replay keeps it: the engine's path and times. */
export interface ReplayMove {
  /** When it was given (or first seen): the crew stands at the path's start from here until it departs. */
  t: number;
  /** Departure (an on-call crew leaves a few minutes after being sent) and arrival. */
  d: number;
  a: number;
  /** Cut short at this time (re-routed or stopped): the crew stands where it was then. */
  c?: number;
  /** The path. One point: the crew stood there from `t` on (it moved without a movement being seen). */
  p: LngLat[];
  u: Movement['purpose'];
  /** Blue lights and siren. */
  s?: 1;
}

/** A crew's status from `t` on, and the incident it works on. */
export interface ReplayStatus {
  t: number;
  s: UnitStatus;
  i?: string;
}

export interface ReplayUnit {
  id: string;
  callsign: string;
  type: UnitType;
  stationId: string;
  vehicle: string;
  /** Sector co-op: the crew's desk (sector id), '' for a shared on-call asset. */
  desk?: string;
  /** Where it stood when the recording began. */
  p0: LngLat;
  st: ReplayStatus[];
  mv: ReplayMove[];
  /** Kilometres driven in the shift (set at the end). */
  km?: number;
}

/** An incident's state, priority and escalation from `t` on. */
export interface ReplayIncState {
  t: number;
  s: IncidentState;
  p: Priority;
  e?: 1;
}

/** A pursuit: the fleeing vehicle's track as [t, lon, lat, heading] samples. */
export interface ReplayPursuit {
  t0: number;
  t1?: number;
  end?: PursuitState['ended'];
  heli?: 1;
  pts: [number, number, number, number][];
}

/** An area search: its circle, and how far it got when it ended. */
export interface ReplaySearch {
  t0: number;
  t1?: number;
  c: LngLat;
  r: number;
  /** Progress (0..1) last seen. */
  p: number;
  f?: 1;
}

export interface ReplayIncident {
  id: string;
  number: string;
  code: string;
  templateId: string;
  scenarioId?: string;
  category: IncidentCategory;
  title: Text;
  truePriority: Priority;
  source: Incident['source'];
  coord: LngLat;
  address: string;
  city: string;
  district?: string;
  placeName?: string;
  placeKind: PlaceKind;
  zone: string;
  created: number;
  /** When it showed on the map (a 112 call's incident: when the call ended). Missing: it never showed. */
  shown?: number;
  st: ReplayIncState[];
  closed?: number;
  closedBy?: Incident['closedBy'];
  result?: OutcomeResult;
  score?: number;
  arrests?: number;
  /** The crews that worked on it. */
  units: string[];
  /** Other agencies asked for: who, when asked, when on scene. */
  agency?: { a: Agency; r: number; at: number }[];
  /** Its pursuits (one, as a rule; a pursuit beat can start another after the first). */
  pu?: ReplayPursuit[];
  sr?: ReplaySearch[];
  /** Sector co-op: its desk. */
  desk?: string;
  /** The crisis tag (src/sim/crisis.ts), so the map marks a crisis task. */
  tags?: string[];
}

/** A 112 call: when it rang, was answered and ended, its incident. */
export interface ReplayCall {
  id: string;
  t: number;
  a?: number;
  e?: number;
  i: string;
  /** Nobody answered it. */
  m?: 1;
  /** Co-op: the seat that answered it. */
  seat?: number;
}

export type ReplayMarkKind = 'call' | 'send' | 'pursuit' | 'crisis' | 'good' | 'bad';

/** One mark of the timeline. */
export interface ReplayMark {
  t: number;
  k: ReplayMarkKind;
  /** The end of a span (a pursuit, the crisis). */
  t1?: number;
  inc?: string;
  unit?: string;
  /** Co-op: the seat that took the call or sent the crew. */
  seat?: number;
  /** A call nobody answered. */
  miss?: 1;
}

export interface ReplaySeat {
  seat: number;
  name: string;
  desk?: string;
  role?: string;
  avatar?: string;
}

export interface ReplayCrisis {
  id: string;
  t0: number;
  t1?: number;
  center: LngLat;
  address: string;
  result?: number;
}

export interface ShiftReplay {
  v: typeof REPLAY_VERSION;
  /** The shift (`${seed}:${startTime}`, src/store/game.ts shiftKeyOf). */
  key: string;
  seed: number;
  regionId: RegionId;
  sectors?: string[];
  cover?: string[];
  mode: GameMode;
  difficulty: Difficulty;
  playerName: string;
  /** The shift's planned start and end. */
  start: number;
  end: number;
  /** The recording began here (later than `start` when the beginning was not recorded on this device). */
  from: number;
  /** The last moment recorded (the shift's real end, overtime included, once finished). */
  to: number;
  /** Spans the recording missed (the page was closed and its recording lost). */
  gaps?: [number, number][];
  units: ReplayUnit[];
  incidents: ReplayIncident[];
  calls: ReplayCall[];
  marks: ReplayMark[];
  /** The weather from `t` on. */
  wx: { t: number; w: Weather }[];
  crisis?: ReplayCrisis;
  /** A room's shift: its code, and co-op's kind and seats. */
  room?: string;
  coop?: 'role' | 'sector';
  seats?: ReplaySeat[];
  /** The result, once finished. */
  score?: number;
  grade?: ShiftReport['grade'];
  done?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Positions
// ─────────────────────────────────────────────────────────────────────────────

const cumCache = new WeakMap<ReplayMove, number[]>();
function cumOf(m: ReplayMove): number[] {
  let c = cumCache.get(m);
  if (!c) {
    c = cumulative(m.p);
    cumCache.set(m, c);
  }
  return c;
}

/** Where a movement had the crew at time t (before departure: its start; after the end: where it ended). */
export function movePosAt(m: ReplayMove, t: number): { pos: LngLat; heading: number } {
  const p = m.p;
  if (p.length < 2) return { pos: p[0], heading: 0 };
  const stop = Math.min(m.a, m.c ?? Infinity);
  const tt = Math.min(Math.max(t, m.d), stop);
  const span = m.a - m.d;
  const f = span > 0 ? Math.min(1, Math.max(0, (tt - m.d) / span)) : 1;
  const cum = cumOf(m);
  return along(p, cum, cum[cum.length - 1] * f);
}

/** Where the crew stands once its last movement is over. */
export function restOf(u: Pick<ReplayUnit, 'mv' | 'p0'>): LngLat {
  const m = u.mv[u.mv.length - 1];
  if (!m) return u.p0;
  if (m.p.length < 2) return m.p[0];
  return m.c !== undefined ? movePosAt(m, m.c).pos : m.p[m.p.length - 1];
}

/** Index of the last entry with `t <= at` in a list sorted by `t`, or -1. */
export function lastAtOrBefore<T>(list: readonly T[], at: number, tOf: (x: T) => number): number {
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tOf(list[mid]) <= at) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

const moveKey = (d: number, a: number, end: LngLat) => `${d}|${a}|${rnd(end[0])}|${rnd(end[1])}`;

// ─────────────────────────────────────────────────────────────────────────────
// Recording
// ─────────────────────────────────────────────────────────────────────────────

/** A recording in progress: the replay being filled and what the last frame saw. */
export interface ReplayRecorder {
  rep: ShiftReplay;
  /** Unit, incident and call id: index in the replay's lists. */
  ui: Map<string, number>;
  ii: Map<string, number>;
  ci: Map<string, number>;
  /** Unit id: the key of the movement seen last ('' standing). */
  mk: Map<string, string>;
  /** Incidents not closed yet. */
  open: Set<string>;
  /** Entries of incidentOrder looked at. */
  seen: number;
  /** Game time of the last frame seen. */
  last: number;
  /** Co-op: crews sent by each seat so far (who sent a crew). */
  sent: Map<number, number>;
}

const SEARCH_KEEP = 4;
/** A pursued vehicle's sample is kept after it moved this far (km) or this long (game ms). */
const PURSUIT_STEP_KM = 0.025;
const PURSUIT_STEP_MS = 10_000;
/** A crew found this far (km) from where the recording has it standing jumped there (a resync, a lost frame). */
const JUMP_KM = 0.03;

function hiddenOf(s: SimState, id: string): boolean {
  return !!s.flags?.[`hidden:${id}`];
}

function newUnit(u: Unit): ReplayUnit {
  return {
    id: u.id,
    callsign: u.callsign,
    type: u.type,
    stationId: u.stationId,
    vehicle: u.vehicle,
    p0: pt(u.pos),
    st: [],
    mv: [],
  };
}

function recMove(m: Movement, now: number): ReplayMove {
  return {
    t: Math.min(now, m.departAt),
    d: m.departAt,
    a: m.arriveAt,
    p: m.path.map(pt),
    u: m.purpose,
    ...(m.siren ? { s: 1 as const } : {}),
  };
}

function staticOf(inc: Incident): Omit<ReplayIncident, 'created' | 'shown' | 'st' | 'units'> {
  const l = inc.location;
  const crisisTags = (inc.tags ?? []).filter((x) => typeof x === 'string' && x.startsWith(CRISIS_TAG));
  return {
    id: inc.id,
    number: inc.number,
    code: inc.code,
    templateId: inc.templateId,
    ...(inc.scenarioId ? { scenarioId: inc.scenarioId } : {}),
    category: inc.category,
    title: { et: inc.title?.et ?? '', en: inc.title?.en ?? '' },
    truePriority: inc.truePriority,
    source: inc.source,
    coord: pt(l.coord),
    address: l.address ?? '',
    city: l.city ?? '',
    ...(l.district ? { district: l.district } : {}),
    ...(l.placeName ? { placeName: l.placeName } : {}),
    placeKind: l.placeKind,
    zone: l.zone ?? '',
    ...(crisisTags.length ? { tags: crisisTags } : {}),
  };
}

function addIncident(r: ReplayRecorder, s: SimState, inc: Incident): void {
  const ri: ReplayIncident = {
    ...staticOf(inc),
    created: inc.createdAt,
    st: [{ t: Math.min(inc.createdAt, s.now), s: inc.state, p: inc.priority, ...(inc.escalated ? { e: 1 as const } : {}) }],
    units: [],
  };
  if (!hiddenOf(s, inc.id)) ri.shown = Math.min(s.now, inc.createdAt);
  r.ii.set(inc.id, r.rep.incidents.length);
  r.rep.incidents.push(ri);
  if (inc.state !== 'closed') r.open.add(inc.id);
  else ri.closed = inc.closedAt ?? s.now;
  observeIncident(r, s, inc, ri);
}

function observePursuit(ri: ReplayIncident, p: PursuitState, now: number): void {
  const list = (ri.pu ??= []);
  let rp = list[list.length - 1];
  if (!rp || rp.t0 !== p.startedAt) {
    if (rp && rp.t1 === undefined) rp.t1 = Math.max(rp.t0, now);
    rp = { t0: p.startedAt, pts: [] };
    list.push(rp);
  }
  if (rp.t1 !== undefined) return;
  if (p.heli) rp.heli = 1;
  const pos = p.suspectPos;
  const last = rp.pts[rp.pts.length - 1];
  const moved = !last || haversineKm([last[1], last[2]], pos) >= PURSUIT_STEP_KM;
  if (pos && (moved || (now - last[0] >= PURSUIT_STEP_MS && (last[1] !== rnd(pos[0]) || last[2] !== rnd(pos[1]))) || p.ended))
    rp.pts.push([now, rnd(pos[0]), rnd(pos[1]), Math.round(p.heading ?? 0)]);
  if (p.ended) {
    rp.t1 = now;
    rp.end = p.ended;
  }
}

function observeIncident(r: ReplayRecorder, s: SimState, inc: Incident, ri: ReplayIncident): void {
  const now = s.now;
  if (ri.shown === undefined && !hiddenOf(s, inc.id)) ri.shown = now;
  const last = ri.st[ri.st.length - 1];
  const esc = inc.escalated ? 1 : 0;
  if (last.s !== inc.state || last.p !== inc.priority || (last.e ?? 0) !== esc) {
    const t =
      inc.state === 'closed' && inc.closedAt !== undefined ? Math.min(now, Math.max(last.t, inc.closedAt)) : Math.max(last.t, now);
    ri.st.push({ t, s: inc.state, p: inc.priority, ...(esc ? { e: 1 as const } : {}) });
  }
  if (inc.pursuit?.suspectPos) observePursuit(ri, inc.pursuit, now);
  // Searches: one open at a time.
  const sr = ri.sr?.[ri.sr.length - 1];
  const open = sr && sr.t1 === undefined ? sr : undefined;
  const cur = inc.search;
  if (cur?.center) {
    if (!open || open.t0 !== cur.startedAt) {
      if (open) open.t1 = now;
      const rec: ReplaySearch = { t0: cur.startedAt, c: pt(cur.center), r: cur.radiusKm, p: cur.progress ?? 0 };
      ri.sr = [...(ri.sr ?? []), rec].slice(-SEARCH_KEEP);
    } else {
      open.p = cur.progress ?? open.p;
      open.r = cur.radiusKm;
      if (cur.found) open.f = 1;
    }
  } else if (open) open.t1 = now;
  if (inc.state === 'closed') {
    ri.closed = inc.closedAt ?? now;
    const end = ri.closed;
    const pu = ri.pu?.[ri.pu.length - 1];
    if (pu && pu.t1 === undefined) pu.t1 = Math.max(pu.t0, end);
    const o = ri.sr?.[ri.sr.length - 1];
    if (o && o.t1 === undefined) o.t1 = Math.max(o.t0, end);
    r.open.delete(inc.id);
  }
}

/** Co-op: the seat that sent the crews seen sent this frame, when exactly one seat sent any. */
function senderSeat(r: ReplayRecorder, s: SimState): number | undefined {
  const c = s.coop;
  if (!c?.stats) return undefined;
  let who: number | undefined;
  let several = false;
  for (const [key, st] of Object.entries(c.stats)) {
    const seat = Number(key);
    const n = st?.sent ?? 0;
    const before = r.sent.get(seat) ?? 0;
    if (n > before) {
      if (who !== undefined) several = true;
      who = seat;
    }
    r.sent.set(seat, n);
  }
  return several ? undefined : who;
}

/**
 * Look at the shift once more: every change since the last frame goes into the recording. Cheap (a few hundred
 * comparisons), so the game loop calls it every frame the clock moved.
 */
export function observe(r: ReplayRecorder, s: SimState): void {
  // A co-op resync went back to an earlier moment: wait until the shift is past what is recorded.
  if (!(s.now >= r.last)) return;
  const rep = r.rep;
  const now = s.now;
  if (s.weather) {
    const w = rep.wx[rep.wx.length - 1];
    if (!w || w.w.kind !== s.weather.kind || w.w.tempC !== s.weather.tempC) rep.wx.push({ t: now, w: { ...s.weather } });
  }
  // Crews
  let sends: ReplayMark[] | null = null;
  for (const id of s.unitOrder ?? []) {
    const u = s.units[id];
    if (!u?.pos) continue;
    let k = r.ui.get(id);
    if (k === undefined) {
      k = rep.units.length;
      rep.units.push(newUnit(u));
      r.ui.set(id, k);
    }
    const ru = rep.units[k];
    const inc = u.incidentId || undefined;
    const lst = ru.st[ru.st.length - 1];
    if (!lst || lst.s !== u.status || lst.i !== inc) {
      const lo = lst ? lst.t : -Infinity;
      const t =
        (!lst || lst.s !== u.status) && Number.isFinite(u.statusSince) ? Math.min(now, Math.max(lo, u.statusSince)) : Math.max(lo, now);
      ru.st.push(inc ? { t, s: u.status, i: inc } : { t, s: u.status });
      if (inc && lst && inc !== lst.i) (sends ??= []).push({ t, k: 'send', unit: id, inc });
    }
    const m = u.move && u.move.path?.length ? u.move : undefined;
    const key = m ? moveKey(m.departAt, m.arriveAt, m.path[m.path.length - 1]) : '';
    if (key !== (r.mk.get(id) ?? '')) {
      const prev = ru.mv[ru.mv.length - 1];
      if (prev && prev.p.length > 1 && prev.c === undefined && now < prev.a)
        prev.c = Math.max(prev.t, Math.min(now, m ? m.departAt : now));
      if (m) ru.mv.push(recMove(m, now));
      r.mk.set(id, key);
    }
    if (!m && haversineKm(restOf(ru), u.pos) > JUMP_KM) ru.mv.push({ t: now, d: now, a: now, p: [pt(u.pos)], u: 'patrol' });
  }
  if (sends) {
    const seat = s.coop ? senderSeat(r, s) : undefined;
    for (const x of sends) rep.marks.push(seat !== undefined ? { ...x, seat } : x);
  } else if (s.coop) senderSeat(r, s);
  // Incidents: the new ones, then the open ones.
  const order = s.incidentOrder ?? [];
  for (let k = r.seen; k < order.length; k++) {
    const inc = s.incidents[order[k]];
    if (!inc) continue;
    const at = r.ii.get(inc.id);
    if (at === undefined) addIncident(r, s, inc);
    else if (rep.incidents[at].closed === undefined) r.open.add(inc.id);
  }
  r.seen = order.length;
  for (const id of [...r.open]) {
    const inc = s.incidents[id];
    const at = r.ii.get(id);
    if (!inc || at === undefined) {
      r.open.delete(id);
      continue;
    }
    observeIncident(r, s, inc, rep.incidents[at]);
  }
  // Calls
  for (const call of s.calls ?? []) {
    let k = r.ci.get(call.id);
    if (k === undefined) {
      k = rep.calls.length;
      rep.calls.push({ id: call.id, t: call.ringingSince, i: call.incidentId });
      r.ci.set(call.id, k);
    }
    const rc = rep.calls[k];
    if (rc.a === undefined && call.answeredAt !== undefined) {
      rc.a = call.answeredAt;
      const seat = s.coop?.callSeat?.[call.id];
      if (typeof seat === 'number') rc.seat = seat;
    }
    if (rc.e === undefined && call.endedAt !== undefined) {
      rc.e = call.endedAt;
      if (call.answeredAt === undefined) rc.m = 1;
    }
  }
  rep.to = now;
  r.last = now;
}

function recorderOf(rep: ShiftReplay): ReplayRecorder {
  return {
    rep,
    ui: new Map(),
    ii: new Map(),
    ci: new Map(),
    mk: new Map(),
    open: new Set(),
    seen: 0,
    last: rep.to,
    sent: new Map(),
  };
}

/** Start recording a shift (at its start, or wherever it is when this device first sees it). */
export function startRecording(s: SimState, key: string): ReplayRecorder {
  // The first minute holds nothing a later start would miss: the recording counts from the shift's start.
  const from = s.now - s.startTime < 2 * 60_000 ? Math.min(s.now, s.startTime) : s.now;
  const rep: ShiftReplay = {
    v: REPLAY_VERSION,
    key,
    seed: s.seed,
    regionId: s.regionId,
    ...(s.sectors?.length ? { sectors: [...s.sectors] } : {}),
    ...(s.coverSectors?.length ? { cover: [...s.coverSectors] } : {}),
    mode: s.mode,
    difficulty: s.difficulty,
    playerName: s.playerName,
    start: s.startTime,
    end: s.endTime,
    from,
    to: from,
    units: [],
    incidents: [],
    calls: [],
    marks: [],
    wx: [],
  };
  const r = recorderOf(rep);
  for (const id of s.unitOrder ?? []) {
    const u = s.units[id];
    if (!u?.pos) continue;
    r.ui.set(id, rep.units.length);
    rep.units.push(newUnit(u));
  }
  if (s.coop) for (const [seat, st] of Object.entries(s.coop.stats ?? {})) r.sent.set(Number(seat), st?.sent ?? 0);
  observe(r, s);
  return r;
}

/**
 * Cut a recording back to time `at` (it went on past the moment the shift is resumed from: an older save, a save from
 * another device): everything later goes, what had ended later is open again.
 */
export function truncateReplay(rep: ShiftReplay, at: number): void {
  if (rep.to <= at) return;
  for (const u of rep.units) {
    const keep = u.st.filter((x, i) => i === 0 || x.t <= at);
    u.st = keep;
    u.mv = u.mv.filter((m) => m.t <= at);
    for (const m of u.mv) if (m.c !== undefined && m.c > at) delete m.c;
  }
  const gone = new Set<string>();
  rep.incidents = rep.incidents.filter((x) => {
    if (x.created > at) {
      gone.add(x.id);
      return false;
    }
    return true;
  });
  for (const x of rep.incidents) {
    x.st = x.st.filter((k, i) => i === 0 || k.t <= at);
    if (x.shown !== undefined && x.shown > at) delete x.shown;
    if (x.closed !== undefined && x.closed > at) delete x.closed;
    if (x.pu) {
      x.pu = x.pu.filter((q) => q.t0 <= at);
      for (const q of x.pu) {
        q.pts = q.pts.filter((p) => p[0] <= at);
        if (q.t1 !== undefined && q.t1 > at) {
          delete q.t1;
          delete q.end;
        }
      }
      if (!x.pu.length) delete x.pu;
    }
    if (x.sr) {
      x.sr = x.sr.filter((q) => q.t0 <= at);
      for (const q of x.sr) if (q.t1 !== undefined && q.t1 > at) delete q.t1;
      if (!x.sr.length) delete x.sr;
    }
  }
  rep.calls = rep.calls.filter((c) => c.t <= at && !gone.has(c.i));
  for (const c of rep.calls) {
    if (c.a !== undefined && c.a > at) delete c.a;
    if (c.e !== undefined && c.e > at) {
      delete c.e;
      delete c.m;
    }
  }
  rep.marks = rep.marks.filter((m) => m.t <= at && !(m.inc && gone.has(m.inc)));
  rep.wx = rep.wx.filter((w, i) => i === 0 || w.t <= at);
  if (rep.gaps) rep.gaps = rep.gaps.filter((g) => g[0] < at).map((g) => [g[0], Math.min(g[1], at)] as [number, number]);
  rep.to = Math.max(rep.from, at);
}

/**
 * Go on with a recording kept from earlier (the page was reloaded): the time between its last moment and now is a gap
 * when it is longer than a minute. A recording that began after this moment of the shift (an older save of it was
 * loaded) cannot go on: a new one starts.
 */
export function resumeRecording(rep: ShiftReplay, s: SimState): ReplayRecorder {
  if (s.now < rep.from) return startRecording(s, rep.key);
  truncateReplay(rep, s.now);
  const r = recorderOf(rep);
  rep.units.forEach((u, i) => {
    r.ui.set(u.id, i);
    const m = u.mv[u.mv.length - 1];
    if (m && m.p.length > 1 && m.c === undefined && m.a > rep.to) r.mk.set(u.id, moveKey(m.d, m.a, m.p[m.p.length - 1]));
  });
  rep.incidents.forEach((x, i) => {
    r.ii.set(x.id, i);
    if (x.closed === undefined) r.open.add(x.id);
  });
  rep.calls.forEach((x, i) => r.ci.set(x.id, i));
  if (s.coop) for (const [seat, st] of Object.entries(s.coop.stats ?? {})) r.sent.set(Number(seat), st?.sent ?? 0);
  if (s.now - rep.to > 60_000) rep.gaps = [...(rep.gaps ?? []), [rep.to, s.now]];
  r.last = Math.min(rep.to, s.now);
  observe(r, s);
  return r;
}

/** The recording belongs to this shift and this version can play it. */
export function isReplay(x: unknown): x is ShiftReplay {
  if (!x || typeof x !== 'object') return false;
  const r = x as Partial<ShiftReplay>;
  return (
    r.v === REPLAY_VERSION &&
    typeof r.key === 'string' &&
    typeof r.start === 'number' &&
    typeof r.from === 'number' &&
    typeof r.to === 'number' &&
    Array.isArray(r.units) &&
    Array.isArray(r.incidents) &&
    Array.isArray(r.calls) &&
    Array.isArray(r.marks) &&
    Array.isArray(r.wx)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The end
// ─────────────────────────────────────────────────────────────────────────────

const markOrder: Record<ReplayMarkKind, number> = { crisis: 0, pursuit: 1, call: 2, send: 3, good: 4, bad: 5 };

/**
 * The shift is over: the last frame, what only the end knows (the crews' kilometres and desks, the incidents' results,
 * the agencies asked for), the calls, pursuits, crisis and highlights as marks. The recorder is not used after this.
 */
export function finishRecording(r: ReplayRecorder, s: SimState, report?: ShiftReport | null): ShiftReplay {
  observe(r, s);
  const rep = r.rep;
  rep.to = Math.max(rep.to, s.now);
  const sec = s.coop?.sec;
  for (const ru of rep.units) {
    const u = s.units[ru.id];
    if (!u) continue;
    ru.callsign = u.callsign;
    ru.type = u.type;
    ru.vehicle = u.vehicle;
    ru.stationId = u.stationId;
    const km = Number(s.flags?.[`km:${u.id}`]);
    if (Number.isFinite(km) && km > 0) ru.km = km;
    const desk = sec?.homeUnit?.[u.id] ?? sec?.unitDesk?.[u.id];
    if (desk !== undefined) ru.desk = desk;
  }
  // Incidents the frames never saw (none, unless the recording began late): kept as they ended.
  for (const id of s.incidentOrder ?? []) {
    const inc = s.incidents[id];
    if (inc && !r.ii.has(id)) addIncident(r, s, inc);
  }
  for (const ri of rep.incidents) {
    const inc = s.incidents[ri.id];
    if (!inc) continue;
    Object.assign(ri, staticOf(inc));
    if (inc.closedBy) ri.closedBy = inc.closedBy;
    if (inc.outcome) {
      ri.result = inc.outcome.result;
      ri.score = Math.round(inc.outcome.score);
      if (inc.outcome.arrests) ri.arrests = inc.outcome.arrests;
    }
    ri.units = [...(inc.unitHistory ?? [])];
    const agency = (inc.agencyNeeds ?? [])
      .map((n) => n.requested)
      .filter((q): q is NonNullable<typeof q> => !!q && Number.isFinite(q.requestedAt) && Number.isFinite(q.arriveAt))
      .map((q) => ({ a: q.agency, r: q.requestedAt, at: q.arriveAt }));
    if (agency.length) ri.agency = agency;
    const desk = sec?.homeInc?.[inc.id] ?? sec?.incDesk?.[inc.id];
    if (desk !== undefined) ri.desk = desk;
  }
  const marks: ReplayMark[] = rep.marks.filter((m) => m.k === 'send');
  for (const c of rep.calls)
    marks.push({ t: c.t, k: 'call', inc: c.i, ...(c.m ? { miss: 1 as const } : {}), ...(c.seat !== undefined ? { seat: c.seat } : {}) });
  for (const ri of rep.incidents) for (const q of ri.pu ?? []) marks.push({ t: q.t0, k: 'pursuit', t1: q.t1 ?? rep.to, inc: ri.id });
  const cr = s.crisis;
  if (cr && cr.phase !== 'due' && cr.due <= rep.to) {
    rep.crisis = {
      id: cr.id,
      t0: cr.due,
      ...(cr.endedAt !== undefined ? { t1: cr.endedAt } : {}),
      center: pt(cr.center),
      address: cr.address,
      ...(cr.result !== undefined ? { result: cr.result } : {}),
    };
    marks.push({ t: cr.due, k: 'crisis', t1: cr.endedAt ?? rep.to });
  }
  for (const h of report?.highlights ?? []) {
    const ri = rep.incidents[r.ii.get(h.incidentId) ?? -1];
    if (ri) marks.push({ t: ri.shown ?? ri.created, k: h.good ? 'good' : 'bad', inc: ri.id });
  }
  rep.marks = marks.sort((a, b) => a.t - b.t || markOrder[a.k] - markOrder[b.k]);
  const c = s.coop;
  if (c) {
    rep.coop = c.mode;
    rep.room = c.code;
    rep.seats = c.seats.map((x) => ({
      seat: x.seat,
      name: x.name,
      ...(x.desk ? { desk: x.desk } : {}),
      ...(x.role ? { role: x.role } : {}),
    }));
  } else if (typeof s.flags?.room === 'string') rep.room = s.flags.room;
  if (report) {
    rep.score = Math.round(report.score);
    rep.grade = report.grade;
  }
  rep.done = true;
  return rep;
}
