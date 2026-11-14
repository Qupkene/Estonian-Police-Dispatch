/**
 * Kaamerad (docs/CCTV.md section 8): the director puts an incident's people and vehicles on the street and moves
 * them as the situation changes. Scripted situations are driven through it in steps of a tenth of a second, on
 * made-up streets of several kinds and on hand-made awkward ones, and every frame is checked: nobody inside a
 * house, nothing teleporting, vehicles on the road, nobody left behind.
 */
import { describe, expect, it, vi } from 'vitest';
import { TEMPLATE_BY_ID } from '@/data/incidents';
import { directorSpawn } from '@/sim/commands';
import { createShift } from '@/sim/engine';
import { tallinnTime } from '@/sim/time';
import type { Agency, OutcomeResult, PlaceKind } from '@/sim/types';
import { castOf, type Cast, type CastCar, type CastPerson, type SceneKind } from '@/cctv/cast';
import { Director } from '@/cctv/director';
import { PACE, lookOfStranger } from '@/cctv/figure';
import { dist, hash32, nearestOnLine, type V2 } from '@/cctv/math';
import { makeStreet } from '@/cctv/procedural';
import { buildSite, insideBuilding } from '@/cctv/site';
import type { CarFrame, Frame, Situation, UnitSit } from '@/cctv/stage';
import type { Site, StreetData } from '@/cctv/types';
import { CAR_SIZE, lookOfAnyCar } from '@/cctv/vehicle';

// Whole scenes are played frame by frame and every frame is checked: seconds each on a busy machine.
vi.setConfig({ testTimeout: 120_000 });

const DT = 0.1;
const DRESS = { season: 'autumn', temp: 8 } as const;
const KINDS: SceneKind[] = ['brawl', 'threat', 'disorder', 'lying', 'crash', 'stop', 'theft', 'indoor', 'crowd', 'fire', 'empty'];

function siteOf(kind: PlaceKind, seed: number): Site {
  const site = buildSite(makeStreet(kind, seed), seed);
  expect(site, `${kind} ${seed}`).not.toBeNull();
  return site!;
}

/** A hand-made street: one road and a few houses. */
function plainSite(pts: V2[], width: number, houses: V2[][] = [], cls: 'service' | 'residential' = 'residential'): Site {
  const street: StreetData = {
    source: 'made',
    radius: 150,
    roads: [{ cls, pts, width, oneway: 0, walk: cls === 'residential' }],
    buildings: houses.map((ring, i) => ({ id: i + 1, ring, height: 7, base: 0, area: 100, roof: 'flat' as const })),
    areas: [],
  };
  const site = buildSite(street, 7);
  expect(site).not.toBeNull();
  return site!;
}

const box = (x0: number, y0: number, x1: number, y1: number): V2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** A cast made by hand: the roles in order, as letters (s suspect, v victim, c caller, w witness, d driver, e extra). */
function castBy(kind: SceneKind, roles: string, over: Partial<Cast> = {}, cars: CastCar['role'][] = []): Cast {
  const names: Record<string, CastPerson['role']> = { s: 'suspect', v: 'victim', c: 'caller', w: 'witness', d: 'driver', e: 'extra' };
  const people: CastPerson[] = [...roles].map((ch, i) => {
    const seed = hash32('test', kind, i);
    return { id: ch === 'e' ? `e:${i}` : `p:${ch}${i}`, role: names[ch], look: lookOfStranger(seed, DRESS), seed };
  });
  return {
    kind,
    seed: hash32('cast', kind, roles),
    people,
    cars: cars.map((role, i) => ({ id: `v:T${i}`, role, look: lookOfAnyCar(hash32('car', kind, i)) })),
    dress: DRESS,
    armed: kind === 'threat',
    drunk: kind === 'disorder',
    down: kind === 'lying',
    live: true,
    runs: false,
    mayFlee: false,
    priority: 3,
    ...over,
  };
}

/** A usual cast for each kind of scene. */
function usual(kind: SceneKind, over: Partial<Cast> = {}): Cast {
  if (kind === 'brawl') return castBy(kind, 'svcw', over);
  if (kind === 'threat') return castBy(kind, 'svcw', over);
  if (kind === 'disorder') return castBy(kind, 'ssc', over);
  if (kind === 'lying') return castBy(kind, 'vc', over);
  if (kind === 'crash') return castBy(kind, 'ddw', over, ['involved', 'involved']);
  if (kind === 'stop') return castBy(kind, 'dc', over, ['suspect']);
  if (kind === 'theft') return castBy(kind, 'ssc', over, ['victim']);
  if (kind === 'indoor') return castBy(kind, 'svc', over);
  if (kind === 'crowd') return castBy(kind, 's' + 'e'.repeat(16), over);
  if (kind === 'fire') return castBy(kind, 'ceeee', over);
  return castBy(kind, 'c', over);
}

const NOBODY: Situation = { closed: false, units: [], agencies: [], pursuit: 'none', searching: false, outcome: null, progress: 0, paused: false };

const unit = (id: string, state: UnitSit['state'], over: Partial<UnitSit> = {}): UnitSit => ({
  id,
  type: 'patrol',
  model: 'Škoda Octavia Combi',
  crew: ['M', 'F'],
  state,
  eta: 0,
  from: 0,
  takes: null,
  ...over,
});

const sitWith = (units: UnitSit[], over: Partial<Situation> = {}): Situation => ({ ...NOBODY, units, ...over });

const ended = (result: OutcomeResult, units: UnitSit[], over: Partial<Situation> = {}): Situation =>
  sitWith(units, {
    closed: true,
    outcome: { result, arrests: result === 'arrest' ? 1 : 0, injuries: result === 'hospital' || result === 'tragedy' ? 1 : 0 },
    progress: 1,
    ...over,
  });

/** The corners of a vehicle's footprint, `shrink` metres smaller all round. */
function footprint(c: CarFrame, shrink: number): V2[] {
  const size = CAR_SIZE[c.look.body];
  const hl = size.length / 2 - shrink;
  const hw = size.width / 2 - shrink;
  const fx = Math.cos(c.yaw);
  const fy = Math.sin(c.yaw);
  return [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ].map(([a, b]) => [c.pos[0] + fx * hl * a - fy * hw * b, c.pos[1] + fy * hl * a + fx * hw * b] as V2);
}

/** Do two footprints overlap? (Separating axes of two boxes.) */
function boxesOverlap(p: V2[], q: V2[]): boolean {
  for (const box of [p, q]) {
    for (let i = 0; i < 2; i++) {
      const ax: V2 = [box[i + 1][0] - box[i][0], box[i + 1][1] - box[i][1]];
      const on = (pts: V2[]) => pts.map((v) => v[0] * ax[0] + v[1] * ax[1]);
      const a = on(p);
      const b = on(q);
      if (Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a)) return false;
    }
  }
  return true;
}

/** Is a point inside a footprint? */
function inFootprint(pt: V2, box: V2[]): boolean {
  for (let i = 0; i < 4; i++) {
    const a = box[i];
    const b = box[(i + 1) % 4];
    if ((b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]) > 0) return false;
  }
  return true;
}

/** Checks every frame of a scene: the invariants of section 8, and what was seen on the way. */
class Watch {
  phases: string[] = [];
  frames = 0;
  private last = new Map<string, V2>();
  private lastCar = new Map<string, V2>();
  /** Where each id was last seen. */
  seen = new Map<string, V2>();
  everCars = new Set<string>();

  constructor(
    readonly d: Director,
    readonly site: Site,
  ) {}

  step(sit: Situation, seconds: number, each?: (f: Frame, t: number) => void): Frame {
    let f = this.d.frame();
    for (let i = 0, n = Math.round(seconds / DT); i < n; i++) {
      this.d.update(sit, DT);
      f = this.d.frame();
      this.check(f);
      each?.(f, (i + 1) * DT);
    }
    return f;
  }

