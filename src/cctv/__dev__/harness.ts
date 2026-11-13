// Dev-only: draws a camera picture without the game, for looking at the renderer (see harness.html).
import type { PlaceKind, Weather } from '@/sim/types';
import { VERSION } from '@/ui/screens/shell/helpers';
import { envAt } from '../env';
import { lookOfCrew, lookOfStranger, poseOf, type Act, type Gait } from '../figure';
import { along, left, mul, yawOf } from '../math';
import { makeStreet } from '../procedural';
import { loadHumanBase } from '../render/human';
import { CameraView, type CarFrame, type Frame, type PersonFrame } from '../render/view';
import { buildSite, onDrive } from '../site';
import { lookOfAgency, lookOfAnyCar, lookOfUnit } from '../vehicle';

const q = new URLSearchParams(location.search);
const kind = (q.get('kind') ?? 'street') as PlaceKind;
const seed = Number(q.get('seed') ?? 3);
const hour = Number(q.get('hour') ?? 14);
const month = Number(q.get('month') ?? 7);
const weatherKind = (q.get('weather') ?? 'clear') as Weather['kind'];
const temp = Number(q.get('temp') ?? (month <= 2 || month === 12 ? -4 : 16));
const log = document.getElementById('log')!;

const street = makeStreet(kind, seed);
const site = buildSite(street, seed)!;
// ?near=<metres>: look at the spot from close by and low, to inspect the models.
if (q.get('near')) {
  const d = Number(q.get('near'));
  const a = Number(q.get('angle') ?? 0.6);
  const n = mul(left(site.dir), -site.side);
  // ?at=<metres along the road from the spot>,<metres to the left of the road's middle>: what to look at.
  const at = q.get('at')?.split(',').map(Number);
  const target = at ? onDrive(site.drive, site.drive.at + at[0], at[1]).pos : site.spot;
  site.camera = { ...site.camera, pos: along(along(target, n, d * Math.cos(a)), site.dir, d * Math.sin(a)), height: Number(q.get('h') ?? 2.4), target, targetHeight: 1, fov: Number(q.get('fov') ?? 34) };
}
// Tallinn local time is UTC+2 in winter, +3 in summer: close enough for a harness.
const t0 = Date.UTC(2026, month - 1, 14, hour - (month >= 4 && month <= 10 ? 3 : 2), 20);
const weather: Weather = { kind: weatherKind, tempC: temp, windMs: Number(q.get('wind') ?? 4), roadFactor: 1, text: { et: '', en: '' } };
const env = envAt(t0, [24.75, 59.44], weather);
const view = new CameraView(document.getElementById('c') as HTMLCanvasElement);
view.setScene(site, env);
if (!q.get('dolls')) view.setHumans(await loadHumanBase());
// ?clean=1: the picture without the camera's own faults.
if (q.get('clean')) {
  const v = view as unknown as { post: { setLook: (l: unknown) => void }; look: Record<string, unknown> };
  v.post.setLook({ ...v.look, noise: 0, blocks: 0, soft: 0, trail: 0, vignette: 0, scan: 0, barrel: 0, saturation: 1, contrast: 1, lift: 0 });
}
const dress = { season: env.season, temp };

const ALL_ACTS: Act[] = ['idle', 'talk', 'argue', 'phone', 'wave', 'notes', 'guard', 'aim', 'handsUp', 'cuffed', 'brandish', 'fight', 'fight', 'grapple', 'kick', 'sway', 'lie', 'prone', 'sit', 'kneel', 'crouch', 'aid', 'cpr', 'cold', 'smoke', 'chant', 'direct', 'look'];
const ACTS: Act[] = q.get('acts') ? (q.get('acts')!.split(',') as Act[]) : ALL_ACTS;
const ROWS = q.get('acts') ? 1 : 2;
const GAITS: Gait[] = ['walk', 'run', 'stagger', 'walk', 'run'];

