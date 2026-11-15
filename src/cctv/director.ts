/**
 * The director of a camera's picture (docs/CCTV.md section 8): it puts the incident's people and vehicles on the
 * street and moves them as the game's situation changes. A patrol car drives up with its blue lights, the officers
 * get out and walk to their posts, a fight stops, somebody runs, an arrest is walked to the car, the ambulance
 * comes, everyone leaves.
 *
 * Plain state stepped by `update`: no timers, no clock of its own, no randomness outside `rand(seed)`, no three.js,
 * no DOM. The same site, cast and situations give the same frames. Two clocks: the game decides what happens and
 * when it starts, the director plays each change at a natural pace in real seconds, so every change has to be safe
 * at any moment: a newer instruction replaces the older one, and whoever should be elsewhere walks or drives there.
 */
import type { Agency, Gender } from '@/sim/types';
import type { Cast, CastPerson, SceneKind } from './cast';
import { DOWN, PACE, STRIDE, lookOfCrew, lookOfStranger, mixPose, poseOf, type Act, type Gait, type Look, type Pose } from './figure';
import {
  angleDiff,
  clamp,
  cross,
  dirOf,
  dist,
  dot,
  hash01,
  hash32,
  lerp,
  lerp2,
  lerpAngle,
  lineLength,
  nearestOnLine,
  norm,
  pointAlong,
  pointInRing,
  rand,
  sliceLine,
  smooth,
  sub,
  wobble,
  type Rand,
  type V2,
} from './math';
import { clearLine, insideBuilding, onDrive, projectPoint } from './site';
import type { AgencySit, CarFrame, Frame, Held, PersonFrame, PropFrame, Situation, Smoke, UnitSit } from './stage';
import type { ParkedCar, RoadClass, Site } from './types';
import { CAR_SIZE, hasBeacons, lookOfAgency, lookOfAnyCar, lookOfUnit, type CarLook, type CarSize } from './vehicle';

export type Phase = 'open' | 'seen' | 'contact' | 'closing' | 'after';

const RANK: Record<Phase, number> = { open: 0, seen: 1, contact: 2, closing: 3, after: 4 };
const TAU = Math.PI * 2;
/** Seconds a pose takes to blend into the next act. */
const BLEND_S = 0.3;
/** A body turns no faster than this, rad/s. */
const TURN = 7;
/** Somebody walking away is out of the picture this far from the spot. */
const OUT_M = 60;
/** Opening a camera runs the scene forward this long, in steps of this. */
const SETTLE_S = 90;
const SETTLE_DT = 0.2;
/** The scene runs in steps of this, whatever the frame rate: seconds, and the same in microseconds (whole numbers add up exactly). */
const STEP_S = 0.1;
const STEP_US = 100_000;
/** The crews wait this long at most, from the outcome on, for the closing scene before they leave. */
const HOLD_S = 14;
/**
 * The police stay, and stay out of their car, while a wreck is still to be moved to the kerb: for this long after
 * the end at most.
 */
const WRECK_HOLD_S = 55;
/** Roads narrower than this have one lane. */
const NARROW_M = 5.4;
/** An armed suspect paces this far to either side of their place. */
const PACE_M = 1;
/** A vehicle moves sideways at about this speed, m/s, when it changes its lane. */
const SIDE_V = 1.2;
/** The width of road a vehicle needs to get through between two that stand at opposite kerbs. */
const PASS_M = 3.5;
/** Passing something that stands in the road, a vehicle keeps this far from it. */
const BERTH_M = 0.8;
/** The length of the longest vehicle that may have to get through between two that stand at opposite kerbs. */
const LONGEST_M = 8.5;
/** The speed, m/s, at which a vehicle creeps out round what stands before it. */
const CREEP_V = 1.6;
/** A stopping place keeps this much room to the vehicles standing before and behind it: enough to pull out forwards. */
const ROOM_M = 5;
/** A vehicle that cannot get on for this long goes on regardless, slowly (nobody waits in the road for ever). */
const STUCK_S = 8;
/** Seconds a car takes to turn round where it stands. */
const UTURN_S = 3.4;
/** People keep this far from each other's middles when they pass, and wait no longer than STALL_S for room. */
const NEAR_M = 0.6;
const STALL_S = 1.6;
/** Nobody stands or walks nearer than this to a car parked in the street, and no walking line is planned nearer than CORNER_M. */
const PARK_BERTH = 0.4;
const CORNER_M = 0.6;
/** A vehicle of the scene stops no nearer than this to a car parked in the street: before and behind it, and beside it (room for a door). */
const PARK_GAP = 0.8;
const PARK_SIDE = 1.2;
/** The free kerb a vehicle needs behind its place, after a parked car, to swing in. */
const PARK_IN = 2.6;
/** A vehicle that stops in the lane beside parked cars leaves this much of the road free. */
const PASS_FREE = 3;
/** The usual distance, metres along the road, from the scene to where a crew stops; nearer than MIN_STOP_M nobody stops. */
const STOP_M = 5.5;
/** A crew that is on scene by the game's word and still kept from its place after this long stops where it is. */
const LATE_S = 8;
/** A road narrower than this has no kerb to pull in to: a vehicle stands on its middle. */
const KERB_MIN_M = 3.3;
const MIN_STOP_M = 4;
/** Roads with traffic passing through. */
const BUSY: Partial<Record<RoadClass, readonly [number, number]>> = {
  motorway: [6, 10],
  trunk: [6, 10],
  primary: [6, 11],
  secondary: [9, 16],
  tertiary: [14, 25],
};

type Step =
  | { k: 'go'; x: number; y: number; gait: Gait }
  | { k: 'act'; act: Act; t: number; face: V2 | null; on: boolean; ease: number }
  | { k: 'wait'; t: number }
  /** Moved to a point in `t` seconds without walking: half in a car door, on a stretcher. */
  | { k: 'slide'; x: number; y: number; t: number }
  /**
   * Kept at somebody's side while they walk (an officer with the cuffed in hand: behind them and half a step to
   * the right, or on their other side with `side` -1), until they have arrived. `stuck`: seconds kept from it.
   */
  | { k: 'follow'; of: Body; side: 1 | -1; stuck: number }
  | { k: 'door'; out: boolean; t: number; on: boolean }
  | { k: 'hide' }
  | { k: 'show' }
  | { k: 'gone' }
  | { k: 'call'; fn: () => void };

const dirYaw = (d: V2) => Math.atan2(d[1], d[0]);

const go = (p: V2, gait: Gait): Step => ({ k: 'go', x: p[0], y: p[1], gait });
const slide = (p: V2, t: number): Step => ({ k: 'slide', x: p[0], y: p[1], t });
/** An act, held for `t` seconds before the next step (0: set and go on; it stays until another act replaces it). */
const act = (a: Act, t = 0, face: V2 | null = null, ease = 0): Step => ({ k: 'act', act: a, t, face, on: false, ease });
const wait = (t: number): Step => ({ k: 'wait', t });
const call = (fn: () => void): Step => ({ k: 'call', fn });

interface Body {
  id: string;
  look: Look;
  seed: number;
  /** Whose it is: the incident's own people, a crew, somebody passing. */
  kind: 'cast' | 'police' | 'crew' | 'passer';
  role: CastPerson['role'] | 'crew';
  x: number;
  y: number;
  yaw: number;
  act: Act;
  actT: number;
  gait: Gait | null;
  phase: number;
  /** The pose it was in at the last change, how long ago that was and how long the change takes: the picture blends. */
  from: Pose | null;
  blend: number;
  blendS: number;
  /** The next change of pose takes this long instead of the usual (getting up out of a car). */
  ease: number;
  /** Its own walking speed, a little off everybody else's (0.9 to 1.1). */
  pace: number;
  /** Where its head is turned (radians off its body), following what it looks at. */
  head: number;
  /** Seconds until it next shifts where it stands; whether it is doing so now (such steps are no orders). */
  idleT: number;
  fidget: boolean;
  /** Seconds it has been kept from walking on by somebody in its way. */
  stall: number;
  steps: Step[];
  /** What it faces while it stands. */
  face: V2 | null;
  /** Where it belongs: free-running motion (a fight, pacing) comes back here. */
  mark: V2;
  hidden: boolean;
  gone: boolean;
  scale: number;
  /** Behind the door (or round the corner), in a vehicle. */
  inside: boolean;
  aboard: boolean;
  /** Busy with the closing scene: its crew waits for it. */
  duty: boolean;
  leaving: boolean;
  /** Lies in the carriageway. */
  inRoad: boolean;
  post: Post | null;
  crew: Crew | null;
  /** The cuffed it leads to its car. */
  wards: Body[];
  /** The officer who has them in hand on the way to the car: they do not walk on without that officer. */
  keeper: Body | null;
  /** The weapon in its hand, while it has one. */
  held: Held | null;
  /** Its hands are cuffed (it was cuffed where it knelt or lay): an arrest goes on from there. */
  cuffed: boolean;
  /** Where it was a step ago, and whether it was in sight: the picture is drawn between the two. */
  wx: number;
  wy: number;
  wyaw: number;
  wphase: number;
  wseen: boolean;
}

interface Post {
  at: V2;
  face: V2 | null;
  act: Act;
  /** Go in at the door instead of standing. */
  enter: boolean;
  by: Body | null;
  /** Whom the place is for: when they have gone, nobody stays kneeling or talking beside an empty spot. */
  of: Body | null;
}

interface Car {
  id: string;
  look: CarLook;
  size: CarSize;
  kind: 'unit' | 'agency' | 'cast' | 'traffic';
  /** Metres along the drive line, metres to its left, and which way it points along it. */
  s: number;
  lat: number;
  dir: 1 | -1;
  v: number;
  /** Turned away from the road's direction (a wreck, a car turning round), and the swing of a lane change. */
  yawOff: number;
  steer: number;
  mode: 'park' | 'drive' | 'turn' | 'gone';
  ts: number;
  tlat: number;
  /** It stops at `ts` (else it drives off the end). */
  stop: boolean;
  vc: number;
  acc: number;
  brake: number;
  /** Seconds until it stops. */
  eta: number;
  turnT: number;
  turnFrom: number;
  turnTo: number;
  beacons: boolean;
  lamps: boolean;
  hazard: boolean;
  braking: boolean;
  /** A crashed vehicle standing in the carriageway. */
  wreck: boolean;
  /** Metres it still backs off before it drives on (a wreck coming free of the other one). */
  back: number;
  /** Seconds it has stood behind something in its way. */
  wait: number;
  /** How often it has backed off to come again for its place at the kerb. */
  shunts: number;
  /** Who is on their way to get in: it does not leave without them. */
  due: Body[];
  x: number;
  y: number;
  yaw: number;
  riders: Body[];
  /** Where it was a step ago, and whether it was in the picture. */
  wx: number;
  wy: number;
  wyaw: number;
  wseen: boolean;
}

interface Crew {
  key: string;
  car: Car;
  people: Body[];
  police: boolean;
  agency: Agency | null;
  state: 'arriving' | 'here' | 'boarding' | 'leaving';
  /** How many have got out. */
  out: number;
  clock: number;
  wantLeave: boolean;
  /** Told to leave before it stopped where the road ends ahead: it stops, turns round and goes, nobody gets out. */
  through: boolean;
  takes: UnitSit['takes'];
  run: boolean;
  /** The game has said it is on scene: nobody gets out of the car before that. */
  arrived: boolean;
  /** When the game said so while it was still driving up (0: not yet), and whether it has given up its place for a nearer one. */
  hereT: number;
  short: boolean;
}

/**
 * Something solid that stands in the street: a parked car of the street itself (types.ts ParkedCar), or a standing
 * vehicle of the scene. Its middle, its heading as cosine and sine, and half its length and width.
 */
interface Box {
  x: number;
  y: number;
  co: number;
  si: number;
  hl: number;
  hw: number;
  /** How near to it a walking line may pass. */
  berth: number;
}

/** A car parked in the street, with its place and reach in the drive line's frame (as a vehicle's `s`, `lat` and `ext`). */
interface Parked extends Box {
  s: number;
  lat: number;
  el: number;
  ew: number;
}

interface Pair {
  a: Body;
  b: Body;
  home: V2;
  seed: number;
  t: number;
  next: number;
  grip: boolean;
  d: number;
  /** Stays nearly on the spot (one of them is about to fall). */
  still: boolean;
}

/** Somebody going to and fro about their mark: an armed suspect pacing, a drunk staggering. */
interface Wander {
  b: Body;
  axis: V2;
  amp: number;
  rate: number;
  gait: Gait;
  rest: Act;
}

/** Somebody in the carriageway, in the drive line's frame. */
interface RoadBody {
  b: Body;
  s: number;
  lat: number;
  still: boolean;
  /** Walking along the road at its edge, not across it or out into it: a vehicle passes them with a small berth. */
  along: boolean;
}

interface Timer {
  t: number;
  fn: () => void;
  /** Part of the scene before its end (a fall, a surrender): dropped when the closing scene starts. */
  scene: boolean;
  /** A beat of the story somebody should see: it does not run down while the stage settles before the first picture. */
  live?: boolean;
}

export class Director {
  /** Where the story is. */
  phase: Phase = 'open';

  private readonly site: Site;
  private readonly cast: Cast;
  private readonly night: boolean;
  private readonly quiet: boolean;
  private readonly wet: boolean;
  /** The kind played: a theft whose thieves have gone is a door and a caller. */
  private readonly kind: SceneKind;
  private readonly r: Rand;
  private readonly amb: Rand;
  /** Along the road (a to b), and from the road towards the spot. */
  private readonly u: V2;
  private readonly n: V2;
  /** The spot's distance from the kerb. */
  private readonly kerbD: number;
  private readonly width: number;
  private readonly length: number;
  private readonly at: number;
  /** Where "inside" is: before the door, or round the corner when no door is in sight. */
  private readonly inPoint: V2;
  private readonly hasDoor: boolean;
  private readonly hubs: V2[];
  /** The cars parked in the street (the renderer's own): solid for everybody. */
  private readonly parked: Parked[];
  /** Those of them that stand at the road itself: the ones a vehicle has to mind. */
  private readonly kerbCars: Parked[];
  /** Where the parked cars alone shut the road for a vehicle of a width (pinches). */
  private readonly parkedShut = new Map<number, number[]>();
  /** The walking lines of both sides of the road, moved off the cars parked at the kerb. */
  private readonly walkL: V2[];
  private readonly walkR: V2[];
  /** The drive line ends at a house at this end (it was cut there): no vehicle comes from behind the wall. */
  private readonly wallA: boolean;
  private readonly wallB: boolean;

  private t = 0;
  /** Microseconds the scene is ahead of the picture: less than a step. */
  private ahead = 0;
  private started = false;
  /** The stage is being run forward before the first picture (update's first call). */
  private settling = false;
  private sit: Situation | null = null;
  private tickNo = 0;
  private bodies: Body[] = [];
  private cars: Car[] = [];
  private crews: Crew[] = [];
  private crewBy = new Map<string, Crew>();
  /** Other services that have come and gone: they do not come twice. */
  private done = new Set<string>();
  private live = new Map<string, number>();
  /** When a vehicle that found no way in may look again. */
  private tryAt = new Map<string, number>();
  private posts: Post[] = [];
  private pairs: Pair[] = [];
  private wanders: Wander[] = [];
  private timers: Timer[] = [];
  /** Who is in the carriageway in this step (worked out when a moving vehicle first asks). */
  private road: RoadBody[] | null = null;
  private smoke: { at: V2; height: number; strength: number } | null = null;

  /** What whoever looks on is looking at just now: the fight, the weapon, the car that drives up. */
  private focus: V2 = [0, 0];
  /** Things lying in the street (a weapon somebody dropped, a sheet). */
  private props: PropFrame[] = [];
  /** The ambulance's stretcher while it is out: who pushes it, and who lies on it. */
  private stretcher: { by: Body; load: Body | null; stands: { pos: V2; yaw: number } | null } | null = null;
  /** The fire hose while it is out: the lorry it comes from and who holds its nozzle. */
  private hose: { car: Car; by: Body; mate: Body | null } | null = null;
  /** Where nobody but the police goes: within `r` metres of where somebody armed stands. */
  private keepOut: { at: V2; r: number } | null = null;
  /** The officer who has the suspect they cuffed in the street. */
  private holder: Body | null = null;
  /** Who is still to be arrested when an officer is free. */
  private toArrest: Body[] = [];
  /** How many wrecks are still to be moved out of the road. */
  private toClear = 0;
  /** Somebody is at the wreck's door and the clock runs for getting whoever is inside out. */
  private freeing = false;
  private contact = false;
  /** The fights have been broken up (by the police coming close). */
  private broken = false;
  private seenT = 0;
  /** The outcome is known; its scene is being played; it has been played. */
  private over = false;
  private overT = 0;
  private playing = false;
  private played = false;
  private playT = 0;
  private playMin = 0;
  private fled = false;
  /** The way the suspect's vehicle made off, once it has. */
  private fleeDir: 1 | -1 | 0 = 0;
  private runner: Body | null = null;
  /** An officer has run after whoever made off as the police came. */
  private chased = false;
  private patient: Body | null = null;
  /** Somebody shut in a wreck, until they are got out. */
  private trapped: { b: Body; car: Car } | null = null;
  /** Somebody lies dead where they fell: the pavement around them is closed until the last crew has gone. */
  private cordon = false;
  /** Who lies dead there: they and their sheet stay where they are for as long as the camera looks. */
  private dead: Body | null = null;
  private stopCar: Car | null = null;
  private stopDriver: Body | null = null;
  private radioT = 0;
  private carT = 0;
  private walkT = 0;
  private serial = 0;

  constructor(site: Site, cast: Cast, opts: { night: boolean; quiet?: boolean; wet?: boolean; parked?: readonly ParkedCar[] }) {
    this.site = site;
    this.cast = cast;
    this.night = opts.night;
    this.quiet = !!opts.quiet;
    this.wet = !!opts.wet;
    this.kind = cast.kind === 'theft' && !cast.live ? 'indoor' : cast.kind;
    this.r = rand(cast.seed ^ 0x7f4a7c15);
    this.amb = rand(cast.seed ^ 0x3c6ef372);
    const d = site.drive;
    this.width = d.width;
    this.length = d.length;
    this.at = d.at;
    this.u = site.dir;
    const out = sub(site.spot, site.roadSpot);
    this.n = dist(site.spot, site.roadSpot) > 0.2 ? norm(out) : [-site.dir[1] * site.side, site.dir[0] * site.side];
    this.kerbD = Math.max(0.6, dist(site.spot, site.roadSpot) - d.width / 2);
    this.parked = (opts.parked ?? []).map((pc) => {
      const n = nearestOnLine(pc.pos, d.pts);
      const co = Math.cos(pc.yaw);
      const si = Math.sin(pc.yaw);
      // How much of the road's length and width it takes, standing at its own angle to the road.
      const al = Math.abs(co * n.dir[0] + si * n.dir[1]);
      const ac = Math.abs(co * n.dir[1] - si * n.dir[0]);
      const hl = pc.length / 2;
      const hw = pc.width / 2;
      // In a bend a passing vehicle swings wide: the car counts as wider there by what the swing takes.
      const turn = Math.abs(angleDiff(dirYaw(pointAlong(d.pts, Math.max(0, n.s - 5)).dir), dirYaw(pointAlong(d.pts, Math.min(d.length, n.s + 5)).dir)));
      const swing = Math.min(1, 2.4 * Math.sin(turn / 2));
      return {
        x: pc.pos[0],
        y: pc.pos[1],
        co,
        si,
        hl,
        hw,
        berth: PARK_BERTH - 0.02,
        s: n.s,
        lat: cross(n.dir, sub(pc.pos, n.pt)) >= 0 ? n.d : -n.d,
        el: hl * al + hw * ac,
        ew: hw * al + hl * ac + swing,
      };
    });
    const walled = (end: V2, out: V2) => [2.5, 4].some((m) => insideBuilding(site.street, [end[0] + out[0] * m, end[1] + out[1] * m]) >= 0);
    this.wallA = d.deadA && walled(d.pts[0], norm(sub(d.pts[0], d.pts[1])));
    this.wallB = d.deadB && walled(d.pts[d.pts.length - 1], norm(sub(d.pts[d.pts.length - 1], d.pts[d.pts.length - 2])));
    this.kerbCars = this.parked.filter((p) => Math.abs(p.lat) - p.ew < d.width / 2 + 1.5);
    this.walkL = this.walkClear(site.walkLeft, 1);
    this.walkR = this.walkClear(site.walkRight, -1);
    this.hubs = [site.spot, site.roadSpot, this.pave(0)];
    let door: V2 | null = null;
    if (site.door && site.doorOut) {
      const p: V2 = [site.door[0] + site.doorOut[0] * 0.8, site.door[1] + site.doorOut[1] * 0.8];
      if (!this.wall(p[0], p[1])) door = p;
    }
    this.hasDoor = !!door;
    this.inPoint = door ?? this.pave(20 * this.openEnd(cast.seed & 1 ? 1 : -1));
    if (door) this.hubs.push(door);
    this.carT = this.amb.range(2, 12);
    this.walkT = this.amb.range(4, 20);
    this.radioT = this.r.range(25, 40);
    this.build();
  }

  /** Follow the situation for `dt` real seconds. The first call settles the stage: the same code, run forward. */
  update(sit: Situation, dt: number): void {
    if (!this.started) {
      this.started = true;
      // Whoever is seconds away has not come yet: the settled stage shows them still out of sight, and the first
      // live step lets them drive up with the time the game gives them.
      const near = sit.units.some((u) => u.state === 'near') || sit.agencies.some((a) => a.state === 'near');
      const before: Situation = near
        ? {
            ...sit,
            units: sit.units.map((u) => (u.state === 'near' ? { ...u, state: 'coming', eta: 0 } : u)),
            agencies: sit.agencies.map((a) => (a.state === 'near' ? { ...a, state: 'coming', eta: 0 } : a)),
          }
        : sit;
      this.settling = true;
      for (let i = 0, n = Math.round(SETTLE_S / SETTLE_DT); i < n; i++) this.tick(before, SETTLE_DT);
      this.settling = false;
    }
    if (sit.paused || !(dt > 0)) return;
    // The scene runs in whole steps, so that it does not depend on the frame rate; it keeps up to a step ahead of
    // the picture, which is drawn between the last two (frame()). A long gap (a hidden tab) is not played out in
    // full: the scene picks up where it was.
    this.ahead -= Math.round(Math.min(dt, 2) * 1e6);
    while (this.ahead < 0) {
      this.mark();
      this.tick(sit, STEP_S);
      this.ahead += STEP_US;
    }
  }

  /** Remember where everything is before a step. */
  private mark(): void {
    for (const b of this.bodies) {
      b.wx = b.x;
      b.wy = b.y;
      b.wyaw = b.yaw;
      b.wphase = b.phase;
      b.wseen = !b.hidden && !b.gone;
    }
    for (const c of this.cars) {
      c.wx = c.x;
      c.wy = c.y;
      c.wyaw = c.yaw;
      c.wseen = c.mode !== 'gone';
    }
  }

  /**
   * Everything on stage now, for the renderer. Between two steps of the scene the picture is drawn between them:
   * whoever was in sight a step ago is where they were then, moved on by the part of the step that has passed.
   */
  frame(): Frame {
    // How far the picture is into the last step (1: at its end), and how many seconds short of it.
    const k = 1 - this.ahead / STEP_US;
    const lag = this.ahead / 1e6;
    const t = k < 1 ? this.t - lag : this.t;
    const people: PersonFrame[] = [];
    for (const b of this.bodies) {
      if (b.hidden || b.gone) continue;
      // Somebody put elsewhere at once (out at a door) is not drawn on the way there.
      const tween = k < 1 && b.wseen && Math.abs(b.x - b.wx) + Math.abs(b.y - b.wy) < 2;
      const phase = tween ? lerp(b.wphase, b.phase, k) : b.phase;
      const actT = tween ? Math.max(0, b.actT - lag) : b.actT;
      let pose: Pose = poseOf({ act: b.act, actT, gait: b.gait, phase, seed: b.seed, t });
      if (b.from && b.blend < b.blendS) pose = mixPose(b.from, pose, smooth(b.blend / b.blendS));
      // Whoever stands and watches has their head on what happens, not wandering.
      if (b.head && !b.gait) pose = { ...pose, headYaw: b.head + 0.25 * pose.headYaw };
      people.push({
        id: b.id,
        look: b.look,
        pos: tween ? [lerp(b.wx, b.x, k), lerp(b.wy, b.y, k)] : [b.x, b.y],
        yaw: tween ? lerpAngle(b.wyaw, b.yaw, k) : b.yaw,
        pose,
        scale: b.scale,
        ...(b.held ? { held: b.held } : null),
      });
    }
    const cars: CarFrame[] = [];
    for (const c of this.cars) {
      if (c.mode === 'gone') continue;
      const tween = k < 1 && c.wseen && Math.abs(c.x - c.wx) + Math.abs(c.y - c.wy) < 5;
      cars.push({
        id: c.id,
        look: c.look,
        pos: tween ? [lerp(c.wx, c.x, k), lerp(c.wy, c.y, k)] : [c.x, c.y],
        yaw: tween ? lerpAngle(c.wyaw, c.yaw, k) : c.yaw,
        lights: { beacons: c.beacons, lamps: c.lamps, hazard: c.hazard, braking: c.braking },
      });
    }
    const smoke: Smoke | null =
      this.smoke && this.smoke.strength > 0.01 ? { at: this.smoke.at, height: this.smoke.height, strength: this.smoke.strength } : null;
    const props = this.propsNow();
    return props.length ? { t, people, cars, smoke, props } : { t, people, cars, smoke };
  }

  /** The things lying or standing about just now. */
  private propsNow(): PropFrame[] {
    const out = this.props.slice();
    const st = this.stretcher;
    if (st && !st.by.hidden && !st.by.gone) out.push({ id: 'stretcher', kind: 'stretcher', pos: st.stands?.pos ?? this.before(st.by, 1.25), yaw: st.stands?.yaw ?? st.by.yaw });
    const h = this.hose;
    if (h && !h.by.hidden && !h.by.gone && h.by.act === 'hose' && h.car.mode === 'park') {
      const from = this.carPoint(h.car, -h.car.size.length / 2 + 1, -this.kerbSide(h.car) * (h.car.size.width / 2 + 0.1));
      const nozzle = this.before(h.by, 0.45);
      // Behind whoever holds the nozzle it passes through the second one's hands (1.2 m back) and comes up off
      // the ground a step behind them.
      const m = h.mate && !h.mate.hidden && !h.mate.gone && h.mate.act === 'hose' ? h.mate : null;
      const hands: V2 = m ? [m.x, m.y] : this.before(h.by, -1.2);
      const dh = Math.max(0.3, dist(hands, [h.by.x, h.by.y]));
      const rise: V2 = [hands[0] + ((hands[0] - h.by.x) / dh) * 1.1, hands[1] + ((hands[1] - h.by.y) / dh) * 1.1];
      // A loose curve on the ground from the lorry's pump, not a ruled line.
      const mid = lerp2(from, rise, 0.5);
      const d = Math.max(1, dist(from, rise));
      const bow: V2 = [mid[0] - ((rise[1] - from[1]) / d) * 0.9, mid[1] + ((rise[0] - from[0]) / d) * 0.9];
      const line = [from, lerp2(from, bow, 0.6), bow, lerp2(bow, rise, 0.7), rise, hands, nozzle];
      out.push({ id: 'hose', kind: 'hose', pos: from, yaw: 0, line, ...(this.smoke ? { aim: { at: this.smoke.at, height: this.smoke.height } } : null) });
    }
    return out;
  }

  /** The point `m` metres before a body, the way it faces. */
  private before(b: Body, m: number): V2 {
    return [b.x + Math.cos(b.yaw) * m, b.y + Math.sin(b.yaw) * m];
  }

  // -------------------------------------------------------------------------- one step

  private tick(sit: Situation, dt: number): void {
    this.t += dt;
    this.tickNo++;
    this.sit = sit;
    this.road = null;
    this.follow(sit);
    this.story(sit, dt);
    for (let i = this.crews.length - 1; i >= 0; i--) this.runCrew(this.crews[i], dt);
    for (const c of this.cars) this.driveCar(c, dt);
    this.focus = this.focusNow();
    for (const b of this.bodies) {
      if (b.gone) continue;
      this.advance(b, dt);
      if (!b.hidden) this.idle(b, dt);
    }
    const st = this.stretcher;
    if (st?.load && !st.load.hidden) {
      // Whoever lies on the stretcher goes where it goes.
      // (Lifted across to it at a carrying pace, not in a jump.)
      const at = st.stands?.pos ?? this.before(st.by, 1.25);
      const d = Math.hypot(at[0] - st.load.x, at[1] - st.load.y);
      const k = d > 2.4 * dt ? (2.4 * dt) / d : 1;
      st.load.x += (at[0] - st.load.x) * k;
      st.load.y += (at[1] - st.load.y) * k;
      st.load.yaw += clamp(angleDiff(st.load.yaw, (st.stands?.yaw ?? st.by.yaw) + Math.PI), -3 * dt, 3 * dt);
    }
    if (!this.quiet) this.ambient(dt);
    this.sweep();
  }

  /** Read the game's word: who is coming, who has to go. */
  private follow(sit: Situation): void {
    for (const u of sit.units) {
      // A helicopter does not park in the street, and a boat does not drive up it.
      if (u.type === 'heli' || u.type === 'boat') continue;
      const key = `u:${u.id}`;
      this.live.set(key, this.tickNo);
      const cr = this.crewBy.get(key);
      const wanted = u.state === 'near' || u.state === 'here';
      if (!cr) {
        if (wanted && this.mayTry(key)) this.spawnUnit(u, key);
        continue;
      }
      if (u.state === 'left') {
        cr.wantLeave = true;
        cr.takes = u.takes;
        cr.run = sit.pursuit === 'on';
        continue;
      }
      // 'coming' for a crew already in the picture (the clock was slowed, the crew was routed anew) is not a
      // reason to go: it keeps doing what it does. Only 'left' sends a crew away.
      cr.wantLeave = false;
      if (cr.through) {
        // It was told to go before it stopped, and is wanted after all: its officers get out as usual.
        cr.through = false;
        if (cr.state === 'here') {
          cr.out = 0;
          cr.clock = 0;
        }
      }
      if (!wanted) continue;
      if (cr.state === 'boarding') this.unboard(cr);
      else if (cr.state === 'leaving') this.callBack(cr);
      if (u.state === 'here') {
        cr.arrived = true;
        if (cr.state === 'arriving') {
          if (!cr.hereT) cr.hereT = this.t;
          if (cr.car.eta > 3) this.plan(cr.car, 3);
        }
      } else if (cr.state === 'arriving' && cr.car.mode === 'drive' && cr.car.stop && Math.abs(cr.car.eta - u.eta) > 1) {
        // The game's clock ran slower or faster than it said (a slow machine, a changed speed): the car is timed
        // again to when the game now expects it, so that it does not stand there long before it is on scene.
        this.plan(cr.car, u.eta);
      }
    }
    for (const a of sit.agencies) {
      const key = `a:${a.agency}`;
      this.live.set(key, this.tickNo);
      const cr = this.crewBy.get(key);
      if (!cr) {
        if (a.state !== 'coming' && !this.done.has(key) && this.mayTry(key)) this.spawnAgency(a, key);
        continue;
      }
      // Another service stays until the incident has closed and its part is played.
      cr.wantLeave = sit.closed;
      if (a.state === 'here' && cr.state === 'arriving' && cr.car.eta > 3) this.plan(cr.car, 3);
    }
    // Whoever the game no longer names has to go.
    for (const cr of this.crews) if (this.live.get(cr.key) !== this.tickNo) cr.wantLeave = true;
  }

  /** A vehicle that found no way in looks again half a second later, not every step. */
  private mayTry(key: string): boolean {
    if ((this.tryAt.get(key) ?? 0) > this.t) return false;
    this.tryAt.set(key, this.t + 0.45);
    return true;
  }

