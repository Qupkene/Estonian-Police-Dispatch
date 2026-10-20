// Original EPD mark ("lipukilp"): NOT the PPA logo, NOT the Estonian coat of arms. A heater shield in the flag's
// three bands (sinine, must, valge) inside a blue rim. Flat: three colours, no gradient, no shadow. It is the site's
// icon only: public/favicon.svg, public/icons/*.png and public/og-image.* carry the same artwork, so browser tabs,
// home screens and link previews never look like an official PPA page. Inside the game the system owner's mark is
// PPA's logo (PpaLogo.tsx), used with the agency's permission (docs/PERMISSIONS.md).
// Drawn on a 64 grid with the bands' edges on multiples of 4, so it is crisp at 16, 32 and 64 px.
import { useId } from 'react';

/** Flag colours (sinine, must, valge). */
export const EMBLEM_BLUE = '#0072CE';
export const EMBLEM_BLACK = '#000000';
export const EMBLEM_WHITE = '#FFFFFF';

/** The shield, the inside of its rim, and where the black and the white band start. */
export const EMBLEM_SHIELD = 'M8 4H56V33C56 46.6 45.6 55.2 32 60C18.4 55.2 8 46.6 8 33Z';
export const EMBLEM_SHIELD_IN = 'M12 8H52V33C52 44 43.6 51.6 32 56C20.4 51.6 12 44 12 33Z';
export const EMBLEM_BANDS = { black: 24, white: 40 } as const;

export function Emblem({
  size = 48,
  className,
  title = 'EPD',
  decorative = false,
}: {
  size?: number;
  className?: string;
  title?: string;
  decorative?: boolean;
}) {
  const clip = `epd-in-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className={`ui-emblem${className ? ' ' + className : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': title })}
    >
      <clipPath id={clip}>
        <path d={EMBLEM_SHIELD_IN} />
      </clipPath>
      <path d={EMBLEM_SHIELD} fill={EMBLEM_BLUE} />
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y={EMBLEM_BANDS.black} width="64" height={EMBLEM_BANDS.white - EMBLEM_BANDS.black} fill={EMBLEM_BLACK} />
        <rect x="0" y={EMBLEM_BANDS.white} width="64" height={64 - EMBLEM_BANDS.white} fill={EMBLEM_WHITE} />
      </g>
    </svg>
  );
}
