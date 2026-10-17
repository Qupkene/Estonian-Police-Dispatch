import type { Rng } from '@/sim/rng';
import type { Gender } from '@/sim/types';

const W1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1];
const W2 = [3, 4, 5, 6, 7, 8, 9, 1, 2, 3];

/** Estonian personal code checksum (Rahvastikuregister algorithm). */
export function idcodeChecksum(first10: string): number {
  const d = first10.split('').map(Number);
  let s = d.reduce((acc, v, i) => acc + v * W1[i], 0) % 11;
  if (s < 10) return s;
  s = d.reduce((acc, v, i) => acc + v * W2[i], 0) % 11;
  return s < 10 ? s : 0;
}

/** Century/gender digit: 1/2 = 1800s, 3/4 = 1900s, 5/6 = 2000s, 7/8 = 2100s (odd = male). */
function centuryDigit(year: number, gender: Gender): number {
  const base = year < 1900 ? 1 : year < 2000 ? 3 : year < 2100 ? 5 : 7;
  return base + (gender === 'F' ? 1 : 0);
}

/** Build a valid isikukood for the given gender and birth date (YYYY-MM-DD). */
export function makeIdcode(rng: Rng, gender: Gender, birthDate: string): string {
  const [y, m, d] = birthDate.split('-').map(Number);
  const serial = String(rng.int(1, 999)).padStart(3, '0');
  const first10 =
    String(centuryDigit(y, gender)) +
    String(y % 100).padStart(2, '0') +
    String(m).padStart(2, '0') +
    String(d).padStart(2, '0') +
    serial;
  return first10 + idcodeChecksum(first10);
}

export interface IdcodeInfo {
  valid: boolean;
  gender?: Gender;
  birthDate?: string;
}

export function parseIdcode(code: string): IdcodeInfo {
  const c = code.replace(/\s/g, '');
  if (!/^[1-8]\d{10}$/.test(c)) return { valid: false };
  const g = Number(c[0]);
  const century = 1800 + Math.floor((g - 1) / 2) * 100;
  const year = century + Number(c.slice(1, 3));
  const month = Number(c.slice(3, 5));
  const day = Number(c.slice(5, 7));
  const dt = new Date(Date.UTC(year, month - 1, day));
  const dateOk = dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
  const sumOk = idcodeChecksum(c.slice(0, 10)) === Number(c[10]);
  return {
    valid: dateOk && sumOk,
    gender: g % 2 === 1 ? 'M' : 'F',
    birthDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}
