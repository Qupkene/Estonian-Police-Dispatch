// Päeva väljakutse (daily challenge, src/sim/daily.ts): the main menu tile and the daily leaderboard dialog.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { Button, Icon, Modal, Segmented, Spinner, type IconName } from '@/ui/components';
import { gradeTone, regionSummary } from './helpers';
import './menu.css';
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

const WX_ICON: Record<DailyChallenge['weather'], IconName> = {
  clear: 'sun',
  cloudy: 'cloud',
  rain: 'rain',
  snow: 'snow',
  sleet: 'snow',
  fog: 'fog',
  storm: 'wind',
};

/** Translation key of a challenge's weather (a storm is a blizzard in winter, a thunderstorm in summer). */
function weatherKey(c: DailyChallenge): string {
  if (c.weather !== 'storm') return `daily.wx.${c.weather}`;
  const month = wall(c.start).month;
  if (month >= 5 && month <= 8) return 'daily.wx.storm.summer';
  if (month <= 2 || month === 12) return 'daily.wx.storm.winter';
  return 'daily.wx.storm';
}

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

/** Main menu tile: today's challenge, the player's result and place, and the way in. */
export function DailyTile({ saved }: { saved: SimState | null }) {
  const t = useT();
  const lang = useLang();
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

  return (
    <section className="sh-card sh-daily" aria-labelledby="sh-daily-title" data-testid="daily-tile">
      <div className="sh-daily__head">
        <span className="sh-daily__badge" aria-hidden="true">
          <Icon name="target" size={18} />
        </span>
        <h2 className="sh-daily__title" id="sh-daily-title">
          {t('daily.title')}
        </h2>
        <span className="sh-daily__day">{d.day}</span>
        <span className="sh-daily__next">
          <Icon name="timer" size={13} />
          {t('daily.next', { time: durationText(nextChallengeAt(now) - now, lang) })}
        </span>
      </div>
      <div className="sh-daily__area">
        <strong className="sh-daily__sector">{d.area}</strong>
        <span className="sh-daily__region">{d.region}</span>
      </div>
      <ul className="sh-daily__facts">
        <li>
          <Icon name={c.slot === 'night' ? 'moon' : 'clock'} size={14} />
          {d.slot} {d.hours}
        </li>
        <li className={c.harsh ? 'is-harsh' : undefined} title={c.harsh ? t('daily.harsh') : undefined}>
          <Icon name={WX_ICON[c.weather]} size={14} />
          {d.weather}
          {c.harsh && <span className="sh-daily__harsh">{t('daily.harsh')}</span>}
        </li>
        <li>
          <Icon name="gauge" size={14} />
          {t('daily.diff')}
        </li>
      </ul>
      <div className="sh-daily__foot">
        <p className={`sh-daily__status${mine || local ? ' is-mine' : ''}`} data-testid="daily-status">
          {(mine || local) && <Icon name="trophy" size={14} />}
          <span>
            {status}
            {note && <span className="sh-daily__practice"> {note}</span>}
          </span>
        </p>
        <div className="sh-daily__actions">
          {backend === 'online' && (
            <Button size="sm" variant="ghost" icon="list" onClick={() => setBoardOpen(true)}>
              {t('daily.board')}
            </Button>
          )}
          <Button
            size="sm"
            variant={played && !resumable ? 'secondary' : 'primary'}
            icon={resumable?.ended ? 'newspaper' : 'play'}
            onClick={play}
            data-sfx="click"
          >
            {resumable
              ? t(resumable.ended ? 'daily.report' : 'daily.resume')
              : played
                ? t('daily.practice')
                : t('daily.play')}
          </Button>
        </div>
      </div>
      {error && (
        <p className="sh-error" role="alert">
          <Icon name="warning" size={14} /> {error}
        </p>
      )}
      <DailyBoardModal open={boardOpen} onClose={() => setBoardOpen(false)} today={today} />
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
  // On document.body: the cards' backdrop-filter would otherwise pin the fixed overlay inside them.
  return createPortal(
    <Modal
      open={open}
      onClose={onClose}
      title={t('daily.board.title')}
      icon="trophy"
      width={520}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('daily.board.close')}
        </Button>
      }
    >
      <div className="sh-dboard" data-testid="daily-board">
        <Segmented<DayTab>
          size="sm"
          className="sh-dboard__tabs"
          label={t('daily.board.days')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'today', label: t('daily.tab.today') },
            { value: 'yesterday', label: t('daily.tab.yesterday') },
          ]}
        />
        <div className="sh-dboard__about">
          <strong>
            {d.area} <span className="sh-dim">· {d.region}</span>
          </strong>
          <span>
            {d.day} · {d.slot} {d.hours} · {d.weather}
          </span>
          {board && <span className="sh-dboard__players mono">{playersText(t, board.players)}</span>}
        </div>
        {error ? (
          <div className="sh-lb__state">
            <span>{t('daily.board.error')}</span>
            <Button size="sm" variant="ghost" icon="refresh" onClick={() => setReload((n) => n + 1)}>
              {t('account.lb.retry')}
            </Button>
          </div>
        ) : board === null ? (
          <div className="sh-lb__state" role="status">
            <Spinner size={14} /> {t('daily.board.loading')}
          </div>
        ) : board.scores.length === 0 ? (
          <p className="sh-lb__state">{t('daily.board.empty')}</p>
        ) : (
          <ol className="sh-lb__list sh-dboard__list">
            {board.scores.map((r, i) => (
              <BoardRow
                key={`${r.name}-${i}`}
                row={r}
                mine={!!meKey && r.name.toLocaleLowerCase('et') === meKey}
              />
            ))}
            {me && !meListed && (
              <>
                <li className="sh-dboard__gap" aria-hidden="true">
                  ⋯
                </li>
                <BoardRow row={me} mine />
              </>
            )}
          </ol>
        )}
        {!loggedIn && <p className="sh-dboard__guest">{t('daily.board.guest')}</p>}
      </div>
    </Modal>,
    document.body,
  );
}

function BoardRow({ row, mine }: { row: DailyRow; mine: boolean }) {
  const t = useT();
  const tone = gradeTone((row.grade || 'F') as 'S' | 'A' | 'B' | 'C' | 'D' | 'F');
  return (
    <li className={`sh-lb__row${mine ? ' is-me' : ''}${row.rank <= 3 ? ` is-top${row.rank}` : ''}`}>
      <span className="sh-lb__rank mono">{row.rank}</span>
      <span className="sh-lb__who">
        <span className="sh-lb__name">
          {row.name}
          {mine && <span className="sh-lb__you">{t('account.lb.you')}</span>}
        </span>
        <span className="sh-lb__meta">
          {row.incidents === 1
            ? t('daily.board.incidents.one')
            : t('daily.board.incidents', { n: row.incidents })}{' '}
          · {hhmm(row.at)}
        </span>
      </span>
      <span className={`sh-lb__grade sh-lb__grade--${tone}`} title={row.grade}>
        {row.grade}
      </span>
      <span className="sh-lb__score mono" title={t('account.lb.score', { score: Math.round(row.score) })}>
        {Math.round(row.score)}
      </span>
    </li>
  );
}
