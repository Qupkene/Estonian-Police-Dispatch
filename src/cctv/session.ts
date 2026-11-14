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
import type { CameraInfo } from './coverage';
import { Director } from './director';
import { envAt, type Env } from './env';
import { makeStreet } from './procedural';
import type { Osd } from './render/view';
import { buildSite } from './site';
import { situationOf } from './situation';
import type { Frame } from './stage';
import type { Site, StreetData } from './types';

/** What a session needs of the picture: render/view.ts CameraView. */
export interface SessionView {
  setScene(site: Site, env: Env): void;
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
  private last: Frame | null = null;
  private lastClock = '';
  private realT = 0;
  private status: SessionState = 'live';
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
    const built = siteFor(street, incident, camera.seed);
    this.street = built.street;
    this.site = built.site;
    this.env = envAt(sim.now, incident.location.coord, sim.weather);
    this.cast = castOf(sim, incident, templateOf(sim, incident), { season: this.env.season, temp: sim.weather.tempC });
    this.director = new Director(this.site, this.cast, { night: this.env.night >= 0.5, quiet: opts.quiet, wet: this.env.rain });
    this.view.setScene(this.site, this.env);
  }

  /** 'live' while the incident is in the simulation; 'ended' for good once it has gone. */
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

  /**
   * Follow the game for `dt` real seconds and draw. `speed` is game seconds per real second at the game's current
   * speed; while `paused` nothing on the street moves (the picture is drawn again as it stands, for a zoom).
   */
  update(sim: SimState, speed: number, paused: boolean, dt: number): void {
    if (this.status === 'ended') return;
    const incident = sim.incidents[this.incidentId];
    if (!incident) {
      this.status = 'ended';
      return;
    }
    const step = paused ? 0 : Math.min(MAX_DT, Math.max(0, dt));
    if (!paused && speed > 0 && Number.isFinite(speed)) this.lastSpeed = speed;
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
