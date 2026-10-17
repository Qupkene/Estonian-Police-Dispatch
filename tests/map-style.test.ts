import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  ALLOWED_FONTS,
  buildStyle,
  HEAT_LAYER,
  isRasterSource,
  isRasterStyle,
  isStreetSource,
  LABEL_LAYERS,
  MAP_STYLE_KEYS,
  OVERLAY_SOURCES,
  RASTER_SERVICES,
  ROUTE_LAYERS,
  SRC,
  STREET_PREFIX,
  STREET_TILES_PATH,
  streetTilesUrl,
  TACTICAL_ROADS_MAXZOOM,
  type LayerSpecification,
} from '@/map/style';
import { bundledFont, streetLayers } from '@/map/streetStyle';
import { knownStreetProbe, probeStreetTiles, resetStreetProbes } from '@/map/streetTiles';
import { geoData, TALLINN_DISTRICTS } from '@/map/geodata';
import { buildRoutes, circlePolygon, declutterOffsets, remainingPath } from '@/map/overlays';
import { solarAltitude, tintFor } from '@/map/atmosphere';
import type { LngLat, SimState, Unit } from '@/sim/types';

const BASE = 'https://example.test/epd/';

const OPERATORS = ['literal', 'get', 'has', 'match', 'case', 'step', 'coalesce', '==', '!=', 'in'];

/**
 * Collect every font stack used anywhere in a layer: the `text-font` layout property (incl. inside
 * expressions) and the `text-font` overrides of `format` sections inside `text-field`.
 */
function fontStacks(layer: LayerSpecification): string[][] {
  const out: string[][] = [];
  const stacks = (v: unknown) => {
    if (Array.isArray(v)) {
      if (v.length && v.every((x) => typeof x === 'string') && !OPERATORS.includes(v[0] as string)) out.push(v as string[]);
      else v.forEach(stacks);
    }
  };
  const findTextFont = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(findTextFont);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (k === 'text-font') stacks(x);
        else findTextFont(x);
      }
  };
  findTextFont((layer as { layout?: unknown }).layout);
  return out;
}

