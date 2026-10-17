/**
 * Small builders shared by the traffic / missing / assist / major template files (incidents-C).
 * They only remove boilerplate: every template still carries its own texts and numbers.
 */
import type {
  Agency,
  AgencyBeat,
  BackupBeat,
  BeatAt,
  ChoiceBeat,
  ChoiceOption,
  Effects,
  EscalateBeat,
  InfoBeat,
  OutcomeResult,
  OutcomeSpec,
  PersonRole,
  Priority,
  PursuitBeat,
  QueryBeat,
  SearchBeat,
  Text,
  TransportBeat,
  UnitNeed,
  UnitType,
} from '@/sim/types';
import { T } from '@/sim/text';

export { T };

/** Unit need shorthand. */
export const u = (type: UnitType | 'any', count = 1): UnitNeed => ({ type, count });

/** Legacy "Toetust vajab" failure: call failed, Staatus −6..−8. */
export const LEGACY_FAIL: Effects = { success: -0.3, risk: 0.05, trust: -6 };
const BACKUP_OK: Effects = { success: 0.1 };
const AGENCY_FAIL: Effects = { success: -0.2, trust: -3 };
const AGENCY_OK: Effects = { success: 0.05 };

/**
 * Outcome shorthand. `win` is the inclusive success window; 0 and 1 are left open so the outcome
 * stays eligible at the extremes.
 */
export function out(
  id: string,
  result: OutcomeResult,
  win: [number, number],
  weight: number,
  text: Text,
  extra: Pick<OutcomeSpec, 'arrests' | 'injuries' | 'trust'> = {},
): OutcomeSpec {
  const o: OutcomeSpec = { id, result, weight, text, ...extra };
  if (win[0] > 0) o.minSuccess = win[0];
  if (win[1] < 1) o.maxSuccess = win[1];
  return o;
}

function withChance<B extends { chance?: number }>(b: B, chance: number | undefined): B {
  if (chance !== undefined && chance < 1) b.chance = chance;
  return b;
}

// ─── Registry checks ────────────────────────────────────────────────────────

export const R_DRIVER: Text[] = [
  T('Juhtimiskeskus, {callsign}. Palun kontrolli juhti: {name}, isikukood {idcode}.', 'Control, {callsign}. Please check the driver: {name}, ID code {idcode}.'),
  T('{callsign}: juht on {name}, isikukood {idcode}. Kas juhtimisõigus kehtib, kas on tagaotsitav?', '{callsign}: the driver is {name}, ID code {idcode}. Is the licence valid, any warrants?'),
  T('JK, {callsign}. Juhil dokumente kaasas pole, ütleb end olevat {name}. Kontrolli palun andmebaasist.', 'Control, {callsign}. The driver has no documents, says he is {name}. Please run it.'),
];

export const R_PLATE: Text[] = [
  T('Juhtimiskeskus, {callsign}. Palun kontrolli sõidukit, numbrimärk {plate}, {car}.', 'Control, {callsign}. Please run plate {plate}, {car}.'),
  T('{callsign}: numbrimärk {plate}, {car}. Kas sõiduk on korras, kindlustus ja ülevaatus?', '{callsign}: plate {plate}, {car}. Is the vehicle clear, insurance and inspection?'),
];

export const R_SUSPECT: Text[] = [
  T('Juhtimiskeskus, {callsign}. Palun kontrolli isikut {name}, isikukood {idcode}.', 'Control, {callsign}. Please run {name}, ID code {idcode}.'),
  T('{callsign}: peatasime isiku, ütleb nimeks {name}, isikukood {idcode}. Kas on tagaotsitav?', '{callsign}: we have stopped a person, gives the name {name}, ID code {idcode}. Any warrants?'),
];

export const R_VICTIM: Text[] = [
  T('Juhtimiskeskus, {callsign}. Kannatanu on {name}, isikukood {idcode}. Kontrolli palun andmeid.', 'Control, {callsign}. The casualty is {name}, ID code {idcode}. Please check the record.'),
  T('{callsign}: kannatanu {name}, isikukood {idcode}.', '{callsign}: casualty {name}, ID code {idcode}.'),
];