  /** Phases, the outcome, a pursuit, and whatever runs by itself (a fight, smoke). */
  private story(sit: Situation, dt: number): void {
    if (RANK[this.phase] < RANK.seen) {
      for (const cr of this.crews) {
        if (cr.police && !cr.wantLeave && (cr.car.mode === 'park' || cr.car.eta <= 3)) {
          this.onSeen(cr);
          break;
        }
      }
    }
    if (!this.over && (sit.outcome || sit.closed)) {
      this.over = true;
      this.raise('closing');
    }
    // (The ending's clock runs on after its scene is played: the police are held by a wreck for so long, not for ever.)
    if (this.over) this.overT += dt;
    if (this.over && !this.played) {
      if (!this.playing && (this.contact || !this.policeAround() || this.overT > HOLD_S)) {
        this.startPlay(sit);
        this.bringOut();
      }
      if (this.playing) {
        this.playT += dt;
        if ((this.playT >= this.playMin && !this.bodies.some((b) => b.duty && !b.gone)) || this.playT > 60) {
          this.playing = false;
          this.played = true;
        }
      }
    }
    if (sit.pursuit === 'on' && !this.fled) this.flee();
    if (this.over && this.played && !this.crews.length && this.phase !== 'after') {
      this.phase = 'after';
      this.tidy();
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if (tm.live && this.settling) continue;
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
    if (RANK[this.phase] >= RANK.seen) this.seenT += dt;
    if (!this.broken && (this.kind === 'brawl' || this.kind === 'crowd') && RANK[this.phase] >= RANK.seen) {
      // An officer on foot within eight metres of a fight, or the police in sight for six seconds.
      const near = this.bodies.some(
        (o) => o.kind === 'police' && !o.hidden && !o.gone && this.bodies.some((f) => f.kind === 'cast' && f.role === 'suspect' && !f.hidden && Math.hypot(f.x - o.x, f.y - o.y) < 8),
      );
      if (near || this.seenT > 6 || this.pairs.some((p) => this.bodies.some((o) => o.kind === 'police' && !o.hidden && Math.hypot(p.a.x - o.x, p.a.y - o.y) < 8))) this.breakUp();
    }
    if (this.dead) this.keepBack();
    for (const p of this.pairs) this.fight(p, dt);
    for (const w of this.wanders) {
      const k = w.amp * Math.sin(this.t * w.rate + (w.b.seed % 628) / 100);
      this.glide(w.b, w.b.mark[0] + w.axis[0] * k, w.b.mark[1] + w.axis[1] * k, dt, w.gait, w.rest);
    }
    if (this.kind === 'indoor' && this.phase === 'contact' && !this.over) {
      // Now and then one of the crew comes out to the car's radio and goes back in.
      this.radioT -= dt;
      if (this.radioT <= 0) {
        this.radioT = this.r.range(25, 40);
        const b = this.bodies.find((x) => x.kind === 'police' && x.inside && !x.steps.length && x.crew?.state === 'here');
        if (b && b.crew) {
          const car = b.crew.car;
          this.comeOut(b);
          this.route(b, this.doorAt(car, 1), 'walk');
          b.steps.push(act('lean', 5, [car.x, car.y]));
          this.enter(b, 'walk');
        }
      }
    }
    if (this.smoke) {
      const rescue = this.crewBy.get('a:paaste');
      const hose = !!rescue && rescue.state === 'here' && rescue.out > 0;
      const floor = this.phase === 'after' || (this.over && this.played) ? 0 : hose ? 0.15 : 1;
      if (this.smoke.strength > floor) this.smoke.strength = Math.max(floor, this.smoke.strength - (0.85 / 30) * dt);
    }
  }

  /**
   * The officers round somebody who lies dead stand guard, facing out. An arm goes up at whoever walks by within
   * nine metres, for two to three seconds, and comes down again: a held arm is a statue, not a cordon.
   */
  private keepBack(): void {
    const dead = this.dead;
    if (!dead || dead.gone) return;
    for (const o of this.bodies) {
      if (o.kind !== 'police' || o.hidden || o.duty || o.leaving || o.aboard || (o.steps.length && !o.fidget)) continue;
      if (o.act !== 'guard' && o.act !== 'bar') continue;
      const d = Math.hypot(o.x - dead.x, o.y - dead.y);
      if (d > 6 || d < 0.5) continue;
      if (o.act === 'bar') {
        if (o.actT > 2.4 + 0.8 * hash01(o.seed, 51)) {
          this.setAct(o, 'guard');
          o.face = [o.x + ((o.x - dead.x) / d) * 6, o.y + ((o.y - dead.y) / d) * 6];
        }
        continue;
      }
      if (o.actT < 4) continue;
      const w = this.walkerNear(o, 9);
      if (!w || Math.hypot(w.x - dead.x, w.y - dead.y) < d) continue;
      this.atRest(o);
      this.setAct(o, 'bar');
      o.face = [w.x, w.y];
    }
  }

  /** Whoever of the public walks nearest to a body, within `m` metres of it. */
  private walkerNear(b: Body, m: number): Body | null {
    let best: Body | null = null;
    let bd = m;
    for (const x of this.bodies) {
      if ((x.kind !== 'cast' && x.kind !== 'passer') || x.hidden || x.gone || !x.gait || x.cuffed) continue;
      const d = Math.hypot(x.x - b.x, x.y - b.y);
      if (d < bd) {
        bd = d;
        best = x;
      }
    }
    return best;
  }

  private raise(p: Phase): void {
    if (RANK[p] > RANK[this.phase]) this.phase = p;
  }

  private policeAround(): boolean {
    return this.crews.some((cr) => cr.police && (cr.state === 'here' || cr.state === 'arriving') && !cr.through);
  }

  private sweep(): void {
    for (const b of this.bodies) {
      if (b.leaving && !b.gone) {
        const dx = b.x - this.site.spot[0];
        const dy = b.y - this.site.spot[1];
        if (dx * dx + dy * dy > OUT_M * OUT_M) this.vanish(b);
      }
    }
    if (this.bodies.some((b) => b.gone)) this.bodies = this.bodies.filter((b) => !b.gone);
    if (this.cars.some((c) => c.mode === 'gone')) {
      for (const c of this.cars) if (c.mode === 'gone') for (const b of c.riders) this.vanish(b);
      this.cars = this.cars.filter((c) => c.mode !== 'gone');
    }
  }

  private vanish(b: Body): void {
    if (b.kind === 'cast') {
      this.unpost(b);
      // The sheet goes with whoever lay under it.
      if (this.props.some((q) => q.id === `sheet:${b.id}`)) this.props = this.props.filter((q) => q.id !== `sheet:${b.id}`);
    }
    b.gone = true;
    b.hidden = true;
    b.duty = false;
    b.steps.length = 0;
    if (b.post) b.post.by = null;
    b.post = null;
  }

  // -------------------------------------------------------------------------- bodies

  private body(id: string, look: Look, seed: number, kind: Body['kind'], role: Body['role'], at: V2): Body {
    const b: Body = {
      id,
      look,
      seed,
      kind,
      role,
      x: at[0],
      y: at[1],
      yaw: (seed % 628) / 100,
      act: 'idle',
      actT: (seed % 97) / 10,
      gait: null,
      // Nobody walks in step with their neighbour.
      phase: hash01(seed, 13) * TAU,
      from: null,
      blend: BLEND_S,
      blendS: BLEND_S,
      ease: 0,
      pace: 0.9 + 0.2 * hash01(seed, 14),
      head: 0,
      idleT: 4 + 6 * hash01(seed, 15),
      fidget: false,
      stall: 0,
      steps: [],
      face: null,
      mark: at,
      hidden: false,
      gone: false,
      scale: 1,
      inside: false,
      aboard: false,
      duty: false,
      leaving: false,
      inRoad: false,
      post: null,
      crew: null,
      wards: [],
      keeper: null,
      held: null,
      cuffed: false,
      wx: at[0],
      wy: at[1],
      wyaw: 0,
      wphase: 0,
      wseen: false,
    };
    this.bodies.push(b);
    return b;
  }

  /** Is a point somewhere nobody can be: inside a house, or in (or right beside) a car parked in the street? */
  private wall(x: number, y: number): boolean {
    return insideBuilding(this.site.street, [x, y]) >= 0 || this.inParked(x, y, PARK_BERTH);
  }

  /** Is a point within `m` metres of the body of a car parked in the street? */
  private inParked(x: number, y: number, m: number): boolean {
    for (const p of this.parked) {
      const dx = x - p.x;
      const dy = y - p.y;
      if (Math.abs(dx * p.co + dy * p.si) < p.hl + m && Math.abs(dy * p.co - dx * p.si) < p.hw + m) return true;
    }
    return false;
  }

  /** Does the straight line from a to b pass through a box grown by `m` metres? */
  private cuts(q: Box, a: V2, b: V2, m: number): boolean {
    const af = (a[0] - q.x) * q.co + (a[1] - q.y) * q.si;
    const al = (a[1] - q.y) * q.co - (a[0] - q.x) * q.si;
    const bf = (b[0] - q.x) * q.co + (b[1] - q.y) * q.si;
    const bl = (b[1] - q.y) * q.co - (b[0] - q.x) * q.si;
    let t0 = 0;
    let t1 = 1;
    for (const [p0, d, half] of [
      [af, bf - af, q.hl + m],
      [al, bl - al, q.hw + m],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (Math.abs(p0) >= half) return false;
        continue;
      }
      const ta = (-half - p0) / d;
      const tb = (half - p0) / d;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
      if (t0 >= t1) return false;
    }
    return true;
  }

  /** Whatever stands solid in the street just now: the parked cars, and the vehicles of the scene that stand still. */
  private boxes(): Box[] {
    const out: Box[] = [...this.parked];
    for (const c of this.cars) if (c.mode === 'park') out.push({ x: c.x, y: c.y, co: Math.cos(c.yaw), si: Math.sin(c.yaw), hl: c.size.length / 2, hw: c.size.width / 2, berth: 0.25 });
    return out;
  }

  /** The straight line between two points is free of houses and of cars parked in the street. */
  private clear(a: V2, b: V2): boolean {
    if (!clearLine(this.site.street, a, b)) return false;
    for (const p of this.parked) if (this.cuts(p, a, b, p.berth)) return false;
    return true;
  }

  /**
   * A walking line of the site, moved off the cars parked along it: where one stands with its wheels on the
   * pavement the line passes it on the houses' side (or, where a house is too near, stays as it is).
   */
  private walkClear(line: V2[], side: 1 | -1): V2[] {
    if (!this.parked.length || line.length < 2) return line;
    const total = lineLength(line);
    const out: V2[] = [];
    const n = Math.max(1, Math.ceil(total / 2));
    for (let i = 0; i <= n; i++) {
      const at = pointAlong(line, (total * i) / n);
      const nx = -at.dir[1] * side;
      const ny = at.dir[0] * side;
      let push = 0;
      for (const p of this.parked) {
        const dx = at.pt[0] - p.x;
        const dy = at.pt[1] - p.y;
        if (Math.abs(dx) + Math.abs(dy) > p.hl + 6) continue;
        // Along the car a good stretch before and behind it too, so the line swings out in time; across it, how
        // far the line is from the car's far side.
        const f = dx * at.dir[0] + dy * at.dir[1];
        const l = dx * nx + dy * ny;
        const reach = Math.abs(p.co * nx + p.si * ny) * p.hl + Math.abs(p.co * ny - p.si * nx) * p.hw;
        if (Math.abs(f) < Math.abs(p.co * at.dir[0] + p.si * at.dir[1]) * p.hl + p.hw + 2.6 && l > -reach - CORNER_M && l < reach + CORNER_M)
          push = Math.max(push, reach + CORNER_M + 0.05 - l);
      }
      const q: V2 = [at.pt[0] + nx * push, at.pt[1] + ny * push];
      out.push(push > 0 && this.wall(q[0], q[1]) ? at.pt : q);
    }
    return out;
  }

  /** A point on the pavement `d` metres along the road from the spot, on the spot's side (or the other). */
  private pave(d: number, sameSide = true): V2 {
    const line = (this.site.side === 1) === sameSide ? this.walkL : this.walkR;
    const n = nearestOnLine(this.site.spot, line);
    return pointAlong(line, clamp(n.s + d, 0, lineLength(line))).pt;
  }

  /** Remember what the body was doing, so the pose blends into what comes next. */
  private keep(b: Body): void {
    b.from = this.shown(b);
    b.blend = 0;
    b.blendS = b.ease || BLEND_S;
    b.ease = 0;
  }

  /** The pose a body is in right now, in the middle of a change or not. */
  private shown(b: Body): Pose {
    const pose = poseOf({ act: b.act, actT: b.actT, gait: b.gait, phase: b.phase, seed: b.seed, t: this.t });
    return b.from && b.blend < b.blendS ? mixPose(b.from, pose, smooth(b.blend / b.blendS)) : pose;
  }

  private setAct(b: Body, a: Act): void {
    if (b.act === a) return;
    this.keep(b);
    b.act = a;
    b.actT = 0;
  }

  private setGait(b: Body, g: Gait | null): void {
    if (b.gait === g) return;
    this.keep(b);
    b.gait = g;
  }

  private turn(b: Body, yaw: number, dt: number): void {
    b.yaw += clamp(angleDiff(b.yaw, yaw), -TURN * dt, TURN * dt);
  }

  /** Put a body somewhere at once, standing (only for the hidden and at the start). */
  private stand(b: Body, at: V2, a: Act, face: V2 | null = null): void {
    b.x = at[0];
    b.y = at[1];
    b.mark = at;
    b.act = a;
    b.from = null;
    b.face = face;
    if (face) b.yaw = Math.atan2(face[1] - at[1], face[0] - at[0]);
  }

  /** One step of walking: the feet follow the distance covered. */
  private stride(b: Body, gait: Gait, dx: number, dy: number, d: number, dt: number): void {
    this.setGait(b, gait);
    b.phase += (d / (STRIDE[gait] * this.paceOf(b, gait))) * TAU;
    this.turn(b, Math.atan2(dy, dx) + (gait === 'back' ? Math.PI : 0), dt);
  }

  /** How much faster or slower than usual a body walks: its own pace, except in step with somebody it leads or is led by. */
  private paceOf(b: Body, gait: Gait): number {
    return gait === 'escort' || gait === 'shuffle' || gait === 'back' ? 1 : b.pace;
  }

  /** Move a free-running body to a point near where it is (a fight's drift, pacing). */
  private glide(b: Body, x: number, y: number, dt: number, gait: Gait, rest: Act): void {
    const dx = x - b.x;
    const dy = y - b.y;
    const d = Math.hypot(dx, dy);
    const reach = PACE[gait] * dt;
    if (d < 0.02 * dt || this.wall(x, y)) {
      this.setGait(b, null);
      this.setAct(b, rest);
      return;
    }
    const k = d > reach ? reach / d : 1;
    if (d * k > 0.25 * dt) this.stride(b, gait, dx, dy, d * k, dt);
    else this.setGait(b, null);
    b.x += dx * k;
    b.y += dy * k;
  }

  /** Play a body's steps for `dt` seconds. */
  private advance(b: Body, dt: number): void {
    b.actT += dt;
    if (b.blend < b.blendS) b.blend += dt;
    if (!b.steps.length) {
      if (b.gait && !this.free(b)) this.setGait(b, null);
      if (b.face && !b.gait && !DOWN.has(b.act)) this.turn(b, Math.atan2(b.face[1] - b.y, b.face[0] - b.x), dt);
      return;
    }
    let left = dt;
    let moving = false;
    for (let guard = 0; guard < 16 && b.steps.length && left > 1e-6; guard++) {
      const st = b.steps[0];
      if (st.k === 'go') {
        const dx = st.x - b.x;
        const dy = st.y - b.y;
        const d = Math.hypot(dx, dy);
        const pace = PACE[st.gait] * this.paceOf(b, st.gait);
        const k = d > pace * left ? (pace * left) / d : 1;
        const nx = b.x + dx * k;
        const ny = b.y + dy * k;
        // Never into a house or a parked car: the step ends where the wall is. (Somebody led by the arm does not
        // stop at a house's corner their way just clips: the two go round it, for a moment at most.)
        if (d < 1e-6 || this.shut(b, nx, ny)) {
          const round = d >= 1e-6 && st.gait === 'escort' && b.stall >= 0 && b.stall < STALL_S ? this.sidestep(b, dx / d, dy / d, Math.min(d, pace * left), st) : null;
          if (!round) {
            b.steps.shift();
            continue;
          }
          this.stride(b, st.gait, round[0] - b.x, round[1] - b.y, Math.hypot(round[0] - b.x, round[1] - b.y), dt);
          b.x = round[0];
          b.y = round[1];
          b.stall += left;
          moving = true;
          left = 0;
          break;
        }
        // Never under a moving vehicle: they let it pass (whoever is in its way already walks on, out of it). Nor
        // is a stretcher pushed under one.
        if (this.inTheWay(b.x, b.y, nx, ny)) break;
        // Somebody cuffed walks in an officer's hand: when the officer has fallen behind, they stop until the
        // hand is on them again.
        const kp = b.keeper;
        if (kp && !kp.gone && !kp.hidden) {
          const f = kp.steps[0];
          if (f && f.k === 'follow' && f.stuck < 3 && Math.hypot(kp.x - b.x, kp.y - b.y) > 1.15) break;
        }
        if (this.stretcher?.by === b && !this.stretcher.stands) {
          const at = this.before(b, 1.25);
          if (this.inTheWay(at[0], at[1], at[0] + nx - b.x, at[1] + ny - b.y)) break;
        }
        // Never through somebody: round them on the right, as people pass on a pavement, or a moment's wait.
        // (Kept waiting too long, they squeeze through: for a couple of seconds nobody is in their way.)
        if (b.stall < 0) b.stall = Math.min(0, b.stall + left);
        else if (this.crowded(b, nx, ny, st)) {
          const side = this.sidestep(b, dx / d, dy / d, Math.min(d, pace * left), st);
          if (!side) {
            b.stall += left;
            if (b.stall >= STALL_S) b.stall = -2;
            break;
          }
          this.stride(b, st.gait, side[0] - b.x, side[1] - b.y, Math.hypot(side[0] - b.x, side[1] - b.y), dt);
          b.x = side[0];
          b.y = side[1];
          // Two who keep stepping round each other get through in the end.
          b.stall += left * 0.4;
          if (b.stall >= STALL_S) b.stall = -2;
          moving = true;
          left = 0;
          break;
        }
        this.stride(b, st.gait, dx, dy, d * k, dt);
        b.x = nx;
        b.y = ny;
        if (b.stall > 0) b.stall = Math.max(0, b.stall - left);
        moving = true;
        left -= (d * k) / pace;
        if (k >= 1) b.steps.shift();
      } else if (st.k === 'act') {
        if (!st.on) {
          st.on = true;
          if (st.ease) b.ease = st.ease;
          this.setAct(b, st.act);
          b.ease = 0;
          if (st.face) b.face = st.face;
        }
        if (st.t > left) {
          st.t -= left;
          left = 0;
        } else {
          left -= st.t;
          b.steps.shift();
        }
      } else if (st.k === 'wait') {
        if (st.t > left) {
          st.t -= left;
          left = 0;
        } else {
          left -= st.t;
          b.steps.shift();
        }
      } else if (st.k === 'slide') {
        const k = st.t > left ? left / st.t : 1;
        b.x += (st.x - b.x) * k;
        b.y += (st.y - b.y) * k;
        if (st.t > left) {
          st.t -= left;
          left = 0;
        } else {
          left -= st.t;
          b.steps.shift();
        }
      } else if (st.k === 'follow') {
        const s = st.of;
        const fx = Math.cos(s.yaw);
        const fy = Math.sin(s.yaw);
        // The place at their side: behind them and half a step to the right (the hand on their arm); on the
        // other side level with them. Where a wall or a parked car has that place, right behind them.
        let tx = s.x - fx * (st.side > 0 ? 0.6 : 0.15) + fy * 0.34 * (st.side > 0 ? 1 : -2.2);
        let ty = s.y - fy * (st.side > 0 ? 0.6 : 0.15) - fx * 0.34 * (st.side > 0 ? 1 : -2.2);
        if (this.shut(b, tx, ty)) {
          tx = s.x - fx * 0.7;
          ty = s.y - fy * 0.7;
        }
        const dx = tx - b.x;
        const dy = ty - b.y;
        const d = Math.hypot(dx, dy);
        const afoot = !s.gone && !s.hidden && (!!s.gait || s.steps.some((x) => x.k === 'go'));
        if (!afoot || st.stuck > (st.side > 0 ? 6 : 2)) {
          b.steps.shift();
          continue;
        }
        // While they stand (getting up, waiting), whoever is at their side already stays as they are.
        if (!s.gait && Math.hypot(s.x - b.x, s.y - b.y) < 1) {
          b.face = [s.x, s.y];
          left = 0;
          continue;
        }
        // A little quicker than the walk itself, to close up after a turn; never in a jump.
        const reach = PACE.escort * 1.5 * left;
        const k = d > reach ? reach / d : 1;
        const nx = b.x + dx * k;
        const ny = b.y + dy * k;
        if (d > 0.04 && !this.shut(b, nx, ny) && !this.inTheWay(b.x, b.y, nx, ny)) {
          if (d * k > 0.25 * left) {
            this.setGait(b, 'escort');
            b.phase += ((d * k) / STRIDE.escort) * TAU;
            moving = true;
          }
          b.x = nx;
          b.y = ny;
          st.stuck = Math.max(0, st.stuck - left);
        } else if (d > 0.5) st.stuck += left;
        // Their body turned the way the other walks, not at the place they are making for.
        if (moving) this.turn(b, s.gait ? s.yaw : Math.atan2(s.y - b.y, s.x - b.x), dt);
        else b.face = [s.x, s.y];
        left = 0;
      } else if (st.k === 'door') {
        if (!st.on) {
          st.on = true;
          if (st.out) {
            b.hidden = false;
            b.inside = false;
          }
        }
        st.t += this.hasDoor ? left : 1;
        const k = Math.min(1, st.t / 0.5);
        b.scale = st.out ? 0.3 + 0.7 * k : 1 - 0.7 * k;
        left = 0;
        if (k >= 1) {
          b.scale = 1;
          if (!st.out) {
            b.hidden = true;
            b.inside = true;
          }
          b.steps.shift();
        }
      } else if (st.k === 'hide') {
        b.hidden = true;
        b.steps.shift();
      } else if (st.k === 'show') {
        b.hidden = false;
        b.scale = 1;
        b.steps.shift();
      } else if (st.k === 'gone') {
        this.vanish(b);
        return;
      } else {
        b.steps.shift();
        st.fn();
      }
    }
    if (!moving) {
      this.setGait(b, null);
      if (b.face && !DOWN.has(b.act)) this.turn(b, Math.atan2(b.face[1] - b.y, b.face[0] - b.x), dt);
    }
  }

  /** Where the action is: an emergency vehicle driving up, else the fight or the weapon, else the officers at work, else the spot. */
  private focusNow(): V2 {
    for (const cr of this.crews) if (cr.state === 'arriving' && cr.car.mode === 'drive') return [cr.car.x, cr.car.y];
    if (this.pairs.length) return [this.pairs[0].a.x, this.pairs[0].a.y];
    if (this.wanders.length) return [this.wanders[0].b.x, this.wanders[0].b.y];
    const busy = this.bodies.find((b) => b.duty && !b.hidden && !b.gone && b.kind !== 'cast');
    if (busy) return [busy.x, busy.y];
    return this.site.spot;
  }

  /**
   * The small life of somebody who stands: the head follows what happens, an arm that points or waves comes down
   * after a few seconds, and every few seconds they shift where they stand by a step or two and come back.
   * Nothing here is an order: a body doing this is as free as one standing still (`atRest`).
   */
  private idle(b: Body, dt: number): void {
    const watcher = b.kind === 'cast' ? b.role === 'caller' || b.role === 'witness' || b.role === 'extra' || b.role === 'driver' : b.kind === 'police';
    const calm = b.act === 'idle' || b.act === 'stand' || b.act === 'phone' || b.act === 'cold' || b.act === 'smoke' || b.act === 'point' || b.act === 'guard' || b.act === 'cower' || b.act === 'gasp';
    // The head: towards the action, as far as a neck turns, a third of a second behind.
    let want = 0;
    if (watcher && calm && !b.gait) {
      // (An officer at a cordon watches who walks by, not what lies behind their back.)
      const by = this.dead && b.kind === 'police' ? this.walkerNear(b, 14) : null;
      const at: V2 | null = by ? [by.x, by.y] : this.dead && b.kind === 'police' ? null : this.focus;
      if (at && Math.hypot(at[0] - b.x, at[1] - b.y) > 1.2) want = clamp(angleDiff(b.yaw, Math.atan2(at[1] - b.y, at[0] - b.x)), -1.15, 1.15);
    }
    b.head += (want - b.head) * Math.min(1, dt / 0.3);
    // Whoever directs traffic waves only while something comes along the road; else they stand and watch it.
    if (b.kind === 'police' && b.post && b.post.act === 'direct' && !b.steps.length && (b.act === 'direct' || b.act === 'guard')) {
      const n = nearestOnLine([b.x, b.y], this.site.drive.pts).s;
      const coming = this.cars.some((c) => c.mode === 'drive' && c.v > 0.5 && (n - c.s) * c.dir > 0 && Math.abs(n - c.s) < 40);
      this.setAct(b, coming ? 'direct' : 'guard');
    }
    // Nobody writes for a minute without looking up: an officer at a post for notes writes ten seconds or so,
    // stands and looks about for a few, and writes on.
    if (b.kind === 'police' && b.post && b.post.act === 'notes' && !b.steps.length && !b.duty) {
      if (b.act === 'notes' && b.actT > 9 + 6 * hash01(b.seed, 56)) this.setAct(b, 'guard');
      else if (b.act === 'guard' && b.actT > 4 + 4 * hash01(b.seed, 57) && !b.fidget) this.setAct(b, 'notes');
    }
    if (Math.abs(b.head) < 1e-3) b.head = 0;
    if (b.steps.length || this.free(b) || b.duty || b.leaving || b.aboard || !calm || b.scale < 1) {
      if (!b.steps.length) b.fidget = false;
      return;
    }
    b.fidget = false;
    // A stretched arm tires: pointing lasts a few seconds.
    if (b.act === 'point' && b.actT > 2 + 2 * hash01(b.seed, 16)) this.setAct(b, hash01(b.seed, 17) < 0.5 && b.kind === 'cast' ? 'phone' : 'idle');
    // Hands thrown up in fright come down after four to eight seconds: nobody holds them at their head for a minute.
    if (b.act === 'cower' && b.kind === 'cast' && b.actT > 4 + 4 * hash01(b.seed, 58)) {
      this.lookOn(b);
      return;
    }
    b.idleT -= dt;
    if (b.idleT > 0) return;
    const n = Math.floor(this.t / 3);
    const pick = hash01(b.seed, 18 + (n % 97));
    b.idleT = 5 + 6 * hash01(b.seed, 40 + (n % 97));
    if (b.kind === 'passer') return;
    const scared = b.act === 'cower' || b.act === 'gasp';
    if (pick < 0.3 && scared) {
      // A step back from what frightens them (never one that might be towards it); after a while, back again.
      const fx = b.x - this.focus[0];
      const fy = b.y - this.focus[1];
      const fd = Math.hypot(fx, fy);
      const far = 0.3 + 0.3 * hash01(b.seed, 80 + (n % 97));
      const p: V2 = [b.x + (fx / Math.max(fd, 0.1)) * far, b.y + (fy / Math.max(fd, 0.1)) * far];
      const here: V2 = [b.x, b.y];
      // (No room for the step: then at least another pose.)
      const taken = this.bodies.some((o) => o !== b && !o.hidden && Math.hypot(o.x - p[0], o.y - p[1]) < 0.8);
      if (taken || fd < 1 || Math.hypot(p[0] - b.mark[0], p[1] - b.mark[1]) > 1.2 || !this.roomAt(p, 0.3) || !this.clear(here, p) || this.onRoad(p)) {
        if (b.kind === 'cast') this.lookOn(b);
        return;
      }
      const was = b.act;
      b.fidget = true;
      b.steps.push(go(p, 'back'), act(was, 2.5 + 3.5 * hash01(b.seed, 90 + (n % 97)), this.focus), go(here, 'shuffle'), act(was));
    } else if (pick < 0.45 && !scared) {
      // A step or two aside and, after a moment, back to where they stood.
      const ang = hash01(b.seed, 60 + (n % 97)) * TAU;
      const far = 0.35 + 0.45 * hash01(b.seed, 80 + (n % 97));
      // (Back to their own place when they are near it: a step cut short by a neighbour must not add up to a drift.)
      const home: V2 = Math.hypot(b.mark[0] - b.x, b.mark[1] - b.y) < 1.2 ? b.mark : [b.x, b.y];
      const p: V2 = [home[0] + Math.cos(ang) * far, home[1] + Math.sin(ang) * far];
      // (Nobody who keeps away from a weapon takes a step that might be towards it.)
      const nearer = !!this.keepOut && b.kind !== 'police' && dist(p, this.keepOut.at) < dist(home, this.keepOut.at);
      if (nearer || !this.roomAt(p, 0.3) || !this.clear(home, p) || this.onRoad(p) || this.bodies.some((o) => o !== b && !o.hidden && Math.hypot(o.x - p[0], o.y - p[1]) < 0.8)) {
        if (b.kind === 'cast') this.lookOn(b);
        return;
      }
      const was = b.act;
      b.fidget = true;
      b.steps.push(go(p, 'shuffle'), act(was, 1.5 + 2.5 * hash01(b.seed, 90 + (n % 97))), go(home, 'shuffle'), act(was));
    } else if (b.kind === 'cast') this.lookOn(b);
  }

  /**
   * Whoever stands and looks on does not keep one pose: the phone to the ear and down again, a hand over the
   * mouth, folded arms, a finger pointed at what happens, and each time the body turns to where the action is now.
   */
  private lookOn(b: Body): void {
    if (b.act !== 'idle' && b.act !== 'stand' && b.act !== 'phone' && b.act !== 'cower' && b.act !== 'gasp' && b.act !== 'cold') return;
    const n = Math.floor(this.t / 3);
    // Something to be afraid of or shocked by: a weapon out, a fight, somebody who lies there, a fire.
    const tense = (this.kind === 'threat' && !this.over && this.phase !== 'after') || this.pairs.length > 0 || !!this.dead || (!!this.smoke && this.smoke.strength > 0.3) || (this.cast.down && !this.over);
    const set: Act[] = tense ? ['gasp', 'phone', 'cold', 'idle', 'point', 'gasp'] : ['idle', 'phone', 'idle', 'cold', 'point'];
    const i = Math.floor(hash01(b.seed, 19 + (n % 97)) * set.length) % set.length;
    let a = set[i];
    if (a === b.act) a = set[(i + 1) % set.length];
    // (An extra in a knot of people does not make a phone call or point: they look, arms folded or not.)
    if (b.role === 'extra' && a === 'phone') a = b.act === 'cold' ? 'idle' : 'cold';
    this.setAct(b, a);
    if (Math.hypot(this.focus[0] - b.x, this.focus[1] - b.y) > 1.5) b.face = this.focus;
  }

  /**
   * Is a body free for new orders: standing with nothing to do, or only shifting where it stands? The shifting
   * ends here: whoever asks is about to give it something to do.
   */
  private atRest(b: Body): boolean {
    if (b.steps.length && !b.fidget) return false;
    b.steps.length = 0;
    b.fidget = false;
    return true;
  }

  /** Is a point on the carriageway? */
  private onRoad(p: V2): boolean {
    return nearestOnLine(p, this.site.drive.pts).d < this.width / 2 + 0.2;
  }

  /**
   * Is somebody standing or walking where a body is about to step? Not whoever it walks with (an officer and the
   * one they lead, fighters), not whoever lies on the ground, and not the one it is going up to: the last step to
   * somebody's side is allowed as near as people stand to each other.
   */
  private crowded(b: Body, x: number, y: number, st: { x: number; y: number }): boolean {
    for (const o of this.bodies) {
      if (o === b || o.hidden || o.gone || o.scale < 1 || DOWN.has(o.act) || o.act === 'kneel') continue;
      const dx = o.x - x;
      const dy = o.y - y;
      if (Math.abs(dx) > NEAR_M || Math.abs(dy) > NEAR_M) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= NEAR_M * NEAR_M) continue;
      // Getting further from them is never a step into them; and whoever is shoulder to shoulder with them already
      // (they came out of one door) just walks on.
      const was = (o.x - b.x) * (o.x - b.x) + (o.y - b.y) * (o.y - b.y);
      if (d2 >= was || was < 0.4 * 0.4) continue;
      if (b.wards.includes(o) || o.wards.includes(b) || (b.crew && b.crew === o.crew && (b.duty || o.duty))) continue;
      // Somebody led to a car in an officer's hand is not held up by the other officers: those make room.
      if (b.keeper && o.kind === 'police') continue;
      const end = (o.x - st.x) * (o.x - st.x) + (o.y - st.y) * (o.y - st.y);
      if (end < 1.4 * 1.4 && d2 > 0.42 * 0.42) continue;
      return true;
    }
    return false;
  }

  /** A step of `len` metres round whoever is in the way: to the right of the way it goes first, then to the left. */
  private sidestep(b: Body, ux: number, uy: number, len: number, st: { x: number; y: number }): V2 | null {
    for (const a of [-0.7, -1.3, 0.7, 1.3]) {
      const co = Math.cos(a);
      const si = Math.sin(a);
      const x = b.x + (ux * co - uy * si) * len;
      const y = b.y + (ux * si + uy * co) * len;
      if (this.shut(b, x, y) || this.crowded(b, x, y, st) || this.inTheWay(b.x, b.y, x, y)) continue;
      return [x, y];
    }
    return null;
  }

