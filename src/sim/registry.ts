/**
 * Andmebaas: registry search (rahvastikuregister / liiklusregister / karistusregister mock),
 * record flags for the UI and the "correct reply" truth for query beats (DESIGN §4.4, §4.10).
 *
 * Owned by engine-systems.
 */
import type { Person, PersonRole, SimState, Text, Vehicle } from './types';
import { isoDate } from './time';

export interface RecordFlag {
  id: string;
  severity: 'info' | 'warn' | 'danger';
  text: Text;
}

const MAX_RESULTS = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────────

const EXTRA_FOLD: Record<string, string> = { ß: 'ss', æ: 'ae', ø: 'o', đ: 'd', ł: 'l', ı: 'i' };

/**
 * Case- and diacritic-insensitive fold: "Õunapuu" → "ounapuu", "Šurõgin" → "surogin",
 * "Žanna" → "zanna". NFKD also folds the 2025 legend's superscript "ᵛᵉʳᶦᶠᶦᵉᵈ" to "verified".
 */
export function foldName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ßæøđłı]/g, (c) => EXTRA_FOLD[c] ?? c)
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plate key for comparisons: upper case, no spaces/dashes ("123 abc" → "123ABC"). */
export function plateKey(s: string): string {
  return s.toUpperCase().replace(/[\s\--.]+/g, '');
}

const today = (now: number) => isoDate(now);
const active = (until: string | undefined, now: number) => !until || until >= today(now);

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

/** `log: false` searches without writing the query log (a co-op client logs through a room command instead). */
export interface SearchOptions {
  log?: boolean;
}

function logQuery(s: SimState, kind: 'person' | 'vehicle', query: string, resultIds: string[], opts?: SearchOptions): void {
  if (opts?.log === false) return;
  s.queries.push({ t: s.now, kind, query, resultIds });
  if (s.queries.length > 500) s.queries.splice(0, s.queries.length - 500);
  s.stats.queries++;
  // Achievement hook: querying one of the 2025 legends.
  if (kind === 'person' && resultIds.some((id) => id.startsWith('legend-'))) s.flags['legendQueried'] = true;
}

/** Search persons by isikukood (exact, 11 digits) or name (case/diacritic-insensitive substring), ≤ 30, relevance-sorted. */
export function searchPersons(s: SimState, q: string, opts?: SearchOptions): Person[] {
  const raw = q.trim();
  if (!raw) return [];
  const digits = raw.replace(/\s/g, '');
  let out: Person[];
  if (/^\d{11}$/.test(digits)) {
    out = Object.values(s.persons).filter((p) => p.idcode === digits);
  } else if (/^\d{5,10}$/.test(digits)) {
    // Partial isikukood prefix (e.g. birth-date part), handy when a unit reads it out slowly.
    out = Object.values(s.persons)
      .filter((p) => p.idcode.startsWith(digits))
      .sort((a, b) => a.idcode.localeCompare(b.idcode))
      .slice(0, MAX_RESULTS);
  } else {
    const tokens = foldName(raw).split(' ').filter(Boolean);
    if (tokens.length === 0) {
      logQuery(s, 'person', raw, [], opts);
      return [];
    }
    const scored: { p: Person; score: number }[] = [];
    for (const p of Object.values(s.persons)) {
      const first = foldName(p.firstName);
      const last = foldName(p.lastName);
      const full = `${first} ${last}`;
      const parts = full.split(' ');
      let score = 0;
      let ok = true;
      for (const t of tokens) {
        if (!full.includes(t)) {
          ok = false;
          break;
        }
        if (parts.includes(t)) score += 30; // whole name part
        else if (parts.some((x) => x.startsWith(t))) score += 18; // prefix
        else score += 6; // substring
      }
      if (!ok) continue;
      const joined = tokens.join(' ');
      if (full === joined || `${last} ${first}` === joined) score += 100;
      if (last === joined) score += 25;
      if (first === joined) score += 15;
      // Tiny bias so dangerous people surface first among equals (dispatchers care).
      if (p.flags.wanted) score += 2;
      scored.push({ p, score });
    }
    scored.sort((a, b) => b.score - a.score || a.p.lastName.localeCompare(b.p.lastName, 'et') || a.p.firstName.localeCompare(b.p.firstName, 'et'));
    out = scored.slice(0, MAX_RESULTS).map((x) => x.p);
  }
  out = out.slice(0, MAX_RESULTS);
  logQuery(
    s,
    'person',
    raw,
    out.map((p) => p.id),
    opts,
  );
  return out;
}

