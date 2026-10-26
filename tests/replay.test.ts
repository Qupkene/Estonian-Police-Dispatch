/**
 * Kordus (src/sim/replay.ts, src/sim/replayFrame.ts, docs/REPLAY.md, 2.39.0): a shift recorded frame by frame plays back
 * with every crew where it was and doing what it did, every incident in its state, the calls, the crews sent and the
 * pursuits on the timeline; a recording kept mid-shift goes on after a reload; and the frames are states the game's
 * map draws.
 */
import { describe, expect, it } from 'vitest';
import { acknowledge, answerCall, directorSpawn, dispatchUnits, endCall, pursuitAction } from '@/sim/commands';
import { createShift, finalizeShift, step } from '@/sim/engine';
import { haversineKm } from '@/sim/geo';
import { startPursuit } from '@/sim/pursuit';
import { startSearch } from '@/sim/search';
import { queue, recommendUnits } from '@/sim/selectors';
import { MIN, tallinnTime } from '@/sim/time';
import { unitPosAt } from '@/sim/units';
import type { NewShiftOptions, SimState, UnitStatus } from '@/sim/types';
import {
  finishRecording,
  isReplay,
  observe,
  resumeRecording,
  startRecording,
  truncateReplay,
  type ReplayRecorder,
  type ShiftReplay,
} from '@/sim/replay';
import {
  feedAt,
  incidentTimes,
  loadCurve,
  nextMark,
  pursuitAt,
  ReplayFrame,
  replayCounts,
  statusSpans,
  unitAt,
  unitJobs,
} from '@/sim/replayFrame';
import { buildPursuits, buildRoutes, buildSearches, isHidden } from '@/map/overlays';

const OPTS: NewShiftOptions = {
  seed: 390001,
  regionId: 'pohja',
  mode: 'free',
  difficulty: 'normal',
  start: tallinnTime(2026, 10, 23, 19, 0),
  hours: 3,
  playerName: 'Magnus',
  weather: 'rain',
};

/** One dispatcher's minute: answer, acknowledge, send the best crew. */
function dispatcher(s: SimState) {
  for (const call of s.calls) {
    if (call.endedAt) continue;
    if (!call.answeredAt) answerCall(s, call.id);
    else endCall(s, call.id, { action: 'create', priority: s.incidents[call.incidentId]?.truePriority ?? 3 });
  }
  for (const inc of queue(s)) {
    if (inc.state === 'incoming') acknowledge(s, inc.id);
    if (!inc.assigned.length) {
      const r = recommendUnits(s, inc.id).find((x) => x.fit === 'ideal' || x.fit === 'need');
      if (r) dispatchUnits(s, inc.id, [r.unit.id]);
    }
  }
}

interface Truth {
  t: number;
  units: Record<string, { pos: [number, number]; status: UnitStatus; inc?: string }>;
  incidents: Record<string, { state: string; priority: number }>;
}

function truthOf(s: SimState): Truth {
  const units: Truth['units'] = {};
  for (const id of s.unitOrder) {
    const u = s.units[id];
    units[id] = { pos: unitPosAt(u, s.now).pos, status: u.status, ...(u.incidentId ? { inc: u.incidentId } : {}) };
  }
  const incidents: Truth['incidents'] = {};
  for (const id of s.incidentOrder) {
    const inc = s.incidents[id];
    if (!isHidden(s, id)) incidents[id] = { state: inc.state, priority: inc.priority };
  }
  return { t: s.now, units, incidents };
}

/**
 * Play the shift as a tab would: uneven frames (a second, three, sometimes ten of game time), the recorder after each,
 * the dispatcher every game minute, the truth every five.
 */
function playRecorded(s: SimState, minutes: number, r: ReplayRecorder, truths: Truth[], active = true) {
  const end = s.now + minutes * MIN;
  let nextMinute = s.now;
  let nextTruth = s.now + 5 * MIN;
  let i = 0;
  while (s.now < end && !s.ended) {
    const dt = [1000, 3000, 2000, 10_000, 1000][i++ % 5];
    step(s, dt);
    if (active && s.now >= nextMinute) {
      dispatcher(s);
      nextMinute += MIN;
    }
    observe(r, s);
    if (s.now >= nextTruth) {
      truths.push(truthOf(s));
      nextTruth += 5 * MIN;
    }
  }
}

