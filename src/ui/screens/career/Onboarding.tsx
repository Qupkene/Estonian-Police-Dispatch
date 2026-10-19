import { useMemo, useState, type KeyboardEvent } from 'react';
import { useGame } from '@/store/game';
import { useLang, useT, useTx } from '@/i18n';
import { START_MONEY } from '@/data/economy';
import { newCareer } from '@/sim/career';
import { sectorById, sectorsOf, starterSectors } from '@/sim/sectors';
import { Button, Emblem, Icon, IconButton, TextField, type IconName } from '@/ui/components';
import type { RegionId, SectorDef } from '@/sim/types';
import { fmtMoney, fmtNum, randomBadge, REGION_ORDER, safe, validateOnboarding } from './helpers';
import { createCareer } from './sectorActions';
import { SectorMap, type SectorPaint } from './SectorMap';
import { DIFFICULTY_ORDER } from './sectors';
import { useToast } from './Toasts';

const INTRO: { icon: IconName; key: string }[] = [
  { icon: 'star', key: 'staatus' },
  { icon: 'money', key: 'budget' },
  { icon: 'users', key: 'hiring' },
];

/** Starter sectors of a prefecture, the normal one first (a sensible default), then easy, then hard. */
function startersOf(regionId: RegionId): SectorDef[] {
  const order = ['normal', 'easy', 'hard'];
  return safe(() => starterSectors(regionId), [] as SectorDef[])
    .map((x, i) => ({ x, i }))
    .sort((a, b) => order.indexOf(a.x.starter?.difficulty ?? 'normal') - order.indexOf(b.x.starter?.difficulty ?? 'normal') || a.i - b.i)
    .map(({ x }) => x);
}

