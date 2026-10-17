/**
 * Pure helpers for the ui-tools panels (Andmebaas, 112, Statistika, Teated, Režissöör).
 * No React / DOM imports here — everything is unit-tested in tests/tools.test.ts.
 */
import type {
  Agency,
  CallerMood,
  CallQuestionId,
  Citizenship,
  Incident,
  IncidentCategory,
  IncidentTemplate,
  Person,
  Priority,
  RadioMsg,
  SimState,
  SpeakerLang,
  Text,
  Vehicle,
} from '@/sim/types';

// ─────────────────────────────────────────────────────────────────────────────
// Safety: the engine lands concurrently — stubs throw. Panels must never crash.
// ─────────────────────────────────────────────────────────────────────────────

export function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Text normalisation & search
// ─────────────────────────────────────────────────────────────────────────────

/** Lower-case, strip diacritics (õ→o, š→s …), collapse whitespace. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plate comparison key: upper-case, no spaces or dashes. */
export function plateKey(s: string): string {
  return s.toUpperCase().replace(/[\s-]+/g, '');
}

/** Display form of a plate: "123abc" → "123 ABC", "abc123" → "ABC 123"; vanity plates kept as is. */
export function formatPlate(raw: string): string {
  const c = raw.toUpperCase().trim().replace(/\s+/g, ' ');
  const k = c.replace(/[\s-]/g, '');
  let m = /^(\d{1,3})([A-ZÕÄÖÜŠŽ]{1,3})$/.exec(k);
  if (m) return `${m[1]} ${m[2]}`;
  m = /^([A-ZÕÄÖÜŠŽ]{1,3})(\d{1,3})$/.exec(k);
  if (m) return `${m[1]} ${m[2]}`;
  return c;
}

export function isIdcodeLike(q: string): boolean {
  return /^\d{11}$/.test(q.replace(/\s/g, ''));
}

/** 17-char VIN (no I, O, Q). */
export function looksLikeVin(q: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(q.replace(/\s/g, '').toUpperCase());
}

/** Fallback person search (used if the engine's searchPersons is not available). */
export function localSearchPersons(persons: Record<string, Person>, q: string, limit = 50): Person[] {
  const raw = q.trim();
  if (!raw) return [];
  const all = Object.values(persons);
  const digits = raw.replace(/\s/g, '');
  if (isIdcodeLike(digits)) return all.filter((p) => p.idcode === digits);
  if (/^\d{4,}$/.test(digits)) return all.filter((p) => p.idcode.startsWith(digits)).slice(0, limit);
  const tokens = fold(raw).split(' ').filter(Boolean);
  return all
    .filter((p) => {
      const hay = fold(`${p.firstName} ${p.lastName}`);
      return tokens.every((tok) => hay.includes(tok));
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'et') || a.firstName.localeCompare(b.firstName, 'et'))
    .slice(0, limit);
}

/** Fallback vehicle search by plate (normalised substring) or VIN (exact / prefix ≥ 6). */
export function localSearchVehicles(vehicles: Record<string, Vehicle>, q: string, limit = 50): Vehicle[] {
  const k = plateKey(q);
  if (!k) return [];
  const all = Object.values(vehicles);
  if (looksLikeVin(k)) return all.filter((v) => v.vin.toUpperCase() === k);
  return all
    .filter((v) => plateKey(v.plate).includes(k) || (k.length >= 6 && v.vin.toUpperCase().startsWith(k)))
    .slice(0, limit);
}

