/**
 * The camera scene's street read from the street map (src/cctv/tiles.ts, docs/CCTV.md sections 4 and 4.1): a
 * synthetic block of streets written as zoom 15 vector tiles through tests/fixtures/mapdata.ts, read back into
 * scene metres, and an in-memory PMTiles archive for readStreet and its failure paths.
 *
 * A real Protomaps archive can be tried too: set EPD_PMTILES_SAMPLE to its path (Florence, the sample the project
 * uses) and the last block reads thirty points of it. Without it that block is skipped.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PbfWriter } from 'pbf';
import { PMTiles } from 'pmtiles';
import { frameAt, lineLength, nearestOnLine, pointInRing, ringArea, type V2 } from '@/cctv/math';
import { buildSite } from '@/cctv/site';
import { openedStreetArchive, probeStreetTiles, resetStreetProbes } from '@/map/streetTiles';
import {
  buildingStyle,
  MAX_AREA_VERTICES,
  MAX_BUILDINGS,
  MAX_HOLE_VERTICES,
  MAX_HOLES,
  MAX_ROADS,
  readStreet,
  streetFromTiles,
  tilesAround,
  type TileArchive,
  type TileData,
} from '@/cctv/tiles';
import type { Building, Road, StreetData } from '@/cctv/types';
import type { LngLat } from '@/sim/types';
import {
  clipRingToSquare,
  encodeMvt,
  latToTile,
  lonToTile,
  writePmtiles,
  type MvtFeature,
  type MvtLayer,
  type Props,
  tileLat,
  tileLon,
} from './fixtures/mapdata';

const Z = 15;

/** A feature drawn in scene metres around an origin; written into every tile it is given to. */
interface SceneFeature {
  layer: 'roads' | 'buildings' | 'landuse' | 'water';
  id?: number;
  type: 2 | 3;
  props: Props;
  geom: V2[][];
}

/** The tile of a point at zoom z. */
const tileOf = (p: LngLat, z: number) => ({
  z,
  x: Math.floor(lonToTile(p[0], z)),
  y: Math.floor(latToTile(p[1], z)),
});

/**
 * Encode scene features into the tile (z, x, y) around `origin`: whole geometry, the reader clips it to the tile.
 * With `buffer`, polygons are clipped to the tile and that many units around it, as a real tile producer does.
 */
function encodeTile(
  origin: LngLat,
  t: { z: number; x: number; y: number },
  feats: SceneFeature[],
  buffer?: number,
): Uint8Array {
  const frame = frameAt(origin);
  const toTile = (p: V2): [number, number] => {
    const [lng, lat] = frame.toLngLat(p);
    return [Math.round((lonToTile(lng, t.z) - t.x) * 4096), Math.round((latToTile(lat, t.z) - t.y) * 4096)];
  };
  const layers: MvtLayer[] = [];
  for (const name of ['roads', 'buildings', 'landuse', 'water'] as const) {
    const features: MvtFeature[] = feats
      .filter((f) => f.layer === name)
      .map((f) => {
        let geom = f.geom.map((g) => g.map(toTile));
        if (buffer !== undefined && f.type === 3)
          geom = geom.map((g) => clipRingToSquare(g, -buffer, 4096 + buffer)).filter((g) => g.length >= 3);
        return { id: f.id, type: f.type, props: f.props, geom };
      })
      .filter((f) => f.geom.length);
    if (features.length) layers.push({ name, features });
  }
  return encodeMvt(layers);
}

/** All the tiles around `origin` holding `feats`: those readStreet fetches (the circle of 200 m). */
function tilesFor(origin: LngLat, feats: SceneFeature[], radius = 200, z = Z, buffer?: number): TileData[] {
  return tilesAround(origin, radius, z).map((t) => ({ ...t, data: encodeTile(origin, t, feats, buffer) }));
}

const rect = (x0: number, y0: number, x1: number, y1: number): V2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const road = (props: Props, ...pts: V2[]): SceneFeature => ({ layer: 'roads', type: 2, props, geom: [pts] });
const house = (id: number | undefined, ring: V2[], props: Props = {}): SceneFeature => ({
  layer: 'buildings',
  id,
  type: 3,
  props: { kind: 'building', ...props },
  geom: [ring],
});

/** Tallinn: a tile border runs 15 m east of the incident, so the block is read from two tiles. */
function borderOrigin(): { origin: LngLat; borderX: number } {
  const lat = 59.437;
  const x = Math.floor(lonToTile(24.75, Z)) + 1;
  const borderLng = (x / 2 ** Z) * 360 - 180;
  const origin: LngLat = [borderLng - 15 / (111194.93 * Math.cos((lat * Math.PI) / 180)), lat];
  return { origin, borderX: 15 };
}

