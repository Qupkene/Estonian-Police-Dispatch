/**
 * People for the camera picture, as real bodies: one human base mesh with a skeleton (src/cctv/assets/human.glb,
 * "Male Base Mesh" by orange-juice-games, CC0) that every figure is cut from. A figure's `Look` dresses it: the body
 * is padded where clothes are (a jacket, a winter coat, a belly), its proportions shift (a woman's shoulders and
 * hips, a child's size), hair, a cap's peak, a hood or a rucksack are added as small pieces, and a small painting
 * of its own gives the colours (jacket and zip, trousers, skin, hair, a police vest with its bright bands and
 * "POLITSEI" on the back).
 *
 * A figure stands at its own origin facing +x; y is up; its left is -z. Poses (src/cctv/figure.ts) are given as the
 * joints' angles and applied to the skeleton here, whatever way its bones happen to lie.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Euler,
  Group,
  LinearFilter,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Bone,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { Look, Pose } from '../figure';
import { clamp, hash01, rand, smooth, type V2 } from '../math';
import humanUrl from '../assets/human.glb?url';

/** Parts of the body, by the bone a vertex mostly follows. */
const TORSO = 0;
const HEAD = 1;
const ARM_L = 2;
const ARM_R = 3;
const HAND_L = 4;
const HAND_R = 5;
const LEG_L = 6;
const LEG_R = 7;
const FOOT_L = 8;
const FOOT_R = 9;

function partOf(bone: string): number {
  if (bone === 'spine004' || bone === 'spine005') return HEAD;
  if (bone.startsWith('upper_arm') || bone.startsWith('forearm')) return bone.endsWith('L') ? ARM_L : ARM_R;
  if (bone.startsWith('hand') || bone.startsWith('f_') || bone.startsWith('thumb')) return bone.endsWith('L') ? HAND_L : HAND_R;
  if (bone.startsWith('thigh') || bone.startsWith('shin')) return bone.endsWith('L') ? LEG_L : LEG_R;
  if (bone.startsWith('foot') || bone.startsWith('toe') || bone.startsWith('heel')) return bone.endsWith('L') ? FOOT_L : FOOT_R;
  return TORSO;
}

/** The base body, read once: its surface in the pose it was modelled in, and what every vertex belongs to. */
export interface HumanBase {
  /** The loaded model: its skeleton and one skinned mesh, cloned for every figure. */
  template: Object3D;
  count: number;
  pos: Float32Array;
  index: ArrayLike<number>;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  part: Uint8Array;
  /** Height above the soles as a share of the body's height, 0..1. */
  v: Float32Array;
  /**
   * Painting coordinates of a vertex (see `paint`) as part of a given body part: a triangle is painted as one part,
   * also where its corners belong to two (the shoulder seam, the wrist).
   */
  uvAs: (part: number, vertex: number) => V2;
  feet: number;
  top: number;
  /** Bones by name: where their joints are in the modelled pose, and how they are turned. */
  joint: Map<string, Vector3>;
  bindQ: Map<string, Quaternion>;
  boneIndex: Map<string, number>;
  /** The turn that brings each arm from the modelled pose (held out) to hanging by the side. */
  armDown: { L: Quaternion; R: Quaternion };
}

let basePromise: Promise<HumanBase> | null = null;

/** Load the base body (once per page). */
export function loadHumanBase(): Promise<HumanBase> {
  return (basePromise ??= new GLTFLoader().loadAsync(humanUrl).then(readBase, (err: unknown) => {
    basePromise = null;
    throw err;
  }));
}

// ── The painting: one small picture per figure ──
// Left: the trunk and the head unrolled (round the body left to right, up the body bottom to top). Right: one arm
// (shoulder at the top) and one leg (hip at the top), each unrolled the same way, with the hand and the foot under
// them. Far right: plain colours for the added pieces.
const SHEET = 256;
const BODY_W = 160;
const BODY_WRAP = 40;
const LIMB_X = 204;
const LIMB_W = 36;
const LIMB_WRAP = 10;
const ARM_H = 112;
const HAND_Y = 114;
const LEG_Y = 130;
const LEG_H = 108;
const FOOT_Y = 240;
const SWATCH_X = 251;
/** The trunk's part of the painting starts at this share of the body's height (just under the hips). */
const BODY_V0 = 0.42;

const SW_HAIR = 0;
const SW_HAT = 1;
const SW_BAG = 2;
const SW_KIT = 3;
const swatch = (i: number): V2 => [(SWATCH_X + 2.5) / SHEET, 1 - (i * 8 + 4) / SHEET];

