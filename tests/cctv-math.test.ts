/**
 * The plane geometry camera scenes stand on (src/cctv/math.ts, docs/CCTV.md section 3): the local frame in
 * metres, rings (area, centroid, inside, nearest wall point with its outward normal, the box around a house),
 * lines (offset, slice, cut at a circle) and the seeded randomness everything about a scene comes from.
 */
import { describe, expect, it } from 'vitest';
import {
  angleDiff,
  boundingBox,
  clipLineToCircle,
  dirOf,
  dist,
  dot,
  frameAt,
  hash01,
  hash32,
  left,
  len,
  lerpAngle,
  lineLength,
  nearestOnLine,
  nearestOnRing,
  nearestOnSegment,
  norm,
  offsetLine,
  pointAlong,
  pointInRing,
  rand,
  rectRing,
  ringArea,
  ringCentroid,
  segmentHitsRing,
  segmentsCross,
  sliceLine,
  wobble,
  yawOf,
  yawOfHeading,
  type V2,
} from '@/cctv/math';
import { haversineKm } from '@/sim/geo';
import type { LngLat } from '@/sim/types';

const turn = (p: V2, a: number): V2 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const close = (a: V2, b: V2, digits = 6) => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};

/** A 10 x 6 m rectangle, anticlockwise, its lower left corner at the origin. */
const RECT: V2[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
/** An L-shaped house: a 10 x 4 m wing along x and a 4 x 4 m wing on its west end. 56 m2. */
const L_HOUSE: V2[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]];

describe('the local frame', () => {
  const origin: LngLat = [24.7536, 59.437];
  const f = frameAt(origin);

  it('puts the origin at zero, east on x and north on y', () => {
    close(f.toLocal(origin), [0, 0]);
    expect(f.toLocal([origin[0] + 0.001, origin[1]])[0]).toBeGreaterThan(0);
    expect(f.toLocal([origin[0], origin[1] + 0.001])[1]).toBeGreaterThan(0);
    expect(f.toLocal([origin[0] + 0.001, origin[1]])[1]).toBe(0);
  });

  it('measures metres as the sim measures kilometres', () => {
    for (const d of [[0.002, 0], [0, 0.0015], [0.002, -0.001], [-0.0013, 0.0011]] as const) {
      const p: LngLat = [origin[0] + d[0], origin[1] + d[1]];
      const m = len(f.toLocal(p));
      expect(m).toBeGreaterThan(50);
      // Flat ground against the sphere: within a few centimetres over a couple of hundred metres.
      expect(Math.abs(m - haversineKm(origin, p) * 1000)).toBeLessThan(0.05);
    }
  });

  it('goes there and back', () => {
    for (const p of [[120, -80], [-33.3, 12.5], [0, 0]] as V2[]) close(f.toLocal(f.toLngLat(p)), p, 6);
  });

  it('turns a compass heading into a scene yaw', () => {
    close(dirOf(yawOfHeading(0)), [0, 1]);
    close(dirOf(yawOfHeading(90)), [1, 0]);
    close(dirOf(yawOfHeading(180)), [0, -1]);
    close(dirOf(yawOfHeading(270)), [-1, 0]);
  });
});

describe('angles and directions', () => {
  it('takes the short way round', () => {
    expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6, 9);
    expect(angleDiff(-3, 3)).toBeCloseTo(6 - 2 * Math.PI, 9);
    expect(angleDiff(0.1, 0.1 + 4 * Math.PI)).toBeCloseTo(0, 9);
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(3 + (2 * Math.PI - 6) / 2, 9);
  });

  it('left is a quarter turn anticlockwise, norm never divides by zero', () => {
    close(left([1, 0]), [0, 1]);
    close(left([0, 1]), [-1, 0]);
    expect(yawOf(left(dirOf(0.3)))).toBeCloseTo(0.3 + Math.PI / 2, 9);
    close(norm([0, 0]), [1, 0]);
    expect(len(norm([3, -4]))).toBeCloseTo(1, 12);
  });
});

