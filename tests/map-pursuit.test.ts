/**
 * Fleeing vehicles on the roads (display layer only): the anti zig-zag snapping and the short hops in
 * src/map/roadGraph.ts, the marker playback in src/map/pursuitTrack.ts with its straight fallbacks,
 * the pursuit trail and end point in src/map/roads.ts and overlays.ts, and the throttled road
 * routes of the units chasing the suspect.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  backtrackM,
  computeHop,
  nearestEdge,
  OFF_ROAD_M,
  parseRoads,
  snapToEdge,
  stickySnap,
  STICKY_M,
  TURN_M,
  type HopRequest,
  type RoadGraph,
} from '@/map/roadGraph';
import { distM, HOP_TIMEOUT_MS, SuspectTrack, type HopFn, type HopTicket } from '@/map/pursuitTrack';
import { CHASE_REROUTE_MS, RoadDisplay, RoadService } from '@/map/roads';
import { buildPursuits, buildSearches } from '@/map/overlays';
import { cumulative } from '@/sim/geo';
import type { Incident, LngLat, PursuitState, SimState, Unit } from '@/sim/types';
import { encodeRoadsBin, type HandEdge } from './fixtures/mapdata';

const ROOT = resolve(__dirname, '..');
const LAT0 = 59.4;
const M_LAT = 111194.93;
const M_LON = M_LAT * Math.cos((LAT0 * Math.PI) / 180);
/** A point x metres east and y metres north of (24.7, 59.4). */
const P = (x: number, y: number): LngLat => [24.7 + x / M_LON, LAT0 + y / M_LAT];
/** Metres north of road A (which runs along y = 0). */
const yOf = (p: LngLat) => (p[1] - LAT0) * M_LAT;
const xOf = (p: LngLat) => (p[0] - 24.7) * M_LON;

/**
 * Two parallel east-west roads 40 m apart, 1.2 km long, joined only at their ends: A along y = 0
 * (split at x = 600 by a junction with a side street going north 30 m, then a dead end) and B along
 * y = 40.
 */
function parallel() {
  const nodes: LngLat[] = [P(0, 0), P(600, 0), P(1200, 0), P(0, 40), P(1200, 40), P(600, 30)];
  const edges: HandEdge[] = [
    { a: 0, b: 1, cls: 7 },
    { a: 1, b: 2, cls: 7 },
    { a: 3, b: 4, cls: 7 },
    { a: 0, b: 3, cls: 7 },
    { a: 2, b: 4, cls: 7 },
    { a: 1, b: 5, cls: 7 },
  ];
  const buf = encodeRoadsBin(nodes, edges);
  const g = parseRoads(buf);
  const edgeOf = (a: LngLat, b: LngLat) => {
    for (let e = 0; e < g.edges; e++) {
      const ea: LngLat = [g.nodeLon[g.edgeA[e]], g.nodeLat[g.edgeA[e]]];
      const eb: LngLat = [g.nodeLon[g.edgeB[e]], g.nodeLat[g.edgeB[e]]];
      if ((distM(ea, a) < 1 && distM(eb, b) < 1) || (distM(ea, b) < 1 && distM(eb, a) < 1)) return e;
    }
    throw new Error('no such edge');
  };
  return {
    buf,
    g,
    aWest: edgeOf(P(0, 0), P(600, 0)),
    aEast: edgeOf(P(600, 0), P(1200, 0)),
    b: edgeOf(P(0, 40), P(1200, 40)),
    side: edgeOf(P(600, 0), P(600, 30)),
  };
}

/** A hop function answering on the next frame, the way the worker does (computeHop on `data`). */
function laggedHops(data: { roads: RoadGraph | null; buildings: null }) {
  const queue: (HopTicket & { req: HopRequest })[] = [];
  const asked: HopRequest[] = [];
  const fn: HopFn = (req, now) => {
    const t = { done: false, at: now, req };
    queue.push(t);
    asked.push(req);
    return t;
  };
  const deliver = () => {
    for (const t of queue.splice(0)) {
      t.answer = computeHop(data, t.req);
      t.done = true;
    }
  };
  return { fn, deliver, asked };
}

