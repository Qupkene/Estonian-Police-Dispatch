// Isikuvastased süüteod: kaklused, ähvardamine, noa- ja relvaintsidendid, raskemad kuriteod.
import type { IncidentScenario, IncidentTemplate } from '@/sim/types';
import {
  T,
  backup,
  choice,
  info,
  k9Choice,
  kiirabi,
  agency,
  oc,
  opt,
  pursuit,
  qPerson,
  qVehicle,
  search,
  toArrest,
  un,
} from './_helpers_a';

// ─── Scenarios: one coherent story per incident (IncidentTemplate.scenarios) ──

// ── violence_bar_fight_outside ──────────────────────────────────────────────
const SC_BAR_FIGHT: IncidentScenario[] = [
  {
    id: 'group_brawl',
    summary: [
      T(
        '{address}. Baari ees kaklevad {n} noormeest, ühel on peast veri. Turvatöötajad on juures.',
        '{address}. {n} young men are fighting outside a bar and one has blood on his head. Door staff are there.',
      ),
      T(
        '{address}. Baari ees käib grupikaklus, turvatöötajad ei suuda osalisi lahutada. Üks noormees veritseb.',
        '{address}. A group brawl is going on outside a bar and the door staff cannot separate them. One young man is bleeding.',
      ),
    ],
    callerLines: [
      T(
        'Siin baari ees on kaklus, neli-viis tüüpi, üks on juba maas!',
        'There is a fight outside the bar, four or five guys, one is already down!',
      ),
      T(
        'Kiiresti, nad löövad teda jalaga, kui ta maas on!',
        'Hurry, they are kicking him while he is on the ground!',
      ),
    ],
    details: [
      T(
        'Turvatöötaja: lööja on {suspect}, käitub agressiivselt ja ähvardab.',
        'Door staff: the attacker is {suspect}, behaving aggressively and making threats.',
      ),
      T('Kakluses osaleb mitu joobes noormeest.', 'Several drunk young men are involved.'),
    ],
  },
  {
    id: 'man_on_ground',
    summary: [
      T(
        '{address}. Ööklubi ees kaklus, osalised joobes. Üks isik lamab maas, teadvusel.',
        '{address}. Fight outside a nightclub, those involved are drunk. One person is lying on the ground, conscious.',
      ),
      T(
        '{address}. Ööklubi ees lõi mees teist nii, et too kukkus ja lõi pea vastu kõnniteed. Lööja seisab lähedal.',
        '{address}. Outside a nightclub a man punched another who fell and hit his head on the pavement. The attacker is standing nearby.',
      ),
    ],
    callerLines: [
      T(
        'Üks mees lõi teist ja too kukkus selili, pea lõi vastu asfalti. Ta on teadvusel, aga ei tõuse.',
        'One man hit another and he fell backwards and hit his head on the tarmac. He is conscious but not getting up.',
      ),
      T(
        'Lööja seisab siinsamas ja suitsetab, nagu midagi poleks juhtunud.',
        'The man who hit him is standing right here smoking as if nothing happened.',
      ),
    ],
    details: [
      T(
        'Kannatanu lamab maas, peas muhk, teadvusel.',
        'The victim is lying on the ground with a lump on his head, conscious.',
      ),
      T('Lööja: {suspect}.', 'The attacker: {suspect}.'),
    ],
    agencies: [
      {
        agency: 'kiirabi',
        chance: 0.7,
        reason: T('Kannatanu lõi kukkudes pead', 'The victim hit his head when he fell'),
      },
    ],
  },
  {
    id: 'security_holding',
    summary: [
      T(
        '{address}. Turvatöötaja teatel löödi baari ees klienti rusikaga näkku. Lööja on veel kohal ja agressiivne.',
        '{address}. A doorman reports a customer was punched in the face outside the bar. The attacker is still there and aggressive.',
      ),
      T(
        '{address}. Turvatöötajad hoiavad kinni meest, kes lõi baari ees teist klienti. Mees rabeleb ja sõimab.',
        '{address}. Door staff are holding a man who hit another customer outside the bar. He is struggling and swearing.',
      ),
    ],
    callerLines: [
      T(
        'Ma olen siin turvamees. Üks klient lõi teist, me hoiame teda kinni, aga ta rabeleb.',
        'I am the doorman here. One customer hit another, we are holding him, but he is struggling.',
      ),
      T(
        'Kannatanul on kulm lõhki, ta istub sees baaris.',
        'The victim has a split eyebrow, he is sitting inside the bar.',
      ),
    ],
    callerLinesRu: [
      'Я тут охранник. Один клиент ударил другого, мы его держим, но он вырывается.',
      'У пострадавшего рассечена бровь, он сидит в баре.',
    ],
    details: [
      T(
        'Turvatöötaja: lööja on {suspect}, käitub agressiivselt ja ähvardab.',
        'Door staff: the attacker is {suspect}, behaving aggressively and making threats.',
      ),
      T('Baari valvekaamera salvestas löömise.', 'The bar’s CCTV recorded the assault.'),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, baari turvamees. Üks klient lõi teist, me hoiame teda kinni.',
          'Hello, bar security here. One customer hit another and we are holding him.',
        ),
      ],
      openingRu: ['Здравствуйте, охрана бара. Один клиент ударил другого, мы его держим.'],
      answers: {
        direction: [T('Ta ei lähe kuhugi, me hoiame teda.', 'He is not going anywhere, we are holding him.')],
        injured: [
          T('Kannatanul on kulm lõhki, veritseb natuke.', 'The victim has a split eyebrow, bleeding a bit.'),
        ],
        weapons: [T('Relva ei olnud, ta lõi rusikaga.', 'No weapon, he punched him.')],
      },
      answersRu: {
        direction: ['Никуда он не денется, мы его держим.'],
        injured: ['У пострадавшего рассечена бровь, немного кровь идёт.'],
        weapons: ['Оружия не было, он ударил кулаком.'],
      },
    },
    tags: ['detained'],
  },
  {
    id: 'kebab_queue',
    title: T('Kaklus kiirtoidukoha järjekorras', 'Fight in a takeaway queue'),
    summary: [
      T(
        '{address}. Kiirtoidukoha järjekorras läks kahe mehe vahel kakluseks, üks lõi teist pudeliga. Kannatanu veritseb.',
        '{address}. A fight broke out between two men in a takeaway queue and one hit the other with a bottle. The victim is bleeding.',
      ),
      T(
        '{address}. Ööklubist tulnud noored kaklevad kiirtoidukoha ees järjekorra pärast, müüja pani ukse lukku.',
        '{address}. Young people coming from a nightclub are fighting over the queue outside a takeaway and the server has locked the door.',
      ),
    ],
    callerLines: [
      T(
        'Nad läksid järjekorra pärast tülli ja üks lõi teist pudeliga pähe!',
        'They started arguing about the queue and one hit the other over the head with a bottle!',
      ),
      T(
        'Ma panin ukse lukku, nad kaklevad meie akna taga.',
        'I have locked the door, they are fighting right outside our window.',
      ),
    ],
    callerLinesRu: [
      'Они поругались из-за очереди, и один ударил другого бутылкой по голове!',
      'Я {закрыл|закрыла} дверь, они дерутся прямо у нас под окном.',
    ],
    details: [
      T('Teataja on kiirtoidukoha töötaja.', 'The caller works at the takeaway.'),
      T(
        'Lööja: {suspect}. Purustatud pudel on maas.',
        'The attacker: {suspect}. A broken bottle is on the ground.',
      ),
    ],
    agencies: [
      { agency: 'kiirabi', chance: 0.6, reason: T('Löök pudeliga pähe', 'Hit on the head with a bottle') },
    ],
    call: {
      mood: 'panic',
      opening: [
        T(
          'Kiirtoidukoha ees kaklevad mehed, üks lõi teist pudeliga!',
          'Men are fighting outside the takeaway, one hit the other with a bottle!',
        ),
      ],
      openingRu: ['У фастфуда дерутся мужчины, один ударил другого бутылкой!'],
      answers: {
        weapons: [T('Pudel, see on nüüd katki maas.', 'A bottle, it is broken on the ground now.')],
        injured: [T('Ühel jookseb peast verd.', 'One of them has blood running from his head.')],
        safe: [T('Jah, ma olen sees, uks on lukus.', 'Yes, I am inside and the door is locked.')],
      },
      answersRu: {
        weapons: ['Бутылка, теперь она разбитая на земле валяется.'],
        injured: ['У одного кровь из головы идёт.'],
        safe: ['Да, я внутри, дверь закрыта.'],
      },
    },
  },
];

// ── violence_threatening ────────────────────────────────────────────────────
const SC_THREATENING: IncidentScenario[] = [
  {
    id: 'neighbour_fire_threat',
    summary: [
      T(
        '{address}. Teataja sõnul ähvardas naaber teda tappa ja lubas maja põlema panna. Ähvardaja on hetkel oma korteris.',
        '{address}. The caller says a neighbour threatened to kill him and to set the building on fire. The man is in his flat at the moment.',
      ),
      T(
        '{address}. Naabrite vahelises tülis lubas mees teataja korteri koos temaga põlema panna. Ähvardaja on kodus.',
        '{address}. In a row between neighbours the man said he would set fire to the caller’s flat with the caller inside. He is at home.',
      ),
    ],
    callerLines: [
      T(
        'Naaber ütles otse, et tapab mu ära. Ma ei julge enam uksest välja minna.',
        'My neighbour said straight out that he would kill me. I do not dare go out of the door any more.',
      ),
      T(
        'Ta ütles, et paneb mu korteri põlema, kui ma veel kord tema auto pärast kaeban.',
        'He said he would set my flat on fire if I complain about his car once more.',
      ),
    ],
    details: [
      T(
        'Ähvardaja on {suspect}. Varem on olnud tülisid parkimise ja müra pärast.',
        'The man making threats is {suspect}. There have been rows about parking and noise before.',
      ),
      T(
        'Ähvardus öeldi trepikojas, pealt kuulis veel üks naaber.',
        'The threat was made in the stairwell and another neighbour overheard it.',
      ),
    ],
  },
  {
    id: 'messages_acquaintance',
    persons: [
      { role: 'victim', gender: 'any', age: [20, 70] },
      {
        role: 'suspect',
        gender: 'M',
        age: [20, 60],
        record: 0.4,
        intoxicated: 0.3,
        relation: 'friend',
        known: true,
      },
    ],
    summary: [
      T(
        '{address}. Tuttav mees ähvardab teatajat sõnumite ja kõnedega, lubab tulla kohale asja klaarima.',
        '{address}. A man the caller knows is threatening them with messages and calls, saying he will come round to settle things.',
      ),
      T(
        '{address}. Teataja saab juba kolmandat päeva ähvardavaid sõnumeid endiselt tuttavalt, viimases on tema kodu foto.',
        '{address}. The caller has been getting threatening messages from a former acquaintance for three days; the latest has a photo of their home.',
      ),
    ],
    callerLines: [
      T(
        'Ta saadab mulle juba kolmandat päeva sõnumeid, et teab, kus ma elan.',
        'He has been sending me messages for three days saying he knows where I live.',
      ),
      T(
        'Viimases sõnumis oli pilt minu maja uksest. Ta on siin käinud!',
        'The last message had a picture of my front door. He has been here!',
      ),
    ],
    callerLinesRu: [
      'Он уже третий день пишет мне, что знает, где я живу.',
      'В последнем сообщении было фото двери моего дома. Он тут был!',
    ],
    details: [
      T('Teataja on ähvardavad sõnumid salvestanud.', 'The caller has saved the threatening messages.'),
      T(
        'Ähvardaja on {suspect}, vaidlus käib laenatud raha üle.',
        'The man making threats is {suspect}; the dispute is about borrowed money.',
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Üks tuttav saadab mulle ähvardavaid sõnumeid ja saatis pildi minu kodust.',
          'Hello. Someone I know is sending me threatening messages and sent a picture of my home.',
        ),
      ],
      openingRu: ['Здравствуйте. Знакомый присылает мне угрозы и прислал фото моего дома.'],
      answers: {
        suspect: [
          T('Endine tuttav, me olime koos tööl.', 'A former acquaintance, we used to work together.'),
        ],
        weapons: [
          T(
            'Ma ei tea, ta on kirjutanud, et tal on "mida näidata".',
            'I do not know, he wrote that he has "something to show me".',
          ),
        ],
        safe: [T('Ma olen kodus, uks on lukus.', 'I am at home with the door locked.')],
      },
      answersRu: {
        suspect: ['Бывший знакомый, мы вместе работали.'],
        weapons: ['Не знаю, он написал, что ему есть «что показать».'],
        safe: ['Я дома, дверь закрыта.'],
      },
    },
  },
  {
    id: 'stairwell_drunk',
    summary: [
      T(
        '{address}. Trepikojas ähvardas joobes mees teatajat peksta ja läks seejärel oma korterisse. Relvi ei nähtud.',
        '{address}. A drunk man threatened to beat up the caller in the stairwell and then went into his flat. No weapons seen.',
      ),
      T(
        '{address}. Joobes naaber blokeeris trepikojas teataja tee ja ähvardas talle "näkku anda". Mees on nüüd oma korteris.',
        '{address}. A drunk neighbour blocked the caller’s way in the stairwell and threatened to "smash his face in". The man is in his flat now.',
      ),
    ],
    callerLines: [
      T(
        'Ta tuli trepil vastu, purjus, ja ütles, et kui ma veel kord ta ukse taga seisan, siis ta peksab mu läbi.',
        'I met him on the stairs, drunk, and he said that if I stand outside his door once more he will beat me up.',
      ),
      T('Ma ei saanud isegi aru, mida ma valesti tegin.', 'I did not even understand what I had done wrong.'),
    ],
    details: [
      T('Ähvardaja on {suspect}, tugevas joobes.', 'The man making threats is {suspect}, heavily drunk.'),
      T('Mees on oma korteris, uks on lukus.', 'The man is in his flat with the door locked.'),
    ],
  },
  {
    id: 'debt_partner',
    title: T('Ähvardamine võla pärast', 'Threats over a debt'),
    persons: [
      { role: 'victim', gender: 'any', age: [28, 65] },
      {
        role: 'suspect',
        gender: 'M',
        age: [28, 60],
        record: 0.55,
        intoxicated: 0.2,
        relation: 'stranger',
        known: true,
        weapon: 0.08,
      },
    ],
    summary: [
      T(
        '{address}. Teataja sõnul ähvardab endine äripartner teda seoses võlaga ja seisis täna tema maja ees. Ähvardaja on autos.',
        '{address}. The caller says a former business partner is threatening them over a debt and was standing outside their house today. The man is in his car.',
      ),
      T(
        '{address}. Võlgnevuse pärast tülli läinud äripartner lubas teataja lapsed kooli juurest "ära korjata". Mees istub maja ees autos.',
        '{address}. A business partner the caller fell out with over a debt said he would "pick up" the caller’s children from school. He is sitting in a car outside the house.',
      ),
    ],
    callerLines: [
      T(
        'Ta ütles, et kui ma raha reedeks ei maksa, siis tunnen ma seda omal nahal. Nüüd istub ta mu maja ees.',
        'He said if I do not pay the money by Friday I will feel it myself. Now he is sitting outside my house.',
      ),
      T(
        'Ta mainis mu lapsi. See ei ole enam äritüli.',
        'He mentioned my children. This is not a business dispute any more.',
      ),
    ],
    callerLinesRu: [
      'Он сказал, что если я не верну деньги до пятницы, то почувствую на своей шкуре. А теперь сидит у моего дома.',
      'Он упомянул моих детей. Это уже не деловой спор.',
    ],
    details: [
      T(
        'Ähvardaja on {suspect}, istub maja ees autos.',
        'The man making threats is {suspect}, sitting in a car outside the house.',
      ),
      T('Vaidlus puudutab äritehingust jäänud võlga.', 'The dispute concerns a debt from a business deal.'),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.35, 1],
        3,
        T(
          'Võeti vastu avaldus ja alustati kriminaalmenetlust ähvardamise eest (KarS § 120). Võlavaidlus jääb lahendada tsiviilkorras.',
          'A complaint was taken and criminal proceedings were opened for threats (KarS § 120). The debt dispute is left to be settled as a civil matter.',
        ),
        { trust: 2 },
      ),
      oc(
        'arrest',
        'arrest',
        [0.7, 1],
        2,
        T(
          'Ähvardaja peeti kinni, autost leiti teleskoopnui. Alustati kriminaalmenetlust KarS § 120 järgi.',
          'The man was detained and a telescopic baton was found in his car. Criminal proceedings were opened under KarS § 120.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'drove_off',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees sõitis patrulli nähes minema. Teatajale anti nõu ja ähvardaja kutsutakse ülekuulamisele.',
          'The man drove off when he saw the patrol. The caller was given advice and the man will be summoned for questioning.',
        ),
        { trust: -1 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Mu endine äripartner ähvardab mind ja istub praegu mu maja ees autos.',
          'Hello. My former business partner is threatening me and is sitting in a car outside my house right now.',
        ),
      ],
      openingRu: ['Здравствуйте. Бывший деловой партнёр мне угрожает и сейчас сидит в машине у моего дома.'],
      answers: {
        suspect: [
          T('Endine äripartner, ma olen talle raha võlgu.', 'A former business partner, I owe him money.'),
        ],
        weapons: [
          T(
            'Ma ei tea, aga ta on varem relvaga hoobelnud.',
            'I do not know, but he has bragged about a gun before.',
          ),
        ],
        children: [T('Lapsed on kodus minuga.', 'The children are at home with me.')],
      },
      answersRu: {
        suspect: ['Бывший деловой партнёр, я ему деньги {должен|должна}.'],
        weapons: ['Не знаю, но он раньше хвастался пистолетом.'],
        children: ['Дети дома, со мной.'],
      },
    },
  },
  {
    id: 'road_rage_home',
    title: T('Ähvardamine pärast liiklustüli', 'Threats after a road rage incident'),
    persons: [
      { role: 'victim', gender: 'any', age: [22, 70] },
      { role: 'suspect', gender: 'M', age: [22, 55], record: 0.45, intoxicated: 0.15, relation: 'stranger' },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
    summary: [
      T(
        '{address}. Teataja sõnul järgnes liiklustüli teine osapool talle koju ja ähvardab nüüd maja ees peksta. Sõiduk: {car}.',
        '{address}. The caller says the other driver from a road rage incident followed them home and is now threatening to beat them up outside the house. Vehicle: {car}.',
      ),
      T(
        '{address}. Võõras juht sõitis teatajale koju järele, peksab rusikaga auto katust ja karjub ähvardusi. Teataja on majas.',
        '{address}. A stranger drove after the caller to their home and is pounding on the car roof and shouting threats. The caller is inside the house.',
      ),
    ],
    callerLines: [
      T(
        'Ma signaalitasin talle ristmikul ja ta sõitis mulle koju järele! Nüüd seisab ta maja ees ja karjub.',
        'I honked at him at a junction and he followed me home! Now he is standing outside the house shouting.',
      ),
      T('Ta lubas mu läbi peksta, kui ma välja tulen.', 'He said he would beat me up if I come out.'),
    ],
    callerLinesRu: [
      'Я ему посигналил{|а} на перекрёстке, а он поехал за мной до дома! Теперь стоит у дома и орёт.',
      'Он сказал, что изобьёт меня, если я выйду.',
    ],
    details: [
      T('Ähvardaja: {suspect}.', 'The man making threats: {suspect}.'),
      T('Ähvardaja sõiduk: {car}, reg nr {plate}.', 'His vehicle: {car}, plate {plate}.'),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.35, 1],
        3,
        T(
          'Võeti vastu avaldus, alustati kriminaalmenetlust ähvardamise eest (KarS § 120). Juhti hoiatati ja ta lahkus.',
          'A complaint was taken and criminal proceedings were opened for threats (KarS § 120). The driver was warned and left.',
        ),
        { trust: 2 },
      ),
      oc(
        'arrest',
        'arrest',
        [0.7, 1],
        2,
        T(
          'Juht peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 120 järgi.',
          'The driver was detained and taken to the arrest house. Criminal proceedings were opened under KarS § 120.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'left',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Juht sõitis enne patrulli saabumist minema. Numbrimärgi järgi alustati menetlust ähvardamise kohta.',
          'The driver left before the patrol arrived. Proceedings for threats were opened using the number plate.',
        ),
        { trust: -1 },
      ),
    ],
    beats: [
      qVehicle('arrive'),
      qPerson('suspect', 2),
      choice(
        8,
        [
          T(
            '{callsign}: juht väidab, et tahtis ainult rääkida. Teataja kardab välja tulla. Kas peame kinni või vormistame avalduse?',
            '{callsign}: the driver claims he only wanted to talk. The caller is afraid to come out. Do we detain him or take a statement?',
          ),
        ],
        [
          opt(
            'detain',
            T('Pidage kinni', 'Detain him'),
            T(
              '{callsign}, juhtimine. Pidage kinni ähvardamise eest.',
              '{callsign}, Control. Detain him for making threats.',
            ),
            { success: 0.1, arrests: 1, time: 20 },
          ),
          opt(
            'report',
            T('Võtke avaldus, saatke ta minema', 'Take a statement, send him away'),
            T(
              '{callsign}, juhtimine. Vormistage avaldus ja saatke ta minema.',
              '{callsign}, Control. Take a statement and send him on his way.',
            ),
            { success: 0.05, time: 10 },
          ),
        ],
        'report',
      ),
    ],
    call: {
      mood: 'panic',
      opening: [
        T(
          'Üks juht sõitis mulle koju järele ja ähvardab mind peksta!',
          'A driver followed me home and is threatening to beat me up!',
        ),
      ],
      openingRu: ['Водитель поехал за мной до дома и грозится избить!'],
      answers: {
        vehicle: [
          T(
            '{car}, number {plate}. See seisab mu maja ees.',
            '{car}, plate {plate}. It is parked outside my house.',
          ),
        ],
        safe: [T('Ma olen majas, uks on lukus.', 'I am in the house with the door locked.')],
        weapons: [T('Ma ei näinud relva.', 'I did not see a weapon.')],
      },
      answersRu: {
        vehicle: ['{car}, номер {plate}. Стоит у моего дома.'],
        safe: ['Я в доме, дверь закрыта.'],
        weapons: ['Оружия я не {видел|видела}.'],
      },
    },
  },
];

