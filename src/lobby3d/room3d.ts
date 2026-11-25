/**
 * Juhtimiskeskuse saal: the multiplayer screen's control room, drawn with three.js (docs/MULTIPLAYER.md section 19).
 * This module is the entry of the lazy lobby3d chunk: LobbyStage.tsx loads it with import() when the multiplayer
 * screen opens, and with it three.js (the shared three chunk). Nothing of the game's own bundle imports it statically
 * (tests/cctv-lazy.test.ts).
 *
 * `openRoom` builds the room on the stage's canvas: a curved video wall, an arc of consoles before it (a desk, two
 * monitors, a chair and a strip of light each), a floor that mirrors the wall faintly, fog. Everything is low-poly
 * and made here; the pictures on the screens are 2D canvases (paint.ts). The handle it returns shows a description
 * of the scene (scene.ts) and keeps to the stage's rules: no frame unless the stage says it is seen, 30 frames a
 * second at most, still frames only when asked, and everything given back on dispose.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import {
  fontsReady,
  loadPicture,
  MONITOR_H,
  MONITOR_W,
  paintIdentity,
  paintStatus,
  paintWall,
  sectorAnchors,
  type WallLayer,
} from './paint';
import { LED_COLOUR, newlySeated, PALETTE, seatAngles, type SceneDesc, type SeatDesc } from './scene';

/** The room's measures, metres. The wall and the consoles' arc share one centre of curvature behind the camera. */
const CENTRE_Z = 6;
const WALL_R = 15;
const WALL_HALF = 0.49;
const WALL_Y0 = 1;
const WALL_Y1 = 5.6;
const CONSOLE_R = 9.2;
const DESK_W = 2;
const DESK_H = 0.76;
const SCREEN_W = 0.86;
const SCREEN_H = SCREEN_W * (MONITOR_H / MONITOR_W);
const MAX_SEATS = 4;
/** The share of the wall's width its board takes, in the middle: what a narrow window must show of the wall. */
const BOARD_SHARE = 0.37;
/** Frames a second at most, and the quality steps a slow machine is taken down (a share of the pixel ratio). */
const FRAME_MS = 1000 / 30;
const QUALITY_STEPS = [1, 0.75, 0.5];
/** The camera's slow sway (degrees each way), its period and the dolly's (seconds). */
const SWAY_DEG = 5;
const SWAY_S = 36;
const DOLLY_S = 31;
/** A monitor coming on, and the camera leaning to it (seconds). */
const WIPE_S = 0.9;
const LEAN_S = 2.6;

