/**
 * Pure maplibre style builder for EPD.
 *
 * Every style contains the offline "tactical" base (built from src/data/geo) so the map always
 * works without network. On top of the land layers:
 * - 'dark' adds the self-hosted Protomaps street map (vector tiles from one PMTiles file on the
 *   game's own server, see streetStyle.ts) and hides the tactical roads where it has its own;
 * - 'maaamet' and 'foto' add the Maa- ja Ruumiamet raster base map(s) and fade the tactical roads
 *   out where the raster has its own detail.
 * Overlay sources (stations, routes, pursuit trails, search areas, heat) are part of every style so
 * a style swap keeps them, and every overlay is drawn above the base map.
 *
 * No DOM / maplibre runtime imports: testable in node.
 */
import type { Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { MapStyleKey } from '@/store/settings';
import { geoData } from './geodata';
import { STREET_SOURCE, streetLayers, streetSource } from './streetStyle';

export { isStreetSource, STREET_ATTRIBUTION, STREET_PREFIX, STREET_SOURCE, STREET_TILES_PATH, streetTilesUrl } from './streetStyle';

export type StyleSpecification = Exclude<Parameters<MlMap['setStyle']>[0], string | null | undefined>;
export type LayerSpecification = StyleSpecification['layers'][number];
export type SourceSpecification = StyleSpecification['sources'][string];

export const MAP_STYLE_KEYS: MapStyleKey[] = ['tactical', 'dark', 'maaamet', 'foto'];

/** Font stacks available in public/glyphs (ranges 0-255, 256-511, 8192-8447 only). */
export const FONT = {
  medium: ['Noto Sans Medium'],
  regular: ['Noto Sans Regular'],
  italic: ['Noto Sans Italic'],
} as const;
export const ALLOWED_FONTS = ['Noto Sans Medium', 'Noto Sans Regular', 'Noto Sans Italic'];

/** Source ids. */
export const SRC = {
  land: 'epd-land',
  neighbors: 'epd-neighbors',
  lakes: 'epd-lakes',
  countyLines: 'epd-county-lines',
  districts: 'epd-districts',
  roads: 'epd-roads',
  rail: 'epd-rail',
  settlements: 'epd-settlements',
  raster: 'epd-raster',
  street: STREET_SOURCE,
  stations: 'epd-stations',
  routes: 'epd-routes',
  pursuit: 'epd-pursuit',
  search: 'epd-search',
  heat: 'epd-heat',
  area: 'epd-area',
} as const;

export type OverlaySourceId = typeof SRC.stations | typeof SRC.routes | typeof SRC.pursuit | typeof SRC.search | typeof SRC.heat | typeof SRC.area;
export const OVERLAY_SOURCES: OverlaySourceId[] = [SRC.stations, SRC.routes, SRC.pursuit, SRC.search, SRC.heat, SRC.area];

/** Label layers hidden in cinematic mode (route lines are hidden too). */
export const LABEL_LAYERS = ['label-district', 'label-village', 'label-alev', 'label-city', 'label-city-major', 'stations-label', 'area-label'];
/** The shift's area (src/map/area.ts): the dimmed outside, its edge, night cover outlines, neighbour labels. */
export const AREA_LAYERS = ['area-mask', 'area-inside', 'area-cover-fill', 'area-edge-glow', 'area-edge', 'area-cover', 'area-label'];

/**
 * How the outside of the area is dimmed on each base map: dark bases need a deep veil to read as "not
 * yours", the light grey map less, or it turns muddy.
 */
export const AREA_DIM: Record<MapStyleKey, { color: string; opacity: number; edge: string; inside: number }> = {
  tactical: { color: '#01050a', opacity: 0.58, edge: '#7fb2ff', inside: 0.05 },
  dark: { color: '#000000', opacity: 0.52, edge: '#7fb2ff', inside: 0.045 },
  maaamet: { color: '#141c27', opacity: 0.4, edge: '#1f5fc4', inside: 0 },
  foto: { color: '#000000', opacity: 0.48, edge: '#9fc2ff', inside: 0 },
};
export const ROUTE_LAYERS = ['routes-casing', 'routes-line', 'routes-line-calm'];
export const HEAT_LAYER = 'heat';
export const RASTER_LAYER = 'raster';

/**
 * Online raster base maps (see docs/research/map-services.md). Maa- ja Ruumiamet (formerly Maa-amet)
 * serves Google-Mercator ("GMC") tiles in TMS row order from tiles.maaamet.ee.
 * A style may stack several rasters (orthophoto + transparent "hybriid" label overlay).
 */
export interface RasterService {
  tiles: string[];
  scheme: 'xyz' | 'tms';
  tileSize: number;
  minzoom: number;
  maxzoom: number;
  bounds?: [number, number, number, number];
  attribution: string;
  /** Paint tweaks so the raster sits well in the dark UI. */
  paint?: Record<string, number>;
}

export const MAAAMET_TILE_BASE = 'https://tiles.maaamet.ee/tm/tms/1.0.0';
export const ESTONIA_RASTER_BOUNDS: [number, number, number, number] = [21.5, 57.3, 28.5, 59.95];
const MAARU_ATTR = '© <a href="https://www.maaamet.ee/" target="_blank" rel="noopener">Maa- ja Ruumiamet</a>';

const maaamet = (layer: string, ext: 'png' | 'jpg', paint?: Record<string, number>): RasterService => ({
  tiles: [`${MAAAMET_TILE_BASE}/${layer}@GMC/{z}/{x}/{y}.${ext}`],
  scheme: 'tms',
  tileSize: 256,
  minzoom: 6,
  maxzoom: 18,
  bounds: ESTONIA_RASTER_BOUNDS,
  attribution: MAARU_ATTR,
  paint,
});

/** Styles drawn from online raster tiles (Maa- ja Ruumiamet). */
export type RasterStyleKey = 'maaamet' | 'foto';

export const RASTER_SERVICES: Record<RasterStyleKey, RasterService[]> = {
  maaamet: [maaamet('hallkaart', 'png', { 'raster-brightness-max': 0.92 })],
  foto: [maaamet('foto', 'jpg', { 'raster-saturation': -0.1, 'raster-brightness-max': 0.9 }), maaamet('hybriid', 'png')],
};

/** Source id of the i-th raster of a style ("epd-raster", "epd-raster-2", …). */
export const rasterSourceId = (i: number) => (i === 0 ? SRC.raster : `${SRC.raster}-${i + 1}`);
export const rasterLayerId = (i: number) => (i === 0 ? RASTER_LAYER : `${RASTER_LAYER}-${i + 1}`);
export const isRasterSource = (id: string | undefined) => !!id && (id === SRC.raster || id.startsWith(`${SRC.raster}-`));

export function isOnlineStyle(key: MapStyleKey): key is Exclude<MapStyleKey, 'tactical'> {
  return key !== 'tactical';
}

/** The self-hosted Protomaps street map. */
export function isStreetStyle(key: MapStyleKey): key is 'dark' {
  return key === 'dark';
}

export function isRasterStyle(key: MapStyleKey): key is RasterStyleKey {
  return key === 'maaamet' || key === 'foto';
}

/**
 * Highest zoom (exclusive) of the tactical roads and railways per style. The street map has its own
 * roads from low zoom on, so the tactical network only gives the overview there; the rasters carry
 * real streets from about z11.
 */
export const TACTICAL_ROADS_MAXZOOM: Record<MapStyleKey, number> = { tactical: 24, dark: 9, maaamet: 11, foto: 11 };

export interface BuildStyleOptions {
  /** App base URL (import.meta.env.BASE_URL, ideally absolute). Glyphs are served from `${base}glyphs/`. */
  base: string;
  /** Hide labels (cinematic mode). */
  cinematic?: boolean;
  /** Show the incident heat layer. */
  heat?: boolean;
  /** Current overlay data, so a style swap does not blank the overlays. */
  overlays?: Partial<Record<OverlaySourceId, FeatureCollection>>;
}

/** Tactical palette (also used by the DOM overlays via CSS tokens where possible). */
export const PALETTE = {
  sea: '#050c16',
  neighbor: '#0b131d',
  neighborLine: '#1a2634',
  land: '#101b28',
  landGlow: '#2f7bff',
  coast: '#2c4560',
  lake: '#061221',
  lakeLine: '#1c3552',
  county: '#3b5878',
  district: '#2b4a6c',
  districtFill: '#142235',
  roadMinor: '#22354a',
  roadSecondary: '#2f4b69',
  roadMajor: '#4f8fdc',
  roadGlow: '#3d8bff',
  ferry: '#2f74a6',
  rail: '#5a6b80',
  labelCity: '#d3deea',
  labelTown: '#a9b8c9',
  labelVillage: '#7d8ea3',
  labelDistrict: '#6d89aa',
  halo: '#04080e',
  route: '#3d8bff',
  routeSelected: '#00d0ff',
  pursuit: '#ff2d55',
  search: '#00d0ff',
  station: '#9fc2ff',
  stationDim: '#5d7189',
  areaCover: '#f2c14e',
  areaLabel: '#c9d8ea',
} as const;

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

const glyphUrl = (base: string) => `${base.endsWith('/') ? base : base + '/'}glyphs/{fontstack}/{range}.pbf`;

const interp = (stops: [number, number][]): unknown => ['interpolate', ['linear'], ['zoom'], ...stops.flat()];
const interpExp = (stops: [number, number][], e = 1.5): unknown => ['interpolate', ['exponential', e], ['zoom'], ...stops.flat()];

/** Build the complete maplibre style for a map style key. */
export function buildStyle(styleKey: MapStyleKey, opts: BuildStyleOptions): StyleSpecification {
  const g = geoData();
  const online = isOnlineStyle(styleKey);
  const street = isStreetStyle(styleKey);
  const rasters = isRasterStyle(styleKey) ? RASTER_SERVICES[styleKey] : [];
  const streetL = street ? streetLayers({ cinematic: opts.cinematic, lang: 'et' }) : { base: [], labels: [] };
  const ov = opts.overlays ?? {};
  const labelVis = opts.cinematic ? 'none' : 'visible';
  // Online base maps carry their own place names (the orthophoto via the "hybriid" overlay).
  const settlementVis = opts.cinematic || online ? 'none' : 'visible';
  /** Tactical district detail fades out at z11 on online styles (the base map has real streets). */
  const tacticalMax = online ? 11 : 24;
  /** Tactical roads and railways stop where the base map has its own. */
  const roadsMax = TACTICAL_ROADS_MAXZOOM[styleKey];
  const tacticalOpacity = online ? 0.55 : 1;
  /** Road opacity: on the street map the tactical overview roads fade out over their last zoom level. */
  const roadOpacity = (stops: [number, number][]): unknown => {
    const s = [...stops];
    if (street) {
      const [lastZ, lastO] = s[s.length - 1];
      if (lastZ < roadsMax - 1) s.push([roadsMax - 1, lastO]);
      s.push([roadsMax, 0]);
    }
    return s.length === 1 ? s[0][1] : interp(s);
  };

  const sources: Record<string, SourceSpecification> = {
    [SRC.neighbors]: { type: 'geojson', data: g.neighbors, maxzoom: 10, tolerance: 0.5 },
    [SRC.land]: {
      type: 'geojson',
      data: g.land,
      maxzoom: 12,
      attribution: '<a href="https://www.geoboundaries.org" target="_blank" rel="noopener">geoBoundaries</a> · Natural Earth',
    },
    [SRC.lakes]: { type: 'geojson', data: g.lakes, maxzoom: 12 },
    [SRC.countyLines]: {
      type: 'geojson',
      data: g.countyLines,
      maxzoom: 12,
      attribution: 'Maa- ja Ruumiamet (<a href="https://whosonfirst.org/docs/licenses/" target="_blank" rel="noopener">Who\'s On First</a>)',
    },
    [SRC.districts]: { type: 'geojson', data: g.districts, maxzoom: 13 },
    [SRC.roads]: { type: 'geojson', data: g.roads, maxzoom: 12 },
    [SRC.rail]: { type: 'geojson', data: g.rail, maxzoom: 12 },
    [SRC.settlements]: { type: 'geojson', data: g.settlements, maxzoom: 13, buffer: 64 },
    [SRC.stations]: { type: 'geojson', data: ov[SRC.stations] ?? EMPTY, maxzoom: 14 },
    [SRC.routes]: { type: 'geojson', data: ov[SRC.routes] ?? EMPTY, maxzoom: 14, tolerance: 0.2 },
    [SRC.pursuit]: { type: 'geojson', data: ov[SRC.pursuit] ?? EMPTY, maxzoom: 14, lineMetrics: true },
    [SRC.search]: { type: 'geojson', data: ov[SRC.search] ?? EMPTY, maxzoom: 14 },
    [SRC.heat]: { type: 'geojson', data: ov[SRC.heat] ?? EMPTY, maxzoom: 12 },
    [SRC.area]: { type: 'geojson', data: ov[SRC.area] ?? EMPTY, maxzoom: 12, tolerance: 0.4 },
  };
  if (street) sources[SRC.street] = streetSource(opts.base);
  rasters.forEach((r, i) => {
    sources[rasterSourceId(i)] = {
      type: 'raster',
      tiles: r.tiles,
      scheme: r.scheme,
      tileSize: r.tileSize,
      minzoom: r.minzoom,
      maxzoom: r.maxzoom,
      // Stacked rasters share one attribution entry.
      ...(i === 0 || r.attribution !== rasters[0].attribution ? { attribution: r.attribution } : {}),
      ...(r.bounds ? { bounds: r.bounds } : {}),
    };
  });

  const L: LayerSpecification[] = [];
  const add = (l: unknown) => L.push(l as LayerSpecification);

  // ── Base: sea, neighbours, Estonia ────────────────────────────────────────
  add({ id: 'bg', type: 'background', paint: { 'background-color': PALETTE.sea } });
  add({ id: 'neighbors-fill', type: 'fill', source: SRC.neighbors, paint: { 'fill-color': PALETTE.neighbor, 'fill-antialias': true } });
  add({
    id: 'neighbors-line',
    type: 'line',
    source: SRC.neighbors,
    paint: { 'line-color': PALETTE.neighborLine, 'line-width': interp([[5, 0.5], [10, 1]]) },
  });
  add({ id: 'land-fill', type: 'fill', source: SRC.land, paint: { 'fill-color': PALETTE.land } });
  add({
    id: 'land-glow',
    type: 'line',
    source: SRC.land,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': PALETTE.landGlow,
      'line-opacity': interp([[5, 0.2], [9, 0.16], [13, 0.08]]),
      'line-width': interp([[5, 5], [9, 14], [13, 26]]),
      'line-blur': interp([[5, 4], [9, 12], [13, 22]]),
    },
  });
  add({
    id: 'land-coast',
    type: 'line',
    source: SRC.land,
    layout: { 'line-join': 'round' },
    paint: { 'line-color': PALETTE.coast, 'line-width': interp([[5, 0.6], [10, 1.1], [14, 1.6]]) },
  });
  add({ id: 'lakes-fill', type: 'fill', source: SRC.lakes, paint: { 'fill-color': PALETTE.lake } });
  add({
    id: 'lakes-line',
    type: 'line',
    source: SRC.lakes,
    paint: { 'line-color': PALETTE.lakeLine, 'line-width': interp([[5, 0.5], [10, 1]]) },
  });

  // ── Online base map (above land so failed tiles reveal the tactical map) ──
  for (const l of streetL.base) add(l);
  rasters.forEach((r, i) =>
    add({
      id: rasterLayerId(i),
      type: 'raster',
      source: rasterSourceId(i),
      paint: { 'raster-fade-duration': 250, 'raster-opacity': 1, ...(r.paint ?? {}) },
    }),
  );

  // ── Administrative ─────────────────────────────────────────────────────────
  add({
    id: 'districts-fill',
    type: 'fill',
    source: SRC.districts,
    minzoom: 8.5,
    maxzoom: tacticalMax,
    paint: { 'fill-color': PALETTE.districtFill, 'fill-opacity': online ? 0 : interp([[8.5, 0], [10, 0.55]]) },
  });
  add({
    id: 'county-lines',
    type: 'line',
    source: SRC.countyLines,
    maxzoom: online ? 12 : 24,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': PALETTE.county,
      'line-opacity': online ? 0.5 : 0.75,
      'line-width': interp([[5, 0.6], [10, 1.1], [14, 1.6]]),
      'line-dasharray': ['literal', [3, 2.5]],
    },
  });
  add({
    id: 'districts-line',
    type: 'line',
    source: SRC.districts,
    minzoom: 8.5,
    maxzoom: tacticalMax,
    paint: {
      'line-color': PALETTE.district,
      'line-opacity': interp([[8.5, 0], [10, online ? 0.5 : 0.9]]),
      'line-width': interp([[9, 0.6], [13, 1.4]]),
    },
  });

  // ── Transport network ──────────────────────────────────────────────────────
  const roadFilter = (...kinds: string[]) => ['in', ['get', 'kind'], ['literal', kinds]];
  add({
    id: 'rail',
    type: 'line',
    source: SRC.rail,
    minzoom: 6.5,
    maxzoom: roadsMax,
    paint: {
      'line-color': PALETTE.rail,
      'line-opacity': roadOpacity([[6.5, 0], [8, 0.8 * tacticalOpacity]]),
      'line-width': interp([[7, 0.6], [12, 1.4]]),
      'line-dasharray': ['literal', [2, 2]],
    },
  });
  add({
    id: 'roads-minor',
    type: 'line',
    source: SRC.roads,
    filter: roadFilter('Road', 'Unknown'),
    minzoom: 6,
    maxzoom: roadsMax,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': PALETTE.roadMinor,
      'line-opacity': roadOpacity([[6, 0], [7, tacticalOpacity]]),
      'line-width': interpExp([[6, 0.4], [10, 1.3], [14, 3.2]]),
    },
  });
  add({
    id: 'roads-secondary',
    type: 'line',
    source: SRC.roads,
    filter: roadFilter('Secondary Highway'),
    maxzoom: roadsMax,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': PALETTE.roadSecondary,
      'line-opacity': roadOpacity([[5, tacticalOpacity]]),
      'line-width': interpExp([[5, 0.5], [10, 1.8], [14, 4.5]]),
    },
  });
  add({
    id: 'roads-major-glow',
    type: 'line',
    source: SRC.roads,
    filter: roadFilter('Major Highway'),
    maxzoom: roadsMax,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': PALETTE.roadGlow,
      'line-opacity': roadOpacity([[5, 0.22 * tacticalOpacity]]),
      'line-width': interpExp([[5, 3], [10, 9], [14, 20]]),
      'line-blur': interpExp([[5, 2], [10, 6], [14, 12]]),
    },
  });
  add({
    id: 'roads-major',
    type: 'line',
    source: SRC.roads,
    filter: roadFilter('Major Highway'),
    maxzoom: roadsMax,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': PALETTE.roadMajor,
      'line-opacity': roadOpacity([[5, 0.9 * tacticalOpacity]]),
      'line-width': interpExp([[5, 0.8], [10, 2.2], [14, 5]]),
    },
  });
  add({
    id: 'roads-ferry',
    type: 'line',
    source: SRC.roads,
    filter: roadFilter('Ferry Route'),
    // The street map draws no ferry routes, so the tactical ones stay as on the rasters.
    maxzoom: tacticalMax,
    paint: {
      'line-color': PALETTE.ferry,
      'line-opacity': 0.85 * tacticalOpacity,
      'line-width': interp([[5, 0.7], [12, 1.6]]),
      'line-dasharray': ['literal', [2.5, 2]],
    },
  });

  // ── Street map labels (above the admin lines, below every overlay) ─────────
  for (const l of streetL.labels) add(l);

  // ── The shift's area: the outside dimmed, above the base map and below every overlay ──
  const dim = AREA_DIM[styleKey] ?? AREA_DIM.tactical;
  const kindIs = (k: string) => ['==', ['get', 'kind'], k];
  add({
    id: 'area-mask',
    type: 'fill',
    source: SRC.area,
    filter: kindIs('mask'),
    paint: { 'fill-color': dim.color, 'fill-opacity': dim.opacity, 'fill-antialias': false },
  });
  // Dark bases are near black already: a faint lift inside the area makes the edge read.
  add({
    id: 'area-inside',
    type: 'fill',
    source: SRC.area,
    filter: kindIs('inside'),
    paint: { 'fill-color': dim.edge, 'fill-opacity': dim.inside, 'fill-antialias': false },
  });
  add({
    id: 'area-cover-fill',
    type: 'fill',
    source: SRC.area,
    filter: kindIs('coverFill'),
    paint: { 'fill-color': PALETTE.areaCover, 'fill-opacity': 0.07, 'fill-antialias': false },
  });
  add({
    id: 'area-edge-glow',
    type: 'line',
    source: SRC.area,
    filter: kindIs('edge'),
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': dim.edge,
      'line-opacity': 0.28,
      'line-width': interp([[6, 4], [10, 9], [14, 16]]),
      'line-blur': interp([[6, 3], [10, 7], [14, 12]]),
    },
  });
  add({
    id: 'area-edge',
    type: 'line',
    source: SRC.area,
    filter: kindIs('edge'),
    layout: { 'line-join': 'round' },
    paint: { 'line-color': dim.edge, 'line-opacity': 0.9, 'line-width': interp([[6, 1.1], [10, 1.6], [14, 2.2]]) },
  });
  add({
    id: 'area-cover',
    type: 'line',
    source: SRC.area,
    filter: kindIs('cover'),
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': PALETTE.areaCover,
      'line-opacity': 0.85,
      'line-width': interp([[6, 1], [12, 1.8]]),
      'line-dasharray': ['literal', [2, 2]],
    },
  });

  // ── Dynamic overlays (data pushed by MapView at ≤ 10 Hz) ───────────────────
  add({
    id: HEAT_LAYER,
    type: 'heatmap',
    source: SRC.heat,
    maxzoom: 15,
    layout: { visibility: opts.heat ? 'visible' : 'none' },
    paint: {
      'heatmap-weight': ['coalesce', ['get', 'w'], 0.5],
      'heatmap-intensity': interp([[6, 1], [12, 2.6]]),
      'heatmap-radius': interp([[6, 14], [10, 30], [14, 56]]),
      'heatmap-opacity': interp([[6, 0.8], [14, 0.55]]),
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(20,40,90,0)',
        0.15,
        'rgba(61,139,255,0.45)',
        0.4,
        'rgba(0,208,255,0.6)',
        0.65,
        'rgba(245,158,11,0.75)',
        0.9,
        'rgba(255,59,78,0.85)',
        1,
        'rgba(255,220,220,0.95)',
      ],
    },
  });
  add({
    id: 'search-fill',
    type: 'fill',
    source: SRC.search,
    paint: {
      'fill-color': ['case', ['get', 'found'], '#22c55e', PALETTE.search],
      'fill-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'progress'], 0], 0, 0.06, 1, 0.34],
    },
  });
  add({
    id: 'search-line',
    type: 'line',
    source: SRC.search,
    paint: {
      'line-color': ['case', ['get', 'found'], '#22c55e', PALETTE.search],
      'line-width': 1.6,
      'line-opacity': 0.9,
      'line-dasharray': ['literal', [3, 2]],
    },
  });
  const routeVis = opts.cinematic ? 'none' : 'visible';
  add({
    id: 'routes-casing',
    type: 'line',
    source: SRC.routes,
    layout: { visibility: routeVis, 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#02060b', 'line-opacity': 0.75, 'line-width': interp([[6, 4], [14, 7]]) },
  });
  add({
    id: 'routes-line',
    type: 'line',
    source: SRC.routes,
    filter: ['==', ['get', 'siren'], true],
    layout: { visibility: routeVis, 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['match', ['get', 'kind'], 'selected', PALETTE.routeSelected, PALETTE.route],
      'line-width': interp([[6, 2], [14, 3.5]]),
    },
  });
  add({
    id: 'routes-line-calm',
    type: 'line',
    source: SRC.routes,
    filter: ['!=', ['get', 'siren'], true],
    layout: { visibility: routeVis, 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'kind'], 'selected', PALETTE.routeSelected, PALETTE.route],
      'line-width': interp([[6, 2], [14, 3.5]]),
      'line-dasharray': ['literal', [1.6, 1.4]],
    },
  });
  add({
    id: 'pursuit-glow',
    type: 'line',
    source: SRC.pursuit,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': PALETTE.pursuit, 'line-opacity': 0.35, 'line-width': interp([[6, 6], [14, 14]]), 'line-blur': 6 },
  });
  add({
    id: 'pursuit-trail',
    type: 'line',
    source: SRC.pursuit,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-width': interp([[6, 2.5], [14, 4.5]]),
      'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(255,45,85,0)', 0.5, 'rgba(255,45,85,0.55)', 1, 'rgba(255,90,120,1)'],
    },
  });

  // ── Labels ────────────────────────────────────────────────────────────────
  const halo = { 'text-halo-color': PALETTE.halo, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 };
  add({
    id: 'label-district',
    type: 'symbol',
    source: SRC.settlements,
    filter: ['==', ['get', 'kind'], 'linnaosa'],
    minzoom: 10,
    layout: {
      visibility: settlementVis,
      'text-field': ['get', 'name'],
      'text-font': FONT.medium,
      'text-size': interp([[10, 10], [14, 13]]),
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.18,
      'text-max-width': 8,
      'symbol-sort-key': ['get', 'rank'],
    },
    paint: { 'text-color': PALETTE.labelDistrict, ...halo },
  });
  add({
    id: 'label-village',
    type: 'symbol',
    source: SRC.settlements,
    filter: ['==', ['get', 'kind'], 'küla'],
    minzoom: 11.5,
    layout: {
      visibility: settlementVis,
      'text-field': ['get', 'name'],
      'text-font': FONT.italic,
      'text-size': interp([[11.5, 10], [15, 12.5]]),
      'text-max-width': 8,
      'text-padding': 3,
    },
    paint: { 'text-color': PALETTE.labelVillage, ...halo },
  });
  add({
    id: 'label-alev',
    type: 'symbol',
    source: SRC.settlements,
    filter: ['in', ['get', 'kind'], ['literal', ['alev', 'alevik']]],
    minzoom: 9,
    layout: {
      visibility: settlementVis,
      'text-field': ['get', 'name'],
      'text-font': FONT.regular,
      'text-size': interp([[9, 10.5], [14, 13.5]]),
      'text-max-width': 8,
      'text-padding': 4,
      'symbol-sort-key': ['get', 'rank'],
    },
    paint: { 'text-color': PALETTE.labelTown, ...halo },
  });
  const cityLayout = (minRank: number, maxRank: number, minzoom: number) => ({
    type: 'symbol',
    source: SRC.settlements,
    filter: ['all', ['==', ['get', 'kind'], 'linn'], ['>=', ['get', 'rank'], minRank], ['<=', ['get', 'rank'], maxRank]],
    minzoom,
    layout: {
      visibility: settlementVis,
      'text-field': ['get', 'name'],
      'text-font': FONT.medium,
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5.5,
        ['match', ['get', 'rank'], 1, 14, 2, 12, 11],
        10,
        ['match', ['get', 'rank'], 1, 19, 2, 16, 3, 14, 13],
        14,
        ['match', ['get', 'rank'], 1, 22, 2, 19, 3, 17, 15],
      ],
      'text-letter-spacing': 0.03,
      'text-max-width': 9,
      'text-padding': 4,
      'symbol-sort-key': ['get', 'rank'],
    },
    paint: { 'text-color': PALETTE.labelCity, ...halo, 'text-halo-width': 1.6 },
  });
  add({ id: 'label-city', ...cityLayout(3, 9, 6.5) });
  add({ id: 'label-city-major', ...cityLayout(1, 2, 5.2) });
  // Neighbouring sectors and the colleague at that desk ("Viljandimaa · Maarja Tamm").
  add({
    id: 'area-label',
    type: 'symbol',
    source: SRC.area,
    filter: kindIs('label'),
    minzoom: 6,
    layout: {
      visibility: labelVis,
      'text-field': [
        'format',
        ['upcase', ['get', 'name']],
        { 'text-font': ['literal', FONT.medium] },
        ' · ',
        {},
        ['get', 'colleague'],
        { 'text-font': ['literal', FONT.italic], 'font-scale': 0.92 },
      ],
      'text-font': FONT.medium,
      'text-size': interp([[6, 10], [10, 12], [14, 13.5]]),
      'text-letter-spacing': 0.04,
      'text-max-width': 14,
      'text-padding': 6,
      'symbol-sort-key': 0,
    },
    paint: { 'text-color': PALETTE.areaLabel, ...halo, 'text-halo-width': 1.6 },
  });

  // ── Police stations ────────────────────────────────────────────────────────
  add({
    id: 'stations-halo',
    type: 'circle',
    source: SRC.stations,
    minzoom: 6,
    paint: {
      'circle-color': PALETTE.station,
      // With an area: its stations glow, the others nearly vanish (`area`: 1 in it, -1 outside, 0 none).
      'circle-opacity': ['match', ['coalesce', ['get', 'area'], 0], 1, 0.22, -1, 0.03, 0.1],
      'circle-radius': interp([[6, 5], [10, 10], [14, 14]]),
      'circle-blur': 0.4,
    },
  });
  add({
    id: 'stations-icon',
    type: 'symbol',
    source: SRC.stations,
    minzoom: 6,
    layout: {
      'icon-image': ['case', ['==', ['get', 'kind'], 'hq'], 'epdm-station-hq', 'epdm-station'],
      'icon-size': interp([[6, 0.55], [10, 0.85], [14, 1]]),
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      'icon-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        6,
        ['match', ['coalesce', ['get', 'area'], 0], -1, 0.3, 0.7],
        9,
        ['match', ['coalesce', ['get', 'area'], 0], -1, 0.45, 1],
      ],
    },
  });
  add({
    id: 'stations-label',
    type: 'symbol',
    source: SRC.stations,
    minzoom: 9.5,
    layout: {
      visibility: labelVis,
      'text-field': ['get', 'short'],
      'text-font': FONT.medium,
      'text-size': interp([[9.5, 9.5], [14, 11.5]]),
      'text-offset': [0, 1.35],
      'text-anchor': 'top',
      'text-max-width': 10,
      'text-optional': true,
    },
    paint: { 'text-color': ['match', ['coalesce', ['get', 'area'], 0], -1, PALETTE.stationDim, PALETTE.station], ...halo },
  });

  return {
    version: 8,
    name: `EPD ${styleKey}`,
    glyphs: glyphUrl(opts.base),
    sources,
    layers: L,
    metadata: { 'epd:style': styleKey },
  } as StyleSpecification;
}
