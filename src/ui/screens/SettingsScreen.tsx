// Settings. Owned by ui-shell.
import { useEffect, useState, type ReactNode } from 'react';
import { useSettings, type MapStyleKey } from '@/store/settings';
import { useCareer } from '@/store/career';
import { useGame } from '@/store/game';
import { useAccount } from '@/net/account';
import { useLang, useT } from '@/i18n';
import { sfx } from '@/audio/sfx';
import { onVoicesChanged, speak, speechAvailable, voiceName } from '@/audio/speech';
import type { Lang } from '@/sim/types';
import { Button, Modal, Segmented, Slider, Toggle } from '@/ui/components';
import { ShellPage, useToast } from './shell/ShellPage';
import { clearEpdStorage } from './shell/helpers';
import './shell/settings.css';

const MAP_STYLES: MapStyleKey[] = ['dark', 'tactical', 'maaamet', 'foto'];

function useVoices() {
  const [, setN] = useState(0);
  useEffect(() => onVoicesChanged(() => setN((n) => n + 1)), []);
}

export function SettingsScreen() {
  const t = useT();
  const lang = useLang();
  const s = useSettings();
  const resetCareer = useCareer((c) => c.reset);
  const hasCareer = useCareer((c) => !!c.profile);
  const [confirm, setConfirm] = useState<'career' | 'all' | null>(null);
  const [clearing, setClearing] = useState(false);
  const accountUser = useAccount((a) => a.user);
  const toast = useToast();
  useVoices();

  const voiceOk = speechAvailable(lang);
  const vName = voiceName(lang);

  const doClearAll = async () => {
    if (clearing) return;
    setClearing(true);
    // "Sign-in" is part of what this deletes: end the account session first (pending cloud uploads go
    // out before), or the reload would pull the cloud data straight back and stay signed in.
    try {
      await useAccount.getState().forget();
    } catch {
      /* offline: nothing to end */
    }
    try {
      useGame.getState().quitShift();
      clearEpdStorage(localStorage);
    } catch {
      /* storage blocked */
    }
    window.location.reload();
  };

  return (
    <ShellPage title={t('shell.set.title')} subtitle={t('shell.set.subtitle')}>
      {toast.node}
      <div className="vk-set">
        <Section id="general" title={t('shell.set.sec.general')}>
          <Row label={t('shell.set.lang')} desc={t('shell.set.langDesc')}>
            <Segmented<Lang>
              label={t('shell.set.lang')}
              value={s.lang}
              onChange={(v) => s.set({ lang: v })}
              options={[
                { value: 'et', label: 'Eesti' },
                { value: 'en', label: 'English' },
              ]}
            />
          </Row>
          <Row label={t('shell.set.theme')} desc={t('shell.set.themeDesc')}>
            <Segmented<'dark' | 'light'>
              label={t('shell.set.theme')}
              value={s.theme}
              onChange={(v) => s.set({ theme: v })}
              options={[
                { value: 'dark', label: t('shell.set.theme.dark') },
                { value: 'light', label: t('shell.set.theme.light') },
              ]}
            />
          </Row>
          <Row label={t('shell.set.scale')} desc={t('shell.set.scaleDesc')}>
            <div className="vk-set__slider">
              <Slider
                value={s.uiScale}
                min={0.85}
                max={1.25}
                step={0.05}
                onChange={(v) => s.set({ uiScale: Math.round(v * 100) / 100 })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          </Row>
          <Row label={t('shell.set.hints')} desc={t('shell.set.hintsDesc')}>
            <Toggle checked={s.hints} onChange={(v) => s.set({ hints: v })} />
          </Row>
        </Section>

        <Section id="audio" title={t('shell.set.sec.audio')}>
          <Row label={t('shell.set.volume')} desc={t('shell.set.volumeDesc')}>
            <div className="vk-set__slider vk-set__slider--btn">
              <Slider
                value={s.volume}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => s.set({ volume: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Button
                size="sm"
                onClick={() => {
                  sfx.unlock();
                  sfx.play('newIncident');
                }}
              >
                {t('shell.set.test')}
              </Button>
            </div>
          </Row>
          <Row label={t('shell.set.sfx')} desc={t('shell.set.sfxDesc')}>
            <Toggle checked={s.sfx} onChange={(v) => s.set({ sfx: v })} />
          </Row>
          <Row label={t('shell.set.ambience')} desc={t('shell.set.ambienceDesc')}>
            <Toggle checked={s.ambience} onChange={(v) => s.set({ ambience: v })} />
          </Row>
          <Row
            label={t('shell.set.radioVoice')}
            desc={
              <>
                {t('shell.set.radioVoiceDesc')}{' '}
                <span className={`vk-set__state${voiceOk ? ' is-ok' : ' is-warn'}`}>
                  {voiceOk ? t('shell.set.voice.ok', { name: vName ?? '' }) : t('shell.set.voice.none')}
                </span>
              </>
            }
          >
            <div className="vk-set__inline">
              <Button
                size="sm"
                disabled={!voiceOk}
                onClick={() => {
                  sfx.unlock();
                  speak(t('shell.set.voiceSample'), lang, {
                    radio: true,
                    volume: s.volume,
                    speaker: { from: 'PÕHJA 21' },
                  });
                }}
              >
                {t('shell.set.test')}
              </Button>
              <Toggle checked={s.radioVoice} onChange={(v) => s.set({ radioVoice: v })} />
            </div>
          </Row>
        </Section>

        <Section id="map" title={t('shell.set.sec.map')} wide>
          <div className="vk-mapstyles" role="radiogroup" aria-label={t('shell.set.mapStyle')}>
            {MAP_STYLES.map((m) => {
              const active = s.mapStyle === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`vk-mapstyle${active ? ' is-active' : ''}`}
                  onClick={() => s.set({ mapStyle: m })}
                  data-sfx="click"
                >
                  <span className={`vk-mapstyle__prev vk-mapstyle__prev--${m}`} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <b />
                  </span>
                  <span className="vk-mapstyle__name">{t(`shell.map.${m}`)}</span>
                  <span className="vk-mapstyle__net">
                    {m === 'tactical' ? t('shell.map.offline') : t('shell.map.online')}
                  </span>
                  <span className="vk-mapstyle__desc">{t(`shell.map.${m}.desc`)}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section id="access" title={t('shell.set.sec.access')}>
          <Row label={t('shell.set.reduced')} desc={t('shell.set.reducedDesc')}>
            <Toggle checked={s.reducedMotion} onChange={(v) => s.set({ reducedMotion: v })} />
          </Row>
          <Row label={t('shell.set.colorblind')} desc={t('shell.set.colorblindDesc')}>
            <Toggle checked={s.colorblind} onChange={(v) => s.set({ colorblind: v })} />
          </Row>
          <div className="vk-set__swatches" aria-hidden="true">
            {[1, 2, 3, 4].map((p) => (
              <span key={p} className={`ui-prio ui-prio--${p}`}>
                P{p}
              </span>
            ))}
            <span className="ui-status ui-status--available">
              <i className="ui-status__dot" />1
            </span>
            <span className="ui-status ui-status--enroute">
              <i className="ui-status__dot" />2
            </span>
            <span className="ui-status ui-status--onscene">
              <i className="ui-status__dot" />3
            </span>
            <span className="ui-status ui-status--emergency">
              <i className="ui-status__dot" />9
            </span>
          </div>
        </Section>

        <Section id="data" title={t('shell.set.sec.data')}>
          <p className="vk-set__note">{t(accountUser ? 'account.set.storage' : 'shell.set.storage')}</p>
          <Row label={t('shell.set.resetCareer')} desc={t('shell.set.resetCareerDesc')}>
            <Button variant="secondary" disabled={!hasCareer} onClick={() => setConfirm('career')}>
              {t('shell.set.reset')}
            </Button>
          </Row>
          <Row label={t('shell.set.clearAll')} desc={t('shell.set.clearAllDesc')}>
            <Button variant="danger" onClick={() => setConfirm('all')}>
              {t('shell.set.clear')}
            </Button>
          </Row>
        </Section>
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        tone="danger"
        icon="warning"
        width={460}
        title={confirm === 'all' ? t('shell.set.clearAll') : t('shell.set.resetCareer')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t('shell.set.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={clearing}
              onClick={() => {
                if (confirm === 'all') void doClearAll();
                else {
                  resetCareer();
                  setConfirm(null);
                  toast.show(t('shell.set.careerReset'), 'ok');
                }
              }}
            >
              {t('shell.set.confirm')}
            </Button>
          </>
        }
      >
        <p className="vk-set__confirm">
          {confirm === 'all' ? t('shell.set.clearAllConfirm') : t('shell.set.resetCareerConfirm')}
        </p>
        {confirm === 'all' && accountUser && <p className="vk-set__confirm">{t('account.set.clearAll')}</p>}
      </Modal>
    </ShellPage>
  );
}

function Section({
  id,
  title,
  children,
  wide,
}: {
  id: string;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`vk-panel vk-set__sec${wide ? ' is-wide' : ''}`} aria-labelledby={`vk-set-${id}`}>
      <div className="vk-panel__head">
        <h2 className="vk-h" id={`vk-set-${id}`}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Row({ label, desc, children }: { label: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="vk-set__row">
      <div className="vk-set__text">
        <div className="vk-set__label">{label}</div>
        {desc && <div className="vk-set__desc">{desc}</div>}
      </div>
      <div className="vk-set__ctrl">{children}</div>
    </div>
  );
}
