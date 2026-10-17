import { useEffect, useMemo, useState } from 'react';
import { useCareer } from '@/store/career';
import { useGame } from '@/store/game';
import { useLang, useT, useTx } from '@/i18n';
import { DAILY_BUDGET, RANKS } from '@/data/economy';
import * as rules from '@/sim/career';
import { Badge, Button, Emblem, Icon, IconButton, Meter, Modal, Segmented } from '@/ui/components';
import type { CareerProfile, RegionId, Text } from '@/sim/types';
import {
  balanceSeries,
  calendarOf,
  costsOf,
  fmtMoney,
  fmtNum,
  fmtSigned,
  gradeTone,
  inboxStyle,
  monthlyBudget,
  rankInfo,
  rankName,
  readiness,
  regionLocks,
  reputationTone,
  safe,
  type RankInfo,
} from './helpers';
import { useCountUp, useDelta } from './hooks';
import { Gauge, ScoreColumns, Sparkline } from './Charts';

// ── Header ───────────────────────────────────────────────────────────────────────────────────

export function HqHeader({ profile, rank }: { profile: CareerProfile; rank: RankInfo }) {
  const t = useT();
  const tx = useTx();
  const cal = calendarOf(profile.day);
  return (
    <header className="cr-head">
      <div className="cr-head__id">
        <Emblem size={52} />
        <div>
          <p className="cr-eyebrow">{t('career.hq.eyebrow')}</p>
          <h1 className="cr-head__title">{t(`career.region.${profile.regionId}.name`)}</h1>
          <p className="cr-head__sub">
            <span>{tx(rank.name)}</span>
            <span className="cr-dot" />
            <span>{profile.name}</span>
            <span className="cr-dot" />
            <span className="mono">#{profile.badge}</span>
          </p>
        </div>
      </div>
      <div className="cr-head__right">
        <div className="cr-daychip" title={t('career.hq.careerDay', { n: cal.day })}>
          <Icon name="clock" size={14} />
          <span>{t('career.hq.dayMonth', { day: cal.dayOfMonth, month: cal.month })}</span>
        </div>
        <Button variant="ghost" icon="chevron-left" onClick={() => useGame.getState().setScreen('menu')}>
          {t('career.back')}
        </Button>
      </div>
    </header>
  );
}

// ── KPI cards ────────────────────────────────────────────────────────────────────────────────