  /** May a body not step to a point? Into a house never; into the berth of a parked car only to get out of it. */
  private shut(b: Body, x: number, y: number): boolean {
    if (insideBuilding(this.site.street, [x, y]) >= 0) return true;
    return this.inParked(x, y, PARK_BERTH) && !this.inParked(b.x, b.y, PARK_BERTH);
  }

  /**
   * Would a step from one place to another take somebody into the way of a vehicle that moves just now: into the
   * stretch before it, or nearer to its side than an arm's length?
   */
  private inTheWay(x0: number, y0: number, x1: number, y1: number): boolean {
    for (const c of this.cars) {
      if ((c.mode !== 'drive' || c.v < 0.05) && c.mode !== 'turn') continue;
      const hl = c.size.length / 2;
      const hw = c.size.width / 2;
      if (Math.abs(x1 - c.x) + Math.abs(y1 - c.y) > hl + 20) continue;
      if (c.mode === 'turn') {
        const r = hl + 0.8;
        if (Math.hypot(x1 - c.x, y1 - c.y) < r && Math.hypot(x0 - c.x, y0 - c.y) >= r) return true;
        continue;
      }
      const co = Math.cos(c.yaw);
      const si = Math.sin(c.yaw);
      /** Ahead of its middle, to its left, and how far from its body. */
      const at = (x: number, y: number): [number, number, number] => {
        const f = (x - c.x) * co + (y - c.y) * si;
        const l = -(x - c.x) * si + (y - c.y) * co;
        return [f, l, Math.hypot(Math.max(0, Math.abs(f) - hl), Math.max(0, Math.abs(l) - hw))];
      };
      const zone = (f: number, l: number) => f > -hl - 0.3 && f < hl + 0.8 + c.v * 0.8 && Math.abs(l) < hw + 0.5;
      const [f0, l0, d0] = at(x0, y0);
      const [f1, l1, d1] = at(x1, y1);
      if ((zone(f1, l1) && !zone(f0, l0)) || (d1 < 0.6 && d1 < d0)) return true;
    }
    return false;
  }

  /** Is the body moved by a fight or by pacing just now? */
  private free(b: Body): boolean {
    for (const w of this.wanders) if (w.b === b) return true;
    for (const p of this.pairs) if (p.a === b || p.b === b) return true;
    return false;
  }

  /** Take a body out of whatever moves it by itself. */
  private release(b: Body): void {
    if (this.wanders.some((w) => w.b === b)) this.wanders = this.wanders.filter((w) => w.b !== b);
    const p = this.pairs.find((x) => x.a === b || x.b === b);
    if (p) {
      this.pairs = this.pairs.filter((x) => x !== p);
      const other = p.a === b ? p.b : p.a;
      if (!other.steps.length && !DOWN.has(other.act)) other.steps.push(act(other.role === 'suspect' ? 'argue' : 'idle'));
    }
  }

  /** Where a body will be when its steps are done. */
  private endOf(b: Body): V2 {
    for (let i = b.steps.length - 1; i >= 0; i--) {
      const st = b.steps[i];
      if (st.k === 'go' || st.k === 'slide') return [st.x, st.y];
    }
    return [b.x, b.y];
  }

  /**
   * Walk to a point: straight when nothing stands between, else by way of the spot, the road or the pavement, and
   * round whatever vehicle stands in the way (a parked car, a crew's own car, a wreck).
   */
  private route(b: Body, to: V2, gait: Gait): void {
    const a = this.endOf(b);
    const legs: V2[] = [];
    if (!clearLine(this.site.street, a, to)) {
      const st = this.site.street;
      const hub = this.hubs.find((h) => clearLine(st, a, h) && clearLine(st, h, to));
      if (hub) legs.push(hub);
      else legs.push(nearestOnLine(a, this.walkOf(a)).pt, nearestOnLine(to, this.walkOf(to)).pt);
    }
    legs.push(to);
    const boxes = this.boxes();
    let from = a;
    for (const p of legs) {
      for (const q of this.round(from, p, boxes, 3)) b.steps.push(go(q, gait));
      b.steps.push(go(p, gait));
      from = p;
    }
  }

  /**
   * The points to walk by from a to b so as not to go through a standing vehicle: round the nearer end of the first
   * one in the way, by one or two of its corners, and likewise round whatever stands in the way after that (`depth`
   * vehicles at most). Nothing when the straight line is free or no way round is.
   */
  private round(a: V2, b: V2, boxes: Box[], depth: number): V2[] {
    if (depth <= 0) return [];
    // The nearest vehicle in the way first; where there is no way round that one (it stands wedged against
    // another), round the next one in the way: that leads out of a pocket between parked cars.
    const inWay = boxes.filter((q) => this.cuts(q, a, b, q.berth)).sort((p, q) => Math.hypot(p.x - a[0], p.y - a[1]) - Math.hypot(q.x - a[0], q.y - a[1]));
    const st = this.site.street;
    const ok = (p: V2) => !this.wall(p[0], p[1]);
    for (const q of inWay.slice(0, 3)) {
      const corner = (f: number, l: number): V2 => [q.x + q.co * f - q.si * l, q.y + q.si * f + q.co * l];
      const hl = q.hl + CORNER_M;
      const hw = q.hw + CORNER_M;
      const ks = [corner(hl, hw), corner(hl, -hw), corner(-hl, -hw), corner(-hl, hw)];
      // A door is half a metre from a vehicle's side: the line may pass that close, a corner is rounded wider.
      const free = (p: V2, r: V2) => !this.cuts(q, p, r, q.berth) && clearLine(st, p, r);
      let way: V2[] | null = null;
      let len = Infinity;
      const take = (pts: V2[]) => {
        let l = 0;
        let at = a;
        for (const p of [...pts, b]) {
          l += dist(at, p);
          at = p;
        }
        if (l < len - 1e-6) {
          len = l;
          way = pts;
        }
      };
      // Whoever starts at one of its doors goes round its front, as people getting out of a car do.
      const fa = (a[0] - q.x) * q.co + (a[1] - q.y) * q.si;
      const la = (a[1] - q.y) * q.co - (a[0] - q.x) * q.si;
      const front = Math.abs(fa) < q.hl && Math.abs(la) < q.hw + 0.9 ? 2 : 4;
      for (let pass = front; pass <= 4 && !way; pass += 2) {
        for (let i = 0; i < pass; i++) {
          if (!ok(ks[i])) continue;
          if (free(a, ks[i]) && free(ks[i], b)) take([ks[i]]);
          // Along one of its sides or ends: two corners next to each other.
          for (const j of [(i + 1) % 4, (i + 3) % 4])
            if (j < pass && ok(ks[j]) && free(a, ks[i]) && free(ks[j], b) && clearLine(st, ks[i], ks[j])) take([ks[i], ks[j]]);
        }
      }
      const pts = way as V2[] | null;
      if (!pts) continue;
      // Each stretch of the way round may meet another vehicle.
      const rest = boxes.filter((x) => x !== q);
      const out: V2[] = [];
      let at = a;
      for (const p of pts) {
        out.push(...this.round(at, p, rest, depth - 1), p);
        at = p;
      }
      out.push(...this.round(at, b, rest, depth - 1));
      return out;
    }
    return [];
  }

  /** The walking line on the side of the road a point is on. */
  private walkOf(p: V2): V2[] {
    const n = nearestOnLine(p, this.site.drive.pts);
    return cross(n.dir, sub(p, n.pt)) >= 0 ? this.walkL : this.walkR;
  }

  /** An end of the road people and cars can leave by: the wanted one unless the road stops there. */
  private openEnd(sign: number): 1 | -1 {
    const d = this.site.drive;
    const want = sign >= 0 ? 1 : -1;
    const dead = want > 0 ? d.deadB : d.deadA;
    const otherDead = want > 0 ? d.deadA : d.deadB;
    return dead && !otherDead ? (-want as 1 | -1) : want;
  }

  /** Walk off along the pavement to an end of the road, and be gone there. */
  private leave(b: Body, gait: Gait, sign = 0, across = false): void {
    this.release(b);
    this.unpost(b);
    if (b.post) b.post.by = null;
    b.post = null;
    b.leaving = true;
    // Whoever walks off does it with their arms down (a phone stays at the ear).
    if (b.act !== 'phone' && b.act !== 'cold') this.setAct(b, 'stand');
    // Along the pavement of their own side, or (`across`) over the road and along the other.
    const own = this.walkOf([b.x, b.y]);
    const line = across ? (own === this.walkL ? this.walkR : this.walkL) : own;
    const n = nearestOnLine(this.endOf(b), line);
    const dir = this.openEnd(sign || (b.seed & 1 ? 1 : -1));
    // Each on a line of their own, up to half a metre off the pavement's middle: people do not walk in file.
    const way = this.aside(sliceLine(line, n.s, dir > 0 ? lineLength(line) : 0), (hash01(b.seed, 22) - 0.5) * 1.1 * dir);
    // (Already as good as on it, they set off along it at once: no step back to a point beside them.)
    if (dist(this.endOf(b), way[0]) > 1.5 || way.length < 2) this.route(b, way[0], gait);
    for (let i = 1; i < way.length; i++) b.steps.push(go(way[i], gait));
    b.steps.push({ k: 'gone' });
  }

  /** Whoever a place was kept for has gone: the place is no more, and the officer who stood there stands by. */
  private unpost(b: Body): void {
    if (!this.posts.some((p) => p.of === b)) return;
    for (const p of this.posts) {
      if (p.of !== b) continue;
      const o = p.by;
      if (!o || o.gone || o.duty || o.aboard || o.post !== p) continue;
      o.post = null;
      o.steps.length = 0;
      o.fidget = false;
      this.standBy(o);
    }
    this.posts = this.posts.filter((p) => p.of !== b);
  }

