/* Dev-only: start a shift directly and render the real App (map integration check). */
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/ui/styles/global.css';
import { App } from '@/app/App';
import { useGame } from '@/store/game';
import type { RegionId } from '@/sim/types';

const q = new URLSearchParams(location.search);
const hour = Number(q.get('hour') ?? 21);
useGame.getState().login({ name: 'Test', method: 'legacy' } as never);
useGame.getState().startShift({
  seed: 42,
  regionId: (q.get('region') ?? 'pohja') as RegionId,
  mode: 'free',
  difficulty: 'normal',
  start: Date.UTC(2026, 9, 17, hour - 3, 0),
  hours: 8,
  playerName: 'Test',
});
const speed = Number(q.get('speed') ?? 4);
useGame.getState().setSpeed(speed);
createRoot(document.getElementById('root')!).render(<App />);
