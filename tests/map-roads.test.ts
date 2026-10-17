/**
 * Road layer: scripts/build-mapdata.mjs on a synthetic PMTiles archive (clipping, stitching across a
 * tile border, T-junctions, one-way, pruning, building centroids, atomic output), the client core in
 * src/map/roadGraph.ts (binary round trip, nearest queries, A*, point at fraction) and the display
 * service in src/map/roads.ts (fallback when the files are missing, snapped incidents, units on roads).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  findRoute,
  loadRoadData,
  nearestBuilding,
  nearestEdge,
  parseBuildings,
  parseRoads,
  pathFromPoints,
  pathLength,
  pointAtFraction,
  remainingAt,
  snapPoint,
  type RoadGraph,
  type Buildings,
} from '@/map/roadGraph';
import { incidentSnapKind, RoadDisplay, RoadService } from '@/map/roads';
import { haversineKm } from '@/sim/geo';
import type { Incident, LngLat, SimState, Unit } from '@/sim/types';
import {
  encodeMvt,
  encodeRoadsBin,
  latToTile,
  lonToTile,
  tileLat,
  tileLon,
  tilePoint,
  writePmtiles,
  type MvtLayer,
} from './fixtures/mapdata';

const ROOT = resolve(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts/build-mapdata.mjs');

interface BuildStats {
  nodes: number;
  edges: number;
  buildings: number;
}
type BuildFn = (input: string, outDir: string, o?: { log?: (m: string) => void }) => Promise<BuildStats>;

const Z = 15;
const X = Math.floor(lonToTile(24.75, Z));
const Y = Math.floor(latToTile(59.43, Z));
/** Metres per tile unit at the fixture's latitude. */
const M_PER_UNIT = (40075016.686 * Math.cos((tileLat(Y + 0.5, Z) * Math.PI) / 180)) / (2 ** Z * 4096);
const A = (px: number, py: number) => tilePoint(Z, X, Y, px, py);
const B = (px: number, py: number) => tilePoint(Z, X + 1, Y, px, py);
const res = { kind: 'minor_road', kind_detail: 'residential' };

/** Two tiles side by side: roads crossing the border, a junction, a T-junction, a one-way loop, buildings. */
function fixtureTiles(withRoads = true) {
  const tileA: MvtLayer[] = [
    {
      name: 'roads',
      features: withRoads
        ? [
            {
              id: 1,
              type: 2,
              props: res,
              geom: [
                [
                  [1000, 2000],
                  [2000, 2000],
                  [4160, 2000],
                ],
              ],
            },
            {
              id: 2,
              type: 2,
              props: res,
              geom: [
                [
                  [2000, 500],
                  [2000, 2000],
                  [2000, 3500],
                ],
              ],
            },
            // Ends 3 units (about 0.5 m) short of road 1, between two of its vertices.
            {
              id: 3,
              type: 2,
              props: res,
              geom: [
                [
                  [3000, 3500],
                  [3000, 2003],
                ],
              ],
            },
            // Stops 0.5 m past road 1's west end (no vertex in common): joins there.
            {
              id: 9,
              type: 2,
              props: res,
              geom: [
                [
                  [1000, 3000],
                  [997, 2003],
                ],
              ],
            },
            {
              id: 5,
              type: 2,
              props: { kind: 'path', kind_detail: 'footway' },
              geom: [
                [
                  [500, 3800],
                  [3500, 3800],
                ],
              ],
            },
            {
              id: 6,
              type: 2,
              props: { kind: 'rail', kind_detail: 'rail' },
              geom: [
                [
                  [500, 3900],
                  [3500, 3900],
                ],
              ],
            },
            // A 45 m piece connected to nothing: dropped.
            {
              id: 7,
              type: 2,
              props: res,
              geom: [
                [
                  [500, 500],
                  [800, 500],
                ],
              ],
            },
          ]
        : [],
    },
    {
      name: 'buildings',
      features: [
        {
          id: 101,
          type: 3,
          props: { kind: 'building' },
          geom: [
            [
              [2200, 2200],
              [2400, 2200],
              [2400, 2400],
              [2200, 2400],
            ],
          ],
        },
        // Cut by the tile border (with the tile buffer): its other half is in tile B.
        {
          id: 102,
          type: 3,
          props: { kind: 'building' },
          geom: [
            [
              [4000, 2600],
              [4160, 2600],
              [4160, 2800],
              [4000, 2800],
            ],
          ],
        },
        // A 21 m2 shed and a building part: not incident sites.
        {
          id: 103,
          type: 3,
          props: { kind: 'building' },
          geom: [
            [
              [1200, 1200],
              [1230, 1200],
              [1230, 1230],
              [1200, 1230],
            ],
          ],
        },
        {
          id: 104,
          type: 3,
          props: { kind: 'building_part' },
          geom: [
            [
              [2250, 2250],
              [2350, 2250],
              [2350, 2350],
              [2250, 2350],
            ],
          ],
        },
      ],
    },
  ];
  const tileB: MvtLayer[] = [
    {
      name: 'roads',
      features: withRoads
        ? [
            {
              id: 1,
              type: 2,
              props: res,
              geom: [
                [
                  [-64, 2000],
                  [2000, 2000],
                  [3000, 2000],
                ],
              ],
            },
            {
              id: 4,
              type: 2,
              props: { ...res, oneway: 'yes' },
              geom: [
                [
                  [3000, 2000],
                  [3000, 3000],
                ],
              ],
            },
            {
              id: 8,
              type: 2,
              props: res,
              geom: [
                [
                  [3000, 3000],
                  [2000, 3000],
                  [2000, 2000],
                ],
              ],
            },
          ]
        : [],
    },
    {
      name: 'buildings',
      features: [
        {
          id: 102,
          type: 3,
          props: { kind: 'building' },
          geom: [
            [
              [-64, 2600],
              [104, 2600],
              [104, 2800],
              [-64, 2800],
            ],
          ],
        },
      ],
    },
  ];
  const bounds: [number, number, number, number] = [
    tileLon(X, Z),
    tileLat(Y + 1, Z),
    tileLon(X + 2, Z),
    tileLat(Y, Z),
  ];
  return writePmtiles(
    [
      { z: Z, x: X, y: Y, data: encodeMvt(tileA) },
      { z: Z, x: X + 1, y: Y, data: encodeMvt(tileB) },
    ],
    bounds,
  );
}