  check(f: Frame): void {
    this.frames++;
    if (this.phases[this.phases.length - 1] !== this.d.phase) this.phases.push(this.d.phase);
    const people = new Map<string, V2>();
    for (const p of f.people) {
      expect(people.has(p.id), `two of ${p.id}`).toBe(false);
      people.set(p.id, p.pos);
      const nums = [p.pos[0], p.pos[1], p.yaw, p.scale, p.pose.hip, p.pose.lean, p.pose.lift, p.pose.armL[0], p.pose.legR[2], p.pose.headYaw];
      expect(nums.every(Number.isFinite), `NaN in ${p.id}`).toBe(true);
      expect(insideBuilding(this.site.street, p.pos), `${p.id} inside a building at ${p.pos}`).toBe(-1);
      const was = this.last.get(p.id);
      // Nobody moves faster than a sprint.
      if (was) expect(dist(was, p.pos), `${p.id} jumped`).toBeLessThanOrEqual(PACE.run * DT + 0.06);
      this.seen.set(p.id, p.pos);
    }
    this.last = people;
    const cars = new Map<string, V2>();
    const parked: { id: string; pos: V2 }[] = [];
    for (const c of f.cars) {
      expect(cars.has(c.id), `two of ${c.id}`).toBe(false);
      cars.set(c.id, c.pos);
      this.everCars.add(c.id);
      expect([c.pos[0], c.pos[1], c.yaw].every(Number.isFinite), `NaN in ${c.id}`).toBe(true);
      const was = this.lastCar.get(c.id);
      const moved = was ? dist(was, c.pos) : 0;
      // No vehicle jumps: the fastest drive 24 m/s, a little more on the outside of a bend.
      expect(moved, `${c.id} jumped`).toBeLessThanOrEqual(34 * DT);
      // While it drives it is on the road: within a metre and a half of the carriageway.
      if (moved > 0.01)
        expect(nearestOnLine(c.pos, this.site.drive.pts).d, `${c.id} off the road`).toBeLessThanOrEqual(this.site.drive.width / 2 + 1.5);
      else if (was) parked.push({ id: c.id, pos: c.pos });
      this.seen.set(c.id, c.pos);
    }
    // No vehicle is inside another (a hand's breadth is allowed), and none that moves is where somebody stands.
    // Two vehicles of the incident may touch: they are the ones that crashed.
    const boxes = f.cars.map((c) => ({ c, box: footprint(c, 0.12), moved: !!this.lastCar.get(c.id) && dist(this.lastCar.get(c.id)!, c.pos) > 0.01 }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i].c.id.startsWith('v:') && boxes[j].c.id.startsWith('v:')) continue;
        if (dist(boxes[i].c.pos, boxes[j].c.pos) > 12) continue;
        expect(boxesOverlap(boxes[i].box, boxes[j].box), `${boxes[i].c.id} inside ${boxes[j].c.id} at ${f.t.toFixed(1)}`).toBe(false);
      }
      if (!boxes[i].moved) continue;
      const tight = footprint(boxes[i].c, 0.05);
      for (const p of f.people) expect(inFootprint(p.pos, tight), `${boxes[i].c.id} drives through ${p.id} at ${f.t.toFixed(1)}`).toBe(false);
    }
    this.lastCar = cars;
    for (let i = 0; i < parked.length; i++) {
      for (let j = i + 1; j < parked.length; j++)
        expect(dist(parked[i].pos, parked[j].pos), `${parked[i].id} on top of ${parked[j].id}`).toBeGreaterThan(1.7);
    }
  }
}

const start = (site: Site, cast: Cast, night = false): Watch => new Watch(new Director(site, cast, { night, quiet: true }), site);

/** The usual story: nobody, a patrol near, the patrol here. Returns the frame after `here` seconds on scene. */
function arrive(w: Watch, here = 30, from = 0): Frame {
  w.step(NOBODY, 3);
  w.step(sitWith([unit('P1', 'coming', { from })]), 2);
  for (let i = 0; i < 70; i++) w.step(sitWith([unit('P1', 'near', { eta: 7 - i * DT, from })]), DT);
  return w.step(sitWith([unit('P1', 'here', { from })]), here);
}

const isCast = (id: string) => id.startsWith('p:') || id.startsWith('e:');
const isCrew = (id: string) => id.startsWith('o:') || id.startsWith('m:');
const inOrder = (seen: string[], want: string[]) => {
  let i = 0;
  for (const p of seen) if (p === want[i]) i++;
  return i === want.length;
};

const PLACES: [PlaceKind, number][] = [
  ['street', 1],
  ['street', 4],
  ['residential', 2],
  ['parking', 3],
  ['oldtown', 5],
  ['house', 6],
  ['park', 7],
  ['highway', 8],
  ['gasstation', 9],
];

