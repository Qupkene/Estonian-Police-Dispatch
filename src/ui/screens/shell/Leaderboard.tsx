// Menu panel: top 10 of the leaderboard (best shift per player), filterable by prefecture, the player's own row
// highlighted.
import { useEffect, useState } from 'react';
import type { RegionId } from '@/sim/types';
import { fetchScores, type ScoreRow } from '@/net/scores';
import { useT } from '@/i18n';
import { Spinner } from '@/ui/components';

type Filter = 'all' | RegionId;
const FILTERS: Filter[] = ['all', 'pohja', 'ida', 'louna', 'laane'];
const REGION_IDS = ['pohja', 'ida', 'louna', 'laane'];
const GRADES = ['S', 'A', 'B', 'C', 'D', 'F'];

export function Leaderboard({ me, className }: { me?: string | null; className?: string }) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<ScoreRow[] | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(false);
    setRows(null);
    fetchScores(filter === 'all' ? null : filter, 10, reload > 0)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [filter, reload]);

  const regionName = (id: string) => (REGION_IDS.includes(id) ? t(`account.lb.region.${id}`) : id);
  const meKey = me?.trim().toLocaleLowerCase('et');
  const filterName = filter === 'all' ? t('account.lb.all') : regionName(filter);

  return (
    <section className={`vk-panel vk-lb${className ? ' ' + className : ''}`} aria-labelledby="vk-lb-title">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-lb-title">
          {t('account.lb.title')}
        </h2>
        <span className="vk-lb__what">{t('account.lb.best')}</span>
      </div>
      <div className="vk-lb__tabs" role="group" aria-label={t('account.lb.filter')}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="vk-lb__tab"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? t('account.lb.all') : regionName(f)}
          </button>
        ))}
      </div>
      <div className="vk-lb__body" data-fit-rows>
        {error ? (
          <div className="vk-lb__state">
            <span>{t('account.lb.error')}</span>
            <button type="button" className="vk-btn vk-btn--ghost" onClick={() => setReload((n) => n + 1)}>
              {t('account.lb.retry')}
            </button>
          </div>
        ) : rows === null ? (
          <div className="vk-lb__state" role="status">
            <Spinner size={14} /> {t('account.lb.loading')}
          </div>
        ) : rows.length === 0 ? (
          <p className="vk-lb__state">{t('account.lb.empty')}</p>
        ) : (
          <table className="vk-lb__table">
            <caption className="vk-sr">{t('account.lb.caption', { filter: filterName })}</caption>
            <thead className="vk-sr">
              <tr>
                <th scope="col">{t('account.lb.col.rank')}</th>
                <th scope="col">{t('account.lb.col.name')}</th>
                <th scope="col">{t('account.lb.col.region')}</th>
                <th scope="col">{t('account.lb.col.grade')}</th>
                <th scope="col">{t('account.lb.col.score')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const mine = !!meKey && r.name.toLocaleLowerCase('et') === meKey;
                const grade = GRADES.includes(r.grade) ? r.grade : 'F';
                return (
                  <tr
                    key={`${r.name}-${i}`}
                    className={`vk-lb__row${mine ? ' is-me' : ''}`}
                    aria-current={mine ? 'true' : undefined}
                  >
                    <td className="vk-lb__rank vk-mono">{i + 1}</td>
                    <td className="vk-lb__name">
                      {r.name}
                      {mine && <span className="vk-lb__you"> ({t('account.lb.you')})</span>}
                    </td>
                    <td className="vk-lb__region">{regionName(String(r.regionId))}</td>
                    <td className="vk-lb__grade">
                      <span className={`vk-grade vk-grade--${grade}`}>{r.grade || '-'}</span>
                    </td>
                    <td
                      className="vk-lb__score vk-mono"
                      title={t('account.lb.score', { score: Math.round(r.score) })}
                    >
                      {Math.round(r.score)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