/** The synthetic block: streets of several classes, buildings with and without heights, landuse and water. */
function block(): SceneFeature[] {
  return [
    road({ kind: 'major_road', kind_detail: 'secondary', name: 'Narva mnt' }, [-300, -8], [0, -8], [300, -8]),
    road(
      { kind: 'minor_road', kind_detail: 'residential', oneway: 'yes', name: 'Kivi' },
      [-60, -8],
      [-60, 80],
      [-60, 300],
    ),
    road({ kind: 'minor_road', kind_detail: 'service', service: 'parking_aisle' }, [60, 40], [90, 40]),
    road({ kind: 'path', kind_detail: 'footway' }, [-100, 60], [100, 60]),
    road({ kind: 'path', kind_detail: 'sidewalk' }, [-100, -2], [100, -2]),
    road({ kind: 'path', kind_detail: 'pedestrian' }, [40, -8], [40, 80]),
    road({ kind: 'rail', kind_detail: 'tram' }, [-200, -45], [200, -45]),
    road({ kind: 'major_road', kind_detail: 'primary', is_tunnel: true }, [110, -200], [110, 200]),
    road({ kind: 'other', kind_detail: 'living_street' }, [-150, 120], [-90, 120]),
    road({ kind: 'highway', kind_detail: 'motorway' }, [-300, -140], [300, -140]),
    road({ kind: 'major_road', kind_detail: 'trunk', name: 'Far' }, [-300, 400], [300, 400]),
    // Cut by the tile border at x = 15 m: one piece from each tile, same id.
    house(101, rect(5, 2, 25, 17)),
    house(102, rect(-40, 2, -20, 14), { height: 21, min_height: 3 }),
    // Given clockwise.
    house(103, rect(-15, 2, 0, 14).reverse()),
    house(105, rect(-30, -30, -10, -18)),
    // Two outer rings, one with a courtyard.
    {
      layer: 'buildings',
      id: 104,
      type: 3,
      props: { kind: 'building' },
      geom: [rect(-40, 25, -28, 37), rect(-36, 29, -32, 33).reverse(), rect(-24, 25, -14, 35)],
    },
    house(undefined, rect(60, 70, 70, 80)),
    house(106, rect(-80, 30, -80.2, 40)),
    house(107, [
      [-90, 0],
      [-85, 0],
      [-80, 0],
    ]),
    house(108, rect(-90, 30, -85, 35), { kind: 'building_part' }),
    house(109, rect(70, -30, 90, -20), { kind_detail: 'roof' }),
    house(110, rect(190, 0, 260, 30)),
    house(111, rect(400, 0, 420, 20)),
    { layer: 'landuse', type: 3, props: { kind: 'park' }, geom: [rect(-140, 70, -70, 110)] },
    { layer: 'landuse', type: 3, props: { kind: 'residential' }, geom: [rect(-150, -150, 150, 150)] },
    { layer: 'landuse', type: 3, props: { kind: 'pedestrian' }, geom: [rect(30, 0, 50, 30)] },
    {
      layer: 'water',
      type: 3,
      props: { kind: 'water' },
      geom: [rect(-150, -120, -60, -60), rect(-120, -100, -100, -80).reverse()],
    },
  ];
}

function readBlock(): StreetData {
  const { origin } = borderOrigin();
  return streetFromTiles(tilesFor(origin, block()), origin);
}

const byId = (s: StreetData, id: number) => s.buildings.filter((b) => b.id === id);
const roadsOf = (s: StreetData, f: (r: Road) => boolean) => s.roads.filter(f);
const near = (r: Road, p: V2) => nearestOnLine(p, r.pts).d;

/** Every ring of the street anticlockwise, open, without repeated vertices and finite. */
function checkRings(s: StreetData): string[] {
  const bad: string[] = [];
  const rings: [string, readonly V2[]][] = [
    ...s.buildings.map((b): [string, readonly V2[]] => [`building ${b.id}`, b.ring]),
    ...s.areas.map((a, i): [string, readonly V2[]] => [`area ${i} ${a.kind}`, a.ring]),
  ];
  for (const [name, ring] of rings) {
    if (ring.length < 3) bad.push(`${name}: ${ring.length} vertices`);
    if (!(ringArea(ring) > 0)) bad.push(`${name}: area ${ringArea(ring)}`);
    if (ring.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) bad.push(`${name}: not finite`);
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) bad.push(`${name}: closed`);
    if (spikes(ring)) bad.push(`${name}: ${spikes(ring)} zero-width spikes`);
  }
  for (const r of s.roads)
    if (r.pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1])))
      bad.push(`road ${r.cls}: not finite`);
  for (const b of s.buildings)
    if (!(b.height > 0) || !(b.area > 0) || !Number.isFinite(b.base)) bad.push(`building ${b.id}: size`);
  return bad;
}

describe('tilesAround', () => {
  it('gives one to four tiles that cover the circle', () => {
    for (const [lng, lat] of [
      [24.75, 59.437],
      [26.72, 58.38],
      [27.99, 59.37],
      [11.25, 43.77],
    ]) {
      for (let k = 0; k < 20; k++) {
        const o: LngLat = [lng + k * 0.00073, lat + k * 0.00041];
        const ts = tilesAround(o, 160, Z);
        expect(ts.length).toBeGreaterThanOrEqual(1);
        expect(ts.length).toBeLessThanOrEqual(4);
        const own = tileOf(o, Z);
        expect(ts.some((t) => t.x === own.x && t.y === own.y)).toBe(true);
        // Points 160 m away in four directions fall in one of them.
        const f = frameAt(o);
        for (const p of [
          [160, 0],
          [-160, 0],
          [0, 160],
          [0, -160],
        ] as V2[]) {
          const t = tileOf(f.toLngLat(p), Z);
          expect(ts.some((q) => q.x === t.x && q.y === t.y)).toBe(true);
        }
      }
    }
  });

  it('gives two tiles beside a tile border', () => {
    const { origin } = borderOrigin();
    expect(tilesAround(origin, 160, Z).length).toBeGreaterThanOrEqual(2);
  });
});

