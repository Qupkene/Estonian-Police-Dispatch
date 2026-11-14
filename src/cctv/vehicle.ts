/**
 * The vehicles a camera sees (docs/CCTV.md): their shape, paint and markings as plain data. A registry vehicle
 * keeps its colour and kind, a crew's car follows its unit and the model it is entered with, the other services
 * come in their own colours. Pure: src/cctv/render/cars.ts draws them.
 */
import type { Agency, UnitType, Vehicle } from '@/sim/types';
import { hash32, rand } from './math';

export type CarBody = 'hatch' | 'sedan' | 'estate' | 'suv' | 'van' | 'pickup' | 'truck' | 'bus' | 'moto';

/**
 * A model with a shape of its own (render/carbody.ts): the cars the Estonian police drive, the ambulance's van,
 * and the most common cars of the registry. A car without one gets the plain shape of its body kind.
 */
export type CarModel =
  | 'octavia'
  | 'superb'
  | 'superbSaloon'
  | 'passat'
  | 'bmw5'
  | 'kodiaq'
  | 'tiguan'
  | 'scala'
  | 'id4'
  | 'rav4'
  | 'patrol'
  | 'amarok'
  | 'transporter'
  | 'vito'
  | 'sprinter'
  | 'ambulance';

/**
 * Markings. 'police': white with blue doors and bonnet, POLITSEI and (on a patrol car) the yellow-green band and
 * a light bar. 'plain': an unmarked police car (lights hidden in the grille and behind the glass). 'ambulance' and
 * 'rescue': the other services. 'guard': a plain white service car. 'taxi': a roof sign.
 */
export type Livery = 'none' | 'police' | 'plain' | 'ambulance' | 'rescue' | 'guard' | 'taxi';

export interface CarLook {
  body: CarBody;
  /** Paint, as a hex colour. */
  color: number;
  livery: Livery;
  /** The model's own shape, when it has one. */
  model?: CarModel;
  /** Metallic paint (a little rougher and brighter in the highlights) rather than solid. */
  metallic?: boolean;
  /** Number plate, "123 ABC". */
  plate?: string;
  /**
   * A police car's kit: 'patrol' has the reflective band and the roof bar, 'local' (a community officer's car)
   * has neither and keeps its blue lights behind the windscreen and in the grille.
   */
  marks?: 'patrol' | 'local';
}

export interface CarSize {
  length: number;
  width: number;
  height: number;
  /** Wheel radius. */
  wheel: number;
}

export const CAR_SIZE: Record<CarBody, CarSize> = {
  hatch: { length: 4.3, width: 1.79, height: 1.47, wheel: 0.31 },
  sedan: { length: 4.8, width: 1.84, height: 1.45, wheel: 0.32 },
  estate: { length: 4.69, width: 1.83, height: 1.47, wheel: 0.32 },
  suv: { length: 4.65, width: 1.88, height: 1.68, wheel: 0.36 },
  van: { length: 4.9, width: 1.9, height: 1.99, wheel: 0.345 },
  pickup: { length: 5.25, width: 1.95, height: 1.83, wheel: 0.38 },
  truck: { length: 7.6, width: 2.45, height: 3.2, wheel: 0.5 },
  bus: { length: 11.8, width: 2.55, height: 3.1, wheel: 0.5 },
  moto: { length: 2.1, width: 0.75, height: 1.15, wheel: 0.3 },
};

/** Paint for the registry's colour names (src/data/vehicles.ts COLORS, by their English name). */
const PAINT: Record<string, number> = {
  grey: 0x7c7f84,
  silver: 0xb4b8bd,
  black: 0x17181a,
  white: 0xe9e9e6,
  blue: 0x2b4f8f,
  'dark blue': 0x1b2a4a,
  'dark grey': 0x3d4045,
  red: 0xa8231f,
  maroon: 0x5c1a22,
  green: 0x2f6b3a,
  'dark green': 0x1f3d2a,
  brown: 0x5a4030,
  beige: 0xc7b99a,
  'light blue': 0x7fa8cf,
  yellow: 0xd9b526,
  orange: 0xd0661e,
  gold: 0xb59a5a,
  purple: 0x4f2f6a,
};
/** Colours that usually come metallic. */
const METALLIC = new Set([0x7c7f84, 0xb4b8bd, 0x3d4045, 0x1b2a4a, 0x2b4f8f, 0x5c1a22, 0xb59a5a, 0x5a4030, 0x1f3d2a]);
const COMMON = [0x7c7f84, 0xb4b8bd, 0x17181a, 0xe9e9e6, 0x2b4f8f, 0x1b2a4a, 0x3d4045, 0xa8231f, 0xb4b8bd, 0x17181a, 0x2f6b3a, 0xc7b99a, 0xe9e9e6, 0x7c7f84];
const BODIES: CarBody[] = ['hatch', 'hatch', 'sedan', 'estate', 'estate', 'suv', 'suv', 'van', 'hatch', 'suv', 'pickup'];
/** The commonest models of each body kind on Estonian streets, to give a street the shapes it really has. */
const MODELS: Partial<Record<CarBody, (CarModel | undefined)[]>> = {
  estate: ['octavia', 'octavia', 'passat', 'superb', undefined],
  sedan: ['bmw5', 'superbSaloon', undefined, undefined],
  hatch: ['scala', undefined, undefined],
  suv: ['rav4', 'kodiaq', 'tiguan', undefined, undefined],
  van: ['transporter', 'vito', 'transporter', 'sprinter'],
};

