/**
 * EPD core types: the contract between the simulation engine, content data and UI.
 *
 * Rules:
 *  - SimState must stay fully JSON-serialisable (no classes, Maps, Sets, functions) so a
 *    shift can be autosaved to localStorage and resumed.
 *  - All game times are epoch milliseconds of the *game* clock (Europe/Tallinn wall time is
 *    derived for display only).
 *  - Coordinates are [lon, lat] (GeoJSON order).
 *  - Player-facing content strings are bilingual `Text` objects; Estonian is the primary language.
 */

export type LngLat = [number, number];
export type Lang = 'et' | 'en';
export interface Text {
  et: string;
  en: string;
}

export type RegionId = 'pohja' | 'ida' | 'louna' | 'laane';
/** 1 = life in danger right now, 2 = urgent, 3 = normal, 4 = can wait / handle by phone. */
export type Priority = 1 | 2 | 3 | 4;
export type Difficulty = 'cadet' | 'normal' | 'veteran' | 'realistic';
export type GameMode = 'career' | 'free' | 'director' | 'tutorial';
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

// ─────────────────────────────────────────────────────────────────────────────
// Static world data
// ─────────────────────────────────────────────────────────────────────────────

export type PlaceKind =
  | 'residential' // apartment blocks (korterelamud)
  | 'house' // private houses (eramud)
  | 'street'
  | 'bar'
  | 'nightclub'
  | 'mall'
  | 'shop'
  | 'bank'
  | 'school'
  | 'kindergarten'
  | 'university'
  | 'hospital'
  | 'park'
  | 'beach'
  | 'forest'
  | 'lake'
  | 'highway'
  | 'ruralroad'
  | 'trainstation'
  | 'busstation'
  | 'port'
  | 'airport'
  | 'stadium'
  | 'concert'
  | 'office'
  | 'industrial'
  | 'construction'
  | 'parking'
  | 'hotel'
  | 'church'
  | 'cemetery'
  | 'gasstation'
  | 'government'
  | 'embassy'
  | 'prison'
  | 'border'
  | 'farm'
  | 'summerhouse'
  | 'village'
  | 'oldtown'
  | 'museum';

/** A curated real-world point of interest. */
export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  city: string;
  district?: string;
  /** Street address as an Estonian would write it, e.g. "Narva mnt 7". */
  address: string;
  coord: LngLat;
  tags?: string[];
  /** Movement zone id (mainland / island), see RegionDef.zones. Defaults to 'mainland'. */
  zone?: string;
}

/** A real street, approximated by a polyline, used to generate residential addresses. */
export interface Street {
  id: string;
  name: string; // e.g. "Punane tn", "Sõpruse pst", "Narva mnt"
  city: string;
  district?: string;
  points: LngLat[]; // >= 2 points along the street, ordered by house number
  houses: [number, number]; // inclusive house-number range
  kind: 'apartment' | 'house' | 'mixed' | 'commercial';
  /** Relative chance an address is generated here (default 1). */
  weight?: number;
  zone?: string;
}

export interface Town {
  name: string;
  county: string;
  coord: LngLat;
  population: number;
  /** Share of Russian-speaking residents 0..1 (drives caller language). */
  ruShare: number;
  zone?: string;
}

export type StationKind = 'hq' | 'station' | 'post' | 'arrest' | 'airbase' | 'border' | 'harbour';

export interface Station {
  id: string;
  name: Text;
  short: string; // short label on map, e.g. "Lasnamäe PJ"
  kind: StationKind;
  city: string;
  address: string;
  coord: LngLat;
  zone?: string;
}

export type UnitType =
  | 'patrol' // patrullekipaaž
  | 'rapid' // kiirreageerijad
  | 'k9' // koerajuht
  | 'traffic' // liiklusjärelevalve
  | 'criminal' // kriminaalpolitsei / uurija
  | 'special' // K-komando
  | 'heli' // PPA lennusalk
  | 'border' // piirivalve
  | 'aux' // abipolitseinikud
  | 'community' // piirkonnapolitseinik / noorsoopolitseinik
  | 'transport' // kinnipeetavate transport
  | 'boat'; // merevalve / Peipsi patrullkaater

