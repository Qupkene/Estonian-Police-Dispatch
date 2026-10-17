// UI-only state of the in-shift CAD screen (not part of the simulation, not persisted).
import { create } from 'zustand';
import type { Text } from '@/sim/types';
import type { QueueFilter } from './format';

export type RadioFilter = 'all' | 'reply' | 'emergency' | 'selected';
export type MobileTab = 'map' | 'queue' | 'panel' | 'radio' | 'units';

export type ToastKind = 'p1' | 'escalated' | 'backup' | 'emergency' | 'missed' | 'pursuit' | 'pursuitEnd' | 'shift' | 'achievement' | 'error' | 'ok';

export interface Toast {
  id: number;
  kind: ToastKind;
  /** i18n key for the title. */
  title: string;
  vars?: Record<string, string | number>;
  text?: Text | string;
  incidentId?: string;
  unitId?: string;
  createdAt: number;
}

const TOAST_TTL: Partial<Record<ToastKind, number>> = { emergency: 14_000, backup: 12_000, p1: 10_000, error: 6_000, ok: 3_500 };
const MAX_TOASTS = 5;
let toastSeq = 0;

interface GameUi {
  queueFilter: QueueFilter;
  queueCursor: string | null;
  showClosed: boolean;
  radioFilter: RadioFilter;
  dockOpen: boolean;
  drawerOpen: boolean;
  mobileTab: MobileTab;
  pauseOpen: boolean;
  /** Bumped to move keyboard focus into the queue list. */
  focusQueueN: number;
  /** Multi-selected recommended units per incident id. */
  picks: Record<string, string[]>;
  /** Last dispatch error per incident id. */
  dispatchError: Record<string, Text | string | undefined>;
  bulletinsSeen: number;
  toasts: Toast[];

  set: (p: Partial<Omit<GameUi, 'set' | 'pushToast' | 'dismissToast' | 'togglePick' | 'clearPicks'>>) => void;
  pushToast: (t: Omit<Toast, 'id' | 'createdAt'>) => void;
  dismissToast: (id: number) => void;
  togglePick: (incidentId: string, unitId: string) => void;
  clearPicks: (incidentId: string) => void;
}

export const useGameUi = create<GameUi>()((set, get) => ({
  queueFilter: 'all',
  queueCursor: null,
  showClosed: false,
  radioFilter: 'all',
  dockOpen: true,
  drawerOpen: false,
  mobileTab: 'map',
  pauseOpen: false,
  focusQueueN: 0,
  picks: {},
  dispatchError: {},
  bulletinsSeen: 0,
  toasts: [],

  set: (p) => set(p),
  pushToast: (t) => {
    const now = Date.now();
    // De-duplicate identical toasts fired within a few seconds (e.g. repeated command errors).
    const dup = get().toasts.find(
      (x) => x.kind === t.kind && x.title === t.title && x.incidentId === t.incidentId && JSON.stringify(x.text) === JSON.stringify(t.text) && now - x.createdAt < 4000,
    );
    if (dup) return;
    const toast: Toast = { ...t, id: ++toastSeq, createdAt: now };
    set({ toasts: [...get().toasts, toast].slice(-MAX_TOASTS) });
    const ttl = TOAST_TTL[t.kind] ?? 8_000;
    setTimeout(() => get().dismissToast(toast.id), ttl);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  togglePick: (incidentId, unitId) => {
    const cur = get().picks[incidentId] ?? [];
    const next = cur.includes(unitId) ? cur.filter((x) => x !== unitId) : [...cur, unitId];
    set({ picks: { ...get().picks, [incidentId]: next } });
  },
  clearPicks: (incidentId) => {
    const { [incidentId]: _drop, ...rest } = get().picks;
    void _drop;
    set({ picks: rest });
  },
}));
