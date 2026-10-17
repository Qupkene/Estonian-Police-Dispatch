/**
 * Offline / PWA support: registers `public/sw.js` (served at `${BASE_URL}sw.js`).
 *
 * Only runs in production builds. In `npm run dev` a service worker would cache Vite's
 * dev modules and get in the way of HMR.
 *
 * Usage (main.tsx): `import { registerSW } from './pwa'; registerSW();`
 */
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

/**
 * On the very first visit the page loads its bundles before the service worker exists, so
 * they are not in the cache yet. Hand the worker the list of everything already fetched; it
 * caches the same-origin static files (`/assets/*`, `/glyphs/*`) so the next visit works
 * offline straight away.
 */
function warmCache(worker: ServiceWorker | null): void {
  if (!worker) return;
  try {
    const urls = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => url.startsWith(location.origin));
    worker.postMessage({ type: 'EPD_CACHE_URLS', urls });
  } catch {
    // performance API unavailable: runtime caching will fill the cache instead.
  }
}