export interface UnitSpec {
  callsign: string;
  type: UnitType;
  stationId: string;
  vehicle: string; // e.g. "Škoda Superb Combi"
  crew: number;
  /** Which shift the unit works. Defaults to 'both'. */
  shift?: 'day' | 'night' | 'both';
  /** If set, the unit only exists in these difficulty levels (used to scale rosters). */
  minDifficulty?: Difficulty;
  /** Starts on-call at the station (special units / helicopter). */
  onCall?: boolean;
  zone?: string;
  /** Named crew (e.g. the original 2024 officers). Missing members are generated. */
  crewNames?: { firstName: string; lastName: string; badge: string; gender: Gender }[];
}

export interface Zone {
  id: string; // 'mainland', 'saaremaa', 'hiiumaa', ...
  name: Text;
  /** Extra minutes for road units to cross into this zone from mainland (ferry). Null = unreachable by road. */
  ferryMinutes: number | null;
}

export interface RegionDef {
  id: RegionId;
  name: Text; // "Põhja prefektuur"
  short: string; // "PÕHJA"
  hqCity: string;
  counties: string[]; // "Harju maakond", ...
  center: LngLat;
  zoom: number;
  bounds: [LngLat, LngLat]; // [sw, ne]
  description: Text;
  /** Baseline events per game-hour at difficulty 'normal' before hour/weekday multipliers. */
  callVolume: number;
  zones: Zone[];
  stations: Station[];
  /** Station id where detainees are taken (arestimaja). */
  arrestHouseId: string;
  roster: UnitSpec[];
  towns: Town[];
  streets: Street[];
  places: Place[];
  /** Radio prefix used in chatter, e.g. "Põhja". */
  radioName: string;
  /** Prefecture commander NPC who signs the shift briefing ("päevakäsk"). */
  commander?: { name: string; title: Text; badge: string; gender: Gender };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry (rahvastikuregister / liiklusregister / karistusregister mock)
// ─────────────────────────────────────────────────────────────────────────────

export type Gender = 'M' | 'F';
export type Citizenship = 'EST' | 'RUS' | 'UKR' | 'LVA' | 'LTU' | 'FIN' | 'BLR' | 'XXA'; // XXA = määratlemata
export type SpeakerLang = 'et' | 'ru' | 'uk' | 'en' | 'fi';

export interface Appearance {
  heightCm: number;
  build: 'slim' | 'average' | 'athletic' | 'heavy';
  hair: 'short' | 'long' | 'bald' | 'ponytail' | 'curly' | 'shaved' | 'buzz';
  hairColor: 'black' | 'brown' | 'blond' | 'red' | 'grey' | 'white' | 'dyed';
  eyes: 'blue' | 'grey' | 'green' | 'brown';
  beard?: 'stubble' | 'full' | 'moustache' | 'goatee';
  glasses?: boolean;
  tattoo?: string; // free text, Estonian
  /** Clothing description, bilingual. */
  clothing: Text;
}

export interface CriminalRecord {
  date: string; // YYYY-MM-DD
  lawId: string; // id into data/laws.ts
  kind: 'crime' | 'misdemeanour';
  punishment: Text;
}

export interface WantedFlag {
  reason: Text;
  since: string; // YYYY-MM-DD
  dangerous: boolean;
  authority: string; // e.g. "Harju Maakohus", "Põhja Ringkonnaprokuratuur"
  armed?: boolean;
}

export interface Person {
  id: string;
  idcode: string; // valid Estonian isikukood
  firstName: string;
  lastName: string;
  gender: Gender;
  birthDate: string; // YYYY-MM-DD
  citizenship: Citizenship;
  lang: SpeakerLang;
  address: string;
  city: string;
  coord?: LngLat;
  phone: string; // "+372 5xxx xxxx"
  occupation: Text;
  appearance: Appearance;
  license: {
    status: 'valid' | 'suspended' | 'revoked' | 'none' | 'expired';
    categories: string[];
    validUntil?: string;
    probationary?: boolean; // esmane juhiluba
  };
  weaponPermit?: { kind: Text; validUntil: string; weapons: string[] };
  records: CriminalRecord[];
  flags: {
    wanted?: WantedFlag;
    missing?: { since: string; text: Text };
    restrainingOrder?: { protectedName: string; until: string };
    probation?: { until: string };
    sis?: Text; // Schengen alert
    deceased?: boolean;
  };
  vehicles: string[]; // plates
  notes: Text[];
  avatarSeed: number;
}

export type VehicleKind = 'car' | 'van' | 'moto' | 'truck' | 'bus' | 'moped' | 'quad';

export interface Vehicle {
  plate: string; // "123 ABC"
  vin: string;
  make: string;
  model: string;
  year: number;
  color: Text;
  kind: VehicleKind;
  ownerId?: string; // person id
  ownerCompany?: string; // leasing / company owner
  insurance: { valid: boolean; until: string; insurer: string };
  inspection: { valid: boolean; until: string };
  flags: {
    stolen?: { since: string; text: Text };
    wanted?: Text;
    suspended?: boolean; // registreering peatatud
  };
  notes: Text[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident templates (content)
// ─────────────────────────────────────────────────────────────────────────────

export type IncidentCategory =
  | 'violence' // isikuvastased
  | 'domestic' // perevägivald
  | 'property' // varavastased
  | 'traffic' // liiklus
  | 'public_order' // avalik kord
  | 'drugs'
  | 'missing' // kadunud isikud
  | 'alarm' // valvesignalisatsioon, ANPR
  | 'assist' // abi osutamine, muu
  | 'major' // suurõnnetus, terror, pantvang
  | 'border'
  | 'environment'
  | 'fraud'
  | 'easter'; // naljakad/legendaarsed (2024. aasta originaalist)

export type Agency =
  | 'kiirabi'
  | 'paaste'
  | 'keskkonnaamet'
  | 'kapo'
  | 'kov' // kohalik omavalitsus (munitsipaalpolitsei, linnavalitsus)
  | 'sotsiaal' // lastekaitse / sotsiaaltöö
  | 'merepaaste'
  | 'tolliamet'
  | 'transpordiamet'
  | 'veterinaar';

export interface UnitNeed {
  type: UnitType | 'any';
  count: number;
}

/** Hour-of-day profile key or explicit 24 multipliers (index = hour 0..23). */
export type HourProfile = 'flat' | 'day' | 'night' | 'evening' | 'nightlife' | 'commute' | 'business' | number[];

export type PersonRole = 'suspect' | 'victim' | 'caller' | 'witness' | 'driver' | 'missing' | 'deceased';

export interface PersonSpec {
  role: PersonRole;
  gender?: Gender | 'any';
  age?: [number, number];
  /** Chances (0..1) that the generated registry record carries these properties. */
  wanted?: number;
  record?: number; // has prior records
  restraining?: number;
  weapon?: number; // holds a weapon permit
  noLicense?: number; // license suspended/revoked/none
  probation?: number;
  /** Relation to the victim/caller, used in text: partner, neighbour, stranger, family, employee... */
  relation?: 'partner' | 'ex_partner' | 'neighbour' | 'stranger' | 'family' | 'child' | 'parent' | 'employee' | 'customer' | 'friend';
  /** Identity known to the caller from the start (otherwise only a description). */
  known?: boolean;
  intoxicated?: number;
}

export interface VehicleSpec {
  role: 'suspect' | 'victim' | 'involved';
  kind?: VehicleKind;
  stolen?: number;
  noInsurance?: number;
  noInspection?: number;
  suspended?: number;
  /** Driver is the person with this role (links vehicle owner/driver). */
  driverRole?: PersonRole;
}

export interface Effects {
  /** Added to the incident's success score (0..1 scale, typically ±0.05..0.3). */
  success?: number;
  /** Added to the officer-injury risk (0..1). */
  risk?: number;
  /** Public trust delta (points, ±1..10). */
  trust?: number;
  /** Extra on-scene minutes. */
  time?: number;
  /** Force a specific outcome id. */
  outcome?: string;
  arrests?: number;
  /** Raise priority to 1 and mark escalated. */
  escalate?: boolean;
}

export type BeatAt = 'arrive' | number; // number = minutes after first arrival

interface BeatBase {
  at: BeatAt;
  /** Chance this beat happens at all (default 1). */
  chance?: number;
  /** Radio text variants from the unit; placeholders allowed (see TEMPLATE_PLACEHOLDERS). */
  radio: Text[];
}

/** Officer asks dispatch to run a registry check; player must look it up and answer correctly. */
export interface QueryBeat extends BeatBase {
  kind: 'query';
  queryType: 'person' | 'vehicle';
  subject: PersonRole | 'vehicle';
}

export interface ChoiceOption {
  id: string;
  label: Text;
  reply: Text; // what dispatch says on the radio when choosing it
  effects: Effects;
}

/** A decision the player must make (e.g. start a pursuit, enter the flat, wait for K-komando). */
export interface ChoiceBeat extends BeatBase {
  kind: 'choice';
  options: ChoiceOption[];
  timeoutMin: number;
  defaultOption: string;
}

/** Unit requests backup of a certain type; if not sent within timeout, failEffects apply. */
export interface BackupBeat extends BeatBase {
  kind: 'backup';
  need: UnitNeed;
  timeoutMin: number;
  failEffects: Effects;
  successEffects?: Effects;
}

/** Unit needs another agency (ambulance, rescue…) requested through Häirekeskus. */
export interface AgencyBeat extends BeatBase {
  kind: 'agency';
  agency: Agency;
  timeoutMin: number;
  failEffects: Effects;
  successEffects?: Effects;
}

/** Unit transports someone; unit becomes 'transport' and drives to the destination. */
export interface TransportBeat extends BeatBase {
  kind: 'transport';
  dest: 'arrest' | 'hospital' | 'station' | 'home';
  /** Paperwork minutes after arriving at the destination. */
  paperworkMin: [number, number];
}

/** Pure flavour / information radio message. */
export interface InfoBeat extends BeatBase {
  kind: 'info';
}

/** Escalation: situation gets worse (new priority and optional extra need). */
export interface EscalateBeat extends BeatBase {
  kind: 'escalate';
  toPriority: Priority;
  need?: UnitNeed;
  effects?: Effects;
}

/** Starts a dynamic vehicle pursuit mini-game. */
export interface PursuitBeat extends BeatBase {
  kind: 'pursuit';
}

/** Starts an area search (missing person, fled suspect). */
export interface SearchBeat extends BeatBase {
  kind: 'search';
  radiusKm: number;
}

export type BeatSpec =
  | QueryBeat
  | ChoiceBeat
  | BackupBeat
  | AgencyBeat
  | TransportBeat
  | InfoBeat
  | EscalateBeat
  | PursuitBeat
  | SearchBeat;

export type OutcomeResult =
  | 'resolved'
  | 'arrest'
  | 'report' // protokoll / kriminaalmenetlus alustatud
  | 'warning'
  | 'fine'
  | 'referred'
  | 'false_alarm'
  | 'escaped'
  | 'unfounded'
  | 'hospital'
  | 'tragedy';

export interface OutcomeSpec {
  id: string;
  /** Relative weight among eligible outcomes. */
  weight: number;
  /** Only eligible if success score is within [minSuccess, maxSuccess]. */
  minSuccess?: number;
  maxSuccess?: number;
  result: OutcomeResult;
  text: Text; // final radio report / closing note, placeholders allowed
  arrests?: number;
  injuries?: number; // civilian injuries
  trust?: number;
}

/** Caller mood for 112 call-taking. */
export type CallerMood = 'panic' | 'calm' | 'drunk' | 'angry' | 'child' | 'elderly' | 'whisper' | 'confused' | 'prank';

export type CallQuestionId =
  | 'where'
  | 'what'
  | 'injured'
  | 'weapons'
  | 'suspect'
  | 'vehicle'
  | 'direction'
  | 'count'
  | 'when'
  | 'name'
  | 'safe'
  | 'children'
  | 'intoxicated';

/** Optional hand-written script for an interactive 112 transfer (otherwise answers are generated). */
export interface CallScript {
  mood: CallerMood;
  opening: Text[];
  answers?: Partial<Record<CallQuestionId, Text[]>>;
  /** Russian original lines for ru-speaking callers (shown with interpreter translation). */
  openingRu?: string[];
}

export interface IncidentTemplate {
  id: string;
  category: IncidentCategory;
  /** Short CAD code shown in the queue, e.g. "PV" (perevägivald), "LÕ" (liiklusõnnetus). */
  code: string;
  title: Text;
  priority: Priority;
  /** Relative frequency. 1 = an everyday event. 0.01 = very rare. */
  weight: number;
  hours?: HourProfile;
  /** Multiplier on Friday/Saturday nights (default 1). */
  weekendBoost?: number;
  seasons?: Season[];
  /** Only these months (1..12). */
  months?: number[];
  places: PlaceKind[];
  regions?: RegionId[];
  units: { need: UnitNeed[]; ideal?: UnitNeed[] };
  /** Minutes on scene when handled adequately. */
  onScene: [number, number];
  /** Response-time target in minutes (defaults from priority). */
  sla?: number;
  persons: PersonSpec[];
  vehicles?: VehicleSpec[];
  /** Häirekeskus event-card text variants (terse, third person). */
  summary: Text[];
  /** First-person caller quotes for flavour / 112 call opening. */
  callerLines?: Text[];
  /** Extra details revealed after acknowledgement or arrival. */
  details?: Text[];
  agencies?: { agency: Agency; chance: number; reason: Text }[];
  /** The event is really for another agency (dispatcher should refer instead of sending police). */
  referral?: { agency: Agency; chance: number };
  beats?: BeatSpec[];
  outcomes: OutcomeSpec[];
  /** If not attended within afterMin, it escalates. */
  escalation?: { afterMin: number; chance: number; toPriority: Priority; text: Text };
  /** Caller gives up / situation resolves itself if nobody comes within this many minutes. */
  expiresMin?: number;
  falseAlarmChance?: number;
  /** Chance the event arrives as an interactive 112 transfer instead of a card (default by priority). */
  interactiveChance?: number;
  call?: CallScript;
  /** Tags used by generators: 'armed', 'weapon_knife', 'night_only', 'vehicle_flee', 'bolo', ... */
  tags?: string[];
  /** From the original 2024 call list. */
  legacy?: boolean;
  easterEgg?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic state
// ─────────────────────────────────────────────────────────────────────────────

export type UnitStatus =
  | 'available'
  | 'enroute'
  | 'onscene'
  | 'transport'
  | 'busy' // paperwork / menetlus
  | 'break'
  | 'offduty'
  | 'emergency'; // ametnik vajab abi

export const STATUS_CODE: Record<UnitStatus, number> = {
  available: 1,
  enroute: 2,
  onscene: 3,
  transport: 4,
  busy: 5,
  break: 6,
  offduty: 7,
  emergency: 9,
};

export interface Officer {
  id: string;
  badge: string; // e.g. "085"
  firstName: string;
  lastName: string;
  gender: Gender;
  rank: Text; // eriaste
  title: Text; // ametinimetus
  years: number;
  /** 0..1 overall competence; affects outcomes. */
  skill: number;
  /** 0..1 accumulated stress. */
  stress: number;
  injured?: boolean;
  avatarSeed: number;
}

export interface Movement {
  purpose: 'incident' | 'patrol' | 'return' | 'transport' | 'pursuit' | 'search';
  path: LngLat[];
  /** Cumulative distance in km at each path vertex (same length as path). */
  cum: number[];
  departAt: number;
  arriveAt: number;
  siren: boolean;
  /** Where the movement ends (for transport: station/hospital id). */
  targetId?: string;
}

export interface Unit {
  id: string;
  callsign: string;
  type: UnitType;
  stationId: string;
  zone: string;
  vehicle: string;
  crew: Officer[];
  status: UnitStatus;
  statusSince: number;
  /** Last computed position (engine updates it every step). */
  pos: LngLat;
  heading: number; // degrees, 0 = north
  move?: Movement;
  incidentId?: string;
  busyUntil?: number;
  /** 0..1, grows during shift; breaks reduce it. */
  fatigue: number;
  breaks: number;
  onCall?: boolean;
  /** Incidents handled this shift. */
  handled: number;
}

export type IncidentState = 'incoming' | 'queued' | 'dispatched' | 'onscene' | 'closed';

export interface IncidentLocation {
  address: string;
  coord: LngLat;
  city: string;
  district?: string;
  placeName?: string;
  placeKind: PlaceKind;
  zone: string;
}

export interface IncidentPersonRef {
  personId: string;
  role: PersonRole;
  /** Has the player opened this record in the registry. */
  checked?: boolean;
}

export interface TimelineEntry {
  t: number;
  kind: 'system' | 'hk' | 'dispatch' | 'radio' | 'status' | 'note' | 'agency' | 'outcome';
  text: Text;
}

export type BeatStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

export interface BeatState {
  index: number; // index into template.beats
  status: BeatStatus;
  dueAt?: number; // when it fires
  activeSince?: number;
  timeoutAt?: number;
  radioId?: string; // radio message awaiting a reply
  answer?: string; // chosen reply id
  correct?: boolean;
}

export interface AgencyRequest {
  agency: Agency;
  requestedAt: number;
  arriveAt: number;
  arrived?: boolean;
}

export interface PursuitState {
  suspectPos: LngLat;
  heading: number;
  speedKmh: number;
  startedAt: number;
  /** 0..1 chance-per-minute pressure of a crash. */
  risk: number;
  /** 0..1 progress towards stopping the suspect. */
  pressure: number;
  heli: boolean;
  spikes: boolean;
  ended?: 'caught' | 'escaped' | 'crashed' | 'terminated';
  trail: LngLat[];
}

export interface SearchState {
  center: LngLat;
  radiusKm: number;
  progress: number; // 0..1
  startedAt: number;
  found?: boolean;
}

export interface Incident {
  id: string;
  /** Human event number, e.g. "PÕ-251017-0042". */
  number: string;
  templateId: string;
  category: IncidentCategory;
  code: string;
  title: Text;
  /** Priority as currently set by the dispatcher. */
  priority: Priority;
  /** Real priority of the situation (for scoring). */
  truePriority: Priority;
  state: IncidentState;
  source: 'hk' | 'call' | 'field' | 'alarm' | 'anpr' | 'director';
  createdAt: number;
  acknowledgedAt?: number;
  firstDispatchAt?: number;
  firstArrivalAt?: number;
  closedAt?: number;
  location: IncidentLocation;
  summary: Text;
  details: Text[];
  /** Details not yet revealed (moved to `details` over time). */
  hiddenDetails: Text[];
  caller?: { name: string; phone: string; lang: SpeakerLang; personId?: string };
  persons: IncidentPersonRef[];
  vehicles: { plate: string; role: VehicleSpec['role']; checked?: boolean }[];
  /** Currently assigned unit ids. */
  assigned: string[];
  /** All units that ever worked on it. */
  unitHistory: string[];
  need: UnitNeed[];
  ideal: UnitNeed[];
  onSceneMin: number;
  /** Accumulated unit-minutes on scene. */
  workDone: number;
  slaMin: number;
  expiresAt?: number;
  escalated?: boolean;
  escalateAt?: number;
  beats: BeatState[];
  agencyNeeds: { agency: Agency; reason: Text; requested?: AgencyRequest }[];
  referral?: Agency;
  falseAlarm?: boolean;
  /** Effects accumulated from beats. */
  effects: Required<Pick<Effects, 'success' | 'risk' | 'trust' | 'time' | 'arrests'>> & { outcome?: string };
  timeline: TimelineEntry[];
  pursuit?: PursuitState;
  search?: SearchState;
  outcome?: {
    id: string;
    result: OutcomeResult;
    text: Text;
    success: number;
    arrests: number;
    injuries: number;
    officerInjured: boolean;
    score: number;
    breakdown: ScoreBreakdown;
  };
  /** Player closed it by referring / phone advice / marking duplicate or prank. */
  closedBy?: 'units' | 'referral' | 'phone' | 'duplicate' | 'prank' | 'expired' | 'director';
  tags: string[];
  easterEgg?: boolean;
}

export interface ScoreBreakdown {
  response: number;
  resources: number;
  decisions: number;
  outcome: number;
  safety: number;
  classification: number;
  total: number;
}

export interface RadioReply {
  id: string;
  label: Text;
}

export interface RadioMsg {
  id: string;
  t: number;
  /** Callsign, 'JK' (juhtimiskeskus = player), 'HK' (Häirekeskus) or agency name. */
  from: string;
  to?: string;
  text: Text;
  level: 'routine' | 'priority' | 'emergency';
  kind: 'status' | 'query' | 'choice' | 'backup' | 'agency' | 'info' | 'system' | 'dispatch' | 'reply' | 'pursuit';
  incidentId?: string;
  unitId?: string;
  replies?: RadioReply[];
  answered?: string;
  expiresAt?: number;
}

/** Interactive 112 transfer waiting for / in conversation with the player. */
export interface ActiveCall {
  id: string;
  incidentId: string; // incident is pre-generated (state 'incoming', hidden from queue until call ends)
  ringingSince: number;
  answeredAt?: number;
  endedAt?: number;
  mood: CallerMood;
  lang: SpeakerLang;
  interpreter?: boolean;
  /** Dialogue so far. */
  lines: { who: 'caller' | 'dispatcher' | 'system'; text: Text; ru?: string; t: number }[];
  asked: CallQuestionId[];
  /** Facts the player has learned (keys like 'where', 'weapons'). */
  learned: CallQuestionId[];
  prank?: boolean;
}

export interface Weather {
  kind: 'clear' | 'cloudy' | 'rain' | 'snow' | 'sleet' | 'fog' | 'storm';
  tempC: number;
  windMs: number;
  /** Multiplier on travel time (1 = dry roads, 1.4 = ice). */
  roadFactor: number;
  text: Text;
}

export interface Bulletin {
  id: string;
  t: number;
  kind: 'bolo_vehicle' | 'bolo_person' | 'order' | 'event' | 'weather';
  title: Text;
  text: Text;
  plate?: string;
  personId?: string;
}

/** Registry query performed by the player (POLIS-style log). */
export interface QueryLog {
  t: number;
  kind: 'person' | 'vehicle';
  query: string;
  resultIds: string[];
}

export interface ShiftStats {
  incidents: number;
  closed: number;
  byPriority: Record<Priority, number>;
  responseTimes: Record<Priority, number[]>; // minutes from creation to first arrival
  arrests: number;
  civilianInjuries: number;
  officerInjuries: number;
  escaped: number;
  expired: number;
  falseAlarms: number;
  referralsCorrect: number;
  referralsWrong: number;
  queries: number;
  repliesCorrect: number;
  repliesWrong: number;
  beatsMissed: number;
  pursuits: number;
  pursuitsCaught: number;
  callsAnswered: number;
  callsMissed: number;
  score: number;
}

/** UI notifications produced by the engine (sounds, toasts). Drained by the UI each frame. */
export interface GameEvent {
  t: number;
  type:
    | 'incident_new'
    | 'incident_p1'
    | 'incident_escalated'
    | 'incident_closed'
    | 'call_ring'
    | 'call_missed'
    | 'radio'
    | 'radio_emergency'
    | 'unit_arrived'
    | 'unit_available'
    | 'pursuit_start'
    | 'pursuit_end'
    | 'bulletin'
    | 'shift_end'
    | 'achievement';
  incidentId?: string;
  unitId?: string;
  text?: Text;
}

/** A unit composed from the player's own staff and fleet (career mode). */
export interface RosterUnit {
  callsign: string;
  type: UnitType;
  stationId: string;
  vehicle: string;
  crew: Officer[];
  onCall?: boolean;
  zone?: string;
}

export interface NewShiftOptions {
  seed: number;
  regionId: RegionId;
  mode: GameMode;
  difficulty: Difficulty;
  /** Wall-clock start of the shift (game time, epoch ms). */
  start: number;
  /** Shift length in hours. */
  hours: number;
  playerName: string;
  /** Optional weather override. */
  weather?: Weather['kind'];
  /** Career mode: units built from the player's hired staff. Otherwise the region's default roster is used. */
  roster?: RosterUnit[];
  /** Career upgrade ids owned (see data/economy.ts), they modify engine behaviour. */
  upgrades?: string[];
  /** Career reputation ("Staatus") going into the shift, 0..100. */
  reputation?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Career & economy (persistent between shifts, stored by store/career.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface StaffMember extends Officer {
  /** Specialisation the officer was hired for. */
  specialty: UnitType;
  salary: number; // € gross per month
  hiredDay: number;
  status: 'active' | 'injured' | 'vacation' | 'training';
  /** Career day until which the status lasts. */
  statusUntil?: number;
  morale: number; // 0..1
  xp: number;
  shifts: number;
}

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  age: number;
  specialty: UnitType;
  skill: number; // 0..1
  salary: number; // € per month demanded
  years: number;
  avatarSeed: number;
  /** One-line flavour bio, bilingual. */
  bio: Text;
}

export interface FleetVehicle {
  id: string;
  model: string;
  plate: string;
  /** Which unit types can use it (patrol car, van, motorbike, K9 car…). */
  suits: UnitType[];
  condition: number; // 0..1
  boughtDay: number;
  price: number;
  upkeep: number; // € per month
}

export interface LedgerEntry {
  day: number;
  kind: 'budget' | 'bonus' | 'salary' | 'hire' | 'vehicle' | 'upgrade' | 'upkeep' | 'fuel' | 'overtime' | 'fine' | 'other';
  amount: number; // + income, - expense
  text: Text;
}

export interface ShiftReport {
  regionId: RegionId;
  mode: GameMode;
  difficulty: Difficulty;
  start: number;
  end: number;
  playerName: string;
  stats: ShiftStats;
  avgResponse: Partial<Record<Priority, number>>;
  /** 0..100 */
  score: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  xp: number;
  /** Change to career reputation. */
  reputationDelta: number;
  /** Money: performance bonus and running costs for the shift (career). */
  earnings: { bonus: number; fuel: number; overtime: number; fines: number; total: number };
  kmDriven: number;
  /** Staff ids injured this shift. */
  injuredOfficers: string[];
  /** Per-officer shift xp, keyed by Officer.id. */
  officerXp: Record<string, number>;
  highlights: { incidentId: string; title: Text; text: Text; good: boolean }[];
  /** Generated newspaper front page. */
  newspaper: { masthead: string; date: string; headline: Text; sub: Text; stories: { title: Text; body: Text }[] };
  /** `${seed}:${startTime}` of the shift (set by the game store), so one shift is paid out only once. */
  shiftKey?: string;
}

export interface SimState {
  version: 2;
  seed: number;
  rng: number;
  mode: GameMode;
  difficulty: Difficulty;
  regionId: RegionId;
  playerName: string;
  startTime: number;
  endTime: number;
  now: number;
  ended: boolean;
  weather: Weather;
  units: Record<string, Unit>;
  unitOrder: string[];
  incidents: Record<string, Incident>;
  incidentOrder: string[];
  persons: Record<string, Person>;
  vehicles: Record<string, Vehicle>;
  radio: RadioMsg[];
  calls: ActiveCall[];
  bulletins: Bulletin[];
  queries: QueryLog[];
  events: GameEvent[];
  seq: { incident: number; radio: number; person: number; call: number; bulletin: number };
  nextSpawnAt: number;
  trust: number; // 0..100 public trust
  stats: ShiftStats;
  /** Free-form flags for tutorial / director / achievements. */
  flags: Record<string, number | string | boolean>;
}

export interface CareerProfile {
  version: 1;
  name: string;
  badge: string;
  regionId: RegionId;
  createdAt: number; // real-world ms
  seed: number;
  /** Career day counter (1-based). Every 30 days is a "month". */
  day: number;
  money: number; // €
  /** "Staatus" from the 2025 version, 0..100 (starts at 25). */
  reputation: number;
  xp: number;
  staff: StaffMember[];
  fleet: FleetVehicle[];
  upgrades: string[];
  ledger: LedgerEntry[];
  recruits: Candidate[];
  history: {
    day: number;
    regionId: RegionId;
    score: number;
    grade: ShiftReport['grade'];
    incidents: number;
    earnings: number;
    reputationDelta: number;
  }[];
  achievements: string[];
  unlockedRegions: RegionId[];
  stats: { shifts: number; incidents: number; arrests: number; bestScore: number; pursuitsCaught: number };
  /** ShiftReport.shiftKey of the latest paid shifts (newest last): a replayed save never pays twice. */
  paidShifts?: string[];
}

export interface Upgrade {
  id: string;
  name: Text;
  desc: Text;
  price: number;
  upkeep: number; // € per month
  minRank: number; // index into RANKS
  icon: string; // short emoji or icon key
}

export interface CatalogVehicle {
  id: string;
  model: string;
  suits: UnitType[];
  price: number;
  upkeep: number;
  minRank: number;
  desc: Text;
}

export interface Rank {
  name: Text;
  xp: number; // xp needed
  /** Unlocks shown in UI. */
  unlocks: Text[];
}

export interface Achievement {
  id: string;
  name: Text;
  desc: Text;
  icon: string;
}
