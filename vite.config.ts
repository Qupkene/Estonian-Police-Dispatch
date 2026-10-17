import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

/** What the service worker precaches from a build (paths relative to the site root, '/' separators). */
export function precacheList(files: readonly string[]): string[] {
  const keep = (f: string) =>
    // Chunks, stylesheets and the MapLibre worker.
    /^assets\/.+\.(?:js|mjs|css)$/.test(f) ||
    // Latin fonts only: Estonian needs latin + latin-ext, the browser fetches other subsets on demand.
    /^assets\/.+-latin(?:-ext)?-.+\.woff2$/.test(f) ||
    // Images the bundle references.
    /^assets\/.+\.(?:svg|png|webp)$/.test(f) ||
    // Map labels and the 2024/2025 originals.
    /^glyphs\/.+\.pbf$/.test(f) ||
    /^legacy\/.+\.html$/.test(f);
  return files.filter(keep).sort().map((f) => f.split('/').map(encodeURIComponent).join('/'));
}

/** Put the build's version and precache list into the service worker source. Throws if the markers moved. */
export function stampServiceWorker(src: string, version: string, precache: readonly string[]): string {
  const versionRe = /const VERSION = '[^']*';/;
  const precacheRe = /const PRECACHE = \[[^\]]*\];/;
  if (!versionRe.test(src) || !precacheRe.test(src)) throw new Error('public/sw.js: VERSION or PRECACHE marker not found');
  return src
    .replace(versionRe, () => `const VERSION = '${version}';`)
    .replace(precacheRe, () => `const PRECACHE = ${JSON.stringify(precache)};`);
}

function listFiles(dir: string, rel = ''): string[] {
  return readdirSync(path.join(dir, rel)).flatMap((name) => {
    const r = rel ? `${rel}/${name}` : name;
    return statSync(path.join(dir, r)).isDirectory() ? listFiles(dir, r) : [r];
  });
}

/**
 * Stamps dist/sw.js after every build: VERSION = package version + a hash of the whole build (names and
 * contents), PRECACHE = every chunk, stylesheet, the MapLibre worker, the Latin fonts, the glyphs and
 * the legacy pages. A deploy that changes anything installs a new service worker, which precaches the
 * lazily loaded in-shift chunk too (offline play after a menu-only visit) and prunes the old caches.
 */
function serviceWorkerManifest(): Plugin {
  let outDir = '';
  return {
    name: 'epd-sw-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const swPath = path.join(outDir, 'sw.js');
      if (!existsSync(swPath)) return; // a build without the public folder (library or test build)
      const files = listFiles(outDir).filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const hash = createHash('sha256');
      for (const f of [...files].sort()) hash.update(f).update('\0').update(readFileSync(path.join(outDir, f)));
      const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')) as { version: string };
      const version = `${pkg.version}-${hash.digest('hex').slice(0, 12)}`;
      writeFileSync(swPath, stampServiceWorker(readFileSync(swPath, 'utf8'), version, precacheList(files)));
    },
  };
}

// Custom domain (politsei.eu) serves the game from the site root.
// Set BASE_PATH=/Estonian-Police-Dispatch/ for a plain github.io project page.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), serviceWorkerManifest()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Local development: the PHP API (npm run dev:api) answers /api; without it the game runs in guest mode.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: {
    target: 'es2022',
    // The entry chunk holds the menus and the simulation; MapLibre and the in-shift screen are a
    // separate chunk (src/app/App.tsx) that loads after the boot screen has painted.
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
