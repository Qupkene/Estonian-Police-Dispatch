/** A tiny self-contained prefecture for engine-core tests (mocked in as REGIONS.pohja). */
import type { RegionDef } from '@/sim/types';

export const MINI_REGION: RegionDef = {
  id: 'pohja',
  name: { et: 'Testi prefektuur', en: 'Test Prefecture' },
  short: 'TEST',
  hqCity: 'Testlinn',
  counties: ['Testi maakond'],
  center: [24.75, 59.437],
  zoom: 10,
  bounds: [
    [21.5, 57.5],
    [28.3, 59.8],
  ],
  description: { et: 'Testpiirkond', en: 'Test region' },
  callVolume: 6,
  zones: [
    { id: 'mainland', name: { et: 'Mandriosa', en: 'Mainland' }, ferryMinutes: 0 },
    { id: 'saar', name: { et: 'Saar', en: 'Island' }, ferryMinutes: 60 },
    { id: 'kalju', name: { et: 'Kalju', en: 'Rock' }, ferryMinutes: null },
  ],
  stations: [
    { id: 'st_hq', name: { et: 'Testlinna peamaja', en: 'Testlinn HQ' }, short: 'HQ', kind: 'hq', city: 'Testlinn', address: 'Pärnu mnt 139', coord: [24.75, 59.437] },
    { id: 'st_east', name: { et: 'Ida jaoskond', en: 'East station' }, short: 'Ida PJ', kind: 'station', city: 'Testlinn', address: 'P. Pinna tn 4', coord: [24.85, 59.43] },
    { id: 'st_arrest', name: { et: 'Testlinna arestimaja', en: 'Testlinn arrest house' }, short: 'AM', kind: 'arrest', city: 'Testlinn', address: 'Rahumäe tee 6', coord: [24.7, 59.42] },
    { id: 'st_air', name: { et: 'Lennusalk', en: 'Air unit' }, short: 'Lennusalk', kind: 'airbase', city: 'Testlinn', address: 'Lennujaama tee 13', coord: [24.8, 59.415] },
    { id: 'st_saar', name: { et: 'Saare jaoskond', en: 'Island station' }, short: 'Saare PJ', kind: 'station', city: 'Saarelinn', address: 'Transvaali tn 58', coord: [22.5, 58.25], zone: 'saar' },
  ],
  arrestHouseId: 'st_arrest',
  roster: [
    { callsign: '21', type: 'patrol', stationId: 'st_hq', vehicle: 'Škoda Octavia', crew: 2 },
    { callsign: '22', type: 'patrol', stationId: 'st_hq', vehicle: 'Škoda Octavia', crew: 2 },
    { callsign: '23', type: 'patrol', stationId: 'st_east', vehicle: 'Škoda Octavia', crew: 2 },
    { callsign: '24', type: 'patrol', stationId: 'st_east', vehicle: 'Škoda Octavia', crew: 2, shift: 'night' },
    { callsign: '25', type: 'patrol', stationId: 'st_east', vehicle: 'Škoda Octavia', crew: 2, minDifficulty: 'veteran' },
    { callsign: 'K-31', type: 'rapid', stationId: 'st_hq', vehicle: 'VW Passat', crew: 2 },
    { callsign: 'KOER-1', type: 'k9', stationId: 'st_east', vehicle: 'VW Transporter', crew: 1 },
    {
      callsign: '26',
      type: 'patrol',
      stationId: 'st_hq',
      vehicle: 'Škoda Octavia',
      crew: 2,
      crewNames: [{ firstName: 'Toomas', lastName: 'Legend', badge: '085', gender: 'M' }],
    },
    { callsign: 'KOPTER 1', type: 'heli', stationId: 'st_air', vehicle: 'AW139', crew: 3, onCall: true },
    { callsign: 'S-1', type: 'patrol', stationId: 'st_saar', vehicle: 'Škoda Octavia', crew: 2, zone: 'saar' },
  ],
  towns: [
    { name: 'Testlinn', county: 'Testi maakond', coord: [24.75, 59.437], population: 400_000, ruShare: 0.3 },
    { name: 'Külaküla', county: 'Testi maakond', coord: [25.25, 59.2], population: 800, ruShare: 0.05 },
    { name: 'Saarelinn', county: 'Saare maakond', coord: [22.5, 58.25], population: 13_000, ruShare: 0.02, zone: 'saar' },
  ],
  streets: [
    { id: 's1', name: 'Punane tn', city: 'Testlinn', district: 'Lasnamäe', points: [[24.83, 59.435], [24.845, 59.44]], houses: [1, 60], kind: 'apartment' },
    { id: 's2', name: 'Pärnu mnt', city: 'Testlinn', district: 'Kesklinn', points: [[24.745, 59.435], [24.73, 59.42]], houses: [1, 200], kind: 'mixed' },
    { id: 's3', name: 'Mere pst', city: 'Testlinn', district: 'Kesklinn', points: [[24.755, 59.44], [24.76, 59.437]], houses: [1, 30], kind: 'commercial' },
  ],
  places: [
    { id: 'pl_hosp', name: 'Testlinna haigla', kind: 'hospital', city: 'Testlinn', address: 'J. Sütiste tee 19', coord: [24.72, 59.43] },
    { id: 'pl_bar', name: 'Pubi Vana Kass', kind: 'bar', city: 'Testlinn', address: 'Mere pst 5', coord: [24.756, 59.439] },
    { id: 'pl_shop', name: 'Kaubanduskeskus', kind: 'mall', city: 'Testlinn', address: 'Punane tn 46', coord: [24.84, 59.437] },
    { id: 'pl_rock', name: 'Kaljusaar', kind: 'forest', city: 'Kalju', address: 'Kaljusaar', coord: [23.0, 59.6], zone: 'kalju' },
    { id: 'pl_saar', name: 'Saarelinna sadam', kind: 'port', city: 'Saarelinn', address: 'Sadama tn 1', coord: [22.51, 58.25], zone: 'saar' },
  ],
  radioName: 'Põhja',
  commander: { name: 'Mati Testija', title: { et: 'politseikolonel', en: 'police colonel' }, badge: '001', gender: 'M' },
};
