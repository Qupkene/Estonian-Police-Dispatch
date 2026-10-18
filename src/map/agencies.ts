/**
 * Vehicles of the other agencies on the map (display only, like roads.ts): the ambulance, the
 * Päästeamet truck, the child protection worker's car and the rest drive to the incident once the
 * dispatcher has asked Häirekeskus for them.
 *
 * The engine keeps an agency abstract (AgencyRequest: requestedAt and arriveAt; "Kohale jõudis"
 * when the game clock passes arriveAt). The map derives the whole trip from those fields, the
 * incident and the region's data, so the simulation and the save format stay as they are and a save
 * opened mid-trip shows the vehicle where it is on its way:
 *  - origin: a base of the agency in the incident's zone (AGENCY_VEHICLES[a].base, agencyBases),
 *    the nearest one a believable trip away (kmh). When every base is farther, the vehicle starts on
 *    the way from the nearest one (a crew already on the road); when every base is nearer, it waits
 *    there and leaves later, at its usual speed.
 *  - path: a road route from the origin to where the incident is shown (RoadService, cached by
 *    request and asked for at most ROUTES_PER_FRAME at a time), a straight line without road data or
 *    route, and straight over the water for a boat (like the police boats).
 *  - timing: it leaves at requestedAt and is at the scene exactly at arriveAt, played along the path
 *    by game time, so it follows the game speed and stops when the game is paused.
 *  - at the scene it stands next to the incident (the controller lines it up with the units there)
 *    until the incident closes, then drives back the way it came for LEAVE_MS and disappears; without
 *    a road route it disappears when the incident closes.
 */
import type { Agency, AgencyRequest, Incident, Lang, LngLat, RegionDef, SimState, Town } from '@/sim/types';
import { REGIONS } from '@/data/regions';
import { haversineKm } from '@/sim/geo';
import { t } from '@/i18n';
import { pathFromPoints, pointAtFraction, type DisplayPath } from './roadGraph';
import { incidentSnapKind, PENDING_HOLD_MS, type RoadService, type RouteEntry } from './roads';
import { isHidden, type IncCoordFn } from './overlays';

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Where an agency's vehicles start: `ambulance` hospitals and the bigger towns without one (their
 * kiirabi crews), `rescue` the bigger towns (päästekomandod), `local` the incident's own town (the
 * municipality), `hq` the prefecture's main town (the island's main town on an island), `harbour`
 * harbours and ports of any zone.
 */
export type AgencyBase = 'ambulance' | 'rescue' | 'local' | 'hq' | 'harbour';

export interface AgencyVehicleSpec {
  base: AgencyBase;
  /** A boat: straight over the water from a harbour, whatever the zone. */
  water?: boolean;
  /** Has blue lights (flashing while it drives to the scene). */
  lights?: boolean;
  /** Straight-line speeds (km/h) of a believable trip: slowest, usual, fastest. */
  kmh: readonly [number, number, number];
}

const EMERGENCY = [30, 45, 80] as const;
const OFFICIAL = [20, 40, 75] as const;
const BOAT = [12, 30, 60] as const;

export const AGENCY_VEHICLES: Record<Agency, AgencyVehicleSpec> = {
  kiirabi: { base: 'ambulance', lights: true, kmh: EMERGENCY },
  paaste: { base: 'rescue', lights: true, kmh: EMERGENCY },
  merepaaste: { base: 'harbour', water: true, lights: true, kmh: BOAT },
  sotsiaal: { base: 'local', kmh: OFFICIAL },
  kov: { base: 'local', kmh: OFFICIAL },
  keskkonnaamet: { base: 'hq', kmh: OFFICIAL },
  veterinaar: { base: 'hq', kmh: OFFICIAL },
  tolliamet: { base: 'hq', kmh: OFFICIAL },
  transpordiamet: { base: 'hq', kmh: OFFICIAL },
  kapo: { base: 'hq', kmh: OFFICIAL },
};

/** Towns this big have an ambulance crew and a rescue station of their own. */
export const BASE_TOWN_POP = 1500;
/** A town this near (km) a hospital has its ambulances at the hospital. */
const HOSPITAL_TOWN_KM = 3;
/** After the incident closes the vehicle drives off for this long (game ms), then disappears. */
export const LEAVE_MS = 3 * MIN;
/** New road routes asked for per frame (a save opened with several vehicles on the way). */
const ROUTES_PER_FRAME = 2;

const zoneOf = (x: { zone?: string }) => x.zone ?? 'mainland';

