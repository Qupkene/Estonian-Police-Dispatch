/**
 * Playing a replay back (src/sim/replay.ts, docs/REPLAY.md): a SimState-shaped view of any moment for the game's own
 * map (src/map draws it as it draws a running shift: crews on the roads, other agencies at the scenes, pursuits and
 * searches), and what the viewer asks of the recording: a crew's statuses and jobs, an incident's times, the feed of
 * what just happened, the load curve and the marks to jump between.
 */
import { emptyStats } from './engine';
import { cumulative } from './geo';
import { MIN } from './time';
import type { Incident, LngLat, Movement, PursuitState, SimState, Unit, UnitStatus, Weather } from './types';
import {
  lastAtOrBefore,
  movePosAt,
  type ReplayCall,
  type ReplayIncident,
  type ReplayMark,
  type ReplayMarkKind,
  type ReplayMove,
  type ReplayPursuit,
  type ReplayUnit,
  type ShiftReplay,
} from './replay';

/** Closed incidents stay in the frame this long (the map greys them and fades them out after two minutes). */
const CLOSED_KEEP_MS = 3 * MIN;
/** The pursuit trail drawn behind the fleeing vehicle: at most this many samples. */
const TRAIL_MAX = 120;
/** Statuses in which a crew counts as one of an incident's assigned crews. */
const ASSIGNED: ReadonlySet<UnitStatus> = new Set<UnitStatus>(['enroute', 'onscene', 'transport', 'emergency']);

const NO_TEXT = { et: '', en: '' };
const CALM: Weather = { kind: 'clear', tempC: 10, windMs: 2, roadFactor: 1, text: NO_TEXT };

const movements = new WeakMap<ReplayMove, Movement>();
/** The engine's movement for a recorded one (one object per movement, so the map's road layer keeps its route). */
function movementOf(m: ReplayMove): Movement {
  let x = movements.get(m);
  if (!x) {
    x = { purpose: m.u, path: m.p, cum: cumulative(m.p), departAt: m.d, arriveAt: m.a, siren: !!m.s };
    movements.set(m, x);
  }
  return x;
}

/** A crew at time t: its status, the incident it works on, its movement while it is on one, where it is. */
export interface UnitAt {
  status: UnitStatus;
  since: number;
  inc?: string;
  move?: ReplayMove;
  pos: LngLat;
  heading: number;
}

export function unitAt(u: ReplayUnit, t: number): UnitAt {
  const k = lastAtOrBefore(u.st, t, (x) => x.t);
  const st = u.st[Math.max(0, k)];
  const status: UnitStatus = st?.s ?? 'available';
  const base = { status, since: st?.t ?? t, ...(st?.i ? { inc: st.i } : {}) };
  const j = lastAtOrBefore(u.mv, t, (m) => m.t);
  if (j < 0) return { ...base, pos: u.p0, heading: 0 };
  const m = u.mv[j];
  if (m.p.length < 2) return { ...base, pos: m.p[0], heading: 0 };
  const at = movePosAt(m, t);
  return t < Math.min(m.a, m.c ?? Infinity) ? { ...base, move: m, ...at } : { ...base, ...at };
}

/** Where the pursued vehicle was at time t, between two samples. */
export function suspectAt(pts: ReplayPursuit['pts'], t: number): { pos: LngLat; heading: number; j: number } | null {
  const j = lastAtOrBefore(pts, t, (p) => p[0]);
  if (j < 0) return pts.length ? { pos: [pts[0][1], pts[0][2]] as LngLat, heading: pts[0][3], j: 0 } : null;
  const a = pts[j];
  const b = pts[j + 1];
  if (!b || b[0] <= a[0]) return { pos: [a[1], a[2]] as LngLat, heading: a[3], j };
  const f = (t - a[0]) / (b[0] - a[0]);
  return { pos: [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f] as LngLat, heading: b[3], j };
}

/** The weather at time t. */
export function weatherAt(rep: ShiftReplay, t: number): Weather {
  const k = lastAtOrBefore(rep.wx, t, (x) => x.t);
  return rep.wx[Math.max(0, k)]?.w ?? CALM;
}

function newUnit(u: ReplayUnit): Unit {
  return {
    id: u.id,
    callsign: u.callsign,
    type: u.type,
    stationId: u.stationId,
    zone: '',
    vehicle: u.vehicle,
    crew: [],
    status: 'available',
    statusSince: 0,
    pos: u.p0,
    heading: 0,
    fatigue: 0,
    breaks: 0,
    handled: 0,
  };
}

