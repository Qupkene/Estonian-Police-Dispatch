import { useLang, useT, useTx } from '@/i18n';
import * as rules from '@/sim/career';
import { UPGRADES } from '@/data/economy';
import { Badge, Button, Icon } from '@/ui/components';
import type { CareerProfile, Upgrade } from '@/sim/types';
import { fmtMoney, fmtNum, isLocked, rankName, type RankInfo } from './helpers';
import { GlyphIcon, LockTag, Stat } from './bits';
import { useCareerAction } from './actions';

export function UpgradesTab({ profile, rank }: { profile: CareerProfile; rank: RankInfo }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const act = useCareerAction();
  const owned = new Set(profile.upgrades ?? []);
  const ownedList = UPGRADES.filter((u) => owned.has(u.id));
  const upkeep = ownedList.reduce((s, u) => s + (u.upkeep || 0), 0);
  const available = UPGRADES.filter((u) => !owned.has(u.id) && !isLocked(u.minRank, rank.index)).length;

  const buy = (u: Upgrade) =>
    act.attempt(
      (p) => rules.buyUpgrade(p, u.id),
      (diff) => ({ tone: 'gold', title: t('career.upg.bought', { name: tx(u.name) }), body: fmtMoney(diff || -u.price, lang, { sign: true }) }),
      t('career.upg.buyFailed'),
    );

  // Owned first, then purchasable, then locked (by required rank).
  const order = (u: Upgrade) => (owned.has(u.id) ? 0 : isLocked(u.minRank, rank.index) ? 2 + u.minRank : 1);
  const sorted = [...UPGRADES].sort((a, b) => order(a) - order(b) || a.price - b.price);

  return (
    <div className="cr-tab">
      <div className="cr-stats">
        <Stat icon="shield" label={t('career.upg.owned')} value={`${fmtNum(ownedList.length, lang)} / ${fmtNum(UPGRADES.length, lang)}`} />
        <Stat icon="cart" label={t('career.upg.available')} value={fmtNum(available, lang)} />
        <Stat icon="wrench" label={t('career.upg.upkeep')} value={fmtMoney(upkeep, lang)} sub={t('career.perMonth')} />
      </div>
      {UPGRADES.length === 0 ? (
        <p className="cr-placeholder">{t('career.catalog.pending')}</p>
      ) : (
        <div className="cr-upgrid">
          {sorted.map((u) => {
            const has = owned.has(u.id);
            const locked = !has && isLocked(u.minRank, rank.index);
            const short = u.price > profile.money;
            return (
              <article key={u.id} className={`cr-upg${has ? ' is-owned' : ''}${locked ? ' is-locked' : ''}`}>
                <div className="cr-upg__icon">
                  {locked ? <Icon name="lock" size={20} /> : <GlyphIcon icon={u.icon} size={22} fallback="shield" />}
                </div>
                <div className="cr-upg__body">
                  <div className="cr-upg__title">
                    <strong>{tx(u.name)}</strong>
                    {has && (
                      <Badge tone="ok">
                        <Icon name="check" size={11} /> {t('career.upg.has')}
                      </Badge>
                    )}
                  </div>
                  <p className="cr-upg__desc">{tx(u.desc)}</p>
                  <div className="cr-upg__foot">
                    <span className="cr-upg__price">
                      {has ? (
                        <span className="dim">
                          {fmtMoney(u.upkeep, lang)} {t('career.perMonth')}
                        </span>
                      ) : (
                        <>
                          <strong className="mono">{fmtMoney(u.price, lang)}</strong>
                          {u.upkeep > 0 && (
                            <span className="dim">
                              {' '}
                              + {fmtMoney(u.upkeep, lang)} {t('career.perMonth')}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    {!has &&
                      (locked ? (
                        <LockTag label={t('career.lock.rank', { rank: tx(rankName(u.minRank)) || String(u.minRank + 1) })} />
                      ) : (
                        <Button size="sm" variant={short ? 'secondary' : 'primary'} icon="cart" onClick={() => buy(u)} title={short ? t('career.aff.no') : undefined}>
                          {t('career.buy')}
                        </Button>
                      ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
