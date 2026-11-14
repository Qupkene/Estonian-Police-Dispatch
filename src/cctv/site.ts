/**
 * The lie of the land for one camera (docs/CCTV.md): from the street around an incident, the road vehicles
 * arrive on, the spot on the roadside where it happens, the nearest door, the lamps, and where the camera hangs so
 * that it sees the spot and the road. Worked out once per incident, from the street data and a seed alone.
 *
 * Pure: no DOM, no three.js.
 */
import {
  along,
  clamp,
  clipLineToCircle,
  cross,
  dist,
  dot,
  left,
  lerp2,
  lineLength,
  mul,
  nearestOnLine,
  nearestOnRing,
  nearestOnSegment,
  norm,
  offsetLine,
  pointAlong,
  pointInRing,
  rand,
  segmentHitsRing,
  sub,
  yawOf,
  type V2,
} from './math';
import { CAR_ROADS, type Building, type CameraPose, type DriveLine, type Lamp, type Road, type Site, type StreetData } from './types';

/** Vehicles are followed this far from the incident. */
export const DRIVE_RADIUS = 120;
/** A road further from the incident than this is not its road. */
const MAX_ROAD_M = 70;
/** Road ends closer than this are the same point (the map cuts a road into pieces). */
const JOIN_M = 2;

/** How much less a road is wanted as the drive line (metres added to its distance). */
function reluctance(r: Road): number {
  if (r.tunnel) return 1000;
  if (CAR_ROADS.has(r.cls)) return r.cls === 'service' ? 5 : r.cls === 'motorway' ? 8 : 0;
  if (r.cls === 'pedestrian') return 14;
  if (r.cls === 'path') return 26;
  return 1000;
}

/** The road the incident is on, with the point of it nearest to the origin. */
function pickRoad(street: StreetData): { road: Road; index: number } | null {
  let best: { road: Road; index: number } | null = null;
  let bestScore = Infinity;
  street.roads.forEach((road, index) => {
    if (road.pts.length < 2) return;
    const n = nearestOnLine([0, 0], road.pts);
    const score = n.d + reluctance(road);
    if (n.d <= MAX_ROAD_M && score < bestScore) {
      bestScore = score;
      best = { road, index };
    }
  });
  return best;
}

/**
 * Follow a road beyond its end: the map cuts one street into several lines, so at an end the line that goes on
 * straightest (a drivable one, turning less than 55 degrees) continues it, until the line leaves the circle.
 */
function extend(street: StreetData, start: number): { pts: V2[]; deadA: boolean; deadB: boolean } {
  const used = new Set<number>([start]);
  let pts = street.roads[start].pts.slice();
  const drivable = (r: Road) => reluctance(r) < 1000;
  const grow = (): boolean => {
    const end = pts[pts.length - 1];
    if (dist(end, [0, 0]) > DRIVE_RADIUS) return false;
    const dir = norm(sub(end, pts[pts.length - 2]));
    let best: { pts: V2[]; i: number } | null = null;
    let bestTurn = Math.cos((55 * Math.PI) / 180);
    street.roads.forEach((r, i) => {
      if (used.has(i) || r.pts.length < 2 || !drivable(r)) return;
      for (const rev of [false, true]) {
        const line = rev ? r.pts.slice().reverse() : r.pts;
        if (dist(line[0], end) > JOIN_M) continue;
        const c = dot(dir, norm(sub(line[1], line[0])));
        if (c > bestTurn) {
          bestTurn = c;
          best = { pts: line, i };
        }
      }
    });
    if (!best) return false;
    const b = best as { pts: V2[]; i: number };
    used.add(b.i);
    pts = pts.concat(b.pts.slice(1));
    return true;
  };
  for (let k = 0; k < 12 && grow(); k++);
  pts.reverse();
  for (let k = 0; k < 12 && grow(); k++);
  pts.reverse();
  // Keep the run through the circle that passes the incident.
  const runs = clipLineToCircle(pts, [0, 0], DRIVE_RADIUS);
  let run = runs[0] ?? pts;
  let bestD = Infinity;
  for (const x of runs) {
    const d = nearestOnLine([0, 0], x).d;
    if (d < bestD) {
      bestD = d;
      run = x;
    }
  }
  const inside = (p: V2) => dist(p, [0, 0]) < DRIVE_RADIUS - 4;
  return { pts: run, deadA: inside(run[0]), deadB: inside(run[run.length - 1]) };
}

