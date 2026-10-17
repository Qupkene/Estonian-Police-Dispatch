import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Lang } from '@/sim/types';
import type { MapStyleKey } from '@/store/settings';
import { t } from '@/i18n';
import { MAP_STYLE_KEYS } from './style';

const I = {
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  home: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  follow: <path d="M12 3 19 20l-7-3.6L5 20z" />,
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  heat: <path d="M12 3c1 3.5 5 5.6 5 10a5 5 0 0 1-10 0c0-2 .9-3.4 2-4.5.2 1.6 1 2.6 2 3 0-3 0-5.5 1-8.5z" />,
};

function Ico({ d }: { d: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}

export interface MapToolbarProps {
  lang: Lang;
  styleKey: MapStyleKey;
  follow: boolean;
  canFollow: boolean;
  heat: boolean;
  tilt: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
  onFollow: () => void;
  onHeat: () => void;
  onTilt: () => void;
  onStyle: (key: MapStyleKey) => void;
}

export function MapToolbar(p: MapToolbarProps) {
  const tr = (k: string) => t(k, p.lang);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const followLabel = !p.canFollow ? tr('map.followNone') : p.follow ? tr('map.followOff') : tr('map.follow');

  return (
    <div className="epdm-tools" role="toolbar" aria-label={tr('map.toolbar')} aria-orientation="vertical">
      <div className="epdm-tools__group">
        <button type="button" className="epdm-tool" onClick={p.onZoomIn} aria-label={tr('map.zoomIn')} title={tr('map.zoomIn')}>
          <Ico d={I.plus} />
        </button>
        <button type="button" className="epdm-tool" onClick={p.onZoomOut} aria-label={tr('map.zoomOut')} title={tr('map.zoomOut')}>
          <Ico d={I.minus} />
        </button>
      </div>
      <div className="epdm-tools__group">
        <button type="button" className="epdm-tool" onClick={p.onRecenter} aria-label={tr('map.recenter')} title={tr('map.recenter')}>
          <Ico d={I.home} />
        </button>
        <button
          type="button"
          className="epdm-tool"
          onClick={p.onFollow}
          aria-label={followLabel}
          title={followLabel}
          aria-pressed={p.follow}
          disabled={!p.canFollow}
        >
          <Ico d={I.follow} />
        </button>
      </div>
      <div className="epdm-tools__group" ref={wrapRef}>
        <button
          type="button"
          className="epdm-tool"
          onClick={() => setOpen((o) => !o)}
          aria-label={tr('map.layers')}
          title={tr('map.layers')}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
        >
          <Ico d={I.layers} />
        </button>
        {open && (
          <div className="epdm-layers" id={menuId} role="menu" aria-label={tr('map.layers')}>
            {MAP_STYLE_KEYS.map((k, i) => (
              <button
                key={k}
                type="button"
                role="menuitemradio"
                aria-checked={p.styleKey === k}
                className={`epdm-layers__item epdm-layers__item--${k}`}
                autoFocus={p.styleKey === k || (i === 0 && !MAP_STYLE_KEYS.includes(p.styleKey))}
                onClick={() => {
                  p.onStyle(k);
                  setOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                  e.preventDefault();
                  const items = (e.currentTarget.parentElement?.querySelectorAll('button') ?? []) as NodeListOf<HTMLButtonElement>;
                  const idx = Array.from(items).indexOf(e.currentTarget);
                  items[(idx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
                }}
              >
                <span className="epdm-layers__swatch" aria-hidden="true" />
                <span className="epdm-layers__text">
                  <span>{tr(`map.style.${k}`)}</span>
                  <small>{tr(k === 'tactical' ? 'map.style.tacticalHint' : 'map.style.onlineHint')}</small>
                </span>
              </button>
            ))}
          </div>
        )}
        <button type="button" className="epdm-tool" onClick={p.onHeat} aria-label={tr('map.heat')} title={tr('map.heat')} aria-pressed={p.heat}>
          <Ico d={I.heat} />
        </button>
        <button
          type="button"
          className="epdm-tool epdm-tool--text"
          onClick={p.onTilt}
          aria-label={p.tilt ? tr('map.tilt2d') : tr('map.tilt')}
          title={p.tilt ? tr('map.tilt2d') : tr('map.tilt')}
          aria-pressed={p.tilt}
        >
          {p.tilt ? '2D' : '3D'}
        </button>
      </div>
    </div>
  );
}