describe('cctv director: the stage before anyone comes', () => {
  it('every kind of scene stands on every kind of street, and stays open', () => {
    for (const kind of KINDS) {
      for (const [place, seed] of PLACES.slice(0, 5)) {
        const site = siteOf(place, seed);
        const w = start(site, usual(kind));
        const f = w.step(NOBODY, 12);
        const tag = `${kind} on ${place} ${seed}`;
        expect(w.phases, tag).toEqual(['open']);
        expect(
          f.people.every((p) => isCast(p.id)),
          tag,
        ).toBe(true);
        expect(
          f.cars.every((c) => c.id.startsWith('v:')),
          tag,
        ).toBe(true);
        if (kind === 'crash') {
          expect(f.cars.length, tag).toBe(2);
          expect(
            f.cars.every((c) => c.lights.hazard),
            tag,
          ).toBe(true);
        }
        if (kind === 'stop') expect(f.cars.length, tag).toBe(1);
        if (kind === 'fire') expect(f.smoke?.strength, tag).toBe(1);
        else expect(f.smoke ?? null, tag).toBeNull();
        // Somebody lies on the ground in a 'lying' scene.
        if (kind === 'lying')
          expect(
            f.people.some((p) => p.pose.hip < 0.3),
            tag,
          ).toBe(true);
        if (kind === 'crowd') expect(f.people.length, tag).toBeGreaterThanOrEqual(16);
        // Under a roof: at most the caller waits outside.
        if (kind === 'indoor' || kind === 'empty') expect(f.people.length, tag).toBeLessThanOrEqual(1);
        if (kind === 'brawl' || kind === 'threat' || kind === 'disorder' || kind === 'theft') expect(f.people.length, tag).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('an empty cast is an empty street', () => {
    for (const kind of KINDS) {
      const w = start(siteOf('street', 2), castBy(kind, ''));
      const f = arrive(w, 20);
      expect(
        f.people.every((p) => isCrew(p.id)),
        kind,
      ).toBe(true);
      w.step(ended('resolved', [unit('P1', 'left')]), 60);
      expect(w.d.frame().people, kind).toEqual([]);
      expect(w.d.frame().cars, kind).toEqual([]);
      expect(w.d.phase, kind).toBe('after');
    }
  });
});

describe('cctv director: a patrol arrives', () => {
  it('drives up from an end of the road, stops near the spot, and its officers reach their posts', () => {
    for (const kind of KINDS) {
      for (const [place, seed] of PLACES) {
        const site = siteOf(place, seed);
        const w = start(site, usual(kind), seed % 2 === 0);
        const tag = `${kind} on ${place} ${seed}`;
        const d = site.drive;
        w.step(NOBODY, 3);
        expect(
          w.d.frame().cars.some((c) => c.id === 'u:P1'),
          tag,
        ).toBe(false);
        w.step(sitWith([unit('P1', 'coming')]), 1);
        expect(
          w.d.frame().cars.some((c) => c.id === 'u:P1'),
          tag,
        ).toBe(false);
        // Near: the car appears at an end of the drive line, lights on.
        const first = w.step(sitWith([unit('P1', 'near', { eta: 7 })]), DT).cars.find((c) => c.id === 'u:P1');
        expect(first, tag).toBeDefined();
        expect(Math.min(dist(first!.pos, d.pts[0]), dist(first!.pos, d.pts[d.pts.length - 1])), tag).toBeLessThan(6);
        expect(first!.lights, tag).toMatchObject({ beacons: true, lamps: true });
        expect(
          w.d.frame().people.some((p) => p.id.startsWith('o:')),
          tag,
        ).toBe(false);
        let stoppedAt = -1;
        let prev = first!.pos;
        let braked = false;
        for (let i = 1; i < 70; i++) {
          const car = w.step(sitWith([unit('P1', 'near', { eta: 7 - i * DT })]), DT).cars.find((c) => c.id === 'u:P1')!;
          if (car.lights.braking) braked = true;
          if (stoppedAt < 0 && dist(car.pos, prev) < 1e-6) stoppedAt = i * DT;
          prev = car.pos;
        }
        // It stands when the game says it has arrived (a second early or late is not seen).
        expect(stoppedAt, tag).toBeGreaterThan(5.5);
        expect(stoppedAt, tag).toBeLessThanOrEqual(7);
        expect(braked, tag).toBe(true);
        let contactAt = -1;
        const f = w.step(sitWith([unit('P1', 'here')]), 22, (_, t) => {
          if (contactAt < 0 && w.d.phase === 'contact') contactAt = t;
        });
        const car = f.cars.find((c) => c.id === 'u:P1')!;
        // Near the spot, at its own kerb.
        const n = nearestOnLine(car.pos, d.pts);
        expect(Math.abs(n.s - d.at), tag).toBeLessThan(kind === 'crash' ? 20 : 28);
        expect(n.d, tag).toBeLessThanOrEqual(d.width / 2);
        expect(dist(car.pos, prev), tag).toBeLessThan(0.4);
        expect(car.lights.beacons, tag).toBe(true);
        expect(car.lights.lamps, tag).toBe(seed % 2 === 0);
        // Two officers got out and somebody reached a post within twenty seconds.
        expect(w.seen.has('o:P1:0') && w.seen.has('o:P1:1'), tag).toBe(true);
        expect(contactAt, tag).toBeGreaterThan(0);
        expect(contactAt, tag).toBeLessThanOrEqual(20);
        expect(inOrder(w.phases, ['open', 'seen', 'contact']), `${tag}: ${w.phases}`).toBe(true);
        expect(w.phases).not.toContain('closing');
      }
    }
  });

  it('comes from the side the game says, and from the open end of a dead end', () => {
    const site = siteOf('street', 1);
    const d = site.drive;
    const a = d.pts[0];
    const b = d.pts[d.pts.length - 1];
    for (const end of [a, b]) {
      const from = Math.atan2(end[1] - site.roadSpot[1], end[0] - site.roadSpot[0]);
      const w = start(site, usual('disorder'));
      w.step(NOBODY, DT);
      const car = w.step(sitWith([unit('P1', 'near', { eta: 7, from })]), DT).cars.find((c) => c.id === 'u:P1')!;
      expect(dist(car.pos, end)).toBeLessThan(6);
    }
    // A road that stops 30 m to the west: everybody arrives from the east, whatever the game's direction.
    const dead = plainSite(
      [
        [-30, -6],
        [150, -6],
      ],
      5.6,
      [box(-8, 3, 8, 14)],
    );
    expect(dead.drive.deadA !== dead.drive.deadB).toBe(true);
    const open = dead.drive.deadA ? dead.drive.pts[dead.drive.pts.length - 1] : dead.drive.pts[0];
    for (const from of [0, Math.PI]) {
      const w = start(dead, usual('indoor'));
      w.step(NOBODY, DT);
      const car = w.step(sitWith([unit('P1', 'near', { eta: 7, from })]), DT).cars.find((c) => c.id === 'u:P1')!;
      expect(dist(car.pos, open)).toBeLessThan(6);
      for (let i = 1; i < 70; i++) w.step(sitWith([unit('P1', 'near', { eta: 7 - i * DT, from })]), DT);
      w.step(sitWith([unit('P1', 'here', { from })]), 25);
      // It leaves by the open end too: it turns round.
      w.step(ended('resolved', [unit('P1', 'left')]), 60);
      expect(w.d.frame().cars).toEqual([]);
      expect(dist(w.seen.get('u:P1')!, open)).toBeLessThan(8);
    }
  });
});

describe('cctv director: what each kind of scene does', () => {
  it('brawl: the fight stops at contact, one officer by the suspect', () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('brawl'));
    const before = w.step(NOBODY, 6);
    const s0 = before.people.find((p) => p.id === 'p:s0')!;
    const v0 = before.people.find((p) => p.id === 'p:v1')!;
    // They are at each other.
    expect(dist(s0.pos, v0.pos)).toBeLessThan(1.3);
    const f = arrive(w, 30);
    const s1 = f.people.find((p) => p.id === 'p:s0')!;
    const v1 = f.people.find((p) => p.id === 'p:v1')!;
    expect(dist(s1.pos, v1.pos)).toBeGreaterThan(1.6);
    const officers = f.people.filter((p) => p.id.startsWith('o:'));
    expect(officers.length).toBe(2);
    expect(Math.min(...officers.map((o) => dist(o.pos, s1.pos)))).toBeLessThan(2);
  });

  it('brawl with a runner: one suspect is gone before the officers are out', () => {
    const w = start(siteOf('street', 4), castBy('brawl', 'ssvc', { runs: true }));
    const f = arrive(w, 40);
    expect(f.people.some((p) => p.id === 'p:s1')).toBe(false);
    expect(f.people.some((p) => p.id === 'p:s0')).toBe(true);
    // Ran, did not vanish on the spot.
    expect(dist(w.seen.get('p:s1')!, w.site.spot)).toBeGreaterThan(40);
  });

  it('threat: officers stop well short, the suspect ends on their knees and is held', () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('threat'));
    let nearest = Infinity;
    w.step(NOBODY, 3);
    for (let i = 0; i < 70; i++) w.step(sitWith([unit('P1', 'near', { eta: 7 - i * DT })]), DT);
    w.step(sitWith([unit('P1', 'here')]), 4, (f) => {
      const s = f.people.find((p) => p.id === 'p:s0')!;
      for (const o of f.people) if (o.id.startsWith('o:')) nearest = Math.min(nearest, dist(o.pos, s.pos));
    });
    expect(nearest).toBeGreaterThan(4.5);
    const f = w.step(sitWith([unit('P1', 'here')]), 30);
    const s = f.people.find((p) => p.id === 'p:s0')!;
    // Kneeling: the hips are low.
    expect(s.pose.hip).toBeLessThan(0.7);
    expect(Math.min(...f.people.filter((p) => p.id.startsWith('o:')).map((o) => dist(o.pos, s.pos)))).toBeLessThan(1.2);
    // The others kept away.
    for (const id of ['p:v1', 'p:c2', 'p:w3']) expect(dist(f.people.find((p) => p.id === id)!.pos, s.pos)).toBeGreaterThan(6);
  });

  it('indoor: the crew goes in at the door', () => {
    const site = siteOf('residential', 2);
    expect(site.door).not.toBeNull();
    const w = start(site, usual('indoor'));
    arrive(w, 20);
    const f = w.d.frame();
    // Both officers are behind the door, their car waits with its blue lights.
    for (const id of ['o:P1:0', 'o:P1:1']) expect(dist(w.seen.get(id)!, site.door!)).toBeLessThan(2.5);
    expect(f.people.filter((p) => p.id.startsWith('o:')).length).toBeLessThanOrEqual(1);
    expect(f.cars.find((c) => c.id === 'u:P1')!.lights.beacons).toBe(true);
  });

  it('stop: a pursuit takes the vehicle and the crew away', () => {
    const site = siteOf('street', 1);
    const w = start(site, castBy('stop', 'dc', { mayFlee: true }, ['suspect']));
    arrive(w, 15);
    expect(
      w.d
        .frame()
        .cars.map((c) => c.id)
        .sort(),
    ).toEqual(['u:P1', 'v:T0']);
    let blue = false;
    const stood = w.seen.get('u:P1')!;
    w.step(sitWith([unit('P1', 'left')], { pursuit: 'on' }), 40, (f) => {
      const car = f.cars.find((c) => c.id === 'u:P1');
      // It follows with its blue lights on.
      if (car && dist(car.pos, stood) > 20) blue = car.lights.beacons;
    });
    const f = w.d.frame();
    expect(f.cars).toEqual([]);
    expect(f.people.some((p) => p.id === 'p:d0' || isCrew(p.id))).toBe(false);
    expect(blue).toBe(true);
    // Both drove off: last seen far from the spot.
    expect(dist(w.seen.get('v:T0')!, site.roadSpot)).toBeGreaterThan(50);
    expect(dist(w.seen.get('u:P1')!, site.roadSpot)).toBeGreaterThan(50);
  });

  it('fire: the smoke dies down once the rescue service is at it', () => {
    const w = start(siteOf('house', 6), usual('fire'));
    arrive(w, 10);
    expect(w.d.frame().smoke!.strength).toBe(1);
    const sit = sitWith([unit('P1', 'here')], { agencies: [{ agency: 'paaste', state: 'here', eta: 0 }] });
    const f = w.step(sit, 60);
    expect(f.smoke!.strength).toBeCloseTo(0.15, 2);
    expect(f.people.filter((p) => p.id.startsWith('m:paaste')).length).toBe(3);
    expect(f.cars.find((c) => c.id === 'a:paaste')!.look.livery).toBe('rescue');
  });
});