export const TEMPLATES_VIOLENCE: IncidentTemplate[] = [
  // ─── Legacy ───────────────────────────────────────────────────────────────
  {
    id: 'violence_street_stabbing',
    category: 'violence',
    code: 'NR',
    title: T('Pussitamine tänaval', 'Street stabbing'),
    priority: 1,
    weight: 0.1,
    hours: 'nightlife',
    weekendBoost: 1.6,
    places: ['street', 'park', 'busstation', 'oldtown'],
    units: { need: [un('any', 2)], ideal: [un('rapid', 1), un('patrol', 1)] },
    onScene: [60, 120],
    persons: [
      { role: 'victim', gender: 'M', age: [18, 50], intoxicated: 0.5, record: 0.3 },
      {
        role: 'suspect',
        gender: 'M',
        age: [17, 40],
        record: 0.6,
        wanted: 0.12,
        intoxicated: 0.6,
        relation: 'stranger',
      },
      { role: 'witness', gender: 'any', age: [18, 70] },
    ],
    summary: [
      T(
        '{address}. Tänaval toimunud kakluse käigus sai üks isik noaga haavata, ründaja on põgenenud. Kannatanu teadvusel, veritseb. Kiirabi väljas.',
        '{address}. During a street fight one person was stabbed; the attacker has fled. Victim conscious, bleeding. Ambulance dispatched.',
      ),
      T(
        '{address}. Möödujate teatel lamab mees kõnniteel, kõhul torkehaav. Ründaja lahkus jalgsi {direction}.',
        '{address}. Passers-by report a man lying on the pavement with a stab wound to the abdomen. Attacker left on foot {direction}.',
      ),
      T(
        '{address}. Kahe seltskonna tüli käigus kasutati nuga, üks vigastatu. Kahtlustatav lahkus sündmuskohalt, relv tõenäoliselt kaasas.',
        '{address}. A knife was used in a quarrel between two groups; one injured. Suspect left the scene, probably still armed.',
      ),
    ],
    callerLines: [
      T(
        'Siin pussitati meest! Ta veritseb kõvasti, tulge kiiresti!',
        'A man has been stabbed here! He is bleeding badly, come quickly!',
      ),
      T(
        'Nad kaklesid ja siis üks võttis noa välja... see tüüp jooksis ära, mees lamab maas!',
        'They were fighting and then one pulled a knife... that guy ran off, the man is on the ground!',
      ),
      T(
        'Ma surun haava kinni, aga verd tuleb palju. Ründaja jooksis {direction}.',
        'I am pressing on the wound but there is a lot of blood. The attacker ran {direction}.',
      ),
    ],
    details: [
      T(
        'Tunnistaja kirjeldab ründajat: {suspect}. Nuga viis ta endaga kaasa.',
        'A witness describes the attacker: {suspect}. He took the knife with him.',
      ),
      T(
        'Kannatanu sõnul on ründaja talle tuttav, nimi {suspectName}.',
        'The victim says he knows the attacker, name {suspectName}.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Torkehaav', 'Stab wound') }],
    beats: [
      kiirabi('arrive', {
        radio: [
          T(
            '{callsign}, kohal. Mehel torkehaav, anname esmaabi. Kiirabi on hädasti vaja!',
            '{callsign}, on scene. Man with a stab wound, giving first aid. We urgently need the ambulance!',
          ),
        ],
      }),
      backup(0.85, un('rapid'), {
        radio: [
          T(
            '{callsign}: ründaja võib olla läheduses ja relvastatud, vajame kiirreageerijaid!',
            '{callsign}: the attacker may be nearby and armed, we need rapid response!',
          ),
        ],
      }),
      k9Choice(6, 0.6),
      qPerson('victim', 12, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'caught',
        'arrest',
        [0.7, 1],
        3,
        T(
          'Kahtlustatav tabati lähiümbrusest, nuga leiti. Isik peeti kinni, alustati kriminaalmenetlust KarS § 118 järgi.',
          'The suspect was caught nearby and the knife recovered. He was detained; criminal proceedings opened under KarS § 118.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'identified',
        'report',
        [0.4, 0.75],
        3,
        T(
          'Kannatanu toimetati haiglasse. Kahtlustatav on tuvastatud, kuid tabamata. Alustati kriminaalmenetlust, isik kuulutatakse tagaotsitavaks.',
          'The victim was taken to hospital. The suspect is identified but still at large. Criminal proceedings opened; he will be put on the wanted list.',
        ),
        { injuries: 1 },
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.45],
        2,
        T(
          'Ründaja põgenes, tunnistajad ei oska teda kirjeldada. Kannatanu viidi haiglasse raskes seisundis.',
          'The attacker escaped and witnesses cannot describe him. The victim was taken to hospital in a serious condition.',
        ),
        { injuries: 1, trust: -3 },
      ),
      oc(
        'died',
        'tragedy',
        [0, 0.2],
        1,
        T(
          'Kannatanu suri haiglas saadud vigastustesse. Kriminaalmenetlus jätkub tapmisena (KarS § 113).',
          'The victim died of his injuries in hospital. The case continues as manslaughter (KarS § 113).',
        ),
        { injuries: 1, trust: -6 },
      ),
    ],
    interactiveChance: 0.4,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Häirekeskus? Siin pussitati inimest, ta veritseb!',
          'Emergency? Someone has been stabbed here, he is bleeding!',
        ),
        T(
          'Palun kiiresti, mees sai noaga, ta lamab maas!',
          'Please hurry, a man got knifed, he is lying on the ground!',
        ),
      ],
      openingRu: [
        'Алло, тут человека ножом ударили, он весь в крови!',
        'Скорее, мужчину порезали, он лежит на земле!',
      ],
      answers: {
        where: [T('{address}, poe vastas tänaval!', '{address}, in the street opposite the shop!')],
        injured: [
          T(
            'Kõhus on haav, verd tuleb palju. Ta on teadvusel, aga kahvatu.',
            'There is a wound in his belly, lots of blood. He is conscious but pale.',
          ),
        ],
        weapons: [
          T('Ründajal oli nuga, ta viis selle kaasa.', 'The attacker had a knife, he took it with him.'),
        ],
        suspect: [T('Noor mees, tume jope, kapuuts peas.', 'Young man, dark jacket, hood up.')],
        direction: [T('Ta jooksis {direction}.', 'He ran {direction}.')],
        safe: [
          T(
            'Ründaja on läinud, aga ma kardan, et ta tuleb tagasi.',
            'The attacker is gone, but I am afraid he will come back.',
          ),
        ],
      },
      answersRu: {
        where: ['{address}, на улице напротив магазина!'],
        injured: ['Рана в животе, крови очень много. Он в сознании, но бледный.'],
        weapons: ['У нападавшего был нож, он его с собой забрал.'],
        suspect: ['Молодой парень, тёмная куртка, капюшон на голове.'],
        direction: ['Он побежал {direction}.'],
        safe: ['Нападавший ушёл, но я боюсь, что он вернётся.'],
      },
    },
    tags: ['armed', 'weapon_knife', 'bolo'],
    legacy: true,
  },
  {
    id: 'violence_sports_fight',
    category: 'violence',
    code: 'KV',
    title: T('Spordivõistlusel kaklus', 'Fight at a sports match'),
    priority: 3,
    weight: 0.25,
    hours: 'day',
    weekendBoost: 1.5,
    seasons: ['spring', 'summer', 'autumn'],
    places: ['stadium', 'park', 'school'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 2)] },
    onScene: [30, 60],
    persons: [
      { role: 'suspect', gender: 'M', age: [16, 40], record: 0.2, intoxicated: 0.15, relation: 'stranger' },
      { role: 'victim', gender: 'M', age: [16, 40] },
      { role: 'witness', gender: 'any', age: [25, 60], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Jalgpallimängul puhkes kaklus, üks mängija lõi teist rusikaga näkku. Kannatanul ninaverejooks, mängijad vaidlevad edasi.',
        '{address}. A fight broke out at a football match; one player punched another in the face. Victim has a nosebleed, players are still arguing.',
      ),
      T(
        '{address}. Amatöörliiga mängu ajal tekkis platsil kähmlus, millega liitusid ka pealtvaatajad. Kohtunik katkestas mängu.',
        '{address}. A scuffle broke out during an amateur league match and spectators joined in. The referee has stopped the game.',
      ),
    ],
    callerLines: [
      T(
        'Ma olen siin kohtunik. Üks mängija lõi teist rusikaga näkku, nüüd on kogu meeskond platsil!',
        'I am the referee. One player punched another in the face, now the whole team is on the pitch!',
      ),
      T(
        'Tulge palun, jalgpalliväljakul läks kakluseks, juba vanemad karjuvad ka!',
        'Please come, it has turned into a fight on the football pitch, now the parents are shouting too!',
      ),
    ],
    details: [
      T(
        'Lööja on {suspect}. Ta on endiselt platsi ääres ja käitub ähvardavalt.',
        'The player who threw the punch is {suspect}. He is still by the pitch and behaving threateningly.',
      ),
      T(
        'Kannatanu soovib avaldust teha, juhtum on filmitud.',
        'The victim wants to file a complaint; the incident was filmed.',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive'),
      backup(0.15, un('patrol'), {
        radio: [
          T(
            '{callsign}: pealtvaatajad lähevad kokku, vajame teist patrulli!',
            '{callsign}: spectators are squaring up, we need a second patrol!',
          ),
        ],
      }),
      kiirabi(4, {
        chance: 0.3,
        radio: [
          T(
            '{callsign}: kannatanu nina võib olla murtud, palun kiirabi.',
            '{callsign}: the victim may have a broken nose, request an ambulance.',
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
          'Lööja isik tuvastati, kannatanult võeti avaldus. Alustati kriminaalmenetlust KarS § 121 järgi, video lisati toimikusse.',
          'The player who threw the punch was identified and the victim filed a complaint. Criminal proceedings opened under KarS § 121; the video was added to the file.',
        ),
      ),
      oc(
        'detained',
        'arrest',
        [0.75, 1],
        1,
        T(
          'Lööja ründas ka korraldajat ega allunud korraldustele. Ta peeti kinni ja toimetati arestimajja.',
          'The player also attacked an organiser and ignored orders. He was detained and taken to the arrest house.',
        ),
        { arrests: 1 },
      ),
      oc(
        'warning',
        'warning',
        [0.25, 0.6],
        2,
        T(
          'Osalised rahunesid, kannatanu avaldust ei soovinud. Korraldajatele selgitati turvanõudeid, lööjat hoiatati.',
          'The parties calmed down and the victim did not want to press charges. Organisers were briefed on safety rules and the player was warned.',
        ),
      ),
      oc(
        'gone',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Lööja lahkus enne politsei saabumist, meeskonnakaaslased tema nime ei avalda.',
          'The player who threw the punch left before police arrived and his teammates will not give his name.',
        ),
        { trust: -1 },
      ),
    ],
    escalation: {
      afterMin: 25,
      chance: 0.15,
      toPriority: 2,
      text: T(
        'Teataja: kaklus laienes pealtvaatajate vahele, üks inimene lamab maas.',
        'Caller: the fight has spread to the spectators, one person is on the ground.',
      ),
    },
    tags: ['sport'],
    legacy: true,
  },
  {
    id: 'violence_three_bodies',
    category: 'violence',
    code: 'TP',
    title: T('Elumajast leiti kolm surnukeha', 'Three bodies found in a house'),
    priority: 2,
    weight: 0.003,
    hours: 'day',
    places: ['house', 'residential'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 1), un('criminal', 1)] },
    onScene: [90, 150],
    persons: [
      { role: 'deceased', gender: 'any', age: [30, 70] },
      {
        role: 'suspect',
        gender: 'M',
        age: [25, 55],
        relation: 'friend',
        known: true,
        record: 0.6,
        wanted: 0.25,
        intoxicated: 0.3,
      },
      { role: 'caller', gender: 'any', age: [40, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naaber märkas, et peret pole päevi näha olnud. Patrull leidis majast kolme pereliikme surnukehad, vägivallatunnustega. Tapmises kahtlustatakse peretuttavat.',
        '{address}. A neighbour noticed the family had not been seen for days. The patrol found the bodies of three family members showing signs of violence. A family acquaintance is suspected.',
      ),
      T(
        '{address}. Naabri pöördumise peale avatud elumajast leiti kolm surnukeha. Kuriteo tunnused, sündmuskoht vajab piiramist.',
        '{address}. Three bodies were found in a house opened after a neighbour raised the alarm. Signs of a crime; the scene must be cordoned off.',
      ),
    ],
    callerLines: [
      T(
        'Ma ei ole naabreid nädal aega näinud, auto seisab, koer haugub majas... midagi on väga valesti.',
        'I have not seen the neighbours for a week, the car is parked, the dog is barking inside... something is very wrong.',
      ),
      T(
        'Vaatasin aknast sisse ja... seal lamab keegi põrandal. Palun tulge.',
        'I looked in through the window and... someone is lying on the floor. Please come.',
      ),
    ],
    details: [
      T(
        'Naabrite sõnul käis peres sageli peretuttav {suspectName}, kellega oli hiljuti raha pärast tüli.',
        'Neighbours say a family acquaintance, {suspectName}, visited often and recently quarrelled with them over money.',
      ),
      T('Majast puuduvad perekonna auto ja sularaha.', 'The family car and cash are missing from the house.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Surma tuvastamine', 'Confirming death') }],
    beats: [
      info('arrive', [
        T(
          '{callsign}: majas kolm surnut, vägivallatunnused. Piirame sündmuskoha, keegi sisse ei lähe.',
          '{callsign}: three dead in the house, signs of violence. Cordoning off the scene, nobody goes in.',
        ),
      ]),
      backup(0.76, un('criminal'), { at: 3, timeoutMin: 8 }),
      qPerson('suspect', 20, {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Naabrid nimetavad peretuttavat: {name}, isikukood {idcode}. Palun kontrolli, kas on tagaotsitav.',
            'Control, {callsign}. Neighbours name a family acquaintance: {name}, ID code {idcode}. Please check for warrants.',
          ),
        ],
      }),
      choice(
        30,
        [
          T(
            '{callsign}: kahtlustatava elukoht on teada. Kas läheme kohe kinni pidama või ootame kiirreageerijaid?',
            '{callsign}: the suspect’s home address is known. Do we go in now or wait for rapid response?',
          ),
        ],
        [
          opt(
            'now',
            T('Pidage kohe kinni', 'Detain now'),
            T(
              '{callsign}, juhtimine. Minge, olge ettevaatlikud.',
              '{callsign}, Control. Go ahead, be careful.',
            ),
            { success: 0.05, risk: 0.15 },
          ),
          opt(
            'wait',
            T('Oodake kiirreageerijaid', 'Wait for rapid response'),
            T(
              '{callsign}, juhtimine. Jälgige maja, kiirreageerijad suunatud.',
              '{callsign}, Control. Watch the house, rapid response is on its way.',
            ),
            { success: 0.1, time: 20 },
          ),
        ],
        'wait',
      ),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        3,
        T(
          'Kahtlustatav peeti samal õhtul kinni. Alustati kriminaalmenetlust KarS § 114 järgi, lähedastele pakuti kriisiabi.',
          'The suspect was detained the same evening. Criminal proceedings opened under KarS § 114; relatives were offered crisis support.',
        ),
        { arrests: 1, trust: 5 },
      ),
      oc(
        'wanted',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Sündmuskoht vormistati, kriminalistid kogusid jälgi. Kahtlustatav kuulutati tagaotsitavaks.',
          'The scene was processed and forensics collected evidence. The suspect has been put on the wanted list.',
        ),
      ),
      oc(
        'fled',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Kahtlustatav jõudis piirkonnast lahkuda, tema telefon on välja lülitatud. Otsingud jätkuvad üle Eesti.',
          'The suspect managed to leave the area and his phone is switched off. A nationwide search continues.',
        ),
        { trust: -4 },
      ),
      oc(
        'compromised',
        'report',
        [0, 0.2],
        1,
        T(
          'Sündmuskohta ei piiratud õigeaegselt, osa jälgi hävis. Uurimine on raskendatud.',
          'The scene was not cordoned off in time and some evidence was lost. The investigation is hampered.',
        ),
        { trust: -5 },
      ),
    ],
    tags: ['homicide', 'major_crime'],
    legacy: true,
  },
  {
    id: 'violence_motel_killing',
    category: 'violence',
    code: 'TP',
    title: T('Tapmine motellis', 'Killing at a motel'),
    priority: 2,
    weight: 0.008,
    hours: 'night',
    places: ['hotel'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 1), un('criminal', 1)] },
    onScene: [80, 140],
    persons: [
      { role: 'deceased', gender: 'M', age: [20, 45], record: 0.7 },
      { role: 'suspect', gender: 'M', age: [20, 45], record: 0.8, wanted: 0.2 },
      { role: 'witness', gender: 'any', age: [20, 60], relation: 'employee' },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', stolen: 0.2, driverRole: 'suspect' }],
    summary: [
      T(
        '{place}, {address}. Koristaja leidis motellitoast elutu mehe, ruumis on vägivalla jäljed. Kahtlustatakse ebaõnnestunud narkotehingut.',
        '{place}, {address}. A cleaner found a lifeless man in a motel room with signs of violence. A drug deal gone wrong is suspected.',
      ),
      T(
        '{place}, {address}. Administraatori teatel kostis toast öösel karjumist, hommikul leiti külastaja surnuna. Tema kaaslane on kadunud.',
        '{place}, {address}. The receptionist says shouting was heard from a room at night; in the morning the guest was found dead. His companion is gone.',
      ),
    ],
    callerLines: [
      T(
        'Siin motellis... koristaja leidis toast mehe, ta ei hinga. Seal on igal pool verd.',
        'Here at the motel... the cleaner found a man in a room, he is not breathing. There is blood everywhere.',
      ),
      T(
        'Öösel oli sealt toast kära, aga ma arvasin, et nad lihtsalt joovad. Nüüd ma ei tea, mida teha.',
        'There was noise from that room at night, but I thought they were just drinking. Now I do not know what to do.',
      ),
    ],
    details: [
      T(
        'Valvekaamera salvestisel lahkub toast mees, {suspect}, ja sõidab autoga minema. Auto: {car}, {plate}.',
        'CCTV shows a man, {suspect}, leaving the room and driving off in a {car} ({plate}).',
      ),
      T(
        'Toast leiti kaal ja minigrip-kotid valge pulbriga.',
        'Scales and small zip bags with white powder were found in the room.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Surma tuvastamine', 'Confirming death') }],
    beats: [
      info('arrive', [
        T(
          '{callsign}: toas surnukeha, vägivalla tunnused. Piirame koridori, töötajad eraldi.',
          '{callsign}: a body in the room, signs of violence. Cordoning off the corridor, staff kept apart.',
        ),
      ]),
      backup(0.55, un('criminal'), { at: 3, timeoutMin: 8 }),
      qVehicle(10, {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Kaamerast nähtud sõiduk {plate}, palun kontrolli ja pane tagaotsitavaks.',
            'Control, {callsign}. Vehicle {plate} seen on CCTV, please run it and put out a BOLO.',
          ),
        ],
      }),
      qPerson('suspect', 25, {
        chance: 0.6,
        radio: [
          T(
            '{callsign}: toa registreeris {name}, isikukood {idcode}. Palun kontrolli.',
            '{callsign}: the room was registered to {name}, ID code {idcode}. Please check.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        3,
        T(
          'Kahtlustatav peeti sõiduki järgi kinni samal päeval. Alustati kriminaalmenetlust KarS § 113 ja § 184 järgi.',
          'The suspect was traced through the vehicle and detained the same day. Criminal proceedings opened under KarS § 113 and § 184.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'report',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Sündmuskoht vormistati, kahtlustatav on tuvastatud ja tagaotsitav. Sõiduk on tagaotsitavaks kuulutatud.',
          'The scene was processed; the suspect is identified and wanted. The vehicle has been put on the BOLO list.',
        ),
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Kahtlustatav jäi tabamata, sõiduk leiti hiljem põlenuna. Menetlus jätkub.',
          'The suspect was not caught; the vehicle was later found burnt out. The investigation continues.',
        ),
        { trust: -3 },
      ),
    ],
    tags: ['homicide', 'drugs'],
    legacy: true,
  },
  {
    id: 'violence_street_shootout',
    category: 'violence',
    code: 'TR',
    title: T('Tänavakaklus muutus tulevahetuseks', 'Street fight turned into a shootout'),
    priority: 1,
    weight: 0.003,
    hours: 'nightlife',
    weekendBoost: 1.5,
    places: ['street', 'parking', 'residential'],
    units: { need: [un('any', 3)], ideal: [un('rapid', 2), un('patrol', 2)] },
    onScene: [90, 150],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 35], record: 0.8, wanted: 0.3 },
      { role: 'suspect', gender: 'M', age: [18, 35], record: 0.7, wanted: 0.15 },
      { role: 'victim', gender: 'M', age: [18, 35], record: 0.5 },
      { role: 'witness', gender: 'any', age: [18, 70] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', stolen: 0.35, driverRole: 'suspect' }],
    summary: [
      T(
        '{address}. Kahe grupi vaheline kaklus eskaleerus tulistamiseks keset linna. Kuuldud mitut lasku, on vigastatuid. Osa laskjaid lahkus sõidukiga.',
        '{address}. A fight between two groups escalated into a shootout in the middle of town. Several shots heard, people injured. Some shooters left in a vehicle.',
      ),
      T(
        '{address}. Elanikud teatavad lasudest ja karjumisest, tänaval lamab vähemalt üks inimene. Osapooli umbes {n}.',
        '{address}. Residents report gunshots and screaming; at least one person is lying in the street. Around {n} people involved.',
      ),
    ],
    callerLines: [
      T(
        'Siin lastakse! Mitu pauku järjest, inimesed jooksevad laiali!',
        'Someone is shooting here! Several bangs in a row, people are running!',
      ),
      T(
        'Ma olen akna all põrandal. Tänaval lamab keegi ja üks auto kihutas minema.',
        'I am on the floor under the window. Someone is lying in the street and a car sped away.',
      ),
    ],
    details: [
      T(
        'Tunnistajad nägid sõidukit {car}, numbriga {plate}, millega osa laskjaid lahkus {direction}.',
        'Witnesses saw a {car}, plate {plate}, in which some shooters left {direction}.',
      ),
      T(
        'Sündmuskohalt leiti padrunikestad ja pesapallikurikas.',
        'Cartridge cases and a baseball bat were found at the scene.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Tulistamisvigastused', 'Gunshot injuries') }],
    beats: [
      backup(0.76, un('rapid', 2), {
        at: 'arrive',
        timeoutMin: 5,
        radio: [
          T(
            '{callsign}: tulistamine, vigastatuid! Vajame kiirreageerijaid ja kõiki lähedal olevaid ekipaaže!',
            '{callsign}: shots fired, casualties! We need rapid response and every unit nearby!',
          ),
        ],
      }),
      kiirabi(3, {
        radio: [
          T(
            '{callsign}: ala on turvatud, kiirabi võib siseneda. Kaks vigastatut.',
            '{callsign}: area secured, ambulance may come in. Two injured.',
          ),
        ],
      }),
      qVehicle(8, { chance: 0.7 }),
      pursuit(
        12,
        [
          T(
            '{callsign}: märkasime kahtlustatavate sõidukit {plate}, alustame jälitust!',
            '{callsign}: we have eyes on the suspects’ vehicle {plate}, starting pursuit!',
          ),
        ],
        0.35,
      ),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        3,
        T(
          'Kaks laskjat peeti kinni, relv leiti. Alustati kriminaalmenetlust KarS § 263 ja mõrvakatse tunnustel.',
          'Two shooters were detained and a firearm recovered. Criminal proceedings opened under KarS § 263 and for attempted murder.',
        ),
        { arrests: 2, injuries: 2, trust: 5 },
      ),
      oc(
        'partial',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Üks osaline peeti kinni, ülejäänud on tuvastamisel. Vigastatud toimetati haiglasse.',
          'One participant was detained; the others are being identified. The injured were taken to hospital.',
        ),
        { arrests: 1, injuries: 2 },
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Laskjad pääsesid sõidukiga, mis leiti hiljem mahajäetuna. Vigastatud on haiglas.',
          'The shooters escaped in a vehicle that was later found abandoned. The injured are in hospital.',
        ),
        { injuries: 2, trust: -5 },
      ),
      oc(
        'fatal',
        'tragedy',
        [0, 0.2],
        1,
        T(
          'Üks kannatanu suri sündmuskohal. Laskjad on tabamata, menetlus jätkub tapmisena.',
          'One victim died at the scene. The shooters are at large; the case continues as a killing.',
        ),
        { injuries: 2, trust: -8 },
      ),
    ],
    tags: ['armed', 'weapon_firearm', 'vehicle_flee', 'bolo'],
    legacy: true,
  },
  {
    id: 'violence_officer_stabbed',
    category: 'violence',
    code: 'AVA',
    title: T(
      'Politseinik pussitati joobes isiku kinnipidamisel',
      'Officer stabbed while detaining a drunk person',
    ),
    priority: 1,
    weight: 0.004,
    hours: 'nightlife',
    places: ['street', 'park', 'residential'],
    units: { need: [un('any', 2)], ideal: [un('rapid', 1), un('k9', 1)] },
    onScene: [60, 120],
    persons: [{ role: 'suspect', gender: 'M', age: [20, 50], intoxicated: 0.95, record: 0.8, wanted: 0.2 }],
    summary: [
      T(
        '{address}. Patrull teatab: joobes isiku kinnipidamisel sai politseinik noahaava. Kahtlustatav põgenes parki. Ametnik vajab abi!',
        '{address}. Patrol reports an officer was stabbed while detaining a drunk person. The suspect fled into the park. Officer needs assistance!',
      ),
      T(
        '{address}. Rahunemiskutse käigus ründas joobes mees politseinikku noaga ja põgenes {direction}. Vigastatud ametnik on teadvusel.',
        '{address}. During a disturbance call a drunk man attacked an officer with a knife and fled {direction}. The injured officer is conscious.',
      ),
    ],
    callerLines: [
      T(
        'Kolleeg sai noaga pihta, ta on teadvusel, aga verd on palju! Ründaja jooksis parki!',
        'My partner got stabbed, he is conscious but bleeding a lot! The attacker ran into the park!',
      ),
      T(
        'Siin politseinik vajab abi! Mees pussitas teda ja jooksis minema!',
        'A police officer needs help here! A man stabbed him and ran off!',
      ),
    ],
    details: [
      T(
        'Ründaja: {suspect}. Nuga on tal tõenäoliselt endiselt käes.',
        'Attacker: {suspect}. He probably still has the knife.',
      ),
      T(
        'Kuulivest peatas osa löögist, haav on käsivarrel.',
        'The vest stopped part of the blow; the wound is on the forearm.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Vigastatud politseinik', 'Injured officer') }],
    beats: [
      kiirabi('arrive', {
        radio: [
          T(
            '{callsign}: ametnik vigastatud, vajame kohe kiirabi!',
            '{callsign}: officer injured, we need an ambulance now!',
          ),
        ],
      }),
      backup(0.68, un('any', 2), {
        at: 'arrive',
        timeoutMin: 4,
        radio: [
          T(
            '{callsign}: kiiresti abi, {address}! Kolleeg sai noaga, ründaja põgeneb!',
            '{callsign}: urgent help, {address}! Colleague knifed, attacker fleeing!',
          ),
        ],
      }),
      search(5, 1, [
        T(
          '{callsign}: kahtlustatav põgenes parki, alustame otsinguid. Vajame koera ja lisaekipaaže.',
          '{callsign}: suspect fled into the park, starting a search. We need a dog and more units.',
        ),
      ]),
      toArrest(30, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'caught',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Kahtlustatav tabati pargist koera abil. Alustati kriminaalmenetlust KarS § 274 järgi. Vigastatud politseinik on haiglas, tema elu ei ole ohus.',
          'The suspect was found in the park with a dog. Criminal proceedings opened under KarS § 274. The injured officer is in hospital, his life is not in danger.',
        ),
        { arrests: 1, trust: 5 },
      ),
      oc(
        'later',
        'report',
        [0.35, 0.65],
        2,
        T(
          'Kahtlustatav tuvastati ja peeti kinni järgmisel päeval. Ametnik toimetati haiglasse.',
          'The suspect was identified and detained the following day. The officer was taken to hospital.',
        ),
        { arrests: 1 },
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Ründaja jäi tabamata. Vigastatud ametnik on haiglas, otsingud jätkuvad.',
          'The attacker was not caught. The injured officer is in hospital and the search continues.',
        ),
        { trust: -4 },
      ),
      oc(
        'serious',
        'hospital',
        [0, 0.15],
        1,
        T(
          'Ametniku vigastused osutusid raskeks, ta opereeriti. Ründaja on tabamata.',
          'The officer’s injuries proved serious and he underwent surgery. The attacker is still at large.',
        ),
        { trust: -6 },
      ),
    ],
    tags: ['armed', 'weapon_knife', 'officer_down', 'bolo'],
    legacy: true,
  },
  {
    id: 'violence_attack_on_paramedic',
    category: 'violence',
    code: 'KV',
    title: T('Rünnak meditsiinitöötaja vastu', 'Attack on a medical worker'),
    priority: 1,
    weight: 0.12,
    hours: 'night',
    places: ['residential', 'house', 'street'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'any', age: [18, 65], intoxicated: 0.7, record: 0.4 },
      { role: 'victim', gender: 'any', age: [25, 55], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Kiirabibrigaad palub abi: kodukülastuse käigus ründas patsient kiirabitöötajat. Isik on tugevas afektiseisundis ja agressiivne.',
        '{address}. An ambulance crew requests help: a patient attacked a paramedic during a home visit. The person is in a severe state of agitation and aggressive.',
      ),
      T(
        '{address}. Kiirabi teatel lõi joobes mees parameedikut ja loobib asju. Brigaad taandus trepikotta.',
        '{address}. The ambulance service reports a drunk man hit a paramedic and is throwing things. The crew has retreated to the stairwell.',
      ),
    ],
    callerLines: [
      T(
        'Siin kiirabi, meie töötajat rünnati! Patsient on täiesti endast väljas, vajame kohe politseid.',
        'Ambulance here, one of our staff was attacked! The patient is completely out of control, we need police now.',
      ),
      T(
        'Ta lõi kolleegi pikali ja loobib asju. Me oleme trepikojas, uks on lahti.',
        'He knocked my colleague down and is throwing things. We are in the stairwell, the door is open.',
      ),
    ],
    callerLinesRu: [
      'Это скорая, на нашего сотрудника напали! Пациент совсем не в себе, срочно нужна полиция.',
      '[Он сбил|Она сбила] коллегу с ног и швыряет вещи. Мы на лестнице, дверь открыта.',
    ],
    details: [
      T(
        'Patsient on {suspect}. Tal võib olla psühhoos või narkojoove.',
        'The patient is {suspect}. Possibly psychosis or drug intoxication.',
      ),
      T(
        'Rünnatud kiirabitöötajal on näol marrastused, ta jätkab tööd.',
        'The paramedic who was attacked has facial grazes and continues working.',
      ),
    ],
    beats: [
      backup(0.64, un('patrol'), {
        at: 'arrive',
        radio: [
          T(
            '{callsign}: isik väga agressiivne, ohjeldamiseks vajame teist patrulli!',
            '{callsign}: subject very aggressive, we need a second patrol to restrain him!',
          ),
        ],
      }),
      qPerson('suspect', 5),
      choice(
        8,
        [
          T(
            '{callsign}: isik ohjeldatud. Kiirabi hinnangul vajab ta psühhiaatrilist abi. Kas toimetame haiglasse või peame kinni kahtlustatavana?',
            '{callsign}: subject restrained. The paramedics think he needs psychiatric care. Hospital, or detain as a suspect?',
          ),
        ],
        [
          opt(
            'hospital',
            T('Haiglasse, ametnik kaasa', 'Hospital, officer escorts'),
            T(
              '{callsign}, juhtimine. Toimetage kiirabiga haiglasse, üks ametnik saadab. Menetlus hiljem.',
              '{callsign}, Control. Send him by ambulance to hospital with an officer escort. Paperwork later.',
            ),
            {
              success: 0.1,
              trust: 1,
              time: 15,
            },
          ),
          opt(
            'arrest',
            T('Pidage kinni', 'Detain'),
            T(
              '{callsign}, juhtimine. Pidage kinni kahtlustatavana ja toimetage arestimajja.',
              '{callsign}, Control. Detain as a suspect and take him to the arrest house.',
            ),
            { arrests: 1, time: 20 },
          ),
        ],
        'hospital',
      ),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Ründaja ohjeldati ja peeti kinni. Alustati kriminaalmenetlust KarS § 121 järgi, kiirabibrigaad jätkas tööd.',
          'The attacker was restrained and detained. Criminal proceedings opened under KarS § 121; the ambulance crew carried on working.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'psych',
        'hospital',
        [0.4, 0.85],
        3,
        T(
          'Isik toimetati politsei saatel psühhiaatriakliinikusse. Kiirabitöötaja ründamise asjas alustati menetlust.',
          'The person was taken to a psychiatric clinic under police escort. Proceedings were opened over the attack on the paramedic.',
        ),
      ),
      oc(
        'hurt',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Isik rahunes alles pärast otsest sundi, viga sai ka teine kiirabitöötaja. Mõlemad vaadati EMO-s üle.',
          'The person only calmed down after physical force; a second paramedic was also hurt. Both were checked at A&E.',
        ),
        { injuries: 1, trust: -3 },
      ),
      oc(
        'gone',
        'escaped',
        [0, 0.3],
        1,
        T(
          'Isik lahkus enne politsei saabumist, tema asukoht on teadmata.',
          'The person left before police arrived; whereabouts unknown.',
        ),
        { trust: -3 },
      ),
    ],
    interactiveChance: 0.3,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Kiirabibrigaad, vajame politseid. Patsient ründas meie töötajat.',
          'Ambulance crew, we need police. A patient attacked one of our staff.',
        ),
      ],
      openingRu: ['Скорая помощь, нужна полиция. Пациент напал на нашего фельдшера.'],
      answers: {
        injured: [
          T(
            'Kolleegil on näos marrastused, muidu korras.',
            'My colleague has grazes on his face, otherwise fine.',
          ),
        ],
        weapons: [
          T(
            'Relva ei näinud, aga ta loobib kõike, mis kätte jääb.',
            'No weapon seen, but he is throwing everything he can grab.',
          ),
        ],
        intoxicated: [
          T(
            'Tundub, et alkohol ja võib-olla veel midagi.',
            'Looks like alcohol and maybe something else too.',
          ),
        ],
        safe: [
          T(
            'Oleme trepikojas, uks on lahti, ta karjub sees.',
            'We are in the stairwell, the door is open, he is shouting inside.',
          ),
        ],
      },
      answersRu: {
        injured: ['У коллеги ссадины на лице, а так всё нормально.'],
        weapons: [
          'Оружия не {видел|видела}, но [он швыряет|она швыряет] всё, что под руку попадётся.',
        ],
        intoxicated: ['Похоже на алкоголь, а может, и ещё что-то.'],
        safe: ['Мы на лестнице, дверь открыта, [он орёт|она орёт] внутри.'],
      },
    },
    tags: ['assist_ems'],
    legacy: true,
  },
  {
    id: 'violence_livestream_killing',
    category: 'violence',
    code: 'TR',
    title: T('Tapmine otseülekandes', 'Killing on a livestream'),
    priority: 1,
    weight: 0.002,
    hours: 'evening',
    places: ['street', 'park', 'residential', 'parking'],
    units: { need: [un('any', 2)], ideal: [un('rapid', 2), un('criminal', 1)] },
    onScene: [90, 150],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 30], record: 0.6, wanted: 0.2 },
      { role: 'victim', gender: 'M', age: [18, 40] },
      { role: 'caller', gender: 'any', age: [15, 50] },
    ],
    summary: [
      T(
        '{address}. Sotsiaalmeediasse postitati video, kus noormees tulistab inimest ja põgeneb. Asukoht tuvastati video järgi. Laskja on relvastatud.',
        '{address}. A video was posted on social media showing a young man shooting someone and fleeing. The location was identified from the footage. The shooter is armed.',
      ),
      T(
        '{address}. Mitu inimest teatab otseülekandest, milles tulistatakse inimest. Video taustal on äratuntav hoone. Kannatanu seisund teadmata.',
        '{address}. Several people report a livestream in which a person is shot. A recognisable building is visible in the background. Victim’s condition unknown.',
      ),
    ],
    callerLines: [
      T(
        'Ma nägin just otseülekannet... seal lasti keegi maha! See on meie maja juures!',
        'I just watched a livestream... someone got shot! It is right by our building!',
      ),
      T(
        'Mu poeg näitas mulle videot, kus keegi tulistab. Ma tunnen selle koha ära, see on {address}.',
        'My son showed me a video of someone shooting. I recognise the place, it is {address}.',
      ),
    ],
    details: [
      T(
        'Video järgi on laskja {suspect}, ta lahkus jalgsi {direction}.',
        'According to the video the shooter is {suspect}; he left on foot {direction}.',
      ),
      T(
        'Video on platvormilt eemaldatud, koopia salvestati menetluse jaoks.',
        'The video has been taken down; a copy was saved for the investigation.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Tulistamisohver', 'Shooting victim') }],
    beats: [
      backup(0.95, un('rapid', 2), { at: 'arrive', timeoutMin: 5 }),
      kiirabi(2, {
        radio: [
          T(
            '{callsign}: kannatanu leitud, raske vigastus. Kiirabi kohe!',
            '{callsign}: victim located, serious injury. Ambulance now!',
          ),
        ],
      }),
      search(6, 2, [
        T(
          '{callsign}: laskja liikus {direction}, alustame piirkonna läbikammimist.',
          '{callsign}: the shooter went {direction}, starting an area sweep.',
        ),
      ]),
      qPerson('suspect', 20, {
        chance: 0.5,
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Video järgi tuvastati laskja: {name}, isikukood {idcode}. Palun kontrolli.',
            'Control, {callsign}. The shooter has been identified from the video: {name}, ID code {idcode}. Please check.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Laskja tabati tunni aja jooksul, relv leiti. Alustati kriminaalmenetlust KarS § 114 järgi.',
          'The shooter was caught within the hour and the weapon recovered. Criminal proceedings opened under KarS § 114.',
        ),
        { arrests: 1, injuries: 1, trust: 6 },
      ),
      oc(
        'wanted',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Laskja tuvastati video põhjal ja kuulutati tagaotsitavaks. Kannatanu toimetati haiglasse.',
          'The shooter was identified from the video and put on the wanted list. The victim was taken to hospital.',
        ),
        { injuries: 1 },
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Laskja jäi tabamata. Video levib edasi ja avalikkus on ärevil.',
          'The shooter was not caught. The video keeps spreading and the public is alarmed.',
        ),
        { injuries: 1, trust: -6 },
      ),
      oc(
        'died',
        'tragedy',
        [0, 0.25],
        1,
        T(
          'Kannatanu suri sündmuskohal. Laskja on tabamata, otsingud jätkuvad.',
          'The victim died at the scene. The shooter is at large and the search continues.',
        ),
        { injuries: 1, trust: -8 },
      ),
    ],
    tags: ['armed', 'weapon_firearm', 'bolo'],
    legacy: true,
  },
  {
    id: 'violence_remains_in_vehicle',
    category: 'violence',
    code: 'SK',
    title: T('Sõidukis avastati inimjäänused', 'Human remains found in a vehicle'),
    priority: 3,
    weight: 0.01,
    hours: 'day',
    places: ['forest', 'ruralroad'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 1), un('criminal', 1)] },
    onScene: [80, 140],
    persons: [
      { role: 'deceased', gender: 'any', age: [20, 70], record: 0.3 },
      { role: 'caller', gender: 'any', age: [30, 75] },
    ],
    vehicles: [{ role: 'involved', kind: 'car', stolen: 0.3, noInsurance: 0.5, noInspection: 0.5 }],
    summary: [
      T(
        '{address}. Seenelise teatel seisab võsas hüljatud sõiduauto, salongis on tugeva lagunemisastmega surnukeha.',
        '{address}. A mushroom picker reports an abandoned car in the bushes with a badly decomposed body inside.',
      ),
      T(
        '{address}. Metsateelt leitud mahajäetud sõidukist avastati inimjäänused. Sõiduk on seal ilmselt seisnud nädalaid.',
        '{address}. Human remains were found in an abandoned vehicle on a forest track. The car has apparently been there for weeks.',
      ),
    ],
    callerLines: [
      T(
        'Ma korjasin seeni ja siin võsas on auto... sees on keegi. Ta on ilmselt ammu surnud.',
        'I was picking mushrooms and there is a car in the bushes... someone is inside. They must have been dead for a long time.',
      ),
      T(
        'Tundsin juba eemalt imelikku lõhna. Autol on numbrimärgid alles.',
        'I could smell something strange from a distance. The car still has its number plates.',
      ),
    ],
    details: [
      T('Sõiduki number on {plate}, {car}.', 'The vehicle is {plate}, {car}.'),
      T(
        'Surnu juurest leiti dokumendid ja tühjad pudelid. Esmasel vaatlusel vägivallatunnuseid ei ole.',
        'Documents and empty bottles were found by the body. No obvious signs of violence at first sight.',
      ),
    ],
    beats: [
      qVehicle('arrive'),
      backup(0.6, un('criminal'), { at: 5, timeoutMin: 8 }),
      qPerson('deceased', 20, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'no_crime',
        'resolved',
        [0.55, 1],
        3,
        T(
          'Ekspertiisi esialgsel hinnangul kuriteo tunnused puuduvad. Lähedasi teavitati, surma põhjus selgitatakse.',
          'Initial forensic assessment shows no signs of a crime. Relatives were informed; the cause of death will be established.',
        ),
      ),
      oc(
        'investigation',
        'report',
        [0.3, 0.75],
        3,
        T(
          'Sündmuskoht vormistati, sõiduk toimetati ekspertiisi. Alustati kriminaalmenetlust surma asjaolude väljaselgitamiseks.',
          'The scene was processed and the vehicle taken for forensic examination. Criminal proceedings opened to establish the circumstances of death.',
        ),
      ),
      oc(
        'botched',
        'report',
        [0, 0.35],
        2,
        T(
          'Vaatlus venis ja osa asitõendeid sai kahjustada. Surma asjaolude selgitamine on raskendatud.',
          'The scene examination dragged on and some evidence was damaged. Establishing the circumstances of death is harder.',
        ),
        { trust: -2 },
      ),
    ],
    tags: ['body_found'],
    legacy: true,
  },
  {
    id: 'violence_playground_shooting',
    category: 'violence',
    code: 'TR',
    title: T('Laskmine mänguväljakul', 'Shooting at a playground'),
    priority: 1,
    weight: 0.002,
    hours: 'day',
    seasons: ['spring', 'summer', 'autumn'],
    places: ['park', 'residential'],
    units: { need: [un('any', 3)], ideal: [un('rapid', 2), un('patrol', 2)] },
    onScene: [90, 150],
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 40], record: 0.7, wanted: 0.2 },
      { role: 'suspect', gender: 'M', age: [20, 40], record: 0.6 },
      { role: 'victim', gender: 'any', age: [4, 12] },
      { role: 'witness', gender: 'any', age: [25, 45], relation: 'parent' },
    ],
    summary: [
      T(
        '{address}. Kaks meest tulistasid teineteist laste mänguväljaku läheduses. On vigastatuid, sealhulgas lapsi. Laskjad lahkusid.',
        '{address}. Two men exchanged fire near a children’s playground. There are casualties, including children. The shooters have left.',
      ),
      T(
        '{address}. Lapsevanemad teatavad lasudest mänguväljaku juures. Vigastatuid vähemalt {n}. Laskjad liikusid {direction}.',
        '{address}. Parents report gunshots by the playground. At least {n} injured. The shooters went {direction}.',
      ),
    ],
    callerLines: [
      T(
        'Siin tulistati! Lapsed olid mänguväljakul, üks laps on vigastatud, palun kiiresti!',
        'There was shooting here! The kids were on the playground, one child is hurt, please hurry!',
      ),
      T(
        'Kaks meest karjusid teineteise peale ja siis hakkasid tulistama... me peitsime lapsed maja taha.',
        'Two men were shouting at each other and then started shooting... we hid the kids behind the building.',
      ),
    ],
    callerLinesRu: [
      'Тут стреляли! Дети были на площадке, один ребёнок ранен, пожалуйста, быстрее!',
      'Двое мужчин орали друг на друга, а потом начали стрелять... мы спрятали детей за домом.',
    ],
    details: [
      T('Ühte laskjat kirjeldatakse: {suspect}.', 'One shooter is described as: {suspect}.'),
      T(
        'Vigastatud laps on teadvusel, kiirabi on teel.',
        'The injured child is conscious; the ambulance is on its way.',
      ),
    ],
    agencies: [
      {
        agency: 'kiirabi',
        chance: 1,
        reason: T('Mitu tulistamisohvrit, sh laps', 'Several shooting victims, including a child'),
      },
    ],
    beats: [
      backup(0.92, un('rapid', 2), { at: 'arrive', timeoutMin: 4 }),
      kiirabi('arrive', {
        radio: [
          T(
            '{callsign}: mitu vigastatut, nende seas laps! Vajame mitut kiirabibrigaadi.',
            '{callsign}: several injured, including a child! We need several ambulance crews.',
          ),
        ],
      }),
      search(6, 1.5, [
        T(
          '{callsign}: laskjad lahkusid {direction}, alustame otsinguid.',
          '{callsign}: the shooters left {direction}, starting a search.',
        ),
      ]),
      qPerson('suspect', 20, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        3,
        T(
          'Mõlemad laskjad peeti kinni, relvad leiti. Vigastatud toimetati haiglasse, laste elu ei ole ohus. Alustati kriminaalmenetlust mõrvakatse ja KarS § 263 tunnustel.',
          'Both shooters were detained and the weapons recovered. The injured were taken to hospital; the children’s lives are not in danger. Proceedings opened for attempted murder and under KarS § 263.',
        ),
        { arrests: 2, injuries: 2, trust: 6 },
      ),
      oc(
        'one',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Üks laskja peeti kinni, teine on tuvastatud ja tagaotsitav. Vigastatud on haiglas.',
          'One shooter was detained; the other is identified and wanted. The injured are in hospital.',
        ),
        { arrests: 1, injuries: 2 },
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Laskjad jäid tabamata. Piirkonnas on suurendatud patrullimist, lastevanemad on hirmul.',
          'The shooters were not caught. Patrols have been stepped up in the area; parents are frightened.',
        ),
        { injuries: 2, trust: -7 },
      ),
      oc(
        'fatal',
        'tragedy',
        [0, 0.2],
        1,
        T(
          'Üks kannatanu suri saadud vigastustesse. Laskjad on tabamata, lähedastele pakutakse kriisiabi.',
          'One victim died of their injuries. The shooters are at large; relatives are offered crisis support.',
        ),
        { injuries: 2, trust: -9 },
      ),
    ],
    interactiveChance: 0.4,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mänguväljakul tulistati! Laps on vigastatud!',
          'There was shooting at the playground! A child is hurt!',
        ),
      ],
      openingRu: ['На детской площадке стреляли! Ребёнок ранен!'],
      answers: {
        injured: [
          T(
            'Üks laps ja üks mees, laps nutab, käsi veritseb.',
            'One child and one man; the child is crying, his arm is bleeding.',
          ),
        ],
        weapons: [T('Püstolid, mõlemal mehel olid püstolid.', 'Pistols, both men had pistols.')],
        count: [T('Kaks laskjat. Vigastatuid vähemalt kaks.', 'Two shooters. At least two injured.')],
        direction: [
          T(
            'Nad jooksid eri suundades, üks {direction}.',
            'They ran in different directions, one {direction}.',
          ),
        ],
        children: [
          T(
            'Siin on veel kümmekond last, me viisime nad maja taha.',
            'There are about ten more children here, we took them behind the building.',
          ),
        ],
      },
      answersRu: {
        injured: ['Один ребёнок и один мужчина, ребёнок плачет, у него рука в крови.'],
        weapons: ['Пистолеты, у обоих мужчин были пистолеты.'],
        count: ['Двое стрелявших. Раненых минимум двое.'],
        direction: ['Они разбежались в разные стороны, один побежал {direction}.'],
        children: ['Тут ещё человек десять детей, мы их увели за дом.'],
      },
    },
    tags: ['armed', 'weapon_firearm', 'children', 'bolo'],
    legacy: true,
  },
  {
    id: 'violence_youth_revenge_attack',
    category: 'violence',
    code: 'KL',
    title: T('Noorte kättemaksurünnak', 'Youth revenge attack'),
    priority: 1,
    weight: 0.025,
    hours: 'evening',
    weekendBoost: 1.3,
    places: ['park', 'street', 'residential', 'mall'],
    units: { need: [un('any', 2)], ideal: [un('patrol', 2), un('community', 1)] },
    onScene: [60, 120],
    persons: [
      { role: 'suspect', gender: 'M', age: [14, 20], record: 0.4, intoxicated: 0.3 },
      { role: 'suspect', gender: 'M', age: [14, 20], record: 0.3 },
      { role: 'victim', gender: 'M', age: [14, 20] },
      { role: 'witness', gender: 'any', age: [14, 60] },
    ],
    summary: [
      T(
        '{address}. Grupp noorukeid ründas teist kampa pesapallikurikate ja noaga. On mitu vigastatut. Ründajad hajusid.',
        '{address}. A group of teenagers attacked another gang with baseball bats and a knife. Several injured. The attackers scattered.',
      ),
      T(
        '{address}. Kahe noortegrupi vahel kokku lepitud "arveteklaarimine": kurikad ja vähemalt üks nuga. Osalejaid umbes {n}.',
        '{address}. A pre-arranged "settling of scores" between two youth groups: bats and at least one knife. Around {n} involved.',
      ),
    ],
    callerLines: [
      T(
        'Siin pargis peksavad poisid teineteist kurikatega, üks lamab maas ja ei liigu!',
        'Boys are beating each other with bats in the park, one is on the ground and not moving!',
      ),
      T(
        'Need on mu poja klassivennad... nad tulid kättemaksuks, ühel oli nuga!',
        'Those are my son’s classmates... they came for revenge, one of them had a knife!',
      ),
    ],
    details: [
      T(
        'Tunnistajate sõnul juhtis ründajaid {suspect}.',
        'Witnesses say the attackers were led by {suspect}.',
      ),
      T(
        'Konflikt sai alguse sotsiaalmeedias levinud solvavast videost.',
        'The conflict started with an insulting video shared on social media.',
      ),
    ],
    agencies: [
      { agency: 'kiirabi', chance: 1, reason: T('Mitu vigastatut', 'Several injured') },
      { agency: 'sotsiaal', chance: 0.6, reason: T('Alaealised osalised', 'Minors involved') },
    ],
    beats: [
      kiirabi('arrive', {
        radio: [
          T(
            '{callsign}: kolm vigastatut, ühel lõikehaav. Kiirabi on hädasti vaja.',
            '{callsign}: three injured, one with a cut. We urgently need the ambulance.',
          ),
        ],
      }),
      backup(0.57, un('patrol', 2), { at: 2 }),
      search(
        6,
        1,
        [
          T(
            '{callsign}: ründajad hajusid {direction}, vaatame ümbruse läbi.',
            '{callsign}: the attackers scattered {direction}, sweeping the area.',
          ),
        ],
        0.6,
      ),
      qPerson('suspect', 15, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        3,
        T(
          'Neli ründajat peeti kinni, kurikad ja nuga võeti ära. Alustati kriminaalmenetlust KarS § 263 järgi, alaealistest teavitati lastekaitset.',
          'Four attackers were detained and the bats and knife seized. Proceedings opened under KarS § 263; child protection was notified about the minors.',
        ),
        { arrests: 4, injuries: 3, trust: 4 },
      ),
      oc(
        'identified',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Vigastatud toimetati haiglasse, ründajad on tuvastatud. Alustati kriminaalmenetlust, noorsoopolitseinik kaasati.',
          'The injured were taken to hospital and the attackers identified. Proceedings opened and a youth officer is involved.',
        ),
        { injuries: 3 },
      ),
      oc(
        'scattered',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Ründajad hajusid ja tunnistajad ei soovi neid nimetada. Kannatanud on haiglas.',
          'The attackers scattered and witnesses will not name them. The victims are in hospital.',
        ),
        { injuries: 3, trust: -4 },
      ),
    ],
    tags: ['armed', 'weapon_knife', 'youth'],
    legacy: true,
  },
  {
    id: 'violence_human_trafficking',
    category: 'violence',
    code: 'IK',
    title: T('Inimkaubandus', 'Human trafficking'),
    priority: 2,
    weight: 0.015,
    hours: 'flat',
    places: ['residential', 'house', 'industrial'],
    units: { need: [un('any', 2)], ideal: [un('patrol', 2), un('criminal', 1)] },
    onScene: [80, 150],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 55], record: 0.5, wanted: 0.15 },
      { role: 'victim', gender: 'any', age: [18, 40] },
      { role: 'caller', gender: 'any', age: [25, 75], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Anonüümse vihje kohaselt hoitakse korteris kinni inimesi, keda sunnitakse vastu tahtmist tööle.',
        '{address}. An anonymous tip says people are being held in a flat and forced to work against their will.',
      ),
      T(
        '{address}. Teataja kahtlustab, et ehitajatena toodud välistöötajatelt on võetud passid ja neid ei lasta majast välja.',
        '{address}. The caller suspects that foreign workers brought in as builders have had their passports taken and are not allowed to leave the building.',
      ),
    ],
    callerLines: [
      T(
        'Ma ei taha oma nime öelda... aga selles korteris elab vist kümme inimest. Neid viiakse hommikul bussiga ära ja keegi ei räägi.',
        'I do not want to give my name... but about ten people live in that flat. They are driven away in a minibus every morning and nobody talks.',
      ),
      T(
        'Üks naine pistis mulle trepikojas sedeli, kus oli kirjas "help". Ma kardan, et neid hoitakse vägisi.',
        'A woman slipped me a note in the stairwell that said "help". I am afraid they are being held by force.',
      ),
    ],
    details: [
      T(
        'Korteri üürilepingu järgi elab seal üks mees, {suspectName}.',
        'According to the lease only one man lives there, {suspectName}.',
      ),
      T(
        'Naabri sõnul valvab ust pidevalt üks mees, kes ei lase elanikke välja.',
        'A neighbour says a man is always guarding the door and does not let the residents out.',
      ),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 0.7,
        reason: T('Ohvriabi ja majutus kannatanutele', 'Victim support and shelter'),
      },
    ],
    beats: [
      backup(0.85, un('any', 2), { at: 'arrive', timeoutMin: 6 }),
      choice(
        3,
        [
          T(
            '{callsign}: korteri uks on lukus, sees on kuulda mitut häält. Kas siseneme kohe ohu tõrjeks või ootame kriminaalpolitseid?',
            '{callsign}: the door is locked, several voices inside. Do we enter now to avert danger or wait for CID?',
          ),
        ],
        [
          opt(
            'enter',
            T('Sisenege kohe', 'Enter now'),
            T(
              '{callsign}, juhtimine. Sisenege, alus olemas. Olge valvsad.',
              '{callsign}, Control. Go in, you have grounds. Stay alert.',
            ),
            { success: 0.1, risk: 0.1 },
          ),
          opt(
            'wait',
            T('Oodake kriminaalpolitseid', 'Wait for CID'),
            T(
              '{callsign}, juhtimine. Hoidke ust silmas, kriminaalpolitsei tuleb.',
              '{callsign}, Control. Keep the door under watch, CID is coming.',
            ),
            { time: 25, success: -0.05, risk: -0.05 },
          ),
        ],
        'wait',
      ),
      qPerson('suspect', 10),
      agency('sotsiaal', 15, {
        chance: 0.7,
        radio: [
          T(
            '{callsign}: korteris on mitu kannatanut, vajame ohvriabi ja tõlki.',
            '{callsign}: several victims in the flat, we need victim support and an interpreter.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        3,
        T(
          'Korterist leiti mitu kannatanut, kelle dokumendid olid ära võetud. Korraldaja peeti kinni, alustati kriminaalmenetlust KarS § 133 järgi.',
          'Several victims whose documents had been taken were found in the flat. The organiser was detained; criminal proceedings opened under KarS § 133.',
        ),
        { arrests: 1, trust: 5 },
      ),
      oc(
        'victims_safe',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Kannatanud viidi turvalisse kohta. Kahtlustatav korteris ei viibinud, ta on tuvastamisel.',
          'The victims were taken to a safe place. The suspect was not in the flat and is being identified.',
        ),
      ),
      oc(
        'labour',
        'referred',
        [0.2, 0.6],
        1,
        T(
          'Selgus, et tööandja majutab töötajaid kitsastes tingimustes, kuid vabadust ei piirata. Info edastati Tööinspektsioonile.',
          'It turned out the employer houses workers in cramped conditions but does not restrict their freedom. The information was passed to the Labour Inspectorate.',
        ),
      ),
      oc(
        'empty',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Korter oli politsei saabudes tühi, elanikud viidi ilmselt ära. Menetlus jätkub.',
          'The flat was empty when police arrived; the residents had apparently been moved. The investigation continues.',
        ),
        { trust: -3 },
      ),
    ],
    tags: ['trafficking'],
    legacy: true,
  },
  {
    id: 'violence_trafficking_apartment',
    category: 'violence',
    code: 'IK',
    title: T('Võimalik inimkaubandus kortermajas', 'Possible human trafficking in an apartment block'),
    priority: 1,
    weight: 0.005,
    hours: 'night',
    places: ['residential'],
    units: { need: [un('any', 2)], ideal: [un('rapid', 1), un('patrol', 2)] },
    onScene: [80, 150],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 50], record: 0.7, wanted: 0.2 },
      { role: 'victim', gender: 'F', age: [17, 35] },
      { role: 'witness', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Mitu elanikku kuulis korterist appikarjeid. Kahtlustatakse, et korteris hoitakse inimesi vastu nende tahtmist.',
        '{address}. Several residents heard cries for help from a flat. People are suspected of being held there against their will.',
      ),
      T(
        '{address}. Naabri teatel karjub korteris naine võõras keeles "aidake", uks on seestpoolt lukus. Korteris käivad pidevalt võõrad mehed.',
        '{address}. A neighbour reports a woman shouting "help" in a foreign language; the door is locked from inside. Strange men come and go constantly.',
      ),
    ],
    callerLines: [
      T(
        '(sosinal) Palun aidake... meid hoitakse siin kinni. Nad võtsid passid ära.',
        '(whispering) Please help... they are keeping us here. They took our passports.',
      ),
      T(
        'Kõrvalkorterist karjub naine appi. Ma olen seda varemgi kuulnud, aga täna on hullem.',
        'A woman is screaming for help in the flat next door. I have heard it before, but tonight is worse.',
      ),
    ],
    callerLinesRu: [
      '(шёпотом) Помогите, пожалуйста... нас тут держат. У нас забрали паспорта.',
      'В соседней квартире женщина зовёт на помощь. Я и раньше такое {слышал|слышала}, но сегодня хуже.',
    ],
    details: [
      T(
        'Korteris on vähemalt {n} inimest. Ust valvab {suspect}.',
        'There are at least {n} people in the flat. The door is guarded by {suspect}.',
      ),
      T(
        'Kahtlusalune on teadaolevalt seotud organiseeritud grupiga.',
        'The suspect is known to be linked to an organised group.',
      ),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 0.8,
        reason: T('Kannatanute kriisiabi', 'Crisis support for the victims'),
      },
    ],
    beats: [
      backup(0.6, un('any', 2), { at: 'arrive' }),
      choice(
        2,
        [
          T(
            '{callsign}: uks on lukus, seest kostab appikarjeid. Kas murrame ukse maha?',
            '{callsign}: the door is locked and we hear cries for help. Do we break it down?',
          ),
        ],
        [
          opt(
            'force',
            T('Murdke uks', 'Force the door'),
            T('{callsign}, juhtimine. Sisenege, oht elule.', '{callsign}, Control. Go in, danger to life.'),
            { success: 0.15, risk: 0.05 },
          ),
          opt(
            'rescue',
            T('Oodake päästjaid', 'Wait for rescue'),
            T(
              '{callsign}, juhtimine. Päästjad avavad ukse, hoidke positsiooni.',
              '{callsign}, Control. Rescue will open the door, hold position.',
            ),
            { time: 12, success: -0.1 },
          ),
        ],
        'force',
        { timeoutMin: 3 },
      ),
      qPerson('suspect', 10),
      toArrest(20, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'rescued',
        'arrest',
        [0.65, 1],
        3,
        T(
          'Korterist vabastati kolm naist, valvur peeti kinni. Alustati kriminaalmenetlust KarS § 133 järgi, kannatanud suunati ohvriabisse.',
          'Three women were freed from the flat and the guard was detained. Criminal proceedings opened under KarS § 133; the victims were referred to victim support.',
        ),
        { arrests: 1, trust: 6 },
      ),
      oc(
        'partial',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Kannatanud vabastati, kuid korraldaja põgenes tagauksest. Ta on tuvastamisel.',
          'The victims were freed, but the organiser escaped through the back door. He is being identified.',
        ),
      ),
      oc(
        'moved',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Kui politsei korterisse jõudis, olid inimesed ära viidud. Menetlus jätkub.',
          'By the time police got into the flat the people had been taken away. The investigation continues.',
        ),
        { trust: -5 },
      ),
    ],
    interactiveChance: 0.5,
    call: {
      mood: 'whisper',
      opening: [
        T(
          '(sosinal) Palun... meid hoitakse siin kinni. Ma ei tea täpset aadressi.',
          '(whispering) Please... we are being held here. I do not know the exact address.',
        ),
      ],
      openingRu: ['(шёпотом) Помогите... нас здесь держат. У нас забрали паспорта.'],
      answers: {
        where: [
          T(
            'Suur maja, viies korrus. Aknast paistab bussipeatus.',
            'A big block, fifth floor. I can see a bus stop from the window.',
          ),
        ],
        count: [
          T(
            'Meid on neli. Mehi on kaks, üks valvab ust.',
            'There are four of us. Two men, one guards the door.',
          ),
        ],
        weapons: [T('Ühel on nuga, ma nägin.', 'One has a knife, I saw it.')],
        safe: [
          T(
            'Ei... ta võib iga hetk tulla. Ma pean lõpetama.',
            'No... he could come in any moment. I have to hang up.',
          ),
        ],
      },
      answersRu: {
        where: ['Большой дом, пятый этаж. Из окна видно автобусную остановку.'],
        count: ['Нас четверо. Мужчин двое, один сторожит дверь.'],
        weapons: ['У одного нож, я {видел|видела}.'],
        safe: ['Нет... он может зайти в любую секунду. Мне надо заканчивать.'],
      },
    },
    tags: ['trafficking'],
    legacy: true,
  },
  {
    id: 'violence_stalking_vehicle',
    category: 'violence',
    code: 'AJ',
    title: T('Kahtlane jälitamine', 'Suspicious stalking'),
    priority: 3,
    weight: 0.25,
    hours: 'day',
    places: ['street', 'parking', 'residential', 'mall'],
    units: { need: [un('patrol', 1)] },
    onScene: [25, 50],
    persons: [
      { role: 'victim', gender: 'F', age: [20, 60] },
      { role: 'suspect', gender: 'M', age: [22, 60], record: 0.3, restraining: 0.15, known: false },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
    summary: [
      T(
        '{address}. Teataja sõnul on sama sõiduauto teda mitu päeva jälitanud kõikjale, kuhu ta läheb. Hetkel seisab auto maja ees, juht sees.',
        '{address}. The caller says the same car has followed her everywhere she goes for several days. It is parked outside the building now, driver inside.',
      ),
      T(
        '{address}. Naine kardab oma turvalisuse pärast: {car} on teda nädal aega töölt koju saatnud. Sõiduk on praegu parklas.',
        '{address}. A woman fears for her safety: a {car} has trailed her home from work for a week. The car is in the car park now.',
      ),
    ],
    callerLines: [
      T(
        'Mitu päeva on auto mind jälitanud kõikjale, kuhu ma lähen. Ma kardan oma turvalisuse pärast.',
        'For several days a car has followed me everywhere I go. I fear for my safety.',
      ),
      T(
        'Ta seisab jälle mu maja ees, tuled kustus. Ma ei julge välja minna.',
        'He is parked outside my building again with the lights off. I do not dare go out.',
      ),
    ],
    details: [
      T('Sõiduki number on {plate}.', 'The registration is {plate}.'),
      T(
        'Teataja meenutab, et lõpetas hiljuti suhte, mis lõppes tülis.',
        'The caller recalls she recently ended a relationship on bad terms.',
      ),
    ],
    beats: [qVehicle('arrive'), qPerson('suspect', 5, { chance: 0.8 })],
    outcomes: [
      oc(
        'stalking',
        'report',
        [0.55, 1],
        3,
        T(
          'Juht osutus teataja endiseks elukaaslaseks. Alustati kriminaalmenetlust ahistava jälitamise tunnustel (KarS § 157³), teatajat nõustati lähenemiskeelu taotlemisel.',
          'The driver turned out to be the caller’s ex-partner. Proceedings opened for stalking (KarS § 157³); the caller was advised on applying for a restraining order.',
        ),
        { trust: 2 },
      ),
      oc(
        'warned',
        'warning',
        [0.3, 0.7],
        2,
        T(
          'Juhiga vesteldi, ta lubas teatajat mitte enam jälitada. Teatajale anti nõu tõendite kogumiseks.',
          'Officers spoke to the driver, who promised to stop following her. The caller was advised on gathering evidence.',
        ),
      ),
      oc(
        'courier',
        'unfounded',
        [0, 0.5],
        2,
        T(
          'Selgus, et sõiduk kuulub samas majas elavale kullerile. Jälitamist ei toimunud, teatajat rahustati.',
          'The car belongs to a courier living in the same building. There was no stalking; the caller was reassured.',
        ),
      ),
      oc(
        'left',
        'escaped',
        [0, 0.3],
        1,
        T(
          'Sõiduk lahkus enne patrulli saabumist. Teatajale soovitati järgmisel korral numbrimärk üles märkida.',
          'The car left before the patrol arrived. The caller was advised to note the plate next time.',
        ),
        { trust: -1 },
      ),
    ],
    falseAlarmChance: 0.25,
    tags: ['stalking'],
    legacy: true,
  },

  // ─── Everyday police work ─────────────────────────────────────────────────
  {
    id: 'violence_bar_fight_outside',
    category: 'violence',
    code: 'KL',
    title: T('Kaklus baari ees', 'Fight outside a bar'),
    priority: 2,
    weight: 1.2,
    hours: 'nightlife',
    weekendBoost: 1.8,
    places: ['bar', 'nightclub', 'street', 'oldtown'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 2)] },
    onScene: [30, 60],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 35], intoxicated: 0.85, record: 0.4, wanted: 0.05 },
      { role: 'victim', gender: 'M', age: [18, 40], intoxicated: 0.7 },
      { role: 'witness', gender: 'M', age: [22, 45], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Baari ees kaklevad {n} noormeest, ühel on peast veri. Turvatöötajad on juures.',
        '{address}. {n} young men are fighting outside a bar; one has blood on his head. Door staff are there.',
      ),
      T(
        '{address}. Ööklubi ees kaklus, osalised joobes. Üks isik lamab maas, teadvusel.',
        '{address}. Fight outside a nightclub, those involved are drunk. One person on the ground, conscious.',
      ),
      T(
        '{address}. Turvatöötaja teatel löödi baari ees klienti rusikaga näkku. Lööja on veel kohal ja agressiivne.',
        '{address}. Door staff report a customer was punched in the face outside the bar. The attacker is still there and aggressive.',
      ),
    ],
    callerLines: [
      T(
        'Siin baari ees on kaklus, neli-viis tüüpi, üks on juba maas!',
        'There is a fight outside the bar, four or five guys, one is already down!',
      ),
      T(
        'Ma olen siin turvamees. Üks klient lõi teist, me hoiame teda kinni, aga ta rabeleb.',
        'I am the doorman. One customer hit another; we are holding him but he is struggling.',
      ),
      T(
        'Kiiresti, nad löövad teda jalaga, kui ta maas on!',
        'Quickly, they are kicking him while he is down!',
      ),
    ],
    callerLinesRu: [
      'Тут у бара драка, четыре-пять человек, один уже лежит!',
      'Я тут охранник. Один клиент ударил другого, мы его держим, но он вырывается.',
      'Быстрее, они бьют его ногами, когда он лежит!',
    ],
    details: [
      T(
        'Turvatöötaja: lööja on {suspect}, käitub agressiivselt ja ähvardab.',
        'Doorman: the attacker is {suspect}, aggressive and making threats.',
      ),
      T(
        'Üks osaline lahkus taksoga enne patrulli saabumist.',
        'One participant left in a taxi before the patrol arrived.',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive'),
      kiirabi(2, {
        chance: 0.4,
        radio: [
          T(
            '{callsign}: kannatanul lahtine haav kulmul, palun kiirabi.',
            '{callsign}: the victim has an open cut over the eye, request an ambulance.',
          ),
        ],
      }),
      choice(
        6,
        [
          T(
            '{callsign}: lööja on tugevas joobes ja sõimab. Kannatanu avaldust teha ei taha. Kuidas toimime?',
            '{callsign}: the attacker is very drunk and abusive. The victim does not want to file a complaint. How do we proceed?',
          ),
        ],
        [
          opt(
            'detain',
            T('Pidage kinni kahtlustatavana', 'Detain as a suspect'),
            T(
              '{callsign}, juhtimine. Pidage kinni, kehaline väärkohtlemine on avaliku menetluse asi.',
              '{callsign}, Control. Detain him; assault is prosecuted regardless of the victim.',
            ),
            {
              success: 0.1,
              arrests: 1,
              time: 25,
            },
          ),
          opt(
            'sober',
            T('Toimetage kainenema', 'Take him to sober up'),
            T(
              '{callsign}, juhtimine. Toimetage kainenema, menetlus hommikul.',
              '{callsign}, Control. Take him to sober up; proceedings in the morning.',
            ),
            { success: 0.05, time: 15 },
          ),
          opt(
            'warn',
            T('Hoiatus, laske minna', 'Warn and release'),
            T(
              '{callsign}, juhtimine. Tehke hoiatus ja saatke laiali.',
              '{callsign}, Control. Give a warning and disperse them.',
            ),
            { success: -0.1, trust: -1, time: -10 },
          ),
        ],
        'sober',
      ),
      toArrest(12, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        3,
        T(
          'Ründaja peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'The attacker was detained and taken to the arrest house. Criminal proceedings opened under KarS § 121.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'sober',
        'report',
        [0.4, 0.75],
        3,
        T(
          'Lööja toimetati kainenema, kannatanult võeti avaldus. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'The attacker was taken to sober up and the victim filed a complaint. Criminal proceedings opened under KarS § 121.',
        ),
      ),
      oc(
        'fine',
        'fine',
        [0.25, 0.55],
        2,
        T(
          'Osalised rahunesid. Kahele isikule koostati väärteoprotokoll avaliku korra rikkumise eest (KarS § 262).',
          'The parties calmed down. Two people were fined for breach of public order (KarS § 262).',
        ),
      ),
      oc(
        'scattered',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Kaklejad hajusid enne patrulli saabumist, lööja jäi tuvastamata. Kannatanu pöördub ise EMO-sse.',
          'The fighters scattered before the patrol arrived and the attacker was not identified. The victim will go to A&E himself.',
        ),
        { trust: -2 },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.25,
      toPriority: 1,
      text: T(
        'Teataja täpsustab: kakluses võeti välja nuga, üks isik veritseb tugevalt.',
        'Caller update: a knife has been drawn and one person is bleeding heavily.',
      ),
    },
    interactiveChance: 0.2,
    call: {
      mood: 'panic',
      opening: [T('Baari ees on kaklus, tulge kiiresti!', 'There is a fight outside the bar, come quickly!')],
      openingRu: ['Возле бара драка, человек пять, одного уже повалили на землю!'],
      answers: {
        count: [
          T(
            'Neli-viis meest, kaks kaklevad kõige rohkem.',
            'Four or five men, two are doing most of the fighting.',
          ),
        ],
        injured: [
          T('Ühel on pea katki, ta istub maas.', 'One has a cut on his head, he is sitting on the ground.'),
        ],
        weapons: [
          T(
            'Relvi ma ei näe, ainult rusikad. Üks viskas pudeli.',
            'I do not see weapons, only fists. One threw a bottle.',
          ),
        ],
        intoxicated: [
          T('Kõik on täis, nad tulid just baarist.', 'They are all drunk, they just came out of the bar.'),
        ],
      },
      answersRu: {
        count: ['Четыре-пять мужиков, двое больше всех дерутся.'],
        injured: ['У одного голова разбита, он сидит на земле.'],
        weapons: ['Оружия не вижу, только кулаки. Один бутылку бросил.'],
        intoxicated: ['Все пьяные, они только что из бара вышли.'],
      },
    },
    tags: ['alcohol', 'fight'],
    scenarios: SC_BAR_FIGHT,
  },
  {
    id: 'violence_bus_stop_beating',
    category: 'violence',
    code: 'KV',
    title: T('Peksmine bussipeatuses', 'Beating at a bus stop'),
    priority: 1,
    weight: 0.35,
    hours: 'night',
    weekendBoost: 1.4,
    places: ['busstation', 'street', 'trainstation'],
    units: { need: [un('any', 2)], ideal: [un('patrol', 2)] },
    onScene: [40, 80],
    persons: [
      { role: 'victim', gender: 'M', age: [16, 75], intoxicated: 0.4 },
      { role: 'suspect', gender: 'M', age: [16, 30], record: 0.5, intoxicated: 0.6, wanted: 0.05 },
      { role: 'suspect', gender: 'M', age: [16, 30], record: 0.3, intoxicated: 0.5 },
      { role: 'witness', gender: 'any', age: [18, 70] },
    ],
    summary: [
      T(
        '{address}. Bussipeatuses peksavad kaks-kolm noormeest maas lamavat meest jalgadega. Vägivald käimas.',
        '{address}. Two or three young men are kicking a man lying at a bus stop. Violence in progress.',
      ),
      T(
        '{address}. Ootepaviljonis rünnati üksikut reisijat, ründajad löövad teda edasi. Kannatanu ei reageeri.',
        '{address}. A lone passenger was attacked in the shelter and is still being hit. Victim not responding.',
      ),
    ],
    callerLines: [
      T(
        'Bussipeatuses peksavad meest! Ta lamab maas ja nad löövad teda jalaga pähe!',
        'They are beating a man at the bus stop! He is on the ground and they are kicking him in the head!',
      ),
      T(
        'Ma olen bussis. Nägin aknast, kuidas kolm tüüpi ründasid üht vanemat meest. Juht peatas bussi.',
        'I am on the bus. Through the window I saw three guys attack an older man. The driver has stopped the bus.',
      ),
    ],
    callerLinesRu: [
      'На остановке бьют мужчину! Он лежит на земле, а они бьют его ногами по голове!',
      'Я в автобусе. Из окна {видел|видела}, как трое напали на пожилого мужчину. Водитель остановил автобус.',
    ],
    details: [
      T(
        'Ründajad: {suspect} ja veel kaks noormeest. Nad lahkusid {direction}.',
        'Attackers: {suspect} and two more young men. They left {direction}.',
      ),
      T(
        'Kannatanu on teadvusel, kuid segaduses, peast veritseb.',
        'The victim is conscious but confused and bleeding from the head.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Peavigastus', 'Head injury') }],
    beats: [
      kiirabi('arrive', {
        radio: [
          T(
            '{callsign}, kohal. Mees peavigastusega, segaduses. Kiirabi on vaja kiiresti.',
            '{callsign}, on scene. Man with a head injury, confused. We need the ambulance fast.',
          ),
        ],
      }),
      search(
        4,
        1,
        [
          T(
            '{callsign}: ründajad lahkusid enne meie saabumist, vaatame ümbruse läbi.',
            '{callsign}: the attackers left before we arrived, sweeping the area.',
          ),
        ],
        0.6,
      ),
      qPerson('suspect', 12, {
        chance: 0.6,
        radio: [
          T(
            '{callsign}: peatasime kirjeldusele vastava noormehe. {name}, isikukood {idcode}. Palun kontrolli.',
            '{callsign}: we stopped a young man matching the description. {name}, ID code {idcode}. Please check.',
          ),
        ],
      }),
      toArrest(20, { chance: 0.5 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        3,
        T(
          'Kaks ründajat tabati lähistel ja peeti kinni. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'Two attackers were caught nearby and detained. Criminal proceedings opened under KarS § 121.',
        ),
        { arrests: 2, injuries: 1, trust: 4 },
      ),
      oc(
        'report',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Kannatanu toimetati haiglasse. Ründajad on tuvastatud valvekaamera salvestiselt, menetlus jätkub.',
          'The victim was taken to hospital. The attackers were identified from CCTV and the investigation continues.',
        ),
        { injuries: 1 },
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Ründajad jäid tabamata. Kannatanu viidi haiglasse.',
          'The attackers were not caught. The victim was taken to hospital.',
        ),
        { injuries: 1, trust: -3 },
      ),
      oc(
        'severe',
        'hospital',
        [0, 0.2],
        1,
        T(
          'Kannatanul tuvastati raske peatrauma ja ta viidi intensiivravisse. Menetlus jätkub KarS § 118 järgi.',
          'The victim was found to have a serious head injury and was taken to intensive care. The case continues under KarS § 118.',
        ),
        { injuries: 1, trust: -5 },
      ),
    ],
    interactiveChance: 0.35,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Bussipeatuses peksavad inimest, ta ei liigu enam!',
          'They are beating someone at the bus stop, he is not moving any more!',
        ),
      ],
      openingRu: ['На остановке человека бьют, он уже не двигается!'],
      answers: {
        count: [T('Kolm noort meest.', 'Three young men.')],
        injured: [T('Ta lamab maas, peast tuleb verd.', 'He is lying on the ground, his head is bleeding.')],
        direction: [T('Nüüd nad jooksevad {direction}.', 'Now they are running {direction}.')],
        suspect: [
          T(
            'Üks on punases dressipluusis, teistel tumedad jakid.',
            'One is in a red hoodie, the others in dark jackets.',
          ),
        ],
      },
      answersRu: {
        count: ['Трое молодых парней.'],
        injured: ['Он лежит на земле, из головы кровь идёт.'],
        direction: ['Теперь они убегают {direction}.'],
        suspect: ['Один в красной толстовке, остальные в тёмных куртках.'],
      },
    },
    tags: ['fight'],
  },
  {
    id: 'violence_threatening',
    category: 'violence',
    code: 'ÄH',
    title: T('Ähvardamine', 'Threats'),
    priority: 3,
    weight: 1.0,
    hours: 'evening',
    places: ['residential', 'house', 'street', 'shop'],
    units: { need: [un('patrol', 1)] },
    onScene: [30, 60],
    persons: [
      { role: 'victim', gender: 'any', age: [25, 80] },
      {
        role: 'suspect',
        gender: 'M',
        age: [25, 65],
        record: 0.4,
        intoxicated: 0.5,
        relation: 'neighbour',
        known: true,
        weapon: 0.05,
      },
    ],
    summary: [
      T(
        '{address}. Teataja sõnul ähvardas naaber teda tappa ja lubas maja põlema panna. Ähvardaja on hetkel oma korteris.',
        '{address}. The caller says a neighbour threatened to kill him and set the house on fire. The man is in his flat now.',
      ),
      T(
        '{address}. Tuttav mees ähvardab teatajat sõnumite ja kõnedega, lubab tulla kohale "asja klaarima".',
        '{address}. A man the caller knows is threatening him by text and phone, saying he will come round to "sort it out".',
      ),
      T(
        '{address}. Trepikojas ähvardas joobes mees teatajat peksta ja läks seejärel oma korterisse. Relvi ei nähtud.',
        '{address}. A drunk man threatened to beat the caller in the stairwell and then went into his flat. No weapons seen.',
      ),
    ],
    callerLines: [
      T(
        'Naaber ütles otse, et tapab mu ära. Ma ei julge enam uksest välja minna.',
        'My neighbour told me straight out he would kill me. I do not dare leave the flat any more.',
      ),
      T(
        'Ta saadab mulle juba kolmandat päeva sõnumeid, et teab, kus ma elan.',
        'He has been texting me for three days that he knows where I live.',
      ),
    ],
    details: [
      T(
        'Ähvardaja on {suspect}. Varem on olnud tülisid parkimise ja müra pärast.',
        'The man making threats is {suspect}. There have been earlier rows about parking and noise.',
      ),
      T('Teataja on ähvardavad sõnumid salvestanud.', 'The caller has saved the threatening messages.'),
    ],
    beats: [
      qPerson('suspect', 'arrive'),
      choice(
        10,
        [
          T(
            '{callsign}: ähvardaja väidab, et see oli nali. Teataja kardab tõsiselt. Kas peame isiku kinni?',
            '{callsign}: the man says it was a joke. The caller is genuinely scared. Do we detain him?',
          ),
        ],
        [
          opt(
            'detain',
            T('Pidage kinni', 'Detain'),
            T(
              '{callsign}, juhtimine. Pidage kinni kahtlustatavana, oht on reaalne.',
              '{callsign}, Control. Detain as a suspect, the threat is real.',
            ),
            { success: 0.05, arrests: 1, time: 25 },
          ),
          opt(
            'report',
            T('Võtke avaldus, menetlus vabaduses', 'Take a complaint, no detention'),
            T(
              '{callsign}, juhtimine. Võtke avaldus ja hoiatage isikut.',
              '{callsign}, Control. Take a complaint and warn him.',
            ),
            { success: 0.05, time: 10 },
          ),
          opt(
            'mediate',
            T('Lepitage pooled', 'Mediate'),
            T(
              '{callsign}, juhtimine. Proovige pooled lepitada.',
              '{callsign}, Control. Try to mediate between them.',
            ),
            { success: -0.05, trust: -1 },
          ),
        ],
        'report',
      ),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.45, 1],
        3,
        T(
          'Võeti vastu avaldus, alustati kriminaalmenetlust KarS § 120 järgi. Ähvardajat hoiatati.',
          'A complaint was taken and criminal proceedings opened under KarS § 120. The man was warned.',
        ),
        { trust: 1 },
      ),
      oc(
        'arrest',
        'arrest',
        [0.7, 1],
        1,
        T(
          'Ähvardaja peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 120 järgi.',
          'The man was detained and taken to the arrest house. Criminal proceedings opened under KarS § 120.',
        ),
        { arrests: 1 },
      ),
      oc(
        'warning',
        'warning',
        [0.2, 0.6],
        2,
        T(
          'Pooled lepitati ja teataja avaldust ei esitanud. Ähvardajat hoiatati kriminaalvastutusest.',
          'The parties were reconciled and no complaint was filed. The man was warned about criminal liability.',
        ),
      ),
      oc(
        'nothing',
        'unfounded',
        [0, 0.35],
        1,
        T(
          'Ähvardajat kodus ei olnud ja teataja loobus avaldusest. Sündmus lõpetati.',
          'The man was not at home and the caller withdrew the complaint. The event was closed.',
        ),
        { trust: -1 },
      ),
    ],
    escalation: {
      afterMin: 45,
      chance: 0.15,
      toPriority: 2,
      text: T(
        'Teataja: ähvardaja seisab ukse taga ja peksab ust.',
        'Caller: the man is standing outside the door and pounding on it.',
      ),
    },
    tags: ['threat'],
    scenarios: SC_THREATENING,
  },
  {
    id: 'violence_knife_threat',
    category: 'violence',
    code: 'ÄH',
    title: T('Noaga ähvardamine', 'Threatening with a knife'),
    priority: 1,
    weight: 0.3,
    hours: 'flat',
    places: ['street', 'shop', 'residential', 'park', 'busstation'],
    units: { need: [un('any', 2)], ideal: [un('rapid', 1), un('patrol', 1)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 55], intoxicated: 0.7, record: 0.6, wanted: 0.1 },
      { role: 'witness', gender: 'any', age: [18, 70] },
    ],
    summary: [
      T(
        '{address}. Mees vehib noaga ja ähvardab möödujaid. Liigub {direction}. Joobes.',
        '{address}. A man is waving a knife and threatening passers-by. Moving {direction}. Intoxicated.',
      ),
      T(
        '{address}. Kaupluse ees seisab mees, käes suur nuga, ja karjub, et "lööb kõik maha". Inimesed on eemaldunud.',
        '{address}. A man with a large knife is standing outside a shop, shouting that he will "kill everyone". People have moved away.',
      ),
    ],
    callerLines: [
      T(
        'Siin on mees noaga! Ta karjub ja vehib sellega, inimesed jooksevad eest ära!',
        'There is a man with a knife here! He is shouting and waving it, people are running away!',
      ),
      T(
        'Ma olen poe sees, uksed panime lukku. Ta seisab otse ukse taga.',
        'I am inside the shop, we have locked the doors. He is standing right outside.',
      ),
    ],
    callerLinesRu: [
      'Тут мужчина с ножом! Он орёт и размахивает им, люди разбегаются!',
      'Я в магазине, мы закрыли двери. Он стоит прямо за дверью.',
    ],
    details: [
      T(
        'Isik: {suspect}. Räägib iseendaga, võib olla psüühikahäirega.',
        'Subject: {suspect}. Talking to himself, may have a mental disorder.',
      ),
      T(
        'Teataja täpsustab: mees on purjus ja tal on käes kööginuga.',
        'Caller update: the man is drunk and holding a kitchen knife.',
      ),
    ],
    beats: [
      backup(0.5, un('rapid'), {
        at: 'arrive',
        radio: [
          T(
            '{callsign}: mees noaga, ei allu korraldustele. Vajame kiirreageerijaid!',
            '{callsign}: man with a knife, not complying. We need rapid response!',
          ),
        ],
      }),
      choice(
        2,
        [
          T(
            '{callsign}: mees seisab noaga poe ees, ei allu. Kas ootame kiirreageerijaid, sekkume kohe või proovime rääkida?',
            '{callsign}: the man is standing outside the shop with the knife, not complying. Wait for rapid response, go in now, or try talking?',
          ),
        ],
        [
          opt(
            'wait',
            T('Hoidke distantsi, oodake', 'Keep distance and wait'),
            T(
              '{callsign}, juhtimine. Hoidke distantsi ja isoleerige ala, abi tuleb.',
              '{callsign}, Control. Keep your distance and isolate the area, help is coming.',
            ),
            { time: 10, success: 0.05, risk: -0.05 },
          ),
          opt(
            'engage',
            T('Sekkuge kohe', 'Engage now'),
            T(
              '{callsign}, juhtimine. Sekkuge, kasutage erivahendeid.',
              '{callsign}, Control. Engage, use your equipment.',
            ),
            { success: 0.05, risk: 0.15, time: -5 },
          ),
          opt(
            'talk',
            T('Alustage läbirääkimisi', 'Start talking'),
            T(
              '{callsign}, juhtimine. Proovige rahulikult rääkida, ärge minge lähemale.',
              '{callsign}, Control. Try talking calmly, do not get closer.',
            ),
            { time: 15, success: 0.1 },
          ),
        ],
        'wait',
        { timeoutMin: 3 },
      ),
      qPerson('suspect', 10),
      toArrest(15, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Mees desarmeeriti ja peeti kinni. Alustati kriminaalmenetlust KarS § 120 järgi, nuga võeti asitõendiks.',
          'The man was disarmed and detained. Criminal proceedings opened under KarS § 120; the knife was seized as evidence.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'psych',
        'hospital',
        [0.4, 0.8],
        2,
        T(
          'Isik rahunes läbirääkimiste järel, loovutas noa ja toimetati psühhiaatrilisele läbivaatusele.',
          'The man calmed down after talking, handed over the knife and was taken for a psychiatric assessment.',
        ),
      ),
      oc(
        'hurt',
        'hospital',
        [0.2, 0.55],
        1,
        T(
          'Isik peeti kinni, kuid vigastas end ja toimetati haiglasse. Menetlus jätkub.',
          'The man was detained but injured himself and was taken to hospital. Proceedings continue.',
        ),
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees põgenes enne patrulli saabumist, nuga leiti prügikastist. Isik on tuvastamisel.',
          'The man fled before the patrol arrived; the knife was found in a bin. He is being identified.',
        ),
        { trust: -2 },
      ),
      oc(
        'victim',
        'tragedy',
        [0, 0.12],
        1,
        T(
          'Mees vigastas noaga möödujat. Kannatanu toimetati haiglasse, ründaja peeti kinni.',
          'The man injured a passer-by with the knife. The victim was taken to hospital; the attacker was detained.',
        ),
        { arrests: 1, injuries: 1, trust: -6 },
      ),
    ],
    interactiveChance: 0.4,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mees noaga! Ta karjub, et tapab kõik!',
          'A man with a knife! He is shouting he will kill everyone!',
        ),
      ],
      openingRu: ['Мужик с ножом бегает возле магазина, кричит, что всех порежет!'],
      answers: {
        weapons: [T('Suur kööginuga, ta hoiab seda kõrgel.', 'A big kitchen knife, he is holding it up.')],
        injured: [T('Veel keegi viga pole saanud, ma arvan.', 'Nobody has been hurt yet, I think.')],
        suspect: [T('Umbes neljakümnene, hall jope, habe.', 'About forty, grey jacket, beard.')],
        intoxicated: [T('Ta on täiesti purjus, kõigub.', 'He is completely drunk, swaying.')],
        safe: [T('Me oleme poes, uksed on lukus.', 'We are in the shop, the doors are locked.')],
      },
      answersRu: {
        weapons: ['Большой кухонный нож, он держит его над головой.'],
        injured: ['Вроде пока никто не пострадал.'],
        suspect: ['Лет сорока, серая куртка, борода.'],
        intoxicated: ['Он в стельку пьяный, шатается.'],
        safe: ['Мы в магазине, двери закрыты.'],
      },
    },
    tags: ['armed', 'weapon_knife'],
  },
  {
    id: 'violence_firearm_threat',
    category: 'violence',
    code: 'TR',
    title: T('Relvataolise esemega ähvardamine', 'Threatening with a gun-like object'),
    priority: 1,
    weight: 0.15,
    hours: 'flat',
    places: ['street', 'parking', 'residential', 'busstation', 'gasstation'],
    units: { need: [un('any', 2)], ideal: [un('rapid', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 50], weapon: 0.3, record: 0.4, intoxicated: 0.5 },
      { role: 'witness', gender: 'any', age: [18, 70] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect', noInsurance: 0.1 }],
    summary: [
      T(
        '{address}. Mees vehib püstolitaolise esemega ja ähvardab teisi. Tume jope, liigub {direction}.',
        '{address}. A man is waving a gun-like object and threatening people. Dark jacket, moving {direction}.',
      ),
      T(
        '{address}. Parklas sihtis autojuht teist juhti püstolitaolise esemega ja istus seejärel autosse. Auto: {car}.',
        '{address}. In a car park a driver pointed a gun-like object at another driver and then got into a {car}.',
      ),
    ],
    callerLines: [
      T(
        'Tal on püstol! Ta sihtis mind ja ütles, et laseb maha!',
        'He has a gun! He pointed it at me and said he would shoot!',
      ),
      T(
        'Ma ei tea, kas see on päris relv, aga ta näitab seda kõigile ja naerab.',
        'I do not know if it is a real gun, but he is showing it to everyone and laughing.',
      ),
    ],
    callerLinesRu: [
      'У него пистолет! Он целился в меня и сказал, что застрелит!',
      'Не знаю, настоящий ли пистолет, но он всем его показывает и смеётся.',
    ],
    details: [
      T(
        'Teataja täpsustab: auto number {plate}, mees istub roolis.',
        'Caller update: the car is {plate}, the man is in the driver’s seat.',
      ),
      T('Isik: {suspect}.', 'Subject: {suspect}.'),
    ],
    beats: [
      backup(0.6, un('rapid'), {
        at: 'arrive',
        radio: [
          T(
            '{callsign}: isik võib olla relvastatud, vajame kiirreageerijaid!',
            '{callsign}: subject may be armed, we need rapid response!',
          ),
        ],
      }),
      qVehicle('arrive', {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Kahtlustatava sõiduk {plate} seisab parklas, isik sees. Palun kontrolli kiiresti.',
            'Control, {callsign}. Suspect vehicle {plate} is in the car park, subject inside. Run it quickly please.',
          ),
        ],
      }),
      choice(
        3,
        [
          T(
            '{callsign}: isik istub autos, relv võib olla käeulatuses. Kas blokeerime auto ja kutsume ta välja või ootame kiirreageerijaid?',
            '{callsign}: subject is in the car, the weapon may be within reach. Do we box the car in and call him out, or wait for rapid response?',
          ),
        ],
        [
          opt(
            'block',
            T('Blokeerige ja kutsuge välja', 'Box in and call him out'),
            T(
              '{callsign}, juhtimine. Blokeerige sõiduk, käsklused selgelt.',
              '{callsign}, Control. Box the vehicle in, give clear commands.',
            ),
            { success: 0.05, risk: 0.12 },
          ),
          opt(
            'wait',
            T('Jälgige, oodake kiirreageerijaid', 'Observe, wait for rapid response'),
            T(
              '{callsign}, juhtimine. Jälgige kaugelt, kiirreageerijad on teel.',
              '{callsign}, Control. Observe from a distance, rapid response is on the way.',
            ),
            { time: 10, success: 0.05, risk: -0.05 },
          ),
        ],
        'wait',
      ),
      qPerson('suspect', 10),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Isik peeti kinni, relvaks osutus gaasipüstol. Relv võeti ära, alustati kriminaalmenetlust KarS § 120 järgi.',
          'The man was detained; the weapon turned out to be a gas pistol. It was seized and criminal proceedings opened under KarS § 120.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'airsoft',
        'fine',
        [0.35, 0.75],
        2,
        T(
          'Relvaks osutus õhkrelv. Isikule koostati väärteoprotokoll avaliku korra rikkumise eest ja relv konfiskeeriti.',
          'The weapon was an airsoft gun. The man was fined for breach of public order and the gun was confiscated.',
        ),
      ),
      oc(
        'drill',
        'false_alarm',
        [0.2, 0.7],
        1,
        T(
          'Teataja pidas relvaks musta akutrelli. Ohtu ei olnud.',
          'The caller mistook a black cordless drill for a gun. There was no danger.',
        ),
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Isik lahkus sõidukiga enne patrulli saabumist. Sõiduk on tagaotsitav.',
          'The man drove off before the patrol arrived. The vehicle is on the BOLO list.',
        ),
        { trust: -3 },
      ),
    ],
    falseAlarmChance: 0.15,
    interactiveChance: 0.4,
    call: {
      mood: 'whisper',
      opening: [
        T(
          '(sosinal) Ma peitsin end auto taha... tal on püstol.',
          '(whispering) I am hiding behind a car... he has a gun.',
        ),
      ],
      openingRu: ['(шёпотом) Я {спрятался|спряталась} за машиной... у него пистолет.'],
      answers: {
        weapons: [T('Must püstol. Ma ei tea, kas päris.', 'A black pistol. I do not know if it is real.')],
        vehicle: [T('Ta istus autosse, number on {plate}.', 'He got into a car, the plate is {plate}.')],
        injured: [T('Keegi pole viga saanud.', 'Nobody is hurt.')],
        safe: [T('Ma olen auto taga, ta ei näe mind.', 'I am behind a car, he cannot see me.')],
      },
      answersRu: {
        weapons: ['Чёрный пистолет. Не знаю, настоящий или нет.'],
        vehicle: ['Он сел в машину, номер {plate}.'],
        injured: ['Никто не пострадал.'],
        safe: ['Я за машиной, он меня не видит.'],
      },
    },
    tags: ['armed', 'weapon_firearm'],
  },
  {
    id: 'violence_sexual_harassment',
    category: 'violence',
    code: 'SA',
    title: T('Seksuaalne ahistamine', 'Sexual harassment'),
    priority: 2,
    weight: 0.25,
    hours: 'evening',
    weekendBoost: 1.3,
    places: ['busstation', 'trainstation', 'park', 'nightclub', 'street', 'mall'],
    units: { need: [un('patrol', 1)] },
    onScene: [30, 60],
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 60], record: 0.3, intoxicated: 0.5 },
      { role: 'victim', gender: 'F', age: [15, 40] },
      { role: 'witness', gender: 'any', age: [20, 55], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Teataja sõnul katsus võõras mees teda vastu tahtmist ja järgnes talle peatusest. Mees on endiselt läheduses.',
        '{address}. The caller says a stranger touched her against her will and followed her from the stop. The man is still nearby.',
      ),
      T(
        '{address}. Turvatöötaja teatel puudutas mees korduvalt noori naisi seksuaalse alatooniga. Üks kannatanu soovib avaldust teha, mees on kinni peetud.',
        '{address}. Security reports a man repeatedly touched young women in a sexual manner. One victim wants to file a complaint; the man is being held.',
      ),
    ],
    callerLines: [
      T(
        'Üks mees katsus mind bussis ja tuli mulle järele. Ta seisab praegu teisel pool teed.',
        'A man groped me on the bus and followed me. He is standing across the road right now.',
      ),
      T(
        'Ma olen turvatöötaja. See mees ahistab tüdrukuid, me hoiame teda kinni.',
        'I am security staff. This man is harassing girls, we are holding him.',
      ),
    ],
    callerLinesRu: [
      'Один мужчина лапал меня в автобусе и пошёл за мной. Он сейчас стоит на другой стороне дороги.',
      'Я охранник. Этот мужчина пристаёт к девушкам, мы его держим.',
    ],
    details: [
      T('Kahtlustatav: {suspect}.', 'Suspect: {suspect}.'),
      T('Juhtum jäi valvekaamera salvestisele.', 'The incident was caught on CCTV.'),
    ],
    beats: [
      qPerson('suspect', 'arrive'),
      search(
        3,
        0.8,
        [
          T(
            '{callsign}: mees lahkus enne meie saabumist, vaatame ümbruse üle.',
            '{callsign}: the man left before we arrived, checking the area.',
          ),
        ],
        0.35,
      ),
      qPerson('victim', 8, { chance: 0.4 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        3,
        T(
          'Kahtlustatav peeti kinni. Alustati kriminaalmenetlust KarS § 153¹ järgi, kannatanut teavitati ohvriabi võimalustest.',
          'The suspect was detained. Criminal proceedings opened under KarS § 153¹; the victim was told about victim support services.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'report',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Kannatanu ütlused vormistati, kahtlustatav tuvastati videosalvestiselt. Menetlus jätkub.',
          'The victim’s statement was taken and the suspect identified from CCTV. The investigation continues.',
        ),
      ),
      oc(
        'gone',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Mees lahkus enne patrulli saabumist. Kirjeldus ja kaamerasalvestis edastati menetlejale.',
          'The man left before the patrol arrived. The description and CCTV were passed to an investigator.',
        ),
        { trust: -2 },
      ),
    ],
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere... üks mees katsus mind ja käib mul järel. Ma ei tea, mida teha.',
          'Hello... a man touched me and is following me. I do not know what to do.',
        ),
      ],
      openingRu: [
        'Здравствуйте... один мужчина меня лапал и теперь ходит за мной. Я не знаю, что делать.',
      ],
      answers: {
        where: [T('Bussipeatuses, {address}.', 'At the bus stop, {address}.')],
        suspect: [T('Umbes viiekümnene, hall mantel, müts.', 'About fifty, grey coat, a hat.')],
        safe: [T('Ma läksin kioski juurde, siin on inimesi.', 'I went to the kiosk, there are people here.')],
        injured: [T('Ei, füüsiliselt mitte.', 'No, not physically.')],
      },
      answersRu: {
        where: ['На автобусной остановке, {address}.'],
        suspect: ['Лет пятидесяти, серое пальто, шапка.'],
        safe: ['Я {отошёл|отошла} к киоску, тут есть люди.'],
        injured: ['Нет, физически нет.'],
      },
    },
    tags: ['sexual'],
  },
  {
    id: 'violence_road_rage',
    category: 'violence',
    code: 'KV',
    title: T('Liiklustüli lõppes löömisega', 'Road rage assault'),
    priority: 2,
    weight: 0.35,
    hours: 'commute',
    places: ['street', 'parking', 'gasstation', 'highway'],
    units: { need: [un('patrol', 1)] },
    onScene: [30, 60],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 55], record: 0.35, noLicense: 0.15, intoxicated: 0.15 },
      { role: 'victim', gender: 'any', age: [20, 70] },
    ],
    vehicles: [
      { role: 'suspect', kind: 'car', driverRole: 'suspect', noInsurance: 0.1, noInspection: 0.15 },
      { role: 'victim', kind: 'car', driverRole: 'victim' },
    ],
    summary: [
      T(
        '{address}. Kahe autojuhi vaidlus lõppes sellega, et üks juht lõi teist rusikaga. Ründaja istub oma autos.',
        '{address}. An argument between two drivers ended with one punching the other. The attacker is sitting in his car.',
      ),
      T(
        '{address}. Ristmikul lõikas sõiduk teisele ette, mõlemad peatusid ja algas kaklus. Kannatanul veritseb nina.',
        '{address}. A car cut another off at a junction, both stopped and a fight began. The victim has a bleeding nose.',
      ),
    ],
    callerLines: [
      T(
        'Ta lõikas mulle ette ja kui ma signaali andsin, tuli ta välja ja lõi mind läbi akna!',
        'He cut me off and when I honked, he got out and hit me through the window!',
      ),
      T(
        'Kaks meest kaklevad keset ristmikku, autod seisavad ja liiklus on kinni.',
        'Two men are fighting in the middle of the junction, the cars are stopped and traffic is blocked.',
      ),
    ],
    details: [
      T('Ründaja auto: {car}, {plate}.', 'Attacker’s car: {car}, {plate}.'),
      T(
        'Ründaja ähvardab lahkuda, teataja seisab tema auto ees.',
        'The attacker is threatening to leave; the caller is standing in front of his car.',
      ),
    ],
    beats: [
      qVehicle('arrive'),
      qPerson('suspect', 3, {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Ründaja on {name}, isikukood {idcode}. Palun kontrolli ka juhtimisõigust.',
            'Control, {callsign}. The attacker is {name}, ID code {idcode}. Please check the licence as well.',
          ),
        ],
      }),
      pursuit(
        1,
        [
          T(
            '{callsign}: ründaja auto lahkus kiirendades sündmuskohalt, jälitame!',
            '{callsign}: the attacker’s car sped away from the scene, we are pursuing!',
          ),
        ],
        0.12,
      ),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.5, 1],
        3,
        T(
          'Ründaja tuvastati, kannatanult võeti avaldus. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'The attacker was identified and the victim filed a complaint. Criminal proceedings opened under KarS § 121.',
        ),
        { trust: 1 },
      ),
      oc(
        'arrest',
        'arrest',
        [0.75, 1],
        1,
        T(
          'Selgus, et ründajal on juhtimisõigus peatatud. Ta peeti kinni, sõiduk teisaldati.',
          'It turned out the attacker’s licence was suspended. He was detained and the car towed.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'fines',
        'fine',
        [0.3, 0.6],
        2,
        T(
          'Mõlemad juhid olid vägivallas osalised. Neile koostati väärteoprotokollid, liiklus taastati.',
          'Both drivers took part in the violence. Both were fined and traffic was restored.',
        ),
      ),
      oc(
        'fled',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Ründaja lahkus enne patrulli saabumist. Sõiduki number on teada, menetlus jätkub.',
          'The attacker left before the patrol arrived. The plate is known and the case continues.',
        ),
        { trust: -1 },
      ),
    ],
    tags: ['traffic_related', 'vehicle_flee'],
  },
  {
    id: 'violence_school_fight',
    category: 'violence',
    code: 'KV',
    title: T('Kaklus koolis', 'Fight at school'),
    priority: 3,
    weight: 0.25,
    hours: 'business',
    months: [1, 2, 3, 4, 5, 9, 10, 11, 12],
    places: ['school'],
    units: { need: [un('any', 1)], ideal: [un('community', 1)] },
    onScene: [40, 80],
    persons: [
      { role: 'suspect', gender: 'M', age: [13, 17], record: 0.1 },
      { role: 'victim', gender: 'any', age: [12, 16] },
      { role: 'caller', gender: 'any', age: [28, 60], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Kooli sotsiaalpedagoogi teatel peksid kaks õpilast vahetunnil kolmandat, video levib sotsiaalmeedias. Kannatanul peavigastus.',
        '{address}. The school counsellor reports two pupils beat a third during break; a video is spreading on social media. Victim has a head injury.',
      ),
      T(
        '{address}. Koolimaja taga kaklesid kahe klassi poisid, üks sai tugevalt peksa. Õpetaja eraldas osalised.',
        '{address}. Boys from two classes fought behind the school; one was badly beaten. A teacher separated them.',
      ),
    ],
    callerLines: [
      T(
        'Siin koolis peksti üht õpilast, see filmiti ja laaditi üles. Lapsevanemad juba helistavad.',
        'A pupil was beaten here at school; it was filmed and uploaded. Parents are already calling.',
      ),
      T(
        'Ma olen klassijuhataja. Üks poiss on tõsiselt viga saanud, ründajad on direktori kabinetis.',
        'I am the class teacher. One boy is seriously hurt; the attackers are in the head teacher’s office.',
      ),
    ],
    details: [
      T(
        'Ründajad on 14-15-aastased, üks neist on {suspectName}.',
        'The attackers are 14-15 years old; one of them is {suspectName}.',
      ),
      T(
        'Kiusamine on kestnud kuid, kool on varem lastekaitset teavitanud.',
        'The bullying has gone on for months; the school has notified child protection before.',
      ),
    ],
    agencies: [{ agency: 'sotsiaal', chance: 0.6, reason: T('Alaealised osalised', 'Minors involved') }],
    beats: [
      qPerson('suspect', 'arrive'),
      kiirabi(2, {
        chance: 0.3,
        radio: [
          T(
            '{callsign}: kannatanu kaebab peavalu ja iiveldust, palun kiirabi kooli.',
            '{callsign}: the victim complains of headache and nausea, request an ambulance to the school.',
          ),
        ],
      }),
      agency('sotsiaal', 10, {
        chance: 0.6,
        radio: [
          T(
            '{callsign}: osalised alaealised, palun teavitage lastekaitset.',
            '{callsign}: those involved are minors, please notify child protection.',
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
          'Alustati menetlust KarS § 121 järgi. Noorsoopolitseinik vestles osalistega, teavitati vanemaid ja lastekaitset.',
          'Proceedings opened under KarS § 121. A youth officer spoke to those involved; parents and child protection were informed.',
        ),
        { trust: 2 },
      ),
      oc(
        'under14',
        'referred',
        [0.3, 0.65],
        2,
        T(
          'Ründajad olid alla 14-aastased. Juhtum edastati lastekaitsele ja kooli tugivõrgustikule.',
          'The attackers were under 14. The case was passed to child protection and the school’s support network.',
        ),
      ),
      oc(
        'unclear',
        'report',
        [0, 0.4],
        2,
        T(
          'Osalised ja tunnistajad ei soovi rääkida, video eemaldati enne salvestamist. Info edastati noorsoopolitseinikule.',
          'Those involved and witnesses will not talk, and the video was deleted before it could be saved. The information was passed to a youth officer.',
        ),
        { trust: -1 },
      ),
    ],
    tags: ['youth', 'school'],
  },
];
