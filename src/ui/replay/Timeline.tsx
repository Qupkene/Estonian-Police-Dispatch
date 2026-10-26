// Kordus (2.39.0, docs/REPLAY.md): the replay's timeline. Lanes for the report's moments, the 112 calls, the crews sent
// and the pursuits, the open incidents as a curve below them, the crisis as a band, what was not recorded hatched. A
// click jumps there (and shows the mark's incident), a drag scrubs; the parent moves the playhead every frame.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { t as tr } from '@/i18n';
import { loadCurve, replaySpan } from '@/sim/replayFrame';
import type { ReplayIncident, ReplayMark, ShiftReplay } from '@/sim/replay';
import { hhmm, HOUR } from '@/sim/time';
import type { Lang, LngLat } from '@/sim/types';

type Lane = 'moments' | 'calls' | 'sends' | 'pursuits' | 'load';
const LANES: { id: Lane; h: number }[] = [
  { id: 'moments', h: 16 },
  { id: 'calls', h: 22 },
  { id: 'sends', h: 22 },
  { id: 'pursuits', h: 20 },
  { id: 'load', h: 34 },
];
const AXIS_H = 18;
const TOP: Record<Lane, number> = (() => {
  const out = {} as Record<Lane, number>;
  let y = 0;
  for (const l of LANES) {
    out[l.id] = y;
    y += l.h;
  }
  return out;
})();
const LANES_H = LANES.reduce((a, l) => a + l.h, 0);
export const TIMELINE_H = LANES_H + AXIS_H;
/** How near (px) the pointer must be to a mark to point at it. */
const HIT_PX = 6;

/** A jump's mark: its incident (and crew) are shown, or the map goes to a place (the crisis). */
export interface JumpOpts {
  inc?: string;
  unit?: string;
  at?: LngLat;
}

interface Hit {
  x: number;
  lane: Lane;
  mark: ReplayMark;
}

interface Props {
  rep: ShiftReplay;
  lang: Lang;
  headRef: RefObject<HTMLDivElement | null>;
  /** The time the playhead shows now (for the slider's value). */
  now: number;
  selectedInc?: string;
  /** A drag goes on: the frame moves without starting over. */
  onScrub: (t: number) => void;
  /** A click or the end of a drag: the frame starts over at t. */
  onJump: (t: number, o?: JumpOpts) => void;
}

/** A click on a mark lands this long before it, so it happens on screen (as the previous and next buttons do). */
const LEAD_MS = 5_000;

