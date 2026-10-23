// End-of-shift report: grade, stats, response times, highlights, career payout and the newspaper.
// Owned by ui-shell.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { shiftKeyOf, useGame } from '@/store/game';
import { useCareer } from '@/store/career';
import { storyPress } from '@/sim/story';
import { useAccount } from '@/net/account';
import { submitScoreOnce, unrankedReason } from '@/net/scores';
import { rememberGuestDaily, submitDailyOnce, type DailyResult, type DailyRun } from '@/net/daily';
import {
  leaveRoom,
  participants,
  roomErrorKey,
  roundOfShift,
  submitRoomResultOnce,
  type Room,
} from '@/net/rooms';
import { ApiError } from '@/net/api';
import { useLang, useT, useTx } from '@/i18n';
import { sfx } from '@/audio/sfx';
import { ddmmyyyy, hhmm, wall } from '@/sim/time';
import type { LedgerEntry, Officer, Priority, ShiftReport } from '@/sim/types';
import type { ReportExtras } from '@/sim/report';
import { dailyChallenge, dailyDateOf, dailyStartedOf, todayInTallinn } from '@/sim/daily';
import { displayRoomCode, roomCodeOf } from '@/sim/room';
import { coopPaidKey, coopXp, type CoopReport, type SeatStats } from '@/sim/coop';
import { sectorById } from '@/sim/sectors';
import { useCoop } from '@/store/coop';
import { Button, Modal, PpaLogo, PriorityChip, Spinner } from '@/ui/components';
import { Newspaper } from './shell/Newspaper';
import { DailyBoardModal } from './shell/Daily';
import { boardCount, ResultsBoard, RoomBoard, useLiveRoom } from './shell/RoomBoard';
import { openLobby } from './shell/lobbyNav';
import { VkLayer } from './shell/VkLayer';
import { ShellPage, useEnter } from './shell/ShellPage';
import { SignedStamp } from './shell/ShellFrame';
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
import './shell/lobby.css';

