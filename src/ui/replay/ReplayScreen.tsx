// Kordus (2.39.0, docs/REPLAY.md): the replay viewer. The game's own map draws the recorded shift (src/sim/replayFrame.ts
// builds its state for every moment), faster: the crews drive on the roads, incidents appear and close, pursuits run.
// Below it the timeline (Timeline.tsx) and the controls; beside it the crews, one of them followed on the map with its
// day, and the incident picked. Played by its own animation frame: the clock and the playhead move every frame, the
// panels a few times a second.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MapView } from '@/map/MapView';
import { UNIT_GLYPHS } from '@/map/glyphs';
import { REGIONS } from '@/data/regions';
import { t as tr, useLang } from '@/i18n';
import { sectorById } from '@/sim/sectors';
import type { ReplayIncident, ReplayMarkKind, ReplayUnit, ShiftReplay } from '@/sim/replay';
import {
  crewsAt,
  feedAt,
  incidentTimes,
  nextMark,
  pursuitAt,
  ReplayFrame,
  replaySpan,
  statusSpans,
  unitAt,
  unitJobs,
  type FeedItem,
} from '@/sim/replayFrame';
import { ddmmyyyy, hhmm, hhmmss, MIN } from '@/sim/time';
import type { Lang, LngLat, UnitStatus } from '@/sim/types';
import { useReplay, type ReplayOpen } from '@/store/replay';
import { useSettings } from '@/store/settings';
import { Icon } from '@/ui/components';
import { Timeline, type JumpOpts } from './Timeline';
import './replay.css';

/** Playing speeds: game minutes a second. */
const SPEEDS = [1, 3, 10, 30] as const;
const DEFAULT_SPEED = 1;
/** During a pursuit the replay plays no faster than this (game minutes a second). */
const PURSUIT_SPEED = 1;
/** A jump to a mark lands this long before it (game ms), so it happens on screen. */
const MARK_LEAD_MS = 5_000;
/** The panels follow the clock this often (real ms). */
const PANEL_MS = 200;
/** Marks the previous and next buttons jump between (the crews sent are too many for that). */
const JUMP_KINDS: ReadonlySet<ReplayMarkKind> = new Set<ReplayMarkKind>(['call', 'pursuit', 'crisis', 'good', 'bad']);
const WORKING: ReadonlySet<UnitStatus> = new Set<UnitStatus>(['enroute', 'onscene', 'transport', 'emergency', 'busy']);

type TFn = (k: string, v?: Record<string, string | number>) => string;
const title = (x: ReplayIncident | undefined, lang: Lang) => (x ? x.title[lang] || x.title.et || x.code : '');
const isNarrow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 980px)').matches;