const distM = (a: LngLat, b: LngLat) => haversineKm(a, b) * 1000;

let dir = '';
let build: BuildFn;
let roads: RoadGraph;
let blds: Buildings;
let roadsBuf: Uint8Array;
let bldsBuf: Uint8Array;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'epd-mapdata-'));
  writeFileSync(join(dir, 'fixture.pmtiles'), fixtureTiles());
  writeFileSync(join(dir, 'noroads.pmtiles'), fixtureTiles(false));
  const mod = (await import(/* @vite-ignore */ pathToFileURL(SCRIPT).href)) as { buildMapData: BuildFn };
  build = mod.buildMapData;
  await build(join(dir, 'fixture.pmtiles'), join(dir, 'out'));
  roadsBuf = readFileSync(join(dir, 'out', 'roads-v1.bin'));
  bldsBuf = readFileSync(join(dir, 'out', 'buildings-v1.bin'));
  roads = parseRoads(roadsBuf);
  blds = parseBuildings(bldsBuf);
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('build-mapdata on a synthetic archive', () => {
  it('clips at the exact tile border and stitches the pieces into one road', () => {
    const minLon = tileLon(X, Z);
    const maxLon = tileLon(X + 2, Z);
    const borderLon = tileLon(X + 1, Z);
    for (let i = 0; i < roads.nodes; i++) {
      expect(roads.nodeLon[i]).toBeGreaterThanOrEqual(minLon - 1e-6);
      expect(roads.nodeLon[i]).toBeLessThanOrEqual(maxLon + 1e-6);
    }
    // The tile buffer (64 units past the border) never ends up in the graph.
    const bufferLon = tileLon(X + 1 + 64 / 4096, Z);
    for (let k = 0; k < roads.shapeLon.length; k++)
      expect(Math.abs(roads.shapeLon[k] - bufferLon)).toBeGreaterThan(1e-6);
    // One road across the border: west end of road 1 to its east end in tile B.
    const r = findRoute(roads, A(1001, 2000), B(3000, 2000));
    expect(r).not.toBeNull();
    expect(r!.lengthM).toBeCloseTo(6095 * M_PER_UNIT, -0.5);
    // The border point merged into a pass-through and was contracted away: no node there.
    for (let i = 0; i < roads.nodes; i++)
      expect(
        Math.abs(roads.nodeLon[i] - borderLon) > 1e-6 || Math.abs(roads.nodeLat[i] - A(0, 2000)[1]) > 1e-6,
      ).toBe(true);
  });

  it('builds the graph: shared-vertex crossing, re-attached T-junction, pass-through nodes merged', () => {
    // 9 nodes: the crossing, the T-junction, the free ends of roads 2, 3 and 9, the one-way loop's
    // three corners; road 9 continues road 1's west end, so that end is a pass-through.
    expect(roads.nodes).toBe(9);
    expect(roads.edges).toBe(9);
    const r9 = findRoute(roads, A(1000, 3000), A(2000, 2000));
    expect(r9).not.toBeNull();
    expect(r9!.lengthM).toBeCloseTo((997 + 1000) * M_PER_UNIT, -0.5);
    // From the south end of road 3 over the T-junction and the crossing to the north end of road 2.
    const r = findRoute(roads, A(3000, 3500), A(2000, 500));
    expect(r).not.toBeNull();
    expect(r!.lengthM).toBeCloseTo((1497 + 1000 + 1500) * M_PER_UNIT, -0.5);
  });

  it('respects one-way roads', () => {
    const fwd = findRoute(roads, B(3000, 2000), B(3000, 3000));
    const back = findRoute(roads, B(3000, 3000), B(3000, 2000));
    expect(fwd!.lengthM).toBeCloseTo(1000 * M_PER_UNIT, -0.5);
    // Against the one-way: around the loop (2000 + 1000 units).
    expect(back!.lengthM).toBeCloseTo(3000 * M_PER_UNIT, -0.5);
  });

  it('keeps paths, rail and short isolated pieces out of the graph', () => {
    const nearPath = nearestEdge(roads, ...A(2000, 3850), 300);
    expect(nearPath!.dist).toBeGreaterThan(40);
    const nearShort = nearestEdge(roads, ...A(650, 500), 300);
    expect(nearShort!.dist).toBeGreaterThan(150);
  });

  it('writes building centroids: a building cut by the border is whole again, sheds and parts are left out', () => {
    expect(blds.count).toBe(2);
    const pts: LngLat[] = Array.from({ length: blds.count }, (_, i) => [blds.lon[i], blds.lat[i]]);
    const want = [A(2300, 2300), A(4100, 2700)];
    for (const w of want) expect(Math.min(...pts.map((p) => distM(p, w)))).toBeLessThan(1);
    const hit = nearestBuilding(blds, ...A(2310, 2290), 120);
    expect(distM([hit!.lon, hit!.lat], A(2300, 2300))).toBeLessThan(1);
    expect(hit!.areaM2).toBeGreaterThan(800);
    expect(hit!.areaM2).toBeLessThan(1100);
  });

  it('writes only the four data files (temporary files are renamed away)', () => {
    expect(readdirSync(join(dir, 'out')).sort()).toEqual([
      'buildings-v1.bin',
      'buildings-v1.bin.gz',
      'roads-v1.bin',
      'roads-v1.bin.gz',
    ]);
  });

  it('fails without touching the old files when the archive has no car roads', async () => {
    await expect(build(join(dir, 'noroads.pmtiles'), join(dir, 'out'))).rejects.toThrow(/autoteed/);
    expect(readFileSync(join(dir, 'out', 'roads-v1.bin')).equals(Buffer.from(roadsBuf))).toBe(true);
    expect(readdirSync(join(dir, 'out')).length).toBe(4);
  });

  it('runs as a command line tool and reports counts and sizes', () => {
    const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'fixture.pmtiles'), join(dir, 'cli')], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/teed: 9 sõlme, 9 lõiku/);
    expect(r.stdout).toMatch(/hooned: 2/);
    expect(readFileSync(join(dir, 'cli', 'roads-v1.bin')).equals(Buffer.from(roadsBuf))).toBe(true);
    const bad = spawnSync(process.execPath, [SCRIPT, join(dir, 'missing.pmtiles'), join(dir, 'cli2')], {
      encoding: 'utf8',
    });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/VIGA/);
  });
});