function nearestTown(towns: readonly Town[], p: LngLat): Town | undefined {
  let best: Town | undefined;
  let bd = Infinity;
  for (const t of towns) {
    const d = haversineKm(t.coord, p);
    if (d < bd) [best, bd] = [t, d];
  }
  return best;
}

/** Candidate starting points of an agency's vehicle for an incident (see AgencyBase). */
export function agencyBases(region: RegionDef, agency: Agency, inc: Incident): LngLat[] {
  const spec = AGENCY_VEHICLES[agency];
  if (!spec) return [];
  const zone = inc.location?.zone ?? 'mainland';
  const towns = (region.towns ?? []).filter((t) => zoneOf(t) === zone);
  let out: LngLat[] = [];
  switch (spec.base) {
    case 'ambulance': {
      const hospitals = (region.places ?? [])
        .filter((p) => p.kind === 'hospital' && zoneOf(p) === zone)
        .map((p) => p.coord);
      const crews = towns.filter(
        (t) =>
          t.population >= BASE_TOWN_POP && !hospitals.some((h) => haversineKm(h, t.coord) < HOSPITAL_TOWN_KM),
      );
      out = [...hospitals, ...crews.map((t) => t.coord)];
      break;
    }
    case 'rescue':
      out = towns.filter((t) => t.population >= BASE_TOWN_POP).map((t) => t.coord);
      break;
    case 'local': {
      const own = towns.find((t) => t.name === inc.location.city) ?? nearestTown(towns, inc.location.coord);
      if (own) out = [own.coord];
      break;
    }
    case 'hq': {
      const main =
        towns.find((t) => t.name === region.hqCity) ??
        towns.reduce<Town | undefined>((a, t) => (!a || t.population > a.population ? t : a), undefined);
      if (main) out = [main.coord];
      break;
    }
    case 'harbour':
      out = [
        ...(region.stations ?? []).filter((s) => s.kind === 'harbour').map((s) => s.coord),
        ...(region.places ?? []).filter((p) => p.kind === 'port').map((p) => p.coord),
      ];
      break;
  }
  // No base of its own in the zone (a small island): it comes from one of the zone's towns.
  if (!out.length) out = towns.map((t) => t.coord);
  return out;
}

/** The trip of one agency vehicle, derived from the request (game times). */
export interface TripPlan {
  agency: Agency;
  /** Where it starts; null when there is nowhere to come from (it is shown once it has arrived). */
  origin: LngLat | null;
  requestedAt: number;
  /** When it leaves: requestedAt, or later when every base is nearer than a believable trip. */
  departAt: number;
  arriveAt: number;
}

const toward = (a: LngLat, b: LngLat, f: number): LngLat => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
];

/** Origin and departure of the vehicle answering a request (null: no vehicle for this agency). */
export function planTrip(region: RegionDef, inc: Incident, rq: AgencyRequest): TripPlan | null {
  const spec = AGENCY_VEHICLES[rq.agency];
  if (!spec || !inc.location?.coord) return null;
  const plan: TripPlan = {
    agency: rq.agency,
    origin: null,
    requestedAt: rq.requestedAt,
    departAt: rq.arriveAt,
    arriveAt: rq.arriveAt,
  };
  const h = (rq.arriveAt - rq.requestedAt) / HOUR;
  if (!(h > 0)) return plan;
  const to = inc.location.coord;
  const [slow, usual, fast] = spec.kmh;
  let fit: LngLat | undefined;
  let fitD = Infinity;
  let far: LngLat | undefined;
  let farD = Infinity;
  let near: LngLat | undefined;
  let nearD = -1;
  for (const b of agencyBases(region, rq.agency, inc)) {
    const d = haversineKm(b, to);
    if (d < slow * h) {
      if (d > nearD) [near, nearD] = [b, d];
    } else if (d > fast * h) {
      if (d < farD) [far, farD] = [b, d];
    } else if (d < fitD) [fit, fitD] = [b, d];
  }
  if (fit) {
    plan.origin = fit;
    plan.departAt = rq.requestedAt;
  } else if (far) {
    // On the way from the nearest base, as far out as the usual speed covers in the time.
    plan.origin = toward(to, far, (usual * h) / farD);
    plan.departAt = rq.requestedAt;
  } else if (near) {
    plan.origin = near;
    plan.departAt = Math.max(rq.requestedAt, rq.arriveAt - (nearD / usual) * HOUR);
  }
  return plan;
}

export type TripPhase = 'waiting' | 'enroute' | 'onscene' | 'leaving';

