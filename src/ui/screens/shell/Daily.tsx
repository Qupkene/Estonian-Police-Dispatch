// Päeva väljakutse (daily challenge, src/sim/daily.ts): its state for the main menu (useDaily), the menu's card
// and the daily leaderboard dialog.
import { useEffect, useMemo, useState, type Ref } from 'react';
import { useGame } from '@/store/game';
import { useAccount } from '@/net/account';
import { fetchDaily, guestDaily, type DailyBoard, type DailyRow } from '@/net/daily';
import { useLang, useT, useTx } from '@/i18n';
import { sfx } from '@/audio/sfx';
import {
  addDays,
  dailyChallenge,
  dailyDateOf,
  dailyShiftOptions,
  markDaily,
  nextChallengeAt,
  parseDate,
  todayInTallinn,
  type DailyChallenge,
} from '@/sim/daily';
import { sectorById } from '@/sim/sectors';
import { durationText, hhmm, HOUR, wall } from '@/sim/time';
import type { SimState } from '@/sim/types';
import { Button, Modal, Segmented, Spinner } from '@/ui/components';
import { regionSummary } from './helpers';
import { VkLayer } from './VkLayer';
import './daily.css';

/** Current time, refreshed every `ms` (the countdown and the change of day). */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Translation key of a challenge's weather (a storm is a blizzard in winter, a thunderstorm in summer). */
function weatherKey(c: DailyChallenge): string {
  if (c.weather !== 'storm') return `daily.wx.${c.weather}`;
  const month = wall(c.start).month;
  if (month >= 5 && month <= 8) return 'daily.wx.storm.summer';
  if (month <= 2 || month === 12) return 'daily.wx.storm.winter';
  return 'daily.wx.storm';
}

/** Weather that slows the crews and brings more road accidents in the simulation (sim/weather road and traffic factors). */
const ROUGH: DailyChallenge['weather'][] = ['rain', 'snow', 'sleet', 'fog', 'storm'];

