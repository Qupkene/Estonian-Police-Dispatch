// Dev-only Vite config for the camera's dev pages (harness.html, scene.html, model.html, vehicles.html). Files are watched,
// so a page loaded after an edit shows the edit; there is no hot reload (a screenshot never changes under the lens).
//   npx vite --config src/cctv/__dev__/vite.harness.config.ts --port 5392 --strictPort
// EPD_VITE_CACHE=<folder>: a cache folder of its own, for a second server running at the same time.
// EPD_MAP_TILES=<folder>: a folder of your own with map archives (.pmtiles) outside the checkout. scene.html reads
// real streets from them (tiles=<lng>,<lat>; /@fs/<path> answers range requests). The folder is served only when
// the variable is set; without it the page says that no sample is configured. Dev only.
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const mapTiles = process.env.EPD_MAP_TILES || '';

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('../..', import.meta.url)) } },
  cacheDir: process.env.EPD_VITE_CACHE || 'node_modules/.vite-cctv',
  // The pages read the folder's path from here (scene.ts): an empty string when none is configured.
  define: { __EPD_MAP_TILES__: JSON.stringify(mapTiles) },
  server: { hmr: false, fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...(mapTiles ? [mapTiles] : [])] } },
});
