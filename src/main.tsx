import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'maplibre-gl/dist/maplibre-gl.css';
import './ui/styles/global.css';
import { App } from './app/App';
import { registerSW } from './pwa';
import { useGame } from './store/game';
import { useCareer } from './store/career';
import { useSettings } from './store/settings';
import { step } from './sim/engine';
import * as cmd from './sim/commands';
import * as sel from './sim/selectors';

// Console handle for power users, filmmakers and end-to-end tests (single-player game, nothing secret).
(window as unknown as { __epd: unknown }).__epd = {
  game: useGame,
  career: useCareer,
  settings: useSettings,
  engine: { step, cmd, sel },
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerSW();
