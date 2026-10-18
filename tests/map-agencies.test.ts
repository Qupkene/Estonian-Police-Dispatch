/**
 * Other agencies' vehicles on the map (display only, src/map/agencies.ts): where each agency's vehicle
 * starts, where it is at a moment of its trip (leaving, halfway, arrived, after the incident closed),
 * arrival exactly at the engine's arriveAt, the straight line without road data, the road route with
 * it, cached and rate-limited route requests, and the glyph, colour and texts of every agency.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  AGENCY_VEHICLES,
  AgencyDisplay,
  agencyBases,
  agencyTitle,
  LEAVE_MS,
  planTrip,
  tripAt,
  type AgencyVehicle,
} from '@/map/agencies';
import { AGENCY_GLYPHS } from '@/map/glyphs';
import { RoadService } from '@/map/roads';
import { nearestEdge, parseRoads } from '@/map/roadGraph';
import { REGIONS, REGION_IDS } from '@/data/regions';
import { AGENCY_NAMES } from '@/data/radioPhrases';
import { DICT } from '@/i18n';
import { createShift, step } from '@/sim/engine';
import { requestAgency } from '@/sim/commands';
import { haversineKm } from '@/sim/geo';
import type {
  Agency,
  AgencyRequest,
  Incident,
  IncidentLocation,
  LngLat,
  Place,
  RegionDef,
  SimState,
  Station,
  Town,
} from '@/sim/types';
import { encodeRoadsBin } from './fixtures/mapdata';

const ROOT = resolve(__dirname, '..');
const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 9, 17, 10, 0);
const LAT0 = 59.4;
const M_LAT = 111194.93;
const M_LON = M_LAT * Math.cos((LAT0 * Math.PI) / 180);
/** A point x km east and y km north of (24.7, 59.4), where the synthetic incidents are. */
const K = (x: number, y: number): LngLat => [24.7 + (x * 1000) / M_LON, LAT0 + (y * 1000) / M_LAT];
const distM = (a: LngLat, b: LngLat) => haversineKm(a, b) * 1000;
const AGENCIES = Object.keys(AGENCY_NAMES) as Agency[];

function region(o: {
  towns?: Partial<Town>[];
  places?: Partial<Place>[];
  stations?: Partial<Station>[];
  hqCity?: string;
}): RegionDef {
  return {
    id: 'pohja',
    hqCity: o.hqCity ?? 'Pealinn',
    towns: (o.towns ?? []).map((t, i) => ({
      name: `Linn ${i}`,
      county: 'X',
      coord: K(0, 0),
      population: 5000,
      ruShare: 0,
      ...t,
    })),
    places: (o.places ?? []).map((p, i) => ({
      id: `pl${i}`,
      name: `Haigla ${i}`,
      kind: 'hospital',
      city: 'X',
      address: '',
      coord: K(0, 0),
      ...p,
    })),
    stations: (o.stations ?? []).map((s, i) => ({
      id: `st${i}`,
      name: { et: 'J', en: 'J' },
      short: 'J',
      kind: 'station',
      city: 'X',
      address: '',
      coord: K(0, 0),
      ...s,
    })),
  } as unknown as RegionDef;
}

function mkInc(loc: Partial<IncidentLocation> = {}, over: Partial<Incident> = {}): Incident {
  return {
    id: 'i1',
    state: 'onscene',
    source: 'hk',
    location: {
      address: 'Test tn 1',
      coord: K(0, 0),
      city: 'Küla',
      placeKind: 'street',
      zone: 'mainland',
      ...loc,
    },
    agencyNeeds: [],
    ...over,
  } as unknown as Incident;
}

const req = (agency: Agency, mins: number, at = T0): AgencyRequest => ({
  agency,
  requestedAt: at,
  arriveAt: at + mins * MIN,
});

