/**
 * Escalating stories (src/data/incidents/escalating.ts and stories.ts): every template passes the
 * same validators as the other incident files, spawns and plays to a valid ending with a headless
 * dispatcher, and its escalation fires when the dispatcher is slow but not when a unit is on scene
 * in time (the shared checks: tests/fixtures/incidentSuite.ts).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/data/incidents';
import { TEMPLATES_ESCALATING } from '@/data/incidents/escalating';
import { TEMPLATES_STORIES } from '@/data/incidents/stories';
import { hourCurve } from '@/sim/calendar';
import { createShift } from '@/sim/engine';
import { templateWeight } from '@/sim/spawner';
import { tallinnTime } from '@/sim/time';
import type { IncidentTemplate, RegionId } from '@/sim/types';
import { DASHES, incidentSuite } from './fixtures/incidentSuite';

const NEW: IncidentTemplate[] = [...TEMPLATES_ESCALATING, ...TEMPLATES_STORIES];
const NEW_IDS = new Set(NEW.map((t) => t.id));

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────────────────────

describe('escalating stories: catalogue', () => {
  it('ships about 35 templates with unique ids that clash with nothing else', () => {
    expect(NEW.length).toBeGreaterThanOrEqual(35);
    expect(NEW_IDS.size).toBe(NEW.length);
    const global = TEMPLATES.map((t) => t.id);
    for (const id of NEW_IDS) expect(global.filter((g) => g === id).length, `id ${id} in TEMPLATES`).toBe(1);
    for (const t of NEW) {
      expect(t.id, t.id).toMatch(/^[a-z_]+$/);
      expect(t.id.startsWith(`${t.category}_`), `${t.id} must start with ${t.category}_`).toBe(true);
    }
  });

  it('mixes priorities and mostly escalates', () => {
    const by = (p: number) => NEW.filter((t) => t.priority === p).length;
    expect(by(1)).toBeGreaterThanOrEqual(2);
    expect(by(2) + by(3)).toBeGreaterThanOrEqual(25);
    expect(by(4)).toBeGreaterThanOrEqual(1);
    expect(NEW.filter((t) => t.escalation).length).toBeGreaterThanOrEqual(25);
    // Several stories also turn on scene when the dispatcher is slow with backup.
    expect(NEW.filter((t) => (t.beats ?? []).some((b) => b.kind === 'backup' && b.failEffects.escalate)).length).toBeGreaterThanOrEqual(2);
    // Spread over the country and the year: seasonal, island/coast and eastern stories.
    expect(NEW.filter((t) => t.months?.length).length).toBeGreaterThanOrEqual(12);
    expect(NEW.filter((t) => t.regions?.length).length).toBeGreaterThanOrEqual(5);
    expect(NEW.filter((t) => (t.call?.openingRu?.length ?? 0) > 0).length).toBeGreaterThanOrEqual(25);
  });

  it('never uses en or em dashes in the source files', () => {
    for (const f of ['src/data/incidents/escalating.ts', 'src/data/incidents/stories.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(DASHES.test(src), f).toBe(false);
    }
  });
});

incidentSuite('escalating stories', NEW);

// ─────────────────────────────────────────────────────────────────────────────
// Balance: a fresh share of the calls, not a takeover
// ─────────────────────────────────────────────────────────────────────────────

describe('escalating stories: share of calls', () => {
  it('make up a healthy share of all spawn weight across the year and the prefectures', () => {
    let mine = 0;
    let all = 0;
    for (const regionId of ['pohja', 'ida', 'louna', 'laane'] as RegionId[]) {
      const s = createShift({ seed: 3, regionId, mode: 'director', difficulty: 'normal', start: tallinnTime(2026, 7, 15, 12, 0), hours: 4, playerName: 'Test' });
      for (let month = 1; month <= 12; month++) {
        const season = month <= 2 || month === 12 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn';
        for (let hour = 0; hour < 24; hour++) {
          // Calls arrive at the hour curve's rate; a week has two weekend nights.
          const rate = hourCurve(hour + 0.5);
          for (const weekendNight of [false, true]) {
            const share = weekendNight ? (hour >= 18 || hour < 6 ? 2 / 7 : 0) : hour >= 18 || hour < 6 ? 5 / 7 : 1;
            if (!share) continue;
            const ctx = { hour, weekday: 2, month, season, weekendNight, trafficF: 1, wet: false, dayTags: [] as string[] };
            for (const tpl of TEMPLATES) {
              if (tpl.easterEgg) continue;
              const w = templateWeight(s, tpl, ctx) * rate * share;
              all += w;
              if (NEW_IDS.has(tpl.id)) mine += w;
            }
          }
        }
      }
    }
    const share = mine / all;
    if (process.env.EPD_BALANCE_LOG) console.log(`[escalating] share of spawn weight: ${(share * 100).toFixed(1)} %`);
    // About a sixth of the calls today; other content added later only lowers it.
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.24);
  });
});
