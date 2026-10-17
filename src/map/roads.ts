/**
 * Display layer that puts the map on real roads and buildings (the engine is not involved).
 *
 * The engine moves a unit along a straight polyline between departAt and arriveAt; the map draws it
 * at the same fraction of a road route instead, rotated along the road, and draws the route line on
 * the roads. Incident markers sit at the building (or road) next to the incident's coordinate,
 * computed once per incident. Parked patrol cars stand on the nearest road.
 *
 * Data: roads-v1.bin and buildings-v1.bin from `${BASE_URL}tiles/` (scripts/build-mapdata.mjs builds
 * them from the street map on the server). They are fetched lazily, once per page, in a worker; when
 * they are missing (404, HTML fallback, network error) or workers fail, everything silently shows
 * the engine's own positions, exactly as before.
 *
 * Requests are asynchronous: a route or snap that is not answered yet shows the previous position
 * for a moment (PENDING_HOLD_MS), so markers never flicker between two places.
 */
import type { Incident, LngLat, Movement, PlaceKind, SimState, Unit } from '@/sim/types';
import {
  computeRoute,
  loadRoadData,
  pathEnds,
  pathFromPoints,
  pointAtFraction,
  remainingAt,
  snapPoint,
  type DisplayPath,
  type RoadData,
  type RouteAnswer,
  type SnapKind,
} from './roadGraph';

export type RoadsState = 'idle' | 'loading' | 'ready' | 'missing';
type Why = 'ok' | 'missing' | 'network';

// ---------------------------------------------------------------------------- worker protocol

export type WorkerRequest =
  | { type: 'init'; base: string }
  | {
      type: 'route';
      id: number;
      from: LngLat;
      fromSnap: SnapKind | null;
      to: LngLat;
      toSnap: SnapKind | null;
    }
  | { type: 'snap'; id: number; p: LngLat; kind: SnapKind };

export type WorkerReply =
  | { type: 'ready'; roads: Why; buildings: Why }
  | { type: 'route'; id: number; answer: RouteAnswer }
  | { type: 'snap'; id: number; p: LngLat | null };

interface Backend {
  init(base: string): Promise<{ roads: Why; buildings: Why }>;
  route(from: LngLat, fromSnap: SnapKind | null, to: LngLat, toSnap: SnapKind | null): Promise<RouteAnswer>;
  snap(p: LngLat, kind: SnapKind): Promise<LngLat | null>;
  destroy(): void;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Everything on the calling thread (no Worker support, or the worker failed to start). */
class InlineBackend implements Backend {
  private data: RoadData | null = null;
  constructor(private fetchFn: FetchLike) {}
  async init(base: string) {
    const r = await loadRoadData(base, this.fetchFn);
    this.data = r.data;
    return { roads: r.roads, buildings: r.buildings };
  }
  async route(from: LngLat, fromSnap: SnapKind | null, to: LngLat, toSnap: SnapKind | null) {
    return this.data ? computeRoute(this.data, from, fromSnap, to, toSnap) : { from, to, path: null };
  }
  async snap(p: LngLat, kind: SnapKind) {
    return this.data ? snapPoint(this.data, p, kind) : null;
  }
  destroy() {
    this.data = null;
  }
}

class WorkerBackend implements Backend {
  private w: Worker;
  private seq = 0;
  private waiting = new Map<number, (r: WorkerReply) => void>();
  private onReady: ((r: { roads: Why; buildings: Why }) => void) | null = null;
  private onFail: ((e: unknown) => void) | null = null;

  constructor() {
    this.w = new Worker(new URL('./roadWorker.ts', import.meta.url), { type: 'module', name: 'epd-roads' });
    this.w.onmessage = (ev: MessageEvent<WorkerReply>) => {
      const m = ev.data;
      if (m.type === 'ready') {
        this.onReady?.({ roads: m.roads, buildings: m.buildings });
        this.onReady = null;
        this.onFail = null;
        return;
      }
      const done = this.waiting.get(m.id);
      if (done) {
        this.waiting.delete(m.id);
        done(m);
      }
    };
    this.w.onerror = (e) => {
      e.preventDefault?.();
      this.onFail?.(e);
      this.onFail = null;
      this.onReady = null;
      // Settle everything still waiting: the callers fall back to straight lines.
      for (const [id, done] of this.waiting) done({ type: 'snap', id, p: null });
      this.waiting.clear();
    };
  }

  init(base: string) {
    return new Promise<{ roads: Why; buildings: Why }>((resolve, reject) => {
      this.onReady = resolve;
      this.onFail = reject;
      this.w.postMessage({ type: 'init', base } satisfies WorkerRequest);
    });
  }

