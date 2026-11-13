/**
 * The vehicles a camera sees (docs/CCTV.md): their shape, paint and markings as plain data. A registry vehicle
 * keeps its colour and kind, a crew's car follows its unit, the other services come in their own colours. Pure:
 * src/cctv/render/cars.ts draws them.
 */
import type { Agency, UnitType, Vehicle } from '@/sim/types';
import { hash32, rand } from './math';

export type CarBody = 'hatch' | 'sedan' | 'estate' | 'suv' | 'van' | 'pickup' | 'truck' | 'bus' | 'moto';

/**
 * Markings. 'police': white with the blue and yellow-green bands and a light bar. 'plain': an unmarked police
 * car (lights behind the grille). 'ambulance' and 'rescue': the other services. 'guard': a security firm's car.
 */
export type Livery = 'none' | 'police' | 'plain' | 'ambulance' | 'rescue' | 'guard' | 'taxi';

export interface CarLook {
  body: CarBody;
  /** Paint, as a hex colour. */
  color: number;
  livery: Livery;
}

export interface CarSize {
  length: number;
  width: number;
  height: number;
  /** Wheel radius. */
  wheel: number;
}

export const CAR_SIZE: Record<CarBody, CarSize> = {
  hatch: { length: 4.1, width: 1.76, height: 1.48, wheel: 0.31 },
  sedan: { length: 4.7, width: 1.82, height: 1.45, wheel: 0.32 },
  estate: { length: 4.75, width: 1.83, height: 1.5, wheel: 0.32 },
  suv: { length: 4.65, width: 1.9, height: 1.7, wheel: 0.36 },
  van: { length: 5.1, width: 1.98, height: 2.05, wheel: 0.35 },
  pickup: { length: 5.3, width: 1.92, height: 1.82, wheel: 0.38 },
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
const COMMON = [0x7c7f84, 0xb4b8bd, 0x17181a, 0xe9e9e6, 0x2b4f8f, 0x1b2a4a, 0x3d4045, 0xa8231f, 0xb4b8bd, 0x17181a, 0x2f6b3a, 0xc7b99a];
const BODIES: CarBody[] = ['hatch', 'hatch', 'sedan', 'estate', 'estate', 'suv', 'suv', 'van'];

/** A vehicle of the registry: its colour, its kind and (by its plate) one of the common car shapes. */
export function lookOfVehicle(v: Pick<Vehicle, 'plate' | 'kind' | 'color'>): CarLook {
  const color = PAINT[v.color.en] ?? 0x7c7f84;
  if (v.kind === 'van') return { body: 'van', color, livery: 'none' };
  if (v.kind === 'truck') return { body: 'truck', color, livery: 'none' };
  if (v.kind === 'bus') return { body: 'bus', color, livery: 'none' };
  if (v.kind === 'moto' || v.kind === 'moped' || v.kind === 'quad') return { body: 'moto', color, livery: 'none' };
  const bodies: CarBody[] = ['hatch', 'hatch', 'sedan', 'estate', 'suv', 'suv'];
  return { body: bodies[hash32('body', v.plate) % bodies.length], color, livery: 'none' };
}

/** Any car: parked along a street, or driving past. */
export function lookOfAnyCar(seed: number): CarLook {
  const r = rand(seed);
  return { body: r.pick(BODIES), color: r.pick(COMMON), livery: r.chance(0.02) ? 'taxi' : 'none' };
}

/** A crew's vehicle, from its unit's kind and the model it is entered with. */
export function lookOfUnit(type: UnitType, model: string): CarLook {
  const m = model.toLowerCase();
  const body: CarBody = /transporter|sprinter|crafter|vito|buss/.test(m)
    ? 'van'
    : /amarok|hilux|ranger/.test(m)
      ? 'pickup'
      : /kodiaq|tiguan|rav4|patrol|id\.4|karoq|land/.test(m)
        ? 'suv'
        : /combi|variant|touring/.test(m)
          ? 'estate'
          : /scala|golf|fabia/.test(m)
            ? 'hatch'
            : 'sedan';
  if (/märgistamata|unmarked/.test(m) || type === 'criminal') return { body, color: body === 'van' ? 0x3d4045 : 0x1b2a4a, livery: 'plain' };
  if (type === 'special') return { body: body === 'sedan' ? 'van' : body, color: 0x23262b, livery: 'plain' };
  return { body, color: 0xe9e9e6, livery: 'police' };
}

/** Another service's vehicle, or null for one that sends nobody a camera would see arrive. */
export function lookOfAgency(agency: Agency): CarLook | null {
  if (agency === 'kiirabi') return { body: 'van', color: 0xe3c21c, livery: 'ambulance' };
  if (agency === 'paaste') return { body: 'truck', color: 0xb5201c, livery: 'rescue' };
  if (agency === 'kov') return { body: 'hatch', color: 0xe9e9e6, livery: 'guard' };
  if (agency === 'transpordiamet' || agency === 'keskkonnaamet' || agency === 'tolliamet') return { body: 'suv', color: 0xe9e9e6, livery: 'guard' };
  if (agency === 'sotsiaal' || agency === 'veterinaar') return { body: 'hatch', color: 0xb4b8bd, livery: 'none' };
  if (agency === 'kapo') return { body: 'sedan', color: 0x17181a, livery: 'plain' };
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
