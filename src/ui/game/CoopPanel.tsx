// Ühisvahetuse paneel (co-op, docs/MULTIPLAYER.md): who sits at which desk, the room's connection, and short text
// messages between the seats (no voice). Shown over the map only while a co-op room shift runs.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useGame } from '@/store/game';
import { coopIssue, useCoop, type CoopStatus } from '@/store/coop';
import { rolesOf, type CoopRole } from '@/sim/coop';
import { displayRoomCode } from '@/sim/room';
import { hhmm } from '@/sim/time';
import { useT, useTx } from '@/i18n';
import { deskName, LendRequests } from './DeskParts';
import { Icon, IconButton } from '@/ui/components';

const STATUS_TONE: Record<CoopStatus, 'ok' | 'warn' | 'danger' | 'info'> = {
  connecting: 'info',
  catching: 'warn',
  live: 'ok',
  waiting: 'warn',
  resync: 'warn',
  offline: 'danger',
  ended: 'info',
  gone: 'danger',
};

/** Quick messages a desk sends most (one click). */
const QUICK = ['coop.quick.mine', 'coop.quick.help', 'coop.quick.check'];

export function CoopPanel() {
  const t = useT();
  const tx = useTx();
  useGame((g) => g.tick);
  const sim = useGame((g) => g.sim);
  const seat = useCoop((s) => s.seat);
  const status = useCoop((s) => s.status);
  const behind = useCoop((s) => s.behind);
  const pending = useCoop((s) => s.pending.length);
  const seen = useCoop((s) => s.pingsSeen);
  const resyncs = useCoop((s) => s.resyncs);
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const c = sim?.coop;
  const pings = c?.pings ?? [];
  const lastPing = pings[pings.length - 1]?.id ?? 0;

  useEffect(() => {
    if (open && lastPing !== seen) useCoop.setState({ pingsSeen: lastPing });
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, lastPing, seen]);

  if (!c) return null;
  const unread = open ? 0 : pings.filter((p) => p.id > seen && p.seat !== seat).length;
  const send = (msg: string) => {
    const m = msg.trim().slice(0, 140);
    if (m) coopIssue('ping', [m]);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
    setText('');
  };
  const name = (n: number) => c.seats.find((x) => x.seat === n)?.name ?? `#${n + 1}`;
  const statusText =
    status === 'catching' ? t('coop.status.catching', { n: behind }) : t(`coop.status.${status}`);

  return (
    <section
      className={`gm-coop${open ? '' : ' is-closed'}`}
      aria-label={t('coop.panel')}
      data-testid="coop-panel"
      data-status={status}
      data-seat={seat}
    >
      <header className="gm-coop__head">
        <Icon name="users" size={14} />
        <strong>{t('coop.panel.title', { code: displayRoomCode(c.code) })}</strong>
        <span
          className={`gm-coop__status gm-coop__status--${STATUS_TONE[status]}`}
          data-testid="coop-status"
          title={resyncs ? t('coop.status.resyncs', { n: resyncs }) : undefined}
        >
          <i aria-hidden="true" />
          {statusText}
        </span>
        {unread > 0 && <span className="gm-coop__unread">{unread}</span>}
        <IconButton
          size="sm"
          icon={open ? 'chevron-down' : 'chevron-right'}
          label={open ? t('coop.panel.hide') : t('coop.panel.show')}
          onClick={() => setOpen(!open)}
        />
      </header>
      {open && (
        <>
          {/* First, so an open request is never pushed below the fold or under the 112 card. */}
          {sim && <LendRequests sim={sim} />}
          <ul className="gm-coop__seats" data-testid="coop-seats">
            {c.seats.map((x) => {
              const roles = rolesOf(c, x.seat);
              const st = c.stats[String(x.seat)];
              return (
                <li
                  key={x.seat}
                  className={`gm-coop__seat${x.seat === seat ? ' is-me' : ''}${x.present ? '' : ' is-away'}`}
                  data-testid="coop-seat"
                >
                  <span className={`gm-coop__dot${x.present ? ' is-on' : ''}`} aria-hidden="true" />
                  <span className="gm-coop__name">
                    {x.name}
                    {x.seat === seat && <span className="gm-coop__you"> ({t('rooms.badge.you')})</span>}
                    {x.seat === c.host && <span className="gm-coop__host">{t('rooms.badge.host')}</span>}
                  </span>
                  <span className="gm-coop__roles" data-testid="coop-seat-desk">
                    {c.mode === 'sector'
                      ? x.present
                        ? tx(deskName(x.desk ?? ''))
                        : t('coop.seat.away')
                      : x.present
                        ? roles.length
                          ? roles.map((r: CoopRole) => t(`coop.role.${r}.short`)).join(' + ')
                          : t(`coop.role.${x.role}.short`)
                        : t('coop.seat.away')}
                  </span>
                  {st && c.mode === 'sector' ? (
                    <span className="gm-coop__counts mono" title={t('desk.seat.countsTitle')}>
                      {st.calls}/{st.sent}/{st.lent ?? 0}
                    </span>
                  ) : st ? (
                    <span className="gm-coop__counts mono" title={t('coop.seat.countsTitle')}>
                      {st.calls}/{st.sent}/{st.radio}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <ol className="gm-coop__pings" ref={listRef} aria-live="polite" data-testid="coop-pings">
            {pings.length === 0 && <li className="gm-coop__empty">{t('coop.ping.none')}</li>}
            {pings.slice(-30).map((p) => (
              <li key={p.id} className={p.seat === seat ? 'is-me' : undefined}>
                <span className="mono">{hhmm(p.t)}</span> <b>{name(p.seat)}:</b> {p.text}
              </li>
            ))}
          </ol>
          <div className="gm-coop__quick">
            {QUICK.map((k) => (
              <button key={k} type="button" onClick={() => send(t(k))}>
                {t(k)}
              </button>
            ))}
          </div>
          <form className="gm-coop__form" onSubmit={submit}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={140}
              placeholder={t('coop.ping.placeholder')}
              aria-label={t('coop.ping.placeholder')}
              data-testid="coop-ping-input"
            />
            <button type="submit" disabled={!text.trim()}>
              <Icon name="send" size={13} />
              <span className="sr-only">{t('coop.ping.send')}</span>
            </button>
          </form>
          {pending > 0 && (
            <p className="gm-coop__pending" data-testid="coop-pending">
              {t('coop.pending', { n: pending })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