describe('streetFromTiles: roads', () => {
  const s = readBlock();

  it('is a tiles street with the given radius', () => {
    expect(s.source).toBe('tiles');
    expect(s.radius).toBe(160);
    expect(checkRings(s)).toEqual([]);
  });

  it('classifies the roads as the build script does, plus walking and rail', () => {
    const named = roadsOf(s, (r) => r.name === 'Narva mnt');
    expect(named.length).toBeGreaterThanOrEqual(2); // one piece from each tile
    expect(named.every((r) => r.cls === 'secondary' && r.oneway === 0 && r.width > 6)).toBe(true);
    expect(roadsOf(s, (r) => r.cls === 'residential' && r.name === 'Kivi').every((r) => r.oneway === 1)).toBe(
      true,
    );
    expect(roadsOf(s, (r) => r.cls === 'residential').length).toBeGreaterThan(0);
    expect(roadsOf(s, (r) => r.cls === 'path').length).toBeGreaterThan(0);
    expect(roadsOf(s, (r) => r.cls === 'pedestrian').length).toBe(1);
    expect(roadsOf(s, (r) => r.cls === 'tram').length).toBeGreaterThan(0);
    expect(roadsOf(s, (r) => r.cls === 'living').length).toBe(1);
    expect(roadsOf(s, (r) => r.cls === 'motorway').every((r) => r.oneway === 1)).toBe(true);
    // A parking aisle (skipped by the build script) and a sidewalk are not drawn.
    expect(roadsOf(s, (r) => r.cls === 'service').length).toBe(0);
    expect(roadsOf(s, (r) => r.cls === 'path' && near(r, [0, -2]) < 1).length).toBe(0);
  });

  it('marks the tunnel', () => {
    const t = roadsOf(s, (r) => r.cls === 'primary');
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((r) => r.tunnel === true)).toBe(true);
    expect(roadsOf(s, (r) => r.cls !== 'primary').some((r) => r.tunnel)).toBe(false);
  });

  it('cuts roads at the circle and leaves out what is beyond it', () => {
    for (const r of s.roads) for (const p of r.pts) expect(Math.hypot(p[0], p[1])).toBeLessThanOrEqual(160.5);
    expect(roadsOf(s, (r) => r.name === 'Far').length).toBe(0);
    // The main street spans the whole circle: its pieces add up to about the chord at 8 m.
    const total = roadsOf(s, (r) => r.name === 'Narva mnt').reduce((a, r) => a + lineLength(r.pts), 0);
    expect(total).toBeGreaterThan(2 * Math.sqrt(160 * 160 - 64) - 3);
    expect(total).toBeLessThan(2 * 160 + 1);
  });

  it('pieces of one road from two tiles meet at the border', () => {
    const { borderX } = borderOrigin();
    const ends = roadsOf(s, (r) => r.name === 'Narva mnt').flatMap((r) => [
      r.pts[0],
      r.pts[r.pts.length - 1],
    ]);
    const atBorder = ends.filter((p) => Math.abs(p[0] - borderX) < 1);
    expect(atBorder.length).toBe(2);
    expect(Math.hypot(atBorder[0][0] - atBorder[1][0], atBorder[0][1] - atBorder[1][1])).toBeLessThan(0.5);
  });

  it('gives pavements to town streets with buildings beside them', () => {
    const main = roadsOf(s, (r) => r.name === 'Narva mnt');
    expect(main.some((r) => r.walk)).toBe(true);
    expect(roadsOf(s, (r) => r.name === 'Kivi').some((r) => r.walk)).toBe(true);
    expect(roadsOf(s, (r) => r.cls === 'living').every((r) => !r.walk)).toBe(true);
    expect(
      roadsOf(s, (r) => r.cls === 'motorway' || r.cls === 'path' || r.cls === 'tram').every((r) => !r.walk),
    ).toBe(true);
  });

  it('a main road needs buildings on both sides for pavements', () => {
    const { origin } = borderOrigin();
    const oneSide = streetFromTiles(
      tilesFor(origin, [
        road({ kind: 'major_road', kind_detail: 'primary' }, [-200, 0], [200, 0]),
        house(1, rect(-10, 5, 10, 15)),
      ]),
      origin,
    );
    expect(oneSide.roads.every((r) => !r.walk)).toBe(true);
    const both = streetFromTiles(
      tilesFor(origin, [
        road({ kind: 'major_road', kind_detail: 'primary' }, [-200, 0], [200, 0]),
        house(1, rect(-10, 5, 10, 15)),
        house(2, rect(-10, -15, 10, -5)),
      ]),
      origin,
    );
    expect(both.roads.some((r) => r.walk)).toBe(true);
  });
});

