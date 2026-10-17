/**
 * Radio chatter helpers (engine-core). All routine traffic goes through here so the phrasing
 * stays consistent: units speak with their spoken callsign ("Põhja 21"), the player is 'JK'
 * (juhtimiskeskus), Häirekeskus is 'HK'.
 */
import { AGENCY_NAMES, RADIO } from '@/data/radioPhrases';
import { pushRadio, regionOf } from './internal';
import { withRng } from './rng';
import { fillText, type Vars } from './text';
import { hhmm } from './time';
import type { Agency, Incident, PlaceKind, RadioMsg, RadioReply, SimState, Text, Unit } from './types';

const titleWord = (w: string) => (/^[A-ZÕÄÖÜŠŽ]{3,}$/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w);

/**
 * Spoken callsign: numeric callsigns get the prefecture radio prefix ("21" → "Põhja 21"); all-caps
 * words are spoken in normal case ("PÕHJA LIIKLUS 1" → "Põhja Liiklus 1").
 */
export function spokenCallsign(s: SimState, u: Pick<Unit, 'callsign'>): string {
  const cs = u.callsign.trim();
  const prefix = regionOf(s)?.radioName ?? '';
  if (/^\d/.test(cs)) return prefix ? `${prefix} ${cs}` : cs;
  return cs.split(/\s+/).map(titleWord).join(' ');
}

/** Short form used between crews: without the prefecture prefix ("PÕHJA K1" → "K1", "PÕHJA 32" → "32"). */
export function shortCallsign(s: SimState, u: Pick<Unit, 'callsign'>): string {
  const cs = u.callsign.trim();
  const prefix = (regionOf(s)?.radioName ?? '').toUpperCase();
  let rest = cs;
  if (prefix && cs.toUpperCase().startsWith(prefix + ' ')) rest = cs.slice(prefix.length + 1).trim() || cs;
  return rest.split(/\s+/).map(titleWord).join(' ');
}

/** Short bilingual label for a place kind, used for {place} when the location has no name. */
export const PLACE_KIND_LABEL: Record<PlaceKind, Text> = {
  residential: { et: 'Kortermaja', en: 'Apartment building' },
  house: { et: 'Eramu', en: 'Private house' },
  street: { et: 'Tänav', en: 'Street' },
  bar: { et: 'Baar', en: 'Bar' },
  nightclub: { et: 'Ööklubi', en: 'Nightclub' },
  mall: { et: 'Kaubanduskeskus', en: 'Shopping centre' },
  shop: { et: 'Kauplus', en: 'Shop' },
  bank: { et: 'Pank', en: 'Bank' },
  school: { et: 'Kool', en: 'School' },
  kindergarten: { et: 'Lasteaed', en: 'Kindergarten' },
  university: { et: 'Ülikool', en: 'University' },
  hospital: { et: 'Haigla', en: 'Hospital' },
  park: { et: 'Park', en: 'Park' },
  beach: { et: 'Rand', en: 'Beach' },
  forest: { et: 'Mets', en: 'Forest' },
  lake: { et: 'Järv', en: 'Lake' },
  highway: { et: 'Maantee', en: 'Highway' },
  ruralroad: { et: 'Külatee', en: 'Country road' },
  trainstation: { et: 'Raudteejaam', en: 'Railway station' },
  busstation: { et: 'Bussijaam', en: 'Bus station' },
  port: { et: 'Sadam', en: 'Port' },
  airport: { et: 'Lennujaam', en: 'Airport' },
  stadium: { et: 'Staadion', en: 'Stadium' },
  concert: { et: 'Kontserdipaik', en: 'Concert venue' },
  office: { et: 'Büroohoone', en: 'Office building' },
  industrial: { et: 'Tööstusala', en: 'Industrial area' },
  construction: { et: 'Ehitusplats', en: 'Construction site' },
  parking: { et: 'Parkla', en: 'Car park' },
  hotel: { et: 'Hotell', en: 'Hotel' },
  church: { et: 'Kirik', en: 'Church' },
  cemetery: { et: 'Kalmistu', en: 'Cemetery' },
  gasstation: { et: 'Tankla', en: 'Gas station' },
  government: { et: 'Riigiasutus', en: 'Government building' },
  embassy: { et: 'Saatkond', en: 'Embassy' },
  prison: { et: 'Vangla', en: 'Prison' },
  border: { et: 'Piiripunkt', en: 'Border crossing' },
  farm: { et: 'Talu', en: 'Farm' },
  summerhouse: { et: 'Suvila', en: 'Summer house' },
  village: { et: 'Küla', en: 'Village' },
  oldtown: { et: 'Vanalinn', en: 'Old town' },
  museum: { et: 'Muuseum', en: 'Museum' },
};

