/**
 * Suurõnnetus (src/sim/crisis.ts, docs/CRISIS.md, 2.37.0): a crisis is scheduled from the seed, breaks out at a place
 * of the area with its tasks as ordinary incidents, opens later tasks in time, escalates a task nobody goes to and
 * opens its follow-up, takes the staff's default decision when nobody decides, lets the neighbours take over when help
 * was asked, and ends with a result in the report. A good dispatcher contains it at level 0.
 */
import { describe, expect, it } from 'vitest';
import { CRISES, CRISIS_TEMPLATES, crisisById } from '@/data/crises';
import { TEMPLATES } from '@/data/incidents';
import { dispatchUnits } from '@/sim/commands';
import {
  crisisChance,
  crisisDigest,
  crisisTaskOf,
  decide,
  DECIDE_MIN,
  HELP_AFTER_MIN,
  startCrisisNow,
  taskSpec,
} from '@/sim/crisis';
import {
  beginTurn,
  initCoop,
  INPUT_DELAY,
  runTurn,
  SERVER_SEAT,
  simDigest,
  stepPiece,
  TURN_PIECES,
  type LogCmd,
} from '@/sim/coop';
import { createShift, drainEvents, finalizeShift, step } from '@/sim/engine';
import { roomShiftOptions, type RoomShift } from '@/sim/room';
import { queue, recommendUnits } from '@/sim/selectors';
import { MIN, tallinnTime, wall } from '@/sim/time';
import type { SimState } from '@/sim/types';

const shift = (
  o: { seed?: number; crisis?: number; hours?: number; sectors?: string[]; startHour?: number } = {},
): SimState =>
  createShift({
    seed: o.seed ?? 4242,
    regionId: 'pohja',
    mode: 'free',
    difficulty: 'normal',
    start: tallinnTime(2026, 10, 14, o.startHour ?? 18, 0),
    hours: o.hours ?? 4,
    playerName: 'Test',
    ...(o.sectors ? { sectors: o.sectors } : {}),
    ...(o.crisis !== undefined ? { crisis: o.crisis } : {}),
  });

const crisisIncidents = (s: SimState) =>
  s.incidentOrder.map((id) => s.incidents[id]).filter((inc) => !!crisisTaskOf(inc));

/** Send the best crews to every open crisis task that has none. */
function staff(s: SimState): void {
  for (const inc of crisisIncidents(s)) {
    if (inc.state === 'closed' || inc.assigned.length) continue;
    const recs = recommendUnits(s, inc.id).filter(
      (r) => r.fit === 'ideal' || r.fit === 'need' || r.fit === 'weak',
    );
    const ids = recs.slice(0, 3).map((r) => r.unit.id);
    if (ids.length) dispatchUnits(s, inc.id, ids);
  }
}

describe('crisis: scheduling', () => {
  it('comes only when the shift allows one, from its seed, between a fifth and half of the shift', () => {
    expect(shift().crisis).toBeUndefined();
    expect(shift({ crisis: 0 }).crisis).toBeUndefined();
    const a = shift({ crisis: 1 });
    const b = shift({ crisis: 1 });
    expect(a.crisis).toBeDefined();
    expect(b.crisis).toEqual(a.crisis);
    const c = a.crisis!;
    expect(c.phase).toBe('due');
    expect(crisisById(c.id)).toBeDefined();
    const length = a.endTime - a.startTime;
    expect(c.due).toBeGreaterThanOrEqual(a.startTime + length * 0.2 - 1);
    expect(c.due).toBeLessThanOrEqual(a.startTime + length * 0.5 + 1);
    // Its own stream: the rest of the shift is drawn as without it.
    const plain = shift({ crisis: 0 });
    expect(a.rng).toBe(plain.rng);
    expect(a.unitOrder).toEqual(plain.unitOrder);
  });

  it('keeps the chance small for a single player and in proportion to the shift', () => {
    expect(crisisChance('free', 'normal', 4)).toBeCloseTo(0.1);
    expect(crisisChance('free', 'cadet', 4)).toBeCloseTo(0.05);
    expect(crisisChance('free', 'veteran', 2)).toBeCloseTo(0.075);
    expect(crisisChance('career', 'normal', 8)).toBeCloseTo(0.16);
  });

  it('breaks out only in its hours: a shopping centre while it is open, never at night', () => {
    const mall = crisisById('mall')!;
    expect(mall.hours).toBeDefined();
    let malls = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const night = shift({ seed, crisis: 1, startHour: 23, hours: 6 });
      expect(night.crisis?.id, `seed ${seed}`).not.toBe('mall');
      const day = shift({ seed, crisis: 1, startHour: 9, hours: 8 });
      if (day.crisis?.id !== 'mall') continue;
      malls++;
      const h = wall(day.crisis.due).hour;
      expect(h).toBeGreaterThanOrEqual(mall.hours![0]);
      expect(h).toBeLessThan(mall.hours![1]);
    }
    expect(malls).toBeGreaterThan(0);
  });

  it('breaks out only where its place is: never in an area without one', () => {
    // Every scenario names places that exist somewhere in Estonia.
    for (const sc of CRISES) expect(sc.places.length, sc.id).toBeGreaterThan(0);
    const s = shift({ crisis: 1, sectors: ['pohja-kesklinn'] });
    if (s.crisis) {
      const sc = crisisById(s.crisis.id)!;
      expect(sc.places).toBeDefined();
    }
  });
});