  /** A line moved `off` metres to its left, point by point; where that would be in a wall or a parked car, the point stays. */
  private aside(line: V2[], off: number): V2[] {
    return line.map((p, i) => {
      const a = line[Math.max(0, i - 1)];
      const b = line[Math.min(line.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const q: V2 = [p[0] - ((b[1] - a[1]) / l) * off, p[1] + ((b[0] - a[0]) / l) * off];
      return this.wall(q[0], q[1]) || this.onRoad(q) ? p : q;
    });
  }

  /** Go in at the door (or off round the corner when there is none). */
  private enter(b: Body, gait: Gait): void {
    this.route(b, this.inPoint, gait);
    b.steps.push({ k: 'door', out: false, t: 0, on: false });
  }

  /** Come out of the door: the body's steps start there. */
  private comeOut(b: Body): void {
    b.steps.length = 0;
    b.x = this.inPoint[0];
    b.y = this.inPoint[1];
    b.steps.push({ k: 'door', out: true, t: 0, on: false });
  }

  /** Stop what it is doing and be ready for new steps, wherever it is (out of the door when it was inside). */
  private fresh(b: Body): void {
    this.release(b);
    if (b.inside && b.hidden) this.comeOut(b);
    else b.steps.length = 0;
  }

  // -------------------------------------------------------------------------- places

  /** A point `du` metres along the road from the spot and `dn` metres further from the road. */
  private local(du: number, dn: number): V2 {
    const s = this.site.spot;
    return [s[0] + this.u[0] * du + this.n[0] * dn, s[1] + this.u[1] * du + this.n[1] * dn];
  }

  /** Open water away from any road (a bridge's pavement is over water too): nobody stands there. */
  private overWater(p: V2): boolean {
    const st = this.site.street;
    if (!st.areas.some((a) => a.kind === 'water' && pointInRing(p, a.ring))) return false;
    return !st.roads.some((r) => nearestOnLine(p, r.pts).d < r.width / 2 + 3);
  }

  private roomAt(p: V2, room: number): boolean {
    if (this.wall(p[0], p[1]) || this.overWater(p)) return false;
    if (room > 0 && (this.wall(p[0] + room, p[1]) || this.wall(p[0] - room, p[1]) || this.wall(p[0], p[1] + room) || this.wall(p[0], p[1] - room)))
      return false;
    return true;
  }

  /** The point itself when it is outside every house (with `room` metres around) and in sight of the spot, else nearer the spot. */
  private safe(p: V2, room = 0): V2 {
    const spot = this.site.spot;
    for (let k = 0; k < 8; k++) {
      const q = k ? lerp2(p, spot, k / 8) : p;
      if (this.roomAt(q, room) && this.clear(q, spot)) return q;
    }
    return spot;
  }

  /** The k-th place to stand beside somebody: the first on the road's side, the next ones round them. */
  private beside(m: V2, k: number, rad = 1.25): V2 {
    const a = Math.atan2(-this.n[1], -this.n[0]) + [0, 1.15, -1.15, 2.3, -2.3, Math.PI][k % 6];
    return this.safe([m[0] + Math.cos(a) * rad, m[1] + Math.sin(a) * rad]);
  }

  /**
   * A place out of the carriageway: the point itself, or the place beside it `margin` metres behind the kerb (of
   * its own side of the road, or of `side`). Passing traffic has the road.
   */
  private offRoad(p: V2, margin: number, side: 1 | -1 | 0 = 0): V2 {
    const n = nearestOnLine(p, this.site.drive.pts);
    const need = this.width / 2 + margin;
    if (n.d >= need) return p;
    const own = n.d > 0.3 ? (cross(n.dir, sub(p, n.pt)) >= 0 ? 1 : -1) : this.site.side;
    const q = onDrive(this.site.drive, n.s, (side || own) * need).pos;
    return this.wall(q[0], q[1]) ? p : q;
  }

  /** Which side of the road a point is on: 1 left of the drive line, -1 right. */
  private sideOf(p: V2): 1 | -1 {
    const n = nearestOnLine(p, this.site.drive.pts);
    return cross(n.dir, sub(p, n.pt)) >= 0 ? 1 : -1;
  }

  /**
   * A place for an officer. Never on another post or on somebody of the incident: where walls squeeze two places
   * together, the later one moves to the nearest free place round it (two officers on one spot read as one body).
   */
  private post(at: V2, a: Act, face: V2 | null, enter = false, of: Body | null = null): void {
    if (!enter) {
      const near = (p: V2) =>
        this.posts.some((q) => !q.enter && dist(p, q.at) < 0.8) ||
        this.bodies.some((b) => b.kind === 'cast' && !b.hidden && dist(p, [b.x, b.y]) < 0.55 && !DOWN.has(b.act));
      if (near(at)) {
        search: for (let ring = 1; ring <= 4; ring++)
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * TAU + ring * 0.3;
            const p: V2 = [at[0] + Math.cos(ang) * 0.6 * ring, at[1] + Math.sin(ang) * 0.6 * ring];
            if (!near(p) && this.roomAt(p, 0) && this.clear(p, at)) {
              at = p;
              break search;
            }
          }
      }
    }
    this.posts.push({ at, face, act: a, enter, by: null, of });
  }

  // -------------------------------------------------------------------------- the stage before anyone comes

  private build(): void {
    const c = this.cast;
    const r = this.r;
    const spot = this.site.spot;
    const cold = c.dress.temp < 3;
    const all = c.people.map((p) => this.body(p.id, p.look, p.seed, 'cast', p.role, spot));
    const of = (...roles: Body['role'][]) => all.filter((b) => roles.includes(b.role));
    const sus = of('suspect');
    const vic = of('victim');
    const drv = of('driver');
    const byst = of('caller', 'witness');
    const kind = this.kind;
    /** Callers and witnesses: at a distance, on the phone or looking on. */
    const lookOn = (list: Body[], far: number, a?: Act) => {
      list.forEach((b, i) => {
        // Not in a row: each a little off their place along the street and nearer to or further from the road.
        const along = (i % 2 ? 1 : -1) * (far + 1.3 * (i >> 1)) + (hash01(b.seed, 26) - 0.5) * 1.4;
        const p = this.safe(this.local(along, 0.3 + (hash01(b.seed, 27) - 0.3) * 1.3));
        this.stand(b, p, a ?? (b.role === 'caller' ? 'phone' : cold ? 'cold' : r.pick<Act>(['idle', 'point', 'idle', 'phone'])), spot);
      });
    };
    /** Behind the door from the start. */
    const indoors = (list: Body[]) => {
      for (const b of list) {
        this.stand(b, this.inPoint, 'idle');
        b.hidden = true;
        b.inside = true;
      }
    };
    /** A caller who waits at the door half the time (by seed), else inside. */
    const atDoor = (list: Body[]) => {
      list.forEach((b, i) => {
        if (i === 0 && r.chance(0.5)) {
          const p = this.safe([this.inPoint[0] + this.u[0] * 1.2, this.inPoint[1] + this.u[1] * 1.2]);
          this.stand(b, p, cold ? 'cold' : r.pick<Act>(['phone', 'smoke', 'idle']), this.site.roadSpot);
        } else indoors([b]);
      });
    };
    const others = new Set<Body>(byst);

    if (kind === 'brawl') {
      let a = sus;
      let b = vic;
      if (!b.length && a.length >= 2) {
        b = a.slice(Math.ceil(a.length / 2));
        a = a.slice(0, Math.ceil(a.length / 2));
      }
      const np = Math.min(a.length, b.length);
      const homes: V2[] = [];
      for (let i = 0; i < np; i++) {
        // Each pair has its own room: three and a half metres from the next, a step off walls and door steps.
        let home = this.safe(this.local((i - (np - 1) / 2) * 3.8, 0.4), 1.5);
        if (homes.some((h) => dist(h, home) < 3.5)) {
          for (const [du, dn] of [[3.8, 0.4], [-3.8, 0.4], [5.6, 0.4], [-5.6, 0.4], [3.8, 0.9 - this.kerbD], [-3.8, 0.9 - this.kerbD], [7.4, 0.4], [-7.4, 0.4]]) {
            const q = this.local(du * (i % 2 ? 1 : -1), dn);
            if (this.roomAt(q, 1) && this.clear(q, spot) && !homes.some((h) => dist(h, q) < 3.5)) {
              home = q;
              break;
            }
          }
        }
        homes.push(home);
        const ma: V2 = this.safe([home[0] - this.u[0], home[1] - this.u[1]]);
        const mb: V2 = this.safe([home[0] + this.u[0], home[1] + this.u[1]]);
        this.stand(a[i], ma, 'fight', mb);
        this.stand(b[i], mb, 'fight', ma);
        const seed = hash32('pair', c.seed, i);
        this.pairs.push({ a: a[i], b: b[i], home, seed, t: 0, next: 5 + 4 * hash01(seed, 0), grip: false, d: 0.55, still: c.down && i === 0 });
      }
      const first = this.pairs[0]?.home ?? spot;
      a.slice(np).forEach((x, i) => this.stand(x, this.safe(this.local(1.5 + i * 1.3, 1.6)), 'argue', first));
      b.slice(np).forEach((x, i) => this.stand(x, this.safe(this.local(-2.5 - i * 1.2, 1.4)), 'cower', first));
      // The fall is for the camera: some seconds after the picture opens (or when the police come in sight).
      if (c.down && np) this.timers.push({ t: 6 + 6 * hash01(c.seed, 21), scene: true, live: true, fn: () => this.knockDown() });
      if (c.runs && sus.length) this.runner = sus[sus.length - 1];
      for (const x of sus) this.post(this.beside(x.mark, 0), 'guard', x.mark, false, x);
      if (b.length) this.post(c.down ? this.beside(b[0].mark, 1, 0.8) : this.beside(b[0].mark, 1), c.down ? 'aid' : 'notes', b[0].mark, false, b[0]);
      this.post(this.safe(this.local(0, -0.9)), 'guard', first);
      this.post(this.safe(this.local(2.2, -1)), 'guard', first);
      lookOn([...byst], 7.5);
    } else if (kind === 'threat') {
      const armed = sus[0] ?? vic[0] ?? all[0];
      const m = this.safe(this.local(0, 0.2), 1);
      if (armed) {
        this.stand(armed, m, 'brandish', this.site.roadSpot);
        this.wanders.push({ b: armed, axis: this.u, amp: PACE_M, rate: 0.5, gait: 'walk', rest: 'brandish' });
        others.delete(armed);
      }
      sus.slice(1).forEach((x, i) => this.stand(x, this.safe(this.local(1.6 + i * 1.2, 0.9)), 'argue', this.site.roadSpot));
      const keepOff = [...vic.filter((x) => x !== armed), ...byst];
      const placed: V2[] = [];
      const keep = 8.4 + PACE_M;
      if (armed) {
        armed.held = c.weapon ?? 'knife';
        this.keepOut = { at: m, r: 6 };
      }
      // Never on somebody else's place.
      const free = (p: V2) => !placed.some((q) => dist(p, q) < 1.1);
      keepOff.forEach((b, i) => {
        if (i === 0 && c.down && b.role === 'victim') {
          this.stand(b, this.safe(this.local(2.6, 0.5)), 'lie');
          return;
        }
        // Eight metres and more from wherever the weapon goes, along the pavement either way, then across the
        // road: not in a row, each a little off the next. They start a little nearer and back away. Whoever
        // finds no such place is not there: they went while they could.
        const sg = i % 2 ? 1 : -1;
        let to: V2 | null = null;
        search: for (const same of [true, false]) {
          for (let d = keep + 1.3 * (i >> 1); d <= 25; d += 1.4) {
            for (const dir of [sg, -sg]) {
              const on = this.pave(dir * d, same);
              // Off the pavement's middle by seed: a loose knot of people, not a file.
              const off = (hash01(b.seed, 23) - 0.5) * 1.6;
              const p: V2 = [on[0] + this.n[0] * off * (same ? 1 : -1), on[1] + this.n[1] * off * (same ? 1 : -1)];
              for (const q of [p, on]) {
                if (dist(q, m) >= keep && free(q) && this.roomAt(q, 0) && !this.onRoad(q)) {
                  to = q;
                  break search;
                }
              }
            }
          }
        }
        if (!to) {
          b.hidden = true;
          b.gone = true;
          return;
        }
        placed.push(to);
        const from = lerp2(to, m, 2 / Math.max(2, dist(to, m)));
        this.stand(b, this.wall(from[0], from[1]) || !this.clear(from, to) ? to : from, 'cower', m);
        b.steps.push(go(to, 'back'), act(hash01(b.seed, 24) < 0.4 && b.role !== 'victim' ? 'phone' : 'cower', 0, m));
      });
      // Officers stop well short of the weapon, towards the road: seven to nine metres from where it paces.
      const base = Math.atan2(-this.n[1], -this.n[0]);
      for (let k = 0; k < 4; k++) {
        const off = [0.35, -0.35, 0.9, -0.9][k];
        const rad = 8 + 0.6 * (k % 2);
        // The place itself, or one on the same ring that is free and has the suspect in sight.
        let at: V2 | null = null;
        for (const a of [off, off / 2, -off, off * 1.5, -off * 1.5]) {
          const p: V2 = [m[0] + Math.cos(base + a) * rad, m[1] + Math.sin(base + a) * rad];
          if (this.roomAt(p, 0) && this.clear(p, m) && !this.posts.some((q) => dist(q.at, p) < 1)) {
            at = p;
            break;
          }
        }
        this.post(at ?? this.safe([m[0] + Math.cos(base + off) * rad, m[1] + Math.sin(base + off) * rad]), 'aim', m);
      }
      if (c.runs && armed) this.runner = armed;
    } else if (kind === 'disorder') {
      const main = (sus.length ? sus : vic.length ? vic : all.slice(0, 1)).slice(0, 3);
      for (const x of main) others.delete(x);
      main.forEach((b, i) => {
        const m = this.safe(this.local((i - (main.length - 1) / 2) * 1.6, 0.2 * (i % 2)));
        const kerb = i === 1 && r.chance(0.6);
        if (kerb) {
          // Sitting on the kerb, feet in the gutter.
          const p = this.safe(this.local(1.8, -this.kerbD + 0.35));
          this.stand(b, p, 'sit', this.site.roadSpot);
        } else
          this.stand(
            b,
            m,
            c.drunk ? (i === 2 ? 'smoke' : 'sway') : main.length > 1 ? 'argue' : r.pick<Act>(['idle', 'smoke', 'argue']),
            main.length > 1 ? this.site.spot : this.site.roadSpot,
          );
        this.post(this.beside(b.mark, i), (['talk', 'notes', 'guard'] as Act[])[i], b.mark, false, b);
      });
      if (c.drunk && main.length && r.chance(0.6))
        this.wanders.push({ b: main[0], axis: this.u, amp: 2.2, rate: 0.22, gait: 'stagger', rest: 'sway' });
      this.post(this.safe(this.local(-2.4, -0.8)), 'guard', spot);
      if (c.runs && main.length > 1) this.runner = main[main.length - 1];
      for (const x of all) if (!main.includes(x) && !byst.includes(x)) others.add(x);
      lookOn([...others], 7);
    } else if (kind === 'lying') {
      const down = vic[0] ?? sus[0] ?? all[0];
      let m = spot;
      if (c.inRoad) m = onDrive(this.site.drive, this.at, this.site.side * Math.min(this.width / 4, Math.max(0, this.width / 2 - 1.2))).pos;
      if (down) {
        this.stand(down, m, 'lie');
        down.yaw = r.range(0, TAU);
        down.inRoad = !!c.inRoad;
        others.delete(down);
        // Somebody whose heart has stopped is not looked at: the first officer there starts on their chest.
        this.post(this.beside(m, 0, 0.8), c.priority === 1 ? 'cpr' : 'aid', m, false, down);
      }
      const rest = all.filter((x) => x !== down);
      const caller = rest.find((x) => x.role === 'caller') ?? rest[0];
      if (caller) {
        this.stand(caller, c.inRoad ? this.safe(this.local(0.8, -this.kerbD + 0.6)) : this.beside(m, 1, 1.4), 'phone', m);
        this.post(this.beside(caller.mark, 2), 'notes', caller.mark, false, caller);
      }
      this.post(this.beside(m, 3, 2.2), 'guard', m);
      lookOn(
        rest.filter((x) => x !== caller),
        6.5,
      );
    } else if (kind === 'crash') {
      const w = this.width;
      const wrecks = c.cars.slice(0, 2).map((cc, i) => {
        const long = CAR_SIZE[cc.look.body].length > 6;
        const car = this.car(cc.id, cc.look, 'cast');
        if (c.single) this.park(car, this.at, this.site.side * (w / 2 + 0.3), this.site.side > 0 ? -1 : 1, 0.5 * this.site.side);
        else if (i === 0) this.park(car, this.at - 1.8, w < NARROW_M ? 0 : -w / 4, 1, 0.44);
        else this.park(car, this.at + (long ? 6.5 : 2.8), w < NARROW_M ? 0 : w / 8, -1, long ? 0.2 : 1.2);
        if (this.wall(car.x, car.y) || (c.single && this.inParkedCar(car, PARK_GAP))) this.park(car, car.s, this.site.side * Math.max(0, w / 2 - 1.15), car.dir, 0.2);
        // Never into a car parked at the kerb: it stands straighter in its lane instead.
        if (this.inParkedCar(car, PARK_GAP)) this.park(car, car.s, c.single ? 0 : car.lat, car.dir, 0.12 * Math.sign(car.yawOff || 1));
        car.hazard = true;
        car.wreck = !c.single;
        return car;
      });
      const folk = [...drv, ...sus, ...vic];
      const edge = this.site.side * (w / 2 + 0.9);
      let hurt: Body | null = null;
      if (c.down) hurt = vic[0] ?? folk[folk.length - 1] ?? null;
      // Somebody still inside a wreck: not seen until the rescuers or the paramedics have them out.
      const inside = c.trapped && wrecks[0] ? (vic[0] ?? folk[folk.length - 1] ?? null) : null;
      if (inside) {
        this.stand(inside, [wrecks[0].x, wrecks[0].y], 'sit');
        inside.hidden = true;
        inside.aboard = true;
        wrecks[0].riders.push(inside);
        this.trapped = { b: inside, car: wrecks[0] };
        this.post(this.safe(this.flank(wrecks[0], 0.3, 0.6)), 'lean', [wrecks[0].x, wrecks[0].y]);
      }
      folk.forEach((b, i) => {
        if (b === inside) return;
        if (b === hurt) {
          const p = onDrive(this.site.drive, this.at - 0.5, this.site.side * Math.max(0, w / 2 - 0.5)).pos;
          this.stand(b, this.wall(p[0], p[1]) ? spot : p, r.chance(0.5) ? 'sit' : 'lie');
          b.yaw = r.range(0, TAU);
          this.post(this.beside(b.mark, 0, 0.8), 'aid', b.mark, false, b);
          return;
        }
        const p = this.safe(onDrive(this.site.drive, this.at + (i - folk.length / 2) * 1.7, edge).pos);
        this.stand(b, p, i % 2 ? 'argue' : 'phone', wrecks[0] ? [wrecks[0].x, wrecks[0].y] : this.site.roadSpot);
        // A driver does not stand rooted beside the road: once, they walk round their car and look at the damage.
        const own = b.role === 'driver' ? wrecks[drv.indexOf(b)] : undefined;
        if (own) this.timers.push({ t: 3 + 7 * i + 4 * hash01(b.seed, 31), scene: true, live: true, fn: () => this.walkRound(b, own) });
      });
      const talk = folk.find((b) => b !== hurt);
      if (talk) this.post(this.beside(talk.mark, 1), 'notes', talk.mark, false, talk);
      if (!c.single) this.post(onDrive(this.site.drive, this.at - 8, 0).pos, 'direct', onDrive(this.site.drive, this.at - 30, 0).pos);
      this.post(this.safe(this.local(1.5, -0.6)), 'guard', this.site.roadSpot);
      lookOn([...byst], 7);
    } else if (kind === 'stop') {
      const cc = c.cars[0];
      const driver = drv[0] ?? sus[0] ?? null;
      if (cc) {
        const car = this.kerbCar(cc.id, cc.look, 0);
        car.lamps = this.night;
        this.stopCar = car;
        const kerb = this.kerbSide(car);
        const beside = this.carPoint(car, 0.9, kerb * (car.size.width / 2 + 0.75));
        // At the driver's window from just behind it (the driver has to turn to them), and a second officer at
        // the car's rear corner on the pavement's side, watching whoever is in it.
        const window = this.carPoint(car, -0.6, -kerb * (car.size.width / 2 + 0.5));
        if (driver) {
          this.stopDriver = driver;
          others.delete(driver);
          if (r.chance(0.5) || c.driverIn || this.wall(beside[0], beside[1])) {
            this.stand(driver, [car.x, car.y], 'idle');
            driver.hidden = true;
            driver.aboard = true;
            car.riders.push(driver);
            this.post(window, 'lean', this.carPoint(car, 0.5, -kerb * (car.size.width / 2 - 0.2)));
          } else {
            this.stand(driver, beside, c.drunk ? 'sway' : r.pick<Act>(['idle', 'smoke']), this.site.roadSpot);
            this.post(this.beside(beside, 1), 'talk', beside);
          }
        } else this.post(window, 'lean', this.carPoint(car, 0.5, -kerb * (car.size.width / 2 - 0.2)));
        this.post(this.safe(this.carPoint(car, -1.3, kerb * (car.size.width / 2 + 0.8))), 'guard', [car.x, car.y]);
        // Whoever else is in it stands on the pavement beside it.
        sus
          .filter((x) => x !== driver)
          .forEach((x, i) =>
            this.stand(x, this.safe(this.carPoint(car, -0.6 - i * 1.1, kerb * (car.size.width / 2 + 1))), 'idle', this.site.roadSpot),
          );
        c.cars.slice(1).forEach((x, i) => this.kerbCar(x.id, x.look, i + 1));
      } else {
        // The vehicle has gone (or the story names none): whoever reported it waits where it happened, the first
        // officer hears them out and the second looks along the road it went by.
        const told = driver ?? byst.find((x) => x.role === 'caller') ?? byst[0] ?? null;
        if (told) {
          others.delete(told);
          this.stand(told, spot, told.role === 'caller' ? 'phone' : 'idle', this.site.roadSpot);
          this.post(this.beside(spot, 0), told === driver ? 'talk' : 'notes', spot);
        }
        const way = this.openEnd(c.seed & 2 ? 1 : -1);
        this.post(this.safe(this.local(way * 2.6, 0.7 - this.kerbD)), 'look', onDrive(this.site.drive, this.at + way * 40, 0).pos);
        if (!told) this.post(this.beside(spot, 0), 'look', this.local(0, 3));
      }
      for (const x of [...vic, ...drv.slice(1)]) others.add(x);
      if (driver) others.delete(driver);
      lookOn([...others], 7);
    } else if (kind === 'theft') {
      const victimCar = c.cars.find((x) => x.role !== 'suspect');
      let target = this.hasDoor && dist(this.inPoint, spot) < 14 ? this.inPoint : this.safe(this.local(0, 0.6));
      let faceTo: V2 = this.site.door ?? this.local(0, 3);
      let slotNo = 0;
      if (victimCar) {
        const car = this.kerbCar(victimCar.id, victimCar.look, slotNo++);
        const p = this.carPoint(car, 0.4, this.kerbSide(car) * (car.size.width / 2 + 0.55));
        if (!this.wall(p[0], p[1])) {
          target = p;
          faceTo = [car.x, car.y];
        }
      }
      for (const x of c.cars) if (x.role === 'suspect') this.stopCar = this.kerbCar(x.id, x.look, ++slotNo);
      sus.forEach((b, i) => {
        if (i === 0) this.stand(b, target, 'crouch', faceTo);
        else this.stand(b, this.safe([target[0] + this.u[0] * (2.2 + i), target[1] + this.u[1] * (2.2 + i)]), 'look', this.site.roadSpot);
        this.post(this.beside(b.mark, i), 'guard', b.mark, false, b);
      });
      this.post(this.beside(target, 2, 1), 'lean', faceTo);
      if (c.runs && sus.length) this.runner = sus[0];
      for (const x of [...vic, ...drv]) others.add(x);
      const list = [...others];
      lookOn(list, 8);
      if (list[0]) this.post(this.beside(list[0].mark, 1), 'notes', list[0].mark, false, list[0]);
      this.post(this.safe(this.local(-1.5, -0.8)), 'look', spot);
    } else if (kind === 'indoor' || kind === 'empty') {
      // What happens under a roof stays there: the camera sees who waits outside.
      indoors(all.filter((b) => !byst.includes(b)));
      atDoor(byst);
      if (kind === 'indoor') {
        this.post(this.inPoint, 'look', null, true);
        this.post(this.inPoint, 'look', null, true);
        this.post(this.safe([this.inPoint[0] + this.u[0] * 1.6, this.inPoint[1] + this.u[1] * 1.6]), 'guard', this.site.roadSpot);
      } else {
        this.post(this.safe(this.local(0, -0.5)), 'look', this.local(0, 3));
        this.post(this.safe([this.inPoint[0] - this.u[0] * 1.4, this.inPoint[1] - this.u[1] * 1.4]), 'look', this.site.door ?? spot);
      }
    } else if (kind === 'crowd') {
      const extras = of('extra');
      // Far enough from the kerb for the cluster and the line of officers before it: the road stays free.
      const centre = this.safe(this.local(0, Math.max(0.5, 4.4 - this.kerbD)), 1.5);
      extras.forEach((b, i) => {
        const rad = 3 * Math.sqrt((i + 0.5) / extras.length);
        const ang = i * 2.4;
        const p = this.offRoad(this.safe([centre[0] + Math.cos(ang) * rad, centre[1] + Math.sin(ang) * rad]), 0.9);
        const a: Act = c.chant && hash01(b.seed, 1) < 0.6 ? 'chant' : hash01(b.seed, 2) < 0.12 ? 'argue' : hash01(b.seed, 3) < 0.5 ? 'talk' : 'idle';
        this.stand(b, p, a, this.site.roadSpot);
      });
      if (c.riot) {
        for (let i = 0; i + 1 < Math.min(6, extras.length); i += 2) {
          const seed = hash32('riot', c.seed, i);
          const home = extras[i].mark;
          this.stand(extras[i + 1], this.safe([home[0] + 1.1, home[1]]), 'fight');
          this.pairs.push({
            a: extras[i],
            b: extras[i + 1],
            home: lerp2(home, extras[i + 1].mark, 0.5),
            seed,
            t: 0,
            next: 5 + 4 * hash01(seed, 0),
            grip: false,
            d: 0.55,
            still: true,
          });
        }
      }
      [...sus, ...vic, ...drv].forEach((b, i) =>
        this.stand(
          b,
          this.offRoad(this.safe([centre[0] + this.u[0] * (i - 1) * 1.2 - this.n[0] * 2.2, centre[1] + this.u[1] * (i - 1) * 1.2 - this.n[1] * 2.2]), 0.9),
          b.role === 'suspect' ? 'argue' : 'idle',
          this.site.roadSpot,
        ),
      );
      // A line between the crowd and the road, behind the kerb.
      for (let k = 0; k < 8; k++) {
        const off = ((k >> 1) + 0.5) * 1.5 * (k % 2 ? -1 : 1);
        this.post(this.offRoad(this.safe([centre[0] + this.u[0] * off - this.n[0] * 3.8, centre[1] + this.u[1] * off - this.n[1] * 3.8]), 0.5), 'guard', centre);
      }
      lookOn([...byst], 9);
    } else {
      // Fire: smoke, and people looking on from a distance.
      const out = this.site.doorOut ?? ([-this.n[0], -this.n[1]] as V2);
      // Out of a window above the door, just before the wall: smoke from inside the house at roof height would
      // rise out of a street camera's picture at once.
      let src: V2 = this.site.door ? [this.site.door[0] + out[0] * 0.4, this.site.door[1] + out[1] * 0.4] : this.local(0, 2);
      let height = this.site.door ? 2.8 : 1;
      if (c.carFire && c.cars[0]) {
        const car = this.kerbCar(c.cars[0].id, c.cars[0].look, 0);
        src = [car.x, car.y];
        height = 1.2;
      }
      this.smoke = { at: src, height, strength: 1 };
      // The onlookers stand on a pavement, the officers before them at its kerb: the road stays free.
      const centre = this.offRoad(this.safe([src[0] + out[0] * 11, src[1] + out[1] * 11], 1), 2);
      const side = this.sideOf(centre);
      const tan: V2 = [-out[1], out[0]];
      const crowd = all;
      crowd.forEach((b, i) => {
        // A loose knot, not a row: each a little off their place along the kerb and further back or forward.
        const off = (i - (crowd.length - 1) / 2) * 1.3 + (hash01(b.seed, 5) - 0.5) * 0.9;
        const back = (i % 2) * 1.1 + hash01(b.seed, 6) * 1.5;
        const p = this.offRoad(this.safe([centre[0] + tan[0] * off + out[0] * back, centre[1] + tan[1] * off + out[1] * back]), 1.6, side);
        this.stand(b, p, b.role === 'caller' ? 'phone' : cold ? 'cold' : hash01(b.seed, 4) < 0.5 ? 'point' : 'idle', src);
      });
      this.post(this.offRoad(this.safe([centre[0] - out[0] * 2.6, centre[1] - out[1] * 2.6]), 0.5, side), 'direct', centre);
      this.post(this.offRoad(this.safe([centre[0] - out[0] * 2.6 + tan[0] * 3.2, centre[1] - out[1] * 2.6 + tan[1] * 3.2]), 0.5, side), 'guard', centre);
    }
    // Other vehicles of the incident stand at the kerb where the kind shows them.
    if (kind === 'brawl' || kind === 'threat' || kind === 'disorder') {
      c.cars.forEach((x, i) => {
        const car = this.kerbCar(x.id, x.look, i + 1);
        if (x.role === 'suspect' && !this.stopCar) this.stopCar = car;
      });
    }
    this.spread(all);
    if (this.bodies.some((b) => b.gone)) this.bodies = this.bodies.filter((b) => !b.gone);
  }

  /**
   * Nobody starts on somebody else's place: where walls or the kerb pushed two people to the same point, the later
   * one moves to the nearest free place round it (fighting pairs hold on to each other and are left as they are).
   */
  private spread(all: Body[]): void {
    const held = new Set(this.pairs.flatMap((p) => [p.a, p.b]));
    const taken: V2[] = [];
    for (const b of all) {
      if (b.hidden) continue;
      const at: V2 = [b.x, b.y];
      const clear = (p: V2) => !taken.some((q) => dist(p, q) < 0.6);
      if (!held.has(b) && !clear(at)) {
        let best: V2 | null = null;
        for (let ring = 1; ring <= 4 && !best; ring++)
          for (let k = 0; k < 8 && !best; k++) {
            const a = (k / 8) * TAU + ring * 0.4;
            const p: V2 = [at[0] + Math.cos(a) * 0.65 * ring, at[1] + Math.sin(a) * 0.65 * ring];
            if (clear(p) && this.roomAt(p, 0) && this.clear(p, at) && !(this.keepOut && !b.held && dist(p, this.keepOut.at) < this.keepOut.r)) best = p;
          }
        if (best) {
          b.x = best[0];
          b.y = best[1];
          b.mark = best;
          for (const st of b.steps) if (st.k === 'go' && dist([st.x, st.y], at) < 0.01) [st.x, st.y] = best;
        }
      }
      taken.push([b.x, b.y]);
    }
  }

  /** A fighting pair for one step: they circle, drift, and take turns hitting and holding. */
  private fight(p: Pair, dt: number): void {
    p.t += dt;
    if (p.t >= p.next) {
      p.grip = !p.grip;
      p.next = p.t + 5 + 4 * hash01(p.seed, Math.floor(p.t));
    }
    const want = p.grip ? 0.36 : 0.55;
    p.d += clamp(want - p.d, -0.4 * dt, 0.4 * dt);
    // The pair moves about slowly (a stagger of a few decimetres when they hold on to each other): feet that
    // step, not bodies that glide.
    const amp = p.still ? 0.12 : p.grip ? 0.4 : 0.3;
    const ang = Math.atan2(this.u[1], this.u[0]) + (p.still ? 0.25 * Math.sin(p.t * 0.3) : 0.1 * p.t);
    let mx = p.home[0] + amp * wobble(p.seed, p.t, 0.14);
    let my = p.home[1] + amp * wobble(p.seed + 9, p.t, 0.11);
    // Clear of the next pair.
    for (const q of this.pairs) {
      if (q === p) continue;
      const qx = (q.a.x + q.b.x) / 2;
      const qy = (q.a.y + q.b.y) / 2;
      const d = Math.hypot(mx - qx, my - qy);
      if (d < 2.5 && d > 1e-3) {
        mx += ((mx - qx) / d) * (2.5 - d) * 0.5;
        my += ((my - qy) / d) * (2.5 - d) * 0.5;
      }
    }
    const dx = Math.cos(ang) * p.d;
    const dy = Math.sin(ang) * p.d;
    // Where one of them would be against a wall the pair holds its ground instead (they keep their distance).
    if (!this.roomAt([mx - dx, my - dy], 0.5) || !this.roomAt([mx + dx, my + dy], 0.5)) {
      mx = (p.a.x + p.b.x) / 2;
      my = (p.a.y + p.b.y) / 2;
    }
    const a: Act = p.grip ? 'grapple' : 'fight';
    const reach = PACE.shuffle * dt;
    for (const [b, sg] of [
      [p.a, -1],
      [p.b, 1],
    ] as const) {
      this.setAct(b, a);
      this.turn(b, ang + (sg < 0 ? 0 : Math.PI), dt);
      // Towards its place in the fight at a fighter's shuffle, never into a wall (half a metre off it) and never in a jump.
      const tx = mx + dx * sg - b.x;
      const ty = my + dy * sg - b.y;
      const far = Math.hypot(tx, ty);
      const k = far > reach ? reach / far : 1;
      const nx = b.x + tx * k;
      const ny = b.y + ty * k;
      if (far * k > 0.2 * dt && !this.wall(nx, ny)) {
        b.x = nx;
        b.y = ny;
        this.setGait(b, 'shuffle');
        b.phase += ((far * k) / STRIDE.shuffle) * TAU;
      } else this.setGait(b, null);
    }
  }

  /** The place beside a vehicle, `f` metres ahead of its middle and `off` from its side, on the side nearer the scene's own pavement (the other when a wall is there). */
  private flank(car: Car, f: number, off: number): V2 {
    const l = car.size.width / 2 + off;
    const a = this.carPoint(car, f, l);
    const b = this.carPoint(car, f, -l);
    const [near, far] = dist(a, this.site.spot) <= dist(b, this.site.spot) ? [a, b] : [b, a];
    return this.wall(near[0], near[1]) && !this.wall(far[0], far[1]) ? far : near;
  }

  /** Once round a vehicle and back to where they stood: a driver looking at the damage. */
  private walkRound(b: Body, car: Car): void {
    if (b.gone || b.hidden || b.duty || b.leaving || this.over || car.mode !== 'park' || !this.atRest(b)) return;
    const was = b.act;
    const home: V2 = [b.x, b.y];
    const hl = car.size.length / 2 + 0.8;
    const hw = car.size.width / 2 + 0.8;
    const ks = [this.carPoint(car, hl, hw), this.carPoint(car, hl, -hw), this.carPoint(car, -hl, -hw), this.carPoint(car, -hl, hw)];
    if (ks.some((k) => this.wall(k[0], k[1]))) return;
    // From the corner nearest to them, the long way round.
    let first = 0;
    for (let i = 1; i < 4; i++) if (dist(ks[i], home) < dist(ks[first], home)) first = i;
    this.route(b, ks[first], 'walk');
    for (let i = 1; i <= 4; i++) {
      b.steps.push(go(ks[(first + i) % 4], 'walk'));
      if (i === 2) b.steps.push(act('lean', 2.5, [car.x, car.y]));
    }
    this.route(b, home, 'walk');
    b.steps.push(act(was, 0, [car.x, car.y]));
  }

  /** Whoever was shut in a wreck is out: lying beside it, for the paramedics. */
  private freeTrapped(): void {
    const tr = this.trapped;
    this.trapped = null;
    if (!tr || tr.b.gone) return;
    const { b, car } = tr;
    car.riders = car.riders.filter((x) => x !== b);
    const at = this.flank(car, 0.2, 0.95);
    b.x = at[0];
    b.y = at[1];
    b.mark = at;
    b.yaw = car.yaw;
    b.hidden = false;
    b.aboard = false;
    b.act = 'sit';
    b.from = null;
    b.ease = 1.2;
    this.setAct(b, 'lie');
    b.ease = 0;
    // The paramedics see to them where they lie.
    const medics = this.crewBy.get('a:kiirabi');
    medics?.people.forEach((m, i) => {
      if (m.aboard || m.gone || m.duty) return;
      m.steps.length = 0;
      this.route(m, this.beside(at, i + 1, 0.8), 'walk');
      m.steps.push(act(this.cast.priority === 1 && i === 0 ? 'cpr' : 'aid', 0, at));
    });
  }

  /**
   * A wreck that can roll is moved out of the road when the work is done: its driver gets in (an officer when the
   * driver cannot), it backs free and stands at the kerb ahead, hazard lights on; then whoever moved it gets out.
   */
  private clearWreck(car: Car, after: number, tries = 0): void {
    if (!tries) this.toClear++;
    this.timers.push({
      t: after,
      scene: false,
      fn: () => {
        if (car.mode === 'park' && car.wreck && this.kerbFor(car) === null && tries < 8) {
          // No free kerb for the moment (the other wreck or a lorry is still in the way): a little later.
          this.clearWreck(car, 4, tries + 1);
          return;
        }
        if (car.mode !== 'park' || !car.wreck || this.kerbFor(car) === null) {
          // It cannot be moved from here: it stays where it is.
          this.toClear--;
          return;
        }
        const drivers = this.bodies.filter((b) => b.kind === 'cast' && b.role === 'driver');
        const wrecks = this.cars.filter((c) => c.kind === 'cast');
        const own = drivers[wrecks.indexOf(car)];
        // (Somebody who is seen to walk up to it and get in: not a driver who is half way down the street.)
        const fit = (b: Body | undefined) => !!b && !b.gone && !b.hidden && !b.duty && !b.aboard && !DOWN.has(b.act) && Math.hypot(b.x - car.x, b.y - car.y) < 25;
        const mover = fit(own) ? own : this.officers().find((b) => !b.hidden && !b.duty && b.crew?.state === 'here');
        if (!mover || this.phase === 'after') {
          // Nobody to move it, or the street has emptied: it stays.
          this.toClear--;
          return;
        }
        const cast = mover.kind === 'cast';
        // An officer sees it to the kerb: at the roadside by the place it makes for, an arm out for whoever comes.
        const place = this.kerbFor(car);
        const guide = this.officers().find((b) => b !== mover && !b.hidden && !b.duty && b.crew?.state === 'here' && b.act !== 'aid' && b.act !== 'cpr') ?? null;
        let guiding = false;
        if (guide && place) {
          const sg = place.lat >= 0 ? 1 : -1;
          const by = this.offRoad(onDrive(this.site.drive, place.s + car.dir * (car.size.length / 2 + 2.2), place.lat + sg * 1.4).pos, 0.5, sg);
          if (!this.wall(by[0], by[1]) && !this.inParked(by[0], by[1], PARK_BERTH)) {
            if (guide.post) guide.post.by = null;
            guide.post = null;
            guide.steps.length = 0;
            guide.fidget = false;
            this.setAct(guide, 'stand');
            this.route(guide, by, 'walk');
            guide.steps.push(act('direct', 0, [car.x, car.y]));
            guiding = true;
          }
        }
        this.release(mover);
        mover.steps.length = 0;
        mover.fidget = false;
        mover.leaving = false;
        mover.duty = true;
        if (mover.post) mover.post.by = null;
        mover.post = null;
        this.setAct(mover, 'stand');
        // The driver's door is on the vehicle's left.
        const door = this.carPoint(car, 0.45, car.size.width / 2 + 0.55);
        const other = this.carPoint(car, 0.45, -(car.size.width / 2 + 0.55));
        this.route(mover, this.wall(door[0], door[1]) ? other : door, 'walk');
        this.getIn(mover, car, () => {
          mover.aboard = true;
          this.toKerb(car, () => {
            // Out again where it stands now.
            const at = this.carPoint(car, 0.45, this.kerbSide(car) * (car.size.width / 2 + 0.55));
            const out = this.wall(at[0], at[1]) ? this.carPoint(car, 0.45, -this.kerbSide(car) * (car.size.width / 2 + 0.55)) : at;
            const seat = lerp2(out, [car.x, car.y], 0.3 / Math.max(0.3, dist(out, [car.x, car.y])));
            mover.x = seat[0];
            mover.y = seat[1];
            mover.yaw = car.yaw;
            mover.hidden = false;
            mover.aboard = false;
            mover.duty = false;
            mover.act = 'duck';
            mover.from = null;
            mover.ease = 0.6;
            mover.steps.length = 0;
            mover.steps.push(slide(out, 0.55));
            this.setAct(mover, 'stand');
            // The driver stays by their car (a call to the insurer, the tow) until the police go (driversGo); with
            // no police there to wait for, they are on their way after the call.
            if (cast) {
              const side = this.offRoad(out, 0.6, Math.abs(car.lat) > 0.2 ? (car.lat > 0 ? 1 : -1) : this.site.side);
              if (!this.wall(side[0], side[1]) && !this.inParked(side[0], side[1], PARK_BERTH)) mover.steps.push(go(side, 'walk'));
              mover.steps.push(act('phone', 9 + 6 * hash01(mover.seed, 54), [car.x, car.y]));
              if (this.policeAround()) mover.steps.push(act('idle', 0, [car.x, car.y]));
              else mover.steps.push(wait(2 + 4 * hash01(mover.seed, 55)), call(() => this.leave(mover, 'walk')));
            } else if (mover.crew?.state === 'boarding') this.toCar(mover);
            else this.standBy(mover);
            // The officer who saw it to the kerb goes back to the car (unless somebody gave them other work meanwhile).
            if (guide && guiding && !guide.duty && !guide.aboard && !guide.gone && (guide.act === 'direct' || guide.steps.some((x) => x.k === 'act' && x.act === 'direct'))) {
              guide.steps.length = 0;
              if (guide.crew?.state === 'boarding') this.toCar(guide);
              else this.standBy(guide);
            }
          });
        });
      },
    });
  }

  /**
   * The nearest free place at a kerb for a wreck, and how far it backs off first: a place ahead of it at its own
   * kerb; or, where something stands before it (the other wreck, nose to nose), one a few metres behind it, which it
   * backs past and pulls in to; one that stands askew in its own lane just comes straight at its kerb; and where its
   * own kerb would leave no way through (across the road from the other wreck), the kerb the other one stands at.
   * Null: none, or the road is a single lane.
   */
  private kerbFor(car: Car): { s: number; lat: number; back: number } | null {
    if (this.width < NARROW_M) return null;
    const own = (car.lat >= 0 ? 1 : -1) * this.kerbLat();
    const hl = car.size.length / 2;
    const free = (s: number, lat: number) =>
      !this.taken(car, car.size, s, lat, 1.2, PARK_SIDE, car.dir) && !this.roadFolk().some((p) => p.still && Math.abs(p.s - s) < hl + 1 && Math.abs(p.lat - lat) < car.size.width / 2 + 0.6);
    const room = this.roomBehind(car) - 0.8;
    for (let d = 6; d <= 40; d += 1) {
      const s = car.s + car.dir * d;
      if (s < 3.5 || s > this.length - 3.5) break;
      // Not past a vehicle that stands in the road ahead: a wreck is rolled a few metres, not driven round things.
      if (this.cars.some((o) => o !== car && o.mode !== 'gone' && (o.s - car.s) * car.dir > 0.5 && (s - o.s) * car.dir > -(this.ext(o)[0] + hl + 1))) break;
      if (free(s, own)) return { s, lat: own, back: car.yawOff ? clamp(room, 0, 2.5) : 0 };
    }
    // Behind it: back far enough to come forward again into the kerb (further for the kerb across the road).
    const behind = (lat: number, run: number) => {
      for (let d = 4.5; d + run <= room && d <= 10; d += 1) {
        const s = car.s - car.dir * d;
        if (s < 3.5 || s > this.length - 3.5) break;
        if (free(s, lat)) return { s, lat, back: d + run };
      }
      return null;
    };
    const mine = behind(own, 3.5);
    if (mine) return mine;
    if (car.yawOff && room >= 3 && Math.abs(car.lat - own) < 0.5) return { s: car.s + car.dir * 0.5, lat: own, back: 3 };
    return behind(-own, 6);
  }

  /** Drive a wreck to the nearest free place at a kerb (kerbFor); `done` when it stands there. */
  private toKerb(car: Car, done: () => void): void {
    const place = this.kerbFor(car);
    if (place === null) {
      this.toClear--;
      done();
      return;
    }
    car.wreck = false;
    car.back = place.back;
    car.mode = 'drive';
    car.stop = true;
    car.ts = place.s;
    car.tlat = place.lat;
    car.vc = 3.2;
    car.acc = 1.4;
    car.brake = 2.5;
    car.eta = 0;
    car.wait = 0;
    car.shunts = 0;
    car.lamps = true;
    // Kept from its place (somebody stands where it would back to, the way ahead is shut), it is not waited for for
    // ever: after six seconds without moving, or twenty-four in all, it stands where it has got to.
    let all = 0;
    let still = 0;
    let at: V2 = [car.x, car.y];
    let yaw = car.yaw;
    const poll = () => {
      all += 0.4;
      still = dist(at, [car.x, car.y]) < 0.02 && Math.abs(car.yaw - yaw) < 0.005 ? still + 0.4 : 0;
      at = [car.x, car.y];
      yaw = car.yaw;
      if (car.mode !== 'park' && car.mode !== 'gone' && (still >= 6 || all >= 24)) {
        car.mode = 'park';
        car.v = 0;
        car.back = 0;
        car.wait = 0;
        car.shunts = 0;
        car.braking = false;
        car.eta = 0;
        car.ts = car.s;
        car.tlat = car.lat;
      }
      if (car.mode === 'park' || car.mode === 'gone') {
        car.lamps = this.night;
        this.toClear--;
        done();
      } else this.timers.push({ t: 0.4, scene: false, fn: poll });
    };
    this.timers.push({ t: 0.4, scene: false, fn: poll });
  }

  /** The first fight ends with one of them on the ground; the one who did it does not stand over them like a post. */
  private knockDown(): void {
    const p = this.pairs.find((x) => x.still && x.a.kind === 'cast' && x.a.role !== 'extra');
    if (!p) return;
    this.pairs = this.pairs.filter((x) => x !== p);
    const at: V2 = [p.b.x, p.b.y];
    this.setGait(p.a, null);
    this.setGait(p.b, null);
    p.b.steps.length = 0;
    p.b.steps.push(act('fall', 0.7), act('lie'));
    p.b.mark = at;
    p.a.steps.length = 0;
    p.a.steps.push(act('kick', 2.6, at));
    this.prowl(p.a, at, 0);
  }

  /**
   * Somebody who has knocked another down, until the police come: a few steps away and back, shouting at whoever
   * looks on, a look round, now and then another kick. The round repeats; any new order ends it.
   */
  private prowl(b: Body, victim: V2, n: number): void {
    const seed = hash32('prowl', b.seed, n);
    const watcher = this.bodies.find((x) => x.kind === 'cast' && x !== b && !x.hidden && !DOWN.has(x.act) && (x.role === 'witness' || x.role === 'caller'));
    const away = norm(sub([b.x, b.y], victim));
    const turn = (hash01(seed, 1) - 0.5) * 2.2;
    const co = Math.cos(turn);
    const si = Math.sin(turn);
    const far = 2 + 2 * hash01(seed, 2);
    const to = this.safe([victim[0] + (away[0] * co - away[1] * si) * far, victim[1] + (away[0] * si + away[1] * co) * far], 0.5);
    const back = this.safe([victim[0] + away[0] * 0.9, victim[1] + away[1] * 0.9]);
    b.steps.push(go(to, 'walk'));
    if (watcher) b.steps.push(act('argue', 3 + 2 * hash01(seed, 3), [watcher.x, watcher.y]));
    else b.steps.push(act('look', 2.5));
    b.steps.push(go(back, 'walk'));
    if (hash01(seed, 4) < 0.4) b.steps.push(act('kick', 1.4, victim));
    b.steps.push(
      act('look', 1.5 + 2 * hash01(seed, 5), victim),
      call(() => this.prowl(b, victim, n + 1)),
    );
  }

  /**
   * The fights stop: the police are close (or have been in sight for a while). Fighters let go and step back to
   * their own places, the suspects' hands go up for a moment, and whoever prowled about stands still.
   */
  private breakUp(): void {
    if (this.broken) return;
    this.broken = true;
    const fighters = this.pairs.flatMap((p) => [p.a, p.b]);
    this.pairs = [];
    const cops = this.bodies.find((x) => x.kind === 'police' && !x.hidden);
    const to: V2 = cops ? [cops.x, cops.y] : this.site.roadSpot;
    for (const b of fighters) {
      this.setGait(b, null);
      b.steps.length = 0;
      b.steps.push(go(b.mark, 'back'));
      if (b.role === 'suspect') b.steps.push(act('handsUp', 2.5, to), act(hash01(b.seed, 5) < 0.5 ? 'argue' : 'stand', 0, to));
      else b.steps.push(act(b.role === 'extra' ? 'argue' : 'idle', 0, to));
    }
    for (const b of this.bodies) {
      if (b.kind !== 'cast' || b.role !== 'suspect' || b.hidden || b.leaving || b.duty || fighters.includes(b) || DOWN.has(b.act)) continue;
      // Whoever raged alone, or stood over somebody they knocked down.
      b.steps.length = 0;
      b.steps.push(act('handsUp', 2.5, to), act(hash01(b.seed, 5) < 0.5 ? 'argue' : 'stand', 0, to));
    }
  }

  // -------------------------------------------------------------------------- the police come in sight, and arrive

  private onSeen(cr: Crew): void {
    this.raise('seen');
    const car = cr.car;
    for (const b of this.bodies) {
      if (b.kind === 'cast' && b.role === 'caller' && !b.hidden && !DOWN.has(b.act) && this.atRest(b)) {
        const was = b.act;
        b.steps.push(act('wave', 4, [car.x, car.y]), act(was === 'phone' ? 'idle' : was, 0, this.site.roadSpot));
      }
    }
    // The police are here: whoever looked on from near makes room, two or three metres further off.
    if (this.kind !== 'crowd' && this.kind !== 'fire') {
      const spot = this.site.spot;
      for (const b of this.bodies) {
        if (b.kind !== 'cast' || (b.role !== 'witness' && b.role !== 'extra') || b.hidden || DOWN.has(b.act) || this.free(b)) continue;
        const d = Math.hypot(b.x - spot[0], b.y - spot[1]);
        if (d < 2.5 || d > 9 || !this.atRest(b)) continue;
        const far = 2 + 1.5 * hash01(b.seed, 59);
        const here: V2 = [b.x, b.y];
        const p: V2 = [b.x + ((b.x - spot[0]) / d) * far, b.y + ((b.y - spot[1]) / d) * far];
        if (!this.roomAt(p, 0.3) || !this.clear(here, p) || this.onRoad(p) || this.bodies.some((o) => o !== b && !o.hidden && Math.hypot(o.x - p[0], o.y - p[1]) < 0.9)) continue;
        const was = b.act;
        b.mark = p;
        b.steps.push(wait(0.6 + 2 * hash01(b.seed, 60)), go(p, 'back'), act(was === 'cower' ? 'gasp' : was, 0, spot));
      }
    }
    if (this.cast.down) this.knockDown();
    const run = this.runner;
    if (run && !run.gone && !run.hidden && !run.duty) {
      if (this.stopCar && this.kind === 'theft') this.flee();
      else if (this.kind === 'theft') {
        // The thieves run together.
        for (const b of this.bodies)
          if (b.kind === 'cast' && b.role === 'suspect' && !b.gone && !b.hidden && !b.duty && !b.leaving) this.leave(b, 'run', car.dir);
      }
      // Away from the car that comes.
      else this.leave(run, 'run', car.dir);
    }
  }

  private onContact(): void {
    if (this.contact) return;
    this.contact = true;
    this.raise('contact');
    const kind = this.kind;
    if (kind === 'brawl' || kind === 'crowd') {
      if (this.cast.down) this.knockDown();
      this.breakUp();
    } else if (kind === 'threat') {
      const w = this.wanders[0];
      if (!w) {
        // Nobody left to aim at: the officers look around.
        for (const p of this.posts) if (p.act === 'aim') p.act = 'look';
        for (const b of this.bodies) if (b.kind === 'police' && b.act === 'aim') this.setAct(b, 'look');
        return;
      }
      const armed = w.b;
      this.timers.push({ t: 2 + 2 * hash01(armed.seed, 6), scene: true, fn: () => this.surrender(armed) });
    } else if (kind === 'disorder') {
      for (const w of this.wanders) w.b.steps.push(go(w.b.mark, w.gait), act(w.rest));
      this.wanders = [];
      for (const b of this.bodies) {
        if (b.kind !== 'cast' || b.hidden || DOWN.has(b.act) || b.leaving) continue;
        if (b.act === 'sway' || b.act === 'argue' || b.act === 'smoke' || b.act === 'idle') {
          const o = this.bodies.find((x) => x.kind === 'police' && !x.hidden);
          b.steps.push(act(this.cast.drunk ? 'sway' : hash01(b.seed, 7) < 0.5 ? 'argue' : 'talk', 0, o ? [o.x, o.y] : this.site.roadSpot));
        }
      }
    } else if (kind === 'theft') {
      for (const b of this.bodies)
        if (b.kind === 'cast' && b.role === 'suspect' && !b.hidden && !b.leaving) b.steps.push(act('handsUp', 3, this.site.roadSpot), act('stand'));
    } else if (kind === 'stop') {
      const d = this.stopDriver;
      const car = this.stopCar;
      if (d && car && d.aboard) {
        // A driver who sat inside gets out after a while and comes round to the pavement.
        this.timers.push({ t: 6, scene: true, fn: () => this.driverOut() });
      }
    }
  }

  /** In a stop, the driver who sat inside gets out and comes round to the pavement; the officer at the window follows. */
  private driverOut(): void {
    const d = this.stopDriver;
    const car = this.stopCar;
    if (!d || !car || !d.aboard || d.gone || car.mode !== 'park') return;
    const kerb = this.kerbSide(car);
    const p = this.carPoint(car, 0.45, -kerb * (car.size.width / 2 + 0.55));
    d.x = p[0];
    d.y = p[1];
    d.hidden = false;
    d.aboard = false;
    car.riders = car.riders.filter((x) => x !== d);
    const to = this.safe(this.carPoint(car, 0.9, kerb * (car.size.width / 2 + 0.75)));
    d.mark = to;
    this.route(d, to, this.cast.drunk ? 'stagger' : 'walk');
    d.steps.push(act(this.cast.drunk ? 'sway' : 'talk', 0, this.site.roadSpot));
    const o = this.bodies.find((b) => b.kind === 'police' && b.act === 'lean' && !b.duty);
    if (o) {
      o.steps.length = 0;
      this.route(o, this.beside(to, 1), 'walk');
      o.steps.push(act('notes', 0, to));
    }
  }

  // -------------------------------------------------------------------------- how it ends

  private castOnStage(): Body[] {
    return this.bodies.filter((b) => b.kind === 'cast' && !b.gone && !b.aboard && !b.leaving && !b.duty);
  }

  /** The officers on foot (or behind the door). */
  private officers(): Body[] {
    return this.bodies.filter(
      (b) => b.kind === 'police' && !b.gone && !b.aboard && b.crew && (b.crew.state === 'here' || b.crew.state === 'boarding'),
    );
  }

  /** The police crew that stands here and leaves with somebody aboard, if the game names one. */
  private taker(take: UnitSit['takes']): Crew | null {
    return this.crews.find((cr) => cr.police && cr.takes === take && (cr.state === 'here' || cr.state === 'boarding') && !cr.through) ?? null;
  }

  private startPlay(sit: Situation): void {
    this.playing = true;
    this.playT = 0;
    this.playMin = 1;
    const result = sit.outcome?.result ?? null;
    // Fights and pacing are over, and so is whatever the scene had in store; what belongs to the end (a vehicle
    // about to make off) goes on.
    const fighters = this.pairs.flatMap((p) => [p.a, p.b]);
    this.pairs = [];
    this.broken = true;
    this.wanders = [];
    this.timers = this.timers.filter((tm) => !tm.scene);
    for (const b of fighters) {
      this.setGait(b, null);
      if (!b.steps.length) b.steps.push(act(b.role === 'suspect' ? 'stand' : 'idle'));
    }
    // Whoever is arrested out of a stopped car gets out of it first.
    if (result === 'arrest' && this.officers().length && !this.bodies.some((b) => b.kind === 'cast' && b.role === 'suspect' && !b.gone && !b.aboard))
      this.driverOut();
    // Whoever is still shut in a wreck is got out now (nobody is driven to hospital, or left, inside one).
    if (this.trapped && result !== 'tragedy') this.freeTrapped();
    const folk = this.castOnStage();
    const down = (b: Body) => DOWN.has(b.act) || b.steps.some((s) => s.k === 'act' && DOWN.has(s.act));
    if (this.kind === 'crash') {
      // What blocks the road is moved to the kerb once the crews have seen to the people, unless its driver
      // drives it away anyway (a crash without anybody hurt, ended with a word and a note).
      const drivesOff = !!result && !['arrest', 'escaped', 'hospital', 'tragedy'].includes(result) && !this.cast.down && !this.cast.single;
      if (!drivesOff) this.cars.filter((c) => c.kind === 'cast' && c.wreck).forEach((c, i) => this.clearWreck(c, 9 + 9 * i));
    }

    if (result === 'arrest') {
      // Everybody arrested goes with the crew the game sends to the cells; any crew will do when it names none.
      const all = this.officers();
      const takers = all.filter((o) => o.crew?.takes === 'arrest');
      // The crew that takes them does the arresting; the others lend a hand, an officer to each suspect. Whoever
      // already has the suspect in hand (they cuffed them in the street) keeps them.
      const offs = [...takers, ...all.filter((o) => !takers.includes(o))].sort((a, b) => Number(b === this.holder) - Number(a === this.holder));
      const car = (takers[0] ?? offs[0])?.crew?.car ?? null;
      const suspects = folk.filter((b) => b.role === 'suspect');
      const held = (suspects.length ? suspects : folk.filter((b) => b.role === 'driver')).slice(0, Math.max(1, sit.outcome?.arrests ?? 1));
      this.toArrest = [];
      held.forEach((s, i) => {
        if (i < offs.length && car) this.arrest(s, offs[i], car);
        else if (offs.length && car) {
          // No officer free for them yet: they wait with their hands up where they stand.
          const inside = s.inside && s.hidden;
          this.fresh(s);
          s.duty = true;
          if (!inside) s.steps.push(act('handsUp', 3), act('stand'));
          this.toArrest.push(s);
        }
        // Nobody on stage to take them: they have been taken already.
        else if (s.hidden) this.vanish(s);
      });
      this.playMin = 3;
      this.disperse(
        folk.filter((b) => !held.includes(b) || (!offs.length && !b.gone)),
        3,
        false,
        false,
      );
      return;
    }
    if (result === 'escaped') {
      const run = folk.find((b) => b.role === 'suspect' && !b.hidden && !down(b));
      if (run) {
        this.fresh(run);
        this.leave(run, 'run');
        const way = this.endOf(run);
        const o = this.officers().find((b) => !b.hidden);
        if (o) {
          // The nearest officer runs a few metres after them and comes back.
          const back: V2 = [o.x, o.y];
          const first = run.steps.find((s) => s.k === 'go');
          const aim: V2 = first && first.k === 'go' ? [first.x, first.y] : way;
          const d = Math.max(1, dist(back, aim));
          const p = this.safe(lerp2(back, aim, Math.min(1, 10 / d)));
          // A moment to take it in: the runner has a few metres' start.
          o.steps.length = 0;
          o.steps.push(wait(0.6 + 0.4 * hash01(o.seed, 9)), go(p, 'run'), act('look', 2), go(back, 'walk'), act('guard'));
        }
      }
      this.playMin = 5;
      this.disperse(
        folk.filter((b) => b !== run),
        4,
        false,
        false,
      );
      return;
    }
    if (result === 'hospital') {
      const patient =
        folk.find(down) ??
        folk.find((b) => b.role === 'victim') ??
        folk.find((b) => b.role !== 'extra' && b.role !== 'caller' && b.role !== 'witness') ??
        folk[0] ??
        null;
      this.playMin = 4;
      if (patient) this.toHospital(patient);
      this.disperse(
        folk.filter((b) => b !== patient),
        5,
        false,
        false,
      );
      return;
    }
    if (result === 'tragedy') {
      const dead = folk.find((b) => !b.hidden && (b.act === 'lie' || b.act === 'prone')) ?? null;
      const medics = this.bodies.filter((b) => b.kind === 'crew' && !b.hidden && !b.gone && b.crew?.agency === 'kiirabi');
      for (const b of this.bodies) {
        if (b.kind === 'crew' && !b.hidden && (b.act === 'aid' || b.act === 'cpr')) {
          b.steps.length = 0;
          b.steps.push(act('kneelUp', 3, null, 0.6), act('stand', 1.5, null, 0.6));
        }
      }
      if (dead) {
        const at: V2 = [dead.x, dead.y];
        this.cordon = true;
        this.dead = dead;
        const cops = this.officers().filter((b) => !b.hidden && !b.duty);
        // One of the paramedics fetches a sheet from the ambulance and covers them; with no ambulance there, an
        // officer fetches the blanket from the patrol car.
        const m = medics[0] ?? cops[cops.length - 1];
        const from = m?.crew?.car;
        // The officers stand off three to four metres, their backs to the dead, hands on the vest: nobody comes
        // near. (An arm goes up only at somebody who walks towards them: keepBack.)
        const base = Math.atan2(-this.n[1], -this.n[0]);
        const posts = cops.slice(0, 4).map((o, i) => {
          const ang = base + [0.9, -0.9, 2.3, -2.3][i];
          const p: V2 = [at[0] + Math.cos(ang) * 3.4, at[1] + Math.sin(ang) * 3.4];
          const to = this.roomAt(p, 0.3) && this.clear(p, at) ? p : this.safe(p);
          const toPost = () => {
            this.route(o, to, 'walk');
            o.steps.push(act('guard', 0, [to[0] + Math.cos(ang) * 6, to[1] + Math.sin(ang) * 6]));
          };
          if (o.post) o.post.by = null;
          o.post = null;
          o.steps.length = 0;
          o.fidget = false;
          if (o !== m) toPost();
          return toPost;
        });
        if (m && from) {
          m.duty = true;
          this.route(m, this.carPoint(from, -from.size.length / 2 - 0.7, 0), 'walk');
          m.steps.push(act('lean', 2, [from.x, from.y]), act('carry'));
          this.route(m, this.beside(at, 0, 0.7), 'walk');
          m.steps.push(
            act('crouch', 2.5, at),
            call(() => {
              this.props.push({ id: `sheet:${dead.id}`, kind: 'sheet', pos: at, yaw: dead.yaw + Math.PI, covers: dead.id });
              m.duty = false;
              this.setAct(m, 'stand');
              const own = cops.indexOf(m);
              if (own >= 0 && own < posts.length) posts[own]();
              else this.standBy(m);
            }),
          );
        }
      } else for (const b of this.bodies) if (b.kind === 'police' && !b.hidden && b.act !== 'direct' && this.atRest(b)) this.setAct(b, 'guard');
      this.playMin = 8;
      this.disperse(
        folk.filter((b) => !down(b)),
        10,
        true,
        false,
      );
      return;
    }
    if (result) {
      // A word and a note, then everybody goes their own way.
      const o = this.officers().find((b) => !b.hidden && this.atRest(b));
      const main = folk.find((b) => !b.hidden && (b.role === 'suspect' || b.role === 'driver')) ?? folk.find((b) => !b.hidden);
      if (o) {
        if (main && dist([o.x, o.y], [main.x, main.y]) < 4) o.face = [main.x, main.y];
        o.steps.push(act('notes', 4), act('guard'));
      }
      this.playMin = o ? 5 : 1;
      // A crew that drives somebody home or to a station: the one it is about gets into its car.
      const ride = this.taker('ride');
      const guest = ride
        ? (folk.find((b) => !b.hidden && (b.role === 'suspect' || b.role === 'victim')) ?? folk.find((b) => b.role === 'suspect' || b.role === 'victim') ?? null)
        : null;
      if (ride && guest) this.giveRide(guest, ride, o ? 4.5 : 1);
      this.disperse(
        folk.filter((b) => b !== guest),
        o ? 4.5 : 1,
        false,
        true,
      );
      return;
    }
    // Closed without a crew's doing: the people drift away.
    this.disperse(folk, 1, true, true);
  }

  /**
   * Officers still inside once the closing scene is under way (nobody gave them a part in it) come out one after
   * another and stand by their car: a crew left behind a door would leave the street without anybody to watch.
   */
  private bringOut(): void {
    let k = 0;
    for (const b of this.officers()) {
      if (!b.inside || !b.hidden || b.duty || b.steps.length || b.crew?.state !== 'here') continue;
      this.comeOut(b);
      b.steps.unshift(wait(2.5 + 1.2 * k++));
      this.standBy(b);
    }
  }

  /** Where an officer holds a suspect from: behind them, on the side away from the car they are walked to. */
  private holdFrom(at: V2, door: V2, from: V2): V2 {
    const away = dist(at, door) > 0.2 ? norm(sub(at, door)) : dist(at, from) > 0.2 ? norm(sub(from, at)) : this.n;
    const side: V2 = [-away[1], away[0]];
    for (const dir of [away, side, [-side[0], -side[1]] as V2]) {
      const p: V2 = [at[0] + dir[0] * 0.75, at[1] + dir[1] * 0.75];
      if (!this.wall(p[0], p[1]) && this.clear(at, p)) return p;
    }
    return at;
  }

  /**
   * Somebody armed gives up: the weapon goes down (it stays where it falls), the hands go up, they turn their back
   * to the officers and kneel (flat on the ground with a firearm). The officers keep their aim; one of them walks
   * up from behind and cuffs them where they are.
   */
  private surrender(armed: Body): void {
    if (armed.gone || armed.duty) return;
    this.release(armed);
    armed.steps.length = 0;
    const cops = this.bodies.filter((b) => b.kind === 'police' && !b.hidden && !b.gone);
    const from: V2 = cops.length ? [cops.reduce((a, b) => a + b.x, 0) / cops.length, cops.reduce((a, b) => a + b.y, 0) / cops.length] : this.site.roadSpot;
    const m = armed.mark;
    const away = dist(m, from) > 0.5 ? norm(sub(m, from)) : this.n;
    const back: V2 = [m[0] + away[0] * 4, m[1] + away[1] * 4];
    const flat = armed.held === 'pistol';
    armed.steps.push(
      go(m, 'walk'),
      act('handsUp', 0.9, from),
      call(() => {
        // Dropped a step to the side.
        if (!armed.held) return;
        const side: V2 = [m[0] - away[1] * 1.3, m[1] + away[0] * 1.3];
        const at = this.wall(side[0], side[1]) ? m : side;
        this.props.push({ id: `w:${armed.id}`, kind: armed.held, pos: at, yaw: hash01(armed.seed, 30) * TAU });
        armed.held = null;
      }),
      act('handsUp', 2, from),
      act('handsUp', 1.1, back),
      act(flat ? 'prone' : 'kneel', 0, back, 0.6),
      wait(3),
      call(() => this.closeIn(armed, from)),
    );
  }

  /** The officer nearest to somebody who has given up walks up from behind and cuffs them; then the weapons come down. */
  private closeIn(armed: Body, from: V2): void {
    if (armed.gone || armed.duty || this.over) return;
    const offs = this.bodies
      .filter((b) => b.kind === 'police' && !b.hidden && !b.duty && !b.leaving && b.crew?.state === 'here')
      .sort((a, b) => Math.hypot(a.x - armed.x, a.y - armed.y) - Math.hypot(b.x - armed.x, b.y - armed.y));
    const o = offs[0];
    if (!o) return;
    const m: V2 = [armed.x, armed.y];
    const toCops = dist(m, from) > 0.5 ? norm(sub(from, m)) : ([-this.n[0], -this.n[1]] as V2);
    // Behind their back, which is turned to the officers: straight up to them, the weapon still on them.
    const behind: V2 = [m[0] + toCops[0] * 0.75, m[1] + toCops[1] * 0.75];
    const flat = armed.act === 'prone';
    o.steps.length = 0;
    o.duty = true;
    this.holder = o;
    this.setAct(o, 'aim');
    this.route(o, this.wall(behind[0], behind[1]) ? m : behind, 'walk');
    o.steps.push(
      act(flat ? 'crouch' : 'kneelHold', 1, m),
      call(() => {
        // Hands behind the back, one after the other: four seconds.
        if (!flat) {
          armed.ease = 3.5;
          this.setAct(armed, 'kneelCuffed');
          armed.ease = 0;
        }
      }),
      wait(4),
      call(() => {
        armed.cuffed = true;
        o.duty = false;
        // Now the others lower their weapons; one of them picks up what was dropped.
        for (const p of this.posts) if (p.act === 'aim') p.act = 'guard';
        // Nobody stays at a cover post once the cuffs are on: a moment's look, then back to their own car, where
        // they write it down until they are needed.
        const rest = offs.filter((x) => x !== o && !x.duty && !x.gone);
        rest.forEach((x, i) => {
          x.steps.length = 0;
          x.fidget = false;
          x.steps.push(act('guard', 2.5 + 1.3 * i, m), call(() => this.backToCar(x, false)));
        });
        const prop = this.props.find((q) => q.id === `w:${armed.id}`);
        const picker = rest[0] ?? null;
        if (prop && picker) {
          picker.steps.length = 0;
          this.route(picker, this.beside(prop.pos, 0, 0.5), 'walk');
          picker.steps.push(
            act('crouch', 2, prop.pos),
            call(() => {
              this.props = this.props.filter((q) => q !== prop);
              // What was dropped goes into the boot of their car.
              this.backToCar(picker, true);
            }),
          );
        }
        // The one who cuffed them stays right behind them, a hand on them.
        o.steps.push(act(flat ? 'crouch' : 'kneelHold', 3, m));
        const stand: V2 = [m[0] + toCops[0] * 0.9, m[1] + toCops[1] * 0.9];
        if (!this.wall(stand[0], stand[1])) o.steps.push(go(stand, 'back'));
        o.steps.push(act('hold', 0, m));
      }),
    );
  }

  /**
   * Arrest a suspect and take them to a car: an officer walks up behind them, takes hold, cuffs them (the hands
   * come down behind the back while the officer holds them: some four seconds), walks them to the car's rear door,
   * pats them down there, and puts them in with a hand on their head. Somebody cuffed in the street already is
   * stood up and walked from there. When that is done the officer takes whoever still waits to be arrested.
   */
  private arrest(s: Body, o: Body, car: Car): void {
    const cr = o.crew;
    if (!cr) return;
    const out = s.inside && s.hidden;
    const cuffed = s.cuffed;
    const kneeling = s.act === 'kneelCuffed' || s.act === 'kneel';
    const flat = s.act === 'prone';
    this.toArrest = this.toArrest.filter((x) => x !== s);
    this.release(s);
    if (out) this.comeOut(s);
    else s.steps.length = 0;
    s.duty = true;
    // Out of a door: a step clear of it first, so the officer coming out behind has room.
    const o2 = this.site.doorOut;
    if (out && o2) {
      const p: V2 = [this.inPoint[0] + o2[0] * 0.9, this.inPoint[1] + o2[1] * 0.9];
      if (!this.wall(p[0], p[1])) s.steps.push(go(p, 'walk'));
    }
    // Hands up until the officer has them (not when they are cuffed already, or come out of the door in hand).
    if (!cuffed && !kneeling && !flat) s.steps.push(act(out ? 'cuffed' : 'handsUp'));
    const inside = o.inside && o.hidden;
    this.fresh(o);
    // Out of a door one at a time: the suspect first, the officer holding on right behind.
    if (inside) o.steps.unshift(wait(0.7));
    if (o.post) o.post.by = null;
    o.post = null;
    o.duty = true;
    o.wards = [s];
    const at = this.endOf(s);
    const from = this.endOf(o);
    const door = this.rearDoor(car);
    const search = this.rearDoor(car, 0.95);
    const frisk = this.wall(search[0], search[1]) ? door : search;
    if (dist(from, at) > 1.2) this.route(o, this.holdFrom(at, door, from), dist(from, at) > 9 ? 'run' : 'walk');
    o.steps.push(
      act('hold', 1, at),
      call(() => {
        if (cuffed || out) return;
        // The hands come down behind the back while the officer has hold of them.
        s.steps.length = 0;
        s.ease = 3.2;
        this.setAct(s, kneeling ? 'kneelCuffed' : flat ? 'prone' : 'cuffed');
        s.ease = 0;
      }),
      wait(cuffed || out ? 0.4 : 3.6),
      call(() => {
        s.cuffed = true;
        s.steps.length = 0;
        // Up from the ground, the officer's hand under the arm.
        if (kneeling || flat) s.steps.push(act('kneelUp', flat ? 1.2 : 0.2, null, 0.7), act('cuffed', 1, null, 0.8));
        else this.setAct(s, 'cuffed');
        // One walk for the two of them: the cuffed goes ahead, the officer's hand on their arm from behind (the
        // officer is kept at their side step by step, and they stop when the officer falls behind).
        s.keeper = o;
        this.route(s, frisk, 'escort');
        // Facing the car for the search.
        s.steps.push(act('cuffed', 0, [car.x, car.y]));
        // A second officer of the crew, when one is free and near, walks on their other side.
        const mate = cr.people.find((x) => x !== o && !x.duty && !x.aboard && !x.hidden && !x.gone && !x.wards.length && Math.hypot(x.x - s.x, x.y - s.y) < 6);
        if (mate && cr.car === car) {
          mate.steps.length = 0;
          mate.fidget = false;
          if (mate.post) mate.post.by = null;
          mate.post = null;
          this.setAct(mate, 'stand');
          this.route(mate, this.holdFrom([s.x, s.y], [o.x, o.y], [mate.x, mate.y]), 'walk');
          mate.steps.push(
            { k: 'follow', of: s, side: -1, stuck: 0 },
            call(() => this.backToCar(mate, false)),
          );
        }
      }),
      { k: 'follow', of: s, side: 1, stuck: 0 },
      call(() => atCar(2)),
    );
    // At the car (or short of it, the walk cut off by something in the way: then on again from where they are).
    const atCar = (tries: number): void => {
      if (tries > 0 && !s.gone && dist([s.x, s.y], frisk) > 1.3) {
        s.steps.length = 0;
        this.route(s, frisk, 'escort');
        s.steps.push(act('cuffed', 0, [car.x, car.y]));
        o.steps.push({ k: 'follow', of: s, side: 1, stuck: 0 }, call(() => atCar(tries - 1)));
        return;
      }
      {
        const behind = this.holdFrom(frisk, [car.x, car.y], [o.x, o.y]);
        if (dist([o.x, o.y], behind) > 0.35) this.route(o, behind, 'escort');
        o.steps.push(
          // Patted down from the shoulders to the ankles before anybody goes into the car.
          act('frisk', 6, frisk),
          act('hold', 0.3, frisk),
          call(() => {
            // In at the rear door, the officer's hand on their head.
            s.steps.length = 0;
            s.keeper = null;
            this.getIn(s, car, () => {
              s.aboard = true;
              s.duty = false;
              car.riders.push(s);
            });
          }),
          act('hold', 1.2, door),
          call(() => {
            o.duty = false;
            o.wards = [];
            if (this.holder === o) this.holder = null;
            const next = this.toArrest.shift();
            if (next && !next.gone && !next.aboard) this.arrest(next, o, car);
            else if (cr.car === car) {
              // Their prisoner is in: the crew gets in with them, it does not stand about outside.
              for (const x of cr.people) if (!x.aboard && !x.duty && !x.gone && !(x.inside && x.hidden)) this.toCar(x);
            } else if (cr.state === 'boarding') this.toCar(o);
            else this.standBy(o);
          }),
        );
      }
    };
  }

  /**
   * Up from the ground, as somebody does who has lain there: over onto one side, sitting, a knee and a hand on it,
   * standing. Four to five seconds, not a jump.
   */
  private getUp(b: Body): void {
    if (b.act === 'lie' || b.act === 'prone' || b.act === 'fall') b.steps.push(act('side', 0.9, null, 0.6), act('sit', 1.2, null, 0.6));
    else if (b.act !== 'sit') return;
    b.steps.push(act('kneelUp', 1.1, null, 0.6), act('stand', 1, null, 0.6));
  }

  /**
   * The patient goes with the ambulance, or with a police car that takes them, or sits and is looked after.
   * Whoever lay on the ground goes on the ambulance's stretcher; whoever sat or stood is walked to it.
   */
  private toHospital(p: Body): void {
    const amb = this.crewBy.get('a:kiirabi');
    const wasDown = DOWN.has(p.act);
    const lay = p.act === 'lie' || p.act === 'prone' || p.act === 'fall';
    // The crew the game sends to hospital takes them; else the ambulance that stands here.
    const ride = this.taker('hospital') ?? (amb && amb.state === 'here' && !amb.through ? amb : null);
    if (!ride) {
      if (p.hidden) return;
      this.release(p);
      p.steps.length = 0;
      if (lay) p.steps.push(act('side', 0.9, null, 0.6));
      p.steps.push(act('sit', 0, null, 0.6));
      this.patient = p;
      const o = this.officers().find((b) => !b.hidden && !b.duty);
      if (o) {
        o.steps.length = 0;
        this.route(o, this.beside([p.x, p.y], 0, 0.8), 'walk');
        o.steps.push(act('aid', 0, [p.x, p.y]));
      }
      return;
    }
    const car = ride.car;
    const helpers = ride.people.filter((b) => !b.aboard && !b.gone).slice(0, 2);
    // Whoever else knelt by the patient makes room.
    for (const b of this.bodies)
      if (b.kind !== 'cast' && !helpers.includes(b) && !b.steps.length && (b.act === 'aid' || b.act === 'cpr')) this.setAct(b, 'guard');
    const wasIn = p.inside && p.hidden;
    this.fresh(p);
    p.duty = true;
    const at = this.endOf(p);
    const rear = ride.police ? this.rearDoor(car) : this.carPoint(car, -car.size.length / 2 - 0.7, 0);
    const done = (h: Body) => {
      h.duty = false;
      if (ride.state === 'boarding') this.toCar(h);
      else this.standBy(h);
    };
    const aboard = () => {
      p.hidden = true;
      p.aboard = true;
      p.duty = false;
      car.riders.push(p);
    };
    for (const h of helpers) {
      const inside = h.inside && h.hidden;
      this.fresh(h);
      if (h.post) h.post.by = null;
      h.post = null;
      h.duty = true;
      if (inside && wasIn) h.steps.unshift(wait(0.6));
    }
    if (lay && !ride.police && helpers.length && !wasIn) {
      // The stretcher: one of them fetches it from the back of the ambulance while the other stays with the
      // patient; both lift; the patient is wheeled to the rear doors and in.
      const [h0, h1] = helpers;
      const out = this.carPoint(car, -car.size.length / 2 - 2.3, 0);
      const alongside = this.beside(at, 0, 0.75);
      // Whoever pushes it stops a stretcher's length short of the patient, on the ambulance's side: the stretcher,
      // before them, then stands where the patient lies.
      const reach = 1.25;
      let push: V2 = dist(at, rear) > reach ? lerp2(at, rear, reach / dist(at, rear)) : [at[0] + this.u[0] * reach, at[1] + this.u[1] * reach];
      if (this.wall(push[0], push[1])) push = [at[0] - this.n[0] * reach, at[1] - this.n[1] * reach];
      if (h1) {
        this.route(h1, alongside, 'walk');
        h1.steps.push(act('aid', 0, at));
      }
      this.route(h0, out, 'run');
      h0.steps.push(
        act('push', 1.4, rear),
        call(() => {
          this.stretcher = { by: h0, load: null, stands: null };
          this.setAct(h0, 'push');
        }),
      );
      // Pushed up to the patient: the stretcher is before whoever pushes it.
      this.route(h0, push, 'escort');
      h0.steps.push(
        act('push', 0.6, at),
        call(() => {
          if (h1) {
            h1.steps.length = 0;
            h1.steps.push(act('crouch', 2.2, at));
          }
        }),
        act('crouch', 2.2, at),
        call(() => {
          // Lifted onto it.
          p.steps.length = 0;
          p.ease = 1.1;
          this.setAct(p, 'onStretcher');
          p.ease = 0;
          p.inRoad = false;
          if (this.stretcher) {
            this.stretcher.load = p;
            // It stands where it is while whoever pushed it walks round to its other end.
            this.stretcher.stands = { pos: this.before(h0, reach), yaw: h0.yaw };
          }
          if (h1) {
            h1.steps.length = 0;
            this.setAct(h1, 'hold');
          }
          this.setAct(h0, 'stand');
        }),
        wait(1.1),
      );
      // Round to the far end, and from there it is pushed to the ambulance's rear doors, head end first.
      const far: V2 = [at[0] + (at[0] - push[0]), at[1] + (at[1] - push[1])];
      const stop = this.carPoint(car, -car.size.length / 2 - 2.5, 0);
      const goal = this.wall(stop[0], stop[1]) ? rear : stop;
      const off = () => {
        // The stretcher rolls again; the other paramedic walks beside it.
        if (this.stretcher) this.stretcher.stands = null;
        if (h1) {
          const side = this.carPoint(car, -car.size.length / 2 - 0.9, 1.1);
          this.route(h1, this.wall(side[0], side[1]) ? rear : side, 'escort');
          h1.steps.push(wait(1.5), call(() => done(h1)));
        }
      };
      // (No room at the far end: it is drawn back by the end it was pushed by.)
      if (this.wall(far[0], far[1])) h0.steps.push(call(off), go(rear, 'back'));
      else {
        this.route(h0, far, 'walk');
        h0.steps.push(act('push', 0.5, at), call(off));
        this.route(h0, goal, 'escort');
      }
      h0.steps.push(
        act('push', 0.8, [car.x, car.y]),
        call(() => {
          aboard();
          this.stretcher = null;
          this.setAct(h0, 'stand');
        }),
        wait(1),
        call(() => done(h0)),
      );
      return;
    }
    // Walked to it: the helpers stand up first and take the patient between them, who then gets up slowly.
    const start = () => {
      if (p.gone || p.aboard) return;
      p.steps.length = 0;
      this.route(p, rear, 'escort');
      p.steps.push(call(aboard));
      helpers.forEach((h, i) => {
        h.steps.length = 0;
        this.setAct(h, 'hold');
        const side = this.carPoint(car, -car.size.length / 2 - 0.9, (i ? -1 : 1) * 0.9);
        this.route(h, this.wall(side[0], side[1]) ? rear : side, 'escort');
        h.steps.push(wait(1), call(() => done(h)));
      });
    };
    helpers.forEach((h, i) => {
      if (!(h.inside && wasIn) && !wasIn) this.route(h, this.beside(at, i, 0.7), 'walk');
      h.steps.push(act('hold', 0, at));
    });
    p.steps.push(wait(helpers.length ? 1.2 : 0));
    if (wasDown) this.getUp(p);
    else p.steps.push(act('stand'));
    p.steps.push(wait(0.4), call(start));
  }

  /** Somebody is driven home (or to a station): after a word they walk to the crew's car and get in at the back. */
  private giveRide(p: Body, cr: Crew, after: number): void {
    const car = cr.car;
    const wasDown = DOWN.has(p.act);
    this.fresh(p);
    p.duty = true;
    p.inRoad = false;
    p.steps.push(wait(after));
    if (wasDown) this.getUp(p);
    else p.steps.push(act('stand'));
    p.steps.push(
      call(() => {
        this.route(p, this.rearDoor(car), this.cast.drunk ? 'stagger' : 'walk');
        p.steps.push(
          call(() => {
            p.hidden = true;
            p.aboard = true;
            p.duty = false;
            car.riders.push(p);
          }),
        );
      }),
    );
  }

  /**
   * The people of the incident go their own way, one after another from `first` seconds on. Residents go in at the
   * door, drivers drive off (`drive`), drunk people stagger; somebody on the ground sits up first.
   */
  private disperse(list: Body[], first: number, slow: boolean, drive: boolean): void {
    const indoor = this.kind === 'indoor' || this.kind === 'empty';
    const spread = slow ? 13 : Math.min(9, list.length);
    let last = first;
    const drivers = list.filter((b) => b.role === 'driver' || b === this.stopDriver);
    // (Only when crews end it: a crowd nobody came to drifts off within fifteen seconds, as everybody does.)
    const knots = this.kind === 'crowd' && !slow;
    const knot = new Map<Body, number>();
    if (knots) {
      let g = 0;
      let left = 0;
      for (const b of list) {
        if (b.role !== 'extra') continue;
        if (left <= 0) {
          g++;
          left = 1 + Math.floor(hash01(this.cast.seed, 600 + g) * 3);
        }
        knot.set(b, g);
        left--;
      }
    }
    for (const b of list) {
      if (b.gone || b.duty) continue;
      // Whoever stayed behind the door stays there.
      if (b.inside && b.hidden) {
        this.vanish(b);
        continue;
      }
      if (b.aboard) continue;
      this.release(b);
      b.steps.length = 0;
      const delay = first + spread * hash01(b.seed, 8);
      last = Math.max(last, delay);
      const medics = this.crewBy.get('a:kiirabi');
      if (DOWN.has(b.act) && medics && medics.state === 'here' && !medics.through && b.role !== 'extra') {
        // Somebody who was knocked down does not walk off past the ambulance: they sit up and stay with the
        // paramedics until those leave.
        if (b.act !== 'sit') b.steps.push(wait(Math.min(delay, 3)), act('side', 0.9, null, 0.6), act('sit', 0, null, 0.6));
        b.inRoad = false;
        this.patient = b;
        const m = medics.people.find((x) => !x.aboard && !x.gone && !x.duty);
        if (m) {
          m.steps.length = 0;
          this.route(m, this.beside([b.x, b.y], 0, 0.8), 'walk');
          m.steps.push(act('aid', 0, [b.x, b.y]));
        }
        continue;
      }
      if (knots && b.role === 'extra') {
        // A crowd breaks up in twos and threes over half a minute and more, towards both ends of the street;
        // some cross the road, one or two stay talking a while longer.
        const g = knot.get(b) ?? 0;
        const lingers = hash01(this.cast.seed, 300 + g) < 0.14;
        const at = first + 26 * hash01(this.cast.seed, 100 + g) + 1.2 * hash01(b.seed, 8) + (lingers ? 10 + 10 * hash01(this.cast.seed, 400 + g) : 0);
        last = Math.max(last, at);
        const sign = hash01(this.cast.seed, 200 + g) < 0.5 ? 1 : -1;
        const across = hash01(this.cast.seed, 500 + g) < 0.25;
        if (lingers) b.steps.push(act('talk', at), act('stand'));
        else b.steps.push(wait(at));
        b.steps.push(call(() => this.leave(b, 'walk', sign, across)));
        continue;
      }
      const wreck = this.kind === 'crash' && this.toClear > 0 && b.role === 'driver' ? this.wreckOf(b) : null;
      if (wreck && wreck.wreck && wreck.mode === 'park') {
        // Their car still stands in the road: nobody walks away from it. They wait beside it (up from the kerb if
        // they sat there) until it is their turn to move it, and stay by it until the police go.
        if (DOWN.has(b.act)) {
          b.steps.push(wait(Math.min(delay, 4)));
          this.getUp(b);
        }
        b.inRoad = false;
        b.steps.push(act(hash01(b.seed, 53) < 0.5 ? 'phone' : 'idle', 0, [wreck.x, wreck.y]));
        continue;
      }
      b.steps.push(wait(delay));
      if (DOWN.has(b.act)) this.getUp(b);
      b.inRoad = false;
      const car = drive ? this.rideOf(b, drivers) : null;
      if (car) {
        car.due.push(b);
        b.steps.push(
          call(() => {
            this.route(b, this.carPoint(car, 0.45, -this.kerbSide(car) * (car.size.width / 2 + 0.55)), 'walk');
            b.steps.push(
              call(() => {
                b.hidden = true;
                b.aboard = true;
                car.riders.push(b);
              }),
            );
          }),
        );
        continue;
      }
      const gait: Gait = this.cast.drunk && (b.role === 'suspect' || b.act === 'sway') && !slow ? 'stagger' : 'walk';
      b.steps.push(
        call(() => {
          if (indoor && this.hasDoor && b.role !== 'extra') {
            this.enter(b, gait);
            b.steps.push({ k: 'gone' });
          } else this.leave(b, gait);
        }),
      );
    }
    if (drive) {
      // A vehicle that can drive leaves ten seconds on, or when its driver is in.
      let k = 0;
      for (const car of this.cars) {
        if (car.kind !== 'cast' || car.mode !== 'park') continue;
        if (this.kind === 'crash' ? this.cast.down || this.cast.single : car !== this.stopCar) continue;
        this.timers.push({ t: Math.max(10, last + 4) + 3 * k++, scene: false, fn: () => this.pullOut(car, false) });
      }
    }
  }

  /** The crashed vehicle a driver of the incident came in (the first driver's is the first vehicle, and so on). */
  private wreckOf(b: Body): Car | null {
    const drivers = this.bodies.filter((x) => x.kind === 'cast' && x.role === 'driver');
    return this.cars.filter((c) => c.kind === 'cast')[drivers.indexOf(b)] ?? null;
  }

  /** The vehicle somebody of the incident drives away in, if any. */
  private rideOf(b: Body, drivers: Body[]): Car | null {
    const i = drivers.indexOf(b);
    if (i < 0) return null;
    if (this.kind === 'crash') {
      if (this.cast.down || this.cast.single) return null;
      const wrecks = this.cars.filter((c) => c.kind === 'cast' && c.mode === 'park');
      return wrecks[i] ?? null;
    }
    return b === this.stopDriver && this.stopCar && this.stopCar.mode === 'park' ? this.stopCar : null;
  }

  /** A vehicle of the incident drives away. */
  private pullOut(car: Car, hard: boolean): void {
    if (car.mode !== 'park') return;
    if (!this.canPullOut(car, 0, 0.3)) {
      this.timers.push({ t: 0.3, scene: false, fn: () => this.pullOut(car, hard) });
      return;
    }
    car.lamps = true;
    car.hazard = false;
    car.wreck = false;
    // A wreck comes free of the other one first.
    if (car.yawOff) car.back = clamp(this.roomBehind(car) - 0.8, 0, 2.5);
    this.driveOff(car, hard);
    // Whoever follows it (8.4 stop) goes the same way.
    if (hard) this.fleeDir = (car.mode as Car['mode']) === 'turn' ? (-car.dir as 1 | -1) : car.dir;
  }

  /** The suspect's vehicle makes off: whoever belongs to it jumps in, and it is gone. */
  private flee(): void {
    this.fled = true;
    if (this.sit?.pursuit === 'on') {
      // No officer stands talking to an empty pavement: every crew here is running for its doors.
      for (const cr of this.crews) {
        if (!cr.police || cr.state !== 'here' || cr.through) continue;
        cr.run = true;
        for (const b of cr.people) if (!b.aboard && !b.duty && !b.gone) this.toCar(b);
      }
    }
    const car = this.stopCar;
    if (!car || car.mode !== 'park') return;
    this.stopCar = null;
    let late = 0.8;
    for (const b of this.bodies) {
      if (b.kind !== 'cast' || b.gone || b.aboard || b.hidden || b.duty) continue;
      if (b.role !== 'suspect' && b !== this.stopDriver) continue;
      this.release(b);
      b.steps.length = 0;
      // On their way to the car: a closing scene that starts meanwhile leaves them to it.
      b.duty = true;
      this.route(b, this.carPoint(car, 0.45, -this.kerbSide(car) * (car.size.width / 2 + 0.55)), 'run');
      b.steps.push(
        call(() => {
          b.duty = false;
          if (car.mode === 'gone' || dist([b.x, b.y], [car.x, car.y]) > 6) {
            // Too late: the car has gone without them.
            this.leave(b, 'run');
            return;
          }
          b.hidden = true;
          b.aboard = true;
          car.riders.push(b);
        }),
      );
      // The car waits for whoever runs to it, as long as that is a few seconds.
      let way = 0;
      let at: V2 = [b.x, b.y];
      for (const st of b.steps) {
        if (st.k !== 'go') continue;
        way += dist(at, [st.x, st.y]);
        at = [st.x, st.y];
      }
      late = Math.max(late, way / PACE.run + 0.4);
    }
    this.timers.push({ t: Math.min(late, 3.5), scene: false, fn: () => this.pullOut(car, true) });
  }

  /** The story is over and the crews have gone: nobody of the incident stays in the street. */
  private tidy(): void {
    const tragedy = this.sit?.outcome?.result === 'tragedy';
    this.driversGo();
    for (const b of this.bodies) {
      if (b.kind !== 'cast' || b.gone || b.leaving) continue;
      // The dead do not get up and go. (Seen, they stay where they lie; see lastCrewLeaves.)
      if (tragedy && !b.hidden && (b === this.dead || b.act === 'lie' || b.act === 'prone')) {
        if (this.settling) this.vanish(b);
        continue;
      }
      if (b.hidden) this.vanish(b);
      else if (this.atRest(b)) {
        if (DOWN.has(b.act)) this.getUp(b);
        b.steps.push(call(() => this.leave(b, 'walk')));
      }
    }
    for (const c of this.cars) if (c.kind === 'cast' && c.mode === 'park' && !c.hazard) c.lamps = false;
  }

  /**
   * The drivers of a crash who stayed by their cars go their way: the last police crew is going, or there is no
   * police to wait for (none ever came, the street has emptied).
   */
  private driversGo(): void {
    if (this.kind !== 'crash' || !this.over) return;
    for (const b of this.bodies) {
      if (b.kind !== 'cast' || b.role !== 'driver' || b.gone || b.hidden || b.duty || b.leaving || b.aboard) continue;
      const last = b.steps[b.steps.length - 1];
      if (b.fidget || (!DOWN.has(b.act) && b.steps.every((x) => x.k === 'act' || x.k === 'wait'))) {
        // Standing by their car, on the phone or not: nothing they still have to do.
        b.steps.length = 0;
        b.fidget = false;
      } else if (last && last.k === 'act' && !last.t && !DOWN.has(last.act)) {
        // Still on the way to that (out of the wreck and onto the pavement, up from the kerb): they finish it, and
        // do not stay.
        b.steps.pop();
      } else continue;
      b.steps.push(wait(2 + 4 * hash01(b.seed, 55)), call(() => this.leave(b, 'walk')));
    }
  }

  /** The last police crew goes: what they could not leave behind goes with them. */
  private lastCrewLeaves(cr: Crew): void {
    const p = this.patient;
    this.patient = null;
    if (p && !p.gone && !p.aboard) {
      if (cr.takes === 'hospital' && cr.people.length) {
        const o = cr.people.find((b) => !b.aboard && !b.gone) ?? cr.people[0];
        p.duty = true;
        p.steps.length = 0;
        p.steps.push(act('stand', 0.8));
        this.route(p, this.rearDoor(cr.car), 'escort');
        p.steps.push(
          call(() => {
            p.hidden = true;
            p.aboard = true;
            p.duty = false;
            cr.car.riders.push(p);
          }),
        );
        o.steps.length = 0;
        o.steps.push(wait(1));
      } else {
        p.steps.length = 0;
        this.getUp(p);
        p.steps.push(
          wait(1),
          call(() => this.leave(p, 'walk')),
        );
      }
    }
    this.driversGo();
    // Whoever lies dead there is never taken out of a picture somebody looks at: they stay under their sheet, the
    // pavement round them stays closed, and the camera's own end comes soon after. Only a camera opened when all
    // this is long over (the stage being settled before its first picture) finds them taken away.
    if (this.over && this.settling && this.sit?.outcome?.result === 'tragedy') {
      for (const b of this.bodies) if (b.kind === 'cast' && !b.gone && !b.hidden && !b.duty && !b.leaving && DOWN.has(b.act) && !b.steps.length) this.vanish(b);
      this.dead = null;
      this.cordon = false;
    }
  }

  // -------------------------------------------------------------------------- vehicles

  private car(id: string, look: CarLook, kind: Car['kind']): Car {
    const c: Car = {
      id,
      look,
      size: CAR_SIZE[look.body],
      kind,
      s: 0,
      lat: 0,
      dir: 1,
      v: 0,
      yawOff: 0,
      steer: 0,
      mode: 'park',
      ts: 0,
      tlat: 0,
      stop: true,
      vc: 0,
      acc: 2.6,
      brake: 4.5,
      eta: 0,
      turnT: 0,
      turnFrom: 0,
      turnTo: 0,
      beacons: false,
      lamps: false,
      hazard: false,
      braking: false,
      wreck: false,
      back: 0,
      wait: 0,
      shunts: 0,
      due: [],
      x: 0,
      y: 0,
      yaw: 0,
      riders: [],
      wx: 0,
      wy: 0,
      wyaw: 0,
      wseen: false,
    };
    this.cars.push(c);
    return c;
  }

  private park(c: Car, s: number, lat: number, dir: 1 | -1, yawOff = 0): void {
    c.s = clamp(s, 1, this.length - 1);
    c.lat = lat;
    c.dir = dir;
    c.yawOff = yawOff;
    c.mode = 'park';
    c.v = 0;
    c.ts = c.s;
    c.tlat = lat;
    this.pose(c);
  }

  /** A vehicle of the incident at the kerb on the incident's side: the first at the spot, the next ones behind it. */
  private kerbCar(id: string, look: CarLook, k: number): Car {
    const c = this.car(id, look, 'cast');
    const lat = this.site.side * this.kerbLat();
    // Right-hand traffic: at the kerb it points the way its side of the road runs.
    const dir: 1 | -1 = lat > 0 ? -1 : 1;
    // Behind one another with room to pull out.
    let s = this.at - dir * (c.size.length + ROOM_M) * k;
    for (let i = 0; i < 60 && this.taken(c, c.size, s, lat, k ? ROOM_M : 1); i++) s -= dir;
    this.park(c, s, lat, dir);
    return c;
  }

  /** How far from the road's middle a vehicle stands at the kerb: on the middle itself where the road is a lane with no room to pull in. */
  private kerbLat(): number {
    return this.width < KERB_MIN_M ? 0 : this.width / 2 - 1.15;
  }

  private laneOf(dir: number): number {
    return this.width < NARROW_M ? 0 : dir > 0 ? -this.width / 4 : this.width / 4;
  }

  /** Which side of a vehicle its kerb is on: 1 left, -1 right. */
  private kerbSide(c: Car): 1 | -1 {
    const side = Math.abs(c.lat) > 0.2 ? Math.sign(c.lat) : this.site.side;
    return (side * c.dir > 0 ? 1 : -1) as 1 | -1;
  }

  /** A point in a vehicle's own frame: `f` metres ahead of its middle, `l` metres to its left. */
  private carPoint(c: Car, f: number, l: number): V2 {
    const fx = Math.cos(c.yaw);
    const fy = Math.sin(c.yaw);
    return [c.x + fx * f - fy * l, c.y + fy * f + fx * l];
  }

  /** Where the i-th of a crew gets out: driver, front passenger, then the rear doors; a van's crew at its side door. */
  private doorOf(c: Car, i: number): V2 {
    const w = c.size.width / 2 + 0.55;
    const body = c.look.body;
    if (body === 'van' || body === 'truck' || body === 'bus') {
      if (i === 0) return this.carPoint(c, c.size.length / 2 - 1.1, w);
      return this.carPoint(c, c.size.length / 2 - 1.3 - 0.9 * (i - 1), -w);
    }
    return this.carPoint(c, i < 2 ? 0.45 : -0.75, i === 0 || i === 3 ? w : -w);
  }

  /**
   * The place beside a car's rear door somebody is put in at, `off` metres from its side: on the kerb's side, or
   * on the road's side where the kerb's is against a wall or a parked car.
   */
  private rearDoor(c: Car, off = 0.6): V2 {
    const kerb = this.kerbSide(c);
    const p = this.carPoint(c, -0.75, kerb * (c.size.width / 2 + off));
    if (!this.wall(p[0], p[1])) return p;
    const q = this.carPoint(c, -0.75, -kerb * (c.size.width / 2 + off));
    return this.wall(q[0], q[1]) ? p : q;
  }

  /**
   * The door the i-th of a crew really uses: their own, or, where that one opens into a wall or a parked car, the
   * other door of the same side of the cabin's other half (front for rear, rear for front) across the vehicle.
   */
  private doorAt(c: Car, i: number): V2 {
    const p = this.doorOf(c, i);
    if (!this.wall(p[0], p[1])) return p;
    const dx = p[0] - c.x;
    const dy = p[1] - c.y;
    const f = dx * Math.cos(c.yaw) + dy * Math.sin(c.yaw);
    const l = dy * Math.cos(c.yaw) - dx * Math.sin(c.yaw);
    const body = c.look.body;
    const q = this.carPoint(c, body === 'van' || body === 'truck' || body === 'bus' ? f - 0.9 : f > 0 ? -0.75 : 0.45, -l);
    return this.wall(q[0], q[1]) ? p : q;
  }

  /**
   * A vehicle's place and heading from its place on the drive line. The line is a polyline: the direction is taken
   * over a few metres about the point, so a vehicle swings through a bend instead of snapping round its corner.
   */
  private pose(c: Car): void {
    const pts = this.site.drive.pts;
    const s = clamp(c.s, 0, this.length);
    const at = pointAlong(pts, s).pt;
    const a = pointAlong(pts, Math.max(0, s - 3)).pt;
    const b = pointAlong(pts, Math.min(this.length, s + 3)).pt;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dx = (b[0] - a[0]) / l;
    const dy = (b[1] - a[1]) / l;
    c.x = at[0] - dy * c.lat;
    c.y = at[1] + dx * c.lat;
    c.yaw = Math.atan2(dy, dx) + (c.dir < 0 ? Math.PI : 0) + c.yawOff + c.steer;
  }

  /** Half the length and half the width a vehicle takes up along and across the road: a wreck stands at an angle. */
  private ext(c: Car): [number, number] {
    const l = c.size.length / 2;
    const w = c.size.width / 2;
    if (c.mode === 'turn') {
      const r = Math.hypot(l, w);
      return [r, r];
    }
    if (!c.yawOff) return [l, w];
    const co = Math.abs(Math.cos(c.yawOff));
    const si = Math.abs(Math.sin(c.yawOff));
    return [l * co + w * si, w * co + l * si];
  }

  /** Does a place at the kerb overlap a vehicle standing or about to stand there (with `room` metres before and behind)? */
  private taken(me: Car | null, size: CarSize, s: number, lat: number, room = 1, beside = PARK_SIDE, dir: 1 | -1 | 0 = 0): boolean {
    for (const p of this.kerbCars) {
      if (Math.abs(p.lat - lat) - p.ew - size.width / 2 >= beside) continue;
      // Whoever drives in needs road behind the place to swing in past the car parked there; the car before it
      // only has to be clear (a vehicle backs off a little to get out).
      const gap = (p.s - s) * dir < 0 && beside >= PARK_SIDE ? PARK_IN : PARK_GAP;
      if (Math.abs(p.s - s) < p.el + size.length / 2 + gap) return true;
    }
    for (const o of this.cars) {
      if (o === me || o.mode === 'gone' || (o.mode === 'drive' && !o.stop)) continue;
      const parked = o.mode === 'park' || o.mode === 'turn';
      const os = parked ? o.s : o.ts;
      const ol = parked ? o.lat : o.tlat;
      const [el, ew] = this.ext(o);
      const side = Math.abs(ol - lat) - ew - size.width / 2;
      if (side < 1) {
        if (Math.abs(os - s) < el + size.length / 2 + room) return true;
        // One on its way to its place swings in to it over the kerb before it: nothing else is squeezed in there.
        if (!parked && (s - os) * o.dir < 0 && Math.abs(os - s) < el + size.length / 2 + ROOM_M) return true;
      } else if (side < PASS_M && room > 1) {
        // Across the road from it there would be no way through between the two: far enough along for whoever
        // passes (the longest vehicle that may come, a rescue lorry) to swing from the one's side to the other's.
        if (Math.abs(os - s) < el + size.length / 2 + LONGEST_M + 2 + (PASS_M - side) / 0.6) return true;
      }
    }
    return false;
  }

  /**
   * The place an arriving crew stops at, as a crew chooses it: at the scene's side of the road whichever way that
   * faces, a few metres short of the scene (twelve before a wreck that blocks the lane, ten from somebody armed,
   * further when an ambulance will need the kerb beside whoever is down), with room to pull out; an ambulance
   * (`medic`) level with its patient. Every free place is weighed: the walk to the scene, a road to cross on foot,
   * driving past the scene, and, where the site says what the camera sees (`site.seen`), stopping in the picture
   * before anything else. Where cars are parked along the kerb it stops in the lane beside them, as long as three
   * metres of road stay free. Never beyond what blocks the road, in a parked car or on a taken place: null when
   * the road has no room left.
   */
  private slot(size: CarSize, fromA: boolean, medic = false): { s: number; lat: number; cost: number } | null {
    const back = fromA ? -1 : 1;
    const crash = this.kind === 'crash' && !this.cast.single;
    const block = this.blockS();
    const folk = this.roadFolk();
    const seen = this.site.seen;
    const sceneLat = this.site.side * this.kerbLat();
    const lats = sceneLat ? [sceneLat, -sceneLat] : [sceneLat];
    let target = this.at;
    let ideal = STOP_M;
    let least = MIN_STOP_M;
    /** The side of the target the ambulance will come from (-1: the road's start, 1: its end, 0: no matter). */
    let medicBack = 0;
    // A vehicle pulled over: the crew stops behind it, never ahead of it.
    const stopped = this.kind === 'stop' && this.stopCar && this.stopCar.mode === 'park' ? this.stopCar : null;
    const down = this.downBody();
    const ambulance = this.sit?.agencies.some((a) => a.agency === 'kiirabi') || this.cast.down;
    if (crash) {
      // Twelve metres short of the wrecks, or ten where that keeps the car in the picture.
      ideal = 12;
      least = 10;
    } else if (this.kind === 'threat' && this.phase !== 'after' && !this.over) {
      ideal = 10;
      least = 9;
    } else if (medic && down) {
      target = nearestOnLine([down.x, down.y], this.site.drive.pts).s;
      ideal = least = 0;
    } else if (!medic && ambulance && (down || this.cast.down)) {
      // The kerb beside whoever is down is the ambulance's.
      ideal = 9.5;
      least = 9;
      // And so is the way to it: a patrol does not stop between whoever is down and the end of the road the
      // ambulance will come by (spawnAgency), where it would have to get past the patrol car.
      if (!down?.inRoad && !this.crewBy.has('a:kiirabi') && !this.done.has('a:kiirabi')) {
        const d = this.site.drive;
        let a = (hash32('from', this.cast.seed, 'kiirabi') & 1) === 0;
        if (a ? d.deadA && !d.deadB : d.deadB && !d.deadA) a = !a;
        medicBack = a ? -1 : 1;
      }
    }
    const cost = (s: number, lat: number) => {
      const d = Math.abs(s - target);
      let c = Math.abs(d - ideal);
      // Across the road from the scene: the crew would cross it on foot, and back with whoever they take.
      if (lat * this.site.side < 0) c += this.width + 5;
      // Past the scene: nobody drives by somebody armed, or stops ahead of the car they pulled over.
      if ((s - target) * back < -0.5) c += this.kind === 'threat' || stopped ? 30 : 3;
      if (medicBack && (s - target) * medicBack > 0) c += 8;
      // The whole car in the stretch the camera sees.
      if (seen && (s - size.length / 2 < seen.from || s + size.length / 2 > seen.to)) c += 60;
      return c;
    };
    // Out of the picture (the stretch is the road's middle: a kerb place at its edge can still be cut off).
    const OUT = 40;
    // Not beyond a place where the road is shut for it (vehicles standing side by side, or beside parked cars).
    const from = fromA ? 0 : this.length;
    const shut = this.pinches(size, null);
    // With room to pull out forwards; where the road is too short for that, close up behind what stands there,
    // and nearer the scene than a crew would like; where every kerb is parked up and the road is too narrow to
    // leave room beside the parked cars, in the lane all the same (a crew does not stay away).
    // A place out of the picture is taken only when no closer fit (less room to pull out) is in it.
    let spare: { s: number; lat: number; cost: number } | null = null;
    for (const [room, free] of [
      [ROOM_M, PASS_FREE],
      [1.2, PASS_FREE],
      [1.2, 0],
    ]) {
      for (const min of least > MIN_STOP_M ? [least, MIN_STOP_M] : [least]) {
        let best: { s: number; lat: number; cost: number } | null = null;
        let bestC = Infinity;
        for (const kerb of lats) {
          for (let d = -70; d <= 70; d++) {
            const s = target + d;
            if (Math.abs(d) < min || s < 3.5 || s > this.length - 3.5) continue;
            if (block !== null && (s - block) * back < 6) continue;
            if (stopped && (s - stopped.s) * stopped.dir > 0 && Math.abs(kerb - stopped.lat) < 0.5) continue;
            if (shut.some((q) => (q - from) * (s - q) > 0 && Math.abs(q - s) > 1)) continue;
            // At the kerb, or in the lane beside the cars parked there; an ambulance on a road that is shut anyway
            // (wrecks across it) in the lane itself, as near to whoever is hurt as it gets.
            const out = this.besideParked(size, s, kerb, free);
            const lane = medic && block !== null && this.width >= NARROW_M ? Math.sign(kerb || 1) * (this.width / 4) : null;
            for (const lat of [kerb, ...(out === null ? [] : [out]), ...(lane === null ? [] : [lane])]) {
              let c = cost(s, lat) + (lat === kerb ? 0 : 1.5);
              if (c >= bestC) continue;
              if (c < OUT && !this.inPicture(size, s, lat)) c += OUT;
              if (c >= bestC) continue;
              if (this.taken(null, size, s, lat, room, lat === kerb ? PARK_SIDE : 0.3, fromA ? 1 : -1)) continue;
              // Across the road from the lane it comes by, it swings in over a longer stretch: so much more
              // free kerb before the place.
              if (lat * back < -0.3 && this.taken(null, size, s + back * 4.5, lat, 0.5, lat === kerb ? PARK_SIDE : 0.3, fromA ? 1 : -1)) continue;
              if (folk.some((p) => p.still && Math.abs(p.s - s) < size.length / 2 + 1 && Math.abs(p.lat - lat) < size.width / 2 + 0.6)) continue;
              best = { s, lat, cost: c };
              bestC = c;
            }
          }
        }
        if (!best) continue;
        if (best.cost < OUT || min !== least) return spare && spare.cost <= best.cost ? spare : best;
        if (!spare || best.cost < spare.cost) spare = best;
        break;
      }
    }
    return spare;
  }

  /** Would a vehicle standing at a place of the road be whole in the camera's picture (every corner of its body)? */
  private inPicture(size: CarSize, s: number, lat: number): boolean {
    const at = onDrive(this.site.drive, s, lat);
    const fx = at.dir[0] * (size.length / 2);
    const fy = at.dir[1] * (size.length / 2);
    const lx = -at.dir[1] * (size.width / 2);
    const ly = at.dir[0] * (size.width / 2);
    for (const f of [-1, 1]) {
      for (const l of [-1, 1]) {
        for (const h of [0, size.height]) {
          const q = projectPoint(this.site.camera, [at.pos[0] + fx * f + lx * l, at.pos[1] + fy * f + ly * l], h);
          if (!(q.z > 0.5 && Math.abs(q.x) <= 0.98 && Math.abs(q.y) <= 0.98)) return false;
        }
      }
    }
    return true;
  }

  /**
   * The place in the lane beside the cars parked at a kerb, `s` metres along: how far to the left of the drive
   * line a vehicle stands there, half a metre off them. Null when no car is parked at that kerb there, or when
   * less than `free` metres of road would stay free beside the vehicle.
   */
  private besideParked(size: CarSize, s: number, kerb: number, free: number): number | null {
    const sg = kerb >= 0 ? 1 : -1;
    const reach = size.length / 2 + PARK_GAP;
    let inner = Infinity;
    // The far side of the road: its edge, or the cars parked along it.
    let far = this.width / 2;
    for (const p of this.kerbCars) {
      if (Math.abs(p.s - s) > p.el + reach || Math.abs(p.lat) - p.ew > this.width / 2) continue;
      if (p.lat * sg > 0) inner = Math.min(inner, Math.abs(p.lat) - p.ew);
      else far = Math.min(far, Math.abs(p.lat) - p.ew);
    }
    if (inner === Infinity) return null;
    const lat = inner - 0.5 - size.width / 2;
    return lat - size.width / 2 + far >= free ? sg * lat : null;
  }

  /**
   * Where along the road a vehicle of this size cannot get through just now: beside each vehicle of the scene
   * that stands (or is about to stand) with less than the vehicle's width and a hand's breadth free on either
   * side of it, between the road's edges and the cars parked along them.
   */
  private pinches(size: CarSize, me: Car | null): number[] {
    const out: number[] = [];
    const need = size.width + 0.6;
    for (const o of this.cars) {
      if (o === me || o.mode === 'gone' || o.kind === 'traffic' || (o.mode === 'drive' && !o.stop)) continue;
      const standing = o.mode !== 'drive';
      const os = standing ? o.s : o.ts;
      const ol = standing ? o.lat : o.tlat;
      const [el, ew] = this.ext(o);
      let left = this.width / 2 + 0.5;
      let right = -left;
      for (const p of this.kerbCars) {
        if (Math.abs(p.s - os) > p.el + el + 1) continue;
        if (p.lat > ol) left = Math.min(left, p.lat - p.ew);
        else right = Math.max(right, p.lat + p.ew);
      }
      if (left - (ol + ew) < need && ol - ew - right < need) out.push(os);
    }
    // A parked car that reaches so far into the road that nothing of this width gets by (a bend's inside): the
    // parked cars stand for good, so this is worked out once for each width.
    let fixed = this.parkedShut.get(size.width);
    if (!fixed) {
      fixed = [];
      for (const p of this.kerbCars) {
        if (Math.abs(p.lat) - p.ew > this.width / 2 - need) continue;
        let left = this.width / 2 + 0.5;
        let right = -left;
        for (const q of this.kerbCars) {
          if (q === p || Math.abs(q.s - p.s) > q.el + p.el + 1) continue;
          if (q.lat > p.lat) left = Math.min(left, q.lat - q.ew);
          else right = Math.max(right, q.lat + q.ew);
        }
        if (left - (p.lat + p.ew) < need && p.lat - p.ew - right < need) fixed.push(p.s);
      }
      this.parkedShut.set(size.width, fixed);
    }
    return fixed.length ? out.concat(fixed) : out;
  }

  /** Whoever of the incident is on the ground in sight (the first of them), for those who come to help. */
  private downBody(): Body | null {
    return this.bodies.find((x) => x.kind === 'cast' && !x.gone && !x.hidden && (x.act === 'lie' || x.act === 'sit' || x.act === 'fall')) ?? null;
  }

  /**
   * The way in for an arriving vehicle: from the end the game names when it can (nobody comes out of a dead end
   * while the other end is open, or through what blocks the road), else from the other one. 'wait' while the way
   * in is taken for the moment; null when there is no place to stop at all (the vehicle stays out of the picture).
   * Vehicles from the two ends of the road come in turn: while one drives up to its place, nobody sets out from
   * the other end (each would have to cross the other's way to reach a kerb or to get round what stands there).
   */
  private wayIn(size: CarSize, fromA: boolean, medic = false): { fromA: boolean; s: number; lat: number } | 'wait' | null {
    const d = this.site.drive;
    // Out of a dead end only when the other end is one as well, and then not from the one that is a house's wall.
    // (From there all the same when the road has no place for it from its open end: a crew does not stay away.)
    const walled = (a: boolean) => (a ? this.wallA : this.wallB) && !(a ? this.wallB : this.wallA);
    const open = (a: boolean) => !(a ? d.deadA : d.deadB) || (a ? d.deadB : d.deadA);
    let found: { fromA: boolean; s: number; lat: number; cost: number } | null = null;
    const ends = [fromA, !fromA].filter(open);
    for (const a of [...ends.filter((e) => !walled(e)), ...ends.filter(walled)]) {
      if (walled(a) && found) break;
      const s0 = a ? 0 : this.length;
      const dir = a ? 1 : -1;
      const lane = this.laneOf(dir);
      let shut = false;
      let now = false;
      for (const o of this.cars) {
        if (o.mode === 'gone') continue;
        const [el, ew] = this.ext(o);
        const near = Math.abs(o.s - s0) < el + size.length / 2 + 6;
        if (o.mode === 'park') {
          // Something stands in the mouth of the road.
          if (near && Math.abs(o.lat - lane) < ew + size.width / 2 + 0.2 && Math.abs(o.s - s0) < el + size.length / 2 + 1) shut = true;
        } else if (near || this.width < NARROW_M || (o.mode === 'drive' && o.stop && o.dir !== dir)) now = true;
      }
      if (shut) continue;
      const place = this.slot(size, a, medic);
      if (!place) continue;
      // Taken for the moment: it waits for its turn at this end (it does not come round by the other one instead).
      if (now) return found ? { fromA: found.fromA, s: found.s, lat: found.lat } : 'wait';
      // The end the game names, unless from there it could only stop far from the scene (the road is shut
      // between) and from the other end it gets near.
      if (!found || place.cost < found.cost - 25) found = { fromA: a, ...place };
      if (found.cost < 25) break;
    }
    return found;
  }

  /** Set a stopping vehicle's speed so that it stands at its place in about `T` seconds. */
  private plan(c: Car, T: number): void {
    const D = Math.abs(c.ts - c.s);
    const t = clamp(T, 1.5, 10);
    const a = clamp((2.4 * D) / (t * t), 3, 9);
    const disc = t * t - (2 * D) / a;
    c.brake = a;
    c.vc = clamp(disc > 0 ? a * (t - Math.sqrt(disc)) : Math.sqrt(2 * a * D), 5, 24);
    c.acc = 5;
    c.eta = D / c.vc + c.vc / (2 * a);
  }

  /** Where the carriageway is blocked (wrecks, somebody lying in it), or null. */
  private blockS(): number | null {
    for (const c of this.cars) if (c.wreck && c.mode === 'park') return c.s;
    for (const b of this.bodies) if (b.inRoad && !b.gone && !b.hidden && DOWN.has(b.act)) return this.at;
    return null;
  }

  /**
   * How bad the way is in a direction from a place: 0 open, 1 the road ends, 2 blocked (by what blocks the
   * carriageway, or on a road of one lane by any vehicle standing further along it).
   */
  private wayCost(s: number, dir: number, me: Car | null = null): number {
    const block = this.blockS();
    if (block !== null && (block - s) * dir > 0.5) return 2;
    if (me && this.pinches(me.size, me).some((q) => (q - s) * dir > 1)) return 2;
    if (this.width < NARROW_M && this.cars.some((o) => o.mode === 'park' && (o.s - s) * dir > 1)) return 2;
    const d = this.site.drive;
    if (!(dir > 0 ? d.deadB : d.deadA)) return 0;
    // A road that ends is a worse way out than an open one, and one that ends at a wall worse than one that just ends.
    return (dir > 0 ? this.wallB : this.wallA) ? 1.5 : 1;
  }

  /** Does a parked vehicle turn round to leave? Yes when the way ahead is worse, or when it has to go the other way (`want`). */
  private turnsRound(c: Car, want: 1 | -1 | 0): boolean {
    return want ? want !== c.dir && this.wayCost(c.s, want, c) < 2 : this.wayCost(c.s, -c.dir, c) < this.wayCost(c.s, c.dir, c);
  }

  /**
   * Drive off the end of the road: straight on, or turned round first (`want`: the way it has to go, after a
   * vehicle that made off).
   */
  private driveOff(c: Car, fast: boolean, want: 1 | -1 | 0 = 0): void {
    c.stop = false;
    c.vc = fast ? 17 : 11;
    c.acc = fast ? 5 : 2.6;
    c.eta = 0;
    c.wait = 0;
    if (c.mode === 'park' && this.turnsRound(c, want)) {
      c.mode = 'turn';
      c.turnT = 0;
      c.turnFrom = c.lat;
      c.turnTo = Math.abs(c.lat) > 0.3 && !c.wreck && !this.taken(c, c.size, c.s, -c.lat, 0.5) ? -c.lat : c.lat;
      c.ts = c.dir > 0 ? 0 : this.length;
      return;
    }
    c.mode = 'drive';
    c.ts = c.dir > 0 ? this.length : 0;
    // Wedged in behind something at its kerb: back off first as far as it takes to steer out.
    if (c.back <= 0) {
      const need = this.squeezed(c, this.laneOf(c.dir));
      if (need > 0) c.back = clamp(Math.min(need, this.roomBehind(c) - 0.8), 0, 4);
    }
  }

  /**
   * May a parked vehicle pull out now? Not while those it waits for are on their way to it, somebody stands right
   * before it, another vehicle is passing or about to, or somebody drives towards it on the way it leaves by.
   * After a minute it goes regardless.
   */
  private canPullOut(c: Car, want: 1 | -1 | 0, dt: number): boolean {
    c.wait += dt;
    const round = this.turnsRound(c, want);
    const dir = round ? -c.dir : c.dir;
    // On a road of one lane nobody drives into a vehicle standing in the way: it waits until that one has gone
    // (a car of the incident for as long as it takes, and that is no time stuck; a crew for a minute at most).
    if (this.width < NARROW_M && this.wayCost(c.s, dir) === 2) {
      if (c.kind === 'cast') {
        c.wait = 0;
        return false;
      }
      if (c.wait <= 60) return false;
    }
    if (c.wait > 60) return true;
    if (c.due.some((b) => !b.gone && !b.aboard && !b.leaving)) return false;
    const hl = c.size.length / 2;
    const hw = c.size.width / 2;
    if (round) {
      // Turning round takes room: not with a vehicle standing within its swing, and not to end up nose to nose
      // with one that stands right behind it (that one goes first, or it would have to be driven round).
      const to = Math.abs(c.lat) > 0.3 && !c.wreck && !this.taken(c, c.size, c.s, -c.lat, 0.5) ? -c.lat : c.lat;
      for (const o of this.cars) {
        if (o === c || o.mode !== 'park') continue;
        const [el, ew] = this.ext(o);
        if (Math.hypot(o.x - c.x, o.y - c.y) < Math.hypot(hl, hw) + Math.min(el, ew) + 0.3) return false;
        const behind = (c.s - o.s) * c.dir - el - hl;
        if (o.kind !== 'cast' && behind > -1 && behind < 7 && Math.abs(o.lat - to) < ew + hw + 0.4) return false;
      }
    }
    for (const o of this.cars) {
      if (o === c || o.mode === 'gone' || o.mode === 'park') continue;
      const [el] = this.ext(o);
      const gap = Math.abs(o.s - c.s) - el - hl;
      // Turning round where it stands: nobody moves beside it meanwhile.
      if (o.mode === 'turn') {
        if (gap < 8) return false;
        continue;
      }
      // One that stands behind it, waiting to get on, waits for it to go.
      if (!round && o.v < 0.3 && o.wait > 0.5 && (c.s - o.s) * dir > el + hl) continue;
      // Nobody pulls out into the way of one who comes towards it: between vehicles at both kerbs a street has
      // one lane, a narrow road has one from end to end.
      const ahead = (o.s - c.s) * dir;
      if (o.dir !== dir && ahead > -el - hl - 1 && (ahead < 60 || this.width < NARROW_M)) return false;
      const coming = (c.s - o.s) * o.dir > -el - hl;
      if (coming ? gap < 6 + Math.max(o.v, o.vc * 0.8) * (round ? 4.5 : 2.5) : gap < 4) return false;
    }
    const reach = round ? Math.hypot(hl, hw) + 0.6 : 0;
    for (const b of this.bodies) {
      if (b.hidden || b.gone) continue;
      const dx = b.x - c.x;
      const dy = b.y - c.y;
      if (Math.abs(dx) + Math.abs(dy) > 12) continue;
      if (round) {
        if (dx * dx + dy * dy < reach * reach) return false;
        continue;
      }
      const f = dx * Math.cos(c.yaw) + dy * Math.sin(c.yaw);
      const l = -dx * Math.sin(c.yaw) + dy * Math.cos(c.yaw);
      // Before it, and beside it on the side it steers out to.
      const out = this.kerbSide(c);
      if (f > -hl && f < hl + 3.5 && l * out < hw + 0.9 && l * out > -hw - 2.2) return false;
    }
    return true;
  }

  /** Who is in the carriageway, in the drive line's frame. */
  private roadFolk(): RoadBody[] {
    if (this.road) return this.road;
    const list: RoadBody[] = [];
    const pts = this.site.drive.pts;
    // The carriageway itself, and whoever walks at its very edge (they may step onto it). Somebody standing on the
    // pavement is in no vehicle's way.
    const half = this.width / 2 + 0.3;
    for (const b of this.bodies) {
      if (b.hidden || b.gone) continue;
      const n = nearestOnLine([b.x, b.y], pts);
      const walking = !!b.gait && b.gait !== 'shuffle';
      if (n.d > half + (walking ? 0.7 : 0)) continue;
      const lat = cross(n.dir, sub([b.x, b.y], n.pt)) >= 0 ? n.d : -n.d;
      // Along the road: the way they go is the road's way, and where they go to is no further out into the road.
      let along = false;
      const st = b.steps[0];
      if (walking && st && st.k === 'go') {
        const dx = st.x - b.x;
        const dy = st.y - b.y;
        const l = Math.hypot(dx, dy);
        if (l < 0.3) along = true;
        else if (Math.abs(dx * n.dir[0] + dy * n.dir[1]) > 0.9 * l) {
          const to = nearestOnLine([st.x, st.y], pts);
          const tl = cross(to.dir, sub([st.x, st.y], to.pt)) >= 0 ? to.d : -to.d;
          along = tl * lat > 0 && Math.abs(tl) > Math.abs(lat) - 0.5;
        }
      }
      list.push({ b, s: n.s, lat, still: !walking, along });
    }
    this.road = list;
    return list;
  }

  /**
   * The lane a moving vehicle keeps: its own, or the place nearest to it that is clear of whatever stands in the
   * road ahead (a vehicle at the kerb or turning round, somebody standing there). It never crosses over what is
   * right beside it, and on a road of one lane it keeps to the right for a vehicle coming the other way.
   */
  private lane(c: Car): number {
    let lane = this.laneOf(c.dir);
    const hw = c.size.width / 2;
    const hl = c.size.length / 2;
    // On a road of one lane the verge is the only way past.
    const max = this.width / 2 + (this.width < NARROW_M ? 1.2 : 0.5);
    const toStop = c.stop ? (c.ts - c.s) * c.dir + 0.5 : Infinity;
    // It looks as far ahead as it needs to move over: one thing at a time when it creeps.
    const look = Math.max(6, 3 + 1.5 * c.v);
    // The room there is: between what is right beside it, and outside the stretches taken ahead.
    let lo = -max;
    let hi = max;
    // The same with a hand's breadth to the vehicles beside it, for a squeeze between two.
    let loT = -max;
    let hiT = max;
    // The stretches taken ahead, each with how much nearer its edges may be passed in a squeeze.
    const shut: [number, number, number][] = [];
    let first = Infinity;
    for (const o of this.cars) {
      if (o === c || o.mode === 'gone') continue;
      const ahead = (o.s - c.s) * c.dir;
      if (ahead > toStop) continue;
      const [el, ew] = this.ext(o);
      const moving = o.mode === 'drive' && o.v > 0.3;
      if (moving && o.dir === c.dir) continue;
      if (moving) {
        // Meeting on one lane: each keeps to its right.
        if (this.width < NARROW_M && ahead > -el - hl && ahead < 45) lane = -c.dir * ((hw + ew) / 2 + 0.25);
        continue;
      }
      // A vehicle of the same direction that only waits in the lane is waited behind, not passed.
      if (o.mode === 'drive' && o.dir === c.dir) continue;
      if (Math.abs(ahead) < el + hl + 0.3) {
        if (c.lat >= o.lat) {
          lo = Math.max(lo, o.lat + ew + hw + BERTH_M);
          loT = Math.max(loT, o.lat + ew + hw + 0.25);
        } else {
          hi = Math.min(hi, o.lat - ew - hw - BERTH_M);
          hiT = Math.min(hiT, o.lat - ew - hw - 0.25);
        }
      } else if (Math.abs(ahead) < el + hl + look) {
        // Round it on the road's side: never between a standing vehicle and the edge of the road it stands by,
        // unless there is a lane's width of carriageway there.
        const tight = this.width / 2 - Math.abs(o.lat) - ew < 2 * hw + 0.4;
        shut.push([tight && o.lat < 0 ? -Infinity : o.lat - ew - hw - BERTH_M, tight && o.lat >= 0 ? Infinity : o.lat + ew + hw + BERTH_M, BERTH_M - 0.25]);
        if (ahead > 0) first = Math.min(first, ahead);
      }
    }
    // A car parked where the vehicle could get to (in the carriageway, or on the verge it may use) is passed a
    // hand's breadth off.
    for (const p of this.kerbCars) {
      if (Math.abs(p.lat) - p.ew > max + hw + 0.3) continue;
      const ahead = (p.s - c.s) * c.dir;
      if (ahead > toStop) continue;
      if (Math.abs(ahead) < p.el + hl + 0.3) {
        if (c.lat >= p.lat) {
          lo = Math.max(lo, p.lat + p.ew + hw + 0.3);
          loT = Math.max(loT, p.lat + p.ew + hw + 0.15);
        } else {
          hi = Math.min(hi, p.lat - p.ew - hw - 0.3);
          hiT = Math.min(hiT, p.lat - p.ew - hw - 0.15);
        }
      } else if (Math.abs(ahead) < p.el + hl + look) shut.push([p.lat - p.ew - hw - 0.3, p.lat + p.ew + hw + 0.3, 0.15]);
    }
    for (const p of this.roadFolk()) {
      const ahead = (p.s - c.s) * c.dir;
      if (ahead > toStop) continue;
      if (Math.abs(ahead) < hl + 0.8) {
        if (c.lat >= p.lat) {
          lo = Math.max(lo, p.lat + hw + 0.45);
          loT = Math.max(loT, p.lat + hw + 0.45);
        } else {
          hi = Math.min(hi, p.lat - hw - 0.45);
          hiT = Math.min(hiT, p.lat - hw - 0.45);
        }
      } else if (p.still && Math.abs(ahead) < hl + look) shut.push([p.lat - hw - 0.9, p.lat + hw + 0.9, 0.45]);
      // Somebody walking along the road's edge ahead: it moves over for them in good time.
      else if (p.along && ahead > 0 && ahead < hl + look) shut.push([p.lat - hw - 0.6, p.lat + hw + 0.6, 0.2]);
    }
    if (lo > hi) {
      // No room with a proper berth to what is beside it: a hand's breadth then, if that is there.
      lo = loT;
      hi = hiT;
    }
    if (lo > hi) return c.lat;
    // With a proper berth if there is room for one, else a hand's breadth from each (a squeeze between two).
    let best: number | null = null;
    for (const tight of [0, 1]) {
      const free = (lat: number) => lat >= lo - 1e-6 && lat <= hi + 1e-6 && !shut.some((r) => lat > r[0] + tight * r[2] + 1e-6 && lat < r[1] - tight * r[2] - 1e-6);
      for (const lat of [lane, lo, hi, ...shut.flatMap((r) => [r[0] + tight * r[2], r[1] - tight * r[2]])]) {
        const q = clamp(lat, lo, hi);
        // The nearest to its lane, and of two alike the one on the side it is on already.
        if (free(q) && (best === null || Math.abs(q - lane) + Math.abs(q - c.lat) < Math.abs(best - lane) + Math.abs(best - c.lat) - 1e-6)) best = q;
      }
      if (best !== null) break;
    }
    if (best === null) return clamp(c.lat, lo, hi);
    // Not out into the way of somebody who comes the other way just now: it waits in its lane until they have passed.
    if (Math.abs(best - lane) > 0.3 && first < Infinity && lo <= lane && lane <= hi) {
      const to = best;
      if (this.cars.some((x) => x !== c && x.mode === 'drive' && x.dir !== c.dir && x.v > 0.3 && this.meets(c, x, to, first + 30))) return lane;
    }
    return best;
  }

  /**
   * How far before its stopping place a vehicle can start to move over to it from the lane it keeps (`lane`):
   * from where it is clear of the last thing that stands between the two (a vehicle at that kerb, a parked car).
   */
  private pullIn(c: Car, lane: number): number {
    const hw = c.size.width / 2;
    const hl = c.size.length / 2;
    const lo = Math.min(lane, c.tlat) - hw - 0.3;
    const hi = Math.max(lane, c.tlat) + hw + 0.3;
    let room = Infinity;
    const stands = (s: number, lat: number, el: number, ew: number) => {
      // Before the place, not yet passed, and in the stretch of road it would swing through.
      const short = (c.ts - s) * c.dir - el - hl;
      if (short < 0 || (s - c.s) * c.dir < -el - hl || lat + ew < lo || lat - ew > hi) return;
      // Beside the lane it keeps it is no hindrance until the vehicle turns in.
      if (Math.abs(lat - lane) < ew + hw + 0.2) return;
      room = Math.min(room, short - 0.5);
    };
    for (const o of this.cars) {
      if (o === c || o.mode === 'gone') continue;
      const [el, ew] = this.ext(o);
      // One that is on its way to a stopping place counts as standing there already.
      if (o.mode === 'drive' && o.v > 0.3) {
        if (o.stop) stands(o.ts, o.tlat, el, ew);
      } else stands(o.s, o.lat, el, ew);
    }
    for (const p of this.kerbCars) stands(p.s, p.lat, p.el, p.ew);
    return Math.max(3, room);
  }

  /** Would `c`, moved over to `lat`, be in the way of `x` coming towards it within `reach` metres? */
  private meets(c: Car, x: Car, lat: number, reach: number): boolean {
    const ahead = (x.s - c.s) * c.dir;
    return ahead > 0 && ahead < reach && Math.abs(x.lat - lat) < (x.size.width + c.size.width) / 2 + 0.3;
  }

  private driveCar(c: Car, dt: number): void {
    if (c.back > 0 && (c.mode === 'drive' || c.mode === 'turn')) {
      // Backing off a little first, straightening up; not into somebody behind it.
      const [bl, bw] = this.ext(c);
      if (c.wait < STUCK_S && this.roadFolk().some((p) => (c.s - p.s) * c.dir > 0 && (c.s - p.s) * c.dir < bl + 1.2 && Math.abs(p.lat - c.lat) < bw + 0.6)) {
        c.wait += dt;
        return;
      }
      const move = Math.min(c.back, 1.4 * dt);
      const was = [c.s, c.yawOff];
      c.back -= move;
      c.s -= c.dir * move;
      if (c.yawOff) c.yawOff = Math.abs(c.yawOff) < 1.2 * dt ? 0 : c.yawOff - Math.sign(c.yawOff) * 1.2 * dt;
      this.pose(c);
      // A corner swinging round as it straightens can reach somebody beside the road, or a vehicle: then it waits.
      if (this.bumps(c, was[0], c.lat, c.steer)) {
        const folk = this.bodies.some((b) => !b.hidden && !b.gone && this.under(c, b));
        [c.s, c.yawOff] = was;
        // Somebody behind it walks on in a moment; a vehicle behind it does not: then it backs no further.
        c.back = folk ? c.back + move : 0;
        c.wait += dt;
        this.pose(c);
      }
      return;
    }
    if (c.mode === 'turn') {
      // Not round over somebody who stands in its way (for a good while: whoever walks by is soon past).
      const r = Math.hypot(c.size.length, c.size.width) / 2 + 0.4;
      if (c.wait < 4 * STUCK_S && this.bodies.some((b) => !b.hidden && !b.gone && Math.hypot(b.x - c.x, b.y - c.y) < r)) {
        c.wait += dt;
        return;
      }
      const was = c.turnT;
      c.turnT += dt / UTURN_S;
      let k = smooth(Math.min(1, c.turnT));
      c.yawOff = Math.PI * k;
      c.lat = lerp(c.turnFrom, c.turnTo, k);
      this.pose(c);
      if (this.inParkedCar(c, 0.1)) {
        // Not round into a car parked beside it: it edges out towards the middle of the road first.
        const out = clamp(-c.turnFrom, -0.7 * dt, 0.7 * dt);
        c.turnT = was;
        c.turnFrom += out;
        c.turnTo = clamp(c.turnTo + out, -this.kerbLat(), this.kerbLat());
        k = smooth(Math.min(1, c.turnT));
        c.yawOff = Math.PI * k;
        c.lat = lerp(c.turnFrom, c.turnTo, k);
      }
      c.lamps = true;
      if (c.turnT >= 1) {
        c.dir = -c.dir as 1 | -1;
        c.yawOff = 0;
        c.mode = 'drive';
      }
      this.pose(c);
      return;
    }
    if (c.mode !== 'drive') return;
    const d = (c.ts - c.s) * c.dir;
    const waited = c.wait;
    const hw0 = c.size.width / 2;
    let want = this.lane(c);
    let vt = c.vc;
    let turnIn = Infinity;
    if (c.stop) {
      vt = Math.max(0.9, Math.min(vt, Math.sqrt(2 * c.brake * Math.max(0, d))));
      // A short way left and still far from its kerb: slowly, so the wheels can take it there.
      if (Math.abs(c.tlat - c.lat) > 0.2 * Math.max(d, 0.1)) vt = Math.min(vt, 2.2);
      // It moves over to its stopping place in good time: from further back the further across the road that
      // is, but only once it is past whatever stands at that kerb before the place.
      turnIn = Math.min(16 + 8 * Math.abs(c.tlat - want), this.pullIn(c, want));
      // A place at the far kerb is across the way of whoever comes towards it: it waits short of the turn
      // until they have passed (a while: nobody waits in the road for ever).
      const lane = this.laneOf(c.dir);
      const across = (c.tlat - lane) * -c.dir > hw0 && Math.abs(c.lat - c.tlat) > 0.6;
      if (across && c.wait < STUCK_S && d < turnIn + 30) {
        if (this.cars.some((x) => x !== c && x.mode === 'drive' && x.dir !== c.dir && x.v > 0.3 && (x.s - c.s) * c.dir > -2 && (x.s - c.s) * c.dir < d + 20 + 4 * x.v)) {
          vt = Math.min(vt, d > turnIn + 0.5 ? Math.sqrt(2 * c.brake * (d - turnIn)) : 0);
          turnIn = 0;
          if (vt < 0.5) c.wait += dt;
        }
      }
    }
    // Kept from getting on for long (the count runs down again while it moves), it goes on regardless of
    // vehicles, slowly; of people only much later.
    const free = this.behind(c, vt, want, false);
    // Right up against something it could get round with more road before it: it backs off first.
    if (free < 0.5 && vt >= 0.5 && c.v < 0.05 && c.wait > 1.5) {
      const need = this.squeezed(c, want);
      if (need > 0) c.back = clamp(Math.min(need, this.roomBehind(c) - 0.8), 0, 4);
    }
    if (free < 0.5 && vt >= 0.5) c.wait += dt;
    else c.wait = Math.max(0, c.wait - (free < vt ? 0.5 : 4) * dt);
    vt = c.wait > STUCK_S ? Math.min(vt, 2, c.wait > 4 * STUCK_S ? vt : this.behind(c, vt, want, true)) : free;
    const was = c.v;
    c.v = c.v < vt ? Math.min(vt, c.v + c.acc * dt) : Math.max(vt, c.v - 9 * dt);
    // Brake lights while it slows and while it waits in the road; coming to a stand the wheels straighten.
    c.braking = c.v < was - 0.5 * dt || (c.v < 0.05 && vt < 0.05 && !c.stop);
    if (c.v < 1.2 && vt < 0.3 && c.steer) {
      // (Not when the tail would swing into what stands right beside it.)
      const turned = c.steer;
      c.steer = Math.abs(c.steer) < 0.6 * dt ? 0 : c.steer - Math.sign(c.steer) * 0.6 * dt;
      this.pose(c);
      if (this.touches(c)) c.steer = turned;
    }
    c.eta = Math.max(0, c.eta - dt);
    const move = c.v * dt;
    if (c.stop && move >= d) {
      c.s = c.ts;
      // Nothing moves sideways as it stops. Short of its kerb, it backs off and comes again, as a driver does
      // (twice at most); a vehicle still kept from its kerb after that stands where it got to.
      const off = Math.abs(c.lat - c.tlat);
      if (off < 0.35) c.lat = c.tlat;
      else {
        const back = c.shunts < 2 ? clamp(Math.min(off / 0.5 + 1.5, this.roomBehind(c) - 0.8), 0, 7) : 0;
        if (back > 1.5) {
          c.shunts++;
          c.back = back;
          c.v = 0;
          c.steer = 0;
          c.braking = false;
          this.pose(c);
          return;
        }
        c.tlat = c.lat;
      }
      c.shunts = 0;
      c.v = 0;
      c.braking = false;
      c.eta = 0;
      c.wait = 0;
      c.mode = 'park';
      // The wheels come straight as it stands, unless its tail would swing into what is right beside it: then it
      // stands at the angle it came in at.
      const turned = c.steer;
      c.steer = 0;
      this.pose(c);
      if (turned && this.touches(c)) {
        c.steer = turned;
        this.pose(c);
      }
      return;
    }
    const ps = c.s;
    const pl = c.lat;
    c.s += c.dir * move;
    if (c.stop && turnIn > 0) want = lerp(c.tlat, want, smooth(clamp(d / turnIn, 0, 1)));
    // Sideways only as far as the wheels turn: nothing while it stands, sharply at a crawl, gently at speed.
    const maxL = Math.min(0.7 * c.v, SIDE_V + 0.05 * c.v) * dt;
    c.lat += clamp(want - c.lat, -maxL, maxL);
    // A wreck pulling out straightens up.
    if (c.yawOff) c.yawOff = Math.abs(c.yawOff) < 1.2 * dt ? 0 : c.yawOff - Math.sign(c.yawOff) * 1.2 * dt;
    // The nose follows the way it goes, as far and as fast as a car swings.
    const steer = move > 1e-4 ? clamp(c.dir * Math.atan2(c.lat - pl, Math.abs(c.s - ps)), -0.3, 0.3) : c.steer;
    const turned = c.steer;
    c.steer += clamp(steer - c.steer, -1.5 * dt, 1.5 * dt);
    if (!c.stop && (c.s <= 0 || c.s >= this.length)) {
      c.mode = 'gone';
      return;
    }
    this.pose(c);
    // Whatever the rules above let through: no vehicle moves into somebody or into another vehicle. It stands
    // where it was instead (for somebody on foot only for a long while: nobody waits in the road for ever).
    if (move > 0 && this.bumps(c, ps, pl, turned, waited < 4 * STUCK_S)) {
      // Straight on first, without the swing of the nose (a corner may be all that touches); else it stands.
      c.lat = pl;
      c.steer = Math.abs(turned) < 1.5 * dt ? 0 : turned - Math.sign(turned) * 1.5 * dt;
      this.pose(c);
      if (this.bumps(c, ps, pl, turned, waited < 4 * STUCK_S)) {
        // It stands; the wheels come straight if that touches nothing (a nose left turned in keeps it wedged).
        const straight = c.steer;
        c.s = ps;
        c.steer = turned;
        c.v = 0;
        c.wait = waited + dt;
        this.pose(c);
        if (straight !== turned) {
          const hit = this.inParkedCar(c) || this.cars.some((o) => o !== c && o.mode !== 'gone' && this.overlap(c, o));
          c.steer = straight;
          this.pose(c);
          if (!hit && this.touches(c)) {
            // Nose to flank with another that stands turned in as well (two passing each other, each steering
            // for its own lane): they straighten together, since neither can alone.
            const o = this.cars.find((x) => x !== c && x.mode === 'drive' && x.v < 0.05 && x.steer !== 0 && this.overlap(c, x));
            let ok = false;
            if (o) {
              const was = o.steer;
              o.steer = 0;
              c.steer = 0;
              this.pose(o);
              this.pose(c);
              ok = !this.touches(c) && !this.touches(o);
              if (!ok) {
                o.steer = was;
                this.pose(o);
              }
            }
            if (!ok) {
              c.steer = turned;
              this.pose(c);
            }
          }
        }
        // Held up by a corner of something beside it: every few seconds it backs off and comes again.
        if (c.back <= 0 && Math.floor(c.wait / 4) > Math.floor(waited / 4)) c.back = clamp(this.roomBehind(c) - 0.8, 0, 2.5);
      }
    }
  }

  /** Is a vehicle, as it stands, in a parked car, in another vehicle or over somebody? */
  private touches(c: Car): boolean {
    return this.inParkedCar(c) || this.cars.some((o) => o !== c && o.mode !== 'gone' && this.overlap(c, o)) || this.bodies.some((b) => !b.hidden && !b.gone && this.under(c, b));
  }

  /** The corners of a vehicle's footprint. */
  private corners(c: Car): V2[] {
    const hl = c.size.length / 2;
    const hw = c.size.width / 2;
    return [this.carPoint(c, hl, hw), this.carPoint(c, hl, -hw), this.carPoint(c, -hl, -hw), this.carPoint(c, -hl, hw)];
  }

  /** Does a vehicle's footprint, `m` metres wider all round, reach into a car parked in the street? */
  private inParkedCar(c: Car, m = 0): boolean {
    let own: V2[] | null = null;
    for (const p of this.parked) {
      if (Math.abs(c.x - p.x) + Math.abs(c.y - p.y) > c.size.length / 2 + p.hl + 4) continue;
      own ??= this.corners(c);
      const hl = p.hl + m;
      const hw = p.hw + m;
      const q: V2[] = [
        [p.x + p.co * hl - p.si * hw, p.y + p.si * hl + p.co * hw],
        [p.x + p.co * hl + p.si * hw, p.y + p.si * hl - p.co * hw],
        [p.x - p.co * hl + p.si * hw, p.y - p.si * hl - p.co * hw],
        [p.x - p.co * hl - p.si * hw, p.y - p.si * hl + p.co * hw],
      ];
      if (this.hit(own, q)) return true;
    }
    return false;
  }

  /** Do the footprints of two vehicles overlap? */
  private overlap(a: Car, b: Car): boolean {
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 16) return false;
    return this.hit(this.corners(a), this.corners(b));
  }