  private ask(req: WorkerRequest & { id: number }): Promise<WorkerReply> {
    return new Promise((resolve) => {
      this.waiting.set(req.id, resolve);
      this.w.postMessage(req);
    });
  }

  async route(
    from: LngLat,
    fromSnap: SnapKind | null,
    to: LngLat,
    toSnap: SnapKind | null,
  ): Promise<RouteAnswer> {
    const r = await this.ask({ type: 'route', id: ++this.seq, from, fromSnap, to, toSnap });
    return r.type === 'route' ? r.answer : { from, to, path: null };
  }

  async snap(p: LngLat, kind: SnapKind): Promise<LngLat | null> {
    const r = await this.ask({ type: 'snap', id: ++this.seq, p, kind });
    return r.type === 'snap' ? r.p : null;
  }

  destroy() {
    this.w.terminate();
  }
}

// ---------------------------------------------------------------------------- service

export interface RouteEntry {
  done: boolean;
  /** performance.now() of the request. */
  at: number;
  answer?: RouteAnswer;
}

export interface SnapEntry {
  done: boolean;
  at: number;
  p?: LngLat | null;
}

const MAX_ROUTES = 300;
const MAX_SNAPS = 4000;

/** Loads the data once and caches route and snap answers. One per base URL and page. */
export class RoadService {
  state: RoadsState = 'idle';
  /** Changes when the data becomes ready, so display state built without it is recomputed. */
  gen = 0;
  /** Why the files are not used (diagnostics): roads, buildings. */
  why: { roads: Why | 'pending'; buildings: Why | 'pending' } = { roads: 'pending', buildings: 'pending' };
  private backend: Backend | null = null;
  private routes = new Map<string, RouteEntry>();
  private snaps = new Map<string, SnapEntry>();

  constructor(
    private base: string,
    private opts: { fetch?: FetchLike; worker?: boolean } = {},
  ) {}

  /** Start loading (no-op after the first call). */
  start(): void {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    const useWorker = this.opts.worker ?? (typeof Worker !== 'undefined' && !this.opts.fetch);
    const inline = () => new InlineBackend(this.opts.fetch ?? ((u, i) => fetch(u, i)));
    let b: Backend;
    try {
      b = useWorker ? new WorkerBackend() : inline();
    } catch {
      b = inline();
    }
    this.backend = b;
    const settle = (r: { roads: Why; buildings: Why }) => {
      this.why = r;
      if (r.roads === 'ok' || r.buildings === 'ok') {
        this.state = 'ready';
        this.gen++;
      } else this.state = 'missing';
    };
    b.init(this.base).then(settle, () => {
      // The worker could not start (old browser, blocked script): do the same work inline.
      b.destroy();
      if (this.backend !== b) return;
      const fallback = inline();
      this.backend = fallback;
      fallback.init(this.base).then(settle, () => (this.state = 'missing'));
    });
  }

  /** Route for one unit movement (cached by key). */
  route(
    key: string,
    from: LngLat,
    fromSnap: SnapKind | null,
    to: LngLat,
    toSnap: SnapKind | null,
    now: number,
  ): RouteEntry {
    let e = this.routes.get(key);
    if (e) return e;
    const entry: RouteEntry = { done: false, at: now };
    e = entry;
    this.routes.set(key, entry);
    trim(this.routes, MAX_ROUTES);
    const b = this.backend;
    if (!b || this.state !== 'ready') {
      entry.done = true;
      entry.answer = { from, to, path: null };
      return entry;
    }
    b.route(from, fromSnap, to, toSnap).then(
      (a) => {
        entry.done = true;
        entry.answer = a;
      },
      () => {
        entry.done = true;
        entry.answer = { from, to, path: null };
      },
    );
    return entry;
  }

  /** Snapped display point for a coordinate (cached by coordinate and kind). */
  snap(p: LngLat, kind: SnapKind, now: number): SnapEntry {
    const key = `${p[0]},${p[1]}|${kind}`;
    let e = this.snaps.get(key);
    if (e) return e;
    const entry: SnapEntry = { done: false, at: now };
    e = entry;
    this.snaps.set(key, entry);
    trim(this.snaps, MAX_SNAPS);
    const b = this.backend;
    if (!b || this.state !== 'ready') {
      entry.done = true;
      entry.p = null;
      return entry;
    }
    b.snap(p, kind).then(
      (r) => {
        entry.done = true;
        entry.p = r;
      },
      () => {
        entry.done = true;
        entry.p = null;
      },
    );
    return entry;
  }

