// Menu card: top 10 of the leaderboard (best shift per player), filterable by prefecture.
import { useEffect, useState } from 'react';
import type { RegionId } from '@/sim/types';
import { fetchScores, type ScoreRow } from '@/net/scores';
import { useT } from '@/i18n';
import { Button, Icon, Segmented, Spinner } from '@/ui/components';
import { gradeTone } from './helpers';

type Filter = 'all' | RegionId;
const FILTERS: Filter[] = ['all', 'pohja', 'ida', 'louna', 'laane'];
const REGION_IDS = ['pohja', 'ida', 'louna', 'laane'];

export function Leaderboard({ me }: { me?: string | null }) {
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
  const diffName = (d: string) => (d ? t(`shell.diff.${d}`) : '');
  const meKey = me?.trim().toLocaleLowerCase('et');

  return (
    <section className="sh-card sh-lb" aria-labelledby="sh-lb-title">
      <h2 className="sh-lb__title" id="sh-lb-title">
        <Icon name="trophy" size={16} /> {t('account.lb.title')}
        <span className="sh-lb__top mono">{t('account.lb.top')}</span>
      </h2>
      <Segmented<Filter>
        size="sm"
        className="sh-lb__filter"
        label={t('account.lb.filter')}
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f, label: f === 'all' ? t('account.lb.all') : regionName(f) }))}
      />
      {error ? (
        <div className="sh-lb__state">
          <span>{t('account.lb.error')}</span>
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => setReload((n) => n + 1)}>
            {t('account.lb.retry')}
          </Button>
        </div>
      ) : rows === null ? (
        <div className="sh-lb__state" role="status">
          <Spinner size={14} /> {t('account.lb.loading')}
        </div>
      ) : rows.length === 0 ? (
        <p className="sh-lb__state">{t('account.lb.empty')}</p>
      ) : (
        <ol className="sh-lb__list">
          {rows.map((r, i) => {
            const mine = !!meKey && r.name.toLocaleLowerCase('et') === meKey;
            const tone = gradeTone((r.grade || 'F') as 'S' | 'A' | 'B' | 'C' | 'D' | 'F');
            return (
              <li key={`${r.name}-${i}`} className={`sh-lb__row${mine ? ' is-me' : ''}${i < 3 ? ` is-top${i + 1}` : ''}`}>
                <span className="sh-lb__rank mono">{i + 1}</span>
                <span className="sh-lb__who">
                  <span className="sh-lb__name">
                    {r.name}
                    {mine && <span className="sh-lb__you">{t('account.lb.you')}</span>}
                  </span>
                  <span className="sh-lb__meta">
                    {[regionName(String(r.regionId)), diffName(String(r.difficulty))].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={`sh-lb__grade sh-lb__grade--${tone}`} title={r.grade}>
                  {r.grade}
                </span>
                <span className="sh-lb__score mono" title={t('account.lb.score', { score: Math.round(r.score) })}>
                  {Math.round(r.score)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
