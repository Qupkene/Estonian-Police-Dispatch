// Pure helpers for the career screens' sector parts (onboarding choice, "Vastutusala", the prefect's offer,
// the briefing's area): who covers what, posts that can be opened, and the small SVG map of a prefecture's
// sectors. No React / DOM imports. Unit-tested in tests/career-sectors-ui.test.ts.
import countiesGeo from '@/data/geo/counties.json';
import { REGIONS } from '@/data/regions';
import { careerSectors, coversWholeRegion } from '@/sim/careerSectors';
import { neighbourSectors, sectorById, sectorOutlines, sectorsOf } from '@/sim/sectors';
import type { CareerProfile, LngLat, RegionId, RosterUnit, SectorDef, SectorDifficulty, Station, Text } from '@/sim/types';
import { labelPoint, openRing, pointInRing, ringBounds, signedArea } from '@/map/area';
import { regionOfCounty } from '../shell/helpers';
import { REGION_ORDER } from './helpers';

export type SectorState = 'covered' | 'offered' | 'neighbour' | 'later';

export interface SectorRow {
  sector: SectorDef;
  state: SectorState;
  /** The AI colleague at the sector's desk ("Maarja Tamm"). */
  colleague: string;
}

const STATE_ORDER: Record<SectorState, number> = { covered: 0, offered: 1, neighbour: 2, later: 3 };
export const DIFFICULTY_ORDER: SectorDifficulty[] = ['easy', 'normal', 'hard'];

export function colleagueName(s: Pick<SectorDef, 'colleague'> | undefined): string {
  const c = s?.colleague;
  return c ? `${c.firstName} ${c.lastName}`.trim() : '';
}

/** Sectors the career covers in a prefecture (every one when it covers the prefecture whole). */
export function coveredIn(p: CareerProfile, regionId: RegionId): string[] {
  return careerSectors(p, regionId);
}

/** True when the career covers the whole prefecture (also a prefecture without sector data). */
export function wholeIn(p: CareerProfile, regionId: RegionId): boolean {
  return coversWholeRegion(p, regionId);
}

/** The prefecture's sectors with the career's view of each: covered, offered, a neighbour's desk or not yet. */
export function sectorRows(p: CareerProfile, regionId: RegionId): SectorRow[] {
  const all = sectorsOf(regionId);
  const mine = new Set(coveredIn(p, regionId));
  const offered = new Set(p.offer?.regionId === regionId ? p.offer.choices : []);
  const near = new Set(neighbourSectors([...mine]).map((x) => x.id));
  return all
    .map((sector, i) => {
      const state: SectorState = mine.has(sector.id) ? 'covered' : offered.has(sector.id) ? 'offered' : near.has(sector.id) ? 'neighbour' : 'later';
      return { row: { sector, state, colleague: colleagueName(sector) }, i };
    })
    .sort((a, b) => STATE_ORDER[a.row.state] - STATE_ORDER[b.row.state] || a.i - b.i)
    .map((x) => x.row);
}

export interface Coverage {
  regionId: RegionId;
  covered: number;
  total: number;
  /** Covers every sector (or the prefecture has no sector data). */
  whole: boolean;
  /** Names of the covered sectors (empty when whole). */
  names: Text[];
}

export function coverageOf(p: CareerProfile, regionId: RegionId): Coverage {
  const total = sectorsOf(regionId).length;
  const ids = coveredIn(p, regionId);
  const whole = wholeIn(p, regionId);
  return {
    regionId,
    covered: whole ? total : ids.length,
    total,
    whole,
    names: whole ? [] : ids.map((id) => sectorById(id)?.name).filter((x): x is Text => !!x),
  };
}

/** Unlocked prefectures (home first, then the usual order). */
export function unlockedOrder(p: Pick<CareerProfile, 'regionId' | 'unlockedRegions'>): RegionId[] {
  const open = new Set<RegionId>([p.regionId, ...(p.unlockedRegions ?? [])]);
  return [p.regionId, ...REGION_ORDER.filter((r) => r !== p.regionId && open.has(r))];
}

