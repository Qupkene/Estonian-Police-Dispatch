/**
 * Kaamerad on the map (src/map/cameraCone.ts, docs/CCTV.md section 14): the open camera's view cone, from the pose
 * the camera gives (where it hangs, which way it looks, how wide and how far) and the window's zoom and pan; how the
 * map brings it into view without throwing the player's own view about; the marker coordinate the camera is opened
 * at; and the cone's layers on every base map.
 */
import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  buildCameraCone,
  CONE_MIN_PX,
  coneEdges,
  freeBox,
  markerCoord,
  metresPerPx,
  offsetM,
  revealPlan,
  revealPoints,
  REVEAL_MAX_ZOOM,
  type CameraPose,
} from '@/map/cameraCone';
import { buildStyle, CAMERA_CONE, CAMERA_LAYERS, MAP_STYLE_KEYS, OVERLAY_SOURCES, SRC } from '@/map/style';
import type { Incident, LngLat } from '@/sim/types';

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
  const view = { marker: offsetM(AT, 80, 25), pose: pose(), zoom: 1, panX: 0 };
  const points = revealPoints(view);
  /** The window in the top right corner: the free part is to its left. */
  const cover = { x: W - 460, y: 12, w: 448, h: 400 };

  it('keeps clear of the window: the largest strip beside it, below it on a phone', () => {
    expect(freeBox(W, H, cover)).toEqual({ x: 0, y: 0, w: W - 460, h: H });
    expect(freeBox(390, 700, { x: 0, y: 0, w: 390, h: 260 })).toEqual({ x: 0, y: 260, w: 390, h: 440 });
    expect(freeBox(W, H, null)).toEqual({ x: 0, y: 0, w: W, h: H });
  });

  it('does not move when the cone and the marker already show beside the window, big enough', () => {
    const free = freeBox(W, H, cover);
    // Centred in the free part at zoom 17.5: about 186 px of reach.
    const c: LngLat = offsetM(AT, 90, ((W / 2 - free.w / 2) * metresPerPx(17.5, AT[1])) - 18);
    expect(revealPlan({ points, shown: points.map(project(c, 17.5)), reach: 40, zoom: 17.5, width: W, height: H, free })).toBeNull();
  });

  it('eases to the free part when the cone is under the window, keeping the zoom', () => {
    const free = freeBox(W, H, cover);
    const c = offsetM(AT, 270, 140 * metresPerPx(17.5, AT[1]));
    const plan = revealPlan({ points, shown: points.map(project(c, 17.5)), reach: 40, zoom: 17.5, width: W, height: H, free })!;
    expect(plan).not.toBeNull();
    expect(plan.zoom).toBe(17.5);
    expect(plan.offset).toEqual([free.w / 2 - W / 2, 0]);
    // The middle of what must show.
    expect(polar(plan.center).d).toBeLessThan(40);
  });

  it('comes closer when the cone is too small to see, no further than needed', () => {
    const free = freeBox(W, H, cover);
    const plan = revealPlan({ points, shown: points.map(project(AT, 14)), reach: 40, zoom: 14, width: W, height: H, free })!;
    expect(40 / metresPerPx(plan.zoom, AT[1])).toBeCloseTo(CONE_MIN_PX, 3);
    expect(plan.zoom).toBeLessThanOrEqual(REVEAL_MAX_ZOOM);
  });

  it('steps back when the cone does not fit at the zoom the player chose', () => {
    const free = freeBox(W, H, cover);
    const plan = revealPlan({ points, shown: points.map(project(AT, 18.4)), reach: 40, zoom: 18.4, width: W, height: H, free })!;
    expect(plan.zoom).toBeLessThan(18.4);
    const at = project(plan.center, plan.zoom);
    for (const p of points) {
      const [x, y] = at(p);
      expect(x + plan.offset[0]).toBeGreaterThanOrEqual(free.x);
      expect(x + plan.offset[0]).toBeLessThanOrEqual(free.x + free.w);
      expect(y + plan.offset[1]).toBeGreaterThanOrEqual(free.y);
      expect(y + plan.offset[1]).toBeLessThanOrEqual(free.y + free.h);
    }
  });

  it('before the picture is live only the marker counts: no zoom change for it', () => {
    const free = freeBox(W, H, cover);
    const marker = [view.marker];
    const c = offsetM(view.marker, 270, 200 * metresPerPx(14, AT[1]));
    const plan = revealPlan({ points: marker, shown: marker.map(project(c, 14)), reach: null, zoom: 14, width: W, height: H, free })!;
    expect(plan.zoom).toBe(14);
    expect(plan.center[0]).toBeCloseTo(view.marker[0], 9);
    expect(revealPlan({ points: marker, shown: marker.map(project(offsetM(view.marker, 90, 300 * metresPerPx(14, AT[1])), 14)), reach: null, zoom: 14, width: W, height: H, free })).toBeNull();
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
    const fc = buildCameraCone(pose());
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
    }
    // Hidden in cinematic shots, like the routes.
    const cine = buildStyle('dark', { base: 'https://example.test/epd/', cinematic: true, heat: false });
    for (const id of CAMERA_LAYERS) expect((cine.layers.find((l) => l.id === id) as { layout?: { visibility?: string } }).layout?.visibility).toBe('none');
  });
});
