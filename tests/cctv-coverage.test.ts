/**
 * Which incidents have a camera (src/cctv/coverage.ts, docs/CCTV.md section 5): a place has one or not for good,
 * as often as its kind of place says; the camera's number and name; the incidents with nothing left to see; and
 * the share of a real shift's incidents that can be watched.
 */
import { describe, expect, it } from 'vitest';
import { CAMERA_CHANCE, cameraOf, streetOfAddress, type CameraInfo } from '@/cctv/coverage';
import { hash32 } from '@/cctv/math';
import { REGION_IDS, REGIONS } from '@/data/regions';
import { createShift, step } from '@/sim/engine';
import { MIN, tallinnTime } from '@/sim/time';
import type { Incident, IncidentLocation, LngLat, PlaceKind, RegionId } from '@/sim/types';

type Subject = Parameters<typeof cameraOf>[0];

const KINDS = Object.keys(CAMERA_CHANCE) as PlaceKind[];

function at(coord: LngLat, placeKind: PlaceKind, more: Partial<IncidentLocation> = {}, id = 'inc-1'): Subject {
  return {
    id,
    state: 'queued',
    unitHistory: [],
    location: { address: 'Narva mnt 25', coord, city: 'Tallinn', placeKind, zone: 'mainland', ...more },
  };
}

/** The n-th of a run of coordinates spread over Estonia, never twice in one cell. */
function spread(n: number, salt: number): LngLat {
  const lon = 21.8 + (hash32('lon', salt, n) / 2 ** 32) * 6.4;
  const lat = 57.5 + (hash32('lat', salt, n) / 2 ** 32) * 2.2;
  return [lon, lat];
}

/** A coordinate of the given kind of place that has a camera. */
function watched(kind: PlaceKind, more: Partial<IncidentLocation> = {}): { subject: Subject; camera: CameraInfo } {
  for (let n = 0; n < 5000; n++) {
    const subject = at(spread(n, 77), kind, more);
    const camera = cameraOf(subject);
    if (camera) return { subject, camera };
  }
  throw new Error(`no camera found for ${kind}`);
}

describe('the table of chances', () => {
  it('is the one of docs/CCTV.md section 5, for every kind of place', () => {
    const table: [number, PlaceKind[]][] = [
      [0.95, ['gasstation', 'bank', 'government', 'embassy', 'airport']],
      [0.9, ['mall', 'trainstation', 'busstation', 'port']],
      [0.8, ['hospital', 'hotel', 'prison', 'border']],
      [0.7, ['nightclub', 'bar', 'shop', 'oldtown', 'stadium', 'concert', 'museum']],
      [0.55, ['parking', 'school', 'university', 'office', 'kindergarten']],
      [0.4, ['street', 'industrial', 'construction', 'highway']],
      [0.25, ['residential', 'park', 'church']],
      [0.08, ['house', 'ruralroad', 'beach', 'cemetery']],
      [0, ['forest', 'lake', 'farm', 'summerhouse', 'village']],
    ];
    const listed = table.flatMap(([, kinds]) => kinds);
    expect(listed.slice().sort()).toEqual(KINDS.slice().sort());
    expect(KINDS).toHaveLength(41);
    for (const [chance, kinds] of table) for (const kind of kinds) expect(CAMERA_CHANCE[kind], kind).toBe(chance);
    // Every kind of place a region's curated places use is in the table.
    for (const id of REGION_IDS) for (const p of REGIONS[id].places) expect(CAMERA_CHANCE[p.kind], p.kind).toBeTypeOf('number');
  });
});

