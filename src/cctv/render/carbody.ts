/**
 * The body of a car, drawn the way a car is shaped: a row of cross-sections from tail to nose (sill, door, shoulder,
 * belt line, glass leaning in, roof) joined into one smooth skin, with the bonnet, the screens and the pillars where
 * that model has them, and the wheel arches cut out of it. Each model the police drive has its own measurements
 * (a Škoda Octavia estate is not a Kodiaq is not a Transporter), the other cars the plain shape of their kind.
 * Wheels with tyres and rims, arch liners, mirrors, roof rails and lamp units that wrap round the corners are added
 * on top.
 *
 * Two levels of detail: 'low' (the default, for parked cars baked into the street: everything in vertex colours,
 * under 2 300 triangles) and 'high' (a moving car: more sections, and the painted parts handed back as facets so
 * that cars.ts can lay its markings, grille, plates and rims on them as one painting).
 *
 * A car is drawn about its own origin: x forwards, y up, z to its right, the wheels on the ground.
 */
import type { Color } from 'three';
import { clamp, lerp, type V2 } from '../math';
import type { CarBody, CarLook, CarModel } from '../vehicle';
import { mix, shade, type MeshBuilder, type P3, type Xf } from './mesh';

/** The family look of a car's front, for its painted grille (cars.ts). */
export type Face = 'skoda' | 'vw' | 'vwev' | 'vwvan' | 'merc' | 'bmw' | 'toyota' | 'nissan' | 'plain';

/** A lamp unit: a band on the nose or the tail that wraps round the corner onto the side. */
export interface Lamp {
  /** Where it begins, from the car's middle line (m). */
  z: number;
  /** How far it runs along the side past the corner (m). */
  wrap: number;
  /** Its foot and top at the inner end, and at the outer end. */
  y: readonly [number, number];
  yo: readonly [number, number];
}

export interface Shape {
  L: number;
  W: number;
  H: number;
  wheel: number;
  /** Front and rear axle. */
  xf: number;
  xr: number;
  /** Along the car, front positive: where the bonnet's top begins, the foot and the top of the windscreen, the top and the foot of the rear screen. */
  xHood: number;
  xCowl: number;
  xRoofF: number;
  xRoofR: number;
  xDeck: number;
  yFloor: number;
  /** Heights: the front edge, the bonnet where it begins, the belt line at the windscreen and at the back, the boot lid and the tail's top. */
  yNose: number;
  yHood: number;
  yCowl: number;
  yBeltR: number;
  yDeck: number;
  yTail: number;
  /** Side glass reaches back to here. */
  glassTo: number;
  /** Pillars between the side windows (their middles) and their half widths. */
  pillars: number[];
  pillarW: number[];
  /** The roof's half-width as a share of the body's. */
  tumble: number;
  /** Unpainted plastic along the bottom and round the arches (an SUV). */
  cladding: boolean;
  /** No glass in the rear screen (a panel van). */
  blind: boolean;
  /** The pillar behind the front door in gloss black, as on most cars since about 2015. */
  blackB: boolean;
  /** Roof rails. */
  rails: boolean;
  /** A high-roof van's windows stop here, with painted panel above them (and the windscreen too). */
  glassTop?: number;
  /** The lines between the doors and panels, front to back (markings follow them). */
  doors: number[];
  head: Lamp;
  tail: Lamp;
  face: Face;
}

type Base = Omit<Shape, 'pillarW' | 'blackB' | 'rails' | 'cladding' | 'blind' | 'face'> & Partial<Shape>;

function mk(b: Base): Shape {
  return { cladding: false, blind: false, blackB: true, rails: false, face: 'plain', pillarW: b.pillars.map(() => 0.05), ...b };
}

/** A modern car's headlamp: its inner end against the grille's corner, its lower edge rising sharply outwards. */
const CAR_HEAD: Lamp = { z: 0.41, wrap: 0.26, y: [0.6, 0.74], yo: [0.69, 0.77] };
const ESTATE_TAIL: Lamp = { z: 0.5, wrap: 0.17, y: [0.82, 0.95], yo: [0.79, 0.97] };