describe('cctv director: how it ends', () => {
  const after = (w: Watch, tag: string) => {
    const f = w.d.frame();
    expect(w.d.phase, tag).toBe('after');
    expect(
      f.people.map((p) => p.id),
      tag,
    ).toEqual([]);
    expect(
      f.cars.filter((c) => !c.id.startsWith('v:')).map((c) => c.id),
      tag,
    ).toEqual([]);
    expect(f.smoke ?? null, tag).toBeNull();
  };

  it('arrest: the arrested is walked to the car and leaves with it; the others walk off', () => {
    for (const kind of ['brawl', 'threat', 'disorder', 'theft', 'indoor', 'crowd'] as SceneKind[]) {
      const site = siteOf(kind === 'indoor' ? 'residential' : 'street', kind === 'indoor' ? 2 : 1);
      const w = start(site, usual(kind));
      arrive(w, 25);
      let carAt: V2 = [0, 0];
      let goneAt = -1;
      let carLeftAt = -1;
      w.step(ended('arrest', [unit('P1', 'left', { takes: 'arrest' })]), 150, (f, t) => {
        const car = f.cars.find((c) => c.id === 'u:P1');
        if (car && goneAt < 0) carAt = car.pos;
        if (goneAt < 0 && t > 1 && !f.people.some((p) => p.id === 'p:s0')) goneAt = t;
        if (carLeftAt < 0 && !car) carLeftAt = t;
        // The car does not go without them.
        if (goneAt < 0) expect(car, kind).toBeDefined();
      });
      expect(goneAt, kind).toBeGreaterThan(2);
      // Last seen at the car's rear door.
      expect(dist(w.seen.get('p:s0')!, carAt), kind).toBeLessThan(3.2);
      expect(carLeftAt, kind).toBeGreaterThan(goneAt);
      expect(inOrder(w.phases, ['contact', 'closing', 'after']), `${kind}: ${w.phases}`).toBe(true);
      after(w, kind);
    }
  });

  it('escaped: the suspect runs off, nobody is taken', () => {
    const site = siteOf('street', 4);
    const w = start(site, usual('brawl'));
    arrive(w, 25);
    w.step(ended('escaped', [unit('P1', 'left')]), 110);
    expect(dist(w.seen.get('p:s0')!, site.spot)).toBeGreaterThan(40);
    after(w, 'escaped');
  });

  it('hospital: the patient leaves with the ambulance', () => {
    for (const kind of ['lying', 'crash', 'indoor'] as SceneKind[]) {
      const site = siteOf(kind === 'indoor' ? 'residential' : 'street', 2);
      const cast = kind === 'crash' ? castBy(kind, 'dvw', { down: true }, ['involved', 'involved']) : usual(kind);
      const w = start(site, cast);
      const patient = kind === 'lying' ? 'p:v0' : 'p:v1';
      arrive(w, 10);
      const ems = (state: 'near' | 'here', eta = 0) => [{ agency: 'kiirabi' as Agency, state, eta }];
      w.step(sitWith([unit('P1', 'here')], { agencies: ems('near', 6) }), 6);
      const f = w.step(sitWith([unit('P1', 'here')], { agencies: ems('here') }), 25);
      expect(f.cars.find((c) => c.id === 'a:kiirabi')!.look.livery, kind).toBe('ambulance');
      expect(w.seen.has('m:kiirabi:0') && w.seen.has('m:kiirabi:1'), kind).toBe(true);
      let ambAt: V2 = [0, 0];
      let aboardAt = -1;
      let ambLeftAt = -1;
      w.step(ended('hospital', [unit('P1', 'left')], { agencies: ems('here') }), 150, (fr, t) => {
        const amb = fr.cars.find((c) => c.id === 'a:kiirabi');
        if (amb && aboardAt < 0) ambAt = amb.pos;
        if (aboardAt < 0 && t > 1 && !fr.people.some((p) => p.id === patient)) aboardAt = t;
        if (ambLeftAt < 0 && !amb) ambLeftAt = t;
      });
      expect(aboardAt, kind).toBeGreaterThan(1);
      expect(dist(w.seen.get(patient)!, ambAt), kind).toBeLessThan(5);
      expect(ambLeftAt, kind).toBeGreaterThan(aboardAt);
      after(w, kind);
    }
  });

  it('hospital without an ambulance: the patient goes with the police car that takes them', () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('lying'));
    arrive(w, 20);
    let carAt: V2 = [0, 0];
    w.step(ended('hospital', [unit('P1', 'left', { takes: 'hospital' })]), 120, (f) => {
      const car = f.cars.find((c) => c.id === 'u:P1');
      if (car && f.people.some((p) => p.id === 'p:v0')) carAt = car.pos;
    });
    expect(dist(w.seen.get('p:v0')!, carAt)).toBeLessThan(3.2);
    after(w, 'hospital by police');
  });

  it('tragedy: whoever is down stays down while the crews are there', () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('lying'));
    arrive(w, 20);
    const at = w.d.frame().people.find((p) => p.id === 'p:v0')!.pos;
    const f = w.step(ended('tragedy', [unit('P1', 'here')]), 30);
    const v = f.people.find((p) => p.id === 'p:v0')!;
    expect(dist(v.pos, at)).toBeLessThan(0.01);
    expect(v.pose.hip).toBeLessThan(0.3);
    expect(w.d.phase).toBe('closing');
    w.step(ended('tragedy', [unit('P1', 'left')]), 110);
    after(w, 'tragedy');
  });

  it('a word and a note, then everybody goes: every kind, every mild result', () => {
    const results: OutcomeResult[] = ['warning', 'fine', 'report', 'resolved', 'referred', 'unfounded', 'false_alarm'];
    KINDS.forEach((kind, i) => {
      const [place, seed] = PLACES[i % PLACES.length];
      const w = start(siteOf(place, seed), usual(kind));
      arrive(w, 25);
      const result = results[i % results.length];
      // One crew writes its report on the spot for a while: it is still here after the incident closed.
      w.step(ended(result, [unit('P1', 'here')]), 20);
      expect(w.d.phase, kind).toBe('closing');
      expect(
        w.d.frame().cars.some((c) => c.id === 'u:P1'),
        kind,
      ).toBe(true);
      w.step(ended(result, [unit('P1', 'left')]), 110);
      after(w, `${kind} ${result}`);
      const cars = w.d.frame().cars;
      // A stopped driver drives off, cars that crashed lightly too.
      if (kind === 'stop' || kind === 'crash') expect(cars, kind).toEqual([]);
    });
  });

  it('a grave crash leaves its wrecks; a stopped car stays after an arrest', () => {
    const w = start(siteOf('street', 1), castBy('crash', 'dvw', { down: true }, ['involved', 'involved']));
    arrive(w, 20);
    w.step(ended('report', [unit('P1', 'left')]), 120);
    expect(w.d.phase).toBe('after');
    expect(w.d.frame().people).toEqual([]);
    const wrecks = w.d.frame().cars;
    expect(wrecks.map((c) => c.id).sort()).toEqual(['v:T0', 'v:T1']);
    expect(wrecks.every((c) => c.lights.hazard)).toBe(true);

    const s = start(siteOf('street', 4), castBy('stop', 'dc', {}, ['suspect']));
    arrive(s, 20);
    s.step(ended('arrest', [unit('P1', 'left', { takes: 'arrest' })]), 120);
    expect(s.d.phase).toBe('after');
    expect(s.d.frame().people).toEqual([]);
    expect(s.d.frame().cars.map((c) => c.id)).toEqual(['v:T0']);
  });

  it('closed without a crew: the people drift away', () => {
    for (const kind of KINDS) {
      const w = start(siteOf('street', 4), usual(kind));
      w.step(NOBODY, 5);
      let prev = new Map<string, V2>();
      w.step(sitWith([], { closed: true }), 25, (f, t) => {
        // Within twenty seconds everybody is on their way or gone.
        if (t > 20.5) for (const p of f.people) expect(dist(p.pos, prev.get(p.id) ?? [1e9, 0]), `${kind} ${p.id} still standing`).toBeGreaterThan(0);
        prev = new Map(f.people.map((p) => [p.id, p.pos]));
      });
      w.step(sitWith([], { closed: true }), 70);
      expect(w.d.phase, kind).toBe('after');
      expect(w.d.frame().people, kind).toEqual([]);
    }
  });
});

