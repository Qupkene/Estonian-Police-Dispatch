/**
 * Kaamerad (docs/CCTV.md section 14): one open camera over a real shift. The session builds the site, the light, the
 * cast and the director, and on every update reads the game, steps the director and hands the frame to the view
 * with the burned-in texts. A fake view stands in for the three.js one.
 */
import { describe, expect, it } from 'vitest';
import { directorSpawn, dispatchUnits } from '@/sim/commands';
import { createShift, step } from '@/sim/engine';
import { destination } from '@/sim/geo';
import { ddmmyyyy, hhmm, MIN, tallinnTime } from '@/sim/time';
import type { Incident, NewShiftOptions, SimState, Unit } from '@/sim/types';
import type { CameraInfo } from '@/cctv/coverage';
import type { Env } from '@/cctv/env';
import type { Osd } from '@/cctv/render/view';
import { dist, frameAt } from '@/cctv/math';
import { AFTER_HOLD_S, CameraSession, ENV_EVERY_S, mapPose, type SessionView } from '@/cctv/session';
import type { CarFrame, Frame } from '@/cctv/stage';
import type { Site, StreetData } from '@/cctv/types';

const OPTS: NewShiftOptions = {
  seed: 41_2026,
  regionId: 'pohja',
  mode: 'director',
  difficulty: 'normal',
  start: tallinnTime(2026, 10, 23, 14, 0),
  hours: 6,
  playerName: 'Kaamera',
  weather: 'clear',
};
const CAMERA: CameraInfo = { id: 'K-214', name: 'K-214 · Narva mnt', seed: 214 };
const VERSION = '2.41.0';
/** Game seconds per real second (the game's slowest speed) and real seconds per camera frame. */
const SPEED = 15;
const DT = 1 / 12;

class FakeView implements SessionView {
  scenes: { site: Site; env: Env }[] = [];
  envs: Env[] = [];
  renders: { frame: Frame; osd: Osd; zoom?: number }[] = [];
  setScene(site: Site, env: Env) {
    this.scenes.push({ site, env });
  }
  setEnv(env: Env) {
    this.envs.push(env);
  }
  render(frame: Frame, osd: Osd, zoom?: number) {
    this.renders.push({ frame, osd, zoom });
  }
  get last() {
    return this.renders[this.renders.length - 1];
  }
}

/** A street fight a few kilometres from a free patrol. */
function fight(km = 3, opts: Partial<NewShiftOptions> = {}): { s: SimState; inc: Incident; unit: Unit } {
  const s = createShift({ ...OPTS, ...opts });
  const unit = Object.values(s.units).find((u) => u.type === 'patrol' && u.status === 'available')!;
  const id = directorSpawn(s, { templateId: 'violence_bar_fight_outside', coord: destination(unit.pos, km, 70) });
  expect(id).not.toBe('');
  // Nobody hangs up on the camera's tests.
  s.incidents[id].expiresAt = undefined;
  return { s, inc: s.incidents[id], unit };
}

/** The game and the camera together: `seconds` of real time at `speed` (SPEED unless said), a frame each DT. */
function play(s: SimState, cam: CameraSession, seconds: number, until?: () => boolean, speed = SPEED) {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    step(s, Math.round(speed * DT * 1000));
    cam.update(s, speed, false, DT);
    if (until?.()) return;
  }
}

/** Where everybody in a frame stands, by id. */
const placesOf = (f: Frame) => new Map(f.people.map((p) => [p.id, p.pos] as const));

/** The greatest distance between where the same people stand in two frames (both must hold the same people). */
function apart(a: Frame, b: Frame): number {
  const pa = placesOf(a);
  const pb = placesOf(b);
  expect([...pb.keys()].sort()).toEqual([...pa.keys()].sort());
  let most = 0;
  for (const [id, p] of pa) most = Math.max(most, Math.hypot(p[0] - pb.get(id)![0], p[1] - pb.get(id)![1]));
  return most;
}

/** Metres everybody in the picture walked from frame to frame of `frames`, all together. */
function walked(frames: readonly Frame[]): number {
  let sum = 0;
  for (let i = 1; i < frames.length; i++) {
    const pb = placesOf(frames[i]);
    for (const [id, p] of placesOf(frames[i - 1])) {
      const q = pb.get(id);
      if (q) sum += Math.hypot(p[0] - q[0], p[1] - q[1]);
    }
  }
  return sum;
}