function readBase(gltf: { scene: Object3D }): HumanBase {
  let mesh: SkinnedMesh | null = null;
  gltf.scene.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) mesh = o as SkinnedMesh;
  });
  if (!mesh) throw new Error('human.glb: no skinned mesh');
  const m = mesh as SkinnedMesh;
  gltf.scene.updateMatrixWorld(true);
  const g = m.geometry;
  const posA = g.getAttribute('position');
  const count = posA.count;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = posA.getX(i);
    pos[i * 3 + 1] = posA.getY(i);
    pos[i * 3 + 2] = posA.getZ(i);
  }
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const bones = m.skeleton.bones;
  const part = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    let best = 0;
    let bestW = -1;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      skinIndex[i * 4 + k] = si.getComponent(i, k);
      skinWeight[i * 4 + k] = w;
      if (w > bestW) {
        bestW = w;
        best = si.getComponent(i, k);
      }
    }
    part[i] = partOf(bones[best].name);
  }
  const index = g.index ? Array.from(g.index.array as ArrayLike<number>) : Array.from({ length: count }, (_, i) => i);
  // Joints in the modelled pose (the skeleton's bind matrices, in the mesh's own space).
  const joint = new Map<string, Vector3>();
  const bindQ = new Map<string, Quaternion>();
  const boneIndex = new Map<string, number>();
  const tmp = new Matrix4();
  const scl = new Vector3();
  bones.forEach((b, i) => {
    tmp.copy(m.skeleton.boneInverses[i]).invert();
    const p = new Vector3();
    const q = new Quaternion();
    tmp.decompose(p, q, scl);
    joint.set(b.name, p);
    bindQ.set(b.name, q);
    boneIndex.set(b.name, i);
  });
  let feet = Infinity;
  let top = -Infinity;
  for (let i = 0; i < count; i++) {
    feet = Math.min(feet, pos[i * 3 + 1]);
    top = Math.max(top, pos[i * 3 + 1]);
  }
  const v = new Float32Array(count);
  for (let i = 0; i < count; i++) v[i] = (pos[i * 3 + 1] - feet) / (top - feet);

  // Painting coordinates: round the body's own axis for trunk and head, round each limb's line for arms and legs.
  const down = new Vector3(0, -1, 0);
  const limb = (a: string, b: string) => {
    const s = joint.get(a)!;
    const e = joint.get(b)!;
    const axis = e.clone().sub(s);
    const len = axis.length();
    axis.normalize();
    // Forwards, squared to the limb: where the painting's middle column lies.
    const e1 = new Vector3(1, 0, 0).addScaledVector(axis, -axis.x).normalize();
    const e2 = axis.clone().cross(e1);
    return { s, axis, len, e1, e2 };
  };
  const limbs: Record<number, ReturnType<typeof limb>> = {
    [ARM_L]: limb('upper_armL', 'handL'),
    [ARM_R]: limb('upper_armR', 'handR'),
    [LEG_L]: limb('thighL', 'footL'),
    [LEG_R]: limb('thighR', 'footR'),
  };
  const p = new Vector3();
  const uvAs = (k: number, i: number): V2 => {
    p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    let x: number;
    let y: number;
    if (k === TORSO || k === HEAD) {
      // Front in the middle of the strip, the back at both ends.
      const u = Math.atan2(p.z, p.x - 0.01) / (2 * Math.PI) + 0.5;
      x = u * BODY_W;
      y = (1 - clamp((v[i] - BODY_V0) / (1 - BODY_V0), 0, 1)) * (SHEET - 1);
    } else if (k === HAND_L || k === HAND_R) {
      x = LIMB_X + LIMB_W / 2;
      y = HAND_Y + 6;
    } else if (k === FOOT_L || k === FOOT_R) {
      x = LIMB_X + LIMB_W / 2;
      // The sole is the bottom of the foot's strip.
      y = FOOT_Y + 2 + clamp(1 - (p.y - feet) / 0.09, 0, 1) * 11;
    } else {
      const l = limbs[k];
      const d = p.clone().sub(l.s);
      const t = clamp(d.dot(l.axis) / l.len, 0, 1);
      d.addScaledVector(l.axis, -d.dot(l.axis));
      let u = Math.atan2(d.dot(l.e2), d.dot(l.e1)) / (2 * Math.PI) + 0.5;
      // The right limb is painted as the left one's mirror, so the outside of both is the same column.
      if (k === ARM_R || k === LEG_R) u = 1 - u;
      x = LIMB_X + u * LIMB_W;
      y = k === ARM_L || k === ARM_R ? t * ARM_H : LEG_Y + t * LEG_H;
    }
    return [x / SHEET, 1 - y / SHEET];
  };
  void down;

  const armDown = (side: 'L' | 'R') => {
    const dir = joint.get(`hand${side}`)!.clone().sub(joint.get(`upper_arm${side}`)!).normalize();
    return new Quaternion().setFromUnitVectors(dir, new Vector3(0.02, -1, side === 'L' ? -0.05 : 0.05).normalize());
  };
  return { template: gltf.scene, count, pos, index, skinIndex, skinWeight, part, v, uvAs, feet, top, joint, bindQ, boneIndex, armDown: { L: armDown('L'), R: armDown('R') } };
}