describe('anti zig-zag snapping', () => {
  it('keeps the road it is on while a parallel road is nearer by less than STICKY_M', () => {
    const { g, aWest, b } = parallel();
    // 15 m from A, 25 m from B: A is nearest anyway.
    expect(stickySnap(g, P(300, 15), aWest, [])!.edge).toBe(aWest);
    // 25 m from A, 15 m from B: B is nearest, but only 10 m nearer.
    const p = P(300, 25);
    expect(nearestEdge(g, p[0], p[1], 300)!.edge).toBe(b);
    expect(stickySnap(g, p, aWest, [])!.edge).toBe(aWest);
    // On B, the same point stays on B (changing back needs the margin again).
    expect(stickySnap(g, p, b, [])!.edge).toBe(b);
    expect(stickySnap(g, P(300, 15), b, [])!.edge).toBe(b);
    // 35 m from A, 5 m from B: 30 m nearer, more than STICKY_M: changes over.
    expect(35 - 5).toBeGreaterThan(STICKY_M);
    expect(stickySnap(g, P(300, 35), aWest, [])!.edge).toBe(b);
    // Without a current road: simply the nearest.
    expect(stickySnap(g, p, -1, [])!.edge).toBe(b);
    // A recently driven edge counts as the road it is on (a little less than the current one).
    expect(stickySnap(g, p, -1, [aWest])!.edge).toBe(aWest);
  });

  it('goes straight on through a junction and turns into a side street only when the position left the road', () => {
    const { g, aWest, aEast, side } = parallel();
    // 10 m past the junction, 12 m north: the side street (10 m) is nearest, straight on (12 m) wins.
    const p = P(610, 12);
    expect(nearestEdge(g, p[0], p[1], 300)!.edge).toBe(side);
    expect(stickySnap(g, p, aWest, [])!.edge).toBe(aEast);
    // Well up the side street (3 m from it, 25 m from the road): the turn is taken.
    expect(25 - 3).toBeGreaterThan(TURN_M);
    expect(stickySnap(g, P(603, 25), aWest, [])!.edge).toBe(side);
    // The projection on a given edge is clamped to its ends.
    const s = snapToEdge(g, aWest, ...P(700, 5));
    expect(distM([s.lon, s.lat], P(600, 0))).toBeLessThan(0.5);
    expect(s.along).toBeCloseTo(g.edgeLen[aWest], 0);
  });
});

