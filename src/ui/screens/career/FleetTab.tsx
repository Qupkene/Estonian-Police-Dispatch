import { useMemo, useState } from 'react';
import { useLang, useT, useTx } from '@/i18n';
import * as rules from '@/sim/career';
import { VEHICLE_CATALOG } from '@/data/economy';
import { Badge, Button, Empty, Icon, Meter, Modal } from '@/ui/components';
import type { CareerProfile, CatalogVehicle, FleetVehicle, UnitType } from '@/sim/types';
import { fmtMoney, fmtNum, isLocked, levelTone, pct, rankName, safe, UNIT_TYPES, type RankInfo } from './helpers';
import { LockTag, Plate, Stat, SuitsChips } from './bits';
import { useCareerAction } from './actions';

export function FleetTab({ profile, rank }: { profile: CareerProfile; rank: RankInfo }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const act = useCareerAction();
  const [selling, setSelling] = useState<FleetVehicle | null>(null);
  const fleet = profile.fleet ?? [];
  const upkeep = fleet.reduce((s, v) => s + (v.upkeep || 0), 0);
  const value = fleet.reduce((s, v) => s + (v.price || 0), 0);
  const avgCond = fleet.length ? fleet.reduce((s, v) => s + v.condition, 0) / fleet.length : 0;

  // Specialties with staff but no vehicle that suits them.
  const uncovered = useMemo(() => {
    const suited = new Set<UnitType>(fleet.flatMap((v) => v.suits ?? []));
    const need = new Set<UnitType>((profile.staff ?? []).map((m) => m.specialty));
    return UNIT_TYPES.filter((u) => need.has(u) && !suited.has(u) && u !== 'heli');
  }, [fleet, profile.staff]);

  const resale = selling ? safe<number | null>(() => rules.resaleValue(selling), null) : null;
  const ownedCount = (model: string) => fleet.filter((v) => v.model === model).length;

  const buy = (c: CatalogVehicle) =>
    act.attempt(
      (p) => rules.buyVehicle(p, c.id),
      (diff) => ({ title: t('career.fleet.bought', { model: c.model }), body: fmtMoney(diff || -c.price, lang, { sign: true }) }),
      t('career.fleet.buyFailed'),
    );

  const confirmSell = () => {
    if (!selling) return;
    const v = selling;
    act.update(
      (p) => rules.sellVehicle(p, v.id),
      (diff) => ({ tone: 'info', title: t('career.fleet.sold', { model: v.model }), body: diff ? fmtMoney(diff, lang, { sign: true }) : undefined }),
      t('career.fleet.sellFailed'),
    );
    setSelling(null);
  };

  return (
    <div className="cr-tab">
      <div className="cr-stats">
        <Stat icon="car" label={t('career.fleet.count')} value={fmtNum(fleet.length, lang)} />
        <Stat icon="wrench" label={t('career.fleet.upkeep')} value={fmtMoney(upkeep, lang)} sub={t('career.perMonth')} />
        <Stat icon="gauge" label={t('career.fleet.avgCond')} value={fleet.length ? `${pct(avgCond)} %` : '–'} />
        <Stat icon="money" label={t('career.fleet.value')} value={fmtMoney(value, lang)} />
      </div>

      {uncovered.length > 0 && (
        <p className="cr-notice cr-tone--warn">
          <Icon name="warning" size={14} />
          {t('career.fleet.uncovered', { list: uncovered.map((u) => t(`career.spec.${u}`)).join(', ') })}
        </p>
      )}

      <section className="cr-sub">
        <header className="cr-sub__head">
          <h3>
            <Icon name="car" size={14} /> {t('career.fleet.owned')}
          </h3>
        </header>
        {fleet.length === 0 ? (
          <Empty icon="car">{t('career.fleet.empty')}</Empty>
        ) : (
          <div className="cr-tablewrap">
            <table className="cr-table">
              <thead>
                <tr>
                  <th>{t('career.fleet.col.model')}</th>
                  <th>{t('career.fleet.col.plate')}</th>
                  <th>{t('career.fleet.col.suits')}</th>
                  <th>{t('career.fleet.col.condition')}</th>
                  <th className="cr-num">{t('career.fleet.col.upkeep')}</th>
                  <th className="cr-num">{t('career.fleet.col.bought')}</th>
                  <th aria-label={t('career.actions')} />
                </tr>
              </thead>
              <tbody>
                {fleet.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.model}</strong>
                    </td>
                    <td>
                      <Plate plate={v.plate} />
                    </td>
                    <td>
                      <SuitsChips suits={v.suits} />
                    </td>
                    <td>
                      <div className="cr-meterc">
                        <Meter value={v.condition} tone={levelTone(v.condition)} label={t('career.fleet.col.condition')} />
                        <span className="mono">{pct(v.condition)} %</span>
                      </div>
                    </td>
                    <td className="mono cr-num">{fmtMoney(v.upkeep, lang)}</td>
                    <td className="mono cr-num">{t('career.dayN', { n: v.boughtDay })}</td>
                    <td className="cr-num">
                      <Button size="sm" variant="ghost" icon="money" onClick={() => setSelling(v)}>
                        {t('career.fleet.sell')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="cr-sub">
        <header className="cr-sub__head">
          <h3>
            <Icon name="cart" size={14} /> {t('career.fleet.catalog')}
          </h3>
          <span className="dim">{t('career.fleet.catalogHint')}</span>
        </header>
        {VEHICLE_CATALOG.length === 0 ? (
          <p className="cr-placeholder">{t('career.catalog.pending')}</p>
        ) : (
          <div className="cr-cards cr-cards--shop">
            {VEHICLE_CATALOG.map((c) => {
              const locked = isLocked(c.minRank, rank.index);
              const owned = ownedCount(c.model);
              const short = c.price > profile.money;
              return (
                <article key={c.id} className={`cr-shop${locked ? ' is-locked' : ''}`}>
                  <div className="cr-shop__head">
                    <span className="cr-shop__icon">
                      <VehicleGlyph suits={c.suits} model={c.model} />
                    </span>
                    <div>
                      <strong className="cr-shop__name">{c.model}</strong>
                      <SuitsChips suits={c.suits} />
                    </div>
                    {owned > 0 && <Badge tone="ok">{t('career.fleet.ownedN', { n: owned })}</Badge>}
                  </div>
                  <p className="cr-shop__desc">{tx(c.desc)}</p>
                  <div className="cr-shop__foot">
                    <div className="cr-shop__price">
                      <strong className="mono">{fmtMoney(c.price, lang)}</strong>
                      <span className="dim">
                        + {fmtMoney(c.upkeep, lang)} {t('career.perMonth')}
                      </span>
                    </div>
                    {locked ? (
                      <LockTag label={t('career.lock.rank', { rank: tx(rankName(c.minRank)) || String(c.minRank + 1) })} />
                    ) : (
                      <Button variant={short ? 'secondary' : 'primary'} icon="cart" onClick={() => buy(c)} title={short ? t('career.aff.no') : undefined}>
                        {t('career.buy')}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={!!selling}
        onClose={() => setSelling(null)}
        title={t('career.fleet.sellTitle')}
        tone="warn"
        icon="money"
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelling(null)}>
              {t('career.cancel')}
            </Button>
            <Button variant="warning" icon="money" onClick={confirmSell}>
              {t('career.fleet.sellConfirm')}
            </Button>
          </>
        }
      >
        {selling && (
          <div className="cr-confirm">
            <Plate plate={selling.plate} />
            <div>
              <p>{t('career.fleet.sellText', { model: selling.model })}</p>
              <p className="dim">{t('career.fleet.sellNote', { cond: pct(selling.condition) })}</p>
              {resale !== null && (
                <p className="cr-confirm__value">
                  {t('career.fleet.resale')} <strong className="mono cr-pos">{fmtMoney(resale, lang, { sign: true })}</strong>
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function VehicleGlyph({ suits, model }: { suits: UnitType[]; model: string }) {
  const s = suits ?? [];
  const bike = /mootorratas|motorcycle|\bR\s?\d{3,4}\b|\bbike\b/i.test(model);
  const icon = s.includes('heli') ? 'heli' : s.includes('boat') ? 'boat' : bike ? 'bike' : s.includes('k9') ? 'dog' : 'car';
  return <Icon name={icon} size={20} />;
}
