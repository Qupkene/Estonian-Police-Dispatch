// Valvekaart: the duty map behind the out-of-game screens (geometry in dutyMap.ts, colours in vk.css). Static:
// its layers are built once per view and cached, the first time in idle time so the panels paint first; nothing
// on it moves. The shapes are painted once into a canvas (dutyMapCanvas.ts: a full-screen SVG of them cost
// seconds of raster on machines without GPU raster), the dots, pin and names go on top as SVG. Decorative
// (aria-hidden): the panels and the legend say everything it shows.
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { t as translate, useLang } from '@/i18n';
import { sectorById } from '@/sim/sectors';
import type { Lang } from '@/sim/types';
import {
  baseMap,
  challengeArea,
  DESKTOP_VIEW,
  dutyOverlay,
  graticuleLabels,
  STRIP_VIEW,
  type BaseMap,
  type DutyInput,
  type DutyOverlay,
  type LitArea,
  type MapNameKey,
  type MapView,
  type XY,
  viewKey,
} from './dutyMap';
import { frameOf, paintLit, paintMap, readColours } from './dutyMapCanvas';

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
  input: DutyInput;
  /** The challenge's area, for its own layer when the map has one (`lit`). */
  lit: LitArea | null;
}

const built = new Map<string, Built>();

/** Who holds a sector's desk ("Maarja Tamm"), for the colleagues' labels. */
function colleagueOf(id: string): string {
  const c = sectorById(id)?.colleague;
  return c ? `${c.firstName} ${c.lastName}`.trim() : '';
}

function build(
  view: MapView,
  input: DutyInput,
  lang: Lang,
  compact: boolean,
  who: string,
  offerWord: string,
): Built {
  const yours = translate('shell.map.yours', lang);
  const offer = offerWord || translate('shell.map.offer', lang);
  return {
    input,
    base: baseMap(view),
    lit: challengeArea(view, input.challenge),
    overlay: dutyOverlay(
      view,
      input,
      {
        sector: (id) => sectorNames(id, lang),
        mineSub: who ? `${yours} · ${who}` : yours,
        // Only the career screen names the colleagues; there the offer says whose desk it is too.
        offerSub: input.others ? (id) => [offer, colleagueOf(id)].filter(Boolean).join(' · ') : undefined,
        otherSub: colleagueOf,
      },
      compact,
    ),
  };
}

