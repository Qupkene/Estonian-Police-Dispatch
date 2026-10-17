import { useMemo, useState } from 'react';
import { useCareer } from '@/store/career';
import { useGame } from '@/store/game';
import { useLang, useT } from '@/i18n';
import { DAILY_BUDGET, RANKS } from '@/data/economy';
import * as economy from '@/data/economy';
import { Button, Emblem, Icon, IconButton, TextField, type IconName } from '@/ui/components';
import type { RegionId } from '@/sim/types';
import { fmtMoney, randomBadge, REGION_ORDER, validateOnboarding } from './helpers';
import { useToast } from './Toasts';

/** Optional rank requirement per prefecture, if engine-systems exposes one in data/economy.ts. */
function regionMinRank(id: RegionId): number {
  const table = (economy as unknown as Record<string, unknown>).REGION_MIN_RANK as Partial<Record<RegionId, number>> | undefined;
  const v = table?.[id];
  return typeof v === 'number' ? v : 0;
}

const INTRO: { icon: IconName; key: string }[] = [
  { icon: 'star', key: 'staatus' },
  { icon: 'money', key: 'budget' },
  { icon: 'users', key: 'hiring' },
];

export function Onboarding() {
  const t = useT();
  const lang = useLang();
  const notify = useToast();
  const userName = useGame((s) => s.user?.name);
  const [name, setName] = useState(userName && userName.trim() ? userName.trim() : '');
  const [badge, setBadge] = useState(() => randomBadge());
  const [region, setRegion] = useState<RegionId>('pohja');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = useMemo(() => validateOnboarding(name, badge), [name, badge]);
  const valid = !errors.name && !errors.badge;

  const submit = () => {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    try {
      useCareer.getState().create(name.trim(), badge.trim(), region);
      notify('gold', t('career.onb.welcome', { name: name.trim() }), t('career.onb.welcomeSub', { region: t(`career.region.${region}.name`) }));
    } catch (err) {
      console.warn('[EPD career] newCareer failed', err);
      notify('danger', t('career.onb.failed'), t('career.rules.pending'));
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
                <p>{t(`career.onb.intro.${it.key}.text`)}</p>
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
                const minRank = regionMinRank(id);
                const locked = minRank > 0;
                const selected = region === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`cr-regioncard cr-regioncard--${id}${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
                    aria-pressed={selected}
                    disabled={locked}
                    onClick={() => setRegion(id)}
                  >
                    <span className="cr-regioncard__top">
                      <span className="cr-regioncard__name">{t(`career.region.${id}.name`)}</span>
                      {selected && !locked && <Icon name="check" size={16} />}
                      {locked && <Icon name="lock" size={14} />}
                    </span>
                    <span className="cr-regioncard__hq">
                      <Icon name="building" size={12} /> {t(`career.region.${id}.hq`)}
                    </span>
                    <span className="cr-regioncard__desc">{t(`career.region.${id}.desc`)}</span>
                    <span className="cr-regioncard__meta">
                      <span className="cr-chip">{t(`career.region.${id}.trait`)}</span>
                      <span className="cr-regioncard__budget">
                        {t('career.onb.dailyBudget')} <strong>{fmtMoney(DAILY_BUDGET[id] ?? 0, lang)}</strong>
                      </span>
                    </span>
                    {locked && (
                      <span className="cr-regioncard__lock">
                        {t('career.lock.rank', { rank: RANKS[minRank]?.name[lang] ?? String(minRank + 1) })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>

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