describe('crisis: a run', () => {
  it('breaks out at its time with its first tasks in the queue, then opens the later ones', () => {
    const s = shift({ crisis: 1 });
    const c = s.crisis!;
    const sc = crisisById(c.id)!;
    step(s, c.due - s.now + MIN);
    expect(c.phase).toBe('on');
    const first = sc.tasks.filter((t) => !t.atMin);
    const open = crisisIncidents(s);
    expect(open.map((inc) => crisisTaskOf(inc)!.task).sort()).toEqual(first.map((t) => t.id).sort());
    for (const inc of open) {
      expect(inc.state).toBe('queued');
      expect(inc.code).toBe('SUUR');
    }
    expect(s.radio.some((m) => m.from === 'HK' && m.level === 'emergency')).toBe(true);
    expect(drainEvents(s).some((e) => e.type === 'crisis_start')).toBe(true);
    const later = sc.tasks.filter((t) => t.atMin);
    if (later.length) {
      step(s, Math.max(...later.map((t) => t.atMin!)) * MIN + MIN);
      for (const t of later) expect(c.tasks.find((x) => x.id === t.id)?.incidentId, t.id).toBeDefined();
    }
  });

  it('escalates a task nobody goes to and opens its follow-up', () => {
    const s = shift({ crisis: 1 });
    const c = s.crisis!;
    const sc = crisisById(c.id)!;
    step(s, c.due - s.now + MIN);
    const withFollow = sc.tasks.find((t) => t.followUp && !t.atMin)!;
    expect(withFollow, 'a first task with a follow-up').toBeDefined();
    step(s, (withFollow.deadlineMin + 2) * MIN);
    const task = c.tasks.find((t) => t.id === withFollow.id)!;
    expect(task.escalated).toBe(true);
    expect(c.level).toBeGreaterThanOrEqual(1);
    expect(s.incidents[task.incidentId!].truePriority).toBe(1);
    const follow = c.tasks.find((t) => t.id === withFollow.followUp);
    expect(follow?.incidentId, 'follow-up opened').toBeDefined();
    expect(crisisTaskOf(s.incidents[follow!.incidentId!])?.task).toBe(withFollow.followUp);
  });

  it('takes the default when nobody decides, and lets the neighbours take over a task when help was asked', () => {
    const s = shift({ crisis: 1 });
    const c = s.crisis!;
    const sc = crisisById(c.id)!;
    step(s, c.due - s.now + MIN);
    const last = Math.max(...sc.decisions.map((d) => d.atMin));
    step(s, (last + DECIDE_MIN + 1) * MIN);
    for (const d of sc.decisions) {
      expect(c.decisions[d.id], d.id).toBe(d.defaultOption);
      expect(c.defaulted?.[d.id]).toBe(1);
    }
    // The scenario's default asks for help: a task left alone goes to the neighbours.
    const helps = sc.decisions.some((d) => d.options.find((o) => o.id === d.defaultOption)?.help);
    if (helps) {
      const longest = Math.max(...sc.tasks.filter((t) => !t.atMin).map((t) => t.deadlineMin));
      step(s, (longest + HELP_AFTER_MIN + 2) * MIN);
      expect(c.helped).toBeGreaterThan(0);
      const helped = c.tasks.filter((t) => t.helped);
      for (const t of helped) expect(s.incidents[t.incidentId!].closedBy).toBe('colleague');
    }
  });

  it('lets only the commander decide, once, and applies the option', () => {
    const s = shift({ crisis: 1 });
    const c = s.crisis!;
    const sc = crisisById(c.id)!;
    step(s, c.due - s.now + MIN);
    const d = sc.decisions[0];
    step(s, d.atMin * MIN + MIN);
    const other = d.options.find((o) => o.id !== d.defaultOption)!;
    expect(decide(s, d.id, other.id, 3)).toBe(false);
    expect(decide(s, d.id, 'nonsense', 0)).toBe(false);
    expect(decide(s, d.id, other.id, 0)).toBe(true);
    expect(decide(s, d.id, d.defaultOption, 0)).toBe(false);
    expect(c.decisions[d.id]).toBe(other.id);
    expect(c.defaulted?.[d.id]).toBeUndefined();
  });

  it('is contained by a good dispatcher and shows in the report', () => {
    const s = shift({ crisis: 1, hours: 6 });
    const c = s.crisis!;
    step(s, c.due - s.now + MIN);
    for (let m = 0; m < 300 && c.phase !== 'over'; m++) {
      staff(s);
      step(s, MIN);
    }
    expect(c.phase).toBe('over');
    expect(c.level).toBe(0);
    expect(c.result!).toBeGreaterThan(40);
    expect(drainEvents(s).some((e) => e.type === 'crisis_end')).toBe(true);
    const report = finalizeShift(s);
    expect(report.crisis).toMatchObject({ id: c.id, level: 0, result: c.result });
    expect(report.crisis!.tasks.length).toBe(c.tasks.length);
    expect(crisisDigest(c)).toContain(`C${c.id}|over|0|0|`);
    expect(() => JSON.parse(JSON.stringify(s))).not.toThrow();
  });

  it('starts by hand (the director) at a place of its kind', () => {
    const s = shift();
    expect(startCrisisNow(s, 'nonsense')).toBe(false);
    expect(startCrisisNow(s, CRISES[0].id)).toBe(true);
    expect(s.crisis!.phase).toBe('on');
    expect(startCrisisNow(s, CRISES[0].id)).toBe(false);
  });
});

