/**
 * Units (engine-core): roster → units, crews, movement, ETA, patrol wandering, fatigue & breaks.
 * See DESIGN §4.8.
 */
import { randomName } from '@/gen/names';
import { bearing, cumulative, destination, haversineKm, lerp, along } from './geo';
import { emit, regionOf } from './internal';
import { onUnitArrived } from './incidents';
import { waterBodiesNear } from './land';
import { phrase, radioVars, unitPhrase, unitSay } from './radio';
import { Rng, withRng } from './rng';
import { HOUR, MIN } from './time';
import type {
  Difficulty,
  Gender,
  Incident,
  LngLat,
  Movement,
  NewShiftOptions,
  Officer,
  Place,
  PlaceKind,
  RegionDef,
  RosterUnit,
  SimState,
  SpeakerLang,
  Station,
  Text,
  Unit,
  UnitNeed,
  UnitSpec,
  UnitStatus,
  UnitType,
} from './types';

const T = (et: string, en: string): Text => ({ et, en });

export const DIFF_RANK: Record<Difficulty, number> = { cadet: 0, normal: 1, veteran: 2, realistic: 3 };

/** Activation delay for on-call units sitting at base (K-komando, helicopter). */
export const ONCALL_DELAY_MIN = 5;
const BREAK_MIN = 30;

