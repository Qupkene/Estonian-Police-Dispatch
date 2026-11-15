// Dev-only: the camera's vehicles on plain asphalt, for looking at the models (see vehicles.html). Parameters:
//   car=<id>[,<id>...]   which vehicles, side by side (ids below); set=police|ems|civil|all instead of a list
//   view=front|rear|side|top|cctv   front and rear three-quarter, side-on, from above, or a street camera 6 m up 15 m away
//   flip=1 the other side; night=1; lamps=1; beacons=1; hazard=1; braking=1; t=<s> the moment of the flash pattern
//   cam=x,y,z at=x,y,z fov=<deg> any other camera (car space: x forwards, z to its right)
//   low=1 the parked cars' level of detail (drawCar baked into vertex colours) instead of a moving car
import {
  AmbientLight,
  BackSide,
  BufferAttribute,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
  type Texture,
} from 'three';
import { beamTexture, glowTexture } from '../render/textures';
import { CarMesh, carMaterials, drawCar, type CarBuilders } from '../render/cars';
import { MeshBuilder } from '../render/mesh';
import { CAR_SIZE, lookOfAgency, lookOfAnyCar, lookOfUnit, type CarBody, type CarLook } from '../vehicle';

const q = new URLSearchParams(location.search);
const night = q.get('night') === '1';
const view = q.get('view') ?? 'front';
const flip = q.get('flip') === '1' ? -1 : 1;

