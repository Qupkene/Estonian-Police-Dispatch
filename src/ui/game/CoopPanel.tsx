// Ühisvahetuse paneel (co-op, docs/MULTIPLAYER.md): who sits at which desk, the room's connection, and short text
// messages between the seats (no voice). Shown over the map only while a co-op room shift runs. Sector co-op: the
// desks nobody holds can be taken over here and handed back (section 12), and the host may remove a player.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useGame } from '@/store/game';
import { coopIssue, useCoop, usePending, type CoopStatus } from '@/store/coop';
import { rolesOf, type CoopRole } from '@/sim/coop';
import { colleagueName } from '@/sim/colleagues';
import { desksTakenInto, freeDesks, seatDesk } from '@/sim/desks';
import { displayRoomCode } from '@/sim/room';
import { sectorById } from '@/sim/sectors';
import { hhmm } from '@/sim/time';
import { kickPlayer, roomErrorKey } from '@/net/rooms';
import { useT, useTx } from '@/i18n';
import { deskName, LendRequests } from './DeskParts';
import { Button, Icon, IconButton, Modal, PlayerAvatar } from '@/ui/components';

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
  const error = useCoop((s) => s.error);
  const isHost = useCoop((s) => s.isHost);
  const avatars = useCoop((s) => s.avatars);
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const [kick, setKick] = useState<{ seat: number; name: string } | null>(null);
  const [kickNote, setKickNote] = useState<string | null>(null);
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
  const kicked = status === 'gone' && error === 'kicked';
  const removeSeat = () => {
    const who = kick;
    setKick(null);
    if (!who || !c) return;
    kickPlayer(c.code, who.seat)
      .then(() => setKickNote(t('rooms.kick.done', { name: who.name })))
      .catch((e: unknown) => setKickNote(t(roomErrorKey(e))));
  };

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
      {kicked && (
        <div className="gm-coop__kicked" role="alert" data-testid="coop-kicked">
          <p>{t('coop.kicked')}</p>
          <Button size="sm" onClick={() => useGame.getState().quitShift()}>
            {t('coop.kicked.leave')}
          </Button>
        </div>
      )}
      {open && (
        <>
          {/* First, so an open request is never pushed below the fold or under the 112 card. */}
          {sim && <LendRequests sim={sim} />}
          {c.mode === 'sector' && <DeskTakeOver seat={seat} />}
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
                    <PlayerAvatar avatar={avatars[x.seat]} name={x.name} size={18} className="gm-coop__pic" />
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
                  {isHost && x.seat !== seat && x.present && (
                    <IconButton
                      size="sm"
                      icon="x"
                      label={t('rooms.kick.aria', { name: x.name })}
                      onClick={() => setKick({ seat: x.seat, name: x.name })}
                      data-testid="coop-kick"
                    />
                  )}
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
          {kickNote && (
            <p className="gm-coop__pending" role="status">
              {kickNote}
            </p>
          )}
        </>
      )}
      {kick && (
        <Modal
          open
          onClose={() => setKick(null)}
          title={t('rooms.kick.title')}
          width={440}
          footer={
            <>
              <Button variant="ghost" onClick={() => setKick(null)}>
                {t('rooms.kick.no')}
              </Button>
              <Button variant="danger" onClick={removeSeat} data-testid="coop-kick-yes">
                {t('rooms.kick.yes')}
              </Button>
            </>
          }
        >
          <p>{t('rooms.kick.confirm', { name: kick.name })}</p>
        </Modal>
      )}
    </section>
  );
}

/**
 * Sector co-op (docs/MULTIPLAYER.md section 12): the desks nobody holds, with their AI colleague, which this player
 * can take over, and the desks this player took over, which they can hand back.
 */
function DeskTakeOver({ seat }: { seat: number }) {
  const t = useT();
  const tx = useTx();
  useGame((g) => g.tick);
  const sim = useGame((g) => g.sim);
  const c = sim?.coop;
  const mine = c ? seatDesk(c, seat) : '';
  const free = c ? freeDesks(c, seat) : [];
  const taken = c?.sec && mine ? desksTakenInto(c.sec, mine) : [];
  if (!c || (!free.length && !taken.length)) return null;
  const colleague = (d: string) => {
    const sector = sectorById(d);
    return sector ? colleagueName(sector) : '';
  };
  return (
    <div className="gm-coop__desks" data-testid="coop-desks">
      {free.map((d) => (
        <DeskRow
          key={d}
          desk={d}
          text={t('desk.free.row', { desk: tx(deskName(d)), name: colleague(d) })}
          action={t('desk.take')}
          title={t('desk.take.title', { desk: tx(deskName(d)) })}
          kind="take"
        />
      ))}
      {taken.map((d) => (
        <DeskRow
          key={d}
          desk={d}
          text={t('desk.taken.row', { desk: tx(deskName(d)) })}
          action={t('desk.give')}
          title={t('desk.give.title', { desk: tx(deskName(d)), name: colleague(d) })}
          kind="give"
        />
      ))}
    </div>
  );
}

function DeskRow(props: {
  desk: string;
  text: string;
  action: string;
  title: string;
  kind: 'take' | 'give';
}) {
  const busy = usePending(props.kind, props.desk);
  return (
    <div className={`gm-coop__desk is-${props.kind}`} data-testid={`desk-${props.kind}-row`}>
      <span className="gm-coop__deskText">{props.text}</span>
      <Button
        size="sm"
        variant={props.kind === 'take' ? 'primary' : 'ghost'}
        disabled={busy}
        title={props.title}
        onClick={() => coopIssue(props.kind, [props.desk])}
        data-testid={`desk-${props.kind}`}
      >
        {props.action}
      </Button>
    </div>
  );
}