  /** Do two boxes, given by their corners in order, overlap? (Separating axes.) */
  private hit(p: V2[], q: V2[]): boolean {
    for (const box of [p, q]) {
      for (let i = 0; i < 2; i++) {
        const ax = box[i + 1][0] - box[i][0];
        const ay = box[i + 1][1] - box[i][1];
        let p0 = Infinity;
        let p1 = -Infinity;
        let q0 = Infinity;
        let q1 = -Infinity;
        for (const v of p) {
          const k = v[0] * ax + v[1] * ay;
          p0 = Math.min(p0, k);
          p1 = Math.max(p1, k);
        }
        for (const v of q) {
          const k = v[0] * ax + v[1] * ay;
          q0 = Math.min(q0, k);
          q1 = Math.max(q1, k);
        }
        if (p1 < q0 || q1 < p0) return false;
      }
    }
    return true;
  }

  /** Does somebody stand where a vehicle's body is (with a hand's breadth round it)? */
  private under(c: Car, b: Body): boolean {
    const dx = b.x - c.x;
    const dy = b.y - c.y;
    const fx = Math.cos(c.yaw);
    const fy = Math.sin(c.yaw);
    return Math.abs(dx * fx + dy * fy) < c.size.length / 2 + 0.1 && Math.abs(dy * fx - dx * fy) < c.size.width / 2 + 0.1;
  }