const civil = (body: CarBody, seed: number, over: Partial<CarLook> = {}): CarLook => ({ ...lookOfAnyCar(seed), body, livery: 'none', ...over });
const CARS: Record<string, () => CarLook> = {
  octavia: () => lookOfUnit('patrol', 'Škoda Octavia Combi'),
  superb: () => lookOfUnit('patrol', 'Škoda Superb Combi'),
  kodiaq: () => lookOfUnit('patrol', 'Škoda Kodiaq'),
  local: () => lookOfUnit('community', 'Škoda Kodiaq'),
  tiguan: () => lookOfUnit('patrol', 'Volkswagen Tiguan'),
  scala: () => lookOfUnit('patrol', 'Škoda Scala'),
  id4: () => lookOfUnit('patrol', 'Volkswagen ID.4 GTX'),
  rav4: () => lookOfUnit('patrol', 'Toyota RAV4 Hybrid'),
  patrol: () => lookOfUnit('border', 'Nissan Patrol'),
  amarok: () => lookOfUnit('border', 'Volkswagen Amarok'),
  transporter: () => lookOfUnit('k9', 'Volkswagen Transporter (koeraboksiga)'),
  vito: () => lookOfUnit('patrol', 'Mercedes-Benz Vito'),
  sprinter: () => lookOfUnit('transport', 'Mercedes-Benz Sprinter (konvoibuss)'),
  unmarked: () => lookOfUnit('criminal', 'Škoda Superb (märgistamata)'),
  bmw: () => lookOfUnit('criminal', 'BMW 530d xDrive (märgistamata)'),
  special: () => lookOfUnit('special', 'Mercedes-Benz Sprinter (eriüksus)'),
  amb: () => lookOfAgency('kiirabi')!,
  fire: () => lookOfAgency('paaste')!,
  hatch: () => civil('hatch', 11, { model: undefined, color: 0xa8231f }),
  golf: () => civil('hatch', 12, { model: 'scala', color: 0x2b4f8f, metallic: true }),
  sedan: () => civil('sedan', 13, { model: undefined, color: 0x17181a, metallic: false }),
  estate: () => civil('estate', 14, { model: 'passat', color: 0xb4b8bd, metallic: true }),
  suv: () => civil('suv', 15, { model: 'rav4', color: 0x7c7f84, metallic: true }),
  suv2: () => civil('suv', 16, { model: undefined, color: 0xe9e9e6 }),
  van: () => civil('van', 17, { model: 'transporter', color: 0xe9e9e6 }),
  pickup: () => civil('pickup', 18, { model: 'amarok', color: 0x1f3d2a, metallic: true }),
  truck: () => civil('truck', 19, { color: 0xe9e9e6 }),
  bus: () => civil('bus', 20, { color: 0x2f6b3a }),
  moto: () => civil('moto', 21, { color: 0x17181a }),
};
const SETS: Record<string, string[]> = {
  police: ['octavia', 'superb', 'kodiaq', 'local', 'transporter', 'sprinter', 'unmarked'],
  ems: ['amb', 'fire'],
  civil: ['hatch', 'golf', 'sedan', 'estate', 'suv', 'suv2', 'van', 'pickup', 'truck', 'bus', 'moto'],
};
SETS.all = [...SETS.police, ...SETS.ems, ...SETS.civil];
const ids = q.get('set') ? SETS[q.get('set')!] ?? [] : (q.get('car') ?? 'octavia').split(',');

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(canvas.width, canvas.height, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
const scene = new Scene();
const skyColor = night ? new Color(0x0d1119) : new Color(0x9fb8d2);
scene.background = skyColor;

// A small sky for paint and glass to reflect, as render/view.ts makes one for the hour.
function skyFor(): Texture {
  const s = new Scene();
  const geo = new SphereGeometry(60, 24, 12);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const horizon = night ? new Color(0x1a2130) : new Color(0xdfe7ee);
  const zenith = night ? new Color(0x070a10) : new Color(0x5d8dc4);
  const ground = night ? new Color(0x0a0a0b) : new Color(0x3d3e40);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const up = pos.getY(i) / 60;
    if (up >= 0) c.copy(horizon).lerp(zenith, Math.pow(up, 0.55));
    else c.copy(horizon).lerp(ground, Math.min(1, -up * 6));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(col, 3));
  s.add(new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
  // Bright patches: the sun by day, street lamps at night; and a row of house fronts low round the horizon.
  const glint = (x: number, y: number, z: number, r: number, color: Color) => {
    const m = new Mesh(new SphereGeometry(r, 8, 6), new MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    s.add(m);
  };
  if (night) for (let i = 0; i < 8; i++) glint(Math.cos(i) * 50, 9 + (i % 3) * 3, Math.sin(i) * 50, 1.6, new Color(6, 4.8, 3.2));
  else glint(30, 40, -25, 4, new Color(26, 24, 21));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const m = new Mesh(new PlaneGeometry(14, 6 + (i % 4) * 3), new MeshBasicMaterial({ color: night ? 0x111214 : [0xb9b2a6, 0xd8d2c4, 0x8f8a82, 0xc9c3b5][i % 4], side: BackSide }));
    m.position.set(Math.cos(a) * 52, 3, Math.sin(a) * 52);
    m.lookAt(0, 3, 0);
    s.add(m);
  }
  const pm = new PMREMGenerator(renderer);
  return pm.fromScene(s, 0.035).texture;
}
scene.environment = skyFor();
scene.environmentIntensity = night ? 0.35 : 1;

// Asphalt: grey with a fine grain, a few darker patches.
function asphalt(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#55575a';
  g.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26000; i++) {
    const v = 60 + rnd() * 70;
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(30, 30);
  t.colorSpace = SRGBColorSpace;
  return t;
}
const ground = new Mesh(new PlaneGeometry(120, 120), new MeshStandardMaterial({ map: asphalt(), roughness: 0.92, metalness: 0, color: night ? 0x9a9a9a : 0xffffff }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const hemi = new HemisphereLight(0xbfd6f0, 0x57564e, night ? 0.08 : 1.9);
scene.add(hemi);
const sun = new DirectionalLight(night ? 0x9db4e0 : 0xfff4e2, night ? 0.12 : 5.5);
sun.position.set(30, 40, -25);
sun.castShadow = !night;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
const sc = sun.shadow.camera;
sc.left = -16;
sc.right = 16;
sc.top = 16;
sc.bottom = -16;
sc.near = 10;
sc.far = 120;
scene.add(sun);
if (night) {
  scene.add(new AmbientLight(0x8fa0c8, 0.15));
  // A street lamp behind the camera, so the reflective bands have something to answer.
  const lamp = new PointLight(0xffd9a8, 60, 40, 1.6);
  lamp.position.set(view === 'rear' ? -6 : 6, 6, flip * 5);
  scene.add(lamp);
}

const tex = { glow: glowTexture(), beam: beamTexture() };
const lights = { beacons: q.get('beacons') === '1', lamps: q.get('lamps') === '1', hazard: q.get('hazard') === '1', braking: q.get('braking') === '1' };
const low = q.get('low') === '1';
const looks = ids.map((id) => CARS[id]?.() ?? lookOfAnyCar(Number(id) || 1));
const gap = 1.4;
const widths = looks.map((l) => CAR_SIZE[l.body].width);
let z = -(widths.reduce((a, w) => a + w + gap, -gap) / 2);
const cars: { mesh: CarMesh | null; z: number }[] = [];
const report: string[] = [];
for (let i = 0; i < looks.length; i++) {
  const look = looks[i];
  const zc = z + widths[i] / 2;
  z += widths[i] + gap;
  // The parked level of detail, counted always and drawn with low=1.
  const mb: CarBuilders = { paint: new MeshBuilder(), glass: new MeshBuilder() };
  drawCar(mb, look);
  const pg = mb.paint.build();
  const gg = mb.glass.build();
  const lowTris = ((pg.index?.count ?? 0) + (gg.index?.count ?? 0)) / 3;
  if (low) {
    const mats = carMaterials();
    for (const [g, m] of [[pg, mats.paint], [gg, mats.glass]] as const) {
      const mesh = new Mesh(g, m);
      mesh.position.set(0, 0, zc);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    }
    cars.push({ mesh: null, z: zc });
  } else {
    const m = new CarMesh(look, tex);
    scene.add(m.group);
    cars.push({ mesh: m, z: zc });
    report.push(`${ids[i]}: ${m.triangles} tris moving, ${lowTris} parked`);
    continue;
  }
  report.push(`${ids[i]}: ${lowTris} tris parked`);
}

// The camera, by the longest car and the view.
const L = Math.max(...looks.map((l) => CAR_SIZE[l.body].length));
const H = Math.max(...looks.map((l) => CAR_SIZE[l.body].height));
const spread = Math.max(0, z - gap);
const camera = new PerspectiveCamera(view === 'cctv' ? 48 : 30, canvas.width / canvas.height, 0.1, 400);
const d = Math.max(L * 1.55, spread * 1.05) + 2;
const target: [number, number, number] = [0, H * 0.42, 0];
switch (view) {
  case 'rear':
    camera.position.set(-d * 0.72, 1.7, flip * d * 0.62);
    break;
  case 'side':
    camera.position.set(0, 1.05, flip * (d + 1.2));
    target[1] = H * 0.45;
    break;
  case 'top':
    camera.position.set(0.01, d * 1.6, 0.01);
    target[1] = 0;
    break;
  case 'cctv':
    camera.position.set(9.5, 6, flip * 10.7);
    target[1] = 0.6;
    break;
  default:
    camera.position.set(d * 0.72, 1.55, -flip * d * 0.62);
}
// cam=x,y,z&at=x,y,z: any other camera, for close inspection.
const cam = q.get('cam')?.split(',').map(Number);
if (cam) camera.position.set(cam[0], cam[1], cam[2]);
const at = q.get('at')?.split(',').map(Number);
if (at) target.splice(0, 3, at[0], at[1], at[2]);
if (q.get('fov')) camera.fov = Number(q.get('fov'));
camera.updateProjectionMatrix();
camera.lookAt(...target);

let t = Number(q.get('t') ?? 0.02);
const log = document.getElementById('log')!;
log.textContent = report.join(' | ');
function draw() {
  for (const c of cars) c.mesh?.update([0, -c.z], 0, lights, t, night ? 1 : 0);
  renderer.render(scene, camera);
}
const api = {
  ready: true,
  /** Advance the clock and draw `frames` frames. */
  step(dt: number, frames = 1) {
    for (let i = 0; i < frames; i++) {
      t += dt;
      draw();
    }
    return t;
  },
};
(window as unknown as { __cctv: typeof api }).__cctv = api;
draw();
