/**
 * Imperative DOM markers for units, incidents, pursuit suspects and other agencies' vehicles.
 *
 * Markers are created once per id and diffed every animation frame straight from the live
 * SimState (which the engine mutates in place). DOM writes only happen when something changed:
 * position (setLngLat), state (class string), heading (transform) or declutter offset.
 */
import { Marker, type Map as MlMap } from 'maplibre-gl';
import type { Incident, Lang, LngLat, SimState, Unit } from '@/sim/types';
import { TEMPLATE_BY_ID } from '@/data/incidents';
import { withScenario } from '@/sim/scenario';
import { t } from '@/i18n';
import { AGENCY_GLYPHS, SIREN_GLYPH, SUSPECT_GLYPH, UNIT_GLYPHS } from './glyphs';
import { isHidden, isMoving, type IncCoordFn, type PosFn, type SuspectPosFn } from './overlays';
import { AGENCY_VEHICLES, agencyTitle, etaMinutes, type AgencyVehicle } from './agencies';

/** Closed incidents stay on the map (greyed) for this many game-ms, then fade out. */
export const CLOSED_LINGER_MS = 2 * 60_000;
const FADE_MS = 650;

export interface MarkerContext {
  sim: SimState;
  now: number;
  lang: Lang;
  bearing: number;
  pos: PosFn;
  /** Where each incident is shown (null = its building is still being looked up). */
  incCoord: IncCoordFn;
  /** Where a pursued vehicle is shown (on the roads); the engine's position when absent. */
  suspectPos?: SuspectPosFn;
  selectedUnitId?: string;
  selectedIncidentId?: string;
  highlight: Set<string>;
  offsets: Map<string, [number, number]>;
  /** Sector co-op: a neighbouring desk's unit or incident, drawn dimmed. */
  dimmed?: (kind: 'unit' | 'incident', id: string) => boolean;
}

export interface MarkerHandlers {
  onUnit: (id: string) => void;
  onIncident: (id: string) => void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function makeRoot(kind: string, onActivate: () => void): HTMLDivElement {
  const root = document.createElement('div');
  root.className = `epdm-mk epdm-mk--${kind}`;
  root.setAttribute('role', 'button');
  root.tabIndex = -1;
  // Dragging the map may start on a marker; only a real click (no drag) selects it.
  let downX = NaN;
  let downY = NaN;
  root.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    if (Number.isFinite(downX) && Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    onActivate();
  });
  root.addEventListener('keydown', (e) => {
    // Enter only: Space is the global pause hotkey.
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onActivate();
    }
  });
  root.addEventListener('dblclick', (e) => e.stopPropagation());
  return root;
}

const near = (a: number, b: number, eps: number) => Math.abs(a - b) < eps;

// ─────────────────────────────────────────────────────────────────────────────
// Units
// ─────────────────────────────────────────────────────────────────────────────

interface UnitRec {
  marker: Marker;
  root: HTMLDivElement;
  inner: HTMLDivElement;
  dir: HTMLDivElement;
  label: HTMLSpanElement;
  glyph: HTMLSpanElement;
  key: string;
  lng: number;
  lat: number;
  rot: number;
  off: [number, number];
  type: string;
}

export class UnitMarkers {
  private recs = new Map<string, UnitRec>();
  private seen = new Set<string>();

  constructor(
    private map: MlMap,
    private handlers: MarkerHandlers,
  ) {}

  private create(u: Unit): UnitRec {
    const id = u.id;
    const root = makeRoot('unit', () => this.handlers.onUnit(id));
    root.innerHTML =
      '<div class="epdm-unit"><span class="epdm-unit__ring"></span><span class="epdm-unit__ring epdm-unit__ring--b"></span>' +
      '<span class="epdm-unit__halo"></span><div class="epdm-unit__dir"><i></i></div>' +
      `<span class="epdm-unit__dot"><span class="epdm-unit__glyph"></span></span><span class="epdm-unit__label"></span></div>`;
    const inner = root.firstElementChild as HTMLDivElement;
    const rec: UnitRec = {
      marker: new Marker({ element: root, anchor: 'center', subpixelPositioning: true }).setLngLat(u.pos).addTo(this.map),
      root,
      inner,
      dir: inner.querySelector('.epdm-unit__dir') as HTMLDivElement,
      label: inner.querySelector('.epdm-unit__label') as HTMLSpanElement,
      glyph: inner.querySelector('.epdm-unit__glyph') as HTMLSpanElement,
      key: '',
      lng: u.pos[0],
      lat: u.pos[1],
      rot: NaN,
      off: [0, 0],
      type: '',
    };
    this.recs.set(id, rec);
    return rec;
  }