function MoneyCard({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const lang = useLang();
  const shown = useCountUp(profile.money);
  const delta = useDelta(profile.money);
  const costs = costsOf(profile);
  const budget = monthlyBudget(profile.regionId);
  const net = budget - costs.total;
  const trend = useMemo(() => balanceSeries(profile.money, profile.ledger ?? []).slice(-15).map((p) => p.balance), [profile.money, profile.ledger]);
  return (
    <section className="cr-card cr-kpi cr-kpi--money">
      <header className="cr-kpi__head">
        <Icon name="money" size={14} />
        <span>{t('career.kpi.money')}</span>
      </header>
      <div className={`cr-money${profile.money < 0 ? ' is-negative' : ''}`}>
        <span className="cr-money__value">{fmtMoney(shown, lang)}</span>
        {delta && (
          <span key={delta.key} className={`cr-money__delta ${delta.delta > 0 ? 'is-up' : 'is-down'}`}>
            {fmtMoney(delta.delta, lang, { sign: true })}
          </span>
        )}
      </div>
      {trend.length > 1 && <Sparkline values={trend} ariaLabel={t('career.kpi.trend')} />}
      <dl className="cr-kv">
        <div>
          <dt>{t('career.kpi.dailyBudget')}</dt>
          <dd className="mono">{fmtMoney(DAILY_BUDGET[profile.regionId] ?? 0, lang)}</dd>
        </div>
        <div>
          <dt>{t('career.kpi.monthNet')}</dt>
          <dd className={`mono ${net >= 0 ? 'cr-pos' : 'cr-neg'}`}>{fmtMoney(net, lang, { sign: true })}</dd>
        </div>
      </dl>
    </section>
  );
}

function StaatusCard({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const lang = useLang();
  const repAnim = useCountUp(profile.reputation, 900);
  const rep = Math.round(repAnim);
  const tone = reputationTone(profile.reputation);
  const last = profile.history?.[profile.history.length - 1];
  return (
    <section className="cr-card cr-kpi cr-kpi--staatus">
      <header className="cr-kpi__head">
        <Icon name="shield" size={14} />
        <span>{t('career.kpi.staatus')}</span>
        <span className="cr-kpi__legacy" title={t('career.kpi.staatusLegacy')}>
          2025
        </span>
      </header>
      <div className="cr-staatus">
        <Gauge value={repAnim} tone={tone} label={t('career.kpi.staatus')} />
        <div className="cr-staatus__val">
          <strong>{rep}</strong>
          <span>/ 100</span>
        </div>
      </div>
      <p className={`cr-kpi__foot cr-tone--${tone}`}>
        {t(`career.staatus.${tone}`)}
        {last && Number.isFinite(last.reputationDelta) && last.reputationDelta !== 0 && (
          <span className={last.reputationDelta > 0 ? 'cr-pos' : 'cr-neg'}> · {t('career.kpi.lastShift')} {fmtSigned(last.reputationDelta, lang)}</span>
        )}
      </p>
    </section>
  );
}

function RankCard({ profile, rank }: { profile: CareerProfile; rank: RankInfo }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const xp = Math.round(useCountUp(profile.xp));
  return (
    <section className="cr-card cr-kpi cr-kpi--rank">
      <header className="cr-kpi__head">
        <Icon name="star" size={14} />
        <span>{t('career.kpi.rank')}</span>
        {RANKS.length > 0 && (
          <button type="button" className="cr-linkbtn" onClick={() => setOpen(true)}>
            {t('career.rank.ladder')}
          </button>
        )}
      </header>
      <div className="cr-rank">
        <span className="cr-rank__badge" aria-hidden="true">
          <RankPips index={rank.index} />
        </span>
        <div className="cr-rank__text">
          <strong>{tx(rank.name)}</strong>
          <span className="mono">
            {fmtNum(xp, lang)}
            {rank.nextXp !== undefined ? ` / ${fmtNum(rank.nextXp, lang)}` : ''} XP
          </span>
        </div>
      </div>
      {RANKS.length > 0 && <Meter value={rank.progress} tone="accent" label={t('career.rank.progress')} />}
      {rank.nextName ? (
        <div className="cr-unlocks">
          <span className="cr-unlocks__title">
            {t('career.rank.next')}: <strong>{tx(rank.nextName)}</strong>
          </span>
          <ul>
            {rank.nextUnlocks.slice(0, 3).map((u, i) => (
              <li key={i}>
                <Icon name="lock" size={11} /> {tx(u)}
              </li>
            ))}
            {rank.nextUnlocks.length === 0 && <li className="dim">{t('career.rank.noUnlocks')}</li>}
          </ul>
        </div>
      ) : (
        <p className="cr-kpi__foot">{RANKS.length ? t('career.rank.top') : t('career.rank.pending')}</p>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t('career.rank.ladder')} width={560}>
        <ol className="cr-ladder">
          {RANKS.map((r, i) => (
            <li key={i} className={i === rank.index ? 'is-current' : i < rank.index ? 'is-done' : 'is-locked'}>
              <span className="cr-ladder__pip">
                {i < rank.index ? <Icon name="check" size={12} /> : i === rank.index ? <Icon name="star" size={12} /> : <Icon name="lock" size={11} />}
              </span>
              <div className="cr-ladder__body">
                <div className="cr-ladder__row">
                  <strong>{tx(r.name)}</strong>
                  <span className="mono dim">{fmtNum(r.xp, lang)} XP</span>
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

function RankPips({ index }: { index: number }) {
  const stars = Math.min(4, (index % 4) + 1);
  const tier = Math.floor(index / 4);
  return (
    <span className={`cr-pips cr-pips--tier${Math.min(tier, 3)}`}>
      {Array.from({ length: stars }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

function PaydayCard({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const lang = useLang();
  const cal = calendarOf(profile.day);
  const costs = costsOf(profile);
  const budget = monthlyBudget(profile.regionId);
  return (
    <section className="cr-card cr-kpi cr-kpi--payday">
      <header className="cr-kpi__head">
        <Icon name="briefcase" size={14} />
        <span>{t('career.kpi.payday')}</span>
      </header>
      <div className="cr-payday">
        <strong className="cr-payday__n">{cal.shiftsToPayday}</strong>
        <span className="cr-payday__lbl">{t(cal.shiftsToPayday === 1 ? 'career.payday.one' : 'career.payday.many')}</span>
      </div>
      <Meter value={(cal.dayOfMonth - 1) / 30} tone="accent" label={t('career.kpi.payday')} />
      <dl className="cr-kv">
        <div>
          <dt>{t('career.costs.salaries')}</dt>
          <dd className="mono">{fmtMoney(-costs.salaries, lang)}</dd>
        </div>
        <div>
          <dt>{t('career.costs.upkeep')}</dt>
          <dd className="mono">{fmtMoney(-costs.upkeep, lang)}</dd>
        </div>
        <div className="cr-kv__total">
          <dt>{t('career.costs.total')}</dt>
          <dd className="mono">
            {fmtMoney(-costs.total, lang)}
            <span className="dim"> / {fmtMoney(budget, lang)}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function KpiGrid({ profile, rank }: { profile: CareerProfile; rank: RankInfo }) {
  return (
    <div className="cr-kpis">
      <MoneyCard profile={profile} />
      <StaatusCard profile={profile} />
      <RankCard profile={profile} rank={rank} />
      <PaydayCard profile={profile} />
    </div>
  );
}

// ── Next shift CTA + recent shifts chart ─────────────────────────────────────────────────────

export function ShiftBand({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const locks = useMemo(() => regionLocks(profile), [profile]);
  const unlocked = useMemo(() => locks.filter((l) => l.unlocked).map((l) => l.id), [locks]);
  const [region, setRegion] = useState<RegionId>(profile.regionId);
  useEffect(() => {
    if (!unlocked.includes(region)) setRegion(profile.regionId);
  }, [unlocked, region, profile.regionId]);
  const roster = useMemo(() => safe(() => rules.rosterFromCareer(profile, 'day', region), null), [profile, region]);
  const ready = readiness(profile, roster);
  const history = profile.history ?? [];
  const recent = history.slice(-12);
  const avg = recent.length ? recent.reduce((s, h) => s + h.score, 0) / recent.length : 0;
  const cal = calendarOf(profile.day);

  const start = () => {
    const g = useGame.getState();
    g.setBriefing({ mode: 'career', regionId: region });
    g.setScreen('briefing');
  };

  return (
    <div className="cr-band">
      <section className="cr-card cr-cta">
        <div className="cr-cta__info">
          <p className="cr-eyebrow">{t('career.cta.eyebrow', { day: cal.day })}</p>
          <h2 className="cr-cta__title">{t('career.cta.title')}</h2>
          <ul className="cr-cta__stats">
            <li>
              <Icon name="users" size={14} />
              <span>{t('career.cta.active')}</span>
              <strong>{ready.active}</strong>
            </li>
            <li>
              <Icon name="car" size={14} />
              <span>{t('career.cta.vehicles')}</span>
              <strong>{ready.vehicles}</strong>
            </li>
            {roster && (
              <li>
                <Icon name="radio" size={14} />
                <span>{t('career.cta.crews')}</span>
                <strong>{ready.crews}</strong>
              </li>
            )}
          </ul>
          {ready.issues.length > 0 && (
            <ul className="cr-cta__issues">
              {ready.issues.map((i) => (
                <li key={i.key} className={`cr-tone--${i.tone}`}>
                  <Icon name={i.tone === 'info' ? 'info' : 'warning'} size={13} /> {t(i.key, i.vars)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cr-cta__go">
          <Segmented
            size="sm"
            label={t('career.cta.region')}
            value={region}
            onChange={setRegion}
            options={locks.map((l) => {
              const lockText = l.minRank !== undefined ? t('career.lock.rank', { rank: tx(rankName(l.minRank)) || String(l.minRank + 1) }) : '';
              return {
                value: l.id,
                disabled: !l.unlocked,
                title: l.unlocked ? t(`career.region.${l.id}.name`) : `${t(`career.region.${l.id}.name`)} · ${lockText}`,
                label: (
                  <>
                    {!l.unlocked && <Icon name="lock" size={11} />}
                    {t(`career.region.${l.id}.short`)}
                  </>
                ),
              };
            })}
          />
          <Button variant="primary" size="lg" icon="play" onClick={start} className="cr-cta__btn">
            {t('career.cta.start')}
          </Button>
          <span className="cr-cta__where">
            <Icon name="pin" size={12} /> {t(`career.region.${region}.name`)}
          </span>
        </div>
      </section>

      <section className="cr-card cr-recent">
        <header className="cr-kpi__head">
          <Icon name="stats" size={14} />
          <span>{t('career.recent.title')}</span>
          {recent.length > 0 && (
            <span className="cr-recent__avg">
              {t('career.recent.avg')} <strong className="mono">{fmtNum(avg, lang)}</strong>
            </span>
          )}
        </header>
        {recent.length > 0 ? (
          <>
            <ScoreColumns
              ariaLabel={t('career.recent.title')}
              data={recent.map((h, i) => ({
                key: `${h.day}-${i}`,
                score: h.score,
                label: t('career.recent.tipDay', { day: h.day }),
                sub: `${t('career.history.grade')} ${h.grade} · ${t(`career.region.${h.regionId}.short`)}`,
              }))}
            />
            <div className="cr-recent__grades">
              {recent.slice(-6).map((h, i) => (
                <Badge key={`${h.day}-${i}`} tone={gradeTone(h.grade)}>
                  {h.grade}
                </Badge>
              ))}
              <span className="dim">{t('career.recent.latest')}</span>
            </div>
          </>
        ) : (
          <div className="cr-recent__empty">
            <Icon name="stats" size={22} />
            <span>{t('career.recent.empty')}</span>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Inbox ────────────────────────────────────────────────────────────────────────────────────

export function Inbox() {
  const t = useT();
  const tx = useTx();
  const inbox = useCareer((s) => s.inbox);
  const clearInbox = useCareer((s) => s.clearInbox);
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  useEffect(() => setHidden(new Set()), [inbox]);
  const visible = (inbox ?? []).map((m, i) => ({ m, i })).filter(({ i }) => !hidden.has(i));
  if (!visible.length) return null;

  const dismiss = (i: number) => {
    const next = new Set(hidden);
    next.add(i);
    if (next.size >= inbox.length) clearInbox();
    else setHidden(next);
  };

  return (
    <section className="cr-inbox" aria-label={t('career.inbox.title')}>
      <header className="cr-inbox__head">
        <Icon name="send" size={14} />
        <span>{t('career.inbox.title')}</span>
        <Badge tone="accent">{visible.length}</Badge>
        <Button size="sm" variant="ghost" icon="check" onClick={clearInbox}>
          {t('career.inbox.clear')}
        </Button>
      </header>
      <div className="cr-inbox__list">
        {visible.map(({ m, i }) => (
          <InboxCard key={`${i}-${m.et}`} text={m} label={tx(m)} onDismiss={() => dismiss(i)} closeLabel={t('career.inbox.dismiss')} />
        ))}
      </div>
    </section>
  );
}

function InboxCard({ text, label, onDismiss, closeLabel }: { text: Text; label: string; onDismiss: () => void; closeLabel: string }) {
  const st = inboxStyle(text);
  return (
    <article className={`cr-msg cr-msg--${st.tone}`}>
      <span className="cr-msg__icon">
        <Icon name={st.icon} size={16} />
      </span>
      <p className="cr-msg__text">{label}</p>
      <IconButton icon="close" size="sm" label={closeLabel} onClick={onDismiss} />
    </article>
  );
}

export function useRank(profile: CareerProfile): RankInfo {
  return useMemo(() => rankInfo(profile.xp), [profile.xp]);
}
