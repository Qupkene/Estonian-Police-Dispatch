// Pause menu and end-of-shift dialog.
import { useEffect, useRef, useState } from 'react';
import { autosave, useGame } from '@/store/game';
import { useSettings, type MapStyleKey } from '@/store/settings';
import { useT } from '@/i18n';
import { Button, Kbd, Modal, Select, Slider } from '@/ui/components';
import { hhmm } from '@/sim/time';
import type { Lang } from '@/sim/types';
import { selQueue, soft } from './data';
import { useGameUi } from './uiStore';

function finishShift(): boolean {
  try {
    return !!useGame.getState().endShift();
  } catch (err) {
    console.error('[EPD game] endShift failed', err);
    useGameUi.getState().pushToast({ kind: 'error', title: 'game.end.failed', text: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

const KEYS: [string, string][] = [
  ['Space', 'game.key.space'],
  ['1 – 4', 'game.key.speeds'],
  ['5', 'game.key.realtime'],
  ['A', 'game.key.ack'],
  ['D', 'game.key.dispatch'],
  ['↑ ↓ Enter', 'game.key.nav'],
  ['F2', 'game.key.queue'],
  ['F3', 'game.key.registry'],
  ['F4', 'game.key.units'],
  ['F6', 'game.key.radio'],
  ['H', 'game.key.hud'],
  ['Esc', 'game.key.esc'],
];

export function PauseMenu() {
  const t = useT();
  const open = useGameUi((s) => s.pauseOpen);
  const setUi = useGameUi((s) => s.set);
  const mode = useGame((s) => s.sim?.mode);
  const volume = useSettings((s) => s.volume);
  const mapStyle = useSettings((s) => s.mapStyle);
  const lang = useSettings((s) => s.lang);
  const setSettings = useSettings((s) => s.set);
  const [confirm, setConfirm] = useState(false);
  const pausedByMenu = useRef(false);

  // Opening the menu pauses the game; closing restores the previous speed.
  useEffect(() => {
    const g = useGame.getState();
    if (open) {
      setConfirm(false);
      if (g.speedIndex > 0 && g.sim) {
        g.togglePause();
        pausedByMenu.current = true;
      }
    } else if (pausedByMenu.current) {
      pausedByMenu.current = false;
      if (g.sim && g.speedIndex === 0) g.togglePause();
    }
  }, [open]);

  const close = () => setUi({ pauseOpen: false });
  const director = mode === 'director';

  return (
    <Modal open={open} onClose={close} title={t('game.pause.title')} width={620}>
      <div className="gm-pause">
        <Button variant="primary" size="lg" block icon="play" onClick={close}>
          {t('game.pause.resume')}
        </Button>

        <div className="gm-pause__grid">
          <section>
            <h3>{t('game.pause.quick')}</h3>
            <Slider label={`${t('game.pause.volume')} · ${Math.round(volume * 100)}%`} value={volume} onChange={(v) => setSettings({ volume: v })} />
            <Select<MapStyleKey>
              label={t('game.pause.mapStyle')}
              value={mapStyle}
              onChange={(v) => setSettings({ mapStyle: v })}
              options={(['tactical', 'dark', 'maaamet', 'foto'] as MapStyleKey[]).map((k) => ({ value: k, label: t(`game.map.${k}`) }))}
            />
            <Select<Lang>
              label={t('game.pause.lang')}
              value={lang}
              onChange={(v) => setSettings({ lang: v })}
              options={[
                { value: 'et', label: t('game.lang.et') },
                { value: 'en', label: t('game.lang.en') },
              ]}
            />
          </section>
          <section>
            <h3>{t('game.pause.keys')}</h3>
            <dl className="gm-keys">
              {KEYS.filter(([, k]) => director || (k !== 'game.key.realtime' && k !== 'game.key.hud')).map(([key, label]) => (
                <div key={label}>
                  <dt>
                    <Kbd>{key}</Kbd>
                  </dt>
                  <dd>{t(label)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {confirm ? (
          <div className="gm-pause__confirm" role="alert">
            <p>{t('game.pause.confirmEnd')}</p>
            <div>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                {t('game.cancel')}
              </Button>
              <Button
                variant="danger"
                icon="flag"
                onClick={() => {
                  if (finishShift()) setUi({ pauseOpen: false });
                }}
              >
                {t('game.pause.confirmYes')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="gm-pause__foot">
            <Button
              icon="logout"
              onClick={() => {
                const g = useGame.getState();
                if (g.sim && !director) autosave(g.sim);
                pausedByMenu.current = false;
                setUi({ pauseOpen: false });
                g.quitShift();
              }}
            >
              {director ? t('game.pause.quit') : t('game.pause.saveQuit')}
            </Button>
            <Button variant="danger" icon="flag" onClick={() => setConfirm(true)}>
              {t('game.pause.endShift')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function ShiftEndModal() {
  const t = useT();
  const ended = useGame((s) => !!s.sim?.ended);
  const [dismissed, setDismissed] = useState(false);
  const sim = useGame.getState().sim;
  if (!ended || dismissed || !sim) return null;
  const st = sim.stats;
  const open = soft('endQueue', () => selQueue(sim).length, 0);
  return (
    <Modal open onClose={() => setDismissed(true)} title={t('game.end.title')} width={480}>
      <div className="gm-end">
        <p>{t('game.end.text', { time: hhmm(sim.endTime) })}</p>
        <div className="gm-end__stats">
          <div>
            <b className="mono">{st?.incidents ?? 0}</b>
            <span>{t('game.end.incidents')}</span>
          </div>
          <div>
            <b className="mono">{st?.closed ?? 0}</b>
            <span>{t('game.end.closed')}</span>
          </div>
          <div>
            <b className="mono">{st?.arrests ?? 0}</b>
            <span>{t('game.end.arrests')}</span>
          </div>
          <div className={open ? 'is-warn' : ''}>
            <b className="mono">{open}</b>
            <span>{t('game.end.open')}</span>
          </div>
        </div>
        <Button variant="primary" size="lg" block icon="newspaper" onClick={() => finishShift()}>
          {t('game.end.report')}
        </Button>
      </div>
    </Modal>
  );
}
