/**
 * Thin, crash-proof bridge between the tool panels and the simulation API.
 * The engine modules land concurrently and their stubs throw, so every call is guarded
 * and falls back to a local implementation where that makes sense.
 */
import { REGIONS } from '@/data/regions';
import { TEMPLATE_BY_ID } from '@/data/incidents';
import { personFlags, searchPersons, searchVehicles, vehicleFlags } from '@/sim/registry';
import { getRegion, pendingRadio, recommendUnits } from '@/sim/selectors';
import { describePerson } from '@/gen/describe';
import type { IncidentTemplate, Person, RadioMsg, RegionDef, SimState, Text, Vehicle } from '@/sim/types';
import { useGame } from '@/store/game';
import { coopIssue } from '@/store/coop';
import {
  ageAt,
  fallbackPersonFlags,
  fallbackVehicleFlags,
  localPendingRadio,
  localSearchPersons,
  localSearchVehicles,
  safe,
  sortFlags,
  type FlagLike,
} from './helpers';

export const TEMPLATES_BY_ID: Record<string, IncidentTemplate | undefined> = TEMPLATE_BY_ID;

/** Subscribe to the sim tick and return the live sim (or null). */
export function useSim(): SimState | null {
  useGame((g) => g.tick);
  return useGame((g) => g.sim);
}

/** Run a command against the live sim; always bumps so the UI refreshes. Returns undefined if it threw. */
export function run<T>(fn: (s: SimState) => T): T | undefined {
  const g = useGame.getState();
  const s = g.sim;
  if (!s) return undefined;
  try {
    return fn(s);
  } catch (err) {
    console.warn('[EPD tools] command failed', err);
    return undefined;
  } finally {
    useGame.getState().bump();
  }
}

export function pending(s: SimState): RadioMsg[] {
  return safe(() => pendingRadio(s), null as RadioMsg[] | null) ?? localPendingRadio(s);
}

export function regionOf(s: SimState): RegionDef {
  return safe(() => getRegion(s), null as RegionDef | null) ?? REGIONS[s.regionId];
}

export function pFlags(p: Person, now: number): FlagLike[] {
  const f = safe(() => personFlags(p, now), null as FlagLike[] | null) ?? fallbackPersonFlags(p, now);
  return sortFlags(f);
}

export function vFlags(v: Vehicle, s: SimState): FlagLike[] {
  const owner = v.ownerId ? s.persons[v.ownerId] : undefined;
  const f = safe(() => vehicleFlags(v, s.now, owner), null as FlagLike[] | null) ?? fallbackVehicleFlags(v, s.now, owner);
  return sortFlags(f);
}

const APPEAR: Record<string, Text> = {
  slim: { et: 'sale kehaehitus', en: 'slim build' },
  average: { et: 'keskmine kehaehitus', en: 'average build' },
  athletic: { et: 'sportlik kehaehitus', en: 'athletic build' },
  heavy: { et: 'tüse kehaehitus', en: 'heavy build' },
};

export function describe(p: Person, now: number): Text {
  const d = safe(() => describePerson(p, now), null as Text | null);
  if (d) return d;
  const a = p.appearance;
  const age = ageAt(p.birthDate, now);
  const b = APPEAR[a.build] ?? { et: '', en: '' };
  return {
    et: `${p.gender === 'M' ? 'mees' : 'naine'}, ${age}-aastane, ~${a.heightCm} cm, ${b.et}`,
    en: `${p.gender === 'M' ? 'male' : 'female'}, ${age}, ~${a.heightCm} cm, ${b.en}`,
  };
}

function wasLogged(s: SimState, len: number, last: unknown): boolean {
  return s.queries.length !== len || s.queries[s.queries.length - 1] !== last;
}

function logQuery(s: SimState, kind: 'person' | 'vehicle', query: string, resultIds: string[]) {
  s.queries.push({ t: s.now, kind, query, resultIds });
  s.stats.queries = (s.stats.queries ?? 0) + 1;
}

/** Person search via the registry; logs a QueryLog itself if the engine did not. Co-op logs it through the room. */
export function searchP(s: SimState, q: string): Person[] {
  if (s.coop) {
    const res = safe(() => searchPersons(s, q, { log: false }), null as Person[] | null) ?? localSearchPersons(s.persons, q);
    if (q.trim()) coopIssue('q', ['person', q.trim().slice(0, 64)]);
    return res;
  }
  const len = s.queries.length;
  const last = s.queries[len - 1];
  const res = safe(() => searchPersons(s, q), null as Person[] | null) ?? localSearchPersons(s.persons, q);
  if (!wasLogged(s, len, last)) logQuery(s, 'person', q, res.map((p) => p.id));
  return res;
}

export function searchV(s: SimState, q: string): Vehicle[] {
  if (s.coop) {
    const res = safe(() => searchVehicles(s, q, { log: false }), null as Vehicle[] | null) ?? localSearchVehicles(s.vehicles, q);
    if (q.trim()) coopIssue('q', ['vehicle', q.trim().slice(0, 64)]);
    return res;
  }
  const len = s.queries.length;
  const last = s.queries[len - 1];
  const res = safe(() => searchVehicles(s, q), null as Vehicle[] | null) ?? localSearchVehicles(s.vehicles, q);
  if (!wasLogged(s, len, last)) logQuery(s, 'vehicle', q, res.map((v) => v.plate));
  return res;
}

/** Up to n unit ids that can respond to the incident (best fit first). */
export function bestUnits(s: SimState, incidentId: string, n: number): string[] {
  const recs = safe(() => recommendUnits(s, incidentId), []);
  return recs
    .filter((r) => r.fit === 'ideal' || r.fit === 'need' || r.fit === 'weak')
    .slice(0, n)
    .map((r) => r.unit.id);
}