describe('rings', () => {
  it('area is positive anticlockwise, negative clockwise', () => {
    expect(ringArea(RECT)).toBeCloseTo(60, 9);
    expect(ringArea(RECT.slice().reverse())).toBeCloseTo(-60, 9);
    expect(ringArea(L_HOUSE)).toBeCloseTo(56, 9);
    expect(ringArea([[0, 0], [5, 5]])).toBe(0);
    expect(ringArea([])).toBe(0);
  });

  it('area and centroid do not care where the ring starts or how it is turned', () => {
    const a = 0.7;
    const moved = L_HOUSE.map((p) => turn(p, a)).map((p): V2 => [p[0] + 300, p[1] - 120]);
    expect(ringArea(moved)).toBeCloseTo(56, 6);
    const c = ringCentroid(L_HOUSE);
    // Two rectangles: 40 m2 about (5, 2) and 16 m2 about (2, 6).
    close(c, [(40 * 5 + 16 * 2) / 56, (40 * 2 + 16 * 6) / 56], 9);
    const cm = ringCentroid([...moved.slice(3), ...moved.slice(0, 3)]);
    const want = turn(c, a);
    close(cm, [want[0] + 300, want[1] - 120], 6);
    close(ringCentroid(L_HOUSE.slice().reverse()), c, 9);
  });

  it('a ring without area answers with its first point', () => {
    close(ringCentroid([[3, 4], [3, 4], [3, 4]]), [3, 4]);
    close(ringCentroid([]), [0, 0]);
  });

  it('knows inside from outside, in the notch of an L too', () => {
    expect(pointInRing([5, 3], RECT)).toBe(true);
    expect(pointInRing([-0.1, 3], RECT)).toBe(false);
    expect(pointInRing([5, 6.1], RECT)).toBe(false);
    expect(pointInRing([2, 6], L_HOUSE)).toBe(true);
    expect(pointInRing([8, 2], L_HOUSE)).toBe(true);
    expect(pointInRing([7, 6], L_HOUSE)).toBe(false);
    expect(pointInRing([7, 6], L_HOUSE.slice().reverse())).toBe(false);
    expect(pointInRing([2, 6], L_HOUSE.slice().reverse())).toBe(true);
  });

  it('finds the nearest wall point and the way out of the wall', () => {
    // South of the south wall.
    let n = nearestOnRing([4, -3], RECT);
    close(n.pt, [4, 0]);
    expect(n.d).toBeCloseTo(3, 9);
    close(n.normal, [0, -1]);
    expect(n.edge).toBe(0);
    // East.
    n = nearestOnRing([14, 2], RECT);
    close(n.pt, [10, 2]);
    close(n.normal, [1, 0]);
    // From inside the normal still points out.
    n = nearestOnRing([1, 3], RECT);
    close(n.pt, [0, 3]);
    close(n.normal, [-1, 0]);
    // In the notch of the L: the wall that faces north.
    n = nearestOnRing([8, 5], L_HOUSE);
    close(n.pt, [8, 4]);
    close(n.normal, [0, 1]);
  });

  it('gives the same outward normal for a clockwise ring', () => {
    const cw = RECT.slice().reverse();
    close(nearestOnRing([4, -3], cw).normal, [0, -1]);
    close(nearestOnRing([14, 2], cw).normal, [1, 0]);
    close(nearestOnRing([5, 9], cw).normal, [0, 1]);
    close(nearestOnRing([-2, 3], cw).normal, [-1, 0]);
  });

  it('off a corner the nearest point is the corner', () => {
    const n = nearestOnRing([13, -4], RECT);
    close(n.pt, [10, 0]);
    expect(n.d).toBeCloseTo(5, 9);
    expect(len(n.normal)).toBeCloseTo(1, 9);
  });

  it('nearestOnSegment clamps to the ends and survives a segment without length', () => {
    expect(nearestOnSegment([5, 5], [0, 0], [10, 0])).toMatchObject({ t: 0.5, d: 5 });
    expect(nearestOnSegment([-5, 0], [0, 0], [10, 0]).t).toBe(0);
    expect(nearestOnSegment([25, 0], [0, 0], [10, 0])).toMatchObject({ t: 1, d: 15 });
    const z = nearestOnSegment([3, 4], [0, 0], [0, 0]);
    expect(z.d).toBeCloseTo(5, 9);
    expect(Number.isFinite(z.t)).toBe(true);
  });

  it('rectRing draws the rectangle anticlockwise around its centre', () => {
    const r = rectRing([5, 3], [1, 0], 10, 6);
    expect(ringArea(r)).toBeCloseTo(60, 9);
    close(ringCentroid(r), [5, 3], 9);
    const t = rectRing([0, 0], dirOf(0.5), 12, 4);
    expect(ringArea(t)).toBeCloseTo(48, 9);
    expect(dist(t[0], t[1])).toBeCloseTo(12, 9);
    expect(dist(t[1], t[2])).toBeCloseTo(4, 9);
  });
});

