/**
 * The camera chunk's entry (docs/CCTV.md section 14). src/ui/game/CameraWindow.tsx loads this module with import()
 * the first time a camera is opened, and with it everything heavy: three.js, the renderer, the body model, the
 * director, the cast and the tile reader. Nothing of the game's own bundle imports it statically
 * (tests/cctv-lazy.test.ts).
 *
 * `openCamera` checks that the browser can draw, loads the body model and the street around the incident (the map's
 * own street file when it is there, a made-up street of the kind of place when not), creates the view on the
 * window's canvas and starts a session. The handle it returns is all the window needs.
 */
import { streetTilesUrl } from '@/map/streetStyle';
import { knownStreetProbe, openedStreetArchive } from '@/map/streetTiles';
import type { Incident, SimState } from '@/sim/types';
import { PMTiles } from 'pmtiles';
import type { CameraInfo } from './coverage';
import { loadHumanBase } from './render/human';
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

/**
 * Open a camera on `canvas`. Resolves to null when this browser cannot draw it (no WebGL 2); rejects when loading
 * failed or `signal` was aborted (then nothing is left behind).
 */
export async function openCamera(canvas: HTMLCanvasElement, o: OpenOptions): Promise<CameraHandle | null> {
  if (!canRender()) return null;
  const [humans, street] = await Promise.all([loadHumanBase(), streetOf(o.incident, o.signal)]);
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
    dispose: () => {
      if (disposed) return;
      disposed = true;
      view.dispose();
    },
  };
}
