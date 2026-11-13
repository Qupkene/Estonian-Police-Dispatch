/**
 * What a camera scene is made of (docs/CCTV.md): the street around an incident as plain data in scene metres
 * (src/cctv/math.ts), read from the street map (tiles.ts) or made up when the map is not there (procedural.ts).
 * No DOM, no three.js: the renderer (src/cctv/render) only draws this.
 */
import type { V2 } from './math';

export type RoadClass =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'residential'
  | 'living'
  | 'service'
  /** A paved street or square for walking. */
  | 'pedestrian'
  /** Footways, cycle tracks, paths, steps. */
  | 'path'
  | 'rail'
  | 'tram';

/** Carriageway width in metres. */
export const ROAD_WIDTH: Record<RoadClass, number> = {
  motorway: 8.5,
  trunk: 8,
  primary: 7.5,
  secondary: 7,
  tertiary: 6.5,
  residential: 5.6,
  living: 4.6,
  service: 3.8,
  pedestrian: 5,
  path: 2.2,
  rail: 3.2,
  tram: 2.4,
};

/** Roads cars drive on (a patrol car arrives along one of these). */
export const CAR_ROADS: ReadonlySet<RoadClass> = new Set<RoadClass>([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'living',
  'service',
]);

export interface Road {
  cls: RoadClass;
  pts: V2[];
  width: number;
  /** 1: one way along the points, -1: against them, 0: both ways. */
  oneway: 0 | 1 | -1;
  /** Pavements along both sides (town streets). */
  walk: boolean;
  name?: string;
  bridge?: boolean;
  tunnel?: boolean;
}

export type RoofKind = 'flat' | 'gable';

export interface Building {
  /** The map's feature id, or a made-up one: seeds the wall colour and the lit windows. */
  id: number;
  /** Footprint, anticlockwise, not closed. */
  ring: V2[];
  /** Metres from the ground to the eaves (a flat roof: to the top). */
  height: number;
  /** Where the walls start (a building part held up on posts, a passage): metres above the ground. */
  base: number;
  /** Footprint area, m2. */
  area: number;
  roof: RoofKind;
  /** An open shelter (a petrol station's canopy, a bus stop): a roof on posts, no walls. */
  open?: boolean;
}

export type AreaKind =
  /** Lawn, park, verge. */
  | 'green'
  /** Trees. */
  | 'forest'
  | 'water'
  /** Squares, yards, forecourts. */
  | 'paved'
  /** A car park: paved, with parked cars. */
  | 'parking'
  | 'sand'
  /** A sports pitch or playground. */
  | 'pitch';

export interface Area {
  kind: AreaKind;
  ring: V2[];
}

export interface StreetData {
  /** 'tiles': the real streets from the street map. 'made': a made-up street (no map file, or nothing usable in it). */
  source: 'tiles' | 'made';
  /** How far from the origin the data reaches, metres. */
  radius: number;
  roads: Road[];
  buildings: Building[];
  areas: Area[];
}

/** A camera: where it hangs and what it looks at. Heights in metres above the ground. */
export interface CameraPose {
  pos: V2;
  height: number;
  target: V2;
  targetHeight: number;
  /** Vertical field of view, degrees. */
  fov: number;
  /** What it hangs on. */
  mount: 'pole' | 'wall';
}

/** A street lamp. */
export interface Lamp {
  pos: V2;
  height: number;
  /** Which way its arm reaches (towards the road). */
  yaw: number;
}

/** A place a vehicle can stop at, at the kerb. */
export interface Slot {
  pos: V2;
  yaw: number;
}

/** The line vehicles drive through the scene on, from end a to end b. */
export interface DriveLine {
  pts: V2[];
  length: number;
  width: number;
  cls: RoadClass;
  /** Distance along the line of the point nearest to the incident. */
  at: number;
  /** The line stops inside the scene (a dead end, a yard) rather than running out of it. */
  deadA: boolean;
  deadB: boolean;
  oneway: 0 | 1 | -1;
}

/** Everything about the place an incident's camera needs, worked out once (src/cctv/site.ts). */
export interface Site {
  street: StreetData;
  seed: number;
  /** Where it happens: on the pavement, the verge or the forecourt. */
  spot: V2;
  /** The point of the drive line nearest to the incident, and the direction of the line there (a to b). */
  roadSpot: V2;
  dir: V2;
  /** The side of the drive line the spot is on: 1 left (looking from a to b), -1 right. */
  side: 1 | -1;
  drive: DriveLine;
  /** Walking lines along both sides of the drive line (same direction as it). */
  walkLeft: V2[];
  walkRight: V2[];
  /** The door people come out of and the crew goes in by (the nearest building's wall), if a building is near. */
  door: V2 | null;
  /** The unit normal out of that wall. */
  doorOut: V2 | null;
  /** The building the door belongs to (index into street.buildings). */
  doorBuilding: number;
  camera: CameraPose;
  lamps: Lamp[];
}