describe('segments', () => {
  it('cross when each one splits the other', () => {
    expect(segmentsCross([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
    expect(segmentsCross([0, 0], [10, 0], [0, 1], [10, 1])).toBe(false);
    expect(segmentsCross([0, 0], [4, 4], [6, 6], [6, 0])).toBe(false);
    // The lines cross, the segments do not reach each other.
    expect(segmentsCross([0, 0], [1, 1], [0, 10], [10, 0])).toBe(false);
  });

  it('touching ends and lying along each other do not count', () => {
    expect(segmentsCross([0, 0], [5, 5], [5, 5], [9, 0])).toBe(false);
    expect(segmentsCross([0, 0], [10, 0], [5, 0], [5, 7])).toBe(false);
    expect(segmentsCross([0, 0], [10, 0], [2, 0], [8, 0])).toBe(false);
  });

  it('a sight line is blocked by a house in the way, and by one it starts inside of', () => {
    expect(segmentHitsRing([-5, 3], [15, 3], RECT)).toBe(true);
    expect(segmentHitsRing([-5, -1], [15, -1], RECT)).toBe(false);
    expect(segmentHitsRing([2, 2], [8, 4], RECT)).toBe(true);
    // Past the notch of the L and through its wings.
    expect(segmentHitsRing([6, 9], [12, 5], L_HOUSE)).toBe(false);
    expect(segmentHitsRing([6, 9], [2, 2], L_HOUSE)).toBe(true);
  });
});

describe('the box around a house', () => {
  it('lies along the walls of an L-shaped house', () => {
    const b = boundingBox(L_HOUSE);
    expect(b.long).toBeCloseTo(10, 9);
    expect(b.short).toBeCloseTo(8, 9);
    close(b.c, [5, 4], 9);
    expect(Math.abs(b.axis[0])).toBeCloseTo(1, 9);
    expect(b.axis[1]).toBeCloseTo(0, 9);
  });

  it('turns with the house', () => {
    for (const a of [0.3, 1.1, 2.6, -0.8]) {
      const ring = L_HOUSE.map((p) => turn(p, a)).map((p): V2 => [p[0] - 40, p[1] + 25]);
      const b = boundingBox(ring);
      expect(b.long).toBeCloseTo(10, 6);
      expect(b.short).toBeCloseTo(8, 6);
      const c = turn([5, 4], a);
      close(b.c, [c[0] - 40, c[1] + 25], 6);
      expect(Math.abs(dot(b.axis, dirOf(a)))).toBeCloseTo(1, 6);
      // Every corner of the house is inside the box.
      for (const p of ring) {
        const rel: V2 = [p[0] - b.c[0], p[1] - b.c[1]];
        expect(Math.abs(dot(rel, b.axis))).toBeLessThanOrEqual(b.long / 2 + 1e-6);
        expect(Math.abs(dot(rel, left(b.axis)))).toBeLessThanOrEqual(b.short / 2 + 1e-6);
      }
    }
  });

  it('a long thin block has its axis along its length whichever edge comes first', () => {
    const block: V2[] = [[0, 0], [0, 60], [-12, 60], [-12, 0]];
    const b = boundingBox(block);
    expect(b.long).toBeCloseTo(60, 9);
    expect(b.short).toBeCloseTo(12, 9);
    expect(Math.abs(b.axis[1])).toBeCloseTo(1, 9);
  });

  it('a ring without edges still answers', () => {
    const b = boundingBox([[2, 2], [2, 2], [2, 2]]);
    expect(Number.isFinite(b.long) && Number.isFinite(b.short)).toBe(true);
    expect(boundingBox([]).long).toBeGreaterThan(0);
  });
});

describe('lines', () => {
  const BENT: V2[] = [[0, 0], [10, 0], [10, 10]];

  it('pointAlong walks the line and stops at its ends', () => {
    expect(lineLength(BENT)).toBe(20);
    close(pointAlong(BENT, 4).pt, [4, 0]);
    close(pointAlong(BENT, 4).dir, [1, 0]);
    close(pointAlong(BENT, 13).pt, [10, 3]);
    close(pointAlong(BENT, 13).dir, [0, 1]);
    close(pointAlong(BENT, -5).pt, [0, 0]);
    close(pointAlong(BENT, 99).pt, [10, 10]);
    close(pointAlong([[3, 3]], 5).pt, [3, 3]);
  });

  it('nearestOnLine says how far along and how far away', () => {
    const n = nearestOnLine([12, 6], BENT);
    close(n.pt, [10, 6]);
    expect(n.s).toBeCloseTo(16, 9);
    expect(n.d).toBeCloseTo(2, 9);
    close(n.dir, [0, 1]);
    expect(n.i).toBe(1);
    expect(nearestOnLine([-3, -4], BENT).s).toBe(0);
  });

  it('offsetLine moves a bent line to its left with a mitred corner', () => {
    const l = offsetLine(BENT, 1);
    close(l[0], [0, 1]);
    close(l[1], [9, 1]);
    close(l[2], [9, 10]);
    const r = offsetLine(BENT, -1.5);
    close(r[0], [0, -1.5]);
    close(r[1], [11.5, -1.5]);
    close(r[2], [11.5, 10]);
    // Every piece of the moved line runs parallel to its piece of the road, at the asked distance.
    for (let i = 0; i < 2; i++) {
      close(norm([l[i + 1][0] - l[i][0], l[i + 1][1] - l[i][1]]), norm([BENT[i + 1][0] - BENT[i][0], BENT[i + 1][1] - BENT[i][1]]));
      expect(nearestOnLine(lerpPt(l[i], l[i + 1]), BENT).d).toBeCloseTo(1, 6);
    }
  });

  it('offsetLine keeps a gentle bend at the asked distance and caps the mitre of a hairpin', () => {
    const gentle: V2[] = [[0, 0], [50, 0], [100, 8], [150, 30]];
    const moved = offsetLine(gentle, 4);
    expect(moved).toHaveLength(4);
    for (const p of moved) expect(nearestOnLine(p, gentle).d).toBeGreaterThan(3.9);
    for (const p of moved) expect(nearestOnLine(p, gentle).d).toBeLessThan(4.1);
    const hairpin: V2[] = [[0, 0], [20, 0], [0, 0.5]];
    const h = offsetLine(hairpin, 2);
    expect(dist(h[1], hairpin[1])).toBeLessThanOrEqual(4 + 1e-9);
    for (const p of h) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
  });

  it('sliceLine cuts a part out, either way round', () => {
    const part = sliceLine(BENT, 4, 16);
    expect(part).toHaveLength(3);
    close(part[0], [4, 0]);
    close(part[1], [10, 0]);
    close(part[2], [10, 6]);
    const back = sliceLine(BENT, 16, 4);
    close(back[0], [10, 6]);
    close(back[2], [4, 0]);
    expect(lineLength(sliceLine(BENT, -10, 100))).toBe(20);
  });

  it('clipLineToCircle keeps what is inside', () => {
    const out = clipLineToCircle([[0, 0], [30, 0], [100, 0]], [0, 0], 50);
    expect(out).toHaveLength(1);
    close(out[0][0], [0, 0]);
    close(out[0][out[0].length - 1], [50, 0], 4);
    expect(clipLineToCircle([[-10, 5], [10, 5]], [0, 0], 50)).toEqual([[[-10, 5], [10, 5]]]);
  });

  it('clipLineToCircle finds the chord of a line that only cuts through', () => {
    // Both ends far outside, no vertex inside: the chord at y = 30 of a circle of 50 m is 80 m long.
    const out = clipLineToCircle([[-100, 30], [100, 30]], [0, 0], 50);
    expect(out).toHaveLength(1);
    const run = out[0];
    close(run[0], [-40, 30], 4);
    close(run[run.length - 1], [40, 30], 4);
    expect(lineLength(run)).toBeCloseTo(80, 3);
    for (const p of run) expect(len(p)).toBeLessThanOrEqual(50 + 1e-3);
    // The same about a circle that is not at the origin, on a slanted line.
    const slanted = clipLineToCircle([[0, -200], [200, 0]], [100, -100], 20);
    expect(slanted).toHaveLength(1);
    expect(lineLength(slanted[0])).toBeCloseTo(40, 3);
  });

  it('clipLineToCircle leaves out a line that passes by, and keeps both visits of one that comes back', () => {
    expect(clipLineToCircle([[-100, 60], [100, 60]], [0, 0], 50)).toEqual([]);
    expect(clipLineToCircle([[60, -100], [60, 100]], [0, 0], 50)).toEqual([]);
    const twice = clipLineToCircle([[-100, 0], [0, 0], [0, 100], [20, 100], [20, 0], [100, 0]], [0, 0], 50);
    expect(twice).toHaveLength(2);
    close(twice[0][0], [-50, 0], 4);
    close(twice[0][twice[0].length - 1], [0, 50], 4);
    close(twice[1][twice[1].length - 1], [50, 0], 4);
    for (const run of twice) for (const p of run) expect(len(p)).toBeLessThanOrEqual(50 + 1e-3);
  });
});

function lerpPt(a: V2, b: V2): V2 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

describe('seeded randomness', () => {
  /** How unevenly `counts` are filled when each bucket should hold `want` (chi-square). */
  const chi2 = (counts: number[], want: number) => counts.reduce((sum, c) => sum + ((c - want) * (c - want)) / want, 0);

  it('hash32 is an unsigned 32-bit number and the same every time', () => {
    for (const parts of [['site', 12345], ['cam', 'street', 37122, 178311], [0], ['']] as (string | number)[][]) {
      const h = hash32(...parts);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
      expect(hash32(...parts)).toBe(h);
    }
    expect(hash32('a', 'b')).not.toBe(hash32('ab'));
    expect(hash32('a', 1)).not.toBe(hash32('a', 2));
    expect(hash32(1, 2)).not.toBe(hash32(2, 1));
  });

  it('ten thousand consecutive numbers fill a hundred buckets evenly', () => {
    // By the low digits, by the high bits, and behind a word: a camera's chance must not depend on its neighbour's.
    const fills: Record<string, number[]> = {
      low: new Array<number>(100).fill(0),
      high: new Array<number>(100).fill(0),
      word: new Array<number>(100).fill(0),
      far: new Array<number>(100).fill(0),
    };
    for (let i = 0; i < 10000; i++) {
      fills.low[hash32(i) % 100]++;
      fills.high[Math.floor(hash01(i) * 100)]++;
      fills.word[Math.floor(hash01('cam', 'street', i) * 100)]++;
      fills.far[Math.floor(hash01('cam', 37000000 + i, 178000000) * 100)]++;
    }
    for (const [name, counts] of Object.entries(fills)) {
      expect(counts.reduce((a, b) => a + b, 0)).toBe(10000);
      // A fair hundred-sided die thrown ten thousand times: about 100 a bucket, give or take 10.
      expect(Math.min(...counts), `${name}: emptiest bucket`).toBeGreaterThan(60);
      expect(Math.max(...counts), `${name}: fullest bucket`).toBeLessThan(140);
      expect(chi2(counts, 100), `${name}: chi-square over 99 degrees of freedom`).toBeLessThan(160);
    }
  });

  it('neighbouring numbers do not give neighbouring results', () => {
    let rising = 0;
    let sameHalf = 0;
    for (let i = 0; i < 10000; i++) {
      const a = hash01('n', i);
      const b = hash01('n', i + 1);
      if (b > a) rising++;
      if (a < 0.5 === b < 0.5) sameHalf++;
    }
    expect(rising).toBeGreaterThan(4800);
    expect(rising).toBeLessThan(5200);
    expect(sameHalf).toBeGreaterThan(4800);
    expect(sameHalf).toBeLessThan(5200);
  });

  it('rand gives the same run for the same seed, inside its ranges', () => {
    const a = rand(42);
    const b = rand(42);
    const c = rand(43);
    const runA = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(runA);
    expect(Array.from({ length: 20 }, () => c())).not.toEqual(runA);
    const r = rand(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const x = r.range(3, 5);
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThan(5);
      const n = r.int(2, 6);
      expect(Number.isInteger(n) && n >= 2 && n <= 6).toBe(true);
      seen.add(n);
      expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5, 6]);
    let hits = 0;
    for (let i = 0; i < 10000; i++) if (r.chance(0.25)) hits++;
    expect(hits).toBeGreaterThan(2300);
    expect(hits).toBeLessThan(2700);
  });

  it('wobble stays inside its bounds and moves smoothly', () => {
    for (const seed of [1, 97, 123456789]) {
      let prev = wobble(seed, 0);
      for (let t = 0.02; t < 30; t += 0.02) {
        const w = wobble(seed, t);
        expect(Math.abs(w)).toBeLessThanOrEqual(1);
        expect(Math.abs(w - prev)).toBeLessThan(0.2);
        prev = w;
      }
    }
  });
});
