// Small shared pieces for the career tabs.
import type { ReactNode } from 'react';
import { useT } from '@/i18n';
import { Icon, ICON_NAMES, type IconName } from '@/ui/components';
import type { UnitType } from '@/sim/types';
import { UNIT_ICON, UNIT_TYPES, type SortDir } from './helpers';

export function Stat({ icon, label, value, sub, tone }: { icon: IconName; label: string; value: ReactNode; sub?: string; tone?: 'danger' | 'ok' | 'warn' }) {
  return (
    <div className={`cr-stat${tone ? ` cr-stat--${tone}` : ''}`}>
      <span className="cr-stat__icon">
        <Icon name={icon} size={14} />
      </span>
      <div>
        <span className="cr-stat__label">{label}</span>
        <strong className="cr-stat__value">
          {value}
          {sub && <small> {sub}</small>}
        </strong>
      </div>
    </div>
  );
}

export function SortHeader<K extends string>({
  label,
  k,
  sort,
  onSort,
  align,
}: {
  label: string;
  k: K;
  sort: { key: K; dir: SortDir };
  onSort: (k: K) => void;
  align?: 'right';
}) {
  const active = sort.key === k;
  return (
    <th className={align === 'right' ? 'cr-num' : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`cr-sorth${active ? ' is-active' : ''}`} onClick={() => onSort(k)}>
        {label}
        <span className="cr-sorth__arrow" aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

/** Specialty filter chips (only specialties present in `counts` are shown). */
export function SpecialtyFilter({
  value,
  onChange,
  counts,
}: {
  value: UnitType | 'all';
  onChange: (v: UnitType | 'all') => void;
  counts: Partial<Record<UnitType, number>>;
}) {
  const t = useT();
  const present = UNIT_TYPES.filter((u) => (counts[u] ?? 0) > 0);
  if (present.length < 2) return null;
  const total = present.reduce((s, u) => s + (counts[u] ?? 0), 0);
  return (
    <div className="cr-chips" role="radiogroup" aria-label={t('career.filter')}>
      <button type="button" role="radio" aria-checked={value === 'all'} className={`cr-chipbtn${value === 'all' ? ' is-active' : ''}`} onClick={() => onChange('all')}>
        {t('career.all')} <span className="cr-chipbtn__n">{total}</span>
      </button>
      {present.map((u) => (
        <button key={u} type="button" role="radio" aria-checked={value === u} className={`cr-chipbtn${value === u ? ' is-active' : ''}`} onClick={() => onChange(u)}>
          <Icon name={UNIT_ICON[u]} size={12} />
          {t(`career.spec.${u}`)} <span className="cr-chipbtn__n">{counts[u]}</span>
        </button>
      ))}
    </div>
  );
}

export function SuitsChips({ suits }: { suits: UnitType[] }) {
  const t = useT();
  return (
    <span className="cr-suits">
      {(suits ?? []).map((u) => (
        <span key={u} className="cr-suit" title={t(`career.spec.${u}`)}>
          <Icon name={UNIT_ICON[u] ?? 'car'} size={11} />
          {t(`career.specShort.${u}`)}
        </span>
      ))}
    </span>
  );
}

/** Estonian-style licence plate (white plate, blue EST strip). */
export function Plate({ plate }: { plate: string }) {
  return (
    <span className="cr-plate" aria-label={plate}>
      <span className="cr-plate__eu">EST</span>
      <span className="cr-plate__num">{plate || '— —'}</span>
    </span>
  );
}

export function LockTag({ label }: { label: string }) {
  return (
    <span className="cr-lock">
      <Icon name="lock" size={12} /> {label}
    </span>
  );
}

/** Renders an upgrade/achievement icon: a known icon name, otherwise the raw emoji/text. */
export function GlyphIcon({ icon, size = 20, fallback = 'star' }: { icon?: string; size?: number; fallback?: IconName }) {
  if (icon && isIconName(icon)) return <Icon name={icon} size={size} />;
  if (icon && icon.trim()) return <span className="cr-glyph" style={{ fontSize: size }} aria-hidden="true">{icon}</span>;
  return <Icon name={fallback} size={size} />;
}

function isIconName(s: string): s is IconName {
  return (ICON_NAMES as readonly string[]).includes(s);
}
