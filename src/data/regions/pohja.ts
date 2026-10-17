/**
 * Põhja prefektuur: Harju maakond incl. Tallinn.
 *
 * Sources: docs/research/ppa-organisation.md (stations, custody, units, vehicles), prior
 * geographic knowledge, and the processed geodata in src/data/geo (district polygons of
 * Tallinn, settlement centroids). Every Tallinn street/place point is checked against
 * tallinn_districts.json in tests/regions-pohja-ida.test.ts.
 *
 * ── Radio callsigns (FICTIONAL: PPA does not publish its real kutsungid) ───────────────
 *   "PÕHJA xy"           patrol crew: x = area / base, y = crew number
 *       1y  Kesklinn (prefecture HQ, Pärnu mnt 139)
 *       2y  Ida-Harju jaoskond (Lasnamäe, Pirita, east Tallinn), P. Pinna 4
 *       3y  Lääne-Harju jaoskond (Kristiine, Mustamäe, Nõmme, Haabersti), Rahumäe tee
 *       4y  Põhja-Tallinn (Kolde pst)
 *       5y  rural east Harju (Kose office)
 *       6y  rural west/south Harju (Tammemäe/Saku office)
 *   "PÕHJA K1…"           kiirreageerijad (rapid response)
 *   "PÕHJA KOER n"        K9 handler
 *   "PÕHJA LIIKLUS n"     traffic enforcement
 *   "PÕHJA KRIMI n"       criminal police / investigators
 *   "PÕHJA KONSTAABEL n"  community (district) officer
 *   "PÕHJA KONVOI n"      detainee transport
 *   "PÕHJA ABI n"         crew with auxiliary police officers (abipolitseinikud)
 *   "KOBRA 1"             K-komando (national tier-1 unit, on call)
 *   "KOPTER 1"            PPA lennusalk AW139 (national, on call)
 * The same scheme is used for Ida ("IDA xy", "IDA PIIR n", "IDA KAATER n" …).
 */
import type { LngLat, Place, PlaceKind, RegionDef, Station, Street, Town, UnitSpec } from '@/sim/types';

const TLN = 'Tallinn';

function st(
  id: string,
  name: string,
  city: string,
  district: string | undefined,
  points: LngLat[],
  houses: [number, number],
  kind: Street['kind'],
  weight = 1,
): Street {
  const s: Street = { id, name, city, points, houses, kind, weight };
  if (district) s.district = district;
  return s;
}

