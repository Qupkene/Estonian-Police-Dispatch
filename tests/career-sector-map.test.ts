// The career screens' small SVG map of a prefecture's sectors (src/ui/screens/career/sectors.ts) on the real
// sector data: every sector drawn, and the city sectors that are only a few pixels wide magnified in an inset.
import { describe, expect, it } from 'vitest';
import { sectorsOf } from '@/sim/sectors';
import { sectorMapGeometry } from '@/ui/screens/career/sectors';
import type { RegionId } from '@/sim/types';

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe.skipIf(!sectorsOf('louna').length)('the sector map of a prefecture', () => {
  for (const regionId of ['pohja', 'ida', 'louna', 'laane'] as RegionId[]) {
    it(`${regionId}: draws every sector and keeps the inset inside the drawing, off the city`, () => {
      const g = sectorMapGeometry(regionId, 320);
      expect(new Set(g.shapes.map((x) => x.id))).toEqual(new Set(sectorsOf(regionId).map((x) => x.id)));
      for (let i = 1; i < g.shapes.length; i++) expect(g.shapes[i - 1].area).toBeGreaterThanOrEqual(g.shapes[i].area);
      if (!g.inset) return;
      const { box, frame, ids, shapes } = g.inset;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(g.width);
      expect(box.y + box.h).toBeLessThanOrEqual(g.height);
      expect(overlaps(box, frame)).toBe(false);
      // A magnified sector is labelled in the inset only.
      for (const id of ids) {
        expect(g.shapes.filter((x) => x.id === id).every((x) => x.label === null), id).toBe(true);
        const s = shapes.find((x) => x.id === id && x.label);
        expect(s, id).toBeDefined();
        expect(s!.label![0]).toBeGreaterThan(box.x);
        expect(s!.label![0]).toBeLessThan(box.x + box.w);
        expect(s!.label![1]).toBeGreaterThan(box.y);
        expect(s!.label![1]).toBeLessThan(box.y + box.h);
      }
    });
  }

  it('magnifies Tallinn, Tartu and Pärnu, not Narva', () => {
    expect(sectorMapGeometry('pohja').inset?.ids.sort()).toEqual(['pohja-kesklinn', 'pohja-laanetallinn', 'pohja-lasnamae']);
    expect(sectorMapGeometry('louna').inset?.ids).toEqual(['louna-tartu']);
    expect(sectorMapGeometry('laane').inset?.ids).toEqual(['laane-parnu']);
    expect(sectorMapGeometry('ida').inset).toBeNull();
    // The county around the city shows in the inset too, unlabelled.
    expect(sectorMapGeometry('louna').inset!.shapes.some((x) => x.id === 'louna-tartumaa' && !x.label)).toBe(true);
  });
});
