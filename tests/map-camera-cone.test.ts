/**
 * Kaamerad on the map (src/map/cameraCone.ts, docs/CCTV.md section 14): the open camera's view cone, from the pose
 * the camera gives (where it hangs, which way it looks, how wide and how far) and the window's zoom and pan; how the
 * map brings it into view without throwing the player's own view about; the marker coordinate the camera is opened
 * at; and the cone's layers on every base map.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  ASK_ZOOM,
  buildCameraCone,
  cameraAsks,
  CONE_MIN_PX,
  coneEdges,
  distM,
  FREE_MIN_PX,
  freeBox,
  LINK_MIN_M,
  mapLabel,
  MARKER_PX,
  markerCoord,
  metresPerPx,
  nextReveal,
  offsetM,
  revealFix,
  RevealGate,
  revealPlan,
  revealPoints,
  REVEAL_MAX_ZOOM,
  REVEAL_PAD,
  REVEAL_ZOOM_IN,
  REVEAL_ZOOM_OUT,
  SPOT_PAD,
  freeStrips,
  LINK_MIN_PX,
  linkShown,
  showCameraCone,
  showCameraOnMap,
  type CameraConeView,
  type CameraPose,
} from '@/map/cameraCone';
import { ALLOWED_FONTS, buildStyle, CAMERA_CONE, CAMERA_LAYERS, MAP_STYLE_KEYS, OVERLAY_SOURCES, SRC } from '@/map/style';
import type { Incident, LngLat, SimState } from '@/sim/types';

const AT: LngLat = [24.7536, 59.4370];
const pose = (more: Partial<CameraPose> = {}): CameraPose => ({ at: AT, spot: offsetM(AT, 90, 20), bearing: 90, fovH: 80, reach: 40, ...more });

const DEG = Math.PI / 180;
/** Metres east and north of AT. */
function local(p: LngLat): [number, number] {
  return [(p[0] - AT[0]) * DEG * 6371008.8 * Math.cos(AT[1] * DEG), (p[1] - AT[1]) * DEG * 6371008.8];
}
/** Bearing (degrees clockwise from north, 0..360) and distance (m) of p from AT. */
function polar(p: LngLat): { b: number; d: number } {
  const [e, n] = local(p);
  return { b: ((Math.atan2(e, n) / DEG) % 360 + 360) % 360, d: Math.hypot(e, n) };
}
/** Is the screen point inside the box (within 1e-6 px)? */
const within = (q: [number, number], b: { x: number; y: number; w: number; h: number }) =>
  q[0] >= b.x - 1e-6 && q[0] <= b.x + b.w + 1e-6 && q[1] >= b.y - 1e-6 && q[1] <= b.y + b.h + 1e-6;
const bands = (fc: ReturnType<typeof buildCameraCone>) => fc.features.filter((f) => f.properties?.kind === 'band') as Feature<Polygon>[];
/** Every vertex of the cone's bands, as seen from the camera. */
const vertices = (fc: ReturnType<typeof buildCameraCone>) => bands(fc).flatMap((f) => f.geometry.coordinates[0].map((p) => p as LngLat));