const solid = (b: Building) => !b.open && b.base < 2.5;

/** Is the straight line from a to b free of buildings? */
export function clearLine(street: StreetData, a: V2, b: V2, skip = -1): boolean {
  for (let i = 0; i < street.buildings.length; i++) {
    const bd = street.buildings[i];
    if (i === skip || !solid(bd)) continue;
    if (segmentHitsRing(a, b, bd.ring)) return false;
  }
  return true;
}

export function insideBuilding(street: StreetData, p: V2): number {
  for (let i = 0; i < street.buildings.length; i++) if (solid(street.buildings[i]) && pointInRing(p, street.buildings[i].ring)) return i;
  return -1;
}

/** A point of the drive line: `s` metres along it and `lat` metres to its left. */
export function onDrive(drive: DriveLine, s: number, lat: number): { pos: V2; dir: V2 } {
  const p = pointAlong(drive.pts, clamp(s, 0, drive.length));
  return { pos: along(p.pt, left(p.dir), lat), dir: p.dir };
}

function placeCamera(street: StreetData, drive: DriveLine, spot: V2, roadSpot: V2, side: 1 | -1, doorBuilding: number, seed: number): CameraPose {
  const r = rand(seed ^ 0x2545f491);
  // What the picture is about: the spot, with a share of the road vehicles stop on.
  const centre = lerp2(spot, roadSpot, 0.35);
  const first = r.chance(0.5) ? 1 : -1;
  const fov = r.range(48, 56);
  const sees = (p: V2, skip = -1) => clearLine(street, p, spot, skip) && clearLine(street, p, roadSpot, skip) && clearLine(street, p, centre, skip);
  const pose = (pos: V2, height: number, mount: 'pole' | 'wall'): CameraPose => ({ pos, height, target: centre, targetHeight: 0.9, fov, mount });

  // 1. A pole at the far kerb, a little along the road: the spot with its house fronts behind it, the road in front.
  const far = drive.width / 2 + 1.1;
  for (const sign of [first, -first]) {
    for (const d of [r.range(11, 15), 18, 8]) {
      const p = onDrive(drive, drive.at + sign * d, -side * far).pos;
      const dc = dist(p, centre);
      if (dc < 8 || dc > 26 || insideBuilding(street, p) >= 0 || !sees(p)) continue;
      return pose(p, r.range(5.4, 6.6), 'pole');
    }
  }
  // 2. A wall across the way or next door.
  const walls: { p: V2; h: number; d: number }[] = [];
  street.buildings.forEach((b, i) => {
    if (!solid(b) || i === doorBuilding || b.height < 4) return;
    const n = nearestOnRing(centre, b.ring);
    if (n.d < 9 || n.d > 26) return;
    const p = along(n.pt, n.normal, 0.5);
    if (insideBuilding(street, p) >= 0 || !sees(p, i)) return;
    walls.push({ p, h: Math.min(b.height - 0.4, r.range(4.6, 6.4)), d: n.d });
  });
  if (walls.length) {
    walls.sort((a, b) => a.d - b.d);
    const w = walls[Math.min(walls.length - 1, r.int(0, 1))];
    return pose(w.p, w.h, 'wall');
  }
  // 3. A pole on the same side, looking along the pavement.
  for (const sign of [first, -first]) {
    for (const d of [14, 18, 10]) {
      const p = onDrive(drive, drive.at + sign * d, side * (drive.width / 2 + 0.9)).pos;
      if (insideBuilding(street, p) >= 0 || !sees(p)) continue;
      return pose(p, r.range(5.4, 6.6), 'pole');
    }
  }
  // 4. Anywhere around that sees it.
  const a0 = r.range(0, Math.PI * 2);
  for (const rad of [15, 11, 20]) {
    for (let k = 0; k < 12; k++) {
      const a = a0 + (k * Math.PI) / 6;
      const p: V2 = [centre[0] + Math.cos(a) * rad, centre[1] + Math.sin(a) * rad];
      if (insideBuilding(street, p) >= 0 || !sees(p)) continue;
      return pose(p, r.range(5.6, 7), 'pole');
    }
  }
  // 5. Nothing sees it from the ground: from above.
  const p = along(centre, norm(sub(roadSpot, spot)), 7);
  const b = insideBuilding(street, p);
  return pose(p, b >= 0 ? street.buildings[b].height + 1.5 : 9, 'pole');
}

