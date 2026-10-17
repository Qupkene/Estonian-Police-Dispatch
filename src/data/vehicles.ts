/**
 * Vehicle registry data: models reflecting the Estonian fleet, colours, insurers, WMI codes and
 * fictional fleet owners. Owned by registry-data.
 *
 * Weights are relative *within a vehicle kind* (the generator picks the kind first). They follow
 * the shape of the Estonian registered fleet (Toyota, VW, Škoda, Audi, Volvo, BMW on top; many
 * 10–20-year-old Avensis/Passat/Octavia/V70 wagons) from prior knowledge, not an official
 * statistics pull. `theft` is relative theft attractiveness (Land Cruiser, Lexus, RAV4 highest,
 * since keyless relay thefts are a well-known problem in Estonia).
 */
import type { Text, VehicleKind } from '@/sim/types';

export interface CarModel {
  make: string;
  model: string;
  kind: VehicleKind;
  weight: number;
  years: [number, number];
  /** Relative theft attractiveness. */
  theft?: number;
  /** Model-specific VIN WMI codes (else MAKE_WMI[make]). */
  wmi?: string[];
  /** Estonian colour name this model is strongly associated with (KTM → 'oranž'). */
  color?: string;
}

type Opt = { theft?: number; wmi?: string[]; color?: string };
const NOW_Y = 2026;

function m(make: string, model: string, kind: VehicleKind, weight: number, from: number, to: number = NOW_Y, o: Opt = {}): CarModel {
  const out: CarModel = { make, model, kind, weight, years: [from, to] };
  if (o.theft !== undefined) out.theft = o.theft;
  if (o.wmi) out.wmi = o.wmi;
  if (o.color) out.color = o.color;
  return out;
}
const car = (make: string, model: string, w: number, from: number, to?: number, o?: Opt) => m(make, model, 'car', w, from, to, o);
const van = (make: string, model: string, w: number, from: number, to?: number, o?: Opt) => m(make, model, 'van', w, from, to, o);
const truck = (make: string, model: string, w: number, from: number, to?: number, o?: Opt) => m(make, model, 'truck', w, from, to, o);
const bus = (make: string, model: string, w: number, from: number, to?: number, o?: Opt) => m(make, model, 'bus', w, from, to, o);
const moto = (make: string, model: string, w: number, from: number, to?: number, o?: Opt) => m(make, model, 'moto', w, from, to, o);
const moped = (make: string, model: string, w: number, from: number, to?: number, o?: Opt) => m(make, model, 'moped', w, from, to, o);
const quad = (make: string, model: string, w: number, from: number, to?: number, o?: Opt) => m(make, model, 'quad', w, from, to, o);

