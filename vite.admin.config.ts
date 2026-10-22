import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// The admin panel (politsei.eu/admin/, src/admin): its own page and bundle in dist/admin/, built after the game
// (npm run build). Nothing of it goes into the game's bundle or its service worker's caches (public/sw.js leaves
// /admin/ to the network). `npm run dev` serves it at /admin/ as well.
export default defineConfig({
  root: fileURLToPath(new URL('./admin', import.meta.url)),
  base: '/admin/',
  publicDir: false,
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/admin', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
  },
});