describe('crisis: co-op', () => {
  it('keeps the clients hash-equal through a crisis: command, decisions, a commander who leaves', { timeout: 120_000 }, () => {
    const shift: RoomShift = {
      code: 'K7M2QX',
      seed: 31337,
      day: '2026-10-20',
      options: { regionId: 'pohja', sector: '', difficulty: 'normal', hours: 4, slot: 'evening', crisis: 'on' },
    };
    const client = () => {
      const s = createShift(roomShiftOptions(shift, 'Meeskond'));
      s.flags.room = shift.code;
      initCoop(s, shift.code);
      return s;
    };
    const a = client();
    const b = client();
    expect(a.crisis, 'the room asked for one').toBeDefined();
    const log: LogCmd[] = [
      {
        id: 1,
        t: 0,
        s: SERVER_SEAT,
        k: 'setup',
        a: [
          0,
          [
            [0, 'dispatch', 'Hanna'],
            [1, 'calls', 'Ivo'],
            [2, 'radio', 'Jaan'],
          ],
        ],
      },
    ];
    let id = 1;
    const issued = new Set<string>();
    const once = (key: string, turn: number, seat: number, k: string, args: unknown[]) => {
      if (issued.has(key)) return;
      issued.add(key);
      log.push({ id: ++id, t: turn + INPUT_DELAY, s: seat, k, a: args });
    };
    const sc = crisisById(a.crisis!.id)!;
    const leads: number[] = [];
    for (let turn = 0; turn < 30_000 && !a.ended; turn++) {
      const c = a.crisis!;
      if (c.phase === 'on') {
        if (leads[leads.length - 1] !== c.lead) leads.push(c.lead);
        // Ivo takes command; Jaan tries too and may not decide.
        once('lead:1', turn, 1, 'lead', []);
        if (c.lead === 1) {
          once('lead:2', turn, 2, 'lead', []);
          const d = sc.decisions.find((x) => c.asked[x.id] !== undefined);
          if (d) once('cdec:wrong', turn, 2, 'cdec', [d.id, d.defaultOption]);
        }
        // The commander takes the last option of every decision (not the staff's default).
        for (const d of sc.decisions)
          if (c.asked[d.id] !== undefined && c.decisions[d.id] === undefined && c.lead >= 0)
            once(`cdec:${d.id}`, turn, c.lead, 'cdec', [d.id, d.options[d.options.length - 1].id]);
        // Both decided: Ivo leaves, Jaan takes the free command, then the host takes it over.
        if (sc.decisions.every((d) => c.decisions[d.id] !== undefined)) {
          once('left:1', turn, SERVER_SEAT, 'left', [1]);
          if (c.lead === -1) once('lead:2b', turn, 2, 'lead', []);
          if (c.lead === 2) once('lead:0', turn, 0, 'lead', []);
        }
        // The dispatcher sends the best crews to every crisis task that has none.
        for (const inc of queue(a)) {
          if (!crisisTaskOf(inc) || inc.state !== 'queued' || inc.assigned.length) continue;
          const ids = recommendUnits(a, inc.id)
            .filter((r) => r.fit === 'ideal' || r.fit === 'need' || r.fit === 'weak')
            .slice(0, 3)
            .map((r) => r.unit.id);
          if (ids.length) once(`send:${inc.id}:${turn >> 3}`, turn, 0, 'send', [inc.id, ids]);
        }
      }
      const cmds = log.filter((x) => x.t === turn);
      runTurn(a, cmds);
      const plan = beginTurn(b, cmds);
      for (let i = 0; i < TURN_PIECES; i++) stepPiece(b, plan, i);
      if (turn % 10 === 0) expect(simDigest(b), `turn ${turn}`).toBe(simDigest(a));
    }
    expect(simDigest(b)).toBe(simDigest(a));
    expect(finalizeShift(b).crisis).toEqual(finalizeShift(a).crisis);
    // Resolved within the shift.
    const c = a.crisis!;
    expect(c.phase).toBe('over');
    expect(c.endedAt, 'resolved before the shift ended').toBeDefined();
    expect(c.result).toBeDefined();
    expect(b.crisis).toEqual(a.crisis);
    // Nobody, Ivo, nobody when he left, Jaan, the host: Jaan's first try and his decision were refused.
    expect(leads).toEqual([-1, 1, -1, 2, 0]);
    for (const d of sc.decisions) {
      expect(c.decisions[d.id], d.id).toBe(d.options[d.options.length - 1].id);
      expect(c.defaulted?.[d.id]).toBeUndefined();
    }
    const kinds = a.coop!.moments!.map((m) => m.k);
    for (const k of ['crisis', 'clead', 'cdec', 'cend']) expect(kinds, k).toContain(k);
    expect(a.coop!.moments!.filter((m) => m.k === 'cdec').every((m) => m.seat === 1)).toBe(true);
  });

  it('settles a crisis the shift ends on: over, with its result, not resolved', () => {
    const s = shift({ crisis: 1 });
    step(s, s.crisis!.due - s.now + MIN);
    expect(s.crisis!.phase).toBe('on');
    const report = finalizeShift(s);
    expect(s.crisis!.phase).toBe('over');
    expect(s.crisis!.endedAt).toBeUndefined();
    expect(report.crisis).toMatchObject({ id: s.crisis!.id, result: s.crisis!.result });
    expect(report.crisis!.endedAt).toBeUndefined();
  });
});

