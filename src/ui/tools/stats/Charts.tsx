// Hand-written SVG charts for the Statistika tab. Token colours only; hover/focus tooltips; thin marks.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { areaPath, arcPath, donutAngles, linearScale, linePath, niceTicks, stack, timeTicks } from '../lib/chart';

// ── shared plumbing ──────────────────────────────────────────────────────────

export interface TipRow {
  color: string; // CSS colour (var(--…))
  label: string;
  value: string;
  line?: boolean; // key as a short line instead of a square
}
export interface Tip {
  x: number;
  y: number;
  title: string;
  rows: TipRow[];
}

export function useWidth<T extends HTMLElement>(fallback = 340): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.max(200, Math.floor(el.clientWidth)));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cw = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (cw > 0) setW(Math.max(200, cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const TIP_W = 168;

export function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  // Near the top there is no room above the mark: dock the tooltip beside it instead of over it.
  const side = tip.y < 24 + tip.rows.length * 18;
  const left = side
    ? tip.x < width / 2
      ? Math.min(tip.x + 14, Math.max(0, width - TIP_W))
      : Math.max(0, tip.x - TIP_W - 14)
    : Math.min(Math.max(tip.x - TIP_W / 2, 0), Math.max(0, width - TIP_W));
  return (
    <div className={`tl-tip${side ? ' is-side' : ''}`} style={{ left, top: side ? 4 : tip.y - 10, width: TIP_W }} role="status">
      <div className="tl-tip__title">{tip.title}</div>
      {tip.rows.map((r, i) => (
        <div key={i} className="tl-tip__row">
          <strong className="tl-tip__val">{r.value}</strong>
          <span className="tl-tip__label">
            <i className={r.line ? 'tl-key tl-key--line' : 'tl-key'} style={{ background: r.color }} />
            {r.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string; value?: string; line?: boolean }[] }) {
  return (
    <ul className="tl-legend" role="list">
      {items.map((it, i) => (
        <li key={i}>
          <i className={it.line ? 'tl-key tl-key--line' : 'tl-key'} style={{ background: it.color }} />
          <span>{it.label}</span>
          {it.value !== undefined && <b>{it.value}</b>}
        </li>
      ))}
    </ul>
  );
}

/** Path for a bar with 4px rounded top corners and a square base. */
function topRounded(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x} ${y + h} V${y + rr} Q${x} ${y} ${x + rr} ${y} H${x + w - rr} Q${x + w} ${y} ${x + w} ${y + rr} V${y + h} Z`;
}
/** Bar growing rightwards from the baseline with a rounded data-end. */
function rightRounded(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= 0) return '';
  const rr = Math.min(r, h / 2, w);
  return `M${x} ${y} H${x + w - rr} Q${x + w} ${y} ${x + w} ${y + rr} V${y + h - rr} Q${x + w} ${y + h} ${x + w - rr} ${y + h} H${x} Z`;
}

// ── stacked column chart (incidents per hour × priority) ────────────────────

export interface Series {
  key: string;
  label: string;
  color: string;
}

export function StackedBars({
  labels,
  rows,
  series,
  height = 160,
  yLabel,
  xLabel,
  tipTitle,
}: {
  labels: string[];
  rows: number[][]; // rows[i][k]
  series: Series[];
  height?: number;
  yLabel: string;
  xLabel: string;
  tipTitle: (i: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 30, r: 8, t: 20, b: 30 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const totals = rows.map((r) => r.reduce((a, b) => a + b, 0));
  const ticks = niceTicks(0, Math.max(1, ...totals), 4, true);
  const y = linearScale([0, ticks[ticks.length - 1]], [ih, 0]);
  const band = iw / Math.max(1, labels.length);
  const bw = Math.min(24, Math.max(4, band * 0.62));
  const stacked = stack(rows);
  const every = Math.ceil(labels.length / Math.max(1, Math.floor(iw / 30)));

  const show = (i: number) => {
    setHover(i);
    setTip({
      x: m.l + band * i + band / 2,
      y: m.t + y(totals[i]),
      title: tipTitle(i),
      rows: [...series.map((s, k) => ({ color: s.color, label: s.label, value: String(rows[i][k]) })).reverse()],
    });
  };

  return (
    <div className="tl-chart" ref={ref} onMouseLeave={() => (setTip(null), setHover(null))}>
      <svg width={width} height={height} role="img" aria-label={yLabel}>
        <g transform={`translate(${m.l},${m.t})`}>
          {ticks.map((tv) => (
            <g key={tv} transform={`translate(0,${y(tv)})`}>
              <line x1={0} x2={iw} className="tl-grid" />
              <text x={-6} dy="0.32em" className="tl-axis" textAnchor="end">
                {tv}
              </text>
            </g>
          ))}
          {stacked.map((segs, i) => {
            const x = band * i + (band - bw) / 2;
            const top = segs.reduce((last, _seg, k) => (rows[i][k] > 0 ? k : last), -1);
            return (
              <g key={i} className={hover !== null && hover !== i ? 'is-dim' : undefined}>
                {segs.map(([y0, y1], k) => {
                  if (y1 - y0 <= 0) return null;
                  const yTop = y(y1);
                  const h = y(y0) - yTop - (y0 > 0 ? 2 : 0);
                  return k === top ? (
                    <path key={k} d={topRounded(x, yTop, bw, Math.max(1, h))} style={{ fill: series[k].color }} />
                  ) : (
                    <rect key={k} x={x} y={yTop} width={bw} height={Math.max(1, h)} style={{ fill: series[k].color }} />
                  );
                })}
                <rect
                  className="tl-hit"
                  x={band * i}
                  y={0}
                  width={band}
                  height={ih}
                  tabIndex={0}
                  aria-label={`${tipTitle(i)}: ${totals[i]}`}
                  onMouseEnter={() => show(i)}
                  onFocus={() => show(i)}
                  onBlur={() => (setTip(null), setHover(null))}
                />
              </g>
            );
          })}
          <line x1={0} x2={iw} y1={ih} y2={ih} className="tl-baseline" />
          {labels.map((l, i) =>
            i % every === 0 ? (
              <text key={i} x={band * i + band / 2} y={ih + 14} className="tl-axis" textAnchor="middle">
                {l}
              </text>
            ) : null,
          )}
          <text x={iw} y={ih + 27} className="tl-axis tl-axis--title" textAnchor="end">
            {xLabel}
          </text>
          <text x={-m.l + 2} y={-11} className="tl-axis tl-axis--title">
            {yLabel}
          </text>
        </g>
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

// ── donut (part-to-whole) ────────────────────────────────────────────────────

export function Donut({
  items,
  centerLabel,
  shareFmt,
}: {
  items: { key: string; label: string; value: number; color: string }[];
  centerLabel: string;
  shareFmt: (share: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const size = 132;
  const r = size / 2;
  const angles = donutAngles(
    items.map((i) => i.value),
    0.035,
  );
  const total = items.reduce((a, b) => a + b.value, 0);
  return (
    <div className="tl-chart tl-donut" ref={ref} onMouseLeave={() => (setTip(null), setHover(null))}>
      <svg width={size} height={size} role="img" aria-label={centerLabel} className="tl-donut__svg">
        {items.map((it, i) => {
          const a = angles[i];
          if (a.share <= 0) return null;
          const show = () => {
            setHover(it.key);
            setTip({ x: r, y: 18, title: it.label, rows: [{ color: it.color, label: shareFmt(a.share), value: String(it.value) }] });
          };
          return (
            <path
              key={it.key}
              d={arcPath(r, r, r - 2, r - 20, a.a0, a.a1)}
              style={{ fill: it.color }}
              className={`tl-arc${hover && hover !== it.key ? ' is-dim' : ''}`}
              tabIndex={0}
              aria-label={`${it.label}: ${it.value}`}
              onMouseEnter={show}
              onFocus={show}
              onBlur={() => (setTip(null), setHover(null))}
            />
          );
        })}
        <text x={r} y={r - 2} textAnchor="middle" className="tl-donut__total">
          {total}
        </text>
        <text x={r} y={r + 14} textAnchor="middle" className="tl-axis">
          {centerLabel}
        </text>
      </svg>
      <Legend items={items.map((it) => ({ color: it.color, label: it.label, value: String(it.value) }))} />
      <Tooltip tip={tip} width={Math.min(width, size + 40)} />
    </div>
  );
}

// ── bullet chart (response vs SLA) ───────────────────────────────────────────

export interface BulletRow {
  key: string;
  label: ReactNode;
  value: number | null;
  target: number;
  tone: 'ok' | 'warn' | 'danger' | 'none';
  valueText: string;
  status: ReactNode;
  tipTitle: string;
  tipRows: TipRow[];
}

export function Bullets({ rows, axis }: { rows: BulletRow[]; axis: [string, string, string] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const labelW = 34;
  const valueW = 104;
  const tw = Math.max(80, width - labelW - valueW - 12);
  const rowH = 28;
  return (
    <div className="tl-chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <div className="tl-bullets">
        {rows.map((r, i) => {
          const x = linearScale([0, r.target * 2], [0, tw]);
          const v = r.value === null ? 0 : Math.min(r.value, r.target * 2);
          const over = r.value !== null && r.value > r.target * 2;
          const show = () => setTip({ x: labelW + x(v), y: i * rowH + 4, title: r.tipTitle, rows: r.tipRows });
          return (
            <div key={r.key} className="tl-bullet" style={{ height: rowH }}>
              <span className="tl-bullet__label" style={{ width: labelW }}>
                {r.label}
              </span>
              <svg width={tw} height={rowH} className="tl-bullet__svg" role="img" aria-label={`${r.tipTitle}: ${r.valueText}`}>
                <rect x={0} y={7} width={x(r.target)} height={14} className="tl-band tl-band--1" />
                <rect x={x(r.target)} y={7} width={x(r.target * 1.5) - x(r.target)} height={14} className="tl-band tl-band--2" />
                <rect x={x(r.target * 1.5)} y={7} width={tw - x(r.target * 1.5)} height={14} className="tl-band tl-band--3" />
                {r.value !== null && <path d={rightRounded(0, 10, Math.max(2, x(v)), 8)} className={`tl-bullet__bar tl-bullet__bar--${r.tone}`} />}
                {over && <path d={`M${tw - 7} 10 l5 4 l-5 4`} className="tl-bullet__over" />}
                <line x1={x(r.target)} x2={x(r.target)} y1={4} y2={24} className="tl-bullet__target" />
                <rect
                  className="tl-hit"
                  x={0}
                  y={0}
                  width={tw}
                  height={rowH}
                  tabIndex={0}
                  onMouseEnter={show}
                  onFocus={show}
                  onBlur={() => setTip(null)}
                />
              </svg>
              <span className="tl-bullet__value" style={{ width: valueW }}>
                {r.valueText}
                <span className="tl-bullet__status">{r.status}</span>
              </span>
            </div>
          );
        })}
        <div className="tl-bullet__axis" style={{ marginLeft: labelW + 6, width: tw }}>
          <span>{axis[0]}</span>
          <span>{axis[1]}</span>
          <span>{axis[2]}</span>
        </div>
      </div>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

// ── time series: stacked area & line, with crosshair ─────────────────────────

function useCrosshair(n: number) {
  const [idx, setIdx] = useState<number | null>(null);
  useEffect(() => {
    if (idx !== null && idx >= n) setIdx(n ? n - 1 : null);
  }, [n, idx]);
  const onKey = (e: KeyboardEvent) => {
    if (!n) return;
    if (e.key === 'ArrowRight') setIdx((i) => Math.min(n - 1, (i ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, (i ?? n) - 1));
    else if (e.key === 'Escape') setIdx(null);
    else return;
    e.preventDefault();
  };
  return { idx, setIdx, onKey };
}

export function StackedArea({
  times,
  rows,
  series,
  height = 160,
  timeLabel,
  yLabel,
}: {
  times: number[];
  rows: number[][];
  series: Series[];
  height?: number;
  timeLabel: (t: number) => string;
  yLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { idx, setIdx, onKey } = useCrosshair(times.length);
  const m = { l: 30, r: 10, t: 20, b: 24 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const t0 = times[0] ?? 0;
  const t1 = times.length > 1 ? times[times.length - 1] : t0 + 1;
  const x = linearScale([t0, t1], [0, iw]);
  const totals = rows.map((r) => r.reduce((a, b) => a + b, 0));
  const ticks = niceTicks(0, Math.max(1, ...totals), 4, true);
  const y = linearScale([0, ticks[ticks.length - 1]], [ih, 0]);
  const st = stack(rows);
  const xt = timeTicks(t0, t1, Math.max(2, Math.min(6, Math.floor(iw / 64))));

  const pick = (clientX: number, el: SVGSVGElement) => {
    const rx = clientX - el.getBoundingClientRect().left - m.l;
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(x(times[i]) - rx) < Math.abs(x(times[best]) - rx)) best = i;
    setIdx(best);
  };

  const tip: Tip | null =
    idx !== null && times[idx] !== undefined
      ? {
          x: m.l + x(times[idx]),
          y: m.t + y(totals[idx]),
          title: timeLabel(times[idx]),
          rows: series.map((s, k) => ({ color: s.color, label: s.label, value: String(rows[idx][k]) })).reverse(),
        }
      : null;

  return (
    <div className="tl-chart" ref={ref} tabIndex={0} onKeyDown={onKey} onBlur={() => setIdx(null)} aria-label={yLabel}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={yLabel}
        onMouseMove={(e) => pick(e.clientX, e.currentTarget)}
        onMouseLeave={() => setIdx(null)}
      >
        <g transform={`translate(${m.l},${m.t})`}>
          {ticks.map((tv) => (
            <g key={tv} transform={`translate(0,${y(tv)})`}>
              <line x1={0} x2={iw} className="tl-grid" />
              <text x={-6} dy="0.32em" className="tl-axis" textAnchor="end">
                {tv}
              </text>
            </g>
          ))}
          {series.map((s, k) => {
            const top = st.map((r, i) => [x(times[i]), y(r[k][1])] as [number, number]);
            const bot = st.map((r, i) => [x(times[i]), y(r[k][0])] as [number, number]);
            return (
              <g key={s.key}>
                <path d={areaPath(top, bot)} style={{ fill: s.color }} className="tl-area" />
                <path d={linePath(top)} style={{ stroke: s.color }} className="tl-area__edge" />
              </g>
            );
          })}
          <line x1={0} x2={iw} y1={ih} y2={ih} className="tl-baseline" />
          {xt.map((tv, i) => (
            <text key={i} x={x(tv)} y={ih + 15} className="tl-axis" textAnchor={x(tv) < 16 ? 'start' : x(tv) > iw - 16 ? 'end' : 'middle'}>
              {timeLabel(tv)}
            </text>
          ))}
          <text x={-m.l + 2} y={-11} className="tl-axis tl-axis--title">
            {yLabel}
          </text>
          {idx !== null && times[idx] !== undefined && <line x1={x(times[idx])} x2={x(times[idx])} y1={0} y2={ih} className="tl-crosshair" />}
        </g>
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

export function LineChart({
  times,
  values,
  domain,
  color,
  height = 130,
  timeLabel,
  valueLabel,
  seriesLabel,
}: {
  times: number[];
  values: number[];
  domain: [number, number];
  color: string;
  height?: number;
  timeLabel: (t: number) => string;
  valueLabel: (v: number) => string;
  seriesLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { idx, setIdx, onKey } = useCrosshair(times.length);
  const m = { l: 30, r: 34, t: 10, b: 24 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const t0 = times[0] ?? 0;
  const t1 = times.length > 1 ? times[times.length - 1] : t0 + 1;
  const x = linearScale([t0, t1], [0, iw]);
  const y = linearScale(domain, [ih, 0]);
  const ticks = niceTicks(domain[0], domain[1], 4);
  const pts = times.map((tt, i) => [x(tt), y(values[i])] as [number, number]);
  const xt = timeTicks(t0, t1, Math.max(2, Math.min(6, Math.floor(iw / 64))));
  const last = pts[pts.length - 1];

  const pick = (clientX: number, el: SVGSVGElement) => {
    const rx = clientX - el.getBoundingClientRect().left - m.l;
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(x(times[i]) - rx) < Math.abs(x(times[best]) - rx)) best = i;
    setIdx(best);
  };
  const tip: Tip | null =
    idx !== null && pts[idx]
      ? { x: m.l + pts[idx][0], y: m.t + pts[idx][1], title: timeLabel(times[idx]), rows: [{ color, label: seriesLabel, value: valueLabel(values[idx]), line: true }] }
      : null;

  return (
    <div className="tl-chart" ref={ref} tabIndex={0} onKeyDown={onKey} onBlur={() => setIdx(null)} aria-label={seriesLabel}>
      <svg width={width} height={height} role="img" aria-label={seriesLabel} onMouseMove={(e) => pick(e.clientX, e.currentTarget)} onMouseLeave={() => setIdx(null)}>
        <g transform={`translate(${m.l},${m.t})`}>
          {ticks.map((tv) => (
            <g key={tv} transform={`translate(0,${y(tv)})`}>
              <line x1={0} x2={iw} className="tl-grid" />
              <text x={-6} dy="0.32em" className="tl-axis" textAnchor="end">
                {tv}
              </text>
            </g>
          ))}
          {pts.length > 1 && <path d={areaPath(pts, pts.map(([px]) => [px, ih] as [number, number]))} style={{ fill: color }} className="tl-wash" />}
          {pts.length > 1 && <path d={linePath(pts)} style={{ stroke: color }} className="tl-line" />}
          {last && (
            <>
              <circle cx={last[0]} cy={last[1]} r={4} style={{ fill: color }} className="tl-dot-end" />
              <text x={last[0] + 7} y={last[1]} dy="0.32em" className="tl-axis tl-axis--strong">
                {valueLabel(values[values.length - 1])}
              </text>
            </>
          )}
          {xt.map((tv, i) => (
            <text key={i} x={x(tv)} y={ih + 15} className="tl-axis" textAnchor={x(tv) < 16 ? 'start' : x(tv) > iw - 16 ? 'end' : 'middle'}>
              {timeLabel(tv)}
            </text>
          ))}
          {idx !== null && pts[idx] && (
            <>
              <line x1={pts[idx][0]} x2={pts[idx][0]} y1={0} y2={ih} className="tl-crosshair" />
              <circle cx={pts[idx][0]} cy={pts[idx][1]} r={4} style={{ fill: color }} className="tl-dot-end" />
            </>
          )}
        </g>
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

// ── horizontal bar list (top areas) ──────────────────────────────────────────

export function BarList({ items, color }: { items: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="tl-barlist" role="list">
      {items.map((it) => (
        <li key={it.label}>
          <span className="tl-barlist__label" title={it.label}>
            {it.label}
          </span>
          <span className="tl-barlist__track">
            <span className="tl-barlist__bar" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </span>
          <b className="tl-barlist__val">{it.value}</b>
        </li>
      ))}
    </ul>
  );
}