describe('streetFromTiles: buildings and areas', () => {
  const s = readBlock();

  it('keeps both pieces of a building cut by the tile border, with one height', () => {
    const pieces = byId(s, 101);
    expect(pieces.length).toBe(2);
    expect(pieces[0].height).toBe(pieces[1].height);
    expect(pieces[0].roof).toBe(pieces[1].roof);
    expect(Math.abs(pieces[0].area + pieces[1].area - 300)).toBeLessThan(6);
    const { borderX } = borderOrigin();
    for (const p of pieces) {
      const xs = p.ring.map((q) => q[0]);
      expect(Math.min(...xs) >= borderX - 0.5 || Math.max(...xs) <= borderX + 0.5).toBe(true);
    }
  });

  it('takes the map height and base', () => {
    const [b] = byId(s, 102);
    expect(b.height).toBeCloseTo(21, 5);
    expect(b.base).toBeCloseTo(3, 5);
    expect(b.roof).toBe('flat');
  });

  it('turns a clockwise ring anticlockwise', () => {
    const [b] = byId(s, 103);
    expect(ringArea(b.ring)).toBeGreaterThan(170);
  });

  it('splits a multi-part building and drops its courtyard', () => {
    const parts = byId(s, 104);
    expect(parts.length).toBe(2);
    const areas = parts.map((p) => p.area).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(100, -1);
    expect(areas[1]).toBeCloseTo(144, -1);
    expect(parts.every((p) => p.ring.length === 4 && p.roof === 'flat')).toBe(true);
  });

  it('makes a stable id for a building without one', () => {
    const made = s.buildings.filter((b) => ![101, 102, 103, 104, 105, 109, 110].includes(b.id));
    expect(made.length).toBe(1);
    expect(made[0].id).toBeGreaterThan(0);
    expect(readBlock().buildings.find((b) => pointInRing([65, 75], b.ring))?.id).toBe(made[0].id);
  });

  it('drops slivers, degenerate rings, building parts and what is far', () => {
    for (const id of [106, 107, 108, 111]) expect(byId(s, id)).toEqual([]);
  });

  it('marks a roof on posts open', () => {
    expect(byId(s, 109)[0].open).toBe(true);
    expect(byId(s, 105)[0].open).toBeUndefined();
  });

  it('keeps a building that reaches into 200 m, clipped to the square of 200 m', () => {
    const [b] = byId(s, 110);
    expect(Math.abs(b.area - 10 * 30)).toBeLessThan(3);
    expect(Math.max(...b.ring.map((p) => p[0]))).toBeCloseTo(200, 0);
  });

  it('reads landuse and water with their holes, without unknown kinds', () => {
    const kinds = s.areas.map((a) => a.kind).sort();
    expect(kinds).toEqual(['green', 'paved', 'water']);
    const water = s.areas.find((a) => a.kind === 'water')!;
    expect(pointInRing([-110, -90], water.ring)).toBe(false);
    expect(pointInRing([-140, -70], water.ring)).toBe(true);
    expect(ringArea(water.ring)).toBeCloseTo(90 * 60 - 20 * 20, -1);
    // Largest first, so smaller areas draw over larger ones.
    for (let i = 1; i < s.areas.length; i++)
      expect(ringArea(s.areas[i].ring)).toBeLessThanOrEqual(ringArea(s.areas[i - 1].ring));
  });

  it('buildSite gives a site on it', () => {
    let ok = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const site = buildSite(s, seed);
      if (!site) continue;
      ok++;
      expect(site.drive.length).toBeGreaterThan(24);
      expect(Math.hypot(site.spot[0], site.spot[1])).toBeLessThan(40);
      expect(s.buildings.some((b) => pointInRing(site.spot, b.ring))).toBe(false);
    }
    expect(ok).toBe(20);
  });
});

describe('streetFromTiles: bounds', () => {
  const { origin } = borderOrigin();

  it('keeps the 600 nearest buildings and the 300 nearest roads', () => {
    const feats: SceneFeature[] = [];
    for (let i = 0; i < 900; i++) {
      const a = i * 2.39996;
      const r = 6 + (i / 900) * 180;
      const c: V2 = [Math.cos(a) * r, Math.sin(a) * r];
      feats.push(house(1000 + i, rect(c[0] - 1.5, c[1] - 1.5, c[0] + 1.5, c[1] + 1.5)));
    }
    for (let i = 0; i < 400; i++)
      feats.push(
        road({ kind: 'path', kind_detail: 'footway' }, [-150, -150 + i * 0.75], [150, -150 + i * 0.75]),
      );
    const s = streetFromTiles(tilesFor(origin, feats), origin);
    const ids = new Set(s.buildings.map((b) => b.id));
    expect(ids.size).toBeLessThanOrEqual(MAX_BUILDINGS);
    expect(s.buildings.length).toBeLessThanOrEqual(MAX_BUILDINGS);
    expect(ids.has(1000)).toBe(true);
    expect(ids.has(1899)).toBe(false);
    expect(s.roads.length).toBe(MAX_ROADS);
    expect(Math.max(...s.roads.map((r) => near(r, [0, 0])))).toBeLessThan(120);
  });

  it('simplifies a large area to the vertex limit', () => {
    const ring: V2[] = [];
    for (let i = 0; i < 1500; i++) {
      const a = (i / 1500) * Math.PI * 2;
      ring.push([Math.cos(a) * 140 + Math.sin(a * 37) * 2, Math.sin(a) * 140]);
    }
    const s = streetFromTiles(
      tilesFor(origin, [{ layer: 'landuse', type: 3, props: { kind: 'forest' }, geom: [ring] }]),
      origin,
    );
    expect(s.areas.length).toBeGreaterThan(0);
    for (const a of s.areas) {
      expect(a.kind).toBe('forest');
      expect(a.ring.length).toBeLessThanOrEqual(MAX_AREA_VERTICES);
    }
    const total = s.areas.reduce((x, a) => x + ringArea(a.ring), 0);
    expect(total).toBeGreaterThan(Math.PI * 140 * 140 * 0.95);
  });
});

