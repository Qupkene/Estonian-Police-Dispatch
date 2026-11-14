// Kaamerad (docs/CCTV.md section 14): the surveillance camera's live picture, a small window over the map.
// Everything heavy (three.js, the renderer, the body model, the director) is in the camera chunk (src/cctv/live.ts),
// loaded the first time a camera is opened. The window has its own error boundary: a WebGL or chunk failure shows a
// "try again" in the picture and never takes the shift down.
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import { shiftKeyOf, SPEEDS, useGame } from '@/store/game';
import { useT } from '@/i18n';
import { Icon } from '@/ui/components';
import { cameraOf, type CameraInfo } from '@/cctv/coverage';
import type { CameraHandle } from '@/cctv/live';
import { effectiveSpeed } from '@/sim/coop';
import { VERSION } from '@/ui/screens/shell/helpers';
import { useGameUi } from './uiStore';

export type CameraState = 'connecting' | 'live' | 'unavailable' | 'failed' | 'ended';

/** Frames per second of the picture: a street camera's, and cheap enough for a phone. */
const FPS = 12;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
/** Where the window keeps clear of the map area's edges (px). */
const EDGE = 8;

const mobile = () => window.matchMedia('(max-width: 899px)').matches;
const clampN = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** The open camera, or nothing. One at a time; a new shift or another incident's camera starts a new window. */
export function CameraWindow() {
  const cam = useGameUi((s) => s.camera);
  const shift = useGame((s) => (s.sim ? shiftKeyOf(s.sim) : ''));
  if (!cam || !shift) return null;
  return <CameraBoundary key={`${shift}:${cam.incidentId}`} incidentId={cam.incidentId} byKey={!!cam.byKey} />;
}

interface BoundaryProps {
  incidentId: string;
  byKey: boolean;
}

/** Catches whatever the camera throws while drawing; its "try again" starts the window afresh. */
class CameraBoundary extends Component<BoundaryProps, { failed: boolean; round: number }> {
  state = { failed: false, round: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[EPD] camera window failed', error, info.componentStack);
  }
  retry = () => this.setState((s) => ({ failed: false, round: s.round + 1 }));
  render(): ReactNode {
    const { incidentId, byKey } = this.props;
    if (this.state.failed) return <CameraFrame incidentId={incidentId} byKey={false} crashed onRetry={this.retry} />;
    return <CameraFrame key={this.state.round} incidentId={incidentId} byKey={byKey} />;
  }
}

/** The camera that sees the incident, as it was when the window opened (the name stays while the feed ends). */
function useCameraInfo(incidentId: string): CameraInfo | null {
  const [info] = useState<CameraInfo | null>(() => {
    const inc = useGame.getState().sim?.incidents[incidentId];
    return inc ? cameraOf(inc) : null;
  });
  return info;
}

interface FrameProps {
  incidentId: string;
  byKey: boolean;
  /** The boundary caught an error: show "loading failed" and nothing else. */
  crashed?: boolean;
  onRetry?: () => void;
}

