// Pure helpers for the shell screens (no DOM / React), unit-tested in tests/shell.test.ts.
import { version } from '../../../../package.json';
import countiesGeo from '@/data/geo/counties.json';
import { REGIONS, REGION_IDS } from '@/data/regions';
import { makeIdcode } from '@/gen/isikukood';
import { Rng } from '@/sim/rng';
import { tallinnTime, wall } from '@/sim/time';
import { rosterSpecsFor } from '@/sim/units';
import type { CareerProfile, Difficulty, Gender, LngLat, Priority, RegionDef, RegionId, ShiftReport, Text } from '@/sim/types';

/** The game's version. package.json is its only source (CLAUDE.md, "Versioon"). */
export const VERSION: string = version;

// ── Names, codes, phone numbers (login simulation) ──────────────────────────

const FIRST_M = [
  'Andres',
  'Mart',
  'Tõnu',
  'Rasmus',
  'Kristjan',
  'Siim',
  'Marko',
  'Priit',
  'Jaanus',
  'Indrek',
  'Karl',
  'Taavi',
  'Ott',
  'Märt',
  'Hendrik',
  'Kaspar',
  'Rein',
  'Urmas',
  'Tarmo',
  'Erik',
];
const FIRST_F = [
  'Kadri',
  'Liis',
  'Maarja',
  'Kristiina',
  'Triin',
  'Helen',
  'Kätlin',
  'Merike',
  'Anu',
  'Piret',
  'Eveliis',
  'Grete',
  'Karin',
  'Signe',
  'Tiina',
  'Laura',
  'Mari',
  'Ülle',
  'Evelin',
  'Kärt',
];
const LAST = [
  'Tamm',
  'Saar',
  'Sepp',
  'Mägi',
  'Kask',
  'Kukk',
  'Rebane',
  'Ilves',
  'Pärn',
  'Koppel',
  'Lepik',
  'Kuusk',
  'Oja',
  'Põder',
  'Raudsepp',
  'Vaher',
  'Lõhmus',
  'Kalda',
  'Tooming',
  'Kivi',
  'Mets',
  'Laur',
  'Kõiv',
  'Sild',
  'Järv',
];

export interface GeneratedIdentity {
  firstName: string;
  lastName: string;
  gender: Gender;
  idcode: string;
  phone: string;
  birthDate: string;
}

/** Deterministic fake Estonian dispatcher identity for the e-ID login simulation. */
export function generateIdentity(seed: number): GeneratedIdentity {
  const r = new Rng(seed);
  const gender: Gender = r.chance(0.5) ? 'M' : 'F';
  const firstName = r.pick(gender === 'M' ? FIRST_M : FIRST_F);
  const lastName = r.pick(LAST);
  const y = r.int(1972, 2001);
  const m = r.int(1, 12);
  const d = r.int(1, 28);
  const birthDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const idcode = makeIdcode(r, gender, birthDate);
  const phone = `+372 5${r.int(100, 999)} ${r.int(1000, 9999)}`;
  return { firstName, lastName, gender, idcode, phone, birthDate };
}

/** 4-digit verification code (Mobiil-ID / Smart-ID "kontrollkood"). */
export function verificationCode(seed: number): string {
  return String(new Rng(seed ^ 0x51ed).int(0, 9999)).padStart(4, '0');
}

/** The 2024 login accepted exactly one combination: both fields empty. */
export function isLegacyLogin(username: string, password: string): boolean {
  return username.trim() === '' && password === '';
}