/**
 * Would something standing at `p` (a pole, a column, a sign) stand in the camera's picture closer than `reach` metres?
 * Real cameras are aimed past such things; the street is built so that nothing near blocks the view. The test is on
 * the ground plan: in front of the lens and inside the horizontal field of view, with a margin for the thing's width.
 */
export function blocksView(camera: CameraPose, p: V2, reach = 15, margin = 0.9): boolean {
  const dir = norm(sub(camera.target, camera.pos));
  const d = sub(p, camera.pos);
  const ahead = d[0] * dir[0] + d[1] * dir[1];
  if (ahead < -0.5 || ahead > reach) return false;
  const half = Math.atan(Math.tan(((camera.fov / 2) * Math.PI) / 180) * (16 / 9));
  const across = Math.abs(d[0] * dir[1] - d[1] * dir[0]);
  return across < Math.max(0, ahead) * Math.tan(half) + margin;
}

function placeLamps(street: StreetData, drive: DriveLine, side: 1 | -1, camera: CameraPose, walk: boolean): Lamp[] {
  const lamps: Lamp[] = [];
  const main = drive.cls === 'trunk' || drive.cls === 'primary' || drive.cls === 'secondary' || drive.cls === 'motorway';
  // A main road out of town (no pavements) is unlit, but for a lamp or two where another road joins it.
  const rural = main && !walk;
  const touches = (q: V2) => nearestOnLine(q, drive.pts).d < drive.width / 2 + 2;
  const joins: number[] = [];
  if (rural) {
    for (const o of street.roads) {
      if (!CAR_ROADS.has(o.cls) || o.pts.length < 2) continue;
      const ends = [o.pts[0], o.pts[o.pts.length - 1]];
      // A road that meets the drive line with one end and leaves it with the other (not a piece of the drive line itself).
      for (const [q, other] of [[ends[0], ends[1]], [ends[1], ends[0]]]) {
        if (!touches(q) || touches(other)) continue;
        const n = nearestOnLine(q, drive.pts);
        if (n.s > 1 && n.s < drive.length - 1) joins.push(n.s);
      }
    }
  }
  const gap = main ? 34 : 30;
  const height = main ? 8.5 : drive.cls === 'path' || drive.cls === 'pedestrian' ? 4.5 : 6.5;
  // One stands near the incident, the rest at the same spacing both ways; narrow streets have them on one side.
  let k = 0;
  for (let s = drive.at - 8 - gap * 3; s <= drive.at + gap * 4; s += gap, k++) {
    if (s < 2 || s > drive.length - 2) continue;
    const lampSide = drive.width > 6.2 ? (k % 2 ? 1 : -1) : -side;
    const p = onDrive(drive, s, lampSide * (drive.width / 2 + 0.7));
    if (insideBuilding(street, p.pos) >= 0) continue;
    if (rural && !joins.some((j) => Math.abs(j - s) < gap / 2)) continue;
    // A petrol station's forecourt is lit by its canopy, not by street lamps among the pumps.
    if (street.buildings.some((b) => b.open && b.area > 80 && (pointInRing(p.pos, b.ring) || nearestOnRing(p.pos, b.ring).d < 7))) continue;
    // Not right in front of the camera's lens, nor across its view of what it watches.
    if (dist(p.pos, camera.pos) < 4.5 || nearestOnSegment(p.pos, camera.pos, camera.target).d < 1.5 || blocksView(camera, p.pos)) continue;
    lamps.push({ pos: p.pos, height, yaw: yawOf(mul(left(p.dir), -lampSide)) });
  }
  return lamps;
}

