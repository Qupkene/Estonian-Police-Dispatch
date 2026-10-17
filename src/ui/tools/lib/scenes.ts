/**
 * Director "Stseenid": scripted sequences of incidents & radio lines for filming.
 * Templates are resolved at play time by tags/keywords/category (content lands concurrently),
 * coordinates are real Tallinn/Harjumaa spots in Põhja and region-centre offsets elsewhere.
 */
import type { IncidentCategory, IncidentTemplate, LngLat, Priority, RadioMsg, RegionId, Text } from '@/sim/types';
import { fold } from './helpers';

export interface TemplatePick {
  tags?: string[];
  keywords?: string[];
  categories?: IncidentCategory[];
}

export interface SceneWhere {
  /** Exact spot when playing in Põhja prefecture. */
  pohja: LngLat;
  /** Offset from the region centre (km east, km north) for other prefectures. */
  offsetKm: [number, number];
}

export type SceneStep =
  | { at: number; kind: 'focus'; where: SceneWhere; zoom: number }
  | { at: number; kind: 'incident'; pick: TemplatePick; where: SceneWhere; priority?: Priority; summary: Text; dispatch?: number }
  | { at: number; kind: 'radio'; from: string; text: Text; level?: RadioMsg['level'] };

export interface Scene {
  id: string;
  title: Text;
  desc: Text;
  icon: 'car' | 'shield' | 'fire' | 'snow';
  steps: SceneStep[];
}

/** Best template for a pick: tags ×3, keywords ×2, category ×1. Falls back to the first template. */
export function pickTemplate(templates: IncidentTemplate[], pick: TemplatePick): IncidentTemplate | undefined {
  let best: IncidentTemplate | undefined;
  let bestScore = 0;
  for (const tpl of templates) {
    if (tpl.easterEgg) continue;
    const hay = fold(`${tpl.title.et} ${tpl.title.en} ${tpl.id} ${tpl.code}`);
    let score = 0;
    for (const tag of pick.tags ?? []) if (tpl.tags?.includes(tag)) score += 3;
    for (const kw of pick.keywords ?? []) if (hay.includes(fold(kw))) score += 2;
    if (pick.categories?.includes(tpl.category)) score += 1;
    if (score > bestScore) {
      best = tpl;
      bestScore = score;
    }
  }
  return best ?? templates.find((t) => !t.easterEgg) ?? templates[0];
}

export function resolveWhere(where: SceneWhere, regionId: RegionId, center: LngLat): LngLat {
  if (regionId === 'pohja') return where.pohja;
  const [dx, dy] = where.offsetKm;
  const lat = center[1] + dy / 111.32;
  const lon = center[0] + dx / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  return [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];
}

/** Replace {u1} {u2} {u3} with unit callsigns. */
export function fillUnits(text: Text, units: Record<string, string>): Text {
  const f = (s: string) => s.replace(/\{(u\d)\}/g, (m, k: string) => units[k] ?? m);
  return { et: f(text.et), en: f(text.en) };
}

export function sceneDuration(sc: Scene): number {
  return Math.max(0, ...sc.steps.map((s) => s.at));
}

const T = (et: string, en: string): Text => ({ et, en });

const LAAGNA: SceneWhere = { pohja: [24.835, 59.4365], offsetKm: [2, 1] };
const MUSTAKIVI: SceneWhere = { pohja: [24.866, 59.4415], offsetKm: [4, 1.5] };
const VIRU: SceneWhere = { pohja: [24.7495, 59.4366], offsetKm: [0, 0] };
const HARBOUR: SceneWhere = { pohja: [24.7618, 59.4428], offsetKm: [1, 1] };
const PIRITA: SceneWhere = { pohja: [24.8082, 59.4683], offsetKm: [3, 3] };
const KUUSALU: SceneWhere = { pohja: [25.4405, 59.4475], offsetKm: [15, 4] };
const NOMME: SceneWhere = { pohja: [24.6858, 59.3826], offsetKm: [-3, -4] };
const KEILAJOA: SceneWhere = { pohja: [24.3128, 59.3928], offsetKm: [-14, -2] };
const KOSE: SceneWhere = { pohja: [25.1651, 59.1855], offsetKm: [8, -12] };
const E263_38: SceneWhere = { pohja: [25.1242, 59.2105], offsetKm: [10, -15] };
const E263_36: SceneWhere = { pohja: [25.0985, 59.2252], offsetKm: [9, -13] };