/** Real measurements (length, width, height, wheelbase, overhangs) of each model; the shapes of the plain kinds. */
const MODELS: Record<CarModel, Shape> = {
  // Škoda Octavia IV Combi: 4.69 x 1.83 x 1.47 m, wheelbase 2.69 m. The patrol car of most Estonian stations.
  octavia: mk({ L: 4.69, W: 1.83, H: 1.47, wheel: 0.32, xf: 1.425, xr: -1.265, xHood: 2.1, xCowl: 1.12, xRoofF: 0.36, xRoofR: -1.86, xDeck: -2.22, yFloor: 0.17, yNose: 0.74, yHood: 0.84, yCowl: 0.98, yBeltR: 1.03, yDeck: 1.0, yTail: 0.96, glassTo: -1.98, pillars: [-0.02, -1.0], tumble: 0.75, rails: true, doors: [1.04, -0.02, -1.03], head: CAR_HEAD, tail: ESTATE_TAIL, face: 'skoda' }),
  // Škoda Superb III Combi: 4.86 x 1.86 x 1.48 m, wheelbase 2.84 m (the car of the Police and Border Guard Board's press photos).
  superb: mk({ L: 4.86, W: 1.86, H: 1.48, wheel: 0.33, xf: 1.5, xr: -1.34, xHood: 2.18, xCowl: 1.16, xRoofF: 0.4, xRoofR: -1.96, xDeck: -2.31, yFloor: 0.17, yNose: 0.74, yHood: 0.85, yCowl: 0.98, yBeltR: 1.04, yDeck: 1.0, yTail: 0.97, glassTo: -2.08, pillars: [0, -1.1], pillarW: [0.05, 0.06], tumble: 0.75, rails: true, doors: [1.08, 0, -1.13], head: CAR_HEAD, tail: ESTATE_TAIL, face: 'skoda' }),
  // Škoda Superb III liftback: the unmarked car. A long sloping rear screen down to a short tail.
  superbSaloon: mk({ L: 4.86, W: 1.86, H: 1.47, wheel: 0.33, xf: 1.5, xr: -1.34, xHood: 2.18, xCowl: 1.16, xRoofF: 0.4, xRoofR: -0.72, xDeck: -2.02, yFloor: 0.17, yNose: 0.74, yHood: 0.85, yCowl: 0.98, yBeltR: 1.05, yDeck: 1.05, yTail: 0.99, glassTo: -1.3, pillars: [0, -1.1], pillarW: [0.05, 0.035], tumble: 0.75, doors: [1.08, 0, -1.13], head: CAR_HEAD, tail: { z: 0.36, wrap: 0.22, y: [0.86, 0.97], yo: [0.86, 1.0] }, face: 'skoda' }),
  // Volkswagen Passat B8/B9 Variant: 4.89 x 1.83 x 1.5 m, wheelbase 2.79 m.
  passat: mk({ L: 4.89, W: 1.83, H: 1.49, wheel: 0.33, xf: 1.52, xr: -1.27, xHood: 2.2, xCowl: 1.18, xRoofF: 0.42, xRoofR: -1.98, xDeck: -2.33, yFloor: 0.17, yNose: 0.72, yHood: 0.83, yCowl: 0.97, yBeltR: 1.02, yDeck: 1.0, yTail: 0.96, glassTo: -2.1, pillars: [0, -1.08], tumble: 0.75, rails: true, doors: [1.1, 0, -1.1], head: { z: 0.36, wrap: 0.22, y: [0.64, 0.71], yo: [0.66, 0.74] }, tail: ESTATE_TAIL, face: 'vw' }),
  // BMW 530d (G30): 4.94 x 1.87 x 1.47 m, wheelbase 2.975 m. A long bonnet: the windscreen far behind the front axle.
  bmw5: mk({ L: 4.94, W: 1.87, H: 1.47, wheel: 0.34, xf: 1.64, xr: -1.335, xHood: 2.28, xCowl: 0.98, xRoofF: 0.24, xRoofR: -0.86, xDeck: -1.62, yFloor: 0.16, yNose: 0.72, yHood: 0.83, yCowl: 0.97, yBeltR: 1.04, yDeck: 1.06, yTail: 1.0, glassTo: -1.2, pillars: [-0.04, -1.12], pillarW: [0.05, 0.03], tumble: 0.75, doors: [0.98, -0.04, -1.1], head: { z: 0.4, wrap: 0.26, y: [0.62, 0.7], yo: [0.64, 0.76] }, tail: { z: 0.4, wrap: 0.24, y: [0.86, 0.97], yo: [0.86, 1.01] }, face: 'bmw' }),
  // Škoda Kodiaq I: 4.70 x 1.88 x 1.68 m, wheelbase 2.79 m. Upright tailgate, black cladding, roof rails.
  kodiaq: mk({ L: 4.7, W: 1.88, H: 1.68, wheel: 0.36, xf: 1.48, xr: -1.31, xHood: 2.12, xCowl: 1.16, xRoofF: 0.46, xRoofR: -1.94, xDeck: -2.26, yFloor: 0.22, yNose: 0.9, yHood: 1.01, yCowl: 1.12, yBeltR: 1.2, yDeck: 1.17, yTail: 1.1, glassTo: -2.0, pillars: [0.06, -1.06], pillarW: [0.05, 0.07], tumble: 0.8, cladding: true, rails: true, doors: [1.1, 0.06, -1.08], head: { z: 0.4, wrap: 0.24, y: [0.79, 0.89], yo: [0.83, 0.95] }, tail: { z: 0.5, wrap: 0.2, y: [0.96, 1.08], yo: [0.94, 1.12] }, face: 'skoda' }),
  // Volkswagen Tiguan II: 4.51 x 1.84 x 1.66 m, wheelbase 2.68 m.
  tiguan: mk({ L: 4.51, W: 1.84, H: 1.66, wheel: 0.355, xf: 1.375, xr: -1.305, xHood: 2.02, xCowl: 1.1, xRoofF: 0.42, xRoofR: -1.84, xDeck: -2.16, yFloor: 0.21, yNose: 0.88, yHood: 0.99, yCowl: 1.1, yBeltR: 1.17, yDeck: 1.15, yTail: 1.08, glassTo: -1.92, pillars: [0.02, -0.98], pillarW: [0.05, 0.07], tumble: 0.8, cladding: true, rails: true, doors: [1.04, 0.02, -1.0], head: { z: 0.38, wrap: 0.24, y: [0.8, 0.88], yo: [0.82, 0.92] }, tail: { z: 0.46, wrap: 0.2, y: [0.95, 1.06], yo: [0.93, 1.1] }, face: 'vw' }),
  // Škoda Scala: 4.36 x 1.79 x 1.47 m, wheelbase 2.65 m.
  scala: mk({ L: 4.36, W: 1.79, H: 1.47, wheel: 0.32, xf: 1.33, xr: -1.32, xHood: 1.98, xCowl: 1.02, xRoofF: 0.3, xRoofR: -1.42, xDeck: -2.02, yFloor: 0.17, yNose: 0.74, yHood: 0.84, yCowl: 0.98, yBeltR: 1.04, yDeck: 1.02, yTail: 0.96, glassTo: -1.62, pillars: [-0.05], pillarW: [0.05], tumble: 0.75, doors: [0.98, -0.05, -1.05], head: CAR_HEAD, tail: { z: 0.42, wrap: 0.2, y: [0.84, 0.95], yo: [0.84, 1.0] }, face: 'skoda' }),
  // Volkswagen ID.4: 4.58 x 1.85 x 1.63 m, wheelbase 2.77 m. Short bonnet, long raked screen, sloping tail.
  id4: mk({ L: 4.58, W: 1.85, H: 1.63, wheel: 0.37, xf: 1.49, xr: -1.28, xHood: 2.02, xCowl: 1.3, xRoofF: 0.36, xRoofR: -1.5, xDeck: -2.14, yFloor: 0.2, yNose: 0.82, yHood: 0.95, yCowl: 1.08, yBeltR: 1.16, yDeck: 1.13, yTail: 1.05, glassTo: -1.82, pillars: [0.02, -0.98], pillarW: [0.05, 0.08], tumble: 0.79, cladding: true, rails: true, doors: [1.14, 0.02, -1.02], head: { z: 0.34, wrap: 0.26, y: [0.74, 0.81], yo: [0.76, 0.86] }, tail: { z: 0.3, wrap: 0.24, y: [0.98, 1.04], yo: [0.96, 1.08] }, face: 'vwev' }),
  // Toyota RAV4 (XA50): 4.60 x 1.855 x 1.69 m, wheelbase 2.69 m.
  rav4: mk({ L: 4.6, W: 1.855, H: 1.69, wheel: 0.36, xf: 1.4, xr: -1.29, xHood: 2.08, xCowl: 1.12, xRoofF: 0.44, xRoofR: -1.86, xDeck: -2.2, yFloor: 0.22, yNose: 0.9, yHood: 1.02, yCowl: 1.12, yBeltR: 1.2, yDeck: 1.17, yTail: 1.1, glassTo: -1.96, pillars: [0.04, -1.0], pillarW: [0.05, 0.09], tumble: 0.8, cladding: true, rails: true, doors: [1.06, 0.04, -1.04], head: { z: 0.4, wrap: 0.25, y: [0.8, 0.89], yo: [0.84, 0.95] }, tail: { z: 0.48, wrap: 0.22, y: [0.95, 1.06], yo: [0.93, 1.1] }, face: 'toyota' }),
  // Nissan Patrol (Y62): 5.17 x 1.995 x 1.94 m, wheelbase 3.075 m. Tall and square.
  patrol: mk({ L: 5.17, W: 2.0, H: 1.94, wheel: 0.4, xf: 1.655, xr: -1.42, xHood: 2.4, xCowl: 1.42, xRoofF: 0.78, xRoofR: -2.32, xDeck: -2.52, yFloor: 0.28, yNose: 1.04, yHood: 1.17, yCowl: 1.28, yBeltR: 1.34, yDeck: 1.32, yTail: 1.24, glassTo: -2.26, pillars: [0.25, -1.0], pillarW: [0.06, 0.06], tumble: 0.85, cladding: true, rails: true, doors: [1.34, 0.25, -0.98], head: { z: 0.48, wrap: 0.26, y: [0.92, 1.03], yo: [0.95, 1.08] }, tail: { z: 0.66, wrap: 0.14, y: [0.98, 1.22], yo: [0.98, 1.24] }, face: 'nissan' }),
  // Volkswagen Amarok (2023): 5.35 x 1.91 x 1.88 m, wheelbase 3.27 m, a double cab and an open load bed.
  amarok: mk({ L: 5.3, W: 1.95, H: 1.86, wheel: 0.39, xf: 1.71, xr: -1.5, xHood: 2.44, xCowl: 1.44, xRoofF: 0.78, xRoofR: -0.46, xDeck: -0.64, yFloor: 0.27, yNose: 1.0, yHood: 1.12, yCowl: 1.24, yBeltR: 1.27, yDeck: 1.2, yTail: 1.18, glassTo: -0.56, pillars: [0.18], pillarW: [0.06], tumble: 0.83, cladding: true, doors: [1.36, 0.18, -0.6], head: { z: 0.42, wrap: 0.26, y: [0.88, 0.98], yo: [0.9, 1.04] }, tail: { z: 0.84, wrap: 0.05, y: [0.82, 1.14], yo: [0.82, 1.14] }, face: 'vw' }),
  // Volkswagen Transporter T6.1: 4.90 x 1.90 x 1.99 m, wheelbase 3.0 m. One box, a short bonnet, a sliding door.
  transporter: mk({ L: 4.9, W: 1.9, H: 1.99, wheel: 0.345, xf: 1.52, xr: -1.48, xHood: 2.3, xCowl: 1.76, xRoofF: 1.18, xRoofR: -2.36, xDeck: -2.42, yFloor: 0.2, yNose: 0.92, yHood: 1.03, yCowl: 1.18, yBeltR: 1.2, yDeck: 1.9, yTail: 1.86, glassTo: -0.5, pillars: [0.6], pillarW: [0.06], tumble: 0.9, blind: true, doors: [1.66, 0.6, -0.55], head: { z: 0.44, wrap: 0.2, y: [0.8, 0.91], yo: [0.84, 0.96] }, tail: { z: 0.82, wrap: 0.06, y: [0.62, 1.18], yo: [0.62, 1.2] }, face: 'vwvan' }),
  // Mercedes-Benz Vito (W447) long: 5.14 x 1.93 x 1.91 m, wheelbase 3.2 m. A longer, sloping bonnet and a more raked
  // windscreen than the Transporter's, lamps swept back into the wings.
  vito: mk({ L: 5.14, W: 1.93, H: 1.91, wheel: 0.34, xf: 1.7, xr: -1.5, xHood: 2.4, xCowl: 1.7, xRoofF: 0.98, xRoofR: -2.48, xDeck: -2.54, yFloor: 0.2, yNose: 0.9, yHood: 1.02, yCowl: 1.16, yBeltR: 1.2, yDeck: 1.83, yTail: 1.79, glassTo: -0.4, pillars: [0.62], pillarW: [0.06], tumble: 0.9, blind: true, doors: [1.62, 0.62, -0.45], head: { z: 0.42, wrap: 0.32, y: [0.8, 0.9], yo: [0.86, 0.99] }, tail: { z: 0.84, wrap: 0.06, y: [0.6, 1.16], yo: [0.6, 1.18] }, face: 'merc' }),
  // Mercedes-Benz Sprinter, high roof: 5.93 x 2.02 x 2.6 m, wheelbase 3.665 m (the prisoner transport and riot van).
  sprinter: mk({ L: 5.93, W: 2.02, H: 2.6, wheel: 0.37, xf: 2.0, xr: -1.665, xHood: 2.82, xCowl: 2.22, xRoofF: 1.5, xRoofR: -2.9, xDeck: -2.94, yFloor: 0.22, yNose: 1.0, yHood: 1.13, yCowl: 1.32, yBeltR: 1.34, yDeck: 2.52, yTail: 2.46, glassTo: 1.0, pillars: [], pillarW: [], tumble: 0.92, blind: true, blackB: false, glassTop: 2.08, doors: [2.1, 1.0, -0.4], head: { z: 0.46, wrap: 0.24, y: [0.86, 0.98], yo: [0.9, 1.05] }, tail: { z: 0.9, wrap: 0.05, y: [0.6, 1.2], yo: [0.6, 1.22] }, face: 'merc' }),
  // An ambulance on a Mercedes-Benz Sprinter or VW Crafter high-roof van: 5.9 x 2.04 x 2.75 m.
  ambulance: mk({ L: 5.95, W: 2.04, H: 2.74, wheel: 0.37, xf: 2.02, xr: -1.66, xHood: 2.84, xCowl: 2.24, xRoofF: 1.52, xRoofR: -2.92, xDeck: -2.96, yFloor: 0.22, yNose: 1.0, yHood: 1.13, yCowl: 1.32, yBeltR: 1.34, yDeck: 2.64, yTail: 2.58, glassTo: 1.02, pillars: [], pillarW: [], tumble: 0.93, blind: true, blackB: false, glassTop: 2.08, doors: [2.12, 1.0, -0.3], head: { z: 0.46, wrap: 0.24, y: [0.86, 0.98], yo: [0.9, 1.05] }, tail: { z: 0.9, wrap: 0.05, y: [0.6, 1.3], yo: [0.6, 1.32] }, face: 'merc' }),
};

