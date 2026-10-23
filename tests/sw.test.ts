// Service worker (public/sw.js) in a fake worker scope: offline fallbacks, precache and cache pruning,
// plus the build step that stamps its version and precache list (vite.config.ts).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { precacheList, stampServiceWorker } from '../vite.config';
import { offlineMapUrls } from '@/pwa';

const ORIGIN = 'https://politsei.eu';
const SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

type Req = string | { url: string };
const keyOf = (r: Req) => new URL(typeof r === 'string' ? r : r.url).href;

/** A same-origin network response (type 'basic', like the browser's). */
function net(body: string, status = 200): Response {
  const r = new Response(body, { status });
  Object.defineProperty(r, 'type', { value: 'basic' });
  return r;
}

class FakeCache {
  store = new Map<string, Response>();
  constructor(private readonly fetcher: (r: Req) => Promise<Response>) {}
  async match(r: Req) {
    return this.store.get(keyOf(r))?.clone();
  }
  async put(r: Req, res: Response) {
    this.store.set(keyOf(r), res.clone());
  }
  async add(r: Req) {
    const res = await this.fetcher(r);
    if (!res.ok) throw new TypeError(`add failed: ${res.status}`);
    await this.put(r, res);
  }
}

class FakeCaches {
  map = new Map<string, FakeCache>(); // insertion order = creation order, like CacheStorage
  constructor(private readonly fetcher: (r: Req) => Promise<Response>) {}
  async open(name: string) {
    if (!this.map.has(name)) this.map.set(name, new FakeCache(this.fetcher));
    return this.map.get(name)!;
  }
  async keys() {
    return [...this.map.keys()];
  }
  async delete(name: string) {
    return this.map.delete(name);
  }
  async match(r: Req) {
    for (const c of this.map.values()) {
      const hit = await c.match(r);
      if (hit) return hit;
    }
    return undefined;
  }
}

interface Harness {
  caches: FakeCaches;
  /** What the "server" answers, by absolute URL. Missing: a network error. */
  server: Map<string, () => Response>;
  fetched: string[];
  fire: (type: string, event?: Record<string, unknown>) => Promise<void>;
  navigate: (path: string) => Promise<Response>;
  get: (path: string) => Promise<Response>;
}