/** Search vehicles by plate (normalised exact or prefix) or VIN (exact, or suffix of ≥ 6 chars). */
export function searchVehicles(s: SimState, q: string, opts?: SearchOptions): Vehicle[] {
  const raw = q.trim();
  if (!raw) return [];
  const key = plateKey(raw);
  const all = Object.values(s.vehicles);
  const exact: Vehicle[] = [];
  const prefix: Vehicle[] = [];
  const vin: Vehicle[] = [];
  for (const v of all) {
    const pk = plateKey(v.plate);
    const vk = v.vin.toUpperCase();
    if (pk === key) exact.push(v);
    else if (key.length >= 2 && pk.startsWith(key)) prefix.push(v);
    else if (vk === key || (key.length >= 6 && vk.endsWith(key))) vin.push(v);
  }
  prefix.sort((a, b) => a.plate.localeCompare(b.plate));
  const out = [...exact, ...vin, ...prefix].slice(0, MAX_RESULTS);
  logQuery(
    s,
    'vehicle',
    raw,
    out.map((v) => v.plate),
    opts,
  );
  return out;
}

/** Find a vehicle by plate regardless of spacing (no query logging). */
export function vehicleByPlate(s: SimState, plate: string): Vehicle | undefined {
  const direct = s.vehicles[plate];
  if (direct) return direct;
  const key = plateKey(plate);
  return Object.values(s.vehicles).find((v) => plateKey(v.plate) === key);
}

// ─────────────────────────────────────────────────────────────────────────────
// Flags
// ─────────────────────────────────────────────────────────────────────────────

const LICENSE_TEXT: Record<'suspended' | 'revoked' | 'none' | 'expired', Text> = {
  suspended: { et: 'JUHTIMISÕIGUS PEATATUD', en: 'DRIVING LICENCE SUSPENDED' },
  revoked: { et: 'JUHTIMISÕIGUS KEHTETU', en: 'DRIVING LICENCE REVOKED' },
  none: { et: 'JUHTIMISÕIGUS PUUDUB', en: 'NO DRIVING LICENCE' },
  expired: { et: 'JUHILUBA AEGUNUD', en: 'DRIVING LICENCE EXPIRED' },
};

