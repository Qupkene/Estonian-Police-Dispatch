import { useMemo, useState } from 'react';
import { useLang, useT, useTx } from '@/i18n';
import { Button, Empty, Icon } from '@/ui/components';
import type { CareerProfile, LedgerEntry } from '@/sim/types';
import { balanceSeries, calendarOf, fmtCompact, fmtMoney, ledgerRows, monthBreakdown, monthOfDay } from './helpers';
import { BalanceLine } from './Charts';
import { Stat } from './bits';

const KIND_ICON: Record<LedgerEntry['kind'], Parameters<typeof Icon>[0]['name']> = {
  budget: 'building',
  bonus: 'star',
  salary: 'users',
  hire: 'plus',
  vehicle: 'car',
  upgrade: 'shield',
  upkeep: 'wrench',
  fuel: 'gauge',
  overtime: 'timer',
  fine: 'alert',
  other: 'list',
};

const PAGE = 30;

export function BudgetTab({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const cal = calendarOf(profile.day);
  const months = useMemo(() => {
    const set = new Set<number>([cal.month]);
    (profile.ledger ?? []).forEach((e) => set.add(monthOfDay(e.day)));
    return [...set].sort((a, b) => b - a);
  }, [profile.ledger, cal.month]);
  const [month, setMonth] = useState(cal.month);
  const [limit, setLimit] = useState(PAGE);
  const rows = useMemo(() => ledgerRows(profile.money, profile.ledger ?? []), [profile.money, profile.ledger]);
  const series = useMemo(() => balanceSeries(profile.money, profile.ledger ?? []), [profile.money, profile.ledger]);
  const br = useMemo(() => monthBreakdown(profile.ledger ?? [], month), [profile.ledger, month]);
  const maxKind = Math.max(1, ...br.kinds.map((k) => Math.max(k.income, k.expense)));
  const newestFirst = [...rows].reverse();

  return (
    <div className="cr-tab">
      <div className="cr-toolbar">
        <div className="cr-stats cr-stats--inline">
          <Stat icon="plus" label={t('career.budget.income')} value={fmtMoney(br.income, lang)} tone="ok" />
          <Stat icon="minus" label={t('career.budget.expense')} value={fmtMoney(-br.expense, lang)} tone="danger" />
          <Stat icon="money" label={t('career.budget.net')} value={fmtMoney(br.income - br.expense, lang, { sign: true })} />
        </div>
        {months.length > 1 && (
          <label className="cr-sortsel">
            <span>{t('career.budget.month')}</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {t('career.monthN', { n: m })}
                  {m === cal.month ? ` (${t('career.budget.current')})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="cr-budgetgrid">
        <section className="cr-sub cr-sub--chart">
          <header className="cr-sub__head">
            <h3>
              <Icon name="stats" size={14} /> {t('career.budget.balance')}
            </h3>
            <span className="dim mono">{fmtMoney(profile.money, lang)}</span>
          </header>
          {series.length > 1 ? (
            <BalanceLine
              series={series}
              ariaLabel={t('career.budget.balance')}
              fmtY={(v) => fmtCompact(v, lang)}
              fmtTip={(v) => fmtMoney(v, lang)}
              fmtX={(d) => t('career.dayShort', { n: d })}
            />
          ) : (
            <p className="cr-placeholder">{t('career.budget.noData')}</p>
          )}
        </section>

        <section className="cr-sub">
          <header className="cr-sub__head">
            <h3>
              <Icon name="list" size={14} /> {t('career.budget.breakdown', { n: month })}
            </h3>
          </header>
          {br.kinds.length === 0 ? (
            <p className="cr-placeholder">{t('career.budget.noMonth')}</p>
          ) : (
            <ul className="cr-breakdown">
              {br.kinds.map((k) => {
                const v = k.income >= k.expense ? k.income : k.expense;
                const pos = k.income >= k.expense;
                return (
                  <li key={k.kind}>
                    <span className="cr-breakdown__label">
                      <Icon name={KIND_ICON[k.kind] ?? 'list'} size={12} />
                      {t(`career.kind.${k.kind}`)}
                      <span className="dim"> ×{k.count}</span>
                    </span>
                    <span className="cr-breakdown__bar">
                      <i className={pos ? 'is-pos' : 'is-neg'} style={{ width: `${Math.max(2, (v / maxKind) * 100)}%` }} />
                    </span>
                    <span className={`mono cr-num ${k.net >= 0 ? 'cr-pos' : 'cr-neg'}`}>{fmtMoney(k.net, lang, { sign: true })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="cr-sub">
        <header className="cr-sub__head">
          <h3>
            <Icon name="book" size={14} /> {t('career.budget.ledger')}
          </h3>
          <span className="dim">{t('career.budget.entries', { n: rows.length })}</span>
        </header>
        {rows.length === 0 ? (
          <Empty icon="book">{t('career.budget.noData')}</Empty>
        ) : (
          <div className="cr-tablewrap">
            <table className="cr-table cr-table--ledger">
              <thead>
                <tr>
                  <th className="cr-num">{t('career.budget.col.day')}</th>
                  <th>{t('career.budget.col.kind')}</th>
                  <th>{t('career.budget.col.text')}</th>
                  <th className="cr-num">{t('career.budget.col.amount')}</th>
                  <th className="cr-num">{t('career.budget.col.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.slice(0, limit).map((r) => (
                  <tr key={r.index}>
                    <td className="mono cr-num">{r.entry.day}</td>
                    <td>
                      <span className={`cr-kind cr-kind--${r.entry.amount >= 0 ? 'pos' : 'neg'}`}>
                        <Icon name={KIND_ICON[r.entry.kind] ?? 'list'} size={12} />
                        {t(`career.kind.${r.entry.kind}`)}
                      </span>
                    </td>
                    <td className="cr-ledger__text">{tx(r.entry.text)}</td>
                    <td className={`mono cr-num ${r.entry.amount >= 0 ? 'cr-pos' : 'cr-neg'}`}>{fmtMoney(r.entry.amount, lang, { sign: true })}</td>
                    <td className={`mono cr-num ${r.balance < 0 ? 'cr-neg' : 'dim'}`}>{fmtMoney(r.balance, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > limit && (
              <div className="cr-more">
                <Button size="sm" variant="ghost" icon="chevron-down" onClick={() => setLimit((l) => l + PAGE * 3)}>
                  {t('career.showMore', { n: rows.length - limit })}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
