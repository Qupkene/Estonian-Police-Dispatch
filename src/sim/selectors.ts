/**
 * Derived data for the UI (engine-core public API, DESIGN §5). Read-only.
 */
import { regionOf, tplOf } from './internal';
import { isHidden, openIncidentIds, workBlocked, workProgress as incWorkProgress } from './incidents';
import { sunAltitude, sunTimes } from './sun';
import { MIN } from './time';
import { coverage, typeFits, unitEta, unitPosAt } from './units';
import type { Incident, IncidentTemplate, LngLat, RadioMsg, RegionDef, SimState, Text, Unit, UnitNeed } from './types';

export interface Recommendation {
  unit: Unit;
  etaMin: number;
  km: number;
  fit: 'ideal' | 'need' | 'weak' | 'unavailable' | 'unreachable';
  reason?: Text;
}

const T = (et: string, en: string): Text => ({ et, en });

/** Is an active "Toetust vajab" request waiting on this incident? */
export function backupNeeded(_s: SimState, inc: Incident): boolean {
  const tpl = tplOf(inc);
  return inc.beats.some((b) => b.status === 'active' && tpl?.beats?.[b.index]?.kind === 'backup');
}

/** Visible open incidents: incoming first, then backup requests, then priority, then SLA left. */
export function queue(s: SimState): Incident[] {
  const out: Incident[] = [];
  for (const id of openIncidentIds(s)) {
    const inc = s.incidents[id];
    if (inc && inc.state !== 'closed' && !isHidden(s, inc)) out.push(inc);
  }
  const key = new Map<string, [number, number, number, number]>();
  for (const inc of out) {
    key.set(inc.id, [inc.state === 'incoming' ? 0 : 1, backupNeeded(s, inc) ? 0 : 1, inc.priority, slaRemainingMin(s, inc)]);
  }
  return out.sort((a, b) => {
    const ka = key.get(a.id)!;
    const kb = key.get(b.id)!;
    for (let i = 0; i < 4; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return a.createdAt - b.createdAt;
  });
}

const FIT_RANK: Record<Recommendation['fit'], number> = { ideal: 0, need: 1, weak: 2, unavailable: 3, unreachable: 4 };

const UNAVAILABLE_REASON: Partial<Record<Unit['status'], Text>> = {
  onscene: T('Teisel sündmuskohal', 'At another scene'),
  transport: T('Transpordib kinnipeetut', 'Transporting a detainee'),
  busy: T('Paberitöö', 'Paperwork'),
  emergency: T('Hädaolukord', 'Emergency'),
};

/** Remaining need slots after the units already assigned. */
function remaining(s: SimState, inc: Incident, needs: UnitNeed[]): UnitNeed[] {
  const types = inc.assigned.map((id) => s.units[id]?.type).filter((t): t is Unit['type'] => !!t);
  return coverage(types, needs).missing;
}

/** Ranked units for an incident (fit vs need/ideal, then ETA); busy units last as 'unavailable'. */
export function recommendUnits(s: SimState, incidentId: string): Recommendation[] {
  const inc = s.incidents[incidentId];
  if (!inc) return [];
  const siren = Math.min(inc.priority, inc.truePriority) <= 2;
  const tpl = tplOf(inc);
  const backupBeat = inc.beats.find((b) => b.status === 'active' && tpl?.beats?.[b.index]?.kind === 'backup');
  const bkNeed = backupBeat ? (tpl!.beats![backupBeat.index] as { need: UnitNeed }).need : undefined;
  const needLeft = remaining(s, inc, inc.need);
  const idealLeft = inc.ideal.length ? remaining(s, inc, inc.ideal) : [];
  const out: Recommendation[] = [];
  for (const id of s.unitOrder) {
    const u = s.units[id];
    if (!u || u.status === 'offduty' || inc.assigned.includes(u.id)) continue;
    const eta = unitEta(s, u, inc.location.coord, inc.location.zone, siren);
    const km = eta?.km ?? 0;
    if (!eta) {
      out.push({ unit: u, etaMin: Infinity, km, fit: 'unreachable', reason: T('Maismaad pidi kättesaamatu', 'Unreachable by road') });
      continue;
    }
    const busy = u.status === 'onscene' || u.status === 'transport' || u.status === 'busy' || u.status === 'emergency';
    if (busy) {
      out.push({ unit: u, etaMin: eta.etaMin, km, fit: 'unavailable', reason: UNAVAILABLE_REASON[u.status] });
      continue;
    }
    // Diverting a unit is only worth it from a less urgent event (lower priority number = more urgent).
    const other = u.status === 'enroute' && u.incidentId ? s.incidents[u.incidentId] : undefined;
    if (other && other.state !== 'closed' && other.priority <= inc.priority) {
      out.push({
        unit: u,
        etaMin: eta.etaMin,
        km,
        fit: 'unavailable',
        reason: T('Teel sama või kiireloomulisemale sündmusele', 'En route to an equally or more urgent event'),
      });
      continue;
    }
    let fit: Recommendation['fit'];
    const specialist = SPECIALIST.includes(u.type);
    if (bkNeed && typeFits(bkNeed.type, u.type)) fit = bkNeed.type === u.type || !specialist ? (bkNeed.type === u.type ? 'ideal' : 'need') : 'weak';
    else if (idealLeft.some((n) => n.type === u.type)) fit = 'ideal';
    else if (needLeft.some((n) => n.type === u.type)) fit = 'need';
    else if (needLeft.some((n) => typeFits(n.type, u.type))) fit = specialist ? 'weak' : 'need';
    else fit = 'weak';
    let reason: Text | undefined;
    if (u.status === 'enroute') reason = T('Teel teisele sündmusele, suunatakse ümber', 'En route to another event, will be reassigned');
    else if (u.status === 'break') reason = T('Pausil, paus katkestatakse', 'On break, break will be interrupted');
    else if (u.onCall && !u.move) reason = T('Valves baasis, väljub 5 min jooksul', 'On call at base, departs within 5 min');
    else if (u.fatigue > 0.8) reason = T('Väga väsinud', 'Very tired');
    if ((u.status === 'enroute' || u.status === 'break') && fit === 'ideal') fit = 'need';
    out.push({ unit: u, etaMin: eta.etaMin, km, fit, reason });
  }
  // An "ideal" unit far away is worse than an adequate one close by: demote it.
  let nearest = Infinity;
  for (const r of out) if ((r.fit === 'ideal' || r.fit === 'need') && r.etaMin < nearest) nearest = r.etaMin;
  const slack = Math.max(8, inc.slaMin * 0.5);
  for (const r of out) {
    if (r.fit === 'ideal' && r.etaMin > nearest + slack) {
      r.fit = 'need';
      r.reason = r.reason ?? T('Sobiv üksus, kuid kaugel', 'Suitable unit, but far away');
    }
  }
  return out.sort((a, b) => FIT_RANK[a.fit] - FIT_RANK[b.fit] || availRank(a.unit) - availRank(b.unit) || a.etaMin - b.etaMin);
}

/** Unit types that should not be burned on general calls (only when explicitly needed). */
const SPECIALIST: Unit['type'][] = ['special', 'heli', 'criminal', 'boat', 'transport'];

function availRank(u: Unit): number {
  return u.status === 'available' ? 0 : 1;
}

export function unitPos(_s: SimState, u: Unit, t?: number): { pos: LngLat; heading: number } {
  return unitPosAt(u, t ?? _s.now);
}

/** Unanswered radio messages that carry reply buttons. */
export function pendingRadio(s: SimState): RadioMsg[] {
  return s.radio.filter((m) => !!m.replies?.length && !m.answered && (m.expiresAt === undefined || m.expiresAt > s.now));
}

/** Minutes left until the SLA (negative = late). Frozen at the first arrival. */
export function slaRemainingMin(s: SimState, inc: Incident): number {
  const ref = inc.firstArrivalAt ?? s.now;
  return inc.slaMin - (ref - inc.createdAt) / MIN;
}

export function incidentAgeMin(s: SimState, inc: Incident): number {
  return ((inc.closedAt ?? s.now) - inc.createdAt) / MIN;
}

export function shiftProgress(s: SimState): number {
  return Math.max(0, Math.min(1, (s.now - s.startTime) / Math.max(1, s.endTime - s.startTime)));
}

export function sun(s: SimState): { isDay: boolean; sunrise: number; sunset: number; altitude: number } {
  const c = regionOf(s)?.center ?? [24.75, 59.43];
  const { sunrise, sunset } = sunTimes(s.now, c[1], c[0]);
  const altitude = sunAltitude(s.now, c[1], c[0]);
  return { isDay: altitude > -0.833, sunrise, sunset, altitude };
}

export function liveStats(s: SimState): { open: number; p1: number; avgResponse: number | null; unitsFree: number; unitsTotal: number } {
  const q = queue(s);
  let n = 0;
  let sum = 0;
  for (const p of [1, 2, 3, 4] as const) for (const x of s.stats.responseTimes[p]) {
    n++;
    sum += x;
  }
  let free = 0;
  let total = 0;
  for (const id of s.unitOrder) {
    const u = s.units[id];
    if (!u || u.status === 'offduty') continue;
    total++;
    if (u.status === 'available') free++;
  }
  return {
    open: q.length,
    p1: q.filter((i) => i.priority === 1).length,
    avgResponse: n ? Math.round((sum / n) * 10) / 10 : null,
    unitsFree: free,
    unitsTotal: total,
  };
}

export function getRegion(s: SimState): RegionDef {
  return regionOf(s);
}

export function templateOf(_s: SimState, inc: Incident): IncidentTemplate | undefined {
  return tplOf(inc);
}

// ── Extra selectors ─────────────────────────────────────────────────────────

/** On-scene work progress 0..1. */
export function workProgress(_s: SimState, inc: Incident): number {
  return incWorkProgress(inc);
}

/** Why on-scene work is paused: waiting for backup / pursuit / search / not enough units. */
export function workPaused(s: SimState, inc: Incident): 'backup' | 'pursuit' | 'search' | 'resources' | null {
  if (inc.state !== 'onscene') return null;
  const b = workBlocked(s, inc, tplOf(inc));
  if (b) return b;
  const types = inc.assigned
    .map((id) => s.units[id])
    .filter((u): u is Unit => !!u && u.status === 'onscene')
    .map((u) => u.type);
  return coverage(types, inc.need).met ? null : 'resources';
}

/** Units assigned to an incident, resolved. */
export function assignedUnits(s: SimState, inc: Incident): Unit[] {
  return inc.assigned.map((id) => s.units[id]).filter((u): u is Unit => !!u);
}

/** Minutes until a unit arrives at its incident (null if not en route). */
export function unitEtaMin(s: SimState, u: Unit): number | null {
  if (!u.move || (u.status !== 'enroute' && u.status !== 'transport')) return null;
  return Math.max(0, (u.move.arriveAt - s.now) / MIN);
}

/** Total km driven this shift (all units) and per unit. */
export function kmDriven(s: SimState, unitId?: string): number {
  return Number(unitId ? s.flags[`km:${unitId}`] : s.flags.kmDriven) || 0;
}

/** Owned upgrade? */
export function hasUpgradeSel(s: SimState, id: string): boolean {
  return s.flags[`upg:${id}`] === true;
}
