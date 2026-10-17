/**
 * Career economy numbers (DESIGN §4.12, §6). Owned by engine-systems.
 *
 * Sources & reasoning (see also docs/research/ppa-organisation.md):
 *  - Police minimum base salary: €1 850 (2025) → €2 035 (2026), 43 % of officers on the lowest
 *    level (ERR via ppa-organisation.md §10). Specialists (rapid response, K9, investigators,
 *    K-komando) earn noticeably more; game range 1 700–3 400 €/month gross.
 *  - Patrol car prices are list price + police conversion (lights/siren, partition, ESTER radio
 *    terminal, MDT mount, livery): Škoda Octavia Combi ≈ 38 k€, Toyota RAV4 Hybrid ≈ 45 k€,
 *    BMW 5 Touring traffic car ≈ 70 k€, VW ID.4 GTX ≈ 66 k€ (PPA trial price, research §6.1),
 *    VW Transporter convoy van ≈ 55 k€, Mercedes Sprinter riot van ≈ 100 k€ (PPA paid ~800 k€ for
 *    8 riot vans in 2016–18, research §6.1). Upkeep = service + insurance + tyres + leasing share.
 *  - PPA lennusalk AW139 flight hour ≈ 3–5 k€ (game: monthly retainer), drones: PPA bought 9 ELIX-XL
 *    for ≈ 0,5 M€ (≈ 55 k€ each; our prefecture-level DJI-class thermal kit ≈ 15 k€).
 *  - All figures are game-balanced estimates, not official prices.
 */
import type { Achievement, CatalogVehicle, Rank, RegionId, UnitType, Upgrade } from '@/sim/types';

const T = (et: string, en: string) => ({ et, en });

// ─────────────────────────────────────────────────────────────────────────────
// Ranks — real PPVS special-rank ladder (eriastmed), lowest to highest
// ─────────────────────────────────────────────────────────────────────────────

export const RANKS: Rank[] = [
  { name: T('Nooremkonstaabel', 'Junior Constable'), xp: 0, unlocks: [T('Koduprefektuur, patrull- ja kriminaalekipaažid', 'Home prefecture, patrol and CID crews')] },
  { name: T('Konstaabel', 'Constable'), xp: 400, unlocks: [T('Elektrišokirelvad, MDT, naelamatid, tõlkeliin', 'Tasers, MDT, spike strips, interpreter line'), T('Mootorrattad ja elektripatrull', 'Motorcycles and electric patrol cars')] },
  { name: T('Vanemkonstaabel', 'Senior Constable'), xp: 1100, unlocks: [T('Teine prefektuur', 'A second prefecture'), T('ANPR, droonid, politseipsühholoog', 'ANPR, drones, police psychologist'), T('Kiirreageerijate maastur, K9-auto', 'Rapid-response SUV, K9 car')] },
  { name: T('Ülemkonstaabel', 'Chief Constable'), xp: 2200, unlocks: [T('Koerte kennel, läbirääkijad', 'K9 kennel, negotiators'), T('Liiklusjärelevalve BMW', 'BMW traffic car')] },
  { name: T('Komissar', 'Commissioner'), xp: 3800, unlocks: [T('Kolmas prefektuur', 'A third prefecture'), T('Lisapolitseipunkt, märulibuss', 'Extra police post, riot van')] },
  { name: T('Vanemkomissar', 'Senior Commissioner'), xp: 6000, unlocks: [T('Lennusalga helikopteritunnid', 'Air unit helicopter hours'), T('Patrullkaater', 'Patrol boat')] },
  { name: T('Politseileitnant', 'Police Lieutenant'), xp: 9000, unlocks: [T('Kõik prefektuurid', 'All prefectures'), T('K-komando valmidus, soomusbuss', 'K-komando on call, armoured van')] },
  { name: T('Politseikapten', 'Police Captain'), xp: 13000, unlocks: [T('Juhtimiskeskuse grupijuht', 'Command centre group leader')] },
  { name: T('Politseimajor', 'Police Major'), xp: 18000, unlocks: [T('Prefektuuri büroo juht', 'Head of a prefecture bureau')] },
  { name: T('Politseikolonelleitnant', 'Police Lieutenant Colonel'), xp: 24500, unlocks: [T('Prefekti asetäitja', 'Deputy prefect')] },
  { name: T('Politseikolonel', 'Police Colonel'), xp: 32500, unlocks: [T('Prefekt', 'Prefect')] },
  { name: T('Politseikindral', 'Police General'), xp: 42000, unlocks: [T('Peadirektor — legend', 'Director General — a legend')] },
];

