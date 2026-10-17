// STUB — owned by gen-people. Keep these signatures.
import type { Person, Text, Vehicle } from '@/sim/types';

export function ageOf(p: Person, now: number): number {
  const b = new Date(p.birthDate + 'T00:00:00Z').getTime();
  return Math.floor((now - b) / (365.2425 * 86400000));
}
/** Full witness-style description: "mees, u 35-aastane, ~180 cm, tugev kehaehitus, lühikesed tumedad juuksed, must jope". */
export function describePerson(_p: Person, _now: number): Text {
  throw new Error('describePerson: not implemented');
}
/** Short: "mees, 35a" / "man, 35". */
export function shortPerson(_p: Person, _now: number): Text {
  throw new Error('shortPerson: not implemented');
}
/** "hall Toyota Avensis (123 ABC)". */
export function describeVehicle(_v: Vehicle): Text {
  throw new Error('describeVehicle: not implemented');
}