  /**
   * Has a vehicle just moved into somebody, or into another vehicle? (`s`, `lat`, `steer`: where it was before
   * the move. Out of a vehicle it was in already, a wreck coming free of the other one, it may move.)
   */
  private bumps(c: Car, s: number, lat: number, steer: number, people = true): boolean {
    if (people && this.bodies.some((b) => !b.hidden && !b.gone && this.under(c, b))) return true;
    const hit = this.cars.filter((o) => o !== c && o.mode !== 'gone' && this.overlap(c, o));
    const parked = this.inParkedCar(c);
    if (!hit.length && !parked) return false;
    const now = [c.s, c.lat, c.steer];
    c.s = s;
    c.lat = lat;
    c.steer = steer;
    this.pose(c);
    const fresh = hit.some((o) => !this.overlap(c, o)) || (parked && !this.inParkedCar(c));
    [c.s, c.lat, c.steer] = now;
    this.pose(c);
    return fresh;
  }

  /**
   * How fast a vehicle may go for what is ahead of it in its path: it follows a vehicle going its way, waits
   * behind one that stands where it cannot get round (`want`: the lane it steers for), creeps past one it can,
   * stops for one coming straight at it, and for anybody in the road before it.
   */
  private behind(c: Car, vt: number, want: number, onlyPeople: boolean): number {
    const hw = c.size.width / 2;
    const hl = c.size.length / 2;
    const toStop = c.stop ? (c.ts - c.s) * c.dir + 0.5 : Infinity;
    const reach = 6 + c.v * 1.2;
    for (const o of this.cars) {
      if (onlyPeople) break;
      if (o === c || o.mode === 'gone') continue;
      const ahead = (o.s - c.s) * c.dir;
      if (ahead > toStop) continue;
      const [el, ew] = this.ext(o);
      const gap = ahead - el - hl;
      if (gap < -1 || Math.abs(o.lat - c.lat) > ew + hw + 0.2) continue;
      const moving = o.mode === 'drive' && o.v > 0.3;
      if (moving && o.dir !== c.dir) {
        // Head on: both stop short of each other, then find their way round.
        const close = c.v + o.v;
        if (gap < 3 + close * 0.8) vt = 0;
        else if (gap < 12 + close * 1.6) vt = Math.min(vt, 4);
        continue;
      }
      if (gap > reach) continue;
      if (o.mode === 'drive' && o.dir === c.dir) vt = Math.min(vt, gap < 2 ? o.v : Math.max(o.v, 2.5));
      else vt = Math.min(vt, this.pastStanding(c, gap, o.lat, ew, want));
    }
    for (const p of this.kerbCars) {
      if (onlyPeople) break;
      const ahead = (p.s - c.s) * c.dir;
      if (ahead > toStop) continue;
      const gap = ahead - p.el - hl;
      if (gap < -1 || gap > reach || Math.abs(p.lat - c.lat) > p.ew + hw + 0.1) continue;
      vt = Math.min(vt, this.pastStanding(c, gap, p.lat, p.ew, want));
    }
    for (const p of this.roadFolk()) {
      // Somebody walking may step into the way: a wider berth than for somebody standing.
      // Beside its front half counts too, when they are as good as touching it.
      const gap = (p.s - c.s) * c.dir - hl;
      const side = Math.abs(p.lat - c.lat) - hw;
      if (gap < -hl || gap > Math.min(reach, toStop)) continue;
      // Somebody who walks along the road's edge is passed, with a hand's breadth and slowly when that is all there is.
      if (p.along && gap >= -0.5 && side > 0.4) {
        if (side < 1) vt = Math.min(vt, 5);
        continue;
      }
      if (side > (gap < -0.5 ? 0.25 : p.still ? 0.5 : 1.3)) continue;
      vt = Math.min(vt, gap < (p.still ? 1.5 : 2.5) ? 0 : 2.5);
    }
    return vt;
  }

