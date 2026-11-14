/**
 * A growing triangle mesh with a colour per vertex: the street's buildings, roads and ground are a handful of
 * these, each one draw call. Scene metres go in as (east, north) with a height; three.js gets x east, y up and
 * z south.
 */
import { BufferAttribute, BufferGeometry, Color, ShapeUtils, Vector2 } from 'three';
import { ringArea, type V2 } from '../math';

export type P3 = readonly [number, number, number];

/** A scene point at a height, as a three.js position. */
export const at = (p: V2, h: number): P3 => [p[0], h, -p[1]];

/** Where a baked part goes: turned about the vertical by a yaw, then moved. */
export interface Xf {
  c: number;
  s: number;
  x: number;
  y: number;
  z: number;
}

/** The transform that puts a part drawn about its own origin (x forwards, y up) at a scene point, facing `yaw`. */
export const xfAt = (p: V2, yaw: number, h = 0): Xf => ({ c: Math.cos(yaw), s: Math.sin(yaw), x: p[0], y: h, z: -p[1] });

const put = (p: P3, f?: Xf): P3 => (f ? [p[0] * f.c + p[2] * f.s + f.x, p[1] + f.y, -p[0] * f.s + p[2] * f.c + f.z] : p);
const turnDir = (p: P3, f?: Xf): P3 => (f ? [p[0] * f.c + p[2] * f.s, p[1], -p[0] * f.s + p[2] * f.c] : p);

const tmp = new Color();

/** The twelve corners and twenty faces of an icosahedron: a low-polygon ball (a tree's crown, a bush). */
const ICO_V: P3[] = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: P3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const l = Math.hypot(1, t);
  return raw.map((p) => [p[0] / l, p[1] / l, p[2] / l] as P3);
})();
const ICO_F = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
  3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
];

