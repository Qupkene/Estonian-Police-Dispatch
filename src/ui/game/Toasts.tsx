import { useEffect } from 'react';
import { onGameEvents, useGame } from '@/store/game';
import { useT, useTx } from '@/i18n';
import { Icon, type IconName } from '@/ui/components';
import type { GameEvent, SimState } from '@/sim/types';
import { selectIncident, selectUnit } from './actions';
import { useMsg } from './bits';
import { useGameUi, type Toast, type ToastKind } from './uiStore';

const ICON: Record<ToastKind, IconName> = {
  p1: 'alert',
  escalated: 'warning',
  backup: 'siren',
  emergency: 'siren',
  missed: 'phone-off',
  pursuit: 'car',
  pursuitEnd: 'flag',
  shift: 'clock',
  achievement: 'trophy',
  error: 'x',
  ok: 'check',
};

/** Translate engine events into toasts. Mounted once by GameScreen. */
export function useToastFeed() {
  useEffect(
    () =>
      onGameEvents((events) => {
        const s = useGame.getState().sim;
        if (!s) return;
        for (const ev of events) {
          const toast = toToast(s, ev);
          if (toast) useGameUi.getState().pushToast(toast);
        }
      }),
    [],
  );
}

function incLabel(s: SimState, id?: string): string | undefined {
  const inc = id ? s.incidents[id] : undefined;
  return inc ? `${inc.code} · ${inc.location.address}` : undefined;
}

function toToast(s: SimState, ev: GameEvent): Omit<Toast, 'id' | 'createdAt'> | null {
  const inc = ev.incidentId ? s.incidents[ev.incidentId] : undefined;
  const base = { incidentId: ev.incidentId, unitId: ev.unitId };
  switch (ev.type) {
    case 'incident_p1':
      return { ...base, kind: 'p1', title: 'game.toast.p1', text: inc ? inc.title : ev.text, vars: { sub: incLabel(s, ev.incidentId) ?? '' } };
    case 'incident_escalated':
      return { ...base, kind: 'escalated', title: 'game.toast.escalated', text: ev.text ?? inc?.title, vars: { sub: incLabel(s, ev.incidentId) ?? '' } };
    case 'radio': {
      // Backup requests arrive as radio traffic; find the message to know its kind.
      const m = findMsg(s, ev);
      if (m?.kind === 'backup') return { ...base, kind: 'backup', title: 'game.toast.backup', text: m.text, vars: { sub: `${m.from}${inc ? ' · ' + inc.code : ''}` } };
      return null;
    }
    case 'radio_emergency': {
      const m = findMsg(s, ev);
      return { ...base, kind: 'emergency', title: 'game.toast.emergency', text: ev.text, vars: { sub: m?.from ?? '' } };
    }
    case 'call_missed':
      return { ...base, kind: 'missed', title: 'game.toast.missed', text: ev.text, vars: { sub: incLabel(s, ev.incidentId) ?? '' } };
    case 'pursuit_start':
      return { ...base, kind: 'pursuit', title: 'game.toast.pursuitStart', text: ev.text, vars: { sub: incLabel(s, ev.incidentId) ?? '' } };
    case 'pursuit_end':
      return { ...base, kind: 'pursuitEnd', title: 'game.toast.pursuitEnd', text: ev.text, vars: { sub: incLabel(s, ev.incidentId) ?? '' } };
    case 'shift_end':
      return { ...base, kind: 'shift', title: 'game.toast.shiftEnd', text: ev.text };
    case 'achievement':
      return { ...base, kind: 'achievement', title: 'game.toast.achievement', text: ev.text };
    default:
      return null;
  }
}

function findMsg(s: SimState, ev: GameEvent) {
  for (let i = s.radio.length - 1; i >= 0 && i >= s.radio.length - 30; i--) {
    const m = s.radio[i];
    if (m.t === ev.t && m.incidentId === ev.incidentId && (!ev.text || m.text.et === ev.text.et)) return m;
  }
  return undefined;
}

const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function Toasts() {
  const toasts = useGameUi((s) => s.toasts);
  const dismiss = useGameUi((s) => s.dismissToast);
  const t = useT();
  const tx = useTx();
  const msg = useMsg();
  if (!toasts.length) return null;
  const newest = toasts[toasts.length - 1].id;
  return (
    <div className="gm-toasts" aria-live="assertive">
      {toasts.map((to) => {
        const clickable = !!(to.incidentId || to.unitId);
        // Only the newest toast shows its full text; older ones collapse to a single line so a burst
        // never covers much of the map.
        const compact = to.id !== newest;
        const sub = to.vars?.sub;
        const title = t(to.title, to.vars);
        const raw = to.text === undefined ? '' : typeof to.text === 'string' ? msg(to.text) : tx(to.text);
        // Skip the body when the engine text just repeats the title (e.g. "Vastamata 112-kõne").
        const body = norm(raw) === norm(title) ? '' : raw;
        return (
          <div
            key={to.id}
            className={`gm-toast gm-toast--${to.kind}${clickable ? ' is-clickable' : ''}${compact ? ' is-compact' : ''}`}
            role="status"
            title={compact && body ? body : undefined}
            onClick={() => {
              if (to.incidentId && useGame.getState().sim?.incidents[to.incidentId]) selectIncident(to.incidentId, { focus: true });
              else if (to.unitId) selectUnit(to.unitId, { focus: true });
              dismiss(to.id);
            }}
          >
            <span className="gm-toast__icon">
              <Icon name={ICON[to.kind]} size={compact ? 13 : 16} />
            </span>
            <div className="gm-toast__body">
              <strong>{title}</strong>
              {body && <span className="gm-toast__text">{body}</span>}
              {sub ? <span className="gm-toast__sub mono">{sub}</span> : null}
            </div>
            <button
              type="button"
              className="gm-toast__x"
              aria-label={t('game.toast.dismiss')}
              onClick={(e) => {
                e.stopPropagation();
                dismiss(to.id);
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
