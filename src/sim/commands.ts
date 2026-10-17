// STUB — owned by engine-core. Keep these signatures.
import type { Agency, CallQuestionId, LngLat, Priority, RadioMsg, SimState, Text } from './types';

const todo = (n: string): never => {
  throw new Error(`${n}: not implemented`);
};

export function acknowledge(_s: SimState, _incidentId: string): void {
  todo('acknowledge');
}
export function setPriority(_s: SimState, _incidentId: string, _p: Priority): void {
  todo('setPriority');
}
export function dispatchUnits(_s: SimState, _incidentId: string, _unitIds: string[]): { ok: boolean; reason?: Text } {
  return todo('dispatchUnits');
}
export function recallUnit(_s: SimState, _unitId: string): void {
  todo('recallUnit');
}
export function closeIncident(
  _s: SimState,
  _incidentId: string,
  _how: 'referral' | 'phone' | 'duplicate' | 'prank',
  _agency?: Agency,
): void {
  todo('closeIncident');
}
export function requestAgency(_s: SimState, _incidentId: string, _agency: Agency): void {
  todo('requestAgency');
}
export function replyRadio(_s: SimState, _msgId: string, _replyId: string): void {
  todo('replyRadio');
}
export function setUnitBreak(_s: SimState, _unitId: string, _onBreak: boolean): void {
  todo('setUnitBreak');
}
export function markChecked(_s: SimState, _incidentId: string, _ref: { personId?: string; plate?: string }): void {
  todo('markChecked');
}
export function answerCall(_s: SimState, _callId: string): void {
  todo('answerCall');
}
export function askCall(_s: SimState, _callId: string, _q: CallQuestionId): void {
  todo('askCall');
}
export function toggleInterpreter(_s: SimState, _callId: string): void {
  todo('toggleInterpreter');
}
export function endCall(
  _s: SimState,
  _callId: string,
  _d: { action: 'create' | 'prank' | 'refer' | 'advice'; priority?: Priority; agency?: Agency },
): void {
  todo('endCall');
}
export function pursuitAction(_s: SimState, _incidentId: string, _a: 'terminate' | 'heli' | 'spikes'): void {
  todo('pursuitAction');
}
export function directorSpawn(
  _s: SimState,
  _o: { templateId: string; coord?: LngLat; priority?: Priority; summary?: Text },
): string {
  return todo('directorSpawn');
}
export function directorRadio(_s: SimState, _from: string, _text: Text, _level?: RadioMsg['level']): void {
  todo('directorRadio');
}
export function directorMoveUnit(_s: SimState, _unitId: string, _coord: LngLat): void {
  todo('directorMoveUnit');
}
