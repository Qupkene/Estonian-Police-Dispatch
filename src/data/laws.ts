// STUB — owned by registry-data. Keep these export names.
import type { Text } from '@/sim/types';

export interface Law {
  id: string; // e.g. 'kars_199'
  act: 'KarS' | 'LS' | 'KorS' | 'NPALS' | 'RelvS' | 'JahiS' | 'KeskkS' | 'VTMS';
  para: string; // '§ 199 lg 1'
  title: Text;
  kind: 'crime' | 'misdemeanour';
  /** Typical punishments used for generated records. */
  punishments: Text[];
  /** Tags for generators: 'violence', 'property', 'traffic', 'drugs', 'weapons', 'domestic', 'order'. */
  tags: string[];
}

export const LAWS: Law[] = [];
export function lawById(id: string): Law | undefined {
  return LAWS.find((l) => l.id === id);
}