export function hasUpgrade(s: SimState, id: string): boolean {
  return s.flags[`upg:${id}`] === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Region geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

export function stationById(region: RegionDef, id: string | undefined): Station | undefined {
  if (!id) return undefined;
  return region.stations.find((st) => st.id === id);
}

export function unitStation(s: SimState, u: Unit): Station | undefined {
  return stationById(regionOf(s), u.stationId);
}

/** Base coordinate of a unit (its station; falls back to region centre). */
export function unitHome(s: SimState, u: Unit): LngLat {
  return unitStation(s, u)?.coord ?? regionOf(s).center;
}

const bigTownCache = new WeakMap<RegionDef, { coord: LngLat; r: number }[]>();

function bigTowns(region: RegionDef): { coord: LngLat; r: number }[] {
  let c = bigTownCache.get(region);
  if (!c) {
    c = region.towns
      .filter((t) => t.population >= 10_000)
      .map((t) => ({ coord: t.coord, r: 1.5 + 1.6 * Math.sqrt(t.population / 10_000) }));
    bigTownCache.set(region, c);
  }
  return c;
}

/** Tiheasustusala: within the built-up radius of a town with ≥ 10 000 inhabitants. */
export function isUrbanAt(region: RegionDef, p: LngLat): boolean {
  for (const t of bigTowns(region)) if (haversineKm(t.coord, p) <= t.r) return true;
  return false;
}

/** Urban by city name (DESIGN §4.5): the city is a region town with population ≥ 10 000. */
export function isUrbanCity(region: RegionDef, city: string | undefined, p?: LngLat): boolean {
  if (city) {
    const town = region.towns.find((t) => t.name === city);
    if (town) return town.population >= 10_000;
  }
  return p ? isUrbanAt(region, p) : false;
}

const zonePointCache = new WeakMap<RegionDef, { p: LngLat; zone: string }[]>();

/** Movement zone of an arbitrary coordinate (nearest known station/place/town). */
export function zoneAt(region: RegionDef, p: LngLat): string {
  const dflt = region.zones[0]?.id ?? 'mainland';
  if (region.zones.length <= 1) return dflt;
  let pts = zonePointCache.get(region);
  if (!pts) {
    pts = [
      ...region.stations.map((x) => ({ p: x.coord, zone: x.zone ?? 'mainland' })),
      ...region.places.map((x) => ({ p: x.coord, zone: x.zone ?? 'mainland' })),
      ...region.towns.map((x) => ({ p: x.coord, zone: x.zone ?? 'mainland' })),
    ];
    zonePointCache.set(region, pts);
  }
  let best = dflt;
  let bd = Infinity;
  for (const z of pts) {
    const d = haversineKm(z.p, p);
    if (d < bd) {
      bd = d;
      best = z.zone;
    }
  }
  return best;
}

/** Extra ferry minutes between two zones; null = unreachable by road. */
export function ferryMinutes(region: RegionDef, from: string, to: string): number | null {
  if (from === to) return 0;
  const leg = (z: string): number | null => {
    if (z === 'mainland') return 0;
    const zone = region.zones.find((x) => x.id === z);
    if (!zone) return 0;
    return zone.ferryMinutes;
  };
  const a = leg(from);
  const b = leg(to);
  if (a === null || b === null) return null;
  return a + b;
}

export function nearestHospital(s: SimState, p: LngLat, zone?: string): Place | undefined {
  const region = regionOf(s);
  let best: Place | undefined;
  let bd = Infinity;
  for (const pl of region.places) {
    if (pl.kind !== 'hospital') continue;
    if (zone && (pl.zone ?? 'mainland') !== zone) continue;
    const d = haversineKm(pl.coord, p);
    if (d < bd) {
      bd = d;
      best = pl;
    }
  }
  if (!best && zone) return nearestHospital(s, p);
  return best;
}

/**
 * Where a detainee is taken. On an island with its own holding cells (Kuressaare, Kärdla) that is
 * the local cells; otherwise the prefecture's arrest house (`arrestHouseId`; Põhja has two
 * mainland arrest stations, so the id decides there).
 */
export function arrestHouse(s: SimState, zone?: string): Station | undefined {
  const region = regionOf(s);
  if (zone && zone !== 'mainland') {
    const local = region.stations.find((x) => x.kind === 'arrest' && (x.zone ?? 'mainland') === zone);
    if (local) return local;
  }
  return stationById(region, region.arrestHouseId) ?? region.stations.find((x) => x.kind === 'arrest') ?? region.stations[0];
}

export function nearestStation(s: SimState, p: LngLat, zone?: string): Station | undefined {
  const region = regionOf(s);
  let best: Station | undefined;
  let bd = Infinity;
  for (const st of region.stations) {
    if (zone && (st.zone ?? 'mainland') !== zone) continue;
    if (st.kind === 'airbase' || st.kind === 'harbour') continue;
    const d = haversineKm(st.coord, p);
    if (d < bd) {
      bd = d;
      best = st;
    }
  }
  return best ?? region.stations[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Travel model (DESIGN §4.8)
// ─────────────────────────────────────────────────────────────────────────────

export type SpeedProfile = 'siren' | 'normal' | 'patrol';

const SPEEDS: Record<SpeedProfile, [number, number]> = {
  siren: [58, 95],
  normal: [40, 75],
  patrol: [35, 60],
};

export interface TravelEstimate {
  minutes: number;
  roadKm: number;
  straightKm: number;
}

/** Pure ETA estimate between two points for a unit type. null = unreachable. */
export function travelEstimate(
  s: SimState,
  type: UnitType,
  from: LngLat,
  fromZone: string,
  to: LngLat,
  toZone: string,
  profile: SpeedProfile,
): TravelEstimate | null {
  const region = regionOf(s);
  const d = haversineKm(from, to);
  const wk = s.weather?.kind;
  if (type === 'heli') {
    const wx = wk === 'storm' ? 1.4 : wk === 'fog' || wk === 'snow' ? 1.2 : 1;
    return { minutes: Math.max(0.5, (d / 200) * 60 * wx), roadKm: d, straightKm: d };
  }
  if (type === 'boat') {
    const wx = wk === 'storm' ? 1.5 : 1;
    const km = d * 1.15;
    return { minutes: Math.max(0.5, (km / 40) * 60 * wx), roadKm: km, straightKm: d };
  }
  const ferry = ferryMinutes(region, fromZone, toZone);
  if (ferry === null) return null;
  const uS = isUrbanAt(region, from);
  const uE = isUrbanAt(region, to);
  let urbanKm = (uS ? Math.min(d / 2, 6) : 0) + (uE ? Math.min(d / 2, 6) : 0);
  if (uS && uE && d < 14) urbanKm = d;
  urbanKm = Math.min(d, urbanKm);
  const ruralKm = d - urbanKm;
  const [us, rs] = SPEEDS[profile];
  const road = s.weather?.roadFactor || 1;
  const minutes = ((urbanKm * 1.35) / us + (ruralKm * 1.25) / rs) * 60 * road + ferry;
  return { minutes: Math.max(0.5, minutes), roadKm: urbanKm * 1.35 + ruralKm * 1.25, straightKm: d };
}

// ─────────────────────────────────────────────────────────────────────────────
// Boats: they travel in a straight line, so they may only go where their own water body reaches
// ─────────────────────────────────────────────────────────────────────────────

const WATER_KINDS: PlaceKind[] = ['port', 'beach', 'lake'];
const boatHomeCache = new WeakMap<RegionDef, Map<string, Set<string>>>();
const incWaterCache = new WeakMap<object, Set<string>>();

/**
 * Water bodies by a point: within 1 km, or (wide) the nearest ring up to 5 km that finds any. The
 * coastline and lake outlines are coarse, so a beach or harbour can test a few km from water.
 */
function waterNear(p: LngLat, wide: boolean): Set<string> {
  for (const km of wide ? [1, 2.5, 5] : [1]) {
    const w = waterBodiesNear(p, km);
    if (w.size) return w;
  }
  return new Set();
}

/** Water bodies a boat works on: the one(s) by its home harbour. */
function boatHome(region: RegionDef, u: Unit): Set<string> {
  let m = boatHomeCache.get(region);
  if (!m) {
    m = new Map();
    boatHomeCache.set(region, m);
  }
  let w = m.get(u.stationId);
  if (!w) {
    w = waterNear(stationById(region, u.stationId)?.coord ?? u.pos, true);
    m.set(u.stationId, w);
  }
  return w;
}

/**
 * Can this patrol boat reach the incident over water? The incident must be on or by water (within
 * 1 km; up to 5 km for ports, beaches, lakes, events that ask for a boat and islands without a
 * road link) and that water must be the boat's own: a Peipsi boat cannot sail to the Gulf of
 * Finland, and no boat reaches an inland lake such as Pühajärv. A harbour with no water found
 * around it (coarse data) does not restrict its boat.
 */
export function boatCanReach(s: SimState, u: Unit, inc: Incident): boolean {
  const region = regionOf(s);
  const wantsBoat = inc.need.some((n) => n.type === 'boat') || inc.ideal.some((n) => n.type === 'boat');
  const watery = wantsBoat || WATER_KINDS.includes(inc.location.placeKind) || ferryMinutes(region, 'mainland', inc.location.zone) === null;
  let at = incWaterCache.get(inc.location);
  if (!at) {
    at = waterNear(inc.location.coord, watery);
    incWaterCache.set(inc.location, at);
  }
  if (!at.size) return false;
  const home = boatHome(region, u);
  if (!home.size) return true;
  for (const w of at) if (home.has(w)) return true;
  return false;
}

/** Position & heading of a unit at time t (interpolates the active movement). */
export function unitPosAt(u: Unit, t: number): { pos: LngLat; heading: number } {
  const m = u.move;
  if (!m || m.path.length === 0) return { pos: u.pos, heading: u.heading };
  if (m.path.length === 1) return { pos: m.path[0], heading: u.heading };
  if (t <= m.departAt) return { pos: m.path[0], heading: bearing(m.path[0], m.path[1]) };
  const total = m.cum[m.cum.length - 1];
  const span = m.arriveAt - m.departAt;
  const f = span > 0 ? Math.min(1, (t - m.departAt) / span) : 1;
  return along(m.path, m.cum, total * f);
}

/** Memo of zoneAt() for each movement's end point (pure geometry, so reloads agree). */
const moveEndZone = new WeakMap<Movement, string>();

/** Zone a movement ends in: the incident's zone for incident trips, the station's for returns. */
function destZoneOf(s: SimState, u: Unit, m: Movement): string {
  const inc = m.purpose === 'incident' && u.incidentId ? s.incidents[u.incidentId] : undefined;
  if (inc) return inc.location.zone;
  const home = m.purpose === 'return' ? unitStation(s, u)?.zone : undefined;
  if (home) return home;
  let z = moveEndZone.get(m);
  if (z === undefined) {
    z = zoneAt(regionOf(s), m.path[m.path.length - 1]);
    moveEndZone.set(m, z);
  }
  return z;
}

/**
 * Movement zone the unit is in right now. `u.zone` is only updated on arrival, so mid-trip across
 * zones (on or past the ferry) the zone is derived from the current position instead. Trips that
 * stay inside the unit's zone keep `u.zone` (no nearest-point guessing near a coast).
 */
export function unitZoneNow(s: SimState, u: Unit, pos?: LngLat): string {
  const m = u.move;
  if (!m || m.path.length === 0) return u.zone;
  const region = regionOf(s);
  if (region.zones.length <= 1) return u.zone;
  if (destZoneOf(s, u, m) === u.zone) return u.zone;
  return zoneAt(region, pos ?? unitPosAt(u, s.now).pos);
}

/** Is the unit parked at its station (for on-call activation)? */
export function atBase(s: SimState, u: Unit): boolean {
  if (u.move) return false;
  return haversineKm(u.pos, unitHome(s, u)) < 0.5;
}

/** ETA (minutes) and straight-line km for a unit to reach a point now, or null if unreachable. */
export function unitEta(s: SimState, u: Unit, to: LngLat, toZone: string, siren: boolean): { etaMin: number; km: number } | null {
  const from = unitPosAt(u, s.now).pos;
  const est = travelEstimate(s, u.type, from, unitZoneNow(s, u, from), to, toZone, siren ? 'siren' : 'normal');
  if (!est) return null;
  let eta = est.minutes;
  if (u.onCall && u.status === 'available' && atBase(s, u)) eta += ONCALL_DELAY_MIN;
  if (u.move && u.move.departAt > s.now) eta += (u.move.departAt - s.now) / MIN;
  return { etaMin: eta, km: est.straightKm };
}

/** Organic-looking path: straight segments with mild bends. */
export function makePath(r: Rng, from: LngLat, to: LngLat): LngLat[] {
  const d = haversineKm(from, to);
  if (d < 0.08) return [from, to];
  const b = bearing(from, to);
  const side = r.chance(0.5) ? 90 : -90;
  const bends = d > 8 ? [0.33, 0.68] : [0.5];
  const pts: LngLat[] = [from];
  for (let i = 0; i < bends.length; i++) {
    const t = bends[i] + r.range(-0.06, 0.06);
    const mid = lerp(from, to, t);
    const off = d * r.range(0.03, 0.11);
    pts.push(destination(mid, off, b + (i % 2 === 0 ? side : -side * 0.6)));
  }
  pts.push(to);
  return pts;
}

/** Add the distance travelled so far on the current movement to the km counters. */
function settleKm(s: SimState, u: Unit, now: number): void {
  const m = u.move;
  if (!m) return;
  const total = m.cum[m.cum.length - 1] ?? 0;
  const span = m.arriveAt - m.departAt;
  const f = now <= m.departAt ? 0 : span > 0 ? Math.min(1, (now - m.departAt) / span) : 1;
  const km = total * f * (u.type === 'heli' || u.type === 'boat' ? 1 : 1.28);
  if (km <= 0) return;
  s.flags.kmDriven = Math.round(((Number(s.flags.kmDriven) || 0) + km) * 10) / 10;
  s.flags[`km:${u.id}`] = Math.round(((Number(s.flags[`km:${u.id}`]) || 0) + km) * 10) / 10;
}

export function setStatus(s: SimState, u: Unit, st: UnitStatus): void {
  if (u.status !== st) {
    u.status = st;
    u.statusSince = s.now;
  }
}

/** Stop the unit where it is right now. */
export function stopUnit(s: SimState, u: Unit): void {
  if (!u.move) return;
  const p = unitPosAt(u, s.now);
  u.zone = unitZoneNow(s, u, p.pos);
  settleKm(s, u, s.now);
  u.pos = p.pos;
  u.heading = p.heading;
  delete u.move;
}

export interface MoveOpts {
  zone?: string;
  targetId?: string;
  profile?: SpeedProfile;
  delayMin?: number;
}

/**
 * Send a unit to a point. Computes path + ETA and sets the status for the purpose.
 * Returns false (and changes nothing) when the target is unreachable.
 */
export function moveUnit(
  s: SimState,
  u: Unit,
  to: LngLat,
  purpose: Movement['purpose'],
  siren: boolean,
  o: MoveOpts = {},
): boolean {
  const region = regionOf(s);
  const from = unitPosAt(u, s.now).pos;
  const fromZone = unitZoneNow(s, u, from);
  const toZone = o.zone ?? zoneAt(region, to);
  const profile: SpeedProfile = o.profile ?? (siren ? 'siren' : purpose === 'patrol' ? 'patrol' : 'normal');
  const est = travelEstimate(s, u.type, from, fromZone, to, toZone, profile);
  if (!est) return false;
  // Keep a pending departure delay (on-call activation) when re-routing before departure.
  let delay = (o.delayMin ?? 0) * MIN;
  if (u.move && u.move.departAt > s.now) delay = Math.max(delay, u.move.departAt - s.now);
  stopUnit(s, u);
  const path = withRng(s, (r) => makePath(r, from, to));
  const departAt = s.now + delay;
  u.move = {
    purpose,
    path,
    cum: cumulative(path),
    departAt,
    arriveAt: departAt + est.minutes * MIN,
    siren,
    ...(o.targetId ? { targetId: o.targetId } : {}),
  };
  u.pos = from;
  if (path.length > 1) u.heading = bearing(path[0], path[1]);
  if (purpose === 'incident') setStatus(s, u, 'enroute');
  else if (purpose === 'transport') setStatus(s, u, 'transport');
  else if (purpose === 'patrol' || purpose === 'return') {
    if (u.status === 'enroute' || u.status === 'onscene' || u.status === 'transport') setStatus(s, u, 'available');
  } else if (u.status === 'available') setStatus(s, u, 'enroute');
  return true;
}

/** Implementation behind internal.moveUnitTo (signature fixed by the contract). */
export function moveUnitToImpl(s: SimState, u: Unit, to: LngLat, purpose: Movement['purpose'], siren: boolean): void {
  const inc = u.incidentId ? s.incidents[u.incidentId] : undefined;
  const zone = purpose === 'incident' && inc ? inc.location.zone : undefined;
  moveUnit(s, u, to, purpose, siren, { zone });
}

// ─────────────────────────────────────────────────────────────────────────────
// Need matching
// ─────────────────────────────────────────────────────────────────────────────

/** Unit types that count as a general response unit ("any" / "patrol" needs). */
const GENERAL: UnitType[] = ['patrol', 'rapid', 'aux', 'traffic', 'border', 'community', 'k9'];

/** Can a unit of this type fill this need slot? */
export function typeFits(need: UnitNeed['type'], t: UnitType): boolean {
  if (need === t) return true;
  if (need === 'any') return GENERAL.includes(t) || t === 'criminal' || t === 'special';
  if (need === 'patrol') return GENERAL.includes(t) || t === 'special';
  if (need === 'rapid') return t === 'special';
  return false;
}

export interface Coverage {
  met: boolean;
  /** Enough bodies, maybe not the right types. */
  countOk: boolean;
  missing: UnitNeed[];
  have: number;
  required: number;
}

/** Greedy assignment of unit types onto need slots (exact types first, then compatible). */
export function coverage(types: UnitType[], needs: UnitNeed[]): Coverage {
  const pool = [...types];
  const missing: UnitNeed[] = [];
  const order = [...needs].sort((a, b) => rankNeed(a.type) - rankNeed(b.type));
  let required = 0;
  for (const n of order) {
    required += n.count;
    let left = n.count;
    for (let pass = 0; pass < 2 && left > 0; pass++) {
      for (let i = 0; i < pool.length && left > 0; ) {
        const ok = pass === 0 ? pool[i] === n.type : typeFits(n.type, pool[i]);
        if (ok) {
          pool.splice(i, 1);
          left--;
        } else i++;
      }
    }
    if (left > 0) missing.push({ type: n.type, count: left });
  }
  return { met: missing.length === 0, countOk: types.length >= required, missing, have: types.length, required };
}

function rankNeed(t: UnitNeed['type']): number {
  return t === 'any' ? 2 : t === 'patrol' ? 1 : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Roster → units (createShift)
// ─────────────────────────────────────────────────────────────────────────────

const RANKS = {
  nk: T('nooremkonstaabel', 'junior constable'),
  k: T('konstaabel', 'constable'),
  vk: T('vanemkonstaabel', 'senior constable'),
  uk: T('ülemkonstaabel', 'chief constable'),
  kom: T('komissar', 'commissioner'),
  vkom: T('vanemkomissar', 'senior commissioner'),
  ltn: T('politseileitnant', 'police lieutenant'),
  aux: T('abipolitseinik', 'auxiliary officer'),
};

function rankFor(years: number, leader: boolean, r: Rng): Text {
  if (years <= 1) return RANKS.nk;
  if (years <= 5) return r.chance(0.8) ? RANKS.k : RANKS.nk;
  if (years <= 11) return r.chance(0.75) ? RANKS.vk : RANKS.k;
  if (years <= 17) return r.chance(0.7) ? RANKS.uk : RANKS.vk;
  if (years <= 22) return leader && r.chance(0.5) ? RANKS.vkom : RANKS.kom;
  return leader ? (r.chance(0.3) ? RANKS.ltn : RANKS.vkom) : RANKS.kom;
}

function titleFor(type: UnitType, years: number, idx: number, r: Rng): Text {
  const senior = years >= 8;
  switch (type) {
    case 'patrol':
      if (idx === 0 && years >= 15 && r.chance(0.3)) return T('rühmajuht', 'team leader');
      return senior ? T('vanempatrullpolitseinik', 'senior patrol officer') : T('patrullpolitseinik', 'patrol officer');
    case 'rapid':
      return T('kiirreageerija', 'rapid response officer');
    case 'k9':
      return idx === 0 ? T('koerajuht', 'dog handler') : T('patrullpolitseinik', 'patrol officer');
    case 'traffic':
      return T('liiklusjärelevalve politseinik', 'traffic enforcement officer');
    case 'criminal':
      return senior ? T('vanemuurija', 'senior investigator') : T('uurija', 'investigator');
    case 'special':
      return T('K-komando operatiivametnik', 'K-Commando operator');
    case 'heli':
      return idx === 0 ? T('piloot', 'pilot') : idx === 1 ? T('kaaspiloot', 'co-pilot') : T('pardaoperaator', 'flight operator');
    case 'border':
      return senior ? T('vanempiirivalvur', 'senior border guard') : T('piirivalvur', 'border guard');
    case 'aux':
      return idx === 0 ? T('patrullpolitseinik', 'patrol officer') : T('abipolitseinik', 'auxiliary officer');
    case 'community':
      return r.chance(0.25) ? T('noorsoopolitseinik', 'youth officer') : T('piirkonnapolitseinik', 'community officer');
    case 'transport':
      return T('konvoeerija', 'escort officer');
    case 'boat':
      return idx === 0 ? T('kapten', 'skipper') : T('merepäästja', 'maritime rescuer');
  }
}

/** Share of Russian-named officers per region (Ida-Virumaa ~25 %). */
function ruShareOfficers(region: RegionDef): number {
  return region.id === 'ida' ? 0.25 : region.id === 'pohja' ? 0.08 : 0.04;
}

export function generateOfficer(
  r: Rng,
  region: RegionDef,
  type: UnitType,
  idx: number,
  id: string,
  usedBadges: Set<string>,
  named?: { firstName: string; lastName: string; badge: string; gender: Gender },
): Officer {
  const gender: Gender = named?.gender ?? (r.chance(type === 'special' ? 0.04 : type === 'community' ? 0.45 : 0.3) ? 'F' : 'M');
  const lang: SpeakerLang = r.chance(ruShareOfficers(region)) ? 'ru' : 'et';
  const nm = named ? { firstName: named.firstName, lastName: named.lastName } : randomName(r, lang, gender);
  let badge = named?.badge ?? '';
  for (let i = 0; !badge || (usedBadges.has(badge) && i < 20); i++) badge = String(r.int(10, 9999)).padStart(3, '0');
  usedBadges.add(badge);
  const isAux = type === 'aux' && idx > 0;
  const leader = idx === 0;
  let years = isAux ? r.int(1, 8) : Math.max(1, Math.min(25, Math.round(r.normal(leader ? 11 : 7, 5))));
  if (type === 'special' || type === 'heli') years = Math.max(years, r.int(6, 14));
  const skill = Math.max(0.25, Math.min(0.97, r.normal(0.62, 0.14) + Math.min(0.08, years * 0.004) - (isAux ? 0.06 : 0)));
  return {
    id,
    badge,
    firstName: nm.firstName,
    lastName: nm.lastName,
    gender,
    rank: isAux ? RANKS.aux : rankFor(years, leader, r),
    title: titleFor(type, years, idx, r),
    years,
    skill: Math.round(skill * 100) / 100,
    stress: 0,
    avatarSeed: r.int(1, 0x7fffffff),
  };
}

/** Which region roster units exist for this shift (DESIGN §4.8 + difficulty scaling). */
export function rosterSpecsFor(region: RegionDef, shift: 'day' | 'night', difficulty: Difficulty): UnitSpec[] {
  return region.roster.filter((spec) => {
    const sh = spec.shift ?? 'both';
    if (sh !== 'both' && sh !== shift) return false;
    if (spec.minDifficulty && DIFF_RANK[difficulty] < DIFF_RANK[spec.minDifficulty]) return false;
    return true;
  });
}

const PATROL_TYPES: UnitType[] = ['patrol', 'aux', 'traffic', 'k9', 'rapid', 'border', 'community'];

function placeUnitStart(s: SimState, r: Rng, u: Unit): void {
  const home = unitHome(s, u);
  u.pos = home;
  if (u.onCall || !PATROL_TYPES.includes(u.type) || u.type === 'community') return;
  // On patrol around the station at shift start.
  const wp = patrolWaypoint(s, r, u);
  if (wp) {
    u.pos = lerp(home, wp, r.range(0.15, 0.85));
    if (r.chance(0.6)) {
      const wp2 = patrolWaypoint(s, r, u);
      if (wp2) moveUnit(s, u, wp2, 'patrol', false, { profile: 'patrol' });
    }
  }
}

/** Build all units for a new shift. */
export function buildUnits(s: SimState, r: Rng, opts: NewShiftOptions): void {
  const region = regionOf(s);
  const shift = (s.flags.shiftKind as 'day' | 'night') ?? 'day';
  const used = new Set<string>();
  const specs: (RosterUnit & { crewNames?: UnitSpec['crewNames']; crewN?: number })[] = [];
  if (opts.roster && opts.roster.length) {
    for (const ru of opts.roster) specs.push({ ...ru });
    // Career: special assets come from upgrades.
    const haveType = (t: UnitType) => specs.some((x) => x.type === t);
    if (hasUpgrade(s, 'kkomando') && !haveType('special')) {
      const src = region.roster.filter((x) => x.type === 'special');
      if (src.length) for (const x of src) specs.push({ ...x, crew: [], crewN: x.crew, onCall: true });
      else specs.push({ callsign: 'K-KOMANDO', type: 'special', stationId: hqStation(region)?.id ?? '', vehicle: 'Mercedes-Benz Sprinter', crew: [], crewN: 6, onCall: true });
    }
    if (hasUpgrade(s, 'k9kennel') && !haveType('k9')) {
      for (const x of region.roster.filter((y) => y.type === 'k9').slice(0, 2)) specs.push({ ...x, crew: [], crewN: x.crew });
    }
    if (hasUpgrade(s, 'heli_hours') && !haveType('heli')) {
      const src = region.roster.filter((x) => x.type === 'heli');
      if (src.length) for (const x of src) specs.push({ ...x, crew: [], crewN: x.crew, onCall: true });
      else {
        const base = region.stations.find((x) => x.kind === 'airbase') ?? hqStation(region);
        specs.push({ callsign: 'KOPTER 1', type: 'heli', stationId: base?.id ?? '', vehicle: 'AgustaWestland AW139', crew: [], crewN: 3, onCall: true });
      }
    }
  } else {
    for (const sp of rosterSpecsFor(region, shift, opts.difficulty)) {
      specs.push({ callsign: sp.callsign, type: sp.type, stationId: sp.stationId, vehicle: sp.vehicle, crew: [], crewN: sp.crew, onCall: sp.onCall, zone: sp.zone, crewNames: sp.crewNames });
    }
  }
  specs.forEach((sp, i) => {
    const id = `u${i + 1}`;
    const station = stationById(region, sp.stationId);
    let crew = sp.crew;
    if (!crew.length) {
      const n = Math.max(1, sp.crewN ?? 2);
      crew = [];
      for (let k = 0; k < n; k++) crew.push(generateOfficer(r, region, sp.type, k, `${id}-o${k + 1}`, used, sp.crewNames?.[k]));
    } else for (const o of crew) used.add(o.badge);
    const u: Unit = {
      id,
      callsign: sp.callsign,
      type: sp.type,
      stationId: sp.stationId,
      zone: sp.zone ?? station?.zone ?? 'mainland',
      vehicle: sp.vehicle,
      crew,
      status: 'available',
      statusSince: s.now,
      pos: station?.coord ?? region.center,
      heading: r.range(0, 360),
      fatigue: Math.round(r.range(0, 0.08) * 100) / 100,
      breaks: 0,
      handled: 0,
      ...(sp.onCall ? { onCall: true } : {}),
    };
    s.units[id] = u;
    s.unitOrder.push(id);
  });
  for (const id of s.unitOrder) placeUnitStart(s, r, s.units[id]);
}

function hqStation(region: RegionDef): Station | undefined {
  return region.stations.find((x) => x.kind === 'hq') ?? region.stations[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Patrol wandering
// ─────────────────────────────────────────────────────────────────────────────

const waypointCache = new WeakMap<RegionDef, Map<string, LngLat[]>>();

/** Candidate on-land points near a station: street vertices, places, towns. */
function waypointsNear(region: RegionDef, stationId: string, home: LngLat, zone: string): LngLat[] {
  let m = waypointCache.get(region);
  if (!m) {
    m = new Map();
    waypointCache.set(region, m);
  }
  const key = `${stationId}|${zone}`;
  let pts = m.get(key);
  if (!pts) {
    pts = [];
    const inZone = (z?: string) => (z ?? 'mainland') === zone;
    for (const st of region.streets) {
      if (!inZone(st.zone)) continue;
      for (const p of st.points) {
        const d = haversineKm(p, home);
        if (d >= 0.6 && d <= 7) pts.push(p);
      }
    }
    for (const pl of region.places) {
      if (!inZone(pl.zone)) continue;
      const d = haversineKm(pl.coord, home);
      if (d >= 0.6 && d <= 8) pts.push(pl.coord);
    }
    for (const t of region.towns) {
      if (!inZone(t.zone)) continue;
      const d = haversineKm(t.coord, home);
      if (d >= 1 && d <= 14) pts.push(t.coord);
    }
    m.set(key, pts);
  }
  return pts;
}

export function patrolWaypoint(s: SimState, r: Rng, u: Unit): LngLat | undefined {
  const region = regionOf(s);
  const home = unitHome(s, u);
  const pts = waypointsNear(region, u.stationId, home, u.zone);
  if (pts.length) return destination(r.pick(pts), r.range(0, 0.15), r.range(0, 360));
  return destination(home, r.range(1, 4), r.range(0, 360));
}

/** Release a unit from its incident: available again, heads back towards its patrol area. */
export function releaseUnit(s: SimState, u: Unit, say: boolean, inc?: { id: string } | undefined): void {
  // The event the unit is leaving (also after paperwork, when only u.incidentId still names it):
  // the 'available' phrases may mention its number.
  const from = s.incidents[inc?.id ?? u.incidentId ?? ''];
  delete u.incidentId;
  delete u.busyUntil;
  setStatus(s, u, 'available');
  if (say) unitPhrase(s, u, 'available', from);
  emit(s, { type: 'unit_available', unitId: u.id });
  returnToPatrol(s, u);
}

export function returnToPatrol(s: SimState, u: Unit): void {
  if (u.onCall || !PATROL_TYPES.includes(u.type) || u.type === 'community') {
    const home = unitHome(s, u);
    if (haversineKm(unitPosAt(u, s.now).pos, home) > 0.3) moveUnit(s, u, home, 'return', false, { zone: unitStation(s, u)?.zone });
    else stopUnit(s, u);
    return;
  }
  const wp = withRng(s, (r) => patrolWaypoint(s, r, u));
  if (wp) moveUnit(s, u, wp, 'patrol', false, { profile: 'patrol' });
  else stopUnit(s, u);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-substep update
// ─────────────────────────────────────────────────────────────────────────────

const WANDER_MEAN_MIN = 27;

export function updateUnits(s: SimState, dtMs: number): void {
  const dtH = dtMs / HOUR;
  const dtMin = dtMs / MIN;
  const psych = hasUpgrade(s, 'psychologist') ? 0.7 : 1;
  let onBreak = 0;
  for (const id of s.unitOrder) if (s.units[id].status === 'break') onBreak++;
  for (const id of s.unitOrder) {
    const u = s.units[id];
    if (!u) continue;
    // Movement
    if (u.move) {
      if (s.now >= u.move.arriveAt) {
        const m = u.move;
        settleKm(s, u, s.now);
        u.pos = m.path[m.path.length - 1];
        if (m.path.length > 1) u.heading = bearing(m.path[m.path.length - 2], m.path[m.path.length - 1]);
        delete u.move;
        onArrive(s, u, m);
      } else {
        const p = unitPosAt(u, s.now);
        u.pos = p.pos;
        u.heading = p.heading;
      }
    }
    // Timers
    if ((u.status === 'busy' || u.status === 'break') && u.busyUntil !== undefined && s.now >= u.busyUntil) {
      if (u.status === 'break') {
        u.fatigue = Math.round(u.fatigue * 0.4 * 1000) / 1000;
        u.breaks++;
        onBreak--;
        delete u.busyUntil;
        setStatus(s, u, 'available');
        unitPhrase(s, u, 'breakEnd');
        emit(s, { type: 'unit_available', unitId: u.id });
        returnToPatrol(s, u);
      } else {
        releaseUnit(s, u, true);
      }
    }
    // Fatigue & stress
    if (u.status !== 'offduty' && u.status !== 'break') {
      let mult = 1;
      if ((u.status === 'onscene' || u.status === 'enroute') && u.incidentId) {
        const inc = s.incidents[u.incidentId];
        if (inc && inc.truePriority === 1) mult = 1.5;
      }
      u.fatigue = Math.min(1, u.fatigue + 0.06 * dtH * mult * psych);
    }
    // Idle behaviour
    if (u.status === 'available' && !u.move && !u.incidentId) {
      if (s.flags[`hold:${u.id}`]) continue;
      if (u.fatigue > 0.6 && !s.flags[`ab:${u.id}`] && onBreak < Math.max(1, Math.floor(s.unitOrder.length / 5))) {
        if (withRng(s, (r) => r.chance(dtMin / 25))) {
          s.flags[`ab:${u.id}`] = true;
          startBreak(s, u, true);
          onBreak++;
          continue;
        }
      }
      if (!u.onCall && PATROL_TYPES.includes(u.type) && u.type !== 'community') {
        if (withRng(s, (r) => r.chance(dtMin / WANDER_MEAN_MIN))) {
          const wp = withRng(s, (r) => patrolWaypoint(s, r, u));
          if (wp) moveUnit(s, u, wp, 'patrol', false, { profile: 'patrol' });
        }
      }
    }
  }
}

function onArrive(s: SimState, u: Unit, m: Movement): void {
  const region = regionOf(s);
  switch (m.purpose) {
    case 'incident': {
      const inc = u.incidentId ? s.incidents[u.incidentId] : undefined;
      if (inc) u.zone = inc.location.zone;
      if (inc && inc.state !== 'closed' && inc.assigned.includes(u.id)) {
        setStatus(s, u, 'onscene');
        onUnitArrived(s, inc, u);
      } else {
        releaseUnit(s, u, false);
      }
      break;
    }
    case 'transport': {
      u.zone = zoneAt(region, u.pos);
      const pw = Number(s.flags[`pw:${u.id}`]) || withRng(s, (r) => r.int(10, 30));
      delete s.flags[`pw:${u.id}`];
      setStatus(s, u, 'busy');
      u.busyUntil = s.now + pw * MIN;
      const place = String(s.flags[`tdest:${u.id}`] ?? '');
      delete s.flags[`tdest:${u.id}`];
      const inc = u.incidentId ? s.incidents[u.incidentId] : undefined;
      unitSay(s, u, phrase(s, 'transportArrive', radioVars(s, u, inc, { place, n: String(pw) })), inc);
      break;
    }
    case 'patrol':
    case 'return':
      u.zone = zoneAt(region, u.pos);
      break;
    case 'pursuit': {
      // Live pursuits re-target their units every game-minute. If the pursuit is over (or the
      // event is gone) nothing will move this unit again, so settle it like an incident arrival.
      const inc = u.incidentId ? s.incidents[u.incidentId] : undefined;
      if (inc && inc.state !== 'closed' && inc.pursuit && !inc.pursuit.ended) break;
      if (inc && inc.state !== 'closed' && inc.assigned.includes(u.id) && u.type !== 'heli') {
        u.zone = inc.location.zone;
        setStatus(s, u, 'onscene');
        onUnitArrived(s, inc, u);
      } else {
        if (inc && inc.state !== 'closed') inc.assigned = inc.assigned.filter((id) => id !== u.id);
        releaseUnit(s, u, false);
      }
      break;
    }
    default:
      break;
  }
}

export function startBreak(s: SimState, u: Unit, auto: boolean): boolean {
  if (u.status !== 'available' || u.incidentId) return false;
  stopUnit(s, u);
  setStatus(s, u, 'break');
  u.busyUntil = s.now + BREAK_MIN * MIN;
  unitPhrase(s, u, auto ? 'breakAuto' : 'breakStart');
  return true;
}

export function endBreak(s: SimState, u: Unit): void {
  if (u.status !== 'break') return;
  const since = u.statusSince ?? s.now;
  const frac = Math.min(1, (s.now - since) / (BREAK_MIN * MIN));
  u.fatigue = Math.round(u.fatigue * (1 - 0.6 * frac) * 1000) / 1000;
  if (frac > 0.5) u.breaks++;
  delete u.busyUntil;
  setStatus(s, u, 'available');
  emit(s, { type: 'unit_available', unitId: u.id });
}

/** Mean crew skill (injured officers excluded). */
export function crewSkill(u: Unit): number {
  const c = u.crew.filter((o) => !o.injured);
  if (!c.length) return 0.5;
  return c.reduce((a, o) => a + o.skill, 0) / c.length;
}
