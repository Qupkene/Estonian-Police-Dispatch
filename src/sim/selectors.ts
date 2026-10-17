/**
 * Derived data for the UI (engine-core public API, DESIGN §5). Read-only.
 */
import { regionOf, tplOf } from './internal';
import { isHidden, openIncidentIds, workBlocked, workProgress as incWorkProgress } from './incidents';
import { sunAltitude, sunTimes } from './sun';
import { MIN } from './time';
import { haversineKm } from './geo';
import { slaFor } from './scoring';
import { boatCanReach, coverage, ferryMinutes, typeFits, unitEta, unitPosAt, unitZoneNow } from './units';
import type { Incident, IncidentTemplate, LngLat, RadioMsg, RegionDef, SimState, Text, Unit, UnitNeed } from './types';

export interface Recommendation {
  unit: Unit;
  etaMin: number;
  km: number;
  fit: 'ideal' | 'need' | 'weak' | 'unavailable' | 'unreachable';
  reason?: Text;
  /**
   * Never the automatic pick (D key, the big "Saada" button, "Saada abi"): a specialist on a
   * routine call, a unit beyond the remaining need, or one that would have to take a ferry. The
   * player can still pick it by hand.
   */
  manual?: boolean;
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

/** Unit types that should not be burned on general calls (only when explicitly needed). */
export const SPECIALIST: readonly Unit['type'][] = ['special', 'heli', 'criminal', 'boat', 'transport'];

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

/**
 * Time budget the dispatcher works with: the SLA of the priority shown on the card (the true
 * priority, and so `slaMin`, may still be hidden from the player).
 */
function budgetMin(s: SimState, inc: Incident): number {
  return inc.priority === inc.truePriority ? inc.slaMin : slaFor(s, inc, inc.priority);
}

/**
 * Ranked units for an incident, the way a dispatcher would choose:
 * 1. fit: 'ideal' (fills a remaining need slot and is the type the event ideally wants), 'need'
 *    (fills a remaining need slot), 'weak' (adds nothing to the remaining need, a specialist on a
 *    routine call, or across a ferry), then 'unavailable' and 'unreachable';
 * 2. effective ETA: the drive time plus a penalty for pulling a unit off a less urgent job or a
 *    break, so a crew next door on a P4 beats a free crew an hour away.
 * An 'ideal' unit much further away than the nearest adequate one drops to 'need'.
 */
export function recommendUnits(s: SimState, incidentId: string): Recommendation[] {
  const inc = s.incidents[incidentId];
  if (!inc) return [];
  const region = regionOf(s);
  const siren = Math.min(inc.priority, inc.truePriority) <= 2;
  const tpl = tplOf(inc);
  const backupBeat = inc.beats.find((b) => b.status === 'active' && tpl?.beats?.[b.index]?.kind === 'backup');
  const bkNeed = backupBeat ? (tpl!.beats![backupBeat.index] as { need: UnitNeed }).need : undefined;
  const needLeft = remaining(s, inc, inc.need);
  const idealLeft = inc.ideal.length ? remaining(s, inc, inc.ideal) : [];
  const out: Recommendation[] = [];
  /** Recommendations that need a ferry crossing, with the zone the unit is in now. */
  const ferry = new Map<Recommendation, string>();
  for (const id of s.unitOrder) {
    const u = s.units[id];
    if (!u || u.status === 'offduty' || inc.assigned.includes(u.id)) continue;
    if (u.type === 'boat' && !boatCanReach(s, u, inc)) {
      const km = haversineKm(unitPosAt(u, s.now).pos, inc.location.coord);
      out.push({ unit: u, etaMin: Infinity, km, fit: 'unreachable', reason: T('Veesõidukiga kättesaamatu', 'Unreachable by boat') });
      continue;
    }
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
    const specialist = SPECIALIST.includes(u.type);
    const idealType = idealLeft.some((n) => n.type === u.type);
    let fit: Recommendation['fit'];
    let why: Text | undefined;
    if (bkNeed && typeFits(bkNeed.type, u.type)) {
      fit = bkNeed.type === u.type ? 'ideal' : specialist ? 'weak' : 'need';
      if (fit === 'weak') why = T('Eriüksus, ei sobi tavaväljakutsele', 'Specialist unit, not for routine calls');
    } else if (needLeft.length) {
      if (!needLeft.some((n) => typeFits(n.type, u.type))) {
        // An ideal-only type (investigator, helicopter) or another type that cannot fill a slot:
        // it helps once the basic need is covered, not instead of it.
        fit = 'weak';
        why =
          specialist && !idealType
            ? T('Eriüksus, ei sobi tavaväljakutsele', 'Specialist unit, not for routine calls')
            : T('Täiendav üksus, ei kata põhivajadust', 'Additional unit, does not cover the basic need');
      } else if (idealType) fit = 'ideal';
      else if (needLeft.some((n) => n.type === u.type)) fit = 'need';
      else if (specialist) {
        fit = 'weak';
        why = T('Eriüksus, ei sobi tavaväljakutsele', 'Specialist unit, not for routine calls');
      } else fit = 'need';
    } else if (idealType) fit = 'ideal';
    else {
      fit = 'weak';
      why = T('Vajadus on juba kaetud', 'The need is already covered');
    }
    let reason: Text | undefined = why;
    if (!reason) {
      if (u.status === 'enroute') reason = T('Teel teisele sündmusele, suunatakse ümber', 'En route to another event, will be reassigned');
      else if (u.status === 'break') reason = T('Pausil, paus katkestatakse', 'On break, break will be interrupted');
      else if (u.onCall && !u.move) reason = T('Valves baasis, väljub 5 min jooksul', 'On call at base, departs within 5 min');
      else if (u.fatigue > 0.8) reason = T('Väga väsinud', 'Very tired');
    }
    const r: Recommendation = { unit: u, etaMin: eta.etaMin, km, fit, reason };
    if (fit === 'weak' && (specialist || !needLeft.length)) r.manual = true;
    if (u.type !== 'heli' && u.type !== 'boat') {
      const zone = unitZoneNow(s, u);
      if ((ferryMinutes(region, zone, inc.location.zone) ?? 0) > 0) ferry.set(r, zone);
    }
    out.push(r);
  }
  // Across a ferry: hours away, and it strips the island (or the mainland) of a crew. Only a P1 on
  // an island with no adequate local unit free gets a mainland crew sent over automatically.
  if (ferry.size) {
    const localOk = out.some((r) => (r.fit === 'ideal' || r.fit === 'need') && !ferry.has(r));
    for (const [r, zone] of ferry) {
      if (r.fit === 'ideal' || r.fit === 'need') {
        const sendOver = inc.priority === 1 && !localOk && zone === 'mainland' && inc.location.zone !== 'mainland';
        if (sendOver) {
          r.fit = 'need';
          r.reason = T('Praamiga, kohalikku vaba üksust pole', 'By ferry, no local unit free');
          continue;
        }
        r.fit = 'weak';
      }
      r.manual = true;
      r.reason = T('Teises tsoonis (praam)', 'Other zone (ferry)');
    }
  }
  // Effective ETA: drive time plus the cost of pulling a unit off a less urgent job or a break.
  const budget = budgetMin(s, inc);
  const pen = Math.max(3, budget * 0.2);
  const eff = (r: Recommendation) => r.etaMin + (r.unit.status === 'available' ? 0 : pen);
  // An "ideal" unit far away is worse than an adequate one close by: demote it.
  let nearest = Infinity;
  for (const r of out) if ((r.fit === 'ideal' || r.fit === 'need') && eff(r) < nearest) nearest = eff(r);
  const slack = Math.max(5, budget * 0.25);
  for (const r of out) {
    if (r.fit === 'ideal' && eff(r) > nearest + slack) {
      r.fit = 'need';
      r.reason = r.reason ?? T('Sobiv üksus, kuid kaugel', 'Suitable unit, but far away');
    }
  }
  return out.sort((a, b) => FIT_RANK[a.fit] - FIT_RANK[b.fit] || Number(!!a.manual) - Number(!!b.manual) || eff(a) - eff(b) || 0);
}

/** Recommendations the D key / "Saada" may send on its own: fit for the job and not hand-pick only. */
export function autoPickable(r: Recommendation): boolean {
  if (r.manual) return false;
  return r.fit === 'ideal' || r.fit === 'need' || (r.fit === 'weak' && !SPECIALIST.includes(r.unit.type));
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