/**
 * Generic Estonian nouns that curated places use as their name, with the area in brackets
 * ("Tankla (Paldiski mnt)", "Toidukauplus (Õismäe)"). They are common nouns, not names, so they get
 * an English (and Russian) translation and are lower-cased when spoken inside a sentence.
 */
export const GENERIC_PLACE: Record<string, { en: string; ru: string }> = {
  Aiandusühistu: { en: 'Allotment association', ru: 'садовое товарищество' },
  Baar: { en: 'Bar', ru: 'бар' },
  Büroohoone: { en: 'Office building', ru: 'офисное здание' },
  Ehitusplats: { en: 'Construction site', ru: 'стройка' },
  Festivaliala: { en: 'Festival grounds', ru: 'территория фестиваля' },
  Gümnaasium: { en: 'Secondary school', ru: 'гимназия' },
  Hotell: { en: 'Hotel', ru: 'гостиница' },
  Karaokebaar: { en: 'Karaoke bar', ru: 'караоке-бар' },
  Kaubanduskeskus: { en: 'Shopping centre', ru: 'торговый центр' },
  Kauplus: { en: 'Shop', ru: 'магазин' },
  Kool: { en: 'School', ru: 'школа' },
  Kõrts: { en: 'Tavern', ru: 'корчма' },
  Lasteaed: { en: 'Kindergarten', ru: 'детский сад' },
  Lihatööstus: { en: 'Meat processing plant', ru: 'мясокомбинат' },
  Pank: { en: 'Bank', ru: 'банк' },
  Põhikool: { en: 'School', ru: 'школа' },
  Pubi: { en: 'Pub', ru: 'паб' },
  Saatkond: { en: 'Embassy', ru: 'посольство' },
  Spaahotell: { en: 'Spa hotel', ru: 'спа-отель' },
  Suvilaala: { en: 'Summer cottage area', ru: 'дачный посёлок' },
  Suvilad: { en: 'Summer cottages', ru: 'дачи' },
  Talu: { en: 'Farm', ru: 'хутор' },
  Tankla: { en: 'Petrol station', ru: 'заправка' },
  Toidukauplus: { en: 'Grocery store', ru: 'продуктовый магазин' },
  Turg: { en: 'Market', ru: 'рынок' },
  Ööklubi: { en: 'Nightclub', ru: 'ночной клуб' },
};

/** First words that are common nouns or adjectives, so a caller says them in lower case ("riigipiir, Narva jõe kallas"). */
const SPOKEN_LOWER = new Set(['Riigipiir', 'Endine', 'Lennujaama', 'Piiriületuse']);

/** "Tankla (Paldiski mnt)" → head "Tankla", qualifier "Paldiski mnt"; undefined when the head is not a generic noun. */
function genericParts(name: string | undefined): { head: string; qualifier: string } | undefined {
  const m = /^(\S+) \((.+)\)$/.exec(name ?? '');
  return m && GENERIC_PLACE[m[1]] ? { head: m[1], qualifier: m[2] } : undefined;
}

/** {place}: the place's own name, else a place-kind label (never repeats the address). */
export function placeText(loc: Incident['location']): Text | string {
  const g = genericParts(loc.placeName);
  if (g) return { et: loc.placeName!, en: `${GENERIC_PLACE[g.head].en} (${g.qualifier})` };
  return loc.placeName ?? PLACE_KIND_LABEL[loc.placeKind] ?? loc.address;
}

