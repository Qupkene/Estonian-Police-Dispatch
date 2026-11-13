/**
 * Who and what a camera shows for an incident (docs/CCTV.md): the kind of scene (a fight, a crash, a car stopped
 * at the kerb, a house the crew goes into), the people of the incident dressed for the weather, and its vehicles
 * in their registry colours. Read once from the incident and its template; the director (director.ts) moves them.
 *
 * A camera stands outdoors: what happens inside a building is shown as its door.
 */
import type { Incident, IncidentTemplate, PersonRole, PlaceKind, SimState } from '@/sim/types';
import { lookOfPerson, lookOfStranger, type DressFor, type Look } from './figure';
import { hash32, rand } from './math';
import { lookOfAnyCar, lookOfVehicle, type CarLook } from './vehicle';

export type SceneKind =
  /** People fighting. */
  | 'brawl'
  /** Somebody with a weapon. */
  | 'threat'
  /** Drunk, loud or unwelcome people. */
  | 'disorder'
  /** Somebody on the ground. */
  | 'lying'
  /** Vehicles that have collided. */
  | 'crash'
  /** A vehicle at the kerb with its driver. */
  | 'stop'
  /** A thief or a vandal at work. */
  | 'theft'
  /** It happens indoors: the camera sees the door. */
  | 'indoor'
  /** A crowd. */
  | 'crowd'
  /** Smoke and flames. */
  | 'fire'
  /** Nothing to see until the crew comes. */
  | 'empty';

export interface CastPerson {
  id: string;
  role: PersonRole | 'extra';
  look: Look;
  seed: number;
}

export interface CastCar {
  id: string;
  role: 'suspect' | 'victim' | 'involved';
  look: CarLook;
}

export interface Cast {
  kind: SceneKind;
  seed: number;
  /** Everyone of the incident a camera could see (suspects, victims, the caller, witnesses). */
  people: CastPerson[];
  cars: CastCar[];
  dress: DressFor;
  armed: boolean;
  drunk: boolean;
  /** Somebody is on the ground from the start. */
  down: boolean;
  /** The suspects are at it when the crew arrives (else they left before the call). */
  live: boolean;
  /** Somebody runs when the police come in sight. */
  runs: boolean;
  /** The suspect's vehicle may drive off (a pursuit). */
  mayFlee: boolean;
  /** How grave it is: 1 the worst. */
  priority: number;
}

/** Places where the trouble itself is under a roof. */
const INDOOR_PLACES: ReadonlySet<PlaceKind> = new Set<PlaceKind>([
  'residential',
  'house',
  'summerhouse',
  'hotel',
  'office',
  'hospital',
  'bank',
  'museum',
  'church',
  'government',
  'embassy',
  'prison',
  'university',
  'kindergarten',
]);
/** Places where it may be either: outdoors for a fight or a theft from a car, indoors for the rest. */
const SHOP_PLACES: ReadonlySet<PlaceKind> = new Set<PlaceKind>(['shop', 'mall', 'bar', 'nightclub', 'school', 'industrial', 'construction', 'gasstation']);

const has = (tags: readonly string[], ...want: string[]) => want.some((t) => tags.includes(t));

