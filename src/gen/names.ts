// STUB — owned by gen-people. Keep these export names.
import type { Rng } from '@/sim/rng';
import type { Gender, SpeakerLang } from '@/sim/types';

export const EST_MALE: string[] = ['Toomas', 'Andres', 'Jüri'];
export const EST_FEMALE: string[] = ['Malle', 'Tiiu', 'Kadri'];
export const EST_SURNAMES: string[] = ['Tamm', 'Saar', 'Sepp'];
export const RU_MALE: string[] = ['Sergei'];
export const RU_FEMALE: string[] = ['Jelena'];
export const RU_SURNAMES: string[] = ['Ivanov'];
export const UA_MALE: string[] = ['Oleksandr'];
export const UA_FEMALE: string[] = ['Olena'];
export const UA_SURNAMES: string[] = ['Kovalenko'];
export const FARM_NAMES: string[] = ['Mäe'];

export function randomName(rng: Rng, lang: SpeakerLang, gender: Gender): { firstName: string; lastName: string } {
  return { firstName: rng.pick(gender === 'M' ? EST_MALE : EST_FEMALE), lastName: rng.pick(EST_SURNAMES) + (lang ? '' : '') };
}