const idx = (style: { layers: LayerSpecification[] }, id: string) => style.layers.findIndex((l) => l.id === id);
const streetIds = (style: { layers: LayerSpecification[] }) => style.layers.filter((l) => l.id.startsWith(STREET_PREFIX));

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

      it('uses no CARTO (or any other keyed third-party street service)', () => {
        const json = JSON.stringify(style).toLowerCase();
        expect(json).not.toContain('carto');
        expect(json).not.toContain('api_key');
        expect(json).not.toContain('apikey');
      });

      it('draws no icon that the app does not provide (there is no sprite)', () => {
        expect(style.sprite).toBeUndefined();
        for (const l of style.layers) {
          const layout = (l as { layout?: Record<string, unknown> }).layout ?? {};
          const paint = (l as { paint?: Record<string, unknown> }).paint ?? {};
          if (l.id === 'stations-icon') continue; // drawn by MapController's missing-image resolver
          expect(layout['icon-image'], l.id).toBeUndefined();
          expect(paint['fill-pattern'], l.id).toBeUndefined();
          expect(paint['line-pattern'], l.id).toBeUndefined();
        }
      });

      it('has raster sources only for the Maa- ja Ruumiamet styles', () => {
        const rasterSources = Object.entries(style.sources).filter(([, s]) => s.type === 'raster');
        if (!isRasterStyle(key)) {
          expect(rasterSources).toHaveLength(0);
          expect(style.layers.some((l) => l.type === 'raster')).toBe(false);
        } else {
          expect(rasterSources.length).toBe(RASTER_SERVICES[key].length);
          for (const [id, s] of rasterSources) {
            expect(isRasterSource(id)).toBe(true);
            expect((s as { tiles: string[] }).tiles.every((u) => u.startsWith('https://tiles.maaamet.ee/'))).toBe(true);
          }
          // Attribution is present for the raster base.
          expect(rasterSources.some(([, s]) => !!(s as { attribution?: string }).attribution)).toBe(true);
          // The raster sits above the land but below the tactical roads.
          expect(idx(style, 'raster')).toBeGreaterThan(idx(style, 'land-fill'));
          expect(idx(style, 'raster')).toBeLessThan(idx(style, 'roads-major'));
        }
      });

      it('has the self-hosted street map only for "dark"', () => {
        const vector = Object.entries(style.sources).filter(([, s]) => s.type === 'vector');
        if (key !== 'dark') {
          expect(vector).toHaveLength(0);
          expect(streetIds(style)).toHaveLength(0);
          return;
        }
        expect(vector.map(([id]) => id)).toEqual([SRC.street]);
        expect(isStreetSource(SRC.street)).toBe(true);
        const src = style.sources[SRC.street] as { url?: string; tiles?: string[]; attribution?: string };
        expect(src.url).toBe(`pmtiles://${BASE}${STREET_TILES_PATH}`);
        expect(src.tiles).toBeUndefined();
        expect(src.attribution).toContain('OpenStreetMap');
        expect(src.attribution).toContain('Protomaps');
        expect(src.attribution?.replace(/<[^>]+>/g, '')).toBe('© OpenStreetMap contributors · Protomaps');
      });

      it('keeps every overlay above the base map', () => {
        const base = style.layers.filter((l) => l.type === 'raster' || l.id.startsWith(STREET_PREFIX)).map((l) => idx(style, l.id));
        const lastBase = Math.max(-1, ...base);
        for (const id of [HEAT_LAYER, 'search-fill', 'search-line', ...ROUTE_LAYERS, 'pursuit-glow', 'pursuit-trail', 'stations-halo', 'stations-icon', 'stations-label'])
          expect(idx(style, id), id).toBeGreaterThan(lastBase);
        // The tactical base stays underneath.
        const firstBase = Math.min(Infinity, ...base);
        for (const id of ['bg', 'neighbors-fill', 'land-fill', 'lakes-fill']) expect(idx(style, id), id).toBeLessThan(firstBase);
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

  it('hides the tactical roads where the base map has its own', () => {
    const maxOf = (k: (typeof MAP_STYLE_KEYS)[number], id: string) =>
      (buildStyle(k, { base: BASE }).layers.find((l) => l.id === id) as { maxzoom?: number }).maxzoom ?? 24;
    expect(maxOf('tactical', 'roads-major')).toBeGreaterThan(18);
    expect(maxOf('dark', 'roads-major')).toBe(TACTICAL_ROADS_MAXZOOM.dark);
    expect(TACTICAL_ROADS_MAXZOOM.dark).toBeLessThanOrEqual(10);
    expect(maxOf('foto', 'roads-major')).toBe(11);
    for (const id of ['roads-minor', 'roads-secondary', 'roads-major-glow', 'rail']) expect(maxOf('dark', id), id).toBe(TACTICAL_ROADS_MAXZOOM.dark);
    // The street map draws no ferries: the tactical ferry routes stay.
    expect(maxOf('dark', 'roads-ferry')).toBeGreaterThan(TACTICAL_ROADS_MAXZOOM.dark);
    // Tactical settlement labels give way to the street map's own place names.
    const dark = buildStyle('dark', { base: BASE });
    for (const id of ['label-city', 'label-city-major', 'label-village']) {
      const l = dark.layers.find((x) => x.id === id) as { layout?: { visibility?: string } };
      expect(l.layout?.visibility, id).toBe('none');
    }
    expect(dark.layers.some((l) => l.id === `${STREET_PREFIX}places_locality`)).toBe(true);
  });

  it('hides the street map labels in cinematic mode', () => {
    const s = buildStyle('dark', { base: BASE, cinematic: true });
    const labels = streetIds(s).filter((l) => l.type === 'symbol');
    expect(labels.length).toBeGreaterThan(3);
    for (const l of labels) expect((l as { layout?: { visibility?: string } }).layout?.visibility, l.id).toBe('none');
  });

  it('accepts a base without a trailing slash', () => {
    expect(buildStyle('tactical', { base: '/epd' }).glyphs).toBe('/epd/glyphs/{fontstack}/{range}.pbf');
    expect(streetTilesUrl('/epd')).toBe('/epd/tiles/estonia.pmtiles');
    expect(streetTilesUrl('https://politsei.eu/')).toBe('https://politsei.eu/tiles/estonia.pmtiles');
  });

  it('passes current overlay data through', () => {
    const fc = { type: 'FeatureCollection' as const, features: [] };
    const s = buildStyle('dark', { base: BASE, overlays: { [SRC.routes]: fc } });
    expect((s.sources[SRC.routes] as { data: unknown }).data).toBe(fc);
  });
});