describe('cctv director: any moment is safe', () => {
  it('opening in the middle shows the same people in the same places as playing through', () => {
    for (const kind of KINDS) {
      for (const [place, seed] of PLACES.slice(0, 3)) {
        const site = siteOf(place, seed);
        const tag = `${kind} on ${place} ${seed}`;
        const here = sitWith([unit('P1', 'here')]);
        const played = start(site, usual(kind));
        arrive(played, 60);
        const opened = start(site, usual(kind));
        opened.step(here, 5);
        const a = played.d.frame();
        const b = opened.d.frame();
        expect(opened.d.phase, tag).toBe(played.d.phase);
        expect(b.cars.map((c) => c.id).sort(), tag).toEqual(a.cars.map((c) => c.id).sort());
        for (const c of a.cars) expect(dist(c.pos, b.cars.find((x) => x.id === c.id)!.pos), `${tag} ${c.id}`).toBeLessThan(0.5);
        // An indoor crew comes out to its radio now and then: only the incident's own people are compared there.
        const who = (f: Frame) => f.people.filter((p) => kind !== 'indoor' || isCast(p.id));
        expect(
          who(b)
            .map((p) => p.id)
            .sort(),
          tag,
        ).toEqual(
          who(a)
            .map((p) => p.id)
            .sort(),
        );
        for (const p of who(a)) expect(dist(p.pos, b.people.find((x) => x.id === p.id)!.pos), `${tag} ${p.id}`).toBeLessThan(0.5);
      }
    }
  });

  it('opening a closed incident shows an empty street', () => {
    for (const kind of KINDS) {
      const w = start(siteOf('street', 1), usual(kind));
      const f = w.step(ended('arrest', [unit('P1', 'left', { takes: 'arrest' })]), 12);
      expect(
        f.people.filter((p) => dist(p.pos, w.site.spot) < 45),
        kind,
      ).toEqual([]);
      expect(
        f.cars.filter((c) => !c.id.startsWith('v:')),
        kind,
      ).toEqual([]);
      w.step(ended('arrest', [unit('P1', 'left', { takes: 'arrest' })]), 60);
      expect(w.d.frame().people, kind).toEqual([]);
      expect(w.d.phase, kind).toBe('after');
    }
  });

  it('pause moves nothing', () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('brawl'));
    w.step(NOBODY, 2);
    for (let i = 0; i < 30; i++) w.step(sitWith([unit('P1', 'near', { eta: 7 - i * DT })]), DT);
    const a = w.d.frame();
    const paused = sitWith([unit('P1', 'near', { eta: 4 })], { paused: true });
    for (let i = 0; i < 50; i++) w.d.update(paused, DT);
    expect(w.d.frame()).toEqual(a);
    // And it goes on from where it stood.
    const b = w.step(sitWith([unit('P1', 'near', { eta: 4 })]), DT);
    expect(b.t).toBeCloseTo(a.t + DT, 6);
    expect(b.cars[0].pos).not.toEqual(a.cars[0].pos);
  });

  it('a camera opened while the game is paused shows the settled stage', () => {
    const w = start(siteOf('street', 1), usual('disorder'));
    w.d.update(sitWith([unit('P1', 'here')], { paused: true }), DT);
    const f = w.d.frame();
    expect(f.cars.map((c) => c.id)).toEqual(['u:P1']);
    expect(f.people.filter((p) => p.id.startsWith('o:')).length).toBe(2);
    expect(w.d.phase).toBe('contact');
  });

  it('the same inputs give identical frames', () => {
    const run = () => {
      const w = new Watch(new Director(siteOf('street', 4), usual('crowd'), { night: true }), siteOf('street', 4));
      const frames: Frame[] = [arrive(w, 12)];
      frames.push(w.step(ended('fine', [unit('P1', 'left')]), 30));
      return frames;
    };
    expect(run()).toEqual(run());
  });

  it('rapid changes end clean: near, here, outcome and left within three seconds', () => {
    const results: OutcomeResult[] = ['arrest', 'escaped', 'hospital', 'tragedy', 'warning', 'resolved'];
    for (const kind of KINDS) {
      for (const result of results) {
        const w = start(siteOf('street', 1), usual(kind));
        const tag = `${kind} ${result}`;
        w.step(NOBODY, 1);
        w.step(sitWith([unit('P1', 'near', { eta: 1.5 })]), 1);
        w.step(sitWith([unit('P1', 'here')]), 1);
        w.step(ended(result, [unit('P1', 'left', { takes: result === 'arrest' ? 'arrest' : null })]), 150);
        const f = w.d.frame();
        expect(w.d.phase, tag).toBe('after');
        expect(
          f.people.map((p) => p.id),
          tag,
        ).toEqual([]);
        expect(
          f.cars.filter((c) => !c.id.startsWith('v:')),
          tag,
        ).toEqual([]);
        expect(w.everCars.has('u:P1'), tag).toBe(true);
      }
    }
  });

  it('a crew recalled on its way drives on through; one called back gets out again', () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('disorder'));
    w.step(NOBODY, 1);
    w.step(sitWith([unit('P1', 'near', { eta: 7 })]), 2);
    w.step(sitWith([unit('P1', 'left')]), 20);
    expect(w.d.frame().cars).toEqual([]);
    expect(w.seen.has('o:P1:0')).toBe(false);
    expect(w.d.frame().people.length).toBe(3);
    // Sent again: it arrives again; released, then called back before it has left.
    for (let i = 0; i < 70; i++) w.step(sitWith([unit('P1', 'near', { eta: 7 - i * DT })]), DT);
    w.step(sitWith([unit('P1', 'here')]), 20);
    expect(w.d.phase).toBe('contact');
    w.step(sitWith([unit('P1', 'left')]), 2);
    const f = w.step(sitWith([unit('P1', 'here')]), 25);
    expect(f.cars.map((c) => c.id)).toEqual(['u:P1']);
    expect(f.people.filter((p) => p.id.startsWith('o:')).length).toBe(2);
  });
});

describe('cctv director: awkward streets and many crews', () => {
  const story = (w: Watch, tag: string, units = ['P1']) => {
    const list = (state: UnitSit['state'], over: Partial<UnitSit> = {}) =>
      units.map((id, i) => unit(id, state, { from: i % 2 ? 0 : Math.PI, ...over }));
    w.step(NOBODY, 2);
    for (let i = 0; i < 60; i++) w.step(sitWith(list('near', { eta: 6 - i * DT })), DT);
    w.step(sitWith(list('here')), 25);
    expect(w.d.phase, tag).toBe('contact');
    w.step(ended('arrest', list('left', { takes: 'arrest' })), 160);
    expect(w.d.phase, tag).toBe('after');
    expect(w.d.frame().people, tag).toEqual([]);
    expect(
      w.d.frame().cars.filter((c) => !c.id.startsWith('v:')),
      tag,
    ).toEqual([]);
  };

  it('a narrow service road with houses close by', () => {
    const site = plainSite(
      [
        [-140, -3],
        [140, -3],
      ],
      3.8,
      [box(-14, 0.4, 14, 9), box(-12, -16, 12, -6.4)],
      'service',
    );
    for (const kind of KINDS) story(start(site, usual(kind)), `narrow ${kind}`);
  });

  it('a yard road thirty metres long, dead at both ends', () => {
    const site = plainSite(
      [
        [-15, -5],
        [15, -5],
      ],
      4.6,
      [box(-9, 1, 9, 10)],
    );
    expect(site.drive.deadA && site.drive.deadB).toBe(true);
    for (const kind of KINDS) story(start(site, usual(kind)), `yard ${kind}`);
  });

  it('no door in sight, and a spot nine metres from the road', () => {
    const open = plainSite(
      [
        [-140, -12],
        [140, -12],
      ],
      6.5,
    );
    expect(open.door).toBeNull();
    for (const kind of KINDS) story(start(open, usual(kind)), `no door ${kind}`);
  });

  it('six units and two other services at once', () => {
    const site = siteOf('street', 1);
    for (const kind of ['brawl', 'crash', 'indoor', 'crowd'] as SceneKind[]) {
      const w = start(site, usual(kind));
      const ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
      const units = (state: UnitSit['state'], over: Partial<UnitSit> = {}) =>
        ids.map((id, i) =>
          unit(id, state, {
            from: i % 2 ? 0.3 : Math.PI + 0.3,
            type: i === 2 ? 'rapid' : i === 3 ? 'traffic' : 'patrol',
            crew: i === 2 ? ['M', 'M', 'F', 'M'] : ['M', 'F'],
            ...over,
          }),
        );
      const services = (state: 'near' | 'here') => [
        { agency: 'kiirabi' as Agency, state, eta: 5 },
        { agency: 'paaste' as Agency, state, eta: 5 },
      ];
      w.step(NOBODY, 2);
      for (let i = 0; i < 60; i++) w.step(sitWith(units('near', { eta: 6 - i * DT }), { agencies: services('near') }), DT);
      const f = w.step(sitWith(units('here'), { agencies: services('here') }), 30);
      expect(f.cars.filter((c) => c.id.startsWith('u:')).length, kind).toBe(6);
      expect(f.cars.filter((c) => c.id.startsWith('a:')).length, kind).toBe(2);
      // Four from the rapid response car, two from each of the others; two paramedics and three rescuers.
      expect([...w.seen.keys()].filter((id) => id.startsWith('o:')).length, kind).toBe(14);
      expect([...w.seen.keys()].filter((id) => id.startsWith('m:')).length, kind).toBe(5);
      w.step(ended('report', units('left'), { agencies: services('here') }), 160);
      expect(w.d.phase, kind).toBe('after');
      expect(w.d.frame().people, kind).toEqual([]);
      expect(
        w.d.frame().cars.filter((c) => !c.id.startsWith('v:')),
        kind,
      ).toEqual([]);
    }
  });

  it('a helicopter and a service without a vehicle are not staged', () => {
    const w = start(siteOf('street', 1), usual('empty'));
    const f = w.step(sitWith([unit('H1', 'here', { type: 'heli' })], { agencies: [{ agency: 'merepaaste', state: 'here', eta: 0 }] }), 10);
    expect(f.cars).toEqual([]);
    expect(f.people.every((p) => isCast(p.id))).toBe(true);
  });
});

