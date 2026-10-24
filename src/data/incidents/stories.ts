/**
 * Escalating stories (part 2): seasonal, coastal, island, border and rural calls, plus a few light
 * ones that are funny but plausible (a robot mower, a pensioner who caught a thief, a wedding
 * procession). Same rules as escalating.ts: a unit on scene in time prevents the escalation, the
 * best decision has the highest success effect and the worst endings need a low success score.
 */
import type { IncidentTemplate } from '@/sim/types';
import { T, u, out, qp, qv, backup, agency, info, pursuit, search, choice, opt, R_SUSPECT, R_DRIVER } from './escalating';

export const TEMPLATES_STORIES: IncidentTemplate[] = [
  // 19. A wedding procession blocks the road and fires rockets over the cars.
  {
    id: 'public_order_pulmarongkond_ilutulestikuga',
    category: 'public_order',
    code: 'KR',
    title: T('Pulmarongkond sulgeb tee, lastakse rakette', 'Wedding procession blocks the road, rockets fired'),
    priority: 3,
    weight: 0.7,
    months: [5, 6, 7, 8, 9],
    hours: 'evening',
    weekendBoost: 2.5,
    places: ['highway', 'street', 'ruralroad'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('traffic')] },
    onScene: [20, 45],
    persons: [
      { role: 'suspect', gender: 'M', age: [22, 40], intoxicated: 0.3 },
      { role: 'caller', gender: 'any', age: [25, 70] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
    summary: [
      T(
        '{address}. Kümnest autost koosnev pulmarongkond sõidab tiheda liiklusega teel kahekümnega ja kõik signaalitavad. Ühest autost lastakse rakette, liiklus on seiskunud.',
        '{address}. A wedding procession of about ten cars is crawling along a busy road at 20 km/h with every horn blaring. Rockets are being fired from one car and traffic has stopped.',
      ),
      T(
        '{address}. Teataja sõnul peatas pulmaseltskond autod keset ristmikku ja tantsib teel, ilutulestiku raketid lendavad üle autode.',
        '{address}. The caller says a wedding party has stopped their cars in the middle of a junction and is dancing in the road, with rockets flying over the traffic.',
      ),
    ],
    callerLines: [
      T('Siin on mingi pulm, autod seisavad keset teed ja inimesed tantsivad! Olen juba kakskümmend minutit ummikus.', 'There is some wedding, the cars are stopped in the middle of the road and people are dancing! I have been stuck for twenty minutes.'),
      T('Nad lasevad rakette otse üle autode, üks kukkus mu kapotile!', 'They are firing rockets right over the cars, one landed on my bonnet!'),
    ],
    details: [
      T('Teataja sõnul on rakettide laskjad purjus ja teeäärne kuiv kulu on juba mitmest kohast suitsema hakanud.', 'The caller says the men firing the rockets are drunk and the dry grass along the road has started smouldering in several places.'),
      T('Pruutpaar on valges limusiinis, rongkonda juhib must maastur.', 'The bride and groom are in a white limousine; a black SUV is leading the procession.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: pulmaseltskond vabandab ja raketid on otsas. Peigmehe isa küsib, kas rongkond võib kohe edasi sõita. Kas kontrollime enne kõik juhid üle?',
            '{callsign}: the wedding party apologises and the rockets have run out. The groom’s father asks whether the procession may carry on at once. Do we check all the drivers first?',
          ),
        ],
        [
          opt(
            'check',
            T('Jah, kõik juhid puhuvad', 'Yes, every driver blows'),
            T('{callsign}, kõik juhid puhuvad enne edasisõitu, siis saadate rongkonna teelt välja. Õnne noorpaarile.', '{callsign}, every driver blows before they go on, then see the procession off the road. Congratulations to the couple.'),
            { success: 0.1, time: 15, trust: 1 },
          ),
          opt(
            'go',
            T('Ei, laske kohe edasi', 'No, let them go at once'),
            T('{callsign}, rongkond võib edasi sõita, liiklus tuleb kohe vabaks saada.', '{callsign}, the procession may carry on, the road must be cleared right away.'),
            { success: -0.05, time: 5 },
          ),
        ],
        'go',
      ),
      qp('suspect', 3, [
        T(
          '{callsign}: rongkonda juhtiv maasturijuht {name}, isikukood {idcode}. Ta on ilmselt tähistanud, kontrolli palun juhtimisõigust.',
          '{callsign}: the SUV driver leading the procession, {name}, ID code {idcode}. He has clearly been celebrating, please check his licence.',
        ),
      ]),
      agency('paaste', 5, [
        T('{callsign}: kraavis põleb kulu ja tuli levib. Palun Päästeamet!', '{callsign}: the grass in the ditch is burning and spreading. Rescue Board please!'),
      ], { chance: 0.25, timeoutMin: 5 }),
    ],
    outcomes: [
      out(
        'warned',
        'warning',
        [0.45, 1],
        4,
        T(
          'Pulmarongkond juhiti teelt kõrvale ja sõitis edasi korra kohaselt. Noorpaari õnnitleti ja korraldajatele tehti hoiatus.',
          'The procession was led off the road and went on its way properly. The couple were congratulated and the organisers warned.',
        ),
        { radio: T('{callsign}: rongkond sõidab korralikult edasi, hoiatus tehtud.', '{callsign}: procession moving on properly, warning given.') },
      ),
      out(
        'fined',
        'fine',
        [0.5, 1],
        2,
        T(
          'Rakettide laskjale koostati väärteoprotokoll pürotehnika nõuete rikkumise eest. Liiklus taastus kümne minutiga.',
          'The man firing the rockets was given a misdemeanour report for breaking the fireworks rules. Traffic was moving again within ten minutes.',
        ),
      ),
      out(
        'drunk_driver',
        'arrest',
        [0.4, 0.85],
        2,
        T(
          'Rongkonda juhtinud maasturijuht osutus joobes olevaks ja peeti kinni. Alustati väärteomenetlust LS § 224 järgi, rooli istus peigmehe kaine vend.',
          'The SUV driver leading the procession turned out to be drunk and was detained. Misdemeanour proceedings were opened under LS § 224; the groom’s sober brother took the wheel.',
        ),
        { arrests: 1, radio: T('{callsign}: rongkonna juht joobes, kinni peetud.', '{callsign}: procession leader drunk, detained.') },
      ),
      out(
        'grass_fire',
        'report',
        [0, 0.45],
        2,
        T(
          'Raketist süttis teeäärne kulu ja Päästeamet kustutas põlengu. Pulmaliste andmed pandi kirja, alustati väärteomenetlust.',
          'A rocket set the roadside grass alight and the Rescue Board put it out. The wedding guests’ details were taken and misdemeanour proceedings opened.',
        ),
        { radio: T('{callsign}: rakett süütas kulu, kustutatud, vormistame.', '{callsign}: rocket set the grass alight, put out, processing.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.35,
      toPriority: 2,
      text: T(
        'Teataja: rakett lendas teeäärsesse kulusse, kraav põleb ja tuli liigub metsa poole.',
        'Caller: a rocket went into the dry grass by the road, the ditch is burning and the fire is heading for the forest.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'angry',
      opening: [
        T('Siin on pulmarongkond keset teed, nad tantsivad ja lasevad rakette üle autode!', 'There is a wedding procession in the middle of the road, they are dancing and firing rockets over the cars!'),
        T('Pulmaautod sulgevad terve tee ja keegi laseb ilutulestikku. Me ei pääse edasi!', 'Wedding cars are blocking the whole road and someone is setting off fireworks. We cannot get through!'),
      ],
      answers: {
        count: [T('Autosid on kümmekond, inimesi paarkümmend.', 'About ten cars and twenty people.')],
        intoxicated: [T('Need, kes rakette lasevad, on küll purjus.', 'The ones firing rockets are definitely drunk.')],
        injured: [T('Keegi viga pole saanud, aga üks rakett kukkus mu autole.', 'Nobody is hurt, but a rocket landed on my car.')],
      },
      answersRu: {
        count: ['Машин штук десять, людей человек двадцать.'],
        intoxicated: ['Те, кто ракеты пускают, точно пьяные.'],
        injured: ['Никто не пострадал, но одна ракета упала мне на машину.'],
      },
      openingRu: [
        'Тут свадебный кортеж посреди дороги, они танцуют и пускают ракеты прямо над машинами!',
        'Свадебные машины перекрыли всю дорогу, кто-то запускает фейерверк. Мы не можем проехать!',
      ],
    },
    tags: ['fireworks', 'traffic_related', 'group'],
  },

  // 20. A drunk boat driver weaving between swimmers on a summer lake or beach.
  {
    id: 'public_order_joobes_kaater_ujujate_juures',
    category: 'public_order',
    code: 'KR',
    title: T('Joobes kaatrijuht ujujate lähedal', 'Drunk boat driver near swimmers'),
    priority: 2,
    weight: 1.2,
    months: [6, 7, 8],
    hours: 'day',
    places: ['beach', 'lake'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('boat')] },
    onScene: [30, 60],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 60], intoxicated: 0.9, record: 0.3 },
      { role: 'caller', gender: 'any', age: [25, 65] },
    ],
    agencies: [{ agency: 'merepaaste', chance: 0.3, reason: T('Vabatahtlik merepääste kaatri peatamiseks', 'Volunteer sea rescue to stop the boat') }],
    summary: [
      T(
        '{address}. Rannal viibijate teatel kihutab kaater ujumisala poide vahel, juht joob õlut. Vees on lapsi.',
        '{address}. People on the beach report a motorboat racing between the swimming-area buoys while the driver drinks beer. There are children in the water.',
      ),
      T(
        '{address}. Kaater teeb ujujate lähedal ringe ja ajab lainet, kaldalt karjutakse. Teataja sõnul on juht ja kaaslased purjus.',
        '{address}. A motorboat is doing circles near the swimmers and throwing up waves while people shout from the shore. The caller says the driver and his friends are drunk.',
      ),
    ],
    callerLines: [
      T('Üks kaater kihutab otse ujujate juures, lapsed on vees! Juht hoiab ühes käes õlut.', 'A motorboat is racing right next to the swimmers and there are children in the water! The driver has a beer in one hand.'),
      T('Ta tegi just ringi nii lähedal, et laine lõi väikese poisi ümber.', 'He just did a turn so close that the wave knocked a little boy over.'),
    ],
    details: [
      T('Teataja sõnul tahavad kaatris olijad sõita kaldale, et rannas pidu jätkata.', 'The caller says the people in the boat want to come ashore to carry on the party on the beach.'),
      T('Kaatri kerel on registreerimisnumber, teataja pildistas seda.', 'The boat has a registration number on the hull and the caller has photographed it.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kaater on rannast saja meetri kaugusel ega reageeri. Kas kutsume merepääste paadi või ootame, kuni ta ise kaldale tuleb?',
            '{callsign}: the boat is a hundred metres off the beach and ignoring us. Do we call the sea rescue boat or wait until he comes ashore?',
          ),
        ],
        [
          opt(
            'rescue',
            T('Kutsuge vabatahtlik merepääste', 'Call the volunteer sea rescue'),
            T('{callsign}, kaasame vabatahtliku merepääste paadi, teie hoidke ujujad kaldal.', '{callsign}, we are bringing in the volunteer sea rescue boat, you keep the swimmers on the shore.'),
            { success: 0.15, time: 15 },
          ),
          opt(
            'wait',
            T('Oodake kaldal', 'Wait on the shore'),
            T('{callsign}, oodake kaldal ja hoiatage ujujaid, kaater peab varsti tagasi tulema.', '{callsign}, wait on the shore and warn the swimmers, the boat will have to come back soon.'),
            { success: -0.1, risk: 0.04, time: 10 },
          ),
        ],
        'wait',
      ),
      qp('suspect', 6, [
        T('{callsign}: kaater on kaldal, juht {name}, isikukood {idcode}. Kontrolli palun, puhub kindlasti üle.', '{callsign}: the boat is ashore, driver {name}, ID code {idcode}. Please check, he will definitely blow over the limit.'),
      ]),
      agency('kiirabi', 8, [
        T('{callsign}: üks ujuja sai laine tõttu peavigastuse ja neelas vett. Palun kiirabi randa.', '{callsign}: a swimmer hit his head because of the wave and swallowed water. Ambulance to the beach please.'),
      ], { chance: 0.35, timeoutMin: 5 }),
    ],
    outcomes: [
      out(
        'stopped',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Kaatrijuht peeti kinni, alkomeeter näitas 1,9 promilli. Alustati menetlust veesõiduki joobes juhtimise eest ja kaater viidi sadamasse.',
          'The boat driver was detained; the breathalyser showed 1.9 per mille. Proceedings were opened for operating a vessel while drunk and the boat was taken to the harbour.',
        ),
        { arrests: 1, radio: T('{callsign}: kaatrijuht kinni, 1,9 promilli.', '{callsign}: boat driver detained, 1.9 per mille.') },
      ),
      out(
        'fined',
        'fine',
        [0.4, 1],
        2,
        T(
          'Juht tuli ise kaldale, joove oli 0,6 promilli. Talle koostati väärteoprotokoll ja kaatri juhtimine keelati.',
          'The driver came ashore himself with 0.6 per mille. He was given a misdemeanour report and banned from driving the boat.',
        ),
      ),
      out(
        'injured',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Kaatri laine lükkas ujuja ümber ja ta toimetati haiglasse. Kaatrijuhi suhtes alustati menetlust veesõiduki ohtliku juhtimise eest.',
          'The boat’s wash knocked a swimmer over and he was taken to hospital. Proceedings were opened against the driver for operating the boat dangerously.',
        ),
        { injuries: 1, radio: T('{callsign}: ujuja haiglasse, kaatrijuhile menetlus.', '{callsign}: swimmer to hospital, boat driver being processed.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.45,
      toPriority: 1,
      text: T(
        'Teataja: kaater riivas ujujat, üks mees on vees verine ja teda tõmmatakse kaldale!',
        'Caller: the boat has clipped a swimmer, a man in the water is bleeding and being pulled ashore!',
      ),
    },
    expiresMin: 45,
    interactiveChance: 0.25,
    call: {
      mood: 'angry',
      opening: [
        T('Üks kaater kihutab ujujate vahel ja juht on purjus! Lapsed on vees!', 'A boat is racing among the swimmers and the driver is drunk! There are children in the water!'),
        T('Kaater teeb otse ujumiskoha juures ringe, laine lööb lapsi ümber. Tehke midagi!', 'A boat is doing circles right by the swimming area and the waves are knocking children over. Do something!'),
      ],
      answers: {
        intoxicated: [T('Juht joob õlut, kaatris on veel kaks purjus meest.', 'The driver is drinking beer, there are two more drunk men in the boat.')],
        children: [T('Vees on palju lapsi, see on ju laste ujumiskoht.', 'There are lots of children in the water, it is the children’s swimming area.')],
        vehicle: [T('Valge kaater, kerel on number, ma pildistasin.', 'A white motorboat with a number on the hull, I took a photo.')],
      },
      answersRu: {
        intoxicated: ['Водитель пьёт пиво, в катере ещё двое пьяных мужиков.'],
        children: ['В воде много детей, это же детский пляж.'],
        vehicle: ['Белый катер, на борту номер, я {сфотографировал|сфотографировала}.'],
      },
      openingRu: [
        'Катер носится между купающимися, водитель пьяный! В воде дети!',
        'Катер нарезает круги прямо у пляжа, волны сбивают детей с ног. Сделайте что-нибудь!',
      ],
    },
    tags: ['water', 'alcohol'],
  },

  // 21. A small child alone at home while the parents are at a party.
  {
    id: 'assist_vaike_laps_uksi_kodus',
    category: 'assist',
    code: 'ABI',
    title: T('Väike laps üksi kodus, vanemad peol', 'Small child alone at home, parents at a party'),
    priority: 3,
    weight: 0.65,
    hours: 'night',
    weekendBoost: 1.6,
    places: ['residential', 'house'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('community')] },
    onScene: [35, 80],
    persons: [
      { role: 'victim', gender: 'any', age: [4, 7] },
      { role: 'caller', gender: 'any', age: [30, 75], relation: 'neighbour' },
      { role: 'suspect', gender: 'any', age: [24, 40], relation: 'parent', intoxicated: 0.85 },
    ],
    agencies: [{ agency: 'sotsiaal', chance: 0.9, reason: T('Lastekaitse: järelevalveta jäetud laps', 'Child protection: child left unsupervised') }],
    summary: [
      T(
        '{address}. Naabri sõnul nutab korteris juba tund aega väike laps ja hüüab ema. Uksele keegi ei ava, vanemad läksid õhtul peole.',
        '{address}. A neighbour says a small child has been crying in the flat for an hour, calling for mum. Nobody answers the door; the parents went to a party in the evening.',
      ),
      T(
        '{address}. Teataja kuuleb seina tagant väikese lapse nuttu ja karjumist. Lapsevanemate telefonid ei vasta.',
        '{address}. The caller can hear a small child crying and screaming through the wall. The parents’ phones are not answering.',
      ),
    ],
    callerLines: [
      T(
        'Seina taga nutab väike laps juba tükk aega ja kutsub emmet. Nägin, kuidas vanemad õhtul peoriietes ära läksid.',
        'A little child behind the wall has been crying for ages and calling for mummy. I saw the parents go out this evening dressed up for a party.',
      ),
      T('Koputasin, laps tuli ukse taha ja ütles, et ei oska ust lahti teha.', 'I knocked, the child came to the door and said they cannot open it.'),
    ],
    details: [
      T('Teataja sõnul on laps rõdul käinud ja rõduuks on lahti.', 'The caller says the child has been out on the balcony and the balcony door is open.'),
      T('Vanemate telefonid ei vasta, naabri sõnul on nad sõbra sünnipäeval samas linnas.', 'The parents’ phones are not answering; the neighbour says they are at a friend’s birthday party in town.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: laps on ukse taga ja nutab, uks on lukus ja vanemad ei vasta. Kas laseme Päästeametil ukse avada või ootame vanemaid?',
            '{callsign}: the child is behind the door crying, it is locked and the parents are not answering. Do we have the Rescue Board open the door or wait for the parents?',
          ),
        ],
        [
          opt(
            'open',
            T('Päästeamet avab ukse', 'Rescue Board opens the door'),
            T('{callsign}, Päästeamet avab ukse ja laps jääb teie hoole alla, kuni lastekaitse jõuab.', '{callsign}, the Rescue Board will open the door and the child stays in your care until child protection arrives.'),
            { success: 0.15, time: 15 },
          ),
          opt(
            'wait',
            T('Rääkige lapsega, oodake vanemaid', 'Talk to the child, wait for the parents'),
            T('{callsign}, rääkige lapsega läbi ukse ja proovige vanemad kätte saada.', '{callsign}, talk to the child through the door and keep trying the parents.'),
            { success: -0.1, time: 25 },
          ),
        ],
        'wait',
      ),
      agency('sotsiaal', 4, [
        T('{callsign}: laps on terve, aga hirmul. Palun teavitage lastekaitse valvetelefoni.', '{callsign}: the child is unhurt but frightened. Please notify the child protection duty line.'),
      ], { timeoutMin: 10 }),
      qp('suspect', 15, [
        T(
          '{callsign}: lapsevanem jõudis koju, on joobes ja agressiivne. Ütleb nimeks {name}, isikukood {idcode}. Kontrolli palun.',
          '{callsign}: a parent has come home, drunk and aggressive. Gives the name {name}, ID code {idcode}. Please check.',
        ),
      ], 0.7),
    ],
    outcomes: [
      out(
        'handed',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Laps anti üle vanaemale ja lastekaitse võttis juhtumi menetlusse. Vanematele selgitati nende vastutust, info edastati noorsoopolitseinikule.',
          'The child was handed to the grandmother and child protection took the case on. The parents were reminded of their responsibility and the youth officer informed.',
        ),
        { radio: T('{callsign}: laps vanaema juures, lastekaitse teavitatud.', '{callsign}: child with the grandmother, child protection informed.') },
      ),
      out(
        'neighbour',
        'resolved',
        [0.4, 1],
        2,
        T(
          'Naaber leidis vanemate varuvõtme ja laps viidi tema juurde. Vanemad tulid tunni aja pärast, neid nõustas lastekaitse.',
          'The neighbour found the parents’ spare key and the child was taken to her place. The parents came back an hour later and child protection spoke to them.',
        ),
        { radio: T('{callsign}: laps naabri juures, vanemad tulid, lõpetame.', '{callsign}: child with the neighbour, parents back, closing.') },
      ),
      out(
        'parents_drunk',
        'report',
        [0.35, 0.8],
        2,
        T(
          'Vanemad jõudsid koju tugevas joobes. Laps jäi lastekaitse otsusel sugulaste juurde, alustati menetlust lapse hooletusse jätmise asjaoludes.',
          'The parents came home very drunk. Child protection decided the child should stay with relatives, and proceedings were opened over the neglect.',
        ),
        { radio: T('{callsign}: vanemad tugevas joobes, laps sugulaste juurde.', '{callsign}: parents very drunk, child to relatives.') },
      ),
      out(
        'balcony',
        'hospital',
        [0, 0.35],
        1,
        T(
          'Laps ronis rõdupiirdele ja kukkus põõsastesse, ta sai luumurru. Laps toimetati haiglasse, vanemate suhtes alustati kriminaalmenetlust.',
          'The child climbed onto the balcony railing and fell into the bushes, breaking a bone. The child was taken to hospital and criminal proceedings were opened against the parents.',
        ),
        { injuries: 1, radio: T('{callsign}: laps kukkus rõdult, haiglasse.', '{callsign}: child fell from the balcony, to hospital.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.4,
      toPriority: 1,
      text: T(
        'Teataja: laps on rõdul, ronis tooli peale ja kummardub üle piirde!',
        'Caller: the child is on the balcony, has climbed onto a chair and is leaning over the railing!',
      ),
    },
    expiresMin: 120,
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T('Naaberkorteris nutab väike laps juba tund aega ja keegi ei tule. Vanemad läksid õhtul ära.', 'A little child has been crying in the flat next door for an hour and nobody comes. The parents went out this evening.'),
        T('Seina taga on väike laps üksi, ta nutab ja kutsub emmet. Ma ei saa vanemaid kätte.', 'There is a little child alone behind the wall, crying for mummy. I cannot reach the parents.'),
      ],
      answers: {
        children: [T('Laps on umbes viiene, rohkem lapsi seal vist pole.', 'The child is about five, I do not think there are any others.')],
        injured: [T('Ma ei tea, ta nutab väga. Ta käis vahepeal rõdul.', 'I do not know, the child is crying hard. They were out on the balcony a moment ago.')],
        when: [T('Vanemad läksid kella kaheksa paiku.', 'The parents left at about eight.')],
      },
      answersRu: {
        children: ['Ребёнку лет пять, других детей там, кажется, нет.'],
        injured: ['Не знаю, ребёнок очень плачет. Он недавно выходил на балкон.'],
        when: ['Родители ушли около восьми.'],
      },
      openingRu: [
        'У соседей уже час плачет маленький ребёнок, и никто не подходит. Родители вечером ушли.',
        'За стеной один маленький ребёнок, плачет и зовёт маму. Родителям я дозвониться не могу.',
      ],
    },
    tags: ['child', 'neglect'],
  },

  // 22. A taxi driver robbed at knifepoint at the end of a ride.
  {
    id: 'property_taksojuht_roovitud',
    category: 'property',
    code: 'RÖ',
    title: T('Taksojuht röövitud', 'Taxi driver robbed'),
    priority: 2,
    weight: 0.45,
    hours: 'nightlife',
    weekendBoost: 1.5,
    places: ['street', 'residential'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('k9')] },
    onScene: [35, 75],
    persons: [
      { role: 'caller', gender: 'M', age: [28, 65] },
      { role: 'suspect', gender: 'M', age: [17, 30], record: 0.6, wanted: 0.15, intoxicated: 0.5 },
    ],
    vehicles: [{ role: 'victim', kind: 'car', driverRole: 'caller' }],
    summary: [
      T(
        '{address}. Taksojuht teatas, et sõitja ähvardas teda sihtkohas noaga, võttis päevakassa ja telefoni ning jooksis majade vahele.',
        '{address}. A taxi driver reports that his passenger threatened him with a knife at the destination, took the day’s takings and his phone and ran off between the buildings.',
      ),
      T(
        '{address}. Äpi kaudu tellitud sõidu lõpus lõi sõitja taksojuhti ja haaras rahakoti. Ründaja põgenes jalgsi, juht on peast verine.',
        '{address}. At the end of a ride booked through an app the passenger hit the taxi driver and grabbed his wallet. The attacker fled on foot; the driver’s head is bleeding.',
      ),
    ],
    callerLines: [
      T('Mind rööviti! Sõitja pani noa kaela juurde ja võttis kogu raha. Ta jooksis garaažide poole.', 'I have been robbed! The passenger held a knife to my neck and took all the money. He ran towards the garages.'),
      T('Ta tellis äpiga, nimi oli mingi võltsnimi. Noor kutt, hall kapuuts.', 'He booked through the app under some fake name. A young lad in a grey hoodie.'),
    ],
    details: [
      T('Kahtlustatav: {suspect}, hall kapuutsiga pusa.', 'Suspect: {suspect}, grey hooded top.'),
      T('Sõidu tellinud äpikonto loodi täna õhtul ja sellele polnud lisatud maksekaarti.', 'The app account that booked the ride was created this evening with no bank card attached.'),
    ],
    beats: [
      agency('kiirabi', 'arrive', [
        T('{callsign}: taksojuhil on peas lõikehaav ja ta on šokis. Palun kiirabi.', '{callsign}: the taxi driver has a cut on his head and is in shock. Ambulance please.'),
      ], { chance: 0.5, timeoutMin: 5 }),
      search(1, 1.5, [
        T(
          '{callsign}: ründaja jooksis kümme minutit tagasi garaažide poole. Alustame otsinguid, koerajuht oleks abiks.',
          '{callsign}: the attacker ran towards the garages ten minutes ago. Starting a search, a dog handler would help.',
        ),
      ]),
      qp('suspect', 6, [
        T(
          '{callsign}: äpikonto ja telefoninumbri järgi on tõenäoline sõitja {name}, isikukood {idcode}. Kontrolli palun.',
          '{callsign}: from the app account and phone number the likely passenger is {name}, ID code {idcode}. Please check.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Ründaja leiti koera abil garaažide tagant, raha ja nuga olid tal kaasas. Alustati kriminaalmenetlust KarS § 200 järgi.',
          'The dog found the attacker behind the garages with the money and the knife on him. Criminal proceedings were opened under KarS § 200.',
        ),
        { arrests: 1, radio: T('{callsign}: ründaja leitud, raha ja nuga kaasas, kinni.', '{callsign}: attacker found with the money and knife, detained.') },
      ),
      out(
        'identified',
        'report',
        [0.35, 0.8],
        2,
        T(
          'Ründaja pääses, kuid ta on äpikonto ja turvakaamerate järgi tuvastatud. Kriminaalmenetlus KarS § 200 järgi, kahtlustatav kuulutati tagaotsitavaks.',
          'The attacker got away but has been identified through the app account and CCTV. Criminal proceedings under KarS § 200; the suspect has been put on the wanted list.',
        ),
        { radio: T('{callsign}: ründaja pääses, kuid on tuvastatud.', '{callsign}: attacker got away but has been identified.') },
      ),
      out(
        'escaped',
        'escaped',
        [0, 0.4],
        3,
        T(
          'Ründaja pääses põgenema ja äpikonto osutus võõra nimega loodud kontoks. Taksojuhile osutati arstiabi, kriminaalpolitsei kontrollib kaameraid.',
          'The attacker escaped and the app account turned out to be set up in someone else’s name. The taxi driver received medical care and the criminal police are checking the cameras.',
        ),
        { radio: T('{callsign}: ründaja pääses, äpikonto oli võõra nimega.', '{callsign}: attacker got away, the app account was in a false name.') },
      ),
    ],
    expiresMin: 60,
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T('Mind, taksojuhti, rööviti just! Sõitja pani noa kaela juurde ja võttis kogu raha!', 'I am a taxi driver and I have just been robbed! The passenger held a knife to my neck and took all the money!'),
        T('Sõitja lõi mind ja jooksis mu rahakotiga minema. Mu pea veritseb.', 'The passenger hit me and ran off with my wallet. My head is bleeding.'),
      ],
      answers: {
        suspect: [T('Noor kutt, hall kapuutsiga pusa, umbes kahekümnene.', 'A young lad in a grey hoodie, about twenty.')],
        direction: [T('Ta jooksis garaažide poole.', 'He ran towards the garages.')],
        weapons: [T('Tal oli nuga, selline väike volditav.', 'He had a knife, a small folding one.')],
        injured: [T('Mu pea veritseb, aga ma olen teadvusel.', 'My head is bleeding but I am conscious.')],
      },
      answersRu: {
        suspect: ['Молодой парень, серая толстовка с капюшоном, лет двадцати.'],
        direction: ['Он побежал в сторону гаражей.'],
        weapons: ['У него был нож, маленький, складной.'],
        injured: ['Голова в крови, но я в сознании.'],
      },
      openingRu: [
        'Меня, таксиста, только что ограбили! Пассажир приставил нож к шее и забрал все деньги!',
        'Пассажир ударил меня и убежал с моим кошельком. У меня кровь на голове.',
      ],
    },
    tags: ['weapon_knife', 'fled'],
  },

  // 23. A picket outside a government building turns tense when counter-protesters arrive.
  {
    id: 'public_order_pikett_ametiasutuse_ees',
    category: 'public_order',
    code: 'ME',
    title: T('Pikett ametiasutuse ees muutub pingeliseks', 'Picket outside a government building turns tense'),
    priority: 3,
    weight: 0.12,
    hours: 'business',
    places: ['government'],
    units: { need: [u('patrol')], ideal: [u('patrol', 3), u('community')] },
    onScene: [40, 100],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 60], record: 0.3, intoxicated: 0.2 },
      { role: 'witness', gender: 'any', age: [25, 60], relation: 'employee' },
    ],
    summary: [
      T(
        '{place}, {address}. Registreeritud pikett, umbes {n}0 inimest. Kohale tuli megafoniga vastaspool ja kaks gruppi sõimavad teineteist.',
        '{place}, {address}. A registered picket of about {n}0 people. A counter-group has arrived with a megaphone and the two sides are shouting abuse at each other.',
      ),
      T(
        '{place}, {address}. Asutuse turvatöötaja teatel blokeerivad meeleavaldajad peaukse ja ametnikud ei pääse majast välja. Loobiti mune.',
        '{place}, {address}. The building’s security guard says protesters are blocking the main entrance and staff cannot get out. Eggs have been thrown.',
      ),
    ],
    callerLines: [
      T('Siin on pikett, see oli rahulik, aga nüüd tulid teised ja nad karjuvad üksteise peale.', 'There is a picket here, it was peaceful, but now another lot have come and they are shouting at each other.'),
      T('Keegi viskas munaga ukse pihta. Nad ei lase inimesi majast välja.', 'Someone threw an egg at the door. They are not letting people out of the building.'),
    ],
    details: [
      T('Sotsiaalmeedias kutsutakse veel inimesi kohale „vastast näitama“.', 'People on social media are calling for more to come and "show the other side".'),
      T('Piketi korraldaja on esitanud teate kohalikule omavalitsusele, üritus kestab kella neljani.', 'The organiser notified the local council; the event runs until four o’clock.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kaks gruppi on teineteisest kümne meetri kaugusel. Kas paneme vahele ahela ja suuname vastaspooled eri suundadesse?',
            '{callsign}: the two groups are ten metres apart. Do we put a line between them and steer the sides in different directions?',
          ),
        ],
        [
          opt(
            'separate',
            T('Jah, pooled lahku, räägime korraldajatega', 'Yes, separate them, talk to the organisers'),
            T('{callsign}, eraldage pooled ja rääkige mõlema korraldajaga. Peauks peab jääma vabaks.', '{callsign}, separate the two sides and talk to both organisers. The main door must stay clear.'),
            { success: 0.15, time: 15 },
          ),
          opt(
            'end',
            T('Lõpetage pikett', 'End the picket'),
            T('{callsign}, teatage korraldajale, et koosolek lõpetatakse.', '{callsign}, tell the organiser that the gathering is being ended.'),
            { success: -0.1, trust: -2, time: 10 },
          ),
        ],
        'separate',
      ),
      backup(
        u('patrol', 2),
        3,
        [
          T(
            '{callsign}: inimesi tuleb juurde ja meie kahest ekipaažist ei piisa. Palun veel kaks ekipaaži!',
            '{callsign}: more people keep arriving and our two crews are not enough. Two more crews please!',
          ),
        ],
        { chance: 0.5, timeoutMin: 7, fail: { success: -0.25, trust: -4, escalate: true } },
      ),
      qp('suspect', 10, [
        T('{callsign}: munaviskaja peeti kinni. Nimi {name}, isikukood {idcode}. Kontrolli palun.', '{callsign}: the egg thrower has been detained. Name {name}, ID code {idcode}. Please check.'),
      ]),
    ],
    outcomes: [
      out(
        'calm',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Pooled eraldati ja olukord rahunes. Munaviskajale koostati väärteoprotokoll avaliku korra rikkumise eest.',
          'The two sides were kept apart and things calmed down. The egg thrower was given a misdemeanour report for breaching public order.',
        ),
        { radio: T('{callsign}: pooled eraldatud, olukord rahunes, lõpetame.', '{callsign}: sides separated, calm again, closing.') },
      ),
      out(
        'arrests',
        'arrest',
        [0.4, 0.85],
        2,
        T(
          'Kaks inimest peeti kinni, kuna nad ründasid vastaspoole liikmeid. Alustati kriminaalmenetlust KarS § 263 järgi.',
          'Two people were detained for attacking members of the other side. Criminal proceedings were opened under KarS § 263.',
        ),
        { arrests: 2, radio: T('{callsign}: kaks ründajat kinni peetud.', '{callsign}: two attackers detained.') },
      ),
      out(
        'scuffle',
        'report',
        [0, 0.45],
        2,
        T(
          'Pooled läksid kätega kallale ja mitu inimest sai kergelt viga. Osalised tuvastatakse videote järgi, korraldajale tehti ettekirjutus.',
          'The sides came to blows and several people were slightly hurt. Those involved are being identified from videos and the organiser was given a formal notice.',
        ),
        { injuries: 2, radio: T('{callsign}: rüselus, mitu kergelt vigastatut, vormistame.', '{callsign}: scuffle, several slightly hurt, processing.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.4,
      toPriority: 2,
      text: T('Turvatöötaja: pooled lähevad omavahel kätega kallale, plakatite varred on käes.', 'Security: the two sides are coming to blows and swinging the placard poles.'),
    },
    expiresMin: 90,
    interactiveChance: 0.15,
    call: {
      mood: 'calm',
      opening: [
        T('Tere, olen asutuse turvatöötaja. Maja ees on pikett ja nüüd tuli vastaspool, õhkkond läheb kuumaks.', 'Hello, I am the security guard here. There is a picket outside and now the other side has turned up, things are heating up.'),
        T('Meeleavaldajad blokeerivad peaukse ja viskasid mune. Töötajad ei pääse välja.', 'Protesters are blocking the main door and throwing eggs. The staff cannot get out.'),
      ],
      answers: {
        count: [T('Mõlemal poolel on kümneid inimesi.', 'There are dozens on each side.')],
        weapons: [T('Relvi pole, aga plakatitel on puust varred.', 'No weapons, but the placards have wooden poles.')],
      },
      answersRu: {
        count: ['С каждой стороны десятки людей.'],
        weapons: ['Оружия нет, но у плакатов деревянные палки.'],
      },
      openingRu: [
        'Здравствуйте, я охранник учреждения. У здания пикет, а теперь пришла другая сторона, обстановка накаляется.',
        'Протестующие перекрыли главный вход и бросают яйца. Сотрудники не могут выйти.',
      ],
    },
    tags: ['crowd', 'public_order_watch'],
  },

  // 24. Someone is shooting at road signs from a car on a rural road.
  {
    id: 'violence_autost_tulistatakse_liiklusmarke',
    category: 'violence',
    code: 'RELV',
    title: T('Autost tulistatakse liiklusmärke', 'Road signs being shot at from a car'),
    priority: 2,
    weight: 0.25,
    hours: 'night',
    places: ['ruralroad', 'village'],
    units: { need: [u('patrol', 2)], ideal: [u('patrol', 2), u('rapid')] },
    onScene: [40, 90],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 35], intoxicated: 0.6, weapon: 0.5, record: 0.4 },
      { role: 'suspect', gender: 'M', age: [18, 35], intoxicated: 0.7, record: 0.3 },
      { role: 'caller', gender: 'any', age: [25, 75] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
    summary: [
      T(
        '{address}. Külaelaniku teatel peatub maanteel auto, sellest tulistatakse liiklusmärke ja sõidetakse edasi. Kostnud on vähemalt kümme lasku.',
        '{address}. A villager reports a car stopping on the main road; someone shoots at the road signs from it and then drives on. At least ten shots have been heard.',
      ),
      T(
        '{address}. Teeäärsetel liiklusmärkidel on kuuliaugud ja äsja kostsid uued lasud. Tumedat värvi auto liigub aeglaselt küla poole.',
        '{address}. The road signs along the road are full of bullet holes and fresh shots have just been heard. A dark car is moving slowly towards the village.',
      ),
    ],
    callerLines: [
      T('Seal maantee peal paugutatakse! Auto jääb seisma, keegi laseb aknast liiklusmärgi pihta ja nad naeravad.', 'Someone is shooting out on the main road! The car stops, someone fires at a road sign out of the window and they laugh.'),
      T('Ma nägin, et see oli vintpüss. Nüüd sõitsid nad küla poole, bussipeatuses on noored.', 'I saw it was a rifle. Now they are driving towards the village, there are young people at the bus stop.'),
    ],
    details: [
      T('Auto liigub küla keskuse poole, kus bussipeatuses on õhtuti noori.', 'The car is heading for the village centre, where young people hang around the bus stop in the evenings.'),
      T('Ühel kahtlustataval võib olla jahirelvaluba, relv on tõenäoliselt jahipüss.', 'One of the suspects may hold a hunting permit; the weapon is probably a hunting rifle.'),
    ],
    beats: [
      qv('arrive', [
        T('{callsign}: näeme autot teeservas, {car}, numbrimärk {plate}. Kontrolli palun enne lähenemist.', '{callsign}: we can see the car on the verge, {car}, plate {plate}. Please run it before we approach.'),
      ]),
      choice(
        1,
        [
          T(
            '{callsign}: autos on kaks meest ja relv. Kas peatame nad kohe või ootame kiirreageerijaid?',
            '{callsign}: the car is stopped on the verge with two men and a gun inside. Do we stop them now or wait for rapid response?',
          ),
        ],
        [
          opt(
            'wait',
            T('Jälgige, oodake kiirreageerijaid', 'Observe, wait for rapid response'),
            T('{callsign}, jälgige ohutust kaugusest, kiirreageerijad tulevad. Autot silmist ei kaotata.', '{callsign}, watch from a safe distance, rapid response is coming. Do not lose sight of the car.'),
            { success: 0.15, time: 10 },
          ),
          opt(
            'stop',
            T('Peatage kohe', 'Stop them now'),
            T('{callsign}, kõrgendatud ohuga peatamine, relvad valmis.', '{callsign}, high-risk stop, weapons ready.'),
            { risk: 0.12, time: -5 },
          ),
        ],
        'stop',
      ),
      qp('suspect', 4, [
        T('{callsign}: relvaga mees on {name}, isikukood {idcode}. Kas tal on relvaluba?', '{callsign}: the man with the gun is {name}, ID code {idcode}. Does he hold a weapons permit?'),
      ]),
      pursuit(6, [T('{callsign}: juht vajutas äkki gaasi põhja ja sõidab minema, jälitame!', '{callsign}: the driver has suddenly floored it and is getting away, we are in pursuit!')], 0.3),
    ],
    outcomes: [
      out(
        'arrested',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Kaks noormeest peeti kinni, autost leiti jahipüss ja padrunid. Relv võeti ära, alustati kriminaalmenetlust KarS § 263 ja § 203 järgi.',
          'Two young men were detained and a hunting rifle and cartridges were found in the car. The gun was seized and criminal proceedings opened under KarS § 263 and § 203.',
        ),
        { arrests: 2, radio: T('{callsign}: kaks meest kinni, jahipüss ära võetud.', '{callsign}: two men detained, hunting rifle seized.') },
      ),
      out(
        'permit',
        'report',
        [0.4, 0.85],
        2,
        T(
          'Relv kuulus seaduslikule loaomanikule, kes oli joobes. Relv ja relvaluba võeti ära, alustati menetlust relva käitlemise nõuete rikkumise ja asja kahjustamise kohta.',
          'The gun belonged to a legal permit holder who was drunk. The gun and permit were seized and proceedings opened for breaching weapons rules and criminal damage.',
        ),
        { radio: T('{callsign}: relv ja relvaluba ära võetud, vormistame.', '{callsign}: gun and permit seized, processing.') },
      ),
      out(
        'escaped',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Auto kadus metsateedele. Sündmuskohalt koguti padrunikestad, tulistajad on tuvastatud ja kuulutatakse tagaotsitavaks.',
          'The car disappeared down forest tracks. Cartridge cases were collected at the scene; the shooters have been identified and will be put on the wanted list.',
        ),
      ),
      out(
        'shelter',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Enne politsei saabumist tabas lask bussiootepaviljoni ja klaasikillud vigastasid noormeest. Kannatanu toimetati haiglasse, tulistajad peeti kinni.',
          'Before the police arrived a shot hit the bus shelter and flying glass injured a young man. He was taken to hospital and the shooters were detained.',
        ),
        { injuries: 1, arrests: 2, radio: T('{callsign}: lask tabas bussipaviljoni, noormees haiglasse.', '{callsign}: a shot hit the bus shelter, young man to hospital.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.4,
      toPriority: 1,
      text: T('Teataja: lasti bussiootepaviljoni pihta, klaas purunes ja seal olid inimesed!', 'Caller: they shot at the bus shelter, the glass shattered and there were people inside!'),
    },
    expiresMin: 45,
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T('Maantee peal tulistatakse autost liiklusmärke! Ma kuulsin vähemalt kümmet lasku!', 'Someone is shooting at road signs from a car on the main road! I heard at least ten shots!'),
        T('Üks auto peatub ja aknast lastakse püssiga. Nüüd nad sõidavad küla poole!', 'A car keeps stopping and someone fires a gun out of the window. Now they are driving towards the village!'),
      ],
      answers: {
        weapons: [T('See oli pikk püss, vist jahipüss.', 'It was a long gun, a hunting rifle I think.')],
        vehicle: [T('Tume sõiduauto, numbrit ma ei näinud.', 'A dark car, I did not see the number.')],
        count: [T('Autos on vähemalt kaks meest.', 'There are at least two men in the car.')],
        direction: [T('Nad sõitsid küla keskuse poole.', 'They drove towards the village centre.')],
      },
      answersRu: {
        weapons: ['Это было длинное ружьё, наверное, охотничье.'],
        vehicle: ['Тёмная легковушка, номер я не {разглядел|разглядела}.'],
        count: ['В машине минимум двое мужчин.'],
        direction: ['Они поехали в сторону центра деревни.'],
      },
      openingRu: [
        'На трассе из машины стреляют по дорожным знакам! Я {слышал|слышала} не меньше десяти выстрелов!',
        'Машина останавливается, и из окна стреляют из ружья. Сейчас они едут в сторону деревни!',
      ],
    },
    tags: ['armed', 'weapon_gun', 'vehicle_flee'],
  },

  // 25. A ship's crew member did not come back on board.
  {
    id: 'missing_laevameeskonna_liige_kadunud',
    category: 'missing',
    code: 'OTS',
    title: T('Laevameeskonna liige ei naasnud laevale', 'Ship’s crew member did not return on board'),
    priority: 3,
    weight: 0.25,
    hours: 'night',
    places: ['port'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('boat')] },
    onScene: [40, 100],
    persons: [
      { role: 'missing', gender: 'M', age: [20, 55], intoxicated: 0.5 },
      { role: 'caller', gender: 'M', age: [35, 65], relation: 'employee' },
    ],
    summary: [
      T(
        '{place}, {address}. Kaubalaeva kapten teatas, et üks meeskonnaliige läks õhtul linna ega tulnud tagasi. Laev peab väljuma nelja tunni pärast.',
        '{place}, {address}. A cargo ship’s captain reports that a crew member went into town in the evening and did not come back. The ship is due to sail in four hours.',
      ),
      T(
        '{place}, {address}. Laevaagendi teatel ei ole meremees kolm tundi telefonile vastanud. Viimati nähti teda sadama värava juures.',
        '{place}, {address}. The ship’s agent says a seaman has not answered his phone for three hours. He was last seen at the port gate.',
      ),
    ],
    callerLines: [
      T('Üks meie madrus läks linna ja ei tulnud tagasi. Laev väljub kell kuus hommikul.', 'One of our sailors went into town and did not come back. The ship sails at six in the morning.'),
      T('Ta ei ole kunagi niimoodi kadunud. Ta võttis kaasa ainult telefoni ja natuke raha.', 'He has never gone missing like this. He took only his phone and a little money.'),
    ],
    details: [
      T('Sadama turvamehe sõnul nähti meest hilisõhtul üksi kai ääres istumas ja telefoniga rääkimas.', 'The port guard says the man was seen late in the evening sitting alone on the quayside talking on his phone.'),
      T('Kapteni sõnul oli mees viimasel ajal masenduses, sest tema perel on kodumaal raskused.', 'The captain says the man had been depressed lately because his family back home is in trouble.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kapten küsib, kas laev võib plaanipäraselt väljuda. Kas palume sadamakapteni kaudu väljumist edasi lükata?',
            '{callsign}: the captain asks whether the ship may sail on schedule. Do we ask the harbour master to delay the departure?',
          ),
        ],
        [
          opt(
            'hold',
            T('Jah, väljumine edasi', 'Yes, delay the departure'),
            T('{callsign}, palume sadamakaptenil väljumise selguseni peatada, piirivalve on teavitatud.', '{callsign}, we will ask the harbour master to hold the ship until we know more, the border guard has been informed.'),
            { success: 0.1, time: 10 },
          ),
          opt(
            'let_go',
            T('Ei, laev võib minna', 'No, the ship may sail'),
            T('{callsign}, laev võib väljuda, agent jääb kontaktiks ja meeskonnanimekiri muudetakse.', '{callsign}, the ship may sail, the agent stays as contact and the crew list will be amended.'),
            { success: -0.05 },
          ),
        ],
        'let_go',
      ),
      search(2, 2, [
        T(
          '{callsign}: alustame otsinguid sadama ja kesklinna vahel. Mees võib olla mõnes baaris või kai ääres.',
          '{callsign}: starting a search between the port and the town centre. He may be in a bar or by the quayside.',
        ),
      ]),
      agency('merepaaste', 8, [
        T('{callsign}: kai äärest leiti mehe telefon. Palun merepääste ja sukeldujad valmidusse!', '{callsign}: the man’s phone has been found on the quayside. Sea rescue and divers on standby please!'),
      ], { chance: 0.25, timeoutMin: 6 }),
    ],
    outcomes: [
      out(
        'bar',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Meremees leiti kesklinna baarist, kus ta oli aja unustanud. Ta toimetati laevale ja kapten tegi talle distsiplinaarmärkuse.',
          'The seaman was found in a bar in the town centre where he had lost track of time. He was taken back to the ship and the captain gave him a disciplinary warning.',
        ),
        { radio: T('{callsign}: meremees leitud baarist, tagasi laeval, lõpetame.', '{callsign}: seaman found in a bar, back on board, closing.') },
      ),
      out(
        'asylum',
        'referred',
        [0.4, 0.9],
        1,
        T(
          'Meremees leiti bussijaamast, ta soovis taotleda rahvusvahelist kaitset. Ta anti üle migratsioonijärelevalve ametnikele.',
          'The seaman was found at the bus station; he wanted to apply for international protection. He was handed over to the migration supervision officers.',
        ),
        { radio: T('{callsign}: mees leitud, soovib kaitset, üle antud.', '{callsign}: man found, seeking protection, handed over.') },
      ),
      out(
        'water',
        'hospital',
        [0.2, 0.6],
        2,
        T(
          'Mees oli kukkunud kai äärest vette ja hoidis vaiadest kinni. Ta tõmmati välja ja toimetati alajahtumisega haiglasse.',
          'The man had fallen off the quay and was clinging to the piles. He was pulled out and taken to hospital with hypothermia.',
        ),
        { radio: T('{callsign}: mees tõmmati veest välja, alajahtunud, haiglasse.', '{callsign}: man pulled from the water, hypothermic, to hospital.') },
      ),
      out(
        'not_found',
        'unfounded',
        [0, 0.35],
        2,
        T(
          'Meremeest öö jooksul ei leitud ja laev väljus ilma temata. Ta kuulutati kadunud isikuna tagaotsitavaks, otsingud jätkuvad.',
          'The seaman was not found during the night and the ship sailed without him. He has been listed as a missing person and the search continues.',
        ),
        { radio: T('{callsign}: meremeest ei leitud, otsingud jätkuvad.', '{callsign}: seaman not found, search continues.') },
      ),
      out(
        'tragedy',
        'tragedy',
        [0, 0.15],
        1,
        T(
          'Sukeldujad leidsid mehe sadamabasseinist elutuna. Kuriteo tunnuseid ei tuvastatud, surma asjaolusid uuritakse.',
          'Divers found the man dead in the harbour basin. There were no signs of a crime; the circumstances of his death are being investigated.',
        ),
        { radio: T('{callsign}: sukeldujad leidsid mehe sadamast elutuna.', '{callsign}: divers found the man dead in the harbour.') },
      ),
    ],
    escalation: {
      afterMin: 30,
      chance: 0.3,
      toPriority: 1,
      text: T(
        'Sadama turvateenistus: valvekaamera salvestisel on näha, kuidas mees kukub kai äärest vette.',
        'Port security: CCTV shows the man falling off the quay into the water.',
      ),
    },
    expiresMin: 120,
    interactiveChance: 0.2,
    call: {
      mood: 'calm',
      opening: [
        T('Tere, ma olen laeva kapten. Üks meie meremees läks linna ja ei ole tagasi tulnud.', 'Hello, I am a ship’s captain. One of our seamen went into town and has not come back.'),
        T('Meil on meeskonnast üks mees puudu ja laev peab hommikul väljuma. Ta ei vasta telefonile.', 'We are one crew member short and the ship has to sail in the morning. He is not answering his phone.'),
      ],
      answers: {
        suspect: [T('Lühike, tumedad juuksed, sinine tööjope laeva logoga.', 'Short, dark hair, a blue work jacket with the ship’s logo.')],
        when: [T('Ta läks laevalt maha kella seitsme paiku õhtul.', 'He went ashore at about seven in the evening.')],
        intoxicated: [T('Ta ei joo tavaliselt, aga täna võis juua.', 'He does not usually drink, but tonight he may have.')],
      },
      answersRu: {
        suspect: ['Невысокий, тёмные волосы, синяя рабочая куртка с логотипом судна.'],
        when: ['Он сошёл на берег часов в семь вечера.'],
        intoxicated: ['Обычно он не пьёт, но сегодня мог выпить.'],
      },
      openingRu: [
        'Здравствуйте, я капитан судна. Один наш моряк ушёл в город и не вернулся.',
        'У нас не хватает одного члена экипажа, а утром нам выходить в рейс. Он не отвечает на телефон.',
      ],
    },
    tags: ['maritime', 'search'],
  },

  // 26. Two drunk riders on one rental e-scooter crash into a parked car.
  {
    id: 'traffic_kaks_joobes_toukeratturit',
    category: 'traffic',
    code: 'LÕ',
    title: T('Kaks joobes sõitjat ühel tõukerattal', 'Two drunk riders on one e-scooter'),
    priority: 3,
    weight: 0.9,
    months: [4, 5, 6, 7, 8, 9, 10],
    hours: 'nightlife',
    weekendBoost: 1.8,
    places: ['street', 'oldtown', 'park'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [25, 50],
    persons: [
      { role: 'driver', gender: 'M', age: [18, 30], intoxicated: 0.95 },
      { role: 'victim', gender: 'any', age: [18, 30], intoxicated: 0.8 },
      { role: 'caller', gender: 'any', age: [25, 60] },
    ],
    summary: [
      T(
        '{address}. Kaks noort sõitsid kahekesi ühe renditõukerattaga vastu pargitud autot. Üks lamab maas ja peast jookseb verd, teine üritab ratast minema lükata.',
        '{address}. Two young people riding one rental e-scooter together crashed into a parked car. One is lying on the ground with a bleeding head, the other is trying to push the scooter away.',
      ),
      T(
        '{address}. Tõukerattaõnnetus: juht kukkus kõnniteel ja kaassõitja lendas vastu postkasti. Teataja sõnul on mõlemad tugevas joobes.',
        '{address}. E-scooter crash: the rider fell on the pavement and the passenger was thrown into a letterbox. The caller says both are very drunk.',
      ),
    ],
    callerLines: [
      T('Kaks poissi tulid ühe tõukerattaga mäest alla ja sõitsid otse vastu autot. Üks ei tõuse püsti!', 'Two lads came down the hill on one scooter and rode straight into a car. One is not getting up!'),
      T('See teine karjub, et ärge kutsuge politseid, ja tahab ratta ära viia.', 'The other one is shouting not to call the police and wants to take the scooter away.'),
    ],
    details: [
      T('Teataja sõnul lahkub teine sõitja sündmuskohalt ja kukkunu on uimane.', 'The caller says the other rider is leaving and the one who fell is drowsy.'),
      T('Pargitud auto küljel on mõlk ja peegel on katki.', 'The parked car has a dent in its side and a broken mirror.'),
    ],
    beats: [
      agency('kiirabi', 'arrive', [
        T('{callsign}: noormehel on peahaav ja ta on segaduses, kiivrit ei olnud. Palun kiirabi.', '{callsign}: the young man has a head wound and is confused, no helmet. Ambulance please.'),
      ], { timeoutMin: 5 }),
      qp('driver', 3, R_DRIVER),
      choice(
        6,
        [
          T(
            '{callsign}: juht keeldub puhumast ja on ilmselgelt joobes. Kas viime ta vereproovi andma või vormistame tunnused?',
            '{callsign}: the rider refuses to blow and is obviously drunk. Do we take him for a blood test or record the signs?',
          ),
        ],
        [
          opt(
            'blood',
            T('Vereproov haiglas', 'Blood test at hospital'),
            T('{callsign}, viige ta vereproovi andma, ratas jääb rendifirmale.', '{callsign}, take him for a blood test, the scooter goes back to the rental company.'),
            { success: 0.15, time: 20 },
          ),
          opt(
            'signs',
            T('Tunnused protokolli', 'Record the signs'),
            T('{callsign}, vormistage joobe tunnused ja keeldumine, rendifirmat teavitada.', '{callsign}, record the signs and the refusal, inform the rental company.'),
            { success: -0.05, time: 5 },
          ),
        ],
        'signs',
        { chance: 0.5 },
      ),
    ],
    outcomes: [
      out(
        'protocol',
        'fine',
        [0.5, 1],
        4,
        T(
          'Juhile koostati väärteoprotokoll joobes kergliikuri juhtimise ja kahekesi sõitmise eest. Kukkunu toimetati kontrolliks haiglasse, auto omanik sai kahju hüvitamiseks andmed.',
          'The rider was given a misdemeanour report for riding a light vehicle drunk and carrying a passenger. The one who fell was taken to hospital for a check-up and the car owner was given details for a claim.',
        ),
        { radio: T('{callsign}: juhile protokoll, kaassõitja kontrolli, lõpetame.', '{callsign}: rider ticketed, passenger for a check-up, closing.') },
      ),
      out(
        'hospital',
        'hospital',
        [0.3, 0.8],
        2,
        T(
          'Kaassõitjal tuvastati ajupõrutus ja ta jäeti haiglasse jälgimisele. Juhi suhtes alustati väärteomenetlust.',
          'The passenger had concussion and was kept in hospital for observation. Misdemeanour proceedings were opened against the rider.',
        ),
        { injuries: 1, radio: T('{callsign}: kaassõitjal ajupõrutus, juhile menetlus.', '{callsign}: passenger concussed, rider being processed.') },
      ),
      out(
        'left',
        'report',
        [0, 0.45],
        2,
        T(
          'Juht üritas lahkuda ja jättis vigastatud sõbra maha, ta peeti kinni kvartali kaugusel. Kaassõitja toimetati haiglasse, juhi suhtes alustati väärteomenetlust.',
          'The rider tried to leave his injured friend behind and was stopped a block away. The passenger was taken to hospital and misdemeanour proceedings were opened against the rider.',
        ),
        { injuries: 1, radio: T('{callsign}: juht üritas lahkuda, peatatud, kaassõitja haiglasse.', '{callsign}: rider tried to leave, stopped, passenger to hospital.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.35,
      toPriority: 2,
      text: T('Teataja: kukkunud noormees oksendab ja ei vasta enam küsimustele.', 'Caller: the young man who fell is vomiting and no longer answering questions.'),
    },
    expiresMin: 75,
    interactiveChance: 0.2,
    call: {
      mood: 'calm',
      opening: [
        T('Kaks noort sõitsid ühe tõukerattaga vastu autot, üks lamab maas ja verd on palju.', 'Two youngsters on one scooter rode into a car, one is lying on the ground and there is a lot of blood.'),
        T('Siin juhtus tõukerattaõnnetus, mõlemad sõitjad on purjus ja üks ei tõuse püsti.', 'There has been a scooter accident here, both riders are drunk and one cannot get up.'),
      ],
      answers: {
        injured: [T('Ühel on pea katki, ta on uimane.', 'One has a cut head, he is drowsy.')],
        intoxicated: [T('Mõlemad on täiesti purjus.', 'Both are completely drunk.')],
        count: [T('Neid on kaks, sõitsid ühe rattaga.', 'Two of them, riding on one scooter.')],
      },
      answersRu: {
        injured: ['У одного голова разбита, он как будто оглушённый.'],
        intoxicated: ['Оба в стельку пьяные.'],
        count: ['Их двое, ехали на одном самокате.'],
      },
      openingRu: [
        'Двое молодых на одном самокате врезались в машину, один лежит на земле, много крови.',
        'Тут авария с самокатом, оба пьяные, один не может встать.',
      ],
    },
    tags: ['alcohol', 'accident'],
  },

  // 27. "Your son has been arrested": a bail scam stopped (or not) at the bank.
  {
    id: 'fraud_poeg_vahistatud_kautsjon',
    category: 'fraud',
    code: 'KE',
    title: T('„Teie poeg on kinni peetud“: kautsjonikelmus', '"Your son has been arrested": bail scam'),
    priority: 3,
    weight: 0.6,
    hours: 'business',
    places: ['bank'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('criminal')] },
    onScene: [25, 60],
    persons: [
      { role: 'victim', gender: 'F', age: [55, 82] },
      { role: 'caller', gender: 'any', age: [25, 55], relation: 'employee' },
      { role: 'suspect', gender: 'M', age: [18, 26], record: 0.2 },
    ],
    summary: [
      T(
        '{place}, {address}. Pangatöötaja teatel nõuab eakas naine 8000 euro sularaha väljamaksmist. Naise sõnul on tema poeg kinni peetud ja „uurija“ ootab kautsjonit.',
        '{place}, {address}. A bank clerk reports an elderly woman demanding 8,000 euros in cash. She says her son has been arrested and an "investigator" is waiting for the bail money.',
      ),
      T(
        '{place}, {address}. Pangakontoris on eakas naine, kes räägib telefonis „politseiga“ ja tahab kanda suure summa tundmatule kontole. Ta keeldub töötajat kuulamast.',
        '{place}, {address}. An elderly woman in the branch is on the phone with "the police" and wants to transfer a large sum to an unknown account. She refuses to listen to the staff.',
      ),
    ],
    callerLines: [
      T(
        'Meil on kontoris proua, kes tahab poja kautsjoni jaoks kaheksa tuhat eurot välja võtta. Ta räägib kogu aeg telefonis kellegagi, kes ütleb end olevat uurija.',
        'There is a lady in the branch who wants to withdraw eight thousand euros for her son’s bail. She keeps talking on the phone to someone who says he is an investigator.',
      ),
      T('Ta nutab ja ütleb, et kui raha täna ei maksa, läheb poeg vangi. Me hoiame makset kinni, aga ta on vihane.', 'She is crying and says that if she does not pay today her son goes to prison. We are holding the payment but she is angry.'),
    ],
    details: [
      T('Proua sõnul tuleb „uurija“ kolleeg raha ise panga ette ära võtma.', 'The lady says the "investigator’s" colleague is coming to collect the money outside the bank himself.'),
      T('Poeg ise ei vasta telefonile, sest on tööl koosolekul.', 'The son himself is not answering his phone because he is in a meeting at work.'),
    ],
    beats: [
      info('arrive', [
        T('{callsign}: kohal, räägime proua ja pangatöötajaga.', '{callsign}: on scene, talking to the lady and the bank clerk.'),
      ]),
      choice(
        3,
        [
          T(
            '{callsign}: „uurija“ ütles telefonis, et tema kolleeg tuleb kohe raha järele panga ette. Kas jääme varjatult ootama?',
            '{callsign}: the "investigator" said on the phone that his colleague is coming for the money outside the bank right now. Do we wait out of sight?',
          ),
        ],
        [
          opt(
            'wait',
            T('Jah, oodake kullerit', 'Yes, wait for the courier'),
            T('{callsign}, üks ametnik jääb prouaga, teine jälgib väljast. Kinni siis, kui kuller raha küsib.', '{callsign}, one officer stays with the lady, the other watches outside. Detain him when he asks for the money.'),
            { success: 0.2, time: 20 },
          ),
          opt(
            'end',
            T('Ei, lõpetage kõne ja selgitage', 'No, end the call and explain'),
            T('{callsign}, lõpetage kõne, selgitage prouale skeemi ja võtke seletus.', '{callsign}, end the call, explain the scheme to the lady and take a statement.'),
            { success: 0, time: 5, outcome: 'saved' },
          ),
        ],
        'end',
      ),
      qp('victim', 6, [
        T('{callsign}: proua andmed avalduse jaoks: {name}, isikukood {idcode}. Palun kontrolli.', '{callsign}: the lady’s details for the report: {name}, ID code {idcode}. Please check.'),
      ]),
    ],
    outcomes: [
      out(
        'mule_caught',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Raha järele tulnud noormees peeti kinni. Ta tunnistas, et sai „töö“ sotsiaalmeedia kuulutuse kaudu. Kriminaalmenetlus KarS § 209 järgi (katse).',
          'The young man who came for the money was detained. He admitted he got the "job" through a social media advert. Criminal proceedings under KarS § 209 (attempt).',
        ),
        { arrests: 1, radio: T('{callsign}: raha järele tulnud noormees kinni.', '{callsign}: the young man who came for the money is detained.') },
      ),
      out(
        'saved',
        'resolved',
        [0.45, 1],
        4,
        T(
          'Prouale selgitati, et politsei ei küsi kunagi telefoni teel kautsjonit. Poeg helistas tagasi, kõik oli korras ja raha jäi kontole.',
          'The lady was told that the police never ask for bail over the phone. Her son rang back, everything was fine and the money stayed in the account.',
        ),
        { radio: T('{callsign}: raha jäi kontole, poeg on korras, lõpetame.', '{callsign}: money stayed in the account, son is fine, closing.') },
      ),
      out(
        'lost',
        'report',
        [0, 0.4],
        2,
        T(
          'Proua jõudis enne patrulli saabumist raha teise pangaautomaadi juures kullerile anda. Alustati kriminaalmenetlust KarS § 209 järgi, kontrollitakse kaameraid.',
          'Before the patrol arrived the lady managed to hand the money to the courier at another cash machine. Criminal proceedings were opened under KarS § 209 and cameras are being checked.',
        ),
        { radio: T('{callsign}: raha jõuti kullerile anda, menetlus alustatud.', '{callsign}: the money reached the courier, case opened.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.5,
      toPriority: 2,
      text: T(
        'Pangatöötaja: proua lahkus kontorist ja läks pangaautomaadi juurde, kus teda ootab noor mees.',
        'Bank clerk: the lady has left the branch and gone to a cash machine where a young man is waiting for her.',
      ),
    },
    expiresMin: 75,
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T('Tere, helistan pangakontorist. Meil on proua, kes tahab poja kautsjoni jaoks suure summa välja võtta, see on kindlasti pettus.', 'Hello, I am calling from a bank branch. We have a lady who wants to withdraw a large sum for her son’s bail, it is surely a scam.'),
        T('Eakas klient räägib telefonis „uurijaga“ ja nõuab kaheksa tuhat eurot sularaha. Ta ei usu meid.', 'An elderly customer is on the phone with an "investigator" and demanding eight thousand euros in cash. She does not believe us.'),
      ],
      answers: {
        suspect: [T('Telefonis on mees, kes räägib väga kindlalt ja kiirustab.', 'There is a man on the phone who sounds very sure of himself and rushes her.')],
        safe: [T('Proua istub praegu kontoris, aga tahab ära minna.', 'The lady is sitting in the branch now but wants to leave.')],
      },
      answersRu: {
        suspect: ['По телефону с ней говорит мужчина, очень уверенно и всё время торопит.'],
        safe: ['Женщина сейчас сидит у нас в отделении, но хочет уйти.'],
      },
      openingRu: [
        'Здравствуйте, звоню из отделения банка. У нас женщина хочет снять крупную сумму на залог за сына, это точно мошенники.',
        'Пожилая клиентка говорит по телефону со «следователем» и требует восемь тысяч евро наличными. Нам она не верит.',
      ],
    },
    tags: ['scam', 'elderly'],
  },

  // 28. A bear raiding the village bins while people film it (east and south Estonia).
  {
    id: 'environment_karu_kulas_prugikastidel',
    category: 'environment',
    code: 'LOOM',
    title: T('Karu sorib küla konteinereid', 'Bear raiding the village bins'),
    priority: 3,
    weight: 0.7,
    months: [4, 5, 6, 7, 8, 9, 10],
    hours: 'evening',
    regions: ['ida', 'louna'],
    places: ['village', 'summerhouse'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [30, 70],
    persons: [
      { role: 'caller', gender: 'any', age: [25, 80] },
      { role: 'witness', gender: 'any', age: [15, 60] },
    ],
    agencies: [{ agency: 'keskkonnaamet', chance: 0.9, reason: T('Suurkiskja asulas, jahimehe kaasamine', 'Large predator in a settlement, hunter to attend') }],
    summary: [
      T(
        '{address}. Teataja sõnul on külas kortermaja taga prügikastide juures karu, kes on kaks konteinerit ümber lükanud. Inimesed filmivad teda rõdudelt ja õuest.',
        '{address}. The caller says a bear is at the bins behind a block of flats in the village and has knocked over two containers. People are filming it from balconies and the yard.',
      ),
      T(
        '{address}. Suvilate vahel liigub karu, kes sööb prügikotte ega karda inimesi. Teataja lapsed on õues.',
        '{address}. A bear is wandering between the summer houses eating from bin bags and is not afraid of people. The caller’s children are outside.',
      ),
    ],
    callerLines: [
      T('Meil on karu prügikastide juures! Suur ja pruun, lükkas konteineri ümber ja sorib.', 'There is a bear at our bins! Big and brown, it knocked a container over and is rummaging through it.'),
      T('Naabrimees läks telefoniga päris lähedale filmima. Ma karjusin talle, aga ta ei kuula.', 'The man next door went right up close to film it on his phone. I shouted at him but he will not listen.'),
      T('See karu on siin juba kolmandat õhtut. Lapsed käivad sealt mööda bussi peale.', 'This is the third evening the bear has been here. The kids walk past there to the bus.'),
    ],
    details: [
      T('Teataja sõnul läheneb karule seltskond noori, kes viskavad teda kividega.', 'The caller says a group of youngsters is approaching the bear and throwing stones at it.'),
      T('Keskkonnaameti andmetel on piirkonnas nähtud emakaru kahe pojaga.', 'According to the Environmental Board, a sow with two cubs has been seen in the area.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: karu on prügikastide juures ja ümber on kümmekond inimest. Kas peletame karu sireeniga eemale või ootame jahimeest ja hoiame inimesed eemal?',
            '{callsign}: the bear is at the bins with about ten people around. Do we scare it off with the siren or wait for the hunter and keep people back?',
          ),
        ],
        [
          opt(
            'keep_back',
            T('Inimesed eemale, oodake jahimeest', 'Keep people back, wait for the hunter'),
            T('{callsign}, viige inimesed tuppa ja hoidke ala vaba. Jahimees on teel, karu ei ärritata.', '{callsign}, get people indoors and keep the area clear. The hunter is on the way, do not provoke the bear.'),
            { success: 0.15, time: 15 },
          ),
          opt(
            'scare',
            T('Peletage sireeniga', 'Scare it off with the siren'),
            T('{callsign}, peletage karu sireeni ja tuledega metsa poole, autost välja ei tulda.', '{callsign}, scare the bear towards the forest with the siren and lights, stay in the car.'),
            { success: 0.05, risk: 0.04, time: 5 },
          ),
        ],
        'keep_back',
      ),
      agency('keskkonnaamet', 2, [
        T(
          '{callsign}: palun Keskkonnaamet ja kohalik jahimees, karu on inimestega harjunud ja tuleb tagasi.',
          '{callsign}: please send the Environmental Board and a local hunter, the bear is used to people and keeps coming back.',
        ),
      ], { timeoutMin: 10 }),
      agency('kiirabi', 6, [
        T('{callsign}: üks mees kukkus karu eest joostes ja vigastas jalga. Palun kiirabi.', '{callsign}: a man fell while running from the bear and hurt his leg. Ambulance please.'),
      ], { chance: 0.3, timeoutMin: 6 }),
    ],
    outcomes: [
      out(
        'left',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Karu lahkus metsa ja inimesed püsisid eemal. Keskkonnaamet otsustab, kas loom tuleb asulast eemaldada, vallale soovitati paigaldada karukindlad prügikastid.',
          'The bear went back into the forest and people kept their distance. The Environmental Board will decide whether the animal must be removed; the council was advised to install bear-proof bins.',
        ),
        { radio: T('{callsign}: karu läks metsa, keegi viga ei saanud.', '{callsign}: bear gone into the forest, nobody hurt.') },
      ),
      out(
        'hunter',
        'referred',
        [0.4, 0.9],
        2,
        T(
          'Jahimees ja Keskkonnaameti spetsialist peletasid karu kummikuulidega eemale. Edasine jälgimine anti üle Keskkonnaametile.',
          'The hunter and an Environmental Board specialist drove the bear off with rubber bullets. Further monitoring was handed over to the Environmental Board.',
        ),
        { radio: T('{callsign}: karu peletati, edasi Keskkonnaamet, lõpetame.', '{callsign}: bear driven off, Environmental Board takes over, closing.') },
      ),
      out(
        'injured',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Karu ajas filmijat taga, mees kukkus ja murdis jala. Ta toimetati haiglasse, karu lahkus metsa.',
          'The bear chased a man who was filming; he fell and broke his leg. He was taken to hospital and the bear went into the forest.',
        ),
        { injuries: 1, radio: T('{callsign}: karu ajas filmijat, mees jalaluumurruga haiglasse.', '{callsign}: bear chased a man filming, broken leg, to hospital.') },
      ),
      out(
        'crowd',
        'warning',
        [0, 0.5],
        1,
        T(
          'Pealtvaatajad ei allunud korraldustele ja karu jäi külla tundideks. Kahele mehele tehti hoiatus, karu lahkus alles koidikul.',
          'The onlookers ignored instructions and the bear stayed in the village for hours. Two men were warned; the bear only left at dawn.',
        ),
        { radio: T('{callsign}: karu lahkus alles koidikul, kaks hoiatust.', '{callsign}: bear left only at dawn, two warnings given.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.4,
      toPriority: 2,
      text: T(
        'Teataja: karu ajas ühte filmijat taga, mees kukkus ja on pikali, karu on paarikümne meetri kaugusel.',
        'Caller: the bear chased one of the people filming, the man fell and is on the ground, the bear is twenty metres away.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T('Meil on karu küla prügikastide juures ja inimesed lähevad teda filmima. Keegi saab viga!', 'There is a bear at the village bins and people are going up to film it. Someone will get hurt!'),
        T('Suvilate vahel käib karu ja sööb prügikotte. Lapsed on õues, mida me tegema peame?', 'A bear is going round the summer houses eating from bin bags. The children are outside, what should we do?'),
      ],
      answers: {
        count: [T('Karu on üks, aga inimesi on ümber kümmekond.', 'There is one bear, but about ten people around it.')],
        children: [T('Õues mängivad lapsed, ma kutsusin enda omad tuppa.', 'There are children playing outside, I called mine indoors.')],
        injured: [T('Veel keegi viga pole saanud.', 'Nobody has been hurt yet.')],
      },
      answersRu: {
        count: ['Медведь один, но вокруг человек десять.'],
        children: ['На улице дети играют, я своих {позвал|позвала} домой.'],
        injured: ['Пока никто не пострадал.'],
      },
      openingRu: [
        'У нас медведь у мусорных баков в деревне, а люди подходят его снимать. Кто-нибудь пострадает!',
        'Между дачами ходит медведь и ест мусорные мешки. Дети на улице, что нам делать?',
      ],
    },
    tags: ['wildlife', 'animal', 'group'],
  },

  // 29. A stolen robot lawnmower shows up on the neighbour's property (light).
  {
    id: 'property_robotniiduk_naabri_garaazis',
    category: 'property',
    code: 'VG',
    title: T('Varastatud robotniiduk naabri garaažis', 'Stolen robot mower in the neighbour’s garage'),
    priority: 4,
    weight: 0.45,
    months: [5, 6, 7, 8, 9],
    hours: 'day',
    places: ['house'],
    units: { need: [u('patrol')], ideal: [u('community')] },
    onScene: [20, 40],
    persons: [
      { role: 'caller', gender: 'any', age: [35, 75], known: true },
      { role: 'suspect', gender: 'M', age: [40, 75], relation: 'neighbour', known: true, record: 0.15 },
    ],
    summary: [
      T(
        '{address}. Teataja robotniiduk kadus öösel aiast. Telefonirakendus näitab, et niiduk asub naabri garaažis, ja teataja kavatseb ise naabri juurde minna.',
        '{address}. The caller’s robot mower vanished from the garden overnight. The phone app shows it in the neighbour’s garage and the caller intends to go round there in person.',
      ),
      T(
        '{address}. Eramu omanik teatas, et tema robotniiduki GPS-signaal tuleb kolm maja eemal asuvast kuurist. Naabrid on aiapiiri pärast juba pikalt tülis.',
        '{address}. A homeowner reports that the GPS signal from their robot mower is coming from a shed three houses down. The neighbours have been feuding over the boundary for a long time.',
      ),
    ],
    callerLines: [
      T('Mu robotniiduk on läinud! Äpp näitab, et ta on naabri garaažis. Ta on sellel ammu silma peal hoidnud.', 'My robot mower is gone! The app shows it in the neighbour’s garage. He has had his eye on it for ages.'),
      T('Ma lähen nüüd ise sinna ja toon ta ära. Või kas ma tohin?', 'I am going over there to get it back myself. Or am I allowed to?'),
      T('Niiduk saatis just teate, et teda tõstetakse. Ta piiksub seal garaažis!', 'The mower just sent an alert that it is being lifted. It is beeping away in that garage!'),
    ],
    details: [
      T('Teataja sõnul on naabritevahelised suhted aiapiiri pärast pingelised ja naaber on varem ähvardanud.', 'The caller says relations with the neighbour are tense because of the boundary and the neighbour has made threats before.'),
      T('Niiduk saatis rakendusse häire „tõstetud“ kell kolm öösel.', 'The mower sent a "lifted" alert to the app at three in the morning.'),
    ],
    beats: [
      qp('suspect', 'arrive', [
        T('{callsign}: naaber avas ukse ja ütleb nimeks {name}, isikukood {idcode}. Garaažist kostab piiksumist.', '{callsign}: the neighbour opened the door, gives the name {name}, ID code {idcode}. There is beeping from the garage.'),
      ]),
      choice(
        2,
        [
          T(
            '{callsign}: naaber väidab, et niiduk sõitis ise tema aeda ja ta „hoidis seda alles“. Kuidas toimime?',
            '{callsign}: the neighbour claims the mower drove into his garden by itself and he was "keeping it safe". How do we proceed?',
          ),
        ],
        [
          opt(
            'return',
            T('Niiduk tagasi, alustage menetlust', 'Mower back, open a case'),
            T('{callsign}, niiduk tagastada omanikule ja naabrilt seletus. Menetluse üle otsustab uurija.', '{callsign}, return the mower to the owner and take a statement from the neighbour. The investigator will decide on the case.'),
            { success: 0.1, time: 10 },
          ),
          opt(
            'mediate',
            T('Lepitage, niiduk tagasi', 'Mediate, mower back'),
            T('{callsign}, aidake pooltel kokku leppida ja niiduk tagastada.', '{callsign}, help the two of them come to terms and return the mower.'),
            { success: 0.1, time: 15, trust: 1 },
          ),
          opt(
            'leave',
            T('Tsiviilasi, ärge sekkuge', 'Civil matter, do not intervene'),
            T('{callsign}, see on naabrite omavaheline asi, selgitage kohtu kaudu lahendamist.', '{callsign}, it is a matter between neighbours, explain how to settle it through the courts.'),
            { success: -0.15, trust: -2, outcome: 'dispute' },
          ),
        ],
        'mediate',
      ),
      info(8, [
        T('{callsign}: niiduk on garaažist välja toodud ja piiksumine lakkas. Naaber pomiseb midagi aiapiiri kohta.', '{callsign}: the mower is out of the garage and the beeping has stopped. The neighbour is muttering about the boundary.'),
      ]),
    ],
    outcomes: [
      out(
        'returned',
        'resolved',
        [0.4, 1],
        4,
        T(
          'Niiduk tagastati omanikule. Naaber väitis, et see eksis tema aeda, ja lubas edaspidi aiapiiri austada. Pooltele selgitati vaidluse lahendamise võimalusi.',
          'The mower was returned to its owner. The neighbour claimed it had strayed into his garden and promised to respect the boundary from now on. Both were told how to settle the dispute.',
        ),
        { radio: T('{callsign}: niiduk tagastatud, naabrid rahunesid, lõpetame.', '{callsign}: mower returned, neighbours calmed down, closing.') },
      ),
      out(
        'theft',
        'report',
        [0.45, 1],
        2,
        T(
          'Naaber tunnistas, et võttis niiduki kättemaksuks üle aia lõigatud heki eest. Alustati menetlust varguse asjaoludes ja niiduk tagastati.',
          'The neighbour admitted taking the mower in revenge for a hedge cut back over the fence. Theft proceedings were opened and the mower was returned.',
        ),
        { radio: T('{callsign}: naaber tunnistas kättemaksu, niiduk tagasi.', '{callsign}: neighbour admitted revenge, mower returned.') },
      ),
      out(
        'dispute',
        'warning',
        [0, 0.5],
        2,
        T(
          'Pooled sõimasid teineteist ka patrulli juuresolekul. Mõlemale tehti hoiatus, niiduk tagastati ja vaidlus suunati lepitusse.',
          'The two kept trading insults even in front of the patrol. Both were warned, the mower was returned and the dispute was referred to mediation.',
        ),
        { radio: T('{callsign}: mõlemale hoiatus, niiduk tagasi, lõpetame.', '{callsign}: both warned, mower returned, closing.') },
      ),
      out(
        'pushed',
        'report',
        [0, 0.3],
        1,
        T(
          'Omanik läks ise niidukile järele ja naaber tõukas ta trepist alla, omanik sai kergelt viga. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'The owner went to fetch the mower personally and the neighbour pushed him down the steps; he was slightly hurt. Criminal proceedings were opened under KarS § 121.',
        ),
        { injuries: 1, radio: T('{callsign}: naaber tõukas omaniku trepist alla, menetlus alustatud.', '{callsign}: neighbour pushed the owner down the steps, case opened.') },
      ),
    ],
    escalation: {
      afterMin: 40,
      chance: 0.3,
      toPriority: 3,
      text: T('Teataja: läksin naabri juurde, ta lükkas mind trepist alla ja ähvardab labidaga.', 'Caller: I went round to the neighbour, he pushed me down the steps and is threatening me with a spade.'),
    },
    expiresMin: 180,
    interactiveChance: 0.3,
    call: {
      mood: 'angry',
      opening: [
        T('Mu robotniiduk varastati ja äpp näitab, et see on naabri garaažis! Ma lähen ise sinna!', 'My robot mower has been stolen and the app shows it is in the neighbour’s garage! I am going over there myself!'),
        T('Naaber varastas mu muruniiduki, see robot, mis ise sõidab. GPS näitab täpselt tema kuuri.', 'My neighbour has stolen my lawnmower, the robot one that drives itself. The GPS shows it is right in his shed.'),
      ],
      answers: {
        when: [T('Äpp saatis häire kell kolm öösel.', 'The app sent an alert at three in the morning.')],
        weapons: [T('Relvi pole, aga tal on alati labidas käe all.', 'No weapons, but he always has a spade handy.')],
        safe: [T('Ma olen kodus, aga lähen kohe ise sinna.', 'I am at home, but I am about to go over there.')],
      },
      answersRu: {
        when: ['Приложение подняло тревогу в три часа ночи.'],
        weapons: ['Оружия нет, но у него лопата всегда под рукой.'],
        safe: ['Я дома, но сейчас {сам|сама} туда пойду.'],
      },
      openingRu: [
        'У меня украли робот-газонокосилку, а приложение показывает, что она в гараже у соседа! Я {сам|сама} туда пойду!',
        'Сосед украл мою косилку, робот, который сам ездит. GPS показывает прямо его сарай.',
      ],
    },
    tags: ['neighbours', 'theft'],
  },

  // 30. A pensioner, once a wrestler, is sitting on a bike thief (light).
  {
    id: 'property_pensionar_istub_vargal_peal',
    category: 'property',
    code: 'VG',
    title: T('Pensionär hoiab rattavarast kinni', 'Pensioner pins down a bike thief'),
    priority: 3,
    weight: 0.6,
    months: [4, 5, 6, 7, 8, 9, 10],
    hours: 'day',
    places: ['residential', 'street'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [20, 45],
    persons: [
      { role: 'caller', gender: 'M', age: [68, 85] },
      { role: 'suspect', gender: 'M', age: [16, 30], record: 0.5, intoxicated: 0.4, wanted: 0.1 },
    ],
    summary: [
      T(
        '{address}. Eakas mees teatas, et tabas trepikojast jalgratast varastanud noormehe ja istub tal peal. Varas rabeleb ja sõimab.',
        '{address}. An elderly man reports that he caught a young man stealing a bicycle from the stairwell and is sitting on him. The thief is struggling and swearing.',
      ),
      T(
        '{address}. Teataja, endine maadleja, hoiab rattavarast kinni ja palub politseil kiiresti tulla, sest käed hakkavad väsima.',
        '{address}. The caller, a former wrestler, is holding a bike thief down and asks the police to hurry because his arms are getting tired.',
      ),
    ],
    callerLines: [
      T('Ma võtsin ühe varga kinni! Ta tahtis mu naise ratta ära viia, aga ma istun tal peal. Tulge ruttu!', 'I have caught a thief! He wanted to take my wife’s bike, but I am sitting on him. Come quickly!'),
      T('Ma olin noorena maadleja, ärge muretsege. Aga ta on libe nagu angerjas.', 'I was a wrestler when I was young, do not worry. But he is as slippery as an eel.'),
      T('Ta lubab mind lüüa, kui lahti lasen. Ma ei lase.', 'He says he will hit me if I let go. I will not let go.'),
    ],
    details: [
      T('Teataja sõnul on vargal taskus lõiketangid ja ta üritab neid kätte saada.', 'The caller says the thief has bolt cutters in his pocket and is trying to reach them.'),
      T('Trepikojast on sel kuul varastatud juba kolm jalgratast.', 'Three bicycles have already been stolen from the stairwell this month.'),
    ],
    beats: [
      qp('suspect', 'arrive', [
        T(
          '{callsign}: kohal. Vanahärra jõudis varga taskust dokumendi välja õngitseda: {name}, isikukood {idcode}. Kontrolli palun.',
          '{callsign}: on scene. The old gentleman managed to fish the thief’s ID out of his pocket: {name}, ID code {idcode}. Please check.',
        ),
      ]),
      agency('kiirabi', 2, [
        T('{callsign}: vanahärral on käel lõikehaav ja vererõhk on kõrge. Palun kiirabi kontrolliks.', '{callsign}: the old gentleman has a cut on his hand and his blood pressure is high. Ambulance to check him please.'),
      ], { chance: 0.35, timeoutMin: 6 }),
      search(1, 1, [
        T('{callsign}: varas pääses lahti ja jooksis garaažide vahele. Kammime ümbrust.', '{callsign}: the thief wriggled free and ran between the garages. Combing the area.'),
      ], 0.25),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.45, 1],
        4,
        T(
          'Rattavaras peeti kinni, temalt leiti lõiketangid ja kahe teise ratta lukud. Alustati kriminaalmenetlust KarS § 199 järgi, vanahärrat tänati ja paluti tal edaspidi enda ohutust silmas pidada.',
          'The bike thief was detained with bolt cutters and the locks of two other bikes on him. Criminal proceedings were opened under KarS § 199; the old gentleman was thanked and asked to mind his own safety in future.',
        ),
        { arrests: 1, radio: T('{callsign}: rattavaras kinni, vanahärra on terve.', '{callsign}: bike thief detained, the old gentleman is fine.') },
      ),
      out(
        'wanted',
        'arrest',
        [0.55, 1],
        1,
        T(
          'Kinnipeetu osutus mitme varguse eest tagaotsitavaks. Vanahärra lubati koju, kuid ta nõudis, et temast kirjutataks ajalehes.',
          'The detainee turned out to be wanted for several thefts. The old gentleman was allowed home, but insisted the newspaper should write about him.',
        ),
        { arrests: 1, radio: T('{callsign}: varas osutus tagaotsitavaks, kinni peetud.', '{callsign}: thief turned out to be wanted, detained.') },
      ),
      out(
        'escaped',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Varas pääses lahti ja põgenes. Ratas jäi omanikule, varas on dokumendi järgi tuvastatud ja menetlus jätkub.',
          'The thief broke free and ran off. The bike stayed with its owner, the thief has been identified from his ID and the case continues.',
        ),
      ),
      out(
        'hurt',
        'hospital',
        [0, 0.35],
        1,
        T(
          'Varas lõi vanahärrat lõiketangidega ja põgenes. Eakas mees toimetati haiglasse, varas on dokumendi järgi tuvastatud.',
          'The thief hit the old man with the bolt cutters and fled. The elderly man was taken to hospital; the thief has been identified from his ID.',
        ),
        { injuries: 1, radio: T('{callsign}: varas lõi vanahärrat ja põgenes.', '{callsign}: thief hit the old man and fled.') },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.45,
      toPriority: 2,
      text: T('Teataja: varas lõi mind tangidega ja pääses lahti, jookseb parkla poole!', 'Caller: the thief hit me with the cutters and got free, he is running towards the car park!'),
    },
    expiresMin: 60,
    interactiveChance: 0.3,
    call: {
      mood: 'angry',
      opening: [
        T('Ma võtsin varga kinni! Istun tal peal, aga ta rabeleb. Tulge kiiresti!', 'I have caught a thief! I am sitting on him, but he is struggling. Come quickly!'),
        T('Üks poiss tahtis trepikojast ratast viia, ma panin ta pikali. Kaua ma teda ikka hoian?', 'A lad tried to take a bike from the stairwell, so I pinned him down. How long am I supposed to hold him?'),
      ],
      answers: {
        weapons: [T('Tal on taskus lõiketangid, aga ma hoian ta käsi kinni.', 'He has bolt cutters in his pocket, but I am holding his arms.')],
        injured: [T('Mul on käel kriimustus, muidu olen korras.', 'I have a scratch on my hand, otherwise I am fine.')],
        suspect: [T('{suspect}.', '{suspect}.')],
      },
      answersRu: {
        weapons: ['У него в кармане кусачки, но я держу его руки.'],
        injured: ['У меня царапина на руке, а так я в порядке.'],
        suspect: ['{suspect}.'],
      },
      openingRu: [
        'Я поймал вора! Сижу на нём, но он вырывается. Приезжайте быстрее!',
        'Парень хотел утащить велосипед из подъезда, я его уложил. Сколько мне его ещё держать?',
      ],
    },
    tags: ['detained', 'elderly'],
  },

  // 31. A queue-jumper starts a fight in the summer ferry queue to the islands.
  {
    id: 'public_order_praamijarjekorra_tuli',
    category: 'public_order',
    code: 'KL',
    title: T('Tüli praamijärjekorras', 'Fight in the ferry queue'),
    priority: 3,
    weight: 1.5,
    months: [6, 7, 8],
    hours: 'day',
    regions: ['laane'],
    places: ['port'],
    // The island ferry ports with a car queue (Virtsu, Kuivastu, Rohuküla, Heltermaa), never the cargo or yacht harbours.
    placeTags: ['queue'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [20, 50],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 60], intoxicated: 0.2, record: 0.2 },
      { role: 'victim', gender: 'M', age: [25, 70] },
      { role: 'caller', gender: 'any', age: [20, 60], relation: 'employee' },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
    summary: [
      T(
        '{place}, {address}. Praamijärjekorras sõitis üks juht ootajatest mööda, teised juhid blokeerisid tema auto ja käib sõimlemine. Järjekord on kolme praami pikkune.',
        '{place}, {address}. A driver jumped the ferry queue; other drivers have boxed his car in and there is a shouting match. The queue is three ferries long.',
      ),
      T(
        '{place}, {address}. Sadama töötaja teatel lõi järjekorras trüginud juht teist juhti, kes ei lasknud teda ette. Pealtvaatajaid on palju.',
        '{place}, {address}. Port staff report that a queue-jumping driver hit another driver who would not let him in. Many people are watching.',
      ),
    ],
    callerLines: [
      T('Üks auto sõitis bussirada mööda kogu järjekorrast mööda ja nüüd ei lase keegi teda vahele. Mehed on juba autodest väljas.', 'A car drove past the whole queue in the bus lane and now nobody will let him in. The men are already out of their cars.'),
      T('Ta lükkas ühte meest ja too kukkus vastu autot. Lapsed vaatavad autodest pealt.', 'He shoved a man and he fell against a car. Children are watching from the cars.'),
    ],
    details: [
      T('Sadama töötaja sõnul on järjekorras palav ja ootajad on närvis, mitu juhti on juba autost väljas.', 'Port staff say it is hot in the queue and people are on edge; several drivers are already out of their cars.'),
      T('Trüginud auto juht väidab, et tal on eelisjärjekorra pilet.', 'The queue-jumper claims he has a priority ticket.'),
    ],
    beats: [
      qv('arrive', [
        T('{callsign}: kohal, trüginud auto on {car}, numbrimärk {plate}. Kontrolli palun.', '{callsign}: on scene, the queue-jumper’s car: {car}, plate {plate}. Please run it.'),
      ]),
      choice(
        3,
        [
          T(
            '{callsign}: trügija väidab, et tal on eelisjärjekorra pilet, aga piletit näidata ei suuda. Kas saadame ta järjekorra lõppu?',
            '{callsign}: the queue-jumper says he has a priority ticket but cannot show it. Do we send him to the back of the queue?',
          ),
        ],
        [
          opt(
            'back',
            T('Järjekorra lõppu, hoiatus', 'To the back of the queue, warning'),
            T('{callsign}, juht läheb järjekorra lõppu, sadama töötaja suunab. Hoiatus tehtud.', '{callsign}, the driver goes to the back of the queue, port staff will direct him. Warning given.'),
            { success: 0.15, time: 5, trust: 1 },
          ),
          opt(
            'let',
            T('Laske tal peale sõita', 'Let him board'),
            T('{callsign}, rahu huvides las sõidab peale, andmed pange kirja.', '{callsign}, for the sake of peace let him board, take his details.'),
            { success: -0.1, trust: -2 },
          ),
        ],
        'back',
      ),
      qp('suspect', 6, R_SUSPECT, 0.6),
    ],
    outcomes: [
      out(
        'sorted',
        'warning',
        [0.45, 1],
        4,
        T(
          'Trügijale tehti hoiatus ja järjekord rahunes. Praamiliiklus jätkus graafiku järgi.',
          'The queue-jumper was warned and the queue calmed down. The ferries kept to the timetable.',
        ),
        { radio: T('{callsign}: trügijale hoiatus, järjekord rahunes, lõpetame.', '{callsign}: queue-jumper warned, queue calm, closing.') },
      ),
      out(
        'assault',
        'report',
        [0.3, 0.8],
        2,
        T(
          'Trügija oli teist juhti löönud, alustati kriminaalmenetlust KarS § 121 järgi. Kannatanu jätkas teekonda saarele.',
          'The queue-jumper had hit the other driver; criminal proceedings were opened under KarS § 121. The victim carried on to the island.',
        ),
        { radio: T('{callsign}: trügija lõi teist juhti, menetlus alustatud.', '{callsign}: queue-jumper hit another driver, case opened.') },
      ),
      out(
        'brawl',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Järjekorras puhkes kaklus, üks mees sai peavigastuse ja toimetati haiglasse. Praam väljus hilinemisega.',
          'A fight broke out in the queue and one man was taken to hospital with a head injury. The ferry left late.',
        ),
        { injuries: 1, radio: T('{callsign}: kaklus järjekorras, üks peavigastusega haiglasse.', '{callsign}: fight in the queue, one with a head injury to hospital.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.4,
      toPriority: 2,
      text: T('Sadama töötaja: tüli läks kakluseks, kolm meest on teineteisel kallal ja üks lamab maas.', 'Port staff: the row has turned into a fight, three men are going at each other and one is on the ground.'),
    },
    expiresMin: 75,
    interactiveChance: 0.2,
    call: {
      mood: 'angry',
      opening: [
        T('Praamijärjekorras läheb kakluseks! Üks trügis ette ja nüüd on mehed autodest väljas.', 'It is turning into a fight in the ferry queue! Someone jumped the queue and now the men are out of their cars.'),
        T('Ma töötan sadamas. Üks juht lõi järjekorras teist, palun saatke patrull.', 'I work at the port. One driver hit another in the queue, please send a patrol.'),
      ],
      answers: {
        count: [T('Kaks meest kaklevad, ümber on paarkümmend inimest.', 'Two men fighting, about twenty people around.')],
        vehicle: [T('Trügija auto on {car}, number {plate}.', 'The queue-jumper’s car: {car}, number {plate}.')],
        children: [T('Autodes on palju lapsi, nad vaatavad pealt.', 'There are lots of children in the cars watching.')],
      },
      answersRu: {
        count: ['Дерутся двое мужчин, вокруг человек двадцать.'],
        vehicle: ['Машина того, кто влез без очереди: {car}, номер {plate}.'],
        children: ['В машинах много детей, они всё видят.'],
      },
      openingRu: [
        'В очереди на паром начинается драка! Один влез без очереди, и теперь мужики вышли из машин.',
        'Я работаю в порту. Один водитель ударил другого в очереди, пришлите патруль.',
      ],
    },
    tags: ['ferry', 'traffic_related'],
  },

  // 32. A car smashes through the barrier at an eastern border crossing.
  {
    id: 'border_tokkepuust_labi_soitnud_auto',
    category: 'border',
    code: 'PR',
    title: T('Auto sõitis piiripunktis tõkkepuust läbi', 'Car smashed through a border crossing barrier'),
    priority: 2,
    weight: 0.08,
    regions: ['ida', 'louna'],
    places: ['border'],
    units: { need: [u('patrol')], ideal: [u('border'), u('patrol', 2)] },
    onScene: [40, 90],
    persons: [
      { role: 'driver', gender: 'M', age: [20, 50], wanted: 0.25, noLicense: 0.3, record: 0.5 },
      { role: 'caller', gender: 'any', age: [25, 55], relation: 'employee' },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', stolen: 0.3 }],
    summary: [
      T(
        '{place}, {address}. Piiripunkti teatel ei peatunud riiki sisenev sõiduauto kontrollis, sõitis tõkkepuust läbi ja suundus sisemaa poole.',
        '{place}, {address}. The border crossing reports that a car entering the country did not stop for the check, smashed through the barrier and headed inland.',
      ),
      T(
        '{place}, {address}. Sõiduauto kihutas piirikontrolli eest minema, kui ametnik palus pagasiruumi avada. Autos on kaks meest.',
        '{place}, {address}. A car sped away from the border check when an officer asked for the boot to be opened. There are two men in the car.',
      ),
    ],
    callerLines: [
      T('Üks auto sõitis meil tõkkepuust läbi ja kihutab sisemaa poole, {car}, number {plate}.', 'A car has just smashed through our barrier and is racing inland, {car}, number {plate}.'),
      T('Ametnik palus pagasiruumi avada, juht vajutas gaasi. Ametnik jõudis kõrvale hüpata.', 'The officer asked for the boot to be opened and the driver put his foot down. The officer managed to jump aside.'),
    ],
    details: [
      T('Piirivalvuri sõnul vajus auto taha, pagasiruumis võib olla salakaupa.', 'The border guard says the car was sitting low at the back; there may be contraband in the boot.'),
      T('Sõiduki kirjeldus on edastatud kõigile piirkonna ekipaažidele.', 'The vehicle description has been sent to all crews in the area.'),
    ],
    beats: [
      pursuit('arrive', [T('{callsign}: nägime autot, sõidab üle 150, ei peatu. Alustame jälitust!', '{callsign}: we have the car, doing over 150, not stopping. Starting a pursuit!')]),
      qv(4, [
        T('{callsign}: auto on käes, {car}, numbrimärk {plate}. Pagasiruum on sigaretikaste täis. Kontrolli palun.', '{callsign}: we have the car, {car}, plate {plate}. The boot is full of cigarette boxes. Please run it.'),
      ]),
      qp('driver', 6, [
        T('{callsign}: autost leitud dokumentide järgi on juht {name}, isikukood {idcode}. Kontrolli palun.', '{callsign}: according to the documents in the car the driver is {name}, ID code {idcode}. Please check.'),
      ]),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Auto peatati teetõkkega ja juht peeti kinni. Pagasiruumist leiti 30 000 salasigaretti, alustati kriminaalmenetlust KarS § 391 järgi.',
          'The car was stopped at a roadblock and the driver detained. 30,000 contraband cigarettes were found in the boot; criminal proceedings were opened under KarS § 391.',
        ),
        { arrests: 1, radio: T('{callsign}: auto peatatud, juht kinni, salasigaretid pagasiruumis.', '{callsign}: car stopped, driver detained, contraband cigarettes in the boot.') },
      ),
      out(
        'crashed',
        'hospital',
        [0.2, 0.6],
        2,
        T(
          'Jälitatav kaotas kurvis juhitavuse ja sõitis kraavi. Juht toimetati haiglasse, autost leiti salasigaretid.',
          'The fleeing driver lost control on a bend and went into the ditch. He was taken to hospital and contraband cigarettes were found in the car.',
        ),
        { injuries: 1, radio: T('{callsign}: jälitatav kraavis, juht haiglasse.', '{callsign}: fleeing car in the ditch, driver to hospital.') },
      ),
      out(
        'escaped',
        'escaped',
        [0, 0.4],
        3,
        T(
          'Auto jäeti metsateele maha ja juht põgenes jalgsi. Autost leiti salakaup, juhi isik selgitatakse.',
          'The car was abandoned on a forest track and the driver fled on foot. Contraband was found in the car and the driver is being identified.',
        ),
        { radio: T('{callsign}: auto metsateel maha jäetud, juht põgenes jalgsi.', '{callsign}: car abandoned on a forest track, driver fled on foot.') },
      ),
    ],
    expiresMin: 45,
    interactiveChance: 0.2,
    call: {
      mood: 'calm',
      opening: [
        T('Siin piiripunkt. Üks auto sõitis tõkkepuust läbi ja kihutab sisemaa poole!', 'Border crossing here. A car has smashed through the barrier and is racing inland!'),
        T('Sõiduauto põgenes piirikontrollist, kui palusime pagasiruumi avada. Autos on kaks meest.', 'A car fled the border check when we asked to open the boot. There are two men in it.'),
      ],
      answers: {
        vehicle: [T('{car}, number {plate}.', '{car}, number {plate}.')],
        direction: [T('Auto sõitis {direction}.', 'The car drove {direction}.')],
        count: [T('Autos on kaks meest.', 'There are two men in the car.')],
      },
      answersRu: {
        vehicle: ['{car}, номер {plate}.'],
        direction: ['Машина уехала {direction}.'],
        count: ['В машине двое мужчин.'],
      },
      openingRu: [
        'Это пограничный пункт. Машина снесла шлагбаум и мчится вглубь страны!',
        'Легковушка сбежала с пограничного контроля, когда мы попросили открыть багажник. В машине двое.',
      ],
    },
    tags: ['smuggling', 'vehicle_flee'],
  },

  // 33. A dog goes through thin ice and its owner goes after it.
  {
    id: 'assist_koer_laks_jaale_omanik_jarel',
    category: 'assist',
    code: 'JÄÄ',
    title: T('Koer läks õhukesele jääle, omanik järel', 'Dog on thin ice, owner going after it'),
    priority: 2,
    weight: 1.0,
    months: [12, 1, 2, 3],
    hours: 'day',
    places: ['beach', 'lake', 'park'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [30, 60],
    persons: [
      { role: 'victim', gender: 'any', age: [30, 75] },
      { role: 'caller', gender: 'any', age: [20, 75] },
    ],
    agencies: [{ agency: 'paaste', chance: 0.85, reason: T('Jääpääste', 'Ice rescue') }],
    summary: [
      T(
        '{address}. Teataja sõnul jooksis koer jääle ja kukkus läbi. Omanik läks talle järele ja jää praguneb tema all. Kaldast umbes viiskümmend meetrit.',
        '{address}. The caller says a dog ran out onto the ice and fell through. The owner went after it and the ice is cracking under them, about fifty metres from the shore.',
      ),
      T(
        '{address}. Jääl on hädas koer ja omanik roomab tema poole. Möödujad karjuvad, et ta tagasi tuleks.',
        '{address}. A dog is in trouble on the ice and the owner is crawling towards it. Passers-by are shouting at the owner to come back.',
      ),
    ],
    callerLines: [
      T('Koer kukkus jääauku ja omanik läks talle järele! Jää on täiesti õhuke, ma kuulen, kuidas see ragiseb!', 'The dog fell through the ice and the owner went after it! The ice is really thin, I can hear it creaking!'),
      T('Ta roomab kõhuli koera poole. Kas ma lähen appi? Mul on autos nöör.', 'The owner is crawling on their belly towards the dog. Should I go and help? I have a rope in the car.'),
    ],
    details: [
      T('Teataja sõnul on omanik koerast kümne meetri kaugusel ja jää tema ümber on märg.', 'The caller says the owner is ten metres from the dog and the ice around them is wet.'),
      T('Kaldal on päästerõngas, kuid see ei ulatu nii kaugele.', 'There is a lifebuoy on the shore, but it will not reach that far.'),
    ],
    beats: [
      agency('paaste', 'arrive', [
        T('{callsign}: omanik on jääl ja jää praguneb. Vajame kohe Päästeameti jääpäästjaid!', '{callsign}: the owner is on the ice and it is cracking. We need Rescue Board ice rescuers now!'),
      ], { timeoutMin: 5, fail: { success: -0.3, trust: -4 } }),
      choice(
        1,
        [T('{callsign}: möödujad tahavad inimketiga omanikule järele minna. Kas lubame?', '{callsign}: passers-by want to form a human chain and go after the owner. Do we allow it?')],
        [
          opt(
            'stop',
            T('Ei, jääle ei minda, visake nöör', 'No, nobody goes on the ice, throw a rope'),
            T('{callsign}, keegi jääle ei lähe. Visake nöör või päästerõngas ja hoidke omanik paigal.', '{callsign}, nobody goes on the ice. Throw a rope or the lifebuoy and keep the owner still.'),
            { success: 0.15, time: 5 },
          ),
          opt(
            'chain',
            T('Jah, inimkett', 'Yes, a human chain'),
            T('{callsign}, ainult kõhuli ja nööriga, ametnik juhib.', '{callsign}, only lying flat and roped together, an officer leads.'),
            { success: -0.05, risk: 0.1 },
          ),
        ],
        'chain',
        { timeoutMin: 2 },
      ),
      agency('kiirabi', 5, [
        T('{callsign}: palun kiirabi kaldale, inimene on olnud jääkülmas vees.', '{callsign}: ambulance to the shore please, someone has been in ice-cold water.'),
      ], { chance: 0.6, timeoutMin: 5 }),
    ],
    outcomes: [
      out(
        'both_saved',
        'resolved',
        [0.55, 1],
        4,
        T(
          'Päästjad tõid omaniku ja koera jäält ära. Omanik sai külma, kuid haiglaravi ei vajanud, talle selgitati jääl liikumise ohte.',
          'The rescuers brought the owner and the dog off the ice. The owner was cold but did not need hospital and was told about the dangers of going on the ice.',
        ),
        { radio: T('{callsign}: omanik ja koer jäält ära, lõpetame.', '{callsign}: owner and dog off the ice, closing.') },
      ),
      out(
        'owner_cold',
        'hospital',
        [0.3, 0.75],
        2,
        T(
          'Omanik kukkus läbi jää, kuid hoidis jääservast kinni, kuni päästjad ta välja tõid. Ta toimetati alajahtumisega haiglasse, ka koer päästeti.',
          'The owner went through the ice but held on to the edge until the rescuers pulled them out. They were taken to hospital with hypothermia; the dog was saved too.',
        ),
        { injuries: 1, radio: T('{callsign}: omanik veest välja, alajahtunud, haiglasse.', '{callsign}: owner out of the water, hypothermic, to hospital.') },
      ),
      out(
        'dog_lost',
        'resolved',
        [0.2, 0.6],
        1,
        T(
          'Omanik toodi kaldale, kuid koera ei õnnestunud päästa. Omanikule pakuti kriisiabi.',
          'The owner was brought ashore but the dog could not be saved. The owner was offered crisis support.',
        ),
        { radio: T('{callsign}: omanik kaldal, koera päästa ei õnnestunud.', '{callsign}: owner ashore, the dog could not be saved.') },
      ),
      out(
        'rescuer',
        'hospital',
        [0, 0.35],
        1,
        T(
          'Appi läinud mööduja kukkus samuti läbi jää. Päästjad tõid mõlemad välja ja nad toimetati alajahtumisega haiglasse.',
          'A passer-by who went to help also fell through the ice. The rescuers pulled both out and they were taken to hospital with hypothermia.',
        ),
        { injuries: 2, radio: T('{callsign}: ka abistaja kukkus jäässe, kaks haiglasse.', '{callsign}: the helper fell through too, two to hospital.') },
      ),
      out(
        'tragedy',
        'tragedy',
        [0, 0.15],
        1,
        T(
          'Omanik vajus enne päästjate saabumist jää alla ja teda ei õnnestunud elustada.',
          'The owner went under the ice before the rescuers arrived and could not be revived.',
        ),
        { radio: T('{callsign}: omanik vajus jää alla, elustada ei õnnestunud.', '{callsign}: owner went under the ice, could not be revived.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.5,
      toPriority: 1,
      text: T('Teataja: omanik kukkus ka läbi jää, hoiab jääservast kinni ja karjub appi!', 'Caller: the owner has gone through the ice too, is clinging to the edge and screaming for help!'),
    },
    expiresMin: 40,
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T('Koer kukkus läbi jää ja omanik läks talle järele! Jää ragiseb, palun saatke päästjad!', 'A dog fell through the ice and the owner went after it! The ice is creaking, please send the rescuers!'),
        T('Üks inimene roomab õhukesel jääl oma koera poole, ta kukub kohe sisse!', 'Someone is crawling across thin ice towards their dog, they are about to go through!'),
      ],
      answers: {
        injured: [T('Omanik on veel jää peal, koer on vees.', 'The owner is still on the ice, the dog is in the water.')],
        where: [T('Umbes viiskümmend meetrit kaldast, paadisilla kohal.', 'About fifty metres from the shore, level with the jetty.')],
        safe: [T('Ma olen kaldal, jääle ma ei lähe.', 'I am on the shore, I will not go on the ice.')],
      },
      answersRu: {
        injured: ['Хозяин ещё на льду, собака в воде.'],
        where: ['Примерно в пятидесяти метрах от берега, напротив мостков.'],
        safe: ['Я на берегу, на лёд не пойду.'],
      },
      openingRu: [
        'Собака провалилась под лёд, а [хозяин пошёл|хозяйка пошла] за ней! Лёд трещит, пришлите спасателей!',
        'Человек ползёт по тонкому льду к своей собаке, сейчас провалится!',
      ],
    },
    tags: ['ice', 'water', 'animal'],
  },

  // 34. A rural boundary dispute: the neighbour has come with an axe.
  {
    id: 'violence_naabrite_piirivaidlus_kirvega',
    category: 'violence',
    code: 'ÄH',
    title: T('Naabrite piirivaidlus, mees tuli kirvega', 'Neighbours’ boundary dispute, man comes with an axe'),
    priority: 3,
    weight: 0.75,
    months: [4, 5, 6, 7, 8, 9, 10],
    hours: 'day',
    places: ['farm', 'village', 'house'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('community')] },
    onScene: [30, 70],
    persons: [
      { role: 'caller', gender: 'any', age: [40, 80], known: true },
      { role: 'suspect', gender: 'M', age: [45, 80], relation: 'neighbour', known: true, intoxicated: 0.5, weapon: 0.3, record: 0.3 },
    ],
    summary: [
      T(
        '{address}. Teataja sõnul raius naaber tema aia maha, sest naabri arvates on piir vales kohas. Nüüd seisab naaber kirvega piiril ja ähvardab.',
        '{address}. The caller says the neighbour has chopped down the fence, claiming the boundary is in the wrong place. Now he is standing on the boundary with an axe making threats.',
      ),
      T(
        '{address}. Naabrid vaidlevad piirimärkide üle, üks neist on joobes ja raiub teise aiaposte. Teataja läks tuppa.',
        '{address}. Neighbours are arguing over the boundary markers; one is drunk and hacking at the other’s fence posts. The caller has gone indoors.',
      ),
    ],
    callerLines: [
      T('Naaber raiub mu aeda maha! Ta ütleb, et piir käib läbi minu kartulipõllu.', 'The neighbour is chopping my fence down! He says the boundary runs right through my potato patch.'),
      T('Ta on purjus ja tal on kirves. Ta karjus, et kes üle piiri astub, sellel läheb halvasti.', 'He is drunk and he has an axe. He shouted that whoever steps over the line will be sorry.'),
      T('Me oleme kümme aastat selle piiri pärast tülitsenud, aga nüüd on ta täitsa hulluks läinud.', 'We have been fighting over this boundary for ten years, but now he has completely lost it.'),
    ],
    details: [
      T('Teataja sõnul on naabril kodus ka jahipüss.', 'The caller says the neighbour also has a hunting rifle at home.'),
      T('Maamõõtja käis eelmisel nädalal kinnistut mõõtmas ja piirimärgid on maast välja kistud.', 'A surveyor measured the plot last week and the boundary markers have been pulled out of the ground.'),
    ],
    beats: [
      qp('suspect', 'arrive', [
        T(
          '{callsign}: kohal, naaber seisab aia juures kirvega. Ütleb nimeks {name}, isikukood {idcode}. Kas tal on relvaluba?',
          '{callsign}: on scene, the neighbour is standing by the fence with an axe. Gives the name {name}, ID code {idcode}. Does he hold a weapons permit?',
        ),
      ]),
      choice(
        2,
        [T('{callsign}: naaber pani kirve maha, aga on väga ärritunud ja joobes. Kuidas toimime?', '{callsign}: the neighbour has put the axe down but is very worked up and drunk. How do we proceed?')],
        [
          opt(
            'detain',
            T('Pidage kinni ähvardamise eest', 'Detain for threatening'),
            T('{callsign}, pidage kinni ähvardamise eest, kirves ära võtta. Relvaloa olemasolul relvad hoiule.', '{callsign}, detain him for threatening and take the axe. If he has a permit, take his guns into safekeeping.'),
            { success: 0.15, arrests: 1, time: 20 },
          ),
          opt(
            'talk',
            T('Rahustage, piirivaidlus kohtusse', 'Calm him down, boundary to court'),
            T('{callsign}, selgitage, et piirivaidlus lahendatakse kohtus. Kirves ära võtta, hoiatus.', '{callsign}, explain that boundary disputes go to court. Take the axe and give a warning.'),
            { success: 0, time: 10 },
          ),
        ],
        'talk',
      ),
      info(8, [
        T('{callsign}: piirkonnapolitseinik tunneb mõlemat poolt ja räägib nendega homme uuesti.', '{callsign}: the community officer knows both sides and will talk to them again tomorrow.'),
      ]),
    ],
    outcomes: [
      out(
        'detained',
        'arrest',
        [0.5, 1],
        3,
        T(
          'Naaber peeti kinni, kirves ja jahipüss võeti hoiule. Alustati kriminaalmenetlust KarS § 120 järgi ja relvaloa kehtetuks tunnistamise menetlust.',
          'The neighbour was detained and the axe and hunting rifle taken into safekeeping. Criminal proceedings were opened under KarS § 120, along with proceedings to revoke his weapons permit.',
        ),
        { arrests: 1, radio: T('{callsign}: naaber kinni, kirves ja püss hoiule võetud.', '{callsign}: neighbour detained, axe and rifle taken into safekeeping.') },
      ),
      out(
        'calmed',
        'warning',
        [0.4, 1],
        3,
        T(
          'Naaber rahunes, kirves võeti ära ja talle tehti hoiatus. Pooltele selgitati, kuidas piirivaidlus kohtus lahendada, piirkonnapolitseinik jätkab nendega suhtlemist.',
          'The neighbour calmed down, the axe was taken and he was warned. Both were told how to settle the boundary in court and the community officer will stay in touch.',
        ),
        { radio: T('{callsign}: naaber rahunes, kirves ära, hoiatus tehtud.', '{callsign}: neighbour calmed down, axe taken, warning given.') },
      ),
      out(
        'damage',
        'report',
        [0, 0.45],
        2,
        T(
          'Naaber lõhkus enne patrulli saabumist teataja auto tuled ja aia. Alustati kriminaalmenetlust KarS § 203 ja § 120 järgi.',
          'Before the patrol arrived the neighbour smashed the caller’s car lights and fence. Criminal proceedings were opened under KarS § 203 and § 120.',
        ),
        { radio: T('{callsign}: naaber lõhkus auto ja aia, menetlus alustatud.', '{callsign}: neighbour wrecked the car and fence, case opened.') },
      ),
      out(
        'injury',
        'hospital',
        [0, 0.2],
        1,
        T(
          'Tüli läks kätega kallale minekuks ja teataja sai kirvevarrega löögi. Ta toimetati haiglasse, naaber peeti kinni.',
          'The row came to blows and the caller was hit with the axe handle. The caller was taken to hospital and the neighbour detained.',
        ),
        { injuries: 1, arrests: 1, radio: T('{callsign}: teataja sai kirvevarrega löögi, haiglasse.', '{callsign}: caller hit with the axe handle, to hospital.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.4,
      toPriority: 2,
      text: T(
        'Teataja: naaber tuli üle piiri, lõi kirvega mu auto esitule katki ja tuleb maja poole.',
        'Caller: the neighbour has crossed the boundary, smashed my car headlight with the axe and is coming towards the house.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'angry',
      opening: [
        T('Naaber raiub kirvega mu aeda maha ja ähvardab! Ta on purjus!', 'The neighbour is chopping down my fence with an axe and making threats! He is drunk!'),
        T('Meil on naabriga piiritüli ja nüüd seisab ta kirvega mu aia juures. Ma kardan välja minna.', 'We have a boundary dispute with the neighbour and now he is standing by my fence with an axe. I am afraid to go out.'),
      ],
      answers: {
        weapons: [T('Tal on kirves. Kodus on tal ka jahipüss.', 'He has an axe. He has a hunting rifle at home too.')],
        intoxicated: [T('Ta on purjus, juba lõunast saati.', 'He is drunk, has been since lunchtime.')],
        safe: [T('Ma olen toas, uks on lukus.', 'I am indoors with the door locked.')],
      },
      answersRu: {
        weapons: ['У него топор. А дома у него ещё и охотничье ружьё.'],
        intoxicated: ['Он пьяный, с обеда уже.'],
        safe: ['Я в доме, дверь закрыта.'],
      },
      openingRu: [
        'Сосед рубит топором мой забор и угрожает! Он пьяный!',
        'У нас с соседом спор из-за границы участка, а теперь он стоит с топором у моего забора. Я боюсь выйти.',
      ],
    },
    tags: ['threat', 'neighbours'],
  },

  // 35. An owner tracks a stolen e-bike with a hidden tracker and wants to go in himself.
  {
    id: 'property_varastatud_elektriratas_jalgija',
    category: 'property',
    code: 'VG',
    title: T('Omanik jälitab varastatud elektriratast', 'Owner tracking a stolen e-bike'),
    priority: 3,
    weight: 0.9,
    months: [4, 5, 6, 7, 8, 9, 10],
    hours: 'evening',
    places: ['residential', 'street'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [25, 55],
    persons: [
      { role: 'caller', gender: 'M', age: [22, 55], known: true },
      { role: 'suspect', gender: 'M', age: [18, 40], record: 0.6, intoxicated: 0.3, wanted: 0.1 },
    ],
    summary: [
      T(
        '{address}. Teataja elektriratas varastati päeval ja rattasse peidetud jälgija näitab nüüd selle kortermaja asukohta. Teataja on maja ees ja tahab ise korterisse minna.',
        '{address}. The caller’s e-bike was stolen during the day and the tracker hidden in it now shows this block of flats. The caller is outside and wants to go into the flat himself.',
      ),
      T(
        '{address}. Varastatud elektriratta jälgija signaal tuleb keldriboksidest. Omanik ja tema sõber on kohal ja ootavad, kuni keegi välja tuleb.',
        '{address}. The signal from a stolen e-bike’s tracker is coming from the cellar storage units. The owner and a friend are outside waiting for someone to come out.',
      ),
    ],
    callerLines: [
      T('Mu ratas on siin majas, jälgija näitab täpselt seda trepikoda. See maksis kolm tuhat eurot!', 'My bike is in this building, the tracker shows exactly this stairwell. It cost three thousand euros!'),
      T('Üks tüüp tuli just välja ja vaatas meid. Me läheme nüüd sisse, kui te ei tule.', 'Some guy just came out and looked at us. We are going in now if you do not come.'),
    ],
    details: [
      T('Teataja sõber helistas veel kahele sõbrale, et need tuleksid ratast ära tooma.', 'The caller’s friend has phoned two more mates to come and fetch the bike.'),
      T('Selle trepikoja keldrist on varem leitud varastatud jalgrattaid.', 'Stolen bicycles have been found in this stairwell’s cellar before.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: omanik nõuab, et läheksime kohe korterisse. Jälgija näitab keldrit, mitte korterit. Kuidas toimime?',
            '{callsign}: the owner wants us to go straight into the flat. The tracker shows the cellar, not the flat. How do we proceed?',
          ),
        ],
        [
          opt(
            'cellar',
            T('Kontrollige koos korteriühistuga keldrit', 'Check the cellar with the housing association'),
            T('{callsign}, kutsuge korteriühistu esindaja ja kontrollige keldriboksid koos temaga. Korterisse ilma aluseta ei minda.', '{callsign}, call the housing association rep and check the cellar units with them. Nobody goes into a flat without grounds.'),
            { success: 0.15, time: 10 },
          ),
          opt(
            'door',
            T('Koputage korteri uksele', 'Knock on the flat door'),
            T('{callsign}, koputage uksele ja küsige ratta kohta, omanik jääb õue.', '{callsign}, knock on the door and ask about the bike, the owner stays outside.'),
            { success: 0.05, time: 5 },
          ),
        ],
        'door',
      ),
      qp('suspect', 5, [
        T(
          '{callsign}: korteriühistu andmetel kasutab seda keldriboksi {name}, isikukood {idcode}. Kontrolli palun.',
          '{callsign}: according to the housing association, that cellar unit is used by {name}, ID code {idcode}. Please check.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'found',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Ratas leiti keldriboksist koos kahe teise varastatud rattaga ja boksi kasutaja peeti kinni. Alustati kriminaalmenetlust KarS § 199 järgi.',
          'The bike was found in a cellar unit with two other stolen bikes and the unit’s user was detained. Criminal proceedings were opened under KarS § 199.',
        ),
        { arrests: 1, radio: T('{callsign}: ratas leitud keldrist, kahtlustatav kinni.', '{callsign}: bike found in the cellar, suspect detained.') },
      ),
      out(
        'returned',
        'report',
        [0.4, 0.85],
        2,
        T(
          'Ratas leiti trepialusest, kuhu see oli maha jäetud. Ratas tagastati omanikule ja varguse kohta alustati menetlust.',
          'The bike was found under the stairs where it had been dumped. It was returned to the owner and theft proceedings were opened.',
        ),
        { radio: T('{callsign}: ratas leitud trepi alt, omanikule tagastatud.', '{callsign}: bike found under the stairs, returned to the owner.') },
      ),
      out(
        'self_justice',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Omanik ja tema sõbrad läksid ise korterisse ja puhkes kaklus. Üks mees sai kangiga löögi ja toimetati haiglasse, menetlus alustati mõlema poole suhtes.',
          'The owner and his friends went into the flat themselves and a fight broke out. One man was hit with a crowbar and taken to hospital; proceedings were opened against both sides.',
        ),
        { injuries: 1, radio: T('{callsign}: omanik läks ise sisse, kaklus, üks haiglasse.', '{callsign}: the owner went in himself, a fight, one to hospital.') },
      ),
      out(
        'gone',
        'escaped',
        [0, 0.3],
        1,
        T(
          'Jälgija signaal kadus ja ratas viidi minema enne patrulli saabumist. Menetlus jätkub jälgija viimaste asukohtade põhjal.',
          'The tracker signal disappeared and the bike was moved before the patrol arrived. The case continues from the tracker’s last positions.',
        ),
        { radio: T('{callsign}: signaal kadus, ratas viidi minema.', '{callsign}: signal lost, the bike was moved.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.5,
      toPriority: 2,
      text: T(
        'Teataja: läksime trepikotta, keegi tuli korterist kangiga välja ja lööb mu sõpra!',
        'Caller: we went into the stairwell, someone came out of a flat with a crowbar and is hitting my friend!',
      ),
    },
    expiresMin: 75,
    interactiveChance: 0.25,
    call: {
      mood: 'angry',
      opening: [
        T('Mu varastatud elektriratas on selles majas, jälgija näitab seda! Kas te tulete või lähen ise sisse?', 'My stolen e-bike is in this building, the tracker shows it! Are you coming or shall I go in myself?'),
        T('Jälgija näitab mu ratast selle maja keldris. Ma tean, kes selle võttis, ta elab siin.', 'The tracker shows my bike in the cellar of this building. I know who took it, he lives here.'),
      ],
      answers: {
        count: [T('Mina ja üks sõber, kaks tuleb veel juurde.', 'Me and a friend, two more are on the way.')],
        suspect: [T('Üks noor tüüp tuli välja ja vaatas meid kahtlaselt.', 'A young guy came out and gave us a suspicious look.')],
        safe: [T('Me oleme maja ees, veel sisse läinud ei ole.', 'We are outside the building, we have not gone in yet.')],
      },
      answersRu: {
        count: ['Я и один друг, ещё двое подъедут.'],
        suspect: ['Какой-то молодой тип вышел и подозрительно на нас посмотрел.'],
        safe: ['Мы перед домом, внутрь ещё не заходили.'],
      },
      openingRu: [
        'Мой украденный электровелосипед в этом доме, трекер показывает! Вы приедете или мне самому зайти?',
        'Трекер показывает мой велосипед в подвале этого дома. Я знаю, кто его взял, он тут живёт.',
      ],
    },
    tags: ['theft'],
  },
];