  /** Wait until loading has finished (tests, tools). */
  async whenSettled(timeoutMs = 10_000): Promise<RoadsState> {
    const t0 = Date.now();
    while ((this.state === 'loading' || this.state === 'idle') && Date.now() - t0 < timeoutMs)
      await new Promise((r) => setTimeout(r, 5));
    return this.state;
  }

  destroy(): void {
    this.backend?.destroy();
    this.backend = null;
    this.routes.clear();
    this.snaps.clear();
    this.state = 'missing';
  }
}

function trim<V>(m: Map<string, V>, max: number) {
  if (m.size <= max) return;
  let drop = m.size - Math.floor(max * 0.75);
  for (const k of m.keys()) {
    if (drop-- <= 0) break;
    m.delete(k);
  }
}

const services = new Map<string, RoadService>();

/** The page's road service for a base URL, started on first use. */
export function roadService(base: string): RoadService {
  let s = services.get(base);
  if (!s) {
    s = new RoadService(base);
    services.set(base, s);
  }
  s.start();
  return s;
}

// ---------------------------------------------------------------------------- display rules

/** Water and open-air places stay exactly where the engine put them (boats, searches). */
const STAY_KINDS = new Set<PlaceKind>(['lake', 'beach', 'port', 'forest', 'park', 'cemetery']);
/** Places that are on a road rather than in a building. */
const ROAD_KINDS = new Set<PlaceKind>(['highway', 'ruralroad', 'street', 'parking']);

/**
 * How an incident marker is placed: real places (a mall, a station) at their most prominent
 * building, homes and businesses at the nearest building, road events on the road, water and open
 * air unchanged. Director-placed events stay exactly where the director clicked.
 */
export function incidentSnapKind(inc: Incident): SnapKind | null {
  if (inc.source === 'director') return null;
  const k = inc.location?.placeKind;
  if (k && STAY_KINDS.has(k)) return null;
  if (k && ROAD_KINDS.has(k)) return 'road';
  if (inc.location?.placeName) return 'place';
  return 'building';
}

/** Hold the previous position this long (real ms) while a route or snap is computed. */
export const PENDING_HOLD_MS = 1200;
/** An incident marker waits this long (real ms) for its snapped position before it shows unsnapped. */
export const INCIDENT_HOLD_MS = 600;

const same = (a: LngLat, b: LngLat) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
const keyOf = (p: LngLat) => `${p[0]},${p[1]}`;
function nearM(a: LngLat, b: LngLat, m: number): boolean {
  const dx = (a[0] - b[0]) * 111195 * Math.cos((a[1] * Math.PI) / 180);
  const dy = (a[1] - b[1]) * 111195;
  return dx * dx + dy * dy <= m * m;
}

interface Spec {
  coord: LngLat;
  snap: SnapKind | null;
}

interface UnitRec {
  /** Identity of the movement being shown ('' = parked). */
  key: string;
  /** The same identity as numbers (checked every frame without building the key). */
  idDepart: number;
  idArrive: number;
  idLon: number;
  idLat: number;
  idGen: number;
  moveEnd?: LngLat;
  start?: LngLat;
  route?: RouteEntry;
  path?: DisplayPath;
  /** Temporary straight path while a slow route is still being computed. */
  tmp?: DisplayPath;
  shown?: LngLat;
  heading: number;
  parked?: { engine: LngLat; display: LngLat; gen: number };
  seen: number;
}

export interface Pos {
  pos: LngLat;
  heading: number;
}

/** Per-simulation display state (kept across map remounts of the same shift). */
export class RoadDisplay {
  private units = new Map<string, UnitRec>();
  private incByCoord = new Map<string, Incident>();
  private indexedCount = -1;
  private indexedAt = 0;
  private prunedAt = 0;

  constructor(readonly svc: RoadService) {}

  /** Road data is loaded: positions are being adjusted. */
  get active(): boolean {
    return this.svc.state === 'ready';
  }

  private index(s: SimState, now: number) {
    const n = s.incidentOrder?.length ?? 0;
    if (n === this.indexedCount && now - this.indexedAt < 3000) return;
    this.indexedCount = n;
    this.indexedAt = now;
    this.incByCoord.clear();
    for (const id of s.incidentOrder ?? []) {
      const inc = s.incidents[id];
      if (inc?.location?.coord) this.incByCoord.set(keyOf(inc.location.coord), inc);
    }
  }

