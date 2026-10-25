// Ühine raport (2.36.0, docs/MULTIPLAYER.md section 14): the joint report of a co-op shift, the same on every
// player's report and again in the history (RoomHistory.tsx). The awards, a card per player with their picture,
// the moments of the shift on a timeline, the desks of a sector room, and a picture of it all to share.
import { useState, type ReactNode } from 'react';
import { useLang, useT, useTx } from '@/i18n';
import { avgResponse, coopAwards, type Award, type RoomSummary } from '@/sim/joint';
import type { CoopReportSeat } from '@/sim/coop';
import { crisisById } from '@/data/crises';
import { taskSpec } from '@/sim/crisis';
import type { CoopMoment, ReportMoment } from '@/sim/moments';
import { sectorById } from '@/sim/sectors';
import { hhmm } from '@/sim/time';
import { Icon, PlayerAvatar, type IconName } from '@/ui/components';
import { AWARD_ICON, AWARD_TONE } from './jointArt';
import { shareJointPicture } from './jointShare';
import './report.css';
import './joint.css';

/** "42 s", "4 min 7 s": a response time in game ms (the same in both languages). */
export function respText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** The award's name (helpers are neighbours in sector co-op, colleagues in role co-op). */
export function awardName(a: Award, mode: RoomSummary['coop']['mode'], t: ReturnType<typeof useT>): string {
  return a.id === 'helper'
    ? t(`joint.award.helper.${mode === 'sector' ? 'sector' : 'role'}`)
    : t(`joint.award.${a.id}`);
}

/** Why the seat won it, in a line. */
export function awardWhy(a: Award, mode: RoomSummary['coop']['mode'], t: ReturnType<typeof useT>): string {
  if (a.id === 'fastest' || a.id === 'snail')
    return t(`joint.award.${a.id}.why`, { time: respText(a.value) });
  if (a.id === 'helper')
    return t(`joint.award.helper.why.${mode === 'sector' ? 'sector' : 'role'}`, { n: a.value });
  return t(`joint.award.${a.id}.why`, { n: a.value });
}

