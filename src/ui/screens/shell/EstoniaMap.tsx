// Interactive SVG prefecture picker built from data/geo/counties.json (Maa- ja Ruumiamet county boundaries via Who's On First).
import { useMemo, useState, type KeyboardEvent } from 'react';
import { REGION_IDS } from '@/data/regions';
import type { RegionId } from '@/sim/types';
import { useLang } from '@/i18n';
import {
  countyShapes,
  ESTONIA_BOUNDS,
  makeProjection,
  regionSummary,
  type CountyShape,
  type Projection,
} from './helpers';

const WIDTH = 640;
let cache: { proj: Projection; shapes: CountyShape[] } | null = null;
function geometry() {
  if (!cache) {
    const proj = makeProjection(ESTONIA_BOUNDS, WIDTH, 12);
    cache = { proj, shapes: countyShapes(proj, 0.9) };
  }
  return cache;
}

export function EstoniaMap({
  value,
  onChange,
  allowed,
  label,
}: {
  value: RegionId;
  onChange: (id: RegionId) => void;
  /** Regions that can be picked (others are dimmed). Default: all. */
  allowed?: RegionId[];
  label: string;
}) {
  const lang = useLang();
  const { proj, shapes } = geometry();
  const [hover, setHover] = useState<RegionId | null>(null);
  const summaries = useMemo(
    () =>
      Object.fromEntries(REGION_IDS.map((id) => [id, regionSummary(id)])) as Record<
        RegionId,
        ReturnType<typeof regionSummary>
      >,
    [],
  );
  const can = (id: RegionId) => !allowed || allowed.includes(id);

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const order = REGION_IDS.filter(can);
    const i = order.indexOf(value);
    let next: RegionId | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = order[(i + 1) % order.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = order[(i - 1 + order.length) % order.length];
    if (next) {
      e.preventDefault();
      onChange(next);
      (e.currentTarget.querySelector(`[data-region="${next}"]`) as SVGGElement | null)?.focus();
    }
  };

  return (
    <svg
      className="sh-map"
      viewBox={`0 0 ${proj.width} ${proj.height}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
    >
      <defs>
        <filter id="sh-map-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {shapes
        .filter((c) => !c.regionId)
        .map((c) => (
          <path key={c.name} d={c.d} className="sh-map__county sh-map__county--none" />
        ))}
      {REGION_IDS.map((id) => {
        const sel = id === value;
        const cls = [
          'sh-map__region',
          `sh-map__region--${id}`,
          sel && 'is-selected',
          hover === id && 'is-hover',
          !can(id) && 'is-locked',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <g
            key={id}
            data-region={id}
            className={cls}
            role="radio"
            aria-checked={sel}
            aria-disabled={!can(id)}
            aria-label={summaries[id].name[lang]}
            tabIndex={sel ? 0 : -1}
            onClick={() => can(id) && onChange(id)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && can(id)) {
                e.preventDefault();
                onChange(id);
              }
            }}
            onMouseEnter={() => setHover(id)}
            onMouseLeave={() => setHover((h) => (h === id ? null : h))}
            filter={sel ? 'url(#sh-map-glow)' : undefined}
          >
            {shapes
              .filter((c) => c.regionId === id)
              .map((c) => (
                <path key={c.name} d={c.d} className="sh-map__county">
                  <title>{c.name}</title>
                </path>
              ))}
          </g>
        );
      })}
      {REGION_IDS.map((id) => {
        const s = summaries[id];
        const [hx, hy] = proj.project(s.hq);
        const [lx, ly] = proj.project(s.label);
        return (
          <g
            key={`l-${id}`}
            className={`sh-map__labels${id === value ? ' is-selected' : ''}${!can(id) ? ' is-locked' : ''}`}
            aria-hidden="true"
          >
            <circle cx={hx} cy={hy} r={4.5} className="sh-map__hq" />
            <text x={hx + 8} y={hy + 4} className="sh-map__city">
              {s.hqCity}
            </text>
            <text x={lx} y={ly} className="sh-map__label" textAnchor="middle">
              {s.short}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
