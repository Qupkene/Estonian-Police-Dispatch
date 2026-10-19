// "Vastutusala" (the career's area of responsibility), the prefect's offer of new sectors and the police posts
// (docs/SECTORS.md), as Valvekaart panels on the career page's duty map.
import { useEffect, useMemo, useState } from 'react';
import { REGIONS } from '@/data/regions';
import { useLang, useT, useTx } from '@/i18n';
import { offerProgress, positionTitle } from '@/sim/careerSectors';
import { sectorById } from '@/sim/sectors';
import type { CareerProfile, RegionId, SectorDef } from '@/sim/types';
import { Modal, Button } from '@/ui/components';
import { fmtMoney, rankName, safe } from './helpers';
import { nextRegionRank, offerFacts } from './hqModel';
import { useSectorActions } from './sectorActions';
import { coverageOf, postRows, sectorRows, wholeIn, type PostRow, type SectorState } from './sectors';

/** The player's post in the juhtimiskeskus ("Operatiivinfo haldur", "Vahetuse vanem" ...). */
export function usePosition(profile: CareerProfile): string {
  const tx = useTx();
  return tx(safe(() => positionTitle(profile), { et: 'Operatiivinfo haldur', en: 'Dispatcher' }));
}

/** Coverage of the career in a prefecture for one-line summaries ("Tartu linn", "kogu prefektuur"). */
export function useAreaLabel(profile: CareerProfile, regionId: RegionId): string {
  const t = useT();
  const tx = useTx();
  if (safe(() => wholeIn(profile, regionId), true)) return t('career.area.wholeShort');
  const c = coverageOf(profile, regionId);
  return c.names.length
    ? c.names.map((n) => tx(n)).join(', ')
    : t('career.area.count', { n: c.covered, total: c.total });
}

function lowerFirst(s: string, lang: string): string {
  return s ? s[0].toLocaleLowerCase(lang) + s.slice(1) : s;
}

/** The swatch of a sector's state, as on the map and in its key. */
export function Swatch({ state }: { state: SectorState | 'mine' }) {
  const cls =
    state === 'covered' || state === 'mine' ? 'is-mine' : state === 'offered' ? 'is-offer' : 'is-other';
  return <span className={`cr-swatch ${cls}`} aria-hidden="true" />;
}

// ── Vastutusala ─────────────────────────────────────────────────────────────

