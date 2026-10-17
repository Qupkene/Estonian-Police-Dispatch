// STUB — owned by engine-systems. Keep these signatures.
import type { ActiveCall, Agency, CallQuestionId, Incident, IncidentTemplate, Priority, SimState } from './types';

/** Decide whether a freshly created incident arrives as an interactive 112 transfer; if so create the ActiveCall. */
export function maybeCreateCall(_s: SimState, _inc: Incident, _tpl: IncidentTemplate): ActiveCall | null {
  return null;
}
/** Per-step update: ring timeouts (→ Häirekeskus creates the card itself), typing delays, interpreter delays. */
export function updateCalls(_s: SimState): void {}
export function callAnswer(_s: SimState, _callId: string): void {}
export function callAsk(_s: SimState, _callId: string, _q: CallQuestionId): void {}
export function callInterpreter(_s: SimState, _callId: string): void {}
export function callEnd(
  _s: SimState,
  _callId: string,
  _d: { action: 'create' | 'prank' | 'refer' | 'advice'; priority?: Priority; agency?: Agency },
): void {}
