// STUB — owned by gen-people. Keep these signatures.
import type { Appearance, Gender } from '@/sim/types';

export interface AvatarOptions {
  gender: Gender;
  age: number;
  hair?: Appearance['hair'];
  hairColor?: Appearance['hairColor'];
  beard?: Appearance['beard'];
  glasses?: boolean;
  /** Draw a police uniform (officers). */
  uniform?: boolean;
}

/** Deterministic flat-style SVG portrait (viewBox 0 0 120 120). */
export function avatarSvg(seed: number, _o: AvatarOptions): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#1c2633"/><circle cx="60" cy="48" r="22" fill="#c9a27e"/><text x="60" y="110" font-size="10" text-anchor="middle" fill="#888">${seed % 1000}</text></svg>`;
}

export function avatarDataUri(seed: number, o: AvatarOptions): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(avatarSvg(seed, o));
}
