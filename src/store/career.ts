import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as rules from '@/sim/career';
import { DAY, isoDate } from '@/sim/time';
import type { CareerProfile, LedgerEntry, RegionId, ShiftReport, Text } from '@/sim/types';
import { guardedPersist, keepBackup, normalizeCareerState, overState } from './migrate';
import { registerSpaceStore } from './space';

/**
 * True when the career's history already holds this shift: an entry of a past career day with the shift's
 * calendar date (career day 1 is the profile's creation date, as on the briefing screen), prefecture and
 * incident count. 92ed7f5 saved a career shift again when its tab closed on the report screen, after the
 * shift had been paid; such a save must never be resumed and paid a second time.
 */
export function careerShiftPaid(
  p: Pick<CareerProfile, 'createdAt' | 'day' | 'history'>,
  sim: { startTime?: unknown; regionId?: unknown; stats?: unknown },
): boolean {
  const start = sim.startTime;
  const incidents = typeof sim.stats === 'object' && sim.stats !== null ? (sim.stats as { incidents?: unknown }).incidents : undefined;
  if (typeof start !== 'number' || !Number.isFinite(start) || !Number.isFinite(p.createdAt)) return false;
  const date = isoDate(start);
  return p.history.some(
    (h) =>
      h.day < p.day &&
      h.regionId === sim.regionId &&
      h.incidents === incidents &&
      isoDate(p.createdAt + (h.day - 1) * DAY) === date,
  );
}

/** How many paid shift keys the profile remembers (CareerProfile.paidShifts). */
const PAID_SHIFTS_KEPT = 60;

/**
 * Version of the epd:career envelope. 92ed7f5 (the first public 2.0) wrote 1 and drops data of any other
 * version, so bump it only together with a step in CAREER_STEPS and a new golden fixture set
 * (docs/DESIGN.md, "Salvestuste ühilduvus"). New optional fields need no bump: the normaliser fills them.
 */
export const CAREER_VERSION = 1;
/** CAREER_STEPS[v] turns a version v state into version v + 1. */
const CAREER_STEPS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {};

/** Keep the current career before something replaces it with different data (bounded, epd:backup.career). */
function backupCareer(s: { profile: CareerProfile | null; inbox: Text[] }, reason: string) {
  if (s.profile) keepBackup('career', { profile: s.profile, inbox: s.inbox }, { reason, unique: true });
}

interface CareerStore {
  profile: CareerProfile | null;
  /** Messages from the last applied shift (payday, injuries, promotions…) to show once. */
  inbox: Text[];
  create: (name: string, badge: string, regionId: RegionId) => void;
  /** Replace the profile with the result of a pure rule. */
  update: (fn: (p: CareerProfile) => CareerProfile) => void;
  /** Run a rule that may fail; returns the error text if it did. */
  attempt: (fn: (p: CareerProfile) => { profile: CareerProfile; error?: Text }) => Text | undefined;
  applyReport: (r: ShiftReport) => LedgerEntry[];
  clearInbox: () => void;
  reset: () => void;
}

export const useCareer = create<CareerStore>()(
  persist(
    (set, get) => ({
      profile: null,
      inbox: [],
      create: (name, badge, regionId) => {
        const profile = rules.newCareer(name, badge, regionId, (Date.now() ^ 0x5eed) >>> 0);
        backupCareer(get(), 'create');
        set({ profile, inbox: [] });
      },
      update: (fn) => {
        const p = get().profile;
        if (p) set({ profile: fn(p) });
      },
      attempt: (fn) => {
        const p = get().profile;
        if (!p) return undefined;
        const r = fn(p);
        if (!r.error) set({ profile: r.profile });
        return r.error;
      },
      applyReport: (r) => {
        const p = get().profile;
        if (!p) return [];
        // One shift pays once, even when an old copy of its save comes back (another device, a stale cloud copy).
        if (r.shiftKey && p.paidShifts?.includes(r.shiftKey)) return [];
        let legacyLogin = false;
        try {
          legacyLogin = localStorage.getItem('epd:legacyLogin') === '1';
        } catch {
          /* storage blocked */
        }
        const out = rules.applyShiftReport(p, r, { legacyLogin });
        const profile = r.shiftKey ? { ...out.profile, paidShifts: [...(p.paidShifts ?? []), r.shiftKey].slice(-PAID_SHIFTS_KEPT) } : out.profile;
        set({ profile, inbox: out.messages });
        return out.ledger;
      },
      clearInbox: () => set({ inbox: [] }),
      reset: () => {
        backupCareer(get(), 'reset');
        set({ profile: null, inbox: [] });
      },
    }),
    guardedPersist<CareerStore>({
      name: 'epd:career',
      slot: 'career',
      version: CAREER_VERSION,
      steps: CAREER_STEPS,
      normalize: (stored, current, issues) => ({ ...overState(current, stored), ...normalizeCareerState(stored, issues) }),
    }),
  ),
);

// epd:career for the guest, epd:acct:<id>:career while an account is signed in (src/store/space.ts).
registerSpaceStore('career', useCareer);
