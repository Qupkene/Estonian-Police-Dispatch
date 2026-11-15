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
  /** The incident whose camera it is. */
  incidentId: string;
  /** Where the map draws the incident's marker (the camera was opened there). */
  marker: LngLat;
  /** The camera's place name as the window's title shows it ("Tamoil", "Narva mnt"); '' for none. */
  place: string;
  /** Where the camera looks, once its picture is live; null while it connects, after it ended or failed. */
  pose: CameraPose | null;
  /** The window's zoom (1..4) and horizontal pan (see coneEdges). */
  zoom: number;
  panX: number;
  /** False while the window is folded to its title bar: nothing is drawn. */
  shown: boolean;
  /** A new number asks the map to bring the marker and the cone into view (see revealPlan). */
  reveal: number;
  /**
   * True when that request comes from the picture going live rather than from the player (opening the window,
   * changing its size): the map carries it out only if nobody has moved the map since the last reveal.
   */
  auto: boolean;
  /** The window's box over the map, if it covers some of it, in px from the map container's top left corner. */
  cover: (map: HTMLElement) => ScreenBox | null;
}

let current: CameraConeView | null = null;
let reveals = 0;
let asks = 0;

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
 * "Näita kaardil" for an incident whose camera window is open, not folded and live with a place on the map: the map
 * brings the marker and the camera into view by the reveal's rule, from at least ASK_ZOOM (revealPlan). False when
 * there is no such window; the caller then shows the incident as it would without one.
 */
export function showCameraOnMap(incidentId: string): boolean {
  const v = current;
  if (!v || v.incidentId !== incidentId || !v.shown || !v.pose) return false;
  asks++;
  return true;
}

/** How many times "Näita kaardil" asked the map to show the open camera (showCameraOnMap): the map compares. */
export const cameraAsks = (): number => asks;

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

/** Metres between two points; exact enough for a street. */
export function distM(a: LngLat, b: LngLat): number {
  const dx = (b[0] - a[0]) * DEG * R * Math.cos(((a[1] + b[1]) / 2) * DEG);
  const dy = (b[1] - a[1]) * DEG * R;
  return Math.hypot(dx, dy);
}

/** Beyond this many metres from the incident's marker, a dashed line joins the marker to the spot the camera shows. */
export const LINK_MIN_M = 40;

/**
 * The place name as the map's fonts can draw it: only the glyph ranges the map serves (public/glyphs: Latin with its
 * Estonian, Finnish, Latvian and other letters, and punctuation), at most 32 letters; '' when nothing is left.
 */
export function mapLabel(name: string): string {
  const s = name.replace(/[^\u0020-\u01ff\u2000-\u20ff]/gu, '').replace(/^[\s\u00b7:,-]+/u, '').replace(/\s+/gu, ' ').trim();
  return s.length > 32 ? `${s.slice(0, 31).trimEnd()}\u2026` : s;
}

/**
 * Which side of the ring the place's label goes on: away from the marker, so that it never lies on the line, and
 * where it covers the least of the cone (across the camera's bearing rather than along it).
 */
function labelSide(marker: LngLat, spot: LngLat, bearing: number): { anchor: string; offset: [number, number] } {
  const mx = (marker[0] - spot[0]) * Math.cos(spot[1] * DEG);
  const my = marker[1] - spot[1];
  const ml = Math.hypot(mx, my) || 1;
  const [bx, by] = [Math.sin(bearing * DEG), Math.cos(bearing * DEG)];
  const sides: { d: [number, number]; anchor: string; offset: [number, number] }[] = [
    { d: [0, -1], anchor: 'top', offset: [0, 0.8] },
    { d: [0, 1], anchor: 'bottom', offset: [0, -0.8] },
    { d: [1, 0], anchor: 'left', offset: [0.9, 0] },
    { d: [-1, 0], anchor: 'right', offset: [-0.9, 0] },
  ];
  const score = ({ d }: { d: [number, number] }) => -(d[0] * mx + d[1] * my) / ml - 0.9 * Math.abs(d[0] * bx + d[1] * by);
  const best = sides.reduce((a, b) => (score(b) > score(a) + 1e-9 ? b : a));
  return { anchor: best.anchor, offset: best.offset };
}