function CameraFrame({ incidentId, byKey, crashed, onRetry }: FrameProps) {
  const t = useT();
  const info = useCameraInfo(incidentId);
  const winRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<CameraHandle | null>(null);
  const [state, setState] = useState<CameraState>(crashed ? 'failed' : 'connecting');
  const [phase, setPhase] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [large, setLarge] = useState(false);
  const [zoom, setZoom] = useState(1);
  const pan = useRef<[number, number]>([0, 0]);
  /** Where the window was dragged to, from the map area's top left corner; null while it sits in its corner. */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const focusInside = useRef(byKey);

  const close = useCallback(() => useGameUi.getState().set({ camera: null }), []);

  // Opened from the keyboard: the close button takes the focus. Closing gives it back to the card's camera button
  // when it was in the window (never taken from a text field: the hotkey does not fire while typing).
  useLayoutEffect(() => {
    if (byKey) closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (!focusInside.current) return;
      const active = document.activeElement;
      if (active && active !== document.body && document.contains(active) && !winRef.current?.contains(active)) return;
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-camera-toggle="${CSS.escape(incidentId)}"]`)?.focus({ preventScroll: true }));
    };
  }, [byKey, incidentId]);

  // Load the camera chunk and open the camera on the canvas; dispose of everything when the window goes.
  useEffect(() => {
    if (crashed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ac = new AbortController();
    let handle: CameraHandle | null = null;
    setState('connecting');
    setPhase('');
    import('@/cctv/live')
      .then((m) => {
        const sim = useGame.getState().sim;
        const incident = sim?.incidents[incidentId];
        if (ac.signal.aborted) return undefined;
        if (!sim || !incident || !info) {
          setState('ended');
          return undefined;
        }
        return m.openCamera(canvas, { sim, incident, camera: info, version: VERSION, signal: ac.signal });
      })
      .then((h) => {
        if (h === undefined) return;
        if (ac.signal.aborted) {
          h?.dispose();
          return;
        }
        if (!h) {
          setState('unavailable');
          return;
        }
        handle = h;
        handleRef.current = h;
        setState('live');
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        console.error('[EPD] camera did not open', e);
        setState('failed');
      });
    return () => {
      ac.abort();
      handle?.dispose();
      handleRef.current = null;
    };
  }, [incidentId, attempt, crashed, info]);

  // The picture's own loop, FPS frames a second, reading the stores directly (no React state per frame). Nothing is
  // done while the tab is hidden, the window is not shown (the phone's other tabs) or the game stands still.
  useEffect(() => {
    if (state !== 'live') return;
    let raf = 0;
    let last = performance.now();
    let drawn = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const h = handleRef.current;
      if (!h) return;
      const dt = (now - last) / 1000;
      if (dt < 1 / FPS - 0.004) return;
      last = now;
      if (document.hidden || !winRef.current || winRef.current.offsetParent === null) return;
      const g = useGame.getState();
      const sim = g.sim;
      if (!sim) return;
      const paused = g.speedIndex === 0;
      if (paused && drawn) return;
      h.update(sim, effectiveSpeed(sim, g.realtime ? 1 : SPEEDS[g.speedIndex]), paused, dt);
      drawn = true;
      if (h.dead) setState('failed');
      else if (h.state === 'ended') setState('ended');
      setPhase(h.phase);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  // The window stays inside the map area when that changes size (a panel opens, the browser is resized).
  useEffect(() => {
    const map = winRef.current?.parentElement?.querySelector<HTMLElement>('.gm-map');
    if (!map || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setPos((p) => (p ? clampPos(p, map, winRef.current) : p)));
    ro.observe(map);
    return () => ro.disconnect();
  }, []);

  const applyView = useCallback((z: number) => {
    const room = (1 - 1 / z) / 2;
    pan.current = [clampN(pan.current[0], -room, room), clampN(pan.current[1], -room, room)];
    setZoom(z);
    handleRef.current?.view(z, pan.current[0], pan.current[1]);
  }, []);

  // ── Dragging the window by its title bar ──
  const onTitleDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || mobile() || (e.target as HTMLElement).closest('button')) return;
    const win = winRef.current;
    const map = win?.parentElement?.querySelector<HTMLElement>('.gm-map');
    if (!win || !map) return;
    const m = map.getBoundingClientRect();
    const w = win.getBoundingClientRect();
    const dx = e.clientX - w.left;
    const dy = e.clientY - w.top;
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setPos(clampPos({ x: ev.clientX - m.left - dx, y: ev.clientY - m.top - dy }, map, win));
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  };

  // ── Zoom and pan in the picture, as an operator has them ──
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (state !== 'live') return;
    applyView(clampN(zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM));
  };
  const onPictureDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || zoom <= 1 || state !== 'live') return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    let px = e.clientX;
    let py = e.clientY;
    const move = (ev: PointerEvent) => {
      pan.current = [pan.current[0] - (ev.clientX - px) / r.width / zoom, pan.current[1] + (ev.clientY - py) / r.height / zoom];
      px = ev.clientX;
      py = ev.clientY;
      applyView(zoom);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const resetView = () => {
    pan.current = [0, 0];
    applyView(1);
  };

  // The wheel must not scroll or zoom the map under the window: a passive React listener cannot stop it.
  const pictureRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pictureRef.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  const name = info?.name ?? t('game.cam.title');
  const style = pos && !mobile() ? { left: pos.x, top: pos.y, right: 'auto' } : undefined;
  const live = state === 'live';
  const paused = useGame((s) => s.speedIndex === 0);

  return (
    <section
      ref={winRef}
      className={`gm-cam${large ? ' is-large' : ''}${pos ? ' is-moved' : ''}`}
      style={style}
      role="dialog"
      aria-modal="false"
      aria-label={t('game.cam.window', { name })}
      data-testid="camera-window"
      data-state={state}
      data-phase={phase}
      onFocus={() => (focusInside.current = true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focusInside.current = false;
      }}
      onKeyDown={(e) => {
        // Escape in the window closes it (the game's own Escape does the same from anywhere else).
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <header className="gm-cam__bar" onPointerDown={onTitleDown} title={mobile() ? undefined : t('game.cam.drag')}>
        <i className={`gm-cam__lamp is-${live ? (paused ? 'paused' : 'live') : state}`} aria-hidden="true" />
        <Icon name="cctv" size={14} />
        <span className="gm-cam__name mono">{name}</span>
        {live && <span className={`gm-cam__tag${paused ? ' is-paused' : ''}`}>{paused ? t('game.cam.paused') : t('game.cam.live')}</span>}
        <span className="gm-cam__tools">
          <button type="button" className="gm-cam__btn gm-cam__btn--zoom" onClick={() => applyView(clampN(zoom / 1.5, MIN_ZOOM, MAX_ZOOM))} disabled={!live || zoom <= MIN_ZOOM} aria-label={t('game.cam.zoomOut')} title={t('game.cam.zoomOut')}>
            <Icon name="minus" size={13} />
          </button>
          <button type="button" className="gm-cam__btn gm-cam__btn--zoom" onClick={() => applyView(clampN(zoom * 1.5, MIN_ZOOM, MAX_ZOOM))} disabled={!live || zoom >= MAX_ZOOM} aria-label={t('game.cam.zoomIn')} title={t('game.cam.zoomIn')}>
            <Icon name="plus" size={13} />
          </button>
          <button
            type="button"
            className="gm-cam__btn gm-cam__btn--size"
            onClick={() => setLarge((v) => !v)}
            aria-pressed={large}
            aria-label={large ? t('game.cam.smaller') : t('game.cam.bigger')}
            title={large ? t('game.cam.smaller') : t('game.cam.bigger')}
            data-testid="camera-size"
          >
            <Icon name={large ? 'chevron-down' : 'fast'} size={13} />
          </button>
          <button ref={closeRef} type="button" className="gm-cam__btn" onClick={close} aria-label={t('game.cam.close')} title={`${t('game.cam.close')} (Esc)`} data-testid="camera-close">
            <Icon name="close" size={13} />
          </button>
        </span>
      </header>
      <div
        ref={pictureRef}
        className={`gm-cam__picture${zoom > 1 ? ' is-zoomed' : ''}`}
        onWheel={onWheel}
        onPointerDown={onPictureDown}
        onDoubleClick={resetView}
        title={live ? t('game.cam.zoomHint') : undefined}
      >
        <canvas
          key={attempt}
          ref={canvasRef}
          className="gm-cam__canvas"
          width={640}
          height={360}
          role="img"
          aria-label={t('game.cam.picture', { name })}
          hidden={!live}
        />
        {live && zoom > 1 && <span className="gm-cam__zoom mono">{zoom.toFixed(1)}×</span>}
        {!live && <CameraNote state={state} onRetry={crashed ? onRetry : () => setAttempt((n) => n + 1)} />}
      </div>
    </section>
  );
}

/** The text in the picture area while there is no picture. */
function CameraNote({ state, onRetry }: { state: CameraState; onRetry?: () => void }) {
  const t = useT();
  const title = state === 'connecting' ? t('game.cam.connecting') : state === 'unavailable' ? t('game.cam.unavailable') : state === 'ended' ? t('game.cam.ended') : t('game.cam.failed');
  const hint = state === 'unavailable' ? t('game.cam.unavailableHint') : state === 'ended' ? t('game.cam.endedHint') : state === 'failed' ? t('game.cam.failedHint') : null;
  return (
    <div className={`gm-cam__note is-${state}`} role="status">
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
      {state === 'failed' && onRetry && (
        <button type="button" className="gm-cam__retry" onClick={onRetry} data-testid="camera-retry">
          <Icon name="route" size={13} />
          {t('game.cam.retry')}
        </button>
      )}
    </div>
  );
}

/** A dragged position kept inside the map area. */
function clampPos(p: { x: number; y: number }, map: HTMLElement, win: HTMLElement | null): { x: number; y: number } {
  const w = win?.offsetWidth ?? 0;
  const h = win?.offsetHeight ?? 0;
  return {
    x: clampN(p.x, EDGE, Math.max(EDGE, map.clientWidth - w - EDGE)),
    y: clampN(p.y, EDGE, Math.max(EDGE, map.clientHeight - h - EDGE)),
  };
}
