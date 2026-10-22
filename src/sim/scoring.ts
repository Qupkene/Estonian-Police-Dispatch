/**
 * Outcome & score (engine-core), see DESIGN §4.5.
 */
import { sunAltitude } from './sun';
import { regionOf } from './internal';
import type { Rng } from './rng';
import { MIN } from './time';
import { coverage, crewSkill, hasUpgrade, isUrbanCity } from './units';
import type {
  ChoiceBeat,
  Incident,
  IncidentTemplate,
  OutcomeSpec,
  Priority,
  ScoreBreakdown,
  SimState,
  Unit,
  UnitType,
} from './types';

/** SLA defaults (minutes): P1 urban 10 / rural 20; P2 20 / 35; P3 45 / 60; P4 120. */
export function defaultSla(p: Priority, urban: boolean): number {
  switch (p) {
    case 1:
      // PPA 2023: 82 % of life-threatening events in towns reached within 10.5 min, rural 19.5 min.
      return urban ? 10.5 : 19.5;
    case 2:
      return urban ? 20 : 35;
    case 3:
      return urban ? 45 : 60;
    default:
      return 120;
  }
}

export function slaFor(s: SimState, inc: Pick<Incident, 'location'>, p: Priority, tpl?: IncidentTemplate): number {
  if (tpl?.sla) return tpl.sla;
  return defaultSla(p, isUrbanCity(regionOf(s), inc.location.city, inc.location.coord));
}

