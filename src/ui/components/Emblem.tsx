// Original EPD emblem — NOT the PPA logo and NOT the Estonian coat of arms.
// A heater shield carrying a stylised cornflower (rukkilill, Estonia's national flower) above an
// "EPD" monogram drawn as strokes (no font dependency). The same artwork lives in public/favicon.svg.
import { useId } from 'react';

const OUTER_PETALS = [0, 45, 90, 135, 180, 225, 270, 315];
const INNER_PETALS = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];

/** Cornflower floret pointing up from the flower centre: a narrow funnel ending in serrated teeth. */
export const PETAL_PATH = 'M-1 -2.4L-3 -7.9L-3.9 -9.9L-2.4 -9.4L-1.3 -10.7L0 -9.5L1.3 -10.7L2.4 -9.4L3.9 -9.9L3 -7.9L1 -2.4Z';

export function Emblem({ size = 48, className, title = 'EPD' }: { size?: number; className?: string; title?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const g = (n: string) => `epd-${n}-${uid}`;
  return (
    <svg className={`ui-emblem${className ? ' ' + className : ''}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <defs>
        <linearGradient id={g('fill')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15386b" />
          <stop offset="1" stopColor="#071324" />
        </linearGradient>
        <linearGradient id={g('rim')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8cc4ff" />
          <stop offset=".5" stopColor="#3d8bff" />
          <stop offset="1" stopColor="#1d4fd8" />
        </linearGradient>
        <linearGradient id={g('petal')} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#2f5fe8" />
          <stop offset="1" stopColor="#7aa5ff" />
        </linearGradient>
        <radialGradient id={g('glow')} cx=".5" cy=".38" r=".5">
          <stop offset="0" stopColor="#3d8bff" stopOpacity=".35" />
          <stop offset="1" stopColor="#3d8bff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* shield */}
      <path
        d="M32 3C39 6.5 47 7.6 55 7V29.5C55 45 45.5 54.5 32 61C18.5 54.5 9 45 9 29.5V7C17 7.6 25 6.5 32 3Z"
        fill={`url(#${g('fill')})`}
        stroke={`url(#${g('rim')})`}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M32 6.6C38.5 9.6 45.4 10.7 51.8 10.4V29.6C51.8 43 43.7 51.4 32 57.4C20.3 51.4 12.2 43 12.2 29.6V10.4C18.6 10.7 25.5 9.6 32 6.6Z"
        fill={`url(#${g('glow')})`}
        stroke="#ffffff"
        strokeOpacity=".14"
        strokeWidth=".8"
      />
      {/* cornflower */}
      <g transform="translate(32 23.2)">
        {OUTER_PETALS.map((a) => (
          <path key={a} d={PETAL_PATH} transform={`rotate(${a})`} fill={`url(#${g('petal')})`} stroke="#0b1d3d" strokeWidth=".35" />
        ))}
        {INNER_PETALS.map((a) => (
          <path key={a} d={PETAL_PATH} transform={`rotate(${a}) scale(.62)`} fill="#9cc0ff" stroke="#0b1d3d" strokeWidth=".4" />
        ))}
        <circle r="2.7" fill="#2a1f66" stroke="#0b1d3d" strokeWidth=".4" />
        <circle r=".55" cx="-1" cy="-.6" fill="#b9a6ff" />
        <circle r=".55" cx="1" cy="-.4" fill="#b9a6ff" />
        <circle r=".55" cx="0" cy="1" fill="#b9a6ff" />
      </g>
      {/* divider */}
      <path d="M22 35.4h6.5M35.5 35.4H42" stroke="#3d8bff" strokeOpacity=".7" strokeWidth="1" strokeLinecap="round" />
      <circle cx="32" cy="35.4" r="1" fill="#8cc4ff" />
      {/* EPD monogram */}
      <path
        d="M26.4 38.6h-4.7v7.4h4.7M21.7 42.3h3.9M29.5 46V38.6h3a2.25 2.25 0 0 1 0 4.5h-3M37.3 38.6h2.3a3.7 3.7 0 0 1 0 7.4h-2.3z"
        fill="none"
        stroke="#eaf1f8"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
