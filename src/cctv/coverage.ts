/**
 * Which incidents happen in sight of a surveillance camera, and what that camera is called (docs/CCTV.md
 * section 5). A place either has a camera or not, for good: the answer comes from the place alone (its kind and a
 * cell of about 40 m around its coordinate), so the same address shows the same camera in every shift and on every
 * player's screen.
 *
 * Pure and cheap: the queue and the incident card call it for every incident on every draw. No DOM, no three.js.
 */
import type { Incident, PlaceKind } from '@/sim/types';
import { hash01, hash32 } from './math';

export interface CameraInfo {
  /** The camera's number, "K-214". */
  id: string;
  /** The number and where the camera hangs: "K-214 · Narva mnt". */
  name: string;
  /** Seeds the street, where the camera hangs and its lens: the same place, the same picture. */
  seed: number;
}

/** How likely a place of each kind is to have a camera. */
export const CAMERA_CHANCE: Record<PlaceKind, number> = {
  gasstation: 0.95,
  bank: 0.95,
  government: 0.95,
  embassy: 0.95,
  airport: 0.95,
  mall: 0.9,
  trainstation: 0.9,
  busstation: 0.9,
  port: 0.9,
  hospital: 0.8,
  hotel: 0.8,
  prison: 0.8,
  border: 0.8,
  nightclub: 0.7,
  bar: 0.7,
  shop: 0.7,
  oldtown: 0.7,
  stadium: 0.7,
  concert: 0.7,
  museum: 0.7,
  parking: 0.55,
  school: 0.55,
  university: 0.55,
  office: 0.55,
  kindergarten: 0.55,
  street: 0.4,
  industrial: 0.4,
  construction: 0.4,
  highway: 0.4,
  residential: 0.25,
  park: 0.25,
  church: 0.25,
  house: 0.08,
  ruralroad: 0.08,
  beach: 0.08,
  cemetery: 0.08,
  forest: 0,
  lake: 0,
  farm: 0,
  summerhouse: 0,
  village: 0,
};

/** Cells per degree: 1/1500 of a degree of longitude and 1/3000 of latitude are both about 37 m in Estonia. */
const CELLS_LON = 1500;
const CELLS_LAT = 3000;
/** An incident closed without anyone having been sent has nothing to show this long after (game milliseconds). */
const EMPTY_AFTER_MS = 5 * 60_000;

/**
 * Where an address is, without what tells one door from the next: "Narva mnt 25" and "Tartu mnt 87f-12" are
 * "Narva mnt" and "Tartu mnt", "Viru väljak 4/6" is "Viru väljak", "Kuusiku-Alu tee, 3. km, Rapla maakond" is
 * "Kuusiku-Alu tee", "Aruküla alevik, Harju maakond" is "Aruküla alevik". A number that opens a name stays
 * ("1. liin 12" is "1. liin").
 */
export function streetOfAddress(address: string): string {
  const first = address
    .split(',')[0]
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
  // The house number closes the address: digits, perhaps a letter, perhaps a second house or a flat ("4/6", "87f-12").
  return first.replace(/\s+\d+\s?[a-zõäöü]?(?:\s?[/-]\s?\d+\s?[a-zõäöü]?)*$/i, '').trim() || first;
}

function whereOf(location: Incident['location']): string {
  if (location.placeName) return location.placeName;
  // The cameras along the main roads are the Transport Administration's road cameras.
  if (location.placeKind === 'highway') return 'Teekaamera';
  return streetOfAddress(location.address) || location.city;
}

/**
 * The camera that sees an incident, or null when its place has none. `now` is the game's clock: with it, an
 * incident that was closed from the desk (a referral, advice by phone, a prank, a duplicate, one that ran out)
 * without any unit ever sent loses its camera five game minutes after it closed, when the people have gone.
 */
export function cameraOf(
  incident: Pick<Incident, 'id' | 'location' | 'state' | 'closedAt' | 'closedBy' | 'unitHistory'>,
  now?: number,
): CameraInfo | null {
  const { location } = incident;
  const chance = CAMERA_CHANCE[location.placeKind] ?? 0;
  if (chance <= 0) return null;
  const cx = Math.round(location.coord[0] * CELLS_LON);
  const cy = Math.round(location.coord[1] * CELLS_LAT);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  if (hash01('cam', location.placeKind, cx, cy) >= chance) return null;
  if (
    incident.state === 'closed' &&
    incident.closedBy !== undefined &&
    incident.unitHistory.length === 0 &&
    now !== undefined &&
    incident.closedAt !== undefined &&
    now - incident.closedAt > EMPTY_AFTER_MS
  ) {
    return null;
  }
  const seed = hash32('site', cx, cy);
  const id = `K-${100 + (seed % 900)}`;
  return { id, name: `${id} · ${whereOf(location)}`, seed };
}