  /** The incident whose coordinate is exactly p (the unit's own first). */
  private incidentAt(s: SimState, u: Unit, p: LngLat, now: number): Incident | undefined {
    const own = u.incidentId ? s.incidents[u.incidentId] : undefined;
    if (own?.location?.coord && same(own.location.coord, p)) return own;
    this.index(s, now);
    return this.incByCoord.get(keyOf(p));
  }

  private resolve(spec: Spec, now: number): LngLat | undefined {
    if (!spec.snap) return spec.coord;
    const e = this.svc.snap(spec.coord, spec.snap, now);
    if (!e.done) return undefined;
    return e.p ?? spec.coord;
  }

  /**
   * Display coordinate of an incident, or null while its position is being looked up (the marker
   * waits a moment instead of jumping). The same rule decides where units on scene stand.
   */
  incidentCoord(inc: Incident, now: number): LngLat | null {
    const c = inc.location.coord;
    if (!this.active) return c;
    const kind = incidentSnapKind(inc);
    if (!kind) return c;
    const e = this.svc.snap(c, kind, now);
    if (e.done) return e.p ?? c;
    return now - e.at < INCIDENT_HOLD_MS ? null : c;
  }

  /** Where a stationary unit at p is shown. */
  private staticSpec(s: SimState, u: Unit, p: LngLat, stations: readonly LngLat[], now: number): Spec {
    const inc = this.incidentAt(s, u, p, now);
    if (inc) return { coord: p, snap: incidentSnapKind(inc) };
    if (u.type === 'heli' || u.type === 'boat') return { coord: p, snap: null };
    if (stations.some((st) => nearM(st, p, 80))) return { coord: p, snap: null };
    if (u.status === 'busy' || u.status === 'offduty') return { coord: p, snap: null };
    return { coord: p, snap: 'road' };
  }

  /** Where a movement ends on the map: the same rule the unit will be shown with after arrival. */
  private endSpec(s: SimState, u: Unit, m: Movement, stations: readonly LngLat[], now: number): Spec {
    const end = m.path[m.path.length - 1];
    const inc = this.incidentAt(s, u, end, now);
    if (inc) return { coord: end, snap: incidentSnapKind(inc) };
    if (u.type === 'heli' || u.type === 'boat') return { coord: end, snap: null };
    if (m.purpose === 'pursuit' || m.purpose === 'return' || m.purpose === 'transport')
      return { coord: end, snap: null };
    if (stations.some((st) => nearM(st, end, 80))) return { coord: end, snap: null };
    return { coord: end, snap: 'road' };
  }

  private beginMove(
    s: SimState,
    u: Unit,
    m: Movement,
    r: UnitRec,
    key: string,
    stations: readonly LngLat[],
    now: number,
  ) {
    r.key = key;
    r.path = undefined;
    r.tmp = undefined;
    r.route = undefined;
    const first = m.path[0];
    const last = m.path[m.path.length - 1];
    r.moveEnd = [last[0], last[1]];
    // Continue from where the unit is shown (a re-route mid-trip), else from its parked spot.
    const start: Spec =
      r.shown && nearM(r.shown, first, 3000)
        ? { coord: r.shown, snap: null }
        : this.staticSpec(s, u, first, stations, now);
    const end = this.endSpec(s, u, m, stations, now);
    r.start = this.resolve(start, now) ?? start.coord;
    const onRoads = u.type !== 'heli' && u.type !== 'boat' && m.purpose !== 'pursuit';
    if (onRoads) {
      r.route = this.svc.route(`${u.id}|${key}`, start.coord, start.snap, end.coord, end.snap, now);
      return;
    }
    // Air, water and pursuits: the engine's own line, from the shown position to the shown end.
    const to = this.resolve(end, now) ?? end.coord;
    r.path = pathFromPoints([r.start, ...m.path.slice(1, -1), to]);
  }

  /** The path to draw for the current movement, or undefined while its route is still coming. */
  private pathOf(r: UnitRec, m: Movement, now: number): DisplayPath | undefined {
    if (r.path) return r.path;
    const e = r.route;
    if (!e) return undefined;
    if (e.done) {
      const a = e.answer!;
      r.path = a.path ?? pathFromPoints([a.from, ...m.path.slice(1, -1), a.to]);
      r.tmp = undefined;
      return r.path;
    }
    if (now - e.at < PENDING_HOLD_MS) return undefined;
    // Slow answer (a huge search, a busy worker): the engine's line for now, the route replaces it.
    r.tmp ??= pathFromPoints([r.start ?? m.path[0], ...m.path.slice(1)]);
    return r.tmp;
  }