export function ReplayScreen({ open }: { open: ReplayOpen }) {
  const rep = open.rep;
  const lang = useLang();
  const T: TFn = useCallback((k, v) => tr(k, lang, v), [lang]);
  const styleKey = useSettings((s) => s.mapStyle);
  const close = useReplay((s) => s.close);

  const frame = useMemo(() => new ReplayFrame(rep), [rep]);
  const startAt = useMemo(() => {
    if (open.at !== undefined) return open.at;
    const inc = open.inc ? frame.incident(open.inc) : undefined;
    if (inc) return Math.max(rep.from, (inc.shown ?? inc.created) - 30_000);
    return rep.from;
  }, [open, frame, rep]);
  const [sim, setSim] = useState(() => {
    frame.jump(startAt);
    return frame.state;
  });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [slow, setSlow] = useState(true);
  const [unitId, setUnitId] = useState<string | undefined>(open.unit);
  const [incId, setIncId] = useState<string | undefined>(open.inc);
  const [follow, setFollow] = useState(!!open.unit);
  const [busyOnly, setBusyOnly] = useState(false);
  // A narrow screen: the side panel is a drawer over the map, closed until asked for.
  const [panel, setPanel] = useState(() => !isNarrow());
  const [focus, setFocus] = useState<{ coord: LngLat; zoom?: number; n: number } | null>(null);
  const [, setTick] = useState(0);
  const [slowing, setSlowing] = useState(false);

  const clockRef = useRef<HTMLSpanElement>(null);
  const secRef = useRef<HTMLSpanElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const live = useRef({ playing, speed, slow, scrubbing: false });
  live.current.playing = playing;
  live.current.speed = speed;
  live.current.slow = slow;

  const span = useMemo(() => replaySpan(rep), [rep]);
  const focusOn = useCallback((coord: LngLat, zoom?: number) => setFocus((f) => ({ coord, zoom, n: (f?.n ?? 0) + 1 })), []);

  /** The clock and the playhead, straight in the page (every frame). */
  const paint = useCallback(() => {
    const t = frame.t;
    if (clockRef.current) clockRef.current.textContent = hhmm(t);
    if (secRef.current) secRef.current.textContent = hhmmss(t).slice(5);
    const el = headRef.current;
    if (el?.parentElement) {
      const w = el.parentElement.clientWidth;
      el.style.transform = `translateX(${(((t - span.t0) / (span.t1 - span.t0)) * w).toFixed(1)}px)`;
    }
  }, [frame, span]);

  // The replay's own clock.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let panelAt = 0;
    let wasSlow = false;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min(100, ts - last) : 16;
      last = ts;
      const L = live.current;
      // A pursuit going on slows the replay down (and says so, playing or not).
      const chase = L.slow && SPEEDS[L.speed] > PURSUIT_SPEED && !!pursuitAt(rep, frame.t);
      if (chase !== wasSlow) {
        wasSlow = chase;
        setSlowing(chase);
      }
      if (L.playing && !L.scrubbing) {
        const perSec = chase ? PURSUIT_SPEED : SPEEDS[L.speed];
        const next = frame.t + (dt / 1000) * perSec * MIN;
        if (next >= rep.to) {
          frame.at(rep.to);
          setPlaying(false);
        } else frame.at(next);
      }
      paint();
      if (ts - panelAt > PANEL_MS) {
        panelAt = ts;
        setTick((n) => (n + 1) % 1_000_000);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frame, rep, paint]);

  const jump = useCallback(
    (t: number) => {
      live.current.scrubbing = false;
      frame.jump(t);
      setSim(frame.state);
      paint();
      setTick((n) => n + 1);
    },
    [frame, paint],
  );

  const scrub = useCallback(
    (t: number) => {
      live.current.scrubbing = true;
      frame.at(t);
      paint();
    },
    [frame, paint],
  );

  const pickIncident = useCallback(
    (id: string | undefined, fly: boolean) => {
      setIncId(id);
      const x = id ? frame.incident(id) : undefined;
      if (x && fly) {
        // The map goes to the incident: following a crew would pull it straight back.
        setFollow(false);
        focusOn(x.coord, 14);
      }
    },
    [frame, focusOn],
  );

  const pickUnit = useCallback(
    (id: string | undefined) => {
      setUnitId(id);
      setFollow(!!id);
      // On a narrow screen the drawer gets out of the way of the crew followed; wide, the panel shows its card.
      if (id) setPanel(!isNarrow());
    },
    [],
  );

  /** A pursuit is watched from its lead crew's side: the camera follows the first crew in the chase. */
  const chaser = useCallback(
    (inc: string, t: number) => {
      const x = frame.incident(inc);
      const pu = x?.pu?.find((q) => t >= q.t0 - 60_000 && t <= (q.t1 ?? rep.to));
      return pu ? crewsAt(rep, inc, Math.min(pu.t1 ?? rep.to, pu.t0 + 30_000))[0] : undefined;
    },
    [frame, rep],
  );

  const onJump = useCallback(
    (t: number, o?: JumpOpts) => {
      jump(t);
      if (o?.at) {
        setFollow(false);
        focusOn(o.at, 13);
      }
      const unit = o?.unit ?? (o?.inc ? chaser(o.inc, t) : undefined);
      if (o?.inc) pickIncident(o.inc, !unit);
      if (unit) pickUnit(unit);
    },
    [jump, pickIncident, pickUnit, chaser, focusOn],
  );

  const toMark = useCallback(
    (dir: 1 | -1) => {
      const m = nextMark(rep, frame.t, dir, JUMP_KINDS, MARK_LEAD_MS);
      if (!m) return;
      const at = Math.max(rep.from, m.t - MARK_LEAD_MS);
      jump(at);
      const unit = m.k === 'pursuit' && m.inc ? chaser(m.inc, at) : undefined;
      if (m.inc) pickIncident(m.inc, !unit);
      if (unit) pickUnit(unit);
      if (m.k === 'crisis' && rep.crisis) {
        setFollow(false);
        focusOn(rep.crisis.center, 13);
      }
    },
    [rep, frame, jump, pickIncident, pickUnit, chaser, focusOn],
  );

  const togglePlay = useCallback(() => {
    if (!live.current.playing && frame.t >= rep.to - 1000) jump(rep.from);
    setPlaying((p) => !p);
  }, [frame, rep, jump]);

  // Keys: the replay is a dialog over the page, nothing under it hears them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      // Space and Enter on a focused button or checkbox press it, as everywhere.
      const control = !!el && (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'A' || el.tagName === 'SELECT');
      if (control && (e.key === ' ' || e.key === 'Enter')) return;
      let done = true;
      const step = (e.shiftKey ? 10 : 1) * MIN;
      switch (e.key) {
        case ' ':
        case 'k':
          togglePlay();
          break;
        case 'ArrowRight':
          jump(frame.clamp(frame.t + step));
          break;
        case 'ArrowLeft':
          jump(frame.clamp(frame.t - step));
          break;
        case 'PageDown':
        case '.':
          toMark(1);
          break;
        case 'PageUp':
        case ',':
          toMark(-1);
          break;
        case 'Home':
          jump(rep.from);
          break;
        case 'End':
          jump(rep.to);
          break;
        case '1':
        case '2':
        case '3':
        case '4':
          setSpeed(Number(e.key) - 1);
          break;
        case 'f':
          if (unitId) setFollow((f) => !f);
          break;
        case 'Escape':
          if (incId) setIncId(undefined);
          else if (unitId) pickUnit(undefined);
          else close();
          break;
        default:
          done = false;
      }
      if (done) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [togglePlay, jump, toMark, frame, rep, unitId, incId, pickUnit, close]);

  // The page under the replay does not scroll, and the keys come into it (a button left focused under it would
  // take Space); on closing, the focus goes back where it was.
  const playRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    const had = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    playRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prev;
      had?.focus?.({ preventScroll: true });
    };
  }, []);

  // Opened at an incident: the map shows it (once, when it opens).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (open.inc) pickIncident(open.inc, true);
  }, [open.inc, pickIncident]);

  const t = frame.t;
  const region = REGIONS[rep.regionId];
  const regionName = region?.name?.[lang] || region?.name?.et || rep.regionId;
  const inc = incId ? frame.incident(incId) : undefined;
  const assigned = incId ? (frame.state.incidents[incId]?.assigned ?? []) : [];
  const unit = unitId ? rep.units.find((u) => u.id === unitId) : undefined;
  const ended = !playing && t >= rep.to - 1000;
  const feed = feedAt(rep, t, 5);

  return (
    <div className="rp" role="dialog" aria-modal="true" aria-label={T('replay.region')} data-testid="replay">
      <header className="rp-top">
        <div className="rp-top__title">
          <span className="rp-top__kicker">{T('replay.title')}</span>
          <h2>
            {regionName}
            <span className="rp-top__when rp-mono">
              {ddmmyyyy(rep.start)} {hhmm(span.t0)}-{hhmm(span.t1)}
            </span>
          </h2>
        </div>
        <span className="rp-top__who">{rep.seats?.length ? rep.seats.map((x) => x.name).join(', ') : rep.playerName}</span>
        <button
          type="button"
          className={`rp-iconBtn rp-top__panel${panel ? ' is-on' : ''}`}
          onClick={() => setPanel((v) => !v)}
          aria-pressed={panel}
          aria-label={T('replay.crews')}
          title={T('replay.crews')}
        >
          <Icon name="users" size={18} />
        </button>
        <button type="button" className="rp-iconBtn" onClick={close} aria-label={T('replay.close')} title={T('replay.close')}>
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className={`rp-body${panel ? ' has-panel' : ''}`}>
        <div className="rp-map">
          <MapView
            sim={sim}
            regionId={rep.regionId}
            lang={lang}
            styleKey={styleKey}
            selectedIncidentId={incId}
            selectedUnitId={unitId}
            highlightUnitIds={assigned}
            focus={focus}
            onSelectIncident={(id) => pickIncident(id, false)}
            onSelectUnit={(id) => pickUnit(id)}
            follow={follow}
            onFollowChange={setFollow}
          />
          <div className="rp-clock" aria-live="off">
            <span className="rp-clock__time rp-mono">
              <span ref={clockRef}>{hhmm(t)}</span>
              <span ref={secRef} className="rp-clock__sec">
                {hhmmss(t).slice(5)}
              </span>
            </span>
            <span className="rp-clock__speed rp-mono">{T('replay.speed.n', { n: slowing ? PURSUIT_SPEED : SPEEDS[speed] })}</span>
            {slowing && <span className="rp-clock__slow">{T('replay.slowing')}</span>}
          </div>
          <Feed
            items={feed}
            rep={rep}
            lang={lang}
            T={T}
            onPick={(x) => {
              if (x.inc) pickIncident(x.inc, true);
              else if (x.k === 'crisis' && rep.crisis) {
                setFollow(false);
                focusOn(rep.crisis.center, 13);
              }
            }}
          />
          {rep.from > span.t0 + 30_000 && t < rep.from + 2 * MIN && (
            <p className="rp-note">{T('replay.starts', { time: hhmm(rep.from) })}</p>
          )}
          {unit && !panel && (
            <FollowChip
              unit={unit}
              frame={frame}
              lang={lang}
              T={T}
              follow={follow}
              onOpen={() => setPanel(true)}
              onFollow={() => setFollow((f) => !f)}
              onClose={() => pickUnit(undefined)}
            />
          )}
          {inc && (
            <IncidentCard
              inc={inc}
              rep={rep}
              frame={frame}
              lang={lang}
              T={T}
              onClose={() => setIncId(undefined)}
              onUnit={(id) => pickUnit(id)}
              onGo={() => jump(Math.max(rep.from, (inc.shown ?? inc.created) - 30_000))}
            />
          )}
        </div>
        {panel && (
          <aside className="rp-side" aria-label={T('replay.crews')}>
            {unit ? (
              <CrewCard
                unit={unit}
                rep={rep}
                frame={frame}
                lang={lang}
                T={T}
                follow={follow}
                onFollow={() => setFollow((f) => !f)}
                onBack={() => pickUnit(undefined)}
                onJob={(id, at) => {
                  jump(Math.max(rep.from, at - 15_000));
                  pickIncident(id, false);
                }}
                onSeek={(at) => jump(at)}
              />
            ) : (
              <CrewList rep={rep} frame={frame} lang={lang} T={T} busyOnly={busyOnly} onBusyOnly={setBusyOnly} onPick={pickUnit} />
            )}
          </aside>
        )}
      </div>

      <footer className="rp-bottom">
        <div className="rp-ctl">
          <button
            ref={playRef}
            type="button"
            className="rp-play"
            onClick={togglePlay}
            aria-label={T(ended ? 'replay.again' : playing ? 'replay.pause' : 'replay.play')}
            title={T(ended ? 'replay.again' : playing ? 'replay.pause' : 'replay.play')}
            data-testid="replay-play"
          >
            <Icon name={playing ? 'pause' : 'play'} size={20} />
          </button>
          <button type="button" className="rp-iconBtn" onClick={() => toMark(-1)} aria-label={T('replay.prev')} title={T('replay.prev')}>
            <Icon name="chevron-left" size={16} />
          </button>
          <button type="button" className="rp-iconBtn" onClick={() => toMark(1)} aria-label={T('replay.next')} title={T('replay.next')}>
            <Icon name="chevron-right" size={16} />
          </button>
          <div className="rp-speed" role="group" aria-label={T('replay.speed')}>
            {SPEEDS.map((n, i) => (
              <button
                key={n}
                type="button"
                className={`rp-speed__btn rp-mono${i === speed ? ' is-on' : ''}`}
                aria-pressed={i === speed}
                title={T('replay.speed.hint', { n })}
                onClick={() => setSpeed(i)}
              >
                {T('replay.speed.n', { n })}
              </button>
            ))}
          </div>
          <label className="rp-check" title={T('replay.slow.hint')}>
            <input type="checkbox" checked={slow} onChange={(e) => setSlow(e.target.checked)} />
            <span>{T('replay.slow')}</span>
          </label>
          <span className="rp-ctl__keys">{T('replay.keys')}</span>
        </div>
        <Timeline rep={rep} lang={lang} headRef={headRef} now={t} selectedInc={incId} onScrub={scrub} onJump={onJump} />
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const FEED_ICON: Record<FeedItem['k'], Parameters<typeof Icon>[0]['name']> = {
  call: 'phone',
  missed: 'phone-off',
  card: 'alert',
  send: 'car',
  arrive: 'pin',
  pursuit: 'siren',
  pursuitEnd: 'check',
  closed: 'check',
  crisis: 'alert',
};

function Feed({ items, rep, lang, T, onPick }: { items: FeedItem[]; rep: ShiftReplay; lang: Lang; T: TFn; onPick: (x: FeedItem) => void }) {
  if (!items.length) return null;
  const incs = new Map(rep.incidents.map((x) => [x.id, x]));
  const units = new Map(rep.units.map((u) => [u.id, u]));
  return (
    <ol className="rp-feed" aria-label={T('replay.feed')} data-testid="replay-feed">
      {items.map((x, i) => {
        const inc = x.inc ? incs.get(x.inc) : undefined;
        const unit = x.unit ? units.get(x.unit)?.callsign : undefined;
        const head =
          x.k === 'send' || x.k === 'arrive'
            ? T(`replay.feed.${x.k}`, { unit: unit ?? '' })
            : x.k === 'pursuitEnd' && x.end
              ? `${T('replay.feed.pursuitEnd')}: ${T(`replay.end.${x.end}`)}`
              : T(`replay.feed.${x.k}`);
        const what = x.k === 'crisis' ? (rep.crisis?.address ?? '') : title(inc, lang);
        return (
          <li key={`${x.t}-${x.k}-${x.inc ?? ''}-${x.unit ?? ''}-${i}`} className={`rp-feed__item is-${x.k}`} style={{ '--i': i } as CSSProperties}>
            <button type="button" onClick={() => onPick(x)} disabled={!inc && x.k !== 'crisis'}>
              <span className="rp-mono rp-feed__t">{hhmm(x.t)}</span>
              <Icon name={FEED_ICON[x.k]} size={13} />
              <span className="rp-feed__text">
                <b>{head}</b>
                {what && <span> · {what}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Glyph({ type }: { type: ReplayUnit['type'] }) {
  return <span className="rp-glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: UNIT_GLYPHS[type] ?? UNIT_GLYPHS.patrol }} />;
}

/** The crew followed, on the map while the side panel is closed: tap for its card. */
function FollowChip({
  unit,
  frame,
  lang,
  T,
  follow,
  onOpen,
  onFollow,
  onClose,
}: {
  unit: ReplayUnit;
  frame: ReplayFrame;
  lang: Lang;
  T: TFn;
  follow: boolean;
  onOpen: () => void;
  onFollow: () => void;
  onClose: () => void;
}) {
  const now = unitAt(unit, frame.t);
  const inc = now.inc ? frame.incident(now.inc) : undefined;
  return (
    <div className="rp-chipBar" data-testid="replay-follow-chip">
      <button type="button" className="rp-chipBar__main" onClick={onOpen}>
        <Glyph type={unit.type} />
        <span className="rp-mono rp-chipBar__cs">{unit.callsign}</span>
        <span className={`rp-st rp-st--${now.status}`}>
          <i aria-hidden="true" />
          {tr(`map.status.${now.status}`, lang)}
        </span>
        {inc && <span className="rp-chipBar__inc">{inc.code}</span>}
      </button>
      <button
        type="button"
        className={`rp-iconBtn${follow ? ' is-on' : ''}`}
        onClick={onFollow}
        aria-pressed={follow}
        aria-label={T(follow ? 'replay.following' : 'replay.follow')}
        title={T(follow ? 'replay.following' : 'replay.follow')}
      >
        <Icon name={follow ? 'eye' : 'eye-off'} size={16} />
      </button>
      <button type="button" className="rp-iconBtn" onClick={onClose} aria-label={T('replay.backToCrews')} title={T('replay.backToCrews')}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function deskName(desk: string | undefined, lang: Lang): string {
  if (!desk) return '';
  const s = sectorById(desk);
  return s ? s.name[lang] || s.name.et : desk;
}

function CrewList({
  rep,
  frame,
  lang,
  T,
  busyOnly,
  onBusyOnly,
  onPick,
}: {
  rep: ShiftReplay;
  frame: ReplayFrame;
  lang: Lang;
  T: TFn;
  busyOnly: boolean;
  onBusyOnly: (v: boolean) => void;
  onPick: (id: string) => void;
}) {
  const rows = rep.units
    .map((u) => ({ u, live: frame.state.units[u.id] }))
    .filter((r) => r.live && (!busyOnly || WORKING.has(r.live.status)))
    .sort((a, b) => a.u.callsign.localeCompare(b.u.callsign, 'et', { numeric: true }));
  return (
    <div className="rp-crews" data-testid="replay-crews">
      <div className="rp-side__head">
        <h3>{T('replay.crews')}</h3>
        <label className="rp-check">
          <input type="checkbox" checked={busyOnly} onChange={(e) => onBusyOnly(e.target.checked)} />
          <span>{T('replay.crews.busy')}</span>
        </label>
      </div>
      <p className="rp-side__hint">{T('replay.crews.hint')}</p>
      {rows.length ? (
        <ul className="rp-crews__list">
          {rows.map(({ u, live }) => {
            const inc = live.incidentId ? frame.incident(live.incidentId) : undefined;
            return (
              <li key={u.id}>
                <button type="button" className="rp-crew" onClick={() => onPick(u.id)} data-unit={u.id}>
                  <Glyph type={u.type} />
                  <span className="rp-crew__cs rp-mono">{u.callsign}</span>
                  <span className={`rp-st rp-st--${live.status}`}>
                    <i aria-hidden="true" />
                    {tr(`map.status.${live.status}`, lang)}
                  </span>
                  <span className="rp-crew__inc">
                    {inc ? `${inc.code} ${title(inc, lang)}` : rep.coop === 'sector' ? deskName(u.desk, lang) : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rp-side__empty">{T('replay.crews.none')}</p>
      )}
    </div>
  );
}

function CrewCard({
  unit,
  rep,
  frame,
  lang,
  T,
  follow,
  onFollow,
  onBack,
  onJob,
  onSeek,
}: {
  unit: ReplayUnit;
  rep: ShiftReplay;
  frame: ReplayFrame;
  lang: Lang;
  T: TFn;
  follow: boolean;
  onFollow: () => void;
  onBack: () => void;
  onJob: (inc: string, at: number) => void;
  onSeek: (t: number) => void;
}) {
  const span = replaySpan(rep);
  const spans = useMemo(() => statusSpans(unit, rep.from, rep.to), [unit, rep]);
  const jobs = useMemo(() => unitJobs(unit, rep.to), [unit, rep]);
  const now = unitAt(unit, frame.t);
  const inc = now.inc ? frame.incident(now.inc) : undefined;
  const station = REGIONS[rep.regionId]?.stations.find((s) => s.id === unit.stationId);
  const desk = deskName(unit.desk, lang);
  const player = unit.desk ? rep.seats?.find((x) => x.desk === unit.desk)?.name : undefined;
  const W = span.t1 - span.t0;
  const pct = (x: number) => `${(((x - span.t0) / W) * 100).toFixed(2)}%`;
  return (
    <div className="rp-crewCard" data-testid="replay-crew">
      <button type="button" className="rp-link" onClick={onBack}>
        <Icon name="chevron-left" size={14} /> {T('replay.backToCrews')}
      </button>
      <div className="rp-crewCard__head">
        <Glyph type={unit.type} />
        <div>
          <h3 className="rp-mono">{unit.callsign}</h3>
          <p>
            {tr(`game.utype.${unit.type}`, lang)}
            {unit.vehicle ? ` · ${unit.vehicle}` : ''}
          </p>
          {station && <p className="rp-dim">{station.name?.[lang] || station.name?.et}</p>}
          {desk && (
            <p className="rp-dim">
              {T('replay.crew.desk', { name: desk })}
              {player ? ` · ${T('replay.crew.player', { name: player })}` : ''}
            </p>
          )}
        </div>
      </div>
      <button type="button" className={`rp-follow${follow ? ' is-on' : ''}`} onClick={onFollow} aria-pressed={follow}>
        <Icon name={follow ? 'eye' : 'eye-off'} size={14} />
        {T(follow ? 'replay.following' : 'replay.follow')}
      </button>
      <section className="rp-crewCard__now">
        <h4>{T('replay.crew.now')}</h4>
        <span className={`rp-st rp-st--${now.status}`}>
          <i aria-hidden="true" />
          {tr(`map.status.${now.status}`, lang)}
        </span>
        {inc && <p className="rp-crewCard__inc">{`${inc.code} ${title(inc, lang)} · ${inc.address}`}</p>}
        {!inc && now.move && <p className="rp-dim">{tr(`game.move.${now.move.u}`, lang)}</p>}
      </section>
      <section>
        <h4>{T('replay.crew.day')}</h4>
        <div
          className="rp-bar"
          role="presentation"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onSeek(span.t0 + ((e.clientX - r.left) / r.width) * W);
          }}
        >
          {spans.map((s, i) => (
            <span
              key={i}
              className={`rp-bar__seg rp-st--${s.s}`}
              style={{ left: pct(s.t0), width: `${(((s.t1 - s.t0) / W) * 100).toFixed(2)}%` }}
              title={`${hhmm(s.t0)}-${hhmm(s.t1)} ${tr(`map.status.${s.s}`, lang)}`}
            />
          ))}
          <span className="rp-bar__now" style={{ left: pct(frame.t) }} />
        </div>
        <p className="rp-dim rp-crewCard__sum">
          {T(jobs.length === 1 ? 'replay.crew.jobsN.one' : 'replay.crew.jobsN', { n: jobs.length })}
          {unit.km ? ` · ${T('replay.crew.km', { n: Math.round(unit.km) })}` : ''}
        </p>
      </section>
      <section className="rp-crewCard__jobs">
        <h4>{T('replay.crew.jobs')}</h4>
        {jobs.length ? (
          <ol>
            {jobs.map((j) => {
              const x = frame.incident(j.inc);
              const current = frame.t >= j.t0 && frame.t < j.t1;
              return (
                <li key={`${j.inc}-${j.t0}`} className={current ? 'is-now' : frame.t >= j.t1 ? 'is-past' : ''}>
                  <button type="button" onClick={() => onJob(j.inc, j.t0)}>
                    <span className="rp-mono">
                      {hhmm(j.t0)}-{hhmm(j.t1)}
                    </span>
                    <span className={`rp-prio rp-p${x?.truePriority ?? 3}`}>P{x?.truePriority ?? 3}</span>
                    <span className="rp-crewCard__job">{title(x, lang)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="rp-dim">{T('replay.crew.noJobs')}</p>
        )}
      </section>
    </div>
  );
}

function IncidentCard({
  inc,
  rep,
  frame,
  lang,
  T,
  onClose,
  onUnit,
  onGo,
}: {
  inc: ReplayIncident;
  rep: ShiftReplay;
  frame: ReplayFrame;
  lang: Lang;
  T: TFn;
  onClose: () => void;
  onUnit: (id: string) => void;
  onGo: () => void;
}) {
  const times = useMemo(() => incidentTimes(rep, inc), [rep, inc]);
  const live = frame.state.incidents[inc.id];
  const units = new Map(rep.units.map((u) => [u.id, u]));
  const steps: { k: string; t?: number }[] = [
    ...(times.call ? [{ k: times.call.m ? 'missed' : 'call', t: times.call.t }] : []),
    { k: 'shown', t: times.shown },
    { k: 'sent', t: times.sent },
    { k: 'arrived', t: times.arrived },
    { k: 'closed', t: times.closed },
  ];
  const result = inc.result ? tr(`game.result.${inc.result}`, lang) : inc.closedBy ? tr(`game.closedBy.${inc.closedBy}`, lang) : '';
  return (
    <section className="rp-inc" aria-label={title(inc, lang)} data-testid="replay-incident">
      <header className="rp-inc__head">
        <span className={`rp-prio rp-p${live?.priority ?? inc.truePriority}`}>P{live?.priority ?? inc.truePriority}</span>
        <div>
          <h3>{title(inc, lang)}</h3>
          <p className="rp-dim">
            <span className="rp-mono">{inc.number}</span> · {inc.address}
            {inc.city && !inc.address.includes(inc.city) ? `, ${inc.city}` : ''}
          </p>
        </div>
        <button type="button" className="rp-iconBtn" onClick={onClose} aria-label={T('replay.inc.close')} title={T('replay.inc.close')}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <ol className="rp-inc__steps">
        {steps.map((s) => (
          <li key={s.k} className={s.t === undefined ? 'is-none' : frame.t >= s.t ? 'is-done' : ''}>
            <span>{T(`replay.inc.${s.k}`)}</span>
            <b className="rp-mono">{s.t === undefined ? '·' : hhmm(s.t)}</b>
          </li>
        ))}
      </ol>
      {(result || times.closed === undefined) && (
        <p className="rp-inc__result">{times.closed === undefined ? T('replay.inc.open') : result}</p>
      )}
      <div className="rp-inc__crews">
        <h4>{T('replay.inc.crews')}</h4>
        {inc.units.length ? (
          <ul>
            {inc.units.map((id) => {
              const u = units.get(id);
              if (!u) return null;
              const on = !!live?.assigned.includes(id);
              return (
                <li key={id}>
                  <button type="button" className={`rp-chip${on ? ' is-on' : ''}`} onClick={() => onUnit(id)}>
                    <Glyph type={u.type} />
                    <span className="rp-mono">{u.callsign}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rp-dim">{T('replay.inc.noCrews')}</p>
        )}
      </div>
      <button type="button" className="rp-btn" onClick={onGo}>
        <Icon name="play" size={14} />
        {T('replay.inc.go')}
      </button>
    </section>
  );
}