describe('a place has a camera or not, for good', () => {
  it('the same place always answers the same', () => {
    for (const kind of ['street', 'residential', 'mall', 'house', 'highway'] as PlaceKind[]) {
      for (let n = 0; n < 300; n++) {
        const coord = spread(n, 5);
        const a = cameraOf(at(coord, kind));
        expect(cameraOf(at(coord, kind))).toEqual(a);
        // Another incident at the same address, another day, in whatever state: the same camera.
        expect(cameraOf({ ...at(coord, kind, {}, `inc-${n + 900}`), state: 'onscene', unitHistory: ['u1'] }, 1792771200000 + n * MIN)).toEqual(a);
        // A step of a metre stays in the cell (the cell is about 37 m; its middle is the rounded coordinate).
        const cell: LngLat = [Math.round(coord[0] * 1500) / 1500, Math.round(coord[1] * 3000) / 3000];
        const near: LngLat = [cell[0] + 0.00001, cell[1] - 0.000005];
        expect(cameraOf(at(near, kind))).toEqual(cameraOf(at(cell, kind)));
      }
    }
  });

  it('the picture belongs to the place, not to what happens there', () => {
    // A petrol station and the street before it are different places, but the cell seeds one and the same street.
    const coord = watched('gasstation').subject.location.coord;
    const seeds = new Set<number>();
    for (const kind of KINDS) {
      const cam = cameraOf(at(coord, kind));
      if (cam) seeds.add(cam.seed);
    }
    expect(seeds.size).toBe(1);
    const seed = [...seeds][0];
    expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
    // The next cell is another street.
    const next = cameraOf(at([coord[0] + 1 / 1500, coord[1]], 'gasstation')) ?? cameraOf(at([coord[0] - 1 / 1500, coord[1]], 'gasstation'));
    expect(next && next.seed !== seed).toBe(true);
  });

  it('over ten thousand places of each kind the share with a camera is the chance of the kind', () => {
    const off: string[] = [];
    KINDS.forEach((kind, k) => {
      let hits = 0;
      const cells = new Set<string>();
      for (let n = 0; n < 10000; n++) {
        const coord = spread(n, 1000 + k);
        cells.add(`${Math.round(coord[0] * 1500)}:${Math.round(coord[1] * 3000)}`);
        if (cameraOf(at(coord, kind))) hits++;
      }
      expect(cells.size, `${kind}: distinct cells`).toBeGreaterThan(9990);
      const share = hits / 10000;
      if (Math.abs(share - CAMERA_CHANCE[kind]) > 0.03) off.push(`${kind}: ${share.toFixed(3)} for ${CAMERA_CHANCE[kind]}`);
      if (CAMERA_CHANCE[kind] === 0) expect(hits, kind).toBe(0);
    });
    expect(off, off.join('; ')).toEqual([]);
  });

  it('neighbouring cells along a street do not all agree', () => {
    // Along Narva maantee, cell after cell: about four in ten have a camera, in no pattern.
    let runs = 0;
    let hits = 0;
    let prev: boolean | null = null;
    for (let i = 0; i < 2000; i++) {
      const has = !!cameraOf(at([24.76 + i / 1500, 59.4375], 'street'));
      if (has) hits++;
      if (prev !== null && has !== prev) runs++;
      prev = has;
    }
    expect(hits).toBeGreaterThan(700);
    expect(hits).toBeLessThan(900);
    // A fair coin of 0.4 changes sides about 2 * 0.4 * 0.6 of the time.
    expect(runs).toBeGreaterThan(850);
    expect(runs).toBeLessThan(1070);
  });

  it('answers a broken coordinate with no camera instead of throwing', () => {
    expect(cameraOf(at([Number.NaN, 59.4], 'bank'))).toBeNull();
    expect(cameraOf(at([24.7, Number.POSITIVE_INFINITY], 'bank'))).toBeNull();
    expect(cameraOf(at([24.7, 59.4], 'nowhere' as PlaceKind))).toBeNull();
  });

  it('is cheap enough to ask for every card on every draw', () => {
    const subjects = Array.from({ length: 2000 }, (_, n) => at(spread(n, 9), KINDS[n % KINDS.length], { address: `Sõpruse pst ${n}-12` }));
    const t0 = performance.now();
    let found = 0;
    for (let round = 0; round < 50; round++) for (const s of subjects) if (cameraOf(s, 1792771200000)) found++;
    const perCall = (performance.now() - t0) / (50 * subjects.length);
    expect(found).toBeGreaterThan(0);
    // A queue of fifty cards sixty times a second is 3000 calls: well under a millisecond of every second's sixteen.
    expect(perCall, `${(perCall * 1000).toFixed(2)} microseconds a call`).toBeLessThan(0.02);
  });
});

