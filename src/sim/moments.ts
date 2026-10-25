/**
 * Ühisvahetuse hetked (2.36.0, docs/MULTIPLAYER.md section 14): what happened between the seats of a co-op shift, kept
 * as it happens for the joint report's timeline. Pure data in `CoopState.moments`; every client records the same
 * moments, since they follow the same commands. Its own module so that coop.ts and desks.ts can both record one
 * without importing each other at run time.
 */
import type { CoopState } from './coop';
import type { ShiftReport, SimState, Text } from './types';

/** Moments a shift keeps (the oldest go first). */
export const MAX_MOMENTS = 40;

export type CoopMomentKind = 'lend' | 'take' | 'give' | 'left' | 'back' | 'handover';

export interface CoopMoment {
  /** Game time. */
  t: number;
  k: CoopMomentKind;
  /**
   * The seat it is about: the lender of a crew (-1 for a desk's colleague), the seat that took a desk over, handed it
   * back, left or came back, the desk that handed a pursuit over.
   */
  seat: number;
  /** The other seat: who got the lent crew or the pursuit (-1 for a desk's colleague). */
  other?: number;
  /** Sector co-op: the desk it is about (the lender's desk, the desk taken over). */
  desk?: string;
  /** The other desk: where the lent crew or the pursuit went. */
  to?: string;
  /** A lent crew's call sign. */
  unit?: string;
}

/** Record a moment of the shift. */
export function addMoment(c: CoopState, m: CoopMoment): void {
  const list = (c.moments ??= []);
  list.push(m);
  if (list.length > MAX_MOMENTS) list.splice(0, list.length - MAX_MOMENTS);
}

/** A notable incident of the shift on the timeline (the report's highlights), with the seats that worked on it. */
export interface IncidentMoment {
  t: number;
  k: 'good' | 'bad';
  seats: number[];
  title: Text;
  /** Where and how it ended. */
  text: Text;
}

export type ReportMoment = CoopMoment | IncidentMoment;

/** Moments between the seats a report keeps, besides the highlights (lends between two players go first). */
const REPORT_MOMENTS = 16;

const weight = (m: CoopMoment): number => (m.k !== 'lend' ? 2 : m.seat >= 0 && (m.other ?? -1) >= 0 ? 1 : 0);

/** The seats of a bit mask, lowest first. */
export const maskSeats = (mask: number): number[] => [0, 1, 2, 3].filter((n) => mask & (1 << n));

/**
 * The joint report's timeline: the moments between the seats (at most REPORT_MOMENTS, the rarer kinds and lends
 * between two players first) and the report's highlights, each with the seats that worked on it, in time order.
 */
export function reportMoments(s: SimState, highlights: ShiftReport['highlights'] = []): ReportMoment[] {
  const c = s.coop;
  if (!c) return [];
  const kept = [...(c.moments ?? [])]
    .map((m, i) => ({ m, i }))
    .sort((a, b) => weight(b.m) - weight(a.m) || a.i - b.i)
    .slice(0, REPORT_MOMENTS)
    .sort((a, b) => a.i - b.i)
    .map(({ m }) => ({ ...m }));
  const out: ReportMoment[] = kept;
  for (const h of highlights) {
    const inc = s.incidents[h.incidentId];
    if (!inc) continue;
    // The highlight's text starts with its time, which the timeline shows apart.
    const cut = (x: string) => x.replace(/^[^·]*·\s*/, '').slice(0, 400);
    out.push({
      t: Math.round(inc.createdAt),
      k: h.good ? 'good' : 'bad',
      seats: maskSeats(c.touch?.[inc.id] ?? 0),
      title: { et: h.title.et.slice(0, 160), en: h.title.en.slice(0, 160) },
      text: { et: cut(h.text.et), en: cut(h.text.en) },
    });
  }
  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.t - b.m.t || a.i - b.i)
    .map(({ m }) => m);
}