const PLAIN: Record<Exclude<CarBody, 'truck' | 'bus' | 'moto'>, Shape> = {
  estate: MODELS.octavia,
  // A saloon: a long, low rear screen (about 25 degrees) down to a short boot lid.
  sedan: mk({ L: 4.8, W: 1.84, H: 1.45, wheel: 0.32, xf: 1.47, xr: -1.33, xHood: 2.24, xCowl: 1.16, xRoofF: 0.42, xRoofR: -0.86, xDeck: -1.78, yFloor: 0.17, yNose: 0.73, yHood: 0.84, yCowl: 0.98, yBeltR: 1.02, yDeck: 1.05, yTail: 0.99, glassTo: -1.16, pillars: [0.02], tumble: 0.76, doors: [1.06, 0.02, -1.08], head: CAR_HEAD, tail: { z: 0.42, wrap: 0.24, y: [0.84, 0.96], yo: [0.84, 1.0] }, face: 'plain' }),
  // A hatchback: 4.15 m, a short rear overhang and the tailgate standing at about 70 degrees with its window in it.
  hatch: mk({ L: 4.15, W: 1.78, H: 1.47, wheel: 0.31, xf: 1.17, xr: -1.425, xHood: 1.82, xCowl: 0.86, xRoofF: 0.18, xRoofR: -1.72, xDeck: -1.94, yFloor: 0.17, yNose: 0.75, yHood: 0.85, yCowl: 0.99, yBeltR: 1.03, yDeck: 1.0, yTail: 0.95, glassTo: -1.66, pillars: [-0.16], tumble: 0.76, doors: [0.8, -0.16, -1.08], head: CAR_HEAD, tail: { z: 0.44, wrap: 0.2, y: [0.84, 0.95], yo: [0.84, 1.0] }, face: 'plain' }),
  suv: mk({ L: 4.55, W: 1.84, H: 1.65, wheel: 0.35, xf: 1.38, xr: -1.28, xHood: 2.04, xCowl: 1.1, xRoofF: 0.44, xRoofR: -1.8, xDeck: -2.14, yFloor: 0.21, yNose: 0.88, yHood: 0.99, yCowl: 1.1, yBeltR: 1.16, yDeck: 1.14, yTail: 1.07, glassTo: -1.9, pillars: [0.03, -0.98], pillarW: [0.05, 0.08], tumble: 0.8, cladding: true, rails: true, doors: [1.04, 0.03, -1.0], head: { z: 0.4, wrap: 0.24, y: [0.79, 0.87], yo: [0.82, 0.92] }, tail: { z: 0.46, wrap: 0.2, y: [0.94, 1.05], yo: [0.92, 1.09] }, face: 'plain' }),
  van: MODELS.transporter,
  pickup: MODELS.amarok,
};

