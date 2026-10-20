/**
 * Where incidents happen: a lake place stands for the water itself (its point lies on the lake), so it suits
 * drownings, boats, ice and the border on Peipus, never a crime on land (a cottage burglary showed up in the
 * middle of Ülemiste järv, 2.23.1).
 */
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/data/incidents';

const LAND_ONLY = new Set(['property', 'domestic', 'violence', 'drugs', 'fraud', 'alarm']);

describe('incident places', () => {
  it('keeps land crimes off open water', () => {
    const wet = TEMPLATES.filter((t) => LAND_ONLY.has(t.category) && (t.places ?? []).includes('lake'));
    expect(wet.map((t) => t.id)).toEqual([]);
  });

  it('lights no illegal fire on a lake', () => {
    for (const t of TEMPLATES.filter((x) => /tule|fire/i.test(`${x.title.et} ${x.title.en}`)))
      expect(t.places ?? [], t.id).not.toContain('lake');
  });
});