/** Ordered record flags (most important first) with bilingual texts. */
export function personFlags(p: Person, now: number): RecordFlag[] {
  const out: RecordFlag[] = [];
  const f = p.flags;
  if (p.id.startsWith('legend-')) out.push({ id: 'legend', severity: 'info', text: { et: 'LEGEND 2025', en: 'LEGEND 2025' } });
  if (f.deceased) out.push({ id: 'deceased', severity: 'info', text: { et: 'SURNUD', en: 'DECEASED' } });
  if (f.wanted) {
    out.push({
      id: 'wanted',
      severity: 'danger',
      text: {
        et: `TAGAOTSITAV: ${f.wanted.reason.et} (${f.wanted.authority}, alates ${fmtDate(f.wanted.since)})`,
        en: `WANTED: ${f.wanted.reason.en} (${f.wanted.authority}, since ${fmtDate(f.wanted.since)})`,
      },
    });
    if (f.wanted.dangerous || f.wanted.armed) {
      out.push({ id: 'armed', severity: 'danger', text: { et: 'RELVASTATUD JA OHTLIK', en: 'ARMED AND DANGEROUS' } });
    }
  }
  if (f.sis) out.push({ id: 'sis', severity: 'danger', text: { et: `SIS-TABAMUS: ${f.sis.et}`, en: `SIS HIT: ${f.sis.en}` } });
  if (f.missing) {
    out.push({
      id: 'missing',
      severity: 'warn',
      text: { et: `KADUNUD ISIK: ${f.missing.text.et} (alates ${fmtDate(f.missing.since)})`, en: `MISSING PERSON: ${f.missing.text.en} (since ${fmtDate(f.missing.since)})` },
    });
  }
  if (f.restrainingOrder && active(f.restrainingOrder.until, now)) {
    out.push({
      id: 'restraining',
      severity: 'warn',
      text: {
        et: `LÄHENEMISKEELD (kaitstav: ${f.restrainingOrder.protectedName}, kuni ${fmtDate(f.restrainingOrder.until)})`,
        en: `RESTRAINING ORDER (protected: ${f.restrainingOrder.protectedName}, until ${fmtDate(f.restrainingOrder.until)})`,
      },
    });
  }
  if (f.probation && active(f.probation.until, now)) {
    out.push({ id: 'probation', severity: 'warn', text: { et: `KATSEAEG (kuni ${fmtDate(f.probation.until)})`, en: `ON PROBATION (until ${fmtDate(f.probation.until)})` } });
  }
  const lic = licenseState(p, now);
  if (lic !== 'valid') out.push({ id: 'license', severity: 'warn', text: LICENSE_TEXT[lic] });
  else if (p.license.probationary) out.push({ id: 'probationary', severity: 'info', text: { et: 'ESMANE JUHILUBA', en: 'PROBATIONARY LICENCE' } });
  if (p.weaponPermit) {
    const valid = active(p.weaponPermit.validUntil, now);
    out.push({
      id: 'weapon',
      severity: valid ? 'warn' : 'info',
      text: valid
        ? { et: `RELVALUBA: ${p.weaponPermit.kind.et}`, en: `FIREARMS PERMIT: ${p.weaponPermit.kind.en}` }
        : { et: 'RELVALUBA AEGUNUD', en: 'FIREARMS PERMIT EXPIRED' },
    });
  }
  if (p.records.length > 0) {
    const crimes = p.records.filter((r) => r.kind === 'crime').length;
    out.push({
      id: 'records',
      severity: crimes > 0 ? 'warn' : 'info',
      text: { et: `KARISTATUD (${p.records.length} ${p.records.length === 1 ? 'kord' : 'korda'})`, en: `PRIOR RECORD (${p.records.length} ${p.records.length === 1 ? 'entry' : 'entries'})` },
    });
  }
  return out;
}

function licenseState(p: Person, now: number): 'valid' | 'suspended' | 'revoked' | 'none' | 'expired' {
  const st = p.license.status;
  if (st === 'valid' && p.license.validUntil && p.license.validUntil < today(now)) return 'expired';
  return st;
}

/**
 * Ordered vehicle flags. `owner` (optional extra) lets the UI show OMANIK TAGAOTSITAV without
 * passing the whole state.
 */
export function vehicleFlags(v: Vehicle, now: number, owner?: Person): RecordFlag[] {
  const out: RecordFlag[] = [];
  if (v.flags.stolen) {
    out.push({
      id: 'stolen',
      severity: 'danger',
      text: { et: `VARASTATUD: ${v.flags.stolen.text.et} (alates ${fmtDate(v.flags.stolen.since)})`, en: `STOLEN: ${v.flags.stolen.text.en} (since ${fmtDate(v.flags.stolen.since)})` },
    });
  }
  if (v.flags.wanted) out.push({ id: 'wanted', severity: 'danger', text: { et: `OTSITAV: ${v.flags.wanted.et}`, en: `WANTED VEHICLE: ${v.flags.wanted.en}` } });
  if (owner?.flags.wanted) out.push({ id: 'ownerwanted', severity: 'danger', text: { et: 'OMANIK TAGAOTSITAV', en: 'OWNER WANTED' } });
  if (v.flags.suspended) out.push({ id: 'suspended', severity: 'warn', text: { et: 'REGISTREERING PEATATUD', en: 'REGISTRATION SUSPENDED' } });
  if (!v.insurance.valid || v.insurance.until < today(now)) out.push({ id: 'noinsurance', severity: 'warn', text: { et: 'KINDLUSTUS PUUDUB', en: 'NO INSURANCE' } });
  if (!v.inspection.valid || v.inspection.until < today(now)) out.push({ id: 'noinspection', severity: 'warn', text: { et: 'ÜLEVAATUS AEGUNUD', en: 'INSPECTION EXPIRED' } });
  return out;
}

