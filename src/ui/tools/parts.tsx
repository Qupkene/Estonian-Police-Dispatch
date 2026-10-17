// Small shared visual pieces for the tool panels.
import type { ReactNode } from 'react';
import type { Citizenship } from '@/sim/types';
import { Icon, type IconName } from '@/ui/components';
import { formatPlate, type FlagLike } from './lib/helpers';
import { useTx } from '@/i18n';
import './tools.css';

// ── Estonian licence plate ───────────────────────────────────────────────────

const STAR_RING = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return [6 + Math.sin(a) * 4, 6 - Math.cos(a) * 4] as const;
});

/** White EU plate with the blue EST strip and the 12-star circle. */
export function Plate({ plate, size = 'md', className }: { plate: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={`tl-plate tl-plate--${size}${className ? ' ' + className : ''}`} aria-label={plate}>
      <span className="tl-plate__eu" aria-hidden="true">
        <svg viewBox="0 0 12 12" className="tl-plate__stars">
          {STAR_RING.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={0.75} />
          ))}
        </svg>
        <span className="tl-plate__est">EST</span>
      </span>
      <span className="tl-plate__chars">{formatPlate(plate)}</span>
    </span>
  );
}

// ── Citizenship flags (hand-drawn, emoji flags do not render on Windows) ─────

const STRIPES: Partial<Record<Citizenship, string[]>> = {
  EST: ['--tl-flag-est-blue', '--tl-flag-black', '--tl-flag-white'],
  RUS: ['--tl-flag-white', '--tl-flag-rus-blue', '--tl-flag-rus-red'],
  UKR: ['--tl-flag-ukr-blue', '--tl-flag-ukr-yellow'],
  LTU: ['--tl-flag-ltu-yellow', '--tl-flag-ltu-green', '--tl-flag-ltu-red'],
};

export function CountryFlag({ code, size = 18 }: { code: Citizenship | string; size?: number }) {
  const w = size;
  const h = Math.round(size * (2 / 3));
  const v = (name: string) => ({ fill: `var(${name})` });
  let body: ReactNode;
  const stripes = STRIPES[code as Citizenship];
  if (stripes) {
    const sh = 12 / stripes.length;
    body = stripes.map((c, i) => <rect key={i} x={0} y={i * sh} width={18} height={sh + 0.05} style={v(c)} />);
  } else if (code === 'LVA') {
    body = (
      <>
        <rect width={18} height={12} style={v('--tl-flag-lva-red')} />
        <rect y={4.8} width={18} height={2.4} style={v('--tl-flag-white')} />
      </>
    );
  } else if (code === 'FIN') {
    body = (
      <>
        <rect width={18} height={12} style={v('--tl-flag-white')} />
        <rect x={5} width={3} height={12} style={v('--tl-flag-fin-blue')} />
        <rect y={4.5} width={18} height={3} style={v('--tl-flag-fin-blue')} />
      </>
    );
  } else if (code === 'BLR') {
    body = (
      <>
        <rect width={18} height={8} style={v('--tl-flag-blr-red')} />
        <rect y={8} width={18} height={4} style={v('--tl-flag-blr-green')} />
        <rect width={2.4} height={12} style={v('--tl-flag-white')} />
        <path d="M0.4 1 L1.2 2 L2 1 M0.4 4 L1.2 5 L2 4 M0.4 7 L1.2 8 L2 7 M0.4 10 L1.2 11 L2 10" style={{ stroke: 'var(--tl-flag-blr-red)', strokeWidth: 0.5, fill: 'none' }} />
      </>
    );
  } else {
    // XXA — määratlemata kodakondsus ("grey passport")
    body = (
      <>
        <rect width={18} height={12} style={v('--tl-flag-grey')} />
        <text x={9} y={9.2} textAnchor="middle" fontSize={8} fontWeight={700} style={v('--tl-flag-white')}>
          ?
        </text>
      </>
    );
  }
  return (
    <svg className="tl-cflag" width={w} height={h} viewBox="0 0 18 12" aria-hidden="true" preserveAspectRatio="none">
      {body}
    </svg>
  );
}

// ── Flag banner ──────────────────────────────────────────────────────────────

const SEV_ICON: Record<FlagLike['severity'], IconName> = { danger: 'alert', warn: 'warning', info: 'info' };

export function FlagBanner({ flags }: { flags: FlagLike[] }) {
  const tx = useTx();
  if (!flags.length) return null;
  return (
    <ul className="tl-flags" role="list">
      {flags.map((f) => (
        <li key={f.id} className={`tl-flag tl-flag--${f.severity}`}>
          <Icon name={SEV_ICON[f.severity]} size={14} />
          <span>{tx(f.text).toUpperCase()}</span>
        </li>
      ))}
    </ul>
  );
}

/** Tiny severity markers for result rows. */
export function FlagDots({ flags, legend }: { flags: FlagLike[]; legend?: boolean }) {
  const tx = useTx();
  return (
    <span className="tl-dots">
      {legend && (
        <span className="tl-dot tl-dot--gold" title="LEGEND 2025">
          <Icon name="star" size={12} />
        </span>
      )}
      {flags.slice(0, 4).map((f) => (
        <span key={f.id} className={`tl-dot tl-dot--${f.severity}`} title={tx(f.text)}>
          <Icon name={SEV_ICON[f.severity]} size={12} />
        </span>
      ))}
    </span>
  );
}

// ── Layout helpers ───────────────────────────────────────────────────────────

export function Section({ title, icon, children, aside }: { title: ReactNode; icon?: IconName; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="tl-sec">
      <h4 className="tl-sec__title">
        {icon && <Icon name={icon} size={13} />}
        <span>{title}</span>
        {aside && <span className="tl-sec__aside">{aside}</span>}
      </h4>
      {children}
    </section>
  );
}

export function KV({ rows }: { rows: [ReactNode, ReactNode, string?][] }) {
  return (
    <dl className="tl-kv">
      {rows.map(([k, v, cls], i) => (
        <div key={i} className={`tl-kv__row${cls ? ' ' + cls : ''}`}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