function pl(
  id: string,
  name: string,
  kind: PlaceKind,
  city: string,
  district: string | undefined,
  address: string,
  coord: LngLat,
  tags?: string[],
): Place {
  const p: Place = { id, name, kind, city, address, coord };
  if (district) p.district = district;
  if (tags && tags.length) p.tags = tags;
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stations
// ─────────────────────────────────────────────────────────────────────────────

const STATIONS: Station[] = [
  {
    id: 'pohja-hq',
    name: { et: 'Põhja prefektuur (PPA peamaja)', en: 'North Prefecture HQ (PPA headquarters)' },
    short: 'Põhja PREF',
    kind: 'hq',
    city: TLN,
    address: 'Pärnu mnt 139',
    coord: [24.7362, 59.413],
  },
  {
    id: 'pohja-idaharju',
    name: { et: 'Ida-Harju politseijaoskond', en: 'East Harju Police Station' },
    short: 'Ida-Harju PJ',
    kind: 'station',
    city: TLN,
    address: 'P. Pinna tn 4',
    coord: [24.902, 59.442],
  },
  {
    id: 'pohja-laaneharju',
    name: { et: 'Lääne-Harju politseijaoskond', en: 'West Harju Police Station' },
    short: 'Lääne-Harju PJ',
    kind: 'station',
    city: TLN,
    address: 'Rahumäe tee 6/1',
    coord: [24.7215, 59.3962],
  },
  {
    id: 'pohja-pohjatallinn',
    name: { et: 'Põhja-Tallinna piirkonnagrupp', en: 'North Tallinn community policing office' },
    short: 'P-Tallinna PG',
    kind: 'post',
    city: TLN,
    address: 'Kolde pst 65',
    coord: [24.694, 59.4455],
  },
  {
    id: 'pohja-kose',
    name: { et: 'Ida-Harju piirkonnagrupp (Kose)', en: 'East Harju rural office (Kose)' },
    short: 'Kose PG',
    kind: 'post',
    city: 'Kose',
    address: 'Hariduse tn 1, Kose alevik',
    coord: [25.167, 59.1835],
  },
  {
    id: 'pohja-saku',
    name: { et: 'Lääne-Harju piirkonnagrupp (Tammemäe)', en: 'West Harju rural office (Tammemäe)' },
    short: 'Tammemäe PG',
    kind: 'post',
    city: 'Saku vald',
    address: 'Päästekeskuse tee 1, Tammemäe küla',
    coord: [24.674, 59.3175],
  },
  {
    id: 'pohja-arest',
    name: {
      et: 'Põhja prefektuuri kinnipidamiskeskus (Tallinna Vangla juures)',
      en: 'North Prefecture detention centre (at Tallinn Prison)',
    },
    short: 'Kinnipidamiskeskus',
    kind: 'arrest',
    city: 'Rae vald',
    address: 'Linnaaru tee 5/1, Soodevahe küla',
    coord: [24.891, 59.4158],
  },
  {
    id: 'pohja-kainestus',
    name: { et: 'Tallinna kainestusmaja', en: 'Tallinn sobering-up centre' },
    short: 'Kainestusmaja',
    kind: 'arrest',
    city: TLN,
    address: 'Merelahe tee 4',
    coord: [24.688, 59.445],
  },
  {
    id: 'pohja-lennusalk',
    name: { et: 'PPA lennusalk (Tallinna lennujaam)', en: 'PPA Air Unit (Tallinn Airport)' },
    short: 'Lennusalk',
    kind: 'airbase',
    city: TLN,
    address: 'Lennujaama tee, Tallinna lennujaam',
    coord: [24.813, 59.419],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Roster: 'normal' is the default; minDifficulty adds units for harder levels.
// Normal: 12 patrols (day 9 / night 12), 2 rapid, K9, traffic, criminal, community,
// transport, K-komando (on call), helicopter (on call), 1 auxiliary night crew.
// ─────────────────────────────────────────────────────────────────────────────

// prettier-ignore
const ROSTER: UnitSpec[] = [
  // Patrols: Kesklinn / prefecture HQ (the original 2024 officers ride here)
  {
    callsign: 'PÕHJA 11',
    type: 'patrol',
    stationId: 'pohja-hq',
    vehicle: 'Škoda Octavia Combi',
    crew: 2,
    shift: 'both',
    crewNames: [
      { firstName: 'Kalle', lastName: 'Rebane', badge: '085', gender: 'M' },
      { firstName: 'Priit', lastName: 'Saar', badge: '013', gender: 'M' },
    ],
  },
  {
    callsign: 'PÕHJA 12',
    type: 'patrol',
    stationId: 'pohja-hq',
    vehicle: 'Škoda Superb Combi',
    crew: 2,
    shift: 'both',
    crewNames: [{ firstName: 'Eeva', lastName: 'Leht', badge: '044', gender: 'F' }],
  },
  {
    callsign: 'PÕHJA 13',
    type: 'patrol',
    stationId: 'pohja-hq',
    vehicle: 'Škoda Octavia Combi',
    crew: 2,
    shift: 'night',
    crewNames: [
      { firstName: 'Pille', lastName: 'Vits', badge: '051', gender: 'F' },
      { firstName: 'Jenni', lastName: 'Must', badge: '052', gender: 'F' },
    ],
  },
  // Ida-Harju
  { callsign: 'PÕHJA 21', type: 'patrol', stationId: 'pohja-idaharju', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'both' },
  { callsign: 'PÕHJA 22', type: 'patrol', stationId: 'pohja-idaharju', vehicle: 'Toyota RAV4 Hybrid', crew: 2, shift: 'both' },
  { callsign: 'PÕHJA 23', type: 'patrol', stationId: 'pohja-idaharju', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'night' },
  // Lääne-Harju
  { callsign: 'PÕHJA 31', type: 'patrol', stationId: 'pohja-laaneharju', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'both' },
  { callsign: 'PÕHJA 32', type: 'patrol', stationId: 'pohja-laaneharju', vehicle: 'Škoda Superb Combi', crew: 2, shift: 'both' },
  { callsign: 'PÕHJA 33', type: 'patrol', stationId: 'pohja-laaneharju', vehicle: 'Škoda Scala', crew: 2, shift: 'night' },
  // Põhja-Tallinn
  { callsign: 'PÕHJA 41', type: 'patrol', stationId: 'pohja-pohjatallinn', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'both' },
  // Rural Harju
  { callsign: 'PÕHJA 51', type: 'patrol', stationId: 'pohja-kose', vehicle: 'Škoda Kodiaq', crew: 2, shift: 'both' },
  { callsign: 'PÕHJA 61', type: 'patrol', stationId: 'pohja-saku', vehicle: 'Škoda Kodiaq', crew: 2, shift: 'both' },

  // Rapid response (kiirreageerijad)
  {
    callsign: 'PÕHJA K1',
    type: 'rapid',
    stationId: 'pohja-hq',
    vehicle: 'Škoda Superb Combi 4x4',
    crew: 2,
    shift: 'both',
    crewNames: [
      { firstName: 'Toomas', lastName: 'Perk', badge: '570', gender: 'M' },
      { firstName: 'Karel', lastName: 'Tael', badge: '571', gender: 'M' },
    ],
  },
  { callsign: 'PÕHJA K2', type: 'rapid', stationId: 'pohja-idaharju', vehicle: 'Volkswagen Transporter', crew: 3, shift: 'night' },

  // Specialists
  { callsign: 'PÕHJA KOER 1', type: 'k9', stationId: 'pohja-laaneharju', vehicle: 'Škoda Kodiaq (koeraboksiga)', crew: 1, shift: 'both' },
  { callsign: 'PÕHJA LIIKLUS 1', type: 'traffic', stationId: 'pohja-hq', vehicle: 'BMW 530d xDrive (märgistamata)', crew: 2, shift: 'both' },
  {
    callsign: 'PÕHJA KRIMI 1',
    type: 'criminal',
    stationId: 'pohja-hq',
    vehicle: 'Škoda Superb (märgistamata)',
    crew: 2,
    shift: 'both',
    crewNames: [
      { firstName: 'Ursula', lastName: 'Treen', badge: '960', gender: 'F' },
      { firstName: 'Reimo', lastName: 'Rann', badge: '961', gender: 'M' },
    ],
  },
  { callsign: 'PÕHJA KONSTAABEL 1', type: 'community', stationId: 'pohja-pohjatallinn', vehicle: 'Volkswagen Tiguan', crew: 1, shift: 'day' },
  { callsign: 'PÕHJA KONVOI 1', type: 'transport', stationId: 'pohja-arest', vehicle: 'Mercedes-Benz Sprinter (konvoibuss)', crew: 2, shift: 'both' },
  { callsign: 'KOBRA 1', type: 'special', stationId: 'pohja-hq', vehicle: 'Mercedes-Benz Sprinter (eriüksus)', crew: 6, shift: 'both', onCall: true },
  { callsign: 'KOPTER 1', type: 'heli', stationId: 'pohja-lennusalk', vehicle: 'AgustaWestland AW139', crew: 4, shift: 'both', onCall: true },
  { callsign: 'PÕHJA ABI 1', type: 'aux', stationId: 'pohja-hq', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'night' },

  // ── veteran: a fuller day shift and extra night cover
  { callsign: 'PÕHJA 14', type: 'patrol', stationId: 'pohja-hq', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'day', minDifficulty: 'veteran' },
  { callsign: 'PÕHJA 24', type: 'patrol', stationId: 'pohja-idaharju', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'day', minDifficulty: 'veteran' },
  { callsign: 'PÕHJA 34', type: 'patrol', stationId: 'pohja-laaneharju', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'day', minDifficulty: 'veteran' },
  { callsign: 'PÕHJA 42', type: 'patrol', stationId: 'pohja-pohjatallinn', vehicle: 'Škoda Scala', crew: 2, shift: 'night', minDifficulty: 'veteran' },
  { callsign: 'PÕHJA 62', type: 'patrol', stationId: 'pohja-saku', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'night', minDifficulty: 'veteran' },
  { callsign: 'PÕHJA K3', type: 'rapid', stationId: 'pohja-laaneharju', vehicle: 'Škoda Superb Combi 4x4', crew: 2, shift: 'day', minDifficulty: 'veteran' },
  { callsign: 'PÕHJA KOER 2', type: 'k9', stationId: 'pohja-idaharju', vehicle: 'Volkswagen Transporter (koeraboksiga)', crew: 1, shift: 'night', minDifficulty: 'veteran' },
  { callsign: 'PÕHJA KRIMI 2', type: 'criminal', stationId: 'pohja-idaharju', vehicle: 'Volkswagen Passat (märgistamata)', crew: 2, shift: 'day', minDifficulty: 'veteran' },
  { callsign: 'PÕHJA KONSTAABEL 2', type: 'community', stationId: 'pohja-idaharju', vehicle: 'Škoda Octavia', crew: 1, shift: 'day', minDifficulty: 'veteran' },
  { callsign: 'PÕHJA ABI 2', type: 'aux', stationId: 'pohja-idaharju', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'night', minDifficulty: 'veteran' },

  // ── realistic: the Friday-night strength of a big city
  { callsign: 'PÕHJA 15', type: 'patrol', stationId: 'pohja-hq', vehicle: 'Volkswagen ID.4 GTX', crew: 2, shift: 'night', minDifficulty: 'realistic' },
  { callsign: 'PÕHJA 25', type: 'patrol', stationId: 'pohja-idaharju', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'night', minDifficulty: 'realistic' },
  { callsign: 'PÕHJA 35', type: 'patrol', stationId: 'pohja-laaneharju', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'night', minDifficulty: 'realistic' },
  { callsign: 'PÕHJA 43', type: 'patrol', stationId: 'pohja-pohjatallinn', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'day', minDifficulty: 'realistic' },
  { callsign: 'PÕHJA 52', type: 'patrol', stationId: 'pohja-kose', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'day', minDifficulty: 'realistic' },
  { callsign: 'PÕHJA LIIKLUS 2', type: 'traffic', stationId: 'pohja-laaneharju', vehicle: 'Škoda Superb (märgistamata)', crew: 2, shift: 'day', minDifficulty: 'realistic' },
  { callsign: 'PÕHJA KONVOI 2', type: 'transport', stationId: 'pohja-arest', vehicle: 'Mercedes-Benz Sprinter (konvoibuss)', crew: 2, shift: 'night', minDifficulty: 'realistic' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Towns (population ≈ 2024-25, ruShare = share of Russian-speaking residents)
// ─────────────────────────────────────────────────────────────────────────────

const H = 'Harju maakond';

// prettier-ignore
const TOWNS: Town[] = [
  { name: TLN, county: H, coord: [24.7453, 59.437], population: 457000, ruShare: 0.4 },
  { name: 'Maardu', county: H, coord: [25.025, 59.4767], population: 16000, ruShare: 0.75 },
  { name: 'Keila', county: H, coord: [24.413, 59.3036], population: 10800, ruShare: 0.16 },
  { name: 'Saue', county: H, coord: [24.5525, 59.3203], population: 6000, ruShare: 0.13 },
  { name: 'Paldiski', county: H, coord: [24.0531, 59.3567], population: 3800, ruShare: 0.62 },
  { name: 'Kehra', county: H, coord: [25.3211, 59.3361], population: 2600, ruShare: 0.25 },
  { name: 'Loksa', county: H, coord: [25.7214, 59.5764], population: 2600, ruShare: 0.45 },
  { name: 'Haabneeme', county: H, coord: [24.8211, 59.5114], population: 6300, ruShare: 0.1 },
  { name: 'Viimsi', county: H, coord: [24.8425, 59.5003], population: 2600, ruShare: 0.1 },
  { name: 'Peetri', county: H, coord: [24.8149, 59.3946], population: 6700, ruShare: 0.15 },
  { name: 'Laagri', county: H, coord: [24.6142, 59.3508], population: 5800, ruShare: 0.13 },
  { name: 'Saku', county: H, coord: [24.6578, 59.3022], population: 5300, ruShare: 0.08 },
  { name: 'Jüri', county: H, coord: [24.8942, 59.3542], population: 4900, ruShare: 0.1 },
  { name: 'Tabasalu', county: H, coord: [24.5420, 59.4275], population: 4300, ruShare: 0.1 },
  { name: 'Loo', county: H, coord: [24.9483, 59.4364], population: 2600, ruShare: 0.3 },
  { name: 'Kiili', county: H, coord: [24.8378, 59.3071], population: 2200, ruShare: 0.1 },
  { name: 'Kangru', county: H, coord: [24.7875, 59.3486], population: 1800, ruShare: 0.1 },
  { name: 'Aruküla', county: H, coord: [25.0772, 59.3644], population: 1800, ruShare: 0.06 },
  { name: 'Luige', county: H, coord: [24.7752, 59.3309], population: 1700, ruShare: 0.1 },
  { name: 'Kose', county: H, coord: [25.1694, 59.182], population: 1600, ruShare: 0.04 },
  { name: 'Lagedi', county: H, coord: [24.9377, 59.3997], population: 1500, ruShare: 0.12 },
  { name: 'Assaku', county: H, coord: [24.8422, 59.3725], population: 1500, ruShare: 0.12 },
  { name: 'Raasiku', county: H, coord: [25.1831, 59.3664], population: 1300, ruShare: 0.05 },
  { name: 'Kuusalu', county: H, coord: [25.4414, 59.4439], population: 1300, ruShare: 0.05 },
  { name: 'Vaida', county: H, coord: [24.9658, 59.2906], population: 1000, ruShare: 0.05 },
  { name: 'Vasalemma', county: H, coord: [24.2857, 59.2363], population: 1000, ruShare: 0.2 },
  { name: 'Klooga', county: H, coord: [24.222, 59.3123], population: 900, ruShare: 0.35 },
  { name: 'Kiisa', county: H, coord: [24.6821, 59.2392], population: 900, ruShare: 0.04 },
  { name: 'Harku', county: H, coord: [24.597, 59.3814], population: 900, ruShare: 0.1 },
  { name: 'Kostivere', county: H, coord: [25.0959, 59.4262], population: 800, ruShare: 0.15 },
  { name: 'Riisipere', county: H, coord: [24.3106, 59.1142], population: 800, ruShare: 0.08 },
  { name: 'Aegviidu', county: H, coord: [25.6145, 59.2803], population: 750, ruShare: 0.07 },
  { name: 'Turba', county: H, coord: [24.225, 59.0831], population: 600, ruShare: 0.1 },
  { name: 'Kolga', county: H, coord: [25.6373, 59.4895], population: 450, ruShare: 0.05 },
  { name: 'Keila-Joa', county: H, coord: [24.2988, 59.4002], population: 450, ruShare: 0.1 },
  { name: 'Ämari', county: H, coord: [24.2051, 59.2597], population: 400, ruShare: 0.25 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Streets: points are ordered by house number. Districts use the official
// linnaosa names (Kesklinn, Lasnamäe, Mustamäe, Põhja-Tallinn, Haabersti,
// Kristiine, Nõmme, Pirita). Streets crossing a district border are split.
// ─────────────────────────────────────────────────────────────────────────────

const KESK = 'Kesklinn';
const LASN = 'Lasnamäe';
const MUST = 'Mustamäe';
const PT = 'Põhja-Tallinn';
const HAAB = 'Haabersti';
const KRIS = 'Kristiine';
const NOMME = 'Nõmme';
const PIR = 'Pirita';

// prettier-ignore
const STREETS: Street[] = [
  // ── Kesklinn
  st('p-st-parnu-kesk', 'Pärnu mnt', TLN, KESK, [[24.7455, 59.434], [24.744, 59.429], [24.7398, 59.421], [24.7362, 59.4128], [24.7318, 59.404], [24.7295, 59.3975]], [1, 250], 'mixed', 3),
  st('p-st-narva-kesk', 'Narva mnt', TLN, KESK, [[24.755, 59.4366], [24.7705, 59.4386], [24.7885, 59.4402], [24.806, 59.4428]], [1, 99], 'mixed', 2.5),
  st('p-st-tartu-kesk', 'Tartu mnt', TLN, KESK, [[24.7575, 59.4348], [24.7655, 59.4318], [24.7745, 59.4285], [24.7785, 59.4268]], [1, 80], 'mixed', 2.5),
  st('p-st-liivalaia', 'Liivalaia tn', TLN, KESK, [[24.7395, 59.4302], [24.7462, 59.4296], [24.7555, 59.4308], [24.7645, 59.4318]], [1, 56], 'mixed', 1.5),
  st('p-st-gonsiori', 'Gonsiori tn', TLN, KESK, [[24.7578, 59.4356], [24.7695, 59.4362], [24.7815, 59.437]], [1, 40], 'apartment', 1.5),
  st('p-st-endla-kesk', 'Endla tn', TLN, KESK, [[24.7385, 59.4318], [24.7345, 59.4307], [24.7295, 59.4294]], [1, 39], 'apartment', 1.5),
  st('p-st-kaupmehe', 'Kaupmehe tn', TLN, KESK, [[24.7468, 59.4318], [24.7478, 59.4295]], [1, 14], 'mixed', 0.8),
  st('p-st-tatari', 'Tatari tn', TLN, KESK, [[24.7448, 59.4322], [24.7428, 59.4288]], [1, 64], 'mixed', 1),
  st('p-st-raua', 'Raua tn', TLN, KESK, [[24.764, 59.4356], [24.7668, 59.433]], [1, 40], 'apartment', 1),
  st('p-st-juhkentali', 'Juhkentali tn', TLN, KESK, [[24.7612, 59.4322], [24.7652, 59.4288], [24.7705, 59.4255]], [1, 60], 'mixed', 1),
  st('p-st-kreutzwaldi', 'F. R. Kreutzwaldi tn', TLN, KESK, [[24.7695, 59.4386], [24.7705, 59.4361], [24.7722, 59.4328]], [1, 64], 'apartment', 1.2),
  st('p-st-pikk', 'Pikk tn', TLN, KESK, [[24.7428, 59.4369], [24.7458, 59.4383], [24.7478, 59.4402], [24.7498, 59.4418]], [1, 71], 'mixed', 1),
  st('p-st-vene', 'Vene tn', TLN, KESK, [[24.748, 59.4366], [24.7488, 59.4384], [24.7485, 59.4404]], [1, 37], 'mixed', 0.8),
  st('p-st-suurkarja', 'Suur-Karja tn', TLN, KESK, [[24.7455, 59.4364], [24.7468, 59.4351]], [1, 23], 'commercial', 0.8),
  st('p-st-viru', 'Viru tn', TLN, KESK, [[24.7468, 59.4369], [24.7518, 59.4365]], [1, 30], 'commercial', 0.6),
  st('p-st-tonismagi', 'Tõnismägi', TLN, KESK, [[24.7395, 59.4325], [24.7402, 59.4302]], [1, 16], 'apartment', 0.8),
  st('p-st-vanalouna', 'Vana-Lõuna tn', TLN, KESK, [[24.7405, 59.4285], [24.7378, 59.4235], [24.736, 59.4195]], [1, 41], 'apartment', 1.2),
  st('p-st-suurameerika', 'Suur-Ameerika tn', TLN, KESK, [[24.739, 59.4287], [24.7335, 59.4252]], [1, 44], 'apartment', 1.2),
  st('p-st-vaikeameerika', 'Väike-Ameerika tn', TLN, KESK, [[24.7376, 59.4296], [24.7312, 59.4263]], [1, 40], 'apartment', 1.2),
  st('p-st-koidu', 'Koidu tn', TLN, KESK, [[24.7292, 59.4299], [24.7333, 59.4258], [24.7372, 59.4228]], [1, 90], 'apartment', 1.2),
  st('p-st-sakala', 'Sakala tn', TLN, KESK, [[24.746, 59.4331], [24.7495, 59.4311]], [1, 24], 'mixed', 0.8),
  st('p-st-roosikrantsi', 'Roosikrantsi tn', TLN, KESK, [[24.7425, 59.4331], [24.7442, 59.4305]], [1, 24], 'mixed', 0.8),
  st('p-st-toompuiestee', 'Toompuiestee', TLN, KESK, [[24.7395, 59.4328], [24.7372, 59.4355], [24.7368, 59.4388]], [1, 37], 'mixed', 0.8),
  st('p-st-estonia', 'Estonia pst', TLN, KESK, [[24.7462, 59.4342], [24.751, 59.4348], [24.7555, 59.4352]], [1, 15], 'commercial', 0.6),
  st('p-st-ravala', 'Rävala pst', TLN, KESK, [[24.7475, 59.4325], [24.7545, 59.432], [24.7605, 59.4328]], [1, 20], 'commercial', 0.7),
  st('p-st-mere', 'Mere pst', TLN, KESK, [[24.7525, 59.4372], [24.7535, 59.4405], [24.7555, 59.4432]], [1, 20], 'mixed', 0.6),
  st('p-st-weizenbergi', 'A. Weizenbergi tn', TLN, KESK, [[24.7805, 59.4372], [24.7865, 59.4378], [24.7925, 59.4378]], [1, 40], 'apartment', 1),
  st('p-st-poska', 'J. Poska tn', TLN, KESK, [[24.7795, 59.4395], [24.783, 59.437], [24.7855, 59.4345]], [1, 54], 'mixed', 1),
  st('p-st-lastekodu', 'Lastekodu tn', TLN, KESK, [[24.7675, 59.4302], [24.7735, 59.4272]], [1, 46], 'apartment', 1),
  st('p-st-pirita-kesk', 'Pirita tee', TLN, KESK, [[24.7962, 59.4438], [24.8075, 59.4502], [24.8122, 59.4555]], [1, 76], 'mixed', 0.7),

  // ── Põhja-Tallinn
  st('p-st-kopli', 'Kopli tn', TLN, PT, [[24.7348, 59.4412], [24.7228, 59.4466], [24.7108, 59.4532], [24.7002, 59.4612], [24.6962, 59.4676]], [1, 103], 'mixed', 2.5),
  st('p-st-sole', 'Sõle tn', TLN, PT, [[24.7075, 59.4342], [24.7045, 59.441], [24.7005, 59.4478]], [1, 80], 'apartment', 1.5),
  st('p-st-telliskivi', 'Telliskivi tn', TLN, PT, [[24.7115, 59.4372], [24.7205, 59.4385], [24.7295, 59.4396]], [1, 62], 'mixed', 1.5),
  st('p-st-paljassaare', 'Paljassaare tee', TLN, PT, [[24.6985, 59.4548], [24.685, 59.4612], [24.6645, 59.4628]], [1, 120], 'mixed', 0.5),
  st('p-st-pohjapst', 'Põhja pst', TLN, PT, [[24.7385, 59.4406], [24.744, 59.4427], [24.7498, 59.4446]], [1, 35], 'mixed', 1),
  st('p-st-ristiku', 'Ristiku tn', TLN, PT, [[24.7215, 59.4392], [24.7198, 59.4418], [24.7175, 59.4446]], [1, 80], 'apartment', 1.2),
  st('p-st-kalaranna', 'Kalaranna tn', TLN, PT, [[24.7486, 59.4457], [24.744, 59.4477], [24.7397, 59.4499]], [1, 60], 'mixed', 0.8),
  st('p-st-toostuse', 'Tööstuse tn', TLN, PT, [[24.729, 59.4435], [24.72, 59.449], [24.714, 59.4524]], [1, 103], 'mixed', 1.2),
  st('p-st-paldiski-pt', 'Paldiski mnt', TLN, PT, [[24.733, 59.4372], [24.7182, 59.4345], [24.7035, 59.4322], [24.6905, 59.4305]], [1, 80], 'mixed', 1.5),
  st('p-st-kolde', 'Kolde pst', TLN, PT, [[24.7035, 59.4425], [24.6985, 59.4442], [24.6935, 59.446]], [1, 90], 'apartment', 1.5),
  st('p-st-kotzebue', 'Kotzebue tn', TLN, PT, [[24.7345, 59.4432], [24.7275, 59.4455]], [1, 50], 'house', 1),
  st('p-st-vanakalamaja', 'Vana-Kalamaja tn', TLN, PT, [[24.7395, 59.4418], [24.7362, 59.4455]], [1, 47], 'mixed', 0.8),
  st('p-st-soo', 'Soo tn', TLN, PT, [[24.7375, 59.4425], [24.7302, 59.4452]], [1, 40], 'house', 0.8),
  st('p-st-sitsi', 'Sitsi tn', TLN, PT, [[24.7165, 59.4512], [24.7085, 59.4498]], [1, 30], 'apartment', 0.8),
  st('p-st-pelguranna', 'Pelguranna tn', TLN, PT, [[24.7085, 59.4462], [24.7025, 59.4492]], [1, 50], 'apartment', 1.2),
  st('p-st-puhangu', 'Puhangu tn', TLN, PT, [[24.6995, 59.4498], [24.6935, 59.4482]], [1, 80], 'apartment', 1),

  // ── Haabersti
  st('p-st-paldiski-haab', 'Paldiski mnt', TLN, HAAB, [[24.6882, 59.4298], [24.6705, 59.428], [24.652, 59.4248], [24.632, 59.4212], [24.611, 59.4142]], [81, 240], 'mixed', 1.5),
  st('p-st-oismae', 'Õismäe tee', TLN, HAAB, [[24.672, 59.4196], [24.6552, 59.4152], [24.638, 59.4118], [24.626, 59.4135]], [1, 200], 'apartment', 3),
  st('p-st-jarveotsa', 'Järveotsa tee', TLN, HAAB, [[24.6515, 59.4168], [24.6455, 59.4178], [24.6395, 59.4158], [24.6402, 59.4118]], [1, 50], 'apartment', 2),
  st('p-st-astangu', 'Astangu tn', TLN, HAAB, [[24.629, 59.4048], [24.6205, 59.4022]], [1, 70], 'apartment', 1),
  st('p-st-tahetorni', 'Tähetorni tn', TLN, HAAB, [[24.6295, 59.3968], [24.6145, 59.3962], [24.6015, 59.3978]], [1, 150], 'house', 1),
  st('p-st-kakumae', 'Kakumäe tee', TLN, HAAB, [[24.638, 59.4312], [24.618, 59.44], [24.598, 59.4478]], [1, 120], 'house', 1),
  st('p-st-rannamoisa', 'Rannamõisa tee', TLN, HAAB, [[24.628, 59.4262], [24.6165, 59.4282], [24.6085, 59.4298]], [1, 60], 'house', 0.8),
  st('p-st-vabaohumuuseumi', 'Vabaõhumuuseumi tee', TLN, HAAB, [[24.6445, 59.4262], [24.6395, 59.4308]], [1, 20], 'house', 0.5),
  st('p-st-pikaliiva', 'Pikaliiva tn', TLN, HAAB, [[24.623, 59.4175], [24.6155, 59.4158]], [1, 60], 'house', 0.8),

  // ── Kristiine
  st('p-st-endla-kris', 'Endla tn', TLN, KRIS, [[24.7245, 59.4283], [24.7185, 59.4266]], [40, 70], 'mixed', 1),
  st('p-st-tulika', 'Tulika tn', TLN, KRIS, [[24.7178, 59.4302], [24.7162, 59.4252]], [1, 50], 'apartment', 1),
  st('p-st-kotka', 'Kotka tn', TLN, KRIS, [[24.7232, 59.4205], [24.7172, 59.4175]], [1, 26], 'apartment', 1),
  st('p-st-tammsaare-kris', 'A. H. Tammsaare tee', TLN, KRIS, [[24.733, 59.4113], [24.722, 59.4095], [24.7125, 59.4082]], [1, 50], 'mixed', 1.2),
  st('p-st-mustamae', 'Mustamäe tee', TLN, KRIS, [[24.7175, 59.4262], [24.7002, 59.4232], [24.685, 59.4207], [24.6762, 59.4194]], [1, 60], 'mixed', 1.5),
  st('p-st-sopruse-kris', 'Sõpruse pst', TLN, KRIS, [[24.7185, 59.4255], [24.706, 59.419], [24.6965, 59.414]], [1, 140], 'apartment', 1.5),
  st('p-st-rahumae-kris', 'Rahumäe tee', TLN, KRIS, [[24.7262, 59.3972], [24.7178, 59.3958], [24.7075, 59.3955]], [1, 30], 'mixed', 0.8),
  st('p-st-linnu', 'Linnu tee', TLN, KRIS, [[24.7148, 59.4182], [24.7065, 59.4158]], [1, 30], 'apartment', 0.8),
  st('p-st-tondi', 'Tondi tn', TLN, KRIS, [[24.7295, 59.4102], [24.7225, 59.4065], [24.7175, 59.4032]], [1, 90], 'mixed', 1),

  // ── Mustamäe
  st('p-st-sopruse-must', 'Sõpruse pst', TLN, MUST, [[24.6935, 59.412], [24.675, 59.4098], [24.6565, 59.4082]], [141, 260], 'apartment', 3),
  st('p-st-ehitajate', 'Ehitajate tee', TLN, MUST, [[24.6755, 59.3936], [24.66, 59.3952], [24.6478, 59.4005], [24.6548, 59.4088], [24.6712, 59.416]], [1, 109], 'apartment', 2.5),
  st('p-st-akadeemia', 'Akadeemia tee', TLN, MUST, [[24.6642, 59.3968], [24.663, 59.404], [24.664, 59.41]], [1, 50], 'apartment', 2),
  st('p-st-vilde', 'E. Vilde tee', TLN, MUST, [[24.688, 59.412], [24.6872, 59.404], [24.689, 59.3966]], [1, 130], 'apartment', 2.5),
  st('p-st-tammsaare-must', 'A. H. Tammsaare tee', TLN, MUST, [[24.7055, 59.4064], [24.69, 59.404], [24.674, 59.4005]], [51, 140], 'apartment', 2.5),
  st('p-st-kadaka', 'Kadaka tee', TLN, MUST, [[24.678, 59.416], [24.6722, 59.408], [24.67, 59.4002]], [1, 200], 'mixed', 1.5),
  st('p-st-sutiste', 'J. Sütiste tee', TLN, MUST, [[24.7, 59.3975], [24.685, 59.396], [24.6725, 59.3975]], [1, 60], 'apartment', 2),
  st('p-st-keskuse', 'Keskuse tn', TLN, MUST, [[24.6815, 59.4062], [24.6865, 59.4085]], [1, 30], 'apartment', 1),
  st('p-st-retke', 'Retke tee', TLN, MUST, [[24.6745, 59.4048], [24.6782, 59.4002]], [1, 70], 'apartment', 1),

  // ── Nõmme
  st('p-st-parnu-nomme', 'Pärnu mnt', TLN, NOMME, [[24.7215, 59.3915], [24.706, 59.38], [24.683, 59.368], [24.645, 59.3575], [24.6265, 59.3542]], [251, 560], 'mixed', 1.5),
  st('p-st-valdeku', 'Valdeku tn', TLN, NOMME, [[24.703, 59.378], [24.68, 59.372], [24.66, 59.368]], [1, 150], 'house', 1.5),
  st('p-st-vabaduse', 'Vabaduse pst', TLN, NOMME, [[24.7178, 59.3925], [24.695, 59.388], [24.683, 59.384], [24.655, 59.372]], [1, 200], 'mixed', 1.5),
  st('p-st-jaama-nomme', 'Jaama tn', TLN, NOMME, [[24.6838, 59.3862], [24.6872, 59.3832]], [1, 30], 'mixed', 0.8),
  st('p-st-liiva', 'Liiva tn', TLN, NOMME, [[24.734, 59.383], [24.7298, 59.3802]], [1, 40], 'house', 0.8),
  st('p-st-rahumae-nomme', 'Rahumäe tee', TLN, NOMME, [[24.7035, 59.3915], [24.6935, 59.3905]], [31, 70], 'house', 0.8),
  st('p-st-raudtee', 'Raudtee tn', TLN, NOMME, [[24.6925, 59.3878], [24.676, 59.3825], [24.66, 59.3762]], [1, 100], 'house', 1),
  st('p-st-vanamustamae', 'Vana-Mustamäe tn', TLN, NOMME, [[24.6795, 59.3885], [24.6655, 59.389]], [1, 50], 'house', 0.8),
  st('p-st-manniku', 'Männiku tee', TLN, NOMME, [[24.7155, 59.3825], [24.719, 59.372], [24.722, 59.3645]], [1, 120], 'house', 1),

  // ── Pirita
  st('p-st-pirita-pir', 'Pirita tee', TLN, PIR, [[24.817, 59.459], [24.8225, 59.4638], [24.8272, 59.4668]], [77, 180], 'mixed', 0.8),
  st('p-st-merivalja', 'Merivälja tee', TLN, PIR, [[24.838, 59.471], [24.8425, 59.479], [24.842, 59.488], [24.837, 59.4945]], [1, 100], 'house', 1.5),
  st('p-st-kloostrimetsa', 'Kloostrimetsa tee', TLN, PIR, [[24.842, 59.4688], [24.865, 59.467], [24.8865, 59.4702]], [1, 60], 'house', 0.6),
  st('p-st-kose-pir', 'Kose tee', TLN, PIR, [[24.834, 59.4645], [24.855, 59.461], [24.878, 59.458]], [1, 100], 'house', 1.2),
  st('p-st-supluse', 'Supluse pst', TLN, PIR, [[24.8305, 59.4712], [24.8365, 59.477]], [1, 20], 'house', 0.6),
  st('p-st-mahe', 'Mähe tee', TLN, PIR, [[24.848, 59.4835], [24.868, 59.4848], [24.885, 59.4875]], [1, 60], 'house', 1),
  st('p-st-randvere-pir', 'Randvere tee', TLN, PIR, [[24.8535, 59.4728], [24.866, 59.4785], [24.879, 59.4865]], [1, 40], 'house', 0.8),

  // ── Lasnamäe
  st('p-st-tartu-lasn', 'Tartu mnt', TLN, LASN, [[24.786, 59.4247], [24.793, 59.4226], [24.7965, 59.4195], [24.806, 59.4128], [24.8165, 59.4112]], [81, 140], 'commercial', 0.8),
  st('p-st-laagna', 'Laagna tee', TLN, LASN, [[24.801, 59.4328], [24.835, 59.4368], [24.87, 59.4408], [24.905, 59.4452]], [1, 110], 'mixed', 1),
  st('p-st-peterburi', 'Peterburi tee', TLN, LASN, [[24.797, 59.4262], [24.83, 59.4292], [24.865, 59.4322], [24.915, 59.4355]], [1, 120], 'commercial', 1),
  st('p-st-mustakivi', 'Mustakivi tee', TLN, LASN, [[24.8775, 59.4385], [24.879, 59.444], [24.8805, 59.4495]], [1, 40], 'apartment', 2),
  st('p-st-punane', 'Punane tn', TLN, LASN, [[24.846, 59.431], [24.8475, 59.435], [24.849, 59.4395]], [1, 80], 'apartment', 2.5),
  st('p-st-pae', 'Pae tn', TLN, LASN, [[24.815, 59.4285], [24.8165, 59.4322]], [1, 80], 'apartment', 2),
  st('p-st-majaka', 'Majaka tn', TLN, LASN, [[24.8085, 59.4285], [24.8095, 59.4315]], [1, 30], 'apartment', 1.2),
  st('p-st-smuuli', 'J. Smuuli tee', TLN, LASN, [[24.833, 59.4295], [24.834, 59.4365], [24.8355, 59.444]], [1, 50], 'apartment', 1.5),
  st('p-st-kuristiku', 'Kuristiku tn', TLN, LASN, [[24.824, 59.4405], [24.83, 59.443]], [1, 80], 'apartment', 1.5),
  st('p-st-paekaare', 'Paekaare tn', TLN, LASN, [[24.839, 59.4395], [24.846, 59.443]], [1, 80], 'apartment', 1.5),
  st('p-st-umera', 'Ümera tn', TLN, LASN, [[24.856, 59.44], [24.8575, 59.447]], [1, 60], 'apartment', 2),
  st('p-st-linnamae', 'Linnamäe tee', TLN, LASN, [[24.835, 59.4505], [24.86, 59.4512], [24.885, 59.4522]], [1, 110], 'apartment', 2),
  st('p-st-karberi', 'Kärberi tn', TLN, LASN, [[24.865, 59.4445], [24.876, 59.4462], [24.885, 59.4475]], [1, 60], 'apartment', 2),
  st('p-st-vikerlase', 'Vikerlase tn', TLN, LASN, [[24.883, 59.4448], [24.895, 59.4468]], [1, 25], 'apartment', 1.5),
  st('p-st-laanemere', 'Läänemere tee', TLN, LASN, [[24.886, 59.4495], [24.899, 59.452], [24.904, 59.4545]], [1, 80], 'apartment', 2),
  st('p-st-kivila', 'Kivila tn', TLN, LASN, [[24.893, 59.4375], [24.8965, 59.443]], [1, 40], 'apartment', 1.5),
  st('p-st-tahesaju', 'Tähesaju tee', TLN, LASN, [[24.903, 59.4345], [24.9045, 59.4395], [24.906, 59.4438]], [1, 40], 'mixed', 1),
  st('p-st-mahtra', 'Mahtra tn', TLN, LASN, [[24.887, 59.436], [24.89, 59.44]], [1, 60], 'apartment', 1.5),
  st('p-st-raadiku', 'Raadiku tn', TLN, LASN, [[24.8655, 59.4372], [24.869, 59.4395]], [1, 12], 'apartment', 1.2),

  // ── Harju towns
  st('p-st-maardu-keemikute', 'Keemikute tn', 'Maardu', undefined, [[25.02, 59.473], [25.028, 59.479]], [1, 60], 'apartment', 2),
  st('p-st-maardu-kallasmaa', 'Kallasmaa tn', 'Maardu', undefined, [[25.026, 59.475], [25.033, 59.476]], [1, 30], 'apartment', 1.2),
  st('p-st-maardu-nurga', 'Nurga tn', 'Maardu', undefined, [[25.023, 59.4775], [25.029, 59.48]], [1, 20], 'apartment', 1),
  st('p-st-maardu-parna', 'Pärna tn', 'Maardu', undefined, [[25.03, 59.478], [25.036, 59.479]], [1, 30], 'mixed', 0.8),
  st('p-st-keila-haapsalu', 'Haapsalu mnt', 'Keila', undefined, [[24.413, 59.304], [24.4, 59.3], [24.388, 59.296]], [1, 90], 'mixed', 1.2),
  st('p-st-keila-paldiski', 'Paldiski mnt', 'Keila', undefined, [[24.414, 59.306], [24.408, 59.313]], [1, 40], 'mixed', 1),
  st('p-st-keila-piiri', 'Piiri tn', 'Keila', undefined, [[24.42, 59.302], [24.424, 59.307]], [1, 20], 'apartment', 1),
  st('p-st-keila-pohja', 'Põhja tn', 'Keila', undefined, [[24.412, 59.308], [24.418, 59.311]], [1, 30], 'apartment', 0.8),
  st('p-st-saue-tule', 'Tule tn', 'Saue', undefined, [[24.548, 59.319], [24.556, 59.322]], [1, 30], 'apartment', 1),
  st('p-st-saue-kutise', 'Kütise tn', 'Saue', undefined, [[24.542, 59.323], [24.548, 59.326]], [1, 20], 'house', 0.8),
  st('p-st-saue-ridva', 'Ridva tn', 'Saue', undefined, [[24.56, 59.318], [24.565, 59.32]], [1, 20], 'house', 0.6),
  st('p-st-paldiski-rae', 'Rae tn', 'Paldiski', undefined, [[24.052, 59.354], [24.056, 59.36]], [1, 40], 'apartment', 1),
  st('p-st-paldiski-sadama', 'Sadama tn', 'Paldiski', undefined, [[24.056, 59.3565], [24.0475, 59.3585]], [1, 30], 'mixed', 0.6),
  st('p-st-paldiski-mere', 'Mere tn', 'Paldiski', undefined, [[24.048, 59.358], [24.047, 59.361]], [1, 20], 'apartment', 0.6),
  st('p-st-viimsi-randvere', 'Randvere tee', 'Viimsi', undefined, [[24.8445, 59.4995], [24.856, 59.5035], [24.87, 59.5075]], [41, 120], 'house', 1),
  st('p-st-haabneeme-sopruse', 'Sõpruse tee', 'Haabneeme', undefined, [[24.818, 59.505], [24.825, 59.51]], [1, 30], 'mixed', 1),
  st('p-st-haabneeme-kesk', 'Kesk tee', 'Haabneeme', undefined, [[24.821, 59.511], [24.825, 59.515]], [1, 20], 'apartment', 0.8),
  st('p-st-juri-arukula', 'Aruküla tee', 'Jüri', undefined, [[24.895, 59.354], [24.905, 59.356]], [1, 60], 'mixed', 1),
  st('p-st-juri-veski', 'Veski tee', 'Jüri', undefined, [[24.893, 59.353], [24.89, 59.351]], [1, 20], 'house', 0.6),
  st('p-st-saku-tallinna', 'Tallinna mnt', 'Saku', undefined, [[24.66, 59.308], [24.664, 59.302]], [1, 40], 'mixed', 1),
  st('p-st-saku-uksnurme', 'Üksnurme tee', 'Saku', undefined, [[24.658, 59.3], [24.65, 59.299]], [1, 20], 'house', 0.6),
  st('p-st-laagri-parnu', 'Pärnu mnt', 'Laagri', undefined, [[24.62, 59.3515], [24.613, 59.3485], [24.604, 59.345]], [550, 620], 'mixed', 1),
  st('p-st-laagri-veskitammi', 'Veskitammi tn', 'Laagri', undefined, [[24.608, 59.348], [24.605, 59.351]], [1, 40], 'apartment', 0.8),
  st('p-st-tabasalu-klooga', 'Klooga mnt', 'Tabasalu', undefined, [[24.555, 59.427], [24.54, 59.429], [24.525, 59.431]], [1, 50], 'mixed', 1),
  st('p-st-tabasalu-sorve', 'Sõrve tee', 'Tabasalu', undefined, [[24.55, 59.425], [24.545, 59.422]], [1, 30], 'house', 0.6),
  st('p-st-peetri-veesaare', 'Veesaare tee', 'Peetri', undefined, [[24.81, 59.396], [24.816, 59.393]], [1, 20], 'apartment', 1),
  st('p-st-kehra-kose', 'Kose mnt', 'Kehra', undefined, [[25.328, 59.336], [25.32, 59.33]], [1, 30], 'mixed', 0.8),
  st('p-st-kehra-kooli', 'Kooli tn', 'Kehra', undefined, [[25.323, 59.338], [25.33, 59.339]], [1, 20], 'apartment', 0.6),
  st('p-st-loksa-tallinna', 'Tallinna tn', 'Loksa', undefined, [[25.715, 59.576], [25.725, 59.579]], [1, 50], 'mixed', 0.8),
  st('p-st-loksa-posti', 'Posti tn', 'Loksa', undefined, [[25.719, 59.578], [25.722, 59.574]], [1, 20], 'apartment', 0.6),
  st('p-st-kiili-nabala', 'Nabala tee', 'Kiili', undefined, [[24.838, 59.309], [24.84, 59.301]], [1, 30], 'mixed', 0.6),
  st('p-st-kuusalu-kuusalu', 'Kuusalu tee', 'Kuusalu', undefined, [[25.438, 59.443], [25.445, 59.446]], [1, 30], 'mixed', 0.5),
  st('p-st-aegviidu-piibe', 'Piibe mnt', 'Aegviidu', undefined, [[25.612, 59.28], [25.62, 59.283]], [1, 20], 'house', 0.4),
];

// ─────────────────────────────────────────────────────────────────────────────
// Places (curated real points of interest; generic names for businesses)
// ─────────────────────────────────────────────────────────────────────────────

// prettier-ignore
const PLACES: Place[] = [
  // Malls & shopping
  pl('p-pl-viru-keskus', 'Viru Keskus', 'mall', TLN, KESK, 'Viru väljak 4', [24.7556, 59.4362], ['tourist']),
  pl('p-pl-kaubamaja', 'Tallinna Kaubamaja', 'mall', TLN, KESK, 'Gonsiori tn 2', [24.7572, 59.4352]),
  pl('p-pl-solaris', 'Solarise keskus', 'mall', TLN, KESK, 'Estonia pst 9', [24.7533, 59.4334]),
  pl('p-pl-rotermann', 'Rotermanni kvartal', 'shop', TLN, KESK, 'Rotermanni tn 8', [24.757, 59.4381], ['tourist']),
  pl('p-pl-nautica', 'Nautica keskus', 'mall', TLN, KESK, 'Ahtri tn 9', [24.7648, 59.4405]),
  pl('p-pl-keskturg', 'Keskturg', 'shop', TLN, KESK, 'Keldrimäe tn 9', [24.7632, 59.429], ['russian']),
  pl('p-pl-kristiine-keskus', 'Kristiine keskus', 'mall', TLN, KRIS, 'Endla tn 45', [24.7225, 59.4272]),
  pl('p-pl-jarve-keskus', 'Järve keskus', 'mall', TLN, KRIS, 'Pärnu mnt 238', [24.7255, 59.3975]),
  pl('p-pl-ulemiste', 'Ülemiste keskus', 'mall', TLN, LASN, 'Suur-Sõjamäe tn 4', [24.7935, 59.4222]),
  pl('p-pl-t1', 'T1 Mall of Tallinn', 'mall', TLN, LASN, 'Peterburi tee 2', [24.7975, 59.4258]),
  pl('p-pl-sikupilli', 'Sikupilli keskus', 'mall', TLN, LASN, 'Tartu mnt 87', [24.788, 59.425]),
  pl('p-pl-lasnamae-centrum', 'Lasnamäe Centrum', 'mall', TLN, LASN, 'Mustakivi tee 13', [24.876, 59.4395], ['russian']),
  pl('p-pl-rocca', 'Rocca al Mare keskus', 'mall', TLN, HAAB, 'Paldiski mnt 102', [24.65, 59.4258]),
  pl('p-pl-mustamae-keskus', 'Mustamäe keskus', 'mall', TLN, MUST, 'A. H. Tammsaare tee 104a', [24.683, 59.4025]),
  pl('p-pl-magistrali', 'Magistrali keskus', 'mall', TLN, MUST, 'Sõpruse pst 201', [24.658, 59.4085]),
  pl('p-pl-arsenal', 'Arsenali keskus', 'mall', TLN, PT, 'Erika tn 14', [24.711, 59.447]),
  pl('p-pl-balti-turg', 'Balti jaama turg', 'shop', TLN, PT, 'Kopli tn 1', [24.7342, 59.4412], ['tourist']),
  pl('p-pl-nomme-turg', 'Nõmme turg', 'shop', TLN, NOMME, 'Jaama tn 18', [24.686, 59.3842]),
  pl('p-pl-toidupood-kopli', 'Toidukauplus (Kopli)', 'shop', TLN, PT, 'Kopli tn 82', [24.7015, 59.4605], ['russian']),
  pl('p-pl-toidupood-oismae', 'Toidukauplus (Õismäe)', 'shop', TLN, HAAB, 'Õismäe tee 46', [24.6505, 59.4142]),
  pl('p-pl-toidupood-pirita', 'Toidukauplus (Pirita)', 'shop', TLN, PIR, 'Merivälja tee 24', [24.8395, 59.4745]),
  pl('p-pl-maardu-keskus', 'Kaubanduskeskus (Maardu)', 'mall', 'Maardu', undefined, 'Keemikute tn 41', [25.027, 59.4772], ['russian']),
  pl('p-pl-viimsi-keskus', 'Viimsi keskus', 'mall', 'Haabneeme', undefined, 'Sõpruse tee 15', [24.82, 59.506]),
  pl('p-pl-laagri-keskus', 'Kaubanduskeskus (Laagri)', 'mall', 'Laagri', undefined, 'Pärnu mnt 556', [24.618, 59.3512]),
  pl('p-pl-keila-pood', 'Toidukauplus (Keila)', 'shop', 'Keila', undefined, 'Piiri tn 12', [24.4215, 59.3045]),

  // Bars & nightlife
  pl('p-pl-klubi-vanaviru', 'Ööklubi (Vana-Viru)', 'nightclub', TLN, KESK, 'Vana-Viru tn 10', [24.7498, 59.4366], ['nightlife', 'tourist']),
  pl('p-pl-pubi-suurkarja', 'Pubi (Suur-Karja)', 'bar', TLN, KESK, 'Suur-Karja tn 18', [24.7464, 59.4354], ['nightlife', 'tourist']),
  pl('p-pl-baar-vaikekarja', 'Baar (Väike-Karja)', 'bar', TLN, KESK, 'Väike-Karja tn 1', [24.7462, 59.436], ['nightlife']),
  pl('p-pl-klubi-harju', 'Ööklubi (Harju tn)', 'nightclub', TLN, KESK, 'Harju tn 6', [24.7446, 59.4356], ['nightlife']),
  pl('p-pl-korts-raekoda', 'Kõrts (Raekoja plats)', 'bar', TLN, KESK, 'Raekoja plats 11', [24.7458, 59.4374], ['nightlife', 'tourist']),
  pl('p-pl-baar-rotermann', 'Baar (Rotermanni kvartal)', 'bar', TLN, KESK, 'Rotermanni tn 2', [24.7562, 59.4377], ['nightlife']),
  pl('p-pl-baar-telliskivi', 'Telliskivi Loomelinnaku baar', 'bar', TLN, PT, 'Telliskivi tn 60a', [24.7288, 59.4398], ['nightlife']),
  pl('p-pl-klubi-telliskivi', 'Ööklubi (Telliskivi)', 'nightclub', TLN, PT, 'Telliskivi tn 60a', [24.7275, 59.4392], ['nightlife']),
  pl('p-pl-pubi-kalamaja', 'Pubi (Kalamaja)', 'bar', TLN, PT, 'Vana-Kalamaja tn 9', [24.7385, 59.4428], ['nightlife']),
  pl('p-pl-pohjala', 'Põhjala tehas', 'bar', TLN, PT, 'Marati tn 5', [24.6995, 59.4585], ['nightlife']),
  pl('p-pl-karaoke-lasnamae', 'Karaokebaar (Lasnamäe)', 'bar', TLN, LASN, 'Mustakivi tee 17', [24.8792, 59.4412], ['nightlife', 'russian']),
  pl('p-pl-pubi-mustamae', 'Pubi (Mustamäe)', 'bar', TLN, MUST, 'Sõpruse pst 174', [24.6885, 59.4112], ['nightlife']),
  pl('p-pl-baar-nomme', 'Baar (Nõmme keskus)', 'bar', TLN, NOMME, 'Jaama tn 7', [24.6852, 59.3852], ['nightlife']),

  // Banks (generic names, real streets)
  pl('p-pl-pank-liivalaia', 'Pank (Liivalaia)', 'bank', TLN, KESK, 'Liivalaia tn 8', [24.7478, 59.43]),
  pl('p-pl-pank-tornimae', 'Pank (Tornimäe)', 'bank', TLN, KESK, 'Tornimäe tn 2', [24.7612, 59.4338]),
  pl('p-pl-pank-tartu', 'Pank (Tartu mnt)', 'bank', TLN, KESK, 'Tartu mnt 2', [24.7588, 59.4344]),
  pl('p-pl-pank-centrum', 'Pank (Lasnamäe)', 'bank', TLN, LASN, 'Mustakivi tee 13', [24.8768, 59.4392]),
  pl('p-pl-pank-rocca', 'Pank (Rocca al Mare)', 'bank', TLN, HAAB, 'Paldiski mnt 102', [24.6508, 59.4255]),
  pl('p-pl-pank-maardu', 'Pank (Maardu)', 'bank', 'Maardu', undefined, 'Keemikute tn 41', [25.0275, 59.4768]),

  // Schools, kindergartens, universities
  pl('p-pl-reaalkool', 'Tallinna Reaalkool', 'school', TLN, KESK, 'Estonia pst 6', [24.749, 59.4344]),
  pl('p-pl-gag', 'Gustav Adolfi Gümnaasium', 'school', TLN, KESK, 'Suur-Kloostri tn 16', [24.742, 59.4393]),
  pl('p-pl-prantsuse', 'Tallinna Prantsuse Lütseum', 'school', TLN, KESK, 'Hariduse tn 3', [24.7408, 59.4305]),
  pl('p-pl-kuristiku-g', 'Tallinna Kuristiku Gümnaasium', 'school', TLN, LASN, 'Kuristiku tn 7', [24.827, 59.4425], ['russian']),
  pl('p-pl-pelgulinna-g', 'Pelgulinna Gümnaasium', 'school', TLN, PT, 'Ristiku tn 69', [24.7172, 59.4442]),
  pl('p-pl-pirita-mg', 'Pirita Majandusgümnaasium', 'school', TLN, PIR, 'Metsavahi tee 19', [24.852, 59.4625]),
  pl('p-pl-oismae-g', 'Õismäe gümnaasium', 'school', TLN, HAAB, 'Õismäe tee 109', [24.6395, 59.4125]),
  pl('p-pl-mustamae-g', 'Mustamäe gümnaasium', 'school', TLN, MUST, 'E. Vilde tee 75', [24.6875, 59.4055]),
  pl('p-pl-nomme-g', 'Nõmme gümnaasium', 'school', TLN, NOMME, 'Vabaduse pst 105', [24.6745, 59.3795]),
  pl('p-pl-keila-kool', 'Keila kool', 'school', 'Keila', undefined, 'Ehitajate tn', [24.418, 59.3015]),
  pl('p-pl-juri-g', 'Jüri gümnaasium', 'school', 'Jüri', undefined, 'Laste tn 3', [24.8965, 59.3555]),
  pl('p-pl-lasteaed-umera', 'Lasteaed (Lasnamäe)', 'kindergarten', TLN, LASN, 'Ümera tn 39', [24.8578, 59.4442], ['russian']),
  pl('p-pl-lasteaed-vilde', 'Lasteaed (Mustamäe)', 'kindergarten', TLN, MUST, 'E. Vilde tee 69', [24.6862, 59.4075]),
  pl('p-pl-lasteaed-kopli', 'Lasteaed (Kopli)', 'kindergarten', TLN, PT, 'Kopli tn 64', [24.7095, 59.4545]),
  pl('p-pl-lasteaed-saue', 'Lasteaed (Saue)', 'kindergarten', 'Saue', undefined, 'Tule tn 18', [24.552, 59.3205]),
  pl('p-pl-taltech', 'Tallinna Tehnikaülikool (TalTech)', 'university', TLN, MUST, 'Ehitajate tee 5', [24.6712, 59.395]),
  pl('p-pl-tlu', 'Tallinna Ülikool', 'university', TLN, KESK, 'Narva mnt 25', [24.7702, 59.4386]),
  pl('p-pl-eka', 'Eesti Kunstiakadeemia', 'university', TLN, PT, 'Põhja pst 7', [24.7425, 59.4428]),
  pl('p-pl-emta', 'Eesti Muusika- ja Teatriakadeemia', 'university', TLN, KESK, 'Rävala pst 16', [24.7515, 59.4316]),
  pl('p-pl-sisekaitse', 'Sisekaitseakadeemia', 'university', TLN, PIR, 'Kase tn 61', [24.833, 59.461]),
  pl('p-pl-tehnikakorgkool', 'Tallinna Tehnikakõrgkool', 'university', TLN, KESK, 'Pärnu mnt 62', [24.743, 59.4258]),

  // Hospitals
  pl('p-pl-perh', 'Põhja-Eesti Regionaalhaigla (PERH)', 'hospital', TLN, MUST, 'J. Sütiste tee 19', [24.6945, 59.3985]),
  pl('p-pl-itk', 'Ida-Tallinna Keskhaigla', 'hospital', TLN, KESK, 'Ravi tn 18', [24.7595, 59.4305]),
  pl('p-pl-itk-magdaleena', 'Ida-Tallinna Keskhaigla (Magdaleena)', 'hospital', TLN, KESK, 'Pärnu mnt 104', [24.7392, 59.4205]),
  pl('p-pl-ltkh', 'Lääne-Tallinna Keskhaigla', 'hospital', TLN, PT, 'Paldiski mnt 68', [24.7035, 59.4318]),

  // Transport hubs
  pl('p-pl-balti-jaam', 'Balti jaam', 'trainstation', TLN, KESK, 'Toompuiestee 35', [24.7382, 59.4394], ['tourist']),
  pl('p-pl-bussijaam', 'Tallinna bussijaam', 'busstation', TLN, KESK, 'Lastekodu tn 46', [24.771, 59.4278]),
  pl('p-pl-ulemiste-jaam', 'Ülemiste raudteejaam', 'trainstation', TLN, LASN, 'Suur-Sõjamäe tn 2', [24.7985, 59.422]),
  pl('p-pl-nomme-jaam', 'Nõmme raudteepeatus', 'trainstation', TLN, NOMME, 'Jaama tn', [24.6832, 59.3866]),
  pl('p-pl-keila-jaam', 'Keila raudteejaam', 'trainstation', 'Keila', undefined, 'Jaama tn 1', [24.4108, 59.3065]),
  pl('p-pl-aegviidu-jaam', 'Aegviidu raudteejaam', 'trainstation', 'Aegviidu', undefined, 'Jaama tn', [25.6065, 59.2848]),
  pl('p-pl-lennujaam', 'Lennart Meri Tallinna lennujaam', 'airport', TLN, LASN, 'Lennujaama tee 2', [24.7995, 59.4165], ['tourist']),
  pl('p-pl-a-terminal', 'Vanasadam, A-terminal', 'port', TLN, KESK, 'Sadama tn 25', [24.769, 59.443], ['tourist']),
  pl('p-pl-d-terminal', 'Vanasadam, D-terminal', 'port', TLN, KESK, 'Lootsi tn 13', [24.777, 59.441], ['tourist']),
  pl('p-pl-pirita-sadam', 'Pirita sadam', 'port', TLN, PIR, 'Regati pst 1', [24.8265, 59.4665]),
  pl('p-pl-muuga', 'Muuga sadam', 'port', 'Maardu', undefined, 'Muuga sadam, Maardu', [24.995, 59.488], ['industrial']),
  pl('p-pl-paldiski-louna', 'Paldiski Lõunasadam', 'port', 'Paldiski', undefined, 'Lõunasadam, Paldiski', [24.088, 59.336]),
  pl('p-pl-paldiski-pohja', 'Paldiski Põhjasadam', 'port', 'Paldiski', undefined, 'Põhjasadam, Paldiski', [24.049, 59.3625]),
  pl('p-pl-loksa-sadam', 'Loksa sadam', 'port', 'Loksa', undefined, 'Sadama tn, Loksa', [25.7085, 59.584]),

  // Stadiums & concert venues
  pl('p-pl-alecoq', 'A. Le Coq Arena', 'stadium', TLN, KRIS, 'Asula tn 4c', [24.709, 59.415]),
  pl('p-pl-kalev', 'Kalevi keskstaadion', 'stadium', TLN, KESK, 'Juhkentali tn 12', [24.7655, 59.428]),
  pl('p-pl-kadrioru-staadion', 'Kadrioru staadion', 'stadium', TLN, KESK, 'Roheline aas 24', [24.7835, 59.4368]),
  pl('p-pl-tondiraba', 'Tondiraba jäähall', 'stadium', TLN, LASN, 'Varraku tn 14', [24.879, 59.433]),
  pl('p-pl-lauluvaljak', 'Tallinna lauluväljak', 'concert', TLN, KESK, 'Narva mnt 95', [24.8095, 59.4435], ['tourist']),
  pl('p-pl-suurhall', 'Saku Suurhall (Unibet Arena)', 'concert', TLN, HAAB, 'Paldiski mnt 104b', [24.6478, 59.427]),
  pl('p-pl-estonia', 'Rahvusooper Estonia', 'concert', TLN, KESK, 'Estonia pst 4', [24.751, 59.4351], ['tourist']),
  pl('p-pl-linnahall', 'Linnahall', 'concert', TLN, KESK, 'Mere pst 20', [24.7562, 59.4452]),
  pl('p-pl-kultuurikatel', 'Kultuurikatel', 'concert', TLN, PT, 'Põhja pst 27a', [24.751, 59.4449], ['nightlife']),

  // Parks, beaches, lakes, forests
  pl('p-pl-kadriorg', 'Kadrioru park', 'park', TLN, KESK, 'A. Weizenbergi tn', [24.79, 59.4388], ['tourist']),
  pl('p-pl-toompark', 'Toompark (Snelli tiik)', 'park', TLN, KESK, 'Toompuiestee', [24.739, 59.438]),
  pl('p-pl-kalamaja-park', 'Kalamaja park', 'park', TLN, PT, 'Kalamaja park', [24.734, 59.4448]),
  pl('p-pl-oismae-jarv', 'Õismäe järv ja park', 'park', TLN, HAAB, 'Järveotsa tee', [24.6455, 59.414]),
  pl('p-pl-glehn', 'Glehni park', 'park', TLN, NOMME, 'Vana-Mustamäe tn 48', [24.664, 59.39]),
  pl('p-pl-pirita-rand', 'Pirita rand', 'beach', TLN, PIR, 'Pirita tee', [24.8295, 59.4705], ['tourist']),
  pl('p-pl-stroomi', 'Stroomi rand', 'beach', TLN, PT, 'Ranna tee', [24.696, 59.4474], ['russian']),
  pl('p-pl-kakumae-rand', 'Kakumäe rand', 'beach', TLN, HAAB, 'Kakumäe tee', [24.5895, 59.4515]),
  pl('p-pl-haabneeme-rand', 'Haabneeme rand', 'beach', 'Haabneeme', undefined, 'Kaluri tee', [24.8175, 59.5135]),
  pl('p-pl-ulemiste-jarv', 'Ülemiste järv', 'lake', TLN, KESK, 'Ülemiste järv', [24.768, 59.4005]),
  pl('p-pl-harku-jarv', 'Harku järv', 'lake', TLN, HAAB, 'Harku järv', [24.609, 59.4185]),
  pl('p-pl-maardu-jarv', 'Maardu järv', 'lake', 'Maardu', undefined, 'Maardu järv', [24.9885, 59.452]),
  pl('p-pl-rummu', 'Rummu karjäär', 'lake', 'Lääne-Harju vald', undefined, 'Rummu alevik', [24.1965, 59.2265]),
  pl('p-pl-nomme-mets', 'Nõmme-Mustamäe maastikukaitseala', 'forest', TLN, NOMME, 'Vana-Mustamäe tn', [24.6555, 59.3865]),
  pl('p-pl-paaskula-raba', 'Pääsküla raba', 'forest', TLN, NOMME, 'Pääsküla raba', [24.626, 59.36]),
  pl('p-pl-kloostrimets', 'Kloostrimets', 'forest', TLN, PIR, 'Kloostrimetsa tee', [24.872, 59.474]),
  pl('p-pl-paljassaare', 'Paljassaare hoiuala', 'park', TLN, PT, 'Paljassaare tee', [24.66, 59.463]),
  pl('p-pl-korvemaa', 'Kõrvemaa matkarajad', 'forest', 'Anija vald', undefined, 'Kõrvemaa, Anija vald', [25.68, 59.3]),
  pl('p-pl-nabala', 'Nabala-Tuhala maastikukaitseala', 'forest', 'Kiili vald', undefined, 'Nabala küla', [24.87, 59.265]),
  pl('p-pl-lahemaa-juminda', 'Lahemaa rahvuspark (Juminda poolsaar)', 'forest', 'Kuusalu vald', undefined, 'Juminda küla', [25.53, 59.61]),
  pl('p-pl-keila-joa', 'Keila juga', 'park', 'Keila-Joa', undefined, 'Keila-Joa alevik', [24.3065, 59.3945], ['tourist']),
  pl('p-pl-pakri', 'Pakri pank ja tuletorn', 'park', 'Paldiski', undefined, 'Pakri poolsaar', [24.04, 59.385], ['tourist']),

  // Highways (major roads in Harju)
  pl('p-pl-e20-18', 'Tallinna-Narva mnt (E20), 18. km', 'highway', 'Jõelähtme vald', undefined, 'Tallinna-Narva mnt (E20), 18. km', [25.05, 59.4475]),
  pl('p-pl-e20-38', 'Tallinna-Narva mnt (E20), 38. km', 'highway', 'Kuusalu vald', undefined, 'Tallinna-Narva mnt (E20), 38. km', [25.43, 59.438]),
  pl('p-pl-e263-20', 'Tallinna-Tartu mnt (E263), 20. km', 'highway', 'Rae vald', undefined, 'Tallinna-Tartu mnt (E263), 20. km', [24.97, 59.285]),
  pl('p-pl-e263-35', 'Tallinna-Tartu mnt (E263), 35. km', 'highway', 'Kose vald', undefined, 'Tallinna-Tartu mnt (E263), 35. km', [25.075, 59.203]),
  pl('p-pl-e67-25', 'Tallinna-Pärnu mnt (E67), 25. km', 'highway', 'Saue vald', undefined, 'Tallinna-Pärnu mnt (E67), 25. km', [24.53, 59.26]),
  pl('p-pl-ringtee-juri', 'Tallinna ringtee (11), Jüri liiklussõlm', 'highway', 'Rae vald', undefined, 'Tallinna ringtee (11), Jüri', [24.89, 59.364]),
  pl('p-pl-ringtee-saue', 'Tallinna ringtee (11), Saue', 'highway', 'Saue vald', undefined, 'Tallinna ringtee (11), Saue', [24.585, 59.314]),
  pl('p-pl-paldiski-mnt-8', 'Tallinna-Paldiski mnt (8), Harku', 'highway', 'Harku vald', undefined, 'Tallinna-Paldiski mnt (8), 12. km', [24.58, 59.408]),

  // Government, embassies, prisons, border
  pl('p-pl-toompea', 'Toompea loss (Riigikogu)', 'government', TLN, KESK, 'Lossi plats 1a', [24.7375, 59.435], ['tourist']),
  pl('p-pl-stenbock', 'Stenbocki maja (Valitsus)', 'government', TLN, KESK, 'Rahukohtu tn 3', [24.738, 59.4377]),
  pl('p-pl-linnavalitsus', 'Tallinna linnavalitsus', 'government', TLN, KESK, 'Vabaduse väljak 7', [24.743, 59.4332]),
  pl('p-pl-siseministeerium', 'Siseministeerium', 'government', TLN, KESK, 'Pikk tn 61', [24.749, 59.441]),
  pl('p-pl-maakohus', 'Harju Maakohus', 'government', TLN, KESK, 'Lubja tn 4', [24.759, 59.439]),
  pl('p-pl-saatkond-kentmanni', 'Saatkond (Kentmanni tn)', 'embassy', TLN, KESK, 'Kentmanni tn 20', [24.747, 59.4315]),
  pl('p-pl-saatkond-pikk', 'Saatkond (Pikk tn)', 'embassy', TLN, KESK, 'Pikk tn 19', [24.747, 59.4397]),
  pl('p-pl-saatkond-kohtu', 'Saatkond (Kohtu tn)', 'embassy', TLN, KESK, 'Kohtu tn 4', [24.7393, 59.438]),
  pl('p-pl-vangla', 'Tallinna Vangla', 'prison', 'Rae vald', undefined, 'Linnaaru tee 5, Soodevahe küla', [24.889, 59.4165]),
  pl('p-pl-piir-vanasadam', 'Vanasadama piirikontroll', 'border', TLN, KESK, 'Sadama tn 25', [24.7685, 59.4425]),
  pl('p-pl-piir-lennujaam', 'Lennujaama piirikontroll', 'border', TLN, LASN, 'Lennujaama tee 2', [24.8005, 59.4162]),

  // Gas stations (generic, real junctions)
  pl('p-pl-tankla-parnu', 'Tankla (Pärnu mnt)', 'gasstation', TLN, KESK, 'Pärnu mnt 141', [24.7352, 59.4112]),
  pl('p-pl-tankla-peterburi', 'Tankla (Peterburi tee)', 'gasstation', TLN, LASN, 'Peterburi tee 50', [24.842, 59.4302]),
  pl('p-pl-tankla-paldiski', 'Tankla (Paldiski mnt)', 'gasstation', TLN, HAAB, 'Paldiski mnt 229', [24.62, 59.418]),
  pl('p-pl-tankla-mustamae', 'Tankla (Mustamäe tee)', 'gasstation', TLN, KRIS, 'Mustamäe tee 49', [24.695, 59.4225]),
  pl('p-pl-tankla-vao', 'Tankla (Väo)', 'gasstation', TLN, LASN, 'Peterburi tee 92', [24.908, 59.435]),
  pl('p-pl-tankla-juri', 'Tankla (Jüri)', 'gasstation', 'Jüri', undefined, 'Tartu mnt, Jüri', [24.893, 59.3605]),
  pl('p-pl-tankla-keila', 'Tankla (Keila)', 'gasstation', 'Keila', undefined, 'Haapsalu mnt, Keila', [24.398, 59.2995]),

  // Industry, offices, construction, parking
  pl('p-pl-ulemiste-city', 'Ülemiste City', 'office', TLN, LASN, 'Valukoja tn 8', [24.803, 59.4215]),
  pl('p-pl-maakri', 'Maakri kvartali büroohooned', 'office', TLN, KESK, 'Maakri tn 19', [24.7605, 59.4325]),
  pl('p-pl-lasnamae-toostus', 'Lasnamäe tööstuspiirkond', 'industrial', TLN, LASN, 'Peterburi tee 46', [24.84, 59.4285]),
  pl('p-pl-kadaka-toostus', 'Kadaka tööstuspiirkond', 'industrial', TLN, MUST, 'Kadaka tee 70', [24.6728, 59.4095]),
  pl('p-pl-paljassaare-vesi', 'Paljassaare reoveepuhasti', 'industrial', TLN, PT, 'Paljassaare tee', [24.668, 59.4615]),
  pl('p-pl-muuga-toostus', 'Muuga sadama tööstusala', 'industrial', 'Maardu', undefined, 'Muuga sadam, Maardu', [25.01, 59.4865]),
  pl('p-pl-iru', 'Iru elektrijaam', 'industrial', 'Jõelähtme vald', undefined, 'Iru küla', [24.931, 59.4565]),
  pl('p-pl-kehra-tehas', 'Kehra paberitehas', 'industrial', 'Kehra', undefined, 'Kose mnt, Kehra', [25.326, 59.332]),
  pl('p-pl-ehitus-ulemiste', 'Ehitusplats (Rail Baltica Ülemiste terminal)', 'construction', TLN, LASN, 'Suur-Sõjamäe tn', [24.7975, 59.4232]),
  pl('p-pl-ehitus-kalaranna', 'Ehitusplats (Kalaranna)', 'construction', TLN, PT, 'Kalaranna tn', [24.7445, 59.447]),
  pl('p-pl-ehitus-kopli', 'Ehitusplats (Kopli liinid)', 'construction', TLN, PT, 'Kopli tn', [24.699, 59.4685]),
  pl('p-pl-parkla-viru', 'Viru keskuse parkla', 'parking', TLN, KESK, 'Viru väljak 4', [24.7548, 59.4358]),
  pl('p-pl-parkla-ulemiste', 'Ülemiste keskuse parkla', 'parking', TLN, LASN, 'Suur-Sõjamäe tn 4', [24.7945, 59.4212]),
  pl('p-pl-parkla-lennujaam', 'Lennujaama parkla P1', 'parking', TLN, LASN, 'Lennujaama tee 2', [24.8015, 59.4175]),
  pl('p-pl-parkla-rocca', 'Rocca al Mare parkla', 'parking', TLN, HAAB, 'Paldiski mnt 102', [24.6512, 59.4265]),

  // Hotels
  pl('p-pl-hotell-viru', 'Hotell (Viru väljak)', 'hotel', TLN, KESK, 'Viru väljak 4', [24.7552, 59.4366], ['tourist']),
  pl('p-pl-hotell-ravala', 'Hotell (Rävala pst)', 'hotel', TLN, KESK, 'Rävala pst 3', [24.7555, 59.432], ['tourist']),
  pl('p-pl-hotell-tornimae', 'Hotell (Tornimäe)', 'hotel', TLN, KESK, 'Tornimäe tn 3', [24.7618, 59.433], ['tourist']),
  pl('p-pl-hotell-pirita', 'Hotell (Pirita)', 'hotel', TLN, PIR, 'Regati pst 1', [24.8255, 59.4658]),

  // Churches, cemeteries, old town, museums
  pl('p-pl-oleviste', 'Oleviste kirik', 'church', TLN, KESK, 'Lai tn 50', [24.7474, 59.4415], ['tourist']),
  pl('p-pl-toomkirik', 'Toomkirik', 'church', TLN, KESK, 'Toomkooli tn 6', [24.7378, 59.4373], ['tourist']),
  pl('p-pl-nevski', 'Aleksander Nevski katedraal', 'church', TLN, KESK, 'Lossi plats 10', [24.7392, 59.4358], ['tourist', 'russian']),
  pl('p-pl-kaarli', 'Kaarli kirik', 'church', TLN, KESK, 'Toompuiestee 4', [24.739, 59.4327]),
  pl('p-pl-puhavaimu', 'Pühavaimu kirik', 'church', TLN, KESK, 'Pühavaimu tn 2', [24.7462, 59.4383], ['tourist']),
  pl('p-pl-pirita-klooster', 'Pirita klooster', 'church', TLN, PIR, 'Merivälja tee 18', [24.837, 59.471], ['tourist']),
  pl('p-pl-metsakalmistu', 'Metsakalmistu', 'cemetery', TLN, PIR, 'Kloostrimetsa tee 36', [24.865, 59.4662]),
  pl('p-pl-rahumae-kalmistu', 'Rahumäe kalmistu', 'cemetery', TLN, NOMME, 'Rahumäe tee', [24.704, 59.3878]),
  pl('p-pl-raekoja-plats', 'Raekoja plats', 'oldtown', TLN, KESK, 'Raekoja plats 1', [24.7454, 59.437], ['tourist', 'nightlife']),
  pl('p-pl-viru-varav', 'Viru värav', 'oldtown', TLN, KESK, 'Viru tn', [24.7505, 59.4366], ['tourist']),
  pl('p-pl-pikk-jalg', 'Pikk jalg ja Toompea vaateplatvormid', 'oldtown', TLN, KESK, 'Kohtu tn', [24.7405, 59.4382], ['tourist']),
  pl('p-pl-kumu', 'KUMU kunstimuuseum', 'museum', TLN, KESK, 'A. Weizenbergi tn 34', [24.7972, 59.4358], ['tourist']),
  pl('p-pl-kadrioru-loss', 'Kadrioru kunstimuuseum', 'museum', TLN, KESK, 'A. Weizenbergi tn 37', [24.7905, 59.4382], ['tourist']),
  pl('p-pl-lennusadam', 'Lennusadam (meremuuseum)', 'museum', TLN, PT, 'Vesilennuki tn 6', [24.7385, 59.4508], ['tourist']),
  pl('p-pl-vabaohumuuseum', 'Eesti Vabaõhumuuseum', 'museum', TLN, HAAB, 'Vabaõhumuuseumi tee 12', [24.638, 59.4325], ['tourist']),
  pl('p-pl-niguliste', 'Niguliste muuseum', 'museum', TLN, KESK, 'Niguliste tn 3', [24.7432, 59.4362], ['tourist']),
  pl('p-pl-maarjamae', 'Maarjamäe loss (Ajaloomuuseum)', 'museum', TLN, KESK, 'Pirita tee 56', [24.808, 59.4505]),
  pl('p-pl-teletorn', 'Tallinna teletorn', 'museum', TLN, PIR, 'Kloostrimetsa tee 58a', [24.8874, 59.4711], ['tourist']),
  pl('p-pl-loomaaed', 'Tallinna loomaaed', 'park', TLN, HAAB, 'Paldiski mnt 145', [24.6586, 59.4239], ['tourist']),

  // Rural Harju: villages, farms, summerhouses
  pl('p-pl-suvila-lohusalu', 'Suvilaala (Lohusalu)', 'summerhouse', 'Lääne-Harju vald', undefined, 'Lohusalu küla', [24.2, 59.3985]),
  pl('p-pl-suvila-kloogaranna', 'Suvilad (Kloogaranna)', 'summerhouse', 'Lääne-Harju vald', undefined, 'Kloogaranna küla', [24.2553, 59.3417]),
  pl('p-pl-suvila-kaberneeme', 'Suvilad (Kaberneeme)', 'summerhouse', 'Jõelähtme vald', undefined, 'Kaberneeme küla', [25.2581, 59.4984]),
  pl('p-pl-suvila-leesi', 'Suvilad (Leesi)', 'summerhouse', 'Kuusalu vald', undefined, 'Leesi küla', [25.5083, 59.6053]),
  pl('p-pl-talu-habaja', 'Talu (Habaja)', 'farm', 'Kose vald', undefined, 'Habaja alevik', [25.178, 59.0965]),
  pl('p-pl-talu-koue', 'Talu (Kõue)', 'farm', 'Kose vald', undefined, 'Kõue küla', [25.2466, 59.086]),
  pl('p-pl-talu-ruila', 'Talu (Ruila)', 'farm', 'Saue vald', undefined, 'Ruila küla', [24.4344, 59.1888]),
  pl('p-pl-kula-anija', 'Anija küla ja mõis', 'village', 'Anija vald', undefined, 'Anija küla', [25.2933, 59.378]),
  pl('p-pl-kula-kolga', 'Kolga', 'village', 'Kuusalu vald', undefined, 'Kolga alevik', [25.6373, 59.4895]),
  pl('p-pl-kula-padise', 'Padise klooster ja küla', 'village', 'Lääne-Harju vald', undefined, 'Padise küla', [24.1316, 59.2173], ['tourist']),
];

/**
 * Russian-speaking share per Tallinn linnaosa (docs/research/names-demographics.md §5.3).
 * The Tallinn Town entry carries the city average (0.4); an engine that knows the district of
 * an incident (Street.district / Place.district) can refine caller language with this table.
 */
export const TALLINN_DISTRICT_RU_SHARE: Record<string, number> = {
  Lasnamäe: 0.62,
  'Põhja-Tallinn': 0.47,
  Haabersti: 0.42,
  Mustamäe: 0.38,
  Kristiine: 0.28,
  Kesklinn: 0.22,
  Pirita: 0.13,
  Nõmme: 0.1,
};

export const REGION_POHJA: RegionDef = {
  id: 'pohja',
  name: { et: 'Põhja prefektuur', en: 'North Prefecture' },
  short: 'PÕHJA',
  hqCity: TLN,
  counties: [H],
  center: [24.75, 59.432],
  zoom: 11,
  bounds: [
    [23.7, 58.97],
    [25.98, 59.68],
  ],
  description: {
    et: 'Põhja prefektuur teenindab Harjumaad koos Tallinnaga, kus elab ligi 45% Eesti elanikest. Vanalinna ööelu, Lasnamäe ja Mustamäe magalad, sadamad, lennujaam ning tihe liiklus ringteel annavad juhtimiskeskusele riigi suurima väljakutsete voo. Linnast väljas ulatub vastutusala Paldiskist Loksani ja Kõrvemaa metsadeni.',
    en: "The North Prefecture covers Harju County including Tallinn, home to nearly 45% of Estonia's population. Old-town nightlife, the Lasnamäe and Mustamäe housing estates, the ports, the airport and heavy ring-road traffic give the command centre the busiest call load in the country. Outside the city the area stretches from Paldiski to Loksa and the Kõrvemaa forests.",
  },
  callVolume: 6,
  zones: [{ id: 'mainland', name: { et: 'Mandriosa', en: 'Mainland' }, ferryMinutes: 0 }],
  stations: STATIONS,
  arrestHouseId: 'pohja-arest',
  roster: ROSTER,
  towns: TOWNS,
  streets: STREETS,
  places: PLACES,
  radioName: 'Põhja',
  commander: {
    name: 'Liisa Tamm',
    title: { et: 'Prefekt, politseikindral', en: 'Prefect, police general' },
    badge: '002',
    gender: 'F',
  },
};