export const CAR_MODELS: CarModel[] = [
  // ── Toyota ───────────────────────────────────────────────────────────────
  car('Toyota', 'Avensis', 30, 1997, 2018, { theft: 1.1, wmi: ['SB1', 'JTD'] }),
  car('Toyota', 'Corolla', 28, 1992, NOW_Y, { theft: 1.3, wmi: ['SB1', 'NMT', 'JTD'] }),
  car('Toyota', 'RAV4', 26, 1995, NOW_Y, { theft: 2.4, wmi: ['JTM'] }),
  car('Toyota', 'Auris', 14, 2007, 2018, { theft: 1.1, wmi: ['SB1', 'NMT'] }),
  car('Toyota', 'Yaris', 12, 1999, NOW_Y, { wmi: ['VNK'] }),
  car('Toyota', 'Land Cruiser', 9, 1996, NOW_Y, { theft: 3.2, wmi: ['JTE', 'JTM'] }),
  car('Toyota', 'Prius', 5, 2004, 2023, { theft: 1.2, wmi: ['JTD'] }),
  car('Toyota', 'C-HR', 6, 2016, NOW_Y, { theft: 1.8, wmi: ['NMT'] }),
  car('Toyota', 'Camry', 3, 2019, NOW_Y, { theft: 1.6, wmi: ['JTN'] }),
  car('Toyota', 'Hilux', 4, 1998, NOW_Y, { theft: 2.0, wmi: ['AHT'] }),
  car('Toyota', 'Aygo', 2, 2005, 2022, { wmi: ['JTD'] }),
  car('Toyota', 'bZ4X', 0.5, 2022, NOW_Y, { wmi: ['JTM'] }),
  // ── Lexus ────────────────────────────────────────────────────────────────
  car('Lexus', 'RX', 5, 1998, NOW_Y, { theft: 2.8, wmi: ['JTJ'] }),
  car('Lexus', 'IS', 3, 1999, NOW_Y, { theft: 1.8, wmi: ['JTH'] }),
  car('Lexus', 'NX', 3, 2014, NOW_Y, { theft: 2.6, wmi: ['JTJ'] }),
  car('Lexus', 'GS', 1, 1998, 2020, { theft: 1.6, wmi: ['JTH'] }),
  car('Lexus', 'LX', 0.6, 2008, NOW_Y, { theft: 3.2, wmi: ['JTJ'] }),
  car('Lexus', 'UX', 0.5, 2018, NOW_Y, { theft: 1.8, wmi: ['JTH'] }),
  car('Lexus', 'ES', 0.4, 2018, NOW_Y, { theft: 1.8, wmi: ['JTH'] }),
  // ── Volkswagen ───────────────────────────────────────────────────────────
  car('Volkswagen', 'Passat', 38, 1996, NOW_Y, { theft: 1.1 }),
  car('Volkswagen', 'Golf', 30, 1992, NOW_Y, { theft: 1.1 }),
  car('Volkswagen', 'Touran', 10, 2003, NOW_Y),
  car('Volkswagen', 'Tiguan', 12, 2007, NOW_Y, { theft: 1.3, wmi: ['WVG'] }),
  car('Volkswagen', 'Polo', 8, 1995, NOW_Y),
  car('Volkswagen', 'Sharan', 6, 1996, 2022),
  car('Volkswagen', 'Touareg', 6, 2002, NOW_Y, { theft: 1.6, wmi: ['WVG'] }),
  car('Volkswagen', 'Jetta', 3, 2005, 2018),
  car('Volkswagen', 'Arteon', 1, 2017, NOW_Y),
  car('Volkswagen', 'T-Roc', 2, 2017, NOW_Y, { wmi: ['WVG'] }),
  car('Volkswagen', 'ID.4', 2, 2020, NOW_Y, { theft: 0.6, wmi: ['WVG'] }),
  car('Volkswagen', 'Amarok', 1.5, 2010, NOW_Y, { theft: 1.4, wmi: ['WV1'] }),
  // ── Škoda ────────────────────────────────────────────────────────────────
  car('Škoda', 'Octavia', 45, 1996, NOW_Y, { theft: 1.1 }),
  car('Škoda', 'Superb', 18, 2001, NOW_Y, { theft: 1.2 }),
  car('Škoda', 'Fabia', 10, 2000, NOW_Y),
  car('Škoda', 'Kodiaq', 5, 2016, NOW_Y, { theft: 1.3 }),
  car('Škoda', 'Karoq', 3, 2017, NOW_Y),
  car('Škoda', 'Rapid', 2, 2012, 2019),
  car('Škoda', 'Enyaq', 2, 2020, NOW_Y, { theft: 0.6 }),
  car('Škoda', 'Kamiq', 1, 2019, NOW_Y),
  car('Škoda', 'Scala', 0.6, 2019, NOW_Y),
  car('Škoda', 'Felicia', 0.8, 1994, 2001, { theft: 0.6 }),
  // ── Audi ─────────────────────────────────────────────────────────────────
  car('Audi', 'A4', 20, 1995, NOW_Y, { theft: 1.2 }),
  car('Audi', 'A6', 18, 1994, NOW_Y, { theft: 1.4 }),
  car('Audi', 'Q5', 6, 2008, NOW_Y, { theft: 1.5, wmi: ['WA1', 'WAU'] }),
  car('Audi', 'Q7', 5, 2006, NOW_Y, { theft: 1.7, wmi: ['WA1', 'WAU'] }),
  car('Audi', 'A3', 6, 1996, NOW_Y),
  car('Audi', 'A8', 2, 2002, NOW_Y, { theft: 1.5 }),
  car('Audi', 'Q3', 1.5, 2011, NOW_Y),
  car('Audi', '80', 0.8, 1986, 1995, { theft: 0.6 }),
  car('Audi', 'Q8 e-tron', 0.8, 2019, NOW_Y, { theft: 0.7, wmi: ['WA1'] }),
  // ── BMW ──────────────────────────────────────────────────────────────────
  car('BMW', '320d', 12, 1998, NOW_Y, { theft: 1.3 }),
  car('BMW', '318i', 4, 1991, 2019, { theft: 1.1 }),
  car('BMW', '330d', 3, 1999, NOW_Y, { theft: 1.5 }),
  car('BMW', '520d', 13, 2000, NOW_Y, { theft: 1.4 }),
  car('BMW', '530d', 6, 1998, NOW_Y, { theft: 1.6 }),
  car('BMW', 'X3', 5, 2003, NOW_Y, { theft: 1.4, wmi: ['WBX', '5UX'] }),
  car('BMW', 'X5', 8, 2000, NOW_Y, { theft: 1.9, wmi: ['5UX'] }),
  car('BMW', 'X6', 1.5, 2008, NOW_Y, { theft: 1.9, wmi: ['5UX'] }),
  car('BMW', '116i', 2, 2004, NOW_Y),
  car('BMW', '740d', 1.5, 2001, NOW_Y, { theft: 1.6 }),
  car('BMW', 'X1', 1.5, 2009, NOW_Y),
  car('BMW', 'i3', 0.6, 2013, 2022, { theft: 0.5, wmi: ['WBY'] }),
  // ── Volvo ────────────────────────────────────────────────────────────────
  car('Volvo', 'V70', 18, 1996, 2016),
  car('Volvo', 'V60', 9, 2010, NOW_Y),
  car('Volvo', 'XC60', 9, 2008, NOW_Y, { theft: 1.4, wmi: ['YV4', 'YV1'] }),
  car('Volvo', 'XC90', 8, 2002, NOW_Y, { theft: 1.6, wmi: ['YV4', 'YV1'] }),
  car('Volvo', 'S60', 4, 2000, NOW_Y),
  car('Volvo', 'S80', 4, 1998, 2016),
  car('Volvo', 'V40', 3, 1996, 2019),
  car('Volvo', 'XC70', 3, 2000, 2016, { wmi: ['YV1'] }),
  car('Volvo', 'V90', 1.5, 2016, NOW_Y),
  car('Volvo', 'XC40', 1.5, 2017, NOW_Y, { wmi: ['YV1'] }),
  // ── Mercedes-Benz ────────────────────────────────────────────────────────
  car('Mercedes-Benz', 'C-klass', 14, 1993, NOW_Y, { theft: 1.3, wmi: ['WDD', 'W1K'] }),
  car('Mercedes-Benz', 'E-klass', 16, 1995, NOW_Y, { theft: 1.4, wmi: ['WDD', 'W1K'] }),
  car('Mercedes-Benz', 'S-klass', 2, 1998, NOW_Y, { theft: 1.6, wmi: ['WDD', 'W1K'] }),
  car('Mercedes-Benz', 'A-klass', 3, 1997, NOW_Y, { wmi: ['WDD', 'W1K'] }),
  car('Mercedes-Benz', 'B-klass', 2, 2005, NOW_Y, { wmi: ['WDD', 'W1K'] }),
  car('Mercedes-Benz', 'ML', 3, 1997, 2015, { theft: 1.5, wmi: ['4JG'] }),
  car('Mercedes-Benz', 'GLE', 2, 2015, NOW_Y, { theft: 1.7, wmi: ['4JG', 'W1N'] }),
  car('Mercedes-Benz', 'GLC', 3, 2015, NOW_Y, { theft: 1.5, wmi: ['WDC', 'W1N'] }),
  car('Mercedes-Benz', 'CLA', 1, 2013, NOW_Y, { wmi: ['WDD', 'W1K'] }),
  car('Mercedes-Benz', 'G-klass', 0.4, 1990, NOW_Y, { theft: 2.6, wmi: ['WDB', 'W1N'] }),
  // ── Opel ─────────────────────────────────────────────────────────────────
  car('Opel', 'Astra', 20, 1991, NOW_Y),
  car('Opel', 'Zafira', 10, 1999, 2019),
  car('Opel', 'Insignia', 8, 2008, 2022),
  car('Opel', 'Vectra', 7, 1995, 2008, { theft: 0.8 }),
  car('Opel', 'Corsa', 5, 1993, NOW_Y),
  car('Opel', 'Meriva', 1.5, 2003, 2017),
  car('Opel', 'Mokka', 1, 2012, NOW_Y),
  // ── Ford ─────────────────────────────────────────────────────────────────
  car('Ford', 'Focus', 20, 1998, 2025),
  car('Ford', 'Mondeo', 13, 1993, 2022),
  car('Ford', 'Kuga', 5, 2008, NOW_Y),
  car('Ford', 'Fiesta', 4, 1995, 2023),
  car('Ford', 'S-Max', 3, 2006, 2023),
  car('Ford', 'Ranger', 1.5, 2012, NOW_Y, { theft: 1.4, wmi: ['AFA'] }),
  car('Ford', 'Mustang', 0.5, 2015, NOW_Y, { theft: 1.5, wmi: ['1FA'] }),
  car('Ford', 'Mustang Mach-E', 0.4, 2021, NOW_Y, { theft: 0.6, wmi: ['3FM'] }),
  // ── Honda ────────────────────────────────────────────────────────────────
  car('Honda', 'CR-V', 12, 1997, NOW_Y, { theft: 1.4, wmi: ['SHS', 'JHL'] }),
  car('Honda', 'Civic', 9, 1995, NOW_Y, { wmi: ['SHH', 'JHM'] }),
  car('Honda', 'Accord', 7, 1998, 2015, { wmi: ['JHM'] }),
  car('Honda', 'Jazz', 3, 2002, NOW_Y, { wmi: ['JHM'] }),
  // ── Nissan ───────────────────────────────────────────────────────────────
  car('Nissan', 'Qashqai', 10, 2007, NOW_Y, { theft: 1.2, wmi: ['SJN'] }),
  car('Nissan', 'X-Trail', 6, 2001, NOW_Y, { theft: 1.3, wmi: ['JN1', 'JN8'] }),
  car('Nissan', 'Leaf', 3, 2011, NOW_Y, { theft: 0.4, wmi: ['SJN', 'JN1'] }),
  car('Nissan', 'Almera', 3, 1995, 2006, { wmi: ['SJN'] }),
  car('Nissan', 'Primera', 4, 1996, 2007, { wmi: ['SJN'] }),
  car('Nissan', 'Navara', 2, 2005, NOW_Y, { theft: 1.3, wmi: ['VSK'] }),
  car('Nissan', 'Juke', 1.5, 2010, NOW_Y, { wmi: ['SJN'] }),
  car('Nissan', 'Note', 1.5, 2006, 2017, { wmi: ['SJN'] }),
  car('Nissan', 'Micra', 1, 1992, NOW_Y, { wmi: ['VNV', 'SJN'] }),
  // ── Mazda ────────────────────────────────────────────────────────────────
  car('Mazda', '6', 9, 2002, 2024),
  car('Mazda', 'CX-5', 7, 2012, NOW_Y, { theft: 1.4 }),
  car('Mazda', '3', 5, 2003, NOW_Y),
  car('Mazda', 'CX-30', 1, 2019, NOW_Y),
  car('Mazda', '626', 1, 1987, 2002, { theft: 0.6 }),
  car('Mazda', 'CX-60', 0.5, 2022, NOW_Y, { theft: 1.3 }),
  // ── Kia ──────────────────────────────────────────────────────────────────
  car('Kia', 'Ceed', 9, 2007, NOW_Y, { wmi: ['U5Y'] }),
  car('Kia', 'Sportage', 8, 1994, NOW_Y, { theft: 1.2, wmi: ['U5Y', 'KNA'] }),
  car('Kia', 'Sorento', 3, 2002, NOW_Y, { theft: 1.2 }),
  car('Kia', 'Rio', 2, 2000, NOW_Y),
  car('Kia', 'Niro', 2, 2016, NOW_Y, { theft: 0.7 }),
  car('Kia', 'Picanto', 1, 2004, NOW_Y),
  car('Kia', 'EV6', 0.4, 2021, NOW_Y, { theft: 0.5 }),
  // ── Hyundai ──────────────────────────────────────────────────────────────
  car('Hyundai', 'i30', 7, 2007, NOW_Y, { wmi: ['TMA'] }),
  car('Hyundai', 'Tucson', 6, 2004, NOW_Y, { theft: 1.2, wmi: ['TMA', 'KMH'] }),
  car('Hyundai', 'Santa Fe', 3, 2001, NOW_Y, { theft: 1.2 }),
  car('Hyundai', 'i20', 2, 2008, NOW_Y, { wmi: ['NLH'] }),
  car('Hyundai', 'Kona', 1.5, 2017, NOW_Y, { wmi: ['TMA', 'KMH'] }),
  car('Hyundai', 'ix35', 2, 2010, 2015, { wmi: ['TMA'] }),
  car('Hyundai', 'Ioniq 5', 0.5, 2021, NOW_Y, { theft: 0.5 }),
  car('Hyundai', 'Getz', 1, 2002, 2011),
  // ── Peugeot / Citroën / Renault / Dacia ──────────────────────────────────
  car('Peugeot', '308', 6, 2007, NOW_Y),
  car('Peugeot', '206', 3, 1998, 2012, { theft: 0.7 }),
  car('Peugeot', '307', 3, 2001, 2008),
  car('Peugeot', '407', 3, 2004, 2011),
  car('Peugeot', '508', 2, 2010, NOW_Y),
  car('Peugeot', '3008', 2, 2009, NOW_Y),
  car('Peugeot', '2008', 1, 2013, NOW_Y),
  car('Peugeot', '5008', 0.8, 2009, NOW_Y),
  car('Citroën', 'C4', 4, 2004, NOW_Y),
  car('Citroën', 'C5', 4, 2001, 2017),
  car('Citroën', 'C3', 2, 2002, NOW_Y),
  car('Citroën', 'Xsara Picasso', 2, 1999, 2010, { theft: 0.6 }),
  car('Citroën', 'C4 Picasso', 2, 2006, 2022),
  car('Renault', 'Megane', 8, 1996, 2024),
  car('Renault', 'Clio', 4, 1990, NOW_Y),
  car('Renault', 'Laguna', 3, 1994, 2015),
  car('Renault', 'Scenic', 2, 1996, NOW_Y),
  car('Renault', 'Captur', 1.5, 2013, NOW_Y),
  car('Renault', 'Kadjar', 1, 2015, 2022),
  car('Renault', 'Zoe', 0.5, 2012, 2024, { theft: 0.4 }),
  car('Dacia', 'Duster', 3, 2010, NOW_Y),
  car('Dacia', 'Logan', 1.5, 2005, NOW_Y),
  car('Dacia', 'Sandero', 1.5, 2008, NOW_Y),
  // ── Subaru / Mitsubishi / Suzuki ─────────────────────────────────────────
  car('Subaru', 'Outback', 7, 1995, NOW_Y, { theft: 1.1, wmi: ['JF1', 'JF2'] }),
  car('Subaru', 'Forester', 6, 1997, NOW_Y, { theft: 1.1, wmi: ['JF1', 'JF2'] }),
  car('Subaru', 'Impreza', 2, 1993, NOW_Y, { theft: 1.2, wmi: ['JF1'] }),
  car('Subaru', 'Legacy', 2, 1990, 2014, { wmi: ['JF1'] }),
  car('Subaru', 'XV', 1, 2012, NOW_Y, { wmi: ['JF1'] }),
  car('Mitsubishi', 'Outlander', 7, 2001, NOW_Y, { theft: 1.3 }),
  car('Mitsubishi', 'Lancer', 3, 1995, 2017),
  car('Mitsubishi', 'Pajero', 2, 1991, 2021, { theft: 1.4 }),
  car('Mitsubishi', 'L200', 2, 1996, NOW_Y, { theft: 1.3, wmi: ['MMC'] }),
  car('Mitsubishi', 'ASX', 1.5, 2010, NOW_Y),
  car('Mitsubishi', 'Colt', 1, 1996, 2012),
  car('Suzuki', 'Grand Vitara', 3, 1998, 2015, { wmi: ['JSA'] }),
  car('Suzuki', 'SX4', 2, 2006, 2021),
  car('Suzuki', 'Swift', 2, 2005, NOW_Y),
  car('Suzuki', 'Jimny', 1, 1998, NOW_Y, { theft: 1.3, wmi: ['JSA'] }),
  car('Suzuki', 'Vitara', 1, 2015, NOW_Y),
  // ── Tesla & other EVs ────────────────────────────────────────────────────
  car('Tesla', 'Model 3', 2, 2019, NOW_Y, { theft: 0.3, wmi: ['5YJ', 'LRW'] }),
  car('Tesla', 'Model Y', 2.5, 2021, NOW_Y, { theft: 0.3, wmi: ['XP7', 'LRW', '5YJ'] }),
  car('Tesla', 'Model S', 0.6, 2013, NOW_Y, { theft: 0.3, wmi: ['5YJ'] }),
  car('Tesla', 'Model X', 0.3, 2016, NOW_Y, { theft: 0.3, wmi: ['7SA', '5YJ'] }),
  car('MG', 'ZS', 0.8, 2018, NOW_Y),
  car('MG', 'MG4', 0.5, 2022, NOW_Y, { theft: 0.4 }),
  car('BYD', 'Atto 3', 0.3, 2023, NOW_Y, { theft: 0.4 }),
  car('Polestar', '2', 0.2, 2020, NOW_Y, { theft: 0.4 }),
  // ── Lada & Eastern classics (Ida-Virumaa flavour) ────────────────────────
  car('Lada', 'Niva', 4, 1980, NOW_Y, { theft: 0.7 }),
  car('Lada', '2107', 2.5, 1982, 2012, { theft: 0.5 }),
  car('Lada', 'Samara', 1, 1987, 2013, { theft: 0.5 }),
  car('Lada', '2106', 1, 1976, 2006, { theft: 0.5 }),
  car('Lada', 'Vesta', 0.3, 2015, 2022),
  car('UAZ', 'Hunter', 0.3, 1985, 2018, { theft: 0.6 }),
  car('GAZ', 'Volga 24', 0.15, 1970, 1992, { theft: 0.5 }),
  // ── Other makes ──────────────────────────────────────────────────────────
  car('Seat', 'Leon', 4, 1999, NOW_Y),
  car('Seat', 'Ibiza', 2, 1993, NOW_Y),
  car('Seat', 'Alhambra', 1, 1996, 2020),
  car('Seat', 'Ateca', 1, 2016, NOW_Y),
  car('Cupra', 'Formentor', 0.5, 2020, NOW_Y),
  car('Fiat', 'Punto', 1.5, 1993, 2018),
  car('Fiat', '500', 1.5, 2007, NOW_Y),
  car('Fiat', 'Tipo', 1, 2015, NOW_Y),
  car('Land Rover', 'Range Rover', 1.5, 1994, NOW_Y, { theft: 3.0 }),
  car('Land Rover', 'Range Rover Sport', 1.2, 2005, NOW_Y, { theft: 2.8 }),
  car('Land Rover', 'Discovery', 1, 1998, NOW_Y, { theft: 1.8 }),
  car('Land Rover', 'Freelander', 0.8, 1997, 2014, { theft: 1.1 }),
  car('Porsche', 'Cayenne', 1.5, 2002, NOW_Y, { theft: 2.2, wmi: ['WP1'] }),
  car('Porsche', 'Macan', 0.8, 2014, NOW_Y, { theft: 2.0, wmi: ['WP1'] }),
  car('Porsche', '911', 0.5, 1990, NOW_Y, { theft: 1.8 }),
  car('Jeep', 'Grand Cherokee', 1.5, 1993, NOW_Y, { theft: 1.6 }),
  car('Jeep', 'Wrangler', 0.5, 1997, NOW_Y, { theft: 1.4 }),
  car('RAM', '1500', 3, 2010, NOW_Y, { theft: 1.8 }),
  car('Mini', 'Cooper', 2, 2001, NOW_Y),
  car('Chevrolet', 'Lacetti', 1, 2004, 2013),
  car('Chevrolet', 'Aveo', 1, 2004, 2015),
  car('Chevrolet', 'Captiva', 1, 2006, 2018),
  car('Saab', '9-3', 1.5, 1998, 2012),
  car('Saab', '9-5', 0.8, 1997, 2011),
  car('Chrysler', 'Grand Voyager', 1, 1996, 2016),
  car('Smart', 'Fortwo', 0.5, 1998, 2024),

  // ── Vans (kaubikud) ──────────────────────────────────────────────────────
  van('Volkswagen', 'Transporter', 12, 1995, NOW_Y, { theft: 1.5, wmi: ['WV2', 'WV1'] }),
  van('Volkswagen', 'Caddy', 6, 1996, NOW_Y, { wmi: ['WV1', 'WV2'] }),
  van('Volkswagen', 'Crafter', 4, 2006, NOW_Y, { theft: 1.2, wmi: ['WV1'] }),
  van('Mercedes-Benz', 'Sprinter', 9, 1995, NOW_Y, { theft: 1.4, wmi: ['WDB', 'W1V'] }),
  van('Mercedes-Benz', 'Vito', 5, 1996, NOW_Y, { theft: 1.2, wmi: ['WDF', 'W1V'] }),
  van('Mercedes-Benz', 'Citan', 0.5, 2012, NOW_Y, { wmi: ['WDF', 'W1V'] }),
  van('Ford', 'Transit', 9, 1986, NOW_Y, { theft: 1.2, wmi: ['WF0', 'NM0'] }),
  van('Ford', 'Transit Custom', 4, 2012, NOW_Y, { theft: 1.2, wmi: ['WF0', 'NM0'] }),
  van('Ford', 'Transit Connect', 2, 2002, 2023, { wmi: ['WF0', 'NM0'] }),
  van('Renault', 'Trafic', 3, 2001, NOW_Y),
  van('Renault', 'Master', 3, 1998, NOW_Y),
  van('Renault', 'Kangoo', 3, 1997, NOW_Y),
  van('Peugeot', 'Partner', 3, 1996, NOW_Y),
  van('Peugeot', 'Boxer', 2, 1994, NOW_Y),
  van('Peugeot', 'Expert', 1.5, 1996, NOW_Y),
  van('Citroën', 'Berlingo', 4, 1996, NOW_Y),
  van('Citroën', 'Jumper', 2.5, 1994, NOW_Y),
  van('Fiat', 'Ducato', 4, 1994, NOW_Y),
  van('Opel', 'Vivaro', 2, 2001, NOW_Y),
  van('Toyota', 'Proace', 1, 2013, NOW_Y, { wmi: ['YAR'] }),
  van('Toyota', 'HiAce', 1, 1995, 2012, { theft: 1.3, wmi: ['JTF'] }),
  van('Iveco', 'Daily', 3, 1990, NOW_Y, { wmi: ['ZCF'] }),

  // ── Trucks (veokid) ──────────────────────────────────────────────────────
  truck('Scania', 'R 450', 10, 2004, NOW_Y),
  truck('Scania', 'S 500', 3, 2016, NOW_Y),
  truck('Scania', 'P 280', 2, 2004, NOW_Y),
  truck('Volvo', 'FH 500', 10, 1993, NOW_Y, { wmi: ['YV2'] }),
  truck('Volvo', 'FM 420', 3, 1998, NOW_Y, { wmi: ['YV2'] }),
  truck('Volvo', 'FL 250', 1, 1996, NOW_Y, { wmi: ['YV2'] }),
  truck('MAN', 'TGX 18.440', 6, 2007, NOW_Y),
  truck('MAN', 'TGS 26.400', 3, 2007, NOW_Y),
  truck('DAF', 'XF 480', 6, 1997, NOW_Y),
  truck('DAF', 'CF 450', 2, 2001, NOW_Y),
  truck('Mercedes-Benz', 'Actros', 6, 1996, NOW_Y, { wmi: ['WDB', 'W1T'] }),
  truck('Mercedes-Benz', 'Atego', 2, 1998, NOW_Y, { wmi: ['WDB', 'W1T'] }),
  truck('Iveco', 'S-Way', 2, 2019, NOW_Y, { wmi: ['WJM'] }),
  truck('Renault Trucks', 'T 480', 2, 2013, NOW_Y),

  // ── Buses (bussid) ───────────────────────────────────────────────────────
  bus('Solaris', 'Urbino 12', 5, 1999, NOW_Y),
  bus('Mercedes-Benz', 'Citaro', 4, 1997, NOW_Y, { wmi: ['WEB'] }),
  bus('MAN', 'Lion’s City', 3, 1996, NOW_Y),
  bus('Volvo', '8900', 2, 2010, NOW_Y, { wmi: ['YV3'] }),
  bus('Volvo', '9700', 1.5, 2001, NOW_Y, { wmi: ['YV3'] }),
  bus('Scania', 'Irizar i6', 1.5, 2010, NOW_Y, { wmi: ['YS4'] }),
  bus('Setra', 'S 515 HD', 1, 2012, NOW_Y),
  bus('Iveco', 'Crossway', 2.5, 2006, NOW_Y, { wmi: ['VNE'] }),
  bus('Mercedes-Benz', 'Tourismo', 1, 1994, NOW_Y, { wmi: ['NMB'] }),
  bus('Mercedes-Benz', 'Sprinter (minibuss)', 2, 2006, NOW_Y, { wmi: ['WDB', 'W1V'] }),
  bus('VDL', 'Futura', 0.5, 2010, NOW_Y),

  // ── Motorcycles (mootorrattad) ───────────────────────────────────────────
  moto('Yamaha', 'MT-07', 6, 2014, NOW_Y, { theft: 1.3 }),
  moto('Yamaha', 'MT-09', 4, 2013, NOW_Y, { theft: 1.3 }),
  moto('Yamaha', 'YZF-R1', 2, 1998, NOW_Y, { theft: 1.6 }),
  moto('Yamaha', 'YZF-R6', 2, 1999, 2020, { theft: 1.6 }),
  moto('Yamaha', 'XJ6', 1.5, 2009, 2016),
  moto('Honda', 'CBR600RR', 3, 2003, 2024, { theft: 1.5, wmi: ['JH2'] }),
  moto('Honda', 'CBR1000RR', 1.5, 2004, NOW_Y, { theft: 1.6, wmi: ['JH2'] }),
  moto('Honda', 'CB500X', 3, 2013, NOW_Y, { wmi: ['MLH', 'JH2'] }),
  moto('Honda', 'Africa Twin', 2, 2016, NOW_Y, { theft: 1.3, wmi: ['JH2'] }),
  moto('Honda', 'VFR800', 1, 1998, 2017, { wmi: ['JH2'] }),
  moto('Honda', 'Shadow 750', 1, 1997, 2015, { wmi: ['JH2'] }),
  moto('KTM', '690 Enduro', 2, 2008, NOW_Y, { theft: 1.8, color: 'oranž' }),
  moto('KTM', '300 EXC', 3, 2004, NOW_Y, { theft: 2.2, color: 'oranž' }),
  moto('KTM', '390 Duke', 2, 2013, NOW_Y, { theft: 1.4, color: 'oranž' }),
  moto('KTM', '1290 Super Duke R', 1, 2014, NOW_Y, { theft: 1.6, color: 'oranž' }),
  moto('Husqvarna', 'TE 300', 1.5, 2014, NOW_Y, { theft: 2.0, color: 'valge' }),
  moto('Harley-Davidson', 'Sportster', 2.5, 1990, 2022, { theft: 1.5 }),
  moto('Harley-Davidson', 'Fat Boy', 1.5, 1990, NOW_Y, { theft: 1.6 }),
  moto('Harley-Davidson', 'Street Glide', 1.5, 2006, NOW_Y, { theft: 1.6 }),
  moto('BMW', 'R 1200 GS', 3, 2004, 2018, { theft: 1.4, wmi: ['WB1'] }),
  moto('BMW', 'R 1250 GS', 3, 2019, NOW_Y, { theft: 1.5, wmi: ['WB1'] }),
  moto('BMW', 'F 800 GS', 2, 2008, 2018, { wmi: ['WB1'] }),
  moto('BMW', 'S 1000 RR', 1, 2009, NOW_Y, { theft: 1.6, wmi: ['WB1'] }),
  moto('Kawasaki', 'Z900', 2, 2017, NOW_Y, { theft: 1.3, color: 'roheline' }),
  moto('Kawasaki', 'Ninja 650', 2, 2012, NOW_Y, { theft: 1.3, color: 'roheline' }),
  moto('Suzuki', 'GSX-R750', 1.5, 1996, NOW_Y, { theft: 1.5, wmi: ['JS1'] }),
  moto('Suzuki', 'SV650', 2, 1999, NOW_Y, { wmi: ['JS1'] }),
  moto('Suzuki', 'V-Strom 650', 2, 2004, NOW_Y, { wmi: ['JS1'] }),
  moto('Ducati', 'Monster', 1.5, 1993, NOW_Y, { theft: 1.5, color: 'punane' }),
  moto('Ducati', 'Multistrada', 1, 2003, NOW_Y, { theft: 1.5, color: 'punane' }),
  moto('Triumph', 'Tiger 800', 1, 2010, 2019),
  moto('Jawa', '638', 0.7, 1984, 1993, { theft: 0.6 }),
  moto('Ural', 'M-67 (külgkorviga)', 0.4, 1975, 2010, { theft: 0.5 }),
  moto('IŽ', 'Planeta 5', 0.4, 1987, 2008, { theft: 0.5 }),
  moto('Minsk', 'M-125', 0.3, 1980, 2007, { theft: 0.5 }),

  // ── Mopeds & scooters (mopeedid, rollerid) ───────────────────────────────
  moped('Kymco', 'Agility 50', 4, 2005, NOW_Y),
  moped('Piaggio', 'Zip 50', 3, 1992, NOW_Y),
  moped('Vespa', 'Primavera 50', 2, 2013, NOW_Y, { theft: 1.4 }),
  moped('Peugeot', 'Kisbee 50', 2, 2010, NOW_Y, { wmi: ['VGA'] }),
  moped('Yamaha', 'Aerox 50', 2, 1997, NOW_Y, { theft: 1.3, wmi: ['VG5'] }),
  moped('Yamaha', 'Neo’s 50', 1.5, 1997, NOW_Y, { wmi: ['VG5'] }),
  moped('Baotian', 'BT49QT', 4, 2006, 2020, { theft: 0.8 }),
  moped('Romet', '727', 1, 2008, 2020),
  moped('Derbi', 'Senda 50', 1, 1995, 2015, { theft: 1.2 }),
  moped('Aprilia', 'SR 50', 1.5, 1993, 2018, { theft: 1.2 }),
  moped('Sym', 'Orbit 50', 1.5, 2006, NOW_Y),
  moped('Honda', 'Vision 50', 1, 2011, NOW_Y, { wmi: ['MLH'] }),
  moped('Niu', 'NQi', 1.5, 2016, NOW_Y, { theft: 1.1 }),
  moped('Rieju', 'MRT 50', 1, 2009, NOW_Y, { theft: 1.3 }),
  moped('Beta', 'RR 50', 1, 2005, NOW_Y, { theft: 1.3 }),
  moped('Riga', '22', 0.3, 1980, 1998, { theft: 0.5 }),

  // ── ATVs (ATV-d, maastikusõidukid) ───────────────────────────────────────
  quad('Polaris', 'Sportsman 570', 4, 2014, NOW_Y, { theft: 1.7 }),
  quad('Can-Am', 'Outlander 650', 3, 2006, NOW_Y, { theft: 1.6 }),
  quad('CFMoto', 'CForce 520', 3, 2016, NOW_Y, { theft: 1.2 }),
  quad('Yamaha', 'Grizzly 700', 2, 2007, NOW_Y, { theft: 1.5, wmi: ['JY4'] }),
  quad('Yamaha', 'Kodiak 450', 1, 2003, NOW_Y, { wmi: ['JY4'] }),
  quad('TGB', 'Blade 550', 1.5, 2008, 2020),
  quad('Linhai', 'LH500', 1.5, 2008, NOW_Y),
  quad('Honda', 'TRX420', 1, 2007, NOW_Y, { wmi: ['1HF'] }),
  quad('Kawasaki', 'Brute Force 750', 0.8, 2005, NOW_Y, { wmi: ['JKB'] }),
  quad('Suzuki', 'KingQuad 750', 0.8, 2008, NOW_Y, { wmi: ['JSA'] }),
  quad('Segway', 'Snarler AT6', 0.8, 2021, NOW_Y),
  quad('Arctic Cat', '700', 0.5, 2008, 2017),
];

