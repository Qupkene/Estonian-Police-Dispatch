// Andmebaas panel UI state, kept outside the component so switching side-panel tabs does not lose the
// open record or re-run (and re-log) the last external query.
import { create } from 'zustand';

export type RegMode = 'person' | 'vehicle';
export type RegView = { kind: 'person'; id: string } | { kind: 'vehicle'; plate: string };
export interface RegResults {
  kind: RegMode;
  q: string;
  ids: string[];
}

interface RegistryUi {
  /** Shift the state belongs to (seed:startTime); a new shift resets it. */
  shift: string;
  mode: RegMode;
  input: string;
  results: RegResults | null;
  trail: RegView[];
  showHistory: boolean;
  /** Last handled useGame.registryQuery.n. */
  handledN: number;
  /** Last handled selection person/plate ("p:<id>" / "v:<plate>"). */
  handledSel: string;
  set: (patch: Partial<Omit<RegistryUi, 'set' | 'syncShift'>>) => void;
  syncShift: (shift: string) => void;
}

export const useRegistryUi = create<RegistryUi>()((set, get) => ({
  shift: '',
  mode: 'person',
  input: '',
  results: null,
  trail: [],
  showHistory: false,
  handledN: 0,
  handledSel: '',
  set: (patch) => set(patch),
  syncShift: (shift) => {
    if (get().shift === shift) return;
    set({ shift, mode: 'person', input: '', results: null, trail: [], showHistory: false, handledSel: '' });
  },
}));
