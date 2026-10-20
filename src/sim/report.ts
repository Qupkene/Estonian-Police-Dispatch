/**
 * End-of-shift report: score & grade, xp, reputation ("Staatus") and money, highlights and a
 * generated newspaper front page in Estonian police press-release style (bilingual).
 *
 * Owned by engine-systems. Pure w.r.t. the state (reads only).
 */
import { ageOf } from '@/gen/describe';
import { FUEL_PER_KM, OVERTIME_PER_HOUR } from '@/data/economy';
import { dayInfo } from './calendar';
import { helpGivenCount, helpSector } from './colleagues';
import { tplOf } from './internal';
import { PLACE_KIND_LABEL } from './radio';
import { ddmmyyyy, HOUR, MIN, wall } from './time';
import type { Incident, Person, Priority, RegionId, ShiftReport, SimState, Text, Unit } from './types';

const T = (et: string, en: string): Text => ({ et, en });

export const PRIORITY_WEIGHT: Record<Priority, number> = { 1: 3, 2: 2, 3: 1, 4: 0.5 };

/** Grade thresholds (score ≥ value). */
export const GRADE_THRESHOLDS: [ShiftReport['grade'], number][] = [
  ['S', 92],
  ['A', 82],
  ['B', 70],
  ['C', 55],
  ['D', 40],
  ['F', 0],
];

export function gradeOf(score: number): ShiftReport['grade'] {
  for (const [g, min] of GRADE_THRESHOLDS) if (score >= min) return g;
  return 'F';
}

/** The last stretch of a shift (5 %, at most 15 game minutes) counts as served in full. */
export function earlyEndGraceMs(s: Pick<SimState, 'startTime' | 'endTime'>): number {
  return Math.min(15 * MIN, Math.max(0, s.endTime - s.startTime) * 0.05);
}

/**
 * Score multiplier for a shift ended before its end time: half the points at most, and less the
 * earlier it ended (0.5 × the share of the shift served). Without it, closing one easy call and
 * ending the shift at once graded S. Director mode and the tutorial are never penalised.
 */
export function earlyEndFactor(s: Pick<SimState, 'mode' | 'now' | 'startTime' | 'endTime'>): { factor: number; served: number } {
  const len = s.endTime - s.startTime;
  const served = len > 0 ? clamp((s.now - s.startTime) / len, 0, 1) : 1;
  if (s.mode === 'director' || s.mode === 'tutorial' || len <= 0 || s.now >= s.endTime - earlyEndGraceMs(s)) return { factor: 1, served };
  return { factor: 0.5 * served, served };
}

/** Fictional regional mastheads (deliberately not real newspapers). */
export const MASTHEADS: Record<RegionId, string> = {
  pohja: 'Pealinna Kuulutaja',
  ida: 'Viru Valvur',
  louna: 'Lõuna Postipoiss',
  laane: 'Lääne Lainetus',
};

/** Extra data attached to the report for achievements & UI (`(report as ShiftReportX).extras`). */
export interface ReportExtras {
  maxReplyStreak: number;
  legendQueried: boolean;
  pranksCaught: number;
  ruCalls: number;
  /** Resolved incidents per district (or city when no district). */
  resolvedByDistrict: Record<string, number>;
  /** Resolved incidents outside the mainland zone (islands). */
  islandResolved: number;
  resolved: number;
  /** Calendar tags seen during the shift ('jaanipaev', 'newyear', …). */
  dayTags: string[];
  /** Set when the shift was ended before its end time: share served, multiplier and the score before it. */
  earlyEnd?: { served: number; factor: number; rawScore: number };
  night: boolean;
  p1Count: number;
  p1Avg: number | null;
  hours: number;
  /** Calls of the AI colleagues at the neighbouring desks the player's crews reached (src/sim/colleagues.ts); missing: none. */
  helpGiven?: number;
}
export type ShiftReportX = ShiftReport & { extras?: ReportExtras };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round1 = (x: number) => Math.round(x * 10) / 10;

function incidentsOf(s: SimState): Incident[] {
  // Events the neighbouring desk took (a call for help nobody went to, a pursuit handed over) were not the player's.
  return s.incidentOrder
    .map((id) => s.incidents[id])
    .filter((i): i is Incident => !!i && i.source !== 'director' && i.closedBy !== 'director' && i.closedBy !== 'colleague');
}

function isVisible(s: SimState, inc: Incident): boolean {
  return !s.flags[`hidden:${inc.id}`];
}

function responseMin(inc: Incident): number | null {
  return inc.firstArrivalAt !== undefined ? (inc.firstArrivalAt - inc.createdAt) / MIN : null;
}

/** Score 0..100 of one closed incident (engine outcome score, or a closure estimate). */
function incidentScore(inc: Incident): number | null {
  if (inc.outcome) return inc.outcome.score;
  if (inc.state !== 'closed') return null;
  if (inc.closedBy === 'expired') return 0;
  const ok = inc.tags.includes('class:ok') || (inc.closedBy === 'prank' && (inc.falseAlarm || inc.easterEgg)) || (inc.closedBy === 'referral' && inc.referral !== undefined) || inc.truePriority === 4;
  return ok ? 86 : 10;
}

function closureCorrect(inc: Incident): boolean {
  const sc = incidentScore(inc);
  return sc !== null && sc >= 50;
}