/**
 * The place as a caller names it inside a sentence: without the bracketed qualifier, generic nouns
 * in lower case ("tankla" / "the petrol station" / "заправка"), proper names as they are (Russian in
 * quotes). Undefined when the location has no name of its own.
 */
export function spokenPlace(loc: Incident['location']): { ru: string; et: string; en: string } | undefined {
  if (!loc.placeName || loc.placeName === loc.address) return undefined;
  const g = genericParts(loc.placeName);
  if (g) {
    const t = GENERIC_PLACE[g.head];
    return { ru: t.ru, et: g.head.toLowerCase(), en: `the ${t.en.toLowerCase()}` };
  }
  const bare = loc.placeName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  // "Varnja alevik, Peipsiääre vald" already says "Varnja": naming it again adds nothing.
  if (loc.address.includes(bare)) return undefined;
  const first = bare.split(/[\s,]/)[0];
  const et = SPOKEN_LOWER.has(first) ? first.toLowerCase() + bare.slice(first.length) : bare;
  return { ru: `«${bare}»`, et, en: bare };
}

/** The place as a caller starts a sentence with it ("Toidukauplus, teisel korrusel…"): no qualifier, capitalised. */
export function spokenPlaceLabel(loc: Incident['location']): Text {
  const g = genericParts(loc.placeName);
  if (g) return { et: g.head, en: GENERIC_PLACE[g.head].en };
  if (loc.placeName && loc.placeName !== loc.address) {
    const bare = loc.placeName.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return { et: bare, en: bare };
  }
  const kind = PLACE_KIND_LABEL[loc.placeKind];
  return kind ?? { et: loc.address, en: loc.address };
}

export function agencyName(a: Agency | string | undefined): Text {
  if (!a) return { et: '', en: '' };
  return AGENCY_NAMES[a] ?? { et: a, en: a };
}

/** Standard variables for a unit/incident pair. */
export function radioVars(s: SimState, u?: Unit, inc?: Incident, extra: Vars = {}): Vars {
  const v: Vars = { time: hhmm(s.now) };
  if (u) {
    v.callsign = spokenCallsign(s, u);
    v.short = shortCallsign(s, u);
  }
  if (inc) {
    v.address = inc.location.address;
    v.place = placeText(inc.location);
    v.city = inc.location.city;
    v.district = inc.location.district ?? inc.location.city;
    v.title = inc.title;
    v.number = inc.number;
  }
  return { ...v, ...extra };
}

/**
 * Pick a phrase variant (deterministically, from the sim RNG) and fill it. Variants that need a
 * value the caller did not give (no {number} without an event, no {n} for a 1-minute ETA) are
 * skipped, so a literal "{number}" never reaches the radio. Always one RNG draw.
 */
export function phrase(s: SimState, key: string, vars: Vars): Text {
  const list = RADIO[key];
  if (!list || list.length === 0) return { et: key, en: key };
  const filled = (t: Text) => [...`${t.et} ${t.en}`.matchAll(/\{(\w+)\}/g)].every((m) => vars[m[1]] !== undefined);
  const usable = list.filter(filled);
  const t = withRng(s, (r) => r.pick(usable.length ? usable : list));
  return fillText(t, vars);
}

/** Fill one of the given variants (template-provided radio lines). */
export function pickFill(s: SimState, list: Text[] | undefined, vars: Vars, fallbackKey?: string): Text {
  if (list && list.length) return fillText(withRng(s, (r) => r.pick(list)), vars);
  return fallbackKey ? phrase(s, fallbackKey, vars) : { et: '', en: '' };
}

type MsgOpts = Partial<Pick<RadioMsg, 'level' | 'kind' | 'replies' | 'expiresAt' | 'to'>>;

