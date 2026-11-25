// Juhtimiskeskuse saal (docs/MULTIPLAYER.md section 19): the stage of the multiplayer screen's 3D control room.
// On a wide screen it is the page's full-bleed background with the panels over it; on a narrow one a band on top.
// The room itself (three.js, src/lobby3d/room3d.ts) is a lazy chunk that loads when this mounts; until it has drawn,
// and wherever it cannot (no WebGL, a lost context, a chunk that did not arrive), the stage shows the duty map with
// the room's prefecture lit instead. Decoration only: aria-hidden, nothing to focus or click, and the panels say
// everything it shows. The data attributes tell the tests what it shows.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang, useT, useTx } from '@/i18n';
import type { RoomHandle, StageView } from '@/lobby3d/room3d';
import { describeScene, sceneWords, seatStates, type StageSource } from '@/lobby3d/scene';
import { useSettings } from '@/store/settings';
import { DutyMap, NO_DUTY } from './DutyMap';
import type { DutyInput } from './dutyMap';
import { STACKED, useMedia, useMinuteClock } from './ShellFrame';
import { hhmm } from '@/sim/time';

type RoomModule = typeof import('@/lobby3d/room3d');
let roomChunk: Promise<RoomModule> | null = null;

/** The room's chunk, fetched once per page; a failed fetch is forgotten so that the next opening asks again. */
function loadRoom(): Promise<RoomModule> {
  const p = (roomChunk ??= import('@/lobby3d/room3d'));
  p.catch(() => {
    if (roomChunk === p) roomChunk = null;
  });
  return p;
}

/** A phone or a tablet: the room is drawn at the screen's plain pixels, with smaller textures. */
const SMALL = '(max-width: 899px), (pointer: coarse)';
const REDUCED = '(prefers-reduced-motion: reduce)';
/** The most pixels a frame is drawn at: past it the pixel ratio is lowered (a 4K screen stays cheap). */
const MAX_PIXELS = 2_400_000;

/**
 * The part of the stage the room is composed for: the window the panels leave free (`.vk-mp__window`, in the
 * middle of the wide layout), or the whole stage when there is none (the band on a narrow screen). Measured as if
 * the page were scrolled to its top, so that scrolling the panels does not move the room.
 */
function measure(stage: HTMLElement): { w: number; h: number; view: StageView } {
  const box = stage.getBoundingClientRect();
  const w = Math.round(box.width);
  const h = Math.round(box.height);
  const whole = { w, h, view: { x: 0, y: 0, w, h } };
  const page = stage.closest('.vk-page');
  const win = page?.querySelector<HTMLElement>('.vk-mp__window');
  if (!page || !win || getComputedStyle(stage).position !== 'fixed') return whole;
  const r = win.getBoundingClientRect();
  if (r.width < 40) return whole;
  const x = Math.round(r.left - box.left);
  const y = Math.round(r.top + page.scrollTop - box.top);
  const foot = page.querySelector<HTMLElement>('.vk-foot')?.offsetHeight ?? 0;
  const vh = Math.max(120, h - y - foot - 16);
  return { w, h, view: { x, y, w: Math.round(r.width), h: vh } };
}

