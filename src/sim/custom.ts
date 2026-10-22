/**
 * Custom game (kohandatud mäng, 2.26.0): the player drafts the force for the shift, like a fantasy league. They pick
 * the crews (unit type and station) and the officers who staff them from the prefecture's draft pool, within a budget
 * if they want one.
 *
 * The setup is compact (a room carries it to every player and to the game server): per crew the type, the station and
 * the indices of the drafted officers in `draftPool(regionId)`. `expandCustom` turns it into the shift's roster the
 * same way on every machine. The pool is drawn from a stream of its own per prefecture, so it is the same for everyone.
 */
import { REGIONS } from '@/data/regions';
import { Rng, hashString } from './rng';
import { normalizeArea, sectorStationIds } from './sectors';
import { areaRosterSpecs, generateOfficer, rosterSpecsFor, stationById, stationCallsign } from './units';
import type { Difficulty, Officer, RegionDef, RegionId, RosterUnit, Station, UnitType } from './types';

/** One crew: unit type, station id, then the drafted officers (indices into draftPool; none: the sim staffs it). */
export type CustomCrew = [UnitType, string, ...number[]];

export interface CustomSetup {
  crews: CustomCrew[];
  /** The budget is on (the editor keeps the force within budgetOf). */
  budget?: boolean;
}

/** An officer in the draft pool. */
export interface DraftOfficer extends Officer {
  /** The pool index (what a setup stores). */
  index: number;
  /** What they are trained for: in a crew of another kind they work below their skill (fitFactor). */
  specialty: UnitType;
  /** Budget points. */
  cost: number;
}

export const POOL_SIZE = 60;
export const MAX_CREWS = 40;

/** Unit types a custom game offers, in the editor's order. */
export const CUSTOM_TYPES: UnitType[] = [
  'patrol',
  'rapid',
  'traffic',
  'k9',
  'criminal',
  'community',
  'aux',
  'transport',
  'border',
  'boat',
  'special',
  'heli',
];

/** Officers a crew of the type takes (the default when it is staffed automatically, and the most one may draft). */
export const CREW_SIZE: Record<UnitType, { auto: number; max: number }> = {
  patrol: { auto: 2, max: 3 },
  rapid: { auto: 2, max: 3 },
  traffic: { auto: 2, max: 3 },
  k9: { auto: 1, max: 2 },
  criminal: { auto: 2, max: 3 },
  community: { auto: 1, max: 2 },
  aux: { auto: 2, max: 3 },
  transport: { auto: 2, max: 3 },
  border: { auto: 2, max: 3 },
  boat: { auto: 2, max: 3 },
  special: { auto: 6, max: 6 },
  heli: { auto: 4, max: 4 },
};

/** Budget points of the vehicle and kit per unit type. */
export const TYPE_COST: Record<UnitType, number> = {
  patrol: 4,
  rapid: 6,
  traffic: 5,
  k9: 8,
  criminal: 5,
  community: 3,
  aux: 3,
  transport: 4,
  border: 5,
  boat: 10,
  special: 16,
  heli: 30,
};

/** Budget points of an officer the sim staffs automatically (an average one). */
export const AUTO_OFFICER_COST = 10;

/** Specialist crews: someone not trained for it works at 80 %. */
const SPECIALIST = new Set<UnitType>(['k9', 'criminal', 'special', 'heli', 'boat', 'traffic']);

/** How well an officer of `specialty` works in a crew of `type` (multiplies their skill). */
export function fitFactor(specialty: UnitType, type: UnitType): number {
  if (specialty === type) return 1;
  return SPECIALIST.has(type) ? 0.8 : 0.95;
}

export const officerCost = (skill: number): number => Math.round(3 + skill * 14);

const VEHICLE: Record<UnitType, string> = {
  patrol: 'Škoda Octavia',
  rapid: 'Volkswagen Passat',
  traffic: 'BMW 530d',
  k9: 'Volkswagen Transporter (K9)',
  criminal: 'Toyota Corolla (märgistamata)',
  community: 'Škoda Octavia',
  aux: 'Škoda Octavia',
  transport: 'Volkswagen Transporter',
  border: 'Toyota Hilux',
  boat: 'Patrullkaater',
  special: 'Mercedes-Benz Sprinter (eriüksus)',
  heli: 'AgustaWestland AW139',
};

