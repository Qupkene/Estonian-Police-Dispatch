/**
 * Lõuna prefektuur: stories that only happen here (regions: ['louna']).
 *
 * Tartu's student nights (the Kaarsild arch, Toomemägi, the Kissing Students on Raekoja plats, the old Raadi
 * runway), the two towns of Valga and Valka, the lorry queue at Luhamaa, the Saatse Boot, the Piusa sand caves,
 * the onion fields and prayer houses of the Peipsi Old Believers, the ski tracks at Tehvandi and the moats of the
 * Viljandi castle hills. Every story is tied to its place with `placeTags` (tags in src/data/regions/louna.ts).
 *
 * Beats fire whatever the ending, so their radio lines state nothing an outcome could contradict; outcomes a
 * wrong decision can still reach are worded so they stay true after it (or the option forces its own outcome).
 */
import type { IncidentTemplate } from '@/sim/types';
import { R_DRIVER, R_SUSPECT, T, agency, choice, info, opt, out, pursuit, qp, qv, search, u } from '../escalating';

/** Night: from 21:00 (mostly from 22:00) to 05:59, nothing in the daytime. */
const NIGHT: number[] = [2.6, 2.8, 2.6, 2, 1.2, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 2, 2.4];
/** Summer nights at their darkest (23:00 to 02:59). */
const LATE_NIGHT: number[] = [2.6, 2.8, 2.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2.4];

