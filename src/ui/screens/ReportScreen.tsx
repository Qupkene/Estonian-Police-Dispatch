// End-of-shift report: grade, stats, response times, highlights, career payout and the newspaper.
// Owned by ui-shell.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame } from '@/store/game';
import { useCareer } from '@/store/career';
import { useAccount } from '@/net/account';
import { submitScoreOnce, unrankedReason } from '@/net/scores';
import { useLang, useT } from '@/i18n';
import { sfx } from '@/audio/sfx';
import { ddmmyyyy, hhmm, wall } from '@/sim/time';
import type { LedgerEntry, Officer, Priority, ShiftReport } from '@/sim/types';
import { Badge, Button, Empty, Icon, PriorityChip, Spinner, type IconName } from '@/ui/components';
import { Newspaper } from './shell/Newspaper';
import { ShellPage } from './shell/ShellPage';
import {
  formatDecimal,
  formatMoney,
  gradeTone,
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
      <ShellPage title={t('shell.rep.title')} icon="newspaper" onBack={() => setScreen('menu')}>
        <div className="sh-card sh-card--pad">
          <Empty
            icon="newspaper"
            title={t('shell.rep.none')}
            action={
              <Button variant="primary" icon="home" onClick={() => setScreen('menu')}>
                {t('shell.rep.toMenu')}
              </Button>
            }
          >
            {t('shell.rep.noneText')}
          </Empty>
        </div>
      </ShellPage>
    );
  }

  const st = report.stats;
  const region = regionSummary(report.regionId);
  const tone = gradeTone(report.grade);
  const allTimes = PRIOS.flatMap((p) => st.responseTimes?.[p] ?? []);
  const avgAll = mean(allTimes);
  const replies = st.repliesCorrect + st.repliesWrong;
  const career = report.mode === 'career';
  const cr = careerResult.get(report);
  const issue = (wall(report.end).month - 1) * 31 + wall(report.end).day;

  return (
    <ShellPage
      title={t('shell.rep.title')}
      subtitle={`${region.name[lang]} · ${ddmmyyyy(report.start)} ${hhmm(report.start)}-${hhmm(report.end)} · ${t(`shell.mode.${report.mode}`)} · ${t(`shell.diff.${report.difficulty}`)}`}
      icon="newspaper"
      onBack={toMenu}
      actions={
        <Button variant="primary" icon="play" onClick={newShift}>
          {t('shell.rep.newShift')}
        </Button>
      }
    >
      <div className="sh-rep">
        {/* ── Grade ── */}
        <section className={`sh-card sh-grade sh-grade--${tone}`}>
          <GradeRing grade={report.grade} score={report.score} />
          <div className="sh-grade__text">
            <div className="sh-grade__label">{t('shell.rep.grade')}</div>
            <div className="sh-grade__verdict">{t(`shell.rep.verdict.${report.grade}`)}</div>
            <div className="sh-grade__score">
              <span className="mono">{Math.round(report.score)}</span> / 100 {t('shell.rep.points')}
            </div>
            <RankLine report={report} />
            <div className="sh-grade__chips">
              <Badge tone="accent" icon="star">
                +{report.xp} XP
              </Badge>
              {career && (
                <Badge tone={report.reputationDelta >= 0 ? 'ok' : 'danger'} icon="trophy">
                  {t('shell.rep.repShort')} {report.reputationDelta >= 0 ? '+' : '−'}
                  {formatDecimal(
                    Math.abs(report.reputationDelta),
                    lang,
                    Number.isInteger(report.reputationDelta) ? 0 : 1,
                  )}
                </Badge>
              )}
              <Badge tone="neutral" icon="user">
                {report.playerName}
              </Badge>
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="sh-card sh-card--pad sh-rep__stats">
          <h2 className="sh-section-title">
            <Icon name="stats" size={14} /> {t('shell.rep.stats')}
          </h2>
          <div className="sh-tiles">
            <Tile
              icon="list"
              label={t('shell.rep.s.incidents')}
              value={st.incidents}
              sub={t('shell.rep.s.closedN', { n: st.closed })}
            />
            <Tile
              icon="timer"
              label={t('shell.rep.s.avgResp')}
              value={avgAll === null ? '-' : `${formatDecimal(avgAll, lang)} min`}
            />
            <Tile icon="handcuffs" label={t('shell.rep.s.arrests')} value={st.arrests} />
            <Tile
              icon="phone"
              label={t('shell.rep.s.calls')}
              value={st.callsAnswered}
              sub={st.callsMissed ? t('shell.rep.s.missedN', { n: st.callsMissed }) : undefined}
              warn={st.callsMissed > 0}
            />
            <Tile
              icon="fingerprint"
              label={t('shell.rep.s.replies')}
              value={replies ? `${Math.round((st.repliesCorrect / replies) * 100)}%` : '-'}
              sub={t('shell.rep.s.queriesN', { n: st.queries })}
            />
            <Tile
              icon="car"
              label={t('shell.rep.s.pursuits')}
              value={`${st.pursuitsCaught}/${st.pursuits}`}
            />
            <Tile icon="clock" label={t('shell.rep.s.expired')} value={st.expired} warn={st.expired > 0} />
            <Tile
              icon="ambulance"
              label={t('shell.rep.s.injured')}
              value={st.officerInjuries}
              sub={t('shell.rep.s.civilN', { n: st.civilianInjuries })}
              warn={st.officerInjuries > 0}
            />
            <Tile icon="route" label={t('shell.rep.s.km')} value={formatDecimal(report.kmDriven, lang, 0)} />
            <Tile
              icon="flag"
              label={t('shell.rep.s.referrals')}
              value={`${st.referralsCorrect}/${st.referralsCorrect + st.referralsWrong}`}
              sub={t('shell.rep.s.falseN', { n: st.falseAlarms })}
            />
          </div>
        </section>

        {/* ── Response times ── */}
        <section className="sh-card sh-card--pad sh-rep__resp">
          <h2 className="sh-section-title">
            <Icon name="gauge" size={14} /> {t('shell.rep.response')}
          </h2>
          <div className="sh-resp">
            {PRIOS.map((p) => (
              <RespBar
                key={p}
                p={p}
                actual={report.avgResponse?.[p]}
                count={st.responseTimes?.[p]?.length ?? 0}
                total={st.byPriority?.[p] ?? 0}
              />
            ))}
          </div>
          <p className="sh-dim sh-resp__note">{t('shell.rep.responseNote')}</p>
        </section>

        {/* ── Highlights ── */}
        <section className="sh-card sh-card--pad sh-rep__hl">
          <h2 className="sh-section-title">
            <Icon name="flag" size={14} /> {t('shell.rep.highlights')}
          </h2>
          {report.highlights?.length ? (
            <ul className="sh-hl">
              {report.highlights.map((h, i) => (
                <li key={`${h.incidentId}-${i}`} className={h.good ? 'is-good' : 'is-bad'}>
                  <Icon name={h.good ? 'check' : 'warning'} size={16} />
                  <div>
                    <strong>{h.title[lang] || h.title.et}</strong>
                    <span>{h.text[lang] || h.text.et}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sh-muted">{t('shell.rep.noHighlights')}</p>
          )}
          <h2 className="sh-section-title sh-rep__gap">
            <Icon name="ambulance" size={14} /> {t('shell.rep.injuries')}
          </h2>
          {report.injuredOfficers?.length ? (
            <ul className="sh-inj">
              {report.injuredOfficers.map((id) => {
                const o = officers.get(id);
                return (
                  <li key={id}>
                    <Icon name="user" size={14} />
                    {o ? `${o.firstName} ${o.lastName}` : id}
                    {o && 'callsign' in o && o.callsign && (
                      <span className="mono sh-dim"> · {o.callsign}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="sh-muted">{t('shell.rep.noInjuries')}</p>
          )}
        </section>

        {/* ── Career ── */}
        {career && (
          <section className="sh-card sh-card--pad sh-rep__career">
            <h2 className="sh-section-title">
              <Icon name="money" size={14} /> {t('shell.rep.career')}
            </h2>
            {cr?.error && (
              <p className="sh-error" role="alert">
                <Icon name="warning" size={16} /> {t('shell.rep.careerError', { err: cr.error })}
              </p>
            )}
            <div className="sh-career">
              {/* The ledger already holds the bonus, fuel, overtime and fines, so it is the only list. */}
              <div className="sh-earn">
                {cr && cr.ledger.length > 0 && (
                  <>
                    <h3 className="sh-rep__sub">{t('shell.rep.ledger')}</h3>
                    {cr.ledger.map((l, i) => (
                      <EarnRow key={i} label={l.text[lang] || l.text.et} amount={l.amount} />
                    ))}
                    <EarnRow label={t('shell.rep.e.net')} amount={ledgerNet(cr.ledger)} total />
                  </>
                )}
              </div>
              <div className="sh-career__side">
                {inbox.length > 0 && (
                  <>
                    <h3 className="sh-rep__sub">
                      {t('shell.rep.inbox')} <Badge tone="info">{inbox.length}</Badge>
                    </h3>
                    <ul className="sh-inbox">
                      {inbox.map((m, i) => (
                        <li key={i}>
                          <Icon name="send" size={14} />
                          {m[lang] || m.et}
                        </li>
                      ))}
                    </ul>
                    <Button size="sm" variant="ghost" icon="check" onClick={clearInbox}>
                      {t('shell.rep.markRead')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Newspaper ── */}
        <section className="sh-rep__paper">
          <h2 className="sh-section-title">
            <Icon name="newspaper" size={14} /> {t('shell.rep.paper')}
          </h2>
          <Newspaper
            paper={report.newspaper}
            lang={lang}
            issue={issue}
            weather={sim?.weather ? sim.weather.text[lang] : undefined}
          />
        </section>

        <section className="sh-rep__actions">
          <Button size="lg" icon="home" onClick={toMenu}>
            {t('shell.rep.toMenu')}
          </Button>
          {(career || useCareer.getState().profile) && (
            <Button size="lg" icon="building" onClick={toCareer}>
              {t('shell.rep.toHq')}
            </Button>
          )}
          <Button size="lg" variant="primary" icon="play" onClick={newShift}>
            {t('shell.rep.newShift')}
          </Button>
        </section>
      </div>
    </ShellPage>
  );
}

type RankState = { status: 'idle' } | { status: 'sending' } | { status: 'done'; rank: number | null } | { status: 'error' };

/** Leaderboard line on the grade card: the player's place (accounts) or a hint (guests). */
function RankLine({ report }: { report: ShiftReport }) {
  const t = useT();
  const backend = useAccount((s) => s.backend);
  const user = useAccount((s) => s.user);
  const cloud = useAccount((s) => s.cloud);
  const [state, setState] = useState<RankState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const unranked = unrankedReason(report);
  const ranked = unranked === null;
  const loggedIn = !!user;

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
  if (!loggedIn)
    return (
      <p className="sh-grade__rank sh-grade__rank--hint">
        <Icon name="cloud" size={14} /> {t('account.rep.guest')}
      </p>
    );
  return (
    <>
      {!ranked ? (
        <p className="sh-grade__rank sh-grade__rank--hint">
          {t(unranked === 'empty' ? 'account.rep.empty' : 'account.rep.notRanked')}
        </p>
      ) : state.status === 'done' ? (
        <p className="sh-grade__rank" data-testid="leaderboard-rank">
          <Icon name="trophy" size={15} />
          {state.rank ? t('account.rep.rank', { rank: state.rank }) : t('account.rep.ranked')}
          {/* The server ranks within the shift's prefecture. */}
          {state.rank ? <span className="sh-grade__rankRegion">({t(`account.lb.region.${report.regionId}`)})</span> : null}
        </p>
      ) : state.status === 'error' ? (
        <p className="sh-grade__rank sh-grade__rank--error">
          <Icon name="warning" size={14} /> {t('account.rep.error')}
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>
            {t('account.rep.retry')}
          </Button>
        </p>
      ) : (
        <p className="sh-grade__rank sh-grade__rank--hint" role="status">
          <Spinner size={13} /> {t('account.rep.sending')}
        </p>
      )}
      {cloud === 'error' && (
        <p className="sh-grade__rank sh-grade__rank--error" role="status">
          <Icon name="cloud" size={14} /> {t('account.cloud.error')}
        </p>
      )}
    </>
  );
}

function GradeRing({ grade, score }: { grade: ShiftReport['grade']; score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="sh-ring" aria-label={`${grade} · ${Math.round(score)}/100`} role="img">
      <svg viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} className="sh-ring__track" />
        <circle
          cx="64"
          cy="64"
          r={r}
          className="sh-ring__val"
          strokeDasharray={`${c * v} ${c}`}
          transform="rotate(-90 64 64)"
        />
      </svg>
      <span className="sh-ring__grade">{grade}</span>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className={`sh-tile${warn ? ' is-warn' : ''}`}>
      <Icon name={icon} size={16} />
      <div className="sh-tile__value">{value}</div>
      <div className="sh-tile__label">{label}</div>
      {sub && <div className="sh-tile__sub">{sub}</div>}
    </div>
  );
}

function RespBar({
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
  const t = useT();
  const lang = useLang();
  const target = SLA_TARGETS[p];
  const tone = responseTone(actual, target);
  const max = target * 2;
  const w = actual === undefined ? 0 : Math.min(1, actual / max);
  return (
    <div className={`sh-resp__row sh-resp__row--${tone}`}>
      <PriorityChip p={p} />
      <svg className="sh-resp__bar" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="3" width="200" height="8" rx="4" className="sh-resp__track" />
        <rect
          x="0"
          y="3"
          width={Math.max(actual === undefined ? 0 : 4, 200 * w)}
          height="8"
          rx="4"
          className="sh-resp__fill"
        />
        <line x1="100" x2="100" y1="0" y2="14" className="sh-resp__target" />
      </svg>
      <div className="sh-resp__val">
        <strong className="mono">{actual === undefined ? '-' : `${formatDecimal(actual, lang)} min`}</strong>
        <span className="sh-dim">
          {t('shell.rep.target', { min: target })} · {count}/{total}
        </span>
      </div>
    </div>
  );
}

function EarnRow({ label, amount, total }: { label: string; amount: number; total?: boolean }) {
  const lang = useLang();
  return (
    <div className={`sh-earn__row${total ? ' is-total' : ''}`}>
      <span>{label}</span>
      <span className={`mono ${Math.round(amount) === 0 ? 'is-zero' : amount > 0 ? 'is-plus' : 'is-minus'}`}>
        {formatMoney(amount === 0 ? 0 : amount, lang, true)}
      </span>
    </div>
  );
}
