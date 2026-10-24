/**
 * Lääne prefektuur: stories that only happen here (regions: ['laane']). The Pärnu breakwater in a storm and
 * the summer festival at Raeküla, beer runs and a Latvian pursuit over the Ikla border, the ferry ports and the
 * Väinatamm causeway, Soomaa's spring flood, a reed fire in Matsalu, seal pups on the beaches, a yacht at the
 * marina that skipped the border check and the Saaremaa rally.
 *
 * Same rules as escalating.ts: a unit on scene in time prevents the escalation, the best decision has the
 * highest success effect and the worst endings need a low success score. A story that fits only some places
 * of a kind names them with `placeTags` (the tags are on the places in src/data/regions/laane.ts).
 */
import type { IncidentTemplate } from '@/sim/types';
import {
  T,
  u,
  out,
  qp,
  qv,
  backup,
  agency,
  info,
  pursuit,
  search,
  choice,
  opt,
  R_SUSPECT,
  R_DRIVER,
} from '../escalating';

export const TEMPLATES_REGIONAL_LAANE: IncidentTemplate[] = [
  // 1. A storm watcher out at the end of the Pärnu breakwater with the waves breaking over it.
  {
    id: 'assist_parnu_muulil_tormis',
    category: 'assist',
    code: 'VEE',
    title: T('Inimene tormisel muulil', 'Person out on the breakwater in a storm'),
    priority: 2,
    weight: 0.8,
    // Storm surges come in autumn and winter, and nobody films the waves in the dark.
    hours: [0, 0, 0, 0, 0, 0, 0, 0.3, 0.8, 1.2, 1.5, 1.6, 1.6, 1.6, 1.5, 1.3, 1, 0.6, 0.3, 0.1, 0, 0, 0, 0],
    seasons: ['autumn', 'winter'],
    regions: ['laane'],
    places: ['park'],
    placeTags: ['breakwater'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('boat')] },
    onScene: [30, 70],
    persons: [
      { role: 'victim', gender: 'M', age: [17, 35], intoxicated: 0.4 },
      { role: 'caller', gender: 'any', age: [25, 75] },
    ],
    agencies: [
      {
        agency: 'paaste',
        chance: 1,
        reason: T(
          'Veepääste: inimene tormisel muulil',
          'Water rescue: a person on the breakwater in a storm',
        ),
      },
      {
        agency: 'kiirabi',
        chance: 0.6,
        reason: T('Märg ja alajahtunud mees muulil', 'Soaked, cold man on the breakwater'),
      },
    ],
    summary: [
      T(
        '{address}. Tormi ajal kõnnib noormees mööda muuli mere poole, lained löövad juba üle kivide. Teataja hüüdis teda, kuid mees ei pööra tagasi.',
        '{address}. In the storm a young man is walking out along the breakwater towards the open sea, with the waves already breaking over the stones. The caller shouted to him, but he will not turn back.',
      ),
      T(
        '{address}. Muuli otsas seisab inimene ja filmib telefoniga tormilaineid. Lained käivad üle muuli ja tagasitee on kohati vee all.',
        '{address}. Someone is standing at the end of the breakwater filming the storm waves on a phone. The waves are washing over the breakwater and parts of the way back are under water.',
      ),
      T(
        '{address}. Tormihoiatuse ajal on muuli otsa jäänud noormees, kes ei julge lainete pärast tagasi tulla. Kaldal on pealtvaatajad.',
        '{address}. During a storm warning a young man is stuck at the end of the breakwater, too afraid of the waves to come back. Onlookers are watching from the shore.',
      ),
    ],
    callerLines: [
      T(
        'Üks noormees kõnnib tormiga muuli otsa poole ja lained löövad juba üle muuli! Ma hüüdsin, aga ta ei kuule.',
        'A young man is walking out to the end of the breakwater in this storm and the waves are already going right over it! I shouted, but he cannot hear me.',
      ),
      T(
        'Mees seisab muuli päris otsas ja filmib. Iga laine katab ta peaaegu üleni.',
        'The man is standing right at the end of the breakwater, filming. Every wave almost covers him completely.',
      ),
      T(
        'Muuli otsas olev mees on vist purjus, tal oli õllepurk käes. Need kivid on ju märjad ja libedad.',
        'The man at the end of the breakwater is probably drunk, he had a beer can in his hand. Those stones are wet and slippery.',
      ),
    ],
    details: [
      T(
        'Ilmateenistus on andnud tormihoiatuse ja veetase tõuseb. Teataja kardab, et järgmine suur laine viib mehe vette.',
        'The weather service has issued a storm warning and the water is rising. The caller fears the next big wave will sweep the man into the sea.',
      ),
      T(
        'Muul on pikk ja kitsas, autoga sinna ei pääse ja otsani on tükk maad joosta.',
        'The breakwater is long and narrow; no car can get onto it and it is a long run to the end.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: oleme muuli alguses. Mees on muuli otsas, lained käivad temast üle. Läheme jalgsi nii kaugele kui saab.',
          '{callsign}: we are at the start of the breakwater. The man is at the far end with the waves going over him. Going out on foot as far as we can.',
        ),
      ]),
      choice(
        3,
        [
          T(
            '{callsign}: mees on muuli otsas kivide vahel ja kardab liikuda. Kas läheme talle ise järele või räägime temaga eemalt ja ootame päästjaid?',
            '{callsign}: the man is down among the stones at the end and is afraid to move. Do we go out to him ourselves or keep talking to him and wait for the rescuers?',
          ),
        ],
        [
          opt(
            'wait',
            T('Ärge minge lainetesse, oodake päästjaid', 'Stay out of the waves, wait for the rescuers'),
            T(
              '{callsign}, ärge minge ise lainetesse. Rääkige temaga, käskige tal kividest kinni hoida, päästjad on teel.',
              '{callsign}, do not go into the waves yourselves. Keep talking to him and tell him to hold on to the stones, the rescuers are on their way.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'go',
            T('Minge talle järele', 'Go out and get him'),
            T(
              '{callsign}, minge talle järele, olge ettevaatlikud.',
              '{callsign}, go out and get him, be careful.',
            ),
            { success: -0.1, risk: 0.1, outcome: 'officers_in_waves' },
          ),
        ],
        'go',
      ),
      info(12, [
        T(
          '{callsign}: päästjad jõudsid muulile, kiirabi ootab kaldal.',
          '{callsign}: the rescuers have reached the breakwater, the ambulance is waiting on the shore.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'rescued',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Päästjad tõid mehe muuli otsast ära. Ta oli läbimärg ja külmunud, kuid vigastusteta, kiirabi vaatas ta üle ja ta lubati koju.',
          'The rescuers brought the man back from the end of the breakwater. He was soaked and frozen but unhurt; the ambulance crew checked him over and he was allowed to go home.',
        ),
        {
          radio: T(
            '{callsign}: mees toodud muulilt ära, vigastusteta, lõpetame.',
            '{callsign}: man brought back off the breakwater, unhurt, closing.',
          ),
        },
      ),
      out(
        'came_back',
        'warning',
        [0.45, 1],
        2,
        T(
          'Torm vaibus veidi ja mees tuli päästjate juhendamisel ise mööda muuli tagasi. Talle selgitati, kui ohtlik on tormi ajal muulil käia.',
          'The storm eased a little and the man made his own way back along the breakwater, guided by the rescuers. It was explained to him how dangerous the breakwater is in a storm.',
        ),
        {
          radio: T(
            '{callsign}: mees tuli päästjate juhendamisel tagasi, hoiatus tehtud.',
            '{callsign}: man came back guided by the rescuers, warning given.',
          ),
        },
      ),
      out(
        'officers_in_waves',
        'hospital',
        [0, 0.05],
        1,
        T(
          'Politseinikud läksid lainete vahele mehele järele. Laine lõi mehe ja ühe politseiniku kividelt vette, nad said muuli servast kinni ja tõmmati välja. Mõlemad toimetati alajahtumise ja marrastustega haiglasse.',
          'The officers went out through the waves to get the man. A wave knocked him and one officer off the stones into the water; they caught hold of the edge of the breakwater and were pulled out. Both were taken to hospital with hypothermia and grazes.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: laine lõi mehe ja politseiniku vette, mõlemad haiglasse.',
            '{callsign}: wave knocked the man and an officer in, both to hospital.',
          ),
        },
      ),
      out(
        'cold',
        'hospital',
        [0.25, 0.65],
        2,
        T(
          'Laine lõi mehe kividelt vette, kuid ta sai muuli servast kinni ja ta tõmmati välja. Ta toimetati alajahtumise ja põlvevigastusega haiglasse.',
          'A wave knocked the man off the stones into the water, but he caught hold of the edge of the breakwater and was pulled out. He was taken to hospital with hypothermia and an injured knee.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: mees tõmmati veest, alajahtunud, haiglasse.',
            '{callsign}: man pulled from the water, hypothermic, to hospital.',
          ),
        },
      ),
      out(
        'swept',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Laine viis mehe muulilt merre. Merepääste leidis ta poole tunni pärast ranna lähedalt teadvuseta ja ta toimetati raskes seisus haiglasse.',
          'A wave swept the man off the breakwater. Sea rescue found him unconscious near the beach half an hour later and he was taken to hospital in a critical condition.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: laine viis mehe merre, leitud, raskes seisus haiglasse.',
            '{callsign}: wave swept the man away, found, critical, to hospital.',
          ),
        },
      ),
      out(
        'drowned',
        'tragedy',
        [0, 0.12],
        1,
        T(
          'Laine viis mehe muulilt merre ja tormis ei õnnestunud teda leida. Otsingud jätkuvad, kui torm vaibub.',
          'A wave swept the man off the breakwater and he could not be found in the storm. The search will continue when the storm dies down.',
        ),
        {
          radio: T(
            '{callsign}: laine viis mehe merre, otsingud jätkuvad.',
            '{callsign}: wave swept the man into the sea, search continues.',
          ),
        },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.5,
      toPriority: 1,
      text: T(
        'Teataja: suur laine lõi mehe pikali, ta hoiab kividest kinni ja vesi käib temast üle!',
        'Caller: a big wave knocked the man down, he is clinging to the stones and the water is washing over him!',
      ),
    },
    expiresMin: 50,
    interactiveChance: 0.35,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Üks mees läks tormiga muuli otsa ja lained löövad temast üle! Ta võib iga hetk vette kukkuda!',
          'A man has gone out to the end of the breakwater in the storm and the waves are breaking over him! He could fall in any moment!',
        ),
        T(
          'Muuli otsas on inimene, lained käivad üle muuli ja ta ei saa enam tagasi!',
          'There is someone at the end of the breakwater, the waves are going right over it and he cannot get back!',
        ),
      ],
      answers: {
        injured: [
          T(
            'Veel mitte, aga iga laine lööb ta peaaegu pikali.',
            'Not yet, but every wave nearly knocks him over.',
          ),
        ],
        count: [
          T(
            'Üks inimene, noor mees. Kaldal on veel paar pealtvaatajat.',
            'One person, a young man. There are a couple of onlookers on the shore.',
          ),
        ],
        intoxicated: [
          T(
            'Tal oli õllepurk käes, ta on vist purjus.',
            'He had a beer can in his hand, I think he is drunk.',
          ),
        ],
        safe: [
          T(
            'Mina olen kaldal, muuli alguses. Sinna ma ei lähe.',
            'I am on the shore at the start of the breakwater. I am not going out there.',
          ),
        ],
      },
      answersRu: {
        injured: ['Пока нет, но каждая волна чуть не сбивает его с ног.'],
        count: ['Один человек, молодой парень. На берегу ещё пара зевак.'],
        intoxicated: ['У него в руке была банка пива, наверное, пьяный.'],
        safe: ['Я на берегу, у входа на мол. Туда я не пойду.'],
      },
      openingRu: [
        'Один мужчина в шторм ушёл в самый конец мола, и его накрывает волнами! Он в любую секунду может упасть в воду!',
        'В конце мола человек, волны перехлёстывают через мол, и он уже не может вернуться!',
      ],
    },
    tags: ['water', 'storm'],
  },

  // 2. A beer run to the Latvian border shops: the driver drank in the car park and is driving home on the E67.
  {
    id: 'traffic_ikla_alkoreisi_joobes_juht',
    category: 'traffic',
    code: 'JJ',
    title: T('Joobes juht Läti piiripoest tagasi', 'Drunk driver on the way back from a Latvian border shop'),
    priority: 2,
    weight: 2.2,
    // The border shops are open from morning to late evening.
    hours: [
      0.4, 0.1, 0, 0, 0, 0, 0.1, 0.3, 0.6, 0.8, 1, 1.1, 1.2, 1.3, 1.4, 1.6, 1.8, 2, 2, 1.9, 1.6, 1.3, 1, 0.7,
    ],
    weekendBoost: 1.3,
    regions: ['laane'],
    places: ['border', 'highway'],
    placeTags: ['latvia'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('traffic')] },
    onScene: [30, 70],
    persons: [
      { role: 'driver', gender: 'M', age: [30, 65], intoxicated: 0.95, noLicense: 0.15, record: 0.3 },
      { role: 'caller', gender: 'any', age: [25, 65] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.1, noInspection: 0.15 }],
    summary: [
      T(
        '{address}. Teataja sõidab tõenäoliselt joobes juhi auto taga: mees jõi Läti piiripoe parklas autos õlut ja sõitis siis üle Ikla piiri Pärnu poole. Sõiduk: {car}, numbrimärk {plate}.',
        '{address}. The caller is driving behind a suspected drunk driver: the man drank beer in his car at a Latvian border shop’s car park and then drove across the border at Ikla towards Pärnu. Vehicle: {car}, plate {plate}.',
      ),
      T(
        '{address}. Läti piiripoodidest tulev sõiduauto sõidab maanteel siksakis, pagasiruum ja tagaiste on alkoholikaste täis. Sõiduk: {car}, numbrimärk {plate}.',
        '{address}. A car coming back from the Latvian border shops is weaving along the main road, its boot and back seat full of crates of drink. Vehicle: {car}, plate {plate}.',
      ),
      T(
        '{address}. Teataja nägi piiripoe juures, kuidas juht jõi roolis purgi õlut tühjaks ja avas järgmise. Auto sõidab põhja poole ja kaldub korduvalt vastassuunda. Sõiduk: {car}, numbrimärk {plate}.',
        '{address}. At the border shop the caller saw the driver finish a can of beer at the wheel and open another. The car is heading north and keeps drifting into the oncoming lane. Vehicle: {car}, plate {plate}.',
      ),
    ],
    callerLines: [
      T(
        'Ma nägin Läti poe parklas, kuidas see mees autos õlut jõi. Nüüd sõidab ta minu ees ja loksub ühest teeservast teise!',
        'I saw this man drinking beer in his car in the Latvian shop’s car park. Now he is driving in front of me, wandering from one edge of the road to the other!',
      ),
      T(
        'Joobes juhi auto on Läti poest ostetud kaste täis, tagaistmel ka. Vastutulev rekka pidi juba teepervele põikama.',
        'The drunk driver’s car is full of crates from the Latvian shop, the back seat too. An oncoming lorry already had to swerve onto the verge.',
      ),
      T(
        'Ma sõidan joobes juhi taga ja hoian vahet. Tema kiirus kõigub viiekümnest saja kahekümneni.',
        'I am driving behind the drunk driver and keeping my distance. His speed keeps changing from fifty to a hundred and twenty.',
      ),
    ],
    details: [
      T(
        'Teataja sõnul kaldub auto korduvalt vastassuunavööndisse, maanteel on tihe rekkaliiklus.',
        'The caller says the car keeps drifting into the oncoming lane, and there is heavy lorry traffic on the road.',
      ),
      T(
        'Teataja nägi, et autos on vähemalt kakskümmend kasti õlut ja mitu kasti kangemat alkoholi.',
        'The caller saw at least twenty crates of beer and several boxes of spirits in the car.',
      ),
    ],
    beats: [
      qv('arrive', [
        T(
          '{callsign}: oleme auto taga, {car}, numbrimärk {plate}. Pagasiruum on kaste täis. Kontrolli palun.',
          '{callsign}: we are behind the car, {car}, plate {plate}. The boot is full of crates. Please run it.',
        ),
      ]),
      pursuit(
        1,
        [
          T(
            '{callsign}: juht ei peatu märguande peale ja pöörab kõrvalteele, jälitame!',
            '{callsign}: the driver is ignoring the signal to stop and turning off onto a side road, in pursuit!',
          ),
        ],
        0.2,
      ),
      qp('driver', 4, [
        T(
          '{callsign}: autost leitud dokumentide järgi on juht {name}, isikukood {idcode}. Kontrolli palun juhtimisõigust.',
          '{callsign}: according to the documents in the car the driver is {name}, ID code {idcode}. Please check the licence.',
        ),
      ]),
      agency(
        'tolliamet',
        7,
        [
          T(
            '{callsign}: autos on üle 400 liitri õlut ja kolm kasti viina, isiklikuks tarbimiseks on seda liiga palju. Palun teavitage Maksu- ja Tolliametit!',
            '{callsign}: there are over 400 litres of beer and three boxes of vodka in the car, far too much for personal use. Please notify the Tax and Customs Board!',
          ),
        ],
        { chance: 0.6, timeoutMin: 8, fail: { success: -0.1 } },
      ),
    ],
    outcomes: [
      out(
        'dui_crime',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Juht peeti kinni, alkomeeter näitas 1,9 promilli. Alustati kriminaalmenetlust KarS § 424 järgi, juhiluba võeti ära ja auto teisaldati.',
          'The driver was detained; the breathalyser showed 1.9 per mille. Criminal proceedings were opened under KarS § 424, his licence was taken and the car was towed.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: juht kinni, 1,9 promilli, auto teisaldatakse.',
            '{callsign}: driver detained, 1.9 per mille, car being towed.',
          ),
        },
      ),
      out(
        'excise',
        'report',
        [0.55, 1],
        2,
        T(
          'Juhil tuvastati 1,1 promilli, alustati väärteomenetlust LS § 224 järgi. Autos olnud alkoholikogus ületas tunduvalt isikliku tarbimise piiri, Maksu- ja Tolliamet võttis alkoholi üle ja kontrollib, kas see oli mõeldud edasimüügiks.',
          'The driver had 1.1 per mille and misdemeanour proceedings were opened under LS § 224. The alcohol in the car was far beyond personal use; the Tax and Customs Board took it over and is checking whether it was meant for resale.',
        ),
        {
          radio: T(
            '{callsign}: juht joobes, alkohol üle antud tollile.',
            '{callsign}: driver drunk, alcohol handed over to customs.',
          ),
        },
      ),
      out(
        'misdemeanour',
        'fine',
        [0.4, 0.9],
        2,
        T(
          'Juhil tuvastati 0,6 promilli. Alustati väärteomenetlust LS § 224 järgi, juhtimisõigus peatati ja auto viis koju kaine kõrvalistuja.',
          'The driver had 0.6 per mille. Misdemeanour proceedings were opened under LS § 224, his licence was suspended and a sober passenger drove the car home.',
        ),
        {
          radio: T(
            '{callsign}: 0,6 promilli, menetlus alustatud, autot juhib kaine kõrvalistuja.',
            '{callsign}: 0.6 per mille, case opened, a sober passenger drives on.',
          ),
        },
      ),
      out(
        'ditch',
        'hospital',
        [0.15, 0.45],
        2,
        T(
          'Juht kaotas auto üle valitsemise ja sõitis kraavi, enne kui patrull jõudis teda peatada. Ta sai kergelt viga ja toimetati haiglasse, kus võeti vereproov. Alustati kriminaalmenetlust.',
          'The driver lost control and went into the ditch before the patrol could stop him. He was slightly injured and taken to hospital, where a blood sample was taken. Criminal proceedings were opened.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: auto kraavis, juht kergelt vigastatud, haiglasse.',
            '{callsign}: car in the ditch, driver slightly hurt, to hospital.',
          ),
        },
      ),
      out(
        'gone',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Juht jättis auto kõrvalteel seisma ja põgenes jalgsi metsa, teda ei leitud. Auto ja alkohol jäid politsei kätte, juhi suhtes alustati kriminaalmenetlust.',
          'The driver left the car on a side road and ran off into the forest on foot; he was not found. The car and the alcohol were taken by the police and criminal proceedings were opened against the driver.',
        ),
        {
          radio: T(
            '{callsign}: juht põgenes jalgsi metsa, auto jäi meile.',
            '{callsign}: driver ran off into the forest, we have the car.',
          ),
        },
      ),
      out(
        'crash',
        'tragedy',
        [0, 0.12],
        1,
        T(
          'Juht kaldus vastassuunda ja põrkas kokku vastutuleva veokiga. Sõiduauto juht hukkus sündmuskohal, veokijuht sai kergelt viga.',
          'The driver drifted into the oncoming lane and collided with a lorry. The car driver died at the scene; the lorry driver was slightly hurt.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: kokkupõrge veokiga, sõiduauto juht hukkus.',
            '{callsign}: collision with a lorry, the car driver died.',
          ),
        },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.45,
      toPriority: 1,
      text: T(
        'Teataja: auto kaldus vastassuunda ja rekka pääses napilt mööda, nüüd sõidab ta pooleldi teepervel edasi!',
        'Caller: the car swerved into the oncoming lane and a lorry only just got past, now he is driving on half on the verge!',
      ),
    },
    expiresMin: 45,
    interactiveChance: 0.3,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Minu ees sõidab joobes juht! Ta jõi Läti poolel poe parklas autos õlut ja sõitis siis üle piiri.',
          'There is a drunk driver in front of me! He was drinking beer in his car at a shop car park on the Latvian side and then drove across the border.',
        ),
        T(
          'Üks auto loksub maanteel ühest servast teise, vastutulijad põiklevad. Juht tuli Läti piiripoest.',
          'A car is wandering from one side of the road to the other and oncoming drivers are swerving. The driver has come from a Latvian border shop.',
        ),
      ],
      answers: {
        vehicle: [
          T(
            '{car}, number {plate}. Pagasiruum on kaste täis.',
            '{car}, number {plate}. The boot is full of crates.',
          ),
        ],
        direction: [
          T('Ta sõidab Pärnu poole, mina olen tema taga.', 'He is heading for Pärnu and I am behind him.'),
        ],
        intoxicated: [
          T(
            'Ma nägin oma silmaga, kuidas ta roolis õlut jõi.',
            'I saw him drinking beer at the wheel with my own eyes.',
          ),
        ],
        count: [
          T(
            'Autos on kaks inimest, juht ja üks naine kõrvalistmel.',
            'There are two people in the car, the driver and a woman in the passenger seat.',
          ),
        ],
      },
      answersRu: {
        vehicle: ['{car}, номер {plate}. Багажник забит ящиками.'],
        direction: ['Он едет в сторону Пярну, я еду за ним.'],
        intoxicated: ['Я своими глазами {видел|видела}, как он пил пиво за рулём.'],
        count: ['В машине двое: водитель и женщина на пассажирском сиденье.'],
      },
      openingRu: [
        'Передо мной едет пьяный водитель! Он пил пиво в машине на парковке у магазина на латвийской стороне, а потом поехал через границу.',
        'Одна машина виляет по трассе от края до края, встречные уворачиваются. Водитель едет из латвийского магазина у границы.',
      ],
    },
    tags: ['dui', 'latvia', 'alcohol'],
  },

  // 3. On the Läänemaa ferry roads a driver late for the ferry overtakes whole columns on crests and bends.
  // He has to stop at the harbour anyway: the patrol can wait for him there instead of chasing him.
  {
    id: 'traffic_praamile_kihutav_juht',
    category: 'traffic',
    code: 'LJ',
    title: T(
      'Praamile kiirustav juht möödub ohtlikult',
      'Driver racing for the ferry overtaking dangerously',
    ),
    priority: 2,
    weight: 1.5,
    // The ferries run from early morning to late evening; Friday evening is the rush to the islands.
    hours: [0, 0, 0, 0, 0, 0.3, 0.8, 1, 1, 1, 1, 1, 1.1, 1.2, 1.4, 1.6, 1.8, 1.8, 1.5, 1.2, 1, 0.8, 0.4, 0],
    weekendBoost: 1.5,
    regions: ['laane'],
    places: ['highway'],
    placeTags: ['ferryroad'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('traffic')] },
    onScene: [25, 60],
    persons: [
      { role: 'driver', gender: 'M', age: [25, 60], noLicense: 0.1, record: 0.2 },
      { role: 'caller', gender: 'any', age: [25, 70] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInspection: 0.1 }],
    summary: [
      T(
        '{address}. Teataja sõnul möödub sadama poole kiirustav sõiduauto kogu kolonnist üle pideva joone ja mäkketõusudel, vastutulev auto pidi teepervele põikama. Juhil on ilmselt praamile kiire. Sõiduk: {car}, numbrimärk {plate}.',
        '{address}. The caller says a car hurrying towards the harbour is overtaking the whole column over the solid line and on the brows of hills, and an oncoming car had to swerve onto the verge. The driver is evidently late for the ferry. Vehicle: {car}, plate {plate}.',
      ),
      T(
        '{address}. Praami poole sõitev sõiduauto kihutab ligi 150 km/h ja teeb möödasõite kurvides. Teataja sõnul väljub järgmine praam varsti. Sõiduk: {car}, numbrimärk {plate}.',
        '{address}. A car heading for the ferry is doing nearly 150 km/h and overtaking on bends. The caller says the next ferry leaves soon. Vehicle: {car}, plate {plate}.',
      ),
    ],
    callerLines: [
      T(
        'Üks auto möödus meist kõigist üle pideva joone, otse mäkketõusul! Vastutulija pidi teepervele põikama.',
        'A car has just overtaken all of us over the solid line, right on the brow of a hill! An oncoming car had to swerve onto the verge.',
      ),
      T(
        'See auto kiirustab ilmselt praamile, sõidab vähemalt sada nelikümmend. Kogu kolonn pidurdab tema pärast.',
        'That car must be late for the ferry, it is doing at least a hundred and forty. The whole column is braking because of it.',
      ),
      T(
        'Praamile kiirustav auto möödus jälle kurvis. Tagaistmel on vist lapsed.',
        'The car racing for the ferry has overtaken on a bend again. I think there are children in the back.',
      ),
    ],
    callerLinesRu: [
      'Одна машина обогнала нас всех через сплошную, прямо на подъёме! Встречной пришлось уйти на обочину.',
      'Эта машина, видно, опаздывает на паром, едет не меньше ста сорока. Вся колонна из-за неё тормозит.',
      'Машина, которая гонит на паром, опять обогнала на повороте. Сзади, кажется, дети.',
    ],
    details: [
      T(
        'Teataja sõnul möödub auto järjest ka kurvides ja mäkketõusudel, maanteel on tihe praamiliiklus mõlemas suunas.',
        'The caller says the car keeps overtaking on bends and crests too, and there is heavy ferry traffic in both directions.',
      ),
      T(
        'Sadamani on paarkümmend kilomeetrit, praamile minev auto peab seal järjekorras peatuma.',
        'The harbour is about twenty kilometres away, and a car going for the ferry has to stop in the queue there.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: oleme maanteel, kihutaja läks meist vastassuunas mööda sadama poole. Kas pöörame ja jälitame või võtame ta sadamas järjekorrast, kus ta peab nagunii peatuma?',
            '{callsign}: we are on the main road, the speeder went past us the other way, towards the harbour. Do we turn and chase him or pick him up in the queue at the harbour, where he has to stop anyway?',
          ),
        ],
        [
          opt(
            'harbour',
            T(
              'Ärge jälitage, võtke ta sadamas järjekorrast',
              'No chase, pick him up in the queue at the harbour',
            ),
            T(
              '{callsign}, ärge jälitage, sõitke sadamasse. Ta peab järjekorras peatuma, võtke ta seal vastu.',
              '{callsign}, no chase, drive to the harbour. He has to stop in the queue, meet him there.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'chase',
            T('Pöörake ja jälitage', 'Turn round and chase him'),
            T(
              '{callsign}, pöörake ja jälitage, olge ettevaatlikud.',
              '{callsign}, turn round and chase him, be careful.',
            ),
            { success: -0.1, risk: 0.06 },
          ),
        ],
        'chase',
      ),
      qv(4, [
        T(
          '{callsign}: kihutaja auto on {car}, numbrimärk {plate}. Kontrolli palun omanikku.',
          '{callsign}: the speeder’s car is {car}, plate {plate}. Please check the owner.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'stopped',
        'fine',
        [0.5, 1],
        4,
        T(
          'Patrull võttis auto sadamas praamijärjekorrast välja. Juhile määrati kiiruse ületamise eest trahv LS § 262 järgi, ohtlike möödasõitude eest alustati väärteomenetlust ja praam läks ilma temata.',
          'The patrol took the car out of the ferry queue at the harbour. The driver was fined for speeding under LS § 262, misdemeanour proceedings were opened for the dangerous overtaking, and the ferry left without him.',
        ),
        {
          radio: T(
            '{callsign}: kihutaja võetud järjekorrast, trahv, praam läks ilma temata.',
            '{callsign}: speeder taken out of the queue, fined, ferry left without him.',
          ),
        },
      ),
      out(
        'children',
        'fine',
        [0.5, 1],
        2,
        T(
          'Patrull võttis auto sadamas järjekorrast välja. Tagaistmel olid kaks väikest last ilma turvatoolita, juhile määrati trahv kiiruse ületamise ja laste turvavarustuseta sõidutamise eest.',
          'The patrol took the car out of the queue at the harbour. Two small children were in the back without child seats, and the driver was fined for speeding and for carrying the children without restraints.',
        ),
        {
          radio: T(
            '{callsign}: kihutaja peatatud, lapsed turvatoolita, trahv määratud.',
            '{callsign}: speeder stopped, children without child seats, fine given.',
          ),
        },
      ),
      out(
        'made_it',
        'report',
        [0.3, 0.7],
        2,
        T(
          'Juht jõudis praamile enne, kui patrull sadamasse jõudis. Numbrimärgi ja teiste juhtide videote põhjal alustati väärteomenetlust ohtlike möödasõitude ja kiiruse ületamise eest.',
          'The driver made it onto the ferry before the patrol reached the harbour. Misdemeanour proceedings for the dangerous overtaking and speeding were opened on the strength of the plate and other drivers’ videos.',
        ),
        {
          radio: T(
            '{callsign}: kihutaja jõudis praamile, menetlus alustatud videote põhjal.',
            '{callsign}: speeder made the ferry, case opened from drivers’ videos.',
          ),
        },
      ),
      out(
        'mirror',
        'hospital',
        [0.1, 0.45],
        2,
        T(
          'Möödasõidul riivas auto vastutulevat autot ja mõlemad sõitsid kraavi. Kaks juhti said kergelt viga ja toimetati haiglasse, kihutaja suhtes alustati menetlust.',
          'While overtaking the car clipped an oncoming car and both went into the ditch. Two drivers were slightly hurt and taken to hospital, and proceedings were opened against the speeder.',
        ),
        {
          injuries: 2,
          radio: T(
            '{callsign}: möödasõidul kokkupõrge, kaks kergelt vigastatut haiglasse.',
            '{callsign}: collision while overtaking, two slightly injured to hospital.',
          ),
        },
      ),
      out(
        'head_on',
        'tragedy',
        [0, 0.1],
        1,
        T(
          'Mäkketõusul möödudes põrkas auto laupkokku vastutuleva autoga. Vastutuleva auto juht hukkus, kihutaja toimetati raskes seisus haiglasse.',
          'Overtaking on the brow of a hill, the car crashed head-on into an oncoming car. The oncoming driver was killed and the speeder was taken to hospital in a critical condition.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: laupkokkupõrge, üks hukkunu, kihutaja raskes seisus.',
            '{callsign}: head-on collision, one dead, the speeder critical.',
          ),
        },
      ),
    ],
    expiresMin: 45,
    interactiveChance: 0.25,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Üks auto möödub kogu kolonnist üle pideva joone ja mäkketõusudel! Juhil on ilmselt praamile kiire.',
          'A car is overtaking the whole column over the solid line and on the brows of hills! The driver must be late for the ferry.',
        ),
        T(
          'Siin kihutab üks auto sadama poole, ligi sada viiskümmend, ja möödub kurvides. Vastutulija pidi teepervele põikama!',
          'A car is racing towards the harbour here, nearly a hundred and fifty, and overtaking on bends. An oncoming car had to swerve onto the verge!',
        ),
      ],
      answers: {
        direction: [
          T(
            'Ta sõidab sadama poole, ilmselt praamile.',
            'He is heading for the harbour, probably for the ferry.',
          ),
        ],
        vehicle: [T('{car}, number {plate}.', '{car}, number {plate}.')],
        injured: [
          T(
            'Veel keegi viga ei saanud, aga vähe puudus.',
            'Nobody has been hurt yet, but it was a close thing.',
          ),
        ],
        children: [
          T(
            'Tagaistmel on vist lapsed, nägin väikesi päid.',
            'I think there are children in the back, I saw small heads.',
          ),
        ],
      },
      answersRu: {
        direction: ['Он едет в сторону порта, видно, на паром.'],
        vehicle: ['{car}, номер {plate}.'],
        injured: ['Пока никто не пострадал, но было на волоске.'],
        children: ['Сзади, кажется, дети, я {видел|видела} маленькие головы.'],
      },
      openingRu: [
        'Одна машина обгоняет всю колонну через сплошную и на подъёмах! Водитель, видно, опаздывает на паром.',
        'Тут одна машина гонит к порту, под сто пятьдесят, и обгоняет на поворотах. Встречной пришлось уйти на обочину!',
      ],
    },
    tags: ['ferry', 'vehicle_flee'],
  },

  // 4. A car blown off the Väinatamm causeway into the strait between Muhu and Saaremaa.
  {
    id: 'traffic_auto_vainatammilt_merre',
    category: 'traffic',
    code: 'LÕ',
    title: T('Auto sõitis Väinatammilt merre', 'Car off the Väinatamm causeway into the sea'),
    priority: 2,
    weight: 0.15,
    hours: 'night',
    regions: ['laane'],
    places: ['highway'],
    placeTags: ['causeway'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [40, 90],
    persons: [
      { role: 'driver', gender: 'M', age: [19, 70], intoxicated: 0.35, noLicense: 0.1 },
      { role: 'caller', gender: 'any', age: [25, 70] },
    ],
    vehicles: [{ role: 'involved', kind: 'car', driverRole: 'driver' }],
    agencies: [
      {
        agency: 'paaste',
        chance: 0.9,
        reason: T('Auto vees, juht vajab päästmist', 'Car in the water, the driver needs rescuing'),
      },
      {
        agency: 'kiirabi',
        chance: 0.6,
        reason: T('Märg ja alajahtunud juht', 'Soaked and hypothermic driver'),
      },
    ],
    summary: [
      T(
        '{address}. Möödasõitja teatel sõitis sõiduauto tammilt välja ja jäi umbes kahekümne meetri kaugusel teest vette. Juht ronis auto katusele.',
        '{address}. A passing driver reports that a car left the causeway and ended up in the water about twenty metres from the road. The driver has climbed onto the roof.',
      ),
      T(
        '{address}. Tugeva külgtuulega kaldus auto tammil teelt välja ja sõitis merre. Vesi on akendeni, autos on vähemalt üks inimene.',
        '{address}. In a strong crosswind a car veered off the road on the causeway and into the sea. The water is up to the windows and there is at least one person in the car.',
      ),
    ],
    callerLines: [
      T(
        'Üks auto sõitis tammilt otse merre! Juht on katusel ja vehib, ümberringi on vesi.',
        'A car has driven straight off the causeway into the sea! The driver is on the roof waving, there is water all around.',
      ),
      T(
        'Ta tuli Muhu poolt ja kadus lihtsalt teelt ära. Tuul on nii tugev, et lained pritsivad üle tee.',
        'He was coming from Muhu and just vanished off the road. The wind is so strong that the waves are splashing over the road.',
      ),
      T(
        'Auto on tammi kõrval vees ja juht on katusel. Kas ma lähen vette talle järele? Mul on autos pukseerimisköis.',
        'The car is in the water next to the causeway and the driver is on the roof. Should I go into the water after him? I have a tow rope in the car.',
      ),
    ],
    details: [
      T(
        'Teataja sõnul vajub auto pehmesse põhja ja kaldub, juht on läbimärg ja tahab ise kaldale sumbata.',
        'The caller says the car is sinking into the soft bottom and tilting; the driver is soaked and wants to wade ashore himself.',
      ),
      T(
        'Tammil puhub tugev külgtuul, kohati pritsib vett üle tee ja liiklus liigub aeglaselt.',
        'A strong crosswind is blowing over the causeway, water is splashing over the road in places and traffic is moving slowly.',
      ),
    ],
    beats: [
      agency(
        'paaste',
        'arrive',
        [
          T(
            '{callsign}: oleme tammil, auto on vees. Me ise juhini ei ulatu, vajame päästjaid ja paati!',
            '{callsign}: we are on the causeway, the car is in the water. We cannot reach the driver ourselves, we need the rescuers and a boat!',
          ),
        ],
        { timeoutMin: 6, fail: { success: -0.25, trust: -3 } },
      ),
      choice(
        3,
        [
          T(
            '{callsign}: juht tahab katuselt maha hüpata ja kaldale sumbata, vesi oleks talle rinnuni. Kas juhatame ta kaldale või käsime tal päästjaid oodata?',
            '{callsign}: the driver wants to jump off the roof and wade ashore, the water would be up to his chest. Do we guide him ashore or tell him to wait for the rescuers?',
          ),
        ],
        [
          opt(
            'stay',
            T('Jäägu katusele, oodaku päästjaid', 'Stay on the roof, wait for the rescuers'),
            T(
              '{callsign}, käskige tal katusele jääda ja autost kinni hoida, päästjad on kohe kohal.',
              '{callsign}, tell him to stay on the roof and hold on to the car, the rescuers are nearly there.',
            ),
            { success: 0.15, time: 5 },
          ),
          opt(
            'wade',
            T('Juhatage ta kaldale', 'Guide him ashore'),
            T(
              '{callsign}, visake talle köis ja juhatage ta kaldale.',
              '{callsign}, throw him a rope and guide him ashore.',
            ),
            { success: -0.05, risk: 0.05, outcome: 'cold' },
          ),
        ],
        'wade',
      ),
      agency(
        'kiirabi',
        8,
        [
          T(
            '{callsign}: palun kiirabi tammile valmis, juht on kaua märjana tuule käes olnud.',
            '{callsign}: ambulance on standby at the causeway please, the driver has been soaked and out in the wind for a long time.',
          ),
        ],
        { chance: 0.7, timeoutMin: 5 },
      ),
      qp(
        'driver',
        12,
        [
          T(
            '{callsign}: auto dokumentide järgi on juht {name}, isikukood {idcode}. Kontrolli palun.',
            '{callsign}: according to the car’s papers the driver is {name}, ID code {idcode}. Please check.',
          ),
        ],
        0.6,
      ),
    ],
    outcomes: [
      out(
        'rescued',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Päästjad tõid juhi paadiga katuselt kaldale, kiirabi vaatas ta üle ja ta lubati koju. Auto tõmmatakse veest välja, kui tuul vaibub. Õnnetuse põhjus oli tugev külgtuul.',
          'The rescuers took the driver off the roof by boat; the ambulance crew checked him over and he was allowed to go home. The car will be pulled out of the water when the wind drops. The cause of the accident was the strong crosswind.',
        ),
        {
          radio: T(
            '{callsign}: juht päästetud, auto tõmmatakse hiljem välja.',
            '{callsign}: driver rescued, the car will be pulled out later.',
          ),
        },
      ),
      out(
        'dui',
        'arrest',
        [0.5, 1],
        2,
        T(
          'Juht toodi veest välja ja selgus, et ta oli joobes, alkomeeter näitas 1,6 promilli. Alustati kriminaalmenetlust KarS § 424 järgi.',
          'The driver was brought out of the water and turned out to be drunk; the breathalyser showed 1.6 per mille. Criminal proceedings were opened under KarS § 424.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: juht päästetud, joobes, menetlus alustatud.',
            '{callsign}: driver rescued, drunk, case opened.',
          ),
        },
      ),
      out(
        'cold',
        'hospital',
        [0, 0.05],
        1,
        T(
          'Juht läks katuselt vette ja sumpas köie abil kaldale, kukkus vahepeal ja jõudis tammile läbikülmununa ja kurnatuna. Ta toimetati Kuressaare haiglasse.',
          'The driver got off the roof and waded ashore along the rope, fell on the way and reached the causeway chilled through and exhausted. He was taken to Kuressaare hospital.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: juht sumpas kaldale, läbikülmunud, Kuressaare haiglasse.',
            '{callsign}: driver waded ashore, chilled through, to Kuressaare hospital.',
          ),
        },
      ),
      out(
        'chilled',
        'hospital',
        [0.25, 0.6],
        2,
        T(
          'Päästjad tõid juhi paadiga katuselt ära, kuid ta oli kaua märjana tuule käes olnud. Ta toimetati läbikülmununa Kuressaare haiglasse.',
          'The rescuers took the driver off the roof by boat, but he had been soaked and out in the wind for a long time. He was taken to Kuressaare hospital chilled through.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: juht päästetud, läbikülmunud, Kuressaare haiglasse.',
            '{callsign}: driver rescued, chilled through, to Kuressaare hospital.',
          ),
        },
      ),
      out(
        'critical',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Auto vajus sügavamale ja juht kukkus vette, enne kui päästjad jõudsid. Ta toodi välja teadvuseta ja toimetati raskes seisus haiglasse.',
          'The car sank deeper and the driver fell into the water before the rescuers got there. He was brought out unconscious and taken to hospital in a critical condition.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: juht toodi veest teadvuseta, raskes seisus haiglasse.',
            '{callsign}: driver brought out unconscious, critical, to hospital.',
          ),
        },
      ),
      out(
        'drowned',
        'tragedy',
        [0, 0.12],
        1,
        T(
          'Auto vajus sügavamale, juht kukkus vette ja uppus enne päästjate saabumist. Õnnetuse asjaolusid uurib politsei.',
          'The car sank deeper, the driver fell into the water and drowned before the rescuers arrived. The police are investigating the circumstances.',
        ),
        {
          radio: T(
            '{callsign}: juht uppus enne päästjate saabumist.',
            '{callsign}: driver drowned before the rescuers arrived.',
          ),
        },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.5,
      toPriority: 1,
      text: T(
        'Teataja: auto vajub sügavamale ja kaldub külili, juht hoiab katusest vaevu kinni!',
        'Caller: the car is sinking deeper and tipping onto its side, the driver can barely hold on to the roof!',
      ),
    },
    expiresMin: 45,
    interactiveChance: 0.35,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Auto sõitis tammilt merre! Inimene on auto katusel, ümberringi on vesi!',
          'A car has gone off the causeway into the sea! There is someone on the roof, water all around!',
        ),
        T(
          'Üks auto kadus teelt otse vette, juht vehib katuselt. Tuul on kohutav!',
          'A car went straight off the road into the water, the driver is waving from the roof. The wind is terrible!',
        ),
      ],
      answers: {
        injured: [
          T(
            'Ma ei tea, ta liigub, aga on läbimärg ja külmetab.',
            'I do not know, he is moving, but he is soaked and freezing.',
          ),
        ],
        count: [
          T(
            'Ma näen ainult ühte inimest, autos ei paista kedagi teist.',
            'I can only see one person, there does not seem to be anyone else in the car.',
          ),
        ],
        vehicle: [
          T(
            '{car}. Numbrit ma ei näe, auto on vees.',
            '{car}. I cannot see the number, the car is in the water.',
          ),
        ],
        safe: [
          T(
            'Mina olen oma autoga tammil, ohutuled põlevad.',
            'I am on the causeway in my car with the hazard lights on.',
          ),
        ],
        suspect: [
          T(
            'Siit on raske öelda, ta on kaugel. Mees see vist on.',
            'It is hard to tell from here, he is a long way off. I think it is a man.',
          ),
        ],
        intoxicated: [
          T(
            'Ei tea, ma ei ole temaga rääkinud, ta on ju vees.',
            'I do not know, I have not spoken to him, he is out in the water.',
          ),
        ],
      },
      answersRu: {
        injured: ['Не знаю, он двигается, но весь мокрый и мёрзнет.'],
        count: ['Я вижу только одного человека, в машине вроде больше никого.'],
        vehicle: ['{car}. Номер не вижу, машина в воде.'],
        safe: ['Я на дамбе в своей машине, аварийка включена.'],
        suspect: ['Отсюда трудно сказать, он далеко. Вроде мужчина.'],
        intoxicated: ['Не знаю, я с ним не {разговаривал|разговаривала}, он же в воде.'],
      },
      openingRu: [
        'Машина съехала с дамбы в море! Человек на крыше машины, кругом вода!',
        'Одна машина слетела с дороги прямо в воду, водитель машет с крыши. Ветер жуткий!',
      ],
    },
    tags: ['island', 'water', 'wind'],
  },

  // 5. A drunk man who missed the last ferry stays at the terminal and eyes the fishermen's boats.
  {
    id: 'public_order_viimasest_praamist_maha_jaanud',
    category: 'public_order',
    code: 'ÖR',
    title: T(
      'Viimasest praamist maha jäänud mees märatseb sadamas',
      'Man who missed the last ferry is running riot at the harbour',
    ),
    priority: 3,
    weight: 1.8,
    // After the last ferries (about 21:00 to 23:30) and before the first ones in the morning.
    hours: [1.8, 1.6, 1.2, 0.8, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.4, 1.2, 1.8],
    weekendBoost: 1.4,
    regions: ['laane'],
    places: ['port'],
    placeTags: ['queue'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [25, 60],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 60], intoxicated: 0.85, record: 0.35, wanted: 0.05 },
      { role: 'caller', gender: 'any', age: [25, 65], relation: 'employee' },
    ],
    summary: [
      T(
        '{place}, {address}. Viimasest praamist maha jäänud joobes mees nõuab terminalis, et praam tagasi kutsutaks, ja tagub piletikassa akent. Valvetöötaja on öösel üksi.',
        '{place}, {address}. A drunk man who missed the last ferry is demanding at the terminal that it be called back and is banging on the ticket window. The guard is alone for the night.',
      ),
      T(
        '{place}, {address}. Sadama valvur teatab mehest, kes jäi õhtusest viimasest praamist maha, sõimab töötajaid ja ähvardab teisele poole minna ükskõik millega.',
        '{place}, {address}. The harbour guard reports a man who missed the last ferry of the evening, is abusing the staff and threatens to get across to the other side in whatever he can find.',
      ),
    ],
    callerLines: [
      T(
        'Viimane praam läks juba ammu ja see mees nõuab, et me selle tagasi kutsuksime. Ta tagub kassaakent rusikaga.',
        'The last ferry left ages ago and this man is demanding that we call it back. He is banging on the ticket window with his fist.',
      ),
      T(
        'Praamist maha jäänud mees on täiesti purjus ja ütleb, et läheb üle ükskõik millega. Nüüd käib ta kai ääres kalurite paatide juures.',
        'The man who missed the ferry is completely drunk and says he will get across in anything. Now he is hanging around the fishermen’s boats at the quay.',
      ),
      T(
        'Ma olen siin öösel üksi. See mees, kes praamist maha jäi, lükkas juba prügikasti ümber ja sõimab mind.',
        'I am here alone at night. The man who missed the ferry has already knocked over a bin and is swearing at me.',
      ),
    ],
    callerLinesRu: [
      'Последний паром давно ушёл, а этот мужик требует, чтобы мы его вернули. Стучит кулаком в окно кассы.',
      'Мужик, который опоздал на паром, пьяный в стельку и говорит, что переправится на чём угодно. Сейчас ходит у причала возле рыбацких лодок.',
      'Я тут ночью {один|одна}. Этот мужик, который опоздал на паром, уже опрокинул урну и ругается на меня.',
    ],
    details: [
      T(
        'Valvetöötaja sõnul on kai ääres mitu lukustamata paati ja mees on korduvalt nende juurde läinud.',
        'The guard says several unlocked boats are moored at the quay and the man keeps going over to them.',
      ),
      T(
        'Järgmine praam väljub alles varahommikul, mehe sõnul ootab teisel pool tema pere.',
        'The next ferry is not until early morning; the man says his family is waiting on the other side.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal. Mees on kai ääres paatide juures, räägime temaga.',
          '{callsign}: on scene. The man is by the boats at the quay, talking to him.',
        ),
      ]),
      qp('suspect', 2, R_SUSPECT),
      choice(
        5,
        [
          T(
            '{callsign}: mees on tugevas joobes, ööbimiskohta tal ei ole ja ta tahab ikka üle minna. Kas toimetame ta kainenema?',
            '{callsign}: the man is very drunk, has nowhere to stay and still wants to get across. Do we take him in to sober up?',
          ),
        ],
        [
          opt(
            'sober',
            T('Jah, kainenema', 'Yes, take him in to sober up'),
            T(
              '{callsign}, ta ohustab ennast ja teisi, toimetage ta kainenema.',
              '{callsign}, he is a danger to himself and others, take him in to sober up.',
            ),
            { success: 0.15, time: 20 },
          ),
          opt(
            'stay',
            T(
              'Hoiatus, oodaku terminalis hommikust praami',
              'A warning, let him wait in the terminal for the morning ferry',
            ),
            T(
              '{callsign}, tehke hoiatus, ta võib terminalis hommikust praami oodata.',
              '{callsign}, give him a warning, he can wait in the terminal for the morning ferry.',
            ),
            { success: -0.1, risk: 0.04, outcome: 'boat' },
          ),
        ],
        'stay',
      ),
    ],
    outcomes: [
      out(
        'sobering',
        'arrest',
        [0.45, 1],
        4,
        T(
          'Mees toimetati kainenema. Avaliku korra rikkumise eest alustati väärteomenetlust KarS § 262 järgi, hommikul läks ta esimese praamiga koju.',
          'The man was taken in to sober up. Misdemeanour proceedings were opened for disorderly conduct under KarS § 262, and in the morning he went home on the first ferry.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: mees toimetatud kainenema, menetlus alustatud.',
            '{callsign}: man taken in to sober up, case opened.',
          ),
        },
      ),
      out(
        'calmed',
        'warning',
        [0.5, 1],
        2,
        T(
          'Kainenema toimetamise asemel anti mees sugulase hoolde, kes tuli talle autoga järele. Talle tehti hoiatus ja valvetöötaja jätkas tööd.',
          'Instead of being taken in to sober up, the man was handed over to a relative who came to pick him up by car. He was given a warning and the guard went back to work.',
        ),
        {
          radio: T(
            '{callsign}: mees anti sugulase hoolde, hoiatus tehtud.',
            '{callsign}: man handed over to a relative, warning given.',
          ),
        },
      ),
      out(
        'boat',
        'report',
        [0.2, 0.6],
        2,
        T(
          'Mees oli jõudnud kalurite paadi kinnitusköie lahti teha, kuid patrull tõi ta paadist välja. Paadi omanik esitas avalduse ja alustati menetlust.',
          'The man had already untied a fishermen’s boat, but the patrol got him out of it. The boat’s owner filed a complaint and proceedings were opened.',
        ),
        {
          radio: T(
            '{callsign}: mees toodi paadist välja, menetlus alustatud.',
            '{callsign}: man taken out of the boat, case opened.',
          ),
        },
      ),
      out(
        'guard_hurt',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Mees ründas valvetöötajat, kes sai näkku löögi ja toimetati haiglasse. Mees peeti kinni, alustati kriminaalmenetlust KarS § 121 järgi.',
          'The man attacked the guard, who was punched in the face and taken to hospital. The man was detained and criminal proceedings were opened under KarS § 121.',
        ),
        {
          injuries: 1,
          arrests: 1,
          radio: T(
            '{callsign}: valvur löödud, haiglasse, ründaja kinni.',
            '{callsign}: guard punched, to hospital, attacker detained.',
          ),
        },
      ),
      out(
        'overboard',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Jutuajamise ajal hüppas mees kalurite paati ja lükkas end kai äärest eemale, kuid kukkus vette. Politseinikud tõmbasid ta välja ja ta toimetati alajahtumisega haiglasse.',
          'While the officers were talking to him the man jumped into a fishermen’s boat and pushed off from the quay, but fell into the water. The officers pulled him out and he was taken to hospital with hypothermia.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: mees kukkus paadist vette, alajahtunud, haiglasse.',
            '{callsign}: man fell out of the boat into the water, hypothermic, to hospital.',
          ),
        },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.45,
      toPriority: 2,
      text: T(
        'Valvetöötaja: mees ronis kai ääres kalurite paati ja üritab mootorit käivitada!',
        'Guard: the man has climbed into a fishermen’s boat at the quay and is trying to start the engine!',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    tags: ['ferry', 'alcohol'],
  },

  // 6. A car stolen in the night shows up on its tracker in the ferry queue just as loading starts.
  {
    id: 'property_varastatud_auto_praamijarjekorras',
    category: 'property',
    code: 'VG',
    title: T('Varastatud auto praamijärjekorras', 'Stolen car in the ferry queue'),
    priority: 3,
    weight: 0.4,
    // The ferries load from early morning to late evening.
    hours: [
      0, 0, 0, 0, 0, 0, 0.6, 1.2, 1.5, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.5, 1.4, 1.2, 1, 0.8, 0.6, 0.4, 0.2, 0,
    ],
    regions: ['laane'],
    places: ['port'],
    placeTags: ['queue'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [19, 45], record: 0.6, wanted: 0.2, noLicense: 0.35 },
      { role: 'caller', gender: 'any', age: [30, 70] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect', stolen: 1 }],
    summary: [
      T(
        '{place}, {address}. Teataja auto varastati öösel kodu eest ja jälgimisseade näitab, et see seisab praegu praamijärjekorras. Sõiduk: {car}, numbrimärk {plate}.',
        '{place}, {address}. The caller’s car was stolen from outside their home in the night and its tracker shows it standing in the ferry queue right now. Vehicle: {car}, plate {plate}.',
      ),
      T(
        '{place}, {address}. Öösel varastatud sõiduauto on jälgimisseadme järgi praamijärjekorras ja praami laadimine algab varsti. Omanik jälgib asukohta telefonist. Sõiduk: {car}, numbrimärk {plate}.',
        '{place}, {address}. According to its tracker a car stolen in the night is in the ferry queue, and loading starts soon. The owner is following its position on a phone. Vehicle: {car}, plate {plate}.',
      ),
    ],
    callerLines: [
      T(
        'Meie auto varastati öösel ja nüüd näitab jälgimisäpp, et see on sadamas praamijärjekorras!',
        'Our car was stolen in the night and now the tracking app shows it in the ferry queue at the harbour!',
      ),
      T(
        'Meie varastatud auto on praamijärjekorras ja praam väljub veerand tunni pärast. Kui varas teisele poole saab, kust me teda siis otsime?',
        'Our stolen car is in the ferry queue and the ferry leaves in a quarter of an hour. If the thief gets across to the other side, where are we supposed to look for him?',
      ),
      T(
        'Varastatud auto on sadamas järjekorras ja mu vend sõidab juba sinna, ta tahab auto ise tagasi võtta.',
        'The stolen car is in the queue at the harbour and my brother is already driving there, he wants to take the car back himself.',
      ),
    ],
    details: [
      T(
        'Sadama töötaja kinnitas, et auto seisab järjekorras ja roolis istub noor mees.',
        'A harbour worker has confirmed that the car is standing in the queue with a young man at the wheel.',
      ),
      T(
        'Teataja sõnul on tema vend teel sadamasse ja lubab auto ise tagasi võtta.',
        'The caller says their brother is on his way to the harbour and promises to take the car back himself.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal, varastatud auto on järjekorras ja laadimine algab. Kas palume sadamal laadimise peatada ja võtame auto kohe kinni?',
            '{callsign}: on scene, the stolen car is in the queue and loading is about to start. Do we ask the port to hold the loading and take the car now?',
          ),
        ],
        [
          opt(
            'hold',
            T('Laadimine peatada, auto kinni', 'Hold the loading, take the car'),
            T(
              '{callsign}, sadam peatab laadimise. Võtke auto järjekorrast välja ja juht kontrolli alla.',
              '{callsign}, the port is holding the loading. Take the car out of the queue and the driver under control.',
            ),
            { success: 0.15, time: 5 },
          ),
          opt(
            'queue',
            T(
              'Laadimist ei peata, võtke auto järjekorras kinni',
              'Do not hold the loading, take the car in the queue',
            ),
            T(
              '{callsign}, laadimist ei peatata. Võtke auto järjekorras kinni enne, kui see rambile jõuab.',
              '{callsign}, the loading goes on. Take the car in the queue before it reaches the ramp.',
            ),
            { success: -0.1, risk: 0.03 },
          ),
        ],
        'queue',
      ),
      qv(2, [
        T(
          '{callsign}: auto on käes, {car}, numbrimärk {plate}. Kontrolli palun.',
          '{callsign}: we have the car, {car}, plate {plate}. Please run it.',
        ),
      ]),
      qp('suspect', 4, R_SUSPECT),
      choice(
        8,
        [
          T(
            '{callsign}: juht väidab, et ostis auto täna varahommikul kuulutuse peale sularaha eest, tal on käsitsi kirjutatud leping. Kas peame ta kahtlustatavana kinni?',
            '{callsign}: the driver claims he bought the car early this morning through an ad for cash and has a handwritten contract. Do we detain him as a suspect?',
          ),
        ],
        [
          opt(
            'detain',
            T('Kinni kahtlustatavana, auto jaoskonda', 'Detain him as a suspect, car to the station'),
            T(
              '{callsign}, peatage ta kahtlustatavana kinni, auto toimetatakse jaoskonda. Lepingu kontrollib kriminaalpolitsei.',
              '{callsign}, detain him as a suspect and take the car to the station. The criminal police will check the contract.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'release',
            T('Seletus ja vabaks', 'A statement, then let him go'),
            T(
              '{callsign}, võtke seletus ja laske ta minna, auto tagastage omanikule.',
              '{callsign}, take a statement and let him go, return the car to the owner.',
            ),
            { success: -0.1, outcome: 'buyer' },
          ),
        ],
        'release',
      ),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Varastatud auto võeti praamijärjekorrast välja ja juht peeti kahtlustatavana kinni. Alustati kriminaalmenetlust KarS § 199 järgi, auto tagastatakse omanikule pärast ekspertiisi.',
          'The stolen car was taken out of the ferry queue and the driver was detained as a suspect. Criminal proceedings were opened under KarS § 199 and the car will go back to its owner after forensic examination.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: auto võetud järjekorrast, juht kinni peetud.',
            '{callsign}: car taken out of the queue, driver detained.',
          ),
        },
      ),
      out(
        'buyer',
        'report',
        [0.4, 0.9],
        2,
        T(
          'Selgus, et juht oli auto ostnud kuulutuse kaudu võõralt mehelt ja leping oli võltsitud. Ta andis seletuse, auto tagastati omanikule ja müüja otsimine jätkub kriminaalmenetluses.',
          'It turned out the driver had bought the car through an ad from a stranger and the contract was forged. He gave a statement, the car was returned to its owner and the search for the seller continues in criminal proceedings.',
        ),
        {
          radio: T(
            '{callsign}: juht ostis auto võõralt, auto tagastatud omanikule.',
            '{callsign}: driver bought the car from a stranger, car returned to the owner.',
          ),
        },
      ),
      out(
        'brother',
        'report',
        [0.15, 0.5],
        2,
        T(
          'Omaniku vend jõudis sadamasse ja tiris juhi autost välja, mehed kaklesid järjekorra keskel, enne kui patrull nad lahutas. Juht peeti kinni ja mõlema suhtes alustati menetlust.',
          'The owner’s brother reached the harbour and dragged the driver out of the car; the two men fought in the middle of the queue before the patrol separated them. The driver was detained and proceedings were opened against both.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: omaniku vend ja juht kaklesid, juht kinni.',
            '{callsign}: owner’s brother and the driver fought, driver detained.',
          ),
        },
      ),
      out(
        'rammed',
        'report',
        [0, 0.4],
        2,
        T(
          'Patrulli nähes üritas juht järjekorrast välja sõita ja sõitis otsa kahele ootavale autole. Ta peeti kinni, kahju saanud juhtidele selgitati, kuidas kahju hüvitamist nõuda.',
          'When he saw the patrol the driver tried to pull out of the queue and drove into two waiting cars. He was detained, and the drivers whose cars were damaged were told how to claim compensation.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: juht sõitis järjekorras kahele autole otsa, kinni peetud.',
            '{callsign}: driver hit two cars in the queue, detained.',
          ),
        },
      ),
    ],
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Meie auto varastati öösel ja nüüd näitab jälgimisäpp, et see on sadamas praamijärjekorras!',
          'Our car was stolen in the night and now the tracking app shows it in the ferry queue at the harbour!',
        ),
        T(
          'Meie varastatud auto seisab praegu praamijärjekorras ja kohe hakatakse praamile laadima. Tulge palun kiiresti!',
          'Our stolen car is standing in the ferry queue right now and they are about to start loading. Please come quickly!',
        ),
      ],
      answers: {
        direction: [
          T(
            'Auto ei ole kuhugi läinud, see seisab järjekorras, äpis on täpp paigal.',
            'The car has not gone anywhere, it is standing in the queue, the dot in the app is not moving.',
          ),
        ],
        vehicle: [T('{car}, number {plate}.', '{car}, number {plate}.')],
        when: [
          T(
            'Õhtul kella üheteistkümne ajal oli auto veel maja ees, hommikul oli see läinud.',
            'At about eleven last night the car was still outside the house, in the morning it was gone.',
          ),
        ],
        suspect: [
          T(
            'Ma ei tea, kes roolis on. Sadama töötaja ütles, et mingi noor mees.',
            'I do not know who is at the wheel. The harbour worker said some young man.',
          ),
        ],
      },
      answersRu: {
        direction: ['Машина никуда не уехала, стоит в очереди, точка в приложении не двигается.'],
        vehicle: ['{car}, номер {plate}.'],
        when: ['Вечером около одиннадцати машина ещё стояла у дома, а утром её уже не было.'],
        suspect: ['Не знаю, кто за рулём. Работник порта сказал, какой-то молодой парень.'],
      },
      openingRu: [
        'У нас ночью угнали машину, а теперь приложение показывает, что она в порту, в очереди на паром!',
        'Наша угнанная машина сейчас стоит в очереди на паром, и вот-вот начнётся погрузка. Приезжайте скорее!',
      ],
    },
    tags: ['ferry', 'tracker'],
  },

  // 7. Festival security hold a pill dealer after a girl collapses; his friends want him back.
  {
    id: 'drugs_festivalil_tabletimuuja',
    category: 'drugs',
    code: 'NA',
    title: T('Tabletimüüja festivalil, ostja kukkus kokku', 'Pill dealer at the festival, a buyer collapsed'),
    priority: 2,
    weight: 0.8,
    months: [7, 8],
    // The festival programme runs from the afternoon into the small hours.
    hours: [
      2.4, 2.4, 2, 1.2, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.5,
    ],
    weekendBoost: 1.5,
    regions: ['laane'],
    places: ['concert'],
    placeTags: ['festival'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('k9')] },
    onScene: [35, 80],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 30], record: 0.4, intoxicated: 0.5, wanted: 0.05 },
      { role: 'victim', gender: 'F', age: [17, 24] },
      { role: 'caller', gender: 'any', age: [25, 50], relation: 'employee' },
    ],
    agencies: [
      {
        agency: 'kiirabi',
        chance: 0.9,
        reason: T(
          'Festivalil kokku kukkunud noor naine, võimalik mürgistus',
          'Young woman collapsed at the festival, possible poisoning',
        ),
      },
    ],
    summary: [
      T(
        '{place}, {address}. Festivali turvajuhi teatel kukkus lava ees kokku noor naine, kes oli võtnud tableti. Turvamehed pidasid kinni noormehe, keda tüdruku sõbrad nimetavad müüjaks. Ümber koguneb rahvast.',
        '{place}, {address}. The festival’s head of security reports that a young woman collapsed in front of the stage after taking a pill. The guards are holding a young man her friends say sold it to her. A crowd is gathering.',
      ),
      T(
        '{place}, {address}. Festivalialal hoiavad turvamehed kinni tablette müünud noormeest. Üks ostja on meditsiinitelgis segaduses ja kõrge palavikuga, kinnipeetu sõbrad nõuavad tema vabastamist.',
        '{place}, {address}. On the festival site the guards are holding a young man who was selling pills. One buyer is in the medical tent, confused and running a high fever, and the detainee’s friends are demanding his release.',
      ),
    ],
    callerLines: [
      T(
        'Meil on üks tüdruk meditsiinitelgis, võttis mingi tableti. Tema sõbrad näitasid müüja kätte ja me hoiame teda kinni.',
        'We have a girl in the medical tent who took some pill. Her friends pointed out the dealer and we are holding him.',
      ),
      T(
        'Kinnipeetud müüjal on taskus veel kotike tablettidega. Ta karjub, et meil pole õigust teda puutuda.',
        'The dealer we are holding has another little bag of pills in his pocket. He is shouting that we have no right to touch him.',
      ),
      T(
        'Tabletimüüja ümber on paarkümmend inimest, osa filmib, tema sõbrad tahavad ta vabaks saada. Saatke kiiresti patrull!',
        'There are about twenty people round the pill dealer, some filming, and his friends are trying to get him free. Send a patrol fast!',
      ),
    ],
    details: [
      T(
        'Turvajuhi sõnul on kinnipeetu sõbrad muutunud agressiivseks ja lükkavad turvamehi, kohal on ainult kolm turvatöötajat.',
        'The head of security says the detainee’s friends have turned aggressive and are shoving the guards, and only three guards are there.',
      ),
      T(
        'Meditsiinitelgi arsti sõnul on tüdrukul kõrge palavik ja krambid, kiirabi viib ta haiglasse.',
        'The doctor in the medical tent says the girl has a high fever and seizures; the ambulance is taking her to hospital.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal, turvamehed hoiavad noormeest kinni, ümber on rahvast. Kas viime ta kohe alalt välja või vaatame siinsamas läbi?',
            '{callsign}: on scene, the guards are holding the young man and a crowd is round them. Do we take him off the site straight away or search him here?',
          ),
        ],
        [
          opt(
            'out',
            T('Viige ta alalt välja, läbivaatus autos', 'Take him off the site, search him in the car'),
            T(
              '{callsign}, võtke ta üle ja viige rahva eest ära, läbivaatus tehke autos.',
              '{callsign}, take him over and get him away from the crowd, search him in the car.',
            ),
            { success: 0.15, time: 5 },
          ),
          opt(
            'here',
            T('Vaadake ta kohapeal läbi', 'Search him on the spot'),
            T(
              '{callsign}, vaadake ta kohapeal läbi ja võtke sõpradelt seletused.',
              '{callsign}, search him on the spot and take statements from his friends.',
            ),
            { success: -0.05, risk: 0.05 },
          ),
        ],
        'here',
      ),
      qp('suspect', 3, R_SUSPECT),
      backup(
        u('patrol'),
        5,
        [
          T(
            '{callsign}: kinnipeetu sõbrad piirasid meid ümber ja lükkavad, rahvast tuleb juurde. Vajame kiiresti teist ekipaaži!',
            '{callsign}: the detainee’s friends have surrounded us and are shoving, more people are coming. Need another crew fast!',
          ),
        ],
        { chance: 0.3, timeoutMin: 6, fail: { success: -0.2, risk: 0.08, trust: -3 } },
      ),
      info(10, [
        T(
          '{callsign}: tüdruk viidi kiirabiga haiglasse, võtame tema sõpradelt seletusi.',
          '{callsign}: the girl has gone to hospital by ambulance, we are taking statements from her friends.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'dealer',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Noormees peeti kinni, tema taskutest leiti 48 ecstasy tabletti ja sularaha. Alustati kriminaalmenetlust KarS § 184 järgi. Kokku kukkunud tüdruk toimetati haiglasse, tema elu ei ole ohus.',
          'The young man was detained; 48 ecstasy pills and cash were found in his pockets. Criminal proceedings were opened under KarS § 184. The girl who collapsed was taken to hospital and her life is not in danger.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: müüja kinni, 48 tabletti, tüdruk haiglas.',
            '{callsign}: dealer detained, 48 pills, the girl is in hospital.',
          ),
        },
      ),
      out(
        'small',
        'report',
        [0.4, 0.85],
        2,
        T(
          'Noormehelt leiti ainult kotike kolme tabletiga, ülejäänud oli ta jõudnud enne kinnipidamist rahva sekka visata. Alustati kriminaalmenetlust narkootilise aine edasiandmise kohta, tüdruk on haiglas.',
          'Only a little bag with three pills was found on the young man; he had managed to throw the rest into the crowd before he was caught. Criminal proceedings were opened for supplying a narcotic drug, and the girl is in hospital.',
        ),
        {
          radio: T(
            '{callsign}: müüjalt kolm tabletti, menetlus alustatud.',
            '{callsign}: three pills on the dealer, case opened.',
          ),
        },
      ),
      out(
        'freed',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Kinnipeetu sõbrad tekitasid trügimise, tirisid ta segaduses lahti ja ta kadus rahvamassi. Teda otsitakse tunnistajate ja kaamerapiltide abil.',
          'The detainee’s friends started a crush, pulled him free in the confusion and he disappeared into the crowd. He is being traced through witnesses and camera footage.',
        ),
        {
          radio: T(
            '{callsign}: müüja pääses rahvamassi, otsingud jätkuvad.',
            '{callsign}: dealer got away into the crowd, search continues.',
          ),
        },
      ),
      out(
        'guard_hurt',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Kinnipeetu sõbrad ründasid turvamehi ja üks turvamees sai peavigastuse. Müüja ja kaks ründajat peeti kinni, alustati kriminaalmenetlust KarS § 263 järgi.',
          'The detainee’s friends attacked the guards and one guard suffered a head injury. The dealer and two of the attackers were detained and criminal proceedings were opened under KarS § 263.',
        ),
        {
          injuries: 1,
          arrests: 3,
          radio: T(
            '{callsign}: turvamees vigastatud, kolm kinni peetud.',
            '{callsign}: guard injured, three detained.',
          ),
        },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.45,
      toPriority: 1,
      text: T(
        'Turvajuht: kinnipeetu sõbrad tungivad turvameestele kallale ja üritavad teda vabaks kiskuda!',
        'Head of security: the detainee’s friends are going for the guards and trying to drag him free!',
      ),
    },
    expiresMin: 45,
    interactiveChance: 0.3,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Siin festivali turvajuht. Lava ees kukkus kokku üks tüdruk, ta võttis mingi tableti, ja me pidasime müüja kinni.',
          'This is the festival’s head of security. A girl collapsed in front of the stage, she took some pill, and we have caught the dealer.',
        ),
        T(
          'Hoiame festivalialal kinni noormeest, kes müüs tablette. Tema sõbrad lähevad närviliseks.',
          'We are holding a young man on the festival site who was selling pills. His friends are getting nervous.',
        ),
      ],
      answers: {
        injured: [
          T(
            'Tüdruk on meditsiinitelgis, tal on krambid, meie arst on tema juures.',
            'The girl is in the medical tent having seizures, our doctor is with her.',
          ),
        ],
        count: [
          T(
            'Müüja on üks, aga tema ümber on neli-viis sõpra.',
            'There is one dealer, but four or five of his friends are round him.',
          ),
        ],
        weapons: [
          T(
            'Relva ma ei näinud, taskust leidsime tablettide koti.',
            'I did not see a weapon, we found a bag of pills in his pocket.',
          ),
        ],
        intoxicated: [
          T(
            'Ta on ise ka millegi all, pupillid on hiiglasuured.',
            'He is on something himself, his pupils are huge.',
          ),
        ],
      },
      answersRu: {
        injured: ['Девушка в медицинской палатке, у неё судороги, наш врач с ней.'],
        count: ['Продавец один, но вокруг него четыре-пять друзей.'],
        weapons: ['Оружия я не {видел|видела}, в кармане нашли пакет с таблетками.'],
        intoxicated: ['Он и сам под чем-то, зрачки во весь глаз.'],
      },
      openingRu: [
        'Это начальник охраны фестиваля. Перед сценой упала девушка, она приняла какую-то таблетку, и мы задержали продавца.',
        'Мы держим на территории фестиваля парня, который продавал таблетки. Его друзья начинают нервничать.',
      ],
    },
    tags: ['festival', 'detained', 'in_progress'],
  },

  // 8. Soomaa's "fifth season": two canoeists out on the spring flood have not come back.
  {
    id: 'missing_soomaa_suurvee_kanuumatkajad',
    category: 'missing',
    code: 'OTS',
    title: T('Kanuumatkajad ei jõudnud suurveelt tagasi', 'Canoeists overdue on the spring flood'),
    priority: 2,
    weight: 1,
    months: [3, 4],
    // Due back at three, the call comes when it starts to get dark (in March and April after 18:00).
    hours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 1.2, 2.5, 3, 2.8, 1.5, 0.3, 0],
    regions: ['laane'],
    places: ['forest'],
    placeTags: ['flood'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('heli')] },
    onScene: [45, 100],
    persons: [
      { role: 'missing', gender: 'M', age: [25, 60] },
      { role: 'caller', gender: 'any', age: [30, 65] },
    ],
    agencies: [
      {
        agency: 'paaste',
        chance: 0.9,
        reason: T('Paadid ja veepäästjad üleujutusalale', 'Boats and water rescuers for the flooded area'),
      },
    ],
    summary: [
      T(
        '{address}. Soomaa suurveele kanuuga läinud kaks meest pidid kella kolmeks Riisale tagasi jõudma, kuid ei ole tulnud ega vasta telefonile. Vesi on jääkülm ja hakkab hämarduma.',
        '{address}. Two men who went canoeing on the Soomaa spring flood were due back at Riisa by three o’clock but have not come and are not answering their phones. The water is ice cold and it is getting dark.',
      ),
      T(
        '{address}. Kanuurendi omaniku teatel on kaks tema klienti üleujutatud luhtadel kadunud. Viimati helistasid nad lõuna ajal ja ütlesid, et ei leia enam jõesängi.',
        '{address}. The owner of a canoe hire says two of his customers are lost on the flooded water meadows. They last phoned around midday, saying they could no longer find the river bed.',
      ),
    ],
    callerLines: [
      T(
        'Kaks meest läksid hommikul kanuuga suurveele ja pidid ammu tagasi olema. Telefonid ei vasta.',
        'Two men went out on the flood in a canoe this morning and should have been back long ago. Their phones are not answering.',
      ),
      T(
        'Vesi on metsas üle meetri sügav, jõesängi ei ole enam näha. Kui nad läksid ümber, siis selles vees ei pea keegi kaua vastu.',
        'The water in the forest is more than a metre deep and you cannot see the river bed any more. If they capsized, nobody lasts long in that water.',
      ),
      T(
        'Ma ei saa ise kanuumatkajatele järele minna, Soomaa tee on ka vee all.',
        'I cannot go after the canoeists myself, the Soomaa road is under water too.',
      ),
    ],
    details: [
      T(
        'Matkakorraldaja sõnul on vesi vaid paar kraadi soe ja meestel ei pruukinud päästevestid seljas olla.',
        'The canoe hire owner says the water is only a couple of degrees above freezing and the men may not have been wearing life jackets.',
      ),
      T(
        'Mitu Soomaa kõrvalteed on vee all, autoga pääseb ainult Riisani.',
        'Several of the Soomaa side roads are under water; you can only get as far as Riisa by car.',
      ),
    ],
    beats: [
      agency(
        'paaste',
        'arrive',
        [
          T(
            '{callsign}: oleme Riisal, vesi algab kohe parkla tagant. Ilma paadita me edasi ei saa, vajame päästjate paati!',
            '{callsign}: we are at Riisa, the water starts right behind the car park. We cannot go any further without a boat, we need the rescuers’ boat!',
          ),
        ],
        { timeoutMin: 6, fail: { success: -0.25, trust: -3 } },
      ),
      search(3, 3, [
        T(
          '{callsign}: otsime mööda vee piiri ja metsateid, päästjate paat läheb jõesängi pidi allavoolu.',
          '{callsign}: searching along the water’s edge and the forest tracks, the rescuers’ boat is going downstream along the river bed.',
        ),
      ]),
      choice(
        6,
        [
          T(
            '{callsign}: hakkab hämarduma ja ala on suur. Kas küsime lennusalga kopterit soojuskaameraga?',
            '{callsign}: it is getting dark and the area is huge. Do we ask for the police helicopter with a thermal camera?',
          ),
        ],
        [
          opt(
            'heli',
            T('Jah, kopter appi', 'Yes, call in the helicopter'),
            T(
              '{callsign}, teeme päringu lennusalgale, kopter tuleb soojuskaameraga.',
              '{callsign}, requesting the air unit, the helicopter is coming with a thermal camera.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'ground',
            T('Ei, otsime maad ja vett mööda', 'No, carry on by land and water'),
            T(
              '{callsign}, jätkake maad ja vett mööda, kopteri vajadust hindame hiljem.',
              '{callsign}, carry on by land and water, we will decide on the helicopter later.',
            ),
            { success: -0.1 },
          ),
        ],
        'ground',
      ),
      info(12, [
        T(
          '{callsign}: päästjate paat on jõesängis, kontrollime metsaservi ja kõrgemaid kohti.',
          '{callsign}: the rescuers’ boat is on the river bed, we are checking the forest edges and higher ground.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'found',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Matkajad leiti üleujutatud metsast, kus kanuu oli ümber läinud ja nad olid pääsenud kõrgemale kohale. Päästjad tõid nad paadiga ära, nad olid märjad ja külmunud, kuid vigastusteta.',
          'The canoeists were found in the flooded forest, where their canoe had capsized and they had made it to higher ground. The rescuers brought them out by boat, wet and frozen but unhurt.',
        ),
        {
          radio: T(
            '{callsign}: matkajad leitud ja paadiga ära toodud, vigastusteta.',
            '{callsign}: canoeists found and brought out by boat, unhurt.',
          ),
        },
      ),
      out(
        'lost',
        'resolved',
        [0.45, 1],
        2,
        T(
          'Matkajad olid jõesängist kõrvale eksinud ja nende telefonid said märjaks. Päästjad leidsid nad üleujutatud heinamaalt küüni katuselt ja tõid paadiga Riisale, nad olid külmunud, kuid terved.',
          'The canoeists had strayed off the river bed and their phones had got wet. The rescuers found them on the roof of a barn on a flooded meadow and brought them back to Riisa by boat, frozen but unhurt.',
        ),
        {
          radio: T(
            '{callsign}: matkajad leitud küüni katuselt, mõlemad terved.',
            '{callsign}: canoeists found on a barn roof, both unhurt.',
          ),
        },
      ),
      out(
        'hypothermia',
        'hospital',
        [0.2, 0.6],
        2,
        T(
          'Kanuu oli ümber läinud ja üks matkaja oli tund aega vees puust kinni hoidnud. Ta toimetati raske alajahtumisega Pärnu haiglasse, teine pääses kergemalt.',
          'The canoe had capsized and one of the men had clung to a tree in the water for an hour. He was taken to Pärnu hospital with severe hypothermia; the other got off more lightly.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: üks matkaja raske alajahtumisega Pärnu haiglasse.',
            '{callsign}: one canoeist to Pärnu hospital with severe hypothermia.',
          ),
        },
      ),
      out(
        'night',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Otsingud kestsid läbi öö ja matkajad leiti alles koidu ajal puude vahelt. Mõlemad olid alajahtunud ja toimetati haiglasse.',
          'The search went on through the night and the canoeists were only found among the trees at dawn. Both were hypothermic and were taken to hospital.',
        ),
        {
          injuries: 2,
          radio: T(
            '{callsign}: matkajad leitud koidikul, mõlemad alajahtunud, haiglasse.',
            '{callsign}: canoeists found at dawn, both hypothermic, to hospital.',
          ),
        },
      ),
      out(
        'drowned',
        'tragedy',
        [0, 0.12],
        1,
        T(
          'Üks matkajatest leiti hommikul uppununa, teine päästeti puu otsast raske alajahtumisega. Asjaolusid uurib politsei.',
          'One of the canoeists was found drowned in the morning; the other was rescued from a tree with severe hypothermia. The police are investigating the circumstances.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: üks matkaja uppunud, teine päästetud.',
            '{callsign}: one canoeist drowned, the other rescued.',
          ),
        },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.5,
      toPriority: 1,
      text: T(
        'Teataja: üks matkaja sai korraks helistada, nad on läbimärjad ja külmetavad ega tea, kus nad on!',
        'Caller: one of the canoeists managed a short call, they are soaked and freezing and do not know where they are!',
      ),
    },
    expiresMin: 60,
    interactiveChance: 0.3,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Kaks minu klienti läksid kanuuga suurveele ja ei ole tagasi tulnud. Telefonid ei vasta.',
          'Two of my customers went out on the spring flood in a canoe and have not come back. Their phones are not answering.',
        ),
        T(
          'Mehed pidid kell kolm tagasi olema, nüüd hakkab pimedaks minema ja vesi on jääkülm.',
          'The men were due back at three, it is getting dark now and the water is ice cold.',
        ),
      ],
      answers: {
        when: [
          T(
            'Nad läksid välja hommikul kella kümne paiku, viimati helistasid lõuna ajal.',
            'They set off at about ten this morning and last phoned around midday.',
          ),
        ],
        count: [T('Kaks meest ühes kanuus.', 'Two men in one canoe.')],
        vehicle: [
          T(
            'Nende auto seisab siin Riisal, nad on kanuuga. Kanuu on punane.',
            'Their car is here at Riisa, they are in a canoe. The canoe is red.',
          ),
        ],
        injured: [
          T(
            'Ma ei tea. Viimati ütlesid, et kõik on korras, aga nad olid märjad.',
            'I do not know. The last time they said everything was all right, but they were wet.',
          ),
        ],
      },
      answersRu: {
        when: ['Вышли утром около десяти, последний раз звонили в обед.'],
        count: ['Двое мужчин в одном каноэ.'],
        vehicle: ['Их машина стоит здесь, в Рийса, а они на каноэ. Каноэ красное.'],
        injured: ['Не знаю. В последний раз говорили, что всё нормально, но они промокли.'],
      },
      openingRu: [
        'Двое моих клиентов в половодье ушли на каноэ и не вернулись. Телефоны не отвечают.',
        'Они должны были вернуться к трём, а сейчас темнеет, и вода ледяная.',
      ],
    },
    tags: ['water', 'flood'],
  },

  // 9. Spring grass burning gets into the Matsalu reed beds in the nesting season.
  {
    id: 'environment_matsalu_roostikupoleng',
    category: 'environment',
    code: 'KK',
    title: T('Kulupõletamisest süttis Matsalu roostik', 'Grass burning sets the Matsalu reed beds alight'),
    priority: 2,
    weight: 0.7,
    months: [4, 5],
    hours: 'day',
    regions: ['laane'],
    places: ['forest'],
    placeTags: ['birds'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [40, 90],
    persons: [
      { role: 'suspect', gender: 'M', age: [55, 85], record: 0.1 },
      { role: 'caller', gender: 'any', age: [30, 70] },
    ],
    agencies: [
      {
        agency: 'paaste',
        chance: 1,
        reason: T('Roostikupõleng rahvuspargis', 'Reed fire in the national park'),
      },
    ],
    summary: [
      T(
        '{address}. Matsalu rahvuspargi roostik põleb, tuul kannab leeke ja suitsu maantee ja talude poole. Teataja nägi, kuidas lähedal talus põletati kulu.',
        '{address}. The reed beds of Matsalu National Park are on fire and the wind is carrying the flames and smoke towards the road and the farms. The caller saw dry grass being burnt at a farm nearby.',
      ),
      T(
        '{address}. Kraavipervel kulu põletamisest läks tuli tuulega roostikku ja põleng levib kiiresti. Suits katab maanteed, nähtavus on mõni meeter.',
        '{address}. Grass burning along a ditch has carried into the reed beds on the wind and the fire is spreading fast. Smoke is covering the road and visibility is down to a few metres.',
      ),
    ],
    callerLines: [
      T(
        'Roostik põleb! Üks mees põletas oma heinamaal kulu ja nüüd on tuli roostikus.',
        'The reeds are on fire! A man was burning dry grass on his meadow and now the fire is in the reed beds.',
      ),
      T(
        'Roostiku põlengu suits on nii paks, et maanteel ei näe midagi, autod sõidavad sinna sisse.',
        'The smoke from the burning reeds is so thick you cannot see anything on the road, cars are driving straight into it.',
      ),
      T(
        'Matsalu roostik põleb ja praegu on lindude pesitsusaeg, kogu see roostik on pesi täis!',
        'The Matsalu reed beds are burning and it is the nesting season, the whole reed bed is full of nests!',
      ),
    ],
    callerLinesRu: [
      'Камыш горит! Один мужчина жёг сухую траву у себя на лугу, и теперь огонь перекинулся на камыши.',
      'От горящего камыша такой густой дым, что на дороге ничего не видно, машины въезжают прямо в него.',
      'В Матсалу горят камыши, а сейчас птицы гнездятся, там же везде гнёзда!',
    ],
    details: [
      T(
        'Teataja sõnul liigub tuli tuulega lähima talu heinaküüni poole, talus elab eakas paar.',
        'The caller says the wind is driving the fire towards the hay barn of the nearest farm, where an elderly couple live.',
      ),
      T(
        'Kulu põletanud mees üritab ise labidaga tuld kustutada ja ei taha eemale minna.',
        'The man who lit the grass is trying to beat the fire out with a shovel and will not move away.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, roostik põleb laialt ja suits katab maanteed. Sulgeme tee, päästjad on teel.',
          '{callsign}: on scene, the reeds are burning over a wide area and smoke is covering the road. Closing the road, the rescuers are on their way.',
        ),
      ]),
      choice(
        3,
        [
          T(
            '{callsign}: talus elab eakas paar, kes ei taha lahkuda, tuli on talu lähedal. Kas viime nad ohutusse kohta?',
            '{callsign}: an elderly couple live at the farm and do not want to leave, the fire is close to the farm. Do we move them to safety?',
          ),
        ],
        [
          opt(
            'evacuate',
            T('Jah, viige nad ohutusse kohta', 'Yes, move them to safety'),
            T(
              '{callsign}, viige nad ohutusse kohta, päästjad kaitsevad hooneid.',
              '{callsign}, move them to safety, the rescuers will protect the buildings.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'leave',
            T('Ei, nad jäävad oma vastutusel', 'No, they stay at their own risk'),
            T(
              '{callsign}, nad jäävad oma vastutusel, päästjad jälgivad olukorda.',
              '{callsign}, they stay at their own risk, the rescuers are keeping an eye on it.',
            ),
            { success: -0.1, risk: 0.04 },
          ),
        ],
        'leave',
      ),
      qp('suspect', 6, R_SUSPECT),
      agency(
        'keskkonnaamet',
        9,
        [
          T(
            '{callsign}: põleng on rahvuspargis keset pesitsusaega. Palun teavitage Keskkonnaametit, nad peavad kahju hindama.',
            '{callsign}: the fire is in the national park in the middle of the nesting season. Please notify the Environmental Board, they need to assess the damage.',
          ),
        ],
        { chance: 0.7, timeoutMin: 8, fail: { success: -0.1 } },
      ),
    ],
    outcomes: [
      out(
        'stopped',
        'report',
        [0.5, 1],
        4,
        T(
          'Päästjad said põlengu kontrolli alla ja kaitsesid talu hooned, põles mitukümmend hektarit roostikku. Kulu põletanud mehe suhtes alustati väärteomenetlust, Keskkonnaamet hindab kahju linnustikule.',
          'The rescuers brought the fire under control and saved the farm buildings; several dozen hectares of reed bed burnt. Misdemeanour proceedings were opened against the man who lit the grass, and the Environmental Board is assessing the harm to the birds.',
        ),
        {
          radio: T(
            '{callsign}: põleng kontrolli all, talu hooned terved, menetlus alustatud.',
            '{callsign}: fire under control, farm buildings saved, case opened.',
          ),
        },
      ),
      out(
        'quick',
        'fine',
        [0.55, 1],
        2,
        T(
          'Tuul pöördus ja päästjad said põlengu kiiresti kontrolli alla. Kulu põletanud mehele määrati trahv tuleohutusnõuete rikkumise eest.',
          'The wind turned and the rescuers quickly brought the fire under control. The man who lit the grass was fined for breaching the fire safety rules.',
        ),
        {
          radio: T(
            '{callsign}: tuli kontrolli all, kulu põletajale trahv.',
            '{callsign}: fire under control, the grass burner fined.',
          ),
        },
      ),
      out(
        'barn',
        'report',
        [0.2, 0.6],
        2,
        T(
          'Tuli jõudis talu heinaküünini, mis põles maha. Elanikud jõudsid viimasel hetkel eemale, kulu põletanud mehe suhtes alustati menetlust.',
          'The fire reached the farm’s hay barn, which burnt down. The residents got away at the last moment, and proceedings were opened against the man who lit the grass.',
        ),
        {
          radio: T(
            '{callsign}: heinaküün põles maha, inimesed on ohutus kohas.',
            '{callsign}: hay barn burnt down, the people are safe.',
          ),
        },
      ),
      out(
        'smoke',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Tuli jõudis talu juurde ja eakas peremees läks heinaküüni päästma ning sai suitsumürgituse. Ta toimetati haiglasse, küün põles maha.',
          'The fire reached the farm and the elderly farmer went to save the hay barn and suffered smoke poisoning. He was taken to hospital; the barn burnt down.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: eakas mees suitsumürgitusega haiglasse.',
            '{callsign}: elderly man to hospital with smoke poisoning.',
          ),
        },
      ),
      out(
        'crash',
        'hospital',
        [0, 0.3],
        1,
        T(
          'Maanteel põrkasid suitsu sees kokku kaks autot ja kaks inimest sai viga. Põleng kustutati alles õhtuks.',
          'Two cars collided in the smoke on the road and two people were hurt. The fire was not put out until the evening.',
        ),
        {
          injuries: 2,
          radio: T(
            '{callsign}: suitsus avarii, kaks vigastatut haiglasse.',
            '{callsign}: crash in the smoke, two injured to hospital.',
          ),
        },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.5,
      toPriority: 1,
      text: T(
        'Teataja: tuli jõudis talu heinaküüni juurde, vanapaar on õues ja üritab ise kustutada!',
        'Caller: the fire has reached the farm’s hay barn, the old couple are outside trying to put it out themselves!',
      ),
    },
    expiresMin: 60,
    interactiveChance: 0.25,
    tags: ['fire', 'birds'],
  },

  // 10. A seal pup on the beach in spring, with a crowd taking pictures and a dog off the lead.
  {
    id: 'environment_hulgepoeg_rannal',
    category: 'environment',
    code: 'LOOM',
    title: T(
      'Hülgepoeg rannal, ümber koer ja pealtvaatajad',
      'Seal pup on the beach, surrounded by a dog and onlookers',
    ),
    priority: 4,
    weight: 1.4,
    months: [3, 4, 5],
    // A crowd photographing a seal pup is a daylight scene.
    hours: [
      0, 0, 0, 0, 0, 0, 0, 0.3, 0.8, 1.2, 1.5, 1.6, 1.6, 1.6, 1.6, 1.6, 1.5, 1.4, 1.2, 0.9, 0.5, 0.2, 0, 0,
    ],
    regions: ['laane'],
    places: ['beach'],
    placeTags: ['sea'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [20, 50],
    persons: [
      { role: 'suspect', gender: 'any', age: [25, 70] },
      { role: 'caller', gender: 'any', age: [25, 75] },
    ],
    agencies: [
      {
        agency: 'keskkonnaamet',
        chance: 0.6,
        reason: T(
          'Hülgepoeg rannal, vajalik spetsialisti hinnang',
          'Seal pup on the beach, a specialist needs to assess it',
        ),
      },
    ],
    summary: [
      T(
        '{place}, {address}. Rannal lebab hülgepoeg, tema ümber on kogunenud inimesed, kes teevad pilte. Lahtine koer haugub ja üritab poega näksata.',
        '{place}, {address}. A seal pup is lying on the beach with people crowding round taking pictures. A dog off the lead is barking and trying to snap at the pup.',
      ),
      T(
        '{place}, {address}. Teataja sõnul tahavad mõned jalutajad hülgepoja vette tagasi kanda ja valavad talle vett peale. Poeg on ehmunud ja susiseb.',
        '{place}, {address}. The caller says some walkers on the beach want to carry the seal pup back into the water and are pouring water over it. The pup is frightened and hissing.',
      ),
    ],
    callerLines: [
      T(
        'Rannal on väike hülgepoeg ja inimesed seisavad tal ümber nagu loomaaias. Üks koer haugub otse tema nina ees.',
        'There is a little seal pup on the beach and people are standing round it like at the zoo. A dog is barking right in its face.',
      ),
      T(
        'Rannal lebab hülgepoeg ja üks mees tahab teda tekiga vette tagasi kanda. Kas see on üldse lubatud?',
        'There is a seal pup lying on the beach and a man wants to carry it back into the sea in a blanket. Is that even allowed?',
      ),
      T(
        'Hülgepoja kallal haugub lahtine koer, aga omanik ütleb, et rand on kõigile ja koer võib joosta, kus tahab.',
        'A dog off the lead is barking at the seal pup, but the owner says the beach is for everyone and the dog can run wherever it likes.',
      ),
    ],
    callerLinesRu: [
      'На пляже маленький тюленёнок, а люди стоят вокруг, как в зоопарке. Одна собака лает прямо ему в морду.',
      'На пляже лежит тюленёнок, и один мужчина хочет унести его в одеяле обратно в воду. Так вообще можно?',
      'На тюленёнка лает собака без поводка, а [хозяин|хозяйка] говорит, что пляж для всех и собака может бегать, где хочет.',
    ],
    details: [
      T(
        'Keskkonnaameti soovituse järgi tuleb hülgepoeg rahule jätta ja temast eemale hoida, rannal puhkav poeg ei vaja inimeste abi.',
        'The Environmental Board advises leaving a seal pup alone and keeping away from it; a pup resting on the beach does not need people’s help.',
      ),
      T(
        'Teataja sõnul ei pane koera omanik koera rihma otsa ja vaidleb teiste jalutajatega.',
        'The caller says the dog’s owner will not put the dog on a lead and is arguing with other people on the beach.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, hülgepoeg lebab veepiiril ja ümber on paarkümmend inimest. Palume kõigil eemale minna.',
          '{callsign}: on scene, the seal pup is lying at the water’s edge with about twenty people round it. Asking everyone to move away.',
        ),
      ]),
      choice(
        3,
        [
          T(
            '{callsign}: koera omanik keeldub koera rihma panemast ja ütleb, et rand on kõigile. Kuidas toimime?',
            '{callsign}: the dog’s owner refuses to put the dog on a lead and says the beach is for everyone. How do we proceed?',
          ),
        ],
        [
          opt(
            'warn',
            T('Selgitage ja tehke hoiatus, koer rihma', 'Explain, warn, dog on the lead'),
            T(
              '{callsign}, selgitage omanikule, et koer peab olema rihmas ja looma ei tohi häirida, ning tehke hoiatus.',
              '{callsign}, explain to the owner that the dog must be on a lead and the animal must not be disturbed, and give a warning.',
            ),
            { success: 0.15, time: 5 },
          ),
          opt(
            'ignore',
            T('Ärge vaielge, hoidke rahvast eemal', 'Do not argue, keep the crowd back'),
            T(
              '{callsign}, ärge omanikuga vaielge, hoidke rahvas eemal.',
              '{callsign}, do not argue with the owner, keep the crowd back.',
            ),
            { success: -0.05, outcome: 'left_alone' },
          ),
        ],
        'ignore',
      ),
      agency(
        'keskkonnaamet',
        5,
        [
          T(
            '{callsign}: rahvas on eemal. Palun ühendage Keskkonnaametiga, kas nende spetsialist tuleb poega vaatama?',
            '{callsign}: the crowd is back. Please put us through to the Environmental Board, can their specialist come and look at the pup?',
          ),
        ],
        { timeoutMin: 10, fail: { success: -0.05 } },
      ),
      info(10, [
        T(
          '{callsign}: Keskkonnaameti spetsialist on teel, piirame koha lindiga.',
          '{callsign}: the Environmental Board specialist is on the way, we are taping the area off.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'left_alone',
        'resolved',
        [0.45, 1],
        4,
        T(
          'Inimesed juhatati eemale ja koht piirati lindiga. Keskkonnaameti spetsialisti sõnul on poeg terve, õhtul ujus ta ise merre.',
          'People were moved away and the spot was taped off. The Environmental Board specialist says the pup is healthy; in the evening it swam out to sea by itself.',
        ),
        {
          radio: T(
            '{callsign}: hülgepoeg rahule jäetud, koht piiratud, lõpetame.',
            '{callsign}: seal pup left in peace, area taped off, closing.',
          ),
        },
      ),
      out(
        'dog_owner',
        'warning',
        [0.5, 1],
        2,
        T(
          'Koera omanikule tehti hoiatus koera lahtiselt pidamise eest ja ta lahkus rannast. Hülgepoeg jäeti rahule.',
          'The dog’s owner was warned for letting the dog run loose and left the beach. The seal pup was left in peace.',
        ),
        {
          radio: T(
            '{callsign}: koeraomanikule hoiatus, hülgepoeg jäeti rahule.',
            '{callsign}: dog owner warned, seal pup left in peace.',
          ),
        },
      ),
      out(
        'carried',
        'referred',
        [0.2, 0.6],
        2,
        T(
          'Enne patrulli saabumist kandsid jalutajad poja vette, kuid ta tuli kohe kaldale tagasi. Keskkonnaameti spetsialist vaatas kurnatud poja üle ja korraldas poja viimise hooldusele.',
          'Before the patrol arrived walkers had carried the pup into the water, but it came straight back ashore. The Environmental Board specialist checked the exhausted pup and arranged for it to be taken into care.',
        ),
        {
          radio: T(
            '{callsign}: poeg kanti vette, ta viiakse hooldusele.',
            '{callsign}: pup was carried into the sea, it is going into care.',
          ),
        },
      ),
      out(
        'bitten',
        'report',
        [0, 0.4],
        2,
        T(
          'Koer haaras hülgepojast kinni ja poeg sai haava. Keskkonnaamet korraldas poja viimise hooldusele, koera omaniku suhtes alustati väärteomenetlust.',
          'The dog got hold of the seal pup and wounded it. The Environmental Board arranged for the pup to be taken into care, and misdemeanour proceedings were opened against the dog’s owner.',
        ),
        {
          radio: T(
            '{callsign}: koer vigastas poega, omaniku suhtes menetlus.',
            '{callsign}: dog injured the pup, case opened against the owner.',
          ),
        },
      ),
    ],
    expiresMin: 180,
    interactiveChance: 0.15,
    tags: ['animal', 'beach'],
  },

  // 11. A yacht from outside Schengen ties up at the marina without a border check; two of the crew are in town.
  {
    id: 'border_jaht_ilma_piirikontrollita',
    category: 'border',
    code: 'PR',
    title: T('Jaht saabus piirikontrollita', 'Yacht arrived without a border check'),
    priority: 3,
    weight: 1.1,
    months: [5, 6, 7, 8, 9],
    // The harbour master is on duty from morning to late evening.
    hours: [
      0, 0, 0, 0, 0, 0, 0.2, 0.6, 1, 1.3, 1.5, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.5, 1.4, 1.2, 1, 0.6, 0.2, 0,
    ],
    regions: ['laane'],
    places: ['port'],
    placeTags: ['marina'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 75],
    persons: [
      { role: 'suspect', gender: 'M', age: [30, 65], record: 0.05 },
      { role: 'caller', gender: 'any', age: [30, 65], relation: 'employee' },
    ],
    summary: [
      T(
        '{place}, {address}. Sadamakapteni teatel kinnitus kai äärde väljastpoolt Schengeni ala tulnud purjejaht, mis ei teatanud saabumisest piirivalvele. Kaks meeskonnaliiget läksid linna.',
        '{place}, {address}. The harbour master reports that a sailing yacht from outside the Schengen area has moored without notifying the border guard of its arrival. Two of the crew have gone into town.',
      ),
      T(
        '{place}, {address}. Välisriigi lipu all sõitev jaht saabus otse Schengeni-välisest sadamast ja meeskond ei ole piirikontrolli läbinud. Kipper on pardal ja ütleb, et ei teadnud nõudest.',
        '{place}, {address}. A foreign-flagged yacht has come straight from a port outside Schengen and the crew have not been through a border check. The skipper is on board and says he did not know the rule.',
      ),
    ],
    callerLines: [
      T(
        'Meile tuli jaht, mille kipper ütleb, et nad tulid otse väljastpoolt Schengenit. Piirivalvele nad ei teatanud ja kaks meest läksid juba linna.',
        'A yacht has come in and the skipper says they sailed straight from outside Schengen. They did not notify the border guard and two of the men have already gone into town.',
      ),
      T(
        'Meie kai ääres on välismaa jaht, mille kipper ei taha dokumente näidata. Ta ütleb, et ootab meeskonna tagasi ja sõidab siis edasi.',
        'There is a foreign yacht at our quay and the skipper will not show any documents. He says he is waiting for his crew to come back and will then sail on.',
      ),
    ],
    callerLinesRu: [
      'К нам пришла яхта, шкипер говорит, что они шли прямо из-за пределов Шенгена. Пограничникам они не сообщили, а двое уже ушли в город.',
      'У нашего причала стоит иностранная яхта, шкипер не хочет показывать документы. Говорит, что дождётся своих ребят и пойдёт дальше.',
    ],
    details: [
      T(
        'Sadamakapteni sõnul kandis üks linna läinud meestest suurt kotti ja nad lahkusid kiirustades.',
        'The harbour master says one of the men who went into town was carrying a big bag and they left in a hurry.',
      ),
      T(
        'Jahi kodusadam on Euroopa Liidust väljas, meeskonnaliikmete viisanõue on selgitamata.',
        'The yacht’s home port is outside the European Union; whether the crew need visas has not been established.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: oleme kail, kipper on pardal. Kontrollime dokumendid ja teavitame piirikontrolli.',
          '{callsign}: we are on the quay, the skipper is on board. Checking documents and informing border control.',
        ),
      ]),
      qp('suspect', 2, R_SUSPECT),
      choice(
        5,
        [
          T(
            '{callsign}: kipper palub luba sõita edasi kohe, kui meeskond tagasi tuleb. Kas jaht jääb kai äärde, kuni kõik on kontrollitud?',
            '{callsign}: the skipper is asking to sail on as soon as his crew is back. Does the yacht stay at the quay until everyone has been checked?',
          ),
        ],
        [
          opt(
            'hold',
            T('Jaht jääb kai äärde, meeskond üles otsida', 'The yacht stays, find the crew'),
            T(
              '{callsign}, jaht ei välju enne, kui kõik meeskonnaliikmed on piirikontrolli läbinud. Otsige linna läinud mehed üles.',
              '{callsign}, the yacht does not leave until every crew member has been through a border check. Find the men who went into town.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'let',
            T('Kontrollige kohalolijad, jaht võib minna', 'Check whoever is there, the yacht may go'),
            T(
              '{callsign}, kontrollige kohalolijad, ülejäänute eest vastutab kipper.',
              '{callsign}, check whoever is on board, the skipper answers for the rest.',
            ),
            { success: -0.1, outcome: 'missing_crew' },
          ),
        ],
        'let',
      ),
      info(
        8,
        [
          T(
            '{callsign}: piirikontrolli ametnik jõudis sadamasse ja kontrollib pardal olijate dokumente.',
            '{callsign}: the border check officer has reached the harbour and is checking the documents of those on board.',
          ),
        ],
        0.6,
      ),
    ],
    outcomes: [
      out(
        'checked',
        'warning',
        [0.5, 1],
        4,
        T(
          'Linna läinud meeskonnaliikmed leiti sadamakohvikust ja kõik läbisid piirikontrolli. Kiprile tehti hoiatus saabumisest teatamata jätmise eest.',
          'The crew members who had gone into town were found in a harbour café and everyone was put through a border check. The skipper was warned for failing to give notice of arrival.',
        ),
        {
          radio: T(
            '{callsign}: meeskond leitud, piirikontroll tehtud, kiprile hoiatus.',
            '{callsign}: crew found, border check done, skipper warned.',
          ),
        },
      ),
      out(
        'no_visa',
        'arrest',
        [0.5, 1],
        2,
        T(
          'Ühel meeskonnaliikmel puudus viisa ja tal ei olnud õigust Schengeni alale siseneda. Ta peeti kinni ja anti üle migratsioonijärelevalvele, kiprile koostati väärteoprotokoll.',
          'One crew member had no visa and no right to enter the Schengen area. He was detained and handed over to migration supervision, and the skipper was given a misdemeanour report.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: üks meeskonnaliige viisata, üle antud migratsioonijärelevalvele.',
            '{callsign}: one crew member without a visa, handed to migration supervision.',
          ),
        },
      ),
      out(
        'fine',
        'fine',
        [0.35, 0.85],
        2,
        T(
          'Kõigi meeskonnaliikmete dokumendid olid korras, kipper ei teadnud teatamiskohustusest. Talle koostati väärteoprotokoll ja jaht jätkas teekonda järgmisel päeval.',
          'All the crew’s documents were in order; the skipper had not known about the duty to give notice. He was given a misdemeanour report and the yacht sailed on the next day.',
        ),
        {
          radio: T(
            '{callsign}: dokumendid korras, kiprile väärteoprotokoll.',
            '{callsign}: documents in order, skipper given a misdemeanour report.',
          ),
        },
      ),
      out(
        'missing_crew',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Üks linna läinud meestest ei naasnud jahile ja tema asukoht ei ole teada. Teda otsitakse ja kipri suhtes alustati väärteomenetlust.',
          'One of the men who had gone into town never came back to the yacht and his whereabouts are unknown. He is being looked for and misdemeanour proceedings were opened against the skipper.',
        ),
        {
          radio: T(
            '{callsign}: üks meeskonnaliige kadunud, teda otsitakse.',
            '{callsign}: one crew member missing, being looked for.',
          ),
        },
      ),
    ],
    expiresMin: 150,
    interactiveChance: 0.2,
    tags: ['sea', 'schengen'],
  },

  // 12. Saaremaa rally weekend: a drunk spectator drives onto the closed special stage.
  {
    id: 'traffic_ralli_kiiruskatsele_soitnud_pealtvaataja',
    category: 'traffic',
    code: 'LJ',
    title: T('Joobes pealtvaataja sõitis ralli kiiruskatsele', 'Drunk spectator drove onto the rally stage'),
    priority: 3,
    weight: 0.3,
    months: [10],
    // Rally stages run in daylight.
    hours: [0, 0, 0, 0, 0, 0, 0, 0.3, 1.2, 1.6, 1.8, 1.8, 1.8, 1.8, 1.8, 1.6, 1.4, 1, 0.4, 0, 0, 0, 0, 0],
    regions: ['laane'],
    places: ['highway'],
    placeTags: ['rally'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'driver', gender: 'M', age: [20, 50], intoxicated: 0.85, noLicense: 0.25, record: 0.3 },
      { role: 'caller', gender: 'any', age: [30, 65], relation: 'employee' },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInspection: 0.4, noInsurance: 0.15 }],
    summary: [
      T(
        '{address}. Saaremaa ralli korraldaja teatel keeras joobes pealtvaataja maanteelt oma autoga suletud kiiruskatsele ja keeldub sealt lahkumast. Katse on peatatud, võistlusautod ootavad stardis.',
        '{address}. The Saaremaa rally organisers report that a drunk spectator turned off the main road in his own car onto a closed special stage and refuses to leave it. The stage has been stopped and the rally cars are waiting at the start.',
      ),
      T(
        '{address}. Maanteelt kõrvale jääval rallikatsel on joobes mees, kes sõitis autoga rajale ja keerutas seal kurvis. Rajakohtunikud võtsid tal võtmed ära, mees ähvardab neid.',
        '{address}. On a rally stage just off the main road there is a drunk man who drove his car onto the course and spun it round on a bend. The marshals took his keys and he is threatening them.',
      ),
    ],
    callerLines: [
      T(
        'Üks purjus mees sõitis oma autoga meie suletud katsele ja keerutas seal kurvis. Nüüd seisab ta keset rada ega lähe ära.',
        'A drunk man drove his car onto our closed stage and spun it round on a bend. Now he is standing in the middle of the course and will not go away.',
      ),
      T(
        'Purjus mehe pärast on katse peatatud, paarkümmend ralliautot ootavad stardis. Kui ta kohe ära ei lähe, läheb kogu ajakava segi.',
        'The stage is stopped because of the drunk man and a couple of dozen rally cars are waiting at the start. If he does not go now, the whole timetable is ruined.',
      ),
      T(
        'Rajale sõitnud purjus mehe sõbrad seisavad kurvi välisküljel, kõige ohtlikumas kohas, ja meid ei kuula.',
        'The drunk man’s friends are standing on the outside of the bend, the most dangerous spot, and will not listen to us.',
      ),
    ],
    callerLinesRu: [
      'Один пьяный заехал на своей машине на наш закрытый спецучасток и крутился там в повороте. Теперь стоит посреди трассы и не уходит.',
      'Из-за этого пьяного спецучасток остановлен, на старте ждут десятка два раллийных машин. Если он сейчас не уйдёт, всё расписание полетит.',
      'Друзья этого пьяного стоят на внешней стороне поворота, в самом опасном месте, и нас не слушают.',
    ],
    details: [
      T(
        'Rajakohtunikud võtsid mehelt autovõtmed ära, kuid tal võib olla varuvõti.',
        'The marshals took the man’s car keys, but he may have a spare.',
      ),
      T(
        'Korraldaja sõnul tahab võistluse juht katse poole tunni pärast uuesti käivitada, mehe sõbrad on endiselt ohutsoonis.',
        'The organisers say the clerk of the course wants to restart the stage in half an hour, and the man’s friends are still in the danger zone.',
      ),
    ],
    beats: [
      qp('driver', 'arrive', R_DRIVER),
      choice(
        3,
        [
          T(
            '{callsign}: mees on tugevas joobes, tema sõbrad seisavad kurvi välisküljel. Kas viime ta autosse puhuma ja juhatame sõbrad ohutsoonist välja?',
            '{callsign}: the man is very drunk and his friends are standing on the outside of the bend. Do we put him in the car for a breath test and move his friends out of the danger zone?',
          ),
        ],
        [
          opt(
            'clear',
            T(
              'Jah, mees puhuma, sõbrad ohutsoonist välja',
              'Yes, breath-test him, his friends out of the danger zone',
            ),
            T(
              '{callsign}, mees autosse puhuma, sõbrad juhatage koos rajakohtunikega ohutsoonist välja.',
              '{callsign}, put him in the car for a breath test, and move his friends out of the danger zone with the marshals.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'driver_only',
            T(
              'Ainult juht, rahvas on korraldaja mure',
              'Just the driver, the crowd is the organisers’ problem',
            ),
            T(
              '{callsign}, tegelege ainult juhiga, pealtvaatajad on korraldaja mure.',
              '{callsign}, deal with the driver only, the spectators are the organisers’ problem.',
            ),
            { success: -0.1, risk: 0.03 },
          ),
        ],
        'driver_only',
      ),
      qv(5, [
        T(
          '{callsign}: mehe auto on {car}, numbrimärk {plate}. Kontrolli palun.',
          '{callsign}: the man’s car is {car}, plate {plate}. Please run it.',
        ),
      ]),
      info(9, [
        T(
          '{callsign}: mees on rajalt eemaldatud, katse jätkamise üle otsustab korraldaja.',
          '{callsign}: the man has been removed from the course, the organisers will decide whether the stage goes on.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'dui',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Mees peeti kinni, alkomeeter näitas 1,8 promilli. Alustati kriminaalmenetlust KarS § 424 järgi, auto teisaldati ja katse jätkus poole tunni pärast.',
          'The man was detained; the breathalyser showed 1.8 per mille. Criminal proceedings were opened under KarS § 424, the car was towed and the stage went ahead half an hour later.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: mees kinni, 1,8 promilli, katse jätkub.',
            '{callsign}: man detained, 1.8 per mille, the stage goes on.',
          ),
        },
      ),
      out(
        'misdemeanour',
        'fine',
        [0.45, 1],
        2,
        T(
          'Mehel tuvastati 0,8 promilli ja alustati väärteomenetlust LS § 224 järgi. Tema sõbrad juhatati ohutsoonist välja ja katse jätkus.',
          'The man had 0.8 per mille and misdemeanour proceedings were opened under LS § 224. His friends were moved out of the danger zone and the stage went ahead.',
        ),
        {
          radio: T(
            '{callsign}: 0,8 promilli, menetlus alustatud, katse jätkub.',
            '{callsign}: 0.8 per mille, case opened, the stage goes on.',
          ),
        },
      ),
      out(
        'cancelled',
        'report',
        [0.2, 0.6],
        2,
        T(
          'Mees peeti kinni, kuid katse tuli ajakava tõttu tühistada. Alustati kriminaalmenetlust KarS § 424 järgi, korraldaja nõuab mehelt kahju hüvitamist.',
          'The man was detained, but the stage had to be cancelled because of the timetable. Criminal proceedings were opened under KarS § 424 and the organisers are claiming damages from him.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: mees kinni, katse tühistati.',
            '{callsign}: man detained, the stage was cancelled.',
          ),
        },
      ),
      out(
        'safety_car',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Mees sõitis uuesti rajale ja põrkas kokku korraldajate ohutusautoga. Mõlemad juhid said viga ja toimetati Kuressaare haiglasse, alustati kriminaalmenetlust.',
          'The man drove back onto the course and collided with the organisers’ safety car. Both drivers were hurt and taken to Kuressaare hospital; criminal proceedings were opened.',
        ),
        {
          injuries: 2,
          radio: T(
            '{callsign}: kokkupõrge ohutusautoga, kaks juhti haiglasse.',
            '{callsign}: collision with the safety car, two drivers to hospital.',
          ),
        },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.45,
      toPriority: 2,
      text: T(
        'Rajakohtunik: mees istus uuesti autosse ja sõidab mööda kiiruskatset, vastu tulevad korraldajate autod!',
        'Marshal: the man has got back into his car and is driving along the special stage, with the organisers’ cars coming the other way!',
      ),
    },
    expiresMin: 75,
    interactiveChance: 0.2,
    tags: ['rally', 'alcohol'],
  },
];