/** Rank indices at which the 2nd, 3rd and 4th prefecture unlock (home region is always open). */
export const EXTRA_REGION_RANKS = [2, 4, 6];
/** Order in which additional prefectures unlock (home region skipped). */
export const REGION_UNLOCK_ORDER: RegionId[] = ['pohja', 'louna', 'ida', 'laane'];

// ─────────────────────────────────────────────────────────────────────────────
// Salaries
// ─────────────────────────────────────────────────────────────────────────────

/** Police minimum base salary 2026 (€/month gross). */
export const POLICE_MIN_SALARY = 2035;
/** Typical base salary by specialty (€/month gross, for a mid-career officer before skill premium). */
export const BASE_SALARY: Record<UnitType, number> = {
  patrol: 2035,
  community: 2150,
  traffic: 2150,
  transport: 2035,
  aux: 1700, // abipolitseinik stipend-style contract (real auxiliaries are volunteers)
  criminal: 2300,
  k9: 2350,
  rapid: 2500,
  border: 2100,
  boat: 2300,
  special: 2900,
  heli: 3100,
};
export const SALARY_MIN = 1700;
export const SALARY_MAX = 3400;
/** Overtime cost per officer-hour (≈ 2 200 €/month ÷ 168 h × 1,5). */
export const OVERTIME_PER_HOUR = 20;
/** Fuel & energy cost per driven km (DESIGN §4.12). */
export const FUEL_PER_KM = 0.14;

// ─────────────────────────────────────────────────────────────────────────────
// Upgrades (DESIGN §6) — ids are read by the engine as s.flags['upg:<id>']
// ─────────────────────────────────────────────────────────────────────────────

