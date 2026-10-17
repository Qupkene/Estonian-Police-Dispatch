import { useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '@/store/game';
import { useT, useTx } from '@/i18n';
import { Icon, Panel } from '@/ui/components';
import { hhmmss } from '@/sim/time';
import type { RadioMsg, SimState } from '@/sim/types';
import { selectIncident, selectUnit } from './actions';
import { selPendingRadio, selRegion } from './data';
import { RadioReplies, useSim } from './bits';
import { useGameUi, type RadioFilter } from './uiStore';

const MAX_LINES = 220;

function matches(m: RadioMsg, f: RadioFilter, pendingIds: Set<string>, selectedInc?: string): boolean {
  if (f === 'reply') return pendingIds.has(m.id);
  if (f === 'emergency') return m.level === 'emergency' || m.kind === 'backup';
  if (f === 'selected') return !!selectedInc && m.incidentId === selectedInc;
  return true;
}

export function RadioPanel() {
  const sim = useSim();
  const t = useT();
  const filter = useGameUi((s) => s.radioFilter);
  const setUi = useGameUi((s) => s.set);
  const selectedInc = useGame((s) => s.selection.incidentId);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [unseen, setUnseen] = useState(0);

  const total = sim?.radio.length ?? 0;
  const lastId = sim?.radio[total - 1]?.id;

  // Auto-scroll to the newest line unless the user scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stick.current) {
      el.scrollTop = el.scrollHeight;
      setUnseen(0);
    } else if (lastId) {
      setUnseen((n) => n + 1);
    }
  }, [lastId, filter]);

  if (!sim) return null;
  const pending = selPendingRadio(sim);
  const pendingIds = new Set(pending.map((m) => m.id));
  const emergencies = sim.radio.filter((m) => m.level === 'emergency' && sim.now - m.t < 30 * 60_000).length;
  const lines = sim.radio.filter((m) => matches(m, filter, pendingIds, selectedInc)).slice(-MAX_LINES);
  const region = selRegion(sim);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
    stick.current = atBottom;
    if (atBottom && unseen) setUnseen(0);
  };

  const jump = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = true;
    el.scrollTop = el.scrollHeight;
    setUnseen(0);
  };

  const filters: { id: RadioFilter; label: string; title: string; n?: number; tone?: string }[] = [
    { id: 'all', label: t('game.radio.all'), title: t('game.radio.all') },
    { id: 'reply', label: t('game.radio.replyShort'), title: `${t('game.radio.reply')} (F6)`, n: pending.length, tone: 'warn' },
    { id: 'emergency', label: t('game.radio.emergencyShort'), title: t('game.radio.emergency'), n: emergencies, tone: 'danger' },
    { id: 'selected', label: t('game.radio.selectedShort'), title: t('game.radio.selected') },
  ];

  return (
    <Panel
      className="gm-radio"
      bodyClassName="gm-radio__body"
      icon="radio"
      title={
        <>
          {t('game.radio.title')} <span className="gm-radio__net mono">{t('game.radio.net', { tg: `${region.radioName.toUpperCase()}-JK` })}</span>
        </>
      }
      actions={
        <div className="gm-seg" role="group">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`gm-seg__btn${filter === f.id ? ' is-active' : ''}`}
              disabled={f.id === 'selected' && !selectedInc}
              title={f.title}
              onClick={() => {
                stick.current = true;
                setUi({ radioFilter: f.id });
              }}
            >
              {f.label}
              {!!f.n && <span className={`gm-seg__n gm-seg__n--${f.tone}`}>{f.n}</span>}
            </button>
          ))}
        </div>
      }
    >
      <div className="gm-radio__log" ref={scroller} onScroll={onScroll} role="log" aria-live="polite">
        {lines.length === 0 && <div className="gm-radio__empty">{sim.radio.length ? t('game.radio.emptyFilter') : t('game.radio.empty')}</div>}
        {lines.map((m) => (
          <RadioLine key={m.id} m={m} sim={sim} pending={pendingIds.has(m.id)} selected={!!selectedInc && m.incidentId === selectedInc} />
        ))}
      </div>
      {unseen > 0 && (
        <button type="button" className="gm-radio__jump" onClick={jump}>
          <Icon name="chevron-down" size={12} />
          {t('game.radio.new')}
        </button>
      )}
    </Panel>
  );
}

function RadioLine({ m, sim, pending, selected }: { m: RadioMsg; sim: SimState; pending: boolean; selected: boolean }) {
  const tx = useTx();
  const inc = m.incidentId ? sim.incidents[m.incidentId] : undefined;
  const fromUnit = m.unitId ? sim.units[m.unitId] : undefined;
  const isJk = m.from === 'JK';
  const isHk = m.from === 'HK';
  const cls = [
    'gm-rl',
    `gm-rl--${m.level}`,
    `gm-rl--k-${m.kind}`,
    isJk && 'gm-rl--jk',
    isHk && 'gm-rl--hk',
    pending && 'is-pending',
    selected && 'is-sel',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <span className="gm-rl__t mono">{hhmmss(m.t)}</span>
      <span className="gm-rl__route mono">
        {fromUnit ? (
          <button type="button" className="gm-rl__from" onClick={() => selectUnit(fromUnit.id)}>
            {m.from}
          </button>
        ) : (
          <span className="gm-rl__from">{m.from}</span>
        )}
        {m.to && (
          <>
            <span className="gm-rl__arrow">→</span>
            <span className="gm-rl__to">{m.to}</span>
          </>
        )}
      </span>
      <span className="gm-rl__text">
        {inc && (
          <button type="button" className={`gm-rl__inc gm-rl__inc--p${inc.priority}`} onClick={() => selectIncident(inc.id)} title={tx(inc.title)}>
            {inc.code}
          </button>
        )}
        {tx(m.text)}
        {m.replies && m.replies.length > 0 && <RadioReplies msg={m} sim={sim} compact />}
      </span>
    </div>
  );
}
