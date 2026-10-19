import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { REGIONS } from '@/data/regions';
import { AREA_DIM, AREA_LAYERS, buildStyle, LABEL_LAYERS, MAP_STYLE_KEYS, OVERLAY_SOURCES, SRC } from '@/map/style';
import { buildStations } from '@/map/overlays';
import {
  areaKey,
  areaStationIds,
  buildArea,
  closeRing,
  distToRing,
  insideGeometry,
  labelPoint,
  maskGeometry,
  pointInRing,
  ringBounds,
  rimLabelPoint,
  shiftArea,
  signedArea,
  unionRings,
  wind,
  type Ring,
} from '@/map/area';
import { areaStations, neighbourSectors, sectorOutlines, sectorsOf, starterSectors } from '@/sim/sectors';
import type { LngLat } from '@/sim/types';

const BASE = 'https://example.test/epd/';

/** Axis-aligned square ring (closed, counter-clockwise). */
const square = (x: number, y: number, w: number, h = w): Ring => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];

/** True when the mask (MultiPolygon coordinates) covers the point with the even-odd rule per polygon. */
function masked(mask: LngLat[][][], p: LngLat): boolean {
  return mask.some((poly) => pointInRing(p, poly[0]) && !poly.slice(1).some((h) => pointInRing(p, h)));
}

describe('ring helpers', () => {
  it('opens, closes, winds and measures rings', () => {
    const sq = square(0, 0, 2);
    expect(closeRing(sq.slice(0, -1))).toEqual(sq);
    expect(closeRing(sq)).toEqual(sq);
    expect(signedArea(sq)).toBeCloseTo(4);
    expect(signedArea(wind(sq, false))).toBeCloseTo(-4);
    expect(signedArea(wind([...sq].reverse(), true))).toBeCloseTo(4);
    expect(pointInRing([1, 1], sq)).toBe(true);
    expect(pointInRing([3, 1], sq)).toBe(false);
    expect(ringBounds(sq)).toEqual([
      [0, 0],
      [2, 2],
    ]);
  });

  it('keeps rings whose boxes do not touch as they are', () => {
    const a = square(24, 58, 0.2);
    const b = square(25, 58, 0.2);
    expect(unionRings([a, b])).toEqual([a, b]);
    expect(unionRings([a])).toEqual([a]);
    expect(unionRings([])).toEqual([]);
  });

  it('merges overlapping rings into one outline that covers both', () => {
    const a = square(26.6, 58.3, 0.3);
    const b = square(26.8, 58.4, 0.3);
    const loops = unionRings([a, b]);
    expect(loops).toHaveLength(1);
    const loop = loops[0];
    expect(loop[0]).toEqual(loop[loop.length - 1]);
    for (const p of [
      [26.65, 58.35],
      [27.05, 58.65],
      [26.85, 58.5],
    ] as LngLat[])
      expect(pointInRing(p, loop), String(p)).toBe(true);
    for (const p of [
      [26.65, 58.65],
      [27.05, 58.33],
      [26.4, 58.5],
    ] as LngLat[])
      expect(pointInRing(p, loop), String(p)).toBe(false);
    // The traced outline stays close to the true union area (0.09 + 0.09 - 0.02 = 0.16 deg²).
    expect(Math.abs(signedArea(loop))).toBeGreaterThan(0.155);
    expect(Math.abs(signedArea(loop))).toBeLessThan(0.165);
    // ... and keeps the corners: eight of them, no staircase.
    expect(loop.length).toBeLessThanOrEqual(12);
  });

  it('swallows a ring inside another one (a city sector inside its county)', () => {
    const county = square(26, 58, 1);
    const city = square(26.4, 58.4, 0.2);
    const loops = unionRings([county, city]);
    expect(loops).toHaveLength(1);
    expect(pointInRing([26.5, 58.5], loops[0])).toBe(true);
  });

  it('builds a mask that dims everything but the area, gaps included', () => {
    const ring = square(26, 58, 1);
    const mask = maskGeometry([ring]);
    expect(mask).toHaveLength(1);
    expect(masked(mask, [26.5, 58.5])).toBe(false);
    expect(masked(mask, [25, 58.5])).toBe(true);
    expect(masked(mask, [30, 60])).toBe(true);
    // Outer rings counter-clockwise, holes clockwise (maplibre classifies rings by winding).
    expect(signedArea(mask[0][0])).toBeGreaterThan(0);
    expect(signedArea(mask[0][1])).toBeLessThan(0);
    // A ring of coverage with a gap in the middle: the gap is dimmed again.
    const inner = wind(square(26.3, 58.3, 0.4), false);
    const nested = maskGeometry([ring, inner]);
    expect(nested).toHaveLength(2);
    expect(masked(nested, [26.5, 58.5])).toBe(true);
    expect(masked(nested, [26.1, 58.1])).toBe(false);
    expect(signedArea(nested[1][0])).toBeGreaterThan(0);
  });

  it('puts a label inside the ring and clear of the area', () => {
    const county = square(26, 58, 1);
    const city = square(26.35, 58.35, 0.3);
    const at = labelPoint(county, [city]);
    expect(at).not.toBeNull();
    expect(pointInRing(at!, county)).toBe(true);
    expect(pointInRing(at!, city)).toBe(false);
    expect(labelPoint(city, [county])).toBeNull();
    expect(labelPoint([[1, 1]])).toBeNull();
  });
});

