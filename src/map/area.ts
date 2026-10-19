/**
 * The shift's area on the map (docs/SECTORS.md): a mask that dims everything outside the sectors the player
 * covers, the area's edge, the night cover sectors and labels on the neighbouring sectors naming the AI
 * colleague at that desk ("Viljandimaa · Maarja Tamm"). Pure (no DOM, no maplibre runtime): the controller
 * builds the source once per area, never per frame. The ring helpers are shared with the career screens'
 * small SVG maps.
 */
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { neighbourSectors, sectorOutlines } from '@/sim/sectors';
import type { Lang, LngLat, RegionDef, SimState, Station } from '@/sim/types';

export type Ring = LngLat[];

const RAD = Math.PI / 180;
/** Far beyond the map's max bounds: the dimmed outside of the area. */
const WORLD: Ring = [
  [5, 45],
  [45, 45],
  [45, 70],
  [5, 70],
  [5, 45],
];
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

// ── Ring basics ─────────────────────────────────────────────────────────────

const same = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];

/** The ring without its closing point. */
export function openRing(r: readonly LngLat[]): Ring {
  const pts = r.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  return pts.length > 1 && same(pts[0], pts[pts.length - 1]) ? pts.slice(0, -1) : pts;
}

/** The ring with its closing point (GeoJSON). */
export function closeRing(r: readonly LngLat[]): Ring {
  const o = openRing(r);
  return o.length ? [...o, o[0]] : o;
}

