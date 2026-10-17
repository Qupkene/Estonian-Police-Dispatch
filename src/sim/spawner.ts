/**
 * Spawning (engine-core) — DESIGN §4.2: Poisson process, template choice, incident generation
 * (location, persons, vehicles, texts, SLA, beats…).
 */
import { pickLocation } from '@/gen/address';
import { surnameForGender } from '@/gen/names';
import { generatePerson } from '@/gen/person';
import { generateVehicle } from '@/gen/vehicle';
import { dayInfo, hourCurve, weekdayFactor } from './calendar';
import { maybeCreateCall } from './calls';
import { destination, haversineKm } from './geo';
import { allTemplates, publishIncident, regionOf } from './internal';
import { incidentVars } from './incidents';
import { Rng, withRng } from './rng';
import { defaultSla, slaFor } from './scoring';
import { fillText } from './text';
import { HOUR, isoDate, MIN, seasonOf, wall } from './time';
import { zoneAt } from './units';
import { weatherCallFactor, weatherTrafficFactor } from './weather';
import type {
  Difficulty,
  Gender,
  HourProfile,
  Incident,
  IncidentLocation,
  IncidentTemplate,
  LngLat,
  Person,
  PersonSpec,
  PlaceKind,
  Priority,
  RegionDef,
  RegionId,
  SimState,
  SpeakerLang,
  Text,
} from './types';

const T = (et: string, en: string): Text => ({ et, en });

export const DIFFICULTY_FACTOR: Record<Difficulty, number> = { cadet: 0.6, normal: 1, veteran: 1.35, realistic: 1.8 };

/** Event-number prefixes per prefecture ("PÕ-261017-0042"). */
export const NUMBER_PREFIX: Record<RegionId, string> = { pohja: 'PÕ', ida: 'ID', louna: 'LÕ', laane: 'LÄ' };

/** Caller gives up after this many minutes by default (template.expiresMin overrides). */
export const DEFAULT_EXPIRES_MIN: Record<Priority, number> = { 1: 45, 2: 75, 3: 150, 4: 240 };

// ─────────────────────────────────────────────────────────────────────────────
// Rate
// ─────────────────────────────────────────────────────────────────────────────

/** Events per game-hour at time t (DESIGN §4.2). */
export function spawnRatePerHour(s: SimState, t: number): number {
  const region = regionOf(s);
  const w = wall(t);
  let r =
    (region?.callVolume ?? 3) *
    hourCurve(w.hour + w.minute / 60) *
    weekdayFactor(t) *
    (dayInfo(t).factor || 1) *
    DIFFICULTY_FACTOR[s.difficulty] *
    weatherCallFactor(s.weather);
  if (s.mode === 'tutorial') r *= 0.5;
  return Math.max(0.05, r);
}

// ─────────────────────────────────────────────────────────────────────────────
// Template choice
// ─────────────────────────────────────────────────────────────────────────────

const PROFILES: Record<Exclude<HourProfile, number[]>, number[]> = {
  flat: Array(24).fill(1),
  day: [0.2, 0.15, 0.1, 0.1, 0.1, 0.2, 0.4, 0.8, 1.2, 1.5, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.5, 1.4, 1.2, 1.0, 0.8, 0.6, 0.4, 0.3],
  night: [1.9, 1.9, 1.8, 1.6, 1.2, 0.7, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.4, 0.4, 0.5, 0.6, 0.7, 0.9, 1.1, 1.3, 1.6, 1.8, 1.9],
  evening: [1.0, 0.7, 0.5, 0.3, 0.2, 0.2, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.8, 0.9, 1.0, 1.2, 1.5, 1.8, 2.0, 2.0, 1.9, 1.7, 1.3],
  nightlife: [2.6, 2.8, 2.6, 2.0, 1.2, 0.5, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.2, 0.3, 0.5, 0.8, 1.2, 1.6, 2.0, 2.4],
  commute: [0.2, 0.1, 0.1, 0.1, 0.2, 0.5, 1.2, 2.2, 2.4, 1.4, 1.0, 1.0, 1.1, 1.1, 1.2, 1.6, 2.2, 2.4, 1.8, 1.2, 0.9, 0.6, 0.4, 0.3],
  business: [0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.4, 0.9, 1.6, 1.9, 2.0, 2.0, 1.9, 2.0, 2.0, 1.9, 1.7, 1.2, 0.7, 0.4, 0.3, 0.2, 0.1, 0.1],
};

