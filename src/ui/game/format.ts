/**
 * Pure formatting / ordering helpers for the in-shift CAD screen (no React, no DOM, no stores).
 * Covered by tests/game-format.test.ts.
 */
import type { Incident, Lang, Priority, Unit, UnitNeed, UnitStatus, UnitType, Weather } from '@/sim/types';
import { STATUS_CODE } from '@/sim/types';

export const WEEKDAYS_ET = ['esmaspäev', 'teisipäev', 'kolmapäev', 'neljapäev', 'reede', 'laupäev', 'pühapäev'] as const;
export const WEEKDAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Weekday name; index 0 = Monday … 6 = Sunday (matches `wall(t).weekday`). */
export function weekdayName(index: number, lang: Lang): string {
  const i = ((Math.trunc(index) % 7) + 7) % 7;
  return lang === 'et' ? WEEKDAYS_ET[i] : WEEKDAYS_EN[i];
}

export const pad2 = (n: number): string => String(Math.trunc(Math.abs(n))).padStart(2, '0');

const MINUS = '−';

/**
 * Countdown text from (possibly negative / fractional) minutes.
 * 7.7 → "7:42", −1.0833 → "−1:05", 62.08 → "1:02:05". Seconds are floored towards zero.
 */
export function countdown(min: number): string {
  if (!Number.isFinite(min)) return '--:--';
  const neg = min < 0;
  const total = Math.floor(Math.abs(min) * 60 + 1e-6);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body = h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  return neg && total > 0 ? MINUS + body : body;
}

/** Elapsed time text: "<1 min", "4 min", "1 t 05" (et) / "1 h 05" (en). */
export function ageText(min: number, lang: Lang): string {
  if (!Number.isFinite(min) || min < 1) return '<1 min';
  const m = Math.floor(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} ${lang === 'et' ? 't' : 'h'} ${pad2(m % 60)}`;
}

/** Shift remaining time in ms → "3:24" (h:mm), never negative. */
export function hmText(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(totalMin / 60)}:${pad2(totalMin % 60)}`;
}

/** Number with Estonian decimal comma (et) or point (en). */
export function fmtNum(n: number, digits: number, lang: Lang): string {
  const s = n.toFixed(digits);
  return lang === 'et' ? s.replace('.', ',') : s;
}

/** "3,4 km" / "12 km" (one decimal below 10 km). */
export function fmtKm(km: number, lang: Lang): string {
  if (!Number.isFinite(km)) return '-';
  return `${fmtNum(km, km < 10 ? 1 : 0, lang)} km`;
}

