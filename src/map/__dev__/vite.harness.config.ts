// Dev-only Vite config for the map harness: no HMR / file watching, so edits by other modules in the
// shared working tree do not reload the page mid-screenshot. `npx vite --config src/map/__dev__/vite.harness.config.ts --port 5391`
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('../..', import.meta.url)) } },
  server: { hmr: false, watch: { ignored: ['**/*'] } },
});