/** An incident with the request on it, in a minimal simulation of the Põhja prefecture. */
function scene(coord: LngLat, rq: AgencyRequest, loc: Partial<IncidentLocation> = {}) {
  const inc = mkInc(
    { coord, city: 'Tallinn', ...loc },
    {
      agencyNeeds: [{ agency: rq.agency, reason: { et: '', en: '' }, requested: rq }],
    },
  );
  const sim = {
    now: rq.requestedAt,
    regionId: 'pohja',
    incidents: { i1: inc },
    incidentOrder: ['i1'],
    flags: {},
  } as unknown as SimState;
  return { inc, sim };
}

const respond = (body: Uint8Array | string, type = 'application/octet-stream', status = 200) =>
  new Response(typeof body === 'string' ? body : new Uint8Array(body), {
    status,
    headers: { 'content-type': type },
  });

async function service(roads?: Uint8Array) {
  const svc = new RoadService('https://x.test/', {
    fetch: async (url) =>
      roads && url.endsWith('roads-v1.bin') ? respond(roads) : respond('', 'text/plain', 404),
  });
  svc.start();
  expect(await svc.whenSettled()).toBe(roads ? 'ready' : 'missing');
  return svc;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Metres along a polyline to a point on it. */
function alongM(line: LngLat[], p: LngLat): number {
  let done = 0;
  for (let i = 1; i < line.length; i++) {
    const leg = distM(line[i - 1], line[i]);
    if (Math.abs(distM(line[i - 1], p) + distM(p, line[i]) - leg) < 0.5) return done + distM(line[i - 1], p);
    done += leg;
  }
  return NaN;
}
const shownAt = (inc: Incident) => inc.location.coord;
const one = (list: readonly AgencyVehicle[]) => {
  expect(list).toHaveLength(1);
  return { ...list[0], pos: [...list[0].pos] as LngLat };
};

describe('where an agency vehicle starts', () => {
  it('takes the nearest base a believable trip away: hospitals and the bigger towns for an ambulance', () => {
    const r = region({
      places: [{ coord: K(1, 0) }, { coord: K(0, 7) }],
      towns: [
        { coord: K(-6, 0), population: 5000 },
        // Too small for an ambulance crew of its own.
        { coord: K(0, -5.5), population: 500 },
        // Its ambulances are at the hospital 1.5 km away.
        { coord: K(0, 5.5), population: 3000 },
      ],
    });
    const inc = mkInc();
    expect(agencyBases(r, 'kiirabi', inc)).toEqual([K(1, 0), K(0, 7), K(-6, 0)]);
    // 10 minutes: 5 to 13.3 km is believable; the hospital 1 km away is too near.
    const plan = planTrip(r, inc, req('kiirabi', 10))!;
    expect(plan.origin).toEqual(K(-6, 0));
    expect(plan.departAt).toBe(T0);
    expect(plan.arriveAt).toBe(T0 + 10 * MIN);
    // The rescue board has a station in every bigger town.
    expect(planTrip(r, inc, req('paaste', 10))!.origin).toEqual(K(0, 5.5));
  });

  it('starts on the way from a far base, and waits at a near one to leave at its usual speed', () => {
    const inc = mkInc();
    const far = planTrip(region({ places: [{ coord: K(60, 0) }] }), inc, req('kiirabi', 10))!;
    expect(haversineKm(far.origin!, inc.location.coord)).toBeCloseTo((45 * 10) / 60, 1);
    expect(haversineKm(far.origin!, K(60, 0))).toBeCloseTo(60 - 7.5, 1);
    expect(far.departAt).toBe(T0);

    const near = planTrip(region({ places: [{ coord: K(2, 0) }] }), inc, req('kiirabi', 10))!;
    expect(near.origin).toEqual(K(2, 0));
    const d = haversineKm(K(2, 0), inc.location.coord);
    expect(near.departAt).toBeCloseTo(T0 + 10 * MIN - (d / 45) * HOUR, 0);
    expect(tripAt(near, inc, T0, false)).toEqual({ phase: 'waiting', f: 0 });
    expect(tripAt(near, inc, near.departAt + 1, false)!.phase).toBe('enroute');
    expect(tripAt(near, inc, near.arriveAt, false)).toEqual({ phase: 'onscene', f: 1 });
  });

  it("stays in the incident's zone and comes from the zone's towns when it has no base there", () => {
    const r = region({
      places: [{ coord: K(6, 0) }],
      towns: [{ name: 'Saare', coord: K(0, 9), population: 800, zone: 'saar' }],
    });
    const island = mkInc({ zone: 'saar' });
    expect(planTrip(r, island, req('kiirabi', 10))!.origin).toEqual(K(0, 9));
    // Nowhere to come from: shown once it has arrived.
    const rock = mkInc({ zone: 'kalju' });
    const plan = planTrip(r, rock, req('kiirabi', 10))!;
    expect(plan.origin).toBeNull();
    expect(tripAt(plan, rock, T0 + 5 * MIN, true)).toBeNull();
    expect(tripAt(plan, rock, T0 + 10 * MIN, true)).toEqual({ phase: 'onscene', f: 1 });
  });

  it("sends the municipality from the incident's town and the boards from the main town", () => {
    const r = region({
      hqCity: 'Pealinn',
      towns: [
        { name: 'Pealinn', coord: K(30, 0), population: 400_000 },
        { name: 'Küla', coord: K(1, 0), population: 900 },
        { name: 'Alevik', coord: K(0, 8), population: 2000 },
        { name: 'Kuressaare', coord: K(-40, 0), population: 13_000, zone: 'saar' },
        { name: 'Orissaare', coord: K(-30, 10), population: 800, zone: 'saar' },
      ],
    });
    const inc = mkInc();
    for (const a of ['kov', 'sotsiaal'] as const) {
      const plan = planTrip(r, inc, req(a, 30))!;
      expect(plan.origin).toEqual(K(1, 0));
      // The town hall is 1 km away: the car leaves later, not crawling for half an hour.
      expect(plan.departAt).toBeGreaterThan(T0 + 25 * MIN);
    }
    expect(planTrip(r, mkInc({ city: 'Mujal', coord: K(0, 6) }), req('kov', 30))!.origin).toEqual(K(0, 8));
    for (const a of ['keskkonnaamet', 'veterinaar', 'tolliamet', 'transpordiamet', 'kapo'] as const) {
      const plan = planTrip(r, inc, req(a, 45))!;
      expect(plan.origin).toEqual(K(30, 0));
      expect(plan.departAt).toBe(T0);
    }
    expect(planTrip(r, mkInc({ zone: 'saar', coord: K(-35, 0) }), req('kapo', 45))!.origin).toEqual(
      K(-40, 0),
    );
  });

  it('sends sea rescue from a harbour of any zone', () => {
    const r = region({
      stations: [{ kind: 'harbour', coord: K(8, 0) }],
      places: [{ kind: 'port', coord: K(0, 30) }],
    });
    expect(planTrip(r, mkInc({ zone: 'saar' }), req('merepaaste', 20))!.origin).toEqual(K(8, 0));
  });
});

describe('where an agency vehicle is on its trip', () => {
  // Lasnamäe, Tallinn.
  const LASNA: LngLat = [24.835, 59.4365];

  it('leaves at requestedAt, is halfway at half time and on scene exactly at arriveAt (no road data)', async () => {
    const d = new AgencyDisplay(await service());
    const rq = req('kiirabi', 10);
    const { inc, sim } = scene(LASNA, rq);
    const plan = planTrip(REGIONS.pohja, inc, rq)!;
    const o = plan.origin!;
    expect(plan.departAt).toBe(T0);
    // A save opened mid-trip: the first frame already shows it halfway, on the straight line.
    sim.now = T0 + 5 * MIN;
    const mid = one(d.vehicles(sim, shownAt, 0));
    expect(mid).toMatchObject({
      key: 'ag:i1:kiirabi',
      incidentId: 'i1',
      agency: 'kiirabi',
      phase: 'enroute',
      lights: true,
      eta: 5 * MIN,
    });
    expect(mid.pos[0]).toBeCloseTo((o[0] + LASNA[0]) / 2, 6);
    expect(mid.pos[1]).toBeCloseTo((o[1] + LASNA[1]) / 2, 6);
    expect(agencyTitle(mid, 'et')).toBe('Kiirabi · saabub ~5 min');
    expect(agencyTitle(mid, 'en')).toBe('Ambulance · arriving in ~5 min');

    sim.now = T0;
    const start = one(d.vehicles(sim, shownAt, 1));
    expect(distM(start.pos, o)).toBeLessThan(0.01);

    sim.now = rq.arriveAt - 1;
    expect(one(d.vehicles(sim, shownAt, 2)).phase).toBe('enroute');
    sim.now = rq.arriveAt;
    const there = one(d.vehicles(sim, shownAt, 3));
    expect(there).toMatchObject({ phase: 'onscene', lights: false, eta: 0 });
    expect(distM(there.pos, LASNA)).toBeLessThan(0.01);
    expect(agencyTitle(there, 'et')).toBe('Kiirabi kohal');

    // Closed: without a road route it disappears at once.
    inc.state = 'closed';
    inc.closedAt = rq.arriveAt + 10 * MIN;
    sim.now = inc.closedAt - 1;
    expect(one(d.vehicles(sim, shownAt, 4)).phase).toBe('onscene');
    sim.now = inc.closedAt;
    expect(d.vehicles(sim, shownAt, 5)).toHaveLength(0);
    // With a route it would drive back at the speed it came.
    expect(tripAt(plan, inc, inc.closedAt + MIN, true)).toEqual({ phase: 'leaving', f: 0.9 });
    expect(tripAt(plan, inc, inc.closedAt + LEAVE_MS, true)).toBeNull();
  });

  it('turns back where it is when the incident closes before it arrives', () => {
    const rq = req('kiirabi', 10);
    const { inc } = scene(LASNA, rq);
    const plan = planTrip(REGIONS.pohja, inc, rq)!;
    inc.state = 'closed';
    inc.closedAt = T0 + 4 * MIN;
    expect(tripAt(plan, inc, T0 + 4 * MIN, true)).toEqual({ phase: 'leaving', f: 0.4 });
    expect(tripAt(plan, inc, T0 + 6 * MIN, true)!.f).toBeCloseTo(0.2, 9);
    expect(tripAt(plan, inc, T0 + 8 * MIN, true)).toBeNull();
  });

  it('drives on the roads with road data, reaches the scene at arriveAt and drives off after the incident closes', async () => {
    const rq = req('kiirabi', 12);
    const { inc, sim } = scene(LASNA, rq);
    const o = planTrip(REGIONS.pohja, inc, rq)!.origin!;
    // A road from the base round by the north (about 2 km off the straight line) to the incident.
    const road: LngLat[] = [o, [o[0], LASNA[1] + 0.02], [LASNA[0], LASNA[1] + 0.02], LASNA];
    const buf = encodeRoadsBin(road, [
      { a: 0, b: 1, cls: 6 },
      { a: 1, b: 2, cls: 6 },
      { a: 2, b: 3, cls: 6 },
    ]);
    const g = parseRoads(buf);
    const svc = await service(buf);
    let asked = 0;
    const route = svc.route.bind(svc);
    svc.route = (...a: Parameters<RoadService['route']>) => {
      asked++;
      return route(...a);
    };
    const d = new AgencyDisplay(svc);
    sim.now = T0 + 6 * MIN;
    // The route is being computed: shown in a moment.
    expect(d.vehicles(sim, shownAt, 0)).toHaveLength(0);
    await tick();
    const mid = one(d.vehicles(sim, shownAt, 10));
    expect(nearestEdge(g, mid.pos[0], mid.pos[1], 5)!.dist).toBeLessThan(0.5);
    expect(distM(mid.pos, [(o[0] + LASNA[0]) / 2, (o[1] + LASNA[1]) / 2])).toBeGreaterThan(1000);
    // Halfway by time is halfway along the road (one road class).
    expect(alongM(road, mid.pos) / alongM(road, LASNA)).toBeCloseTo(0.5, 2);

    sim.now = rq.arriveAt;
    const there = one(d.vehicles(sim, shownAt, 20));
    expect(there.phase).toBe('onscene');
    expect(distM(there.pos, LASNA)).toBeLessThan(0.5);

    inc.state = 'closed';
    inc.closedAt = rq.arriveAt + 2 * MIN;
    sim.now = inc.closedAt + MIN;
    const off = one(d.vehicles(sim, shownAt, 30));
    expect(off.phase).toBe('leaving');
    expect(off.lights).toBe(false);
    expect(nearestEdge(g, off.pos[0], off.pos[1], 5)!.dist).toBeLessThan(0.5);
    expect(distM(off.pos, LASNA)).toBeGreaterThan(100);
    expect(agencyTitle(off, 'et')).toBe('Kiirabi · lahkub');
    sim.now = inc.closedAt + LEAVE_MS;
    expect(d.vehicles(sim, shownAt, 40)).toHaveLength(0);
    // One route for the whole trip, back included.
    expect(asked).toBe(1);
  });

  it('asks for a few road routes at a time and keeps them', async () => {
    const svc = await service(encodeRoadsBin([K(0, 0), K(1, 0)], [{ a: 0, b: 1, cls: 6 }]));
    let asked = 0;
    const route = svc.route.bind(svc);
    svc.route = (...a: Parameters<RoadService['route']>) => {
      asked++;
      return route(...a);
    };
    const incidents: Record<string, Incident> = {};
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      const rq = req('kiirabi', 10);
      const inc = mkInc(
        { coord: [LASNA[0] + i * 0.01, LASNA[1]], city: 'Tallinn' },
        {
          id: `i${i}`,
          agencyNeeds: [{ agency: 'kiirabi', reason: { et: '', en: '' }, requested: rq }],
        },
      );
      incidents[inc.id] = inc;
      order.push(inc.id);
    }
    const sim = {
      now: T0 + MIN,
      regionId: 'pohja',
      incidents,
      incidentOrder: order,
      flags: {},
    } as unknown as SimState;
    const d = new AgencyDisplay(svc);
    const counts: number[] = [];
    for (let f = 0; f < 6; f++) {
      d.vehicles(sim, shownAt, f);
      counts.push(asked);
    }
    expect(counts).toEqual([2, 4, 5, 5, 5, 5]);
  });

  it('shows a boat driving back after the incident closes, straight over the water', async () => {
    const d = new AgencyDisplay(await service());
    const rq = req('merepaaste', 30);
    // Off Pirita, at sea.
    const { inc, sim } = scene([24.83, 59.5], rq, { placeKind: 'beach', city: '' });
    sim.now = rq.arriveAt;
    expect(one(d.vehicles(sim, shownAt, 0)).phase).toBe('onscene');
    inc.state = 'closed';
    inc.closedAt = rq.arriveAt + 5 * MIN;
    sim.now = inc.closedAt + MIN;
    const back = one(d.vehicles(sim, shownAt, 1));
    expect(back.phase).toBe('leaving');
    expect(distM(back.pos, [24.83, 59.5])).toBeGreaterThan(100);
    sim.now = inc.closedAt + LEAVE_MS;
    expect(d.vehicles(sim, shownAt, 2)).toHaveLength(0);
  });

  it('leaves out hidden incidents and agencies it does not know (a newer save)', async () => {
    const d = new AgencyDisplay(await service());
    const { inc, sim } = scene(LASNA, req('kiirabi', 10));
    sim.now = T0 + MIN;
    (sim.flags as Record<string, unknown>)['hidden:i1'] = true;
    expect(d.vehicles(sim, shownAt, 0)).toHaveLength(0);
    delete (sim.flags as Record<string, unknown>)['hidden:i1'];
    inc.agencyNeeds[0].requested!.agency = 'politseihobune' as Agency;
    expect(d.vehicles(sim, shownAt, 1)).toHaveLength(0);
  });
});

