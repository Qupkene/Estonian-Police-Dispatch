/**
 * The camera chunk's entry (docs/CCTV.md section 14). src/ui/game/CameraWindow.tsx loads this module with import()
 * the first time a camera is opened, and with it everything heavy: three.js, the renderer, the body model, the
 * director, the cast and the tile reader. Nothing of the game's own bundle imports it statically
 * (tests/cctv-lazy.test.ts).
 *
 * `openCamera` checks that the browser can draw, loads the body model and the street around the incident (the map's
 * own street file when it is there, a made-up street of the kind of place when not), creates the view on the
 * window's canvas and starts a session. The handle it returns is all the window needs. The window gives the open
 * a deadline through `signal`: whatever is still loading then is let go.
 */
import { streetTilesUrl } from '@/map/streetStyle';
import { knownStreetProbe, openedStreetArchive } from '@/map/streetTiles';
import type { Incident, SimState } from '@/sim/types';
import { PMTiles } from 'pmtiles';
import type { Material, Mesh, Texture } from 'three';
import type { CameraInfo } from './coverage';
import { carMaterials } from './render/cars';
import { loadHumanBase, type HumanBase } from './render/human';
import { CameraView, canRender } from './render/view';
import { CameraSession, type SessionState } from './session';
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
  /** Where the street came from ('tiles' or 'procedural'), for the tests. */
  readonly source: StreetData['source'];
  /** How many people and vehicles the last frame held (the window shows them to the tests). */
  readonly people: number;
  readonly cars: number;
  dispose(): void;
}

export interface OpenOptions {
  sim: SimState;
  incident: Incident;
  camera: CameraInfo;
  version: string;
  /** Aborted when the window closes while the camera is still connecting. */
  signal: AbortSignal;
}

/** The street around the incident takes at most this long to read; then the made-up street is used. */
const STREET_TIMEOUT_MS = 6000;

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

async function streetOf(incident: Incident, signal: AbortSignal): Promise<StreetData | null> {
  const archive = streetArchive();
  if (!archive) return null;
  return readStreet(archive, incident.location.coord, { signal, timeoutMs: STREET_TIMEOUT_MS });
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
 * Let go of what every view shares and keeps between cameras (the cars' paint and glass, the base body). Each
 * renderer hangs a listener on whatever it uploads, so an object that is never disposed would keep every closed
 * camera's renderer alive. The objects stay usable: the next view uploads them again.
 */
function releaseShared(humans: HumanBase) {
  const { paint, glass } = carMaterials();
  paint.dispose();
  glass.dispose();
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
  drawable ??= canRender();
  if (!drawable) return null;
  const [humans, street] = await Promise.all([untilAborted(loadHumanBase(), o.signal), streetOf(o.incident, o.signal)]);
  if (o.signal.aborted) throw aborted();
  const view = new CameraView(canvas);
  let session: CameraSession;
  try {
    view.setHumans(humans);
    // The incident may have moved on while the street loaded: build from the game as it is now.
    const inc = o.sim.incidents[o.incident.id] ?? o.incident;
    session = new CameraSession(view, o.sim, inc, o.camera, street, o.version);
  } catch (e) {
    view.dispose();
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
    dispose: () => {
      if (disposed) return;
      disposed = true;
      view.dispose();
      releaseShared(humans);
    },
  };
}