/** The kind of scene an incident makes, from its template. */
export function sceneKindOf(inc: Pick<Incident, 'category' | 'tags' | 'templateId' | 'location' | 'falseAlarm' | 'truePriority' | 'vehicles' | 'persons'>): SceneKind {
  const tags = inc.tags;
  const id = inc.templateId;
  const place = inc.location.placeKind;
  const roles = new Set(inc.persons.map((p) => p.role));
  const indoorPlace = INDOOR_PLACES.has(place);
  if (inc.falseAlarm) return 'empty';
  if (has(tags, 'fire', 'arson') || /poleng|suttimine|burned_car/.test(id)) return 'fire';
  if (inc.category === 'traffic') {
    if (/lo_|avarii|kokkuporge|kraavis|onnetus|raudtee|sojavaekolonn|sundmuskohalt/.test(id) || has(tags, 'accident', 'collision')) return 'crash';
    if (inc.vehicles.length) return 'stop';
    return roles.has('victim') ? 'lying' : 'empty';
  }
  if (has(tags, 'crowd', 'riot') || /demonstration|pikett|fannide|tunglemine|football/.test(id)) return 'crowd';
  // On the ground: drunk in the snow, an overdose, somebody who fell.
  if (/lying|lumes|soiduteel|overdose|kukkunud|vigastat|drunk_on_road/.test(id) && !indoorPlace) return 'lying';
  if (inc.category === 'domestic') return 'indoor';
  if (has(tags, 'armed', 'weapon_knife', 'weapon_firearm', 'weapon_gun', 'firearm') && !indoorPlace) return 'threat';
  if (inc.category === 'violence') return indoorPlace ? 'indoor' : roles.has('suspect') ? 'brawl' : 'empty';
  if (inc.category === 'public_order') {
    if (indoorPlace || has(tags, 'noise', 'neighbours')) return 'indoor';
    if (has(tags, 'fight') || /brawl|kaklus|clash/.test(id)) return 'brawl';
    if (has(tags, 'vehicle') && inc.vehicles.length) return 'stop';
    return 'disorder';
  }
  if (inc.category === 'property' || inc.category === 'alarm') {
    if (has(tags, 'anpr', 'bolo') && inc.vehicles.length && inc.category === 'alarm') return 'stop';
    const outdoorsJob = /theft_from_car|bike|van_vandalism|graffiti|catalytic|kutusevargus|moped|street_robbery|taksojuht|garaazide|fuel_driveoff|copper|metalli/.test(id);
    if (/robbery|roov/.test(id) && !indoorPlace && !SHOP_PLACES.has(place)) return 'brawl';
    if (outdoorsJob && !indoorPlace) return /fuel_driveoff/.test(id) ? 'stop' : 'theft';
    if (inc.category === 'alarm' && !indoorPlace) return 'theft';
    return 'indoor';
  }
  if (inc.category === 'drugs') {
    if (has(tags, 'vehicle') && inc.vehicles.length) return 'stop';
    return indoorPlace || SHOP_PLACES.has(place) ? 'indoor' : 'disorder';
  }
  if (inc.category === 'fraud' || inc.category === 'missing') return indoorPlace || SHOP_PLACES.has(place) ? 'indoor' : 'empty';
  if (inc.category === 'assist') {
    if (has(tags, 'drunk', 'mental_health') && !indoorPlace) return 'disorder';
    return indoorPlace ? 'indoor' : 'empty';
  }
  if (inc.category === 'major') return has(tags, 'bomb', 'crisis') && SHOP_PLACES.has(place) ? 'crowd' : indoorPlace ? 'indoor' : 'empty';
  return indoorPlace ? 'indoor' : 'empty';
}

/** The cast of an incident's camera scene. */
export function castOf(sim: Pick<SimState, 'persons' | 'vehicles'>, inc: Incident, tpl: IncidentTemplate | undefined, dress: DressFor): Cast {
  const seed = hash32('cast', inc.id);
  const r = rand(seed);
  const kind = sceneKindOf(inc);
  const tags = inc.tags;
  const live =
    kind === 'brawl' ||
    kind === 'threat' ||
    kind === 'disorder' ||
    kind === 'crowd' ||
    kind === 'stop' ||
    kind === 'crash' ||
    kind === 'lying' ||
    (kind === 'theft' && (has(tags, 'in_progress', 'alarm') || r.chance(0.6)));
  const people: CastPerson[] = [];
  for (const ref of inc.persons) {
    const p = sim.persons[ref.personId];
    if (!p) continue;
    // Somebody missing or dead is not standing in the street.
    if (ref.role === 'missing' || ref.role === 'deceased') continue;
    people.push({ id: `p:${p.id}`, role: ref.role, look: lookOfPerson(p, dress), seed: hash32('p', p.id) });
  }
  if (kind === 'crowd') {
    const n = r.int(12, 20);
    for (let i = 0; i < n; i++) {
      const s = hash32('crowd', inc.id, i);
      people.push({ id: `x:${i}`, role: 'extra', look: lookOfStranger(s, dress), seed: s });
    }
  }
  const cars: CastCar[] = [];
  inc.vehicles.forEach((v, i) => {
    const veh = sim.vehicles[v.plate];
    cars.push({ id: `v:${v.plate}`, role: v.role, look: veh ? lookOfVehicle(veh) : lookOfAnyCar(hash32('v', inc.id, i)) });
  });
  // A crash needs two vehicles: a second one of nobody's when the story has one.
  if (kind === 'crash' && cars.length === 1 && !/kraavis|podraga|raudtee/.test(inc.templateId)) cars.push({ id: 'v:other', role: 'involved', look: lookOfAnyCar(hash32('other', inc.id)) });
  const armed = has(tags, 'armed', 'weapon_knife', 'weapon_firearm', 'weapon_gun', 'firearm');
  const drunk = has(tags, 'alcohol', 'drunk', 'dui', 'drunk_driving', 'drugs');
  const priority = inc.truePriority;
  return {
    kind,
    seed,
    people,
    cars,
    dress,
    armed,
    drunk,
    down: kind === 'lying' || (kind === 'brawl' && priority <= 2 && r.chance(0.45)) || (kind === 'crash' && priority === 1) || (kind === 'threat' && priority === 1 && r.chance(0.5)),
    live,
    runs: (kind === 'theft' && r.chance(0.7)) || (kind === 'brawl' && r.chance(0.3)) || (kind === 'disorder' && r.chance(0.12)) || (kind === 'threat' && r.chance(0.2)),
    mayFlee: has(tags, 'vehicle_flee') || !!tpl?.beats?.some((b) => b.kind === 'pursuit'),
    priority,
  };
}