/**
 * The site of an incident at the scene's origin, or null when the street data has no road near enough (the
 * caller then makes a street up, src/cctv/procedural.ts).
 */
export function buildSite(street: StreetData, seed: number): Site | null {
  const picked = pickRoad(street);
  if (!picked) return null;
  const ext = extend(street, picked.index);
  const length = lineLength(ext.pts);
  if (length < 24) return null;
  const near = nearestOnLine([0, 0], ext.pts);
  const road = picked.road;
  const drive: DriveLine = {
    pts: ext.pts,
    length,
    width: road.width,
    cls: road.cls,
    at: near.s,
    deadA: ext.deadA,
    deadB: ext.deadB,
    oneway: road.oneway,
  };
  const roadSpot = near.pt;
  const dir = near.dir;
  // Which side of the road the incident is on (on the centre line: the seed decides).
  const c = cross(dir, sub([0, 0], roadSpot));
  const side: 1 | -1 = Math.abs(c) < 0.3 ? (seed & 1 ? 1 : -1) : c > 0 ? 1 : -1;
  const edge = drive.width / 2;
  const nrm = mul(left(dir), side);
  // Beside the road: on the pavement at least, at most a few metres in (a forecourt, a yard).
  let lat = clamp(near.d, edge + (road.walk ? 1.4 : 1.7), edge + 9);
  let spot = along(roadSpot, nrm, lat);
  // Not inside a house, and with nothing between it and the road.
  for (let k = 0; k < 6 && (insideBuilding(street, spot) >= 0 || !clearLine(street, spot, roadSpot)); k++) {
    lat = Math.max(edge + 1.3, lat - 1.6);
    spot = along(roadSpot, nrm, lat);
  }

  // The nearest wall: the door people come out of.
  let door: V2 | null = null;
  let doorOut: V2 | null = null;
  let doorBuilding = -1;
  let bestD = 32;
  street.buildings.forEach((b, i) => {
    if (!solid(b)) return;
    const n = nearestOnRing(spot, b.ring);
    if (n.d < bestD && !pointInRing(spot, b.ring)) {
      bestD = n.d;
      door = n.pt;
      doorOut = n.normal;
      doorBuilding = i;
    }
  });

  const walk = edge + (road.walk ? 1.3 : 1.5);
  const camera = placeCamera(street, drive, spot, roadSpot, side, doorBuilding, seed);
  return {
    street,
    seed,
    spot,
    roadSpot,
    dir,
    side,
    drive,
    walkLeft: offsetLine(drive.pts, walk),
    walkRight: offsetLine(drive.pts, -walk),
    door,
    doorOut,
    doorBuilding,
    camera,
    lamps: placeLamps(street, drive, side, camera, road.walk),
  };
}

/** The walking line on the incident's side of the road. */
export const walkLine = (site: Site, sameSide = true): V2[] => ((site.side === 1) === sameSide ? site.walkLeft : site.walkRight);

/** A point on the incident's pavement, `d` metres further along the road than the spot (negative: back towards a). */
export function pavement(site: Site, d: number, sameSide = true): V2 {
  const line = walkLine(site, sameSide);
  const n = nearestOnLine(site.spot, line);
  return pointAlong(line, clamp(n.s + d, 0, lineLength(line))).pt;
}