/** The built map: at once when cached, else after the first paint (idle time); meanwhile the last one built. */
function useBuilt(
  view: MapView,
  input: DutyInput,
  lang: Lang,
  compact: boolean,
  who: string,
  offerWord: string,
): Built | null {
  const key = `${viewKey(view)}|${compact}|${lang}|${who}|${offerWord}|${JSON.stringify(input)}`;
  const [, setTick] = useState(0);
  const last = useRef<Built | null>(null);
  const hit = built.get(key) ?? null;
  if (hit) last.current = hit;
  useEffect(() => {
    if (built.has(key)) return;
    let alive = true;
    const run = () => {
      if (!alive) return;
      built.set(key, build(view, input, lang, compact, who, offerWord));
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
  // A resized view keeps showing the previous map (stretched a little) until its own is built.
  return hit ?? (last.current && last.current.base.view.width > 0 ? last.current : null);
}

/** The box's size (CSS px) and the device pixel ratio, and a tick for each theme change: when to repaint. */
function usePaintTarget(ref: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState<{ w: number; h: number; dpr: number } | null>(null);
  const [theme, setTheme] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { w: Math.round(r.width), h: Math.round(r.height), dpr: window.devicePixelRatio || 1 };
      setBox((b) => (b && b.w === next.w && b.h === next.h && b.dpr === next.dpr ? b : next));
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    // Zoom changes the pixel ratio and fires a resize.
    window.addEventListener('resize', measure);
    const mo = new MutationObserver(() => setTheme((n) => n + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      mo.disconnect();
    };
  }, [ref]);
  return { box, theme };
}

/** Device px of the canvas at most (a 4K screen at 2x is 33 Mpx): past it the ratio is lowered. */
const MAX_CANVAS_PX = 16_000_000;

export const DutyMap = memo(function DutyMap({
  variant,
  input,
  layout,
  view: focus,
  who = '',
  offerWord = '',
  lit,
}: {
  variant: 'full' | 'strip';
  input: DutyInput;
  /** The full map's place on screen (degree labels, the challenge leader); none: neither is drawn. */
  layout?: MapLayout | null;
  /** A view of its own (fitView: a prefecture between a screen's panels) instead of the variant's whole country. */
  view?: MapView;
  /** The player's name under "sinu sektor" (the career screen). */
  who?: string;
  /** What the hatched sectors are, under their names (default "pakkumine"; the briefing: tonight's cover). */
  offerWord?: string;
  /**
   * The challenge on a layer of its own that is shown only while this is true (the menu's daily panel open),
   * stronger and faded in and out. Left out, the challenge is always on the map, quietly.
   */
  lit?: boolean;
}) {
  const lang = useLang();
  const full = variant === 'full';
  const view = focus ?? (full ? DESKTOP_VIEW : STRIP_VIEW);
  const map = useBuilt(view, input, lang, !full, who, offerWord);
  const { width: w, height: h } = map?.base.view ?? view;
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const litRef = useRef<HTMLCanvasElement>(null);
  const { box, theme } = usePaintTarget(rootRef);
  const litLayer = lit !== undefined;

  // The shapes, painted once per map, size, pixel ratio and theme (not on every render).
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root || !map || !box || box.w < 1 || box.h < 1) return;
    const dpr = Math.min(box.dpr, Math.sqrt(MAX_CANVAS_PX / (box.w * box.h)));
    const cw = Math.max(1, Math.round(box.w * dpr));
    const chh = Math.max(1, Math.round(box.h * dpr));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== chh) canvas.height = chh;
    // A canvas kept in memory, not on the GPU: painted once, then only composited (and no GPU raster needed).
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) return;
    const { width: vw, height: vh } = map.base.view;
    // With a lit layer the challenge is painted there, not under everything else.
    const overlay = litLayer ? { ...map.overlay, challenge: null } : map.overlay;
    paintMap(ctx, frameOf(vw, vh, cw, chh, full), map.base, overlay, map.input, full, readColours(root));
  }, [map, box, theme, full, litLayer]);

  // The lit layer covers only the challenge's area (CSS px in the box, a few px over for its edge).
  const litRect = useMemo(() => {
    if (!litLayer || !map?.lit || !box || box.w < 1 || box.h < 1) return null;
    const f = frameOf(map.base.view.width, map.base.view.height, box.w, box.h, full);
    const [x0, y0, x1, y1] = map.lit.box;
    const pad = 8;
    const left = Math.max(0, Math.floor(f.offX + x0 * f.scale - pad));
    const top = Math.max(0, Math.floor(f.offY + y0 * f.scale - pad));
    const right = Math.min(box.w, Math.ceil(f.offX + x1 * f.scale + pad));
    const bottom = Math.min(box.h, Math.ceil(f.offY + y1 * f.scale + pad));
    if (right - left < 1 || bottom - top < 1) return null;
    return { left, top, width: right - left, height: bottom - top, frame: f, dpr: box.dpr };
  }, [litLayer, map, box, full]);

  useLayoutEffect(() => {
    const canvas = litRef.current;
    const root = rootRef.current;
    if (!canvas || !root || !map?.lit || !litRect) return;
    const { dpr, frame: f } = litRect;
    const cw = Math.max(1, Math.round(litRect.width * dpr));
    const chh = Math.max(1, Math.round(litRect.height * dpr));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== chh) canvas.height = chh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const k = cw / litRect.width;
    const frame = {
      scale: f.scale * k,
      offX: (f.offX - litRect.left) * k,
      offY: (f.offY - litRect.top) * k,
    };
    paintLit(ctx, frame, map.lit, full, readColours(root));
  }, [map, litRect, theme, full]);

  if (!map)
    return (
      <div
        ref={rootRef}
        className={`vk-map vk-map--${variant} is-empty`}
        style={{ aspectRatio: `${w} / ${h}` }}
        aria-hidden="true"
      />
    );
  const { base, overlay } = map;
  const name = (k: MapNameKey) => translate(`shell.map.${k}`, lang);

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
  const label = (l: DutyOverlay['labels'][number], i: number) => (
    <text
      key={`${l.kind}-${i}`}
      className={`vk-map__label is-${l.kind}`}
      x={l.x.toFixed(1)}
      y={l.y.toFixed(1)}
      textAnchor={l.anchor ?? 'start'}
    >
      {l.text}
    </text>
  );
  // The challenge's marks: in the map's own ink, or on the lit layer above it.
  const marks = (
    <>
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
    </>
  );
  const viewBox = `0 0 ${w} ${h}`;
  const aspect = full ? 'xMidYMid slice' : 'xMidYMid meet';

  return (
    <div
      ref={rootRef}
      className={`vk-map vk-map--${variant}${litLayer ? ' has-lit' : ''}${lit ? ' is-lit' : ''}`}
      style={{ aspectRatio: `${w} / ${h}` }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="vk-map__canvas" />
      {litRect && (
        <canvas
          ref={litRef}
          className="vk-map__lit"
          style={{ left: litRect.left, top: litRect.top, width: litRect.width, height: litRect.height }}
        />
      )}
      <svg className="vk-map__ink" viewBox={viewBox} preserveAspectRatio={aspect} focusable="false">
        {!litLayer && marks}
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
            const at = full || focus ? n : stripWater(n.key, n);
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
        {overlay.labels.map((l, i) => (litLayer && l.kind === 'challenge' ? null : label(l, i)))}
        {degrees.map((d) => (
          <text key={d.text} className="vk-map__deg" x={d.x.toFixed(1)} y={d.y.toFixed(1)}>
            {d.text}
          </text>
        ))}
      </svg>
      {litLayer && (
        <svg
          className="vk-map__ink vk-map__litInk"
          viewBox={viewBox}
          preserveAspectRatio={aspect}
          focusable="false"
        >
          {marks}
          {overlay.labels.map((l, i) => (l.kind === 'challenge' ? label(l, i) : null))}
        </svg>
      )}
    </div>
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

/** The map with nothing of a player's on it (boot and sign-in): the country, its prefectures and towns. */
export const NO_DUTY: DutyInput = { mine: [], whole: [], offered: [], challenge: null, home: null };
