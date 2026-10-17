// STUB — owned by registry-data. Keep these signatures.
import type { Rng } from '@/sim/rng';
import type { Person, Vehicle, VehicleKind, VehicleSpec } from '@/sim/types';

export interface VehicleGenOptions {
  now: number;
  kind?: VehicleKind;
  owner?: Person;
  spec?: VehicleSpec;
}

export function generateVehicle(_rng: Rng, _o: VehicleGenOptions): Vehicle {
  throw new Error('generateVehicle: not implemented');
}
/** "123 ABC" style plate (other formats for moto/trailer as appropriate). */
export function makePlate(_rng: Rng, _kind?: VehicleKind): string {
  throw new Error('makePlate: not implemented');
}
export function makeVin(_rng: Rng, _make: string, _year: number): string {
  throw new Error('makeVin: not implemented');
}
/** Normalise user input for plate search: uppercase, single space between digits and letters. */
export function normalizePlate(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '');
}