describe('buildingStyle: section 4.1', () => {
  const ids = Array.from({ length: 400 }, (_, i) => 7000 + i * 13);
  const all = (area: number, long: number, short: number, dense = false) =>
    ids.map((id) => buildingStyle(id, area, long, short, dense));

  it('is the same for the same building', () => {
    expect(buildingStyle(42, 400, 20, 20, true)).toEqual(buildingStyle(42, 400, 20, 20, true));
  });

  it('sheds and kiosks', () => {
    const s = all(16, 4, 4);
    expect(s.every((x) => x.height >= 2.4 && x.height <= 3)).toBe(true);
    expect(new Set(s.map((x) => x.roof)).size).toBe(2);
  });

  it('houses: one or two floors, pitched', () => {
    const s = all(120, 12, 10);
    expect(new Set(s.map((x) => x.height))).toEqual(new Set([3.4, 6.2]));
    expect(s.every((x) => x.roof === 'gable')).toBe(true);
  });

  it('panel blocks: five floors, one in four nine', () => {
    const s = all(720, 60, 12);
    expect(new Set(s.map((x) => x.height))).toEqual(new Set([16, 28]));
    const tall = s.filter((x) => x.height === 28).length / s.length;
    expect(tall).toBeGreaterThan(0.17);
    expect(tall).toBeLessThan(0.33);
    expect(s.every((x) => x.roof === 'flat')).toBe(true);
  });

  it('halls: 6 to 11 m, flat', () => {
    const s = all(2000, 50, 40);
    expect(s.every((x) => x.height >= 6 && x.height <= 11 && x.roof === 'flat')).toBe(true);
  });

  it('town houses: 2 to 5 floors, flat; in a dense town one in five pitched', () => {
    const s = all(400, 20, 20);
    expect(new Set(s.map((x) => x.height))).toEqual(new Set([6.8, 9.8, 12.8, 15.8]));
    expect(s.every((x) => x.roof === 'flat')).toBe(true);
    const pitched = all(400, 20, 20, true).filter((x) => x.roof === 'gable').length / ids.length;
    expect(pitched).toBeGreaterThan(0.12);
    expect(pitched).toBeLessThan(0.28);
  });

  it('a building without a map height gets one from the table', () => {
    const s = readBlock();
    const [b] = byId(s, 105);
    expect(b.height).toBeCloseTo(buildingStyle(105, 240, 20, 12, false).height, 5);
  });
});

// ---------------------------------------------------------------------------- readStreet

/** An in-memory PMTiles archive (the pmtiles package's PMTiles class over a byte source). */
function archiveOf(bytes: Uint8Array): PMTiles {
  return new PMTiles({
    getKey: () => 'memory',
    getBytes: async (offset: number, length: number) => ({
      data: bytes.slice(offset, offset + length).buffer,
    }),
  });
}

function blockArchive(z = Z, feats = block()): { archive: PMTiles; origin: LngLat } {
  const { origin } = borderOrigin();
  const tiles = tilesFor(origin, feats, 200, z).map((t) => ({ ...t, data: t.data as Uint8Array }));
  return { archive: archiveOf(writePmtiles(tiles, [24, 59, 25.5, 60])), origin };
}