  sync(c: MarkerContext): void {
    const s = c.sim;
    this.seen.clear();
    for (const id of s.unitOrder ?? Object.keys(s.units)) {
      const u = s.units[id];
      if (!u || !u.pos) continue;
      this.seen.add(id);
      const rec = this.recs.get(id) ?? this.create(u);
      const { pos, heading } = c.pos(u);
      const moving = isMoving(u, c.now);
      const siren = moving && !!u.move?.siren;
      const sel = id === c.selectedUnitId;
      const hl = c.highlight.has(id);
      const atSelected = !!c.selectedIncidentId && u.incidentId === c.selectedIncidentId;
      const dim = !!c.dimmed?.('unit', id) && !sel;

      if (rec.type !== u.type) {
        rec.type = u.type;
        rec.glyph.innerHTML = UNIT_GLYPHS[u.type] ?? UNIT_GLYPHS.patrol;
      }
      const key = `${u.status}|${siren}|${moving}|${sel}|${hl}|${atSelected}|${u.callsign}|${c.lang}|${dim}`;
      if (key !== rec.key) {
        rec.key = key;
        rec.inner.className =
          `epdm-unit epdm-st-${u.status} epdm-ut-${u.type}` +
          (moving ? ' is-moving' : '') +
          (siren ? ' is-siren' : '') +
          (sel ? ' is-sel' : '') +
          (hl ? ' is-hl' : '') +
          (atSelected ? ' is-assigned' : '') +
          (dim ? ' is-dim' : '');
        rec.label.textContent = u.callsign;
        const status = t(`map.status.${u.status}`, c.lang);
        rec.root.setAttribute('aria-label', `${u.callsign} · ${status}`);
        rec.root.title = `${u.callsign} · ${status}${u.vehicle ? ` · ${u.vehicle}` : ''}`;
        rec.root.style.zIndex = String(unitZ(u.status, sel, hl, atSelected, siren));
      }
      if (!near(pos[0], rec.lng, 1e-7) || !near(pos[1], rec.lat, 1e-7)) {
        rec.lng = pos[0];
        rec.lat = pos[1];
        rec.marker.setLngLat(pos);
      }
      if (moving) {
        const rot = (((heading - c.bearing) % 360) + 360) % 360;
        if (!near(rot, rec.rot, 0.4)) {
          rec.rot = rot;
          rec.dir.style.transform = `rotate(${rot.toFixed(1)}deg)`;
        }
      }
      const off = moving ? ZERO : (c.offsets.get(id) ?? ZERO);
      if (off[0] !== rec.off[0] || off[1] !== rec.off[1]) {
        rec.off = off;
        rec.marker.setOffset(off);
      }
    }
    for (const [id, rec] of this.recs) {
      if (!this.seen.has(id)) {
        rec.marker.remove();
        this.recs.delete(id);
      }
    }
  }

  destroy(): void {
    for (const rec of this.recs.values()) rec.marker.remove();
    this.recs.clear();
  }
}

const ZERO: [number, number] = [0, 0];

/**
 * Stacking order: selected unit 60 > emergency 55 > highlighted 50 > assigned to the selected
 * incident 48 > siren 46 > open incidents 40-43 > other active units 36 > idle 30 > off duty 25.
 */
function unitZ(status: Unit['status'], sel: boolean, hl: boolean, assigned: boolean, siren: boolean): number {
  if (sel) return 60;
  if (status === 'emergency') return 55;
  if (hl) return 50;
  if (assigned) return 48;
  if (siren) return 46;
  if (status === 'enroute' || status === 'onscene' || status === 'transport') return 36;
  if (status === 'offduty') return 25;
  return 30;
}

