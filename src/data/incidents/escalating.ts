/**
 * Escalating stories (part 1): calls that start as one thing and turn into another while the
 * dispatcher decides. Most of them carry a pre-arrival `escalation` (the situation gets worse if
 * nobody is on scene in time, and the first detail shown on acknowledgement hints at it), plus
 * on-scene decisions, backup requests and agency calls that decide how the story ends.
 *
 * Fair by design: a unit on scene before `escalation.afterMin` prevents the escalation, the best
 * choice in every decision has the highest success effect, and the worst endings only fit low
 * success scores. Law references stay in outcome texts (the report), never in radio lines.
 *
 * The small builders below are shared with stories.ts (part 2).
 */
import type {
  Agency,
  AgencyBeat,
  BackupBeat,
  BeatAt,
  ChoiceBeat,
  ChoiceOption,
  Effects,
  EscalateBeat,
  IncidentTemplate,
  InfoBeat,
  OutcomeResult,
  OutcomeSpec,
  PersonRole,
  Priority,
  PursuitBeat,
  QueryBeat,
  SearchBeat,
  Text,
  TransportBeat,
  UnitNeed,
  UnitType,
} from '@/sim/types';
import { T } from '@/sim/text';

export { T };

// ─── Builders ───────────────────────────────────────────────────────────────

/** Unit need shorthand. */
export const u = (type: UnitType | 'any', count = 1): UnitNeed => ({ type, count });

/** Outcome with an inclusive success window; 0 and 1 stay open. */
export function out(
  id: string,
  result: OutcomeResult,
  win: [number, number],
  weight: number,
  text: Text,
  extra: Pick<OutcomeSpec, 'arrests' | 'injuries' | 'trust' | 'radio'> = {},
): OutcomeSpec {
  const o: OutcomeSpec = { id, result, weight, text, ...extra };
  if (win[0] > 0) o.minSuccess = win[0];
  if (win[1] < 1) o.maxSuccess = win[1];
  return o;
}

function withChance<B extends { chance?: number }>(b: B, chance: number | undefined): B {
  if (chance !== undefined && chance < 1) b.chance = chance;
  return b;
}

export function qp(subject: PersonRole, at: BeatAt, radio: Text[], chance?: number): QueryBeat {
  return withChance<QueryBeat>({ kind: 'query', queryType: 'person', subject, at, radio }, chance);
}

export function qv(at: BeatAt, radio: Text[], chance?: number): QueryBeat {
  return withChance<QueryBeat>({ kind: 'query', queryType: 'vehicle', subject: 'vehicle', at, radio }, chance);
}

export function backup(
  need: UnitNeed,
  at: BeatAt,
  radio: Text[],
  o: { timeoutMin?: number; fail?: Effects; ok?: Effects; chance?: number } = {},
): BackupBeat {
  const b: BackupBeat = {
    kind: 'backup',
    at,
    need,
    radio,
    timeoutMin: o.timeoutMin ?? 6,
    failEffects: o.fail ?? { success: -0.25, risk: 0.06, trust: -4 },
    successEffects: o.ok ?? { success: 0.1 },
  };
  return withChance(b, o.chance);
}

export function agency(
  ag: Agency,
  at: BeatAt,
  radio: Text[],
  o: { timeoutMin?: number; fail?: Effects; ok?: Effects; chance?: number } = {},
): AgencyBeat {
  const b: AgencyBeat = {
    kind: 'agency',
    agency: ag,
    at,
    radio,
    timeoutMin: o.timeoutMin ?? 6,
    failEffects: o.fail ?? { success: -0.2, trust: -3 },
    successEffects: o.ok ?? { success: 0.05 },
  };
  return withChance(b, o.chance);
}

export function transport(dest: TransportBeat['dest'], at: BeatAt, radio: Text[], o: { paperwork?: [number, number]; chance?: number } = {}): TransportBeat {
  const b: TransportBeat = { kind: 'transport', dest, at, radio, paperworkMin: o.paperwork ?? (dest === 'arrest' ? [15, 30] : [5, 15]) };
  return withChance(b, o.chance);
}

export function info(at: BeatAt, radio: Text[], chance?: number): InfoBeat {
  return withChance<InfoBeat>({ kind: 'info', at, radio }, chance);
}

export function pursuit(at: BeatAt, radio: Text[], chance?: number): PursuitBeat {
  return withChance<PursuitBeat>({ kind: 'pursuit', at, radio }, chance);
}

export function search(at: BeatAt, radiusKm: number, radio: Text[], chance?: number): SearchBeat {
  return withChance<SearchBeat>({ kind: 'search', at, radiusKm, radio }, chance);
}

export function opt(id: string, label: Text, reply: Text, effects: Effects): ChoiceOption {
  return { id, label, reply, effects };
}

export function choice(
  at: BeatAt,
  radio: Text[],
  options: ChoiceOption[],
  defaultOption: string,
  o: { timeoutMin?: number; chance?: number } = {},
): ChoiceBeat {
  return withChance<ChoiceBeat>({ kind: 'choice', at, radio, options, defaultOption, timeoutMin: o.timeoutMin ?? 4 }, o.chance);
}

export function escalate(at: BeatAt, toPriority: Priority, radio: Text[], o: { need?: UnitNeed; effects?: Effects; chance?: number } = {}): EscalateBeat {
  const b: EscalateBeat = { kind: 'escalate', at, toPriority, radio };
  if (o.need) b.need = o.need;
  if (o.effects) b.effects = o.effects;
  return withChance(b, o.chance);
}

// ─── Shared radio lines ─────────────────────────────────────────────────────

export const R_SUSPECT: Text[] = [
  T('Juhtimiskeskus, {callsign}. Palun kontrolli isikut {name}, isikukood {idcode}.', 'Control, {callsign}. Please check {name}, ID code {idcode}.'),
  T('{callsign}: isik ütleb nimeks {name}, isikukood {idcode}. Kas on tagaotsitav või kehtib mõni keeld?', '{callsign}: the person gives the name {name}, ID code {idcode}. Any warrants or court orders?'),
];

export const R_DRIVER: Text[] = [
  T('Juhtimiskeskus, {callsign}. Juht on {name}, isikukood {idcode}. Palun kontrolli juhtimisõigust.', 'Control, {callsign}. The driver is {name}, ID code {idcode}. Please check the licence.'),
  T('{callsign}: juht {name}, isikukood {idcode}. Kas juhtimisõigus kehtib, kas on tagaotsitav?', '{callsign}: driver {name}, ID code {idcode}. Is the licence valid, any warrants?'),
];

export const R_MISSING: Text[] = [
  T('Juhtimiskeskus, {callsign}. Leidsime kirjeldusele vastava mehe: {name}, isikukood {idcode}. Palun kontrolli.', 'Control, {callsign}. We have found a man matching the description: {name}, ID code {idcode}. Please check.'),
];

export const R_ARREST: Text[] = [
  T('{callsign}: kinnipeetu on autos, toimetame ta arestimajja.', '{callsign}: detainee in the car, taking them to the arrest house.'),
  T('{callsign}: isik kinni peetud, liigume arestimaja poole.', '{callsign}: person detained, heading for the arrest house.'),
];

// ─── Templates ──────────────────────────────────────────────────────────────