/** A made-up Estonian number plate: three digits and three letters. */
export function plateOf(seed: number): string {
  const r = rand(seed);
  const letters = 'ABCDEFGHJKLMNOPRSTUVZ';
  let p = `${r.int(100, 999)} `;
  for (let i = 0; i < 3; i++) p += r.pick([...letters]);
  return p;
}

/** The body kind and model of a registry car, from its model's name. */
function modelOf(name: string): { body: CarBody; model?: CarModel } | null {
  const m = name.toLowerCase();
  const table: [RegExp, CarBody, CarModel?][] = [
    [/octavia/, 'estate', 'octavia'],
    [/superb/, 'estate', 'superb'],
    [/passat|v60|v70|v90|outback|mondeo|insignia/, 'estate', 'passat'],
    [/kodiaq|karoq|enyaq/, 'suv', 'kodiaq'],
    [/tiguan|t-roc|touareg|q3|q5|x1|x3|tucson|sportage|kuga|qashqai|x-trail|cx-5|cx-30|cx-60|3008|5008|kadjar|forester|outlander|xc40|xc60|glc/, 'suv', 'tiguan'],
    [/rav4|c-hr|nx|ux|cr-v|santa fe|sorento|xc90|q7|x5|gle|ml|niro|kona|ix35/, 'suv', 'rav4'],
    [/id\.4|ioniq|ev6|bz4x|model y|mach-e|atto|q8 e-tron/, 'suv', 'id4'],
    [/patrol|land cruiser|lx|g-klass|pajero|x6|model x/, 'suv', 'patrol'],
    [/duster|vitara|jimny|juke|mokka|captur|2008|asx|xv|kamiq|niva/, 'suv'],
    [/amarok|hilux|ranger|navara|l200/, 'pickup', 'amarok'],
    [/transporter|caravelle|multivan|crafter|trafic|vivaro|transit|caddy|berlingo|partner/, 'van', 'transporter'],
    [/vito|v-klass/, 'van', 'vito'],
    [/sprinter|ducato|boxer|master|movano|daily/, 'van', 'sprinter'],
    [/5\d\dd|5\d\di|e-klass|a6|s90|s80|es\b|gs\b|arteon/, 'sedan', 'bmw5'],
    [/3\d\dd|3\d\di|7\d\dd|a4|a8|c-klass|s-klass|cla|is\b|camry|avensis|accord|jetta|s60|508|407|laguna|legacy|lancer|model 3|model s|polestar|logan|almera|primera|626|^6$|vectra|210/, 'sedan'],
    [/scala|golf|astra|focus|i30|ceed|corolla|auris|308|megane|civic|mazda 3|^3$|leaf|a3|1\d\di|v40|zafira|touran|sharan|s-max|picasso|scenic|meriva/, 'hatch', 'scala'],
  ];
  for (const [re, body, model] of table) if (re.test(m)) return { body, model };
  return null;
}

/** A vehicle of the registry: its colour, its kind and (by its model, or else by its plate) a car's shape. */
export function lookOfVehicle(v: Pick<Vehicle, 'plate' | 'kind' | 'color'> & Partial<Pick<Vehicle, 'model'>>): CarLook {
  const color = PAINT[v.color.en] ?? 0x7c7f84;
  const base = { color, livery: 'none' as const, plate: v.plate, metallic: METALLIC.has(color) };
  if (v.kind === 'truck') return { ...base, body: 'truck' };
  if (v.kind === 'bus') return { ...base, body: 'bus' };
  if (v.kind === 'moto' || v.kind === 'moped' || v.kind === 'quad') return { ...base, body: 'moto' };
  const known = v.model ? modelOf(v.model) : null;
  if (v.kind === 'van') return { ...base, body: 'van', model: known?.body === 'van' ? known.model : 'transporter' };
  if (known) return { ...base, ...known };
  const bodies: CarBody[] = ['hatch', 'hatch', 'sedan', 'estate', 'suv', 'suv'];
  return { ...base, body: bodies[hash32('body', v.plate) % bodies.length] };
}