export function AwardIcon({ id, size = 22 }: { id: Award['id']; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {AWARD_ICON[id].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export interface JointReportProps {
  summary: RoomSummary;
  /** The player's own seat (marked), or -1. */
  me: number;
  /** A seat's profile picture ('face:<id>', 'draw:<seed>'; missing: the drawing of the name). */
  avatarOf?: (seat: CoopReportSeat) => string | undefined;
  /** The team's result above the awards (the history; the report has its own result card). */
  team?: boolean;
  /** At the foot, before the share button: the report's XP line. */
  foot?: ReactNode;
}

export function JointReport({ summary, me, avatarOf, team = false, foot }: JointReportProps) {
  const t = useT();
  const lang = useLang();
  const coop = summary.coop;
  const awards = coopAwards(coop);
  const seats = coop.seats;
  const name = (seat: number) => {
    const x = seats.find((y) => y.seat === seat);
    return x ? x.name || t('joint.deleted') : '?';
  };
  const avatar = (x: CoopReportSeat) => avatarOf?.(x);
  const [share, setShare] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');
  const doShare = async () => {
    if (share === 'busy') return;
    setShare('busy');
    try {
      const how = await shareJointPicture(summary, lang, (x) => avatar(x));
      setShare(how === 'downloaded' ? 'saved' : 'idle');
    } catch {
      setShare('failed');
    }
  };
  return (
    <section className="vk-panel vk-joint" aria-labelledby="vk-joint-title" data-testid="coop-report">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-joint-title">
          {t('joint.title')}
        </h2>
        <span className="vk-meta">{t('joint.meta')}</span>
      </div>
      {team && <TeamLine summary={summary} />}
      {awards.length > 0 && (
        <div className="vk-joint__block">
          <h3 className="vk-joint__sub">{t('joint.awards')}</h3>
          <ul className="vk-joint__awards" data-testid="joint-awards">
            {awards.map((a) => {
              const x = seats.find((y) => y.seat === a.seat);
              return (
                <li
                  key={a.id}
                  className={`vk-joint__award is-${a.id}${a.seat === me ? ' is-me' : ''}`}
                  style={{ ['--tone' as string]: AWARD_TONE[a.id] }}
                  data-award={a.id}
                >
                  <span className="vk-joint__medal">
                    <AwardIcon id={a.id} size={24} />
                  </span>
                  <span className="vk-joint__awardName">{awardName(a, coop.mode, t)}</span>
                  <span className="vk-joint__winner">
                    {x && (
                      <PlayerAvatar
                        avatar={avatar(x)}
                        name={x.name || '?'}
                        size={22}
                        className="vk-joint__pic"
                      />
                    )}
                    <strong>{name(a.seat)}</strong>
                  </span>
                  <span className="vk-joint__why">{awardWhy(a, coop.mode, t)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="vk-joint__block">
        <h3 className="vk-joint__sub">{t('joint.players')}</h3>
        <ul className="vk-joint__cards">
          {seats.map((x) => (
            <PlayerCard
              key={x.seat}
              x={x}
              mode={coop.mode}
              me={x.seat === me}
              avatar={avatar(x)}
              awards={awards.filter((a) => a.seat === x.seat)}
            />
          ))}
        </ul>
      </div>
      <Timeline summary={summary} me={me} avatar={avatar} />
      {coop.desks && coop.desks.length > 0 && <DeskTable summary={summary} me={me} />}
      <div className="vk-panel__foot vk-joint__foot">
        <span className="vk-joint__footText">{foot}</span>
        {share === 'saved' && (
          <span className="vk-joint__shareMsg" role="status">
            {t('joint.share.saved')}
          </span>
        )}
        {share === 'failed' && (
          <span className="vk-joint__shareMsg is-bad" role="alert">
            {t('joint.share.failed')}
          </span>
        )}
        <button
          type="button"
          className="vk-btn"
          onClick={() => void doShare()}
          disabled={share === 'busy'}
          data-testid="joint-share"
        >
          {share === 'busy' ? t('joint.share.busy') : t('joint.share')}
        </button>
      </div>
    </section>
  );
}

/** The team's grade, points, incidents and arrests (the history's view of a round). */
function TeamLine({ summary }: { summary: RoomSummary }) {
  const t = useT();
  const grade = summary.grade;
  return (
    <p className="vk-joint__team">
      <span className={`vk-grade vk-grade--${grade}`}>{grade}</span>
      <span>
        <strong className="vk-mono">{summary.score}</strong>/100 {t('shell.rep.points')} ·{' '}
        {t('joint.img.incidents', { n: summary.incidents })} ·{' '}
        {t('joint.img.arrests', { n: summary.arrests })}
      </span>
    </p>
  );
}

function PlayerCard({
  x,
  mode,
  me,
  avatar,
  awards,
}: {
  x: CoopReportSeat;
  mode: RoomSummary['coop']['mode'];
  me: boolean;
  avatar?: string;
  awards: Award[];
}) {
  const t = useT();
  const tx = useTx();
  const st = x.stats;
  const resp = avgResponse(st);
  const sector = mode === 'sector';
  const cells: [string, string, string?][] = [
    ['calls', String(st.calls)],
    ['worked', String(x.worked ?? 0)],
    ['sent', String(st.sent)],
    ['resp', resp === null ? '-' : respText(resp), t('joint.stat.resp.hint')],
    ...((sector
      ? [
          ['lent', String(st.lent)],
          ['helped', String(st.helped)],
        ]
      : [
          ['radio', String(st.radio)],
          ['queries', String(st.queries)],
        ]) as [string, string][]),
  ];
  const where = x.desk
    ? tx(sectorById(x.desk)?.name ?? { et: x.desk, en: x.desk })
    : t(`coop.role.${x.role}`);
  return (
    <li className={`vk-joint__card${me ? ' is-me' : ''}`} data-testid="coop-report-row">
      <div className="vk-joint__cardHead">
        <PlayerAvatar avatar={avatar} name={x.name || '?'} size={48} className="vk-joint__cardPic" />
        <div className="vk-joint__who">
          <strong className="vk-joint__name">
            {x.name || t('joint.deleted')}
            {me && <span className="vk-dim"> ({t('joint.you')})</span>}
          </strong>
          <span className="vk-joint__where">
            {where}
            {!x.present && <span className="vk-dim"> · {t('joint.left')}</span>}
          </span>
        </div>
      </div>
      <dl className="vk-joint__stats">
        {cells.map(([k, v, hint]) => (
          <div key={k} className="vk-joint__stat" title={hint}>
            <dt>{t(`joint.stat.${k}`)}</dt>
            <dd className="vk-mono">{v}</dd>
          </div>
        ))}
      </dl>
      {awards.length > 0 && (
        <ul className="vk-joint__badges" aria-label={t('joint.awards')}>
          {awards.map((a) => (
            <li key={a.id} className="vk-joint__badge" style={{ ['--tone' as string]: AWARD_TONE[a.id] }}>
              <AwardIcon id={a.id} size={14} />
              {awardName(a, mode, t)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** One line of the timeline: what to say and whose pictures go with it. */
function momentLine(
  m: ReportMoment,
  summary: RoomSummary,
  t: ReturnType<typeof useT>,
  tx: ReturnType<typeof useTx>,
): { title: string; text?: string; seats: number[] } {
  const seats = summary.coop.seats;
  const name = (seat: number | undefined, desk?: string) => {
    if (seat === undefined || seat < 0) {
      const colleague = summary.coop.desks?.find((d) => d.desk === desk)?.colleague;
      return colleague ? t('joint.colleague', { name: colleague }) : '?';
    }
    const x = seats.find((y) => y.seat === seat);
    return x ? x.name || t('joint.deleted') : '?';
  };
  const desk = (id: string | undefined) => (id ? tx(sectorById(id)?.name ?? { et: id, en: id }) : '?');
  switch (m.k) {
    case 'good':
    case 'bad':
      return { title: tx(m.title), text: tx(m.text), seats: m.seats };
    case 'lend':
      return {
        title: t('joint.m.lend', { unit: m.unit ?? '?', from: desk(m.desk), to: desk(m.to) }),
        text: `${name(m.seat, m.desk)} → ${name(m.other, m.to)}`,
        seats: [m.seat, m.other ?? -1].filter((n) => n >= 0),
      };
    case 'handover':
      return {
        title: t('joint.m.handover', { from: desk(m.desk), to: desk(m.to) }),
        text: `${name(m.seat, m.desk)} → ${name(m.other, m.to)}`,
        seats: [m.seat, m.other ?? -1].filter((n) => n >= 0),
      };
    case 'take':
    case 'give':
      return { title: t(`joint.m.${m.k}`, { name: name(m.seat), desk: desk(m.desk) }), seats: [m.seat] };
    case 'left':
    case 'back':
      return { title: t(`joint.m.${m.k}`, { name: name(m.seat) }), seats: [m.seat] };
    default:
      return crisisLine(m, name, t, tx);
  }
}

/** A crisis moment on the timeline (2.37.0): it broke out, escalated, a player took command, a decision, the end. */
function crisisLine(
  m: CoopMoment,
  name: (seat: number | undefined) => string,
  t: ReturnType<typeof useT>,
  tx: ReturnType<typeof useTx>,
): { title: string; text?: string; seats: number[] } {
  const sc = m.crisis ? crisisById(m.crisis) : undefined;
  const title = sc ? tx(sc.title) : '?';
  switch (m.k) {
    case 'crisis':
      return { title: t('joint.m.crisis', { title }), seats: [] };
    case 'cesc': {
      const task = sc && m.task ? taskSpec(sc, m.task) : undefined;
      return { title: t('joint.m.cesc', { task: task ? tx(task.name) : '?' }), seats: [] };
    }
    case 'clead':
      return { title: t('joint.m.clead', { name: name(m.seat) }), seats: [m.seat] };
    case 'cdec': {
      const [decision, option] = (m.option ?? ':').split(':');
      const label = sc?.decisions.find((d) => d.id === decision)?.options.find((o) => o.id === option)?.label;
      return {
        title: t('joint.m.cdec', { option: label ? tx(label) : '?' }),
        text: m.seat >= 0 ? name(m.seat) : t('joint.m.cdec.default'),
        seats: m.seat >= 0 ? [m.seat] : [],
      };
    }
    case 'cend':
      return { title: t('joint.m.cend', { title, n: m.n ?? 0 }), seats: [] };
    default:
      return { title: '?', seats: [] };
  }
}

const MOMENT_ICON: Record<ReportMoment['k'], IconName> = {
  crisis: 'alert',
  cesc: 'fire',
  clead: 'shield',
  cdec: 'list',
  cend: 'flag',
  good: 'check',
  bad: 'warning',
  lend: 'car',
  handover: 'siren',
  take: 'users',
  give: 'user',
  left: 'logout',
  back: 'refresh',
};

function Timeline({
  summary,
  me,
  avatar,
}: {
  summary: RoomSummary;
  me: number;
  avatar: (x: CoopReportSeat) => string | undefined;
}) {
  const t = useT();
  const tx = useTx();
  const moments = summary.coop.moments ?? [];
  const seatOf = (n: number) => summary.coop.seats.find((x) => x.seat === n);
  return (
    <div className="vk-joint__block">
      <h3 className="vk-joint__sub">{t('joint.timeline')}</h3>
      <ol className="vk-joint__line" data-testid="joint-timeline">
        <li className="vk-joint__m is-edge">
          <time className="vk-joint__t vk-mono">{hhmm(summary.start)}</time>
          <span className="vk-joint__dot" aria-hidden="true" />
          <span className="vk-joint__mBody">
            <span className="vk-joint__mTitle">{t('joint.m.start')}</span>
          </span>
        </li>
        {moments.map((m, i) => {
          const line = momentLine(m, summary, t, tx);
          return (
            <li key={i} className={`vk-joint__m is-${m.k}`} data-moment={m.k}>
              <time className="vk-joint__t vk-mono">{hhmm(m.t)}</time>
              <span className="vk-joint__dot" aria-hidden="true">
                <Icon name={MOMENT_ICON[m.k]} size={12} />
              </span>
              <span className="vk-joint__mBody">
                <span className="vk-joint__mTitle">
                  {(m.k === 'good' || m.k === 'bad') && (
                    <span className="vk-sr">{t(`joint.m.${m.k}`)}: </span>
                  )}
                  {line.title}
                </span>
                {line.text && <span className="vk-joint__mText">{line.text}</span>}
              </span>
              {line.seats.length > 0 && (
                <span className="vk-joint__mWho">
                  {line.seats.map((n) => {
                    const x = seatOf(n);
                    return x ? (
                      <PlayerAvatar
                        key={n}
                        avatar={avatar(x)}
                        name={x.name || '?'}
                        size={20}
                        className={`vk-joint__pic${n === me ? ' is-me' : ''}`}
                      />
                    ) : null;
                  })}
                </span>
              )}
            </li>
          );
        })}
        <li className="vk-joint__m is-edge">
          <time className="vk-joint__t vk-mono">{hhmm(summary.end)}</time>
          <span className="vk-joint__dot" aria-hidden="true" />
          <span className="vk-joint__mBody">
            <span className="vk-joint__mTitle">
              {t('joint.m.end', { grade: summary.grade, score: summary.score })}
            </span>
          </span>
        </li>
      </ol>
    </div>
  );
}

/** Sector co-op: one row per desk, who ran it (a player, or its AI colleague) and what crossed its borders. */
function DeskTable({ summary, me }: { summary: RoomSummary; me: number }) {
  const t = useT();
  const tx = useTx();
  const coop = summary.coop;
  // Calls and crews sent are on the cards above; here what crossed the borders.
  const cols = ['incidents', 'closed', 'lent', 'helped', 'handover', 'taken'] as const;
  const mine = coop.seats.find((x) => x.seat === me)?.desk;
  return (
    <div className="vk-joint__block vk-rep__coopWrap" data-testid="desk-report">
      <h3 className="vk-joint__sub" aria-hidden="true">
        {t('desk.rep.title')} <span className="vk-dim">· {t('desk.rep.meta')}</span>
      </h3>
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
            const names = coop.seats
              .filter((x) => d.seats.includes(x.seat))
              .map((x) => x.name || t('joint.deleted'));
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
