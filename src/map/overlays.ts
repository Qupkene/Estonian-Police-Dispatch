/**
 * Pure builders for the GeoJSON overlay sources (routes, pursuit trails, search areas, heat,
 * stations). MapView calls them at ≤ 10 Hz with the live SimState. No DOM imports.
 */
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import type { Incident, Lang, LngLat, Priority, RegionDef, SimState, Unit } from '@/sim/types';

export type PosFn = (u: Unit) => { pos: LngLat; heading: number };
/** Remaining path of a moving unit from its current shown position (see remainingPath). */
export type RemainingFn = (u: Unit, now: number, current: LngLat) => LngLat[];
/** Where an incident is shown (the road layer may move it onto a building); null = not decided yet. */
export type IncCoordFn = (inc: Incident) => LngLat | null;
/** Where a pursued vehicle is shown (the road layer drives it along the roads). */
export type SuspectPosFn = (inc: Incident) => { pos: LngLat; heading: number };
/** A pursuit's trail as shown on the map (null = the engine's own trail). */
export type TrailFn = (inc: Incident) => LngLat[] | null;
/** Where a pursuit ended on the map (null = still being looked up). */
export type PursuitEndFn = (inc: Incident) => LngLat | null;

const R_KM = 6371.0088;
const RAD = Math.PI / 180;

/** Closed 64-gon (or n-gon) approximating a geodesic circle (turf-free). */
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
export function buildRoutes(
  s: SimState,
  pos: PosFn,
  selectedIncidentId?: string,
  selectedUnitId?: string,
  remaining: RemainingFn = remainingPath,
): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  const now = s.now;
  const push = (u: Unit, kind: 'incident' | 'selected') => {
    if (!isMoving(u, now)) return;
    const coords = remaining(u, now, pos(u).pos);
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

/** Active pursuits: the suspect's trail ending at its current position (along the roads when shown so). */
export function buildPursuits(s: SimState, trailOf?: TrailFn): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  for (const id of s.incidentOrder) {
    const inc = s.incidents[id];
    const p = inc?.pursuit;
    if (!p?.suspectPos || p.ended || inc.state === 'closed' || isHidden(s, id)) continue;
    const road = trailOf?.(inc);
    const coords = road && road.length >= 2 ? road : [...(p.trail ?? []).slice(-120), p.suspectPos];
    if (coords.length < 2) continue;
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { id } });
  }
  return { type: 'FeatureCollection', features };
}

const sameCoord = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];

/** Area-search circles with progress (0..1) for the fill opacity. */
export function buildSearches(s: SimState, incCoord?: IncCoordFn, pursuitEnd?: PursuitEndFn): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = [];
  for (const id of s.incidentOrder) {
    const inc = s.incidents[id];
    const sr = inc?.search;
    if (!sr?.center || inc.state === 'closed' || isHidden(s, id)) continue;
    let center = sr.center;
    if (incCoord && inc.location?.coord && sameCoord(sr.center, inc.location.coord)) {
      // A search centred on the incident follows its marker.
      center = incCoord(inc) ?? sr.center;
    } else if (pursuitEnd && inc.pursuit?.suspectPos && sameCoord(sr.center, inc.pursuit.suspectPos)) {
      // A search where the pursuit ended goes around where the vehicle was last shown (on the road).
      const end = pursuitEnd(inc);
      if (!end) continue;
      center = end;
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [circlePolygon(center, Math.max(0.05, sr.radiusKm))] },
      properties: { id, progress: Math.max(0, Math.min(1, sr.progress)), found: !!sr.found },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Every incident of the shift as a weighted point for the heat layer. */
export function buildHeat(s: SimState, incCoord?: IncCoordFn): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];
  for (const id of s.incidentOrder) {
    const inc: Incident | undefined = s.incidents[id];
    if (!inc?.location?.coord || isHidden(s, id) || inc.closedBy === 'duplicate' || inc.closedBy === 'prank') continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: (incCoord && incCoord(inc)) || inc.location.coord },
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
 * Pixel offsets that stack co-located stationary units into a tidy column (several cars parked at
 * one station, units on scene at the same incident, or any other pile-up) so each marker and its
 * callsign label stays readable and clickable.
 *  - `scene`: units on scene line up to the right of the incident diamond.
 *  - `station`: units parked at their station stack upwards, right of the station icon (its label
 *    sits below the icon).
 *  - otherwise units within ~40 m of each other form a column centred on the spot.
 */
export function declutterOffsets(
  items: { id: string; pos: LngLat; moving: boolean; scene?: string; station?: string }[],
  rowPx = 24,
): Map<string, [number, number]> {
  const groups = new Map<string, string[]>();
  for (const it of items) {
    if (it.moving) continue;
    const k = it.scene
      ? `scene:${it.scene}`
      : it.station
        ? `station:${it.station}`
        : `${Math.round(it.pos[0] * 1500)}:${Math.round(it.pos[1] * 2500)}`;
    const g = groups.get(k);
    if (g) g.push(it.id);
    else groups.set(k, [it.id]);
  }
  const out = new Map<string, [number, number]>();
  for (const [k, ids] of groups) {
    ids.sort();
    const n = ids.length;
    if (k.startsWith('scene:')) {
      ids.forEach((id, i) => out.set(id, [30, Math.round((i - (n - 1) / 2) * rowPx)]));
    } else if (k.startsWith('station:')) {
      ids.forEach((id, i) => out.set(id, [24, -i * rowPx]));
    } else if (n > 1) {
      ids.forEach((id, i) => out.set(id, [0, Math.round((i - (n - 1) / 2) * rowPx)]));
    }
  }
  return out;
}
