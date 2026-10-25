// Ruumi ajalugu (2.36.0, docs/MULTIPLAYER.md section 14): the rounds the player played to the end, kept as long as
// their rooms are (30 days). In the multiplayer menu all of them ("Varasemad mängud"); in a room's lobby that room's
// own, with how many shifts the players have played together and who was most often the hero of the day. A round
// opens again: a co-op round's joint report, a race's results.
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/net/account';
import { fetchRoomHistory, type RoomHistoryRound } from '@/net/rooms';
import { useT } from '@/i18n';
import { coopAwards } from '@/sim/joint';
import { displayRoomCode } from '@/sim/room';
import { Modal, PlayerAvatar, Spinner } from '@/ui/components';
import { JointReport } from './JointReport';
import { ResultsBoard } from './RoomBoard';
import { VkLayer } from './VkLayer';

const pad = (n: number) => String(n).padStart(2, '0');
/** "25.10 21:14" in the player's own time. */
function when(at: number): string {
  const d = new Date(at);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Who was the hero of the day most often in these rounds: their name and how many times, or null. */
export function mostOftenHero(rounds: readonly RoomHistoryRound[]): { name: string; n: number } | null {
  const count = new Map<string, number>();
  for (const r of rounds) {
    if (!r.summary) continue;
    const hero = coopAwards(r.summary.coop).find((a) => a.id === 'hero');
    const name = hero && r.summary.coop.seats.find((x) => x.seat === hero.seat)?.name;
    if (name) count.set(name, (count.get(name) ?? 0) + 1);
  }
  let top: { name: string; n: number } | null = null;
  for (const [name, n] of count) if (!top || n > top.n) top = { name, n };
  return top;
}

export function RoomHistory({ code, round }: { code?: string; round?: number }) {
  const t = useT();
  const me = useAccount((s) => s.user);
  const [rounds, setRounds] = useState<RoomHistoryRound[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<RoomHistoryRound | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRoomHistory()
      .then((list) => {
        if (!alive) return;
        setRounds(list);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // A room's lobby asks again after each round.
  }, [code, round]);
  const shown = useMemo(() => (rounds ?? []).filter((r) => !code || r.code === code), [rounds, code]);
  const hero = useMemo(() => (code ? mostOftenHero(shown) : null), [shown, code]);
  // In a lobby the history shows only once there is some.
  if (code && !shown.length) return null;
  return (
    <section className="vk-panel vk-hist" aria-labelledby="vk-hist-title" data-testid="room-history">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-hist-title">
          {t(code ? 'history.room' : 'history.title')}
        </h2>
        <span className="vk-meta">{t('history.meta')}</span>
      </div>
      {code && (
        <p className="vk-hist__sum">
          {shown.length === 1 ? t('history.together.one') : t('history.together', { n: shown.length })}
          {hero && (
            <>
              {' · '}
              {t('history.hero', { name: hero.name, n: hero.n })}
            </>
          )}
        </p>
      )}
      {rounds === null && !failed ? (
        <p className="vk-hist__state">
          <Spinner size={13} />
        </p>
      ) : failed ? (
        <p className="vk-hist__state vk-msg is-bad">{t('history.error')}</p>
      ) : !shown.length ? (
        <p className="vk-hist__state">{t('history.empty')}</p>
      ) : (
        <ul className="vk-hist__list">
          {shown.map((r) => (
            <li key={`${r.code}:${r.round}`}>
              <HistoryRow r={r} me={me?.id} onOpen={() => setOpen(r)} withCode={!code} />
            </li>
          ))}
        </ul>
      )}
      {open && (
        <RoundView
          r={open}
          me={me ? { id: Number(me.id), name: me.name } : null}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function HistoryRow({
  r,
  me,
  onOpen,
  withCode,
}: {
  r: RoomHistoryRound;
  me: number | string | undefined;
  onOpen: () => void;
  withCode: boolean;
}) {
  const t = useT();
  const mine = r.results.find((x) => x.id === Number(me));
  const grade = r.summary?.grade ?? mine?.grade ?? '';
  const g = ['S', 'A', 'B', 'C', 'D', 'F'].includes(grade) ? grade : 'F';
  return (
    <button type="button" className="vk-hist__row" onClick={onOpen} data-testid="history-row">
      <span className={`vk-grade vk-grade--${g}`}>{grade || '-'}</span>
      <span className="vk-hist__main">
        <span className="vk-hist__title">
          {withCode
            ? t('history.round', { code: displayRoomCode(r.code), n: r.round })
            : t('rooms.round', { n: r.round })}{' '}
          · {t(`rooms.mode.${r.mode}`)}
        </span>
        <span className="vk-hist__meta">
          <span className="vk-mono">{when(r.at)}</span>
          {r.summary
            ? ` · ${r.summary.score}/100 ${t('shell.rep.points')}`
            : mine
              ? ` · ${t('history.place', { rank: mine.rank, n: r.results.length })}`
              : ''}
        </span>
      </span>
      <span className="vk-hist__pics" aria-hidden="true">
        {r.results.slice(0, 4).map((x) => (
          <PlayerAvatar key={x.id} avatar={x.avatar} name={x.name} size={22} className="vk-joint__pic" />
        ))}
      </span>
      <span className="vk-hist__go">{t('history.view')}</span>
    </button>
  );
}

function RoundView({
  r,
  me,
  onClose,
}: {
  r: RoomHistoryRound;
  me: { id: number; name: string } | null;
  onClose: () => void;
}) {
  const t = useT();
  const byName = new Map(r.results.map((x) => [x.name, x.avatar]));
  const mySeat = r.summary?.coop.seats.find((x) => x.name === me?.name)?.seat ?? -1;
  return (
    <VkLayer>
      <Modal
        open
        onClose={onClose}
        title={`${t('history.round', { code: displayRoomCode(r.code), n: r.round })} · ${t(`rooms.mode.${r.mode}`)}`}
        width={760}
      >
        <div className="vk-hist__view" data-testid="history-view">
          {r.summary ? (
            <JointReport summary={r.summary} me={mySeat} avatarOf={(x) => byName.get(x.name)} team />
          ) : (
            <>
              {r.mode !== 'race' && <p className="vk-msg">{t('history.noReport')}</p>}
              <section className="vk-panel">
                <div className="vk-panel__head">
                  <h3 className="vk-h">{t('history.results')}</h3>
                  <span className="vk-meta vk-mono">{when(r.at)}</span>
                </div>
                <ResultsBoard
                  results={r.results}
                  me={me?.id ?? -1}
                  caption={t('rooms.last.caption', { n: r.round })}
                />
              </section>
            </>
          )}
        </div>
      </Modal>
    </VkLayer>
  );
}
