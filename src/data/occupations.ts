// Owned by gen-people. Occupations for generated registry persons (realistic for Estonia).
import type { RegionId, Text } from '@/sim/types';

export interface Occupation {
  /** Stable id (used by generators, e.g. licence categories for drivers). */
  id: string;
  text: Text;
  /** Relative frequency among people of a matching age. */
  weight: number;
  minAge: number;
  maxAge: number;
  /** Share of women in the job 0..1 (default 0.5); skews the pick by gender. */
  female?: number;
  /** Weight multiplier for Russian speakers (default 1). */
  ru?: number;
  /** Over-represented in these prefectures (×3 there, ×0.4 elsewhere). */
  regions?: RegionId[];
  /** Status rather than a job (student, pensioner, unemployed…); picked by special rules. */
  status?: boolean;
}

const o = (
  id: string,
  et: string,
  en: string,
  weight: number,
  minAge: number,
  maxAge: number,
  extra: Partial<Occupation> = {},
): Occupation => ({ id, text: { et, en }, weight, minAge, maxAge, ...extra });

export const OCCUPATIONS: Occupation[] = [
  // ── Statuses (chosen by age rules in person.ts) ──
  o('lasteaialaps', 'lasteaialaps', 'kindergarten child', 0, 2, 6, { status: true }),
  o('opilane', 'õpilane', 'school pupil', 0, 7, 19, { status: true }),
  o('kutseopilane', 'kutsekooli õpilane', 'vocational school student', 0, 16, 22, { status: true }),
  o('yliopilane', 'üliõpilane', 'university student', 0, 19, 30, { status: true }),
  o('pensionar', 'pensionär', 'pensioner', 0, 60, 110, { status: true }),
  o('tootu', 'töötu', 'unemployed', 0, 18, 64, { status: true }),
  o('lapsehoolduspuhkus', 'lapsehoolduspuhkusel', 'on parental leave', 0, 20, 43, {
    status: true,
    female: 0.9,
  }),
  o('toovoimetu', 'töövõimetoetuse saaja', 'on incapacity benefit', 0, 25, 64, { status: true }),
  // ── Retail & service ──
  o('myyja', 'müüja', 'shop assistant', 6, 18, 70, { female: 0.75 }),
  o('kassapidaja', 'kassapidaja', 'cashier', 3, 18, 70, { female: 0.85 }),
  o('klienditeenindaja', 'klienditeenindaja', 'customer service agent', 2.2, 18, 62, {
    female: 0.7,
    ru: 1.2,
  }),
  o('poejuhataja', 'kaupluse juhataja', 'store manager', 0.6, 25, 65, { female: 0.7 }),
  o('tanklateenindaja', 'tankla teenindaja', 'petrol station attendant', 0.6, 18, 60, { female: 0.6 }),
  o('kokk', 'kokk', 'cook', 2, 18, 65, { female: 0.5 }),
  o('abikokk', 'abikokk', 'kitchen assistant', 1, 18, 62, { female: 0.6, ru: 1.3 }),
  o('kelner', 'kelner', 'waiter', 1.5, 18, 45, { female: 0.65 }),
  o('baarmen', 'baarmen', 'bartender', 0.7, 18, 45, { female: 0.45 }),
  o('hotelliadmin', 'hotelli administraator', 'hotel receptionist', 0.5, 19, 55, { female: 0.75 }),
  o('pagar', 'pagar', 'baker', 0.4, 19, 65, { female: 0.7 }),
  o('koristaja', 'koristaja', 'cleaner', 2.2, 18, 70, { female: 0.8, ru: 1.8 }),
  o('juuksur', 'juuksur', 'hairdresser', 0.8, 19, 65, { female: 0.9 }),
  o('kosmeetik', 'kosmeetik', 'beautician', 0.4, 20, 60, { female: 0.97 }),
  o('massoor', 'massöör', 'massage therapist', 0.3, 22, 62, { female: 0.7 }),
  o('treener', 'treener', 'sports coach', 0.4, 20, 62, { female: 0.4 }),
  o('turvatootaja', 'turvatöötaja', 'security guard', 1.8, 19, 68, { female: 0.15, ru: 1.8 }),
  o('postiljon', 'postiljon', 'postal worker', 0.4, 19, 68, { female: 0.65 }),
  o('kinnisvaramaakler', 'kinnisvaramaakler', 'real estate agent', 0.5, 23, 68, { female: 0.55 }),
  o('kindlustus', 'kindlustusesindaja', 'insurance agent', 0.3, 22, 65, { female: 0.6 }),
  o('lapsehoidja', 'lapsehoidja', 'childminder', 0.2, 18, 70, { female: 0.97 }),
  o('majahoidja', 'majahoidja', 'caretaker', 0.6, 25, 75, { female: 0.25, ru: 1.5 }),
  // ── Transport & logistics ──
  o('autojuht', 'autojuht', 'driver', 4, 21, 68, { female: 0.08 }),
  o('veoautojuht', 'veoautojuht', 'truck driver', 3, 21, 67, { female: 0.03, ru: 1.4 }),
  o('bussijuht', 'bussijuht', 'bus driver', 1.2, 24, 67, { female: 0.15, ru: 1.4 }),
  o('taksojuht', 'taksojuht', 'taxi driver', 1.6, 21, 70, { female: 0.08, ru: 1.6, regions: ['pohja'] }),
  o('trammijuht', 'trammijuht', 'tram driver', 0.12, 24, 65, { female: 0.4, regions: ['pohja'] }),
  o('rongijuht', 'vedurijuht', 'train driver', 0.15, 24, 63, { female: 0.05 }),
  o('kuller', 'kuller', 'courier', 1.5, 18, 55, { female: 0.2 }),
  o('toidukuller', 'toidukuller', 'food delivery courier', 1, 18, 40, { female: 0.15 }),
  o('laotootaja', 'laotöötaja', 'warehouse worker', 3, 18, 62, { female: 0.3, ru: 1.4 }),
  o('tostukijuht', 'tõstukijuht', 'forklift operator', 1.2, 20, 63, { female: 0.1, ru: 1.4 }),
  o('sadamatootaja', 'sadamatöötaja', 'port worker', 0.6, 20, 63, { female: 0.1, regions: ['pohja', 'ida'] }),
  o('meremees', 'meremees', 'seaman', 0.6, 20, 63, { female: 0.08, ru: 1.5 }),
  o('lennujaam', 'lennujaama töötaja', 'airport worker', 0.2, 20, 63, { female: 0.4, regions: ['pohja'] }),
  // ── Construction & trades ──
  o('ehitustooline', 'ehitustööline', 'construction worker', 3.5, 18, 65, { female: 0.03, ru: 1.3 }),
  o('ehitusjuht', 'ehitusjuht', 'site manager', 0.8, 28, 65, { female: 0.1 }),
  o('elektrik', 'elektrik', 'electrician', 1.5, 20, 65, { female: 0.03 }),
  o('torulukksepp', 'torulukksepp', 'plumber', 0.9, 20, 65, { female: 0.02 }),
  o('keevitaja', 'keevitaja', 'welder', 1.2, 20, 63, { female: 0.03, ru: 1.6 }),
  o('lukksepp', 'lukksepp', 'fitter', 1, 20, 65, { female: 0.05, ru: 1.5 }),
  o('automehaanik', 'automehaanik', 'car mechanic', 1.5, 19, 65, { female: 0.03 }),
  o('puusepp', 'puusepp', 'carpenter', 1, 20, 68, { female: 0.05 }),
  o('tisler', 'tisler', 'joiner', 0.6, 20, 65, { female: 0.08 }),
  o('plaatija', 'plaatija', 'tiler', 0.5, 20, 62, { female: 0.05 }),
  o('maaler', 'maaler', 'painter and decorator', 0.6, 20, 65, { female: 0.3 }),
  o('katusepanija', 'katusepanija', 'roofer', 0.4, 20, 55, { female: 0.02 }),
  o('masinajuht', 'ehitusmasinajuht', 'construction machine operator', 0.6, 21, 65, { female: 0.02 }),
  o('haljastaja', 'haljastaja', 'landscaper', 0.4, 19, 72, { female: 0.55 }),
  // ── Industry & primary sector ──
  o('tehasetooline', 'tehasetööline', 'factory worker', 3, 18, 63, { female: 0.4, ru: 1.6 }),
  o('liinioperaator', 'tootmisliini operaator', 'production line operator', 2, 18, 63, {
    female: 0.4,
    ru: 1.5,
  }),
  o('polevkivi', 'põlevkivitööstuse operaator', 'oil shale plant operator', 1, 20, 63, {
    female: 0.15,
    ru: 1.5,
    regions: ['ida'],
  }),
  o('kaevur', 'kaevur', 'miner', 0.5, 20, 58, { female: 0.02, ru: 1.5, regions: ['ida'] }),
  o('energeetik', 'elektrijaama operaator', 'power plant operator', 0.4, 22, 63, {
    female: 0.1,
    regions: ['ida'],
  }),
  o('keemia', 'keemiatööstuse operaator', 'chemical plant operator', 0.4, 20, 63, {
    female: 0.2,
    ru: 1.5,
    regions: ['ida'],
  }),
  o('lihatoostus', 'lihatööstuse töötaja', 'meat processing worker', 0.5, 19, 63, { female: 0.4 }),
  o('kalatoostus', 'kalatööstuse töötaja', 'fish processing worker', 0.3, 19, 63, {
    female: 0.6,
    regions: ['laane', 'pohja'],
  }),
  o('omble', 'õmbleja', 'seamstress', 0.5, 20, 70, { female: 0.95, ru: 1.4 }),
  o('metsatooline', 'metsatööline', 'forestry worker', 0.8, 20, 63, {
    female: 0.05,
    regions: ['louna', 'laane'],
  }),
  o('harvester', 'harvesterioperaator', 'harvester operator', 0.4, 22, 62, {
    female: 0.03,
    regions: ['louna'],
  }),
  o('pollumajandus', 'põllumajandustöötaja', 'farm worker', 1.5, 18, 70, {
    female: 0.3,
    regions: ['louna', 'laane'],
  }),
  o('talunik', 'talunik', 'farmer', 1, 25, 78, { female: 0.25, ru: 0.4, regions: ['louna', 'laane'] }),
  o('loomakasvatus', 'loomakasvatustöötaja', 'livestock worker', 0.6, 20, 67, {
    female: 0.5,
    regions: ['louna'],
  }),
  o('kalur', 'kalur', 'fisherman', 0.4, 20, 72, { female: 0.05, regions: ['laane', 'ida'] }),
  // ── Office, IT & business ──
  o('itarendaja', 'IT-arendaja', 'software developer', 2, 21, 60, { female: 0.2, regions: ['pohja'] }),
  o('ittugi', 'IT-tugiisik', 'IT support specialist', 0.8, 20, 60, { female: 0.2 }),
  o('sysadmin', 'süsteemiadministraator', 'system administrator', 0.6, 24, 62, { female: 0.1 }),
  o('analyytik', 'andmeanalüütik', 'data analyst', 0.5, 23, 55, { female: 0.4, regions: ['pohja'] }),
  o('projektijuht', 'projektijuht', 'project manager', 1.5, 25, 64, { female: 0.5 }),
  o('raamatupidaja', 'raamatupidaja', 'accountant', 1.8, 22, 70, { female: 0.85 }),
  o('pangatootaja', 'pangatöötaja', 'bank clerk', 0.8, 21, 64, { female: 0.7 }),
  o('kliendihaldur', 'kliendihaldur', 'account manager', 1, 22, 60, { female: 0.6 }),
  o('myygiesindaja', 'müügiesindaja', 'sales representative', 1.2, 22, 62, { female: 0.45 }),
  o('buroojuht', 'büroojuht', 'office manager', 1, 20, 65, { female: 0.85 }),
  o('personalijuht', 'personalijuht', 'HR manager', 0.4, 25, 64, { female: 0.85 }),
  o('turundus', 'turundusspetsialist', 'marketing specialist', 0.6, 22, 55, { female: 0.65 }),
  o('insener', 'insener', 'engineer', 1.2, 23, 67, { female: 0.2 }),
  o('geodeet', 'geodeet', 'land surveyor', 0.2, 22, 65, { female: 0.25 }),
  o('arhitekt', 'arhitekt', 'architect', 0.2, 25, 72, { female: 0.45 }),
  o('jurist', 'jurist', 'legal counsel', 0.5, 24, 70, { female: 0.55, ru: 0.6 }),
  o('advokaat', 'vandeadvokaat', 'attorney-at-law', 0.2, 27, 75, { female: 0.4 }),
  o('tolk', 'tõlk', 'translator', 0.15, 23, 70, { female: 0.75, ru: 2 }),
  o('ettevotja', 'ettevõtja', 'entrepreneur', 2, 23, 75, { female: 0.35 }),
  o('fie', 'FIE', 'sole trader', 0.6, 23, 75, { female: 0.4 }),
  o('juhatuseliige', 'juhatuse liige', 'company director', 0.6, 28, 75, { female: 0.3 }),
  // ── Public sector ──
  o('ametnik', 'riigiametnik', 'civil servant', 1.4, 24, 67, { female: 0.65, ru: 0.4 }),
  o('vallaametnik', 'vallaametnik', 'municipal official', 0.5, 24, 67, { female: 0.7, ru: 0.5 }),
  o('opetaja', 'õpetaja', 'teacher', 2.2, 23, 70, { female: 0.85 }),
  o('lasteaiaopetaja', 'lasteaiaõpetaja', 'kindergarten teacher', 1.2, 21, 67, { female: 0.97 }),
  o('opetajaabi', 'õpetaja abi', 'teaching assistant', 0.6, 19, 67, { female: 0.95 }),
  o('oppejoud', 'õppejõud', 'university lecturer', 0.4, 27, 72, { female: 0.5, regions: ['louna', 'pohja'] }),
  o('teadur', 'teadur', 'researcher', 0.3, 25, 72, { female: 0.45, regions: ['louna', 'pohja'] }),
  o('raamatukoguhoidja', 'raamatukoguhoidja', 'librarian', 0.25, 23, 70, { female: 0.95 }),
  o('sotsiaaltootaja', 'sotsiaaltöötaja', 'social worker', 0.5, 23, 67, { female: 0.9 }),
  o('paastja', 'päästja', 'firefighter', 0.3, 21, 55, { female: 0.04 }),
  o('kaitsevaelane', 'kaitseväelane', 'soldier', 0.5, 19, 55, { female: 0.12 }),
  o('ajateenija', 'ajateenija', 'conscript', 0.6, 18, 27, { female: 0.03, ru: 0.6 }),
  o('vanglaametnik', 'vanglaametnik', 'prison officer', 0.2, 21, 60, { female: 0.35 }),
  o('piirivalvur', 'piirivalvur', 'border guard', 0.2, 21, 60, { female: 0.2, regions: ['ida', 'louna'] }),
  // ── Health & care ──
  o('ode', 'õde', 'nurse', 1.8, 21, 67, { female: 0.92 }),
  o('hooldaja', 'hooldaja', 'care worker', 1.6, 19, 68, { female: 0.88, ru: 1.4 }),
  o('sanitar', 'sanitar', 'hospital orderly', 0.3, 19, 65, { female: 0.6 }),
  o('arst', 'arst', 'doctor', 0.7, 25, 75, { female: 0.7 }),
  o('perearst', 'perearst', 'family doctor', 0.3, 30, 72, { female: 0.85 }),
  o('hambaarst', 'hambaarst', 'dentist', 0.2, 25, 72, { female: 0.75 }),
  o('kiirabi', 'kiirabitehnik', 'paramedic', 0.3, 21, 60, { female: 0.5 }),
  o('apteeker', 'proviisor', 'pharmacist', 0.4, 24, 70, { female: 0.95 }),
  o('psyhholoog', 'psühholoog', 'psychologist', 0.2, 25, 68, { female: 0.85 }),
  o('veterinaar', 'loomaarst', 'veterinarian', 0.1, 25, 70, { female: 0.8 }),
  // ── Culture & media ──
  o('ajakirjanik', 'ajakirjanik', 'journalist', 0.2, 22, 68, { female: 0.6 }),
  o('kunstnik', 'kunstnik', 'artist', 0.15, 22, 85, { female: 0.55 }),
  o('muusik', 'muusik', 'musician', 0.25, 19, 75, { female: 0.3 }),
  o('naitleja', 'näitleja', 'actor', 0.05, 20, 80, { female: 0.5 }),
  o('fotograaf', 'fotograaf', 'photographer', 0.15, 20, 70, { female: 0.5 }),
  o('kirikuopetaja', 'kirikuõpetaja', 'pastor', 0.05, 28, 80, { female: 0.2, ru: 0.2 }),
];

export const OCCUPATION_BY_ID: Record<string, Occupation> = Object.fromEntries(
  OCCUPATIONS.map((x) => [x.id, x]),
);
