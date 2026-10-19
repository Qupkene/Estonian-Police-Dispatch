// "Vastutusala" (the career's area of responsibility) and the prefect's offer of new sectors (docs/SECTORS.md).
import { useEffect, useMemo, useState } from 'react';
import { SECTOR_HANDOVER } from '@/data/economy';
import { REGIONS } from '@/data/regions';
import { useLang, useT, useTx } from '@/i18n';
import { offerProgress, positionTitle } from '@/sim/careerSectors';
import { sectorById } from '@/sim/sectors';
import type { CareerProfile, RegionId, SectorDef } from '@/sim/types';
import { Badge, Button, Emblem, Icon, Modal } from '@/ui/components';
import { fmtMoney, safe } from './helpers';
import { SectorMap, type SectorPaint } from './SectorMap';
import { careerDailyBudget, useSectorActions } from './sectorActions';
import { colleagueName, coverageOf, coveredIn, postRows, sectorRows, unlockedOrder, wholeIn, type PostRow, type SectorState } from './sectors';

const STATE_PAINT: Record<SectorState, SectorPaint> = { covered: 'mine', offered: 'offered', neighbour: 'neighbour', later: 'other' };

/** The player's post in the juhtimiskeskus ("Operatiivinfo haldur", "Vahetuse vanem" ...). */
export function usePosition(profile: CareerProfile): string {
  const tx = useTx();
  return tx(safe(() => positionTitle(profile), { et: 'Operatiivinfo haldur', en: 'Dispatcher' }));
}

// ── Vastutusala ─────────────────────────────────────────────────────────────

