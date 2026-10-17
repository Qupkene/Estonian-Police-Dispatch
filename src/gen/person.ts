// STUB — owned by gen-people. Keep these signatures.
import type { Rng } from '@/sim/rng';
import type { Gender, LngLat, Person, PersonSpec, RegionDef, SpeakerLang } from '@/sim/types';

export interface PersonGenOptions {
  id: string;
  now: number;
  region: RegionDef;
  gender?: Gender;
  age?: [number, number];
  lang?: SpeakerLang;
  spec?: PersonSpec;
  home?: { address: string; city: string; coord?: LngLat };
  /** Last name to reuse (family members). */
  lastName?: string;
}

export function generatePerson(_rng: Rng, _o: PersonGenOptions): Person {
  throw new Error('generatePerson: not implemented');
}
