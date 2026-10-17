import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'maplibre-gl/dist/maplibre-gl.css';
import './ui/styles/global.css';
import { App } from './app/App';
import { registerSW } from './pwa';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerSW();
