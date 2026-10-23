// The newspaper's photo: the drawings' registry and the pick per report (src/ui/screens/shell/paper/drawings.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IncidentCategory } from '@/sim/types';
import {
  DRAWING_FILES,
  DRAWINGS,
  drawingForPaper,
  drawingSrc,
  pickDrawing,
  type Drawing,
} from '@/ui/screens/shell/paper/drawings';

const DIR = join(__dirname, '..', 'src', 'ui', 'screens', 'shell', 'paper');

// Every incident category (a compile error here when one is added), then the other topics of buildNewspaper.
const CATEGORIES: Record<IncidentCategory, true> = {
  violence: true,
  domestic: true,
  property: true,
  traffic: true,
  public_order: true,
  drugs: true,
  missing: true,
  alarm: true,
  assist: true,
  major: true,
  border: true,
  environment: true,
  fraud: true,
  easter: true,
};
const TOPICS = [...Object.keys(CATEGORIES), 'pursuit', 'quiet', 'busy', 'holiday', 'night'];

/** Width and height of a WebP file (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(file: string): [number, number] {
  const b = readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  expect(chunk).toBe('VP8 ');
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const d = (id: string, tags: string[] = []): Drawing => ({
  id,
  w: 800,
  h: 600,
  alt: { et: id, en: id },
  tags,
});

describe('the drawings', () => {
  it('each has its two files, the right size, and each file has its line', () => {
    expect(DRAWINGS.length).toBeGreaterThanOrEqual(3);
    const ids = DRAWINGS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    const want = ids.flatMap((id) => [`paper-${id}.webp`, `paper-${id}-sm.webp`]).sort();
    expect([...DRAWING_FILES].sort()).toEqual(want);
    for (const x of DRAWINGS) {
      expect(webpSize(join(DIR, `paper-${x.id}.webp`)), x.id).toEqual([x.w, x.h]);
      expect(webpSize(join(DIR, `paper-${x.id}-sm.webp`))[0], x.id).toBe(480);
      const { src, srcSet } = drawingSrc(x);
      expect(src).toMatch(new RegExp(`paper-${x.id}-sm\\.webp`));
      expect(srcSet).toMatch(new RegExp(`paper-${x.id}-sm\\.webp 480w, .*paper-${x.id}\\.webp ${x.w}w$`));
    }
  });

  it('have short alt texts in both languages and only known tags', () => {
    for (const x of DRAWINGS) {
      for (const t of [x.alt.et, x.alt.en]) {
        expect(t.length, x.id).toBeGreaterThan(8);
        expect(t.length, x.id).toBeLessThan(70);
        expect(t, x.id).not.toMatch(/[\u2013\u2014.]$/);
      }
      expect(x.tags.length, x.id).toBeGreaterThan(0);
      for (const t of x.tags) expect(TOPICS, `${x.id}: ${t}`).toContain(t);
    }
  });

  it('cover every lead story category but the easter eggs, and a chase', () => {
    const tagged = new Set(DRAWINGS.flatMap((x) => x.tags));
    for (const c of [...Object.keys(CATEGORIES).filter((c) => c !== 'easter'), 'pursuit']) {
      expect(tagged.has(c), c).toBe(true);
    }
  });
});

describe('pickDrawing', () => {
  const list = [d('a', ['traffic']), d('b', ['traffic', 'pursuit']), d('c', ['night']), d('e'), d('f')];

  it('is stable for one report and varies between reports', () => {
    expect(pickDrawing(list, 'seed:1')).toBe(pickDrawing(list, 'seed:1'));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => pickDrawing(list, `seed:${i}`)!.id));
    expect(seen.size).toBe(list.length);
  });

  it('prefers a drawing for the lead story, the first topic that has one', () => {
    for (let i = 0; i < 50; i++) {
      expect(['a', 'b']).toContain(pickDrawing(list, `k${i}`, ['traffic'])!.id);
      expect(pickDrawing(list, `k${i}`, ['pursuit', 'traffic'])!.id).toBe('b');
      expect(pickDrawing(list, `k${i}`, ['border', 'night'])!.id).toBe('c');
    }
  });

  it('skips the drawings shown last while another is left', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickDrawing(list, `k${i}`, ['pursuit'], ['b'])!.id).not.toBe('b');
      expect(pickDrawing(list, `k${i}`, ['traffic'], ['a'])!.id).toBe('b');
      expect(['e', 'f', 'c']).toContain(pickDrawing(list, `k${i}`, [], ['a', 'b'])!.id);
      // Both traffic drawings shown lately: the one before the last rather than an unrelated one.
      expect(pickDrawing(list, `k${i}`, ['traffic'], ['a', 'b'])!.id).toBe('b');
    }
    expect(pickDrawing([d('only')], 'k', [], ['only'])!.id).toBe('only');
    // All shown lately: at least not the very last one.
    expect(pickDrawing([d('x'), d('y')], 'k', [], ['x', 'y'])!.id).toBe('y');
    expect(pickDrawing([], 'k')).toBeUndefined();
  });
});

describe('drawingForPaper', () => {
  it('keeps a report’s drawing and never repeats the previous one on the next report', () => {
    const store = memory();
    let last = '';
    for (let i = 0; i < 40; i++) {
      const topics = i % 3 === 0 ? ['traffic'] : i % 3 === 1 ? ['quiet', 'night'] : ['violence'];
      const pick = drawingForPaper(`seed${i}:start`, topics, store)!;
      expect(pick.id).not.toBe(last);
      expect(drawingForPaper(`seed${i}:start`, topics, store)).toBe(pick);
      last = pick.id;
    }
    // A traffic story after two other pictures gets a traffic drawing.
    const other = DRAWINGS.filter((x) => !x.tags.includes('traffic')).slice(0, 2);
    const fresh = memory();
    fresh.setItem('epd:paperDrawings', JSON.stringify(other.map((x, n) => ({ k: `old${n}`, id: x.id }))));
    expect(drawingForPaper('next:start', ['traffic'], fresh)!.tags).toContain('traffic');
    // The memory stays small.
    expect(JSON.parse(store.getItem('epd:paperDrawings')!).length).toBeLessThanOrEqual(12);
  });

  it('works without storage and over damaged memory', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(drawingForPaper('a:1', ['traffic'], broken)).toBe(pickDrawing(DRAWINGS, 'a:1', ['traffic']));
    const store = memory();
    store.setItem('epd:paperDrawings', '{"not":"a list"}');
    expect(drawingForPaper('a:1', [], store)).toBeDefined();
    store.setItem('epd:paperDrawings', JSON.stringify([{ k: 'a:2', id: 'gone' }, null, 3]));
    expect(DRAWINGS).toContain(drawingForPaper('a:2', [], store));
  });
});
