/**
 * Headless balance harness: an automatic "dispatcher bot" plays full shifts in every prefecture.
 * Asserts the engine survives long runs, keeps the free-play and career balance in range, and
 * prints balance numbers (set EPD_BALANCE_LOG=1 to see them). The bot's choices come from a seeded
 * Rng, so every run of the same code gives the same numbers.
 */
import { describe, expect, it } from 'vitest';
import { createShift, finalizeShift, shiftKindOf, step } from '@/sim/engine';
import {
  acknowledge,
  answerCall,
  askCall,
  dispatchUnits,
  endCall,
  replyRadio,
  requestAgency,
} from '@/sim/commands';
import { newCareer, rosterFromCareer } from '@/sim/career';
import { pendingRadio, queue, recommendUnits } from '@/sim/selectors';
import { correctReply } from '@/sim/registry';
import { Rng } from '@/sim/rng';
import { CAREER_LOAD_FLOOR, careerLoadFactor, skippedZones, spawnRatePerHour } from '@/sim/spawner';
import { rosterSpecsFor } from '@/sim/units';
import { REGION_IDS, REGIONS } from '@/data/regions';
import { TEMPLATES } from '@/data/incidents';
import { tallinnTime, MIN } from '@/sim/time';
import type { CallQuestionId, CareerProfile, NewShiftOptions, RegionId, ShiftReport, SimState } from '@/sim/types';

const ready = REGION_IDS.every((id) => REGIONS[id].roster.length > 0) && TEMPLATES.length > 50;
const QUESTIONS: CallQuestionId[] = ['what', 'where', 'injured', 'weapons', 'suspect'];

/** A competent (slightly cheating) dispatcher: answers queries correctly most of the time. */
function bot(s: SimState, skill: number, tick: number, rnd: () => number) {
  for (const call of s.calls) {
    if (call.endedAt) continue;
    if (!call.answeredAt) answerCall(s, call.id);
    else if (call.asked.length < QUESTIONS.length) askCall(s, call.id, QUESTIONS[call.asked.length]);
    else {
      const inc = s.incidents[call.incidentId];
      endCall(s, call.id, { action: 'create', priority: inc?.truePriority ?? 3 });
    }
  }
  for (const inc of queue(s)) {
    if (inc.state === 'incoming') acknowledge(s, inc.id);
    if (inc.assigned.length === 0 || (tick % 7 === 0 && inc.assigned.length < inc.need.reduce((a, n) => a + n.count, 0))) {
      const recs = recommendUnits(s, inc.id).filter((r) => r.fit === 'ideal' || r.fit === 'need' || r.fit === 'weak');
      const want = Math.max(1, inc.need.reduce((a, n) => a + n.count, 0)) - inc.assigned.length;
      if (recs.length && want > 0) dispatchUnits(s, inc.id, recs.slice(0, want).map((r) => r.unit.id));
    }
    for (const need of inc.agencyNeeds) if (!need.requested) requestAgency(s, inc.id, need.agency);
  }
  for (const msg of pendingRadio(s)) {
    if (!msg.replies?.length) continue;
    let replyId = msg.replies[0].id;
    if (msg.kind === 'query' && msg.incidentId) {
      const inc = s.incidents[msg.incidentId];
      const subj = inc?.persons.find((p) => msg.text.et.includes(s.persons[p.personId]?.idcode ?? '§§'));
      const veh = inc?.vehicles.find((v) => msg.text.et.includes(v.plate));
      if (subj || veh) {
        const truth = correctReply(s, subj ? { personId: subj.personId } : { plate: veh!.plate });
        if (rnd() < skill && msg.replies.some((r) => r.id === truth)) replyId = truth;
      }
    } else if (msg.kind === 'backup' || msg.kind === 'choice') {
      replyId = msg.replies[Math.floor(rnd() * msg.replies.length)].id;
    }
    replyRadio(s, msg.id, replyId);
  }
}

interface RunOpts {
  hours: number;
  startHour: number;
  skill?: number;
  seed?: number;
  /** Career: play with this profile's roster, upgrades and Staatus. */
  career?: CareerProfile;
}

