// STUB — owned by engine-systems. Keep these signatures.
import type { Rng } from './rng';
import type { SimState, Weather } from './types';

export function initialWeather(_rng: Rng, _t: number, _kind?: Weather['kind']): Weather {
  return { kind: 'clear', tempC: 5, windMs: 3, roadFactor: 1, text: { et: 'Selge', en: 'Clear' } };
}
/** Called every game hour: slowly drift weather. */
export function updateWeather(_s: SimState): void {}
