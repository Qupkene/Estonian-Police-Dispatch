// Avalik kord: korrarikkujad, öörahu, joobes isikud, naabrivaidlused, meeleavaldused.
import type { IncidentScenario, IncidentTemplate, Text } from '@/sim/types';
import {
  T,
  backup,
  choice,
  kiirabi,
  oc,
  opt,
  qPerson,
  qVehicle,
  search,
  toArrest,
  toSober,
  info,
  un,
} from './_helpers_a';

// ─── Scenarios: one coherent story per incident (IncidentTemplate.scenarios) ──
// The most frequent public order calls tell different stories: who is involved, where exactly,
// who calls and what the patrol finds.

/** "Sober up, ambulance or home?" for a woman lying drunk. */
const soberChoiceF = () =>
  choice(
    3,
    [
      T(
        '{callsign}: naine tugevas joobes, ise liikuda ei suuda. Kas toimetame kainenema, kutsume kiirabi või viime koju?',
        '{callsign}: the woman is heavily intoxicated and cannot walk. Sobering-up cell, ambulance, or drive her home?',
      ),
    ],
    [
      opt(
        'sober',
        T('Kainenema', 'To sober up'),
        T('{callsign}, juhtimine. Toimetage kainenema.', '{callsign}, Control. Take her to sober up.'),
        { success: 0.05, time: 10 },
      ),
      opt(
        'kiirabi',
        T('Kutsuge kiirabi', 'Call an ambulance'),
        T(
          '{callsign}, juhtimine. Kiirabi on teel, jääge tema juurde.',
          '{callsign}, Control. Ambulance on its way, stay with her.',
        ),
        { success: 0.1, time: 15 },
      ),
      opt(
        'home',
        T('Viige koju', 'Drive her home'),
        T(
          '{callsign}, juhtimine. Viige koju, andke lähedastele üle.',
          '{callsign}, Control. Drive her home and hand her over to family.',
        ),
        { trust: 1, time: 5 },
      ),
    ],
    'sober',
  );

/** Noise complaint: warning or a misdemeanour report. */
const noiseChoice = (radio: Text[]) =>
  choice(
    3,
    radio,
    [
      opt(
        'warn',
        T('Hoiatus', 'Warning'),
        T('{callsign}, juhtimine. Tehke hoiatus.', '{callsign}, Control. Give a warning.'),
        { success: 0.05, time: 5 },
      ),
      opt(
        'fine',
        T('Väärteoprotokoll', 'Misdemeanour report'),
        T(
          '{callsign}, juhtimine. Vormistage väärteoprotokoll.',
          '{callsign}, Control. Draw up a misdemeanour report.',
        ),
        { success: 0.1, time: 15 },
      ),
    ],
    'warn',
  );

const noiseOutcomes = (warned: Text, fined: Text, again: Text) => [
  oc('warning', 'warning', [0.4, 1], 3, warned),
  oc('fine', 'fine', [0.5, 1], 2, fined),
  oc('again', 'warning', [0, 0.4], 2, again),
];

// ── public_order_drunk_lying ────────────────────────────────────────────────
const SC_DRUNK_LYING: IncidentScenario[] = [
  {
    id: 'pavement_passersby',
    summary: [
      T(
        '{address}. Joobes mees lamab kõnniteel ja reageerib kõnetamisele vähe. Möödujad peatusid.',
        '{address}. A drunk man is lying on the pavement and barely responds when spoken to. Passers-by have stopped.',
      ),
      T(
        '{address}. Kõnniteel lamab joobes mees, kaks möödujat keerasid ta külili. Mees pomiseb, aga püsti ei saa.',
        '{address}. A drunk man is lying on the pavement and two passers-by have turned him on his side. He is mumbling but cannot get up.',
      ),
    ],
    callerLines: [
      T(
        'Siin lamab mees maas, ta on vist purjus, aga ma ei tea, kas tal on midagi viga.',
        'There is a man lying here, probably drunk, but I do not know if something is wrong with him.',
      ),
      T(
        'Me keerasime ta külili, ta hingab ja pomiseb midagi.',
        'We turned him on his side, he is breathing and mumbling something.',
      ),
    ],
    details: [
      T('Isik: {suspect}. Käes poolik pudel.', 'Subject: {suspect}. A half-empty bottle in his hand.'),
      T('Möödujad on isiku juures ja ootavad patrulli.', 'Passers-by are with him, waiting for the patrol.'),
    ],
  },
  {
    id: 'stairwell_head_graze',
    summary: [
      T(
        '{address}. Trepikoja ees lamab mees, tugev alkoholilõhn, peas marrastus.',
        '{address}. A man is lying outside a stairwell, strong smell of alcohol, graze on his head.',
      ),
      T(
        '{address}. Trepikoja ees lamab joobes mees, kes on ilmselt trepil kukkunud. Peas verine marrastus, ise püsti ei tõuse.',
        '{address}. A drunk man is lying outside a stairwell, apparently after a fall on the steps. Bloody graze on his head, he cannot get up.',
      ),
    ],
    callerLines: [
      T(
        'Ta kukkus vist trepil, peas on verd. Ta elab siinsamas teisel korrusel.',
        'I think he fell on the steps, there is blood on his head. He lives right here on the first floor.',
      ),
      T(
        'Ma ei taha teda üksi jätta, aga ma ei jaksa teda üles tõsta.',
        'I do not want to leave him alone, but I cannot lift him.',
      ),
    ],
    details: [
      T('Isik: {suspect}. Peas verine marrastus.', 'Subject: {suspect}. Bloody graze on his head.'),
      T('Teataja sõnul elab mees samas majas.', 'The caller says the man lives in the same building.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.6, reason: T('Peavigastus', 'Head injury') }],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, meie trepikoja ees lamab naabrimees, tal on peas verd ja ta on purjus.',
          'Hello, the man from our building is lying outside the stairwell, his head is bleeding and he is drunk.',
        ),
      ],
      openingRu: ['Здравствуйте, у нашего подъезда лежит сосед, у него кровь на голове, он пьяный.'],
      answers: {
        injured: [
          T(
            'Peas on verine marrastus, aga ta on teadvusel.',
            'There is a bloody graze on his head, but he is conscious.',
          ),
        ],
        intoxicated: [T('Jah, ta haiseb viina järele.', 'Yes, he reeks of vodka.')],
        name: [T('Ma olen tema naaber samast majast.', 'I am his neighbour from the same building.')],
      },
    },
  },
  {
    id: 'bus_shelter_cold',
    summary: [
      T(
        '{address}. Bussipeatuse kõrval lamab isik muru peal, ise püsti ei tõuse. Ilm on jahe.',
        '{address}. A person is lying on the grass by a bus stop and cannot get up. The weather is cold.',
      ),
      T(
        '{address}. Bussiootepaviljonis magab joobes mees õhukeses riietuses ega ärka. Teataja kardab, et ta külmub.',
        '{address}. A drunk man in thin clothes is asleep in a bus shelter and will not wake up. The caller is afraid he will freeze.',
      ),
    ],
    callerLines: [
      T(
        'Ta ei suuda püsti tõusta ja väljas on külm. Kas keegi saab tulla?',
        'He cannot get up and it is cold outside. Can someone come?',
      ),
      T(
        'Ta magab ootepaviljonis, ainult särgi väel. Viimane buss läks ammu.',
        'He is asleep in the bus shelter in just a shirt. The last bus left ages ago.',
      ),
    ],
    details: [
      T('Isik: {suspect}. Õhukeses riietuses, külmetab.', 'Subject: {suspect}. Thinly dressed and cold.'),
      T('Viimane buss on juba läinud.', 'The last bus has already gone.'),
    ],
  },
  {
    id: 'woman_on_bench',
    title: T('Joobes naine magab pingil', 'Drunk woman asleep on a bench'),
    persons: [
      { role: 'suspect', gender: 'F', age: [25, 65], intoxicated: 0.95, record: 0.15 },
      { role: 'caller', gender: 'any', age: [20, 60], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Kaupluse töötaja teatel magab joobes naine pingil, käekott on lahti ja rahakott paistab välja. Naine ei ärka.',
        '{address}. A shop worker reports a drunk woman asleep on a bench with her handbag open and her purse showing. She will not wake up.',
      ),
      T(
        '{address}. Pingil lamab tugevas joobes naine, möödujad on proovinud teda äratada. Kõrval on lahtine käekott.',
        '{address}. A heavily drunk woman is lying on a bench and passers-by have tried to wake her. An open handbag is next to her.',
      ),
    ],
    callerLines: [
      T(
        'Ta magab pingil juba tund aega ja kott on lahti, keegi võib kõik ära võtta.',
        'She has been asleep on the bench for an hour with her bag open, anyone could take everything.',
      ),
      T(
        'Ma töötan siinsamas poes. Ta käis meilt õhtul veini ostmas.',
        'I work in the shop right here. She came in this evening to buy wine.',
      ),
    ],
    details: [
      T('Isik: {suspect}.', 'Subject: {suspect}.'),
      T(
        'Käekott on lahti, dokumendid ja rahakott on alles.',
        'The handbag is open; her documents and purse are still there.',
      ),
    ],
    beats: [qPerson('suspect', 'arrive'), soberChoiceF(), toSober(8, { chance: 0.6 })],
    outcomes: [
      oc(
        'sober',
        'resolved',
        [0.4, 1],
        3,
        T(
          'Naine toimetati ohu vältimiseks kainenema, tema asjad loendati ja anti hoiule.',
          'The woman was taken to sober up for her own safety; her belongings were listed and kept for her.',
        ),
      ),
      oc(
        'home',
        'resolved',
        [0.45, 1],
        2,
        T(
          'Naine äratati ja tütar tuli talle järele.',
          'The woman was woken and her daughter came to collect her.',
        ),
        { trust: 1 },
      ),
      oc(
        'hospital',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Naine ei reageerinud kõnetamisele, kiirabi toimetas ta alkoholimürgistuse kahtlusega haiglasse.',
          'The woman did not respond when spoken to and the ambulance took her to hospital with suspected alcohol poisoning.',
        ),
        { injuries: 1 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, meie poe ees pingil magab purjus naine ja tal on kott lahti.',
          'Hello, a drunk woman is asleep on the bench outside our shop and her bag is open.',
        ),
      ],
      openingRu: ['Здравствуйте, у нашего магазина на скамейке спит пьяная женщина, сумка открыта.'],
      answers: {
        injured: [
          T(
            'Ma ei näe vigastusi, ta lihtsalt magab sügavalt.',
            'I cannot see any injuries, she is just fast asleep.',
          ),
        ],
        intoxicated: [
          T('Jah, ta ostis õhtul kaks pudelit veini.', 'Yes, she bought two bottles of wine this evening.'),
        ],
        safe: [T('Ta on pingil, mitte sõiduteel.', 'She is on the bench, not on the road.')],
      },
    },
  },
  {
    id: 'not_drunk_diabetic',
    persons: [
      { role: 'suspect', gender: 'M', age: [35, 75], intoxicated: 0.02, record: 0.1 },
      { role: 'caller', gender: 'any', age: [18, 75] },
    ],
    summary: [
      T(
        '{address}. Teataja sõnul lamab maas segaduses mees, kes ei suuda rääkida. Alkoholilõhna teataja ei tunne.',
        '{address}. The caller says a confused man is lying on the ground and cannot speak. The caller cannot smell any alcohol.',
      ),
      T(
        '{address}. Mees istub kõnniteel, higistab ja vastab segaselt. Möödujad arvavad, et ta on purjus.',
        '{address}. A man is sitting on the pavement, sweating and answering incoherently. Passers-by think he is drunk.',
      ),
    ],
    callerLines: [
      T(
        'Ma arvasin, et ta on purjus, aga alkoholi lõhna ei ole. Ta higistab ja väriseb.',
        'I thought he was drunk, but there is no smell of alcohol. He is sweating and shaking.',
      ),
      T(
        'Ta pomiseb midagi suhkrust, ma ei saa aru.',
        'He is mumbling something about sugar, I cannot understand.',
      ),
    ],
    details: [
      T(
        'Isik: {suspect}. Teataja ei tunne alkoholilõhna.',
        'Subject: {suspect}. The caller cannot smell alcohol.',
      ),
      T(
        'Mehe käel on käevõru, millel on kiri "diabeet".',
        'The man is wearing a bracelet that says "diabetes".',
      ),
    ],
    agencies: [
      { agency: 'kiirabi', chance: 0.9, reason: T('Võimalik madal veresuhkur', 'Possible low blood sugar') },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: mees ei ole joobes, käel diabeedikäevõru. Tundub madal veresuhkur.',
          '{callsign}: the man is not drunk, he has a diabetes bracelet. Looks like low blood sugar.',
        ),
      ]),
      kiirabi(1, {
        radio: [
          T(
            '{callsign}: diabeetik on segaduses, kahtlus madalale veresuhkrule. Palun kiirabi kiiresti.',
            '{callsign}: a diabetic is confused, suspected low blood sugar. Ambulance urgently please.',
          ),
        ],
      }),
      qPerson('suspect', 4, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'helped',
        'resolved',
        [0.4, 1],
        3,
        T(
          'Selgus, et mees ei olnud joobes, vaid tal oli madal veresuhkur. Kiirabi abistas, mees toibus ja läks koju.',
          'It turned out the man was not drunk but had low blood sugar. The ambulance crew helped, he recovered and went home.',
        ),
        { trust: 2 },
      ),
      oc(
        'hospital',
        'hospital',
        [0.15, 0.6],
        2,
        T(
          'Mehe seisund oli raske ja kiirabi toimetas ta haiglasse. Lähedasi teavitati.',
          'The man’s condition was serious and the ambulance took him to hospital. His family was informed.',
        ),
      ),
      oc(
        'late',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Mees kaotas enne abi saabumist teadvuse ja toimetati intensiivravisse.',
          'The man lost consciousness before help arrived and was taken to intensive care.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, siin istub kõnniteel mees, kes on väga segaduses. Ma arvasin, et ta on purjus, aga alkoholi lõhna ei ole.',
          'Hello, a man is sitting on the pavement here and he is very confused. I thought he was drunk, but there is no smell of alcohol.',
        ),
      ],
      openingRu: [
        'Здравствуйте, тут на тротуаре сидит мужчина, совсем не в себе. Думал, пьяный, но алкоголем не пахнет.',
      ],
      answers: {
        intoxicated: [
          T(
            'Ei usu, alkoholi lõhna küll ei ole.',
            'I do not think so, there is definitely no smell of alcohol.',
          ),
        ],
        injured: [
          T(
            'Vigastusi ei näe, aga ta higistab ja on kahvatu.',
            'I cannot see injuries, but he is sweating and pale.',
          ),
        ],
      },
    },
    tags: ['medical'],
  },
];

// ── public_order_night_noise ────────────────────────────────────────────────
const SC_NIGHT_NOISE: IncidentScenario[] = [
  {
    id: 'yard_youth',
    summary: [
      T(
        '{address}. Noortekamp korraldab majade vahel valjuhäälseid pidusid ja rikub korduvalt öörahu. Muusika autost, karjumine.',
        '{address}. A group of young people keeps holding loud parties between the buildings and disturbing the night-time peace. Music from a car, shouting.',
      ),
      T(
        '{address}. Majade vahel hoovis istub {n} noort, vali muusika ja karjumine kestab juba kella 23-st. Teataja on naaber, ei soovi kohtuda.',
        '{address}. {n} young people are sitting in the yard between the buildings; loud music and shouting have been going on since 11 p.m. The caller is a neighbour and does not want to meet the patrol.',
      ),
    ],
    details: [
      T(
        'Noored on alkoholijoobes, osa võib olla alaealised.',
        'The young people are drunk and some may be minors.',
      ),
      T('Ühest autost mängib vali muusika.', 'Loud music is playing from one of the cars.'),
    ],
  },
  {
    id: 'karaoke_flat',
    title: T('Öörahu rikkumine: karaoke korteris', 'Night-time disturbance: karaoke in a flat'),
    persons: [
      {
        role: 'suspect',
        gender: 'any',
        age: [28, 60],
        intoxicated: 0.75,
        record: 0.1,
        relation: 'neighbour',
      },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naaberkorteris lauldakse juba kolmandat tundi karaoket, laulusõnad kostavad läbi seinte. Teataja on uksele koputanud, keegi ei ava.',
        '{address}. Karaoke has been going on in the flat next door for three hours and the lyrics can be heard through the walls. The caller knocked but nobody opens.',
      ),
      T(
        '{address}. Ülemisest korterist kostab öösel karaokemasin ja kooris laulmine. Naabrid ei saa magada.',
        '{address}. A karaoke machine and group singing are coming from the flat upstairs in the middle of the night. The neighbours cannot sleep.',
      ),
    ],
    callerLines: [
      T(
        'Nad laulavad juba kolmandat tundi karaoket, sama laulu kümnendat korda!',
        'They have been singing karaoke for three hours, the same song for the tenth time!',
      ),
      T(
        'Ma koputasin, aga muusika on nii vali, et keegi ei kuule.',
        'I knocked, but the music is so loud nobody can hear.',
      ),
    ],
    details: [
      T(
        'Teataja sõnul on korteris pidu umbes kümne inimesega.',
        'The caller says there is a party of about ten people in the flat.',
      ),
      T(
        'Sel kuul on sama korteri peale kaevatud kaks korda.',
        'There have been two complaints about the same flat this month.',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.6 }),
      noiseChoice([
        T(
          '{callsign}: peoperemees vabandab ja lubab karaokemasina välja lülitada. Hoiatus või protokoll?',
          '{callsign}: the host apologises and promises to switch off the karaoke machine. Warning or report?',
        ),
      ]),
    ],
    outcomes: noiseOutcomes(
      T(
        'Karaokemasin lülitati välja ja külalised hakkasid lahkuma. Peoperemehele tehti hoiatus.',
        'The karaoke machine was switched off and the guests started to leave. The host was given a warning.',
      ),
      T(
        'Peoperemehele koostati korduva öörahu rikkumise eest väärteoprotokoll.',
        'A misdemeanour report was drawn up against the host for repeatedly disturbing the night-time peace.',
      ),
      T(
        'Laulmine jätkus pärast patrulli lahkumist ja naabrid helistasid uuesti.',
        'The singing started again after the patrol left and the neighbours called again.',
      ),
    ),
    call: {
      mood: 'angry',
      opening: [
        T(
          'Kuulge, naabrid laulavad juba kolm tundi karaoket! Kell on üks öösel!',
          'Listen, the neighbours have been singing karaoke for three hours! It is one in the morning!',
        ),
      ],
      openingRu: ['Слушайте, соседи уже три часа поют караоке! Час ночи!'],
      answers: {
        count: [T('Hääli on palju, vist kümmekond inimest.', 'Lots of voices, maybe about ten people.')],
        intoxicated: [T('No kainelt nii ei laulda.', 'Well, nobody sings like that sober.')],
      },
    },
  },
  {
    id: 'renovation_at_night',
    title: T('Öörahu rikkumine: öine remont', 'Night-time disturbance: renovation at night'),
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 55], intoxicated: 0.2, relation: 'neighbour' },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naaber puurib ja taob öösel seina, remont käib kesköö paiku. Teataja ei saa magada.',
        '{address}. A neighbour is drilling and hammering the wall at night; renovation work around midnight. The caller cannot sleep.',
      ),
      T(
        '{address}. Korteris tehakse öösel remonti: puurimine ja haamrilöögid kostavad üle maja.',
        '{address}. Someone is renovating a flat at night: drilling and hammering can be heard all over the building.',
      ),
    ],
    callerLines: [
      T(
        'Kell on palju ja tema puurib! Käisin ütlemas, ta ütles, et tal on homme tähtaeg.',
        'It is late and he is drilling! I went to tell him and he said he has a deadline tomorrow.',
      ),
      T(
        'Iga öö sama lugu, päeval on ta tööl ja öösel teeb remonti.',
        'Every night the same story: he works in the day and renovates at night.',
      ),
    ],
    details: [
      T(
        'Remonditöid tehakse öörahu ajal korduvalt.',
        'The renovation work keeps happening during the night-time quiet hours.',
      ),
      T(
        'Korteriühistu esimees on samuti kaevanud.',
        'The chair of the housing association has complained too.',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.6 }),
      noiseChoice([
        T(
          '{callsign}: mees puurib vannitoas, ütleb, et plaatija tuleb hommikul. Hoiatus või protokoll?',
          '{callsign}: the man is drilling in the bathroom, says the tiler is coming in the morning. Warning or report?',
        ),
      ]),
    ],
    outcomes: noiseOutcomes(
      T(
        'Mees lõpetas tööd ja lubas jätkata alles hommikul. Talle tehti hoiatus.',
        'The man stopped work and promised not to carry on until the morning. He was given a warning.',
      ),
      T(
        'Korduva öörahu rikkumise eest koostati väärteoprotokoll.',
        'A misdemeanour report was drawn up for repeatedly disturbing the night-time peace.',
      ),
      T(
        'Puurimine algas pool tundi hiljem uuesti. Juhtum edastati korteriühistule ja omavalitsusele.',
        'The drilling started again half an hour later. The case was passed to the housing association and the municipality.',
      ),
    ),
    call: {
      mood: 'angry',
      opening: [
        T(
          'Tere. Naaber puurib öösel seina, ma ei suuda enam!',
          'Hello. My neighbour is drilling into the wall at night, I cannot take it any more!',
        ),
      ],
      openingRu: ['Здравствуйте. Сосед ночью сверлит стену, я больше не могу!'],
      answers: {
        count: [T('Ainult tema üksi.', 'Just him, on his own.')],
        intoxicated: [
          T('Ei tea, vist kaine. Lihtsalt hoolimatu.', 'I do not know, sober I think. Just inconsiderate.'),
        ],
      },
    },
  },
  {
    id: 'barking_dog',
    title: T('Öörahu rikkumine: koer haugub', 'Night-time disturbance: barking dog'),
    persons: [
      { role: 'suspect', gender: 'any', age: [25, 60], intoxicated: 0.05, relation: 'neighbour' },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naaberkorteris haugub ja ulub koer juba mitu tundi, omanikku pole kodus. Naabrid ei saa magada.',
        '{address}. A dog has been barking and howling in the flat next door for hours and the owner is not at home. The neighbours cannot sleep.',
      ),
      T(
        '{address}. Rõdule jäetud koer haugub öösel lakkamatult, teataja kardab, et loomaga on midagi juhtunud.',
        '{address}. A dog left on a balcony has been barking non-stop through the night; the caller fears something has happened to the animal.',
      ),
    ],
    callerLines: [
      T(
        'Koer on üksi ja ulub juba kolm tundi. Omanik ei vasta telefonile.',
        'The dog is alone and has been howling for three hours. The owner does not answer the phone.',
      ),
      T(
        'Ma kardan, et koer on rõdul külma käes ja ilma veeta.',
        'I am afraid the dog is out on the balcony in the cold without water.',
      ),
    ],
    details: [
      T(
        'Omanik on teadaolevalt reisil, koera toidab tavaliselt sõber.',
        'The owner is known to be travelling; a friend usually feeds the dog.',
      ),
      T(
        'Sama koera pärast on varem omavalitsusele kaevatud.',
        'There have been complaints about the same dog to the municipality before.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: koer on rõdul ja vett pole. Proovime omanikuga ühendust saada.',
          '{callsign}: the dog is on the balcony with no water. Trying to reach the owner.',
        ),
      ]),
      choice(
        4,
        [
          T(
            '{callsign}: omanik ei vasta. Kas kutsume päästjad rõdule või teavitame hommikul omavalitsust?',
            '{callsign}: the owner is not answering. Do we call rescue to get onto the balcony or inform the municipality in the morning?',
          ),
        ],
        [
          opt(
            'rescue',
            T('Kutsuge päästjad, loom vajab abi', 'Call rescue, the animal needs help'),
            T(
              '{callsign}, juhtimine. Päästjad on teel, koer viiakse hoiule.',
              '{callsign}, Control. Rescue is on the way; the dog will be taken into care.',
            ),
            { success: 0.1, time: 20 },
          ),
          opt(
            'notify',
            T('Teavitage omavalitsust', 'Inform the municipality'),
            T(
              '{callsign}, juhtimine. Pange kirja ja edastage omavalitsusele.',
              '{callsign}, Control. Note it down and pass it to the municipality.',
            ),
            { success: -0.05, time: 5 },
          ),
        ],
        'notify',
      ),
    ],
    outcomes: [
      oc(
        'friend',
        'resolved',
        [0.45, 1],
        3,
        T(
          'Omaniku sõber saadi kätte ja ta tuli koerale järele. Omanikule selgitati looma pidamise nõudeid.',
          'The owner’s friend was reached and came to collect the dog. The owner was told the rules on keeping animals.',
        ),
      ),
      oc(
        'shelter',
        'report',
        [0.2, 0.6],
        2,
        T(
          'Koer võeti varjupaika hoiule ja omaniku suhtes alustati väärteomenetlust looma hooletusse jätmise eest.',
          'The dog was taken into a shelter and misdemeanour proceedings were opened against the owner for neglecting it.',
        ),
      ),
      oc(
        'again',
        'warning',
        [0, 0.35],
        2,
        T(
          'Koer jäi rõdule ja haukumine jätkus. Juhtum edastati omavalitsusele.',
          'The dog stayed on the balcony and the barking went on. The case was passed to the municipality.',
        ),
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Naabri koer on üksi ja ulub juba kolm tundi, omanik ei vasta.',
          'Hello. My neighbour’s dog is alone and has been howling for three hours, the owner does not answer.',
        ),
      ],
      openingRu: ['Здравствуйте. Соседская собака одна и воет уже три часа, хозяин не отвечает.'],
      answers: {
        count: [T('Inimesi seal ei ole, ainult koer.', 'There are no people there, just the dog.')],
        weapons: [T('Ei, ei mingit relva. See on koer.', 'No, no weapon. It is a dog.')],
        intoxicated: [T('Kedagi seal ei ole, omanik on ära.', 'There is nobody there, the owner is away.')],
      },
    },
    tags: ['animal'],
  },
  {
    id: 'mopeds_in_yard',
    title: T('Öörahu rikkumine: mopeedid hoovis', 'Night-time disturbance: mopeds in the yard'),
    persons: [
      { role: 'suspect', gender: 'M', age: [15, 22], intoxicated: 0.3, record: 0.15, noLicense: 0.4 },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    vehicles: [{ role: 'suspect', kind: 'moped', driverRole: 'suspect', noInsurance: 0.3, stolen: 0.08 }],
    summary: [
      T(
        '{address}. Majade vahel sõidavad öösel mopeedid, summutita väljalasketorud põrisevad. Noored teevad ringe ümber maja.',
        '{address}. Mopeds are riding between the buildings at night with their silencers off. Young people are doing laps around the block.',
      ),
      T(
        '{address}. Mitu mopeedi kogunesid hoovi ja gaasitavad kesköö paiku, naabrid on ärkvel. Üks sõidab kõnniteel.',
        '{address}. Several mopeds have gathered in the yard and are revving around midnight; the neighbours are awake. One is riding on the pavement.',
      ),
    ],
    callerLines: [
      T(
        'Nad teevad mopeedidega ringe ümber maja ja gaasitavad, lapsed ärkasid üles.',
        'They are doing laps round the building on mopeds and revving, the kids woke up.',
      ),
      T(
        'Ühel pole numbrimärki ja nad sõidavad kõnniteel.',
        'One of them has no number plate and they are riding on the pavement.',
      ),
    ],
    details: [
      T('Noored sõidavad ilma kiivriteta.', 'The young riders have no helmets.'),
      T('Ühel mopeedil puudub numbrimärk.', 'One moped has no number plate.'),
    ],
    beats: [qVehicle('arrive'), qPerson('suspect', 3, { chance: 0.7 })],
    outcomes: [
      oc(
        'fine',
        'fine',
        [0.5, 1],
        3,
        T(
          'Mopeedijuhile koostati väärteoprotokoll öörahu rikkumise ja kiivrita sõitmise eest, alaealise vanemaid teavitati.',
          'A misdemeanour report was drawn up against the moped rider for disturbing the peace and riding without a helmet; the minor’s parents were informed.',
        ),
      ),
      oc(
        'warning',
        'warning',
        [0.25, 0.65],
        2,
        T(
          'Noored lõpetasid sõitmise ja lükkasid mopeedid koju. Neid hoiatati.',
          'The young people stopped riding and pushed their mopeds home. They were warned.',
        ),
      ),
      oc(
        'gone',
        'unfounded',
        [0, 0.35],
        2,
        T('Mopeedid sõitsid patrulli nähes laiali.', 'The mopeds scattered when they saw the patrol.'),
      ),
    ],
    call: {
      mood: 'angry',
      opening: [
        T(
          'Kuulge, hoovis sõidavad öösel mopeedid ja gaasitavad, keegi ei saa magada!',
          'Listen, mopeds are riding round the yard at night revving their engines, nobody can sleep!',
        ),
      ],
      openingRu: ['Слушайте, ночью во дворе гоняют мопеды и газуют, никто не может спать!'],
      answers: {
        count: [T('Neid on kolm või neli mopeedi.', 'There are three or four mopeds.')],
        vehicle: [T('Mopeedid, ühel pole numbrit.', 'Mopeds, one of them has no plate.')],
        intoxicated: [
          T(
            'Ei tea, nad on noored, võib-olla on joonud.',
            'I do not know, they are young, maybe they have been drinking.',
          ),
        ],
      },
    },
    tags: ['vehicle'],
  },
];

