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
import { clearLine, insideBuilding, onDrive, pavement } from './site';
import type { AgencySit, CarFrame, Frame, PersonFrame, Situation, Smoke, UnitSit } from './stage';
import type { RoadClass, Site } from './types';
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
/** The speed, m/s, at which a vehicle creeps out round what stands before it. */
const CREEP_V = 1.6;
/** A stopping place keeps this much room to the vehicles standing before and behind it: enough to pull out forwards. */
const ROOM_M = 5;
/** A vehicle that cannot get on for this long goes on regardless, slowly (nobody waits in the road for ever). */
const STUCK_S = 8;
/** Seconds a car takes to turn round where it stands. */
const UTURN_S = 3.4;
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
  | { k: 'act'; act: Act; t: number; face: V2 | null; on: boolean }
  | { k: 'wait'; t: number }
  | { k: 'door'; out: boolean; t: number; on: boolean }
  | { k: 'hide' }
  | { k: 'show' }
  | { k: 'gone' }
  | { k: 'call'; fn: () => void };

const go = (p: V2, gait: Gait): Step => ({ k: 'go', x: p[0], y: p[1], gait });
/** An act, held for `t` seconds before the next step (0: set and go on; it stays until another act replaces it). */
const act = (a: Act, t = 0, face: V2 | null = null): Step => ({ k: 'act', act: a, t, face, on: false });
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
  /** What it was doing before the last change, for the blend. */
  pAct: Act;
  pActT: number;
  pGait: Gait | null;
  pPhase: number;
  blend: number;
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
}

interface Timer {
  t: number;
  fn: () => void;
  /** Part of the scene before its end (a fall, a surrender): dropped when the closing scene starts. */
  scene: boolean;
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

  private t = 0;
  /** Microseconds the scene is ahead of the picture: less than a step. */
  private ahead = 0;
  private started = false;
  private sit: Situation | null = null;
  private tickNo = 0;
  private bodies: Body[] = [];
  private cars: Car[] = [];
  private crews: Crew[] = [];
  private crewBy = new Map<string, Crew>();
  /** Other services that have come and gone: they do not come twice. */
  private done = new Set<string>();
  private live = new Map<string, number>();
  private posts: Post[] = [];
  private pairs: Pair[] = [];
  private wanders: Wander[] = [];
  private timers: Timer[] = [];
  /** Who is in the carriageway in this step (worked out when a moving vehicle first asks). */
  private road: RoadBody[] | null = null;
  private smoke: { at: V2; height: number; strength: number } | null = null;

  private contact = false;
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
  private stopCar: Car | null = null;
  private stopDriver: Body | null = null;
  private radioT = 0;
  private carT = 0;
  private walkT = 0;
  private serial = 0;

