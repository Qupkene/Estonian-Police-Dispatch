// Shared UI primitives — API owned by core, visual polish owned by ui-shell. Keep prop names stable
// (new props are optional additions only).
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import type { Priority, UnitStatus } from '@/sim/types';
import { useT } from '@/i18n';
import { Icon, type IconName } from './Icon';
import './components.css';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

// ── Buttons ──────────────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  kbd?: string;
  block?: boolean;
  /** Icon after the label (e.g. chevron). */
  iconRight?: IconName;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  kbd,
  block,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const isz = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;
  return (
    <button
      type="button"
      className={cx(
        'ui-btn',
        `ui-btn--${variant}`,
        `ui-btn--${size}`,
        block && 'ui-btn--block',
        loading && 'is-loading',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={isz} /> : icon && <Icon name={icon} size={isz} />}
      {children !== undefined && <span className="ui-btn__label">{children}</span>}
      {iconRight && <Icon name={iconRight} size={isz} className="ui-btn__iconr" />}
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
      className={cx('ui-iconbtn', `ui-btn--${variant}`, `ui-iconbtn--${size}`, className)}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cx('ui-spinner', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────

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
    <section className={cx('ui-panel', className)}>
      {(title || actions) && (
        <header className="ui-panel__head">
          {icon && <Icon name={icon} size={14} className="ui-panel__icon" />}
          <h2 className="ui-panel__title">{title}</h2>
          <div className="ui-panel__actions">{actions}</div>
        </header>
      )}
      <div className={cx('ui-panel__body', bodyClassName)}>{children}</div>
    </section>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
  badge?: number | string;
  icon?: IconName;
  kbd?: string;
  disabled?: boolean;
}

/** Roving-focus helper shared by Tabs and Segmented: ←/→/Home/End move and select. */
function rovingKey<T extends string>(
  e: ReactKeyboardEvent<HTMLElement>,
  items: { id: T; disabled?: boolean }[],
  value: T,
  onChange: (v: T) => void,
  role: string,
) {
  const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const enabled = items.filter((i) => !i.disabled);
  if (!enabled.length) return;
  e.preventDefault();
  let idx = enabled.findIndex((i) => i.id === value);
  if (e.key === 'Home') idx = 0;
  else if (e.key === 'End') idx = enabled.length - 1;
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') idx = (idx + 1) % enabled.length;
  else idx = (idx - 1 + enabled.length) % enabled.length;
  const next = enabled[idx];
  onChange(next.id);
  const els = e.currentTarget.querySelectorAll<HTMLElement>(`[role="${role}"]`);
  const pos = items.findIndex((i) => i.id === next.id);
  els[pos]?.focus();
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  variant = 'line',
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /** 'line' = underline (default), 'pill' = segmented pills. */
  variant?: 'line' | 'pill';
}) {
  return (
    <div
      className={cx('ui-tabs', `ui-tabs--${variant}`, className)}
      role="tablist"
      onKeyDown={(e) => rovingKey(e, tabs, value, onChange, 'tab')}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            className={cx('ui-tab', active && 'is-active')}
            onClick={() => onChange(t.id)}
            title={t.kbd}
          >
            {t.icon && <Icon name={t.icon} size={14} />}
            <span className="ui-tab__label">{t.label}</span>
            {t.badge !== undefined && t.badge !== 0 && <span className="ui-tab__badge">{t.badge}</span>}
            {t.kbd && <span className="ui-tab__kbd">{t.kbd}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Compact segmented control (radio group semantics). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; icon?: IconName; title?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const items = options.map((o) => ({ id: o.value, disabled: o.disabled }));
  return (
    <div
      className={cx('ui-seg', `ui-seg--${size}`, className)}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => rovingKey(e, items, value, onChange, 'radio')}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={o.disabled}
            title={o.title}
            className={cx('ui-seg__opt', active && 'is-active')}
            onClick={() => onChange(o.value)}
          >
            {o.icon && <Icon name={o.icon} size={14} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Chips & badges ───────────────────────────────────────────────────────────

export function Badge({
  tone = 'neutral',
  children,
  className,
  icon,
  title,
}: {
  tone?: 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'accent' | 'gold';
  children: ReactNode;
  className?: string;
  icon?: IconName;
  title?: string;
}) {
  return (
    <span className={cx('ui-badge', `ui-badge--${tone}`, className)} title={title}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function PriorityChip({ p, compact }: { p: Priority; compact?: boolean }) {
  const t = useT();
  return (
    <span
      className={cx('ui-prio', `ui-prio--${p}`, compact && 'ui-prio--compact')}
      title={t(`shell.prio.${p}`)}
    >
      {compact ? p : `P${p}`}
    </span>
  );
}

export function StatusChip({ status, label }: { status: UnitStatus; label: string }) {
  return (
    <span className={`ui-status ui-status--${status}`}>
      <i className="ui-status__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 560,
  footer,
  tone,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
  /** Accent stripe on the card (e.g. 'danger' for destructive confirms). */
  tone?: 'danger' | 'warn' | 'accent';
  icon?: IconName;
}) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    const first = card?.querySelector<HTMLElement>(`.ui-modal__body ${FOCUSABLE}`) ?? card;
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !card) return;
      const els = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!els.length) return;
      const a = els[0];
      const b = els[els.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="ui-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={cardRef}
        className={cx('ui-modal__card', tone && `ui-modal__card--${tone}`)}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {title && (
          <header className="ui-modal__head">
            {icon && <Icon name={icon} size={18} className="ui-modal__icon" />}
            <h2 id={titleId}>{title}</h2>
            <IconButton icon="close" label={t('shell.ui.close')} onClick={onClose} />
          </header>
        )}
        <div className="ui-modal__body">{children}</div>
        {footer && <footer className="ui-modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

// ── Form controls ────────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx('ui-toggle', disabled && 'is-disabled')}>
      <input
        type="checkbox"
        role="switch"
        className="ui-toggle__input"
        checked={checked}
        disabled={disabled}
        aria-checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ui-toggle__track" aria-hidden="true">
        <span className="ui-toggle__thumb" />
      </span>
      {(label || description) && (
        <span className="ui-toggle__text">
          {label && <span className="ui-toggle__label">{label}</span>}
          {description && <span className="ui-toggle__desc">{description}</span>}
        </span>
      )}
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
  format,
  disabled,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label?: ReactNode;
  /** Formats the value shown next to the label (omit to hide). */
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <label className={cx('ui-slider', disabled && 'is-disabled')}>
      {(label || format) && (
        <span className="ui-slider__head">
          {label && <span className="ui-slider__label">{label}</span>}
          {format && <output className="ui-slider__value">{format(value)}</output>}
        </span>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="ui-select">
      {label && <span className="ui-select__label">{label}</span>}
      <span className="ui-select__wrap">
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={14} className="ui-select__chev" />
      </span>
    </label>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  value: string;
  onChange: (v: string) => void;
  label?: ReactNode;
  icon?: IconName;
  hint?: ReactNode;
  error?: ReactNode;
  mono?: boolean;
  /** Element rendered inside the field on the right (e.g. an IconButton). */
  trailing?: ReactNode;
}

/** Labelled text input with optional leading icon, hint and error. */
export function TextField({
  value,
  onChange,
  label,
  icon,
  hint,
  error,
  mono,
  trailing,
  className,
  id,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const fid = id ?? autoId;
  return (
    <div className={cx('ui-field', error ? 'has-error' : null, className)}>
      {label && (
        <label className="ui-field__label" htmlFor={fid}>
          {label}
        </label>
      )}
      <div className="ui-field__box">
        {icon && <Icon name={icon} size={16} className="ui-field__icon" />}
        <input
          id={fid}
          className={cx('ui-field__input', mono && 'mono')}
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
        {trailing}
      </div>
      {error ? (
        <div className="ui-field__error">{error}</div>
      ) : hint ? (
        <div className="ui-field__hint">{hint}</div>
      ) : null}
    </div>
  );
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export function Meter({
  value,
  tone = 'accent',
  label,
  size = 'md',
}: {
  value: number;
  tone?: 'accent' | 'ok' | 'warn' | 'danger';
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={cx('ui-meter', `ui-meter--${tone}`, `ui-meter--${size}`)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
      title={label}
    >
      <div className="ui-meter__fill" style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Empty({
  icon = 'info',
  children,
  title,
  action,
}: {
  icon?: IconName;
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <span className="ui-empty__icon">
        <Icon name={icon} size={22} />
      </span>
      {title && <div className="ui-empty__title">{title}</div>}
      <div className="ui-empty__text">{children}</div>
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}