const css = (hex: number, k = 1) => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return `rgb(${r},${g},${b})`;
};

/** Paint a figure's clothes, skin and hair. */
function paint(look: Look, seed: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = SHEET;
  c.height = SHEET;
  const g = c.getContext('2d')!;
  const r = rand(seed);
  g.fillStyle = css(look.top);
  g.fillRect(0, 0, SHEET, SHEET);
  const police = look.dress === 'police';
  const medic = look.dress === 'medic';
  const rescue = look.dress === 'rescue';
  const guard = look.dress === 'guard';
  const uniform = police ? 0x141c2c : look.top;
  const silver = '#e9eef2';

  // ── Trunk and head. u: 0 the back, 0.5 the front, 1 the back again. v: share of the body's height. ──
  const by = (v: number) => (1 - (v - BODY_V0) / (1 - BODY_V0)) * (SHEET - 1);
  /** A patch on the trunk, drawn again a turn further so the strip can be read past its end. */
  const body = (u0: number, u1: number, v0: number, v1: number, fill: string) => {
    g.fillStyle = fill;
    for (const shift of [-1, 0, 1]) {
      const x0 = (u0 + shift) * BODY_W;
      const x1 = (u1 + shift) * BODY_W;
      if (x1 < 0 || x0 > BODY_W + BODY_WRAP) continue;
      const a = Math.max(0, x0);
      const b = Math.min(BODY_W + BODY_WRAP, x1);
      g.fillRect(a, by(v1), b - a, by(v0) - by(v1));
    }
  };
  const hem = look.coat ? BODY_V0 : 0.5 + (r() - 0.5) * 0.02;
  body(0, 1, BODY_V0 - 0.03, hem, css(look.legs));
  body(0, 1, hem, 0.87, css(uniform));
  // The hem's shadow, and a fold of shade under the arms.
  body(0, 1, hem - 0.008, hem + 0.004, css(uniform, 0.55));
  body(0.2, 0.3, 0.6, 0.78, css(uniform, 0.86));
  body(0.7, 0.8, 0.6, 0.78, css(uniform, 0.86));
  if (police || medic || rescue) {
    if (police) {
      // The yellow-green vest over the dark uniform, the belt under it.
      body(0, 1, 0.575, 0.845, css(look.top));
      body(0, 1, 0.535, 0.562, '#0c0d10');
    }
    for (const v of rescue ? [0.58, 0.64] : [0.615, 0.7]) body(0, 1, v, v + 0.02, silver);
    // Bands over the shoulders, front and back.
    for (const u of [0.41, 0.59, 0.09, 0.91]) body(u - 0.016, u + 0.016, 0.7, 0.86, silver);
    // The name on the back and on the chest.
    const label = police ? '#16306e' : medic ? '#8e1a16' : '#1c1d22';
    body(-0.11, 0.11, 0.735, 0.8, label);
    body(0.53, 0.63, 0.755, 0.79, label);
    g.fillStyle = '#ffffff';
    g.font = '700 9px Arial, Helvetica, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const word = police ? 'POLITSEI' : medic ? 'KIIRABI' : 'PÄÄSTE';
    for (const x of [0, BODY_W]) g.fillText(word, x, by(0.7675), 34);
  } else if (guard) {
    body(-0.1, 0.1, 0.74, 0.79, '#e9e9e6');
  } else {
    // A zip or a row of buttons down the front, pockets, a waistband.
    const closing = css(look.top, 0.5);
    if (!look.bare || r.chance(0.3)) body(0.495, 0.505, hem, 0.845, closing);
    if (r.chance(0.6)) {
      body(0.34, 0.42, 0.545, 0.575, closing);
      body(0.58, 0.66, 0.545, 0.575, closing);
    }
    if (r.chance(0.35)) body(0, 1, hem, hem + 0.03, css(look.top, 0.7));
    // A print or a lighter panel on a summer top.
    if (look.bare && r.chance(0.5)) body(0.4, 0.6, 0.68, 0.77, css(look.top, 1.25));
  }
  // Neck and head (chin at 0.883 of the body's height, eyes at 0.944, hairline at 0.965): skin, then hair or a hat.
  const skin = css(look.skin);
  body(0, 1, look.coat || police || medic || rescue ? 0.868 : 0.852, 1.01, skin);
  body(0.44, 0.475, 0.938, 0.948, css(look.skin, 0.5));
  body(0.525, 0.56, 0.938, 0.948, css(look.skin, 0.5));
  body(0.47, 0.53, 0.901, 0.908, css(look.skin, 0.68));
  body(0.4, 0.6, 0.952, 0.958, css(look.skin, 0.8));
  if (look.hair !== null) {
    const hair = css(look.hair);
    body(-0.3, 0.3, look.longHair ? 0.86 : 0.912, 1.01, hair);
    body(0, 1, 0.966, 1.01, hair);
    body(0.3, 0.37, 0.94, 1.01, hair);
    body(0.63, 0.7, 0.94, 1.01, hair);
  }
  if (look.hat !== null) {
    const hat = css(look.hat);
    body(0, 1, 0.956, 1.01, hat);
    body(-0.33, 0.33, 0.93, 1.01, hat);
    body(0, 1, 0.956, 0.964, css(look.hat, 0.7));
  }

  // ── One arm: shoulder at the top, wrist at the bottom. Columns: 0.25 the outside, 0.5 the front. ──
  const limbRect = (y0: number, h: number, u0: number, u1: number, t0: number, t1: number, fill: string) => {
    g.fillStyle = fill;
    for (const shift of [-1, 0, 1]) {
      const x0 = LIMB_X + (u0 + shift) * LIMB_W;
      const x1 = LIMB_X + (u1 + shift) * LIMB_W;
      const a = Math.max(LIMB_X, x0);
      const b = Math.min(LIMB_X + LIMB_W + LIMB_WRAP, x1);
      if (b > a) g.fillRect(a, y0 + t0 * h, b - a, (t1 - t0) * h);
    }
  };
  const arm = (u0: number, u1: number, t0: number, t1: number, fill: string) => limbRect(0, ARM_H, u0, u1, t0, t1, fill);
  const sleeve = police ? 0x141c2c : look.top;
  arm(0, 1, 0, 1.01, css(sleeve));
  if (look.bare) arm(0, 1, r.range(0.28, 0.42), 1.01, skin);
  else arm(0, 1, 0.955, 1.01, css(sleeve, 0.6));
  if (medic || rescue) arm(0, 1, 0.7, 0.76, silver);
  if (police) arm(0.1, 0.4, 0.1, 0.2, '#16306e');
  // Shade on the inside of the arm.
  arm(0.62, 0.88, 0, 1, look.bare ? css(look.skin, 0.88) : css(sleeve, 0.85));
  const stripes = look.dress === 'civil' && !look.coat && r.chance(0.16);
  if (stripes) for (const u of [0.21, 0.25, 0.29]) arm(u - 0.012, u + 0.012, 0, look.bare ? 0.3 : 0.95, '#f0f0ee');
  // The hand: skin, or a glove in the cold.
  const glove = !look.bare && look.hat !== null && r.chance(0.55);
  g.fillStyle = glove ? '#17181b' : skin;
  g.fillRect(LIMB_X, HAND_Y - 2, LIMB_W + LIMB_WRAP, 16);

  // ── One leg: hip at the top, ankle at the bottom. ──
  const leg = (u0: number, u1: number, t0: number, t1: number, fill: string) => limbRect(LEG_Y, LEG_H, u0, u1, t0, t1, fill);
  leg(0, 1, 0, 1.01, css(look.legs));
  if (look.coat) leg(0, 1, 0, r.range(0.2, 0.34), css(look.top));
  if (look.bare && !police) leg(0, 1, r.range(0.4, 0.55), 1.01, skin);
  leg(0.62, 0.88, 0, 1, css(look.bare ? look.legs : look.legs, 0.84));
  if (stripes) for (const u of [0.21, 0.25, 0.29]) leg(u - 0.012, u + 0.012, 0, 1, '#f0f0ee');
  if (medic || rescue) leg(0, 1, 0.78, 0.84, silver);
  // The shoe, its sole darker.
  g.fillStyle = css(look.shoes);
  g.fillRect(LIMB_X, FOOT_Y - 2, LIMB_W + LIMB_WRAP, 18);
  g.fillStyle = css(look.shoes, 0.5);
  g.fillRect(LIMB_X, FOOT_Y + 10, LIMB_W + LIMB_WRAP, 8);

  // ── Plain colours for the added pieces. ──
  const sw = (i: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(SWATCH_X - 1, i * 8, 6, 8);
  };
  sw(SW_HAIR, css(look.hair ?? look.skin));
  sw(SW_HAT, css(look.hat ?? look.top));
  sw(SW_BAG, css([0x1d1f24, 0x3a3a3c, 0x5a1f24, 0x27405a, 0x4a4438][seed % 5]));
  sw(SW_KIT, '#0c0d10');

  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/** An extra piece that follows one bone: an ellipsoid or a box, in one plain colour. */
interface Piece {
  bone: string;
  /** Centre and half-sizes in the body's own space (x forwards, y up). */
  c: [number, number, number];
  r: [number, number, number];
  kind: 'ball' | 'box';
  swatch: number;
}

const BALL: [number, number, number][] = [];
const BALL_TRIS: number[] = [];
{
  // A coarse sphere: 6 rings of 8.
  const rings = 6;
  const seg = 8;
  for (let i = 0; i <= rings; i++) {
    const a = (i / rings) * Math.PI;
    for (let k = 0; k < seg; k++) {
      const b = (k / seg) * Math.PI * 2;
      BALL.push([Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)]);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k;
      const b = i * seg + ((k + 1) % seg);
      BALL_TRIS.push(a, b, a + seg, b, b + seg, a + seg);
    }
  }
}
const BOX: [number, number, number][] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];
const BOX_TRIS = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3];

