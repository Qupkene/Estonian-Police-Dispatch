import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

/** The surveillance camera's lazy chunk (src/cctv/live.ts and all it pulls in): assets/cctv-<hash>.js. */
export const CAMERA_CHUNK = /^assets\/cctv-[^/]+\.js$/;

/** Output names of the build's chunks: the camera's entry gets a name that says what it is. */
export function chunkFileName(chunk: { facadeModuleId: string | null }): string {
  const id = chunk.facadeModuleId?.split(path.sep).join('/') ?? '';
  return /\/src\/cctv\/live\.ts$/.test(id) ? 'assets/cctv-[hash].js' : 'assets/[name]-[hash].js';
}

/** What the service worker precaches from a build (paths relative to the site root, '/' separators). */
export function precacheList(files: readonly string[]): string[] {
  const keep = (f: string) =>
    // Chunks, stylesheets and the MapLibre worker, but not the surveillance camera's chunk (three.js and the
    // renderer, three quarters of a megabyte): it comes on first use and the runtime cache keeps it. Its body model
    // (assets/human-*.glb) is no listed kind either.
    (/^assets\/.+\.(?:js|mjs|css)$/.test(f) && !CAMERA_CHUNK.test(f)) ||
    // Latin fonts only: Estonian needs latin + latin-ext, the browser fetches other subsets on demand.
    /^assets\/.+-latin(?:-ext)?-.+\.woff2$/.test(f) ||
    // Images the bundle references, but not the newspaper's drawings (src/ui/screens/shell/paper): they are big
    // and only a finished shift shows them, so each is cached the first time it does.
    (/^assets\/.+\.(?:svg|png|webp)$/.test(f) && !/^assets\/paper-[^/]+\.webp$/.test(f)) ||
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

/**
 * The entry's stylesheets do not hold up the first paint: index.html preloads them (`data-epd-css`) and src/main.tsx
 * applies them before the app renders. The loading splash in index.html carries its own styles, so it paints as soon as
 * the page itself has arrived (PageSpeed: no render-blocking request) and nothing shows unstyled.
 */
export function preloadEntryStyles(html: string): string {
  return html.replace(
    /<link rel="stylesheet"( crossorigin)? href="([^"]+\.css)">/g,
    (_m, cors: string | undefined, href: string) => `<link rel="preload" as="style"${cors ?? ''} href="${href}" data-epd-css>`,
  );
}

function nonBlockingStyles(): Plugin {
  return {
    name: 'epd-non-blocking-styles',
    apply: 'build',
    transformIndexHtml: { order: 'post', handler: preloadEntryStyles },
  };
}

const devProxy = {
  '/api': process.env.EPD_API_URL ?? 'http://127.0.0.1:8787',
  '/mp': { target: process.env.EPD_MP_URL ?? 'http://127.0.0.1:8790', ws: true },
};

// Custom domain (politsei.eu) serves the game from the site root.
// Set BASE_PATH=/Estonian-Police-Dispatch/ for a plain github.io project page.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), serviceWorkerManifest(), nonBlockingStyles()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Local development: the PHP API (npm run dev:api) answers /api; without it the game runs in guest mode.
  // The game server (npm run dev:mp) answers /mp, the co-op rooms' WebSocket.
  // EPD_API_URL and EPD_MP_URL point them elsewhere (a second checkout's tests on their own ports).
  server: { proxy: devProxy },
  preview: { proxy: devProxy },
  build: {
    target: 'es2022',
    // The entry chunk holds the menus and the simulation; MapLibre and the in-shift screen are a
    // separate chunk (src/app/App.tsx) that loads after the boot screen has painted.
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { chunkFileNames: chunkFileName } },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