function runShift(regionId: RegionId, o: RunOpts) {
  const seed = o.seed ?? 1234 + regionId.length;
  const start = tallinnTime(2026, 10, 16, o.startHour, 0);
  const opts: NewShiftOptions = {
    seed,
    regionId,
    mode: o.career ? 'career' : 'free',
    difficulty: 'normal',
    start,
    hours: o.hours,
    playerName: 'Bot',
    ...(o.career
      ? { roster: rosterFromCareer(o.career, shiftKindOf(start), regionId), upgrades: o.career.upgrades, reputation: o.career.reputation }
      : {}),
  };
  const s = createShift(opts);
  const rng = new Rng(seed ^ 0x5bd1e995);
  const rnd = () => rng.next();
  let tick = 0;
  const limit = (o.hours + 2) * 60;
  while (!s.ended && tick < limit) {
    step(s, MIN);
    bot(s, o.skill ?? 0.9, tick++, rnd);
  }
  return { s, report: finalizeShift(s), minutes: tick };
}

function log(label: string, s: SimState, report: ShiftReport, minutes: number) {
  if (!process.env.EPD_BALANCE_LOG) return;
  const avg = Object.fromEntries(
    Object.entries(report.avgResponse).map(([p, v]) => [p, v === undefined ? null : Math.round(v * 10) / 10]),
  );
  console.log(
    `[${label}] units=${s.unitOrder.length} load=${s.flags.loadFactor ?? 1} incidents=${s.stats.incidents} closed=${s.stats.closed} ` +
      `expired=${s.stats.expired} arrests=${s.stats.arrests} calls=${s.stats.callsAnswered}/${s.stats.callsMissed} ` +
      `queries ok/bad=${s.stats.repliesCorrect}/${s.stats.repliesWrong} pursuits=${s.stats.pursuits} ` +
      `avgResp=${JSON.stringify(avg)} score=${report.score} grade=${report.grade} trust=${Math.round(s.trust)} ` +
      `minutes=${minutes} headline="${report.newspaper.headline.et}"`,
  );
}

describe.skipIf(!ready)('balance harness', () => {
  for (const regionId of REGION_IDS) {
    it(`plays an 8 h night shift in ${regionId}`, () => {
      const { s, report, minutes } = runShift(regionId, { hours: 8, startHour: 19 });
      log(regionId, s, report, minutes);
      expect(s.ended).toBe(true);
      expect(s.stats.incidents).toBeGreaterThan(8);
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
      // A competent bot should not let most events expire.
      expect(s.stats.expired).toBeLessThan(Math.max(4, s.stats.incidents * 0.35));
      // Free play is not scaled by the career load factor.
      expect(s.flags.loadFactor).toBeUndefined();
      // State must stay serialisable for autosave.
      expect(() => JSON.parse(JSON.stringify(s))).not.toThrow();
    }, 120_000);
  }

  // Several seeds per prefecture, so one unlucky night does not decide the verdict. Lääne used to
  // fall to C/D on these nights, with 45-75 min P1 responses and up to a quarter of the events
  // expiring; it now gets the strictest limits.
  for (const regionId of REGION_IDS) {
    it(`keeps a Friday night under control in ${regionId}`, () => {
      const runs = [1, 2, 3, 4].map((k) => runShift(regionId, { hours: 8, startHour: 19, seed: 1234 + k * 1000 }));
      const incidents = runs.reduce((a, r) => a + r.s.stats.incidents, 0);
      const expired = runs.reduce((a, r) => a + r.s.stats.expired, 0);
      const score = runs.reduce((a, r) => a + r.report.score, 0) / runs.length;
      const p1 = runs.flatMap((r) => r.s.stats.responseTimes[1]);
      const p1Mean = p1.reduce((a, b) => a + b, 0) / Math.max(1, p1.length);
      if (process.env.EPD_BALANCE_LOG)
        console.log(`[${regionId} x${runs.length}] expired=${expired}/${incidents} meanScore=${score.toFixed(1)} p1Mean=${p1Mean.toFixed(1)} min`);
      const strict = regionId === 'laane';
      expect(expired / incidents).toBeLessThan(strict ? 0.08 : 0.15);
      expect(score).toBeGreaterThanOrEqual(strict ? 70 : 60);
      if (strict) expect(p1Mean).toBeLessThan(40);
    }, 240_000);
  }

  it('staffs a Lääne night with two crews in Haapsalu, Rapla and Paide at normal difficulty', () => {
    const night = rosterSpecsFor(REGIONS.laane, 'night', 'normal').filter((u) => u.type === 'patrol');
    const per = (st: string) => night.filter((u) => u.stationId === st).length;
    expect(per('la-haapsalu')).toBe(2);
    expect(per('la-rapla')).toBe(2);
    expect(per('la-paide')).toBe(2);
    // The day shift keeps one crew per county town.
    const day = rosterSpecsFor(REGIONS.laane, 'day', 'normal').filter((u) => u.type === 'patrol');
    expect(day.filter((u) => u.stationId === 'la-rapla')).toHaveLength(1);
  });
});

