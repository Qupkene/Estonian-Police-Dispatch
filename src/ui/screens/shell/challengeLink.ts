// The challenge to open over the menu (docs/CHALLENGE.md): one a link brought (/v/<code>) or a friend sent (2.40.0).
import { create } from 'zustand';

/** A challenge waiting to be shown: remembered until the player has seen it. */
export const useChallengeLink = create<{ code: string | null; set: (code: string | null) => void }>()(
  (set) => ({
    code: null,
    set: (code) => set({ code }),
  }),
);
