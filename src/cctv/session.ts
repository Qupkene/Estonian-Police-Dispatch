/**
 * One open camera (docs/CCTV.md section 14): the street, the site, the light, the cast and the director of one
 * incident's camera, stepped together with the game and handed to the view frame by frame with the texts burned
 * into the picture.
 *
 * Pure: no DOM and no three.js. The view comes in as an interface that render/view.ts CameraView satisfies, so the
 * tests drive a session over a real shift with a fake view.
 */
import { templateOf } from '@/sim/selectors';
import { ddmmyyyy, hhmm } from '@/sim/time';
import type { Incident, LngLat, SimState } from '@/sim/types';
import { castOf, type Cast } from './cast';
import { cameraOf, type CameraInfo } from './coverage';
import { Director } from './director';
import { envAt, type Env } from './env';
import { clamp, dist, frameAt, pointAlong, sub, yawOf } from './math';
import { makeStreet } from './procedural';
import type { Osd } from './render/view';
import { buildSite } from './site';
import { situationOf, streetScale } from './situation';
import type { Frame, Situation } from './stage';
import type { ParkedCar, Site, StreetData } from './types';
import { lookOfAgency, lookOfUnit, type CarLook } from './vehicle';

/** What a session needs of the picture: render/view.ts CameraView. */
export interface SessionView {
  setScene(site: Site, env: Env): void;
  /** The parked cars of the scene just set, if the view draws any. */
  readonly parked?: readonly ParkedCar[];
  setEnv(env: Env): void;
  render(frame: Frame, osd: Osd, zoom?: number, panX?: number, panY?: number): void;
  /** The vehicles on their way to the scene, told whenever the list changes (the view paints them ahead). */
  expect?(looks: readonly CarLook[]): void;
}

export type SessionState = 'live' | 'ended';

/** The light is read again at most this often (real seconds): at the fastest speed dusk falls in a few seconds. */
export const ENV_EVERY_S = 2;
/** A frame step longer than this many real seconds (a tab coming back, a slow device) is played as this long. */
const MAX_DT = 0.5;
/**
 * A step of the street is played in parts of at most this many of its own seconds, each with the situation as it
 * stands at its start (the etas shortened by what the step has played so far): at 8x a slow frame is 4 s of the
 * street, and the director times a car anew when its eta is off by more than a second and plays at most 2 s at once.
 */
const PART_S = 0.5;
/** Game seconds per real second assumed until the game has run once (the slowest co-op turn speed). */
const FIRST_SPEED = 15;
/**
 * Real seconds over which the game clock's own pace is measured. The game plays at most 250 ms of a slow frame, so on
 * a slow device its clock runs behind the nominal speed: the picture must follow the clock, not the nominal speed,
 * or the crew is out of the car on camera while the unit list still says en route.
 */
const PACE_WINDOW_S = 0.5;
/** The measured pace (game seconds per nominal game second) is kept within these, against a clock that jumps. */
const PACE_MIN = 0.05;
const PACE_MAX = 1.5;
/**
 * The situation as the director is to play it before the game clock's pace has been measured once: a unit or a
 * service about to arrive ('near') is held back as still on its way. Its eta is the street's seconds worked out from
 * the speed, and until the first window the speed is the nominal one: on a slow device the car would be planned to
 * arrive (and its crew to get out) well before the game says it is on scene. Half a second later it drives in on
 * the measured speed (at 8x that half second is 4 s of the street).
 */
function heldBack(sit: Situation): Situation {
  return {
    ...sit,
    units: sit.units.map((u) => (u.state === 'near' ? { ...u, state: 'coming', eta: 0 } : u)),
    agencies: sit.agencies.map((a) => (a.state === 'near' ? { ...a, state: 'coming', eta: 0 } : a)),
  };
}

/**
 * Real seconds of empty street shown once the incident is closed and its story has played out ('after'); then the
 * feed ends and the window lets its graphics go (a camera left open must not draw an empty street all shift).
 */
export const AFTER_HOLD_S = 15;

/**
 * The street a camera shows: the map's when it has one with a usable road, else a made-up one of the kind of place.
 * The street is the site's own: buildSite adds what stands before the place the incident names (place.ts).
 */
function siteFor(street: StreetData | null, incident: Incident, seed: number): Site {
  if (street) {
    const site = buildSite(street, seed);
    if (site) return site;
  }
  const { placeKind, placeName } = incident.location;
  const site = buildSite(makeStreet(placeKind, seed, placeName ?? null), seed);
  if (!site) throw new Error(`cctv: no site for a made-up ${placeKind} street`);
  return site;
}

/** Where a camera stands and looks, in the map's own coordinates (live.ts CameraHandle.pose has the fields' meaning). */
export interface MapPose {
  at: LngLat;
  spot: LngLat;
  bearing: number;
  fovH: number;
  reach: number;
}

/**
 * A site's camera on the map, or null when its street is not the map's (a made-up street lies nowhere). The street's
 * origin is where tiles.ts read it around, which is not always the incident's own point.
 */
