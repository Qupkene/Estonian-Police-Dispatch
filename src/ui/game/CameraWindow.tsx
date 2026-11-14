// Kaamerad (docs/CCTV.md section 14): the surveillance camera's live picture, a small window over the map.
// Everything heavy (three.js, the renderer, the body model, the director) is in the camera chunk (src/cctv/live.ts),
// loaded the first time a camera is opened. Whatever the camera throws, while loading, while drawing or from the
// zoom, ends in the window's own "failed" note with a retry that can work, and never takes the shift down.
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import { saveNow, shiftKeyOf, SPEEDS, useGame } from '@/store/game';
import { useT } from '@/i18n';
import { Icon } from '@/ui/components';
import { cameraOf, type CameraInfo } from '@/cctv/coverage';
import type { CameraHandle } from '@/cctv/live';
import { isChunkError } from '@/app/AppBoundary';
import { effectiveSpeed } from '@/sim/coop';
import type { LngLat } from '@/sim/types';
import { VERSION } from '@/ui/screens/shell/helpers';
import { useGameUi } from './uiStore';

/** `reload`: the camera chunk could not be fetched; only a reload of the page can fetch it again. */
export type CameraState = 'connecting' | 'live' | 'unavailable' | 'failed' | 'reload' | 'ended';

/** Frames per second of the picture: a street camera's, and cheap enough for a phone. */
const FPS = 12;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
/** Where the window keeps clear of the map area's edges (px). */
const EDGE = 8;
/** The window's widths (px): small, large, and the least it is ever squeezed to. */
const SMALL_W = 448;
const LARGE_W = 640;
const MIN_W = 240;
/** Room kept on the right of a window in its corner: the map's tools. */
const TOOLS_W = 60;
/** From the click to the picture at most this long; then the open is given up and a retry offered. */
export const CONNECT_DEADLINE_MS = 20_000;
/** How often the window checks whether the 112 card has opened under it (ms). */
const FIT_EVERY_MS = 400;

const mobile = () => window.matchMedia('(max-width: 899px)').matches;
const clampN = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** The answered 112 card at the bottom of the map (not while it rings or is folded away). */
const CALL_CARD = '.tl-call:not(.is-ringing):not(.is-collapsed)';

type LiveModule = typeof import('@/cctv/live');
let liveChunk: Promise<LiveModule> | null = null;

/** The camera chunk, fetched once per page; a failed or given-up fetch is forgotten so the next open asks again. */
function loadLive(): Promise<LiveModule> {
  const p = (liveChunk ??= import('@/cctv/live'));
  p.catch(() => {
    if (liveChunk === p) liveChunk = null;
  });
  return p;
}

/**
 * Where to centre the map so that `coord` shows in the part of the map the open camera window leaves free, at
 * `zoom` (the game's selection and the window's own open pass one). Unchanged on a phone, where the window is
 * docked above the map, and when no window is open.
 */
export function clearOfCamera(coord: LngLat, zoom: number): LngLat {
  if (typeof document === 'undefined' || mobile()) return coord;
  const win = document.querySelector<HTMLElement>('.gm-cam');
  const map = document.querySelector<HTMLElement>('.gm-map');
  if (!win || !map) return coord;
  const m = map.getBoundingClientRect();
  const r = win.getBoundingClientRect();
  if (!m.width || !m.height) return coord;
  // The largest strip of the map beside the window, and its middle.
  const strips = [
    { w: r.left - m.left, h: m.height, x: (r.left - m.left) / 2, y: m.height / 2 },
    { w: m.right - r.right, h: m.height, x: (r.right - m.left + m.width) / 2, y: m.height / 2 },
    { w: m.width, h: r.top - m.top, x: m.width / 2, y: (r.top - m.top) / 2 },
    { w: m.width, h: m.bottom - r.bottom, x: m.width / 2, y: (r.bottom - m.top + m.height) / 2 },
  ];
  const best = strips.reduce((a, b) => (Math.max(0, b.w) * Math.max(0, b.h) > Math.max(0, a.w) * Math.max(0, a.h) ? b : a));
  const dx = best.x - m.width / 2;
  const dy = best.y - m.height / 2;
  // Web Mercator with the map's 512 px tiles: the centre lies (dx, dy) pixels the other way from the point.
  const world = 512 * 2 ** zoom;
  const lat = (coord[1] * Math.PI) / 180;
  const x = ((coord[0] + 180) / 360) * world - dx;
  const y = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * world - dy;
  const lng = (x / world) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / world;
  return [lng, (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))];
}

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