/** The specialties drawn into a prefecture's pool, in order (generalists first). */
function poolPlan(region: RegionDef): UnitType[] {
  const kinds = new Set(region.stations.map((st) => st.kind));
  const plan: [UnitType, number][] = [
    ['patrol', 24],
    ['rapid', 5],
    ['traffic', 4],
    ['k9', 3],
    ['criminal', 4],
    ['community', 3],
    ['aux', 3],
    ['transport', 2],
    ['border', kinds.has('border') ? 3 : 0],
    ['boat', kinds.has('harbour') ? 2 : 0],
    ['special', 4],
    ['heli', 3],
  ];
  const out: UnitType[] = [];
  for (const [t, n] of plan) for (let i = 0; i < n; i++) out.push(t);
  while (out.length < POOL_SIZE) out.push('patrol');
  return out.slice(0, POOL_SIZE);
}

const pools = new Map<RegionId, DraftOfficer[]>();

/** The prefecture's draft pool: the same officers for every player and every machine. */
export function draftPool(regionId: RegionId): DraftOfficer[] {
  const hit = pools.get(regionId);
  if (hit) return hit;
  const region = REGIONS[regionId];
  if (!region) return [];
  const r = new Rng(hashString(`epd-draft:${regionId}`) || 1);
  const used = new Set<string>();
  const out = poolPlan(region).map((specialty, index) => {
    // Every third one leads a crew (more years, a higher rank).
    const o = generateOfficer(r, region, specialty, index % 3 === 0 ? 0 : 1, `dp-${regionId}-${index}`, used);
    return { ...o, index, specialty, cost: officerCost(o.skill) };
  });
  pools.set(regionId, out);
  return out;
}

/** Stations of the area a crew of the type may be based at (the area: the sectors, or the whole prefecture). */
export function stationsFor(
  regionId: RegionId,
  sectors: readonly string[] | undefined,
  type: UnitType,
): Station[] {
  const region = REGIONS[regionId];
  if (!region) return [];
  const area = normalizeArea(regionId, sectors);
  const inArea = area.length ? new Set(sectorStationIds(area)) : null;
  const all = region.stations;
  const local = all.filter((st) => !inArea || inArea.has(st.id));
  const base = (st: Station) => st.kind === 'hq' || st.kind === 'station' || st.kind === 'post';
  switch (type) {
    // On call for the whole prefecture: their own base wherever the shift is.
    case 'heli': {
      const air = all.filter((st) => st.kind === 'airbase');
      return air.length ? air : all.filter((st) => st.kind === 'hq');
    }
    case 'special':
      return all.filter((st) => st.kind === 'hq');
    case 'boat':
      return local.filter((st) => st.kind === 'harbour');
    case 'border':
      return local.filter((st) => st.kind === 'border' || base(st));
    default:
      return local.filter(base);
  }
}

/** Unit types the area can field (a boat needs a harbour in it, and so on). */
export function typesFor(regionId: RegionId, sectors: readonly string[] | undefined): UnitType[] {
  return CUSTOM_TYPES.filter((t) => stationsFor(regionId, sectors, t).length > 0);
}

/** The prefecture's usual force for the area as a setup (the editor's "standard roster" preset). */
export function defaultSetup(
  regionId: RegionId,
  sectors: readonly string[] | undefined,
  shift: 'day' | 'night' = 'day',
  difficulty: Difficulty = 'normal',
): CustomSetup {
  const region = REGIONS[regionId];
  if (!region) return { crews: [] };
  const area = normalizeArea(regionId, sectors);
  const all = rosterSpecsFor(region, shift, difficulty);
  const specs = area.length ? areaRosterSpecs(region, all, area, shift) : all;
  const crews: CustomCrew[] = [];
  for (const sp of specs) {
    if (!CUSTOM_TYPES.includes(sp.type)) continue;
    const ok = stationsFor(regionId, area, sp.type);
    const st = ok.find((x) => x.id === sp.stationId) ?? ok[0];
    if (st) crews.push([sp.type, st.id]);
  }
  return { crews: crews.slice(0, MAX_CREWS), budget: true };
}

/** Budget points of a setup. */
export function costOf(regionId: RegionId, setup: CustomSetup): number {
  const pool = draftPool(regionId);
  let sum = 0;
  for (const [type, , ...picks] of setup.crews) {
    sum += TYPE_COST[type] ?? 0;
    if (picks.length) for (const i of picks) sum += pool[i]?.cost ?? AUTO_OFFICER_COST;
    else sum += CREW_SIZE[type].auto * AUTO_OFFICER_COST;
  }
  return sum;
}

/** The budget for an area: what its usual force costs. */
export function budgetOf(
  regionId: RegionId,
  sectors: readonly string[] | undefined,
  shift: 'day' | 'night' = 'day',
): number {
  return costOf(regionId, defaultSetup(regionId, sectors, shift));
}

/**
 * A setup from anywhere (a room, storage, a request) made safe: known types, stations of the prefecture that suit
 * the type, pool officers drafted once each, at most CREW_SIZE.max per crew and MAX_CREWS crews. Null when it is not
 * a setup at all.
 */
