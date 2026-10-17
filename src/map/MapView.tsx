// STUB — owned by map. Keep these props.
import type { Lang, LngLat, RegionId, SimState } from '@/sim/types';
import type { MapStyleKey } from '@/store/settings';

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

export function MapView(_p: MapViewProps) {
  return <div style={{ width: '100%', height: '100%', background: '#0b1118' }} />;
}
