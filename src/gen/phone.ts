// Owned by gen-people. Estonian (and a few foreign) phone number formats.
import type { Rng } from '@/sim/rng';
import type { Citizenship } from '@/sim/types';

const digits = (rng: Rng, n: number): string => {
  let s = '';
  for (let i = 0; i < n; i++) s += String(rng.int(0, 9));
  return s;
};

/**
 * Estonian mobile number: mostly 8-digit "+372 5xxx xxxx", older 7-digit "+372 5xx xxxx" (kept by
 * many middle-aged and older people) and newer 8-digit "+372 8xxx xxxx" (81-84 ranges).
 */
export function mobileNumber(rng: Rng, age?: number): string {
  const short = age === undefined ? 0.3 : age >= 45 ? 0.45 : age >= 30 ? 0.3 : 0.1;
  const eight = age !== undefined && age < 30 ? 0.16 : 0.08;
  const r = rng.next();
  if (r < short) return `+372 5${digits(rng, 2)} ${digits(rng, 4)}`;
  if (r < short + eight) return `+372 8${rng.int(1, 4)}${digits(rng, 2)} ${digits(rng, 4)}`;
  return `+372 5${digits(rng, 3)} ${digits(rng, 4)}`;
}

/** Geographic area codes (7-digit numbers: 6xx xxxx Tallinn/Harjumaa, 44x xxxx Pärnu, …). */
const COUNTY_CODES: Record<string, string[]> = {
  'Harju maakond': ['6'],
  'Tartu maakond': ['73', '74'],
  'Pärnu maakond': ['44'],
  'Ida-Viru maakond': ['33', '35'],
  'Lääne-Viru maakond': ['32'],
  'Saare maakond': ['45'],
  'Lääne maakond': ['47'],
  'Viljandi maakond': ['43'],
  'Võru maakond': ['78'],
  'Valga maakond': ['76'],
  'Järva maakond': ['38'],
  'Rapla maakond': ['48'],
  'Hiiu maakond': ['46'],
  'Jõgeva maakond': ['77'],
  'Põlva maakond': ['79'],
};

const CITY_CODES: Record<string, string> = {
  Tallinn: '6',
  Maardu: '6',
  Keila: '6',
  Saue: '6',
  Paldiski: '6',
  Kehra: '6',
  Loksa: '6',
  Saku: '6',
  Viimsi: '6',
  Kiili: '6',
  Aegviidu: '6',
  Kose: '6',
  Kuusalu: '6',
  Jüri: '6',
  Kohila: '48',
  Tartu: '7',
  Elva: '73',
  Kallaste: '74',
  Pärnu: '44',
  Sindi: '44',
  Paikuse: '44',
  'Kilingi-Nõmme': '44',
  'Pärnu-Jaagupi': '44',
  Vändra: '44',
  Narva: '35',
  'Narva-Jõesuu': '35',
  Sillamäe: '39',
  Jõhvi: '33',
  'Kohtla-Järve': '33',
  Kiviõli: '33',
  Püssi: '33',
  'Kohtla-Nõmme': '33',
  Toila: '33',
  Rakvere: '32',
  Tapa: '32',
  Kunda: '32',
  Tamsalu: '32',
  Haljala: '32',
  'Väike-Maarja': '32',
  Kuressaare: '45',
  Orissaare: '45',
  Haapsalu: '47',
  Lihula: '47',
  Viljandi: '43',
  Võhma: '43',
  'Suure-Jaani': '43',
  'Karksi-Nuia': '43',
  'Abja-Paluoja': '43',
  Mõisaküla: '43',
  Võru: '78',
  Antsla: '78',
  Valga: '76',
  Tõrva: '76',
  Otepää: '76',
  Paide: '38',
  Türi: '38',
  'Järva-Jaani': '38',
  Rapla: '48',
  Märjamaa: '48',
  Järvakandi: '48',
  Kärdla: '46',
  Käina: '46',
  Jõgeva: '77',
  Põltsamaa: '77',
  Mustvee: '77',
  Põlva: '79',
  Räpina: '79',
};

/** Area-code prefix for a city (or its county); undefined when unknown. */
export function areaCode(city: string, county?: string): string | undefined {
  const base = city.replace(/\s+(linn|vald|alev|alevik|küla)$/i, '').trim();
  return CITY_CODES[base] ?? (county ? COUNTY_CODES[county]?.[0] : undefined);
}

/** Landline for a city, e.g. Tallinn "+372 6xx xxxx", Pärnu "+372 44x xxxx". */
export function landlineNumber(rng: Rng, city: string, county?: string): string {
  let code = areaCode(city, county) ?? '6';
  // Tartu city numbers are 73x/74x.
  if (code === '7') code = rng.pick(['73', '74']);
  const rest = digits(rng, 7 - code.length);
  const all = code + rest;
  return `+372 ${all.slice(0, 3)} ${all.slice(3)}`;
}

/** Mobile number of a foreign visitor's home country (falls back to Estonian). */
export function foreignMobile(rng: Rng, country: Citizenship): string {
  switch (country) {
    case 'FIN':
      return `+358 ${rng.pick(['40', '41', '44', '45', '50'])} ${digits(rng, 3)} ${digits(rng, 4)}`;
    case 'LVA':
      return `+371 2${digits(rng, 3)} ${digits(rng, 4)}`;
    case 'LTU':
      return `+370 6${digits(rng, 2)} ${digits(rng, 5)}`;
    case 'UKR': {
      const op = rng.pick(['50', '63', '66', '67', '68', '73', '93', '95', '96', '97', '98', '99']);
      return `+380 ${op} ${digits(rng, 3)} ${digits(rng, 2)} ${digits(rng, 2)}`;
    }
    case 'RUS':
      return `+7 9${digits(rng, 2)} ${digits(rng, 3)}-${digits(rng, 2)}-${digits(rng, 2)}`;
    default:
      return mobileNumber(rng);
  }
}
