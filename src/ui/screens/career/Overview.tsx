// The career page's panels (Valvekaart): the head row with the start button, the strip of figures, the next
// shift's crews, the last shifts, the fleet, the notices and the next rank. Styles in career.css on vk.css.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCareer } from '@/store/career';
import { useGame } from '@/store/game';
import { useLang, useT, useTx } from '@/i18n';
import { RANKS } from '@/data/economy';
import * as rules from '@/sim/career';
import { Modal, PpaLogo } from '@/ui/components';
import type { CareerProfile, Lang, RegionId } from '@/sim/types';
import { careerFigures, nextShiftKind, menuNotices, shiftBars, type Notice } from '../shell/menuModel';
import { MonoNumbers, NoticeLabel, noticeText } from '../shell/notices';
import { PageBack } from '../shell/ShellFrame';
import { wall } from '@/sim/time';
import {
  calendarOf,
  costsOf,
  fmtMoney,
  fmtNum,
  monthlyBudget,
  rankInfo,
  readiness,
  reputationTone,
  safe,
  type RankInfo,
} from './helpers';
import { crewRows, fleetRows, shiftSummary } from './hqModel';
import { useAreaLabel, usePosition } from './AreaCard';
import { careerDailyBudget } from './sectorActions';

const GRADES = ['S', 'A', 'B', 'C', 'D', 'F'];
const gradeOf = (g: string) => (GRADES.includes(g) ? g : 'F');

export function lowerFirst(s: string, lang: Lang): string {
  return s ? s[0].toLocaleLowerCase(lang) + s.slice(1) : s;
}

/** A grade in its outlined box ("A" in green), read out as "hinne A". */
export function Grade({ grade, className }: { grade: string; className?: string }) {
  const t = useT();
  return (
    <span
      className={`vk-grade vk-grade--${gradeOf(grade)}${className ? ' ' + className : ''}`}
      role="img"
      aria-label={t('shell.menu.kpi.grade', { grade })}
    >
      {grade}
    </span>
  );
}

function Signed({ value, money, lang }: { value: number; money?: boolean; lang: Lang }) {
  const cls = value > 0 ? 'vk-up' : value < 0 ? 'vk-down' : undefined;
  return (
    <span className={`vk-mono${cls ? ' ' + cls : ''}`}>
      {money ? fmtMoney(value, lang, { sign: true }) : (value > 0 ? '+' : '') + fmtNum(value, lang)}
    </span>
  );
}

