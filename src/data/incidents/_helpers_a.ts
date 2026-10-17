/**
 * Small builders shared by the violence / domestic / public_order / drugs template files.
 * They only reduce boilerplate: every template still carries its own texts.
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
export const un = (type: UnitType | 'any', count = 1): UnitNeed => ({ type, count });

/**
 * Outcome shorthand. `win` is the inclusive success window; 0 / 1 bounds are left open so the
 * outcome stays eligible at the extremes.
 */
export function oc(
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

// ─── Registry checks ────────────────────────────────────────────────────────

const Q_RADIO: Partial<Record<PersonRole, Text[]>> = {
  suspect: [
    T(
      'Juhtimiskeskus, {callsign}. Palun kontrolli isikut, isikukood {idcode}.',
      'Control, {callsign}. Please run a person check, ID code {idcode}.',
    ),
    T(
      '{callsign}: kontrolli palun isikut {name}, isikukood {idcode}. Kas on tagaotsitav või keelde?',
      '{callsign}: please check {name}, ID code {idcode}. Any warrants or court orders?',
    ),
    T(
      'Juhtimine, {callsign}. Isikul dokumenti kaasas pole, ütleb nimeks {name}. Palun kontrolli andmebaasist.',
      'Control, {callsign}. Subject carries no ID, gives the name {name}. Please run it.',
    ),
    T(
      'Juhtimine, {callsign}. Palun isikupäring, isikukood {idcode}.',
      'Control, {callsign}. Person query please, ID code {idcode}.',
    ),
  ],
  victim: [
    T(
      'Juhtimiskeskus, {callsign}. Kannatanu on {name}, isikukood {idcode}. Palun kontrolli andmeid.',
      'Control, {callsign}. The victim is {name}, ID code {idcode}. Please check the record.',
    ),
    T(
      '{callsign}: kannatanu andmed — {name}, isikukood {idcode}. Kontrolli palun.',
      '{callsign}: victim details — {name}, ID code {idcode}. Please check.',
    ),
  ],
  driver: [
    T(
      'Juhtimiskeskus, {callsign}. Juht on {name}, isikukood {idcode}. Palun kontrolli juhtimisõigust ja keelde.',
      'Control, {callsign}. The driver is {name}, ID code {idcode}. Please check licence and any orders.',
    ),
    T(
      '{callsign}: kontrolli palun juhti {name}, isikukood {idcode}.',
      '{callsign}: please check the driver {name}, ID code {idcode}.',
    ),
  ],
  caller: [
    T(
      'Juhtimine, {callsign}. Teataja on {name}, isikukood {idcode}. Palun kontrolli.',
      'Control, {callsign}. The caller is {name}, ID code {idcode}. Please check.',
    ),
  ],
  witness: [
    T(
      'Juhtimine, {callsign}. Tunnistaja {name}, isikukood {idcode}. Palun kontrolli andmeid.',
      'Control, {callsign}. Witness {name}, ID code {idcode}. Please check the record.',
    ),
  ],
  deceased: [
    T(
      'Juhtimiskeskus, {callsign}. Surnu juurest leiti dokument: {name}, isikukood {idcode}. Palun kontrolli.',
      'Control, {callsign}. An ID was found on the deceased: {name}, ID code {idcode}. Please check.',
    ),
  ],
};

export function qPerson(
  subject: PersonRole,
  at: BeatAt = 'arrive',
  o: { chance?: number; radio?: Text[] } = {},
): QueryBeat {
  const b: QueryBeat = {
    kind: 'query',
    queryType: 'person',
    subject,
    at,
    radio: o.radio ?? Q_RADIO[subject] ?? Q_RADIO.suspect!,
  };
  if (o.chance !== undefined) b.chance = o.chance;
  return b;
}

const QV_RADIO: Text[] = [
  T(
    'Juhtimiskeskus, {callsign}. Palun kontrolli sõidukit, number {plate}.',
    'Control, {callsign}. Please run plate {plate}.',
  ),
  T('{callsign}: palun kontrolli sõidukit {plate} — {car}.', '{callsign}: please run {plate} — {car}.'),
  T(
    'Juhtimine, {callsign}. Palun sõidukipäring: {plate}.',
    'Control, {callsign}. Vehicle query please: {plate}.',
  ),
];

export function qVehicle(at: BeatAt = 'arrive', o: { chance?: number; radio?: Text[] } = {}): QueryBeat {
  const b: QueryBeat = {
    kind: 'query',
    queryType: 'vehicle',
    subject: 'vehicle',
    at,
    radio: o.radio ?? QV_RADIO,
  };
  if (o.chance !== undefined) b.chance = o.chance;
  return b;
}

// ─── Backup / agencies ──────────────────────────────────────────────────────

const BACKUP_RADIO: Partial<Record<UnitType | 'any', Text[]>> = {
  patrol: [
    T(
      '{callsign}: olukord pingeline, vajame lisapatrulli!',
      '{callsign}: situation is tense, we need another patrol!',
    ),
    T(
      'Juhtimine, {callsign}. Isik agressiivne, palun kiiresti lisajõude!',
      'Control, {callsign}. Subject aggressive, requesting backup urgently!',
    ),
  ],
  any: [
    T(
      '{callsign}: vajame kiiresti lisajõude, kõik lähedal olevad ekipaažid!',
      '{callsign}: we need backup fast, all units nearby!',
    ),
    T(
      'Juhtimine, {callsign}. Meid on liiga vähe, palun lisaekipaaži!',
      'Control, {callsign}. We are outnumbered, send another unit!',
    ),
  ],
  rapid: [
    T(
      '{callsign}: vajame kiirreageerijaid, olukord väljub kontrolli alt!',
      '{callsign}: we need rapid response, the situation is getting out of hand!',
    ),
    T(
      'Juhtimine, {callsign}. Palun kiirreageerijad sündmuskohale, oht relva kasutamiseks!',
      'Control, {callsign}. Request rapid response to the scene, possible use of weapons!',
    ),
  ],
  criminal: [
    T(
      '{callsign}: palun kriminaalpolitsei sündmuskohale, vajame uurijat.',
      '{callsign}: please send CID to the scene, we need an investigator.',
    ),
    T(
      'Juhtimine, {callsign}. Sündmuskoht piiratud, ootame kriminaalpolitseid ja ekspertiisi.',
      'Control, {callsign}. Scene cordoned off, waiting for CID and forensics.',
    ),
  ],
  k9: [
    T(
      '{callsign}: kahtlustatav lahkus jalgsi, vajame koerajuhti jälje ajamiseks.',
      '{callsign}: suspect left on foot, we need a dog handler to track.',
    ),
  ],
  community: [
    T(
      '{callsign}: palun piirkonnapolitseinik või noorsoopolitseinik appi, alaealised.',
      '{callsign}: please send a community or youth officer, minors involved.',
    ),
  ],
  special: [
    T(
      '{callsign}: vajame eriüksust, isik barrikadeerunud ja relvastatud!',
      '{callsign}: we need the special unit, subject barricaded and armed!',
    ),
  ],
};

export function backup(
  chance: number | undefined,
  need: UnitNeed,
  o: { at?: BeatAt; timeoutMin?: number; radio?: Text[]; fail?: Effects; ok?: Effects } = {},
): BackupBeat {
  const b: BackupBeat = {
    kind: 'backup',
    at: o.at ?? 2,
    need,
    timeoutMin: o.timeoutMin ?? 5,
    radio: o.radio ?? BACKUP_RADIO[need.type] ?? BACKUP_RADIO.any!,
    failEffects: o.fail ?? { success: -0.25, risk: 0.08, trust: -6 },
    successEffects: o.ok ?? { success: 0.1 },
  };
  if (chance !== undefined && chance < 1) b.chance = chance;
  return b;
}

const AGENCY_RADIO: Partial<Record<Agency, Text[]>> = {
  kiirabi: [
    T(
      '{callsign}: kannatanul vigastused, palun kiirabi sündmuskohale.',
      '{callsign}: the victim is injured, request an ambulance to the scene.',
    ),
    T(
      'Juhtimine, {callsign}. Vajame kiirabi, anname esmaabi.',
      'Control, {callsign}. We need an ambulance, giving first aid.',
    ),
  ],
  paaste: [
    T(
      '{callsign}: vajame päästjaid, uks tuleb avada.',
      '{callsign}: we need rescue, the door has to be opened.',
    ),
  ],
  sotsiaal: [
    T(
      '{callsign}: korteris on alaealised, palun teavitage lastekaitset.',
      '{callsign}: there are minors in the flat, please notify child protection.',
    ),
  ],
  kov: [
    T(
      '{callsign}: palun teavitage omavalitsust, vajame sotsiaaltöötajat.',
      '{callsign}: please notify the municipality, we need a social worker.',
    ),
  ],
};

export function agency(
  ag: Agency,
  at: BeatAt = 'arrive',
  o: { chance?: number; radio?: Text[]; timeoutMin?: number; fail?: Effects; ok?: Effects } = {},
): AgencyBeat {
  const b: AgencyBeat = {
    kind: 'agency',
    agency: ag,
    at,
    timeoutMin: o.timeoutMin ?? 6,
    radio: o.radio ?? AGENCY_RADIO[ag] ?? AGENCY_RADIO.kiirabi!,
    failEffects: o.fail ?? (ag === 'kiirabi' ? { success: -0.2, trust: -4 } : { success: -0.1, trust: -2 }),
  };
  if (o.ok) b.successEffects = o.ok;
  if (o.chance !== undefined && o.chance < 1) b.chance = o.chance;
  return b;
}

export const kiirabi = (
  at: BeatAt = 'arrive',
  o: { chance?: number; radio?: Text[]; timeoutMin?: number } = {},
): AgencyBeat => agency('kiirabi', at, { ...o, ok: { success: 0.05 } });

// ─── Transports ─────────────────────────────────────────────────────────────

function transport(
  dest: TransportBeat['dest'],
  at: BeatAt,
  radio: Text[],
  paperworkMin: [number, number],
  chance?: number,
): TransportBeat {
  const b: TransportBeat = { kind: 'transport', dest, at, radio, paperworkMin };
  if (chance !== undefined && chance < 1) b.chance = chance;
  return b;
}

export const toArrest = (
  at: BeatAt,
  o: { chance?: number; radio?: Text[]; paperwork?: [number, number] } = {},
): TransportBeat =>
  transport(
    'arrest',
    at,
    o.radio ?? [
      T(
        '{callsign}: üks isik kinni peetud, toimetame arestimajja.',
        '{callsign}: one person detained, transporting to the detention house.',
      ),
      T(
        'Juhtimine, {callsign}. Kahtlustatav käeraudades, sõidame arestimajja.',
        'Control, {callsign}. Suspect cuffed, heading to the detention house.',
      ),
    ],
    o.paperwork ?? [15, 30],
    o.chance,
  );

export const toSober = (at: BeatAt, o: { chance?: number; radio?: Text[] } = {}): TransportBeat =>
  transport(
    'arrest',
    at,
    o.radio ?? [
      T(
        '{callsign}: isik tugevas joobes, toimetame kainenema.',
        '{callsign}: subject heavily intoxicated, taking them to sober up.',
      ),
      T(
        'Juhtimine, {callsign}. Joobes isik sõidukis, suundume kainestusse.',
        'Control, {callsign}. Intoxicated person on board, heading to the sobering-up cells.',
      ),
    ],
    [10, 20],
    o.chance,
  );

export const toHospital = (at: BeatAt, o: { chance?: number; radio?: Text[] } = {}): TransportBeat =>
  transport(
    'hospital',
    at,
    o.radio ?? [
      T(
        '{callsign}: isik vajab arstlikku kontrolli, toimetame EMO-sse.',
        '{callsign}: subject needs a medical check, taking them to A&E.',
      ),
    ],
    [20, 40],
    o.chance,
  );

export const toHome = (at: BeatAt, o: { chance?: number; radio?: Text[] } = {}): TransportBeat =>
  transport(
    'home',
    at,
    o.radio ?? [
      T(
        '{callsign}: isik rahunenud, viime ta koju.',
        '{callsign}: subject has calmed down, driving them home.',
      ),
    ],
    [5, 10],
    o.chance,
  );

// ─── Other beats ────────────────────────────────────────────────────────────

export function info(at: BeatAt, radio: Text[], chance?: number): InfoBeat {
  const b: InfoBeat = { kind: 'info', at, radio };
  if (chance !== undefined && chance < 1) b.chance = chance;
  return b;
}

export function search(at: BeatAt, radiusKm: number, radio: Text[], chance?: number): SearchBeat {
  const b: SearchBeat = { kind: 'search', at, radiusKm, radio };
  if (chance !== undefined && chance < 1) b.chance = chance;
  return b;
}

export function pursuit(at: BeatAt, radio: Text[], chance?: number): PursuitBeat {
  const b: PursuitBeat = { kind: 'pursuit', at, radio };
  if (chance !== undefined && chance < 1) b.chance = chance;
  return b;
}

export function escalate(
  at: BeatAt,
  toPriority: Priority,
  radio: Text[],
  o: { chance?: number; need?: UnitNeed; effects?: Effects } = {},
): EscalateBeat {
  const b: EscalateBeat = { kind: 'escalate', at, toPriority, radio };
  if (o.need) b.need = o.need;
  if (o.effects) b.effects = o.effects;
  if (o.chance !== undefined && o.chance < 1) b.chance = o.chance;
  return b;
}

export const opt = (id: string, label: Text, reply: Text, effects: Effects): ChoiceOption => ({
  id,
  label,
  reply,
  effects,
});

export function choice(
  at: BeatAt,
  radio: Text[],
  options: ChoiceOption[],
  defaultOption: string,
  o: { chance?: number; timeoutMin?: number } = {},
): ChoiceBeat {
  const b: ChoiceBeat = { kind: 'choice', at, radio, options, defaultOption, timeoutMin: o.timeoutMin ?? 4 };
  if (o.chance !== undefined && o.chance < 1) b.chance = o.chance;
  return b;
}

/** Standard "suspect fled on foot — send a dog handler?" decision. */
export function k9Choice(at: BeatAt, chance?: number): ChoiceBeat {
  return choice(
    at,
    [
      T(
        '{callsign}: kahtlustatav põgeneb jalgsi {direction}. Kas saadame koerajuhi või jätame?',
        '{callsign}: suspect is fleeing on foot {direction}. Do we send a dog handler or let it go?',
      ),
      T(
        'Juhtimine, {callsign}. Isik jooksis minema, jälg värske. Kas kutsume koera?',
        'Control, {callsign}. Subject ran off, the track is fresh. Do we call in a dog?',
      ),
    ],
    [
      opt(
        'k9',
        T('Saada koerajuht', 'Send a dog handler'),
        T(
          '{callsign}, juhtimine. Koerajuht suunatud, hoidke jälg puutumata.',
          '{callsign}, Control. Dog handler on the way, keep the track clean.',
        ),
        {
          success: 0.15,
          time: 20,
        },
      ),
      opt(
        'leave',
        T('Jäta, vormista sündmus', 'Let it go, document the scene'),
        T(
          '{callsign}, juhtimine. Jälitust ei jätka, vormistage sündmus.',
          '{callsign}, Control. No pursuit, document the scene.',
        ),
        {
          success: -0.1,
          trust: -1,
        },
      ),
    ],
    'leave',
    { chance, timeoutMin: 3 },
  );
}
