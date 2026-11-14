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
  Fog,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
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
  type WebGLRenderTarget,
} from 'three';
import type { Env } from '../env';
import { hash01, hash32, wobble } from '../math';
import type { Site } from '../types';
import type { Frame } from '../stage';
import { BEACON_COLOR, CarMesh } from './cars';
import { HumanMesh, seedOfLook, type HumanBase } from './human';
import { FigureMesh, Palette } from './people';
import { Post, type PostLook } from './post';
import { makeAtlas } from './facades';
import { beamTexture, decalTexture, dropsTexture, glareTexture, glowTexture, groundTexture, poolTexture, skylineTexture, skyTexture, type SkyLook } from './textures';
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

/** Can this browser draw the camera at all? */
export function canRender(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
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
  private site: Site | null = null;
  private env: Env | null = null;
  private palette = new Palette();
  private people = new Map<string, { mesh: FigureMesh | HumanMesh; blob: Mesh }>();
  /** The real body every figure is cut from; until it has loaded, figures are plain mannequins. */
  private humans: HumanBase | null = null;
  private glow = 0;
  private cars = new Map<string, CarMesh>();
  private hemi = new HemisphereLight(0xffffff, 0x444444, 1);
  private fill = new AmbientLight(0xffffff, 0);
  private sun = new DirectionalLight(0xffffff, 1);
  /** The camera's own infrared lamp: it lights what is near when the picture is black and white. */
  private irLamp = new PointLight(0xffffff, 0, 50, 1.7);
  /** Street lamps shine down: their light falls on the ground and the lower walls, not on the roofs. */
  private lampLights: SpotLight[] = [];
  private beaconLights: PointLight[] = [];
  private pools: Mesh[] = [];
  private carTex = { glow: glowTexture(), beam: beamTexture() };
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
  /** The sky all round: a dome painted for the hour and the weather (repainted when they change). */
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
  /** What paint and glass reflect: the sky of the hour, the sun, the lamps. */
  private pmrem: PMREMGenerator;
  private reflection: WebGLRenderTarget | null = null;
  private seed = 1;
  private lost = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power', stencil: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(FRAME_W, FRAME_H, false);
    // The counts of a whole frame (scene and screen passes), read by the harness against the budget.
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.post = new Post(this.renderer, FRAME_W, FRAME_H, this.drops);
    this.pmrem = new PMREMGenerator(this.renderer);
    this.scene.add(this.hemi, this.fill, this.sun, this.sun.target, this.irLamp);
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
    this.world = buildWorld(site, env, this.sheets);
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

  /** The hour or the weather changed: light, sky, lamps and the camera's own look. The street stays as built. */
  setEnv(env: Env) {
    if (!this.site) return;
    const rebuilt = !this.env || Math.abs(this.env.snow - env.snow) > 0.3 || this.env.rain !== env.rain || this.env.season !== env.season;
    if (rebuilt) return this.setScene(this.site, env);
    this.env = env;
    this.applyLight(env);
  }

  private applyLight(env: Env) {
    const site = this.site!;
    const night = env.night;
    const clear = env.weather === 'clear';
    const overcast = !clear;
    const up = Math.max(0, env.sunAlt);
    const day = Math.min(1, up / 12);
    const sky = this.paintSky(env);
    const far = 620 - 500 * env.fog;
    this.scene.fog = new Fog(sky.getHex(), env.fog > 0.5 ? 12 : 60, far);

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
    this.sun.castShadow = shadows;
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
    this.lampLights.forEach((l, i) => {
      const lamp = order[i];
      const pool = this.pools[i];
      // A lamp that is off leaves the shaders altogether (it costs every pixel otherwise); the farthest two of the
      // six nearest lamps only paint their pools.
      l.visible = !!lamp && lit > 0 && i < LAMP_LIGHTS - 2;
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

    this.reflect(sky, env, dir);
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
    this.skyTex = skyTexture(look, this.seed, this.skyTex ?? undefined);
    this.skyTex.needsUpdate = true;
    this.skyMat.map = this.skyTex;
    this.skyMat.needsUpdate = true;
    this.scene.background = horizon;
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
    const s = new Scene();
    const geo = new SphereGeometry(60, 24, 14);
    const pos = geo.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const night = env.night;
    const horizon = sky.clone().lerp(new Color(0xffffff), 0.35 * (1 - night)).multiplyScalar(1.15);
    const zenith = sky.clone().multiplyScalar(night > 0.5 ? 0.6 : 0.85);
    const ground = new Color(0x3a3b3d).multiplyScalar(0.25 + 0.75 * (1 - night));
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const up = pos.getY(i) / 60;
      if (up >= 0) c.copy(horizon).lerp(zenith, Math.pow(up, 0.55));
      else c.copy(horizon).lerp(ground, Math.min(1, -up * 6));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    const dome = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide }));
    s.add(dome);
    const glints: Mesh[] = [];
    const glint = (x: number, y: number, z: number, size: number, color: Color) => {
      const m = new Mesh(this.blobGeo, new MeshBasicMaterial({ color, side: BackSide }));
      m.position.set(x * 50, y * 50, z * 50);
      m.scale.setScalar(size);
      m.lookAt(0, 0, 0);
      s.add(m);
      glints.push(m);
    };
    if (night < 0.5 && env.weather === 'clear' && env.sunAlt > 2) glint(sunDir[0], sunDir[1], sunDir[2], 5, new Color(30, 28, 24));
    if (env.lamps) {
      // Street lamps and lit windows, low round the horizon.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + hash01('gl', this.seed, i);
        glint(Math.cos(a) * 0.93, 0.18 + 0.2 * hash01('gh', this.seed, i), Math.sin(a) * 0.93, 2.2, new Color(9, 7.5, 5).multiplyScalar(0.4 + night));
      }
    }
    const old = this.reflection;
    this.reflection = this.pmrem.fromScene(s, 0.035);
    this.scene.environment = this.reflection.texture;
    this.scene.environmentIntensity = 0.5 + 0.5 * (1 - night);
    old?.dispose();
    geo.dispose();
    (dome.material as MeshBasicMaterial).dispose();
    for (const m of glints) (m.material as MeshBasicMaterial).dispose();
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

  private buildWeather(env: Env) {
    if (this.rain) {
      this.scene.remove(this.rain);
      this.rain.geometry.dispose();
      (this.rain.material as LineBasicMaterial).dispose();
      this.rain = null;
    }
    if (this.snow) {
      this.scene.remove(this.snow);
      this.snow.geometry.dispose();
      (this.snow.material as PointsMaterial).dispose();
      this.snow = null;
    }
    if (env.rain) {
      const n = env.weather === 'storm' ? 620 : 300;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(n * 6), 3));
      // In the dark only the streaks near a light show; the night picture's gain would turn all of them into a curtain.
      const opacity = 0.3 * (1 - 0.6 * env.night);
      this.rain = new LineSegments(g, new LineBasicMaterial({ color: 0xc9d2dc, transparent: true, opacity, depthWrite: false }));
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    }
    if (env.snowing) {
      const n = 520;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
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
    if (this.rain) {
      const a = this.rain.geometry.getAttribute('position') as BufferAttribute;
      const n = a.count / 2;
      for (let i = 0; i < n; i++) {
        const x = c[0] + (hash01('rx', i) - 0.5) * 46;
        const z = -c[1] + (hash01('rz', i) - 0.5) * 46;
        const speed = 15 + hash01('rs', i) * 6;
        let y = 16 - ((t * speed + hash01('ry', i) * 16) % 16);
        // Not right in front of the lens, where a drop would be a bar across the picture.
        if (Math.hypot(x - cx, z - cz) < 7) y = -5;
        a.setXYZ(i * 2, x + wind * (16 - y), y, z);
        a.setXYZ(i * 2 + 1, x + wind * (16 - y) - wind * 0.7, y + 0.7, z);
      }
      a.needsUpdate = true;
    }
    if (this.snow) {
      const a = this.snow.geometry.getAttribute('position') as BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        const speed = 1.1 + hash01('ss', i) * 0.9;
        const y = 14 - ((t * speed + hash01('sy', i) * 14) % 14);
        const x = c[0] + (hash01('sx', i) - 0.5) * 50 + Math.sin(t * 0.8 + i) * 0.5 + wind * 6 * (14 - y) * 0.2;
        const z = -c[1] + (hash01('sz', i) - 0.5) * 50 + Math.cos(t * 0.6 + i * 1.7) * 0.5;
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
    while (this.smoke.length < SMOKE_PUFFS) {
      const m = new Mesh(this.blobGeo, this.smokeMat);
      m.renderOrder = 3;
      this.smoke.push(m);
      this.scene.add(m);
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
    const dark = this.env.lamps ? Math.max(this.env.night, 0.3) : 0;
    const seen = new Set<string>();
    for (const p of f.people) {
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
    let bi = 0;
    for (const l of this.beaconLights) l.intensity = 0;
    for (const c of f.cars) {
      seen.add(c.id);
      let m = this.cars.get(c.id);
      if (!m) {
        m = new CarMesh(c.look, this.carTex);
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

  private clearScene() {
    if (this.skyline) {
      this.scene.remove(this.skyline);
      this.skyline.geometry.dispose();
      for (const child of this.skyline.children) (child as Mesh).geometry.dispose();
      this.skylineMat?.map?.dispose();
      this.skylineMat?.dispose();
      this.skylineNearMat?.map?.dispose();
      this.skylineNearMat?.dispose();
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
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.clearScene();
    this.palette.dispose();
    this.post.dispose();
    this.reflection?.dispose();
    this.pmrem.dispose();
    for (const t of [this.carTex.glow, this.carTex.beam, this.poolTex, this.drops]) t.dispose();
    this.skyTex?.dispose();
    this.skyMat.dispose();
    this.skyDome.geometry.dispose();
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
