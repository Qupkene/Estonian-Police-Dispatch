/**
 * Who and what a camera shows for an incident (docs/CCTV.md): the kind of scene (a fight, a crash, a car stopped
 * at the kerb, a house the crew goes into), the people of the incident dressed for the weather, and its vehicles
 * in their registry colours. Read once from the incident and its template; the director (director.ts) moves them.
 *
 * A camera stands outdoors: what happens inside a building is shown as its door.
 */
import { withScenario } from '@/sim/scenario';
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
  /** A crash of one vehicle: off the road, into a ditch, against an animal. */
  single?: boolean;
  /** A crash with somebody still inside a wreck: they are not seen until the rescuers or the paramedics have them out. */
  trapped?: boolean;
  /**
   * A 'stop' whose vehicle is not here any more (it drove off without paying, did not stop, sped past): no
   * suspect vehicle and no driver are in the cast, and whoever reported it waits alone (STOP_STORY).
   */
  gone?: boolean;
  /** A 'stop' whose driver sits in the vehicle until the officers have them out (asleep at the wheel, watching a house). */
  driverIn?: boolean;
  /** Somebody lies in the carriageway itself. */
  inRoad?: boolean;
  /** A crowd that chants (a demonstration, fans). */
  chant?: boolean;
  /** A crowd that fights (a riot, a clash). */
  riot?: boolean;
  /** It is a vehicle that burns, not a building. */
  carFire?: boolean;
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

const ARMED = ['armed', 'weapon_knife', 'weapon_firearm', 'weapon_gun', 'firearm'];
/** Template ids that are collisions (the traffic category also holds drunk drivers and speeders). */
const CRASH_ID = /lo_|avarii|kokkuporge|kraavis|onnetus|raudtee|sojavaekolonn|sundmuskohalt|merre/;
/** Collisions of one vehicle (the other party, a train or an armoured column, is not a car a camera scene shows). */
const SINGLE_ID = /kraavis|podraga|raudtee|merre|nagi_onnetust|sojavaekolonn/;
/** Words of an incident's card that tell of one vehicle off the road, whatever the template usually tells. */
const SINGLE_TEXT = /kraavi|katusel|külili|teelt välja|tammilt|teepervele|\bmerre\b/i;
/** Words of the card that tell of somebody still inside a wreck. */
const TRAPPED_TEXT = /inimene sees|juht (on )?sees|kiilunud|ei saa välja|juhti pole näha|autos on vähemalt/i;

/**
 * What a 'stop' shows of its vehicle, read from the story the card tells:
 * - 'held': the vehicle stands here with its driver (in it or beside it, by seed).
 * - 'inside': it stands here and the driver sits in it until the officers have them out (asleep, watching).
 * - 'alone': it stands here and none of its people is shown (a child locked in it, the owner away).
 * - 'gone': it has driven off. No vehicle and no driver: whoever reported it waits here for the crew.
 * - 'away': it is elsewhere and so is whoever reported it (they follow it, or passed it on the road): nobody.
 */
export type StopStory = 'held' | 'inside' | 'alone' | 'gone' | 'away';

/**
 * Every template that can make a 'stop', with what its card says of the vehicle. One answer for the whole
 * template, or one for each of its summary variants in their order (the incident's own text says which it drew).
 * A scenario of a template (IncidentTemplate.scenarios) that tells another story has its own line, `<id>#<scenario>`.
 * tests/cctv-cast.test.ts keeps this table and the catalogue in step.
 */
