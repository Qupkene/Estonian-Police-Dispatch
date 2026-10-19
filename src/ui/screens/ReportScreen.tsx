// End-of-shift report: grade, stats, response times, highlights, career payout and the newspaper.
// Owned by ui-shell.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { shiftKeyOf, useGame } from '@/store/game';
import { useCareer } from '@/store/career';
import { useAccount } from '@/net/account';
import { submitScoreOnce, unrankedReason } from '@/net/scores';
import { rememberGuestDaily, submitDailyOnce, type DailyResult, type DailyRun } from '@/net/daily';
import { ApiError } from '@/net/api';
import { useLang, useT } from '@/i18n';
import { sfx } from '@/audio/sfx';
import { ddmmyyyy, hhmm, wall } from '@/sim/time';
import type { LedgerEntry, Officer, Priority, ShiftReport } from '@/sim/types';
import type { ReportExtras } from '@/sim/report';
import { dailyChallenge, dailyDateOf, dailyStartedOf, todayInTallinn } from '@/sim/daily';
import { Button, PriorityChip, Spinner } from '@/ui/components';
import { Newspaper } from './shell/Newspaper';
import { DailyBoardModal } from './shell/Daily';
import { ShellPage, useEnter } from './shell/ShellPage';
import { MonoNumbers } from './shell/notices';
import {
  formatDecimal,
  formatMoney,
  ledgerNet,
  mean,
  regionSummary,
  responseTone,
  SLA_TARGETS,
} from './shell/helpers';
import './shell/report.css';

/** Reports already applied to the career profile (applyReport must run exactly once per report). */
const applied = new WeakSet<ShiftReport>();
const careerResult = new WeakMap<ShiftReport, { ledger: LedgerEntry[]; error?: string }>();

const PRIOS: Priority[] = [1, 2, 3, 4];

