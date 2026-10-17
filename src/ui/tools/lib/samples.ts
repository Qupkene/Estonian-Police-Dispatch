/**
 * Shift time-series for the Statistika tab: unit status counts + trust sampled every 10 game-minutes
 * into a module-level ring buffer keyed by the shift (seed + start). Pure — the subscription that
 * feeds it lives in StatsPanel.tsx so sampling runs even while the tab is closed.
 */
import type { SimState, UnitStatus } from '@/sim/types';

export const SAMPLE_EVERY_MS = 10 * 60_000;
const CAP = 240; // 40 h of 10-minute samples

export const STATUS_GROUPS = ['available', 'enroute', 'onscene', 'transport', 'busy', 'break', 'other'] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export interface Sample {
  t: number;
  counts: Record<StatusGroup, number>;
  trust: number;
  open: number;
}

const buffers = new Map<string, Sample[]>();

export function shiftKey(s: Pick<SimState, 'seed' | 'startTime'>): string {
  return `${s.seed}:${s.startTime}`;
}

export function groupOf(st: UnitStatus): StatusGroup {
  return st === 'offduty' || st === 'emergency' ? 'other' : st;
}

export function snapshot(s: SimState): Sample {
  const counts: Record<StatusGroup, number> = { available: 0, enroute: 0, onscene: 0, transport: 0, busy: 0, break: 0, other: 0 };
  for (const id of s.unitOrder) {
    const u = s.units[id];
    if (u) counts[groupOf(u.status)]++;
  }
  let open = 0;
  for (const id of s.incidentOrder) {
    const inc = s.incidents[id];
    if (inc && inc.state !== 'closed' && !s.flags[`hidden:${inc.id}`]) open++;
  }
  return { t: s.now, counts, trust: s.trust, open };
}

/** Record a sample if ≥ 10 game-min passed since the last one. Returns true if a sample was added. */
export function sampleSim(s: SimState): boolean {
  const key = shiftKey(s);
  let buf = buffers.get(key);
  if (!buf) {
    buf = [];
    buffers.set(key, buf);
    // keep only a few shifts in memory
    if (buffers.size > 4) buffers.delete(buffers.keys().next().value as string);
  }
  const last = buf[buf.length - 1];
  if (last && s.now < last.t) {
    // clock went backwards (reloaded save) → restart the series
    buf.length = 0;
  } else if (last && s.now - last.t < SAMPLE_EVERY_MS) {
    return false;
  }
  buf.push(snapshot(s));
  if (buf.length > CAP) buf.splice(0, buf.length - CAP);
  return true;
}

/** Samples so far plus a live "now" point at the end. */
export function samplesFor(s: SimState): Sample[] {
  const buf = buffers.get(shiftKey(s)) ?? [];
  const live = snapshot(s);
  const last = buf[buf.length - 1];
  return last && last.t === live.t ? [...buf] : [...buf, live];
}

/** Test hook. */
export function _resetSamples(): void {
  buffers.clear();
}
