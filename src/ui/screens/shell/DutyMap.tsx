// Valvekaart: the duty map behind the out-of-game screens (geometry in dutyMap.ts, colours in vk.css). A static
// SVG: its layers are built once per view and cached, the first time in idle time so the panels paint first;
// nothing on it moves. Decorative (aria-hidden): the panels and the legend say everything it shows.
import { memo, useEffect, useId, useState } from 'react';
import { t as translate, useLang } from '@/i18n';
import { sectorById } from '@/sim/sectors';
import type { Lang } from '@/sim/types';
import {
  baseMap,
  DESKTOP_VIEW,
  dutyOverlay,
  graticuleLabels,
  STRIP_VIEW,
  type BaseMap,
  type DutyInput,
  type DutyOverlay,
  type MapNameKey,
  type MapView,
  type SectorShape,
  type XY,
} from './dutyMap';

/** Where the full map sits on screen: its slice scale and offset, the left panel's edge and the challenge card. */
export interface MapLayout {
  scale: number;
  offX: number;
  offY: number;
  /** Screen x (px, from the map's left) where the map shows past the left panels. */
  left: number;
  /** The daily challenge card (screen px from the map's top left), for the leader to its mark. */
  card: { left: number; right: number; bottom: number } | null;
}

/** A sector's name, and its callout in capitals (short names whole, long ones by the sector's short form). */
function sectorNames(id: string, lang: Lang): { name: string; short: string } {
  const sec = sectorById(id);
  const name = sec ? sec.name[lang] || sec.name.et : id;
  return {
    name,
    short: name.length <= 14 ? name.toLocaleUpperCase(lang) : (sec?.short ?? name.toLocaleUpperCase(lang)),
  };
}

interface Built {
  base: BaseMap;
  overlay: DutyOverlay;
}

const built = new Map<string, Built>();

function build(view: MapView, input: DutyInput, lang: Lang, compact: boolean): Built {
  return {
    base: baseMap(view),
    overlay: dutyOverlay(
      view,
      input,
      { sector: (id) => sectorNames(id, lang), mineSub: translate('shell.map.yours', lang) },
      compact,
    ),
  };
}

/** The built map: at once when cached, else after the first paint (idle time). */
function useBuilt(view: MapView, input: DutyInput, lang: Lang, compact: boolean): Built | null {
  const key = `${compact}|${lang}|${JSON.stringify(input)}`;
  const [, setTick] = useState(0);
  const hit = built.get(key) ?? null;
  useEffect(() => {
    if (built.has(key)) return;
    let alive = true;
    const run = () => {
      if (!alive) return;
      built.set(key, build(view, input, lang, compact));
      if (built.size > 12) built.delete(built.keys().next().value!);
      setTick((n) => n + 1);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 400 });
      return () => {
        alive = false;
        window.cancelIdleCallback(id);
      };
    }
    const id = window.setTimeout(run, 30);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
    // `key` covers the view, the input, the language and the size.
  }, [key]);
  return hit;
}

