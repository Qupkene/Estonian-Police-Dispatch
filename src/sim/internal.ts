/**
 * Internal engine helpers shared by engine-core and engine-systems modules.
 * Owned by engine-core; the trivial helpers are implemented here already.
 */
import { REGIONS } from '@/data/regions';
import { TEMPLATE_BY_ID } from '@/data/incidents';
import type { GameEvent, Incident, IncidentTemplate, LngLat, RadioMsg, RegionDef, SimState, Text, TimelineEntry, Unit } from './types';

export function regionOf(s: SimState): RegionDef {
  return REGIONS[s.regionId];
}

export function tplOf(inc: Incident): IncidentTemplate | undefined {
  return TEMPLATE_BY_ID[inc.templateId];
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

/** Make a (possibly hidden) incident visible in the queue and notify the UI. Implemented by engine-core. */
export let publishIncident: (s: SimState, inc: Incident) => void = () => {
  throw new Error('publishIncident not wired');
};

/** Send a unit somewhere (computes path + ETA, sets status). Implemented by engine-core. */
export let moveUnitTo: (
  s: SimState,
  u: Unit,
  to: LngLat,
  purpose: NonNullable<Unit['move']>['purpose'],
  siren: boolean,
) => void = () => {
  throw new Error('moveUnitTo not wired');
};

/** engine-core calls this once at module init to provide the implementations above. */
export function wireInternals(impl: { publishIncident: typeof publishIncident; moveUnitTo: typeof moveUnitTo }): void {
  publishIncident = impl.publishIncident;
  moveUnitTo = impl.moveUnitTo;
}