describe('cctv director: incidents of a real shift', () => {
  it('plays the casts of real incidents of every category from start to end', { timeout: 120_000 }, () => {
    const s = createShift({
      seed: 77,
      regionId: 'pohja',
      mode: 'director',
      difficulty: 'normal',
      start: tallinnTime(2026, 10, 23, 19, 0),
      hours: 6,
      playerName: 'Kaamera',
      weather: 'clear',
    });
    const ids = [
      'violence_bar_fight_outside',
      'violence_street_stabbing',
      'domestic_violence',
      'property_theft_from_car',
      'traffic_lo_vigastatutega',
      'traffic_joobes_juhi_kahtlus',
      'public_order_drunk_harassing',
      'public_order_demonstration',
      'drugs_intoxicated_person',
      'missing_kadunud_laps',
      'alarm_shop_intrusion',
      'assist_joobes_isik_lumes',
      'assist_maja_suttimine',
      'major_pommiahvardus',
      'border_cigarette_smuggling',
      'environment_illegal_fire',
      'fraud_grandchild_scam',
      'easter_kitten_in_tree',
    ];
    const kinds = new Set<SceneKind>();
    ids.forEach((templateId, i) => {
      const id = directorSpawn(s, { templateId });
      expect(id, templateId).not.toBe('');
      const inc = s.incidents[id];
      const cast = castOf(s, inc, TEMPLATE_BY_ID[templateId], DRESS);
      kinds.add(cast.kind);
      const site = siteOf(inc.location.placeKind, hash32(inc.id) % 1000);
      const w = new Watch(new Director(site, cast, { night: i % 2 === 0 }), site);
      arrive(w, 25);
      const result = inc.outcome?.result ?? (['arrest', 'report', 'hospital', 'resolved'] as OutcomeResult[])[i % 4];
      w.step(ended(result, [unit('P1', 'left', { takes: result === 'arrest' ? 'arrest' : null })]), 170);
      const f = w.d.frame();
      expect(w.d.phase, templateId).toBe('after');
      // The street's own life goes on (this director is not quiet): nobody of the incident or of a crew is left.
      expect(
        f.people.filter((p) => isCast(p.id) || isCrew(p.id)).map((p) => p.id),
        templateId,
      ).toEqual([]);
      expect(
        f.cars.filter((c) => c.id.startsWith('u:') || c.id.startsWith('a:')),
        templateId,
      ).toEqual([]);
    });
    expect(kinds.size).toBeGreaterThanOrEqual(7);
  });

  it('traffic and passers-by come and go on a through road', () => {
    const site = siteOf('street', 1);
    const w = new Watch(new Director(site, usual('empty'), { night: false }), site);
    w.step(NOBODY, 240);
    const ids = [...w.seen.keys()];
    expect(ids.some((id) => id.startsWith('x:'))).toBe(true);
    if (!site.drive.deadA && !site.drive.deadB && ['primary', 'secondary', 'tertiary', 'trunk'].includes(site.drive.cls))
      expect(ids.some((id) => id.startsWith('c:'))).toBe(true);
    // Stable ids: nobody is counted twice, and they do not pile up.
    expect(w.d.frame().people.length).toBeLessThan(12);
    expect(w.d.frame().cars.length).toBeLessThan(8);
    const quiet = start(site, usual('empty'));
    quiet.step(NOBODY, 120);
    expect([...quiet.seen.keys()].filter((id) => id.startsWith('x:') || id.startsWith('c:'))).toEqual([]);
  });

  it('is cheap: a crowd of twenty with four cars updates in well under a millisecond', () => {
    const site = siteOf('street', 1);
    const d = new Director(site, castBy('crowd', 'ss' + 'e'.repeat(18), { riot: true, chant: true }), { night: true });
    const sit = sitWith([unit('P1', 'here'), unit('P2', 'here'), unit('P3', 'here', { from: Math.PI }), unit('P4', 'here', { from: Math.PI })]);
    d.update(sit, DT);
    expect(d.frame().cars.length).toBeGreaterThanOrEqual(4);
    expect(d.frame().people.length).toBeGreaterThanOrEqual(20);
    const n = 3000;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) d.update(sit, DT);
    const each = (performance.now() - t0) / n;
    expect(each).toBeLessThan(1);
  });
});