describe('the number and the name', () => {
  it('the number is K- and three digits, the same for the same cell', () => {
    const ids = new Set<string>();
    for (let n = 0; n < 6000; n++) {
      const cam = cameraOf(at(spread(n, 31), 'bank'));
      if (!cam) continue;
      expect(cam.id).toMatch(/^K-[1-9]\d\d$/);
      expect(cam.name.startsWith(`${cam.id} · `)).toBe(true);
      ids.add(cam.id);
    }
    // 900 numbers, drawn about 5700 times: all but a handful are in use.
    expect(ids.size).toBeGreaterThan(880);
    const { subject, camera } = watched('mall');
    expect(cameraOf({ ...subject, id: 'another' })?.id).toBe(camera.id);
  });

  it('a street camera is called after the street, without the house number', () => {
    const name = (address: string, kind: PlaceKind = 'street') => watched(kind, { address }).camera.name.replace(/^K-\d{3} · /, '');
    expect(name('Narva mnt 25')).toBe('Narva mnt');
    expect(name('Tartu mnt 87f-12', 'residential')).toBe('Tartu mnt');
    expect(name('Viru väljak 4/6', 'office')).toBe('Viru väljak');
    expect(watched('street', { address: 'Narva mnt 25' }).camera.name).toMatch(/^K-\d{3} · Narva mnt$/);
  });

  it('a place with a name of its own gives it to its camera', () => {
    const { camera } = watched('mall', { address: 'Viru väljak 4/6', placeName: 'Viru Keskus' });
    expect(camera.name).toBe(`${camera.id} · Viru Keskus`);
    const station = watched('trainstation', { address: 'Toompuiestee 35', placeName: 'Balti jaam' }).camera;
    expect(station.name).toBe(`${station.id} · Balti jaam`);
  });

  it('a highway camera is a road camera, a rural road camera carries the road, a village shop the village', () => {
    const hw = watched('highway', { address: 'Tallinna-Tartu maantee (E263), 22. km', city: 'Kose' }).camera;
    expect(hw.name).toBe(`${hw.id} · Teekaamera`);
    const ring = watched('highway', { address: 'Tallinna ringtee, 51. km' }).camera;
    expect(ring.name).toBe(`${ring.id} · Teekaamera`);
    const rural = watched('ruralroad', { address: 'Määra-Padise tee, 2. km, Harju maakond' }).camera;
    expect(rural.name).toBe(`${rural.id} · Määra-Padise tee`);
    const shop = watched('shop', { address: 'Tuulna küla, Harju maakond', city: 'Tuulna' }).camera;
    expect(shop.name).toBe(`${shop.id} · Tuulna küla`);
    // A village itself has no cameras at all.
    expect(CAMERA_CHANCE.village).toBe(0);
    expect(cameraOf(at([24.4, 59.2], 'village', { address: 'Tuulna küla, Harju maakond' }))).toBeNull();
  });

  it('an address with nothing in it falls back on the town', () => {
    const { camera } = watched('street', { address: '', city: 'Keila' });
    expect(camera.name).toBe(`${camera.id} · Keila`);
  });

  it('drops the house number from thirty addresses the game writes', () => {
    const cases: [string, string][] = [
      // Streets with a house, a flat, a letter, a second house (src/gen/address.ts streetLocation, the regions' places).
      ['Narva mnt 25', 'Narva mnt'],
      ['Tartu mnt 87f-12', 'Tartu mnt'],
      ['Viru väljak 4/6', 'Viru väljak'],
      ['Ehitajate tee 70-55', 'Ehitajate tee'],
      ['Telliskivi tn 60a', 'Telliskivi tn'],
      ['Asula tn 4c', 'Asula tn'],
      ['Rahumäe tee 6/1', 'Rahumäe tee'],
      ['Pärnu mnt 139c/2', 'Pärnu mnt'],
      ['Sõpruse pst 174', 'Sõpruse pst'],
      ['Kolde pst 65', 'Kolde pst'],
      ['Raekoja plats 11', 'Raekoja plats'],
      ['Tõnismägi 15-108', 'Tõnismägi'],
      ['Toompuiestee 35', 'Toompuiestee'],
      ['Lootsi tn 13', 'Lootsi tn'],
      ['Kooli tn 16', 'Kooli tn'],
      // Initials and hyphens belong to the name.
      ['P. Pinna tn 4', 'P. Pinna tn'],
      ['E. Vilde tee 49-26', 'E. Vilde tee'],
      ['J. Sütiste tee 45', 'J. Sütiste tee'],
      ['Vana-Viru tn 10', 'Vana-Viru tn'],
      ['Suur-Sõjamäe tn 4', 'Suur-Sõjamäe tn'],
      // A number that opens the name is not a house.
      ['1. liin 12', '1. liin'],
      // No number at all.
      ['A. Weizenbergi tn', 'A. Weizenbergi tn'],
      ['Riia tn / Rīgas iela', 'Riia tn / Rīgas iela'],
      ['Padise küla', 'Padise küla'],
      ['Rummu alevik', 'Rummu alevik'],
      // Kilometres, counties, route numbers and what follows a comma.
      ['Määra-Padise tee, 2. km, Harju maakond', 'Määra-Padise tee'],
      ['Tallinna-Tartu maantee (E263), 22. km', 'Tallinna-Tartu maantee'],
      ['Tallinna-Pärnu-Ikla maantee (E67), 2. km', 'Tallinna-Pärnu-Ikla maantee'],
      ['Tallinna ringtee, 51. km', 'Tallinna ringtee'],
      ['Tallinna ringtee (11), Jüri', 'Tallinna ringtee'],
      ['Tartu mnt, Jüri', 'Tartu mnt'],
      ['Tuulna küla, Harju maakond', 'Tuulna küla'],
      ['Aegviidu alev, Harju maakond', 'Aegviidu alev'],
      ['Mäe talu, Kuusiku küla, Rapla maakond', 'Mäe talu'],
      ['Kalda AÜ, krunt 112, Kurtna küla', 'Kalda AÜ'],
      ['E263, Põltsamaa ristmik', 'E263'],
    ];
    expect(cases.length).toBeGreaterThanOrEqual(30);
    for (const [address, street] of cases) expect(streetOfAddress(address), address).toBe(street);
  });

  it('leaves no house number on any street or place of the four regions', () => {
    let seen = 0;
    for (const id of REGION_IDS) {
      const region = REGIONS[id];
      const addresses = [
        ...region.places.map((p) => p.address),
        ...region.streets.flatMap((s) => [`${s.name} 1`, `${s.name} ${s.houses[1]}`, `${s.name} ${s.houses[1]}-120`, `${s.name} 7a`]),
      ];
      for (const address of addresses) {
        const street = streetOfAddress(address);
        seen++;
        expect(street.length, address).toBeGreaterThan(1);
        expect(street, address).not.toMatch(/[\s,/-]$/);
        expect(street, address).not.toMatch(/\s\d+[a-z]?([/-]\d+[a-z]?)?$/);
        expect(address.startsWith(street), address).toBe(true);
      }
      // A street's own name comes back whole.
      for (const s of region.streets) expect(streetOfAddress(`${s.name} 12`), s.name).toBe(s.name);
    }
    expect(seen).toBeGreaterThan(500);
  });
});