export function AreaCard({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const tx = useTx();
  const position = usePosition(profile);
  const regions = useMemo(() => unlockedOrder(profile), [profile]);
  const [shown, setShown] = useState<RegionId>(profile.regionId);
  useEffect(() => {
    if (!regions.includes(shown)) setShown(profile.regionId);
  }, [regions, shown, profile.regionId]);
  const rows = useMemo(() => safe(() => sectorRows(profile, shown), []), [profile, shown]);
  const cover = coverageOf(profile, shown);
  if (!rows.length && regions.length < 2) return null;
  const paint = Object.fromEntries(rows.map((r) => [r.sector.id, STATE_PAINT[r.state]]));
  const regionName = t(`career.region.${shown}.name`);

  return (
    <section className="cr-card cr-area" aria-labelledby="cr-area-title">
      <header className="cr-kpi__head">
        <Icon name="map" size={14} />
        <span id="cr-area-title">{t('career.area.title')}</span>
        <span className="cr-area__pos" title={t('career.area.positionHint')}>
          <Icon name="id" size={12} /> {position}
        </span>
      </header>

      <div className="cr-area__body">
        <div className="cr-area__mapcol">
          {rows.length > 0 ? (
            <SectorMap regionId={shown} paint={paint} labels="mine" className="cr-area__map" />
          ) : (
            <div className="cr-area__nomap">
              <Icon name="map" size={22} />
            </div>
          )}
          <ul className="cr-area__legend" aria-hidden="true">
            <li className="is-mine">{t('career.area.legend.mine')}</li>
            {rows.some((r) => r.state === 'offered') && <li className="is-offered">{t('career.area.legend.offered')}</li>}
            {rows.some((r) => r.state === 'neighbour') && <li className="is-neighbour">{t('career.area.legend.neighbour')}</li>}
          </ul>
        </div>

        <div className="cr-area__info">
          <h3 className="cr-area__region">
            {regionName}
            <span className="dim">
              {cover.whole ? t('career.area.whole') : t('career.area.count', { n: cover.covered, total: cover.total })}
            </span>
          </h3>
          {rows.length > 0 && (
            <ul className="cr-area__list">
              {rows.map((r) => (
                <li key={r.sector.id} className={`cr-area__row is-${r.state}`}>
                  <span className="cr-area__dot" aria-hidden="true" />
                  <span className="cr-area__name">{tx(r.sector.name)}</span>
                  <span className="cr-area__state">
                    {r.state === 'covered'
                      ? t('career.area.state.covered')
                      : r.state === 'offered'
                        ? t('career.area.state.offered')
                        : r.state === 'neighbour'
                          ? t('career.area.state.neighbour', { name: r.colleague })
                          : t('career.area.state.later', { name: r.colleague })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <NextOffer profile={profile} regionId={shown} whole={cover.whole} />
        </div>
      </div>

      {!cover.whole && <Posts profile={profile} regionId={shown} />}

      {regions.length > 1 && (
        <div className="cr-area__regions">
          <span className="cr-field__label">{t('career.area.regions')}</span>
          <div className="cr-area__regionlist" role="group" aria-label={t('career.area.regions')}>
            {regions.map((id) => {
              const c = coverageOf(profile, id);
              return (
                <button key={id} type="button" className={`cr-area__regionbtn${id === shown ? ' is-active' : ''}`} aria-pressed={id === shown} onClick={() => setShown(id)}>
                  <strong>{t(`career.region.${id}.name`)}</strong>
                  <span>
                    {c.whole
                      ? t('career.area.wholeShort')
                      : c.names.length
                        ? c.names.map((n) => tx(n)).join(', ')
                        : t('career.area.count', { n: c.covered, total: c.total })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function NextOffer({ profile, regionId, whole }: { profile: CareerProfile; regionId: RegionId; whole: boolean }) {
  const t = useT();
  const tx = useTx();
  if (whole) return <p className="cr-area__next is-done">{t('career.area.wholeText')}</p>;
  if (profile.offer) return <p className="cr-area__next is-ready">{t('career.area.offerWaiting')}</p>;
  const prog = safe(() => offerProgress(profile, regionId), { ready: false, needs: [] });
  if (prog.ready)
    return (
      <p className="cr-area__next is-ready">
        <Icon name="star" size={13} /> {t('career.area.ready')}
      </p>
    );
  if (!prog.needs.length) return null;
  return (
    <div className="cr-area__next">
      <span className="cr-area__nextTitle">{t('career.area.needs')}</span>
      <ul>
        {prog.needs.map((n, i) => (
          <li key={i}>
            <Icon name="chevron-right" size={11} /> {tx(n)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Posts({ profile, regionId }: { profile: CareerProfile; regionId: RegionId }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const { openPost } = useSectorActions();
  const rows = useMemo(() => safe(() => postRows(profile, regionId), []), [profile, regionId]);
  const [confirm, setConfirm] = useState<PostRow | null>(null);
  if (!rows.length) return null;
  const nameOf = (r: PostRow) => (r.station ? tx(r.station.name) : r.stationId);
  const close = () => setConfirm(null);
  return (
    <div className="cr-area__posts">
      <div className="cr-area__postsHead">
        <span className="cr-field__label">{t('career.posts.title')}</span>
        <span className="dim">{t('career.posts.lead')}</span>
      </div>
      <ul className="cr-posts">
        {rows.map((r) => {
          const short = profile.money < r.price;
          return (
            <li key={r.stationId} className={`cr-post${r.open ? ' is-open' : ''}`}>
              <span className="cr-post__icon" aria-hidden="true">
                <Icon name="building" size={14} />
              </span>
              <span className="cr-post__text">
                <strong>{nameOf(r)}</strong>
                <span className="dim">{tx(r.sector.name)}</span>
              </span>
              {r.open ? (
                <Badge tone="ok" icon="check">
                  {t('career.posts.open')}
                </Badge>
              ) : (
                <span className="cr-post__buy">
                  <span className="cr-post__price mono">
                    {fmtMoney(r.price, lang)}
                    <small>
                      {' '}
                      + {fmtMoney(r.upkeep, lang)} {t('career.perMonth')}
                    </small>
                  </span>
                  <Button size="sm" variant="secondary" icon="plus" disabled={short} title={short ? t('career.posts.noMoney') : undefined} onClick={() => setConfirm(r)}>
                    {t('career.posts.openBtn')}
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <Modal
        open={!!confirm}
        onClose={close}
        title={confirm ? t('career.posts.confirmTitle', { name: nameOf(confirm) }) : ''}
        icon="building"
        tone="accent"
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {t('career.cancel')}
            </Button>
            <Button
              variant="primary"
              icon="check"
              onClick={() => {
                if (confirm && openPost(confirm.stationId, nameOf(confirm))) close();
              }}
            >
              {confirm ? t('career.posts.confirmBtn', { price: fmtMoney(confirm.price, lang) }) : ''}
            </Button>
          </>
        }
      >
        {confirm && (
          <>
            <p>{t('career.posts.confirmText', { name: nameOf(confirm), sector: tx(confirm.sector.name) })}</p>
            <dl className="cr-kv">
              <div>
                <dt>{t('career.posts.price')}</dt>
                <dd className="mono">{fmtMoney(confirm.price, lang)}</dd>
              </div>
              <div>
                <dt>{t('career.posts.upkeep')}</dt>
                <dd className="mono">
                  {fmtMoney(confirm.upkeep, lang)} {t('career.perMonth')}
                </dd>
              </div>
              <div className="cr-kv__total">
                <dt>{t('career.posts.after')}</dt>
                <dd className="mono">{fmtMoney(profile.money - confirm.price, lang)}</dd>
              </div>
            </dl>
          </>
        )}
      </Modal>
    </div>
  );
}

// ── The prefect's offer ─────────────────────────────────────────────────────

export function OfferCard({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const { accept, decline } = useSectorActions();
  const offer = profile.offer;
  const choices = useMemo(() => (offer?.choices ?? []).map((id) => sectorById(id)).filter((x): x is SectorDef => !!x), [offer]);
  if (!offer || !choices.length) return null;
  const region = REGIONS[offer.regionId];
  const commander = region?.commander;
  const first = profile.name.trim().split(/\s+/)[0] || profile.name;
  const paint: Record<string, SectorPaint> = Object.fromEntries([
    ...coveredIn(profile, offer.regionId).map((id) => [id, 'mine' as SectorPaint]),
    ...choices.map((c) => [c.id, 'offered' as SectorPaint]),
  ]);
  const one = choices.length === 1;
  // How much the daily budget grows with the sector (the rule itself, on the profile as it would be).
  const covered = coveredIn(profile, offer.regionId);
  const gain = (id: string) =>
    careerDailyBudget({ ...profile, sectors: { ...profile.sectors, [offer.regionId]: [...covered, id] } }, offer.regionId) -
    careerDailyBudget(profile, offer.regionId);
  return (
    <section className="cr-offer" aria-labelledby="cr-offer-title">
      <div className="cr-offer__note">
        <header className="cr-offer__head">
          <Emblem size={40} />
          <div>
            <p className="cr-eyebrow">{t('career.offer.eyebrow', { region: t(`career.region.${offer.regionId}.name`) })}</p>
            <h2 id="cr-offer-title" className="cr-offer__title">
              {t(one ? 'career.offer.titleOne' : 'career.offer.title')}
            </h2>
          </div>
        </header>
        <p className="cr-offer__text">
          {t(one ? 'career.offer.textOne' : 'career.offer.text', { name: first, sector: tx(choices[0].name) })}
        </p>
        <footer className="cr-offer__sign">
          <span className="cr-offer__sigName">{commander?.name ?? t('career.offer.prefect')}</span>
          {commander && <span className="dim">{tx(commander.title)}</span>}
        </footer>
        <SectorMap regionId={offer.regionId} paint={paint} labels="mine" className="cr-offer__map" />
      </div>
      <div className="cr-offer__choices">
        {choices.map((c) => (
          <article key={c.id} className="cr-offercard" data-sector={c.id}>
            <header>
              <h3>{tx(c.name)}</h3>
              <span className="cr-offercard__now">{t('career.offer.now', { name: colleagueName(c) })}</span>
            </header>
            <p>{tx(c.blurb)}</p>
            {c.traits.length > 0 && (
              <div className="cr-offercard__traits">
                {c.traits.map((tr, i) => (
                  <span key={i} className="cr-chip">
                    {tx(tr)}
                  </span>
                ))}
              </div>
            )}
            <dl className="cr-offercard__comes" aria-label={t('career.offer.comes')}>
              <div>
                <dt>{t('career.offer.k.staff')}</dt>
                <dd className="mono">{t('career.offer.v.staff', { lo: SECTOR_HANDOVER.staff[0], hi: SECTOR_HANDOVER.staff[1] })}</dd>
              </div>
              <div>
                <dt>{t('career.offer.k.cars')}</dt>
                <dd className="mono">{t('career.offer.v.cars')}</dd>
              </div>
              {gain(c.id) > 0 && (
                <div>
                  <dt>{t('career.offer.k.budget')}</dt>
                  <dd className="mono">+{fmtMoney(gain(c.id), lang)}</dd>
                </div>
              )}
              <div>
                <dt>{t('career.offer.k.grant')}</dt>
                <dd className="mono">{fmtMoney(SECTOR_HANDOVER.grant, lang)}</dd>
              </div>
            </dl>
            <Button variant="primary" icon="check" onClick={() => accept(c.id)} block aria-label={t('career.offer.takeLabel', { name: tx(c.name) })}>
              {t('career.offer.take')}
            </Button>
          </article>
        ))}
        <div className="cr-offer__later">
          <Button variant="ghost" icon="clock" onClick={decline}>
            {t('career.offer.notNow')}
          </Button>
          <span className="dim">{t('career.offer.notNowHint')}</span>
        </div>
      </div>
    </section>
  );
}

/** Coverage of the career in a prefecture for one-line summaries ("Tartu linn", "kogu prefektuur"). */
export function useAreaLabel(profile: CareerProfile, regionId: RegionId): string {
  const t = useT();
  const tx = useTx();
  if (safe(() => wholeIn(profile, regionId), true)) return t('career.area.wholeShort');
  const c = coverageOf(profile, regionId);
  return c.names.length ? c.names.map((n) => tx(n)).join(', ') : t('career.area.count', { n: c.covered, total: c.total });
}
