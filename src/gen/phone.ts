// STUB — owned by gen-people. Keep these signatures.
import type { Rng } from '@/sim/rng';

/** "+372 5123 4567" */
export function mobileNumber(rng: Rng): string {
  return `+372 5${rng.int(100, 999)} ${rng.int(1000, 9999)}`;
}
/** Landline for a city, e.g. Tallinn "+372 6xx xxxx". */
export function landlineNumber(rng: Rng, _city: string): string {
  return `+372 6${rng.int(10, 99)} ${rng.int(1000, 9999)}`;
}
