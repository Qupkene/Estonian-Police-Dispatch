/*
 * EPD · Eesti Politsei Dispetšer: service worker (offline / PWA).
 * Mitteametlik fännimäng, ei ole seotud PPA-ga. Unofficial fan game, not affiliated with PPA.
 *
 * Strategies:
 *   navigations              network-first; falls back to the cached page or the cached index when the
 *                            network fails or the server answers 5xx (the relay's "server unavailable" page)
 *   /assets/*, /glyphs/*      cache-first (Vite asset names are content-hashed)
 *   other same-origin GETs   network-first with a cached fallback (favicon, manifest, legacy pages)
 *   everything else          not intercepted (non-GET, other hosts, range requests, /api/*, /tiles/*)
 *
 * /api/* carries per-user data and must never land in a cache. /tiles/estonia.pmtiles is read with
 * HTTP range requests straight from the server.
 *
 * VERSION and PRECACHE are stamped by the build (vite.config.ts, plugin "epd-sw-manifest"): VERSION is
 * the package version plus a hash of the build, PRECACHE lists every chunk, stylesheet, the MapLibre
 * worker, the Latin fonts, the map glyphs and the legacy pages. Every deploy that changes anything
 * therefore installs a new worker, which precaches the new build and prunes the old caches (the static
 * cache of the previous build is kept, so a tab still running it can load its remaining chunks).
 * The values below are the unstamped defaults; never edit the two lines' shape without updating the plugin.
 */
'use strict';

const VERSION = 'dev';
const PRECACHE = [];

const PREFIX = 'epd-';
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const STATIC_PREFIX = `${PREFIX}static-`;
const STATIC_CACHE = `${STATIC_PREFIX}${VERSION}`;
const MAX_WARM_URLS = 400;
/** Vary: Accept-Encoding from the server must not make cached copies unmatchable (one variant per URL). */
const MATCH = { ignoreVary: true };

const SCOPE_URL = new URL(self.registration.scope);
const BASE = SCOPE_URL.pathname; // '/' on politsei.eu, '/<repo>/' on a project page
const INDEX_URL = SCOPE_URL.href;
const STATIC_PREFIXES = [`${BASE}assets/`, `${BASE}glyphs/`];
const SHELL_EXTRAS = ['favicon.svg', 'manifest.webmanifest'].map((p) => new URL(p, SCOPE_URL).href);
const BYPASS_PREFIXES = [`${BASE}api/`, `${BASE}tiles/`];

const isStatic = (url) =>
  url.origin === self.location.origin && STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));

/** Content-hashed build output: a copy from an older cache is byte-identical. */
const isHashed = (url) => url.origin === self.location.origin && url.pathname.startsWith(`${BASE}assets/`);

const isCacheable = (response) =>
  !!response && response.status === 200 && response.type === 'basic' && !response.redirected;

/* ---------------------------------------------------------------- install */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.add(new Request(INDEX_URL, { cache: 'reload' }));

      // Best effort from here on: a missing file must not fail the install.
      const statics = await caches.open(STATIC_CACHE);
      const pages = new Set(SHELL_EXTRAS);
      const files = new Set();
      for (const p of PRECACHE) {
        try {
          const url = new URL(p, SCOPE_URL);
          (isStatic(url) ? files : pages).add(url.href);
        } catch {
          /* ignore malformed entries */
        }
      }
      // The entry bundles the index references (also covers an unstamped worker).
      try {
        const index = await shell.match(INDEX_URL, MATCH);
        const html = index ? await index.text() : '';
        for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
          try {
            const url = new URL(m[1], INDEX_URL);
            if (isStatic(url)) files.add(url.href);
          } catch {
            /* ignore malformed URLs */
          }
        }
      } catch {
        /* runtime caching will pick the bundles up instead */
      }

      await Promise.allSettled([
        ...[...pages].map((href) => shell.add(new Request(href, { cache: 'reload' }))),
        ...[...files].map((href) => precacheStatic(statics, href)),
      ]);

      await self.skipWaiting();
    })(),
  );
});

/** Put one static file in the new cache: copied from an older cache when it is content-hashed, else fetched. */
async function precacheStatic(cache, href) {
  if (await cache.match(href, MATCH)) return;
  if (isHashed(new URL(href))) {
    const old = await caches.match(href, MATCH);
    if (old && old.ok) {
      await cache.put(href, old);
      return;
    }
  }
  await cache.add(href);
}

/* --------------------------------------------------------------- activate */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await pruneCaches();
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

/**
 * Keep the current shell cache, the current static cache and the newest older static cache (a tab that
 * still runs the previous build loads its remaining chunks from it). Everything else from EPD goes.
 * CacheStorage lists caches in creation order, so the last older static cache is the previous build's.
 */
async function pruneCaches() {
  const names = (await caches.keys()).filter((n) => n.startsWith(PREFIX));
  const olderStatic = names.filter((n) => n.startsWith(STATIC_PREFIX) && n !== STATIC_CACHE);
  const keep = new Set([SHELL_CACHE, STATIC_CACHE, ...olderStatic.slice(-1)]);
  await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
}

/* ------------------------------------------------------------------ fetch */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  if (request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin && BYPASS_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

  if (request.mode === 'navigate') {
    if (url.origin === self.location.origin) event.respondWith(handleNavigation(event, url));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(isStatic(url) ? cacheFirst(event, STATIC_CACHE) : networkFirst(event, SHELL_CACHE));
  }
});

/** Cache key for a page: the index for the scope root, otherwise the URL without query/hash. */
function pageKey(url) {
  if (url.pathname === BASE || url.pathname === `${BASE}index.html`) return INDEX_URL;
  return url.origin + url.pathname;
}

async function handleNavigation(event, url) {
  const cache = await caches.open(SHELL_CACHE);
  const cachedPage = async () => (await cache.match(pageKey(url), MATCH)) || (await cache.match(INDEX_URL, MATCH));
  let response;
  try {
    const preloaded = await event.preloadResponse;
    response = preloaded || (await fetch(event.request));
  } catch (err) {
    const cached = await cachedPage();
    if (cached) return cached;
    throw err;
  }
  // While the home server is down the relay answers every page with its fallback page and status 502
  // (504 on a timeout). The cached game works offline (guest mode), so it is the better answer.
  // The 5xx page itself is never cached (isCacheable wants 200).
  if (response.status >= 500) {
    const cached = await cachedPage();
    if (cached) return cached;
  }
  if (isCacheable(response)) {
    event.waitUntil(cache.put(pageKey(url), response.clone()).catch(() => {}));
  }
  return response;
}

async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  // Any EPD cache: a tab still on the previous build finds its chunks in that build's static cache.
  const cached = (await cache.match(event.request, MATCH)) || (await caches.match(event.request, MATCH));
  if (cached) return cached;
  const response = await fetch(event.request);
  if (isCacheable(response)) {
    event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
  }
  return response;
}

async function networkFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  let response;
  try {
    response = await fetch(event.request);
  } catch (err) {
    const cached = await cache.match(event.request, MATCH);
    if (cached) return cached;
    throw err;
  }
  if (response.status >= 500) {
    const cached = await cache.match(event.request, MATCH);
    if (cached) return cached;
  }
  if (isCacheable(response)) {
    event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
  }
  return response;
}

/* --------------------------------------------------------------- messages */

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'EPD_CACHE_URLS' && Array.isArray(data.urls)) {
    // Sent by src/pwa.ts after registration: files the page loaded before the SW existed.
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
      if (!(await cache.match(href, MATCH))) await cache.add(href);
    }),
  );
}