/** Hour-of-day multiplier for a template hour profile. */
export function hourMultiplier(p: HourProfile | undefined, hour: number, weekday: number): number {
  if (!p) return 1;
  if (Array.isArray(p)) return p[hour] ?? 1;
  const v = PROFILES[p]?.[hour] ?? 1;
  return p === 'business' && weekday >= 5 ? v * 0.4 : v;
}

/** Place kinds the address generator can always produce. */
const GENERATED_KINDS = new Set<PlaceKind>(['residential', 'house', 'street', 'village', 'farm', 'summerhouse', 'forest', 'ruralroad', 'lake', 'highway']);
/** Kinds that only make sense at a curated real place. */
const CURATED_ONLY = new Set<PlaceKind>([
  'airport',
  'port',
  'border',
  'prison',
  'embassy',
  'stadium',
  'concert',
  'university',
  'hospital',
  'museum',
  'oldtown',
  'beach',
  'trainstation',
  'government',
  'hotel',
  'mall',
  'bank',
  'nightclub',
]);

const placeKindCache = new WeakMap<RegionDef, Set<PlaceKind>>();

/** Multiplier 0..1 for how well the region can host a template's place kinds. */
export function placeAvailability(region: RegionDef, kinds: PlaceKind[]): number {
  if (!kinds.length) return 1;
  let have = placeKindCache.get(region);
  if (!have) {
    have = new Set(region.places.map((p) => p.kind));
    placeKindCache.set(region, have);
  }
  let best = 0;
  for (const k of kinds) {
    if (have.has(k) || GENERATED_KINDS.has(k)) return 1;
    if (!CURATED_ONLY.has(k)) best = 0.35;
  }
  return best;
}

interface PickCtx {
  hour: number;
  weekday: number;
  month: number;
  season: string;
  weekendNight: boolean;
  trafficF: number;
  wet: boolean;
  dayTags: string[];
}

function pickCtx(s: SimState, t: number): PickCtx {
  const w = wall(t);
  const weekendNight = (w.weekday === 4 && w.hour >= 18) || (w.weekday === 5 && (w.hour < 6 || w.hour >= 18)) || (w.weekday === 6 && w.hour < 6);
  const wk = s.weather?.kind;
  let dayTags: string[] = [];
  try {
    dayTags = dayInfo(t).tags ?? [];
  } catch {
    dayTags = [];
  }
  return {
    hour: w.hour,
    weekday: w.weekday,
    month: w.month,
    season: seasonOf(w.month),
    weekendNight,
    trafficF: s.weather ? weatherTrafficFactor(s.weather) : 1,
    wet: wk === 'rain' || wk === 'storm' || wk === 'sleet',
    dayTags,
  };
}

/** Spawn weight of a template right now (0 = not eligible). */
export function templateWeight(s: SimState, tpl: IncidentTemplate, ctx: PickCtx): number {
  if (!(tpl.weight > 0)) return 0;
  if (tpl.id.startsWith('sys:')) return 0;
  if (tpl.regions && !tpl.regions.includes(s.regionId)) return 0;
  if (tpl.months && tpl.months.length && !tpl.months.includes(ctx.month)) return 0;
  if (tpl.seasons && tpl.seasons.length && !tpl.seasons.includes(ctx.season as never)) return 0;
  const region = regionOf(s);
  const avail = placeAvailability(region, tpl.places);
  if (avail <= 0) return 0;
  let w = tpl.weight * avail * hourMultiplier(tpl.hours, ctx.hour, ctx.weekday);
  if (ctx.weekendNight) w *= tpl.weekendBoost ?? 1;
  if (tpl.category === 'traffic') w *= ctx.trafficF;
  if (ctx.wet && (tpl.category === 'public_order' || tpl.hours === 'nightlife')) w *= 0.75;
  if (ctx.dayTags.length && tpl.tags?.some((t) => ctx.dayTags.includes(t))) w *= 3;
  return w;
}

