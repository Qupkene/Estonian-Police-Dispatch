// Remembers the previous screen so "Back" on Settings etc. returns where the player came from.
import { useGame, type Screen } from '@/store/game';

let previous: Screen = 'menu';

useGame.subscribe((s, prev) => {
  if (s.screen !== prev.screen) previous = prev.screen;
});

/** Previous screen, limited to safe return targets. */
export function backTarget(fallback: Screen = 'menu'): Screen {
  const g = useGame.getState();
  if (previous === 'game' && g.sim && !g.sim.ended) return 'game';
  if (
    previous === 'career' ||
    previous === 'briefing' ||
    previous === 'menu' ||
    previous === 'report' ||
    previous === 'lobby'
  )
    return previous;
  return g.user ? fallback : 'login';
}

export function goBack(fallback: Screen = 'menu') {
  useGame.getState().setScreen(backTarget(fallback));
}
