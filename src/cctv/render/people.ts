/**
 * People for the camera picture: a jointed mannequin of boxes, capsules and a sphere, dressed by its `Look` and
 * posed by a `Pose` (src/cctv/figure.ts). A figure stands at its own origin facing +x; y is up. At the camera's
 * resolution a person is a few dozen pixels tall, so the body's proportions and the way it moves carry it.
 */
import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry, type Material } from 'three';
import type { Look, Pose } from '../figure';
import type { V2 } from '../math';

const capsule = new CapsuleGeometry(1, 1, 2, 6);
const box = new BoxGeometry(1, 1, 1);
const ball = new SphereGeometry(1, 9, 7);

/** One material per colour (and per glow), shared by every figure of a view. */
export class Palette {
  private mats = new Map<string, MeshLambertMaterial>();

  get(hex: number, glow = 0): MeshLambertMaterial {
    const key = `${hex}:${glow}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new MeshLambertMaterial({ color: hex });
      // Reflective bands answer the lamps and the infrared light: a little light of their own stands in for that.
      if (glow > 0) {
        m.emissive.setHex(hex);
        m.emissiveIntensity = glow;
      }
      this.mats.set(key, m);
    }
    return m;
  }

  /** How strongly reflective bands shine (0 by day, more in the dark). */
  setGlow(k: number) {
    for (const [key, m] of this.mats) if (!key.endsWith(':0')) m.emissiveIntensity = Number(key.split(':')[1]) * k;
  }

  dispose() {
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}

/** A limb segment hanging down from its joint: a capsule of this length and thickness. */
function segment(length: number, radius: number, mat: Material): Mesh {
  const m = new Mesh(capsule, mat);
  const body = Math.max(0.01, length - 2 * radius);
  // The capsule geometry is 1 long between its caps and 1 in radius.
  m.scale.set(radius, body, radius);
  m.position.y = -length / 2;
  m.castShadow = true;
  return m;
}

interface LimbRig {
  root: Group;
  joint: Group;
}

export class FigureMesh {
  readonly group = new Group();
  private body = new Group();
  private spine = new Group();
  private head = new Group();
  private armL: LimbRig;
  private armR: LimbRig;
  private legL: LimbRig;
  private legR: LimbRig;
  private leg: number;

  constructor(look: Look, pal: Palette) {
    const h = look.height;
    const w = look.build;
    // Proportions of a standing adult.
    const leg = h * 0.47;
    const thigh = leg * 0.52;
    const shin = leg * 0.48;
    const torso = h * 0.3;
    const headR = h * 0.065;
    const shoulder = h * 0.118 * w * (look.female ? 0.93 : 1);
    const hipW = h * 0.085 * w;
    const upper = h * 0.165;
    const fore = h * 0.16;
    this.leg = leg;

    const skin = pal.get(look.skin);
    const top = pal.get(look.top, look.bands ? 0.5 : 0);
    const sleeves = look.dress === 'police' ? pal.get(0x141c2c) : look.bare ? skin : pal.get(look.top);
    const legs = pal.get(look.legs);
    const lower = look.bare && !look.female ? skin : legs;
    const shoes = pal.get(look.shoes);

    this.group.add(this.body);
    this.body.add(this.spine);

    // Hips, and a coat's skirt over them.
    const pelvis = new Mesh(box, look.coat ? pal.get(look.top) : legs);
    pelvis.scale.set(h * 0.1 * w, h * (look.coat ? 0.16 : 0.1), hipW * 2 + h * 0.05);
    pelvis.position.y = look.coat ? -h * 0.03 : h * 0.02;
    pelvis.castShadow = true;
    this.body.add(pelvis);

    const chest = new Mesh(box, top);
    chest.scale.set(h * 0.115 * w, torso, shoulder * 2);
    chest.position.y = h * 0.05 + torso / 2;
    chest.castShadow = true;
    this.spine.add(chest);
    if (look.bands) {
      // The bright bands of a vest: one round the chest, one round the waist.
      const band = pal.get(0xe8eef2, 0.9);
      for (const y of [0.3, 0.72]) {
        const b = new Mesh(box, band);
        b.scale.set(h * 0.12 * w, h * 0.022, shoulder * 2.02);
        b.position.y = h * 0.05 + torso * y;
        this.spine.add(b);
      }
    }

    this.head.position.y = h * 0.05 + torso + headR * 1.15;
    this.spine.add(this.head);
    const skull = new Mesh(ball, skin);
    skull.scale.set(headR * 0.95, headR * 1.12, headR * 0.9);
    skull.castShadow = true;
    this.head.add(skull);
    const coverColour = look.hat ?? look.hair;
    if (coverColour !== null) {
      // Hair or a hat: a cap over the top and the back of the head.
      const cap = new Mesh(ball, pal.get(coverColour));
      cap.scale.set(headR * 1.0, headR * (look.hat ? 0.8 : 0.9), headR * 0.98);
      cap.position.set(-headR * 0.14, headR * 0.42, 0);
      this.head.add(cap);
      if (look.longHair && look.hair !== null) {
        const fall = new Mesh(box, pal.get(look.hair));
        fall.scale.set(headR * 0.7, headR * 1.9, headR * 1.7);
        fall.position.set(-headR * 0.62, -headR * 0.75, 0);
        this.head.add(fall);
      }
    }

    const armR0 = h * 0.027 * w;
    const arm = (side: 1 | -1): LimbRig => {
      const root = new Group();
      root.position.set(0, h * 0.05 + torso * 0.93, side * (shoulder + armR0 * 0.6));
      this.spine.add(root);
      root.add(segment(upper, armR0, sleeves));
      const joint = new Group();
      joint.position.y = -upper;
      root.add(joint);
      joint.add(segment(fore, armR0 * 0.88, look.bare ? skin : sleeves));
      const hand = new Mesh(ball, skin);
      hand.scale.setScalar(armR0 * 1.15);
      hand.position.y = -fore;
      joint.add(hand);
      return { root, joint };
    };
    // The figure's left is -z.
    this.armL = arm(-1);
    this.armR = arm(1);

    const legR0 = h * 0.04 * w;
    const mkLeg = (side: 1 | -1): LimbRig => {
      const root = new Group();
      root.position.set(0, 0, side * hipW);
      this.body.add(root);
      root.add(segment(thigh, legR0, legs));
      const joint = new Group();
      joint.position.y = -thigh;
      root.add(joint);
      joint.add(segment(shin, legR0 * 0.82, lower));
      const foot = new Mesh(box, shoes);
      foot.scale.set(h * 0.13, h * 0.035, legR0 * 1.9);
      foot.position.set(h * 0.04, -shin + h * 0.012, 0);
      foot.castShadow = true;
      joint.add(foot);
      return { root, joint };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
  }

  /** Stand the figure at a scene position, facing `yaw`, in a pose. `scale` shrinks it (going in at a door). */
  update(pos: V2, yaw: number, pose: Pose, scale = 1) {
    this.group.position.set(pos[0], 0, -pos[1]);
    this.group.rotation.y = yaw;
    this.group.scale.setScalar(scale);
    // Hips: their height over the ground, and the whole body tipped about them.
    this.body.position.y = Math.max(0.1, pose.hip * this.leg) + pose.lift;
    this.body.rotation.set(pose.roll, 0, -pose.lean);
    this.spine.rotation.set(0, pose.twist, -pose.bend);
    this.head.rotation.set(0, pose.headYaw, -pose.headPitch);
    const limb = (rig: LimbRig, l: Pose['armL'], side: 1 | -1, elbow: boolean) => {
      rig.root.rotation.set(-side * l[1], 0, l[0]);
      rig.joint.rotation.z = elbow ? l[2] : -l[2];
    };
    limb(this.armL, pose.armL, -1, true);
    limb(this.armR, pose.armR, 1, true);
    limb(this.legL, pose.legL, -1, false);
    limb(this.legR, pose.legR, 1, false);
  }
}
