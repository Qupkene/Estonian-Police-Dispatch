/**
 * MapController owns the maplibre map, DOM markers, overlay sources, atmosphere and the
 * animation-frame loop. MapView (React) creates one per mount and forwards prop changes; live
 * positions are read every frame from `getProps().sim`, never from React state.
 */
import { addProtocol, Map as MlMap, setWorkerUrl, type AddProtocolAction, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
// The stylesheet travels with the map (the in-shift chunk), not with the boot screen's entry chunk.
import 'maplibre-gl/dist/maplibre-gl.css';
// Emitted as assets/maplibre-gl-worker-<hash>.mjs; public/sw.js precaches it (vite.config.ts stamps the list).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Protocol } from 'pmtiles';
import type { FeatureCollection } from 'geojson';
import type { Incident, Lang, LngLat, RegionId, SimState, Unit } from '@/sim/types';
import type { MapStyleKey } from '@/store/settings';
import { REGIONS } from '@/data/regions';
import { sun, unitPos } from '@/sim/selectors';
import {
  buildStyle,
  isRasterSource,
  isRasterStyle,
  isStreetSource,
  isStreetStyle,
  OVERLAY_SOURCES,
  SRC,
  streetTilesUrl,
  type OverlaySourceId,
} from './style';
import { knownStreetProbe, probeStreetTiles, type StreetProbe } from './streetTiles';
import { MAX_BOUNDS } from './geodata';
import { buildHeat, buildPursuits, buildRoutes, buildSearches, buildStations, declutterOffsets, isMoving, remainingPath } from './overlays';
import { roadDisplay, roadService, type RoadDisplay } from './roads';
import { IncidentMarkers, SuspectMarkers, UnitMarkers, type MarkerContext } from './markers';
import { altitudeOf, Atmosphere } from './atmosphere';
import type { MapViewProps } from './MapView';

let workerSet = false;
function ensureWorker() {
  if (workerSet) return;
  workerSet = true;
  try {
    setWorkerUrl(workerUrl);
  } catch (e) {
    console.warn('[map] setWorkerUrl failed', e);
  }
}

/**
 * The `pmtiles://` protocol for the self-hosted street map, registered once per page. Workers ask the
 * main thread for protocols they do not know, so one registration covers every map.
 */
let pmtiles: Protocol | null = null;
function ensurePmtilesProtocol(): Protocol | null {
  if (pmtiles) return pmtiles;
  try {
    const p = new Protocol();
    addProtocol('pmtiles', p.tile as unknown as AddProtocolAction);
    pmtiles = p;
  } catch (e) {
    console.warn('[map] could not register the pmtiles protocol', e);
  }
  return pmtiles;
}

/** Why the map fell back to the tactical base: tiles failed to load, or the street map file is absent. */
export type FallbackReason = 'network' | 'missing';

/** Quick capability probe so we can show a friendly panel instead of a blank map. */
export function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface ControllerEvents {
  /**
   * The tactical fallback is active (or cleared): online tiles failed repeatedly ('network'), or the
   * self-hosted street map file is not on the server ('missing').
   */
  onOffline: (offline: boolean, reason?: FallbackReason) => void;
  /** The user panned the map while following a unit. */
  onFollowBreak: () => void;
  /** The WebGL context was lost and not restored. */
  onFatal: () => void;
  /** Camera pitch crossed the 2D/3D threshold (user tilted with the mouse / touch). */
  onTilt: (tilted: boolean) => void;
}

export interface ControllerInit {
  styleKey: MapStyleKey;
  regionId: RegionId;
  lang: Lang;
  cinematic: boolean;
  heat: boolean;
  reducedMotion: boolean;
}

const RASTER_ERR_LIMIT = 6;
const RASTER_ERR_WINDOW_MS = 10_000;
const OVERLAY_INTERVAL_MS = 100;

function absBase(): string {
  const base = import.meta.env.BASE_URL || '/';
  try {
    return new URL(base, window.location.href).href;
  } catch {
    return base;
  }
}

export class MapController {
  readonly map: MlMap;
  private units: UnitMarkers;
  private incidents: IncidentMarkers;
  private suspects: SuspectMarkers;
  private atmo: Atmosphere;
  private raf = 0;
  private destroyed = false;
  private base = absBase();

  private styleKey: MapStyleKey;
  private regionId: RegionId;
  private lang: Lang;
  private cinematic: boolean;
  private heat: boolean;
  private reducedMotion: boolean;
  /** Tactical fallback in force (null = the chosen style is shown). */
  private fallback: FallbackReason | null = null;
  /** Availability of the self-hosted street map ('idle' = not checked yet). */
  private street: StreetProbe | 'idle' | 'pending' = 'idle';
  private probeSeq = 0;
  private readonly streetUrl = streetTilesUrl(this.base);
  /** Road graph and buildings (units on roads, incidents at buildings); loads in the background. */
  private readonly roadSvc = roadService(this.base);
  private stationCoordsFor: RegionId | null = null;
  private stationCoordsList: LngLat[] = [];
  private rasterErrors: number[] = [];
  private follow = false;
  private followEasing = false;

  private overlayData: Partial<Record<OverlaySourceId, FeatureCollection>> = {};
  private overlayEmpty: Partial<Record<OverlaySourceId, boolean>> = {};
  private lastOverlayAt = 0;
  private lastSlowAt = 0;
  private lastHeatAt = 0;
  private lastHeatCount = -1;
  private lastDeclutterAt = 0;
  private offsets = new Map<string, [number, number]>();
  private highlight = new Set<string>();
  private highlightSrc: string[] | undefined;
  private zoomClass = '';
  private stationsDirty = true;
  private unitPosFails = 0;
  private unitPosBypassUntil = 0;
  private warned = new Set<string>();
  private lostTimer: ReturnType<typeof setTimeout> | undefined;
  private tilted = false;
  private onlineListener = () => {
    if (this.fallback === 'network') this.retryOnline();
  };

  constructor(
    container: HTMLElement,
    private root: HTMLElement,
    init: ControllerInit,
    private getProps: () => MapViewProps,
    private events: ControllerEvents,
  ) {
    ensureWorker();
    this.styleKey = init.styleKey;
    this.regionId = init.regionId;
    this.lang = init.lang;
    this.cinematic = init.cinematic;
    this.heat = init.heat;
    this.reducedMotion = init.reducedMotion;
    if (isRasterStyle(this.styleKey) && typeof navigator !== 'undefined' && navigator.onLine === false) this.fallback = 'network';
    // A street map already found on this page starts at once; otherwise the tactical base shows
    // until the availability check below answers.
    if (isStreetStyle(this.styleKey) && knownStreetProbe(this.streetUrl) === 'ok' && ensurePmtilesProtocol()) this.street = 'ok';

    const region = REGIONS[this.regionId];
    this.map = new MlMap({
      container,
      style: this.buildStyle(),
      center: region?.center ?? [25.0, 58.7],
      zoom: region?.zoom ?? 7,
      minZoom: 5,
      maxZoom: 18.5,
      maxBounds: MAX_BOUNDS,
      maxPitch: 60,
      attributionControl: { compact: true },
      dragRotate: true,
      pitchWithRotate: true,
      fadeDuration: 180,
      refreshExpiredTiles: false,
      cancelPendingTileRequestsWhileZooming: true,
    });
    if (this.fallback) {
      const reason = this.fallback;
      queueMicrotask(() => this.events.onOffline(true, reason));
    }
    if (isStreetStyle(this.styleKey) && this.street !== 'ok') this.probeStreet(false);

    const handlers = {
      onUnit: (id: string) => this.getProps().onSelectUnit?.(id),
      onIncident: (id: string) => this.getProps().onSelectIncident?.(id),
    };
    this.units = new UnitMarkers(this.map, handlers);
    this.incidents = new IncidentMarkers(this.map, handlers);
    this.suspects = new SuspectMarkers(this.map, handlers);

    const canvasContainer = this.map.getCanvasContainer();
    this.atmo = new Atmosphere(canvasContainer, this.map.getCanvas().nextSibling);

    this.map.on('error', this.onError);
    this.map.on('click', this.onClick);
    this.map.setMissingStyleImageResolver(this.resolveImage);
    this.map.on('dragstart', this.onUserMove);
    this.map.on('zoom', this.onZoom);
    this.map.on('mousemove', 'stations-halo', this.onStationEnter);
    this.map.on('mouseleave', 'stations-halo', this.onStationLeave);
    this.map.on('pitchend', this.onPitchEnd);
    this.map.on('webglcontextlost', () => {
      console.warn('[map] WebGL context lost');
      clearTimeout(this.lostTimer);
      this.lostTimer = setTimeout(() => this.events.onFatal(), 8000);
    });
    this.map.on('webglcontextrestored', () => clearTimeout(this.lostTimer));
    window.addEventListener('online', this.onlineListener);
    if (import.meta.env.DEV) Object.assign(window as object, { __epdMap: this.map, __epdMapCtl: this });
    this.onZoom();
    this.loop();
  }

  // ── Style ──────────────────────────────────────────────────────────────────

  get effectiveStyle(): MapStyleKey {
    if (this.fallback) return 'tactical';
    if (isStreetStyle(this.styleKey) && this.street !== 'ok') return 'tactical';
    return this.styleKey;
  }

  private buildStyle() {
    return buildStyle(this.effectiveStyle, {
      base: this.base,
      cinematic: this.cinematic,
      heat: this.heat,
      overlays: this.overlayData,
    });
  }

  private applyStyle() {
    if (this.destroyed) return;
    try {
      this.map.setStyle(this.buildStyle(), { diff: true });
    } catch (e) {
      console.warn('[map] style diff failed, rebuilding', e);
      this.map.setStyle(this.buildStyle(), { diff: false });
    }
    this.stationsDirty = true;
  }

  setStyleKey(key: MapStyleKey) {
    if (key === this.styleKey) return;
    const wasEffective = this.effectiveStyle;
    this.styleKey = key;
    // A new choice deserves a fresh attempt at the network.
    this.clearFallback();
    if (isStreetStyle(key) && this.street !== 'ok') this.probeStreet(false);
    if (this.effectiveStyle !== wasEffective) this.applyStyle();
  }

  setCinematic(v: boolean) {
    if (v === this.cinematic) return;
    this.cinematic = v;
    this.applyStyle();
  }

  setHeat(v: boolean) {
    if (v === this.heat) return;
    this.heat = v;
    this.lastHeatCount = -1;
    this.applyStyle();
  }

  setLang(lang: Lang) {
    if (lang === this.lang) return;
    this.lang = lang;
    this.stationsDirty = true;
  }

  setRegion(regionId: RegionId) {
    if (regionId === this.regionId) return;
    this.regionId = regionId;
    this.stationsDirty = true;
    this.recenter();
  }

  setReducedMotion(v: boolean) {
    this.reducedMotion = v;
  }

  retryOnline() {
    if (!this.fallback) return;
    this.clearFallback();
    if (isStreetStyle(this.styleKey)) {
      // Ask the server again; the tactical base stays until it answers.
      this.probeStreet(true);
      return;
    }
    this.applyStyle();
  }

  /** Switch to the tactical base and show the badge (no-op when already there for that reason). */
  private setFallback(reason: FallbackReason) {
    if (this.fallback === reason || this.styleKey === 'tactical') return;
    const wasEffective = this.effectiveStyle;
    this.fallback = reason;
    this.events.onOffline(true, reason);
    if (this.effectiveStyle !== wasEffective) this.applyStyle();
  }

  private clearFallback() {
    this.rasterErrors = [];
    if (!this.fallback) return;
    this.fallback = null;
    this.events.onOffline(false);
  }

  private goOffline() {
    if (this.fallback || !(isRasterStyle(this.styleKey) || isStreetStyle(this.styleKey))) return;
    this.setFallback('network');
    // The street map stopped answering: check it again before the next use.
    if (isStreetStyle(this.styleKey)) this.street = 'idle';
  }

  /**
   * Check the self-hosted street map file (one header range request, shared with the map protocol)
   * and show it when it is there; fall back to the tactical base with a badge when it is not.
   */
  private probeStreet(force: boolean) {
    const seq = ++this.probeSeq;
    this.street = 'pending';
    const proto = ensurePmtilesProtocol();
    if (!proto) {
      this.street = 'missing';
      this.setFallback('missing');
      return;
    }
    probeStreetTiles(this.streetUrl, { force, onArchive: (a) => proto.add(a) })
      .catch((): StreetProbe => 'network')
      .then((r) => {
        if (this.destroyed || seq !== this.probeSeq) return;
        this.street = r;
        if (!isStreetStyle(this.styleKey)) return;
        if (r === 'ok') {
          if (!this.fallback) this.applyStyle();
        } else {
          if (r === 'missing') console.info(`[map] street map not on the server (${this.streetUrl}), using the tactical map`);
          this.setFallback(r);
        }
      });
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  private get motionOK() {
    if (this.reducedMotion) return false;
    try {
      return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return true;
    }
  }

  zoomBy(delta: number) {
    this.map.easeTo({ zoom: this.map.getZoom() + delta, duration: this.motionOK ? 250 : 0 });
  }

  recenter() {
    const r = REGIONS[this.regionId];
    if (!r) return;
    const opts = { duration: this.motionOK ? 900 : 0, pitch: this.map.getPitch(), bearing: 0 };
    const b = r.bounds;
    const valid = b && b[0][0] < b[1][0] && b[0][1] < b[1][1] && b[1][0] - b[0][0] < 5;
    if (valid) this.map.fitBounds(b, { ...opts, padding: 40, maxZoom: r.zoom + 1 });
    else this.map.flyTo({ ...opts, center: r.center, zoom: r.zoom });
  }

  focus(target: LngLat, zoom?: number) {
    // An incident or unit coordinate goes to where that marker is shown (on its building or road).
    let coord = target;
    try {
      const s = this.getProps().sim;
      if (s) coord = this.roads(s).focusCoord(s, target, performance.now());
    } catch {
      coord = target;
    }
    const z = zoom ?? Math.max(this.map.getZoom(), 12.5);
    if (this.motionOK) this.map.flyTo({ center: coord, zoom: z, speed: 1.6, curve: 1.3, essential: false });
    else this.map.jumpTo({ center: coord, zoom: z });
  }

  setFollow(v: boolean) {
    this.follow = v;
    if (v) {
      const p = this.getProps();
      const u = p.selectedUnitId ? p.sim.units[p.selectedUnitId] : undefined;
      if (u) {
        this.followEasing = true;
        this.map.easeTo({ center: this.posOf(u).pos, zoom: Math.max(this.map.getZoom(), 12), duration: this.motionOK ? 600 : 0 });
        this.map.once('moveend', () => (this.followEasing = false));
      }
    }
  }

  setTilt(on: boolean) {
    this.tilted = on;
    this.map.easeTo({ pitch: on ? 52 : 0, bearing: on ? this.map.getBearing() || -12 : 0, duration: this.motionOK ? 700 : 0 });
  }

  setPlacing(v: boolean) {
    this.root.classList.toggle('epdm--placing', v);
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  private onError = (e: { error?: { message?: string; status?: number }; sourceId?: string; tile?: unknown }) => {
    if (isStreetSource(e.sourceId) && !e.tile && this.street === 'ok' && isStreetStyle(this.styleKey)) {
      // The archive itself (not one tile) failed to open: no point in waiting for more errors.
      this.goOffline();
      return;
    }
    if (isRasterSource(e.sourceId) || isStreetSource(e.sourceId)) {
      const now = performance.now();
      this.rasterErrors.push(now);
      while (this.rasterErrors.length && now - this.rasterErrors[0] > RASTER_ERR_WINDOW_MS) this.rasterErrors.shift();
      if (this.rasterErrors.length >= RASTER_ERR_LIMIT) this.goOffline();
      return;
    }
    const msg = e.error?.message ?? String(e.error ?? 'unknown');
    if (!this.warned.has(msg)) {
      this.warned.add(msg);
      console.warn('[map]', msg);
    }
  };

  private onClick = (e: MapMouseEvent) => {
    const target = e.originalEvent?.target as Element | null;
    if (target && typeof target.closest === 'function' && target.closest('.epdm-mk')) return;
    this.getProps().onMapClick?.([e.lngLat.lng, e.lngLat.lat]);
  };

  private onUserMove = (e: { originalEvent?: unknown }) => {
    if (this.follow && e.originalEvent) {
      this.follow = false;
      this.events.onFollowBreak();
    }
  };

  private onPitchEnd = () => {
    const tilted = this.map.getPitch() > 5;
    if (tilted !== this.tilted) {
      this.tilted = tilted;
      this.events.onTilt(tilted);
    }
  };

  private onZoom = () => {
    const z = this.map.getZoom();
    const cls = z < 7.5 ? 'epdm-zxlo' : z < 10 ? 'epdm-zlo' : '';
    if (cls !== this.zoomClass) {
      if (this.zoomClass) this.root.classList.remove(this.zoomClass);
      if (cls) this.root.classList.add(cls);
      this.zoomClass = cls;
    }
  };

  private stationTip: HTMLDivElement | null = null;
  private onStationEnter = (e: MapMouseEvent & { features?: { properties: Record<string, unknown> }[] }) => {
    const f = e.features?.[0];
    if (!f) return;
    this.map.getCanvas().style.cursor = 'default';
    if (!this.stationTip) {
      this.stationTip = document.createElement('div');
      this.stationTip.className = 'epdm-station-tip';
      this.root.appendChild(this.stationTip);
    }
    this.stationTip.textContent = String(f.properties.name ?? f.properties.short ?? '');
    this.stationTip.style.transform = `translate(${Math.round(e.point.x + 14)}px, ${Math.round(e.point.y - 10)}px)`;
    this.stationTip.style.display = 'block';
  };
  private onStationLeave = () => {
    this.map.getCanvas().style.cursor = '';
    if (this.stationTip) this.stationTip.style.display = 'none';
  };

  private resolveImage = (id: string) => {
    if (id !== 'epdm-station' && id !== 'epdm-station-hq') return;
    if (this.map.hasImage(id)) return;
    const img = drawStationIcon(id === 'epdm-station-hq');
    if (img) this.map.addImage(id, img, { pixelRatio: 2 });
  };

  // ── Frame loop ─────────────────────────────────────────────────────────────

  private roads(s: SimState): RoadDisplay {
    return roadDisplay(s, this.roadSvc);
  }

  private stationCoords(): LngLat[] {
    if (this.stationCoordsFor !== this.regionId) {
      this.stationCoordsFor = this.regionId;
      this.stationCoordsList = (REGIONS[this.regionId]?.stations ?? []).map((st) => st.coord);
    }
    return this.stationCoordsList;
  }

  /** Where an incident is shown: on its building or road once the road data knows, else as given. */
  private incCoord = (inc: Incident): LngLat | null => {
    const s = this.getProps().sim;
    try {
      return this.roads(s).incidentCoord(inc, performance.now());
    } catch {
      return inc.location.coord;
    }
  };

  /** Where a pursued vehicle is shown: driving along the roads once the road data is in, else as given. */
  private suspectPosOf = (inc: Incident): { pos: LngLat; heading: number } => {
    const p = inc.pursuit!;
    try {
      const d = this.roads(this.getProps().sim).suspectPos(inc, performance.now());
      if (Number.isFinite(d.pos[0]) && Number.isFinite(d.pos[1]) && Number.isFinite(d.heading)) return d;
    } catch {
      /* engine position below */
    }
    return { pos: p.suspectPos, heading: p.heading ?? 0 };
  };

  /** A pursuit's trail along the roads the vehicle was shown on (null = the engine's trail). */
  private trailOf = (inc: Incident): LngLat[] | null => {
    try {
      return this.roads(this.getProps().sim).suspectTrail(inc);
    } catch {
      return null;
    }
  };

  /** Where a pursuit ended on the map (a search there is drawn around it). */
  private pursuitEndOf = (inc: Incident): LngLat | null => {
    try {
      return this.roads(this.getProps().sim).pursuitEnd(inc, performance.now());
    } catch {
      return inc.pursuit?.suspectPos ?? null;
    }
  };

  /** Remaining route of a moving unit: along the roads when known, else the engine's line. */
  private remainingOf = (u: Unit, now: number, current: LngLat): LngLat[] => {
    try {
      const r = this.roads(this.getProps().sim).remaining(u, now, current);
      if (r) return r;
    } catch {
      /* engine line below */
    }
    return remainingPath(u, now, current);
  };

  private posOf = (u: Unit): { pos: LngLat; heading: number } => {
    const p = this.getProps();
    if (performance.now() >= this.unitPosBypassUntil) {
      try {
        const r = unitPos(p.sim, u);
        if (r && Array.isArray(r.pos) && Number.isFinite(r.pos[0]) && Number.isFinite(r.pos[1])) {
          this.unitPosFails = 0;
          // On the roads: the same moment of the trip, along the road route.
          try {
            const d = this.roads(p.sim).unitPos(p.sim, u, r, this.stationCoords(), performance.now());
            if (Number.isFinite(d.pos[0]) && Number.isFinite(d.pos[1])) return d;
          } catch {
            /* engine position */
          }
          return r;
        }
      } catch {
        if (++this.unitPosFails > 50) {
          this.unitPosBypassUntil = performance.now() + 5000;
          this.unitPosFails = 0;
        }
      }
    }
    return { pos: u.pos, heading: u.heading ?? 0 };
  };

  private loop = () => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    try {
      this.frame();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!this.warned.has(msg)) {
        this.warned.add(msg);
        console.error('[map] frame error', e);
      }
    }
  };

  private frame() {
    const p = this.getProps();
    const s = p.sim;
    if (!s || !s.units) return;
    const realNow = performance.now();

    if (p.highlightUnitIds !== this.highlightSrc) {
      this.highlightSrc = p.highlightUnitIds;
      this.highlight = new Set(p.highlightUnitIds ?? []);
    }

    if (realNow - this.lastDeclutterAt > 200) {
      this.lastDeclutterAt = realNow;
      this.offsets = this.computeOffsets(s);
    }

    const ctx: MarkerContext = {
      sim: s,
      now: s.now,
      lang: this.lang,
      bearing: this.map.getBearing(),
      pos: this.posOf,
      incCoord: this.incCoord,
      suspectPos: this.suspectPosOf,
      selectedUnitId: p.selectedUnitId,
      selectedIncidentId: p.selectedIncidentId,
      highlight: this.highlight,
      offsets: this.offsets,
    };
    this.incidents.sync(ctx, realNow);
    this.units.sync(ctx);
    this.suspects.sync(ctx);

    // Follow the selected unit (gentle per-frame easing towards it).
    if (this.follow && !this.followEasing && p.selectedUnitId) {
      const u = s.units[p.selectedUnitId];
      if (u && !this.map.isMoving()) {
        const target = this.posOf(u).pos;
        const c = this.map.getCenter();
        const dx = target[0] - c.lng;
        const dy = target[1] - c.lat;
        if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
          const k = Math.abs(dx) + Math.abs(dy) > 0.05 ? 1 : 0.2;
          this.map.setCenter([c.lng + dx * k, c.lat + dy * k]);
        }
      }
    }

    if (realNow - this.lastOverlayAt >= OVERLAY_INTERVAL_MS) {
      this.lastOverlayAt = realNow;
      this.updateOverlays(s, p, realNow);
    }

    if (realNow - this.lastSlowAt >= 1000) {
      this.lastSlowAt = realNow;
      const r = REGIONS[this.regionId];
      this.atmo.setTint(altitudeOf(s, sun, r?.center ?? [25, 58.7]));
      this.atmo.setWeather(s.weather, this.motionOK);
    }
  }

  private computeOffsets(s: SimState) {
    const items: { id: string; pos: LngLat; moving: boolean; scene?: string; station?: string }[] = [];
    const stations = REGIONS[this.regionId]?.stations ?? [];
    for (const id of s.unitOrder ?? Object.keys(s.units)) {
      const u = s.units[id];
      if (!u) continue;
      const moving = isMoving(u, s.now);
      const pos = this.posOf(u).pos;
      let scene: string | undefined;
      let station: string | undefined;
      if (!moving) {
        const inc = u.incidentId ? s.incidents[u.incidentId] : undefined;
        if (inc && inc.state !== 'closed' && nearKm(pos, this.incCoord(inc) ?? inc.location.coord, 0.08)) scene = inc.id;
        else {
          const st = stations.find((x) => x.id === u.stationId) ?? stations.find((x) => nearKm(pos, x.coord, 0.06));
          if (st && nearKm(pos, st.coord, 0.06)) station = st.id;
        }
      }
      items.push({ id, pos, moving, scene, station });
    }
    return declutterOffsets(items);
  }

  private setSource(id: OverlaySourceId, fc: FeatureCollection, force = false) {
    const empty = fc.features.length === 0;
    if (!force && empty && this.overlayEmpty[id]) return;
    this.overlayData[id] = fc;
    const src = this.map.getSource(id) as GeoJSONSource | undefined;
    if (!src) return;
    this.overlayEmpty[id] = empty;
    try {
      const r = src.setData(fc) as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
    } catch {
      /* style swap in progress */
    }
  }

  private updateOverlays(s: SimState, p: MapViewProps, realNow: number) {
    if (this.stationsDirty && this.map.getSource(SRC.stations)) {
      this.stationsDirty = false;
      for (const id of OVERLAY_SOURCES) this.overlayEmpty[id] = false;
      this.setSource(SRC.stations, buildStations(REGIONS[this.regionId], this.lang), true);
    }
    this.setSource(SRC.routes, buildRoutes(s, this.posOf, p.selectedIncidentId, p.selectedUnitId, this.remainingOf));
    this.setSource(SRC.pursuit, buildPursuits(s, this.trailOf));
    if (realNow - this.lastHeatAt > 500) {
      this.setSource(SRC.search, buildSearches(s, this.incCoord, this.pursuitEndOf));
      if (this.heat && (s.incidentOrder.length !== this.lastHeatCount || realNow - this.lastHeatAt > 5000)) {
        this.lastHeatCount = s.incidentOrder.length;
        this.setSource(SRC.heat, buildHeat(s, this.incCoord));
      }
      this.lastHeatAt = realNow;
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.lostTimer);
    window.removeEventListener('online', this.onlineListener);
    this.units.destroy();
    this.incidents.destroy();
    this.suspects.destroy();
    this.atmo.destroy();
    this.stationTip?.remove();
    try {
      this.map.remove();
    } catch {
      /* already gone */
    }
    for (const c of ['epdm-zxlo', 'epdm-zlo', 'epdm--placing']) this.root.classList.remove(c);
    if (import.meta.env.DEV) {
      const w = window as unknown as { __epdMap?: unknown; __epdMapCtl?: unknown };
      if (w.__epdMapCtl === this) {
        delete w.__epdMap;
        delete w.__epdMapCtl;
      }
    }
  }
}

