import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  ALLOWED_FONTS,
  buildStyle,
  HEAT_LAYER,
  isRasterSource,
  LABEL_LAYERS,
  MAP_STYLE_KEYS,
  OVERLAY_SOURCES,
  RASTER_SERVICES,
  ROUTE_LAYERS,
  SRC,
  type LayerSpecification,
} from '@/map/style';
import { geoData, TALLINN_DISTRICTS } from '@/map/geodata';
import { buildRoutes, circlePolygon, declutterOffsets, remainingPath } from '@/map/overlays';
import { solarAltitude, tintFor } from '@/map/atmosphere';
import type { LngLat, SimState, Unit } from '@/sim/types';

const BASE = 'https://example.test/epd/';

/** Collect every text-font stack used anywhere in a layer (incl. inside expressions). */
function fontStacks(layer: LayerSpecification): string[][] {
  const layout = (layer as { layout?: Record<string, unknown> }).layout;
  const tf = layout?.['text-font'];
  if (!tf) return [];
  const out: string[][] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      if (v.length && v.every((x) => typeof x === 'string') && !['literal', 'get', 'match', 'case'].includes(v[0] as string)) out.push(v as string[]);
      else v.forEach(walk);
    }
  };
  walk(tf);
  return out;
}

describe('buildStyle', () => {
  for (const key of MAP_STYLE_KEYS) {
    describe(key, () => {
      const style = buildStyle(key, { base: BASE });

      it('is a valid maplibre style', () => {
        const errors = validateStyleMin(style as never);
        expect(errors.map((e) => e.message)).toEqual([]);
      });

      it('has unique layer ids', () => {
        const ids = style.layers.map((l) => l.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('references only existing sources', () => {
        for (const l of style.layers) {
          const src = (l as { source?: string }).source;
          if (l.type === 'background') continue;
          expect(src, l.id).toBeTruthy();
          expect(style.sources[src!], `${l.id} → ${src}`).toBeDefined();
        }
      });

      it('serves glyphs from the app base', () => {
        expect(style.glyphs).toContain(BASE);
        expect(style.glyphs).toContain('{fontstack}');
        expect(style.glyphs).toContain('{range}');
      });

      it('uses only the bundled font stacks', () => {
        for (const l of style.layers) {
          for (const stack of fontStacks(l)) {
            for (const f of stack) expect(ALLOWED_FONTS, `${l.id}: ${f}`).toContain(f);
          }
        }
      });

      it('has raster sources only for online styles', () => {
        const rasterSources = Object.entries(style.sources).filter(([, s]) => s.type === 'raster');
        if (key === 'tactical') {
          expect(rasterSources).toHaveLength(0);
          expect(style.layers.some((l) => l.type === 'raster')).toBe(false);
        } else {
          expect(rasterSources.length).toBe(RASTER_SERVICES[key].length);
          for (const [id, s] of rasterSources) {
            expect(isRasterSource(id)).toBe(true);
            expect((s as { tiles: string[] }).tiles.every((u) => u.startsWith('https://'))).toBe(true);
          }
          // Attribution is present for the raster base.
          expect(rasterSources.some(([, s]) => !!(s as { attribution?: string }).attribution)).toBe(true);
          // The raster sits above the land but below the tactical roads.
          const idx = (id: string) => style.layers.findIndex((l) => l.id === id);
          expect(idx('raster')).toBeGreaterThan(idx('land-fill'));
          expect(idx('raster')).toBeLessThan(idx('roads-major'));
        }
      });

      it('keeps the offline tactical layers and overlay sources', () => {
        for (const id of [SRC.land, SRC.neighbors, SRC.roads, SRC.settlements, ...OVERLAY_SOURCES]) expect(style.sources[id]).toBeDefined();
        for (const id of ['land-fill', 'roads-major', 'routes-line', 'search-fill', 'pursuit-trail', 'stations-icon', HEAT_LAYER])
          expect(style.layers.some((l) => l.id === id), id).toBe(true);
      });
    });
  }

  it('hides labels in cinematic mode and toggles heat', () => {
    const s = buildStyle('tactical', { base: BASE, cinematic: true, heat: true });
    for (const id of [...LABEL_LAYERS, ...ROUTE_LAYERS]) {
      const l = s.layers.find((x) => x.id === id) as { layout?: { visibility?: string } };
      expect(l?.layout?.visibility, id).toBe('none');
    }
    const heat = s.layers.find((x) => x.id === HEAT_LAYER) as { layout?: { visibility?: string } };
    expect(heat.layout?.visibility).toBe('visible');
    const off = buildStyle('tactical', { base: BASE });
    expect((off.layers.find((x) => x.id === HEAT_LAYER) as { layout?: { visibility?: string } }).layout?.visibility).toBe('none');
  });

  it('hides tactical roads at z ≥ 11 on online styles only', () => {
    const roadMax = (k: (typeof MAP_STYLE_KEYS)[number]) =>
      (buildStyle(k, { base: BASE }).layers.find((l) => l.id === 'roads-major') as { maxzoom?: number }).maxzoom ?? 24;
    expect(roadMax('tactical')).toBeGreaterThan(18);
    expect(roadMax('dark')).toBe(11);
    expect(roadMax('foto')).toBe(11);
  });

  it('accepts a base without a trailing slash', () => {
    expect(buildStyle('tactical', { base: '/epd' }).glyphs).toBe('/epd/glyphs/{fontstack}/{range}.pbf');
  });

  it('passes current overlay data through', () => {
    const fc = { type: 'FeatureCollection' as const, features: [] };
    const s = buildStyle('dark', { base: BASE, overlays: { [SRC.routes]: fc } });
    expect((s.sources[SRC.routes] as { data: unknown }).data).toBe(fc);
  });
});

describe('geodata', () => {
  const g = geoData();
  it('keeps only the eight Tallinn districts', () => {
    const names = g.districts.features.map((f) => f.properties.name).sort();
    expect(names).toEqual([...TALLINN_DISTRICTS].sort());
  });
  it('has Tallinn and other major cities as linn labels', () => {
    const linn = g.settlements.features.filter((f) => f.properties.kind === 'linn').map((f) => f.properties.name);
    for (const n of ['Tallinn', 'Tartu', 'Narva', 'Pärnu', 'Kuressaare', 'Kohtla-Järve']) expect(linn).toContain(n);
    expect(linn.filter((n) => n === 'Tallinn')).toHaveLength(1);
  });
  it('derives internal county boundaries', () => {
    const lines = g.countyLines.features[0].geometry.coordinates;
    expect(lines.length).toBeGreaterThan(10);
  });
  it('drops null rail geometries', () => {
    expect(g.rail.features.every((f) => f.geometry)).toBe(true);
  });
});

describe('overlay helpers', () => {
  it('builds a closed 64-gon of the right radius', () => {
    const ring = circlePolygon([24.75, 59.43], 2);
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    const kmPerDegLat = 111.2;
    expect(Math.abs(ring[0][1] - 59.43) * kmPerDegLat).toBeCloseTo(2, 1);
  });

  const unit = (over: Partial<Unit> = {}): Unit =>
    ({
      id: 'u1',
      callsign: 'Põhja 21',
      type: 'patrol',
      stationId: 's',
      zone: 'mainland',
      vehicle: 'Škoda',
      crew: [],
      status: 'enroute',
      statusSince: 0,
      pos: [24, 59],
      heading: 0,
      fatigue: 0,
      breaks: 0,
      handled: 0,
      move: { purpose: 'incident', path: [[24, 59], [24.1, 59], [24.2, 59]], cum: [0, 5.7, 11.4], departAt: 0, arriveAt: 1000, siren: true },
      ...over,
    }) as Unit;

  it('returns the remaining part of a path', () => {
    const u = unit();
    const cur: LngLat = [24.12, 59];
    expect(remainingPath(u, 600, cur)).toEqual([cur, [24.2, 59]]);
    expect(remainingPath(u, 100, [24.01, 59])).toEqual([[24.01, 59], [24.1, 59], [24.2, 59]]);
    expect(remainingPath(u, 1000, cur)).toEqual([]);
  });

  it('builds routes for the selected incident and unit', () => {
    const u1 = unit({ incidentId: 'i1' });
    const u2 = unit({ id: 'u2', incidentId: undefined });
    const s = {
      now: 500,
      unitOrder: ['u1', 'u2'],
      units: { u1: u1, u2: u2 },
      incidents: { i1: { id: 'i1', state: 'dispatched', assigned: ['u1'] } },
    } as unknown as SimState;
    const fc = buildRoutes(s, (u) => ({ pos: u.pos, heading: 0 }), 'i1', 'u2');
    expect(fc.features.map((f) => [f.properties?.id, f.properties?.kind])).toEqual([
      ['u1', 'incident'],
      ['u2', 'selected'],
    ]);
  });

  it('fans out stacked stationary units', () => {
    const off = declutterOffsets([
      { id: 'a', pos: [24, 59], moving: false },
      { id: 'b', pos: [24, 59], moving: false },
      { id: 'c', pos: [25, 59], moving: false },
      { id: 'd', pos: [24, 59], moving: true },
      { id: 'e', pos: [26, 59], moving: false, scene: 'i1' },
    ]);
    expect(off.has('a') && off.has('b')).toBe(true);
    expect(off.get('a')).not.toEqual(off.get('b'));
    expect(off.has('c')).toBe(false);
    expect(off.has('d')).toBe(false);
    expect(off.has('e')).toBe(true);
  });
});

describe('atmosphere', () => {
  it('computes plausible solar altitudes for Tallinn', () => {
    // Midsummer noon (≈ 13:20 local, 10:20 UTC) ≈ 54°, midwinter midnight well below the horizon.
    expect(solarAltitude(Date.UTC(2026, 5, 21, 10, 20), 59.44, 24.75)).toBeGreaterThan(50);
    expect(solarAltitude(Date.UTC(2026, 11, 21, 22, 0), 59.44, 24.75)).toBeLessThan(-40);
  });
  it('tints night fully and day not at all', () => {
    expect(tintFor(30)).toEqual({ night: 0, dusk: 0 });
    expect(tintFor(-20).night).toBe(1);
    expect(tintFor(-3).dusk).toBeGreaterThan(0);
  });
});
