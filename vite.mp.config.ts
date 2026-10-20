import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// The game server (server/mp, docs/MULTIPLAYER.md section 9) as one file for Node: dist-mp/mp.mjs, with the
// simulation and the ws package inside, so the server needs nothing but `node mp.mjs`.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'server/mp/main.ts',
    outDir: 'dist-mp',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: false,
    copyPublicDir: false,
    rollupOptions: {
      // ws loads these native speed-ups only when they are installed.
      external: ['bufferutil', 'utf-8-validate'],
      output: { entryFileNames: 'mp.mjs', format: 'es', codeSplitting: false },
    },
  },
});
