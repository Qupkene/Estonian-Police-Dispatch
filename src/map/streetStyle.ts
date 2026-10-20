/**
 * Self-hosted street map ('dark' style): Protomaps basemap layers read from one PMTiles file on the
 * game's own server (`${BASE_URL}tiles/estonia.pmtiles`, see docs/SERVER.md §2 and §3). No external
 * tile service, no API key.
 *
 * The layers come from @protomaps/basemaps and are adapted to EPD:
 * - colours follow the dark CAD palette (src/ui/styles/tokens.css, PALETTE in style.ts);
 * - Estonian names (lang 'et'); names in a non-Latin script fall back to their Estonian or English
 *   form, so labels only need the bundled glyph ranges (0-255, 256-511, 8192-8447);
 * - every text uses one of the three bundled Noto Sans stacks;
 * - there is no sprite, so icon-only layers are dropped and icons are stripped from label layers;
 * - the land and water fills fade in from z9, so the tactical overview stays visible when zoomed out.
 *
 * Pure module (no DOM, no maplibre runtime): testable in node.
 */
import { DARK, layers as basemapLayers, type Flavor } from '@protomaps/basemaps';
import type { LayerSpecification, SourceSpecification } from './style';

/** Path of the PMTiles archive below the app base URL. */
export const STREET_TILES_PATH = 'tiles/estonia.pmtiles';
/** Source id of the street map. */
export const STREET_SOURCE = 'epd-street';
/** Prefix of every street map layer id (keeps them apart from the tactical layer ids). */
export const STREET_PREFIX = 'street-';

export const STREET_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';

const FONT_REGULAR = 'Noto Sans Regular';
const FONT_MEDIUM = 'Noto Sans Medium';
const FONT_ITALIC = 'Noto Sans Italic';
const BUNDLED_FONTS = new Set([FONT_REGULAR, FONT_MEDIUM, FONT_ITALIC]);

const withSlash = (base: string) => (base.endsWith('/') ? base : `${base}/`);

/** URL of the PMTiles archive for an app base URL (ideally absolute). */
export const streetTilesUrl = (base: string) => `${withSlash(base)}${STREET_TILES_PATH}`;

/** MapLibre vector source for the archive, read through the `pmtiles://` protocol. */
export function streetSource(base: string): SourceSpecification {
  return { type: 'vector', url: `pmtiles://${streetTilesUrl(base)}`, attribution: STREET_ATTRIBUTION };
}

export const isStreetSource = (id: string | undefined) => id === STREET_SOURCE;