function errorsAt(rep: ShiftReplay, truths: Truth[]) {
  const frame = new ReplayFrame(rep);
  const dist: number[] = [];
  const wrong: string[] = [];
  for (const tr of truths) {
    frame.at(tr.t);
    const s = frame.state;
    for (const [id, want] of Object.entries(tr.units)) {
      const u = s.units[id];
      const shown = u.move ? unitPosAt(u, s.now).pos : u.pos;
      dist.push(haversineKm(shown, want.pos) * 1000);
      if (u.status !== want.status) wrong.push(`${tr.t} ${id} status ${u.status} != ${want.status}`);
      if ((u.incidentId ?? '') !== (want.inc ?? '')) wrong.push(`${tr.t} ${id} incident ${u.incidentId} != ${want.inc}`);
    }
    const shownIds = new Set(s.incidentOrder);
    for (const [id, want] of Object.entries(tr.incidents)) {
      if (!shownIds.has(id)) {
        wrong.push(`${tr.t} ${id} not shown`);
        continue;
      }
      const inc = s.incidents[id];
      if (inc.state !== want.state) wrong.push(`${tr.t} ${id} state ${inc.state} != ${want.state}`);
      if (inc.priority !== want.priority) wrong.push(`${tr.t} ${id} priority ${inc.priority} != ${want.priority}`);
    }
    for (const id of shownIds) if (!tr.incidents[id]) wrong.push(`${tr.t} ${id} shown too early`);
  }
  dist.sort((a, b) => a - b);
  return { dist, wrong, p95: dist[Math.floor(dist.length * 0.95)] ?? 0, max: dist[dist.length - 1] ?? 0 };
}