export interface PostRow {
  stationId: string;
  station: Pick<Station, 'name' | 'short' | 'city'> | undefined;
  sector: SectorDef;
  price: number;
  upkeep: number;
  open: boolean;
}

/** Posts (SectorDef.posts) of the covered sectors of a prefecture: opened ones first. */
export function postRows(p: CareerProfile, regionId: RegionId): PostRow[] {
  const mine = new Set(coveredIn(p, regionId));
  const opened = new Set(p.openPosts ?? []);
  const stations = REGIONS[regionId]?.stations ?? [];
  const rows: PostRow[] = [];
  for (const sector of sectorsOf(regionId)) {
    if (!mine.has(sector.id)) continue;
    for (const post of sector.posts ?? []) {
      rows.push({
        stationId: post.stationId,
        station: stations.find((x) => x.id === post.stationId),
        sector,
        price: post.price,
        upkeep: post.upkeep,
        open: opened.has(post.stationId),
      });
    }
  }
  return rows.sort((a, b) => Number(b.open) - Number(a.open));
}

/** Name of a station of a prefecture (falls back to its id). */
export function stationName(regionId: RegionId, id: string): Text {
  const st = REGIONS[regionId]?.stations.find((x) => x.id === id);
  return st?.name ?? { et: id, en: id };
}

export interface RosterGroup {
  stationId: string;
  name: Text;
  units: RosterUnit[];
}

/** The roster grouped by station, the stations in the order of the region data (unknown ones last). */
export function rosterByStation(regionId: RegionId, roster: readonly RosterUnit[]): RosterGroup[] {
  const order = new Map((REGIONS[regionId]?.stations ?? []).map((s, i) => [s.id, i]));
  const groups = new Map<string, RosterUnit[]>();
  for (const u of roster) {
    const g = groups.get(u.stationId);
    if (g) g.push(u);
    else groups.set(u.stationId, [u]);
  }
  return [...groups.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 1e6) - (order.get(b[0]) ?? 1e6) || a[0].localeCompare(b[0]))
    .map(([stationId, units]) => ({ stationId, name: stationName(regionId, stationId), units }));
}

/** The career shift's area: its sectors (none when it covers the prefecture whole), opened posts, night cover. */
export interface ShiftArea {
  sectors: string[];
  posts: string[];
  cover: string[];
}

/**
 * Sectors and posts a career shift in `regionId` covers (NewShiftOptions.sectors / openPosts). A career that
 * covers the prefecture whole (every career from before sectors) passes none, so its shift plays as before.
 * `cover`: tonight's night cover when the shift is known to have one (the engine decides it at the start).
 */
export function careerShiftArea(p: CareerProfile, regionId: RegionId, cover: readonly string[] = []): ShiftArea {
  if (wholeIn(p, regionId)) return { sectors: [], posts: [], cover: [] };
  const sectors = coveredIn(p, regionId);
  const stations = new Set((REGIONS[regionId]?.stations ?? []).map((x) => x.id));
  const posts = [...new Set(p.openPosts ?? [])].filter((id) => stations.has(id));
  const night = [...new Set(cover)].filter((id) => sectorById(id)?.regionId === regionId && !sectors.includes(id));
  return { sectors, posts, cover: night };
}

// ── The small SVG map of a prefecture's sectors ─────────────────────────────

