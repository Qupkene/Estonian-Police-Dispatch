import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as rules from '@/sim/career';
import type { CareerProfile, LedgerEntry, RegionId, ShiftReport, Text } from '@/sim/types';

/** How many paid shift keys the profile remembers (CareerProfile.paidShifts). */
const PAID_SHIFTS_KEPT = 60;

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
      create: (name, badge, regionId) =>
        set({ profile: rules.newCareer(name, badge, regionId, (Date.now() ^ 0x5eed) >>> 0), inbox: [] }),
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
      reset: () => set({ profile: null, inbox: [] }),
    }),
    { name: 'epd:career', version: 1 },
  ),
);