describe('nothing left to see', () => {
  const T0 = tallinnTime(2026, 10, 23, 19, 0);
  const { subject } = watched('street');
  const closed = (more: Partial<Subject>): Subject => ({ ...subject, state: 'closed', closedAt: T0, ...more });

  it('an incident closed from the desk with nobody sent loses its camera five game minutes later', () => {
    for (const closedBy of ['referral', 'phone', 'duplicate', 'prank', 'expired', 'director', 'colleague'] as const) {
      const inc = closed({ closedBy });
      expect(cameraOf(inc, T0), closedBy).not.toBeNull();
      expect(cameraOf(inc, T0 + 5 * MIN), closedBy).not.toBeNull();
      expect(cameraOf(inc, T0 + 5 * MIN + 1000), closedBy).toBeNull();
      expect(cameraOf(inc, T0 + 3 * 60 * MIN), closedBy).toBeNull();
    }
  });

  it('one a unit worked on keeps its camera: the crews are seen leaving, then the street', () => {
    const inc = closed({ closedBy: 'units', unitHistory: ['u-12'] });
    expect(cameraOf(inc, T0 + 60 * MIN)).not.toBeNull();
    // Referred after a patrol had been there.
    expect(cameraOf(closed({ closedBy: 'referral', unitHistory: ['u-12'] }), T0 + 60 * MIN)).not.toBeNull();
  });

  it('an open incident, and one asked about without a clock, keep theirs', () => {
    expect(cameraOf({ ...subject, state: 'queued' }, T0 + 600 * MIN)).not.toBeNull();
    expect(cameraOf({ ...subject, state: 'onscene', unitHistory: ['u-1'] }, T0 + 600 * MIN)).not.toBeNull();
    expect(cameraOf(closed({ closedBy: 'prank' }))).not.toBeNull();
    expect(cameraOf(closed({ closedBy: 'prank', closedAt: undefined }), T0 + 600 * MIN)).not.toBeNull();
  });
});