  constructor(site: Site, cast: Cast, opts: { night: boolean; quiet?: boolean; wet?: boolean }) {
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
    this.hubs = [site.spot, site.roadSpot, pavement(site, 0)];
    let door: V2 | null = null;
    if (site.door && site.doorOut) {
      const p: V2 = [site.door[0] + site.doorOut[0] * 0.8, site.door[1] + site.doorOut[1] * 0.8];
      if (!this.wall(p[0], p[1])) door = p;
    }
    this.hasDoor = !!door;
    this.inPoint = door ?? pavement(site, 20 * this.openEnd(cast.seed & 1 ? 1 : -1));
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
      for (let i = 0, n = Math.round(SETTLE_S / SETTLE_DT); i < n; i++) this.tick(before, SETTLE_DT);
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
      if (b.blend < BLEND_S)
        pose = mixPose(poseOf({ act: b.pAct, actT: b.pActT, gait: b.pGait, phase: b.pPhase, seed: b.seed, t }), pose, b.blend / BLEND_S);
      people.push({
        id: b.id,
        look: b.look,
        pos: tween ? [lerp(b.wx, b.x, k), lerp(b.wy, b.y, k)] : [b.x, b.y],
        yaw: tween ? lerpAngle(b.wyaw, b.yaw, k) : b.yaw,
        pose,
        scale: b.scale,
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
    return { t, people, cars, smoke };
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
    for (const b of this.bodies) if (!b.gone) this.advance(b, dt);
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
        if (wanted) this.spawnUnit(u, key);
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
      if (u.state === 'here' && cr.state === 'arriving' && cr.car.eta > 3) this.plan(cr.car, 3);
    }
    for (const a of sit.agencies) {
      const key = `a:${a.agency}`;
      this.live.set(key, this.tickNo);
      const cr = this.crewBy.get(key);
      if (!cr) {
        if (a.state !== 'coming' && !this.done.has(key)) this.spawnAgency(a, key);
        continue;
      }
      // Another service stays until the incident has closed and its part is played.
      cr.wantLeave = sit.closed;
      if (a.state === 'here' && cr.state === 'arriving' && cr.car.eta > 3) this.plan(cr.car, 3);
    }
    // Whoever the game no longer names has to go.
    for (const cr of this.crews) if (this.live.get(cr.key) !== this.tickNo) cr.wantLeave = true;
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
    if (this.over && !this.played) {
      this.overT += dt;
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
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
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
          this.past(b, car, this.doorOf(car, 1), 'walk');
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
      phase: 0,
      pAct: 'idle',
      pActT: 0,
      pGait: null,
      pPhase: 0,
      blend: BLEND_S,
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
      wx: at[0],
      wy: at[1],
      wyaw: 0,
      wphase: 0,
      wseen: false,
    };
    this.bodies.push(b);
    return b;
  }

  private wall(x: number, y: number): boolean {
    return insideBuilding(this.site.street, [x, y]) >= 0;
  }

  /** Remember what the body was doing, so the pose blends into what comes next. */
  private keep(b: Body): void {
    b.pAct = b.act;
    b.pActT = b.actT;
    b.pGait = b.gait;
    b.pPhase = b.phase;
    b.blend = 0;
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
    b.pAct = a;
    b.face = face;
    if (face) b.yaw = Math.atan2(face[1] - at[1], face[0] - at[0]);
  }

  /** One step of walking: the feet follow the distance covered. */
  private stride(b: Body, gait: Gait, dx: number, dy: number, d: number, dt: number): void {
    this.setGait(b, gait);
    b.phase += (d / STRIDE[gait]) * TAU;
    this.turn(b, Math.atan2(dy, dx) + (gait === 'back' ? Math.PI : 0), dt);
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
    if (b.blend < BLEND_S) b.blend += dt;
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
        const pace = PACE[st.gait];
        const k = d > pace * left ? (pace * left) / d : 1;
        const nx = b.x + dx * k;
        const ny = b.y + dy * k;
        // Never into a house: the step ends where the wall is.
        if (d < 1e-6 || this.wall(nx, ny)) {
          b.steps.shift();
          continue;
        }
        // Never under a moving vehicle: they let it pass (whoever is in its way already walks on, out of it).
        if (this.inTheWay(b.x, b.y, nx, ny)) break;
        this.stride(b, st.gait, dx, dy, d * k, dt);
        b.x = nx;
        b.y = ny;
        moving = true;
        left -= (d * k) / pace;
        if (k >= 1) b.steps.shift();
      } else if (st.k === 'act') {
        if (!st.on) {
          st.on = true;
          this.setAct(b, st.act);
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
      if (st.k === 'go') return [st.x, st.y];
    }
    return [b.x, b.y];
  }

  /** Walk to a point: straight when nothing stands between, else by way of the spot, the road or the pavement. */
  private route(b: Body, to: V2, gait: Gait): void {
    const st = this.site.street;
    const a = this.endOf(b);
    if (!clearLine(st, a, to)) {
      const hub = this.hubs.find((h) => clearLine(st, a, h) && clearLine(st, h, to));
      if (hub) b.steps.push(go(hub, gait));
      else {
        const pa = nearestOnLine(a, this.walkOf(a)).pt;
        const pb = nearestOnLine(to, this.walkOf(to)).pt;
        b.steps.push(go(pa, gait), go(pb, gait));
      }
    }
    b.steps.push(go(to, gait));
  }

  /**
   * Walk to a point beside a vehicle, or away from one, not through it: somebody who starts at one of its doors
   * goes round its front, anybody else round the nearer end.
   */
  private past(b: Body, car: Car, to: V2, gait: Gait): void {
    const a = this.endOf(b);
    const fx = Math.cos(car.yaw);
    const fy = Math.sin(car.yaw);
    const la = -(a[0] - car.x) * fy + (a[1] - car.y) * fx;
    const lb = -(to[0] - car.x) * fy + (to[1] - car.y) * fx;
    if (la * lb < 0) {
      // Where the straight line crosses the vehicle's long axis.
      const k = la / (la - lb);
      const f = (a[0] + (to[0] - a[0]) * k - car.x) * fx + (a[1] + (to[1] - a[1]) * k - car.y) * fy;
      const half = car.size.length / 2 + 0.7;
      if (Math.abs(f) < half) {
        const fa = (a[0] - car.x) * fx + (a[1] - car.y) * fy;
        const atDoor = Math.abs(fa) < car.size.length / 2 && Math.abs(la) < car.size.width / 2 + 0.9;
        const end = atDoor || f >= -0.5 ? half : -half;
        const w = car.size.width / 2 + 0.6;
        const sa = la > 0 ? w : -w;
        const p1: V2 = [car.x + fx * end - fy * sa, car.y + fy * end + fx * sa];
        const p2: V2 = [car.x + fx * end + fy * sa, car.y + fy * end - fx * sa];
        if (!this.wall(p1[0], p1[1]) && !this.wall(p2[0], p2[1])) b.steps.push(go(p1, gait), go(p2, gait));
      }
    }
    this.route(b, to, gait);
  }

  /** The walking line on the side of the road a point is on. */
  private walkOf(p: V2): V2[] {
    const n = nearestOnLine(p, this.site.drive.pts);
    return cross(n.dir, sub(p, n.pt)) >= 0 ? this.site.walkLeft : this.site.walkRight;
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
  private leave(b: Body, gait: Gait, sign = 0): void {
    this.release(b);
    if (b.post) b.post.by = null;
    b.post = null;
    b.leaving = true;
    // Whoever walks off does it with their arms down (a phone stays at the ear).
    if (b.act !== 'phone' && b.act !== 'cold') this.setAct(b, 'stand');
    const line = this.walkOf([b.x, b.y]);
    const n = nearestOnLine(this.endOf(b), line);
    const dir = this.openEnd(sign || (b.seed & 1 ? 1 : -1));
    this.route(b, n.pt, gait);
    const way = sliceLine(line, n.s, dir > 0 ? lineLength(line) : 0);
    for (let i = 1; i < way.length; i++) b.steps.push(go(way[i], gait));
    b.steps.push({ k: 'gone' });
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
      if (this.roomAt(q, room) && clearLine(this.site.street, q, spot)) return q;
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
  private post(at: V2, a: Act, face: V2 | null, enter = false): void {
    if (!enter) {
      const near = (p: V2) =>
        this.posts.some((q) => !q.enter && dist(p, q.at) < 0.8) ||
        this.bodies.some((b) => b.kind === 'cast' && !b.hidden && dist(p, [b.x, b.y]) < 0.55 && !DOWN.has(b.act));
      if (near(at)) {
        search: for (let ring = 1; ring <= 4; ring++)
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * TAU + ring * 0.3;
            const p: V2 = [at[0] + Math.cos(ang) * 0.6 * ring, at[1] + Math.sin(ang) * 0.6 * ring];
            if (!near(p) && this.roomAt(p, 0) && clearLine(this.site.street, p, at)) {
              at = p;
              break search;
            }
          }
      }
    }
    this.posts.push({ at, face, act: a, enter, by: null });
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
        const p = this.safe(this.local((i % 2 ? 1 : -1) * (far + 1.3 * (i >> 1)), 0.3));
        this.stand(b, p, a ?? (b.role === 'caller' ? 'phone' : cold ? 'cold' : r.pick<Act>(['idle', 'point', 'idle'])), spot);
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
      for (let i = 0; i < np; i++) {
        const home = this.safe(this.local((i - (np - 1) / 2) * 3.8, 0.4), 1.5);
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
      if (c.down && np) this.timers.push({ t: 5, scene: true, fn: () => this.knockDown() });
      if (c.runs && sus.length) this.runner = sus[sus.length - 1];
      for (const x of sus) this.post(this.beside(x.mark, 0), 'guard', x.mark);
      if (b.length) this.post(c.down ? this.beside(b[0].mark, 1, 0.8) : this.beside(b[0].mark, 1), c.down ? 'aid' : 'notes', b[0].mark);
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
      keepOff.forEach((b, i) => {
        if (i === 0 && c.down && b.role === 'victim') {
          this.stand(b, this.safe(this.local(2.6, 0.5)), 'lie');
          return;
        }
        // Eight metres and more from wherever the weapon goes: they start a little nearer and back away. A wall
        // on one side sends them to the other.
        const sg = i % 2 ? 1 : -1;
        const keep = 8.4 + PACE_M;
        let to = m;
        // Never on somebody else's place: where walls send two of them to the same point, the next one along.
        const free = (p: V2) => !placed.some((q) => dist(p, q) < 0.9);
        for (const d of [keep + 1.2 * (i >> 1), -(keep + 1.2 * (i >> 1)), keep + 3 + 1.2 * (i >> 1), -(keep + 3 + 1.2 * (i >> 1)), keep + 4.5, -(keep + 4.5), keep + 6, -(keep + 6)]) {
          to = this.safe(this.local(sg * d, 0.4));
          if (dist(to, m) >= keep && free(to)) break;
        }
        if (!free(to)) to = this.beside(to, 1 + (i % 5), 1);
        placed.push(to);
        const from = lerp2(to, m, 2 / Math.max(2, dist(to, m)));
        this.stand(b, this.wall(from[0], from[1]) || !clearLine(this.site.street, from, to) ? to : from, 'cower', m);
        b.steps.push(go(to, 'back'));
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
          if (this.roomAt(p, 0) && clearLine(this.site.street, p, m) && !this.posts.some((q) => dist(q.at, p) < 1)) {
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
        this.post(this.beside(b.mark, i), (['talk', 'notes', 'guard'] as Act[])[i], b.mark);
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
        this.post(this.beside(m, 0, 0.8), 'aid', m);
      }
      const rest = all.filter((x) => x !== down);
      const caller = rest.find((x) => x.role === 'caller') ?? rest[0];
      if (caller) {
        this.stand(caller, c.inRoad ? this.safe(this.local(0.8, -this.kerbD + 0.6)) : this.beside(m, 1, 1.4), 'phone', m);
        this.post(this.beside(caller.mark, 2), 'notes', caller.mark);
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
        if (this.wall(car.x, car.y)) this.park(car, car.s, this.site.side * Math.max(0, w / 2 - 1.15), car.dir, 0.2);
        car.hazard = true;
        car.wreck = !c.single;
        return car;
      });
      const folk = [...drv, ...sus, ...vic];
      const edge = this.site.side * (w / 2 + 0.9);
      let hurt: Body | null = null;
      if (c.down) hurt = vic[0] ?? folk[folk.length - 1] ?? null;
      folk.forEach((b, i) => {
        if (b === hurt) {
          const p = onDrive(this.site.drive, this.at - 0.5, this.site.side * Math.max(0, w / 2 - 0.5)).pos;
          this.stand(b, this.wall(p[0], p[1]) ? spot : p, r.chance(0.5) ? 'sit' : 'lie');
          b.yaw = r.range(0, TAU);
          this.post(this.beside(b.mark, 0, 0.8), 'aid', b.mark);
          return;
        }
        const p = this.safe(onDrive(this.site.drive, this.at + (i - folk.length / 2) * 1.7, edge).pos);
        this.stand(b, p, i % 2 ? 'argue' : 'phone', wrecks[0] ? [wrecks[0].x, wrecks[0].y] : this.site.roadSpot);
      });
      const talk = folk.find((b) => b !== hurt);
      if (talk) this.post(this.beside(talk.mark, 1), 'notes', talk.mark);
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
        const window = this.carPoint(car, 0.4, -kerb * (car.size.width / 2 + 0.6));
        if (driver) {
          this.stopDriver = driver;
          others.delete(driver);
          if (r.chance(0.5) || this.wall(beside[0], beside[1])) {
            this.stand(driver, [car.x, car.y], 'idle');
            driver.hidden = true;
            driver.aboard = true;
            car.riders.push(driver);
            this.post(window, 'lean', [car.x, car.y]);
          } else {
            this.stand(driver, beside, c.drunk ? 'sway' : r.pick<Act>(['idle', 'smoke']), this.site.roadSpot);
            this.post(this.beside(beside, 1), 'talk', beside);
          }
        } else this.post(window, 'lean', [car.x, car.y]);
        this.post(this.safe(this.carPoint(car, -car.size.length / 2 - 1.2, kerb * (car.size.width / 2 + 0.9))), 'guard', [car.x, car.y]);
        // Whoever else is in it stands on the pavement beside it.
        sus
          .filter((x) => x !== driver)
          .forEach((x, i) =>
            this.stand(x, this.safe(this.carPoint(car, -0.6 - i * 1.1, kerb * (car.size.width / 2 + 1))), 'idle', this.site.roadSpot),
          );
        c.cars.slice(1).forEach((x, i) => this.kerbCar(x.id, x.look, i + 1));
      } else {
        if (driver) this.stand(driver, spot, 'idle', this.site.roadSpot);
        this.post(this.beside(spot, 0), 'talk', spot);
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
        this.post(this.beside(b.mark, i), 'guard', b.mark);
      });
      this.post(this.beside(target, 2, 1), 'lean', faceTo);
      if (c.runs && sus.length) this.runner = sus[0];
      for (const x of [...vic, ...drv]) others.add(x);
      const list = [...others];
      lookOn(list, 8);
      if (list[0]) this.post(this.beside(list[0].mark, 1), 'notes', list[0].mark);
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
        const back = (i % 2) * 0.7 + hash01(b.seed, 6) * 1.1;
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
            if (clear(p) && this.roomAt(p, 0) && clearLine(this.site.street, p, at)) best = p;
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
    const amp = p.still ? 0.15 : 0.45;
    const ang = Math.atan2(this.u[1], this.u[0]) + (p.still ? 0.25 * Math.sin(p.t * 0.3) : 0.12 * p.t);
    const mx = p.home[0] + amp * wobble(p.seed, p.t, 0.25);
    const my = p.home[1] + amp * wobble(p.seed + 9, p.t, 0.21);
    const dx = Math.cos(ang) * p.d;
    const dy = Math.sin(ang) * p.d;
    const a: Act = p.grip ? 'grapple' : 'fight';
    for (const [b, sg] of [
      [p.a, -1],
      [p.b, 1],
    ] as const) {
      this.setAct(b, a);
      this.turn(b, ang + (sg < 0 ? 0 : Math.PI), dt);
      // Towards its place in the fight, never through a wall and never in a jump.
      const tx = mx + dx * sg - b.x;
      const ty = my + dy * sg - b.y;
      const far = Math.hypot(tx, ty);
      const k = far > 2 * dt ? (2 * dt) / far : 1;
      if (far > 1e-6 && !this.wall(b.x + tx * k, b.y + ty * k)) {
        b.x += tx * k;
        b.y += ty * k;
      }
    }
  }

  /** The first fight ends with one of them on the ground. */
  private knockDown(): void {
    const p = this.pairs.find((x) => x.still && x.a.kind === 'cast' && x.a.role !== 'extra');
    if (!p) return;
    this.pairs = this.pairs.filter((x) => x !== p);
    const at: V2 = [p.b.x, p.b.y];
    p.b.steps.push(act('fall', 0.7), act('lie'));
    p.a.steps.push(act('kick', 3, at), act('stand', 0, at));
  }

  // -------------------------------------------------------------------------- the police come in sight, and arrive

  private onSeen(cr: Crew): void {
    this.raise('seen');
    const car = cr.car;
    for (const b of this.bodies) {
      if (b.kind === 'cast' && b.role === 'caller' && !b.hidden && !b.steps.length && !DOWN.has(b.act)) {
        const was = b.act;
        b.steps.push(act('wave', 4, [car.x, car.y]), act(was === 'phone' ? 'idle' : was, 0, this.site.roadSpot));
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
      const fighters = this.pairs.flatMap((p) => [p.a, p.b]);
      this.pairs = [];
      for (const b of fighters) {
        b.steps.push(go(b.mark, 'back'));
        if (b.role === 'suspect') b.steps.push(act('handsUp', 2), act(hash01(b.seed, 5) < 0.5 ? 'argue' : 'stand'));
        else b.steps.push(act(b.role === 'extra' ? 'argue' : 'idle'));
      }
      for (const b of this.bodies)
        if (b.kind === 'cast' && b.act === 'argue' && b.role === 'suspect' && !b.steps.length && !fighters.includes(b))
          b.steps.push(act('handsUp', 2), act('argue'));
    } else if (kind === 'threat') {
      const w = this.wanders[0];
      if (!w) {
        // Nobody left to aim at: the officers look around.
        for (const p of this.posts) if (p.act === 'aim') p.act = 'look';
        for (const b of this.bodies) if (b.kind === 'police' && b.act === 'aim') this.setAct(b, 'look');
        return;
      }
      const armed = w.b;
      this.timers.push({
        t: 2 + 2 * hash01(armed.seed, 6),
        scene: true,
        fn: () => {
          if (armed.gone || armed.duty) return;
          this.release(armed);
          armed.steps.length = 0;
          armed.steps.push(go(armed.mark, 'walk'), act('handsUp', 2.5, this.site.roadSpot), act('kneel'));
          armed.steps.push(
            call(() => {
              // The first officer walks up and holds them; the others lower their weapons.
              const offs = this.bodies.filter((b) => b.kind === 'police' && !b.hidden && !b.duty && b.post && !b.leaving && b.crew?.state === 'here');
              offs.forEach((o, i) => {
                o.steps.length = 0;
                if (i === 0) {
                  this.route(o, this.beside(armed.mark, 0, 0.75), 'walk');
                  o.steps.push(act('hold', 0, armed.mark));
                } else o.steps.push(wait(3), act('guard', 0, armed.mark));
              });
              for (const p of this.posts) if (p.act === 'aim') p.act = 'guard';
            }),
          );
        },
      });
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
    this.past(d, car, to, this.cast.drunk ? 'stagger' : 'walk');
    d.steps.push(act(this.cast.drunk ? 'sway' : 'talk', 0, this.site.roadSpot));
    const o = this.bodies.find((b) => b.kind === 'police' && b.act === 'lean' && !b.duty);
    if (o) {
      o.steps.length = 0;
      this.past(o, car, this.beside(to, 1), 'walk');
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
    this.wanders = [];
    this.timers = this.timers.filter((tm) => !tm.scene);
    for (const b of fighters) if (!b.steps.length) b.steps.push(act(b.role === 'suspect' ? 'stand' : 'idle'));
    // Whoever is arrested out of a stopped car gets out of it first.
    if (result === 'arrest' && this.officers().length && !this.bodies.some((b) => b.kind === 'cast' && b.role === 'suspect' && !b.gone && !b.aboard))
      this.driverOut();
    const folk = this.castOnStage();
    const down = (b: Body) => DOWN.has(b.act) || b.steps.some((s) => s.k === 'act' && DOWN.has(s.act));

    if (result === 'arrest') {
      // Everybody arrested goes with the crew the game sends to the cells; any crew will do when it names none.
      const all = this.officers();
      const takers = all.filter((o) => o.crew?.takes === 'arrest');
      const offs = takers.length ? takers : all;
      const suspects = folk.filter((b) => b.role === 'suspect');
      const held = (suspects.length ? suspects : folk.filter((b) => b.role === 'driver')).slice(0, Math.max(1, sit.outcome?.arrests ?? 1));
      held.forEach((s, i) => {
        if (offs.length) this.arrest(s, offs[i % offs.length], i);
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
          o.steps.length = 0;
          o.steps.push(go(p, 'run'), act('look', 2), go(back, 'walk'), act('guard'));
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
      for (const b of this.bodies) {
        if (b.kind === 'crew' && !b.hidden && (b.act === 'aid' || b.act === 'cpr')) {
          b.steps.length = 0;
          b.steps.push(act('kneelUp', 3), act('stand'));
        } else if (b.kind === 'police' && !b.hidden && !b.steps.length && b.act !== 'direct') this.setAct(b, 'guard');
      }
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
      const o = this.officers().find((b) => !b.hidden && !b.steps.length);
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
      if (!this.wall(p[0], p[1]) && clearLine(this.site.street, at, p)) return p;
    }
    return at;
  }

  /** Cuff a suspect and walk them to the officer's car. */
  private arrest(s: Body, o: Body, k: number): void {
    const cr = o.crew;
    if (!cr) return;
    const car = cr.car;
    const out = s.inside && s.hidden;
    this.fresh(s);
    s.duty = true;
    // Out of a door: a step clear of it first, so the officer coming out behind has room.
    const o2 = this.site.doorOut;
    if (out && o2) {
      const p: V2 = [this.inPoint[0] + o2[0] * 0.9, this.inPoint[1] + o2[1] * 0.9];
      if (!this.wall(p[0], p[1])) s.steps.push(go(p, 'walk'));
    }
    s.steps.push(act('handsUp', 1 + 0.3 * k), act('cuffed'));
    if (o.wards.length) {
      // The officer already leads one: this one is walked along behind.
      o.wards.push(s);
      return;
    }
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
    const door = this.carPoint(car, -0.75, this.kerbSide(car) * (car.size.width / 2 + 0.6));
    this.route(o, this.holdFrom(at, door, from), this.cast.kind === 'threat' ? 'run' : 'walk');
    o.steps.push(
      act('hold', 1.6, at),
      call(() => {
        o.wards.forEach((w, i) => {
          w.steps.length = 0;
          this.setAct(w, 'cuffed');
          if (i) w.steps.push(wait(0.9 * i));
          this.past(w, car, door, 'escort');
          w.steps.push(
            call(() => {
              w.hidden = true;
              w.aboard = true;
              w.duty = false;
              car.riders.push(w);
            }),
          );
        });
        const short = this.carPoint(car, -1.6, this.kerbSide(car) * (car.size.width / 2 + 0.7));
        this.past(o, car, this.wall(short[0], short[1]) ? door : short, 'escort');
        o.steps.push(
          wait(0.8 * o.wards.length),
          call(() => {
            o.duty = false;
            o.wards = [];
            if (cr.state === 'boarding') this.toCar(o);
            else this.standBy(o);
          }),
        );
      }),
    );
  }

  /** The patient goes with the ambulance, or with a police car that takes them, or sits and is looked after. */
  private toHospital(p: Body): void {
    const amb = this.crewBy.get('a:kiirabi');
    const wasDown = DOWN.has(p.act);
    // The crew the game sends to hospital takes them; else the ambulance that stands here.
    const ride = this.taker('hospital') ?? (amb && amb.state === 'here' && !amb.through ? amb : null);
    if (!ride) {
      if (p.hidden) return;
      this.release(p);
      p.steps.length = 0;
      p.steps.push(act('sit'));
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
    if (wasDown) p.steps.push(act('sit', 1.6), act('stand', 0.7));
    else p.steps.push(act('stand'));
    const rear = ride.police
      ? this.carPoint(car, -0.75, this.kerbSide(car) * (car.size.width / 2 + 0.6))
      : this.carPoint(car, -car.size.length / 2 - 0.7, 0);
    const start = () => {
      if (p.gone || p.aboard) return;
      p.steps.length = 0;
      this.past(p, car, rear, 'escort');
      p.steps.push(
        call(() => {
          p.hidden = true;
          p.aboard = true;
          p.duty = false;
          car.riders.push(p);
        }),
      );
      helpers.forEach((h, i) => {
        h.steps.length = 0;
        this.setAct(h, 'hold');
        const side = this.carPoint(car, -car.size.length / 2 - 0.9, (i ? -1 : 1) * 0.9);
        this.past(h, car, this.wall(side[0], side[1]) ? rear : side, 'escort');
        h.steps.push(
          wait(1),
          call(() => {
            h.duty = false;
            if (ride.state === 'boarding') this.toCar(h);
            else this.standBy(h);
          }),
        );
      });
    };
    if (!helpers.length) {
      p.steps.push(call(start));
      return;
    }
    helpers.forEach((h, i) => {
      const inside = h.inside && h.hidden;
      this.fresh(h);
      if (h.post) h.post.by = null;
      h.post = null;
      h.duty = true;
      if (!(inside && wasIn)) this.route(h, this.beside(at, i, 0.85), 'walk');
      h.steps.push(act(wasDown ? 'aid' : 'hold', wasDown ? 2.4 : 1, at));
      if (i === 0) h.steps.push(call(start));
    });
  }

  /** Somebody is driven home (or to a station): after a word they walk to the crew's car and get in at the back. */
  private giveRide(p: Body, cr: Crew, after: number): void {
    const car = cr.car;
    const wasDown = DOWN.has(p.act);
    this.fresh(p);
    p.duty = true;
    p.inRoad = false;
    p.steps.push(wait(after));
    if (wasDown) p.steps.push(act('sit', 1.6), act('stand', 0.7));
    else p.steps.push(act('stand'));
    p.steps.push(
      call(() => {
        this.past(p, car, this.carPoint(car, -0.75, this.kerbSide(car) * (car.size.width / 2 + 0.6)), this.cast.drunk ? 'stagger' : 'walk');
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
      b.steps.push(wait(delay));
      if (DOWN.has(b.act)) b.steps.push(act('sit', 3), act('stand', 0.8));
      b.inRoad = false;
      const car = drive ? this.rideOf(b, drivers) : null;
      if (car) {
        car.due.push(b);
        b.steps.push(
          call(() => {
            this.past(b, car, this.carPoint(car, 0.45, -this.kerbSide(car) * (car.size.width / 2 + 0.55)), 'walk');
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
      this.past(b, car, this.carPoint(car, 0.45, -this.kerbSide(car) * (car.size.width / 2 + 0.55)), 'run');
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
    for (const b of this.bodies) {
      if (b.kind !== 'cast' || b.gone || b.leaving) continue;
      if (b.hidden) this.vanish(b);
      else if (!b.steps.length) {
        if (DOWN.has(b.act)) b.steps.push(act('sit', 2), act('stand', 0.8));
        b.steps.push(call(() => this.leave(b, 'walk')));
      }
    }
    for (const c of this.cars) if (c.kind === 'cast' && c.mode === 'park' && !c.hazard) c.lamps = false;
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
        this.past(p, cr.car, this.carPoint(cr.car, -0.75, this.kerbSide(cr.car) * (cr.car.size.width / 2 + 0.6)), 'escort');
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
        p.steps.push(
          act('stand', 2),
          call(() => this.leave(p, 'walk')),
        );
      }
    }
    if (this.over) {
      for (const b of this.bodies) {
        // Whoever lies there after a tragedy is taken away as the last crew goes (the camera does not show how).
        if (
          b.kind === 'cast' &&
          !b.gone &&
          !b.hidden &&
          !b.duty &&
          !b.leaving &&
          DOWN.has(b.act) &&
          !b.steps.length &&
          this.sit?.outcome?.result === 'tragedy'
        ) {
          b.steps.push(wait(2), { k: 'door', out: false, t: 0, on: false }, { k: 'gone' });
        }
      }
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

  private kerbLat(): number {
    return Math.max(0, this.width / 2 - 1.15);
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
  private taken(me: Car | null, size: CarSize, s: number, lat: number, room = 1): boolean {
    for (const o of this.cars) {
      if (o === me || o.mode === 'gone' || (o.mode === 'drive' && !o.stop)) continue;
      const parked = o.mode === 'park' || o.mode === 'turn';
      const os = parked ? o.s : o.ts;
      const ol = parked ? o.lat : o.tlat;
      const [el, ew] = this.ext(o);
      const side = Math.abs(ol - lat) - ew - size.width / 2;
      if (side < 1) {
        if (Math.abs(os - s) < el + size.length / 2 + room) return true;
      } else if (side < PASS_M && room > 1) {
        // Across the road from it there would be no way through between the two: far enough along for whoever
        // passes to swing from the one's side to the other's.
        const swing = Math.max(0, 2 * (ew + size.width / 2 + 0.25) - Math.abs(ol - lat));
        if (Math.abs(os - s) < 2 * el + size.length + 1 + swing / 0.6) return true;
      }
    }
    return false;
  }

  /**
   * The place an arriving crew stops at: at its own kerb short of the spot, behind whoever came before with room to
   * pull out; past the spot when there is none before it; at the other kerb when its own is full. Never beyond
   * what blocks the road, and never on a taken place: null when the road has no room left.
   */
  private slot(size: CarSize, fromA: boolean): { s: number; lat: number } | null {
    const back = fromA ? -1 : 1;
    const first = this.kind === 'crash' && !this.cast.single ? 12 : 7;
    const block = this.blockS();
    const own = (fromA ? -1 : 1) * this.kerbLat();
    const folk = this.roadFolk();
    // With room to pull out forwards; where the road is too short for that, close up behind what stands there.
    for (const room of [ROOM_M, 1.2]) {
      const fits = (s: number, lat: number) =>
        s >= 3.5 &&
        s <= this.length - 3.5 &&
        (block === null || (s - block) * back >= 6) &&
        !this.taken(null, size, s, lat, room) &&
        !folk.some((p) => p.still && Math.abs(p.s - s) < size.length / 2 + 1 && Math.abs(p.lat - lat) < size.width / 2 + 0.6);
      for (const lat of own ? [own, -own] : [own]) {
        for (const side of [back, -back]) {
          for (let d = first; d <= 70; d++) {
            const s = this.at + side * d;
            if (fits(s, lat)) return { s, lat };
          }
        }
      }
      // A road too short for that: nearer the spot.
      for (let d = first - 1; d >= 4; d--) {
        const s = this.at + back * d;
        if (fits(s, own)) return { s, lat: own };
      }
    }
    return null;
  }

  /**
   * The way in for an arriving vehicle: from the end the game names when it can (nobody comes out of a dead end
   * while the other end is open, or through what blocks the road), else from the other one. 'wait' while the way
   * in is taken for the moment; null when there is no place to stop at all (the vehicle stays out of the picture).
   */
  private wayIn(size: CarSize, fromA: boolean): { fromA: boolean; s: number; lat: number } | 'wait' | null {
    const d = this.site.drive;
    const open = (a: boolean) => !(a ? d.deadA : d.deadB) || (a ? d.deadB : d.deadA);
    let busy = false;
    for (const a of [fromA, !fromA]) {
      if (!open(a)) continue;
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
        } else if (near || this.width < NARROW_M) now = true;
      }
      if (shut) continue;
      const place = this.slot(size, a);
      if (!place) continue;
      if (now) {
        busy = true;
        continue;
      }
      return { fromA: a, ...place };
    }
    return busy ? 'wait' : null;
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
  private wayCost(s: number, dir: number): number {
    const block = this.blockS();
    if (block !== null && (block - s) * dir > 0.5) return 2;
    if (this.width < NARROW_M && this.cars.some((o) => o.mode === 'park' && (o.s - s) * dir > 1)) return 2;
    const d = this.site.drive;
    return (dir > 0 ? d.deadB : d.deadA) ? 1 : 0;
  }

  /** Does a parked vehicle turn round to leave? Yes when the way ahead is worse, or when it has to go the other way (`want`). */
  private turnsRound(c: Car, want: 1 | -1 | 0): boolean {
    return want ? want !== c.dir && this.wayCost(c.s, want) < 2 : this.wayCost(c.s, -c.dir) < this.wayCost(c.s, c.dir);
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
    // The carriageway and the verge a vehicle may take to get past something.
    const half = this.width / 2 + 2.2;
    for (const b of this.bodies) {
      if (b.hidden || b.gone) continue;
      const n = nearestOnLine([b.x, b.y], pts);
      if (n.d > half) continue;
      list.push({ b, s: n.s, lat: cross(n.dir, sub([b.x, b.y], n.pt)) >= 0 ? n.d : -n.d, still: !b.gait });
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
    const shut: [number, number][] = [];
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
        if (c.lat >= o.lat) lo = Math.max(lo, o.lat + ew + hw + BERTH_M);
        else hi = Math.min(hi, o.lat - ew - hw - BERTH_M);
      } else if (Math.abs(ahead) < el + hl + look) {
        shut.push([o.lat - ew - hw - BERTH_M, o.lat + ew + hw + BERTH_M]);
        if (ahead > 0) first = Math.min(first, ahead);
      }
    }
    for (const p of this.roadFolk()) {
      const ahead = (p.s - c.s) * c.dir;
      if (ahead > toStop) continue;
      if (Math.abs(ahead) < hl + 0.8) {
        if (c.lat >= p.lat) lo = Math.max(lo, p.lat + hw + 0.45);
        else hi = Math.min(hi, p.lat - hw - 0.45);
      } else if (p.still && Math.abs(ahead) < hl + look) shut.push([p.lat - hw - 0.9, p.lat + hw + 0.9]);
    }
    if (lo > hi) return c.lat;
    // With a proper berth if there is room for one, else a hand's breadth from each (a squeeze between two).
    let best: number | null = null;
    for (const tight of [0, BERTH_M - 0.25]) {
      const free = (lat: number) => lat >= lo - 1e-6 && lat <= hi + 1e-6 && !shut.some((r) => lat > r[0] + tight + 1e-6 && lat < r[1] - tight - 1e-6);
      for (const lat of [lane, lo, hi, ...shut.flatMap((r) => [r[0] + tight, r[1] - tight])]) {
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
      // A corner swinging round as it straightens can reach somebody beside the road: then it waits.
      if (this.bodies.some((b) => !b.hidden && !b.gone && this.under(c, b))) {
        [c.s, c.yawOff] = was;
        c.back += move;
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
      c.turnT += dt / UTURN_S;
      const k = smooth(Math.min(1, c.turnT));
      c.yawOff = Math.PI * k;
      c.lat = lerp(c.turnFrom, c.turnTo, k);
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
    let want = this.lane(c);
    let vt = c.vc;
    if (c.stop) vt = Math.max(0.9, Math.min(vt, Math.sqrt(2 * c.brake * Math.max(0, d))));
    // Kept from getting on for long (the count runs down again while it moves), it goes on regardless of
    // vehicles, slowly; of people only much later.
    const free = this.behind(c, vt, want, false);
    if (free < 0.5 && vt >= 0.5) c.wait += dt;
    else c.wait = Math.max(0, c.wait - (free < vt ? 0.5 : 4) * dt);
    vt = c.wait > STUCK_S ? Math.min(vt, 2, c.wait > 4 * STUCK_S ? vt : this.behind(c, vt, want, true)) : free;
    const was = c.v;
    c.v = c.v < vt ? Math.min(vt, c.v + c.acc * dt) : Math.max(vt, c.v - 9 * dt);
    c.braking = c.v < was - 0.5 * dt;
    c.eta = Math.max(0, c.eta - dt);
    const move = c.v * dt;
    if (c.stop && move >= d) {
      c.s = c.ts;
      c.lat = c.tlat;
      c.v = 0;
      c.steer = 0;
      c.braking = false;
      c.eta = 0;
      c.wait = 0;
      c.mode = 'park';
      this.pose(c);
      return;
    }
    const ps = c.s;
    const pl = c.lat;
    c.s += c.dir * move;
    if (c.stop) want = lerp(c.tlat, want, smooth(clamp(d / 16, 0, 1)));
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
    // where it was instead (for a long while; nobody waits in the road for ever).
    if (move > 0 && waited < 4 * STUCK_S && this.bumps(c, ps, pl, turned)) {
      c.s = ps;
      c.lat = pl;
      c.steer = turned;
      c.v = 0;
      c.wait = waited + dt;
      this.pose(c);
    }
  }

  /** The corners of a vehicle's footprint. */
  private corners(c: Car): V2[] {
    const hl = c.size.length / 2;
    const hw = c.size.width / 2;
    return [this.carPoint(c, hl, hw), this.carPoint(c, hl, -hw), this.carPoint(c, -hl, -hw), this.carPoint(c, -hl, hw)];
  }

  /** Do the footprints of two vehicles overlap? (Separating axes of two boxes.) */
  private overlap(a: Car, b: Car): boolean {
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 16) return false;
    const p = this.corners(a);
    const q = this.corners(b);
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
  private bumps(c: Car, s: number, lat: number, steer: number): boolean {
    if (this.bodies.some((b) => !b.hidden && !b.gone && this.under(c, b))) return true;
    const hit = this.cars.filter((o) => o !== c && o.mode !== 'gone' && this.overlap(c, o));
    if (!hit.length) return false;
    const now = [c.s, c.lat, c.steer];
    c.s = s;
    c.lat = lat;
    c.steer = steer;
    this.pose(c);
    const fresh = hit.some((o) => !this.overlap(c, o));
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
      else if (Math.abs(o.lat - want) > ew + hw + 0.2) {
        // It steers round: slowly only when it would not be clear of it in time.
        const side = ew + hw + 0.2 - Math.abs(o.lat - c.lat);
        if (gap < 2 + (c.v * side) / SIDE_V) vt = Math.min(vt, gap < 0.6 ? 0 : CREEP_V);
      }
      // No way round it for now: far enough back to pull out later.
      else vt = Math.min(vt, gap < ROOM_M + 0.2 ? 0 : 2.5);
    }
    for (const p of this.roadFolk()) {
      // Somebody walking may step into the way: a wider berth than for somebody standing.
      // Beside its front half counts too, when they are as good as touching it.
      const gap = (p.s - c.s) * c.dir - hl;
      if (gap < -hl || gap > Math.min(reach, toStop) || Math.abs(p.lat - c.lat) > hw + (gap < -0.5 ? 0.25 : p.still ? 0.5 : 1.3)) continue;
      vt = Math.min(vt, gap < (p.still ? 1.5 : 2.5) ? 0 : 2.5);
    }
    return vt;
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
    const way = this.wayIn(CAR_SIZE[look.body], (hash32('from', this.cast.seed, a.agency) & 1) === 0);
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
      }
      return;
    }
    if (cr.state === 'here') {
      car.lamps = this.night;
      car.beacons = hasBeacons(car.look.livery) && open && !cr.through;
      const hold = this.over && !this.played && this.overT < HOLD_S;
      if (cr.wantLeave && (cr.through || !hold)) {
        this.board(cr);
        return;
      }
      if (cr.through) return;
      cr.clock += dt;
      while (cr.out < cr.people.length && cr.clock >= 0.5 + 0.45 * cr.out) this.alight(cr, cr.out++);
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
          if (!b.duty && !b.steps.length) this.toCar(b);
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

  /** One of a crew gets out at their door and goes to work. */
  private alight(cr: Crew, i: number): void {
    const b = cr.people[i];
    if (!b.aboard || b.gone) return;
    const p = this.doorOf(cr.car, i);
    const at: V2 = this.wall(p[0], p[1]) ? [cr.car.x, cr.car.y] : p;
    b.x = at[0];
    b.y = at[1];
    b.yaw = cr.car.yaw;
    b.hidden = false;
    b.aboard = false;
    b.scale = 1;
    b.steps.length = 0;
    // Somebody ran off as the car came and is still in sight: the first officer out runs after them a stretch,
    // looks after them, and comes back to work. A runner nobody chases reads as a mistake.
    const runner = cr.police && !this.chased ? this.bodies.find((x) => x.kind === 'cast' && x.leaving && !x.gone && !x.hidden && x.gait === 'run') : null;
    if (runner) {
      this.chased = true;
      const there: V2 = [runner.x, runner.y];
      const d = Math.max(1, dist(at, there));
      const to = this.safe(lerp2(at, there, Math.min(1, 14 / d)));
      this.past(b, cr.car, to, 'run');
      b.steps.push(act('look', 1.5, there));
    }
    this.assign(b);
  }

  /** Send somebody of a crew to work: the first free post, or their part of the scene, or beside their car. */
  private assign(b: Body): void {
    const cr = b.crew;
    if (!cr) return;
    const car = cr.car;
    const hurry = this.cast.kind === 'threat' || this.cast.priority === 1 || (this.over && !this.played);
    const gait: Gait = hurry ? 'run' : 'walk';
    if (b.post) b.post.by = null;
    b.post = null;
    if (b.act !== 'idle') this.setAct(b, 'stand');
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
          this.past(b, car, this.beside(this.site.spot, cr.people.indexOf(b)), gait);
          b.steps.push(call(() => this.onContact()));
          this.route(b, this.inPoint, gait);
        } else {
          this.past(b, car, this.inPoint, gait);
          b.steps.push(call(() => this.onContact()));
        }
        b.steps.push({ k: 'door', out: false, t: 0, on: false });
        return;
      }
      this.past(b, car, post.at, gait);
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
    const down = this.bodies.find((x) => x.kind === 'cast' && !x.gone && !x.hidden && (x.act === 'lie' || x.act === 'sit' || x.act === 'fall'));
    if (cr.agency === 'kiirabi') {
      if (this.over && this.played) this.standBy(b);
      else if (down) {
        this.past(b, car, this.beside([down.x, down.y], idx + 4, 0.8), 'run');
        b.steps.push(act(this.cast.priority === 1 && idx === 0 ? 'cpr' : 'aid', 0, [down.x, down.y]));
      } else if (this.kind === 'indoor') {
        this.past(b, car, this.inPoint, gait);
        b.steps.push({ k: 'door', out: false, t: 0, on: false });
      } else {
        const v = this.bodies.find((x) => x.kind === 'cast' && x.role === 'victim' && !x.gone && !x.hidden);
        const m: V2 = v ? [v.x, v.y] : this.site.spot;
        this.past(b, car, this.beside(m, idx + 3, 1.3), 'walk');
        b.steps.push(act(v ? (idx ? 'notes' : 'talk') : 'look', 0, m));
      }
      return;
    }
    if (cr.agency === 'paaste' && this.smoke && !(this.over && this.played)) {
      // The hose line before the burning house.
      const src = this.smoke.at;
      const out = this.site.doorOut ?? ([-this.n[0], -this.n[1]] as V2);
      const p = this.safe([src[0] + out[0] * 7.5 - out[1] * (idx - 1) * 1.8, src[1] + out[1] * 7.5 + out[0] * (idx - 1) * 1.8]);
      this.past(b, car, p, 'run');
      b.steps.push(act('aim', 0, src));
      return;
    }
    this.standBy(b);
  }

  /** Stand by the car, on the pavement side. */
  private standBy(b: Body): void {
    const cr = b.crew;
    if (!cr) return;
    const car = cr.car;
    const i = cr.people.indexOf(b);
    const p = this.carPoint(car, 1.3 - 1.1 * i, this.kerbSide(car) * (car.size.width / 2 + 1.2));
    if (b.act !== 'idle') this.setAct(b, 'stand');
    this.past(b, car, this.wall(p[0], p[1]) ? this.doorOf(car, i) : p, 'walk');
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
    this.past(b, cr.car, this.doorOf(cr.car, i), cr.run || (this.cast.kind === 'threat' && !this.over) ? 'run' : 'walk');
    b.steps.push(
      call(() => {
        b.hidden = true;
        b.aboard = true;
      }),
    );
  }

  private board(cr: Crew): void {
    cr.state = 'boarding';
    cr.clock = 0;
    if (cr.police && !this.crews.some((x) => x !== cr && x.police && (x.state === 'here' || x.state === 'arriving'))) this.lastCrewLeaves(cr);
    for (const b of cr.people) if (!b.aboard && !b.duty) this.toCar(b);
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
    this.walkT -= dt;
    if (this.walkT <= 0) {
      this.walkT = this.amb.range(10, 40) * (this.night ? 3 : 1);
      if (!this.wet) {
        const n = this.serial++;
        const seed = hash32('x', this.cast.seed, n);
        // On the far side while there is trouble at the spot.
        const same = tense ? false : this.amb.chance(0.5);
        const line = (this.site.side === 1) === same ? this.site.walkLeft : this.site.walkRight;
        const way = this.amb.chance(0.5) ? line : line.slice().reverse();
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