function frame(t: number): Frame {
  const people: PersonFrame[] = [];
  const cars: CarFrame[] = [];
  const dir = site.dir;
  const n = mul(left(dir), site.side);
  // A line of figures along the pavement, one per act.
  ACTS.forEach((act, i) => {
    const row = i % ROWS;
    const p = along(along(site.spot, dir, (Math.floor(i / ROWS) - ACTS.length / ROWS / 2 + 0.5) * (ROWS === 1 ? 1.25 : 1.5)), n, row * 1.6);
    const look = i % 5 === 1 ? lookOfCrew('police', i, i % 2 ? 'M' : 'F', dress) : i % 9 === 4 ? lookOfCrew('medic', i, 'F', dress) : lookOfStranger(i * 31 + seed, dress);
    people.push({ id: `a${i}`, look, pos: p, yaw: yawOf(mul(n, -1)), pose: poseOf({ act, actT: t, gait: null, phase: 0, seed: i * 7 + 1, t }), scale: 1 });
  });
  // Walkers and runners going round on the road side.
  GAITS.forEach((g, i) => {
    const speed = g === 'run' ? 4.6 : g === 'stagger' ? 0.75 : 1.35;
    const stride = g === 'run' ? 2.5 : g === 'stagger' ? 1.05 : 1.45;
    const s = ((t * speed + i * 9) % 40) - 20;
    const p = onDrive(site.drive, site.drive.at + s, -site.side * (site.drive.width / 2 + 1.3 + (i % 2)));
    people.push({ id: `w${i}`, look: lookOfStranger(900 + i, dress), pos: p.pos, yaw: yawOf(p.dir), pose: poseOf({ act: i === 3 ? 'phone' : 'idle', actT: t, gait: g, phase: ((t * speed) / stride) * Math.PI * 2, seed: i, t }), scale: 1 });
  });
  const lane = site.drive.width / 2 - 1.15;
  const show = (q.get('cars') ?? '').split(',').filter(Boolean);
  if (show.length) {
    // ?cars=police:estate,amb,civ:suv,...: a row of chosen vehicles along the kerb, 7 m apart.
    show.forEach((spec, i) => {
      const [kind, body] = spec.split(':');
      const p = onDrive(site.drive, site.drive.at - 4 + i * 7, -lane);
      const look =
        kind === 'police' ? lookOfUnit('patrol', body === 'suv' ? 'Škoda Kodiaq' : body === 'van' ? 'Volkswagen Transporter' : 'Škoda Octavia Combi')
        : kind === 'plain' ? lookOfUnit('criminal', 'Škoda Superb (märgistamata)')
        : kind === 'amb' ? lookOfAgency('kiirabi')!
        : kind === 'fire' ? lookOfAgency('paaste')!
        : { ...lookOfAnyCar(seed + i * 13), ...(body ? { body: body as 'hatch' } : {}) };
      cars.push({ id: `s${i}`, look, pos: p.pos, yaw: yawOf(p.dir), lights: { beacons: kind !== 'civ' && !q.get('dark'), lamps: !!q.get('lamps'), hazard: false, braking: false } });
    });
    return { t, people, cars, smoke: null };
  }
  const p1 = onDrive(site.drive, site.drive.at - 8, -lane);
  cars.push({ id: 'police', look: lookOfUnit('patrol', 'Škoda Octavia Combi'), pos: p1.pos, yaw: yawOf(p1.dir), lights: { beacons: true, lamps: true, hazard: false, braking: false } });
  const p2 = onDrive(site.drive, site.drive.at - 16, -lane);
  cars.push({ id: 'amb', look: lookOfAgency('kiirabi')!, pos: p2.pos, yaw: yawOf(p2.dir), lights: { beacons: true, lamps: true, hazard: false, braking: false } });
  const p3 = onDrive(site.drive, site.drive.at + 9, lane);
  cars.push({ id: 'civ', look: lookOfAnyCar(seed + 5), pos: p3.pos, yaw: yawOf(mul(p3.dir, -1)), lights: { beacons: false, lamps: false, hazard: true, braking: false } });
  const p4 = onDrive(site.drive, site.drive.at + ((t * 9) % 120) - 60, -site.drive.width / 4);
  cars.push({ id: 'pass', look: lookOfAnyCar(seed + 9), pos: p4.pos, yaw: yawOf(p4.dir), lights: { beacons: false, lamps: true, hazard: false, braking: false } });
  const smoke = q.get('smoke') ? { at: site.door ?? site.spot, height: 6, strength: 1 } : null;
  return { t, people, cars, smoke };
}

let t = Number(q.get('t') ?? 0);
const osd = () => ({ name: `CAM ${String(seed % 900 + 100)} · ${kind.toUpperCase()}`, clock: `14.${String(month).padStart(2, '0')}.2026 ${String(hour).padStart(2, '0')}:20`, note: '', mark: `EPD v${VERSION}`, rec: Math.floor(t) % 2 === 0 });
const zoom = Number(q.get('zoom') ?? 1);
function draw() {
  view.render(frame(t), osd(), zoom);
}
const api = {
  ready: true,
  /** Advance the scene's clock and draw `frames` frames. */
  step(dt: number, frames = 1) {
    for (let i = 0; i < frames; i++) {
      t += dt;
      draw();
    }
    return t;
  },
};
(window as unknown as { __cctv: typeof api; __view: CameraView; __site: typeof site }).__cctv = api;
(window as unknown as { __view: CameraView }).__view = view;
(window as unknown as { __site: typeof site }).__site = site;
log.textContent = `kind=${kind} seed=${seed} source=${street.source} sun=${env.sunAlt.toFixed(1)} night=${env.night.toFixed(2)} cam=${site.camera.mount} h=${site.camera.height.toFixed(1)} buildings=${street.buildings.length}`;
if (!q.get('manual')) {
  let last = performance.now();
  const loop = (now: number) => {
    if (now - last >= 80) {
      t += (now - last) / 1000;
      last = now;
      draw();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} else draw();
