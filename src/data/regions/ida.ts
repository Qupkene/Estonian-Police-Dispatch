/**
 * Ida prefektuur: Ida-Viru maakond + Lääne-Viru maakond (HQ Jõhvi).
 *
 * Sources: docs/research/ppa-organisation.md (Narva/Jõhvi/Rakvere jaoskonnad, Kohtla-Järve and
 * Tapa offices, Viru Vangla taking over arrest-house duties, Narva-1 checkpoint and Narva
 * kordon; Mustajõe and Alajõe posts are closed), prior geographic knowledge and the processed
 * geodata in src/data/geo (county polygons, Kohtla-Järve district polygons, settlement
 * centroids). Points are checked in tests/regions-pohja-ida.test.ts.
 *
 * ── Radio callsigns (FICTIONAL, same scheme as Põhja, see pohja.ts) ────────────────────
 *   "IDA xy"            patrol crew: x = base, y = crew number
 *       1y  Narva jaoskond          2y  Jõhvi jaoskond (prefecture HQ)
 *       3y  Kohtla-Järve (Järve/Ahtme)   4y  Sillamäe
 *       5y  Rakvere jaoskond        6y  Tapa       7y  Kiviõli      8y  Narva-Jõesuu
 *   "IDA K1…"           kiirreageerijad        "IDA KOER n"     K9
 *   "IDA LIIKLUS n"     traffic                "IDA KRIMI n"    criminal police
 *   "IDA KONSTAABEL n"  community officer      "IDA KONVOI n"   detainee transport
 *   "IDA ABI n"         auxiliary police crew
 *   "IDA PIIR n"        border guard patrol    "IDA KAATER n"   patrol boat (Narva jõgi / Peipsi)
 */
import type { LngLat, Place, PlaceKind, RegionDef, Station, Street, Town, UnitSpec } from '@/sim/types';

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
  address: string,
  coord: LngLat,
  tags?: string[],
  district?: string,
): Place {
  const p: Place = { id, name, kind, city, address, coord };
  if (district) p.district = district;
  if (tags && tags.length) p.tags = tags;
  return p;
}

const IV = 'Ida-Viru maakond';
const LV = 'Lääne-Viru maakond';
const KJ = 'Kohtla-Järve';

// ─────────────────────────────────────────────────────────────────────────────
// Stations
// ─────────────────────────────────────────────────────────────────────────────