describe('replay: a recorded shift plays back as it was', () => {
  it('has every crew where it was, in its status and on its job, and every incident in its state', { timeout: 120_000 }, () => {
    const s = createShift(OPTS);
    const r = startRecording(s, `${s.seed}:${s.startTime}`);
    const truths: Truth[] = [];
    playRecorded(s, 150, r, truths);
    const report = finalizeShift(s);
    const rep = finishRecording(r, s, report);
    expect(rep.from).toBe(s.startTime);
    expect(rep.to).toBe(s.now);
    expect(rep.done).toBe(true);
    expect(rep.units).toHaveLength(s.unitOrder.length);
    expect(truths.length).toBeGreaterThan(20);
    const e = errorsAt(rep, truths);
    expect(e.wrong.slice(0, 10)).toEqual([]);
    // The engine's own paths and times: a metre of rounding, a few where a stop fell between two frames.
    expect(e.p95).toBeLessThan(3);
    expect(e.max).toBeLessThan(60);
    // Crews really drove and incidents really happened.
    expect(rep.units.some((u) => u.mv.some((m) => m.u === 'incident'))).toBe(true);
    expect(rep.incidents.filter((x) => x.closed !== undefined).length).toBeGreaterThan(3);
  });

  it('marks the calls, the crews sent and the highlights; counts and curves add up', { timeout: 120_000 }, () => {
    const s = createShift(OPTS);
    const r = startRecording(s, `${s.seed}:${s.startTime}`);
    playRecorded(s, 150, r, []);
    const report = finalizeShift(s);
    const rep = finishRecording(r, s, report);
    const calls = rep.marks.filter((m) => m.k === 'call');
    expect(calls.length).toBe(rep.calls.length);
    expect(rep.calls.length).toBeGreaterThanOrEqual(s.stats.callsAnswered + s.stats.callsMissed);
    expect(rep.calls.length).toBeGreaterThan(0);
    // Every crew ever sent to an incident is a send mark (a crew sent twice to the same one counts twice).
    const sent = new Set(rep.marks.filter((m) => m.k === 'send').map((m) => `${m.unit}>${m.inc}`));
    for (const id of s.incidentOrder)
      for (const u of s.incidents[id].unitHistory) expect(sent.has(`${u}>${id}`), `${u} to ${id}`).toBe(true);
    expect(rep.marks.filter((m) => m.k === 'good' || m.k === 'bad')).toHaveLength(report.highlights.length);
    expect(rep.marks.every((m, i) => i === 0 || rep.marks[i - 1].t <= m.t)).toBe(true);
    const c = replayCounts(rep);
    expect(c.calls).toBe(rep.calls.length);
    expect(c.incidents).toBe(Object.keys(s.incidents).filter((id) => !isHidden(s, id)).length);
    expect(c.km).toBeGreaterThan(0);
    const curve = loadCurve(rep, 60);
    expect(curve).toHaveLength(60);
    expect(Math.max(...curve)).toBeGreaterThan(0);
    // An incident's moments are in order.
    const done = rep.incidents.find((x) => x.closed !== undefined && x.units.length)!;
    const tm = incidentTimes(rep, done);
    expect(tm.sent).toBeDefined();
    expect(tm.shown!).toBeLessThanOrEqual(tm.sent!);
    expect(tm.sent!).toBeLessThanOrEqual(tm.closed!);
    // A crew's jobs and statuses cover what it did.
    const busy = rep.units.find((u) => u.st.some((x) => x.i))!;
    const jobs = unitJobs(busy, rep.to);
    expect(jobs.length).toBeGreaterThan(0);
    const spans = statusSpans(busy, rep.from, rep.to);
    expect(spans[0].t0).toBe(rep.from);
    expect(spans[spans.length - 1].t1).toBe(rep.to);
    // The feed is newest first and never shows the future.
    const mid = (rep.from + rep.to) / 2;
    const feed = feedAt(rep, mid, 6);
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.every((x, i) => x.t <= mid && (i === 0 || feed[i - 1].t >= x.t))).toBe(true);
    // The next mark is later, the previous one earlier.
    const nx = nextMark(rep, mid, 1)!;
    const pv = nextMark(rep, mid, -1)!;
    expect(nx.t).toBeGreaterThan(mid);
    expect(pv.t).toBeLessThan(mid);
    // Jumps land five seconds before a mark: pressing on finds the one after it, back the one before.
    const lead = 5_000;
    const onlyCalls = new Set(['call'] as const);
    const a = nextMark(rep, rep.from, 1, onlyCalls, lead)!;
    const b = nextMark(rep, a.t - lead, 1, onlyCalls, lead);
    if (b) expect(b.t).toBeGreaterThan(a.t);
    const back = nextMark(rep, a.t - lead, -1, onlyCalls, lead);
    if (back) expect(back.t).toBeLessThan(a.t);
    // Going back in time by a drag gives what a jump there gives.
    const f1 = new ReplayFrame(rep);
    f1.at(rep.to);
    f1.at(mid);
    const f2 = new ReplayFrame(rep);
    f2.jump(mid);
    const view = (f: ReplayFrame) =>
      f.state.incidentOrder.map((id) => {
        const i = f.state.incidents[id];
        return [id, i.state, i.priority, i.closedAt ?? null, i.agencyNeeds.length, !!i.search, !!i.pursuit];
      });
    expect(view(f1)).toEqual(view(f2));
  });

  it('is small: a busy three-hour shift is well under half a megabyte', { timeout: 120_000 }, () => {
    const s = createShift({ ...OPTS, difficulty: 'veteran' });
    const r = startRecording(s, 'k');
    playRecorded(s, 180, r, []);
    const rep = finishRecording(r, s, finalizeShift(s));
    const json = JSON.stringify(rep);
    expect(json.length).toBeLessThan(500_000);
    const back = JSON.parse(json) as unknown;
    expect(isReplay(back)).toBe(true);
    expect(back).toEqual(rep);
    expect(isReplay({ ...rep, v: 99 })).toBe(false);
    expect(isReplay(null)).toBe(false);
  });

  it('goes on after a reload from the recording kept mid-shift, and from an older save', { timeout: 120_000 }, () => {
    const a = createShift(OPTS);
    const ra = startRecording(a, 'k');
    const truths: Truth[] = [];
    playRecorded(a, 60, ra, truths);
    // The page closes: the recording and the save are kept as JSON, and both come back.
    const kept = JSON.parse(JSON.stringify(ra.rep)) as ShiftReplay;
    const save = JSON.parse(JSON.stringify(a)) as SimState;
    const rb = resumeRecording(kept, save);
    playRecorded(save, 60, rb, truths);
    const rep = finishRecording(rb, save, finalizeShift(save));
    expect(rep.gaps).toBeUndefined();
    const e = errorsAt(rep, truths);
    expect(e.wrong.slice(0, 10)).toEqual([]);
    expect(e.p95).toBeLessThan(3);

    // A save older than the recording: the recording is cut back to it, then goes on.
    const c = createShift(OPTS);
    const rc = startRecording(c, 'k');
    const early: Truth[] = [];
    playRecorded(c, 30, rc, early);
    const old = JSON.parse(JSON.stringify(c)) as SimState;
    playRecorded(c, 30, rc, []);
    const ahead = JSON.parse(JSON.stringify(rc.rep)) as ShiftReplay;
    expect(ahead.to).toBeGreaterThan(old.now);
    const later: Truth[] = [];
    const rd = resumeRecording(ahead, old);
    expect(rd.rep.to).toBe(old.now);
    playRecorded(old, 30, rd, later);
    const rep2 = finishRecording(rd, old, finalizeShift(old));
    const e2 = errorsAt(rep2, [...early, ...later]);
    expect(e2.wrong.slice(0, 10)).toEqual([]);
    expect(e2.p95).toBeLessThan(3);

    // A recording kept long before: what is missing is a gap.
    const d = createShift(OPTS);
    const rr = startRecording(d, 'k');
    playRecorded(d, 10, rr, []);
    const stale = JSON.parse(JSON.stringify(rr.rep)) as ShiftReplay;
    const staleTo = stale.to;
    playRecorded(d, 20, startRecording(d, 'x'), []);
    const re = resumeRecording(stale, d);
    expect(re.rep.gaps).toEqual([[staleTo, d.now]]);

    // A recording that began later than the save loaded: a new one.
    const late = createShift(OPTS);
    step(late, 30 * MIN);
    const lateRec = startRecording(late, 'k');
    const older = createShift(OPTS);
    step(older, 10 * MIN);
    const fresh = resumeRecording(JSON.parse(JSON.stringify(lateRec.rep)) as ShiftReplay, older);
    expect(fresh.rep.from).toBe(older.now);
    expect(fresh.rep.to).toBe(older.now);
  });

  it('starts late without the beginning: the recording counts from where this device first saw the shift', () => {
    const s = createShift(OPTS);
    step(s, 20 * MIN);
    const r = startRecording(s, 'k');
    expect(r.rep.from).toBe(s.now);
    const s2 = createShift(OPTS);
    step(s2, 30_000);
    expect(startRecording(s2, 'k').rep.from).toBe(s2.startTime);
  });

  it('cuts a recording back to a moment: nothing later stays', { timeout: 120_000 }, () => {
    const s = createShift(OPTS);
    const r = startRecording(s, 'k');
    playRecorded(s, 90, r, []);
    const rep = JSON.parse(JSON.stringify(r.rep)) as ShiftReplay;
    const at = rep.from + 45 * MIN;
    truncateReplay(rep, at);
    expect(rep.to).toBe(at);
    for (const u of rep.units) {
      expect(u.st.slice(1).every((x) => x.t <= at)).toBe(true);
      expect(u.mv.every((m) => m.t <= at && (m.c === undefined || m.c <= at))).toBe(true);
    }
    for (const x of rep.incidents) {
      expect(x.created).toBeLessThanOrEqual(at);
      if (x.closed !== undefined) expect(x.closed).toBeLessThanOrEqual(at);
    }
    expect(rep.calls.every((c) => c.t <= at && (c.e === undefined || c.e <= at))).toBe(true);
    expect(rep.marks.every((m) => m.t <= at)).toBe(true);
  });
});