describe('readStreet', () => {
  it('reads the street through a PMTiles archive', async () => {
    const { archive, origin } = blockArchive();
    const s = await readStreet(archive, origin);
    expect(s).not.toBeNull();
    expect(s!.source).toBe('tiles');
    expect(s!.roads.length).toBe(readBlock().roads.length);
    expect(byId(s!, 101).length).toBe(2);
  });

  it('reads the deepest zoom of an archive that stops at 14', async () => {
    const { archive, origin } = blockArchive(14);
    const s = await readStreet(archive, origin);
    expect(s).not.toBeNull();
    expect(s!.roads.some((r) => r.name === 'Narva mnt')).toBe(true);
  });

  it('gives null for an archive that stops at 13', async () => {
    const { archive, origin } = blockArchive(13);
    expect(await readStreet(archive, origin)).toBeNull();
  });

  it('gives null where there is no tile', async () => {
    const { archive } = blockArchive();
    expect(await readStreet(archive, [26.72, 58.38])).toBeNull();
  });

  it('gives null when no road is near', async () => {
    const { archive, origin } = blockArchive(Z, [
      house(1, rect(-10, -10, 10, 10)),
      road({ kind: 'rail', kind_detail: 'rail' }, [-150, 0], [150, 0]),
    ]);
    expect(await readStreet(archive, origin)).toBeNull();
  });

  it('gives null for a tile that does not parse', async () => {
    const { origin } = borderOrigin();
    const garbage = new Uint8Array(512).map((_, i) => (i * 97 + 13) & 255);
    const bytes = writePmtiles(
      tilesAround(origin, 160, Z).map((t) => ({ ...t, data: garbage })),
      [24, 59, 25.5, 60],
    );
    expect(await readStreet(archiveOf(bytes), origin)).toBeNull();
  });

  it('gives null when the archive throws', async () => {
    const broken: TileArchive = {
      getHeader: async () => ({ minZoom: 0, maxZoom: 15 }),
      getZxy: async () => {
        throw new Error('Bad response code: 500');
      },
    };
    expect(await readStreet(broken, borderOrigin().origin)).toBeNull();
    const noHeader: TileArchive = {
      getHeader: () => Promise.reject(new Error('magic number')),
      getZxy: async () => undefined,
    };
    expect(await readStreet(noHeader, borderOrigin().origin)).toBeNull();
  });

  it('gives null after the timeout when the archive never answers', async () => {
    const stuck: TileArchive = {
      getHeader: async () => ({ minZoom: 0, maxZoom: 15 }),
      getZxy: () => new Promise(() => {}),
    };
    const t0 = Date.now();
    expect(await readStreet(stuck, borderOrigin().origin, { timeoutMs: 60 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('gives null when aborted', async () => {
    const stuck: TileArchive = {
      getHeader: () => new Promise(() => {}),
      getZxy: async () => undefined,
    };
    const ctl = new AbortController();
    const p = readStreet(stuck, borderOrigin().origin, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 10);
    expect(await p).toBeNull();
    expect(
      await readStreet(blockArchive().archive, borderOrigin().origin, { signal: AbortSignal.abort() }),
    ).toBeNull();
  });
});

describe('openedStreetArchive (src/map/streetTiles.ts)', () => {
  const URL_ = 'https://example.test/epd/tiles/estonia.pmtiles';
  const bytes = () => {
    const { origin } = borderOrigin();
    return writePmtiles(
      tilesFor(origin, block()).map((t) => ({ ...t, data: t.data as Uint8Array })),
      [24, 59, 25.5, 60],
    );
  };
  /** A server with range support for `body`; each answer waits for `gate` when one is given. */
  const serve = (body: Uint8Array, gate?: Promise<void>) =>
    vi.fn(async (_url: string, init?: RequestInit) => {
      await gate;
      const m = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('range') ?? '');
      const part = m ? body.slice(Number(m[1]), Number(m[2]) + 1) : body;
      return new Response(part.buffer as ArrayBuffer, {
        status: m ? 206 : 200,
        headers: { 'Content-Length': String(part.byteLength) },
      });
    });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetStreetProbes();
  });

  it('is the archive an ok probe opened, and readStreet reads it', async () => {
    vi.stubGlobal('fetch', serve(bytes()));
    expect(openedStreetArchive(URL_)).toBeUndefined();
    expect(await probeStreetTiles(URL_)).toBe('ok');
    const archive = openedStreetArchive(URL_);
    expect(archive).toBeDefined();
    expect(await readStreet(archive!, borderOrigin().origin)).not.toBeNull();
  });

  it('is not set by a probe still running when the probes were reset', async () => {
    let open = () => {};
    const gate = new Promise<void>((resolve) => (open = resolve));
    vi.stubGlobal('fetch', serve(bytes(), gate));
    const probe = probeStreetTiles(URL_);
    expect(openedStreetArchive(URL_)).toBeUndefined();
    resetStreetProbes();
    open();
    expect(await probe).toBe('ok');
    expect(openedStreetArchive(URL_)).toBeUndefined();
  });

  it('stays when a forced re-probe fails on the network', async () => {
    vi.stubGlobal('fetch', serve(bytes()));
    expect(await probeStreetTiles(URL_)).toBe('ok');
    const archive = openedStreetArchive(URL_);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await probeStreetTiles(URL_, { force: true })).toBe('network');
    expect(openedStreetArchive(URL_)).toBe(archive);
  });
});

// ---------------------------------------------------------------------------- the reviewers' cases

/** The middle of a tile at 59.43 N: the square of 200 m around it lies in that one tile (about 620 m across). */
function midTileOrigin(): LngLat {
  const x = Math.floor(lonToTile(24.75, Z)) + 0.5;
  const y = Math.floor(latToTile(59.43, Z)) + 0.5;
  return [tileLon(x, Z), tileLat(y, Z)];
}

/** Vertices where a ring turns straight back on itself (a zero-width spike). */
function spikes(ring: readonly V2[]): number {
  let n = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i + ring.length - 1) % ring.length];
    const b = ring[i];
    const c = ring[(i + 1) % ring.length];
    const u = [b[0] - a[0], b[1] - a[1]];
    const v = [c[0] - b[0], c[1] - b[1]];
    if (u[0] * v[0] + u[1] * v[1] < -0.999 * Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])) n++;
  }
  return n;
}

const inSquare = (ring: readonly V2[], half: number) =>
  ring.every((p) => Math.abs(p[0]) <= half + 0.5 && Math.abs(p[1]) <= half + 0.5);