// ---------------------------------------------------------------------------- client core

/** A 5 x 5 street grid: slow streets east-west, residential north-south, a fast bottom row. */
function grid() {
  const nodes: LngLat[] = [];
  const id = (i: number, j: number) => i * 5 + j;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) nodes.push([24.7 + j * 0.002, 59.4 + i * 0.001]);
  const edges: { a: number; b: number; cls: number; oneway?: boolean; shape?: LngLat[] }[] = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      if (j < 4) edges.push({ a: id(i, j), b: id(i, j + 1), cls: i === 0 ? 0 : 8 });
      if (i < 4) edges.push({ a: id(i, j), b: id(i + 1, j), cls: 7 });
    }
  // A bend in one street (shape point).
  edges.find((e) => e.a === id(2, 2) && e.b === id(2, 3))!.shape = [[24.705, 59.4023]];
  return { nodes, edges, id };
}

/** Plain Dijkstra over an edge list (the reference for A*). */
function dijkstra(g: RoadGraph, from: number, to: number): number {
  const dist = new Array(g.nodes).fill(Infinity);
  const done = new Array(g.nodes).fill(false);
  dist[from] = 0;
  for (;;) {
    let v = -1;
    for (let i = 0; i < g.nodes; i++) if (!done[i] && (v < 0 || dist[i] < dist[v])) v = i;
    if (v < 0 || dist[v] === Infinity) break;
    if (v === to) return dist[v];
    done[v] = true;
    for (let e = 0; e < g.edges; e++) {
      const c = g.edgeCost[e];
      if (g.edgeA[e] === v && dist[v] + c < dist[g.edgeB[e]]) dist[g.edgeB[e]] = dist[v] + c;
      if (g.edgeB[e] === v && !(g.edgeFlags[e] & 16) && dist[v] + c < dist[g.edgeA[e]])
        dist[g.edgeA[e]] = dist[v] + c;
    }
  }
  return dist[to];
}

