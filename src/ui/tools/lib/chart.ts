/** Pure chart maths for the hand-written SVG charts in StatsPanel (tested in tests/tools.test.ts). */

export type Scale = ((v: number) => number) & { domain: [number, number]; range: [number, number] };

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const f = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale;
  f.domain = domain;
  f.range = range;
  return f;
}

/** A "nice" step (1, 2, 2.5, 5 × 10^n) so that ~`count` ticks cover `span`. */
export function niceStep(span: number, count = 5): number {
  if (!(span > 0)) return 1;
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

/** Ticks from 0 (or min) to a nice upper bound ≥ max. Integer-only when `integer`. */
export function niceTicks(min: number, max: number, count = 4, integer = false): number[] {
  if (max <= min) max = min + 1;
  let step = niceStep(max - min, count);
  if (integer) step = Math.max(1, Math.ceil(step));
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Time-axis ticks at round wall-clock steps (10/15/30 min, 1/2/3/4/6 h) between t0 and t1 (epoch ms). */
export function timeTicks(t0: number, t1: number, maxTicks = 5): number[] {
  const span = Math.max(1, t1 - t0);
  const steps = [10, 15, 30, 60, 120, 180, 240, 360].map((m) => m * 60_000);
  const step = steps.find((st) => span / st <= Math.max(1, maxTicks - 1)) ?? steps[steps.length - 1];
  const out: number[] = [];
  for (let v = Math.ceil(t0 / step) * step; v <= t1; v += step) out.push(v);
  return out;
}

/** Point on a circle; angle 0 = 12 o'clock, clockwise. */
export function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

const f2 = (n: number) => Math.round(n * 100) / 100;

/** SVG path for a donut segment from angle a0 to a1 (radians, clockwise from 12 o'clock). */
export function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const sweep = a1 - a0;
  if (sweep >= Math.PI * 2 - 1e-6) {
    // full ring: two halves
    const mid = a0 + Math.PI;
    return arcPath(cx, cy, rOuter, rInner, a0, mid) + ' ' + arcPath(cx, cy, rOuter, rInner, mid, a0 + Math.PI * 2 - 1e-6);
  }
  const large = sweep > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, rOuter, a0);
  const [x1, y1] = polar(cx, cy, rOuter, a1);
  const [x2, y2] = polar(cx, cy, rInner, a1);
  const [x3, y3] = polar(cx, cy, rInner, a0);
  return [
    `M${f2(x0)} ${f2(y0)}`,
    `A${rOuter} ${rOuter} 0 ${large} 1 ${f2(x1)} ${f2(y1)}`,
    `L${f2(x2)} ${f2(y2)}`,
    `A${rInner} ${rInner} 0 ${large} 0 ${f2(x3)} ${f2(y3)}`,
    'Z',
  ].join(' ');
}

/** Split a full circle into segments proportional to values with a fixed angular gap between them. */
export function donutAngles(values: number[], gap = 0.03): { a0: number; a1: number; share: number }[] {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return values.map(() => ({ a0: 0, a1: 0, share: 0 }));
  const n = values.filter((v) => v > 0).length;
  const g = n > 1 ? gap : 0;
  const avail = Math.PI * 2 - g * n;
  let a = 0;
  return values.map((v) => {
    const share = Math.max(0, v) / total;
    if (share === 0) return { a0: a, a1: a, share };
    const a0 = a + g / 2;
    const a1 = a0 + share * avail;
    a = a1 + g / 2;
    return { a0, a1, share };
  });
}

/** Stack rows of series values: rows[i][k] → [y0, y1] per series k at x i. */
export function stack(rows: number[][]): [number, number][][] {
  return rows.map((row) => {
    let acc = 0;
    return row.map((v) => {
      const y0 = acc;
      acc += Math.max(0, v);
      return [y0, acc] as [number, number];
    });
  });
}

export function linePath(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f2(x)} ${f2(y)}`).join(' ');
}

/** Closed area between an upper and a lower polyline (same x order). */
export function areaPath(top: [number, number][], bottom: [number, number][]): string {
  if (!top.length) return '';
  const back = [...bottom].reverse();
  return linePath(top) + ' ' + back.map(([x, y]) => `L${f2(x)} ${f2(y)}`).join(' ') + ' Z';
}

/**
 * Stable colour-slot allocation: categories keep their slot while they stay in `top`;
 * newcomers take the lowest free slot. Colour follows the entity, never its rank.
 */
export function allocateSlots(prev: Record<string, number>, top: string[], nSlots: number): Record<string, number> {
  const next: Record<string, number> = {};
  const used = new Set<number>();
  for (const k of top) {
    const s = prev[k];
    if (s !== undefined && s < nSlots && !used.has(s)) {
      next[k] = s;
      used.add(s);
    }
  }
  for (const k of top) {
    if (next[k] !== undefined) continue;
    for (let s = 0; s < nSlots; s++) {
      if (!used.has(s)) {
        next[k] = s;
        used.add(s);
        break;
      }
    }
  }
  return next;
}

/** Compact number for axis ticks: 950 → "950", 1200 → "1,2K" (et) / "1.2K" (en). */
export function compact(n: number, lang: 'et' | 'en' = 'et'): string {
  const abs = Math.abs(n);
  const fmt = (v: number, suf: string) => {
    const s = (Math.round(v * 10) / 10).toString();
    return (lang === 'et' ? s.replace('.', ',') : s) + suf;
  };
  if (abs >= 1e6) return fmt(n / 1e6, 'M');
  if (abs >= 1e3) return fmt(n / 1e3, 'K');
  const r = Math.round(n * 10) / 10;
  return lang === 'et' ? String(r).replace('.', ',') : String(r);
}

/** Number → string with decimal comma in Estonian. */
export function dec(n: number, digits = 1, lang: 'et' | 'en' = 'et'): string {
  const s = n.toFixed(digits);
  return lang === 'et' ? s.replace('.', ',') : s;
}
