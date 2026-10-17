// STUB — owned by engine-core. Keep these signatures.
import type { GameEvent, NewShiftOptions, ShiftReport, SimState } from './types';

export function createShift(_opts: NewShiftOptions): SimState {
  throw new Error('createShift: not implemented');
}

export function step(_s: SimState, _dtGameMs: number): void {
  throw new Error('step: not implemented');
}

export function drainEvents(s: SimState): GameEvent[] {
  const out = s.events;
  s.events = [];
  return out;
}

export function finalizeShift(_s: SimState): ShiftReport {
  throw new Error('finalizeShift: not implemented');
}
