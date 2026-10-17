// Shared UI primitives — API owned by core, visual polish owned by ui-shell. Keep prop names stable.
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Priority, UnitStatus } from '@/sim/types';
import { Icon, type IconName } from './Icon';
import './components.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  kbd?: string;
  block?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, kbd, block, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`ui-btn ui-btn--${variant} ui-btn--${size}${block ? ' ui-btn--block' : ''}${className ? ' ' + className : ''}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children !== undefined && <span className="ui-btn__label">{children}</span>}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'ghost',
  className,
  ...rest
}: Omit<ButtonProps, 'children' | 'icon'> & { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`ui-iconbtn ui-btn--${variant} ui-iconbtn--${size}${className ? ' ' + className : ''}`}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  icon,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  icon?: IconName;
}) {
  return (
    <section className={`ui-panel${className ? ' ' + className : ''}`}>
      {(title || actions) && (
        <header className="ui-panel__head">
          {icon && <Icon name={icon} size={14} />}
          <h2 className="ui-panel__title">{title}</h2>
          <div className="ui-panel__actions">{actions}</div>
        </header>
      )}
      <div className={`ui-panel__body${bodyClassName ? ' ' + bodyClassName : ''}`}>{children}</div>
    </section>
  );
}

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
  badge?: number | string;
  icon?: IconName;
  kbd?: string;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`ui-tabs${className ? ' ' + className : ''}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          className={`ui-tab${t.id === value ? ' is-active' : ''}`}
          onClick={() => onChange(t.id)}
          title={t.kbd}
        >
          {t.icon && <Icon name={t.icon} size={14} />}
          <span>{t.label}</span>
          {t.badge !== undefined && t.badge !== 0 && <span className="ui-tab__badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'accent' | 'gold';
  children: ReactNode;
  className?: string;
}) {
  return <span className={`ui-badge ui-badge--${tone}${className ? ' ' + className : ''}`}>{children}</span>;
}

export function PriorityChip({ p, compact }: { p: Priority; compact?: boolean }) {
  return <span className={`ui-prio ui-prio--${p}${compact ? ' ui-prio--compact' : ''}`}>{compact ? p : `P${p}`}</span>;
}

export function StatusChip({ status, label }: { status: UnitStatus; label: string }) {
  return (
    <span className={`ui-status ui-status--${status}`}>
      <i className="ui-status__dot" />
      {label}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 560,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ui-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ui-modal__card" style={{ width }}>
        {title && (
          <header className="ui-modal__head">
            <h2>{title}</h2>
            <IconButton icon="close" label="Sulge" onClick={onClose} />
          </header>
        )}
        <div className="ui-modal__body">{children}</div>
        {footer && <footer className="ui-modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="ui-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ui-toggle__track" />
      {label && <span className="ui-toggle__label">{label}</span>}
    </label>
  );
}

export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  label,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label?: ReactNode;
}) {
  return (
    <label className="ui-slider">
      {label && <span className="ui-slider__label">{label}</span>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: ReactNode;
}) {
  return (
    <label className="ui-select">
      {label && <span className="ui-select__label">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Meter({ value, tone = 'accent', label }: { value: number; tone?: 'accent' | 'ok' | 'warn' | 'danger'; label?: string }) {
  return (
    <div className={`ui-meter ui-meter--${tone}`} role="meter" aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <div className="ui-meter__fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Empty({ icon = 'info', children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="ui-empty">
      <Icon name={icon} size={22} />
      <div>{children}</div>
    </div>
  );
}
