// The newspaper's photo: the owner's drawings, a different one each shift (Newspaper.tsx).
//
// To add a drawing: `node scripts/paper-drawing.mjs <image> <id>` writes paper-<id>.webp and paper-<id>-sm.webp
// here and prints the line for DRAWINGS below; fill in its alt text and tags. Tags are what the front page can be
// about (ShiftReport.newspaper.topics): an incident category (traffic, violence, domestic, property, public_order,
// drugs, missing, alarm, assist, major, border, environment, fraud, easter), 'pursuit', 'quiet', 'busy', 'holiday' or
// 'night'. Every category but easter has a drawing (tests/paper-drawings.test.ts).
import type { Text } from '@/sim/types';
import { hashString } from '@/sim/rng';

export interface Drawing {
  id: string;
  /** Pixel size of paper-<id>.webp (the small copy is 480 px wide). */
  w: number;
  h: number;
  alt: Text;
  tags: readonly string[];
}

export const DRAWINGS: readonly Drawing[] = [
  {
    id: 'meeskond',
    w: 800,
    h: 1005,
    alt: {
      et: 'Patrullid ja kaks teenistuskoera politseimaja ees',
      en: 'Patrol officers and two police dogs outside the police station',
    },
    tags: ['busy', 'holiday', 'missing', 'drugs', 'major', 'border'],
  },
  {
    id: 'radar',
    w: 800,
    h: 598,
    alt: { et: 'Kiiruse mõõtmine maanteel', en: 'Speed check on a country road' },
    tags: ['traffic', 'environment', 'border'],
  },
  {
    id: 'valjak',
    w: 800,
    h: 598,
    alt: { et: 'Patrull Tallinna kesklinnas', en: 'A patrol in central Tallinn' },
    tags: ['public_order', 'property', 'alarm', 'pursuit', 'domestic'],
  },
  {
    id: 'peegel',
    w: 800,
    h: 598,
    alt: { et: 'Patrull vormistab sündmuskohal teadet', en: 'A patrol files a report at the scene' },
    tags: ['property', 'assist', 'environment', 'border', 'traffic', 'fraud'],
  },
  {
    id: 'mootmine',
    w: 765,
    h: 1024,
    alt: {
      et: 'Politseinik ja abipolitseinik kiirust mõõtmas',
      en: 'An officer and a volunteer checking speeds',
    },
    tags: ['traffic'],
  },
  {
    id: 'varustus',
    w: 765,
    h: 1024,
    alt: { et: 'Patrullpolitseiniku varustus', en: 'A patrol officer’s kit' },
    tags: ['violence', 'major', 'drugs'],
  },
  {
    id: 'oopatrull',
    w: 800,
    h: 1005,
    alt: { et: 'Öine patrull aitab abivajajat', en: 'A night patrol helps someone home' },
    tags: ['assist', 'missing', 'public_order', 'holiday', 'night'],
  },
  {
    id: 'kaubik',
    w: 800,
    h: 534,
    alt: { et: 'Politseibuss väljakutsel', en: 'A police van on a call-out' },
    tags: ['domestic', 'violence', 'alarm', 'pursuit', 'busy'],
  },
];

const FILES = import.meta.glob<string>('./*.webp', { eager: true, import: 'default' });

/** The two copies of a drawing as an <img> wants them. */
export function drawingSrc(d: Drawing): { src: string; srcSet: string } {
  const big = FILES[`./paper-${d.id}.webp`];
  const small = FILES[`./paper-${d.id}-sm.webp`];
  return { src: small ?? big, srcSet: small && big ? `${small} 480w, ${big} ${d.w}w` : (big ?? small) };
}

/** Every webp in this folder, for the test that each drawing has its files and each file its line. */
export const DRAWING_FILES: readonly string[] = Object.keys(FILES).map((f) => f.slice(2));

/**
 * The drawing for one front page: one for the first topic that has one (the lead story's), else any drawing.
 * `avoid` (the drawings shown last, newest first) are skipped: a fitting drawing may repeat the one before the
 * last, never the last. Among the candidates `key` (the shift) picks, so the same report keeps its drawing.
 */
export function pickDrawing(
  list: readonly Drawing[],
  key: string,
  topics: readonly string[] = [],
  avoid: readonly string[] = [],
): Drawing | undefined {
  const pick = (pool: readonly Drawing[]) => pool[hashString(key) % pool.length];
  const without = (n: number) => list.filter((d) => !avoid.slice(0, n).includes(d.id));
  for (const n of [avoid.length, Math.min(1, avoid.length)]) {
    const fresh = without(n);
    const topic = topics.find((t) => fresh.some((d) => d.tags.includes(t)));
    if (topic) return pick(fresh.filter((d) => d.tags.includes(topic)));
  }
  for (let n = avoid.length; n >= 0; n--) {
    const fresh = without(n);
    if (fresh.length > 0) return pick(fresh);
  }
  return undefined;
}

const MEMORY_KEY = 'epd:paperDrawings';
const MEMORY_SIZE = 12;
const AVOID = 2;

/**
 * pickDrawing with this viewer's memory: a report shown before keeps its drawing, a new one skips the last two
 * shown. Storage can be missing or throw (private window); then it is the plain pick.
 */
export function drawingForPaper(
  key: string,
  topics: readonly string[] = [],
  storage?: Storage,
): Drawing | undefined {
  let store: Storage | undefined;
  let seen: { k: string; id: string }[] = [];
  try {
    store = storage ?? globalThis.localStorage;
    const raw = JSON.parse(store?.getItem(MEMORY_KEY) ?? '[]') as unknown;
    if (Array.isArray(raw))
      seen = (raw as { k?: unknown; id?: unknown }[]).filter(
        (x): x is { k: string; id: string } => typeof x?.k === 'string' && typeof x?.id === 'string',
      );
  } catch {
    /* no memory: the plain pick */
  }
  const hit = seen.find((x) => x.k === key);
  const known = hit && DRAWINGS.find((d) => d.id === hit.id);
  if (known) return known;
  const pick = pickDrawing(DRAWINGS, key, topics, seen.map((x) => x.id).slice(0, AVOID));
  try {
    if (pick)
      store?.setItem(MEMORY_KEY, JSON.stringify([{ k: key, id: pick.id }, ...seen].slice(0, MEMORY_SIZE)));
  } catch {
    /* full or blocked: the next report just cannot skip this one */
  }
  return pick;
}
