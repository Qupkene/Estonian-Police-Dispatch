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
import { CameraSession, ENV_EVERY_S, type SessionView } from '@/cctv/session';
import type { Frame } from '@/cctv/stage';
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

/** The game and the camera together: `seconds` of real time at SPEED, a frame each DT. */
function play(s: SimState, cam: CameraSession, seconds: number, until?: () => boolean) {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    step(s, Math.round(SPEED * DT * 1000));
    cam.update(s, SPEED, false, DT);
    if (until?.()) return;
  }
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
    for (let i = 0; i < Math.round(900 / DT) && cam.state === 'live'; i++) {
      step(s, Math.round(FAST * DT * 1000));
      cam.update(s, FAST, false, DT);
      if (s.incidents[inc.id].state === 'closed' && ended < 0) ended = i;
    }
    // Closed in the game, not removed from it: incidents stay in the simulation for the whole shift.
    expect(ended).toBeGreaterThan(0);
    expect(s.incidents[inc.id]).toBeDefined();
    expect(cam.phase).toBe('after');
    expect(cam.state).toBe('ended');
    // It held the empty street for AFTER_HOLD_S real seconds before ending.
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
});