// ── public_order_noisy_birthday ─────────────────────────────────────────────
const SC_NOISY_BIRTHDAY: IncidentScenario[] = [
  {
    id: 'loud_music',
    summary: [
      T(
        '{address}. Majas peetakse sünnipäevapidu, mille muusika ja karjumine häirib naabreid.',
        '{address}. A birthday party in the building is disturbing the neighbours with music and shouting.',
      ),
      T(
        '{address}. Korteris on pidu kella 22-st, vali muusika ja trampimine, naabrid ei saa magada. Teataja ei soovi kohtuda.',
        '{address}. A party has been going on in a flat since 10 p.m. with loud music and stamping; the neighbours cannot sleep. The caller does not want to meet the patrol.',
      ),
    ],
    details: [
      T(
        'Naabrid on sama korteri peale sel kuul juba kaks korda kaevanud.',
        'The neighbours have already complained about the same flat twice this month.',
      ),
    ],
  },
  {
    id: 'live_band',
    title: T('Mürarikas juubel: bänd aias', 'Noisy anniversary party: band in the garden'),
    summary: [
      T(
        '{address}. Eramu aias peetakse juubelit elava muusikaga ja bänd mängib endiselt. Naabrid paluvad muusika vaiksemaks keerata.',
        '{address}. A big birthday party with live music is going on in a garden and the band is still playing. The neighbours ask for the music to be turned down.',
      ),
      T(
        '{address}. Juubelipeol mängib aias ansambel ja külalised laulavad kaasa, öörahu on ammu alanud.',
        '{address}. A band is playing in the garden at an anniversary party and the guests are singing along; the night-time quiet hours started long ago.',
      ),
    ],
    callerLines: [
      T(
        'Neil on aias terve bänd! Kell on palju ja trummid käivad ikka.',
        'They have a whole band in the garden! It is late and the drums are still going.',
      ),
      T(
        'Ma ei ole pahatahtlik, juubel on juubel, aga ma pean kell kuus tööle minema.',
        'I do not mean any harm, a big birthday is a big birthday, but I have to go to work at six.',
      ),
    ],
    details: [
      T('Peol on umbes nelikümmend külalist.', 'There are about forty guests at the party.'),
      T(
        'Pererahvas teatas naabritele peost ette, aga lubas lõpetada kesköö paiku.',
        'The hosts told the neighbours about the party in advance but promised to finish around midnight.',
      ),
    ],
    beats: [
      qPerson('suspect', 2, { chance: 0.4 }),
      choice(
        3,
        [
          T(
            '{callsign}: juubilar lubab bändi kohe ära saata ja muusika tuppa viia. Hoiatus või protokoll?',
            '{callsign}: the host promises to send the band home right away and move the music indoors. Warning or report?',
          ),
        ],
        [
          opt(
            'warn',
            T('Hoiatus', 'Warning'),
            T('{callsign}, juhtimine. Tehke hoiatus.', '{callsign}, Control. Give a warning.'),
            { success: 0.1, time: 5 },
          ),
          opt(
            'fine',
            T('Väärteoprotokoll', 'Misdemeanour report'),
            T('{callsign}, juhtimine. Vormistage protokoll.', '{callsign}, Control. Draw up a report.'),
            { success: 0.05, time: 15, trust: -1 },
          ),
        ],
        'warn',
      ),
    ],
    outcomes: [
      oc(
        'warning',
        'warning',
        [0.4, 1],
        3,
        T(
          'Bänd pakkis pillid kokku ja pidu kolis tuppa. Pererahvale tehti hoiatus.',
          'The band packed up its instruments and the party moved indoors. The hosts were given a warning.',
        ),
      ),
      oc(
        'fine',
        'fine',
        [0.5, 1],
        2,
        T(
          'Peo korraldajale koostati öörahu rikkumise eest väärteoprotokoll.',
          'A misdemeanour report was drawn up against the host for disturbing the night-time peace.',
        ),
      ),
      oc(
        'again',
        'warning',
        [0, 0.4],
        2,
        T(
          'Muusika algas pärast patrulli lahkumist uuesti ja naabrid helistasid jälle.',
          'The music started again after the patrol left and the neighbours called again.',
        ),
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Naabritel on juubel ja aias mängib bänd, kell on juba palju.',
          'Hello. The neighbours are having a big birthday party with a band playing in the garden, and it is already late.',
        ),
      ],
      openingRu: ['Здравствуйте. У соседей юбилей, в саду играет живая группа, а уже поздно.'],
      answers: {
        count: [T('Külalisi on palju, mitukümmend.', 'There are a lot of guests, several dozen.')],
        intoxicated: [
          T('Noh, juubel ikka. Kõik on lõbusad.', 'Well, it is a big birthday. Everyone is merry.'),
        ],
      },
    },
  },
  {
    id: 'sauna_party',
    title: T('Mürarikas sünnipäev: saunapidu', 'Noisy birthday: sauna party'),
    summary: [
      T(
        '{address}. Ridaelamu naaberboksis on saunapidu, külalised jooksevad karjudes aeda ja tagasi. Muusika kostab läbi seina.',
        '{address}. A sauna party is going on next door in a terraced house; guests keep running screaming into the garden and back. The music comes through the wall.',
      ),
      T(
        '{address}. Naabri sünnipäeval käiakse öösel saunas ja aias kisatakse. Teataja palub peolistel vaiksemalt olla.',
        '{address}. At the neighbour’s birthday party people are using the sauna at night and shrieking in the garden. The caller wants the guests to keep it down.',
      ),
    ],
    callerLines: [
      T(
        'Nad jooksevad saunast aeda ja kisavad, mõni on täiesti alasti. Mu lapsed vaatavad aknast.',
        'They run from the sauna into the garden screaming, some of them completely naked. My kids are watching from the window.',
      ),
      T(
        'Sein on õhuke, nende muusika on nagu meie toas.',
        'The wall is thin, their music sounds like it is in our room.',
      ),
    ],
    details: [
      T('Peol on umbes viisteist külalist.', 'There are about fifteen guests at the party.'),
      T('Naabrid on ridaelamus ühise seinaga.', 'The neighbours share a wall in the terraced house.'),
    ],
    beats: [
      qPerson('suspect', 2, { chance: 0.5 }),
      choice(
        3,
        [
          T(
            '{callsign}: sünnipäevalaps vabandab, saunapidu lõpetatakse. Hoiatus või protokoll?',
            '{callsign}: the birthday host apologises and the sauna party is being wrapped up. Warning or report?',
          ),
        ],
        [
          opt(
            'warn',
            T('Hoiatus', 'Warning'),
            T('{callsign}, juhtimine. Tehke hoiatus.', '{callsign}, Control. Give a warning.'),
            { success: 0.1, time: 5 },
          ),
          opt(
            'fine',
            T('Väärteoprotokoll', 'Misdemeanour report'),
            T('{callsign}, juhtimine. Vormistage protokoll.', '{callsign}, Control. Draw up a report.'),
            { success: 0.05, time: 15 },
          ),
        ],
        'warn',
      ),
    ],
    outcomes: [
      oc(
        'warning',
        'warning',
        [0.4, 1],
        3,
        T(
          'Saunapidu lõpetati ja külalised läksid tuppa. Peoperemehele tehti hoiatus.',
          'The sauna party was ended and the guests went inside. The host was given a warning.',
        ),
      ),
      oc(
        'fine',
        'fine',
        [0.5, 1],
        2,
        T(
          'Peoperemehele koostati öörahu rikkumise eest väärteoprotokoll.',
          'A misdemeanour report was drawn up against the host for disturbing the night-time peace.',
        ),
      ),
      oc(
        'again',
        'warning',
        [0, 0.4],
        2,
        T(
          'Kisa jätkus aias ka pärast patrulli lahkumist.',
          'The shrieking in the garden carried on after the patrol left.',
        ),
      ),
    ],
    call: {
      mood: 'angry',
      opening: [
        T(
          'Kuulge, naabritel on saunapidu ja nad kisavad aias, kell on palju!',
          'Listen, the neighbours are having a sauna party and screaming in the garden, it is late!',
        ),
      ],
      openingRu: ['Слушайте, у соседей баня с вечеринкой, орут в саду, а уже поздно!'],
      answers: {
        count: [T('Viisteist inimest vähemalt.', 'At least fifteen people.')],
        children: [T('Minu lapsed on kodus ja ei saa magada.', 'My children are at home and cannot sleep.')],
      },
    },
  },
  {
    id: 'newborn_next_door',
    title: T('Mürarikas sünnipäev: beebi ei saa magada', 'Noisy birthday: the baby cannot sleep'),
    persons: [
      { role: 'suspect', gender: 'any', age: [20, 45], intoxicated: 0.7, relation: 'neighbour' },
      { role: 'caller', gender: 'F', age: [24, 40], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Teataja, kellel on kodus vastsündinu, palub naabritel sünnipäevapidu vaiksemaks keerata. Muusika ja naer kostavad läbi seina.',
        '{address}. A caller with a newborn at home asks the neighbours to turn down their birthday party. Music and laughter come through the wall.',
      ),
      T(
        '{address}. Väikelapsega pere kaebab: seina taga peetakse sünnipäeva ja beebi ärkab iga paari minuti järel.',
        '{address}. A family with a baby complains: there is a birthday party behind the wall and the baby wakes up every few minutes.',
      ),
    ],
    callerLines: [
      T(
        'Mu beebi on kolm nädalat vana ja ärkab iga kord, kui nad naeru pahvatavad.',
        'My baby is three weeks old and wakes up every time they burst out laughing.',
      ),
      T(
        'Ma käisin palumas, nad lubasid vaiksemalt, aga pool tundi hiljem oli sama lugu.',
        'I went and asked, they promised to be quieter, but half an hour later it was the same again.',
      ),
    ],
    details: [
      T('Teataja on korra juba ise uksel käinud.', 'The caller has already been to their door once herself.'),
      T('Peol on noored, umbes kümme inimest.', 'The party is young people, about ten of them.'),
    ],
    beats: [
      qPerson('suspect', 2, { chance: 0.5 }),
      choice(
        3,
        [
          T(
            '{callsign}: noored lubavad muusika vaiksemaks keerata, aga teataja on juba korra palunud. Hoiatus või protokoll?',
            '{callsign}: the young people promise to turn the music down, but the caller had already asked once. Warning or report?',
          ),
        ],
        [
          opt(
            'warn',
            T('Hoiatus', 'Warning'),
            T('{callsign}, juhtimine. Tehke hoiatus.', '{callsign}, Control. Give a warning.'),
            { success: 0.05, time: 5 },
          ),
          opt(
            'fine',
            T('Väärteoprotokoll', 'Misdemeanour report'),
            T('{callsign}, juhtimine. Vormistage protokoll.', '{callsign}, Control. Draw up a report.'),
            { success: 0.1, time: 15 },
          ),
        ],
        'fine',
      ),
    ],
    outcomes: [
      oc(
        'warning',
        'warning',
        [0.4, 1],
        3,
        T(
          'Peolised keerasid muusika vaikseks ja kolisid pidu jätkama linna. Neile tehti hoiatus.',
          'The party-goers turned the music off and moved on to carry on in town. They were given a warning.',
        ),
      ),
      oc(
        'fine',
        'fine',
        [0.5, 1],
        2,
        T(
          'Korteri üürnikule koostati öörahu rikkumise eest väärteoprotokoll.',
          'A misdemeanour report was drawn up against the tenant for disturbing the night-time peace.',
        ),
      ),
      oc(
        'again',
        'warning',
        [0, 0.4],
        2,
        T(
          'Pidu jätkus ja väikelapsega pere helistas uuesti.',
          'The party carried on and the family with the baby called again.',
        ),
      ),
    ],
    call: {
      mood: 'angry',
      opening: [
        T(
          'Tere. Mul on kodus kolmenädalane beebi ja naabritel on sünnipäevapidu. Ta ei saa üldse magada.',
          'Hello. I have a three-week-old baby at home and the neighbours are having a birthday party. He cannot sleep at all.',
        ),
      ],
      openingRu: [
        'Здравствуйте. У меня дома трёхнедельный малыш, а у соседей день рождения. Он совсем не может спать.',
      ],
      answers: {
        children: [T('Minu beebi on kodus, kolm nädalat vana.', 'My baby is at home, three weeks old.')],
        count: [T('Kümmekond noort, ma arvan.', 'About ten young people, I think.')],
      },
    },
  },
];