/**
 * Where a vehicle is on its trip at game time `now`: the phase and the fraction of the path from the
 * origin (1 = at the scene). Null when it is not on the map: no origin and not arrived yet, or gone
 * after the incident closed. `canLeave`: its path is a road route (or a boat's line), so it drives
 * back along it after the incident closes; otherwise it disappears then.
 */
export function tripAt(
  plan: TripPlan,
  inc: Incident,
  now: number,
  canLeave: boolean,
): { phase: TripPhase; f: number } | null {
  const span = plan.arriveAt - plan.departAt;
  const at = (t: number) => (span > 0 ? Math.min(1, Math.max(0, (t - plan.departAt) / span)) : 1);
  if (inc.state === 'closed') {
    const closedAt = inc.closedAt ?? -Infinity;
    if (now >= closedAt) {
      if (!canLeave || !plan.origin || !(span > 0) || closedAt <= plan.departAt) return null;
      const f = at(closedAt) - (now - closedAt) / span;
      if (f <= 0 || now - closedAt >= LEAVE_MS) return null;
      return { phase: 'leaving', f };
    }
  }
  if (now >= plan.arriveAt) return { phase: 'onscene', f: 1 };
  if (!plan.origin || now < plan.requestedAt) return null;
  if (now < plan.departAt) return { phase: 'waiting', f: 0 };
  return { phase: 'enroute', f: at(now) };
}

/** One agency vehicle as the markers draw it (the same object every frame, updated in place). */
export interface AgencyVehicle {
  /** 'ag:<incident id>:<agency>', never a unit id. */
  key: string;
  incidentId: string;
  agency: Agency;
  phase: TripPhase;
  pos: LngLat;
  heading: number;
  /** Game ms until it arrives (0 once there). */
  eta: number;
  /** Blue lights flashing: an emergency vehicle driving to the scene. */
  lights: boolean;
}

/** Whole minutes until arrival as the tooltip says them (at least 1). */
export const etaMinutes = (eta: number) => Math.max(1, Math.ceil(eta / MIN));

/** Tooltip of an agency vehicle: "Kiirabi · saabub ~4 min", "Kiirabi kohal", "Kiirabi · lahkub". */
export function agencyTitle(v: Pick<AgencyVehicle, 'agency' | 'phase' | 'eta'>, lang: Lang): string {
  const agency = t(`map.agency.${v.agency}`, lang);
  if (v.phase === 'onscene') return t('map.agency.onscene', lang, { agency });
  if (v.phase === 'leaving') return t('map.agency.leaving', lang, { agency });
  return t('map.agency.enroute', lang, { agency, n: etaMinutes(v.eta) });
}

interface VehicleRec {
  out: AgencyVehicle;
  /** Identity of the request the plan was made for. */
  requestedAt: number;
  arriveAt: number;
  plan: TripPlan | null;
  /** Road data generation of the path (-1 = straight without road data, -2 = over the water). */
  gen: number;
  route?: RouteEntry;
  path?: DisplayPath;
  /** The path is a road route or a boat's line: it can drive off the same way. */
  routed: boolean;
  /** Shown while the route is computed: the previous path, or a straight line after PENDING_HOLD_MS. */
  tmp?: DisplayPath;
  /** End of the straight path (the incident as shown). */
  end?: LngLat;
  seen: number;
}

const same = (a: LngLat, b: LngLat) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/** Per-simulation display state of the agency vehicles (kept across map remounts of the same shift). */
export class AgencyDisplay {
  private recs = new Map<string, VehicleRec>();
  private list: AgencyVehicle[] = [];
  private budget = 0;
  private prunedAt = 0;

  constructor(readonly svc: RoadService) {}