/** Catches what the camera throws while React renders it; its "try again" starts the window afresh. */
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

/** The camera that sees the incident, and the incident's number, as they were when the window opened. */
function useCameraInfo(incidentId: string): { info: CameraInfo | null; number: string } {
  const [v] = useState(() => {
    const inc = useGame.getState().sim?.incidents[incidentId];
    return { info: inc ? cameraOf(inc) : null, number: inc?.number ?? '' };
  });
  return v;
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
  const { info, number } = useCameraInfo(incidentId);
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
  /** The width the map area leaves the window (px; null on a phone, where it is docked at full width). */
  const [fitW, setFitW] = useState<number | null>(null);
  const focusInside = useRef(byKey);

  const close = useCallback(() => useGameUi.getState().set({ camera: null }), []);

  /** The open camera threw or lost its picture: let its graphics go and offer the retry. */
  const fail = useCallback((e?: unknown) => {
    if (e !== undefined) console.error('[EPD] camera failed', e);
    handleRef.current?.dispose();
    handleRef.current = null;
    setState('failed');
  }, []);

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

  // Load the camera chunk and open the camera on the canvas, within the deadline; dispose of everything when the
  // window goes.
  useEffect(() => {
    if (crashed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ac = new AbortController();
    let handle: CameraHandle | null = null;
    let done = false;
    setState('connecting');
    setPhase('');
    const deadline = window.setTimeout(() => {
      if (done) return;
      done = true;
      ac.abort();
      console.error('[EPD] camera did not open in time');
      setState('failed');
    }, CONNECT_DEADLINE_MS);
    loadLive()
      .catch((e: unknown) => {
        if (done || ac.signal.aborted) return undefined;
        done = true;
        console.error('[EPD] camera chunk did not load', e);
        setState(isChunkError(e) ? 'reload' : 'failed');
        return undefined;
      })
      .then((m) => {
        if (!m || done || ac.signal.aborted) return undefined;
        const sim = useGame.getState().sim;
        const incident = sim?.incidents[incidentId];
        if (!sim || !incident || !info) {
          done = true;
          setState('ended');
          return undefined;
        }
        return m.openCamera(canvas, { sim, incident, camera: info, version: VERSION, signal: ac.signal });
      })
      .then((h) => {
        if (h === undefined) return;
        if (done || ac.signal.aborted) {
          h?.dispose();
          return;
        }
        done = true;
        if (!h) {
          setState('unavailable');
          return;
        }
        handle = h;
        handleRef.current = h;
        setState('live');
      })
      .catch((e: unknown) => {
        if (done || ac.signal.aborted) return;
        done = true;
        console.error('[EPD] camera did not open', e);
        setState('failed');
      })
      .finally(() => window.clearTimeout(deadline));
    return () => {
      window.clearTimeout(deadline);
      ac.abort();
      handle?.dispose();
      handleRef.current = null;
    };
  }, [incidentId, attempt, crashed, info]);

  // The picture's own loop, FPS frames a second, reading the stores directly (no React state per frame). Nothing is
  // done while the tab is hidden, the window is not shown (the phone's other tabs) or the game stands still. The
  // feed ending or the picture failing lets the graphics go at once, not only when the window closes.
  useEffect(() => {
    if (state !== 'live') return;
    let raf = 0;
    let last = performance.now();
    let drawn = false;
    const loop = (now: number) => {
      const h = handleRef.current;
      if (!h) return;
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000;
      if (dt < 1 / FPS - 0.004) return;
      last = now;
      const win = winRef.current;
      if (document.hidden || !win || win.offsetParent === null) return;
      const g = useGame.getState();
      const sim = g.sim;
      if (!sim) return;
      const paused = g.speedIndex === 0;
      if (paused && drawn) return;
      try {
        h.update(sim, effectiveSpeed(sim, g.realtime ? 1 : SPEEDS[g.speedIndex]), paused, dt);
      } catch (e) {
        cancelAnimationFrame(raf);
        fail(e);
        return;
      }
      drawn = true;
      // For the tests: what the last frame held (attributes only change when the numbers do).
      if (win.dataset.people !== String(h.people)) win.dataset.people = String(h.people);
      if (win.dataset.cars !== String(h.cars)) win.dataset.cars = String(h.cars);
      setPhase(h.phase);
      if (h.dead) {
        cancelAnimationFrame(raf);
        fail();
      } else if (h.state === 'ended') {
        cancelAnimationFrame(raf);
        h.dispose();
        handleRef.current = null;
        setState('ended');
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, fail]);

  // ── The window's size and place: inside the map area, above the answered 112 card, out of the map's tools ──
  const refit = useCallback(() => {
    const win = winRef.current;
    const map = win?.parentElement?.querySelector<HTMLElement>('.gm-map');
    const root = win?.closest<HTMLElement>('.gm');
    if (!win || !map) return;
    if (mobile()) {
      // Docked above the map: the map's tools move down below it.
      root?.style.setProperty('--gm-cam-h', `${win.offsetHeight}px`);
      setFitW(null);
      return;
    }
    root?.style.removeProperty('--gm-cam-h');
    const m = map.getBoundingClientRect();
    const r = win.getBoundingClientRect();
    const bar = win.firstElementChild instanceof HTMLElement ? win.firstElementChild.offsetHeight + 2 : 36;
    const moved = win.classList.contains('is-moved');
    // The answered 112 card stays on top: the window fits in the map above it.
    const call = document.querySelector<HTMLElement>(CALL_CARD);
    const floor = call ? Math.min(m.bottom, call.getBoundingClientRect().top) : m.bottom;
    const top = moved ? m.top + EDGE : r.top;
    const byHeight = ((floor - top - EDGE - bar) * 16) / 9;
    const byWidth = m.width - (moved ? 2 * EDGE : TOOLS_W + 2 * EDGE);
    const w = Math.round(Math.max(MIN_W, Math.min(large ? LARGE_W : SMALL_W, byWidth, byHeight)));
    setFitW((old) => (old === w ? old : w));
    setPos((p) => (p ? clampPos(p, map, win, floor - m.top) : p));
  }, [large]);

  useLayoutEffect(() => {
    refit();
  }, [refit, pos === null, state]);

  useEffect(() => {
    const win = winRef.current;
    const map = win?.parentElement?.querySelector<HTMLElement>('.gm-map');
    const root = win?.closest<HTMLElement>('.gm');
    if (!win || !map) return;
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => refit());
    ro?.observe(map);
    ro?.observe(win);
    const timer = window.setInterval(refit, FIT_EVERY_MS);
    return () => {
      ro?.disconnect();
      window.clearInterval(timer);
      root?.style.removeProperty('--gm-cam-h');
    };
  }, [refit]);

  // On open, the map eases so that the incident shows beside the window, not under it (GameScreen MapHost moves
  // every focus while a window is open, see clearOfCamera).
  useEffect(() => {
    if (mobile()) return;
    const g = useGame.getState();
    const inc = g.sim?.incidents[incidentId];
    if (inc) g.focusMap(inc.location.coord, g.mapFocus?.zoom ?? 14);
  }, [incidentId, large]);

  const applyView = useCallback(
    (z: number) => {
      const room = (1 - 1 / z) / 2;
      pan.current = [clampN(pan.current[0], -room, room), clampN(pan.current[1], -room, room)];
      setZoom(z);
      try {
        handleRef.current?.view(z, pan.current[0], pan.current[1]);
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

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
    const call = document.querySelector<HTMLElement>(CALL_CARD);
    const floor = (call ? Math.min(m.bottom, call.getBoundingClientRect().top) : m.bottom) - m.top;
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setPos(clampPos({ x: ev.clientX - m.left - dx, y: ev.clientY - m.top - dy }, map, win, floor));
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
  const phone = fitW === null;
  const style = phone ? undefined : { width: fitW, ...(pos ? { left: pos.x, top: pos.y, right: 'auto' } : {}) };
  const live = state === 'live';
  const paused = useGame((s) => s.speedIndex === 0);
  const retry = crashed ? onRetry : () => setAttempt((n) => n + 1);

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
      <header className="gm-cam__bar" onPointerDown={onTitleDown} title={phone ? undefined : t('game.cam.drag')}>
        <i className={`gm-cam__lamp is-${live ? (paused ? 'paused' : 'live') : state}`} aria-hidden="true" />
        <Icon name="cctv" size={14} />
        <span className="gm-cam__name mono">
          {/* The camera's code stays whole; its place name gives way when the bar is narrow. */}
          {info && name.startsWith(info.id) ? (
            <>
              <span className="gm-cam__code">{info.id}</span>
              <span className="gm-cam__label">&nbsp;{name.slice(info.id.length).trimStart()}</span>
            </>
          ) : (
            <span className="gm-cam__label">{name}</span>
          )}
          {/* Two incidents can share one camera: the number says whose story the picture tells. */}
          {number && <span className="gm-cam__case">&nbsp;· {number}</span>}
        </span>
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
            <Icon name={large ? 'shrink' : 'expand'} size={13} />
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
        {!live && <CameraNote state={state} onRetry={retry} />}
      </div>
    </section>
  );
}

/** Save the running shift, then load the page again (a camera chunk that failed to fetch is fetched anew). */
function saveAndReload() {
  saveNow();
  window.location.reload();
}

/** The text in the picture area while there is no picture. */
function CameraNote({ state, onRetry }: { state: CameraState; onRetry?: () => void }) {
  const t = useT();
  const offline = state === 'reload' && navigator.onLine === false;
  const title =
    state === 'connecting'
      ? t('game.cam.connecting')
      : state === 'unavailable'
        ? t('game.cam.unavailable')
        : state === 'ended'
          ? t('game.cam.ended')
          : state === 'reload'
            ? offline
              ? t('game.cam.offline')
              : t('game.cam.stale')
            : t('game.cam.failed');
  const hint =
    state === 'unavailable'
      ? t('game.cam.unavailableHint')
      : state === 'ended'
        ? t('game.cam.endedHint')
        : state === 'failed'
          ? t('game.cam.failedHint')
          : state === 'reload'
            ? offline
              ? t('game.cam.offlineHint')
              : t('game.cam.staleHint')
            : null;
  return (
    <div className={`gm-cam__note is-${state}`} role="status">
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
      {state === 'failed' && onRetry && (
        <button type="button" className="gm-cam__retry" onClick={onRetry} data-testid="camera-retry">
          <Icon name="refresh" size={13} />
          {t('game.cam.retry')}
        </button>
      )}
      {state === 'reload' && (
        <button type="button" className="gm-cam__retry" onClick={saveAndReload} data-testid="camera-reload">
          <Icon name="refresh" size={13} />
          {t('game.cam.reload')}
        </button>
      )}
    </div>
  );
}

/** A dragged position kept inside the map area, above `floor` (px from the map's top). */
function clampPos(p: { x: number; y: number }, map: HTMLElement, win: HTMLElement | null, floor = map.clientHeight): { x: number; y: number } {
  const w = win?.offsetWidth ?? 0;
  const h = win?.offsetHeight ?? 0;
  const x = clampN(p.x, EDGE, Math.max(EDGE, map.clientWidth - w - EDGE));
  const y = clampN(p.y, EDGE, Math.max(EDGE, Math.min(map.clientHeight, floor) - h - EDGE));
  return x === p.x && y === p.y ? p : { x, y };
}