export function Timeline({ rep, lang, headRef, now, selectedInc, onScrub, onJump }: Props) {
  const T = (k: string, v?: Record<string, string | number>) => tr(k, lang, v);
  const trackRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<{ x: number; t: number; hit: Hit | null } | null>(null);
  const drag = useRef<{ id: number; moved: boolean; x0: number } | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, Math.round(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(200, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const span = useMemo(() => replaySpan(rep), [rep]);
  const x = (t: number) => ((t - span.t0) / (span.t1 - span.t0)) * w;
  const tAt = (px: number) => span.t0 + (Math.max(0, Math.min(w, px)) / w) * (span.t1 - span.t0);
  const incs = useMemo(() => new Map(rep.incidents.map((i) => [i.id, i])), [rep]);

  // Marks with their x, per lane (rebuilt when the width changes).
  const hits = useMemo(() => {
    const out: Record<Lane, Hit[]> = { moments: [], calls: [], sends: [], pursuits: [], load: [] };
    for (const m of rep.marks) {
      const lane: Lane | null =
        m.k === 'good' || m.k === 'bad' || m.k === 'crisis' ? 'moments' : m.k === 'call' ? 'calls' : m.k === 'send' ? 'sends' : m.k === 'pursuit' ? 'pursuits' : null;
      if (lane) out[lane].push({ x: x(m.t), lane, mark: m });
    }
    return out;
  }, [rep, w, span]);

  const curve = useMemo(() => {
    const n = Math.max(20, Math.min(400, Math.round(w / 4)));
    const c = loadCurve(rep, n);
    const max = Math.max(1, ...c);
    const h = LANES.find((l) => l.id === 'load')!.h - 6;
    const y0 = TOP.load + LANES.find((l) => l.id === 'load')!.h - 2;
    const step = w / n;
    let d = `M0 ${y0}`;
    c.forEach((v, i) => {
      const y = y0 - (v / max) * h;
      d += `L${(i * step).toFixed(1)} ${y.toFixed(1)}L${((i + 1) * step).toFixed(1)} ${y.toFixed(1)}`;
    });
    return { d: `${d}L${w} ${y0}Z`, max };
  }, [rep, w]);

  const ticks = useMemo(() => {
    const hours = (span.t1 - span.t0) / HOUR;
    const every = hours > 10 ? 2 : 1;
    const out: number[] = [];
    // Whole hours of the Tallinn clock: hhmm() of a whole hour ends in ':00'.
    let t = Math.ceil(span.t0 / (HOUR / 2)) * (HOUR / 2);
    for (; t <= span.t1; t += HOUR / 2) if (hhmm(t).endsWith(':00') && Number(hhmm(t).slice(0, 2)) % every === 0) out.push(t);
    return out;
  }, [span]);

  /** The mark under the pointer: in the lane at y, the nearest within HIT_PX. */
  const hitAt = (px: number, py: number): Hit | null => {
    const lane = LANES.find((l) => py >= TOP[l.id] && py < TOP[l.id] + l.h)?.id;
    if (!lane || lane === 'load') return null;
    let best: Hit | null = null;
    let bestD = HIT_PX;
    for (const h of hits[lane]) {
      const m = h.mark;
      const d = m.k === 'pursuit' && m.t1 !== undefined && px >= h.x && px <= x(m.t1) ? 0 : Math.abs(h.x - px);
      if (d <= bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  };

  const local = (e: ReactPointerEvent) => {
    const r = trackRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const { px } = local(e);
    drag.current = { id: e.pointerId, moved: false, x0: px };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
    onScrub(tAt(px));
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const { px, py } = local(e);
    const d = drag.current;
    if (d && d.id === e.pointerId) {
      if (Math.abs(px - d.x0) > 3) d.moved = true;
      onScrub(tAt(px));
      setHover({ x: Math.max(0, Math.min(w, px)), t: tAt(px), hit: null });
      return;
    }
    setHover({ x: Math.max(0, Math.min(w, px)), t: tAt(px), hit: hitAt(px, py) });
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const { px, py } = local(e);
    const hit = d.moved ? null : hitAt(px, py);
    if (hit) {
      const m = hit.mark;
      const t0 = Math.max(rep.from, m.t - LEAD_MS);
      if (m.k === 'crisis' && rep.crisis) onJump(t0, { at: rep.crisis.center });
      else onJump(t0, { inc: m.inc, unit: m.k === 'send' ? m.unit : undefined });
    } else onJump(tAt(px));
  };

  const tip = hover ? tipOf(hover, incs, rep, T, lang) : null;
  const missing: [number, number][] = [
    ...(rep.from > span.t0 + 30_000 ? ([[span.t0, rep.from]] as [number, number][]) : []),
    ...(rep.gaps ?? []),
  ];

  return (
    <div className="rp-tl" data-testid="replay-timeline">
      <ul className="rp-tl__labels" aria-hidden="true">
        {LANES.map((l) => (
          <li key={l.id} style={{ height: l.h }} className={`rp-tl__label rp-tl__label--${l.id}`}>
            {T(`replay.lane.${l.id}`)}
          </li>
        ))}
      </ul>
      <div
        ref={trackRef}
        className="rp-tl__track"
        role="slider"
        tabIndex={0}
        aria-label={T('replay.timeline')}
        aria-valuemin={span.t0}
        aria-valuemax={span.t1}
        aria-valuenow={Math.round(now)}
        aria-valuetext={T('replay.timeline.value', { time: hhmm(now) })}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => !drag.current && setHover(null)}
      >
        <svg className="rp-tl__svg" width={w} height={TIMELINE_H} viewBox={`0 0 ${w} ${TIMELINE_H}`} aria-hidden="true">
          <defs>
            <pattern id="rp-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="rp-tl__hatchBg" />
              <line x1="0" y1="0" x2="0" y2="6" className="rp-tl__hatch" />
            </pattern>
          </defs>
          {LANES.map((l, i) =>
            i ? <line key={l.id} x1={0} x2={w} y1={TOP[l.id] + 0.5} y2={TOP[l.id] + 0.5} className="rp-tl__sep" /> : null,
          )}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t) + 0.5} x2={x(t) + 0.5} y1={0} y2={LANES_H} className="rp-tl__hour" />
              <text
                x={x(t) > w - 44 ? x(t) - 4 : x(t) + 4}
                y={LANES_H + 13}
                className="rp-tl__axis"
                textAnchor={x(t) > w - 44 ? 'end' : 'start'}
              >
                {hhmm(t)}
              </text>
            </g>
          ))}
          {rep.crisis && (
            <g className="rp-tl__crisis">
              <rect x={x(rep.crisis.t0)} y={0} width={Math.max(3, x(rep.crisis.t1 ?? rep.to) - x(rep.crisis.t0))} height={LANES_H} />
              <text x={x(rep.crisis.t0) + 4} y={11}>
                {T('replay.crisis')}
              </text>
            </g>
          )}
          {rep.to > rep.end + 60_000 && rep.end > span.t0 && (
            <line x1={x(rep.end)} x2={x(rep.end)} y1={0} y2={LANES_H} className="rp-tl__planEnd">
              <title>{T('replay.planEnd')}</title>
            </line>
          )}
          <path d={curve.d} className="rp-tl__load" />
          {hits.moments.map((h, i) => (
            <path
              key={`m${i}`}
              d={`M${h.x} ${TOP.moments + 3}l5 5l-5 5l-5-5z`}
              className={`rp-tl__moment is-${h.mark.k}${h.mark.inc && h.mark.inc === selectedInc ? ' is-sel' : ''}`}
            />
          ))}
          {hits.calls.map((h, i) => {
            const inc = incs.get(h.mark.inc ?? '');
            return (
              <rect
                key={`c${i}`}
                x={h.x - 1.25}
                y={TOP.calls + 4}
                width={2.5}
                height={14}
                rx={1}
                className={`rp-tl__call rp-p${inc?.truePriority ?? 3}${h.mark.miss ? ' is-miss' : ''}${h.mark.inc === selectedInc ? ' is-sel' : ''}`}
              />
            );
          })}
          {hits.sends.map((h, i) => (
            <circle
              key={`s${i}`}
              cx={h.x}
              cy={TOP.sends + 11}
              r={h.mark.inc === selectedInc ? 3.6 : 2.6}
              className={`rp-tl__send${h.mark.seat !== undefined ? ` rp-seat-${h.mark.seat % 4}` : ''}${h.mark.inc === selectedInc ? ' is-sel' : ''}`}
            />
          ))}
          {hits.pursuits.map((h, i) => (
            <rect
              key={`p${i}`}
              x={h.x}
              y={TOP.pursuits + 5}
              width={Math.max(4, x(h.mark.t1 ?? h.mark.t) - h.x)}
              height={10}
              rx={3}
              className={`rp-tl__pursuit${h.mark.inc === selectedInc ? ' is-sel' : ''}`}
            />
          ))}
          {missing.map(([a, b], i) => (
            <g key={`g${i}`} className="rp-tl__gap">
              <rect x={x(a)} y={0} width={Math.max(2, x(b) - x(a))} height={LANES_H} fill="url(#rp-hatch)" />
              {x(b) - x(a) > 90 && (
                <text x={x(a) + 6} y={TOP.calls + 15}>
                  {T('replay.gap')}
                </text>
              )}
            </g>
          ))}
        </svg>
        {hover && <div className="rp-tl__hover" style={{ transform: `translateX(${hover.x}px)` }} aria-hidden="true" />}
        <div ref={headRef} className="rp-tl__head" aria-hidden="true">
          <span className="rp-tl__knob" />
        </div>
        {tip && (
          <div
            className="rp-tl__tip"
            role="tooltip"
            style={{ left: Math.max(8, Math.min(w - 260, (hover?.x ?? 0) - 120)) }}
          >
            <b className="rp-mono">{tip.time}</b> {tip.text}
          </div>
        )}
      </div>
    </div>
  );
}