/** Signed area in degrees² (positive: counter-clockwise with north up). */
export function signedArea(r: readonly LngLat[]): number {
  const o = openRing(r);
  let a = 0;
  for (let i = 0; i < o.length; i++) {
    const [x1, y1] = o[i];
    const [x2, y2] = o[(i + 1) % o.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** The ring wound counter-clockwise (outer rings, RFC 7946) or clockwise (holes), closed. */
export function wind(r: readonly LngLat[], ccw: boolean): Ring {
  const c = closeRing(r);
  return signedArea(c) > 0 === ccw ? c : [...c].reverse();
}

export function pointInRing(p: LngLat, r: readonly LngLat[]): boolean {
  const o = openRing(r);
  let inside = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const [xi, yi] = o[i];
    const [xj, yj] = o[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function ringBounds(r: readonly LngLat[]): [LngLat, LngLat] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of r) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [
    [w, s],
    [e, n],
  ];
}

const boxesOverlap = (a: [LngLat, LngLat], b: [LngLat, LngLat]) => a[0][0] <= b[1][0] && b[0][0] <= a[1][0] && a[0][1] <= b[1][1] && b[0][1] <= a[1][1];

/** Area centroid (falls back to the vertex mean for a degenerate ring). */
export function centroid(r: readonly LngLat[]): LngLat {
  const o = openRing(r);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < o.length; i++) {
    const [x1, y1] = o[i];
    const [x2, y2] = o[(i + 1) % o.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const n = o.length || 1;
    return [o.reduce((s, p) => s + p[0], 0) / n, o.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Distance from p to the ring's edges, in degrees of latitude (longitude scaled by cos(lat)). */
export function distToRing(p: LngLat, r: readonly LngLat[], k = Math.cos(p[1] * RAD)): number {
  const o = openRing(r);
  let best = Infinity;
  const px = p[0] * k;
  const py = p[1];
  for (let i = 0; i < o.length; i++) {
    const ax = o[i][0] * k;
    const ay = o[i][1];
    const b = o[(i + 1) % o.length];
    const bx = b[0] * k;
    const by = b[1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

// ── Union of sector outlines ────────────────────────────────────────────────

/** Douglas-Peucker on an open polyline in planar units. */
function simplifyLine(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1;
    let farD = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplify a closed planar loop (split at its two farthest-apart vertices). */
function simplifyLoop(loop: [number, number][], tol: number): [number, number][] {
  if (loop.length < 8) return loop;
  let far = 0;
  let farD = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = simplifyLine(loop.slice(0, far + 1), tol);
  const b = simplifyLine([...loop.slice(far), loop[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/**
 * Outline loops of the union of the rings (closed). Rings whose boxes do not touch come back as they are;
 * overlapping ones (padded hulls of neighbouring sectors usually overlap) are merged on a grid, traced with
 * marching squares and simplified, so the mask never has overlapping holes. Inner loops (a gap enclosed by the
 * area) come back too; maskGeometry nests them.
 */
export function unionRings(rings: readonly (readonly LngLat[])[], cells = 240): Ring[] {
  const rs = rings.map(openRing).filter((r) => r.length >= 3);
  if (rs.length <= 1) return rs.map(closeRing);
  const boxes = rs.map(ringBounds);
  let overlap = false;
  for (let i = 0; i < boxes.length && !overlap; i++) for (let j = i + 1; j < boxes.length; j++) if (boxesOverlap(boxes[i], boxes[j])) overlap = true;
  if (!overlap) return rs.map(closeRing);

  const w = Math.min(...boxes.map((b) => b[0][0]));
  const s = Math.min(...boxes.map((b) => b[0][1]));
  const e = Math.max(...boxes.map((b) => b[1][0]));
  const n = Math.max(...boxes.map((b) => b[1][1]));
  const k = Math.cos(((s + n) / 2) * RAD);
  const h = Math.max((e - w) * k, n - s) / cells || 1e-3;
  const dx = h / k;
  const dy = h;
  // Nodes 0 and nx-1 (and the first and last rows) lie outside every ring, so every contour closes.
  const nx = Math.ceil((e - w) / dx) + 3;
  const ny = Math.ceil((n - s) / dy) + 3;
  const lon = (i: number) => w + (i - 1) * dx;
  const lat = (j: number) => s + (j - 1) * dy;
  const f = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const y = lat(j);
    for (const r of rs) {
      const xs: number[] = [];
      for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
        const [x1, y1] = r[a];
        const [x2, y2] = r[b];
        if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
      xs.sort((p, q) => p - q);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const i0 = Math.max(0, Math.ceil((xs[m] - w) / dx + 1));
        const i1 = Math.min(nx - 1, Math.floor((xs[m + 1] - w) / dx + 1));
        for (let i = i0; i <= i1; i++) f[j * nx + i] = 1;
      }
    }
  }

  // Marching squares. A crossing sits on a grid edge: horizontal edge (i,j)-(i+1,j) has id 2*(j*nx+i),
  // vertical edge (i,j)-(i,j+1) has id 2*(j*nx+i)+1. Every crossing edge joins exactly two segments.
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const la = links.get(a);
    if (la) la.push(b);
    else links.set(a, [b]);
    const lb = links.get(b);
    if (lb) lb.push(a);
    else links.set(b, [a]);
  };
  const at = (i: number, j: number) => f[j * nx + i];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const bl = at(i, j);
      const br = at(i + 1, j);
      const tr = at(i + 1, j + 1);
      const tl = at(i, j + 1);
      const code = bl | (br << 1) | (tr << 2) | (tl << 3);
      if (code === 0 || code === 15) continue;
      const B = 2 * (j * nx + i);
      const T = 2 * ((j + 1) * nx + i);
      const L = 2 * (j * nx + i) + 1;
      const R = 2 * (j * nx + i + 1) + 1;
      if (code === 5) {
        link(L, B);
        link(T, R);
        continue;
      }
      if (code === 10) {
        link(B, R);
        link(L, T);
        continue;
      }
      const cross: number[] = [];
      if (bl !== br) cross.push(B);
      if (br !== tr) cross.push(R);
      if (tr !== tl) cross.push(T);
      if (tl !== bl) cross.push(L);
      if (cross.length === 2) link(cross[0], cross[1]);
    }
  }
  const pos = (id: number): [number, number] => {
    const cell = id >> 1;
    const i = cell % nx;
    const j = (cell - i) / nx;
    // Planar: x in degrees of latitude (longitude scaled by k).
    return id & 1 ? [lon(i) * k, lat(j) + dy / 2] : [(lon(i) + dx / 2) * k, lat(j)];
  };
  const seen = new Set<number>();
  const out: Ring[] = [];
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const loop: [number, number][] = [];
    let prev = -1;
    let cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      loop.push(pos(cur));
      const next = (links.get(cur) ?? []).find((x) => x !== prev && !seen.has(x));
      if (next === undefined) break;
      prev = cur;
      cur = next;
    }
    if (loop.length < 4) continue;
    // Douglas-Peucker turns the grid's staircase back into the straight edges of the outlines.
    const smooth = simplifyLoop(loop, h * 0.75);
    const ring = closeRing(smooth.map(([x, y]) => [x / k, y] as LngLat));
    if (Math.abs(signedArea(ring)) * k < h * h * 2) continue;
    out.push(ring);
  }
  return out;
}

/**
 * Mask polygons (MultiPolygon coordinates) that cover everything outside the loops: the world with the
 * outermost loops as holes, then any gap inside the area as a polygon of its own, and so on. Outer rings
 * counter-clockwise and holes clockwise, as maplibre classifies rings by their winding.
 */
export function maskGeometry(loops: readonly Ring[]): LngLat[][][] {
  const ls = loops.map(closeRing).filter((r) => r.length >= 4);
  const depth = ls.map((l, i) => 1 + ls.filter((m, j) => j !== i && pointInRing(l[0], m)).length);
  const parent = ls.map((l, i) => {
    let best = -1;
    ls.forEach((m, j) => {
      if (j !== i && depth[j] === depth[i] - 1 && pointInRing(l[0], m)) best = j;
    });
    return best;
  });
  const polys: LngLat[][][] = [[wind(WORLD, true), ...ls.filter((_, i) => depth[i] === 1).map((l) => wind(l, false))]];
  ls.forEach((l, i) => {
    if (depth[i] % 2 !== 0) return;
    polys.push([wind(l, true), ...ls.filter((_, j) => parent[j] === i).map((h) => wind(h, false))]);
  });
  return polys;
}

/** The area itself as polygons (outer loops counter-clockwise, gaps in them as clockwise holes). */
export function insideGeometry(loops: readonly Ring[]): LngLat[][][] {
  const ls = loops.map(closeRing).filter((r) => r.length >= 4);
  const depth = ls.map((l, i) => ls.filter((m, j) => j !== i && pointInRing(l[0], m)).length);
  const polys: LngLat[][][] = [];
  ls.forEach((l, i) => {
    if (depth[i] % 2 !== 0) return;
    const holes = ls.filter((h, j) => j !== i && depth[j] === depth[i] + 1 && pointInRing(h[0], l));
    polys.push([wind(l, true), ...holes.map((h) => wind(h, false))]);
  });
  return polys;
}

/**
 * Label spot of a neighbouring sector just across the area's border: inside one of the sector's `rings`, out
 * of the area `loops`, about a fourteenth of the area's size from its edge, beside the area rather than
 * above or below it (so the camera fitted to the area still shows it) and clear of the labels already `placed`. Null when no such spot is near the area.
 */
export function rimLabelPoint(rings: readonly (readonly LngLat[])[], loops: readonly Ring[], placed: readonly LngLat[] = []): LngLat | null {
  const rs = rings.map(openRing).filter((r) => r.length >= 3);
  if (!rs.length || !loops.length) return null;
  const [[w, s], [e, n]] = ringBounds(loops.flat());
  const k = Math.cos(((s + n) / 2) * RAD);
  const size = Math.max((e - w) * k, n - s);
  if (!(size > 0)) return null;
  const gap = size * 0.07;
  const padY = size * 0.2;
  const padX = padY / k;
  const steps = 22;
  let best: LngLat | null = null;
  let bestScore = Infinity;
  for (let a = 0; a <= steps; a++) {
    for (let b = 0; b <= steps; b++) {
      const c: LngLat = [w - padX + ((e - w + 2 * padX) * a) / steps, s - padY + ((n - s + 2 * padY) * b) / steps];
      if (!rs.some((r) => pointInRing(c, r)) || loops.some((l) => pointInRing(c, l))) continue;
      let d = Infinity;
      for (const l of loops) d = Math.min(d, distToRing(c, l, k));
      if (d < gap * 0.5) continue;
      // Room inside the sector too, so a long label does not sit on its far edge.
      let inner = Infinity;
      for (const r of rs) if (pointInRing(c, r)) inner = Math.min(inner, distToRing(c, r, k));
      let score = Math.abs(d - gap) - Math.min(inner, gap) * 0.5;
      // The fitted camera usually has more room beside the area than above and below it (a landscape map).
      if (c[0] > w && c[0] < e && (c[1] > n || c[1] < s)) score += gap * 0.6;
      for (const p of placed) {
        const q = Math.hypot((p[0] - c[0]) * k, p[1] - c[1]);
        if (q < size * 0.3) score += (size * 0.3 - q) * 4;
      }
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }
  return best;
}

/**
 * A good spot for a label inside the ring and outside the `avoid` rings: the candidate farthest from every
 * edge (a coarse pole of inaccessibility). Null when no part of the ring is left outside.
 */
export function labelPoint(ring: readonly LngLat[], avoid: readonly (readonly LngLat[])[] = [], steps = 14): LngLat | null {
  const r = openRing(ring);
  if (r.length < 3) return null;
  const [[w, s], [e, n]] = ringBounds(r);
  const k = Math.cos(((s + n) / 2) * RAD);
  const cands: LngLat[] = [centroid(r)];
  for (let a = 1; a < steps; a++) for (let b = 1; b < steps; b++) cands.push([w + ((e - w) * a) / steps, s + ((n - s) * b) / steps]);
  let best: LngLat | null = null;
  let bestD = -Infinity;
  for (const c of cands) {
    if (!pointInRing(c, r) || avoid.some((x) => pointInRing(c, x))) continue;
    let d = distToRing(c, r, k);
    for (const x of avoid) d = Math.min(d, distToRing(c, x, k));
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// ── The map source ──────────────────────────────────────────────────────────

/** Sectors covered by a shift and its night cover (each list without duplicates). */
export function shiftArea(s: Pick<SimState, 'sectors' | 'coverSectors'> | null | undefined): { sectors: string[]; cover: string[] } {
  const sectors = [...new Set((s?.sectors ?? []).filter((x) => typeof x === 'string' && x))];
  const cover = [...new Set((s?.coverSectors ?? []).filter((x) => typeof x === 'string' && x && !sectors.includes(x)))];
  return { sectors, cover };
}

/** Identity of a shift's area: the map rebuilds its area source only when this changes. */
export function areaKey(s: Pick<SimState, 'sectors' | 'coverSectors'> | null | undefined): string {
  const a = shiftArea(s);
  return a.sectors.length ? `${a.sectors.join(',')}|${a.cover.join(',')}` : '';
}

/**
 * GeoJSON for the area layers: `kind` 'mask' (the dimmed outside), 'inside' (the player's sectors, faintly
 * lit), 'coverFill' and 'cover' (a night cover sector's tint and outline), 'edge' (the area's outline) and
 * 'label' (a neighbouring sector with its colleague). Empty for a whole-prefecture shift or a prefecture without sector data.
 */
export function buildArea(region: RegionDef | undefined, area: { sectors: string[]; cover: string[] }, lang: Lang): FeatureCollection {
  if (!region || !area.sectors.length) return EMPTY;
  const ids = [...area.sectors, ...area.cover];
  let outlines: { id: string; ring: LngLat[] }[] = [];
  try {
    outlines = sectorOutlines(region, ids);
  } catch {
    return EMPTY;
  }
  const rings = outlines.filter((o) => ids.includes(o.id) && openRing(o.ring).length >= 3);
  if (!rings.length) return EMPTY;
  const loops = unionRings(rings.map((o) => o.ring));
  if (!loops.length) return EMPTY;
  // The player's own sectors are lit; tonight's cover gets a gold tint of its own.
  const own = rings.filter((o) => area.sectors.includes(o.id));
  const ownLoops = area.cover.length ? (own.length ? unionRings(own.map((o) => o.ring)) : []) : loops;
  const features: Feature<Geometry>[] = [
    { type: 'Feature', properties: { kind: 'mask' }, geometry: { type: 'MultiPolygon', coordinates: maskGeometry(loops) } },
    { type: 'Feature', properties: { kind: 'inside' }, geometry: { type: 'MultiPolygon', coordinates: insideGeometry(ownLoops) } },
    ...rings
      .filter((o) => area.cover.includes(o.id))
      .map((o): Feature<Geometry> => ({ type: 'Feature', properties: { kind: 'coverFill', id: o.id }, geometry: { type: 'Polygon', coordinates: [wind(o.ring, true)] } })),
    ...loops.map(
      (l): Feature<Geometry> => ({ type: 'Feature', properties: { kind: 'edge' }, geometry: { type: 'LineString', coordinates: closeRing(l) } }),
    ),
    ...rings
      .filter((o) => area.cover.includes(o.id))
      .map((o): Feature<Geometry> => ({ type: 'Feature', properties: { kind: 'cover', id: o.id }, geometry: { type: 'LineString', coordinates: closeRing(o.ring) } })),
  ];
  const placed: LngLat[] = [];
  let neighbours: ReturnType<typeof neighbourSectors> = [];
  try {
    neighbours = neighbourSectors(ids).filter((x) => x && x.regionId === region.id && !ids.includes(x.id));
  } catch {
    neighbours = [];
  }
  if (neighbours.length) {
    let rimRings: { id: string; ring: LngLat[] }[] = [];
    try {
      rimRings = sectorOutlines(
        region,
        neighbours.map((x) => x.id),
      );
    } catch {
      rimRings = [];
    }
    for (const nb of neighbours) {
      const own = rimRings.filter((o) => o.id === nb.id).map((o) => o.ring);
      // Just across the border, where the camera fitted to the area still shows it; else the sector's middle.
      const largest = [...own].sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0];
      const at = rimLabelPoint(own, loops, placed) ?? (largest ? labelPoint(largest, loops) : null);
      if (!at) continue;
      placed.push(at);
      const c = nb.colleague;
      features.push({
        type: 'Feature',
        properties: { kind: 'label', id: nb.id, name: nb.name[lang] || nb.name.et, colleague: c ? `${c.firstName} ${c.lastName}` : '' },
        geometry: { type: 'Point', coordinates: at },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Station ids that stand out on the map: the area's stations, the units' own stations and the arrest house. */
export function areaStationIds(region: RegionDef | undefined, stations: readonly Pick<Station, 'id'>[], unitStations: Iterable<string>): Set<string> {
  const out = new Set<string>(stations.map((x) => x.id));
  for (const id of unitStations) if (id) out.add(id);
  if (region?.arrestHouseId) out.add(region.arrestHouseId);
  return out;
}