describe('cctv director: what the reviewers found', () => {
  const T = { timeout: 60_000 };
  /** A dead end at b: the road stops 25 m past the spot. */
  const deadEnd = () =>
    plainSite(
      [
        [-140, -5],
        [25, -5],
      ],
      6.5,
    );
  const officersOut = (f: Frame) => f.people.filter((p) => p.id.startsWith('o:')).length;

  it('a camera opened while a crew drives up shows it driving, not parked with its officers out', T, () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('disorder'));
    const f = w.step(sitWith([unit('P1', 'near', { eta: 6 })]), DT);
    expect(w.d.phase).toBe('open');
    expect(officersOut(f)).toBe(0);
    expect(dist(f.cars.find((c) => c.id === 'u:P1')!.pos, site.roadSpot)).toBeGreaterThan(30);
    // Another service that is seconds away is not at work yet either.
    const w2 = start(site, usual('lying'));
    const f2 = w2.step(sitWith([unit('P1', 'near', { eta: 5 })], { agencies: [{ agency: 'kiirabi', state: 'near', eta: 5 }] }), DT);
    expect(f2.people.every((p) => isCast(p.id))).toBe(true);
    for (let i = 1; i < 60; i++) w.step(sitWith([unit('P1', 'near', { eta: 6 - i * DT })]), DT);
    w.step(sitWith([unit('P1', 'here')]), 15);
    expect(w.d.phase).toBe('contact');
  });

  it('a crew that turns from near back to coming (the clock was slowed) keeps driving up and stops at the spot', T, () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('disorder'));
    w.step(NOBODY, 1);
    w.step(sitWith([unit('P1', 'near', { eta: 6 })]), 1.5);
    let far = 0;
    w.step(sitWith([unit('P1', 'coming')]), 8, (f) => {
      const car = f.cars.find((c) => c.id === 'u:P1');
      expect(car, 'the car stays in the picture').toBeDefined();
      far = Math.max(far, dist(car!.pos, site.roadSpot));
    });
    const at = w.seen.get('u:P1')!;
    expect(dist(at, site.roadSpot)).toBeLessThan(25);
    w.step(sitWith([unit('P1', 'near', { eta: 3 })]), 3);
    const f = w.step(sitWith([unit('P1', 'here')]), 20);
    expect(dist(w.seen.get('u:P1')!, at)).toBeLessThan(0.5);
    expect(officersOut(f)).toBe(2);
    expect(w.d.phase).toBe('contact');
  });

  it('a crew called back while its car pulls away stops again instead of driving out and in', T, () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('disorder'));
    arrive(w, 20);
    let moved = 0;
    const stood = w.seen.get('u:P1')!;
    for (let i = 0; i < 300 && moved < 4; i++) {
      w.step(sitWith([unit('P1', 'left')]), DT);
      moved = dist(w.seen.get('u:P1')!, stood);
    }
    expect(moved).toBeGreaterThanOrEqual(4);
    const f = w.step(sitWith([unit('P1', 'here')]), 30, (fr) => expect(fr.cars.some((c) => c.id === 'u:P1'), 'it does not leave the picture').toBe(true));
    expect(dist(w.seen.get('u:P1')!, site.roadSpot)).toBeLessThan(60);
    expect(officersOut(f)).toBe(2);
  });

  it('a crew recalled and sent again before a dead end gets out all the same', T, () => {
    for (const away of ['coming', 'left'] as const) {
      const w = start(deadEnd(), usual('disorder'));
      const from = Math.PI;
      w.step(NOBODY, 1);
      w.step(sitWith([unit('P1', 'near', { eta: 6, from })]), 1);
      w.step(sitWith([unit('P1', away, { from })]), 1);
      w.step(sitWith([unit('P1', 'near', { eta: 3, from })]), 3);
      const f = w.step(sitWith([unit('P1', 'here', { from })]), 40);
      expect(w.d.phase, away).toBe('contact');
      expect(officersOut(f), away).toBe(2);
      expect(f.cars.find((c) => c.id === 'u:P1')!.lights.beacons, away).toBe(true);
    }
  });

  it('stop: a driver who sits inside is arrested too, even right after contact', T, () => {
    const site = siteOf('street', 1);
    const w = start(site, castBy('stop', 'dc', { seed: hash32('r7', 3) }, ['suspect']));
    w.step(NOBODY, 1);
    // This seed puts the driver inside the car.
    expect(w.d.frame().people.some((p) => p.id === 'p:d0')).toBe(false);
    for (let i = 0; i < 60; i++) w.step(sitWith([unit('P1', 'near', { eta: 6 - i * DT })]), DT);
    // The arrest comes a second after the first word, long before the driver would have got out.
    for (let i = 0; i < 200 && w.d.phase !== 'contact'; i++) w.step(sitWith([unit('P1', 'here')]), DT);
    expect(w.d.phase).toBe('contact');
    w.step(sitWith([unit('P1', 'here')]), 1);
    expect(w.d.frame().people.some((p) => p.id === 'p:d0')).toBe(false);
    let carAt: V2 = [0, 0];
    w.step(ended('arrest', [unit('P1', 'left', { takes: 'arrest' })]), 150, (f) => {
      const car = f.cars.find((c) => c.id === 'u:P1');
      if (car && f.people.some((p) => p.id === 'p:d0')) carAt = car.pos;
    });
    expect(w.seen.has('p:d0')).toBe(true);
    expect(dist(w.seen.get('p:d0')!, carAt)).toBeLessThan(3.2);
    expect(w.d.phase).toBe('after');
    // The car of the arrested stays where it stood.
    expect(w.d.frame().cars.map((c) => c.id)).toEqual(['v:T0']);
  });

  it('stop: an escape that follows the start of the pursuit by a second still takes the vehicle away', T, () => {
    for (const seed of [1, 2, 3, 4]) {
      const site = siteOf('street', 1);
      const w = start(site, castBy('stop', 'dc', { seed: hash32('flee', seed), mayFlee: true }, ['suspect']));
      arrive(w, 20);
      const stood = w.seen.get('v:T0')!;
      w.step(sitWith([unit('P1', 'left')], { pursuit: 'on' }), 1);
      w.step(ended('escaped', [unit('P1', 'left')], { pursuit: 'over' }), 150);
      expect(w.d.phase, `seed ${seed}`).toBe('after');
      expect(w.d.frame().cars, `seed ${seed}`).toEqual([]);
      // The driver went with the car: last seen beside it, not walking off.
      if (w.seen.has('p:d0')) expect(dist(w.seen.get('p:d0')!, stood), `seed ${seed}`).toBeLessThan(4);
    }
  });

  it('stop: in a pursuit the police car follows the way the suspect drove', T, () => {
    for (const from of [0, Math.PI]) {
      const site = siteOf('street', 1);
      const w = start(site, castBy('stop', 'dc', { mayFlee: true }, ['suspect']));
      arrive(w, 15, from);
      w.step(sitWith([unit('P1', 'left', { from })], { pursuit: 'on' }), 45);
      expect(w.d.frame().cars, `from ${from}`).toEqual([]);
      // Both were last seen at the same end of the road.
      expect(dist(w.seen.get('v:T0')!, w.seen.get('u:P1')!), `from ${from}`).toBeLessThan(40);
    }
  });

  it('theft with runners and no vehicle: every thief runs when the police come in sight', T, () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('theft', { runs: true }));
    const f = arrive(w, 30);
    expect(f.people.filter((p) => p.id.startsWith('p:s')).map((p) => p.id)).toEqual([]);
    for (const id of ['p:s0', 'p:s1']) expect(dist(w.seen.get(id)!, site.spot), id).toBeGreaterThan(40);
  });

  it('arrest: every arrested goes into the car of the crew that takes them', T, () => {
    const site = siteOf('street', 1);
    const w = start(site, castBy('brawl', 'ssvv'));
    const crews = (state: UnitSit['state'], takes: UnitSit['takes'] = null) => [
      unit('P1', state, { crew: ['M'], takes }),
      unit('P2', state, { from: Math.PI }),
    ];
    w.step(NOBODY, 1);
    for (let i = 0; i < 60; i++) w.step(sitWith(crews('near').map((u) => ({ ...u, eta: 6 - i * DT }))), DT);
    w.step(sitWith(crews('here')), 25);
    const p1 = w.seen.get('u:P1')!;
    const sit = ended('arrest', crews('left', 'arrest').map((u) => (u.id === 'P2' ? { ...u, takes: null } : u)));
    w.step({ ...sit, outcome: { result: 'arrest', arrests: 2, injuries: 0 } }, 160);
    for (const id of ['p:s0', 'p:s1']) expect(dist(w.seen.get(id)!, p1), id).toBeLessThan(3.2);
    expect(w.d.phase).toBe('after');
  });

  it('threat: everybody keeps eight metres from the weapon, the officers seven', T, () => {
    for (const [kind, seed] of [
      ['street', 1],
      ['street', 4],
      ['residential', 2],
      ['parking', 3],
    ] as [PlaceKind, number][]) {
      const site = siteOf(kind, seed);
      const w = start(site, castBy('threat', 'svvcw'));
      const tag = `${kind} ${seed}`;
      let near = Infinity;
      w.step(NOBODY, 40, (f) => {
        const armed = f.people.find((p) => p.id === 'p:s0')!;
        for (const p of f.people) if (p.id !== 'p:s0') near = Math.min(near, dist(p.pos, armed.pos));
      });
      expect(near, tag).toBeGreaterThanOrEqual(8);
      // Where the officers stop (not where they walk past on their way), until the suspect gives up.
      let cops = Infinity;
      let far = 0;
      let since = -1;
      const was = new Map<string, V2>();
      for (let i = 0; i < 400 && (since < 0 || i < since + 15); i++) {
        const f = w.step(sitWith([unit('P1', i < 60 ? 'near' : 'here', { eta: Math.max(0, 6 - i * DT) })]), DT);
        const armed = f.people.find((p) => p.id === 'p:s0')!;
        for (const p of f.people) {
          if (!p.id.startsWith('o:')) continue;
          const d = dist(p.pos, armed.pos);
          const before = was.get(p.id);
          if (before && dist(before, p.pos) < 1e-6 && d < 15) {
            cops = Math.min(cops, d);
            far = Math.max(far, d);
          }
          was.set(p.id, p.pos);
        }
        if (since < 0 && w.d.phase === 'contact') since = i;
      }
      expect(since, tag).toBeGreaterThan(0);
      expect(cops, tag).toBeGreaterThanOrEqual(6.9);
      expect(far, tag).toBeLessThanOrEqual(9.8);
    }
  });

  it('a patrol boat is not staged as a car in the street', T, () => {
    const w = start(siteOf('street', 1), usual('empty'));
    const f = w.step(sitWith([unit('B1', 'here', { type: 'boat' })]), 10);
    expect(f.cars).toEqual([]);
    expect(f.people.every((p) => isCast(p.id))).toBe(true);
  });

  it('a ride home: the person goes into the car of the crew that drives them', T, () => {
    const site = siteOf('street', 1);
    const w = start(site, castBy('disorder', 'sc'));
    arrive(w, 20);
    const stood = w.seen.get('u:P1')!;
    w.step(ended('resolved', [unit('P1', 'left', { takes: 'ride' })]), 150);
    expect(dist(w.seen.get('p:s0')!, stood)).toBeLessThan(3.2);
    expect(w.d.phase).toBe('after');
    expect(w.d.frame().people).toEqual([]);
  });

  it('hospital: with an ambulance here the patient still goes with the police crew the game sends to hospital', T, () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('lying'));
    const ems = [{ agency: 'kiirabi' as Agency, state: 'here' as const, eta: 0 }];
    arrive(w, 5);
    w.step(sitWith([unit('P1', 'here')], { agencies: ems }), 25);
    const stood = w.seen.get('u:P1')!;
    w.step(ended('hospital', [unit('P1', 'left', { takes: 'hospital' })], { agencies: ems }), 150);
    expect(dist(w.seen.get('p:v0')!, stood)).toBeLessThan(3.2);
    expect(w.d.phase).toBe('after');
  });

  it('an outcome that comes while the only crew drives up holds it fourteen seconds, not forty', T, () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('disorder'));
    w.step(NOBODY, 1);
    w.step(sitWith([unit('P1', 'near', { eta: 5 })]), 1);
    let parkedAt = -1;
    let leftAt = -1;
    let was: V2 | null = null;
    w.step(ended('warning', [unit('P1', 'left')]), 60, (f, t) => {
      const car = f.cars.find((c) => c.id === 'u:P1');
      if (car && was && parkedAt < 0 && dist(car.pos, was) < 1e-6) parkedAt = t;
      if (car && was && parkedAt >= 0 && leftAt < 0 && t > parkedAt + 1 && dist(car.pos, was) > 0.05) leftAt = t;
      was = car ? car.pos : null;
    });
    expect(parkedAt).toBeGreaterThan(0);
    // Held for the closing scene fourteen seconds from the outcome at most, then the walk back to the car.
    expect(leftAt).toBeGreaterThan(parkedAt);
    expect(leftAt).toBeLessThan(14 + 9);
  });

  it('somebody getting out on the road side walks round the front of the car', T, () => {
    for (const from of [0, Math.PI]) {
      const site = siteOf('street', 1);
      const w = start(site, usual('disorder'));
      const crew = unit('R1', 'near', { type: 'rapid', crew: ['M', 'M', 'F', 'M'], from });
      w.step(NOBODY, 1);
      for (let i = 0; i < 60; i++) w.step(sitWith([{ ...crew, eta: 6 - i * DT }]), DT);
      w.step(sitWith([{ ...crew, state: 'here' }]), 12, (f) => {
        const car = f.cars.find((c) => c.id === 'u:R1')!;
        for (const p of f.people) {
          if (!p.id.startsWith('o:')) continue;
          const ahead = (p.pos[0] - car.pos[0]) * Math.cos(car.yaw) + (p.pos[1] - car.pos[1]) * Math.sin(car.yaw);
          const left = -(p.pos[0] - car.pos[0]) * Math.sin(car.yaw) + (p.pos[1] - car.pos[1]) * Math.cos(car.yaw);
          // Nobody passes behind the rear bumper on the way from a door.
          expect(ahead < -2.5 && Math.abs(left) < 0.8, `${p.id} behind the car, from ${from}`).toBe(false);
        }
      });
      expect([...w.seen.keys()].filter((id) => id.startsWith('o:')).length).toBe(4);
    }
  });

  it('passing traffic does not drive through the people in the road', { timeout: 120_000 }, () => {
    const site = siteOf('street', 1);
    expect(site.drive.deadA || site.drive.deadB).toBe(false);
    let passed = 0;
    for (const kind of KINDS) {
      // The Watch checks every moving vehicle against everybody on stage.
      const w = new Watch(new Director(site, usual(kind), { night: false }), site);
      w.step(sitWith([unit('P1', 'here')]), 120);
      passed += [...w.everCars].filter((id) => id.startsWith('c:')).length;
      w.step(ended('report', [unit('P1', 'left')]), 40);
    }
    // The street is not simply closed: traffic did pass in most scenes.
    expect(passed).toBeGreaterThan(20);
  });

  it('crews arriving together, parking, and leaving together never drive through one another', { timeout: 120_000 }, () => {
    const places: [PlaceKind, number][] = [
      ['park', 7],
      ['house', 6],
      ['street', 2],
      ['street', 1],
      ['highway', 8],
    ];
    for (const [place, seed] of places) {
      const site = siteOf(place, seed);
      for (const kind of KINDS) {
        const w = start(site, usual(kind));
        const tag = `${place} ${seed} ${kind}`;
        const crews = (state: UnitSit['state'], eta = 0) => [unit('P1', state, { eta }), unit('P2', state, { eta, from: Math.PI }), unit('P3', state, { eta })];
        const ems = (state: 'near' | 'here', eta = 0) => [{ agency: 'kiirabi' as Agency, state, eta }];
        w.step(NOBODY, 1);
        // The ambulance and the patrols turn near in the same moment, two of them from the same end.
        for (let i = 0; i < 40; i++) w.step(sitWith(crews('near', 4 - i * DT), { agencies: ems('near', Math.max(0, 3 - i * DT)) }), DT);
        w.step(sitWith(crews('here'), { agencies: ems('here') }), 30);
        expect(w.d.phase, tag).toBe('contact');
        // Everybody is released at once.
        w.step(ended('report', crews('left'), { agencies: ems('here') }), 150);
        expect(w.d.phase, tag).toBe('after');
        expect(
          w.d.frame().cars.filter((c) => !c.id.startsWith('v:')),
          tag,
        ).toEqual([]);
      }
    }
  });

  it('a yard too short for every car: nobody parks on top of another, the rest stay out of the picture', T, () => {
    const site = plainSite(
      [
        [-15, -5],
        [15, -5],
      ],
      4.6,
      [box(-9, 1, 9, 10)],
    );
    for (const n of [5, 12]) {
      const w = start(site, usual('disorder'));
      const ids = Array.from({ length: n }, (_, i) => `P${i}`);
      const crews = (state: UnitSit['state'], eta = 0) => ids.map((id, i) => unit(id, state, { eta, from: i % 2 ? 0 : Math.PI }));
      w.step(NOBODY, 1);
      for (let i = 0; i < 50; i++) w.step(sitWith(crews('near', 5 - i * DT)), DT);
      const f = w.step(sitWith(crews('here')), 40);
      expect(w.d.phase).toBe('contact');
      expect(f.cars.filter((c) => c.id.startsWith('u:')).length).toBeGreaterThanOrEqual(2);
      w.step(ended('report', crews('left')), 200);
      expect(w.d.phase, `${n} units`).toBe('after');
      expect(w.d.frame().cars, `${n} units`).toEqual([]);
    }
  });

  it('a crash beside a dead end: the crews come from the side they can reach, not through the wrecks', T, () => {
    const site = plainSite(
      [
        [-2, -5],
        [80, -5],
      ],
      6.5,
    );
    const w = start(site, usual('crash'));
    const crews = (state: UnitSit['state'], eta = 0) => [unit('P1', state, { eta, from: Math.PI }), unit('P2', state, { eta, from: 0 })];
    w.step(NOBODY, 1);
    for (let i = 0; i < 50; i++) w.step(sitWith(crews('near', 5 - i * DT)), DT);
    const f = w.step(sitWith(crews('here')), 30);
    expect(f.cars.filter((c) => c.id.startsWith('u:')).length).toBe(2);
    expect(w.d.phase).toBe('contact');
    w.step(ended('report', crews('left')), 150);
    expect(w.d.phase).toBe('after');
  });

  it('the picture does not depend on how time is cut into frames', T, () => {
    const run = (cut: number[]) => {
      const site = siteOf('street', 1);
      const d = new Director(site, usual('brawl'), { night: false });
      const sits: Situation[] = [];
      for (let i = 0; i < 300; i++)
        sits.push(i < 20 ? NOBODY : i < 80 ? sitWith([unit('P1', 'near', { eta: 8 - i * DT })]) : i < 200 ? sitWith([unit('P1', 'here')]) : ended('fine', [unit('P1', 'left')]));
      for (const sit of sits) for (const part of cut) d.update(sit, DT * part);
      return JSON.stringify(d.frame());
    };
    const whole = run([1]);
    expect(run([0.5, 0.5])).toBe(whole);
    expect(run([0.25, 0.25, 0.25, 0.25])).toBe(whole);
    expect(run([0.3, 0.7])).toBe(whole);
  });

  it('between two steps the picture moves smoothly', T, () => {
    const site = siteOf('street', 1);
    const d = new Director(site, usual('disorder'), { night: false, quiet: true });
    d.update(NOBODY, DT);
    let was: V2 | null = null;
    let most = 0;
    let least = Infinity;
    for (let i = 0; i < 240; i++) {
      d.update(sitWith([unit('P1', 'near', { eta: 6 - i / 60 })]), 1 / 60);
      const car = d.frame().cars.find((c) => c.id === 'u:P1');
      if (car && was && i > 30 && i < 150) {
        most = Math.max(most, dist(car.pos, was));
        least = Math.min(least, dist(car.pos, was));
      }
      was = car ? car.pos : null;
    }
    // A car at ten or twenty metres a second moves a little every sixtieth of a second, not a metre every tenth.
    expect(most).toBeLessThan(0.6);
    expect(least).toBeGreaterThan(0.01);
  });
});