function newIncident(x: ReplayIncident): Incident {
  return {
    id: x.id,
    number: x.number,
    templateId: x.templateId,
    ...(x.scenarioId ? { scenarioId: x.scenarioId } : {}),
    category: x.category,
    code: x.code,
    title: x.title,
    priority: x.st[0]?.p ?? x.truePriority,
    truePriority: x.truePriority,
    state: 'incoming',
    source: x.source,
    createdAt: x.created,
    location: {
      address: x.address,
      coord: x.coord,
      city: x.city,
      ...(x.district ? { district: x.district } : {}),
      ...(x.placeName ? { placeName: x.placeName } : {}),
      placeKind: x.placeKind,
      zone: x.zone,
    },
    summary: NO_TEXT,
    details: [],
    hiddenDetails: [],
    persons: [],
    vehicles: [],
    assigned: [],
    unitHistory: x.units,
    need: [],
    ideal: [],
    onSceneMin: 0,
    workDone: 0,
    slaMin: 0,
    beats: [],
    agencyNeeds: [],
    effects: { success: 0, risk: 0, trust: 0, time: 0, arrests: 0 },
    timeline: [],
    tags: x.tags ? [...x.tags] : [],
    ...(x.closedBy ? { closedBy: x.closedBy } : {}),
  };
}

/**
 * The replay as a shift at one moment. `at(t)` moves the same state object (the map keeps drawing it, as it draws a
 * running shift); `jump(t)` makes a new one, for a jump: the map's road layer then starts over instead of driving the
 * crews from where they were shown to where they are now.
 */
export class ReplayFrame {
  state: SimState;
  t: number;
  private units: Unit[] = [];
  private incs = new Map<string, Incident>();
  /** Incidents that showed, by the time they showed. */
  private order: ReplayIncident[];
  private shownAt: number[];
  private byId = new Map<string, ReplayIncident>();

  constructor(readonly rep: ShiftReplay) {
    this.order = rep.incidents.filter((x) => x.shown !== undefined).sort((a, b) => a.shown! - b.shown!);
    this.shownAt = this.order.map((x) => x.shown!);
    for (const x of rep.incidents) this.byId.set(x.id, x);
    this.t = rep.from;
    this.state = this.fresh();
    this.at(rep.from);
  }

  private fresh(): SimState {
    const rep = this.rep;
    this.units = rep.units.map(newUnit);
    this.incs = new Map();
    const units: Record<string, Unit> = {};
    for (const u of this.units) units[u.id] = u;
    return {
      version: 2,
      seed: rep.seed,
      rng: 0,
      mode: rep.mode,
      difficulty: rep.difficulty,
      regionId: rep.regionId,
      playerName: rep.playerName,
      startTime: rep.start,
      endTime: rep.end,
      now: this.t,
      ended: false,
      weather: weatherAt(rep, this.t),
      units,
      unitOrder: this.units.map((u) => u.id),
      incidents: {},
      incidentOrder: [],
      persons: {},
      vehicles: {},
      radio: [],
      calls: [],
      bulletins: [],
      queries: [],
      events: [],
      seq: { incident: 0, radio: 0, person: 0, call: 0, bulletin: 0 },
      nextSpawnAt: Infinity,
      trust: 50,
      stats: emptyStats(),
      flags: {},
      ...(rep.sectors ? { sectors: rep.sectors } : {}),
      ...(rep.cover ? { coverSectors: rep.cover } : {}),
    };
  }

  /** Jump to time t with a new state object. */
  jump(t: number): void {
    this.t = this.clamp(t);
    this.state = this.fresh();
    this.at(this.t);
  }

  clamp(t: number): number {
    return Math.max(this.rep.from, Math.min(this.rep.to, t));
  }

