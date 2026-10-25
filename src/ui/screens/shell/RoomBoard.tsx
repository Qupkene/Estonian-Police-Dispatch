// Mitmikmäng: a room's results board (lobby and report), and the hook that keeps a room current by polling it.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/i18n';
import {
  RoomPoller,
  participants,
  stillPlaying,
  type Room,
  type RoomPlayer,
  type RoomResult,
} from '@/net/rooms';
import { displayRoomCode } from '@/sim/room';
import { hhmm } from '@/sim/time';
import { PlayerAvatar } from '@/ui/components';

const GRADES = ['S', 'A', 'B', 'C', 'D', 'F'];

/**
 * A room kept current: polled every `every` ms (with ?v=, so an unchanged room costs a few bytes) while `active`,
 * until it is closed (a finished round opens again for the next one, docs/MULTIPLAYER.md section 11). `seed` is a
 * room already in hand (the result reply), shown at once.
 */
export function useLiveRoom(code: string | null, seed: Room | null, active = true, every = 2000) {
  const [room, setRoom] = useState<Room | null>(seed);
  const [gone, setGone] = useState(false);
  const pollerRef = useRef<RoomPoller | null>(null);
  useEffect(() => {
    if (seed) setRoom(seed);
  }, [seed]);
  const final = room?.state === 'closed';
  useEffect(() => {
    if (!code || !active || final) return;
    const p = new RoomPoller({
      code,
      every,
      onRoom: setRoom,
      onError: (_e, isGone) => isGone && setGone(true),
    });
    pollerRef.current = p;
    p.start();
    return () => {
      p.stop();
      pollerRef.current = null;
    };
  }, [code, active, final, every]);
  return { room, gone, refresh: () => pollerRef.current?.now() };
}

/** The board of the room's current round: results best first, then who is still on shift and who left. */
export function RoomBoard({ room, caption }: { room: Room; caption?: string }) {
  const t = useT();
  const playing = stillPlaying(room);
  const left = room.players.filter((p) => p.left && !room.results.some((r) => r.id === p.id));
  const total = room.results.length + playing.length + left.length;
  if (!total) return <p className="vk-mp__state">{t('rooms.board.empty')}</p>;
  return (
    <BoardTable caption={caption ?? t('rooms.board.titleCode', { code: displayRoomCode(room.code) })}>
      {room.results.map((r) => (
        <ResultRow key={r.id} row={r} mine={r.id === room.me} />
      ))}
      {playing.map((p) => (
        <WaitRow key={p.id} p={p} mine={p.id === room.me} kind="playing" />
      ))}
      {left.map((p) => (
        <WaitRow key={p.id} p={p} mine={p.id === room.me} kind="left" />
      ))}
    </BoardTable>
  );
}

/** An earlier round's board (results only): the room's last round in the lobby, a report's round after it. */
export function ResultsBoard({
  results,
  me,
  caption,
}: {
  results: RoomResult[];
  me: number;
  caption: string;
}) {
  const t = useT();
  if (!results.length) return <p className="vk-mp__state">{t('rooms.board.empty')}</p>;
  return (
    <BoardTable caption={caption}>
      {results.map((r) => (
        <ResultRow key={r.id} row={r} mine={r.id === me} />
      ))}
    </BoardTable>
  );
}

function BoardTable({ caption, children }: { caption: string; children: ReactNode }) {
  const t = useT();
  return (
    <table className="vk-table vk-mp__board" data-testid="room-board">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="is-num">
            {t('account.lb.col.rank')}
          </th>
          <th scope="col">{t('account.lb.col.name')}</th>
          <th scope="col">{t('account.lb.col.grade')}</th>
          <th scope="col" className="is-num">
            {t('account.lb.col.score')}
          </th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

/** "2/3 finished" for the board's head: results of the players taking part in the round. */
export function boardCount(t: ReturnType<typeof useT>, room: Room): string {
  return t('rooms.board.of', {
    n: room.results.length,
    m: Math.max(room.results.length, participants(room).length),
  });
}

function ResultRow({ row, mine }: { row: RoomResult; mine: boolean }) {
  const t = useT();
  const grade = GRADES.includes(row.grade) ? row.grade : 'F';
  return (
    <tr className={`vk-mp__row${mine ? ' is-me' : ''}`} aria-current={mine ? 'true' : undefined}>
      <td className="is-num">{row.rank}</td>
      <td className="vk-mp__who">
        <PlayerAvatar avatar={row.avatar} name={row.name} size={30} className="vk-mp__pic" />
        <span className="vk-mp__whoText">
          <span className="vk-mp__name">
            {row.name}
            {mine && <span className="vk-mp__you"> ({t('account.lb.you')})</span>}
          </span>
          <span className="vk-mp__meta">
            {row.incidents === 1
              ? t('rooms.board.incidents.one')
              : t('rooms.board.incidents', { n: row.incidents })}{' '}
            · <span className="vk-mono">{hhmm(row.at)}</span>
          </span>
        </span>
      </td>
      <td>
        <span className={`vk-grade vk-grade--${grade}`}>{row.grade || '-'}</span>
      </td>
      <td className="is-num is-strong">{Math.round(row.score)}</td>
    </tr>
  );
}

function WaitRow({ p, mine, kind }: { p: RoomPlayer; mine: boolean; kind: 'playing' | 'left' }) {
  const t = useT();
  return (
    <tr className={`vk-mp__row is-${kind}${mine ? ' is-me' : ''}`}>
      <td className="is-num" aria-hidden="true">
        ·
      </td>
      <td className="vk-mp__who">
        <PlayerAvatar avatar={p.avatar} name={p.name} size={30} className="vk-mp__pic" />
        <span className="vk-mp__whoText">
          <span className="vk-mp__name">
            {p.name}
            {mine && <span className="vk-mp__you"> ({t('account.lb.you')})</span>}
          </span>
          <span className="vk-mp__meta">
            {kind === 'left' ? t('rooms.p.left') : p.online ? t('rooms.p.playing') : t('rooms.p.offline')}
          </span>
        </span>
      </td>
      <td>
        <span
          className={`vk-mp__pulse${kind === 'playing' && p.online ? ' is-on' : ''}`}
          aria-hidden="true"
        />
      </td>
      <td className="is-num vk-dim">-</td>
    </tr>
  );
}
