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
import { Badge, Button, Icon, Modal, Segmented, Slider, Toggle, type IconName } from '@/ui/components';
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
    <ShellPage title={t('shell.set.title')} subtitle={t('shell.set.subtitle')} icon="settings">
      {toast.node}
      <div className="sh-set">
        <Section icon="globe" title={t('shell.set.sec.general')}>
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
                { value: 'dark', label: t('shell.set.theme.dark'), icon: 'moon' },
                { value: 'light', label: t('shell.set.theme.light'), icon: 'sun' },
              ]}
            />
          </Row>
          <Row label={t('shell.set.scale')} desc={t('shell.set.scaleDesc')}>
            <div className="sh-set__slider">
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

        <Section icon="volume" title={t('shell.set.sec.audio')}>
          <Row label={t('shell.set.volume')} desc={t('shell.set.volumeDesc')}>
            <div className="sh-set__slider sh-set__slider--btn">
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
                icon="volume"
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
                {voiceOk ? (
                  <Badge tone="ok" icon="check">
                    {t('shell.set.voice.ok', { name: vName ?? '' })}
                  </Badge>
                ) : (
                  <Badge tone="warn" icon="warning">
                    {t('shell.set.voice.none')}
                  </Badge>
                )}
              </>
            }
          >
            <div className="sh-set__inline">
              <Button
                size="sm"
                icon="mic"
                disabled={!voiceOk}
                onClick={() => {
                  sfx.unlock();
                  speak(t('shell.set.voiceSample'), lang, { radio: true, volume: s.volume });
                }}
              >
                {t('shell.set.test')}
              </Button>
              <Toggle checked={s.radioVoice} onChange={(v) => s.set({ radioVoice: v })} />
            </div>
          </Row>
        </Section>

        <Section icon="map" title={t('shell.set.sec.map')} wide>
          <div className="sh-mapstyles" role="radiogroup" aria-label={t('shell.set.mapStyle')}>
            {MAP_STYLES.map((m) => {
              const active = s.mapStyle === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`sh-mapstyle${active ? ' is-active' : ''}`}
                  onClick={() => s.set({ mapStyle: m })}
                  data-sfx="click"
                >
                  <span className={`sh-mapstyle__prev sh-mapstyle__prev--${m}`} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <b />
                  </span>
                  <span className="sh-mapstyle__name">
                    {t(`shell.map.${m}`)}
                    {m === 'tactical' ? (
                      <Badge tone="ok">{t('shell.map.offline')}</Badge>
                    ) : (
                      <Badge tone="neutral" icon="globe">
                        {t('shell.map.online')}
                      </Badge>
                    )}
                  </span>
                  <span className="sh-mapstyle__desc">{t(`shell.map.${m}.desc`)}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section icon="eye" title={t('shell.set.sec.access')}>
          <Row label={t('shell.set.reduced')} desc={t('shell.set.reducedDesc')}>
            <Toggle checked={s.reducedMotion} onChange={(v) => s.set({ reducedMotion: v })} />
          </Row>
          <Row label={t('shell.set.colorblind')} desc={t('shell.set.colorblindDesc')}>
            <Toggle checked={s.colorblind} onChange={(v) => s.set({ colorblind: v })} />
          </Row>
          <div className="sh-set__swatches" aria-hidden="true">
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

        <Section icon="lock" title={t('shell.set.sec.data')}>
          <p className="sh-set__note">{t(accountUser ? 'account.set.storage' : 'shell.set.storage')}</p>
          <Row label={t('shell.set.resetCareer')} desc={t('shell.set.resetCareerDesc')}>
            <Button
              variant="secondary"
              icon="refresh"
              disabled={!hasCareer}
              onClick={() => setConfirm('career')}
            >
              {t('shell.set.reset')}
            </Button>
          </Row>
          <Row label={t('shell.set.clearAll')} desc={t('shell.set.clearAllDesc')}>
            <Button variant="danger" icon="close" onClick={() => setConfirm('all')}>
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
              icon="check"
              loading={clearing}
              onClick={() => {
                if (confirm === 'all') void doClearAll();
                else {
                  resetCareer();
                  setConfirm(null);
                  toast.show(t('shell.set.careerReset'), 'ok', 'check');
                }
              }}
            >
              {t('shell.set.confirm')}
            </Button>
          </>
        }
      >
        <p className="sh-set__confirm">
          {confirm === 'all' ? t('shell.set.clearAllConfirm') : t('shell.set.resetCareerConfirm')}
        </p>
        {confirm === 'all' && accountUser && <p className="sh-set__confirm">{t('account.set.clearAll')}</p>}
      </Modal>
    </ShellPage>
  );
}

function Section({
  icon,
  title,
  children,
  wide,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`sh-card sh-set__sec${wide ? ' is-wide' : ''}`}>
      <h2 className="sh-section-title">
        <Icon name={icon} size={14} /> {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, desc, children }: { label: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="sh-set__row">
      <div className="sh-set__text">
        <div className="sh-set__label">{label}</div>
        {desc && <div className="sh-set__desc">{desc}</div>}
      </div>
      <div className="sh-set__ctrl">{children}</div>
    </div>
  );
}