describe('a real shift', () => {
  /** Let a shift run with nobody at the desk until it has made `count` incidents. */
  function incidentsOf(regionId: RegionId, seed: number, count: number): Incident[] {
    const s = createShift({ seed, regionId, mode: 'free', difficulty: 'realistic', start: tallinnTime(2026, 10, 23, 19, 0), hours: 96, playerName: 'Kaamera' });
    for (let n = 0; n < 20000 && s.incidentOrder.length < count && !s.ended; n++) step(s, MIN / 2);
    return s.incidentOrder.map((id) => s.incidents[id]);
  }

  it('between 15 and 60 percent of two hundred incidents can be watched', () => {
    const incidents = incidentsOf('pohja', 4107, 200);
    expect(incidents.length).toBeGreaterThanOrEqual(200);
    const cameras = incidents.map((inc) => cameraOf(inc));
    const share = (100 * cameras.filter(Boolean).length) / incidents.length;
    const byKind = new Map<PlaceKind, [number, number]>();
    incidents.forEach((inc, i) => {
      const row = byKind.get(inc.location.placeKind) ?? [0, 0];
      row[0]++;
      if (cameras[i]) row[1]++;
      byKind.set(inc.location.placeKind, row);
    });
    const table = [...byKind].map(([kind, [all, cam]]) => `${kind} ${cam}/${all}`).join(', ');
    const message = `${share.toFixed(1)} % of ${incidents.length} incidents have a camera (${table})`;
    expect(share, message).toBeGreaterThanOrEqual(15);
    expect(share, message).toBeLessThanOrEqual(60);
  });

  it('every camera of the shift has a number, a name with a place in it and a seed, the same when asked again', () => {
    const incidents = incidentsOf('louna', 912, 120);
    expect(incidents.length).toBeGreaterThanOrEqual(120);
    let cameras = 0;
    for (const inc of incidents) {
      const cam = cameraOf(inc, inc.createdAt);
      if (CAMERA_CHANCE[inc.location.placeKind] === 0) expect(cam, inc.location.address).toBeNull();
      if (!cam) continue;
      cameras++;
      expect(cam.id).toMatch(/^K-\d{3}$/);
      const where = cam.name.slice(cam.id.length + 3);
      expect(cam.name.slice(0, cam.id.length + 3)).toBe(`${cam.id} · `);
      expect(where.length, inc.location.address).toBeGreaterThan(1);
      if (!inc.location.placeName) expect(where, inc.location.address).not.toMatch(/\s\d+[a-z]?([/-]\d+[a-z]?)?$/);
      if (!inc.location.placeName) expect(where, inc.location.address).not.toMatch(/,|km$/);
      expect(cameraOf(inc, inc.createdAt)).toEqual(cam);
    }
    expect(cameras).toBeGreaterThan(10);
  });
});