/** Default VIN World Manufacturer Identifiers per make (positions 1–3). */
export const MAKE_WMI: Record<string, string[]> = {
  Toyota: ['JTD', 'JTE', 'JTN', 'SB1'],
  Lexus: ['JTH', 'JTJ'],
  Volkswagen: ['WVW'],
  Škoda: ['TMB'],
  Audi: ['WAU'],
  BMW: ['WBA'],
  Volvo: ['YV1'],
  'Mercedes-Benz': ['WDD', 'W1K'],
  Opel: ['W0L', 'W0V'],
  Ford: ['WF0'],
  Honda: ['JHM', 'SHH'],
  Nissan: ['SJN', 'JN1'],
  Mazda: ['JMZ'],
  Kia: ['KNA', 'U5Y'],
  Hyundai: ['KMH', 'TMA'],
  Peugeot: ['VF3', 'VR3'],
  Citroën: ['VF7', 'VR7'],
  Renault: ['VF1'],
  Dacia: ['UU1'],
  Subaru: ['JF1', 'JF2'],
  Mitsubishi: ['JMB'],
  Suzuki: ['TSM', 'JSA'],
  Tesla: ['5YJ', 'LRW'],
  MG: ['LSJ'],
  BYD: ['LGX'],
  Polestar: ['LPS'],
  Lada: ['XTA'],
  UAZ: ['XTT'],
  GAZ: ['XTH'],
  Seat: ['VSS'],
  Cupra: ['VSS'],
  Fiat: ['ZFA'],
  'Land Rover': ['SAL'],
  Porsche: ['WP0'],
  Jeep: ['1C4', '1J4'],
  RAM: ['1C6', '3C6'],
  Mini: ['WMW'],
  Chevrolet: ['KL1'],
  Saab: ['YS3'],
  Chrysler: ['2C4', '1C4'],
  Smart: ['WME'],
  Iveco: ['ZCF'],
  Scania: ['YS2'],
  MAN: ['WMA'],
  DAF: ['XLR'],
  'Renault Trucks': ['VF6'],
  Solaris: ['SUU'],
  Setra: ['WKK'],
  VDL: ['XNL'],
  Yamaha: ['JYA'],
  KTM: ['VBK'],
  Husqvarna: ['VBK'],
  'Harley-Davidson': ['1HD'],
  Kawasaki: ['JKA'],
  Ducati: ['ZDM'],
  Triumph: ['SMT'],
  Jawa: ['TKY'],
  Ural: ['X8F'],
  IŽ: ['XTZ'],
  Minsk: ['Y3M'],
  Kymco: ['RFB'],
  Piaggio: ['ZAP'],
  Vespa: ['ZAP'],
  Baotian: ['LB2'],
  Romet: ['SXM'],
  Derbi: ['VTH'],
  Aprilia: ['ZD4'],
  Sym: ['RFG'],
  Niu: ['L1N'],
  Rieju: ['VTL'],
  Beta: ['ZD3'],
  Riga: ['XRG'],
  Polaris: ['4XA'],
  'Can-Am': ['3JB'],
  CFMoto: ['LCE'],
  TGB: ['RFC'],
  Linhai: ['LL0'],
  Segway: ['L5Y'],
  'Arctic Cat': ['4UF'],
};

