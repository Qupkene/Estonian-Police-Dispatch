// The official logo of Politsei- ja Piirivalveamet (PPA), used with the agency's permission (19.10.2026, see
// docs/PERMISSIONS.md): the agency's own files from www.politsei.ee in public/brand/ppa/, unchanged, in the text
// colour (BrandLogo.tsx). Renders nothing if the file is missing. The small state coat of arms appears only
// inside this logo, as it is; the coat of arms is never used on its own.
import { BrandLogo } from './BrandLogo';

export type PpaLogoVariant = 'full' | 'emblem';

/** PPA's logo at `height` px: the full logo (shield and wordmark) or the shield alone. */
export function PpaLogo({
  variant = 'full',
  height = 28,
  className,
}: {
  variant?: PpaLogoVariant;
  height?: number;
  className?: string;
}) {
  return <BrandLogo brand={variant === 'full' ? 'ppa' : 'ppa-emblem'} height={height} className={className} />;
}