describe.skipIf(!ready)('career load', () => {
  for (const regionId of REGION_IDS) {
    it(`makes day 1 of a new career winnable in ${regionId}`, () => {
      const career = newCareer('Bot', '777', regionId, 4242);
      const { s, report, minutes } = runShift(regionId, { hours: 12, startHour: 7, career });
      log(`career ${regionId}`, s, report, minutes);
      // 5-6 response crews against 11-17 in the regular roster: the volume is scaled down, once, at creation.
      const f = Number(s.flags.loadFactor);
      expect(f).toBeGreaterThanOrEqual(CAREER_LOAD_FLOOR);
      expect(f).toBeLessThan(0.8);
      expect(s.ended).toBe(true);
      // Before the fix a competent bot scored 0-30 (F) here, with 35-55 % of the calls expiring.
      expect(report.score).toBeGreaterThanOrEqual(50);
      expect(s.stats.expired / Math.max(1, s.stats.incidents)).toBeLessThan(0.2);
      expect(() => JSON.parse(JSON.stringify(s))).not.toThrow();
    }, 120_000);
  }

  it('scales the spawn rate by the stored factor in career only', () => {
    const career = newCareer('Bot', '777', 'pohja', 7);
    const start = tallinnTime(2026, 10, 16, 7, 0);
    const base = { seed: 99, regionId: 'pohja' as const, difficulty: 'normal' as const, start, hours: 12, playerName: 'Bot' };
    const free = createShift({ ...base, mode: 'free' });
    const cs = createShift({ ...base, mode: 'career', roster: rosterFromCareer(career, 'day'), upgrades: [], reputation: 25 });
    expect(careerLoadFactor(free)).toBe(1);
    const f = careerLoadFactor(cs);
    // pohja day: 5 response crews (4 patrol + rapid) of 13 in the regular roster.
    expect(f).toBeCloseTo(Math.sqrt(5 / 13), 3);
    cs.weather = free.weather;
    const t = start + 3 * 3_600_000;
    expect(spawnRatePerHour(cs, t)).toBeCloseTo(spawnRatePerHour(free, t) * f, 6);
    // A career without its own roster gets the full prefecture roster and the full volume.
    const full = createShift({ ...base, mode: 'career' });
    expect(careerLoadFactor(full)).toBe(1);
  });

  it('grows the load with the force on duty', () => {
    const p = newCareer('Bot', '777', 'louna', 11);
    const start = tallinnTime(2026, 10, 16, 7, 0);
    const shift = (prof: CareerProfile) =>
      createShift({ seed: 5, regionId: 'louna', mode: 'career', difficulty: 'normal', start, hours: 12, playerName: 'Bot', roster: rosterFromCareer(prof, 'day') });
    const small = careerLoadFactor(shift(p));
    const extraStaff = [0, 1, 2, 3].map((i) => ({ ...p.staff[0], id: `extra-${i}`, badge: `9${i}0`, specialty: 'patrol' as const }));
    const extraCars = [0, 1].map((i) => ({ ...p.fleet[0], id: `extra-car-${i}`, plate: `999 EX${i}` }));
    const bigger = careerLoadFactor(shift({ ...p, staff: [...p.staff, ...extraStaff], fleet: [...p.fleet, ...extraCars] }));
    expect(bigger).toBeGreaterThan(small);
    expect(bigger).toBeLessThanOrEqual(1);
  });

  it('keeps calls off islands that the career force does not cover (Lääne)', () => {
    const career = newCareer('Bot', '777', 'laane', 21);
    const { s } = runShift('laane', { hours: 12, startHour: 19, career });
    const skip = skippedZones(s);
    expect([...skip].sort()).toEqual(['hiiumaa', 'saaremaa']);
    const zones = s.incidentOrder.map((id) => s.incidents[id].location.zone);
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.filter((z) => skip.has(z))).toEqual([]);
    // The player is told why.
    expect(s.bulletins.some((b) => b.kind === 'order' && /Saaremaa/.test(b.text.et) && /Hiiumaa/.test(b.text.et))).toBe(true);
    // Prefectures without staffed islands skip nothing.
    for (const regionId of ['pohja', 'ida', 'louna'] as const) {
      const cs = createShift({
        seed: 3,
        regionId,
        mode: 'career',
        difficulty: 'normal',
        start: tallinnTime(2026, 10, 16, 7, 0),
        hours: 12,
        playerName: 'Bot',
        roster: rosterFromCareer(newCareer('Bot', '777', regionId, 3), 'day'),
      });
      expect(skippedZones(cs).size, regionId).toBe(0);
    }
  });
});