/** The incident's marker and the camera's place name, which join the cone when the camera shows a place apart. */
export interface ConeLink {
  marker: LngLat;
  place: string;
}

/**
 * The camera on the map, as GeoJSON for the source SRC.camera: the view cone in bands that fade outwards (`kind`
 * 'band', `o` how strong), its outline ('edge'), the camera ('at') and the spot ('spot'). When the spot lies more than
 * LINK_MIN_M from the incident's marker (the camera found the place itself, up to 250 m from the game's point), a
 * dashed line from the marker to the spot ('link') says "this incident is seen by that camera there", and the place's
 * name ('label', `name`, with the side it goes on) stands by the ring.
 */
export function buildCameraCone(pose: CameraPose, zoom = 1, panX = 0, link: ConeLink | null = null): FeatureCollection {
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
  const apart = link !== null && Number.isFinite(link.marker[0]) && Number.isFinite(link.marker[1]) && distM(link.marker, pose.spot) > LINK_MIN_M;
  if (apart) features.push({ type: 'Feature', properties: { kind: 'link' }, geometry: { type: 'LineString', coordinates: [link.marker, pose.spot] } });
  features.push({ type: 'Feature', properties: { kind: 'spot' }, geometry: { type: 'Point', coordinates: pose.spot } });
  features.push({ type: 'Feature', properties: { kind: 'at' }, geometry: { type: 'Point', coordinates: pose.at } });
  const name = apart ? mapLabel(link.place) : '';
  if (apart && name) features.push({ type: 'Feature', properties: { kind: 'label', name, ...labelSide(link.marker, pose.spot, pose.bearing) }, geometry: { type: 'Point', coordinates: pose.spot } });
  return { type: 'FeatureCollection', features };
}


/** What has to show when the map brings the camera into view: the marker first, then the camera, the spot and the cone's far edge. */
export function revealPoints(view: Pick<CameraConeView, 'marker' | 'pose' | 'zoom' | 'panX'>): LngLat[] {
  const pts: LngLat[] = [view.marker];
  const pose = view.pose;
  if (!pose) return pts;
  const [left, right] = coneEdges(pose, view.zoom, view.panX);
  const reach = clamp(pose.reach, 5, 500);
  pts.push(pose.at, pose.spot, ...arc(left, right).filter((_, i, a) => i === 0 || i === a.length - 1 || i % 4 === 0).map((b) => offsetM(pose.at, b, reach)));
  return pts;
}

/** A cone this many px from the camera to its far edge is big enough to lay the picture on. */
export const CONE_MIN_PX = 60;
/** Below this zoom the map is an overview: the reveal never changes its zoom, it only pans to the marker. */
export const OVERVIEW_ZOOM = 14;
/** The most the reveal zooms in to make the cone readable (levels). */
export const REVEAL_ZOOM_IN = 1.5;
/** The map never comes closer than this to show the camera (its street map's last useful zoom). */
export const REVEAL_MAX_ZOOM = 18;
/** A free part of the map whose short side is under this (px) has no room for the cone: only the marker is shown. */
export const FREE_MIN_PX = 160;
/** "Näita kaardil" with the camera open starts from at least this zoom, the one it asks for without a camera. */
export const ASK_ZOOM = 15;
/** The incident's marker as drawn when selected (px across, about its icon and ring). */
export const MARKER_PX = 44;
/**
 * Room kept between what is brought into view and the edges of the free part of the map (px): half the marker and a
 * little more, so that the marker is never cut by the map's edge nor lies partly under the window.
 */
export const REVEAL_PAD = MARKER_PX / 2 + 8;
/** Room left between the map's tool column and the part of the map counted as free (px). */
const TOOLS_GAP = 6;

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