export const DutyMap = memo(function DutyMap({
  variant,
  input,
  layout,
}: {
  variant: 'full' | 'strip';
  input: DutyInput;
  /** The full map's place on screen (degree labels, the challenge leader); none: neither is drawn. */
  layout?: MapLayout | null;
}) {
  const lang = useLang();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const full = variant === 'full';
  const view = full ? DESKTOP_VIEW : STRIP_VIEW;
  const map = useBuilt(view, input, lang, !full);
  const { width: w, height: h } = view;
  if (!map)
    return (
      <svg
        className={`vk-map vk-map--${variant} is-empty`}
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden="true"
        focusable="false"
      />
    );
  const { base, overlay } = map;
  const name = (k: MapNameKey) => translate(`shell.map.${k}`, lang);
  const clipId = (s: SectorShape) => `${uid}-c-${s.id}`;
  // One clip per sector (the challenge can be the player's own desk).
  const clipped = [
    ...new Map(
      [...overlay.mine, ...overlay.offered, ...(overlay.challenge ? [overlay.challenge] : [])]
        .filter((s) => s.clip)
        .map((s) => [s.id, s]),
    ).values(),
  ];
  const clipAttr = (s: SectorShape) => (s.clip ? `url(#${clipId(s)})` : undefined);

  // Degree labels and the leader need to know what the panels leave visible.
  let degrees: { text: string; x: number; y: number }[] = [];
  let leader: { x: number; y0: number; y1: number } | null = null;
  if (full && layout && layout.scale > 0) {
    const top = -layout.offY / layout.scale;
    degrees = graticuleLabels(base, top, (layout.left - layout.offX) / layout.scale);
    const pin = overlay.challengePin;
    const card = layout.card;
    if (pin && card) {
      const sx = pin[0] * layout.scale + layout.offX;
      const sy = pin[1] * layout.scale + layout.offY;
      if (sx > card.left + 16 && sx < card.right - 16 && sy > card.bottom + 24)
        leader = { x: pin[0], y0: pin[1] - 9, y1: (card.bottom - layout.offY) / layout.scale };
    }
  }
  const pin: XY | null = overlay.challengePin;

  return (
    <svg
      className={`vk-map vk-map--${variant}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={full ? 'xMidYMid slice' : 'xMidYMid meet'}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path id={`${uid}-land`} d={base.land} />
        <pattern
          id={`${uid}-hatch`}
          width={full ? 4 : 3}
          height={full ? 4 : 3}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect className="vk-map__hatch" width={full ? 1.1 : 0.9} height={full ? 4 : 3} />
        </pattern>
        {clipped.map((s) => (
          <clipPath key={s.id} id={clipId(s)}>
            <path d={s.clip!} />
          </clipPath>
        ))}
      </defs>
      <rect className="vk-map__sea" width={w} height={h} />
      {full && <path className="vk-map__grat" d={base.graticule} />}
      <g className="vk-map__waterlines">
        <use href={`#${uid}-land`} className="vk-map__wl vk-map__wl--3" />
        <use href={`#${uid}-land`} className="vk-map__wl-gap vk-map__wl--3" />
        <use href={`#${uid}-land`} className="vk-map__wl vk-map__wl--2" />
        <use href={`#${uid}-land`} className="vk-map__wl-gap vk-map__wl--2" />
        <use href={`#${uid}-land`} className="vk-map__wl vk-map__wl--1" />
        <use href={`#${uid}-land`} className="vk-map__wl-gap vk-map__wl--1" />
      </g>
      <path className="vk-map__nb" d={base.neighbours} />
      <path className="vk-map__nb-line" d={base.neighbourCoast} />
      <path className="vk-map__seam" d={base.border} />
      <use href={`#${uid}-land`} className="vk-map__land" />
      {input.home && <path className="vk-map__home" d={base.prefectures[input.home]} />}
      {input.whole.map((id) => (
        <path key={id} className="vk-map__whole" d={base.prefectures[id]} />
      ))}
      <path className="vk-map__lake" d={base.lakes} />
      {full && <path className="vk-map__road vk-map__road--local" d={base.roadsLocal} />}
      <path className="vk-map__road" d={base.roadsMain} />
      {full && input.home && <path className="vk-map__sector-line" d={base.countyLines[input.home]} />}
      <path className="vk-map__pref-line" d={base.prefLines} />
      {overlay.offered.map((s) => (
        <path
          key={s.id}
          className="vk-map__offer"
          d={s.d}
          fill={`url(#${uid}-hatch)`}
          clipPath={clipAttr(s)}
        />
      ))}
      {overlay.challenge && (
        <path className="vk-map__challenge" d={overlay.challenge.d} clipPath={clipAttr(overlay.challenge)} />
      )}
      <path className="vk-map__coast" d={base.coast} />
      <path className="vk-map__border" d={base.border} />
      {overlay.mine.map((s) => (
        <path
          key={s.id}
          className={`vk-map__mine${s.area > 2500 ? ' is-large' : ''}`}
          d={s.d}
          clipPath={clipAttr(s)}
        />
      ))}
      {leader && (
        <path
          className="vk-map__leader"
          d={`M${leader.x.toFixed(1)} ${leader.y0.toFixed(1)}V${leader.y1.toFixed(1)}`}
        />
      )}
      {pin && (
        <g className="vk-map__pin" transform={`translate(${pin[0].toFixed(1)} ${pin[1].toFixed(1)})`}>
          <circle r={full ? 8 : 6} />
          <circle r={full ? 2.8 : 2.2} />
        </g>
      )}
      <g className="vk-map__dots">
        {overlay.towns.map((tw) => (
          <circle
            key={tw.name}
            className={`is-size${tw.size}`}
            cx={tw.x.toFixed(1)}
            cy={tw.y.toFixed(1)}
            r={tw.size === 0 ? 3.1 : tw.size === 1 ? 2.5 : 1.9}
          />
        ))}
        {overlay.towns
          .filter((tw) => tw.size === 0 && full)
          .map((tw) => (
            <circle
              key={`${tw.name}-ring`}
              className="is-ring"
              cx={tw.x.toFixed(1)}
              cy={tw.y.toFixed(1)}
              r={6.2}
            />
          ))}
      </g>
      {full &&
        base.names
          .filter((n) => n.key === 'fi' || n.key === 'lv' || n.key === 'ru')
          .map((n) => (
            <text
              key={n.key}
              className="vk-map__country"
              x={n.x.toFixed(1)}
              y={n.y.toFixed(1)}
              transform={n.rotate ? `rotate(${n.rotate} ${n.x.toFixed(1)} ${n.y.toFixed(1)})` : undefined}
            >
              {name(n.key)}
            </text>
          ))}
      {base.names
        .filter(
          (n) =>
            n.key !== 'fi' &&
            n.key !== 'lv' &&
            n.key !== 'ru' &&
            (full || n.key === 'gulf' || n.key === 'riga'),
        )
        .map((n) => {
          const at = full ? n : stripWater(n.key, n);
          const words = n.key === 'peipus' ? splitLast(name(n.key)) : [name(n.key)];
          return (
            <text key={n.key} className="vk-map__water" x={at.x.toFixed(1)} y={at.y.toFixed(1)}>
              {words.map((word, i) => (
                <tspan key={i} x={at.x.toFixed(1)} dy={i ? 15 : 0}>
                  {word}
                </tspan>
              ))}
            </text>
          );
        })}
      {full &&
        base.regionLabels.map((r) => (
          <text key={r.id} className="vk-map__region" x={r.x.toFixed(1)} y={r.y.toFixed(1)}>
            {translate(`career.region.${r.id}.short`, lang)}
          </text>
        ))}
      {overlay.labels.map((l, i) => (
        <text
          key={`${l.kind}-${i}`}
          className={`vk-map__label is-${l.kind}`}
          x={l.x.toFixed(1)}
          y={l.y.toFixed(1)}
          textAnchor={l.anchor ?? 'start'}
        >
          {l.text}
        </text>
      ))}
      {degrees.map((d) => (
        <text key={d.text} className="vk-map__deg" x={d.x.toFixed(1)} y={d.y.toFixed(1)}>
          {d.text}
        </text>
      ))}
    </svg>
  );
});

/** The strip has room for two water names, placed for its own frame. */
function stripWater(key: MapNameKey, fallback: { x: number; y: number }): { x: number; y: number } {
  if (key === 'gulf') return { x: 96, y: 34 };
  if (key === 'riga') return { x: 120, y: 226 };
  return fallback;
}

function splitLast(s: string): string[] {
  const i = s.lastIndexOf(' ');
  return i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [s];
}