  /** Move the state to time t. */
  at(time: number): void {
    const t = this.clamp(time);
    // Back in time (a drag): every incident is looked at again, the long closed ones too.
    const back = t < this.t;
    this.t = t;
    const s = this.state;
    const rep = this.rep;
    s.now = t;
    const w = weatherAt(rep, t);
    if (s.weather !== w) s.weather = w;
    // Crews
    const assigned = new Map<string, string[]>();
    rep.units.forEach((ru, i) => {
      const u = this.units[i];
      const a = unitAt(ru, t);
      if (u.status !== a.status) u.status = a.status;
      u.statusSince = a.since;
      if (a.inc) u.incidentId = a.inc;
      else delete u.incidentId;
      if (a.move) {
        const m = movementOf(a.move);
        if (u.move !== m) u.move = m;
      } else if (u.move) delete u.move;
      u.pos = a.pos;
      u.heading = a.heading;
      if (a.inc && ASSIGNED.has(a.status)) {
        const list = assigned.get(a.inc);
        if (list) list.push(u.id);
        else assigned.set(a.inc, [u.id]);
      }
    });
    // Incidents that have showed by now
    const n = lastAtOrBefore(this.shownAt, t, (x) => x) + 1;
    if (n !== s.incidentOrder.length) {
      s.incidentOrder = this.order.slice(0, n).map((x) => x.id);
      for (const id of Object.keys(s.incidents)) if (!s.incidentOrder.includes(id)) delete s.incidents[id];
    }
    for (let k = 0; k < n; k++) {
      const x = this.order[k];
      let inc = this.incs.get(x.id);
      if (!inc) {
        inc = newIncident(x);
        this.incs.set(x.id, inc);
      }
      s.incidents[x.id] = inc;
      // Long closed and already shown so: nothing changes any more (going on; back in time it may).
      if (!back && inc.state === 'closed' && x.closed !== undefined && t - x.closed > CLOSED_KEEP_MS) continue;
      this.incidentAt(x, inc, t, assigned.get(x.id));
    }
  }

  private incidentAt(x: ReplayIncident, inc: Incident, t: number, crews: string[] | undefined): void {
    const k = lastAtOrBefore(x.st, t, (q) => q.t);
    const st = x.st[Math.max(0, k)];
    const closed = x.closed !== undefined && t >= x.closed;
    inc.state = closed ? 'closed' : st.s === 'closed' ? 'onscene' : st.s;
    inc.priority = st.p;
    if (st.e) inc.escalated = true;
    else delete inc.escalated;
    if (closed) inc.closedAt = x.closed;
    else delete inc.closedAt;
    inc.assigned = closed ? [] : (crews ?? []);
    // The pursuit (the latest one begun by now)
    const pu = x.pu ? x.pu[lastAtOrBefore(x.pu, t, (q) => q.t0)] : undefined;
    if (pu && pu.pts.length) {
      const at = suspectAt(pu.pts, t)!;
      const ended = pu.t1 !== undefined && t >= pu.t1 ? (pu.end ?? 'terminated') : undefined;
      const trail = pu.pts.slice(Math.max(0, at.j + 1 - TRAIL_MAX), at.j + 1).map((p) => [p[1], p[2]] as LngLat);
      const p: PursuitState = {
        suspectPos: at.pos,
        heading: at.heading,
        speedKmh: 0,
        startedAt: pu.t0,
        risk: 0,
        pressure: 0,
        heli: !!pu.heli,
        spikes: false,
        trail,
        ...(ended ? { ended } : {}),
      };
      inc.pursuit = p;
    } else delete inc.pursuit;
    // The search going on, its progress growing towards where it got
    const sr = x.sr?.find((q) => t >= q.t0 && t < (q.t1 ?? x.closed ?? this.rep.to + 1));
    if (sr) {
      const end = sr.t1 ?? this.rep.to;
      const f = end > sr.t0 ? Math.min(1, (t - sr.t0) / (end - sr.t0)) : 1;
      inc.search = { center: sr.c, radiusKm: sr.r, progress: sr.p * f, startedAt: sr.t0, ...(sr.f && f >= 1 ? { found: true } : {}) };
    } else delete inc.search;
    // Other agencies asked for by now (the map drives them to the scene by these times)
    const ag = x.agency?.filter((q) => q.r <= t) ?? [];
    if (ag.length !== inc.agencyNeeds.length || ag.some((q, i) => inc.agencyNeeds[i]?.requested?.arrived !== t >= q.at)) {
      inc.agencyNeeds = ag.map((q) => ({
        agency: q.a,
        reason: NO_TEXT,
        requested: { agency: q.a, requestedAt: q.r, arriveAt: q.at, ...(t >= q.at ? { arrived: true } : {}) },
      }));
    }
  }

