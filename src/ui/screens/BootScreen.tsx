// Fake CAD workstation boot log → login. Skippable with any key / click. Owned by ui-shell.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/store/game';
import { useT } from '@/i18n';
import { sfx } from '@/audio/sfx';
import { Emblem } from '@/ui/components';
import { ddmmyyyy, hhmmss } from '@/sim/time';
import { VERSION } from './shell/helpers';
import { Backdrop } from './shell/Backdrop';
import './shell/shell.css';
import './shell/boot.css';

interface BootLine {
  key: string;
  status?: 'ok' | 'offline' | 'info';
  detail?: string;
}

const TOTAL_MS = 3000;

export function BootScreen() {
  const t = useT();
  const setScreen = useGame((s) => s.setScreen);
  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  const lines = useMemo<BootLine[]>(
    () => [
      { key: 'shell.boot.line.bios', status: 'info', detail: 'POST 0x00 · 4 × 27″' },
      { key: 'shell.boot.line.kernel', status: 'info' },
      { key: 'shell.boot.line.geo', status: 'ok', detail: '15 / 79' },
      { key: 'shell.boot.line.radio', status: 'ok', detail: 'TG 1201' },
      { key: 'shell.boot.line.pop', status: 'ok' },
      { key: 'shell.boot.line.traffic', status: 'ok' },
      { key: 'shell.boot.line.hk', status: 'ok', detail: '112' },
      { key: 'shell.boot.line.avl', status: 'ok' },
      { key: 'shell.boot.line.tiles', status: online ? 'ok' : 'offline' },
      { key: 'shell.boot.line.crypto', status: 'ok' },
      { key: 'shell.boot.line.ready', status: 'info' },
    ],
    [online],
  );
  const [shown, setShown] = useState(0);
  const [progress, setProgress] = useState(0);
  const done = useRef(false);
  const started = useRef(performance.now());

  const finish = () => {
    if (done.current) return;
    done.current = true;
    setScreen('login');
  };

  useEffect(() => {
    if (sfx.isUnlocked()) sfx.play('boot');
    const step = (TOTAL_MS - 500) / lines.length;
    // Timings are relative to the first mount so re-running the effect (Strict Mode / fast refresh) never restarts the log.
    const elapsed = performance.now() - started.current;
    const timers = lines.map((_, i) =>
      setTimeout(() => setShown((s) => Math.max(s, i + 1)), Math.max(0, 120 + i * step - elapsed)),
    );
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - started.current) / TOTAL_MS);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const end = setTimeout(finish, Math.max(0, TOTAL_MS + 250 - elapsed));
    const skip = (e: Event) => {
      if (
        e instanceof KeyboardEvent &&
        (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta')
      )
        return;
      finish();
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(end);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  const now = Date.now();
  return (
    <div className="sh-screen sh-boot" role="status" aria-live="polite" aria-label={t('shell.boot.aria')}>
      <Backdrop variant="grid" map={false} />
      <div className="sh-boot__frame">
        <div className="sh-boot__brand">
          <Emblem size={84} />
          <div>
            <div className="sh-boot__title">EPD-CAD</div>
            <div className="sh-boot__sub">{t('shell.boot.subtitle')}</div>
            <div className="sh-boot__meta mono">
              v{VERSION} · {ddmmyyyy(now)} {hhmmss(now)} · Europe/Tallinn
            </div>
          </div>
        </div>
        <ol className="sh-boot__log mono">
          {lines.slice(0, shown).map((l, i) => (
            <li key={l.key} className="sh-boot__line">
              <span className="sh-boot__ts">[{(0.12 + i * 0.26).toFixed(3).padStart(7, ' ')}]</span>
              <span className="sh-boot__text">
                {t(l.key, { v: VERSION })}
                {l.detail && <span className="sh-boot__detail"> {l.detail}</span>}
              </span>
              {l.status === 'ok' && (
                <span className="sh-boot__st sh-boot__st--ok">[ {t('shell.boot.ok')} ]</span>
              )}
              {l.status === 'offline' && (
                <span className="sh-boot__st sh-boot__st--off" title={t('shell.boot.offlineNote')}>
                  [ {t('shell.boot.offline')} ]
                </span>
              )}
            </li>
          ))}
          {shown < lines.length && <li className="sh-boot__cursor">▍</li>}
        </ol>
        <div
          className="sh-boot__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="sh-boot__fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="sh-boot__foot">
          <span className="mono">{Math.round(progress * 100)}%</span>
          <span className="sh-boot__skip">{t('shell.boot.skip')}</span>
        </div>
      </div>
    </div>
  );
}
