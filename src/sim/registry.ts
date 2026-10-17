// STUB — owned by engine-systems. Keep these signatures.
import type { Person, SimState, Text, Vehicle } from './types';

export interface RecordFlag {
  id: string;
  severity: 'info' | 'warn' | 'danger';
  text: Text;
}

export function searchPersons(_s: SimState, _q: string): Person[] {
  throw new Error('searchPersons: not implemented');
}
export function searchVehicles(_s: SimState, _q: string): Vehicle[] {
  throw new Error('searchVehicles: not implemented');
}
export function personFlags(_p: Person, _now: number): RecordFlag[] {
  throw new Error('personFlags: not implemented');
}
export function vehicleFlags(_v: Vehicle, _now: number): RecordFlag[] {
  throw new Error('vehicleFlags: not implemented');
}
/** Correct radio reply id for a query subject (person id or plate). */
export function correctReply(_s: SimState, _subject: { personId?: string; plate?: string }): string {
  throw new Error('correctReply: not implemented');
}