describe('road graph core', () => {
  it('round-trips the binary format', () => {
    const { nodes, edges } = grid();
    const g = parseRoads(encodeRoadsBin(nodes, edges));
    expect(g.nodes).toBe(25);
    expect(g.edges).toBe(40);
    const pts = new Set(
      Array.from({ length: g.nodes }, (_, i) => `${g.nodeLon[i].toFixed(6)},${g.nodeLat[i].toFixed(6)}`),
    );
    for (const n of nodes) expect(pts.has(`${n[0].toFixed(6)},${n[1].toFixed(6)}`)).toBe(true);
    expect(Array.from(g.shapeLon)).toEqual([24.705]);
    expect(g.shapeLat[0]).toBeCloseTo(59.4023, 6);
    // The build script's output parses the same way (see above) and the files are rejected when damaged.
    expect(() => parseRoads(new Uint8Array(10))).toThrow();
    const broken = encodeRoadsBin(nodes, edges);
    broken[0] = 'X'.charCodeAt(0);
    expect(() => parseRoads(broken)).toThrow(/not a road file/);
    expect(() => parseRoads(encodeRoadsBin(nodes, edges).slice(0, -4))).toThrow(/size/);
    expect(() =>
      parseBuildings(new TextEncoder().encode('<!doctype html><html></html>'.padEnd(80))),
    ).toThrow();
  });

  it('A* finds the fastest route (down to the fast bottom row and back beats the slow top row)', () => {
    const { nodes, edges, id } = grid();
    const g = parseRoads(encodeRoadsBin(nodes, edges));
    const from = nodes[id(4, 0)];
    const to = nodes[id(4, 4)];
    const r = findRoute(g, from, to)!;
    const nearestNode = (p: LngLat) => {
      let best = 0;
      for (let i = 1; i < g.nodes; i++)
        if (distM([g.nodeLon[i], g.nodeLat[i]], p) < distM([g.nodeLon[best], g.nodeLat[best]], p)) best = i;
      return best;
    };
    expect(r.timeS).toBeCloseTo(dijkstra(g, nearestNode(from), nearestNode(to)), 1);
    // Down, along the fast row, up again.
    expect(Math.min(...Array.from(r.lat))).toBeCloseTo(59.4, 5);
    expect(r.lon[0]).toBeCloseTo(from[0], 9);
    expect(r.lat[r.lat.length - 1]).toBeCloseTo(to[1], 9);
    // Random pairs agree with Dijkstra too (end points on nodes).
    for (let k = 0; k < 20; k++) {
      const a = (k * 7) % 25;
      const b = (k * 11 + 3) % 25;
      if (a === b) continue;
      const rr = findRoute(g, nodes[a], nodes[b])!;
      expect(rr.timeS).toBeCloseTo(dijkstra(g, nearestNode(nodes[a]), nearestNode(nodes[b])), 1);
    }
  });

  it('A* never drives against a one-way street (unless asked to ignore it)', () => {
    const nodes: LngLat[] = [
      [24.7, 59.4],
      [24.7018, 59.4],
      [24.7009, 59.404],
    ];
    const g = parseRoads(
      encodeRoadsBin(nodes, [
        { a: 0, b: 1, cls: 7, oneway: true },
        { a: 1, b: 2, cls: 7 },
        { a: 2, b: 0, cls: 7 },
      ]),
    );
    const fwd = findRoute(g, nodes[0], nodes[1])!;
    const back = findRoute(g, nodes[1], nodes[0])!;
    expect(fwd.lengthM).toBeCloseTo(distM(nodes[0], nodes[1]), -0.5);
    expect(back.lengthM).toBeCloseTo(distM(nodes[1], nodes[2]) + distM(nodes[2], nodes[0]), -0.5);
    expect(findRoute(g, nodes[1], nodes[0], { anyDirection: true })!.lengthM).toBeCloseTo(fwd.lengthM, -0.5);
  });

  it('snaps route ends to the nearest edge and adds the hops off the road', () => {
    const { nodes, edges } = grid();
    const g = parseRoads(encodeRoadsBin(nodes, edges));
    const from: LngLat = [24.7031, 59.4012];
    const to: LngLat = [24.7069, 59.4027];
    const r = findRoute(g, from, to)!;
    expect([r.lon[0], r.lat[0]]).toEqual(from);
    expect([r.lon[r.lon.length - 1], r.lat[r.lat.length - 1]]).toEqual(to);
    const s = nearestEdge(g, ...from, 500)!;
    expect(s.dist).toBeLessThan(25);
    expect(distM([r.lon[1], r.lat[1]], [s.lon, s.lat])).toBeLessThan(0.01);
    // No road within reach: no route (the map draws its straight fallback).
    expect(findRoute(g, [25.5, 59.4], to)).toBeNull();
    expect(nearestEdge(g, 25.5, 59.4, 300)).toBeNull();
  });

  it('gives the point and heading at a fraction of a path, and the remaining part', () => {
    const p = pathFromPoints([
      [24.7, 59.4],
      [24.702, 59.4],
      [24.702, 59.401],
    ]);
    const len = pathLength(p);
    expect(len).toBeCloseTo(distM([24.7, 59.4], [24.702, 59.4]) + distM([24.702, 59.4], [24.702, 59.401]), 0);
    expect(pointAtFraction(p, 0).pos).toEqual([24.7, 59.4]);
    expect(pointAtFraction(p, 0).heading).toBeCloseTo(90, 0);
    expect(pointAtFraction(p, -1).pos).toEqual([24.7, 59.4]);
    const end = pointAtFraction(p, 1);
    expect(end.pos[0]).toBeCloseTo(24.702, 9);
    expect(end.pos[1]).toBeCloseTo(59.401, 9);
    expect(end.heading).toBeCloseTo(0, 0);
    const q = pointAtFraction(p, 0.25);
    expect(q.pos[1]).toBeCloseTo(59.4, 9);
    expect(distM([24.7, 59.4], q.pos)).toBeCloseTo(len * 0.25, 0);
    const late = pointAtFraction(p, 0.75);
    expect(late.pos[0]).toBeCloseTo(24.702, 9);
    expect(late.heading).toBeCloseTo(0, 0);
    expect(remainingAt(p, 0.75)).toEqual([late.pos, [24.702, 59.401]]);
    expect(remainingAt(p, 0.1, [1, 2])[0]).toEqual([1, 2]);
  });

  it('snaps points to buildings, places and roads within their radii', () => {
    const data = { roads, buildings: blds };
    const b1 = A(2300, 2300);
    // 60 m from the building: the building.
    expect(distM(snapPoint(data, A(2300, 2300 + 60 / M_PER_UNIT), 'building')!, b1)).toBeLessThan(1);
    // A road event goes to the road (road 1 runs along y = 2000).
    const onRoad = snapPoint(data, A(2300, 2100), 'road')!;
    expect(distM(onRoad, A(2300, 2000))).toBeLessThan(1);
    // No building within 120 m: the nearest road instead.
    const far = A(1200, 900);
    const s = snapPoint(data, far, 'building')!;
    expect(distM(s, far)).toBeLessThan(300);
    expect(nearestEdge(roads, ...s, 1)!.dist).toBeLessThan(0.5);
    // Nothing within 300 m: unchanged (null).
    expect(snapPoint(data, [24.9, 59.5], 'place')).toBeNull();
  });
});