/** Car colours as recorded in the registry (ARK style base colours with tume-/hele- prefixes). */
export const COLORS: (Text & { weight: number })[] = [
  { et: 'hall', en: 'grey', weight: 17 },
  { et: 'hõbedane', en: 'silver', weight: 15 },
  { et: 'must', en: 'black', weight: 17 },
  { et: 'valge', en: 'white', weight: 14 },
  { et: 'sinine', en: 'blue', weight: 8 },
  { et: 'tumesinine', en: 'dark blue', weight: 6 },
  { et: 'tumehall', en: 'dark grey', weight: 4 },
  { et: 'punane', en: 'red', weight: 6 },
  { et: 'bordoo', en: 'maroon', weight: 2 },
  { et: 'roheline', en: 'green', weight: 2.5 },
  { et: 'tumeroheline', en: 'dark green', weight: 2 },
  { et: 'pruun', en: 'brown', weight: 2 },
  { et: 'beež', en: 'beige', weight: 1.5 },
  { et: 'helesinine', en: 'light blue', weight: 1 },
  { et: 'kollane', en: 'yellow', weight: 0.8 },
  { et: 'oranž', en: 'orange', weight: 0.6 },
  { et: 'kuldne', en: 'gold', weight: 0.5 },
  { et: 'lilla', en: 'purple', weight: 0.4 },
];

