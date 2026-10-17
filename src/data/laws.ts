/**
 * Estonian law references used by criminal records (`CriminalRecord.lawId`), incident content
 * and the registry UI. Owned by registry-data.
 *
 * Sources: docs/research/law-references.md + prior knowledge of KarS/LS/KorS/NPALS (2024-2025).
 * Paragraph numbers marked `// unverified` could not be checked against Riigi Teataja in this
 * build (no web access). Ids of unverified entries are semantic where possible so they do not
 * have to change when a number is corrected. Punishments are *typical examples* for generated
 * records, not statutory ranges.
 */
import type { Rng } from '@/sim/rng';
import type { Text } from '@/sim/types';

export type LawAct =
  | 'KarS' // Karistusseadustik
  | 'LS' // Liiklusseadus
  | 'KorS' // Korrakaitseseadus
  | 'NPALS' // Narkootiliste ja psühhotroopsete ainete ning nende lähteainete seadus
  | 'RelvS' // Relvaseadus
  | 'JahiS' // Jahiseadus
  | 'KeskkS' // (reserved) keskkonnaõigus
  | 'VTMS' // Väärteomenetluse seadustik
  | 'LKindlS' // Liikluskindlustuse seadus
  | 'AS' // Alkoholiseadus
  | 'JäätS' // Jäätmeseadus
  | 'TuOS' // Tuleohutuse seadus
  | 'ATKEAS'; // Alkoholi-, tubaka-, kütuse- ja elektriaktsiisi seadus

export type LawTag =
  | 'violence'
  | 'domestic'
  | 'property'
  | 'fraud'
  | 'order'
  | 'traffic'
  | 'drugs'
  | 'weapons'
  | 'official'
  | 'documents'
  | 'environment'
  | 'border'
  | 'sexual'
  | 'minor';

export const LAW_TAGS: readonly LawTag[] = [
  'violence',
  'domestic',
  'property',
  'fraud',
  'order',
  'traffic',
  'drugs',
  'weapons',
  'official',
  'documents',
  'environment',
  'border',
  'sexual',
  'minor',
];

export interface Law {
  id: string; // e.g. 'kars_199'
  act: LawAct;
  para: string; // '§ 199 lg 1'
  title: Text;
  kind: 'crime' | 'misdemeanour';
  /** Typical punishments used for generated records. */
  punishments: Text[];
  /** Tags for generators: 'violence', 'property', 'traffic', 'drugs', 'weapons', 'domestic', 'order'. */
  tags: string[];
  /** 1 = petty misdemeanour … 5 = homicide / terrorism. */
  severity?: number;
  /**
   * Relative frequency for randomly generated background records (≈ Estonian crime statistics).
   * 0 = never picked at random (sexual offences, terrorism), only used explicitly.
   */
  weight?: number;
}