// ---------------------------------------------------------------------------- service and display

const respond = (body: Uint8Array | string, type = 'application/octet-stream', status = 200) =>
  new Response(typeof body === 'string' ? body : new Uint8Array(body), {
    status,
    headers: { 'content-type': type },
  });

function mkUnit(over: Partial<Unit> = {}): Unit {
  return {
    id: 'u1',
    callsign: 'Põhja 21',
    type: 'patrol',
    stationId: 'x',
    zone: 'mainland',
    vehicle: '',
    crew: [],
    status: 'enroute',
    statusSince: 0,
    pos: A(1000, 2000),
    heading: 0,
    fatigue: 0,
    breaks: 0,
    handled: 0,
    ...over,
  };
}

function mkInc(coord: LngLat, over: Partial<Incident> = {}): Incident {
  return {
    id: 'i1',
    location: { address: '', coord, city: 'Tallinn', placeKind: 'residential', zone: 'mainland' },
    source: 'hk',
    ...over,
  } as Incident;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('road service and display layer', () => {
  it('reports missing files (404, HTML fallback, damaged file, network error) and never throws', async () => {
    const r404 = await loadRoadData('https://x.test/', async () => respond('', 'text/plain', 404));
    expect(r404).toEqual({ data: null, roads: 'missing', buildings: 'missing' });
    const html = await loadRoadData('https://x.test/', async () =>
      respond('<!doctype html><div id="root"></div>', 'text/html'),
    );
    expect(html.data).toBeNull();
    expect(html.roads).toBe('missing');
    const junk = await loadRoadData('https://x.test/', async () => respond(new Uint8Array(200)));
    expect(junk.roads).toBe('missing');
    const net = await loadRoadData('https://x.test/', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(net.roads).toBe('network');
    const asked: string[] = [];
    await loadRoadData('/epd', async (u) => {
      asked.push(u);
      return respond('', 'text/plain', 404);
    });
    expect(asked.sort()).toEqual(['/epd/tiles/buildings-v1.bin', '/epd/tiles/roads-v1.bin']);
  });

  it('falls back to the engine positions when the files are missing', async () => {
    const svc = new RoadService('https://x.test/', { fetch: async () => respond('', 'text/plain', 404) });
    svc.start();
    expect(await svc.whenSettled()).toBe('missing');
    const d = new RoadDisplay(svc);
    expect(d.active).toBe(false);
    const u = mkUnit();
    const engine = { pos: [24.7, 59.4] as LngLat, heading: 33 };
    const sim = {
      now: 0,
      units: { u1: u },
      unitOrder: ['u1'],
      incidents: {},
      incidentOrder: [],
    } as unknown as SimState;
    expect(d.unitPos(sim, u, engine, [], 0)).toBe(engine);
    const inc = mkInc([24.71, 59.41]);
    expect(d.incidentCoord(inc, 0)).toBe(inc.location.coord);
    expect(d.remaining(u, 0, engine.pos)).toBeNull();
    expect(d.focusCoord(sim, [1, 2], 0)).toEqual([1, 2]);
    expect(svc.route('k', [0, 0], null, [1, 1], 'road', 0).answer?.path).toBeNull();
  });

  it('decides how each kind of incident is placed', () => {
    const c: LngLat = [24.7, 59.4];
    expect(incidentSnapKind(mkInc(c))).toBe('building');
    expect(
      incidentSnapKind(
        mkInc(c, {
          location: {
            address: '',
            coord: c,
            city: '',
            placeKind: 'mall',
            placeName: 'Ülemiste',
            zone: 'mainland',
          },
        }),
      ),
    ).toBe('place');
    expect(
      incidentSnapKind(
        mkInc(c, { location: { address: '', coord: c, city: '', placeKind: 'highway', zone: 'mainland' } }),
      ),
    ).toBe('road');
    expect(
      incidentSnapKind(
        mkInc(c, { location: { address: '', coord: c, city: '', placeKind: 'lake', zone: 'mainland' } }),
      ),
    ).toBeNull();
    expect(incidentSnapKind(mkInc(c, { source: 'director' }))).toBeNull();
  });

  it('puts incidents at buildings and drives units along the road route', async () => {
    const svc = new RoadService('https://x.test/', {
      fetch: async (url) => respond(url.endsWith('roads-v1.bin') ? roadsBuf : bldsBuf),
    });
    svc.start();
    expect(await svc.whenSettled()).toBe('ready');
    const d = new RoadDisplay(svc);
    const near = A(2300, 2300 + 50 / M_PER_UNIT);
    const inc = mkInc(near);
    // The first answer is "not yet" (the marker waits), then the building.
    expect(d.incidentCoord(inc, 0)).toBeNull();
    await tick();
    expect(distM(d.incidentCoord(inc, 1)!, A(2300, 2300))).toBeLessThan(1);
    expect(d.incidentCoord(inc, 5000)).toEqual(d.incidentCoord(inc, 1));

    // A unit drives from the west end of road 1 to the T-junction road's south end.
    const from = A(1000, 2000);
    const to = A(3000, 3500);
    const u = mkUnit({
      pos: from,
      move: {
        purpose: 'patrol',
        path: [from, to],
        cum: [0, haversineKm(from, to)],
        departAt: 0,
        arriveAt: 600_000,
        siren: false,
      },
    });
    const sim = {
      now: 300_000,
      units: { u1: u },
      unitOrder: ['u1'],
      incidents: {},
      incidentOrder: [],
    } as unknown as SimState;
    const engine = { pos: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2] as LngLat, heading: 120 };
    // While the route is computed the unit holds its place.
    d.unitPos(sim, u, engine, [], 10);
    await tick();
    const mid = d.unitPos(sim, u, engine, [], 20);
    expect(nearestEdge(roads, ...mid.pos, 5)!.dist).toBeLessThan(0.5);
    expect(distM(mid.pos, engine.pos)).toBeGreaterThan(20);
    // The route line follows the roads from the shown position.
    const rest = d.remaining(u, sim.now, mid.pos)!;
    expect(rest[0]).toEqual(mid.pos);
    for (const p of rest) expect(nearestEdge(roads, ...p, 5)!.dist).toBeLessThan(0.5);
    // Arrived: parked at the route's end on the road (the patrol point snapped to the road).
    sim.now = 600_000;
    const atEnd = d.unitPos(sim, u, { pos: to, heading: 0 }, [], 30);
    delete u.move;
    u.pos = to;
    u.status = 'available';
    const parked = d.unitPos(sim, u, { pos: to, heading: 0 }, [], 40);
    expect(parked.pos).toEqual(atEnd.pos);
    expect(nearestEdge(roads, ...parked.pos, 5)!.dist).toBeLessThan(0.5);
  });
});

describe('owner rules for the road layer files', () => {
  it('has no em or en dashes in the new code, scripts and docs', () => {
    const banned = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);
    for (const f of [
      'scripts/build-mapdata.mjs',
      'src/map/roadGraph.ts',
      'src/map/roads.ts',
      'src/map/roadWorker.ts',
      'tests/fixtures/mapdata.ts',
      'deploy/mainserver/politsei-uuenda.sh',
      'deploy/mainserver/paigalda.sh',
      'deploy/mainserver/Caddyfile',
      'docs/DEPLOY.md',
      'docs/SERVER.md',
    ])
      expect(banned.test(readFileSync(join(ROOT, f), 'utf8')), f).toBe(false);
  });

  it('serves the map data with a binary type and its gzip copy from /tiles/', () => {
    const caddy = readFileSync(join(ROOT, 'deploy/mainserver/Caddyfile'), 'utf8');
    const tiles = caddy.slice(caddy.indexOf('handle_path /tiles/* {'));
    expect(tiles).toMatch(/@kaardiandmed path \*\.bin/);
    expect(tiles).toMatch(/header @kaardiandmed Content-Type "application\/octet-stream"/);
    expect(tiles).toMatch(/precompressed gzip/);
    const sw = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
    expect(sw).toMatch(/BYPASS_PREFIXES = \[`\$\{BASE\}api\/`, `\$\{BASE\}tiles\/`\]/);
  });
});