/** Any car: parked along a street, or driving past. */
export function lookOfAnyCar(seed: number): CarLook {
  const r = rand(seed);
  const body = r.pick(BODIES);
  const color = r.pick(COMMON);
  const models = MODELS[body];
  const model = models ? r.pick(models) : undefined;
  return { body, color, livery: r.chance(0.02) ? 'taxi' : 'none', model, metallic: METALLIC.has(color) && r.chance(0.85), plate: plateOf(seed) };
}

/** The model of a crew's car, from the name it is entered with (src/data/regions/*.ts). */
function unitModel(m: string): { body: CarBody; model: CarModel } {
  if (/sprinter|crafter/.test(m)) return { body: 'van', model: 'sprinter' };
  if (/vito/.test(m)) return { body: 'van', model: 'vito' };
  if (/transporter|buss/.test(m)) return { body: 'van', model: 'transporter' };
  if (/amarok|hilux|ranger/.test(m)) return { body: 'pickup', model: 'amarok' };
  if (/kodiaq|karoq|enyaq/.test(m)) return { body: 'suv', model: 'kodiaq' };
  if (/tiguan|tayron/.test(m)) return { body: 'suv', model: 'tiguan' };
  if (/rav4/.test(m)) return { body: 'suv', model: 'rav4' };
  if (/patrol|land/.test(m)) return { body: 'suv', model: 'patrol' };
  if (/id\.4/.test(m)) return { body: 'suv', model: 'id4' };
  if (/scala|golf|fabia/.test(m)) return { body: 'hatch', model: 'scala' };
  if (/bmw|530|520/.test(m)) return { body: 'sedan', model: 'bmw5' };
  if (/passat/.test(m)) return { body: 'estate', model: 'passat' };
  if (/superb/.test(m)) return /combi/.test(m) ? { body: 'estate', model: 'superb' } : { body: 'sedan', model: 'superbSaloon' };
  return { body: 'estate', model: 'octavia' };
}

/** Dark metallic colours unmarked police cars come in. */
const UNMARKED = [0x1b1d21, 0x2a2d33, 0x3a3532, 0x1b2a4a, 0x4a4d52];

/** A crew's vehicle, from its unit's kind and the model it is entered with. */
export function lookOfUnit(type: UnitType, model: string): CarLook {
  const m = model.toLowerCase();
  const u = unitModel(m);
  const plate = plateOf(hash32('unit-plate', model, type));
  if (/märgistamata|unmarked/.test(m) || type === 'criminal') {
    return { ...u, color: UNMARKED[hash32('unmarked', model) % UNMARKED.length], livery: 'plain', metallic: true, plate };
  }
  if (type === 'special') return { body: 'van', model: 'sprinter', color: 0x23262b, livery: 'plain', metallic: true, plate };
  return { ...u, color: 0xf2f3f1, livery: 'police', marks: type === 'community' ? 'local' : 'patrol', plate };
}

/** Another service's vehicle, or null for one that sends nobody a camera would see arrive. */
export function lookOfAgency(agency: Agency): CarLook | null {
  if (agency === 'kiirabi') return { body: 'van', model: 'ambulance', color: 0xf4f4f1, livery: 'ambulance', plate: plateOf(7101) };
  if (agency === 'paaste') return { body: 'truck', color: 0xb5201c, livery: 'rescue', plate: plateOf(7102) };
  if (agency === 'kov') return { body: 'hatch', model: 'scala', color: 0xe9e9e6, livery: 'guard', plate: plateOf(7103) };
  if (agency === 'transpordiamet' || agency === 'keskkonnaamet' || agency === 'tolliamet') return { body: 'suv', model: 'tiguan', color: 0xe9e9e6, livery: 'guard', plate: plateOf(7104) };
  if (agency === 'sotsiaal' || agency === 'veterinaar') return { body: 'hatch', model: 'scala', color: 0xb4b8bd, livery: 'none', metallic: true, plate: plateOf(7105) };
  if (agency === 'kapo') return { body: 'sedan', model: 'superbSaloon', color: 0x17181a, livery: 'plain', metallic: true, plate: plateOf(7106) };
  return null;
}

/** A vehicle's lamps, as the director switches them. */
export interface CarLights {
  /** Blue lights flashing. */
  beacons: boolean;
  /** Headlights and tail lights on (driving, or standing with the engine running in the dark). */
  lamps: boolean;
  /** All four indicators blinking. */
  hazard: boolean;
  braking: boolean;
}

/** Does this vehicle show blue lights? */
export const hasBeacons = (l: Livery) => l === 'police' || l === 'plain' || l === 'ambulance' || l === 'rescue';