/** Dark CAD flavour: navy land, near-black water, blue-grey roads, cool label colours. */
export const STREET_FLAVOR: Flavor = {
  ...DARK,
  // Ground and water as the tactical base (PALETTE in style.ts, Valvekaart's tones); the rest stays.
  background: '#07111b',
  earth: '#141b24',
  park_a: '#0f2027',
  park_b: '#0f2228',
  hospital: '#16202e',
  industrial: '#121c29',
  school: '#141f2d',
  wood_a: '#0f1e26',
  wood_b: '#0f1e26',
  pedestrian: '#142132',
  scrub_a: '#111f29',
  scrub_b: '#111f29',
  glacier: '#16243a',
  sand: '#16222f',
  beach: '#172433',
  aerodrome: '#131e2c',
  runway: '#1e2c3d',
  water: '#07111b',
  zoo: '#121f2a',
  military: '#161d2a',

  tunnel_other_casing: '#0a121c',
  tunnel_minor_casing: '#0a121c',
  tunnel_link_casing: '#0a121c',
  tunnel_major_casing: '#0a121c',
  tunnel_highway_casing: '#0a121c',
  tunnel_other: '#162434',
  tunnel_minor: '#162434',
  tunnel_link: '#1c2e44',
  tunnel_major: '#1c2e44',
  tunnel_highway: '#22395a',

  pier: '#1c2a3a',
  buildings: '#25374d',

  minor_service_casing: '#0a121c',
  minor_casing: '#0a121c',
  link_casing: '#0a121c',
  major_casing_late: '#0a121c',
  highway_casing_late: '#0a121c',
  other: '#1a2a3c',
  minor_service: '#1b2b3e',
  minor_a: '#23364c',
  minor_b: '#1e3044',
  link: '#2a4566',
  major_casing_early: '#0a121c',
  major: '#2b4766',
  highway_casing_early: '#0a121c',
  highway: '#3f6c9f',

  railway: '#46566b',
  boundaries: '#3b5878',

  bridges_other_casing: '#0a121c',
  bridges_minor_casing: '#0a121c',
  bridges_link_casing: '#0a121c',
  bridges_major_casing: '#0a121c',
  bridges_highway_casing: '#0a121c',
  bridges_other: '#1a2a3c',
  bridges_minor: '#23364c',
  bridges_link: '#2a4566',
  bridges_major: '#2b4766',
  bridges_highway: '#3f6c9f',

  roads_label_minor: '#8595a8',
  roads_label_minor_halo: '#06090d',
  roads_label_major: '#a9b8c9',
  roads_label_major_halo: '#06090d',
  ocean_label: '#4f7aa3',
  subplace_label: '#6d89aa',
  subplace_label_halo: '#04080e',
  city_label: '#d3deea',
  city_label_halo: '#04080e',
  state_label: '#5b6a7d',
  state_label_halo: '#04080e',
  country_label: '#8595a8',
  address_label: '#5b6a7d',
  address_label_halo: '#06090d',

  regular: FONT_REGULAR,
  bold: FONT_MEDIUM,
  italic: FONT_ITALIC,
  // No sprite in the app: without `pois` the basemap builds no icon layer for points of interest.
  pois: undefined,
  landcover: {
    grassland: '#101f27',
    barren: '#131d29',
    urban_area: '#141f2d',
    farmland: '#111e29',
    glacier: '#16243a',
    scrub: '#111f29',
    forest: '#0f1e26',
  },
};

/**
 * Basemap layers we never draw: our own `bg` replaces the background, the tactical land fill
 * replaces the low-zoom land cover, the tactical county and border lines replace the boundaries,
 * and the arrow, shield and POI layers need sprite icons.
 */
const DROP = new Set([
  'background',
  'landcover',
  'boundaries',
  'boundaries_country',
  'roads_oneway',
  'roads_shields',
  'pois',
]);

/** Fills that fade in with zoom so the tactical overview (land glow, coast) shows when zoomed out. */
const FADE_IN_FILLS = new Set([
  'earth',
  'water',
  'landuse_park',
  'landuse_urban_green',
  'landuse_hospital',
  'landuse_industrial',
  'landuse_school',
  'landuse_beach',
  'landuse_zoo',
  'landuse_aerodrome',
  'landuse_pedestrian',
  'landuse_pier',
  'landuse_runway',
]);
const FADE_FROM = 8.5;
const FADE_TO = 10.5;

/** A feature whose local name is in a non-Latin script (Protomaps sets `script` only then). */
const NON_LATIN = ['any', ['has', 'script'], ['has', 'script2'], ['has', 'script3']];
const LATIN_FALLBACK_NAME = ['coalesce', ['get', 'name:et'], ['get', 'name:en'], ''];

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Map any font name onto the closest bundled Noto Sans stack. */
export function bundledFont(name: string): string {
  if (BUNDLED_FONTS.has(name)) return name;
  if (/italic|oblique/i.test(name)) return FONT_ITALIC;
  if (/medium|bold|semi|black|heavy/i.test(name)) return FONT_MEDIUM;
  return FONT_REGULAR;
}

/** Rewrite every font name inside a `text-font` value (plain stack or expression). */
function fixFontValue(v: Json): Json {
  if (Array.isArray(v)) {
    if (
      v.length &&
      v.every((x) => typeof x === 'string') &&
      !['literal', 'get', 'case', 'match', 'step', 'coalesce'].includes(v[0] as string)
    )
      return v.map((x) => bundledFont(x as string));
    return v.map(fixFontValue);
  }
  return v;
}

