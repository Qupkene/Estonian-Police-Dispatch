// @vitest-environment jsdom
// Search and link-preview metadata (docs/SEO.md): index.html head and loading splash, JSON-LD, the
// share image, icons, web app manifest, robots.txt, sitemap.xml and the Caddy rules that serve them.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAGES as LANDING, renderAll } from '../scripts/build-landing.mjs';

const SITE = 'https://politsei.eu/';
// Plain paths: under the jsdom environment Vite rewrites `new URL(..., import.meta.url)` to a web URL.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = (p: string) => path.join(REPO, p);
const read = (p: string) => readFileSync(root(p), 'utf8');
const publicFile = (urlPath: string) => root(`public/${urlPath.replace(/^\//, '')}`);

const HTML = read('index.html');
const doc = new DOMParser().parseFromString(HTML, 'text/html');
const head = doc.head;

const meta = (key: string): string | null =>
  head.querySelector(`meta[property="${key}"]`)?.getAttribute('content') ??
  head.querySelector(`meta[name="${key}"]`)?.getAttribute('content') ??
  null;

/** Width, height and colour type from a PNG's IHDR chunk. */
function pngInfo(file: string): { width: number; height: number; colorType: number } {
  const b = readFileSync(file);
  expect(b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  expect(b.toString('ascii', 12, 16)).toBe('IHDR');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}

/** Width and height of a WebP file (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  expect(chunk).toBe('VP8 ');
  return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
}

describe('index.html head', () => {
  it('is Estonian with a search-friendly title and description', () => {
    expect(doc.documentElement.getAttribute('lang')).toBe('et');
    const title = doc.title;
    expect(title.length).toBeGreaterThanOrEqual(50);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.toLowerCase()).toContain('politsei');
    expect(title.toLowerCase()).toMatch(/simulaator|mäng/);
    const description = meta('description')!;
    expect(description.length).toBeGreaterThanOrEqual(150);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toContain('fännimäng');
  });

  it('is indexable with one canonical URL', () => {
    expect(head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(head.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe(SITE);
    const robots = meta('robots')!;
    expect(robots).toMatch(/\bindex\b/);
    expect(robots).toMatch(/\bfollow\b/);
    expect(robots).not.toMatch(/noindex|nofollow/);
    expect(meta('theme-color')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('has complete Open Graph tags', () => {
    expect(meta('og:type')).toBe('website');
    expect(meta('og:url')).toBe(SITE);
    expect(meta('og:site_name')).toBeTruthy();
    expect(meta('og:title')).toBeTruthy();
    expect(meta('og:description')!.length).toBeGreaterThan(50);
    expect(meta('og:locale')).toBe('et_EE');
    expect(meta('og:locale:alternate')).toBe('en_GB');
    expect(meta('og:image')).toBe(`${SITE}og-image.png`);
    expect(meta('og:image:width')).toBe('1200');
    expect(meta('og:image:height')).toBe('630');
    expect(meta('og:image:type')).toBe('image/png');
    expect(meta('og:image:alt')!.length).toBeGreaterThan(20);
  });

  it('has an X/Twitter large image card', () => {
    expect(meta('twitter:card')).toBe('summary_large_image');
    expect(meta('twitter:title')).toBeTruthy();
    expect(meta('twitter:description')).toBeTruthy();
    expect(meta('twitter:image')).toBe(meta('og:image'));
    expect(meta('twitter:image:alt')).toBeTruthy();
  });

  it('uses absolute https URLs on politsei.eu wherever crawlers read a URL', () => {
    const urls = [
      head.querySelector('link[rel="canonical"]')!.getAttribute('href')!,
      meta('og:url')!,
      meta('og:image')!,
      meta('twitter:image')!,
    ];
    for (const u of urls) expect(u.startsWith(SITE), u).toBe(true);
  });

  it('links icons and the manifest to files that exist with the declared sizes', () => {
    const icon = (sel: string) => head.querySelector(sel)?.getAttribute('href') ?? '';
    const png32 = icon('link[rel="icon"][sizes="32x32"]');
    const png192 = icon('link[rel="icon"][sizes="192x192"]');
    const apple = icon('link[rel="apple-touch-icon"]');
    expect(pngInfo(publicFile(png32))).toMatchObject({ width: 32, height: 32 });
    expect(pngInfo(publicFile(png192))).toMatchObject({ width: 192, height: 192 });
    expect(pngInfo(publicFile(apple))).toMatchObject({ width: 180, height: 180 });
    expect(icon('link[rel="icon"][type="image/svg+xml"]')).toBe('/favicon.svg');
    expect(icon('link[rel="manifest"]')).toBe('/manifest.webmanifest');
    // Every root-relative link in the head points at a real file in public/ (Vite adds the base path).
    for (const el of head.querySelectorAll('link[href^="/"]')) {
      expect(existsSync(publicFile(el.getAttribute('href')!)), el.outerHTML).toBe(true);
    }
  });
});

describe('JSON-LD', () => {
  const scripts = [...head.querySelectorAll('script[type="application/ld+json"]')];
  const data = JSON.parse(scripts[0]?.textContent ?? 'null') as {
    '@context': string;
    '@graph': Record<string, unknown>[];
  };
  const types = (n: Record<string, unknown>) => ([] as unknown[]).concat(n['@type']);
  const game = data['@graph'].find((n) => types(n).includes('VideoGame'))!;
  const site = data['@graph'].find((n) => types(n).includes('WebSite'))!;

  it('is one valid schema.org graph', () => {
    expect(scripts).toHaveLength(1);
    expect(data['@context']).toBe('https://schema.org');
    expect(game).toBeTruthy();
    expect(site).toBeTruthy();
    expect(site.url).toBe(SITE);
  });

  it('describes a free browser game with the WebApplication fields', () => {
    expect(types(game)).toContain('WebApplication');
    expect(game.url).toBe(SITE);
    expect(game.image).toBe(`${SITE}og-image.png`);
    expect(String(game.name)).toContain('Eesti Politsei Dispetšer');
    expect(String(game.description).length).toBeGreaterThan(50);
    expect(game.applicationCategory).toBe('GameApplication');
    expect(game.operatingSystem).toBe('Any (web browser)');
    expect(game.isAccessibleForFree).toBe(true);
    expect(game.inLanguage).toEqual(['et', 'en']);
    expect(([] as unknown[]).concat(game.genre)).toContain('Simulation');
    expect(game.offers).toMatchObject({ '@type': 'Offer', price: '0', priceCurrency: 'EUR' });
    expect(game.author).toMatchObject({ name: 'Qupkene' });
    expect(game.creator).toMatchObject({ name: 'Qupkene' });
    // Never invent ratings or reviews.
    expect(game).not.toHaveProperty('aggregateRating');
    expect(game).not.toHaveProperty('review');
  });

  it('uses absolute URLs only, and every politsei.eu file it names exists', () => {
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(data);
    const urls = strings.filter((s) => /^(https?:)?\/\//.test(s) || s.startsWith('/'));
    expect(urls.length).toBeGreaterThan(5);
    for (const u of urls) expect(u, u).toMatch(/^https:\/\//);
    for (const u of urls.filter((s) => s.startsWith(SITE) && /\.(png|webp|svg)$/.test(s))) {
      expect(existsSync(publicFile(new URL(u).pathname)), u).toBe(true);
    }
  });
});

describe('loading splash', () => {
  const rootEl = doc.getElementById('root')!;

  it('shows real text to crawlers that do not run JavaScript', () => {
    expect(rootEl.querySelector('h1')!.textContent).toContain('Eesti Politsei Dispetšer');
    expect(rootEl.textContent).toContain('Laadimine…');
    expect(rootEl.textContent).toContain('Mitteametlik ja tasuta fännimäng');
    expect(rootEl.textContent!.length).toBeGreaterThan(150);
    expect(rootEl.querySelector('[role="status"]')!.textContent).toContain('Laadimine');
    // No web fonts or external files before the bundle: only same-origin images.
    for (const img of rootEl.querySelectorAll('img'))
      expect(existsSync(publicFile(img.getAttribute('src')!))).toBe(true);
    expect(HTML).not.toMatch(/fonts\.googleapis|@import/);
  });

  it('keeps the noscript note and the entry script', () => {
    const noscript = doc.querySelector('body noscript')!;
    expect(noscript.textContent).toMatch(/JavaScript/);
    expect(noscript.textContent!.length).toBeGreaterThan(60);
    expect(HTML).toContain('<script type="module" src="/src/main.tsx"></script>');
  });
});

describe('share image and icons', () => {
  it('og-image.png is a 1200x630 PNG small enough for WhatsApp previews', () => {
    expect(pngInfo(root('public/og-image.png'))).toMatchObject({ width: 1200, height: 630 });
    // The task limit is 600 kB; WhatsApp skips preview images above roughly 300 kB.
    expect(statSync(root('public/og-image.png')).size).toBeLessThan(300 * 1024);
  });

  it('PNG icons have the right sizes; maskable and Apple icons are opaque', () => {
    const sizes: Record<string, number> = {
      'icon-32': 32,
      'icon-192': 192,
      'icon-512': 512,
      'maskable-512': 512,
      'apple-touch-icon': 180,
    };
    for (const [name, size] of Object.entries(sizes)) {
      const info = pngInfo(root(`public/icons/${name}.png`));
      expect(info, name).toMatchObject({ width: size, height: size });
      // Colour type 2 = RGB without alpha: the platform crops or rounds these, so no transparent corners.
      if (name === 'maskable-512' || name === 'apple-touch-icon') expect(info.colorType, name).toBe(2);
    }
  });
});

describe('manifest.webmanifest', () => {
  const MANIFEST_URL = `${SITE}manifest.webmanifest`;
  const m = JSON.parse(read('public/manifest.webmanifest')) as {
    id: string;
    name: string;
    short_name: string;
    description: string;
    lang: string;
    start_url: string;
    scope: string;
    display: string;
    theme_color: string;
    background_color: string;
    categories: string[];
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
    screenshots: { src: string; sizes: string; type: string; form_factor?: string; label?: string }[];
  };

  it('identifies the app at the site root', () => {
    // id resolves against the start URL's origin, start_url and scope against the manifest URL.
    expect(new URL(m.id, new URL(m.start_url, MANIFEST_URL).origin).href).toBe(SITE);
    expect(new URL(m.start_url, MANIFEST_URL).href).toBe(SITE);
    expect(new URL(m.scope, MANIFEST_URL).href).toBe(SITE);
    expect(m.name).toContain('Eesti Politsei Dispetšer');
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    expect(m.description).toContain('fännimäng');
    expect(m.lang).toBe('et');
    expect(m.display).toBe('standalone');
    expect(m.theme_color).toBe(meta('theme-color'));
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.categories).toEqual(expect.arrayContaining(['games', 'simulation']));
  });

  it('lists PNG icons (any + maskable) and the SVG, all present with the declared sizes', () => {
    const find = (sizes: string, purpose: string) =>
      m.icons.find(
        (i) =>
          i.sizes === sizes && i.type === 'image/png' && (i.purpose ?? 'any').split(' ').includes(purpose),
      );
    expect(find('192x192', 'any')).toBeTruthy();
    expect(find('512x512', 'any')).toBeTruthy();
    expect(find('512x512', 'maskable')).toBeTruthy();
    expect(m.icons.some((i) => i.type === 'image/svg+xml' && i.sizes === 'any')).toBe(true);
    for (const i of m.icons) {
      const file = publicFile(new URL(i.src, MANIFEST_URL).pathname);
      expect(existsSync(file), i.src).toBe(true);
      if (i.type === 'image/png') {
        const [w, h] = i.sizes.split('x').map(Number);
        expect(pngInfo(file), i.src).toMatchObject({ width: w, height: h });
      }
    }
  });

  it('has wide and phone screenshots for the richer install dialog', () => {
    expect(m.screenshots.filter((s) => s.form_factor === 'wide').length).toBeGreaterThanOrEqual(2);
    expect(m.screenshots.filter((s) => s.form_factor === 'narrow').length).toBeGreaterThanOrEqual(1);
    for (const s of m.screenshots) {
      expect(['wide', 'narrow']).toContain(s.form_factor);
      expect(s.label!.length).toBeGreaterThan(10);
      expect(s.type).toBe('image/webp');
      const file = publicFile(new URL(s.src, MANIFEST_URL).pathname);
      const [w, h] = s.sizes.split('x').map(Number);
      expect(webpSize(file), s.src).toEqual({ width: w, height: h });
      expect(statSync(file).size).toBeLessThan(400 * 1024);
    }
  });
});

describe('robots.txt and sitemap.xml', () => {
  it('robots.txt allows the site, keeps crawlers off the API and names the sitemap', () => {
    const lines = read('public/robots.txt')
      .split(/\r?\n/)
      .map((l) => l.trim());
    expect(lines).toContain('User-agent: *');
    expect(lines).toContain('Allow: /');
    expect(lines).toContain('Disallow: /api/');
    expect(lines).not.toContain('Disallow: /');
    expect(lines).toContain(`Sitemap: ${SITE}sitemap.xml`);
  });

  it('sitemap.xml lists the game, the landing pages and the two legacy pages with valid dates', () => {
    const xml = read('public/sitemap.xml');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(parsed.documentElement.namespaceURI).toBe('http://www.sitemaps.org/schemas/sitemap/0.9');
    const entries = [...parsed.getElementsByTagName('url')].map((u) => ({
      loc: u.getElementsByTagName('loc')[0]?.textContent ?? '',
      lastmod: u.getElementsByTagName('lastmod')[0]?.textContent ?? '',
    }));
    expect(entries.map((e) => e.loc).sort()).toEqual(
      [
        SITE,
        ...LANDING.map((p) => `${SITE}${p.slug}/`),
        `${SITE}legacy/politseimang-2024.html`,
        `${SITE}legacy/politseimang-2025.html`,
      ].sort(),
    );
    for (const e of entries) {
      expect(e.lastmod, e.loc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(e.lastmod))).toBe(false);
      const path = new URL(e.loc).pathname;
      expect(
        existsSync(
          path === '/' ? root('index.html') : publicFile(path.endsWith('/') ? `${path}index.html` : path),
        ),
        e.loc,
      ).toBe(true);
    }
  });
});

describe('Caddyfile', () => {
  const caddy = read('deploy/mainserver/Caddyfile');
  const block = (opener: string) => {
    const start = caddy.indexOf(opener);
    expect(start, opener).toBeGreaterThan(-1);
    return caddy.slice(start, caddy.indexOf('\n\t}', start));
  };

  it('marks API responses noindex', () => {
    expect(block('handle /api/* {')).toMatch(/header X-Robots-Tag "noindex"/);
  });

  it('serves robots, sitemap and images as real files with a cache lifetime, before the SPA fallback', () => {
    expect(caddy).toMatch(/@seo path \/robots\.txt \/sitemap\.xml/);
    expect(caddy).toMatch(/@pildid path \/og-image\.png \/icons\/\* \/screenshots\/\*/);
    const seo = block('handle @seo {');
    const images = block('handle @pildid {');
    expect(seo).toContain('Cache-Control "public, max-age=3600"');
    expect(images).toContain('Cache-Control "public, max-age=86400"');
    for (const b of [seo, images]) {
      expect(b).toContain('file_server');
      expect(b).not.toContain('try_files');
    }
    expect(caddy.indexOf('handle @seo {')).toBeLessThan(
      caddy.indexOf('try_files {path} {path}index.html /index.html'),
    );
  });
});

