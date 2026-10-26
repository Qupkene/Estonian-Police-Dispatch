/**
 * Kordus on the device (src/store/replay.ts, docs/REPLAY.md): the game loop's frames record the running shift, a
 * reload goes on with the recording kept, the report's replay is finished and found again, and only the last ones stay.
 * Without IndexedDB (here) the replays live in memory, the same way.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createShift, finalizeShift, step } from '@/sim/engine';
import { MIN, tallinnTime } from '@/sim/time';
import type { NewShiftOptions, SimState } from '@/sim/types';
import { spacePrefix } from '@/store/migrate';
import {
  finishReplay,
  findRoomReplay,
  forgetReplays,
  KEEP_DONE,
  keepRecording,
  leaveRecording,
  listReplays,
  recordFrame,
  resetReplayStore,
  useReplay,
} from '@/store/replay';

const OPTS: NewShiftOptions = {
  seed: 390002,
  regionId: 'louna',
  mode: 'free',
  difficulty: 'normal',
  start: tallinnTime(2026, 10, 24, 7, 0),
  hours: 2,
  playerName: 'Mari',
};

const keyOf = (s: SimState) => `${s.seed}:${s.startTime}`;
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Frames of the game loop: a step, then the recorder. */
function frames(s: SimState, minutes: number) {
  const end = s.now + minutes * MIN;
  while (s.now < end && !s.ended) {
    step(s, 3000);
    recordFrame(s, keyOf(s));
  }
}

beforeEach(() => resetReplayStore());

describe('replay on the device', () => {
  it('records the running shift from its first frame and keeps the finished replay for the report', async () => {
    const s = createShift(OPTS);
    s.flags.room = 'TEST01';
    recordFrame(s, keyOf(s));
    await tick();
    frames(s, 60);
    s.ended = true;
    const report = finalizeShift(s);
    const rep = (await finishReplay(s, keyOf(s), report))!;
    expect(rep.done).toBe(true);
    expect(rep.key).toBe(keyOf(s));
    expect(rep.from).toBe(s.startTime);
    expect(rep.to).toBe(s.now);
    expect(rep.score).toBe(Math.round(report.score));
    expect(useReplay.getState().last).toBe(rep);
    expect(await findRoomReplay('TEST01', s.seed)).toEqual(rep);
    const list = await listReplays();
    expect(list.map((x) => x.key)).toEqual([keyOf(s)]);
    expect(list[0]).not.toHaveProperty('rep');
    expect(list[0]).toMatchObject({ room: 'TEST01', mode: 'free', regionId: 'louna', score: rep.score });
  });

  it('records the same shift played again as a new run, which replaces the earlier one', async () => {
    const first = createShift(OPTS);
    recordFrame(first, keyOf(first));
    await tick();
    frames(first, 40);
    first.ended = true;
    const one = (await finishReplay(first, keyOf(first), null))!;
    // The same daily or challenge again: the same key, a new run from the start.
    const again = createShift(OPTS);
    recordFrame(again, keyOf(again));
    await tick();
    frames(again, 10);
    keepRecording();
    leaveRecording();
    // Its report right after a reload: this run's recording, not the earlier run's replay.
    const back = JSON.parse(JSON.stringify(again)) as SimState;
    back.ended = true;
    const two = (await finishReplay(back, keyOf(back), null))!;
    expect(two.to).toBe(back.now);
    expect(two.to).toBeLessThan(one.to);
    expect(await listReplays()).toHaveLength(1);
  });

  it('goes on after a reload with the recording kept, from the shift start', async () => {
    const s = createShift(OPTS);
    recordFrame(s, keyOf(s));
    await tick();
    frames(s, 30);
    keepRecording();
    leaveRecording();
    // The page comes back with the save: the first frame finds the kept recording.
    const back = JSON.parse(JSON.stringify(s)) as SimState;
    recordFrame(back, keyOf(back));
    await tick();
    frames(back, 30);
    back.ended = true;
    const rep = (await finishReplay(back, keyOf(back), finalizeShift(back)))!;
    expect(rep.from).toBe(back.startTime);
    expect(rep.gaps).toBeUndefined();
    expect(rep.to).toBe(back.now);
  });

  it('finishes from the kept recording when the report comes right after a reload', async () => {
    const s = createShift(OPTS);
    recordFrame(s, keyOf(s));
    await tick();
    frames(s, 20);
    keepRecording();
    leaveRecording();
    const back = JSON.parse(JSON.stringify(s)) as SimState;
    back.ended = true;
    const rep = (await finishReplay(back, keyOf(back), finalizeShift(back)))!;
    expect(rep.from).toBe(back.startTime);
    expect(rep.done).toBe(true);
    // Nothing of a shift played elsewhere: no replay.
    const other = createShift({ ...OPTS, seed: 1 });
    other.ended = true;
    expect(await finishReplay(other, keyOf(other), null)).toBeNull();
  });

  it('finds a room round by its code and seed, keeps only the last ones, and never records the director', async () => {
    for (let i = 0; i < KEEP_DONE + 2; i++) {
      const s = createShift({ ...OPTS, seed: 500 + i, hours: 1 });
      s.flags.room = 'K7M2QX';
      recordFrame(s, keyOf(s));
      await tick();
      frames(s, 2);
      s.ended = true;
      await finishReplay(s, keyOf(s), null);
      await new Promise((r) => setTimeout(r, 2));
    }
    const list = await listReplays();
    expect(list).toHaveLength(KEEP_DONE);
    expect(list[0].seed).toBe(500 + KEEP_DONE + 1);
    expect((await findRoomReplay('K7M2QX', 500 + KEEP_DONE))?.seed).toBe(500 + KEEP_DONE);
    expect(await findRoomReplay('K7M2QX', 500)).toBeNull();
    const d = createShift({ ...OPTS, mode: 'director' });
    recordFrame(d, keyOf(d));
    await tick();
    frames(d, 5);
    expect(await finishReplay(d, keyOf(d), null)).toBeNull();
  });

  it('forgets the replays of an identity whose cache leaves the device', async () => {
    const s = createShift(OPTS);
    recordFrame(s, keyOf(s));
    await tick();
    frames(s, 5);
    s.ended = true;
    await finishReplay(s, keyOf(s), null);
    expect(await listReplays()).toHaveLength(1);
    await forgetReplays('epd:acct:999:');
    expect(await listReplays()).toHaveLength(1);
    await forgetReplays(spacePrefix());
    expect(await listReplays()).toHaveLength(0);
  });
});