/** Build one figure's surface: the base body padded and reshaped for its look, with the added pieces. */
function dress(base: HumanBase, look: Look, seed: number): BufferGeometry {
  const n = base.count;
  const H = base.top - base.feet;
  const pos = new Float32Array(base.pos);
  // Smooth normals of the base surface (vertices at the same place share one).
  const normal = smoothNormals(pos, base.index, n);
  const heavy = clamp((look.build - 1) / 0.26, 0, 1.3);
  const slim = clamp((1 - look.build) / 0.14, 0, 1);
  const police = look.dress === 'police';
  const uniformed = look.dress !== 'civil';
  // How thick the clothes are over the trunk and arms, and over the legs.
  const jacket = (look.bare ? 0.006 : look.coat ? 0.034 : 0.022) + (uniformed ? 0.012 : 0) + heavy * 0.02 - slim * 0.006;
  const trousers = 0.011 + heavy * 0.012 - slim * 0.004;
  const hem = look.coat ? 0.36 : 0.5;
  const bump = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));
  for (let i = 0; i < n; i++) {
    const k = base.part[i];
    const v = base.v[i];
    const x = pos[i * 3];
    let pad = 0;
    if (k === TORSO) {
      pad = v > hem ? jacket : trousers;
      // A jacket hangs a little loose at its hem and is full at the chest.
      if (v > hem && v < hem + 0.06) pad += 0.012;
      // A belly, and a woman's chest: only the front.
      if (x > 0) pad += heavy * 0.06 * bump(v, 0.6, 0.07) + (look.female ? 0.022 * bump(v, 0.735, 0.03) : 0);
      // The collar stands off the neck.
      if (v > 0.85) pad += look.bare ? 0 : 0.012;
      if (police && v > 0.575 && v < 0.845) pad += 0.008;
    } else if (k === ARM_L || k === ARM_R) pad = look.bare ? 0.004 + heavy * 0.008 : jacket * 0.85;
    else if (k === LEG_L || k === LEG_R) pad = v > hem ? jacket : trousers + (v < 0.12 ? 0.008 : 0);
    else if (k === FOOT_L || k === FOOT_R) pad = 0.014;
    else if (k === HEAD) {
      // Hair and hats sit on the skull; a neck in a collar is thicker.
      if (v > 0.955 && (look.hair !== null || look.hat !== null)) pad = look.hat !== null ? 0.02 : 0.011;
      else if (v < 0.872 && !look.bare) pad = 0.012;
    }
    if (pad) {
      pos[i * 3] += normal[i * 3] * pad;
      pos[i * 3 + 1] += normal[i * 3 + 1] * pad * (k === FOOT_L || k === FOOT_R ? 0.3 : 1);
      pos[i * 3 + 2] += normal[i * 3 + 2] * pad;
    }
    // A woman's trunk: narrower at the waist, wider at the hips.
    if (look.female && k === TORSO) pos[i * 3 + 2] *= 1 - 0.1 * bump(v, 0.62, 0.05) + 0.07 * bump(v, 0.52, 0.04);
    // Never under the ground.
    if (pos[i * 3 + 1] < base.feet) pos[i * 3 + 1] = base.feet;
  }
  const padded = smoothNormals(pos, base.index, n);

  // The added pieces, each bound to one bone.
  const head = base.joint.get('spine005')!;
  const top = base.top;
  const pieces: Piece[] = [];
  const r = rand(seed ^ 0x7f4a7c15);
  if (look.longHair && look.hair !== null) {
    // Long hair: down the back of the head to the shoulders; now and then tied back.
    const low = look.hat !== null ? 0.03 : 0;
    pieces.push({ bone: 'spine005', c: [head.x - 0.035, top - 0.175 - low, 0], r: [0.085, 0.16, 0.108], kind: 'ball', swatch: SW_HAIR });
    if (r.chance(0.35)) pieces.push({ bone: 'spine005', c: [head.x - 0.12, top - 0.15, 0], r: [0.045, 0.1, 0.04], kind: 'ball', swatch: SW_HAIR });
  }
  // A cap's peak for the police and for some others; a woolly hat has none.
  if (look.hat !== null && (police || look.dress === 'guard' || r.chance(0.3)))
    pieces.push({ bone: 'spine005', c: [head.x + 0.135, top - 0.052, 0], r: [0.05, 0.008, 0.075], kind: 'box', swatch: SW_HAT });
  const chest = base.joint.get('spine003')!;
  if (look.dress === 'civil' && r.chance(0.2)) pieces.push({ bone: 'spine003', c: [chest.x - 0.17 - jacket, chest.y + 0.02, 0], r: [0.07, 0.17, 0.13], kind: 'box', swatch: SW_BAG });
  if (police) {
    // What hangs on a police belt and vest: holster, pouches, the radio on the shoulder.
    const hip = base.joint.get('spine')!;
    pieces.push({ bone: 'spine', c: [hip.x + 0.01, hip.y + 0.045, 0.2 + jacket], r: [0.06, 0.07, 0.035], kind: 'box', swatch: SW_KIT });
    pieces.push({ bone: 'spine', c: [hip.x + 0.02, hip.y + 0.05, -0.2 - jacket], r: [0.05, 0.05, 0.03], kind: 'box', swatch: SW_KIT });
    pieces.push({ bone: 'spine003', c: [chest.x + 0.1 + jacket, chest.y + 0.09, -0.11], r: [0.025, 0.045, 0.03], kind: 'box', swatch: SW_KIT });
  }

  // Write it out triangle by triangle, so that a triangle across the painting's seam can be moved past the end.
  const tris = base.index.length / 3;
  let extra = 0;
  for (const p of pieces) extra += (p.kind === 'ball' ? BALL_TRIS.length : BOX_TRIS.length) / 3;
  const total = (tris + extra) * 3;
  const P = new Float32Array(total * 3);
  const N = new Float32Array(total * 3);
  const UV = new Float32Array(total * 2);
  const SI = new Uint16Array(total * 4);
  const SW = new Float32Array(total * 4);
  let o = 0;
  const bodyEnd = BODY_W / SHEET;
  /** Which part a triangle is painted as: the trunk before a limb, a limb before its hand or foot. */
  const rank = (k: number) => (k === TORSO || k === HEAD ? 0 : k === HAND_L || k === HAND_R || k === FOOT_L || k === FOOT_R ? 2 : 1);
  for (let t = 0; t < tris; t++) {
    const corners = [base.index[t * 3], base.index[t * 3 + 1], base.index[t * 3 + 2]];
    let k = base.part[corners[0]];
    for (const iv of corners) if (rank(base.part[iv]) < rank(k)) k = base.part[iv];
    const uvs = corners.map((iv) => base.uvAs(k, iv));
    const us = uvs.map((q) => q[0]);
    // Unrolled strips: a triangle with corners at both ends of its strip is moved to the far end's copy.
    const trunk = k === TORSO || k === HEAD;
    const limbStrip = k === ARM_L || k === ARM_R || k === LEG_L || k === LEG_R;
    const span = trunk ? bodyEnd : LIMB_W / SHEET;
    const start = trunk ? 0 : LIMB_X / SHEET;
    if ((trunk || limbStrip) && Math.max(...us) - Math.min(...us) > span / 2) {
      for (let c = 0; c < 3; c++) if (us[c] - start < span / 2) us[c] += span;
    }
    corners.forEach((iv, c) => {
      P.set([pos[iv * 3], pos[iv * 3 + 1], pos[iv * 3 + 2]], o * 3);
      N.set([padded[iv * 3], padded[iv * 3 + 1], padded[iv * 3 + 2]], o * 3);
      UV[o * 2] = us[c];
      UV[o * 2 + 1] = uvs[c][1];
      for (let q = 0; q < 4; q++) {
        SI[o * 4 + q] = base.skinIndex[iv * 4 + q];
        SW[o * 4 + q] = base.skinWeight[iv * 4 + q];
      }
      o++;
    });
  }
  for (const piece of pieces) {
    const verts = piece.kind === 'ball' ? BALL : BOX;
    const list = piece.kind === 'ball' ? BALL_TRIS : BOX_TRIS;
    const bone = base.boneIndex.get(piece.bone) ?? 0;
    const [su, sv] = swatch(piece.swatch);
    for (const iv of list) {
      const q = verts[iv];
      P.set([piece.c[0] + q[0] * piece.r[0], piece.c[1] + q[1] * piece.r[1], piece.c[2] + q[2] * piece.r[2]], o * 3);
      const l = Math.hypot(q[0] / piece.r[0], q[1] / piece.r[1], q[2] / piece.r[2]) || 1;
      N.set([q[0] / piece.r[0] / l, q[1] / piece.r[1] / l, q[2] / piece.r[2] / l], o * 3);
      UV[o * 2] = su;
      UV[o * 2 + 1] = sv;
      SI[o * 4] = bone;
      SW[o * 4] = 1;
      o++;
    }
  }
  void H;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(P, 3));
  g.setAttribute('normal', new BufferAttribute(N, 3));
  g.setAttribute('uv', new BufferAttribute(UV, 2));
  g.setAttribute('skinIndex', new BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new BufferAttribute(SW, 4));
  return g;
}

