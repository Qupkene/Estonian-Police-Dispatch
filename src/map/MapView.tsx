// Map view (owned by map). Props interface is a public contract (used by ui-game).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Lang, LngLat, RegionId, SimState } from '@/sim/types';
import { useSettings, type MapStyleKey } from '@/store/settings';
import { t } from '@/i18n';
import { MapController, webglSupported, type FallbackReason } from './controller';
import { MapToolbar } from './MapToolbar';
import './map.css';

export interface MapViewProps {
  /** Live simulation state; the map reads unit/incident positions every animation frame. */
  sim: SimState;
  regionId: RegionId;
  lang: Lang;
  styleKey: MapStyleKey;
  selectedIncidentId?: string;
  selectedUnitId?: string;
  /** Units to highlight (e.g. recommended for the selected incident). */
  highlightUnitIds?: string[];
  /** Fly-to request; `n` changes on each new request. */
  focus?: { coord: LngLat; zoom?: number; n: number } | null;
  onSelectIncident?: (id: string) => void;
  onSelectUnit?: (id: string) => void;
  /** Map background click (director mode uses it to place incidents). */
  onMapClick?: (coord: LngLat) => void;
  /** Director: show a crosshair cursor. */
  placing?: boolean;
  /** Hide labels/overlays for cinematic shots. */
  cinematic?: boolean;
}

export function MapView(p: MapViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(p);
  const ctlRef = useRef<MapController | null>(null);
  const reducedMotion = useSettings((s) => s.reducedMotion);

  const [glError, setGlError] = useState(false);
  /** Tactical fallback in force and why (tiles failed, or the street map file is not on the server). */
  const [fallback, setFallback] = useState<FallbackReason | null>(null);
  const [follow, setFollow] = useState(false);
  const [heat, setHeat] = useState(false);
  const [tilt, setTilt] = useState(false);
  /** Layer picked in the toolbar, applied immediately (the parent may echo it back via styleKey). */
  const [pickedStyle, setPickedStyle] = useState<{ key: MapStyleKey; prop: MapStyleKey } | null>(null);
  const styleKey = pickedStyle && pickedStyle.prop === p.styleKey ? pickedStyle.key : p.styleKey;

  // Always read the latest props from the frame loop (the sim object itself is mutated in place).
  useLayoutEffect(() => {
    propsRef.current = p;
  });

  // Create the map once per mount.
  useEffect(() => {
    const el = mapElRef.current;
    const root = rootRef.current;
    if (!el || !root) return;
    if (!webglSupported()) {
      setGlError(true);
      return;
    }
    let ctl: MapController;
    const init = propsRef.current;
    try {
      ctl = new MapController(
        el,
        root,
        {
          styleKey: init.styleKey,
          regionId: init.regionId,
          lang: init.lang,
          cinematic: !!init.cinematic,
          heat: false,
          reducedMotion: useSettings.getState().reducedMotion,
        },
        () => propsRef.current,
        {
          onOffline: (v, reason) => setFallback(v ? (reason ?? 'network') : null),
          onFollowBreak: () => setFollow(false),
          onFatal: () => setGlError(true),
          onTilt: (v) => setTilt(v),
        },
      );
    } catch (e) {
      console.error('[map] could not create the map', e);
      setGlError(true);
      return;
    }
    ctlRef.current = ctl;
    const ro = new ResizeObserver(() => {
      try {
        ctl.map.resize();
      } catch {
        /* map removed */
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      ctl.destroy();
      ctlRef.current = null;
    };
  }, []);

  useEffect(() => ctlRef.current?.setStyleKey(styleKey), [styleKey]);
  useEffect(() => ctlRef.current?.setCinematic(!!p.cinematic), [p.cinematic]);
  useEffect(() => ctlRef.current?.setLang(p.lang), [p.lang]);
  useEffect(() => ctlRef.current?.setRegion(p.regionId), [p.regionId]);
  useEffect(() => ctlRef.current?.setHeat(heat), [heat]);
  useEffect(() => ctlRef.current?.setReducedMotion(reducedMotion), [reducedMotion]);
  useEffect(() => ctlRef.current?.setPlacing(!!p.placing), [p.placing]);
  useEffect(() => ctlRef.current?.setFollow(follow && !!p.selectedUnitId), [follow, p.selectedUnitId]);

  const focusN = p.focus?.n;
  useEffect(() => {
    const f = propsRef.current.focus;
    if (f && ctlRef.current) ctlRef.current.focus(f.coord, f.zoom);
  }, [focusN]);

  const tr = (k: string) => t(k, p.lang);

  const pickStyle = (key: MapStyleKey) => {
    setPickedStyle({ key, prop: p.styleKey });
    try {
      useSettings.getState().set({ mapStyle: key });
    } catch {
      /* settings store unavailable */
    }
  };

  const rootClass = `epdm${p.cinematic ? ' epdm--cine' : ''}${reducedMotion ? ' epdm--rm' : ''}${glError ? ' epdm--nogl' : ''}`;

  return (
    <div ref={rootRef} className={rootClass} role="region" aria-label={tr('map.region')}>
      <div ref={mapElRef} className="epdm__map" />
      {glError && (
        <div className="epdm-nogl" role="alert">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
            <path d="m9 4 6 2 6-2v14l-6 2-6-2-6 2V6z" />
            <path d="M9 4v14M15 6v14" />
            <path d="m3 3 18 18" strokeWidth={2} />
          </svg>
          <h3>{tr('map.noWebgl.title')}</h3>
          <p>{tr('map.noWebgl.body')}</p>
          <p className="epdm-nogl__tip">{tr('map.noWebgl.tip')}</p>
        </div>
      )}
      {!glError && !p.cinematic && (
        <MapToolbar
          lang={p.lang}
          styleKey={styleKey}
          follow={follow && !!p.selectedUnitId}
          canFollow={!!p.selectedUnitId}
          heat={heat}
          tilt={tilt}
          onZoomIn={() => ctlRef.current?.zoomBy(1)}
          onZoomOut={() => ctlRef.current?.zoomBy(-1)}
          onRecenter={() => {
            setFollow(false);
            ctlRef.current?.recenter();
          }}
          onFollow={() => setFollow((f) => !f)}
          onHeat={() => setHeat((h) => !h)}
          onTilt={() => {
            const next = !tilt;
            setTilt(next);
            ctlRef.current?.setTilt(next);
          }}
          onStyle={pickStyle}
        />
      )}
      {!glError && fallback && styleKey !== 'tactical' && !p.cinematic && (
        <button
          type="button"
          className="epdm-offline"
          onClick={() => ctlRef.current?.retryOnline()}
          title={tr(fallback === 'missing' ? 'map.streetMissingHint' : 'map.offlineHint')}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M5 12.5a10 10 0 0 1 4-2.3M12 8.5a10 10 0 0 1 7 4M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M3 3l18 18" strokeLinecap="round" />
          </svg>
          <span>{tr(fallback === 'missing' ? 'map.streetMissing' : 'map.offline')}</span>
        </button>
      )}
    </div>
  );
}