/** Does a box overlap another? */
const overlaps = (a: ScreenBox, b: ScreenBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A strip without the map's tool column: cut back from the side the column stands on. */
function withoutTools(s: ScreenBox, tools: ScreenBox | null): ScreenBox {
  if (!tools || !overlaps(s, tools)) return s;
  if (tools.x + tools.w / 2 >= s.x + s.w / 2) return { ...s, w: Math.max(0, tools.x - TOOLS_GAP - s.x) };
  const x = Math.min(s.x + s.w, tools.x + tools.w + TOOLS_GAP);
  return { ...s, x, w: s.x + s.w - x };
}

/**
 * The part of the map the camera window leaves free (px from the map container's top left corner): the largest strip
 * beside the window (on a phone, where it docks at the top of the map, the part below it), or the whole map; without
 * the map's tool column (`tools`, its box over the map). A strip with room for the cone (FREE_MIN_PX) is taken before
 * a larger one without.
 */
export function freeBox(width: number, height: number, cover: ScreenBox | null, tools: ScreenBox | null = null): ScreenBox {
  const all = { x: 0, y: 0, w: width, h: height };
  const l = cover ? clamp(cover.x, 0, width) : 0;
  const r = cover ? clamp(cover.x + cover.w, 0, width) : 0;
  const t = cover ? clamp(cover.y, 0, height) : 0;
  const b = cover ? clamp(cover.y + cover.h, 0, height) : 0;
  if (!cover || r <= l || b <= t) return withoutTools(all, tools);
  const strips: ScreenBox[] = [
    { x: 0, y: 0, w: l, h: height },
    { x: r, y: 0, w: width - r, h: height },
    { x: 0, y: 0, w: width, h: t },
    { x: 0, y: b, w: width, h: height - b },
  ].map((s) => withoutTools(s, tools));
  const roomy = strips.filter((s) => Math.min(s.w, s.h) >= FREE_MIN_PX);
  return (roomy.length ? roomy : strips).reduce((a, s) => (s.w * s.h > a.w * a.h ? s : a));
}

export interface RevealInput {
  /** What has to show (revealPoints): the marker first. */
  points: LngLat[];
  /** Where those points are on the screen now (map.project), in the same order. */
  shown: [number, number][];
  /** The cone's reach (m), which should look at least CONE_MIN_PX long; null when there is no cone yet. */
  reach: number | null;
  /** The map's zoom now and its container's size (px). */
  zoom: number;
  width: number;
  height: number;
  /** The part of the map the window leaves free (freeBox). */
  free: ScreenBox;
  /** The least zoom to start from ("Näita kaardil": ASK_ZOOM); the map's own zoom when not given. */
  atLeast?: number;
}

/** Where to ease the map to: `center` lands `offset` px from the container's middle (maplibre easeTo). */
export interface RevealMove {
  center: LngLat;
  zoom: number;
  offset: [number, number];
  /** What the move brings into view (the marker alone, or everything): revealFix checks these once it has eased. */
  keep: LngLat[];
}

/** The box `b` with `m` px taken off every side. */
const inset = (b: ScreenBox, m: number): ScreenBox => ({ x: b.x + m, y: b.y + m, w: b.w - 2 * m, h: b.h - 2 * m });
const within = (p: [number, number], b: ScreenBox, tol = 0) => p[0] >= b.x - tol && p[0] <= b.x + b.w + tol && p[1] >= b.y - tol && p[1] <= b.y + b.h + tol;

/**
 * Whether and where the map moves to show the camera, keeping the dispatcher's own view wherever it can:
 * - in an overview (below OVERVIEW_ZOOM), before the picture is live, without a place on the map, or when the free
 *   part of the map is too small for the cone (its short side under FREE_MIN_PX), the zoom stays: the map pans only
 *   if the marker is not wholly in the free part, and brings it to the middle of it;
 * - else it zooms in by at most REVEAL_ZOOM_IN to make the cone CONE_MIN_PX long, and out only as far as fitting the
 *   marker, the camera, the spot and the cone needs, with them in the middle of the free part; it does not move while
 *   they all show there and the cone is big enough or as big as that rule allows.
 * The cone itself is drawn whatever its size.
 */
export function revealPlan(i: RevealInput): RevealMove | null {
  if (!i.points.length) return null;
  const z0 = Math.max(i.zoom, i.atLeast ?? -Infinity);
  const asked = z0 > i.zoom;
  const inner = inset(i.free, REVEAL_PAD);
  if (inner.w < 1 || inner.h < 1) return null;
  const offset: [number, number] = [i.free.x + i.free.w / 2 - i.width / 2, i.free.y + i.free.h / 2 - i.height / 2];
  const marker = i.points[0];
  const full = i.reach !== null && i.points.length > 1 && z0 >= OVERVIEW_ZOOM && Math.min(i.free.w, i.free.h) >= FREE_MIN_PX;
  if (!full) {
    if (!asked && i.shown[0] && within(i.shown[0], inner)) return null;
    return { center: marker, zoom: z0, offset, keep: [marker] };
  }
  const lat = i.points.reduce((s, p) => s + p[1], 0) / i.points.length;
  const inView = !asked && i.shown.length === i.points.length && i.shown.every((p) => within(p, inner));
  const m = i.points.map(merc);
  const xs = m.map((p) => p[0]);
  const ys = m.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // The zoom at which the cone is just big enough, never more than REVEAL_ZOOM_IN closer; and the one at which the
  // points just fit the free part.
  const need = Math.log2((CONE_MIN_PX * 40075016.686 * Math.cos(lat * DEG)) / (512 * Math.max(1, i.reach ?? 1)));
  const want = need > z0 ? Math.max(z0, Math.min(need, z0 + REVEAL_ZOOM_IN, REVEAL_MAX_ZOOM)) : z0;
  const fit = Math.log2(Math.min(x1 > x0 ? inner.w / (x1 - x0) : Infinity, y1 > y0 ? inner.h / (y1 - y0) : Infinity));
  const zoom = Math.min(want, fit);
  if (inView && zoom <= i.zoom + 0.01) return null;
  return { center: unmerc((x0 + x1) / 2, (y0 + y1) / 2), zoom, offset, keep: i.points };
}

/**
 * Which reveal the map owes the open camera, and when (MapController.syncCone, every overlay frame): the window's
 * requests (CameraConeView.reveal) and "Näita kaardil" (showCameraOnMap). `run` carries one out and answers false
 * while the map has no size (a phone's other tab): the request then stays owed and is tried again on the next frame,
 * so it happens once the map has a size again. Following a unit uses up the window's requests (the map stays on the
 * unit), and the request when the picture goes live (`auto`) is used up without a move when someone has moved the map
 * since the last reveal (`moved`).
 */
export class RevealGate {
  private reveal = 0;
  private ask = cameraAsks();
  private touched = false;

  /** Someone moved the map: the player (drag, wheel, keys, the map's buttons), a focus from the game, following. */
  moved(): void {
    this.touched = true;
  }

  /** Whether someone moved the map since the last reveal began. */
  get wasMoved(): boolean {
    return this.touched;
  }

  step(v: CameraConeView | null, follow: boolean, run: (atLeast?: number) => boolean): void {
    const asks = cameraAsks();
    if (asks !== this.ask) {
      if (v?.pose && v.shown && !this.try(() => run(ASK_ZOOM))) return;
      this.ask = asks;
    }
    if (v && v.reveal && v.reveal !== this.reveal && v.shown) {
      if (!follow && !(v.auto && this.touched) && !this.try(() => run())) return;
      this.reveal = v.reveal;
    }
  }

  /** A reveal begins: moves from now on count against the next one; unless it has to wait. */
  private try(run: () => boolean): boolean {
    const was = this.touched;
    this.touched = false;
    if (run()) return true;
    this.touched = was;
    return false;
  }
}

/** A second, small move once the reveal has eased: `at` (a screen point now) lands where the plan's offset says. */
export interface RevealFix {
  at: [number, number];
  zoom: number;
}

/**
 * The reveal works on a flat, north-up map; with the player's 3D tilt (or a turned map) what it brought into view can
 * still lie outside the free part. Given where those points are on the screen once the map has eased, the
 * correction: the middle of them to the middle of the free part, zoomed out if they do not fit. Null when they all
 * show (within 2 px).
 */
export function revealFix(shown: [number, number][], free: ScreenBox, zoom: number): RevealFix | null {
  const inner = inset(free, REVEAL_PAD);
  if (!shown.length || inner.w < 1 || inner.h < 1 || shown.every((p) => within(p, inner, 2))) return null;
  const xs = shown.map((p) => p[0]);
  const ys = shown.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min(1, x1 > x0 ? inner.w / (x1 - x0) : 1, y1 > y0 ? inner.h / (y1 - y0) : 1);
  return { at: [(x0 + x1) / 2, (y0 + y1) / 2], zoom: zoom + Math.log2(s) };
}