/** A normal per vertex, averaged over every vertex at the same place (the mesh is cut along its seams). */
function smoothNormals(pos: Float32Array, index: ArrayLike<number>, n: number): Float32Array {
  const key = new Map<string, number>();
  const group = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 2000)},${Math.round(pos[i * 3 + 1] * 2000)},${Math.round(pos[i * 3 + 2] * 2000)}`;
    let gi = key.get(k);
    if (gi === undefined) {
      gi = key.size;
      key.set(k, gi);
    }
    group[i] = gi;
  }
  const acc = new Float32Array(key.size * 3);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3;
    const b = index[t + 1] * 3;
    const c = index[t + 2] * 3;
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const i of [index[t], index[t + 1], index[t + 2]]) {
      acc[group[i] * 3] += nx;
      acc[group[i] * 3 + 1] += ny;
      acc[group[i] * 3 + 2] += nz;
    }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const gI = group[i] * 3;
    const l = Math.hypot(acc[gI], acc[gI + 1], acc[gI + 2]) || 1;
    out[i * 3] = acc[gI] / l;
    out[i * 3 + 1] = acc[gI + 1] / l;
    out[i * 3 + 2] = acc[gI + 2] / l;
  }
  return out;
}

const e = new Euler();
const turn = (x: number, y: number, z: number) => new Quaternion().setFromEuler(e.set(x, y, z, 'XYZ'));

export class HumanMesh {
  readonly group = new Group();
  private root: Object3D;
  private mesh: SkinnedMesh;
  private bones = new Map<string, Bone>();
  private texture: CanvasTexture;
  private material: MeshLambertMaterial;
  private scale: number;
  private armInv = new Quaternion();
  private armMatInv = new Matrix4();
  private leg: number;
  private hipX: number;
  /** World turn (in the body's own space) of each bone this frame. */
  private world = new Map<string, Quaternion>();

  constructor(
    look: Look,
    seed: number,
    private readonly base: HumanBase,
  ) {
    this.root = cloneSkinned(base.template);
    let mesh: SkinnedMesh | null = null;
    this.root.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) mesh = o as SkinnedMesh;
      if ((o as Bone).isBone) this.bones.set(o.name, o as Bone);
    });
    this.mesh = mesh as unknown as SkinnedMesh;
    this.mesh.geometry = dress(base, look, seed);
    this.texture = paint(look, seed);
    this.material = new MeshLambertMaterial({ map: this.texture });
    if (look.bands) {
      // Bright bands answer the lamps: the painting also glows a little where it is bright.
      this.material.emissiveMap = this.texture;
      this.material.emissive.setHex(0xffffff);
      this.material.emissiveIntensity = 0;
    }
    this.mesh.material = this.material;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    const height = base.top - base.feet;
    this.scale = look.height / height;
    this.leg = base.joint.get('spine')!.y - base.feet;
    this.hipX = base.joint.get('spine')!.x;
    // The model's soles on the ground, at the figure's size.
    this.root.position.y = -base.feet;
    this.group.add(this.root);
    // Proportions: a woman's shoulders are narrower and her hips a little wider; a child has a bigger head.
    const move = (name: string, k: number) => {
      const b = this.bones.get(name);
      if (b) b.position.multiplyScalar(k);
    };
    if (look.female) {
      move('upper_armL', 0.84);
      move('upper_armR', 0.84);
    }
    if (look.height < 1.5) this.bones.get('spine005')?.scale.setScalar(1.22);
    const arm = this.bones.get('spine')!.parent!;
    this.root.updateMatrixWorld(true);
    // The armature's own turn inside the model (the root bone is set against it).
    const q = new Quaternion();
    arm.getWorldQuaternion(q);
    const rq = new Quaternion();
    this.root.getWorldQuaternion(rq);
    this.armInv.copy(rq.invert().multiply(q)).invert();
    this.armMatInv.copy(this.root.matrixWorld).invert().multiply(arm.matrixWorld).invert();
  }

  /** How strongly the bright bands shine (0 by day). */
  setGlow(k: number) {
    if (this.material.emissiveMap) this.material.emissiveIntensity = 0.5 * k;
  }

  private set(name: string, d: Quaternion, fix?: Quaternion) {
    const b = this.bones.get(name);
    const bind = this.base.bindQ.get(name);
    if (!b || !bind) return;
    // Where the bone points now: the pose's turn, over the turn that brings an arm to the side, over the modelled pose.
    const w = d.clone();
    if (fix) w.multiply(fix);
    w.multiply(bind);
    this.world.set(name, w);
    const parent = b.parent as Bone | null;
    const pw = parent && this.world.get(parent.name);
    if (pw) b.quaternion.copy(pw).invert().multiply(w);
    else b.quaternion.copy(this.armInv).multiply(w);
  }

  /** A bone that only follows its parent: note where it points, for its own children. */
  private follow(name: string, parentTurn: Quaternion) {
    const bind = this.base.bindQ.get(name);
    if (bind) this.world.set(name, parentTurn.clone().multiply(bind));
  }

  /** Stand the figure at a scene position, facing `yaw`, in a pose. `shrink` makes it smaller (going in at a door). */
  update(pos: V2, yaw: number, pose: Pose, shrink = 1) {
    this.group.position.set(pos[0], 0, -pos[1]);
    this.group.rotation.y = yaw;
    this.group.scale.setScalar(this.scale * shrink);
    this.world.clear();
    const base = this.base;
    const hips = turn(pose.roll, 0, -pose.lean);
    const part = turn(0, pose.twist / 3, -pose.bend / 3);
    const s1 = hips.clone().multiply(part);
    const s2 = s1.clone().multiply(part);
    const chest = s2.clone().multiply(part);
    const half = turn(0, pose.headYaw / 2, -pose.headPitch / 2);
    const neck = chest.clone().multiply(half);
    const head = neck.clone().multiply(half);
    this.set('spine', hips);
    this.set('spine001', s1);
    this.set('spine002', s2);
    this.set('spine003', chest);
    this.set('spine004', neck);
    this.set('spine005', head);
    for (const side of ['L', 'R'] as const) {
      const sgn = side === 'L' ? -1 : 1;
      const a = side === 'L' ? pose.armL : pose.armR;
      const l = side === 'L' ? pose.legL : pose.legR;
      this.follow(`shoulder${side}`, chest);
      const upper = chest.clone().multiply(turn(-sgn * a[1], 0, a[0]));
      const fore = upper.clone().multiply(turn(0, 0, a[2]));
      const fix = base.armDown[side];
      this.set(`upper_arm${side}`, upper, fix);
      this.set(`forearm${side}`, fore, fix);
      this.set(`hand${side}`, fore, fix);
      const thigh = hips.clone().multiply(turn(-sgn * l[1], 0, l[0]));
      const shin = thigh.clone().multiply(turn(0, 0, -l[2]));
      this.set(`thigh${side}`, thigh);
      this.set(`shin${side}`, shin);
      // On its feet, the sole stays near level whatever the shin does.
      const upright = pose.hip > 0.8 && Math.abs(pose.lean) < 0.6;
      const ankle = upright ? clamp(l[2] - l[0], -0.5, 0.9) * 0.75 : 0.5 * smooth((0.6 - pose.hip) * 2);
      this.set(`foot${side}`, shin.clone().multiply(turn(0, 0, ankle)));
    }
    // The hips: their height over the soles, in the model's own measure.
    const y = base.feet + Math.max(0.105, pose.hip * this.leg) + pose.lift / this.scale;
    const root = this.bones.get('spine')!;
    root.position.set(this.hipX, y, 0).applyMatrix4(this.armMatInv);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

/** A figure's own number from its look, for the small differences between two people dressed alike. */
export const seedOfLook = (id: string) => Math.floor(hash01('human', id) * 0x7fffffff);
