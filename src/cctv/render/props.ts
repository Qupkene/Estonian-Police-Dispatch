/**
 * The few things in a camera's picture that are neither people nor vehicles (stage.ts PropFrame): a weapon somebody
 * dropped, an ambulance's stretcher, the sheet over somebody who died, a fire hose. A handful of triangles each,
 * coloured per vertex, one material for all of them.
 */
import { Color, Group, Mesh, MeshLambertMaterial } from 'three';
import type { V2 } from '../math';
import type { Held, PropFrame } from '../stage';
import { MeshBuilder } from './mesh';

const col = (hex: number) => new Color(hex);

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
    // A sheet over a body on the ground: higher over the chest, lower over the legs.
    mb.box([0.25, 0], 0, 1.0, 0.72, 0.02, 0.34, col(0xc9ccca));
    mb.box([-0.55, 0], 0, 0.75, 0.6, 0.02, 0.24, col(0xbfc2c0));
    mb.box([0.82, 0], 0, 0.3, 0.5, 0.02, 0.28, col(0xc4c7c5));
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