describe('owner rules', () => {
  it('no em or en dashes in the SEO files', () => {
    const banned = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);
    const files = [
      'index.html',
      'public/robots.txt',
      'public/sitemap.xml',
      'public/manifest.webmanifest',
      'public/og-image.svg',
      'public/favicon.svg',
      'deploy/mainserver/Caddyfile',
      'docs/SEO.md',
      'tests/seo.test.ts',
      'scripts/build-landing.mjs',
    ];
    for (const f of files) expect(banned.test(read(f)), f).toBe(false);
  });
});

describe('landing pages (scripts/build-landing.mjs)', () => {
  it('are generated from the script (run `node scripts/build-landing.mjs` after a change)', () => {
    for (const { path: file, html } of renderAll()) expect(read(file), file).toBe(html);
  });

  for (const page of LANDING) {
    describe(`/${page.slug}/`, () => {
      const html = read(`public/${page.slug}/index.html`);
      const d = new DOMParser().parseFromString(html, 'text/html');
      const m = (k: string) =>
        d.head.querySelector(`meta[property="${k}"]`)?.getAttribute('content') ??
        d.head.querySelector(`meta[name="${k}"]`)?.getAttribute('content') ??
        null;

      it('has its own title, description, canonical URL and one heading', () => {
        expect(d.documentElement.getAttribute('lang')).toBe(page.lang);
        expect(d.title.length).toBeGreaterThanOrEqual(30);
        expect(d.title.length).toBeLessThanOrEqual(60);
        expect(m('description')!.length).toBeGreaterThanOrEqual(120);
        expect(m('description')!.length).toBeLessThanOrEqual(160);
        expect(d.head.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe(
          `${SITE}${page.slug}/`,
        );
        expect(m('og:url')).toBe(`${SITE}${page.slug}/`);
        expect(m('robots')).toMatch(/^index, follow/);
        expect(d.querySelectorAll('h1')).toHaveLength(1);
        expect(d.body.textContent!.length).toBeGreaterThan(1200);
        // The disclaimer is on every page, and the way into the game.
        expect(d.querySelector('footer')!.textContent).toMatch(/fännimäng|fan game/);
        expect([...d.querySelectorAll('a.btn--primary')].map((a) => a.getAttribute('href'))).toContain('/');
      });

      it('has valid structured data and links that resolve', () => {
        const ld = JSON.parse(d.querySelector('script[type="application/ld+json"]')!.textContent!);
        const types = ld['@graph'].map((n: { '@type': string }) => n['@type']);
        expect(types).toEqual(expect.arrayContaining(['WebPage', 'BreadcrumbList']));
        for (const a of d.querySelectorAll('a[href^="/"]')) {
          const href = a.getAttribute('href')!;
          const file =
            href === '/' ? root('index.html') : publicFile(href.endsWith('/') ? `${href}index.html` : href);
          expect(existsSync(file), href).toBe(true);
        }
        for (const img of d.querySelectorAll('img')) {
          expect(img.getAttribute('alt')!.length).toBeGreaterThan(10);
          expect(existsSync(publicFile(img.getAttribute('src')!)), img.getAttribute('src')!).toBe(true);
        }
        // hreflang pairs point both ways.
        for (const alt of d.head.querySelectorAll('link[rel="alternate"][hreflang]')) {
          const target = alt.getAttribute('href')!;
          const other = read(`public${new URL(target).pathname}index.html`);
          expect(other, target).toContain(`href="${SITE}${page.slug}/"`);
        }
      });

      it('never uses the dash characters the owner does not want', () => {
        expect(html).not.toMatch(
          new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`),
        );
      });
    });
  }
});
