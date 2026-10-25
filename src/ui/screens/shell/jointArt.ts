// Ühine raport (2.36.0): the award badges' icons and colours, shared by the report (inline SVG) and the picture made
// for sharing (canvas, src/ui/screens/shell/jointShare.ts). Drawn on the icon set's 24 px grid with the same 1.8 px
// round stroke (src/ui/components/Icon.tsx); plain path data, so a canvas can stroke it with Path2D.
import type { AwardId } from '@/sim/joint';

export const AWARD_ICON: Record<AwardId, string[]> = {
  // A medal on its ribbon, a star on it.
  hero: [
    'M8.4 2.8l2.4 5.6M15.6 2.8l-2.4 5.6',
    'M18.2 14.4a6.2 6.2 0 1 1-12.4 0 6.2 6.2 0 0 1 12.4 0z',
    'M12 11.2l.79 2.11 2.25.1-1.76 1.41.6 2.17L12 15.75l-1.88 1.24.6-2.17-1.76-1.41 2.25-.1z',
  ],
  // A bolt.
  fastest: ['M13.4 2.8 5.8 13.4h5.4l-.9 7.8 7.9-10.9h-5.6z'],
  // Two crews crossing a border: one each way.
  helper: ['M4 8.4h13.4M14 5l3.4 3.4-3.4 3.4', 'M20 15.6H6.6M10 12.2l-3.4 3.4L10 19'],
  // A shield with a steady pulse.
  nerve: [
    'M12 2.8 19 5.6v5.5c0 4.6-3 8.4-7 10.1-4-1.7-7-5.5-7-10.1V5.6z',
    'M7.6 12.2h2.2l1.2-2.6 2.1 5 1.2-2.4h2.1',
  ],
  // A snail: its shell with a coil, its foot and feelers.
  snail: [
    'M3 18.4h13.6a3 3 0 0 0 3-3v-1.8',
    'M15 13.4a5 5 0 1 1-10 0 5 5 0 0 1 10 0z',
    'M10 13.4a1 1 0 0 1 2 0 2 2 0 0 1-4 0 3 3 0 0 1 6 0',
    'M19.6 13.6l-1.2-3.8M19.6 13.6l1.6-3.6',
  ],
};

/** The badge colour of each award (a CSS custom property of the shell's palette). */
export const AWARD_TONE: Record<AwardId, string> = {
  hero: 'var(--vk-amb)',
  fastest: 'var(--vk-acc)',
  helper: 'var(--vk-ok)',
  nerve: 'var(--vk-bad)',
  snail: 'var(--vk-text-3)',
};

/** The same colours for the shared picture, which is always dark (sRGB, close to the dark palette). */
export const AWARD_TONE_HEX: Record<AwardId, string> = {
  hero: '#f0b44c',
  fastest: '#6cc4f0',
  helper: '#5fd39a',
  nerve: '#f2826f',
  snail: '#9aa6b8',
};
