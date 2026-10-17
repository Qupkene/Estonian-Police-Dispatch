// STUB — owned by engine-systems. Keep these signatures.
import type { Incident, LngLat, SimState } from './types';

export function startPursuit(_s: SimState, _inc: Incident, _from: LngLat): void {}
/** Advance pursuit by dtMin game minutes; returns true when it ended this step. */
export function updatePursuit(_s: SimState, _inc: Incident, _dtMin: number): boolean {
  return false;
}
export function pursuitCommand(_s: SimState, _inc: Incident, _a: 'terminate' | 'heli' | 'spikes'): void {}