/** A unit speaks. */
export function unitSay(s: SimState, u: Unit, text: Text, inc?: Incident, o: MsgOpts = {}): RadioMsg {
  return pushRadio(s, {
    from: u.callsign,
    to: o.to ?? 'JK',
    text,
    level: o.level ?? 'routine',
    kind: o.kind ?? 'status',
    incidentId: inc?.id ?? u.incidentId,
    unitId: u.id,
    replies: o.replies,
    expiresAt: o.expiresAt,
  });
}

/** A unit speaks a stock phrase. */
export function unitPhrase(s: SimState, u: Unit, key: string, inc?: Incident, extra: Vars = {}, o: MsgOpts = {}): RadioMsg {
  return unitSay(s, u, phrase(s, key, radioVars(s, u, inc, extra)), inc, o);
}

/** The dispatcher (JK) speaks to a unit or to everyone. */
export function jkSay(s: SimState, text: Text, o: MsgOpts & { unit?: Unit; inc?: Incident } = {}): RadioMsg {
  return pushRadio(s, {
    from: 'JK',
    to: o.to ?? (o.unit ? o.unit.callsign : undefined),
    text,
    level: o.level ?? 'routine',
    kind: o.kind ?? 'dispatch',
    incidentId: o.inc?.id,
    unitId: o.unit?.id,
    replies: o.replies,
    expiresAt: o.expiresAt,
  });
}

export function jkPhrase(s: SimState, key: string, o: MsgOpts & { unit?: Unit; inc?: Incident; vars?: Vars } = {}): RadioMsg {
  return jkSay(s, phrase(s, key, radioVars(s, o.unit, o.inc, o.vars ?? {})), o);
}

/** Häirekeskus speaks. */
export function hkPhrase(s: SimState, key: string, inc?: Incident, extra: Vars = {}, o: MsgOpts = {}): RadioMsg {
  return pushRadio(s, {
    from: 'HK',
    to: 'JK',
    text: phrase(s, key, radioVars(s, undefined, inc, extra)),
    level: o.level ?? 'routine',
    kind: o.kind ?? 'info',
    incidentId: inc?.id,
    replies: o.replies,
    expiresAt: o.expiresAt,
  });
}

/** Reply buttons for registry checks (ids are fixed, see DESIGN §4.4). */
export const PERSON_REPLIES: RadioReply[] = [
  { id: 'clean', label: { et: 'Puhas, märkeid pole', en: 'Clean, nothing on file' } },
  { id: 'wanted', label: { et: 'Tagaotsitav, pidage kinni', en: 'Wanted, detain' } },
  { id: 'missing', label: { et: 'Kadunuks tunnistatud, otsitav', en: 'Reported missing' } },
  { id: 'restraining', label: { et: 'Kehtib lähenemiskeeld', en: 'Restraining order in force' } },
  { id: 'nolicense', label: { et: 'Juhtimisõigus puudub', en: 'No valid driving licence' } },
  { id: 'weapon', label: { et: 'Relvaluba, ettevaatust', en: 'Firearms permit, caution' } },
  { id: 'probation', label: { et: 'Katseajal', en: 'On probation' } },
  { id: 'notfound', label: { et: 'Registris ei leidu', en: 'Not found in registry' } },
];

export const VEHICLE_REPLIES: RadioReply[] = [
  { id: 'clean', label: { et: 'Sõiduk korras', en: 'Vehicle clean' } },
  { id: 'stolen', label: { et: 'Varastatud, peatage', en: 'Stolen, stop it' } },
  { id: 'noinsurance', label: { et: 'Liikluskindlustus puudub', en: 'No motor insurance' } },
  { id: 'noinspection', label: { et: 'Tehnoülevaatus puudub', en: 'No valid inspection' } },
  { id: 'suspended', label: { et: 'Registreering peatatud', en: 'Registration suspended' } },
  { id: 'ownerwanted', label: { et: 'Omanik tagaotsitav', en: 'Owner is wanted' } },
  { id: 'notfound', label: { et: 'Numbrit ei leidu', en: 'Plate not found' } },
];
