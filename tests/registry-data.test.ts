import { describe, expect, it } from 'vitest';
import { ACT_NAMES, FINE_UNIT_EUR, LAWS, LAW_ALIASES, LAW_TAGS, lawById, lawCitation, pickLaw, pickPunishment } from '@/data/laws';
import { CAR_MODELS, COLORS, FLEET_OWNERS, INSURERS, INSURER_WEIGHTS, MAKE_WMI } from '@/data/vehicles';
import {
  PLATE_PATTERNS,
  VIN_CHARS,
  describeVehicle,
  formatPlate,
  generateVehicle,
  isValidVin,
  makePlate,
  makeVin,
  normalizePlate,
  vinCheckDigit,
  vinYearCode,
  wmiFor,
} from '@/gen/vehicle';
import { Rng } from '@/sim/rng';
import { DAY, isoDate, tallinnTime } from '@/sim/time';
import type { Person, Vehicle, VehicleKind } from '@/sim/types';

const NOW = tallinnTime(2026, 10, 17, 14, 30);
const TODAY = isoDate(NOW);
const KINDS: VehicleKind[] = ['car', 'van', 'truck', 'bus', 'moto', 'moped', 'quad'];
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const fakeOwner = { id: 'p_owner_1' } as unknown as Person;

function many(n: number, seed: number, f: (r: Rng, i: number) => Vehicle): Vehicle[] {
  const out: Vehicle[] = [];
  for (let i = 0; i < n; i++) out.push(f(new Rng(seed + i * 7919), i));
  return out;
}