function tipOf(
  h: { t: number; hit: Hit | null },
  incs: Map<string, ReplayIncident>,
  rep: ShiftReplay,
  T: (k: string, v?: Record<string, string | number>) => string,
  lang: Lang,
): { time: string; text: string } {
  const m = h.hit?.mark;
  if (!m) return { time: hhmm(h.t), text: '' };
  const inc = m.inc ? incs.get(m.inc) : undefined;
  const title = inc ? `P${inc.truePriority} ${inc.title[lang] || inc.title.et}` : '';
  const seat = m.seat !== undefined ? rep.seats?.find((x) => x.seat === m.seat)?.name : undefined;
  const who = seat ? ` · ${T('replay.tip.seat', { name: seat })}` : '';
  switch (m.k) {
    case 'call':
      return { time: hhmm(m.t), text: `${T(m.miss ? 'replay.tip.missed' : 'replay.tip.call')} · ${title}${who}` };
    case 'send': {
      const u = rep.units.find((x) => x.id === m.unit);
      return { time: hhmm(m.t), text: `${T('replay.tip.send', { unit: u?.callsign ?? '' })} · ${title}${who}` };
    }
    case 'pursuit': {
      const pu = inc?.pu?.find((q) => q.t0 === m.t);
      const end = pu?.end ? ` · ${T(`replay.end.${pu.end}`)}` : '';
      return {
        time: '',
        text: `${T('replay.tip.pursuit', { from: hhmm(m.t), to: hhmm(m.t1 ?? m.t) })} · ${title}${end}`,
      };
    }
    case 'good':
    case 'bad':
      return { time: hhmm(m.t), text: `${T(`replay.tip.${m.k}`)} · ${title}` };
    case 'crisis':
      return { time: hhmm(m.t), text: `${T('replay.crisis')} · ${rep.crisis?.address ?? ''}` };
    default:
      return { time: hhmm(m.t), text: title };
  }
}