// ── public_order_bar_troublemaker ───────────────────────────────────────────
const SC_BAR_TROUBLEMAKER: IncidentScenario[] = [
  {
    id: 'refuses_to_leave',
    summary: [
      T(
        '{address}. Klient keeldub baarist lahkumast, on agressiivne ja ähvardab töötajaid.',
        '{address}. A customer refuses to leave the bar, is aggressive and threatening staff.',
      ),
      T(
        '{address}. Turvatöötaja ei lase joobes klienti tagasi sisse, mees seisab ukse ees ja ähvardab töötajaid.',
        '{address}. The doorman will not let a drunk customer back in; the man is standing at the door threatening staff.',
      ),
    ],
    details: [
      T('Korrarikkuja: {suspect}, tugevas joobes.', 'The troublemaker: {suspect}, heavily intoxicated.'),
      T(
        'Ukse ees on teisi kliente, kes on hakanud temaga sõnelema.',
        'Other customers outside the door have started arguing with him.',
      ),
    ],
  },
  {
    id: 'smashed_glasses_bill',
    title: T('Korrarikkuja baaris: arve maksmata', 'Troublemaker in a bar: bill unpaid'),
    summary: [
      T(
        '{address}. Baaris lõhkus joobes klient klaase, sõimab baarmeni ja keeldub arvet maksmast.',
        '{address}. A drunk customer in a bar smashed glasses, is swearing at the bartender and refuses to pay the bill.',
      ),
      T(
        '{address}. Joobes klient lõi leti ääres õllekannud puruks ja keeldub umbes 60-eurost arvet maksmast.',
        '{address}. A drunk customer smashed beer glasses at the bar and refuses to pay a bill of about 60 euros.',
      ),
    ],
    callerLines: [
      T(
        'Ta jõi terve õhtu ja nüüd ütleb, et ei maksa sentigi. Kaks klaasi on puruks visatud.',
        'He drank all evening and now says he will not pay a cent. Two glasses have been smashed.',
      ),
      T(
        'Ma ei saa teda ise välja visata, ta on kaks korda suurem kui mina.',
        'I cannot throw him out myself, he is twice my size.',
      ),
    ],
    details: [
      T(
        'Korrarikkuja: {suspect}. Arve umbes 60 eurot.',
        'The troublemaker: {suspect}. The bill is about 60 euros.',
      ),
      T(
        'Lõhutud klaasid on leti ääres, valvekaamera salvestab.',
        'The broken glasses are by the bar and the CCTV is recording.',
      ),
    ],
    call: {
      mood: 'angry',
      opening: [
        T(
          'Tere, baarist helistan. Klient lõhkus klaasid ja ei maksa arvet.',
          'Hello, I am calling from the bar. A customer smashed glasses and will not pay his bill.',
        ),
      ],
      openingRu: ['Здравствуйте, звоню из бара. Клиент разбил бокалы и не платит по счёту.'],
      answers: {
        weapons: [T('Ei, relva tal ei ole.', 'No, he does not have a weapon.')],
        intoxicated: [T('Väga purjus.', 'Very drunk.')],
        injured: [T('Keegi viga ei saanud, ainult klaasid.', 'Nobody is hurt, just the glasses.')],
      },
    },
  },
  {
    id: 'karaoke_microphone',
    title: T('Korrarikkuja karaokebaaris', 'Troublemaker in a karaoke bar'),
    summary: [
      T(
        '{address}. Karaokebaaris haaras joobes klient mikrofoni, keeldub seda andmast ja tõukas teist klienti. Töötajad ei saa temaga hakkama.',
        '{address}. In a karaoke bar a drunk customer grabbed the microphone, refuses to hand it over and shoved another customer. Staff cannot handle him.',
      ),
      T(
        '{address}. Karaokebaari klient on juba tund aega laval, ei lase teisi laulda ja sõimab neid. Algas tõuklemine.',
        '{address}. A karaoke bar customer has been on the stage for an hour, will not let anyone else sing and is swearing at them. Pushing has started.',
      ),
    ],
    callerLines: [
      T(
        'Ta ei anna mikrofoni ära ja lükkas just ühe tüdruku lavalt maha.',
        'He will not give up the microphone and just pushed a girl off the stage.',
      ),
      T(
        'Teised kliendid on juba vihased, kardan, et läheb kakluseks.',
        'The other customers are angry already, I am afraid it will turn into a fight.',
      ),
    ],
    details: [
      T('Korrarikkuja: {suspect}, tugevas joobes.', 'The troublemaker: {suspect}, heavily intoxicated.'),
      T(
        'Tõugatud klient sai kergelt haiget, kiirabi ta ei vaja.',
        'The customer who was shoved is slightly hurt but does not need an ambulance.',
      ),
    ],
    call: {
      mood: 'angry',
      opening: [
        T(
          'Tere, karaokebaarist. Üks klient ei anna mikrofoni ära ja tõukab inimesi!',
          'Hello, karaoke bar here. A customer will not give up the microphone and is shoving people!',
        ),
      ],
      openingRu: ['Здравствуйте, это караоке-бар. Клиент не отдаёт микрофон и толкает людей!'],
      answers: {
        injured: [
          T('Üks tüdruk kukkus lavalt, aga ta on korras.', 'A girl fell off the stage, but she is fine.'),
        ],
        intoxicated: [T('Täiesti purjus.', 'Completely drunk.')],
      },
    },
  },
  {
    id: 'harassing_women',
    title: T('Korrarikkuja baaris ahistab kliente', 'Troublemaker in a bar harassing customers'),
    summary: [
      T(
        '{address}. Baaris ahistab joobes mees naiskliente, katsub neid ega lahku. Teenindaja palub abi.',
        '{address}. A drunk man in a bar is harassing women, touching them, and will not leave. A server is asking for help.',
      ),
      T(
        '{address}. Joobes klient tüütab baaris noori naisi, haaras ühe käest kinni ja ei lase lahti. Turvatöötaja on juures.',
        '{address}. A drunk customer is pestering young women in a bar, grabbed one of them by the arm and will not let go. The doorman is with them.',
      ),
    ],
    callerLines: [
      T(
        'Ta katsub kõiki naisi, kes temast mööda lähevad. Me palusime tal lahkuda, aga ta naerab.',
        'He touches every woman who walks past him. We asked him to leave, but he just laughs.',
      ),
      T(
        'Üks tüdruk nutab tualetis, ta ei julge välja tulla.',
        'One girl is crying in the toilets, she does not dare come out.',
      ),
    ],
    details: [
      T('Korrarikkuja: {suspect}.', 'The troublemaker: {suspect}.'),
      T(
        'Kannatanud on kaks noort naist, kes on nõus seletusi andma.',
        'Two young women were affected and are willing to give statements.',
      ),
    ],
    call: {
      mood: 'angry',
      opening: [
        T(
          'Tere, baarist. Üks purjus mees ahistab naisi ja ei lahku.',
          'Hello, from the bar. A drunk man is harassing women and will not leave.',
        ),
      ],
      openingRu: ['Здравствуйте, из бара. Пьяный мужчина пристаёт к женщинам и не уходит.'],
      answers: {
        injured: [
          T(
            'Füüsiliselt mitte, aga üks tüdruk on väga ehmunud.',
            'Not physically, but one girl is very shaken.',
          ),
        ],
        intoxicated: [T('Jah, väga purjus.', 'Yes, very drunk.')],
        count: [T('Üks mees, ta on üksi.', 'One man, he is on his own.')],
      },
    },
  },
];

// ── public_order_drunk_harassing ────────────────────────────────────────────
const SC_DRUNK_HARASSING: IncidentScenario[] = [
  {
    id: 'grabbing_passers',
    summary: [
      T(
        '{address}. Joobes mees tülitseb möödujatega, sõimab ja kisub riietest. Liigub {direction}.',
        '{address}. A drunk man is picking fights with passers-by, swearing and pulling at their clothes. He is heading {direction}.',
      ),
      T(
        '{address}. Joobes mees haarab möödujatel käest ja karjub neile näkku. Inimesed lähevad teisele poole tänavat.',
        '{address}. A drunk man is grabbing passers-by by the arm and shouting in their faces. People are crossing to the other side of the street.',
      ),
    ],
    callerLines: [
      T(
        'Üks purjus mees haarab inimestel käest kinni ja karjub. Ta hirmutas mu last.',
        'A drunk man is grabbing people by the arm and shouting. He frightened my child.',
      ),
      T(
        'Ta kisub inimesi varrukast ja nõuab, et nad temaga räägiksid.',
        'He is tugging people by the sleeve and demanding that they talk to him.',
      ),
    ],
    details: [
      T('Isik: {suspect}.', 'Subject: {suspect}.'),
      T(
        'Mees liigub jalgsi ja peatub iga mööduja juures.',
        'The man is on foot and stops at every passer-by.',
      ),
    ],
  },
  {
    id: 'mall_begging',
    summary: [
      T(
        '{address}. Kaubanduskeskuse ees ahistab joobes isik inimesi, nõuab raha ja sigarette.',
        '{address}. A drunk person outside a shopping centre is pestering people and demanding money and cigarettes.',
      ),
      T(
        '{address}. Joobes mees seisab kaubanduskeskuse ukse juures, nõuab sissetulijatelt raha ja sülitab neile järele.',
        '{address}. A drunk man is standing by the shopping centre door demanding money from people going in and spitting after them.',
      ),
    ],
    callerLines: [
      T(
        'Ta sülitas mulle järele, kui ma raha ei andnud.',
        'He spat after me when I would not give him money.',
      ),
      T(
        'Ta seisab ukse juures ja keegi ei julge mööda minna.',
        'He is standing by the door and nobody dares walk past.',
      ),
    ],
    details: [
      T('Isik: {suspect}.', 'Subject: {suspect}.'),
      T(
        'Keskuse turvatöötaja on mehe juba korra välja saatnud.',
        'The centre’s security guard has already sent him out once.',
      ),
    ],
  },
  {
    id: 'bus_passenger',
    title: T('Joobes reisija ahistab bussis', 'Drunk passenger harassing people on a bus'),
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 60], intoxicated: 0.9, record: 0.4, wanted: 0.04 },
      { role: 'caller', gender: 'any', age: [25, 63], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Bussijuht teatab, et joobes reisija sõimab teisi reisijaid ega lahku bussist. Buss seisab peatuses.',
        '{address}. A bus driver reports a drunk passenger swearing at other passengers and refusing to get off. The bus is waiting at the stop.',
      ),
      T(
        '{address}. Liinibuss seisab peatuses: joobes mees tülitseb reisijatega ja lõi rusikaga vastu akent. Juht palub abi.',
        '{address}. A bus is stopped at a stop: a drunk man is arguing with passengers and punched a window. The driver is asking for help.',
      ),
    ],
    callerLines: [
      T(
        'Ma olen bussijuht. Üks purjus mees karjub reisijate peale ja ei lähe maha.',
        'I am the bus driver. A drunk man is shouting at the passengers and will not get off.',
      ),
      T(
        'Ma panin uksed lahti ja ootan, aga ta ei liigu. Reisijad on hirmul.',
        'I have opened the doors and I am waiting, but he will not move. The passengers are scared.',
      ),
    ],
    details: [
      T('Isik: {suspect}.', 'Subject: {suspect}.'),
      T('Buss on peatuses, liiklusgraafik hilineb.', 'The bus is at the stop and running behind schedule.'),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, bussijuht helistab. Mul on bussis purjus reisija, kes sõimab teisi ega lähe maha.',
          'Hello, this is a bus driver. I have a drunk passenger on board who is swearing at people and will not get off.',
        ),
      ],
      openingRu: ['Здравствуйте, водитель автобуса. У меня в салоне пьяный пассажир, ругается и не выходит.'],
      answers: {
        where: [T('Buss seisab peatuses, {address}.', 'The bus is at the stop, {address}.')],
        weapons: [T('Ei näe relva.', 'I cannot see a weapon.')],
        safe: [T('Ma olen kabiinis, uks on kinni.', 'I am in the cab with the door shut.')],
        count: [
          T(
            'Üks mees, bussis on veel kümmekond reisijat.',
            'One man, and about ten other passengers on board.',
          ),
        ],
      },
    },
  },
  {
    id: 'following_woman',
    title: T('Joobes mees jälitab naist', 'Drunk man following a woman'),
    persons: [
      { role: 'suspect', gender: 'M', age: [22, 60], intoxicated: 0.9, record: 0.4 },
      { role: 'caller', gender: 'F', age: [18, 35] },
    ],
    summary: [
      T(
        '{address}. Noor naine teatab, et joobes mees kõnnib tema järel, teeb märkusi ega jäta teda rahule.',
        '{address}. A young woman reports a drunk man is walking after her, making remarks and will not leave her alone.',
      ),
      T(
        '{address}. Teataja kõnnib koju, võõras joobes mees järgneb talle juba mitu tänavat ja üritab käest haarata.',
        '{address}. The caller is walking home and a drunk stranger has been following her for several streets, trying to grab her hand.',
      ),
    ],
    callerLines: [
      T(
        'Ta kõnnib mu järel juba mitu tänavat ja räägib jäledusi. Ma kardan koju minna, ta näeb, kus ma elan.',
        'He has been walking after me for several streets saying disgusting things. I am afraid to go home, he will see where I live.',
      ),
      T(
        'Ma läksin poodi sisse, aga ta ootab ukse taga.',
        'I went into a shop, but he is waiting outside the door.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}.', 'Suspect: {suspect}.'),
      T('Teataja on kaupluses ja jääb liinile.', 'The caller is inside a shop and is staying on the line.'),
    ],
    call: {
      mood: 'whisper',
      opening: [
        T(
          '(vaikselt) Tere... üks purjus mees jälitab mind, ma olen praegu poes.',
          '(quietly) Hello... a drunk man is following me, I am in a shop right now.',
        ),
      ],
      openingRu: ['(тихо) Алло... за мной идёт пьяный мужчина, я сейчас в магазине.'],
      answers: {
        safe: [
          T(
            'Ma olen poes müüja juures. Tema on ukse taga.',
            'I am in the shop with the cashier. He is outside the door.',
          ),
        ],
        direction: [T('Ta seisab poe ukse taga.', 'He is standing outside the shop door.')],
        weapons: [T('Relva ma ei näinud.', 'I did not see a weapon.')],
      },
    },
  },
];

// ── public_order_public_drinking ────────────────────────────────────────────
const SC_PUBLIC_DRINKING: IncidentScenario[] = [
  {
    id: 'park_bench',
    summary: [
      T(
        '{address}. Pargipingil tarvitab seltskond alkoholi, prügi on maas. Teataja palub reageerida.',
        '{address}. A group is drinking on a park bench with litter on the ground. The caller asks for someone to deal with it.',
      ),
      T(
        '{address}. Pargis istub igapäevane joomaseltskond, pingi ümber on tühjad pudelid ja suitsukonid.',
        '{address}. The usual drinking crowd is sitting in the park, with empty bottles and cigarette ends around the bench.',
      ),
    ],
    callerLines: [
      T(
        'Iga päev istuvad nad siin pingil ja joovad, keegi ei julge mööda minna.',
        'Every day they sit here on the bench drinking and nobody dares walk past.',
      ),
      T(
        'Prügi jätavad nad kõik maha, pudelid on põõsastes.',
        'They leave all their rubbish behind, the bottles are in the bushes.',
      ),
    ],
    details: [
      T('Seltskonnas on {n} inimest.', 'There are {n} people in the group.'),
      T(
        'Sama seltskonna peale on kaevatud ka varem.',
        'There have been complaints about the same group before.',
      ),
    ],
  },
  {
    id: 'playground',
    summary: [
      T(
        '{address}. Laste mänguväljaku kõrval joovad kolm meest õlut ja ropendavad.',
        '{address}. Three men are drinking beer next to a children’s playground and swearing.',
      ),
      T(
        '{address}. Mänguväljaku liivakasti serval istuvad mehed õllepurkidega, lapsevanemad viisid lapsed ära.',
        '{address}. Men with beer cans are sitting on the edge of the playground sandpit and the parents have taken their children away.',
      ),
    ],
    callerLines: [
      T(
        'Nad istuvad otse mänguväljakul ja joovad, lapsed ei saa mängida.',
        'They are sitting right in the playground drinking, the children cannot play.',
      ),
      T(
        'Nad on purjus ja kusevad põõsasse, see on vastik.',
        'They are drunk and peeing in the bushes, it is disgusting.',
      ),
    ],
    details: [
      T('Seltskonnas on {n} meest.', 'There are {n} men in the group.'),
      T(
        'Mänguväljakul on tavaliselt õhtuti lapsi.',
        'There are usually children in the playground in the evening.',
      ),
    ],
  },
  {
    id: 'bus_stop_vodka',
    title: T('Alkoholi tarbimine bussipeatuses', 'Drinking at a bus stop'),
    summary: [
      T(
        '{address}. Bussipeatuses joovad kaks meest viina, ootajad hoiavad eemale. Üks urineeris ootepaviljoni taha.',
        '{address}. Two men are drinking vodka at a bus stop and people waiting are keeping their distance. One urinated behind the shelter.',
      ),
      T(
        '{address}. Ootepaviljonis joovad mehed pudelist kordamööda ja kõnetavad bussiootajaid.',
        '{address}. Men in the bus shelter are taking turns drinking from a bottle and accosting people waiting for the bus.',
      ),
    ],
    callerLines: [
      T(
        'Nad joovad ootepaviljonis viina otse pudelist ja räägivad inimestega, keegi ei taha sinna minna.',
        'They are drinking vodka straight from the bottle in the shelter and talking to people, nobody wants to go in there.',
      ),
      T(
        'Ma ootan siin bussi koos lapsega ja pean vihma käes seisma.',
        'I am waiting for the bus here with my child and have to stand in the rain.',
      ),
    ],
    details: [
      T('Isik: {suspect}.', 'Subject: {suspect}.'),
      T('Bussipeatus on kooli lähedal.', 'The bus stop is near a school.'),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Bussipeatuses joovad kaks meest viina ja tülitavad inimesi.',
          'Hello. Two men are drinking vodka at the bus stop and bothering people.',
        ),
      ],
      openingRu: ['Здравствуйте. На остановке двое мужчин пьют водку и пристают к людям.'],
      answers: {
        count: [T('Kaks meest.', 'Two men.')],
        intoxicated: [T('Jah, päris purjus juba.', 'Yes, pretty drunk already.')],
      },
    },
  },
  {
    id: 'teens_cider',
    title: T('Alaealised joovad avalikus kohas', 'Minors drinking in public'),
    persons: [
      { role: 'suspect', gender: 'any', age: [14, 17], intoxicated: 0.8, record: 0.05 },
      { role: 'caller', gender: 'any', age: [25, 80] },
    ],
    summary: [
      T(
        '{address}. Teataja nägi, kuidas umbes 14-aastased noored joovad siidrit ja üks on juba väga purjus.',
        '{address}. The caller saw young people of about 14 drinking cider; one of them is already very drunk.',
      ),
      T(
        '{address}. Grupp teismelisi joob alkoholi, üks oksendab põõsas. Teataja kardab, et noorel on alkoholimürgistus.',
        '{address}. A group of teenagers is drinking alcohol and one is throwing up in the bushes. The caller fears the teenager has alcohol poisoning.',
      ),
    ],
    callerLines: [
      T(
        'Nad on päris lapsed veel ja joovad siidrit. Üks ei seisa enam püsti.',
        'They are still just kids and they are drinking cider. One of them cannot stand up any more.',
      ),
      T(
        'Ma küsisin, kus nende vanemad on, nad naersid mu välja.',
        'I asked where their parents were and they laughed at me.',
      ),
    ],
    details: [
      T('Noored on alaealised, umbes viiekesi.', 'The young people are minors, about five of them.'),
      T('Üks noortest on tugevas joobes.', 'One of them is heavily drunk.'),
    ],
    agencies: [
      {
        agency: 'kiirabi',
        chance: 0.4,
        reason: T('Alaealisel võimalik alkoholimürgistus', 'Possible alcohol poisoning in a minor'),
      },
    ],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.8 }),
      choice(
        4,
        [
          T(
            '{callsign}: viis alaealist, üks tugevas joobes. Kas viime nad koju vanematele või kutsume vanemad siia?',
            '{callsign}: five minors, one heavily drunk. Do we take them home to their parents or call the parents here?',
          ),
        ],
        [
          opt(
            'home',
            T('Viige koju vanematele', 'Take them home to their parents'),
            T(
              '{callsign}, juhtimine. Viige noored koju ja rääkige vanematega.',
              '{callsign}, Control. Take the kids home and talk to the parents.',
            ),
            { success: 0.1, time: 20 },
          ),
          opt(
            'parents',
            T('Kutsuge vanemad kohale', 'Call the parents here'),
            T(
              '{callsign}, juhtimine. Helistage vanematele, oodake nendega.',
              '{callsign}, Control. Phone the parents and wait with the kids.',
            ),
            { success: 0.05, time: 15 },
          ),
        ],
        'parents',
      ),
    ],
    outcomes: [
      oc(
        'parents',
        'referred',
        [0.45, 1],
        3,
        T(
          'Noored anti vanemate hoole alla ja alkohol valati välja. Juhtum edastati alaealiste juhtumikorraldajale ja kaubandusjärelevalvele müüja kindlakstegemiseks.',
          'The young people were handed over to their parents and the alcohol was poured away. The case was passed to the juvenile case manager and to trade supervision to find out who sold it.',
        ),
        { trust: 1 },
      ),
      oc(
        'hospital',
        'hospital',
        [0.15, 0.6],
        2,
        T(
          'Kõige purjus noor toimetati kiirabiga haiglasse, teised anti vanematele üle.',
          'The drunkest teenager was taken to hospital by ambulance and the others were handed to their parents.',
        ),
      ),
      oc(
        'gone',
        'unfounded',
        [0, 0.35],
        2,
        T('Noored jooksid patrulli nähes laiali.', 'The teenagers scattered when they saw the patrol.'),
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Siin joovad päris noored lapsed siidrit ja üks on täitsa purjus.',
          'Hello. Some really young kids are drinking cider here and one of them is completely drunk.',
        ),
      ],
      openingRu: ['Здравствуйте. Тут совсем молодые ребята пьют сидр, один уже совсем пьяный.'],
      answers: {
        count: [T('Viis või kuus noort.', 'Five or six kids.')],
        children: [
          T('Nad ise on lapsed, umbes neljateistkümnesed.', 'They are children themselves, about fourteen.'),
        ],
        injured: [T('Üks oksendab, teised on korras.', 'One is throwing up, the others are fine.')],
      },
    },
    tags: ['youth'],
  },
];

