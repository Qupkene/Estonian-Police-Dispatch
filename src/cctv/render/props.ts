/**
 * The few things in a camera's picture that are neither people nor vehicles (stage.ts PropFrame): a weapon somebody
 * dropped, an ambulance's stretcher, the sheet over somebody who died, a fire hose. A handful of triangles each,
 * coloured per vertex, one material for all of them.
 */
import { Color, Group, Mesh, MeshLambertMaterial } from 'three';
import type { V2 } from '../math';
import type { Held, PropFrame } from '../stage';
import { MeshBuilder, shade } from './mesh';

const col = (hex: number) => new Color(hex);

type P3 = [number, number, number];

/**
 * The sheet over somebody who lies on the ground with the head at +x, as stations along the body: where, how high
 * the cloth is over the body's middle, and half the body's width there. Toes, feet, shins, knees, hips, belly,
 * chest, shoulders, neck, head; the first and the last are the cloth's ends on the ground. The body itself is not
 * drawn under it (PropFrame.covers).
 */
const SHEET: readonly (readonly [number, number, number])[] = [
  [-1.1, 0, 0.14],
  [-0.97, 0.19, 0.13],
  [-0.86, 0.22, 0.15],
  [-0.62, 0.14, 0.17],
  [-0.36, 0.17, 0.19],
  [-0.08, 0.2, 0.22],
  [0.2, 0.22, 0.24],
  [0.44, 0.26, 0.27],
  [0.62, 0.23, 0.29],
  [0.73, 0.16, 0.14],
  [0.86, 0.24, 0.12],
  [0.97, 0.16, 0.1],
  [1.1, 0, 0.1],
];
/** Across the body at a station: which side and how far out (beyond 1 is the cloth lying out on the ground), and the share of the height there. */
const SHEET_ACROSS: readonly (readonly [number, number])[] = [
  [-2, 0],
  [-1, 0.45],
  [-0.55, 0.88],
  [0, 1],
  [0.55, 0.88],
  [1, 0.45],
  [2, 0],
];
/** How far the cloth lies out beyond the body, and how far its rim is below the prop's own level (the pavement's). */
const SHEET_SKIRT = 0.16;
const SHEET_RIM = -0.14;

/** A weapon lying about its own origin, along x, as it would on the ground (in a hand it is turned by the hand). */
export function weaponInto(mb: MeshBuilder, kind: Held): void {
  if (kind === 'knife') {
    mb.box([0.05, 0], 0, 0.1, 0.03, 0, 0.025, col(0x22221f));
    mb.box([0.19, 0], 0, 0.17, 0.026, 0.004, 0.016, col(0xc9ccd0));
  } else if (kind === 'bat') {
    mb.box([0.14, 0], 0, 0.28, 0.04, 0, 0.04, col(0x3a2c20));
    mb.box([0.53, 0], 0, 0.5, 0.062, 0, 0.062, col(0x8a6a42));
  } else {
    mb.box([0.08, 0], 0, 0.17, 0.03, 0.075, 0.115, col(0x1b1c1e));
    mb.box([0.025, 0], 0, 0.045, 0.03, 0, 0.09, col(0x242528));
  }
}