export const TEMPLATES_REGIONAL_LOUNA: IncidentTemplate[] = [
  // 1. Tartu: a drunk student walks the arch of the Kaarsild at night, an old dare, with the Emajõgi below.
  {
    id: 'assist_kaarsilla_kaarel',
    category: 'assist',
    code: 'ABI',
    title: T('Purjus noormees Kaarsilla kaarel', 'Drunk young man on top of the Kaarsild arch'),
    priority: 2,
    weight: 0.6,
    regions: ['louna'],
    hours: NIGHT,
    weekendBoost: 1.6,
    places: ['lake'],
    placeTags: ['kaarsild'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [20, 50],
    persons: [
      { role: 'caller', gender: 'any', age: [19, 30], relation: 'friend' },
      { role: 'victim', gender: 'M', age: [19, 26], intoxicated: 0.9 },
    ],
    summary: [
      T(
        '{place}. Joobes noormees ronis öösel Kaarsilla kaarele ja kõnnib tipu poole, sõbrad ergutavad ja filmivad sillalt. Kaar on niiske ja libe.',
        '{place}. A drunk young man has climbed onto the arch of the Kaarsild in the night and is walking towards the top while his friends cheer and film from the bridge. The arch is damp and slippery.',
      ),
      T(
        '{place}. Teataja sõnul istub noormees Kaarsilla kaare tipus ja kõigub, all on Emajõgi. Alla ta tulla ei julge.',
        '{place}. The caller says a young man is sitting at the top of the Kaarsild arch, swaying, with the Emajõgi below. He does not dare come down.',
      ),
      T(
        '{place}. Tudengiseltskond tegi Kaarsillal kaare ületamise võistlust, üks noormees jäi kaare peale kinni ega liigu edasi ega tagasi.',
        '{place}. A group of students was racing each other over the Kaarsild arch; one young man is stuck on the arch and cannot go forward or back.',
      ),
    ],
    callerLines: [
      T(
        'Mu sõber ronis Kaarsilla kaare peale ja on täiesti purjus! Ta tahtis üle kaare minna, nagu tudengid vanasti tegid.',
        'My friend has climbed up onto the Kaarsild arch and he is completely drunk! He wanted to walk over the arch the way students used to.',
      ),
      T(
        'Ta libises korra ja hoiab nüüd kahe käega kaarest kinni. Edasi ta ei julge ja tagasi ka mitte.',
        'He slipped once and is now holding on to the arch with both hands. He does not dare go on and he does not dare go back either.',
      ),
      T(
        'Kõik filmivad ja karjuvad talle, et mine edasi. Ma kardan, et ta kukub jõkke.',
        'Everyone is filming and shouting at him to keep going. I am scared he will fall into the river.',
      ),
    ],
    details: [
      T(
        'Teataja sõnul libises noormees kaarel juba korra, nüüd istub ta tipus ja kõigub. Kukkudes võib ta sattuda jõkke.',
        'The caller says the young man has already slipped once on the arch; he is now sitting at the top, swaying. If he falls he may end up in the river.',
      ),
      T('Sillale on kogunenud paarkümmend pealtvaatajat, kes ergutavad teda.', 'About twenty onlookers have gathered on the bridge and are egging him on.'),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, noormees on kaare peal ja hoiab kahe käega kinni. Rahvas sillal karjub, viime pealtvaatajad eemale.',
          '{callsign}: on scene, the young man is up on the arch holding on with both hands. The crowd on the bridge is shouting, we are moving the onlookers back.',
        ),
      ]),
      choice(
        2,
        [
          T(
            '{callsign}: noormees vastab, aga on segaduses ja hirmust kange. Kas räägime ta rahulikult tagasi ja palume päästjad jõe äärde või läheb üks meist kaarele järele?',
            '{callsign}: the young man is answering but he is confused and stiff with fear. Do we talk him back calmly and get the rescuers to the riverbank, or does one of us climb up after him?',
          ),
        ],
        [
          opt(
            'talk',
            T('Rääkige ta tagasi, päästjad valmis', 'Talk him back, rescuers on standby'),
            T(
              '{callsign}, keegi kaarele ei roni. Rääkige ta samm-sammult tagasi, Päästeamet tuleb jõe äärde valmisolekusse.',
              '{callsign}, nobody climbs the arch. Talk him back step by step, the Rescue Board is coming to the riverbank on standby.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'climb',
            T('Üks ametnik läheb järele', 'One officer goes up after him'),
            T('{callsign}, üks ametnik läheb ettevaatlikult kaarele ja aitab ta alla.', '{callsign}, one officer goes carefully up onto the arch and helps him down.'),
            { success: 0, risk: 0.12 },
          ),
        ],
        'climb',
      ),
      agency(
        'paaste',
        3,
        [
          T(
            '{callsign}: palun Päästeamet veepäästevarustusega jõe äärde. Kui ta kukub, on ta vees.',
            '{callsign}: Rescue Board with water rescue gear to the riverbank please. If he falls, he will be in the water.',
          ),
        ],
        { timeoutMin: 6 },
      ),
      qp(
        'victim',
        12,
        [
          T(
            '{callsign}: sõbrad andsid noormehe andmed. Nimi {name}, isikukood {idcode}. Kontrolli palun.',
            '{callsign}: his friends have given us the young man’s details. Name {name}, ID code {idcode}. Please check.',
          ),
        ],
        0.7,
      ),
    ],
    outcomes: [
      out(
        'down',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Noormees tuli politseinike abiga kaarelt alla. Ta oli tugevas joobes ja toimetati kainenema, sõpradele selgitati, et kaarel kõndimine on eluohtlik.',
          'The young man came down off the arch with the officers’ help. He was heavily drunk and was taken to sober up; his friends were told that walking the arch can kill.',
        ),
        { radio: T('{callsign}: noormees kaarelt all, viime ta kainenema.', '{callsign}: young man down from the arch, taking him to sober up.') },
      ),
      out(
        'across',
        'warning',
        [0.4, 1],
        1,
        T(
          'Noormees jõudis kaare teise otsa ja ronis sillale. Talle ja filmijatele tehti hoiatus ning seltskond saadeti laiali.',
          'The young man made it to the other end of the arch and climbed down onto the bridge. He and the people filming were warned and the group was sent on its way.',
        ),
        { radio: T('{callsign}: noormees jõudis ise üle, hoiatus tehtud, lõpetame.', '{callsign}: he made it across himself, warning given, closing.') },
      ),
      out(
        'river',
        'hospital',
        [0.15, 0.5],
        2,
        T(
          'Noormees libises kaarelt Emajõkke. Päästjad tõmbasid ta kalda lähedalt välja ja ta toimetati alajahtumisega haiglasse.',
          'The young man slipped off the arch into the Emajõgi. The rescuers pulled him out near the bank and he was taken to hospital with hypothermia.',
        ),
        { injuries: 1, radio: T('{callsign}: kukkus jõkke, päästjad tõid välja, haiglasse.', '{callsign}: he fell into the river, rescuers got him out, to hospital.') },
      ),
      out(
        'deck',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Noormees kukkus kaarelt silla tekile ja murdis jala. Kiirabi viis ta haiglasse, filmijad olid vahepeal laiali läinud.',
          'The young man fell off the arch onto the bridge deck and broke his leg. An ambulance took him to hospital; the people filming had scattered in the meantime.',
        ),
        { injuries: 1, radio: T('{callsign}: kukkus sillale, jalaluumurd, kiirabi viis haiglasse.', '{callsign}: fell onto the bridge, broken leg, ambulance took him.') },
      ),
      out(
        'tragedy',
        'tragedy',
        [0, 0.12],
        1,
        T(
          'Noormees kukkus kaarelt jõkke ega tulnud enam pinnale. Päästeameti sukeldujad leidsid ta hiljem elutuna.',
          'The young man fell off the arch into the river and did not resurface. Rescue Board divers later found him dead.',
        ),
        { radio: T('{callsign}: noormees kukkus jõkke, sukeldujad leidsid ta elutuna.', '{callsign}: he fell into the river, divers found him dead.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.35,
      toPriority: 1,
      text: T(
        'Teataja: noormees libises kaarel ja ripub nüüd kätepidi kaare küljes, all on jõgi!',
        'Caller: the young man slipped on the arch and is now hanging from it by his hands, with the river below!',
      ),
    },
    expiresMin: 60,
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mu sõber ronis Kaarsilla kaare peale ja on täiesti purjus! Ta istub seal üleval ja kõigub!',
          'My friend has climbed up onto the Kaarsild arch and he is completely drunk! He is sitting up there swaying!',
        ),
        T(
          'Mu sõber kõnnib Kaarsilla kaare peal ja all on jõgi! Tulge kiiresti, ta kukub!',
          'My friend is walking along the top of the Kaarsild arch with the river below! Come quickly, he is going to fall!',
        ),
      ],
      answers: {
        intoxicated: [T('Jah, ta on väga purjus, me olime terve õhtu väljas.', 'Yes, he is very drunk, we have been out all evening.')],
        injured: [T('Veel mitte, aga ta libises juba korra.', 'Not yet, but he has already slipped once.')],
        count: [T('Sillal on paarkümmend inimest ja kõik filmivad.', 'There are about twenty people on the bridge and they are all filming.')],
        suspect: [T('Noor tudeng, heledas jopes. Ta istub kaare tipus ja hoiab kinni.', 'A young student in a light jacket. He is sitting at the top of the arch, holding on.')],
        direction: [T('Ta ei ole kuhugi läinud, istub ikka kaare peal.', 'He has not gone anywhere, he is still sitting on the arch.')],
      },
      answersRu: {
        intoxicated: ['Да, он очень пьяный, мы весь вечер гуляли.'],
        injured: ['Пока нет, но он уже один раз поскользнулся.'],
        count: ['На мосту человек двадцать, и все снимают.'],
        suspect: ['Молодой студент, в светлой куртке. Сидит на самом верху арки и держится.'],
        direction: ['Никуда он не делся, так и сидит на арке.'],
      },
      openingRu: [
        'Мой друг залез на арку Арочного моста, он совсем пьяный! Сидит там наверху и шатается!',
        'Мой друг идёт по арке Арочного моста, а внизу река! Приезжайте быстрее, он упадёт!',
      ],
    },
    tags: ['students', 'alcohol', 'water'],
  },

  // 2. Tartu: two men rob a student walking home over Toomemägi at night.
  {
    id: 'property_toomemae_oine_roov',
    category: 'property',
    code: 'RÖ',
    title: T('Tudengit rööviti öösel Toomemäel', 'Student robbed on Toomemägi at night'),
    priority: 2,
    weight: 0.5,
    regions: ['louna'],
    hours: NIGHT,
    weekendBoost: 1.6,
    places: ['park'],
    placeTags: ['toomemagi'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('k9')] },
    onScene: [30, 70],
    persons: [
      { role: 'caller', gender: 'any', age: [19, 28], relation: 'friend' },
      { role: 'victim', gender: 'M', age: [19, 26], intoxicated: 0.6 },
      { role: 'suspect', gender: 'M', age: [17, 30], record: 0.6, wanted: 0.1, intoxicated: 0.5 },
      { role: 'suspect', gender: 'M', age: [17, 30], record: 0.4 },
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.7, reason: T('Kannatanul on peavigastus', 'The victim has a head injury') }],
    summary: [
      T(
        '{address}. Toomemäel Inglisilla juures ründasid kaks meest koju jalutavat tudengit, lõid ta pikali ning võtsid telefoni ja rahakoti. Ründajad jooksid mäest alla kesklinna poole.',
        '{address}. On Toomemägi by the Angel’s Bridge two men attacked a student walking home, knocked him down and took his phone and wallet. The attackers ran down the hill towards the town centre.',
      ),
      T(
        '{address}. Teataja sõnul peksti tema sõpra Toomemäel Kuradisilla all, kannatanul jookseb peast verd. Kaks ründajat võtsid tema telefoni ja jope.',
        '{address}. The caller says a friend was beaten up under the Devil’s Bridge on Toomemägi and is bleeding from the head. The two attackers took his phone and jacket.',
      ),
    ],
    callerLines: [
      T(
        'Meid rünnati Toomemäel! Kaks tüüpi tulid pimedast välja, üks lõi mu sõbra pikali ja nad võtsid ta telefoni.',
        'We were attacked on Toomemägi! Two guys came out of the dark, one knocked my friend down and they took his phone.',
      ),
      T('Tal jookseb peast verd, ta istub maas ja ei saa aru, kus ta on.', 'His head is bleeding, he is sitting on the ground and does not know where he is.'),
      T('Nad jooksid mäest alla kesklinna poole, kaks noort meest. Ma ei julgenud järele minna.', 'They ran down the hill towards the centre, two young men. I did not dare go after them.'),
    ],
    details: [
      T(
        'Kannatanu sõbra telefonis on rakendus, mis näitab varastatud telefoni asukohta: see liigub Raekoja platsi poolt Emajõe suunas.',
        'The victim’s friend has an app that shows where the stolen phone is: it is moving from Raekoja plats towards the Emajõgi.',
      ),
      T(
        'Politsei andmetel on Toomemäelt samal nädalal teatatud veel kahest öisest röövist, ründajad olid mõlemal korral kaks noormeest.',
        'Police records show two more night-time robberies on Toomemägi the same week; both times the attackers were two young men.',
      ),
    ],
    beats: [
      agency(
        'kiirabi',
        'arrive',
        [
          T(
            '{callsign}: kohal, kannatanul on peahaav ja ta on segaduses. Palun kiirabi Toomemäele, juhatame Lossi tänavalt.',
            '{callsign}: on scene, the victim has a head wound and is confused. Ambulance to Toomemägi please, we will guide it in from Lossi street.',
          ),
        ],
        { timeoutMin: 6 },
      ),
      choice(
        3,
        [
          T(
            '{callsign}: sõbra telefon näitab varastatud telefoni asukohta, see liigub Emajõe kalda poole. Kas saadame teise ekipaaži sinna või kammime mäe läbi?',
            '{callsign}: the friend’s phone shows where the stolen phone is, it is moving towards the Emajõgi bank. Do we send a second crew there or comb the hill?',
          ),
        ],
        [
          opt(
            'track',
            T('Teine ekipaaž telefoni järgi', 'Second crew follows the phone'),
            T(
              '{callsign}, jääte kannatanu juurde. Teine ekipaaž liigub telefoni asukoha järgi Emajõe äärde, kirjeldus on edastatud.',
              '{callsign}, you stay with the victim. A second crew will follow the phone’s location to the Emajõgi, the description has been passed on.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'comb',
            T('Kammige mägi läbi', 'Comb the hill'),
            T('{callsign}, vaadake mäel ringi, ehk on nad veel lähedal.', '{callsign}, look around the hill, they may still be close by.'),
            { success: 0, time: 10 },
          ),
        ],
        'comb',
      ),
      search(
        6,
        2,
        [
          T(
            '{callsign}: telefoni signaal kadus Emajõe ääres. Otsime kahte noormeest kalda ja kesklinna vahel.',
            '{callsign}: the phone signal has been lost by the Emajõgi. Searching for two young men between the riverbank and the centre.',
          ),
        ],
        0.6,
      ),
      qp(
        'suspect',
        12,
        [
          T(
            '{callsign}: kontrollime kirjeldusele vastavat noormeest. Nimi {name}, isikukood {idcode}. Kontrolli palun.',
            '{callsign}: we are checking a young man matching the description. Name {name}, ID code {idcode}. Please check.',
          ),
        ],
        0.7,
      ),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.55, 1],
        4,
        T(
          'Kesklinnas Emajõe lähedal peeti kinni kaks noormeest, ühel neist oli kannatanu telefon ja rahakott. Alustati kriminaalmenetlust röövimise kohta KarS § 200 järgi, kannatanu toimetati haiglasse läbivaatusele.',
          'Two young men were detained in the town centre near the Emajõgi, one of them carrying the victim’s phone and wallet. Criminal proceedings for robbery were opened under KarS § 200 and the victim was taken to hospital to be examined.',
        ),
        { arrests: 2, radio: T('{callsign}: kaks röövlit kinni, telefon tagasi, kannatanu haiglasse.', '{callsign}: two robbers detained, phone recovered, victim to hospital.') },
      ),
      out(
        'one',
        'arrest',
        [0.4, 1],
        1,
        T(
          'Üks ründajatest peeti kinni bussijaama juures, teine pääses. Teist ründajat tuvastatakse linna valvekaamerate salvestiste järgi, alustati kriminaalmenetlust.',
          'One of the attackers was detained near the bus station; the other got away and is being identified from the city’s CCTV footage. Criminal proceedings were opened.',
        ),
        { arrests: 1, radio: T('{callsign}: üks kinni, teine pääses, tuvastame kaameratest.', '{callsign}: one detained, the other got away, identifying from cameras.') },
      ),
      out(
        'hospital',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Kannatanu toimetati peapõrutusega haiglasse. Ründajad jõudsid kaduda enne, kui ala läbi otsiti, alustati kriminaalmenetlust röövimise kohta.',
          'The victim was taken to hospital with concussion. The attackers vanished before the area was searched; criminal proceedings for robbery were opened.',
        ),
        { injuries: 1, radio: T('{callsign}: kannatanu peapõrutusega haiglasse, ründajad kadusid.', '{callsign}: victim to hospital with concussion, attackers gone.') },
      ),
      out(
        'escaped',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Ründajaid ei leitud ja telefon lülitati välja. Kannatanu keeldus kiirabist, temalt võeti seletus ja menetlus jätkub.',
          'The attackers were not found and the phone was switched off. The victim refused the ambulance; a statement was taken and the case continues.',
        ),
        { radio: T('{callsign}: ründajaid ei leitud, menetlus jätkub.', '{callsign}: attackers not found, the case continues.') },
      ),
    ],
    expiresMin: 60,
    interactiveChance: 0.35,
    call: {
      mood: 'panic',
      opening: [
        T('Meid rünnati Toomemäel! Kaks meest lõid mu sõbra pikali ja võtsid ta telefoni!', 'We were attacked on Toomemägi! Two men knocked my friend down and took his phone!'),
        T(
          'Mu sõpra peksti Kuradisilla all, tal jookseb peast verd! Need tüübid jooksid ära!',
          'My friend has been beaten up under the Devil’s Bridge, his head is bleeding! Those guys ran off!',
        ),
      ],
      answers: {
        injured: [T('Tal on peas haav ja ta on segaduses, aga räägib.', 'He has a wound on his head and is confused, but he is talking.')],
        direction: [T('Nad jooksid mäest alla kesklinna poole, jõe suunas.', 'They ran down the hill towards the centre, towards the river.')],
        count: [T('Neid oli kaks, noored mehed.', 'There were two of them, young men.')],
        weapons: [T('Relva ma ei näinud, üks lõi rusikaga.', 'I did not see a weapon, one of them hit him with his fist.')],
        safe: [T('Jah, nad jooksid ära. Ma olen sõbra juures, siin on nüüd rahulik.', 'Yes, they ran off. I am with my friend, it is quiet here now.')],
        when: [T('Paar minutit tagasi, nad jooksid kohe ära.', 'A couple of minutes ago, they ran off straight away.')],
      },
      answersRu: {
        injured: ['У него рана на голове, он плохо соображает, но говорит.'],
        direction: ['Они побежали с горы вниз, к центру, в сторону реки.'],
        count: ['Их было двое, молодые парни.'],
        weapons: ['Оружия я не {видел|видела}, один ударил кулаком.'],
        safe: ['Да, они убежали. Я с другом, тут уже спокойно.'],
        when: ['Пару минут назад, они сразу убежали.'],
      },
      openingRu: [
        'На нас напали на Тоомемяги! Двое мужиков сбили моего друга с ног и забрали у него телефон!',
        'Моего друга избили под Чёртовым мостом, у него голова в крови! Эти типы убежали!',
      ],
    },
    tags: ['students', 'robbery'],
  },

  // 3. Valga and Valka are one town across the border: Latvian police chase a stolen car over the town line.
  {
    id: 'property_valkas_varastatud_auto',
    category: 'property',
    code: 'SV',
    title: T('Valkas varastatud auto sõitis üle piiri Valgasse', 'Car stolen in Valka races over the border into Valga'),
    priority: 2,
    weight: 0.4,
    regions: ['louna'],
    hours: 'night',
    places: ['border'],
    placeTags: ['latvia'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'caller', gender: 'any', age: [25, 70] },
      { role: 'suspect', gender: 'M', age: [18, 35], intoxicated: 0.4, record: 0.7, noLicense: 0.6 },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect', stolen: 1 }],
    summary: [
      T(
        '{place}. Läti politsei jälitas Valkas varastatud autot, mis sõitis Riia tänaval üle linnapiiri Valga poole ega peatunud. Läti patrull palub abi.',
        '{place}. Latvian police were chasing a car stolen in Valka when it crossed the town line on Riia street into Valga without stopping. The Latvian patrol is asking for help.',
      ),
      T(
        '{place}. Teataja nägi, kuidas auto kihutas Valka poolt üle linnapiiri, Läti politseiauto vilkuritega järel. Auto keeras Valgas kortermajade vahele.',
        '{place}. The caller saw a car race over the town line from the Valka side with a Latvian police car behind it, lights flashing. The car turned in between the blocks of flats in Valga.',
      ),
    ],
    callerLines: [
      T(
        'Siit kihutas just üks auto Valka poolt üle piiri ja Läti politsei oli tal sabas. Ta sõitis punase tule alt läbi!',
        'A car just raced over the border from the Valka side with the Latvian police on its tail. It went straight through a red light!',
      ),
      T(
        'Läti politseiauto jäi siia linnapiiri peale seisma ja mehed räägivad telefoniga. Auto keeras meie poolel kortermajade vahele.',
        'The Latvian police car has stopped here at the town line and the officers are on the phone. The car turned in between the blocks of flats on our side.',
      ),
      T('Ta sõitis ilma tuledeta ja väga kiiresti, peaaegu ajas ühe jalgratturi alla.', 'He was driving without lights and very fast, he nearly ran over a cyclist.'),
    ],
    details: [
      T(
        'Läti Riigipolitsei andmetel varastati auto tund aega tagasi Valkas, juht on noor mees ja võib olla joobes.',
        'According to the Latvian State Police the car was stolen in Valka an hour ago; the driver is a young man and may be drunk.',
      ),
      T(
        'Läti patrull jätkab otsinguid koos meie ekipaažiga ja on juhtimiskeskusega telefoni teel ühenduses. Läti politseinikud räägivad vene ja inglise keelt.',
        'The Latvian patrol is continuing the search with our crew and is in touch with our command centre by phone. The Latvian officers speak Russian and English.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal linnapiiril, Läti patrull on siin. Autot nähti viimati Valga kortermajade vahel. Kas paneme Tartu maantee väljasõidule tõkke või sõidame kohe otsima?',
            '{callsign}: on scene at the town line, the Latvian patrol is here. The car was last seen between the blocks of flats in Valga. Do we block the exit to the Tartu road or start searching straight away?',
          ),
        ],
        [
          opt(
            'block',
            T('Väljasõit kinni, Läti patrull otsib kaasa', 'Block the exit, the Latvian patrol searches too'),
            T(
              '{callsign}, sulgete Tartu maantee väljasõidu. Läti patrull otsib linnas koos teise ekipaažiga, kirjeldus on kõigil.',
              '{callsign}, block the exit to the Tartu road. The Latvian patrol searches the town with the second crew, everyone has the description.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'chase',
            T('Sõitke kohe otsima', 'Go and search straight away'),
            T('{callsign}, sõitke kohe kortermajade vahele otsima.', '{callsign}, drive in between the blocks of flats and search straight away.'),
            { success: 0.05, risk: 0.04 },
          ),
        ],
        'chase',
      ),
      pursuit(
        4,
        [
          T(
            '{callsign}: nägime autot Kuperjanovi tänaval, juht vajutas gaasi ja sõidab Tartu maantee poole. Jälitame!',
            '{callsign}: we have the car on Kuperjanovi street, the driver has floored it and is heading for the Tartu road. In pursuit!',
          ),
        ],
        0.5,
      ),
      qp(
        'suspect',
        12,
        [
          T(
            '{callsign}: Läti kolleegid andsid kahtlustatava andmed, ta võib olla Valga elanik. Nimi {name}, isikukood {idcode}. Kontrolli palun juhtimisõigust ja tagaotsitavust.',
            '{callsign}: the Latvian colleagues have given us the suspect’s details, he may live in Valga. Name {name}, ID code {idcode}. Please check his licence and whether he is wanted.',
          ),
        ],
        0.8,
      ),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.55, 1],
        4,
        T(
          'Auto peatati Valgas ja juht peeti kinni. Eestis alustati tema suhtes menetlust, autovarguse asjus tehakse koostööd Läti politseiga ja auto tagastatakse omanikule.',
          'The car was stopped in Valga and the driver was detained. Proceedings were opened against him in Estonia; the car theft is being handled together with the Latvian police and the car will be returned to its owner.',
        ),
        { arrests: 1, radio: T('{callsign}: auto peatatud, juht kinni, Läti kolleegid teavitatud.', '{callsign}: car stopped, driver detained, Latvian colleagues informed.') },
      ),
      out(
        'abandoned',
        'arrest',
        [0.35, 1],
        2,
        T(
          'Juht jättis auto Valgas garaažide vahele ja põgenes jalgsi, kuid ta peeti lähedal kinni. Autost võeti sõrmejäljed ja see tagastati Läti politsei kaudu omanikule.',
          'The driver left the car between garages in Valga and ran off on foot, but he was caught nearby. Fingerprints were taken from the car and it was returned to its owner through the Latvian police.',
        ),
        { arrests: 1, radio: T('{callsign}: juht jättis auto maha, peeti jalgsi kinni.', '{callsign}: driver ditched the car, caught on foot.') },
      ),
      out(
        'crash',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Juht kaotas Valgas kontrolli auto üle ja sõitis vastu laternaposti. Ta toimetati vigastustega haiglasse ja peeti seal kinni, alustati kriminaalmenetlust.',
          'The driver lost control in Valga and hit a lamp post. He was taken to hospital with injuries and detained there; criminal proceedings were opened.',
        ),
        { injuries: 1, arrests: 1, radio: T('{callsign}: auto vastu posti, juht vigastatud, haiglasse.', '{callsign}: car hit a post, driver injured, to hospital.') },
      ),
      out(
        'back',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Auto keeras Valgas otsa ümber ja sõitis mööda kõrvaltänavaid tagasi Läti poolele. Info edastati Läti politseile, otsingud jätkuvad seal.',
          'The car turned round in Valga and went back to the Latvian side along the side streets. The information was passed to the Latvian police and the search continues there.',
        ),
        { radio: T('{callsign}: auto pääses tagasi Läti poolele, info edastatud.', '{callsign}: car got back to the Latvian side, information passed on.') },
      ),
    ],
    expiresMin: 60,
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T('Siit kihutas just üks auto Valka poolt üle piiri, Läti politsei oli tal sabas!', 'A car just raced over the border from the Valka side, with the Latvian police on its tail!'),
        T(
          'Riia tänaval sõitis auto ilma tuledeta üle linnapiiri ja keeras kortermajade vahele. Läti politseiauto on siin.',
          'On Riia street a car without lights crossed the town line and turned in between the blocks of flats. The Latvian police car is here.',
        ),
      ],
      answers: {
        vehicle: [T('{car}, numbrit ma ei näinud.', '{car}, I did not see the number.')],
        direction: [T('Ta keeras Kuperjanovi tänava poole, kortermajade vahele.', 'He turned towards Kuperjanovi street, in between the blocks of flats.')],
        injured: [T('Keegi vist viga ei saanud, aga üks jalgrattur kukkus ehmatusest.', 'I do not think anyone was hurt, but a cyclist fell off with the fright.')],
      },
      answersRu: {
        vehicle: ['{car}, номер я не {разглядел|разглядела}.'],
        direction: ['Он свернул во дворы, в сторону улицы Kuperjanovi.'],
        injured: ['Вроде никто не пострадал, но один велосипедист с испугу упал.'],
      },
      openingRu: [
        'Тут только что со стороны Валки через границу пронеслась машина, а за ней латвийская полиция!',
        'На улице Riia машина без фар проехала через границу города и свернула во дворы. Латвийская полицейская машина здесь.',
      ],
    },
    tags: ['vehicle_flee', 'stolen_car'],
  },

  // 4. Luhamaa: a lorry driver has been drinking for days in the border queue and has started his engine.
  {
    id: 'traffic_luhamaa_joobes_veokijuht',
    category: 'traffic',
    code: 'JJ',
    title: T('Joobes veokijuht piiripunkti järjekorras', 'Drunk lorry driver in the border queue'),
    priority: 2,
    weight: 1,
    regions: ['louna'],
    places: ['border'],
    placeTags: ['trucks'],
    units: { need: [u('patrol')], ideal: [u('border'), u('patrol')] },
    onScene: [25, 60],
    persons: [
      { role: 'caller', gender: 'any', age: [30, 60] },
      { role: 'suspect', gender: 'M', age: [30, 60], intoxicated: 1, record: 0.3 },
    ],
    vehicles: [{ role: 'suspect', kind: 'truck', driverRole: 'suspect' }],
    summary: [
      T(
        '{address}. Teataja sõnul on veokite ootealal seisva veoki juht eilsest saati viina joonud. Nüüd käivitas ta mootori ja tahab järjekorras edasi sõita.',
        '{address}. The caller says the driver of a lorry in the waiting area has been drinking vodka since yesterday. He has now started his engine and wants to move up the queue.',
      ),
      T(
        '{address}. Veokijuhid teatavad, et üks juht on tugevas joobes, tülitseb teistega ja ähvardab järjekorrast välja sõita. Mootor töötab.',
        '{address}. Lorry drivers report that one driver is heavily drunk, quarrelling with the others and threatening to pull out of the queue. His engine is running.',
      ),
    ],
    callerLines: [
      T(
        'Minu ees seisab veok, mille juht on mitu päeva järjekorras olnud ja joob. Nüüd käivitas ta mootori ega suuda sirgelt seista.',
        'There is a lorry in front of me whose driver has been in the queue for days, drinking. Now he has started the engine and he cannot stand up straight.',
      ),
      T(
        'Me võtsime tal võtmed ära, aga tal oli varuvõti. Ta sõimab meid ja ronis kabiini tagasi.',
        'We took his keys off him, but he had a spare. He is swearing at us and has climbed back into the cab.',
      ),
      T(
        'Kui järjekord liikuma hakkab, sõidab ta kellelegi otsa. Ta juba põrkas korra vastu eesolevat haagist.',
        'When the queue starts moving he will run into someone. He has already bumped into the trailer in front once.',
      ),
    ],
    details: [
      T(
        'Teiste juhtide sõnul liigutas mees veokit ootealal juba korra ja põrkas vastu eesolevat haagist. Ta võib järjekorrast välja sõita ja maanteele keerata.',
        'The other drivers say the man has already moved his lorry once in the waiting area and hit the trailer in front. He may pull out of the queue and turn onto the main road.',
      ),
      T('Teiste juhtide sõnul jõi mees ka eile õhtul ja magas kabiinis, mootor töötamas.', 'The other drivers say he was drinking last night too and slept in his cab with the engine running.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal, veoki mootor töötab ja juht istub kabiinis. Uks on lukus ja ta ei taha välja tulla. Kuidas toimime?',
            '{callsign}: on scene, the lorry’s engine is running and the driver is sitting in the cab. The door is locked and he will not come out. How do we proceed?',
          ),
        ],
        [
          opt(
            'out',
            T('Mootor seisma, juht välja, alkomeeter', 'Engine off, driver out, breathalyser'),
            T(
              '{callsign}, rääkige ta kabiinist välja, mootor seisma ja võtmed ära. Seejärel joobekontroll.',
              '{callsign}, talk him out of the cab, engine off and keys taken. Then a breath test.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'watch',
            T('Jälgige, kas ta sõidab', 'Watch whether he drives'),
            T('{callsign}, jälgige veokit ja sekkuge, kui ta hakkab sõitma.', '{callsign}, watch the lorry and step in if he starts to drive.'),
            { success: -0.1, risk: 0.05 },
          ),
        ],
        'watch',
      ),
      qp('suspect', 4, R_DRIVER),
    ],
    outcomes: [
      out(
        'arrested',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Juht toodi kabiinist välja ja tema alkoholijoove ületas kriminaalse piiri. Ta peeti kinni, alustati kriminaalmenetlust KarS § 424 järgi ja veok jäi ootealale.',
          'The driver was brought out of the cab and his alcohol level was over the criminal limit. He was detained, criminal proceedings were opened under KarS § 424 and the lorry stayed in the waiting area.',
        ),
        { arrests: 1, radio: T('{callsign}: juht kriminaalses joobes, kinni peetud, veok seisab.', '{callsign}: driver over the criminal limit, detained, lorry parked up.') },
      ),
      out(
        'ditch',
        'report',
        [0, 0.5],
        2,
        T(
          'Enne kui politsei ta kabiinist kätte sai, sõitis juht veokiga ootealalt välja ja jäi seisma alles maantee ääres kraavis. Keegi viga ei saanud, juht peeti kinni ja alustati kriminaalmenetlust.',
          'Before the police could get him out of the cab, the driver drove the lorry out of the waiting area and only stopped in the ditch beside the main road. Nobody was hurt; the driver was detained and criminal proceedings were opened.',
        ),
        { arrests: 1, radio: T('{callsign}: veok sõitis kraavi, juht kinni, vigastatuid pole.', '{callsign}: lorry went into the ditch, driver detained, nobody hurt.') },
      ),
      out(
        'collision',
        'hospital',
        [0, 0.3],
        1,
        T(
          'Enne kui politsei ta kabiinist kätte sai, põrkas liikuma hakanud veok ootealal kokku teise veokiga, mille juht sai vigastada ja toimetati haiglasse. Joobes juht peeti kinni.',
          'Before the police could get him out of the cab, his lorry moved off and hit another lorry in the waiting area; that driver was injured and taken to hospital. The drunk driver was detained.',
        ),
        { injuries: 1, arrests: 1, radio: T('{callsign}: veokid põrkasid, üks juht haiglasse, joobes juht kinni.', '{callsign}: lorries collided, one driver to hospital, drunk driver detained.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.4,
      toPriority: 1,
      text: T(
        'Teataja: joobes juht põrkas uuesti vastu eesolevat haagist ja üritab nüüd ootealalt maanteele välja keerata!',
        'Caller: the drunk driver has hit the trailer in front again and is now trying to turn out of the waiting area onto the main road!',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.3,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Siin piiripunkti järjekorras on üks veokijuht täiesti purjus ja käivitas mootori! Ta sõidab kellelegi otsa!',
          'There is a lorry driver in the border queue here who is completely drunk and has started his engine! He is going to hit someone!',
        ),
        T(
          'Me seisame Luhamaal veokite järjekorras, üks juht on eilsest saati joonud ja ronis nüüd rooli.',
          'We are in the lorry queue at Luhamaa, one driver has been drinking since yesterday and has now got behind the wheel.',
        ),
      ],
      answers: {
        intoxicated: [T('Ta on täiesti purjus, ei seisa jalgadel. Kabiinis on tühjad pudelid.', 'He is completely drunk, he cannot stand. There are empty bottles in the cab.')],
        vehicle: [T('{car} poolhaagisega, seisab järjekorras otse minu ees.', '{car} with a semi-trailer, it is in the queue right in front of me.')],
        safe: [T('Ma olen oma kabiinis, aga tema veok on otse minu ees.', 'I am in my own cab, but his lorry is right in front of me.')],
      },
      answersRu: {
        intoxicated: ['Он в стельку пьяный, на ногах не стоит. В кабине пустые бутылки.'],
        vehicle: ['{car} с полуприцепом, стоит в очереди прямо передо мной.'],
        safe: ['Я в своей кабине, но его фура стоит прямо передо мной.'],
      },
      openingRu: [
        'Тут в очереди на границе один дальнобойщик совсем пьяный и завёл мотор! Он же в кого-нибудь въедет!',
        'Мы стоим в очереди фур на Лухамаа, один водитель со вчерашнего дня пьёт, а теперь сел за руль.',
      ],
    },
    tags: ['drunk_driving', 'truck', 'alcohol'],
  },

  // 5. Peipsi shore: onion thieves strip an Old Believer grandmother's field in the evening.
  {
    id: 'property_peipsi_sibulavargad',
    category: 'property',
    code: 'VG',
    title: T('Sibulavargad Peipsi ääres', 'Onion thieves on the Peipsi shore'),
    priority: 3,
    weight: 1.8,
    regions: ['louna'],
    months: [7, 8, 9],
    hours: [0.6, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.6, 1, 1.5, 2, 2.4, 2.4, 2, 1.2],
    places: ['village', 'ruralroad'],
    placeTags: ['onions'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('community')] },
    onScene: [25, 60],
    persons: [
      { role: 'caller', gender: 'F', age: [60, 85] },
      { role: 'suspect', gender: 'M', age: [20, 50], record: 0.6, intoxicated: 0.3 },
      { role: 'suspect', gender: 'M', age: [20, 50], record: 0.4 },
    ],
    vehicles: [{ role: 'suspect', kind: 'van', driverRole: 'suspect', noInsurance: 0.2 }],
    summary: [
      T(
        '{address}. Teataja sõnul tõmbavad kaks meest tema sibulapõllult sibulaid kottidesse ja tassivad neid tee ääres seisvasse kaubikusse.',
        '{address}. The caller says two men are pulling onions from her field into sacks and carrying them to a van parked by the road.',
      ),
      T(
        '{address}. Eakas perenaine teatab, et kaks võõrast meest kisuvad tema põllult sibulaid ja kannavad kotid tee ääres seisvasse kaubikusse. Naabrimehed tahavad vargad ise kinni võtta.',
        '{address}. An elderly woman reports two strangers pulling onions from her field and carrying the sacks to a van by the road. The neighbours want to catch the thieves themselves.',
      ),
    ],
    callerLines: [
      T(
        'Minu põllult varastatakse sibulaid! Kaks meest tõmbavad neid otse peenrast kottidesse.',
        'Someone is stealing onions from my field! Two men are pulling them straight out of the beds into sacks.',
      ),
      T(
        'Kaubik seisab tee ääres ja nad on juba mitu kotti ära viinud. See on minu terve aasta töö.',
        'There is a van by the road and they have already taken several sacks. That is my whole year’s work.',
      ),
      T(
        'Naabrimees tahab minna neid ise kinni võtma, ma ütlesin talle, et oota politseid.',
        'The man next door wants to go and catch them himself, I told him to wait for the police.',
      ),
    ],
    callerLinesRu: [
      'У меня с огорода лук воруют! Двое мужиков прямо с грядок дёргают и в мешки.',
      'Машина у дороги стоит, они уже несколько мешков унесли. Это ж моя работа за целый год.',
      'Сосед хочет сам пойти их ловить, а я ему говорю: жди полицию.',
    ],
    details: [
      T(
        'Teataja sõnul on naabrimees koos pojaga teel põllule, et vargad ise kinni võtta. Mehed on vihased.',
        'The caller says the neighbour and his son are on their way to the field to catch the thieves themselves. The men are angry.',
      ),
      T(
        'Politsei andmetel on Peipsiääres sel suvel teatatud mitmest sibulavargusest, kokkuostjad maksavad sibulapatside eest head hinda.',
        'Police records show several onion thefts along the Peipsi shore this summer; buyers pay well for onion braids.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, tee ääres seisab kaubik, pooleldi sibulakotte täis. Põllul on kaks võõrast meest ja külaelanikud.',
          '{callsign}: on scene, a van by the road, half full of onion sacks. Two strangers and some villagers in the field.',
        ),
      ]),
      qv(2, [
        T(
          '{callsign}: kaubik {plate}, sees on paarkümmend kotti sibulaid. Kontrolli palun omanikku ja kindlustust.',
          '{callsign}: van {plate}, about twenty sacks of onions inside. Please check the owner and the insurance.',
        ),
      ]),
      choice(
        5,
        [
          T(
            '{callsign}: mehed väidavad, et ostsid sibulad ühelt külamehelt, aga ei oska öelda, kellelt. Perenaine näitab tühjaks kistud peenraid. Kuidas toimime?',
            '{callsign}: the men say they bought the onions from a man in the village but cannot say who. The owner is showing us the stripped beds. How do we proceed?',
          ),
        ],
        [
          opt(
            'seize',
            T('Kahtlustatavad kinni, sibulad tõendiks', 'Detain the suspects, onions as evidence'),
            T(
              '{callsign}, mehed kinni kahtlustatavatena, kaubik koos sibulatega jääb tõendiks. Pildistage peenrad ja jäljed.',
              '{callsign}, detain the men as suspects, the van and the onions are kept as evidence. Photograph the beds and the tracks.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'return',
            T('Sibulad tagasi, mehed lahkuvad', 'Onions back, the men leave'),
            T(
              '{callsign}, laske sibulad perenaisele tagasi tõsta, pange meeste andmed kirja ja laske neil minna.',
              '{callsign}, have the onions put back for the owner, take the men’s details and let them go.',
            ),
            { success: -0.05, time: 10, trust: -2, outcome: 'released' },
          ),
        ],
        'return',
      ),
      qp('suspect', 8, R_SUSPECT, 0.7),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Kaks meest peeti kinni. Kaubikust leiti üle 300 kilo sibulaid ka teistest Peipsiääre küladest, alustati kriminaalmenetlust KarS § 199 järgi ja sibulad tagastati omanikele.',
          'Two men were detained. The van held over 300 kg of onions, some from other villages along the Peipsi shore; criminal proceedings were opened under KarS § 199 and the onions were returned to their owners.',
        ),
        { arrests: 2, radio: T('{callsign}: kaks sibulavarast kinni, saak tagastatud omanikele.', '{callsign}: two onion thieves detained, the haul returned to the owners.') },
      ),
      out(
        'identified',
        'report',
        [0.4, 1],
        1,
        T(
          'Mehed tuvastati ja vabastati, alustati menetlust varguse kohta. Sibulad pildistati ja tagastati perenaisele.',
          'The men were identified and released, and proceedings for theft were opened. The onions were photographed and returned to the owner.',
        ),
        { radio: T('{callsign}: mehed tuvastatud, sibulad tagasi, menetlus alustatud.', '{callsign}: men identified, onions returned, case opened.') },
      ),
      out(
        'released',
        'report',
        [0, 0.05],
        1,
        T(
          'Mehed lasti pärast andmete kirjapanekut minema ja sibulad tõsteti perenaisele tagasi. Samal õhtul teatasid sibulate kadumisest ka naaberkülad, menetlust alustati tagantjärele.',
          'The men were let go after their details were taken and the onions were put back for the owner. The same evening neighbouring villages reported onions missing too, and proceedings were opened after the fact.',
        ),
        { radio: T('{callsign}: andmed kirjas, mehed lasti minema, sibulad tagasi.', '{callsign}: details taken, men let go, onions returned.') },
      ),
      out(
        'fight',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Naabrimehed jõudsid enne politseid kohale ja põllul läks kakluseks. Üks vargadest sai peavigastuse ja toimetati haiglasse, alustati menetlust nii varguse kui ka kehalise väärkohtlemise kohta.',
          'The neighbours got there before the police and it came to a fight in the field. One of the thieves suffered a head injury and was taken to hospital; proceedings were opened for both the theft and the assault.',
        ),
        { injuries: 1, radio: T('{callsign}: põllul kaklus, üks vigastatud haiglasse, menetlus alustatud.', '{callsign}: fight in the field, one injured to hospital, case opened.') },
      ),
      out(
        'gone',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mehed hüppasid kaubikusse ja sõitsid koos poole saagiga minema. Kaubiku number on teada, perenaiselt võeti seletus ja menetlus jätkub.',
          'The men jumped into the van and drove off with half the haul. The van’s number is known, a statement was taken from the owner and the case continues.',
        ),
        { radio: T('{callsign}: vargad sõitsid minema, number teada, menetlus jätkub.', '{callsign}: the thieves drove off, number known, case continues.') },
      ),
    ],
    escalation: {
      afterMin: 25,
      chance: 0.4,
      toPriority: 2,
      text: T(
        'Teataja: naabrimehed läksid vargaid ise kinni võtma, põllul käib karjumine ja tõuklemine!',
        'Caller: the neighbours have gone to catch the thieves themselves, there is shouting and shoving in the field!',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.35,
    call: {
      mood: 'elderly',
      opening: [
        T(
          'Minu põllult varastatakse sibulaid! Kaks meest täidavad kotte ja kaubik seisab tee ääres!',
          'Someone is stealing onions from my field! Two men are filling sacks and the van is waiting by the road!',
        ),
        T('Tulge kiiresti, võõrad mehed viivad meie sibulad ära. Terve aasta töö!', 'Come quickly, strange men are taking our onions away. A whole year’s work!'),
      ],
      answers: {
        count: [T('Neid on kaks meest, rohkem ma ei näe.', 'There are two men, I cannot see any more.')],
        vehicle: [T('{car}, seisab tee ääres, tagauksed lahti.', '{car}, parked by the road with the back doors open.')],
        weapons: [T('Relva ei näe, aga ühel on labidas käes.', 'I cannot see a weapon, but one of them has a spade.')],
        when: [T('Nad tulid umbes pool tundi tagasi.', 'They came about half an hour ago.')],
        direction: [T('Nad on ikka veel põllul, kaubik seisab tee ääres.', 'They are still in the field, the van is by the road.')],
      },
      answersRu: {
        count: ['Их двое, больше я никого не вижу.'],
        vehicle: ['{car}, стоит у дороги, задние двери открыты.'],
        weapons: ['Оружия не вижу, но у одного лопата в руках.'],
        when: ['Приехали где-то полчаса назад.'],
        direction: ['Они ещё на поле, а машина у дороги стоит.'],
      },
      openingRu: [
        'У меня с поля лук воруют! Двое мужиков мешки набивают, а машина у дороги стоит!',
        'Приезжайте скорее, чужие мужики наш лук увозят. Работа за целый год!',
      ],
    },
    tags: ['theft', 'rural'],
  },

  // 6. Otepää: an older skier training for the Tartu Maraton has not come back from the Tehvandi tracks by dark.
  {
    id: 'missing_tehvandi_suusataja',
    category: 'missing',
    code: 'OTS',
    title: T('Suusataja ei tulnud Tehvandi radadelt tagasi', 'Skier has not come back from the Tehvandi tracks'),
    priority: 2,
    weight: 1,
    regions: ['louna'],
    months: [12, 1, 2, 3],
    hours: [0.6, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2.5, 2.5, 2, 1.2],
    places: ['stadium'],
    placeTags: ['winter'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('aux')] },
    onScene: [40, 100],
    persons: [
      { role: 'missing', gender: 'M', age: [55, 78] },
      { role: 'caller', gender: 'F', age: [50, 78], relation: 'partner' },
    ],
    summary: [
      T(
        '{place}, {address}. Teataja abikaasa läks pärastlõunal Tartu Maratoni rajale suusatama ega ole pimeduse saabudes tagasi. Telefon ei vasta.',
        '{place}, {address}. The caller’s husband went skiing on the Tartu Maraton track in the afternoon and has not come back now that it is dark. His phone is not answering.',
      ),
      T(
        '{place}, {address}. Eakas suusataja ei ole kokkulepitud ajaks parklasse tagasi jõudnud. Tema auto seisab Tehvandi parklas, abikaasa ootab selle juures.',
        '{place}, {address}. An elderly skier has not come back to the car park by the agreed time. His car is still in the Tehvandi car park and his wife is waiting beside it.',
      ),
    ],
    callerLines: [
      T(
        'Mu mees läks kella kahe paiku suusatama ja lubas kuueks tagasi olla. Nüüd on pime ja ta ei vasta telefonile.',
        'My husband went skiing at about two and promised to be back by six. Now it is dark and he is not answering his phone.',
      ),
      T(
        'Ta valmistub Tartu Maratoniks ja tahtis minna pikale ringile. Tal on südamega probleeme olnud.',
        'He is training for the Tartu Maraton and wanted to do the long loop. He has had heart trouble.',
      ),
      T('Tema auto seisab ikka parklas, ma olen siin selle kõrval. Rajal on täiesti pime.', 'His car is still in the car park, I am standing next to it. It is pitch dark on the track.'),
    ],
    details: [
      T(
        'Abikaasa sõnul on mehel südamehaigus ja ta ei võtnud kaasa ravimeid ega lisariideid. Külmas ja pimedas metsas võib ta kiiresti jõuetuks jääda.',
        'The wife says the man has a heart condition and took neither his medicine nor extra clothes. In the cold and dark forest he may quickly run out of strength.',
      ),
      T(
        'Operaatori andmetel oli mehe telefon viimati võrgus maratonirajal umbes kümne kilomeetri kaugusel staadionist, seal on rada valgustamata.',
        'According to the operator the man’s phone was last on the network on the marathon track about ten kilometres from the stadium, where the track is unlit.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal Tehvandil. Raja hooldaja pakub mootorsaani, aga rada on kümneid kilomeetreid pikk. Kas sõidame mootorsaaniga maratonirajale või ootame staadionil, ehk tuleb ta ise?',
            '{callsign}: on scene at Tehvandi. The track groomer is offering a snowmobile, but the track is tens of kilometres long. Do we go out on the marathon track by snowmobile or wait at the stadium in case he comes back himself?',
          ),
        ],
        [
          opt(
            'snowmobile',
            T('Mootorsaaniga rajale, teine ekipaaž teeületustele', 'Snowmobile on the track, second crew to the road crossings'),
            T(
              '{callsign}, üks ametnik läheb koos hooldajaga mootorsaaniga rajale. Teine ekipaaž kontrollib kohti, kus rada ületab teid.',
              '{callsign}, one officer goes out on the track by snowmobile with the track groomer. The second crew checks the places where the track crosses roads.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'wait',
            T('Oodake staadionil', 'Wait at the stadium'),
            T('{callsign}, oodake staadionil ja helistage talle edasi.', '{callsign}, wait at the stadium and keep calling him.'),
            { success: -0.1 },
          ),
        ],
        'wait',
      ),
      search(
        3,
        4,
        [
          T(
            '{callsign}: telefon ikka ei vasta, alustame otsinguid maratonirajal ja valgustatud ringidel. Hüüame ja vaatame lumes jälgi.',
            '{callsign}: his phone is still not answering, starting the search on the marathon track and the lit loops. Calling out and looking for tracks in the snow.',
          ),
        ],
      ),
      agency(
        'paaste',
        6,
        [
          T(
            '{callsign}: palun Päästeamet ja vabatahtlikud otsingule, rada on pikk ja metsas on sügav lumi.',
            '{callsign}: Rescue Board and volunteers for the search please, the track is long and the snow in the forest is deep.',
          ),
        ],
        { timeoutMin: 8 },
      ),
      agency(
        'kiirabi',
        15,
        [
          T(
            '{callsign}: palun kiirabi Tehvandi parklasse valmisolekusse. Mehel on haige süda ja ta võib olla alajahtunud.',
            '{callsign}: ambulance on standby at the Tehvandi car park please. The man has a bad heart and may be hypothermic.',
          ),
        ],
        { chance: 0.5, timeoutMin: 6 },
      ),
    ],
    outcomes: [
      out(
        'found',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Mees leiti maratonirajalt, kus tal oli suusk murdunud ja ta kõndis aeglaselt tagasi. Ta oli läbi külmunud, kuid muidu terve ja anti üle abikaasale.',
          'The man was found on the marathon track where a ski had broken and he was walking back slowly. He was chilled through but otherwise fine and was handed over to his wife.',
        ),
        { radio: T('{callsign}: suusataja leitud, katkine suusk, kõik korras, lõpetame.', '{callsign}: skier found, broken ski, all fine, closing.') },
      ),
      out(
        'hypothermia',
        'hospital',
        [0.3, 0.8],
        2,
        T(
          'Mees leiti raja äärest lumest, ta oli kukkunud ega jõudnud püsti. Kiirabi toimetas ta alajahtumisega haiglasse.',
          'The man was found in the snow beside the track; he had fallen and could not get up. The ambulance took him to hospital with hypothermia.',
        ),
        { injuries: 1, radio: T('{callsign}: mees leitud lumest, alajahtunud, kiirabi viib haiglasse.', '{callsign}: man found in the snow, hypothermic, ambulance taking him.') },
      ),
      out(
        'night',
        'referred',
        [0, 0.35],
        2,
        T(
          'Meest esimeste otsingutundide jooksul ei leitud. Otsingud jätkuvad öö läbi Päästeameti ja vabatahtlikega, tema telefoni asukoht tuvastatakse uuesti.',
          'The man was not found in the first hours of the search. The search goes on through the night with the Rescue Board and volunteers, and his phone is to be located again.',
        ),
        { radio: T('{callsign}: meest ei leitud, otsingud jätkuvad öö läbi.', '{callsign}: man not found, the search goes on through the night.') },
      ),
      out(
        'tragedy',
        'tragedy',
        [0, 0.12],
        1,
        T(
          'Mees leiti raja äärest elutuna. Esialgsetel andmetel tabas teda südamerike, kuriteo tunnuseid ei tuvastatud.',
          'The man was found dead beside the track. Early indications are a heart attack; there were no signs of a crime.',
        ),
        { radio: T('{callsign}: mees leiti raja äärest elutuna.', '{callsign}: man found dead beside the track.') },
      ),
    ],
    escalation: {
      afterMin: 25,
      chance: 0.35,
      toPriority: 1,
      text: T(
        'Teataja: mees helistas korraks, tal murdus suusk, ta ei tea, kui kaugel ta on, ja tal on väga külm. Siis kõne katkes.',
        'Caller: my husband rang for a moment, a ski has broken, he does not know how far out he is and he is very cold. Then the call cut off.',
      ),
    },
    expiresMin: 120,
    interactiveChance: 0.3,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Mu mees läks Tehvandilt suusatama ja ei ole tagasi tulnud. On juba pime ja ta ei vasta telefonile.',
          'My husband went skiing from Tehvandi and has not come back. It is already dark and he is not answering his phone.',
        ),
        T(
          'Mu abikaasa pidi kuueks rajalt tagasi olema, aga teda pole ikka veel. Tal on haige süda.',
          'My husband was supposed to be back off the track by six, but there is still no sign of him. He has a bad heart.',
        ),
      ],
      answers: {
        suspect: [T('Tal on seljas punane suusajope ja peas valge müts.', 'He is wearing a red ski jacket and a white hat.')],
        when: [T('Ta läks rajale kella kahe paiku päeval.', 'He went out on the track at about two in the afternoon.')],
        injured: [
          T('Ma ei tea. Tal on olnud südamega probleeme ja ravimid jäid autosse.', 'I do not know. He has had heart trouble and his medicine was left in the car.'),
        ],
        vehicle: [T('Tema auto seisab siin parklas, ta läks suuskadega.', 'His car is here in the car park, he went off on skis.')],
      },
      answersRu: {
        suspect: ['На нём красная лыжная куртка и белая шапка.'],
        when: ['Он ушёл на трассу около двух часов дня.'],
        injured: ['Не знаю. У него были проблемы с сердцем, а лекарства остались в машине.'],
        vehicle: ['Его машина тут, на стоянке, а он ушёл на лыжах.'],
      },
      openingRu: [
        'Мой муж пошёл кататься на лыжах с Техванди и не вернулся. Уже темно, а он не отвечает на телефон.',
        'Мой муж должен был вернуться с трассы к шести, а его всё нет. У него больное сердце.',
      ],
    },
    tags: ['winter', 'search'],
  },

  // 7. Viljandi: on a summer night a drunk man falls from the castle ruins into the moat of the castle hills.
  {
    id: 'assist_lossimagede_vallikraavi_kukkunud',
    category: 'assist',
    code: 'ABI',
    title: T('Joobes mees kukkus lossimägedel vallikraavi', 'Drunk man fell into the moat on the Viljandi castle hills'),
    priority: 2,
    weight: 1,
    regions: ['louna'],
    months: [6, 7, 8],
    hours: LATE_NIGHT,
    weekendBoost: 1.6,
    places: ['park'],
    placeTags: ['lossimaed'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'caller', gender: 'any', age: [20, 40], relation: 'friend' },
      { role: 'victim', gender: 'M', age: [20, 40], intoxicated: 0.8 },
      { role: 'witness', gender: 'any', age: [18, 50] },
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Kõrguselt kukkunud inimene, võimalik seljavigastus', 'A person has fallen from a height, possible back injury') }],
    summary: [
      T(
        '{address}. Viljandi lossimägedel kukkus joobes mees öösel lossivaremete müürilt järsust nõlvast alla vallikraavi. Ta on teadvusel, kuid ei saa liikuda.',
        '{address}. On the Viljandi castle hills a drunk man fell from the castle ruin wall in the night, down the steep slope into the moat. He is conscious but cannot move.',
      ),
      T(
        '{address}. Teataja sõnul libises tema sõber pimedas Viljandi lossimägede vallikraavi nõlvast alla ja karjub valust. Kraavi põhja on raske pääseda, ümber koguneb rahvast.',
        '{address}. The caller says a friend slipped down the slope of the moat on the Viljandi castle hills in the dark and is screaming in pain. It is hard to get down to the bottom and people are gathering.',
      ),
    ],
    callerLines: [
      T(
        'Mu sõber ronis varemete müürile ja kukkus alla kraavi! Ta on seal all ja ütleb, et selg valutab.',
        'My friend climbed up on the ruin wall and fell down into the moat! He is down there and says his back hurts.',
      ),
      T(
        'Nõlv on nii järsk, et me ei saa talle ligi. Pimedas ei näe midagi, ainult telefonide tuled.',
        'The slope is so steep we cannot get to him. You cannot see anything in the dark, only phone lights.',
      ),
      T(
        'Ümber on palju rahvast ja mõned tahavad teda ise üles tassida. Ma ütlesin, et ärge liigutage teda.',
        'There are lots of people around and some want to carry him up themselves. I told them not to move him.',
      ),
    ],
    details: [
      T(
        'Pealtnägijate sõnul ronivad mitu joobes noort nõlvast alla, et kannatanut ise üles tuua. Kannatanu kaebab seljavalu.',
        'Witnesses say several drunk young people are climbing down the slope to bring the man up themselves. He is complaining of back pain.',
      ),
      T(
        'Kiirabiauto ei pääse lossimägedele lähemale kui Lossi tänavale, nõlvad on järsud ja valgustamata.',
        'The ambulance cannot get any closer to the castle hills than Lossi street, and the slopes are steep and unlit.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, kannatanu on vallikraavi põhjas umbes kümne meetri sügavusel. Rahvas tungleb nõlva serval, viime inimesed eemale.',
          '{callsign}: on scene, the man is at the bottom of the moat about ten metres down. People are crowding the edge of the slope, we are moving them back.',
        ),
      ]),
      agency(
        'paaste',
        1,
        [
          T(
            '{callsign}: palun Päästeamet köietehnikaga lossimägedele, kannatanu on järsu nõlva all ja seljavigastuse kahtlusega.',
            '{callsign}: Rescue Board with rope gear to the castle hills please, the casualty is at the foot of a steep slope with a suspected back injury.',
          ),
        ],
        { timeoutMin: 6 },
      ),
      choice(
        3,
        [
          T(
            '{callsign}: kaks joobes noormeest ronivad pimedas nõlvast alla kannatanu juurde, rahvas ergutab neid. Kas toome nad tagasi ja sulgeme nõlva serva?',
            '{callsign}: two drunk young men are climbing down the slope in the dark towards the casualty and the crowd is cheering them on. Do we bring them back and close off the edge?',
          ),
        ],
        [
          opt(
            'close',
            T('Tooge nad tagasi, serv kinni', 'Bring them back, close the edge'),
            T(
              '{callsign}, tooge noormehed nõlvalt tagasi ja hoidke rahvas servast eemal. Kannatanut ei liigutata, Päästeamet tuleb köietehnikaga.',
              '{callsign}, bring the young men back up and keep the crowd away from the edge. Nobody moves the casualty, the Rescue Board is coming with rope gear.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'let',
            T('Las aitavad, jälgige ülevalt', 'Let them help, watch from above'),
            T('{callsign}, las nad lähevad talle appi, teie jälgige ülevalt.', '{callsign}, let them go down to help him, you watch from above.'),
            { success: -0.05, risk: 0.05 },
          ),
        ],
        'let',
      ),
    ],
    outcomes: [
      out(
        'rescued',
        'hospital',
        [0.5, 1],
        4,
        T(
          'Mees toodi vallikraavist üles ja kiirabi toimetas ta Viljandi haiglasse. Tal oli jalaluumurd ja peapõrutus, seljavigastust ei leitud.',
          'The man was brought up out of the moat and the ambulance took him to Viljandi hospital. He had a broken leg and concussion; no back injury was found.',
        ),
        { injuries: 1, radio: T('{callsign}: mees toodi üles, jalaluumurd, kiirabi viis haiglasse.', '{callsign}: he was brought up, broken leg, ambulance took him.') },
      ),
      out(
        'ribs',
        'hospital',
        [0.4, 1],
        2,
        T(
          'Mehel olid roidemurrud ja peapõrutus. Ta toodi nõlvast üles ja kiirabi viis ta haiglasse, lossimägede haldajat teavitati ohtlikust kohast.',
          'The man had broken ribs and concussion. He was brought up the slope and the ambulance took him to hospital; the castle hills’ managers were told about the dangerous spot.',
        ),
        { injuries: 1, radio: T('{callsign}: roidemurrud, mees üleval, kiirabi viis haiglasse.', '{callsign}: broken ribs, he is up, ambulance took him.') },
      ),
      out(
        'worse',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Meest tassiti enne päästjate saabumist nõlvast üles ja kandjad kukkusid teel. Ta toimetati raske seljavigastusega haiglasse.',
          'The man was carried up the slope before the rescuers arrived and the people carrying him fell on the way. He was taken to hospital with a serious back injury.',
        ),
        { injuries: 1, radio: T('{callsign}: meest tassiti ise üles, raske seljavigastus, haiglasse.', '{callsign}: he was carried up by hand, serious back injury, to hospital.') },
      ),
      out(
        'second',
        'hospital',
        [0, 0.3],
        1,
        T(
          'Kannatanu järele roninud joobes mees kukkus samuti vallikraavi. Mõlemad toimetati haiglasse, nende väljatoomine võttis päästjatel üle tunni.',
          'A drunk man who climbed down after him also fell into the moat. Both were taken to hospital; getting them out took the rescuers over an hour.',
        ),
        { injuries: 2, radio: T('{callsign}: teine mees kukkus järele, mõlemad haiglasse.', '{callsign}: a second man fell in after him, both to hospital.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.4,
      toPriority: 1,
      text: T('Teataja: sõber ei vasta enam korralikult, ta jääb uniseks ja oksendab!', 'Caller: my friend is barely answering any more, he keeps drifting off and is vomiting!'),
    },
    expiresMin: 60,
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T('Mu sõber kukkus lossimägedel müürilt alla vallikraavi! Ta ei saa liikuda!', 'My friend fell off the wall on the castle hills into the moat! He cannot move!'),
        T(
          'Siin lossimägedel kukkus mu sõber järsust nõlvast alla, ta karjub valust ja me ei saa talle ligi!',
          'Here on the castle hills my friend has fallen down a steep slope, he is screaming in pain and we cannot get to him!',
        ),
      ],
      answers: {
        injured: [T('Ta ütleb, et selg valutab ja jalg on kuidagi viltu.', 'He says his back hurts and his leg is at a funny angle.')],
        intoxicated: [T('Jah, me oleme terve õhtu väljas olnud, ta on üsna purjus.', 'Yes, we have been out all evening, he is quite drunk.')],
        count: [T('Kraavi serval on paarkümmend inimest, mõned tahavad alla ronida.', 'There are about twenty people at the edge of the moat, some want to climb down.')],
      },
      answersRu: {
        injured: ['Он говорит, что спина болит и нога как-то вывернута.'],
        intoxicated: ['Да, мы весь вечер гуляем, он довольно пьяный.'],
        count: ['У края рва человек двадцать, некоторые хотят спуститься.'],
      },
      openingRu: [
        'Мой друг упал со стены на развалинах замка, прямо в ров! Он не может двигаться!',
        'Тут на замковых холмах мой друг упал с крутого склона, кричит от боли, а мы не можем к нему спуститься!',
      ],
    },
    tags: ['alcohol'],
  },

  // 8. Setomaa: teenagers crawl under the fence into the closed Piusa sand caves and a passage caves in.
  {
    id: 'assist_piusa_koobastes_noored',
    category: 'assist',
    code: 'ABI',
    title: T('Noored suletud Piusa koobastes', 'Teenagers inside the closed Piusa caves'),
    priority: 2,
    weight: 0.2,
    regions: ['louna'],
    hours: [0.6, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2, 1.8, 1.5, 1.2, 0.9],
    places: ['museum'],
    placeTags: ['caves'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [40, 100],
    persons: [
      { role: 'caller', gender: 'any', age: [14, 17], relation: 'friend' },
      { role: 'missing', gender: 'M', age: [14, 17] },
      { role: 'missing', gender: 'any', age: [14, 17] },
    ],
    summary: [
      T(
        '{place}, {address}. Teataja sõnul läksid tema sõbrad suletud liivakoobastesse videot filmima ega leia enam väljapääsu. Koopas levi ei ole, viimane sõnum tuli tund aega tagasi.',
        '{place}, {address}. The caller says friends went into the closed sand caves to film a video and cannot find the way out. There is no signal in the caves; the last message came an hour ago.',
      ),
      T(
        '{place}, {address}. Teismeline teatab, et kaks sõpra jäid koopasse, kui käigus hakkas laest liiva pudenema. Seest kostab hüüdmist.',
        '{place}, {address}. A teenager reports that two friends are still in the cave after sand started falling from the roof of a passage. Shouting can be heard from inside.',
      ),
    ],
    callerLines: [
      T(
        'Me läksime aia alt koobastesse ja kaks sõpra läksid sügavamale. Nüüd nad ei vasta ja ma ei julge tagasi minna.',
        'We got into the caves under the fence and two friends went deeper in. Now they are not answering and I do not dare go back in.',
      ),
      T(
        'Seal kukkus laest liiva ja üks käik vajus kinni. Ma kuulsin neid hüüdmas, aga kaugelt.',
        'Sand fell from the roof in there and one passage caved in. I heard them shouting, but from far away.',
      ),
      T('Meil olid ainult telefonide taskulambid ja nende akud on peaaegu tühjad.', 'We only had our phone torches and the batteries are almost dead.'),
    ],
    details: [
      T(
        'Teataja sõnul vajus üks käik noorte järel osaliselt kinni ja laest pudeneb liiva edasi. Uus varing võib nad koopasse lõksu jätta.',
        'The caller says a passage partly caved in behind the teenagers and sand is still falling from the roof. Another collapse could trap them in the cave.',
      ),
      T(
        'Keskkonnaameti andmetel on koopad looduskaitse all ja külastajatele suletud, varisemisohu tõttu on sissepääsud trellitatud. Talvel elavad seal nahkhiired.',
        'According to the Environmental Board the caves are a protected area closed to visitors, and the entrances are barred because of the risk of collapse. Bats spend the winter there.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, teataja näitab koopasuud, kust nad sisse läksid. Hüüame sisse ja kuulatame.',
          '{callsign}: on scene, the caller is showing us the cave mouth they went in by. Calling in and listening.',
        ),
      ]),
      choice(
        2,
        [
          T(
            '{callsign}: sees on kaks noort ja käik on osaliselt kinni vajunud. Kas läheme taskulampidega ise sisse või ootame päästjaid ja hoiame koopasuu juures hüüdes ühendust?',
            '{callsign}: two teenagers inside and the passage has partly caved in. Do we go in ourselves with torches, or wait for the rescuers and keep in touch by calling from the cave mouth?',
          ),
        ],
        [
          opt(
            'wait',
            T('Oodake päästjaid, keegi sisse ei lähe', 'Wait for the rescuers, nobody goes in'),
            T(
              '{callsign}, sisse ei minda. Hoidke hüüdes ühendust, et noored püsiksid paigal, Päästeamet on teel.',
              '{callsign}, nobody goes in. Keep calling to them so they stay put, the Rescue Board is on the way.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'enter',
            T('Minge ise sisse', 'Go in yourselves'),
            T('{callsign}, üks ametnik läheb ettevaatlikult häälte suunas, teine jääb koopasuu juurde.', '{callsign}, one officer goes carefully towards the voices, the other stays at the entrance.'),
            { success: 0, risk: 0.15 },
          ),
        ],
        'enter',
      ),
      agency(
        'paaste',
        3,
        [
          T(
            '{callsign}: palun Päästeamet Piusa koobastesse, kaks noort on varisemisohuga käigus. Vaja valgustust ja köisi.',
            '{callsign}: Rescue Board to the Piusa caves please, two teenagers in a passage at risk of collapse. Lights and ropes needed.',
          ),
        ],
        { timeoutMin: 8 },
      ),
      agency(
        'kiirabi',
        20,
        [
          T(
            '{callsign}: palun kiirabi Piusa koobaste juurde valmisolekusse, noored on mitu tundi külmas koopas olnud.',
            '{callsign}: ambulance on standby at the Piusa caves please, the teenagers have been in the cold cave for hours.',
          ),
        ],
        { chance: 0.4, timeoutMin: 8 },
      ),
    ],
    outcomes: [
      out(
        'out',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Noored toodi koopast välja ja keegi viga ei saanud. Nad anti üle vanematele, kellele selgitati keelualasse sisenemise ohte, ja juhtumist teavitati Keskkonnaametit.',
          'The teenagers were brought out of the cave and nobody was hurt. They were handed over to their parents, who were told about the dangers of entering the closed area, and the Environmental Board was informed.',
        ),
        { radio: T('{callsign}: noored koopast väljas, terved, anname vanematele üle.', '{callsign}: teenagers out of the cave, unhurt, handing them to their parents.') },
      ),
      out(
        'injured',
        'hospital',
        [0.25, 0.7],
        2,
        T(
          'Üks noormees oli varingus jalgupidi liiva alla jäänud. Ta kaevati välja ja kiirabi viis ta jalavigastusega haiglasse.',
          'One boy had been caught by the legs under the sand in the collapse. He was dug out and the ambulance took him to hospital with a leg injury.',
        ),
        { injuries: 1, radio: T('{callsign}: üks noor kaevati liivast välja, jalavigastus, haiglasse.', '{callsign}: one teenager dug out of the sand, leg injury, to hospital.') },
      ),
      out(
        'selfout',
        'warning',
        [0.4, 1],
        1,
        T(
          'Noored leidsid enne päästjate saabumist ise väljapääsu. Neile ja vanematele selgitati koobaste ohtlikkust, aiaauk teatati valdajale parandamiseks.',
          'The teenagers found the way out themselves before the rescuers arrived. They and their parents were told how dangerous the caves are, and the hole in the fence was reported to the site manager for repair.',
        ),
        { radio: T('{callsign}: noored tulid ise välja, hoiatus tehtud, lõpetame.', '{callsign}: the teenagers came out themselves, warning given, closing.') },
      ),
      out(
        'trapped',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Teine varing jättis noored mitmeks tunniks käiku lõksu. Päästjad tõid nad välja tugevalt alajahtununa ja mõlemad toimetati haiglasse.',
          'A second collapse trapped the teenagers in the passage for several hours. The rescuers got them out badly hypothermic and both were taken to hospital.',
        ),
        { injuries: 2, radio: T('{callsign}: noored olid tunde lõksus, mõlemad alajahtunult haiglasse.', '{callsign}: teenagers trapped for hours, both to hospital with hypothermia.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.35,
      toPriority: 1,
      text: T('Teataja: koopast kostis uus mürin ja nüüd ei vasta sõbrad enam üldse!', 'Caller: there was another rumble from the cave and now my friends are not answering at all!'),
    },
    expiresMin: 90,
    interactiveChance: 0.35,
    call: {
      mood: 'panic',
      opening: [
        T('Mu sõbrad on Piusa koobastes ega leia väljapääsu! Seal varises midagi!', 'My friends are in the Piusa caves and cannot find the way out! Something collapsed in there!'),
        T('Me läksime koobastesse filmima ja kaks sõpra jäid sisse. Nad ei vasta enam!', 'We went into the caves to film and two friends are still inside. They are not answering any more!'),
      ],
      answers: {
        count: [T('Sees on kaks, mina tulin välja.', 'Two are inside, I came out.')],
        injured: [T('Ma ei tea, nad hüüdsid, et ühel jäi jalg liiva alla.', 'I do not know, they shouted that one of them has his leg stuck under the sand.')],
        when: [T('Me läksime sisse umbes kaks tundi tagasi.', 'We went in about two hours ago.')],
        safe: [T('Ma olen väljas koopa ees, üksi.', 'I am outside in front of the cave, on my own.')],
        suspect: [T('Nad on minuvanused, ühel on punane jope ja teisel must.', 'They are my age, one has a red jacket and the other a black one.')],
        direction: [T('Nad on ikka koopas, kuskil sügaval sees.', 'They are still in the cave, somewhere deep inside.')],
        intoxicated: [T('Ei, keegi meist ei joonud.', 'No, none of us had been drinking.')],
      },
      answersRu: {
        count: ['Внутри двое, а я {вышел|вышла}.'],
        injured: ['Не знаю, они кричали, что у одного нога под песком.'],
        when: ['Мы зашли туда часа два назад.'],
        safe: ['Я снаружи у входа в пещеру, {один|одна}.'],
        suspect: ['Они моего возраста, у одного красная куртка, у другого чёрная.'],
        direction: ['Они всё ещё в пещере, где-то глубоко внутри.'],
        intoxicated: ['Нет, никто из нас не пил.'],
      },
      openingRu: [
        'Мои друзья в пещерах Пиуза и не могут найти выход! Там что-то обвалилось!',
        'Мы полезли в пещеры снимать видео, а двое друзей остались внутри. Они больше не отвечают!',
      ],
    },
    tags: ['youth', 'rescue'],
  },

  // 9. The Saatse Boot: a mushroom picker strays towards the Russian border in the woods round the road.
  {
    id: 'border_saatse_saapas_seeneline',
    category: 'border',
    code: 'PR',
    title: T('Seeneline eksis Saatse saapas piiri äärde', 'Mushroom picker lost at the border in the Saatse Boot'),
    priority: 3,
    weight: 1.2,
    regions: ['louna'],
    months: [8, 9, 10],
    hours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 1.2, 1.6, 1.6, 1.6, 1.6, 1.5, 1.4, 1.2, 0.8, 0.4, 0, 0, 0],
    places: ['ruralroad'],
    placeTags: ['russia'],
    units: { need: [u('patrol')], ideal: [u('border')] },
    onScene: [40, 90],
    persons: [
      { role: 'missing', gender: 'M', age: [55, 80] },
      { role: 'caller', gender: 'F', age: [50, 80], relation: 'partner' },
    ],
    summary: [
      T(
        '{address}. Teataja abikaasa läks hommikul Saatse saapa ümbrusse metsa seenele. Ta helistas, et on eksinud, ja tema telefon läks Vene võrku. Mees ei tea, kummal pool piiri ta on.',
        '{address}. The caller’s husband went mushroom picking in the woods around the Saatse Boot this morning. He rang to say he is lost and his phone has switched to a Russian network. He does not know which side of the border he is on.',
      ),
      T(
        '{address}. Eakas seeneline ei ole metsast tagasi tulnud. Viimasel kõnel ütles ta, et nägi triibulist piiriposti, ja tema telefon on Vene operaatori võrgus.',
        '{address}. An elderly mushroom picker has not come back from the forest. On his last call he said he had seen a striped border post, and his phone is on a Russian operator’s network.',
      ),
    ],
    callerLines: [
      T(
        'Mu mees läks hommikul siia Saatse saapa kanti seenele ja helistas nüüd, et on ära eksinud. Talle tuli telefoni Venemaa tervitussõnum!',
        'My husband went mushroom picking round the Saatse Boot this morning and has just rung to say he is lost. He got a welcome-to-Russia text on his phone!',
      ),
      T('Ta ütles, et nägi puu juures punaste ja roheliste triipudega posti. Kas see on juba Venemaa?', 'He said he saw a post with red and green stripes by a tree. Is that Russia already?'),
      T('Tema telefoni aku on peaaegu tühi ja ta ei tea, kummale poole minna.', 'His phone battery is almost flat and he does not know which way to go.'),
    ],
    details: [
      T(
        'Teataja sõnul oli mehe viimase kõne ajal kuulda koera haukumist ja mootorsõiduki häält. Kui ta on piiri ületanud, võivad Vene piirivalvurid ta kinni pidada.',
        'The caller says a dog could be heard barking and an engine running during the man’s last call. If he has crossed the border, the Russian border guards may detain him.',
      ),
      T(
        'Piirivalve andmetel kulgeb riigipiir Saatse saapa ümbruses läbi metsa ja piirimärgistus on kohati raskesti märgatav.',
        'According to the border guard the border runs through forest around the Saatse Boot and the markings are hard to spot in places.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, abikaasa näitab, kust mees metsa läks. Piirivalve vaatab üle seirekaamerate pildi.',
          '{callsign}: on scene, the wife is showing us where the man went into the forest. The border guard is checking the surveillance camera footage.',
        ),
      ]),
      qp(
        'missing',
        1,
        [
          T(
            '{callsign}: abikaasa andis mehe andmed. Nimi {name}, isikukood {idcode}. Palun kontrolli ja edasta piirivalvele.',
            '{callsign}: the wife has given us the man’s details. Name {name}, ID code {idcode}. Please check and pass them to the border guard.',
          ),
        ],
        0.7,
      ),
      choice(
        3,
        [
          T(
            '{callsign}: telefoni viimane asukoht on piirijoone lähedal, võib-olla juba teisel pool. Kuidas toimime?',
            '{callsign}: the phone’s last position is near the border line, possibly already on the other side. How do we proceed?',
          ),
        ],
        [
          opt(
            'commissioner',
            T('Otsige meie poolelt, teavitage piirivolinikku', 'Search our side, inform the border commissioner'),
            T(
              '{callsign}, otsige piiri ääres meie poolel ja hüüdke teda. Juhtimiskeskus teavitab piirivolinikku, et Vene pool oleks kursis.',
              '{callsign}, search along our side of the border and call out to him. Control will inform the border commissioner so the Russian side is aware.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'wait',
            T('Oodake, ehk tuleb ise välja', 'Wait, he may find his own way out'),
            T('{callsign}, oodake tee ääres ja proovige talle helistada.', '{callsign}, wait by the road and keep trying to call him.'),
            { success: -0.05 },
          ),
        ],
        'wait',
      ),
      search(
        5,
        3,
        [
          T(
            '{callsign}: mees ikka ei vasta, alustame otsinguid piiriäärses metsas meie poolel. Hüüame ja vaatame jälgi.',
            '{callsign}: he is still not answering, starting a search in the border forest on our side. Calling out and looking for tracks.',
          ),
        ],
      ),
    ],
    outcomes: [
      out(
        'found',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Mees leiti Eesti poolelt piirisihi lähedalt, korvitäis seeni käes. Tema telefon oli lihtsalt Vene võrku läinud, piiri ta ei ületanud.',
          'The man was found on the Estonian side near the border clearing with a basket of mushrooms. His phone had simply switched to the Russian network; he had not crossed the border.',
        ),
        { radio: T('{callsign}: mees leitud meie poolelt, piiri ei ületanud, lõpetame.', '{callsign}: man found on our side, did not cross, closing.') },
      ),
      out(
        'back',
        'warning',
        [0.4, 0.9],
        2,
        T(
          'Mees oli piirimärgist mõnikümmend meetrit edasi läinud ja tuli piirivalvurite hüüete peale tagasi. Juhtum registreeriti ja Vene poolt teavitati piirivoliniku kaudu.',
          'The man had wandered a few dozen metres past the border marker and came back when the border guards called to him. The incident was recorded and the Russian side was informed through the border commissioner.',
        ),
        { radio: T('{callsign}: mees oli korraks üle piiri, tuli tagasi, registreeritud.', '{callsign}: he was briefly over the border, came back, incident recorded.') },
      ),
      out(
        'detained',
        'referred',
        [0, 0.45],
        2,
        T(
          'Vene piirivalvurid pidasid mehe oma territooriumil kinni. Tema tagasitoomist korraldatakse piirivolinike kaudu, abikaasat teavitati.',
          'Russian border guards detained the man on their territory. His return is being arranged through the border commissioners and his wife has been informed.',
        ),
        { radio: T('{callsign}: Vene piirivalve pidas mehe kinni, edasi piirivolinik.', '{callsign}: Russian border guards detained him, border commissioner takes over.') },
      ),
      out(
        'night',
        'referred',
        [0, 0.3],
        1,
        T(
          'Meest otsingute käigus ei leitud ja tema telefon oli välja lülitunud. Otsinguid jätkavad piirivalve ja vabatahtlikud, Vene poolt teavitati piirivoliniku kaudu.',
          'The man was not found during the search and his phone was off. The border guard and volunteers are continuing the search, and the Russian side was informed through the border commissioner.',
        ),
        { radio: T('{callsign}: meest ei leitud, otsinguid jätkavad piirivalve ja vabatahtlikud.', '{callsign}: man not found, border guard and volunteers continue the search.') },
      ),
    ],
    escalation: {
      afterMin: 30,
      chance: 0.4,
      toPriority: 2,
      text: T(
        'Teataja: mees helistas uuesti, ta näeb vormis mehi ja koera ning telefon on ikka Vene võrgus. Siis kõne katkes.',
        'Caller: my husband rang again, he can see men in uniform with a dog and his phone is still on the Russian network. Then the call cut off.',
      ),
    },
    expiresMin: 120,
    interactiveChance: 0.3,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Mu mees läks Saatse saapa juurde seenele ja helistas, et on eksinud. Tema telefon näitab Venemaad!',
          'My husband went mushroom picking by the Saatse Boot and rang to say he is lost. His phone says he is in Russia!',
        ),
        T(
          'Mu abikaasa on hommikust saati metsas. Ta ütles, et nägi mingit triibulist piiriposti ja ei tea, kuhu minna.',
          'My husband has been in the forest since this morning. He said he saw some striped border post and does not know where to go.',
        ),
      ],
      answers: {
        suspect: [T('Tal on seljas roheline jope ja jalas kummikud, käes seenekorv.', 'He is wearing a green jacket and wellies and carrying a mushroom basket.')],
        when: [T('Ta läks metsa kella üheksa paiku hommikul.', 'He went into the forest at about nine in the morning.')],
        injured: [T('Ta ütles, et on väsinud ja jalad valutavad, muidu on terve.', 'He said he is tired and his feet hurt, otherwise he is fine.')],
        direction: [T('Ta läks siit tee äärest metsa ja sealt kuhugi piiri poole.', 'He went into the forest from here by the road and from there somewhere towards the border.')],
        vehicle: [T('Meie auto on siin tee ääres, tema läks jala.', 'Our car is here by the road, he went on foot.')],
        intoxicated: [T('Ei, ta ei joo üldse.', 'No, he does not drink at all.')],
      },
      answersRu: {
        suspect: ['На нём зелёная куртка и резиновые сапоги, в руках корзинка для грибов.'],
        when: ['Он ушёл в лес часов в девять утра.'],
        injured: ['Он сказал, что устал и ноги болят, а так здоров.'],
        direction: ['Он ушёл в лес отсюда, от дороги, а дальше куда-то к границе.'],
        vehicle: ['Наша машина тут у дороги, а он пешком ушёл.'],
        intoxicated: ['Нет, он вообще не пьёт.'],
      },
      openingRu: [
        'Мой муж пошёл за грибами возле Саатсеского сапога и позвонил, что заблудился. У него телефон показывает Россию!',
        'Мой муж с утра в лесу. Он сказал, что видел какой-то полосатый пограничный столб и не знает, куда идти.',
      ],
    },
    tags: ['search', 'forest'],
  },

  // 10. Tartu: an illegal night-time drift meet on the old Raadi airfield runway.
  {
    id: 'traffic_raadi_lennuvalja_driftijad',
    category: 'traffic',
    code: 'LJ',
    title: T('Öine driftimine Raadi lennuväljal', 'Night-time drifting on the Raadi airfield'),
    priority: 3,
    weight: 1.6,
    regions: ['louna'],
    months: [4, 5, 6, 7, 8, 9, 10],
    hours: NIGHT,
    weekendBoost: 2,
    places: ['industrial'],
    placeTags: ['airfield'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('traffic')] },
    onScene: [30, 70],
    persons: [
      { role: 'caller', gender: 'any', age: [25, 75], relation: 'neighbour' },
      { role: 'suspect', gender: 'M', age: [18, 26], noLicense: 0.3, intoxicated: 0.15, record: 0.3 },
      { role: 'witness', gender: 'any', age: [16, 25] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect', noInsurance: 0.3, noInspection: 0.4 }],
    summary: [
      T(
        '{address}. Endisel Raadi lennurajal on kogunenud paarkümmend autot, mis driftivad ja teevad ringe. Rehvisuits ja mürin ulatuvad elamuteni, pealtvaatajad seisavad raja ääres.',
        '{address}. About twenty cars have gathered on the old Raadi runway, drifting and spinning donuts. The tyre smoke and roar carry to the houses, and spectators are standing along the runway.',
      ),
      T(
        '{address}. Teataja sõnul korraldavad noored Raadi lennuväljal kiirendusvõistlusi, autod sõidavad tuledeta ja inimesed seisavad otse raja peal.',
        '{address}. The caller says young people are holding drag races on the Raadi airfield; cars are driving without lights and people are standing right on the runway.',
      ),
    ],
    callerLines: [
      T(
        'Lennuväljalt tuleb jälle mürinat ja rehvide vilinat, kogu linnaosa on üleval. Seal on kümneid autosid.',
        'There is that roaring and tyre squealing from the airfield again, the whole neighbourhood is awake. There are dozens of cars there.',
      ),
      T(
        'Nad sõidavad ringe ja rahvas seisab otse raja ääres, keegi saab varsti surma.',
        'They are driving in circles and people are standing right by the runway, somebody is going to get killed.',
      ),
      T(
        'Üks auto teeb ilma tuledeta kiirendusi mööda rada. Igal nädalavahetusel on sama jama.',
        'One car is doing sprints down the runway without lights. It is the same nonsense every weekend.',
      ),
    ],
    details: [
      T(
        'Teataja sõnul seisavad pealtvaatajad otse raja serval ja üks auto on juba korra rahva poole libisenud.',
        'The caller says spectators are standing right at the edge of the runway and one car has already slid towards the crowd once.',
      ),
      T(
        'Kogunemine kutsuti kokku sotsiaalmeedias, samas kohas on suveöödel sõidetud varemgi.',
        'The meet was organised on social media; people have driven there on summer nights before.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, rajal on paarkümmend autot ja umbes sada pealtvaatajat. Sõit lõppes, kui meid nähti, osa autosid sõidab minema.',
          '{callsign}: on scene, about twenty cars and a hundred spectators on the runway. The driving stopped when they saw us, some cars are leaving.',
        ),
      ]),
      choice(
        2,
        [
          T(
            '{callsign}: väljasõite on kaks. Kas sulgeme mõlemad väljasõidud ja kontrollime juhid ükshaaval või saadame kogunemise laiali?',
            '{callsign}: there are two ways out. Do we block both exits and check the drivers one by one, or break up the meet?',
          ),
        ],
        [
          opt(
            'check',
            T('Väljasõidud kinni, kontrollige kõik juhid', 'Block the exits, check every driver'),
            T(
              '{callsign}, sulgege mõlemad väljasõidud ja kontrollige juhtide joovet, juhtimisõigust ja autode tehnoseisu.',
              '{callsign}, block both exits and check the drivers for alcohol, their licences and the cars’ roadworthiness.',
            ),
            { success: 0.15, time: 20 },
          ),
          opt(
            'disperse',
            T('Saatke laiali', 'Send them away'),
            T(
              '{callsign}, teatage valjuhääldist, et kogunemine on lõppenud, ja kontrollige lahkujaid pisteliselt.',
              '{callsign}, announce over the loudspeaker that the meet is over and spot-check the cars as they leave.',
            ),
            { success: 0, time: 5 },
          ),
        ],
        'disperse',
      ),
      pursuit(
        5,
        [
          T(
            '{callsign}: üks auto sõitis tuledeta üle põllu minema ja keeras Jaamamõisa poole, ei peatu. Jälitame!',
            '{callsign}: one car drove off across the field without lights and turned towards Jaamamõisa, not stopping. In pursuit!',
          ),
        ],
        0.3,
      ),
      qp('suspect', 10, R_DRIVER, 0.8),
    ],
    outcomes: [
      out(
        'checked',
        'fine',
        [0.5, 1],
        4,
        T(
          'Kogunemine lõpetati ja juhte kontrolliti. Kolme juhi suhtes alustati väärteomenetlust: üks sõitis juhtimisõiguseta, kaks autot olid ilma kindlustuse ja ülevaatuseta.',
          'The meet was ended and the drivers were checked. Misdemeanour proceedings were opened against three of them: one was driving without a licence and two cars had no insurance or roadworthiness test.',
        ),
        { radio: T('{callsign}: juhid kontrollitud, kolm väärteoprotokolli, kogunemine lõpetatud.', '{callsign}: drivers checked, three misdemeanour reports, meet ended.') },
      ),
      out(
        'dispersed',
        'warning',
        [0.35, 0.85],
        2,
        T(
          'Kogunemine saadeti laiali ja juhtidele tehti hoiatus. Lennuvälja valdajale soovitati sissesõitudele tõkked panna.',
          'The meet was broken up and the drivers were warned. The owner of the airfield was advised to put barriers on the ways in.',
        ),
        { radio: T('{callsign}: kogunemine laiali, juhtidele hoiatus, lõpetame.', '{callsign}: meet broken up, drivers warned, closing.') },
      ),
      out(
        'crash',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Üks lahkuv auto kiirendas pealtvaatajate vahel, libises nende sekka ja paiskas ühe noore pikali. Kannatanu toimetati jalavigastusega haiglasse, juht peeti kinni ja alustati kriminaalmenetlust.',
          'One of the cars leaving accelerated among the spectators, slid into them and knocked a young person down. The victim was taken to hospital with a leg injury; the driver was detained and criminal proceedings were opened.',
        ),
        { injuries: 1, arrests: 1, radio: T('{callsign}: auto libises rahva sekka, üks haiglasse, juht kinni.', '{callsign}: car slid into the crowd, one to hospital, driver detained.') },
      ),
      out(
        'gone',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Enamik autosid sõitis politseid nähes üle põllu minema ja nende juhte kohapeal ei tuvastatud. Juhid selgitatakse välja videote põhjal, menetlus jätkub.',
          'Most of the cars drove off across the field when they saw the police and their drivers were not identified on the spot. They will be traced from videos and the case continues.',
        ),
        { radio: T('{callsign}: autod jõudsid lahkuda, tuvastame videote järgi.', '{callsign}: the cars got away, identifying from videos.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.3,
      toPriority: 2,
      text: T(
        'Teataja: autod sõidavad nüüd otse rahva vahelt läbi, üks riivas peaaegu pealtvaatajaid!',
        'Caller: the cars are now driving straight through the crowd, one nearly clipped some spectators!',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Raadi lennuväljal on jälle autode kogunemine, mürin on kohutav ja rahvas seisab otse raja ääres!',
          'There is another car meet on the Raadi airfield, the roar is terrible and people are standing right by the runway!',
        ),
        T('Lennurajal driftivad kümned autod, öösel! Keegi saab seal varsti surma.', 'Dozens of cars are drifting on the runway, at night! Somebody is going to get killed there.'),
      ],
      answers: {
        count: [T('Autosid on paarkümmend ja inimesi ehk sada.', 'About twenty cars and maybe a hundred people.')],
        intoxicated: [T('Seda ma siit ei näe, aga õllepudeleid on palju.', 'I cannot see that from here, but there are lots of beer bottles.')],
        injured: [T('Veel mitte, aga üks auto libises juba korra rahva poole.', 'Not yet, but one car already slid towards the crowd once.')],
      },
      answersRu: {
        count: ['Машин штук двадцать, а людей, может, сотня.'],
        intoxicated: ['Отсюда не видно, но пивных бутылок много.'],
        injured: ['Пока нет, но одну машину уже раз занесло в сторону людей.'],
      },
      openingRu: [
        'На аэродроме Раади опять сборище машин, рёв ужасный, а люди стоят прямо у полосы!',
        'На взлётной полосе дрифтуют десятки машин, ночью! Там скоро кого-нибудь убьют.',
      ],
    },
    tags: ['youth', 'noise'],
  },

  // 11. Mustvee: the caretaker of the Old Believers' prayer house finds the door forced and the old icons gone.
  {
    id: 'property_palvelast_ikoonid_varastatud',
    category: 'property',
    code: 'MV',
    title: T('Vanausuliste palvelast varastati ikoonid', 'Icons stolen from the Old Believers’ prayer house'),
    priority: 3,
    weight: 0.15,
    regions: ['louna'],
    hours: [0, 0, 0, 0, 0, 0, 0.3, 1.5, 2.5, 2.5, 2, 1.5, 1, 0.5, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    places: ['church'],
    placeTags: ['oldbelievers'],
    units: { need: [u('patrol')], ideal: [u('criminal'), u('k9')] },
    onScene: [40, 90],
    persons: [
      { role: 'caller', gender: 'F', age: [55, 85] },
      { role: 'suspect', gender: 'M', age: [25, 55], record: 0.7, wanted: 0.1 },
    ],
    vehicles: [{ role: 'suspect', kind: 'van', driverRole: 'suspect' }],
    summary: [
      T(
        '{address}, Mustvee. Vanausuliste palvela hooldaja leidis hommikul, et kõrvaluks on lahti murtud ja palvesaali seinalt on kadunud mitu vana ikooni.',
        '{address}, Mustvee. The caretaker of the Old Believers’ prayer house found this morning that the side door had been forced and several old icons were missing from the wall of the prayer hall.',
      ),
      T(
        '{address}, Mustvee. Teataja sõnul on palvelasse öösel sisse murtud ja ikoonid seinalt ära viidud. Naaber nägi öösel maja juures tuledeta kaubikut.',
        '{address}, Mustvee. The caller says the prayer house was broken into in the night and icons taken off the walls. A neighbour saw a van without lights by the building in the night.',
      ),
    ],
    callerLines: [
      T(
        'Ma tulin hommikul palvelat lahti tegema ja uks oli lõhutud. Seinalt on kadunud kõige vanemad ikoonid.',
        'I came in the morning to open the prayer house and the door was broken. The oldest icons are gone from the wall.',
      ),
      T(
        'Need ikoonid on siin olnud üle saja aasta, vanaisade ajast saati. Inimesed käisid nende ees palvetamas.',
        'Those icons have been here for over a hundred years, since our grandfathers’ time. People came to pray before them.',
      ),
      T(
        'Naabrimees nägi öösel maja taga kaubikut, tuled olid kustus. Ta pani numbri osaliselt kirja.',
        'The neighbour saw a van behind the building in the night with its lights off. He wrote down part of the number.',
      ),
    ],
    callerLinesRu: [
      'Я утром {пришёл|пришла} моленную открывать, а дверь взломана. Со стены пропали самые старые иконы.',
      'Эти иконы тут больше ста лет висели, ещё с дедов. Люди перед ними молились.',
      'Сосед ночью видел за домом фургон, фары были выключены. Он номер частично записал.',
    ],
    details: [
      T(
        'Naabri sõnul seisis kaubik maja taga umbes kella kolme paiku öösel, numbrimärgist jäid talle meelde kolm numbrit.',
        'The neighbour says the van stood behind the building at about three in the morning; he remembered three digits of the number plate.',
      ),
      T(
        'Politsei andmetel on Peipsiäärsetest palvelatest ikoone varemgi varastatud, need jõuavad sageli välismaa kollektsionääride kätte.',
        'Police records show icons have been stolen from prayer houses along Lake Peipsi before; they often end up with collectors abroad.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, külgukse lukk on kangiga välja murtud. Seinalt on puudu seitse ikooni, põrandal on jalajäljed.',
          '{callsign}: on scene, the side door lock has been prised out with a bar. Seven icons are missing from the wall and there are footprints on the floor.',
        ),
      ]),
      choice(
        3,
        [
          T(
            '{callsign}: hooldaja tahab ikoonide kohad enne koguduse tulekut ära koristada. Kas laseme või kutsume enne kriminalistid?',
            '{callsign}: the caretaker wants to tidy up where the icons hung before the congregation arrives. Do we let her, or get the forensics team in first?',
          ),
        ],
        [
          opt(
            'forensics',
            T('Ala suletud, kriminalistid kohale', 'Seal the scene, forensics in'),
            T(
              '{callsign}, palvela jääb suletuks, kuni kriminalistid on jäljed võtnud. Selgitage hooldajale ja kogudusele, miks.',
              '{callsign}, the prayer house stays closed until forensics have taken the traces. Explain why to the caretaker and the congregation.',
            ),
            { success: 0.15, time: 20 },
          ),
          opt(
            'tidy',
            T('Pildistage ja laske koristada', 'Take photos and let her tidy up'),
            T('{callsign}, pildistage kõik üle ja laske hooldajal koristada.', '{callsign}, photograph everything and let the caretaker tidy up.'),
            { success: -0.1, time: 5 },
          ),
        ],
        'tidy',
      ),
      qv(6, [
        T(
          '{callsign}: naaber andis kaubiku numbrist osa, sobib {plate}. Palun kontrolli omanikku ja kas sõiduk on tagaotsitav.',
          '{callsign}: the neighbour gave us part of the van’s number, {plate} fits. Please check the owner and whether the vehicle is wanted.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'van',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Numbrituvastuskaamerad näitasid kaubikut öösel Tartu suunas sõitmas ja see peatati Tartus. Juht peeti kinni ja kaubikust leiti kottidesse mähitud ikoonid. Alustati kriminaalmenetlust KarS § 199 järgi, ikoonid tagastati kogudusele.',
          'Number plate cameras showed the van heading for Tartu in the night and it was stopped in Tartu. The driver was detained and the icons were found inside wrapped in sacks. Criminal proceedings were opened under KarS § 199 and the icons were returned to the congregation.',
        ),
        { arrests: 1, radio: T('{callsign}: kaubik peatatud, ikoonid leitud, juht kinni.', '{callsign}: van stopped, icons found, driver detained.') },
      ),
      out(
        'traces',
        'report',
        [0.4, 1],
        2,
        T(
          'Kriminalistid võtsid lõhutud uksest jäljed ja kaubiku omanik tuvastati. Alustati kriminaalmenetlust KarS § 199 järgi, ikoonide andmed edastati piirivalvele ja tollile.',
          'Forensics took traces from the forced door and the van’s owner was identified. Criminal proceedings were opened under KarS § 199 and the icons’ details were passed to the border guard and customs.',
        ),
        { radio: T('{callsign}: jäljed võetud, kaubik tuvastatud, menetlus alustatud.', '{callsign}: traces taken, van identified, case opened.') },
      ),
      out(
        'lost',
        'report',
        [0, 0.45],
        2,
        T(
          'Kasutatavaid jälgi ei leitud ja naabri antud numbriosa järgi leitud kaubik osutus asjasse mittepuutuvaks. Alustati kriminaalmenetlust varguse kohta, ikoonide fotod edastati Interpoli varastatud kunstiteoste andmebaasi.',
          'No usable traces were found and the van traced from the neighbour’s partial number turned out to be unconnected. Criminal proceedings for theft were opened and photos of the icons were sent to the Interpol database of stolen works of art.',
        ),
        { radio: T('{callsign}: jälgi pole, kaubik polnud seotud, menetlus alustatud.', '{callsign}: no traces, the van was unconnected, case opened.') },
      ),
      out(
        'abroad',
        'escaped',
        [0, 0.3],
        1,
        T(
          'Kaubikut ei õnnestunud kinni pidada ja see kadus. Ikoonid on tõenäoliselt juba riigist välja viidud, menetlus jätkub.',
          'The van could not be stopped and has vanished. The icons have probably already been taken out of the country; the case continues.',
        ),
        { radio: T('{callsign}: kaubik kadunud, ikoonid ilmselt välismaal, menetlus jätkub.', '{callsign}: the van has vanished, icons probably abroad, case continues.') },
      ),
    ],
    expiresMin: 180,
    interactiveChance: 0.3,
    call: {
      mood: 'elderly',
      opening: [
        T('Meie palvelasse on sisse murtud! Uks on lõhutud ja vanad ikoonid on seinalt kadunud!', 'Our prayer house has been broken into! The door is smashed and the old icons are gone from the wall!'),
        T(
          'Ma olen palvela hooldaja. Öösel on keegi sisse tulnud ja kõige väärtuslikumad ikoonid ära viinud.',
          'I am the caretaker of the prayer house. Someone got in during the night and took the most valuable icons.',
        ),
      ],
      answers: {
        count: [T('Seitse ikooni on puudu, suured ja vanad.', 'Seven icons are missing, big old ones.')],
        when: [T('Õhtul kell kaheksa oli kõik korras, hommikul oli uks lahti.', 'At eight in the evening everything was fine, in the morning the door was open.')],
        vehicle: [T('Naaber nägi öösel maja taga kaubikut, tuled olid kustus.', 'The neighbour saw a van behind the building in the night with its lights off.')],
        safe: [T('Jah, ma olen väljas, sisse ma enam ei läinud.', 'Yes, I am outside, I did not go back in.')],
        suspect: [T('Mina ei näinud kedagi, naaber nägi ainult kaubikut.', 'I did not see anyone, the neighbour only saw the van.')],
        direction: [T('Naaber ütleb, et kaubik sõitis Tartu maantee poole.', 'The neighbour says the van drove off towards the Tartu road.')],
      },
      answersRu: {
        count: ['Семи икон нет, больших, старинных.'],
        when: ['Вечером в восемь всё было в порядке, а утром дверь открыта.'],
        vehicle: ['Сосед ночью видел за домом фургон, фары были выключены.'],
        safe: ['Да, я на улице, внутрь больше не {заходил|заходила}.'],
        suspect: ['Я никого не {видел|видела}, сосед видел только фургон.'],
        direction: ['Сосед говорит, фургон уехал в сторону Тартуского шоссе.'],
      },
      openingRu: ['К нам в моленную залезли! Дверь сломана, старые иконы со стены пропали!', 'Я смотрю за моленной. Ночью кто-то забрался и унёс самые ценные иконы.'],
    },
    tags: ['theft', 'church'],
  },

  // 12. Tartu: a drunk stag party climbs the Kissing Students sculpture-fountain on Raekoja plats at night.
  {
    id: 'public_order_suudlevate_tudengite_skulptuuril',
    category: 'public_order',
    code: 'ÖR',
    title: T('Joobes seltskond ronib Suudlevate tudengite skulptuurile', 'Drunk group climbing the Kissing Students sculpture'),
    priority: 3,
    weight: 1.1,
    regions: ['louna'],
    hours: NIGHT,
    weekendBoost: 1.8,
    places: ['oldtown'],
    placeTags: ['raekoja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [20, 45],
    persons: [
      { role: 'caller', gender: 'any', age: [20, 60] },
      { role: 'suspect', gender: 'M', age: [22, 38], intoxicated: 0.9, record: 0.2 },
      { role: 'suspect', gender: 'M', age: [22, 38], intoxicated: 0.8 },
      { role: 'witness', gender: 'any', age: [18, 60] },
    ],
    summary: [
      T(
        '{place}. Joobes meesteseltskond ronis öösel raekoja ees Suudlevate tudengite skulptuurile ja purskkaevu servale, üks mees ripub vihmavarju küljes. Teataja kardab, et skulptuur saab kahjustada.',
        '{place}. A drunk group of men has climbed onto the Kissing Students sculpture and the edge of the fountain in front of the town hall in the night; one man is hanging from the umbrella. The caller fears the sculpture will be damaged.',
      ),
      T(
        '{place}. Teataja sõnul on raekoja ees viis-kuus purjus meest, kes ronivad purskkaevu skulptuurile, pildistavad end ja sõimavad möödujaid.',
        '{place}. The caller says five or six drunk men in front of the town hall are climbing the fountain sculpture, taking photos of themselves and abusing passers-by.',
      ),
    ],
    callerLines: [
      T(
        'Raekoja ees ronivad mingid purjus mehed Suudlevate tudengite otsa! Üks ripub vihmavarju küljes.',
        'Some drunk men are climbing all over the Kissing Students in front of the town hall! One is hanging from the umbrella.',
      ),
      T(
        'See on vist mingi poissmeesteõhtu, nad karjuvad ja kallavad skulptuurile õlut.',
        'It looks like some stag party, they are shouting and pouring beer over the sculpture.',
      ),
      T(
        'Ma ütlesin neile, et tulge alla, aga nad hakkasid mind sõimama. Vihmavari juba kõigub.',
        'I told them to come down, but they started swearing at me. The umbrella is already wobbling.',
      ),
    ],
    details: [
      T(
        'Teataja sõnul üritab üks meestest vihmavarju skulptuuri küljest lahti kangutada, teised ergutavad teda.',
        'The caller says one of the men is trying to prise the umbrella off the sculpture while the others egg him on.',
      ),
      T(
        'Linnavalitsuse andmetel filmivad Raekoja platsi valvekaamerad ka purskkaevu ümbrust.',
        'According to the town government the Raekoja plats CCTV cameras also cover the area round the fountain.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, purskkaevu juures on viis meest, kaks neist on skulptuuril. Palume neil alla tulla.',
          '{callsign}: on scene, five men at the fountain, two of them up on the sculpture. Asking them to come down.',
        ),
      ]),
      choice(
        2,
        [
          T(
            '{callsign}: üks tuli alla, teine istub vihmavarju all skulptuuri peal ega taha tulla. Kas räägime ta alla või tõmbame jõuga maha?',
            '{callsign}: one has come down, the other is sitting under the umbrella on the sculpture and will not come. Do we talk him down or pull him off by force?',
          ),
        ],
        [
          opt(
            'talk',
            T('Rääkige ta alla', 'Talk him down'),
            T('{callsign}, rääkige ta rahulikult alla, kiiret pole. Teised hoidke eemal.', '{callsign}, talk him down calmly, there is no rush. Keep the others back.'),
            { success: 0.15, time: 10 },
          ),
          opt(
            'pull',
            T('Tooge ta jõuga alla', 'Bring him down by force'),
            T('{callsign}, tooge ta skulptuurilt jõuga alla.', '{callsign}, bring him down off the sculpture by force.'),
            { success: 0, risk: 0.08 },
          ),
        ],
        'pull',
      ),
      qp('suspect', 6, R_SUSPECT, 0.8),
    ],
    outcomes: [
      out(
        'fined',
        'fine',
        [0.5, 1],
        4,
        T(
          'Mehed tuvastati ja nende suhtes alustati väärteomenetlust avaliku korra rikkumise eest. Skulptuuril kahjustusi ei leitud, seltskond saadeti majutusse.',
          'The men were identified and misdemeanour proceedings were opened against them for disorderly behaviour. No damage was found on the sculpture and the group was sent back to where they were staying.',
        ),
        { radio: T('{callsign}: mehed tuvastatud, protokollid tehtud, skulptuur terve.', '{callsign}: men identified, reports written, sculpture undamaged.') },
      ),
      out(
        'damage',
        'report',
        [0.4, 1],
        2,
        T(
          'Skulptuuri vihmavari oli kõveraks väänatud. Kaks meest peeti kinni, alustati kriminaalmenetlust asja kahjustamise kohta ja linn hindab kahju suurust.',
          'The sculpture’s umbrella had been bent out of shape. Two men were detained, criminal proceedings for criminal damage were opened and the town is assessing the cost.',
        ),
        { arrests: 2, radio: T('{callsign}: vihmavari kõver, kaks kinni, menetlus alustatud.', '{callsign}: umbrella bent, two detained, case opened.') },
      ),
      out(
        'fell',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Üks meestest kukkus skulptuurilt alla tulles purskkaevu kiviservale ja sai peahaava. Ta toimetati kiirabiga haiglasse, teiste suhtes alustati väärteomenetlust.',
          'One of the men fell onto the stone edge of the fountain while climbing down off the sculpture and cut his head. He was taken to hospital by ambulance; misdemeanour proceedings were opened against the others.',
        ),
        { injuries: 1, radio: T('{callsign}: üks kukkus skulptuurilt, peahaav, kiirabi viis haiglasse.', '{callsign}: one fell off the sculpture, head wound, ambulance took him.') },
      ),
      out(
        'gone',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Seltskond hajus vanalinna baaridesse, enne kui kõik tuvastati. Skulptuuri vihmavari oli kõver, mehed selgitatakse välja valvekaamerate salvestiste järgi.',
          'The group scattered into the old town bars before everyone could be identified. The sculpture’s umbrella was bent; the men will be traced from the CCTV footage.',
        ),
        { radio: T('{callsign}: seltskond hajus, vihmavari kõver, tuvastame kaameratest.', '{callsign}: group scattered, umbrella bent, identifying from cameras.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.35,
      toPriority: 2,
      text: T(
        'Teataja: mehed kangutavad nüüd vihmavarju ja tõukavad möödujaid, kes neile midagi ütlevad!',
        'Caller: the men are now prising at the umbrella and shoving passers-by who say anything to them!',
      ),
    },
    expiresMin: 60,
    interactiveChance: 0.25,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Raekoja platsil ronivad purjus mehed Suudlevate tudengite skulptuuri otsa! Üks ripub vihmavarju küljes!',
          'On Raekoja plats drunk men are climbing all over the Kissing Students sculpture! One is hanging from the umbrella!',
        ),
        T(
          'Purskkaevu juures on terve seltskond purjus mehi, nad ronivad skulptuurile ja sõimavad inimesi.',
          'There is a whole group of drunk men at the fountain, climbing the sculpture and swearing at people.',
        ),
      ],
      answers: {
        count: [T('Neid on viis või kuus, kõik mehed.', 'There are five or six of them, all men.')],
        intoxicated: [T('Jah, väga purjus, neil on õllepudelid käes.', 'Yes, very drunk, they have beer bottles in their hands.')],
        weapons: [T('Relvi ei ole, ainult pudelid.', 'No weapons, only bottles.')],
        direction: [T('Nad on ikka purskkaevu juures, keegi ei ole ära läinud.', 'They are still at the fountain, nobody has left.')],
      },
      answersRu: {
        count: ['Их человек пять-шесть, все мужики.'],
        intoxicated: ['Да, сильно пьяные, с пивом в руках.'],
        weapons: ['Оружия нет, только бутылки.'],
        direction: ['Они всё ещё у фонтана, никто не ушёл.'],
      },
      openingRu: [
        'На Ратушной площади пьяные мужики лезут на скульптуру «Целующиеся студенты»! Один висит на зонтике!',
        'У фонтана целая компания пьяных мужиков, лезут на скульптуру и матерят прохожих.',
      ],
    },
    tags: ['alcohol', 'group'],
  },
];