// ── public_order_aggressive_customer ────────────────────────────────────────
const SC_AGGRESSIVE_CUSTOMER: IncidentScenario[] = [
  {
    id: 'thrown_goods',
    summary: [
      T(
        '{address}. Kaupluses sõimab klient kassapidajat, viskas kaupa põrandale ja keeldub lahkumast. Turvatöötaja on juures.',
        '{address}. A customer in a shop is swearing at the cashier, has thrown goods on the floor and refuses to leave. A security guard is present.',
      ),
      T(
        '{address}. Klient loopis kassa juures kaupa ja karjub järjekorras seisjate peale. Ta ei lahku, kuigi turvatöötaja palub.',
        '{address}. A customer has been throwing goods around at the till and shouting at the people queuing. He will not leave although the guard has asked him to.',
      ),
    ],
    callerLines: [
      T(
        'Siin poes on üks mees täiesti endast väljas, ta viskas pudeli vastu kassat!',
        'There is a man in the shop who has completely lost it, he threw a bottle at the till!',
      ),
      T(
        'Turvamees on tema juures, aga mees ei kuula kedagi.',
        'The guard is with him, but the man will not listen to anyone.',
      ),
    ],
    details: [
      T('Klient: {suspect}.', 'The customer: {suspect}.'),
      T('Kõik on valvekaamera salvestisel.', 'Everything is on the CCTV recording.'),
    ],
    call: {
      mood: 'angry',
      opening: [
        T(
          'Siin poes on klient, kes loobib kaupa ja ei lähe minema. Saatke kohe keegi!',
          'There is a customer in the shop throwing goods around who will not leave. Send someone now!',
        ),
      ],
      openingRu: ['Тут в магазине клиент швыряет товар и не уходит. Пришлите кого-нибудь!'],
      answers: {
        injured: [
          T('Keegi viga ei saanud, aga kassapidaja on hirmul.', 'Nobody is hurt, but the cashier is scared.'),
        ],
        weapons: [T('Relva ei ole, ta viskas pudeli.', 'No weapon, he threw a bottle.')],
      },
    },
  },
  {
    id: 'refused_alcohol',
    summary: [
      T(
        '{address}. Joobes klient ründas müüjat, kui talle alkoholi ei müüdud. Mees on veel poes.',
        '{address}. A drunk customer attacked the cashier when he was refused alcohol. The man is still in the shop.',
      ),
      T(
        '{address}. Müüja keeldus pärast kella kümmet alkoholi müümast ja klient lõi teda üle leti. Mees on poes ja karjub.',
        '{address}. The cashier refused to sell alcohol after 10 p.m. and the customer hit her across the counter. The man is in the shop shouting.',
      ),
    ],
    callerLines: [
      T(
        'Ta lõi mind, kui ma ütlesin, et pärast kella kümmet alkoholi ei müüda.',
        'He hit me when I said we do not sell alcohol after ten.',
      ),
      T(
        'Ta seisab ikka veel kassa juures ja nõuab oma viina.',
        'He is still standing at the till demanding his vodka.',
      ),
    ],
    details: [
      T('Klient: {suspect}. Tugevas joobes.', 'The customer: {suspect}. Heavily intoxicated.'),
      T(
        'Müüjal on punane põsk, kiirabi ta ei soovi.',
        'The cashier has a red cheek and does not want an ambulance.',
      ),
    ],
  },
  {
    id: 'refund_rage',
    title: T('Poes agressiivne klient: tagastus', 'Aggressive customer in a shop: a refund'),
    persons: [
      { role: 'suspect', gender: 'any', age: [25, 65], intoxicated: 0.1, record: 0.2 },
      { role: 'caller', gender: 'any', age: [18, 60], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Klient nõuab kaubale raha tagasi, karjub müüja peale ja lõi rusikaga vastu letti. Järjekord on hirmul.',
        '{address}. A customer is demanding a refund, shouting at the shop assistant and punched the counter. The queue is frightened.',
      ),
      T(
        '{address}. Tagastusleti juures ähvardab klient müüjat, kuna kassatšekita kaupa tagasi ei võeta. Klient filmib müüjat telefoniga.',
        '{address}. At the returns desk a customer is threatening the assistant because goods without a receipt cannot be returned. The customer is filming the assistant with a phone.',
      ),
    ],
    callerLines: [
      T(
        'Ta karjub juba veerand tundi, sest tal pole tšekki. Nüüd lõi ta vastu letti.',
        'He has been shouting for a quarter of an hour because he has no receipt. Now he has punched the counter.',
      ),
      T(
        'Ta ütleb, et paneb minu video internetti ja ootab mind pärast tööd.',
        'He says he will put a video of me online and wait for me after work.',
      ),
    ],
    details: [
      T('Klient: {suspect}. Kaine.', 'The customer: {suspect}. Sober.'),
      T('Müüja on ähvarduste pärast hirmul.', 'The assistant is frightened by the threats.'),
    ],
    call: {
      mood: 'angry',
      opening: [
        T(
          'Tere, poest helistan. Klient karjub tagastuse pärast ja ähvardab müüjat.',
          'Hello, I am calling from a shop. A customer is shouting about a refund and threatening the assistant.',
        ),
      ],
      openingRu: ['Здравствуйте, звоню из магазина. Клиент кричит из-за возврата и угрожает продавцу.'],
      answers: {
        intoxicated: [T('Ei, ta on kaine. Lihtsalt väga vihane.', 'No, he is sober. Just very angry.')],
        weapons: [
          T('Relva ei ole, aga ta lõi rusikaga vastu letti.', 'No weapon, but he punched the counter.'),
        ],
        injured: [T('Keegi viga ei saanud.', 'Nobody is hurt.')],
      },
    },
  },
  {
    id: 'card_declined',
    title: T('Poes agressiivne klient: kaart ei läinud läbi', 'Aggressive customer in a shop: card declined'),
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 60], intoxicated: 0.4, record: 0.4 },
      { role: 'caller', gender: 'any', age: [18, 60], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Kassas ei läinud kliendi kaardimakse läbi, mees süüdistab müüjat, karjub ega lase teistel maksta.',
        '{address}. A customer’s card was declined at the till; the man is blaming the cashier, shouting and not letting anyone else pay.',
      ),
      T(
        '{address}. Klient tahab kauba maksmata kaasa võtta, sest tema kaart ei toimi. Ta ähvardab müüjat ja seisab kassa ees.',
        '{address}. A customer wants to take his shopping without paying because his card does not work. He is threatening the cashier and blocking the till.',
      ),
    ],
    callerLines: [
      T(
        'Tema kaart ei lähe läbi ja nüüd olen mina süüdi. Ta karjub ja lööb terminali.',
        'His card is declined and now it is my fault. He is shouting and hitting the terminal.',
      ),
      T(
        'Ta tahab kauba lihtsalt kaasa võtta ja ütleb, et maksab homme.',
        'He just wants to take the goods and says he will pay tomorrow.',
      ),
    ],
    details: [
      T('Klient: {suspect}.', 'The customer: {suspect}.'),
      T('Tasumata kaupa umbes 80 euro eest.', 'About 80 euros of goods unpaid.'),
    ],
    call: {
      mood: 'angry',
      opening: [
        T(
          'Tere, poest helistan. Kliendi kaart ei läinud läbi ja ta on täiesti agressiivne.',
          'Hello, I am calling from a shop. A customer’s card was declined and he is getting really aggressive.',
        ),
      ],
      openingRu: ['Здравствуйте, звоню из магазина. У клиента не прошла карта, и он ведёт себя агрессивно.'],
      answers: {
        weapons: [T('Relva ei näe.', 'I cannot see a weapon.')],
        injured: [T('Veel mitte keegi.', 'Nobody yet.')],
      },
    },
  },
];

// ── public_order_youth_vandalism ────────────────────────────────────────────
const SC_YOUTH_VANDALISM: IncidentScenario[] = [
  {
    id: 'bus_shelter_glass',
    summary: [
      T(
        '{address}. Noortekamp lõhub bussiootepaviljoni klaase ja prügikaste. Umbes {n} noort.',
        '{address}. A gang of young people is smashing the glass of a bus shelter and the bins. About {n} of them.',
      ),
      T(
        '{address}. Noored peksavad ootepaviljoni klaasseinu ja naeravad, üks filmib telefoniga.',
        '{address}. Young people are hitting the glass walls of a bus shelter and laughing; one is filming on a phone.',
      ),
    ],
    callerLines: [
      T(
        'Noored peksavad ootepaviljoni klaase puruks ja naeravad. Üks filmib.',
        'Young people are smashing the bus shelter glass and laughing. One of them is filming.',
      ),
      T(
        'Ma ei julge midagi öelda, nad on suures grupis.',
        'I do not dare say anything, there is a big group of them.',
      ),
    ],
    details: [
      T(
        'Noored on osaliselt joobes, üks filmib telefoniga.',
        'Some of the young people are drunk and one is filming on a phone.',
      ),
      T('Ühte lõhkujat kirjeldatakse: {suspect}.', 'One of them is described as: {suspect}.'),
    ],
  },
  {
    id: 'park_benches_lights',
    summary: [
      T(
        '{address}. Pargis loobivad noorukid kive, lõhkusid pingi ja valgusteid. Osa on alaealised.',
        '{address}. Youths in the park are throwing stones; they broke a bench and lights. Some are minors.',
      ),
      T(
        '{address}. Pargi tänavavalgustid on kividega puruks visatud, noored murravad pingilt laudu.',
        '{address}. The park lamps have been smashed with stones and young people are tearing planks off a bench.',
      ),
    ],
    callerLines: [
      T(
        'Nad viskasid kõik pargi laternad kividega katki, nüüd lõhuvad pinki.',
        'They have smashed all the park lamps with stones and now they are breaking a bench.',
      ),
      T(
        'Pargis on nüüd täiesti pime, ma ei näe, palju neid on.',
        'It is completely dark in the park now, I cannot see how many there are.',
      ),
    ],
    details: [
      T(
        'Lõhutud on vähemalt neli valgustit ja üks pink.',
        'At least four lamps and a bench have been broken.',
      ),
      T('Ühte lõhkujat kirjeldatakse: {suspect}.', 'One of them is described as: {suspect}.'),
    ],
  },
  {
    id: 'school_windows',
    title: T('Noored loobivad kooli aknaid', 'Youths throwing stones at school windows'),
    summary: [
      T(
        '{address}. Kooli juures loobivad noored kividega aknaid, kaks akent on juba katki.',
        '{address}. Young people are throwing stones at the school windows and two are already broken.',
      ),
      T(
        '{address}. Teataja nägi aknast, kuidas noortekamp viskab koolimaja akendesse kive ja jookseb naerdes ringi.',
        '{address}. The caller saw from a window a gang of youths throwing stones at the school windows and running around laughing.',
      ),
    ],
    callerLines: [
      T(
        'Nad viskavad kivisid otse kooli akendesse! Klaas kukub alla.',
        'They are throwing stones right at the school windows! Glass is falling down.',
      ),
      T(
        'Ma elan kooli vastas, nad on kooli tagaukse juures.',
        'I live opposite the school, they are by the back door.',
      ),
    ],
    details: [
      T('Kooli valvesignalisatsioon on rakendunud.', 'The school’s alarm has gone off.'),
      T('Ühte noort kirjeldatakse: {suspect}.', 'One of them is described as: {suspect}.'),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, noored viskavad kividega kooli aknaid puruks.',
          'Hello, some youths are smashing the school windows with stones.',
        ),
      ],
      openingRu: ['Здравствуйте, подростки бьют камнями окна школы.'],
      answers: {
        count: [T('Viis või kuus noort.', 'Five or six youngsters.')],
        direction: [T('Nad on veel kooli juures.', 'They are still at the school.')],
      },
    },
  },
  {
    id: 'graffiti_garages',
    title: T('Noored sodivad seinu', 'Youths spraying graffiti'),
    summary: [
      T(
        '{address}. Noored sprei-värvivad maja seina ja garaažiuksi, teataja näeb neid aknast.',
        '{address}. Young people are spray-painting a building wall and garage doors; the caller can see them from a window.',
      ),
      T(
        '{address}. Garaažide juures värvivad kapuutsides noored seintele kirju, värvipurgid on maas.',
        '{address}. Hooded youths are spraying writing on the walls by the garages, with spray cans on the ground.',
      ),
    ],
    callerLines: [
      T(
        'Nad sodivad juba teist korda sel nädalal meie maja seina. Nüüd näen neid otse aknast.',
        'This is the second time this week they have sprayed our wall. Now I can see them right from my window.',
      ),
      T(
        'Üks valvab nurga peal, teised värvivad.',
        'One of them is keeping watch on the corner while the others paint.',
      ),
    ],
    details: [
      T(
        'Seintel on värsked joonistused, värv on veel märg.',
        'The drawings on the walls are fresh, the paint is still wet.',
      ),
      T('Ühte noort kirjeldatakse: {suspect}.', 'One of them is described as: {suspect}.'),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, noored värvivad praegu meie maja seina, ma näen neid aknast.',
          'Hello, some youths are spray-painting our building right now, I can see them from my window.',
        ),
      ],
      openingRu: ['Здравствуйте, подростки сейчас разрисовывают стену нашего дома, я вижу их из окна.'],
      answers: {
        count: [T('Kolm, üks valvab nurga peal.', 'Three, one is on the corner keeping watch.')],
        weapons: [T('Ei, neil on ainult värvipurgid.', 'No, just spray cans.')],
      },
    },
  },
];