describe('pursuit hops', () => {
  const { g, aWest, aEast, b } = parallel();
  const data = { roads: g, buildings: null };

  it('drives along the road to the road point of the new position', () => {
    const a = computeHop(data, { from: P(500, 0), fromEdge: aWest, history: [aWest], to: P(640, 8), travel: 90, prev: P(600, 8) });
    expect(a.path).not.toBeNull();
    expect(a.edge).toBe(aEast);
    expect(distM(a.to, P(640, 0))).toBeLessThan(0.5);
    expect(a.path!.lengthM).toBeCloseTo(140, -1);
    for (let i = 0; i < a.path!.lon.length; i++) expect(Math.abs(yOf([a.path!.lon[i], a.path!.lat[i]]))).toBeLessThan(0.5);
    expect(backtrackM(a.path!, 90)).toBeLessThan(0.5);
  });

  it('waits instead of turning back, unless the engine turned back or the drawn path is far behind', () => {
    // The end of the drawn path is 15 m past the junction, the engine (moving east) is 10 m before
    // it: every road way there turns back.
    const req: HopRequest = { from: P(615, 0), fromEdge: aEast, history: [aWest, aEast], to: P(590, 12), travel: 90, prev: P(570, 12) };
    const held = computeHop(data, req);
    expect(held.hold).toBe(true);
    expect(held.path).toBeNull();
    // The engine itself turned back: the hop goes back along the road.
    const back = computeHop(data, { ...req, prev: P(610, 12) });
    expect(back.hold).toBeFalsy();
    expect(back.path).not.toBeNull();
    expect(backtrackM(back.path!, 90)).toBeGreaterThan(10);
    // The engine is far ahead the other way (60 m): the display catches up.
    const far = computeHop(data, { ...req, to: P(560, 5), prev: P(540, 5) });
    expect(far.hold).toBeFalsy();
    expect(far.path).not.toBeNull();
    expect(distM(far.to, P(560, 0))).toBeLessThan(0.5);
  });

  it('falls back to a straight hop: only a long detour, no road near, no road data', () => {
    // The engine is just north of B, but the roads only meet 300 m back. On road A the suspect
    // keeps going along A meanwhile (a road way that does not turn back) ...
    const req: HopRequest = { from: P(300, 0), fromEdge: aWest, history: [aWest], to: P(320, 50), travel: 90, prev: P(300, 50) };
    const stay = computeHop(data, req);
    expect(stay.edge).toBe(aWest);
    expect(stay.path).not.toBeNull();
    expect(distM(stay.to, P(320, 0))).toBeLessThan(0.5);
    // ... off the roads (a straight piece before) only the detour is left: straight over to B.
    const detour = computeHop(data, { ...req, from: P(300, 15), fromEdge: -1, history: [] });
    expect(detour.path).toBeNull();
    expect(detour.hold).toBeFalsy();
    expect(detour.edge).toBe(b);
    expect(distM(detour.to, P(320, 40))).toBeLessThan(0.5);
    // Nothing within OFF_ROAD_M: the engine position itself, off the road.
    const off = P(300, 40 + OFF_ROAD_M + 60);
    const offRoad = computeHop(data, { from: P(300, 40), fromEdge: b, history: [b], to: off, travel: 0, prev: P(300, 200) });
    expect(offRoad).toMatchObject({ edge: -1, path: null, to: off });
    // No road data at all.
    const none = computeHop({ roads: null, buildings: null }, { from: P(0, 0), fromEdge: -1, history: [], to: P(30, 5) });
    expect(none).toMatchObject({ edge: -1, path: null, to: P(30, 5) });
  });
});

