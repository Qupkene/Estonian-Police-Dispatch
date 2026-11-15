/**
 * Kaamerad on the map (docs/CCTV.md section 14): while a surveillance camera's window is open and live, the map draws
 * where the camera hangs, which way it looks and how far (a view cone), and the spot the picture is about, so that
 * the player can lay the picture on the map. The camera window (src/ui/game/CameraWindow.tsx) tells this module what
 * it shows; the map's controller reads it with its other overlays and draws the source SRC.camera (style.ts).
 *
 * The window and the map meet here rather than through MapView's props: the camera's window and the map are siblings
 * in the game screen, and the camera belongs to one shift's map only (`sim` below), never to a replay's or a menu's.
 *
 * Everything but `shownIncidentCoord` is pure and testable in node.
 */
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { Incident, LngLat, SimState } from '@/sim/types';
import { mapBase, roadDisplay, roadService, type RoadDisplay } from './roads';

/** Where the camera stands and looks (CameraHandle.pose in src/cctv/live.ts). */
export interface CameraPose {
  /** Where the camera hangs. */
  at: LngLat;
  /** Where the scene happens. */
  spot: LngLat;
  /** Degrees clockwise from north that the camera looks along. */
  bearing: number;
  /** The picture's horizontal field of view in degrees at zoom 1. */
  fovH: number;
  /** Metres the view cone is worth drawing to. */
  reach: number;
}

/** A box on the screen (px from the map container's top left corner). */
export interface ScreenBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the open camera window shows the map. */
export interface CameraConeView {
  /** The shift the camera belongs to: only that shift's map draws it. */
  sim: SimState;
  /** Where the map draws the incident's marker (the camera was opened there). */
  marker: LngLat;
  /** Where the camera looks, once its picture is live; null while it connects, after it ended or failed. */
  pose: CameraPose | null;
  /** The window's zoom (1..4) and horizontal pan (see coneEdges). */
  zoom: number;
  panX: number;
  /** False while the window is folded to its title bar: nothing is drawn. */
  shown: boolean;
  /** A new number asks the map to bring the marker and the cone into view (see revealPlan). */
  reveal: number;
  /** The window's box over the map, if it covers some of it, in px from the map container's top left corner. */
  cover: (map: HTMLElement) => ScreenBox | null;
}

let current: CameraConeView | null = null;
let reveals = 0;

/** A reveal number never used before on this page (CameraConeView.reveal): a new window's first one is new too. */
export const nextReveal = (): number => ++reveals;

/** The window says what it shows (null: it closed). Each call is a new object: the map compares by identity. */
export function showCameraCone(view: CameraConeView | null): void {
  current = view;
}

/** What the open camera window shows, or null. */
export function cameraCone(): CameraConeView | null {
  return current;
}

/**
 * Where the map draws an incident's marker: on its building or road once the map's road data knows (roads.ts
 * incidentCoord), else, and while that is still being looked up, the incident's own coordinates.
 */
export function markerCoord(display: Pick<RoadDisplay, 'incidentCoord'> | null, inc: Incident, now: number): LngLat {
  const own = inc.location.coord;
  if (!display) return own;
  try {
    const c = display.incidentCoord(inc, now);
    return c && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? c : own;
  } catch {
    return own;
  }
}

/** Where the game's map draws an incident's marker now (the camera window opens the camera there). */
export function shownIncidentCoord(sim: SimState, inc: Incident): LngLat {
  let display: RoadDisplay | null = null;
  try {
    display = roadDisplay(sim, roadService(mapBase()));
  } catch {
    display = null;
  }
  return markerCoord(display, inc, performance.now());
}

const DEG = Math.PI / 180;
/** The earth's mean radius (m). */
const R = 6371008.8;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** The point `m` metres from `p` towards `bearing` (degrees clockwise from north); exact enough for a street. */
export function offsetM(p: LngLat, bearing: number, m: number): LngLat {
  const b = bearing * DEG;
  return [p[0] + (m * Math.sin(b)) / (R * Math.cos(p[1] * DEG)) / DEG, p[1] + (m * Math.cos(b)) / R / DEG];
}