describe('neighbour labels and the lit area', () => {
  it('puts a neighbour label just across the border, inside the neighbour', () => {
    const area = square(26.4, 58.4, 0.2);
    const county = square(26, 58, 1);
    const at = rimLabelPoint([county], [area]);
    expect(at).not.toBeNull();
    expect(pointInRing(at!, county)).toBe(true);
    expect(pointInRing(at!, area)).toBe(false);
    // Near the edge: well within the camera's padding around the area.
    const d = distToRing(at!, area);
    expect(d).toBeGreaterThan(0.004);
    expect(d).toBeLessThan(0.06);
    // A second label keeps its distance from the first.
    const next = rimLabelPoint([county], [area], [at!]);
    expect(Math.hypot(next![0] - at![0], next![1] - at![1])).toBeGreaterThan(0.03);
    // A neighbour far away: no spot near the area.
    expect(rimLabelPoint([square(30, 58, 0.5)], [area])).toBeNull();
    expect(rimLabelPoint([], [area])).toBeNull();
  });

  it('lights the area itself, gaps left out', () => {
    const ring = square(26, 58, 1);
    const inner = square(26.3, 58.3, 0.4);
    const polys = insideGeometry([ring, inner]);
    expect(polys).toHaveLength(1);
    expect(signedArea(polys[0][0])).toBeGreaterThan(0);
    expect(signedArea(polys[0][1])).toBeLessThan(0);
    expect(masked(polys, [26.1, 58.1])).toBe(true);
    expect(masked(polys, [26.5, 58.5])).toBe(false);
    expect(insideGeometry([])).toEqual([]);
  });
});

describe('shift area', () => {
  it('names the area once and ignores junk', () => {
    expect(areaKey(null)).toBe('');
    expect(areaKey({})).toBe('');
    expect(areaKey({ sectors: [] , coverSectors: ['x'] })).toBe('');
    expect(areaKey({ sectors: ['a', 'b'], coverSectors: ['c'] })).toBe('a,b|c');
    expect(shiftArea({ sectors: ['a', 'a', ''], coverSectors: ['a', 'c', 'c'] })).toEqual({ sectors: ['a'], cover: ['c'] });
  });

  it('is empty for a whole-prefecture shift', () => {
    expect(buildArea(REGIONS.louna, { sectors: [], cover: [] }, 'et').features).toHaveLength(0);
    expect(buildArea(undefined, { sectors: ['x'], cover: [] }, 'et').features).toHaveLength(0);
  });

  it('marks the area stations and fades the rest', () => {
    const r = REGIONS.louna;
    const ids = areaStationIds(r, [r.stations[0]], ['lo-viljandi']);
    expect(ids.has(r.stations[0].id)).toBe(true);
    expect(ids.has('lo-viljandi')).toBe(true);
    expect(ids.has(r.arrestHouseId)).toBe(true);
    const fc = buildStations(r, 'et', ids);
    const areaOf = (id: string) => fc.features.find((f) => f.properties?.id === id)?.properties?.area;
    expect(areaOf('lo-viljandi')).toBe(1);
    expect(areaOf('lo-valga')).toBe(-1);
    expect(buildStations(r, 'et').features.every((f) => f.properties?.area === 0)).toBe(true);
  });
});