export function ReportScreen() {
  const t = useT();
  const lang = useLang();
  const report = useGame((s) => s.report);
  const sim = useGame((s) => s.sim);
  const quitShift = useGame((s) => s.quitShift);
  const setScreen = useGame((s) => s.setScreen);
  const setBriefing = useGame((s) => s.setBriefing);
  const inbox = useCareer((s) => s.inbox);
  const clearInbox = useCareer((s) => s.clearInbox);
  const [, rerender] = useState(0);

  useEffect(() => {
    if (!report || report.mode !== 'career' || applied.has(report)) return;
    applied.add(report);
    try {
      const ledger = useCareer.getState().applyReport(report);
      careerResult.set(report, { ledger });
      // The ledger is what changes the budget (earnings.total leaves out the daily budget, pay and upkeep).
      if (ledgerNet(ledger) > 0) sfx.play('cash');
    } catch (e) {
      careerResult.set(report, { ledger: [], error: e instanceof Error ? e.message : String(e) });
    }
    rerender((n) => n + 1);
  }, [report]);

  // Officer names for injury list: from the finished shift's units (or nothing).
  const officers = useMemo(() => {
    const map = new Map<string, Officer & { callsign?: string }>();
    if (sim)
      for (const id of sim.unitOrder ?? Object.keys(sim.units)) {
        const u = sim.units[id];
        u?.crew.forEach((o) => map.set(o.id, { ...o, callsign: u.callsign }));
      }
    const prof = useCareer.getState().profile;
    prof?.staff.forEach((o) => !map.has(o.id) && map.set(o.id, o));
    return map;
  }, [sim]);

  // A daily challenge run (src/sim/daily.ts) goes to the day's own board, never to the normal leaderboard.
  const dailyRun: DailyRun | null = useMemo(() => {
    const day = report && sim && report.shiftKey === shiftKeyOf(sim) ? dailyDateOf(sim) : null;
    if (!day) return null;
    return { day, sector: sim?.sectors?.[0] ?? dailyChallenge(day).sector, started: dailyStartedOf(sim) };
  }, [report, sim]);

  const toMenu = () => quitShift();
  const toCareer = () => {
    quitShift();
    setScreen('career');
  };
  const newShift = () => {
    quitShift();
    setBriefing({ mode: report?.mode === 'tutorial' ? 'free' : (report?.mode ?? 'free') });
    setScreen(report?.mode === 'career' ? 'career' : 'briefing');
  };

  if (!report) {
    return (
      <ShellPage title={t('shell.rep.title')} onBack={() => setScreen('menu')} backTo="menu">
        <section className="vk-panel vk-rep__none" aria-labelledby="vk-rep-none">
          <div className="vk-panel__head">
            <h2 className="vk-h" id="vk-rep-none">
              {t('shell.rep.none')}
            </h2>
          </div>
          <div className="vk-panel__body">
            <p>{t('shell.rep.noneText')}</p>
          </div>
          <div className="vk-panel__foot">
            <button type="button" className="vk-btn vk-btn--primary" onClick={() => setScreen('menu')}>
              {t('shell.rep.toMenu')}
            </button>
          </div>
        </section>
      </ShellPage>
    );
  }

  const st = report.stats;
  const region = regionSummary(report.regionId);
  const allTimes = PRIOS.flatMap((p) => st.responseTimes?.[p] ?? []);
  const avgAll = mean(allTimes);
  const replies = st.repliesCorrect + st.repliesWrong;
  const referrals = st.referralsCorrect + st.referralsWrong;
  const career = report.mode === 'career';
  const cr = careerResult.get(report);
  const issue = (wall(report.end).month - 1) * 31 + wall(report.end).day;
  const grade = report.grade;
  const rep = report.reputationDelta;
  const repText = `${rep >= 0 ? '+' : '−'}${formatDecimal(Math.abs(rep), lang, Number.isInteger(rep) ? 0 : 1)}`;
  const hasHq = career || !!useCareer.getState().profile;

  const cells: {
    key: string;
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    tone?: 'warn' | 'bad' | 'ok';
  }[] = [
    {
      key: 'grade',
      label: t('shell.rep.grade'),
      value: (
        <>
          <span className={`vk-grade vk-grade--${grade}`}>{grade}</span>
          {Math.round(report.score)}
          <small>/100</small>
        </>
      ),
      sub: t(`shell.rep.verdict.${grade}`),
    },
    {
      key: 'incidents',
      label: t('shell.rep.s.incidents'),
      value: st.incidents,
      sub: t('shell.rep.s.closedN', { n: st.closed }),
    },
    {
      key: 'resp',
      label: t('shell.rep.s.avgResp'),
      value:
        avgAll === null ? (
          '-'
        ) : (
          <>
            {formatDecimal(avgAll, lang)}
            <small>min</small>
          </>
        ),
    },
    { key: 'arrests', label: t('shell.rep.s.arrests'), value: st.arrests },
    {
      key: 'calls',
      label: t('shell.rep.s.calls'),
      value: st.callsAnswered,
      sub: t('shell.rep.s.missedN', { n: st.callsMissed }),
      tone: st.callsMissed > 0 ? 'warn' : undefined,
    },
    { key: 'xp', label: t('shell.rep.xp'), value: `+${report.xp}`, sub: report.playerName },
    ...(career
      ? [
          {
            key: 'rep',
            label: t('shell.rep.repShort'),
            value: repText,
            tone: rep > 0 ? ('ok' as const) : rep < 0 ? ('bad' as const) : undefined,
          },
        ]
      : []),
  ];

  const rows: { label: string; value: ReactNode; note?: ReactNode; tone?: 'warn' | 'bad' }[] = [
    {
      label: t('shell.rep.s.replies'),
      value: replies ? `${Math.round((st.repliesCorrect / replies) * 100)} %` : '-',
      note: t('shell.rep.s.queriesN', { n: st.queries }),
    },
    {
      label: t('shell.rep.s.referrals'),
      value: `${st.referralsCorrect}/${referrals}`,
      note: t('shell.rep.s.falseN', { n: st.falseAlarms }),
    },
    { label: t('shell.rep.s.pursuits'), value: `${st.pursuitsCaught}/${st.pursuits}` },
    { label: t('shell.rep.s.expired'), value: st.expired, tone: st.expired > 0 ? 'warn' : undefined },
    {
      label: t('shell.rep.s.injured'),
      value: st.officerInjuries,
      note: t('shell.rep.s.civilN', { n: st.civilianInjuries }),
      tone: st.officerInjuries > 0 ? 'bad' : undefined,
    },
    { label: t('shell.rep.s.km'), value: formatDecimal(report.kmDriven, lang, 0) },
  ];

  return (
    <ShellPage
      title={t('shell.rep.title')}
      subtitle={`${region.name[lang]} · ${ddmmyyyy(report.start)} ${hhmm(report.start)}-${hhmm(report.end)} · ${dailyRun ? t('daily.title') : t(`shell.mode.${report.mode}`)} · ${t(`shell.diff.${report.difficulty}`)}`}
      onBack={toMenu}
      backTo="menu"
      actions={
        <button type="button" className="vk-btn vk-btn--primary vk-go" onClick={newShift} data-sfx="click">
          <span>{t('shell.rep.newShift')}</span>
          <span className="vk-go__key" aria-hidden="true">
            ⏎
          </span>
        </button>
      }
      keys={
        <li>
          <kbd className="vk-kbd">⏎</kbd> {t('shell.rep.newShift').toLocaleLowerCase()}
        </li>
      }
    >
      <Enter fn={newShift} />
      <dl
        className="vk-strip vk-panel vk-rep__strip"
        style={{ '--vk-strip-n': cells.length } as CSSProperties}
      >
        {cells.map((c) => (
          <div key={c.key} className={`vk-strip__cell vk-rep__cell--${c.key}`}>
            <dt>{c.label}</dt>
            <dd className={`vk-strip__value${c.tone ? ` is-${c.tone}` : ''}`}>{c.value}</dd>
            {c.sub && <dd className="vk-strip__sub">{c.sub}</dd>}
          </div>
        ))}
      </dl>

      <div className="vk-rep">
        <div className="vk-rep__col">
          {/* ── Result: the early end and the leaderboard or the daily challenge ── */}
          <section className="vk-panel" aria-labelledby="vk-rep-result">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-rep-result">
                {t('shell.rep.result')}
              </h2>
            </div>
            <div className="vk-rep__lines">
              <p className="vk-rep__line">
                <span className={`vk-grade vk-grade--${grade}`}>{grade}</span>
                <span>
                  <strong>{t(`shell.rep.verdict.${grade}`)}</strong>{' '}
                  <span className="vk-mono">{Math.round(report.score)}</span>/100 {t('shell.rep.points')}
                </span>
              </p>
              <EarlyEndLine report={report} />
              {dailyRun ? <DailyLine report={report} run={dailyRun} /> : <RankLine report={report} />}
            </div>
          </section>

          {/* ── Statistics ── */}
          <section className="vk-panel" aria-labelledby="vk-rep-stats">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-rep-stats">
                {t('shell.rep.stats')}
              </h2>
            </div>
            <table className="vk-table vk-rep__stats">
              <caption>{t('shell.rep.stats')}</caption>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td className={`is-num is-strong${r.tone ? ` vk-rep__${r.tone}` : ''}`}>{r.value}</td>
                    <td className="vk-rep__note">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ── Response times ── */}
          <section className="vk-panel" aria-labelledby="vk-rep-resp">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-rep-resp">
                {t('shell.rep.response')}
              </h2>
            </div>
            <table className="vk-table vk-rep__resp">
              <caption>{t('shell.rep.response')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('shell.rep.col.prio')}</th>
                  <th scope="col" className="is-num">
                    {t('shell.rep.col.avg')}
                  </th>
                  <th scope="col" className="is-num">
                    {t('shell.rep.col.target')}
                  </th>
                  <th scope="col" className="is-num">
                    {t('shell.rep.col.count')}
                  </th>
                  <th scope="col" className="vk-rep__barHead">
                    <span className="vk-sr">{t('shell.rep.col.bar')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {PRIOS.map((p) => (
                  <RespRow
                    key={p}
                    p={p}
                    actual={report.avgResponse?.[p]}
                    count={st.responseTimes?.[p]?.length ?? 0}
                    total={st.byPriority?.[p] ?? 0}
                  />
                ))}
              </tbody>
            </table>
            <p className="vk-rep__foot">{t('shell.rep.responseNote')}</p>
          </section>
        </div>

        <div className="vk-rep__col">
          {/* ── Key moments ── */}
          <section className="vk-panel" aria-labelledby="vk-rep-hl">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-rep-hl">
                {t('shell.rep.highlights')}
              </h2>
              {!!report.highlights?.length && <span className="vk-count">{report.highlights.length}</span>}
            </div>
            {report.highlights?.length ? (
              <ul className="vk-rep__log">
                {report.highlights.map((h, i) => (
                  <li key={`${h.incidentId}-${i}`} className={h.good ? 'is-good' : 'is-bad'}>
                    <span className="vk-rep__mark" aria-hidden="true" />
                    <span className="vk-sr">{t(h.good ? 'shell.rep.good' : 'shell.rep.bad')}: </span>
                    <div>
                      <strong>{h.title[lang] || h.title.et}</strong>
                      <span>
                        <MonoNumbers text={h.text[lang] || h.text.et} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="vk-panel__body vk-dim">{t('shell.rep.noHighlights')}</p>
            )}
            <div className="vk-panel__head vk-rep__subhead">
              <h3 className="vk-h">{t('shell.rep.injuries')}</h3>
              {!!report.injuredOfficers?.length && (
                <span className="vk-count">{report.injuredOfficers.length}</span>
              )}
            </div>
            {report.injuredOfficers?.length ? (
              <ul className="vk-rep__inj">
                {report.injuredOfficers.map((id) => {
                  const o = officers.get(id);
                  return (
                    <li key={id}>
                      {o ? `${o.firstName} ${o.lastName}` : id}
                      {o && 'callsign' in o && o.callsign && (
                        <span className="vk-mono vk-dim"> {o.callsign}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="vk-panel__body vk-dim">{t('shell.rep.noInjuries')}</p>
            )}
          </section>

          {/* ── Career: the ledger as a statement, the inbox ── */}
          {career && (
            <section className="vk-panel" aria-labelledby="vk-rep-career">
              <div className="vk-panel__head">
                <h2 className="vk-h" id="vk-rep-career">
                  {t('shell.rep.career')}
                </h2>
              </div>
              {cr?.error && (
                <p className="vk-msg is-bad vk-rep__err" role="alert">
                  {t('shell.rep.careerError', { err: cr.error })}
                </p>
              )}
              {/* The ledger already holds the bonus, fuel, overtime and fines, so it is the only list. */}
              {cr && cr.ledger.length > 0 && (
                <table className="vk-table vk-rep__ledger">
                  <caption>{t('shell.rep.ledger')}</caption>
                  <tbody>
                    {cr.ledger.map((l, i) => (
                      <EarnRow key={i} label={l.text[lang] || l.text.et} amount={l.amount} />
                    ))}
                  </tbody>
                  <tfoot>
                    <EarnRow label={t('shell.rep.e.net')} amount={ledgerNet(cr.ledger)} total />
                  </tfoot>
                </table>
              )}
              {inbox.length > 0 && (
                <>
                  <div className="vk-panel__head vk-rep__subhead">
                    <h3 className="vk-h">{t('shell.rep.inbox')}</h3>
                    <span className="vk-count">{inbox.length}</span>
                    <button type="button" className="vk-linkbtn vk-rep__read" onClick={clearInbox}>
                      {t('shell.rep.markRead')}
                    </button>
                  </div>
                  <ul className="vk-rep__inbox">
                    {inbox.map((m, i) => (
                      <li key={i}>
                        <MonoNumbers text={m[lang] || m.et} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>
      </div>

      {/* ── Newspaper ── */}
      <section className="vk-rep__paper" aria-labelledby="vk-rep-paper">
        <h2 className="vk-h vk-rep__paperHead" id="vk-rep-paper">
          {t('shell.rep.paper')}
        </h2>
        <Newspaper
          paper={report.newspaper}
          lang={lang}
          issue={issue}
          weather={sim?.weather ? sim.weather.text[lang] : undefined}
        />
      </section>

      <div className="vk-rep__actions">
        <button type="button" className="vk-btn" onClick={toMenu}>
          {t('shell.rep.toMenu')}
        </button>
        {hasHq && (
          <button type="button" className="vk-btn" onClick={toCareer}>
            {t('shell.rep.toHq')}
          </button>
        )}
        <button type="button" className="vk-btn vk-btn--primary" onClick={newShift}>
          {t('shell.rep.newShift')}
        </button>
      </div>
    </ShellPage>
  );
}

/** Enter starts a new shift (the page's main action). */
function Enter({ fn }: { fn: () => void }) {
  const ref = useRef(fn);
  ref.current = fn;
  const stable = useMemo(() => () => ref.current(), []);
  useEnter(stable);
  return null;
}

type RankState =
  { status: 'idle' } | { status: 'sending' } | { status: 'done'; rank: number | null } | { status: 'error' };

/** Grade card note when the shift was ended before its end time (src/sim/report.ts earlyEndFactor). */
function EarlyEndLine({ report }: { report: ShiftReport }) {
  const t = useT();
  const e = (report as ShiftReport & { extras?: ReportExtras }).extras?.earlyEnd;
  if (!e) return null;
  return (
    <p className="vk-rep__line vk-rep__early" data-testid="early-end">
      {t('shell.rep.earlyEnd', {
        served: Math.round(e.served * 100),
        raw: e.rawScore,
        pct: Math.round(e.factor * 100),
      })}
    </p>
  );
}

/** Leaderboard line on the grade card: the player's place (accounts) or a hint (guests). */
function RankLine({ report }: { report: ShiftReport }) {
  const t = useT();
  const backend = useAccount((s) => s.backend);
  const user = useAccount((s) => s.user);
  const cloud = useAccount((s) => s.cloud);
  const gameUser = useGame((s) => s.user);
  const [state, setState] = useState<RankState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const unranked = unrankedReason(report);
  const ranked = unranked === null;
  // Only a shift played signed in to the account goes on its leaderboard: guests never post.
  const loggedIn = !!user && gameUser?.method === 'account';

  useEffect(() => {
    if (!loggedIn || !ranked) return;
    let alive = true;
    setState({ status: 'sending' });
    // submitScoreOnce posts each report exactly once (StrictMode and re-renders included).
    submitScoreOnce(report)
      .then((rank) => alive && setState({ status: 'done', rank }))
      .catch(() => alive && setState({ status: 'error' }));
    return () => {
      alive = false;
    };
  }, [report, loggedIn, ranked, attempt]);

  if (backend !== 'online') return null;
  if (!loggedIn) return <p className="vk-rep__line is-hint">{t('account.rep.guest')}</p>;
  return (
    <>
      {!ranked ? (
        <p className="vk-rep__line is-hint">
          {t(unranked === 'empty' ? 'account.rep.empty' : 'account.rep.notRanked')}
        </p>
      ) : state.status === 'done' ? (
        <p className="vk-rep__line is-rank" data-testid="leaderboard-rank">
          {state.rank ? t('account.rep.rank', { rank: state.rank }) : t('account.rep.ranked')}
          {/* The server ranks within the shift's prefecture. */}
          {state.rank ? <span className="vk-dim">({t(`account.lb.region.${report.regionId}`)})</span> : null}
        </p>
      ) : state.status === 'error' ? (
        <p className="vk-rep__line is-error">
          {t('account.rep.error')}
          <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
            {t('account.rep.retry')}
          </Button>
        </p>
      ) : (
        <p className="vk-rep__line is-hint" role="status">
          <Spinner size={13} /> {t('account.rep.sending')}
        </p>
      )}
      {cloud === 'error' && (
        <p className="vk-rep__line is-error" role="status">
          {t('account.cloud.error')}
        </p>
      )}
    </>
  );
}

type DailyState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'done'; result: DailyResult }
  | { status: 'closed' }
  | { status: 'error' };

/** Daily challenge line on the grade card: the place on the day's board (accounts) or why it did not count. */
function DailyLine({ report, run }: { report: ShiftReport; run: DailyRun }) {
  const t = useT();
  const backend = useAccount((s) => s.backend);
  const user = useAccount((s) => s.user);
  const cloud = useAccount((s) => s.cloud);
  const gameUser = useGame((s) => s.user);
  const [state, setState] = useState<DailyState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const [boardOpen, setBoardOpen] = useState(false);
  // Only a run played signed in to the account counts: guests never post.
  const loggedIn = !!user && gameUser?.method === 'account';
  const empty = !report.stats?.incidents;

  useEffect(() => {
    // A guest's result stays in this browser, for the menu tile.
    if (!loggedIn && !empty) rememberGuestDaily(run.day, report);
  }, [report, run, loggedIn, empty]);

  useEffect(() => {
    if (!loggedIn || empty) return;
    let alive = true;
    setState({ status: 'sending' });
    // submitDailyOnce posts each report exactly once (StrictMode and re-renders included).
    submitDailyOnce(report, run)
      .then((result) => alive && setState({ status: 'done', result }))
      .catch(
        (e: unknown) =>
          alive &&
          setState({ status: e instanceof ApiError && e.code === 'day_closed' ? 'closed' : 'error' }),
      );
    return () => {
      alive = false;
    };
  }, [report, run, loggedIn, empty, attempt]);

  if (!loggedIn)
    return (
      <p className="vk-rep__line is-hint" data-testid="daily-rank">
        {t(backend === 'online' ? 'daily.rep.guest' : 'daily.rep.offline')}
      </p>
    );
  if (empty)
    return (
      <p className="vk-rep__line is-hint" data-testid="daily-rank">
        {t('daily.rep.empty')}
      </p>
    );
  return (
    <>
      {state.status === 'done' ? (
        <div data-testid="daily-rank">
          {/* A replay of the day is practice: the place shown is that of the first, counted run. */}
          {!state.result.counted && <p className="vk-rep__line is-hint">{t('daily.rep.replay')}</p>}
          <p className="vk-rep__line is-rank">
            {t('daily.rep.rank', {
              rank: state.result.rank ?? '-',
              n: state.result.players ?? state.result.rank ?? '-',
            })}
            <Button size="sm" variant="ghost" onClick={() => setBoardOpen(true)}>
              {t('daily.rep.board')}
            </Button>
          </p>
        </div>
      ) : state.status === 'closed' ? (
        <p className="vk-rep__line is-hint" data-testid="daily-rank">
          {t('daily.rep.closed')}
        </p>
      ) : state.status === 'error' ? (
        <p className="vk-rep__line is-error">
          {t('account.rep.error')}
          <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
            {t('account.rep.retry')}
          </Button>
        </p>
      ) : (
        <p className="vk-rep__line is-hint" role="status">
          <Spinner size={13} /> {t('daily.rep.sending')}
        </p>
      )}
      {cloud === 'error' && (
        <p className="vk-rep__line is-error" role="status">
          {t('account.cloud.error')}
        </p>
      )}
      <DailyBoardModal
        open={boardOpen}
        onClose={() => setBoardOpen(false)}
        today={todayInTallinn()}
        day={run.day}
      />
    </>
  );
}

function RespRow({
  p,
  actual,
  count,
  total,
}: {
  p: Priority;
  actual: number | undefined;
  count: number;
  total: number;
}) {
  const lang = useLang();
  const target = SLA_TARGETS[p];
  const tone = responseTone(actual, target);
  // The bar runs to twice the target; the tick is the target.
  const w = actual === undefined ? 0 : Math.min(1, actual / (target * 2));
  return (
    <tr className={`vk-rep__resp--${tone}`}>
      <td>
        <PriorityChip p={p} />
      </td>
      <td className="is-num is-strong vk-rep__respVal">
        {actual === undefined ? '-' : `${formatDecimal(actual, lang)} min`}
      </td>
      <td className="is-num">{target} min</td>
      <td className="is-num">
        {count}/{total}
      </td>
      <td className="vk-rep__barCell">
        <span className="vk-rep__bar" aria-hidden="true">
          <span style={{ width: `${w * 100}%` }} />
        </span>
      </td>
    </tr>
  );
}

function EarnRow({ label, amount, total }: { label: string; amount: number; total?: boolean }) {
  const lang = useLang();
  const tone = Math.round(amount) === 0 ? '' : amount > 0 ? ' vk-up' : ' vk-down';
  return (
    <tr className={total ? 'is-total' : undefined}>
      <th scope="row">{label}</th>
      <td className={`is-num${tone}`}>{formatMoney(amount === 0 ? 0 : amount, lang, true)}</td>
    </tr>
  );
}
