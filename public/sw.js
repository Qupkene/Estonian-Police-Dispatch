/*
 * EPD · Eesti Politsei Dispetšer: service worker (offline / PWA).
 * Mitteametlik fännimäng, ei ole seotud PPA-ga. Unofficial fan game, not affiliated with PPA.
 *
 * Strategies:
 *   navigations              network-first, falls back to the cached page or the cached index
 *   /assets/*, /glyphs/*      cache-first (Vite asset names are content-hashed)
 *   other same-origin GETs   network-first with a cached fallback (favicon, manifest, legacy pages)
 *   CARTO basemap tiles      cache-first, opportunistic, capped at about TILE_LIMIT entries
 *   everything else          not intercepted (non-GET, other hosts, range requests)
 *
 * Bump VERSION on a release to drop the old shell and static caches. The tile cache survives.
 */
'use strict';

const VERSION = '2.0.0-1';
const PREFIX = 'epd-';
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const STATIC_CACHE = `${PREFIX}static-${VERSION}`;
const TILE_CACHE = `${PREFIX}tiles-v1`;
const TILE_LIMIT = 400;
const TILE_TRIM_EVERY = 20; // check the tile cache size every N stored tiles
const MAX_WARM_URLS = 400;

const SCOPE_URL = new URL(self.registration.scope);
const BASE = SCOPE_URL.pathname; // '/' on politsei.eu, '/<repo>/' on a project page
const INDEX_URL = SCOPE_URL.href;
const STATIC_PREFIXES = [`${BASE}assets/`, `${BASE}glyphs/`];
const SHELL_EXTRAS = ['favicon.svg', 'manifest.webmanifest'].map((p) => new URL(p, SCOPE_URL).href);
const TILE_HOST = /(^|\.)basemaps\.cartocdn\.com$/i;

const isStatic = (url) =>
  url.origin === self.location.origin && STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));

const isCacheable = (response) =>
  !!response && response.status === 200 && response.type === 'basic' && !response.redirected;

/* ---------------------------------------------------------------- install */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.add(new Request(INDEX_URL, { cache: 'reload' }));

      // Best effort from here on: a missing file must not fail the install.
      await Promise.allSettled(SHELL_EXTRAS.map((url) => shell.add(new Request(url, { cache: 'reload' }))));

      // Precache the entry bundles the index references, so a fresh install works offline.
      try {
        const index = await shell.match(INDEX_URL);
        const html = index ? await index.text() : '';
        const refs = new Set();
        for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
          try {
            const url = new URL(m[1], INDEX_URL);
            if (isStatic(url)) refs.add(url.href);
          } catch {
            /* ignore malformed URLs */
          }
        }
        const statics = await caches.open(STATIC_CACHE);
        await Promise.allSettled([...refs].map((href) => statics.add(href)));
      } catch {
        /* runtime caching will pick the bundles up instead */
      }

      await self.skipWaiting();
    })(),
  );
});

/* --------------------------------------------------------------- activate */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, STATIC_CACHE, TILE_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(PREFIX) && !keep.has(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* not supported */
        }
      }
      await self.clients.claim();
    })(),
  );
});

/* ------------------------------------------------------------------ fetch */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  if (request.headers.has('range')) return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    if (url.origin === self.location.origin) event.respondWith(handleNavigation(event, url));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(isStatic(url) ? cacheFirst(event, STATIC_CACHE) : networkFirst(event, SHELL_CACHE));
    return;
  }

  if (TILE_HOST.test(url.hostname)) {
    event.respondWith(tileCacheFirst(event));
  }
});

/** Cache key for a page: the index for the scope root, otherwise the URL without query/hash. */
function pageKey(url) {
  if (url.pathname === BASE || url.pathname === `${BASE}index.html`) return INDEX_URL;
  return url.origin + url.pathname;
}

async function handleNavigation(event, url) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(event.request));
    if (isCacheable(response)) {
      event.waitUntil(cache.put(pageKey(url), response.clone()).catch(() => {}));
    }
    return response;
  } catch (err) {
    const cached = (await cache.match(pageKey(url))) || (await cache.match(INDEX_URL));
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (isCacheable(response)) {
    event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
  }
  return response;
}

async function networkFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(event.request);
    if (isCacheable(response)) {
      event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
    }
    return response;
  } catch (err) {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    throw err;
  }
}

/* ------------------------------------------------------------------ tiles */

let tilePuts = 0;
let tileTrim = Promise.resolve();

async function tileCacheFirst(event) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  // CARTO sends CORS headers. Opaque responses are skipped: Chrome pads each one to megabytes of quota.
  if (response.status === 200 && (response.type === 'cors' || response.type === 'basic')) {
    event.waitUntil(
      cache
        .put(event.request, response.clone())
        .then(() => (++tilePuts % TILE_TRIM_EVERY === 0 ? trimTiles() : undefined))
        .catch(() => {}),
    );
  }
  return response;
}

/** Drop the oldest tiles (insertion order) so the cache holds at most TILE_LIMIT entries. */
function trimTiles() {
  tileTrim = tileTrim
    .then(async () => {
      const cache = await caches.open(TILE_CACHE);
      const keys = await cache.keys();
      const excess = keys.length - TILE_LIMIT;
      if (excess > 0) await Promise.all(keys.slice(0, excess).map((k) => cache.delete(k)));
    })
    .catch(() => {});
  return tileTrim;
}

/* --------------------------------------------------------------- messages */

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'EPD_CACHE_URLS' && Array.isArray(data.urls)) {
    // Sent by src/pwa.ts after the first registration: files the page loaded before the SW existed.
    event.waitUntil(warmStatic(data.urls));
  } else if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function warmStatic(urls) {
  const wanted = new Set();
  for (const raw of urls.slice(0, MAX_WARM_URLS)) {
    if (typeof raw !== 'string') continue;
    try {
      const url = new URL(raw, self.location.href);
      if (isStatic(url)) wanted.add(url.origin + url.pathname);
    } catch {
      /* ignore */
    }
  }
  const cache = await caches.open(STATIC_CACHE);
  await Promise.allSettled(
    [...wanted].map(async (href) => {
      if (!(await cache.match(href))) await cache.add(href);
    }),
  );
}
