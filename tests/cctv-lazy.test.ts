// Kaamerad (docs/CCTV.md section 14): three.js, the renderer, the director and the tile reader load only when a
// camera is first opened. The game's own bundle may import from src/cctv only coverage.ts (the queue and the card
// ask it while drawing) and types; everything else comes through import() of the camera chunk's entry.
// After a build, the last cases read the output too: three.js only in the camera chunk, nothing of the camera in the
// service worker's precache. They need dist/ and are skipped without it, unless CCTV_DIST=1 asks for them (CI runs
// this file once more after its build with that set).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const CCTV = path.join(SRC, 'cctv');

/** The only modules of src/cctv the game's bundle may load up front: small, pure, no package behind them. */
const LIGHT = new Set(['coverage.ts', 'math.ts'].map((f) => path.join(CCTV, f)));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(?:ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name) ? [p] : [];
  });
}

interface Imp {
  spec: string;
  /** `import type` or `export type`: erased by the compiler, loads nothing. */
  typeOnly: boolean;
}

/** The static imports and re-exports of a module (not import(), which is what lazy loading is). */
function staticImports(file: string): Imp[] {
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out: Imp[] = [];
  const re = /(?:^|[\n;])\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|[\n;])\s*import\s+['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(re)) {
    if (m[5]) {
      out.push({ spec: m[5], typeOnly: false });
      continue;
    }
    // `import { type A, type B } from` loads nothing either.
    const names = m[3];
    const allTypes = /^\{[^}]*\}$/.test(names.trim()) && names.replace(/[{}\s]/g, '').split(',').filter(Boolean).every((n) => n.startsWith('type'));
    out.push({ spec: m[4], typeOnly: !!m[2] || allTypes });
  }
  return out;
}

/** Where an import points, as a file, or null for a package. */
function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  base = base.replace(/\?.*$/, '');
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (existsSync(cand) && statSync(cand).isFile()) return cand;
  return base;
}

const DIST = path.join(ROOT, 'dist');
const haveDist = existsSync(path.join(DIST, 'sw.js'));
const needDist = process.env.CCTV_DIST === '1';
const inCctv = (f: string) => f === CCTV || f.startsWith(CCTV + path.sep);
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

describe('the camera chunk stays lazy', () => {
  it('no module outside src/cctv statically imports more of it than coverage.ts and types', () => {
    const bad: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (inCctv(file)) continue;
      for (const imp of staticImports(file)) {
        const to = resolve(file, imp.spec);
        if (!to || !inCctv(to) || imp.typeOnly) continue;
        if (to !== path.join(CCTV, 'coverage.ts')) bad.push(`${rel(file)} imports ${imp.spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('coverage.ts pulls in nothing heavy: only small pure modules, no package', () => {
    const seen = new Set<string>();
    const bad: string[] = [];
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const imp of staticImports(file)) {
        if (imp.typeOnly) continue;
        const to = resolve(file, imp.spec);
        if (!to) bad.push(`${rel(file)} imports the package ${imp.spec}`);
        else if (!LIGHT.has(to)) bad.push(`${rel(file)} imports ${rel(to)}`);
        else walk(to);
      }
    };
    walk(path.join(CCTV, 'coverage.ts'));
    expect(bad).toEqual([]);
  });

  it('the camera window reaches the chunk through import() of its entry', () => {
    const win = readFileSync(path.join(SRC, 'ui/game/CameraWindow.tsx'), 'utf8');
    expect(win).toMatch(/import\(\s*['"]@\/cctv\/live['"]\s*\)/);
    // And the entry is where three.js comes in (through the renderer).
    const entry = staticImports(path.join(CCTV, 'live.ts')).map((i) => i.spec);
    expect(entry).toContain('./render/view');
  });

  it('three.js is imported only by the renderer and the harness pages', () => {
    const allowed = [path.join(CCTV, 'render'), path.join(CCTV, '__dev__')];
    const bad: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (allowed.some((d) => file.startsWith(d + path.sep))) continue;
      for (const imp of staticImports(file)) {
        if (!imp.typeOnly && (imp.spec === 'three' || imp.spec.startsWith('three/'))) bad.push(`${rel(file)} imports ${imp.spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it.runIf(haveDist || needDist)('the build puts three.js in the camera chunk only, and precaches nothing of the camera', () => {
    expect(haveDist).toBe(true);
    const assets = readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
    const cam = assets.filter((f) => f.startsWith('cctv-'));
    expect(cam.length).toBe(1);
    const elsewhere = assets.filter((f) => !f.startsWith('cctv-') && readFileSync(path.join(DIST, 'assets', f), 'utf8').includes('WebGLRenderer'));
    expect(elsewhere).toEqual([]);
    expect(readFileSync(path.join(DIST, 'assets', cam[0]), 'utf8')).toContain('WebGLRenderer');
    const sw = readFileSync(path.join(DIST, 'sw.js'), 'utf8');
    expect(sw).not.toMatch(/cctv-|human-/);
  });

  it('the reader of import statements sees what it must', () => {
    // A guard that reads nothing guards nothing: check it on the game screen, which imports a lot.
    const imps = staticImports(path.join(SRC, 'ui/game/GameScreen.tsx'));
    expect(imps.length).toBeGreaterThan(10);
    expect(imps.some((i) => i.spec === './CameraWindow' && !i.typeOnly)).toBe(true);
    const win = staticImports(path.join(SRC, 'ui/game/CameraWindow.tsx'));
    expect(win.find((i) => i.spec === '@/cctv/live')?.typeOnly).toBe(true);
    expect(win.find((i) => i.spec === '@/cctv/coverage')?.typeOnly).toBe(false);
  });
});
