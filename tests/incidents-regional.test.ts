/**
 * Regional stories (src/data/incidents/regional/): each prefecture gets calls that only happen there. Every
 * template belongs to exactly one prefecture, can spawn there (its place kinds exist in that prefecture's data),
 * passes the same checks as the other hand-written incident files (tests/fixtures/incidentSuite.ts), and together
 * they make up a noticeable but modest share of each prefecture's calls (each story stays rare at its place).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/data/incidents';
import { TEMPLATES_REGIONAL, TEMPLATES_REGIONAL_BY_REGION } from '@/data/incidents/regional';
import { REGIONS } from '@/data/regions';
import { hourCurve } from '@/sim/calendar';
import { createShift } from '@/sim/engine';
import { placeAvailability, templateWeight } from '@/sim/spawner';
import { tallinnTime } from '@/sim/time';
import type { RegionId } from '@/sim/types';
import { DASHES, incidentSuite } from './fixtures/incidentSuite';

const ALL_REGIONS = Object.keys(TEMPLATES_REGIONAL_BY_REGION) as RegionId[];
/** EPD_REGION=ida checks one prefecture's set alone (while it is being written). */
const ONLY = process.env.EPD_REGION as RegionId | undefined;
const REGION_IDS = ONLY ? [ONLY] : ALL_REGIONS;
const IDS = new Set(TEMPLATES_REGIONAL.map((t) => t.id));
/** Calls a prefecture gets at least, and how many of them a Russian-speaking caller can tell with the story's own lines. */
const MIN_PER_REGION = 10;
const MIN_RUSSIAN: Record<RegionId, number> = { ida: 5, pohja: 3, louna: 1, laane: 0 };

const seasonOf = (month: number) => (month <= 2 || month === 12 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn');

describe('regional stories: catalogue', () => {
  it('gives every prefecture its own set, with unique ids that clash with nothing else', () => {
    expect([...ALL_REGIONS].sort()).toEqual(['ida', 'laane', 'louna', 'pohja']);
    expect(IDS.size).toBe(TEMPLATES_REGIONAL.length);
    const global = TEMPLATES.map((t) => t.id);
    for (const id of IDS) expect(global.filter((g) => g === id).length, `id ${id} in TEMPLATES`).toBe(1);
    for (const r of REGION_IDS) {
      const list = TEMPLATES_REGIONAL_BY_REGION[r];
      expect(list.length, r).toBeGreaterThanOrEqual(MIN_PER_REGION);
      for (const t of list) {
        expect(t.id, t.id).toMatch(/^[a-z_]+$/);
        expect(t.id.startsWith(`${t.category}_`), `${t.id} must start with ${t.category}_`).toBe(true);
        expect(t.regions, `${t.id} belongs to ${r} only`).toEqual([r]);
        expect(t.easterEgg ?? false, t.id).toBe(false);
      }
    }
  });

  it('can spawn every story in its prefecture, at every place kind it names', () => {
    for (const r of REGION_IDS) {
      const region = REGIONS[r];
      const s = createShift({ seed: 5, regionId: r, mode: 'director', difficulty: 'normal', start: tallinnTime(2026, 7, 15, 12, 0), hours: 4, playerName: 'Test' });
      for (const t of TEMPLATES_REGIONAL_BY_REGION[r]) {
        // No dead place kinds: each one is in the prefecture's data or generated (a forest, a village).
        for (const k of t.places) expect(placeAvailability(region, [k]), `${t.id}: no ${k} in ${r}`).toBe(1);
        const months = t.months?.length ? t.months : [1, 4, 7, 10];
        const can = months.some((month) =>
          Array.from({ length: 24 }, (_, hour) => hour).some(
            (hour) => templateWeight(s, t, { hour, weekday: 2, month, season: seasonOf(month), weekendNight: false, trafficF: 1, wet: false, dayTags: [] }) > 0,
          ),
        );
        expect(can, `${t.id} never spawns in ${r}`).toBe(true);
      }
    }
  });

  it('mixes kinds of calls, seasons and urgencies in every prefecture', () => {
    for (const r of REGION_IDS) {
      const list = TEMPLATES_REGIONAL_BY_REGION[r];
      expect(new Set(list.map((t) => t.category)).size, `${r}: categories`).toBeGreaterThanOrEqual(4);
      expect(list.filter((t) => t.escalation).length, `${r}: escalating stories`).toBeGreaterThanOrEqual(3);
      expect(list.filter((t) => t.priority <= 2).length, `${r}: urgent calls`).toBeGreaterThanOrEqual(2);
      expect(list.filter((t) => t.priority >= 3).length, `${r}: everyday calls`).toBeGreaterThanOrEqual(4);
      // Most can happen any time of the year, a few belong to a season.
      expect(list.filter((t) => !t.months?.length && !t.seasons?.length).length, `${r}: year-round stories`).toBeGreaterThanOrEqual(5);
      expect(list.filter((t) => t.months?.length || t.seasons?.length).length, `${r}: seasonal stories`).toBeGreaterThanOrEqual(2);
      expect(list.filter((t) => (t.call?.openingRu?.length ?? 0) > 0).length, `${r}: Russian call scripts`).toBeGreaterThanOrEqual(MIN_RUSSIAN[r]);
    }
    if (!ONLY) expect(new Set(TEMPLATES_REGIONAL.map((t) => t.category)).size).toBeGreaterThanOrEqual(8);
  });

  it('never uses en or em dashes in the source files', () => {
    for (const f of readdirSync('src/data/incidents/regional')) {
      const src = readFileSync(`src/data/incidents/regional/${f}`, 'utf8');
      expect(DASHES.test(src), f).toBe(false);
    }
  });
});

incidentSuite('regional stories', ONLY ? TEMPLATES_REGIONAL_BY_REGION[ONLY] : TEMPLATES_REGIONAL);

// ─────────────────────────────────────────────────────────────────────────────
// Balance: a prefecture feels like itself without its stories taking over
// ─────────────────────────────────────────────────────────────────────────────

describe('regional stories: share of calls', () => {
  for (const r of REGION_IDS) {
    it(`make up a noticeable, modest share of the calls in ${r}`, () => {
      const s = createShift({ seed: 3, regionId: r, mode: 'director', difficulty: 'normal', start: tallinnTime(2026, 7, 15, 12, 0), hours: 4, playerName: 'Test' });
      let mine = 0;
      let all = 0;
      for (let month = 1; month <= 12; month++) {
        for (let hour = 0; hour < 24; hour++) {
          // Calls arrive at the hour curve's rate; a week has two weekend nights.
          const rate = hourCurve(hour + 0.5);
          for (const weekendNight of [false, true]) {
            const share = weekendNight ? (hour >= 18 || hour < 6 ? 2 / 7 : 0) : hour >= 18 || hour < 6 ? 5 / 7 : 1;
            if (!share) continue;
            const ctx = { hour, weekday: 2, month, season: seasonOf(month), weekendNight, trafficF: 1, wet: false, dayTags: [] as string[] };
            for (const tpl of TEMPLATES) {
              if (tpl.easterEgg) continue;
              const w = templateWeight(s, tpl, ctx) * rate * share;
              all += w;
              if (IDS.has(tpl.id)) mine += w;
            }
          }
        }
      }
      const share = mine / all;
      if (process.env.EPD_BALANCE_LOG) console.log(`[regional] ${r}: share of spawn weight ${(share * 100).toFixed(1)} %`);
      // About one call in sixteen. Most stories happen at one or two real places, so each one stays rare.
      expect(share).toBeGreaterThan(0.04);
      expect(share).toBeLessThan(0.14);
    });
  }
});