export const STOP_STORY: Readonly<Record<string, StopStory | readonly StopStory[]>> = {
  // The vehicle is at the scene.
  violence_stalking_vehicle: 'inside',
  public_order_suspicious_parked_car: 'inside',
  drugs_car_smell: 'held',
  traffic_joobes_juht_tanklas: 'held',
  traffic_naaber_joobes_rooli: 'held',
  traffic_juht_magab_ristmikul: 'inside',
  traffic_laps_autos_palavus: 'alone',
  violence_ahistav_juht_jalitab_koju: 'held',
  traffic_luhamaa_joobes_veokijuht: 'held',
  traffic_ralli_kiiruskatsele_soitnud_pealtvaataja: 'held',
  // It has driven off: without paying, from a check, at speed, across a border.
  property_fuel_driveoff: 'gone',
  alarm_anpr_stolen_vehicle: 'gone',
  alarm_vehicle_tracker: 'gone',
  environment_offroad_reserve: 'gone',
  border_fuel_smuggling: 'gone',
  traffic_loata_rallivoistlus: 'gone',
  traffic_kihutaja: 'gone',
  traffic_mootorratturid_kihutavad: 'gone',
  traffic_mittepeatumine: 'gone',
  traffic_tanklast_lahkunud_joobes_juht: 'gone',
  border_tokkepuust_labi_soitnud_auto: 'gone',
  traffic_raadi_lennuvalja_driftijad: 'gone',
  'violence_threatening#road_rage_home': 'held',
  'traffic_joobes_juhi_kahtlus#asleep_at_lights': 'inside',
  // It left the drive-through, or drove on after breaking a mirror: the one it left behind reports it.
  'traffic_joobes_juhi_kahtlus#drive_through': 'gone',
  'traffic_joobes_juhi_kahtlus#clipped_mirror': ['away', 'gone'],
  // It is on the move and those who report it are in traffic themselves, or it is still aboard a ferry.
  traffic_joobes_juhi_kahtlus: 'away',
  traffic_joobes_juht_sadamas: 'away',
  traffic_vastassuunas_soitja: 'away',
  traffic_ikla_alkoreisi_joobes_juht: 'away',
  traffic_praamile_kihutav_juht: 'away',
  // The card's variants differ.
  alarm_anpr_wanted_owner: ['held', 'gone'],
  border_weapons_smuggling_port: ['gone', 'held'],
  border_cigarette_smuggling: ['gone', 'held'],
  border_migrant_smuggling: ['held', 'gone'],
  traffic_purjus_autojuht: ['gone', 'away', 'gone'],
  traffic_jaatee_rikkuja: ['held', 'gone', 'gone', 'gone'],
  traffic_juhtimisoiguseta_juht: ['gone', 'held'],
};