function boot(version: string, precache: string[]): Harness {
  const server = new Map<string, () => Response>();
  const fetched: string[] = [];
  const fetcher = async (r: Req) => {
    const k = keyOf(r);
    fetched.push(k);
    const make = server.get(k);
    if (!make) throw new TypeError('Failed to fetch');
    return make();
  };
  const caches = new FakeCaches(fetcher);
  const handlers: Record<string, (e: Record<string, unknown>) => void> = {};
  const self = {
    registration: { scope: `${ORIGIN}/`, navigationPreload: { enable: async () => {} } },
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: (e: Record<string, unknown>) => void) => (handlers[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  vm.runInContext(stampServiceWorker(SOURCE, version, precache), vm.createContext({ self, caches, fetch: fetcher, URL, Request, Response, Headers, console }));

  const fire = async (type: string, event: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const request = async (path: string, mode: string) => {
    let responded: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    handlers.fetch({
      request: { url: `${ORIGIN}${path}`, method: 'GET', mode, cache: 'default', headers: new Headers() },
      preloadResponse: Promise.resolve(undefined),
      respondWith: (p: Promise<Response>) => (responded = p),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    if (!responded) throw new Error('not intercepted');
    const res = await responded;
    await Promise.all(waits);
    return res;
  };
  return { caches, server, fetched, fire, navigate: (p) => request(p, 'navigate'), get: (p) => request(p, 'no-cors') };
}

const PRECACHE = [
  'assets/index-AAA.js',
  'assets/GameScreen-BBB.js',
  'assets/GameScreen-CCC.css',
  'assets/maplibre-gl-worker-DDD.mjs',
  'glyphs/Noto%20Sans%20Regular/0-255.pbf',
  'legacy/politseimang-2024.html',
];

function serveBuild(h: Harness) {
  h.server.set(`${ORIGIN}/`, () => net('<script type="module" src="/assets/index-AAA.js"></script>'));
  for (const p of [...PRECACHE, 'favicon.svg', 'manifest.webmanifest']) h.server.set(new URL(p, `${ORIGIN}/`).href, () => net(`file ${p}`));
}

describe('service worker: navigation fallbacks', () => {
  let h: Harness;
  beforeEach(async () => {
    h = boot('test-1', PRECACHE);
    serveBuild(h);
    await h.fire('install');
    await h.fire('activate');
  });

  it('serves the cached game when the relay answers 502 or 504 for a page', async () => {
    h.server.set(`${ORIGIN}/`, () => net('Server on hetkel kättesaamatu', 502));
    const res = await h.navigate('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('index-AAA.js');

    h.server.set(`${ORIGIN}/`, () => net('timeout', 504));
    expect(await (await h.navigate('/?utm=x')).text()).toContain('index-AAA.js');
  });

  it('never caches the 5xx page over the cached index', async () => {
    h.server.set(`${ORIGIN}/`, () => net('down', 502));
    await h.navigate('/');
    const cached = await (await h.caches.open('epd-shell-test-1')).match(`${ORIGIN}/`);
    expect(await cached!.text()).toContain('index-AAA.js');
  });

  it('serves a precached legacy page offline and when the server is down', async () => {
    h.server.delete(`${ORIGIN}/legacy/politseimang-2024.html`);
    expect(await (await h.navigate('/legacy/politseimang-2024.html')).text()).toBe('file legacy/politseimang-2024.html');
    h.server.set(`${ORIGIN}/legacy/politseimang-2024.html`, () => net('down', 502));
    expect(await (await h.navigate('/legacy/politseimang-2024.html')).text()).toBe('file legacy/politseimang-2024.html');
  });

  it('falls back on a network error and passes a 5xx through when nothing is cached', async () => {
    h.server.delete(`${ORIGIN}/`);
    expect((await h.navigate('/')).status).toBe(200);

    const bare = boot('test-2', []);
    bare.server.set(`${ORIGIN}/`, () => net('down', 502));
    expect((await bare.navigate('/')).status).toBe(502);
  });

  it('uses fresh pages when the server answers', async () => {
    h.server.set(`${ORIGIN}/`, () => net('<p>uus</p>'));
    expect(await (await h.navigate('/')).text()).toBe('<p>uus</p>');
  });

  it('leaves the admin panel, the API and the map file to the network', async () => {
    for (const path of ['/admin', '/admin/', '/admin/assets/index-XYZ.js', '/api/me', '/tiles/estonia.pmtiles']) {
      await expect(h.navigate(path), path).rejects.toThrow('not intercepted');
      await expect(h.get(path), path).rejects.toThrow('not intercepted');
    }
    // A game page whose name only starts the same way is still the game's.
    h.server.set(`${ORIGIN}/administraator`, () => net('leht'));
    expect(await (await h.navigate('/administraator')).text()).toBe('leht');
  });

  it('keeps the cached favicon when the server answers 5xx', async () => {
    h.server.set(`${ORIGIN}/favicon.svg`, () => net('down', 502));
    expect(await (await h.get('/favicon.svg')).text()).toBe('file favicon.svg');
  });
});

describe('service worker: precache and pruning', () => {
  it('precaches the lazy in-shift chunk, the MapLibre worker, glyphs and legacy pages at install', async () => {
    const h = boot('v2', PRECACHE);
    serveBuild(h);
    await h.fire('install');
    const statics = await h.caches.open('epd-static-v2');
    for (const p of PRECACHE.filter((x) => !x.startsWith('legacy/'))) expect(await statics.match(new URL(p, `${ORIGIN}/`).href)).toBeTruthy();
    const shell = await h.caches.open('epd-shell-v2');
    expect(await shell.match(`${ORIGIN}/legacy/politseimang-2024.html`)).toBeTruthy();

    // Offline afterwards: the map worker and glyphs come from the cache.
    h.server.clear();
    expect((await h.get('/assets/maplibre-gl-worker-DDD.mjs')).status).toBe(200);
    expect((await h.get('/glyphs/Noto%20Sans%20Regular/0-255.pbf')).status).toBe(200);
  });

  it('copies unchanged hashed files from the old cache, prunes old builds and keeps the previous one', async () => {
    const h = boot('v3', PRECACHE);
    serveBuild(h);
    const ancient = await h.caches.open('epd-static-v1');
    await ancient.put(`${ORIGIN}/assets/index-OLD.js`, net('old'));
    await h.caches.open('epd-shell-v1');
    const previous = await h.caches.open('epd-static-v2');
    await previous.put(`${ORIGIN}/assets/maplibre-gl-worker-DDD.mjs`, net('worker from v2'));
    await previous.put(`${ORIGIN}/assets/GameScreen-PREV.js`, net('chunk of v2'));
    await h.caches.open('someone-else');

    await h.fire('install');
    expect(h.fetched).not.toContain(`${ORIGIN}/assets/maplibre-gl-worker-DDD.mjs`);
    const statics = await h.caches.open('epd-static-v3');
    expect(await (await statics.match(`${ORIGIN}/assets/maplibre-gl-worker-DDD.mjs`))!.text()).toBe('worker from v2');

    await h.fire('activate');
    expect(await h.caches.keys()).toEqual(['epd-static-v2', 'someone-else', 'epd-shell-v3', 'epd-static-v3']);

    // A tab still on build v2 loads its remaining chunk from v2's cache.
    expect(await (await h.get('/assets/GameScreen-PREV.js')).text()).toBe('chunk of v2');
  });
});

describe('build stamping', () => {
  it('lists what the game needs offline and nothing else', () => {
    const files = [
      'index.html',
      'sw.js',
      '404.html',
      'robots.txt',
      'assets/index-A.js',
      'assets/index-A.css',
      'assets/GameScreen-B.js',
      'assets/maplibre-gl-worker-C.mjs',
      'assets/inter-latin-wght-normal-D.woff2',
      'assets/inter-latin-ext-wght-normal-E.woff2',
      'assets/inter-cyrillic-wght-normal-F.woff2',
      'assets/id-ee-G.webp',
      'assets/paper-radar-H.webp',
      'assets/paper-radar-sm-I.webp',
      'glyphs/Noto Sans Regular/0-255.pbf',
      'legacy/politseimang-2025.html',
    ];
    expect(precacheList(files)).toEqual([
      'assets/GameScreen-B.js',
      'assets/id-ee-G.webp',
      'assets/index-A.css',
      'assets/index-A.js',
      'assets/inter-latin-ext-wght-normal-E.woff2',
      'assets/inter-latin-wght-normal-D.woff2',
      'assets/maplibre-gl-worker-C.mjs',
      'glyphs/Noto%20Sans%20Regular/0-255.pbf',
      'legacy/politseimang-2025.html',
    ]);
  });

  it('stamps the version and the list, and refuses a worker whose markers moved', () => {
    const out = stampServiceWorker(SOURCE, '2.0.0-abc', ['assets/a.js']);
    expect(out).toContain(`const VERSION = '2.0.0-abc';`);
    expect(out).toContain(`const PRECACHE = ["assets/a.js"];`);
    expect(() => stampServiceWorker('const X = 1;', 'v', [])).toThrow();
  });

  it('the page also hands the worker the map files a menu-only visit never fetched', () => {
    const urls = offlineMapUrls('/', ORIGIN);
    expect(urls[0]).toMatch(/^https:\/\/politsei\.eu\/.*maplibre-gl-worker.*\.mjs$/);
    expect(urls).toContain(`${ORIGIN}/glyphs/Noto%20Sans%20Regular/256-511.pbf`);
    expect(urls).toHaveLength(10);
    expect(offlineMapUrls('/Estonian-Police-Dispatch/', ORIGIN)[1]).toBe(`${ORIGIN}/Estonian-Police-Dispatch/glyphs/Noto%20Sans%20Regular/0-255.pbf`);
  });
});
