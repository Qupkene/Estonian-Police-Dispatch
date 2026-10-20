import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as rules from '@/sim/career';
import * as sectorRules from '@/sim/careerSectors';
import { answerStoryChoice, storyIntro, storyProgress } from '@/sim/story';
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
  /** A new career at one desk: `startSector` (a sector of `regionId`), by default its first starter sector. */
  create: (name: string, badge: string, regionId: RegionId, startSector?: string) => void;
  /** Replace the profile with the result of a pure rule. */
  update: (fn: (p: CareerProfile) => CareerProfile) => void;
  /** Run a rule that may fail; returns the error text if it did. */
  attempt: (fn: (p: CareerProfile) => { profile: CareerProfile; error?: Text }) => Text | undefined;
  applyReport: (r: ShiftReport) => LedgerEntry[];
  /** A co-op room shift's XP, once per key (room:<code>): 'paid', 'already' paid, or 'none' without a career. */
  applyCoopXp: (key: string, r: ShiftReport, xp: number) => 'paid' | 'already' | 'none';
  /** Take a sector the prefect offered (docs/SECTORS.md); returns the error text if it could not. */
  acceptOffer: (sectorId: string) => Text | undefined;
  /** Say no to the prefect's offer; a new one comes some shifts later. */
  declineOffer: () => void;
  /** Open a police post in a covered sector with career money; returns the error text if it could not. */
  openPost: (stationId: string) => Text | undefined;
  /** Answer the question a character of the story asked (docs/STORY.md); returns the error text if it could not. */
  answerChoice: (optionId: string) => Text | undefined;
  clearInbox: () => void;
  reset: () => void;
}

/**
 * Set a changed profile, moving its story on (an accepted sector or a hire can meet an objective or begin a chapter,
 * docs/STORY.md); what the cast says joins the inbox.
 */
function setWithStory(next: CareerProfile) {
  const r = storyProgress(next);
  useCareer.setState(
    r.messages.length
      ? { profile: r.profile, inbox: [...useCareer.getState().inbox, ...r.messages] }
      : { profile: r.profile },
  );
}

export const useCareer = create<CareerStore>()(
  persist(
    (set, get) => ({
      profile: null,
      inbox: [],
      create: (name, badge, regionId, startSector) => {
        const profile = rules.newCareer(name, badge, regionId, (Date.now() ^ 0x5eed) >>> 0, startSector);
        backupCareer(get(), 'create');
        // The first chapter's intro is the new career's first notice (docs/STORY.md).
        const intro = storyIntro(profile);
        set({ profile, inbox: intro ? [intro] : [] });
      },
      update: (fn) => {
        const p = get().profile;
        if (p) setWithStory(fn(p));
      },
      attempt: (fn) => {
        const p = get().profile;
        if (!p) return undefined;
        const r = fn(p);
        if (!r.error) setWithStory(r.profile);
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
      applyCoopXp: (key, r, xp) => {
        const p = get().profile;
        if (!p) return 'none';
        if (p.paidShifts?.includes(key)) return 'already';
        const out = rules.applyCoopShift(p, r, xp);
        set({ profile: { ...out.profile, paidShifts: [...(p.paidShifts ?? []), key].slice(-PAID_SHIFTS_KEPT) }, inbox: out.messages });
        return 'paid';
      },
      acceptOffer: (sectorId) => get().attempt((p) => sectorRules.acceptOffer(p, sectorId)),
      declineOffer: () => get().update(sectorRules.declineOffer),
      openPost: (stationId) => get().attempt((p) => sectorRules.openPost(p, stationId)),
      answerChoice: (optionId) => {
        const p = get().profile;
        if (!p) return undefined;
        const r = answerStoryChoice(p, optionId);
        if (r.error) return r.error;
        set({ profile: r.profile, inbox: r.reply ? [...get().inbox, r.reply] : get().inbox });
        return undefined;
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