/** Which of a template's summary variants an incident's card is: its index, or -1 when the text is none of them. */
export function variantOf(inc: Pick<Incident, 'summary'>, tpl: Pick<IncidentTemplate, 'summary'> | undefined): number {
  if (!tpl) return -1;
  const text = inc.summary.et;
  return tpl.summary.findIndex((v) => {
    const pattern = v.et
      .split(/\{\w+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${pattern}$`, 's').test(text);
  });
}

/**
 * What a 'stop' incident shows of its vehicle. A template the table does not know, and a card whose text is none
 * of a mixed template's variants, show the least: nothing.
 */
export function stopStoryOf(inc: Pick<Incident, 'templateId' | 'scenarioId' | 'summary'>, tpl: IncidentTemplate | undefined): StopStory {
  const story = STOP_STORY[`${inc.templateId}#${inc.scenarioId ?? ''}`] ?? STOP_STORY[inc.templateId];
  if (!story) return 'away';
  if (typeof story === 'string') return story;
  return story[variantOf(inc, withScenario(tpl, inc.scenarioId))] ?? 'away';
}

/**
 * The kind of scene an incident makes, from its template. When in doubt it is the kind that shows less: a camera
 * must never show something the incident card does not say.
 */
export function sceneKindOf(inc: Pick<Incident, 'category' | 'tags' | 'templateId' | 'location' | 'falseAlarm' | 'truePriority' | 'vehicles' | 'persons'>): SceneKind {
  const tags = inc.tags;
  const id = inc.templateId;
  const place = inc.location.placeKind;
  const roles = new Set(inc.persons.map((p) => p.role));
  const indoorPlace = INDOOR_PLACES.has(place);
  const shopPlace = SHOP_PLACES.has(place);
  const quiet: SceneKind = indoorPlace ? 'indoor' : 'empty';
  if (inc.falseAlarm) return 'empty';
  // Somebody about to harm themselves, or out on the water: not staged.
  if (/enesetapu|suitsiid|silla_piirde|kaarsilla|jokke|kaater|lennukis/.test(id)) return quiet;
  // The side jobs of a forest fire (road blocks, evacuation) are streets without flames.
  if (/^crisis_forest/.test(id)) return quiet;
  if (has(tags, 'fire', 'arson') || /poleng|suttimine|burned_car/.test(id)) return 'fire';
  if (/bussionnetus|^crisis_bus_(scene|chain)/.test(id)) return 'crash';
  if (inc.category === 'traffic') {
    if (CRASH_ID.test(id) || has(tags, 'accident', 'collision')) {
      // Electric scooters are not cars: the riders are on the ground.
      if (/toukerat/.test(id)) return roles.has('victim') ? 'lying' : 'disorder';
      return 'crash';
    }
    if (inc.vehicles.length) return 'stop';
    return roles.has('victim') ? 'lying' : 'empty';
  }
  if (has(tags, 'crowd', 'riot') || /demonstration|pikett|fannide|tunglemine|football/.test(id)) return 'crowd';
  // On the ground: drunk in the snow, an overdose, somebody who fell.
  if (/lying|lumes|soiduteel|overdose|kukkunud|vigastat|drunk_on_road/.test(id) && !indoorPlace) return 'lying';
  if (inc.category === 'domestic') return 'indoor';
  const violent = inc.category === 'violence' || inc.category === 'major' || inc.category === 'public_order';
  // A weapon in the open. In a shop, a school or a filling station it is behind the door.
  if (violent && has(tags, ...ARMED) && !indoorPlace) return shopPlace ? 'indoor' : 'threat';
  if (inc.category === 'violence') {
    if (indoorPlace || /trafficking/.test(id)) return 'indoor';
    // Following, pestering, threatening: nobody is hitting anybody.
    if (/harass|ahist|stalk|jalit|threatening/.test(id)) return inc.vehicles.length ? 'stop' : 'disorder';
    return roles.has('suspect') ? 'brawl' : 'empty';
  }
  if (inc.category === 'public_order') {
    if (indoorPlace || has(tags, 'noise', 'neighbours')) return 'indoor';
    if (has(tags, 'fight') || /brawl|kaklus|clash/.test(id)) return 'brawl';
    if (has(tags, 'vehicle') && inc.vehicles.length) return 'stop';
    return 'disorder';
  }
  if (inc.category === 'property' || inc.category === 'alarm') {
    if (has(tags, 'anpr', 'bolo') && inc.vehicles.length && inc.category === 'alarm') return 'stop';
    if (/fire_alarm|panic_button/.test(id)) return 'indoor';
    const outdoorsJob = /theft_from_car|bike|van_vandalism|graffiti|catalytic|kutusevargus|moped|street_robbery|garaazide|fuel_driveoff|copper|metalli/.test(id);
    if (/robbery|roov/.test(id) && !indoorPlace && !shopPlace) return 'brawl';
    if (outdoorsJob && !indoorPlace) return /fuel_driveoff/.test(id) ? 'stop' : 'theft';
    if (inc.category === 'alarm' && !indoorPlace) return 'theft';
    return 'indoor';
  }
  if (inc.category === 'drugs') {
    if (has(tags, 'vehicle') && inc.vehicles.length) return 'stop';
    return indoorPlace || shopPlace ? 'indoor' : 'disorder';
  }
  if (inc.category === 'fraud' || inc.category === 'missing') return indoorPlace || shopPlace ? 'indoor' : 'empty';
  if (inc.category === 'assist') {
    if (has(tags, 'drunk', 'mental_health') && !indoorPlace) return 'disorder';
    return quiet;
  }
  if (inc.category === 'major') return has(tags, 'bomb', 'crisis') && shopPlace ? 'crowd' : quiet;
  // The border and the environment: a vehicle held with its driver, or nothing a street camera would show.
  if (inc.vehicles.length && roles.has('driver') && !indoorPlace) return 'stop';
  return quiet;
}

/** The cast of an incident's camera scene. */
export function castOf(sim: Pick<SimState, 'persons' | 'vehicles'>, inc: Incident, template: IncidentTemplate | undefined, dress: DressFor): Cast {
  // The template as the incident's own scenario tells it (the same whether or not the caller has resolved it).
  const tpl = withScenario(template, inc.scenarioId);
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
  const id = inc.templateId;
  const card = inc.summary.et;
  const stop: StopStory | null = kind === 'stop' ? stopStoryOf(inc, tpl) : null;
  const gone = stop === 'gone' || stop === 'away';
  const single = kind === 'crash' && (SINGLE_ID.test(id) || SINGLE_TEXT.test(card));
  const trapped = kind === 'crash' && TRAPPED_TEXT.test(card);
  // After a hit-and-run the one who did it is not there: only the car that was hit.
  const fled = kind === 'crash' && /lahkunud/.test(id);
  const people: CastPerson[] = [];
  for (const ref of inc.persons) {
    const p = sim.persons[ref.personId];
    if (!p) continue;
    // Somebody missing or dead is not standing in the street.
    if (ref.role === 'missing' || ref.role === 'deceased') continue;
    if (stop) {
      const bystander = ref.role === 'caller' || ref.role === 'witness';
      // A vehicle that has gone took its people with it; one that stands alone shows none of them.
      if ((gone || stop === 'alone') && !bystander) continue;
      // Whoever reports a vehicle on the move from their own car is not standing here.
      if (stop === 'away') continue;
    }
    people.push({ id: `p:${p.id}`, role: ref.role, look: lookOfPerson(p, dress), seed: hash32('p', p.id) });
  }
  // People of nobody's registry: the crowd itself, the onlookers of a fire. Their ids are 'e:<n>'.
  const extras = kind === 'crowd' ? r.int(12, 20) : kind === 'fire' ? r.int(3, 6) : 0;
  for (let i = 0; i < extras; i++) {
    const s = hash32('extra', inc.id, i);
    people.push({ id: `e:${i}`, role: 'extra', look: lookOfStranger(s, dress), seed: s });
  }
  const cars: CastCar[] = [];
  inc.vehicles.forEach((v, i) => {
    if (fled && v.role === 'suspect') return;
    if (gone) return;
    // One vehicle off the road: the story's first.
    if (single && cars.length) return;
    const veh = sim.vehicles[v.plate];
    cars.push({ id: `v:${v.plate}`, role: v.role, look: veh ? lookOfVehicle(veh) : lookOfAnyCar(hash32('v', inc.id, i)) });
  });
  // A crash needs its vehicles: made-up ones of nobody's when the story names fewer than it tells of.
  if (kind === 'crash') {
    const want = single || fled ? 1 : 2;
    for (let i = cars.length; i < want; i++) cars.push({ id: `v:other${i}`, role: 'involved', look: lookOfAnyCar(hash32('other', inc.id, i)) });
  }
  const armed = has(tags, ...ARMED);
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
    // Somebody trapped in a wreck is in it, not on the ground beside it.
    down:
      kind === 'lying' ||
      (kind === 'brawl' && priority <= 2 && r.chance(0.45)) ||
      (kind === 'crash' && priority === 1 && !trapped) ||
      (kind === 'threat' && priority === 1 && r.chance(0.5)),
    live,
    runs: (kind === 'theft' && r.chance(0.7)) || (kind === 'brawl' && r.chance(0.3)) || (kind === 'disorder' && r.chance(0.12)) || (kind === 'threat' && r.chance(0.2)),
    mayFlee: !gone && (has(tags, 'vehicle_flee') || !!tpl?.beats?.some((b) => b.kind === 'pursuit')),
    priority,
    single,
    trapped,
    gone,
    driverIn: stop === 'inside',
    inRoad: kind === 'lying' && /soiduteel|on_road|jalakaija|rongilt/.test(id),
    chant: kind === 'crowd' && /demonstration|protest|pikett|fannide|football|fans/.test(id),
    riot: kind === 'crowd' && (has(tags, 'riot', 'fight') || /violent|kaklus|clash|mass$/.test(id)),
    carFire: kind === 'fire' && /burned_car|forest_smoke/.test(id),
  };
}