/** The shape of a car: its model's, or the plain one of its kind. */
export function shapeOf(look: CarLook): Shape {
  if (look.model) return MODELS[look.model];
  const body = look.body === 'truck' || look.body === 'bus' || look.body === 'moto' ? 'van' : look.body;
  return PLAIN[body];
}

export type Lod = 'low' | 'high';

const GLASS = 0x2c3640;
const DARK = 0x16171a;
const TRIM = 0x202124;
const GRIME = 0x4b4740;

export interface Lines {
  top: (x: number) => number;
  belt: (x: number) => number;
  half: (x: number) => number;
  floor: (x: number) => number;
  /** The radius of the wheel arches' openings. */
  arch: number;
}

export function linesOf(s: Shape): Lines {
  const nose = s.L / 2;
  const tail = -s.L / 2;
  // The arch hugs the tyre: 3 cm of gap.
  const arch = s.wheel + 0.03;
  // The roof: highest over the front seats, falling a little to the windscreen and more towards the tail (a van's
  // stays level).
  const fall = s.H > 1.85 ? 0.035 : 0.065;
  const roof = (t: number) => (t > 0.62 ? s.H - 0.03 * ((t - 0.62) / 0.38) ** 2 : s.H - fall * ((0.62 - t) / 0.62) ** 1.6);
  const top = (x: number): number => {
    if (x >= s.xHood) {
      // The nose rounds down from the bonnet to the front edge.
      const t = clamp((x - s.xHood) / (nose - s.xHood), 0, 1);
      return s.yNose + (s.yHood - s.yNose) * Math.sqrt(1 - t * t);
    }
    if (x >= s.xCowl) return lerp(s.yCowl, s.yHood, Math.pow((x - s.xCowl) / (s.xHood - s.xCowl), 1.5));
    if (x >= s.xRoofF) return lerp(s.H, s.yCowl, Math.pow((x - s.xRoofF) / (s.xCowl - s.xRoofF), 1.12));
    if (x >= s.xRoofR) return roof((x - s.xRoofR) / (s.xRoofF - s.xRoofR));
    if (x >= s.xDeck) return lerp(s.yDeck, roof(0), Math.pow((x - s.xDeck) / (s.xRoofR - s.xDeck), 0.9));
    return lerp(s.yTail, s.yDeck, clamp((x - tail) / Math.max(0.01, s.xDeck - tail), 0, 1));
  };
  const belt = (x: number): number => {
    if (x > s.xCowl || x < s.xDeck) return top(x);
    return Math.min(top(x), lerp(s.yBeltR, s.yCowl, (x - s.xDeck) / (s.xCowl - s.xDeck)));
  };
  const half = (x: number): number => {
    const w = s.W / 2;
    const dn = nose - x;
    const dt = x - tail;
    let k = 1;
    if (dn < 0.8) k -= 0.2 * (1 - dn / 0.8) ** 2.2;
    if (dt < 0.6) k -= 0.12 * (1 - dt / 0.6) ** 2.4;
    return w * k;
  };
  const floor = (x: number): number => {
    const d = Math.min(nose - x, x - tail);
    let y = s.yFloor + (d < 0.6 ? 0.1 * (1 - d / 0.6) ** 2 : 0);
    // The wheel arches: the body's lower edge goes up and over each wheel.
    for (const ax of [s.xf, s.xr]) {
      const dx = Math.abs(x - ax);
      if (dx <= arch) y = Math.max(y, s.wheel + Math.sqrt(arch * arch - dx * dx));
    }
    return y;
  };
  return { top, belt, half, floor, arch };
}

/**
 * Near the ends the nose and the tail round off: in profile the top and the bottom of each section stand back (a
 * car's bumper face also leans back as it rises), and in plan the corners are pulled back into the wings. Gives the
 * x of the skin at station `x`, height `y` and distance `z` from the middle line.
 */
export function bendOf(s: Shape, l: Lines): (x: number, y: number, z?: number) => number {
  const nose = s.L / 2;
  const tail = -s.L / 2;
  const van = s.H > 1.85;
  return (x, y, z = 0) => {
    const wf = clamp((x - (nose - 0.25)) / 0.25, 0, 1);
    const wt = clamp((tail + 0.2 - x) / 0.2, 0, 1);
    if (!wf && !wt) return x;
    const y0 = l.floor(x);
    const b = l.belt(x);
    const t = l.top(x);
    const y1 = t > b + 0.06 ? t + 0.012 : b + 0.036;
    const u = clamp((2 * (y - y0)) / Math.max(0.05, y1 - y0) - 1, -1, 1);
    const c = Math.min(1, Math.abs(z) / Math.max(0.3, l.half(x))) ** 3;
    const front = van ? 0.07 * u * u + 0.05 * c : 0.06 * Math.max(0, u) ** 2 + 0.035 * Math.max(0, -u) ** 2 + 0.045 * (u + 1) * 0.5 + 0.12 * c;
    return x - wf * front + wt * (0.05 * u * u + 0.08 * c);
  };
}