export function parseCustom(v: unknown, regionId: RegionId): CustomSetup | null {
  if (!v || typeof v !== 'object') return null;
  const raw = (v as { crews?: unknown }).crews;
  if (!Array.isArray(raw)) return null;
  const region = REGIONS[regionId];
  if (!region) return null;
  const taken = new Set<number>();
  const crews: CustomCrew[] = [];
  for (const c of raw) {
    if (crews.length >= MAX_CREWS) break;
    if (!Array.isArray(c) || c.length < 2) continue;
    const [type, station, ...rest] = c as unknown[];
    if (typeof type !== 'string' || !CUSTOM_TYPES.includes(type as UnitType)) continue;
    if (
      typeof station !== 'string' ||
      !stationsFor(regionId, undefined, type as UnitType).some((st) => st.id === station)
    )
      continue;
    const picks: number[] = [];
    for (const x of rest) {
      if (picks.length >= CREW_SIZE[type as UnitType].max) break;
      if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x >= POOL_SIZE || taken.has(x)) continue;
      taken.add(x);
      picks.push(x);
    }
    crews.push([type as UnitType, station, ...picks]);
  }
  const budget = (v as { budget?: unknown }).budget === true;
  return { crews, ...(budget ? { budget } : {}) };
}

const FALLBACK: Partial<Record<UnitType, string>> = {
  rapid: 'K-',
  k9: 'KOER ',
  traffic: 'LIIKLUS ',
  criminal: 'KRIMI ',
  special: 'KOBRA ',
  heli: 'KOPTER ',
  border: 'PIIR ',
  aux: 'ABI ',
  community: 'PIIRKOND ',
  transport: 'KONVOI ',
  boat: 'KAATER ',
};

const PREFIX: Record<RegionId, string> = { pohja: 'PÕHJA', ida: 'IDA', louna: 'LÕUNA', laane: 'LÄÄNE' };

/** The shift's roster from a setup: callsigns of the stations' own scheme, drafted officers at their fit. */
export function expandCustom(regionId: RegionId, setup: CustomSetup, shift: 'day' | 'night'): RosterUnit[] {
  const region = REGIONS[regionId];
  const clean = parseCustom(setup, regionId);
  if (!region || !clean) return [];
  const pool = draftPool(regionId);
  const used = new Set<string>();
  const counters: Partial<Record<UnitType, number>> = {};
  const out: RosterUnit[] = [];
  for (const [type, stationId, ...picks] of clean.crews) {
    let callsign = stationCallsign(region, type, stationId, shift, used);
    if (!callsign) {
      for (let k = 0; k < 500 && (!callsign || used.has(callsign)); k++) {
        const n = (counters[type] = (counters[type] ?? 0) + 1);
        callsign = type === 'patrol' ? `${PREFIX[regionId]} ${90 + n}` : `${FALLBACK[type] ?? ''}${n}`;
      }
    }
    used.add(callsign!);
    const station = stationById(region, stationId);
    const proto =
      region.roster.find((x) => x.type === type && x.stationId === stationId) ??
      region.roster.find((x) => x.type === type);
    const crew: Officer[] = picks.map((i) => {
      const d = pool[i];
      const { index: _i, specialty, cost: _c, ...o } = d;
      void _i;
      void _c;
      return { ...o, skill: Math.round(o.skill * fitFactor(specialty, type) * 100) / 100 };
    });
    out.push({
      callsign: callsign!,
      type,
      stationId,
      vehicle: proto?.vehicle ?? VEHICLE[type],
      crew,
      ...(crew.length ? {} : { crewN: CREW_SIZE[type].auto }),
      ...(type === 'heli' || type === 'special' ? { onCall: true } : {}),
      ...(station?.zone ? { zone: station.zone } : {}),
    });
  }
  return out;
}

/** The setup moved to another area: crews keep their station if it is in the area, else go to the first that suits. */
export function adaptSetup(
  regionId: RegionId,
  sectors: readonly string[] | undefined,
  setup: CustomSetup,
): CustomSetup {
  const crews: CustomCrew[] = [];
  for (const [type, station, ...picks] of setup.crews) {
    const ok = stationsFor(regionId, sectors, type);
    const st = ok.find((x) => x.id === station) ?? ok[0];
    if (st) crews.push([type, st.id, ...picks]);
  }
  return { ...setup, crews };
}

/** Response crews (the ones that answer general calls) in a setup, and in the area's usual force. */
export function responseCount(setup: CustomSetup): number {
  return setup.crews.filter(([t]) => RESPONSE.has(t)).length;
}
const RESPONSE = new Set<UnitType>(['patrol', 'rapid', 'aux', 'traffic', 'k9', 'border', 'community']);
