// The way into the Mitmikmäng screen: from the menu (the player's open room, if any) or from a report (that room,
// even when it is already finished).
import { useGame } from '@/store/game';

let focus: string | null = null;

/** Open the lobby screen; with a code it shows that room, else the player's open room or the create and join forms. */
export function openLobby(code: string | null = null): void {
  focus = code;
  useGame.getState().setScreen('lobby');
}

/** The room the lobby was opened for, if any. */
export function lobbyFocus(): string | null {
  return focus;
}