/**
 * A patrol sent 3 km to the fight with the camera open (its pace measured), the game played at `speedAt(game seconds
 * the game still gives the unit)`, a frame each DT; `pauseAt`: real seconds of pause when the unit is that many game
 * seconds out. Returns, in game seconds after the arrival the game first said: when the unit was on scene in the
 * game, when its car stood still in the picture, when the first officer was out, and the fastest the car moved
 * between two frames in metres per second of the street's own time.
 */
function approach(speedAt: (left: number) => number, pause?: { at: number; seconds: number }) {
  const { s, inc, unit } = fight();
  const view = new FakeView();
  const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
  play(s, cam, 1);
  expect(dispatchUnits(s, inc.id, [unit.id]).ok).toBe(true);
  const at = s.units[unit.id].move!.arriveAt;
  let onScene = Infinity;
  let stood = Infinity;
  let out = Infinity;
  let fastest = 0;
  let paused = false;
  let prev: CarFrame | undefined;
  for (let i = 0; i < 20_000 && (onScene === Infinity || stood === Infinity || out === Infinity); i++) {
    const left = (at - s.now) / 1000;
    const speed = speedAt(left);
    if (pause && !paused && left <= pause.at) {
      paused = true;
      const still = JSON.stringify(view.last.frame);
      for (let j = 0; j < Math.round(pause.seconds / DT); j++) cam.update(s, speed, true, DT);
      // Nothing on the street moved, the picture's clock stood too.
      expect(JSON.stringify(view.last.frame)).toBe(still);
    }
    step(s, Math.round(speed * DT * 1000));
    cam.update(s, speed, false, DT);
    const g = (s.now - at) / 1000;
    if (onScene === Infinity && s.units[unit.id].status === 'onscene') onScene = g;
    if (out === Infinity && view.last.frame.people.some((p) => p.id.startsWith(`o:${unit.id}:`))) out = g;
    const car = view.last.frame.cars.find((c) => c.id === `u:${unit.id}`);
    if (car && prev) {
      const d = Math.hypot(car.pos[0] - prev.pos[0], car.pos[1] - prev.pos[1]);
      fastest = Math.max(fastest, d / (DT * cam.scale));
      if (d < 0.005 && stood === Infinity && left < SPEED) stood = g;
    }
    prev = car;
  }
  expect(Number.isFinite(onScene) && Number.isFinite(stood) && Number.isFinite(out)).toBe(true);
  return { onScene, stood, out, fastest };
}

/** The arrival as the picture shows it, against the game's: in seconds of the street's own time (15 game seconds each). */
function expectOnTime(r: ReturnType<typeof approach>) {
  // The car stands within a second of the street's time of the game's arrival (its stop is seen a frame late at 8x).
  expect((r.stood - r.onScene) / SPEED).toBeGreaterThan(-1);
  expect((r.stood - r.onScene) / SPEED).toBeLessThanOrEqual(1);
  // Nobody is out of the car before the game says it is on scene, and they are out a few seconds after.
  expect(r.out).toBeGreaterThanOrEqual(r.onScene);
  expect((r.out - r.onScene) / SPEED).toBeLessThan(8);
  // Nothing jumps: never faster than a car drives.
  expect(r.fastest).toBeLessThan(35);
}

