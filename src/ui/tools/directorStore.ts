// Director-mode UI state shared by DirectorPanel (ui-tools, owner) and GameScreen/MapView (ui-game). Keep this API.
// Extensions (ui-tools): `commitPlacing(coord)` — one call for MapView onMapClick that performs the pending
// placement (directorSpawn with priority/summary overrides, or directorMoveUnit) and resets `placing`;
// `scene` progress for the "Stseenid" presets; `lastSpawned` incident id.
import { create } from 'zustand';
import type { LngLat, Priority, Text } from '@/sim/types';
import { directorMoveUnit, directorSpawn } from '@/sim/commands';
import { useGame } from '@/store/game';

export type DirectorPlacing = null | { kind: 'incident'; templateId: string } | { kind: 'teleport'; unitId: string };

export interface DirectorScene {
  id: string;
  step: number;
  total: number;
}

interface DirectorStore {
  placing: DirectorPlacing;
  priority: Priority | null;
  customSummary: Text | null;
  setPlacing: (p: DirectorPlacing) => void;
  setPriority: (p: Priority | null) => void;
  setCustomSummary: (t: Text | null) => void;

  scene: DirectorScene | null;
  lastSpawned: string | null;
  setScene: (s: DirectorScene | null) => void;
  /** Perform the pending placement at `coord`. Returns the new incident id (spawn) or null. */
  commitPlacing: (coord: LngLat) => string | null;
}

export const useDirector = create<DirectorStore>()((set, get) => ({
  placing: null,
  priority: null,
  customSummary: null,
  setPlacing: (placing) => set({ placing }),
  setPriority: (priority) => set({ priority }),
  setCustomSummary: (customSummary) => set({ customSummary }),

  scene: null,
  lastSpawned: null,
  setScene: (scene) => set({ scene }),
  commitPlacing: (coord) => {
    const { placing, priority, customSummary } = get();
    const g = useGame.getState();
    const s = g.sim;
    if (!s || !placing) return null;
    let id: string | null = null;
    try {
      if (placing.kind === 'incident') {
        id = directorSpawn(s, {
          templateId: placing.templateId,
          coord,
          priority: priority ?? undefined,
          summary: customSummary ?? undefined,
        });
      } else {
        directorMoveUnit(s, placing.unitId, coord);
      }
    } catch (err) {
      console.warn('[EPD director] placement failed', err);
    }
    set({ placing: null, lastSpawned: id ?? get().lastSpawned });
    useGame.getState().bump();
    return id;
  },
}));