/**
 * Motor third-party (liikluskindlustus) insurers active in Estonia, with rough market-share
 * weights (INSURER_WEIGHTS, same order). unverified: market shares are approximate and the
 * presence of Gjensidige and Salva in 2026 could not be confirmed.
 */
export const INSURERS: string[] = [
  'If P&C Insurance AS',
  'ERGO Insurance SE',
  'Swedbank P&C Insurance AS',
  'BTA Baltic Insurance Company AS',
  'Compensa Vienna Insurance Group ADB',
  'LHV Kindlustus AS',
  'Salva Kindlustuse AS',
  'Gjensidige Forsikring ASA',
];
export const INSURER_WEIGHTS: number[] = [24, 18, 16, 12, 10, 8, 7, 5];

/** Default share of each vehicle kind among vehicles met in incidents (before seasonal factors). */
export const KIND_WEIGHTS: Record<VehicleKind, number> = {
  car: 80,
  van: 9,
  truck: 3,
  bus: 0.6,
  moto: 3.5,
  moped: 2.5,
  quad: 1.2,
};

export type FleetOwnerKind =
  | 'leasing'
  | 'rental'
  | 'courier'
  | 'taxi'
  | 'construction'
  | 'logistics'
  | 'bus'
  | 'business'
  | 'farm'
  | 'adventure';