/**
 * The bearings (degrees clockwise from north, left edge first) of the picture's left and right edges at the
 * window's zoom and pan. The picture's lens (src/cctv/render/post.ts) shows the frame's horizontal part
 * (u - 0.5) / zoom + 0.5 + panX, u from 0 to 1, with panX within (1 - 1 / zoom) / 2 either way; a point of the frame
 * at x (-1 at its left edge, 1 at its right) lies atan(x tan(fovH / 2)) to the right of the camera's bearing.
 */
export function coneEdges(pose: Pick<CameraPose, 'bearing' | 'fovH'>, zoom = 1, panX = 0): [number, number] {
  const z = clamp(Number.isFinite(zoom) ? zoom : 1, 1, 4);
  const room = (1 - 1 / z) / 2;
  const p = clamp(Number.isFinite(panX) ? panX : 0, -room, room);
  const t = Math.tan(clamp(pose.fovH, 1, 170) * DEG * 0.5);
  return [pose.bearing + Math.atan((2 * p - 1 / z) * t) / DEG, pose.bearing + Math.atan((2 * p + 1 / z) * t) / DEG];
}

/** The cone's bands from the camera out (fractions of the reach) and how strongly each is filled (0..1). */
export const CONE_BANDS: readonly { from: number; to: number; o: number }[] = [
  { from: 0, to: 0.45, o: 1 },
  { from: 0.45, to: 0.75, o: 0.62 },
  { from: 0.75, to: 1, o: 0.3 },
];
/** The arc's step (degrees): smooth at any size the map shows a street at. */
const ARC_STEP = 3;

/** Bearings from `a` to `b` in about ARC_STEP steps, both ends included. */
function arc(a: number, b: number): number[] {
  const n = Math.max(1, Math.ceil(Math.abs(b - a) / ARC_STEP));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

/**
 * The camera on the map, as GeoJSON for the source SRC.camera: the view cone in bands that fade outwards (`kind`
 * 'band', `o` how strong), its outline ('edge'), the camera ('at') and the spot ('spot').
 */
export function buildCameraCone(pose: CameraPose, zoom = 1, panX = 0): FeatureCollection {
  const [left, right] = coneEdges(pose, zoom, panX);
  const reach = clamp(pose.reach, 5, 500);
  const bearings = arc(left, right);
  const ring = (r: number) => bearings.map((b) => offsetM(pose.at, b, r));
  const features: Feature[] = CONE_BANDS.map((band): Feature<Polygon> => {
    const outer = ring(band.to * reach);
    const inner = band.from > 0 ? ring(band.from * reach).reverse() : [pose.at];
    return { type: 'Feature', properties: { kind: 'band', o: band.o }, geometry: { type: 'Polygon', coordinates: [[...outer, ...inner, outer[0]]] } };
  });
  features.push({ type: 'Feature', properties: { kind: 'edge' }, geometry: { type: 'LineString', coordinates: [pose.at, ...ring(reach), pose.at] } });
  features.push({ type: 'Feature', properties: { kind: 'spot' }, geometry: { type: 'Point', coordinates: pose.spot } });
  features.push({ type: 'Feature', properties: { kind: 'at' }, geometry: { type: 'Point', coordinates: pose.at } });
  return { type: 'FeatureCollection', features };
}

/** What has to show when the map brings the camera into view: the cone's corners, the spot and the marker. */
export function revealPoints(view: Pick<CameraConeView, 'marker' | 'pose' | 'zoom' | 'panX'>): LngLat[] {
  const pts: LngLat[] = [view.marker];
  const pose = view.pose;
  if (!pose) return pts;
  const [left, right] = coneEdges(pose, view.zoom, view.panX);
  const reach = clamp(pose.reach, 5, 500);
  pts.push(pose.at, pose.spot, ...arc(left, right).filter((_, i, a) => i === 0 || i === a.length - 1 || i % 4 === 0).map((b) => offsetM(pose.at, b, reach)));
  return pts;
}

/** Below this many px from the camera to the cone's far edge, the cone is too small to lay a picture on. */
export const CONE_MIN_PX = 140;
/** The map never comes closer than this to show the camera (its street map's last useful zoom). */
export const REVEAL_MAX_ZOOM = 18;
/** Room kept between what is brought into view and the edges of the free part of the map (px). */
const REVEAL_PAD = 28;

/** Metres per screen px at `zoom` and latitude `lat` (Web Mercator, the map's 512 px tiles). */
export const metresPerPx = (zoom: number, lat: number) => (40075016.686 * Math.cos(lat * DEG)) / (512 * 2 ** zoom);

/** Web Mercator at zoom 0 with 512 px tiles: px from the world's top left corner. */
function merc(p: LngLat): [number, number] {
  const lat = clamp(p[1], -85, 85) * DEG;
  return [((p[0] + 180) / 360) * 512, ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * 512];
}
function unmerc(x: number, y: number): LngLat {
  const n = Math.PI - (2 * Math.PI * y) / 512;
  return [(x / 512) * 360 - 180, (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))];
}

