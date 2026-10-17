// STUB — owned by engine-systems. Keep these signatures.
/** Sunrise/sunset (epoch ms) for the calendar day containing `t` at the given location (NOAA algorithm). */
export function sunTimes(t: number, _lat: number, _lon: number): { sunrise: number; sunset: number } {
  return { sunrise: t, sunset: t };
}
/** Solar altitude in degrees at time t. */
export function sunAltitude(_t: number, _lat: number, _lon: number): number {
  return 10;
}