/** Can this browser draw the room at all. The probe's context is given back at once: a page may hold only a few. */
export function canRender(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** The part of the canvas the room is composed for (CSS px from its top left): what the panels leave free. */
export interface StageView {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomHandle {
  /** Show this description. What changed is repainted; a player who just sat down gets their monitor's wipe. */
  show(scene: SceneDesc): void;
  /** The canvas's size (CSS px), the window in it to compose for, and the device pixel ratio to draw at. */
  resize(width: number, height: number, view: StageView, pixelRatio: number): void;
  /** Whether the stage is seen (the document shown, the stage on screen): no frame is drawn while it is not. */
  setActive(active: boolean): void;
  /** Reduced motion: no sway, no wipes, a frame only when something changed. */
  setStill(still: boolean): void;
  /**
   * Drawn by the processor, not by a graphics card (SwiftShader, llvmpipe and the like, where a browser blocks the
   * card): the room is then always still, since every frame of the sway would keep a processor core busy.
   */
  readonly software: boolean;
  /** Frames drawn so far (the stage's tests read it). */
  readonly frames: number;
  dispose(): void;
}

export interface OpenRoomOptions {
  /** A phone: smaller textures and no antialiasing. */
  small: boolean;
  /** The browser took the graphics context away: the stage shows its still picture instead. */
  onLost: () => void;
  /** The first frame is on the canvas. */
  onFirstFrame: () => void;
}

/** Whether the renderer draws without a graphics card: the names software renderers give themselves. */
function softwareRenderer(renderer: WebGLRenderer): boolean {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  return /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i.test(name);
}

/** A strip of a cylinder's inside around the room's centre, between two heights: u runs left to right, v up. */
function arcBand(radius: number, half: number, y0: number, y1: number, segments: number): BufferGeometry {
  const pos = new Float32Array((segments + 1) * 6);
  const uv = new Float32Array((segments + 1) * 4);
  const index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = -half + (i / segments) * half * 2;
    const x = radius * Math.sin(a);
    const z = CENTRE_Z - radius * Math.cos(a);
    pos.set([x, y0, z, x, y1, z], i * 6);
    uv.set([i / segments, 0, i / segments, 1], i * 4);
    if (i < segments) index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** The floor before the wall, as a mirror of it: the wall's picture upside down, fading out toward the camera. */
function reflectionBand(depth: number, segments: number): BufferGeometry {
  const pos = new Float32Array((segments + 1) * 6);
  const uv = new Float32Array((segments + 1) * 4);
  const colour = new Float32Array((segments + 1) * 6);
  const index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = -WALL_HALF + (i / segments) * WALL_HALF * 2;
    const far = WALL_R - 0.1;
    const near = WALL_R - depth;
    pos.set(
      [
        far * Math.sin(a),
        0.012,
        CENTRE_Z - far * Math.cos(a),
        near * Math.sin(a),
        0.012,
        CENTRE_Z - near * Math.cos(a),
      ],
      i * 6,
    );
    uv.set([i / segments, 0, i / segments, 1], i * 4);
    // Bright at the wall's foot, gone where the band ends (the material adds, so black shows nothing).
    colour.set([1, 1, 1, 0, 0, 0], i * 6);
    if (i < segments) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('color', new BufferAttribute(colour, 3));
  g.setIndex(index);
  return g;
}

/** A soft round glow as a texture (the light a strip throws on the floor). */
function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** The floor's tiles: thin seams on the dark floor, repeated. */
function floorTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#101c29';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(0, 0, 128, 2);
    ctx.fillRect(0, 0, 2, 128);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.repeat.set(60, 46);
  return t;
}

/** A screen's picture: smoothed down for the distance it is seen from (the words on it must not shimmer). */
function screenTexture(canvas: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  return t;
}

/** What the consoles share: every console is the same shapes in the same materials, but for what it lights. */
interface Kit {
  top: BoxGeometry;
  side: BoxGeometry;
  back: BoxGeometry;
  strip: BoxGeometry;
  tint: BoxGeometry;
  bezel: BoxGeometry;
  stand: BoxGeometry;
  screen: PlaneGeometry;
  scan: PlaneGeometry;
  seat: BoxGeometry;
  rest: BoxGeometry;
  post: CylinderGeometry;
  glow: PlaneGeometry;
  ring: RingGeometry;
  mark: OctahedronGeometry;
  body: MeshLambertMaterial;
  dark: MeshLambertMaterial;
  shutter: MeshBasicMaterial;
  gold: MeshBasicMaterial;
  glowMap: CanvasTexture;
}

function makeKit(): Kit {
  const glow = new PlaneGeometry(3.4, 2.6);
  glow.rotateX(-Math.PI / 2);
  const ring = new RingGeometry(1.62, 1.7, 48);
  ring.rotateX(-Math.PI / 2);
  return {
    top: new BoxGeometry(DESK_W, 0.06, 0.86),
    side: new BoxGeometry(0.06, DESK_H - 0.03, 0.8),
    back: new BoxGeometry(DESK_W - 0.1, 0.52, 0.04),
    strip: new BoxGeometry(DESK_W - 0.04, 0.07, 0.03),
    tint: new BoxGeometry(0.03, 0.05, 0.86),
    bezel: new BoxGeometry(SCREEN_W + 0.05, SCREEN_H + 0.05, 0.04),
    stand: new BoxGeometry(0.08, 0.16, 0.05),
    screen: new PlaneGeometry(SCREEN_W, SCREEN_H),
    scan: new PlaneGeometry(SCREEN_W, 0.03),
    seat: new BoxGeometry(0.52, 0.09, 0.5),
    rest: new BoxGeometry(0.48, 0.62, 0.08),
    post: new CylinderGeometry(0.04, 0.2, 0.44, 6),
    glow,
    ring,
    mark: new OctahedronGeometry(0.1),
    body: new MeshLambertMaterial({ color: '#33414f' }),
    dark: new MeshLambertMaterial({ color: '#1e2935' }),
    shutter: new MeshBasicMaterial({ color: PALETTE.off }),
    gold: new MeshBasicMaterial({ color: PALETTE.gold }),
    glowMap: glowTexture(),
  };
}

/** One monitor: its screen's material and picture, and the shutter and scanline of its wipe. */
interface Monitor {
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  material: MeshBasicMaterial;
  shutter: Mesh;
  scan: Mesh;
}

/** A console of the room: what of it changes with its seat. */
interface Console {
  group: Group;
  identity: Monitor;
  status: Monitor;
  strip: MeshBasicMaterial;
  glow: MeshBasicMaterial;
  tints: MeshBasicMaterial;
  tintMeshes: Mesh[];
  ring: Mesh;
  mark: Mesh;
  /** The thin line of light to the console's sector on the wall (a sector room). */
  line: Line;
  lineMaterial: LineBasicMaterial;
  /** The seat as it was last painted, to repaint only what changed. */
  painted: string;
  /** Counts the paints, so that a picture that arrives late is not painted over a newer seat. */
  token: number;
  /** When the monitors' wipe began (seconds on the room's clock), or -1. */
  wipeAt: number;
  led: SeatDesc['led'];
}

function makeMonitor(
  kit: Kit,
  parent: Group,
  x: number,
  turn: number,
  scanMaterial: MeshBasicMaterial,
  anisotropy: number,
): Monitor {
  const holder = new Group();
  holder.position.set(x, DESK_H + 0.16 + SCREEN_H / 2, -0.2);
  holder.rotation.y = turn;
  parent.add(holder);
  holder.add(new Mesh(kit.bezel, kit.dark));
  const stand = new Mesh(kit.stand, kit.dark);
  stand.position.set(0, -SCREEN_H / 2 - 0.08, -0.02);
  holder.add(stand);
  const canvas = document.createElement('canvas');
  canvas.width = MONITOR_W;
  canvas.height = MONITOR_H;
  const texture = screenTexture(canvas, anisotropy);
  const material = new MeshBasicMaterial({ color: PALETTE.off, fog: false });
  const screen = new Mesh(kit.screen, material);
  screen.position.z = 0.021;
  holder.add(screen);
  const shutter = new Mesh(kit.screen, kit.shutter);
  shutter.position.z = 0.024;
  shutter.visible = false;
  holder.add(shutter);
  const scan = new Mesh(kit.scan, scanMaterial);
  scan.position.z = 0.026;
  scan.visible = false;
  holder.add(scan);
  return { canvas, texture, material, shutter, scan };
}

function makeConsole(kit: Kit, scanMaterial: MeshBasicMaterial, anisotropy: number): Console {
  const group = new Group();
  const add = (mesh: Mesh, x: number, y: number, z: number) => {
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  add(new Mesh(kit.top, kit.body), 0, DESK_H, 0);
  add(new Mesh(kit.side, kit.dark), -DESK_W / 2 + 0.03, (DESK_H - 0.03) / 2, 0);
  add(new Mesh(kit.side, kit.dark), DESK_W / 2 - 0.03, (DESK_H - 0.03) / 2, 0);
  add(new Mesh(kit.back, kit.dark), 0, 0.46, -0.38);
  // The strip of light along the edge the operator sits at (the camera looks from behind them).
  const strip = new MeshBasicMaterial({ color: PALETTE.off, fog: false });
  add(new Mesh(kit.strip, strip), 0, DESK_H - 0.02, 0.44);
  const tints = new MeshBasicMaterial({ color: PALETTE.off, fog: false });
  const tintMeshes = [
    add(new Mesh(kit.tint, tints), -DESK_W / 2 + 0.015, DESK_H + 0.04, 0),
    add(new Mesh(kit.tint, tints), DESK_W / 2 - 0.015, DESK_H + 0.04, 0),
  ];
  for (const m of tintMeshes) m.visible = false;
  // The chair, pushed back a little from the desk.
  add(new Mesh(kit.seat, kit.dark), 0, 0.5, 1.02);
  add(new Mesh(kit.rest, kit.dark), 0, 0.86, 1.25);
  add(new Mesh(kit.post, kit.dark), 0, 0.23, 1.02);
  // The strip's light on the floor: the cheap half of a reflection.
  const glow = new MeshBasicMaterial({
    map: kit.glowMap,
    color: PALETTE.off,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  add(new Mesh(kit.glow, glow), 0, 0.015, 0.5);
  const ring = add(
    new Mesh(
      kit.ring,
      new MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.75, fog: false }),
    ),
    0,
    0.02,
    0.3,
  );
  ring.visible = false;
  const mark = add(new Mesh(kit.mark, kit.gold), DESK_W / 2 - 0.16, DESK_H + 0.2, 0.26);
  mark.visible = false;
  const lineMaterial = new LineBasicMaterial({
    color: PALETTE.cyan,
    transparent: true,
    opacity: 0.7,
    fog: false,
  });
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
  const line = new Line(lineGeometry, lineMaterial);
  line.visible = false;
  line.frustumCulled = false;
  return {
    group,
    identity: makeMonitor(kit, group, -0.48, 0.1, scanMaterial, anisotropy),
    status: makeMonitor(kit, group, 0.48, -0.1, scanMaterial, anisotropy),
    strip,
    glow,
    tints,
    tintMeshes,
    ring,
    mark,
    line,
    lineMaterial,
    painted: '',
    token: 0,
    wipeAt: -1,
    led: 'off',
  };
}

/** Every geometry, material and texture under `root`, given back to the graphics card. */
function disposeTree(root: Object3D): void {
  const seen = new Set<{ dispose(): void }>();
  root.traverse((o) => {
    const mesh = o as Partial<Mesh>;
    if (mesh.geometry) seen.add(mesh.geometry);
    const mats: Material[] = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of mats) {
      seen.add(m);
      const map = (m as Material & { map?: Texture | null }).map;
      if (map) seen.add(map);
    }
  });
  for (const x of seen) x.dispose();
}

class Room implements RoomHandle {
  frames = 0;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(34, 1, 0.5, 200);
  private kit = makeKit();
  private scanMaterial = new MeshBasicMaterial({
    color: '#d8f3ff',
    transparent: true,
    opacity: 0.9,
    fog: false,
  });
  private consoles: Console[] = [];
  private wallCanvas = document.createElement('canvas');
  private wallTexture: CanvasTexture;
  private mirrorMaterial: MeshBasicMaterial;
  private wallLight = new PointLight(PALETTE.cyan, 0, 40, 1.4);
  private wallLayer: WallLayer = { key: '', canvas: null };
  private pictures = new Map<string, Promise<HTMLImageElement | null>>();
  private desc: SceneDesc | null = null;
  private wallKey = '';
  private layoutKey = '';
  private anchors: Record<string, [number, number]> = {};
  private size = { w: 1, h: 1, ratio: 1 };
  private view: StageView = { x: 0, y: 0, w: 1, h: 1 };
  /** Where the camera stands for the window, before it sways: how far from what it looks at, and how high up. */
  private fit = { dist: 14, pitch: 0.2, target: new Vector3(0, 2.4, CENTRE_Z - CONSOLE_R - 2.6) };
  private probe = new PerspectiveCamera(34, 1, 0.5, 200);
  private fog = new FogExp2(PALETTE.navy, 0.03);
  private active = false;
  private still = false;
  readonly software: boolean;
  private dirty = true;
  private disposed = false;
  private raf = 0;
  private last = 0;
  /** The room's own clock (seconds of drawn time), for the sway, the pulse and the wipes. */
  private clock = 0;
  private lean: { at: number; x: number } | null = null;
  private quality = 0;
  private slow = 0;
  private small: boolean;
  private canvas: HTMLCanvasElement;
  private onLost: () => void;
  private onFirstFrame: () => void;

  constructor(canvas: HTMLCanvasElement, o: OpenRoomOptions) {
    this.canvas = canvas;
    this.small = o.small;
    this.onLost = o.onLost;
    this.onFirstFrame = o.onFirstFrame;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: !o.small,
      alpha: false,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(PALETTE.navy);
    canvas.addEventListener('webglcontextlost', this.lost);
    this.software = softwareRenderer(this.renderer);
    this.still = this.software;

    const s = this.scene;
    s.fog = this.fog;
    s.add(new HemisphereLight('#a9cdea', '#0a1622', 2.6));
    this.wallLight.position.set(0, 3.6, -5.5);
    s.add(this.wallLight);

    // The floor, and the room's own wall behind and around the video wall.
    const floor = new PlaneGeometry(90, 70);
    floor.rotateX(-Math.PI / 2);
    s.add(new Mesh(floor, new MeshLambertMaterial({ map: floorTexture() })));
    s.add(
      new Mesh(
        arcBand(WALL_R + 0.5, 1.3, 0, 16, 24),
        new MeshLambertMaterial({ color: '#122131', side: DoubleSide }),
      ),
    );
    // Slots of light in the room's wall above the video wall, so that a tall window has something up there.
    const slot = new MeshBasicMaterial({ color: '#1d4a66', side: DoubleSide });
    for (const y of [7.4, 9.2, 11]) s.add(new Mesh(arcBand(WALL_R + 0.45, 0.62, y, y + 0.09, 24), slot));

    // The video wall: a frame, the picture, and a line of light along its top and its foot.
    const anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.wallTexture = screenTexture(this.wallCanvas, anisotropy);
    const picture = new MeshBasicMaterial({ map: this.wallTexture, side: DoubleSide, fog: false });
    s.add(new Mesh(arcBand(WALL_R, WALL_HALF, WALL_Y0, WALL_Y1, 40), picture));
    const frame = new MeshBasicMaterial({ color: '#03070b', side: DoubleSide });
    s.add(new Mesh(arcBand(WALL_R + 0.12, WALL_HALF + 0.012, WALL_Y0 - 0.16, WALL_Y1 + 0.16, 40), frame));
    const trim = new MeshBasicMaterial({
      color: PALETTE.cyan,
      side: DoubleSide,
      transparent: true,
      opacity: 0.55,
    });
    s.add(new Mesh(arcBand(WALL_R - 0.02, WALL_HALF + 0.012, WALL_Y1 + 0.17, WALL_Y1 + 0.21, 40), trim));
    s.add(new Mesh(arcBand(WALL_R - 0.02, WALL_HALF + 0.012, WALL_Y0 - 0.21, WALL_Y0 - 0.17, 40), trim));
    this.mirrorMaterial = new MeshBasicMaterial({
      map: this.wallTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });
    s.add(new Mesh(reflectionBand(5.2, 40), this.mirrorMaterial));

    for (let i = 0; i < MAX_SEATS; i++) {
      const c = makeConsole(this.kit, this.scanMaterial, anisotropy);
      c.group.visible = false;
      s.add(c.group);
      s.add(c.line);
      this.consoles.push(c);
    }
  }

  private lost = () => {
    if (this.disposed) return;
    this.stop();
    this.onLost();
  };

  show(desc: SceneDesc): void {
    if (this.disposed) return;
    const prev = this.desc;
    this.desc = desc;
    const wallKey = JSON.stringify(desc.wall);
    if (wallKey !== this.wallKey) {
      this.wallKey = wallKey;
      paintWall(this.wallCanvas, desc.wall, this.small ? 0.5 : 1, this.wallLayer);
      this.wallTexture.needsUpdate = true;
      this.wallLight.intensity = desc.wall.dim ? 9 : 26;
      this.mirrorMaterial.opacity = desc.wall.dim ? 0.14 : 0.3;
      this.anchors = sectorAnchors(desc.wall.map);
    }
    const layoutKey = `${desc.seats.length}|${desc.arrangement}`;
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey;
      const angles = seatAngles(desc.seats.length, desc.arrangement);
      this.consoles.forEach((c, i) => {
        c.group.visible = i < angles.length;
        if (i >= angles.length) {
          c.line.visible = false;
          return;
        }
        const a = angles[i];
        c.group.position.set(CONSOLE_R * Math.sin(a), 0, CENTRE_Z - CONSOLE_R * Math.cos(a));
        // The desk's far edge faces the wall along the arc's radius.
        c.group.rotation.y = -a;
      });
      this.frame();
    }
    const joined = this.still ? [] : newlySeated(prev, desc);
    desc.seats.forEach((seat, i) => {
      const c = this.consoles[i];
      if (c) this.paintSeat(c, seat, joined.includes(i));
    });
    if (joined.length) this.lean = { at: this.clock, x: this.consoles[joined[0]].group.position.x };
    this.invalidate();
  }

  /** One console for its seat: the monitors' pictures, the strip, the marks and the line to its sector. */
  private paintSeat(c: Console, seat: SeatDesc, joined: boolean): void {
    const anchor = seat.sector ? this.anchors[seat.sector] : undefined;
    const key = JSON.stringify([seat, anchor ?? null, c.group.position.x]);
    if (key === c.painted) return;
    c.painted = key;
    c.led = seat.led;
    const on = seat.state !== 'dark';
    const led = new Color(LED_COLOUR[seat.led]);
    c.strip.color.copy(led);
    c.glow.color
      .copy(led)
      .multiplyScalar(seat.state === 'seated' || seat.state === 'invite' ? 0.5 : on ? 0.16 : 0);
    c.ring.visible = seat.me;
    c.mark.visible = seat.host;
    for (const m of c.tintMeshes) m.visible = !!seat.tint;
    if (seat.tint) c.tints.color.set(seat.tint);
    for (const m of [c.identity, c.status]) {
      m.material.map = on ? m.texture : null;
      m.material.color.set(on ? '#ffffff' : PALETTE.off);
      m.material.needsUpdate = true;
    }
    if (on) {
      const token = ++c.token;
      paintIdentity(c.identity.canvas, seat, null);
      paintStatus(c.status.canvas, seat);
      c.identity.texture.needsUpdate = true;
      c.status.texture.needsUpdate = true;
      if (seat.picture) {
        const { picture } = seat;
        const id = `${picture.avatar}|${picture.name}`;
        let p = this.pictures.get(id);
        if (!p) this.pictures.set(id, (p = loadPicture(picture)));
        void p.then((img) => {
          if (this.disposed || c.token !== token || !img) return;
          paintIdentity(c.identity.canvas, seat, img);
          c.identity.texture.needsUpdate = true;
          this.invalidate();
        });
      }
    }
    if (joined) c.wipeAt = this.clock;
    // The line of light from the console's monitors to its sector on the wall.
    c.line.visible = !!(seat.tint && anchor);
    if (seat.tint && anchor) {
      c.lineMaterial.color.set(seat.tint);
      const a = -WALL_HALF + anchor[0] * WALL_HALF * 2;
      const r = WALL_R - 0.05;
      const from = c.group.localToWorld(new Vector3(0, DESK_H + 0.2 + SCREEN_H, -0.22));
      const pos = c.line.geometry.getAttribute('position') as BufferAttribute;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, r * Math.sin(a), WALL_Y1 - anchor[1] * (WALL_Y1 - WALL_Y0), CENTRE_Z - r * Math.cos(a));
      pos.needsUpdate = true;
    }
  }

  resize(width: number, height: number, view: StageView, pixelRatio: number): void {
    if (this.disposed) return;
    const same =
      this.size.w === width &&
      this.size.h === height &&
      this.size.ratio === pixelRatio &&
      this.view.x === view.x &&
      this.view.y === view.y &&
      this.view.w === view.w &&
      this.view.h === view.h;
    if (same) return;
    this.size = { w: Math.max(1, width), h: Math.max(1, height), ratio: pixelRatio };
    this.view = { ...view, w: Math.max(1, view.w), h: Math.max(1, view.h) };
    this.applySize();
    this.frame();
    this.invalidate();
  }

  private applySize(): void {
    this.renderer.setPixelRatio(this.size.ratio * QUALITY_STEPS[this.quality]);
    this.renderer.setSize(this.size.w, this.size.h, false);
  }

  /** The camera's lens for the window: the room is composed in it, and the canvas around it shows what is beside. */
  private frame(): void {
    const { w, h } = this.view;
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, -this.view.x, -this.view.y, this.size.w, this.size.h);
    this.camera.updateProjectionMatrix();
    this.compose();
  }

  /** What the window must show: every console that is in use, and the wall (a narrow window: its board at least). */
  private fitPoints(wholeWall: boolean): Vector3[] {
    const pts: Vector3[] = [];
    for (const c of this.consoles) {
      if (!c.group.visible) continue;
      c.group.updateMatrixWorld();
      for (const x of [-1.15, 1.15]) {
        pts.push(c.group.localToWorld(new Vector3(x, 0, 1.5)));
        pts.push(c.group.localToWorld(new Vector3(x, DESK_H + 0.3 + SCREEN_H, -0.3)));
      }
    }
    const half = WALL_HALF * (wholeWall ? 1.02 : BOARD_SHARE);
    for (const a of [-half, half])
      for (const y of [WALL_Y0 - 0.3, WALL_Y1 + 0.35])
        pts.push(new Vector3(WALL_R * Math.sin(a), y, CENTRE_Z - WALL_R * Math.cos(a)));
    return pts;
  }

  private place(cam: PerspectiveCamera, target: Vector3, pitch: number, dist: number, sway: number): void {
    const flat = Math.cos(pitch) * dist;
    cam.position.set(
      target.x + Math.sin(sway) * flat,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(sway) * flat,
    );
    cam.lookAt(target);
    cam.updateMatrixWorld();
  }

  /**
   * Finds where the camera stands for the window: as near as shows all of `fitPoints`, looking down the more the
   * taller the window is (so that the floor between the consoles and the wall fills it), centred up and down.
   */
  private compose(): void {
    const aspect = this.view.w / this.view.h;
    const tall = Math.min(1, Math.max(0, (1.5 - aspect) / 0.8));
    const pitch = ((9 + 17 * tall) * Math.PI) / 180;
    const cam = this.probe;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    const pts = this.fitPoints(aspect > 1.3);
    const target = new Vector3(0, 2.4, CENTRE_Z - CONSOLE_R - 2.6);
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
    const v = new Vector3();
    let dist = 14;
    for (let pass = 0; pass < 4; pass++) {
      let lo = 4;
      let hi = 120;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        this.place(cam, target, pitch, mid, 0);
        const ok = pts.every((p) => {
          v.copy(p).project(cam);
          return Math.abs(v.x) <= 0.9 && Math.abs(v.y) <= 0.88;
        });
        if (ok) hi = mid;
        else lo = mid;
      }
      dist = hi;
      this.place(cam, target, pitch, dist, 0);
      let min = Infinity;
      let max = -Infinity;
      for (const p of pts) {
        v.copy(p).project(cam);
        min = Math.min(min, v.y);
        max = Math.max(max, v.y);
      }
      const off = (min + max) / 2;
      if (Math.abs(off) < 0.01) break;
      // Lifting the camera and what it looks at by the same height moves the picture down by as much.
      target.y += off * dist * tanHalf;
    }
    this.fit = { dist, pitch, target };
    // The fog thickens with the distance looked through, so the consoles stay as clear from far as from near.
    this.fog.density = 0.5 / dist;
  }

  /** Where the camera stands at the room's time `t`: at its place for the window, swaying and leaning a little. */
  private pose(t: number): void {
    let { dist } = this.fit;
    const target = this.fit.target.clone();
    let sway = 0;
    if (!this.still) {
      sway = Math.sin((t / SWAY_S) * Math.PI * 2) * ((SWAY_DEG * Math.PI) / 180);
      dist *= 1 + 0.03 * Math.sin((t / DOLLY_S) * Math.PI * 2);
      if (this.lean) {
        const p = (t - this.lean.at) / LEAN_S;
        if (p >= 1) this.lean = null;
        else {
          const ease = Math.sin(Math.PI * p) ** 2;
          target.x += this.lean.x * 0.35 * ease;
          dist *= 1 - 0.07 * ease;
        }
      }
    }
    this.place(this.camera, target, this.fit.pitch, dist, sway);
  }

  /** What moves by itself: the inviting strip's pulse, the host's turning mark, the monitors' wipes. */
  private animate(t: number): void {
    for (const c of this.consoles) {
      if (!c.group.visible) continue;
      if (c.led === 'invite') {
        const k = this.still ? 1 : 0.72 + 0.28 * Math.sin(t * 2.4);
        c.strip.color.set(LED_COLOUR.invite).multiplyScalar(k);
        c.glow.color.set(LED_COLOUR.invite).multiplyScalar(0.5 * k);
      }
      if (c.mark.visible && !this.still) c.mark.rotation.y = t * 0.9;
      const wiping = c.wipeAt >= 0 && !this.still;
      const p = wiping ? (t - c.wipeAt) / WIPE_S : 1;
      if (wiping && p >= 1) c.wipeAt = -1;
      const run = wiping && p < 1;
      for (const m of [c.identity, c.status]) {
        m.shutter.visible = run;
        m.scan.visible = run;
        if (!run) {
          if (m.material.map) m.material.color.set('#ffffff');
          continue;
        }
        // The picture comes down the screen behind a bright line, flickering as the monitor finds its light.
        const open = SCREEN_H * p;
        m.shutter.scale.y = 1 - p;
        m.shutter.position.y = -open / 2;
        m.scan.position.y = SCREEN_H / 2 - open;
        m.material.color.setScalar(p < 0.35 ? 0.45 + 0.55 * Math.abs(Math.sin(t * 61)) : 1);
      }
    }
  }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (active) {
      this.last = 0;
      this.request();
    } else this.stop();
  }

  setStill(asked: boolean): void {
    const still = asked || this.software;
    if (this.disposed || this.still === still) return;
    this.still = still;
    if (still) {
      this.lean = null;
      for (const c of this.consoles) c.wipeAt = -1;
    }
    this.invalidate();
  }

  private invalidate(): void {
    this.dirty = true;
    this.request();
  }

  private request(): void {
    if (this.raf || !this.active || this.disposed) return;
    if (this.still && !this.dirty) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (this.disposed || !this.active) return;
    const since = this.last ? now - this.last : FRAME_MS;
    // The screen's own rate may be 60 or 120: every frame nearer than a thirtieth of a second is passed over.
    if (since < FRAME_MS - 2) {
      this.request();
      return;
    }
    this.last = now;
    if (!this.still) {
      this.clock += Math.min(0.1, since / 1000);
      this.govern(since);
    }
    this.animate(this.clock);
    this.pose(this.clock);
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (this.frames === 1) this.onFirstFrame();
    this.dirty = false;
    this.request();
  };

  /** A machine that cannot keep 20 frames a second for a while draws fewer pixels (two steps down at most). */
  private govern(since: number): void {
    if (this.quality >= QUALITY_STEPS.length - 1) return;
    this.slow = since > 50 ? this.slow + 1 : Math.max(0, this.slow - 1);
    if (this.slow < 24) return;
    this.slow = 0;
    this.quality++;
    this.applySize();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    disposeTree(this.scene);
    for (const c of this.consoles) {
      c.identity.texture.dispose();
      c.status.texture.dispose();
    }
    for (const x of Object.values(this.kit)) x.dispose();
    this.scanMaterial.dispose();
    this.wallTexture.dispose();
    this.wallLayer.canvas = null;
    this.pictures.clear();
    this.scene.clear();
    this.renderer.dispose();
    // The context itself goes too: a page may hold only a few, and the game's map and cameras need theirs.
    this.renderer.forceContextLoss();
  }
}

/**
 * Builds the room on `canvas` once the game's fonts are there (the screens' words are painted with them). Throws when
 * the browser cannot give a graphics context: the stage then keeps its still picture.
 */
export async function openRoom(canvas: HTMLCanvasElement, options: OpenRoomOptions): Promise<RoomHandle> {
  await fontsReady();
  return new Room(canvas, options);
}