describe('street map layers', () => {
  const { base, labels } = streetLayers();
  const all = [...base, ...labels];

  it('draws land, water, roads and buildings and names streets and places', () => {
    const ids = all.map((l) => l.id.slice(STREET_PREFIX.length));
    for (const id of ['earth', 'water', 'buildings', 'roads_minor', 'roads_major', 'roads_highway', 'roads_rail', 'roads_labels_minor', 'roads_labels_major', 'places_locality', 'places_subplace', 'water_label_lakes'])
      expect(ids, id).toContain(id);
    expect(base.every((l) => l.type !== 'symbol')).toBe(true);
    expect(labels.every((l) => l.type === 'symbol')).toBe(true);
  });

  it('drops the background, boundaries and every sprite-only layer', () => {
    const ids = all.map((l) => l.id.slice(STREET_PREFIX.length));
    for (const id of ['background', 'landcover', 'boundaries', 'boundaries_country', 'roads_oneway', 'roads_shields', 'pois']) expect(ids).not.toContain(id);
  });

  it('labels in Estonian and never needs a non-Latin glyph range', () => {
    const json = JSON.stringify(labels);
    expect(json).toContain('name:et');
    expect(json).not.toContain('Noto Sans Devanagari');
    const loc = labels.find((l) => l.id === `${STREET_PREFIX}places_locality`) as { layout: Record<string, unknown> };
    const tf = loc.layout['text-field'] as unknown[];
    expect(tf[0]).toBe('case');
    expect(JSON.stringify(tf[1])).toContain('"script"');
    expect(loc.layout['icon-image']).toBeUndefined();
    // Every label that shows a name or a ref falls back to a Latin name for non-Latin features.
    for (const l of labels) {
      const field = JSON.stringify((l as { layout: Record<string, unknown> }).layout['text-field']);
      if (/"(name|ref)[":]/.test(field)) expect(field, l.id).toContain('["has","script"]');
    }
    const region = labels.find((l) => l.id === `${STREET_PREFIX}places_region`) as { layout: Record<string, unknown> };
    const step = region.layout['text-field'] as unknown[];
    expect(step[0]).toBe('step');
    expect(JSON.stringify(step[2])).toContain('"script"');
  });

  it('fades the street land and water in so the tactical overview shows when zoomed out', () => {
    for (const id of ['earth', 'water']) {
      const l = base.find((x) => x.id === `${STREET_PREFIX}${id}`) as { paint: Record<string, unknown> };
      expect(Array.isArray(l.paint['fill-opacity']), id).toBe(true);
    }
  });

  it('maps foreign fonts onto the bundled Noto Sans stacks', () => {
    expect(bundledFont('Noto Sans Devanagari Regular v1')).toBe('Noto Sans Regular');
    expect(bundledFont('Noto Sans Bold')).toBe('Noto Sans Medium');
    expect(bundledFont('Open Sans Italic')).toBe('Noto Sans Italic');
    expect(bundledFont('Noto Sans Medium')).toBe('Noto Sans Medium');
  });
});

describe('street map availability check', () => {
  const URL_ = 'https://example.test/epd/tiles/estonia.pmtiles';

  /** Smallest valid PMTiles v3 archive: 127-byte header + an empty, uncompressed root directory. */
  function tinyArchive(tileType = 1): ArrayBuffer {
    const b = new Uint8Array(128);
    const v = new DataView(b.buffer);
    'PMTiles'.split('').forEach((c, i) => (b[i] = c.charCodeAt(0)));
    b[7] = 3;
    v.setUint32(8, 127, true); // root directory offset
    v.setUint32(16, 1, true); // root directory length (one varint: 0 entries)
    v.setUint32(24, 128, true); // metadata offset
    v.setUint32(56, 128, true); // tile data offset
    b[97] = 1; // internal compression: none
    b[98] = 2; // tile compression: gzip
    b[99] = tileType;
    b[101] = 15;
    v.setInt32(102, 216000000, true);
    v.setInt32(106, 573000000, true);
    v.setInt32(110, 285000000, true);
    v.setInt32(114, 599500000, true);
    b[127] = 0;
    return b.buffer;
  }

  const respond = (body: BodyInit, status = 206, headers: Record<string, string> = {}) =>
    vi.fn(async () => new Response(body, { status, headers: { 'Content-Length': String(typeof body === 'string' ? body.length : (body as ArrayBuffer).byteLength), ...headers } }));

  afterEach(() => {
    vi.unstubAllGlobals();
    resetStreetProbes();
  });

  it('accepts a vector archive served with range support and shares it', async () => {
    const fetch = respond(tinyArchive());
    vi.stubGlobal('fetch', fetch);
    const shared: unknown[] = [];
    expect(await probeStreetTiles(URL_, { onArchive: (a) => shared.push(a) })).toBe('ok');
    expect(shared).toHaveLength(1);
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).get('range')).toBe('bytes=0-16383');
    expect(knownStreetProbe(URL_)).toBe('ok');
    // Cached: a second check does not fetch again.
    expect(await probeStreetTiles(URL_)).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports a missing file (404, GitHub Pages)', async () => {
    vi.stubGlobal('fetch', respond('Not found', 404));
    expect(await probeStreetTiles(URL_)).toBe('missing');
  });

  it('reports a missing file when an SPA fallback answers with index.html (vite dev)', async () => {
    vi.stubGlobal('fetch', respond('<!doctype html><html><body>EPD</body></html>', 200, { 'Content-Type': 'text/html' }));
    expect(await probeStreetTiles(URL_)).toBe('missing');
  });

  it('rejects a raster archive', async () => {
    vi.stubGlobal('fetch', respond(tinyArchive(2)));
    expect(await probeStreetTiles(URL_)).toBe('missing');
  });

  it('reports the network when the fetch fails or the server is down, and retries later', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await probeStreetTiles(URL_)).toBe('network');
    vi.stubGlobal('fetch', respond('Bad gateway', 502));
    expect(await probeStreetTiles(URL_)).toBe('network');
    vi.stubGlobal('fetch', respond(tinyArchive()));
    expect(await probeStreetTiles(URL_)).toBe('ok');
  });

  it('never hangs: a silent server times out', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    expect(await probeStreetTiles(URL_, { timeoutMs: 30 })).toBe('network');
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