/** Vehicle flags with the owner looked up from state. */
export function vehicleFlagsIn(s: SimState, v: Vehicle): RecordFlag[] {
  return vehicleFlags(v, s.now, v.ownerId ? s.persons[v.ownerId] : undefined);
}

/** "2026-10-11" → "11.10.2026" (Estonian date format, DESIGN §8); other strings unchanged. */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

// ─────────────────────────────────────────────────────────────────────────────
// Correct reply (engine truth for query beats)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReplyContext {
  /** Role of the subject in the incident (from the query beat's `subject`). */
  role?: PersonRole;
  /** The query came from a traffic stop / traffic incident. */
  traffic?: boolean;
  incidentId?: string;
}

/** Person reply severity order (DESIGN §4.4). */
export const PERSON_REPLY_ORDER = ['wanted', 'restraining', 'nolicense', 'weapon', 'probation', 'clean'] as const;
/** Vehicle reply severity order. */
export const VEHICLE_REPLY_ORDER = ['stolen', 'ownerwanted', 'suspended', 'noinsurance', 'noinspection', 'clean'] as const;

function drivingContext(s: SimState, personId: string, ctx?: ReplyContext): boolean {
  if (ctx?.role === 'driver' || ctx?.traffic) return true;
  if (ctx?.role) return false;
  const incs = ctx?.incidentId ? [s.incidents[ctx.incidentId]].filter(Boolean) : Object.values(s.incidents);
  return incs.some((inc) => inc.persons.some((r) => r.personId === personId && (r.role === 'driver' || inc.category === 'traffic')));
}

/** Correct radio reply id for a person record (most severe wins). */
export function personReply(s: SimState, p: Person, ctx?: ReplyContext): (typeof PERSON_REPLY_ORDER)[number] {
  const now = s.now;
  if (p.flags.wanted || p.flags.sis) return 'wanted';
  if (p.flags.restrainingOrder && active(p.flags.restrainingOrder.until, now)) return 'restraining';
  if (licenseState(p, now) !== 'valid' && drivingContext(s, p.id, ctx)) return 'nolicense';
  if (p.weaponPermit) return 'weapon';
  if (p.flags.probation && active(p.flags.probation.until, now)) return 'probation';
  return 'clean';
}

/** Correct radio reply id for a vehicle record. A vehicle's own OTSITAV flag counts as 'ownerwanted' (linked to a wanted case). */
export function vehicleReply(s: SimState, v: Vehicle): (typeof VEHICLE_REPLY_ORDER)[number] {
  const now = s.now;
  if (v.flags.stolen) return 'stolen';
  const owner = v.ownerId ? s.persons[v.ownerId] : undefined;
  if (owner?.flags.wanted || v.flags.wanted) return 'ownerwanted';
  if (v.flags.suspended) return 'suspended';
  if (!v.insurance.valid || v.insurance.until < today(now)) return 'noinsurance';
  if (!v.inspection.valid || v.inspection.until < today(now)) return 'noinspection';
  return 'clean';
}

/** Correct radio reply id for a query subject (person id or plate). */
export function correctReply(s: SimState, subject: { personId?: string; plate?: string }, context?: ReplyContext): string {
  if (subject.personId !== undefined) {
    const p = s.persons[subject.personId];
    return p ? personReply(s, p, context) : 'notfound';
  }
  if (subject.plate !== undefined) {
    const v = vehicleByPlate(s, subject.plate);
    return v ? vehicleReply(s, v) : 'notfound';
  }
  return 'notfound';
}