/** One cross-section's right half, from the bottom edge up and over to the middle of the roof: [z, y]. */
function ring(s: Shape, l: Lines, x: number): V2[] {
  const w = l.half(x);
  const f = l.floor(x);
  const b = l.belt(x);
  const t = l.top(x);
  // Over a wheel the sill and the lower door are squeezed into the lip of the arch.
  const k = clamp((b - 0.14 - f) / Math.max(0.05, b - 0.14 - s.yFloor), 0.25, 1);
  const mid = Math.max(f + 0.2 * k + 0.02, f + 0.45 * (b - f));
  // Over a wheel the edge turns in by only 2 cm (a thin flange, not a folded lip).
  const a = clamp((f - s.yFloor - 0.04) / 0.08, 0, 1);
  // The shoulder: fullest 8 cm under the belt line, with a small step in above it (the crease of a modern car).
  const crease = Math.max(mid + 0.02, b - 0.08);
  const p: V2[] = [
    [lerp(w * 0.86, w - 0.02, a), f],
    [w - 0.025 * (1 - a) - 0.006 * a, f + 0.07 * k],
    [w - 0.004, f + 0.2 * k],
    [w, mid],
    [w, crease],
    [w - 0.014, Math.min(b - 0.01, crease + 0.012)],
    [w - 0.035, b],
  ];
  const tall = s.glassTop !== undefined;
  if (t > b + 0.06) {
    const wr = w * s.tumble;
    if (tall) {
      // The window's top edge, the panel above it.
      const y = clamp(s.glassTop!, b + 0.02, t - 0.08);
      p.push([lerp(w - 0.03, wr + 0.02, (y - b) / Math.max(0.01, t - 0.06 - b)), y]);
    }
    p.push([wr + 0.02, t - 0.06], [wr - 0.05, t - 0.012], [0, t + 0.012]);
  } else {
    if (tall) p.push([w - 0.08, b + 0.008]);
    p.push([w - 0.13, b + 0.014], [w * 0.45, b + 0.03], [0, b + 0.036]);
  }
  return p;
}

/** Where the lamps, the light bar and the markings go. */
export interface CarSpots {
  /** Middles of the headlamps and the tail lamps. */
  head: P3[];
  tail: P3[];
  bar: P3;
  barWidth: number;
  /** Half the body's width, the nose and the tail (for decals and lamps). */
  half: number;
  nose: number;
  tail2: number;
  belt: number;
  floor: number;
  yNose: number;
}

export interface CarBuilders {
  /** Painted metal and plastic. */
  paint: MeshBuilder;
  /** Glass and everything dark and glossy. */
  glass: MeshBuilder;
  /** Tyres and unpainted plastic (rough, no clearcoat); without one they go with the paint. */
  plastic?: MeshBuilder;
}

/** A painted face of the body, in the car's own space, handed to cars.ts for the markings. `side`: always painted side-on (a rim). */
export interface Facet {
  p: P3[];
  n: P3[];
  side?: boolean;
}

/** The lamp groups that switch together (cars.ts keeps one state for each). */
export type LampGroup = 'head' | 'tail' | 'amber' | 'blueA' | 'blueB' | 'ledA' | 'ledB';

/** Where a lamp's faces go: a moving car's switchable lamp mesh. */
export interface LampSink {
  quad(a: P3, b: P3, c: P3, d: P3, n: P3, color: number, group: LampGroup): void;
}

export interface BodyOptions {
  lod?: Lod;
  /** Collects the painted faces (high detail only). */
  skin?: Facet[];
  /** Takes the lamps' faces; without one they are painted on in fixed colours. */
  lamps?: LampSink;
}

const rect = (x0: number, y0: number, x1: number, y1: number): V2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** A lamp's band along the nose (or tail) and round the corner: quads from the inner end outwards. */
function lampBand(s: Shape, l: Lines, lamp: Lamp, front: boolean, side: 1 | -1, emit: (a: P3, b: P3, c: P3, d: P3, n: P3) => void, from = 0, to = 1) {
  const bend = bendOf(s, l);
  const xe = front ? s.L / 2 : -s.L / 2;
  const dir = front ? 1 : -1;
  const zc = l.half(xe) - 0.01;
  const z0 = Math.min(lamp.z, zc - 0.02);
  // The path: across the end face, then back along the side.
  const path: [number, number][] = [];
  for (let i = 0; i <= 2; i++) path.push([xe, lerp(z0, zc, i / 2)]);
  for (let i = 1; i <= 3; i++) {
    const x = xe - dir * (lamp.wrap * i) / 3;
    path.push([x, l.half(x) + 0.006]);
  }
  const lens: number[] = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = lens[lens.length - 1];
  const yAt = (u: number): [number, number] => [lerp(lamp.y[0], lamp.yo[0], u), lerp(lamp.y[1], lamp.yo[1], u)];
  for (let i = 0; i < path.length - 1; i++) {
    const u0 = lens[i] / total;
    const u1 = lens[i + 1] / total;
    if (u1 <= from || u0 >= to) continue;
    const [x0, z0p] = path[i];
    const [x1, z1p] = path[i + 1];
    const [a0, b0] = yAt(u0);
    const [a1, b1] = yAt(u1);
    const tx = x1 - x0;
    const tz = z1p - z0p;
    const len = Math.hypot(tx, tz) || 1;
    // Outwards: across the end face that is along the car, on the side it is sideways.
    let nx = tz / len;
    let nz = -tx / len;
    if (nx * dir + nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    const xs = (x: number, y: number, z: number) => bend(x, y, z) + (x === xe ? dir * 0.006 : 0);
    emit([xs(x0, a0, z0p), a0, z0p * side], [xs(x1, a1, z1p), a1, z1p * side], [xs(x1, b1, z1p), b1, z1p * side], [xs(x0, b0, z0p), b0, z0p * side], [nx, 0, nz * side]);
  }
}

/** A lamp cut across into its upper part (the share `k` of its height) and the rest below. */
function split(lamp: Lamp, k: number): [Lamp, Lamp] {
  const cut = (a: readonly [number, number]) => a[1] - (a[1] - a[0]) * k;
  return [
    { ...lamp, y: [cut(lamp.y), lamp.y[1]], yo: [cut(lamp.yo), lamp.yo[1]] },
    { ...lamp, y: [lamp.y[0], cut(lamp.y)], yo: [lamp.yo[0], cut(lamp.yo)] },
  ];
}

/**
 * Join closed sections (each a ring of points in the same order) into a skin, and close the last one. Every face
 * is turned away from `mid`, a point inside the shape.
 */
function loft(into: MeshBuilder, sections: P3[][], color: Color, mid: P3, f?: Xf) {
  const out = (a: P3, b: P3, c: P3): P3 => [(a[0] + b[0] + c[0]) / 3 - mid[0], (a[1] + b[1] + c[1]) / 3 - mid[1], (a[2] + b[2] + c[2]) / 3 - mid[2]];
  for (let k = 0; k < sections.length - 1; k++) {
    const p = sections[k];
    const q = sections[k + 1];
    for (let i = 0; i < p.length; i++) {
      const j = (i + 1) % p.length;
      into.quadAt(p[i], p[j], q[j], q[i], color, out(p[i], q[j], p[j]), f);
    }
  }
  const last = sections[sections.length - 1];
  const c: P3 = [0, 1, 2].map((a) => last.reduce((s, v) => s + v[a], 0) / last.length) as unknown as P3;
  for (let i = 0; i < last.length; i++) {
    const a = last[i];
    const b = last[(i + 1) % last.length];
    const n = out(a, b, c);
    const u = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
    const v = [b[0] - c[0], b[1] - c[1], b[2] - c[2]];
    const facing = (u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2];
    if (facing > 0) into.triAt(c, a, b, color, f);
    else into.triAt(c, b, a, color, f);
  }
}

/**
 * One door mirror: the housing a rounded teardrop, narrower at the car and full at its outer end, its glass facing
 * back; under it a short black arm onto a black triangular sail at the foot of the A-pillar.
 */
function mirror(mb: CarBuilders, s: Shape, l: Lines, side: 1 | -1, color: Color, black: Color, glass: Color, van: boolean, f?: Xf) {
  const x1 = s.xCowl - (van ? 0.1 : 0.09);
  const depth = van ? 0.12 : 0.1;
  const x0 = x1 - depth;
  const yb = l.belt(x1) + (van ? 0.06 : 0.015);
  const h = van ? 0.3 : 0.13;
  const zb = l.half(x1) - 0.035;
  const reach = van ? 0.24 : 0.2;
  // The housing's cross-section seen from the side: flat at the back (the glass), rounded at the front.
  const prof: V2[] = [[x0, yb], [x1 - 0.035, yb], [x1 - 0.008, yb + h * 0.22], [x1, yb + h * 0.5], [x1 - 0.008, yb + h * 0.78], [x1 - 0.035, yb + h], [x0, yb + h]];
  const cx = x0 + depth * 0.35;
  const cy = yb + h / 2;
  const at = (k: number, d: number): P3[] => prof.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k, side * (zb + d)] as P3);
  const sections = [at(0.55, 0.05), at(0.92, reach * 0.55), at(1, reach - 0.02), at(0.86, reach)];
  loft(mb.paint, sections, color, [cx, cy, side * (zb + reach * 0.5)], f);
  // The glass on its back, and the arm and the sail.
  const zg0 = side * (zb + 0.07);
  const zg1 = side * (zb + reach - 0.025);
  mb.glass.quadAt([x0 - 0.003, yb + 0.015, zg0], [x0 - 0.003, yb + 0.015, zg1], [x0 - 0.003, yb + h - 0.015, zg1], [x0 - 0.003, yb + h - 0.015, zg0], glass, [-1, 0, 0], f);
  mb.glass.prism(rect(x0 + 0.015, yb - 0.01, x0 + 0.06, yb + 0.04), side * (zb - 0.01), side * (zb + 0.07), black, f);
  const xs = s.xCowl - 0.01;
  mb.glass.prism([[xs - 0.13, l.belt(xs - 0.13) - 0.005], [xs, l.belt(xs) - 0.005], [xs - 0.01, l.belt(xs) + 0.11]], side * (l.half(xs) - 0.04), side * (l.half(xs) - 0.018), black, f);
}

