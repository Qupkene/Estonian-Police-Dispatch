/**
 * The camera chunk's entry (docs/CCTV.md section 14). src/ui/game/CameraWindow.tsx loads this module with import()
 * the first time a camera is opened, and with it everything heavy: three.js, the renderer, the body model, the
 * director, the cast and the tile reader. Nothing of the game's own bundle imports it statically
 * (tests/cctv-lazy.test.ts).
 *
 * `openCamera` checks that the browser can draw, loads the body model and the street around the incident (the map's
 * own street file when it is there, a made-up street of the kind of place when not), creates the view on the
 * window's canvas, starts a session and has the view prepare the first frame (its textures uploaded, its programs
 * compiled in parallel while the game runs on), so that 'live' means the first picture can be drawn at once. The
 * handle it returns is all the window needs. The window gives the open a deadline through `signal`: whatever is
 * still loading then is let go.
 */
import { streetTilesUrl } from '@/map/streetStyle';
import { knownStreetProbe, openedStreetArchive } from '@/map/streetTiles';
import type { Incident, LngLat, SimState } from '@/sim/types';
import { PMTiles } from 'pmtiles';
import type { Material, Mesh, Texture } from 'three';
import type { CameraInfo } from './coverage';
import { loadHumanBase, type HumanBase } from './render/human';
import { CameraView, canRender } from './render/view';
import { CameraSession, mapPose, type SessionState } from './session';
import { readStreet, type TileArchive } from './tiles';
import type { StreetData } from './types';

/** What the window holds of an open camera. */
export interface CameraHandle {
  /** Follow the game for `dt` real seconds and draw (see session.ts). */
  update(sim: SimState, speed: number, paused: boolean, dt: number): void;
  /** Zoom 1..4 and the pan (each -1..1 of what the zoom allows); draws again at once. */
  view(zoom: number, panX: number, panY: number): void;
  readonly state: SessionState;
  readonly phase: string;
  /** The browser took the graphics context away: the picture cannot be drawn any more. */
  readonly dead: boolean;
  /** Where the street came from ('tiles' or 'made'), for the tests. */
  readonly source: StreetData['source'];
  /** How many people and vehicles the last frame held (the window shows them to the tests). */
  readonly people: number;
  readonly cars: number;
  /**
   * Where the camera stands and looks, for the map: `at` where it hangs, `spot` where it happens, `bearing` the
   * degrees clockwise from north that it looks along, `fovH` the picture's horizontal field of view in degrees at
   * zoom 1, `reach` the metres the view cone is worth drawing to. Null when it cannot be told.
   */
  readonly pose: { at: LngLat; spot: LngLat; bearing: number; fovH: number; reach: number } | null;
  dispose(): void;
}

export interface OpenOptions {
  sim: SimState;
  incident: Incident;
  camera: CameraInfo;
  version: string;
  /** Aborted when the window closes while the camera is still connecting. */
  signal: AbortSignal;
  /**
   * When the window began to open the camera (performance.now(), the start of its deadline): the opening's budget
   * is counted from then, the camera chunk's download included. Without it, from the first request of this chunk
   * when this is the page's first opening, else from the call.
   */
  startedAt?: number;
  /**
   * Where the map draws the incident's marker (it moves the marker onto a building or a road): the street is read
   * around it. Without it, around the incident's own coordinates.
   */
  origin?: LngLat;
}

/** The street around the incident takes at most this long to read; then the made-up street is used. */
const STREET_TIMEOUT_MS = 6000;
/**
 * How long an opening may take in all, counted from the window's start (OpenOptions.startedAt), before it goes live
 * with whatever is not ready yet. What is not ready is finished in the first frame, which then holds the whole page
 * for seconds on a slow device: so the budget is as long as the window's own deadline allows (CameraWindow's
 * CONNECT_DEADLINE_MS, 60 s, less a wide margin). A fast device never comes near it; a slow one waits a little longer
 * for the picture and the game goes on meanwhile. Every step of the opening checks the budget before it starts and is
 * one short task, so 'live' comes at most a task after it.
 */
const OPEN_BUDGET_MS = 30000;
/** What the view's own preparing gets at the least, however long the loading took (a frame then compiles less). */
const PREPARE_MIN_MS = 1500;

/** Has this page opened a camera before (the chunk was downloaded for an earlier one)? */
let openedBefore = false;

/**
 * When this opening began: the window's own start if it says, else, on the page's first opening, when the browser
 * first asked for this chunk (the window imports it on the click), else now.
 */
