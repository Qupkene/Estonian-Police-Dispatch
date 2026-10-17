/**
 * Small constructors shared by the "B" incident files (property, fraud, alarm, environment,
 * border, easter). They only build plain IncidentTemplate data — no logic, no randomness.
 */
import type {
  Agency,
  AgencyBeat,
  BackupBeat,
  BeatAt,
  BeatSpec,
  ChoiceBeat,
  ChoiceOption,
  InfoBeat,
  PursuitBeat,
  QueryBeat,
  SearchBeat,
  TransportBeat,
  Effects,
  OutcomeResult,
  OutcomeSpec,
  PersonRole,
  Text,
  UnitNeed,
  UnitType,
} from '@/sim/types';
import { T } from '@/sim/text';

export { T };

/** Unit need shorthand: u('patrol'), u('any', 2). */
export const u = (type: UnitType | 'any', count = 1): UnitNeed => ({ type, count });

interface OutcomeOpts {
  min?: number;
  max?: number;
  arrests?: number;
  injuries?: number;
  trust?: number;
}

/** Outcome shorthand. `min`/`max` bound the success range in which it is eligible. */
export function oc(id: string, weight: number, result: OutcomeResult, et: string, en: string, o: OutcomeOpts = {}): OutcomeSpec {
  const r: OutcomeSpec = { id, weight, result, text: T(et, en) };
  if (o.min !== undefined) r.minSuccess = o.min;
  if (o.max !== undefined) r.maxSuccess = o.max;
  if (o.arrests !== undefined) r.arrests = o.arrests;
  if (o.injuries !== undefined) r.injuries = o.injuries;
  if (o.trust !== undefined) r.trust = o.trust;
  return r;
}

function withChance<B extends { chance?: number }>(b: B, chance?: number): B {
  if (chance !== undefined && chance < 1) b.chance = chance;
  return b;
}

export const Q_PERSON: Text[] = [
  T('Juhtimiskeskus, {callsign}. Kontrolli isikut: {name}, isikukood {idcode}.', 'Control, {callsign}. Run a person check: {name}, ID code {idcode}.'),
  T('{callsign}, päring: {name}, {idcode}. Kas on tagaotsitav või kehtivaid piiranguid?', '{callsign}, request a check: {name}, {idcode}. Wanted, or any active restrictions?'),
];

export const Q_VEHICLE: Text[] = [
  T('Juhtimiskeskus, {callsign}. Kontrolli sõidukit numbriga {plate}.', 'Control, {callsign}. Check the vehicle with plate {plate}.'),
  T('{callsign}: palun sõidukipäring, {plate}, {car}.', '{callsign}: vehicle check please, {plate}, {car}.'),
];

/** Registry check of a person with the given role. */
export function qPerson(subject: PersonRole, at: BeatAt = 'arrive', chance?: number, radio: Text[] = Q_PERSON): BeatSpec {
  const b: QueryBeat = { kind: 'query', queryType: 'person', subject, at, radio };
  return withChance(b, chance);
}

/** Registry check of the incident vehicle (plate). */
export function qVehicle(at: BeatAt = 'arrive', chance?: number, radio: Text[] = Q_VEHICLE): BeatSpec {
  const b: QueryBeat = { kind: 'query', queryType: 'vehicle', subject: 'vehicle', at, radio };
  return withChance(b, chance);
}

const BACKUP_RADIO: Text[] = [
  T('{callsign}: vajame kiiresti lisaüksust aadressile {address}!', '{callsign}: we need another unit at {address}, urgently!'),
];

interface BackupOpts {
  at?: BeatAt;
  radio?: Text[];
  timeoutMin?: number;
  fail?: Effects;
  ok?: Effects;
}