describe('cctv session: one open camera over a shift', () => {
  it("draws frames that hold the incident's people, and follows a patrol to the scene", () => {
    const { s, inc, unit } = fight();
    const view = new FakeView();
    const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
    expect(cam.state).toBe('live');
    expect(view.scenes).toHaveLength(1);
    cam.update(s, SPEED, false, DT);
    expect(view.renders).toHaveLength(1);
    const ids = view.last.frame.people.map((p) => p.id);
    const persons = inc.persons.filter((r) => r.role !== 'missing' && r.role !== 'deceased').map((r) => `p:${r.personId}`);
    expect(persons.length).toBeGreaterThan(0);
    // A street fight is under way when the camera opens: its people are on the street.
    for (const p of persons) expect(ids).toContain(p);
    expect(cam.phase).toBe('open');
    // The texts burned into the picture.
    expect(view.last.osd.name).toBe(CAMERA.name);
    expect(view.last.osd.mark).toBe(`EPD v${VERSION}`);

    expect(dispatchUnits(s, inc.id, [unit.id]).ok).toBe(true);
    play(s, cam, 600, () => s.units[unit.id].status === 'onscene');
    expect(s.units[unit.id].status).toBe('onscene');
    // Let the arrival play out on the camera's own clock.
    play(s, cam, 30);
    expect(cam.phase).not.toBe('open');
    expect(view.last.frame.cars.length).toBeGreaterThan(0);
    expect(view.renders.length).toBeGreaterThan(100);
  });

  it("shows the game's date and clock and refreshes the light no more often than every two real seconds", () => {
    const { s, inc } = fight();
    const view = new FakeView();
    const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
    cam.update(s, SPEED, false, DT);
    expect(view.last.osd.clock).toBe(`${ddmmyyyy(s.now)} ${hhmm(s.now)}`);
    step(s, 10 * MIN);
    cam.update(s, SPEED, false, DT);
    expect(view.last.osd.clock).toBe(`${ddmmyyyy(s.now)} ${hhmm(s.now)}`);
    expect(view.last.osd.clock).toMatch(/^23\.10\.2026 14:1\d$/);
    // Three real seconds of frames at the fastest speed: the light is read once, not every frame.
    const before = view.envs.length;
    for (let i = 0; i < Math.round(3 / DT); i++) {
      step(s, Math.round(120 * DT * 1000));
      cam.update(s, 120, false, DT);
    }
    expect(view.envs.length - before).toBe(Math.floor(3 / ENV_EVERY_S));
  });

  it("dusk falls on the picture as the game's clock runs into the evening", () => {
    const { s, inc } = fight(3, { start: tallinnTime(2026, 10, 23, 17, 0) });
    const view = new FakeView();
    const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
    expect(cam.light.night).toBe(0);
    // Two game hours at the fastest speed take a minute of real time.
    for (let i = 0; i < Math.round(60 / DT); i++) {
      step(s, Math.round(120 * DT * 1000));
      if (s.incidents[inc.id]) cam.update(s, 120, false, DT);
    }
    expect(view.envs.length).toBeGreaterThan(20);
    expect(view.envs[view.envs.length - 1].night).toBeGreaterThan(0.5);
  });

  it('moves nothing while the game is paused, and draws again as it stands for a zoom', () => {
    const { s, inc } = fight();
    const view = new FakeView();
    const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
    play(s, cam, 2);
    const still = JSON.stringify(view.last.frame);
    const clock = view.last.osd.clock;
    for (let i = 0; i < 24; i++) cam.update(s, SPEED, true, DT);
    expect(JSON.stringify(view.last.frame)).toBe(still);
    expect(view.last.osd.clock).toBe(clock);
    cam.zoom = 2;
    cam.draw();
    expect(view.last.zoom).toBe(2);
    expect(JSON.stringify(view.last.frame)).toBe(still);
  });

  it('plays the street at the pace the game clock really keeps, not at the nominal speed alone', () => {
    const { s, inc } = fight();
    const view = new FakeView();
    const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
    // A slow device: the game plays only part of each frame's game time (its frames are clamped), the camera is told
    // the nominal speed all the same.
    const slow = (seconds: number, share: number, speed = SPEED) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        step(s, Math.round(speed * DT * 1000 * share));
        cam.update(s, speed, false, DT);
      }
    };
    // Nominal until the first window is measured.
    cam.update(s, SPEED, false, DT);
    expect(cam.speed).toBe(SPEED);
    slow(4, 0.5);
    expect(cam.speed).toBeGreaterThan(SPEED * 0.45);
    expect(cam.speed).toBeLessThan(SPEED * 0.55);
    // The game catches up: so does the picture.
    slow(6, 1);
    expect(cam.speed).toBeGreaterThan(SPEED * 0.97);
    expect(cam.speed).toBeLessThan(SPEED * 1.03);
    // A faster speed is followed at once, at the pace last measured; a pause keeps the speed it stood at.
    slow(4, 0.5);
    cam.update(s, 4 * SPEED, false, DT);
    expect(cam.speed).toBeGreaterThan(4 * SPEED * 0.45);
    expect(cam.speed).toBeLessThan(4 * SPEED * 0.55);
    const held = cam.speed;
    for (let i = 0; i < 12; i++) cam.update(s, 4 * SPEED, true, DT);
    expect(cam.speed).toBe(held);
  });

  it('at 2x, 4x and 8x the street runs two, four and eight times as fast, like a recording played faster', () => {
    for (const k of [2, 4, 8]) {
      // One real second at k times the 1x speed against k real seconds at 1x: the same game minute, the same street.
      const a = fight();
      const fast = new FakeView();
      // With the street's own passers-by, who walk.
      const camA = new CameraSession(fast, a.s, a.inc, CAMERA, null, VERSION);
      // Each settles its stage first (an update in a paused game plays nothing).
      camA.update(a.s, k * SPEED, true, DT);
      play(a.s, camA, 1, undefined, k * SPEED);
      expect(camA.scale).toBeCloseTo(k, 6);
      const b = fight();
      const slow = new FakeView();
      const camB = new CameraSession(slow, b.s, b.inc, CAMERA, null, VERSION);
      camB.update(b.s, SPEED, true, DT);
      play(b.s, camB, k);
      expect(camB.scale).toBe(1);
      // Frame j at kx is frame j * k at 1x: everybody stands where they stood then.
      const fastFrames = fast.renders.map((r) => r.frame);
      const slowFrames = slow.renders.filter((_, i) => i % k === 0).map((r) => r.frame);
      expect(fastFrames).toHaveLength(slowFrames.length);
      for (let i = 0; i < fastFrames.length; i++) expect(apart(fastFrames[i], slowFrames[i])).toBeLessThan(0.05);
      // So in that one real second the people on the street covered the ground they cover in k real seconds at 1x:
      // k times the ground a real second.
      const perSecondFast = walked(fastFrames);
      const perSecondSlow = walked(slowFrames) / k;
      expect(perSecondSlow).toBeGreaterThan(1);
      expect(perSecondFast / perSecondSlow).toBeCloseTo(k, 1);
      const startA = fastFrames[0];
      // The picture's own life keeps its real pace: its clock ran one second.
      expect(fast.last.frame.t - startA.t).toBeCloseTo(1, 6);
    }
  });

  it('at the real-time speed and while a 112 call is open the street runs as at 1x', () => {
    const at = (speed: number) => {
      const { s, inc } = fight();
      const view = new FakeView();
      const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
      play(s, cam, 3, undefined, speed);
      expect(cam.scale).toBe(1);
      return view.last.frame;
    };
    const base = at(SPEED);
    // The real-time mode (1 game second a second) and an open call (2).
    expect(apart(at(1), base)).toBeLessThan(0.05);
    expect(apart(at(2), base)).toBeLessThan(0.05);
  });

  it('a patrol stands in the picture when the game says it is on scene, at 1x, 4x and 8x, and nobody is out before', () => {
    for (const speed of [SPEED, 4 * SPEED, 8 * SPEED]) expectOnTime(approach(() => speed));
  });

  it('a change of speed in the middle of the approach takes effect at once, and nothing jumps', () => {
    // 1x, then 8x for the 30 game seconds from a minute out, then 1x again; and the other way round.
    expectOnTime(approach((left) => (left < 60 && left > 30 ? 8 * SPEED : SPEED)));
    expectOnTime(approach((left) => (left < 60 && left > 30 ? SPEED : 8 * SPEED)));
    // 1x until a minute out, then 8x to the end.
    expectOnTime(approach((left) => (left < 60 ? 8 * SPEED : SPEED)));
  });

  it('a pause in the middle of the approach at 8x holds the street, and the patrol still stops on time', () => {
    expectOnTime(approach(() => 8 * SPEED, { at: 40, seconds: 2 }));
    expectOnTime(approach(() => SPEED, { at: 40, seconds: 2 }));
  });

  it('a slow frame at 8x is played in full, four seconds of the street', () => {
    const { s, inc } = fight();
    const view = new FakeView();
    const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
    cam.update(s, 8 * SPEED, true, DT);
    // Half a real second (the longest frame the session plays) at 8x: four seconds of the street.
    step(s, Math.round(8 * SPEED * 0.5 * 1000));
    cam.update(s, 8 * SPEED, false, 0.5);
    const b = fight();
    const slowView = new FakeView();
    const ref = new CameraSession(slowView, b.s, b.inc, CAMERA, null, VERSION, { quiet: true });
    ref.update(b.s, SPEED, true, DT);
    // The same street at 1x after two and after four real seconds: the slow frame is the one after four.
    play(b.s, ref, 2);
    const two = slowView.last.frame;
    play(b.s, ref, 2);
    expect(apart(view.last.frame, slowView.last.frame)).toBeLessThan(0.05);
    expect(apart(view.last.frame, two)).toBeGreaterThan(0.1);
  });

  it("on a slow device, opened as the patrol arrives, the crew gets out only after the game says it is on scene", () => {
    // The game clock at a third of the nominal speed; the camera opened when the patrol is `away` game seconds out.
    // Until the pace is measured (half a second) a unit about to arrive is held back, then it is planned on the
    // measured speed: without that the crew was out 6 s (70 game s) to 11 s (100 game s) early.
    const open = (share: number, away: number) => {
      const { s, inc, unit } = fight();
      expect(dispatchUnits(s, inc.id, [unit.id]).ok).toBe(true);
      while ((s.units[unit.id].move?.arriveAt ?? 0) - s.now > away * 1000) step(s, 500);
      const view = new FakeView();
      const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
      cam.stage(s);
      let real = 0;
      let onScene = Infinity;
      let out = Infinity;
      for (let i = 0; i < 2400 && (onScene === Infinity || out === Infinity); i++) {
        step(s, Math.round(SPEED * DT * 1000 * share));
        cam.update(s, SPEED, false, DT);
        real += DT;
        if (onScene === Infinity && s.units[unit.id].status === 'onscene') onScene = real;
        if (out === Infinity && view.last.frame.people.some((p) => p.id.startsWith(`o:${unit.id}:`))) out = real;
      }
      expect(Number.isFinite(onScene) && Number.isFinite(out)).toBe(true);
      return out - onScene;
    };
    for (const away of [70, 100]) expect(open(1 / 3, away)).toBeGreaterThanOrEqual(0);
    // At full pace the arrival is as before: the crew out a few seconds after the car stops.
    const full = open(1, 70);
    expect(full).toBeGreaterThanOrEqual(0);
    expect(full).toBeLessThan(8);
  });

  it('tells the view which vehicles are on their way, once each time the list changes', () => {
    const { s, inc, unit } = fight();
    const told: string[][] = [];
    const view = new FakeView();
    const cam = new CameraSession(Object.assign(view, { expect: (looks: readonly { livery: string }[]) => told.push(looks.map((l) => l.livery)) }), s, inc, CAMERA, null, VERSION, {
      quiet: true,
    });
    cam.stage(s);
    expect(told).toHaveLength(0);
    expect(dispatchUnits(s, inc.id, [unit.id]).ok).toBe(true);
    play(s, cam, 3);
    expect(told).toEqual([['police']]);
  });

  it('settles the first frame without drawing it (the view prepares on it), and goes on from it', () => {
    const { s, inc } = fight();
    const view = new FakeView();
    const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
    const first = cam.stage(s);
    expect(first).not.toBeNull();
    expect(first!.people.length).toBeGreaterThan(0);
    expect(view.renders).toHaveLength(0);
    expect(cam.stage(s)).toBe(first);
    // The first update while paused draws that frame as it stands.
    cam.update(s, SPEED, true, DT);
    expect(view.renders).toHaveLength(1);
    expect(JSON.stringify(view.last.frame)).toBe(JSON.stringify(first));
    play(s, cam, 1);
    expect(view.renders.length).toBeGreaterThan(10);
  });

  it('opened while the game is paused, the first frame still shows the scene as it stands', () => {
    const { s, inc } = fight();
    const view = new FakeView();
    const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
    cam.update(s, 0, true, DT);
    expect(view.renders).toHaveLength(1);
    expect(view.last.frame.people.length).toBeGreaterThan(0);
  });

  it('ends once the patrol has closed the incident and the street has emptied, and draws nothing after', () => {
    const { s, inc, unit } = fight(2);
    const view = new FakeView();
    const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
    expect(dispatchUnits(s, inc.id, [unit.id]).ok).toBe(true);
    // The game's fastest speed: the patrol drives there, deals with the fight and the incident closes in the game.
    const FAST = 120;
    let ended = -1;
    let after = -1;
    let last = -1;
    for (let i = 0; i < Math.round(900 / DT) && cam.state === 'live'; i++) {
      step(s, Math.round(FAST * DT * 1000));
      cam.update(s, FAST, false, DT);
      if (s.incidents[inc.id].state === 'closed' && ended < 0) ended = i;
      if (s.incidents[inc.id].state === 'closed' && cam.phase === 'after' && after < 0) after = i;
      last = i;
    }
    // Closed in the game, not removed from it: incidents stay in the simulation for the whole shift.
    expect(ended).toBeGreaterThan(0);
    expect(s.incidents[inc.id]).toBeDefined();
    expect(cam.phase).toBe('after');
    expect(cam.state).toBe('ended');
    // It held the empty street for AFTER_HOLD_S real seconds before ending, though the street itself ran at 8x.
    expect((last - after + 1) * DT).toBeCloseTo(AFTER_HOLD_S, 1);
    const drawn = view.renders.length;
    cam.update(s, FAST, false, DT);
    cam.draw();
    expect(view.renders.length).toBe(drawn);
  });

  it('ends at once when the incident is no longer in the simulation (a replay seeks past it)', () => {
    const { s, inc } = fight();
    const view = new FakeView();
    const cam = new CameraSession(view, s, inc, CAMERA, null, VERSION, { quiet: true });
    play(s, cam, 1);
    const drawn = view.renders.length;
    delete s.incidents[inc.id];
    s.incidentOrder = s.incidentOrder.filter((id) => id !== inc.id);
    cam.update(s, SPEED, false, DT);
    expect(cam.state).toBe('ended');
    expect(view.renders.length).toBe(drawn);
  });

  it('falls back to a made-up street when the map gave none, or nothing usable', () => {
    const { s, inc } = fight();
    const a = new CameraSession(new FakeView(), s, inc, CAMERA, null, VERSION, { quiet: true });
    expect(a.street.source).toBe('made');
    const empty: StreetData = { source: 'tiles', radius: 160, roads: [], buildings: [], areas: [] };
    const b = new CameraSession(new FakeView(), s, inc, CAMERA, empty, VERSION, { quiet: true });
    expect(b.street.source).toBe('made');
    expect(b.site.drive.pts.length).toBeGreaterThan(1);
  });

  it('the same incident shows the same place twice, and another camera another one', () => {
    const { s, inc } = fight();
    const a = new CameraSession(new FakeView(), s, inc, CAMERA, null, VERSION, { quiet: true });
    const b = new CameraSession(new FakeView(), s, inc, CAMERA, null, VERSION, { quiet: true });
    expect(JSON.stringify(b.site)).toBe(JSON.stringify(a.site));
    expect(JSON.stringify(b.cast)).toBe(JSON.stringify(a.cast));
    const c = new CameraSession(new FakeView(), s, inc, { ...CAMERA, seed: 999 }, null, VERSION, { quiet: true });
    expect(JSON.stringify(c.site)).not.toBe(JSON.stringify(a.site));
  });

  it("tells a made-up street the incident's place: a house of the street is the bar, with its name", () => {
    const { s, inc } = fight();
    const bar: Incident = { ...inc, location: { ...inc.location, placeKind: 'bar', placeName: 'Kuku klubi' } };
    const cam = new CameraSession(new FakeView(), s, bar, CAMERA, null, VERSION, { quiet: true });
    expect(cam.site.place).toMatchObject({ kind: 'bar', name: 'Kuku klubi' });
    expect(cam.site.street.buildings.some((b) => b.id === cam.site.place!.building)).toBe(true);
    expect(cam.site.place!.front).not.toBeNull();
    const plain: Incident = { ...inc, location: { ...inc.location, placeKind: 'street', placeName: undefined } };
    expect(new CameraSession(new FakeView(), s, plain, CAMERA, null, VERSION, { quiet: true }).site.place).toBeNull();
  });

  it("the session's street is the site's own, with what stands before the place added to the map's", () => {
    const { s, inc } = fight();
    const read: StreetData = {
      source: 'tiles',
      radius: 160,
      roads: [{ cls: 'secondary', pts: [[-150, -20], [150, -20]], width: 7, oneway: 0, walk: true }],
      buildings: [],
      areas: [],
      origin: [24.75, 59.44],
      place: { kind: 'gasstation', name: 'Olerex', at: [0, 0] },
    };
    const cam = new CameraSession(new FakeView(), s, inc, CAMERA, read, VERSION, { quiet: true });
    expect(cam.street).toBe(cam.site.street);
    expect(cam.street.source).toBe('tiles');
    expect(cam.street.buildings.some((b) => b.open && b.area >= 80)).toBe(true);
    expect(read.buildings.length).toBe(0);
  });
});