  /**
   * How fast a vehicle may go towards something that stands `gap` metres before it in its path (at `lat`, half
   * `ew` wide), when it steers for `want`: slowly round it when it will be clear in time, else not at all.
   */
  private pastStanding(c: Car, gap: number, lat: number, ew: number, want: number): number {
    const hw = c.size.width / 2;
    if (Math.abs(lat - want) > ew + hw + 0.2) {
      // It steers round: slowly only when it would not be clear of it in time.
      const side = ew + hw + 0.2 - Math.abs(lat - c.lat);
      return gap < 2 + (c.v * side) / SIDE_V ? (gap < 0.6 ? 0 : CREEP_V) : Infinity;
    }
    // No way round it for now: far enough back to pull out later.
    return gap < ROOM_M + 0.2 ? 0 : 2.5;
  }

  /**
   * A standing vehicle that cannot get on: how far it has to back off to get round what stands right before it
   * (0 when nothing does, or when backing would not help: the way round is shut as well).
   */
  private squeezed(c: Car, want: number): number {
    const hw = c.size.width / 2;
    const hl = c.size.length / 2;
    let need = 0;
    const stands = (s: number, lat: number, el: number, ew: number) => {
      const gap = (s - c.s) * c.dir - el - hl;
      const side = ew + hw + 0.2 - Math.abs(lat - c.lat);
      if (gap < -1 || side <= 0 || Math.abs(lat - want) <= ew + hw + 0.2) return;
      // Sideways only as far as the wheels turn: so much road before it for so much to the side.
      const room = side / 0.6 + 0.8;
      if (gap < room) need = Math.max(need, room - gap + 0.3);
    };
    for (const o of this.cars) {
      if (o === c || o.mode !== 'park') continue;
      const [el, ew] = this.ext(o);
      stands(o.s, o.lat, el, ew);
    }
    for (const p of this.kerbCars) stands(p.s, p.lat, p.el, p.ew);
    return need;
  }