/** Legacy "Toetust vajab": a unit asks for backup of the given type. */
export function backup(chance: number, need: UnitNeed = u('patrol'), o: BackupOpts = {}): BeatSpec {
  const b: BackupBeat = {
    kind: 'backup',
    at: o.at ?? 3,
    radio: o.radio ?? BACKUP_RADIO,
    need,
    timeoutMin: o.timeoutMin ?? 6,
    failEffects: o.fail ?? { success: -0.25, trust: -6 },
    successEffects: o.ok ?? { success: 0.1 },
  };
  return withChance(b, chance);
}

interface AgencyOpts {
  chance?: number;
  timeoutMin?: number;
  fail?: Effects;
  ok?: Effects;
}

/** Unit asks dispatch to involve another agency through Häirekeskus. */
export function agencyBeat(agency: Agency, at: BeatAt, radio: Text[], o: AgencyOpts = {}): BeatSpec {
  const b: AgencyBeat = {
    kind: 'agency',
    agency,
    at,
    radio,
    timeoutMin: o.timeoutMin ?? 10,
    failEffects: o.fail ?? { success: -0.15, trust: -2 },
    successEffects: o.ok ?? { success: 0.05 },
  };
  return withChance(b, o.chance);
}

const ARREST_RADIO: Text[] = [
  T('{callsign}: isik peeti kinni, toimetame arestimajja.', '{callsign}: person detained, transporting to the arrest house.'),
  T('{callsign}: kahtlustatav kinni peetud, liigume arestimaja suunas.', '{callsign}: suspect detained, heading to the arrest house.'),
];

/** Transport of a detainee to the arrest house. */
export function arrest(at: BeatAt, chance?: number, radio: Text[] = ARREST_RADIO, paperworkMin: [number, number] = [15, 35]): BeatSpec {
  const b: TransportBeat = { kind: 'transport', dest: 'arrest', at, radio, paperworkMin };
  return withChance(b, chance);
}

export function info(at: BeatAt, radio: Text[], chance?: number): BeatSpec {
  const b: InfoBeat = { kind: 'info', at, radio };
  return withChance(b, chance);
}

export function search(at: BeatAt, radiusKm: number, radio: Text[], chance?: number): BeatSpec {
  const b: SearchBeat = { kind: 'search', at, radiusKm, radio };
  return withChance(b, chance);
}

export function pursuit(at: BeatAt, radio: Text[], chance?: number): BeatSpec {
  const b: PursuitBeat = { kind: 'pursuit', at, radio };
  return withChance(b, chance);
}

export function choice(
  at: BeatAt,
  radio: Text[],
  options: ChoiceOption[],
  defaultOption: string,
  timeoutMin = 4,
  chance?: number,
): BeatSpec {
  const b: ChoiceBeat = { kind: 'choice', at, radio, options, defaultOption, timeoutMin };
  return withChance(b, chance);
}

export function opt(id: string, label: Text, reply: Text, effects: Effects): ChoiceOption {
  return { id, label, reply, effects };
}

/** Reusable decision: the detained suspect turns out to be a minor. */
export function minorChoice(at: BeatAt, chance: number, who: Text = T('Kinnipeetu', 'The detainee')): BeatSpec {
  return choice(
    at,
    [
      T(
        `{callsign}: ${who.et} on alaealine — kas kutsume lapsevanema ja teavitame lastekaitset või toimetame jaoskonda?`,
        `{callsign}: ${who.en} is a minor — do we call a parent and notify child protection, or take them to the station?`,
      ),
    ],
    [
      opt(
        'parent',
        T('Lapsevanem + lastekaitse', 'Parent + child protection'),
        T('Kutsuge lapsevanem kohale, teavitame valla lastekaitsetöötajat.', 'Call the parent to the scene; we will notify the municipal child protection worker.'),
        { success: 0.1, time: 15, trust: 2 },
      ),
      opt(
        'station',
        T('Toimeta jaoskonda', 'Take to the station'),
        T('Toimetage alaealine jaoskonda, lapsevanem kutsutakse sinna.', 'Take the minor to the station; the parent will be called there.'),
        { success: -0.05, time: 30 },
      ),
    ],
    'parent',
    5,
    chance,
  );
}