/** Deep walk: fix every `text-font` key (layout property and `format` section overrides). */
function fixFonts(v: Json): Json {
  if (Array.isArray(v)) return v.map(fixFonts);
  if (v && typeof v === 'object') {
    const out: { [k: string]: Json } = {};
    for (const [k, x] of Object.entries(v)) out[k] = k === 'text-font' ? fixFontValue(x) : fixFonts(x);
    return out;
  }
  return v;
}

const fadeIn = (to: number) => ['interpolate', ['linear'], ['zoom'], FADE_FROM, 0, FADE_TO, to];

/**
 * Show a feature with a non-Latin local name only by its Estonian or English name (one line), so no
 * label needs a glyph range we do not ship. This also covers the low-zoom region labels, which show
 * the `ref` abbreviation (Cyrillic for the Russian oblasts). A zoom `step` must stay the outermost
 * expression, so its outputs are wrapped one by one.
 */
function latinSafe(field: Json): Json {
  if (Array.isArray(field) && field[0] === 'step' && JSON.stringify(field[1]) === '["zoom"]') {
    return field.map((x, i) => (i >= 2 && i % 2 === 0 ? latinSafe(x) : x));
  }
  if (!/"(name|ref)[":]/.test(JSON.stringify(field))) return field;
  return ['case', NON_LATIN, LATIN_FALLBACK_NAME, field] as Json;
}

/** Adapt one basemap layer to EPD, or return null to drop it. */
function adaptLayer(
  layer: LayerSpecification,
  source: string,
  cinematic: boolean,
): LayerSpecification | null {
  if (DROP.has(layer.id)) return null;
  const l = fixFonts(JSON.parse(JSON.stringify(layer)) as Json) as { [k: string]: Json };
  l.id = `${STREET_PREFIX}${layer.id}`;
  l.source = source;
  const layout = (l.layout ?? {}) as { [k: string]: Json };
  const paint = (l.paint ?? {}) as { [k: string]: Json };

  if (layout['icon-image'] !== undefined) {
    // No sprite: a layer that only draws icons is dropped, a label layer keeps its text only.
    if (layout['text-field'] === undefined) return null;
    for (const k of Object.keys(layout)) if (k.startsWith('icon-')) delete layout[k];
    for (const k of Object.keys(paint)) if (k.startsWith('icon-')) delete paint[k];
    // The anchors placed the text beside the (now missing) town dot; centre it instead.
    delete layout['text-variable-anchor'];
    delete layout['text-radial-offset'];
  }

  if (l.type === 'symbol' && layout['text-field'] !== undefined) {
    layout['text-field'] = latinSafe(layout['text-field']);
    if (cinematic) layout.visibility = 'none';
  }
  // A feature without `sort_key` and `min_zoom` would log a type warning; sort it last instead.
  if (layout['symbol-sort-key'] !== undefined && typeof layout['symbol-sort-key'] !== 'number')
    layout['symbol-sort-key'] = ['coalesce', layout['symbol-sort-key'], 99] as Json;

  if (FADE_IN_FILLS.has(layer.id) && l.type === 'fill') {
    const base = typeof paint['fill-opacity'] === 'number' ? (paint['fill-opacity'] as number) : 1;
    paint['fill-opacity'] = fadeIn(base) as Json;
  }

  if (Object.keys(layout).length) l.layout = layout;
  else delete l.layout;
  l.paint = paint;
  return l as unknown as LayerSpecification;
}

export interface StreetLayers {
  /** Land, water, land use, roads and buildings: drawn just above the tactical land fill. */
  base: LayerSpecification[];
  /** Street, place and water names: drawn above the tactical admin lines, below every overlay. */
  labels: LayerSpecification[];
}

/** Street map layers for the 'dark' style. */
export function streetLayers(opts: { cinematic?: boolean; lang?: string } = {}): StreetLayers {
  const all = basemapLayers(STREET_SOURCE, STREET_FLAVOR, {
    lang: opts.lang ?? 'et',
  }) as unknown as LayerSpecification[];
  const out: StreetLayers = { base: [], labels: [] };
  for (const layer of all) {
    const l = adaptLayer(layer, STREET_SOURCE, !!opts.cinematic);
    if (!l) continue;
    (l.type === 'symbol' ? out.labels : out.base).push(l);
  }
  return out;
}