/** Reports already applied to the career profile (applyReport must run exactly once per report). */
const applied = new WeakSet<ShiftReport>();
const careerResult = new WeakMap<ShiftReport, { ledger: LedgerEntry[]; error?: string }>();
/** Co-op reports whose XP went to the career (once per room and round, keyed room:<code>:<seed>), and how. */
const coopPaid = new WeakMap<ShiftReport, 'paid' | 'already' | 'none'>();

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
  const careerProfile = useCareer((s) => s.profile);
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

  // A multiplayer room run (src/sim/room.ts) goes to the room's board, never to the normal leaderboard.
  const roomCode = useMemo(
    () => (!dailyRun && report && sim && report.shiftKey === shiftKeyOf(sim) ? roomCodeOf(sim) : null),
    [dailyRun, report, sim],
  );
  // A room plays round after round: the shift's seed tells its round apart (docs/MULTIPLAYER.md section 11).
  const roomSeed = roomCode && sim ? sim.seed : undefined;
  // Co-op: the same report for everyone; each player's XP is the team's plus a share for their own seat's work.
  const mySeat = useCoop((s) => s.seat);
  const coopMine = report?.coop?.seats.find((x) => x.seat === mySeat);
  const myXp = report?.coop ? coopXp(report, coopMine?.stats) : undefined;
  const roomSend = useRoomSubmit(report, roomCode, myXp, roomSeed);
  useEffect(() => {
    if (!report?.coop || !roomCode || myXp === undefined || coopPaid.has(report)) return;
    try {
      coopPaid.set(report, useCareer.getState().applyCoopXp(coopPaidKey(roomCode, roomSeed), report, myXp));
    } catch (e) {
      console.warn('[EPD] co-op XP not applied', e);
    }
    rerender((n) => n + 1);
  }, [report, roomCode, myXp, roomSeed]);
  // Left the room from this report (or before the result went in): the way on is a new room, not this one.
  const [leftRoom, setLeftRoom] = useState(false);
  const roomLeft =
    leftRoom || (roomSend.state.status === 'error' && roomSend.state.key === 'rooms.err.left_room');
  // The room was closed or is gone (the panel's poll says so): the way on is a new room there too.
  const [roomShut, setRoomShut] = useState(false);

  const toMenu = () => quitShift();
  /** A room run goes back to its room (the lobby of the next round), never to a quick shift. */
  const toLobby = (code: string | null) => {
    quitShift();
    openLobby(code);
  };
  const toRoom = () => toLobby(roomLeft || roomShut ? null : roomCode);
  const toCareer = () => {
    quitShift();
    setScreen('career');
  };
  const newShift = () => {
    quitShift();
    // A custom game goes back to its draft (the force is still in the briefing).
    if (report?.custom) {
      setScreen('custom');
      return;
    }
    setBriefing({
      mode: report?.mode === 'tutorial' ? 'free' : (report?.mode ?? 'free'),
      custom: undefined,
      sectors: undefined,
    });
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
  // The newspaper's piece about the career's story for the shift just paid (docs/STORY.md).
  const press =
    career && cr && !cr.error && careerProfile
      ? (() => {
          try {
            return storyPress(careerProfile, careerProfile.day - 1);
          } catch {
            return null;
          }
        })()
      : null;

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
    { key: 'xp', label: t('shell.rep.xp'), value: `+${myXp ?? report.xp}`, sub: report.playerName },
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

  // The page's main action: a new shift, or for a room run back to the room (a new room once the player left it).
  const go = roomCode ? toRoom : newShift;
  const goText = roomCode
    ? t(roomLeft || roomShut ? 'rooms.new' : 'rooms.rep.toRoom')
    : t('shell.rep.newShift');

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
    {
      label: t('shell.rep.s.complaints'),
      value: st.complaints ?? 0,
      note: t('shell.rep.s.correctedN', { n: st.repliesCorrected ?? 0 }),
      tone: (st.complaints ?? 0) > 0 ? 'bad' : undefined,
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
      subtitle={`${region.name[lang]} · ${ddmmyyyy(report.start)} ${hhmm(report.start)}-${hhmm(report.end)} · ${dailyRun ? t('daily.title') : roomCode ? t('rooms.rep.mode') : t(`shell.mode.${report.mode}`)} · ${t(`shell.diff.${report.difficulty}`)}`}
      onBack={toMenu}
      backTo="menu"
      actions={
        <button type="button" className="vk-btn vk-btn--primary vk-go" onClick={go} data-sfx="click">
          <span>{goText}</span>
          <span className="vk-go__key" aria-hidden="true">
            ⏎
          </span>
        </button>
      }
      keys={
        <li>
          <kbd className="vk-kbd">⏎</kbd> {goText.toLocaleLowerCase()}
        </li>
      }
    >
      <Enter fn={go} />
      {/* The report as a document of the prefecture's command centre: PPA's letterhead and the digital seal. */}
      <header className="vk-panel vk-rep__letter">
        <PpaLogo height={28} className="vk-rep__logo" />
        <p className="vk-rep__from">
          <strong>{region.name[lang]}</strong>
          <span>
            {t('shell.brief.orderUnit')} · {t('shell.rep.title')}
          </span>
        </p>
        <SignedStamp />
      </header>
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
              {dailyRun ? (
                <DailyLine report={report} run={dailyRun} />
              ) : roomCode ? (
                <RoomLine code={roomCode} send={roomSend} />
              ) : (
                <RankLine report={report} />
              )}
            </div>
          </section>

          {report.coop && (
            <CoopTeam
              coop={report.coop}
              me={mySeat}
              xp={myXp ?? report.xp}
              team={report.xp}
              paid={coopPaid.get(report)}
            />
          )}

          {roomCode && roomSeed !== undefined && (
            <RoomReportBoard
              code={roomCode}
              seed={roomSeed}
              send={roomSend}
              left={roomLeft}
              onShut={setRoomShut}
              onLeft={() => setLeftRoom(true)}
              onBack={toLobby}
            />
          )}

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

          {/* ── What came of the wrong registry answers (src/sim/fallout.ts) ── */}
          {(!!report.fallout?.length || (replies > 0 && st.repliesWrong === 0)) && (
            <section className="vk-panel" aria-labelledby="vk-rep-fallout">
              <div className="vk-panel__head">
                <h2 className="vk-h" id="vk-rep-fallout">
                  {t('shell.rep.fallout')}
                </h2>
                {!!report.fallout?.length && <span className="vk-count">{report.fallout.length}</span>}
              </div>
              {report.fallout?.length ? (
                <ul className="vk-rep__log">
                  {report.fallout.map((f, i) => (
                    <li
                      key={`${f.incidentId}-${i}`}
                      className={f.outcome === 'caught' ? 'is-good' : 'is-bad'}
                    >
                      <span className="vk-rep__mark" aria-hidden="true" />
                      <div>
                        <strong>
                          {hhmm(f.t)} {f.code} · {f.who} · {t(`shell.rep.fo.${f.outcome}`)}
                          {f.late ? ` (${t('shell.rep.fo.late')})` : ''}
                        </strong>
                        <span>
                          {t('shell.rep.fo.said', {
                            said: f.said[lang] || f.said.et,
                            truth: f.truth[lang] || f.truth.et,
                          })}
                        </span>
                        <span>
                          <MonoNumbers text={f.text[lang] || f.text.et} />
                        </span>
                        {(f.trust > 0 || f.penalty > 0) && (
                          <span className="vk-dim">
                            {t('shell.rep.fo.cost', {
                              trust: formatDecimal(f.trust, lang, Number.isInteger(f.trust) ? 0 : 1),
                              points: formatDecimal(f.penalty, lang, Number.isInteger(f.penalty) ? 0 : 1),
                            })}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="vk-panel__body vk-dim">{t('shell.rep.fo.none')}</p>
              )}
            </section>
          )}

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
          extra={press}
          photoKey={report.shiftKey}
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
        <button type="button" className="vk-btn vk-btn--primary" onClick={go}>
          {goText}
        </button>
      </div>
    </ShellPage>
  );
}

/** Enter runs the page's main action (a new shift, or back to the room after a room run). */
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
          {t(
            unranked === 'empty'
              ? 'account.rep.empty'
              : unranked === 'custom'
                ? 'account.rep.custom'
                : 'account.rep.notRanked',
          )}
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

type RoomSend =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'guest' }
  | { status: 'done'; counted: boolean; rank: number | null; room: Room | null }
  | { status: 'error'; key: string; retry: boolean };

/**
 * Sends a room run's result once (accounts only) and keeps the answer for the result line and the board. `seed` is
 * the shift's: the room refuses a result of a round it has already left behind (`round_over`).
 */
function useRoomSubmit(report: ShiftReport | null, code: string | null, xp?: number, seed?: number) {
  const user = useAccount((s) => s.user);
  const gameUser = useGame((s) => s.user);
  const loggedIn = !!user && gameUser?.method === 'account';
  const [state, setState] = useState<RoomSend>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!report || !code) return;
    if (!loggedIn) {
      setState({ status: 'guest' });
      return;
    }
    let alive = true;
    setState({ status: 'sending' });
    submitRoomResultOnce(report, code, xp, seed)
      .then((r) => alive && setState({ status: 'done', ...r }))
      .catch((e: unknown) => {
        if (!alive) return;
        const key = roomErrorKey(e);
        // Network trouble may pass; a refusal (empty shift, left the room, closed) will not.
        setState({ status: 'error', key, retry: /\.(network|timeout|other|rate_limited)$/.test(key) });
      });
    return () => {
      alive = false;
    };
  }, [report, code, loggedIn, attempt, seed]);
  return { state, retry: () => setAttempt((n) => n + 1) };
}

/** The room line on the grade card: the place in the room, or why the result is not on its board. */
function RoomLine({ code, send }: { code: string; send: ReturnType<typeof useRoomSubmit> }) {
  const t = useT();
  const { state } = send;
  if (state.status === 'guest')
    return (
      <p className="vk-rep__line is-hint" data-testid="room-rank">
        {t('rooms.rep.guest')}
      </p>
    );
  if (state.status === 'done') {
    const n = state.room ? Math.max(state.room.results.length, participants(state.room).length) : null;
    return (
      <div data-testid="room-rank">
        {!state.counted && <p className="vk-rep__line is-hint">{t('rooms.rep.replay')}</p>}
        <p className="vk-rep__line is-rank">
          {t('rooms.rep.rank', { code: displayRoomCode(code), rank: state.rank ?? '-', n: n ?? '-' })}
        </p>
      </div>
    );
  }
  if (state.status === 'error')
    return (
      <p className={`vk-rep__line ${state.retry ? 'is-error' : 'is-hint'}`} data-testid="room-rank">
        {t(state.key)}
        {state.retry && (
          <Button size="sm" variant="ghost" onClick={send.retry}>
            {t('account.rep.retry')}
          </Button>
        )}
      </p>
    );
  return (
    <p className="vk-rep__line is-hint" role="status">
      <Spinner size={13} /> {t('rooms.rep.sending')}
    </p>
  );
}

/**
 * The room on the report: the board of this shift's round (live while the round is on, the room's last round once the
 * room has opened for the next one), what the room is doing now, and the way back into it or out of it. Kept current
 * while the report is open, so the player also counts as here for the next round's start.
 */
function RoomReportBoard({
  code,
  seed,
  send,
  left,
  onLeft,
  onShut,
  onBack,
}: {
  code: string;
  seed: number;
  send: ReturnType<typeof useRoomSubmit>;
  left: boolean;
  onLeft: () => void;
  /** The room was closed or is gone: the page's main action is a new room too. */
  onShut: (shut: boolean) => void;
  /** Into the room's lobby (the next round), or with null to the multiplayer screen (a new room). */
  onBack: (code: string | null) => void;
}) {
  const t = useT();
  const sent = send.state.status === 'done' ? send.state.room : null;
  const active = !left && (send.state.status === 'done' || send.state.status === 'error');
  const { room, gone } = useLiveRoom(code, sent, active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // The result is still on its way (or waits for a retry): leaving now would lose it, so the player is asked first.
  const pending = send.state.status === 'sending' || (send.state.status === 'error' && send.state.retry);
  const round = room ? roundOfShift(room, seed) : null;
  const roomHost = room?.players.find((p) => p.host);
  // A player who left before the result went in has no room in hand (nothing is polled): the panel says so.
  const status = left
    ? t(send.state.status === 'done' ? 'rooms.rep.left' : 'rooms.run.left')
    : gone
      ? t('rooms.gone')
      : !room
        ? null
        : room.state === 'closed'
          ? t('rooms.rep.closed')
          : room.state === 'lobby'
            ? roomHost && roomHost.id === room.me
              ? t('rooms.rep.openMine')
              : t('rooms.rep.open', { name: roomHost?.name ?? '' })
            : round?.current
              ? t(room.state === 'running' ? 'rooms.rep.wait' : 'rooms.rep.over')
              : t(room.state === 'running' ? 'rooms.rep.next' : 'rooms.rep.over');
  const open = !left && !gone && room?.state !== 'closed';
  const shut = gone || room?.state === 'closed';
  useEffect(() => onShut(shut), [shut]);
  const leave = async () => {
    setConfirmLeave(false);
    setBusy(true);
    setError(null);
    try {
      await leaveRoom(code);
      onLeft();
    } catch (e) {
      sfx.play('error');
      setError(t(roomErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };
  const live = !!round?.current && room?.state === 'running';
  return (
    <section className="vk-panel" aria-labelledby="vk-rep-room" data-testid="room-report">
      <div className="vk-panel__head vk-mp__boardHead">
        <h2 className="vk-h" id="vk-rep-room">
          {t('rooms.board.titleCode', { code: displayRoomCode(code) })}
        </h2>
        {room && round && (
          <span className="vk-meta">
            {round.round > 1 ? `${t('rooms.round', { n: round.round })} · ` : ''}
            {round.current ? `${boardCount(t, room)} · ` : ''}
            {live ? t('rooms.board.live') : t('rooms.board.final')}
          </span>
        )}
      </div>
      {!room ? (
        left || gone ? null : (
          <p className="vk-mp__state" role="status">
            <Spinner size={14} /> {t('rooms.rep.sending')}
          </p>
        )
      ) : round?.current ? (
        <RoomBoard room={room} />
      ) : round ? (
        <ResultsBoard
          results={round.results}
          me={room.me}
          caption={t('rooms.last.caption', { n: round.round })}
        />
      ) : null}
      {status && (
        <p
          className={`vk-rep__roomState${open && room?.state === 'lobby' ? ' is-open' : ''}`}
          role="status"
          data-testid="room-report-state"
        >
          {status}
        </p>
      )}
      {error && (
        <p className="vk-msg is-bad vk-mp__err" role="alert">
          {error}
        </p>
      )}
      <div className="vk-panel__foot vk-rep__roomFoot">
        <span className="vk-rep__roomNote">{t('rooms.board.note')}</span>
        {open && (
          <button
            type="button"
            className="vk-btn vk-btn--ghost"
            onClick={() => (pending ? setConfirmLeave(true) : void leave())}
            disabled={busy}
          >
            {t('rooms.leave')}
          </button>
        )}
        <button
          type="button"
          className="vk-btn vk-rep__toRoom"
          onClick={() => onBack(open ? code : null)}
          disabled={busy}
        >
          {t(open ? 'rooms.rep.toRoom' : 'rooms.new')}
        </button>
      </div>
      {confirmLeave && (
        <VkLayer>
          <Modal
            open
            onClose={() => setConfirmLeave(false)}
            title={t('rooms.leave')}
            width={460}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmLeave(false)}>
                  {t('rooms.leave.no')}
                </Button>
                <Button variant="danger" onClick={() => void leave()}>
                  {t('rooms.leave.yes')}
                </Button>
              </>
            }
          >
            <div className="vk-dialog">
              <p>{t('rooms.rep.leaveConfirm')}</p>
            </div>
          </Modal>
        </VkLayer>
      )}
    </section>
  );
}

/** Co-op: what each desk did in the shared shift, and this player's XP. The same table on every player's report. */
function CoopTeam({
  coop,
  me,
  xp,
  team,
  paid,
}: {
  coop: CoopReport;
  me: number;
  xp: number;
  team: number;
  paid?: 'paid' | 'already' | 'none';
}) {
  const t = useT();
  const tx = useTx();
  const sector = coop.mode === 'sector';
  const cols: (keyof SeatStats)[] = sector
    ? ['calls', 'created', 'sent', 'lent', 'helped']
    : ['calls', 'created', 'acks', 'sent', 'radio'];
  const colKey = (c: keyof SeatStats) =>
    c === 'lent' || c === 'helped' ? `desk.rep.col.${c}` : `coop.rep.col.${c}`;
  return (
    <section className="vk-panel" aria-labelledby="vk-rep-coop" data-testid="coop-report">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-rep-coop">
          {t('coop.rep.title')}
        </h2>
        <span className="vk-meta">{t('coop.rep.meta')}</span>
      </div>
      <div className="vk-rep__coopWrap">
        <table className="vk-table vk-rep__coop">
          <caption>{t('coop.rep.title')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('coop.rep.col.player')}</th>
              <th scope="col">{t('coop.rep.col.role')}</th>
              {cols.map((c) => (
                <th key={c} scope="col" className="is-num">
                  {t(colKey(c))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coop.seats.map((x) => (
              <tr key={x.seat} className={x.seat === me ? 'is-me' : undefined} data-testid="coop-report-row">
                <th scope="row">
                  {x.name}
                  {x.seat === me && <span className="vk-dim"> ({t('rooms.badge.you')})</span>}
                </th>
                <td>
                  {x.desk
                    ? tx(sectorById(x.desk)?.name ?? { et: x.desk, en: x.desk })
                    : t(`coop.role.${x.role}`)}
                </td>
                {cols.map((c) => (
                  <td key={c} className="is-num vk-mono">
                    {x.stats[c] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {coop.desks && <DeskTable coop={coop} me={me} />}
      <div className="vk-panel__foot">
        <span data-testid="coop-xp">
          {t('coop.rep.xp', { xp, team, own: xp - team })}{' '}
          {paid === 'paid'
            ? t('coop.rep.career')
            : paid === 'already'
              ? t('coop.rep.careerPaid')
              : paid === 'none'
                ? t('coop.rep.noCareer')
                : ''}
        </span>
      </div>
    </section>
  );
}

/** Sector co-op: one row per desk, who ran it (a player, or its AI colleague) and what it did. The same everywhere. */
function DeskTable({ coop, me }: { coop: CoopReport; me: number }) {
  const t = useT();
  const tx = useTx();
  // Calls and crews sent are in the players' table above; here what crossed the borders.
  const cols = ['incidents', 'closed', 'lent', 'helped', 'handover', 'taken'] as const;
  const mine = coop.seats.find((x) => x.seat === me)?.desk;
  return (
    <div className="vk-rep__coopWrap" data-testid="desk-report">
      <p className="vk-rep__coopSub" aria-hidden="true">
        {t('desk.rep.title')} <span className="vk-dim">· {t('desk.rep.meta')}</span>
      </p>
      <table className="vk-table vk-rep__coop">
        <caption>{t('desk.rep.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('desk.rep.col.desk')}</th>
            <th scope="col">{t('desk.rep.col.who')}</th>
            {cols.map((c) => (
              <th key={c} scope="col" className="is-num">
                {t(`desk.rep.col.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(coop.desks ?? []).map((d) => {
            const names = coop.seats.filter((x) => d.seats.includes(x.seat)).map((x) => x.name);
            return (
              <tr
                key={d.desk}
                className={d.desk === mine ? 'is-me' : undefined}
                data-testid="desk-report-row"
              >
                <th scope="row">{tx(sectorById(d.desk)?.name ?? { et: d.desk, en: d.desk })}</th>
                <td>{names.length ? names.join(', ') : t('desk.colleague', { name: d.colleague })}</td>
                {cols.map((c) => (
                  <td key={c} className="is-num vk-mono">
                    {d[c]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
