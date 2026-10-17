/**
 * Guarded access to the engine's public selectors. While engine modules are still stubs (or if a
 * selector throws on odd data) we fall back to simple local computations so the CAD screen never
 * crashes. Everything here is read-only.
 */
import * as S from '@/sim/selectors';
import type { Recommendation } from '@/sim/selectors';
import { haversineKm } from '@/sim/geo';
import { MIN, wall } from '@/sim/time';
import { REGIONS } from '@/data/regions';
import { TEMPLATE_BY_ID } from '@/data/incidents';
import type {
  BackupBeat,
  BeatState,
  Incident,
  IncidentPersonRef,
  IncidentTemplate,
  QueryBeat,
  RadioMsg,
  RadioReply,
  RegionDef,
  SimState,
  Unit,
  UnitNeed,
} from '@/sim/types';
import { parseQueryRef, sortQueue, typeFits } from './format';

const warned = new Set<string>();

function warnOnce(key: string, err: unknown) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[EPD game] ${key} unavailable, using fallback:`, err instanceof Error ? err.message : err);
}

/** Run fn; on any exception return the fallback (lazily computed) and warn once per key. */
export function safe<T>(key: string, fn: () => T, fallback: () => T): T {
  try {
    return fn();
  } catch (err) {
    warnOnce(key, err);
    try {
      return fallback();
    } catch (err2) {
      warnOnce(key + ':fallback', err2);
      throw err2;
    }
  }
}

/** Like safe(), but never throws (returns `dflt` if even the fallback fails). */
export function soft<T>(key: string, fn: () => T, dflt: T): T {
  try {
    return fn();
  } catch (err) {
    warnOnce(key, err);
    return dflt;
  }
}

const isHidden = (s: SimState, inc: Incident) => !!s.flags[`hidden:${inc.id}`];

export function selQueue(s: SimState): Incident[] {
  return safe(
    'queue',
    () => S.queue(s),
    () =>
      sortQueue(
        s.incidentOrder
          .map((id) => s.incidents[id])
          .filter((inc): inc is Incident => !!inc && inc.state !== 'closed' && !isHidden(s, inc)),
      ),
  );
}

/** Most recently closed incidents (newest first). */
export function recentClosed(s: SimState, n = 12): Incident[] {
  const out: Incident[] = [];
  for (let i = s.incidentOrder.length - 1; i >= 0 && out.length < n * 3; i--) {
    const inc = s.incidents[s.incidentOrder[i]];
    if (inc && inc.state === 'closed') out.push(inc);
  }
  return out.sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)).slice(0, n);
}

export function selAgeMin(s: SimState, inc: Incident): number {
  return safe('incidentAgeMin', () => S.incidentAgeMin(s, inc), () => (s.now - inc.createdAt) / MIN);
}

export function selSlaMin(s: SimState, inc: Incident): number {
  return safe(
    'slaRemainingMin',
    () => S.slaRemainingMin(s, inc),
    () => {
      const ref = inc.firstArrivalAt ?? s.now;
      return inc.slaMin - (ref - inc.createdAt) / MIN;
    },
  );
}

export function selShiftProgress(s: SimState): number {
  return safe(
    'shiftProgress',
    () => S.shiftProgress(s),
    () => Math.max(0, Math.min(1, (s.now - s.startTime) / Math.max(1, s.endTime - s.startTime))),
  );
}

export function selSun(s: SimState): { isDay: boolean; sunrise: number | null; sunset: number | null } {
  return safe<{ isDay: boolean; sunrise: number | null; sunset: number | null }>(
    'sun',
    () => S.sun(s),
    () => {
      const hh = wall(s.now).hour;
      return { isDay: hh >= 7 && hh < 19, sunrise: null, sunset: null };
    },
  );
}

export interface LiveStats {
  open: number;
  p1: number;
  avgResponse: number | null;
  unitsFree: number;
  unitsTotal: number;
}

export function selLiveStats(s: SimState): LiveStats {
  return safe('liveStats', () => S.liveStats(s), () => {
    const q = selQueue(s);
    const all = Object.values(s.stats?.responseTimes ?? {}).flat();
    const units = s.unitOrder.map((id) => s.units[id]).filter(Boolean);
    return {
      open: q.length,
      p1: q.filter((i) => i.priority === 1).length,
      avgResponse: all.length ? all.reduce((a, b) => a + b, 0) / all.length : null,
      unitsFree: units.filter((u) => u.status === 'available').length,
      unitsTotal: units.filter((u) => u.status !== 'offduty').length,
    };
  });
}

export function selRegion(s: SimState): RegionDef {
  return safe('getRegion', () => S.getRegion(s), () => REGIONS[s.regionId]);
}

export function selTemplate(s: SimState, inc: Incident): IncidentTemplate | undefined {
  return soft('templateOf', () => S.templateOf(s, inc) ?? TEMPLATE_BY_ID[inc.templateId], TEMPLATE_BY_ID[inc.templateId]);
}

/**
 * The reply an answered radio prompt shows, or null when the engine closed the prompt itself
 * (`answered` is then an internal marker such as 'timeout' or 'closed', never shown raw).
 */
export function answeredReply(msg: RadioMsg): RadioReply | null {
  if (!msg.answered) return null;
  return msg.replies?.find((r) => r.id === msg.answered) ?? null;
}

export function selPendingRadio(s: SimState): RadioMsg[] {
  return safe(
    'pendingRadio',
    () => S.pendingRadio(s),
    () => s.radio.filter((m) => !!m.replies?.length && !m.answered && (!m.expiresAt || m.expiresAt > s.now)),
  );
}

const FIT_RANK: Record<Recommendation['fit'], number> = { ideal: 0, need: 1, weak: 2, unavailable: 3, unreachable: 4 };

const matches = (needs: UnitNeed[], u: Unit) => needs.some((n) => n.type === 'any' || n.type === u.type);

function fallbackRecs(s: SimState, inc: Incident): Recommendation[] {
  const urban = !['forest', 'lake', 'highway', 'ruralroad', 'farm', 'summerhouse', 'village'].includes(inc.location.placeKind);
  return s.unitOrder
    .map((id) => s.units[id])
    .filter((u): u is Unit => !!u && !inc.assigned.includes(u.id) && u.status !== 'offduty')
    .map((u) => {
      const km = haversineKm(u.pos, inc.location.coord);
      const heli = u.type === 'heli';
      const speed = heli ? 200 : inc.priority <= 2 ? (urban ? 58 : 95) : urban ? 40 : 75;
      const etaMin = ((heli ? km : km * (urban ? 1.35 : 1.25)) / speed) * 60 * (heli ? 1 : s.weather.roadFactor || 1);
      const fit: Recommendation['fit'] =
        u.status !== 'available' ? 'unavailable' : matches(inc.ideal, u) ? 'ideal' : matches(inc.need, u) ? 'need' : 'weak';
      // Without the engine's need bookkeeping a weak unit is never sent automatically.
      return { unit: u, etaMin, km, fit, ...(fit === 'weak' ? { manual: true } : {}) };
    })
    .sort((a, b) => FIT_RANK[a.fit] - FIT_RANK[b.fit] || a.etaMin - b.etaMin);
}

export function selRecs(s: SimState, incidentId: string): Recommendation[] {
  const inc = s.incidents[incidentId];
  if (!inc) return [];
  return safe(
    'recommendUnits',
    () => S.recommendUnits(s, incidentId).filter((r) => !inc.assigned.includes(r.unit.id)),
    () => fallbackRecs(s, inc),
  );
}

/** Units worth sending right now (dispatchable fit), best first. */
export function dispatchable(recs: Recommendation[]): Recommendation[] {
  return recs.filter((r) => r.fit === 'ideal' || r.fit === 'need' || r.fit === 'weak');
}

/**
 * The unit the D key / big "Saada" button / "Saada abi" sends: an exact match for a typed backup
 * request, else the best 'ideal'/'need' unit (recs are already ranked by fit and effective ETA,
 * which counts reassignment of a close unit on a less urgent job). Only when nothing covers the
 * need does it fall back to a general unit that adds something; never a specialist (helicopter,
 * boat, K-komando, investigator, prisoner transport), a unit across a ferry, or a unit beyond an
 * already covered need. Undefined means the player has to pick by hand.
 */
export function bestFor(recs: Recommendation[], type?: UnitNeed['type']): Recommendation | undefined {
  const ok = dispatchable(recs).filter((r) => !r.manual);
  if (type && type !== 'any') {
    const exact = ok.find((r) => r.unit.type === type && r.fit !== 'weak');
    if (exact) return exact;
  }
  return ok.find((r) => r.fit !== 'weak') ?? ok.find((r) => S.autoPickable(r));
}

export interface ActiveBackup {
  beat?: BeatState;
  need: UnitNeed;
  remainingMin: number | null;
  msg?: RadioMsg;
  /** Matching units already driving there since the request (soonest first). */
  enroute: { unit: Unit; etaMin: number | null }[];
}

function helpEnroute(s: SimState, inc: Incident, need: UnitNeed, since?: number): ActiveBackup['enroute'] {
  return assignedUnits(s, inc)
    .filter((u) => u.status === 'enroute' && typeFits(need.type, u.type) && (since === undefined || u.statusSince >= since - 1000))
    .map((u) => ({ unit: u, etaMin: u.move ? Math.max(0, (u.move.arriveAt - s.now) / MIN) : null }))
    .sort((a, b) => (a.etaMin ?? 1e9) - (b.etaMin ?? 1e9));
}

/** The incident's active "Toetust vajab" request, if any. */
export function activeBackup(s: SimState, inc: Incident): ActiveBackup | null {
  if (inc.state === 'closed') return null;
  const tpl = selTemplate(s, inc);
  for (const b of inc.beats) {
    if (b.status !== 'active') continue;
    const spec = tpl?.beats?.[b.index];
    if (spec?.kind === 'backup') {
      const bs = spec as BackupBeat;
      const msg = b.radioId ? s.radio.find((m) => m.id === b.radioId) : undefined;
      return {
        beat: b,
        need: bs.need,
        remainingMin: b.timeoutAt ? (b.timeoutAt - s.now) / MIN : null,
        msg,
        enroute: helpEnroute(s, inc, bs.need, b.activeSince),
      };
    }
  }
  const msg = s.radio.find(
    (m) => m.incidentId === inc.id && m.kind === 'backup' && !m.answered && (m.expiresAt === undefined || m.expiresAt > s.now),
  );
  if (msg) {
    const need: UnitNeed = { type: 'any', count: 1 };
    return { need, remainingMin: msg.expiresAt ? (msg.expiresAt - s.now) / MIN : null, msg, enroute: helpEnroute(s, inc, need, msg.t) };
  }
  return null;
}

export interface QuerySubject {
  kind: 'person' | 'vehicle';
  q: string;
  personId?: string;
  plate?: string;
  incidentId?: string;
}

/** Which registry record a query radio message is about (so the UI can open it directly). */
export function querySubject(s: SimState, msg: RadioMsg): QuerySubject | null {
  const inc = msg.incidentId ? s.incidents[msg.incidentId] : undefined;
  if (inc) {
    const beat = inc.beats.find((b) => b.radioId === msg.id);
    const spec = beat ? selTemplate(s, inc)?.beats?.[beat.index] : undefined;
    if (spec?.kind === 'query') {
      const q = spec as QueryBeat;
      if (q.queryType === 'vehicle') {
        const v = inc.vehicles.find((x) => x.role === 'suspect') ?? inc.vehicles[0];
        if (v) return { kind: 'vehicle', q: v.plate, plate: v.plate, incidentId: inc.id };
      } else {
        const ref = inc.persons.find((p) => p.role === q.subject);
        const p = ref ? s.persons[ref.personId] : undefined;
        if (p) return { kind: 'person', q: p.idcode, personId: p.id, incidentId: inc.id };
      }
    }
  }
  if (msg.kind !== 'query') return null;
  const parsed = parseQueryRef(msg.text.et);
  if (!parsed) return null;
  if (parsed.kind === 'person') {
    const p = Object.values(s.persons).find((x) => x.idcode === parsed.q);
    return { kind: 'person', q: parsed.q, personId: p?.id, incidentId: inc?.id };
  }
  return { kind: 'vehicle', q: parsed.q, plate: parsed.q, incidentId: inc?.id };
}

/** Whether the dispatcher plausibly knows who this person is (otherwise only a description). */
export function isIdentified(_s: SimState, inc: Incident, ref: IncidentPersonRef, tpl: IncidentTemplate | undefined): boolean {
  if (ref.checked) return true;
  if (ref.role === 'caller' || inc.caller?.personId === ref.personId) return true;
  const spec = tpl?.persons.find((p) => p.role === ref.role);
  if (spec?.known) return true;
  if (inc.firstArrivalAt && ref.role !== 'suspect' && ref.role !== 'missing') return true;
  return inc.beats.some((b) => {
    if (b.status === 'pending' || b.status === 'skipped') return false;
    const bs = tpl?.beats?.[b.index];
    return bs?.kind === 'query' && (bs as QueryBeat).subject === ref.role;
  });
}

/** Units assigned to an incident (resolved, existing only). */
export function assignedUnits(s: SimState, inc: Incident): Unit[] {
  return inc.assigned.map((id) => s.units[id]).filter((u): u is Unit => !!u);
}
