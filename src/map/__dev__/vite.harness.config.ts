// Dev-only Vite config for the map harness: no HMR / file watching, so edits by other modules in the
// shared working tree do not reload the page mid-screenshot. `npx vite --config src/map/__dev__/vite.harness.config.ts --port 5391`
// EPD_HARNESS_PUBLIC=/some/dir serves another public folder (e.g. one with glyphs/ and a test
// tiles/estonia.pmtiles), so a street map file never has to be copied into public/.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('../..', import.meta.url)) } },
  publicDir: process.env.EPD_HARNESS_PUBLIC || undefined,
  server: { hmr: false, watch: { ignored: ['**/*'] } },
});
