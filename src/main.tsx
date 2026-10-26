import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
// The out-of-game screens (Valvekaart, ui/screens/shell/vk.css): Archivo with its width axis, Instrument Sans.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/instrument-sans';
import './ui/styles/global.css';
import { App } from './app/App';
import { registerSW } from './pwa';
import { shiftKeyOf, useGame } from './store/game';
import { useCareer } from './store/career';
import { useSettings } from './store/settings';
import { step } from './sim/engine';
import type { SimState } from './sim/types';
import * as cmd from './sim/commands';
import * as sel from './sim/selectors';
import { startCrisisNow } from './sim/crisis';
import { simDigest } from './sim/coop';
import { coopDebug, useCoop } from './store/coop';
import { recordFrame, useReplay } from './store/replay';

// Console handle for power users, filmmakers and end-to-end tests (single-player game, nothing secret).
// Set synchronously from the entry chunk (MapLibre and the in-shift screen load later, see app/App.tsx).
(window as unknown as { __epd: unknown }).__epd = {
  game: useGame,
  career: useCareer,
  settings: useSettings,
  // startCrisisNow: a major incident now (docs/CRISIS.md), as the director's panel does.
  // record: what the game loop does each frame for Kordus (src/store/replay.ts), for a test that steps faster than frames.
  engine: { step, cmd, sel, crisis: { start: startCrisisNow }, record: (s: SimState) => recordFrame(s, shiftKeyOf(s)) },
  // Co-op room shifts: the session's state, the log position and the state digest (tests compare clients).
  coop: { state: useCoop, debug: coopDebug, digest: simDigest },
  // Kordus (src/store/replay.ts): the report's replay and the viewer.
  replay: useReplay,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerSW();