/** Cheap planar distance check (km) for small distances. */
function nearKm(a: LngLat, b: LngLat, km: number): boolean {
  const dx = (a[0] - b[0]) * 55.8; // km per degree of longitude at ~59.6° N
  const dy = (a[1] - b[1]) * 111.2;
  return dx * dx + dy * dy <= km * km;
}

/** Police-station map icon (shield with a cornflower-blue core), drawn at 2× pixel ratio. */
function drawStationIcon(hq: boolean): ImageData | null {
  const size = hq ? 44 : 36;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  const w = size;
  const pad = 3;
  const shield = () => {
    g.beginPath();
    g.moveTo(w / 2, pad);
    g.lineTo(w - pad, pad + w * 0.16);
    g.lineTo(w - pad, w * 0.5);
    g.quadraticCurveTo(w - pad, w * 0.82, w / 2, w - pad);
    g.quadraticCurveTo(pad, w * 0.82, pad, w * 0.5);
    g.lineTo(pad, pad + w * 0.16);
    g.closePath();
  };
  shield();
  g.fillStyle = '#0c1724';
  g.fill();
  g.lineWidth = hq ? 3.2 : 2.6;
  g.strokeStyle = hq ? '#f2c14e' : '#7fb2ff';
  g.stroke();
  // inner star-ish dot
  g.beginPath();
  const cx = w / 2;
  const cy = w * 0.47;
  const R = w * 0.17;
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? R : R * 0.45;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = hq ? '#f2c14e' : '#9fc2ff';
  g.fill();
  return g.getImageData(0, 0, size, size);
}