/** Fictional company owners (not real companies). */
export const FLEET_OWNERS: Record<FleetOwnerKind, string[]> = {
  leasing: [
    'Balti Liising AS',
    'Rukkilille Liising AS',
    'Põhjarannik Liising AS',
    'Kadaka Kapitali Liising AS',
    'Läänemere Autoliising OÜ',
    'Vikerkaare Liising AS',
  ],
  rental: ['Põhja Autorent OÜ', 'Hõbekuu Rendiautod OÜ', 'Toomemäe Rent OÜ', 'Rannarendi OÜ', 'Linnaauto Rent OÜ'],
  courier: ['Kiire Kuller OÜ', 'Pakiraketi Logistika OÜ', 'Kolmjärve Kuller OÜ', 'Tuuletõmbe Kullerteenus OÜ'],
  taxi: ['Rohelise Tule Takso OÜ', 'Öölinnu Takso OÜ', 'Kesklinna Sõidud OÜ', 'Tähesõidu Takso OÜ'],
  construction: ['Vanaturu Ehitus OÜ', 'Kivisilla Ehitus AS', 'Paekalda Ehitus OÜ', 'Raudnaela Remont OÜ'],
  logistics: ['Tormi Veod OÜ', 'Põhjatähe Logistika AS', 'Kaugsõidu Transport OÜ', 'Lõunavärava Veod OÜ', 'Hallikivi Logistika OÜ'],
  bus: ['Rannaliinide AS', 'Kaarebussid OÜ', 'Linnaliini Vedu AS', 'Kolme Maakonna Bussid AS'],
  business: [
    'Sinilille Haldus OÜ',
    'Männisalu Kinnisvara OÜ',
    'Kuusiku Metsatööd OÜ',
    'Pajuoksa Konsult OÜ',
    'Merekivi Invest OÜ',
    'Kolmikpunkti Tehnika OÜ',
  ],
  farm: ['Rehepapi Talu OÜ', 'Kaseoksa Põllutöö OÜ', 'Õunapuu Agro OÜ'],
  adventure: ['Rabaretked OÜ', 'Metsasõpru Seiklus OÜ', 'Põhjaranniku Matkad OÜ'],
};

/** Which fleet owner categories own which vehicle kinds (weights). */
export const FLEET_OWNER_MIX: Record<VehicleKind, Partial<Record<FleetOwnerKind, number>>> = {
  car: { leasing: 45, rental: 15, taxi: 10, business: 25, construction: 5 },
  van: { courier: 35, construction: 30, leasing: 20, rental: 10, business: 5 },
  truck: { logistics: 80, construction: 15, leasing: 5 },
  bus: { bus: 100 },
  moto: { leasing: 30, rental: 30, business: 40 },
  moped: { rental: 60, courier: 40 },
  quad: { adventure: 50, farm: 30, business: 20 },
};