  /** How far a standing vehicle can back off: to whatever stands behind it, or to the end of the road. */
  private roomBehind(c: Car): number {
    const [cl, cw] = this.ext(c);
    let room = (c.dir > 0 ? c.s : this.length - c.s) - cl - 1;
    for (const o of this.cars) {
      if (o === c || o.mode === 'gone') continue;
      const [el, ew] = this.ext(o);
      const gap = (c.s - o.s) * c.dir - el - cl;
      if (gap > -1 && Math.abs(o.lat - c.lat) < ew + cw + 0.3) room = Math.min(room, gap);
    }
    for (const p of this.kerbCars) {
      const gap = (c.s - p.s) * c.dir - p.el - cl;
      if (gap > -1 && Math.abs(p.lat - c.lat) < p.ew + cw + 0.3) room = Math.min(room, gap);
    }
    for (const p of this.roadFolk()) {
      const gap = (c.s - p.s) * c.dir - cl;
      if (gap > -0.5 && Math.abs(p.lat - c.lat) < cw + 0.6) room = Math.min(room, gap);
    }
    return room;
  }

  // -------------------------------------------------------------------------- crews

  private spawnUnit(u: UnitSit, key: string): void {
    const d = this.site.drive;
    const f = dirOf(u.from);
    let fromA = dot(f, sub(d.pts[0], this.site.roadSpot)) >= dot(f, sub(d.pts[d.pts.length - 1], this.site.roadSpot));
    // A vehicle pulled over: the first crew pulls in behind it at the same kerb, the way a stop is made (it has
    // followed the car or turned round for it), not across the road from it.
    const stopped = this.stopCar;
    if (this.kind === 'stop' && stopped && stopped.mode === 'park' && !this.crews.some((c) => c.police)) fromA = stopped.dir > 0;
    const look = lookOfUnit(u.type, u.model);
    const way = this.wayIn(CAR_SIZE[look.body], fromA);
    if (!way || way === 'wait') return;
    const n = Math.min(u.type === 'rapid' || u.type === 'special' ? 4 : 2, Math.max(1, u.crew.length));
    const people: Body[] = [];
    for (let i = 0; i < n; i++) {
      const seed = hash32('o', u.id, i);
      people.push(
        this.body(`o:${u.id}:${i}`, lookOfCrew('police', seed, u.crew[i] ?? 'M', this.cast.dress), seed, 'police', 'crew', this.site.roadSpot),
      );
    }
    this.spawnCrew(key, look, 'unit', people, true, null, way, u.state === 'here' ? 3.5 : u.eta);
  }

  private spawnAgency(a: AgencySit, key: string): void {
    const look = lookOfAgency(a.agency);
    // A service with no vehicle a camera would see (the sea rescue) is not staged.
    if (!look) {
      this.done.add(key);
      return;
    }
    const dress =
      a.agency === 'kiirabi'
        ? 'medic'
        : a.agency === 'paaste'
          ? 'rescue'
          : a.agency === 'sotsiaal' || a.agency === 'veterinaar' || a.agency === 'kapo'
            ? null
            : 'guard';
    const way = this.wayIn(CAR_SIZE[look.body], (hash32('from', this.cast.seed, a.agency) & 1) === 0, a.agency === 'kiirabi');
    if (!way || way === 'wait') return;
    const n = a.agency === 'kiirabi' || a.agency === 'kov' ? 2 : a.agency === 'paaste' ? 3 : 1;
    const people: Body[] = [];
    for (let i = 0; i < n; i++) {
      const seed = hash32('m', this.cast.seed, a.agency, i);
      const gender: Gender = seed & 4 ? 'F' : 'M';
      const lk = dress ? lookOfCrew(dress, seed, gender, this.cast.dress) : lookOfStranger(seed, this.cast.dress);
      people.push(this.body(`m:${a.agency}:${i}`, lk, seed, 'crew', 'crew', this.site.roadSpot));
    }
    this.spawnCrew(key, look, 'agency', people, false, a.agency, way, a.state === 'here' ? 3.5 : a.eta);
  }

  private spawnCrew(
    key: string,
    look: CarLook,
    kind: 'unit' | 'agency',
    people: Body[],
    police: boolean,
    agency: Agency | null,
    way: { fromA: boolean; s: number; lat: number },
    eta: number,
  ): void {
    const c = this.car(key, look, kind);
    c.dir = way.fromA ? 1 : -1;
    c.s = way.fromA ? 0 : this.length;
    c.lat = this.laneOf(c.dir);
    c.ts = way.s;
    c.tlat = way.lat;
    c.stop = true;
    c.mode = 'drive';
    this.plan(c, Math.max(3.5, eta));
    c.v = c.vc;
    c.beacons = hasBeacons(look.livery);
    c.lamps = true;
    this.pose(c);
    const cr: Crew = {
      key,
      car: c,
      people,
      police,
      agency,
      state: 'arriving',
      out: 0,
      clock: 0,
      wantLeave: false,
      through: false,
      takes: null,
      run: false,
      arrived: !police,
      hereT: 0,
      short: false,
    };
    for (const b of people) {
      b.hidden = true;
      b.aboard = true;
      b.crew = cr;
    }
    this.crews.push(cr);
    this.crewBy.set(key, cr);
  }

  private runCrew(cr: Crew, dt: number): void {
    const car = cr.car;
    const open = !this.sit?.closed;
    if (cr.state === 'arriving') {
      // Told to go before it stopped: it drives on through, unless a closing scene needs it or the road ends ahead.
      if (cr.wantLeave && !cr.through && !(cr.police && this.over && !this.played)) {
        if (this.wayCost(car.s, car.dir) === 0) {
          this.driveOff(car, true);
          car.beacons = car.beacons && (cr.run || !!cr.takes);
          cr.state = 'leaving';
          return;
        }
        cr.through = true;
      }
      if (car.mode === 'park') {
        cr.state = 'here';
        cr.clock = 0;
      } else if (car.mode === 'drive' && car.stop && car.back <= 0 && car.v < 0.05 && car.wait > 4 && (car.ts - car.s) * car.dir < 14) {
        // A few metres short of its place and kept from it by whoever stands there (the people it came for, in
        // the road beside whoever lies there): it stands where it is. Not while something else still drives.
        const hl = car.size.length / 2;
        const folk = this.roadFolk().some((q) => q.still && (q.s - car.s) * car.dir > hl - 0.5 && (q.s - car.s) * car.dir < hl + 4 && Math.abs(q.lat - car.lat) < car.size.width / 2 + 0.6);
        if (folk && !this.cars.some((o) => o !== car && o.mode === 'drive' && o.v > 0.3)) {
          car.ts = car.s;
          car.tlat = car.lat;
          car.wait = 0;
        }
      } else if (cr.hereT && !cr.short && this.t - cr.hereT > LATE_S) this.stopShort(cr);
      return;
    }
    if (cr.state === 'here') {
      car.lamps = this.night;
      // (Blue lights while the incident is open, and for the police as long as a wreck still stands in the road.)
      const blocked = cr.police && this.kind === 'crash' && this.cars.some((c) => c.kind === 'cast' && c.wreck && c.mode === 'park' && Math.abs(c.lat) < this.width / 2 - 0.8);
      car.beacons = hasBeacons(car.look.livery) && (open || blocked) && !cr.through;
      // (The police stay until what blocks the road has been moved to the kerb: they are the last to go.)
      const hold = (this.over && !this.played && this.overT < HOLD_S) || (cr.police && this.over && this.overT < WRECK_HOLD_S && this.toClear > 0);
      if (cr.wantLeave && (cr.through || !hold)) {
        this.board(cr);
        return;
      }
      // Nobody is out before the game says the crew is on scene (the car may have come a little early).
      if (cr.through || !cr.arrived) return;
      cr.clock += dt;
      while (cr.out < cr.people.length && cr.clock >= this.doorTime(cr, cr.out)) this.alight(cr, cr.out++);
      // The story is told and nobody of the incident is left in the street: a crew does not stand about beside
      // its car, it gets in (reports, the radio) until it is sent on. One stays out where somebody lies dead or
      // the matter is behind a door.
      if (cr.police && this.played && (this.toClear === 0 || this.overT >= WRECK_HOLD_S) && cr.out >= cr.people.length && !this.bodies.some((b) => b.kind === 'cast' && !b.gone && !b.hidden && !b.leaving)) {
        const keep = this.cordon || this.kind === 'indoor' ? cr.people[0] : null;
        for (const b of cr.people) if (b !== keep && !b.aboard && !b.duty && !b.gone && !(b.inside && b.hidden) && !b.steps.length) this.toCar(b);
      }
      return;
    }
    if (cr.state === 'boarding') {
      cr.clock += dt;
      let all = true;
      for (const b of cr.people) {
        if (b.aboard || b.gone) continue;
        // Somebody stuck (a blocked way) is not waited for for ever.
        if (cr.clock > 40 && !b.duty) {
          b.hidden = true;
          b.aboard = true;
          b.steps.length = 0;
        } else {
          all = false;
          if (!b.duty && this.atRest(b)) this.toCar(b);
        }
      }
      if (all && !car.riders.some((r) => r.duty)) {
        const pursuit = this.sit?.pursuit === 'on' || cr.run;
        const way = pursuit && cr.police ? this.fleeDir : 0;
        if (!this.canPullOut(car, way, dt)) return;
        // Blue lights for a pursuit, the cells and the hospital; not for a ride home.
        car.beacons = hasBeacons(car.look.livery) && (pursuit || cr.takes === 'arrest' || cr.takes === 'hospital');
        car.lamps = true;
        this.driveOff(car, car.beacons, way);
        cr.state = 'leaving';
      }
      return;
    }
    if (car.mode === 'gone') {
      for (const b of cr.people) this.vanish(b);
      this.crews = this.crews.filter((x) => x !== cr);
      this.crewBy.delete(cr.key);
      if (cr.agency) this.done.add(cr.key);
    }
  }

  /**
   * A crew the game has on scene for a while and that is still kept from its place (held back in the road, behind
   * somebody) gives the place up for the nearest free one the camera sees: where it is when it is in the picture
   * already, else the first place inside it. In its lane if the kerb there is taken; never past its own place.
   */
  private stopShort(cr: Crew): void {
    const car = cr.car;
    if (car.mode !== 'drive' || !car.stop || car.back > 0 || car.v > 3 || (car.ts - car.s) * car.dir < 8) return;
    const seen = this.site.seen;
    const hl = car.size.length / 2;
    let s = car.s + car.dir * 2;
    if (seen) {
      const edge = car.dir > 0 ? seen.from + hl + 0.3 : seen.to - hl - 0.3;
      if ((edge - s) * car.dir > 0) s = edge;
    }
    const folk = this.roadFolk();
    for (let k = 0; k < 14 && (car.ts - s) * car.dir > 6; k++, s += car.dir) {
      for (const lat of Math.abs(car.tlat - car.lat) < 1.6 ? [car.tlat, car.lat] : [car.lat]) {
        if (this.taken(car, car.size, s, lat, 1.2, lat === car.tlat ? PARK_SIDE : 0.3, car.dir)) continue;
        if (folk.some((p) => p.still && Math.abs(p.s - s) < hl + 1 && Math.abs(p.lat - lat) < car.size.width / 2 + 0.6)) continue;
        car.ts = s;
        car.tlat = lat;
        cr.short = true;
        return;
      }
    }
  }

  /**
   * When the i-th of a crew opens their door, in seconds after the vehicle has stopped: nobody is out the moment
   * the wheels stand. A belt, a radio call, a look at the scene first, and then one after the other; quicker when
   * it is urgent.
   */
  private doorTime(cr: Crew, i: number): number {
    const seed = hash32('door', cr.key);
    const hurry = this.kind === 'threat' || this.cast.priority === 1 || this.pairs.length > 0;
    let t = hurry ? 0.9 + 0.5 * hash01(seed, 0) : 1.5 + 1.5 * hash01(seed, 0);
    for (let k = 1; k <= i; k++) t += hurry ? 0.5 + 0.4 * hash01(seed, k) : 0.8 + 0.7 * hash01(seed, k);
    return t;
  }

  /** One of a crew gets out at their door and goes to work. */
  private alight(cr: Crew, i: number): void {
    const b = cr.people[i];
    if (!b.aboard || b.gone) return;
    const p = this.doorAt(cr.car, i);
    const at: V2 = this.wall(p[0], p[1]) ? [cr.car.x, cr.car.y] : p;
    // Out of the door bent low, rising while stepping clear of it.
    const seat = lerp2(at, [cr.car.x, cr.car.y], 0.3 / Math.max(0.3, dist(at, [cr.car.x, cr.car.y])));
    b.x = seat[0];
    b.y = seat[1];
    b.yaw = cr.car.yaw;
    b.hidden = false;
    b.aboard = false;
    b.scale = 1;
    b.steps.length = 0;
    // (The bent pose is the first one shown, held a moment in the door; then up over 0.6 s while stepping out.)
    b.act = 'duck';
    b.actT = 0;
    b.from = null;
    b.blend = b.blendS;
    b.ease = 0.6;
    b.steps.push(wait(0.2), act('stand', 0, null, 0.6), slide(at, 0.55));
    // Somebody ran off as the car came and is still in sight: the first officer out runs after them a stretch,
    // looks after them, and comes back to work. A runner nobody chases reads as a mistake.
    const runner = cr.police && !this.chased ? this.bodies.find((x) => x.kind === 'cast' && x.leaving && !x.gone && !x.hidden && x.gait === 'run') : null;
    if (runner) {
      this.chased = true;
      const there: V2 = [runner.x, runner.y];
      const d = Math.max(1, dist(at, there));
      const to = this.safe(lerp2(at, there, Math.min(1, 14 / d)));
      this.route(b, to, 'run');
      b.steps.push(act('look', 1.5, there));
    }
    this.assign(b);
  }

  /** Send somebody of a crew to work: the first free post, or their part of the scene, or beside their car. */
  private assign(b: Body): void {
    const cr = b.crew;
    if (!cr) return;
    const hurry = this.cast.kind === 'threat' || this.cast.priority === 1 || (this.over && !this.played) || this.pairs.length > 0 || (this.cast.down && !this.broken && this.kind === 'brawl');
    const gait: Gait = hurry ? 'run' : 'walk';
    if (b.post) b.post.by = null;
    b.post = null;
    if (b.act !== 'idle' && b.act !== 'duck') this.setAct(b, 'stand');
    if (cr.police) {
      // The story is told: nothing left to do but wait by the car.
      const post = this.played ? undefined : this.posts.find((p) => !p.by);
      if (!post) {
        this.standBy(b);
        return;
      }
      post.by = b;
      b.post = post;
      if (post.enter) {
        if (dist(this.inPoint, this.site.spot) > 10) {
          // The door (or the corner) is a walk away: they look at the spot first.
          this.route(b, this.beside(this.site.spot, cr.people.indexOf(b)), gait);
          b.steps.push(call(() => this.onContact()));
          this.route(b, this.inPoint, gait);
        } else {
          this.route(b, this.inPoint, gait);
          b.steps.push(call(() => this.onContact()));
        }
        b.steps.push({ k: 'door', out: false, t: 0, on: false });
        return;
      }
      if (this.kind === 'threat' && post.act === 'aim' && this.keepOut && !post.enter) {
        // Somebody armed: behind the own car when it stands near enough, over its bonnet or from behind its
        // door on the side away from the weapon. Else the place in the open, well short of it.
        const m = this.keepOut.at;
        const car = cr.car;
        const side = -(m[0] - car.x) * Math.sin(car.yaw) + (m[1] - car.y) * Math.cos(car.yaw) >= 0 ? -1 : 1;
        const cover = this.carPoint(car, cr.people.indexOf(b) === 0 ? car.size.length / 2 - 0.5 : -0.3, side * (car.size.width / 2 + 0.5));
        if (dist([car.x, car.y], m) < 13 && dist(cover, m) >= 7.2 && !this.wall(cover[0], cover[1]) && clearLine(this.site.street, cover, m)) post.at = cover;
      }
      this.route(b, post.at, gait);
      b.steps.push(
        call(() => {
          b.face = post.face;
          this.setAct(b, post.act);
          this.onContact();
        }),
      );
      return;
    }
    const idx = cr.people.indexOf(b);
    const down = this.downBody();
    const shut = this.trapped;
    if (shut && !(this.over && this.played) && (cr.agency === 'kiirabi' || (cr.agency === 'paaste' && idx < 2))) {
      // Somebody inside a wreck: at its doors until they are out (the first to get there starts the clock).
      const car = shut.car;
      const sg = idx % 2 ? -1 : 1;
      const at = this.carPoint(car, 0.3 - 0.9 * (idx >> 1), sg * (car.size.width / 2 + 0.6));
      this.route(b, this.wall(at[0], at[1]) ? this.beside([car.x, car.y], idx, car.size.width / 2 + 0.9) : at, 'run');
      b.steps.push(
        call(() => {
          if (!this.freeing && this.trapped) {
            this.freeing = true;
            this.timers.push({ t: cr.agency === 'paaste' ? 9 : 12, scene: false, fn: () => this.freeTrapped() });
          }
        }),
        act('lean', 0, [car.x, car.y]),
      );
      return;
    }
    if (cr.agency === 'kiirabi') {
      if (this.over && this.played) this.standBy(b);
      else if (down) {
        const at: V2 = [down.x, down.y];
        this.route(b, this.beside(at, idx + 4, 0.8), 'run');
        const cpr = this.cast.priority === 1 && idx === 0;
        // The paramedics have the patient from here: an officer who knelt by them hands over and steps back.
        b.steps.push(call(() => this.handOver(at)));
        b.steps.push(act(cpr ? 'cpr' : 'aid', 0, at));
      } else if (this.kind === 'indoor') {
        this.route(b, this.inPoint, gait);
        b.steps.push({ k: 'door', out: false, t: 0, on: false });
      } else {
        const v = this.bodies.find((x) => x.kind === 'cast' && x.role === 'victim' && !x.gone && !x.hidden);
        const m: V2 = v ? [v.x, v.y] : this.site.spot;
        this.route(b, this.beside(m, idx + 3, 1.3), 'walk');
        b.steps.push(act(v ? (idx ? 'notes' : 'talk') : 'look', 0, m));
      }
      return;
    }
    if (cr.agency === 'paaste' && this.smoke && !(this.over && this.played)) {
      // The hose line before the burning house: two on the hose, one behind the other, the nozzle in the first
      // one's hands; the third at the lorry's pump.
      const src = this.smoke.at;
      const out = this.site.doorOut ?? ([-this.n[0], -this.n[1]] as V2);
      const car = cr.car;
      if (idx >= 2) {
        const pump = this.carPoint(car, -car.size.length / 2 + 1, -this.kerbSide(car) * (car.size.width / 2 + 0.6));
        this.route(b, this.wall(pump[0], pump[1]) ? this.doorAt(car, idx) : pump, 'run');
        b.steps.push(act('lean', 0, [car.x, car.y]));
        return;
      }
      // On the burning house's own side of the road, four metres before it, facing it: the nozzle in the first
      // one's hands, the second 1.2 m behind on the same line.
      const first = this.offRoad(this.safe([src[0] + out[0] * 4.2, src[1] + out[1] * 4.2]), 0.6, this.sideOf(src));
      const back = dist(first, src) > 1 ? norm(sub(first, src)) : out;
      const second = this.safe([first[0] + back[0] * 1.2, first[1] + back[1] * 1.2]);
      this.route(b, idx === 0 ? first : second, 'run');
      b.steps.push(
        act('hose', 0, src),
        call(() => {
          if (idx === 0) this.hose = { car, by: b, mate: null };
          else if (this.hose) this.hose.mate = b;
        }),
      );
      return;
    }
    if (cr.agency === 'paaste' && this.kind === 'crash' && !(this.over && this.played)) {
      // A rescue crew at a crash never stands idle: the batteries of both wrecks, a look into them, and whatever
      // has run out onto the road is covered.
      const wrecks = this.cars.filter((c) => c.kind === 'cast' && c.mode === 'park');
      const w = wrecks[Math.min(idx, wrecks.length - 1)];
      if (w && idx < 2) {
        const nose = this.carPoint(w, w.size.length / 2 + 0.55, 0);
        const door = this.carPoint(w, 0.3, (idx ? -1 : 1) * (w.size.width / 2 + 0.6));
        this.route(b, this.wall(nose[0], nose[1]) ? door : nose, 'run');
        b.steps.push(act('crouch', 3.5, [w.x, w.y]));
        if (down && idx === 1) {
          this.route(b, this.beside([down.x, down.y], 3, 1), 'walk');
          b.steps.push(act('aid', 0, [down.x, down.y]));
        } else {
          this.route(b, this.wall(door[0], door[1]) ? nose : door, 'walk');
          b.steps.push(act('lean', 0, [w.x, w.y]));
        }
        return;
      }
      if (w) {
        const a = this.carPoint(w, -0.8, w.size.width / 2 + 1);
        const z = this.carPoint(w, 1.6, w.size.width / 2 + 1.3);
        const between = lerp2([w.x, w.y], [cr.car.x, cr.car.y], 0.5);
        if (!this.wall(a[0], a[1]) && !this.wall(z[0], z[1])) {
          this.route(b, a, 'run');
          b.steps.push(act('crouch', 3, [w.x, w.y]), go(lerp2(a, z, 0.5), 'walk'), act('crouch', 3, [w.x, w.y]), go(z, 'walk'), act('crouch', 3, [w.x, w.y]));
          this.route(b, this.safe(between), 'walk');
          b.steps.push(act('guard', 0, onDrive(this.site.drive, w.s + (cr.car.s > w.s ? 30 : -30), 0).pos));
          return;
        }
      }
    }
    this.standBy(b);
  }

  /**
   * The paramedics are at the patient: an officer who knelt there (first aid, or on their chest) gets up, steps
   * back two metres and stands guard with their back to the work, facing whoever looks on. Nobody kneels on
   * beside two paramedics.
   */
  private handOver(at: V2): void {
    for (const p of this.posts) if ((p.act === 'aid' || p.act === 'cpr') && dist(p.at, at) < 3) p.act = 'guard';
    for (const o of this.bodies) {
      if (o.kind !== 'police' || o.duty || o.hidden || o.gone || (o.act !== 'cpr' && o.act !== 'aid') || Math.hypot(o.x - at[0], o.y - at[1]) > 3) continue;
      // Straight back from where they knelt, or the nearest free place round the patient: never where a colleague
      // stands already.
      const d = Math.max(0.3, Math.hypot(o.x - at[0], o.y - at[1]));
      const here: V2 = [o.x, o.y];
      const free = (q: V2) =>
        this.roomAt(q, 0.3) &&
        this.clear(here, q) &&
        !this.bodies.some((x) => x !== o && !x.hidden && !x.gone && Math.hypot(x.x - q[0], x.y - q[1]) < 0.9) &&
        !this.posts.some((q2) => q2.by !== o && dist(q2.at, q) < 0.8);
      const places: V2[] = [[at[0] + ((o.x - at[0]) / d) * 2.4, at[1] + ((o.y - at[1]) / d) * 2.4], ...[3, 4, 1, 2, 5, 0].map((k) => this.beside(at, k, 2.4))];
      const back = places.find(free) ?? places[0];
      o.steps.length = 0;
      o.fidget = false;
      o.steps.push(act('kneelUp', 0.8, null, 0.5), go(back, 'back'), act('guard', 0, [2 * back[0] - at[0], 2 * back[1] - at[1]]));
    }
  }

  /**
   * An officer with nothing more to do in the street goes back to their own car: to its boot with what they picked
   * up (`boot`), then to its pavement side, where they write (the notes, the radio) and then stand by it.
   */
  private backToCar(b: Body, boot: boolean): void {
    const cr = b.crew;
    if (!cr || b.aboard || b.gone || b.duty) return;
    const car = cr.car;
    if (b.post) b.post.by = null;
    b.post = null;
    b.steps.length = 0;
    b.fidget = false;
    this.setAct(b, boot ? 'carry' : 'stand');
    if (boot) {
      const rear = this.carPoint(car, -car.size.length / 2 - 0.6, 0);
      if (!this.wall(rear[0], rear[1])) {
        this.route(b, rear, 'walk');
        b.steps.push(act('lean', 2.5, [car.x, car.y]));
      }
    }
    const i = cr.people.indexOf(b);
    const p = this.carPoint(car, 1.3 - 1.1 * i, this.kerbSide(car) * (car.size.width / 2 + 1.2));
    this.route(b, this.wall(p[0], p[1]) ? this.doorAt(car, i) : p, 'walk');
    b.steps.push(act('notes', 7 + 5 * hash01(b.seed, 52), [car.x, car.y]), act('guard', 0, this.site.spot));
  }

  /** Stand by the car, on the pavement side. */
  private standBy(b: Body): void {
    const cr = b.crew;
    if (!cr) return;
    const car = cr.car;
    const i = cr.people.indexOf(b);
    const p = this.carPoint(car, 1.3 - 1.1 * i, this.kerbSide(car) * (car.size.width / 2 + 1.2));
    if (b.act !== 'idle' && b.act !== 'duck') this.setAct(b, 'stand');
    this.route(b, this.wall(p[0], p[1]) ? this.doorAt(car, i) : p, 'walk');
    b.steps.push(act(cr.police ? 'guard' : 'idle', 0, this.site.spot));
  }

  /** Back to the car and in. */
  private toCar(b: Body): void {
    const cr = b.crew;
    if (!cr || b.aboard) return;
    this.fresh(b);
    if (b.post) b.post.by = null;
    b.post = null;
    this.setAct(b, 'stand');
    const i = cr.people.indexOf(b);
    this.route(b, this.doorAt(cr.car, i), cr.run || (this.cast.kind === 'threat' && !this.over) ? 'run' : 'walk');
    this.getIn(b, cr.car, () => {
      b.aboard = true;
    });
  }

  /**
   * The last steps into a vehicle from beside its door: a turn to it, a duck of the head and the body goes in
   * (then `done`). Nobody vanishes standing upright beside a shut door.
   */
  private getIn(b: Body, car: Car, done: () => void): void {
    b.steps.push(
      call(() => {
        const at: V2 = [b.x, b.y];
        const d = Math.max(0.3, dist(at, [car.x, car.y]));
        b.face = [b.x + Math.cos(car.yaw) * 3, b.y + Math.sin(car.yaw) * 3];
        // Bent low within a fifth of a second, held while the body goes into the car's outline: half a second
        // and more bent over at the door before it is gone.
        b.steps.unshift(
          act('duck', 0.3, null, 0.2),
          slide(lerp2(at, [car.x, car.y], 0.45 / d), 0.45),
          call(() => {
            b.hidden = true;
            this.setAct(b, 'stand');
            done();
          }),
        );
      }),
    );
  }

  private board(cr: Crew): void {
    cr.state = 'boarding';
    cr.clock = 0;
    if (cr.police && !this.crews.some((x) => x !== cr && x.police && (x.state === 'here' || x.state === 'arriving'))) this.lastCrewLeaves(cr);
    for (const b of cr.people) if (!b.aboard && !b.duty) this.toCar(b);
    // Whoever the paramedics saw to where they sat (not a case for the hospital) gets up as they pack and goes:
    // nobody is left sitting alone on the pavement.
    const p = this.patient;
    if (cr.agency === 'kiirabi' && p && p.act === 'sit' && !p.duty && !p.hidden && !p.gone && !p.leaving && !p.steps.length) {
      this.patient = null;
      p.steps.push(wait(2));
      this.getUp(p);
      // (A driver whose car still stands in the road stays by it: it has to be moved yet.)
      const wreck = this.kind === 'crash' && this.toClear > 0 && p.role === 'driver' ? this.wreckOf(p) : null;
      if (wreck && wreck.wreck && wreck.mode === 'park') p.steps.push(act('idle', 0, [wreck.x, wreck.y]));
      else p.steps.push(call(() => this.leave(p, 'walk')));
    }
  }

  /**
   * Called back when its car has pulled away: it stops again at the kerb ahead, where its crew gets out. A car too
   * near the end of the road to stop drives out, and comes again from there.
   */
  private callBack(cr: Crew): void {
    const c = cr.car;
    if (c.mode !== 'drive' || c.stop) return;
    const lat = (c.dir > 0 ? -1 : 1) * this.kerbLat();
    const need = (c.v * c.v) / (2 * 4.5) + 6;
    for (let k = 0; k < 6; k++) {
      const s = c.s + c.dir * (need + 6.4 * k);
      if (s < 3.5 || s > this.length - 3.5 || this.taken(c, c.size, s, lat, ROOM_M)) continue;
      c.ts = s;
      c.tlat = lat;
      c.stop = true;
      this.plan(c, 3.5);
      c.beacons = hasBeacons(c.look.livery);
      cr.state = 'arriving';
      cr.out = 0;
      cr.clock = 0;
      return;
    }
  }

  /** Called back before it had left: whoever is in gets out again, whoever was walking back turns round. */
  private unboard(cr: Crew): void {
    cr.state = 'here';
    cr.out = 0;
    cr.clock = 0.3;
    for (const b of cr.people) {
      if (b.aboard || b.duty) continue;
      b.steps.length = 0;
      this.assign(b);
    }
  }

  // -------------------------------------------------------------------------- the street's own life

  private ambient(dt: number): void {
    const d = this.site.drive;
    const tense = this.phase !== 'after' && (this.kind === 'threat' || this.kind === 'brawl');
    const gaps = BUSY[d.cls];
    if (gaps && !d.deadA && !d.deadB) {
      this.carT -= dt;
      if (this.carT <= 0) {
        this.carT = this.amb.range(gaps[0], gaps[1]) * (this.night ? 2.4 : 1);
        const dir: 1 | -1 = d.oneway ? d.oneway : this.amb.chance(0.5) ? 1 : -1;
        const s = dir > 0 ? 0 : this.length;
        // Not while the road is blocked or somebody at work stands in it, not into the back of somebody, and on a
        // road of one lane not while a crew's vehicle is on the move.
        const clear =
          this.blockS() === null &&
          !(this.kind === 'threat' && this.phase !== 'after') &&
          !this.cars.some((c) => Math.abs(c.s - s) < 30 || (this.width < NARROW_M && c.kind !== 'traffic' && c.mode !== 'park')) &&
          !this.roadFolk().some((p) => (p.b.kind === 'police' || p.b.kind === 'crew') && Math.abs(p.lat) < this.width / 2);
        if (clear) {
          const n = this.serial++;
          const c = this.car(`c:${n}`, lookOfAnyCar(hash32('c', this.cast.seed, n)), 'traffic');
          c.dir = dir;
          c.s = s;
          c.lat = this.laneOf(dir);
          c.mode = 'drive';
          c.stop = false;
          c.ts = dir > 0 ? this.length : 0;
          c.vc = this.amb.range(10, 13.5);
          c.v = c.vc;
          c.lamps = this.night;
          this.pose(c);
        }
      }
    }
    // A weapon in the street: nobody walks past. Whoever was on their way turns round thirty metres off.
    const armed = this.kind === 'threat' && !this.over && this.phase !== 'after';
    // Somebody lies dead on the pavement: its own side of the road is closed to passers-by.
    const cordon = this.cordon;
    if (armed || cordon) {
      for (const b of this.bodies) {
        if (b.kind !== 'passer' || b.leaving || b.gone) continue;
        if (cordon && this.sideOf([b.x, b.y]) !== this.site.side) continue;
        const d = dist([b.x, b.y], this.site.spot);
        if (d < 30 && d > 6) {
          const along = dot(sub([b.x, b.y], this.site.spot), this.u);
          b.steps.length = 0;
          b.steps.push(act('look', 1.2, this.site.spot));
          b.steps.push(call(() => this.leave(b, 'walk', along >= 0 ? 1 : -1)));
          b.leaving = true;
        }
      }
    }
    this.walkT -= dt;
    if (this.walkT <= 0) {
      this.walkT = this.amb.range(10, 40) * (this.night ? 3 : 1);
      if (!this.wet && !armed) {
        const n = this.serial++;
        const seed = hash32('x', this.cast.seed, n);
        // On the far side while there is trouble at the spot.
        const same = tense || cordon ? false : this.amb.chance(0.5);
        const line = (this.site.side === 1) === same ? this.walkL : this.walkR;
        const way = this.aside(this.amb.chance(0.5) ? line : line.slice().reverse(), (hash01(seed, 22) - 0.5) * 1.1);
        if (way.length >= 2 && !this.wall(way[0][0], way[0][1])) {
          const b = this.body(`x:${n}`, lookOfStranger(seed, this.cast.dress), seed, 'passer', 'extra', way[0]);
          b.act = hash01(seed, 1) < 0.15 ? 'phone' : 'stand';
          for (let i = 1; i < way.length; i++) b.steps.push(go(way[i], 'walk'));
          b.steps.push({ k: 'gone' });
        }
      }
    }
  }
}
