// STUB — owned by engine-core. Keep these signatures.
import type { Incident, IncidentTemplate, LngLat, RadioMsg, RegionDef, SimState, Text, Unit } from './types';

export interface Recommendation {
  unit: Unit;
  etaMin: number;
  km: number;
  fit: 'ideal' | 'need' | 'weak' | 'unavailable' | 'unreachable';
  reason?: Text;
}

const todo = (n: string): never => {
  throw new Error(`${n}: not implemented`);
};

export function queue(_s: SimState): Incident[] {
  return todo('queue');
}
export function recommendUnits(_s: SimState, _incidentId: string): Recommendation[] {
  return todo('recommendUnits');
}
export function unitPos(_s: SimState, u: Unit, _t?: number): { pos: LngLat; heading: number } {
  return { pos: u.pos, heading: u.heading };
}
export function pendingRadio(_s: SimState): RadioMsg[] {
  return todo('pendingRadio');
}
export function slaRemainingMin(_s: SimState, _inc: Incident): number {
  return todo('slaRemainingMin');
}
export function incidentAgeMin(_s: SimState, _inc: Incident): number {
  return todo('incidentAgeMin');
}
export function shiftProgress(_s: SimState): number {
  return todo('shiftProgress');
}
export function sun(_s: SimState): { isDay: boolean; sunrise: number; sunset: number; altitude: number } {
  return todo('sun');
}
export function liveStats(_s: SimState): {
  open: number;
  p1: number;
  avgResponse: number | null;
  unitsFree: number;
  unitsTotal: number;
} {
  return todo('liveStats');
}
export function getRegion(_s: SimState): RegionDef {
  return todo('getRegion');
}
export function templateOf(_s: SimState, _inc: Incident): IncidentTemplate | undefined {
  return todo('templateOf');
}
