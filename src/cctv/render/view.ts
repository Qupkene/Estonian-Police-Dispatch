/**
 * One camera's picture (docs/CCTV.md): a small three.js scene of the street (world.ts) with the people and
 * vehicles the director moves (src/cctv/director.ts), lit by the hour and the weather, drawn at a low resolution
 * and passed through the camera's lens and recorder (post.ts).
 *
 * The view owns nothing of the game: it is handed a site, the weather and, every frame, where everything is.
 */
import {
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  FrontSide,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  SpotLight,
  WebGLRenderer,
  type Camera,
  type Material,
  type Object3D,
  type Texture,
  type WebGLCubeRenderTarget,
} from 'three';
import type { Env } from '../env';
import { lookOfCrew } from '../figure';
import { hash01, hash32, wobble } from '../math';
import type { ParkedCar, Site } from '../types';
import type { Frame, PropFrame } from '../stage';
import type { CarLook } from '../vehicle';
import { BEACON_COLOR, CarKit, CarMesh } from './cars';
import { HumanMesh, seedOfLook, type HumanBase } from './human';
import { FigureMesh, Palette } from './people';
import { Post, type PostLook } from './post';
import { PropsMesh } from './props';
import { makeAtlas } from './facades';
import { decalTexture, dropsTexture, glareTexture, groundTexture, poolTexture, skylineTexture, skyTexture, type SkyLook } from './textures';
import { buildWorld, type World, type WorldTextures } from './world';

/** The picture's size in pixels: small on purpose. */
export const FRAME_W = 640;
export const FRAME_H = 360;

export type { CarFrame, Frame, PersonFrame } from '../stage';

export interface Osd {
  name: string;
  clock: string;
  note: string;
  mark: string;
  rec: boolean;
}

const LAMP_LIGHTS = 6;
const BEACON_LIGHTS = 3;
const SMOKE_PUFFS = 26;
/** Drops of rain in a shower and in a storm, flakes of snow. */
const RAIN_DROPS = 300;
const STORM_DROPS = 620;
const SNOW_FLAKES = 520;
/** Glints of street lamps and lit windows in what paint and glass reflect. */
const LAMP_GLINTS = 9;

/**
 * The light as it is applied, rounded to steps finer than the eye follows between two readings: the light is only
 * worked out again when this changes (the session reads the hour every 2 real seconds, and most readings change
 * nothing that shows).
 */
function lightKey(env: Env): string {
  return [env.weather, env.rain, env.snowing, env.lamps, Math.round(env.night * 50), Math.round(env.sunAlt * 2), Math.round(env.sunAz / 2), Math.round(env.fog * 50)].join('|');
}

/**
 * What the reflection in paint and glass depends on, in coarse steps: it is soft and small in the picture, and
 * rendering it again is the costly part of a change of light.
 */
function reflectionKey(env: Env): string {
  return [env.weather, env.lamps, Math.round(env.night * 10), Math.round(env.sunAlt / 3), Math.round(env.sunAz / 10), Math.round(env.fog * 10)].join('|');
}

/**
 * Where each drop and flake falls and how fast, worked out once per page from the hash (plain numbers, shared by
 * every view): x and z in the box of air (-0.5..0.5), speed and phase (0..1). Rain uses the first STORM_DROPS.
 */
let dropTable: { rain: Float32Array; snow: Float32Array } | null = null;
function drops(): { rain: Float32Array; snow: Float32Array } {
  if (dropTable) return dropTable;
  const rain = new Float32Array(STORM_DROPS * 4);
  for (let i = 0; i < STORM_DROPS; i++) {
    rain[i * 4] = hash01('rx', i) - 0.5;
    rain[i * 4 + 1] = hash01('rz', i) - 0.5;
    rain[i * 4 + 2] = hash01('rs', i);
    rain[i * 4 + 3] = hash01('ry', i);
  }
  const snow = new Float32Array(SNOW_FLAKES * 4);
  for (let i = 0; i < SNOW_FLAKES; i++) {
    snow[i * 4] = hash01('sx', i) - 0.5;
    snow[i * 4 + 1] = hash01('sz', i) - 0.5;
    snow[i * 4 + 2] = hash01('ss', i);
    snow[i * 4 + 3] = hash01('sy', i);
  }
  return (dropTable = { rain, snow });
}

/** Let the page breathe between two pieces of work (the game's clock, the map and the queue keep running). */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A moment the page has nothing else to do (between the game's frames), or a second from now at the latest. */
const idleTask = () =>
  new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 1000 });
    else setTimeout(resolve, 0);
  });

/**
 * One of each thing props.ts lays in the street, for the stand-ins (see CameraView.warm): they are all drawn with
 * one material, as is a weapon in a hand, but the program is chosen by the geometry's attributes too.
 */
const WARM_PROPS: PropFrame[] = [
  { id: 'w:stretcher', kind: 'stretcher', pos: [0, 0], yaw: 0 },
  { id: 'w:sheet', kind: 'sheet', pos: [0, 0], yaw: 0 },
  { id: 'w:hose', kind: 'hose', pos: [0, 0], yaw: 0, line: [[0, 0], [1, 0], [2, 1]] },
  { id: 'w:knife', kind: 'knife', pos: [0, 0], yaw: 0 },
];

/** `p`, but no longer than `ms`: what is not ready by then is finished when it is first drawn. */
const atMost = (p: Promise<unknown>, ms: number) => Promise.race([p, new Promise<void>((resolve) => setTimeout(resolve, ms))]);

/** The face size of the reflection's cube: blurred as it is (sigma 0.035 rad), 64 texels a face are plenty. */
const REFLECTION_SIZE = 64;
const REFLECTION_SIGMA = 0.035;

/** What KeptPmrem reaches inside three's PMREMGenerator (r187); checked before use. */
interface PmremInside {
  _cubeSize: number;
  _renderCube?: unknown;
  _boxMesh?: Mesh;
  _cubeCamera?: Object3D;
  _blurMaterial?: Material | null;
  _ggxMaterial?: Material | null;
  _integrationMaterial?: Material | null;
}

/**
 * three's PMREMGenerator, kept small and kept in one place. It renders the reflection into a cube of
 * REFLECTION_SIZE (three's own minimum is 256: 16 times the pixels, for a picture this soft), and it makes its render
 * target once and hands the same one back from every fromScene, so that a change of light renders the reflection
 * again into the same texture: nothing is allocated and every material keeps the program it was compiled with.
 * It overrides three's internal _setSize and _allocateTarget: should a later three.js rename them, fromScene simply
 * works as three's own again (bigger, a new target each time, which reflect() then disposes of).
 */
class KeptPmrem extends PMREMGenerator {
  private kept: WebGLCubeRenderTarget | null = null;

  _setSize(): void {
    (this as unknown as PmremInside)._cubeSize = REFLECTION_SIZE;
  }

  _allocateTarget(): WebGLCubeRenderTarget {
    const fresh = (PMREMGenerator.prototype as unknown as { _allocateTarget(this: PMREMGenerator): WebGLCubeRenderTarget })._allocateTarget;
    return (this.kept ??= fresh.call(this));
  }