/** A panel's head: the section title, then whatever goes on its right. */
export function PanelHead({ id, title, children }: { id: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="vk-panel__head">
      <h2 className="vk-h" id={id}>
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Head row ─────────────────────────────────────────────────────────────────

export function PageHead({
  profile,
  rank,
  onStart,
}: {
  profile: CareerProfile;
  rank: RankInfo;
  onStart: () => void;
}) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const cal = calendarOf(profile.day);
  const position = usePosition(profile);
  const area = useAreaLabel(profile, profile.regionId);
  const region = t(`career.region.${profile.regionId}.name`);
  const whole = area === t('career.area.wholeShort');
  return (
    <div className="vk-pagehead cr-head">
      <BackButton />
      <span className="vk-pagehead__rule" aria-hidden="true" />
      <h1 className="vk-pagehead__title">{t('shell.menu.career')}</h1>
      <p className="vk-pagehead__line">
        <strong>{profile.name}</strong> <span className="vk-mono">{profile.badge}</span> · {tx(rank.name)} ·{' '}
        <span className="cr-head__pos">{lowerFirst(position, lang)}</span> ·{' '}
        <span className="cr-head__unit">
          {/* The employer: PPA's shield (used with the agency's permission) before the prefecture. */}
          <PpaLogo variant="emblem" height={18} className="cr-head__ppa" />
          {whole ? region : `${area}, ${region}`}
        </span>
      </p>
      <span className="vk-pagehead__meta">
        {t('shell.menu.dayMonth', { day: cal.day, month: cal.month })}
      </span>
      <button
        type="button"
        className="vk-btn vk-btn--primary vk-go cr-head__start"
        onClick={onStart}
        data-sfx="click"
      >
        <span>{t('shell.menu.start', { day: cal.day })}</span>
        <span className="vk-go__key" aria-hidden="true">
          ⏎
        </span>
      </button>
    </div>
  );
}

export function BackButton() {
  const t = useT();
  return <PageBack label={t('career.vk.back')} onBack={() => useGame.getState().setScreen('menu')} />;
}

// ── Strip of figures ─────────────────────────────────────────────────────────

export function KpiStrip({ profile, rank }: { profile: CareerProfile; rank: RankInfo }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const f = useMemo(() => careerFigures(profile), [profile]);
  const costs = useMemo(() => costsOf(profile), [profile]);
  const budget = monthlyBudget(profile.regionId, profile);
  const daily = careerDailyBudget(profile);
  const area = useAreaLabel(profile, profile.regionId);
  const onDay = (day: number | null) => (day !== null ? ` ${t('shell.menu.kpi.onDay', { day })}` : '');
  const cells: {
    key: string;
    label: string;
    value: ReactNode;
    sub: ReactNode;
    bar?: number;
    title?: string;
  }[] = [
    {
      key: 'money',
      label: t('career.kpi.money'),
      value: fmtMoney(f.money, lang),
      sub:
        f.moneyDelta !== null ? (
          <>
            <Signed value={f.moneyDelta} money lang={lang} />
            {onDay(f.lastDay)}
          </>
        ) : null,
    },
    { key: 'daily', label: t('career.kpi.dailyBudget'), value: fmtMoney(daily, lang), sub: area },
    {
      key: 'costs',
      label: t('career.vk.kpi.costs'),
      value: fmtMoney(costs.total, lang),
      sub: (
        <>
          {t('career.vk.kpi.of')} <span className="vk-mono">{fmtMoney(budget, lang)}</span>
        </>
      ),
      title: `${t('career.costs.salaries')} ${fmtMoney(costs.salaries, lang)} · ${t('career.costs.upkeep')} ${fmtMoney(costs.upkeep, lang)}`,
    },
    {
      key: 'rep',
      label: t('career.kpi.staatus'),
      value: (
        <>
          {f.rep}
          <small>/100</small>
        </>
      ),
      sub:
        f.repDelta !== null ? (
          <>
            <Signed value={f.repDelta} lang={lang} />
            {onDay(f.lastDay)}
          </>
        ) : null,
      bar: f.rep / 100,
      title: t(`career.staatus.${reputationTone(profile.reputation)}`),
    },
    {
      key: 'rank',
      label: t('career.kpi.rank'),
      value: (
        <>
          {fmtNum(f.xp, lang)}
          <small>{f.nextXp !== null ? `/${fmtNum(f.nextXp, lang)} XP` : ' XP'}</small>
        </>
      ),
      sub: tx(rank.name),
      bar: f.rankProgress,
    },
    {
      key: 'payday',
      label: t('career.kpi.payday'),
      value: f.payday,
      sub: f.payday === 1 ? t('shell.menu.kpi.paydayNext') : t('shell.menu.kpi.paydayIn'),
    },
    {
      key: 'last',
      label: t('shell.menu.kpi.last'),
      value: f.last ? (
        <>
          <Grade grade={f.last.grade} />
          {f.last.score}
        </>
      ) : (
        '-'
      ),
      sub: f.last ? t('shell.menu.kpi.onDay', { day: f.last.day }) : t('career.vk.kpi.none'),
    },
    {
      key: 'shifts',
      label: t('shell.menu.kpi.shifts'),
      value: f.shifts,
      sub: f.best
        ? f.best.day !== null
          ? t('shell.menu.kpi.bestDay', { score: f.best.score, day: f.best.day })
          : t('shell.menu.kpi.best', { score: f.best.score })
        : null,
    },
  ];
  return (
    <dl className="vk-strip cr-kpis">
      {cells.map((c) => (
        <div key={c.key} className={`vk-strip__cell is-${c.key}`} title={c.title}>
          <dt>{c.label}</dt>
          <dd className="vk-strip__value">{c.value}</dd>
          <dd className="vk-strip__sub">{c.sub ?? ' '}</dd>
          {c.bar !== undefined && (
            <span className="vk-strip__bar" aria-hidden="true">
              <span style={{ width: `${Math.round(Math.max(0, Math.min(1, c.bar)) * 1000) / 10}%` }} />
            </span>
          )}
        </div>
      ))}
    </dl>
  );
}

// ── Next shift ───────────────────────────────────────────────────────────────

export function NextShiftPanel({
  profile,
  region,
  regions,
  setRegion,
  onStaff,
  onFleet,
}: {
  profile: CareerProfile;
  region: RegionId;
  /** Prefectures open for a shift (home first). */
  regions: RegionId[];
  setRegion: (r: RegionId) => void;
  onStaff: () => void;
  onFleet: () => void;
}) {
  const t = useT();
  const cal = calendarOf(profile.day);
  // The briefing proposes the shift by the hour; here either kind's crews can be looked at.
  const [kind, setKind] = useState<'day' | 'night'>(() => nextShiftKind(wall(Date.now()).hour).kind);
  const roster = useMemo(
    () => safe(() => rules.rosterFromCareer(profile, kind, region), null),
    [profile, kind, region],
  );
  const ready = readiness(profile, roster);
  const rows = crewRows(roster);
  const area = useAreaLabel(profile, region);
  const worn = fleetRows(profile).filter((v) => v.state !== 'ok');
  const MAX = 6;
  return (
    <section className="vk-panel cr-next" aria-labelledby="cr-next-title">
      <PanelHead id="cr-next-title" title={t('career.cta.eyebrow', { day: cal.day })}>
        <span className="vk-panel__meta">
          {t('career.vk.shift.meta', { crews: ready.crews, officers: ready.active })}
        </span>
      </PanelHead>
      <div className="cr-next__controls">
        <span className="cr-next__ctl">
          <span className="vk-label" id="cr-next-kind">
            {t('career.vk.shift.kind')}
          </span>
          <span className="vk-seg" role="group" aria-labelledby="cr-next-kind">
            {(['day', 'night'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {t(`career.vk.shift.${k}`)}{' '}
                <span className="vk-mono cr-next__hours">{k === 'day' ? '07-19' : '19-07'}</span>
              </button>
            ))}
          </span>
        </span>
        {regions.length > 1 && (
          <span className="cr-next__ctl">
            <span className="vk-label" id="cr-next-region">
              {t('career.cta.region')}
            </span>
            <span className="vk-seg" role="group" aria-labelledby="cr-next-region">
              {regions.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={region === r}
                  onClick={() => setRegion(r)}
                  title={t(`career.region.${r}.name`)}
                >
                  {t(`career.region.${r}.short`)}
                </button>
              ))}
            </span>
          </span>
        )}
        <span className="cr-next__ctl">
          <span className="vk-label">{t('career.vk.shift.area')}</span>
          <span className="cr-next__area">
            <span className="cr-swatch is-mine" aria-hidden="true" />
            {area}
          </span>
        </span>
      </div>
      {rows.length > 0 ? (
        <table className="vk-table cr-crews">
          <caption>{t('career.vk.crews', { kind: t(`career.vk.shift.${kind}`) })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('career.vk.col.callsign')}</th>
              <th scope="col">{t('career.vk.col.vehicle')}</th>
              <th scope="col">{t('career.vk.col.crew')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, MAX).map((r, i) => (
              <tr key={`${r.callsign}-${i}`}>
                <td className="cr-crews__call vk-mono">{r.callsign}</td>
                <td className="cr-crews__vehicle">
                  {r.vehicle}
                  {r.onCall && <span className="cr-crews__oncall">{t('career.vk.onCall')}</span>}
                </td>
                <td>{r.crew}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="cr-panel__empty">{t('career.vk.noCrews')}</p>
      )}
      {rows.length > MAX && <p className="cr-next__more">{t('career.vk.more', { n: rows.length - MAX })}</p>}
      {(ready.issues.length > 0 || worn.length > 0) && (
        <ul className="cr-next__issues">
          {ready.issues.map((i) => (
            <li key={i.key} className={`is-${i.tone}`}>
              <WarnGlyph />
              <span>
                <MonoNumbers text={t(i.key, i.vars)} />
              </span>
            </li>
          ))}
          {worn.slice(0, 2).map((v) => (
            <li key={v.id} className="is-warn">
              <WarnGlyph />
              <span>
                <MonoNumbers
                  text={t(v.state === 'out' ? 'career.vk.fleet.outText' : 'career.vk.fleet.wornText', {
                    model: v.model,
                    plate: v.plate,
                    pct: `${v.condition} %`,
                  })}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="cr-panel__actions">
        <button type="button" className="vk-btn" onClick={onStaff}>
          {t('career.vk.toStaff')}
        </button>
        <button type="button" className="vk-btn vk-btn--ghost" onClick={onFleet}>
          {t('career.vk.toFleet')}
        </button>
        <span className="cr-panel__note">{t('career.vk.shift.brief')}</span>
      </div>
    </section>
  );
}

function WarnGlyph() {
  return (
    <svg className="cr-warn" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 1.6 13 12.2H1Z" />
      <path d="M7 5.6v3.2M7 10.3v.2" />
    </svg>
  );
}

// ── Last shifts ──────────────────────────────────────────────────────────────

export function LastShiftsPanel({ profile, onHistory }: { profile: CareerProfile; onHistory: () => void }) {
  const t = useT();
  const lang = useLang();
  const tiles = useMemo(() => shiftBars(profile, 13), [profile]);
  const sum = useMemo(() => shiftSummary(profile, 6), [profile]);
  return (
    <section className="vk-panel cr-last" aria-labelledby="cr-last-title">
      <PanelHead id="cr-last-title" title={t('career.recent.title')}>
        {sum.count > 0 && (
          <span className="vk-panel__meta">
            <span className="vk-mono">{sum.count}</span> {t('career.vk.last.shifts')}
            {sum.avg !== null && (
              <>
                , {t('career.recent.avg')} <span className="vk-mono vk-num">{sum.avg}</span>
              </>
            )}
            {sum.best !== null && (
              <>
                , {t('career.vk.last.best')} <span className="vk-mono vk-num">{sum.best}</span>
              </>
            )}
          </span>
        )}
      </PanelHead>
      {tiles ? (
        <>
          <ol
            className="cr-tiles"
            aria-label={t('career.vk.last.tiles', { from: tiles.from, to: tiles.to })}
            style={{ gridTemplateColumns: `repeat(${Math.max(tiles.bars.length, 8)}, minmax(0, 1fr))` }}
          >
            {tiles.bars.map((b, i) => (
              <li key={`${b.day}-${i}`} className={i === tiles.bars.length - 1 ? 'is-last' : undefined}>
                <span className="cr-tiles__day">{t('shell.menu.note.day', { day: b.day })}</span>
                <span
                  className={`cr-tiles__grade vk-grade--${gradeOf(b.grade)}`}
                  aria-label={t('shell.menu.kpi.grade', { grade: b.grade })}
                >
                  {b.grade}
                </span>
                <span className="cr-tiles__score">{b.score}</span>
              </li>
            ))}
          </ol>
          <table className="vk-table cr-shifts">
            <caption>{t('career.vk.last.caption', { n: sum.rows.length })}</caption>
            <thead>
              <tr>
                <th scope="col" className="is-num">
                  {t('career.vk.col.day')}
                </th>
                <th scope="col">{t('career.history.region')}</th>
                <th scope="col">{t('career.history.grade')}</th>
                <th scope="col" className="is-num">
                  {t('career.vk.col.score')}
                </th>
                <th scope="col" className="is-num">
                  {t('career.history.incidents')}
                </th>
                <th scope="col" className="is-num">
                  {t('career.vk.col.earnings')}
                </th>
                <th scope="col" className="is-num">
                  {t('career.kpi.staatus')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sum.rows.map((r, i) => (
                <tr key={`${r.day}-${i}`}>
                  <td className="is-num is-strong">{r.day}</td>
                  <td className="cr-shifts__region">{t(`career.region.${r.regionId}.name`)}</td>
                  <td>
                    <Grade grade={r.grade} />
                  </td>
                  <td className="is-num is-strong">{r.score}</td>
                  <td className="is-num">{fmtNum(r.incidents, lang)}</td>
                  <td className="is-num">
                    <Signed value={r.earnings} money lang={lang} />
                  </td>
                  <td className="is-num">
                    <Signed value={r.reputationDelta} lang={lang} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cr-panel__actions is-end">
            <button type="button" className="vk-linkbtn" onClick={onHistory}>
              {t('career.vk.last.all')}
            </button>
          </div>
        </>
      ) : (
        <p className="cr-panel__empty">{t('career.recent.empty')}</p>
      )}
    </section>
  );
}

// ── Fleet ────────────────────────────────────────────────────────────────────

export function FleetPanel({ profile, onFleet }: { profile: CareerProfile; onFleet: () => void }) {
  const t = useT();
  const lang = useLang();
  const rows = useMemo(() => fleetRows(profile), [profile]);
  return (
    <section className="vk-panel cr-fleet" aria-labelledby="cr-fleet-title">
      <PanelHead id="cr-fleet-title" title={t('career.tab.fleet')}>
        <span className="vk-panel__meta">{t('career.vk.fleet.meta', { n: rows.length })}</span>
      </PanelHead>
      {rows.length > 0 ? (
        <table className="vk-table cr-fleet__table">
          <caption>{t('career.vk.fleet.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('career.vk.col.vehicle')}</th>
              <th scope="col">{t('career.vk.col.condition')}</th>
              <th scope="col" className="is-num">
                {t('career.vk.col.upkeep')}
              </th>
              <th scope="col" className="is-num">
                {t('career.vk.col.state')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td>
                  <span className="cr-fleet__model">{v.model}</span>
                  <span className="cr-fleet__plate vk-mono">{v.plate}</span>
                </td>
                <td className="cr-fleet__cond">
                  <span
                    className={`vk-meter${v.state === 'out' ? ' is-bad' : v.state === 'worn' ? ' is-warn' : ''}`}
                    aria-hidden="true"
                  >
                    <span style={{ width: `${v.condition}%` }} />
                  </span>
                  <span
                    className={`vk-mono${v.state === 'out' ? ' vk-down' : v.state === 'worn' ? ' vk-warn' : ' is-strong'}`}
                  >
                    {v.condition} %
                  </span>
                </td>
                <td className="is-num">{fmtMoney(v.upkeep, lang)}</td>
                <td className={`is-num cr-fleet__state is-${v.state}`}>{t(`career.vk.fleet.${v.state}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="cr-panel__empty">{t('career.fleet.empty')}</p>
      )}
      <div className="cr-panel__actions">
        <button type="button" className="vk-btn vk-btn--ghost" onClick={onFleet}>
          {t('career.vk.fleet.manage')}
        </button>
      </div>
    </section>
  );
}

// ── Teated ───────────────────────────────────────────────────────────────────

export function NoticesPanel({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const lang = useLang();
  const inbox = useCareer((s) => s.inbox);
  const clearInbox = useCareer((s) => s.clearInbox);
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  useEffect(() => setHidden(new Set()), [inbox]);
  const notices = useMemo(() => menuNotices(profile, inbox ?? []), [profile, inbox]);
  const shown = notices.filter((n) => n.inbox === undefined || !hidden.has(n.inbox));
  const unread = shown.some((n) => n.inbox !== undefined);
  const dismiss = (n: Notice) => {
    if (n.inbox === undefined) return;
    const next = new Set(hidden);
    next.add(n.inbox);
    if (next.size >= (inbox ?? []).length) clearInbox();
    else setHidden(next);
  };
  return (
    <section className="vk-panel vk-notes cr-notes" aria-labelledby="cr-notes-title">
      <PanelHead id="cr-notes-title" title={t('shell.menu.notices')}>
        {shown.length > 0 && <span className="vk-count">{shown.length}</span>}
        {unread && (
          <button type="button" className="vk-linkbtn cr-notes__clear" onClick={clearInbox}>
            {t('career.inbox.clear')}
          </button>
        )}
      </PanelHead>
      {shown.length > 0 ? (
        <ul className="vk-notes__list">
          {shown.map((n, i) => (
            <li key={`${n.inbox ?? 'x'}-${i}`} className="vk-note">
              <p className="vk-note__head">
                <span className={`vk-note__dot${n.day === null ? ' is-state' : ''}`} aria-hidden="true" />
                <NoticeLabel n={n} />
                {n.day !== null && (
                  <span className="vk-meta">{t('shell.menu.note.day', { day: n.day })}</span>
                )}
                {n.inbox !== undefined && (
                  <button
                    type="button"
                    className="cr-notes__x"
                    onClick={() => dismiss(n)}
                    aria-label={t('career.inbox.dismiss')}
                    title={t('career.inbox.dismiss')}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M3 3l6 6M9 3l-6 6" />
                    </svg>
                  </button>
                )}
              </p>
              <p className="vk-note__text">
                <MonoNumbers text={noticeText(n, lang)} />
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cr-panel__empty">{t('career.vk.notes.empty')}</p>
      )}
    </section>
  );
}

// ── Next rank ────────────────────────────────────────────────────────────────

export function NextRankPanel({ profile, rank }: { profile: CareerProfile; rank: RankInfo }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const xp = Math.round(Number.isFinite(profile.xp) ? profile.xp : 0);
  const pct = Math.round(Math.max(0, Math.min(1, rank.progress)) * 1000) / 10;
  return (
    <section className="vk-panel cr-rank" aria-labelledby="cr-rank-title">
      <PanelHead id="cr-rank-title" title={t('career.vk.rank.title')}>
        {rank.nextXp !== undefined && (
          <span className="vk-meta">
            {t('career.vk.rank.missing', { n: fmtNum(Math.max(0, rank.nextXp - xp), lang) })}
          </span>
        )}
      </PanelHead>
      <div className="cr-rank__body">
        {rank.nextName ? (
          <>
            <p className="cr-rank__next">
              <span className="cr-rank__name">{tx(rank.nextName)}</span>
              <span className="vk-mono">{fmtNum(rank.nextXp ?? 0, lang)} XP</span>
            </p>
            <div
              className="cr-rank__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
              aria-label={t('career.rank.progress')}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="cr-rank__now vk-mono">
              <span>{fmtNum(xp, lang)} XP</span>
              <span>{tx(rank.name)}</span>
            </p>
            <p className="vk-label cr-rank__opens">{t('career.vk.rank.opens')}</p>
            <ul className="cr-rank__unlocks">
              {rank.nextUnlocks.slice(0, 4).map((u, i) => (
                <li key={i}>
                  <span aria-hidden="true">+</span>
                  {tx(u)}
                </li>
              ))}
              {rank.nextUnlocks.length === 0 && <li className="is-none">{t('career.rank.noUnlocks')}</li>}
            </ul>
          </>
        ) : (
          <p className="cr-rank__top">
            <span className="cr-rank__name">{tx(rank.name)}</span>
            {RANKS.length ? t('career.rank.top') : t('career.rank.pending')}
          </p>
        )}
        {RANKS.length > 0 && (
          <button type="button" className="vk-linkbtn cr-rank__ladder" onClick={() => setOpen(true)}>
            {t('career.rank.ladder')}
          </button>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t('career.rank.ladder')} width={560}>
        <ol className="cr-ladder">
          {RANKS.map((r, i) => (
            <li
              key={i}
              className={i === rank.index ? 'is-current' : i < rank.index ? 'is-done' : 'is-locked'}
            >
              <span className="cr-ladder__n vk-mono" aria-hidden="true">
                {i + 1}
              </span>
              <div className="cr-ladder__body">
                <div className="cr-ladder__row">
                  <strong>{tx(r.name)}</strong>
                  {i === rank.index && <span className="cr-ladder__you">{t('career.vk.rank.you')}</span>}
                  <span className="vk-mono">{fmtNum(r.xp, lang)} XP</span>
                </div>
                {r.unlocks.length > 0 && (
                  <ul>
                    {r.unlocks.map((u, j) => (
                      <li key={j}>{tx(u)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Modal>
    </section>
  );
}

export function useRank(profile: CareerProfile): RankInfo {
  return useMemo(() => rankInfo(profile.xp), [profile.xp]);
}
