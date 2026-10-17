// STUB — owned by engine-systems. Pure career/economy rules (no storage). Keep these signatures.
import type { Rng } from './rng';
import type { Candidate, CareerProfile, LedgerEntry, RegionId, RosterUnit, ShiftReport, Text } from './types';

export function newCareer(_name: string, _badge: string, _regionId: RegionId, _seed: number): CareerProfile {
  throw new Error('newCareer: not implemented');
}
/** Crews of 2 (patrol) etc. from active staff + fleet for the given shift. */
export function rosterFromCareer(_p: CareerProfile, _shift: 'day' | 'night'): RosterUnit[] {
  throw new Error('rosterFromCareer: not implemented');
}
/** Apply a finished shift: money, reputation, xp, injuries, day++, payday every 30 days. Returns a new profile. */
export function applyShiftReport(
  _p: CareerProfile,
  _r: ShiftReport,
): { profile: CareerProfile; ledger: LedgerEntry[]; messages: Text[] } {
  throw new Error('applyShiftReport: not implemented');
}
export function generateCandidates(_rng: Rng, _n: number, _p: CareerProfile): Candidate[] {
  throw new Error('generateCandidates: not implemented');
}
export function hire(_p: CareerProfile, _candidateId: string): { profile: CareerProfile; error?: Text } {
  throw new Error('hire: not implemented');
}
export function fire(_p: CareerProfile, _staffId: string): CareerProfile {
  throw new Error('fire: not implemented');
}
export function buyVehicle(_p: CareerProfile, _catalogId: string): { profile: CareerProfile; error?: Text } {
  throw new Error('buyVehicle: not implemented');
}
export function sellVehicle(_p: CareerProfile, _vehicleId: string): CareerProfile {
  throw new Error('sellVehicle: not implemented');
}
export function buyUpgrade(_p: CareerProfile, _upgradeId: string): { profile: CareerProfile; error?: Text } {
  throw new Error('buyUpgrade: not implemented');
}
export function rankOf(_xp: number): { index: number; name: Text; next?: number } {
  throw new Error('rankOf: not implemented');
}
/** Monthly running costs (salaries + upkeep) for display. */
export function monthlyCosts(_p: CareerProfile): { salaries: number; upkeep: number; total: number } {
  throw new Error('monthlyCosts: not implemented');
}
