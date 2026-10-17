// Director-mode UI state shared by DirectorPanel (ui-tools, owner) and GameScreen/MapView (ui-game). Keep this API.
import { create } from 'zustand';
import type { Priority, Text } from '@/sim/types';

export type DirectorPlacing = null | { kind: 'incident'; templateId: string } | { kind: 'teleport'; unitId: string };

interface DirectorStore {
  placing: DirectorPlacing;
  priority: Priority | null;
  customSummary: Text | null;
  setPlacing: (p: DirectorPlacing) => void;
  setPriority: (p: Priority | null) => void;
  setCustomSummary: (t: Text | null) => void;
}

export const useDirector = create<DirectorStore>()((set) => ({
  placing: null,
  priority: null,
  customSummary: null,
  setPlacing: (placing) => set({ placing }),
  setPriority: (priority) => set({ priority }),
  setCustomSummary: (customSummary) => set({ customSummary }),
}));
