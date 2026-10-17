/**
 * Seeded PRNG (mulberry32). The generator state is a single uint32 so it can live inside
 * the serialisable SimState (`state.rng`). Use `withRng(state, r => ...)` in engine code,
 * or create a standalone `Rng` for generators/tests.
 */
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick on empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick; weights <= 0 are never chosen. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  /** Approximately normal (Irwin-Hall, 4 samples). */
  normal(mean = 0, sd = 1): number {
    const s = this.next() + this.next() + this.next() + this.next() - 2;
    return mean + s * sd * 1.732;
  }

  /** Exponential inter-arrival time for a Poisson process with `rate` events per unit. */
  exp(rate: number): number {
    return -Math.log(1 - this.next()) / rate;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Derive an independent generator (e.g. per person) without disturbing this one much. */
  fork(salt = 0): Rng {
    return new Rng((this.int(0, 0xffffffff) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
  }
}

/** Run `fn` with an Rng bound to `holder.rng`, writing the advanced state back. */
export function withRng<T>(holder: { rng: number }, fn: (r: Rng) => T): T {
  const r = new Rng(holder.rng);
  const out = fn(r);
  holder.rng = r.state;
  return out;
}

/** Stable 32-bit hash of a string (FNV-1a), handy for deterministic seeds. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
