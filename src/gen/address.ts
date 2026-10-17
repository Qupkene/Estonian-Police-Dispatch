// STUB — owned by gen-people. Keep these signatures.
import type { Rng } from '@/sim/rng';
import type { IncidentLocation, LngLat, PlaceKind, RegionDef, SpeakerLang } from '@/sim/types';

/** Pick an incident location in the region for one of the given place kinds (see DESIGN §4.2). */
export function pickLocation(_rng: Rng, _region: RegionDef, _kinds: PlaceKind[]): IncidentLocation {
  throw new Error('pickLocation: not implemented');
}

/** A plausible home address for a resident (Russian speakers skew to towns with high ruShare). */
export function homeAddress(
  _rng: Rng,
  _region: RegionDef,
  _lang?: SpeakerLang,
): { address: string; city: string; coord: LngLat } {
  throw new Error('homeAddress: not implemented');
}