export function vehicleByPlate(s: SimState, plate: string): Vehicle | undefined {
  if (s.vehicles[plate]) return s.vehicles[plate];
  const k = plateKey(plate);
  return Object.values(s.vehicles).find((v) => plateKey(v.plate) === k);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates
// ─────────────────────────────────────────────────────────────────────────────

/** "2026-10-17" → "17.10.2026" (Estonian format). */
export function isoToEt(iso: string | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function ageAt(birthIso: string, now: number): number {
  const b = new Date(birthIso + 'T00:00:00Z');
  const n = new Date(now);
  let age = n.getUTCFullYear() - b.getUTCFullYear();
  const md = n.getUTCMonth() - b.getUTCMonth();
  if (md < 0 || (md === 0 && n.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/** True if a YYYY-MM-DD date lies before `now`. */
export function isExpired(iso: string | undefined, now: number): boolean {
  if (!iso) return false;
  return new Date(iso + 'T23:59:59Z').getTime() < now;
}

/** "mm:ss" for a duration in ms (negative clamps to 0). */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels: citizenship, language, laws
// ─────────────────────────────────────────────────────────────────────────────

export const CITIZENSHIP: Record<Citizenship, { flag: string; name: Text }> = {
  EST: { flag: '🇪🇪', name: { et: 'Eesti', en: 'Estonia' } },
  RUS: { flag: '🇷🇺', name: { et: 'Vene Föderatsioon', en: 'Russian Federation' } },
  UKR: { flag: '🇺🇦', name: { et: 'Ukraina', en: 'Ukraine' } },
  LVA: { flag: '🇱🇻', name: { et: 'Läti', en: 'Latvia' } },
  LTU: { flag: '🇱🇹', name: { et: 'Leedu', en: 'Lithuania' } },
  FIN: { flag: '🇫🇮', name: { et: 'Soome', en: 'Finland' } },
  BLR: { flag: '🇧🇾', name: { et: 'Valgevene', en: 'Belarus' } },
  XXA: { flag: '🏳️', name: { et: 'Määratlemata kodakondsus', en: 'Undetermined citizenship' } },
};

export function citizenshipLabel(c: Citizenship | string, lang: 'et' | 'en'): { flag: string; name: string } {
  const e = CITIZENSHIP[c as Citizenship];
  if (!e) return { flag: '🏳️', name: String(c) };
  return { flag: e.flag, name: e.name[lang] };
}

export const SPEAKER_LANG: Record<SpeakerLang, Text> = {
  et: { et: 'eesti keel', en: 'Estonian' },
  ru: { et: 'vene keel', en: 'Russian' },
  uk: { et: 'ukraina keel', en: 'Ukrainian' },
  en: { et: 'inglise keel', en: 'English' },
  fi: { et: 'soome keel', en: 'Finnish' },
};

const ACT_NAMES: Record<string, string> = {
  kars: 'KarS',
  ls: 'LS',
  kors: 'KorS',
  npals: 'NPALS',
  relvs: 'RelvS',
  jahis: 'JahiS',
  keskks: 'KeskkS',
  vtms: 'VTMS',
};

/** Best-effort "KarS § 199" from a law id like "kars_199" or "kars_199_2" (used if lawById misses). */
export function lawIdLabel(id: string): string {
  const m = /^([a-z]+)_(\d+[a-z0-9]*)(?:_(\d+))?$/i.exec(id);
  if (!m) return id;
  const act = ACT_NAMES[m[1].toLowerCase()] ?? m[1].toUpperCase();
  return `${act} § ${m[2].replace(/(\d)([a-z])/i, '$1$2')}${m[3] ? ` lg ${m[3]}` : ''}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry flags (fallbacks for personFlags / vehicleFlags)
// ─────────────────────────────────────────────────────────────────────────────

export interface FlagLike {
  id: string;
  severity: 'info' | 'warn' | 'danger';
  text: Text;
}

const SEV_RANK = { danger: 0, warn: 1, info: 2 } as const;

export function sortFlags<F extends FlagLike>(flags: F[]): F[] {
  return [...flags].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}

/** "TAGAOTSITAV — põhjus (asutus)" → { head: "TAGAOTSITAV", rest: "põhjus (asutus)" }. */
export function splitFlagText(text: string): { head: string; rest: string } {
  const dash = text.indexOf(' — ');
  if (dash > 0) return { head: text.slice(0, dash).trim(), rest: text.slice(dash + 3).trim() };
  const par = text.indexOf(' (');
  if (par > 0 && text.endsWith(')')) return { head: text.slice(0, par).trim(), rest: text.slice(par + 2, -1).trim() };
  return { head: text.trim(), rest: '' };
}

export function isLegend(p: Pick<Person, 'id'>): boolean {
  return p.id.startsWith('legend-');
}

export function fallbackPersonFlags(p: Person, now: number): FlagLike[] {
  const out: FlagLike[] = [];
  const f = p.flags;
  if (f.deceased) out.push({ id: 'deceased', severity: 'info', text: { et: 'SURNUD', en: 'DECEASED' } });
  if (f.wanted) {
    out.push({ id: 'wanted', severity: 'danger', text: { et: 'TAGAOTSITAV', en: 'WANTED' } });
    if (f.wanted.dangerous || f.wanted.armed)
      out.push({ id: 'armed', severity: 'danger', text: { et: 'RELVASTATUD JA OHTLIK', en: 'ARMED AND DANGEROUS' } });
  }
  if (f.sis) out.push({ id: 'sis', severity: 'danger', text: { et: 'SIS-HOIATUS', en: 'SIS ALERT' } });
  if (f.missing) out.push({ id: 'missing', severity: 'warn', text: { et: 'KADUNUD ISIK', en: 'MISSING PERSON' } });
  if (f.restrainingOrder && !isExpired(f.restrainingOrder.until, now))
    out.push({ id: 'restraining', severity: 'warn', text: { et: 'LÄHENEMISKEELD', en: 'RESTRAINING ORDER' } });
  if (f.probation && !isExpired(f.probation.until, now))
    out.push({ id: 'probation', severity: 'warn', text: { et: 'KATSEAEG', en: 'ON PROBATION' } });
  if (p.license.status === 'suspended' || p.license.status === 'revoked')
    out.push({ id: 'nolicense', severity: 'warn', text: { et: 'JUHTIMISÕIGUS PEATATUD', en: 'DRIVING LICENCE SUSPENDED' } });
  if (p.weaponPermit && !isExpired(p.weaponPermit.validUntil, now))
    out.push({ id: 'weapon', severity: 'info', text: { et: 'RELVALUBA', en: 'WEAPON PERMIT' } });
  return out;
}

export function fallbackVehicleFlags(v: Vehicle, now: number, owner?: Person): FlagLike[] {
  const out: FlagLike[] = [];
  if (v.flags.stolen) out.push({ id: 'stolen', severity: 'danger', text: { et: 'VARASTATUD', en: 'STOLEN' } });
  if (v.flags.wanted) out.push({ id: 'wanted', severity: 'danger', text: { et: 'TAGAOTSITAV SÕIDUK', en: 'WANTED VEHICLE' } });
  if (owner?.flags.wanted) out.push({ id: 'ownerwanted', severity: 'danger', text: { et: 'OMANIK TAGAOTSITAV', en: 'OWNER WANTED' } });
  if (v.flags.suspended)
    out.push({ id: 'suspended', severity: 'warn', text: { et: 'REGISTREERING PEATATUD', en: 'REGISTRATION SUSPENDED' } });
  if (!v.insurance.valid || isExpired(v.insurance.until, now))
    out.push({ id: 'noinsurance', severity: 'warn', text: { et: 'KINDLUSTUS PUUDUB', en: 'NO INSURANCE' } });
  if (!v.inspection.valid || isExpired(v.inspection.until, now))
    out.push({ id: 'noinspection', severity: 'warn', text: { et: 'ÜLEVAATUS KEHTETU', en: 'INSPECTION INVALID' } });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Incidents ↔ records
// ─────────────────────────────────────────────────────────────────────────────

export function isHiddenIncident(s: SimState, inc: Incident): boolean {
  return Boolean(s.flags[`hidden:${inc.id}`]);
}

export function visibleIncidents(s: SimState): Incident[] {
  return s.incidentOrder.map((id) => s.incidents[id]).filter((inc): inc is Incident => !!inc && !isHiddenIncident(s, inc));
}

export function incidentsForPerson(s: SimState, personId: string): Incident[] {
  return visibleIncidents(s)
    .filter((inc) => inc.persons.some((r) => r.personId === personId) || inc.caller?.personId === personId)
    .reverse();
}

export function incidentsForPlate(s: SimState, plate: string): Incident[] {
  const k = plateKey(plate);
  return visibleIncidents(s)
    .filter((inc) => inc.vehicles.some((v) => plateKey(v.plate) === k))
    .reverse();
}

/** Open incidents that reference the record but have not had it checked yet (→ markChecked). */
export function uncheckedLinks(s: SimState, ref: RecordRef): string[] {
  const out: string[] = [];
  for (const inc of visibleIncidents(s)) {
    if (inc.state === 'closed') continue;
    if (ref.personId && inc.persons.some((r) => r.personId === ref.personId && !r.checked)) out.push(inc.id);
    else if (ref.plate) {
      const k = plateKey(ref.plate);
      if (inc.vehicles.some((v) => plateKey(v.plate) === k && !v.checked)) out.push(inc.id);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query beats: which record is an officer asking about?
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordRef {
  personId?: string;
  plate?: string;
}

const PERSON_REPLIES = new Set(['wanted', 'restraining', 'nolicense', 'weapon', 'probation']);
const VEHICLE_REPLIES = new Set(['stolen', 'noinsurance', 'noinspection', 'suspended', 'ownerwanted']);

/** Guess whether a query message is about a person or a vehicle from its reply ids. */
export function queryReplyKind(msg: Pick<RadioMsg, 'replies'>): 'person' | 'vehicle' | null {
  const ids = (msg.replies ?? []).map((r) => r.id);
  if (ids.some((id) => VEHICLE_REPLIES.has(id))) return 'vehicle';
  if (ids.some((id) => PERSON_REPLIES.has(id))) return 'person';
  return null;
}

/** Unanswered messages that expect a reply (fallback for selectors.pendingRadio). */
export function localPendingRadio(s: SimState): RadioMsg[] {
  return s.radio.filter((m) => m.replies && m.replies.length > 0 && !m.answered && (m.expiresAt === undefined || m.expiresAt > s.now));
}

/**
 * Resolve the registry subject of a 'query' radio message:
 *  1. via the beat that created it (incident.beats[].radioId → template beat → subject role),
 *  2. via an isikukood / plate written in the text,
 *  3. via the incident's only person / vehicle of the matching kind.
 */
export function querySubject(
  s: SimState,
  msg: RadioMsg,
  templates: Record<string, IncidentTemplate | undefined>,
): RecordRef | null {
  const inc = msg.incidentId ? s.incidents[msg.incidentId] : undefined;
  if (inc) {
    const beat = inc.beats.find((b) => b.radioId === msg.id);
    const spec = beat ? templates[inc.templateId]?.beats?.[beat.index] : undefined;
    if (spec && spec.kind === 'query') {
      if (spec.queryType === 'vehicle') {
        const v = inc.vehicles.find((x) => x.role === 'suspect') ?? inc.vehicles[0];
        if (v) return { plate: v.plate };
      } else {
        const p = inc.persons.find((x) => x.role === spec.subject);
        if (p) return { personId: p.personId };
      }
    }
  }
  const text = `${msg.text.et} ${msg.text.en}`;
  const code = /\b[1-8]\d{10}\b/.exec(text);
  if (code) {
    const p = Object.values(s.persons).find((x) => x.idcode === code[0]);
    if (p) return { personId: p.id };
  }
  const textKey = plateKey(text);
  const pool = inc ? inc.vehicles.map((v) => v.plate) : Object.keys(s.vehicles);
  const plateHit = pool.find((pl) => plateKey(pl).length >= 4 && textKey.includes(plateKey(pl)));
  if (plateHit) return { plate: plateHit };
  if (inc) {
    const kind = queryReplyKind(msg);
    if (kind === 'vehicle' && inc.vehicles.length === 1) return { plate: inc.vehicles[0].plate };
    if (kind === 'person') {
      const subjects = inc.persons.filter((r) => r.role !== 'caller');
      if (subjects.length === 1) return { personId: subjects[0].personId };
    }
  }
  return null;
}

export function sameRecord(a: RecordRef | null, b: RecordRef): boolean {
  if (!a) return false;
  if (a.personId && b.personId) return a.personId === b.personId;
  if (a.plate && b.plate) return plateKey(a.plate) === plateKey(b.plate);
  return false;
}

/** Pending query messages that are about the given record. */
export function queriesForRecord(
  s: SimState,
  pending: RadioMsg[],
  ref: RecordRef,
  templates: Record<string, IncidentTemplate | undefined>,
): RadioMsg[] {
  return pending.filter((m) => m.kind === 'query' && sameRecord(querySubject(s, m, templates), ref));
}

// ─────────────────────────────────────────────────────────────────────────────
// 112 call taking
// ─────────────────────────────────────────────────────────────────────────────

export const QUESTION_ORDER: CallQuestionId[] = [
  'where',
  'what',
  'injured',
  'weapons',
  'suspect',
  'vehicle',
  'direction',
  'count',
  'when',
  'safe',
  'children',
  'intoxicated',
  'name',
];

/** Facts checklist shown during a call (spec order). */
export const FACTS: CallQuestionId[] = ['where', 'what', 'injured', 'weapons', 'suspect', 'vehicle', 'direction', 'count'];

/** Waveform loudness per mood (0..1) for the background-noise animation. */
export const MOOD_LEVEL: Record<CallerMood, number> = {
  panic: 1,
  angry: 0.85,
  drunk: 0.7,
  child: 0.6,
  confused: 0.55,
  prank: 0.5,
  calm: 0.4,
  elderly: 0.35,
  whisper: 0.15,
};

export const AGENCIES: Agency[] = ['kiirabi', 'paaste', 'kov', 'sotsiaal', 'keskkonnaamet', 'veterinaar', 'transpordiamet', 'merepaaste', 'tolliamet', 'kapo'];

export const PRIORITIES: Priority[] = [1, 2, 3, 4];

/** Typewriter: number of characters visible after `elapsedMs` at `cps` chars/second. */
export function typedChars(len: number, elapsedMs: number, cps = 42): number {
  if (elapsedMs <= 0) return 0;
  return Math.min(len, Math.floor((elapsedMs / 1000) * cps));
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates (director picker)
// ─────────────────────────────────────────────────────────────────────────────

export function templateMatches(t: IncidentTemplate, q: string): boolean {
  const f = fold(q);
  if (!f) return true;
  const hay = fold(`${t.title.et} ${t.title.en} ${t.code} ${t.category} ${t.id}`);
  return f.split(' ').every((tok) => hay.includes(tok));
}

export const CATEGORIES: IncidentCategory[] = [
  'violence',
  'domestic',
  'property',
  'traffic',
  'public_order',
  'drugs',
  'missing',
  'alarm',
  'assist',
  'major',
  'border',
  'environment',
  'fraud',
  'easter',
];

/** Human labels for template placeholders shown in the director preview. */
export const PLACEHOLDER_LABEL: Record<string, Text> = {
  address: { et: 'aadress', en: 'address' },
  place: { et: 'koht', en: 'place' },
  city: { et: 'linn', en: 'city' },
  district: { et: 'linnaosa', en: 'district' },
  callsign: { et: 'kutsung', en: 'callsign' },
  suspect: { et: 'kahtlustatav', en: 'suspect' },
  suspectName: { et: 'kahtlustatava nimi', en: 'suspect name' },
  victim: { et: 'kannatanu', en: 'victim' },
  victimName: { et: 'kannatanu nimi', en: 'victim name' },
  caller: { et: 'teataja', en: 'caller' },
  idcode: { et: 'isikukood', en: 'ID code' },
  name: { et: 'nimi', en: 'name' },
  plate: { et: 'numbrimärk', en: 'plate' },
  car: { et: 'sõiduk', en: 'vehicle' },
  direction: { et: 'suund', en: 'direction' },
  age: { et: 'vanus', en: 'age' },
  n: { et: 'arv', en: 'number' },
  time: { et: 'kellaaeg', en: 'time' },
  agency: { et: 'asutus', en: 'agency' },
};

/** Default SLA minutes (DESIGN §4.5, urban) — used when no incident data yet. */
export const DEFAULT_SLA: Record<Priority, number> = { 1: 10, 2: 20, 3: 45, 4: 120 };
