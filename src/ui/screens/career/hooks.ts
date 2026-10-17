import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/store/settings';

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Animated number that eases from its previous value to `target` (count-up). */
export function useCountUp(target: number, ms = 750): number {
  const reduced = useSettings((s) => s.reducedMotion);
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const shownRef = useRef(target);
  shownRef.current = shown;

  useEffect(() => {
    if (reduced || prefersReducedMotion() || !Number.isFinite(target)) {
      setShown(target);
      return;
    }
    fromRef.current = shownRef.current;
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      setShown(k >= 1 ? target : from + (target - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);

  return shown;
}

/** Briefly remembers the last change of a value (for "+1 200 €" floaters). */
export function useDelta(value: number, holdMs = 2200): { delta: number; key: number } | null {
  const prev = useRef(value);
  const [d, setD] = useState<{ delta: number; key: number } | null>(null);
  useEffect(() => {
    const diff = value - prev.current;
    prev.current = value;
    if (!diff || !Number.isFinite(diff)) return;
    setD({ delta: diff, key: performance.now() });
    const id = window.setTimeout(() => setD(null), holdMs);
    return () => window.clearTimeout(id);
  }, [value, holdMs]);
  return d;
}

/** useState persisted per viewer in localStorage (guarded; falls back to memory). */
export function useStoredState<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key) as T | null;
      return raw && allowed.includes(raw) ? raw : initial;
    } catch {
      return initial;
    }
  });
  const set = (nv: T) => {
    setV(nv);
    try {
      localStorage.setItem(key, nv);
    } catch {
      /* ignore */
    }
  };
  return [v, set];
}