export const PRIORITY_WEIGHT: Record<Priority, number> = { 1: 3, 2: 2, 3: 1, 4: 0.5 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Change public trust (0..100). Gains have diminishing returns (trust is slow to earn: ×0.5 at
 * 50, ×0.2 at 80); losses apply in full. Complaints (on-scene conduct) are halved with body cams.
 */
export function addTrust(s: SimState, delta: number, complaint = false): number {
  let d = delta;
  if (d > 0) d *= clamp((0.5 * (100 - s.trust)) / 50, 0.05, 1);
  if (d < 0 && complaint && hasUpgrade(s, 'bodycam')) d *= 0.5;
  s.trust = Math.round(clamp(s.trust + d, 0, 100) * 10) / 10;
  return d;
}

/** Units that actually reached the scene at some point. */
export function arrivedUnitIds(s: SimState, inc: Incident): string[] {
  const raw = s.flags[`i:${inc.id}:arr`];
  return typeof raw === 'string' && raw ? raw.split(',') : [];
}

export function responseMin(inc: Incident): number | null {
  return inc.firstArrivalAt !== undefined ? (inc.firstArrivalAt - inc.createdAt) / MIN : null;
}

export type ResourceLevel = 'ideal' | 'need' | 'partial' | 'under';

export function resourceLevel(s: SimState, inc: Incident): ResourceLevel {
  const types: UnitType[] = arrivedUnitIds(s, inc)
    .map((id) => s.units[id]?.type)
    .filter((t): t is UnitType => !!t);
  if (!types.length) return 'under';
  const need = coverage(types, inc.need);
  if (!need.met) return need.countOk ? 'partial' : 'under';
  if (inc.ideal.length && coverage(types, inc.ideal).met) return 'ideal';
  return inc.ideal.length ? 'need' : 'ideal';
}

function isNight(s: SimState): boolean {
  const c = regionOf(s).center;
  try {
    return sunAltitude(s.now, c[1], c[0]) < -6;
  } catch {
    return false;
  }
}

/** Success score 0..1 at the moment the on-scene work completes. */
export function computeSuccess(s: SimState, inc: Incident, rng: Rng): number {
  let v = 0.55;
  const resp = responseMin(inc);
  if (resp !== null) {
    if (resp <= inc.slaMin) v += 0.15;
    else if (resp > inc.slaMin * 1.5) v -= 0.2;
  }
  const lvl = resourceLevel(s, inc);
  v += lvl === 'ideal' ? 0.1 : lvl === 'need' ? 0 : -0.15;
  const units = arrivedUnitIds(s, inc)
    .map((id) => s.units[id])
    .filter((u): u is Unit => !!u);
  if (units.length) {
    const skill = units.reduce((a, u) => a + crewSkill(u), 0) / units.length;
    const fat = units.reduce((a, u) => a + u.fatigue, 0) / units.length;
    v += skill * 0.15 - fat * 0.1;
    if (units.some((u) => u.fatigue > 0.8)) v -= 0.1;
  }
  v += inc.effects.success;
  const wk = s.weather?.kind;
  if (wk === 'snow' || wk === 'storm' || wk === 'fog') v -= 0.04;
  else if (wk === 'rain' || wk === 'sleet') v -= 0.02;
  if (isNight(s)) v -= 0.03;
  v += rng.range(-0.1, 0.1);
  return Math.round(clamp(v, 0, 1) * 1000) / 1000;
}

const SYNTH_OUTCOME: OutcomeSpec = {
  id: 'resolved',
  weight: 1,
  result: 'resolved',
  text: { et: '{callsign}: sündmus lahendatud.', en: '{callsign}: event resolved.' },
};

/** Weighted pick among outcomes eligible for the success score. */
export function pickOutcome(rng: Rng, tpl: IncidentTemplate | undefined, inc: Incident, success: number): OutcomeSpec {
  const outs = tpl?.outcomes ?? [];
  if (!outs.length) return SYNTH_OUTCOME;
  if (inc.effects.outcome) {
    const forced = outs.find((o) => o.id === inc.effects.outcome);
    if (forced) return forced;
  }
  if (inc.falseAlarm) {
    const fa = outs.filter((o) => o.result === 'false_alarm' || o.result === 'unfounded');
    if (fa.length) return rng.weighted(fa, (o) => o.weight);
    return {
      id: 'false_alarm',
      weight: 1,
      result: 'false_alarm',
      text: { et: '{callsign}: kohal kontrollitud, valehäire.', en: '{callsign}: checked on scene, false alarm.' },
    };
  }
  const eligible = outs.filter(
    (o) => (o.minSuccess ?? 0) <= success && success <= (o.maxSuccess ?? 1) && o.result !== 'false_alarm',
  );
  if (eligible.length) return rng.weighted(eligible, (o) => o.weight);
  const nonFa = outs.filter((o) => o.result !== 'false_alarm');
  const pool = nonFa.length ? nonFa : outs;
  // Closest window.
  let best = pool[0];
  let bd = Infinity;
  for (const o of pool) {
    const lo = o.minSuccess ?? 0;
    const hi = o.maxSuccess ?? 1;
    const d = success < lo ? lo - success : success > hi ? success - hi : 0;
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/** Officer injury chance for the incident (DESIGN §4.5). */
export function injuryChance(s: SimState, inc: Incident, tpl: IncidentTemplate | undefined, success: number): number {
  const tags = new Set([...(tpl?.tags ?? []), ...inc.tags]);
  let risk = inc.effects.risk;
  if (tags.has('armed')) risk += 0.12;
  if (tags.has('weapon_knife')) risk += 0.08;
  if (tags.has('weapon_gun') || tags.has('firearm')) risk += 0.08;
  if (tags.has('violent') || inc.category === 'violence' || inc.category === 'domestic') risk += 0.03;
  if (inc.category === 'major') risk += 0.04;
  if (inc.falseAlarm) risk *= 0.2;
  let p = Math.max(0, risk) * (1 - success);
  if (hasUpgrade(s, 'taser')) p *= 0.65;
  return clamp(p, 0, 0.5);
}

/** Decision quality 0..20 from the beats and handling. */
export function decisionScore(s: SimState, inc: Incident, tpl: IncidentTemplate | undefined): number {
  let score = 20;
  let any = false;
  for (const b of inc.beats) {
    const spec = tpl?.beats?.[b.index];
    if (!spec || b.status === 'skipped' || b.status === 'pending') continue;
    switch (spec.kind) {
      case 'query':
        any = true;
        // A wrong answer counts once it is known (src/sim/fallout.ts): the crew caught it, it came out, or the shift
        // review at the end. A corrected one costs a little.
        if (b.correct === false) score -= b.caught ? 3 : b.revealed ? 7 : 0;
        else if (b.corrected) score -= 2;
        else if (b.status === 'failed') score -= 4;
        break;
      case 'choice': {
        any = true;
        if (b.answer === undefined || b.status === 'failed') score -= 4;
        else if (b.correct === false) score -= 3;
        break;
      }
      case 'backup':
        any = true;
        if (b.status === 'failed') score -= 7;
        break;
      case 'agency':
        any = true;
        if (b.status === 'failed') score -= 6;
        break;
      default:
        break;
    }
  }
  for (const n of inc.agencyNeeds) {
    any = true;
    if (!n.requested) score -= 4;
  }
  if (inc.referral && inc.closedBy === 'units') score -= 8;
  if (s.flags[`i:${inc.id}:acklate`]) score -= 2;
  if (!any) score = 18 + (inc.acknowledgedAt !== undefined && inc.acknowledgedAt - inc.createdAt <= MIN ? 2 : 0);
  return clamp(score, 0, 20);
}

/** Is a choice option the best available (by success effect)? */
export function isBestChoice(spec: ChoiceBeat, optionId: string): boolean {
  const best = Math.max(...spec.options.map((o) => o.effects.success ?? 0));
  const o = spec.options.find((x) => x.id === optionId);
  return !!o && (o.effects.success ?? 0) >= best - 1e-6;
}

function responseScore(inc: Incident): number {
  const r0 = responseMin(inc);
  if (r0 === null) return 0;
  const r = r0 / Math.max(1, inc.slaMin);
  if (r <= 0.6) return 30;
  if (r <= 1) return 30 - ((r - 0.6) / 0.4) * 4;
  if (r <= 1.5) return 26 - ((r - 1) / 0.5) * 12;
  if (r <= 2.5) return 14 - (r - 1.5) * 14;
  return 0;
}

export function scoreIncident(
  s: SimState,
  inc: Incident,
  tpl: IncidentTemplate | undefined,
  o: { success: number; result: string; officerInjured: boolean; injuries: number },
): ScoreBreakdown {
  const response = responseScore(inc);
  const lvl = resourceLevel(s, inc);
  let resources = lvl === 'ideal' ? 15 : lvl === 'need' ? 11 : lvl === 'partial' ? 6 : 3;
  const used = inc.unitHistory.map((id) => s.units[id]).filter((u): u is Unit => !!u);
  const needCount = inc.need.reduce((a, n) => a + n.count, 0) + inc.ideal.reduce((a, n) => a + n.count, 0);
  if (used.length > Math.max(2, needCount) + 2) resources -= 3;
  if (inc.truePriority >= 3 && used.some((u) => u.type === 'heli' || u.type === 'special')) resources -= 4;
  resources = clamp(resources, 0, 15);
  const decisions = decisionScore(s, inc, tpl);
  let outcome = o.success * 20;
  if (o.result === 'tragedy') outcome = Math.min(outcome, 3);
  else if (o.result === 'escaped') outcome *= 0.6;
  let safety = 10;
  if (o.officerInjured) safety -= 6;
  safety -= Math.min(4, o.injuries * 2);
  safety = clamp(safety, 0, 10);
  const diff = Math.abs(inc.priority - inc.truePriority);
  const classification = diff === 0 ? 5 : diff === 1 ? 2.5 : 0;
  const parts = { response, resources, decisions, outcome, safety, classification };
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const out: ScoreBreakdown = {
    response: r1(parts.response),
    resources: r1(parts.resources),
    decisions: r1(parts.decisions),
    outcome: r1(parts.outcome),
    safety: r1(parts.safety),
    classification: r1(parts.classification),
    total: 0,
  };
  out.total = Math.round(clamp(response + resources + decisions + outcome + safety + classification, 0, 100));
  return out;
}

/** Fixed breakdowns for closures without on-scene work. */
export function closureBreakdown(correct: boolean, inc: Incident): ScoreBreakdown {
  if (correct) {
    const classification = Math.abs(inc.priority - inc.truePriority) === 0 ? 5 : 2.5;
    const b = { response: 30, resources: 15, decisions: 20, outcome: 16, safety: 10, classification, total: 0 };
    b.total = Math.round(b.response + b.resources + b.decisions + b.outcome + b.safety + b.classification);
    return b;
  }
  const safety = inc.truePriority <= 2 ? 0 : 8;
  return { response: 0, resources: 0, decisions: 0, outcome: 0, safety, classification: 0, total: safety };
}

export const ZERO_BREAKDOWN: ScoreBreakdown = { response: 0, resources: 0, decisions: 0, outcome: 0, safety: 0, classification: 0, total: 0 };

/** Shift score: priority-weighted mean of closed incidents minus penalties (0..100). */
export function shiftScore(s: SimState): number {
  let w = 0;
  let sum = 0;
  for (const id of s.incidentOrder) {
    const inc = s.incidents[id];
    if (!inc || inc.state !== 'closed' || !inc.outcome) continue;
    if (inc.closedBy === 'director') continue;
    const pw = PRIORITY_WEIGHT[inc.truePriority] ?? 1;
    w += pw;
    sum += pw * inc.outcome.score;
  }
  if (w === 0) return 0;
  const base = sum / w;
  const pen = s.stats.expired * 1 + s.stats.callsMissed * 0.5 + s.stats.referralsWrong * 0.5 + falloutPoints(s);
  return Math.round(clamp(base - pen, 0, 100));
}

/** Shift score points lost to what came of wrong registry answers (src/sim/fallout.ts). */
export function falloutPoints(s: Pick<SimState, 'fallout'>): number {
  let p = 0;
  for (const f of s.fallout ?? []) p += f.penalty;
  return p;
}

export function updateShiftScore(s: SimState): void {
  s.stats.score = shiftScore(s);
}