/** Weighted template pick with the easter-egg budget (≤ 1.5 % of events). */
export function pickTemplate(s: SimState, r: Rng, templates: IncidentTemplate[], t: number): IncidentTemplate | undefined {
  const ctx = pickCtx(s, t);
  const ws = templates.map((tpl) => templateWeight(s, tpl, ctx));
  let normal = 0;
  let easter = 0;
  templates.forEach((tpl, i) => {
    if (tpl.easterEgg) easter += ws[i];
    else normal += ws[i];
  });
  const easterCount = Number(s.flags.easterCount) || 0;
  const tooMany = (easterCount + 1) / (s.stats.incidents + 1) > 0.03 && s.stats.incidents > 0;
  let easterScale = 1;
  if (tooMany || normal <= 0) easterScale = normal <= 0 ? 1 : 0;
  else if (easter > 0) {
    const target = (0.015 / (1 - 0.015)) * normal;
    if (easter > target) easterScale = target / easter;
  }
  let total = 0;
  for (let i = 0; i < ws.length; i++) {
    if (templates[i].easterEgg) ws[i] *= easterScale;
    total += ws[i];
  }
  if (total <= 0) return undefined;
  let x = r.next() * total;
  for (let i = 0; i < ws.length; i++) {
    x -= ws[i];
    if (x < 0 && ws[i] > 0) return templates[i];
  }
  for (let i = ws.length - 1; i >= 0; i--) if (ws[i] > 0) return templates[i];
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Locations
// ─────────────────────────────────────────────────────────────────────────────

function fallbackLocation(r: Rng, region: RegionDef, kinds: PlaceKind[]): IncidentLocation {
  const places = region.places.filter((p) => kinds.includes(p.kind));
  if (places.length) {
    const p = r.pick(places);
    return { address: p.address, coord: p.coord, city: p.city, district: p.district, placeName: p.name, placeKind: p.kind, zone: p.zone ?? 'mainland' };
  }
  const kind = kinds[0] ?? 'street';
  if (region.towns.length) {
    const town = r.weighted(region.towns, (t) => Math.sqrt(Math.max(1, t.population)));
    const coord = destination(town.coord, r.range(0, 1.5), r.range(0, 360));
    return { address: town.name, coord, city: town.name, placeKind: kind, zone: town.zone ?? 'mainland' };
  }
  const coord = destination(region.center, r.range(0, 4), r.range(0, 360));
  return { address: coordText(coord), coord, city: '', placeKind: kind, zone: region.zones[0]?.id ?? 'mainland' };
}

function coordText(c: LngLat): string {
  return `Kaardipunkt ${c[1].toFixed(5)}, ${c[0].toFixed(5)}`;
}

/** Location for a map click (director): nearest street address / place / town, else coordinates. */
export function locationFromCoord(s: SimState, coord: LngLat, kind?: PlaceKind): IncidentLocation {
  const region = regionOf(s);
  const zone = zoneAt(region, coord);
  let bestPlace: (typeof region.places)[number] | undefined;
  let bp = 0.3;
  for (const p of region.places) {
    const d = haversineKm(p.coord, coord);
    if (d < bp) {
      bp = d;
      bestPlace = p;
    }
  }
  if (bestPlace && (!kind || bestPlace.kind === kind)) {
    return {
      address: bestPlace.address,
      coord,
      city: bestPlace.city,
      district: bestPlace.district,
      placeName: bestPlace.name,
      placeKind: bestPlace.kind,
      zone: bestPlace.zone ?? zone,
    };
  }
  let best: { name: string; city: string; district?: string; n: number; d: number; kind: string } | undefined;
  const kx = 111.32 * Math.cos((coord[1] * Math.PI) / 180);
  const ky = 110.57;
  for (const st of region.streets) {
    if (st.points.length < 2) continue;
    const segs: number[] = [];
    let total = 0;
    for (let i = 1; i < st.points.length; i++) {
      const l = haversineKm(st.points[i - 1], st.points[i]);
      segs.push(l);
      total += l;
    }
    let acc = 0;
    for (let i = 1; i < st.points.length; i++) {
      // Project the click onto the segment (local planar approximation, km).
      const a = st.points[i - 1];
      const b = st.points[i];
      const bx = (b[0] - a[0]) * kx;
      const by = (b[1] - a[1]) * ky;
      const px = (coord[0] - a[0]) * kx;
      const py = (coord[1] - a[1]) * ky;
      const len2 = bx * bx + by * by;
      const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
      const d = Math.hypot(px - t * bx, py - t * by);
      if (d < 0.4 && (!best || d < best.d)) {
        const f = total > 0 ? (acc + t * segs[i - 1]) / total : 0;
        const n = Math.max(1, Math.round(st.houses[0] + f * (st.houses[1] - st.houses[0])));
        best = { name: st.name, city: st.city, district: st.district, n, d, kind: st.kind };
      }
      acc += segs[i - 1];
    }
  }
  let town: (typeof region.towns)[number] | undefined;
  let bt = 6;
  for (const t of region.towns) {
    const d = haversineKm(t.coord, coord);
    if (d < bt) {
      bt = d;
      town = t;
    }
  }
  const pk: PlaceKind = kind ?? (best ? (best.kind === 'apartment' ? 'residential' : best.kind === 'house' ? 'house' : 'street') : town ? 'street' : 'forest');
  if (best) return { address: `${best.name} ${best.n}`, coord, city: best.city, district: best.district, placeKind: pk, zone };
  if (town) return { address: `${town.name}, ${coordText(coord)}`, coord, city: town.name, placeKind: pk, zone };
  return { address: coordText(coord), coord, city: '', placeKind: pk, zone };
}

function ruShareAt(region: RegionDef, loc: IncidentLocation): number {
  const town = region.towns.find((t) => t.name === loc.city);
  if (town) return town.ruShare;
  let best: (typeof region.towns)[number] | undefined;
  let bd = 30;
  for (const t of region.towns) {
    const d = haversineKm(t.coord, loc.coord);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  if (best) return best.ruShare;
  return regionRuShare(region);
}

/** Population-weighted Russian-speaker share of the prefecture. */
export function regionRuShare(region: RegionDef): number {
  let pop = 0;
  let ru = 0;
  for (const t of region.towns) {
    pop += t.population;
    ru += t.population * t.ruShare;
  }
  if (pop > 0) return ru / pop;
  return region.id === 'ida' ? 0.6 : region.id === 'pohja' ? 0.3 : 0.06;
}

export function pickLang(r: Rng, ruShare: number): SpeakerLang {
  const x = r.next();
  if (x < ruShare) return 'ru';
  if (x < ruShare + 0.03) return 'uk';
  if (x < ruShare + 0.04) return 'en';
  if (x < ruShare + 0.045) return 'fi';
  return 'et';
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident creation
// ─────────────────────────────────────────────────────────────────────────────

const FAMILY = new Set(['partner', 'ex_partner', 'family', 'child', 'parent']);

function newPersonId(s: SimState): string {
  return `p${++s.seq.person}`;
}

function full(p: Person): string {
  return `${p.firstName} ${p.lastName}`;
}

export interface CreateOpts {
  location?: IncidentLocation;
  priority?: Priority;
  summary?: Text;
  source?: Incident['source'];
}

/** Generate a complete incident from a template (not yet published). */
export function createIncident(s: SimState, tpl: IncidentTemplate, o: CreateOpts = {}): Incident {
  const region = regionOf(s);
  const seq = ++s.seq.incident;
  const r = withRng(s, (rr) => rr.fork(seq));
  const now = s.now;
  let location = o.location;
  if (!location) {
    try {
      location = pickLocation(r, region, tpl.places.length ? tpl.places : ['street']);
    } catch {
      location = fallbackLocation(r, region, tpl.places);
    }
  }
  if (!location.zone) location = { ...location, zone: zoneAt(region, location.coord) };
  const truePriority = o.priority ?? tpl.priority;
  const w = wall(now);
  const yymmdd = `${String(w.year % 100).padStart(2, '0')}${String(w.month).padStart(2, '0')}${String(w.day).padStart(2, '0')}`;
  const inc: Incident = {
    id: `i${seq}`,
    number: `${NUMBER_PREFIX[s.regionId] ?? 'EE'}-${yymmdd}-${String(seq).padStart(4, '0')}`,
    templateId: tpl.id,
    category: tpl.category,
    code: tpl.code,
    title: tpl.title,
    priority: truePriority,
    truePriority,
    state: 'incoming',
    source: o.source ?? (tpl.tags?.includes('anpr') ? 'anpr' : tpl.tags?.includes('alarm') ? 'alarm' : 'hk'),
    createdAt: now,
    location,
    summary: T('', ''),
    details: [],
    hiddenDetails: [],
    persons: [],
    vehicles: [],
    assigned: [],
    unitHistory: [],
    need: tpl.units.need.map((n) => ({ ...n })),
    ideal: (tpl.units.ideal ?? []).map((n) => ({ ...n })),
    onSceneMin: r.int(tpl.onScene[0], Math.max(tpl.onScene[0], tpl.onScene[1])),
    workDone: 0,
    slaMin: 0,
    beats: (tpl.beats ?? []).map((b, index) => ({ index, status: r.chance(b.chance ?? 1) ? 'pending' : 'skipped' })),
    agencyNeeds: [],
    effects: { success: 0, risk: 0, trust: 0, time: 0, arrests: 0 },
    timeline: [],
    tags: [...(tpl.tags ?? [])],
    ...(tpl.easterEgg ? { easterEgg: true } : {}),
  };
  inc.slaMin = slaFor(s, inc, truePriority, tpl);
  // Rural callers wait longer: distances are bigger and they know it (DESIGN §4.3).
  const ruralWait = inc.slaMin > defaultSla(truePriority, true) ? 1.6 : 1;
  inc.expiresAt = now + (tpl.expiresMin ?? DEFAULT_EXPIRES_MIN[truePriority]) * ruralWait * MIN;
  if (tpl.escalation) inc.escalateAt = now + tpl.escalation.afterMin * MIN;
  for (const a of tpl.agencies ?? []) if (r.chance(a.chance)) inc.agencyNeeds.push({ agency: a.agency, reason: a.reason });
  if (tpl.referral && r.chance(tpl.referral.chance)) inc.referral = tpl.referral.agency;
  if (tpl.falseAlarmChance && r.chance(tpl.falseAlarmChance)) inc.falseAlarm = true;

  generateInvolved(s, r, tpl, inc, region);

  const vars = incidentVars(s, inc);
  inc.summary = o.summary ?? (tpl.summary.length ? fillText(r.pick(tpl.summary), vars) : tpl.title);
  inc.hiddenDetails = (tpl.details ?? []).map((d) => fillText(d, vars));

  s.incidents[inc.id] = inc;
  s.incidentOrder.push(inc.id);
  s.stats.incidents++;
  s.stats.byPriority[truePriority]++;
  if (tpl.easterEgg) s.flags.easterCount = (Number(s.flags.easterCount) || 0) + 1;
  return inc;
}

function generateInvolved(s: SimState, r: Rng, tpl: IncidentTemplate, inc: Incident, region: RegionDef): void {
  const now = s.now;
  const loc = inc.location;
  const ru = ruShareAt(region, loc);
  const householdLang = pickLang(r, ru);
  const atHome = loc.placeKind === 'residential' || loc.placeKind === 'house' || loc.placeKind === 'farm' || loc.placeKind === 'summerhouse';
  const specs = tpl.persons ?? [];
  const order = specs.map((sp, i) => ({ sp, i }));
  // Anchors (no family relation) first, victims before others; family members after.
  order.sort((a, b) => {
    const fa = FAMILY.has(a.sp.relation ?? '') ? 1 : 0;
    const fb = FAMILY.has(b.sp.relation ?? '') ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const va = a.sp.role === 'victim' || a.sp.role === 'missing' ? 0 : 1;
    const vb = b.sp.role === 'victim' || b.sp.role === 'missing' ? 0 : 1;
    return va - vb || a.i - b.i;
  });
  const made: (Person | undefined)[] = new Array(specs.length);
  let anchor: Person | undefined;
  for (const { sp, i } of order) {
    const rel = sp.relation ?? '';
    const fam = FAMILY.has(rel) && !!anchor;
    let gender: Gender | undefined = sp.gender && sp.gender !== 'any' ? sp.gender : undefined;
    if (!gender && fam && anchor && (rel === 'partner' || rel === 'ex_partner')) gender = r.chance(0.92) ? (anchor.gender === 'M' ? 'F' : 'M') : anchor.gender;
    const lang: SpeakerLang = fam && anchor ? anchor.lang : !anchor || sp.role === 'victim' || rel === 'neighbour' ? householdLang : pickLang(r, ru);
    let lastName: string | undefined;
    let home: { address: string; city: string; coord?: LngLat } | undefined;
    if (fam && anchor) {
      const share = rel === 'child' || rel === 'parent' ? 0.9 : rel === 'family' ? 0.75 : rel === 'partner' ? 0.6 : 0.2;
      if (r.chance(share)) {
        if (!gender) gender = r.chance(0.5) ? 'M' : 'F';
        lastName = safeSurname(anchor.lastName, gender, lang);
      }
      if (rel !== 'ex_partner' && (rel !== 'family' || r.chance(0.7))) home = { address: anchor.address, city: anchor.city, coord: anchor.coord };
    } else if (atHome && !anchor && (sp.role === 'victim' || sp.role === 'caller' || sp.role === 'missing' || sp.role === 'deceased')) {
      home = { address: loc.address, city: loc.city, coord: loc.coord };
    } else if (atHome && rel === 'neighbour') {
      home = { address: loc.address.replace(/-\d+$/, `-${r.int(1, 60)}`), city: loc.city, coord: loc.coord };
    }
    const p = generatePerson(r, { id: newPersonId(s), now, region, gender, age: sp.age, lang, spec: sp, home, lastName });
    if (sp.role === 'missing' && !p.flags.missing) p.flags.missing = { since: isoDate(now), text: T('Kadunud, otsitakse', 'Missing, search ongoing') };
    if (sp.role === 'deceased') p.flags.deceased = true;
    s.persons[p.id] = p;
    made[i] = p;
    // Victims / missing persons sort first, so the first non-family person anchors relations.
    if (!anchor) anchor = p;
  }
  specs.forEach((sp, i) => {
    const p = made[i];
    if (p) inc.persons.push({ personId: p.id, role: sp.role });
  });
  // Restraining orders protect the victim of this incident.
  const victim = specs.findIndex((sp) => sp.role === 'victim');
  if (victim >= 0 && made[victim]) {
    for (let i = 0; i < specs.length; i++) {
      const p = made[i];
      if (p && specs[i].role === 'suspect' && p.flags.restrainingOrder) p.flags.restrainingOrder.protectedName = full(made[victim]!);
    }
  }
  // Caller.
  const callerIdx = specs.findIndex((sp) => sp.role === 'caller');
  let caller: Person | undefined = callerIdx >= 0 ? made[callerIdx] : undefined;
  if (!caller) {
    const v = victim >= 0 ? made[victim] : undefined;
    const wIdx = specs.findIndex((sp) => sp.role === 'witness');
    const missingIdx = specs.findIndex((sp) => sp.role === 'missing');
    if (v && r.chance(0.55)) caller = v;
    else if (wIdx >= 0 && made[wIdx]) caller = made[wIdx];
    else {
      const fam = missingIdx >= 0 ? made[missingIdx] : undefined;
      const lang = fam ? fam.lang : pickLang(r, ru);
      const gender: Gender = r.chance(0.55) ? 'F' : 'M';
      const spec: PersonSpec = { role: 'caller', age: [19, 78] };
      caller = generatePerson(r, {
        id: newPersonId(s),
        now,
        region,
        gender,
        lang,
        spec,
        age: spec.age,
        lastName: fam && r.chance(0.8) ? safeSurname(fam.lastName, gender, lang) : undefined,
        home: fam ? { address: fam.address, city: fam.city, coord: fam.coord } : atHome && r.chance(0.6) ? { address: loc.address.replace(/-\d+$/, `-${r.int(1, 60)}`), city: loc.city, coord: loc.coord } : undefined,
      });
      s.persons[caller.id] = caller;
      inc.persons.push({ personId: caller.id, role: 'caller' });
    }
  }
  if (caller) inc.caller = { name: full(caller), phone: caller.phone, lang: caller.lang, personId: caller.id };

  // Vehicles.
  for (const vs of tpl.vehicles ?? []) {
    const ownerIdx = vs.driverRole ? specs.findIndex((sp) => sp.role === vs.driverRole) : -1;
    const owner = ownerIdx >= 0 ? made[ownerIdx] : undefined;
    const v = generateVehicle(r, { now, kind: vs.kind, owner, spec: vs, region: s.regionId, isTaken: (p) => !!s.vehicles[p] });
    if (s.vehicles[v.plate]) continue;
    if (v.flags.stolen && owner && (vs.driverRole === 'suspect' || vs.driverRole === 'driver')) {
      // A stolen car belongs to someone else (the theft victim lives in the registry).
      const real = generatePerson(r, { id: newPersonId(s), now, region });
      s.persons[real.id] = real;
      v.ownerId = real.id;
      delete v.ownerCompany;
      real.vehicles.push(v.plate);
      owner.vehicles = owner.vehicles.filter((pl) => pl !== v.plate);
    } else if (owner) {
      if (!v.ownerCompany) v.ownerId = owner.id;
      if (!owner.vehicles.includes(v.plate)) owner.vehicles.push(v.plate);
    }
    s.vehicles[v.plate] = v;
    inc.vehicles.push({ plate: v.plate, role: vs.role });
  }
}

function safeSurname(lastName: string, gender: Gender, lang: SpeakerLang): string {
  try {
    return surnameForGender(lastName, gender, lang as never);
  } catch {
    return lastName;
  }
}

/** Create + route through 112 call logic (HK events only) or publish. Returns the incident (or undefined on failure). */
export function spawnIncident(s: SimState, tpl: IncidentTemplate, o: CreateOpts = {}): Incident | undefined {
  let inc: Incident;
  try {
    inc = createIncident(s, tpl, o);
  } catch (err) {
    console.warn(`[EPD] spawn of ${tpl.id} failed`, err);
    return undefined;
  }
  let call = null;
  if (inc.source === 'hk') {
    try {
      call = maybeCreateCall(s, inc, tpl);
    } catch (err) {
      console.warn('[EPD] maybeCreateCall failed', err);
    }
  }
  if (call) s.flags[`hidden:${inc.id}`] = true;
  else publishIncident(s, inc);
  return inc;
}

/** Per-substep: Poisson arrivals until the shift's end time. */
export function updateSpawner(s: SimState): void {
  if (s.flags.autoSpawn === false || s.now >= s.endTime) {
    if (s.nextSpawnAt < s.now) s.nextSpawnAt = s.now + MIN;
    return;
  }
  let n = 0;
  while (s.now >= s.nextSpawnAt && s.nextSpawnAt < s.endTime && n < 4) {
    const t = s.nextSpawnAt;
    const tpl = withRng(s, (r) => pickTemplate(s, r, allTemplates(), t));
    if (tpl) spawnIncident(s, tpl);
    const rate = spawnRatePerHour(s, t) / HOUR;
    s.nextSpawnAt = t + Math.max(10_000, withRng(s, (r) => r.exp(rate)));
    n++;
  }
  if (n >= 4 && s.nextSpawnAt < s.now) s.nextSpawnAt = s.now + withRng(s, (r) => r.range(0.5, 2)) * MIN;
}