export const TEMPLATES_PUBLIC_ORDER: IncidentTemplate[] = [
  // ─── Legacy ───────────────────────────────────────────────────────────────
  {
    id: 'public_order_bar_troublemaker',
    category: 'public_order',
    code: 'AK',
    title: T('Korrarikkuja baaris', 'Troublemaker in a bar'),
    priority: 2,
    weight: 1.3,
    hours: 'nightlife',
    weekendBoost: 1.6,
    places: ['bar', 'nightclub'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 1)] },
    onScene: [25, 50],
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 55], intoxicated: 0.9, record: 0.4, wanted: 0.06 },
      { role: 'caller', gender: 'any', age: [20, 45], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Klient keeldub baarist lahkumast, on agressiivne ja ähvardab töötajaid.',
        '{address}. A customer refuses to leave the bar, is aggressive and threatening staff.',
      ),
      T(
        '{address}. Baaris lõhkus joobes klient klaase, sõimab baarmeni ja keeldub arvet maksmast.',
        '{address}. In a bar a drunk customer smashed glasses, is abusing the bartender and refuses to pay.',
      ),
    ],
    callerLines: [
      T(
        'Klient keeldub lahkumast, on agressiivne ja ähvardab meid.',
        'A customer refuses to leave, he is aggressive and threatening us.',
      ),
      T(
        'Ta ütleb, et kui me politsei kutsume, ootab ta mind pärast tööd ukse taga.',
        'He says if we call the police he will be waiting for me outside after work.',
      ),
    ],
    details: [
      T('Korrarikkuja: {suspect}, tugevas joobes.', 'The troublemaker: {suspect}, heavily intoxicated.'),
      T(
        'Baaris on teisi kliente, kes on hakanud temaga sõnelema.',
        'Other customers have started arguing with him.',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive'),
      backup(0.15, un('patrol'), { at: 3 }),
      toSober(10, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'removed',
        'fine',
        [0.5, 1],
        3,
        T(
          'Isik eemaldati baarist ja toimetati kainenema. Alustati väärteomenetlust avaliku korra rikkumise eest (KarS § 262).',
          'The man was removed from the bar and taken to sober up. Misdemeanour proceedings opened for breach of public order (KarS § 262).',
        ),
        { trust: 1 },
      ),
      oc(
        'arrest',
        'arrest',
        [0.75, 1],
        1,
        T(
          'Isik osutas vastupanu ja ähvardas töötajaid edasi, ta peeti kinni ja toimetati arestimajja.',
          'The man resisted and kept threatening staff; he was detained and taken to the arrest house.',
        ),
        { arrests: 1 },
      ),
      oc(
        'warning',
        'warning',
        [0.25, 0.6],
        2,
        T(
          'Isik lahkus pärast vestlust rahulikult, talle tehti hoiatus.',
          'The man left calmly after a talk and was given a warning.',
        ),
      ),
      oc(
        'left',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Isik lahkus enne patrulli saabumist. Töötajad kardavad, et ta tuleb tagasi.',
          'The man left before the patrol arrived. Staff fear he will come back.',
        ),
        { trust: -1 },
      ),
    ],
    interactiveChance: 0.15,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Siin baaris on klient, kes ei lähe minema ja ähvardab meid. Tulge ta ära viima!',
          'There is a customer in the bar who will not leave and is threatening us. Come and take him away!',
        ),
      ],
      openingRu: ['Тут в баре клиент буянит, угрожает персоналу, уходить отказывается.'],
      answers: {
        weapons: [T('Relva pole näha, aga ta haaras pudeli.', 'No weapon visible, but he grabbed a bottle.')],
        intoxicated: [T('Täiesti purjus.', 'Completely drunk.')],
        injured: [T('Veel mitte keegi.', 'Nobody yet.')],
      },
    },
    tags: ['alcohol'],
    legacy: true,
    scenarios: SC_BAR_TROUBLEMAKER,
  },
  {
    id: 'public_order_demonstration',
    category: 'public_order',
    code: 'ME',
    title: T('Meeleavaldus', 'Demonstration'),
    priority: 2,
    weight: 0.06,
    hours: 'day',
    places: ['government', 'oldtown', 'street', 'park'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 3)] },
    onScene: [60, 120],
    persons: [
      { role: 'suspect', gender: 'any', age: [20, 60], record: 0.2, known: false },
      { role: 'witness', gender: 'any', age: [20, 70] },
    ],
    summary: [
      T(
        '{address}. Linnavalitsuse ees koguneb suur hulk inimesi protesteerima ja olukord hakkab eskaleeruma.',
        '{address}. A large crowd is gathering in front of the town hall to protest and the situation is starting to escalate.',
      ),
      T(
        '{address}. Kogunenud on paarsada meeleavaldajat, osa blokeerib sõiduteed. Koosolekust ei olnud ette teatatud.',
        '{address}. A couple of hundred protesters have gathered, some are blocking the road. The assembly was not notified in advance.',
      ),
    ],
    callerLines: [
      T(
        'Linnavalitsuse ees on hulk rahvast, nad karjuvad ja loobivad midagi akende pihta.',
        'There is a crowd in front of the town hall, they are shouting and throwing things at the windows.',
      ),
      T(
        'Ma olen korraldaja. Keegi tõi kaasa pürotehnikat ja hakkab inimesi õhutama.',
        'I am the organiser. Someone brought pyrotechnics and is starting to stir people up.',
      ),
    ],
    details: [
      T(
        'Osa osalejaid on joobes ja provotseerib vastasleeri.',
        'Some participants are drunk and provoking the counter-protesters.',
      ),
      T('Õhutajat kirjeldatakse: {suspect}.', 'The agitator is described as: {suspect}.'),
    ],
    beats: [
      backup(0.65, un('patrol', 2), {
        at: 3,
        radio: [
          T(
            '{callsign}: rahvast on palju ja meeleolu kütab, vajame lisapatrulle!',
            '{callsign}: big crowd and tempers rising, we need more patrols!',
          ),
        ],
      }),
      choice(
        8,
        [
          T(
            '{callsign}: osa meeleavaldajaid blokeerib sõidutee. Kas eemaldame nad jõuga või jätkame läbirääkimisi korraldajaga?',
            '{callsign}: some protesters are blocking the road. Remove them by force or keep negotiating with the organiser?',
          ),
        ],
        [
          opt(
            'remove',
            T('Eemaldage jõuga', 'Remove by force'),
            T(
              '{callsign}, juhtimine. Eemaldage sõiduteelt, kasutage proportsionaalset jõudu.',
              '{callsign}, Control. Clear the road, use proportionate force.',
            ),
            { success: 0.05, risk: 0.1, trust: -2, arrests: 2 },
          ),
          opt(
            'negotiate',
            T('Läbirääkimised korraldajaga', 'Negotiate with the organiser'),
            T(
              '{callsign}, juhtimine. Rääkige korraldajaga, liiklus suunake ümber.',
              '{callsign}, Control. Talk to the organiser and divert traffic.',
            ),
            { time: 20, success: 0.1, trust: 1 },
          ),
        ],
        'negotiate',
      ),
      qPerson('suspect', 15, {
        chance: 0.6,
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Pürotehnikaga õhutaja on {name}, isikukood {idcode}. Palun kontrolli.',
            'Control, {callsign}. The agitator with pyrotechnics is {name}, ID code {idcode}. Please check.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'calm',
        'resolved',
        [0.55, 1],
        3,
        T(
          'Meeleavaldus lõppes rahumeelselt pärast läbirääkimisi korraldajaga. Liiklus taastati.',
          'The demonstration ended peacefully after talks with the organiser. Traffic was restored.',
        ),
        { trust: 3 },
      ),
      oc(
        'arrests',
        'arrest',
        [0.6, 1],
        1,
        T(
          'Kaks pürotehnikat loopinud isikut peeti kinni. Alustati menetlust KarS § 263 järgi.',
          'Two people who threw pyrotechnics were detained. Proceedings opened under KarS § 263.',
        ),
        { arrests: 2 },
      ),
      oc(
        'fines',
        'fine',
        [0.3, 0.7],
        2,
        T(
          'Kolm õhutajat eemaldati, neile koostati väärteoprotokollid. Meeleavaldus jätkus rahulikult.',
          'Three agitators were removed and fined. The demonstration continued peacefully.',
        ),
      ),
      oc(
        'clash',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Olukord eskaleerus, viga said kaks osalejat ja üks politseinik. Alustati kriminaalmenetlust.',
          'The situation escalated; two participants and an officer were injured. Criminal proceedings opened.',
        ),
        { injuries: 2, trust: -5 },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.3,
      toPriority: 1,
      text: T(
        'Meeleavaldus muutus vägivaldseks, loobitakse kive ja pudeleid.',
        'The demonstration has turned violent, stones and bottles are being thrown.',
      ),
    },
    tags: ['crowd'],
    legacy: true,
  },
  {
    id: 'public_order_airport_security',
    category: 'public_order',
    code: 'AK',
    title: T('Lennujaama turvaintsident', 'Airport security incident'),
    priority: 2,
    weight: 0.08,
    hours: 'day',
    places: ['airport'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 1), un('border', 1)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'any', age: [20, 65], intoxicated: 0.4, record: 0.2 },
      { role: 'witness', gender: 'any', age: [22, 55], relation: 'employee' },
    ],
    summary: [
      T(
        '{place}, {address}. Kahtlane isik keeldub lennujaamas turvakontrollist läbimast ja põhjustab häiret.',
        '{place}, {address}. A suspicious person refuses to go through airport security and is causing a disturbance.',
      ),
      T(
        '{place}, {address}. Reisija tekitas turvaalas kära ja väitis, et tema kotis on "pomm". Hiljem ütles, et oli nali.',
        '{place}, {address}. A passenger caused a commotion in the security area claiming there was a "bomb" in his bag, then said it was a joke.',
      ),
    ],
    callerLines: [
      T(
        'Turvakontroll siin. Reisija keeldub koti avamisest ja karjub töötajate peale.',
        'Security checkpoint here. A passenger refuses to open his bag and is shouting at staff.',
      ),
      T(
        'Üks mees ütles, et tal on kotis pomm. Nüüd väidab, et see oli nali, aga me peatasime liini.',
        'A man said he had a bomb in his bag. Now he says it was a joke, but we have stopped the line.',
      ),
    ],
    details: [
      T(
        'Isik: {suspect}. Tema lend väljub 40 minuti pärast.',
        'Subject: {suspect}. His flight leaves in 40 minutes.',
      ),
      T(
        'Kotist leiti suur kogus vedelikke ja taskunuga.',
        'A large amount of liquids and a pocket knife were found in the bag.',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive'),
      backup(0.23, un('patrol'), { at: 3 }),
      choice(
        6,
        [
          T(
            '{callsign}: reisija rahunes, kuid lennufirma ei luba teda pardale. Kas toimetame ta jaoskonda või lubame lahkuda pärast protokolli?',
            '{callsign}: the passenger has calmed down but the airline will not let him board. Take him to the station or let him go after the paperwork?',
          ),
        ],
        [
          opt(
            'station',
            T('Jaoskonda menetlusse', 'To the station'),
            T(
              '{callsign}, juhtimine. Toimetage jaoskonda, menetlus seal.',
              '{callsign}, Control. Bring him to the station for processing.',
            ),
            { success: 0.05, time: 25 },
          ),
          opt(
            'release',
            T('Protokoll ja vabaks', 'Paperwork and release'),
            T(
              '{callsign}, juhtimine. Vormistage kohapeal ja laske minna.',
              '{callsign}, Control. Process on the spot and release.',
            ),
            { time: -10 },
          ),
        ],
        'release',
      ),
    ],
    outcomes: [
      oc(
        'fine',
        'fine',
        [0.45, 1],
        3,
        T(
          'Isikule koostati väärteoprotokoll, lennufirma keelas tal lennata.',
          'The person was fined and the airline refused to fly him.',
        ),
      ),
      oc(
        'bomb_joke',
        'report',
        [0.6, 1],
        1,
        T(
          '"Pommiga" nalja teinud reisija suhtes alustati kriminaalmenetlust avaliku korra raske rikkumise tunnustel (KarS § 263).',
          'Criminal proceedings for serious breach of public order (KarS § 263) were opened against the passenger who "joked" about a bomb.',
        ),
      ),
      oc(
        'resolved',
        'resolved',
        [0.25, 0.6],
        2,
        T(
          'Arusaamatus lahenes, reisija läbis turvakontrolli ja jõudis lennule.',
          'The misunderstanding was resolved; the passenger cleared security and made his flight.',
        ),
      ),
      oc(
        'delay',
        'report',
        [0, 0.35],
        2,
        T(
          'Turvaala suleti tunniks ja mitu lendu hilines. Isik toimetati jaoskonda.',
          'The security area was closed for an hour and several flights were delayed. The person was taken to the station.',
        ),
        { trust: -3 },
      ),
    ],
    tags: ['airport'],
    legacy: true,
  },
  {
    id: 'public_order_hoa_conflict',
    category: 'public_order',
    code: 'NV',
    title: T('Korteriühistu konflikt', 'Housing association conflict'),
    priority: 3,
    weight: 0.4,
    hours: 'evening',
    places: ['residential'],
    units: { need: [un('patrol', 1)] },
    onScene: [30, 60],
    persons: [
      {
        role: 'suspect',
        gender: 'M',
        age: [35, 70],
        relation: 'neighbour',
        known: true,
        intoxicated: 0.4,
        record: 0.3,
      },
      { role: 'victim', gender: 'any', age: [35, 75], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naaber ei maksa korteriühistu arveid ja on hakanud teisi korteriomanikke ähvardama.',
        '{address}. A neighbour does not pay his housing association bills and has started threatening other owners.',
      ),
      T(
        '{address}. Korteriühistu üldkoosolekul läks sõnelus käsikähmluseks, üks korteriomanik tõukas esimeest.',
        '{address}. An argument at the housing association meeting turned into a scuffle; one owner shoved the chairman.',
      ),
    ],
    callerLines: [
      T(
        'Ma olen ühistu esimees. Võlglane tuli koosolekule ja ähvardas mind peksta.',
        'I am the association chairman. The debtor came to the meeting and threatened to beat me up.',
      ),
      T(
        'Ta karjub trepikojas, et kes temalt raha nõuab, see kahetseb.',
        'He is shouting in the stairwell that anyone who asks him for money will regret it.',
      ),
    ],
    details: [
      T(
        'Ähvardaja: {suspect}. Võlg ühistule on üle 3000 euro.',
        'The man making threats: {suspect}. He owes the association over 3,000 euros.',
      ),
      T(
        'Naabrite sõnul on mees varem lõhkunud postkaste.',
        'Neighbours say the man has smashed letterboxes before.',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive'),
      backup(0.5, un('patrol'), {
        at: 3,
        radio: [
          T(
            '{callsign}: mees muutub vägivaldseks, vajame teist patrulli.',
            '{callsign}: the man is turning violent, we need a second patrol.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'threat',
        'report',
        [0.5, 1],
        3,
        T(
          'Esimehelt võeti avaldus, alustati kriminaalmenetlust KarS § 120 järgi.',
          'The chairman filed a complaint; criminal proceedings opened under KarS § 120.',
        ),
        { trust: 1 },
      ),
      oc(
        'civil',
        'referred',
        [0.3, 0.7],
        2,
        T(
          'Võlavaidlus on tsiviilasi: ühistule selgitati, et võla sissenõudmiseks tuleb pöörduda kohtusse. Ähvardajat hoiatati.',
          'The debt dispute is a civil matter: the association was told to go to court to recover it. The man was warned.',
        ),
      ),
      oc(
        'warning',
        'warning',
        [0, 0.45],
        2,
        T(
          'Pooled ei olnud nõus koostööks, sündmus lõpetati hoiatusega.',
          'Neither side would cooperate; the event was closed with a warning.',
        ),
        { trust: -1 },
      ),
    ],
    tags: ['neighbours'],
    legacy: true,
  },
  {
    id: 'public_order_night_noise',
    category: 'public_order',
    code: 'ÖR',
    title: T('Öörahu rikkumine', 'Night-time noise violation'),
    priority: 3,
    weight: 2.0,
    hours: 'night',
    weekendBoost: 1.6,
    places: ['residential', 'park', 'street'],
    units: { need: [un('patrol', 1)] },
    onScene: [20, 45],
    persons: [
      { role: 'suspect', gender: 'M', age: [16, 25], intoxicated: 0.8, record: 0.15 },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Noortekamp korraldab majade vahel valjuhäälseid pidusid ja rikub korduvalt öörahu. Muusika autost, karjumine.',
        '{address}. A group of youths keeps holding loud parties between the buildings, repeatedly breaking night-time quiet. Music from a car, shouting.',
      ),
      T(
        '{address}. Majade vahel hoovis istub {n} noort, vali muusika ja karjumine kestab juba kella 23-st. Teataja on naaber, ei soovi kohtuda.',
        '{address}. {n} youths are sitting in the courtyard with loud music and shouting since 23.00. The caller is a neighbour and does not want to meet officers.',
      ),
    ],
    callerLines: [
      T(
        'Juba kolmas öö järjest! Nad istuvad pingil, muusika põrutab ja nad karjuvad, lapsed ei saa magada.',
        'Third night in a row! They sit on the bench, the music is booming and they shout, the kids cannot sleep.',
      ),
      T(
        'Ma ei julge ise minna ütlema, neid on palju ja nad on purjus.',
        'I do not dare go and tell them myself, there are many of them and they are drunk.',
      ),
    ],
    details: [
      T('Noored on alkoholijoobes, osa võib olla alaealised.', 'The youths are drunk; some may be minors.'),
      T(
        'Teataja sõnul on politsei samal aadressil sel nädalal juba käinud.',
        'The caller says police already came to this address this week.',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.7 }),
      backup(0.1, un('patrol'), { at: 3 }),
      choice(
        5,
        [
          T(
            '{callsign}: noored keerasid muusika vaiksemaks, kuid kaks on alaealised ja joobes. Kas toimetame nad koju vanematele või piirdume hoiatusega?',
            '{callsign}: they have turned the music down, but two are drunk minors. Drive them home to their parents or just give a warning?',
          ),
        ],
        [
          opt(
            'home',
            T('Viige koju vanematele', 'Drive them home'),
            T(
              '{callsign}, juhtimine. Toimetage alaealised vanematele, teavitage lastekaitset.',
              '{callsign}, Control. Take the minors to their parents and notify child protection.',
            ),
            { time: 20, success: 0.1, trust: 1 },
          ),
          opt(
            'warn',
            T('Hoiatus kohapeal', 'Warning on the spot'),
            T(
              '{callsign}, juhtimine. Tehke hoiatus ja saatke laiali.',
              '{callsign}, Control. Give a warning and send them off.',
            ),
            { time: -5 },
          ),
        ],
        'warn',
      ),
    ],
    outcomes: [
      oc(
        'fines',
        'fine',
        [0.5, 1],
        3,
        T(
          'Peo korraldajatele koostati väärteoprotokollid öörahu rikkumise ja avalikus kohas alkoholi tarbimise eest. Alaealiste vanemaid teavitati.',
          'The party organisers were fined for breaking night-time quiet and drinking in public. The minors’ parents were informed.',
        ),
        { trust: 1 },
      ),
      oc(
        'warning',
        'warning',
        [0.25, 0.65],
        3,
        T(
          'Noored lõpetasid peo ja lahkusid pärast hoiatust.',
          'The youths ended the party and left after a warning.',
        ),
      ),
      oc(
        'gone',
        'unfounded',
        [0, 0.35],
        2,
        T(
          'Patrulli saabudes oli seltskond juba lahkunud.',
          'The group had already left when the patrol arrived.',
        ),
        { trust: -1 },
      ),
    ],
    escalation: {
      afterMin: 40,
      chance: 0.12,
      toPriority: 2,
      text: T('Teataja: noorte vahel puhkes kaklus.', 'Caller: a fight has broken out among the youths.'),
    },
    expiresMin: 50,
    interactiveChance: 0.12,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Kas te saate lõpuks midagi teha? Hoovis on jälle pidu, kell on üks öösel!',
          'Can you finally do something? There is another party in the courtyard and it is one in the morning!',
        ),
      ],
      openingRu: [
        'Здравствуйте, во дворе молодёжь орёт, музыка на всю, уже третью ночь подряд спать невозможно!',
      ],
      answers: {
        count: [T('Kümmekond noort, võib-olla rohkem.', 'About ten youths, maybe more.')],
        when: [T('Kella üheteistkümnest saati.', 'Since eleven o’clock.')],
        name: [
          T(
            'Ma ei taha oma nime öelda, nad teavad, kus ma elan.',
            'I do not want to give my name, they know where I live.',
          ),
        ],
        intoxicated: [
          T('Joovad, pudelid on pingi all.', 'They are drinking, the bottles are under the bench.'),
        ],
      },
    },
    tags: ['noise', 'alcohol'],
    legacy: true,
    scenarios: SC_NIGHT_NOISE,
  },
  {
    id: 'public_order_kids_party_brawl',
    category: 'public_order',
    code: 'AK',
    title: T('Sünnipäevapidu', 'Birthday party'),
    priority: 2,
    weight: 0.08,
    hours: 'day',
    weekendBoost: 1.6,
    places: ['mall', 'park', 'residential'],
    units: { need: [un('patrol', 1)] },
    onScene: [25, 50],
    persons: [
      { role: 'suspect', gender: 'M', age: [28, 45], intoxicated: 0.3 },
      { role: 'victim', gender: 'M', age: [28, 45] },
      { role: 'witness', gender: 'F', age: [25, 45], relation: 'parent' },
    ],
    summary: [
      T(
        '{address}. Laste sünnipäevalaadal puhkes suur tüli vanemate vahel, olukord on kontrolli alt väljas. Kohal on palju lapsi.',
        '{address}. A big row broke out between parents at a children’s birthday fair and is out of control. Lots of children present.',
      ),
      T(
        '{address}. Mängutoas toimunud lastepeol läksid kaks isa kaklema, üks lükati vastu lauda.',
        '{address}. At a children’s party in a play centre two fathers started fighting; one was pushed into a table.',
      ),
    ],
    callerLines: [
      T(
        'Siin on laste sünnipäev ja kaks isa kaklevad! Lapsed nutavad!',
        'This is a kids’ birthday party and two dads are fighting! The kids are crying!',
      ),
      T(
        'Kõik algas sellest, kes kelle last tõukas... nüüd on täiskasvanud omavahel kähmluses.',
        'It all started over whose kid pushed whose... now the adults are scuffling.',
      ),
    ],
    details: [
      T(
        'Ühel isal on veritsev huul, teine on autoga lahkumas.',
        'One father has a bleeding lip; the other is about to leave by car.',
      ),
      T('Osa täiskasvanuid on joonud veini.', 'Some of the adults have been drinking wine.'),
    ],
    beats: [
      qPerson('suspect', 'arrive'),
      backup(0.1, un('patrol'), { at: 3 }),
      kiirabi(3, {
        chance: 0.2,
        radio: [
          T(
            '{callsign}: ühel osalisel lahtine haav huulel, palun kiirabi.',
            '{callsign}: one party has a split lip, request an ambulance.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.5, 1],
        3,
        T(
          'Lööja tuvastati, kannatanult võeti avaldus. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'The man who struck the blow was identified and the victim filed a complaint. Criminal proceedings opened under KarS § 121.',
        ),
      ),
      oc(
        'warning',
        'warning',
        [0.25, 0.65],
        2,
        T(
          'Vanemad rahunesid ja lahkusid eraldi. Mõlemaid hoiatati, avaldust ei esitatud.',
          'The parents calmed down and left separately. Both were warned; no complaint was filed.',
        ),
      ),
      oc(
        'gone',
        'unfounded',
        [0, 0.35],
        2,
        T(
          'Tülitsejad lahkusid enne patrulli saabumist, pidu jätkus.',
          'The quarrelling parents left before the patrol arrived and the party went on.',
        ),
      ),
    ],
    tags: ['children'],
    legacy: true,
  },
  {
    id: 'public_order_neighbourhood_watch',
    category: 'public_order',
    code: 'KI',
    title: T('Naabrivalve kahtlus', 'Neighbourhood watch suspicion'),
    priority: 3,
    weight: 0.4,
    hours: 'night',
    places: ['house', 'residential', 'village'],
    units: { need: [un('patrol', 1)] },
    onScene: [20, 45],
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 55], record: 0.4, wanted: 0.06 },
      { role: 'caller', gender: 'any', age: [50, 85], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naabruses liigub tundmatu isik, kes käib öösiti ümber majade ja tundub kahtlane.',
        '{address}. An unknown person is moving around the neighbourhood, walking round the houses at night and acting suspiciously.',
      ),
      T(
        '{address}. Naabrivalve sektori vanema teatel kõnnib keegi taskulambiga aedade vahel ja proovib väravaid.',
        '{address}. The neighbourhood watch coordinator reports someone with a torch walking between gardens and trying gates.',
      ),
    ],
    callerLines: [
      T(
        'Ta käib igal ööl siin ringi ja piilub akendesse. Keegi ei tea, kes ta on.',
        'He walks around here every night and peers into windows. Nobody knows who he is.',
      ),
      T(
        'Ma olen naabrivalve sektori vanem. Täna nägime teda jälle, tal oli kott kaasas.',
        'I am the neighbourhood watch coordinator. We saw him again tonight, he was carrying a bag.',
      ),
    ],
    details: [
      T('Kirjeldus: {suspect}.', 'Description: {suspect}.'),
      T(
        'Piirkonnas on viimase kuu jooksul olnud kaks kuurivargust.',
        'There have been two shed thefts in the area in the past month.',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.7 }),
      search(
        2,
        0.6,
        [
          T(
            '{callsign}: isikut kohal pole, vaatame tänavad ja hoovid läbi.',
            '{callsign}: nobody here, checking the streets and yards.',
          ),
        ],
        0.3,
      ),
    ],
    outcomes: [
      oc(
        'dogwalker',
        'resolved',
        [0.5, 1],
        3,
        T(
          'Selgus, et tegemist on hiljuti piirkonda kolinud mehega, kes käib öösiti koeraga jalutamas. Naabreid rahustati.',
          'It turned out to be a man who recently moved to the area and walks his dog at night. The neighbours were reassured.',
        ),
      ),
      oc(
        'thief',
        'arrest',
        [0.65, 1],
        1,
        T(
          'Isikul olid kaasas murdmisvahendid ja naabri jalgratas. Ta peeti kinni, alustati kriminaalmenetlust.',
          'The man was carrying burglary tools and a neighbour’s bicycle. He was detained and criminal proceedings opened.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'nobody',
        'unfounded',
        [0, 0.45],
        2,
        T(
          'Teade ei leidnud kinnitust, patrull ei leidnud piirkonnast kedagi. Naabrivalvele anti soovitused.',
          'The report was not confirmed; the patrol found nobody in the area. The neighbourhood watch was given advice.',
        ),
      ),
    ],
    falseAlarmChance: 0.3,
    interactiveChance: 0.1,
    call: {
      mood: 'elderly',
      opening: [
        T(
          'Tere, ma ei tea, kas see on õige number... siin käib keegi öösiti aedades.',
          'Hello, I do not know if this is the right number... someone has been walking around the gardens at night.',
        ),
      ],
      answers: {
        suspect: [
          T('Tume riietus, taskulamp, müts sügaval peas.', 'Dark clothes, a torch, hat pulled down low.'),
        ],
        when: [T('Praegu, viis minutit tagasi nägin teda.', 'Right now, I saw him five minutes ago.')],
        direction: [T('Ta läks {direction}.', 'He went {direction}.')],
      },
    },
    tags: ['suspicious'],
    legacy: true,
  },
  {
    id: 'public_order_apartment_smashing',
    category: 'public_order',
    code: 'AK',
    title: T('Korterilõhkumine', 'Smashing up a flat'),
    priority: 2,
    weight: 0.4,
    hours: 'night',
    places: ['residential'],
    units: { need: [un('patrol', 1)] },
    onScene: [30, 60],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 55], intoxicated: 0.9, record: 0.4 },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Allnaaber peksab oma korteri ust ja aknaid, on väga vihane ja purjus.',
        '{address}. The downstairs neighbour is pounding on his own door and windows, very angry and drunk.',
      ),
      T(
        '{address}. Korterist kostab lõhkumist, mees viskas rõdult alla tooli ja karjub, et tal pole midagi kaotada.',
        '{address}. Sounds of smashing from a flat; a man threw a chair off the balcony and is shouting that he has nothing to lose.',
      ),
    ],
    callerLines: [
      T(
        'Minu allnaaber peksab oma korteri ust ja aknaid, ta on väga vihane ja purjus.',
        'My downstairs neighbour is beating his flat door and windows, he is very angry and drunk.',
      ),
      T(
        'Klaas kukkus alla kõnniteele, keegi oleks võinud pihta saada!',
        'Glass fell onto the pavement, someone could have been hit!',
      ),
    ],
    details: [
      T(
        'Mees: {suspect}. Elab üksi, naine lahkus hiljuti.',
        'The man: {suspect}. Lives alone, his wife recently left.',
      ),
      T(
        'Mees karjub, et tal pole enam midagi kaotada.',
        'The man is shouting that he has nothing left to lose.',
      ),
    ],
    beats: [
      backup(0.09, un('patrol'), { at: 3 }),
      qPerson('suspect', 3),
      choice(
        6,
        [
          T(
            '{callsign}: mees ei ava ust, seest kostab lõhkumist. Kas siseneme jõuga või ootame, kuni ta rahuneb?',
            '{callsign}: he will not open up and we can hear smashing. Force entry or wait for him to calm down?',
          ),
        ],
        [
          opt(
            'enter',
            T('Sisenege', 'Go in'),
            T(
              '{callsign}, juhtimine. Sisenege, oht endale ja teistele.',
              '{callsign}, Control. Go in, danger to himself and others.',
            ),
            { success: 0.1, risk: 0.08 },
          ),
          opt(
            'wait',
            T('Oodake ja rääkige', 'Wait and talk'),
            T(
              '{callsign}, juhtimine. Rääkige ukse taga, ärge kiirustage.',
              '{callsign}, Control. Talk to him through the door, take your time.',
            ),
            { time: 15 },
          ),
        ],
        'wait',
      ),
      toSober(15, { chance: 0.5 }),
    ],
    outcomes: [
      oc(
        'sober',
        'fine',
        [0.5, 1],
        3,
        T(
          'Mees toimetati kainenema. Alustati väärteomenetlust avaliku korra rikkumise eest, alla visatud esemed koristati.',
          'The man was taken to sober up. Misdemeanour proceedings opened for breach of public order; the items thrown down were cleared away.',
        ),
      ),
      oc(
        'psych',
        'hospital',
        [0.35, 0.75],
        2,
        T(
          'Mees ähvardas endale haiget teha, ta toimetati psühhiaatrilisele läbivaatusele.',
          'The man threatened to harm himself and was taken for a psychiatric assessment.',
        ),
      ),
      oc(
        'warning',
        'warning',
        [0.2, 0.55],
        2,
        T(
          'Mees rahunes ja lubas magama minna. Talle tehti hoiatus.',
          'The man calmed down and promised to go to bed. He was given a warning.',
        ),
      ),
      oc(
        'cut',
        'hospital',
        [0, 0.3],
        1,
        T(
          'Mees lõikas end aknaklaasiga ja toimetati kiirabiga haiglasse.',
          'The man cut himself on window glass and was taken to hospital by ambulance.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    tags: ['alcohol'],
    legacy: true,
  },
  {
    id: 'public_order_suspicious_person_school',
    category: 'public_order',
    code: 'KI',
    title: T('Kahtlane isik kooli lähedal', 'Suspicious person near a school'),
    priority: 2,
    weight: 0.3,
    hours: 'business',
    months: [1, 2, 3, 4, 5, 9, 10, 11, 12],
    places: ['school', 'kindergarten', 'park'],
    units: { need: [un('patrol', 1)] },
    onScene: [25, 50],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 65], record: 0.3, wanted: 0.04 },
      { role: 'caller', gender: 'any', age: [25, 60], relation: 'employee' },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
    summary: [
      T(
        '{address}. Kooli lähedal on nähtud kahtlast isikut, kes jälgib lapsi ja käitub kahtlaselt.',
        '{address}. A suspicious person has been seen near the school watching children and acting strangely.',
      ),
      T(
        '{address}. Lasteaia õpetaja teatel seisab aia taga mees, kes pildistab lapsi ja kõnetas üht last.',
        '{address}. A kindergarten teacher reports a man standing behind the fence photographing children; he spoke to one child.',
      ),
    ],
    callerLines: [
      T(
        'Ta seisab juba tund aega kooliaia taga ja vaatab lapsi. Kui ma lähemale läksin, pööras ta selja.',
        'He has been standing behind the school fence for an hour watching the children. When I went closer he turned away.',
      ),
      T(
        'Üks laps ütles, et mees pakkus talle kommi ja kutsus autosse.',
        'One child said the man offered him sweets and asked him into his car.',
      ),
    ],
    details: [
      T('Kirjeldus: {suspect}.', 'Description: {suspect}.'),
      T(
        'Mees istus hiljem autosse ({car}) ja jäi parklasse.',
        'The man later got into a {car} and stayed in the car park.',
      ),
    ],
    beats: [
      qVehicle('arrive', { chance: 0.6 }),
      qPerson('suspect', 3),
      backup(0.11, un('patrol'), { at: 4 }),
      search(
        4,
        0.8,
        [
          T(
            '{callsign}: isik lahkus enne meie saabumist, vaatame ümbruse läbi.',
            '{callsign}: the man left before we arrived, checking the surroundings.',
          ),
        ],
        0.3,
      ),
    ],
    outcomes: [
      oc(
        'grandad',
        'resolved',
        [0.5, 1],
        3,
        T(
          'Selgus, et mees ootas oma lapselast. Isik tuvastati, õpetajaid rahustati.',
          'It turned out the man was waiting for his grandchild. He was identified and the teachers reassured.',
        ),
      ),
      oc(
        'report',
        'report',
        [0.4, 0.85],
        2,
        T(
          'Isik tuvastati ja temaga vesteldi. Kool ja lapsevanemad said soovitused, info edastati piirkonnapolitseinikule.',
          'The man was identified and spoken to. The school and parents were given advice; the information was passed to the community officer.',
        ),
      ),
      oc(
        'gone',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Isik lahkus enne patrulli saabumist ja jäi tuvastamata. Piirkonnas suurendati patrullimist.',
          'The man left before the patrol arrived and was not identified. Patrols in the area were increased.',
        ),
        { trust: -2 },
      ),
    ],
    falseAlarmChance: 0.25,
    tags: ['children', 'suspicious'],
    legacy: true,
  },
  {
    id: 'public_order_neighbour_noise_day',
    category: 'public_order',
    code: 'NV',
    title: T('Häiriv hääl naaberkorterist', 'Disturbing noise from a neighbouring flat'),
    priority: 4,
    weight: 0.6,
    hours: 'day',
    places: ['residential'],
    units: { need: [un('patrol', 1)] },
    onScene: [20, 40],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 60], relation: 'neighbour', known: true, record: 0.25 },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naaberkorterist kostab terve päeva valju metalli kriginat, mis häirib kogu korrust.',
        '{address}. Loud metal grinding has been coming from a neighbouring flat all day, disturbing the whole floor.',
      ),
      T(
        '{address}. Naabri korteris käib nädalaid remont ka hilistel õhtutundidel: nurgalihvija ja vasar.',
        '{address}. Renovation work has been going on in a neighbour’s flat for weeks, even late in the evening: angle grinder and hammer.',
      ),
    ],
    callerLines: [
      T(
        'Naaberkorterist kostab terve päeva valju metalli kriginat. Kogu korrus on hulluks minemas.',
        'There has been loud metal grinding from next door all day. The whole floor is going mad.',
      ),
      T(
        'Ma töötan öösiti ja pean päeval magama, aga see kriiksumine ei lõpe.',
        'I work nights and need to sleep during the day, but this screeching never stops.',
      ),
    ],
    details: [
      T(
        'Teataja kahtlustab, et korteris lõigatakse varastatud metalli.',
        'The caller suspects stolen metal is being cut up in the flat.',
      ),
      T(
        'Korteriühistu on naabrile korduvalt kirjutanud.',
        'The housing association has written to the neighbour several times.',
      ),
    ],
    referral: { agency: 'kov', chance: 0.4 },
    beats: [
      qPerson('suspect', 'arrive'),
      backup(0.24, un('patrol'), {
        at: 3,
        radio: [
          T(
            '{callsign}: naaber on agressiivne ja keeldub koostööst, palun lisapatrulli.',
            '{callsign}: the neighbour is aggressive and refuses to cooperate, request another patrol.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'agreed',
        'resolved',
        [0.45, 1],
        3,
        T(
          'Naaber lubas tööd lõpetada kell 21. Pooltele selgitati korteriühistu kodukorda.',
          'The neighbour agreed to stop work at 21.00. Both were reminded of the association’s house rules.',
        ),
      ),
      oc(
        'cables',
        'report',
        [0.7, 1],
        1,
        T(
          'Korterist leiti suur hulk varastatud vaskkaablit. Alustati menetlust varastatud vara omandamise tunnustel (KarS § 202).',
          'A large quantity of stolen copper cable was found in the flat. Proceedings opened for handling stolen goods (KarS § 202).',
        ),
        { trust: 2 },
      ),
      oc(
        'kov',
        'referred',
        [0.2, 0.6],
        2,
        T(
          'Päevane müra ei ole öörahu rikkumine. Juhtum edastati omavalitsusele ja korteriühistule.',
          'Daytime noise is not a breach of night-time quiet. The case was passed to the municipality and the housing association.',
        ),
      ),
      oc(
        'ignored',
        'unfounded',
        [0, 0.3],
        1,
        T(
          'Naaber ei avanud ust ja müra lakkas. Sündmus lõpetati.',
          'The neighbour did not open the door and the noise stopped. The event was closed.',
        ),
      ),
    ],
    expiresMin: 120,
    tags: ['noise', 'neighbours'],
    legacy: true,
  },
  {
    id: 'public_order_protest_violent',
    category: 'public_order',
    code: 'ME',
    title: T('Meeleavaldus läks üle vägivallaks', 'Demonstration turned violent'),
    priority: 1,
    weight: 0.008,
    hours: 'evening',
    places: ['government', 'oldtown', 'street'],
    units: { need: [un('any', 3)], ideal: [un('rapid', 2), un('patrol', 3)] },
    onScene: [90, 150],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 40], record: 0.5, intoxicated: 0.4 },
      { role: 'suspect', gender: 'M', age: [18, 40], record: 0.3, intoxicated: 0.3 },
      { role: 'victim', gender: 'any', age: [20, 60] },
    ],
    summary: [
      T(
        '{address}. Alguses rahumeelne protest muutus vägivaldseks. Politseinikke rünnati, on mitu vigastatut.',
        '{address}. An initially peaceful protest has turned violent. Police officers were attacked and several people are injured.',
      ),
      T(
        '{address}. Meeleavaldajad loobivad politseiketti kivide ja pudelitega, prügikastid on süüdatud. Osalejaid on sadu.',
        '{address}. Protesters are pelting the police line with stones and bottles; bins have been set alight. Hundreds involved.',
      ),
    ],
    callerLines: [
      T(
        'Siin on täielik kaos! Nad loobivad kive, üks politseinik on maas!',
        'It is complete chaos here! They are throwing stones, a police officer is down!',
      ),
      T(
        'Ma olen kohviku omanik, nad lõhuvad aknaid ja süütasid prügikasti.',
        'I own a café here, they are smashing windows and set a bin on fire.',
      ),
    ],
    details: [
      T(
        'Õhutajate tuumik on umbes kakskümmend maskeeritud noormeest.',
        'The core of the agitators is about twenty masked young men.',
      ),
      T('Üks õhutaja: {suspect}.', 'One agitator: {suspect}.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Mitu vigastatut', 'Several injured') }],
    beats: [
      backup(0.77, un('rapid', 2), {
        at: 'arrive',
        radio: [
          T(
            '{callsign}: kett on rünnaku all, vajame kiirreageerijaid ja kõiki vabu ekipaaže!',
            '{callsign}: the line is under attack, we need rapid response and every free unit!',
          ),
        ],
      }),
      kiirabi(2, {
        radio: [
          T(
            '{callsign}: mitu vigastatut, sh politseinik. Kiirabi kogunemispunkti!',
            '{callsign}: several injured, including an officer. Ambulance to the assembly point!',
          ),
        ],
      }),
      choice(
        6,
        [
          T(
            '{callsign}: rühm meeleavaldajaid murrab läbi keti. Kas kasutame pipragaasi ja peame õhutajad kinni või hoiame distantsi?',
            '{callsign}: a group is breaking through the line. Pepper spray and arrest the agitators, or hold our distance?',
          ),
        ],
        [
          opt(
            'force',
            T('Pipragaas ja kinnipidamised', 'Pepper spray and arrests'),
            T(
              '{callsign}, juhtimine. Kasutage erivahendeid, pidage õhutajad kinni.',
              '{callsign}, Control. Use your equipment, arrest the agitators.',
            ),
            { success: 0.1, risk: 0.1, trust: -2, arrests: 3 },
          ),
          opt(
            'hold',
            T('Hoidke distantsi', 'Hold distance'),
            T(
              '{callsign}, juhtimine. Hoidke ketti, ärge laske end provotseerida.',
              '{callsign}, Control. Hold the line, do not get provoked.',
            ),
            { time: 20, success: -0.05, risk: -0.05 },
          ),
        ],
        'hold',
      ),
      toArrest(20, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'controlled',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Õhutajad peeti kinni ja olukord stabiliseeriti. Alustati kriminaalmenetlust KarS § 263 ja § 274 järgi.',
          'The agitators were detained and the situation stabilised. Criminal proceedings opened under KarS § 263 and § 274.',
        ),
        { arrests: 6, injuries: 3, trust: 4 },
      ),
      oc(
        'dispersed',
        'report',
        [0.3, 0.65],
        3,
        T(
          'Rahvahulk hajutati, mitu õhutajat tuvastati videost. Vigastatud viidi haiglasse.',
          'The crowd was dispersed and several agitators identified from video. The injured were taken to hospital.',
        ),
        { arrests: 2, injuries: 4 },
      ),
      oc(
        'riot',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Rahutused kestsid tunde, kahjustati mitut hoonet ja autot. Vigastatuid on kümmekond.',
          'The unrest lasted for hours; several buildings and cars were damaged. About ten people are injured.',
        ),
        { injuries: 8, trust: -8 },
      ),
    ],
    tags: ['crowd', 'riot'],
    legacy: true,
  },
  {
    id: 'public_order_suspicious_parked_car',
    category: 'public_order',
    code: 'KS',
    title: T('Kahtlane parkiv sõiduk', 'Suspicious parked vehicle'),
    priority: 3,
    weight: 0.6,
    hours: 'flat',
    places: ['residential', 'street', 'parking'],
    units: { need: [un('patrol', 1)] },
    onScene: [20, 45],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 55], record: 0.3, wanted: 0.05 },
      { role: 'caller', gender: 'any', age: [30, 80], relation: 'neighbour' },
    ],
    vehicles: [{ role: 'involved', kind: 'car', stolen: 0.15, noInsurance: 0.2, driverRole: 'suspect' }],
    summary: [
      T(
        '{address}. Kortermaja ees seisab mitu päeva tundmatu sõiduk. Elanikud kahtlustavad, et keegi jälgib neid.',
        '{address}. An unknown vehicle has been parked outside the block for several days. Residents suspect someone is watching them.',
      ),
      T(
        '{address}. Majade vahel seisab {car}, salongis istuvad kaks meest ja jälgivad maja juba mitu tundi.',
        '{address}. A {car} is parked between the buildings with two men inside who have been watching the block for hours.',
      ),
    ],
    callerLines: [
      T(
        'See auto seisab siin juba kolmandat päeva, vahel istub keegi sees ja vaatab meie aknaid.',
        'That car has been here for three days; sometimes someone sits in it and looks at our windows.',
      ),
      T(
        'Ma kardan, et nad uurivad, millal keegi kodus pole.',
        'I am afraid they are checking when nobody is at home.',
      ),
    ],
    details: [
      T('Sõiduki number on {plate}.', 'The registration is {plate}.'),
      T(
        'Üks elanik väidab, et autost pildistati tema akent.',
        'One resident says someone photographed her window from the car.',
      ),
    ],
    beats: [
      qVehicle('arrive'),
      backup(0.12, un('patrol'), { at: 3 }),
      choice(
        4,
        [
          T(
            '{callsign}: autos istub kaks meest. Kas läheneme ja kontrollime dokumente või jälgime eemalt?',
            '{callsign}: two men in the car. Approach and check IDs, or observe from a distance?',
          ),
        ],
        [
          opt(
            'approach',
            T('Lähenege ja kontrollige', 'Approach and check'),
            T(
              '{callsign}, juhtimine. Kontrollige isikud, olge ettevaatlikud.',
              '{callsign}, Control. Check them, be careful.',
            ),
            { success: 0.1, risk: 0.05 },
          ),
          opt(
            'observe',
            T('Jälgige eemalt', 'Observe from a distance'),
            T(
              '{callsign}, juhtimine. Jälgige eemalt ja andke teada.',
              '{callsign}, Control. Watch from a distance and report.',
            ),
            { time: 15 },
          ),
        ],
        'approach',
      ),
      qPerson('suspect', 6, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'bailiff',
        'resolved',
        [0.45, 1],
        3,
        T(
          'Selgus, et autos olid kohtutäituri töötajad, kes ootasid võlgnikku. Elanikke rahustati.',
          'It turned out the men were bailiff staff waiting for a debtor. The residents were reassured.',
        ),
      ),
      oc(
        'stolen',
        'report',
        [0.6, 1],
        1,
        T(
          'Sõiduk osutus varastatuks. See teisaldati ja omanikku teavitati, alustati menetlust.',
          'The vehicle turned out to be stolen. It was towed, the owner informed and proceedings opened.',
        ),
        { trust: 2 },
      ),
      oc(
        'guest',
        'unfounded',
        [0, 0.45],
        2,
        T(
          'Auto kuulub naabri külalisele, ohtu ei ole.',
          'The car belongs to a neighbour’s guest; there is no threat.',
        ),
      ),
      oc(
        'drove_off',
        'escaped',
        [0, 0.3],
        1,
        T(
          'Sõiduk lahkus kiiresti patrulli lähenedes. Number on teada, info edastati kriminaalpolitseile.',
          'The car drove off quickly as the patrol approached. The plate is known and was passed to CID.',
        ),
        { trust: -1 },
      ),
    ],
    falseAlarmChance: 0.3,
    tags: ['suspicious', 'vehicle'],
    legacy: true,
  },
  {
    id: 'public_order_homeless_stairwell',
    category: 'public_order',
    code: 'AK',
    title: T('Kodutu tungis trepikotta', 'Homeless man in the stairwell'),
    priority: 4,
    weight: 0.7,
    hours: 'night',
    seasons: ['autumn', 'winter', 'spring'],
    places: ['residential'],
    units: { need: [un('patrol', 1)] },
    onScene: [20, 45],
    persons: [
      { role: 'suspect', gender: 'M', age: [35, 70], intoxicated: 0.7, record: 0.3 },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Elanike teatel magab kodutu mees öösiti trepikojas ja keeldub lahkumast.',
        '{address}. Residents report a homeless man sleeping in the stairwell at night who refuses to leave.',
      ),
      T(
        '{address}. Keldrikorrusel ööbib mitu ööd joobes mees, trepikojas on prügi ja tugev lõhn.',
        '{address}. A drunk man has been sleeping in the basement for several nights; there is rubbish and a strong smell in the stairwell.',
      ),
    ],
    callerLines: [
      T(
        'Elanikud teatavad, et kodutu mees magab öösiti trepikojas ja keeldub lahkumast.',
        'Residents say a homeless man sleeps in the stairwell at night and refuses to leave.',
      ),
      T(
        'Ma ei taha teda tänavale ajada, väljas on külm, aga lapsed kardavad mööda minna.',
        'I do not want to throw him out, it is cold outside, but the children are scared to walk past.',
      ),
    ],
    details: [
      T('Väljas on täna öösel tugev külm.', 'It is bitterly cold outside tonight.'),
      T('Mees on varem ööbinud varjupaigas.', 'The man has stayed at the shelter before.'),
    ],
    referral: { agency: 'kov', chance: 0.3 },
    beats: [
      qPerson('suspect', 'arrive'),
      backup(0.03, un('patrol'), { at: 3 }),
      choice(
        5,
        [
          T(
            '{callsign}: väljas on tugev külm. Kas viime mehe öömajja, toimetame kainenema või lihtsalt eemaldame trepikojast?',
            '{callsign}: it is freezing outside. Take him to the night shelter, to sober up, or just remove him from the stairwell?',
          ),
        ],
        [
          opt(
            'shelter',
            T('Öömajja', 'Night shelter'),
            T(
              '{callsign}, juhtimine. Viige öömajja, helistan neile ette.',
              '{callsign}, Control. Take him to the night shelter, I will call ahead.',
            ),
            { time: 20, success: 0.1, trust: 2 },
          ),
          opt(
            'sober',
            T('Kainenema', 'To sober up'),
            T('{callsign}, juhtimine. Toimetage kainenema.', '{callsign}, Control. Take him to sober up.'),
            { time: 15, success: 0.05 },
          ),
          opt(
            'remove',
            T('Eemaldage trepikojast', 'Remove from the stairwell'),
            T(
              '{callsign}, juhtimine. Eemaldage ja lõpetage sündmus.',
              '{callsign}, Control. Remove him and close the event.',
            ),
            { success: -0.1, trust: -3 },
          ),
        ],
        'sober',
      ),
    ],
    outcomes: [
      oc(
        'shelter',
        'resolved',
        [0.5, 1],
        3,
        T(
          'Mees toimetati öömajja, elanikele selgitati edasist tegutsemist.',
          'The man was taken to the night shelter and the residents were told what to do next.',
        ),
        { trust: 1 },
      ),
      oc(
        'sober',
        'referred',
        [0.3, 0.65],
        2,
        T(
          'Mees toimetati kainenema, omavalitsust teavitati abivajadusest.',
          'The man was taken to sober up and the municipality was informed of his needs.',
        ),
      ),
      oc(
        'removed',
        'warning',
        [0, 0.4],
        2,
        T(
          'Mees eemaldati trepikojast ja ta lahkus tundmatus suunas.',
          'The man was removed from the stairwell and left in an unknown direction.',
        ),
        { trust: -2 },
      ),
    ],
    tags: ['social'],
    legacy: true,
  },
  {
    id: 'public_order_garage_noise',
    category: 'public_order',
    code: 'ÖR',
    title: T('Müra garaažist hilistel tundidel', 'Late-night noise from a garage'),
    priority: 4,
    weight: 0.35,
    hours: 'night',
    places: ['house', 'residential', 'industrial'],
    units: { need: [un('patrol', 1)] },
    onScene: [20, 50],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 55], record: 0.4, wanted: 0.04 },
      { role: 'caller', gender: 'any', age: [30, 80], relation: 'neighbour' },
    ],
    vehicles: [{ role: 'involved', kind: 'car', stolen: 0.3, noInspection: 0.4 }],
    summary: [
      T(
        '{address}. Naabrid kuulevad öösiti garaažist mehaanilisi helisid. Kahtlustatakse ebaseaduslikku tegevust.',
        '{address}. Neighbours hear mechanical noises from a garage at night. Illegal activity is suspected.',
      ),
      T(
        '{address}. Garaažiboksist kostab igal ööl nurgalihvija häält, sinna sõidavad võõrad autod ilma numbriteta.',
        '{address}. An angle grinder is heard from a garage unit every night; unfamiliar cars without plates drive in.',
      ),
    ],
    callerLines: [
      T(
        'Igal ööl kella kahe paiku hakkab garaažis lihvimine. Ja sealt viiakse välja autoosi.',
        'Every night around two the grinding starts in the garage. And car parts get carried out.',
      ),
      T(
        'Ma ei saa magada ja ausalt öeldes tundub see kõik väga kahtlane.',
        'I cannot sleep and honestly it all looks very suspicious.',
      ),
    ],
    details: [
      T('Garaaži ees seisab {car}, number {plate}.', 'A {car}, plate {plate}, is parked outside the garage.'),
      T(
        'Naabri sõnul viiakse garaažist välja autoosi.',
        'A neighbour says car parts are being carried out of the garage.',
      ),
    ],
    beats: [
      qVehicle('arrive'),
      backup(0.15, un('patrol'), { at: 3 }),
      qPerson('suspect', 5, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'hobby',
        'warning',
        [0.4, 1],
        3,
        T(
          'Garaažis remontis mees oma autot. Talle selgitati öörahu nõudeid ja töö lõpetati.',
          'The man was repairing his own car. He was reminded of the night-time quiet rules and stopped work.',
        ),
      ),
      oc(
        'chopshop',
        'arrest',
        [0.65, 1],
        1,
        T(
          'Garaažist leiti lahtivõetud varastatud sõidukid. Kaks isikut peeti kinni, alustati kriminaalmenetlust KarS § 202 järgi.',
          'Stolen vehicles being stripped were found in the garage. Two people were detained; criminal proceedings opened under KarS § 202.',
        ),
        { arrests: 2, trust: 3 },
      ),
      oc(
        'fine',
        'fine',
        [0.25, 0.6],
        2,
        T('Öörahu rikkujale koostati väärteoprotokoll.', 'The man was fined for breaking night-time quiet.'),
      ),
      oc(
        'locked',
        'unfounded',
        [0, 0.3],
        1,
        T(
          'Patrulli saabudes oli garaaž lukus ja vaikne.',
          'The garage was locked and quiet when the patrol arrived.',
        ),
      ),
    ],
    tags: ['noise', 'suspicious'],
    legacy: true,
  },
  {
    id: 'public_order_photographing_houses',
    category: 'public_order',
    code: 'KI',
    title: T('Tundmatu isik pildistab maju', 'Stranger photographing houses'),
    priority: 4,
    weight: 0.35,
    hours: 'day',
    places: ['house', 'residential', 'street', 'village'],
    units: { need: [un('patrol', 1)] },
    onScene: [15, 35],
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 60], record: 0.3, wanted: 0.05 },
      { role: 'caller', gender: 'any', age: [40, 85], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Elanik nägi isikut, kes käis tänaval ja pildistas pikalt hooneid ja aknaid.',
        '{address}. A resident saw a person walking along the street taking photos of buildings and windows for a long time.',
      ),
      T(
        '{address}. Võõras mees pildistab eramute hoove ja märgib midagi vihikusse. Naabrid kardavad, et luuratakse vargusteks.',
        '{address}. A stranger is photographing private yards and noting things in a notebook. Neighbours fear he is scouting for burglaries.',
      ),
    ],
    callerLines: [
      T(
        'Üks mees käib siin tänaval ja pildistab kõigi maju. Kui ma küsisin, ütles, et see pole minu asi.',
        'A man is walking up the street photographing everyone’s houses. When I asked, he said it was none of my business.',
      ),
      T(
        'Ta pildistas just minu akent ja kirjutas midagi üles.',
        'He just photographed my window and wrote something down.',
      ),
    ],
    details: [
      T('Kirjeldus: {suspect}.', 'Description: {suspect}.'),
      T(
        'Mees ütles küsimise peale, et on kinnisvarahindaja.',
        'When asked, the man said he was a property valuer.',
      ),
    ],
    beats: [qPerson('suspect', 'arrive'), backup(0.06, un('patrol'), { at: 4 })],
    outcomes: [
      oc(
        'valuer',
        'resolved',
        [0.4, 1],
        3,
        T(
          'Isik osutus kinnisvarahindajaks, kellel oli tellimus olemas. Elanikke rahustati.',
          'The man turned out to be a property valuer with a genuine assignment. The residents were reassured.',
        ),
      ),
      oc(
        'intel',
        'report',
        [0.65, 1],
        1,
        T(
          'Isikul on varasemaid karistusi murdvarguste eest. Teave edastati kriminaalpolitseile.',
          'The man has previous convictions for burglary. The information was passed to CID.',
        ),
        { trust: 2 },
      ),
      oc(
        'gone',
        'unfounded',
        [0, 0.4],
        2,
        T(
          'Isikut ei leitud. Elanikel soovitati järgmisel korral sõiduki number üles märkida.',
          'The man was not found. Residents were advised to note any vehicle plate next time.',
        ),
      ),
    ],
    falseAlarmChance: 0.3,
    tags: ['suspicious'],
    legacy: true,
  },
  {
    id: 'public_order_balcony_litter',
    category: 'public_order',
    code: 'NV',
    title: T('Naaber loopis prügi rõdult', 'Neighbour throwing rubbish off the balcony'),
    priority: 4,
    weight: 0.3,
    hours: 'evening',
    places: ['residential'],
    units: { need: [un('patrol', 1)] },
    onScene: [15, 30],
    persons: [
      { role: 'suspect', gender: 'any', age: [25, 80], relation: 'neighbour', known: true, intoxicated: 0.4 },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Ülemise korruse elanik viskas oma prügi alla tänavale ja keeldub vastutamast.',
        '{address}. An upstairs resident threw his rubbish down onto the street and refuses to take responsibility.',
      ),
      T(
        '{address}. Naaber viskab rõdult konisid ja toidujäätmeid, üks pudel kukkus mööduja lähedale.',
        '{address}. A neighbour throws cigarette butts and food waste off the balcony; a bottle landed near a passer-by.',
      ),
    ],
    callerLines: [
      T(
        'Ta viskas jälle prügikoti rõdult alla! Kõik on laiali minu auto peal.',
        'He threw a bag of rubbish off the balcony again! It is all over my car.',
      ),
      T(
        'Pudel kukkus meetri kaugusele minust. See on ju eluohtlik!',
        'A bottle landed a metre from me. That could have killed someone!',
      ),
    ],
    details: [T('Naabrite sõnul on see kestnud kuid.', 'Neighbours say this has been going on for months.')],
    referral: { agency: 'kov', chance: 0.5 },
    beats: [qPerson('suspect', 'arrive'), backup(0.02, un('patrol'), { at: 4 })],
    outcomes: [
      oc(
        'fine',
        'fine',
        [0.45, 1],
        3,
        T(
          'Naabrile koostati väärteoprotokoll prügistamise eest ja teda kohustati prügi koristama.',
          'The neighbour was fined for littering and ordered to clear up the rubbish.',
        ),
      ),
      oc(
        'kov',
        'referred',
        [0.2, 0.6],
        2,
        T('Juhtum edastati omavalitsuse järelevalvele.', 'The case was passed to the municipal inspectors.'),
      ),
      oc(
        'denied',
        'unfounded',
        [0, 0.35],
        2,
        T(
          'Naaber ei avanud ust ja tõendeid ei olnud. Teatajale soovitati juhtumid filmida.',
          'The neighbour did not open the door and there was no evidence. The caller was advised to film any future incidents.',
        ),
      ),
    ],
    tags: ['neighbours'],
    legacy: true,
  },
  {
    id: 'public_order_noisy_birthday',
    category: 'public_order',
    code: 'ÖR',
    title: T('Mürarikas sünnipäev', 'Noisy birthday party'),
    priority: 4,
    weight: 1.0,
    hours: 'night',
    weekendBoost: 1.8,
    places: ['residential', 'house'],
    units: { need: [un('patrol', 1)] },
    onScene: [15, 35],
    persons: [
      { role: 'suspect', gender: 'any', age: [20, 50], intoxicated: 0.7, relation: 'neighbour' },
      { role: 'caller', gender: 'any', age: [40, 85], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Majas peetakse sünnipäevapidu, mille muusika ja karjumine häirib naabreid.',
        '{address}. A birthday party is being held in the building; the music and shouting are disturbing the neighbours.',
      ),
      T(
        '{address}. Korteris on pidu kella 22-st, vali muusika ja trampimine, naabrid ei saa magada. Teataja ei soovi kohtuda.',
        '{address}. A party has been going on in a flat since 22.00 with loud music and stomping; the neighbours cannot sleep. The caller does not want to meet officers.',
      ),
    ],
    callerLines: [
      T(
        'Neil on jälle pidu, muusika on nii vali, et mu klaasid kapis kõlisevad.',
        'They are having another party, the music is so loud my glasses rattle in the cupboard.',
      ),
      T(
        'Ma käisin ise ütlemas, aga nad naersid mu välja.',
        'I went to tell them myself but they laughed at me.',
      ),
    ],
    details: [
      T(
        'Naabrid on sama korteri peale sel kuul juba kaks korda kaevanud.',
        'The neighbours have already complained about this flat twice this month.',
      ),
    ],
    beats: [
      backup(0.03, un('patrol'), { at: 4 }),
      qPerson('suspect', 2, { chance: 0.5 }),
      choice(
        3,
        [
          T(
            '{callsign}: peoperemees lubab muusika vaiksemaks keerata. Kaebusi on sel kuul juba kolm. Hoiatus või protokoll?',
            '{callsign}: the host promises to turn it down. This is the third complaint this month. Warning or a fine?',
          ),
        ],
        [
          opt(
            'warn',
            T('Hoiatus', 'Warning'),
            T('{callsign}, juhtimine. Tehke hoiatus.', '{callsign}, Control. Give a warning.'),
            { time: -5 },
          ),
          opt(
            'fine',
            T('Väärteoprotokoll', 'Misdemeanour fine'),
            T(
              '{callsign}, juhtimine. Vormistage väärteoprotokoll.',
              '{callsign}, Control. Issue a misdemeanour fine.',
            ),
            { success: 0.1, time: 10 },
          ),
        ],
        'warn',
      ),
    ],
    outcomes: [
      oc(
        'warning',
        'warning',
        [0.4, 1],
        3,
        T(
          'Peolised keerasid muusika vaiksemaks pärast hoiatust.',
          'The partygoers turned the music down after a warning.',
        ),
      ),
      oc(
        'fine',
        'fine',
        [0.5, 1],
        2,
        T(
          'Peo korraldajale koostati väärteoprotokoll öörahu rikkumise eest.',
          'The host was fined for breaking night-time quiet.',
        ),
      ),
      oc(
        'again',
        'warning',
        [0, 0.4],
        2,
        T(
          'Pidu jätkus pärast patrulli lahkumist ja naabrid helistasid uuesti.',
          'The party resumed after the patrol left and the neighbours called again.',
        ),
        { trust: -2 },
      ),
    ],
    expiresMin: 60,
    interactiveChance: 0.1,
    call: {
      mood: 'elderly',
      opening: [
        T(
          'Tere... vabandage, et tülitan. Naabritel on pidu ja ma ei saa üldse magada.',
          'Hello... sorry to bother you. The neighbours are having a party and I cannot sleep at all.',
        ),
      ],
      openingRu: ['Извините за беспокойство... у соседей день рождения, музыка гремит, я не могу уснуть.'],
      answers: {
        when: [
          T('Kella kümnest saati, nüüd on juba pool kaks.', 'Since ten o’clock, now it is half past one.'),
        ],
        count: [T('Kümmekond inimest kindlasti.', 'At least ten people.')],
        name: [T('Pigem ei ütleks, ma ei taha tülisid.', 'I would rather not say, I do not want trouble.')],
      },
    },
    tags: ['noise'],
    legacy: true,
    scenarios: SC_NOISY_BIRTHDAY,
  },
  {
    id: 'public_order_parking_dispute',
    category: 'public_order',
    code: 'NV',
    title: T('Parkimisvaidlus eskaleerus sõimamiseks', 'Parking dispute turned into abuse'),
    priority: 3,
    weight: 0.6,
    hours: 'commute',
    places: ['parking', 'residential', 'street', 'mall'],
    units: { need: [un('patrol', 1)] },
    onScene: [20, 40],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 65], intoxicated: 0.1, record: 0.2 },
      { role: 'victim', gender: 'any', age: [25, 70] },
    ],
    vehicles: [
      { role: 'involved', kind: 'car', driverRole: 'suspect', noInsurance: 0.08 },
      { role: 'involved', kind: 'car', driverRole: 'victim' },
    ],
    summary: [
      T(
        '{address}. Kahe autojuhi vaidlus parkimiskoha üle muutus valjuks ja ähvardavaks.',
        '{address}. An argument between two drivers over a parking space has become loud and threatening.',
      ),
      T(
        '{address}. Elanik blokeeris oma autoga naabri sõiduki ja keeldub seda eemaldamast, pooled sõimavad teineteist.',
        '{address}. A resident has blocked a neighbour’s car in with his own and refuses to move it; the two are hurling abuse.',
      ),
    ],
    callerLines: [
      T(
        'Ta pani oma auto mulle ette ja ütleb, et see on tema koht. Ma pean tööle minema!',
        'He parked in front of my car and says it is his space. I need to get to work!',
      ),
      T(
        'Ta karjub, et lõikab mu rehvid läbi, kui ma veel siia pargin.',
        'He is shouting that he will slash my tyres if I park here again.',
      ),
    ],
    details: [
      T('Blokeeriv sõiduk: {car}, {plate}.', 'The blocking car: {car}, {plate}.'),
      T(
        'Üks juhtidest ähvardas teise auto rehvid läbi lõigata.',
        'One driver threatened to slash the other’s tyres.',
      ),
    ],
    beats: [
      qVehicle('arrive'),
      qPerson('suspect', 3, { chance: 0.6 }),
      backup(0.02, un('patrol'), { at: 4 }),
    ],
    outcomes: [
      oc(
        'resolved',
        'resolved',
        [0.4, 1],
        3,
        T('Pooled lepitati ja sõiduk teisaldati.', 'The parties were calmed down and the car was moved.'),
      ),
      oc(
        'fine',
        'fine',
        [0.3, 0.7],
        2,
        T(
          'Blokeerijale koostati väärteoprotokoll ja sõiduk teisaldati.',
          'The driver who blocked the car was fined and his vehicle moved.',
        ),
      ),
      oc(
        'threat',
        'report',
        [0.65, 1],
        1,
        T(
          'Ähvarduste tõttu alustati kriminaalmenetlust KarS § 120 järgi.',
          'Criminal proceedings opened under KarS § 120 over the threats.',
        ),
      ),
      oc(
        'gone',
        'unfounded',
        [0, 0.35],
        2,
        T(
          'Pooled olid patrulli saabudes laiali läinud.',
          'Both parties had gone by the time the patrol arrived.',
        ),
      ),
    ],
    expiresMin: 40,
    tags: ['neighbours', 'vehicle'],
    legacy: true,
  },
  {
    id: 'public_order_night_fireworks',
    category: 'public_order',
    code: 'ÖR',
    title: T('Ilutulestik öisel ajal', 'Fireworks at night'),
    priority: 4,
    weight: 0.5,
    hours: 'night',
    weekendBoost: 1.4,
    places: ['residential', 'house', 'park', 'village'],
    units: { need: [un('patrol', 1)] },
    onScene: [15, 30],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 50], intoxicated: 0.6 },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Linna äärealal lasti öösel ilutulestikku, mis häiris elanikke ja äratas lapsed.',
        '{address}. Fireworks were set off at night on the edge of town, disturbing residents and waking children.',
      ),
      T(
        '{address}. Hoovis lastakse kell kaks öösel rakette, üks rakett tabas maja seina.',
        '{address}. Rockets are being launched in the yard at two in the morning; one hit the wall of a building.',
      ),
    ],
    callerLines: [
      T(
        'Kell on kaks öösel ja nad lasevad rakette! Mu lapsed ärkasid üles ja nutavad.',
        'It is two in the morning and they are setting off rockets! My kids woke up crying.',
      ),
      T(
        'Üks rakett lendas vastu meie rõdu, oleks võinud tulekahju tekkida.',
        'One rocket hit our balcony, it could have started a fire.',
      ),
    ],
    details: [
      T(
        'Raketid lastakse peolt, kus tähistatakse pulmi.',
        'The rockets are being launched from a wedding party.',
      ),
    ],
    beats: [qPerson('suspect', 'arrive', { chance: 0.6 }), backup(0.03, un('patrol'), { at: 4 })],
    outcomes: [
      oc(
        'fine',
        'fine',
        [0.45, 1],
        3,
        T(
          'Pürotehnika loata kasutajale koostati väärteoprotokoll, ülejäänud raketid võeti hoiule.',
          'The person using fireworks without permission was fined and the remaining rockets were confiscated.',
        ),
      ),
      oc(
        'warning',
        'warning',
        [0.2, 0.6],
        2,
        T('Peolised lõpetasid laskmise pärast hoiatust.', 'The partygoers stopped after a warning.'),
      ),
      oc(
        'unknown',
        'unfounded',
        [0, 0.35],
        2,
        T(
          'Laskjaid ei tuvastatud, ilutulestik oli lõppenud.',
          'The people setting them off were not identified; the fireworks had stopped.',
        ),
      ),
    ],
    expiresMin: 30,
    tags: ['noise'],
    legacy: true,
  },

  // ─── Everyday police work ─────────────────────────────────────────────────
  {
    id: 'public_order_drunk_lying',
    category: 'public_order',
    code: 'JI',
    title: T('Joobes isik lamab maas', 'Intoxicated person lying on the ground'),
    priority: 3,
    weight: 2.5,
    hours: 'nightlife',
    weekendBoost: 1.4,
    places: ['street', 'busstation', 'park', 'residential', 'trainstation'],
    units: { need: [un('patrol', 1)] },
    onScene: [20, 45],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 70], intoxicated: 0.95, record: 0.3, wanted: 0.03 },
      { role: 'caller', gender: 'any', age: [18, 75] },
    ],
    summary: [
      T(
        '{address}. Joobes mees lamab kõnniteel ja reageerib kõnetamisele vähe. Möödujad peatusid.',
        '{address}. A drunk man is lying on the pavement and barely responds when spoken to. Passers-by have stopped.',
      ),
      T(
        '{address}. Trepikoja ees lamab mees, tugev alkoholilõhn, peas marrastus.',
        '{address}. A man is lying outside a stairwell, strong smell of alcohol, graze on his head.',
      ),
      T(
        '{address}. Bussipeatuse kõrval lamab isik muru peal, ise püsti ei tõuse. Ilm on jahe.',
        '{address}. A person is lying on the grass by a bus stop and cannot get up. The weather is cold.',
      ),
    ],
    callerLines: [
      T(
        'Siin lamab mees maas, ta on vist purjus, aga ma ei tea, kas tal on midagi viga.',
        'There is a man lying here, probably drunk, but I do not know if something is wrong with him.',
      ),
      T(
        'Ta ei suuda püsti tõusta ja väljas on külm. Kas keegi saab tulla?',
        'He cannot get up and it is cold outside. Can someone come?',
      ),
    ],
    details: [
      T('Isik: {suspect}.', 'Subject: {suspect}.'),
      T(
        'Mehel on käes poolik pudel, taskus on dokumendid.',
        'The man has a half-empty bottle in his hand and documents in his pocket.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.3, reason: T('Võimalik peavigastus', 'Possible head injury') }],
    beats: [
      qPerson('suspect', 'arrive'),
      choice(
        3,
        [
          T(
            '{callsign}: isik tugevas joobes, ise liikuda ei suuda. Kas toimetame kainenema, kutsume kiirabi või viime koju?',
            '{callsign}: subject heavily intoxicated, cannot walk. Sobering-up cell, ambulance, or drive him home?',
          ),
        ],
        [
          opt(
            'sober',
            T('Kainenema', 'To sober up'),
            T('{callsign}, juhtimine. Toimetage kainenema.', '{callsign}, Control. Take him to sober up.'),
            { success: 0.05, time: 10 },
          ),
          opt(
            'kiirabi',
            T('Kutsuge kiirabi', 'Call an ambulance'),
            T(
              '{callsign}, juhtimine. Kiirabi on teel, jääge isiku juurde.',
              '{callsign}, Control. Ambulance on its way, stay with him.',
            ),
            { success: 0.1, time: 15 },
          ),
          opt(
            'home',
            T('Viige koju', 'Drive him home'),
            T(
              '{callsign}, juhtimine. Viige koju, andke lähedastele üle.',
              '{callsign}, Control. Drive him home and hand him over to family.',
            ),
            { trust: 1, time: 5 },
          ),
        ],
        'sober',
      ),
      toSober(8, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'sober',
        'resolved',
        [0.4, 1],
        3,
        T(
          'Isik toimetati ohu vältimiseks kainenema, arstlik kontroll tehti arestimajas.',
          'The man was taken to sober up for his own safety and checked by a medic at the arrest house.',
        ),
      ),
      oc(
        'home',
        'resolved',
        [0.45, 1],
        2,
        T('Isik toimetati koju lähedaste hoole alla.', 'The man was taken home into his family’s care.'),
        { trust: 1 },
      ),
      oc(
        'hospital',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Isikul tuvastati peavigastus, kiirabi toimetas ta haiglasse.',
          'The man was found to have a head injury and was taken to hospital by ambulance.',
        ),
        { injuries: 1 },
      ),
    ],
    escalation: {
      afterMin: 45,
      chance: 0.2,
      toPriority: 2,
      text: T(
        'Möödujad: mees ei reageeri enam kõnetamisele, väljas on külm.',
        'Passers-by: the man no longer responds and it is cold outside.',
      ),
    },
    interactiveChance: 0.1,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, siin lamab üks mees maas, tundub purjus.',
          'Hello, there is a man lying on the ground here, looks drunk.',
        ),
      ],
      openingRu: ['Тут мужчина лежит у подъезда, не шевелится, похоже пьяный, на улице холодно.'],
      answers: {
        injured: [
          T('Peas on väike kriimustus, muud ei näe.', 'A small scratch on his head, nothing else I can see.'),
        ],
        intoxicated: [
          T(
            'Haiseb alkoholi järele, pudel on kõrval.',
            'He smells of alcohol, there is a bottle next to him.',
          ),
        ],
        safe: [T('Ta lamab kõnniteel, mitte sõiduteel.', 'He is on the pavement, not on the road.')],
      },
    },
    tags: ['alcohol'],
    scenarios: SC_DRUNK_LYING,
  },
  {
    id: 'public_order_drunk_on_road',
    category: 'public_order',
    code: 'JI',
    title: T('Joobes isik sõiduteel', 'Intoxicated person on the road'),
    priority: 1,
    weight: 0.4,
    hours: 'nightlife',
    weekendBoost: 1.3,
    places: ['street', 'highway', 'ruralroad'],
    units: { need: [un('any', 1)] },
    onScene: [15, 35],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 65], intoxicated: 0.95, record: 0.3 },
      { role: 'caller', gender: 'any', age: [20, 70] },
    ],
    summary: [
      T(
        '{address}. Joobes mees lamab sõiduteel, autod põiklevad. Teataja jääb kohale ja vilgutab ohutulesid.',
        '{address}. A drunk man is lying in the road and cars are swerving around him. The caller is staying with hazard lights on.',
      ),
      T(
        '{address}. Pimedas kõnnib joobes isik keset maanteed ega reageeri signaalidele.',
        '{address}. In the dark a drunk person is walking in the middle of the road and ignoring horns.',
      ),
    ],
    callerLines: [
      T(
        'Keset teed lamab inimene! Ma peaaegu sõitsin otsa, panin ohutuled põlema.',
        'There is a person lying in the middle of the road! I nearly ran him over, I have put my hazards on.',
      ),
      T(
        'Ta kõnnib keset maanteed ja kõigub, autod tulevad täie kiirusega.',
        'He is walking in the middle of the road, swaying, and cars are coming at full speed.',
      ),
    ],
    details: [
      T('Isik: {suspect}. Riietus tume, helkurit pole.', 'Subject: {suspect}. Dark clothes, no reflector.'),
      T('Lähim küla on kahe kilomeetri kaugusel.', 'The nearest village is two kilometres away.'),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}, kohal. Isik viidud sõiduteelt eemale, vilkurid põlevad.',
          '{callsign}, on scene. Subject moved off the road, blue lights on.',
        ),
      ]),
      qPerson('suspect', 2),
      toSober(6, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'removed',
        'resolved',
        [0.4, 1],
        3,
        T(
          'Isik eemaldati sõiduteelt ja toimetati kainenema.',
          'The man was removed from the road and taken to sober up.',
        ),
        { trust: 2 },
      ),
      oc(
        'cold',
        'hospital',
        [0.15, 0.5],
        2,
        T(
          'Isik oli alajahtunud, ta toimetati kiirabiga haiglasse.',
          'The man was hypothermic and taken to hospital by ambulance.',
        ),
      ),
      oc(
        'hit',
        'tragedy',
        [0, 0.2],
        1,
        T(
          'Enne patrulli saabumist sõitis sõiduauto isikule otsa. Kiirabi toimetas ta raskes seisundis haiglasse.',
          'Before the patrol arrived a car hit the man. He was taken to hospital in a serious condition.',
        ),
        { injuries: 1, trust: -5 },
      ),
    ],
    tags: ['alcohol', 'traffic_related'],
  },
  {
    id: 'public_order_drunk_harassing',
    category: 'public_order',
    code: 'JI',
    title: T('Joobes isik ahistab möödujaid', 'Drunk person harassing passers-by'),
    priority: 3,
    weight: 1.5,
    hours: 'evening',
    weekendBoost: 1.4,
    places: ['street', 'mall', 'shop', 'busstation', 'trainstation', 'oldtown'],
    units: { need: [un('patrol', 1)] },
    onScene: [20, 40],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 60], intoxicated: 0.9, record: 0.45, wanted: 0.04 },
      { role: 'caller', gender: 'any', age: [18, 75] },
    ],
    summary: [
      T(
        '{address}. Joobes mees tülitseb möödujatega, sõimab ja kisub riietest. Liigub {direction}.',
        '{address}. A drunk man is picking fights with passers-by, swearing and grabbing at their clothes. Moving {direction}.',
      ),
      T(
        '{address}. Kaubanduskeskuse ees ahistab joobes isik inimesi, nõuab raha ja sigarette.',
        '{address}. A drunk person outside the shopping centre is pestering people, demanding money and cigarettes.',
      ),
    ],
    callerLines: [
      T(
        'Üks purjus mees haarab inimestel käest kinni ja karjub. Ta hirmutas mu last.',
        'A drunk man is grabbing people by the arm and shouting. He frightened my child.',
      ),
      T(
        'Ta sülitas mulle järele, kui ma raha ei andnud.',
        'He spat after me when I would not give him money.',
      ),
    ],
    details: [T('Isik: {suspect}.', 'Subject: {suspect}.')],
    beats: [qPerson('suspect', 'arrive'), toSober(8, { chance: 0.6 })],
    outcomes: [
      oc(
        'sober',
        'fine',
        [0.45, 1],
        3,
        T(
          'Isik toimetati kainenema, alustati väärteomenetlust avaliku korra rikkumise eest (KarS § 262).',
          'The man was taken to sober up; misdemeanour proceedings opened for breach of public order (KarS § 262).',
        ),
      ),
      oc(
        'warning',
        'warning',
        [0.25, 0.6],
        2,
        T(
          'Isik rahunes ja lahkus. Talle tehti hoiatus.',
          'The man calmed down and left. He was given a warning.',
        ),
      ),
      oc(
        'gone',
        'unfounded',
        [0, 0.35],
        2,
        T('Isik oli patrulli saabudes lahkunud.', 'The man had left by the time the patrol arrived.'),
      ),
    ],
    expiresMin: 45,
    tags: ['alcohol'],
    scenarios: SC_DRUNK_HARASSING,
  },
  {
    id: 'public_order_youth_vandalism',
    category: 'public_order',
    code: 'AK',
    title: T('Noortekamp lõhub', 'Youths vandalising'),
    priority: 3,
    weight: 0.8,
    hours: 'evening',
    weekendBoost: 1.3,
    places: ['park', 'busstation', 'residential', 'school', 'street'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 1), un('community', 1)] },
    onScene: [25, 50],
    persons: [
      { role: 'suspect', gender: 'M', age: [13, 19], intoxicated: 0.4, record: 0.2 },
      { role: 'caller', gender: 'any', age: [25, 80] },
    ],
    summary: [
      T(
        '{address}. Noortekamp lõhub bussiootepaviljoni klaase ja prügikaste. Umbes {n} noort.',
        '{address}. A group of youths is smashing bus shelter glass and bins. About {n} of them.',
      ),
      T(
        '{address}. Pargis loobivad noorukid kive, lõhkusid pingi ja valgusteid. Osa on alaealised.',
        '{address}. Teenagers are throwing stones in the park and have broken a bench and lights. Some are minors.',
      ),
    ],
    callerLines: [
      T(
        'Noored peksavad ootepaviljoni klaase puruks ja naeravad. Üks filmib.',
        'Some kids are smashing the bus shelter glass and laughing. One is filming.',
      ),
      T(
        'Ma ei julge midagi öelda, nad on suures grupis.',
        'I do not dare say anything, there is a big group of them.',
      ),
    ],
    details: [
      T(
        'Noored on osaliselt joobes, üks filmib telefoniga.',
        'Some of the youths are drunk; one is filming on his phone.',
      ),
      T('Ühte lõhkujat kirjeldatakse: {suspect}.', 'One of the vandals is described as: {suspect}.'),
    ],
    agencies: [{ agency: 'sotsiaal', chance: 0.3, reason: T('Alaealised', 'Minors') }],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.7 }),
      search(
        2,
        0.8,
        [
          T(
            '{callsign}: noored jooksid laiali {direction}, vaatame ümbruse läbi.',
            '{callsign}: the youths scattered {direction}, sweeping the area.',
          ),
        ],
        0.4,
      ),
      choice(
        6,
        [
          T(
            '{callsign}: kinni peetud kaks alaealist. Kas viime nad koju vanematele, kutsume vanemad jaoskonda või teavitame ainult lastekaitset?',
            '{callsign}: two minors held. Drive them home, call the parents to the station, or just notify child protection?',
          ),
        ],
        [
          opt(
            'home',
            T('Viige koju', 'Drive them home'),
            T(
              '{callsign}, juhtimine. Toimetage alaealised vanematele.',
              '{callsign}, Control. Take the minors to their parents.',
            ),
            { success: 0.1, time: 20, trust: 1 },
          ),
          opt(
            'station',
            T('Vanemad jaoskonda', 'Parents to the station'),
            T(
              '{callsign}, juhtimine. Tooge jaoskonda, kutsume vanemad.',
              '{callsign}, Control. Bring them in, we will call the parents.',
            ),
            { success: 0.05, time: 30 },
          ),
          opt(
            'notify',
            T('Teavitage lastekaitset', 'Notify child protection'),
            T(
              '{callsign}, juhtimine. Vormistage ja teavitage lastekaitset.',
              '{callsign}, Control. Do the paperwork and notify child protection.',
            ),
            { success: -0.05, time: -5 },
          ),
        ],
        'notify',
      ),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.5, 1],
        3,
        T(
          'Lõhkujad tuvastati. Alustati menetlust KarS § 203 järgi, alaealiste vanemaid ja lastekaitset teavitati.',
          'The vandals were identified. Proceedings opened under KarS § 203; the minors’ parents and child protection were informed.',
        ),
        { trust: 2 },
      ),
      oc(
        'fines',
        'fine',
        [0.3, 0.65],
        2,
        T(
          'Noortele koostati väärteoprotokollid avaliku korra rikkumise eest, kahju hüvitavad vanemad.',
          'The youths were fined for breach of public order; their parents will pay for the damage.',
        ),
      ),
      oc(
        'scattered',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Noored hajusid enne patrulli saabumist. Kahju dokumenteeriti, video edastati menetlejale.',
          'The youths scattered before the patrol arrived. The damage was recorded and the video passed to an investigator.',
        ),
        { trust: -1 },
      ),
    ],
    expiresMin: 40,
    tags: ['youth', 'vandalism'],
    scenarios: SC_YOUTH_VANDALISM,
  },
  {
    id: 'public_order_aggressive_customer',
    category: 'public_order',
    code: 'AK',
    title: T('Poes agressiivne klient', 'Aggressive customer in a shop'),
    priority: 2,
    weight: 1.0,
    hours: 'evening',
    places: ['shop', 'mall', 'gasstation'],
    units: { need: [un('patrol', 1)] },
    onScene: [20, 45],
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 60], intoxicated: 0.6, record: 0.4, wanted: 0.05 },
      { role: 'caller', gender: 'any', age: [18, 60], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Kaupluses sõimab klient kassapidajat, viskas kaupa põrandale ja keeldub lahkumast. Turvatöötaja on juures.',
        '{address}. In a shop a customer is abusing the cashier, threw goods on the floor and refuses to leave. A security guard is there.',
      ),
      T(
        '{address}. Joobes klient ründas müüjat, kui talle alkoholi ei müüdud. Mees on veel poes.',
        '{address}. A drunk customer attacked a shop assistant after being refused alcohol. The man is still in the shop.',
      ),
    ],
    callerLines: [
      T(
        'Siin poes on üks mees täiesti endast väljas, ta viskas pudeli vastu kassat!',
        'There is a man in the shop who has completely lost it, he threw a bottle at the till!',
      ),
      T(
        'Ta lõi mind, kui ma ütlesin, et pärast kella kümmet alkoholi ei müüda.',
        'He hit me when I said we do not sell alcohol after ten o’clock.',
      ),
    ],
    details: [
      T('Klient: {suspect}.', 'The customer: {suspect}.'),
      T('Kõik on valvekaamera salvestisel.', 'Everything is on CCTV.'),
    ],
    beats: [qPerson('suspect', 'arrive'), toArrest(10, { chance: 0.4 })],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        2,
        T(
          'Mees peeti kinni. Müüja ründamise eest alustati kriminaalmenetlust KarS § 121 järgi.',
          'The man was detained. Criminal proceedings opened under KarS § 121 for assaulting the shop assistant.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'fine',
        'fine',
        [0.35, 0.75],
        3,
        T(
          'Kliendile koostati väärteoprotokoll avaliku korra rikkumise eest, kauplus kehtestas talle sissepääsukeelu.',
          'The customer was fined for breach of public order and the shop banned him.',
        ),
      ),
      oc(
        'warning',
        'warning',
        [0.2, 0.55],
        2,
        T(
          'Klient rahunes ja lahkus. Talle tehti hoiatus.',
          'The customer calmed down and left. He was given a warning.',
        ),
      ),
      oc(
        'gone',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees lahkus enne patrulli saabumist. Salvestis edastati menetlejale.',
          'The man left before the patrol arrived. The footage was passed to an investigator.',
        ),
        { trust: -1 },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.15,
      toPriority: 1,
      text: T(
        'Teataja: mees haaras riiulilt noa ja ähvardab müüjat.',
        'Caller: the man has grabbed a knife off the shelf and is threatening the assistant.',
      ),
    },
    interactiveChance: 0.15,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Siin poes on klient, kes lõi müüjat. Saatke kohe keegi!',
          'A customer in the shop hit the assistant. Send someone now!',
        ),
      ],
      answers: {
        injured: [T('Müüjal on huul katki.', 'The assistant has a split lip.')],
        weapons: [T('Ei, aga ta loobib pudeleid.', 'No, but he is throwing bottles.')],
        intoxicated: [T('Ta on täiesti purjus.', 'He is completely drunk.')],
      },
    },
    tags: ['alcohol'],
    scenarios: SC_AGGRESSIVE_CUSTOMER,
  },
  {
    id: 'public_order_public_drinking',
    category: 'public_order',
    code: 'AK',
    title: T('Avalikus kohas alkoholi tarbimine', 'Drinking alcohol in public'),
    priority: 4,
    weight: 1.0,
    hours: 'evening',
    seasons: ['spring', 'summer', 'autumn'],
    places: ['park', 'beach', 'busstation', 'street'],
    units: { need: [un('any', 1)] },
    onScene: [15, 30],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 60], intoxicated: 0.7, record: 0.2 },
      { role: 'caller', gender: 'any', age: [25, 80] },
    ],
    summary: [
      T(
        '{address}. Pargipingil tarvitab seltskond alkoholi, prügi on maas. Teataja palub reageerida.',
        '{address}. A group is drinking on a park bench with rubbish on the ground. The caller asks for action.',
      ),
      T(
        '{address}. Laste mänguväljaku kõrval joovad kolm meest õlut ja ropendavad.',
        '{address}. Three men are drinking beer and swearing next to a children’s playground.',
      ),
    ],
    callerLines: [
      T(
        'Iga päev istuvad nad siin pingil ja joovad, lapsed ei saa mänguväljakule minna.',
        'They sit on this bench drinking every day; the kids cannot use the playground.',
      ),
      T(
        'Nad on purjus ja kusevad põõsasse, see on vastik.',
        'They are drunk and peeing in the bushes, it is disgusting.',
      ),
    ],
    details: [T('Seltskonnas on {n} inimest.', 'There are {n} people in the group.')],
    referral: { agency: 'kov', chance: 0.3 },
    beats: [qPerson('suspect', 'arrive', { chance: 0.7 })],
    outcomes: [
      oc(
        'fines',
        'fine',
        [0.4, 1],
        3,
        T(
          'Alkoholi tarbijatele koostati väärteoprotokollid avalikus kohas alkoholi tarbimise eest, joogid valati välja.',
          'The drinkers were fined for drinking in public and their drinks were poured away.',
        ),
      ),
      oc(
        'warning',
        'warning',
        [0.2, 0.6],
        2,
        T(
          'Seltskonda hoiatati, nad koristasid prügi ja lahkusid.',
          'The group was warned, cleared up their rubbish and left.',
        ),
      ),
      oc(
        'gone',
        'unfounded',
        [0, 0.35],
        2,
        T('Seltskond oli patrulli saabudes lahkunud.', 'The group had gone by the time the patrol arrived.'),
      ),
    ],
    expiresMin: 60,
    tags: ['alcohol'],
    scenarios: SC_PUBLIC_DRINKING,
  },
  {
    id: 'public_order_aggressive_beggar',
    category: 'public_order',
    code: 'AK',
    title: T('Agressiivne kerjus', 'Aggressive beggar'),
    priority: 4,
    weight: 0.35,
    hours: 'day',
    places: ['oldtown', 'mall', 'street', 'trainstation', 'shop'],
    units: { need: [un('patrol', 1)] },
    onScene: [15, 30],
    persons: [
      { role: 'suspect', gender: 'any', age: [30, 65], intoxicated: 0.6, record: 0.3 },
      { role: 'caller', gender: 'any', age: [20, 75] },
    ],
    summary: [
      T(
        '{address}. Kerjus käib inimestel järel, nõuab raha ja sõimab neid, kes ei anna.',
        '{address}. A beggar is following people, demanding money and abusing those who refuse.',
      ),
      T(
        '{address}. Sissepääsu juures haarab agressiivne kerjus möödujatel varrukast ja ähvardab.',
        '{address}. At the entrance an aggressive beggar is grabbing passers-by by the sleeve and making threats.',
      ),
    ],
    callerLines: [
      T(
        'Ta käis mul järel terve tänava ja nõudis raha. Kui ma ei andnud, hakkas karjuma.',
        'He followed me the whole street demanding money. When I refused he started shouting.',
      ),
      T(
        'Turistid kardavad siit mööda minna, ta haarab inimestel kinni.',
        'Tourists are afraid to walk past, he grabs hold of people.',
      ),
    ],
    details: [T('Isik: {suspect}.', 'Subject: {suspect}.')],
    referral: { agency: 'kov', chance: 0.3 },
    beats: [qPerson('suspect', 'arrive')],
    outcomes: [
      oc(
        'fine',
        'fine',
        [0.45, 1],
        3,
        T(
          'Isikule koostati väärteoprotokoll avaliku korra rikkumise eest ja ta eemaldati.',
          'The person was fined for breach of public order and moved on.',
        ),
      ),
      oc(
        'social',
        'referred',
        [0.25, 0.65],
        2,
        T(
          'Isik vajab sotsiaalabi, info edastati omavalitsusele.',
          'The person needs social support; the information was passed to the municipality.',
        ),
      ),
      oc(
        'gone',
        'unfounded',
        [0, 0.35],
        2,
        T('Isikut patrulli saabudes kohal ei olnud.', 'The person was gone when the patrol arrived.'),
      ),
    ],
    expiresMin: 60,
    tags: ['social'],
  },
  {
    id: 'public_order_football_fans',
    category: 'public_order',
    code: 'KL',
    title: T('Jalgpallifännide kokkupõrge', 'Football fans clash'),
    priority: 2,
    weight: 0.06,
    hours: 'evening',
    weekendBoost: 1.8,
    seasons: ['spring', 'summer', 'autumn'],
    places: ['stadium', 'street', 'bar'],
    units: { need: [un('patrol', 2)], ideal: [un('patrol', 3), un('rapid', 1)] },
    onScene: [40, 90],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 35], intoxicated: 0.8, record: 0.4 },
      { role: 'suspect', gender: 'M', age: [18, 35], intoxicated: 0.7, record: 0.3 },
      { role: 'victim', gender: 'M', age: [18, 40] },
    ],
    summary: [
      T(
        '{address}. Pärast jalgpallimängu põrkasid kahe klubi fännid kokku, kasutatakse pürotehnikat ja pudeleid. Osalejaid paarkümmend.',
        '{address}. After a football match fans of two clubs clashed using pyrotechnics and bottles. About twenty involved.',
      ),
      T(
        '{address}. Staadioni juures kaklevad külalis- ja kodumeeskonna toetajad, turvatöötajad ei saa hakkama.',
        '{address}. Home and away supporters are fighting near the stadium and stewards cannot cope.',
      ),
    ],
    callerLines: [
      T(
        'Fännid kaklevad staadioni ees, keegi viskas tõrviku inimeste sekka!',
        'Fans are fighting outside the stadium, someone threw a flare into the crowd!',
      ),
      T(
        'Ma olen turvajuht, meid on liiga vähe. Kaks gruppi lähevad kokku.',
        'I am the head steward, there are too few of us. Two groups are going at each other.',
      ),
    ],
    details: [
      T('Üks ässitaja: {suspect}.', 'One instigator: {suspect}.'),
      T('Külaliste fännibuss väljub tunni aja pärast.', 'The away fans’ bus leaves in an hour.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.5, reason: T('Vigastatud fännid', 'Injured fans') }],
    beats: [
      backup(0.6, un('patrol', 2), { at: 'arrive' }),
      choice(
        5,
        [
          T(
            '{callsign}: fännigrupid on kahel pool tänavat. Kas moodustame keti ja eraldame grupid või peame kinni ässitajad?',
            '{callsign}: the fan groups are on either side of the street. Form a line and separate them, or arrest the instigators?',
          ),
        ],
        [
          opt(
            'separate',
            T('Eraldage grupid', 'Separate the groups'),
            T(
              '{callsign}, juhtimine. Moodustage kett, saatke külalised bussini.',
              '{callsign}, Control. Form a line and escort the away fans to their bus.',
            ),
            { success: 0.1, time: 15 },
          ),
          opt(
            'arrest',
            T('Pidage ässitajad kinni', 'Arrest the instigators'),
            T(
              '{callsign}, juhtimine. Tuvastage ja pidage kinni ässitajad.',
              '{callsign}, Control. Identify and arrest the instigators.',
            ),
            { success: 0.05, risk: 0.1, arrests: 2 },
          ),
        ],
        'separate',
      ),
      toArrest(15, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrests',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Ässitajad peeti kinni, grupid eraldati ja külalised saadeti bussini. Alustati menetlust KarS § 263 järgi.',
          'The instigators were detained, the groups separated and the away fans escorted to their bus. Proceedings opened under KarS § 263.',
        ),
        { arrests: 3, trust: 3 },
      ),
      oc(
        'fines',
        'fine',
        [0.35, 0.7],
        2,
        T(
          'Olukord rahunes, mitmele fännile koostati väärteoprotokollid pürotehnika kasutamise eest.',
          'Things calmed down; several fans were fined for using pyrotechnics.',
        ),
      ),
      oc(
        'injuries',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Kokkupõrkes sai viga mitu inimest, osa ässitajaid jäi tuvastamata.',
          'Several people were injured in the clash and some instigators were not identified.',
        ),
        { injuries: 3, trust: -4 },
      ),
    ],
    tags: ['crowd', 'sport', 'alcohol'],
  },
  {
    id: 'public_order_midsummer_bonfire',
    category: 'public_order',
    code: 'AK',
    title: T('Jaanitule pidu väljus kontrolli alt', 'Midsummer bonfire party out of control'),
    priority: 2,
    weight: 1.2,
    hours: 'nightlife',
    weekendBoost: 1.2,
    months: [6],
    places: ['village', 'beach', 'park', 'summerhouse', 'farm'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 50], intoxicated: 0.95, record: 0.3 },
      { role: 'victim', gender: 'M', age: [18, 50], intoxicated: 0.7 },
      { role: 'witness', gender: 'any', age: [25, 65], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Jaanitule peol on palju purjus inimesi, puhkes kaklus ja üks mees lamab maas.',
        '{address}. There are lots of drunk people at a Midsummer bonfire party; a fight broke out and one man is on the ground.',
      ),
      T(
        '{address}. Külaplatsi jaanipeol ähvardavad purjus noored korraldajaid, alaealised joovad. Korraldaja palub abi.',
        '{address}. At the village Midsummer party drunk youths are threatening the organisers and minors are drinking. The organiser asks for help.',
      ),
    ],
    callerLines: [
      T(
        'Siin jaanitule ääres läks kakluseks, üks poiss on maas ja teised löövad edasi!',
        'A fight has broken out by the bonfire, one lad is down and the others keep hitting!',
      ),
      T(
        'Ma olen peo korraldaja, ma ei saa enam hakkama. Noored on täiesti purjus.',
        'I am the organiser, I cannot cope any more. The youngsters are completely drunk.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}.', 'Suspect: {suspect}.'),
      T(
        'Peol on mitusada inimest, turvatöötajaid kaks.',
        'There are several hundred people at the party and two security guards.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.3, reason: T('Kakluses vigastatu', 'Injured in a fight') }],
    beats: [
      qPerson('suspect', 'arrive'),
      kiirabi(3, {
        chance: 0.35,
        radio: [
          T(
            '{callsign}: noormehel peavigastus, palun kiirabi peoplatsile.',
            '{callsign}: young man with a head injury, request an ambulance to the party grounds.',
          ),
        ],
      }),
      toSober(12, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        2,
        T(
          'Lööja peeti kinni, alustati kriminaalmenetlust KarS § 121 järgi. Pidu jätkus rahulikult.',
          'The attacker was detained and criminal proceedings opened under KarS § 121. The party continued peacefully.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'fines',
        'fine',
        [0.35, 0.75],
        3,
        T(
          'Kaks isikut toimetati kainenema, alaealistelt võeti alkohol ära ja vanemaid teavitati.',
          'Two people were taken to sober up; alcohol was taken from the minors and their parents informed.',
        ),
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Lööja kadus rahvahulka. Kannatanu toimetati EMO-sse.',
          'The attacker disappeared into the crowd. The victim was taken to A&E.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    interactiveChance: 0.2,
    call: {
      mood: 'drunk',
      opening: [
        T(
          '(taustal muusika) Halloo, politsei? Siin jaanipeol on kaklus!',
          '(music in the background) Hello, police? There is a fight at the Midsummer party!',
        ),
      ],
      answers: {
        where: [
          T('Külaplatsil, lava taga... {address}.', 'On the village green, behind the stage... {address}.'),
        ],
        count: [T('Kaklevad viis-kuus tüüpi.', 'Five or six guys are fighting.')],
        injured: [T('Ühel on nina katki.', 'One has a broken nose.')],
        intoxicated: [T('Kõik on purjus, on ju jaanipäev!', 'Everyone is drunk, it is Midsummer!')],
      },
    },
    tags: ['alcohol', 'holiday'],
  },
  {
    id: 'public_order_car_music_parking',
    category: 'public_order',
    code: 'ÖR',
    title: T('Vali muusika autost parklas', 'Loud music from a car in a car park'),
    priority: 4,
    weight: 0.6,
    hours: 'night',
    weekendBoost: 1.5,
    seasons: ['spring', 'summer', 'autumn'],
    places: ['parking', 'gasstation', 'street', 'beach'],
    units: { need: [un('patrol', 1)] },
    onScene: [15, 30],
    persons: [
      { role: 'driver', gender: 'M', age: [18, 30], intoxicated: 0.2, noLicense: 0.1 },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    vehicles: [{ role: 'involved', kind: 'car', driverRole: 'driver', noInspection: 0.2, noInsurance: 0.08 }],
    summary: [
      T(
        '{address}. Parklas seisavad mitu autot, valjult mängib muusika ja mootorid möirgavad. Kestnud üle tunni.',
        '{address}. Several cars in a car park, loud music and revving engines. Going on for over an hour.',
      ),
      T(
        '{address}. Tankla parklas on kogunenud noored, ühest autost põrutab muusika. Auto: {car}.',
        '{address}. Young people have gathered in a filling station car park; music is booming from one car. Car: {car}.',
      ),
    ],
    callerLines: [
      T(
        'Juba tund aega põrutab bass, aknad värisevad. Nad kogunevad siia igal reedel.',
        'The bass has been thumping for an hour, the windows are shaking. They gather here every Friday.',
      ),
      T(
        'Nad teevad parklas ringe ja kihutavad, varsti juhtub midagi.',
        'They are doing laps of the car park and racing, something is going to happen.',
      ),
    ],
    details: [T('Auto number {plate}.', 'The car is {plate}.')],
    beats: [qVehicle('arrive'), qPerson('driver', 3, { chance: 0.7 })],
    outcomes: [
      oc(
        'warning',
        'warning',
        [0.4, 1],
        3,
        T('Noored lahkusid pärast hoiatust.', 'The young people left after a warning.'),
      ),
      oc(
        'fine',
        'fine',
        [0.45, 1],
        2,
        T(
          'Juhile koostati väärteoprotokoll öörahu rikkumise eest.',
          'The driver was fined for breaking night-time quiet.',
        ),
      ),
      oc(
        'gone',
        'unfounded',
        [0, 0.35],
        2,
        T('Autod lahkusid patrulli lähenedes.', 'The cars left as the patrol approached.'),
      ),
    ],
    expiresMin: 40,
    tags: ['noise', 'vehicle'],
  },
];
