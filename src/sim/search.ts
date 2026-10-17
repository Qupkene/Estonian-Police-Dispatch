// STUB — owned by engine-systems. Keep these signatures.
import type { Incident, SimState } from './types';

export function startSearch(_s: SimState, _inc: Incident, _radiusKm: number): void {}
/** Advance search by dtMin; returns true when the target was found this step. */
export function updateSearch(_s: SimState, _inc: Incident, _dtMin: number): boolean {
  return false;
}
