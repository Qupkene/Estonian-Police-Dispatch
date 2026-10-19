// Small SVG map of a prefecture's sectors (onboarding choice, "Vastutusala", the prefect's offer, the briefing's
// area), with a magnified inset of the city sectors. Decorative: the cards and lists next to it carry the same
// choices for keyboard and screen-reader users.
import { useId, useMemo } from 'react';
import { useLang } from '@/i18n';
import { sectorById } from '@/sim/sectors';
import type { RegionId } from '@/sim/types';
import { sectorMapGeometry, type SectorShape } from './sectors';

/** How a sector is drawn: the player's own, picked in onboarding, offered, night cover, a neighbour's desk, other. */
export type SectorPaint = 'mine' | 'picked' | 'offered' | 'cover' | 'neighbour' | 'pickable' | 'other';

const LABELLED: SectorPaint[] = ['mine', 'picked', 'offered', 'cover'];

export function SectorMap({
  regionId,
  paint,
  labels = 'mine',
  onPick,
  className,
}: {
  regionId: RegionId;
  /** Paint per sector id; sectors missing here are 'other'. */
  paint: Record<string, SectorPaint>;
  /** Which sectors get their short name on the map. */
  labels?: 'mine' | 'all' | 'none';
  /** Pointer shortcut for 'pickable' and 'picked' sectors (the cards next to the map stay the real control). */
  onPick?: (id: string) => void;
  className?: string;
}) {
  const lang = useLang();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const g = useMemo(() => sectorMapGeometry(regionId), [regionId]);
  const paintOf = (id: string) => paint[id] ?? 'other';
  const showLabel = (p: SectorPaint) => labels === 'all' || (labels === 'mine' && LABELLED.includes(p));

  const shapes = (list: SectorShape[]) =>
    list.map((s) => {
      const p = paintOf(s.id);
      const pick = onPick && (p === 'pickable' || p === 'picked');
      return (
        <path
          key={s.key}
          d={s.d}
          className={`cr-smap__sector is-${p}${pick ? ' is-clickable' : ''}`}
          data-sector={s.id}
          onClick={pick ? () => onPick(s.id) : undefined}
        />
      );
    });
  const texts = (list: SectorShape[]) =>
    list.map((s) => {
      const p = paintOf(s.id);
      if (!s.label || !showLabel(p)) return null;
      const sec = sectorById(s.id);
      const text = sec ? sec.short || sec.name[lang] : s.id;
      return (
        <text key={s.key} className={`cr-smap__label is-${p}`} x={s.label[0]} y={s.label[1]} textAnchor="middle" dominantBaseline="central">
          {text}
        </text>
      );
    });

  const inset = g.inset;
  // The inset only when it shows something the map does not: a city sector that is painted.
  const insetOn = !!inset && (labels === 'all' || inset.ids.some((id) => paintOf(id) !== 'other'));
  const height = insetOn ? g.height : g.mapHeight;
  const frameMid = inset ? [inset.frame.x + inset.frame.w / 2, inset.frame.y + inset.frame.h / 2] : [0, 0];
  const boxMid = inset ? [inset.box.x + inset.box.w / 2, inset.box.y + inset.box.h / 2] : [0, 0];
  // The leader runs from the frame's edge to the inset's nearest corner.
  const leader = inset
    ? (() => {
        const bx = boxMid[0] < frameMid[0] ? inset.box.x + inset.box.w : inset.box.x;
        const by = boxMid[1] < frameMid[1] ? inset.box.y + inset.box.h : inset.box.y;
        const fx = bx < frameMid[0] ? inset.frame.x : inset.frame.x + inset.frame.w;
        const fy = by < frameMid[1] ? inset.frame.y : inset.frame.y + inset.frame.h;
        return { x1: fx, y1: fy, x2: bx, y2: by };
      })()
    : null;

  return (
    <svg
      className={`cr-smap${className ? ' ' + className : ''}`}
      viewBox={`0 0 ${g.width} ${height}`}
      aria-hidden="true"
      focusable="false"
      data-region={regionId}
    >
      <defs>
        <clipPath id={`${uid}-land`}>
          <path d={g.land} />
        </clipPath>
        {insetOn && inset && (
          <>
            <clipPath id={`${uid}-box`}>
              <rect x={inset.box.x} y={inset.box.y} width={inset.box.w} height={inset.box.h} rx={3} />
            </clipPath>
            <clipPath id={`${uid}-iland`}>
              <path d={inset.land} />
            </clipPath>
          </>
        )}
      </defs>
      <path className="cr-smap__land" d={g.land} />
      <g clipPath={`url(#${uid}-land)`}>{shapes(g.shapes)}</g>
      <path className="cr-smap__coast" d={g.land} />
      {texts(g.shapes)}
      {insetOn && inset && leader && (
        <g className="cr-smap__inset">
          <rect className="cr-smap__frame" x={inset.frame.x} y={inset.frame.y} width={inset.frame.w} height={inset.frame.h} rx={1.5} />
          <line className="cr-smap__leader" {...leader} />
          <rect className="cr-smap__insetBg" x={inset.box.x} y={inset.box.y} width={inset.box.w} height={inset.box.h} rx={3} />
          <g clipPath={`url(#${uid}-box)`}>
            <path className="cr-smap__land" d={inset.land} />
            <g clipPath={`url(#${uid}-iland)`}>{shapes(inset.shapes)}</g>
            <path className="cr-smap__coast" d={inset.land} />
          </g>
          <rect className="cr-smap__insetEdge" x={inset.box.x} y={inset.box.y} width={inset.box.w} height={inset.box.h} rx={3} />
          {texts(inset.shapes)}
        </g>
      )}
    </svg>
  );
}
