import { useMemo, useState } from 'react';
import { useCareer } from '@/store/career';
import { useLang, useT, useTx } from '@/i18n';
import * as rules from '@/sim/career';
import { Avatar, Button, Empty, Icon, Meter } from '@/ui/components';
import type { Candidate, CareerProfile, Text, UnitType } from '@/sim/types';
import { affordability, calendarOf, costsOf, fmtMoney, levelTone, monthlyBudget, pct, safe, sortRows, UNIT_ICON, type Affordability } from './helpers';
import { SpecialtyFilter } from './bits';
import { useToast } from './Toasts';

type SortKey = 'skill' | 'salary' | 'years' | 'value';

export function RecruitTab({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const notify = useToast();
  const [filter, setFilter] = useState<UnitType | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('skill');
  const [hired, setHired] = useState<string | null>(null);
  const recruits = profile.recruits ?? [];
  const costs = costsOf(profile);
  const budget = monthlyBudget(profile.regionId);
  const cal = calendarOf(profile.day);
  const counts = recruits.reduce<Partial<Record<UnitType, number>>>((acc, c) => ((acc[c.specialty] = (acc[c.specialty] ?? 0) + 1), acc), {});

  const list = useMemo(() => {
    const l = filter === 'all' ? recruits : recruits.filter((c) => c.specialty === filter);
    const key = (c: Candidate) => (sort === 'skill' ? c.skill : sort === 'salary' ? -c.salary : sort === 'years' ? c.years : c.skill / Math.max(1, c.salary));
    return sortRows(l, key, 'desc');
  }, [recruits, filter, sort]);

  const hire = (c: Candidate) => {
    const name = `${c.firstName} ${c.lastName}`;
    let err: Text | undefined;
    try {
      err = useCareer.getState().attempt((p) => rules.hire(p, c.id));
    } catch (e) {
      console.warn('[EPD career] hire failed', e);
      notify('danger', t('career.recruit.failed'), t('career.rules.pending'));
      return;
    }
    if (err) {
      notify('danger', t('career.recruit.failed'), tx(err));
      return;
    }
    setHired(c.id);
    notify('ok', t('career.recruit.hired', { name }), t('career.recruit.hiredSub', { spec: t(`career.spec.${c.specialty}`), salary: fmtMoney(c.salary, lang), cost: fmtMoney(hireCostOf(c), lang) }));
  };

  return (
    <div className="cr-tab">
      <div className="cr-tabintro">
        <div>
          <h3 className="cr-tabintro__title">{t('career.recruit.title')}</h3>
          <p className="dim">{t('career.recruit.lead')}</p>
        </div>
        <div className="cr-refresh">
          <Icon name="refresh" size={14} />
          <span>
            {t('career.recruit.refresh', { month: cal.month + 1 })}
            <strong> · {t(cal.shiftsToPayday === 1 ? 'career.recruit.refreshOne' : 'career.recruit.refreshIn', { n: cal.shiftsToPayday })}</strong>
          </span>
        </div>
      </div>

      <div className="cr-budgetline">
        <span>
          {t('career.recruit.cash')} <strong className="mono">{fmtMoney(profile.money, lang)}</strong>
        </span>
        <span>
          {t('career.recruit.monthCosts')} <strong className="mono">{fmtMoney(costs.total, lang)}</strong> / <span className="mono">{fmtMoney(budget, lang)}</span>
        </span>
        <span>
          {t('career.recruit.room')}{' '}
          <strong className={`mono ${budget - costs.total >= 0 ? 'cr-pos' : 'cr-neg'}`}>{fmtMoney(budget - costs.total, lang, { sign: true })}</strong>
        </span>
      </div>

      {recruits.length === 0 ? (
        <Empty icon="users" title={t('career.recruit.empty')}>
          {t('career.recruit.emptyHint', { n: cal.shiftsToPayday })}
        </Empty>
      ) : (
        <>
          <div className="cr-toolbar">
            <SpecialtyFilter value={filter} onChange={setFilter} counts={counts} />
            <label className="cr-sortsel">
              <span>{t('career.sortBy')}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(['skill', 'salary', 'years', 'value'] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`career.recruit.sort.${k}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="cr-cards">
            {list.map((c) => (
              <CandidateCard
                key={c.id}
                c={c}
                fresh={hired === c.id}
                cost={hireCostOf(c)}
                aff={affordability(profile, c.salary, hireCostOf(c), costs, budget)}
                onHire={() => hire(c)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Up-front cost of hiring (rules: first month's pay incl. gear); falls back to one monthly salary. */
function hireCostOf(c: Candidate): number {
  return safe(() => rules.hireCost(c), c.salary);
}

function CandidateCard({ c, aff, cost, onHire, fresh }: { c: Candidate; aff: Affordability; cost: number; onHire: () => void; fresh: boolean }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  return (
    <article className={`cr-cand${fresh ? ' is-fresh' : ''}`}>
      <div className="cr-cand__top">
        <Avatar seed={c.avatarSeed} size={60} gender={c.gender} age={c.age} uniform />
        <div className="cr-cand__who">
          <strong className="cr-cand__name">
            {c.firstName} {c.lastName}
          </strong>
          <span className="dim">
            {t('career.recruit.age', { n: c.age })} · {t(c.years === 1 ? 'career.recruit.yearOne' : 'career.recruit.years', { n: c.years })}
          </span>
          <span className="cr-spec cr-spec--pill">
            <Icon name={UNIT_ICON[c.specialty] ?? 'user'} size={12} />
            {t(`career.spec.${c.specialty}`)}
          </span>
        </div>
        <div className="cr-cand__skill" title={t('career.staff.col.skill')}>
          <strong>{pct(c.skill)}</strong>
          <span>{t('career.recruit.skill')}</span>
        </div>
      </div>
      <Meter value={c.skill} tone={levelTone(c.skill)} label={t('career.staff.col.skill')} />
      {c.bio && <p className="cr-cand__bio">“{tx(c.bio)}”</p>}
      <div className="cr-cand__foot">
        <div className="cr-cand__salary" title={t('career.recruit.costHint')}>
          <strong className="mono">{fmtMoney(c.salary, lang)}</strong>
          <span className="dim">
            {t('career.perMonth')} · {t('career.recruit.cost', { cost: fmtMoney(cost, lang) })}
          </span>
        </div>
        <span className={`cr-aff cr-aff--${aff}`}>
          <Icon name={aff === 'ok' ? 'check' : aff === 'tight' ? 'warning' : 'x'} size={12} />
          {t(`career.aff.${aff}`)}
        </span>
        <Button variant={aff === 'no' ? 'secondary' : 'primary'} icon="plus" onClick={onHire}>
          {t('career.recruit.hire')}
        </Button>
      </div>
    </article>
  );
}