export function AreaPanel({ profile, regionId }: { profile: CareerProfile; regionId: RegionId }) {
  const t = useT();
  const tx = useTx();
  const rows = useMemo(() => safe(() => sectorRows(profile, regionId), []), [profile, regionId]);
  const cover = coverageOf(profile, regionId);
  const regionName = t(`career.region.${regionId}.name`);
  const lockRank = nextRegionRank(profile);
  const lockName = lockRank !== null ? tx(rankName(lockRank)) : '';
  const count = cover.whole
    ? t('career.vk.area.all', { total: cover.total })
    : t(cover.covered === 1 ? 'career.vk.area.one' : 'career.vk.area.many', {
        n: cover.covered,
        total: cover.total,
      });
  const stateText = (s: SectorState) => t(`career.vk.area.state.${s}`);
  return (
    <section className="vk-panel cr-area" aria-labelledby="cr-area-title">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="cr-area-title">
          {t('career.area.title')}
        </h2>
        <span className="vk-panel__meta cr-area__region">
          {regionName}, {count}
        </span>
      </div>
      {rows.length > 0 && (
        <table className="vk-table cr-area__table">
          <caption>{t('career.vk.area.caption', { region: regionName })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('career.vk.col.sector')}</th>
              <th scope="col">{t('career.vk.col.desk')}</th>
              <th scope="col" className="is-end">
                {t('career.vk.col.state')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mine = r.state === 'covered';
              return (
                <tr key={r.sector.id} className={`cr-area__row is-${r.state}`} data-sector={r.sector.id}>
                  <td>
                    <span className="cr-area__name">
                      <Swatch state={r.state} />
                      {tx(r.sector.name)}
                    </span>
                  </td>
                  <td className="cr-area__desk" title={mine ? profile.name : r.colleague}>
                    {mine ? (
                      profile.name
                    ) : (
                      <>
                        <span className="cr-ai" title={t('career.vk.aiTitle')}>
                          AI
                        </span>
                        {r.colleague}
                      </>
                    )}
                  </td>
                  <td className="is-end cr-area__state">{stateText(r.state)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="cr-area__foot">
        <p>{cover.whole ? t('career.area.wholeText') : t('career.vk.area.foot')}</p>
        {lockName && <p>{t('career.vk.area.lock', { rank: lockName })}</p>}
      </div>
    </section>
  );
}

// ── The prefect's offer ─────────────────────────────────────────────────────

export function OfferPanel({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const { accept, decline } = useSectorActions();
  const offer = profile.offer;
  const choices = useMemo(
    () => (offer?.choices ?? []).map((id) => sectorById(id)).filter((x): x is SectorDef => !!x),
    [offer],
  );
  const [pick, setPick] = useState(0);
  useEffect(() => setPick(0), [offer]);
  if (!offer || !choices.length) return null;
  const chosen = choices[Math.min(pick, choices.length - 1)];
  const facts = offerFacts(profile, chosen.id);
  const commander = REGIONS[offer.regionId]?.commander;
  const first = profile.name.trim().split(/\s+/)[0] || profile.name;
  const one = choices.length === 1;
  const quote = t(one ? 'career.offer.textOne' : 'career.offer.text', {
    name: first,
    sector: tx(chosen.name),
  });
  return (
    <section className="vk-panel cr-offer" aria-labelledby="cr-offer-title">
      <div className="vk-panel__head">
        <Swatch state="offered" />
        <h2 className="vk-h" id="cr-offer-title">
          {t('career.vk.offer.title')}
        </h2>
        <span className="vk-meta">{t('career.dayN', { n: offer.day })}</span>
      </div>
      {!one && (
        <div className="cr-offer__pick">
          <span className="vk-label" id="cr-offer-pick">
            {t('career.vk.offer.choices')}
          </span>
          <span className="vk-seg" role="group" aria-labelledby="cr-offer-pick">
            {choices.map((c, i) => (
              <button key={c.id} type="button" aria-pressed={c.id === chosen.id} onClick={() => setPick(i)}>
                {tx(c.name)}
              </button>
            ))}
          </span>
        </div>
      )}
      <article className="cr-offercard" data-sector={chosen.id}>
        <div className="cr-offer__body">
          <p className="cr-offer__name">{tx(chosen.name)}</p>
          <p className="cr-offer__from">
            {commander
              ? `${commander.name}, ${lowerFirst(tx(commander.title), lang)}`
              : t('career.offer.prefect')}
          </p>
          <blockquote className="cr-offer__quote">„{quote}“</blockquote>
          <p className="cr-offer__blurb">{tx(chosen.blurb)}</p>
        </div>
        <dl className="cr-offer__facts">
          <div>
            <dt>{t('career.vk.offer.position')}</dt>
            <dd>{lowerFirst(tx(facts.positionAfter), lang)}</dd>
          </div>
          <div>
            <dt>{t('career.kpi.dailyBudget')}</dt>
            <dd className="vk-mono">
              {fmtMoney(facts.budget, lang)} → {fmtMoney(facts.budgetAfter, lang)}
            </dd>
          </div>
          <div>
            <dt>{t('career.vk.offer.grant')}</dt>
            <dd className="vk-mono vk-up">{fmtMoney(facts.grant, lang, { sign: true })}</dd>
          </div>
          <div>
            <dt>{t('career.vk.offer.staff')}</dt>
            <dd>
              <span className="vk-mono">
                +{facts.staff[0]}-{facts.staff[1]}
              </span>{' '}
              {t('career.vk.offer.staffV')}
            </dd>
          </div>
          <div>
            <dt>{t('career.tab.fleet')}</dt>
            <dd>
              <span className="vk-mono">+2</span> {t('career.vk.offer.carsV')}
            </dd>
          </div>
          {facts.colleague && (
            <div>
              <dt>{t('career.vk.offer.now')}</dt>
              <dd>
                <span className="cr-ai">AI</span>
                {facts.colleague}
              </dd>
            </div>
          )}
        </dl>
        <div className="cr-panel__actions">
          <button
            type="button"
            className="vk-btn cr-offer__take"
            onClick={() => accept(chosen.id)}
            aria-label={t('career.offer.takeLabel', { name: tx(chosen.name) })}
          >
            {t('career.vk.offer.accept')}
          </button>
          <button type="button" className="vk-btn vk-btn--ghost" onClick={decline}>
            {t('career.offer.notNow')}
          </button>
        </div>
        <p className="cr-offer__hint">{t('career.vk.offer.hint')}</p>
      </article>
    </section>
  );
}

/** No offer yet: what the prefect waits for before the next one (or that the prefecture is whole). */
export function NextOfferPanel({ profile, regionId }: { profile: CareerProfile; regionId: RegionId }) {
  const t = useT();
  const tx = useTx();
  const prog = safe(() => offerProgress(profile, regionId), { ready: false, needs: [] });
  if (!prog.ready && !prog.needs.length) return null;
  return (
    <section className="vk-panel cr-nextoffer" aria-labelledby="cr-nextoffer-title">
      <div className="vk-panel__head">
        <Swatch state="offered" />
        <h2 className="vk-h" id="cr-nextoffer-title">
          {t('career.vk.offer.title')}
        </h2>
        <span className="vk-panel__meta">{t('career.vk.offer.none')}</span>
      </div>
      <div className="cr-nextoffer__body">
        {prog.ready ? (
          <p>{t('career.area.ready')}</p>
        ) : (
          <>
            <p>{t('career.area.needs')}</p>
            <ul className="cr-rank__unlocks">
              {prog.needs.map((n, i) => (
                <li key={i}>
                  <span aria-hidden="true">·</span>
                  {tx(n)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

// ── Police posts ────────────────────────────────────────────────────────────

export function PostsPanel({ profile, regionId }: { profile: CareerProfile; regionId: RegionId }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const { openPost } = useSectorActions();
  const rows = useMemo(() => safe(() => postRows(profile, regionId), []), [profile, regionId]);
  const [confirm, setConfirm] = useState<PostRow | null>(null);
  if (!rows.length || safe(() => wholeIn(profile, regionId), true)) return null;
  const nameOf = (r: PostRow) => (r.station ? tx(r.station.name) : r.stationId);
  const close = () => setConfirm(null);
  return (
    <section className="vk-panel cr-posts" aria-labelledby="cr-posts-title">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="cr-posts-title">
          {t('career.posts.title')}
        </h2>
        <span className="vk-panel__meta">{t('career.posts.lead')}</span>
      </div>
      <table className="vk-table">
        <caption>{t('career.posts.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('career.vk.col.post')}</th>
            <th scope="col">{t('career.vk.col.sector')}</th>
            <th scope="col" className="is-num">
              {t('career.posts.price')}
            </th>
            <th scope="col" className="is-num">
              {t('career.posts.upkeep')}
            </th>
            <th scope="col" className="is-end">
              {t('career.vk.col.state')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const short = profile.money < r.price;
            return (
              <tr key={r.stationId} className={`cr-post${r.open ? ' is-open' : ''}`}>
                <td className="is-strong">{nameOf(r)}</td>
                <td>{tx(r.sector.name)}</td>
                <td className="is-num">{fmtMoney(r.price, lang)}</td>
                <td className="is-num">
                  {fmtMoney(r.upkeep, lang)} {t('career.perMonth')}
                </td>
                <td className="is-end">
                  {r.open ? (
                    <span className="vk-up">{t('career.posts.open')}</span>
                  ) : (
                    <button
                      type="button"
                      className="vk-btn cr-post__open"
                      disabled={short}
                      title={short ? t('career.posts.noMoney') : undefined}
                      onClick={() => setConfirm(r)}
                    >
                      {t('career.posts.openBtn')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Modal
        open={!!confirm}
        onClose={close}
        title={confirm ? t('career.posts.confirmTitle', { name: nameOf(confirm) }) : ''}
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {t('career.cancel')}
            </Button>
            <Button
              variant="primary"
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
    </section>
  );
}