describe('every agency', () => {
  it('has a vehicle, its own glyph and colour, and a name and tag in both languages', () => {
    const css = readFileSync(join(ROOT, 'src/map/map.css'), 'utf8');
    const colours = new Set<string>();
    const glyphs = new Set<string>();
    expect(Object.keys(AGENCY_VEHICLES).sort()).toEqual([...AGENCIES].sort());
    for (const a of AGENCIES) {
      expect(AGENCY_GLYPHS[a], a).toMatch(/^<svg /);
      glyphs.add(AGENCY_GLYPHS[a]);
      const colour = css.match(new RegExp(`\\.epdm-ag--${a} \\{\\s*--a: (#[0-9a-f]+);`))?.[1];
      expect(colour, a).toBeTruthy();
      colours.add(colour!);
      for (const k of [`map.agency.${a}`, `map.agencyTag.${a}`]) {
        expect(DICT[k]?.et, k).toBeTruthy();
        expect(DICT[k]?.en, k).toBeTruthy();
      }
    }
    expect(glyphs.size).toBe(AGENCIES.length);
    expect(colours.size).toBe(AGENCIES.length);
    expect(agencyTitle({ agency: 'paaste', phase: 'enroute', eta: 5.5 * MIN }, 'et')).toBe(
      'Päästeamet · saabub ~6 min',
    );
    expect(agencyTitle({ agency: 'sotsiaal', phase: 'onscene', eta: 0 }, 'et')).toBe('Lastekaitse kohal');
    expect(agencyTitle({ agency: 'kapo', phase: 'waiting', eta: 20 * MIN }, 'en')).toBe(
      'Internal Security Service · arriving in ~20 min',
    );
  });

  it('gets an origin in every prefecture and is at the scene exactly when the engine says it arrived', () => {
    for (const rid of REGION_IDS) {
      const s = createShift({
        seed: 7,
        regionId: rid,
        mode: 'free',
        difficulty: 'normal',
        start: T0,
        hours: 8,
        playerName: 'Test',
      });
      const pick = () =>
        s.incidentOrder
          .map((id) => s.incidents[id])
          .find((i) => i.location.zone === 'mainland' && !s.flags[`hidden:${i.id}`]);
      for (let m = 0; m < 240 && !pick(); m++) step(s, MIN);
      const inc = pick()!;
      expect(inc, rid).toBeTruthy();
      // Nothing may end it before the agencies are there.
      inc.expiresAt = undefined;
      for (const a of AGENCIES) requestAgency(s, inc.id, a);
      const requests = inc.agencyNeeds.map((n) => n.requested!).filter(Boolean);
      expect(requests.map((r) => r.agency).sort(), rid).toEqual([...AGENCIES].sort());
      for (const rq of requests) {
        const plan = planTrip(REGIONS[rid], inc, rq)!;
        expect(plan.origin, `${rid} ${rq.agency}`).not.toBeNull();
        expect(plan.departAt, `${rid} ${rq.agency}`).toBeLessThan(rq.arriveAt);
        expect(plan.arriveAt).toBe(rq.arriveAt);
        expect(tripAt(plan, inc, rq.arriveAt - 1, true)!.phase).toMatch(/^(enroute|waiting)$/);
        expect(tripAt(plan, inc, rq.arriveAt, true)!.phase).toBe('onscene');
      }
      // The engine's "Kohale jõudis: kiirabi" comes at the same game moment.
      const amb = requests.find((r) => r.agency === 'kiirabi')!;
      step(s, amb.arriveAt - s.now - 5000);
      expect(amb.arrived ?? false, rid).toBe(false);
      step(s, 5000);
      expect(s.now).toBe(amb.arriveAt);
      expect(amb.arrived, rid).toBe(true);
    }
  });
});

describe('owner rules for the agency vehicle files', () => {
  it('has no em or en dashes', () => {
    const banned = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);
    for (const f of [
      'src/map/agencies.ts',
      'src/map/markers.ts',
      'src/map/controller.ts',
      'src/map/glyphs.ts',
      'src/map/map.css',
      'src/i18n/parts/map.ts',
      'tests/map-agencies.test.ts',
    ])
      expect(banned.test(readFileSync(join(ROOT, f), 'utf8')), f).toBe(false);
  });
});