  incident(id: string): ReplayIncident | undefined {
    return this.byId.get(id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// What the viewer asks
// ─────────────────────────────────────────────────────────────────────────────

/** The timeline's extent: from the shift's start to its real end (earlier when it was ended early, later in overtime). */
export function replaySpan(rep: ShiftReplay): { t0: number; t1: number } {
  const t0 = Math.min(rep.start, rep.from);
  return { t0, t1: Math.max(rep.to, t0 + MIN) };
}

/** How many incidents were open (shown, not closed) at `n` evenly spaced moments of the timeline. */
export function loadCurve(rep: ShiftReplay, n: number): number[] {
  const { t0, t1 } = replaySpan(rep);
  const out = new Array<number>(n).fill(0);
  const step = (t1 - t0) / n;
  for (const x of rep.incidents) {
    if (x.shown === undefined || x.closedBy === 'duplicate' || x.closedBy === 'prank') continue;
    const end = x.closed ?? rep.to;
    const a = Math.max(0, Math.ceil((x.shown - t0) / step - 0.5));
    const b = Math.min(n - 1, Math.floor((end - t0) / step - 0.5));
    for (let i = a; i <= b; i++) out[i]++;
  }
  return out;
}

/** A crew's status spans between `from` and `to`. */
export function statusSpans(u: ReplayUnit, from: number, to: number): { t0: number; t1: number; s: UnitStatus; i?: string }[] {
  const out: { t0: number; t1: number; s: UnitStatus; i?: string }[] = [];
  u.st.forEach((x, k) => {
    const t0 = Math.max(from, x.t);
    const t1 = Math.min(to, u.st[k + 1]?.t ?? to);
    if (t1 <= t0) return;
    const last = out[out.length - 1];
    if (last && last.s === x.s && last.i === x.i && last.t1 === t0) last.t1 = t1;
    else out.push({ t0, t1, s: x.s, ...(x.i ? { i: x.i } : {}) });
  });
  return out;
}

/** The incidents a crew worked on: when it was given each and when it was done with it, in time order. */
export function unitJobs(u: ReplayUnit, to: number): { inc: string; t0: number; t1: number }[] {
  const out: { inc: string; t0: number; t1: number }[] = [];
  let cur: { inc: string; t0: number; t1: number } | null = null;
  u.st.forEach((x, k) => {
    const next = u.st[k + 1]?.t ?? to;
    if (x.i && cur && cur.inc === x.i) cur.t1 = next;
    else if (x.i) {
      cur = { inc: x.i, t0: x.t, t1: next };
      out.push(cur);
    } else cur = null;
  });
  return out;
}

/** An incident's moments: the call, when it showed, the first crew sent, the first on scene, when it closed. */
export function incidentTimes(
  rep: ShiftReplay,
  x: ReplayIncident,
): { call?: ReplayCall; shown?: number; sent?: number; arrived?: number; closed?: number } {
  let sent: number | undefined;
  let arrived: number | undefined;
  for (const u of rep.units)
    for (const s of u.st) {
      if (s.i !== x.id) continue;
      if (s.s === 'enroute' && (sent === undefined || s.t < sent)) sent = s.t;
      if (s.s === 'onscene' && (arrived === undefined || s.t < arrived)) arrived = s.t;
    }
  const call = rep.calls.find((c) => c.i === x.id);
  return {
    ...(call ? { call } : {}),
    ...(x.shown !== undefined ? { shown: x.shown } : {}),
    ...(sent !== undefined ? { sent } : {}),
    ...(arrived !== undefined ? { arrived } : {}),
    ...(x.closed !== undefined ? { closed: x.closed } : {}),
  };
}

export type FeedKind = 'call' | 'missed' | 'card' | 'send' | 'arrive' | 'pursuit' | 'pursuitEnd' | 'closed' | 'crisis';

/** One line of the feed of what just happened. */
export interface FeedItem {
  t: number;
  k: FeedKind;
  inc?: string;
  unit?: string;
  seat?: number;
  /** A pursuit's end. */
  end?: string;
}

const feeds = new WeakMap<ShiftReplay, FeedItem[]>();

/** Everything the feed can show, in time order (built once per replay). */
export function feedOf(rep: ShiftReplay): FeedItem[] {
  let list = feeds.get(rep);
  if (list) return list;
  list = [];
  for (const c of rep.calls) list.push({ t: c.t, k: c.m ? 'missed' : 'call', inc: c.i, ...(c.seat !== undefined ? { seat: c.seat } : {}) });
  const fromCall = new Set(rep.calls.map((c) => c.i));
  for (const x of rep.incidents) {
    if (x.shown !== undefined && !fromCall.has(x.id)) list.push({ t: x.shown, k: 'card', inc: x.id });
    if (x.closed !== undefined && x.shown !== undefined) list.push({ t: x.closed, k: 'closed', inc: x.id });
    for (const q of x.pu ?? []) {
      list.push({ t: q.t0, k: 'pursuit', inc: x.id });
      if (q.t1 !== undefined) list.push({ t: q.t1, k: 'pursuitEnd', inc: x.id, ...(q.end ? { end: q.end } : {}) });
    }
  }
  for (const m of rep.marks)
    if (m.k === 'send') list.push({ t: m.t, k: 'send', inc: m.inc, unit: m.unit, ...(m.seat !== undefined ? { seat: m.seat } : {}) });
  for (const u of rep.units)
    u.st.forEach((s, k) => {
      const prev = u.st[k - 1];
      if (s.s === 'onscene' && s.i && !(prev?.s === 'onscene' && prev.i === s.i)) list.push({ t: s.t, k: 'arrive', inc: s.i, unit: u.id });
    });
  if (rep.crisis) list.push({ t: rep.crisis.t0, k: 'crisis' });
  list.sort((a, b) => a.t - b.t);
  feeds.set(rep, list);
  return list;
}

/** The last `n` feed lines at or before t, newest first. */
export function feedAt(rep: ShiftReplay, t: number, n: number): FeedItem[] {
  const list = feedOf(rep);
  const k = lastAtOrBefore(list, t, (x) => x.t);
  const out: FeedItem[] = [];
  for (let i = k; i >= 0 && out.length < n; i--) out.push(list[i]);
  return out;
}

/**
 * The next (dir 1) or previous (dir -1) mark of the given kinds, or null. `lead`: a jump lands this long before a
 * mark, so the mark just jumped to is not found again.
 */
export function nextMark(
  rep: ShiftReplay,
  t: number,
  dir: 1 | -1,
  kinds?: ReadonlySet<ReplayMarkKind>,
  lead = 0,
): ReplayMark | null {
  const ok = (m: ReplayMark) => (!kinds || kinds.has(m.k)) && m.t >= rep.from && m.t <= rep.to;
  if (dir > 0) {
    for (const m of rep.marks) if (m.t > t + lead + 999 && ok(m)) return m;
    return null;
  }
  for (let i = rep.marks.length - 1; i >= 0; i--) {
    const m = rep.marks[i];
    if (m.t < t + lead - 1000 && ok(m)) return m;
  }
  return null;
}

/** The crews working on an incident at time t (on their way, on scene, chasing), the first sent first. */
export function crewsAt(rep: ShiftReplay, incId: string, t: number): string[] {
  const out: { id: string; since: number }[] = [];
  for (const u of rep.units) {
    const a = unitAt(u, t);
    if (a.inc === incId && ASSIGNED.has(a.status)) out.push({ id: u.id, since: a.since });
  }
  return out.sort((a, b) => a.since - b.since).map((x) => x.id);
}

const chases = new WeakMap<ShiftReplay, { t0: number; t1: number; x: ReplayIncident }[]>();

/** The pursuit going on at time t (the replay slows down for it), or null. Asked every frame: the spans are built once. */
export function pursuitAt(rep: ShiftReplay, t: number): ReplayIncident | null {
  let list = chases.get(rep);
  if (!list) {
    list = rep.incidents
      .flatMap((x) => (x.pu ?? []).map((q) => ({ t0: q.t0, t1: q.t1 ?? rep.to, x })))
      .sort((a, b) => a.t0 - b.t0);
    chases.set(rep, list);
  }
  for (let i = lastAtOrBefore(list, t, (c) => c.t0); i >= 0; i--) if (t < list[i].t1) return list[i].x;
  return null;
}

/** Counts for the report's card: calls, crews sent, pursuits, incidents, kilometres. */
export function replayCounts(rep: ShiftReplay): { calls: number; sends: number; pursuits: number; incidents: number; km: number } {
  return {
    calls: rep.calls.length,
    sends: rep.marks.filter((m) => m.k === 'send').length,
    pursuits: rep.incidents.reduce((a, x) => a + (x.pu?.length ?? 0), 0),
    incidents: rep.incidents.filter((x) => x.shown !== undefined).length,
    km: Math.round(rep.units.reduce((a, u) => a + (u.km ?? 0), 0)),
  };
}
