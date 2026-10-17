// Hand-written SVG charts for the career screen (no chart deps).
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { clamp, columnPath, linePath, linearScale, niceTicks } from './helpers';

/** Width of an element, tracked with ResizeObserver. */
function useWidth<T extends HTMLElement>(fallback = 320): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(120, Math.round(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ── Column chart: last shift scores (0..100) ─────────────────────────────────────────────────

export interface ScorePoint {
  key: string;
  score: number;
  label: string;
  sub?: string;
}

export function ScoreColumns({ data, height = 92, ariaLabel }: { data: ScorePoint[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 26;
  const padR = 4;
  const padT = 8;
  const padB = 6;
  const plotW = Math.max(40, width - padL - padR);
  const baseY = height - padB;
  const y = linearScale(0, 100, baseY, padT);
  const n = Math.max(data.length, 1);
  const slot = plotW / n;
  const bw = Math.max(4, Math.min(24, slot * 0.62));
  const last = data.length - 1;

  return (
    <div className="cr-chart" ref={ref} onPointerLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line className="cr-chart__grid" x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} />
            <text className="cr-chart__tick" x={padL - 6} y={y(v) + 3} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          return (
            <g key={d.key}>
              <path
                className={`cr-chart__col${i === last ? ' is-current' : ''}${hover === i ? ' is-hover' : ''}`}
                d={columnPath(x, y(clamp(d.score, 0, 100)), bw, baseY)}
              />
              <rect
                className="cr-chart__hit"
                x={padL + i * slot}
                y={padT}
                width={slot}
                height={baseY - padT}
                tabIndex={0}
                aria-label={`${d.label}: ${Math.round(d.score)}`}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="cr-chart__tip"
          style={{ left: clamp(padL + hover * slot + slot / 2, 50, width - 50), top: Math.max(0, y(data[hover].score) - 8) }}
        >
          <strong>{Math.round(data[hover].score)}</strong>
          <span>{data[hover].label}</span>
          {data[hover].sub && <span className="cr-chart__tipsub">{data[hover].sub}</span>}
        </div>
      )}
    </div>
  );
}

// ── Line chart: running balance ──────────────────────────────────────────────────────────────

export function BalanceLine({
  series,
  height = 220,
  fmtY,
  fmtTip,
  fmtX,
  ariaLabel,
}: {
  series: { day: number; balance: number }[];
  height?: number;
  fmtY: (v: number) => string;
  fmtTip: (v: number) => string;
  fmtX: (day: number) => string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const [hover, setHover] = useState<number | null>(null);
  const padL = 52;
  const padR = 16;
  const padT = 14;
  const padB = 24;
  const days = series.map((p) => p.day);
  const vals = series.map((p) => p.balance);
  const ticks = niceTicks(Math.min(...vals, vals.length ? vals[0] : 0), Math.max(...vals, 0), 4);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const x = linearScale(Math.min(...days), Math.max(...days), padL, width - padR);
  const y = linearScale(y0, y1, height - padB, padT);
  const pts: [number, number][] = series.map((p) => [series.length === 1 ? (padL + width - padR) / 2 : x(p.day), y(p.balance)]);
  const area = pts.length ? `${linePath(pts)} L${pts[pts.length - 1][0].toFixed(1)} ${height - padB} L${pts[0][0].toFixed(1)} ${height - padB} Z` : '';
  const xTicks = pickXTicks(days, Math.max(2, Math.floor((width - padL - padR) / 70)));
  const lastPt = pts[pts.length - 1];

  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bd = Infinity;
    pts.forEach(([qx], i) => {
      const d = Math.abs(qx - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <div className="cr-chart" ref={ref} onPointerLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((v) => (
          <g key={v}>
            <line className={`cr-chart__grid${v === 0 && y0 < 0 ? ' is-zero' : ''}`} x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} />
            <text className="cr-chart__tick" x={padL - 8} y={y(v) + 3} textAnchor="end">
              {fmtY(v)}
            </text>
          </g>
        ))}
        {xTicks.map((d) => (
          <text key={d} className="cr-chart__tick" x={x(d)} y={height - 6} textAnchor="middle">
            {fmtX(d)}
          </text>
        ))}
        {pts.length > 1 && <path className="cr-chart__area" d={area} />}
        {pts.length > 1 && <path className="cr-chart__line" d={linePath(pts)} />}
        {hover !== null && pts[hover] && <line className="cr-chart__cross" x1={pts[hover][0]} x2={pts[hover][0]} y1={padT} y2={height - padB} />}
        {lastPt && <circle className="cr-chart__dot" cx={lastPt[0]} cy={lastPt[1]} r={4.5} />}
        {hover !== null && pts[hover] && hover !== pts.length - 1 && <circle className="cr-chart__dot" cx={pts[hover][0]} cy={pts[hover][1]} r={4.5} />}
        <rect
          className="cr-chart__hit"
          x={padL}
          y={padT}
          width={Math.max(0, width - padL - padR)}
          height={Math.max(0, height - padT - padB)}
          onPointerMove={onMove}
          onPointerDown={onMove}
        />
      </svg>
      {hover !== null && series[hover] && (
        <div className="cr-chart__tip" style={{ left: clamp(pts[hover][0], 70, width - 70), top: Math.max(0, pts[hover][1] - 10) }}>
          <strong>{fmtTip(series[hover].balance)}</strong>
          <span>{fmtX(series[hover].day)}</span>
        </div>
      )}
    </div>
  );
}

function pickXTicks(days: number[], max: number): number[] {
  if (!days.length) return [];
  const lo = Math.min(...days);
  const hi = Math.max(...days);
  if (hi === lo) return [lo];
  const step = Math.max(1, Math.ceil((hi - lo) / max));
  const out: number[] = [];
  for (let d = lo; d <= hi; d += step) out.push(d);
  if (out[out.length - 1] !== hi && hi - out[out.length - 1] > step / 2) out.push(hi);
  return out;
}

// ── Semicircle gauge: Staatus (0..100) ───────────────────────────────────────────────────────

export function Gauge({ value, tone, label, size = 168 }: { value: number; tone: string; label: string; size?: number }) {
  const v = clamp(value, 0, 100);
  const stroke = 12;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const h = cy + stroke / 2 + 2;
  const pt = (f: number): [number, number] => {
    const a = Math.PI * (1 - f);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const [sx, sy] = pt(0);
  const [ex, ey] = pt(1);
  const [vx, vy] = pt(v / 100);
  const arc = (x2: number, y2: number) => `M${sx.toFixed(2)} ${sy.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  return (
    <svg className={`cr-gauge cr-gauge--${tone}`} width={size} height={h} viewBox={`0 0 ${size} ${h}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <path className="cr-gauge__track" d={arc(ex, ey)} strokeWidth={stroke} />
      {v > 0.5 && <path className="cr-gauge__fill" d={arc(vx, vy)} strokeWidth={stroke} />}
      {[25, 50, 75].map((m) => {
        const a = Math.PI * (1 - m / 100);
        const r1 = r - stroke / 2 - 3;
        const r2 = r1 - 6;
        return (
          <line
            key={m}
            className="cr-gauge__mark"
            x1={cx + r1 * Math.cos(a)}
            y1={cy - r1 * Math.sin(a)}
            x2={cx + r2 * Math.cos(a)}
            y2={cy - r2 * Math.sin(a)}
          />
        );
      })}
    </svg>
  );
}
