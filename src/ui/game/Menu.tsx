// Lightweight popover menu (fixed-position so it is never clipped by scrolling lists).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/ui/components';

export interface MenuItem {
  id: string;
  label: ReactNode;
  icon?: IconName;
  tone?: 'danger' | 'warn';
  disabled?: boolean;
  hint?: ReactNode;
  onSelect?: () => void;
  submenu?: MenuItem[];
}

export function MenuButton({
  items,
  children,
  className,
  title,
  backLabel,
  align = 'left',
}: {
  items: MenuItem[];
  children: ReactNode;
  className?: string;
  title?: string;
  backLabel: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [stack, setStack] = useState<MenuItem[][]>([]);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setStack([]);
  };

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const mh = menu.current?.offsetHeight ?? 200;
    const mw = menu.current?.offsetWidth ?? 220;
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    let left = align === 'right' ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    setPos({ top, left });
  }, [open, stack.length, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (menu.current?.contains(tgt) || btn.current?.contains(tgt)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    const onScroll = (e: Event) => {
      if (menu.current?.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const list = stack.length ? stack[stack.length - 1] : items;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`gm-menubtn${open ? ' is-open' : ''}${className ? ' ' + className : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close();
          else setOpen(true);
        }}
      >
        {children}
        <Icon name="chevron-down" size={12} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="gm-menu"
            role="menu"
            style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {stack.length > 0 && (
              <button type="button" role="menuitem" className="gm-menu__item gm-menu__back" onClick={() => setStack(stack.slice(0, -1))}>
                <Icon name="chevron-left" size={13} />
                <span>{backLabel}</span>
              </button>
            )}
            {list.map((it) => (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                className={`gm-menu__item${it.tone ? ' gm-menu__item--' + it.tone : ''}`}
                onClick={() => {
                  if (it.submenu) {
                    setStack([...stack, it.submenu]);
                    return;
                  }
                  close();
                  it.onSelect?.();
                }}
              >
                {it.icon && <Icon name={it.icon} size={13} />}
                <span className="gm-menu__label">{it.label}</span>
                {it.hint && <span className="gm-menu__hint">{it.hint}</span>}
                {it.submenu && <Icon name="chevron-right" size={12} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