const INESSIVE: Record<string, string> = {
  Tallinn: 'Tallinnas',
  Tartu: 'Tartus',
  Narva: 'Narvas',
  Pärnu: 'Pärnus',
  'Kohtla-Järve': 'Kohtla-Järvel',
  Viljandi: 'Viljandis',
  Rakvere: 'Rakveres',
  Maardu: 'Maardus',
  Kuressaare: 'Kuressaares',
  Sillamäe: 'Sillamäel',
  Valga: 'Valgas',
  Võru: 'Võrus',
  Jõhvi: 'Jõhvis',
  Haapsalu: 'Haapsalus',
  Keila: 'Keilas',
  Paide: 'Paides',
  Saue: 'Sauel',
  Elva: 'Elvas',
  Tapa: 'Tapal',
  Põlva: 'Põlvas',
  Jõgeva: 'Jõgeval',
  Rapla: 'Raplas',
  Türi: 'Türil',
  Otepää: 'Otepääl',
  Kärdla: 'Kärdlas',
  'Narva-Jõesuu': 'Narva-Jõesuus',
  Paldiski: 'Paldiskis',
  Kunda: 'Kundas',
  Kiviõli: 'Kiviõlis',
  Lasnamäe: 'Lasnamäel',
  Mustamäe: 'Mustamäel',
  Nõmme: 'Nõmmel',
  Kesklinn: 'Kesklinnas',
  'Põhja-Tallinn': 'Põhja-Tallinnas',
  Kristiine: 'Kristiines',
  Haabersti: 'Haaberstis',
  Pirita: 'Piritas',
  Annelinn: 'Annelinnas',
  Ahtme: 'Ahtmes',
  Kopli: 'Koplis',
  Kalamaja: 'Kalamajas',
  Õismäe: 'Õismäel',
  Lilleküla: 'Lillekülas',
  // City districts whose bare inessive reads oddly next to the town ("Kohtla-Järvel Järvel").
  Järve: 'Järve linnaosas',
  Mai: 'Mai linnaosas',
};

/** Estonian inessive ("Tallinnas", "Lasnamäel") for a place name, via a dictionary + simple rules. */
export function inessive(name: string): string {
  if (!name) return name;
  if (INESSIVE[name]) return INESSIVE[name];
  if (/(mäe|järve|nõmme|pää)$/i.test(name)) return name + 'l';
  if (/ küla$/.test(name) || / vald$/.test(name)) return name.replace(/ küla$/, ' külas').replace(/ vald$/, ' vallas');
  if (/ maakond$/.test(name)) return name.replace(/ maakond$/, ' maakonnas');
  // Consonant stems need their vowel back: "Supilinn" → "Supilinnas", "Rannarajoon" → "Rannarajoonis".
  if (/linn$/.test(name)) return name + 'as';
  if (/rajoon$/.test(name)) return name + 'is';
  return name + 's';
}

/** English form of an Estonian place name: "Harju maakond" → "Harju County", "Saue vald" → "Saue Parish". */
export function placeEn(name: string): string {
  return name.replace(/ maakond\b/g, ' County').replace(/ vald\b/g, ' Parish');
}

/** "a 25-year-old" / "an 18-year-old" / "an 8-year-old": English article by how the number is read. */
export function aAge(age: number): string {
  return /^(8|11|18|8\d)$/.test(String(age)) ? 'an' : 'a';
}