describe('replay: pursuits, searches and the other agencies', () => {
  it('keeps the fleeing vehicle on its track, the search and the crews in the chase', { timeout: 60_000 }, () => {
    const s = createShift({ ...OPTS, seed: 9, mode: 'director', start: Date.UTC(2026, 9, 16, 19, 0) });
    const r = startRecording(s, 'k');
    const pat = Object.values(s.units).find((u) => u.type === 'patrol')!;
    const id = directorSpawn(s, { templateId: 'traffic_mittepeatumine', coord: pat.pos });
    dispatchUnits(s, id, [pat.id]);
    const inc = s.incidents[id];
    startPursuit(s, inc, pat.pos);
    pursuitAction(s, id, 'heli');
    const track: { t: number; pos: [number, number] }[] = [];
    for (let i = 0; i < 6 * 60 && !inc.pursuit!.ended; i++) {
      step(s, 2000);
      observe(r, s);
      if (i % 15 === 0) track.push({ t: s.now, pos: [...inc.pursuit!.suspectPos] as [number, number] });
    }
    if (!inc.pursuit!.ended) pursuitAction(s, id, 'terminate');
    step(s, 2000);
    observe(r, s);
    const t0 = s.now;
    startSearch(s, inc, 0.8);
    for (let i = 0; i < 60; i++) {
      step(s, 5000);
      observe(r, s);
    }
    const rep = finishRecording(r, s, null);
    const ri = rep.incidents.find((x) => x.id === id)!;
    const pu = ri.pu![0];
    expect(pu.t1).toBeDefined();
    expect(pu.heli).toBe(1);
    expect(rep.marks.find((m) => m.k === 'pursuit')).toMatchObject({ inc: id, t: pu.t0, t1: pu.t1 });
    const frame = new ReplayFrame(rep);
    for (const p of track) {
      frame.at(p.t);
      const shown = frame.state.incidents[id].pursuit!;
      expect(haversineKm(shown.suspectPos, p.pos) * 1000).toBeLessThan(40);
      expect(pursuitAt(rep, p.t)?.id).toBe(id);
      expect(buildPursuits(frame.state).features.length).toBe(1);
      expect(frame.state.units[pat.id].incidentId).toBe(id);
      expect(buildRoutes(frame.state, (u) => ({ pos: u.pos, heading: u.heading }), id).features.length).toBeGreaterThanOrEqual(0);
    }
    frame.at(pu.t1! + 1000);
    expect(frame.state.incidents[id].pursuit!.ended).toBe(pu.end);
    expect(pursuitAt(rep, pu.t1! + 1000)).toBeNull();
    // The search grows towards where it got.
    expect(ri.sr?.length).toBe(1);
    frame.at(t0 + 2 * MIN);
    const a = frame.state.incidents[id].search!;
    frame.at(t0 + 4 * MIN);
    const b = frame.state.incidents[id].search!;
    expect(b.progress).toBeGreaterThan(a.progress);
    expect(buildSearches(frame.state).features.length).toBe(1);
  });
});