/** Full names of the acts, for tooltips / registry UI. */
export const ACT_NAMES: Record<LawAct, Text> = {
  KarS: { et: 'Karistusseadustik', en: 'Penal Code' },
  LS: { et: 'Liiklusseadus', en: 'Traffic Act' },
  KorS: { et: 'Korrakaitseseadus', en: 'Law Enforcement Act' },
  NPALS: {
    et: 'Narkootiliste ja psühhotroopsete ainete ning nende lähteainete seadus',
    en: 'Narcotic Drugs and Psychotropic Substances and Precursors thereof Act',
  },
  RelvS: { et: 'Relvaseadus', en: 'Weapons Act' },
  JahiS: { et: 'Jahiseadus', en: 'Hunting Act' },
  KeskkS: { et: 'Keskkonnaseadustik', en: 'Environmental Code' },
  VTMS: { et: 'Väärteomenetluse seadustik', en: 'Code of Misdemeanour Procedure' },
  LKindlS: { et: 'Liikluskindlustuse seadus', en: 'Motor Insurance Act' },
  AS: { et: 'Alkoholiseadus', en: 'Alcohol Act' },
  JäätS: { et: 'Jäätmeseadus', en: 'Waste Act' },
  TuOS: { et: 'Tuleohutuse seadus', en: 'Fire Safety Act' },
  ATKEAS: {
    et: 'Alkoholi-, tubaka-, kütuse- ja elektriaktsiisi seadus',
    en: 'Alcohol, Tobacco, Fuel and Electricity Excise Duty Act',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Punishment text builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Value of one trahviühik (fine unit) in euros, KarS § 47 lg 1.
 * unverified: it was 4 € for years; a doubling to 8 € from 2025 was reported but could not be
 * confirmed in this build. Every fine text below is computed from this constant, so change it here.
 */
export const FINE_UNIT_EUR = 8;

const group = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
const eurEt = (n: number) => `${group(n, ' ')} €`;
const eurEn = (n: number) => `€${group(n, ',')}`;

const yearsEt = (y: number) => (y === 1 ? '1 aasta' : `${y} aastat`);
const monthsEt = (m: number) => (m === 1 ? '1 kuu' : `${m} kuud`);
const yearsEn = (y: number) => (y === 1 ? '1 year' : `${y} years`);
const monthsEn = (m: number) => (m === 1 ? '1 month' : `${m} months`);

function spanEt(y: number, m: number): string {
  if (y && m) return `${yearsEt(y)} ${monthsEt(m)}`;
  return y ? yearsEt(y) : monthsEt(m);
}
function spanEn(y: number, m: number): string {
  if (y && m) return `${yearsEn(y)} ${monthsEn(m)}`;
  return y ? yearsEn(y) : monthsEn(m);
}
/** Probation length as an Estonian genitive adjective: "3-aastase", "18-kuulise". */
const probEt = (months: number) => (months % 12 === 0 ? `${months / 12}-aastase` : `${months}-kuulise`);
const probEn = (months: number) => (months % 12 === 0 ? `${months / 12}-year` : `${months}-month`);

/** Bilingual punishment text builders (exported so generators can build custom records). */
export const PUNISH = {
  /** Väärteo rahatrahv in fine units. */
  fine: (units: number): Text => ({
    et: `Rahatrahv ${units} trahviühikut (${eurEt(units * FINE_UNIT_EUR)})`,
    en: `Fine of ${units} fine units (${eurEn(units * FINE_UNIT_EUR)})`,
  }),
  /** Hoiatustrahv (on-the-spot warning fine), fixed euros. */
  warning: (eur: number): Text => ({ et: `Hoiatustrahv ${eurEt(eur)}`, en: `Warning fine ${eurEn(eur)}` }),
  /** Väärteoarest (1-30 days). */
  detention: (days: number): Text => ({
    et: `Arest ${days} ${days === 1 ? 'ööpäev' : 'ööpäeva'}`,
    en: `Detention for ${days} ${days === 1 ? 'day' : 'days'}`,
  }),
  /** Rahaline karistus (criminal fine) in daily rates. */
  criminalFine: (dailyRates: number, rateEur: number): Text => ({
    et: `Rahaline karistus ${dailyRates} päevamäära (${eurEt(dailyRates * rateEur)})`,
    en: `Criminal fine of ${dailyRates} daily rates (${eurEn(dailyRates * rateEur)})`,
  }),
  prison: (y: number, m = 0): Text => ({
    et: `Vangistus ${spanEt(y, m)}`,
    en: `Imprisonment for ${spanEn(y, m)}`,
  }),
  life: (): Text => ({ et: 'Eluaegne vangistus', en: 'Life imprisonment' }),
  /** Tingimisi vangistus (KarS § 73). */
  suspended: (y: number, m: number, probationMonths: number): Text => ({
    et: `${spanEt(y, m)} tingimisi vangistust ${probEt(probationMonths)} katseajaga`,
    en: `Suspended sentence of ${spanEn(y, m)} with a ${probEn(probationMonths)} probation period`,
  }),
  /** Tingimisi vangistus käitumiskontrolliga (KarS § 74). */
  supervised: (y: number, m: number, probationMonths: number): Text => ({
    et: `${spanEt(y, m)} tingimisi vangistust käitumiskontrolliga, katseaeg ${spanEt(Math.floor(probationMonths / 12), probationMonths % 12)}`,
    en: `Suspended sentence of ${spanEn(y, m)} under probation supervision, probation period ${spanEn(Math.floor(probationMonths / 12), probationMonths % 12)}`,
  }),
  /** Partly suspended sentence ("šokivangistus"). */
  partSuspended: (y: number, m: number, serveMonths: number, probationMonths: number): Text => ({
    et: `Vangistus ${spanEt(y, m)}, millest ${monthsEt(serveMonths)} kuulub ärakandmisele, ülejäänu tingimisi ${probEt(probationMonths)} katseajaga`,
    en: `Imprisonment for ${spanEn(y, m)}, of which ${monthsEn(serveMonths)} to be served and the rest suspended with a ${probEn(probationMonths)} probation period`,
  }),
  /** Prison replaced with community service (1 day = 2 hours). */
  community: (months: number): Text => ({
    et: `${monthsEt(months)} vangistust asendatud ${months * 60} tunni üldkasuliku tööga`,
    en: `${monthsEn(months)} of imprisonment replaced with ${months * 60} hours of community service`,
  }),
  electronic: (months: number): Text => ({
    et: `Vangistus ${monthsEt(months)}, asendatud elektroonilise valvega`,
    en: `Imprisonment for ${monthsEn(months)}, served under electronic monitoring`,
  }),
  /** Kriminaalmenetluse lõpetamine otstarbekuse kaalutlusel (KrMS § 202). */
  dropped: (eur: number): Text => ({
    et: `Kriminaalmenetlus lõpetatud otstarbekuse kaalutlusel, ${eurEt(eur)} riigituludesse`,
    en: `Proceedings discontinued for reasons of expediency, ${eurEn(eur)} paid to the state`,
  }),
  licence: (months: number): Text => ({
    et: `Juhtimisõiguse äravõtmine ${months} kuuks`,
    en: `Disqualified from driving for ${monthsEn(months)}`,
  }),
  confiscateVehicle: (): Text => ({ et: 'Sõiduki konfiskeerimine', en: 'Vehicle confiscated' }),
  confiscateWeapon: (): Text => ({ et: 'Relva konfiskeerimine', en: 'Weapon confiscated' }),
  revokePermit: (): Text => ({ et: 'Relvaloa kehtetuks tunnistamine', en: 'Weapon permit revoked' }),
  restraining: (years: number): Text => ({
    et: `Lähenemiskeeld ${years === 1 ? '1 aastaks' : `${years} aastaks`}`,
    en: `Restraining order for ${yearsEn(years)}`,
  }),
  animalBan: (years: number): Text => ({
    et: `Loomapidamise keeld ${years === 1 ? '1 aastaks' : `${years} aastaks`}`,
    en: `Ban on keeping animals for ${yearsEn(years)}`,
  }),
  environmentalDamage: (eur: number): Text => ({
    et: `Keskkonnakahju hüvitamine ${eurEt(eur)}`,
    en: `Environmental damage compensation ${eurEn(eur)}`,
  }),
};

const lowerFirst = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s);

/** Join a main punishment with additional ones: "Rahatrahv …; juhtimisõiguse äravõtmine 6 kuuks". */
export function combine(...parts: Text[]): Text {
  return {
    et: parts.map((p, i) => (i === 0 ? p.et : lowerFirst(p.et))).join('; '),
    en: parts.map((p, i) => (i === 0 ? p.en : lowerFirst(p.en))).join('; '),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The law table
// ─────────────────────────────────────────────────────────────────────────────

const P = PUNISH;
const T = (et: string, en: string): Text => ({ et, en });

function law(
  id: string,
  act: LawAct,
  para: string,
  title: Text,
  kind: Law['kind'],
  tags: LawTag[],
  meta: { sev: number; w: number },
  punishments: Text[],
): Law {
  return { id, act, para, title, kind, tags, severity: meta.sev, weight: meta.w, punishments };
}

const C = 'crime' as const;
const M = 'misdemeanour' as const;

export const LAWS: Law[] = [
  // ── Isikuvastased süüteod ────────────────────────────────────────────────
  law('kars_113', 'KarS', '§ 113', T('Tapmine', 'Manslaughter'), C, ['violence'], { sev: 5, w: 0.3 }, [
    P.prison(8),
    P.prison(10, 6),
    P.prison(13),
  ]),
  law('kars_114', 'KarS', '§ 114', T('Mõrv', 'Murder'), C, ['violence'], { sev: 5, w: 0.1 }, [
    P.prison(16),
    P.prison(19),
    P.life(),
  ]),
  law('kars_25_114', 'KarS', '§ 25 lg 2, § 114', T('Mõrvakatse', 'Attempted murder'), C, ['violence'], { sev: 5, w: 0.15 }, [
    P.prison(6),
    P.prison(8, 6),
    P.prison(11),
  ]),
  law(
    'kars_117',
    'KarS',
    '§ 117',
    T('Ettevaatamatusest surma põhjustamine', 'Negligent homicide'),
    C,
    ['violence'],
    { sev: 4, w: 0.1 },
    [P.suspended(2, 0, 36), P.prison(1, 6), P.partSuspended(3, 0, 4, 36)],
  ),
  law(
    'kars_118',
    'KarS',
    '§ 118 lg 1',
    T('Raske tervisekahjustuse tekitamine', 'Causing serious damage to health'),
    C,
    ['violence'],
    { sev: 4, w: 0.5 },
    [P.prison(4), P.prison(5, 6), P.prison(7)],
  ),
  law(
    'kars_119',
    'KarS',
    '§ 119', // unverified
    T('Ettevaatamatusest raske tervisekahjustuse tekitamine', 'Negligently causing serious damage to health'),
    C,
    ['violence'],
    { sev: 3, w: 0.15 },
    [P.criminalFine(100, 20), P.suspended(1, 0, 24)],
  ),
  law('kars_120', 'KarS', '§ 120 lg 1', T('Ähvardamine', 'Threatening'), C, ['violence'], { sev: 2, w: 2 }, [
    P.criminalFine(50, 15),
    P.suspended(0, 6, 18),
    P.dropped(300),
  ]),
  law(
    'kars_120_2',
    'KarS',
    '§ 120 lg 2', // unverified (aggravated: close relationship)
    T('Ähvardamine lähisuhtes', 'Threatening a person in a close relationship'),
    C,
    ['violence', 'domestic'],
    { sev: 2, w: 1.2 },
    [combine(P.suspended(1, 0, 36), P.restraining(3)), P.supervised(1, 0, 36), P.criminalFine(90, 15)],
  ),
  law('kars_121', 'KarS', '§ 121 lg 1', T('Kehaline väärkohtlemine', 'Physical abuse'), C, ['violence'], { sev: 2, w: 6 }, [
    P.criminalFine(60, 15),
    P.suspended(0, 8, 24),
    P.dropped(400),
    P.community(4),
  ]),
  law(
    'kars_121_2',
    'KarS',
    '§ 121 lg 2 p 2', // unverified (clause number)
    T('Kehaline väärkohtlemine lähisuhtes', 'Physical abuse of a person in a close relationship'),
    C,
    ['violence', 'domestic'],
    { sev: 3, w: 5 },
    [
      combine(P.supervised(1, 6, 36), P.restraining(3)),
      P.suspended(1, 0, 36),
      P.partSuspended(2, 0, 3, 36),
      P.prison(1, 2),
    ],
  ),
  law('kars_133', 'KarS', '§ 133', T('Inimkaubandus', 'Human trafficking'), C, ['violence', 'border'], { sev: 5, w: 0.05 }, [
    P.prison(3),
    P.prison(5, 6),
    P.prison(8),
  ]),
  law(
    'kars_136',
    'KarS',
    '§ 136', // unverified
    T('Isikuvabaduse ebaseaduslik võtmine', 'Unlawful deprivation of liberty'),
    C,
    ['violence'],
    { sev: 4, w: 0.1 },
    [P.suspended(2, 0, 36), P.prison(1, 6), P.prison(3)],
  ),
  law(
    'kars_hostage',
    'KarS',
    '§ 136 lg 2', // unverified (where hostage-taking sits in KarS)
    T('Pantvangi võtmine', 'Hostage-taking'),
    C,
    ['violence', 'weapons'],
    { sev: 5, w: 0.02 },
    [P.prison(6), P.prison(9), P.prison(12)],
  ),
  law('kars_141', 'KarS', '§ 141', T('Vägistamine', 'Rape'), C, ['violence', 'sexual'], { sev: 5, w: 0 }, [
    P.prison(3),
    P.prison(5),
    P.prison(7, 6),
  ]),
  law(
    'kars_153_1',
    'KarS',
    '§ 153¹', // unverified
    T('Seksuaalne ahistamine', 'Sexual harassment'),
    M,
    ['sexual'],
    { sev: 2, w: 0 },
    [P.fine(100), P.fine(200), P.detention(10)],
  ),
  law(
    'kars_157_3',
    'KarS',
    '§ 157³',
    T('Ahistav jälitamine', 'Stalking'),
    C,
    ['violence', 'domestic'],
    { sev: 2, w: 0.6 },
    [P.criminalFine(70, 15), combine(P.suspended(0, 8, 24), P.restraining(2)), P.supervised(1, 0, 30)],
  ),
  law(
    'kars_331_2',
    'KarS',
    '§ 331²',
    T('Lähenemiskeelu rikkumine', 'Violation of a restraining order'),
    C,
    ['domestic', 'order'],
    { sev: 2, w: 1 },
    [P.criminalFine(50, 15), P.suspended(0, 6, 24), P.prison(0, 3)],
  ),

  // ── Varavastased süüteod ─────────────────────────────────────────────────
  law('kars_199', 'KarS', '§ 199 lg 1', T('Vargus', 'Theft'), C, ['property'], { sev: 2, w: 10 }, [
    P.criminalFine(40, 12),
    P.suspended(0, 6, 18),
    P.dropped(300),
    P.community(4),
  ]),
  law(
    'kars_199_2',
    'KarS',
    '§ 199 lg 2',
    T('Vargus ruumi või hoidlasse tungimisega (murdvargus)', 'Theft by breaking into premises (burglary)'),
    C,
    ['property'],
    { sev: 3, w: 4 },
    [P.suspended(1, 0, 36), P.partSuspended(2, 0, 4, 36), P.prison(1, 6), P.electronic(10)],
  ),
  law('kars_200', 'KarS', '§ 200 lg 1', T('Röövimine', 'Robbery'), C, ['property', 'violence'], { sev: 4, w: 1 }, [
    P.prison(2, 6),
    P.prison(4),
    P.partSuspended(3, 0, 8, 48),
  ]),
  law(
    'kars_200_2',
    'KarS',
    '§ 200 lg 2',
    T('Röövimine relva kasutades või grupi poolt', 'Robbery with a weapon or by a group'),
    C,
    ['property', 'violence', 'weapons'],
    { sev: 5, w: 0.4 },
    [P.prison(4), P.prison(6, 6), P.prison(9)],
  ),
  law('kars_201', 'KarS', '§ 201 lg 1', T('Omastamine', 'Embezzlement'), C, ['property', 'fraud'], { sev: 2, w: 1 }, [
    P.criminalFine(100, 20),
    P.suspended(1, 0, 24),
    P.dropped(800),
  ]),
  law(
    'kars_202',
    'KarS',
    '§ 202',
    T('Kuritegelikul teel saadud vara omandamine, hoidmine või turustamine', 'Handling of criminally obtained property'),
    C,
    ['property'],
    { sev: 2, w: 0.6 },
    [P.criminalFine(60, 12), P.suspended(0, 6, 18)],
  ),
  law('kars_203', 'KarS', '§ 203 lg 1', T('Asja kahjustamine', 'Damage to property'), C, ['property'], { sev: 2, w: 2 }, [
    P.criminalFine(40, 12),
    P.dropped(300),
    P.suspended(0, 4, 18),
  ]),
  law(
    'kars_203_arson',
    'KarS',
    '§ 203 lg 2', // unverified (arson charged as damage by a generally dangerous means)
    T('Asja kahjustamine üldohtlikul viisil (süütamine)', 'Damage to property by a generally dangerous means (arson)'),
    C,
    ['property'],
    { sev: 4, w: 0.3 },
    [P.prison(2), P.partSuspended(3, 0, 6, 36), P.suspended(2, 0, 48)],
  ),
  law('kars_209', 'KarS', '§ 209 lg 1', T('Kelmus', 'Fraud'), C, ['fraud', 'property'], { sev: 2, w: 3 }, [
    P.criminalFine(80, 15),
    P.suspended(1, 0, 24),
    P.community(6),
  ]),
  law(
    'kars_210',
    'KarS',
    '§ 210', // unverified
    T('Kindlustuskelmus', 'Insurance fraud'),
    C,
    ['fraud'],
    { sev: 2, w: 0.2 },
    [P.criminalFine(100, 25), P.suspended(0, 10, 24)],
  ),
  law('kars_213', 'KarS', '§ 213 lg 1', T('Arvutikelmus', 'Computer-related fraud'), C, ['fraud'], { sev: 3, w: 2 }, [
    P.criminalFine(120, 15),
    P.suspended(1, 6, 36),
    P.prison(1),
  ]),
  law(
    'kars_214',
    'KarS',
    '§ 214', // unverified
    T('Väljapressimine', 'Extortion'),
    C,
    ['property', 'violence'],
    { sev: 4, w: 0.3 },
    [P.prison(1, 6), P.suspended(2, 0, 36), P.prison(3)],
  ),
  law(
    'kars_215',
    'KarS',
    '§ 215', // unverified
    T('Asja omavoliline kasutamine (sõiduki ärandamine)', 'Unauthorised use of property (taking a vehicle)'),
    C,
    ['property', 'traffic'],
    { sev: 2, w: 0.5 },
    [P.criminalFine(50, 12), P.suspended(0, 6, 18)],
  ),
  law(
    'kars_217',
    'KarS',
    '§ 217', // unverified
    T('Arvutisüsteemi ebaseaduslik kasutamine', 'Illegal use of a computer system'),
    C,
    ['fraud'],
    { sev: 2, w: 0.3 },
    [P.criminalFine(70, 20), P.suspended(0, 8, 24)],
  ),
  law(
    'kars_218',
    'KarS',
    '§ 218',
    T(
      'Varavastane süütegu väheväärtusliku asja või varalise õiguse vastu',
      'Offence against property of low value',
    ),
    M,
    ['property'],
    { sev: 1, w: 8 },
    [P.fine(30), P.fine(60), P.detention(5), P.fine(100)],
  ),
  law(
    'kars_counterfeit',
    'KarS',
    '§ 369', // unverified
    T('Raha võltsimine ja võltsraha kasutamine', 'Counterfeiting and using counterfeit money'),
    C,
    ['fraud', 'documents'],
    { sev: 3, w: 0.1 },
    [P.suspended(1, 0, 36), P.prison(2), P.criminalFine(150, 15)],
  ),

  // ── Avalik kord, riigivõim, õigusemõistmine ─────────────────────────────
  law('kars_262', 'KarS', '§ 262', T('Avaliku korra rikkumine', 'Breach of public order'), M, ['order'], { sev: 1, w: 5 }, [
    P.fine(30),
    P.fine(50),
    P.detention(3),
    P.fine(80),
  ]),
  law(
    'kars_262_112',
    'KarS',
    '§ 262', // unverified (which act punishes hoax emergency calls)
    T('Avaliku korra rikkumine (pahatahtlik valeväljakutse hädaabinumbrile)', 'Breach of public order (malicious hoax call to the emergency number)'),
    M,
    ['order'],
    { sev: 1, w: 0.3 },
    [P.fine(50), P.fine(100), P.detention(5)],
  ),
  law(
    'kars_263',
    'KarS',
    '§ 263',
    T('Avaliku korra raske rikkumine', 'Serious breach of public order'),
    C,
    ['order', 'violence'],
    { sev: 3, w: 1 },
    [P.criminalFine(80, 15), P.suspended(1, 0, 24), P.prison(0, 8)],
  ),
  law(
    'kars_bomb_hoax',
    'KarS',
    '§ 263', // unverified (bomb hoaxes are usually charged as § 263)
    T('Avaliku korra raske rikkumine (valeteade lõhkeseadeldisest)', 'Serious breach of public order (hoax bomb threat)'),
    C,
    ['order'],
    { sev: 3, w: 0.05 },
    [P.suspended(1, 0, 36), P.criminalFine(150, 15), P.community(8)],
  ),
  law(
    'kars_263_1',
    'KarS',
    '§ 263¹', // unverified
    T('Looma julm kohtlemine', 'Cruelty to animals'),
    C,
    ['order', 'environment'],
    { sev: 2, w: 0.2 },
    [P.criminalFine(60, 12), combine(P.suspended(0, 6, 24), P.animalBan(3))],
  ),
  law('kars_237', 'KarS', '§ 237', T('Terroritegu', 'Act of terrorism'), C, ['violence', 'weapons'], { sev: 5, w: 0 }, [
    P.prison(12),
    P.prison(16),
    P.life(),
  ]),
  law(
    'kars_237_threat',
    'KarS',
    '§ 237 lg 3', // unverified
    T('Terroriteo toimepanemisega ähvardamine', 'Threatening to commit an act of terrorism'),
    C,
    ['order', 'weapons'],
    { sev: 4, w: 0 },
    [P.prison(1, 6), P.suspended(2, 0, 48), P.prison(3)],
  ),
  law(
    'kars_274',
    'KarS',
    '§ 274',
    T(
      'Võimuesindaja või muu avalikku korda kaitsva isiku vastu vägivalla kasutamine',
      'Violence against a representative of state authority or another person protecting public order',
    ),
    C,
    ['violence', 'official'],
    { sev: 4, w: 0.6 },
    [P.suspended(1, 0, 36), P.prison(1), P.partSuspended(2, 0, 4, 36), P.criminalFine(120, 15)],
  ),
  law(
    'kars_275',
    'KarS',
    '§ 275', // unverified (still in force? väärtegu?)
    T(
      'Võimuesindaja või muu avalikku korda kaitsva isiku solvamine',
      'Insulting a representative of state authority or another person protecting public order',
    ),
    M,
    ['official', 'order'],
    { sev: 1, w: 0.6 },
    [P.fine(40), P.fine(80), P.detention(5)],
  ),
  law(
    'kars_276',
    'KarS',
    '§ 276', // unverified (task brief suggested § 280)
    T(
      'Vastupanu osutamine võimuesindajale või muule avalikku korda kaitsvale isikule',
      'Resisting a representative of state authority or another person protecting public order',
    ),
    M,
    ['official', 'order'],
    { sev: 2, w: 0.8 },
    [P.fine(60), P.detention(7), P.fine(120)],
  ),
  law(
    'kars_298',
    'KarS',
    '§ 298', // unverified
    T('Altkäemaksu andmine', 'Giving a bribe'),
    C,
    ['official', 'fraud'],
    { sev: 3, w: 0.15 },
    [P.criminalFine(100, 20), P.suspended(1, 0, 24)],
  ),
  law(
    'kars_false_report',
    'KarS',
    '§ 302', // unverified
    T('Teadvalt valekaebuse esitamine', 'Knowingly filing a false accusation'),
    C,
    ['order', 'official'],
    { sev: 2, w: 0.2 },
    [P.criminalFine(50, 12), P.suspended(0, 6, 18)],
  ),
  law(
    'kars_324',
    'KarS',
    '§ 324', // unverified
    T('Vangistusest või kinnipidamiskohast põgenemine', 'Escape from prison or custody'),
    C,
    ['order', 'official'],
    { sev: 3, w: 0.1 },
    [P.prison(1), P.prison(1, 6), P.prison(2)],
  ),
  law(
    'kars_344',
    'KarS',
    '§ 344',
    T('Dokumendi, pitsati või plangi võltsimine', 'Forgery of a document, seal or form'),
    C,
    ['documents', 'fraud'],
    { sev: 2, w: 0.4 },
    [P.criminalFine(60, 15), P.suspended(0, 8, 24)],
  ),
  law(
    'kars_345',
    'KarS',
    '§ 345', // unverified
    T('Võltsitud dokumendi, pitsati või plangi kasutamine', 'Use of a forged document, seal or form'),
    C,
    ['documents'],
    { sev: 2, w: 0.5 },
    [P.criminalFine(40, 12), P.suspended(0, 6, 18), P.dropped(300)],
  ),

  // ── Narkootikumid ────────────────────────────────────────────────────────
  law(
    'kars_183',
    'KarS',
    '§ 183', // unverified
    T(
      'Narkootilise või psühhotroopse aine ebaseaduslik käitlemine väikeses koguses',
      'Illegal handling of narcotic or psychotropic substances in small quantities',
    ),
    C,
    ['drugs'],
    { sev: 3, w: 0.8 },
    [P.criminalFine(80, 12), P.suspended(1, 0, 36), P.community(6)],
  ),
  law(
    'kars_184',
    'KarS',
    '§ 184 lg 1',
    T(
      'Narkootilise või psühhotroopse aine ebaseaduslik käitlemine suures koguses',
      'Illegal handling of narcotic or psychotropic substances in large quantities',
    ),
    C,
    ['drugs'],
    { sev: 4, w: 0.6 },
    [P.prison(2), P.partSuspended(3, 0, 8, 36), P.prison(4, 6)],
  ),
  law(
    'kars_184_2',
    'KarS',
    '§ 184 lg 2', // unverified (aggravated subsection)
    T(
      'Narkootilise aine ebaseaduslik käitlemine suures koguses grupi poolt',
      'Illegal handling of narcotics in large quantities by a group',
    ),
    C,
    ['drugs'],
    { sev: 5, w: 0.2 },
    [P.prison(5), P.prison(7), P.prison(9, 6)],
  ),
  law(
    'kars_185',
    'KarS',
    '§ 185', // unverified
    T(
      'Narkootilise või psühhotroopse aine alaealisele üleandmine',
      'Supplying narcotic or psychotropic substances to a minor',
    ),
    C,
    ['drugs', 'minor'],
    { sev: 4, w: 0.05 },
    [P.prison(2), P.prison(3, 6)],
  ),
  law(
    'npals_15',
    'NPALS',
    '§ 15',
    T(
      'Narkootilise või psühhotroopse aine ebaseaduslik omamine väikeses koguses või tarvitamine',
      'Illegal possession of narcotic or psychotropic substances in small quantities, or their use',
    ),
    M,
    ['drugs'],
    { sev: 1, w: 4 },
    [P.fine(30), P.fine(60), P.detention(5), P.fine(120)],
  ),

  // ── Relvad ───────────────────────────────────────────────────────────────
  law(
    'kars_418',
    'KarS',
    '§ 418', // unverified
    T(
      'Tulirelva, selle olulise osa, laskemoona või lõhkematerjali ebaseaduslik käitlemine',
      'Illegal handling of a firearm, its essential component, ammunition or explosives',
    ),
    C,
    ['weapons'],
    { sev: 3, w: 0.4 },
    [P.criminalFine(100, 15), P.suspended(1, 0, 36), P.prison(1, 6)],
  ),
  law(
    'relvs_handling',
    'RelvS',
    '§ 89', // unverified
    T('Relva või laskemoona käitlemise nõuete rikkumine', 'Violation of the requirements for handling weapons or ammunition'),
    M,
    ['weapons'],
    { sev: 2, w: 0.4 },
    [combine(P.fine(80), P.confiscateWeapon()), P.fine(150), P.detention(5)],
  ),
  law(
    'relvs_drunk',
    'RelvS',
    '§ 90', // unverified
    T('Relva kandmine joobeseisundis', 'Carrying a weapon while intoxicated'),
    M,
    ['weapons'],
    { sev: 2, w: 0.2 },
    [combine(P.fine(100), P.revokePermit()), P.detention(10)],
  ),
  law(
    'relvs_storage',
    'RelvS',
    '§ 91', // unverified
    T('Relva hoidmise nõuete rikkumine', 'Violation of weapon storage requirements'),
    M,
    ['weapons'],
    { sev: 1, w: 0.3 },
    [P.fine(40), P.fine(80)],
  ),

  // ── Piir ja salakaup ─────────────────────────────────────────────────────
  law(
    'kars_258',
    'KarS',
    '§ 258', // unverified
    T('Riigipiiri ebaseaduslik ületamine', 'Illegal crossing of the state border'),
    C,
    ['border'],
    { sev: 3, w: 0.1 },
    [P.criminalFine(60, 10), P.suspended(0, 6, 24), P.prison(0, 8)],
  ),
  law(
    'kars_259',
    'KarS',
    '§ 259', // unverified
    T('Riigipiiri ebaseaduslikule ületamisele kaasaaitamine', 'Facilitating illegal border crossing (migrant smuggling)'),
    C,
    ['border'],
    { sev: 4, w: 0.05 },
    [P.prison(2), P.prison(3, 6)],
  ),
  law(
    'kars_391',
    'KarS',
    '§ 391', // unverified
    T('Salakaubavedu', 'Smuggling'),
    C,
    ['border'],
    { sev: 3, w: 0.3 },
    [P.criminalFine(120, 15), P.suspended(1, 0, 24)],
  ),
  law(
    'kars_392',
    'KarS',
    '§ 392', // unverified
    T('Keelatud kauba või eriliigilise kauba salakaubavedu', 'Smuggling of prohibited or strategic goods'),
    C,
    ['border', 'weapons'],
    { sev: 4, w: 0.1 },
    [P.prison(1, 6), P.partSuspended(3, 0, 6, 36), P.prison(3)],
  ),
  law(
    'atkeas_excise',
    'ATKEAS',
    '§ 69', // unverified
    T('Aktsiisikauba ebaseaduslik käitlemine (salasigaretid, salaalkohol)', 'Illegal handling of excise goods (contraband cigarettes or alcohol)'),
    M,
    ['border'],
    { sev: 1, w: 0.6 },
    [P.fine(40), P.fine(100), P.fine(200)],
  ),

  // ── Keskkond ─────────────────────────────────────────────────────────────
  law(
    'kars_poaching',
    'KarS',
    '§ 364', // unverified
    T('Ebaseaduslik jahipidamine', 'Illegal hunting (poaching)'),
    C,
    ['environment', 'weapons'],
    { sev: 3, w: 0.1 },
    [
      combine(P.criminalFine(100, 15), P.environmentalDamage(3200)),
      combine(P.suspended(1, 0, 24), P.revokePermit(), P.environmentalDamage(6400)),
    ],
  ),
  law(
    'kars_pollution',
    'KarS',
    '§ 365', // unverified
    T('Pinnase, veekogu või õhu saastamine', 'Pollution of soil, water or air'),
    C,
    ['environment'],
    { sev: 3, w: 0.05 },
    [P.criminalFine(150, 20), P.suspended(1, 0, 36)],
  ),
  law(
    'jahis_no_licence',
    'JahiS',
    '§ 66', // unverified
    T('Jahipidamine jahitunnistuse või jahiloata', 'Hunting without a hunting certificate or permit'),
    M,
    ['environment', 'weapons'],
    { sev: 2, w: 0.15 },
    [combine(P.fine(150), P.environmentalDamage(1500)), P.fine(250)],
  ),
  law(
    'jahis_rules',
    'JahiS',
    '§ 65', // unverified
    T('Jahieeskirja rikkumine', 'Violation of hunting rules'),
    M,
    ['environment'],
    { sev: 1, w: 0.2 },
    [P.fine(40), P.fine(100)],
  ),
  law(
    'jaats_littering',
    'JäätS',
    '§ 120', // unverified
    T('Jäätmete ebaseaduslik ladestamine (prügistamine)', 'Illegal dumping of waste (littering)'),
    M,
    ['environment', 'order'],
    { sev: 1, w: 0.5 },
    [P.fine(20), P.fine(50), P.fine(100)],
  ),
  law(
    'tuos_fire',
    'TuOS',
    '§ 46', // unverified
    T('Lahtise tule tegemise nõuete rikkumine', 'Violation of open-fire safety requirements'),
    M,
    ['environment', 'order'],
    { sev: 1, w: 0.2 },
    [P.fine(30), P.fine(80)],
  ),

  // ── Liikluskuriteod ──────────────────────────────────────────────────────
  law(
    'kars_424',
    'KarS',
    '§ 424',
    T(
      'Mootorsõiduki juhtimine joobeseisundis (vähemalt 1,5 promilli)',
      'Driving a motor vehicle while intoxicated (1.5‰ or more)',
    ),
    C,
    ['traffic'],
    { sev: 3, w: 3 },
    [
      combine(P.criminalFine(80, 15), P.licence(12)),
      combine(P.suspended(0, 8, 24), P.licence(18)),
      combine(P.prison(0, 4), P.licence(24), P.confiscateVehicle()),
    ],
  ),
  law(
    'kars_424_rep',
    'KarS',
    '§ 424', // unverified (how the repeat offence is structured)
    T('Mootorsõiduki juhtimine joobeseisundis korduvalt', 'Repeat drink-driving'),
    C,
    ['traffic'],
    { sev: 4, w: 1.2 },
    [
      combine(P.prison(0, 6), P.licence(36), P.confiscateVehicle()),
      combine(P.partSuspended(1, 6, 4, 36), P.licence(36)),
      combine(P.electronic(6), P.licence(24)),
    ],
  ),
  law(
    'kars_422',
    'KarS',
    '§ 422', // unverified
    T(
      'Liiklusohutuse nõuete rikkumine, millega ettevaatamatusest põhjustati raske tervisekahjustus või surm',
      'Breach of traffic safety rules negligently causing serious injury or death',
    ),
    C,
    ['traffic', 'violence'],
    { sev: 4, w: 0.3 },
    [
      combine(P.suspended(2, 0, 36), P.licence(24)),
      combine(P.prison(1, 6), P.licence(36)),
      combine(P.criminalFine(100, 20), P.licence(12)),
    ],
  ),

  // ── Liiklusväärteod ──────────────────────────────────────────────────────
  law(
    'ls_224',
    'LS',
    '§ 224',
    T('Mootorsõiduki juhtimine joobeseisundis', 'Driving a motor vehicle while intoxicated'),
    M,
    ['traffic'],
    { sev: 2, w: 4 },
    [combine(P.fine(150), P.licence(6)), combine(P.fine(250), P.licence(9)), combine(P.detention(10), P.licence(12))],
  ),
  law(
    'ls_224_drugs',
    'LS',
    '§ 224',
    T('Mootorsõiduki juhtimine narkojoobes', 'Driving a motor vehicle under the influence of drugs'),
    M,
    ['traffic', 'drugs'],
    { sev: 2, w: 0.8 },
    [combine(P.fine(200), P.licence(6)), combine(P.detention(7), P.licence(9))],
  ),
  law(
    'ls_201',
    'LS',
    '§ 201', // unverified
    T('Mootorsõiduki juhtimine juhtimisõiguseta isiku poolt', 'Driving a motor vehicle without a driving licence'),
    M,
    ['traffic'],
    { sev: 2, w: 3 },
    [P.fine(80), P.fine(150), P.detention(5)],
  ),
  law(
    'ls_201_ban',
    'LS',
    '§ 201', // unverified
    T('Mootorsõiduki juhtimine juhtimisõiguse äravõtmise ajal', 'Driving while disqualified'),
    M,
    ['traffic'],
    { sev: 3, w: 1 },
    [P.detention(15), P.detention(25), P.fine(300)],
  ),
  law(
    'ls_262_1',
    'LS',
    '§ 262 lg 1',
    T('Lubatud suurima sõidukiiruse ületamine kuni 20 km/h', 'Speeding by up to 20 km/h'),
    M,
    ['traffic'],
    { sev: 1, w: 8 },
    [P.warning(30), P.warning(54), P.fine(15)],
  ),
  law(
    'ls_262_2',
    'LS',
    '§ 262 lg 2',
    T('Lubatud suurima sõidukiiruse ületamine 21-40 km/h', 'Speeding by 21-40 km/h'),
    M,
    ['traffic'],
    { sev: 1, w: 5 },
    [P.fine(40), P.fine(80), P.warning(99)],
  ),
  law(
    'ls_262_3',
    'LS',
    '§ 262 lg 3',
    T('Lubatud suurima sõidukiiruse ületamine 41-60 km/h', 'Speeding by 41-60 km/h'),
    M,
    ['traffic'],
    { sev: 2, w: 1.2 },
    [combine(P.fine(120), P.licence(1)), combine(P.fine(180), P.licence(2)), P.detention(5)],
  ),
  law(
    'ls_262_4',
    'LS',
    '§ 262 lg 4',
    T('Lubatud suurima sõidukiiruse ületamine üle 60 km/h', 'Speeding by more than 60 km/h'),
    M,
    ['traffic'],
    { sev: 3, w: 0.4 },
    [combine(P.detention(10), P.licence(6)), combine(P.fine(300), P.licence(4)), combine(P.detention(20), P.licence(12))],
  ),
  law(
    'ls_red_light',
    'LS',
    '§ 242', // unverified
    T('Valgusfoori keelava tule eiramine', 'Running a red light'),
    M,
    ['traffic'],
    { sev: 1, w: 2 },
    [P.fine(40), P.fine(80), P.fine(120)],
  ),
  law(
    'ls_phone',
    'LS',
    '§ 243', // unverified
    T('Telefoni käeshoidmine ja kasutamine sõidu ajal', 'Using a hand-held phone while driving'),
    M,
    ['traffic'],
    { sev: 1, w: 2 },
    [P.fine(30), P.fine(60), P.fine(100)],
  ),
  law(
    'ls_seatbelt',
    'LS',
    '§ 263', // unverified
    T('Turvavöö kasutamata jätmine', 'Not wearing a seat belt'),
    M,
    ['traffic'],
    { sev: 1, w: 2 },
    [P.warning(30), P.fine(10), P.fine(20)],
  ),
  law(
    'ls_no_inspection',
    'LS',
    '§ 256', // unverified
    T('Korralist tehnoülevaatust mitte läbinud sõiduki juhtimine', 'Driving a vehicle without a valid roadworthiness test'),
    M,
    ['traffic'],
    { sev: 1, w: 1.5 },
    [P.fine(30), P.fine(60), P.warning(60)],
  ),
  law(
    'ls_accident',
    'LS',
    '§ 236', // unverified
    T('Liiklusõnnetuse põhjustamine (varaline kahju)', 'Causing a traffic accident (property damage)'),
    M,
    ['traffic'],
    { sev: 2, w: 1.5 },
    [P.fine(60), combine(P.fine(120), P.licence(2)), P.fine(40)],
  ),
  law(
    'ls_leaving_scene',
    'LS',
    '§ 227', // unverified
    T('Liiklusõnnetuse sündmuskohalt lahkumine', 'Leaving the scene of a traffic accident'),
    M,
    ['traffic'],
    { sev: 2, w: 0.6 },
    [combine(P.fine(150), P.licence(6)), combine(P.detention(10), P.licence(9)), P.detention(15)],
  ),
  law(
    'ls_fleeing',
    'LS',
    '§ 251', // unverified (may now be a KarS crime)
    T('Politseiametniku peatumismärguande eiramine', 'Failing to stop at a police officer’s signal'),
    M,
    ['traffic', 'official'],
    { sev: 3, w: 0.5 },
    [combine(P.detention(15), P.licence(12)), combine(P.fine(300), P.licence(6)), P.detention(25)],
  ),
  law(
    'ls_dui_bicycle',
    'LS',
    '§ 226', // unverified
    T('Jalgratta või kergliikuri juhtimine joobeseisundis', 'Riding a bicycle or e-scooter while intoxicated'),
    M,
    ['traffic'],
    { sev: 1, w: 0.8 },
    [P.fine(20), P.fine(40), P.fine(60)],
  ),
  law(
    'lkindls_no_insurance',
    'LKindlS',
    '§ 69', // unverified
    T('Liikluskindlustuseta sõiduki kasutamine', 'Using a vehicle without motor third-party insurance'),
    M,
    ['traffic'],
    { sev: 1, w: 1.2 },
    [P.fine(40), P.fine(80), P.fine(150)],
  ),

  // ── Korrakaitseseadus, alkohol ───────────────────────────────────────────
  law(
    'kors_54',
    'KorS',
    '§ 54', // unverified
    T('Avalikus kohas käitumise üldnõuete rikkumine', 'Violation of the general rules of conduct in a public place'),
    M,
    ['order'],
    { sev: 1, w: 2 },
    [P.fine(20), P.fine(40), P.fine(60)],
  ),
  law(
    'kors_55',
    'KorS',
    '§ 55', // unverified
    T('Alkohoolse joogi tarbimine avalikus kohas', 'Drinking alcohol in a public place'),
    M,
    ['order'],
    { sev: 1, w: 3 },
    [P.fine(10), P.fine(20), P.fine(40)],
  ),
  law(
    'kors_56',
    'KorS',
    '§ 56', // unverified
    T('Öörahu rikkumine', 'Disturbing the night-time peace'),
    M,
    ['order'],
    { sev: 1, w: 1.5 },
    [P.fine(15), P.fine(30), P.fine(60)],
  ),
  law(
    'as_minor_supply',
    'AS',
    '§ 66', // unverified
    T('Alkohoolse joogi üleandmine alaealisele', 'Supplying alcohol to a minor'),
    M,
    ['minor', 'order'],
    { sev: 1, w: 0.4 },
    [P.fine(50), P.fine(100), P.fine(200)],
  ),
];

/**
 * Alternative ids (from docs/research/law-references.md § 8 and the module brief) that resolve
 * to a canonical entry, so records written with either id render correctly.
 */
export const LAW_ALIASES: Record<string, string> = {
  kars_false_imprisonment: 'kars_136',
  kars_136_2: 'kars_hostage',
  kars_arson: 'kars_203_arson',
  kars_203_2: 'kars_203_arson',
  kars_joyriding: 'kars_215',
  kars_resisting: 'kars_276',
  kars_280: 'kars_276',
  kars_insult: 'kars_275',
  kars_302: 'kars_false_report',
  kars_valeteade: 'kars_false_report',
  kars_escape: 'kars_324',
  kars_drugs_small_supply: 'kars_183',
  kars_weapon: 'kars_418',
  kars_smuggling: 'kars_391',
  kars_smuggling_prohibited: 'kars_392',
  kars_traffic_harm: 'kars_422',
  kars_dui_repeat: 'kars_424_rep',
  kars_stalking: 'kars_157_3',
  kars_restraining: 'kars_331_2',
  kars_terror_threat: 'kars_237_threat',
  kars_animal: 'kars_263_1',
  kars_bribe: 'kars_298',
  ls_262: 'ls_262_2',
  ls_no_licence: 'ls_201',
  ls_dui: 'ls_224',
  lkindls: 'lkindls_no_insurance',
  kors_public_order: 'kors_54',
  kors_public_drinking: 'kors_55',
  kors_night_quiet: 'kors_56',
  relvs_misd: 'relvs_handling',
  jahis_misd: 'jahis_rules',
};

const LAW_INDEX: Record<string, Law> = Object.fromEntries(LAWS.map((l) => [l.id, l]));

export function lawById(id: string): Law | undefined {
  return LAW_INDEX[id] ?? LAW_INDEX[LAW_ALIASES[id] ?? ''];
}

/** "KarS § 121 lg 1" */
export function lawCitation(l: Law): string {
  return `${l.act} ${l.para}`;
}

/** "KarS § 121 lg 1: Kehaline väärkohtlemine" (bilingual). */
export function lawLabel(l: Law): Text {
  const c = lawCitation(l);
  return { et: `${c}: ${l.title.et}`, en: `${c}: ${l.title.en}` };
}

export function lawsByTag(tag: string): Law[] {
  return LAWS.filter((l) => l.tags.includes(tag));
}

export interface LawPickOptions {
  /** Match any of these tags. */
  tags?: string[];
  kind?: Law['kind'];
  minSeverity?: number;
  maxSeverity?: number;
  /** Include weight-0 laws (sexual offences, terrorism) with weight 0.05. */
  includeRare?: boolean;
}

/** Weighted random law for generated criminal records. Falls back to any eligible law. */
export function pickLaw(rng: Rng, o: LawPickOptions = {}): Law {
  const weightOf = (l: Law) => (l.weight ?? 1) || (o.includeRare ? 0.05 : 0);
  const match = (l: Law) =>
    (!o.tags || o.tags.length === 0 || o.tags.some((t) => l.tags.includes(t))) &&
    (!o.kind || l.kind === o.kind) &&
    (o.minSeverity === undefined || (l.severity ?? 1) >= o.minSeverity) &&
    (o.maxSeverity === undefined || (l.severity ?? 1) <= o.maxSeverity) &&
    weightOf(l) > 0;
  let pool = LAWS.filter(match);
  if (pool.length === 0) pool = LAWS.filter((l) => weightOf(l) > 0);
  return rng.weighted(pool, weightOf);
}

/** A typical punishment for a record citing this law. */
export function pickPunishment(rng: Rng, l: Law): Text {
  return rng.pick(l.punishments);
}
