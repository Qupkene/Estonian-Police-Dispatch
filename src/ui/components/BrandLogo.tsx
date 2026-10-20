// Official logos used with their owners' permission (docs/PERMISSIONS.md): Politsei- ja Piirivalveamet, SK ID
// Solutions (Smart-ID, Mobiil-ID) and RIA (the id.ee "iD" logo of the ID card and DigiDoc). eesti.ee has no logo
// here (its site shows the state coat of arms, which the game never uses): it is written as plain text. Each is the owner's own file in
// public/brand/<brand>/, shown unchanged: never redrawn, imitated or stretched. A logo whose file is not there
// renders nothing, so a slot can wait for its file.
//
// Two ways to draw a file, set per brand below:
// - 'mask': a single-colour file with fill="currentColor", drawn as a CSS mask over the text colour, so it takes
//   the theme's colour (the only change ever made to a logo, and only to such files);
// - 'img': any other file, as an <img> exactly as it is, colours and all.
// Adding a file: put it at the path below and set `ratio` (viewBox width / height) and `draw`.
import { useEffect, useState, type CSSProperties } from 'react';
import { useT } from '@/i18n';

const BASE = import.meta.env.BASE_URL;

export type Brand = 'ppa' | 'ppa-emblem' | 'smart-id' | 'mobiil-id' | 'id-kaart' | 'digidoc';

interface BrandFile {
  src: string;
  /** Width / height from the file's viewBox; null: the browser takes it from the file ('img' only). */
  ratio: number | null;
  draw: 'mask' | 'img';
  /** Accessible name: an i18n key, or the brand's own name. */
  label: { key: string } | { name: string };
  /** Tallest it may be shown, CSS px (a small raster stays crisp at 2x). */
  max?: number;
}

export const BRANDS: Record<Brand, BrandFile> = {
  /** PPA: shield and the wordmark "Politsei- ja Piirivalveamet" (www.politsei.ee). */
  ppa: { src: `${BASE}brand/ppa/ppa-logo.svg`, ratio: 1399 / 245, draw: 'mask', label: { key: 'core.ppaLogo' } },
  /** PPA: the shield only, for compact places. */
  'ppa-emblem': {
    src: `${BASE}brand/ppa/ppa-emblem.svg`,
    ratio: 196 / 245,
    draw: 'mask',
    label: { key: 'core.ppaLogo' },
  },
  /** Smart-ID symbol (www.smart-id.com). */
  'smart-id': { src: `${BASE}brand/smart-id/smart-id.svg`, ratio: 1, draw: 'mask', label: { name: 'Smart-ID' } },
  /** Mobiil-ID round logo (www.mobiil-id.ee), full colour. */
  'mobiil-id': { src: `${BASE}brand/mobiil-id/mobiil-id.svg`, ratio: 1, draw: 'img', label: { name: 'Mobiil-ID' } },
  /** id.ee "iD" logo for the ID card (www.id.ee), an 81 × 60 raster: never taller than 30 px. */
  'id-kaart': {
    src: `${BASE}brand/id-kaart/id-ee.webp`,
    ratio: 81 / 60,
    draw: 'img',
    label: { name: 'ID-kaart' },
    max: 30,
  },
  /** DigiDoc: the same id.ee "iD" logo (RIA's brand for both), same limit. */
  digidoc: { src: `${BASE}brand/id-kaart/id-ee.webp`, ratio: 81 / 60, draw: 'img', label: { name: 'DigiDoc' }, max: 30 },
};

// Whether each file loaded, shared by every slot: the check runs once per page. An address that answers with
// something that is not an image (a missing file served as the app's page) counts as missing.
const known = new Map<string, boolean>();
const waiting = new Map<string, Set<(ok: boolean) => void>>();

function check(src: string, done: (ok: boolean) => void): () => void {
  let subs = waiting.get(src);
  if (!subs) {
    subs = new Set();
    waiting.set(src, subs);
    const img = new Image();
    const settle = (ok: boolean) => {
      known.set(src, ok);
      for (const f of waiting.get(src) ?? []) f(ok);
      waiting.delete(src);
    };
    img.onload = () => settle(true);
    img.onerror = () => settle(false);
    img.src = src;
  }
  subs.add(done);
  return () => subs.delete(done);
}

/** True once the file is known to load; a file not yet checked counts as there only if its ratio is known. */
export function useBrandAvailable(brand: Brand): boolean {
  const { src, ratio } = BRANDS[brand];
  const [ok, setOk] = useState(() => known.get(src) ?? ratio !== null);
  useEffect(() => {
    const k = known.get(src);
    if (k !== undefined) {
      setOk(k);
      return;
    }
    if (typeof Image === 'undefined') return;
    return check(src, setOk);
  }, [src]);
  return ok;
}

/** An official logo at `height` px; its width follows the file's own proportions. */
export function BrandLogo({
  brand,
  height = 24,
  className,
  decorative = false,
}: {
  brand: Brand;
  height?: number;
  className?: string;
  /** Hidden from assistive tech where the brand's name is written next to it. */
  decorative?: boolean;
}) {
  const t = useT();
  const file = BRANDS[brand];
  const available = useBrandAvailable(brand);
  if (!available) return null;
  if (file.max) height = Math.min(height, file.max);
  const name = 'key' in file.label ? t(file.label.key) : file.label.name;
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': name };
  const cls = `ui-brand ui-brand--${brand}${className ? ' ' + className : ''}`;
  if (file.draw === 'img')
    return (
      <img
        className={cls}
        src={file.src}
        alt={decorative ? '' : name}
        height={height}
        style={{ height, width: file.ratio ? Math.round(height * file.ratio * 10) / 10 : 'auto' }}
        draggable={false}
      />
    );
  const mask = `url("${file.src}")`;
  const style: CSSProperties = {
    width: Math.round(height * (file.ratio ?? 1) * 10) / 10,
    height,
    WebkitMaskImage: mask,
    maskImage: mask,
  };
  return <span className={`${cls} ui-brand--mask`} {...a11y} style={style} />;
}