export function isValidPin1(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/** Loose isikukood shape check for the form (11 digits, valid first digit). */
export function looksLikeIdcode(s: string): boolean {
  return /^[1-8]\d{10}$/.test(s.replace(/\s/g, ''));
}

/** Mobile numbers like "+372 5123 4567", with or without spaces/+372. */
export function looksLikeEstonianMobile(s: string): boolean {
  const digits = s.replace(/[\s-]/g, '').replace(/^\+?372/, '');
  return /^5\d{6,7}$/.test(digits);
}

/** Seconds → "1:05". */
export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Money & numbers ──────────────────────────────────────────────────────────

/** "10 000 €" (et, narrow no-break spaces) / "€10,000" (en). */
export function formatMoney(n: number, lang: 'et' | 'en', signed = false): string {
  const v = Math.round(n);
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : signed && v > 0 ? '+' : '';
  if (lang === 'en') return `${sign}€${abs.toLocaleString('en-GB')}`;
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped} €`;
}

/** Decimal with comma for Estonian prose. */
export function formatDecimal(n: number, lang: 'et' | 'en', digits = 1): string {
  const s = n.toFixed(digits);
  return lang === 'et' ? s.replace('.', ',') : s;
}

export function mean(xs: number[]): number | null {
  if (!xs || xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ── Regions ──────────────────────────────────────────────────────────────────

interface RegionFallback {
  name: Text;
  short: string;
  hqCity: string;
  counties: string[];
  /** Where the label sits on the overview map. */
  label: LngLat;
  hq: LngLat;
  description: Text;
  commander: { name: string; title: Text };
}

/** Used while the regions-* agents' data is still a placeholder (or lacks a field). */
export const REGION_FALLBACK: Record<RegionId, RegionFallback> = {
  pohja: {
    name: { et: 'Põhja prefektuur', en: 'North Prefecture' },
    short: 'PÕHJA',
    hqCity: 'Tallinn',
    counties: ['Harju maakond'],
    label: [24.95, 59.24],
    hq: [24.745, 59.437],
    description: {
      et: 'Tallinn ja Harjumaa: pealinna öelu, sadamad, lennujaam, Lasnamäe paneelmajad ja tihe liiklus. Kõige rohkem väljakutseid.',
      en: 'Tallinn and Harju County: capital nightlife, ports, the airport, Lasnamäe tower blocks and heavy traffic. The busiest prefecture.',
    },
    commander: { name: 'Raivo Kuusik', title: { et: 'Prefekt', en: 'Prefect' } },
  },
  ida: {
    name: { et: 'Ida prefektuur', en: 'East Prefecture' },
    short: 'IDA',
    hqCity: 'Jõhvi',
    counties: ['Ida-Viru maakond', 'Lääne-Viru maakond'],
    label: [26.95, 59.18],
    hq: [27.412, 59.359],
    description: {
      et: 'Ida- ja Lääne-Virumaa: Narva piiripunkt, tööstuslinnad, venekeelsed helistajad ja Peipsi põhjarannik.',
      en: 'Ida-Viru and Lääne-Viru: the Narva border crossing, industrial towns, Russian-speaking callers and the northern shore of Lake Peipus.',
    },
    commander: { name: 'Viktor Lepik', title: { et: 'Prefekt', en: 'Prefect' } },
  },
  louna: {
    name: { et: 'Lõuna prefektuur', en: 'South Prefecture' },
    short: 'LÕUNA',
    hqCity: 'Tartu',
    counties: [
      'Tartu maakond',
      'Jõgeva maakond',
      'Põlva maakond',
      'Valga maakond',
      'Viljandi maakond',
      'Võru maakond',
    ],
    label: [26.25, 58.1],
    hq: [26.722, 58.378],
    description: {
      et: 'Tartu ülikoolilinn, Valga-Valka piirilinn ja Lõuna-Eesti metsased külad, kus abi on sageli kaugel.',
      en: 'University town Tartu, the twin border town Valga-Valka and the forested villages of South Estonia where help is often far away.',
    },
    commander: { name: 'Heiki Raudsepp', title: { et: 'Prefekt', en: 'Prefect' } },
  },
  laane: {
    name: { et: 'Lääne prefektuur', en: 'West Prefecture' },
    short: 'LÄÄNE',
    hqCity: 'Pärnu',
    counties: [
      'Pärnu maakond',
      'Lääne maakond',
      'Saare maakond',
      'Hiiu maakond',
      'Rapla maakond',
      'Järva maakond',
    ],
    label: [23.95, 58.62],
    hq: [24.497, 58.385],
    description: {
      et: 'Suvepealinn Pärnu, saared Saaremaa ja Hiiumaa praamiühendusega, Rapla- ja Järvamaa maanteed.',
      en: 'Summer capital Pärnu, the islands of Saaremaa and Hiiumaa reachable by ferry, and the highways of Rapla and Järva.',
    },
    commander: { name: 'Kersti Vaher', title: { et: 'Prefekt', en: 'Prefect' } },
  },
};

const isStub = (r: RegionDef | undefined) => !r || !r.hqCity || r.name.et === r.id || r.name.et === '';

export interface RegionSummary {
  id: RegionId;
  name: Text;
  short: string;
  hqCity: string;
  counties: string[];
  stations: number;
  /** Units on duty on a normal-difficulty day shift (see regionUnitsOnDuty). */
  units: number;
  description: Text;
  commander: { name: string; title: Text };
  label: LngLat;
  hq: LngLat;
  placeholder: boolean;
}

/** Region data merged with fallbacks, safe while region files are still placeholders. */
export function regionSummary(id: RegionId): RegionSummary {
  const r = REGIONS[id] as RegionDef | undefined;
  // An id from an old or foreign save must never crash the menu.
  const fb = REGION_FALLBACK[id] ?? REGION_FALLBACK.pohja;
  const stub = isStub(r);
  const hqStation = r?.stations?.find((s) => s.kind === 'hq');
  return {
    id,
    name: !stub && r ? r.name : fb.name,
    short: !stub && r?.short ? r.short : fb.short,
    hqCity: !stub && r?.hqCity ? r.hqCity : fb.hqCity,
    counties: r?.counties?.length ? r.counties : fb.counties,
    stations: r?.stations?.length ?? 0,
    units: regionUnitsOnDuty(id, 'day', 'normal'),
    description: !stub && r?.description?.et ? r.description : fb.description,
    commander: r?.commander ? { name: r.commander.name, title: r.commander.title } : fb.commander,
    label: fb.label,
    hq: hqStation?.coord ?? fb.hq,
    placeholder: stub,
  };
}

/**
 * Units on duty in a prefecture for one shift and difficulty. The roster file also lists the
 * other shift's units and the extras of harder levels, so its length overstates the force.
 */
export function regionUnitsOnDuty(id: RegionId, shift: 'day' | 'night', difficulty: Difficulty): number {
  const r = REGIONS[id] as RegionDef | undefined;
  if (!r?.roster?.length) return 0;
  try {
    return rosterSpecsFor(r, shift, difficulty).length;
  } catch {
    return r.roster.length;
  }
}

/** Prefecture of a career shift: the one picked in HQ when the profile has it unlocked, else the home region. */
export function careerShiftRegion(p: Pick<CareerProfile, 'regionId' | 'unlockedRegions'>, picked?: RegionId): RegionId {
  const open = p.unlockedRegions?.length ? p.unlockedRegions : [p.regionId];
  return picked && open.includes(picked) ? picked : p.regionId;
}

/** Net budget change of a career shift: the sum of its ledger entries (what moves the money). */
export function ledgerNet(ledger: readonly { amount: number }[]): number {
  return ledger.reduce((a, l) => a + (Number.isFinite(l.amount) ? l.amount : 0), 0);
}

/** Prefecture for a county name ("Harju maakond"); region data first, then the fixed fallback mapping. */
export function regionOfCounty(county: string): RegionId | undefined {
  for (const id of REGION_IDS) if (REGIONS[id]?.counties?.includes(county)) return id;
  for (const id of REGION_IDS) if (REGION_FALLBACK[id].counties.includes(county)) return id;
  return undefined;
}

// ── Map projection (overview SVG of Estonia) ────────────────────────────────

export interface Projection {
  width: number;
  height: number;
  project: (p: LngLat) => [number, number];
}

/** Equirectangular projection with cos(lat) x-scaling, fitted to `width` with padding. */
export function makeProjection(bounds: [LngLat, LngLat], width: number, pad = 8): Projection {
  const [[w, s], [e, n]] = bounds;
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const spanX = (e - w) * k;
  const spanY = n - s;
  const scale = (width - pad * 2) / spanX;
  const height = Math.round(spanY * scale + pad * 2);
  return {
    width,
    height,
    project: ([lon, lat]) => [pad + (lon - w) * k * scale, pad + (n - lat) * scale],
  };
}

// L-EST97 (EPSG:3301): the Lambert conformal conic of the Estonian base map. GRS80, standard parallels 58° and
// 59°20′, origin 57.5176° N 24° E, false easting 500 km, false northing 6375 km.
const LEST_A = 6378137;
const LEST_F = 1 / 298.257222101;
const LEST_E = Math.sqrt(2 * LEST_F - LEST_F * LEST_F);
const RAD = Math.PI / 180;
const lestM = (p: number) => Math.cos(p) / Math.sqrt(1 - LEST_E * LEST_E * Math.sin(p) ** 2);
const lestT = (p: number) =>
  Math.tan(Math.PI / 4 - p / 2) / ((1 - LEST_E * Math.sin(p)) / (1 + LEST_E * Math.sin(p))) ** (LEST_E / 2);
const LEST_P1 = (59 + 1 / 3) * RAD;
const LEST_P2 = 58 * RAD;
const LEST_N = (Math.log(lestM(LEST_P1)) - Math.log(lestM(LEST_P2))) / (Math.log(lestT(LEST_P1)) - Math.log(lestT(LEST_P2)));
const LEST_FF = lestM(LEST_P1) / (LEST_N * lestT(LEST_P1) ** LEST_N);
const LEST_RHO0 = LEST_A * LEST_FF * lestT(57.51755393055556 * RAD) ** LEST_N;

/**
 * L-EST97 in kilometres, shifted so Estonia sits near the origin: x = easting − 360 km (east), y = 6650 km −
 * northing (south, as on screen). The duty map (dutyMap.ts) draws in these units times its scale.
 */
export function lest97([lon, lat]: LngLat): [number, number] {
  const rho = LEST_A * LEST_FF * lestT(lat * RAD) ** LEST_N;
  const th = LEST_N * (lon * RAD - 24 * RAD);
  const e = 500_000 + rho * Math.sin(th);
  const n = 6_375_000 + LEST_RHO0 - rho * Math.cos(th);
  return [(e - 360_000) / 1000, (6_650_000 - n) / 1000];
}

/** Drop vertices closer than `minDist` (in projected units) to the previously kept one. */
export function simplifyRing(pts: [number, number][], minDist: number): [number, number][] {
  if (pts.length <= 4) return pts;
  const out: [number, number][] = [pts[0]];
  const d2 = minDist * minDist;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [px, py] = out[out.length - 1];
    if ((x - px) ** 2 + (y - py) ** 2 >= d2) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out.length >= 4 ? out : pts;
}

export interface CountyShape {
  name: string;
  regionId: RegionId | undefined;
  d: string;
  /** Projected bbox centre. */
  center: [number, number];
  area: number;
}

type GeoFeature = {
  properties: { name: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
};

export const ESTONIA_BOUNDS: [LngLat, LngLat] = [
  [21.7, 57.47],
  [28.28, 59.72],
];

/** County outlines as SVG path strings, grouped by prefecture. */
export function countyShapes(proj: Projection, minDist = 0.9): CountyShape[] {
  const feats = (countiesGeo as unknown as { features: GeoFeature[] }).features;
  return feats.map((f) => {
    const polys = (
      f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]
    ) as number[][][][];
    let d = '';
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let area = 0;
    for (const poly of polys) {
      for (const ring of poly) {
        const projected = ring.map((c) => proj.project([c[0], c[1]]));
        const simple = simplifyRing(projected, minDist);
        if (simple.length < 3) continue;
        let a = 0;
        for (let i = 0; i < simple.length; i++) {
          const [x1, y1] = simple[i];
          const [x2, y2] = simple[(i + 1) % simple.length];
          a += x1 * y2 - x2 * y1;
          if (x1 < minX) minX = x1;
          if (y1 < minY) minY = y1;
          if (x1 > maxX) maxX = x1;
          if (y1 > maxY) maxY = y1;
        }
        // tiny islets add noise at this scale
        if (Math.abs(a) / 2 < minDist * minDist * 2) continue;
        area += Math.abs(a) / 2;
        d += 'M' + simple.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z';
      }
    }
    return {
      name: f.properties.name,
      regionId: regionOfCounty(f.properties.name),
      d,
      center: [(minX + maxX) / 2, (minY + maxY) / 2],
      area,
    };
  });
}

// ── Briefing presets ─────────────────────────────────────────────────────────

export type DatePreset = 'today' | 'jaanipaev' | 'newyear' | 'winterfri' | 'summersat';
export const DATE_PRESETS: DatePreset[] = ['today', 'jaanipaev', 'newyear', 'winterfri', 'summersat'];

export type ShiftPreset = 'day' | 'night' | 'short';
export const SHIFT_PRESETS: Record<
  ShiftPreset,
  { hour: number; hours: number; kind: 'day' | 'night' | 'custom' }
> = {
  day: { hour: 7, hours: 12, kind: 'day' },
  night: { hour: 19, hours: 12, kind: 'night' },
  short: { hour: 22, hours: 4, kind: 'custom' },
};

export interface YMD {
  y: number;
  m: number;
  d: number;
}

/** Day of week for a calendar date: 0 = Monday … 6 = Sunday. */
export function weekdayOf({ y, m, d }: YMD): number {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** n-th (1-based) given weekday (0 = Mon) in a month. */
export function nthWeekday(y: number, m: number, weekday: number, n: number): YMD {
  const first = weekdayOf({ y, m, d: 1 });
  const d = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return { y, m, d };
}

const cmp = (a: YMD, b: YMD) => a.y - b.y || a.m - b.m || a.d - b.d;

/** Resolve a date preset to the next occurrence on/after `now` (Tallinn calendar). */
export function resolveDatePreset(p: DatePreset, now: number): YMD {
  const w = wall(now);
  const today: YMD = { y: w.year, m: w.month, d: w.day };
  const next = (f: (y: number) => YMD): YMD => {
    const a = f(today.y);
    return cmp(a, today) >= 0 ? a : f(today.y + 1);
  };
  switch (p) {
    case 'today':
      return today;
    case 'jaanipaev':
      return next((y) => ({ y, m: 6, d: 23 }));
    case 'newyear':
      return next((y) => ({ y, m: 12, d: 31 }));
    case 'winterfri':
      return next((y) => nthWeekday(y, 1, 4, 2)); // 2nd Friday of January
    case 'summersat':
      return next((y) => nthWeekday(y, 7, 5, 2)); // 2nd Saturday of July
  }
}

/** Shift start as game epoch ms (Europe/Tallinn wall time). */
export function shiftStart(date: YMD, shift: ShiftPreset): number {
  return tallinnTime(date.y, date.m, date.d, SHIFT_PRESETS[shift].hour, 0);
}

export function ymdText({ y, m, d }: YMD): string {
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

/** Built-in special-day note used when sim/calendar has nothing (or is still a stub). */
export function presetHoliday(date: YMD): Text | undefined {
  if (date.m === 6 && date.d === 23)
    return { et: 'Võidupüha ja jaaniõhtu', en: 'Victory Day and Midsummer Eve' };
  if (date.m === 6 && date.d === 24) return { et: 'Jaanipäev', en: 'Midsummer Day' };
  if (date.m === 12 && date.d === 31) return { et: 'Vana-aasta õhtu', en: "New Year's Eve" };
  if (date.m === 1 && date.d === 1) return { et: 'Uusaasta', en: "New Year's Day" };
  if (date.m === 2 && date.d === 24) return { et: 'Iseseisvuspäev', en: 'Independence Day' };
  if (date.m === 12 && date.d === 24) return { et: 'Jõululaupäev', en: 'Christmas Eve' };
  return undefined;
}

// ── Report helpers ───────────────────────────────────────────────────────────

/** Default response-time targets (urban SLA, minutes), see DESIGN §4.5. */
export const SLA_TARGETS: Record<Priority, number> = { 1: 10, 2: 20, 3: 45, 4: 120 };

export type Tone = 'gold' | 'ok' | 'accent' | 'warn' | 'danger' | 'neutral';

export function gradeTone(g: ShiftReport['grade']): Tone {
  switch (g) {
    case 'S':
      return 'gold';
    case 'A':
      return 'ok';
    case 'B':
      return 'accent';
    case 'C':
      return 'warn';
    case 'D':
      return 'warn';
    default:
      return 'danger';
  }
}

/** Ratio of actual to target response time → tone for the bar. */
export function responseTone(actual: number | undefined, target: number): Tone {
  if (actual === undefined || !Number.isFinite(actual)) return 'neutral';
  if (actual <= target) return 'ok';
  if (actual <= target * 1.5) return 'warn';
  return 'danger';
}

// ── Storage ──────────────────────────────────────────────────────────────────

/** Remove every `epd:*` key from a Storage-like object; returns the removed keys. */
export function clearEpdStorage(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith('epd:')) keys.push(k);
  }
  keys.forEach((k) => storage.removeItem(k));
  return keys;
}
