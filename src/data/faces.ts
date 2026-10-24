/**
 * Photo portraits for made-up people in the registry (2.33.0): synthetic StyleGAN2 faces from
 * thispersondoesnotexist.com, nobody real. Each was labelled automatically (InsightFace for sex and age, the
 * pixels above the forehead for the hair colour and baldness, the chin for a beard, the cheek skin's ITA angle
 * for the tone) and is served from public/faces/<id>.webp at 256 px. src/gen/face.ts picks one that fits a person.
 * Generated; edit the collection, not this file.
 */
import type { Appearance, Gender } from '@/sim/types';

export type FaceTone = 'light' | 'medium' | 'dark';

export interface FaceDef {
  id: string;
  gender: Gender;
  age: number;
  hair: Appearance['hairColor'];
  bald: boolean;
  beard: boolean;
  tone: FaceTone;
}

type Row = [string, Gender, number, Appearance['hairColor'], 0 | 1, 0 | 1, 'l' | 'm' | 'd'];

const ROWS: Row[] = [];

const TONE: Record<Row[6], FaceTone> = { l: 'light', m: 'medium', d: 'dark' };

export const FACES: FaceDef[] = ROWS.map(([id, gender, age, hair, bald, beard, tone]) => ({
  id,
  gender,
  age,
  hair,
  bald: bald === 1,
  beard: beard === 1,
  tone: TONE[tone],
}));
