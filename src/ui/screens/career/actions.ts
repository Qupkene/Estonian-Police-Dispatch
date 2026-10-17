import { useCareer } from '@/store/career';
import { useT, useTx } from '@/i18n';
import type { CareerProfile, Text } from '@/sim/types';
import { useToast, type ToastTone } from './Toasts';

interface Msg {
  tone?: ToastTone;
  title: string;
  body?: string;
}

/** Wraps career store mutations with try/catch (rules may be stubs) + success/failure toasts. */
export function useCareerAction() {
  const t = useT();
  const tx = useTx();
  const notify = useToast();

  /** Rule that may fail with an error Text. Returns true on success. */
  const attempt = (fn: (p: CareerProfile) => { profile: CareerProfile; error?: Text }, ok: Msg | ((money: number) => Msg), failTitle: string): boolean => {
    const before = useCareer.getState().profile?.money ?? 0;
    let err: Text | undefined;
    try {
      err = useCareer.getState().attempt(fn);
    } catch (e) {
      console.warn('[EPD career] action failed', e);
      notify('danger', failTitle, t('career.rules.pending'));
      return false;
    }
    if (err) {
      notify('danger', failTitle, tx(err));
      return false;
    }
    const diff = (useCareer.getState().profile?.money ?? 0) - before;
    const m = typeof ok === 'function' ? ok(diff) : ok;
    notify(m.tone ?? 'ok', m.title, m.body);
    return true;
  };

  /** Rule that always succeeds (pure transform). Returns the money difference, or null if it threw. */
  const update = (fn: (p: CareerProfile) => CareerProfile, ok: Msg | ((money: number) => Msg), failTitle: string): number | null => {
    const before = useCareer.getState().profile?.money ?? 0;
    try {
      useCareer.getState().update(fn);
    } catch (e) {
      console.warn('[EPD career] action failed', e);
      notify('danger', failTitle, t('career.rules.pending'));
      return null;
    }
    const diff = (useCareer.getState().profile?.money ?? 0) - before;
    const m = typeof ok === 'function' ? ok(diff) : ok;
    notify(m.tone ?? 'ok', m.title, m.body);
    return diff;
  };

  return { attempt, update };
}
