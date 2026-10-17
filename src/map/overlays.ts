/**
 * Pure builders for the GeoJSON overlay sources (routes, pursuit trails, search areas, heat,
 * stations). MapView calls them at ≤ 10 Hz with the live SimState. No DOM imports.
 */
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import type { Incident, Lang, LngLat, Priority, RegionDef, SimState, Unit } from '@/sim/types';

export type PosFn = (u: Unit) => { pos: LngLat; heading: number };

const R_KM = 6371.0088;
const RAD = Math.PI / 180;

/** Closed 64-gon (or n-gon) approximating a geodesic circle — turf-free. */
export function circlePolygon(center: LngLat, radiusKm: number, n = 64): LngLat[] {
  const out: LngLat[] = [];
  const lat1 = center[1] * RAD;
  const lon1 = center[0] * RAD;
  const d = radiusKm / R_KM;
  for (let i = 0; i < n; i++) {
    const br = (i / n) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
    const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    out.push([lon2 / RAD, lat2 / RAD]);
  }
  out.push(out[0]);
  return out;
}

/** Is the unit currently travelling along its movement path? */
export function isMoving(u: Unit, now: number): boolean {
  const m = u.move;
  return !!m && m.path.length > 1 && now < m.arriveAt;
}

/**
 * The part of a unit's movement path still ahead of it: current position followed by the
 * remaining vertices. Empty when the unit is not moving.
 */
export function remainingPath(u: Unit, now: number, current: LngLat): LngLat[] {
  const m = u.move;
  if (!m || m.path.length < 2 || now >= m.arriveAt) return [];
  const total = m.cum[m.cum.length - 1] ?? 0;
  const span = Math.max(1, m.arriveAt - m.departAt);
  const f = Math.min(1, Math.max(0, (now - m.departAt) / span));
  const d = f * total;
  let i = 1;
  while (i < m.cum.length - 1 && m.cum[i] <= d) i++;
  return [current, ...m.path.slice(i)];
}

const PRIO_WEIGHT: Record<Priority, number> = { 1: 1, 2: 0.7, 3: 0.45, 4: 0.25 };

export const isHidden = (s: SimState, id: string) => !!s.flags?.[`hidden:${id}`];

/** Route lines of units heading to the selected incident plus the selected unit's own path. */
export function buildRoutes(s: SimState, pos: PosFn, selectedIncidentId?: string, selectedUnitId?: string): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  const now = s.now;
  const push = (u: Unit, kind: 'incident' | 'selected') => {
    if (!isMoving(u, now)) return;
    const coords = remainingPath(u, now, pos(u).pos);
    if (coords.length < 2) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { id: u.id, kind, siren: !!u.move?.siren },
    });
  };
  if (selectedIncidentId) {
    const inc = s.incidents[selectedIncidentId];
    if (inc && inc.state !== 'closed') {
      const ids = new Set(inc.assigned);
      for (const id of s.unitOrder) {
        const u = s.units[id];
        if (!u || id === selectedUnitId) continue;
        if (ids.has(id) || u.incidentId === selectedIncidentId) push(u, 'incident');
      }
    }
  }
  if (selectedUnitId) {
    const u = s.units[selectedUnitId];
    if (u) push(u, 'selected');
  }
  return { type: 'FeatureCollection', features };
}

/** Active pursuits: the suspect's trail ending at its current position. */
export function buildPursuits(s: SimState): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  for (const id of s.incidentOrder) {
    const inc = s.incidents[id];
    const p = inc?.pursuit;
    if (!p || p.ended || inc.state === 'closed' || isHidden(s, id)) continue;
    const coords = [...(p.trail ?? []).slice(-120), p.suspectPos];
    if (coords.length < 2) continue;
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { id } });
  }
  return { type: 'FeatureCollection', features };
}

/** Area-search circles with progress (0..1) for the fill opacity. */
export function buildSearches(s: SimState): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = [];
  for (const id of s.incidentOrder) {
    const inc = s.incidents[id];
    const sr = inc?.search;
    if (!sr || inc.state === 'closed' || isHidden(s, id)) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [circlePolygon(sr.center, Math.max(0.05, sr.radiusKm))] },
      properties: { id, progress: Math.max(0, Math.min(1, sr.progress)), found: !!sr.found },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Every incident of the shift as a weighted point for the heat layer. */
export function buildHeat(s: SimState): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];
  for (const id of s.incidentOrder) {
    const inc: Incident | undefined = s.incidents[id];
    if (!inc || isHidden(s, id) || inc.closedBy === 'duplicate' || inc.closedBy === 'prank') continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: inc.location.coord },
      properties: { w: PRIO_WEIGHT[inc.truePriority ?? inc.priority] ?? 0.4 },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Police stations of the region as labelled points. */
export function buildStations(region: RegionDef | undefined, lang: Lang): FeatureCollection<Point> {
  const features: Feature<Point>[] = (region?.stations ?? []).map((st) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: st.coord },
    properties: { id: st.id, short: st.short, name: st.name?.[lang] || st.name?.et || st.short, kind: st.kind },
  }));
  return { type: 'FeatureCollection', features };
}

/**
 * Pixel offsets that fan out stacked stationary units (several cars parked at one station, or
 * units on scene at the same incident) so each marker stays clickable.
 */
export function declutterOffsets(
  items: { id: string; pos: LngLat; moving: boolean; scene?: string }[],
  radiusPx = 17,
): Map<string, [number, number]> {
  const groups = new Map<string, string[]>();
  for (const it of items) {
    if (it.moving) continue;
    // Units on scene orbit their incident marker; others are bucketed at ~40 m.
    const k = it.scene ? `scene:${it.scene}` : `${Math.round(it.pos[0] * 1500)}:${Math.round(it.pos[1] * 2500)}`;
    const g = groups.get(k);
    if (g) g.push(it.id);
    else groups.set(k, [it.id]);
  }
  const out = new Map<string, [number, number]>();
  for (const [k, ids] of groups) {
    ids.sort();
    const n = ids.length;
    if (k.startsWith('scene:')) {
      // Fan out to the right of the incident diamond, starting up-right.
      const r = 30 + Math.max(0, n - 5) * 4;
      const step = Math.min(48, 300 / Math.max(1, n)) * (Math.PI / 180);
      ids.forEach((id, i) => {
        const a = -Math.PI / 4 + i * step;
        out.set(id, [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]);
      });
      continue;
    }
    if (n < 2) continue;
    const r = radiusPx + Math.max(0, n - 4) * 3.5;
    ids.forEach((id, i) => {
      const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
      out.set(id, [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]);
    });
  }
  return out;
}
