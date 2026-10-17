/**
 * Offline / PWA support: registers `public/sw.js` (served at `${BASE_URL}sw.js`).
 *
 * Only runs in production builds. In `npm run dev` a service worker would cache Vite's
 * dev modules and get in the way of HMR.
 *
 * Usage (main.tsx): `import { registerSW } from './pwa'; registerSW();`
 */
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

export function registerSW(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const base = import.meta.env.BASE_URL; // '/' on politsei.eu, '/<repo>/' on a project page

  const register = (): void => {
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => warmCache(reg.active))
      .catch((err: unknown) => {
        // Offline support is a bonus, so never break the game because of it.
        console.warn('[EPD] Service worker registration failed:', err);
      });
  };

  // Register after load so the SW install does not compete with the game's first paint.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/** Map glyph files in public/glyphs (src/map/style.ts uses these font stacks and ranges only). */
const GLYPH_FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
const GLYPH_RANGES = ['0-255', '256-511', '8192-8447'];

/**
 * Files the tactical map needs offline although a menu-only visit never fetches them: the MapLibre
 * worker and the glyphs. The service worker's install step precaches them too (PRECACHE, stamped at
 * build); this list fills any gap that install left (a failed download) on the next load.
 */
export function offlineMapUrls(base: string, origin: string): string[] {
  const root = new URL(base, origin);
  return [
    new URL(workerUrl, root).href,
    ...GLYPH_FONTS.flatMap((f) => GLYPH_RANGES.map((r) => new URL(`glyphs/${f}/${r}.pbf`, root).href)),
  ];
}

/**
 * On the very first visit the page loads its bundles before the service worker exists, so
 * they are not in the cache yet. Hand the worker the list of everything already fetched, plus the
 * map's worker and glyphs; it caches the same-origin static files (`/assets/*`, `/glyphs/*`) it does
 * not have yet, so the next visit works offline straight away.
 */
function warmCache(worker: ServiceWorker | null): void {
  if (!worker) return;
  try {
    const urls = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => url.startsWith(location.origin));
    urls.push(...offlineMapUrls(import.meta.env.BASE_URL, location.origin));
    worker.postMessage({ type: 'EPD_CACHE_URLS', urls });
  } catch {
    // performance API unavailable: runtime caching will fill the cache instead.
  }
}