/**
 * The part of the map the camera window leaves free (px from the map container's top left corner): the largest strip
 * beside the window (on a phone, where it docks at the top of the map, the part below it), or the whole map.
 */
export function freeBox(width: number, height: number, cover: ScreenBox | null): ScreenBox {
  const all = { x: 0, y: 0, w: width, h: height };
  if (!cover) return all;
  const l = clamp(cover.x, 0, width);
  const r = clamp(cover.x + cover.w, 0, width);
  const t = clamp(cover.y, 0, height);
  const b = clamp(cover.y + cover.h, 0, height);
  if (r <= l || b <= t) return all;
  const strips: ScreenBox[] = [
    { x: 0, y: 0, w: l, h: height },
    { x: r, y: 0, w: width - r, h: height },
    { x: 0, y: 0, w: width, h: t },
    { x: 0, y: b, w: width, h: height - b },
  ];
  return strips.reduce((a, s) => (s.w * s.h > a.w * a.h ? s : a));
}

export interface RevealInput {
  /** What has to show (revealPoints). */
  points: LngLat[];
  /** Where those points are on the screen now (map.project), in the same order. */
  shown: [number, number][];
  /** The cone's reach (m), which must look at least CONE_MIN_PX long; null when there is no cone yet. */
  reach: number | null;
  /** The map's zoom now and its container's size (px). */
  zoom: number;
  width: number;
  height: number;
  /** The part of the map the window leaves free (freeBox). */
  free: ScreenBox;
}

/** Where to ease the map to: `center` lands `offset` px from the container's middle (maplibre easeTo). */
export interface RevealMove {
  center: LngLat;
  zoom: number;
  offset: [number, number];
}

/**
 * Whether and where the map moves to show the camera: not at all while the points are already in the free part of
 * the map and the cone is big enough to see; else to the least change of zoom that makes the cone big enough and
 * fits it all, with the points in the middle of the free part.
 */
export function revealPlan(i: RevealInput): RevealMove | null {
  if (!i.points.length || i.free.w < 8 || i.free.h < 8) return null;
  const pad = Math.min(REVEAL_PAD, i.free.w * 0.12, i.free.h * 0.12);
  const inner = { x: i.free.x + pad, y: i.free.y + pad, w: i.free.w - 2 * pad, h: i.free.h - 2 * pad };
  const lat = i.points.reduce((s, p) => s + p[1], 0) / i.points.length;
  const inView = i.shown.length === i.points.length && i.shown.every(([x, y]) => x >= inner.x && x <= inner.x + inner.w && y >= inner.y && y <= inner.y + inner.h);
  const big = i.reach === null || i.reach / metresPerPx(i.zoom, lat) >= CONE_MIN_PX;
  if (inView && big) return null;
  const m = i.points.map(merc);
  const xs = m.map((p) => p[0]);
  const ys = m.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // The zoom at which the points just fit the free part, and the one at which the cone is just big enough.
  const fit = Math.log2(Math.min(x1 > x0 ? inner.w / (x1 - x0) : Infinity, y1 > y0 ? inner.h / (y1 - y0) : Infinity));
  const need = i.reach === null ? -Infinity : Math.log2((CONE_MIN_PX * 40075016.686 * Math.cos(lat * DEG)) / (512 * i.reach));
  const zoom = Math.min(Math.max(i.zoom, need), fit, REVEAL_MAX_ZOOM);
  return {
    center: unmerc((x0 + x1) / 2, (y0 + y1) / 2),
    zoom,
    offset: [i.free.x + i.free.w / 2 - i.width / 2, i.free.y + i.free.h / 2 - i.height / 2],
  };
}
