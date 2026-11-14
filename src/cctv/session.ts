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
import type { Incident, SimState } from '@/sim/types';
import { castOf, type Cast } from './cast';
import { cameraOf, type CameraInfo } from './coverage';
import { Director } from './director';
import { envAt, type Env } from './env';
import { makeStreet } from './procedural';
import type { Osd } from './render/view';
import { buildSite } from './site';
import { situationOf } from './situation';
import type { Frame } from './stage';
import type { ParkedCar, Site, StreetData } from './types';

/** What a session needs of the picture: render/view.ts CameraView. */
export interface SessionView {
  setScene(site: Site, env: Env): void;
  /** The parked cars of the scene just set, if the view draws any. */
  readonly parked?: readonly ParkedCar[];
  setEnv(env: Env): void;
  render(frame: Frame, osd: Osd, zoom?: number, panX?: number, panY?: number): void;
}

export type SessionState = 'live' | 'ended';

/** The light is read again at most this often (real seconds): at the fastest speed dusk falls in a few seconds. */
export const ENV_EVERY_S = 2;
/** A frame step longer than this (a tab coming back, a slow device) is played as this long. */
const MAX_DT = 0.5;
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
 * Real seconds of empty street shown once the incident is closed and its story has played out ('after'); then the
 * feed ends and the window lets its graphics go (a camera left open must not draw an empty street all shift).
 */
export const AFTER_HOLD_S = 15;

/** The street a camera shows: the map's when it has one with a usable road, else a made-up one of the kind of place. */
function siteFor(street: StreetData | null, incident: Incident, seed: number): { street: StreetData; site: Site } {
  if (street) {
    const site = buildSite(street, seed);
    if (site) return { street, site };
  }
  const made = makeStreet(incident.location.placeKind, seed);
  const site = buildSite(made, seed);
  if (!site) throw new Error(`cctv: no site for a made-up ${incident.location.placeKind} street`);
  return { street: made, site };
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
  /** The game clock's pace against the nominal speed (1: as fast), and the window it is being measured over. */
  private pace = 1;
  private paced = false;
  private paceGame = 0;
  private paceReal = 0;
  private paceSpeed = 0;
  private paceNow: number | null = null;
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
    const built = siteFor(street, incident, camera.seed);
    this.street = built.street;
    this.site = built.site;
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

  /** Game seconds per real second the street is played at: the nominal speed at the pace the game clock really keeps. */
  get speed(): number {
    return this.lastSpeed;
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
    this.director.update(situationOf(sim, incident, this.lastSpeed, false), 0);
    this.last = this.director.frame();
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
    // The first update settles the stage as the game stands, also when the camera is opened in a paused game.
    const first = !this.last;
    this.director.update(situationOf(sim, incident, this.lastSpeed, paused && !first), step);
    this.realT += step;
    this.envAge += step;
    if (this.envAge >= ENV_EVERY_S) {
      this.envAge = 0;
      this.env = envAt(sim.now, incident.location.coord, sim.weather);
      this.view.setEnv(this.env);
    }
    this.last = this.director.frame();
    this.lastClock = `${ddmmyyyy(sim.now)} ${hhmm(sim.now)}`;
    this.draw();
    if (incident.state === 'closed' && this.director.phase === 'after') {
      this.afterT += step;
      if (this.afterT >= AFTER_HOLD_S) this.status = 'ended';
    }
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