export function Onboarding() {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const notify = useToast();
  const userName = useGame((s) => s.user?.name);
  const [name, setName] = useState(userName && userName.trim() ? userName.trim() : '');
  const [badge, setBadge] = useState(() => randomBadge());
  const [region, setRegionRaw] = useState<RegionId>('pohja');
  const [sector, setSector] = useState<string | undefined>(() => startersOf('pohja')[0]?.id);
  const starters = useMemo(() => startersOf(region), [region]);
  const setRegion = (id: RegionId) => {
    setRegionRaw(id);
    if (id !== region) setSector(startersOf(id)[0]?.id);
  };
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = useMemo(() => validateOnboarding(name, badge), [name, badge]);
  // What the new career starts with, straight from the rules (one sector's force).
  const start = useMemo(() => {
    const p = safe(() => newCareer('-', '000', region, 1, sector), null);
    const money = p?.money ?? START_MONEY;
    return { money: fmtMoney(money, lang), eur: fmtNum(money, lang), staff: p?.staff.length ?? 10, cars: p?.fleet.length ?? 5 };
  }, [region, sector, lang]);
  const valid = !errors.name && !errors.badge;

  const submit = () => {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    try {
      const picked = sector && starters.some((x) => x.id === sector) ? sector : starters[0]?.id;
      createCareer(name.trim(), badge.trim(), region, picked);
      const sec = picked ? sectorById(picked) : undefined;
      notify(
        'gold',
        t('career.onb.welcome', { name: name.trim() }),
        sec
          ? t('career.onb.welcomeSector', { region: t(`career.region.${region}.name`), sector: tx(sec.name) })
          : t('career.onb.welcomeSub', { region: t(`career.region.${region}.name`) }),
      );
    } catch (err) {
      console.warn('[EPD career] newCareer failed', err);
      notify('danger', t('career.onb.failed'), t('career.actionError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cr-onb">
      <div className="cr-onb__card">
        <header className="cr-onb__head">
          <Emblem size={64} />
          <div>
            <p className="cr-eyebrow">{t('career.onb.eyebrow')}</p>
            <h1 className="cr-onb__title">{t('career.onb.title')}</h1>
            <p className="cr-onb__lead">{t('career.onb.lead')}</p>
          </div>
        </header>

        <ul className="cr-onb__intro">
          {INTRO.map((it) => (
            <li key={it.key}>
              <span className="cr-onb__introicon">
                <Icon name={it.icon} size={18} />
              </span>
              <div>
                <strong>{t(`career.onb.intro.${it.key}.title`)}</strong>
                <p>{t(`career.onb.intro.${it.key}.text`, start)}</p>
              </div>
            </li>
          ))}
        </ul>

        <form
          className="cr-onb__form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <div className="cr-onb__fields">
            <TextField
              label={t('career.onb.name')}
              icon="user"
              value={name}
              maxLength={40}
              autoComplete="name"
              placeholder={t('career.onb.namePh')}
              onChange={setName}
              error={touched && errors.name ? t(errors.name) : undefined}
              autoFocus
            />
            <TextField
              className="cr-field--badge"
              label={t('career.onb.badge')}
              icon="id"
              mono
              value={badge}
              inputMode="numeric"
              maxLength={3}
              onChange={(v) => setBadge(v.replace(/\D/g, '').slice(0, 3))}
              error={touched && errors.badge ? t(errors.badge) : undefined}
              hint={t('career.onb.badgeHint')}
              trailing={<IconButton icon="refresh" size="sm" label={t('career.onb.badgeRandom')} onClick={() => setBadge(randomBadge())} />}
            />
          </div>

          <fieldset className="cr-onb__regions">
            <legend className="cr-field__label">{t('career.onb.region')}</legend>
            <div className="cr-regiongrid">
              {REGION_ORDER.map((id) => {
                // Any prefecture can be the home region; the others unlock with rank (EXTRA_REGION_RANKS).
                const selected = region === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`cr-regioncard cr-regioncard--${id}${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setRegion(id)}
                  >
                    <span className="cr-regioncard__top">
                      <span className="cr-regioncard__name">{t(`career.region.${id}.name`)}</span>
                      {selected && <Icon name="check" size={16} />}
                    </span>
                    <span className="cr-regioncard__hq">
                      <Icon name="building" size={12} /> {t(`career.region.${id}.hq`)}
                    </span>
                    <span className="cr-regioncard__desc">{t(`career.region.${id}.desc`)}</span>
                    <span className="cr-regioncard__meta">
                      <span className="cr-chip">{t(`career.region.${id}.trait`)}</span>
                      {sectorsOf(id).length > 0 && (
                        <span className="cr-regioncard__budget">
                          {t('career.onb.sectors')} <strong>{sectorsOf(id).length}</strong>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {starters.length > 0 && <SectorPicker regionId={region} starters={starters} value={sector} onChange={setSector} />}

          <div className="cr-onb__actions">
            <Button variant="ghost" icon="chevron-left" onClick={() => useGame.getState().setScreen('menu')}>
              {t('career.back')}
            </Button>
            <Button type="submit" variant="primary" size="lg" icon="shield" disabled={busy || (touched && !valid)}>
              {t('career.onb.submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const DIFF_TONE: Record<string, string> = { easy: 'ok', normal: 'accent', hard: 'danger' };

/** The starter sector: a small map of the prefecture's sectors and one card per starter sector. */
function SectorPicker({ regionId, starters, value, onChange }: { regionId: RegionId; starters: SectorDef[]; value: string | undefined; onChange: (id: string) => void }) {
  const t = useT();
  const tx = useTx();
  const current = starters.find((x) => x.id === value) ?? starters[0];
  const paint: Record<string, SectorPaint> = Object.fromEntries(starters.map((x) => [x.id, x.id === current?.id ? 'picked' : 'pickable']));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'];
    if (!keys.includes(e.key) || starters.length < 2) return;
    e.preventDefault();
    const i = Math.max(0, starters.findIndex((x) => x.id === current?.id));
    const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % starters.length : (i - 1 + starters.length) % starters.length;
    onChange(starters[n].id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus();
  };
  return (
    <fieldset className="cr-onb__sectors">
      <legend className="cr-field__label">{t('career.onb.sector')}</legend>
      <p className="cr-onb__sectorLead">{t('career.onb.sectorLead')}</p>
      <div className="cr-sectorpick">
        <div className="cr-sectorpick__map">
          <SectorMap regionId={regionId} paint={paint} labels="mine" onPick={onChange} />
          <span className="cr-sectorpick__mapHint">{t(`career.region.${regionId}.name`)}</span>
        </div>
        <div className="cr-sectorgrid" role="radiogroup" aria-label={t('career.onb.sector')} onKeyDown={onKey}>
          {starters.map((x) => {
            const selected = x.id === current?.id;
            const d = x.starter?.difficulty ?? 'normal';
            return (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                className={`cr-sectorcard${selected ? ' is-selected' : ''}`}
                data-sector={x.id}
                onClick={() => onChange(x.id)}
              >
                <span className="cr-sectorcard__top">
                  <span className="cr-sectorcard__name">{tx(x.name)}</span>
                  <span className={`cr-diff cr-diff--${DIFF_TONE[d] ?? 'accent'}`}>
                    <span className="cr-diff__bars" aria-hidden="true">
                      {DIFFICULTY_ORDER.map((k, i) => (
                        <i key={k} className={i <= DIFFICULTY_ORDER.indexOf(d) ? 'is-on' : ''} />
                      ))}
                    </span>
                    {t(`career.diff.${d}`)}
                  </span>
                </span>
                <span className="cr-sectorcard__blurb">{tx(x.blurb)}</span>
                {x.traits.length > 0 && (
                  <span className="cr-sectorcard__traits">
                    {x.traits.map((tr, i) => (
                      <span key={i} className="cr-chip">
                        {tx(tr)}
                      </span>
                    ))}
                  </span>
                )}
                {selected && (
                  <span className="cr-sectorcard__check" aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
}