/** Which plain front a car wears (the same pick as the painted one in cars.ts): 0 to 2, by its plate or paint. */
export function noseVariant(look: CarLook): number {
  let h = look.color;
  for (const ch of look.plate ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 3;
}

/** Draw a car's body with everything fixed to it. Returns where its lamps and its light bar go. */
export function drawBody(mb: CarBuilders, look: CarLook, f?: Xf, opts: BodyOptions = {}): CarSpots {
  const s = shapeOf(look);
  const l = linesOf(s);
  const high = opts.lod === 'high';
  const nose = s.L / 2;
  const tail = -s.L / 2;
  const paint = shade(look.color);
  const sill = mix(look.color, GRIME, 0.16);
  const glass = shade(GLASS);
  const dark = shade(DARK);
  const trim = shade(TRIM);
  const skin = high ? opts.skin : undefined;
  const plastic = mb.plastic ?? mb.paint;

  // Stations along the car: closer together where the shape turns, round each wheel, and a pair for each pillar.
  const xs = new Set<number>();
  const add = (...v: number[]) => v.forEach((x) => xs.add(Math.round(clamp(x, tail, nose) * 1000) / 1000));
  add(tail, tail + 0.012, tail + 0.05, tail + 0.16, s.xDeck - 0.03, s.xDeck + 0.03, (s.xDeck + s.xRoofR) / 2, s.xRoofR - 0.02, s.xRoofR + 0.05);
  add((s.xRoofR + s.xRoofF) / 2, s.xRoofF - 0.05, s.xRoofF + 0.02, lerp(s.xRoofF, s.xCowl, 0.4), s.xCowl - 0.03, s.xCowl + 0.03);
  add(lerp(s.xCowl, s.xHood, 0.5), s.xHood, lerp(s.xHood, nose, 0.55), nose - 0.1, nose - 0.04, nose - 0.012, nose);
  add(s.glassTo - 0.01, s.glassTo + 0.01);
  if (high) add(lerp(s.xRoofF, s.xCowl, 0.75), nose - 0.22, tail + 0.08, (s.xRoofR + s.xRoofF) / 2 + 0.5, (s.xRoofR + s.xRoofF) / 2 - 0.5);
  // Stations round each arch: about 24 steps round its half circle on a moving car.
  const archAt = high ? [1.0, 0.97, 0.87, 0.71, 0.5, 0.26, 0] : [1.0, 0.7, 0];
  for (const ax of [s.xf, s.xr]) {
    add(ax - l.arch - 0.012, ax + l.arch + 0.012);
    for (const k of archAt) add(ax - l.arch * k, ax + l.arch * k);
  }
  s.pillars.forEach((p, i) => add(p - s.pillarW[i], p + s.pillarW[i]));
  const stations = [...xs].sort((a, b) => a - b);
  const rings = stations.map((x) => ring(s, l, x));
  const RING = rings[0].length;

  // A normal at every point of the skin, from its neighbours along and around the body.
  const bend = bendOf(s, l);
  const at3 = (i: number, j: number, side: number): P3 => [bend(stations[i], rings[i][j][1], rings[i][j][0]), rings[i][j][1], rings[i][j][0] * side];
  const normalAt = (i: number, j: number, side: number): P3 => {
    const a = at3(Math.max(0, i - 1), j, side);
    const b = at3(Math.min(stations.length - 1, i + 1), j, side);
    const c = at3(i, Math.max(0, j - 1), side);
    const d = at3(i, Math.min(RING - 1, j + 1), side);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - c[0];
    const vy = d[1] - c[1];
    const vz = d[2] - c[2];
    // Along the car, then up round the right side: their cross points out of the body on the right, into it on the left.
    const nx = (uy * vz - uz * vy) * side;
    const ny = (uz * vx - ux * vz) * side;
    const nz = (ux * vy - uy * vx) * side;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  };
  const pillarAt = (x: number) => s.pillars.findIndex((p, i) => Math.abs(x - p) < s.pillarW[i]);
  const nearArch = (x: number) => Math.abs(x - s.xf) < l.arch + 0.1 || Math.abs(x - s.xr) < l.arch + 0.1;
  for (let i = 0; i < stations.length - 1; i++) {
    const x = (stations[i] + stations[i + 1]) / 2;
    const cabin = l.top(x) > l.belt(x) + 0.06;
    for (let j = high ? 0 : 1; j < RING - 1; j++) {
      let color: Color = paint;
      let into = mb.paint;
      let painted = true;
      if (j === 0) {
        // The rocker's underside: body colour gone a little grimy (black plastic on an SUV), not a black slab.
        color = s.cladding ? trim : sill;
        painted = false;
      } else if (j === 1) color = s.cladding ? trim : l.floor(x) < s.yFloor + 0.04 ? sill : paint;
      else if (j === 2 && s.cladding && nearArch(x)) color = trim;
      else if (j === 6 && cabin && x > s.glassTo && x < s.xCowl - 0.02) {
        const pi = pillarAt(x);
        if (pi < 0 || (pi === 0 && s.blackB)) {
          color = pi < 0 ? glass : trim;
          into = mb.glass;
          painted = false;
        }
      } else if (j === RING - 2 && cabin) {
        const screen = x > s.xRoofF + 0.02 && x < s.xCowl - 0.03 && l.top(x) < (s.glassTop ?? Infinity) + 0.1;
        const rear = !s.blind && x > s.xDeck + 0.03 && x < s.xRoofR - 0.02;
        if (screen || rear) {
          color = glass;
          into = mb.glass;
          painted = false;
        }
      }
      if (color === trim && into === mb.paint) {
        painted = false;
        into = plastic;
      }
      for (const side of [1, -1]) {
        const pts: [P3, P3, P3, P3] = [at3(i, j, side), at3(i + 1, j, side), at3(i + 1, j + 1, side), at3(i, j + 1, side)];
        const ns: [P3, P3, P3, P3] = [normalAt(i, j, side), normalAt(i + 1, j, side), normalAt(i + 1, j + 1, side), normalAt(i, j + 1, side)];
        into.smoothQuad(pts, ns, color, f);
        if (painted && skin) skin.push({ p: pts, n: ns });
      }
    }
  }
  // The nose and the tail are closed: a fan out to a ring halfway, then a band to the skin's edge, all of it on the
  // same leaning, rounded face the bend gives the skin there (so that lamps and panels sit on it).
  for (const end of [0, stations.length - 1]) {
    const x = stations[end];
    const r = rings[end];
    const d = end > 0 ? 1 : -1;
    const n: P3 = [d, 0, 0];
    const ym = (r[0][1] + r[RING - 1][1]) / 2;
    const mid: P3 = [bend(x, ym, 0) - d * 0.004, ym, 0];
    const inner = (j: number, side: number): P3 => {
      const y = (ym + r[j][1]) / 2;
      const z = r[j][0] / 2;
      return [bend(x, y, z) - d * 0.002, y, z * side];
    };
    const tri = (a: P3, b: P3, c: P3) => {
      const k = ((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])) * d;
      const [p, q] = k > 0 ? [b, c] : [c, b];
      mb.paint.triAt(a, p, q, paint, f);
      if (skin) skin.push({ p: [a, p, q], n: [n, n, n] });
    };
    for (let j = 0; j < RING - 1; j++) {
      for (const side of [1, -1]) {
        const i0 = inner(j, side);
        const i1 = inner(j + 1, side);
        tri(mid, i0, i1);
        tri(i0, at3(end, j, side), at3(end, j + 1, side));
        tri(i0, at3(end, j + 1, side), i1);
      }
    }
    tri(mid, inner(0, 1), inner(0, -1));
    tri(inner(0, 1), at3(end, 0, 1), at3(end, 0, -1));
    tri(inner(0, 1), at3(end, 0, -1), inner(0, -1));
  }

  const w0 = s.W / 2;
  const fl = s.yFloor;
  // Panels stand clear of the rounded end's skin.
  const front = nose + 0.016;
  const back = tail - 0.016;
  // A flat panel on the nose or the tail, following the skin as it leans and rounds there.
  const face = (x: number, z0: number, z1: number, y0: number, y1: number, c: Color, into: MeshBuilder) => {
    const d = x > 0 ? 1 : -1;
    const e = d > 0 ? nose : tail;
    const at = (y: number, z: number): P3 => [bend(e, y, z) + (x - e), y, z];
    // In strips no wider than 0.3 m, so that the panel follows the face's curve across.
    const k = Math.max(1, Math.ceil(Math.abs(z1 - z0) / 0.3));
    for (let i = 0; i < k; i++) {
      const za = lerp(z0, z1, i / k);
      const zb = lerp(z0, z1, (i + 1) / k);
      into.quadAt(at(y0, za), at(y0, zb), at(y1, zb), at(y1, za), c, [d, 0, 0], f);
    }
  };
  if (!high) {
    // Grille, the air intake under it and the number plates (a moving car has them painted on, cars.ts).
    const yN = s.yNose;
    const v = s.face === 'plain' ? noseVariant(look) : -1;
    if (v === 1) face(front, -0.34, 0.34, yN - 0.3, yN - 0.03, dark, mb.glass);
    else if (v === 0 || s.face === 'vw' || s.face === 'vwvan') face(front, -0.43, 0.43, yN - 0.1, yN - 0.035, dark, mb.glass);
    else if (v === 2) face(front, -0.28, 0.28, yN - 0.09, yN - 0.02, dark, mb.glass);
    else face(front, -0.4, 0.4, yN - 0.2, yN - 0.01, dark, mb.glass);
    face(front, -0.6, 0.6, fl + 0.08, fl + (v === 2 ? 0.3 : 0.2), dark, mb.glass);
    face(front + 0.003, -0.26, 0.26, fl + 0.27, fl + 0.38, shade(0xe8e8e2), mb.paint);
    face(back, -0.26, 0.26, Math.min(s.yTail - 0.29, fl + 0.85) - 0.11, Math.min(s.yTail - 0.29, fl + 0.85), shade(0xe8e8e2), mb.paint);
    face(back, -0.66, 0.66, fl + 0.1, fl + 0.26, dark, mb.glass);
  }

  // Wheels: the tread, a rounded shoulder, a sidewall 0.10 m deep and the rim set 3 cm back into it behind a
  // short silver lip; inside the arch a black liner following its curve, 0.10 m in from the body's side.
  const n = high ? 24 : 10;
  const R = s.wheel;
  const rimR = R - 0.1;
  const tyre = shade(0x1c1c1c);
  const wall = shade(0x202022);
  const rim = shade(look.livery === 'none' && (look.color & 0xff) < 0x40 ? 0x8f9296 : 0xc9ccd0);
  const liner = shade(0x0e0e0e);
  for (const ax of [s.xf, s.xr]) {
    for (const side of [1, -1]) {
      const zo = side * (w0 - 0.03);
      const zs = zo - side * 0.03;
      const zi = side * (w0 - 0.25);
      const zd = zo - side * 0.03;
      const pt = (a: number, r: number, z: number): P3 => [ax + Math.cos(a) * r, R + Math.sin(a) * r, z];
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2;
        const a1 = ((k + 1) / n) * Math.PI * 2;
        const am = (a0 + a1) / 2;
        const out: P3 = [Math.cos(am), Math.sin(am), 0];
        plastic.quadAt(pt(a0, R, zi), pt(a1, R, zi), pt(a1, R, zs), pt(a0, R, zs), tyre, out, f);
        plastic.quadAt(pt(a0, R, zs), pt(a1, R, zs), pt(a1, R - 0.03, zo), pt(a0, R - 0.03, zo), tyre, [out[0] * 0.7, out[1] * 0.7, side * 0.7], f);
        plastic.quadAt(pt(a0, rimR, zo), pt(a1, rimR, zo), pt(a1, R - 0.03, zo), pt(a0, R - 0.03, zo), wall, [0, 0, side], f);
        if (high) mb.paint.quadAt(pt(a0, rimR, zo), pt(a1, rimR, zo), pt(a1, rimR, zd), pt(a0, rimR, zd), rim, [-out[0], -out[1], 0], f);
        const zf = high ? zd : zo + side * 0.004;
        const c: P3 = [ax, R, zf];
        const r0 = pt(a0, rimR, zf);
        const r1 = pt(a1, rimR, zf);
        if (skin) skin.push({ p: side > 0 ? [c, r0, r1] : [c, r1, r0], n: [[0, 0, side], [0, 0, side], [0, 0, side]], side: true });
        else (side > 0 ? mb.paint.triAt(c, r0, r1, rim, f) : mb.paint.triAt(c, r1, r0, rim, f));
      }
      // The arch's liner, and a wall behind it so that nobody looks through the car.
      const m = high ? 12 : 6;
      const lr = l.arch - 0.004;
      const zl = side * (w0 - 0.32);
      const zr = side * (w0 - 0.1);
      for (let k = 0; k < m; k++) {
        const a0 = (k / m) * Math.PI;
        const a1 = ((k + 1) / m) * Math.PI;
        const am = (a0 + a1) / 2;
        mb.glass.quadAt(pt(a0, lr, zl), pt(a1, lr, zl), pt(a1, lr, zr), pt(a0, lr, zr), liner, [-Math.cos(am), -Math.sin(am), 0], f);
      }
      mb.glass.quadAt([ax - lr * 0.97, R + 0.03, zl], [ax + lr * 0.97, R + 0.03, zl], [ax + lr * 0.7, R + lr * 0.7, zl], [ax - lr * 0.7, R + lr * 0.7, zl], liner, [0, 0, side], f);
    }
  }

  // Door mirrors: a compact housing on a black sail at the front corner of the side window, its foot at the belt
  // line. Blue on the patrol Škodas (Superb 3777, 2023), white on the ID.4, black on the community Kodiaq and on
  // every van, the body's colour on other cars.
  const van = s.H > 1.85;
  const police = look.livery === 'police';
  const mirrorColor = van
    ? trim
    : police
      ? look.marks === 'local'
        ? trim
        : look.model === 'id4'
          ? paint
          : shade(0x2163b5)
      : paint;
  for (const side of [1, -1] as const) {
    mirror(mb, s, l, side, mirrorColor, trim, glass, van, f);
    if (!high) {
      // The lines between the doors (a moving car has them painted on).
      for (const dx of s.doors) {
        const z = side * (l.half(dx) + 0.002);
        mb.glass.quadAt([dx - 0.006, l.floor(dx) + 0.08, z], [dx + 0.006, l.floor(dx) + 0.08, z], [dx + 0.006, l.belt(dx) - 0.03, z], [dx - 0.006, l.belt(dx) - 0.03, z], dark, [0, 0, side], f);
      }
    }
  }
  // Roof rails along both edges of the roof.
  if (s.rails) {
    const x0 = s.xRoofF + 0.2;
    const x1 = s.xRoofR + 0.08;
    const profile: V2[] = [];
    const steps = high ? 5 : 2;
    for (let k = 0; k <= steps; k++) {
      const x = lerp(x1, x0, k / steps);
      profile.push([x, l.top(x) - 0.01]);
    }
    for (let k = steps; k >= 0; k--) {
      const x = lerp(x1 + 0.05, x0 - 0.05, k / steps);
      profile.push([x, l.top(x) + 0.045]);
    }
    for (const side of [1, -1]) {
      const zr = l.half((x0 + x1) / 2) * s.tumble - 0.1;
      mb.glass.prism(profile, side * zr, side * (zr + 0.035), trim, f);
    }
  }

  // Lamp units: headlamps and tail lamps wrapping round the corners, indicators beside them.
  const sink: LampSink = opts.lamps ?? {
    quad: (a, b, c, d, nn, color) => mb.paint.quadAt(a, b, c, d, shade(color), nn, f),
  };
  for (const side of [1, -1] as const) {
    // The headlamp: a white LED line along its top, the silver reflector, a dark inner part along its lower edge.
    const [hLed, hRest] = split(s.head, 0.16);
    const [hSilver, hDark] = split(hRest, 0.55);
    lampBand(s, l, hLed, true, side, (a, b, c, d, nn) => sink.quad(a, b, c, d, nn, 0xf2f4f6, 'head'), 0, 0.84);
    lampBand(s, l, hSilver, true, side, (a, b, c, d, nn) => sink.quad(a, b, c, d, nn, 0x8c939b, 'head'), 0, 0.84);
    lampBand(s, l, hDark, true, side, (a, b, c, d, nn) => sink.quad(a, b, c, d, nn, 0x2a2f36, 'head'), 0, 0.84);
    lampBand(s, l, s.head, true, side, (a, b, c, d, nn) => sink.quad(a, b, c, d, nn, 0xc6c2ba, 'amber'), 0.84, 1);
    const [tUp, tLow] = split(s.tail, 0.55);
    lampBand(s, l, tUp, false, side, (a, b, c, d, nn) => sink.quad(a, b, c, d, nn, 0x9c1515, 'tail'));
    lampBand(s, l, tLow, false, side, (a, b, c, d, nn) => sink.quad(a, b, c, d, nn, 0x5a0c0e, 'tail'), 0.3, 1);
    lampBand(s, l, tLow, false, side, (a, b, c, d, nn) => sink.quad(a, b, c, d, nn, 0x6a4a2a, 'amber'), 0, 0.3);
  }

  // The light bar over the B-pillar, on the roof rails.
  const barX = van ? s.xRoofF - 0.32 : (s.pillars[0] ?? (s.xRoofF + s.xRoofR) / 2) + 0.08;
  const mid = (lamp: Lamp, x: number): P3 => [x, (lamp.y[0] + lamp.yo[1]) / 2, Math.min(lamp.z + 0.12, l.half(x) - 0.1)];
  const hm = mid(s.head, nose - 0.04);
  const tm = mid(s.tail, tail + 0.04);
  return {
    head: [hm, [hm[0], hm[1], -hm[2]]],
    tail: [tm, [tm[0], tm[1], -tm[2]]],
    bar: [barX, l.top(barX) + 0.065, 0],
    barWidth: van ? 1.42 : Math.min(1.22, 2 * l.half(barX) * s.tumble - 0.12),
    half: w0,
    nose,
    tail2: tail,
    belt: l.belt(0),
    floor: fl,
    yNose: s.yNose,
  };
}

/** Does this kind of body have a drawn shape here (lorries, buses and motorcycles are built from blocks)? */
export const lofted = (b: CarBody) => b !== 'truck' && b !== 'bus' && b !== 'moto';