describe('streetFromTiles: what the reviewers found', () => {
  it('keeps a park, a water and a building the incident stands in, clipped to the square of 200 m', () => {
    const origin = midTileOrigin();
    expect(tilesAround(origin, 200, Z).length).toBe(1);
    const s = streetFromTiles(
      tilesFor(origin, [
        { layer: 'landuse', type: 3, props: { kind: 'park' }, geom: [rect(-900, -900, 900, 900)] },
        { layer: 'water', type: 3, props: { kind: 'water' }, geom: [rect(-900, -900, 900, 900)] },
        house(7, rect(-250, -250, 250, 250)),
        // A long wall whose corners are 300 m away.
        house(8, rect(-300, 20, 300, 40)),
      ]),
      origin,
    );
    expect(s.areas.map((a) => a.kind).sort()).toEqual(['green', 'water']);
    for (const a of s.areas) {
      expect(pointInRing([0, 0], a.ring)).toBe(true);
      expect(inSquare(a.ring, 200)).toBe(true);
      expect(ringArea(a.ring)).toBeCloseTo(400 * 400, -3);
    }
    const [around] = byId(s, 7);
    expect(pointInRing([0, 0], around.ring)).toBe(true);
    expect(inSquare(around.ring, 200)).toBe(true);
    const [wall] = byId(s, 8);
    expect(wall.area).toBeCloseTo(400 * 20, -2);
  });

  it('leaves no zero-width spike where a concave ring is cut on the tile border', () => {
    const { origin } = borderOrigin();
    // The notch's tip lies on the border (x = 15 m): clipped to the west tile, the cut runs 10 -> 4 -> 16 along it.
    const ring: V2[] = [
      [0, 10],
      [18, 10],
      [18, 4],
      [15, 4],
      [25, 2],
      [25, 16],
      [0, 16],
    ];
    const s = streetFromTiles(tilesFor(origin, [house(300, ring)]), origin);
    const pieces = byId(s, 300);
    expect(pieces.length).toBe(2);
    for (const p of pieces) expect(spikes(p.ring)).toBe(0);
    const west = pieces.find((p) => Math.max(...p.ring.map((q) => q[0])) < 15.5)!;
    expect(west.area).toBeCloseTo(15 * 6, -1);
  });

  it('keeps the island out of the lake', () => {
    const { origin } = borderOrigin();
    const s = streetFromTiles(
      tilesFor(origin, [
        {
          layer: 'water',
          type: 3,
          props: { kind: 'water' },
          geom: [rect(-120, -120, 120, 120), rect(-40, 10, 40, 90).reverse()],
        },
        house(400, rect(-5, 45, 5, 55)),
      ]),
      origin,
    );
    const water = s.areas.filter((a) => a.kind === 'water');
    // The lake and its island are both cut by the tile border at x = 15 m.
    expect(water.length).toBe(2);
    for (const p of [
      [0, 50],
      [30, 50],
      [-35, 15],
    ] as V2[])
      expect(water.some((a) => pointInRing(p, a.ring))).toBe(false);
    for (const p of [
      [0, -50],
      [30, -50],
      [0, 100],
      [-60, 50],
      [60, 50],
    ] as V2[])
      expect(water.some((a) => pointInRing(p, a.ring))).toBe(true);
    const total = water.reduce((x, a) => x + ringArea(a.ring), 0);
    expect(Math.abs(total - (240 * 240 - 80 * 80))).toBeLessThan(240 * 240 * 0.01);
    expect(byId(s, 400).length).toBe(1);
  });

  it('reads a ring of 20000 vertices in well under 100 ms', () => {
    const origin = midTileOrigin();
    const ring: V2[] = [];
    for (let i = 0; i < 20000; i++) {
      const a = (i / 20000) * Math.PI * 2;
      const r = 150 + Math.sin(a * 400) * 3;
      ring.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const tiles = tilesFor(origin, [{ layer: 'water', type: 3, props: { kind: 'water' }, geom: [ring] }]);
    streetFromTiles(tiles, origin);
    const t0 = performance.now();
    const s = streetFromTiles(tiles, origin);
    expect(performance.now() - t0).toBeLessThan(100);
    expect(s.areas.length).toBe(1);
    expect(s.areas[0].ring.length).toBeLessThanOrEqual(MAX_AREA_VERTICES);
    expect(ringArea(s.areas[0].ring)).toBeCloseTo(Math.PI * 150 * 150, -3);
  });

  it('reads a road lying on a tile border once', () => {
    const { origin } = borderOrigin();
    const s = streetFromTiles(
      tilesFor(origin, [
        road({ kind: 'minor_road', kind_detail: 'residential', name: 'Piir' }, [15, -100], [15, 100]),
      ]),
      origin,
    );
    const piir = roadsOf(s, (r) => r.name === 'Piir');
    expect(piir.length).toBe(1);
    expect(lineLength(piir[0].pts)).toBeCloseTo(200, 0);
  });

  it('gives both buffer-clipped pieces of a building without an id one id', () => {
    const { origin } = borderOrigin();
    const feats = [house(undefined, rect(5, 2, 25, 17)), house(undefined, rect(-40, 40, -20, 60))];
    const read = () => streetFromTiles(tilesFor(origin, feats, 200, Z, 64), origin);
    const s = read();
    const cut = s.buildings.filter((b) => b.ring.some((p) => p[1] < 20));
    expect(cut.length).toBe(2);
    expect(cut[0].id).toBe(cut[1].id);
    expect(cut[0].height).toBe(cut[1].height);
    const other = s.buildings.find((b) => pointInRing([-30, 50], b.ring))!;
    expect(other.id).not.toBe(cut[0].id);
    expect(read().buildings.map((b) => b.id)).toEqual(s.buildings.map((b) => b.id));
  });

  it('skips a feature that does not decode and keeps the rest of the tile', () => {
    const origin = midTileOrigin();
    const t = tileOf(origin, Z);
    const o = [(lonToTile(origin[0], Z) - t.x) * 4096, (latToTile(origin[1], Z) - t.y) * 4096].map(
      Math.round,
    );
    const zz = (n: number) => (n << 1) ^ (n >> 31);
    // A square of 132 units (about 20 m) around the origin; and a geometry with command 3, which does not exist.
    const good = [9, zz(o[0] - 66), zz(o[1] - 66), (3 << 3) | 2, zz(132), 0, 0, zz(132), zz(-132), 0, 15];
    const bad = [(1 << 3) | 3, 0, 0];
    const pbf = new PbfWriter();
    pbf.writeMessage(
      3,
      (_: unknown, w: PbfWriter) => {
        w.writeVarintField(15, 2);
        w.writeStringField(1, 'buildings');
        for (const [id, geom] of [
          [1, bad],
          [2, good],
        ] as const) {
          w.writeMessage(
            2,
            (_f: unknown, fw: PbfWriter) => {
              fw.writeVarintField(1, id);
              fw.writePackedVarint(2, [0, 0]);
              fw.writeVarintField(3, 3);
              fw.writePackedVarint(4, [...geom]);
            },
            null,
          );
        }
        w.writeStringField(3, 'kind');
        w.writeMessage(4, (_v: unknown, vw: PbfWriter) => vw.writeStringField(1, 'building'), null);
        w.writeVarintField(5, 4096);
      },
      null,
    );
    const s = streetFromTiles([{ ...t, data: pbf.finish() }], origin);
    expect(s.buildings.map((b) => b.id)).toEqual([2]);
    expect(s.buildings[0].area).toBeCloseTo(400, -1);
  });

  it('readStreet fetches the tiles of the square of 200 m, so houses 175 to 200 m away are whole', async () => {
    const y = Math.floor(latToTile(59.437, Z));
    // A tile border 170 m north of the incident: the circle of 160 m does not reach the tile beyond it.
    const origin: LngLat = [
      tileLon(Math.floor(lonToTile(24.75, Z)) + 0.5, Z),
      tileLat(y, Z) - 170 / 111194.93,
    ];
    expect(tilesAround(origin, 160, Z).length).toBeLessThan(tilesAround(origin, 200, Z).length);
    const feats = [
      road({ kind: 'minor_road', kind_detail: 'residential' }, [-150, -5], [150, -5]),
      house(500, rect(-10, 178, 10, 198)),
      house(501, rect(30, 160, 50, 190)),
    ];
    const tiles = tilesFor(origin, feats).map((t) => ({ ...t, data: t.data as Uint8Array }));
    const s = await readStreet(archiveOf(writePmtiles(tiles, [24, 59, 25.5, 60])), origin);
    expect(s).not.toBeNull();
    expect(byId(s!, 500).length).toBe(1);
    expect(byId(s!, 500)[0].area).toBeCloseTo(400, -1);
    expect(byId(s!, 501).reduce((x, b) => x + b.area, 0)).toBeCloseTo(600, -1);
  });
});

// ---------------------------------------------------------------------------- a real archive (optional)

const SAMPLE = process.env.EPD_PMTILES_SAMPLE ?? '';

describe.skipIf(!SAMPLE || !existsSync(SAMPLE))('readStreet on a real Protomaps archive', () => {
  it('reads thirty points of the town', async () => {
    const bytes = new Uint8Array(readFileSync(SAMPLE));
    const archive = archiveOf(bytes);
    const failures: string[] = [];
    const bad: string[] = [];
    let sites = 0;
    let streets = 0;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 5; j++) {
        const o: LngLat = [11.232 + i * 0.0094, 43.752 + j * 0.0076];
        const at = `${o[0].toFixed(4)},${o[1].toFixed(4)}`;
        const t0 = Date.now();
        const s = await readStreet(archive, o);
        const ms = Date.now() - t0;
        if (!s) {
          failures.push(`${at}: no street`);
          continue;
        }
        streets++;
        if (!s.roads.length || !s.buildings.length)
          failures.push(`${at}: ${s.roads.length} roads, ${s.buildings.length} buildings`);
        bad.push(...checkRings(s).map((x) => `${at} ${x}`));
        if (s.buildings.length > MAX_BUILDINGS || s.roads.length > MAX_ROADS)
          bad.push(`${at}: over the bounds`);
        if (s.areas.some((a) => a.ring.length > MAX_AREA_VERTICES + MAX_HOLES * (MAX_HOLE_VERTICES + 2)))
          bad.push(`${at}: area over the vertex limit`);
        if (ms > 3000) bad.push(`${at}: ${ms} ms`);
        const tooSmall = s.buildings.filter((b: Building) => b.area < 2);
        if (tooSmall.length) bad.push(`${at}: ${tooSmall.length} slivers`);
        if (buildSite(s, i * 5 + j + 1)) sites++;
        else failures.push(`${at}: no site`);
      }
    }
    expect(bad, bad.slice(0, 20).join('\n')).toEqual([]);
    expect(streets, failures.join('\n')).toBeGreaterThanOrEqual(28);
    expect(sites, failures.join('\n')).toBeGreaterThanOrEqual(25);
  }, 60000);
});