/** Texts describing a challenge: area, day, time and weather. */
function useDescribe() {
  const t = useT();
  const lang = useLang();
  const tx = useTx();
  return (c: DailyChallenge) => {
    const region = regionSummary(c.regionId).name[lang];
    const sector = c.sector ? sectorById(c.sector) : undefined;
    const p = parseDate(c.date)!;
    const wd = (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
    return {
      area: sector ? tx(sector.name) : region,
      region: sector ? region : t('daily.whole'),
      weekdayShort: t(`daily.wd.short.${wd}`),
      day: t('daily.date', { wd: t(`daily.wd.${wd}`), date: `${p.d}.${p.m}.` }),
      slot: t(`daily.slot.${c.slot}`),
      hours: t('daily.hours', { from: hhmm(c.start), to: hhmm(c.start + c.hours * HOUR) }),
      weather: t(weatherKey(c)),
    };
  };
}

function playersText(t: ReturnType<typeof useT>, n: number): string {
  return n === 1 ? t('daily.players.one') : t('daily.players', { n });
}

export type DailyState = ReturnType<typeof useDaily>;

/**
 * Today's challenge for the menu: what it is, the player's result and place, the status line, and the way in
 * (today's run in the save is continued, never started over).
 */
export function useDaily(saved: SimState | null) {
  const t = useT();
  const describe = useDescribe();
  const now = useNow(30_000);
  const today = todayInTallinn(now);
  const c = useMemo(() => dailyChallenge(today), [today]);
  const d = describe(c);
  const backend = useAccount((s) => s.backend);
  const account = useAccount((s) => s.user);
  const gameUser = useGame((s) => s.user);
  const resumeShift = useGame((s) => s.resumeShift);
  const loggedIn = !!account && gameUser?.method === 'account';
  const who = loggedIn ? account.id : null;
  const [board, setBoard] = useState<DailyBoard | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (backend !== 'online') return;
    let alive = true;
    setBoard(null);
    fetchDaily(today, who)
      .then((b) => alive && setBoard(b))
      .catch(() => alive && setBoard(null));
    return () => {
      alive = false;
    };
  }, [backend, today, who]);

  const mine = loggedIn ? (board?.me ?? null) : null;
  const local = loggedIn ? null : guestDaily(today);
  // Today's run in the save is never started over: an unfinished one (Save & quit, a closed tab) is continued,
  // one whose clock ran out opens its report. Every run of a day is the same shift (same seed and start), so a
  // new run would replace it without the backup copy a different shift gets.
  const resumable = !!saved && dailyDateOf(saved) === today ? saved : null;
  const played = !!mine || !!local;
  /** What starting it now does: today's run continued or its report opened, a first run, or practice. */
  const action: 'resume' | 'report' | 'play' | 'practice' = resumable
    ? resumable.ended
      ? 'report'
      : 'resume'
    : played
      ? 'practice'
      : 'play';

  const play = () => {
    setError(null);
    if (resumable) {
      resumeShift(resumable);
      return;
    }
    try {
      useGame.getState().startShift(dailyShiftOptions(today, gameUser?.name ?? 'Dispetšer'));
      const sim = useGame.getState().sim;
      if (sim) markDaily(sim, today);
      sfx.play('dispatch');
    } catch (e) {
      sfx.play('error');
      setError(t('daily.startError', { err: e instanceof Error ? e.message : String(e) }));
    }
  };

  // The status line, and a quieter note after it (the rule that applies next).
  let status: string;
  let note: string | null = null;
  if (mine) {
    status = t('daily.mine', {
      score: mine.score,
      grade: mine.grade,
      rank: mine.rank,
      n: board?.players ?? mine.rank,
    });
    note = t('daily.mine.practice');
  } else if (local) status = t('daily.mine.guest', { score: local.score, grade: local.grade });
  else if (backend !== 'online') status = t('daily.offline');
  else if (!loggedIn) status = t('daily.guest');
  else if (board) {
    status = !board.players
      ? t('daily.first')
      : board.players === 1
        ? t('daily.played.one')
        : t('daily.played', { n: board.players });
    note = t('daily.firstCounts');
  } else status = t('daily.sub');

  /** Short state for the menu row: not played, in progress, or the score. */
  const short = resumable
    ? t(resumable.ended ? 'daily.state.ended' : 'daily.state.running')
    : mine || local
      ? t('daily.state.score', { score: (mine ?? local)!.score, grade: (mine ?? local)!.grade })
      : t('daily.state.todo');

  return {
    today,
    now,
    c,
    d,
    backend,
    board,
    mine,
    local,
    resumable,
    played,
    action,
    play,
    status,
    note,
    short,
    error,
    boardOpen,
    setBoardOpen,
  };
}

/**
 * The menu's daily panel: today's challenge, the player's result and place, and the way in at its foot. With
 * `onClose` it has a close button (the menu opens it from its Päeva väljakutse row).
 */