export function mapPose(site: Site): MapPose | null {
  const origin = site.street.origin;
  if (site.street.source !== 'tiles' || !origin) return null;
  const frame = frameAt(origin);
  const { camera, drive, seen } = site;
  const look = sub(camera.target, camera.pos);
  const bearing = (((90 - (yawOf(look) * 180) / Math.PI) % 360) + 360) % 360;
  const fovH = (2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * (16 / 9)) * 180) / Math.PI;
  // As far as the picture holds the road, and past the spot at the least.
  let reach = Math.max(dist(camera.pos, camera.target) * 1.6, dist(camera.pos, site.spot) + 8);
  if (seen) for (const s of [seen.from, seen.to]) reach = Math.max(reach, dist(camera.pos, pointAlong(drive.pts, s).pt));
  return { at: frame.toLngLat(camera.pos), spot: frame.toLngLat(site.spot), bearing, fovH, reach: clamp(reach, 20, 90) };
}

export class CameraSession {
  readonly incidentId: string;
  readonly street: StreetData;
  readonly site: Site;
  readonly cast: Cast;
  private director: Director;
  private env: Env;
  private envAge = 0;
  private lastSpeed = FIRST_SPEED;
  /** Seconds of the street's own time per real second (streetScale): 1 up to the 1x speed. */
  private scaleNow = 1;
  /** The picture's own clock, real seconds (the Frame.t the view is given): set from the director's first frame. */
  private clock: number | null = null;
  /** The game clock's pace against the nominal speed (1: as fast), and the window it is being measured over. */
  private pace = 1;
  private paced = false;
  private paceGame = 0;
  private paceReal = 0;
  private paceSpeed = 0;
  private paceNow: number | null = null;
  /** The vehicles on their way, as last told to the view (see expect). */
  private comingKey = '';
  private last: Frame | null = null;
  private lastClock = '';
  private realT = 0;
  private status: SessionState = 'live';
  /** Did coverage.ts list the place when the camera opened (a session can be opened on any place in the tests)? */
  private listed: boolean;
  /** Real seconds played since the closed incident's story reached 'after'. */
  private afterT = 0;
  zoom = 1;
  panX = 0;
  panY = 0;

  constructor(
    private view: SessionView,
    sim: SimState,
    incident: Incident,
    readonly camera: CameraInfo,
    street: StreetData | null,
    private version: string,
    opts: { quiet?: boolean } = {},
  ) {
    this.incidentId = incident.id;
    this.listed = !!cameraOf(incident, sim.now);
    this.site = siteFor(street, incident, camera.seed);
    this.street = this.site.street;
    this.env = envAt(sim.now, incident.location.coord, sim.weather);
    this.cast = castOf(sim, incident, templateOf(sim, incident), { season: this.env.season, temp: sim.weather.tempC });
    // The street first: the director is told which parked cars the view has drawn.
    this.view.setScene(this.site, this.env);
    this.director = new Director(this.site, this.cast, {
      night: this.env.night >= 0.5,
      quiet: opts.quiet,
      wet: this.env.rain,
      parked: this.view.parked,
    });
  }

  /**
   * 'live' while there is something to watch; 'ended' for good once the incident has gone from the simulation, the
   * camera no longer covers it, or it was closed and the street has been empty for AFTER_HOLD_S real seconds.
   */
  get state(): SessionState {
    return this.status;
  }

  /** Where the story is ('open', 'seen', 'contact', 'closing', 'after'). */
  get phase(): string {
    return this.director.phase;
  }

  /** The light the picture is drawn in now. */
  get light(): Env {
    return this.env;
  }

  /** The last frame handed to the view (null before the first update). */
  get frame(): Frame | null {
    return this.last;
  }

  /** Game seconds per real second the game clock runs at: the nominal speed at the pace the game clock really keeps. */
  get speed(): number {
    return this.lastSpeed;
  }

  /**
   * Seconds of the street's own time one real second plays: 1 up to the game's 1x speed, then as many times faster as
   * the game runs (2, 4, 8), like a recording played faster. The picture's own life (the blue lights, rain, grain, the
   * recording dot) and the session's own timing (the light, the empty street at the end) stay in real seconds.
   */
  get scale(): number {
    return this.scaleNow;
  }

  /**
   * Settle the stage as the game stands, without drawing: the first frame, for the view to prepare its programs and
   * textures on before the picture goes live (live.ts). The next update goes on from it. Null once ended.
   */
  stage(sim: SimState): Frame | null {
    if (this.status === 'ended') return null;
    if (this.last) return this.last;
    const incident = sim.incidents[this.incidentId];
    if (!incident) return null;
    this.play(sim, incident, false, 0);
    this.last = this.framed();
    this.lastClock = `${ddmmyyyy(sim.now)} ${hhmm(sim.now)}`;
    return this.last;
  }