/** "€ 10 000" style money with a thin-space thousands separator and sign for negatives. */
export function fmtMoney(n: number): string {
  const abs = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? MINUS : ''}${abs} €`;
}

export type RoadCondition = 'dry' | 'wet' | 'slippery' | 'icy';

/** Road condition label from the weather travel-time multiplier (and kind as tie-breaker). */
export function roadCondition(roadFactor: number, kind?: Weather['kind']): RoadCondition {
  if (roadFactor >= 1.3) return 'icy';
  if (roadFactor >= 1.14) return 'slippery';
  if (roadFactor >= 1.04 || kind === 'rain' || kind === 'storm' || kind === 'sleet') return 'wet';
  return 'dry';
}

export type SlaTone = 'ok' | 'warn' | 'danger' | 'over';

/** Colour bucket for an SLA countdown. */
export function slaTone(remainingMin: number, slaMin: number): SlaTone {
  if (remainingMin < 0) return 'over';
  if (remainingMin <= Math.max(2, slaMin * 0.25)) return 'danger';
  if (remainingMin <= slaMin * 0.5) return 'warn';
  return 'ok';
}

const STATE_RANK: Record<Incident['state'], number> = { incoming: 0, queued: 1, dispatched: 2, onscene: 3, closed: 4 };

/**
 * Fallback queue order (the engine's `queue()` selector is authoritative when available):
 * unacknowledged first, then by priority, then unattended before attended, then oldest first.
 */
export function sortQueue<T extends Pick<Incident, 'state' | 'priority' | 'createdAt' | 'id'>>(incs: T[]): T[] {
  return [...incs].sort((a, b) => {
    const ai = a.state === 'incoming' ? 0 : 1;
    const bi = b.state === 'incoming' ? 0 : 1;
    if (ai !== bi) return ai - bi;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const as = STATE_RANK[a.state] >= 2 ? 1 : 0;
    const bs = STATE_RANK[b.state] >= 2 ? 1 : 0;
    if (as !== bs) return as - bs;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export type QueueFilter = 'all' | 'p12' | 'unassigned';

export function matchesQueueFilter(inc: Pick<Incident, 'priority' | 'assigned'>, f: QueueFilter): boolean {
  if (f === 'p12') return inc.priority <= 2;
  if (f === 'unassigned') return inc.assigned.length === 0;
  return true;
}

/** Natural callsign comparison: "P1-2" < "P1-10" < "P2-1". */
export function callsignCompare(a: string, b: string): number {
  return a.localeCompare(b, 'et', { numeric: true, sensitivity: 'base' });
}

/** Minutes until the unit's current movement ends (null when not moving). */
export function unitEtaMin(u: Pick<Unit, 'move'>, now: number): number | null {
  if (!u.move) return null;
  const ms = u.move.arriveAt - now;
  return ms > 0 ? ms / 60_000 : null;
}

export type UnitSortKey = 'status' | 'callsign' | 'type' | 'eta' | 'fatigue';

const TYPE_ORDER: UnitType[] = ['patrol', 'rapid', 'traffic', 'k9', 'criminal', 'community', 'aux', 'transport', 'special', 'heli', 'border', 'boat'];

/** Sort units for the unit status board. dir = 1 ascending, −1 descending; ties fall back to callsign. */
export function sortUnits<U extends Pick<Unit, 'status' | 'callsign' | 'type' | 'fatigue' | 'move'>>(
  units: U[],
  key: UnitSortKey,
  dir: 1 | -1,
  now: number,
): U[] {
  const val = (u: U): number => {
    switch (key) {
      case 'status':
        return STATUS_CODE[u.status as UnitStatus] ?? 99;
      case 'type': {
        const i = TYPE_ORDER.indexOf(u.type);
        return i < 0 ? 99 : i;
      }
      case 'eta': {
        const e = unitEtaMin(u, now);
        return e === null ? Number.POSITIVE_INFINITY : e;
      }
      case 'fatigue':
        return u.fatigue;
      default:
        return 0;
    }
  };
  return [...units].sort((a, b) => {
    if (key !== 'callsign') {
      const va = val(a);
      const vb = val(b);
      if (va !== vb) {
        // Keep "no ETA" rows at the bottom regardless of direction.
        if (va === Number.POSITIVE_INFINITY) return 1;
        if (vb === Number.POSITIVE_INFINITY) return -1;
        return (va - vb) * dir;
      }
      return callsignCompare(a.callsign, b.callsign);
    }
    return callsignCompare(a.callsign, b.callsign) * dir;
  });
}

export interface NeedRow {
  type: UnitNeed['type'];
  count: number;
  have: number;
  met: boolean;
}

/** General response unit types (mirrors the engine's need-matching rule in sim/units.ts). */
const GENERAL_TYPES: UnitType[] = ['patrol', 'rapid', 'aux', 'traffic', 'border', 'community', 'k9'];

/** Can a unit of type `t` fill a need slot of type `need`? (rapid/K9/… may cover a patrol need). */
export function typeFits(need: UnitNeed['type'], t: UnitType): boolean {
  if (need === t) return true;
  if (need === 'any') return GENERAL_TYPES.includes(t) || t === 'criminal' || t === 'special';
  if (need === 'patrol') return GENERAL_TYPES.includes(t) || t === 'special';
  if (need === 'rapid') return t === 'special';
  return false;
}

const needRank = (t: UnitNeed['type']) => (t === 'any' ? 2 : t === 'patrol' ? 1 : 0);

/**
 * Match needs against the unit types present, like the engine does: specific needs first, then
 * 'patrol', then 'any'; each slot takes an exact type first, then a compatible one. A unit is
 * never counted twice. Rows keep the input order.
 */
export function needCoverage(needs: UnitNeed[], unitTypes: UnitType[]): NeedRow[] {
  const pool = [...unitTypes];
  const rows: NeedRow[] = needs.map((n) => ({ type: n.type, count: n.count, have: 0, met: false }));
  const order = rows.map((_r, i) => i).sort((a, b) => needRank(rows[a].type) - needRank(rows[b].type));
  for (const idx of order) {
    const r = rows[idx];
    for (let pass = 0; pass < 2 && r.have < r.count; pass++) {
      for (let i = 0; i < pool.length && r.have < r.count; ) {
        const ok = pass === 0 ? pool[i] === r.type : typeFits(r.type, pool[i]);
        if (ok) {
          pool.splice(i, 1);
          r.have++;
        } else i++;
      }
    }
    r.met = r.have >= r.count;
  }
  return rows;
}

export const allMet = (rows: NeedRow[]): boolean => rows.length > 0 && rows.every((r) => r.met);

/** True when a keyboard event target is a text-entry element where game hotkeys must not fire. */
export function isTypingTarget(el: unknown): boolean {
  if (!el || typeof el !== 'object') return false;
  const e = el as { tagName?: string; isContentEditable?: boolean; type?: string };
  if (e.isContentEditable) return true;
  const tag = (e.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (e.type || 'text').toLowerCase();
    return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color'].includes(type);
  }
  return false;
}

/** Priority weight used to order toasts / highlight urgency. */
export const PRIORITY_TONE: Record<Priority, 'danger' | 'warn' | 'info' | 'neutral'> = { 1: 'danger', 2: 'warn', 3: 'info', 4: 'neutral' };

/** Extract an Estonian personal code or a plate from free radio text (fallback when beat data is missing). */
export function parseQueryRef(text: string): { kind: 'person'; q: string } | { kind: 'vehicle'; q: string } | null {
  const id = text.match(/\b[1-8]\d{10}\b/);
  if (id) return { kind: 'person', q: id[0] };
  const plate = text.match(/\b(\d{3})\s?([A-ZÕÄÖÜŠŽ]{3})\b/);
  if (plate) return { kind: 'vehicle', q: `${plate[1]} ${plate[2]}` };
  return null;
}

/** Sector id of a neighbouring desk's call for help (incident tag `help:<sectorId>`, docs/SECTORS.md). */
export function helpSectorId(inc: Pick<Incident, 'tags'>): string | null {
  const tag = (inc.tags ?? []).find((x) => typeof x === 'string' && x.startsWith('help:'));
  return tag ? tag.slice(5) : null;
}