export function DailyCard({
  daily,
  id,
  className,
  playRef,
  onClose,
}: {
  daily: DailyState;
  id?: string;
  className?: string;
  playRef?: Ref<HTMLButtonElement>;
  onClose?: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const { c, d, now, board, action, play, status, note, error, backend } = daily;
  const rough = ROUGH.includes(c.weather);
  const p = parseDate(c.date)!;
  return (
    <section
      className={`vk-panel vk-day${className ? ' ' + className : ''}`}
      id={id}
      aria-labelledby="vk-day-title"
      data-testid="daily-tile"
    >
      <div className="vk-panel__head">
        <svg className="vk-mark" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.2" />
          <circle cx="7" cy="7" r="2" />
        </svg>
        <h2 className="vk-h" id="vk-day-title">
          {t('daily.title')}
        </h2>
        <span className="vk-meta">
          {d.weekdayShort} {`${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}`}
          {board && <span className="vk-day__players"> · {playersText(t, board.players)}</span>}
        </span>
        {onClose && (
          <button
            type="button"
            className="vk-day__close"
            onClick={onClose}
            aria-label={t('daily.close')}
            title={t('daily.close')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        )}
      </div>
      <div className="vk-day__body">
        <p className="vk-day__title">
          <strong className="sh-daily__sector">{d.area}</strong>
          <span>{d.region}</span>
        </p>
        <dl className="vk-day__facts">
          <div>
            <dt className="vk-label">{t('daily.fact.time')}</dt>
            <dd>
              {d.slot} <span className="vk-mono">{d.hours}</span>
            </dd>
          </div>
          <div>
            <dt className="vk-label">{t('daily.fact.weather')}</dt>
            <dd
              className={c.harsh ? 'vk-day__harsh' : undefined}
              title={c.harsh ? t('daily.harsh') : undefined}
            >
              {d.weather}
              {c.harsh && <span className="vk-sr"> ({t('daily.harsh')})</span>}
            </dd>
          </div>
          <div>
            <dt className="vk-label">{t('daily.fact.level')}</dt>
            <dd>{t('daily.diff')}</dd>
          </div>
        </dl>
        {rough && (
          <p className="vk-day__warn">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 1.8 1.2 14h13.6z" />
              <path d="M8 6.2v3.6M8 11.6v.4" />
            </svg>
            <span>
              <strong>{d.weather}:</strong> {t('daily.wx.effect')}
            </span>
          </p>
        )}
      </div>
      <div className={`vk-day__foot${daily.played ? ' is-played' : ''}`}>
        <p className="vk-day__status" data-testid="daily-status">
          {status}
          {note && <span className="vk-day__note"> {note}</span>}
        </p>
      </div>
      <div className="vk-day__go">
        <button
          type="button"
          className={`vk-btn vk-day__start${action === 'practice' ? ' is-practice' : ''}`}
          onClick={play}
          data-sfx="click"
          ref={playRef}
        >
          <span>{t(`daily.${action}`)}</span>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h9.5M8.5 4l4 4-4 4" />
          </svg>
        </button>
        {error && (
          <p className="vk-day__error" role="alert">
            {error}
          </p>
        )}
        <p className="vk-day__line">
          <span className="vk-day__next">
            {t('daily.next', { time: durationText(nextChallengeAt(now) - now, lang) })}.
          </span>
          {backend === 'online' && (
            <button
              type="button"
              className="vk-linkbtn vk-day__board"
              onClick={() => daily.setBoardOpen(true)}
            >
              {t('daily.board')}
            </button>
          )}
        </p>
      </div>
      <DailyBoardModal open={daily.boardOpen} onClose={() => daily.setBoardOpen(false)} today={daily.today} />
    </section>
  );
}

type DayTab = 'today' | 'yesterday';

/**
 * The daily leaderboard: today's and yesterday's board, top 50 plus the player's own place. It opens on
 * `day` when that is yesterday (a run finished after midnight), else on today.
 */
export function DailyBoardModal({
  open,
  onClose,
  today,
  day: openOn,
}: {
  open: boolean;
  onClose: () => void;
  today: string;
  day?: string;
}) {
  const t = useT();
  const describe = useDescribe();
  const [tab, setTab] = useState<DayTab>('today');
  const firstTab: DayTab = openOn && openOn === addDays(today, -1) ? 'yesterday' : 'today';
  useEffect(() => {
    if (open) setTab(firstTab);
  }, [open, firstTab]);
  const account = useAccount((s) => s.user);
  const gameUser = useGame((s) => s.user);
  const loggedIn = !!account && gameUser?.method === 'account';
  const who = loggedIn ? account.id : null;
  const day = tab === 'today' ? today : addDays(today, -1);
  const c = useMemo(() => dailyChallenge(day), [day]);
  const d = describe(c);
  const [board, setBoard] = useState<DailyBoard | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(false);
    setBoard(null);
    fetchDaily(day, who, true)
      .then((b) => alive && setBoard(b))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [open, day, who, reload]);

  const me = board?.me ?? null;
  const meKey = me?.name.toLocaleLowerCase('et');
  const meListed = !!me && !!board?.scores.some((r) => r.name.toLocaleLowerCase('et') === meKey);

  if (!open) return null;
  return (
    <VkLayer>
      <Modal
        open={open}
        onClose={onClose}
        title={t('daily.board.title')}
        width={560}
        footer={
          <Button variant="ghost" onClick={onClose}>
            {t('daily.board.close')}
          </Button>
        }
      >
        <div className="vk-dboard" data-testid="daily-board">
          <Segmented<DayTab>
            size="sm"
            className="vk-dboard__tabs"
            label={t('daily.board.days')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'today', label: t('daily.tab.today') },
              { value: 'yesterday', label: t('daily.tab.yesterday') },
            ]}
          />
          <div className="vk-dboard__about">
            <svg className="vk-mark" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="5.2" />
              <circle cx="7" cy="7" r="2" />
            </svg>
            <p>
              <strong>{d.area}</strong> <span className="vk-dim">{d.region}</span>
              <br />
              {d.day} · {d.slot} <span className="vk-mono">{d.hours}</span> · {d.weather}
            </p>
            {board && <span className="vk-meta">{playersText(t, board.players)}</span>}
          </div>
          {error ? (
            <div className="vk-dboard__state">
              <span>{t('daily.board.error')}</span>
              <Button size="sm" variant="ghost" onClick={() => setReload((n) => n + 1)}>
                {t('account.lb.retry')}
              </Button>
            </div>
          ) : board === null ? (
            <div className="vk-dboard__state" role="status">
              <Spinner size={14} /> {t('daily.board.loading')}
            </div>
          ) : board.scores.length === 0 ? (
            <p className="vk-dboard__state">{t('daily.board.empty')}</p>
          ) : (
            <div className="vk-dboard__list">
              <table className="vk-table vk-dboard__table">
                <caption>{t('daily.board.title')}</caption>
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
                <tbody>
                  {board.scores.map((r, i) => (
                    <BoardRow
                      key={`${r.name}-${i}`}
                      row={r}
                      mine={!!meKey && r.name.toLocaleLowerCase('et') === meKey}
                    />
                  ))}
                  {me && !meListed && (
                    <>
                      <tr className="vk-dboard__gap" aria-hidden="true">
                        <td colSpan={4}>⋯</td>
                      </tr>
                      <BoardRow row={me} mine />
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!loggedIn && <p className="vk-msg">{t('daily.board.guest')}</p>}
        </div>
      </Modal>
    </VkLayer>
  );
}

function BoardRow({ row, mine }: { row: DailyRow; mine: boolean }) {
  const t = useT();
  const grade = ['S', 'A', 'B', 'C', 'D', 'F'].includes(row.grade) ? row.grade : 'F';
  return (
    <tr
      className={`sh-lb__row vk-dboard__row${mine ? ' is-me' : ''}`}
      aria-current={mine ? 'true' : undefined}
    >
      <td className="is-num">{row.rank}</td>
      <td className="vk-dboard__who">
        <span className="vk-dboard__name">
          {row.name}
          {mine && <span className="vk-dboard__you"> ({t('account.lb.you')})</span>}
        </span>
        <span className="vk-dboard__meta">
          {row.incidents === 1
            ? t('daily.board.incidents.one')
            : t('daily.board.incidents', { n: row.incidents })}{' '}
          · <span className="vk-mono">{hhmm(row.at)}</span>
        </span>
      </td>
      <td>
        <span className={`vk-grade vk-grade--${grade}`} title={row.grade}>
          {row.grade || '-'}
        </span>
      </td>
      <td className="is-num is-strong" title={t('account.lb.score', { score: Math.round(row.score) })}>
        {Math.round(row.score)}
      </td>
    </tr>
  );
}
