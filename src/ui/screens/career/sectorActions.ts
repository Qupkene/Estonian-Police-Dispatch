// Career store calls for sectors (docs/SECTORS.md): create at a starter sector, answer the prefect's offer,
// open a post, each with its toast.
import { useCareer } from '@/store/career';
import { useLang, useT, useTx } from '@/i18n';
import { DAILY_BUDGET } from '@/data/economy';
import * as rules from '@/sim/career';
import { sectorById } from '@/sim/sectors';
import type { CareerProfile, RegionId, Text } from '@/sim/types';
import { fmtMoney, safe } from './helpers';
import { useToast } from './Toasts';

/** Daily budget of the career in a prefecture (the prefecture's DAILY_BUDGET if the rule throws). */
export function careerDailyBudget(p: CareerProfile, regionId: RegionId = p.regionId): number {
  return safe(() => rules.dailyBudget(p, regionId), DAILY_BUDGET[regionId] ?? 0);
}

/** A new career at one desk: `sector` of `regionId` (the prefecture's first starter sector when missing). */
export function createCareer(name: string, badge: string, regionId: RegionId, sector?: string): void {
  useCareer.getState().create(name, badge, regionId, sector);
}

/** Sector actions with their toasts. */
export function useSectorActions() {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const notify = useToast();

  /** Run a store action; a thrown error becomes a toast and `false`. */
  const guard = <R>(fn: () => R, failTitle: string): { ok: true; value: R } | { ok: false } => {
    try {
      return { ok: true, value: fn() };
    } catch (e) {
      console.warn('[EPD career] sector action failed', e);
      notify('danger', failTitle, t('career.actionError'));
      return { ok: false };
    }
  };

  const accept = (sectorId: string): boolean => {
    const before = useCareer.getState().profile;
    if (!before) return false;
    const regionId = before.offer?.regionId ?? before.regionId;
    const budget0 = careerDailyBudget(before, regionId);
    const failTitle = t('career.offer.failed');
    const r = guard(() => useCareer.getState().acceptOffer(sectorId), failTitle);
    if (!r.ok) return false;
    if (r.value) {
      notify('danger', failTitle, tx(r.value));
      return false;
    }
    const after = useCareer.getState().profile;
    if (!after) return false;
    const staff = Math.max(0, after.staff.length - before.staff.length);
    const cars = Math.max(0, after.fleet.length - before.fleet.length);
    const budget = careerDailyBudget(after, regionId) - budget0;
    const grant = after.money - before.money;
    const name = tx(sectorById(sectorId)?.name ?? { et: sectorId, en: sectorId });
    const parts = [
      staff || cars
        ? t('career.offer.came', {
            staff: t(staff === 1 ? 'career.offer.officer' : 'career.offer.officers', { n: staff }),
            cars: t(cars === 1 ? 'career.offer.car' : 'career.offer.cars', { n: cars }),
          })
        : '',
      budget > 0 ? t('career.offer.budget', { amount: fmtMoney(budget, lang) }) : '',
      grant > 0 ? t('career.offer.grant', { amount: fmtMoney(grant, lang) }) : '',
    ].filter(Boolean);
    notify('gold', t('career.offer.accepted', { name }), parts.join(' '));
    return true;
  };

  const decline = (): void => {
    const r = guard(() => useCareer.getState().declineOffer(), t('career.offer.failed'));
    if (r.ok) notify('info', t('career.offer.declined'), t('career.offer.declinedSub'));
  };

  const openPost = (stationId: string, name: string): boolean => {
    const failTitle = t('career.posts.failed');
    const before = useCareer.getState().profile?.money ?? 0;
    const r = guard((): Text | undefined => useCareer.getState().openPost(stationId), failTitle);
    if (!r.ok) return false;
    if (r.value) {
      notify('danger', failTitle, tx(r.value));
      return false;
    }
    const paid = before - (useCareer.getState().profile?.money ?? before);
    notify('ok', t('career.posts.opened', { name }), paid > 0 ? t('career.posts.paid', { amount: fmtMoney(paid, lang) }) : undefined);
    return true;
  };

  return { accept, decline, openPost };
}