const STATIONS: Station[] = [
  {
    id: 'ida-hq',
    name: { et: 'Ida prefektuur ja Jõhvi politseijaoskond', en: 'East Prefecture HQ & Jõhvi Police Station' },
    short: 'Jõhvi PJ',
    kind: 'hq',
    city: 'Jõhvi',
    address: 'Rahu tn 38',
    coord: [27.406, 59.361],
  },
  {
    id: 'ida-narva',
    name: { et: 'Narva politseijaoskond', en: 'Narva Police Station' },
    short: 'Narva PJ',
    kind: 'station',
    city: 'Narva',
    address: 'Vahtra tn 3',
    coord: [28.185, 59.381],
  },
  {
    id: 'ida-rakvere',
    name: { et: 'Rakvere politseijaoskond', en: 'Rakvere Police Station' },
    short: 'Rakvere PJ',
    kind: 'station',
    city: 'Rakvere',
    address: 'F. R. Kreutzwaldi tn 5a',
    coord: [26.36, 59.35],
  },
  {
    id: 'ida-kohtlajarve',
    name: { et: 'Kohtla-Järve piirkonnagrupp', en: 'Kohtla-Järve community policing office' },
    short: 'K-Järve PG',
    kind: 'post',
    city: KJ,
    address: 'Järveküla tee 40',
    coord: [27.263, 59.399],
  },
  {
    id: 'ida-sillamae',
    name: { et: 'Sillamäe piirkonnagrupp', en: 'Sillamäe community policing office' },
    short: 'Sillamäe PG',
    kind: 'post',
    city: 'Sillamäe',
    address: 'Kesk tn',
    coord: [27.762, 59.3972],
  },
  {
    id: 'ida-tapa',
    name: { et: 'Tapa piirkonnagrupp', en: 'Tapa community policing office' },
    short: 'Tapa PG',
    kind: 'post',
    city: 'Tapa',
    address: 'Pikk tn 18a',
    coord: [25.957, 59.26],
  },
  {
    id: 'ida-kivioli',
    name: { et: 'Kiviõli politsei- ja päästemaja', en: 'Kiviõli police & rescue building' },
    short: 'Kiviõli PP',
    kind: 'post',
    city: 'Kiviõli',
    address: 'Keskpuiestee, Kiviõli',
    coord: [26.97, 59.354],
  },
  {
    id: 'ida-narvajoesuu',
    name: { et: 'Narva-Jõesuu konstaablipunkt', en: 'Narva-Jõesuu police post' },
    short: 'N-Jõesuu',
    kind: 'post',
    city: 'Narva-Jõesuu',
    address: 'Kesk tn, Narva-Jõesuu',
    coord: [28.041, 59.459],
  },
  {
    id: 'ida-arest',
    name: { et: 'Viru Vangla (arestimaja ülesanded)', en: 'Viru Prison (arrest-house duties)' },
    short: 'Viru Vangla',
    kind: 'arrest',
    city: 'Jõhvi',
    address: 'Ülesõidu tn 1',
    coord: [27.404, 59.348],
  },
  {
    id: 'ida-narva-pp',
    name: { et: 'Narva piiripunkt (Narva-1)', en: 'Narva border checkpoint (Narva-1)' },
    short: 'Narva PP',
    kind: 'border',
    city: 'Narva',
    address: 'Peterburi mnt 1',
    coord: [28.1995, 59.3772],
  },
  {
    id: 'ida-narva-kordon',
    name: { et: 'Narva kordon', en: 'Narva border guard station' },
    short: 'Narva kordon',
    kind: 'border',
    city: 'Narva',
    address: 'Narva, Siivertsi',
    coord: [28.199, 59.39],
  },
  {
    id: 'ida-vasknarva',
    name: { et: 'Vasknarva piirivalvesadam (Peipsi)', en: 'Vasknarva border guard harbour (Lake Peipus)' },
    short: 'Vasknarva',
    kind: 'harbour',
    city: 'Vasknarva',
    address: 'Vasknarva küla, Alutaguse vald',
    coord: [27.676, 59.017],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Roster (normal): 8 patrols (day 6 / night 7), rapid, K9, traffic, criminal,
// 2 border patrols, a patrol boat and detainee transport.
// ─────────────────────────────────────────────────────────────────────────────

// prettier-ignore
const ROSTER: UnitSpec[] = [
  { callsign: 'IDA 11', type: 'patrol', stationId: 'ida-narva', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'both' },
  { callsign: 'IDA 12', type: 'patrol', stationId: 'ida-narva', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'both' },
  { callsign: 'IDA 13', type: 'patrol', stationId: 'ida-narva', vehicle: 'Škoda Scala', crew: 2, shift: 'night' },
  { callsign: 'IDA 21', type: 'patrol', stationId: 'ida-hq', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'both' },
  { callsign: 'IDA 22', type: 'patrol', stationId: 'ida-hq', vehicle: 'Toyota RAV4 Hybrid', crew: 2, shift: 'night' },
  { callsign: 'IDA 31', type: 'patrol', stationId: 'ida-kohtlajarve', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'both' },
  { callsign: 'IDA 51', type: 'patrol', stationId: 'ida-rakvere', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'both' },
  { callsign: 'IDA 52', type: 'patrol', stationId: 'ida-rakvere', vehicle: 'Škoda Kodiaq', crew: 2, shift: 'day' },

  { callsign: 'IDA K1', type: 'rapid', stationId: 'ida-hq', vehicle: 'Škoda Superb Combi 4x4', crew: 2, shift: 'both' },
  { callsign: 'IDA KOER 1', type: 'k9', stationId: 'ida-hq', vehicle: 'Škoda Kodiaq (koeraboksiga)', crew: 1, shift: 'both' },
  { callsign: 'IDA LIIKLUS 1', type: 'traffic', stationId: 'ida-hq', vehicle: 'BMW 530d xDrive (märgistamata)', crew: 2, shift: 'both' },
  { callsign: 'IDA KRIMI 1', type: 'criminal', stationId: 'ida-narva', vehicle: 'Škoda Superb (märgistamata)', crew: 2, shift: 'both' },
  { callsign: 'IDA PIIR 1', type: 'border', stationId: 'ida-narva-pp', vehicle: 'Volkswagen Amarok', crew: 2, shift: 'both' },
  { callsign: 'IDA PIIR 2', type: 'border', stationId: 'ida-narva-kordon', vehicle: 'Nissan Patrol', crew: 2, shift: 'both' },
  { callsign: 'IDA KAATER 1', type: 'boat', stationId: 'ida-vasknarva', vehicle: 'Alumiiniumkerega patrullkaater', crew: 2, shift: 'both' },
  { callsign: 'IDA KONVOI 1', type: 'transport', stationId: 'ida-arest', vehicle: 'Mercedes-Benz Sprinter (konvoibuss)', crew: 2, shift: 'both' },

  // ── veteran
  { callsign: 'IDA 14', type: 'patrol', stationId: 'ida-narva', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'day', minDifficulty: 'veteran' },
  { callsign: 'IDA 32', type: 'patrol', stationId: 'ida-kohtlajarve', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'night', minDifficulty: 'veteran' },
  { callsign: 'IDA 41', type: 'patrol', stationId: 'ida-sillamae', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'both', minDifficulty: 'veteran' },
  { callsign: 'IDA 61', type: 'patrol', stationId: 'ida-tapa', vehicle: 'Škoda Kodiaq', crew: 2, shift: 'both', minDifficulty: 'veteran' },
  { callsign: 'IDA K2', type: 'rapid', stationId: 'ida-narva', vehicle: 'Volkswagen Transporter', crew: 3, shift: 'night', minDifficulty: 'veteran' },
  { callsign: 'IDA KONSTAABEL 1', type: 'community', stationId: 'ida-kohtlajarve', vehicle: 'Volkswagen Tiguan', crew: 1, shift: 'day', minDifficulty: 'veteran' },
  { callsign: 'IDA ABI 1', type: 'aux', stationId: 'ida-narva', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'night', minDifficulty: 'veteran' },

  // ── realistic
  { callsign: 'IDA 15', type: 'patrol', stationId: 'ida-narva', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'night', minDifficulty: 'realistic' },
  { callsign: 'IDA 23', type: 'patrol', stationId: 'ida-hq', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'day', minDifficulty: 'realistic' },
  { callsign: 'IDA 53', type: 'patrol', stationId: 'ida-rakvere', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'night', minDifficulty: 'realistic' },
  { callsign: 'IDA 71', type: 'patrol', stationId: 'ida-kivioli', vehicle: 'Škoda Octavia Combi', crew: 2, shift: 'both', minDifficulty: 'realistic' },
  { callsign: 'IDA 81', type: 'patrol', stationId: 'ida-narvajoesuu', vehicle: 'Škoda Kodiaq', crew: 2, shift: 'day', minDifficulty: 'realistic' },
  { callsign: 'IDA PIIR 3', type: 'border', stationId: 'ida-vasknarva', vehicle: 'Volkswagen Amarok', crew: 2, shift: 'both', minDifficulty: 'realistic' },
  { callsign: 'IDA LIIKLUS 2', type: 'traffic', stationId: 'ida-rakvere', vehicle: 'Škoda Superb (märgistamata)', crew: 2, shift: 'day', minDifficulty: 'realistic' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Towns (population ≈ 2024-25, ruShare = share of Russian-speaking residents)
// ─────────────────────────────────────────────────────────────────────────────

// prettier-ignore
const TOWNS: Town[] = [
  { name: 'Narva', county: IV, coord: [28.1903, 59.3772], population: 53000, ruShare: 0.95 },
  { name: KJ, county: IV, coord: [27.2731, 59.3986], population: 32000, ruShare: 0.8 },
  { name: 'Sillamäe', county: IV, coord: [27.7633, 59.397], population: 12200, ruShare: 0.94 },
  { name: 'Jõhvi', county: IV, coord: [27.4211, 59.3592], population: 9800, ruShare: 0.6 },
  { name: 'Kiviõli', county: IV, coord: [26.9711, 59.3531], population: 4800, ruShare: 0.5 },
  { name: 'Narva-Jõesuu', county: IV, coord: [28.0408, 59.4589], population: 2500, ruShare: 0.8 },
  { name: 'Tammiku', county: IV, coord: [27.3671, 59.336], population: 1700, ruShare: 0.75 },
  { name: 'Aseri', county: IV, coord: [26.8675, 59.4506], population: 1300, ruShare: 0.45 },
  { name: 'Püssi', county: IV, coord: [27.0497, 59.36], population: 1000, ruShare: 0.55 },
  { name: 'Kohtla-Nõmme', county: IV, coord: [27.175, 59.3517], population: 900, ruShare: 0.5 },
  { name: 'Iisaku', county: IV, coord: [27.3091, 59.1017], population: 900, ruShare: 0.25 },
  { name: 'Toila', county: IV, coord: [27.5081, 59.4213], population: 800, ruShare: 0.4 },
  { name: 'Voka', county: IV, coord: [27.5826, 59.4078], population: 800, ruShare: 0.45 },
  { name: 'Mäetaguse', county: IV, coord: [27.2979, 59.2236], population: 600, ruShare: 0.35 },
  { name: 'Avinurme', county: IV, coord: [26.862, 58.987], population: 600, ruShare: 0.05 },
  { name: 'Sinimäe', county: IV, coord: [27.8725, 59.3755], population: 400, ruShare: 0.55 },
  { name: 'Lüganuse', county: IV, coord: [27.0688, 59.3698], population: 400, ruShare: 0.4 },
  { name: 'Olgina', county: IV, coord: [28.1268, 59.3967], population: 300, ruShare: 0.85 },
  { name: 'Sonda', county: IV, coord: [26.8342, 59.3486], population: 300, ruShare: 0.35 },
  { name: 'Lohusuu', county: IV, coord: [27.0496, 58.9499], population: 250, ruShare: 0.45 },
  { name: 'Rakvere', county: LV, coord: [26.355, 59.347], population: 15000, ruShare: 0.09 },
  { name: 'Tapa', county: LV, coord: [25.958, 59.26], population: 5300, ruShare: 0.32 },
  { name: 'Kunda', county: LV, coord: [26.529, 59.4995], population: 3000, ruShare: 0.3 },
  { name: 'Kadrina', county: LV, coord: [26.1379, 59.3409], population: 2200, ruShare: 0.05 },
  { name: 'Tamsalu', county: LV, coord: [26.115, 59.159], population: 2000, ruShare: 0.08 },
  { name: 'Väike-Maarja', county: LV, coord: [26.2511, 59.1279], population: 1200, ruShare: 0.04 },
  { name: 'Vinni', county: LV, coord: [26.426, 59.2947], population: 1100, ruShare: 0.06 },
  { name: 'Haljala', county: LV, coord: [26.2542, 59.4351], population: 1000, ruShare: 0.04 },
  { name: 'Sõmeru', county: LV, coord: [26.4313, 59.3597], population: 1000, ruShare: 0.06 },
  { name: 'Rakke', county: LV, coord: [26.243, 58.9912], population: 900, ruShare: 0.05 },
  { name: 'Näpi', county: LV, coord: [26.4028, 59.3609], population: 600, ruShare: 0.06 },
  { name: 'Sääse', county: LV, coord: [26.1355, 59.1565], population: 600, ruShare: 0.08 },
  { name: 'Laekvere', county: LV, coord: [26.5695, 59.0775], population: 450, ruShare: 0.04 },
  { name: 'Uhtna', county: LV, coord: [26.5625, 59.3952], population: 450, ruShare: 0.06 },
  { name: 'Võsu', county: LV, coord: [25.9642, 59.5722], population: 450, ruShare: 0.05 },
  { name: 'Viru-Nigula', county: LV, coord: [26.6952, 59.4462], population: 300, ruShare: 0.05 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Streets: points ordered by house number. Kohtla-Järve streets carry the
// linnaosa (Järve / Ahtme) as district.
// ─────────────────────────────────────────────────────────────────────────────

// prettier-ignore
const STREETS: Street[] = [
  // ── Narva
  st('i-st-narva-tallinna', 'Tallinna mnt', 'Narva', undefined, [[28.1905, 59.3772], [28.18, 59.3788], [28.165, 59.3812], [28.145, 59.3845]], [1, 90], 'mixed', 3),
  st('i-st-narva-peterburi', 'Peterburi mnt', 'Narva', undefined, [[28.1915, 59.3768], [28.1975, 59.3763], [28.201, 59.3765]], [1, 20], 'commercial', 0.5),
  st('i-st-narva-puskini', 'Puškini tn', 'Narva', undefined, [[28.1935, 59.38], [28.1918, 59.3768], [28.1895, 59.3735]], [1, 60], 'apartment', 2),
  st('i-st-narva-kreenholmi', 'Kreenholmi tn', 'Narva', undefined, [[28.189, 59.3725], [28.1925, 59.3675], [28.196, 59.363]], [1, 60], 'apartment', 1.5),
  st('i-st-narva-joala', 'Joala tn', 'Narva', undefined, [[28.1945, 59.3748], [28.1985, 59.371], [28.2, 59.366]], [1, 30], 'apartment', 1),
  st('i-st-narva-kangelaste', 'Kangelaste prospekt', 'Narva', undefined, [[28.165, 59.3815], [28.163, 59.387], [28.161, 59.3925]], [1, 45], 'apartment', 2.5),
  st('i-st-narva-daumani', 'Daumani tn', 'Narva', undefined, [[28.172, 59.3805], [28.1725, 59.386], [28.173, 59.3905]], [1, 40], 'apartment', 2),
  st('i-st-narva-kerese', 'Paul Kerese tn', 'Narva', undefined, [[28.182, 59.379], [28.1825, 59.384], [28.183, 59.3885]], [1, 40], 'apartment', 2),
  st('i-st-narva-vestervalli', 'Vestervalli tn', 'Narva', undefined, [[28.196, 59.381], [28.193, 59.3785]], [1, 30], 'apartment', 1.5),
  st('i-st-narva-sopruse', 'Sõpruse tn', 'Narva', undefined, [[28.186, 59.39], [28.176, 59.3905], [28.166, 59.3915]], [1, 40], 'apartment', 2),
  st('i-st-narva-hariduse', 'Hariduse tn', 'Narva', undefined, [[28.187, 59.383], [28.176, 59.3845]], [1, 20], 'apartment', 1),
  st('i-st-narva-linda', 'Linda tn', 'Narva', undefined, [[28.177, 59.3845], [28.1775, 59.39]], [1, 20], 'apartment', 1),
  st('i-st-narva-tiimani', 'Tiimani tn', 'Narva', undefined, [[28.161, 59.3895], [28.152, 59.3905]], [1, 30], 'apartment', 1.5),
  st('i-st-narva-rakvere', 'Rakvere tn', 'Narva', undefined, [[28.19, 59.385], [28.175, 59.3865], [28.158, 59.3885]], [1, 80], 'apartment', 2),
  st('i-st-narva-lavretsovi', 'Lavretsovi tn', 'Narva', undefined, [[28.1885, 59.379], [28.186, 59.376]], [1, 20], 'mixed', 0.8),
  st('i-st-narva-kalda', 'Kalda tn', 'Narva', undefined, [[28.199, 59.381], [28.2, 59.386]], [1, 30], 'mixed', 0.8),
  st('i-st-narva-kosmonautide', 'Kosmonautide tn', 'Narva', undefined, [[28.17, 59.385], [28.169, 59.381]], [1, 25], 'apartment', 1),
  st('i-st-narva-vaksali', 'Vaksali tn', 'Narva', undefined, [[28.1855, 59.3735], [28.191, 59.3722]], [1, 25], 'mixed', 0.8),
  st('i-st-narva-gerassimovi', 'Gerassimovi tn', 'Narva', undefined, [[28.166, 59.387], [28.156, 59.3865]], [1, 30], 'apartment', 1),
  st('i-st-narva-rahu', 'Rahu tn', 'Narva', undefined, [[28.195, 59.384], [28.1965, 59.39]], [1, 40], 'mixed', 1),
  st('i-st-narva-energia', 'Energia tn', 'Narva', undefined, [[28.155, 59.383], [28.148, 59.38]], [1, 30], 'mixed', 0.8),
  st('i-st-narva-koidula', 'Koidula tn', 'Narva', undefined, [[28.192, 59.3815], [28.188, 59.383]], [1, 30], 'apartment', 1),
  st('i-st-narva-karja', 'Karja tn', 'Narva', undefined, [[28.195, 59.3825], [28.1925, 59.386]], [1, 30], 'apartment', 0.8),
  st('i-st-narva-haigla', 'Haigla tn', 'Narva', undefined, [[28.188, 59.386], [28.19, 59.388]], [1, 10], 'mixed', 0.4),
  st('i-st-narva-kiriku', 'Kiriku tn', 'Narva', undefined, [[28.1965, 59.379], [28.195, 59.3775]], [1, 12], 'mixed', 0.5),
  st('i-st-narva-kulgu', 'Kulgu tn', 'Narva', undefined, [[28.13, 59.386], [28.12, 59.388]], [1, 60], 'house', 0.8),

  // ── Kohtla-Järve: Järve
  st('i-st-kj-jarvekula', 'Järveküla tee', KJ, 'Järve', [[27.262, 59.392], [27.264, 59.399], [27.266, 59.406]], [1, 80], 'mixed', 1.5),
  st('i-st-kj-keskallee', 'Keskallee', KJ, 'Järve', [[27.268, 59.395], [27.27, 59.401]], [1, 40], 'apartment', 2),
  st('i-st-kj-kalevi', 'Kalevi tn', KJ, 'Järve', [[27.26, 59.3975], [27.276, 59.3985]], [1, 40], 'apartment', 2),
  st('i-st-kj-outokumpu', 'Outokumpu tn', KJ, 'Järve', [[27.256, 59.4], [27.27, 59.404]], [1, 20], 'apartment', 1.5),
  st('i-st-kj-ravi', 'Ravi tn', KJ, 'Järve', [[27.273, 59.404], [27.278, 59.4005]], [1, 20], 'apartment', 1),
  st('i-st-kj-estonia', 'Estonia pst', KJ, 'Järve', [[27.262, 59.403], [27.278, 59.4045]], [1, 30], 'apartment', 1.5),
  st('i-st-kj-kooli', 'Kooli tn', KJ, 'Järve', [[27.274, 59.396], [27.28, 59.4]], [1, 30], 'apartment', 1),
  st('i-st-kj-ilmajaama', 'Ilmajaama tn', KJ, 'Järve', [[27.258, 59.4055], [27.266, 59.4075]], [1, 20], 'mixed', 0.6),
  st('i-st-kj-pargi', 'Pargi tn', KJ, 'Järve', [[27.282, 59.3965], [27.288, 59.399]], [1, 30], 'apartment', 1),
  // ── Kohtla-Järve: Ahtme
  st('i-st-kj-ahtme-mnt', 'Ahtme mnt', KJ, 'Ahtme', [[27.418, 59.344], [27.422, 59.335], [27.427, 59.327]], [1, 100], 'mixed', 1.5),
  st('i-st-kj-puru', 'Puru tee', KJ, 'Ahtme', [[27.412, 59.3385], [27.42, 59.336]], [1, 60], 'apartment', 1.5),
  st('i-st-kj-ridakula', 'Ridaküla tn', KJ, 'Ahtme', [[27.4235, 59.3285], [27.43, 59.326]], [1, 20], 'apartment', 1),
  st('i-st-kj-lehola', 'Lehola tn', KJ, 'Ahtme', [[27.42, 59.3255], [27.428, 59.3235]], [1, 40], 'apartment', 1),
  st('i-st-kj-maleva', 'Maleva tn', KJ, 'Ahtme', [[27.424, 59.33], [27.429, 59.327]], [1, 20], 'apartment', 1),

  // ── Jõhvi
  st('i-st-johvi-narva', 'Narva mnt', 'Jõhvi', undefined, [[27.422, 59.3595], [27.435, 59.361], [27.45, 59.363]], [1, 100], 'mixed', 2),
  st('i-st-johvi-rakvere', 'Rakvere tn', 'Jõhvi', undefined, [[27.42, 59.359], [27.408, 59.3575], [27.395, 59.356]], [1, 60], 'mixed', 1.5),
  st('i-st-johvi-tartu', 'Tartu mnt', 'Jõhvi', undefined, [[27.4215, 59.3585], [27.4205, 59.3545], [27.419, 59.35]], [1, 60], 'mixed', 1.2),
  st('i-st-johvi-keskvaljak', 'Keskväljak', 'Jõhvi', undefined, [[27.415, 59.3597], [27.4185, 59.3595]], [1, 12], 'commercial', 0.6),
  st('i-st-johvi-kooli', 'Kooli tn', 'Jõhvi', undefined, [[27.413, 59.36], [27.415, 59.356]], [1, 30], 'mixed', 1),
  st('i-st-johvi-jaama', 'Jaama tn', 'Jõhvi', undefined, [[27.421, 59.361], [27.423, 59.365]], [1, 40], 'mixed', 1),
  st('i-st-johvi-pargi', 'Pargi tn', 'Jõhvi', undefined, [[27.41, 59.361], [27.418, 59.3625]], [1, 40], 'apartment', 1.2),
  st('i-st-johvi-rahu', 'Rahu tn', 'Jõhvi', undefined, [[27.405, 59.358], [27.406, 59.364]], [1, 40], 'apartment', 1.2),
  st('i-st-johvi-nooruse', 'Nooruse tn', 'Jõhvi', undefined, [[27.425, 59.356], [27.432, 59.357]], [1, 20], 'apartment', 1.2),
  st('i-st-johvi-veski', 'Veski tn', 'Jõhvi', undefined, [[27.427, 59.36], [27.429, 59.364]], [1, 30], 'house', 0.8),
  st('i-st-johvi-puru', 'Puru tee', 'Jõhvi', undefined, [[27.43, 59.354], [27.44, 59.348]], [1, 50], 'mixed', 0.8),

  // ── Sillamäe
  st('i-st-sillamae-kesk', 'Kesk tn', 'Sillamäe', undefined, [[27.757, 59.3965], [27.768, 59.3975]], [1, 40], 'apartment', 2),
  st('i-st-sillamae-mere', 'Mere pst', 'Sillamäe', undefined, [[27.766, 59.396], [27.7675, 59.3985]], [1, 30], 'apartment', 1.2),
  st('i-st-sillamae-viru', 'Viru pst', 'Sillamäe', undefined, [[27.755, 59.394], [27.77, 59.395]], [1, 40], 'apartment', 2),
  st('i-st-sillamae-kajaka', 'Kajaka tn', 'Sillamäe', undefined, [[27.753, 59.399], [27.76, 59.4]], [1, 30], 'apartment', 1),
  st('i-st-sillamae-kalda', 'Kalda tn', 'Sillamäe', undefined, [[27.77, 59.3975], [27.778, 59.3962]], [1, 20], 'apartment', 1),
  st('i-st-sillamae-tallinna', 'Tallinna mnt', 'Sillamäe', undefined, [[27.745, 59.395], [27.755, 59.3955]], [1, 40], 'mixed', 1),
  st('i-st-sillamae-gagarini', 'Gagarini tn', 'Sillamäe', undefined, [[27.765, 59.394], [27.775, 59.3945]], [1, 30], 'apartment', 1.2),
  st('i-st-sillamae-kirde', 'Kirde tn', 'Sillamäe', undefined, [[27.78, 59.3955], [27.785, 59.3962]], [1, 20], 'apartment', 0.8),
  st('i-st-sillamae-pargi', 'Pargi tn', 'Sillamäe', undefined, [[27.76, 59.3978], [27.764, 59.3995]], [1, 30], 'apartment', 1),

  // ── Rakvere
  st('i-st-rakvere-tallinna', 'Tallinna tn', 'Rakvere', undefined, [[26.354, 59.348], [26.345, 59.352], [26.333, 59.356]], [1, 100], 'mixed', 2),
  st('i-st-rakvere-pikk', 'Pikk tn', 'Rakvere', undefined, [[26.356, 59.3465], [26.362, 59.344], [26.37, 59.342]], [1, 80], 'mixed', 1.5),
  st('i-st-rakvere-lai', 'Lai tn', 'Rakvere', undefined, [[26.355, 59.3475], [26.36, 59.3505]], [1, 40], 'mixed', 1.2),
  st('i-st-rakvere-jaama', 'Jaama pst', 'Rakvere', undefined, [[26.356, 59.35], [26.357, 59.357]], [1, 30], 'mixed', 1),
  st('i-st-rakvere-laada', 'Laada tn', 'Rakvere', undefined, [[26.357, 59.3475], [26.363, 59.3485]], [1, 40], 'mixed', 1),
  st('i-st-rakvere-vabaduse', 'Vabaduse tn', 'Rakvere', undefined, [[26.355, 59.346], [26.356, 59.343]], [1, 20], 'mixed', 0.8),
  st('i-st-rakvere-kreutzwaldi', 'F. R. Kreutzwaldi tn', 'Rakvere', undefined, [[26.359, 59.349], [26.362, 59.353]], [1, 50], 'mixed', 1),
  st('i-st-rakvere-tuleviku', 'Tuleviku tn', 'Rakvere', undefined, [[26.37, 59.348], [26.375, 59.351]], [1, 20], 'apartment', 1.5),
  st('i-st-rakvere-naituse', 'Näituse tn', 'Rakvere', undefined, [[26.35, 59.35], [26.353, 59.355]], [1, 30], 'mixed', 1),
  st('i-st-rakvere-kastani', 'Kastani pst', 'Rakvere', undefined, [[26.365, 59.346], [26.372, 59.35]], [1, 30], 'apartment', 1.2),
  st('i-st-rakvere-narva', 'Narva tn', 'Rakvere', undefined, [[26.362, 59.3485], [26.375, 59.352], [26.385, 59.3545]], [1, 60], 'mixed', 1.2),
  st('i-st-rakvere-tartu', 'Tartu tn', 'Rakvere', undefined, [[26.358, 59.346], [26.36, 59.34], [26.362, 59.334]], [1, 60], 'mixed', 1),
  st('i-st-rakvere-haljala', 'Haljala tee', 'Rakvere', undefined, [[26.352, 59.357], [26.348, 59.365]], [1, 30], 'house', 0.6),
  st('i-st-rakvere-seminari', 'Seminari tn', 'Rakvere', undefined, [[26.348, 59.347], [26.342, 59.346]], [1, 20], 'house', 0.6),

  // ── Kunda
  st('i-st-kunda-kasemae', 'Kasemäe tn', 'Kunda', undefined, [[26.522, 59.497], [26.53, 59.502]], [1, 30], 'apartment', 1),
  st('i-st-kunda-koidu', 'Koidu tn', 'Kunda', undefined, [[26.532, 59.498], [26.535, 59.504]], [1, 30], 'mixed', 0.8),
  st('i-st-kunda-mere', 'Mere tn', 'Kunda', undefined, [[26.528, 59.504], [26.535, 59.51]], [1, 20], 'house', 0.6),
  // ── Kiviõli
  st('i-st-kivioli-keskpst', 'Keskpuiestee', 'Kiviõli', undefined, [[26.967, 59.351], [26.973, 59.356]], [1, 40], 'apartment', 1.2),
  st('i-st-kivioli-viru', 'Viru tn', 'Kiviõli', undefined, [[26.962, 59.3535], [26.978, 59.3525]], [1, 40], 'apartment', 1),
  st('i-st-kivioli-kooli', 'Kooli tn', 'Kiviõli', undefined, [[26.968, 59.355], [26.972, 59.358]], [1, 20], 'apartment', 0.8),
  // ── Narva-Jõesuu
  st('i-st-nj-aia', 'Aia tn', 'Narva-Jõesuu', undefined, [[28.025, 59.4505], [28.035, 59.4565], [28.042, 59.4605]], [1, 120], 'house', 1),
  st('i-st-nj-kesk', 'Kesk tn', 'Narva-Jõesuu', undefined, [[28.038, 59.4585], [28.044, 59.4575]], [1, 30], 'mixed', 0.8),
  st('i-st-nj-koidula', 'L. Koidula tn', 'Narva-Jõesuu', undefined, [[28.02, 59.446], [28.03, 59.452]], [1, 60], 'house', 0.8),
  // ── Tapa
  st('i-st-tapa-pikk', 'Pikk tn', 'Tapa', undefined, [[25.953, 59.258], [25.96, 59.262]], [1, 40], 'mixed', 1),
  st('i-st-tapa-jaama', 'Jaama tn', 'Tapa', undefined, [[25.957, 59.2595], [25.962, 59.2615]], [1, 20], 'mixed', 0.8),
  st('i-st-tapa-valgejoe', 'Valgejõe tn', 'Tapa', undefined, [[25.948, 59.256], [25.955, 59.2545]], [1, 30], 'apartment', 1),
  st('i-st-tapa-ulesoidu', 'Ülesõidu tn', 'Tapa', undefined, [[25.962, 59.264], [25.968, 59.266]], [1, 20], 'apartment', 0.8),
  // ── Tamsalu
  st('i-st-tamsalu-tehnika', 'Tehnika tn', 'Tamsalu', undefined, [[26.11, 59.158], [26.118, 59.16]], [1, 30], 'apartment', 0.8),
  st('i-st-tamsalu-kesk', 'Kesk tn', 'Tamsalu', undefined, [[26.113, 59.161], [26.117, 59.157]], [1, 30], 'mixed', 0.6),
];

// ─────────────────────────────────────────────────────────────────────────────
// Places
// ─────────────────────────────────────────────────────────────────────────────

// prettier-ignore
const PLACES: Place[] = [
  // Narva
  pl('i-pl-narva-linnus', 'Narva linnus', 'museum', 'Narva', 'Peterburi mnt 2', [28.2019, 59.3756], ['tourist', 'russian']),
  pl('i-pl-narva-raekoda', 'Narva raekoja plats', 'oldtown', 'Narva', 'Raekoja plats 1', [28.1989, 59.3789], ['tourist', 'russian']),
  pl('i-pl-narva-pp', 'Narva piiripunkt (Narva-1)', 'border', 'Narva', 'Peterburi mnt 1', [28.1995, 59.3772], ['russian']),
  pl('i-pl-narva-sild', 'Sõprussild (riigipiir)', 'border', 'Narva', 'Peterburi mnt', [28.2035, 59.3778], ['russian']),
  pl('i-pl-narva-piir-siivertsi', 'Riigipiir, Narva jõe kallas (Siivertsi)', 'border', 'Narva', 'Narva jõe kallas, Siivertsi', [28.199, 59.392], ['russian']),
  pl('i-pl-narva-parkla-piir', 'Piiriületuse ooteala parkla', 'parking', 'Narva', 'Tallinna mnt', [28.18, 59.3765], ['russian']),
  pl('i-pl-narva-fama', 'Fama keskus', 'mall', 'Narva', 'Tallinna mnt 19c', [28.1835, 59.3785], ['russian']),
  pl('i-pl-narva-astri', 'Astri keskus', 'mall', 'Narva', 'Tallinna mnt 41', [28.1755, 59.3797], ['russian']),
  pl('i-pl-narva-pood', 'Toidukauplus (Kangelaste)', 'shop', 'Narva', 'Kangelaste prospekt 29', [28.164, 59.3845], ['russian']),
  pl('i-pl-narva-turg', 'Narva turg', 'shop', 'Narva', 'Tallinna mnt 4', [28.1885, 59.3768], ['russian']),
  pl('i-pl-johvi-pood', 'Toidukauplus (Jõhvi)', 'shop', 'Jõhvi', 'Narva mnt 8', [27.4255, 59.3598]),
  pl('i-pl-kj-turg', 'Turg (Järve)', 'shop', KJ, 'Kalevi tn 2', [27.2675, 59.3972], ['russian'], 'Järve'),
  pl('i-pl-sillamae-pood', 'Toidukauplus (Sillamäe)', 'shop', 'Sillamäe', 'Viru pst 19', [27.765, 59.3948], ['russian']),
  pl('i-pl-rakvere-turg', 'Rakvere turg', 'shop', 'Rakvere', 'Laada tn 16', [26.3605, 59.3482]),
  pl('i-pl-narva-kolledz', 'Tartu Ülikooli Narva kolledž', 'university', 'Narva', 'Raekoja plats 2', [28.1983, 59.3784], ['russian']),
  pl('i-pl-narva-haigla', 'Narva Haigla', 'hospital', 'Narva', 'Haigla tn 1', [28.188, 59.387], ['russian']),
  pl('i-pl-narva-raudteejaam', 'Narva raudteejaam', 'trainstation', 'Narva', 'Vaksali tn', [28.187, 59.3718], ['russian']),
  pl('i-pl-narva-bussijaam', 'Narva bussijaam', 'busstation', 'Narva', 'Vaksali tn', [28.1888, 59.3722], ['russian']),
  pl('i-pl-narva-kreenholm', 'Kreenholmi manufaktuur', 'industrial', 'Narva', 'Joala tn', [28.199, 59.3625], ['russian', 'tourist']),
  pl('i-pl-narva-joaorg', 'Joaoru rand', 'beach', 'Narva', 'Joaorg', [28.2045, 59.3705], ['russian']),
  pl('i-pl-narva-promenaad', 'Narva jõe promenaad', 'park', 'Narva', 'Kalda tn', [28.2015, 59.3802], ['russian', 'tourist']),
  pl('i-pl-narva-katedraal', 'Narva Ülestõusmise katedraal', 'church', 'Narva', 'Bastrakovi tn 4', [28.1855, 59.3705], ['russian']),
  pl('i-pl-narva-aleksandri', 'Narva Aleksandri kirik', 'church', 'Narva', 'Kiriku tn 9', [28.1945, 59.38]),
  pl('i-pl-narva-kalmistu', 'Siivertsi kalmistu', 'cemetery', 'Narva', 'Kalda tn', [28.1965, 59.3935], ['russian']),
  pl('i-pl-narva-linnavalitsus', 'Narva linnavalitsus', 'government', 'Narva', 'Peetri plats 5', [28.1915, 59.3767], ['russian']),
  pl('i-pl-narva-kool-pahklimae', 'Narva põhikool (Pähklimäe)', 'school', 'Narva', 'Kangelaste prospekt 31', [28.162, 59.388], ['russian']),
  pl('i-pl-narva-kool-kreenholmi', 'Narva põhikool (Kreenholm)', 'school', 'Narva', 'Kreenholmi tn 36', [28.193, 59.366], ['russian']),
  pl('i-pl-narva-egumn', 'Narva Eesti Gümnaasium', 'school', 'Narva', 'Puškini tn', [28.1925, 59.3745]),
  pl('i-pl-narva-lasteaed', 'Lasteaed (Narva, Soldino)', 'kindergarten', 'Narva', 'Sõpruse tn 9', [28.178, 59.3895], ['russian']),
  pl('i-pl-narva-pank-tallinna', 'Pank (Narva, Tallinna mnt)', 'bank', 'Narva', 'Tallinna mnt 6', [28.188, 59.3778], ['russian']),
  pl('i-pl-narva-pank-puskini', 'Pank (Narva, Puškini)', 'bank', 'Narva', 'Puškini tn 21', [28.1922, 59.3775], ['russian']),
  pl('i-pl-narva-baar', 'Baar (Narva kesklinn)', 'bar', 'Narva', 'Puškini tn 10', [28.1928, 59.3785], ['nightlife', 'russian']),
  pl('i-pl-narva-klubi', 'Ööklubi (Narva)', 'nightclub', 'Narva', 'Tallinna mnt 19', [28.184, 59.379], ['nightlife', 'russian']),
  pl('i-pl-narva-hotell', 'Hotell (Narva kesklinn)', 'hotel', 'Narva', 'Lavretsovi tn 9', [28.1875, 59.3775], ['russian']),
  pl('i-pl-narva-staadion', 'Narva staadion ja spordikeskus', 'stadium', 'Narva', 'Kreenholmi tn 53', [28.1955, 59.3645], ['russian']),
  pl('i-pl-narva-tankla', 'Tankla (Narva, Tallinna mnt)', 'gasstation', 'Narva', 'Tallinna mnt 74', [28.1455, 59.3843], ['russian']),
  pl('i-pl-narva-veehoidla', 'Narva veehoidla', 'lake', 'Narva', 'Narva veehoidla', [28.08, 59.315], ['russian']),
  pl('i-pl-balti-ej', 'Balti elektrijaam', 'industrial', 'Narva', 'Elektrijaama tee', [28.125, 59.355], ['russian']),
  pl('i-pl-eesti-ej', 'Eesti elektrijaam (Auvere)', 'industrial', 'Narva-Jõesuu', 'Auvere küla', [27.9, 59.27]),

  // Narva-Jõesuu
  pl('i-pl-nj-rand', 'Narva-Jõesuu rand', 'beach', 'Narva-Jõesuu', 'Aia tn', [28.025, 59.453], ['tourist', 'russian']),
  pl('i-pl-nj-spaa', 'Spaahotell (Narva-Jõesuu)', 'hotel', 'Narva-Jõesuu', 'Aia tn 3', [28.036, 59.458], ['tourist']),
  pl('i-pl-nj-sadam', 'Narva-Jõesuu jõesadam', 'port', 'Narva-Jõesuu', 'Narva jõgi', [28.046, 59.4615]),
  pl('i-pl-nj-mets', 'Narva-Jõesuu männimets', 'forest', 'Narva-Jõesuu', 'Narva-Jõesuu', [28.01, 59.438]),
  pl('i-pl-nj-kirik', 'Narva-Jõesuu kirik', 'church', 'Narva-Jõesuu', 'Kesk tn', [28.042, 59.456]),

  // Sillamäe
  pl('i-pl-sillamae-sadam', 'Sillamäe sadam', 'port', 'Sillamäe', 'Kesk tn 2', [27.735, 59.412], ['industrial']),
  pl('i-pl-sillamae-linnavalitsus', 'Sillamäe linnavalitsus', 'government', 'Sillamäe', 'Kesk tn 27', [27.765, 59.3972], ['russian']),
  pl('i-pl-sillamae-kultuurikeskus', 'Sillamäe kultuurikeskus', 'concert', 'Sillamäe', 'Kesk tn 24', [27.7665, 59.3966], ['russian']),
  pl('i-pl-sillamae-trepp', 'Sillamäe Mere puiestee trepp ja promenaad', 'park', 'Sillamäe', 'Mere pst', [27.7675, 59.3985], ['tourist']),
  pl('i-pl-sillamae-haigla', 'Sillamäe haigla', 'hospital', 'Sillamäe', 'Kajaka tn 9', [27.756, 59.3985], ['russian']),
  pl('i-pl-sillamae-kool', 'Sillamäe gümnaasium', 'school', 'Sillamäe', 'Viru pst 26', [27.76, 59.3948], ['russian']),
  pl('i-pl-sillamae-tehas', 'Sillamäe metallurgiatehas', 'industrial', 'Sillamäe', 'Kesk tn 2', [27.74, 59.406]),
  pl('i-pl-sillamae-pank', 'Pank (Sillamäe)', 'bank', 'Sillamäe', 'Kesk tn 16', [27.7635, 59.397], ['russian']),

  // Jõhvi
  pl('i-pl-johvi-kontserdimaja', 'Jõhvi kontserdimaja', 'concert', 'Jõhvi', 'Kooli tn 2', [27.415, 59.358]),
  pl('i-pl-johvi-mihkli', 'Jõhvi Mihkli kirik', 'church', 'Jõhvi', 'Kooli tn 1', [27.4125, 59.3594]),
  pl('i-pl-johvi-keskus', 'Kaubanduskeskus (Jõhvi)', 'mall', 'Jõhvi', 'Keskväljak 6', [27.416, 59.3598]),
  pl('i-pl-johvi-raudteejaam', 'Jõhvi raudteejaam', 'trainstation', 'Jõhvi', 'Jaama tn', [27.423, 59.3655]),
  pl('i-pl-johvi-bussijaam', 'Jõhvi bussijaam', 'busstation', 'Jõhvi', 'Narva mnt 5', [27.4235, 59.3598]),
  pl('i-pl-johvi-gumnaasium', 'Jõhvi gümnaasium', 'school', 'Jõhvi', 'Hariduse tn 5', [27.408, 59.357]),
  pl('i-pl-johvi-spordihall', 'Jõhvi spordihall', 'stadium', 'Jõhvi', 'Hariduse tn 5', [27.407, 59.3555]),
  pl('i-pl-viru-vangla', 'Viru Vangla', 'prison', 'Jõhvi', 'Ülesõidu tn 1', [27.404, 59.348]),
  pl('i-pl-johvi-pank', 'Pank (Jõhvi)', 'bank', 'Jõhvi', 'Rakvere tn 7', [27.4175, 59.3592]),
  pl('i-pl-johvi-hotell', 'Hotell (Jõhvi)', 'hotel', 'Jõhvi', 'Narva mnt 12', [27.427, 59.3602]),
  pl('i-pl-johvi-tankla', 'Tankla (Jõhvi, E20)', 'gasstation', 'Jõhvi', 'Tallinna-Narva mnt, Jõhvi', [27.43, 59.37]),
  pl('i-pl-johvi-baar', 'Baar (Jõhvi)', 'bar', 'Jõhvi', 'Keskväljak 4', [27.417, 59.3595], ['nightlife']),

  // Kohtla-Järve
  pl('i-pl-kj-haigla', 'Ida-Viru Keskhaigla', 'hospital', KJ, 'Ilmajaama tn 14', [27.262, 59.4045], ['russian'], 'Järve'),
  pl('i-pl-kj-keskus', 'Kaubanduskeskus (Järve)', 'mall', KJ, 'Keskallee 9', [27.27, 59.399], ['russian'], 'Järve'),
  pl('i-pl-kj-oli', 'Põlevkiviõli tehas', 'industrial', KJ, 'Järveküla tee 14', [27.29, 59.41], ['russian'], 'Järve'),
  pl('i-pl-kj-tuhamagi', 'Kohtla-Järve poolkoksimägi', 'industrial', KJ, 'Järveküla tee', [27.279, 59.4135], ['russian'], 'Järve'),
  pl('i-pl-kj-bussijaam', 'Kohtla-Järve bussijaam', 'busstation', KJ, 'Kalevi tn 4', [27.269, 59.397], ['russian'], 'Järve'),
  pl('i-pl-kj-raudteejaam', 'Kohtla-Järve raudteepeatus', 'trainstation', KJ, 'Jaama tn', [27.257, 59.3905], ['russian'], 'Järve'),
  pl('i-pl-kj-kool', 'Kohtla-Järve gümnaasium', 'school', KJ, 'Kalevi tn 3', [27.266, 59.4], ['russian'], 'Järve'),
  pl('i-pl-kj-lasteaed', 'Lasteaed (Järve)', 'kindergarten', KJ, 'Estonia pst 12', [27.272, 59.4035], ['russian'], 'Järve'),
  pl('i-pl-kj-pank', 'Pank (Kohtla-Järve)', 'bank', KJ, 'Keskallee 11', [27.2695, 59.3985], ['russian'], 'Järve'),
  pl('i-pl-kj-kultuurikeskus', 'Kohtla-Järve kultuurimaja', 'concert', KJ, 'Keskallee 19', [27.268, 59.3998], ['russian'], 'Järve'),
  pl('i-pl-kj-baar', 'Baar (Järve)', 'bar', KJ, 'Kalevi tn 6', [27.2715, 59.398], ['nightlife', 'russian'], 'Järve'),
  pl('i-pl-ahtme-keskus', 'Kaubanduskeskus (Ahtme)', 'mall', KJ, 'Ahtme mnt 49', [27.4215, 59.333], ['russian'], 'Ahtme'),
  pl('i-pl-ahtme-kool', 'Ahtme põhikool', 'school', KJ, 'Ridaküla tn 8', [27.426, 59.3275], ['russian'], 'Ahtme'),
  pl('i-pl-ahtme-haigla', 'Ida-Viru Keskhaigla (Ahtme)', 'hospital', KJ, 'Ahtme mnt 95', [27.426, 59.3285], ['russian'], 'Ahtme'),

  // Kiviõli, Püssi, Toila, Aseri, Kunda
  pl('i-pl-kivioli-seiklus', 'Kiviõli seikluskeskus (tuhamägi)', 'park', 'Kiviõli', 'Kiviõli tuhamäed', [26.953, 59.347], ['tourist']),
  pl('i-pl-kivioli-tehas', 'Kiviõli keemiatööstus', 'industrial', 'Kiviõli', 'Turu tn', [26.985, 59.359], ['russian']),
  pl('i-pl-kivioli-jaam', 'Kiviõli raudteejaam', 'trainstation', 'Kiviõli', 'Jaama tn', [26.97, 59.3595]),
  pl('i-pl-pussi-tehas', 'Püssi puitplaaditehas', 'industrial', 'Püssi', 'Viru tn', [27.048, 59.362]),
  pl('i-pl-toila-oru', 'Toila-Oru park', 'park', 'Toila', 'Pühajõe tee', [27.545, 59.42], ['tourist']),
  pl('i-pl-toila-spaa', 'Spaahotell (Toila)', 'hotel', 'Toila', 'Ranna tn', [27.515, 59.4225], ['tourist']),
  pl('i-pl-aseri-rand', 'Aseri rand', 'beach', 'Aseri', 'Ranna tn', [26.868, 59.4555]),
  pl('i-pl-kunda-sadam', 'Kunda sadam', 'port', 'Kunda', 'Sadama tn', [26.542, 59.516], ['industrial']),
  pl('i-pl-kunda-tehas', 'Kunda tsemenditehas', 'industrial', 'Kunda', 'Jaama tn', [26.53, 59.503]),
  pl('i-pl-kunda-rand', 'Kunda rand', 'beach', 'Kunda', 'Mere tn', [26.515, 59.5165]),

  // Rakvere
  pl('i-pl-rakvere-linnus', 'Rakvere linnus', 'museum', 'Rakvere', 'Vallimägi', [26.3531, 59.3456], ['tourist']),
  pl('i-pl-rakvere-tarvas', 'Tarvas (Vallimägi)', 'park', 'Rakvere', 'Vallimägi', [26.355, 59.345], ['tourist']),
  pl('i-pl-rakvere-pohjakeskus', 'Põhjakeskus', 'mall', 'Rakvere', 'Tallinna tn 41', [26.347, 59.353]),
  pl('i-pl-rakvere-vaala', 'Vaala keskus', 'mall', 'Rakvere', 'Lõuna põik 2', [26.358, 59.34]),
  pl('i-pl-rakvere-haigla', 'Rakvere haigla', 'hospital', 'Rakvere', 'Lõuna põik 1', [26.362, 59.3395]),
  pl('i-pl-rakvere-raudteejaam', 'Rakvere raudteejaam', 'trainstation', 'Rakvere', 'Jaama pst', [26.357, 59.358]),
  pl('i-pl-rakvere-bussijaam', 'Rakvere bussijaam', 'busstation', 'Rakvere', 'Laada tn 18', [26.36, 59.348]),
  pl('i-pl-rakvere-teater', 'Rakvere teater', 'concert', 'Rakvere', 'F. R. Kreutzwaldi tn 2a', [26.358, 59.3485]),
  pl('i-pl-rakvere-kirik', 'Rakvere Kolmainu kirik', 'church', 'Rakvere', 'Pikk tn 22', [26.357, 59.346]),
  pl('i-pl-rakvere-gumnaasium', 'Rakvere gümnaasium', 'school', 'Rakvere', 'Vabaduse tn 1', [26.3555, 59.3448]),
  pl('i-pl-rakvere-lasteaed', 'Lasteaed (Rakvere)', 'kindergarten', 'Rakvere', 'Tuleviku tn 3', [26.372, 59.3495]),
  pl('i-pl-rakvere-spordikeskus', 'Rakvere spordikeskus', 'stadium', 'Rakvere', 'Kastani pst 12', [26.37, 59.349]),
  pl('i-pl-rakvere-lihatoostus', 'Lihatööstus (Rakvere)', 'industrial', 'Rakvere', 'Roodevälja', [26.38, 59.358]),
  pl('i-pl-rakvere-pank', 'Pank (Rakvere)', 'bank', 'Rakvere', 'Laada tn 14', [26.359, 59.3478]),
  pl('i-pl-rakvere-baar', 'Pubi (Rakvere)', 'bar', 'Rakvere', 'Pikk tn 11', [26.3575, 59.3462], ['nightlife']),
  pl('i-pl-rakvere-hotell', 'Hotell (Rakvere)', 'hotel', 'Rakvere', 'Lai tn 3', [26.3555, 59.348]),
  pl('i-pl-rakvere-tankla', 'Tankla (Rakvere)', 'gasstation', 'Rakvere', 'Tallinna tn 92', [26.334, 59.3555]),

  // Tapa, Tamsalu, small towns
  pl('i-pl-tapa-jaam', 'Tapa raudteejaam', 'trainstation', 'Tapa', 'Jaama tn', [25.961, 59.2615]),
  pl('i-pl-tapa-linnak', 'Tapa linnak (Kaitsevägi)', 'government', 'Tapa', 'Tapa linnak', [25.93, 59.238]),
  pl('i-pl-tapa-kool', 'Tapa gümnaasium', 'school', 'Tapa', 'Pikk tn 7', [25.955, 59.2585]),
  pl('i-pl-tamsalu-jaam', 'Tamsalu raudteejaam', 'trainstation', 'Tamsalu', 'Jaama tn', [26.117, 59.161]),
  pl('i-pl-vmaarja-kirik', 'Väike-Maarja kirik', 'church', 'Väike-Maarja', 'Pikk tn', [26.2511, 59.1279]),
  pl('i-pl-kadrina-kirik', 'Kadrina kirik', 'church', 'Kadrina', 'Viitna tee', [26.1379, 59.3409]),
  pl('i-pl-haljala-kirik', 'Haljala kirik', 'church', 'Haljala', 'Tallinna mnt', [26.2542, 59.4351]),
  pl('i-pl-kuremae', 'Kuremäe klooster', 'church', 'Kuremäe', 'Kuremäe küla', [27.536, 59.196], ['russian', 'tourist']),

  // Lahemaa & Alutaguse
  pl('i-pl-palmse', 'Palmse mõis', 'museum', 'Palmse', 'Palmse küla', [25.9555, 59.516], ['tourist']),
  pl('i-pl-sagadi', 'Sagadi mõis', 'hotel', 'Sagadi', 'Sagadi küla', [26.0367, 59.5534], ['tourist']),
  pl('i-pl-vosu-rand', 'Võsu rand', 'beach', 'Võsu', 'Rannapargi tn', [25.9642, 59.577], ['tourist']),
  pl('i-pl-kasmu', 'Käsmu kapteniteküla', 'village', 'Käsmu', 'Käsmu küla', [25.8913, 59.6016], ['tourist']),
  pl('i-pl-altja', 'Altja kalurküla', 'village', 'Altja', 'Altja küla', [26.0957, 59.579], ['tourist']),
  pl('i-pl-lahemaa', 'Lahemaa rahvuspark', 'forest', 'Haljala vald', 'Lahemaa rahvuspark', [26.0, 59.52]),
  pl('i-pl-alutaguse', 'Alutaguse rahvuspark', 'forest', 'Alutaguse vald', 'Alutaguse rahvuspark', [27.4, 59.15]),
  pl('i-pl-kurtna', 'Kurtna järvestik', 'lake', 'Alutaguse vald', 'Kurtna küla', [27.505, 59.27]),
  pl('i-pl-peipsi-kauksi', 'Peipsi rand (Kauksi)', 'beach', 'Kauksi', 'Kauksi küla', [27.2164, 59.0153], ['tourist']),
  pl('i-pl-vasknarva', 'Vasknarva (Narva jõe lähe)', 'border', 'Vasknarva', 'Vasknarva küla', [27.676, 59.017], ['russian']),
  pl('i-pl-alajoe', 'Alajõe küla', 'village', 'Alajõe', 'Alajõe küla', [27.4312, 59.0293], ['russian']),
  pl('i-pl-avinurme', 'Avinurme', 'village', 'Avinurme', 'Avinurme alevik', [26.862, 58.987]),
  pl('i-pl-lohusuu', 'Lohusuu vanausuliste küla', 'village', 'Lohusuu', 'Lohusuu alevik', [27.0496, 58.9499], ['russian']),

  // Summerhouses & farms
  pl('i-pl-suvila-merikula', 'Suvilad (Meriküla)', 'summerhouse', 'Narva-Jõesuu', 'Meriküla', [27.9564, 59.404], ['russian']),
  pl('i-pl-suvila-udria', 'Aiandusühistu (Udria)', 'summerhouse', 'Narva-Jõesuu', 'Udria küla', [27.9145, 59.3901], ['russian']),
  pl('i-pl-suvila-toila', 'Suvilad (Toila)', 'summerhouse', 'Toila', 'Toila', [27.5, 59.427]),
  pl('i-pl-talu-ragavere', 'Talu (Rägavere)', 'farm', 'Vinni vald', 'Rägavere küla', [26.497, 59.3226]),
  pl('i-pl-talu-simuna', 'Talu (Simuna)', 'farm', 'Väike-Maarja vald', 'Simuna alevik', [26.3943, 59.0466]),
  pl('i-pl-talu-kiltsi', 'Talu (Kiltsi)', 'farm', 'Väike-Maarja vald', 'Kiltsi alevik', [26.1795, 59.0896]),

  // Highways
  pl('i-pl-e20-85', 'Tallinna-Narva mnt (E20), 85. km', 'highway', 'Haljala vald', 'Tallinna-Narva mnt (E20), 85. km', [26.25, 59.42]),
  pl('i-pl-e20-100', 'Tallinna-Narva mnt (E20), 100. km', 'highway', 'Rakvere vald', 'Tallinna-Narva mnt (E20), 100. km', [26.43, 59.37]),
  pl('i-pl-e20-130', 'Tallinna-Narva mnt (E20), 130. km', 'highway', 'Viru-Nigula vald', 'Tallinna-Narva mnt (E20), 130. km', [26.86, 59.425]),
  pl('i-pl-e20-150', 'Tallinna-Narva mnt (E20), 150. km', 'highway', 'Lüganuse vald', 'Tallinna-Narva mnt (E20), 150. km', [27.05, 59.375]),
  pl('i-pl-e20-163', 'Tallinna-Narva mnt (E20), 163. km', 'highway', 'Jõhvi vald', 'Tallinna-Narva mnt (E20), 163. km', [27.41, 59.368]),
  pl('i-pl-e20-185', 'Tallinna-Narva mnt (E20), 185. km', 'highway', 'Sillamäe', 'Tallinna-Narva mnt (E20), 185. km', [27.73, 59.389]),
  pl('i-pl-e20-200', 'Tallinna-Narva mnt (E20), 200. km', 'highway', 'Narva-Jõesuu', 'Tallinna-Narva mnt (E20), 200. km', [27.88, 59.38]),
  pl('i-pl-mnt3-iisaku', 'Jõhvi-Tartu-Valga mnt (3), Iisaku', 'highway', 'Alutaguse vald', 'Jõhvi-Tartu-Valga mnt (3), 33. km', [27.315, 59.11]),
  pl('i-pl-mnt91-kudrukula', 'Narva-Narva-Jõesuu mnt (91), Kudruküla', 'highway', 'Narva-Jõesuu', 'Narva-Narva-Jõesuu mnt (91), Kudruküla', [28.094, 59.432], ['russian']),
];

export const REGION_IDA: RegionDef = {
  id: 'ida',
  name: { et: 'Ida prefektuur', en: 'East Prefecture' },
  short: 'IDA',
  hqCity: 'Jõhvi',
  counties: [IV, LV],
  center: [27.27, 59.35],
  zoom: 9.3,
  bounds: [
    [25.5, 58.85],
    [28.25, 59.66],
  ],
  description: {
    et: 'Ida prefektuur hõlmab Ida-Viru ja Lääne-Viru maakonda: Narva ja Euroopa Liidu välispiir, põlevkivilinnad Kohtla-Järve, Jõhvi ja Kiviõli ning Rakvere ja Lahemaa. Suur osa helistajatest räägib vene keelt. Pikad vahemaad, piirivalve ja Narva jõgi teevad töö eriliseks.',
    en: 'The East Prefecture covers Ida-Viru and Lääne-Viru counties: Narva and the EU external border, the oil-shale towns of Kohtla-Järve, Jõhvi and Kiviõli, and Rakvere and Lahemaa. Many callers speak Russian. Long distances, border guard work and the Narva river make the job different from anywhere else.',
  },
  callVolume: 3.5,
  zones: [{ id: 'mainland', name: { et: 'Mandriosa', en: 'Mainland' }, ferryMinutes: 0 }],
  stations: STATIONS,
  arrestHouseId: 'ida-arest',
  roster: ROSTER,
  towns: TOWNS,
  streets: STREETS,
  places: PLACES,
  radioName: 'Ida',
  commander: {
    name: 'Indrek Mardisoo',
    title: { et: 'Prefekt, politseikolonel', en: 'Prefect, police colonel' },
    badge: '014',
    gender: 'M',
  },
};
