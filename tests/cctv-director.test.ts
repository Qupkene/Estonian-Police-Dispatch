/**
 * Kaamerad (docs/CCTV.md section 8): the director puts an incident's people and vehicles on the street and moves
 * them as the situation changes. Scripted situations are driven through it in steps of a tenth of a second, on
 * made-up streets of several kinds and on hand-made awkward ones, and every frame is checked: nobody inside a
 * house, nothing teleporting, vehicles on the road, nobody left behind.
 */
import { describe, expect, it } from 'vitest';
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
import type { Frame, Situation, UnitSit } from '@/cctv/stage';
import type { Site, StreetData } from '@/cctv/types';
import { lookOfAnyCar } from '@/cctv/vehicle';

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
    this.lastCar = cars;
    for (let i = 0; i < parked.length; i++) {
      for (let j = i + 1; j < parked.length; j++)
        expect(dist(parked[i].pos, parked[j].pos), `${parked[i].id} on top of ${parked[j].id}`).toBeGreaterThan(2.2);
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