describe('map style with an area', () => {
  for (const key of MAP_STYLE_KEYS) {
    it(`${key}: has the area source and layers between the base map and the overlays`, () => {
      const style = buildStyle(key, { base: BASE });
      expect(validateStyleMin(style as never)).toEqual([]);
      expect(style.sources[SRC.area]).toBeDefined();
      expect(OVERLAY_SOURCES).toContain(SRC.area);
      const idx = (id: string) => style.layers.findIndex((l) => l.id === id);
      for (const id of AREA_LAYERS) expect(idx(id), id).toBeGreaterThan(-1);
      expect(idx('area-mask')).toBeLessThan(idx('heat'));
      expect(idx('area-mask')).toBeLessThan(idx('routes-line'));
      expect(idx('area-mask')).toBeLessThan(idx('stations-icon'));
      expect(idx('area-label')).toBeGreaterThan(idx('label-city-major'));
      const mask = style.layers.find((l) => l.id === 'area-mask') as { paint: Record<string, unknown> };
      expect(mask.paint['fill-opacity']).toBe(AREA_DIM[key].opacity);
    });
  }

  it('hides the neighbour labels in cinematic mode', () => {
    expect(LABEL_LAYERS).toContain('area-label');
    const s = buildStyle('tactical', { base: BASE, cinematic: true });
    const l = s.layers.find((x) => x.id === 'area-label') as { layout?: { visibility?: string } };
    expect(l.layout?.visibility).toBe('none');
  });
});

// Against the real sector data (docs/SECTORS.md), once src/data/sectors.ts has it.
const HAS_DATA = sectorsOf('louna').length > 0;

describe.skipIf(!HAS_DATA)('the area with the real sectors', () => {
  it('dims everything outside Tartu linn and labels its neighbours with their colleague', () => {
    const r = REGIONS.louna;
    const tartu = starterSectors('louna').find((x) => /tartu/i.test(x.id) && /linn|city/i.test(`${x.name.et} ${x.name.en}`)) ?? starterSectors('louna')[0];
    const fc = buildArea(r, { sectors: [tartu.id], cover: [] }, 'et');
    const mask = fc.features.find((f) => f.properties?.kind === 'mask');
    expect(mask).toBeDefined();
    const coords = (mask!.geometry as unknown as { coordinates: LngLat[][][] }).coordinates;
    const ring = sectorOutlines(r, [tartu.id])[0].ring;
    const inside = labelPoint(ring) ?? ring[0];
    expect(masked(coords, inside)).toBe(false);
    expect(masked(coords, [26.0, 58.9])).toBe(true);
    const labels = fc.features.filter((f) => f.properties?.kind === 'label');
    expect(labels.length).toBeGreaterThan(0);
    const near = neighbourSectors([tartu.id]);
    for (const l of labels) {
      const n = near.find((x) => x.id === l.properties?.id);
      expect(n, String(l.properties?.id)).toBeDefined();
      expect(l.properties?.colleague).toBe(`${n!.colleague.firstName} ${n!.colleague.lastName}`);
    }
    expect(areaStations(r, [tartu.id]).length).toBeGreaterThan(0);
    // The labels sit near the area, where the camera fitted to it shows them.
    const [[w, s], [e, n]] = ringBounds(ring);
    const size = Math.max((e - w) * Math.cos((s * Math.PI) / 180), n - s);
    for (const l of labels) expect(distToRing((l.geometry as unknown as { coordinates: LngLat }).coordinates, ring)).toBeLessThan(size * 0.3);
    expect(fc.features.some((f) => f.properties?.kind === 'inside')).toBe(true);
    // Night cover: its own tint and outline, inside the lit area.
    const night = tartu.neighbours[0];
    const withCover = buildArea(r, { sectors: [tartu.id], cover: [night] }, 'et');
    const kinds = withCover.features.filter((f) => f.properties?.id === night).map((f) => f.properties?.kind);
    expect(kinds).toContain('coverFill');
    expect(kinds).toContain('cover');
    expect(withCover.features.some((f) => f.properties?.kind === 'label' && f.properties?.id === night)).toBe(false);
  });

  it('builds a valid mask for every prefecture, starter sector and pair of neighbours', () => {
    for (const id of ['pohja', 'ida', 'louna', 'laane'] as const) {
      const r = REGIONS[id];
      for (const s of sectorsOf(id)) {
        const ids = [s.id, ...s.neighbours.slice(0, 1)];
        const fc = buildArea(r, { sectors: ids, cover: [] }, 'en');
        const mask = fc.features.find((f) => f.properties?.kind === 'mask');
        expect(mask, `${id} ${ids}`).toBeDefined();
        const polys = (mask!.geometry as unknown as { coordinates: LngLat[][][] }).coordinates;
        for (const poly of polys) for (const ring of poly) expect(ring.length, `${id} ${ids}`).toBeGreaterThanOrEqual(4);
      }
    }
  });
});