  /**
   * Make the generator's own shaders and its target without drawing anything, so that their programs can be compiled
   * in parallel while the page runs on (three makes them on the first fromScene and compiles them there, which holds
   * the page for seconds on a slow device). `scene` is drawn into the cube once, so its own programs must be ready.
   * Returns the target (its pixels not yet worked out: reflect() renders into it) and what to compile the shaders
   * on; null when this three.js is not the one this was written for.
   */
  prepare(scene: Scene): { target: WebGLCubeRenderTarget; mesh: Mesh; camera: Camera; materials: Material[] } | null {
    const inside = this as unknown as PmremInside;
    if (typeof inside._renderCube !== 'function' || !inside._boxMesh || !inside._cubeCamera?.children[0]) return null;
    let target: WebGLCubeRenderTarget;
    // An own property over the prototype's for the length of one call: the passes are made, not drawn.
    inside._renderCube = () => undefined;
    try {
      target = this.fromScene(scene, REFLECTION_SIGMA);
    } finally {
      delete inside._renderCube;
    }
    const materials = [inside._blurMaterial, inside._ggxMaterial, inside._integrationMaterial].filter((m): m is Material => !!m);
    return { target, mesh: inside._boxMesh, camera: inside._cubeCamera.children[0] as Camera, materials };
  }
}

/**
 * A stand-in for a mesh as the shadow pass draws it: the mesh itself as far as three's program choice reads it (its
 * kind, its geometry), with a depth material in place of its own and no children.
 */
function shadowProxy(o: Mesh, material: Material): Object3D {
  const p = Object.create(o) as Mesh;
  Object.defineProperty(p, 'material', { value: material });
  Object.defineProperty(p, 'children', { value: [] });
  return p;
}

/** Which depth program the shadow pass gives a mesh (three's WebGLShadowMap.getDepthMaterial reads these). */
function shadowKey(o: Mesh, m: Material & { map?: Texture | null; alphaMap?: Texture | null; displacementMap?: Texture | null }): string {
  const g = o.geometry;
  const flags = o as Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isBatchedMesh?: boolean };
  return [flags.isInstancedMesh, flags.isSkinnedMesh, flags.isBatchedMesh, !!g.morphAttributes.position, !!m.map, m.map?.channel, !!m.alphaMap, m.alphaTest > 0, !!m.displacementMap, m.side].join('|');
}