describe('suspect marker playback', () => {
  it('stays on its road when the engine position wavers between two parallel roads', () => {
    const { g, aWest, aEast, b } = parallel();
    const hops = laggedHops({ roads: g, buildings: null });
    let now = 0;
    // 4 m per 16 ms frame (about x15 game speed), 9 to 29 m north of A (11 to 31 m south of B): the
    // nearest road changes all the time, but never by STICKY_M.
    const engineAt = (k: number) => P(20 + 4 * k, 19 + 10 * Math.sin(k / 9));
    const t = new SuspectTrack(hops.fn, engineAt(0), 90, now);
    const shown: LngLat[] = [];
    let flips = 0;
    let lastNearest = -1;
    for (let k = 0; k <= 280; k++) {
      now += 16;
      hops.deliver();
      const e = engineAt(k);
      const ne = nearestEdge(g, e[0], e[1], 300)!.edge;
      if (lastNearest >= 0 && ne !== lastNearest) flips++;
      lastNearest = ne;
      shown.push(t.update(e, 90, now).pos);
    }
    // The plain nearest road changes many times (the test means something) ...
    expect(flips).toBeGreaterThan(6);
    // ... the marker gets onto one of the two roads and never leaves it, never turns back and never
    // jumps. (It starts nearer to B, so B it is.)
    const onRoad = (p: LngLat, y: number) => Math.abs(yOf(p) - y) < 0.5;
    const first = shown.findIndex((p) => onRoad(p, 0) || onRoad(p, 40));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(30);
    const roadY = onRoad(shown[first], 0) ? 0 : 40;
    for (let i = first; i < shown.length; i++) {
      expect(onRoad(shown[i], roadY)).toBe(true);
      if (i > first) expect(xOf(shown[i])).toBeGreaterThanOrEqual(xOf(shown[i - 1]) - 0.01);
      if (i > 0) expect(distM(shown[i - 1], shown[i])).toBeLessThan(4 * 4 + 2);
    }
    const mine = roadY === 0 ? [aWest, aEast] : [b];
    expect(t.edges.length).toBeGreaterThan(0);
    expect(t.edges.every((e) => mine.includes(e))).toBe(true);
    // It keeps up: within a sample or two of the engine.
    expect(xOf(engineAt(280)) - xOf(shown[shown.length - 1])).toBeLessThan(90);
    // The trail is the road path driven, ending at the marker.
    const trail = t.trail();
    expect(trail[trail.length - 1]).toEqual(shown[shown.length - 1]);
    for (const p of trail.slice(2)) expect(onRoad(p, roadY)).toBe(true);
    // The engine stops: the marker finishes the drawn path and stops at the road point there.
    const stop = engineAt(280);
    for (let k = 0; k < 120; k++) {
      now += 16;
      hops.deliver();
      t.update(stop, 90, now);
    }
    expect(distM(t.pos, [stop[0], LAT0 + roadY / M_LAT])).toBeLessThan(1);
    expect(t.pos).toEqual(t.end);
  });

  it('without road data follows the engine in straight hops, without jumps', () => {
    const hops = laggedHops({ roads: null, buildings: null });
    let now = 0;
    const engineAt = (k: number) => P(200 * Math.sin(k / 60), 200 * (1 - Math.cos(k / 60)));
    const t = new SuspectTrack(hops.fn, engineAt(0), 90, now);
    let prev = t.pos;
    for (let k = 1; k <= 200; k++) {
      now += 16;
      hops.deliver();
      const engineStep = distM(engineAt(k - 1), engineAt(k));
      const p = t.update(engineAt(k), 0, now).pos;
      expect(distM(prev, p)).toBeLessThan(4 * engineStep + 1);
      // About a sample (35 m) plus the marker's lag behind the end of the drawn path.
      expect(distM(p, engineAt(k))).toBeLessThan(80);
      prev = p;
    }
    expect(hops.asked.length).toBeGreaterThan(10);
    for (let k = 0; k < 120; k++) {
      now += 16;
      hops.deliver();
      t.update(engineAt(200), 0, now);
    }
    expect(distM(t.pos, engineAt(200))).toBeLessThan(0.05);
  });

  it('draws a straight hop when an answer never comes, and starts again after a jump', () => {
    const stuck: HopFn = (_req, now) => ({ done: false, at: now });
    let now = 0;
    const t = new SuspectTrack(stuck, P(0, 0), 90, now);
    for (let k = 1; k <= 60; k++) t.update(P(4 * k, 0), 90, (now += 16));
    // The first request is still out: the marker has not moved yet.
    expect(now).toBeLessThan(HOP_TIMEOUT_MS);
    expect(t.pos).toEqual(P(0, 0));
    // Then a straight hop to where the engine is by now (not to the old sample): it catches up.
    let prev = t.pos;
    for (let k = 61; k <= 200; k++) {
      const p = t.update(P(4 * k, 0), 90, (now += 16)).pos;
      expect(distM(prev, p)).toBeLessThan(20);
      prev = p;
    }
    expect(xOf(t.pos)).toBeGreaterThan(250);
    // A loaded save puts the vehicle somewhere else entirely: no long drive there.
    const far = P(5000, 3000);
    expect(t.update(far, 45, (now += 16)).pos).toEqual(far);
  });
});

// ---------------------------------------------------------------------------- display layer