export interface SectorShape {
  /** Unique per shape: a sector may have several rings (an island apart from the rest). */
  key: string;
  id: string;
  d: string;
  /** Projected label spot, on the sector's largest ring only (null: no label here). */
  label: [number, number] | null;
  /** Projected area, for paint order (largest first, so a city sector sits on top of its county). */
  area: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A magnified view of the city sectors (Tallinn's districts, Tartu, Pärnu) that are only a few pixels on the
 * prefecture's map: drawn in a corner with the least land under it, or below the map when every corner
 * would hide land.
 */
export interface SectorInset {
  /** The inset in map units. */
  box: Box;
  /** The part of the prefecture map it magnifies. */
  frame: Box;
  /** The prefecture's land in the inset (clip it to `box`). */
  land: string;
  shapes: SectorShape[];
  /** The magnified sectors: their labels are in the inset, not on the prefecture map. */
  ids: string[];
}

export interface SectorMapGeometry {
  width: number;
  /** With the inset when it sits below the map. */
  height: number;
  /** The prefecture map alone. */
  mapHeight: number;
  /** The prefecture's land (its counties), also the clip of the sector shapes. */
  land: string;
  shapes: SectorShape[];
  inset: SectorInset | null;
}

type GeoFeature = {
  properties: { name: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
};

/** The prefecture's counties as polygons (outer ring first, then its lakes), [lon, lat]. */
function landPolys(regionId: RegionId): LngLat[][][] {
  const out: LngLat[][][] = [];
  for (const f of (countiesGeo as unknown as { features: GeoFeature[] }).features) {
    if (regionOfCounty(f.properties.name) !== regionId) continue;
    const polys = (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]) as number[][][][];
    for (const poly of polys) if (poly[0]?.length) out.push(poly.map((ring) => ring.map((c) => [c[0], c[1]] as LngLat)));
  }
  return out;
}

/** Geographic bounds of a prefecture's counties (the region's own bounds when the geodata has none). */
export function prefectureBounds(regionId: RegionId): [LngLat, LngLat] {
  const outer = landPolys(regionId).map((p) => p[0]);
  if (!outer.length) return REGIONS[regionId]?.bounds ?? [[21.7, 57.47], [28.28, 59.72]];
  return ringBounds(outer.flat());
}

interface Proj {
  project: (p: LngLat) => [number, number];
  invert: (p: [number, number]) => LngLat;
}

/** Equirectangular with cos(lat) x-scaling, `bounds` fitted and centred into `box`. */
function fitProjection(bounds: [LngLat, LngLat], box: Box): Proj {
  const [[w, s], [e, n]] = bounds;
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const spanX = Math.max(1e-9, (e - w) * k);
  const spanY = Math.max(1e-9, n - s);
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const ox = box.x + (box.w - spanX * scale) / 2;
  const oy = box.y + (box.h - spanY * scale) / 2;
  return {
    project: ([lon, lat]) => [ox + (lon - w) * k * scale, oy + (n - lat) * scale],
    invert: ([x, y]) => [w + (x - ox) / (k * scale), n - (y - oy) / scale],
  };
}

const pathOf = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z';

/** Projected land as one path, lakes as holes (vertices closer than `minDist` dropped, specks left out). */
function landPath(polys: LngLat[][][], proj: Proj, minDist: number): string {
  let d = '';
  for (const ring of polys.flat()) {
    const pts: [number, number][] = [];
    for (const c of ring) {
      const p = proj.project(c);
      const last = pts[pts.length - 1];
      if (!last || (p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2 >= minDist * minDist) pts.push(p);
    }
    if (pts.length < 4) continue;
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      a += x1 * y2 - x2 * y1;
    }
    if (Math.abs(a) / 2 < minDist * minDist * 2) continue;
    d += pathOf(pts);
  }
  return d;
}

const projArea = (pts: [number, number][]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};

const boxesMeet = (a: [LngLat, LngLat], b: [LngLat, LngLat]) => a[0][0] <= b[1][0] && b[0][0] <= a[1][0] && a[0][1] <= b[1][1] && b[0][1] <= a[1][1];
const inBox = (p: [number, number], b: Box) => p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h;

/** A sector is magnified when its largest ring is smaller than this share of the map's width. */
const INSET_SMALL = 0.125;
/** Inset width as a share of the map's width. */
const INSET_WIDTH = 0.42;
/** Most land an inset may hide in a corner before it goes below the map. */
const INSET_MAX_LAND = 0.2;

interface GeoRing {
  id: string;
  ring: LngLat[];
  /** |area| in degrees². */
  size: number;
  bounds: [LngLat, LngLat];
}

/** Label spot of a sector's ring, clear of the smaller sectors drawn on top of it and of `avoid`. */
function labelOf(o: GeoRing, rings: GeoRing[], avoid: LngLat[][] = []): LngLat | null {
  const over = rings.filter((x) => x.id !== o.id && x.size < o.size && boxesMeet(x.bounds, o.bounds)).map((x) => x.ring);
  return labelPoint(o.ring, [...over, ...avoid], 12) ?? labelPoint(o.ring, avoid, 12) ?? labelPoint(o.ring, [], 12);
}

const geomCache = new Map<string, SectorMapGeometry>();

/** Projected land, sector shapes and the city inset of a prefecture for an SVG `width` units wide (cached). */
export function sectorMapGeometry(regionId: RegionId, width = 320): SectorMapGeometry {
  const all = sectorsOf(regionId);
  const key = `${regionId}:${width}:${all.length}`;
  const hit = geomCache.get(key);
  if (hit) return hit;
  const pad = 6;
  const pb = prefectureBounds(regionId);
  const kx = Math.cos((((pb[0][1] + pb[1][1]) / 2) * Math.PI) / 180);
  const mapH = Math.round(((pb[1][1] - pb[0][1]) / ((pb[1][0] - pb[0][0]) * kx)) * (width - pad * 2) + pad * 2);
  const main = fitProjection(pb, { x: pad, y: pad, w: width - pad * 2, h: mapH - pad * 2 });
  const lands = landPolys(regionId);
  const land = landPath(lands, main, 0.6);
  const region = REGIONS[regionId];
  let outlines: { id: string; ring: LngLat[] }[] = [];
  try {
    outlines = region && all.length ? sectorOutlines(region, all.map((x) => x.id)) : [];
  } catch (e) {
    console.warn('[EPD career] sector outlines failed', e);
    outlines = [];
  }
  const rings: GeoRing[] = outlines
    .map((o) => ({ id: o.id, ring: openRing(o.ring) }))
    .filter((o) => o.ring.length >= 3)
    .map((o) => ({ ...o, size: Math.abs(signedArea(o.ring)), bounds: ringBounds(o.ring) }));
  const largest = new Map<string, GeoRing>();
  for (const o of rings) if (!largest.has(o.id) || largest.get(o.id)!.size < o.size) largest.set(o.id, o);

  // ── The city inset ──
  const projBox = (b: [LngLat, LngLat], p: Proj): Box => {
    const [x0, y1] = p.project(b[0]);
    const [x1, y0] = p.project(b[1]);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const small = [...largest.values()].filter((o) => {
    const b = projBox(o.bounds, main);
    return Math.max(b.w, b.h) < width * INSET_SMALL;
  });
  let inset: SectorInset | null = null;
  let height = mapH;
  if (small.length) {
    // One cluster: the small sectors near the first one (a prefecture has one big city).
    const seed = projBox(small[0].bounds, main);
    const cx = seed.x + seed.w / 2;
    const cy = seed.y + seed.h / 2;
    const cluster = small.filter((o) => {
      const b = projBox(o.bounds, main);
      return Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < width * 0.22;
    });
    const ids = cluster.map((o) => o.id);
    let [[w, s], [e, n]] = ringBounds(cluster.flatMap((o) => rings.filter((r) => r.id === o.id).map((r) => r.ring)).flat());
    // Room around the city, then a box between 4:5 and 3:2.
    const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
    const grow = 0.3;
    const dx0 = (e - w) * grow;
    const dy0 = (n - s) * grow;
    [w, e, s, n] = [w - dx0, e + dx0, s - dy0, n + dy0];
    const aspect = ((e - w) * k) / (n - s);
    if (aspect < 0.8) {
      const dx = ((n - s) * 0.8) / k - (e - w);
      [w, e] = [w - dx / 2, e + dx / 2];
    } else if (aspect > 1.5) {
      const dy = ((e - w) * k) / 1.5 - (n - s);
      [s, n] = [s - dy / 2, n + dy / 2];
    }
    const zoom: [LngLat, LngLat] = [
      [w, s],
      [e, n],
    ];
    const iw = Math.round(width * INSET_WIDTH);
    const ih = Math.round(Math.min(iw / (((e - w) * k) / (n - s)), mapH * 0.6));
    const frame = (() => {
      const b = projBox(zoom, main);
      return { x: b.x, y: b.y, w: Math.max(4, b.w), h: Math.max(4, b.h) };
    })();
    // The corner that hides the least land (and never the city itself).
    const landProj = lands.map((p) => p[0].map((c) => main.project(c) as LngLat));
    const m = 4;
    const corners: Box[] = [
      { x: width - iw - m, y: mapH - ih - m, w: iw, h: ih },
      { x: m, y: mapH - ih - m, w: iw, h: ih },
      { x: width - iw - m, y: m, w: iw, h: ih },
      { x: m, y: m, w: iw, h: ih },
    ];
    const N = 10;
    const scored = corners.map((b) => {
      let onLand = 0;
      let onCity = 0;
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          const p: [number, number] = [b.x + ((i + 0.5) * b.w) / N, b.y + ((j + 0.5) * b.h) / N];
          if (landProj.some((r) => pointInRing(p as LngLat, r))) onLand++;
          if (inBox(p, { x: frame.x - 6, y: frame.y - 6, w: frame.w + 12, h: frame.h + 12 })) onCity++;
        }
      return { b, land: onLand / (N * N), city: onCity / (N * N) };
    });
    const ok = scored.filter((x) => x.city === 0).sort((a, b) => a.land - b.land)[0];
    let box: Box;
    if (ok && ok.land <= INSET_MAX_LAND) box = ok.b;
    else {
      box = { x: width - iw - m, y: mapH + 2, w: iw, h: ih };
      height = mapH + ih + 2 + m;
    }
    const ip = fitProjection(zoom, box);
    const shapes: SectorShape[] = rings
      .filter((o) => boxesMeet(o.bounds, zoom))
      .map((o, i) => {
        const pts = o.ring.map((c) => ip.project(c));
        const at = ids.includes(o.id) && largest.get(o.id) === o ? labelOf(o, rings) : null;
        return { key: `inset:${o.id}:${i}`, id: o.id, d: pathOf(pts), label: at ? ip.project(at) : null, area: projArea(pts) };
      })
      .sort((a, b) => b.area - a.area);
    inset = { box, frame, land: landPath(lands, ip, 0.5), shapes, ids };
  }

  // ── The prefecture map ──
  const covered = inset && inset.box.y < mapH ? inset.box : null;
  const coveredRing: LngLat[][] = covered
    ? [
        [
          main.invert([covered.x - 4, covered.y - 4]),
          main.invert([covered.x + covered.w + 4, covered.y - 4]),
          main.invert([covered.x + covered.w + 4, covered.y + covered.h + 4]),
          main.invert([covered.x - 4, covered.y + covered.h + 4]),
        ],
      ]
    : [];
  const shapes: SectorShape[] = rings
    .map((o, i) => {
      const pts = o.ring.map((c) => main.project(c));
      const labelled = largest.get(o.id) === o && !inset?.ids.includes(o.id);
      const at = labelled ? labelOf(o, rings, coveredRing) : null;
      return { key: `${o.id}:${i}`, id: o.id, d: pathOf(pts), label: at ? main.project(at) : null, area: projArea(pts) };
    })
    .sort((a, b) => b.area - a.area);
  const out: SectorMapGeometry = { width, height, mapHeight: mapH, land, shapes, inset };
  geomCache.set(key, out);
  return out;
}
