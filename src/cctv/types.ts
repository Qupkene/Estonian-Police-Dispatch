/**
 * What a camera scene is made of (docs/CCTV.md): the street around an incident as plain data in scene metres
 * (src/cctv/math.ts), read from the street map (tiles.ts) or made up when the map is not there (procedural.ts).
 * No DOM, no three.js: the renderer (src/cctv/render) only draws this.
 */
import type { LngLat, PlaceKind } from '@/sim/types';
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
  /** The map's points of interest inside the radius, when its archive has them (the game's own may have none). */
  pois?: Poi[];
  /** Where on the map the scene's origin is (a street read from the map): scene metres are east and north of it. */
  origin?: LngLat;
  /** The place the incident names, when the street was read or made for one (src/cctv/place.ts). */
  place?: PlaceHint;
}

/** What a street is told of the place its incident names: the site finds the place's own building and front from it. */
export interface PlaceHint {
  kind: PlaceKind;
  name: string | null;
  /** The place's own point in scene metres: the map's point of interest when it has one, else the point the incident gives. */
  at: V2;
  /** The door of the place's own building, when the street was read around it (tiles.ts readStreet): its wall is the front. */
  door?: V2;
}

/** A point of interest of the map near the scene (the archive's pois layer), in scene metres. */
export interface Poi {
  kind: string;
  name: string | null;
  pos: V2;
}

/** The place the incident names, as the picture is to show it. */
export interface SitePlace {
  kind: PlaceKind;
  /** The place's own name when the incident has one ("Olerex Tartu", "Selver"), for its board; else null. */
  name: string | null;
  /** The place's own building: its Building.id in street.buildings, or null when the place has none (a car park, a park, a road). */
  building: number | null;
  /**
   * The stretch of that building's wall that faces the scene (the camera sees it): its two ends on the ground and
   * the unit vector out of the wall. Null without a building.
   */
  front: { a: V2; b: V2; out: V2 } | null;
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
  /**
   * The door people come out of and the crew goes in by, if a building is near: on the nearest building's wall, or,
   * when that is more than 12 m from the spot, on the wall near the spot that the camera sees best.
   */
  door: V2 | null;
  /** The unit normal out of that wall. */
  doorOut: V2 | null;
  /** The building the door belongs to (index into street.buildings). */
  doorBuilding: number;
  camera: CameraPose;
  lamps: Lamp[];
  /**
   * The stretch of the drive line the camera sees, in metres along the line (as `drive.at`): around the scene's own
   * point, for as long both ways as the road's centre line is in the picture and not behind a house. Not set when
   * the camera does not see the road at the scene. Vehicles that stop inside it stop in the picture.
   */
  seen?: { from: number; to: number };
  /** The place the incident names (null: nothing of its own to show: an ordinary street, a road, a forest). */
  place: SitePlace | null;
}

/**
 * A car that stands parked in the street for the whole scene. The renderer decides which places are filled and draws
 * them (src/cctv/render/world.ts); the director is told (its `parked` option) and treats each as solid: no vehicle
 * stops in one, nobody stands in one or walks through one.
 */
export interface ParkedCar {
  /** The middle of the car on the ground. */
  pos: V2;
  /** The way its nose points (radians, as yawOf of its direction). */
  yaw: number;
  length: number;
  width: number;
}