/** Can this browser draw the camera at all? */
export function canRender(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    // The probe's context is given back at once: a page may hold only a few, and garbage collection comes late.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export class CameraView {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(45, FRAME_W / FRAME_H, 0.4, 700);
  private post: Post;
  private world: World | null = null;
  /** The parked cars of the street as drawn (empty until a scene is set): the director is told of them. */
  parked: readonly ParkedCar[] = [];
  private site: Site | null = null;
  private env: Env | null = null;
  private palette = new Palette();
  private people = new Map<string, { mesh: FigureMesh | HumanMesh; blob: Mesh }>();
  /** The real body every figure is cut from; until it has loaded, figures are plain mannequins. */
  private humans: HumanBase | null = null;
  private glow = 0;
  private cars = new Map<string, CarMesh>();
  /** Things that are neither people nor vehicles (a dropped weapon, a stretcher, a sheet, a hose). */
  private props = new PropsMesh();
  private hemi = new HemisphereLight(0xffffff, 0x444444, 1);
  private fill = new AmbientLight(0xffffff, 0);
  private sun = new DirectionalLight(0xffffff, 1);
  /** The camera's own infrared lamp: it lights what is near when the picture is black and white. */
  private irLamp = new PointLight(0xffffff, 0, 50, 1.7);
  /** Street lamps shine down: their light falls on the ground and the lower walls, not on the roofs. */
  private lampLights: SpotLight[] = [];
  private beaconLights: PointLight[] = [];
  private pools: Mesh[] = [];
  /** What this view's vehicles share on the graphics card (disposed with the view). */
  private carKit = new CarKit();
  private poolTex = poolTexture();
  /** The street's paintings: made once, shared by every scene this view builds. */
  private sheets: WorldTextures = {
    atlas: makeAtlas(7),
    asphalt: groundTexture('asphalt', 3),
    paving: groundTexture('paving', 5),
    grass: groundTexture('grass', 9),
    setts: groundTexture('setts', 17),
    decals: decalTexture(13),
    glow: glareTexture(),
  };
  private drops = dropsTexture(11);
  /** The haze: one object for the view's life, recoloured when the light changes (a new one recompiles every material). */
  private fog = new Fog(0xc9cdcf, 60, 620);
  private background = new Color(0xc9cdcf);
  /** The sky all round: a dome painted for the hour and the weather (repainted in place when they change). */
  private skyTex: CanvasTexture | null = null;
  private skyMat = new MeshBasicMaterial({ fog: false, depthWrite: false, side: BackSide });
  private skyDome: Mesh;
  /** What stands beyond the map's edge: a far skyline of a town or a line of forest. */
  private skyline: Mesh | null = null;
  private skylineMat: MeshBasicMaterial | null = null;
  private skylineNearMat: MeshBasicMaterial | null = null;
  private rain: LineSegments | null = null;
  private snow: Points | null = null;
  private smoke: Mesh[] = [];
  private blobGeo = new CircleGeometry(1, 12);
  private blobMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
  private smokeMat = new MeshBasicMaterial({ color: 0x2a2a2c, transparent: true, opacity: 0.5, depthWrite: false });
  private look: PostLook | null = null;
  /** The light applied last (lightKey), and the reflection rendered last (reflectionKey). */
  private litKey = '';
  private reflKey = '';
  /** The reflection waits for the next frame or prepare(): its first render must not compile anything blocking. */
  private reflDue: { sky: Color; env: Env; dir: [number, number, number] } | null = null;
  /**
   * What paint and glass reflect: a small scene of its own (a dome that pales to the horizon, the sun, the lamps),
   * made once and recoloured in place, so that its materials keep their compiled programs.
   */
  private pmrem: KeptPmrem;
  private reflection: WebGLCubeRenderTarget | null = null;
  private refl = new Scene();
  private reflGeo = new SphereGeometry(60, 24, 14);
  private reflMat = new MeshBasicMaterial({ vertexColors: true, side: BackSide });
  private sunGlintMat = new MeshBasicMaterial({ side: BackSide });
  private lampGlintMat = new MeshBasicMaterial({ side: BackSide });
  private sunGlint: Mesh;
  private lampGlints: Mesh[] = [];
  /**
   * Out of sight for the view's life: a car's parts (CarKit.standIns), a constable with a knife in his hand and one
   * of each prop, so that the programs of whatever arrives later (a car's paint, lamps, flares and painting; a
   * skinned body; a weapon, a stretcher, a sheet, a hose) are compiled before the picture goes live and stay
   * compiled while the real ones come and go. Never drawn, so nothing of theirs is uploaded.
   */
  private warm = new Group();
  /** An empty object: compiling it only sets the renderer's lights up (see setLayout). */
  private nothing = new Group();
  private warmCar: Object3D[] | null = null;
  private warmPerson: HumanMesh | null = null;
  private warmProps: PropsMesh | null = null;
  /**
   * The vehicles on their way here (expect): their paintings are painted and uploaded ahead of their first frame,
   * in prepare() or, once live, when the page is idle, one to a task (a painting is a long piece of work).
   */
  private expected: CarLook[] = [];
  private painting = false;
  /** The depth materials that stand in for the shadow pass's own while its programs compile (kept so that they stay). */
  private shadowMats = new Map<string, MeshDepthMaterial>();
  /**
   * Which lights the shaders are built for (how many lamp lights are on, whether the sun casts shadows): a change
   * rebuilds the program of every lit material. Once the view is prepared, a change is compiled in the background
   * and switched to when ready; until then the picture goes on with the lights as they were.
   */
  private layout = '';
  private wantLayout = '';
  private ready = false;
  private disposed = false;
  private seed = 1;
  private lost = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power', stencil: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(FRAME_W, FRAME_H, false);
    // Asking for the compile logs makes every compile wait for the driver: only while developing.
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    // The counts of a whole frame (scene and screen passes), read by the harness against the budget.
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.post = new Post(this.renderer, FRAME_W, FRAME_H, this.drops);
    this.pmrem = new KeptPmrem(this.renderer);
    this.scene.fog = this.fog;
    this.scene.background = this.background;
    this.scene.add(this.hemi, this.fill, this.sun, this.sun.target, this.irLamp, this.props.group);
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.25;
    for (let i = 0; i < LAMP_LIGHTS; i++) {
      const l = new SpotLight(0xffe2b8, 0, 34, 1.15, 0.75, 1.7);
      this.lampLights.push(l);
      this.scene.add(l, l.target);
      // The pool of light under the lamp, painted on the ground.
      const pool = new Mesh(this.blobGeo, new MeshBasicMaterial({ map: this.poolTex, color: 0xffe2b8, transparent: true, depthWrite: false, opacity: 0 }));
      pool.rotation.x = -Math.PI / 2;
      pool.renderOrder = 1;
      this.pools.push(pool);
      this.scene.add(pool);
    }
    for (let i = 0; i < BEACON_LIGHTS; i++) {
      // Close and short: the flash lights the car's own surroundings, it does not flood the street.
      const l = new PointLight(BEACON_COLOR, 0, 12, 1.6);
      this.beaconLights.push(l);
      this.scene.add(l);
    }
    // The dome: painting u runs round from the east's opposite as SphereGeometry lays it, v from the horizon up.
    const dome = new SphereGeometry(600, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2 + 0.2);
    const uv = dome.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 2 * uv.getY(i) - 1);
    this.skyDome = new Mesh(dome, this.skyMat);
    // Drawn after everything solid: only the pixels nothing else covers are painted with sky.
    this.skyDome.renderOrder = 10;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);
    // The reflection's scene: the dome's colours are written by reflect(), the glints placed and lit there.
    this.reflGeo.setAttribute('color', new BufferAttribute(new Float32Array(this.reflGeo.getAttribute('position').count * 3), 3));
    this.refl.add(new Mesh(this.reflGeo, this.reflMat));
    this.sunGlint = new Mesh(this.blobGeo, this.sunGlintMat);
    this.refl.add(this.sunGlint);
    for (let i = 0; i < LAMP_GLINTS; i++) {
      const m = new Mesh(this.blobGeo, this.lampGlintMat);
      this.lampGlints.push(m);
      this.refl.add(m);
    }
    // Smoke puffs exist from the start, hidden: a fire later in the story then draws with a compiled program.
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const m = new Mesh(this.blobGeo, this.smokeMat);
      m.renderOrder = 3;
      m.visible = false;
      this.smoke.push(m);
      this.scene.add(m);
    }
    this.warm.visible = false;
    this.scene.add(this.warm);
    canvas.addEventListener('webglcontextlost', this.onLost);
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };

  /** Has the browser taken the graphics context away (the picture cannot be drawn any more)? */
  get dead() {
    return this.lost;
  }

  /** Hand over the loaded base body (src/cctv/render/human.ts): figures made from now on use it. */
  setHumans(base: HumanBase) {
    this.humans = base;
    for (const e of this.people.values()) {
      this.scene.remove(e.mesh.group, e.blob);
      if (e.mesh instanceof HumanMesh) e.mesh.dispose();
    }
    this.people.clear();
  }

  /** Build the street for a site, in this light and weather. */
  setScene(site: Site, env: Env) {
    this.clearScene();
    this.site = site;
    this.env = env;
    this.seed = site.seed;
    this.world = buildWorld(site, env, this.sheets, this.carKit.materials());
    this.parked = this.world.parked;
    this.scene.add(this.world.group);
    const town = site.street.buildings.length > 14;
    const tex = skylineTexture(town, site.seed);
    tex.repeat.set(town ? 5 : 7, 1);
    this.skylineMat = new MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08, depthWrite: false, side: BackSide });
    const r = site.street.radius + 110;
    const band = new CylinderGeometry(r, r, town ? 46 : 30, 48, 1, true);
    this.skyline = new Mesh(band, this.skylineMat);
    this.skyline.position.set(site.camera.pos[0], (town ? 46 : 30) / 2 - 3, -site.camera.pos[1]);
    // A nearer, lower band of the same kind in front of it, turned and less hazy: the distance in two layers that
    // shift against each other, not one flat card.
    const nearTex = tex.clone();
    nearTex.repeat.set(town ? 3 : 4, 1);
    nearTex.offset.set(0.37, 0);
    this.skylineNearMat = new MeshBasicMaterial({ map: nearTex, transparent: true, alphaTest: 0.08, depthWrite: false, side: BackSide });
    const nh = town ? 30 : 22;
    const near = new Mesh(new CylinderGeometry(r * 0.78, r * 0.78, nh, 48, 1, true), this.skylineNearMat);
    near.position.y = nh / 2 - 3 - (town ? 46 : 30) / 2;
    near.rotation.y = 1.3;
    near.renderOrder = -1;
    this.skyline.add(near);
    this.scene.add(this.skyline);
    const cam = site.camera;
    this.camera.fov = cam.fov;
    this.camera.updateProjectionMatrix();
    this.applyLight(env);
    this.aim(0);
  }

  /**
   * The hour or the weather may have changed: light, sky, lamps and the camera's own look. The street stays as built.
   * Nothing is done while the light, in the steps the eye follows (lightKey), is what was applied last.
   */
  setEnv(env: Env) {
    if (!this.site) return;
    const rebuilt = !this.env || Math.abs(this.env.snow - env.snow) > 0.3 || this.env.rain !== env.rain || this.env.season !== env.season;
    if (rebuilt) return this.setScene(this.site, env);
    // The wind is read every frame (rain, snow, the pole's shake); the rest only when it shows.
    this.env = env;
    if (lightKey(env) !== this.litKey) this.applyLight(env);
  }

  private applyLight(env: Env) {
    const site = this.site!;
    const night = env.night;
    const clear = env.weather === 'clear';
    const overcast = !clear;
    const up = Math.max(0, env.sunAlt);
    const day = Math.min(1, up / 12);
    this.litKey = lightKey(env);
    const sky = this.paintSky(env);
    this.fog.color.copy(sky);
    this.fog.near = env.fog > 0.5 ? 12 : 60;
    this.fog.far = 620 - 500 * env.fog;

    this.hemi.color.set(overcast ? 0xcfd4da : 0xbfd6f0);
    this.hemi.groundColor.set(0x57564e);
    this.hemi.intensity = (overcast ? 4.4 : 1.9) * (0.05 + 0.95 * day) * (1 - night * 0.93) + 0.12;
    // What a town's own glow leaves in the shadows at night.
    this.fill.color.set(0xa3a7ae);
    this.fill.intensity = 0.16 * night;

    // The sun (or, at night, a weak moon from the same side): bearing clockwise from north.
    const az = (env.sunAz * Math.PI) / 180;
    const alt = (Math.max(env.sunAlt, 7) * Math.PI) / 180;
    const dir: [number, number, number] = [Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)];
    const c = site.camera.target;
    this.sun.target.position.set(c[0], 0, -c[1]);
    this.sun.position.set(c[0] + dir[0] * 160, dir[1] * 160, -c[1] + dir[2] * 160);
    const low = Math.min(1, up / 6);
    this.sun.color.set(env.sunAlt < 10 ? 0xffd9b0 : 0xfff4e2);
    this.sun.intensity = night > 0.5 ? 0.14 * night : (overcast ? 1.3 : 6.2) * low * (1 - night);
    if (night > 0.5) this.sun.color.set(0x9db4e0);
    const shadows = clear && env.sunAlt > 3;
    if (shadows) {
      const s = this.sun.shadow.camera;
      s.left = -60;
      s.right = 60;
      s.top = 60;
      s.bottom = -60;
      s.near = 20;
      s.far = 360;
      s.updateProjectionMatrix();
    }

    // Lamps: the nearest ones to what the camera looks at get a real light and a pool on the ground.
    const world = this.world!;
    world.setNight(night, env.lamps);
    this.glow = 0.15 + 0.85 * night;
    this.palette.setGlow(this.glow);
    for (const e of this.people.values()) if (e.mesh instanceof HumanMesh) e.mesh.setGlow(this.glow);
    const lit = env.lamps ? Math.max(0.25, night) : 0;
    const order = world.lamps.slice().sort((a, b) => Math.hypot(a.x - c[0], a.z + c[1]) - Math.hypot(b.x - c[0], b.z + c[1]));
    const led = hash01('led', this.seed) < 0.55;
    // A lamp that is off leaves the shaders altogether (it costs every pixel otherwise); the farthest two of the
    // six nearest lamps only paint their pools.
    const spots = this.lampLights.map((_, i) => !!order[i] && lit > 0 && i < LAMP_LIGHTS - 2);
    this.lampLights.forEach((l, i) => {
      const lamp = order[i];
      const pool = this.pools[i];
      if (!lamp || !lit) {
        l.intensity = 0;
        pool.visible = false;
        return;
      }
      l.position.set(lamp.x, lamp.y, lamp.z);
      l.target.position.set(lamp.x, 0, lamp.z);
      l.angle = lamp.power < 1 ? 1.3 : 1.12;
      l.color.set(lamp.power < 1 ? 0xffd9a8 : led ? 0xe6edff : 0xffcf8f);
      l.intensity = 110 * lamp.power * lit;
      l.distance = lamp.power < 1 ? 14 : 36;
      pool.visible = true;
      pool.position.set(lamp.x, 0.16, lamp.z);
      pool.scale.setScalar(lamp.power < 1 ? 3.2 : lamp.y * 1.35);
      const m = pool.material as MeshBasicMaterial;
      m.color.copy(l.color);
      m.opacity = 0.2 * lit;
    });
    this.setLayout(spots, shadows);

    const rk = reflectionKey(env);
    if (rk !== this.reflKey) {
      this.reflKey = rk;
      this.reflDue = { sky, env, dir };
    }
    this.scene.environmentIntensity = 0.5 + 0.5 * (1 - night);
    this.buildWeather(env);
    this.look = this.lookFor(env);
    this.post.setLook(this.look);
    this.irLamp.position.set(site.camera.pos[0], site.camera.height - 0.3, -site.camera.pos[1]);
    this.irLamp.intensity = this.look.mono ? 110 : 0;
    // Fog at night scatters the town's light: a floor of light keeps the outlines readable.
    this.fill.intensity = ((this.look.mono ? 0.16 : 0.2) + 0.35 * env.fog) * night;
  }

  /**
   * Paint the sky for the hour and the weather: deeper at the zenith, paler at the horizon, clouds by the weather,
   * the low sun's warmth on its side of the sky, the town's glow and a few stars at night. Returns the colour of the
   * horizon, which the haze and the background take.
   */
  private paintSky(env: Env): Color {
    const night = env.night;
    const clear = env.weather === 'clear';
    const dark = env.weather === 'rain' || env.weather === 'storm';
    const day = Math.min(1, Math.max(0, env.sunAlt + 4) / 14) * (1 - night);
    const zenith = new Color(clear ? 0x4c7fbf : dark ? 0x6b7279 : 0x8c939a);
    const horizon = new Color(clear ? 0xbfd2e2 : dark ? 0x979da2 : 0xb6bbbf);
    const dusk = clear && env.sunAlt < 9 && env.sunAlt > -7 ? 1 - Math.abs(env.sunAlt - 1) / 8 : 0;
    horizon.lerp(new Color(0xe9b48a), 0.5 * dusk);
    const town = (this.site?.street.buildings.length ?? 0) > 14;
    zenith.lerp(new Color(0x05080f), 1 - day);
    horizon.lerp(new Color(town ? 0x2b2722 : 0x161a22), 1 - day);
    const fog = new Color(night > 0.5 ? 0x24262a : 0xc9cdcf);
    zenith.lerp(fog, env.fog * 0.85);
    horizon.lerp(fog, env.fog * 0.9);
    const az = (env.sunAz * Math.PI) / 180;
    const yaw = Math.atan2(Math.cos(az), Math.sin(az));
    const cover = clear ? 0.12 + 0.2 * hash01('clouds', this.seed) : env.weather === 'cloudy' ? 0.82 : env.weather === 'fog' ? 1 : 0.97;
    const cloudLight = new Color(clear ? 0xf6f4f0 : dark ? 0x8d9399 : 0xc2c6c9).lerp(new Color(0xf0b890), 0.5 * dusk).lerp(new Color(town ? 0x302a24 : 0x16181d), 1 - day);
    const cloudDark = new Color(clear ? 0xa6adb6 : dark ? 0x5b6168 : 0x8a9096).lerp(new Color(town ? 0x1c1a17 : 0x0b0d11), 1 - day);
    const look: SkyLook = {
      zenith: `#${zenith.getHexString()}`,
      horizon: `#${horizon.getHexString()}`,
      cover,
      cloudLight: `#${cloudLight.getHexString()}`,
      cloudDark: `#${cloudDark.getHexString()}`,
      sunU: (((yaw / (Math.PI * 2) + 0.5) % 1) + 1) % 1,
      sunGlow: dusk,
      sunColour: '#ffd2a0',
      stars: clear && night > 0.7 && !town ? 0.8 : clear && night > 0.7 ? 0.3 : 0,
    };
    // Painted again into the same canvas and texture (uploaded again in place).
    const first = !this.skyTex;
    this.skyTex = skyTexture(look, this.seed, this.skyTex ?? undefined);
    if (first) {
      this.skyMat.map = this.skyTex;
      this.skyMat.needsUpdate = true;
    }
    this.background.copy(horizon);
    if (this.skylineMat) {
      // Far away and in the haze: a little lighter than the ground, darker than the sky behind it.
      const c = horizon.clone().lerp(new Color(night > 0.5 ? 0x050608 : 0x3e4648), clear ? 0.5 : 0.32);
      this.skylineMat.color.copy(c);
      this.skylineNearMat?.color.copy(horizon.clone().lerp(new Color(night > 0.5 ? 0x040506 : 0x343c3c), clear ? 0.62 : 0.45));
    }
    return horizon;
  }

  /** The surroundings as paint and glass mirror them: a sky that pales to the horizon, dark ground, the sun or the lamps. */
  private reflect(sky: Color, env: Env, sunDir: [number, number, number]) {
    const pos = this.reflGeo.getAttribute('position');
    const col = this.reflGeo.getAttribute('color') as BufferAttribute;
    const night = env.night;
    const horizon = sky.clone().lerp(new Color(0xffffff), 0.35 * (1 - night)).multiplyScalar(1.15);
    const zenith = sky.clone().multiplyScalar(night > 0.5 ? 0.6 : 0.85);
    const ground = new Color(0x3a3b3d).multiplyScalar(0.25 + 0.75 * (1 - night));
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const up = pos.getY(i) / 60;
      if (up >= 0) c.copy(horizon).lerp(zenith, Math.pow(up, 0.55));
      else c.copy(horizon).lerp(ground, Math.min(1, -up * 6));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    const place = (m: Mesh, x: number, y: number, z: number, size: number) => {
      m.position.set(x * 50, y * 50, z * 50);
      m.scale.setScalar(size);
      m.lookAt(0, 0, 0);
    };
    this.sunGlint.visible = night < 0.5 && env.weather === 'clear' && env.sunAlt > 2;
    if (this.sunGlint.visible) {
      place(this.sunGlint, sunDir[0], sunDir[1], sunDir[2], 5);
      this.sunGlintMat.color.setRGB(30, 28, 24);
    }
    // Street lamps and lit windows, low round the horizon.
    this.lampGlintMat.color.setRGB(9, 7.5, 5).multiplyScalar(0.4 + night);
    this.lampGlints.forEach((m, i) => {
      m.visible = env.lamps;
      const a = (i / LAMP_GLINTS) * Math.PI * 2 + hash01('gl', this.seed, i);
      place(m, Math.cos(a) * 0.93, 0.18 + 0.2 * hash01('gh', this.seed, i), Math.sin(a) * 0.93, 2.2);
    });
    const made = this.pmrem.fromScene(this.refl, REFLECTION_SIGMA);
    if (this.reflection && this.reflection !== made) this.reflection.dispose();
    this.reflection = made;
    this.scene.environment = made.texture;
  }

  /** Render the reflection if the light changed since it was rendered last. */
  private flushReflection() {
    const due = this.reflDue;
    if (!due) return;
    this.reflDue = null;
    this.reflect(due.sky, due.env, due.dir);
  }

  /**
   * Switch the lamp lights (`spots`, which are on) and the sun's shadows. While the number of lights the shaders are
   * built for stays the same, at once; else, once prepared, the programs for the new lights are compiled in the
   * background first (the lights are set for the moment of the compile and set back), and the switch is made when
   * they are ready. A lamp coming on at dusk then costs no frame.
   */
  private setLayout(spots: boolean[], shadow: boolean) {
    const key = `${spots.filter(Boolean).length}|${shadow}`;
    const apply = () => {
      this.lampLights.forEach((l, i) => (l.visible = spots[i]));
      this.sun.castShadow = shadow;
      this.layout = key;
    };
    const switchNow = () => {
      apply();
      // Three draws a frame's shadows before it sets the lights up for that frame: set them up now.
      if (this.ready) this.renderer.compile(this.nothing, this.camera, this.scene);
    };
    if (key === this.wantLayout && key !== this.layout && this.ready) return;
    this.wantLayout = key;
    if (key === this.layout || !this.ready) return switchNow();
    const was = this.lampLights.map((l) => l.visible);
    const wasShadow = this.sun.castShadow;
    const before = this.layout;
    const stale = () => this.disposed || this.lost || this.wantLayout !== key;
    // The new lights are set for each piece of the compile and set back after it: the frames in between are drawn
    // with the lights as they were.
    const enter = () => apply();
    const leave = () => {
      this.lampLights.forEach((l, i) => (l.visible = was[i]));
      this.sun.castShadow = wasShadow;
      this.layout = before;
    };
    void this.compileScene(stale, enter, leave)
      .then((waits) => Promise.all(waits))
      .then(() => this.gpuDone(20000))
      .then(() => this.touchPrograms(() => this.disposed || this.wantLayout !== key))
      .then(() => {
        if (!this.disposed && this.wantLayout === key) switchNow();
      });
  }

  /**
   * A program's first use asks the graphics process for its uniforms and attributes, and that question waits for all
   * the work queued before it. Asked for every program once its link is done (gpuDone), one to a task, it costs
   * the page little at a time, and the first frame that draws with them waits on nothing: the driver finishes them
   * in its own process while the page runs on. Stops when `stop` says so (checked before each program, so it never
   * overruns by more than one). Not needed where the browser compiles in parallel (KHR_parallel_shader_compile):
   * there three's compileAsync has already waited, without holding the page, for each program to be done.
   */
  private async touchPrograms(stop: () => boolean) {
    if (this.renderer.extensions.has('KHR_parallel_shader_compile')) return;
    const programs = (this.renderer.info.programs ?? []) as { getUniforms(): unknown; getAttributes(): unknown }[];
    for (const p of programs.slice()) {
      if (stop()) return;
      p.getUniforms();
      p.getAttributes();
      await nextTask();
    }
  }

  /**
   * Resolves once the graphics process has done everything asked of it so far (the links of the programs, the
   * uploads), or after `maxMs`, without holding the page: a fence, polled between tasks. Where the browser has no
   * KHR_parallel_shader_compile (a software renderer, many phones) three's compileAsync resolves at once and the
   * links would be waited for, page held, at the first draw; the graphics process works on them on its own
   * meanwhile, and the fence says when it is through.
   */
  private gpuDone(maxMs: number): Promise<void> {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) return Promise.resolve();
    gl.flush();
    const until = performance.now() + maxMs;
    return new Promise<void>((resolve) => {
      const poll = () => {
        const over = this.disposed || this.lost || performance.now() > until;
        if (over || gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED) {
          if (!this.disposed) gl.deleteSync(sync);
          resolve();
          return;
        }
        setTimeout(poll, 16);
      };
      setTimeout(poll, 16);
    });
  }

  /**
   * Compile every program the street needs, for the frame's target: the scene's materials (also of what is hidden:
   * the stand-ins and the constable, the smoke) and, when the sun casts shadows, the depth programs of the shadow
   * pass. A few materials to a task, so that no task holds the page long (making a program takes the page tens of
   * milliseconds on a slow device). `enter` and `leave` are called round each piece (the lights to compile for, and
   * back). Resolves to what to wait for; stops when `stop` says so.
   */
  private async compileScene(stop: () => boolean, enter?: () => void, leave?: () => void): Promise<Promise<unknown>[]> {
    const r = this.renderer;
    // One object for each material (compiling it compiles its children too, which costs nothing twice).
    const seen = new Set<Material>();
    const objects: Object3D[] = [];
    this.scene.traverse((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      if (!m) return;
      const list = ([] as Material[]).concat(m).filter((x) => !seen.has(x));
      if (!list.length) return;
      list.forEach((x) => seen.add(x));
      objects.push(o);
    });
    const waits: Promise<unknown>[] = [];
    const PER_TASK = 3;
    for (let i = 0; i <= objects.length; i += PER_TASK) {
      if (stop()) return waits;
      enter?.();
      // The target is part of a program's identity (the colour space it writes): the street is drawn into the frame.
      r.setRenderTarget(this.post.frame);
      for (const o of objects.slice(i, i + PER_TASK)) waits.push(r.compileAsync(o, this.camera, this.scene));
      if (i + PER_TASK > objects.length && this.sun.castShadow) waits.push(...this.compileShadows());
      r.setRenderTarget(null);
      if (leave) {
        leave();
        // compile() left the renderer's lights set up for the lights compiled for, and three draws a frame's shadows
        // before it sets them up again: set them up for the lights as they are, or the shadow pass would ask for
        // programs of its own, compiled on the spot.
        r.compile(this.nothing, this.camera, this.scene);
      }
      await nextTask();
    }
    return waits;
  }

  /**
   * The shadow pass draws each mesh that casts a shadow with a depth material of three's own, of a few kinds (plain,
   * instanced, skinned, cut out by a texture). compile() does not reach them, so each kind is compiled here on a
   * stand-in with a depth material set up as three sets up its own, in the light of the scene but without its fog
   * and reflection, as the shadow pass draws.
   */
  private compileShadows(): Promise<unknown>[] {
    const r = this.renderer;
    const kinds = new Map<string, Object3D>();
    this.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || !mesh.castShadow || Array.isArray(mesh.material)) return;
      const m = mesh.material as Material & { map?: Texture | null; alphaMap?: Texture | null; displacementMap?: Texture | null; displacementScale?: number };
      const key = shadowKey(mesh, m);
      if (kinds.has(key)) return;
      let d = this.shadowMats.get(key);
      if (!d) {
        d = new MeshDepthMaterial();
        d.map = m.map ?? null;
        d.alphaMap = m.alphaMap ?? null;
        d.alphaTest = m.alphaTest;
        d.displacementMap = m.displacementMap ?? null;
        d.displacementScale = m.displacementScale ?? 1;
        d.side = m.side === FrontSide ? BackSide : m.side === BackSide ? FrontSide : DoubleSide;
        this.shadowMats.set(key, d);
      }
      kinds.set(key, shadowProxy(mesh, d));
    });
    const fog = this.scene.fog;
    const environment = this.scene.environment;
    this.scene.fog = null;
    this.scene.environment = null;
    try {
      return [...kinds.values()].map((p) => r.compileAsync(p, this.camera, this.scene));
    } finally {
      this.scene.fog = fog;
      this.scene.environment = environment;
    }
  }

  /**
   * Get the first frames onto the graphics card without holding the page (docs/CCTV.md section 9). The first frame's
   * people and vehicles are staged and the warm car and constable made; the textures are uploaded one to a task; then
   * every program the first frames draw with (the reflection's scene and passes, the street with its shadows, the
   * screen passes) is compiled while the page runs on, the reflection is rendered, and the first frame (`first`,
   * with the texts `osd`) is drawn once and waited for: a graphics driver finishes a program only when it is first
   * drawn with (on a software renderer that is most of the cost), and the page must not wait for that. Waits at most
   * `budgetMs` in all, every step included: what is not ready by then is finished when it is first drawn (no step
   * starts once the budget is spent, and each is one short task). Last, with what is left of it, the paintings of the
   * vehicles on their way (expect). Stops early when `signal` is aborted or the context is lost.
   */
  async prepare(first: Frame | null, osd: Osd, signal?: AbortSignal, budgetMs = 10000): Promise<void> {
    const stop = () => this.lost || this.disposed || !!signal?.aborted;
    if (!this.site || stop()) return;
    const until = performance.now() + budgetMs;
    const left = () => Math.max(0, until - performance.now());
    const out = () => stop() || left() <= 0;
    await this.warmUp(first, osd, out, left);
    if (stop()) return;
    this.ready = true;
    // Whatever was expected and not painted yet is painted when the page is idle.
    this.paintLater();
  }

  /** prepare()'s steps; it returns as soon as `stop` says so (the budget spent, the view gone). */
  private async warmUp(first: Frame | null, osd: Osd, stop: () => boolean, left: () => number) {
    const r = this.renderer;
    if (first) this.stage(first);
    this.makeWarm();
    for (const t of this.textures()) {
      if (stop()) return;
      r.initTexture(t);
      await nextTask();
    }
    if (stop()) return;
    // The reflection first: its scene is drawn into the cube while the generator's passes are made (not drawn).
    r.setRenderTarget(this.post.frame);
    await atMost(r.compileAsync(this.refl, this.camera), left());
    await this.gpuDone(left());
    if (stop()) return;
    const pm = this.pmrem.prepare(this.refl);
    const waits: Promise<unknown>[] = [];
    if (pm) {
      this.reflection = pm.target;
      this.scene.environment = pm.target.texture;
      r.setRenderTarget(this.post.frame);
      for (const m of pm.materials) {
        pm.mesh.material = m;
        waits.push(r.compileAsync(pm.mesh, pm.camera));
      }
    }
    await nextTask();
    if (stop()) return;
    // The street's programs depend on the reflection's size and on the lights, both settled by now.
    waits.push(...(await this.compileScene(stop)));
    if (stop()) return;
    waits.push(this.post.compile());
    await atMost(Promise.all(waits), left());
    if (stop()) return;
    await this.gpuDone(left());
    await this.touchPrograms(stop);
    if (stop()) return;
    this.flushReflection();
    if (first) this.render(first, osd);
    await this.paintExpected(stop);
    await this.gpuDone(left());
  }

  /**
   * The vehicles on their way to the scene (the session's list of the incident's units and services not here yet):
   * their paintings are painted and uploaded before they drive into the picture, not in the frame they first show.
   */
  expect(looks: readonly CarLook[]) {
    for (const look of looks) if (!this.expected.some((l) => JSON.stringify(l) === JSON.stringify(look))) this.expected.push(look);
    if (this.ready) this.paintLater();
  }

  /** Paint and upload the expected vehicles' paintings, one to a task, until there are none or `stop` says so. */
  private async paintExpected(stop: () => boolean, between: () => Promise<void> = nextTask) {
    while (this.expected.length && !stop()) {
      const look = this.expected.shift()!;
      for (const t of this.carKit.prime(look)) this.renderer.initTexture(t);
      await between();
    }
  }

  /** paintExpected when the page is idle, once at a time. */
  private paintLater() {
    if (this.painting || !this.expected.length) return;
    this.painting = true;
    void idleTask()
      .then(() => this.paintExpected(() => this.disposed || this.lost, idleTask))
      .finally(() => (this.painting = false));
  }

  /** The warm car and constable (see `warm`), once per view. */
  private makeWarm() {
    if (!this.warmCar) {
      this.warmCar = this.carKit.standIns();
      this.warm.add(...this.warmCar);
    }
    if (!this.warmPerson && this.humans && this.env) {
      const look = lookOfCrew('police', 1, 'M', { season: this.env.season, temp: 10 });
      this.warmPerson = new HumanMesh(look, 1, this.humans);
      this.warmPerson.setHeld('knife');
      this.warm.add(this.warmPerson.group);
    }
    if (!this.warmProps) {
      this.warmProps = new PropsMesh();
      this.warmProps.update(WARM_PROPS);
      this.warm.add(this.warmProps.group);
    }
  }

  /** Every texture the street draws with (not the stand-ins' and the constable's: they are never drawn). */
  private textures(): Texture[] {
    const skip = new Set<Material>();
    this.warm.traverse((o) => {
      const m = (o as Mesh).material;
      if (m) for (const x of ([] as Material[]).concat(m)) skip.add(x);
    });
    const out = new Set<Texture>();
    this.scene.traverse((o) => {
      const m = (o as Mesh).material;
      if (!m) return;
      for (const x of ([] as Material[]).concat(m)) {
        if (skip.has(x)) continue;
        for (const v of Object.values(x)) {
          const t = v as Texture | null;
          if (t?.isTexture && !(t as Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) out.add(t);
        }
      }
    });
    return [...out];
  }

  /** How this camera's picture looks in this light: each camera differs a little (the seed), night changes a lot. */
  private lookFor(env: Env): PostLook {
    const s = this.seed;
    const night = env.night;
    // Most cameras turn to infrared black-and-white in the dark; some stay in colour under the lamps.
    const mono = night > 0.55 && hash01('ir', s) < 0.6;
    const cheap = hash01('cheap', s);
    const warm = hash01('warm', s) - 0.5;
    return {
      barrel: 0.08 + 0.1 * hash01('lens', s),
      soft: 0.55 + 0.5 * cheap + (env.fog > 0.5 ? 0.3 : 0),
      trail: 0.06 + 0.3 * night + (env.rain ? 0.05 : 0),
      noise: 0.022 + 0.03 * cheap + 0.06 * night,
      mono,
      tint: mono ? [0.99, 1, 0.99] : [1 + warm * 0.08, 1, 1 - warm * 0.1],
      gain: 1 + 1.15 * night + (env.sunAlt < 6 && night < 0.5 ? 0.25 : 0),
      lift: 0.018 + 0.02 * cheap + 0.02 * night,
      contrast: 0.94 + 0.12 * hash01('con', s) - 0.05 * env.fog,
      saturation: (0.62 + 0.25 * hash01('sat', s)) * (1 - 0.4 * night),
      blocks: 0.14 + 0.26 * cheap + 0.22 * night,
      vignette: 0.22 + 0.25 * hash01('vig', s) + 0.2 * night,
      scan: 0.03 + 0.05 * cheap,
      // Water drops on the dome when it rains, more in a storm; snow does not sit on a warm dome as drops.
      rain: env.weather === 'storm' ? 0.6 : env.rain ? 0.4 : 0,
    };
  }

  /**
   * The rain or the snow for this weather (none for null). The buffers stay while the number of drops stays the
   * same: a change of light only sets the streaks' opacity.
   */
  private buildWeather(env: Env | null) {
    const rainN = env?.rain ? (env.weather === 'storm' ? STORM_DROPS : RAIN_DROPS) : 0;
    if (this.rain && this.rain.geometry.getAttribute('position').count !== rainN * 2) {
      this.scene.remove(this.rain);
      this.rain.geometry.dispose();
      (this.rain.material as LineBasicMaterial).dispose();
      this.rain = null;
    }
    if (this.snow && !env?.snowing) {
      this.scene.remove(this.snow);
      this.snow.geometry.dispose();
      (this.snow.material as PointsMaterial).dispose();
      this.snow = null;
    }
    if (!env) return;
    if (rainN && !this.rain) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(rainN * 6), 3));
      this.rain = new LineSegments(g, new LineBasicMaterial({ color: 0xc9d2dc, transparent: true, depthWrite: false }));
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    }
    // In the dark only the streaks near a light show; the night picture's gain would turn all of them into a curtain.
    if (this.rain) (this.rain.material as LineBasicMaterial).opacity = 0.3 * (1 - 0.6 * env.night);
    if (env.snowing && !this.snow) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(SNOW_FLAKES * 3), 3));
      this.snow = new Points(g, new PointsMaterial({ color: 0xf4f6f8, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false }));
      this.snow.frustumCulled = false;
      this.scene.add(this.snow);
    }
  }

  /** Rain and snow fall in a box of air in front of the camera; each drop's place is a function of time. */
  private weather(t: number) {
    const site = this.site;
    const env = this.env;
    if (!site || !env) return;
    const c = site.camera.target;
    const wind = Math.min(9, env.wind) * 0.12;
    const cx = site.camera.pos[0];
    const cz = -site.camera.pos[1];
    const k = drops();
    if (this.rain) {
      const a = this.rain.geometry.getAttribute('position') as BufferAttribute;
      const n = a.count / 2;
      const d = k.rain;
      for (let i = 0; i < n; i++) {
        const x = c[0] + d[i * 4] * 46;
        const z = -c[1] + d[i * 4 + 1] * 46;
        const speed = 15 + d[i * 4 + 2] * 6;
        let y = 16 - ((t * speed + d[i * 4 + 3] * 16) % 16);
        // Not right in front of the lens, where a drop would be a bar across the picture.
        if (Math.hypot(x - cx, z - cz) < 7) y = -5;
        a.setXYZ(i * 2, x + wind * (16 - y), y, z);
        a.setXYZ(i * 2 + 1, x + wind * (16 - y) - wind * 0.7, y + 0.7, z);
      }
      a.needsUpdate = true;
    }
    if (this.snow) {
      const a = this.snow.geometry.getAttribute('position') as BufferAttribute;
      const d = k.snow;
      for (let i = 0; i < a.count; i++) {
        const speed = 1.1 + d[i * 4 + 2] * 0.9;
        const y = 14 - ((t * speed + d[i * 4 + 3] * 14) % 14);
        const x = c[0] + d[i * 4] * 50 + Math.sin(t * 0.8 + i) * 0.5 + wind * 6 * (14 - y) * 0.2;
        const z = -c[1] + d[i * 4 + 1] * 50 + Math.cos(t * 0.6 + i * 1.7) * 0.5;
        a.setXYZ(i, x, y, z);
      }
      a.needsUpdate = true;
    }
  }

  /** Point the camera: at its target, with the small shake of a pole in the wind. */
  private aim(t: number) {
    const site = this.site;
    if (!site) return;
    const cam = site.camera;
    const shake = cam.mount === 'pole' ? 0.006 + Math.min(12, this.env?.wind ?? 3) * 0.0022 : 0.002;
    this.camera.position.set(cam.pos[0], cam.height, -cam.pos[1]);
    this.camera.lookAt(cam.target[0] + wobble(this.seed, t, 1.3) * shake * 14, cam.targetHeight + wobble(this.seed + 4, t, 1.7) * shake * 8, -cam.target[1]);
  }

  private drawSmoke(f: Frame) {
    const s = f.smoke;
    if (!s || s.strength <= 0.01) {
      for (const m of this.smoke) m.visible = false;
      return;
    }
    const wind = Math.min(8, this.env?.wind ?? 3);
    this.smoke.forEach((m, i) => {
      // Each puff rises, drifts with the wind and grows; its age comes from the clock.
      const age = (f.t * 0.16 + i / SMOKE_PUFFS) % 1;
      m.visible = true;
      m.position.set(s.at[0] + age * wind * 2.2 + Math.sin(i * 2.4) * 0.6, s.height + age * 15, -s.at[1] + Math.cos(i * 1.7) * 0.6 + age * wind * 0.6);
      m.scale.setScalar((0.8 + age * 4.2) * (0.6 + 0.4 * s.strength));
      m.quaternion.copy(this.camera.quaternion);
    });
    this.smokeMat.opacity = 0.42 * s.strength;
  }

  /** Draw one frame. */
  render(f: Frame, osd: Osd, zoom = 1, panX = 0, panY = 0) {
    this.renderer.info.reset();
    if (!this.site || !this.world || !this.env || this.lost) return;
    this.flushReflection();
    this.stage(f);
    this.weather(f.t);
    this.aim(f.t);
    this.drawSmoke(f);
    this.post.setText({ topLeft: osd.name, topRight: osd.clock, bottomLeft: osd.note, bottomRight: osd.mark, rec: osd.rec });
    this.post.setZoom(zoom, panX, panY);
    this.renderer.setRenderTarget(this.post.frame);
    this.skyDome.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    // A torn line now and then, more often on a poor camera at night.
    const n = hash32('tear', this.seed, Math.floor(f.t * 12.5));
    const tear = n % 97 < (this.look && this.look.blocks > 0.5 ? 3 : 1) ? ((n >>> 8) % 100) / 100 - 0.5 : 0;
    this.post.render(tear, ((n >>> 16) % 100) / 100);
  }

  /** Put the frame's people and vehicles on the street: the new ones are made, the gone ones taken away. */
  private stage(f: Frame) {
    if (!this.env) return;
    const dark = this.env.lamps ? Math.max(this.env.night, 0.3) : 0;
    const seen = new Set<string>();
    // Whoever lies under a sheet is not drawn: the cloth is all a camera sees of them.
    let covered: Set<string> | null = null;
    for (const q of f.props ?? []) if (q.covers) (covered ??= new Set()).add(q.covers);
    for (const p of f.people) {
      if (covered?.has(p.id)) continue;
      seen.add(p.id);
      let e = this.people.get(p.id);
      if (!e) {
        const mesh = this.humans ? new HumanMesh(p.look, seedOfLook(p.id), this.humans) : new FigureMesh(p.look, this.palette);
        if (mesh instanceof HumanMesh) mesh.setGlow(this.glow);
        const blob = new Mesh(this.blobGeo, this.blobMat);
        blob.rotation.x = -Math.PI / 2;
        this.scene.add(mesh.group, blob);
        e = { mesh, blob };
        this.people.set(p.id, e);
      }
      e.mesh.update(p.pos, p.yaw, p.pose, p.scale);
      e.mesh.setHeld(p.held ?? null);
      e.mesh.group.position.y = 0.11;
      // The dark patch under a body: wider for one lying down.
      const lying = Math.abs(p.pose.lean) > 1;
      e.blob.position.set(p.pos[0] - (lying ? Math.cos(p.yaw) * 0.5 * Math.sign(-p.pose.lean) * -1 : 0), 0.15, -p.pos[1]);
      e.blob.scale.set((lying ? 0.9 : 0.36) * p.scale, (lying ? 0.5 : 0.3) * p.scale, 1);
      e.blob.rotation.z = p.yaw;
      e.blob.visible = p.scale > 0.3;
    }
    for (const [id, e] of this.people) {
      if (seen.has(id)) continue;
      this.scene.remove(e.mesh.group, e.blob);
      if (e.mesh instanceof HumanMesh) e.mesh.dispose();
      this.people.delete(id);
    }
    seen.clear();
    this.props.update(f.props);
    let bi = 0;
    for (const l of this.beaconLights) l.intensity = 0;
    for (const c of f.cars) {
      seen.add(c.id);
      let m = this.cars.get(c.id);
      if (!m) {
        m = new CarMesh(c.look, this.carKit);
        this.scene.add(m.group);
        this.cars.set(c.id, m);
      }
      m.update(c.pos, c.yaw, c.lights, f.t, dark);
      m.group.position.y = 0.05;
      if (c.lights.beacons && bi < BEACON_LIGHTS) {
        // The street flashes blue with the car.
        const l = this.beaconLights[bi++];
        const cs = Math.cos(c.yaw);
        const sn = Math.sin(c.yaw);
        l.position.set(c.pos[0] + cs * m.bar[0], m.bar[1] + 0.5, -c.pos[1] - sn * m.bar[0]);
        l.intensity = m.flashing(c.lights, f.t) * (6 + 16 * dark);
      }
    }
    for (const [id, m] of this.cars) {
      if (seen.has(id)) continue;
      this.scene.remove(m.group);
      m.dispose();
      this.cars.delete(id);
    }
  }

  private clearScene() {
    if (this.skyline) {
      this.scene.remove(this.skyline);
      this.skyline.geometry.dispose();
      for (const child of this.skyline.children) (child as Mesh).geometry.dispose();
      this.skylineMat?.map?.dispose();
      this.skylineMat?.dispose();
      this.skylineNearMat?.map?.dispose();
      this.skylineNearMat?.dispose();
      this.skylineMat = null;
      this.skylineNearMat = null;
      this.skyline = null;
    }
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
      this.world = null;
    }
    for (const e of this.people.values()) {
      this.scene.remove(e.mesh.group, e.blob);
      if (e.mesh instanceof HumanMesh) e.mesh.dispose();
    }
    this.people.clear();
    for (const m of this.cars.values()) {
      this.scene.remove(m.group);
      m.dispose();
    }
    this.cars.clear();
    // The shadow pass's stand-in materials hold the textures of the street they were made for.
    for (const m of this.shadowMats.values()) m.dispose();
    this.shadowMats.clear();
  }

  /**
   * Let go of everything this view made, the graphics context last. Nothing of it may stay reachable from outside
   * the view: every texture, material, geometry and render target is disposed (which also takes the renderer's
   * listener off it), and the renderer then gives its context up.
   */
  dispose() {
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.clearScene();
    this.warmPerson?.dispose();
    this.warmProps?.dispose();
    this.warmCar = null;
    this.warmPerson = null;
    this.warmProps = null;
    this.expected = [];
    this.carKit.dispose();
    this.props.dispose();
    this.buildWeather(null);
    this.palette.dispose();
    this.post.dispose();
    this.scene.environment = null;
    this.reflection?.dispose();
    this.reflection = null;
    this.pmrem.dispose();
    // The lights' shadow maps (render targets the renderer made for them).
    for (const l of [this.sun, this.irLamp, ...this.lampLights, ...this.beaconLights]) l.dispose();
    for (const t of [this.poolTex, this.drops]) t.dispose();
    this.skyTex?.dispose();
    this.skyMat.dispose();
    this.skyDome.geometry.dispose();
    this.reflGeo.dispose();
    for (const m of [this.reflMat, this.sunGlintMat, this.lampGlintMat]) m.dispose();
    const sh = this.sheets;
    for (const t of [sh.atlas.map, sh.atlas.lit, sh.asphalt, sh.paving, sh.grass, sh.setts, sh.decals, sh.glow]) t.dispose();
    this.blobGeo.dispose();
    this.blobMat.dispose();
    this.smokeMat.dispose();
    for (const p of this.pools) (p.material as MeshBasicMaterial).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
