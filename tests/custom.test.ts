import { describe, expect, it } from 'vitest';
import {
  budgetOf,
  CREW_SIZE,
  costOf,
  defaultSetup,
  draftPool,
  expandCustom,
  fillDesks,
  fitFactor,
  parseCustom,
  POOL_SIZE,
  stationsFor,
  typesFor,
  type CustomSetup,
} from '@/sim/custom';
import { createShift } from '@/sim/engine';
import { initCoop } from '@/sim/coop';
import { sectorsOf } from '@/sim/sectors';
import type { NewShiftOptions } from '@/sim/types';

const START = Date.UTC(2026, 9, 17, 4, 0);
const opts = (over: Partial<NewShiftOptions> = {}): NewShiftOptions => ({
  seed: 7,
  regionId: 'pohja',
  mode: 'free',
  difficulty: 'normal',
  start: START,
  hours: 8,
  playerName: 'Test',
  ...over,
});

describe('custom game (src/sim/custom.ts)', () => {
  it('draws the same draft pool for everyone', () => {
    const a = draftPool('louna');
    expect(a).toHaveLength(POOL_SIZE);
    expect(new Set(a.map((o) => o.badge)).size).toBe(POOL_SIZE);
    expect(a.every((o, i) => o.index === i && o.cost > 0 && o.skill > 0)).toBe(true);
    expect(a.some((o) => o.specialty === 'heli')).toBe(true);
    expect(a.some((o) => o.specialty === 'boat')).toBe(true);
    expect(draftPool('pohja').some((o) => o.specialty === 'boat')).toBe(false);
    expect(JSON.stringify(draftPool('louna'))).toBe(JSON.stringify(a));
  });

  it('offers the unit types the area can field', () => {
    expect(typesFor('pohja', [])).not.toContain('boat');
    expect(typesFor('laane', [])).toContain('boat');
    // Heli and K-komando answer for the whole prefecture: available in any area.
    const one = [sectorsOf('louna')[0].id];
    expect(typesFor('louna', one)).toEqual(expect.arrayContaining(['heli', 'special', 'patrol']));
    expect(stationsFor('pohja', ['pohja-kesklinn'], 'patrol').length).toBeGreaterThan(0);
  });

  it('the standard preset is the usual force and the budget is its cost', () => {
    const d = defaultSetup('pohja', []);
    const base = createShift(opts());
    expect(d.crews.length).toBe(base.unitOrder.length);
    expect(budgetOf('pohja', [])).toBe(costOf('pohja', d));
    // A smaller area has a smaller budget.
    expect(budgetOf('pohja', ['pohja-kesklinn'])).toBeLessThan(budgetOf('pohja', []));
  });

  it('staffs crews with the drafted officers at their fit', () => {
    const pool = draftPool('pohja');
    const k9Pro = pool.find((o) => o.specialty === 'k9')!;
    const patrolGuy = pool.find((o) => o.specialty === 'patrol')!;
    const hq = stationsFor('pohja', [], 'patrol')[0].id;
    const setup: CustomSetup = {
      crews: [
        ['k9', hq, k9Pro.index, patrolGuy.index],
        ['patrol', hq],
        ['heli', stationsFor('pohja', [], 'heli')[0].id],
      ],
    };
    const roster = expandCustom('pohja', setup, 'day');
    expect(roster).toHaveLength(3);
    expect(roster[0].crew.map((o) => o.badge)).toEqual([k9Pro.badge, patrolGuy.badge]);
    expect(roster[0].crew[0].skill).toBeCloseTo(k9Pro.skill, 2);
    expect(roster[0].crew[1].skill).toBeCloseTo(patrolGuy.skill * fitFactor('patrol', 'k9'), 2);
    expect(roster[1].crew).toEqual([]);
    expect(roster[1].crewN).toBe(CREW_SIZE.patrol.auto);
    expect(roster[2]).toMatchObject({ type: 'heli', onCall: true, crewN: 4 });
    expect(new Set(roster.map((u) => u.callsign)).size).toBe(3);
  });

  it('a shift from a setup has exactly that force and is marked custom', () => {
    const hq = stationsFor('pohja', [], 'patrol')[0].id;
    const pool = draftPool('pohja');
    const s = createShift(
      opts({
        custom: {
          crews: [
            ['patrol', hq, pool[0].index, pool[1].index],
            ['patrol', hq],
            ['rapid', hq],
          ],
        },
      }),
    );
    expect(s.flags.custom).toBe(true);
    expect(s.unitOrder).toHaveLength(3);
    const u = s.units[s.unitOrder[0]];
    expect(u.crew.map((o) => o.badge)).toEqual([pool[0].badge, pool[1].badge]);
    expect(s.units[s.unitOrder[1]].crew).toHaveLength(2);
    // Same setup, same world.
    const t = createShift(
      opts({
        custom: {
          crews: [
            ['patrol', hq, pool[0].index, pool[1].index],
            ['patrol', hq],
            ['rapid', hq],
          ],
        },
      }),
    );
    expect(JSON.stringify(t.units)).toBe(JSON.stringify(s.units));
  });

  it('cleans a setup from outside', () => {
    const hq = stationsFor('pohja', [], 'patrol')[0].id;
    expect(parseCustom(null, 'pohja')).toBeNull();
    expect(parseCustom({ crews: 'x' }, 'pohja')).toBeNull();
    const c = parseCustom(
      {
        crews: [
          ['patrol', hq, 1, 1, 2, 3, 4],
          ['tank', hq],
          ['patrol', 'ida-hq'],
          ['boat', hq],
          ['rapid', hq, 2, -1, 99, 1.5, 'x'],
          'junk',
        ],
        budget: true,
      },
      'pohja',
    )!;
    expect(c.budget).toBe(true);
    // Duplicates and a fourth officer dropped; unknown type, a station of another prefecture and a boat at the HQ go.
    expect(c.crews).toEqual([
      ['patrol', hq, 1, 2, 3],
      ['rapid', hq],
    ]);
  });
});

describe('a sector room with custom forces (2.27.0)', () => {
  it('never leaves a desk without crews (the bug: every drafted crew went to the first desk)', () => {
    const desks = ['pohja-kesklinn', 'pohja-lasnamae'];
    const hq = stationsFor('pohja', ['pohja-kesklinn'], 'patrol')[0].id;
    const setup: CustomSetup = {
      crews: [
        ['patrol', hq],
        ['patrol', hq],
        ['patrol', hq],
        ['rapid', hq],
      ],
    };
    const filled = fillDesks('pohja', desks, setup);
    expect(filled.crews.slice(0, 4)).toEqual(setup.crews);
    const s = createShift(opts({ sectors: desks, custom: filled }));
    initCoop(s, 'AAAAAA', 'sector', desks);
    const per = new Map<string, number>();
    for (const id of s.unitOrder) {
      const d = s.coop!.sec!.unitDesk[id];
      if (d) per.set(d, (per.get(d) ?? 0) + 1);
    }
    expect(per.get('pohja-kesklinn')).toBe(4);
    expect(per.get('pohja-lasnamae') ?? 0).toBeGreaterThan(0);
    // A desk that has crews keeps exactly the drafted ones.
    const both: CustomSetup = {
      crews: [...setup.crews, ['patrol', stationsFor('pohja', ['pohja-lasnamae'], 'patrol')[0].id]],
    };
    expect(fillDesks('pohja', desks, both)).toEqual(both);
  });
});