export class MeshBuilder {
  /** When set, every vertex gets its painting coordinates from where it lies on the ground: this many repeats a metre. */
  planar = 0;
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];

  get empty() {
    return this.idx.length === 0;
  }

  private vertex(p: P3, n: P3, c: Color, u = 0, v = 0): number {
    if (this.planar) {
      u = p[0] * this.planar;
      v = p[2] * this.planar;
    }
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  /** A triangle of a part, put in the scene by `f`. */
  triAt(a: P3, b: P3, c: P3, color: Color, f?: Xf) {
    this.tri(put(a, f), put(b, f), put(c, f), color);
  }

  /** A four-cornered flat face of a part, facing `towards` (in the part's own directions), put in the scene by `f`. */
  quadAt(a: P3, b: P3, c: P3, d: P3, color: Color, towards: P3, f?: Xf, uvs?: [V2, V2, V2, V2]) {
    this.quad(put(a, f), put(b, f), put(c, f), put(d, f), color, turnDir(towards, f), uvs);
  }

  /** A triangle facing the side its points run anticlockwise from. */
  tri(a: P3, b: P3, c: P3, color: Color, uvs?: [V2, V2, V2]) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const n: P3 = [nx, ny, nz];
    const i = this.vertex(a, n, color, uvs?.[0][0], uvs?.[0][1]);
    this.vertex(b, n, color, uvs?.[1][0], uvs?.[1][1]);
    this.vertex(c, n, color, uvs?.[2][0], uvs?.[2][1]);
    this.idx.push(i, i + 1, i + 2);
  }

  /** A four-cornered face a-b-c-d, turned so that it faces `towards` (a rough direction is enough). */
  quad(a: P3, b: P3, c: P3, d: P3, color: Color, towards: P3, uvs?: [V2, V2, V2, V2]) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const flip = nx * towards[0] + ny * towards[1] + nz * towards[2] < 0;
    const l = Math.hypot(nx, ny, nz) || 1;
    const s = flip ? -1 / l : 1 / l;
    const n: P3 = [nx * s, ny * s, nz * s];
    const i = this.vertex(a, n, color, uvs?.[0][0], uvs?.[0][1]);
    this.vertex(b, n, color, uvs?.[1][0], uvs?.[1][1]);
    this.vertex(c, n, color, uvs?.[2][0], uvs?.[2][1]);
    this.vertex(d, n, color, uvs?.[3][0], uvs?.[3][1]);
    if (flip) this.idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
    else this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** A four-cornered face with a normal given at every corner (a curved surface: a car's body). */
  smoothQuad(pts: readonly [P3, P3, P3, P3], normals: readonly [P3, P3, P3, P3], color: Color, f?: Xf) {
    const a = put(pts[0], f);
    const b = put(pts[1], f);
    const d = put(pts[3], f);
    const ns = normals.map((n) => turnDir(n, f));
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const mean = [ns[0][0] + ns[1][0] + ns[2][0] + ns[3][0], ns[0][1] + ns[1][1] + ns[2][1] + ns[3][1], ns[0][2] + ns[1][2] + ns[2][2] + ns[3][2]];
    const flip = nx * mean[0] + ny * mean[1] + nz * mean[2] < 0;
    const i = this.vertex(a, ns[0], color);
    this.vertex(b, ns[1], color);
    this.vertex(put(pts[2], f), ns[2], color);
    this.vertex(d, ns[3], color);
    if (flip) this.idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
    else this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** A flat polygon at height h, facing up. */
  flat(ring: readonly V2[], h: number, color: Color) {
    if (ring.length < 3) return;
    const ccw = ringArea(ring) > 0 ? ring : ring.slice().reverse();
    const contour = ccw.map((p) => new Vector2(p[0], p[1]));
    let faces: number[][];
    try {
      faces = ShapeUtils.triangulateShape(contour, []);
    } catch {
      return;
    }
    const up: P3 = [0, 1, 0];
    const base = this.pos.length / 3;
    for (const p of ccw) this.vertex(at(p, h), up, color);
    // The triangles come out anticlockwise seen from above (north up), which is the upward face in x/z too.
    for (const f of faces) this.idx.push(base + f[0], base + f[1], base + f[2]);
  }

  /** A box: centre of its base, length along `yaw`, width across, height. */
  box(c: V2, yaw: number, long: number, wide: number, h0: number, h1: number, color: Color) {
    const ux = (Math.cos(yaw) * long) / 2;
    const uy = (Math.sin(yaw) * long) / 2;
    const wx = (-Math.sin(yaw) * wide) / 2;
    const wy = (Math.cos(yaw) * wide) / 2;
    const k: V2[] = [
      [c[0] - ux - wx, c[1] - uy - wy],
      [c[0] + ux - wx, c[1] + uy - wy],
      [c[0] + ux + wx, c[1] + uy + wy],
      [c[0] - ux + wx, c[1] - uy + wy],
    ];
    for (let i = 0; i < 4; i++) {
      const a = k[i];
      const b = k[(i + 1) % 4];
      const out: P3 = [b[1] - a[1], 0, b[0] - a[0]];
      this.quad(at(a, h0), at(b, h0), at(b, h1), at(a, h1), color, out);
    }
    this.quad(at(k[0], h1), at(k[1], h1), at(k[2], h1), at(k[3], h1), color, [0, 1, 0]);
  }

  /**
   * A profile in the part's own x/y plane (x forwards, y up) pushed sideways from z0 to z1: a car's body, a wheel,
   * a roof slab. `f` puts the part in the scene.
   */
  prism(profile: readonly V2[], z0: number, z1: number, color: Color, f?: Xf) {
    if (profile.length < 3) return;
    const ring = ringArea(profile) > 0 ? profile : profile.slice().reverse();
    let faces: number[][];
    try {
      faces = ShapeUtils.triangulateShape(ring.map((p) => new Vector2(p[0], p[1])), []);
    } catch {
      return;
    }
    const lo = Math.min(z0, z1);
    const hi = Math.max(z0, z1);
    const a3 = (p: V2, z: number): P3 => put([p[0], p[1], z], f);
    for (const t of faces) {
      this.tri(a3(ring[t[0]], hi), a3(ring[t[1]], hi), a3(ring[t[2]], hi), color);
      this.tri(a3(ring[t[0]], lo), a3(ring[t[2]], lo), a3(ring[t[1]], lo), color);
    }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const out = turnDir([b[1] - a[1], a[0] - b[0], 0], f);
      this.quad(a3(a, lo), a3(b, lo), a3(b, hi), a3(a, hi), color, out);
    }
  }

  /**
   * A rough ball of flat faces: centre (three.js position), radii across and up, colour (its upper faces a little
   * lighter, as leaves in daylight are). `wobble` pushes each corner in or out by up to that share, by `seed`.
   */
  ball(c: P3, rx: number, ry: number, color: Color, seed = 0, wobble = 0.18) {
    const pts = ICO_V.map((p, i) => {
      const k = 1 + wobble * (Math.sin(seed * 12.9898 + i * 78.233) * 0.5);
      return [c[0] + p[0] * rx * k, c[1] + p[1] * ry * k, c[2] + p[2] * rx * k] as P3;
    });
    for (let i = 0; i < ICO_F.length; i += 3) {
      const a = pts[ICO_F[i]];
      const b = pts[ICO_F[i + 1]];
      const d = pts[ICO_F[i + 2]];
      const up = (ICO_V[ICO_F[i]][1] + ICO_V[ICO_F[i + 1]][1] + ICO_V[ICO_F[i + 2]][1]) / 3;
      const shadeK = 0.82 + 0.3 * up + 0.08 * Math.sin(seed + i);
      this.tri(a, b, d, new Color(color.r * shadeK, color.g * shadeK, color.b * shadeK));
    }
  }

  /** A cone of flat faces standing on its base: a spruce's tier. */
  cone(c: P3, radius: number, height: number, color: Color, sides = 7) {
    const tip: P3 = [c[0], c[1] + height, c[2]];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const k = 0.86 + 0.22 * Math.cos(a0 + 0.8);
      this.tri([c[0] + Math.cos(a1) * radius, c[1], c[2] + Math.sin(a1) * radius], [c[0] + Math.cos(a0) * radius, c[1], c[2] + Math.sin(a0) * radius], tip, new Color(color.r * k, color.g * k, color.b * k));
    }
  }

  /** A ribbon along a line, `wide` metres across, at height h. */
  ribbon(pts: readonly V2[], wide: number, h: number, color: Color, shift = 0) {
    if (pts.length < 2) return;
    const up: P3 = [0, 1, 0];
    const l: V2[] = [];
    const r: V2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0];
      let dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      // Left of the direction of travel.
      const nx = -dy;
      const ny = dx;
      l.push([pts[i][0] + nx * (shift + wide / 2), pts[i][1] + ny * (shift + wide / 2)]);
      r.push([pts[i][0] + nx * (shift - wide / 2), pts[i][1] + ny * (shift - wide / 2)]);
    }
    for (let i = 0; i < pts.length - 1; i++) this.quad(at(r[i], h), at(r[i + 1], h), at(l[i + 1], h), at(l[i], h), color, up);
  }

  /** How many triangles the mesh has so far. */
  get triangles() {
    return this.idx.length / 3;
  }

  /**
   * A four-cornered face a-b-c-d with one normal given for all of it, seen from both sides when `both` is set: a
   * card of leaves in a tree's crown, lit as a part of the whole crown and not by the way the card happens to lie.
   */
  card(a: P3, b: P3, c: P3, d: P3, normal: P3, color: Color, uvs: readonly [V2, V2, V2, V2], both = true) {
    const i = this.vertex(a, normal, color, uvs[0][0], uvs[0][1]);
    this.vertex(b, normal, color, uvs[1][0], uvs[1][1]);
    this.vertex(c, normal, color, uvs[2][0], uvs[2][1]);
    this.vertex(d, normal, color, uvs[3][0], uvs[3][1]);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    if (both) this.idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
  }

  /**
   * A round bar from one point to another (three.js positions), `r0` thick at its start and `r1` at its end: a
   * post, a tree's trunk or limb, a pipe. Its side is smooth; the ends are left open unless `cap` is set (the far end).
   */
  tube(p0: P3, p1: P3, r0: number, r1: number, color: Color, sides = 6, cap = false, color1: Color = color) {
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const az = p1[2] - p0[2];
    const al = Math.hypot(ax, ay, az) || 1;
    const dx = ax / al;
    const dy = ay / al;
    const dz = az / al;
    // Two directions square to the bar.
    let ux = dy * 0 - dz * 1;
    let uy = dz * 0 - dx * 0;
    let uz = dx * 1 - dy * 0;
    if (Math.abs(dy) > 0.9) {
      ux = 1;
      uy = 0;
      uz = 0;
      const k = ux * dx;
      ux -= dx * k;
      uy -= dy * k;
      uz -= dz * k;
    }
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const wx = dy * uz - dz * uy;
    const wy = dz * ux - dx * uz;
    const wz = dx * uy - dy * ux;
    const base = this.pos.length / 3;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const n: P3 = [ux * cs + wx * sn, uy * cs + wy * sn, uz * cs + wz * sn];
      this.vertex([p0[0] + n[0] * r0, p0[1] + n[1] * r0, p0[2] + n[2] * r0], n, color, i / sides, 0);
      this.vertex([p1[0] + n[0] * r1, p1[1] + n[1] * r1, p1[2] + n[2] * r1], n, color1, i / sides, 1);
    }
    for (let i = 0; i < sides; i++) {
      const k = base + i * 2;
      this.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
    if (cap) {
      const n: P3 = [dx, dy, dz];
      const centre = this.vertex(p1, n, color1, 0.5, 1);
      const ring = this.pos.length / 3;
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const cs = Math.cos(a);
        const sn = Math.sin(a);
        this.vertex([p1[0] + (ux * cs + wx * sn) * r1, p1[1] + (uy * cs + wy * sn) * r1, p1[2] + (uz * cs + wz * sn) * r1], n, color1, 0.5, 1);
      }
      for (let i = 0; i < sides; i++) this.idx.push(centre, ring + i, ring + ((i + 1) % sides));
    }
  }

  /** A footprint pushed up from h0 to h1: its sides and its top (a kerbed slab, a low wall, a planter). */
  slab(ring: readonly V2[], h0: number, h1: number, side: Color, top: Color = side) {
    if (ring.length < 3) return;
    const ccw = ringArea(ring) > 0 ? ring : ring.slice().reverse();
    for (let i = 0; i < ccw.length; i++) {
      const a = ccw[i];
      const b = ccw[(i + 1) % ccw.length];
      this.quad(at(a, h0), at(b, h0), at(b, h1), at(a, h1), side, [b[1] - a[1], 0, b[0] - a[0]]);
    }
    this.flat(ccw, h1, top);
  }

  /**
   * A box turned any way: its centre (three.js position), half its size along its own three directions `u`, `v`
   * and `w` (unit vectors, square to each other).
   */
  block(c: P3, u: P3, v: P3, w: P3, hu: number, hv: number, hw: number, color: Color) {
    const corner = (su: number, sv: number, sw: number): P3 => [
      c[0] + u[0] * hu * su + v[0] * hv * sv + w[0] * hw * sw,
      c[1] + u[1] * hu * su + v[1] * hv * sv + w[1] * hw * sw,
      c[2] + u[2] * hu * su + v[2] * hv * sv + w[2] * hw * sw,
    ];
    const face = (n: P3, s: number, a: [number, number, number], b: [number, number, number], cc: [number, number, number], d: [number, number, number]) =>
      this.quad(corner(...a), corner(...b), corner(...cc), corner(...d), color, [n[0] * s, n[1] * s, n[2] * s]);
    face(u, 1, [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]);
    face(u, -1, [-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]);
    face(v, 1, [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]);
    face(v, -1, [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]);
    face(w, 1, [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]);
    face(w, -1, [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new BufferAttribute(new Uint32Array(this.idx), 1) : new BufferAttribute(new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** A colour from a hex number, lightened or darkened by `k` (1 = as is). */
export function shade(hex: number, k = 1): Color {
  tmp.setHex(hex);
  return new Color(Math.min(1, tmp.r * k), Math.min(1, tmp.g * k), Math.min(1, tmp.b * k));
}

/** Blend two hex colours. */
export function mix(a: number, b: number, t: number): Color {
  return new Color(a).lerp(new Color(b), t);
}
