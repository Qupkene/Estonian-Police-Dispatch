/**
 * Headless balance harness: an automatic "dispatcher bot" plays full shifts in every prefecture.
 * Asserts the engine survives long runs and prints balance numbers (set EPD_BALANCE_LOG=1 to see them).
 */
import { describe, expect, it } from 'vitest';
import { createShift, finalizeShift, step } from '@/sim/engine';
import {
  acknowledge,
  answerCall,
  askCall,
  dispatchUnits,
  endCall,
  replyRadio,
  requestAgency,
} from '@/sim/commands';
import { pendingRadio, queue, recommendUnits } from '@/sim/selectors';
import { correctReply } from '@/sim/registry';
import { REGION_IDS, REGIONS } from '@/data/regions';
import { TEMPLATES } from '@/data/incidents';
import { tallinnTime, MIN } from '@/sim/time';
import type { CallQuestionId, RegionId, SimState } from '@/sim/types';

const ready = REGION_IDS.every((id) => REGIONS[id].roster.length > 0) && TEMPLATES.length > 50;
const QUESTIONS: CallQuestionId[] = ['what', 'where', 'injured', 'weapons', 'suspect'];

/** A competent (slightly cheating) dispatcher: answers queries correctly most of the time. */
function bot(s: SimState, skill: number, tick: number) {
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
        if (Math.random() < skill && msg.replies.some((r) => r.id === truth)) replyId = truth;
      }
    } else if (msg.kind === 'backup' || msg.kind === 'choice') {
      replyId = msg.replies[Math.floor(Math.random() * msg.replies.length)].id;
    }
    replyRadio(s, msg.id, replyId);
  }
}

function runShift(regionId: RegionId, hours: number, startHour: number, skill: number) {
  const s = createShift({
    seed: 1234 + regionId.length,
    regionId,
    mode: 'free',
    difficulty: 'normal',
    start: tallinnTime(2026, 10, 16, startHour, 0),
    hours,
    playerName: 'Bot',
  });
  let tick = 0;
  const limit = (hours + 2) * 60;
  while (!s.ended && tick < limit) {
    step(s, MIN);
    bot(s, skill, tick++);
  }
  return { s, report: finalizeShift(s), minutes: tick };
}

describe.skipIf(!ready)('balance harness', () => {
  for (const regionId of REGION_IDS) {
    it(`plays an 8 h night shift in ${regionId}`, () => {
      const { s, report, minutes } = runShift(regionId, 8, 19, 0.9);
      if (process.env.EPD_BALANCE_LOG) {
        const avg = Object.fromEntries(
          Object.entries(report.avgResponse).map(([p, v]) => [p, v === undefined ? null : Math.round(v * 10) / 10]),
        );
        console.log(
          `[${regionId}] incidents=${s.stats.incidents} closed=${s.stats.closed} expired=${s.stats.expired} ` +
            `arrests=${s.stats.arrests} calls=${s.stats.callsAnswered}/${s.stats.callsMissed} ` +
            `queries ok/bad=${s.stats.repliesCorrect}/${s.stats.repliesWrong} pursuits=${s.stats.pursuits} ` +
            `avgResp=${JSON.stringify(avg)} score=${report.score} grade=${report.grade} trust=${Math.round(s.trust)} ` +
            `minutes=${minutes} headline="${report.newspaper.headline.et}"`,
        );
      }
      expect(s.ended).toBe(true);
      expect(s.stats.incidents).toBeGreaterThan(8);
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
      // A competent bot should not let most events expire.
      expect(s.stats.expired).toBeLessThan(Math.max(4, s.stats.incidents * 0.35));
      // State must stay serialisable for autosave.
      expect(() => JSON.parse(JSON.stringify(s))).not.toThrow();
    }, 120_000);
  }
});