export function LobbyStage({ source }: { source: StageSource }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const stacked = useMedia(STACKED);
  const small = useMedia(SMALL);
  const reduced = useMedia(REDUCED);
  const still = useSettings((s) => s.reducedMotion) || reduced;
  // The wall clock is the top bar's: Tallinn time, as everywhere in the game, ticking on the minute.
  const now = useMinuteClock();
  const clock = source.kind !== 'standby' ? hhmm(now) : '';
  // `t` and `tx` follow the language.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scene = useMemo(() => describeScene(source, sceneWords(t, tx, clock)), [source, lang, clock]);

  const stageRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<RoomHandle | null>(null);
  /** loading: the chunk is on its way. 3d: the room draws. still: it cannot, the map shows instead. */
  const [mode, setMode] = useState<'loading' | '3d' | 'still'>('loading');
  const [drawn, setDrawn] = useState(false);
  /** The room is drawn by the processor (no graphics card): it stays still (RoomHandle.software). */
  const [software, setSoftware] = useState(false);
  const smallRef = useRef(small);
  smallRef.current = small;

  // The room: its chunk, a canvas of its own and the handle; all of it given back when the screen closes.
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    let alive = true;
    let room: RoomHandle | null = null;
    let canvas: HTMLCanvasElement | null = null;
    const close = () => {
      room?.dispose();
      room = null;
      roomRef.current = null;
      canvas?.remove();
      canvas = null;
    };
    const fail = () => {
      close();
      if (alive) setMode('still');
    };
    loadRoom()
      .then(async (m) => {
        if (!alive) return;
        if (!m.canRender()) return fail();
        canvas = document.createElement('canvas');
        canvas.className = 'vk-stage__canvas';
        holder.appendChild(canvas);
        const opened = await m.openRoom(canvas, {
          small: smallRef.current,
          onLost: fail,
          onFirstFrame: () => alive && setDrawn(true),
        });
        if (!alive) {
          opened.dispose();
          canvas?.remove();
          return;
        }
        room = opened;
        roomRef.current = opened;
        setSoftware(opened.software);
        setMode('3d');
      })
      .catch(fail);
    return () => {
      alive = false;
      close();
    };
  }, []);

  // What the room shows, and whether it moves.
  useEffect(() => {
    if (mode === '3d') roomRef.current?.show(scene);
  }, [mode, scene]);
  useEffect(() => {
    if (mode === '3d') roomRef.current?.setStill(still);
  }, [mode, still]);

  // Its size and the window it is composed for: whenever the stage, the panels' layout or the pixel ratio change.
  useEffect(() => {
    const stage = stageRef.current;
    if (mode !== '3d' || !stage) return;
    const fit = () => {
      const m = measure(stage);
      if (m.w < 2 || m.h < 2) return;
      const cap = smallRef.current ? 1 : 1.5;
      const ratio = Math.min(window.devicePixelRatio || 1, cap, Math.sqrt(MAX_PIXELS / (m.w * m.h)));
      roomRef.current?.resize(m.w, m.h, m.view, ratio);
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(stage);
    const main = stage.closest('.vk-page__main');
    if (main) ro?.observe(main);
    window.addEventListener('resize', fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', fit);
    };
    // The phase changes which panels there are, and so the window between them.
  }, [mode, stacked, small, scene.phase]);

  // Frames only while the stage is seen: the document shown and the stage on screen.
  useEffect(() => {
    const stage = stageRef.current;
    if (mode !== '3d' || !stage) return;
    let onScreen = true;
    const apply = () => roomRef.current?.setActive(onScreen && document.visibilityState !== 'hidden');
    const io =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            onScreen = entries.some((e) => e.isIntersecting);
            apply();
          })
        : null;
    io?.observe(stage);
    document.addEventListener('visibilitychange', apply);
    apply();
    return () => {
      io?.disconnect();
      document.removeEventListener('visibilitychange', apply);
    };
  }, [mode]);

  const regionId = scene.wall.map.regionId;
  const stillInput = useMemo<DutyInput>(
    () => (regionId ? { ...NO_DUTY, whole: [regionId], home: regionId } : NO_DUTY),
    [regionId],
  );

  return (
    <div
      ref={stageRef}
      className="vk-stage"
      aria-hidden="true"
      data-testid="lobby-stage"
      data-mode={mode}
      data-drawn={drawn && mode === '3d' ? 'true' : 'false'}
      data-still={still || software ? 'true' : 'false'}
      data-phase={scene.phase}
      data-room-mode={scene.mode ?? ''}
      data-seats={seatStates(scene)}
    >
      {mode === 'still' && (
        <div className="vk-stage__still">
          <DutyMap variant={stacked ? 'strip' : 'full'} input={stillInput} />
        </div>
      )}
      <div ref={holderRef} className="vk-stage__gl" />
    </div>
  );
}

/**
 * The window the room is composed for on a wide screen: an empty cell between the panels' columns. The stage reads
 * its place (`measure`); it holds nothing and takes no part in the keyboard's order.
 */
export function StageWindow() {
  return <div className="vk-mp__window" aria-hidden="true" />;
}
