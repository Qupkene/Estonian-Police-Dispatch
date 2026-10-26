// The way into the Mitmikmäng screen: from the menu (the player's open room, if any), from a report (that room, even
// when it is already finished) or from a friend's invitation (the room just joined, also while the lobby is open).
import { create } from 'zustand';
import { useGame } from '@/store/game';

/** The room the lobby was opened for, and a count of the openings (the lobby loads again on each). */
export const useLobbyNav = create<{ focus: string | null; n: number }>()(() => ({ focus: null, n: 0 }));

/** Open the lobby screen; with a code it shows that room, else the player's open room or the create and join forms. */
export function openLobby(code: string | null = null): void {
  useLobbyNav.setState((s) => ({ focus: code, n: s.n + 1 }));
  useGame.getState().setScreen('lobby');
}

/** The room the lobby was opened for, if any. */
export function lobbyFocus(): string | null {
  return useLobbyNav.getState().focus;
}