// ─────────────────────────────────────────────────────────────────────────────
// Incidents
// ─────────────────────────────────────────────────────────────────────────────

interface IncRec {
  marker: Marker;
  root: HTMLDivElement;
  inner: HTMLDivElement;
  code: HTMLSpanElement;
  tip: HTMLDivElement;
  key: string;
  lng: number;
  lat: number;
  /** performance.now() at which the faded-out marker is removed. */
  removeAt?: number;
}

/** Does the incident have an active backup request ("Toetust vajab")? */
export function needsBackup(inc: Incident): boolean {
  if (!inc.beats?.length) return false;
  const tpl = withScenario(TEMPLATE_BY_ID[inc.templateId], inc.scenarioId);
  if (!tpl?.beats) return false;
  return inc.beats.some((b) => b.status === 'active' && tpl.beats![b.index]?.kind === 'backup');
}

export class IncidentMarkers {
  private recs = new Map<string, IncRec>();
  private seen = new Set<string>();

  constructor(
    private map: MlMap,
    private handlers: MarkerHandlers,
  ) {}

  private create(inc: Incident, at: LngLat): IncRec {
    const id = inc.id;
    const root = makeRoot('incident', () => this.handlers.onIncident(id));
    root.innerHTML =
      '<div class="epdm-inc"><span class="epdm-inc__pulse"></span><span class="epdm-inc__pulse epdm-inc__pulse--b"></span>' +
      '<span class="epdm-inc__body"></span><span class="epdm-inc__code"></span>' +
      `<span class="epdm-inc__badge">${SIREN_GLYPH}</span><div class="epdm-inc__tip"></div></div>`;
    const inner = root.firstElementChild as HTMLDivElement;
    const rec: IncRec = {
      marker: new Marker({ element: root, anchor: 'center' }).setLngLat(at).addTo(this.map),
      root,
      inner,
      code: inner.querySelector('.epdm-inc__code') as HTMLSpanElement,
      tip: inner.querySelector('.epdm-inc__tip') as HTMLDivElement,
      key: '',
      lng: at[0],
      lat: at[1],
    };
    this.recs.set(id, rec);
    return rec;
  }

  sync(c: MarkerContext, realNow: number): void {
    const s = c.sim;
    this.seen.clear();
    for (const id of s.incidentOrder ?? Object.keys(s.incidents)) {
      const inc = s.incidents[id];
      if (!inc?.location?.coord || isHidden(s, id)) continue;
      const closed = inc.state === 'closed';
      const existing = this.recs.get(id);
      if (closed) {
        const age = c.now - (inc.closedAt ?? c.now);
        if (age > CLOSED_LINGER_MS) {
          // Fade out the lingering marker, never create one for long-closed incidents.
          if (existing) {
            this.seen.add(id);
            if (existing.removeAt === undefined) {
              existing.removeAt = realNow + FADE_MS;
              existing.inner.classList.add('is-gone');
            }
          }
          continue;
        }
      }
      // Shown at its building (or road); a brand-new marker waits a moment until that is known.
      const at = c.incCoord(inc);
      if (!at && !existing) continue;
      this.seen.add(id);
      const rec = existing ?? this.create(inc, at!);
      if (rec.removeAt !== undefined && !closed) {
        rec.removeAt = undefined;
        rec.inner.classList.remove('is-gone');
      }
      const sel = id === c.selectedIncidentId;
      const backup = !closed && needsBackup(inc);
      const pursuit = !!inc.pursuit && !inc.pursuit.ended && !closed;
      const dim = !!c.dimmed?.('incident', id) && !sel;
      const key = `${inc.priority}|${inc.state}|${sel}|${backup}|${pursuit}|${inc.code}|${c.lang}|${inc.escalated ?? false}|${dim}`;
      if (key !== rec.key && rec.removeAt === undefined) {
        rec.key = key;
        rec.inner.className =
          `epdm-inc epdm-p${inc.priority} epdm-is-${inc.state}` +
          (sel ? ' is-sel' : '') +
          (backup ? ' is-backup' : '') +
          (pursuit ? ' is-pursuit' : '') +
          (dim ? ' is-dim' : '');
        rec.code.textContent = inc.code;
        const title = inc.title?.[c.lang] || inc.title?.et || inc.code;
        const state = t(`map.incState.${inc.state}`, c.lang);
        rec.root.setAttribute('aria-label', `P${inc.priority} ${inc.code} · ${title} · ${state}`);
        rec.tip.innerHTML =
          `<b>P${inc.priority} · ${esc(inc.code)}</b> ${esc(title)}<br><span>${esc(inc.location.address ?? '')}</span>` +
          (backup ? `<em>${esc(t('map.backup', c.lang))}</em>` : '');
        rec.root.style.zIndex = String(sel ? 58 : backup ? 52 : closed ? 15 : 39 + (5 - inc.priority));
      }
      if (at && (!near(at[0], rec.lng, 1e-8) || !near(at[1], rec.lat, 1e-8))) {
        rec.lng = at[0];
        rec.lat = at[1];
        rec.marker.setLngLat(at);
      }
    }
    for (const [id, rec] of this.recs) {
      if (!this.seen.has(id) || (rec.removeAt !== undefined && realNow >= rec.removeAt)) {
        rec.marker.remove();
        this.recs.delete(id);
      }
    }
  }