describe('replay: the frame', () => {
  it('moves the same state on, and a jump makes a new one; the crews of an incident are its assigned', { timeout: 60_000 }, () => {
    const s = createShift(OPTS);
    const r = startRecording(s, 'k');
    playRecorded(s, 60, r, []);
    const rep = finishRecording(r, s, null);
    const frame = new ReplayFrame(rep);
    const first = frame.state;
    frame.at(rep.from + 30 * MIN);
    expect(frame.state).toBe(first);
    expect(frame.state.now).toBe(rep.from + 30 * MIN);
    frame.jump(rep.from + 10 * MIN);
    expect(frame.state).not.toBe(first);
    expect(frame.state.incidentOrder.every((id) => rep.incidents.find((x) => x.id === id)!.shown! <= rep.from + 10 * MIN)).toBe(true);
    // Never outside what was recorded.
    frame.at(rep.to + 5 * MIN);
    expect(frame.t).toBe(rep.to);
    frame.jump(rep.from - MIN);
    expect(frame.t).toBe(rep.from);
    // Assigned crews: those on their way to it or on scene.
    for (let t = rep.from; t <= rep.to; t += 7 * MIN) {
      frame.at(t);
      for (const id of frame.state.incidentOrder) {
        const inc = frame.state.incidents[id];
        for (const u of inc.assigned) expect(frame.state.units[u].incidentId).toBe(id);
      }
    }
    // A crew before its first movement stands where the recording found it.
    const u = rep.units[0];
    expect(unitAt(u, rep.from - MIN).pos).toEqual(u.mv[0] && u.mv[0].t <= rep.from - MIN ? unitAt(u, rep.from - MIN).pos : u.p0);
  });
});