const WEEKDAY_ADE = ['Esmaspäeval', 'Teisipäeval', 'Kolmapäeval', 'Neljapäeval', 'Reedel', 'Laupäeval', 'Pühapäeval'];
const WEEKDAY_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function pressTime(t: number): string {
  const w = wall(t);
  return `${String(w.hour).padStart(2, '0')}.${String(w.minute).padStart(2, '0')}`;
}
function enTime(t: number): string {
  const w = wall(t);
  return `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
}

/**
 * Where it happened, for the press story: the inessive lead ("Tallinnas Põhja-Tallinnas") and the
 * address, plus the English line. The town or district is left out when the address already names
 * it ("Kloogaranna-Türisalu tee, 2. km, Harju maakond" needs no "Harju maakonnas" in front).
 */
export function pressPlace(inc: Incident): { lead: string; address: string; en: string } {
  const loc = inc.location;
  const parts = loc.address.split(/,\s*/);
  const named = (n: string | undefined) => !!n && parts.some((p) => p === n || p === `${n} küla` || p === `${n} alevik` || p === `${n} alev`);
  const city = named(loc.city) ? undefined : loc.city;
  const district = loc.district && loc.district !== loc.city && !named(loc.district) ? loc.district : undefined;
  const lead = [city, district].filter((x): x is string => !!x).map(inessive).join(' ');
  const addrEn = placeEn(loc.address);
  let en: string;
  if (loc.placeKind === 'highway' && city && !/ (vald|maakond)$/.test(city)) en = `${addrEn}, near ${city}`;
  else en = [addrEn, district, city].filter((x): x is string => !!x).map(placeEn).join(', ');
  return { lead, address: loc.address, en };
}

/**
 * Split a summary into sentences without breaking inside ordinals and initials: a sentence ends at
 * . ! or ? followed by a capital (or a quote), never after a lone capital initial ("A. H. Tammsaare").
 * "Saue-Keila maantee, 14. km" stays in one piece because "km" is lower case.
 */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])(?<!(?:^|[\s(„"])[A-ZÕÄÖÜŠŽ]\.)\s+(?=[A-ZÕÄÖÜŠŽ0-9„"“(])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * The first content sentence of an HK summary, without the leading location ("Lasnamäe, Punane tn
 * 16-45." / "Kauplus, Narva mnt 112."), capitalised and without the closing full stop.
 */
export function summaryCore(text: string, inc: Incident): string {
  const loc = inc.location;
  const label = PLACE_KIND_LABEL[loc.placeKind];
  const places = [loc.placeName, label?.et, label?.en, loc.city, loc.district].filter((x): x is string => !!x);
  let rest = text.trim();
  // The location prefix is matched literally, so dots inside the address cannot split it.
  for (const p of [...places.map((x) => `${x}, ${loc.address}`), loc.address]) {
    const m = rest.startsWith(p) ? /^[.:,]?\s+/.exec(rest.slice(p.length)) : null;
    if (m) {
      rest = rest.slice(p.length + m[0].length);
      break;
    }
  }
  const isLoc = (x: string) => {
    const y = x.replace(/[.!?]+$/, '');
    return y === loc.address || y === loc.city || y === loc.district || y === loc.placeName || y.endsWith(`, ${loc.address}`);
  };
  const core = (sentencesOf(rest).find((x) => !isLoc(x)) ?? '').replace(/[.!?]+$/, '').trim();
  return core ? core.charAt(0).toUpperCase() + core.slice(1) : '';
}

function suspectOf(s: SimState, inc: Incident): Person | undefined {
  const ref = inc.persons.find((r) => r.role === 'suspect') ?? inc.persons.find((r) => r.role === 'driver');
  return ref ? s.persons[ref.personId] : undefined;
}

/** "34-aastase mehe" (genitive, object of an active verb) or with `nominative` "34-aastane mees" (passive headline). */
function personNoun(p: Person, now: number, nominative = false): Text {
  let age = 30;
  try {
    age = ageOf(p, now);
  } catch {
    /* default */
  }
  const male = p.gender === 'M';
  // Children and teenagers are not "mees"/"naine": PPA style is "13-aastane poiss", "16-aastane noormees".
  const [nom, gen, en] =
    age >= 18
      ? male
        ? ['mees', 'mehe', 'man']
        : ['naine', 'naise', 'woman']
      : male
        ? age >= 14
          ? ['noormees', 'noormehe', 'boy']
          : ['poiss', 'poisi', 'boy']
        : ['tüdruk', 'tüdruku', 'girl'];
  const et = nominative ? `${age}-aastane ${nom}` : `${age}-aastase ${gen}`;
  return { et, en: `${aAge(age)} ${age}-year-old ${en}` };
}

function outcomeSentence(s: SimState, inc: Incident): Text {
  const parts: Text[] = [];
  const resp = responseMin(inc);
  if (inc.closedBy === 'expired' && inc.firstArrivalAt !== undefined) {
    return T(
      'Patrull käis kohal, kuid lahkus enne, kui sündmus sai lahendatud. Prefektuur analüüsib juhtunut.',
      'A patrol reached the scene but left before the matter was resolved. The prefecture is reviewing what happened.',
    );
  }
  if (inc.closedBy === 'expired') {
    return T(
      'Politseipatrull ei jõudnud kohale enne, kui teataja sündmuskohalt lahkus. Prefektuur analüüsib juhtunut.',
      'No patrol reached the scene before the caller left. The prefecture is reviewing what happened.',
    );
  }
  if (inc.closedBy === 'prank') return T('Tegemist oli valeväljakutsega, valeteate tegijat ootab väärteomenetlus.', 'It was a hoax call; the caller faces misdemeanour proceedings.');
  if (inc.closedBy === 'referral') return T('Teade edastati pädevale asutusele.', 'The report was passed on to the competent agency.');
  if (inc.closedBy === 'phone') return T('Teatajat nõustati telefoni teel.', 'The caller was advised over the phone.');
  if (inc.closedBy === 'duplicate') return T('Sama sündmuse kohta oli laekunud ka teisi teateid.', 'Other reports about the same event had also come in.');
  if (resp !== null && resp > 0) {
    const m = Math.max(1, Math.round(resp));
    parts.push(T(`Patrull jõudis kohale ${m} minutiga.`, `A patrol arrived within ${m} ${m === 1 ? 'minute' : 'minutes'}.`));
  }
  const o = inc.outcome;
  // Somebody was caught after all: no "the suspect left before police arrived" afterwards.
  const caught = (o?.arrests ?? 0) > 0 || !!inc.search?.found || inc.pursuit?.ended === 'caught';
  if (inc.pursuit?.ended) {
    const p = inc.pursuit.ended;
    parts.push(
      p === 'caught'
        ? T('Juht eiras politseinike peatumismärguannet, kuid jälitus lõppes kinnipidamisega.', 'The driver ignored the officers’ signal to stop, but the pursuit ended in an arrest.')
        : p === 'crashed'
          ? T('Juht eiras peatumismärguannet, kaotas jälitamise käigus sõiduki üle kontrolli ja sõitis teelt välja.', 'The driver ignored the signal to stop, lost control during the pursuit and left the road.')
          : p === 'terminated'
            ? T('Ohutuse huvides jälitus katkestati.', 'The pursuit was called off for safety reasons.')
            : caught
              ? T('Peatumismärguannet eiranud juht pääses esialgu põgenema, kuid tabati hiljem.', 'The driver who ignored the signal to stop got away at first but was caught later.')
              : T('Peatumismärguannet eiranud juht pääses põgenema.', 'The driver who ignored the signal to stop got away.'),
    );
  }
  if (inc.search?.found) parts.push(inc.category === 'missing' ? T('Otsingute käigus leiti isik elusana.', 'The person was found alive during the search.') : T('Kahtlustatav tabati piirkonna läbikammimisel.', 'The suspect was found while the area was being searched.'));
  const sus = suspectOf(s, inc);
  if (o) {
    if (o.arrests > 0 && sus) {
      const n = personNoun(sus, s.now);
      parts.push(T(`Politsei pidas kahtlustatavana kinni ${n.et}.`, `Police detained ${n.en} as a suspect.`));
    } else if (o.arrests > 1) parts.push(T(`Politsei pidas kinni ${o.arrests} inimest.`, `Police detained ${o.arrests} people.`));
    switch (o.result) {
      case 'report':
        parts.push(T('Politsei alustas kriminaalmenetlust.', 'Police opened criminal proceedings.'));
        break;
      case 'fine':
        parts.push(T('Rikkujat karistati rahatrahviga.', 'The offender was fined.'));
        break;
      case 'warning':
        parts.push(T('Politsei tegi rikkujale hoiatuse.', 'Police issued a warning.'));
        break;
      case 'hospital':
        parts.push(
          inc.category === 'missing'
            ? T('Leitud isik toimetati kontrolliks haiglasse.', 'The person who was found was taken to hospital for a check-up.')
            : T('Kannatanu toimetati haiglasse.', 'The injured person was taken to hospital.'),
        );
        break;
      case 'tragedy':
        parts.push(T('Hoolimata kiirest reageerimisest ei õnnestunud inimelu päästa. Sündmuse täpsed asjaolud selgitatakse menetluse käigus.', 'Despite a rapid response, a life could not be saved. The exact circumstances will be established in the investigation.'));
        break;
      case 'false_alarm':
      case 'unfounded':
        parts.push(T('Teade ei leidnud kinnitust.', 'The report could not be confirmed.'));
        break;
      case 'escaped':
        if (caught) break;
        parts.push(
          inc.pursuit?.ended
            ? T('Politsei selgitab põgenenud juhi isikut.', 'Police are working to identify the driver who fled.')
            : T('Kahtlustatav lahkus enne politsei saabumist, politsei selgitab tema isikut.', 'The suspect left before police arrived; police are working to identify them.'),
        );
        break;
      case 'referred':
        parts.push(T('Juhtum anti üle pädevale asutusele.', 'The case was handed over to the competent agency.'));
        break;
      case 'arrest':
        if (!(o.arrests > 0 && sus)) parts.push(T('Kahtlustatav peeti kinni ja toimetati arestimajja.', 'The suspect was detained and taken to the arrest house.'));
        break;
      default:
        if (!(inc.search?.found && inc.category === 'missing')) parts.push(T('Olukord lahendati kohapeal.', 'The situation was resolved on the spot.'));
    }
  }
  if (parts.length === 0) parts.push(T('Sündmuse asjaolusid selgitatakse.', 'The circumstances are being established.'));
  return { et: parts.map((p) => p.et).join(' '), en: parts.map((p) => p.en).join(' ') };
}

const ADVICE: Partial<Record<Incident['category'], Text>> = {
  domestic: T('Politsei tuletab meelde, et lähisuhtevägivalla korral tuleb kohe helistada hädaabinumbril 112.', 'Police remind everyone to call 112 immediately in cases of domestic violence.'),
  traffic: T('Politsei tuletab meelde, et joobes juhtimine on kuritegu ning ohustab kõiki liiklejaid.', 'Police remind drivers that drink-driving is a crime that endangers everyone on the road.'),
  fraud: T('Politsei soovitab olla võõraste palvete ja pakkumistega ettevaatlik ning mitte anda kellelegi oma pangakoode ega Smart-ID andmeid.', 'Police advise caution with unexpected requests from strangers and never to give anyone your bank codes or Smart-ID details.'),
  property: T('Politsei palub kõigil, kellel on sündmuse kohta infot, anda sellest teada.', 'Police ask anyone with information about the incident to come forward.'),
  missing: T('Politsei tänab kõiki, kes otsingutele kaasa aitasid.', 'Police thank everyone who helped with the search.'),
};

/** Drink-driving, as the title or summary words it ("Purjus autojuht", "Joobes juhi kahtlus", "juht on vist purjus"). */
const DRINK_DRIVING = /(joobes|purjus)\s*(auto)?juh|juht (on )?(vist |ilmselt |arvatavasti )?(joobes|purjus)/i;

/** The closing reminder for a story, only where it fits what happened. */
function adviceFor(inc: Incident): Text | undefined {
  if (inc.closedBy !== 'units') return undefined;
  if (inc.category === 'traffic') return DRINK_DRIVING.test(`${inc.title.et} ${inc.summary.et}`) ? ADVICE.traffic : undefined;
  if (inc.category === 'missing') return inc.search ? ADVICE.missing : undefined;
  // The appeal for witnesses is for cases where nobody has been caught yet.
  if (inc.category === 'property') return (inc.outcome?.arrests ?? 0) > 0 ? undefined : ADVICE.property;
  return ADVICE[inc.category];
}

/** One press-release paragraph built from a real incident. */
export function pressStory(s: SimState, inc: Incident): { title: Text; body: Text } {
  const w = wall(inc.createdAt);
  const day = WEEKDAY_ADE[w.weekday];
  const dayEn = WEEKDAY_EN[w.weekday];
  const t = pressTime(inc.createdAt);
  const tEn = enTime(inc.createdAt);
  const p = pressPlace(inc);
  const lead = p.lead ? `${p.lead} ` : '';
  // The location is a sentence of its own; the summary's first content sentence follows it.
  let open: Text;
  if (inc.source === 'field') {
    open = T(`${day} kell ${t} sai politseiametnik ${lead}aadressil ${p.address} teenistusülesandeid täites vigastada.`, `On ${dayEn} at ${tEn} a police officer was injured on duty at ${p.en}.`);
  } else {
    const first =
      inc.source === 'alarm'
        ? T(`${day} kell ${t} käivitus valvehäire ${lead}aadressil ${p.address}.`, `On ${dayEn} at ${tEn} an alarm went off at ${p.en}.`)
        : inc.source === 'anpr'
          ? T(`${day} kell ${t} andis numbrituvastuskaamera politseile hoiatuse ${lead}aadressil ${p.address}.`, `On ${dayEn} at ${tEn} a number-plate camera alerted police at ${p.en}.`)
          : T(`${day} kell ${t} kutsuti politsei ${lead}aadressile ${p.address}.`, `On ${dayEn} at ${tEn} police were called to ${p.en}.`);
    const coreEt = summaryCore(inc.summary.et, inc);
    const coreEn = summaryCore(inc.summary.en, inc);
    open = { et: coreEt ? `${first.et} ${coreEt}.` : first.et, en: coreEn ? `${first.en} ${coreEn}.` : first.en };
  }
  const out = outcomeSentence(s, inc);
  const advice = adviceFor(inc);
  const body: Text = {
    et: [open.et, out.et, advice?.et ?? ''].filter(Boolean).join(' '),
    en: [open.en, out.en, advice?.en ?? ''].filter(Boolean).join(' '),
  };
  const loc = inc.location.district && inc.location.district !== inc.location.city ? inc.location.district : inc.location.city;
  const title: Text = { et: `${inc.title.et} ${inessive(loc)}`, en: `${inc.title.en} in ${placeEn(loc)}` };
  return { title, body };
}

/** Notability score for the front page. */
function notability(inc: Incident): number {
  let n = PRIORITY_WEIGHT[inc.truePriority] * 10;
  const o = inc.outcome;
  if (o?.result === 'tragedy') n += 60;
  if (inc.pursuit?.ended) n += inc.pursuit.ended === 'crashed' ? 45 : 35;
  if (o && o.arrests > 0) n += 10 + o.arrests * 3;
  if (inc.closedBy === 'expired') n += inc.truePriority <= 2 ? 30 : 8;
  if (inc.easterEgg) n += 25;
  if (o?.officerInjured) n += 20;
  if (inc.search?.found) n += 15;
  if (inc.closedBy === 'prank' || inc.closedBy === 'duplicate' || inc.closedBy === 'phone') n -= 15;
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────────────────────

export function buildReport(s: SimState): ShiftReport {
  const incs = incidentsOf(s);
  const closed = incs.filter((i) => i.state === 'closed');
  const stats = { ...s.stats, byPriority: { ...s.stats.byPriority }, responseTimes: { ...s.stats.responseTimes } };
  const end = Math.max(s.now, s.startTime);
  const hours = Math.max(0.25, (end - s.startTime) / HOUR);

  // ── Average response per priority ───────────────────────────────────────
  const avgResponse: Partial<Record<Priority, number>> = {};
  for (const p of [1, 2, 3, 4] as Priority[]) {
    let arr = s.stats.responseTimes[p] ?? [];
    if (!arr.length) arr = incs.filter((i) => i.truePriority === p).map(responseMin).filter((x): x is number => x !== null);
    if (arr.length) avgResponse[p] = round1(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  // ── Score ────────────────────────────────────────────────────────────────
  let wsum = 0;
  let sum = 0;
  for (const inc of closed) {
    const sc = incidentScore(inc);
    if (sc === null) continue;
    const w = PRIORITY_WEIGHT[inc.truePriority] ?? 1;
    wsum += w;
    sum += w * sc;
  }
  // Open urgent incidents that already blew their SLA count as poor (handed over unresolved).
  for (const inc of incs) {
    if (inc.state === 'closed' || !isVisible(s, inc) || inc.truePriority > 2) continue;
    // A colleague's call for help nobody reached goes back to their desk, it is not the player's to answer for.
    if (helpSector(inc) !== undefined && inc.firstArrivalAt === undefined) continue;
    if (inc.firstArrivalAt === undefined && (end - inc.createdAt) / MIN > inc.slaMin) {
      wsum += PRIORITY_WEIGHT[inc.truePriority];
      sum += PRIORITY_WEIGHT[inc.truePriority] * 20;
    }
  }
  const penalties = s.stats.expired * 1 + s.stats.callsMissed * 0.5 + s.stats.referralsWrong * 0.5;
  const base = wsum > 0 ? sum / wsum : incs.length === 0 ? 72 : 50;
  const rawScore = clamp(base - penalties, 0, 100);
  const early = earlyEndFactor(s);
  const score = Math.round(rawScore * early.factor);
  stats.score = score;
  const grade = gradeOf(score);

  // ── Staatus points (2025 style) → reputation delta ───────────────────────
  let points = 0;
  for (const inc of closed) {
    if (inc.closedBy === 'expired') points -= 7;
    else if (inc.closedBy === 'units' && inc.outcome) {
      const sc = inc.outcome.score;
      points += sc >= 80 ? 4 : sc >= 60 ? 3 : sc >= 40 ? 2 : -2;
      if (inc.outcome.result === 'tragedy') points -= 6;
      if (inc.outcome.result === 'escaped') points -= 3;
      if (inc.outcome.officerInjured) points -= 2;
    } else points += closureCorrect(inc) ? 2 : -7;
  }
  points -= s.stats.callsMissed * 2;
  const reputationDelta = clamp(Math.round(points / 12), -10, 10);

  // ── Money ─────────────────────────────────────────────────────────────────
  const perfBonus = Math.max(0, score - 50) * 12;
  const legacyBonus = points > 20 ? Math.floor(points / 20) * 100 : 0; // 2025: ratingDelta > 200 → floor(ratingDelta/20)×100
  const bonus = Math.round(Math.min(1500, perfBonus + legacyBonus));
  const units = s.unitOrder.map((id) => s.units[id]).filter((u): u is Unit => !!u);
  const roadKm = (u: Unit) => (u.type === 'heli' || u.type === 'boat' ? 0 : Number(s.flags[`km:${u.id}`]) || 0);
  let kmDriven = units.reduce((a, u) => a + roadKm(u), 0);
  if (kmDriven <= 0) {
    const tot = Number(s.flags['km:total']) || Number(s.flags.kmDriven) || 0;
    kmDriven = tot > 0 ? tot : units.filter((u) => u.type !== 'heli' && u.type !== 'boat' && !u.onCall).reduce((a, u) => a + hours * 9 + u.handled * 12, 0);
  }
  kmDriven = Math.round(kmDriven);
  const fuel = Math.round(kmDriven * FUEL_PER_KM);
  const stillBusy = units.filter((u) => ['enroute', 'onscene', 'transport', 'busy', 'emergency'].includes(u.status));
  const crewOf = (u: Unit) => u.crew.filter((o) => !o.injured).length;
  const lateHours = Math.max(0, (s.now - s.endTime) / HOUR);
  const overtime = Math.round(
    stillBusy.reduce((a, u) => a + crewOf(u), 0) * OVERTIME_PER_HOUR + lateHours * units.filter((u) => !u.onCall).reduce((a, u) => a + crewOf(u), 0) * OVERTIME_PER_HOUR,
  );
  const fines = s.stats.expired * 75 + s.stats.referralsWrong * 150 + s.stats.callsMissed * 25;
  const earnings = { bonus, fuel, overtime, fines, total: bonus - fuel - overtime - fines };

  // ── XP ────────────────────────────────────────────────────────────────────
  const diffMult = { cadet: 0.7, normal: 1, veteran: 1.3, realistic: 1.6 }[s.difficulty] ?? 1;
  const hoursFactor = clamp(hours / 8, 0.5, 1.5);
  const xp = Math.max(
    0,
    Math.round((score * 1.2 * hoursFactor + stats.closed * 4 + stats.arrests * 8 + stats.pursuitsCaught * 25 + stats.callsAnswered * 3 + stats.repliesCorrect * 2) * diffMult),
  );

  // ── Officers ──────────────────────────────────────────────────────────────
  const injuredOfficers: string[] = [];
  const officerXp: Record<string, number> = {};
  for (const u of units) {
    for (const o of u.crew) {
      if (o.injured) injuredOfficers.push(o.id);
      officerXp[o.id] = Math.round(10 * hoursFactor + u.handled * 3);
    }
  }
  for (const inc of closed) {
    if (!inc.outcome) continue;
    for (const uid of inc.unitHistory) {
      const u = s.units[uid];
      if (!u) continue;
      for (const o of u.crew) officerXp[o.id] = (officerXp[o.id] ?? 0) + Math.round(4 + inc.outcome.score / 20 + inc.outcome.arrests * 3);
    }
  }

  // ── Highlights ────────────────────────────────────────────────────────────
  const highlights = buildHighlights(s, closed);

  // ── Extras ────────────────────────────────────────────────────────────────
  const resolvedList = closed.filter((i) => i.closedBy === 'units' && i.outcome && i.outcome.result !== 'escaped' && i.outcome.result !== 'tragedy');
  const resolvedByDistrict: Record<string, number> = {};
  for (const i of resolvedList) {
    const k = i.location.district ?? i.location.city;
    resolvedByDistrict[k] = (resolvedByDistrict[k] ?? 0) + 1;
  }
  const dayTags = new Set<string>();
  for (let t = s.startTime; t <= Math.max(s.endTime, s.startTime); t += HOUR) for (const tag of dayInfo(t).tags) dayTags.add(tag);
  const startHour = wall(s.startTime).hour;
  const night = startHour >= 17 || startHour < 4;
  const p1 = s.stats.responseTimes[1] ?? [];
  const helpGiven = helpGivenCount(s);
  const extras: ReportExtras = {
    maxReplyStreak: replyStreak(s, incs),
    legendQueried: !!s.flags['legendQueried'] || s.queries.some((q) => q.resultIds.some((id) => id.startsWith('legend-'))),
    pranksCaught: Number(s.flags['stat:pranksCaught']) || closed.filter((i) => i.closedBy === 'prank' && closureCorrect(i)).length,
    ruCalls: incs.filter((i) => i.tags.includes('call:ru')).length,
    resolvedByDistrict,
    islandResolved: resolvedList.filter((i) => (i.location.zone ?? 'mainland') !== 'mainland').length,
    resolved: resolvedList.length,
    dayTags: [...dayTags],
    night,
    p1Count: p1.length,
    p1Avg: p1.length ? round1(p1.reduce((a, b) => a + b, 0) / p1.length) : null,
    hours: round1(hours),
    ...(helpGiven ? { helpGiven } : {}),
    ...(early.factor < 1 ? { earlyEnd: { served: Math.round(early.served * 100) / 100, factor: Math.round(early.factor * 1000) / 1000, rawScore: Math.round(rawScore) } } : {}),
  };

  const report: ShiftReportX = {
    regionId: s.regionId,
    mode: s.mode,
    difficulty: s.difficulty,
    start: s.startTime,
    end,
    playerName: s.playerName,
    stats,
    avgResponse,
    score,
    grade,
    xp,
    reputationDelta,
    earnings,
    kmDriven,
    injuredOfficers,
    officerXp,
    highlights,
    newspaper: buildNewspaper(s, incs, closed, { score, night, dayTags: extras.dayTags, end }),
    extras,
  };
  return report;
}

function replyStreak(s: SimState, incs: Incident[]): number {
  const answers: { t: number; ok: boolean }[] = [];
  for (const inc of incs) {
    const tpl = tplOf(inc);
    for (const b of inc.beats) {
      if (b.correct === undefined) continue;
      if (tpl?.beats?.[b.index] && tpl.beats[b.index].kind !== 'query') continue;
      answers.push({ t: b.activeSince ?? b.dueAt ?? inc.createdAt, ok: b.correct });
    }
  }
  answers.sort((a, b) => a.t - b.t);
  let best = 0;
  let cur = 0;
  for (const a of answers) {
    cur = a.ok ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  void s;
  return best;
}

function buildHighlights(s: SimState, closed: Incident[]): ShiftReport['highlights'] {
  const good = closed
    .filter((i) => i.outcome && i.closedBy === 'units' && (i.outcome.score >= 75 || i.pursuit?.ended === 'caught' || i.search?.found) && i.outcome.result !== 'tragedy')
    .sort((a, b) => notability(b) + (b.outcome?.score ?? 0) / 10 - (notability(a) + (a.outcome?.score ?? 0) / 10));
  const bad = closed
    .filter((i) => i.closedBy === 'expired' || i.outcome?.result === 'tragedy' || i.outcome?.officerInjured || i.pursuit?.ended === 'crashed' || (i.outcome && i.outcome.score < 40))
    .sort((a, b) => notability(b) - notability(a));
  const pick = [...good.slice(0, 3).map((i) => ({ i, good: true })), ...bad.slice(0, 3).map((i) => ({ i, good: false }))];
  if (pick.length < 3) {
    for (const i of [...closed].sort((a, b) => notability(b) - notability(a))) {
      if (pick.length >= 3) break;
      if (!pick.some((x) => x.i === i)) pick.push({ i, good: (incidentScore(i) ?? 50) >= 50 });
    }
  }
  return pick.slice(0, 6).map(({ i, good: g }) => {
    const story = outcomeSentence(s, i);
    const when = `${pressTime(i.createdAt)}`;
    return {
      incidentId: i.id,
      title: i.title,
      text: { et: `${when} · ${i.location.address}, ${i.location.city}. ${story.et}`, en: `${enTime(i.createdAt)} · ${placeEn(i.location.address)}, ${placeEn(i.location.city)}. ${story.en}` },
      good: g,
    };
  });
}

function buildNewspaper(
  s: SimState,
  incs: Incident[],
  closed: Incident[],
  o: { score: number; night: boolean; dayTags: string[]; end: number },
): ShiftReport['newspaper'] {
  const masthead = MASTHEADS[s.regionId] ?? 'Politseikroonika';
  const date = ddmmyyyy(o.end);
  const ranked = [...closed].sort((a, b) => notability(b) - notability(a));
  const top = ranked[0];
  const n = incs.length;
  const arrests = s.stats.arrests;
  const period = o.night ? T('öö', 'night') : T('päev', 'day');
  const holiday = o.dayTags.includes('newyear') ? 'newyear' : o.dayTags.includes('jaanipaev') ? 'jaanipaev' : undefined;

  let headline: Text;
  let lead: Incident | undefined = top;
  const loc = (i: Incident) => {
    const d = i.location.district && i.location.district !== i.location.city ? i.location.district : i.location.city;
    return { et: inessive(d), en: placeEn(d) };
  };
  const lower = (t: Text): Text => ({ et: t.et.toLowerCase(), en: t.en.toLowerCase() });
  if (top && top.outcome?.result === 'tragedy') {
    const l = loc(top);
    const tt = lower(top.title);
    headline = T(`Traagiline sündmus ${l.et}: ${tt.et}`, `Tragedy in ${l.en}: ${tt.en}`);
  } else if (top && top.pursuit?.ended === 'crashed') {
    const l = loc(top);
    headline = T(`${l.et} politsei eest põgenenud juht sõitis teelt välja`, `Driver fleeing police in ${l.en} crashes off the road`);
  } else if (top && top.pursuit?.ended === 'caught') {
    const l = loc(top);
    headline = T(`${o.night ? 'Ööline' : 'Päevane'} jälitus ${l.et} lõppes kinnipidamisega`, `${o.night ? 'Night-time' : 'Daytime'} chase in ${l.en} ends in arrest`);
  } else if (top && top.closedBy === 'expired' && top.firstArrivalAt === undefined && top.truePriority <= 2) {
    const l = loc(top);
    const tt = lower(top.title);
    headline = T(`Politsei ei jõudnudki kohale: ${tt.et} ${l.et} jäi abita`, `Police never arrived: ${tt.en} in ${l.en} left without help`);
  } else if (top && top.truePriority <= 2 && top.outcome && top.outcome.arrests > 0 && top.outcome.score >= 70) {
    const l = loc(top);
    const sus = suspectOf(s, top);
    const who = sus ? personNoun(sus, s.now, true) : T('kahtlustatav', 'a suspect');
    headline = T(`${l.et} peeti kiirelt kinni ${who.et}`, `Swift arrest in ${l.en}: police detain ${who.en}`);
    headline.et = headline.et.charAt(0).toUpperCase() + headline.et.slice(1);
  } else {
    const slow = closed
      .filter((i) => i.truePriority === 1 && i.firstArrivalAt !== undefined && responseMin(i)! > i.slaMin * 2)
      .sort((a, b) => responseMin(b)! - responseMin(a)!)[0];
    if (slow) {
      lead = slow;
      const m = Math.round(responseMin(slow)!);
      headline = T(`Abi jõudis kohale alles ${m} minutiga: elanikud ootavad selgitust`, `Help took ${m} minutes to arrive: residents want answers`);
    } else if (top && top.easterEgg) {
      const l = loc(top);
      headline = T(`Kummaline ${period.et} ${l.et}: politsei kontrollis teadet „${top.title.et}“`, `A strange ${period.en} in ${l.en}: police checked a report of “${top.title.en}”`);
    } else if (holiday === 'newyear') {
      lead = undefined;
      headline = T(`Aastavahetusel kutsuti politsei välja ${n} korral`, `Police called out ${n === 1 ? 'once' : `${n} times`} over New Year's Eve`);
    } else if (holiday === 'jaanipaev') {
      lead = undefined;
      headline = T(`Jaaniöö: politsei reageeris ${n} väljakutsele`, `Midsummer night: police responded to ${n} ${n === 1 ? 'call-out' : 'call-outs'}`);
    } else if (n >= 35) {
      lead = undefined;
      headline = T(`Tormiline ${period.et}: politsei sai ${n} väljakutset`, `A hectic ${period.en}: police handled ${n} call-outs`);
    } else if (top && top.truePriority <= 2) {
      const l = loc(top);
      const tt = lower(top.title);
      headline = T(`${l.et}: ${tt.et}`, `${l.en}: ${tt.en}`);
    } else {
      lead = undefined;
      headline = T(`Rahulik ${period.et}: suuremaid vahejuhtumeid ei olnud`, `A quiet ${period.en}: no major incidents`);
    }
  }

  const region = { pohja: 'Põhja', ida: 'Ida', louna: 'Lõuna', laane: 'Lääne' }[s.regionId];
  // English uses the same names as the rest of the UI ("North Prefecture").
  const regionEn = { pohja: 'North', ida: 'East', louna: 'South', laane: 'West' }[s.regionId];
  const arrestEt = arrests > 0 ? `kinni peeti ${arrests} ${arrests === 1 ? 'inimene' : 'inimest'}` : 'kedagi kinni ei peetud';
  const arrestEn = arrests > 0 ? `detained ${arrests} ${arrests === 1 ? 'person' : 'people'}` : 'made no arrests';
  const x = s.stats.expired;
  const sub = T(
    `${o.night ? 'Öö' : 'Päeva'} jooksul reageeris ${region} prefektuur ${n} väljakutsele, ${arrestEt}${x ? `, ${x} ${x === 1 ? 'teade' : 'teadet'} jäi õigeaegselt teenindamata` : ''}.`,
    `During the ${o.night ? 'night' : 'day'} the ${regionEn} Prefecture responded to ${n} ${n === 1 ? 'call-out' : 'call-outs'} and ${arrestEn}${x ? `; ${x} ${x === 1 ? 'report was' : 'reports were'} not attended in time` : ''}.`,
  );

  const storyIncs = ranked.filter((i) => i !== lead && i.closedBy !== 'duplicate').slice(0, 4);
  if (lead) storyIncs.unshift(lead);
  const stories = storyIncs.slice(0, 4).map((i) => pressStory(s, i));
  if (stories.length < 3) {
    stories.push({
      title: T('Politsei argipäevik', 'Police diary'),
      body: T(
        `${region} prefektuuri juhtimiskeskus koordineeris ${o.night ? 'öö' : 'päeva'} jooksul ${n} ${n === 1 ? 'sündmuse' : 'sündmust'}. „Täname inimesi, kes märkasid ja helistasid kohe 112“, sõnas vahetuse vanem.`,
        `The ${regionEn} Prefecture command centre coordinated ${n} ${n === 1 ? 'event' : 'events'} during the ${o.night ? 'night' : 'day'}. “Thank you to everyone who noticed something and called 112 right away,” said the shift supervisor.`,
      ),
    });
  }
  if (stories.length < 3) {
    stories.push({
      title: T('Ilm ja liiklus', 'Weather and traffic'),
      body: T(`Ilm: ${s.weather.text.et}. Politsei palub liikluses olla tähelepanelik ja valida sõidukiirus vastavalt teeoludele.`, `Weather: ${s.weather.text.en}. Police ask road users to stay alert and adjust their speed to the road conditions.`),
    });
  }
  if (stories.length < 3) {
    stories.push({
      title: T('Meeldetuletus', 'Reminder'),
      body: T('Hädaolukorras helista 112. Kui märkad joobes juhti, anna sellest kohe teada.', 'In an emergency, call 112. If you see a drunk driver, report it immediately.'),
    });
  }
  return { masthead, date, headline, sub, stories: stories.slice(0, 4) };
}