const respond = (body: Uint8Array | string, type = 'application/octet-stream', status = 200) =>
  new Response(typeof body === 'string' ? body : new Uint8Array(body), { status, headers: { 'content-type': type } });
const tick = () => new Promise((r) => setTimeout(r, 0));

async function readyService(buf: Uint8Array) {
  const svc = new RoadService('https://x.test/', {
    fetch: async (url) => (url.endsWith('roads-v1.bin') ? respond(buf) : respond('', 'text/plain', 404)),
  });
  svc.start();
  expect(await svc.whenSettled()).toBe('ready');
  return svc;
}

function mkPursuitInc(p: Partial<PursuitState> & { suspectPos: LngLat }): Incident {
  return {
    id: 'i1',
    state: 'dispatched',
    location: { address: '', coord: P(0, 0), city: '', placeKind: 'street', zone: 'mainland' },
    source: 'hk',
    pursuit: { heading: 90, speedKmh: 100, startedAt: 0, risk: 0, pressure: 0, heli: false, spikes: false, trail: [p.suspectPos], ...p },
  } as Incident;
}

describe('pursuits on the map', () => {
  it('drives the suspect along the roads, draws the trail there and ends the pursuit on the road', async () => {
    const { buf } = parallel();
    const svc = await readyService(buf);
    const d = new RoadDisplay(svc);
    const inc = mkPursuitInc({ suspectPos: P(100, 12) });
    const p = inc.pursuit!;
    let now = 0;
    for (let k = 0; k < 150; k++) {
      p.suspectPos = P(100 + 4 * k, 12);
      d.suspectPos(inc, (now += 16));
      await tick();
    }
    const shown = d.suspectPos(inc, (now += 16));
    expect(Math.abs(yOf(shown.pos))).toBeLessThan(0.5);
    expect(shown.heading).toBeCloseTo(90, 0);
    const trail = d.suspectTrail(inc)!;
    expect(trail.length).toBeGreaterThan(2);
    expect(trail[trail.length - 1]).toEqual(shown.pos);
    for (const q of trail.slice(2)) expect(Math.abs(yOf(q))).toBeLessThan(0.5);
    // The pursuit ends there: its end on the map is the road point the vehicle was heading for.
    p.ended = 'escaped';
    const end = d.pursuitEnd(inc, (now += 16))!;
    expect(Math.abs(yOf(end))).toBeLessThan(0.5);
    // 12 m off the road, and at most about a sample along it.
    expect(distM(end, p.suspectPos)).toBeLessThan(45);
    // The overlays use them: the trail along the road, a search there around the end point.
    const sim = { incidentOrder: ['i1'], incidents: { i1: inc }, flags: {} } as unknown as SimState;
    p.ended = undefined;
    const fc = buildPursuits(sim, () => trail);
    expect(fc.features[0].geometry.coordinates).toEqual(trail);
    expect(buildPursuits(sim).features[0].geometry.coordinates).toEqual([...p.trail, p.suspectPos]);
    p.ended = 'escaped';
    inc.search = { center: p.suspectPos, radiusKm: 0.3, progress: 0, startedAt: 0 };
    const ring = buildSearches(sim, () => null, () => end).features[0].geometry.coordinates[0];
    const cx = ring.slice(0, -1).reduce((s, q) => s + q[0], 0) / (ring.length - 1);
    const cy = ring.slice(0, -1).reduce((s, q) => s + q[1], 0) / (ring.length - 1);
    expect(distM([cx, cy], end)).toBeLessThan(1);
    // Still looking it up: the circle waits (like an incident marker) instead of jumping later.
    expect(buildSearches(sim, () => null, () => null).features).toHaveLength(0);
    // A search at the incident itself still follows the incident marker.
    inc.search = { center: inc.location.coord, radiusKm: 0.3, progress: 0, startedAt: 0 };
    expect(buildSearches(sim, () => P(5, 5), () => end).features).toHaveLength(1);
  });

  it('shows the engine positions when the road data is missing', async () => {
    const svc = new RoadService('https://x.test/', { fetch: async () => respond('', 'text/plain', 404) });
    svc.start();
    expect(await svc.whenSettled()).toBe('missing');
    const d = new RoadDisplay(svc);
    const inc = mkPursuitInc({ suspectPos: P(100, 12), heading: 77 });
    expect(d.suspectPos(inc, 0)).toEqual({ pos: P(100, 12), heading: 77 });
    expect(d.suspectTrail(inc)).toBeNull();
    expect(d.pursuitEnd(inc, 0)).toEqual(P(100, 12));
  });

  it('re-routes chasing units at most once a second, continuing from where they are shown', async () => {
    const { buf } = parallel();
    const svc = await readyService(buf);
    const routes: string[] = [];
    const orig = svc.route.bind(svc);
    svc.route = (key, ...rest) => {
      routes.push(key);
      return orig(key, ...rest);
    };
    const d = new RoadDisplay(svc);
    const u = {
      id: 'u1',
      type: 'patrol',
      status: 'enroute',
      pos: P(50, 0),
      heading: 90,
    } as Unit;
    const sim = { now: 0, units: { u1: u }, unitOrder: ['u1'], incidents: {}, incidentOrder: [] } as unknown as SimState;
    const chase = (from: LngLat, to: LngLat, at: number) => {
      u.move = { purpose: 'pursuit', path: [from, to], cum: cumulative([from, to]), departAt: at, arriveAt: at + 60_000, siren: true };
    };
    const show = (real: number) => d.unitPos(sim, u, { pos: u.pos, heading: 90 }, [], real);
    chase(P(50, 0), P(1000, 10), 0);
    show(0);
    await tick();
    expect(routes).toHaveLength(1);
    sim.now = 20_000;
    const before = show(300).pos;
    expect(Math.abs(yOf(before))).toBeLessThan(0.5);
    // Re-targeted 0.4 s (real) later with the target 100 m further: no new route yet, no jump.
    chase(P(400, 10), P(1100, 10), 20_000);
    const after = show(400).pos;
    expect(routes).toHaveLength(1);
    expect(distM(before, after)).toBeLessThan(1);
    // It keeps driving along the road.
    sim.now = 25_000;
    const later = show(600).pos;
    expect(Math.abs(yOf(later))).toBeLessThan(0.5);
    expect(xOf(later)).toBeGreaterThan(xOf(after) + 10);
    // Once a second has passed, one new route from the shown position, again without a jump.
    sim.now = 26_000;
    const atReroute = show(400 + CHASE_REROUTE_MS + 50).pos;
    expect(routes).toHaveLength(2);
    await tick();
    const rerouted = show(400 + CHASE_REROUTE_MS + 60).pos;
    expect(distM(atReroute, rerouted)).toBeLessThan(1);
    expect(Math.abs(yOf(rerouted))).toBeLessThan(0.5);
    // A target that moved only a little (< 40 m) needs no new route, even after a second.
    chase(P(600, 10), P(1120, 10), 26_000);
    show(5000);
    expect(routes).toHaveLength(2);
    // The heading follows the road (east), not the engine's straight line.
    sim.now = 30_000;
    expect(show(5100).heading).toBeCloseTo(90, 0);
  });
});

describe('owner rules for the pursuit display files', () => {
  it('has no em or en dashes', () => {
    const banned = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);
    for (const f of [
      'src/map/pursuitTrack.ts',
      'src/map/roadGraph.ts',
      'src/map/roads.ts',
      'src/map/roadWorker.ts',
      'src/map/markers.ts',
      'src/map/overlays.ts',
      'src/map/controller.ts',
      'src/map/__dev__/harness.tsx',
      'tests/map-pursuit.test.ts',
    ])
      expect(banned.test(readFileSync(join(ROOT, f), 'utf8')), f).toBe(false);
  });
});