describe('cctv session: where the camera is on the map', () => {
  const ORIGIN: [number, number] = [24.7536, 59.437];
  const read: StreetData = {
    source: 'tiles',
    radius: 160,
    roads: [{ cls: 'residential', pts: [[-150, -6], [150, -6]], width: 5.6, oneway: 0, walk: true }],
    buildings: [{ id: 1, ring: [[-12, 2], [12, 2], [12, 14], [-12, 14]], height: 9, base: 0, area: 288, roof: 'flat' }],
    areas: [],
    origin: ORIGIN,
  };

  it('gives the camera, the spot, the bearing, the opening and the reach in map coordinates', () => {
    const { s, inc } = fight();
    for (const seed of [1, 214, 999, 4242]) {
      const { site } = new CameraSession(new FakeView(), s, inc, { ...CAMERA, seed }, read, VERSION, { quiet: true });
      const pose = mapPose(site)!;
      const frame = frameAt(ORIGIN);
      expect(dist(frame.toLocal(pose.at), site.camera.pos)).toBeLessThan(0.01);
      expect(dist(frame.toLocal(pose.spot), site.spot)).toBeLessThan(0.01);
      // Degrees clockwise from north: east of north is positive x.
      const dx = site.camera.target[0] - site.camera.pos[0];
      const dy = site.camera.target[1] - site.camera.pos[1];
      const want = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      expect(Math.abs(((pose.bearing - want + 540) % 360) - 180)).toBeLessThan(1e-6);
      expect(pose.fovH).toBeCloseTo((2 * Math.atan(Math.tan((site.camera.fov * Math.PI) / 360) * (16 / 9)) * 180) / Math.PI, 6);
      expect(pose.fovH).toBeGreaterThan(site.camera.fov);
      expect(pose.reach).toBeGreaterThanOrEqual(Math.min(90, dist(site.camera.pos, site.spot)));
      expect(pose.reach).toBeGreaterThanOrEqual(20);
      expect(pose.reach).toBeLessThanOrEqual(90);
    }
  });

  it('north is 0, east 90, south 180, west 270', () => {
    const { s, inc } = fight();
    const { site } = new CameraSession(new FakeView(), s, inc, CAMERA, read, VERSION, { quiet: true });
    const looking = (target: [number, number]) => mapPose({ ...site, camera: { ...site.camera, pos: [0, 0], target } })!.bearing;
    expect(looking([0, 10])).toBeCloseTo(0, 6);
    expect(looking([10, 0])).toBeCloseTo(90, 6);
    expect(looking([0, -10])).toBeCloseTo(180, 6);
    expect(looking([-10, 0])).toBeCloseTo(270, 6);
    expect(looking([-10, 10])).toBeCloseTo(315, 6);
  });

  it('a petrol station the map has no room for is shown on a made-up street of its kind, nowhere on the map', () => {
    const { s, inc } = fight();
    const fuel: Incident = { ...inc, location: { ...inc.location, placeKind: 'gasstation', placeName: 'Olerex' } };
    // tiles.ts readStreet gave no street for it (tests/cctv-tiles.test.ts): the session makes one up.
    const cam = new CameraSession(new FakeView(), s, fuel, CAMERA, null, VERSION, { quiet: true });
    expect(cam.street.source).toBe('made');
    expect(cam.street.buildings.some((b) => b.open && b.area >= 80)).toBe(true);
    expect(cam.site.place).toMatchObject({ kind: 'gasstation', name: 'Olerex' });
    expect(mapPose(cam.site)).toBeNull();
  });

  it('a made-up street is nowhere on the map: no pose', () => {
    const { s, inc } = fight();
    const made = new CameraSession(new FakeView(), s, inc, CAMERA, null, VERSION, { quiet: true });
    expect(mapPose(made.site)).toBeNull();
    // Nor a map street that does not say where it was read.
    const { origin: _origin, ...nowhere } = read;
    expect(mapPose(new CameraSession(new FakeView(), s, inc, CAMERA, nowhere, VERSION, { quiet: true }).site)).toBeNull();
  });
});