function build(p: PropFrame): MeshBuilder {
  const mb = new MeshBuilder();
  if (p.kind === 'stretcher') {
    // A wheeled stretcher: the mattress on a frame, a raised head end, four legs with wheels.
    mb.box([0, 0], 0, 1.9, 0.56, 0.74, 0.8, col(0xd9dde0));
    mb.box([0.72, 0], 0, 0.44, 0.5, 0.8, 0.86, col(0xc8cdd2));
    mb.box([0, 0], 0, 1.96, 0.6, 0.7, 0.74, col(0x3a3d42));
    for (const x of [-0.7, 0.7]) for (const y of [-0.24, 0.24]) mb.box([x, y], 0, 0.05, 0.05, 0.1, 0.7, col(0x8a8e94));
    for (const x of [-0.7, 0.7]) for (const y of [-0.24, 0.24]) mb.box([x, y], 0, 0.12, 0.05, 0, 0.12, col(0x1a1a1c));
  } else if (p.kind === 'sheet') {
    // Cloth over a body, not a box: it follows the body along its length and falls to the ground all round. The
    // rim lies lower than the pavement the body is on, so that no gap shows under it on the road either.
    const grid = SHEET.map(([x, h, w]) => SHEET_ACROSS.map(([side, share]) => [x, share > 0 ? h * share : SHEET_RIM, -(Math.abs(side) > 1 ? Math.sign(side) * (w + SHEET_SKIRT) : side * w)] as P3));
    // Rounded, as cloth is: every corner's normal from its neighbours along and across.
    const normal = (i: number, j: number): P3 => {
      const a = grid[Math.max(0, i - 1)][j];
      const b = grid[Math.min(grid.length - 1, i + 1)][j];
      const c = grid[i][Math.max(0, j - 1)];
      const d = grid[i][Math.min(SHEET_ACROSS.length - 1, j + 1)];
      const u: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v: P3 = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
      const n: P3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = (Math.hypot(n[0], n[1], n[2]) || 1) * (n[1] < 0 ? -1 : 1);
      return [n[0] / l, n[1] / l, n[2] / l];
    };
    for (let i = 0; i + 1 < grid.length; i++) {
      for (let j = 0; j + 1 < SHEET_ACROSS.length; j++) {
        // The faces differ a little in shade, as folds do.
        const cloth = shade(0x8e9290, 0.96 + 0.04 * Math.sin(i * 2.1 + j * 1.3));
        mb.smoothQuad([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]], [normal(i, j), normal(i + 1, j), normal(i + 1, j + 1), normal(i, j + 1)], cloth);
      }
    }
  } else if (p.kind === 'hose') {
    const line = p.line ?? [];
    if (line.length >= 2) {
      const rel = line.map((q) => [q[0] - p.pos[0], q[1] - p.pos[1]] as V2);
      const hose = col(0xd6b62c);
      if (line.length >= 4) {
        // On the ground from the lorry (wide enough to be a line in the picture), up off it a step behind the
        // crew, through the second one's hands to the nozzle at the first one's waist.
        mb.ribbon(rel.slice(0, -2), 0.17, 0.06, hose);
        const a = rel[rel.length - 3];
        const h = rel[rel.length - 2];
        const n = rel[rel.length - 1];
        mb.tube([a[0], 0.06, -a[1]], [h[0], 0.92, -h[1]], 0.055, 0.055, hose, 5);
        mb.tube([h[0], 0.92, -h[1]], [n[0], 1.02, -n[1]], 0.055, 0.055, hose, 5);
        const dx = n[0] - h[0];
        const dy = n[1] - h[1];
        const d = Math.max(0.1, Math.hypot(dx, dy));
        const tip: V2 = [n[0] + (dx / d) * 0.32, n[1] + (dy / d) * 0.32];
        mb.tube([n[0], 1.02, -n[1]], [tip[0], 1.08, -tip[1]], 0.05, 0.03, col(0x2a2c30), 5);
        if (p.aim) {
          // The water: a pale jet from the nozzle, rising in a flat bow to what it is played on.
          const t: V2 = [p.aim.at[0] - p.pos[0], p.aim.at[1] - p.pos[1]];
          const top = Math.max(1.4, p.aim.height);
          const water = col(0xcfdde6);
          const at = (k: number): [number, number, number] => [tip[0] + (t[0] - tip[0]) * k, 1.08 + (top - 1.08) * k + 1.6 * k * (1 - k), -(tip[1] + (t[1] - tip[1]) * k)];
          for (let i = 0; i < 7; i++) mb.tube(at(i / 7), at((i + 1) / 7), 0.022 + 0.012 * i, 0.022 + 0.012 * (i + 1), water, 5);
        }
      } else {
        mb.ribbon(rel.slice(0, -1), 0.17, 0.06, hose);
        const a = rel[rel.length - 2];
        const b = rel[rel.length - 1];
        mb.tube([a[0], 0.06, -a[1]], [b[0], 1.0, -b[1]], 0.055, 0.055, hose, 5);
      }
    }
  } else weaponInto(mb, p.kind);
  return mb;
}

/** Everything of a frame's props, kept between frames by id. */
export class PropsMesh {
  readonly group = new Group();
  private material = new MeshLambertMaterial({ vertexColors: true });
  private items = new Map<string, { mesh: Mesh; key: string }>();

  /** Show these props (a missing list is no props): new ones are built, gone ones removed, a hose that moved is laid anew. */
  update(props: readonly PropFrame[] | undefined): void {
    const seen = new Set<string>();
    for (const p of props ?? []) {
      seen.add(p.id);
      // A hose's shape is its line; everything else only moves.
      const key = p.kind === 'hose' ? (p.line ?? []).map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ') : p.kind;
      let it = this.items.get(p.id);
      if (it && it.key !== key) {
        this.group.remove(it.mesh);
        it.mesh.geometry.dispose();
        it = undefined;
      }
      if (!it) {
        const mb = build(p);
        if (mb.empty) continue;
        const mesh = new Mesh(mb.build(), this.material);
        mesh.castShadow = true;
        this.group.add(mesh);
        it = { mesh, key };
        this.items.set(p.id, it);
      }
      // A weapon on the ground lies on the pavement, a little above the road's own level.
      it.mesh.position.set(p.pos[0], p.kind === 'hose' || p.kind === 'stretcher' ? 0.1 : 0.13, -p.pos[1]);
      it.mesh.rotation.y = p.kind === 'hose' ? 0 : p.yaw;
    }
    for (const [id, it] of this.items) {
      if (seen.has(id)) continue;
      this.group.remove(it.mesh);
      it.mesh.geometry.dispose();
      this.items.delete(id);
    }
  }

  dispose(): void {
    for (const it of this.items.values()) it.mesh.geometry.dispose();
    this.items.clear();
    this.group.clear();
    this.material.dispose();
  }
}
