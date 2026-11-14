// Dev-only Vite config for the camera harness pages (harness.html, model.html, vehicles.html). Files are watched,
// so a page loaded after an edit shows the edit; there is no hot reload (a screenshot never changes under the lens).
//   npx vite --config src/cctv/__dev__/vite.harness.config.ts --port 5392 --strictPort
// EPD_VITE_CACHE=<folder>: a cache folder of its own, for a second server running at the same time.
// scene.html reads real streets from map archives outside the checkout (/@fs/<path> answers range requests): the
// folder of EPD_MAP_TILES (default /tmp/claude-0/map-tiles) is served too. Dev only.
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('../..', import.meta.url)) } },
  cacheDir: process.env.EPD_VITE_CACHE || 'node_modules/.vite-cctv',
  server: { hmr: false, fs: { allow: [searchForWorkspaceRoot(process.cwd()), process.env.EPD_MAP_TILES || '/tmp/claude-0/map-tiles'] } },
});