  destroy(): void {
    for (const rec of this.recs.values()) rec.marker.remove();
    this.recs.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pursuit suspects
// ─────────────────────────────────────────────────────────────────────────────

interface SuspectRec {
  marker: Marker;
  dir: HTMLDivElement;
  lng: number;
  lat: number;
  rot: number;
}

export class SuspectMarkers {
  private recs = new Map<string, SuspectRec>();
  private seen = new Set<string>();

  constructor(
    private map: MlMap,
    private handlers: MarkerHandlers,
  ) {}

  sync(c: MarkerContext): void {
    const s = c.sim;
    this.seen.clear();
    for (const id of s.incidentOrder ?? Object.keys(s.incidents)) {
      const inc = s.incidents[id];
      const p = inc?.pursuit;
      if (!p?.suspectPos || p.ended || inc.state === 'closed' || isHidden(s, id)) continue;
      this.seen.add(id);
      const shown = c.suspectPos ? c.suspectPos(inc) : { pos: p.suspectPos, heading: p.heading ?? 0 };
      let rec = this.recs.get(id);
      if (!rec) {
        const root = makeRoot('suspect', () => this.handlers.onIncident(id));
        root.setAttribute('aria-label', t('map.suspect', c.lang));
        root.title = t('map.suspect', c.lang);
        root.style.zIndex = '57';
        root.innerHTML = `<div class="epdm-suspect"><span class="epdm-suspect__ring"></span><div class="epdm-suspect__car">${SUSPECT_GLYPH}</div></div>`;
        rec = {
          marker: new Marker({ element: root, anchor: 'center', subpixelPositioning: true }).setLngLat(shown.pos).addTo(this.map),
          dir: root.querySelector('.epdm-suspect__car') as HTMLDivElement,
          lng: shown.pos[0],
          lat: shown.pos[1],
          rot: NaN,
        };
        this.recs.set(id, rec);
      }
      const [lng, lat] = shown.pos;
      if (!near(lng, rec.lng, 1e-7) || !near(lat, rec.lat, 1e-7)) {
        rec.lng = lng;
        rec.lat = lat;
        rec.marker.setLngLat(shown.pos as LngLat);
      }
      const rot = (((shown.heading - c.bearing) % 360) + 360) % 360;
      if (!near(rot, rec.rot, 0.5)) {
        rec.rot = rot;
        rec.dir.style.transform = `rotate(${rot.toFixed(1)}deg)`;
      }
    }
    for (const [id, rec] of this.recs) {
      if (!this.seen.has(id)) {
        rec.marker.remove();
        this.recs.delete(id);
      }
    }
  }

  destroy(): void {
    for (const rec of this.recs.values()) rec.marker.remove();
    this.recs.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Other agencies' vehicles (agencies.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface AgencyRec {
  marker: Marker;
  root: HTMLDivElement;
  inner: HTMLDivElement;
  dir: HTMLDivElement;
  label: HTMLSpanElement;
  key: string;
  lng: number;
  lat: number;
  rot: number;
  off: [number, number];
  /** performance.now() at which the faded-out marker is removed. */
  removeAt?: number;
}

/** Ambulances and the rest: not units (never selectable as one); a click opens their incident. */
export class AgencyMarkers {
  private recs = new Map<string, AgencyRec>();
  private seen = new Set<string>();

  constructor(
    private map: MlMap,
    private handlers: MarkerHandlers,
  ) {}

  private create(v: AgencyVehicle): AgencyRec {
    const incId = v.incidentId;
    const root = makeRoot('agency', () => this.handlers.onIncident(incId));
    root.innerHTML =
      '<div class="epdm-ag"><span class="epdm-ag__ring"></span><div class="epdm-ag__dir"><i></i></div>' +
      `<span class="epdm-ag__body">${AGENCY_GLYPHS[v.agency] ?? ''}<span class="epdm-ag__bar"></span></span>` +
      '<span class="epdm-ag__label"></span></div>';
    const inner = root.firstElementChild as HTMLDivElement;
    const rec: AgencyRec = {
      marker: new Marker({ element: root, anchor: 'center', subpixelPositioning: true }).setLngLat(v.pos).addTo(this.map),
      root,
      inner,
      dir: inner.querySelector('.epdm-ag__dir') as HTMLDivElement,
      label: inner.querySelector('.epdm-ag__label') as HTMLSpanElement,
      key: '',
      lng: v.pos[0],
      lat: v.pos[1],
      rot: NaN,
      off: [0, 0],
    };
    this.recs.set(v.key, rec);
    return rec;
  }

  sync(c: MarkerContext, vehicles: readonly AgencyVehicle[], realNow: number): void {
    this.seen.clear();
    for (const v of vehicles) {
      this.seen.add(v.key);
      const rec = this.recs.get(v.key) ?? this.create(v);
      if (rec.removeAt !== undefined) {
        rec.removeAt = undefined;
        rec.key = '';
      }
      const moving = v.phase === 'enroute' || v.phase === 'leaving';
      const mins = v.phase === 'waiting' || v.phase === 'enroute' ? etaMinutes(v.eta) : 0;
      const key = `${v.phase}|${v.lights}|${mins}|${c.lang}`;
      if (key !== rec.key) {
        rec.key = key;
        rec.inner.className =
          `epdm-ag epdm-ag--${v.agency} is-${v.phase}` +
          (AGENCY_VEHICLES[v.agency]?.lights ? ' has-bar' : '') +
          (moving ? ' is-moving' : '') +
          (v.lights ? ' is-lights' : '');
        rec.label.textContent = t(`map.agencyTag.${v.agency}`, c.lang);
        const title = agencyTitle(v, c.lang);
        rec.root.title = title;
        rec.root.setAttribute('aria-label', title);
        // Under the units on a job (they are the player's), over idle ones; flashing lights above both.
        rec.root.style.zIndex = v.lights ? '45' : '34';
      }
      if (!near(v.pos[0], rec.lng, 1e-7) || !near(v.pos[1], rec.lat, 1e-7)) {
        rec.lng = v.pos[0];
        rec.lat = v.pos[1];
        rec.marker.setLngLat(v.pos);
      }
      if (moving) {
        const rot = (((v.heading - c.bearing) % 360) + 360) % 360;
        if (!near(rot, rec.rot, 0.4)) {
          rec.rot = rot;
          rec.dir.style.transform = `rotate(${rot.toFixed(1)}deg)`;
        }
      }
      const off = moving ? ZERO : (c.offsets.get(v.key) ?? ZERO);
      if (off[0] !== rec.off[0] || off[1] !== rec.off[1]) {
        rec.off = off;
        rec.marker.setOffset(off);
      }
    }
    // Gone (the incident closed, or the drive-off ended): fade out, then remove.
    for (const [id, rec] of this.recs) {
      if (this.seen.has(id)) continue;
      if (rec.removeAt === undefined) {
        rec.removeAt = realNow + FADE_MS;
        rec.inner.classList.add('is-gone');
      } else if (realNow >= rec.removeAt) {
        rec.marker.remove();
        this.recs.delete(id);
      }
    }
  }

  destroy(): void {
    for (const rec of this.recs.values()) rec.marker.remove();
    this.recs.clear();
  }
}