export const UPGRADES: Upgrade[] = [
  {
    id: 'bodycam',
    name: T('Kehakaamerad', 'Body cameras'),
    desc: T('Kõik patrullid kannavad kehakaamerat: kaebusi 50 % vähem, avalik usaldus kasvab.', 'Every patrol wears a body camera: 50% fewer complaints, more public trust.'),
    price: 6500,
    upkeep: 150,
    minRank: 0,
    icon: 'eye',
  },
  {
    id: 'spikes',
    name: T('Naelamatid', 'Spike strips'),
    desc: T('Patrull- ja liiklusautodes on naelamatid — jälitusi saab peatada sõiduki rehve tühjendades.', 'Patrol and traffic cars carry spike strips — pursuits can be stopped by deflating tyres.'),
    price: 3500,
    upkeep: 40,
    minRank: 1,
    icon: 'target',
  },
  {
    id: 'taser',
    name: T('Elektrišokirelvad', 'Tasers'),
    desc: T('Mittesurmav jõud: ametnike vigastuste risk väheneb 35 %.', 'Less-lethal force: officer injury risk down 35%.'),
    price: 12000,
    upkeep: 200,
    minRank: 1,
    icon: 'alert',
  },
  {
    id: 'mdt',
    name: T('Mobiilne andmeterminal (MDT)', 'Mobile data terminals (MDT)'),
    desc: T('Ekipaažid teevad registripäringud ise — vastamata päringud ei too karistust.', 'Crews run registry checks themselves — unanswered queries carry no penalty.'),
    price: 9000,
    upkeep: 250,
    minRank: 1,
    icon: 'keyboard',
  },
  {
    id: 'interpreter_line',
    name: T('Tõlketeenuse liin 24/7', '24/7 interpreter line'),
    desc: T('Vene- ja ingliskeelsete 112-kõnede tõlge 75 % kiiremini.', 'Russian and English 112 calls translated 75% faster.'),
    price: 2500,
    upkeep: 350,
    minRank: 1,
    icon: 'globe',
  },
  {
    id: 'anpr',
    name: T('ANPR numbrituvastus', 'ANPR plate recognition'),
    desc: T('Autokaamerad tuvastavad otsitavaid ja varastatud sõidukeid — rohkem tabamusi ja BOLO-jälitusi.', 'In-car cameras flag wanted and stolen vehicles — more hits and BOLO pursuits.'),
    price: 18000,
    upkeep: 300,
    minRank: 2,
    icon: 'crosshair',
  },
  {
    id: 'drone',
    name: T('Termokaameraga droon', 'Thermal camera drone'),
    desc: T('Otsingud kolm korda kiiremad, lisandub drooniüksus.', 'Area searches three times faster, adds a drone unit.'),
    price: 15000,
    upkeep: 150,
    minRank: 2,
    icon: 'eye',
  },
  {
    id: 'psychologist',
    name: T('Politseipsühholoog', 'Police psychologist'),
    desc: T('Stress ja väsimus 30 % väiksemad, moraal püsib.', 'Stress and fatigue 30% lower, morale holds.'),
    price: 3000,
    upkeep: 1400,
    minRank: 2,
    icon: 'users',
  },
  {
    id: 'firstaid',
    name: T('Taktikalise esmaabi komplektid', 'Tactical first-aid kits'),
    desc: T('Žgutid ja traumakomplektid igas autos: rasked vigastused lõppevad harvemini traagiliselt.', 'Tourniquets and trauma kits in every car: severe injuries end tragically less often.'),
    price: 2800,
    upkeep: 60,
    minRank: 0,
    icon: 'ambulance',
  },
  {
    id: 'k9kennel',
    name: T('Koerte kennel', 'K9 kennel'),
    desc: T('Teenistuskoerad ja koerajuhi väljaõpe — K9-ekipaažid otsingutel ja kinnipidamisel.', 'Service dogs and handler training — K9 crews for searches and arrests.'),
    price: 25000,
    upkeep: 600,
    minRank: 3,
    icon: 'dog',
  },
  {
    id: 'negotiation',
    name: T('Läbirääkijate väljaõpe', 'Crisis negotiator training'),
    desc: T('Uued valikud kriisiolukordades ja parem tulemus pantvangi- ja suitsiidijuhtumitel.', 'New options in crises and better outcomes in hostage and suicide incidents.'),
    price: 8000,
    upkeep: 100,
    minRank: 3,
    icon: 'mic',
  },
  {
    id: 'extra_station',
    name: T('Lisapolitseipunkt', 'Extra police post'),
    desc: T('Uus piirkonnapolitsei punkt — ekipaažid alustavad hajusamalt ja jõuavad kiiremini kohale.', 'A new community police post — crews start more spread out and arrive sooner.'),
    price: 60000,
    upkeep: 900,
    minRank: 4,
    icon: 'building',
  },
  {
    id: 'heli_hours',
    name: T('Lennusalga helikopteritunnid', 'Air unit helicopter hours'),
    desc: T('AW139 on valmisolekus: jälitused ja otsingud õhust (start 15 minutiga).', 'An AW139 on standby: pursuits and searches from the air (airborne within 15 min).'),
    price: 30000,
    upkeep: 2500,
    minRank: 5,
    icon: 'heli',
  },
  {
    id: 'kkomando',
    name: T('K-komando valmidusleping', 'K-komando standby agreement'),
    desc: T('Eriüksus on väljakutsel relvastatud ja pantvangiolukordadeks.', 'The special unit is on call for armed and hostage situations.'),
    price: 40000,
    upkeep: 3000,
    minRank: 6,
    icon: 'shield',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle catalogue
// ─────────────────────────────────────────────────────────────────────────────

export const VEHICLE_CATALOG: CatalogVehicle[] = [
  {
    id: 'skoda_scala',
    model: 'Škoda Scala',
    suits: ['community', 'aux', 'criminal'],
    price: 27000,
    upkeep: 320,
    minRank: 0,
    desc: T('Väike ja ökonoomne piirkonnapolitseiniku auto.', 'Small, economical community officer car.'),
  },
  {
    id: 'skoda_octavia_combi',
    model: 'Škoda Octavia Combi',
    suits: ['patrol', 'community', 'aux', 'traffic'],
    price: 38000,
    upkeep: 450,
    minRank: 0,
    desc: T('Klassikaline valge-sinine patrullauto, töökindel ja mahukas.', 'The classic white-and-blue patrol car, reliable and roomy.'),
  },
  {
    id: 'toyota_rav4_hybrid',
    model: 'Toyota RAV4 Hybrid AWD',
    suits: ['patrol', 'community', 'k9'],
    price: 45000,
    upkeep: 470,
    minRank: 0,
    desc: T('Nelikveoline hübriid — sobib maapiirkondadesse ja talve.', 'All-wheel-drive hybrid — good for rural areas and winter.'),
  },
  {
    id: 'vw_transporter',
    model: 'Volkswagen Transporter T6.1',
    suits: ['transport', 'patrol', 'aux'],
    price: 55000,
    upkeep: 600,
    minRank: 0,
    desc: T('Kinnipeetavate veoks ehitatud kaubik, kaks kambrit.', 'Van converted for detainee transport, two cells.'),
  },
  {
    id: 'bmw_r1250rtp',
    model: 'BMW R 1250 RT-P',
    suits: ['traffic'],
    price: 32000,
    upkeep: 300,
    minRank: 1,
    desc: T('Politsei mootorratas liiklusjärelevalveks ja ummikutes liikumiseks.', 'Police motorcycle for traffic enforcement and moving through jams.'),
  },
  {
    id: 'skoda_superb_combi',
    model: 'Škoda Superb Combi 4x4',
    suits: ['patrol', 'rapid', 'traffic'],
    price: 46000,
    upkeep: 520,
    minRank: 1,
    desc: T('Võimsam ja kiirem patrullauto maanteedele.', 'A faster, more powerful patrol car for highways.'),
  },
  {
    id: 'vw_id4_gtx',
    model: 'Volkswagen ID.4 GTX',
    suits: ['patrol', 'community'],
    price: 66000,
    upkeep: 380,
    minRank: 1,
    desc: T('Elektriline patrullauto (PPA katsetas samasugust) — odav sõita, kallis osta.', 'Electric patrol car (PPA trialled the same) — cheap to run, pricey to buy.'),
  },
  {
    id: 'skoda_kodiaq_rs',
    model: 'Škoda Kodiaq RS 4x4',
    suits: ['rapid', 'patrol', 'special'],
    price: 54000,
    upkeep: 560,
    minRank: 2,
    desc: T('Kiirreageerijate maastur: varustus ballistilistele kaitsevahenditele.', 'Rapid-response SUV with room for ballistic protection gear.'),
  },
  {
    id: 'skoda_kodiaq_k9',
    model: 'Škoda Kodiaq K9',
    suits: ['k9'],
    price: 58000,
    upkeep: 600,
    minRank: 2,
    desc: T('Koerapuuride, kliimaseadme ja kaugavaga pagasiruumiga koerajuhi auto.', 'Dog handler car with kennels, climate control and remote door release.'),
  },
  {
    id: 'audi_a6_unmarked',
    model: 'Audi A6 Avant (märgistamata)',
    suits: ['criminal', 'traffic'],
    price: 62000,
    upkeep: 650,
    minRank: 2,
    desc: T('Märgistamata auto kriminaalpolitseile ja varjatud liiklusjärelevalveks.', 'Unmarked car for detectives and covert traffic enforcement.'),
  },
  {
    id: 'bmw_530d_touring',
    model: 'BMW 530d xDrive Touring',
    suits: ['traffic', 'rapid'],
    price: 70000,
    upkeep: 750,
    minRank: 3,
    desc: T('Kiire liiklusjärelevalve auto, videosüsteemiga.', 'Fast traffic-enforcement car with a speed video system.'),
  },
  {
    id: 'toyota_land_cruiser',
    model: 'Toyota Land Cruiser',
    suits: ['border', 'patrol', 'rapid'],
    price: 78000,
    upkeep: 720,
    minRank: 3,
    desc: T('Maastur piiriäärsetele ja metsaradadele.', 'Off-roader for border strips and forest tracks.'),
  },
  {
    id: 'mb_sprinter_riot',
    model: 'Mercedes-Benz Sprinter märulibuss',
    suits: ['rapid', 'special', 'transport'],
    price: 100000,
    upkeep: 850,
    minRank: 4,
    desc: T('Avaliku korra üksuse buss kuni üheksale ametnikule.', 'Public-order van for up to nine officers.'),
  },
  {
    id: 'patrol_boat',
    model: 'Patrullkaater (Peipsi / rannik)',
    suits: ['boat'],
    price: 180000,
    upkeep: 1500,
    minRank: 5,
    desc: T('Kiirkaater järve- ja rannikuvalveks, uppumisohu ja salakaubaveo juhtumiteks.', 'Fast boat for lake and coastal patrol, drownings and smuggling.'),
  },
  {
    id: 'mb_sprinter_armoured',
    model: 'Soomustatud Mercedes-Benz Sprinter',
    suits: ['special'],
    price: 230000,
    upkeep: 1800,
    minRank: 6,
    desc: T('K-komando soomusbuss relvastatud olukordadeks.', 'K-komando armoured van for armed situations.'),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Achievements
// ─────────────────────────────────────────────────────────────────────────────

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_shift', name: T('Esimene vahetus', 'First shift'), desc: T('Lõpeta oma esimene vahetus.', 'Finish your first shift.'), icon: 'flag' },
  { id: 'perfect_night', name: T('Täiuslik öö', 'Perfect night'), desc: T('Saa vahetuse hindeks S.', 'Get an S grade for a shift.'), icon: 'star' },
  { id: 'grade_a_streak', name: T('Stabiilne tegija', 'Steady hand'), desc: T('Viis vahetust järjest vähemalt hindega A.', 'Five shifts in a row graded A or better.'), icon: 'trophy' },
  { id: 'pursuit_master', name: T('Jälitusmeister', 'Pursuit master'), desc: T('Peata karjääri jooksul 5 jälitust kinnipidamisega.', 'End 5 pursuits with an arrest over your career.'), icon: 'siren' },
  { id: 'people_reader', name: T('Inimeste tundja', 'People reader'), desc: T('10 õiget registripäringu vastust järjest.', '10 correct registry replies in a row.'), icon: 'id' },
  { id: 'nostalgia_2024', name: T('2024 nostalgia', '2024 nostalgia'), desc: T('Logisid sisse vanal moel — tühja kasutajanime ja parooliga.', 'Logged in the old way — empty username and password.'), icon: 'keyboard' },
  { id: 'legend_2025', name: T('Legendide jälil', 'On the legends’ trail'), desc: T('Otsi andmebaasist üles mõni 2025. aasta legend.', 'Look up one of the 2025 legends in the database.'), icon: 'search' },
  { id: 'lasnamae_legend', name: T('Lasnamäe legend', 'Lasnamäe legend'), desc: T('Lahenda ühe vahetusega 8 sündmust Lasnamäel.', 'Resolve 8 incidents in Lasnamäe in one shift.'), icon: 'building' },
  { id: 'island_guard', name: T('Saarte valvur', 'Guardian of the islands'), desc: T('Lahenda ühe vahetusega 5 sündmust Saaremaal, Hiiumaal või Muhus.', 'Resolve 5 incidents on Saaremaa, Hiiumaa or Muhu in one shift.'), icon: 'boat' },
  { id: 'border_watch', name: T('Idapiiri valvur', 'Eastern border watch'), desc: T('Lahenda Ida prefektuuris 50 sündmust.', 'Resolve 50 incidents in the Ida prefecture.'), icon: 'flag' },
  { id: 'zero_expired', name: T('Keegi ei jäänud ootama', 'Nobody left waiting'), desc: T('Vähemalt 15 sündmusega vahetus, kus ükski väljakutse ei aegunud.', 'A shift with at least 15 incidents and no expired call.'), icon: 'clock' },
  { id: 'lightning', name: T('Kiire nagu välk', 'Lightning fast'), desc: T('P1 sündmuste keskmine reageerimisaeg alla 7 minuti (vähemalt 3 P1).', 'Average P1 response under 7 minutes (at least 3 P1s).'), icon: 'timer' },
  { id: 'call_center', name: T('Kõnekeskus', 'Call centre'), desc: T('Vasta ühe vahetusega 10 interaktiivsele 112-kõnele.', 'Answer 10 interactive 112 calls in one shift.'), icon: 'phone' },
  { id: 'prank_hunter', name: T('Valekõnede kütt', 'Prank hunter'), desc: T('Tuvasta 3 valekõnet.', 'Unmask 3 prank calls.'), icon: 'phone-off' },
  { id: 'safe_shift', name: T('Kõik jõuavad koju', 'Everyone gets home'), desc: T('Vähemalt 20 sündmusega vahetus ilma ühegi vigastatud ametnikuta.', 'A shift with at least 20 incidents and no injured officers.'), icon: 'shield' },
  { id: 'midsummer', name: T('Jaaniöö ellujääja', 'Midsummer survivor'), desc: T('Tööta läbi jaaniöö (23.–24. juuni).', 'Work through Midsummer night (23–24 June).'), icon: 'fire' },
  { id: 'new_year', name: T('Vana-aasta öö', "New Year's Eve"), desc: T('Tööta vana-aasta öö vahetus.', "Work the New Year's Eve night shift."), icon: 'star' },
  { id: 'night_owl', name: T('Öökull', 'Night owl'), desc: T('Tööta 10 öövahetust.', 'Work 10 night shifts.'), icon: 'moon' },
  { id: 'first_payday', name: T('Esimene palgapäev', 'First payday'), desc: T('Jõua esimese 30 päeva kuuaruandeni.', 'Reach the first 30-day monthly report.'), icon: 'money' },
  { id: 'team_15', name: T('Tõeline meeskond', 'A real team'), desc: T('Palgal on vähemalt 15 ametnikku.', 'Have at least 15 officers on staff.'), icon: 'users' },
  { id: 'fleet_6', name: T('Autopark', 'Motor pool'), desc: T('Vähemalt 6 sõidukit autopargis.', 'At least 6 vehicles in the fleet.'), icon: 'car' },
  { id: 'commissioner', name: T('Komissar', 'Commissioner'), desc: T('Jõua komissari auastmeni.', 'Reach the rank of Commissioner.'), icon: 'briefcase' },
  { id: 'general', name: T('Kindral', 'General'), desc: T('Jõua politseikindrali auastmeni.', 'Reach the rank of Police General.'), icon: 'trophy' },
  { id: 'peoples_favourite', name: T('Rahva lemmik', "People's favourite"), desc: T('Staatus vähemalt 80.', 'Reach a Staatus of at least 80.'), icon: 'star' },
  { id: 'hundred_arrests', name: T('Sada kinnipidamist', 'A hundred arrests'), desc: T('Karjääri jooksul 100 kinnipidamist.', '100 arrests over your career.'), icon: 'handcuffs' },
  { id: 'centurion', name: T('Sajas vahetus', 'Centurion'), desc: T('Tööta 100 vahetust.', 'Work 100 shifts.'), icon: 'trophy' },
  { id: 'air_support', name: T('Õhutugi', 'Air support'), desc: T('Osta lennusalga helikopteritunnid.', 'Buy air unit helicopter hours.'), icon: 'heli' },
  { id: 'deep_red', name: T('Eelarve punases', 'In the red'), desc: T('Lase eelarvel miinusesse minna (ära tee nii).', 'Let the budget go negative (don’t do that).'), icon: 'warning' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Budget
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Daily base budget per prefecture (€). Põhja handles ~46 % of 112 calls (research
 * 112-and-priorities.md §1.3), so it gets the most; Lääne the least.
 */
export const DAILY_BUDGET: Record<RegionId, number> = { pohja: 1600, ida: 1250, louna: 1250, laane: 1100 };
export const START_MONEY = 10000;
export const START_REPUTATION = 25;
/** Hiring cost = first month's salary paid up front (incl. uniform & gear), as in the 2025 version. */
export const HIRE_COST_MONTHS = 1;
/** Severance when firing: half a month's salary. */
export const SEVERANCE_MONTHS = 0.5;
/** Resale value of a vehicle = price × 60 % × condition. */
export const RESALE_FACTOR = 0.6;
/** Maximum staff size. */
export const MAX_STAFF = 40;
