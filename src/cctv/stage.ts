/**
 * What passes between the parts of a camera (docs/CCTV.md). The situation is what the game says about an incident
 * right now (situation.ts reads it from the simulation); the director (director.ts) turns it into people and
 * vehicles on the street; a frame is where they all are at one moment, which the renderer (render/view.ts) draws.
 *
 * Types only: no DOM, no three.js, nothing of the game's state.
 */
import type { Agency, Gender, OutcomeResult, UnitType } from '@/sim/types';
import type { Look, Pose } from './figure';
import type { V2 } from './math';
import type { CarLights, CarLook } from './vehicle';

/** A crew, as the camera needs to know it. */
export interface UnitSit {
  id: string;
  type: UnitType;
  /** The vehicle as the unit's roster names it ("Škoda Octavia Combi"). */
  model: string;
  /** The crew's members (at most four are shown). */
  crew: Gender[];
  /**
   * 'coming': on its way, not in sight yet. 'near': it arrives within `eta` seconds of real time (the camera shows
   * it driving up). 'here': on scene. 'left': it was sent here and is not any more (released, sent on, in pursuit).
   */
  state: 'coming' | 'near' | 'here' | 'left';
  /** Real seconds until it arrives (only for 'near'). */
  eta: number;
  /** Where it comes from: the scene yaw of the direction from the incident towards the unit. */
  from: number;
  /** It leaves with somebody aboard: an arrested person, a patient, or somebody it drives home or to a station ('ride'). */
  takes: 'arrest' | 'hospital' | 'ride' | null;
}

/** Another service asked to the scene (an ambulance, the rescue service). */
export interface AgencySit {
  agency: Agency;
  state: 'coming' | 'near' | 'here';
  /** Real seconds until it arrives (only for 'near'). */
  eta: number;
}

/** What the game says about an incident right now. */
export interface Situation {
  /** The incident is closed. */
  closed: boolean;
  units: UnitSit[];
  agencies: AgencySit[];
  /** A vehicle pursuit: 'on' while it runs (the suspect's vehicle has driven off), 'over' after it. */
  pursuit: 'none' | 'on' | 'over';
  /** An area search is running (the crews look for somebody). */
  searching: boolean;
  /** How it ended, once it has. */
  outcome: { result: OutcomeResult; arrests: number; injuries: number } | null;
  /** How far the crews' work on scene is, 0..1. */
  progress: number;
  /** The game stands still: nothing on the street moves. */
  paused: boolean;
}

/** What somebody may hold in their right hand. */
export type Held = 'knife' | 'bat' | 'pistol';

export interface PersonFrame {
  id: string;
  look: Look;
  pos: V2;
  yaw: number;
  pose: Pose;
  /** 1 normally; smaller while going in at a door. */
  scale: number;
  /** A weapon in the right hand, while they have one. */
  held?: Held;
}

/**
 * A thing in the street that is neither a person nor a vehicle (render/props.ts draws them, a handful of triangles
 * each): a weapon somebody dropped, a stretcher, the sheet over somebody who died, a fire hose.
 */
export interface PropFrame {
  id: string;
  kind: Held | 'stretcher' | 'sheet' | 'hose';
  pos: V2;
  yaw: number;
  /**
   * A hose: the points it lies along on the ground from the lorry, then where it comes up off the ground, the hands
   * of the second of its crew, and the nozzle (the last two are held at the waist).
   */
  line?: V2[];
  /** A hose: what its water is played on (a point and its height in metres). */
  aim?: { at: V2; height: number };
  /** A sheet: the id of the person who lies under it. The picture shows the cloth and not them. */
  covers?: string;
}

export interface CarFrame {
  id: string;
  look: CarLook;
  pos: V2;
  yaw: number;
  lights: CarLights;
}

export interface Smoke {
  at: V2;
  /** Metres above the ground where it comes out. */
  height: number;
  /** 0..1. */
  strength: number;
}

export interface Frame {
  /** The scene's own clock in seconds (it stands while the game is paused). */
  t: number;
  people: PersonFrame[];
  cars: CarFrame[];
  smoke?: Smoke | null;
  /** Things lying or standing about (none: the field may be missing). */
  props?: PropFrame[];
}