  /**
   * The agency vehicles on the map at the simulation's time (the same array every call). `incCoord`
   * says where an incident is shown; `now` is real time (route requests and their waiting time).
   */
  vehicles(s: SimState, incCoord: IncCoordFn, now: number): readonly AgencyVehicle[] {
    const list = this.list;
    list.length = 0;
    const region = REGIONS[s.regionId];
    if (!region) return list;
    this.budget = ROUTES_PER_FRAME;
    for (const id of s.incidentOrder ?? []) {
      const inc = s.incidents[id];
      if (!inc?.agencyNeeds?.length || !inc.location?.coord) continue;
      if (inc.state === 'closed' && !(s.now - (inc.closedAt ?? -Infinity) < LEAVE_MS)) continue;
      if (isHidden(s, id)) continue;
      for (const need of inc.agencyNeeds) {
        const rq = need.requested;
        if (!rq || !AGENCY_VEHICLES[rq.agency]) continue;
        const key = `ag:${id}:${rq.agency}`;
        let r = this.recs.get(key);
        if (!r || r.requestedAt !== rq.requestedAt || r.arriveAt !== rq.arriveAt) {
          r = {
            out: {
              key,
              incidentId: id,
              agency: rq.agency,
              phase: 'enroute',
              pos: inc.location.coord,
              heading: 0,
              eta: 0,
              lights: false,
            },
            requestedAt: rq.requestedAt,
            arriveAt: rq.arriveAt,
            plan: planTrip(region, inc, rq),
            gen: NaN,
            routed: false,
            seen: now,
          };
          this.recs.set(key, r);
        }
        r.seen = now;
        if (r.plan && this.place(s, inc, r, incCoord, now)) list.push(r.out);
      }
    }
    if (now - this.prunedAt > 10_000) {
      this.prunedAt = now;
      for (const [k, r] of this.recs) if (now - r.seen > 60_000) this.recs.delete(k);
    }
    return list;
  }

  /** Update the vehicle's output for this frame; false when it is not shown. */
  private place(s: SimState, inc: Incident, r: VehicleRec, incCoord: IncCoordFn, now: number): boolean {
    const plan = r.plan!;
    const spec = AGENCY_VEHICLES[plan.agency];
    const path = plan.origin ? this.pathOf(inc, r, plan.origin, spec, incCoord, now) : undefined;
    const st = tripAt(plan, inc, s.now, r.routed);
    if (!st) return false;
    const o = r.out;
    if (path) {
      const p = pointAtFraction(path, st.f);
      o.pos = p.pos;
      if (st.phase === 'enroute') o.heading = p.heading;
      else if (st.phase === 'leaving') o.heading = (p.heading + 180) % 360;
    } else if (st.phase === 'onscene') o.pos = incCoord(inc) ?? inc.location.coord;
    // The route is still being computed: shown in a moment.
    else return false;
    o.phase = st.phase;
    o.eta = Math.max(0, plan.arriveAt - s.now);
    o.lights = !!spec.lights && st.phase === 'enroute';
    return true;
  }

  /** The path to play the trip on, or undefined while its road route is still coming. */
  private pathOf(
    inc: Incident,
    r: VehicleRec,
    origin: LngLat,
    spec: AgencyVehicleSpec,
    incCoord: IncCoordFn,
    now: number,
  ): DisplayPath | undefined {
    const ready = this.svc.state === 'ready';
    if (spec.water || !ready) {
      const end = incCoord(inc) ?? inc.location.coord;
      const gen = spec.water ? -2 : -1;
      if (!r.path || r.gen !== gen || !r.end || !same(r.end, end)) {
        r.path = pathFromPoints([origin, end]);
        r.end = end;
        r.gen = gen;
        r.route = undefined;
        r.tmp = undefined;
        r.routed = !!spec.water;
      }
      return r.path;
    }
    if (!r.route || r.gen !== this.svc.gen) {
      if (this.budget <= 0) return r.path ?? r.tmp;
      this.budget--;
      // Whatever was shown (a straight line before the road data came in) stays until the route is in.
      r.tmp = r.path ?? r.tmp;
      r.path = undefined;
      r.gen = this.svc.gen;
      r.routed = false;
      r.route = this.svc.route(
        `${r.out.key}|${r.requestedAt}|${r.gen}`,
        origin,
        'road',
        inc.location.coord,
        incidentSnapKind(inc),
        now,
      );
    }
    if (r.path) return r.path;
    const e = r.route;
    if (e.done) {
      const a = e.answer!;
      r.path = a.path ?? pathFromPoints([a.from, a.to]);
      r.routed = !!a.path;
      r.tmp = undefined;
      return r.path;
    }
    if (r.tmp) return r.tmp;
    if (now - e.at < PENDING_HOLD_MS) return undefined;
    // Slow answer: a straight line for now, the route replaces it.
    r.tmp = pathFromPoints([origin, incCoord(inc) ?? inc.location.coord]);
    return r.tmp;
  }
}

const displays = new WeakMap<SimState, AgencyDisplay>();

/** Agency vehicle state for a simulation (one per shift, shared by every map showing it). */
export function agencyDisplay(sim: SimState, svc: RoadService): AgencyDisplay {
  let d = displays.get(sim);
  if (!d || d.svc !== svc) {
    d = new AgencyDisplay(svc);
    displays.set(sim, d);
  }
  return d;
}
