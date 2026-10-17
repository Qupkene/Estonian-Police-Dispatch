/**
 * Internal engine helpers shared by engine-core and engine-systems modules.
 * Owned by engine-core.
 *
 * `publishIncident` and `moveUnitTo` are bound to the engine-core implementations as soon as this
 * module loads (no need to import engine.ts first); `wireInternals` can still override them
 * (e.g. in tests).
 */
import { REGIONS } from '@/data/regions';
import { TEMPLATE_BY_ID, TEMPLATES } from '@/data/incidents';
import { publishIncidentImpl } from './incidents';
import { moveUnitToImpl } from './units';
import type { GameEvent, Incident, IncidentTemplate, LngLat, RadioMsg, RegionDef, SimState, Text, TimelineEntry, Unit } from './types';

export function regionOf(s: SimState): RegionDef {
  return REGIONS[s.regionId];
}

export function tplOf(inc: Incident): IncidentTemplate | undefined {
  return TEMPLATE_BY_ID[inc.templateId];
}

export function templateById(id: string): IncidentTemplate | undefined {
  return TEMPLATE_BY_ID[id];
}

/** All incident templates (content). */
export function allTemplates(): IncidentTemplate[] {
  return TEMPLATES;
}

export function addTimeline(s: SimState, inc: Incident, kind: TimelineEntry['kind'], text: Text): void {
  inc.timeline.push({ t: s.now, kind, text });
}

export function emit(s: SimState, ev: Omit<GameEvent, 't'>): void {
  s.events.push({ t: s.now, ...ev });
}

const MAX_RADIO = 300;

export function pushRadio(s: SimState, msg: Omit<RadioMsg, 'id' | 't'> & { t?: number }): RadioMsg {
  const m: RadioMsg = { id: `r${++s.seq.radio}`, t: msg.t ?? s.now, ...msg };
  s.radio.push(m);
  if (s.radio.length > MAX_RADIO) s.radio.splice(0, s.radio.length - MAX_RADIO);
  emit(s, { type: m.level === 'emergency' ? 'radio_emergency' : 'radio', incidentId: m.incidentId, unitId: m.unitId, text: m.text });
  return m;
}

/**
 * Make a (possibly hidden) incident visible in the queue and notify the UI: clears
 * `flags['hidden:<id>']`, shifts expiry/escalation timers by the time the call took, adds the
 * timeline entry and emits incident_new / incident_p1. Idempotent.
 */
export let publishIncident: (s: SimState, inc: Incident) => void = (s, inc) => publishIncidentImpl(s, inc);

/**
 * Send a unit somewhere (computes path + ETA, sets status: incident → enroute, transport →
 * transport, patrol/return → available, pursuit/search → unchanged unless available → enroute).
 * Unreachable targets (other zone without ferry) leave the unit unchanged.
 */
export let moveUnitTo: (
  s: SimState,
  u: Unit,
  to: LngLat,
  purpose: NonNullable<Unit['move']>['purpose'],
  siren: boolean,
) => void = (s, u, to, purpose, siren) => moveUnitToImpl(s, u, to, purpose, siren);

/** Override the implementations above (tests). */
export function wireInternals(impl: { publishIncident: typeof publishIncident; moveUnitTo: typeof moveUnitTo }): void {
  publishIncident = impl.publishIncident;
  moveUnitTo = impl.moveUnitTo;
}
