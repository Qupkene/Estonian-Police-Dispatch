// Career page figures (src/ui/screens/career/hqModel.ts): what the prefect's offer changes, the crews, the
// fleet, the last shifts and the rank that opens the next prefecture, all from the profile and the rules.
import { describe, expect, it } from 'vitest';
import { SECTOR_HANDOVER } from '@/data/economy';
import { dailyBudget, newCareer, rosterFromCareer } from '@/sim/career';
import { acceptOffer } from '@/sim/careerSectors';
import type { CareerProfile } from '@/sim/types';
import { crewRows, fleetRows, nextRegionRank, offerFacts, shiftSummary } from '@/ui/screens/career/hqModel';

const SCORES = [58, 66, 71, 82, 61, 70, 84, 86, 73, 93, 88, 74, 87];

function played(): CareerProfile {
  const p = newCareer('Mari Tamm', '214', 'louna', 7, 'louna-tartu');
  return {
    ...p,
    day: 14,
    history: SCORES.map((score, i) => ({
      day: i + 1,
      regionId: 'louna' as const,
      score,
      grade: score >= 90 ? ('S' as const) : score >= 80 ? ('A' as const) : ('B' as const),
      incidents: 10 + i,
      earnings: 900 + i,
      reputationDelta: i % 3 === 0 ? -1 : 2,
    })),
    stats: { ...p.stats, shifts: 13, bestScore: 93 },
    offer: { regionId: 'louna', choices: ['louna-tartumaa'], day: 13 },
  };
}

describe('the offer', () => {
  it("says what the rules give: the post, the daily budget, the grant and the sector's colleague", () => {
    const p = played();
    const f = offerFacts(p, 'louna-tartumaa');
    expect(f.regionId).toBe('louna');
    expect(f.position.et).toBe('Operatiivinfo haldur');
    expect(f.positionAfter.et).toBe('Vanem-operatiivinfo haldur');
    expect(f.budget).toBe(dailyBudget(p, 'louna'));
    expect(f.budgetAfter).toBeGreaterThan(f.budget);
    expect(f.grant).toBe(SECTOR_HANDOVER.grant);
    expect(f.staff).toEqual(SECTOR_HANDOVER.staff);
    expect(f.colleague).toMatch(/^\S+ \S+/);
  });

  it('matches the budget the career has once the sector is taken', () => {
    const p = played();
    const after = acceptOffer(p, 'louna-tartumaa').profile;
    expect(offerFacts(p, 'louna-tartumaa').budgetAfter).toBe(dailyBudget(after, 'louna'));
  });
});

describe('crews and fleet', () => {
  it("lists the roster's crews by callsign, vehicle and the officers' initials", () => {
    const p = played();
    const roster = rosterFromCareer(p, 'day', 'louna');
    const rows = crewRows(roster);
    expect(rows).toHaveLength(roster.length);
    expect(rows[0].callsign).toBe(roster[0].callsign);
    expect(rows[0].crew).toMatch(/^\p{Lu}\. \S+/u);
    expect(crewRows(null)).toEqual([]);
  });

  it('marks a worn vehicle and one the roster leaves out', () => {
    const p = played();
    const fleet = p.fleet.map((v, i) =>
      i === 0 ? { ...v, condition: 0.38 } : i === 1 ? { ...v, condition: 0.04 } : v,
    );
    const rows = fleetRows({ ...p, fleet });
    expect(rows[0]).toMatchObject({ condition: 38, state: 'worn' });
    expect(rows[1]).toMatchObject({ condition: 4, state: 'out' });
    expect(rows[2].state).toBe('ok');
  });
});

describe('the last shifts', () => {
  it('the newest first, with the average of the history and the best of the stats', () => {
    const s = shiftSummary(played(), 6);
    expect(s.count).toBe(13);
    expect(s.best).toBe(93);
    expect(s.avg).toBe(Math.round(SCORES.reduce((a, b) => a + b, 0) / SCORES.length));
    expect(s.rows.map((r) => r.day)).toEqual([13, 12, 11, 10, 9, 8]);
    expect(s.rows[0]).toMatchObject({ score: 87, incidents: 22, earnings: 912 });
  });

  it('a new career has none', () => {
    const s = shiftSummary(newCareer('Mari Tamm', '214', 'louna', 7, 'louna-tartu'));
    expect(s).toEqual({ count: 0, avg: null, best: null, rows: [] });
  });
});

describe('the next prefecture', () => {
  it('opens at the lowest rank still ahead, and none is left when every one is open', () => {
    const p = played();
    expect(nextRegionRank(p)).toBe(2);
    expect(nextRegionRank({ ...p, unlockedRegions: ['louna', 'pohja', 'ida', 'laane'] })).toBeNull();
  });
});