function startOf(o: OpenOptions): number {
  const now = performance.now();
  if (o.startedAt !== undefined && o.startedAt <= now) return o.startedAt;
  if (openedBefore) return now;
  openedBefore = true;
  try {
    const own = performance.getEntriesByName(import.meta.url)[0];
    if (own && own.startTime <= now && now - own.startTime < OPEN_BUDGET_MS) return own.startTime;
  } catch {
    /* no resource timing: counted from now */
  }
  return now;
}

/** The map's street file, opened once per page; the map's own archive when it has already opened it. */
let ownArchive: { url: string; archive: PMTiles } | null = null;

function streetArchive(): TileArchive | null {
  let base = import.meta.env.BASE_URL || '/';
  try {
    base = new URL(base, window.location.href).href;
  } catch {
    /* a relative base works as it is */
  }
  const url = streetTilesUrl(base);
  const shared = openedStreetArchive(url);
  if (shared) return shared;
  // The map found no street file here (the tactical map is shown): do not ask the server again.
  const probe = knownStreetProbe(url);
  if (probe === 'missing') return null;
  if (ownArchive?.url !== url) ownArchive = { url, archive: new PMTiles(url) };
  return ownArchive.archive;
}

/**
 * The street of the incident's place: read around where the map draws its marker, for its kind of place and its name
 * (tiles.ts readStreet finds the place's own point and front from there).
 */
async function streetOf(incident: Incident, origin: LngLat | undefined, signal: AbortSignal): Promise<StreetData | null> {
  const archive = streetArchive();
  if (!archive) return null;
  const { coord, placeKind, placeName } = incident.location;
  return readStreet(archive, origin ?? coord, { signal, timeoutMs: STREET_TIMEOUT_MS, place: { kind: placeKind, name: placeName ?? null } });
}

const aborted = () => new DOMException('The camera was closed', 'AbortError');

/** `p`, or a rejection as soon as `signal` is aborted (a stalled download must not hold the window). */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(aborted());
    signal.addEventListener('abort', stop, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', stop);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', stop);
        reject(e);
      },
    );
  });
}

/** Whether this browser can draw the camera, asked once per page (every probe is a graphics context of its own). */
let drawable: boolean | null = null;

/**
 * Let go of what every view shares and keeps between cameras: the base body, which human.ts loads once per page.
 * Each renderer hangs a listener on whatever it uploads, so an object that is never disposed would keep every
 * closed camera's renderer and graphics context alive. The objects stay usable: the next view uploads them again.
 * (Everything else a view draws with, the vehicles' materials and paintings among it, is its own and goes with
 * CameraView.dispose; what render/cars.ts keeps between views is plain canvases and numbers.)
 */
function releaseShared(humans: HumanBase) {
  humans.template.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of ([] as Material[]).concat(mesh.material)) {
      for (const v of Object.values(m)) if ((v as Texture | null)?.isTexture) (v as Texture).dispose();
      m.dispose();
    }
  });
}

/**
 * Open a camera on `canvas`. Resolves to null when this browser cannot draw it (no WebGL 2); rejects when loading
 * failed or `signal` was aborted (then nothing is left behind).
 */
export async function openCamera(canvas: HTMLCanvasElement, o: OpenOptions): Promise<CameraHandle | null> {
  const started = startOf(o);
  drawable ??= canRender();
  if (!drawable) return null;
  const [humans, street] = await Promise.all([untilAborted(loadHumanBase(), o.signal), streetOf(o.incident, o.origin, o.signal)]);
  if (o.signal.aborted) throw aborted();
  const view = new CameraView(canvas);
  let session: CameraSession;
  try {
    view.setHumans(humans);
    // The incident may have moved on while the street loaded: build from the game as it is now.
    const inc = o.sim.incidents[o.incident.id] ?? o.incident;
    session = new CameraSession(view, o.sim, inc, o.camera, street, o.version);
    await view.prepare(session.stage(o.sim), session.osd(), o.signal, Math.max(PREPARE_MIN_MS, OPEN_BUDGET_MS - (performance.now() - started)));
    if (o.signal.aborted) throw aborted();
  } catch (e) {
    view.dispose();
    releaseShared(humans);
    throw e;
  }
  let disposed = false;
  return {
    update: (sim, speed, paused, dt) => {
      if (!disposed) session.update(sim, speed, paused, dt);
    },
    view: (zoom, panX, panY) => {
      session.zoom = zoom;
      session.panX = panX;
      session.panY = panY;
      if (!disposed) session.draw();
    },
    get state() {
      return session.state;
    },
    get phase() {
      return session.phase;
    },
    get dead() {
      return view.dead;
    },
    source: session.street.source,
    get people() {
      return session.frame?.people.length ?? 0;
    },
    get cars() {
      return session.frame?.cars.length ?? 0;
    },
    pose: mapPose(session.site),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      view.dispose();
      releaseShared(humans);
    },
  };
}