export const R_MISSING: Text[] = [
  T('Juhtimiskeskus, {callsign}. Leidsime kirjeldusele vastava isiku: {name}, isikukood {idcode}. Palun kontrolli.', 'Control, {callsign}. We have found a person matching the description: {name}, ID code {idcode}. Please check.'),
  T('{callsign}: isik ütleb end olevat {name}, isikukood {idcode}. Kas see on otsitav?', '{callsign}: the person says they are {name}, ID code {idcode}. Is this our missing person?'),
];

export const R_DECEASED: Text[] = [
  T('Juhtimiskeskus, {callsign}. Surnu juurest leiti dokument: {name}, isikukood {idcode}. Palun kontrolli.', 'Control, {callsign}. A document was found with the deceased: {name}, ID code {idcode}. Please check.'),
];

export const R_CALLER: Text[] = [
  T('JK, {callsign}. Teataja on {name}, isikukood {idcode}. Kontrolli palun.', 'Control, {callsign}. The caller is {name}, ID code {idcode}. Please check.'),
];

const Q_DEFAULT: Partial<Record<PersonRole, Text[]>> = {
  driver: R_DRIVER,
  suspect: R_SUSPECT,
  victim: R_VICTIM,
  missing: R_MISSING,
  deceased: R_DECEASED,
  caller: R_CALLER,
  witness: R_CALLER,
};

export function qPerson(subject: PersonRole, at: BeatAt = 'arrive', o: { chance?: number; radio?: Text[] } = {}): QueryBeat {
  const b: QueryBeat = { kind: 'query', queryType: 'person', subject, at, radio: o.radio ?? Q_DEFAULT[subject] ?? R_SUSPECT };
  return withChance(b, o.chance);
}

export function qVehicle(at: BeatAt = 'arrive', o: { chance?: number; radio?: Text[] } = {}): QueryBeat {
  const b: QueryBeat = { kind: 'query', queryType: 'vehicle', subject: 'vehicle', at, radio: o.radio ?? R_PLATE };
  return withChance(b, o.chance);
}

// ─── Backup / agencies / transport ──────────────────────────────────────────

/** Legacy "Toetust vajab": `chance` comes from support_need_chance / 100. */
export function backup(
  chance: number | undefined,
  need: UnitNeed,
  radio: Text[],
  o: { at?: BeatAt; timeoutMin?: number; fail?: Effects; ok?: Effects } = {},
): BackupBeat {
  const b: BackupBeat = {
    kind: 'backup',
    at: o.at ?? 3,
    need,
    timeoutMin: o.timeoutMin ?? 6,
    radio,
    failEffects: o.fail ?? LEGACY_FAIL,
    successEffects: o.ok ?? BACKUP_OK,
  };
  return withChance(b, chance);
}

export function agency(
  ag: Agency,
  radio: Text[],
  o: { at?: BeatAt; chance?: number; timeoutMin?: number; fail?: Effects; ok?: Effects } = {},
): AgencyBeat {
  const b: AgencyBeat = {
    kind: 'agency',
    agency: ag,
    at: o.at ?? 'arrive',
    timeoutMin: o.timeoutMin ?? 5,
    radio,
    failEffects: o.fail ?? AGENCY_FAIL,
    successEffects: o.ok ?? AGENCY_OK,
  };
  return withChance(b, o.chance);
}

export function transport(
  dest: TransportBeat['dest'],
  radio: Text[],
  o: { at?: BeatAt; chance?: number; paperwork?: [number, number] } = {},
): TransportBeat {
  const b: TransportBeat = { kind: 'transport', dest, at: o.at ?? 10, radio, paperworkMin: o.paperwork ?? (dest === 'arrest' ? [15, 30] : [5, 15]) };
  return withChance(b, o.chance);
}

// ─── Flavour, decisions, dynamics ───────────────────────────────────────────

export function info(at: BeatAt, radio: Text[], chance?: number): InfoBeat {
  return withChance<InfoBeat>({ kind: 'info', at, radio }, chance);
}

export function pursuit(at: BeatAt, radio: Text[], chance?: number): PursuitBeat {
  return withChance<PursuitBeat>({ kind: 'pursuit', at, radio }, chance);
}