function checkConsistency(v: Vehicle) {
  // plate
  expect(v.plate).toMatch(PLATE_PATTERNS[v.kind]);
  // VIN
  expect(v.vin).toHaveLength(17);
  expect(v.vin).toMatch(VIN_RE);
  expect(isValidVin(v.vin)).toBe(true);
  expect(v.vin[9]).toBe(vinYearCode(v.year));
  const wmis = wmiFor(v.make, v.model);
  expect(wmis.length).toBeGreaterThan(0);
  expect(wmis).toContain(v.vin.slice(0, 3));
  // model & year
  const model = CAR_MODELS.find((m) => m.make === v.make && m.model === v.model);
  expect(model).toBeDefined();
  expect(model!.kind).toBe(v.kind);
  expect(v.year).toBeGreaterThanOrEqual(model!.years[0]);
  expect(v.year).toBeLessThanOrEqual(Math.min(model!.years[1], 2026));
  // colour
  expect(v.color.et.length).toBeGreaterThan(0);
  expect(v.color.en.length).toBeGreaterThan(0);
  // insurance & inspection vs validity
  expect(v.insurance.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(v.inspection.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(INSURERS).toContain(v.insurance.insurer);
  if (v.insurance.valid) expect(v.insurance.until >= TODAY).toBe(true);
  else expect(v.insurance.until < TODAY).toBe(true);
  if (v.inspection.valid) expect(v.inspection.until >= TODAY).toBe(true);
  else expect(v.inspection.until < TODAY).toBe(true);
  // owner
  expect(Boolean(v.ownerId) || Boolean(v.ownerCompany)).toBe(true);
  // stolen
  if (v.flags.stolen) {
    expect(v.flags.stolen.since <= TODAY).toBe(true);
    expect(v.flags.stolen.since >= isoDate(NOW - 11 * DAY)).toBe(true);
    expect(v.flags.stolen.text.et.length).toBeGreaterThan(10);
    expect(v.flags.stolen.text.en.length).toBeGreaterThan(10);
  }
  for (const n of v.notes) {
    expect(n.et.length).toBeGreaterThan(0);
    expect(n.en.length).toBeGreaterThan(0);
  }
}

describe('laws', () => {
  it('has at least 70 entries with unique ids', () => {
    expect(LAWS.length).toBeGreaterThanOrEqual(70);
    const ids = LAWS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it('every law is complete and bilingual', () => {
    for (const l of LAWS) {
      expect(l.title.et.trim(), l.id).not.toBe('');
      expect(l.title.en.trim(), l.id).not.toBe('');
      expect(l.para, l.id).toMatch(/^§ \d/);
      expect(['crime', 'misdemeanour']).toContain(l.kind);
      expect(ACT_NAMES[l.act], l.id).toBeDefined();
      expect(l.punishments.length, l.id).toBeGreaterThanOrEqual(1);
      expect(l.punishments.length, l.id).toBeLessThanOrEqual(4);
      for (const p of l.punishments) {
        expect(p.et.trim(), l.id).not.toBe('');
        expect(p.en.trim(), l.id).not.toBe('');
        expect(p.et, l.id).not.toMatch(/undefined|NaN/);
        expect(p.en, l.id).not.toMatch(/undefined|NaN/);
      }
      expect(l.tags.length, l.id).toBeGreaterThanOrEqual(1);
      for (const t of l.tags) expect(LAW_TAGS as readonly string[], `${l.id}:${t}`).toContain(t);
    }
  });

  it('misdemeanours only carry fines/detention, crimes never carry väärteo-fines', () => {
    for (const l of LAWS) {
      for (const p of l.punishments) {
        if (l.kind === 'misdemeanour') expect(p.et, l.id).toMatch(/^(Rahatrahv|Arest|Hoiatustrahv)/);
        else expect(p.et, l.id).not.toMatch(/^(Rahatrahv|Arest|Hoiatustrahv)/);
      }
    }
  });

  it('includes the key paragraphs used by content', () => {
    for (const id of [
      'kars_113', 'kars_114', 'kars_118', 'kars_120', 'kars_121', 'kars_121_2', 'kars_157_3', 'kars_141',
      'kars_136', 'kars_133', 'kars_331_2', 'kars_199', 'kars_200', 'kars_201', 'kars_209', 'kars_213',
      'kars_203', 'kars_218', 'kars_263', 'kars_262', 'kars_424', 'kars_424_rep', 'ls_224', 'ls_201',
      'ls_262_1', 'ls_262_4', 'ls_red_light', 'ls_phone', 'ls_seatbelt', 'lkindls_no_insurance',
      'kars_184', 'npals_15', 'kars_418', 'kars_274', 'kars_344', 'kars_324', 'kars_391', 'kars_poaching',
      'kars_pollution', 'kars_237', 'kars_bomb_hoax', 'kars_422', 'kors_55', 'kors_56',
    ]) {
      expect(lawById(id), id).toBeDefined();
    }
    expect(lawCitation(lawById('kars_199')!)).toBe('KarS § 199 lg 1');
  });

  it('aliases resolve to existing laws', () => {
    for (const [alias, target] of Object.entries(LAW_ALIASES)) {
      expect(lawById(target), alias).toBeDefined();
      expect(lawById(alias)?.id).toBe(target);
    }
    expect(lawById('nonexistent_law')).toBeUndefined();
  });

  it('fine texts use the fine unit value', () => {
    const p = lawById('kars_218')!.punishments[0];
    expect(p.et).toBe(`Rahatrahv 30 trahviühikut (${30 * FINE_UNIT_EUR} €)`);
  });

  it('pickLaw respects tags and never picks weight-0 laws by default', () => {
    const r = new Rng(42);
    for (let i = 0; i < 300; i++) {
      const l = pickLaw(r, { tags: ['traffic'] });
      expect(l.tags).toContain('traffic');
      expect(pickPunishment(r, l).et.length).toBeGreaterThan(0);
      const any = pickLaw(r);
      expect(any.weight ?? 1).toBeGreaterThan(0);
      expect(any.tags).not.toContain('sexual');
    }
    const m = pickLaw(new Rng(1), { kind: 'misdemeanour', tags: ['order'] });
    expect(m.kind).toBe('misdemeanour');
  });
});

describe('vehicle data', () => {
  it('has a realistic model catalogue', () => {
    expect(CAR_MODELS.length).toBeGreaterThanOrEqual(140);
    for (const k of KINDS) expect(CAR_MODELS.some((m) => m.kind === k), k).toBe(true);
    const keys = new Set<string>();
    for (const m of CAR_MODELS) {
      expect(m.weight).toBeGreaterThan(0);
      expect(m.years[0]).toBeLessThanOrEqual(m.years[1]);
      expect(m.years[1]).toBeLessThanOrEqual(2026);
      expect(wmiFor(m.make, m.model).length, `${m.make} ${m.model}`).toBeGreaterThan(0);
      for (const w of wmiFor(m.make, m.model)) expect(w).toMatch(/^[A-HJ-NPR-Z0-9]{3}$/);
      const key = `${m.make}|${m.model}`;
      expect(keys.has(key), key).toBe(false);
      keys.add(key);
    }
    const toyota = CAR_MODELS.filter((m) => m.make === 'Toyota' && m.kind === 'car');
    const lc = toyota.find((m) => m.model === 'Land Cruiser')!;
    const avensis = toyota.find((m) => m.model === 'Avensis')!;
    expect(lc.theft!).toBeGreaterThan(avensis.theft ?? 1);
  });

  it('colours, insurers and WMIs are sane', () => {
    expect(COLORS.length).toBeGreaterThanOrEqual(10);
    for (const c of COLORS) {
      expect(c.weight).toBeGreaterThan(0);
      expect(c.et).toBe(c.et.toLowerCase());
    }
    expect(INSURERS.length).toBeGreaterThanOrEqual(6);
    expect(INSURER_WEIGHTS.length).toBe(INSURERS.length);
    for (const list of Object.values(MAKE_WMI)) for (const w of list) expect(w).toMatch(/^[A-HJ-NPR-Z0-9]{3}$/);
    for (const list of Object.values(FLEET_OWNERS)) for (const n of list) expect(n).toMatch(/ (AS|OÜ)$/);
  });
});

describe('plates', () => {
  it('generates plates in the right format per kind', () => {
    const r = new Rng(7);
    for (let i = 0; i < 500; i++) {
      const p = makePlate(r);
      expect(p).toMatch(/^\d{3} [A-Z]{3}$/);
      expect(p).not.toMatch(/[IOQWÕÄÖÜŠŽ]/);
      expect(p.startsWith('000')).toBe(false);
      for (const k of KINDS) expect(makePlate(r, k)).toMatch(PLATE_PATTERNS[k]);
    }
    expect(PLATE_PATTERNS.car.test('123 ABC')).toBe(true);
    expect(PLATE_PATTERNS.car.test('123ABC')).toBe(false);
  });

  it('normalises and formats user input', () => {
    const forms = ['123abc', '123 ABC', ' 123  abc ', '123-abc', '\t123 Abc\n'];
    const n = forms.map(normalizePlate);
    expect(new Set(n).size).toBe(1);
    expect(n[0]).toBe('123ABC');
    for (const f of forms) expect(formatPlate(f)).toBe('123 ABC');
    expect(formatPlate('12abc')).toBe('12 ABC');
    expect(formatPlate('cd 1234')).toBe('CD 1234');
  });
});

describe('VIN', () => {
  it('is 17 chars from the valid charset with WMI, year code and check digit', () => {
    const r = new Rng(99);
    expect(VIN_CHARS).not.toMatch(/[IOQ]/);
    const cases: [string, number, string[]][] = [
      ['Toyota', 2012, MAKE_WMI.Toyota],
      ['Škoda', 2019, ['TMB']],
      ['Volkswagen', 2005, ['WVW']],
      ['BMW', 2016, ['WBA']],
      ['Volvo', 2009, ['YV1']],
      ['Lada', 1995, ['XTA']],
      ['Tesla', 2023, MAKE_WMI.Tesla],
    ];
    for (const [make, year, wmis] of cases) {
      for (let i = 0; i < 50; i++) {
        const vin = makeVin(r, make, year);
        expect(vin).toHaveLength(17);
        expect(vin).toMatch(VIN_RE);
        expect(wmis).toContain(vin.slice(0, 3));
        expect(vin[9]).toBe(vinYearCode(year));
        expect(vin[8]).toBe(vinCheckDigit(vin));
      }
    }
  });

  it('uses the standard model-year code table', () => {
    expect(vinYearCode(1980)).toBe('A');
    expect(vinYearCode(2000)).toBe('Y');
    expect(vinYearCode(2001)).toBe('1');
    expect(vinYearCode(2009)).toBe('9');
    expect(vinYearCode(2010)).toBe('A');
    expect(vinYearCode(2018)).toBe('J');
    expect(vinYearCode(2026)).toBe('T');
    // known valid VIN (check digit example from the NA standard)
    expect(vinCheckDigit('1M8GDM9AXKP042788')).toBe('X');
  });

  it('respects a model-specific WMI override and WMI production years', () => {
    const vin = makeVin(new Rng(3), 'Toyota', 2015, ['AHT']);
    expect(vin.startsWith('AHT')).toBe(true);
    const r = new Rng(4);
    for (let i = 0; i < 40; i++) {
      expect(makeVin(r, 'Mercedes-Benz', 2008).slice(0, 3)).toBe('WDD');
      expect(makeVin(r, 'Mercedes-Benz', 2024).slice(0, 3)).toBe('W1K');
    }
    expect(wmiFor('Volvo', '8900')).toEqual(['YV3']);
    expect(wmiFor('Volvo', 'FH 500')).toEqual(['YV2']);
    expect(wmiFor('Honda', 'CBR600RR')).toEqual(['JH2']);
  });
});

describe('generateVehicle', () => {
  it('produces consistent records', () => {
    const vs = many(1500, 1000, (r, i) => generateVehicle(r, { now: NOW, owner: i % 2 ? fakeOwner : undefined }));
    for (const v of vs) checkConsistency(v);
    for (const v of vs.filter((_, i) => i % 2 === 1)) expect(v.ownerId).toBe('p_owner_1');
    for (const v of vs.filter((_, i) => i % 2 === 0)) {
      expect(v.ownerId).toBeUndefined();
      expect(v.ownerCompany).toBeTruthy();
    }
  });

  it('is deterministic for a seed', () => {
    const a = generateVehicle(new Rng(12345), { now: NOW, owner: fakeOwner, spec: { role: 'suspect', stolen: 0.5 } });
    const b = generateVehicle(new Rng(12345), { now: NOW, owner: fakeOwner, spec: { role: 'suspect', stolen: 0.5 } });
    expect(a).toEqual(b);
    const c = generateVehicle(new Rng(54321), { now: NOW, owner: fakeOwner, spec: { role: 'suspect', stolen: 0.5 } });
    expect(c).not.toEqual(a);
  });

  it('honours every kind', () => {
    for (const kind of KINDS) {
      const vs = many(80, 50, (r) => generateVehicle(r, { now: NOW, kind }));
      for (const v of vs) {
        expect(v.kind).toBe(kind);
        checkConsistency(v);
      }
      const viaSpec = generateVehicle(new Rng(5), { now: NOW, spec: { role: 'involved', kind } });
      expect(viaSpec.kind).toBe(kind);
    }
  });

  it('applies spec flags', () => {
    const stolen = many(200, 77, (r) => generateVehicle(r, { now: NOW, owner: fakeOwner, spec: { role: 'suspect', stolen: 1 } }));
    for (const v of stolen) {
      checkConsistency(v);
      expect(v.flags.stolen).toBeDefined();
      expect(v.flags.stolen!.text.et).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    }
    const noIns = many(200, 88, (r) => generateVehicle(r, { now: NOW, spec: { role: 'involved', noInsurance: 1 } }));
    for (const v of noIns) {
      checkConsistency(v);
      expect(v.insurance.valid).toBe(false);
      expect(v.insurance.until < TODAY).toBe(true);
    }
    const noInsp = many(200, 99, (r) => generateVehicle(r, { now: NOW, kind: 'car', spec: { role: 'involved', noInspection: 1 } }));
    for (const v of noInsp) {
      checkConsistency(v);
      expect(v.inspection.valid).toBe(false);
      expect(2026 - v.year).toBeGreaterThanOrEqual(5);
    }
    const susp = many(100, 111, (r) => generateVehicle(r, { now: NOW, spec: { role: 'involved', suspended: 1 } }));
    for (const v of susp) {
      checkConsistency(v);
      expect(v.flags.suspended).toBe(true);
      expect(v.notes.some((n) => n.et.startsWith('Registreering peatatud'))).toBe(true);
    }
  });

  it('explicit zero chances give a clean record', () => {
    const vs = many(300, 222, (r) =>
      generateVehicle(r, {
        now: NOW,
        owner: fakeOwner,
        spec: { role: 'victim', stolen: 0, noInsurance: 0, noInspection: 0, suspended: 0 },
      }),
    );
    for (const v of vs) {
      expect(v.flags.stolen).toBeUndefined();
      expect(v.flags.suspended).toBeUndefined();
      expect(v.insurance.valid).toBe(true);
      expect(v.inspection.valid).toBe(true);
    }
  });

  it('stolen vehicles skew to theft-attractive models', () => {
    const base = many(1500, 3000, (r) => generateVehicle(r, { now: NOW, kind: 'car' }));
    const stolen = many(1500, 3000, (r) => generateVehicle(r, { now: NOW, kind: 'car', spec: { role: 'suspect', stolen: 1 } }));
    const hot = (v: Vehicle) => (CAR_MODELS.find((m) => m.make === v.make && m.model === v.model)!.theft ?? 1) >= 2;
    expect(stolen.filter(hot).length).toBeGreaterThan(base.filter(hot).length * 2);
  });

  it('mirrors the Estonian fleet: mostly cars, average age ≈ 14 years', () => {
    const vs = many(3000, 5000, (r) => generateVehicle(r, { now: NOW }));
    const cars = vs.filter((v) => v.kind === 'car');
    expect(cars.length / vs.length).toBeGreaterThan(0.7);
    const meanAge = cars.reduce((s, v) => s + (2026 - v.year), 0) / cars.length;
    expect(meanAge).toBeGreaterThan(10);
    expect(meanAge).toBeLessThan(17);
    const valid = vs.filter((v) => v.insurance.valid).length / vs.length;
    expect(valid).toBeGreaterThan(0.92);
  });

  it('follows the inspection schedule (≤ 2 years ahead; yearly for old cars and taxis)', () => {
    const vs = many(1500, 7000, (r) => generateVehicle(r, { now: NOW, kind: 'car', spec: { role: 'involved', noInspection: 0 } }));
    const inDays = (iso: string) => (Date.parse(iso) - Date.parse(TODAY)) / DAY;
    for (const v of vs) {
      const ahead = inDays(v.inspection.until);
      expect(ahead).toBeGreaterThanOrEqual(0);
      const age = 2026 - v.year;
      const taxiOrRental = v.notes.some((n) => n.et === 'Kasutatakse taksoveoks.' || n.et.startsWith('Rendisõiduk'));
      if (age >= 12 || taxiOrRental) expect(ahead, `${v.year} ${v.inspection.until}`).toBeLessThanOrEqual(366);
      else if (age >= 4) expect(ahead).toBeLessThanOrEqual(2 * 366);
      else expect(ahead).toBeLessThanOrEqual(4 * 366 + 1);
    }
  });

  it('avoids taken plates', () => {
    const taken = new Set<string>();
    // Same three seeds over and over: every repeat must step past the plates already issued.
    for (let i = 0; i < 90; i++) {
      const v = generateVehicle(new Rng(9000 + (i % 3)), { now: NOW, isTaken: (p) => taken.has(p) });
      expect(taken.has(v.plate)).toBe(false);
      taken.add(v.plate);
    }
  });

  it('describes vehicles for text placeholders', () => {
    const d = describeVehicle({ color: { et: 'hall', en: 'grey' }, make: 'Toyota', model: 'Avensis' });
    expect(d).toEqual({ et: 'hall Toyota Avensis', en: 'grey Toyota Avensis' });
  });
});
