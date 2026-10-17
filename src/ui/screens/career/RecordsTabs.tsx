import { useMemo, useState } from 'react';
import { useLang, useT, useTx } from '@/i18n';
import { ACHIEVEMENTS } from '@/data/economy';
import { Badge, Button, Empty, Icon, Meter } from '@/ui/components';
import type { CareerProfile } from '@/sim/types';
import { fmtMoney, fmtNum, fmtSigned, gradeTone } from './helpers';
import { GlyphIcon, Stat } from './bits';

// ── Saavutused ───────────────────────────────────────────────────────────────────────────────

export function AchievementsTab({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const got = new Set(profile.achievements ?? []);
  const total = ACHIEVEMENTS.length;
  const done = ACHIEVEMENTS.filter((a) => got.has(a.id)).length;
  const sorted = [...ACHIEVEMENTS].sort((a, b) => Number(got.has(b.id)) - Number(got.has(a.id)));

  if (!total) return <p className="cr-placeholder">{t('career.catalog.pending')}</p>;

  return (
    <div className="cr-tab">
      <div className="cr-achhead">
        <div className="cr-achhead__count">
          <Icon name="trophy" size={20} />
          <strong>
            {fmtNum(done, lang)} / {fmtNum(total, lang)}
          </strong>
          <span className="dim">{t('career.ach.unlocked')}</span>
        </div>
        <Meter value={total ? done / total : 0} tone="accent" label={t('career.tab.achievements')} />
      </div>
      <div className="cr-achgrid">
        {sorted.map((a) => {
          const has = got.has(a.id);
          return (
            <article key={a.id} className={`cr-ach${has ? ' is-unlocked' : ' is-locked'}`} title={has ? tx(a.desc) : t('career.ach.lockedHint')}>
              <span className="cr-ach__medal">
                <GlyphIcon icon={a.icon} size={24} fallback="trophy" />
                {!has && (
                  <span className="cr-ach__lock">
                    <Icon name="lock" size={11} />
                  </span>
                )}
              </span>
              <strong className="cr-ach__name">{tx(a.name)}</strong>
              <p className="cr-ach__desc">{tx(a.desc)}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ── Ajalugu ──────────────────────────────────────────────────────────────────────────────────

const PAGE = 50;

export function HistoryTab({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const lang = useLang();
  const [limit, setLimit] = useState(PAGE);
  const history = profile.history ?? [];
  const rows = useMemo(() => [...history].reverse(), [history]);
  const st = profile.stats ?? { shifts: 0, incidents: 0, arrests: 0, bestScore: 0, pursuitsCaught: 0 };
  const earned = history.reduce((s, h) => s + (h.earnings || 0), 0);

  return (
    <div className="cr-tab">
      <div className="cr-stats">
        <Stat icon="clock" label={t('career.hist.shifts')} value={fmtNum(st.shifts || history.length, lang)} />
        <Stat icon="list" label={t('career.hist.incidents')} value={fmtNum(st.incidents || 0, lang)} />
        <Stat icon="handcuffs" label={t('career.hist.arrests')} value={fmtNum(st.arrests || 0, lang)} />
        <Stat icon="route" label={t('career.hist.pursuits')} value={fmtNum(st.pursuitsCaught || 0, lang)} />
        <Stat icon="trophy" label={t('career.hist.best')} value={fmtNum(st.bestScore || 0, lang)} />
        <Stat icon="money" label={t('career.hist.earned')} value={fmtMoney(earned, lang, { sign: true })} />
      </div>
      {rows.length === 0 ? (
        <Empty icon="clock" title={t('career.hist.empty')}>
          {t('career.hist.emptyHint')}
        </Empty>
      ) : (
        <div className="cr-tablewrap">
          <table className="cr-table cr-table--history">
            <thead>
              <tr>
                <th className="cr-num">{t('career.history.day')}</th>
                <th>{t('career.history.region')}</th>
                <th>{t('career.history.grade')}</th>
                <th>{t('career.history.score')}</th>
                <th className="cr-num">{t('career.history.incidents')}</th>
                <th className="cr-num">{t('career.history.earnings')}</th>
                <th className="cr-num">{t('career.history.rep')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((h, i) => (
                <tr key={`${h.day}-${i}`}>
                  <td className="mono cr-num">{h.day}</td>
                  <td>{t(`career.region.${h.regionId}.name`)}</td>
                  <td>
                    <Badge tone={gradeTone(h.grade)} className="cr-grade">
                      {h.grade}
                    </Badge>
                  </td>
                  <td>
                    <div className="cr-meterc cr-meterc--score">
                      <Meter value={h.score / 100} tone="accent" label={t('career.history.score')} />
                      <span className="mono">{Math.round(h.score)}</span>
                    </div>
                  </td>
                  <td className="mono cr-num">{fmtNum(h.incidents || 0, lang)}</td>
                  <td className={`mono cr-num ${h.earnings >= 0 ? 'cr-pos' : 'cr-neg'}`}>{fmtMoney(h.earnings, lang, { sign: true })}</td>
                  <td className={`mono cr-num ${h.reputationDelta > 0 ? 'cr-pos' : h.reputationDelta < 0 ? 'cr-neg' : 'dim'}`}>
                    {h.reputationDelta ? fmtSigned(h.reputationDelta, lang) : '±0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > limit && (
            <div className="cr-more">
              <Button size="sm" variant="ghost" icon="chevron-down" onClick={() => setLimit((l) => l + PAGE)}>
                {t('career.showMore', { n: rows.length - limit })}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