export function search(at: BeatAt, radiusKm: number, radio: Text[], chance?: number): SearchBeat {
  return withChance<SearchBeat>({ kind: 'search', at, radiusKm, radio }, chance);
}

export function opt(id: string, label: Text, reply: Text, effects: Effects): ChoiceOption {
  return { id, label, reply, effects };
}

export function choice(
  at: BeatAt,
  radio: Text[],
  options: ChoiceOption[],
  defaultOption: string,
  o: { timeoutMin?: number; chance?: number } = {},
): ChoiceBeat {
  const b: ChoiceBeat = { kind: 'choice', at, radio, options, defaultOption, timeoutMin: o.timeoutMin ?? 4 };
  return withChance(b, o.chance);
}

export function escalate(
  at: BeatAt,
  toPriority: Priority,
  radio: Text[],
  o: { need?: UnitNeed; effects?: Effects; chance?: number } = {},
): EscalateBeat {
  const b: EscalateBeat = { kind: 'escalate', at, toPriority, radio };
  if (o.need) b.need = o.need;
  if (o.effects) b.effects = o.effects;
  return withChance(b, o.chance);
}

// ─── Reusable choice: refusal to take a breath test ─────────────────────────

/** "Juht keeldub puhumast. Kas toimetame vereanalüüsile?" */
export function breathRefusal(at: BeatAt, chance = 0.3): ChoiceBeat {
  return choice(
    at,
    [
      T('{callsign}: juht keeldub alkomeetrisse puhumast. Kas toimetame ta joobe tuvastamiseks vereanalüüsile?', '{callsign}: the driver refuses the breath test. Do we take the driver for a blood test to establish intoxication?'),
      T('JK, {callsign}. Juht ei nõustu puhuma ja on ilmselgelt joobes. Kas viime haiglasse vereproovi andma?', 'Control, {callsign}. The driver will not blow and is clearly intoxicated. Do we take the driver to hospital for a blood sample?'),
    ],
    [
      opt('blood', T('Jah, vereanalüüsile', 'Yes, blood test'), T('{callsign}, toimetage juht haiglasse vereanalüüsile, protokoll hiljem.', '{callsign}, take the driver to hospital for a blood test, paperwork afterwards.'), { success: 0.15, time: 25 }),
      opt('clinical', T('Kliiniline hindamine kohapeal', 'Clinical assessment on scene'), T('{callsign}, vormistage keeldumine ja tunnused protokolli, sõiduk teisaldada.', '{callsign}, record the refusal and the signs, have the car towed.'), { success: -0.05, time: 5 }),
    ],
    'blood',
    { chance, timeoutMin: 4 },
  );
}

/** "Jälitatav sõidab linna poole. Kas jätkame või lõpetame jälituse ohutuse huvides?" */
export function pursuitDecision(at: BeatAt, chance = 0.5): ChoiceBeat {
  return choice(
    at,
    [
      T('{callsign}: jälitatav sõidab üle 140 km/h linna poole, ees on ristmikud ja jalakäijad. Kas jätkame?', '{callsign}: the suspect is doing over 140 km/h towards town, junctions and pedestrians ahead. Do we continue?'),
      T('{callsign}: jälitatav eirab punast tuld, liiklus tihe. Jätkame või lõpetame jälituse ohutuse huvides?', '{callsign}: the suspect is running red lights, heavy traffic. Continue, or end the pursuit for safety?'),
    ],
    [
      opt('continue', T('Jätkake jälitust', 'Continue the pursuit'), T('{callsign}, jätkake ettevaatlikult, hoidke vahemaad. Teised ekipaažid sulgevad teed.', '{callsign}, continue with care, keep your distance. Other units will block ahead.'), { success: 0.1, risk: 0.08 }),
      opt('terminate', T('Lõpetage jälitus', 'Terminate the pursuit'), T('{callsign}, lõpetage jälitus, jälgige eemalt. Sõiduk kuulutatakse tagaotsitavaks.', '{callsign}, terminate, observe from a distance. The vehicle will be put on a lookout.'), { success: -0.15, risk: -0.08, trust: -1 }),
    ],
    'continue',
    { chance, timeoutMin: 2 },
  );
}