  /**
   * The speed the street plays at: `speed`, the game's nominal one, times the pace its clock was measured to keep over
   * the last windows of PACE_WINDOW_S real seconds (sim.now against the real time between camera frames). Nominal
   * until a first window is measured; the measuring starts again after a pause or a change of speed.
   */
  private follow(sim: SimState, speed: number, paused: boolean, dt: number): number {
    if (paused || !(speed > 0) || !Number.isFinite(speed)) {
      this.paceNow = null;
      return this.lastSpeed;
    }
    if (this.paceNow !== null && speed === this.paceSpeed && dt > 0 && dt <= 1 && sim.now >= this.paceNow) {
      this.paceGame += (sim.now - this.paceNow) / 1000;
      this.paceReal += dt;
      if (this.paceReal >= PACE_WINDOW_S) {
        const k = Math.min(PACE_MAX, Math.max(PACE_MIN, this.paceGame / (this.paceReal * speed)));
        this.pace = this.paced ? this.pace * 0.6 + k * 0.4 : k;
        this.paced = true;
        this.paceGame = 0;
        this.paceReal = 0;
      }
    } else {
      this.paceGame = 0;
      this.paceReal = 0;
    }
    this.paceNow = sim.now;
    this.paceSpeed = speed;
    return speed * this.pace;
  }

  /**
   * Follow the game for `dt` real seconds and draw. `speed` is game seconds per real second at the game's current
   * nominal speed (see follow); while `paused` nothing on the street moves (the picture is drawn again as it stands,
   * for a zoom).
   */
  update(sim: SimState, speed: number, paused: boolean, dt: number): void {
    if (this.status === 'ended') return;
    const incident = sim.incidents[this.incidentId];
    // A closed incident nobody went to is off the camera's list after a while (coverage.ts): its feed ends too.
    if (!incident || (this.listed && incident.state === 'closed' && !cameraOf(incident, sim.now))) {
      this.status = 'ended';
      return;
    }
    const step = paused ? 0 : Math.min(MAX_DT, Math.max(0, dt));
    this.lastSpeed = this.follow(sim, speed, paused, dt);
    // A pause keeps the scale it stood at; a new speed counts from this frame on.
    if (!paused) this.scaleNow = streetScale(speed, this.lastSpeed);
    // The first update settles the stage as the game stands, also when the camera is opened in a paused game.
    const first = !this.last;
    this.play(sim, incident, paused && !first, step * this.scaleNow);
    this.realT += step;
    if (this.clock !== null) this.clock += step;
    this.envAge += step;
    if (this.envAge >= ENV_EVERY_S) {
      this.envAge = 0;
      this.env = envAt(sim.now, incident.location.coord, sim.weather);
      this.view.setEnv(this.env);
    }
    this.last = this.framed();
    this.lastClock = `${ddmmyyyy(sim.now)} ${hhmm(sim.now)}`;
    this.draw();
    if (incident.state === 'closed' && this.director.phase === 'after') {
      this.afterT += step;
      if (this.afterT >= AFTER_HOLD_S) this.status = 'ended';
    }
  }

  /**
   * Step the director by `step` seconds of the street's own time as the game stands, in parts of at most PART_S, and
   * tell the view which vehicles are on their way. The etas are in the street's seconds: game seconds over the speed
   * divided by the scale (15 game seconds a second from 1x up), so a car stops when the game says it is on scene at
   * every speed.
   */
  private play(sim: SimState, incident: Incident, paused: boolean, step: number) {
    const rate = this.lastSpeed / this.scaleNow;
    let sit: Situation;
    let played = 0;
    do {
      const part = Math.min(PART_S, step - played);
      sit = situationOf(sim, incident, rate, paused, played);
      this.director.update(this.paced ? sit : heldBack(sit), part);
      played += part;
    } while (step - played > 1e-9);
    if (!this.view.expect) return;
    const looks: CarLook[] = [];
    for (const u of sit.units) if (u.state === 'coming' || u.state === 'near') looks.push(lookOfUnit(u.type, u.model));
    for (const a of sit.agencies) {
      const look = a.state === 'coming' || a.state === 'near' ? lookOfAgency(a.agency) : null;
      if (look) looks.push(look);
    }
    const key = JSON.stringify(looks);
    if (key === this.comingKey) return;
    this.comingKey = key;
    if (looks.length) this.view.expect(looks);
  }

  /**
   * The director's frame with the picture's own clock: the view flashes the blue lights, blinks the hazards, moves
   * the rain and the grain by Frame.t, and those keep their real pace at every speed. The clock starts where the
   * director's stood when the stage was settled and runs on in real seconds.
   */
  private framed(): Frame {
    const f = this.director.frame();
    this.clock ??= f.t;
    return { ...f, t: this.clock };
  }

  /** Draw the last frame again (a zoom or a pan while the game stands). */
  draw(): void {
    if (!this.last || this.status === 'ended') return;
    this.view.render(this.last, this.osd(), this.zoom, this.panX, this.panY);
  }

  /** The texts burned into the picture. */
  osd(): Osd {
    return {
      name: this.camera.name,
      clock: this.lastClock,
      note: '',
      mark: `EPD v${this.version}`,
      // The recording dot blinks once a second of the camera's own clock (it stands while the game is paused).
      rec: Math.floor(this.realT) % 2 === 0,
    };
  }
}