describe('crisis: data', () => {
  it('keeps its task templates apart from the spawner, with unique ids and specs that hang together', () => {
    const spawning = new Set(TEMPLATES.map((t) => t.id));
    const ids = CRISIS_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of CRISIS_TEMPLATES) {
      expect(spawning.has(t.id), t.id).toBe(false);
      expect(t.weight, t.id).toBe(0);
      expect(t.id.startsWith('crisis_'), t.id).toBe(true);
    }
    for (const sc of CRISES) {
      const taskIds = [...sc.tasks, ...sc.followUps].map((t) => t.id);
      expect(new Set(taskIds).size, sc.id).toBe(taskIds.length);
      for (const t of sc.tasks)
        if (t.followUp)
          expect(
            sc.followUps.some((f) => f.id === t.followUp),
            `${sc.id}/${t.id}`,
          ).toBe(true);
      expect(
        sc.tasks.some((t) => !t.atMin),
        `${sc.id}: a task at once`,
      ).toBe(true);
      for (const d of sc.decisions) {
        expect(d.options.map((o) => o.id)).toContain(d.defaultOption);
        for (const id of [d.id, ...d.options.map((o) => o.id)])
          expect(id, `${sc.id}: ${id}`).toMatch(/^[a-z_]{1,24}$/);
      }
      expect(taskSpec(sc, sc.tasks[0].id)).toBe(sc.tasks[0]);
      if (sc.hours) {
        expect(sc.hours[0], sc.id).toBeGreaterThanOrEqual(0);
        expect(sc.hours[1], sc.id).toBeLessThanOrEqual(24);
        expect(sc.hours[0], sc.id).toBeLessThan(sc.hours[1]);
      }
      for (const m of sc.months ?? []) expect(m >= 1 && m <= 12, `${sc.id}: month ${m}`).toBe(true);
      // A task placed near another opens after it: the spot it is placed from is on the map by then.
      sc.tasks.forEach((t, i) => {
        if (!t.near) return;
        const j = sc.tasks.findIndex((x) => x.id === t.near);
        expect(j, `${sc.id}/${t.id} near ${t.near}`).toBeGreaterThanOrEqual(0);
        expect(j, `${sc.id}/${t.id} opens after ${t.near}`).toBeLessThan(i);
        expect(sc.tasks[j].atMin ?? 0).toBeLessThanOrEqual(t.atMin ?? 0);
      });
      for (const f of sc.followUps)
        if (f.near) expect(sc.tasks.some((x) => x.id === f.near), `${sc.id}/${f.id} near ${f.near}`).toBe(true);
      // Häirekeskus says the escalation as a sentence of its own (some radio phrases put it after a full stop).
      expect(sc.radio.escalate.et, sc.id).toMatch(/^[A-ZÕÄÖÜŠŽ].*\.$/);
      expect(sc.radio.escalate.en, sc.id).toMatch(/^[A-Z].*\.$/);
    }
  });
});