describe('the view cone', () => {
  it('opens fovH wide around the bearing, out to the reach', () => {
    for (const bearing of [0, 37, 90, 181, 300]) {
      const fc = buildCameraCone(pose({ bearing }));
      const far = vertices(fc).filter((p) => polar(p).d > 39);
      expect(far.length).toBeGreaterThan(10);
      const off = far.map((p) => ((polar(p).b - bearing + 540) % 360) - 180);
      expect(Math.min(...off)).toBeCloseTo(-40, 1);
      expect(Math.max(...off)).toBeCloseTo(40, 1);
      for (const p of far) expect(polar(p).d).toBeCloseTo(40, 0);
      // Nothing of it lies behind the camera or past the reach.
      for (const p of vertices(fc)) {
        const { b, d } = polar(p);
        expect(d).toBeLessThan(40.01);
        if (d > 0.01) expect(Math.abs(((b - bearing + 540) % 360) - 180)).toBeLessThanOrEqual(40.001);
      }
    }
  });

  it('looks east at bearing 90, north at 0: the far edge lies that way from the camera', () => {
    const east = vertices(buildCameraCone(pose({ bearing: 90 }))).map(local);
    expect(Math.min(...east.map((p) => p[0]))).toBeGreaterThan(-0.01);
    const north = vertices(buildCameraCone(pose({ bearing: 0 }))).map(local);
    expect(Math.min(...north.map((p) => p[1]))).toBeGreaterThan(-0.01);
  });

  it('is three closed bands that fade outwards, an outline, the camera and the spot', () => {
    const p = pose();
    const fc = buildCameraCone(p);
    const b = bands(fc);
    expect(b.map((f) => f.properties?.o)).toEqual([1, 0.62, 0.3]);
    for (const f of b) {
      const ring = f.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
    // The nearest band starts at the camera itself.
    expect(b[0].geometry.coordinates[0]).toContainEqual(AT);
    const kinds = fc.features.map((f) => f.properties?.kind);
    expect(kinds.filter((k) => k === 'edge')).toHaveLength(1);
    expect(fc.features.find((f) => f.properties?.kind === 'at')?.geometry).toEqual({ type: 'Point', coordinates: AT });
    expect(fc.features.find((f) => f.properties?.kind === 'spot')?.geometry).toEqual({ type: 'Point', coordinates: p.spot });
  });

  it('narrows with the window zoom as the picture does, and turns with its pan', () => {
    const t = Math.tan(40 * DEG);
    // Zoom k shows the frame's middle 1/k: half the width atan(tan(fovH / 2) / k).
    for (const k of [1, 1.5, 2.25, 4]) {
      const [l, r] = coneEdges({ bearing: 90, fovH: 80 }, k, 0);
      expect(r - l).toBeCloseTo((2 * Math.atan(t / k)) / DEG, 6);
      expect((l + r) / 2).toBeCloseTo(90, 6);
    }
    // Panned to the right edge at zoom 2: the frame's right half, from the bearing to its right edge.
    const [l, r] = coneEdges({ bearing: 90, fovH: 80 }, 2, 0.25);
    expect(l).toBeCloseTo(90, 6);
    expect(r).toBeCloseTo(130, 6);
    // A pan beyond what the zoom allows is held at the edge, and zoom 1 cannot pan.
    expect(coneEdges({ bearing: 90, fovH: 80 }, 2, 0.9)).toEqual(coneEdges({ bearing: 90, fovH: 80 }, 2, 0.25));
    expect(coneEdges({ bearing: 90, fovH: 80 }, 1, 0.3)).toEqual([50, 130]);
    // The zoomed cone's polygon is as narrow as the edges say.
    const far = vertices(buildCameraCone(pose(), 4, 0)).filter((p) => polar(p).d > 39);
    const off = far.map((p) => polar(p).b - 90);
    expect(Math.max(...off) - Math.min(...off)).toBeCloseTo((2 * Math.atan(t / 4)) / DEG, 1);
  });

  it('survives what a broken pose could hold', () => {
    expect(coneEdges({ bearing: 10, fovH: 60 }, Number.NaN, Number.NaN)).toEqual(coneEdges({ bearing: 10, fovH: 60 }));
    const fc = buildCameraCone(pose({ reach: 1e6 }));
    expect(Math.max(...vertices(fc).map((p) => polar(p).d))).toBeLessThan(501);
  });
});

describe('bringing the camera into view', () => {
  const W = 1200;
  const H = 800;
  /** A plain north-up projection of the map at `zoom` centred on `c`. */
  const project = (c: LngLat, zoom: number) => (p: LngLat): [number, number] => {
    const mpp = metresPerPx(zoom, c[1]);
    const e = (p[0] - c[0]) * DEG * 6371008.8 * Math.cos(c[1] * DEG);
    const n = (p[1] - c[1]) * DEG * 6371008.8;
    return [W / 2 + e / mpp, H / 2 - n / mpp];
  };
  /** Where the plan puts `p` on the screen once the map has eased (its centre `offset` px from the middle). */
  const after = (plan: { center: LngLat; zoom: number; offset: [number, number] }, p: LngLat): [number, number] => {
    const [x, y] = project(plan.center, plan.zoom)(p);
    return [x + plan.offset[0], y + plan.offset[1]];
  };
  const inside = (q: [number, number], b: { x: number; y: number; w: number; h: number }, m = 0) =>
    q[0] >= b.x + m - 1e-6 && q[0] <= b.x + b.w - m + 1e-6 && q[1] >= b.y + m - 1e-6 && q[1] <= b.y + b.h - m + 1e-6;
  const view = { marker: offsetM(AT, 80, 25), pose: pose(), zoom: 1, panX: 0 };
  const points = revealPoints(view);
  /** The window in the top right corner: the free part is to its left. */
  const cover = { x: W - 460, y: 12, w: 448, h: 400 };
  const free = freeBox(W, H, cover);
  const plan = (zoom: number, centre: LngLat, more: Partial<Parameters<typeof revealPlan>[0]> = {}) =>
    revealPlan({ points, shown: points.map(project(centre, zoom)), reach: 40, zoom, width: W, height: H, free, ...more });

  it('keeps clear of the window: the largest strip beside it, below it on a phone', () => {
    expect(free).toEqual({ x: 0, y: 0, w: W - 460, h: H });
    expect(freeBox(390, 700, { x: 0, y: 0, w: 390, h: 260 })).toEqual({ x: 0, y: 260, w: 390, h: 440 });
    expect(freeBox(W, H, null)).toEqual({ x: 0, y: 0, w: W, h: H });
  });

  it("leaves out the map's tool column: on a phone the marker never lands under the locate and follow buttons", () => {
    // The phone's column, moved below the docked window, 44 px wide 8 px from the right edge.
    const tools = { x: 390 - 52, y: 268, w: 44, h: 250 };
    const box = freeBox(390, 700, { x: 0, y: 0, w: 390, h: 260 }, tools);
    expect(box).toEqual({ x: 0, y: 260, w: 390 - 52 - 6, h: 440 });
    // A column that does not reach into the strip changes nothing; one on the left cuts from the left.
    expect(freeBox(W, H, cover, { x: W - 54, y: 420, w: 44, h: 0.1 })).toEqual(free);
    expect(freeBox(W, H, null, { x: 10, y: 10, w: 40, h: 200 })).toEqual({ x: 56, y: 0, w: W - 56, h: H });
    // A marker hidden under the column on a phone (ph-fuelfar.png: 339 px across a 390 px map) is brought out of it.
    const m = view.marker;
    const z = 16;
    const c = offsetM(m, 270, 150 * metresPerPx(z, m[1]));
    const shown = project(c, z)(m);
    const p = revealPlan({ points: [m], shown: [shown], reach: null, zoom: z, width: 390, height: 700, free: box })!;
    expect(p).not.toBeNull();
    expect(p.offset[0]).toBeCloseTo(box.w / 2 - 390 / 2, 6);
  });

  it('prefers a strip with room for the cone over a larger one without', () => {
    // Window 300 px wide at the left, 690 px tall: right strip 300 x 700 (roomy), bottom strip 1000 x 10 is not.
    expect(freeBox(1000, 700, { x: 0, y: 0, w: 700, h: 690 })).toEqual({ x: 700, y: 0, w: 300, h: 700 });
    // A wide band of 1000 x 150 (150 000 px) against a column of 170 x 700 (119 000 px): the column has room.
    expect(freeBox(1000, 700, { x: 0, y: 0, w: 830, h: 550 })).toEqual({ x: 830, y: 0, w: 170, h: 700 });
  });

  it('does not move when the cone and the marker already show beside the window, big enough', () => {
    // Centred in the free part at zoom 17.5: about 186 px of reach.
    const c: LngLat = offsetM(AT, 90, ((W / 2 - free.w / 2) * metresPerPx(17.5, AT[1])) - 18);
    expect(plan(17.5, c)).toBeNull();
  });

  it('eases to the free part when the cone is under the window, keeping the zoom', () => {
    const c = offsetM(AT, 270, 140 * metresPerPx(17.5, AT[1]));
    const p = plan(17.5, c)!;
    expect(p).not.toBeNull();
    expect(p.zoom).toBe(17.5);
    expect(p.offset).toEqual([free.w / 2 - W / 2, 0]);
    // The middle of what must show.
    expect(polar(p.center).d).toBeLessThan(40);
    for (const q of points) expect(inside(after(p, q), free, REVEAL_PAD)).toBe(true);
    expect(p.keep).toEqual(points);
  });

  it('zooms in by at most 1.5 levels for a readable cone (about 60 px), from zoom 14 up', () => {
    const z = (zoom: number) => plan(zoom, AT)!.zoom;
    // From 14 the cone of 40 m would need about 15.9: the step stops at 15.5.
    expect(z(14)).toBeCloseTo(14 + REVEAL_ZOOM_IN, 9);
    // From 15 it reaches the zoom at which the cone is CONE_MIN_PX long.
    expect(40 / metresPerPx(z(15), AT[1])).toBeCloseTo(CONE_MIN_PX, 3);
    expect(CONE_MIN_PX).toBeLessThanOrEqual(60);
    // Never past the street map's last zoom.
    expect(plan(17.9, AT, { reach: 5 })!.zoom).toBeLessThanOrEqual(REVEAL_MAX_ZOOM);
  });

  it('keeps an overview: below zoom 14 the zoom never changes, the map only pans a hidden marker out, no further', () => {
    for (const zoom of [9, 12.5, 13.9]) {
      // The marker under the window: a pan just far enough to bring it beside the window with its room, same zoom
      // (w1280-overview-1.png: a pan to the middle of the free part carried a unit 900 m away off the map).
      const under = offsetM(view.marker, 270, (cover.x + cover.w / 2 - W / 2) * metresPerPx(zoom, AT[1]));
      const was = project(under, zoom)(view.marker);
      expect(inside(was, cover)).toBe(true);
      const p = plan(zoom, under)!;
      expect(p).not.toBeNull();
      expect(p.zoom).toBe(zoom);
      expect(p.keep).toEqual([view.marker]);
      const now = after(p, view.marker);
      expect(inside(now, free, REVEAL_PAD)).toBe(true);
      // (Within half a px: this test's projection is a local one, the plan's Web Mercator.)
      expect(now[0]).toBeCloseTo(free.x + free.w - REVEAL_PAD, 0);
      expect(now[1]).toBeCloseTo(was[1], 0);
      // The marker already in the free part: no move at all, however small the cone looks.
      const c = offsetM(view.marker, 90, 200 * metresPerPx(zoom, AT[1]));
      expect(plan(zoom, c)).toBeNull();
    }
  });

  it('steps back when the cone does not fit at the zoom the player chose, no further than it needs', () => {
    // Zoom 18.4: the 65 m from the marker to the cone's far edge fit the free part, so the map only pans.
    expect(plan(18.4, AT)!.zoom).toBe(18.4);
    const p = plan(19.2, AT)!;
    expect(p.zoom).toBeLessThan(19.2);
    for (const q of points) expect(inside(after(p, q), free, REVEAL_PAD)).toBe(true);
    // The camera's place 240 m from the marker at zoom 17: out just far enough that both fit.
    const far = { ...view, pose: pose({ at: offsetM(view.marker, 200, 240), spot: offsetM(offsetM(view.marker, 200, 240), 90, 20) }) };
    const fp = revealPoints(far);
    const p2 = revealPlan({ points: fp, shown: fp.map(project(view.marker, 17)), reach: 40, zoom: 17, width: W, height: H, free })!;
    expect(p2.zoom).toBeLessThan(17);
    const xs = fp.map((q) => after(p2, q));
    for (const q of xs) expect(inside(q, free, REVEAL_PAD)).toBe(true);
    // Just: the points span the free part's width or height (less its room) to within a few px.
    const span = (k: 0 | 1) => Math.max(...xs.map((q) => q[k])) - Math.min(...xs.map((q) => q[k]));
    expect(Math.max(span(0) / (free.w - 2 * REVEAL_PAD), span(1) / (free.h - 2 * REVEAL_PAD))).toBeCloseTo(1, 2);
  });

  it('with too little free room for the cone (1280 x 720: an 86 px band) it brings the whole marker into the band and keeps the zoom', () => {
    const mw = 548;
    const mh = 385;
    const band = freeBox(mw, mh, { x: 40, y: 12, w: 448, h: 287 });
    expect(band).toEqual({ x: 0, y: 299, w: mw, h: 86 });
    expect(Math.min(band.w, band.h)).toBeLessThan(FREE_MIN_PX);
    const prj = (c: LngLat, zoom: number) => (p: LngLat): [number, number] => {
      const mpp = metresPerPx(zoom, c[1]);
      return [mw / 2 + ((p[0] - c[0]) * DEG * 6371008.8 * Math.cos(c[1] * DEG)) / mpp, mh / 2 - ((p[1] - c[1]) * DEG * 6371008.8) / mpp];
    };
    // The verifier's case: the marker under the window at zoom 15.
    const p = revealPlan({ points, shown: points.map(prj(view.marker, 15)), reach: 40, zoom: 15, width: mw, height: mh, free: band })!;
    expect(p.zoom).toBe(15);
    expect(p.keep).toEqual([view.marker]);
    const [x, y] = prj(p.center, p.zoom)(view.marker);
    const q: [number, number] = [x + p.offset[0], y + p.offset[1]];
    // The whole selected marker (44 px) with room: inside the band, so neither under the window nor cut at the edge.
    expect(q[1] - MARKER_PX / 2).toBeGreaterThanOrEqual(band.y);
    expect(q[1] + MARKER_PX / 2).toBeLessThanOrEqual(mh);
    expect(REVEAL_PAD).toBeGreaterThan(MARKER_PX / 2);
    // Already wholly in the band: no move. Half cut by the map's bottom edge (m-A1.png: 368 of 385): moved.
    const at = (px: number, py: number): [number, number] => [px, py];
    expect(revealPlan({ points, shown: [at(274, 342), ...points.slice(1).map(() => at(0, 0))], reach: 40, zoom: 15, width: mw, height: mh, free: band })).toBeNull();
    expect(revealPlan({ points, shown: [at(242, 368), ...points.slice(1).map(() => at(0, 0))], reach: 40, zoom: 15, width: mw, height: mh, free: band })).not.toBeNull();
    // A strip too thin for the marker itself: nothing sensible to do, no move.
    expect(revealPlan({ points, shown: points.map(prj(view.marker, 15)), reach: 40, zoom: 15, width: mw, height: mh, free: { x: 0, y: 340, w: mw, h: 45 } })).toBeNull();
  });

  describe("at 1280 x 720, with the camera's place apart from the marker (the far Tamoil, w1280-fuelfar-1.png)", () => {
    // The game's map at 1280 x 720: 548 x 385, the window over most of it, the tool column at its right edge. The only
    // strip with room for the marker is the 86 px band below the window.
    const mw = 548;
    const mh = 385;
    const win = { x: 40, y: 12, w: 448, h: 287 };
    const tools = { x: 500, y: 12, w: 36, h: 230 };
    const band = freeBox(mw, mh, win, tools);
    const strips = freeStrips(mw, mh, win, tools);
    const marker: LngLat = [11.228666, 43.775678];
    const prj = (c: LngLat, zoom: number) => (p: LngLat): [number, number] => {
      const mpp = metresPerPx(zoom, c[1]);
      return [mw / 2 + ((p[0] - c[0]) * DEG * 6371008.8 * Math.cos(c[1] * DEG)) / mpp, mh / 2 - ((p[1] - c[1]) * DEG * 6371008.8) / mpp];
    };
    const land = (p: { center: LngLat; zoom: number; offset: [number, number] }, q: LngLat): [number, number] => {
      const [x, y] = prj(p.center, p.zoom)(q);
      return [x + p.offset[0], y + p.offset[1]];
    };
    /** The live reveal at `zoom` with the marker in the middle of the map (under the window), its spot `m` m towards `b`. */
    const reveal = (b: number, m: number, zoom = 15) => {
      const at = offsetM(marker, b, m + 12);
      const v = { marker, pose: pose({ at, spot: offsetM(marker, b, m), bearing: (b + 180) % 360, reach: 45 }), zoom: 1, panX: 0 };
      const pts = revealPoints(v);
      const plan = revealPlan({ points: pts, shown: pts.map(prj(marker, zoom)), reach: 45, zoom, width: mw, height: mh, free: band, spot: v.pose.spot, strips })!;
      return { plan, spot: v.pose.spot };
    };
    const whole = (q: [number, number]) => inside(q, { x: 0, y: 0, w: mw, h: mh }, MARKER_PX / 2);

    it('the band is the free part, too small for the cone', () => {
      expect(band).toEqual({ x: 0, y: 299, w: mw, h: 86 });
      expect(strips).toContainEqual(band);
    });

    it('keeps the marker and the ring in the band together, at the same zoom when they fit', () => {
      const { plan, spot } = reveal(250, 156);
      expect(plan).not.toBeNull();
      expect(plan.keep).toEqual([marker, spot]);
      expect(plan.zoom).toBe(15);
      expect(inside(land(plan, marker), band, REVEAL_PAD - 0.5)).toBe(true);
      expect(inside(land(plan, spot), band, SPOT_PAD - 0.5)).toBe(true);
    });

    it('zooms out as far as that needs, no more than 1.5 levels', () => {
      for (const b of [180, 0, 200]) {
        const { plan, spot } = reveal(b, 156);
        expect(plan.zoom).toBeLessThan(15);
        expect(plan.zoom).toBeGreaterThanOrEqual(15 - REVEAL_ZOOM_OUT);
        expect(inside(land(plan, marker), band, REVEAL_PAD - 0.5)).toBe(true);
        expect(inside(land(plan, spot), band, SPOT_PAD - 0.5)).toBe(true);
        // Just: one level less would not fit them (the band is 86 px tall).
        const span = Math.abs(land(plan, marker)[1] - land(plan, spot)[1]);
        expect(span).toBeCloseTo(band.h - REVEAL_PAD - SPOT_PAD, 0);
      }
    });

    it('when no strip holds both, the ring goes into the band and the marker stays whole, the line running to it', () => {
      // 300 m south: some 61 px even 1.5 levels out, the band holds 42.
      const { plan, spot } = reveal(180, 300);
      expect(plan.zoom).toBeCloseTo(15 - REVEAL_ZOOM_OUT, 9);
      expect(inside(land(plan, spot), band, SPOT_PAD - 0.5)).toBe(true);
      const m = land(plan, marker);
      expect(whole(m)).toBe(true);
      // As near the band as the line lets it be: straight above the ring, the ring at the band's bottom.
      expect(m[0]).toBeCloseTo(land(plan, spot)[0], 0);
      expect(land(plan, spot)[1]).toBeCloseTo(band.y + band.h - SPOT_PAD, 0);
      expect(plan.within[0]).toEqual({ x: MARKER_PX / 2 + 1, y: MARKER_PX / 2 + 1, w: mw - MARKER_PX - 2, h: mh - MARKER_PX - 2 });
      // North of the marker, the ring cannot go below it in the band with the marker on the map: it goes into the
      // strip beside the window instead, the marker whole below it.
      const north = reveal(0, 300);
      const ring = land(north.plan, north.spot);
      expect(inside(ring, strips[0], SPOT_PAD - 0.5)).toBe(true);
      expect(whole(land(north.plan, marker))).toBe(true);
    });

    it('from an overview it keeps the zoom, never zooming in', () => {
      const { plan, spot } = reveal(241, 156, 12.5);
      expect(plan.zoom).toBe(12.5);
      expect(inside(land(plan, marker), band, REVEAL_PAD - 0.5)).toBe(true);
      expect(inside(land(plan, spot), band, SPOT_PAD - 0.5)).toBe(true);
      // Moved only as far as it takes: the marker at the band's top with its room, straight down.
      expect(land(plan, marker)[1]).toBeCloseTo(band.y + REVEAL_PAD, 0);
      expect(land(plan, marker)[0]).toBeCloseTo(mw / 2, 0);
    });

    it('does not move once both show in the band', () => {
      const { plan } = reveal(250, 156);
      const v = { marker, pose: pose({ at: offsetM(marker, 250, 168), spot: offsetM(marker, 250, 156), bearing: 70, reach: 45 }), zoom: 1, panX: 0 };
      const pts = revealPoints(v);
      const shown = pts.map((q) => land(plan, q));
      expect(revealPlan({ points: pts, shown, reach: 45, zoom: 15, width: mw, height: mh, free: band, spot: v.pose.spot, strips })).toBeNull();
    });

    it('a spot by the marker (no line) keeps the old rule: the marker alone', () => {
      const { plan } = reveal(241, LINK_MIN_M - 5);
      expect(plan.keep).toEqual([marker]);
      expect(plan.zoom).toBe(15);
    });
  });

  it('before the picture is live only the marker counts: no zoom change for it', () => {
    const marker = [view.marker];
    const c = offsetM(view.marker, 270, 200 * metresPerPx(14, AT[1]));
    const p = revealPlan({ points: marker, shown: marker.map(project(c, 14)), reach: null, zoom: 14, width: W, height: H, free })!;
    expect(p.zoom).toBe(14);
    expect(after(p, view.marker)[0]).toBeCloseTo(free.x + free.w - REVEAL_PAD, 0);
    expect(revealPlan({ points: marker, shown: marker.map(project(offsetM(view.marker, 90, 300 * metresPerPx(14, AT[1])), 14)), reach: null, zoom: 14, width: W, height: H, free })).toBeNull();
  });

  it('"Näita kaardil" starts from zoom 15 at least, then follows the same rule', () => {
    // From an overview the button comes to 15 and zooms on for the cone (at most 1.5 more): never the bare 15 at which
    // the cone (about 18 px) hid under the marker (m-F.png).
    const p = plan(12, AT, { atLeast: ASK_ZOOM })!;
    expect(p.zoom).toBeGreaterThan(ASK_ZOOM);
    expect(p.zoom).toBeLessThanOrEqual(ASK_ZOOM + REVEAL_ZOOM_IN);
    expect(40 / metresPerPx(p.zoom, AT[1])).toBeGreaterThanOrEqual(CONE_MIN_PX - 1e-6);
    // Already closer than 15 and all in view: the button moves nothing.
    const c: LngLat = offsetM(AT, 90, ((W / 2 - free.w / 2) * metresPerPx(17.5, AT[1])) - 18);
    expect(plan(17.5, c, { atLeast: ASK_ZOOM })).toBeNull();
  });
});

describe('the map tilted in 3D', () => {
  it('looks again once the reveal has eased and corrects what is outside the free part', () => {
    const room = { x: REVEAL_PAD, y: REVEAL_PAD, w: 700 - 2 * REVEAL_PAD, h: 800 - 2 * REVEAL_PAD };
    const all = (n: number) => ({ within: Array.from({ length: n }, () => room), minZoom: -Infinity, centre: true });
    // In view: nothing to correct (2 px of slack for rounding).
    expect(revealFix([[100, 100], [600, 700], [REVEAL_PAD - 1.5, 400]], all(3), 17)).toBeNull();
    // The far edge of the cone pushed below the free part by the pitch: the middle of the points to the middle of the
    // free part, zoomed out just enough to fit.
    const f = revealFix([[100, 100], [600, 900]], all(2), 17)!;
    expect(f.at).toEqual([350, 500]);
    expect(f.to[0]).toBeCloseTo(350, 9);
    expect(f.to[1]).toBeCloseTo(400, 9);
    expect(f.zoom).toBeCloseTo(17 + Math.log2((800 - 2 * REVEAL_PAD) / 800), 9);
    // Only a pan when they fit.
    const g = revealFix([[650, 100], [690, 200]], all(2), 17)!;
    expect(g.zoom).toBe(17);
    expect(g.at).toEqual([670, 150]);
    expect(g.to).toEqual([350, 400]);
  });

  it('keeps the marker and the ring in their strip, zooming out no further than the move allows', () => {
    // The 1280 x 720 band below the window (w1280-tilt-1.png): the pitch pushed the ring below the map.
    const band = { x: 0, y: 299, w: 548, h: 86 };
    const move = { within: [{ x: 30, y: 329, w: 488, h: 26 }, { x: 14, y: 313, w: 520, h: 58 }], minZoom: 13.5, centre: false };
    expect(revealFix([[260, 340], [190, 360]], move, 15)).toBeNull();
    const f = revealFix([[260, 340], [190, 410]], move, 15)!;
    const s = 2 ** (f.zoom - 15);
    const land = (p: [number, number]): [number, number] => [f.to[0] + (p[0] - f.at[0]) * s, f.to[1] + (p[1] - f.at[1]) * s];
    expect(f.zoom).toBeLessThan(15);
    expect(f.zoom).toBeGreaterThanOrEqual(13.5);
    expect(within(land([260, 340]), move.within[0])).toBe(true);
    expect(within(land([190, 410]), move.within[1])).toBe(true);
    expect(band.y + band.h).toBeGreaterThan(land([190, 410])[1]);
  });
});

describe('the incident and the camera apart', () => {
  const marker = offsetM(AT, 300, 130);

  it('joins the marker to the spot with a line when the spot is more than 40 m away, and names the place by the ring', () => {
    const p = pose();
    const fc = buildCameraCone(p, 1, 0, { marker, place: ' · Tamoil' });
    const link = fc.features.find((f) => f.properties?.kind === 'link');
    expect(link?.geometry).toEqual({ type: 'LineString', coordinates: [marker, p.spot] });
    const label = fc.features.find((f) => f.properties?.kind === 'label');
    expect(label?.properties?.name).toBe('Tamoil');
    expect(label?.geometry).toEqual({ type: 'Point', coordinates: p.spot });
    // The marker lies west-north-west of the spot, the camera behind it to the west looks east: the name goes on the
    // south side, away from the line, the camera's dot and the cone.
    expect(label?.properties?.anchor).toBe('top');
    expect(fc.features.map((f) => f.properties?.kind)).toEqual(['band', 'band', 'band', 'edge', 'link', 'spot', 'at', 'label']);
    expect(distM(marker, p.spot)).toBeGreaterThan(LINK_MIN_M);
  });

  it('draws neither when the spot is by the marker, nor without a marker', () => {
    const p = pose();
    const near = offsetM(p.spot, 10, LINK_MIN_M - 2);
    expect(buildCameraCone(p, 1, 0, { marker: near, place: 'Tamoil' }).features).toHaveLength(6);
    expect(buildCameraCone(p, 1, 0, { marker: offsetM(p.spot, 10, LINK_MIN_M + 2), place: 'Tamoil' }).features).toHaveLength(8);
    expect(buildCameraCone(p).features).toHaveLength(6);
    expect(buildCameraCone(p, 1, 0, { marker: [Number.NaN, 59], place: 'Tamoil' }).features).toHaveLength(6);
    // Apart, but no name the map can draw: the line alone.
    const kinds = buildCameraCone(p, 1, 0, { marker, place: '' }).features.map((f) => f.properties?.kind);
    expect(kinds).toContain('link');
    expect(kinds).not.toContain('label');
  });

  it('puts the name on the side away from the marker, the camera and the cone', () => {
    const p = pose();
    const side = (b: number) => buildCameraCone(p, 1, 0, { marker: offsetM(p.spot, b, 120), place: 'X' }).features.find((f) => f.properties?.kind === 'label')?.properties;
    expect(side(0)).toMatchObject({ anchor: 'top', offset: [0, 0.8] });
    expect(side(180)).toMatchObject({ anchor: 'bottom', offset: [0, -0.8] });
    // The camera 20 m west of the spot looking east: neither west (its dot) nor east (into the cone), whichever side
    // the marker is on; across instead.
    expect(side(90)).toMatchObject({ anchor: 'top' });
    expect(side(270)).toMatchObject({ anchor: 'top' });
    // The camera far behind (90 m): its dot is out of the name's reach, so the name may go its way, away from the marker.
    const far = pose({ spot: offsetM(AT, 90, 90), reach: 120 });
    const farSide = buildCameraCone(far, 1, 0, { marker: offsetM(far.spot, 90, 120), place: 'X' }).features.find((f) => f.properties?.kind === 'label');
    expect(farSide?.properties).toMatchObject({ anchor: 'right' });
    // Florence's Tamoil (dt-fuelfar.png): the marker north-east of the spot, the camera looking west. Not on the
    // west side, where the cone is: below the ring.
    const tamoil = pose({ bearing: 262 });
    const at = buildCameraCone(tamoil, 1, 0, { marker: offsetM(tamoil.spot, 60, 139), place: 'Tamoil' }).features.find((f) => f.properties?.kind === 'label');
    expect(at?.properties?.anchor).toBe('top');
    // The Tamoil of lt3-fuelfar-zoom.png: the camera's dot 15 m south-west of the ring, looking north-east towards the
    // marker. The name went below the ring, onto the dot; now it goes to the north-west, clear of the dot, the line
    // and the cone.
    const spot = offsetM(AT, 45, 15);
    const lt3 = pose({ spot, bearing: 55, fovH: 70, reach: 45 });
    const label = buildCameraCone(lt3, 1, 0, { marker: offsetM(spot, 62, 156), place: 'Tamoil' }).features.find((f) => f.properties?.kind === 'label');
    expect(label?.properties?.anchor).toBe('bottom-right');
  });

  it('draws the line only while the map shows it longer than the marker, so that it never hides under it', () => {
    // In Florence, where the verifier saw it.
    const fl: LngLat = [11.2318, 43.7843];
    const p = pose({ at: fl, spot: offsetM(fl, 90, 20) });
    const kinds = (m: number, mapZoom?: number) =>
      buildCameraCone(p, 1, 0, { marker: offsetM(p.spot, 0, m), place: 'Q8', mapZoom }).features.map((f) => f.properties?.kind);
    // Q8 in Florence (dt-open15-1.png): 48 m at zoom 15.2, some 30 px, nearly all of it under the 44 px marker.
    expect(48 / metresPerPx(15.2, p.spot[1])).toBeLessThan(LINK_MIN_PX);
    expect(kinds(48, 15.2)).not.toContain('link');
    // The name stays: it tells which place the ring by the marker is.
    expect(kinds(48, 15.2)).toContain('label');
    // Closer in, the same place is far enough on the screen for the line.
    expect(kinds(48, 16.5)).toContain('link');
    expect(linkShown(p.spot, offsetM(p.spot, 0, 48), 16.5)).toBe(true);
    // The far Tamoil, 156 m: drawn from zoom 14 up.
    expect(kinds(156, 14)).toContain('link');
    expect(LINK_MIN_PX).toBeGreaterThan(MARKER_PX / 2);
    // Without the map's zoom (the metres alone) as before.
    expect(kinds(48)).toContain('link');
  });

  it("keeps only the letters the map's fonts have", () => {
    expect(mapLabel(' · Narva mnt')).toBe('Narva mnt');
    expect(mapLabel('Õismäe Šokolaadi Žürii')).toBe('Õismäe Šokolaadi Žürii');
    expect(mapLabel('Москва Hotel')).toBe('Hotel');
    expect(mapLabel('東京')).toBe('');
    expect(mapLabel('A'.repeat(40))).toHaveLength(32);
    expect(mapLabel('A'.repeat(40)).endsWith('…')).toBe(true);
  });

  it('the reveal fits the marker, the line and the cone together', () => {
    const v = { marker, pose: pose(), zoom: 1, panX: 0 };
    const pts = revealPoints(v);
    expect(pts[0]).toEqual(marker);
    expect(pts).toContainEqual(v.pose.spot);
    expect(pts).toContainEqual(v.pose.at);
  });
});

describe('when the map carries out a reveal', () => {
  const sim = {} as SimState;
  const view = (more: Partial<CameraConeView> = {}): CameraConeView => ({
    sim,
    incidentId: 'i1',
    marker: AT,
    place: 'Tamoil',
    pose: pose(),
    zoom: 1,
    panX: 0,
    shown: true,
    reveal: 0,
    revealAt: 0,
    auto: false,
    cover: () => null,
    ...more,
  });
  afterEach(() => showCameraCone(null));

  it("leaves out the live reveal when someone moved the map since the opening's", () => {
    const g = new RevealGate();
    const runs: (number | undefined)[] = [];
    const run = (z?: number) => (runs.push(z), true);
    const open = nextReveal();
    g.step(view({ reveal: open, pose: null }), false, run);
    expect(runs).toHaveLength(1);
    // The same request again: nothing more.
    g.step(view({ reveal: open, pose: null }), false, run);
    expect(runs).toHaveLength(1);
    // The dispatcher drags the map away while the camera connects; the picture goes live: no yank.
    g.moved();
    g.step(view({ reveal: nextReveal(), auto: true }), false, run);
    expect(runs).toHaveLength(1);
    // Unmoved, the live reveal is carried out.
    const g2 = new RevealGate();
    g2.step(view({ reveal: nextReveal(), pose: null }), false, run);
    g2.step(view({ reveal: nextReveal(), auto: true }), false, run);
    expect(runs).toHaveLength(3);
    // The player's own request (a change of size) is carried out even after a move, and starts the count again.
    g.step(view({ reveal: nextReveal() }), false, run);
    expect(runs).toHaveLength(4);
    expect(g.wasMoved).toBe(false);
  });

  it('drops a request older than the last move, the opening one too, and keeps the map counted as moved (e2e race)', () => {
    const runs: (number | undefined)[] = [];
    const run = (z?: number) => (runs.push(z), true);
    // The camera's code loading keeps the page busy: the player's drag (t 150) reaches the map before the overlay
    // frame that sees the opening request (t 100). The opening is dropped, and the live reveal after it too.
    const g = new RevealGate();
    g.moved(150);
    g.step(view({ reveal: nextReveal(), revealAt: 100, pose: null }), false, run);
    expect(runs).toHaveLength(0);
    expect(g.wasMoved).toBe(true);
    g.step(view({ reveal: nextReveal(), revealAt: 2000, auto: true }), false, run);
    expect(runs).toHaveLength(0);
    // A drag before the camera was asked for (t 50, asked at 100): the opening is carried out, then the live one.
    const g2 = new RevealGate();
    g2.moved(50);
    g2.step(view({ reveal: nextReveal(), revealAt: 100, pose: null }), false, run);
    expect(runs).toHaveLength(1);
    expect(g2.wasMoved).toBe(false);
    g2.step(view({ reveal: nextReveal(), revealAt: 2000, auto: true }), false, run);
    expect(runs).toHaveLength(2);
    // A move noticed only by where the map is (no time) does not outdate the request, but still the live reveal.
    const g3 = new RevealGate();
    g3.step(view({ reveal: nextReveal(), revealAt: 100, pose: null }), false, run);
    expect(runs).toHaveLength(3);
    g3.moved();
    g3.step(view({ reveal: nextReveal(), revealAt: 2000, auto: true }), false, run);
    expect(runs).toHaveLength(3);
    // A change of size after the move (t 2500 against the move noticed): carried out.
    g3.step(view({ reveal: nextReveal(), revealAt: 2500 }), false, run);
    expect(runs).toHaveLength(4);
    // A request asked in the same frame as a later move by the game (a focus at 3001) is dropped too.
    g3.moved(3001);
    g3.step(view({ reveal: nextReveal(), revealAt: 3000 }), false, run);
    expect(runs).toHaveLength(4);
  });

  it('drops "Näita kaardil" when the map was moved after the press, not when before', () => {
    const g = new RevealGate();
    const runs: (number | undefined)[] = [];
    const run = (z?: number) => (runs.push(z), true);
    const v = view();
    showCameraCone(v);
    g.moved(1000);
    expect(showCameraOnMap('i1', 900)).toBe(true);
    g.step(v, false, run);
    expect(runs).toEqual([]);
    expect(g.wasMoved).toBe(true);
    expect(showCameraOnMap('i1', 1100)).toBe(true);
    g.step(v, false, run);
    expect(runs).toEqual([ASK_ZOOM]);
  });

  it('keeps a reveal that came while the map had no size, and carries it out when it has one', () => {
    const g = new RevealGate();
    let sized = false;
    let runs = 0;
    const run = () => (runs++, sized);
    const v = view({ reveal: nextReveal(), auto: true });
    g.step(v, false, run);
    g.step(v, false, run);
    expect(runs).toBe(2);
    sized = true;
    g.step(v, false, run);
    expect(runs).toBe(3);
    g.step(v, false, run);
    expect(runs).toBe(3);
    // A move before the hidden tab's wait still counts against the live reveal.
    const g2 = new RevealGate();
    g2.moved();
    sized = false;
    const w = view({ reveal: nextReveal(), auto: true });
    g2.step(w, false, run);
    expect(g2.wasMoved).toBe(true);
  });

  it('uses up a reveal while following a unit or folded, without moving', () => {
    const g = new RevealGate();
    let runs = 0;
    const run = () => (runs++, true);
    const n = nextReveal();
    g.step(view({ reveal: n }), true, run);
    g.step(view({ reveal: n }), false, run);
    expect(runs).toBe(0);
    g.step(view({ reveal: nextReveal(), shown: false }), false, run);
    expect(runs).toBe(0);
  });

  it('"Näita kaardil" goes to the open camera of that incident only, from zoom 15', () => {
    expect(showCameraOnMap('i1')).toBe(false);
    const g = new RevealGate();
    const runs: (number | undefined)[] = [];
    const run = (z?: number) => (runs.push(z), true);
    const v = view();
    showCameraCone(v);
    expect(showCameraOnMap('other')).toBe(false);
    const before = cameraAsks();
    expect(showCameraOnMap('i1')).toBe(true);
    expect(cameraAsks()).toBe(before + 1);
    g.step(v, false, run);
    expect(runs).toEqual([ASK_ZOOM]);
    g.step(v, false, run);
    expect(runs).toEqual([ASK_ZOOM]);
    // Folded, or no place on the map: the button shows the incident as it would without a camera.
    showCameraCone(view({ shown: false }));
    expect(showCameraOnMap('i1')).toBe(false);
    showCameraCone(view({ pose: null }));
    expect(showCameraOnMap('i1')).toBe(false);
  });
});

describe('where the camera is opened', () => {
  const inc = { id: 'i1', source: 'call', location: { coord: [24.75, 59.43] as LngLat, placeKind: 'gasstation', address: 'x', city: 'Tallinn', zone: 'mainland' } } as unknown as Incident;

  it("is the map's marker: on the place's building or road once the road data knows", () => {
    const moved: LngLat = [24.7511, 59.4302];
    expect(markerCoord({ incidentCoord: () => moved }, inc, 0)).toEqual(moved);
  });

  it("falls back to the incident's own coordinates", () => {
    // Still being looked up, no road data, broken, or nonsense.
    expect(markerCoord({ incidentCoord: () => null }, inc, 0)).toEqual(inc.location.coord);
    expect(markerCoord(null, inc, 0)).toEqual(inc.location.coord);
    expect(
      markerCoord(
        {
          incidentCoord: () => {
            throw new Error('x');
          },
        },
        inc,
        0,
      ),
    ).toEqual(inc.location.coord);
    expect(markerCoord({ incidentCoord: () => [Number.NaN, 59] }, inc, 0)).toEqual(inc.location.coord);
  });
});

describe('the cone on the map', () => {
  it('is an overlay source of every style, with its layers in the base map theme, valid', () => {
    expect(OVERLAY_SOURCES).toContain(SRC.camera);
    const fc = buildCameraCone(pose(), 1, 0, { marker: offsetM(AT, 270, 150), place: 'Tamoil' });
    for (const key of MAP_STYLE_KEYS) {
      const style = buildStyle(key, { base: 'https://example.test/epd/', cinematic: false, heat: false, overlays: { [SRC.camera]: fc } });
      expect(validateStyleMin(style)).toEqual([]);
      expect((style.sources[SRC.camera] as { data: unknown }).data).toBe(fc);
      const layers = style.layers.filter((l) => 'source' in l && l.source === SRC.camera);
      expect(layers.map((l) => l.id)).toEqual(CAMERA_LAYERS);
      const fill = layers.find((l) => l.id === 'camera-cone') as { paint: Record<string, unknown> };
      expect(fill.paint['fill-color']).toBe(CAMERA_CONE[key].color);
      // Under the routes and the markers' layers, above the base map: the routes come after the cone.
      const ids = style.layers.map((l) => l.id);
      expect(ids.indexOf('camera-cone')).toBeLessThan(ids.indexOf('routes-casing'));
      expect(ids.indexOf('camera-at')).toBeGreaterThan(ids.indexOf('routes-line'));
      // The line from the marker: thin, dashed, in the cone's colour; the place's name in a font the map serves, in
      // the cone's colour with the base map's halo.
      const link = layers.find((l) => l.id === 'camera-link') as { type: string; paint: Record<string, unknown> };
      expect(link.type).toBe('line');
      expect(link.paint['line-color']).toBe(CAMERA_CONE[key].color);
      expect(link.paint['line-dasharray']).toBeDefined();
      const label = layers.find((l) => l.id === 'camera-label') as { type: string; layout: Record<string, unknown>; paint: Record<string, unknown> };
      expect(label.type).toBe('symbol');
      for (const f of label.layout['text-font'] as string[]) expect(ALLOWED_FONTS).toContain(f);
      expect(label.paint['text-color']).toBe(CAMERA_CONE[key].color);
      expect(label.paint['text-halo-color']).toBe(CAMERA_CONE[key].halo);
      expect(style.glyphs).toContain('glyphs/');
    }
    // Hidden in cinematic shots, like the routes.
    const cine = buildStyle('dark', { base: 'https://example.test/epd/', cinematic: true, heat: false });
    for (const id of CAMERA_LAYERS) expect((cine.layers.find((l) => l.id === id) as { layout?: { visibility?: string } }).layout?.visibility).toBe('none');
  });
});