describe('cctv director: what the films showed', () => {
  it('an arrest out of a door: the suspect comes out first, the officer holds on from behind, never in the same place', () => {
    const site = siteOf('residential', 2);
    const w = start(site, usual('indoor'));
    arrive(w, 20);
    let closest = Infinity;
    let both = 0;
    w.step(ended('arrest', [unit('P1', 'here')]), 14, (f) => {
      const s = f.people.find((p) => p.id === 'p:s0');
      const o = f.people.find((p) => p.id === 'o:P1:0' || p.id === 'o:P1:1');
      if (s && o && s.scale >= 1 && o.scale >= 1) {
        both++;
        closest = Math.min(closest, dist(s.pos, o.pos));
      }
    });
    expect(both).toBeGreaterThan(10);
    expect(closest).toBeGreaterThan(0.4);
  });

  it('officers nobody needs for the closing scene come out of the door and wait by their car', () => {
    const site = siteOf('residential', 2);
    const w = start(site, usual('indoor'));
    arrive(w, 20);
    const f = w.step(ended('arrest', [unit('P1', 'here')]), 25);
    const out = f.people.filter((p) => p.id.startsWith('o:P1:'));
    expect(out.length).toBe(2);
    const car = f.cars.find((c) => c.id === 'u:P1')!;
    for (const o of out) expect(dist(o.pos, car.pos)).toBeLessThan(5);
  });

  it('nobody stands on open water: a street along a river, the water just behind the spot', () => {
    const street: StreetData = {
      source: 'made',
      radius: 150,
      roads: [{ cls: 'residential', pts: [[-120, -6], [120, -6]], width: 7, oneway: 0, walk: true }],
      buildings: [{ id: 1, ring: box(-40, -30, 40, -16), height: 9, base: 0, area: 1120, roof: 'flat' }],
      areas: [{ kind: 'water', ring: box(-200, 1.5, 200, 90) }],
    };
    const site = buildSite(street, 7)!;
    expect(site).not.toBeNull();
    const wet = (p: V2) => p[1] > 1.5 && nearestOnLine(p, street.roads[0].pts).d > 3.5 + 3;
    for (const kind of KINDS) {
      const w = start(site, usual(kind));
      const f = arrive(w, 20);
      for (const p of f.people) expect(wet(p.pos), `${kind}: ${p.id} on the water at ${p.pos}`).toBe(false);
    }
  });

  it('fire: the smoke comes out low enough to be in the picture, and the onlookers stand in a loose knot, not a row', () => {
    const site = siteOf('residential', 5);
    expect(site.door).not.toBeNull();
    const w = start(site, usual('fire'));
    const f = w.step(NOBODY, 2);
    expect(f.smoke!.height).toBeLessThan(3.5);
    const folk = f.people.filter((p) => isCast(p.id)).map((p) => p.pos);
    expect(folk.length).toBeGreaterThanOrEqual(4);
    // How far the onlookers stand off the straight line through the outermost two.
    const [a, b] = [folk[0], folk[folk.length - 1]];
    const l = dist(a, b) || 1;
    const off = folk.map((p) => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / l);
    expect(Math.max(...off)).toBeGreaterThan(0.5);
  });

  it('thieves who run as the car comes are chased a stretch by the first officer out, who then comes back', () => {
    const site = siteOf('street', 1);
    const w = start(site, usual('theft', { runs: true }));
    w.step(NOBODY, 3);
    for (let i = 0; i < 70; i++) w.step(sitWith([unit('P1', 'near', { eta: 7 - i * DT })]), DT);
    const parked = w.d.frame().cars.find((c) => c.id === 'u:P1')!.pos;
    let far = 0;
    const f = w.step(sitWith([unit('P1', 'here')]), 40, (fr) => {
      for (const p of fr.people) if (p.id.startsWith('o:')) far = Math.max(far, dist(p.pos, site.spot));
    });
    console.log('FAR', far);
    expect(far).toBeGreaterThan(9);
    const back = f.people.filter((p) => p.id.startsWith('o:'));
    expect(back.length).toBe(2);
    for (const o of back) expect(dist(o.pos, site.spot)).toBeLessThan(12);
  });
});
