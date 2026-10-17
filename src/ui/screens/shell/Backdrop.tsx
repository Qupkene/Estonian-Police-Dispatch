// Animated dark CAD backdrop: map grid, faint Estonia outline and an optional radar sweep.
import { memo } from 'react';
import { countyShapes, ESTONIA_BOUNDS, makeProjection } from './helpers';

let outline: { d: string; w: number; h: number } | null = null;
function estoniaOutline() {
  if (!outline) {
    const proj = makeProjection(ESTONIA_BOUNDS, 900, 10);
    const d = countyShapes(proj, 2.2)
      .map((c) => c.d)
      .join('');
    outline = { d, w: proj.width, h: proj.height };
  }
  return outline;
}

const BLIPS: [number, number, number][] = [
  [62, 38, 0.2],
  [71, 52, 1.4],
  [48, 61, 2.3],
  [80, 30, 3.1],
  [57, 46, 0.9],
  [67, 66, 2.8],
];

export const Backdrop = memo(function Backdrop({
  variant = 'grid',
  map = true,
}: {
  variant?: 'grid' | 'radar';
  map?: boolean;
}) {
  const o = map ? estoniaOutline() : null;
  return (
    <div className={`sh-bg sh-bg--${variant}`} aria-hidden="true">
      <div className="sh-bg__grid" />
      {o && (
        <svg className="sh-bg__map" viewBox={`0 0 ${o.w} ${o.h}`} preserveAspectRatio="xMidYMid meet">
          <path d={o.d} />
        </svg>
      )}
      {variant === 'radar' && (
        <div className="sh-bg__radar">
          <div className="sh-bg__rings" />
          <div className="sh-bg__sweep" />
          {BLIPS.map(([x, y, delay], i) => (
            <i
              key={i}
              className="sh-bg__blip"
              style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay}s` }}
            />
          ))}
        </div>
      )}
      <div className="sh-bg__vignette" />
      <div className="sh-bg__scan" />
    </div>
  );
});
