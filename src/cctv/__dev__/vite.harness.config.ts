// Dev-only Vite config for the camera harness pages (harness.html, model.html, vehicles.html). Files are watched,
// so a page loaded after an edit shows the edit; there is no hot reload (a screenshot never changes under the lens).
//   npx vite --config src/cctv/__dev__/vite.harness.config.ts --port 5392 --strictPort
// EPD_VITE_CACHE=<folder>: a cache folder of its own, for a second server running at the same time.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('../..', import.meta.url)) } },
  cacheDir: process.env.EPD_VITE_CACHE || 'node_modules/.vite-cctv',
  server: { hmr: false },
});