export const TEMPLATES_ESCALATING: IncidentTemplate[] = [
  // 1. A noise complaint at a student flat that turns into a fight when nobody comes.
  {
    id: 'public_order_tudengipidu_kakluseks',
    category: 'public_order',
    code: 'ÖR',
    title: T('Tudengipidu üürikorteris', 'Student party in a rented flat'),
    priority: 3,
    weight: 1.5,
    hours: 'nightlife',
    weekendBoost: 1.7,
    months: [1, 2, 3, 4, 5, 9, 10, 11, 12],
    places: ['residential'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [20, 45],
    persons: [
      { role: 'caller', gender: 'any', age: [35, 80], relation: 'neighbour' },
      { role: 'suspect', gender: 'M', age: [19, 27], intoxicated: 0.85, record: 0.15 },
      { role: 'victim', gender: 'M', age: [19, 26], intoxicated: 0.7 },
    ],
    summary: [
      T(
        '{address}. Naabri teatel on üürikorteris juba kolmandat tundi tudengipidu, muusika põrutab ja trepikojas karjutakse. Väikesed lapsed ei saa magada.',
        '{address}. A neighbour reports a student party in a rented flat for the third hour running: pounding music and shouting in the stairwell. Small children cannot sleep.',
      ),
      T(
        '{address}. Ülemisest korterist kostab valju muusikat ja trampimist, rõdult visatakse pudeleid. Teataja on mitu korda uksele koputanud, keegi ei ava.',
        '{address}. Loud music and stamping from the flat above, bottles thrown off the balcony. The caller has knocked several times; nobody opens.',
      ),
      T(
        '{address}. Öörahu rikkumine: noorte pidu, trepikojas suitsetatakse ja sõimatakse naabreid.',
        '{address}. Night-time noise: a youth party, people smoking in the stairwell and abusing the neighbours.',
      ),
    ],
    callerLines: [
      T(
        'Kell on palju, aga ülevalt tuleb ikka seda bassi. Käisin ütlemas, mulle öeldi, et mine magama, vanaema.',
        'It is late and the bass is still coming from upstairs. I went to say something and was told to go to bed, granny.',
      ),
      T(
        'Trepikojas on kümme noort, nad karjuvad ja keegi virutas just ukse vastu seina. Mul on väike laps kodus.',
        'There are ten young people in the stairwell, shouting, and someone just slammed a door into the wall. I have a small child at home.',
      ),
      T(
        'Nüüd tuli veel üks seltskond juurde ja nad otsivad kedagi. Kõlab, nagu oleks tüli tulemas.',
        'Another group has just turned up and they are looking for someone. It sounds like trouble.',
      ),
    ],
    details: [
      T(
        'Teataja kuulis, et peole saabus teine seltskond, kes tuli kellegagi arveid klaarima.',
        'The caller heard that a second group has arrived at the party to settle a score with someone.',
      ),
      T('Korter on lühiajaliselt välja üüritud ja omanik ei vasta telefonile.', 'The flat is let short-term and the owner is not answering the phone.'),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, trepikojas on katkised pudelid ja segadus. Läheme üles.',
          '{callsign}: on scene, broken bottles and chaos in the stairwell. Going up.',
        ),
      ]),
      choice(
        4,
        [
          T(
            '{callsign}: korteris on paarkümmend noort, enamik joobes. Üürnik vabandab, aga külalised norivad tüli. Kas lõpetame peo?',
            '{callsign}: about twenty young people inside, most of them drunk. The tenant apologises but the guests are looking for trouble. Do we end the party?',
          ),
        ],
        [
          opt(
            'end',
            T('Lõpetage pidu, külalised laiali', 'End the party, send the guests home'),
            T('{callsign}, lõpetage pidu, külalised saatke ükshaaval välja ja pange nimed kirja.', '{callsign}, end the party, see the guests out one by one and take their names.'),
            { success: 0.15, time: 15 },
          ),
          opt(
            'warn',
            T('Hoiatus, muusika vaiksemaks', 'Warning, music down'),
            T('{callsign}, tehke üürnikule hoiatus ja jälgige, et muusika jääks vaikseks.', '{callsign}, warn the tenant and make sure the music stays down.'),
            { success: -0.05, time: 5, risk: 0.04 },
          ),
        ],
        'warn',
      ),
      backup(
        u('patrol'),
        8,
        [
          T(
            '{callsign}: trepikojas läks kakluseks, meid on liiga vähe. Vajame kiiresti teist ekipaaži!',
            '{callsign}: a fight has broken out in the stairwell and there are too few of us. Need another crew fast!',
          ),
        ],
        { chance: 0.35, timeoutMin: 6, fail: { success: -0.25, risk: 0.08, trust: -4, outcome: 'injured' }, ok: { success: 0.1, outcome: 'fight' } },
      ),
      qp('suspect', 12, R_SUSPECT, 0.7),
    ],
    outcomes: [
      out(
        'quiet',
        'warning',
        [0.45, 1],
        4,
        T(
          'Muusika vaikis ja külalised hakkasid laiali minema. Üürnikule tehti hoiatus, korteri omanikku teavitati.',
          'The music stopped and the guests started to leave. The tenant was warned and the flat owner informed.',
        ),
        { radio: T('{callsign}: muusika vaikis, külalised lähevad laiali, lõpetame.', '{callsign}: music off, guests leaving, closing.') },
      ),
      out(
        'fine',
        'fine',
        [0.55, 1],
        3,
        T(
          'Üürniku suhtes alustati väärteomenetlust öörahu rikkumise eest KorS § 56 järgi. Muusika vaikis ja trepikoda koristati.',
          'Misdemeanour proceedings were opened against the tenant for breaching the night-time peace under KorS § 56. The music stopped and the stairwell was cleaned up.',
        ),
      ),
      out(
        'fight',
        'arrest',
        [0.4, 0.85],
        2,
        T(
          'Trepikojas kakelnud noormees peeti kinni. Kannatanul oli marrastus, kiirabi abi ta ei vajanud. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'A young man who had been fighting in the stairwell was detained. The victim had a graze and needed no ambulance. Criminal proceedings were opened under KarS § 121.',
        ),
        { arrests: 1 },
      ),
      out(
        'injured',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Trepikojas puhkes kaklus. Üks noormees kukkus trepist ja toimetati kiirabiga haiglasse, lööjad pääsesid segaduses minema. Alustati kriminaalmenetlust.',
          'A fight broke out in the stairwell. One young man fell down the stairs and was taken to hospital by ambulance; the attackers slipped away in the confusion. Criminal proceedings were opened.',
        ),
        { injuries: 1, radio: T('{callsign}: üks noormees haiglasse, lööjad pääsesid.', '{callsign}: one young man to hospital, attackers got away.') },
      ),
      out(
        'damage',
        'report',
        [0, 0.4],
        2,
        T(
          'Pidu lõpetati, kuid trepikojas olid postkastid ja aknaklaas puruks löödud. Alustati menetlust asja kahjustamise kohta, üürnikule koostati väärteoprotokoll.',
          'The party was ended, but the letterboxes and a window in the stairwell had been smashed. Proceedings for criminal damage were opened and the tenant was given a misdemeanour report.',
        ),
        { radio: T('{callsign}: pidu lõpetatud, trepikojas lõhutud, vormistame.', '{callsign}: party over, damage in the stairwell, processing.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.55,
      toPriority: 2,
      text: T(
        'Teataja: trepikojas käib kaklus, keegi kukkus trepist alla ja ei tõuse.',
        'Caller: there is a fight in the stairwell, someone fell down the stairs and is not getting up.',
      ),
    },
    expiresMin: 120,
    interactiveChance: 0.25,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Ülemises korteris on juba kolm tundi pidu, bass põrutab ja trepikojas karjutakse. Ma ei saa magada!',
          'There has been a party upstairs for three hours, the bass is pounding and people are shouting in the stairwell. I cannot sleep!',
        ),
        T(
          'Naaberkorteris on tudengid, rõdult visatakse pudeleid ja trepikojas on paarkümmend inimest.',
          'There are students next door, bottles are being thrown off the balcony and there are about twenty people in the stairwell.',
        ),
      ],
      answers: {
        count: [T('Neid on seal vähemalt kakskümmend, pluss need, kes trepil suitsetavad.', 'At least twenty of them, plus the ones smoking on the stairs.')],
        intoxicated: [T('Kõik on purjus, üks oksendas trepil.', 'They are all drunk, one of them threw up on the stairs.')],
        weapons: [T('Relvi ma ei näinud, aga pudeleid on igal pool.', 'I did not see any weapons, but there are bottles everywhere.')],
      },
      answersRu: {
        count: ['Их там минимум двадцать, плюс те, кто на лестнице курит.'],
        intoxicated: ['Все пьяные, одного на лестнице стошнило.'],
        weapons: ['Оружия я не {видел|видела}, но бутылки везде.'],
      },
      openingRu: [
        'Сверху уже три часа гулянка, басы гремят, в подъезде орут. Я не могу спать!',
        'У соседей студенты, с балкона бросают бутылки, в подъезде человек двадцать.',
      ],
    },
    tags: ['noise', 'students', 'youth', 'alcohol', 'group'],
  },

  // 2. "Someone is trying car doors" that turns out to be a garage burglary in progress.
  {
    id: 'property_garaazide_murdvargus',
    category: 'property',
    code: 'MV',
    title: T('Kahtlane isik garaažide juures', 'Suspicious person at the garages'),
    priority: 3,
    weight: 1.1,
    hours: 'night',
    places: ['residential', 'street'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('k9')] },
    onScene: [30, 70],
    persons: [
      { role: 'caller', gender: 'any', age: [40, 80], relation: 'neighbour' },
      { role: 'suspect', gender: 'M', age: [20, 45], record: 0.6, wanted: 0.15 },
      { role: 'suspect', gender: 'M', age: [18, 40], record: 0.5 },
    ],
    vehicles: [{ role: 'suspect', kind: 'van', driverRole: 'suspect', stolen: 0.3, noInsurance: 0.2 }],
    summary: [
      T(
        '{address}. Teataja nägi maja taga parklas meest, kes käis autode vahel ja proovis uksi. Nüüd läks mees garaažide poole.',
        '{address}. The caller saw a man in the car park behind the building going from car to car trying the doors. He has now gone towards the garages.',
      ),
      T(
        '{address}. Garaažiboksi juures liigub taskulambiga mees, kes kontrollib garaažiuste lukke. Teataja jälgib aknast.',
        '{address}. A man with a torch is moving along the garage block checking the locks. The caller is watching from a window.',
      ),
    ],
    callerLines: [
      T('Üks mees käib siin autode vahel ja tõmbab ukselinkidest. Nüüd läks ta garaažide poole.', 'A man is going round the cars pulling the door handles. Now he has gone towards the garages.'),
      T('Garaažide juures seisab tuled kustus kaubik ja kostab sellist lõikamise häält.', 'There is a van with its lights off by the garages and a kind of cutting noise.'),
      T('Neid on kaks, üks valvab nurga peal. Ma ei julge välja minna.', 'There are two of them, one is keeping watch at the corner. I do not dare go out.'),
    ],
    details: [
      T(
        'Teataja kuulis garaažiboksist metalli lõikamise häält, nurga taga seisab tuled kustus kaubik.',
        'The caller heard metal being cut inside a garage; a van with its lights off is parked round the corner.',
      ),
      T('Garaažiühistus on kuu aja jooksul olnud kolm sissemurdmist, varastati tööriistu ja rehve.', 'There have been three break-ins at the garage block in the last month; tools and tyres were stolen.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal, garaažide vahel on pime ja ühe boksi uks on paokil. Kas läheme kohe sisse või ootame, kuni teine ekipaaž katab tagumise väljapääsu?',
            '{callsign}: on scene, it is dark between the garages and one door is ajar. Do we go in now or wait until a second crew covers the back way out?',
          ),
        ],
        [
          opt(
            'wait',
            T('Oodake teist ekipaaži', 'Wait for the second crew'),
            T('{callsign}, jälgige varjatult, teine ekipaaž katab tagumise väljapääsu.', '{callsign}, observe from cover, a second crew will cover the back.'),
            { success: 0.15, time: 8 },
          ),
          opt(
            'go',
            T('Minge kohe peale', 'Move in now'),
            T('{callsign}, sekkuge kohe ja andke teada, kui keegi põgeneb.', '{callsign}, move in now and call it if anyone runs.'),
            { success: -0.05, risk: 0.06 },
          ),
        ],
        'go',
        { timeoutMin: 3 },
      ),
      search(4, 1.5, [
        T(
          '{callsign}: kaks meest jooksid garaažide taha võsasse. Alustame otsinguid, koerajuht oleks abiks.',
          '{callsign}: two men ran into the scrub behind the garages. Starting a search, a dog handler would help.',
        ),
      ], 0.55),
      qv(8, [T('{callsign}: garaažide juurde jäi kaubik, {car}, numbrimärk {plate}. Palun kontrolli.', '{callsign}: a van was left by the garages, {car}, plate {plate}. Please run it.')]),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.55, 1],
        4,
        T(
          'Mõlemad mehed peeti garaažide juures kinni, kaubikust leiti ketaslõikur ja kolm komplekti rehve. Alustati kriminaalmenetlust KarS § 199 lg 2 järgi.',
          'Both men were detained by the garages; an angle grinder and three sets of tyres were found in the van. Criminal proceedings were opened under KarS § 199(2).',
        ),
        { arrests: 2 },
      ),
      out(
        'one_caught',
        'arrest',
        [0.35, 0.8],
        3,
        T(
          'Üks mees peeti kinni, teine põgenes garaažide taha võsasse. Kaubik ja tööriistad võeti asitõendiks ära.',
          'One man was detained; the other escaped into the scrub behind the garages. The van and tools were seized as evidence.',
        ),
        { arrests: 1 },
      ),
      out(
        'loot_found',
        'report',
        [0.3, 0.7],
        2,
        T(
          'Mehed pääsesid, kuid kaubikust leiti boksidest varastatud rehvid ja tööriistad. Kaubiku omanik on tuvastatud, kriminaalmenetlus KarS § 199 lg 2 järgi jätkub.',
          'The men got away, but the tyres and tools stolen from the garages were found in the van. The van’s owner has been identified and the case under KarS § 199(2) continues.',
        ),
        { radio: T('{callsign}: mehed pääsesid, saak kaubikus, omanik tuvastatud.', '{callsign}: the men got away, loot in the van, owner identified.') },
      ),
      out(
        'gone',
        'escaped',
        [0, 0.4],
        3,
        T(
          'Kaks garaažiboksi oli lahti murtud ja mehed pääsesid võsa kaudu minema. Omanikud selgitavad kahju suurust, alustati kriminaalmenetlust.',
          'Two garages had been broken open and the men got away through the scrub. The owners are assessing the loss; criminal proceedings were opened.',
        ),
        { radio: T('{callsign}: kaks boksi lahti murtud, mehed pääsesid.', '{callsign}: two garages broken open, the men got away.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.5,
      toPriority: 2,
      text: T(
        'Teataja: garaažiboksi uks on lahti murtud, kaks meest tassivad asju kaubikusse.',
        'Caller: a garage door has been forced and two men are carrying things to the van.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.2,
    call: {
      mood: 'whisper',
      opening: [
        T('Üks mees käib parklas autode vahel ja proovib uksi. Ma vaatan aknast, ta läks garaažide poole.', 'A man is going round the cars in the car park trying the doors. I am watching from the window, he went towards the garages.'),
        T('Garaažide juures on keegi taskulambiga, kostab lõikamise häält. Seal seisab tuled kustus kaubik.', 'Someone with a torch is at the garages, there is a cutting noise. A van is standing there with its lights off.'),
      ],
      answers: {
        count: [T('Ma nägin kahte, üks valvab nurga peal.', 'I saw two, one is keeping watch at the corner.')],
        vehicle: [T('Hele kaubik, numbrit ma siit ei näe.', 'A light-coloured van, I cannot see the number from here.')],
        weapons: [T('Relva ei näinud, ühel on mingi suur tööriist käes.', 'I did not see a weapon, one of them has some big tool.')],
      },
      answersRu: {
        count: ['Я {видел|видела} двоих, один стоит на углу на стрёме.'],
        vehicle: ['Светлый бус, номер отсюда не видно.'],
        weapons: ['Оружия не {видел|видела}, у одного в руках какой-то большой инструмент.'],
      },
      openingRu: [
        'На парковке какой-то мужчина ходит между машинами и дёргает ручки дверей. Сейчас он пошёл к гаражам.',
        'У гаражей кто-то с фонариком, слышно, как режут металл. Там стоит фургон без света.',
      ],
    },
    tags: ['suspicious'],
  },

  // 3. A petrol station clerk reports a drunk driver; pursuit on a rural road; a car in the ditch.
  {
    id: 'traffic_tanklast_lahkunud_joobes_juht',
    category: 'traffic',
    code: 'JJ',
    title: T('Tanklatöötaja teatab joobes juhist', 'Petrol station clerk reports a drunk driver'),
    priority: 2,
    weight: 1.0,
    hours: 'nightlife',
    weekendBoost: 1.6,
    places: ['gasstation', 'highway', 'ruralroad'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('traffic')] },
    onScene: [35, 75],
    persons: [
      { role: 'driver', gender: 'M', age: [22, 60], intoxicated: 0.95, noLicense: 0.35, record: 0.4, wanted: 0.05 },
      { role: 'witness', gender: 'any', age: [19, 55], relation: 'employee' },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.15, noInspection: 0.2 }],
    summary: [
      T(
        '{address}. Tankla klienditeenindaja teatel ostis ilmselgelt joobes mees õlut, istus autorooli ja sõitis minema. {car}, numbrimärk {plate}. Sõitis {direction}.',
        '{address}. A petrol station clerk reports that a clearly drunk man bought beer, got behind the wheel and drove off. {car}, plate {plate}. Heading {direction}.',
      ),
      T(
        '{address}. Tanklast lahkus joobes juht: {car}, numbrimärk {plate}. Mees komistas kassas ja jättis pangakaardi maha. Sõitis {direction}.',
        '{address}. A drunk driver has left the petrol station: {car}, plate {plate}. He stumbled at the till and left his bank card behind. Heading {direction}.',
      ),
    ],
    callerLines: [
      T('Üks mees ostis kaks õlut, vaevu seisis jalgel ja istus siis autosse. Ta sõidab ära!', 'A man bought two beers, could hardly stand and then got into his car. He is driving off!'),
      T('Ta sõitis platsilt välja ja riivas peaaegu tankurit. Numbri panin kirja.', 'He drove off the forecourt and nearly clipped a pump. I wrote the number down.'),
    ],
    details: [
      T(
        'Klienditeenindaja nägi, kuidas auto kaldus tanklast välja sõites vastassuunavööndisse.',
        'The clerk saw the car drift into the oncoming lane as it pulled out of the station.',
      ),
      T('Tankla kaamera salvestas auto ja juhi näo.', 'The station camera recorded the car and the driver’s face.'),
    ],
    beats: [
      qv('arrive', [
        T(
          '{callsign}: auto on leitud, {car}, numbrimärk {plate}, juht istub roolis. Kontrolli palun.',
          '{callsign}: we have found the car, {car}, plate {plate}, the driver is at the wheel. Please run it.',
        ),
      ]),
      qp('driver', 2, R_DRIVER),
      choice(
        5,
        [
          T(
            '{callsign}: juht keeldub alkomeetrisse puhumast ja on agressiivne. Kas viime ta haiglasse vereproovi andma?',
            '{callsign}: the driver refuses to blow and is aggressive. Do we take him to hospital for a blood sample?',
          ),
        ],
        [
          opt(
            'blood',
            T('Jah, vereproov', 'Yes, blood sample'),
            T('{callsign}, viige ta haiglasse vereproovi andma, auto teisaldada.', '{callsign}, take him to hospital for a blood sample, have the car towed.'),
            { success: 0.15, time: 25 },
          ),
          opt(
            'protocol',
            T('Tunnused protokolli', 'Record the signs'),
            T('{callsign}, vormistage keeldumine ja joobe tunnused protokolli.', '{callsign}, record the refusal and the signs of intoxication.'),
            { success: -0.05, time: 5 },
          ),
        ],
        'blood',
        { chance: 0.4 },
      ),
      pursuit(8, [
        T('{callsign}: juht pani äkki gaasi põhja ja sõidab minema! Alustame jälitust.', '{callsign}: the driver suddenly floored it and is getting away! Starting a pursuit.'),
      ], 0.3),
    ],
    outcomes: [
      out(
        'dui_crime',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Juht peeti kinni, alkomeeter näitas 2,1 promilli. Alustati kriminaalmenetlust KarS § 424 järgi, juhiluba võeti ära ja auto teisaldati.',
          'The driver was detained; the breathalyser showed 2.1 per mille. Criminal proceedings were opened under KarS § 424, the licence was seized and the car towed.',
        ),
        { arrests: 1 },
      ),
      out(
        'misdemeanour',
        'fine',
        [0.45, 1],
        2,
        T(
          'Juhil tuvastati 0,9 promilli. Alustati väärteomenetlust LS § 224 järgi, juhtimisõigus peatati ja auto teisaldati.',
          'The driver had 0.9 per mille. Misdemeanour proceedings were opened under LS § 224, the licence was suspended and the car was towed.',
        ),
      ),
      out(
        'refused',
        'report',
        [0.3, 0.75],
        2,
        T(
          'Juht keeldus puhumast ja vereproovist, joobe tunnused vormistati protokolli. Auto teisaldati, alustati kriminaalmenetlust joobes juhtimise asjaoludes.',
          'The driver refused both the breath test and a blood sample, so the signs of intoxication were recorded. The car was towed and criminal proceedings for drink-driving were opened.',
        ),
        { radio: T('{callsign}: juht keeldus, tunnused vormistatud, auto teisaldatakse.', '{callsign}: driver refused, signs recorded, car being towed.') },
      ),
      out(
        'escaped',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Juht jättis auto metsateele ja põgenes jalgsi, ta jäi leidmata. Auto teisaldati, omaniku andmed on teada ja juhi selgitab välja kriminaalpolitsei.',
          'The driver left the car on a forest track and ran off on foot; he was not found. The car was towed, the owner is known and the criminal police will identify the driver.',
        ),
        { radio: T('{callsign}: juht põgenes jalgsi, auto teisaldatakse.', '{callsign}: driver ran off on foot, car being towed.') },
      ),
      out(
        'crash',
        'tragedy',
        [0, 0.2],
        1,
        T(
          'Enne peatamist põrkas juht maanteel kokku vastutuleva autoga. Mõlemad juhid toimetati raskes seisus haiglasse. Alustati kriminaalmenetlust KarS § 424 järgi.',
          'Before he could be stopped the driver collided head-on with an oncoming car. Both drivers were taken to hospital in a serious condition. Criminal proceedings were opened under KarS § 424.',
        ),
        { injuries: 2, radio: T('{callsign}: laupkokkupõrge, kaks raskelt vigastatut.', '{callsign}: head-on collision, two seriously injured.') },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.5,
      toPriority: 1,
      text: T(
        'Möödasõitja: sama auto sõidab maanteel siksakis, vastutulijad peavad teelt kõrvale põikama.',
        'A passing driver: the same car is weaving all over the road, oncoming drivers are swerving off.',
      ),
    },
    expiresMin: 45,
    interactiveChance: 0.3,
    call: {
      mood: 'calm',
      opening: [
        T('Tere, ma olen tankla kassapidaja. Üks mees ostis õlut, on täiesti purjus ja sõitis just autoga minema.', 'Hello, I work the till at the petrol station. A man bought beer, he is completely drunk and has just driven off.'),
        T('Üks joobes juht lahkus meie tanklast, ta peaaegu sõitis tankurile otsa. Numbri panin kirja.', 'A drunk driver has just left our station, he almost hit a pump. I wrote down the number.'),
      ],
      answers: {
        vehicle: [T('{car}, number {plate}.', '{car}, number {plate}.')],
        direction: [T('Ta sõitis {direction}.', 'He drove {direction}.')],
        intoxicated: [T('Täiesti purjus, kassa juures hoidis letist kinni.', 'Completely drunk, he was holding on to the counter at the till.')],
        count: [T('Ta oli autos üksi.', 'He was alone in the car.')],
      },
      answersRu: {
        vehicle: ['{car}, номер {plate}.'],
        direction: ['Он уехал {direction}.'],
        intoxicated: ['В стельку пьяный, у кассы держался за прилавок.'],
        count: ['Он был в машине один.'],
      },
      openingRu: [
        'Здравствуйте, я кассир на заправке. Мужчина купил пиво, совсем пьяный, и только что уехал на машине.',
        'От нас уехал пьяный водитель, чуть не снёс колонку. Номер я {записал|записала}.',
      ],
    },
    tags: ['dui', 'drunk_driving', 'vehicle_flee'],
  },

  // 4. Elderly man with dementia walks out of a care home in winter.
  {
    id: 'missing_hooldekodust_lahkunud_eakas',
    category: 'missing',
    code: 'OTS',
    title: T('Eakas lahkus talvel hooldekodust', 'Elderly resident walked out of a care home in winter'),
    priority: 2,
    weight: 1.3,
    months: [11, 12, 1, 2, 3],
    hours: 'evening',
    places: ['house', 'residential', 'village'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('k9'), u('heli')] },
    onScene: [40, 90],
    persons: [
      { role: 'missing', gender: 'M', age: [78, 93] },
      { role: 'caller', gender: 'F', age: [25, 60], relation: 'employee' },
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.7, reason: T('Alajahtumise oht', 'Risk of hypothermia') }],
    summary: [
      T(
        '{address}. Hooldekodu öövalve teatel on dementsusega {age}-aastane mees kadunud. Viimati nähti teda tund aega tagasi, väljas on käre pakane.',
        '{address}. The care home night staff report that a {age}-year-old man with dementia is missing. He was last seen an hour ago; it is bitterly cold outside.',
      ),
      T(
        '{address}. Hooldekodust lahkus märkamatult eakas mees, seljas ainult kampsun ja jalas toasussid. Välisukse koodi teadsid ka elanikud.',
        '{address}. An elderly man slipped out of a care home wearing only a jumper and slippers. The residents also knew the front door code.',
      ),
    ],
    callerLines: [
      T(
        'Meil on üks härra kadunud, ta on dementne. Ta tahtis kogu õhtu koju minna, oma tallu, mida enam ei olegi.',
        'One of our gentlemen is missing, he has dementia. He wanted to go home all evening, to his farm that no longer exists.',
      ),
      T('Ta läks välja ainult sussidega! Lumel on jäljed, need lähevad maantee poole.', 'He went out in his slippers! There are footprints in the snow going towards the main road.'),
    ],
    details: [
      T(
        'Lumel on toasussi jäljed, mis viivad maantee ja bussipeatuse poole. Öösel langeb temperatuur alla -15 kraadi.',
        'Slipper prints in the snow lead towards the main road and the bus stop. The temperature will drop below -15 tonight.',
      ),
      T('Mees on varem rääkinud, et tahab bussiga koju sõita.', 'The man has said before that he wants to take the bus home.'),
    ],
    beats: [
      agency('kiirabi', 'arrive', [
        T(
          '{callsign}: kohal. Palun kiirabi juba praegu teele, mees on olnud pakases üle tunni.',
          '{callsign}: on scene. Please send an ambulance now, the man has been out in the frost for over an hour.',
        ),
      ], { timeoutMin: 6 }),
      choice(
        1,
        [
          T(
            '{callsign}: hooldekodu juhataja pakub otsingutele kõiki töötajaid ja paari külaelanikku. Kas kaasame nad?',
            '{callsign}: the care home manager is offering all the staff and a few villagers for the search. Do we use them?',
          ),
        ],
        [
          opt(
            'volunteers',
            T('Jah, kaasake, ametnik juhib', 'Yes, use them, an officer leads'),
            T('{callsign}, kaasake, jagage ala sektoriteks ja hoidke kõigiga telefoniühendust.', '{callsign}, use them, split the area into sectors and keep everyone on the phone.'),
            { success: 0.1, time: 5 },
          ),
          opt(
            'police',
            T('Ei, otsivad ainult politseinikud', 'No, police only'),
            T('{callsign}, töötajad kontrollivad maja ja hoovi, otsingud teeb politsei.', '{callsign}, staff check the building and the yard, the police do the search.'),
            { success: 0, time: 5 },
          ),
        ],
        'police',
      ),
      search(2, 1.5, [
        T(
          '{callsign}: jäljed kaovad teeservas. Alustame otsinguid, koerajuht ja droon tuleksid väga kasuks.',
          '{callsign}: the footprints disappear at the roadside. Starting a search, a dog handler and a drone would help a lot.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'found_shelter',
        'hospital',
        [0.5, 1],
        4,
        T(
          'Mees leiti kilomeetri kaugusel bussiootepaviljonist, kus ta ootas bussi koju. Ta oli alajahtunud ja toimetati kiirabiga haiglasse, elu on väljaspool ohtu.',
          'The man was found a kilometre away in a bus shelter, waiting for a bus home. He was hypothermic and was taken to hospital by ambulance; his life is not in danger.',
        ),
        { radio: T('{callsign}: mees leitud bussipaviljonist, külmunud, haiglasse.', '{callsign}: man found in a bus shelter, frozen, to hospital.') },
      ),
      out(
        'found_quick',
        'resolved',
        [0.65, 1],
        3,
        T(
          'Mees leiti koera abil hooldekodu lähedalt metsatukast. Ta oli läbi külmunud, kuid kiirabi hinnangul haiglaravi ei vajanud ja ta viidi hooldekodusse tagasi.',
          'The dog found the man in a copse near the care home. He was chilled through, but the paramedics said he did not need hospital and he was taken back to the home.',
        ),
        { radio: T('{callsign}: mees leitud, tagasi hooldekodus, lõpetame.', '{callsign}: man found, back at the care home, closing.') },
      ),
      out(
        'found_late',
        'hospital',
        [0.25, 0.6],
        2,
        T(
          'Mees leiti alles pärast pikka otsingut kraavist lumehangest. Ta oli raskelt alajahtunud ja viidi intensiivravile.',
          'The man was only found after a long search, in a snowdrift in a ditch. He was severely hypothermic and taken to intensive care.',
        ),
        { radio: T('{callsign}: mees leitud kraavist, raskelt alajahtunud.', '{callsign}: man found in a ditch, severely hypothermic.') },
      ),
      out(
        'tragedy',
        'tragedy',
        [0, 0.25],
        1,
        T(
          'Mees leiti hommikul metsatukast elutuna. Surma põhjus selgitatakse, kuriteo tunnuseid ei tuvastatud.',
          'The man was found dead in a copse in the morning. The cause of death will be established; there are no signs of a crime.',
        ),
      ),
    ],
    escalation: {
      afterMin: 25,
      chance: 0.6,
      toPriority: 1,
      text: T(
        'Hooldekodu: mehel on südamehaigus, rohud jäid maha ja temperatuur langeb kiiresti.',
        'Care home: the man has a heart condition, he left his medication behind and the temperature is falling fast.',
      ),
    },
    expiresMin: 120,
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T('Tere, helistan hooldekodust. Üks meie elanik, dementsusega härra, on kadunud ja väljas on kõva külm.', 'Hello, I am calling from a care home. One of our residents, a gentleman with dementia, is missing and it is very cold outside.'),
        T('Meil läks üks vanahärra uksest välja, ainult sussid jalas. Me ei leia teda kuskilt.', 'One of our old gentlemen has gone out of the door in just his slippers. We cannot find him anywhere.'),
      ],
      answers: {
        suspect: [T('Pikk ja kõhn, hallid juuksed, pruun kampsun ja toasussid.', 'Tall and thin, grey hair, a brown jumper and slippers.')],
        when: [T('Õhtusöögil oli ta veel laua taga, see oli umbes tund aega tagasi.', 'He was still at the table at supper, about an hour ago.')],
        direction: [T('Jäljed lähevad maantee poole, seal on bussipeatus.', 'The footprints go towards the main road, there is a bus stop there.')],
        injured: [T('Ta on habras ja tal on südamehaigus.', 'He is frail and has a heart condition.')],
      },
      answersRu: {
        suspect: ['Высокий и худой, седые волосы, коричневый свитер и домашние тапочки.'],
        when: ['За ужином он ещё сидел за столом, это было где-то час назад.'],
        direction: ['Следы ведут в сторону трассы, там автобусная остановка.'],
        injured: ['Он слабенький, и у него больное сердце.'],
      },
      openingRu: [
        'Здравствуйте, звоню из дома престарелых. Пропал наш жилец, дедушка с деменцией, а на улице сильный мороз.',
        'Один дедушка вышел на улицу в одних тапочках. Мы нигде не можем его найти.',
      ],
    },
    tags: ['elderly', 'dementia', 'search', 'weather'],
  },

  // 5. Road rage: one driver follows the other home.
  {
    id: 'violence_ahistav_juht_jalitab_koju',
    category: 'violence',
    code: 'ÄH',
    title: T('Liiklustüli: juht jälitab teist koju', 'Road rage: a driver follows another home'),
    priority: 2,
    weight: 0.9,
    hours: 'commute',
    places: ['street', 'residential', 'house'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [25, 50],
    persons: [
      { role: 'caller', gender: 'any', age: [22, 65] },
      { role: 'suspect', gender: 'M', age: [25, 55], record: 0.35, weapon: 0.1, intoxicated: 0.15 },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
    summary: [
      T(
        '{address}. Teataja sõnul vihastas üks juht ristmikul tema peale ja sõitis seejärel veerand tundi tal sabas, vilgutas tulesid ja näitas žeste. Teataja jõudis koju, mees peatus otse tema taga.',
        '{address}. The caller says another driver took offence at a junction and has followed for a quarter of an hour, flashing his lights and gesturing. The caller has reached home and the man has stopped right behind.',
      ),
      T(
        '{address}. Liiklustüli: {car}, numbrimärk {plate}, jälitas teatajat kesklinnast kodu juurde. Juht väljus autost ja karjub, teataja istub lukustatud autos.',
        '{address}. Road rage: {car}, plate {plate}, followed the caller home from the town centre. The driver has got out and is shouting; the caller is sitting in the locked car.',
      ),
    ],
    callerLines: [
      T('Üks mees sõidab mul juba linnast saati sabas. Ma ei julge koju minna, ta näeb, kus ma elan!', 'A man has been on my tail all the way from town. I do not dare go home, he will see where I live!'),
      T('Ta tuli autost välja ja tagub mu aknale. Ma istun autos, uksed on lukus.', 'He got out of his car and is banging on my window. I am sitting in the car with the doors locked.'),
      T('Mul on laps tagaistmel. Mida ma tegema pean?', 'My child is in the back seat. What should I do?'),
    ],
    details: [
      T(
        'Teataja sõnul on mees väga agressiivne, lubas „õpetada sõitma“ ja hoiab käes midagi metallist.',
        'The caller says the man is very aggressive, promised to "teach some driving manners" and is holding something metal.',
      ),
      T('Juhtimiskeskus soovitas teatajal autost mitte väljuda ja uksi mitte avada.', 'Control advised the caller to stay in the car and keep the doors locked.'),
    ],
    beats: [
      qv('arrive', [
        T(
          '{callsign}: kohal. Kontrolli palun jälitanud sõidukit, {car}, numbrimärk {plate}.',
          '{callsign}: on scene. Please run the car that followed the caller, {car}, plate {plate}.',
        ),
      ]),
      qp('suspect', 2, [
        T(
          '{callsign}: mees ütleb nimeks {name}, isikukood {idcode}. Kas tal on relvaluba või varasemaid ähvardamisi?',
          '{callsign}: the man gives the name {name}, ID code {idcode}. Does he hold a weapons permit or have previous threats on record?',
        ),
      ]),
      choice(
        5,
        [
          T(
            '{callsign}: mees eitab ähvardamist, teataja filmis telefoniga osa juhtunust. Kas võtame video kohe tõendiks ja seletused kohapeal?',
            '{callsign}: the man denies making threats; the caller filmed part of it on a phone. Do we secure the video now and take statements on the spot?',
          ),
        ],
        [
          opt(
            'statement',
            T('Jah, video ja seletused kohe', 'Yes, video and statements now'),
            T('{callsign}, võtke video tõendiks ja seletused mõlemalt kohapeal, pooled hoidke lahus.', '{callsign}, secure the video and take statements from both on the spot, keep them apart.'),
            { success: 0.15, time: 20 },
          ),
          opt(
            'later',
            T('Ei, avaldus hiljem', 'No, complaint later'),
            T('{callsign}, pooled lahku, teataja võib avalduse ja video esitada hiljem.', '{callsign}, separate them, the caller can file a complaint with the video later.'),
            { success: -0.05, time: 5 },
          ),
        ],
        'later',
      ),
    ],
    outcomes: [
      out(
        'detained',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Mees peeti ähvardamise eest kinni, alustati kriminaalmenetlust KarS § 120 järgi. Temalt võeti seletus ka ohtliku sõiduviisi kohta.',
          'The man was detained for making threats and criminal proceedings were opened under KarS § 120. He was also questioned about his dangerous driving.',
        ),
        { arrests: 1 },
      ),
      out(
        'warned',
        'warning',
        [0.4, 1],
        2,
        T(
          'Mees rahunes ja vabandas. Talle tehti hoiatus, teatajale selgitati, kuidas ähvardamise kohta avaldus esitada.',
          'The man calmed down and apologised. He was warned and the caller was told how to file a complaint about the threats.',
        ),
      ),
      out(
        'window',
        'report',
        [0.2, 0.5],
        2,
        T(
          'Mees oli enne patrulli saabumist teataja auto akna puruks löönud. Alustati kriminaalmenetlust KarS § 120 ja § 203 järgi.',
          'Before the patrol arrived the man had smashed the caller’s car window. Criminal proceedings were opened under KarS § 120 and § 203.',
        ),
        { radio: T('{callsign}: mees oli akna puruks löönud, menetlus alustatud.', '{callsign}: he had smashed the window, case opened.') },
      ),
      out(
        'assault',
        'hospital',
        [0, 0.3],
        1,
        T(
          'Mees oli enne patrulli saabumist teataja autost välja tirinud ja teda löönud. Kannatanu toimetati kiirabiga haiglasse, ründaja peeti kinni.',
          'The man had dragged the caller out of the car and hit them before the patrol arrived. The victim was taken to hospital by ambulance and the attacker was detained.',
        ),
        { injuries: 1, arrests: 1, radio: T('{callsign}: teataja peksti, haiglasse, ründaja kinni.', '{callsign}: caller beaten, to hospital, attacker detained.') },
      ),
    ],
    escalation: {
      afterMin: 10,
      chance: 0.5,
      toPriority: 1,
      text: T(
        'Teataja: mees lõi kangiga külgakna puruks ja üritab ust avada!',
        'Caller: the man has smashed the side window with a crowbar and is trying to open the door!',
      ),
    },
    expiresMin: 40,
    interactiveChance: 0.35,
    call: {
      mood: 'panic',
      opening: [
        T('Üks mees jälitab mind autoga juba linnast saati! Ma olen oma maja ees ja ta peatus mu taga!', 'A man has been following me in his car all the way from town! I am outside my house and he has stopped behind me!'),
        T('Palun tulge, üks juht tagub mu autoaknale ja karjub, et ta tapab mu!', 'Please come, a driver is banging on my car window and shouting that he will kill me!'),
      ],
      answers: {
        vehicle: [T('{car}, number {plate}.', '{car}, number {plate}.')],
        suspect: [T('{suspect}.', '{suspect}.')],
        weapons: [T('Tal on käes mingi raud, vist kang.', 'He has some piece of iron in his hand, I think a crowbar.')],
        safe: [T('Ma istun autos, uksed on lukus. Ma ei lähe välja.', 'I am sitting in the car with the doors locked. I am not getting out.')],
      },
      answersRu: {
        vehicle: ['{car}, номер {plate}.'],
        suspect: ['{suspect}.'],
        weapons: ['У него в руке какая-то железяка, кажется, монтировка.'],
        safe: ['Я сижу в машине, двери заблокированы. Я не выйду.'],
      },
      openingRu: [
        'Меня от самого города преследует мужчина на машине! Я у своего дома, а он встал прямо за мной!',
        'Пожалуйста, приезжайте, водитель стучит мне в окно и кричит, что убьёт меня!',
      ],
    },
    tags: ['threat', 'traffic_related'],
  },

  // 6. A hoax bomb e-mail at a school; during the evacuation a child goes missing.
  {
    id: 'major_kooli_ahvarduskiri_laps_kadunud',
    category: 'major',
    code: 'POMM',
    title: T('Ähvarduskiri koolile, evakuatsioonil laps puudu', 'Threat e-mail to a school, a child missing after evacuation'),
    priority: 2,
    weight: 0.06,
    hours: [0, 0, 0, 0, 0, 0, 0.2, 1.5, 2.5, 2.5, 2, 1.8, 1.5, 1.2, 0.8, 0.3, 0.1, 0, 0, 0, 0, 0, 0, 0],
    months: [1, 2, 3, 4, 5, 9, 10, 11, 12],
    places: ['school'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('k9'), u('criminal')] },
    onScene: [50, 110],
    persons: [
      { role: 'caller', gender: 'any', age: [35, 62], relation: 'employee' },
      { role: 'missing', gender: 'M', age: [8, 10] },
    ],
    agencies: [{ agency: 'paaste', chance: 1, reason: T('Demineerimiskeskus: koolimaja kontroll', 'Bomb disposal centre: search of the school building') }],
    summary: [
      T(
        '{address}. Kooli üldmeilile saabus öösel ähvardus, et majja on peidetud lõhkekeha. Direktor alustas evakuatsiooni, õpilased kogunevad staadionile.',
        '{address}. A threat arrived at the school’s general e-mail overnight saying an explosive has been hidden in the building. The head has started an evacuation; pupils are gathering on the sports field.',
      ),
      T(
        '{address}. Koolile saabus ingliskeelne pommiähvardus, sama kiri läks ka mitmele teisele koolile. Kool evakueeritakse, õpilasi on üle {n}00.',
        '{address}. The school received a bomb threat in English; the same letter went to several other schools. The school is being evacuated, there are over {n}00 pupils.',
      ),
    ],
    callerLines: [
      T(
        'Meile tuli kiri, et koolis on pomm. Ma arvan, et see on jälle see masspostitus, aga evakueerime igaks juhuks.',
        'We got an e-mail saying there is a bomb in the school. I think it is that mass mailing again, but we are evacuating to be safe.',
      ),
      T('Lapsed on staadionil, õpetajad loevad nimekirja järgi üle.', 'The children are on the sports field, the teachers are counting them against the class lists.'),
    ],
    details: [
      T('Klassijuhatajate nimekirjade kontroll on alles pooleli, kõik klassid pole veel kokku loetud.', 'The class teachers are still checking their lists; not every class has been counted yet.'),
      T('Sarnane kiri saabus täna hommikul veel kümnele koolile üle Eesti.', 'A similar letter reached ten other schools across Estonia this morning.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal. Direktor küsib, kas saata lapsed koju või hoida neid naaberhoones, kuni demineerijad on maja üle vaadanud.',
            '{callsign}: on scene. The head is asking whether to send the children home or keep them in the building next door until bomb disposal has checked the school.',
          ),
        ],
        [
          opt(
            'hold',
            T('Hoidke lapsi naaberhoones', 'Keep the children next door'),
            T('{callsign}, lapsed jäävad naaberhoonesse, vanematele üleandmine ainult nimekirja alusel.', '{callsign}, the children stay next door, handovers to parents only against the class list.'),
            { success: 0.15, time: 15 },
          ),
          opt(
            'home',
            T('Saatke lapsed koju', 'Send the children home'),
            T('{callsign}, lapsed võivad koju minna, õpetajad teavitavad vanemaid.', '{callsign}, the children may go home, the teachers will inform the parents.'),
            { success: -0.1, time: -5 },
          ),
        ],
        'hold',
      ),
      agency('paaste', 2, [
        T('{callsign}: palun demineerijad kohale, maja on tühi ja ümbrus piiratud.', '{callsign}: please send bomb disposal, the building is empty and the area cordoned off.'),
      ], { timeoutMin: 6 }),
      search(8, 1.5, [
        T(
          '{callsign}: klassijuhataja teatab, et üks kolmanda klassi poiss on kogunemiskohast puudu. Ta läks kellelegi ütlemata ära. Alustame otsinguid kooli ümbruses.',
          '{callsign}: a class teacher reports that a boy from year three is missing from the assembly point. He left without telling anyone. Starting a search around the school.',
        ),
      ]),
      info(20, [
        T('{callsign}: demineerijad lõpetasid esimese korruse kontrolli, kahtlast eset pole.', '{callsign}: bomb disposal have finished the ground floor, nothing suspicious.'),
      ]),
    ],
    outcomes: [
      out(
        'hoax',
        'resolved',
        [0.5, 1],
        5,
        T(
          'Koolimaja kontrolliti, lõhkekeha ei leitud. Puudu olnud poiss leiti kooli lähedalt garaažide vahelt, kõik lapsed anti vanematele üle. Kiri osutus osaks rahvusvahelisest masspostitusest, alustati kriminaalmenetlust KarS § 263 järgi.',
          'The school was searched and no device was found. The missing boy was found among the garages near the school and every child was handed over to their parents. The letter was part of an international mass mailing; criminal proceedings were opened under KarS § 263.',
        ),
        { radio: T('{callsign}: lõhkekeha pole, poiss leitud, lapsed üle antud.', '{callsign}: no device, boy found, children handed over.') },
      ),
      out(
        'boy_home',
        'resolved',
        [0.45, 1],
        3,
        T(
          'Puudu olnud poiss leiti kodust, kuhu ta oli ehmatusest jooksnud. Lõhkekeha koolist ei leitud, õppetöö jätkub homme.',
          'The missing boy was found at home, where he had run in fright. No device was found at the school and lessons resume tomorrow.',
        ),
        { radio: T('{callsign}: poiss leitud kodust, kool puhas, lõpetame.', '{callsign}: boy found at home, school clear, closing.') },
      ),
      out(
        'boy_late',
        'report',
        [0.2, 0.55],
        2,
        T(
          'Poiss leiti alles kahe tunni pärast kaubanduskeskusest. Evakuatsiooni korraldus ja laste üleandmine võetakse koolis arutlusele.',
          'The boy was only found two hours later in a shopping centre. The school will review how the evacuation and handovers were run.',
        ),
        { radio: T('{callsign}: poiss leitud alles kahe tunni pärast.', '{callsign}: the boy was only found two hours later.') },
      ),
      out(
        'chaos',
        'report',
        [0, 0.3],
        2,
        T(
          'Kooli juures tekkis segadus: lapsi anti üle ilma nimekirjata ja vanemad tungisid piiratud alale. Lõhkekeha ei leitud, juhtumit analüüsitakse.',
          'There was confusion at the school: children were handed over without the lists and parents pushed into the cordon. No device was found; the response is being reviewed.',
        ),
        { trust: -2, radio: T('{callsign}: segadus kooli juures, lõhkekeha pole, vormistame.', '{callsign}: confusion at the school, no device, processing.') },
      ),
    ],
    expiresMin: 120,
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T('Tere, helistan koolist. Meile tuli e-kiri, et koolimajas on pomm. Me evakueerime.', 'Hello, I am calling from a school. We have had an e-mail saying there is a bomb in the building. We are evacuating.'),
        T('Kooli tuli pommiähvardus, lapsed on õues. Mida me edasi teeme?', 'The school has had a bomb threat, the children are outside. What do we do next?'),
      ],
      answers: {
        count: [T('Lapsi on kokku üle neljasaja, õpetajaid paarkümmend.', 'Over four hundred children and about twenty teachers.')],
        children: [T('Kõik lapsed on staadionil, loeme neid üle.', 'All the children are on the sports field, we are counting them.')],
        when: [T('Kiri tuli öösel, märkasime seda alles hommikul.', 'The e-mail came in overnight, we only noticed it in the morning.')],
      },
      answersRu: {
        count: ['Детей всего больше четырёхсот, учителей человек двадцать.'],
        children: ['Все дети на стадионе, мы их пересчитываем.'],
        when: ['Письмо пришло ночью, мы заметили его только утром.'],
      },
      openingRu: [
        'Здравствуйте, звоню из школы. Нам пришло письмо, что в здании бомба. Мы эвакуируемся.',
        'В школу пришла угроза о бомбе, дети на улице. Что нам делать дальше?',
      ],
    },
    tags: ['bomb', 'school', 'child'],
  },

  // 7. Teenagers on the roof of an abandoned Soviet-era factory; one may fall through.
  {
    id: 'assist_noored_mahajaetud_tehase_katusel',
    category: 'assist',
    code: 'ABI',
    title: T('Noored mahajäetud tehase katusel', 'Teenagers on the roof of an abandoned factory'),
    priority: 3,
    weight: 0.75,
    months: [4, 5, 6, 7, 8, 9, 10],
    hours: 'evening',
    places: ['industrial'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'victim', gender: 'M', age: [13, 17] },
      { role: 'witness', gender: 'any', age: [13, 17], relation: 'friend' },
      { role: 'caller', gender: 'any', age: [30, 70] },
    ],
    agencies: [{ agency: 'paaste', chance: 0.5, reason: T('Kõrgusest päästmine: noored ei pääse katuselt alla', 'High-angle rescue: the teenagers cannot get down from the roof') }],
    summary: [
      T(
        '{address}. Möödujate teatel ronib mahajäetud tehasehoone katusel neli-viis noort, katus on osaliselt sisse varisenud. Noored filmivad telefoniga.',
        '{address}. Passers-by report four or five teenagers climbing on the roof of an abandoned factory building; the roof has partly caved in. They are filming on their phones.',
      ),
      T(
        '{address}. Nõukogudeaegse tehase varemetes on noored, kaks neist istuvad katuse serval. Teataja kardab, et keegi kukub.',
        '{address}. Teenagers in the ruins of a Soviet-era factory, two of them sitting on the edge of the roof. The caller is afraid someone will fall.',
      ),
    ],
    callerLines: [
      T(
        'Seal tehase katusel on lapsed, jooksevad mööda katust ja filmivad. See katus on ju pooleldi sisse kukkunud!',
        'There are kids on the factory roof, running about and filming. That roof has half fallen in!',
      ),
      T('Üks poiss istub päris serva peal, jalad üle ääre. Teised karjuvad ja naeravad.', 'One boy is sitting right on the edge with his legs over. The others are shouting and laughing.'),
    ],
    details: [
      T('Teataja sõnul vajus ühe noore jalg juba katuseplekist läbi.', 'The caller says one of the teenagers has already put a foot through the roof sheeting.'),
      T(
        'Hoone on aastaid tühi, sissepääsud on laudadega kinni löödud, kuid aed on mitmest kohast maas.',
        'The building has been empty for years; the entrances are boarded up but the fence is down in several places.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: noored on katusel, trepikoda on varisenud. Kas läheme ise üles neid tooma või ootame Päästeameti redelit?',
            '{callsign}: the teenagers are on the roof and the stairwell has collapsed. Do we go up and fetch them ourselves or wait for the Rescue Board ladder?',
          ),
        ],
        [
          opt(
            'wait',
            T('Oodake Päästeametit, rääkige alt', 'Wait for the Rescue Board, talk from below'),
            T('{callsign}, ärge ronige, hoidke noored paigal ja rääkige nendega alt. Päästeamet tuleb.', '{callsign}, do not climb, keep the kids still and talk to them from below. The Rescue Board is coming.'),
            { success: 0.15, time: 15 },
          ),
          opt(
            'climb',
            T('Minge ise üles', 'Go up yourselves'),
            T('{callsign}, minge ettevaatlikult, ainult kandvaid konstruktsioone mööda.', '{callsign}, go carefully, only along the load-bearing structure.'),
            { risk: 0.12, success: -0.1, time: -5 },
          ),
        ],
        'wait',
      ),
      agency('paaste', 1, [
        T(
          '{callsign}: noored ei saa ise alla, trepp on läbi kukkunud. Vajame Päästeametit redeliautoga.',
          '{callsign}: the kids cannot get down by themselves, the stairs have collapsed. We need the Rescue Board with a ladder truck.',
        ),
      ], { timeoutMin: 6 }),
      agency('kiirabi', 4, [
        T('{callsign}: üks noor lõikas katuseplekiga jala lahti ja veritseb. Palun kiirabi.', '{callsign}: one of the kids has cut his leg on the roof sheeting and is bleeding. Ambulance please.'),
      ], { chance: 0.45, timeoutMin: 5 }),
      info(15, [
        T('{callsign}: kõik on all. Paneme noorte andmed kirja ja helistame vanematele.', '{callsign}: everyone is down. Taking the kids’ details and calling their parents.'),
      ]),
    ],
    outcomes: [
      out(
        'down_safe',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Päästjad tõid noored redeliga katuselt alla. Vanemaid teavitati, noortega vestles noorsoopolitseinik ja hoone omanikule tehti ettepanek aed korda teha.',
          'The rescuers brought the teenagers down by ladder. The parents were informed, a youth officer spoke to the kids and the building owner was asked to repair the fence.',
        ),
        { radio: T('{callsign}: noored alla toodud, vanemad teavitatud, lõpetame.', '{callsign}: kids brought down, parents informed, closing.') },
      ),
      out(
        'warned',
        'warning',
        [0.4, 1],
        2,
        T(
          'Noored toodi alla ning neile ja vanematele tehti hoiatus. Hoone omanik sai ettekirjutuse sissepääsude sulgemiseks.',
          'The teenagers were brought down and they and their parents were warned. The building owner was ordered to secure the entrances.',
        ),
      ),
      out(
        'cut',
        'hospital',
        [0.35, 0.8],
        2,
        T(
          'Noored toodi katuselt alla. Üks poiss sai katuseplekiga sügava lõikehaava ja toimetati kiirabiga haiglasse, vanemaid teavitati.',
          'The teenagers were brought down. One boy had a deep cut from the roof sheeting and was taken to hospital by ambulance; the parents were informed.',
        ),
        { injuries: 1, radio: T('{callsign}: noored all, üks lõikehaavaga haiglasse.', '{callsign}: kids down, one with a deep cut to hospital.') },
      ),
      out(
        'fall',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Üks noormees kukkus läbi katuse alumisele korrusele. Ta toimetati raskete vigastustega haiglasse, Päästeamet tõi teised alla.',
          'One boy fell through the roof to the floor below. He was taken to hospital with serious injuries; the Rescue Board brought the others down.',
        ),
        { injuries: 1, radio: T('{callsign}: poiss kukkus läbi katuse, raskelt vigastatud.', '{callsign}: boy fell through the roof, seriously injured.') },
      ),
      out(
        'tragedy',
        'tragedy',
        [0, 0.15],
        1,
        T(
          'Läbi katuse kukkunud noormehe elu ei õnnestunud päästa. Juhtumi asjaolusid uurib politsei, hoone omaniku vastutust selgitatakse.',
          'The boy who fell through the roof could not be saved. The police are investigating and the owner’s liability is being examined.',
        ),
        { injuries: 1, radio: T('{callsign}: kukkunud noormeest ei õnnestunud päästa.', '{callsign}: the boy who fell could not be saved.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.45,
      toPriority: 1,
      text: T(
        'Teataja: üks poiss kukkus läbi katuse alumisele korrusele ja ei liigu, teised karjuvad appi!',
        'Caller: one boy has fallen through the roof to the floor below and is not moving, the others are screaming for help!',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'panic',
      opening: [
        T('Vana tehase katusel on noored ja see katus on pooleldi sisse kukkunud! Keegi kukub kohe alla!', 'There are teenagers on the old factory roof and it has half caved in! Someone is going to fall!'),
        T('Tehasevaremetes ronivad lapsed katuse serval ja filmivad. Palun tulge!', 'Kids are climbing along the roof edge in the factory ruins and filming. Please come!'),
      ],
      answers: {
        count: [T('Neid on neli või viis, kõik umbes viieteistkümnesed.', 'There are four or five of them, all about fifteen.')],
        injured: [T('Veel keegi viga pole saanud, aga ühe jalg läks juba plekist läbi.', 'Nobody is hurt yet, but one of them already put a foot through the sheeting.')],
      },
      answersRu: {
        count: ['Их четверо или пятеро, всем лет по пятнадцать.'],
        injured: ['Пока никто не пострадал, но один уже провалился ногой сквозь жесть.'],
      },
      openingRu: [
        'На крыше старого завода подростки, а крыша наполовину провалилась! Сейчас кто-нибудь упадёт!',
        'Дети лазят по краю крыши заброшенного завода и снимают на телефон. Приезжайте, пожалуйста!',
      ],
    },
    tags: ['youth'],
  },

  // 8. Scam call: a pensioner is about to hand cash to a "courier"; sting or stop?
  {
    id: 'fraud_kelmide_kuller_tuleb_rahale',
    category: 'fraud',
    code: 'KE',
    title: T('Kelmide kuller tuleb eakalt raha võtma', 'Scammers’ courier coming to collect cash from a pensioner'),
    priority: 3,
    weight: 0.85,
    hours: 'day',
    places: ['residential', 'house'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('criminal')] },
    onScene: [30, 70],
    persons: [
      { role: 'victim', gender: 'F', age: [72, 90] },
      { role: 'caller', gender: 'any', age: [35, 60], relation: 'family' },
      { role: 'suspect', gender: 'M', age: [17, 28], record: 0.3 },
    ],
    summary: [
      T(
        '{address}. Teataja sõnul helistas tema emale „politseiuurija“, kes käskis pangast võetud sularaha kullerile hoiule anda. Kuller pidi tulema poole tunni pärast.',
        '{address}. The caller says a "police investigator" phoned the caller’s mother and told her to hand cash from the bank to a courier for safekeeping. The courier is due in half an hour.',
      ),
      T(
        '{address}. Eakas naine sai kõne, et tema pangakonto on ohus ja raha tuleb „turvaliselt hoiule anda“. Kuller on teel, naine on raha juba ümbrikusse pannud.',
        '{address}. An elderly woman was told on the phone that her bank account is at risk and the money must be "handed over for safekeeping". A courier is on the way; she has already put the cash in an envelope.',
      ),
    ],
    callerLines: [
      T('Mu ema helistas mulle salaja, et talle tuleb politseinik raha järele. Politsei ju ei korja raha!', 'My mother rang me secretly to say a policeman is coming for her money. The police do not collect money!'),
      T('Ta on juba pangast kuus tuhat eurot välja võtnud ja istub ümbrikuga ukse juures.', 'She has already taken six thousand euros out of the bank and is sitting by the door with the envelope.'),
    ],
    details: [
      T('„Kuller“ helistas äsja uuesti ja ütles, et jõuab varsti.', 'The "courier" has just rung again to say he will be there soon.'),
      T('Sama skeemi järgi on sel nädalal piirkonnas petetud mitut eakat.', 'Several pensioners in the area have been cheated with the same scheme this week.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal, proua on hirmul, aga koostööaldis. Kas korraldame varitsuse juhuks, kui kuller veel tuleb?',
            '{callsign}: on scene, the lady is frightened but cooperative. Do we set up an ambush in case the courier still comes?',
          ),
        ],
        [
          opt(
            'sting',
            T('Jah, varitsus korteris', 'Yes, wait in the flat'),
            T('{callsign}, jääge varjatult sisse, auto pange nurga taha. Kinni alles siis, kui ta ümbriku võtab.', '{callsign}, stay out of sight inside and park round the corner. Detain only when he takes the envelope.'),
            { success: 0.2, time: 20, risk: 0.03 },
          ),
          opt(
            'visible',
            T('Ei, olge nähtavalt ukse juures', 'No, stand at the door in uniform'),
            T('{callsign}, olge nähtavalt ukse juures, kuller ei tohi raha kätte saada.', '{callsign}, be visible at the door, the courier must not get the money.'),
            { success: -0.05, time: 5, outcome: 'no_show' },
          ),
        ],
        'visible',
        { timeoutMin: 3 },
      ),
      qp('victim', 2, [
        T('{callsign}: proua andmed avalduse jaoks: {name}, isikukood {idcode}. Palun kontrolli.', '{callsign}: the lady’s details for the report: {name}, ID code {idcode}. Please check.'),
      ]),
      info(10, [
        T('{callsign}: proua telefon heliseb, number on peidetud. Ütlesime, et ta ei vastaks.', '{callsign}: the lady’s phone is ringing from a hidden number. We told her not to answer.'),
      ]),
    ],
    outcomes: [
      out(
        'sting',
        'arrest',
        [0.55, 1],
        4,
        T(
          'Kuller tuli ukse taha ja peeti kinni, ümbrik koos kuue tuhande euroga jäi prouale. Kuller osutus sotsiaalmeedia kaudu värvatud noormeheks, alustati kriminaalmenetlust KarS § 209 järgi.',
          'The courier came to the door and was detained; the envelope with six thousand euros stayed with the lady. He turned out to be a young man recruited through social media; criminal proceedings were opened under KarS § 209.',
        ),
        { arrests: 1, radio: T('{callsign}: kuller kinni, raha jäi prouale.', '{callsign}: courier detained, the money stayed with the lady.') },
      ),
      out(
        'no_show',
        'resolved',
        [0.4, 1],
        3,
        T(
          'Kuller jäi tulemata, kelmid said ilmselt aru, et politsei on kohal. Raha jäi prouale ja talle selgitati, et politsei ei korja kunagi raha. Kriminaalmenetlus KarS § 209 järgi (katse).',
          'The courier never came; the scammers probably realised the police were there. The money stayed with the lady, who was told that the police never collect money. Criminal proceedings under KarS § 209 (attempt).',
        ),
        { radio: T('{callsign}: kuller ei tulnud, raha jäi prouale, lõpetame.', '{callsign}: courier never came, the money is safe, closing.') },
      ),
      out(
        'lost',
        'escaped',
        [0, 0.4],
        3,
        T(
          'Proua jõudis raha kullerile üle anda enne politsei saabumist. Kuller lahkus autoga, alustati kriminaalmenetlust KarS § 209 järgi ja kontrollitakse turvakaameraid.',
          'The lady handed the money to the courier before the police arrived. He left by car; criminal proceedings were opened under KarS § 209 and CCTV is being checked.',
        ),
        { radio: T('{callsign}: raha juba üle antud, kuller lahkus autoga.', '{callsign}: money already handed over, courier left by car.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.55,
      toPriority: 2,
      text: T('Teataja: ema ütleb, et kuller on juba trepikojas ja helistab uksekella.', 'Caller: the mother says the courier is already in the stairwell ringing the bell.'),
    },
    expiresMin: 75,
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T('Mu emale helistas keegi „politseist“ ja käskis raha kullerile anda. Kuller tuleb varsti, palun aidake!', 'Someone "from the police" phoned my mother and told her to give her money to a courier. He is coming soon, please help!'),
        T('Mu ema on ümbrikuga ukse juures ja ootab mingit kullerit. See on ju pettus!', 'My mother is waiting by the door with an envelope for some courier. It is a scam!'),
      ],
      answers: {
        suspect: [T('Ema ütles, et kuller on noor poiss, rohkem ta ei tea.', 'Mum said the courier is a young lad, she does not know more.')],
        when: [T('Kuller pidi tulema poole tunni pärast.', 'The courier is supposed to come in half an hour.')],
        safe: [T('Ema on üksi kodus, ma ise olen tööl teises linnas.', 'Mum is home alone, I am at work in another town.')],
      },
      answersRu: {
        suspect: ['Мама сказала, что курьер молодой парень, больше она не знает.'],
        when: ['Курьер должен прийти через полчаса.'],
        safe: ['Мама дома одна, а я на работе в другом городе.'],
      },
      openingRu: [
        'Моей маме позвонили якобы из полиции и велели отдать деньги курьеру. Курьер скоро придёт, помогите!',
        'Мама сидит у двери с конвертом и ждёт какого-то курьера. Это же мошенники!',
      ],
    },
    tags: ['scam', 'elderly'],
  },

  // 9. A stolen excavator drives through a village at night (half funny, half dangerous).
  {
    id: 'property_varastatud_ekskavaator_kulas',
    category: 'property',
    code: 'VG',
    title: T('Varastatud ekskavaator sõidab läbi küla', 'Stolen excavator driving through a village'),
    priority: 2,
    weight: 0.12,
    hours: 'night',
    places: ['village', 'ruralroad', 'construction'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [35, 80],
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 50], intoxicated: 0.7, noLicense: 0.5, record: 0.5 },
      { role: 'caller', gender: 'any', age: [30, 75] },
    ],
    summary: [
      T(
        '{address}. Teataja sõnul sõidab öösel külateel ekskavaator, kopp üleval ja tuled kustus. Masin lükkas ümber postkastid ja sõitis läbi aia.',
        '{address}. The caller says an excavator is driving along the village road in the night, bucket raised and no lights. It has knocked over letterboxes and driven through a fence.',
      ),
      T(
        '{address}. Ehitusplatsilt on minema sõidetud roomikekskavaator. Masin liigub külateel, juht ei reageeri hõigetele.',
        '{address}. A tracked excavator has been driven off a building site. It is moving along the village road and the driver ignores people shouting at him.',
      ),
    ],
    callerLines: [
      T('Siin sõidab keset ööd mingi ekskavaator mööda küla, kopaga lõi just bussiootepaviljoni katuse sisse!', 'There is an excavator driving through the village in the middle of the night, it has just smashed the bus shelter roof with its bucket!'),
      T('Roolis on mingi mees, ta naerab ja sõidab läbi aedade. Kas see on üldse lubatud?', 'Some man is at the controls, laughing and driving through gardens. Is that even allowed?'),
      T('See ei ole kellegi oma siit külast. Ehitajad jätsid selle tee äärde seisma.', 'It does not belong to anyone in the village. The builders left it by the road.'),
    ],
    details: [
      T('Masin liigub küla keskuse poole, kus on kortermaja ja kauplus.', 'The machine is heading towards the village centre, where there is a block of flats and a shop.'),
      T('Ehitusfirma sõnul jäeti ekskavaator tööpäeva lõpus objektile, võtmed olid peidetud kabiini.', 'The construction company says the excavator was left on site at the end of the day with the keys hidden in the cab.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: ekskavaator liigub külateel kümnega. Kas blokeerime tee patrullautoga või läheneme jalgsi kabiini juurde?',
            '{callsign}: the excavator is doing about ten on the village road. Do we block the road with the patrol car or approach the cab on foot?',
          ),
        ],
        [
          opt(
            'talk',
            T('Lähenege jalgsi, rääkige ta masinast välja', 'Approach on foot, talk him out of the cab'),
            T('{callsign}, lähenege nähtavalt eest, kopa ulatusest väljas. Rääkige ta masinast välja.', '{callsign}, approach from the front where he can see you, out of reach of the bucket. Talk him out of the cab.'),
            { success: 0.15, time: 10 },
          ),
          opt(
            'block',
            T('Blokeerige tee autoga', 'Block the road with the car'),
            T('{callsign}, blokeerige tee, aga hoidke vahemaad. Auto ei tohi jääda kopa alla.', '{callsign}, block the road but keep your distance. The car must not end up under the bucket.'),
            { success: -0.05, risk: 0.08, trust: -1 },
          ),
        ],
        'block',
      ),
      agency('paaste', 3, [
        T(
          '{callsign}: masin murdis elektriposti, juhe ripub üle tee. Palun Päästeamet ja võrguettevõtte avariibrigaad.',
          '{callsign}: the machine has broken a power pole and a cable is hanging across the road. Rescue Board and the grid company’s emergency crew please.',
        ),
      ], { chance: 0.4, timeoutMin: 6 }),
      qp('suspect', 6, [
        T(
          '{callsign}: mees on kinni peetud, haiseb alkoholi järele. Ütleb nimeks {name}, isikukood {idcode}. Kontrolli palun.',
          '{callsign}: the man is detained and smells of alcohol. He gives the name {name}, ID code {idcode}. Please check.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'stopped',
        'arrest',
        [0.55, 1],
        4,
        T(
          'Juht peeti kinni, alkomeeter näitas 1,8 promilli. Selgus, et ta oli naljaviluks ehitusplatsilt masina käima pannud. Alustati kriminaalmenetlust KarS § 215 ja § 424 järgi.',
          'The driver was detained; the breathalyser showed 1.8 per mille. He had started the machine on the building site for a laugh. Criminal proceedings were opened under KarS § 215 and § 424.',
        ),
        { arrests: 1, radio: T('{callsign}: ekskavaator peatatud, joobes juht kinni.', '{callsign}: excavator stopped, drunk driver detained.') },
      ),
      out(
        'damage',
        'report',
        [0.35, 0.8],
        2,
        T(
          'Masin peatati, kuid külatee ääres on lõhutud aiad, postkastid ja bussiootepaviljon. Juht peeti kinni, kahju hinnatakse.',
          'The machine was stopped, but fences, letterboxes and the bus shelter along the village road are wrecked. The driver was detained and the damage is being assessed.',
        ),
        { arrests: 1, radio: T('{callsign}: masin peatatud, juht kinni, külas palju kahju.', '{callsign}: machine stopped, driver detained, lots of damage in the village.') },
      ),
      out(
        'blackout',
        'report',
        [0, 0.45],
        2,
        T(
          'Masin peatati alles siis, kui see oli murdnud elektriposti ja pool küla jäi elektrita. Juht peeti kinni, kahju on suur.',
          'The machine was only stopped after it had broken a power pole and half the village lost power. The driver was detained; the damage is heavy.',
        ),
        { arrests: 1, radio: T('{callsign}: masin peatatud, küla elektrita, juht kinni.', '{callsign}: machine stopped, village without power, driver detained.') },
      ),
      out(
        'house',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Ekskavaator sõitis vastu kortermaja nurka ja üks elanik sai kildudest viga. Juht peeti kinni, maja seisukorda hindab Päästeamet.',
          'The excavator hit the corner of the block of flats and a resident was hurt by flying debris. The driver was detained; the Rescue Board is assessing the building.',
        ),
        { injuries: 1, arrests: 1, radio: T('{callsign}: masin sõitis vastu maja, elanik vigastatud.', '{callsign}: machine hit the building, a resident injured.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.5,
      toPriority: 1,
      text: T(
        'Teataja: ekskavaator sõitis vastu elektriposti, juhtmed on maas ja masin liigub kortermaja poole.',
        'Caller: the excavator has hit a power pole, the lines are down and it is heading for the block of flats.',
      ),
    },
    expiresMin: 60,
    interactiveChance: 0.3,
    call: {
      mood: 'confused',
      opening: [
        T('Kuulge, siin sõidab keset ööd ekskavaator mööda küla ja lõhub kõike. Kas see on teie teada?', 'Listen, there is an excavator driving through the village in the middle of the night smashing everything. Do you know about this?'),
        T('Ehitajate kopp sõidab ilma tuledeta mööda teed, roolis on mingi purjus mees!', 'The builders’ digger is driving down the road without lights, some drunk man is at the controls!'),
      ],
      answers: {
        direction: [T('Ta sõidab küla keskuse poole, seal on kortermaja.', 'It is heading for the village centre, there is a block of flats there.')],
        count: [T('Kabiinis on üks mees.', 'There is one man in the cab.')],
        injured: [T('Inimesi pole veel viga saanud, aga aiad ja postkastid on puruks.', 'Nobody is hurt yet, but fences and letterboxes are smashed.')],
      },
      answersRu: {
        direction: ['Он едет к центру деревни, там многоэтажка.'],
        count: ['В кабине один мужчина.'],
        injured: ['Люди пока не пострадали, но заборы и почтовые ящики разбиты.'],
      },
      openingRu: [
        'Слушайте, посреди ночи по деревне едет экскаватор и всё крушит. Вы в курсе?',
        'Ковш строителей едет без фар по дороге, за рычагами какой-то пьяный!',
      ],
    },
    tags: ['vehicle', 'drunk'],
  },

  // 10. Anglers on cracking ice (Peipsi and other large lakes in the east and south).
  {
    id: 'assist_kalamehed_pragunenud_jaal',
    category: 'assist',
    code: 'JÄÄ',
    title: T('Kalamehed pragunenud jääl', 'Anglers on cracking ice'),
    priority: 2,
    weight: 2.0,
    months: [1, 2, 3],
    hours: 'day',
    regions: ['ida', 'louna'],
    places: ['lake'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('boat'), u('heli')] },
    onScene: [40, 90],
    persons: [
      { role: 'victim', gender: 'M', age: [35, 75] },
      { role: 'caller', gender: 'M', age: [30, 70], relation: 'friend' },
    ],
    agencies: [{ agency: 'paaste', chance: 0.9, reason: T('Jääpääste: kalamehed pragunenud jääl', 'Ice rescue: anglers on cracking ice') }],
    summary: [
      T(
        '{address}. Teataja sõnul on jäässe tekkinud pikk pragu ja selle taga on umbes {n}0 kalameest. Osa ei taha lahkuda, sest kala võtab.',
        '{address}. The caller says a long crack has opened in the ice with about {n}0 anglers on the far side. Some refuse to leave because the fish are biting.',
      ),
      T(
        '{address}. Tuul pööras lõunasse ja rannaäärne jää praguneb. Kaks kalameest jäid prao taha ja helistasid ise, jääl seisab ka üks auto.',
        '{address}. The wind has swung to the south and the ice near the shore is cracking. Two anglers are cut off behind the crack and rang themselves; a car is also standing on the ice.',
      ),
    ],
    callerLines: [
      T('Jää praguneb, kuulda on paukumist! Meie ja kalda vahel on juba vesi.', 'The ice is cracking, you can hear it banging! There is already water between us and the shore.'),
      T('Siin on palju rahvast, aga keegi ei kuula. Üks mees sõitis autoga veel kaugemale!', 'There are lots of people here but nobody listens. One man drove his car even further out!'),
    ],
    details: [
      T('Teataja sõnul on pragu juba üle meetri lai ja see laieneb.', 'The caller says the crack is already more than a metre wide and widening.'),
      T('Ilmateenistus hoiatas tugeva lõunatuule eest, kaldaäärne jää on lahti murdunud.', 'The weather service has warned of strong southerly winds; the ice along the shore has broken away.'),
    ],
    beats: [
      agency('paaste', 'arrive', [
        T(
          '{callsign}: oleme kaldal, pragu on lai ja inimesi on palju. Vajame Päästeameti jääpäästjaid ja hõljukit!',
          '{callsign}: we are on the shore, the crack is wide and there are a lot of people. We need Rescue Board ice rescuers and the hovercraft!',
        ),
      ], { timeoutMin: 6, fail: { success: -0.25, trust: -3 } }),
      choice(
        3,
        [
          T(
            '{callsign}: mõni kalamees keeldub tulemast ja ütleb, et jää peab. Kas teeme ettekirjutuse ja nõuame kõigilt lahkumist?',
            '{callsign}: some anglers refuse to come back and say the ice will hold. Do we issue an order and make everyone leave?',
          ),
        ],
        [
          opt(
            'order',
            T('Kõik jäält ära, ettekirjutus', 'Everyone off the ice, written order'),
            T('{callsign}, kõik peavad jäält lahkuma, keeldujatele ettekirjutus. Päästjad juhatavad ohutu koha kaudu.', '{callsign}, everyone must leave the ice, written orders for anyone who refuses. The rescuers will guide them across at a safe point.'),
            { success: 0.15, time: 15 },
          ),
          opt(
            'advise',
            T('Ainult hoiatus valjuhääldist', 'Loudspeaker warning only'),
            T('{callsign}, hoiatage valjuhääldiga, sundida ei saa. Jälgige praoäärt.', '{callsign}, warn them over the loudspeaker, we cannot force them. Watch the edge of the crack.'),
            { success: -0.1, risk: 0.05 },
          ),
        ],
        'advise',
      ),
      agency('kiirabi', 6, [
        T('{callsign}: üks mees sai läbimärjaks ja on alajahtunud. Palun kiirabi kaldale.', '{callsign}: one man got soaked and is hypothermic. Ambulance to the shore please.'),
      ], { chance: 0.5, timeoutMin: 5 }),
      info(12, [
        T('{callsign}: hõljuk on jääl, päästjad toovad inimesi prao tagant ära.', '{callsign}: the hovercraft is on the ice, the rescuers are bringing people back across the crack.'),
      ]),
    ],
    outcomes: [
      out(
        'all_safe',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Päästjad tõid prao tagant ära kõik kalamehed ja keegi viga ei saanud. Kahele keeldujale tehti ettekirjutus, jääle jäänud auto peab omanik ise välja tooma.',
          'The rescuers brought every angler back across the crack and nobody was hurt. Two who refused were given written orders; the owner of the car left on the ice must recover it himself.',
        ),
        { radio: T('{callsign}: kõik kalamehed kaldal, keegi viga ei saanud.', '{callsign}: all anglers ashore, nobody hurt.') },
      ),
      out(
        'stubborn',
        'warning',
        [0.4, 1],
        2,
        T(
          'Enamik kalamehi lahkus ise. Kolm meest keeldus alguses, neile tehti hoiatus ja nad tulid päästjate juhendamisel kaldale.',
          'Most anglers left by themselves. Three men refused at first; they were warned and came ashore under the rescuers’ guidance.',
        ),
      ),
      out(
        'cold',
        'hospital',
        [0.3, 0.75],
        2,
        T(
          'Kalamehed toodi kaldale. Üks mees kukkus vette ja toimetati alajahtumisega haiglasse, tema elu ei ole ohus.',
          'The anglers were brought ashore. One man fell into the water and was taken to hospital with hypothermia; his life is not in danger.',
        ),
        { injuries: 1, radio: T('{callsign}: kõik kaldal, üks alajahtunu haiglasse.', '{callsign}: everyone ashore, one hypothermic man to hospital.') },
      ),
      out(
        'drifted',
        'report',
        [0, 0.4],
        2,
        T(
          'Jäätükk koos kuue kalamehega triivis kaldast eemale. Päästjad tõid nad hõljukiga ära alles mitme tunni pärast, kaks meest olid alajahtunud.',
          'An ice floe with six anglers on it drifted away from the shore. The rescuers only got them off by hovercraft several hours later; two men were hypothermic.',
        ),
        { injuries: 2, radio: T('{callsign}: jäätükk triivis ära, kuus meest toodi tunde hiljem.', '{callsign}: floe drifted off, six men rescued hours later.') },
      ),
      out(
        'drowned',
        'tragedy',
        [0, 0.15],
        1,
        T(
          'Pragu ületada üritanud kalamees vajus jää alla ja teda ei õnnestunud päästa. Otsingud jätkuvad sukeldujatega.',
          'An angler who tried to cross the crack went under the ice and could not be saved. Divers are continuing the search.',
        ),
        { radio: T('{callsign}: üks kalamees vajus jää alla, päästa ei õnnestunud.', '{callsign}: one angler went under the ice, could not be saved.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.6,
      toPriority: 1,
      text: T(
        'Teataja: üks kalamees kukkus pragu ületades vette, teised üritavad teda välja tõmmata!',
        'Caller: one angler fell into the water crossing the crack, the others are trying to pull him out!',
      ),
    },
    expiresMin: 60,
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T('Me oleme jääl ja jää praguneb! Meie ja kalda vahel on juba vesi!', 'We are on the ice and it is cracking! There is already water between us and the shore!'),
        T('Siin on palju kalamehi prao taga, jää paugub. Saatke päästjad!', 'There are lots of anglers behind a crack, the ice is banging. Send the rescuers!'),
      ],
      answers: {
        count: [T('Prao taga on mitukümmend inimest, mõni on autoga.', 'There are dozens of people behind the crack, some with cars.')],
        injured: [T('Veel keegi vees ei ole, aga pragu läheb laiemaks.', 'Nobody is in the water yet, but the crack is getting wider.')],
        where: [T('Me oleme umbes kilomeeter kaldast, otse küla kohal.', 'We are about a kilometre from the shore, straight out from the village.')],
      },
      answersRu: {
        count: ['За трещиной несколько десятков человек, некоторые с машинами.'],
        injured: ['В воде пока никого нет, но трещина становится шире.'],
        where: ['Мы примерно в километре от берега, прямо напротив деревни.'],
      },
      openingRu: [
        'Мы на льду, лёд трещит! Между нами и берегом уже вода!',
        'За трещиной много рыбаков, лёд трещит. Присылайте спасателей!',
      ],
    },
    tags: ['ice', 'water', 'crowd'],
  },

  // 11. A fight at a village summer party that grows when more people arrive.
  {
    id: 'public_order_kulapeo_kaklus',
    category: 'public_order',
    code: 'KL',
    title: T('Kaklus külapeol', 'Fight at a village summer party'),
    priority: 2,
    weight: 2.4,
    months: [6, 7, 8],
    hours: 'nightlife',
    weekendBoost: 2,
    places: ['village', 'farm'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 40], intoxicated: 0.9, record: 0.4 },
      { role: 'victim', gender: 'M', age: [18, 45], intoxicated: 0.7 },
      { role: 'caller', gender: 'any', age: [25, 65], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Külapeo korraldaja teatel kaklevad seltskonnad tantsuplatsi taga, ühel mehel on nina verine. Pidulisi on umbes kakssada.',
        '{address}. The organiser of a village party reports groups fighting behind the dance floor; one man has a bloody nose. About two hundred people at the party.',
      ),
      T(
        '{address}. Külaplatsi peol läksid kaks seltskonda tülli ja käib kaklus. Korraldajate turvamehed ei saa hakkama.',
        '{address}. Two groups at a party on the village green have fallen out and are fighting. The organisers’ security cannot cope.',
      ),
    ],
    callerLines: [
      T(
        'Siin külapeol läks kakluseks, kaks naaberküla seltskonda. Turvamehi on meil kaks, nemad ei saa midagi teha.',
        'There is a fight at the village party, two groups from neighbouring villages. We only have two security men, they cannot do anything.',
      ),
      T('Bänd lõpetas mängimise, kõik jooksevad sinna taha. Üks mees on juba maas!', 'The band has stopped playing and everyone is running round the back. One man is already down!'),
      T('Nüüd tuli autodega veel poisse juurde, neil on kepid käes.', 'More lads have just turned up in cars, they have sticks.'),
    ],
    details: [
      T(
        'Korraldaja sõnul helistasid kaklejad sõpradele naaberkülla ja sealt on teel veel autosid.',
        'The organiser says the fighters have phoned friends in the next village and more cars are on the way.',
      ),
      T('Peol müüakse alkoholi ja paljud on tugevas joobes.', 'Alcohol is being sold at the party and many people are very drunk.'),
    ],
    beats: [
      backup(
        u('patrol'),
        2,
        [
          T(
            '{callsign}: kaklejaid on palju ja rahvas on vaenulik. Üksi me neid ei lahuta, vajame kohe teist ekipaaži!',
            '{callsign}: there are a lot of them and the crowd is hostile. We cannot separate them alone, we need another crew now!',
          ),
        ],
        { chance: 0.6, timeoutMin: 6, fail: { success: -0.3, risk: 0.1, trust: -5, escalate: true } },
      ),
      qp('suspect', 6, R_SUSPECT),
      agency('kiirabi', 8, [
        T('{callsign}: ühel mehel on peahaav ja ta on segaduses. Palun kiirabi külaplatsile.', '{callsign}: one man has a head wound and is confused. Ambulance to the village green please.'),
      ], { chance: 0.5, timeoutMin: 6 }),
      choice(
        12,
        [
          T(
            '{callsign}: olukord on rahunenud, korraldaja palub pidu jätkata. Kas lubame jätkata või lõpetame peo?',
            '{callsign}: things have calmed down and the organiser asks to carry on. Do we let the party continue or end it?',
          ),
        ],
        [
          opt(
            'continue',
            T('Jätkake, patrull jääb lähedale', 'Carry on, a patrol stays nearby'),
            T('{callsign}, pidu võib jätkuda, korraldaja peab turvajõude lisama. Patrull jääb piirkonda.', '{callsign}, the party may continue, the organiser must add more security. A patrol stays in the area.'),
            { success: 0.1, time: 15, trust: 1 },
          ),
          opt(
            'end',
            T('Lõpetage pidu', 'End the party'),
            T('{callsign}, pidu lõpetada ja alkoholimüük peatada.', '{callsign}, end the party and stop the alcohol sales.'),
            { success: 0.05, time: 25, trust: -1 },
          ),
        ],
        'continue',
      ),
    ],
    outcomes: [
      out(
        'calmed',
        'arrest',
        [0.55, 1],
        4,
        T(
          'Kaklus lõpetati, kaks peamist kaklejat peeti kinni ja toimetati kainenema. Alustati kriminaalmenetlust KarS § 263 järgi.',
          'The fight was stopped and the two main brawlers were detained and taken to sober up. Criminal proceedings were opened under KarS § 263.',
        ),
        { arrests: 2, radio: T('{callsign}: kaklus lõpetatud, kaks kinni peetud.', '{callsign}: fight over, two detained.') },
      ),
      out(
        'dispersed',
        'warning',
        [0.45, 1],
        2,
        T(
          'Kaklejad lahutati ja naaberküla seltskond saadeti minema. Korraldajale tehti ettekirjutus turvajõudude suurendamiseks.',
          'The brawlers were separated and the group from the next village was sent away. The organiser was ordered to increase security.',
        ),
      ),
      out(
        'injuries',
        'report',
        [0.3, 0.7],
        2,
        T(
          'Kaklus lõppes patrulli saabudes, kaks meest said vigastada. Osalised tuvastati, alustati kriminaalmenetlust KarS § 263 ja § 121 järgi.',
          'The fight stopped when the patrol arrived; two men were injured. Those involved were identified and criminal proceedings opened under KarS § 263 and § 121.',
        ),
        { injuries: 2, radio: T('{callsign}: kaklus läbi, kaks vigastatut, osalised tuvastatud.', '{callsign}: fight over, two injured, those involved identified.') },
      ),
      out(
        'mass_brawl',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Kaklus kasvas massikakluseks, kolm inimest toimetati haiglasse. Enamik osalisi lahkus enne lisajõudude saabumist, tuvastamine käib videote põhjal.',
          'The fight grew into a mass brawl and three people were taken to hospital. Most of those involved left before more units arrived; they are being identified from videos.',
        ),
        { injuries: 3, radio: T('{callsign}: massikaklus, kolm haiglasse, enamik lahkus.', '{callsign}: mass brawl, three to hospital, most left.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.55,
      toPriority: 1,
      text: T(
        'Korraldaja: kohale jõudis veel kaks autotäit noori, kaklusse on haaratud kümmekond meest ja kasutatakse kaigaid.',
        'Organiser: two more carloads of young men have arrived, about a dozen are fighting and clubs are being used.',
      ),
    },
    expiresMin: 60,
    interactiveChance: 0.25,
    call: {
      mood: 'panic',
      opening: [
        T('Ma olen külapeo korraldaja, siin läks suureks kakluseks! Kaks seltskonda, üks mees on juba maas!', 'I am organising the village party and a big fight has broken out! Two groups, one man is already down!'),
        T('Külaplatsil kaklevad noored, turvamehed ei saa hakkama. Palun tulge kiiresti!', 'Young men are fighting on the village green, security cannot cope. Please come quickly!'),
      ],
      answers: {
        count: [T('Kaklejaid on kümmekond, pealtvaatajaid sadu.', 'About ten fighting, hundreds watching.')],
        weapons: [T('Mõnel on kepid ja pudelid.', 'Some have sticks and bottles.')],
        intoxicated: [T('Väga purjus, peol müüakse õlut.', 'Very drunk, there is beer on sale at the party.')],
      },
      answersRu: {
        count: ['Дерутся человек десять, смотрят сотни.'],
        weapons: ['У некоторых палки и бутылки.'],
        intoxicated: ['Очень пьяные, на празднике продают пиво.'],
      },
      openingRu: [
        'Я организатор деревенского праздника, тут большая драка! Две компании, один уже лежит!',
        'На деревенской площади дерутся парни, охрана не справляется. Приезжайте быстрее!',
      ],
    },
    tags: ['fight', 'crowd', 'alcohol'],
  },

  // 12. Shoplifting at a mall where the suspect turns out to carry a knife.
  {
    id: 'property_poevaras_noaga_kaubanduskeskuses',
    category: 'property',
    code: 'RÖ',
    title: T('Poevargal on nuga', 'Shoplifter with a knife'),
    priority: 2,
    weight: 0.7,
    hours: 'day',
    places: ['mall'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('rapid')] },
    onScene: [30, 60],
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 45], record: 0.7, wanted: 0.2, intoxicated: 0.4, probation: 0.2 },
      { role: 'witness', gender: 'any', age: [22, 55], relation: 'employee' },
    ],
    summary: [
      T(
        '{place}, {address}. Turvatöötajad pidasid kinni poevarga, kes rabeleb ja ähvardab. Turvatöötaja nägi tema vööl noatuppe.',
        '{place}, {address}. Security staff have caught a shoplifter who is struggling and making threats. A guard saw a knife sheath on his belt.',
      ),
      T(
        '{place}, {address}. Kaupluse turvatöötaja teatel on varas lukustatud turvaruumi ja ähvardab „kõik läbi lõigata“. Nuga pole veel ära võetud.',
        '{place}, {address}. The shop guard says the thief is locked in the security room threatening to "cut everyone". The knife has not been taken off him yet.',
      ),
    ],
    callerLines: [
      T('Me hoiame poevarast turvaruumis, aga tal on nuga vöö vahel. Me ei julge seda ära võtta.', 'We are holding a shoplifter in the security room, but he has a knife in his belt. We do not dare take it off him.'),
      T('Ta varastas kaks pudelit konjakit ja raseerijad. Nüüd karjub, et lõikab meid.', 'He stole two bottles of cognac and some razors. Now he is shouting that he will cut us.'),
    ],
    details: [
      T('Turvatöötaja: mees on narkojoobe tunnustega ja muutub üha agressiivsemaks.', 'Security: the man shows signs of drug use and is getting more aggressive.'),
      T('Kaupluse kaamerad salvestasid varguse ja kinnipidamise.', 'The shop cameras recorded the theft and the detention.'),
    ],
    beats: [
      qp('suspect', 'arrive', [
        T(
          '{callsign}: turvatöötajad võtsid vargalt kinnipidamisel dokumendi: {name}, isikukood {idcode}. Kontrolli palun, kas on tagaotsitav.',
          '{callsign}: the guards took the thief’s ID card when they caught him: {name}, ID code {idcode}. Please check for warrants.',
        ),
      ]),
      choice(
        1,
        [
          T(
            '{callsign}: mehel on nuga ja ta on agressiivne. Kas läheme kohe peale või ootame teist ekipaaži?',
            '{callsign}: the man has a knife and is aggressive. Do we move in now or wait for the second crew?',
          ),
        ],
        [
          opt(
            'wait',
            T('Oodake teist ekipaaži, rääkige uksest', 'Wait for the second crew, talk through the door'),
            T('{callsign}, hoidke ust kinni ja rääkige temaga, teine ekipaaž on teel. Turvatöötajad eemale.', '{callsign}, keep the door shut and talk to him, the second crew is on the way. Security staff stand back.'),
            { success: 0.15, time: 8 },
          ),
          opt(
            'enter',
            T('Sisenege kohe', 'Go in now'),
            T('{callsign}, sisenege, elektrišokirelv valmis, käsklused selgelt.', '{callsign}, go in, taser ready, clear commands.'),
            { risk: 0.1, time: -5 },
          ),
        ],
        'enter',
        { timeoutMin: 3 },
      ),
      search(4, 1, [
        T(
          '{callsign}: mees tõukas turvatöötaja kõrvale ja jooksis parkimismajja. Kammime parklat, kõik lähedal olevad ekipaažid appi.',
          '{callsign}: the man pushed past the guard and ran into the multi-storey car park. Combing the car park, all nearby crews please assist.',
        ),
      ], 0.3),
    ],
    outcomes: [
      out(
        'disarmed',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Mees andis noa käsu peale ära ja peeti kinni. Kuna ta ähvardas noaga, alustati kriminaalmenetlust röövimise tunnustel KarS § 200 järgi.',
          'The man handed over the knife when ordered and was detained. Because he threatened people with the knife, criminal proceedings were opened for robbery under KarS § 200.',
        ),
        { arrests: 1, radio: T('{callsign}: nuga ära võetud, mees kinni peetud.', '{callsign}: knife taken, man detained.') },
      ),
      out(
        'taser',
        'arrest',
        [0.35, 0.8],
        2,
        T(
          'Mees ründas noaga ja ta tuli elektrišokirelvaga peatada. Kinnipeetu vaatas üle kiirabi, kriminaalmenetlus KarS § 200 järgi.',
          'The man lunged with the knife and had to be stopped with a taser. Paramedics checked him over; criminal proceedings under KarS § 200.',
        ),
        { arrests: 1, radio: T('{callsign}: elektrišokirelv kasutatud, mees kinni.', '{callsign}: taser deployed, man detained.') },
      ),
      out(
        'guard_cut',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Varas lõikas turvatöötajat käest ja pääses esialgu põgenema. Turvatöötaja toimetati haiglasse, mees on dokumendi järgi tuvastatud.',
          'The thief cut a guard on the hand and got away for now. The guard was taken to hospital; the man has been identified from his ID.',
        ),
        { injuries: 1, radio: T('{callsign}: turvatöötaja lõigatud, varas põgenes.', '{callsign}: guard cut, thief escaped.') },
      ),
      out(
        'fled',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Varas pääses parkimismaja kaudu põgenema. Ta on dokumendi ja kaamerate järgi tuvastatud ning kuulutatakse tagaotsitavaks.',
          'The thief got away through the multi-storey car park. He has been identified from his ID and the cameras and will be put on the wanted list.',
        ),
      ),
    ],
    escalation: {
      afterMin: 10,
      chance: 0.5,
      toPriority: 1,
      text: T(
        'Turvatöötaja: mees tõmbas noa välja, lõikas turvatöötajat käest ja jooksis keskusest parkla poole!',
        'Security: the man pulled the knife, cut a guard on the hand and ran through the centre towards the car park!',
      ),
    },
    expiresMin: 45,
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T('Ma olen keskuse turvatöötaja. Pidasime poevarga kinni, aga tal on vöö vahel nuga.', 'I am a security guard at the centre. We caught a shoplifter, but he has a knife in his belt.'),
        T('Poevaras on meil turvaruumis lukus, ähvardab meid noaga. Palun saatke patrull.', 'We have a shoplifter locked in the security room, he is threatening us with a knife. Please send a patrol.'),
      ],
      answers: {
        weapons: [T('Vöö vahel on nuga, tuppe on näha.', 'He has a knife in his belt, you can see the sheath.')],
        suspect: [T('{suspect}.', '{suspect}.')],
        injured: [T('Praegu pole keegi viga saanud.', 'Nobody has been hurt so far.')],
      },
      answersRu: {
        weapons: ['За поясом нож, видно ножны.'],
        suspect: ['{suspect}.'],
        injured: ['Пока никто не пострадал.'],
      },
      openingRu: [
        'Я охранник торгового центра. Мы задержали магазинного вора, но у него за поясом нож.',
        'Вор заперт у нас в комнате охраны и угрожает ножом. Пришлите патруль, пожалуйста.',
      ],
    },
    tags: ['weapon_knife', 'detained', 'shoplift'],
  },

  // 13. A man on the outside of a bridge railing; negotiation choices.
  {
    id: 'assist_mees_silla_piirde_taga',
    category: 'assist',
    code: 'ENE',
    title: T('Mees silla piirde taga', 'Man on the outside of a bridge railing'),
    priority: 1,
    weight: 0.25,
    hours: 'night',
    places: ['street', 'highway'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [40, 100],
    persons: [
      { role: 'victim', gender: 'M', age: [19, 60], intoxicated: 0.4 },
      { role: 'caller', gender: 'any', age: [20, 65] },
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.9, reason: T('Enesetapuohus isik, psühhiaatriline hindamine', 'Person at risk of suicide, psychiatric assessment') }],
    summary: [
      T(
        '{address}. Möödasõitja teatel seisab noormees silla piirde välisküljel, hoiab ühe käega kinni ja vaatab alla. Möödujatel käskis ta eemale jääda.',
        '{address}. A passing driver reports a young man standing on the outside of a bridge railing, holding on with one hand and looking down. He told passers-by to keep away.',
      ),
      T(
        '{address}. Mees on roninud viadukti piirdest üle ja ähvardab alla hüpata. Teataja peatas auto ja räägib temaga.',
        '{address}. A man has climbed over the railing of a flyover and is threatening to jump. The caller has stopped the car and is talking to him.',
      ),
    ],
    callerLines: [
      T('Üks mees seisab silla peal piirde taga. Peatasin auto, ta ütles, et kui ma lähemale tulen, ta hüppab.', 'A man is standing on the bridge outside the railing. I stopped the car and he said if I come closer he will jump.'),
      T('Ta nutab ja räägib telefoniga, keegi jättis ta maha. Palun tulge kiiresti, aga ilma sireenita!', 'He is crying and talking on the phone, someone has left him. Please come quickly, but without the siren!'),
    ],
    details: [
      T('Teataja sõnul on mees joonud ja saatis äsja sõbrale hüvastijätusõnumi.', 'The caller says the man has been drinking and has just sent a goodbye message to a friend.'),
      T('Mehe sõber helistas samuti 112-le ja on teel.', 'The man’s friend also rang 112 and is on the way.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: mees on piirde taga ja käsi libiseb. Ta karjub, et ei taha vormis inimesi näha. Kuidas läheneme?',
            '{callsign}: the man is outside the railing and his hand is slipping. He is shouting that he does not want to see anyone in uniform. How do we approach?',
          ),
        ],
        [
          opt(
            'talk',
            T('Üks ametnik räägib, teised taanduvad', 'One officer talks, the rest pull back'),
            T('{callsign}, üks ametnik räägib rahulikult ja järskude liigutusteta. Teised taanduvad ja sulgevad liikluse.', '{callsign}, one officer talks calmly with no sudden movements. The others pull back and stop the traffic.'),
            { success: 0.2, time: 25 },
          ),
          opt(
            'grab',
            T('Haarake kinni esimesel võimalusel', 'Grab him at the first chance'),
            T('{callsign}, lähenege ja haarake kinni, kui ta tähelepanu hajub.', '{callsign}, close in and grab him when his attention wanders.'),
            { success: -0.1, risk: 0.1, time: -10, outcome: 'grabbed' },
          ),
        ],
        'talk',
      ),
      backup(
        u('patrol'),
        2,
        [
          T(
            '{callsign}: vajame teist ekipaaži silla teise otsa liiklust sulgema, autod sõidavad mehe selja tagant mööda!',
            '{callsign}: we need another crew to close the far end of the bridge, cars are driving right behind the man!',
          ),
        ],
        { chance: 0.6, timeoutMin: 6, fail: { success: -0.2, risk: 0.05, trust: -3 } },
      ),
      choice(
        10,
        [T('{callsign}: mehe sõber jõudis kohale ja tahab temaga rääkida. Kas lubame?', '{callsign}: the man’s friend has arrived and wants to talk to him. Do we let him?')],
        [
          opt(
            'friend',
            T('Jah, sõber räägib ametniku kõrval', 'Yes, the friend talks beside the officer'),
            T('{callsign}, lubage, aga ametnik jääb kõrvale ja sõber piirdele ei lähene.', '{callsign}, allow it, but the officer stays alongside and the friend keeps away from the railing.'),
            { success: 0.15, time: 10 },
          ),
          opt(
            'no',
            T('Ei, sõber jääb kaugemale', 'No, the friend stays back'),
            T('{callsign}, sõber jääb piiratud alast välja, räägib ainult ametnik.', '{callsign}, the friend stays outside the cordon, only the officer talks.'),
            { success: 0, time: 5 },
          ),
        ],
        'no',
        { chance: 0.5 },
      ),
      agency('kiirabi', 15, [
        T('{callsign}: palun kiirabi silla juurde valmis, mees vajab igal juhul arstiabi.', '{callsign}: please have an ambulance standing by at the bridge, the man needs medical help either way.'),
      ], { timeoutMin: 6 }),
    ],
    outcomes: [
      out(
        'saved',
        'hospital',
        [0.5, 1],
        5,
        T(
          'Ametnik rääkis mehe pärast pikka vestlust piirdest tagasi. Ta anti üle kiirabile ja toimetati psühhiaatrilisele hindamisele.',
          'After a long conversation the officer talked the man back over the railing. He was handed to the paramedics and taken for a psychiatric assessment.',
        ),
        { radio: T('{callsign}: mees räägitud piirdest tagasi, kiirabile üle antud.', '{callsign}: man talked back over the railing, handed to paramedics.') },
      ),
      out(
        'grabbed',
        'hospital',
        [0.3, 0.7],
        2,
        T(
          'Mees üritas hüpata, kuid ametnikud haarasid tal käest ja tõmbasid ta tagasi. Üks ametnik sai lihasevenituse, mees toimetati haiglasse.',
          'The man tried to jump but the officers caught his arm and pulled him back. One officer pulled a muscle; the man was taken to hospital.',
        ),
        { radio: T('{callsign}: mees haarati kinni ja tõmmati tagasi, haiglasse.', '{callsign}: man grabbed and pulled back, to hospital.') },
      ),
      out(
        'fell',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Mees kukkus enne, kui ametnikud jõudsid tema juurde, ja sai raskelt viga. Kiirabi toimetas ta haiglasse.',
          'The man fell before the officers could reach him and was seriously injured. The ambulance took him to hospital.',
        ),
        { radio: T('{callsign}: mees kukkus alla, raskelt vigastatud, haiglasse.', '{callsign}: man fell, seriously injured, to hospital.') },
      ),
      out(
        'tragedy',
        'tragedy',
        [0, 0.12],
        1,
        T(
          'Mees hüppas enne, kui temaga kontakti saadi. Tema elu ei õnnestunud päästa, lähedastele pakuti kriisiabi.',
          'The man jumped before anyone could make contact. He could not be saved; his family was offered crisis support.',
        ),
        { radio: T('{callsign}: mees hüppas, elu ei õnnestunud päästa.', '{callsign}: the man jumped, he could not be saved.') },
      ),
    ],
    expiresMin: 40,
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T('Üks mees seisab silla piirde taga ja tahab alla hüpata! Ma peatasin auto, palun tulge!', 'A man is standing outside the bridge railing and wants to jump! I have stopped my car, please come!'),
        T('Silla peal on noormees piirde välisküljel, ta nutab. Ma räägin temaga, aga ta ei lase ligi.', 'There is a young man on the outside of the bridge railing, he is crying. I am talking to him but he will not let me near.'),
      ],
      answers: {
        injured: [T('Ta ei ole vigastatud, aga hoiab ainult ühe käega kinni.', 'He is not hurt, but he is only holding on with one hand.')],
        intoxicated: [T('Ta on vist joonud, pudel on silla peal.', 'I think he has been drinking, there is a bottle on the bridge.')],
        safe: [T('Ma seisan eemal oma auto juures, ma ei lähe lähemale.', 'I am standing back by my car, I will not go closer.')],
      },
      answersRu: {
        injured: ['Он не ранен, но держится только одной рукой.'],
        intoxicated: ['Он, кажется, выпил, на мосту бутылка стоит.'],
        safe: ['Я стою подальше, у своей машины, ближе не подхожу.'],
      },
      openingRu: [
        'Мужчина стоит за перилами моста и хочет прыгнуть! Я {остановил|остановила} машину, приезжайте!',
        'На мосту парень с внешней стороны перил, он плачет. Я с ним говорю, но он не подпускает.',
      ],
    },
    tags: ['mental_health', 'suicide'],
  },

  // 14. A hunter missing after a driven hunt; shots heard; a hunting accident.
  {
    id: 'missing_jahimees_kadunud_lasud',
    category: 'missing',
    code: 'OTS',
    title: T('Jahimees kadunud, metsast kostsid lasud', 'Hunter missing after shots in the forest'),
    priority: 2,
    weight: 0.9,
    months: [10, 11, 12, 1],
    hours: 'day',
    places: ['forest'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('k9'), u('heli')] },
    onScene: [50, 120],
    persons: [
      { role: 'missing', gender: 'M', age: [35, 75], weapon: 1 },
      { role: 'caller', gender: 'M', age: [35, 70], relation: 'friend', weapon: 0.9 },
      { role: 'suspect', gender: 'M', age: [25, 70], weapon: 1 },
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.8, reason: T('Võimalik jahiõnnetus, tulirelvavigastus', 'Possible hunting accident, gunshot wound') }],
    summary: [
      T(
        '{address}. Jahiseltsi juhataja teatel ei ilmunud üks jahimees ajujahi lõpus kogunemiskohta. Tema liini poolt kostis kaks lasku ja telefon ei vasta.',
        '{address}. The head of a hunting club reports that one hunter did not turn up at the meeting point after a driven hunt. Two shots were heard from his stand and his phone is not answering.',
      ),
      T(
        '{address}. Ajujahil kadus side ühe jahimehega. Kaaslased kuulsid tema kandist laske ja karjet ning otsivad teda ise metsast.',
        '{address}. Contact has been lost with a hunter during a driven hunt. His companions heard shots and a cry from his direction and are searching the forest themselves.',
      ),
    ],
    callerLines: [
      T(
        'Meil on üks mees puudu, ajujaht lõppes pool tundi tagasi. Tema poolt kostis kaks pauku, aga põtra seal ei olnud.',
        'We are one man short, the drive ended half an hour ago. Two shots came from his side, but there was no moose there.',
      ),
      T('Ta ei vasta telefonile. Läheme ahelikus metsa, aga hakkab pimedaks minema.', 'He is not answering his phone. We are going into the forest in a line, but it is getting dark.'),
    ],
    details: [
      T('Teataja kuulis pärast laske kauget karjet.', 'The caller heard a distant cry after the shots.'),
      T('Jahimehe auto seisab metsateel, telefon oli viimati võrgus paari kilomeetri kaugusel.', 'The hunter’s car is parked on a forest track; his phone was last on the network a couple of kilometres away.'),
    ],
    beats: [
      search(2, 1.5, [
        T(
          '{callsign}: kaaslased kammivad metsa ahelikus, meie võtame telefoni viimase asukoha ümbruse. Koerajuht oleks väga vajalik.',
          '{callsign}: his companions are sweeping the forest in a line, we are taking the area around the last phone location. A dog handler would be very useful.',
        ),
      ]),
      agency('kiirabi', 5, [
        T(
          '{callsign}: palun kiirabi metsatee otsa, juhatame nad kohale. Jahimehel võib olla tulirelvavigastus.',
          '{callsign}: ambulance to the end of the forest track please, we will guide them in. The hunter may have a gunshot wound.',
        ),
      ], { timeoutMin: 6 }),
      qp('suspect', 8, [
        T(
          '{callsign}: naaberliinil seisnud jahimees ütleb, et lasi kaks korda põõsas liikuva looma pihta. Nimi {name}, isikukood {idcode}. Kontrolli relvaluba.',
          '{callsign}: the hunter on the neighbouring stand says he fired twice at something moving in the bushes. Name {name}, ID code {idcode}. Check his weapons permit.',
        ),
      ]),
      choice(
        10,
        [
          T(
            '{callsign}: jahijuhataja küsib, kas teised jahimehed võivad relvad autodesse panna ja lahkuda.',
            '{callsign}: the hunt leader asks whether the other hunters may put their guns in the cars and leave.',
          ),
        ],
        [
          opt(
            'secure',
            T('Ei, relvad kokku, kõik jäävad', 'No, collect the guns, everyone stays'),
            T('{callsign}, kõik relvad kokku ja tühjaks, ütlused kõigilt. Sündmuskoht piirata, uurija tuleb.', '{callsign}, collect and unload every gun, statements from everyone. Cordon the scene, an investigator is coming.'),
            { success: 0.15, time: 25 },
          ),
          opt(
            'leave',
            T('Lubage lahkuda, andmed kirja', 'Let them go, take their details'),
            T('{callsign}, pange kõigi andmed kirja ja lubage lahkuda, laskja jääb.', '{callsign}, take everyone’s details and let them go, the shooter stays.'),
            { success: -0.1, time: 5 },
          ),
        ],
        'leave',
      ),
    ],
    outcomes: [
      out(
        'found_wounded',
        'hospital',
        [0.5, 1],
        4,
        T(
          'Jahimees leiti haavatuna ja toimetati haiglasse, tema elu ei ole ohus. Laskja relv ja jahiluba võeti ära, alustati kriminaalmenetlust KarS § 124 järgi.',
          'The hunter was found wounded and taken to hospital; his life is not in danger. The shooter’s gun and hunting licence were seized and criminal proceedings opened under KarS § 124.',
        ),
        { injuries: 1, radio: T('{callsign}: jahimees leitud haavatuna, haiglasse, relv ära võetud.', '{callsign}: hunter found wounded, to hospital, gun seized.') },
      ),
      out(
        'lost_only',
        'resolved',
        [0.55, 1],
        2,
        T(
          'Jahimees oli eksinud ja tema telefon tühjaks saanud, lasud teda ei tabanud. Ta leiti koera abil tervena, kuid läbi külmununa.',
          'The hunter had got lost and his phone had died; the shots had not hit him. The dog found him unhurt but chilled to the bone.',
        ),
        { radio: T('{callsign}: jahimees oli eksinud, leitud tervena, lõpetame.', '{callsign}: the hunter was lost, found unhurt, closing.') },
      ),
      out(
        'late',
        'hospital',
        [0.2, 0.55],
        2,
        T(
          'Haavatud jahimees leiti alles pimeduses pärast pikka otsingut. Ta toimetati raskes seisus haiglasse, laskja suhtes alustati kriminaalmenetlust.',
          'The wounded hunter was only found in the dark after a long search. He was taken to hospital in a serious condition and proceedings were opened against the shooter.',
        ),
        { injuries: 1, radio: T('{callsign}: haavatu leitud alles pimedas, raskes seisus.', '{callsign}: wounded man found only after dark, serious condition.') },
      ),
      out(
        'tragedy',
        'tragedy',
        [0, 0.2],
        1,
        T(
          'Jahimees leiti elutuna, ta oli saanud naaberliinilt tabamuse. Laskja peeti kinni, alustati kriminaalmenetlust KarS § 117 järgi.',
          'The hunter was found dead; he had been hit from the neighbouring stand. The shooter was detained and criminal proceedings opened under KarS § 117.',
        ),
        { arrests: 1, radio: T('{callsign}: jahimees leitud elutuna, laskja kinni peetud.', '{callsign}: hunter found dead, shooter detained.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.55,
      toPriority: 1,
      text: T(
        'Teataja: metsast kostavad abihüüded, mees on vist haavatud, aga me ei leia teda veel üles.',
        'Caller: we can hear cries for help from the forest, the man seems to be hurt but we still cannot find him.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T('Tere, ma olen jahijuhataja. Meil on ajujahilt üks mees puudu ja tema poolt kostsid lasud.', 'Hello, I am the hunt leader. We are one man short after the drive and shots came from his direction.'),
        T('Üks jahimees ei tulnud kogunemiskohta ega vasta telefonile. Kuulsime kahte lasku ja karjet.', 'One hunter did not come to the meeting point and is not answering his phone. We heard two shots and a cry.'),
      ],
      answers: {
        suspect: [T('Oranž vest ja roheline jope, umbes viiekümnene.', 'An orange vest and a green jacket, about fifty.')],
        weapons: [T('Kõigil on jahipüssid, see on ajujaht.', 'Everyone has hunting rifles, it is a driven hunt.')],
        when: [T('Lasud kostsid umbes pool tundi tagasi.', 'The shots were about half an hour ago.')],
        count: [T('Meid on kokku viisteist meest.', 'There are fifteen of us altogether.')],
      },
      answersRu: {
        suspect: ['Оранжевый жилет и зелёная куртка, лет пятидесяти.'],
        weapons: ['У всех охотничьи ружья, это загонная охота.'],
        when: ['Выстрелы были где-то полчаса назад.'],
        count: ['Нас всего пятнадцать человек.'],
      },
      openingRu: [
        'Здравствуйте, я руководитель охоты. После загона у нас нет одного человека, с его стороны были выстрелы.',
        'Один охотник не пришёл к месту сбора и не отвечает. Мы слышали два выстрела и крик.',
      ],
    },
    tags: ['search', 'hunting'],
  },

  // 15. A drone dropping contraband into a prison yard; the operator waits nearby.
  {
    id: 'major_droon_vangla_kohal',
    category: 'major',
    code: 'DROON',
    title: T('Droon toob vangla hoovi saadetise', 'Drone dropping contraband into a prison yard'),
    priority: 3,
    weight: 0.08,
    hours: 'night',
    places: ['prison'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('k9')] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [19, 40], record: 0.6, wanted: 0.1 },
      { role: 'caller', gender: 'any', age: [28, 55], relation: 'employee' },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect', noInsurance: 0.2 }],
    summary: [
      T(
        '{place}, {address}. Vangla valvekeskuse teatel tiirles jalutushoovi kohal droon, mis heitis maha saadetise. Operaatorit nähti vangla taga metsateel auto juures.',
        '{place}, {address}. The prison control room reports a drone circling over an exercise yard that dropped a parcel. The operator was seen by a car on a forest track behind the prison.',
      ),
      T(
        '{place}, {address}. Vanglaametnikud märkasid öösel müüri kohal tuledeta drooni. Saadetis kukkus hoovi, droon lendas metsa poole.',
        '{place}, {address}. Prison officers spotted an unlit drone over the wall in the night. A parcel fell into the yard and the drone flew off towards the forest.',
      ),
    ],
    callerLines: [
      T('Meil lendas droon üle müüri ja viskas hoovi saadetise. See on meil käes, sees on telefonid ja tabletid.', 'A drone flew over our wall and dropped a parcel in the yard. We have it, it contains phones and pills.'),
      T('Valvekaamera näitab metsateel autot, mille juures seisab mees puldiga.', 'The camera shows a car on the forest track with a man standing by it holding a controller.'),
    ],
    details: [
      T('Valvekaamera järgi valmistub operaator drooni uuesti õhku saatma.', 'The camera shows the operator getting ready to launch the drone again.'),
      T('Vanglas on sel kuul leitud juba mitu drooniga toodud saadetist.', 'Several drone deliveries have already been found at the prison this month.'),
    ],
    beats: [
      qv('arrive', [
        T(
          '{callsign}: metsateel seisab {car}, numbrimärk {plate}, mootor töötab. Palun kontrolli enne lähenemist.',
          '{callsign}: a car on the forest track with the engine running, {car}, plate {plate}. Please run it before we approach.',
        ),
      ]),
      qp('suspect', 1, [
        T(
          '{callsign}: valvur tundis auto juures seisnud mehe kaamerast ära, endine kinnipeetav: {name}, isikukood {idcode}. Kontrolli palun.',
          '{callsign}: a prison officer recognised the man by the car on camera, a former inmate: {name}, ID code {idcode}. Please check.',
        ),
      ]),
      pursuit(2, [
        T('{callsign}: juht nägi meid, viskas puldi aknast välja ja kihutab minema! Alustame jälitust.', '{callsign}: the driver saw us, threw the controller out of the window and is speeding off! Starting a pursuit.'),
      ], 0.35),
      search(4, 1, [
        T(
          '{callsign}: kaasosaline jooksis metsa, droon maandus kuskil lähedal. Kammime ala, koerajuht kuluks ära.',
          '{callsign}: an accomplice ran into the forest and the drone came down somewhere nearby. Combing the area, a dog handler would help.',
        ),
      ], 0.4),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Drooni operaator peeti kinni, autost leiti teine droon ja kolm saadetist telefonide ning ravimitega. Alustati kriminaalmenetlust keelatud esemete vanglasse toimetamise eest.',
          'The drone operator was detained; a second drone and three parcels with phones and pills were found in the car. Criminal proceedings were opened for smuggling prohibited items into a prison.',
        ),
        { arrests: 1, radio: T('{callsign}: operaator kinni, autost teine droon ja saadetised.', '{callsign}: operator detained, second drone and parcels in the car.') },
      ),
      out(
        'inside_link',
        'arrest',
        [0.6, 1],
        1,
        T(
          'Operaator peeti kinni ja tema telefonist selgus kinnipeetav, kes saadetisi tellis. Vangla alustas distsiplinaarmenetlust, kriminaalmenetlus jätkub.',
          'The operator was detained and his phone revealed the prisoner who ordered the parcels. The prison started disciplinary proceedings and the criminal case continues.',
        ),
        { arrests: 1, radio: T('{callsign}: operaator kinni, tellija vanglas tuvastatud.', '{callsign}: operator detained, the buyer inside identified.') },
      ),
      out(
        'drone_seized',
        'report',
        [0.35, 0.8],
        2,
        T(
          'Droon ja pult leiti metsast, kuid operaator pääses. Sõrmejäljed ja drooni mälu antakse ekspertiisi.',
          'The drone and the controller were found in the forest but the operator got away. Fingerprints and the drone’s memory go for forensic analysis.',
        ),
        { radio: T('{callsign}: droon ja pult leitud, operaator pääses.', '{callsign}: drone and controller found, operator got away.') },
      ),
      out(
        'escaped',
        'escaped',
        [0, 0.4],
        3,
        T(
          'Operaator pääses metsateid pidi minema. Vanglaametnikud konfiskeerisid hoovi kukkunud saadetise, auto omanik on numbrimärgi järgi teada ja menetlus jätkub.',
          'The operator got away along the forest tracks. Prison officers confiscated the parcel that fell into the yard; the car’s owner is known from the plate and the case continues.',
        ),
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.5,
      toPriority: 2,
      text: T('Vangla: droon tõusis uuesti õhku ja auto hakkab metsateelt lahkuma.', 'Prison: the drone is airborne again and the car is starting to leave the forest track.'),
    },
    expiresMin: 75,
    interactiveChance: 0.2,
    call: {
      mood: 'calm',
      opening: [
        T('Tere, siin vangla valvekeskus. Droon heitis jalutushoovi saadetise ja operaator on meie kaameras metsateel.', 'Hello, prison control room here. A drone has dropped a parcel in the exercise yard and the operator is on our camera on the forest track.'),
        T('Meil on droon müüri kohal, üks saadetis on juba hoovis. Operaatori auto seisab vangla taga.', 'We have a drone over the wall and one parcel is already in the yard. The operator’s car is parked behind the prison.'),
      ],
      answers: {
        vehicle: [T('{car}, number {plate}, seisab metsateel.', '{car}, number {plate}, standing on the forest track.')],
        count: [T('Auto juures on üks mees, teine võib olla autos.', 'One man by the car, another may be inside.')],
        weapons: [T('Relva me kaameras ei näe.', 'We cannot see a weapon on the camera.')],
      },
      answersRu: {
        vehicle: ['{car}, номер {plate}, стоит на лесной дороге.'],
        count: ['У машины один мужчина, второй, может, внутри.'],
        weapons: ['Оружия на камере мы не видим.'],
      },
      openingRu: [
        'Здравствуйте, это дежурная часть тюрьмы. Дрон сбросил посылку во двор, оператор на нашей камере у лесной дороги.',
        'Над стеной дрон, одна посылка уже во дворе. Машина оператора стоит за тюрьмой.',
      ],
    },
    tags: ['drone', 'prison'],
  },

  // 16. Fuel theft from a lorry at a parking area on Via Baltica, with a cross-border angle.
  {
    id: 'property_kutusevargus_rekkaparklas',
    category: 'property',
    code: 'VG',
    title: T('Kütusevargus veoki paagist', 'Fuel theft from a lorry'),
    priority: 3,
    weight: 0.8,
    hours: 'night',
    regions: ['pohja', 'laane'],
    places: ['highway', 'gasstation', 'parking'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('traffic')] },
    onScene: [30, 70],
    persons: [
      { role: 'caller', gender: 'M', age: [28, 60] },
      { role: 'suspect', gender: 'M', age: [22, 45], record: 0.5, wanted: 0.1 },
      { role: 'suspect', gender: 'M', age: [20, 45], record: 0.4 },
    ],
    vehicles: [{ role: 'suspect', kind: 'van', driverRole: 'suspect', stolen: 0.15 }],
    summary: [
      T(
        '{address}. Via Baltica äärses parklas ärkas veokijuht selle peale, et tema paaki lõigatakse lahti. Kaks meest pumpavad kütust kaubikus olevatesse kanistritesse.',
        '{address}. At a parking area on the Via Baltica a lorry driver woke up to someone cutting into his fuel tank. Two men are pumping diesel into canisters in a van.',
      ),
      T(
        '{address}. Veokijuht teatas, et tema veoki paagist varastatakse kütust. Vargad on kohal, kaubik seisab kõrval tuled kustus.',
        '{address}. A lorry driver reports that diesel is being stolen from his tank. The thieves are still there, their van parked alongside with the lights off.',
      ),
    ],
    callerLines: [
      T('Nad varastavad mu diislit! Kaks meest ja kaubik, praegu, otse mu veoki kõrval!', 'They are stealing my diesel! Two men and a van, right now, right next to my truck!'),
      T('Ma ei julge kabiinist välja minna, üks neist vaatab minu poole.', 'I do not dare get out of the cab, one of them is looking at me.'),
    ],
    details: [
      T(
        'Veokijuhi sõnul märkasid vargad, et ta helistab, ja hakkasid kanistreid kiiresti kaubikusse tõstma.',
        'The driver says the thieves noticed him on the phone and started loading the canisters into the van in a hurry.',
      ),
      T(
        'Samal ööl on sarnaseid vargusi olnud ka Läti pool piiri, kaubik võib suunduda lõunasse.',
        'There have been similar thefts on the Latvian side of the border the same night; the van may be heading south.',
      ),
    ],
    beats: [
      qv('arrive', [
        T('{callsign}: kohal. Veokijuht andis kaubiku numbri: {car}, numbrimärk {plate}. Kontrolli palun.', '{callsign}: on scene. The lorry driver gave us the van’s number: {car}, plate {plate}. Please run it.'),
      ]),
      pursuit(1, [
        T('{callsign}: kaubik lahkub, kanistrid loksuvad kastis. Juht ei peatu, jälitame!', '{callsign}: the van is leaving with the canisters sloshing in the back. The driver will not stop, we are in pursuit!'),
      ], 0.4),
      choice(
        6,
        [
          T(
            '{callsign}: kaubik sõidab lõuna poole. Kas teavitame Läti kolleege ühise kontaktpunkti kaudu, kui ta jõuab piirini enne meid?',
            '{callsign}: the van is heading south. Do we alert our Latvian colleagues through the joint contact point in case it reaches the border before us?',
          ),
        ],
        [
          opt(
            'latvia',
            T('Jah, teavitage Läti politseid', 'Yes, alert the Latvian police'),
            T('{callsign}, teavitame Läti kolleege, sõiduki kirjeldus läheb piirile.', '{callsign}, we are alerting the Latvian police, the description goes to the border.'),
            { success: 0.15, time: 5 },
          ),
          opt(
            'alone',
            T('Ei, otsime ise', 'No, we search ourselves'),
            T('{callsign}, piirkonna ekipaažid otsivad ise.', '{callsign}, the local crews will search themselves.'),
            { success: -0.05 },
          ),
        ],
        'alone',
        { chance: 0.6 },
      ),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Kaks meest peeti kinni, kaubikust leiti 400 liitrit diislit ja pumbad. Alustati kriminaalmenetlust KarS § 199 järgi, kütus tagastati veokijuhile.',
          'Two men were detained; 400 litres of diesel and pumps were found in the van. Criminal proceedings were opened under KarS § 199 and the fuel was returned to the driver.',
        ),
        { arrests: 2, radio: T('{callsign}: kaks meest kinni, kaubikus 400 liitrit diislit.', '{callsign}: two men detained, 400 litres of diesel in the van.') },
      ),
      out(
        'latvia',
        'report',
        [0.55, 1],
        2,
        T(
          'Kaubik peeti Läti politsei abiga kinni pärast piiri ületamist. Kahtlustatavad antakse Eestile üle Euroopa vahistamismääruse alusel.',
          'The van was stopped with the help of the Latvian police after it crossed the border. The suspects will be handed to Estonia under a European arrest warrant.',
        ),
        { radio: T('{callsign}: kaubik peatati Läti poolel, kahtlustatavad kinni.', '{callsign}: van stopped on the Latvian side, suspects held.') },
      ),
      out(
        'van_found',
        'report',
        [0.35, 0.7],
        2,
        T(
          'Vargad põgenesid, kuid kaubik leiti hommikul metsateelt koos kanistrite ja pumbaga. Kaubiku kasutaja on tuvastatud, kriminaalmenetlus KarS § 199 järgi jätkub.',
          'The thieves got away, but the van was found on a forest track in the morning with the canisters and the pump. Its user has been identified and the case under KarS § 199 continues.',
        ),
        { radio: T('{callsign}: kaubik leitud metsateelt, kasutaja tuvastatud.', '{callsign}: van found on a forest track, user identified.') },
      ),
      out(
        'fled',
        'escaped',
        [0, 0.4],
        3,
        T(
          'Vargad pääsesid kaubikuga minema, paagist oli varastatud umbes 300 liitrit diislit. Alustati kriminaalmenetlust, kaubiku kirjeldus edastati naaberriikidele.',
          'The thieves got away in the van with about 300 litres of diesel. Criminal proceedings were opened and the van’s description sent to neighbouring countries.',
        ),
        { radio: T('{callsign}: vargad pääsesid kaubikuga, kirjeldus edastatud.', '{callsign}: thieves got away in the van, description circulated.') },
      ),
      out(
        'driver_hurt',
        'hospital',
        [0, 0.3],
        1,
        T(
          'Vargad lõid veokijuhti raudkangiga ja põgenesid. Juht toimetati haiglasse, alustati kriminaalmenetlust röövimise tunnustel.',
          'The thieves hit the lorry driver with a crowbar and fled. He was taken to hospital and criminal proceedings for robbery were opened.',
        ),
        { injuries: 1, radio: T('{callsign}: veokijuht löödi, haiglasse, vargad põgenesid.', '{callsign}: lorry driver hit, to hospital, thieves fled.') },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.5,
      toPriority: 2,
      text: T('Veokijuht: üks mees tuli raudkangiga kabiini juurde ja tagub ust.', 'Lorry driver: one of the men has come to the cab with a crowbar and is banging on the door.'),
    },
    expiresMin: 75,
    interactiveChance: 0.2,
    call: {
      mood: 'panic',
      opening: [
        T('Mu veoki paagist varastatakse diislit! Kaks meest ja kaubik, nad on praegu siin!', 'Someone is stealing diesel from my lorry! Two men and a van, they are here right now!'),
        T('Ma magasin kabiinis ja ärkasin, kui paaki lõigati. Nad pumpavad kütust kanistritesse.', 'I was asleep in the cab and woke up when they cut the tank. They are pumping fuel into canisters.'),
      ],
      answers: {
        vehicle: [T('Hele kaubik, number {plate}.', 'A light-coloured van, number {plate}.')],
        count: [T('Kaks meest, võib-olla kolmas on kaubikus.', 'Two men, maybe a third in the van.')],
        weapons: [T('Ühel on mingi raudkang.', 'One of them has some kind of crowbar.')],
        safe: [T('Ma olen kabiinis, uksed on lukus.', 'I am in the cab with the doors locked.')],
      },
      answersRu: {
        vehicle: ['Светлый бус, номер {plate}.'],
        count: ['Двое мужчин, может, третий в бусе.'],
        weapons: ['У одного какая-то монтировка.'],
        safe: ['Я в кабине, двери закрыты.'],
      },
      openingRu: [
        'У меня из бака воруют дизель! Двое мужчин и фургон, они прямо сейчас здесь!',
        'Я спал в кабине и проснулся, когда резали бак. Они качают топливо в канистры.',
      ],
    },
    tags: ['in_progress', 'vehicle_flee'],
  },

  // 17. Squatters in a summer house in Ida-Viru; the owner arrives angry.
  {
    id: 'property_suvilas_voorad_elanikud',
    category: 'property',
    code: 'MV',
    title: T('Suvilas elavad võõrad', 'Strangers living in a summer house'),
    priority: 3,
    weight: 1.2,
    regions: ['ida'],
    months: [3, 4, 5, 6, 7, 8, 9, 10],
    hours: 'day',
    places: ['summerhouse', 'house'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'caller', gender: 'any', age: [45, 80], known: true },
      { role: 'suspect', gender: 'M', age: [30, 60], intoxicated: 0.6, record: 0.6, wanted: 0.15 },
    ],
    summary: [
      T(
        '{address}. Suvila omanik tuli üle pika aja kohale ja leidis majast võõrad mehed, kes väidavad, et elavad seal juba talvest saati. Omanik on väga vihane.',
        '{address}. A summer house owner came out for the first time in months and found strange men living there who say they have been there since winter. The owner is furious.',
      ),
      T(
        '{address}. Teataja sõnul on tema suvilasse sisse kolinud kaks tundmatut, ahi köeb ja aknad on kinni löödud. Omanik tahab ise uksest sisse minna.',
        '{address}. The caller says two strangers have moved into the caller’s summer house; the stove is lit and the windows are boarded up. The owner wants to force the way in personally.',
      ),
    ],
    callerLines: [
      T('Tulin oma suvilasse ja seal elavad mingid mehed! Minu voodis, minu nõudega!', 'I came to my summer house and some men are living there! In my bed, with my dishes!'),
      T('Nad ütlevad, et maja oli tühi ja nad on siin terve talve olnud. Lähen ise sisse ja viskan nad välja!', 'They say the house was empty and they have been here all winter. I am going in to throw them out myself!'),
      T('Neil on koer ja üks hoiab kirvest käes, ütleb, et lõhub puid.', 'They have a dog and one of them is holding an axe, says he is chopping firewood.'),
    ],
    details: [
      T('Omanik helistas vennale, kes on teel ja lubab asja ise ära lahendada.', 'The owner has phoned a brother, who is on the way and promises to sort it out himself.'),
      T('Suvilaühistu esimehe sõnul tõusis talvel suvila korstnast suitsu, kuid keegi ei teatanud.', 'The chairman of the allotment association says smoke rose from the chimney in winter, but nobody reported it.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: omanik nõuab, et viskaksime mehed kohe välja. Mehed väidavad, et neil on suuline kokkulepe eelmise omanikuga. Kuidas toimime?',
            '{callsign}: the owner demands we throw the men out at once. The men say they had a verbal agreement with the previous owner. How do we proceed?',
          ),
        ],
        [
          opt(
            'remove',
            T('Kodurahu rikkumine, isikud välja', 'Breach of the peace of the home, remove them'),
            T('{callsign}, omanik on dokumendiga tuvastatud, mehed tuleb majast välja juhtida. Seletused mõlemalt.', '{callsign}, the owner is identified with documents, the men must be led out of the house. Statements from both sides.'),
            { success: 0.15, time: 15 },
          ),
          opt(
            'civil',
            T('Tsiviilvaidlus, suunake kohtusse', 'Civil dispute, refer to court'),
            T('{callsign}, selgitage, et see on tsiviilvaidlus, ja hoidke pooled lahus.', '{callsign}, explain that it is a civil dispute and keep the two sides apart.'),
            { success: -0.15, time: 5, trust: -2, outcome: 'left_peacefully' },
          ),
        ],
        'civil',
      ),
      qp('suspect', 3, R_SUSPECT),
      backup(
        u('patrol'),
        6,
        [
          T(
            '{callsign}: omaniku sugulased tulid kohale ja olukord läheb käest ära, üks mees haaras kirve. Vajame kiiresti teist ekipaaži!',
            '{callsign}: the owner’s relatives have arrived and it is getting out of hand, one man has grabbed an axe. Need another crew fast!',
          ),
        ],
        { chance: 0.35, timeoutMin: 6, fail: { success: -0.25, risk: 0.1, trust: -4 } },
      ),
    ],
    outcomes: [
      out(
        'removed',
        'report',
        [0.5, 1],
        4,
        T(
          'Mehed juhiti majast välja, suvilast leiti omaniku kadunud tööriistad. Alustati kriminaalmenetlust KarS § 266 ja § 199 järgi.',
          'The men were led out of the house and the owner’s missing tools were found inside. Criminal proceedings were opened under KarS § 266 and § 199.',
        ),
        { radio: T('{callsign}: mehed majast välja, menetlus alustatud.', '{callsign}: men removed from the house, case opened.') },
      ),
      out(
        'wanted',
        'arrest',
        [0.55, 1],
        2,
        T(
          'Üks suvila elanikest osutus tagaotsitavaks ja peeti kinni. Teine lahkus omaniku nõudel, alustati menetlust kodurahu rikkumise kohta.',
          'One of the squatters turned out to be wanted and was detained. The other left at the owner’s demand; proceedings for breach of the peace of the home were opened.',
        ),
        { arrests: 1 },
      ),
      out(
        'left_peacefully',
        'resolved',
        [0.4, 0.85],
        2,
        T(
          'Mehed pakkisid asjad ja lahkusid. Omanik vahetab lukud, talle selgitati, kuidas kahju hüvitamist nõuda.',
          'The men packed up and left. The owner is changing the locks and was told how to claim compensation.',
        ),
        { radio: T('{callsign}: mehed lahkusid ise, omanik vahetab lukud.', '{callsign}: the men left, the owner is changing the locks.') },
      ),
      out(
        'fight',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Omaniku sugulased ja suvila elanikud läksid kaklema, üks mees sai kirvega käest viga. Mõlemad pooled tuvastati, alustati kriminaalmenetlust.',
          'The owner’s relatives and the squatters came to blows and one man was injured on the arm by the axe. Both sides were identified and criminal proceedings opened.',
        ),
        { injuries: 1, radio: T('{callsign}: kaklus suvilas, üks kirvega vigastatud.', '{callsign}: fight at the summer house, one hurt by the axe.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.5,
      toPriority: 2,
      text: T(
        'Teataja: omaniku vend jõudis kohale ja läks majja, sees käib kaklus ja mees kirvega karjub.',
        'Caller: the owner’s brother has arrived and gone into the house, there is a fight inside and the man with the axe is shouting.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.3,
    call: {
      mood: 'angry',
      opening: [
        T('Tulin oma suvilasse ja seal elavad võõrad mehed! Nad ei lähe ära!', 'I came to my summer house and strangers are living there! They will not leave!'),
        T('Minu suvilas on keegi terve talve elanud, ahi köeb ja aknad on kinni löödud!', 'Someone has been living in my summer house all winter, the stove is lit and the windows are boarded up!'),
      ],
      answers: {
        count: [T('Neid on kaks ja üks koer.', 'There are two of them and a dog.')],
        weapons: [T('Üks hoiab kirvest, ütleb, et lõhub puid.', 'One is holding an axe, says he is chopping wood.')],
        intoxicated: [T('Nad on purjus, igal pool on pudelid.', 'They are drunk, there are bottles everywhere.')],
      },
      answersRu: {
        count: ['Их двое и собака.'],
        weapons: ['Один держит топор, говорит, что колет дрова.'],
        intoxicated: ['Они пьяные, везде бутылки.'],
      },
      openingRu: [
        'Я {приехал|приехала} на свою дачу, а там живут чужие мужики! Они не уходят!',
        'На моей даче кто-то жил всю зиму, печка топится, окна заколочены!',
      ],
    },
    tags: ['squatters'],
  },

  // 18. A flat fire where someone may still be inside; a neighbour is suspected of arson.
  {
    id: 'assist_korteripoleng_inimene_sees',
    category: 'assist',
    code: 'TULI',
    title: T('Korteripõleng, sees võib olla inimene', 'Flat fire, someone may be inside'),
    priority: 1,
    weight: 0.12,
    hours: 'night',
    places: ['residential'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('criminal')] },
    onScene: [40, 90],
    persons: [
      { role: 'victim', gender: 'any', age: [60, 90] },
      { role: 'caller', gender: 'any', age: [25, 70], relation: 'neighbour' },
      { role: 'suspect', gender: 'M', age: [30, 65], relation: 'neighbour', intoxicated: 0.6, record: 0.5 },
    ],
    agencies: [
      { agency: 'paaste', chance: 1, reason: T('Tulekahju kortermajas, inimene võib olla sees', 'Fire in a block of flats, someone may be inside') },
      { agency: 'kiirabi', chance: 0.9, reason: T('Vingumürgituse oht', 'Risk of smoke inhalation') },
    ],
    summary: [
      T(
        '{address}. Teataja sõnul tuleb kolmanda korruse korterist paksu suitsu ja leeke. Seal elav eakas naabrinaine ei ole välja tulnud.',
        '{address}. The caller says thick smoke and flames are coming from a third-floor flat. The elderly woman who lives there has not come out.',
      ),
      T(
        '{address}. Kortermajas põleb korter ja trepikoda on suitsu täis. Naabrite sõnul ähvardas üks elanik eile põleva korteri omanikku „välja suitsetada“.',
        '{address}. A flat is on fire and the stairwell is full of smoke. Neighbours say one resident threatened yesterday to "smoke out" the owner of the burning flat.',
      ),
    ],
    callerLines: [
      T('Kolmandalt korruselt tuleb suitsu ja aknast paistavad leegid! Seal elab üks vanem inimene, ta ei ole väljas!', 'Smoke is pouring from the third floor and you can see flames in the window! An old person lives there and she has not come out!'),
      T('Trepikoda on suitsu täis, inimesed jooksevad õue. Üks naaber ütles, et see mees süütas selle meelega.', 'The stairwell is full of smoke and people are running outside. A neighbour said that man set it on purpose.'),
    ],
    details: [
      T(
        'Naabrite sõnul oli korteri omanikul ülemise korruse elanikuga pikk tüli, too ähvardas eile maja põlema panna.',
        'Neighbours say the owner had a long feud with the man upstairs, who threatened yesterday to set the place on fire.',
      ),
      T('Kahtlustatav naaber seisab õues, jälgib põlengut ja on joobes.', 'The suspected neighbour is standing outside watching the fire; he is drunk.'),
    ],
    beats: [
      agency('paaste', 'arrive', [
        T(
          '{callsign}: kohal, kolmandal korrusel põleb ja trepikoda on suitsu täis. Kinnitage Päästeameti väljasõit, sees võib olla inimene!',
          '{callsign}: on scene, the third floor is on fire and the stairwell is full of smoke. Confirm the Rescue Board is on its way, someone may be inside!',
        ),
      ], { timeoutMin: 4, fail: { success: -0.3, trust: -5 } }),
      choice(
        1,
        [
          T(
            '{callsign}: naabrid ütlevad, et eakas naine on sees. Päästjad on mõne minuti kaugusel. Kas proovime ise sisse minna?',
            '{callsign}: the neighbours say the old lady is inside. The rescuers are a few minutes away. Do we try to go in ourselves?',
          ),
        ],
        [
          opt(
            'evacuate',
            T('Ei, evakueerige teised korterid', 'No, evacuate the other flats'),
            T('{callsign}, suitsu ei minda. Evakueerige trepikojad ja juhatage päästjad kohale.', '{callsign}, do not go into the smoke. Evacuate the stairwells and guide the rescuers in.'),
            { success: 0.15, time: 10 },
          ),
          opt(
            'door',
            T('Proovige ukse juurest', 'Try from the door'),
            T('{callsign}, ainult ukse juurest hüüdke, suitsu sisse ei minda.', '{callsign}, call out from the door only, nobody goes into the smoke.'),
            { success: 0.05, risk: 0.12 },
          ),
        ],
        'evacuate',
        { timeoutMin: 2 },
      ),
      agency('kiirabi', 4, [
        T(
          '{callsign}: päästjad on sees. Palun kiirabi maja ette, ka mitu naabrit on suitsu sisse hinganud.',
          '{callsign}: the rescuers are inside. Ambulance to the building please, several neighbours have breathed in smoke too.',
        ),
      ], { timeoutMin: 5 }),
      qp('suspect', 10, [
        T(
          '{callsign}: ähvardanud naaber on õues, haiseb alkoholi järele ja naerab. Nimi {name}, isikukood {idcode}. Kontrolli palun.',
          '{callsign}: the neighbour who made the threats is outside, smells of alcohol and is laughing. Name {name}, ID code {idcode}. Please check.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'rescued',
        'hospital',
        [0.5, 1],
        4,
        T(
          'Päästjad tõid eaka naise suitsusest korterist välja ja ta toimetati haiglasse. Põlengu põhjust uurib Päästeamet koos politseiga, ähvardanud naaber peeti kahtlustatavana kinni.',
          'The rescuers brought the elderly woman out of the smoke-filled flat and she was taken to hospital. The Rescue Board and the police are investigating the cause; the neighbour who made threats was detained as a suspect.',
        ),
        { injuries: 1, arrests: 1, radio: T('{callsign}: naine päästetud, haiglasse, naaber kinni peetud.', '{callsign}: woman rescued, to hospital, neighbour detained.') },
      ),
      out(
        'accident',
        'resolved',
        [0.45, 1],
        2,
        T(
          'Selgus, et tulekahju sai alguse pliidile jäänud toidust, süütamise tunnuseid ei leitud. Naine toodi välja ja naabrid evakueeriti õigel ajal.',
          'It turned out the fire started from food left on the stove; there were no signs of arson. The woman was brought out and the neighbours evacuated in time.',
        ),
        { radio: T('{callsign}: pliidile jäänud toit, süütamist pole, lõpetame.', '{callsign}: food left on the stove, no arson, closing.') },
      ),
      out(
        'arson',
        'arrest',
        [0.4, 0.85],
        2,
        T(
          'Naaber tunnistas, et süütas ukse taga bensiiniga immutatud kaltsud. Ta peeti kinni, alustati kriminaalmenetlust KarS § 203 lg 2 järgi.',
          'The neighbour admitted setting fire to petrol-soaked rags outside the door. He was detained and criminal proceedings opened under KarS § 203(2).',
        ),
        { arrests: 1, radio: T('{callsign}: naaber tunnistas süütamist, kinni peetud.', '{callsign}: neighbour admitted the arson, detained.') },
      ),
      out(
        'smoke',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Naine toodi välja raske vingumürgitusega ja ka kaks naabrit vajasid arstiabi. Tulekahju põhjust uuritakse, alustati kriminaalmenetlust.',
          'The woman was brought out with severe smoke inhalation and two neighbours also needed treatment. The cause of the fire is being investigated and criminal proceedings were opened.',
        ),
        { injuries: 3, radio: T('{callsign}: naine raske vingumürgitusega, kolm haiglasse.', '{callsign}: woman with severe smoke inhalation, three to hospital.') },
      ),
      out(
        'tragedy',
        'tragedy',
        [0, 0.15],
        1,
        T(
          'Päästjad leidsid korterist eaka naise elutuna. Alustati kriminaalmenetlust ja süütamises kahtlustatav naaber peeti kinni.',
          'The rescuers found the elderly woman dead in the flat. Criminal proceedings were opened and the neighbour suspected of arson was detained.',
        ),
        { arrests: 1, radio: T('{callsign}: naine leiti elutuna, kahtlustatav kinni.', '{callsign}: woman found dead, suspect detained.') },
      ),
    ],
    expiresMin: 30,
    interactiveChance: 0.35,
    call: {
      mood: 'panic',
      opening: [
        T('Meie majas põleb korter, aknast tulevad leegid! Seal elab üks vanem naine, ta pole välja tulnud!', 'A flat is on fire in our building, flames are coming out of the window! An old lady lives there and she has not come out!'),
        T('Trepikoda on suitsu täis! Kolmandal korrusel põleb, keegi on veel sees!', 'The stairwell is full of smoke! The third floor is on fire and someone is still inside!'),
      ],
      answers: {
        injured: [T('Ma ei tea, naine on vist sees. Teised on õues.', 'I do not know, I think the lady is inside. The others are outside.')],
        suspect: [T('Ülemise korruse mees ähvardas eile, et paneb maja põlema. Ta seisab praegu õues.', 'The man from upstairs threatened yesterday to set the building on fire. He is standing outside right now.')],
        safe: [T('Ma olen õues, aga mu korter on samas trepikojas.', 'I am outside, but my flat is in the same stairwell.')],
      },
      answersRu: {
        injured: ['Не знаю, женщина, наверное, внутри. Остальные на улице.'],
        suspect: [
          'Мужик с верхнего этажа вчера грозился, что подожжёт дом. Он сейчас стоит на улице.',
        ],
        safe: ['Я на улице, но моя квартира в этом же подъезде.'],
      },
      openingRu: [
        'У нас в доме горит квартира, из окна пламя! Там живёт пожилая женщина, она не вышла!',
        'Подъезд весь в дыму! Горит на третьем этаже, там ещё кто-то есть!',
      ],
    },
    tags: ['fire', 'arson'],
  },
];