  /** Display position and heading of a unit (engine position when the road data is not in use). */
  unitPos(s: SimState, u: Unit, engine: Pos, stations: readonly LngLat[], now: number): Pos {
    if (!this.active) return engine;
    let r = this.units.get(u.id);
    if (!r) {
      r = {
        key: '',
        idDepart: NaN,
        idArrive: NaN,
        idLon: NaN,
        idLat: NaN,
        idGen: -1,
        heading: engine.heading,
        seen: now,
      };
      this.units.set(u.id, r);
    }
    r.seen = now;
    if (now - this.prunedAt > 10_000) this.prune(now);
    const m = u.move;
    let out: Pos;
    if (m && m.path.length > 1) {
      const end = m.path[m.path.length - 1];
      const gen = this.svc.gen;
      if (
        !r.key ||
        r.idDepart !== m.departAt ||
        r.idArrive !== m.arriveAt ||
        r.idLon !== end[0] ||
        r.idLat !== end[1] ||
        r.idGen !== gen
      ) {
        r.idDepart = m.departAt;
        r.idArrive = m.arriveAt;
        r.idLon = end[0];
        r.idLat = end[1];
        r.idGen = gen;
        this.beginMove(s, u, m, r, `${m.departAt}|${m.arriveAt}|${end[0]}|${end[1]}|${gen}`, stations, now);
      }
      const path = this.pathOf(r, m, now);
      if (!path) out = { pos: r.shown ?? r.start ?? engine.pos, heading: r.heading };
      else {
        const span = m.arriveAt - m.departAt;
        const f = span > 0 ? (s.now - m.departAt) / span : 1;
        const p = pointAtFraction(path, f);
        out = { pos: p.pos, heading: p.heading };
      }
    } else {
      if (r.key) {
        // The movement just ended: park where it was shown (its end after a normal arrival).
        let display = r.shown ?? engine.pos;
        if (r.moveEnd && same(u.pos, r.moveEnd)) {
          const p = r.path ?? r.route?.answer?.path;
          if (p) display = pathEnds(p)[1];
          else if (r.route?.answer) display = r.route.answer.to;
        }
        r.parked = { engine: [u.pos[0], u.pos[1]], display, gen: this.svc.gen };
        r.key = '';
        r.path = undefined;
        r.tmp = undefined;
        r.route = undefined;
      }
      if (r.parked && r.parked.gen === this.svc.gen && same(r.parked.engine, u.pos))
        out = { pos: r.parked.display, heading: r.heading };
      else {
        r.parked = undefined;
        const spec = this.staticSpec(s, u, u.pos, stations, now);
        const c = this.resolve(spec, now);
        // Known: keep it until the unit moves (no lookups every frame).
        if (c) r.parked = { engine: [u.pos[0], u.pos[1]], display: c, gen: this.svc.gen };
        out = { pos: c ?? r.shown ?? u.pos, heading: r.heading };
      }
    }
    r.shown = out.pos;
    r.heading = out.heading;
    return out;
  }

  /** Remaining road path of a moving unit from its shown position (null = use the engine's line). */
  remaining(u: Unit, now: number, current: LngLat): LngLat[] | null {
    if (!this.active) return null;
    const r = this.units.get(u.id);
    const m = u.move;
    if (!r || !m || !r.key) return null;
    const p = r.path ?? r.tmp;
    if (!p) return [current];
    const span = m.arriveAt - m.departAt;
    const f = span > 0 ? (now - m.departAt) / span : 1;
    return remainingAt(p, f, current);
  }

  /** A focus request for an incident or unit coordinate goes to where that marker is shown. */
  focusCoord(s: SimState, coord: LngLat, now: number): LngLat {
    if (!this.active) return coord;
    this.index(s, now);
    const inc = this.incByCoord.get(keyOf(coord));
    if (inc) return this.incidentCoord(inc, now) ?? coord;
    for (const id of s.unitOrder ?? []) {
      const u = s.units[id];
      if (u?.pos && same(u.pos, coord)) return this.units.get(id)?.shown ?? coord;
    }
    return coord;
  }

  private prune(now: number) {
    this.prunedAt = now;
    for (const [id, r] of this.units) if (now - r.seen > 60_000) this.units.delete(id);
  }
}

const displays = new WeakMap<SimState, RoadDisplay>();

/** Display state for a simulation (one per shift, shared by every map showing it). */
export function roadDisplay(sim: SimState, svc: RoadService): RoadDisplay {
  let d = displays.get(sim);
  if (!d || d.svc !== svc) {
    d = new RoadDisplay(svc);
    displays.set(sim, d);
  }
  return d;
}