export const SCENES: Scene[] = [
  {
    id: 'laagna-chase',
    icon: 'car',
    title: T('Öine jälitus Laagna teel', 'Night chase on Laagna tee'),
    desc: T(
      'ANPR-tabamus, varastatud auto, jälitus läbi Lasnamäe ja avarii Mustakivi ristmikul.',
      'ANPR hit, a stolen car, a chase through Lasnamäe and a crash at the Mustakivi junction.',
    ),
    steps: [
      { at: 0, kind: 'focus', where: LAAGNA, zoom: 13.5 },
      {
        at: 0,
        kind: 'incident',
        pick: { tags: ['vehicle_flee', 'pursuit', 'anpr', 'stolen'], keywords: ['anpr', 'varastatud', 'stolen', 'jälitus', 'pursuit', 'peatumata'], categories: ['alarm', 'traffic'] },
        where: LAAGNA,
        priority: 1,
        dispatch: 2,
        summary: T(
          'Lasnamäe, Laagna tee. Numbrituvastuskaamera tabas varastatud sõiduautot (hall Audi A6). Juht ei allu peatumismärguandele ja liigub suurel kiirusel ida suunas.',
          'Lasnamäe, Laagna tee. An ANPR camera flagged a stolen car (grey Audi A6). The driver ignores the signal to stop and is speeding east.',
        ),
      },
      { at: 3, kind: 'radio', from: '{u1}', level: 'emergency', text: T('{u1}, sõiduk ei peatu! Alustame jälitust Laagna teel, suund ida, kiirus üle saja.', '{u1}, vehicle not stopping! Starting pursuit on Laagna tee, heading east, speed over a hundred.') },
      { at: 8, kind: 'radio', from: 'JK', level: 'priority', text: T('Kõik ekipaažid: Laagna teel jälitus, hall Audi A6. {u2}, katke Mustakivi ristmik.', 'All units: pursuit on Laagna tee, grey Audi A6. {u2}, cover the Mustakivi junction.') },
      { at: 13, kind: 'radio', from: '{u2}', level: 'priority', text: T('{u2}, selge, liigume Mustakivi ristmikule ja paneme tõkke.', '{u2}, copy, moving to the Mustakivi junction to block it.') },
      { at: 20, kind: 'radio', from: '{u1}', level: 'emergency', text: T('{u1}, sõitis punasega üle Kuristiku ristmiku, liiklus hõre, jätkame.', '{u1}, he ran the red light at Kuristiku, traffic is light, continuing.') },
      {
        at: 28,
        kind: 'incident',
        pick: { keywords: ['liiklusõnnetus', 'avarii', 'kokkupõrge', 'crash', 'collision'], categories: ['traffic'] },
        where: MUSTAKIVI,
        priority: 2,
        summary: T(
          'Laagna tee ja Mustakivi tee ristmik. Jälitatav sõiduk paiskus vastu valgusfoori posti, juht põgenes jalgsi kaubanduskeskuse suunas.',
          'Laagna tee / Mustakivi tee junction. The pursued car hit a traffic-light pole; the driver fled on foot towards the shopping centre.',
        ),
      },
      { at: 32, kind: 'radio', from: '{u2}', level: 'emergency', text: T('{u2}, juht jookseb kaubanduskeskuse poole! Jälitame jalgsi, vajame koerajuhti.', '{u2}, the driver is running towards the mall! Pursuing on foot, need a K9 unit.') },
      { at: 40, kind: 'radio', from: '{u1}', level: 'priority', text: T('{u1}, kahtlustatav peeti kinni parkla taga. Vigastusi ei ole, vajame konvoid.', '{u1}, suspect detained behind the car park. No injuries, we need a transport unit.') },
    ],
  },
  {
    id: 'oldtown-bank',
    icon: 'shield',
    title: T('Pangarööv vanalinnas', 'Bank robbery in the Old Town'),
    desc: T('Relvastatud rööv pangakontoris ja põgenemine kaubikuga sadama suunas.', 'Armed robbery at a bank branch and a getaway van heading for the harbour.'),
    steps: [
      { at: 0, kind: 'focus', where: VIRU, zoom: 15 },
      {
        at: 0,
        kind: 'incident',
        pick: { tags: ['armed', 'robbery'], keywords: ['rööv', 'pank', 'robbery', 'bank'], categories: ['property', 'violence'] },
        where: VIRU,
        priority: 1,
        dispatch: 3,
        summary: T(
          'Vanalinn, Viru tn. Pangakontoris relvastatud rööv: kaks maskis meest, ühel käes käsitulirelv. Turvatöötaja vajutas paanikanuppu, kontoris on inimesi.',
          'Old Town, Viru street. Armed robbery at a bank branch: two masked men, one with a handgun. The guard pressed the panic button; people are inside.',
        ),
      },
      { at: 4, kind: 'radio', from: 'HK', level: 'priority', text: T('Häirekeskus: helistaja kinnitab, et kaks meest lahkusid tumeda kaubikuga Mere puiestee suunas.', 'ERC: the caller confirms two men left in a dark van towards Mere puiestee.') },
      { at: 9, kind: 'radio', from: '{u1}', level: 'priority', text: T('{u1}, kohal Viru väravate juures. Ala piiratud, kahtlustatavaid ei ole näha, töötajad vigastusteta.', '{u1}, on scene at the Viru Gates. Area cordoned off, no suspects in sight, staff unharmed.') },
      {
        at: 15,
        kind: 'incident',
        pick: { tags: ['bolo', 'suspicious_vehicle'], keywords: ['kahtlane', 'sõiduk', 'suspicious', 'vehicle'], categories: ['alarm', 'property', 'public_order'] },
        where: HARBOUR,
        priority: 2,
        dispatch: 1,
        summary: T(
          'Sadama piirkond, Lootsi tn. Parklas seisab tume kaubik, mootor töötab, sees istuvad kaks meest.',
          'Harbour area, Lootsi street. A dark van in a car park, engine running, two men sitting inside.',
        ),
      },
      { at: 21, kind: 'radio', from: 'JK', level: 'emergency', text: T('Kõigile üksustele: kahtlustatavad on relvastatud. Üksi mitte läheneda, oodata K-komandot.', 'All units: the suspects are armed. Do not approach alone, wait for the special unit.') },
      { at: 30, kind: 'radio', from: '{u2}', level: 'priority', text: T('{u2}, kaubik blokeeritud Lootsi tänaval, kaks meest maas, relv kõrvaldatud.', '{u2}, van blocked on Lootsi street, two men on the ground, weapon secured.') },
    ],
  },
  {
    id: 'jaaniöö',
    icon: 'fire',
    title: T('Jaaniöö kaos', 'Midsummer night chaos'),
    desc: T('Lõkked, kaklused ja joobes juhid üle kogu piirkonna, kõik korraga.', 'Bonfires, fights and drunk drivers all over the region, all at once.'),
    steps: [
      { at: 0, kind: 'focus', where: PIRITA, zoom: 10.5 },
      {
        at: 0,
        kind: 'incident',
        pick: { keywords: ['kaklus', 'fight', 'kehaline'], categories: ['violence', 'public_order'] },
        where: PIRITA,
        priority: 2,
        dispatch: 1,
        summary: T('Pirita rand. Jaanitule juures kakleb umbes kümme noormeest, ühel on peast veri. Turvatöötajaid ei ole.', 'Pirita beach. Around ten young men fighting by the bonfire, one bleeding from the head. No security staff.'),
      },
      {
        at: 5,
        kind: 'incident',
        pick: { keywords: ['joobes juht', 'joobes', 'drunk', 'roolis'], categories: ['traffic'] },
        where: KUUSALU,
        priority: 2,
        summary: T('Tallinna–Narva maantee Kuusalu lähistel. Looklevalt sõitev sõiduauto, juht ilmselt joobes, teataja sõidab järel.', 'Tallinn–Narva highway near Kuusalu. A car weaving across lanes, the driver apparently drunk; the caller is following.'),
      },
      { at: 9, kind: 'radio', from: 'HK', level: 'routine', text: T('Häirekeskus: jaaniõhtu, kõnesid on kaks korda tavalisest rohkem, järjekord pikeneb.', 'ERC: Midsummer eve, call volume is double the usual, the queue is growing.') },
      {
        at: 13,
        kind: 'incident',
        pick: { keywords: ['perevägivald', 'lähisuhte', 'domestic'], categories: ['domestic'] },
        where: NOMME,
        priority: 1,
        dispatch: 1,
        summary: T('Nõmme, eramu. Naine teatab, et joobes elukaaslane lõhub mööblit ja ähvardab teda. Majas on kaks last.', 'Nõmme, private house. A woman reports her drunk partner is smashing furniture and threatening her. Two children are in the house.'),
      },
      {
        at: 18,
        kind: 'incident',
        pick: { keywords: ['lõke', 'tulekahju', 'fire', 'põleng'], categories: ['environment', 'public_order', 'assist'] },
        where: KEILAJOA,
        priority: 3,
        summary: T('Keila-Joa. Kontrolli alt väljunud lõke metsa ääres, tuul kannab sädemeid, pidulised ei suuda seda kustutada.', 'Keila-Joa. An out-of-control bonfire at the forest edge, the wind is carrying sparks and the partygoers cannot put it out.'),
      },
      { at: 22, kind: 'radio', from: '{u1}', level: 'priority', text: T('{u1}, Pirital olukord kontrolli all, kaks isikut toimetame kainenema.', '{u1}, Pirita is under control, taking two people to sober up.') },
      {
        at: 27,
        kind: 'incident',
        pick: { keywords: ['uppumine', 'kadunud', 'ujuja', 'drowning', 'missing'], categories: ['missing', 'assist'] },
        where: KOSE,
        priority: 1,
        summary: T('Kose, järve ääres. Seltskonnast läks üks mees öösel ujuma ega tulnud tagasi. Kaldal on tema riided.', 'Kose, by the lake. A man from the group went swimming at night and did not come back. His clothes are on the shore.'),
      },
      { at: 33, kind: 'radio', from: 'JK', level: 'emergency', text: T('Kõik vabad ekipaažid: prioriteet Kose järv, võimalik uppumine. Pääste on teavitatud.', 'All free units: priority is Kose lake, possible drowning. Rescue has been notified.') },
    ],
  },
  {
    id: 'winter-crash',
    icon: 'snow',
    title: T('Talvine avarii maanteel', 'Winter crash on the highway'),
    desc: T('Jäine Tallinna–Tartu maantee: sõiduauto ja veoki kokkupõrge, seejärel ahelavarii.', 'Icy Tallinn–Tartu highway: a car and a truck collide, followed by a chain crash.'),
    steps: [
      { at: 0, kind: 'focus', where: E263_38, zoom: 12 },
      {
        at: 0,
        kind: 'incident',
        pick: { keywords: ['liiklusõnnetus', 'kannatanu', 'avarii', 'kokkupõrge', 'injur', 'crash'], categories: ['traffic'] },
        where: E263_38,
        priority: 1,
        dispatch: 2,
        summary: T(
          'Tallinna–Tartu maantee (E263), 38. km. Libedal teel paiskus sõiduauto vastassuunavööndisse ja põrkas kokku veokiga. Sõidukis on kinni kaks inimest.',
          'Tallinn–Tartu highway (E263), km 38. On the icy road a car slid into the oncoming lane and collided with a truck. Two people are trapped in the car.',
        ),
      },
      { at: 4, kind: 'radio', from: 'HK', level: 'priority', text: T('Häirekeskus: kiirabi ja pääste on väljasõidul, saabumine umbes 15 minuti pärast.', 'ERC: ambulance and rescue are en route, arriving in about 15 minutes.') },
      { at: 10, kind: 'radio', from: '{u1}', level: 'priority', text: T('{u1}, kohal. Maantee suletud mõlemas suunas, vajame liiklusreguleerimist ja liivaautot.', '{u1}, on scene. The highway is closed both ways, we need traffic control and a gritter.') },
      {
        at: 16,
        kind: 'incident',
        pick: { keywords: ['ahelavarii', 'liiklusõnnetus', 'kokkupõrge', 'crash'], categories: ['traffic'] },
        where: E263_36,
        priority: 2,
        summary: T('Tallinna–Tartu maantee, 36. km. Seisvale kolonnile sõitis tagant otsa kolm sõidukit, üks inimene kaebab kaelavalu.', 'Tallinn–Tartu highway, km 36. Three cars ran into the back of the stationary queue; one person complains of neck pain.'),
      },
      { at: 22, kind: 'radio', from: '{u2}', level: 'routine', text: T('{u2}, ümbersõit Kose kaudu on avatud, liiklus liigub aeglaselt.', '{u2}, the diversion via Kose is open, traffic is moving slowly.') },
      { at: 30, kind: 'radio', from: '{u1}', level: 'routine', text: T('{u1}, kannatanud on kiirabile üle antud, ootame teehooldemasinat.', '{u1}, the casualties have been handed over to the ambulance, waiting for the road maintenance truck.') },
    ],
  },
];
