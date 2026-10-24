/**
 * Põhja prefektuur: stories that only happen here (regions: ['pohja']). Tallinn's harbour, old town and
 * airport, the Muuga and Paldiski cargo ports, the Rummu quarry, the Ülemiste drinking-water lake, the closed
 * Linnahall, the embassies and the zoo. Stories tied to one or a few places use `placeTags` (tags added to the
 * places in src/data/regions/pohja.ts: cruise, cargo, quarry, reservoir, abandoned, zoo; tourist on the
 * old-town clubs).
 */
import type { IncidentTemplate } from '@/sim/types';
import { R_SUSPECT, T, agency, backup, choice, info, opt, out, qp, qv, search, u } from '../escalating';

export const TEMPLATES_REGIONAL_POHJA: IncidentTemplate[] = [
  // 1. A cruise passenger has not come back to the ship at the Vanasadam; the search goes through the old town.
  {
    id: 'missing_kruiisireisija_ei_naasnud_laevale',
    category: 'missing',
    code: 'OTS',
    title: T('Kruiisireisija ei naasnud laevale', 'Cruise passenger has not returned to the ship'),
    priority: 2,
    weight: 0.6,
    months: [5, 6, 7, 8, 9],
    hours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.8, 1.4, 1.8, 2, 2, 2, 1.8, 1.2, 0.6, 0.2, 0, 0, 0, 0],
    places: ['port'],
    placeTags: ['cruise'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [40, 90],
    persons: [
      { role: 'missing', gender: 'any', age: [72, 88] },
      { role: 'caller', gender: 'any', age: [28, 60], relation: 'employee' },
    ],
    summary: [
      T(
        '{place}, {address}. Kruiisilaeva agendi teatel ei ole {age}-aastane välismaalasest reisija vanalinnaekskursioonilt laevale naasnud. Laev väljub kahe tunni pärast.',
        '{place}, {address}. The cruise ship’s agent reports that a {age}-year-old foreign passenger has not come back from an old town excursion. The ship sails in two hours.',
      ),
      T(
        '{place}, {address}. Eakas kruiisireisija jäi vanalinnas giidiga grupist maha, tema telefon jäi kajutisse. Abikaasa sõnul on reisija kergelt segaduses ja räägib ainult saksa keelt.',
        '{place}, {address}. An elderly cruise passenger fell behind the guided group in the old town and left the phone in the cabin. The spouse says the passenger is slightly confused and speaks only German.',
      ),
      T(
        '{place}, {address}. Üks eakas reisija ei ole kruiisilaeva pardale tagasi registreerunud. Viimati nähti teda Raekoja platsil, laev peab väljuma kindlal kellaajal.',
        '{place}, {address}. An elderly passenger has not checked back on board the cruise ship. Last seen on Town Hall Square; the ship has a fixed departure time.',
      ),
    ],
    callerLines: [
      T(
        'Üks meie reisija ei ole ekskursioonilt tagasi tulnud. Ta on üle seitsmekümne ja eksib kergesti ära, laev väljub kahe tunni pärast.',
        'One of our passengers has not come back from the excursion. Over seventy, gets lost easily, and the ship sails in two hours.',
      ),
      T(
        'Grupp oli Raekoja platsil, giid luges inimesed üle ja üks oli puudu. Telefon jäi kajutisse.',
        'The group was on Town Hall Square, the guide counted everyone and one was missing. The phone was left in the cabin.',
      ),
      T(
        'Reisija abikaasa on laeval ja nutab. Ta ütleb, et reisija ei räägi muud keelt kui saksa keelt.',
        'The passenger’s spouse is on board in tears and says the passenger speaks nothing but German.',
      ),
    ],
    callerLinesRu: [
      '[Один наш пассажир не вернулся|Одна наша пассажирка не вернулась] с экскурсии. [Ему|Ей] за семьдесят, [он легко теряется|она легко теряется], а судно отходит через два часа.',
      'Группа была на Ратушной площади, гид пересчитал людей, и одного не хватило. Телефон остался в каюте.',
      '[Его жена|Её муж] на борту и плачет. Говорит, что [он|она] знает только немецкий.',
    ],
    details: [
      T(
        'Laeva arsti sõnul on reisijal diabeet ja ravimid jäid kajutisse. Ilma nendeta võib ta mõne tunni pärast segadusse sattuda või kokku kukkuda.',
        'The ship’s doctor says the passenger is diabetic and the medication was left in the cabin. Without it, confusion or a collapse may follow within a few hours.',
      ),
      T(
        'Ekskursioon käis Viru väravast Raekoja platsini ja edasi Toompeale. Agendi sõnul saab laev oodata kõige rohkem pool tundi, seejärel peab reisija järgmisse sadamasse ise jõudma.',
        'The excursion went from Viru Gate to Town Hall Square and on up to Toompea. The agent says the ship can wait half an hour at most; after that the passenger has to reach the next port alone.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: oleme sadamas, agent andis reisija foto. Agendi sõnul ootab laev kuni pool tundi, kui politsei seda palub. Kas palume laeval oodata?',
            '{callsign}: at the harbour, the agent has given us a photo of the passenger. The agent says the ship will wait up to half an hour if the police ask. Do we ask the ship to wait?',
          ),
        ],
        [
          opt(
            'hold',
            T('Palume laeval oodata', 'Ask the ship to wait'),
            T(
              '{callsign}, palume kaptenil väljumisega oodata, foto ja kirjeldus lähevad kõigile kesklinna ekipaažidele.',
              '{callsign}, we will ask the captain to hold the ship; the photo and description are going out to all city centre crews.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'sail',
            T('Laeval pole vaja oodata', 'No need for the ship to wait'),
            T(
              '{callsign}, laeval pole vaja oodata, agent jääb reisija kontaktiks ja korraldab edasise.',
              '{callsign}, the ship need not wait; the agent stays as the passenger’s contact and arranges the rest.',
            ),
            { success: -0.05 },
          ),
        ],
        'sail',
      ),
      search(2, 1.5, [
        T(
          '{callsign}: alustame otsinguid sadama ja vanalinna vahel. Kontrollime Raekoja platsi, Pikka jalga ja vaateplatvorme.',
          '{callsign}: starting the search between the harbour and the old town. Checking Town Hall Square, Pikk jalg and the viewing platforms.',
        ),
      ]),
      agency(
        'kiirabi',
        12,
        [
          T(
            '{callsign}: reisija istub Toompea vaateplatvormi juures pingil, ta on segaduses ja higine, ilmselt madal veresuhkur. Palun kiirabi.',
            '{callsign}: the passenger is sitting on a bench by the Toompea viewing platform, confused and sweating, probably low blood sugar. Ambulance please.',
          ),
        ],
        { chance: 0.4, timeoutMin: 5, ok: { success: 0.05, outcome: 'weak' }, fail: { success: -0.2, trust: -3, outcome: 'weak' } },
      ),
    ],
    outcomes: [
      out(
        'back_on_board',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Reisija leiti Raekoja platsi lähedalt kohvikust, kus ta oli grupi tagasitulekut oodanud. Patrull viis ta sadamasse ja ta jõudis enne väljumist laevale.',
          'The passenger was found in a café near Town Hall Square, waiting for the group to come back. The patrol drove the passenger to the harbour in time for the sailing.',
        ),
        { trust: 2, radio: T('{callsign}: reisija leitud, viisime laevale, lõpetame.', '{callsign}: passenger found and taken back to the ship, closing.') },
      ),
      out(
        'next_port',
        'referred',
        [0.4, 0.85],
        2,
        T(
          'Reisija leiti Kadrioru pargist alles pärast laeva väljumist. Agent korraldas talle ööbimise ja lennu järgmisse sadamasse, abikaasa tuli laevalt maha tema juurde.',
          'The passenger was found in Kadriorg park only after the ship had sailed. The agent arranged a hotel and a flight to the next port; the spouse came ashore to join the passenger.',
        ),
        { radio: T('{callsign}: reisija leitud, laev läinud, agent korraldab edasi.', '{callsign}: passenger found, the ship has gone, the agent takes over.') },
      ),
      out(
        'weak',
        'hospital',
        [0.2, 0.7],
        2,
        T(
          'Reisija leiti nõrkenuna ja segaduses. Kiirabi viis ta madala veresuhkruga haiglasse, agent tõi abikaasa laevalt tema juurde.',
          'The passenger was found weak and confused. The ambulance took the passenger to hospital with low blood sugar, and the agent brought the spouse from the ship.',
        ),
        { injuries: 1, radio: T('{callsign}: reisija leitud nõrkenuna, kiirabiga haiglasse.', '{callsign}: passenger found weak, taken to hospital by ambulance.') },
      ),
      out(
        'fall',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Reisija oli kukkunud Lühikese jala trepil ja möödujad kutsusid abi. Ta toimetati puusaluumurruga haiglasse, laev väljus ilma temata.',
          'The passenger had fallen on the Lühike jalg steps and passers-by called for help. The passenger was taken to hospital with a broken hip and the ship sailed without them.',
        ),
        { injuries: 1, radio: T('{callsign}: reisija kukkunud trepil, luumurruga haiglasse.', '{callsign}: passenger fell on the steps, to hospital with a fracture.') },
      ),
      out(
        'not_found',
        'unfounded',
        [0, 0.1],
        1,
        T(
          'Reisijat õhtuks ei leitud ja laev väljus ilma temata. Tema kirjeldus edastati kõigile ekipaažidele ja haiglatele, otsingud jätkuvad.',
          'The passenger had not been found by the evening and the ship sailed without them. The description went out to all crews and hospitals; the search continues.',
        ),
        { radio: T('{callsign}: reisijat ei leitud, otsingud jätkuvad.', '{callsign}: passenger not found, the search continues.') },
      ),
    ],
    escalation: {
      afterMin: 25,
      chance: 0.4,
      toPriority: 1,
      text: T(
        'Möödujad teatavad: Lühikese jala trepil kukkus eakas välismaalane, ta on segaduses ega tõuse. Kas see on otsitav reisija, pole veel selge.',
        'Passers-by report: an elderly foreigner has fallen on the Lühike jalg steps, confused and not getting up. Whether it is the missing passenger is not yet clear.',
      ),
    },
    expiresMin: 120,
    interactiveChance: 0.2,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Ma olen kruiisilaeva agent. Üks meie eakas reisija ei ole vanalinnast laevale tagasi tulnud ja laev väljub kahe tunni pärast.',
          'I am the cruise ship’s agent. One of our elderly passengers has not come back to the ship from the old town, and the ship sails in two hours.',
        ),
        T(
          'Meil on üks reisija puudu. Ta jäi giidiga grupist maha, telefon on kajutis ja ta räägib ainult saksa keelt.',
          'We are one passenger short. The passenger fell behind the guided group, the phone is in the cabin and the passenger speaks only German.',
        ),
      ],
      answers: {
        when: [
          T(
            'Giid märkas Raekoja platsil, et üks on puudu. Grupp otsis veel natuke ja jõudis bussiga laevale tund aega tagasi.',
            'The guide noticed on Town Hall Square that one was missing. The group searched a little longer and got back to the ship by coach an hour ago.',
          ),
        ],
        injured: [T('Seda me ei tea, me ei tea ju, kus reisija on.', 'We do not know that, we do not know where the passenger is.')],
        count: [T('Puudu on üks reisija, abikaasa on laeval.', 'One passenger is missing; the spouse is on board.')],
      },
      answersRu: {
        when: ['Гид на Ратушной площади заметил, что одного не хватает. Группа ещё немного поискала и час назад вернулась на автобусе на судно.'],
        injured: ['Этого мы не знаем, мы же не знаем, где [он|она].'],
        count: ['Не хватает одного пассажира, [его жена|её муж] на борту.'],
      },
      openingRu: [
        'Я агент круизного судна. [Один наш пожилой пассажир не вернулся|Одна наша пожилая пассажирка не вернулась] из старого города, а судно отходит через два часа.',
        'У нас не хватает одного пассажира. [Он отстал|Она отстала] от группы с гидом, телефон в каюте, и [он говорит|она говорит] только по-немецки.',
      ],
    },
    tags: ['tourists', 'elderly', 'cruise'],
  },

  // 2. Day-trippers off the Helsinki ferry, drunk with their trolleys of crates, fight at the terminal.
  {
    id: 'public_order_paevareisijad_terminalis',
    category: 'public_order',
    code: 'AK',
    title: T('Joobes päevareisijad sadamaterminalis', 'Drunk day-trippers at the ferry terminal'),
    priority: 3,
    weight: 2.0,
    hours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.4, 0.6, 0.8, 1, 1.3, 1.6, 2, 2.2, 2.2, 2, 1.6, 0.8, 0],
    weekendBoost: 1.6,
    places: ['port'],
    placeTags: ['tourist'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [20, 50],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 60], intoxicated: 0.95, record: 0.1 },
      { role: 'victim', gender: 'any', age: [20, 60], relation: 'employee' },
      { role: 'caller', gender: 'M', age: [25, 60], relation: 'employee' },
    ],
    summary: [
      T(
        '{place}, {address}. Terminali turvatöötaja teatel ei lasta joobes päevareisijate seltskonda laevale. Üks mees lõi laevafirma töötajat, seltskond lärmab õllekastidega väravas.',
        '{place}, {address}. Terminal security report that a group of drunk day-trippers is being refused boarding. One man hit a member of the shipping line’s staff; the group is making a racket at the gate with their crates of beer.',
      ),
      T(
        '{place}, {address}. Terminali ees kaklevad joobes reisijad, ümberringi on kärudel alkoholikastid ja purunenud pudelid. Laev väljub poole tunni pärast.',
        '{place}, {address}. Drunk passengers are fighting outside the terminal among trolleys of alcohol crates and broken bottles. The ship sails in half an hour.',
      ),
      T(
        '{place}, {address}. Laevale minev seltskond on täiesti purjus, loobib purke ja keeldub terminalist lahkumast. Turvatöötajaid on kaks.',
        '{place}, {address}. A group heading for the ship is completely drunk, throwing cans and refusing to leave the terminal. There are two security guards.',
      ),
    ],
    callerLines: [
      T(
        'Siin on seltskond, kes on terve päeva joonud. Laevale neid ei lasta ja nüüd üks läks meie töötajale kallale.',
        'There is a group here that has been drinking all day. They are not being let on the ship and now one of them has gone for our staff.',
      ),
      T(
        'Neil on kärudega õllekastid, purgid lendavad ja üks mees kukkus juba trepil. Meid on ainult kaks.',
        'They have crates of beer on trolleys, cans are flying and one man has already fallen on the stairs. There are only two of us.',
      ),
      T(
        'Laev läheb poole tunni pärast ja nad ütlevad, et jäävad siis siia ööseks.',
        'The ship goes in half an hour and they say they will just stay here for the night then.',
      ),
    ],
    callerLinesRu: [
      'Тут компания, которая весь день пила. На паром их не пускают, и теперь один набросился на нашего работника.',
      'У них на тележках ящики с пивом, банки летают, один уже упал на лестнице. Нас всего двое.',
      'Паром уходит через полчаса, а они говорят, что тогда останутся тут ночевать.',
    ],
    details: [
      T(
        'Turvatöötaja sõnul on seltskonnas kuus-seitse meest ja nad tülitsevad juba omavahel. Turvamehed ei suuda neid kaua lahus hoida.',
        'The guard says there are six or seven men in the group and they are already quarrelling among themselves. The guards cannot keep them apart for long.',
      ),
      T(
        'Laevafirma keeldus joobes reisijaid pardale võtmast, nende piletid kehtivad järgmisele väljumisele.',
        'The shipping line refused to take the drunk passengers on board; their tickets are valid for the next sailing.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, terminali ees on kümmekond inimest, kastid alkoholi ja pudelikillud. Turvamehed hoiavad töötajat löönud meest kinni.',
          '{callsign}: on scene, a dozen people, crates of alcohol and broken glass in front of the terminal. The guards are holding the man who hit their colleague.',
        ),
      ]),
      choice(
        4,
        [
          T(
            '{callsign}: töötajat löönud mees on väga purjus ega suuda enda eest hoolitseda. Sõbrad lubavad ta järgmise laevaga koju viia. Kas jätame ta nende hoolde?',
            '{callsign}: the man who hit the staff member is very drunk and cannot look after himself. His friends promise to take him home on the next ship. Do we leave him with them?',
          ),
        ],
        [
          opt(
            'sober',
            T('Kainenema, seletused kannatanult', 'To sober up, statements from the victim'),
            T(
              '{callsign}, toimetage löönud mees kainenema, võtke kannatanult ja turvatöötajalt seletused.',
              '{callsign}, take the man who hit out to sober up and take statements from the victim and the guard.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'friends',
            T('Jätke sõprade hoolde', 'Leave him with his friends'),
            T(
              '{callsign}, pange andmed kirja ja jätke ta sõprade hoolde, nad lähevad järgmise laevaga.',
              '{callsign}, take his details and leave him with his friends; they will take the next ship.',
            ),
            { success: -0.1, risk: 0.04, outcome: 'calmed' },
          ),
        ],
        'friends',
      ),
      backup(
        u('patrol'),
        7,
        [
          T(
            '{callsign}: seltskonnas läks uuesti kakluseks, pudelid lendavad ja meid on liiga vähe. Vajame kiiresti teist ekipaaži!',
            '{callsign}: the group has started fighting again, bottles are flying and there are too few of us. Need another crew fast!',
          ),
        ],
        { chance: 0.35, timeoutMin: 6, fail: { success: -0.25, risk: 0.08, trust: -3, outcome: 'brawl' }, ok: { success: 0.1 } },
      ),
    ],
    outcomes: [
      out(
        'sobering',
        'arrest',
        [0.45, 1],
        3,
        T(
          'Töötajat löönud mees toimetati kainenema ja tema suhtes alustati kriminaalmenetlust KarS § 121 järgi. Ülejäänud seltskond sõitis järgmise laevaga koju.',
          'The man who hit the staff member was taken to sober up and criminal proceedings were opened against him under KarS § 121. The rest of the group went home on the next ship.',
        ),
        { arrests: 1, radio: T('{callsign}: lööja kainenema, teised järgmise laevaga, lõpetame.', '{callsign}: attacker sobering up, the rest take the next ship, closing.') },
      ),
      out(
        'protocols',
        'fine',
        [0.3, 0.8],
        2,
        T(
          'Töötajat löönud mees toimetati kainenema ja tema suhtes alustati kriminaalmenetlust, töötaja sai kergelt viga. Kahele lärmanud seltskonna liikmele koostati väärteoprotokoll avaliku korra rikkumise eest KarS § 262 järgi.',
          'The man who hit the staff member was taken to sober up and criminal proceedings were opened against him; the staff member was only slightly hurt. Two more of the group who had been making trouble were given misdemeanour reports for a breach of public order under KarS § 262.',
        ),
        { arrests: 1, radio: T('{callsign}: lööja kainenema, kaks väärteoprotokolli, lõpetame.', '{callsign}: attacker sobering up, two misdemeanour reports, closing.') },
      ),
      out(
        'calmed',
        'report',
        [0, 0.05],
        2,
        T(
          'Löönud mees jäeti sõprade hoolde ja seltskond lahkus pärast hoiatust järgmise laevaga. Töötaja löömise kohta alustati kriminaalmenetlust hiljem valvekaamera salvestise põhjal.',
          'The man who hit out was left with his friends and the group left on the next ship after a warning. Criminal proceedings for the assault on the staff member were opened later on the strength of the CCTV footage.',
        ),
        { radio: T('{callsign}: seltskond lahkus laevaga, löömine läheb menetlusse.', '{callsign}: the group left on the ship, the assault goes to an investigator.') },
      ),
      out(
        'brawl',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Terminali ees puhkes kaklus ja üks reisija kukkus vastu betoonääret. Ta toimetati peavigastusega haiglasse, alustati kriminaalmenetlust avaliku korra raske rikkumise tunnustel.',
          'A fight broke out in front of the terminal and one passenger fell against a concrete kerb. He was taken to hospital with a head injury; criminal proceedings were opened for a serious breach of public order.',
        ),
        { injuries: 1, radio: T('{callsign}: kaklus terminali ees, üks peavigastusega haiglasse.', '{callsign}: fight outside the terminal, one to hospital with a head injury.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.45,
      toPriority: 2,
      text: T(
        'Turvatöötaja: seltskonnas läks kakluseks, üks mees lamab maas ja teised loobivad pudeleid.',
        'Guard: the group has started fighting, one man is lying on the ground and the others are throwing bottles.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.3,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Ma olen terminali turvatöötaja. Joobes reisijad lärmavad väravas ja üks lõi meie töötajat, palun saatke patrull.',
          'I am a terminal security guard. Drunk passengers are making trouble at the gate and one of them hit our staff, please send a patrol.',
        ),
        T(
          'Laevale minev seltskond on täiesti purjus, loobivad purke ja keelduvad lahkumast. Meid on ainult kaks.',
          'A group going to the ship is completely drunk, throwing cans and refusing to leave. There are only two of us.',
        ),
      ],
      answers: {
        count: [T('Neid on kuus või seitse, kõik mehed.', 'Six or seven of them, all men.')],
        injured: [T('Meie töötajal on huul katki, muidu on kõik jalul.', 'Our staff member has a split lip, otherwise everyone is on their feet.')],
        intoxicated: [T('Väga purjus, nad on terve päeva joonud ja kärudel on veel kaste.', 'Very drunk, they have been drinking all day and there are more crates on the trolleys.')],
        weapons: [T('Relvi pole, aga pudelid ja purgid lendavad.', 'No weapons, but bottles and cans are flying.')],
        when: [T('Nad tulid terminali pool tundi tagasi, löök oli just praegu.', 'They came into the terminal half an hour ago; the blow was just now.')],
      },
      answersRu: {
        count: ['Их шесть или семь, все мужики.'],
        injured: ['У нашего работника разбита губа, а так все на ногах.'],
        intoxicated: ['Очень пьяные, весь день пили, и на тележках ещё ящики.'],
        weapons: ['Оружия нет, но бутылки и банки летают.'],
        when: ['Они пришли в терминал полчаса назад, а ударил он только что.'],
      },
      openingRu: [
        'Я охранник в терминале. Пьяные пассажиры буянят у выхода, один ударил нашего работника, пришлите патруль.',
        'Компания, которая идёт на паром, совсем пьяная, кидаются банками и не хотят уходить. Нас всего двое.',
      ],
    },
    tags: ['drunk', 'alcohol', 'group', 'tourists'],
  },

  // 3. Pickpockets working a tour group in the old town; the guide holds one of them.
  {
    id: 'property_taskuvargad_turistigrupis',
    category: 'property',
    code: 'VG',
    title: T('Taskuvargad turistigrupi kallal', 'Pickpockets working a tour group'),
    priority: 3,
    weight: 2.0,
    hours: [0, 0, 0, 0, 0, 0, 0, 0, 0.4, 1.2, 1.8, 2, 2, 2, 2, 1.8, 1.4, 0.8, 0.3, 0.1, 0, 0, 0, 0],
    places: ['oldtown'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 60],
    persons: [
      { role: 'suspect', gender: 'M', age: [20, 45], record: 0.7, wanted: 0.2 },
      { role: 'victim', gender: 'any', age: [45, 80] },
      { role: 'caller', gender: 'any', age: [25, 65], relation: 'employee' },
    ],
    summary: [
      T(
        '{place}. Giidi teatel varastati turistigrupi liikmelt rahakott. Giid ja üks turist hoiavad kinni meest, kelle kaaslane jooksis rahakotiga minema.',
        '{place}. A tour guide reports a wallet stolen from a member of the group. The guide and a tourist are holding a man whose accomplice ran off with the wallet.',
      ),
      T(
        '{place}. Kolm meest tunglesid turistigrupi ümber, pärast olid kahe turisti seljakotid lahti tõmmatud. Üht meest hoitakse kinni, ta üritab end lahti rabeleda.',
        '{place}. Three men crowded round a tour group; afterwards two tourists found their backpacks unzipped. One man is being held and is trying to wrench himself free.',
      ),
      T(
        '{place}. Turist tabas võõra käe oma kotist ja haaras mehest kinni. Giid kutsub abi, mehe kaaslased kadusid rahva sekka.',
        '{place}. A tourist caught a stranger’s hand in their bag and grabbed the man. The guide is calling for help; the man’s accomplices vanished into the crowd.',
      ),
    ],
    callerLines: [
      T(
        'Ma olen giid. Mu grupist varastati rahakott, üht meest me hoiame kinni, aga teine jooksis minema.',
        'I am a tour guide. A wallet has been stolen from my group; we are holding one man, but the other ran away.',
      ),
      T(
        'Nad töötasid kolmekesi: üks küsis teed, teised tunglesid selja taga. Ma olen neid siin varemgi näinud.',
        'They worked as three: one asked for directions, the others crowded in behind. I have seen them here before.',
      ),
      T(
        'Grupi buss läheb poole tunni pärast sadamasse, turistid tahavad laevale jõuda.',
        'The group’s coach leaves for the harbour in half an hour; the tourists want to make their ship.',
      ),
    ],
    callerLinesRu: [
      'Я гид. У туриста из моей группы украли кошелёк, одного мы держим, а второй убежал.',
      'Они работали втроём: один спрашивал дорогу, остальные толпились сзади. Я их тут уже {видел|видела}.',
      'Автобус группы через полчаса едет в порт, туристы хотят успеть на корабль.',
    ],
    details: [
      T(
        'Giidi sõnul tegutsevad samad mehed vanalinnas juba mitu päeva, sihikul on sadamast tulevad turistigrupid.',
        'The guide says the same men have been working the old town for several days, targeting the tour groups coming up from the harbour.',
      ),
      T(
        'Kannatanu rahakotis oli umbes 300 eurot sularaha, pangakaardid ja pass.',
        'The victim’s wallet held about 300 euros in cash, bank cards and a passport.',
      ),
    ],
    beats: [
      qp('suspect', 'arrive', R_SUSPECT),
      choice(
        2,
        [
          T(
            '{callsign}: turistid peavad poole tunni pärast laevale minema. Kas võtame kannatanu seletuse kohe siin inglise keeles või kutsume ta jaoskonda?',
            '{callsign}: the tourists have to be back on their ship in half an hour. Do we take the victim’s statement here and now in English, or ask them to come to the station?',
          ),
        ],
        [
          opt(
            'here',
            T('Seletus kohe kohapeal', 'Statement here and now'),
            T(
              '{callsign}, võtke seletus kohe kohapeal, pildistage kotid ja pange kirja giidi kontaktid.',
              '{callsign}, take the statement on the spot, photograph the bags and note the guide’s contact details.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'station',
            T('Jaoskonda hiljem', 'To the station later'),
            T(
              '{callsign}, andke kannatanule jaoskonna aadress, seletus võetakse seal.',
              '{callsign}, give the victim the station address; the statement will be taken there.',
            ),
            { success: -0.15, trust: -2 },
          ),
        ],
        'station',
      ),
      info(
        5,
        [
          T(
            '{callsign}: kinnipeetu kaaslane jooksis rahakotiga vanalinna tänavatele, tal on seljas hall kapuutsiga pusa. Andke kirjeldus kesklinna ekipaažidele.',
            '{callsign}: the detainee’s accomplice ran into the old town streets with the wallet; he is wearing a grey hoodie. Please pass the description to the city centre crews.',
          ),
        ],
        0.6,
      ),
    ],
    outcomes: [
      out(
        'both_caught',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Mõlemad taskuvargad peeti kinni, varastatud rahakott leiti ühe neist taskust. Alustati kriminaalmenetlust KarS § 199 järgi, turist jõudis laevale.',
          'Both pickpockets were detained and the stolen wallet was found in one of their pockets. Criminal proceedings were opened under KarS § 199; the tourist made the ship.',
        ),
        { arrests: 2, trust: 2, radio: T('{callsign}: kaks taskuvarast kinni, rahakott tagasi, lõpetame.', '{callsign}: two pickpockets detained, wallet recovered, closing.') },
      ),
      out(
        'one_held',
        'arrest',
        [0.4, 0.85],
        3,
        T(
          'Giidi kinni peetud mees anti üle politseile ja alustati kriminaalmenetlust KarS § 199 järgi. Tema kaaslane pääses rahakotiga, valvekaamerate salvestised võeti menetlusse.',
          'The man the guide had held was handed over to the police and criminal proceedings were opened under KarS § 199. His accomplice got away with the wallet; the CCTV footage was taken into the case.',
        ),
        { arrests: 1, radio: T('{callsign}: üks taskuvaras kinni, kaaslane pääses rahakotiga.', '{callsign}: one pickpocket detained, the accomplice got away with the wallet.') },
      ),
      out(
        'statement_only',
        'report',
        [0.2, 0.55],
        2,
        T(
          'Kinni peetud mehelt varastatut ei leitud ja ta vabastati pärast isiku tuvastamist. Kannatanu avalduse alusel alustati menetlust, kaaslasi otsitakse kaamerapiltide abil.',
          'Nothing stolen was found on the man who had been held and he was released once identified. Proceedings were opened on the victim’s complaint; the accomplices are being traced from camera images.',
        ),
        { radio: T('{callsign}: mees tuvastatud ja vabastatud, avaldus vastu võetud.', '{callsign}: man identified and released, complaint taken.') },
      ),
      out(
        'ship_left',
        'referred',
        [0, 0.35],
        2,
        T(
          'Kinni peetud mehelt varastatut ei leitud ja kannatanu ei suutnud teda kindlalt ära tunda. Mees vabastati, turistid läksid laevale ja materjalid edastati menetlejale.',
          'Nothing stolen was found on the man who had been held and the victim could not identify him for certain. He was released, the tourists went back to their ship and the file was passed to an investigator.',
        ),
        { radio: T('{callsign}: mees vabastatud, turistid laevale, lõpetame.', '{callsign}: man released, tourists back to their ship, closing.') },
      ),
    ],
    expiresMin: 75,
    interactiveChance: 0.25,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Ma olen giid, mu turistigrupist varastati rahakott. Üht vargast hoiame kinni, palun tulge kiiresti!',
          'I am a tour guide, a wallet has been stolen from my group. We are holding one of the thieves, please come quickly!',
        ),
        T(
          'Taskuvargad tunglesid mu grupi ümber ja üks turist tabas mehe käe oma kotist. Mees rabeleb, me ei suuda teda kaua hoida.',
          'Pickpockets crowded round my group and a tourist caught a man’s hand in their bag. He is struggling, we cannot hold him for long.',
        ),
      ],
      answers: {
        suspect: [
          T(
            'Noor mees, tumedad juuksed, must jope. See, kes ära jooksis, oli halli kapuutsiga pusaga.',
            'A young man, dark hair, black jacket. The one who ran off had a grey hoodie.',
          ),
        ],
        count: [T('Neid oli kolm, üht hoiame kinni, kaks kadusid rahva sekka.', 'There were three of them; we are holding one, two vanished into the crowd.')],
        direction: [T('Teine jooksis rahva sekka, ma ei näinud täpselt, kuhu.', 'The other one ran into the crowd, I did not see exactly where.')],
        weapons: [T('Relva ma ei näinud, aga see, keda me hoiame, lööb jalaga.', 'I did not see a weapon, but the one we are holding is kicking.')],
        when: [T('Just praegu, paar minutit tagasi.', 'Just now, a couple of minutes ago.')],
      },
      answersRu: {
        suspect: ['Молодой мужчина, тёмные волосы, чёрная куртка. Тот, который убежал, был в серой толстовке с капюшоном.'],
        count: ['Их было трое, одного держим, двое растворились в толпе.'],
        direction: ['Второй убежал в толпу, я точно не {видел|видела}, куда.'],
        weapons: ['Оружия я не {видел|видела}, но тот, кого мы держим, пинается.'],
        when: ['Только что, пару минут назад.'],
      },
      openingRu: [
        'Я гид, у туриста из моей группы украли кошелёк. Одного вора мы держим, приезжайте скорее!',
        'Карманники окружили мою группу, и турист поймал руку мужчины у себя в сумке. Он вырывается, мы его долго не удержим.',
      ],
    },
    tags: ['tourists', 'theft', 'detained'],
  },

  // 4. A drunk, violent passenger on a holiday charter is handed over to the police at the gate.
  {
    id: 'public_order_rahutu_reisija_lennukis',
    category: 'public_order',
    code: 'AK',
    title: T('Rahutu reisija antakse lennukis politseile üle', 'Disruptive passenger handed over at the aircraft'),
    priority: 2,
    weight: 0.4,
    places: ['airport'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 55], intoxicated: 0.9, record: 0.3, wanted: 0.05 },
      { role: 'victim', gender: 'F', age: [22, 45], relation: 'employee' },
      { role: 'caller', gender: 'any', age: [25, 55], relation: 'employee' },
    ],
    summary: [
      T(
        '{place}, {address}. Puhkuselt saabuva tšarterlennu kapten palub politseid lennuki juurde: joobes reisija ründas lennu ajal salongitöötajat ja meeskond pidi ta istmele kinnitama.',
        '{place}, {address}. The captain of a holiday charter flight asks for police at the aircraft: a drunk passenger attacked a flight attendant during the flight and the crew had to restrain him in his seat.',
      ),
      T(
        '{place}, {address}. Lennuk maandub kümne minuti pärast. Pardal on agressiivne ja purjus reisija, kes lükkas stjuardessi ja nõudis alkoholi.',
        '{place}, {address}. A plane lands in ten minutes. On board is an aggressive, drunk passenger who shoved a flight attendant and demanded alcohol.',
      ),
      T(
        '{place}, {address}. Maandunud lennuk ootab värava juures politseid: reisija suitsetas tualetis, ähvardas meeskonda ja keeldub istumast.',
        '{place}, {address}. A plane that has landed is waiting at the gate for the police: a passenger smoked in the toilet, threatened the crew and refuses to sit down.',
      ),
    ],
    callerLines: [
      T(
        'Lennuk on just maandunud ja kapten ei lase reisijaid välja enne, kui politsei on värava juures.',
        'The plane has just landed and the captain will not let the passengers off until the police are at the gate.',
      ),
      T(
        'Üks reisija jõi lennu ajal oma pudeli tühjaks, lükkas stjuardessi ja ähvardas teda.',
        'One passenger emptied his own bottle during the flight, shoved a flight attendant and threatened her.',
      ),
      T(
        'Meeskond pidi selle reisija istmele kinni siduma, ta karjub siiani.',
        'The crew had to strap that passenger into his seat, he is still shouting.',
      ),
    ],
    callerLinesRu: [
      'Самолёт только что сел, и командир не выпускает пассажиров, пока у выхода не будет полиции.',
      'Один пассажир за полёт выпил свою бутылку, толкнул стюардессу и угрожал ей.',
      'Экипажу пришлось привязать этого пассажира к креслу, он до сих пор кричит.',
    ],
    details: [
      T(
        'Kapteni sõnul on mees väga agressiivne ja ähvardab end lahti rebida. Reisijad salongis on ärevil.',
        'The captain says the man is very aggressive and threatening to break loose. The passengers in the cabin are on edge.',
      ),
      T(
        'Lend saabus väljastpoolt Schengeni ala, reisijad peavad enne lahkumist läbima piirikontrolli.',
        'The flight came from outside the Schengen area; the passengers must go through border control before leaving.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: oleme väravas ja läheme meeskonnaga lennukisse. Mees on salongi tagaosas ja karjub, meeskond hoiab teisi reisijaid temast eemal.',
          '{callsign}: at the gate, going on board with the crew. The man is at the back of the cabin, shouting; the crew are keeping the other passengers away from him.',
        ),
      ]),
      qp('suspect', 4, R_SUSPECT),
      choice(
        6,
        [
          T(
            '{callsign}: mees on rahunenud, salongitöötaja tahab avaldust teha. Lennufirma küsib, kas mees võib piirikontrolli läbida ja koju minna. Mida teeme?',
            '{callsign}: the man has calmed down and the flight attendant wants to make a complaint. The airline asks whether he may go through border control and home. What do we do?',
          ),
        ],
        [
          opt(
            'detain',
            T('Kinni, seletused ja menetlus', 'Detain him, statements and a case'),
            T(
              '{callsign}, mees peetakse kinni. Võtke salongitöötajalt ja tunnistajatelt seletused, meeskonna raport tuleb menetlusse.',
              '{callsign}, the man is detained. Take statements from the flight attendant and witnesses; the crew’s report goes into the case.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'release',
            T('Andmed kirja, koju', 'Take his details, let him go home'),
            T(
              '{callsign}, pange andmed kirja ja laske ta pärast piirikontrolli koju.',
              '{callsign}, take his details and let him go home after border control.',
            ),
            { success: -0.15, trust: -2, outcome: 'went_home' },
          ),
        ],
        'release',
      ),
    ],
    outcomes: [
      out(
        'detained',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Reisija peeti kinni ja toimetati kainenema. Salongitöötaja ründamise eest alustati kriminaalmenetlust KarS § 121 järgi, lennufirma kaalub talle lennukeeldu.',
          'The passenger was detained and taken to sober up. Criminal proceedings were opened under KarS § 121 for assaulting the flight attendant; the airline is considering a flying ban.',
        ),
        { arrests: 1, radio: T('{callsign}: reisija kinni, kainenema, menetlus alustatud.', '{callsign}: passenger detained, sobering up, case opened.') },
      ),
      out(
        'misdemeanour',
        'fine',
        [0.35, 0.85],
        2,
        T(
          'Reisija peeti kinni ja toimetati kainenema. Salongitöötaja vigastusi ei saanud, mehe suhtes alustati väärteomenetlust ja lennufirma nõuab temalt lennu häirimisega tekitatud kahju.',
          'The passenger was detained and taken to sober up. The flight attendant was not injured; misdemeanour proceedings were opened against the man and the airline is claiming the cost of the disruption from him.',
        ),
        { arrests: 1, radio: T('{callsign}: reisija kainenema, väärteomenetlus alustatud.', '{callsign}: passenger sobering up, misdemeanour case opened.') },
      ),
      out(
        'cabin_fight',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Mees rebis end enne politsei saabumist lahti ja lõi kaasreisijat. Kannatanu toimetati ninaluumurruga haiglasse, mees peeti kinni ja alustati kriminaalmenetlust.',
          'The man broke loose before the police arrived and hit a fellow passenger, who was taken to hospital with a broken nose. The man was detained and criminal proceedings opened.',
        ),
        { injuries: 1, arrests: 1, radio: T('{callsign}: kaasreisija haiglasse, ründaja kinni peetud.', '{callsign}: fellow passenger to hospital, attacker detained.') },
      ),
      out(
        'went_home',
        'referred',
        [0, 0.05],
        1,
        T(
          'Mees lasti pärast andmete kirjapanekut koju. Salongitöötaja esitas hiljem avalduse, materjalid edastati menetlejale ja lennufirma nõuab kahju hüvitamist.',
          'The man was let go home once his details were taken. The flight attendant later filed a complaint; the file went to an investigator and the airline is claiming damages.',
        ),
        { radio: T('{callsign}: mees lasti koju, avaldus läheb menetlejale.', '{callsign}: man let go home, the complaint goes to an investigator.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.4,
      toPriority: 1,
      text: T(
        'Lennujaam: mees rebis end lahti ja möllab salongis, meeskond ei suuda teda ohjeldada.',
        'Airport: the man has broken loose and is running amok in the cabin; the crew cannot restrain him.',
      ),
    },
    expiresMin: 60,
    interactiveChance: 0.2,
    tags: ['drunk', 'alcohol', 'airport'],
  },

  // 5. Knocking from inside a sealed trailer in the lorry queue for the ship at Muuga or Paldiski.
  {
    id: 'border_koputused_veokihaagisest',
    category: 'border',
    code: 'PR',
    title: T('Koputused veoki haagisest sadamas', 'Knocking from a lorry trailer at the port'),
    priority: 2,
    weight: 0.2,
    places: ['port'],
    placeTags: ['cargo'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('criminal')] },
    onScene: [40, 90],
    persons: [
      { role: 'caller', gender: 'M', age: [30, 62] },
      { role: 'victim', gender: 'M', age: [16, 35] },
    ],
    vehicles: [{ role: 'involved', kind: 'truck' }],
    agencies: [{ agency: 'kiirabi', chance: 0.7, reason: T('Suletud haagises viibinud inimeste tervisekontroll', 'Health check for people found in a sealed trailer') }],
    summary: [
      T(
        '{place}. Laevale pääsemist ootava veoki juht kuuleb plommitud haagisest koputusi ja hõikeid. Haagis laaditi mitu päeva tagasi.',
        '{place}. The driver of a lorry waiting to board a ship hears knocking and shouting from his sealed trailer. The trailer was loaded several days ago.',
      ),
      T(
        '{place}. Veokijuht teatab, et haagise seest kostab nõrka koputamist. Juhi sõnul pole tal aimugi, kes seal on.',
        '{place}. A lorry driver reports faint knocking from inside his trailer. He says he has no idea who is in there.',
      ),
    ],
    callerLines: [
      T(
        'Ma seisan laevajärjekorras ja haagisest koputatakse! Plomm on peal, ma ei ole seda avanud.',
        'I am in the queue for the ship and someone is knocking from inside the trailer! The seal is on, I have not opened it.',
      ),
      T(
        'Ma kuulsin, kuidas keegi hüüdis midagi võõras keeles. Haagis laaditi kolm päeva tagasi ja on sellest ajast kinni.',
        'I heard someone shouting something in a foreign language. The trailer was loaded three days ago and has been shut ever since.',
      ),
      T(
        'Ma ei tea, kes seal on, ma ainult sõidan. Kas ma tohin plommi maha võtta?',
        'I do not know who is in there, I only drive. Am I allowed to break the seal?',
      ),
    ],
    callerLinesRu: [
      'Я стою в очереди на паром, а из прицепа стучат! Пломба на месте, я его не открывал.',
      'Я слышал, как кто-то кричал что-то не по-нашему. Прицеп загрузили три дня назад, и с тех пор он закрыт.',
      'Я не знаю, кто там, я только вожу. Мне можно сорвать пломбу?',
    ],
    details: [
      T(
        'Juhi sõnul jäid koputused viimastel minutitel nõrgemaks. Haagis on õhukindel ja sees võib olla mitu inimest.',
        'The driver says the knocking has grown weaker in the last few minutes. The trailer is airtight and there may be several people inside.',
      ),
      T(
        'Juhi sõnul seisis haagis teel kaks ööd valveta veokiparklas.',
        'The driver says the trailer stood for two nights in an unguarded lorry park on the way.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal, haagise plomm on terve ja juht kinnitab, et sees on inimesed. Kas avame kohe või ootame tolli ja vedaja esindajat plommi fikseerima?',
            '{callsign}: on scene, the trailer seal is intact and the driver confirms there are people inside. Do we open it now or wait for customs and the haulier’s representative to record the seal?',
          ),
        ],
        [
          opt(
            'open',
            T('Avage kohe, elu enne', 'Open it now, lives first'),
            T('{callsign}, pildistage plomm ja avage haagis kohe, inimeste elu on esikohal.', '{callsign}, photograph the seal and open the trailer now; people’s lives come first.'),
            { success: 0.2, time: 5 },
          ),
          opt(
            'wait',
            T('Oodake tolli ja vedajat', 'Wait for customs and the haulier'),
            T('{callsign}, ärge avage enne, kui toll ja vedaja esindaja on kohal.', '{callsign}, do not open it until customs and the haulier’s representative are there.'),
            { success: -0.2, time: 20 },
          ),
        ],
        'wait',
        { timeoutMin: 3 },
      ),
      agency(
        'kiirabi',
        3,
        [
          T(
            '{callsign}: haagises on mitu inimest, kes on olnud seal päevi ilma veeta. Palun kiirabi kiiresti!',
            '{callsign}: there are several people in the trailer who have been in there for days without water. Ambulance quickly please!',
          ),
        ],
        { timeoutMin: 5 },
      ),
      qv(6, [
        T(
          '{callsign}: veok on {car}, numbrimärk {plate}. Juht ütleb, et ei teadnud haagises olijatest. Kontrolli palun sõidukit.',
          '{callsign}: the lorry is a {car}, plate {plate}. The driver says he knew nothing about the people in the trailer. Please run the vehicle.',
        ),
      ]),
      info(10, [
        T(
          '{callsign}: haagis on avatud, sees olnutel dokumente pole ja nad räägivad vähe inglise keelt. Teavitame migratsioonijärelevalvet.',
          '{callsign}: the trailer is open; the people inside have no documents and speak little English. Notifying migration supervision.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'found_alive',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Haagisest leiti {n} dokumentideta noormeest, kes olid seal olnud kolm päeva. Kiirabi kontrollis nende tervist, nad anti üle migratsioonijärelevalvele ja alustati kriminaalmenetlust inimeste ebaseadusliku üle piiri toimetamise tunnustel.',
          'The trailer held {n} young men without documents, who had been in it for three days. Paramedics checked them over, they were handed over to migration supervision and criminal proceedings were opened for smuggling people across the border.',
        ),
        { radio: T('{callsign}: haagisest {n} inimest, üle antud, menetlus alustatud.', '{callsign}: {n} people from the trailer, handed over, case opened.') },
      ),
      out(
        'driver_knew',
        'arrest',
        [0.55, 1],
        1,
        T(
          'Juhi telefonist leitud sõnumitest selgus, et ta teadis haagises olijatest. Juht peeti kinni ja alustati kriminaalmenetlust, {n} haagises olnut anti üle migratsioonijärelevalvele.',
          'Messages on the driver’s phone showed he knew about the people in the trailer. He was detained and criminal proceedings opened; the {n} people from the trailer were handed over to migration supervision.',
        ),
        { arrests: 1, radio: T('{callsign}: juht teadis, kinni peetud, inimesed üle antud.', '{callsign}: the driver knew, he is detained, the people handed over.') },
      ),
      out(
        'dehydrated',
        'hospital',
        [0.2, 0.6],
        2,
        T(
          'Haagisest leitud {n} inimest olid tugevasti dehüdreeritud ja toimetati haiglasse. Pärast ravi antakse nad üle migratsioonijärelevalvele, alustatud on kriminaalmenetlus.',
          'The {n} people found in the trailer were severely dehydrated and were taken to hospital. They will be handed over to migration supervision after treatment; criminal proceedings have been opened.',
        ),
        { injuries: 2, radio: T('{callsign}: haagisest {n} inimest, dehüdreeritud, haiglasse.', '{callsign}: {n} people from the trailer, dehydrated, to hospital.') },
      ),
      out(
        'unconscious',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Haagis avati hilja ja üks noormees oli teadvuseta. Ta toimetati raskes seisundis haiglasse, teised anti üle migratsioonijärelevalvele ja alustati kriminaalmenetlust.',
          'The trailer was opened late and one young man was unconscious. He was taken to hospital in a critical condition; the others were handed over to migration supervision and criminal proceedings were opened.',
        ),
        { injuries: 1, radio: T('{callsign}: üks teadvuseta, raskes seisundis haiglasse.', '{callsign}: one unconscious, to hospital in a critical condition.') },
      ),
    ],
    escalation: {
      afterMin: 25,
      chance: 0.4,
      toPriority: 1,
      text: T('Veokijuht: koputused lakkasid, haagisest ei vasta enam keegi.', 'Lorry driver: the knocking has stopped, nobody answers from the trailer any more.'),
    },
    expiresMin: 75,
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Ma seisan sadamas laevajärjekorras ja mu haagisest koputatakse! Seal on keegi sees!',
          'I am in the port queue for the ship and someone is knocking from inside my trailer! There is someone in there!',
        ),
        T(
          'Haagis on plommitud, aga seest hüütakse. Ma ei tea, mida teha, kas ma võin selle avada?',
          'The trailer is sealed, but someone is shouting inside. I do not know what to do, may I open it?',
        ),
      ],
      answers: {
        count: [T('Ma ei tea, hääli on mitu. Vähemalt kaks.', 'I do not know, there are several voices. At least two.')],
        injured: [T('Ma ei näe neid. Koputused jäävad nõrgemaks.', 'I cannot see them. The knocking is getting weaker.')],
        when: [T('Kuulsin seda kümme minutit tagasi, kui mootori välja lülitasin.', 'I heard it ten minutes ago when I switched the engine off.')],
        vehicle: [T('Minu veok on {car}, number {plate}, haagis on taga.', 'My lorry is a {car}, number {plate}, with the trailer behind.')],
        direction: [T('Keegi ei ole kuhugi läinud, nad on haagises luku taga.', 'Nobody has gone anywhere, they are locked in the trailer.')],
        intoxicated: [T('Mina olen kaine, ma olen ju roolis. Kes haagises on, seda ma ei tea.', 'I am sober, I am driving. Who is in the trailer I do not know.')],
      },
      answersRu: {
        count: ['Не знаю, голосов несколько. Минимум двое.'],
        injured: ['Я их не вижу. Стучат всё слабее.'],
        when: ['Я это услышал минут десять назад, когда заглушил мотор.'],
        vehicle: ['Моя машина: {car}, номер {plate}, прицеп сзади.'],
        direction: ['Никто никуда не ушёл, они заперты в прицепе.'],
        intoxicated: ['Я трезвый, я же за рулём. Кто в прицепе, я не знаю.'],
      },
      openingRu: [
        'Я стою в порту в очереди на паром, а у меня из прицепа стучат! Там кто-то есть!',
        'Прицеп опломбирован, а изнутри кричат. Я не знаю, что делать, можно его открыть?',
      ],
    },
    tags: ['port', 'smuggling', 'trailer'],
  },

  // 6. Jumping into the Rummu quarry lake from the old prison ruins; a jumper hits the submerged walls.
  {
    id: 'assist_rummu_karjaari_hupe',
    category: 'assist',
    code: 'VEE',
    title: T('Hüppaja sai Rummu karjääris viga', 'Jumper injured at the Rummu quarry'),
    priority: 2,
    weight: 0.6,
    months: [6, 7, 8],
    hours: 'day',
    weekendBoost: 1.4,
    places: ['lake'],
    placeTags: ['quarry'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [40, 90],
    persons: [
      { role: 'victim', gender: 'M', age: [16, 30], intoxicated: 0.5 },
      { role: 'witness', gender: 'any', age: [16, 30], relation: 'friend', intoxicated: 0.4 },
      { role: 'caller', gender: 'any', age: [16, 30], relation: 'friend' },
    ],
    agencies: [
      { agency: 'kiirabi', chance: 1, reason: T('Hüppaja võimalik selja- ja peavigastus', 'Possible spine and head injury to the jumper') },
      { agency: 'paaste', chance: 0.6, reason: T('Vigastatu toomine järsult kaldalt üles', 'Bringing the injured man up the steep shore') },
    ],
    summary: [
      T(
        '{place}, {address}. Noormees hüppas vanglavaremete müürilt karjäärijärve ja lõi end vee all varemete vastu. Sõbrad tõid ta kaldale, ta on teadvusel, kuid ei tunne jalgu.',
        '{place}, {address}. A young man jumped from the wall of the prison ruins into the quarry lake and hit the submerged ruins. His friends brought him to the shore; he is conscious but cannot feel his legs.',
      ),
      T(
        '{place}, {address}. Karjääris hüppas noormees kõrgelt vette ja tuli pinnale näoli. Sõbrad tõmbasid ta veest välja, ta on segaduses ja veritseb peast.',
        '{place}, {address}. A young man jumped into the quarry lake from high up and surfaced face down. His friends pulled him out; he is confused and bleeding from the head.',
      ),
      T(
        '{place}, {address}. Järve hüpati vanglavaremetelt, üks hüppaja ei saa ise veest välja. Kallas on järsk ja sõbrad hoiavad teda vee peal.',
        '{place}, {address}. People have been jumping into the lake from the prison ruins and one jumper cannot get out of the water. The shore is steep and his friends are keeping him afloat.',
      ),
    ],
    callerLines: [
      T(
        'Mu sõber hüppas müürilt ja lõi end vee all ära. Me tõime ta kaldale, aga ta ütleb, et ei tunne jalgu!',
        'My friend jumped off the wall and hit something under the water. We got him to the shore, but he says he cannot feel his legs!',
      ),
      T(
        'Siin vee all on vanad vanglamajad, ta ei teadnud seda. Tal veritseb pea.',
        'There are old prison buildings under the water here, he did not know. His head is bleeding.',
      ),
      T(
        'Me oleme järve teisel pool, autoga siia ei pääse, peab tulema üle valge mäe.',
        'We are on the far side of the lake; you cannot get here by car, you have to come over the white hill.',
      ),
    ],
    callerLinesRu: [
      'Мой друг прыгнул со стены и ударился обо что-то под водой. Мы вытащили его на берег, а он говорит, что не чувствует ног!',
      'Тут под водой старые тюремные здания, он этого не знал. У него голова в крови.',
      'Мы на другой стороне озера, на машине сюда не проехать, надо идти через белую гору.',
    ],
    details: [
      T(
        'Teataja sõnul hingab noormees üha raskemalt ja muutub uniseks. Sõbrad on joonud ja tahavad ta ise autoga haiglasse viia.',
        'The caller says the young man is breathing harder and getting drowsy. His friends have been drinking and want to drive him to hospital themselves.',
      ),
      T(
        'Karjäär on eraomandis ja vette hüppamine on keelatud, kuid suvel käib seal palju noori ja turiste. Vee all on endise vangla hoonete varemed.',
        'The quarry is private land and jumping into the water is prohibited, but in summer it is busy with young people and tourists. The ruins of the former prison buildings lie under the water.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, noormees lamab kaldal, sõbrad hoiavad tema pead paigal. Jälgime tema hingamist ja palume teistel varemetelt alla tulla.',
          '{callsign}: on scene, the young man is lying on the shore and his friends are keeping his head still. Watching his breathing and asking the others to come down off the ruins.',
        ),
      ]),
      agency(
        'paaste',
        3,
        [
          T(
            '{callsign}: kallas on järsk ja kanderaamiga siit üles ei saa. Vajame päästjaid, et noormees üles tuua.',
            '{callsign}: the shore is steep and a stretcher cannot be carried up from here. We need the rescuers to bring the young man up.',
          ),
        ],
        { timeoutMin: 6 },
      ),
      choice(
        6,
        [
          T(
            '{callsign}: kiirabi on veel teel. Sõbrad tahavad noormehe ise üle mäe autoni kanda ja kiirabile vastu viia. Kas lubame?',
            '{callsign}: the ambulance is still on its way. His friends want to carry the young man over the hill to their car themselves and drive him to meet it. Do we allow it?',
          ),
        ],
        [
          opt(
            'still',
            T('Ei, hoidke paigal, kiirabi tuleb', 'No, keep him still, the ambulance is coming'),
            T(
              '{callsign}, noormeest ei liigutata. Hoidke pea ja kael paigal ning juhatage kiirabi kohale.',
              '{callsign}, nobody moves him. Keep his head and neck still and guide the ambulance in.',
            ),
            { success: 0.2, time: 10 },
          ),
          opt(
            'car',
            T('Las viivad ise', 'Let them drive him'),
            T(
              '{callsign}, las sõbrad kannavad ta autoni ja viivad kiirabile vastu, sõitke nende ees.',
              '{callsign}, let his friends carry him to the car and take him to meet the ambulance; drive ahead of them.',
            ),
            { success: -0.25, risk: 0.03, outcome: 'drove_off' },
          ),
        ],
        'car',
      ),
    ],
    outcomes: [
      out(
        'carried_up',
        'hospital',
        [0.45, 1],
        4,
        T(
          'Noormehe kael fikseeriti ja päästjad tõid ta kanderaamil üles. Kiirabi viis ta selgroovigastuse kahtlusega haiglasse, kus selgus, et seljaaju jäi terveks. Teistele hüppajatele tehti hoiatus.',
          'The young man’s neck was immobilised and the rescuers carried him up on a stretcher. The ambulance took him to hospital with a suspected spinal injury; his spinal cord turned out to be unharmed. The other jumpers were warned.',
        ),
        { injuries: 1, radio: T('{callsign}: noormees kiirabiga haiglasse, teised hüppajad hoiatatud.', '{callsign}: young man to hospital by ambulance, the other jumpers warned.') },
      ),
      out(
        'bruised',
        'resolved',
        [0.55, 1],
        2,
        T(
          'Noormehel oli peapõrutus ja selg põrutada saanud, kuid selgroog jäi terveks ja halvatust ei olnud. Kiirabi viis ta haiglasse jälgimisele, teistele hüppajatele tehti hoiatus ja karjääri omanikku teavitati.',
          'The young man had concussion and a bruised back, but his spine was intact and there was no paralysis. The ambulance took him to hospital for observation; the other jumpers were warned and the quarry owner informed.',
        ),
        { radio: T('{callsign}: peapõrutus, selgroog terve, haiglasse, hüppajad hoiatatud.', '{callsign}: concussion, spine intact, to hospital, jumpers warned.') },
      ),
      out(
        'spine',
        'hospital',
        [0, 0.6],
        2,
        T(
          'Sõbrad olid noormeest veest välja tirides tema selga painutanud. Ta toimetati raske selgroovigastusega haiglasse, juhtumi asjaolusid selgitatakse.',
          'His friends had bent the young man’s back while dragging him out of the water. He was taken to hospital with a serious spinal injury; the circumstances are being looked into.',
        ),
        { injuries: 1, radio: T('{callsign}: raske selgroovigastus, noormees haiglasse.', '{callsign}: serious spinal injury, the young man to hospital.') },
      ),
      out(
        'drove_off',
        'hospital',
        [0, 0.05],
        2,
        T(
          'Sõbrad kandsid noormehe üle mäe autoni ja viisid ta kiirabile vastu, teel tõsteti ta veel ümber. Seljavigastus süvenes ja ta toimetati raskes seisundis haiglasse.',
          'His friends carried the young man over the hill to their car and drove him to meet the ambulance, moving him again on the way. The back injury got worse and he was taken to hospital in a serious condition.',
        ),
        { injuries: 1, radio: T('{callsign}: sõbrad viisid ise, seljavigastus süvenes, haiglasse.', '{callsign}: friends drove him themselves, the back injury worsened, to hospital.') },
      ),
    ],
    escalation: {
      afterMin: 25,
      chance: 0.45,
      toPriority: 1,
      text: T(
        'Teataja: noormees kaotas teadvuse ja hingab katkendlikult, sõbrad ei tea, mida teha!',
        'Caller: the young man has lost consciousness and is breathing irregularly, his friends do not know what to do!',
      ),
    },
    expiresMin: 60,
    interactiveChance: 0.35,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Rummu karjääris hüppas mu sõber müürilt ja lõi end vee all ära! Ta ei tunne jalgu!',
          'My friend jumped off the wall at the Rummu quarry and hit something under the water! He cannot feel his legs!',
        ),
        T(
          'Me tõmbasime ta veest välja, ta on teadvusel, aga peast tuleb verd. Palun kiiresti!',
          'We pulled him out of the water, he is conscious but his head is bleeding. Please hurry!',
        ),
      ],
      answers: {
        injured: [T('Pea on katki ja ta ütleb, et selg valutab. Jalgu ta ei liiguta.', 'His head is cut and he says his back hurts. He is not moving his legs.')],
        count: [T('Meid on siin viis, aga ümberringi on veel palju inimesi.', 'There are five of us, but there are lots of other people around.')],
        intoxicated: [T('Me jõime natuke õlut, tema ka.', 'We had a few beers, him too.')],
        when: [T('Just praegu, paar minutit tagasi.', 'Just now, a couple of minutes ago.')],
      },
      answersRu: {
        injured: ['Голова разбита, и он говорит, что болит спина. Ногами он не двигает.'],
        count: ['Нас тут пятеро, но вокруг ещё много народу.'],
        intoxicated: ['Мы немного выпили пива, он тоже.'],
        when: ['Только что, пару минут назад.'],
      },
      openingRu: [
        'На карьере в Румму мой друг прыгнул со стены и ударился обо что-то под водой! Он не чувствует ног!',
        'Мы вытащили его из воды, он в сознании, но голова в крови. Пожалуйста, быстрее!',
      ],
    },
    tags: ['swimming', 'youth', 'drowning'],
  },

  // 7. Swimmers in the Ülemiste lake, Tallinn's drinking-water reservoir, where swimming is banned.
  {
    id: 'environment_ulemiste_joogiveehoidlas_ujujad',
    category: 'environment',
    code: 'KK',
    title: T('Ujujad Ülemiste joogiveehoidlas', 'Swimmers in the Ülemiste drinking-water reservoir'),
    priority: 3,
    weight: 0.8,
    months: [6, 7, 8],
    hours: 'evening',
    weekendBoost: 1.3,
    places: ['lake'],
    placeTags: ['reservoir'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [20, 45],
    persons: [
      { role: 'suspect', gender: 'M', age: [17, 35], intoxicated: 0.6, record: 0.1 },
      { role: 'caller', gender: 'M', age: [25, 62], relation: 'employee' },
    ],
    agencies: [
      { agency: 'keskkonnaamet', chance: 0.4, reason: T('Veehaarde sanitaarkaitseala nõuete rikkumine', 'Breach of the water intake’s sanitary protection zone') },
      { agency: 'paaste', chance: 0.5, reason: T('Ujuja järve keskel, vajadusel päästepaat', 'Swimmer out in the middle of the lake, rescue boat if needed') },
    ],
    summary: [
      T(
        '{place}. Veehaarde valvuri teatel ujub joogiveehoidlas seltskond noori, kaldal on grill ja õllepudelid. Järves ujumine on keelatud.',
        '{place}. The water intake guard reports a group of young people swimming in the drinking-water reservoir, with a barbecue and beer bottles on the shore. Swimming in the lake is prohibited.',
      ),
      T(
        '{place}. Joobes seltskond ujub joogiveehoidlas veehaarde lähedal, kaldal mängib muusika. Valvuri hüüetele nad ei reageeri.',
        '{place}. A drunk group is swimming in the drinking-water reservoir near the water intake, with music playing on the shore. They ignore the guard’s shouts.',
      ),
      T(
        '{place}. Noored ronisid üle veehaarde aia ja ujuvad Lindakivi lähedal. Valvur ei saa neid veest välja.',
        '{place}. Young people climbed over the water intake fence and are swimming near the Linda stone. The guard cannot get them out of the water.',
      ),
    ],
    callerLines: [
      T(
        'Ma valvan siin veehaaret. Noored ujuvad jälle järves, see on ju linna joogivesi!',
        'I guard the water intake here. Young people are swimming in the lake again, this is the city’s drinking water!',
      ),
      T(
        'Noored ronisid üle veehaarde aia ja tegid kaldale grilli. Ma hüüdsin, aga nad ainult naersid.',
        'Some young people climbed over the water intake fence and lit a barbecue on the shore. I shouted, but they just laughed.',
      ),
      T(
        'Üks neist noortest ujus järves päris kaugele, ma ei näe teda enam hästi.',
        'One of those young people has swum far out into the lake, I can hardly see him now.',
      ),
    ],
    callerLinesRu: [
      'Я охраняю здесь водозабор. Молодёжь опять купается в озере, это же питьевая вода города!',
      'Молодёжь перелезла через забор водозабора и разожгла на берегу гриль. Я кричал, а они только смеялись.',
      'Один из этих ребят заплыл очень далеко, я его уже плохо вижу.',
    ],
    details: [
      T(
        'Valvuri sõnul on üks ujujatest järve keskel ja kaldal olijad on purjus. Vesi on külm ja kaldast eemal sügav.',
        'The guard says one of the swimmers is out in the middle of the lake and those on the shore are drunk. The water is cold and deep away from the shore.',
      ),
      T(
        'Ülemiste järv on Tallinna joogiveeallikas: ujumine, paadiga sõitmine ja kalapüük on seal keelatud.',
        'Ülemiste lake is Tallinn’s drinking-water source; swimming, boating and fishing are prohibited there.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal, kaldal on seltskond noori ja grill. Sõprade sõnul ujus üks neist järve keskele ega vasta hüüetele. Kas valvur läheb veehaarde paadiga talle järele või ootame kaldal?',
            '{callsign}: on scene, a group of young people and a barbecue on the shore. Their friends say one of them swam out to the middle of the lake and is not answering calls. Does the guard go out to him in the water intake’s boat, or do we wait on the shore?',
          ),
        ],
        [
          opt(
            'boat',
            T('Paadiga järele, üks patrullist kaasa', 'Go out in the boat, one officer goes along'),
            T(
              '{callsign}, üks teist läheb valvuriga paadiga ujujale järele, teine jääb kaldale seltskonna juurde. Kui ta on hädas, kutsume päästjad.',
              '{callsign}, one of you goes out with the guard in the boat to fetch the swimmer, the other stays with the group on the shore. If he is in trouble we will call the rescuers.',
            ),
            { success: 0.2, time: 10 },
          ),
          opt(
            'wait',
            T('Oodake kaldal', 'Wait on the shore'),
            T('{callsign}, jääge kaldale ja kutsuge ta välja, küll ta tagasi ujub.', '{callsign}, stay on the shore and call him out, he will swim back.'),
            { success: -0.15, risk: 0.02 },
          ),
        ],
        'wait',
      ),
      info(5, [
        T(
          '{callsign}: kõik on veest väljas, seltskond on joobes. Kustutame grilli ja paneme andmed kirja.',
          '{callsign}: everyone is out of the water and the group is drunk. Putting out the barbecue and taking their details.',
        ),
      ]),
      qp('suspect', 8, R_SUSPECT, 0.6),
    ],
    outcomes: [
      out(
        'fined',
        'report',
        [0.5, 1],
        3,
        T(
          'Noorte andmed pandi kirja ja materjalid edastati Keskkonnaametile väärteomenetluseks veehaarde sanitaarkaitseala nõuete rikkumise eest. Grill kustutati ja seltskond saadeti sanitaarkaitsealalt välja.',
          'The young people’s details were taken and the file went to the Environmental Board for misdemeanour proceedings for breaching the rules of the water intake’s sanitary protection zone. The barbecue was put out and the group sent out of the zone.',
        ),
        { radio: T('{callsign}: andmed kirjas, seltskond sanitaarkaitsealalt väljas.', '{callsign}: details taken, the group is out of the protection zone.') },
      ),
      out(
        'warned',
        'warning',
        [0.4, 1],
        3,
        T(
          'Ujujad tulid veest välja ja lahkusid pärast hoiatust, valvur pani kirja koha, kust nad üle aia ronisid.',
          'The swimmers came out of the water and left after a warning; the guard noted where they had climbed over the fence.',
        ),
        { radio: T('{callsign}: ujujad väljas, hoiatus tehtud, lõpetame.', '{callsign}: swimmers out, warning given, closing.') },
      ),
      out(
        'chilled',
        'hospital',
        [0.15, 0.55],
        2,
        T(
          'Kaugele ujunud noormees jõudis kaldale, kuid oli tugevasti alajahtunud ja joobes. Kiirabi viis ta haiglasse, teistele tehti hoiatus.',
          'The young man who had swum far out made it to the shore but was badly chilled and drunk. The ambulance took him to hospital; the others were warned.',
        ),
        { injuries: 1, radio: T('{callsign}: üks alajahtunud haiglasse, teised hoiatatud.', '{callsign}: one hypothermic to hospital, the others warned.') },
      ),
      out(
        'pulled_out',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Järve keskele ujunud noormees jäi hätta ja ta tuli veest välja tõmmata. Ta toimetati alajahtumise ja vee sissehingamise tõttu haiglasse, teiste andmed edastati Keskkonnaametile.',
          'The young man who swam out to the middle got into trouble and had to be pulled out of the water. He was taken to hospital with hypothermia after inhaling water; the others’ details went to the Environmental Board.',
        ),
        { injuries: 1, radio: T('{callsign}: ujuja tõmmati veest välja, haiglasse.', '{callsign}: swimmer pulled out of the water, to hospital.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.3,
      toPriority: 1,
      text: T(
        'Valvur: järve keskele ujunud meest ei ole enam näha, sõbrad karjuvad kaldal.',
        'Guard: the man who swam out to the middle of the lake can no longer be seen, his friends are screaming on the shore.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.2,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Ma valvan Ülemiste veehaaret. Joobes noored ujuvad jälle järves, see on ju linna joogivesi!',
          'I guard the Ülemiste water intake. Drunk young people are swimming in the lake again, this is the city’s drinking water!',
        ),
        T(
          'Seltskond ronis üle aia, tegi kaldale grilli ja läks ujuma. Üks ujus järve keskele välja.',
          'A group climbed over the fence, lit a barbecue on the shore and went swimming. One of them swam out to the middle of the lake.',
        ),
      ],
      answers: {
        count: [T('Neid on viis-kuus, kaks on veel vees.', 'Five or six of them, two still in the water.')],
        intoxicated: [T('Nad joovad kaldal õlut ja on üsna vintis.', 'They are drinking beer on the shore and are fairly tipsy.')],
        when: [T('Nad tulid umbes tund aega tagasi, vette läksid just praegu.', 'They came about an hour ago and went into the water just now.')],
      },
      answersRu: {
        count: ['Их пять или шесть, двое ещё в воде.'],
        intoxicated: ['Они пьют на берегу пиво и уже порядком навеселе.'],
        when: ['Пришли примерно час назад, а в воду полезли только что.'],
      },
      openingRu: [
        'Я охраняю водозабор на Юлемисте. Пьяная молодёжь опять купается в озере, это же питьевая вода города!',
        'Компания перелезла через забор, разожгла на берегу гриль и пошла купаться. Один заплыл на середину озера.',
      ],
    },
    tags: ['swimming', 'alcohol', 'youth'],
  },

  // 8. A young ibex has slipped out of the Tallinn zoo enclosure and is heading for Paldiski maantee.
  {
    id: 'assist_loomaaiast_paasenud_kaljukits',
    category: 'assist',
    code: 'LOOM',
    title: T('Loomaaiast pääsenud kaljukits', 'Ibex escaped from the zoo'),
    priority: 3,
    weight: 0.05,
    hours: [0, 0, 0, 0, 0, 0, 0.2, 0.8, 1.4, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.6, 1.2, 0.8, 0.4, 0.2, 0, 0, 0],
    places: ['park'],
    placeTags: ['zoo'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [{ role: 'caller', gender: 'any', age: [25, 60], relation: 'employee' }],
    agencies: [{ agency: 'paaste', chance: 0.4, reason: T('Looma püüdmine kõrgelt', 'Catching the animal from a height') }],
    summary: [
      T(
        '{address}. Tallinna loomaaia töötaja teatel pääses aedikust välja noor kaljukits, kes liigub Paldiski maantee poole. Töötajad on tal kannul.',
        '{address}. A Tallinn zoo keeper reports that a young ibex has got out of its enclosure and is heading for Paldiski maantee. Staff are on its heels.',
      ),
      T(
        '{address}. Loomaaiast põgenenud kaljukits hüppas üle aia ja seisab naabruses garaažikatusel. Inimesed kogunevad filmima.',
        '{address}. An ibex that escaped from the zoo jumped the fence and is standing on a garage roof nearby. People are gathering to film it.',
      ),
    ],
    callerLines: [
      T(
        'Meil pääses kaljukits aedikust välja ja hüppas üle välisaia. Ta jookseb maantee poole!',
        'An ibex has got out of its enclosure and jumped the outer fence. It is running towards the main road!',
      ),
      T(
        'Põgenenud kaljukits on noor ja hirmul, hüppab autodele ja katustele. Palun hoidke inimesed eemal, sarved on teravad.',
        'The escaped ibex is young and frightened, it jumps onto cars and roofs. Please keep people away, the horns are sharp.',
      ),
    ],
    callerLinesRu: [
      'У нас из вольера сбежал козерог и перепрыгнул через внешний забор. Он бежит к шоссе!',
      'Сбежавший козерог молодой и напуганный, прыгает на машины и крыши. Пожалуйста, держите людей подальше, рога острые.',
    ],
    details: [
      T(
        'Töötaja sõnul liigub kits Paldiski maantee suunas, kus on tihe liiklus.',
        'The keeper says the ibex is heading towards Paldiski maantee, where traffic is heavy.',
      ),
      T(
        'Loomaaia veterinaar tuleb uinutusrelvaga, kuid jõuab kohale alles poole tunni pärast.',
        'The zoo vet is coming with a tranquilliser gun but will only arrive in half an hour.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, kits hüppab maantee lähedal garaažide ja autode vahel, inimesed filmivad lähedalt. Hoiame rahva eemal.',
          '{callsign}: on scene, the ibex is leaping about among the garages and cars near the main road and people are filming from close up. Keeping the crowd back.',
        ),
      ]),
      choice(
        3,
        [
          T(
            '{callsign}: töötajad tahavad kitse loomaaia poole ajada, aga maantee on lähedal ja ta võib autode ette joosta. Kas peatame ajutiselt Paldiski maantee liikluse?',
            '{callsign}: the keepers want to drive the ibex back towards the zoo, but the main road is close and it may run in front of the cars. Do we stop the traffic on Paldiski maantee for a while?',
          ),
        ],
        [
          opt(
            'close',
            T('Peatage liiklus, oodake veterinaari', 'Stop the traffic, wait for the vet'),
            T(
              '{callsign}, peatage ajutiselt liiklus ja hoidke inimesed eemal, kuni veterinaar on kohal.',
              '{callsign}, stop the traffic for a while and keep people back until the vet is there.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'chase',
            T('Ajage kits ise tagasi', 'Drive the ibex back yourselves'),
            T('{callsign}, aidake töötajatel kits aia poole ajada, liiklust ei peata.', '{callsign}, help the keepers drive the ibex towards the fence; the traffic keeps moving.'),
            { success: -0.1, risk: 0.03 },
          ),
        ],
        'chase',
      ),
      agency(
        'paaste',
        6,
        [
          T(
            '{callsign}: kits on kõrgel katusel ja paanikas, töötajad ei ulatu. Palun päästjad redeliga.',
            '{callsign}: the ibex is high up on a roof and panicking, the keepers cannot reach it. Rescuers with a ladder please.',
          ),
        ],
        { chance: 0.5, timeoutMin: 8, fail: { success: -0.1 } },
      ),
    ],
    outcomes: [
      out(
        'tranquillised',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Veterinaar uinutas kitse ja loomaaia töötajad viisid ta aedikusse tagasi. Kits jäi terveks ja keegi viga ei saanud.',
          'The vet tranquillised the ibex and the keepers carried it back to its enclosure. The animal was unhurt and nobody was injured.',
        ),
        { trust: 2, radio: T('{callsign}: kits uinutatud ja tagasi aedikus, lõpetame.', '{callsign}: ibex tranquillised and back in its enclosure, closing.') },
      ),
      out(
        'herded',
        'resolved',
        [0.4, 0.9],
        2,
        T(
          'Kits aeti töötajate ja patrulli abiga loomaaia territooriumile tagasi. Loomaaed kontrollib aedikute aedu.',
          'The keepers and the patrol drove the ibex back into the zoo grounds. The zoo is checking the enclosure fences.',
        ),
        { radio: T('{callsign}: kits tagasi loomaaias, lõpetame.', '{callsign}: ibex back in the zoo, closing.') },
      ),
      out(
        'car_scratched',
        'report',
        [0.15, 0.55],
        2,
        T(
          'Enne kinnipüüdmist hüppas kits pargitud auto kapotile ja kriimustas seda. Auto omanikule selgitati, kuidas kahju loomaaialt nõuda.',
          'Before it was caught the ibex jumped onto a parked car’s bonnet and scratched it. The owner was told how to claim the damage from the zoo.',
        ),
        { radio: T('{callsign}: kits püütud, üks auto kriimustatud, vormistame.', '{callsign}: ibex caught, one car scratched, doing the paperwork.') },
      ),
      out(
        'hit',
        'report',
        [0, 0.3],
        2,
        T(
          'Kits jooksis Paldiski maanteele ja sõiduauto põrkas temaga kokku. Kits hukkus, juht vigastusi ei saanud, liiklusõnnetus vormistati.',
          'The ibex ran onto Paldiski maantee and was hit by a car. The animal died; the driver was unhurt and the accident was recorded.',
        ),
        { radio: T('{callsign}: kits jäi auto alla, juht terve, vormistame.', '{callsign}: ibex hit by a car, driver unhurt, doing the paperwork.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.4,
      toPriority: 2,
      text: T('Teine teade: kits hüppas Paldiski maanteele, autod pidurdavad järsult.', 'A second call: the ibex has jumped onto Paldiski maantee, cars are braking hard.'),
    },
    expiresMin: 90,
    interactiveChance: 0.15,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Helistan Tallinna loomaaiast. Meil pääses kaljukits välja ja ta jookseb Paldiski maantee poole!',
          'I am calling from Tallinn zoo. An ibex has got out and is running towards Paldiski maantee!',
        ),
        T(
          'Noor kaljukits hüppas üle loomaaia aia ja seisab nüüd ühe garaaži katusel. Rahvas tuleb ligi filmima.',
          'A young ibex jumped the zoo fence and is now standing on a garage roof. People are coming up close to film it.',
        ),
      ],
      answers: {
        count: [T('Kits on üks, aga ümberringi on juba kümmekond inimest telefonidega.', 'There is one ibex, but there are already a dozen people round it with their phones.')],
        injured: [T('Veel ei ole keegi viga saanud, aga ta hüppas just ühe auto kapotile.', 'Nobody is hurt yet, but it just jumped onto a car bonnet.')],
        when: [T('Umbes kümme minutit tagasi, söötmise ajal.', 'About ten minutes ago, at feeding time.')],
        intoxicated: [T('Joobes? Siin on ainult kits ja pealtvaatajad.', 'Drunk? There is only the ibex and the onlookers.')],
      },
      answersRu: {
        count: ['Козерог один, но вокруг уже человек десять с телефонами.'],
        injured: ['Пока никто не пострадал, но он только что запрыгнул на капот машины.'],
        when: ['Минут десять назад, во время кормления.'],
        intoxicated: ['Пьяный? Тут только козерог и зеваки.'],
      },
      openingRu: [
        'Звоню из Таллинского зоопарка. У нас сбежал козерог и бежит к Палдискому шоссе!',
        'Молодой козерог перепрыгнул через забор зоопарка и теперь стоит на крыше гаража. Люди подходят снимать.',
      ],
    },
    tags: ['animal', 'zoo'],
  },

  // 9. A tourist lured into an old-town club is billed thousands and not let out until he pays.
  {
    id: 'fraud_turisti_klubiarve',
    category: 'fraud',
    code: 'KE',
    title: T('Turistile esitati klubis tuhandete eurode arve', 'Tourist billed thousands of euros at a club'),
    priority: 3,
    weight: 0.9,
    hours: 'nightlife',
    weekendBoost: 1.6,
    places: ['nightclub'],
    placeTags: ['tourist'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'victim', gender: 'M', age: [25, 60], intoxicated: 0.8 },
      { role: 'suspect', gender: 'M', age: [25, 45], record: 0.4 },
    ],
    callerRole: 'victim',
    summary: [
      T(
        '{place}, {address}. Välismaalasest turist teatab, et klubis esitati talle mõne šampanjapudeli eest 2800 euro suurune arve. Turvamehed ei lase tal enne maksmist lahkuda.',
        '{place}, {address}. A foreign tourist reports that the club has billed him 2,800 euros for a few bottles of champagne. The bouncers will not let him leave until he pays.',
      ),
      T(
        '{place}, {address}. Turisti kaardilt võeti klubis öö jooksul üle 3000 euro. Ta ei mäleta neid makseid ja kahtlustab, et tema jooki lisati midagi.',
        '{place}, {address}. More than 3,000 euros was taken from a tourist’s card at the club overnight. He does not remember the payments and suspects his drink was spiked.',
      ),
      T(
        '{place}, {address}. Kaks naist kutsusid turisti tänavalt klubisse, nüüd nõutakse temalt iga joogi eest sadu eurosid. Turist helistab klubi tualetist.',
        '{place}, {address}. Two women invited a tourist off the street into the club; now he is being charged hundreds of euros a drink. He is calling from the club toilet.',
      ),
    ],
    callerLines: [
      T(
        'Ma tellisin paar jooki ja nüüd tahavad nad minult peaaegu kolm tuhat eurot! Nad ei lase mind uksest välja.',
        'I ordered a couple of drinks and now they want almost three thousand euros from me! They will not let me out of the door.',
      ),
      T(
        'Kaks naist kutsusid mind tänavalt siia, ütlesid, et see on tavaline baar. Nüüd on nad kadunud.',
        'Two women invited me in off the street and said it was an ordinary bar. Now they have gone.',
      ),
      T(
        'Mu kaardilt on juba mitu makset läinud, ma ei mäleta, et oleksin need teinud.',
        'Several payments have already gone from my card and I do not remember making them.',
      ),
    ],
    callerLinesRu: [
      'Я заказал пару напитков, а теперь с меня хотят почти три тысячи евро! Меня отсюда не выпускают.',
      'Две женщины позвали меня с улицы, сказали, что это обычный бар. Теперь их нет.',
      'С моей карты уже ушло несколько платежей, а я не помню, чтобы их делал.',
    ],
    details: [
      T(
        'Turisti sõnul seisavad kaks turvameest ukse ees ja üks neist haaras tal käest kinni. Ta on joobes ja hirmul.',
        'The tourist says two bouncers are standing at the door and one of them grabbed his arm. He is drunk and frightened.',
      ),
      T(
        'Vanalinna klubide kohta on sel aastal laekunud mitu sarnast avaldust, hinnad on menüüs pisikeses kirjas.',
        'Several similar complaints about old town clubs have been made this year; the prices are in tiny print on the menu.',
      ),
    ],
    beats: [
      qp('suspect', 'arrive', [
        T(
          '{callsign}: kohal, klubi juhataja nõuab arve tasumist. Juhataja on {name}, isikukood {idcode}, kontrolli palun.',
          '{callsign}: on scene, the club manager is demanding the bill be paid. The manager is {name}, ID code {idcode}, please check.',
        ),
      ]),
      choice(
        4,
        [
          T(
            '{callsign}: klubi näitab menüüd ja kaardimakseid, turist väidab, et ei teinud neid teadlikult. Kas käsitleme kelmusena või selgitame, et see on tsiviilvaidlus?',
            '{callsign}: the club is showing the menu and the card payments; the tourist says he did not make them knowingly. Do we treat it as fraud or explain that it is a civil dispute?',
          ),
        ],
        [
          opt(
            'fraud',
            T('Kelmus, salvestised ja makseandmed menetlusse', 'Fraud: secure the footage and the payment records'),
            T(
              '{callsign}, turist võib vabalt lahkuda. Võtke seletused, nõudke valvekaamera salvestist ja kaarditerminali väljavõtet, alustame kelmuse menetlust.',
              '{callsign}, the tourist is free to leave. Take statements, request the CCTV footage and the card terminal records; we are opening a fraud case.',
            ),
            { success: 0.2, time: 15, trust: 2 },
          ),
          opt(
            'civil',
            T('Tsiviilvaidlus, pooled lahku', 'Civil dispute, separate them'),
            T(
              '{callsign}, selgitage, et hinnavaidlus on tsiviilasi. Turist võib lahkuda ja maksed pangas vaidlustada.',
              '{callsign}, explain that a price dispute is a civil matter. The tourist may leave and dispute the payments with his bank.',
            ),
            { success: -0.1, trust: -2, outcome: 'paid' },
          ),
        ],
        'civil',
      ),
      agency(
        'kiirabi',
        8,
        [
          T(
            '{callsign}: turist on väga uimane ja räägib segaselt, jooki võidi lisada midagi. Palun kiirabi.',
            '{callsign}: the tourist is very drowsy and slurring, his drink may have been spiked. Ambulance please.',
          ),
        ],
        { chance: 0.3, timeoutMin: 6 },
      ),
    ],
    outcomes: [
      out(
        'fraud_case',
        'report',
        [0.5, 1],
        4,
        T(
          'Turist pääses klubist ja temalt võeti seletus. Valvekaamera salvestis ja kaarditerminali andmed võeti menetlusse, alustati kriminaalmenetlust kelmuse tunnustel KarS § 209 järgi.',
          'The tourist got out of the club and gave a statement. The CCTV footage and the card terminal data were taken into the case and criminal proceedings were opened for fraud under KarS § 209.',
        ),
        { trust: 2, radio: T('{callsign}: turist vaba, salvestised võetud, kelmuse menetlus.', '{callsign}: tourist free, footage secured, fraud case opened.') },
      ),
      out(
        'refunded',
        'resolved',
        [0.4, 1],
        2,
        T(
          'Pärast patrulli saabumist tühistas klubi suurema osa makseid ja turist lahkus. Talle selgitati, kuidas ülejäänud summa pangas vaidlustada.',
          'Once the patrol arrived the club cancelled most of the payments and the tourist left. He was told how to dispute the rest with his bank.',
        ),
        { radio: T('{callsign}: klubi tühistas maksed, turist lahkus, lõpetame.', '{callsign}: the club cancelled the payments, the tourist has left, closing.') },
      ),
      out(
        'paid',
        'referred',
        [0, 0.05],
        2,
        T(
          'Turist lahkus klubist, kuid kaardilt juba läinud makseid klubi ei tühistanud. Temalt võeti avaldus ja talle selgitati, kuidas makseid pangas vaidlustada.',
          'The tourist left the club, but the club did not cancel the payments already taken from his card. His complaint was taken and he was told how to dispute the payments with his bank.',
        ),
        { radio: T('{callsign}: turist lahkus, makseid ei tühistatud, avaldus vastu võetud.', '{callsign}: tourist has left, payments not cancelled, complaint taken.') },
      ),
      out(
        'roughed_up',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Turvamehed olid turisti enne patrulli saabumist vastu seina surunud ja tema telefoni ära võtnud. Turist toimetati kiirabiga haiglasse, alustati kriminaalmenetlust kehalise väärkohtlemise ja kelmuse tunnustel.',
          'Before the patrol arrived the bouncers had pinned the tourist against a wall and taken his phone. He was taken to hospital by ambulance; criminal proceedings were opened for assault and fraud.',
        ),
        { injuries: 1, radio: T('{callsign}: turist haiglasse, turvamehe suhtes menetlus.', '{callsign}: tourist to hospital, case opened against a bouncer.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.35,
      toPriority: 2,
      text: T(
        'Turist helistas uuesti: turvamehed lükkasid ta vastu seina ja võtsid telefoni ära, kõne katkes.',
        'The tourist called again: the bouncers shoved him against a wall and took his phone, and the call cut off.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.2,
    tags: ['tourists', 'nightlife', 'scam'],
  },

  // 10. An agitated man climbs into an embassy yard; the police may enter only with the mission's consent.
  {
    id: 'public_order_mees_saatkonna_hoovis',
    category: 'public_order',
    code: 'AK',
    title: T('Ärritunud mees saatkonna väravas', 'Agitated man at an embassy gate'),
    priority: 2,
    weight: 0.2,
    hours: 'day',
    places: ['embassy'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 60], intoxicated: 0.3, record: 0.3 },
      { role: 'caller', gender: 'any', age: [25, 55], relation: 'employee' },
    ],
    agencies: [{ agency: 'kapo', chance: 0.6, reason: T('Intsident välisriigi esinduse juures', 'Incident at a foreign diplomatic mission') }],
    summary: [
      T(
        '{place}, {address}. Saatkonna turvatöötaja teatel raputab ärritunud mees väravat, karjub ja nõuab, et teda sisse lastaks. Värava ette on jäetud suur kott.',
        '{place}, {address}. Embassy security report an agitated man shaking the gate, shouting and demanding to be let in. A large bag has been left in front of the gate.',
      ),
      T(
        '{place}, {address}. Mees viskas saatkonna väravale värvi ja üritab nüüd üle värava ronida. Turvatöötajad on hoones sees.',
        '{place}, {address}. A man has thrown paint over the embassy gate and is now trying to climb over it. The security staff are inside the building.',
      ),
      T(
        '{place}, {address}. Mees seisab plakatiga saatkonna värava ees ja ähvardab üle värava ronida, kui keegi temaga ei räägi. Möödujaid koguneb.',
        '{place}, {address}. A man with a placard in front of the embassy gate is threatening to climb over it unless someone talks to him. Passers-by are gathering.',
      ),
    ],
    callerLines: [
      T(
        'Ma töötan saatkonna turvas. Mees raputab väravat ja karjub, et tahab saadikuga rääkida.',
        'I work in embassy security. A man is shaking the gate and shouting that he wants to talk to the ambassador.',
      ),
      T(
        'Väravas karjuv mees jättis maha suure koti, ma ei tea, mis seal sees on.',
        'The man shouting at the gate has left a big bag there, I do not know what is in it.',
      ),
      T(
        'See mees ronib nüüd üle saatkonna värava! Väljaspool väravat me teda ise kinni pidada ei tohi.',
        'That man is now climbing over the embassy gate! We are not allowed to hold him ourselves outside the gate.',
      ),
    ],
    callerLinesRu: [
      'Я работаю в охране посольства. Мужчина трясёт ворота и кричит, что хочет поговорить с послом.',
      'Мужчина, который кричит у ворот, оставил там большую сумку, я не знаю, что в ней.',
      'Этот мужчина теперь лезет через ворота посольства! За пределами территории мы сами не имеем права его задерживать.',
    ],
    details: [
      T(
        'Turvatöötaja sõnul on mees väga ärritunud ja proovib üle värava ronida. Saatkonna hoovis on inimesi.',
        'Security say the man is very agitated and trying to climb over the gate. There are people in the embassy courtyard.',
      ),
      T(
        'Saatkonna territooriumile tohib politsei siseneda ainult esinduse juhi nõusolekul.',
        'The police may enter the embassy grounds only with the consent of the head of mission.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal, mees on üle värava saatkonna hoovi roninud ja karjub. Turvajuht palub meil ta ära viia. Kas läheme kohe sisse?',
            '{callsign}: on scene, the man has climbed over the gate into the embassy courtyard and is shouting. Their head of security asks us to remove him. Do we go straight in?',
          ),
        ],
        [
          opt(
            'consent',
            T('Kinnitage esinduse nõusolek, siis sisse', 'Confirm the mission’s consent, then go in'),
            T(
              '{callsign}, laske turvajuhil kinnitada, et esinduse juht annab nõusoleku, siis sisenege. Kott jääb puutumata.',
              '{callsign}, have the head of security confirm that the head of mission consents, then go in. Leave the bag untouched.',
            ),
            { success: 0.2, time: 5 },
          ),
          opt(
            'enter',
            T('Minge kohe sisse', 'Go straight in'),
            T('{callsign}, sisenege kohe ja toimetage mees välja.', '{callsign}, go in at once and bring the man out.'),
            { success: -0.1, trust: -3, outcome: 'protest' },
          ),
          opt(
            'wait',
            T('Oodake väljaspool väravat', 'Wait outside the gate'),
            T('{callsign}, jääge väljapoole väravat ja rääkige temaga, kuni ta ise välja tuleb.', '{callsign}, stay outside the gate and talk to him until he comes out himself.'),
            { success: -0.05, time: 15, outcome: 'talked_down' },
          ),
        ],
        'wait',
      ),
      qp('suspect', 6, R_SUSPECT),
      info(10, [
        T(
          '{callsign}: mees näitas ise koti sisu, seal on plakatid ja dokumendid. Ta räägib, et saatkond ei anna talle passi.',
          '{callsign}: the man showed us what is in the bag himself: placards and papers. He says the embassy will not give him a passport.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'removed',
        'arrest',
        [0.5, 1],
        3,
        T(
          'Esinduse juhi nõusolekul toodi mees saatkonna hoovist välja ja peeti kinni. Alustati väärteomenetlust avaliku korra rikkumise eest KarS § 262 järgi, juhtumist teavitati Kaitsepolitseiametit ja Välisministeeriumi.',
          'With the head of mission’s consent the man was brought out of the embassy yard and detained. Misdemeanour proceedings were opened for a breach of public order under KarS § 262; the Internal Security Service and the Foreign Ministry were informed.',
        ),
        { arrests: 1, radio: T('{callsign}: mees hoovist välja toodud ja kinni peetud.', '{callsign}: man brought out of the yard and detained.') },
      ),
      out(
        'talked_down',
        'warning',
        [0, 0.05],
        2,
        T(
          'Mees rahunes ja tuli ise saatkonna hoovist välja. Ta sai rääkida konsulaartöötajaga, talle tehti hoiatus ja juhtumist teavitati Kaitsepolitseiametit.',
          'The man calmed down and came out of the embassy yard by himself. He was allowed to speak to a consular officer, was warned, and the Internal Security Service was informed.',
        ),
        { radio: T('{callsign}: mees tuli ise välja, rahunes, hoiatus tehtud.', '{callsign}: the man came out himself, calmed down, warning given.') },
      ),
      out(
        'damage',
        'report',
        [0.2, 0.6],
        2,
        T(
          'Mees peeti kinni, kui ta oli saatkonna väravat ja valvekaamerat kahjustanud. Alustati kriminaalmenetlust asja kahjustamise tunnustel ja teavitati Kaitsepolitseiametit.',
          'The man was detained after damaging the embassy gate and a security camera. Criminal proceedings were opened for criminal damage and the Internal Security Service was informed.',
        ),
        { arrests: 1, radio: T('{callsign}: mees kinni, värav kahjustatud, menetlus alustatud.', '{callsign}: man detained, the gate damaged, case opened.') },
      ),
      out(
        'protest',
        'report',
        [0, 0.05],
        2,
        T(
          'Mees peeti saatkonna hoovis kinni, kuid politsei sisenes sinna enne esinduse juhi nõusolekut. Saatkond esitas Välisministeeriumile protesti, asjaolusid selgitatakse.',
          'The man was detained in the embassy yard, but the police went in before the head of mission had consented. The embassy protested to the Foreign Ministry and the circumstances are being looked into.',
        ),
        { arrests: 1, radio: T('{callsign}: mees kinni, saatkond protestib sisenemise pärast.', '{callsign}: man detained, the embassy protests that we went in.') },
      ),
      out(
        'guard_hurt',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Mees tormas saatkonna hoovis turvatöötaja kallale ja lõi teda, enne kui ta ohjeldati. Turvatöötaja toimetati haiglasse, mees peeti kinni ja alustati kriminaalmenetlust.',
          'In the embassy yard the man rushed at a security guard and hit him before he was restrained. The guard was taken to hospital; the man was detained and criminal proceedings opened.',
        ),
        { injuries: 1, arrests: 1, radio: T('{callsign}: turvatöötaja haiglasse, ründaja kinni peetud.', '{callsign}: security guard to hospital, attacker detained.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.4,
      toPriority: 1,
      text: T(
        'Turvatöötaja: mees ronis üle värava saatkonna hoovi ja tormab hoone poole, töötajad lukustavad uksi!',
        'Security: the man has climbed over the gate into the embassy courtyard and is rushing at the building, staff are locking the doors!',
      ),
    },
    expiresMin: 60,
    interactiveChance: 0.2,
    tags: ['embassy', 'public_order_watch'],
  },

  // 11. Youngsters filming inside the closed Linnahall at night; one falls through a rotten floor.
  {
    id: 'assist_noor_kukkus_suletud_linnahallis',
    category: 'assist',
    code: 'ABI',
    title: T('Noormees kukkus suletud Linnahallis', 'Young man fell inside the closed Linnahall'),
    priority: 2,
    weight: 0.2,
    hours: 'night',
    places: ['concert'],
    placeTags: ['abandoned'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [40, 90],
    persons: [
      { role: 'victim', gender: 'M', age: [16, 17] },
      { role: 'caller', gender: 'any', age: [16, 17], relation: 'friend' },
    ],
    agencies: [
      { agency: 'paaste', chance: 1, reason: T('Kukkunu toomine suletud hoone keldrist', 'Bringing the fallen youngster up from the basement of a closed building') },
      { agency: 'kiirabi', chance: 1, reason: T('Kõrguselt kukkunud noor', 'Young person fallen from a height') },
    ],
    summary: [
      T(
        '{place}, {address}. Noored ronisid suletud Linnahalli filmima, üks kukkus pimedas läbi lagunenud põranda alumisele korrusele. Sõbrad ei pääse tema juurde.',
        '{place}, {address}. Young people climbed into the closed Linnahall to film; one fell through a rotten floor to the level below in the dark. His friends cannot get to him.',
      ),
      T(
        '{place}, {address}. Seltskond noori läks katuselt Linnahalli sisse, üks neist kukkus vanas jäähallis mitu meetrit alla. Ta vastab hüüetele nõrgalt.',
        '{place}, {address}. A group of young people went into Linnahall from the roof and one of them fell several metres in the old ice hall. He answers their shouts weakly.',
      ),
    ],
    callerLines: [
      T(
        'Me läksime Linnahalli sisse pilte tegema ja mu sõber kukkus läbi põranda! Siin on täiesti pime.',
        'We went into Linnahall to take pictures and my friend fell through the floor! It is pitch dark in here.',
      ),
      T(
        'Ta on all keldris, ma kuulen teda, aga ta ütleb, et jalg on katki ja ta ei saa liikuda.',
        'He is down in the basement, I can hear him, but he says his leg is broken and he cannot move.',
      ),
      T(
        'Me tulime sisse mere poolt katuseluugist, väravast ei saa.',
        'We came in through a roof hatch on the sea side, you cannot get in through the gate.',
      ),
    ],
    callerLinesRu: [
      'Мы залезли в Линнахалл пофотографировать, и мой друг провалился сквозь пол! Тут совсем темно.',
      'Он внизу, в подвале, я его слышу, но он говорит, что нога сломана и он не может двигаться.',
      'Мы зашли через люк на крыше со стороны моря, через ворота не попасть.',
    ],
    details: [
      T(
        'Teataja sõnul vastab kukkunu üha nõrgemalt ja keldris on vett. Sõbrad tahavad ise alla ronida.',
        'The caller says the young man is answering ever more weakly and there is water in the basement. His friends want to climb down themselves.',
      ),
      T(
        'Linnahall on aastaid suletud, hoones on varisemisohtlikke kohti ja valgustust pole.',
        'Linnahall has been closed for years; parts of the building are at risk of collapse and there is no lighting.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, sõbrad juhatavad meid katuseluugi juurde. Hoone on pime ja suur, otsime kukkunut taskulampidega.',
          '{callsign}: on scene, the friends are taking us to the roof hatch. The building is dark and huge; searching for the young man with torches.',
        ),
      ]),
      choice(
        5,
        [
          T(
            '{callsign}: leidsime ta, ta lamab keldris umbes viie meetri sügavusel. Sõbrad tahavad köiega alla ronida. Kas ootame päästjaid?',
            '{callsign}: we have found him, he is lying in the basement about five metres down. His friends want to climb down on a rope. Do we wait for the rescuers?',
          ),
        ],
        [
          opt(
            'wait',
            T('Oodake päästjaid, keegi alla ei roni', 'Wait for the rescuers, nobody climbs down'),
            T(
              '{callsign}, keegi alla ei roni. Rääkige temaga ülevalt ja juhatage päästjad kohale.',
              '{callsign}, nobody climbs down. Talk to him from above and guide the rescuers in.',
            ),
            { success: 0.2, time: 10 },
          ),
          opt(
            'rope',
            T('Laske sõber köiega alla', 'Let a friend go down on the rope'),
            T('{callsign}, laske üks sõber köiega alla kukkunut toetama.', '{callsign}, let one of the friends go down on the rope to support him.'),
            { success: -0.2, risk: 0.05, outcome: 'second_fall' },
          ),
        ],
        'rope',
      ),
      info(12, [
        T(
          '{callsign}: päästjad on keldris ja kiirabi on kohal. Paneme noorte andmed kirja ja teavitame vanemaid.',
          '{callsign}: the rescuers are in the basement and the ambulance is here. Taking the youngsters’ details and informing the parents.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'brought_up',
        'hospital',
        [0.3, 1],
        4,
        T(
          'Päästjad tõid noormehe keldrist üles ja kiirabi viis ta jalaluumurruga haiglasse. Teiste noorte vanemaid teavitati ja hoone omanikule tehti ettepanek sissepääsud sulgeda.',
          'The rescuers brought the young man up from the basement and the ambulance took him to hospital with a broken leg. The other youngsters’ parents were informed and the building’s owner was asked to seal the entrances.',
        ),
        { injuries: 1, radio: T('{callsign}: noormees üles toodud, jalaluumurruga haiglasse.', '{callsign}: young man brought up, to hospital with a broken leg.') },
      ),
      out(
        'warned',
        'warning',
        [0.55, 1],
        2,
        T(
          'Kukkunud noormehel oli vaid hüppeliiges välja väänatud ja päästjad tõid ta üles. Noortele ja nende vanematele tehti hoiatus, Linnahalli omanikku teavitati katkisest luugist.',
          'The young man had only twisted his ankle and the rescuers brought him up. The youngsters and their parents were warned and Linnahall’s owner was told about the broken hatch.',
        ),
        { radio: T('{callsign}: noormees üleval, kerge vigastus, noored hoiatatud.', '{callsign}: young man brought up, minor injury, the youngsters warned.') },
      ),
      out(
        'second_fall',
        'hospital',
        [0, 0.05],
        2,
        T(
          'Sõber ronis köiega alla ja kukkus samuti. Päästjad tõid mõlemad üles, kaks noort toimetati vigastustega haiglasse.',
          'A friend climbed down on the rope and fell too. The rescuers brought both up and the two youngsters were taken to hospital injured.',
        ),
        { injuries: 2, radio: T('{callsign}: sõber kukkus ka, kaks noort haiglasse.', '{callsign}: a friend fell too, two youngsters to hospital.') },
      ),
      out(
        'critical',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Noormees oli keldris kaua külmas vees lamanud ja kaotanud teadvuse. Päästjad tõid ta üles ja ta toimetati raskes seisundis haiglasse, juhtumi asjaolusid uuritakse.',
          'The young man had lain in cold water in the basement for a long time and lost consciousness. The rescuers brought him up and he was taken to hospital in a critical condition; the circumstances are being investigated.',
        ),
        { injuries: 1, radio: T('{callsign}: noormees teadvuseta, raskes seisundis haiglasse.', '{callsign}: young man unconscious, to hospital in a critical condition.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.4,
      toPriority: 1,
      text: T(
        'Teataja: kukkunu ei vasta enam hüüetele ja sõbrad tahavad köiega talle järele ronida!',
        'Caller: the young man no longer answers their shouts and his friends want to climb down after him on a rope!',
      ),
    },
    expiresMin: 60,
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Me oleme Linnahallis sees ja mu sõber kukkus läbi põranda! Ta on all keldris, palun tulge!',
          'We are inside Linnahall and my friend fell through the floor! He is down in the basement, please come!',
        ),
        T(
          'Siin on täiesti pime ja mu sõber vastab ainult vaikselt. Ta ütleb, et jalg on katki.',
          'It is pitch dark in here and my friend only answers quietly. He says his leg is broken.',
        ),
      ],
      answers: {
        injured: [T('Jalg on katki ja ta on vees, ta ütleb, et on väga külm.', 'His leg is broken and he is in water, he says he is very cold.')],
        count: [T('Meid on neli, üks on all, kolm oleme ülal.', 'There are four of us, one down below, three of us up here.')],
        when: [T('Kümme minutit tagasi, me otsisime kõigepealt ise teed alla.', 'Ten minutes ago, we first tried to find a way down ourselves.')],
        children: [T('Me oleme kõik kuueteist-seitsmeteistaastased.', 'We are all sixteen or seventeen.')],
        intoxicated: [T('Ei, keegi meist ei joonud, me tulime ainult filmima.', 'No, none of us was drinking, we only came to film.')],
      },
      answersRu: {
        injured: ['Нога сломана, и он в воде, говорит, что ему очень холодно.'],
        count: ['Нас четверо, один внизу, трое наверху.'],
        when: ['Минут десять назад, мы сначала сами искали, как спуститься.'],
        children: ['Нам всем по шестнадцать-семнадцать лет.'],
        intoxicated: ['Нет, никто из нас не пил, мы пришли только снимать.'],
      },
      openingRu: [
        'Мы внутри Линнахалла, и мой друг провалился сквозь пол! Он внизу, в подвале, приезжайте, пожалуйста!',
        'Тут совсем темно, а мой друг отвечает еле слышно. Он говорит, что нога сломана.',
      ],
    },
    tags: ['youth', 'abandoned', 'fall'],
  },

  // 12. Unpaid workers on one of Tallinn's big building sites shut the site manager in his office container.
  {
    id: 'public_order_ehitustoolised_nouavad_palka',
    category: 'public_order',
    code: 'AK',
    title: T('Palgata ehitustöölised piiravad töödejuhatajat', 'Unpaid construction workers corner the site manager'),
    priority: 3,
    weight: 0.3,
    hours: [0, 0, 0, 0, 0, 0, 0.2, 0.8, 1.4, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.6, 1.2, 0.8, 0.4, 0.2, 0, 0, 0],
    places: ['construction'],
    regions: ['pohja'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'victim', gender: 'M', age: [35, 60], relation: 'employee' },
      { role: 'suspect', gender: 'M', age: [25, 55], intoxicated: 0.2, record: 0.15 },
    ],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Suure ehitusobjekti töödejuhataja teatel ei lase paarkümmend ehitustöölist teda kontorikonteinerist välja, nad nõuavad kolme kuu palka. Alltöövõtja, kes neid palkas, ei vasta telefonile.',
        '{address}. The site manager of a large building project reports that some twenty construction workers will not let him out of the site office container; they are demanding three months’ wages. The subcontractor who hired them is not answering the phone.',
      ),
      T(
        '{address}. Ehitusplatsil panid töölised töö maha ega lase töödejuhatajat konteinerist välja. Üks mees lõi rusikaga vastu akent.',
        '{address}. Workers on the building site have downed tools and will not let the site manager out of his container. One man punched the window.',
      ),
    ],
    callerLines: [
      T(
        'Töölised ei lase mind kontorist välja. Nad pole kolm kuud palka saanud, aga ma ei ole nende tööandja!',
        'The workers will not let me out of the office. They have not been paid for three months, but I am not their employer!',
      ),
      T(
        'Alltöövõtja kadus ära ja nüüd tahavad nad raha minult. Mõned on väga vihased.',
        'The subcontractor has vanished and now they want the money from me. Some of them are very angry.',
      ),
      T(
        'Üks mees peksab rusikaga akent ja karjub, et nad ei lahku enne, kui keegi maksab.',
        'One man is pounding the window with his fist, shouting that they will not leave until someone pays.',
      ),
    ],
    callerLinesRu: [
      'Рабочие не выпускают меня из конторы. Им три месяца не платили зарплату, но я же не их работодатель!',
      'Субподрядчик исчез, и теперь они требуют деньги с меня. Некоторые очень злые.',
      'Один бьёт кулаком в окно и кричит, что они не уйдут, пока кто-нибудь не заплатит.',
    ],
    details: [
      T(
        'Töödejuhataja sõnul raputavad mõned töölised konteinerit ja ähvardavad akna sisse lüüa. Teised püüavad neid rahustada.',
        'The site manager says some of the workers are rocking the container and threatening to smash the window. Others are trying to calm them down.',
      ),
      T(
        'Töölised elavad objekti kõrval konteinerelamus ja paljudel pole raha isegi toidu jaoks.',
        'The workers live in container housing next to the site and many have no money even for food.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal, konteineri ümber on paarkümmend töölist, töödejuhataja on sees. Rahustame ägedamaid ja räägime nendega.',
          '{callsign}: on scene, about twenty workers round the container, the site manager is inside. Calming the hotheads down and talking to them.',
        ),
      ]),
      choice(
        4,
        [
          T(
            '{callsign}: töölised nõuavad, et keegi vastutaks. Peatöövõtja esindaja lubab tulla. Kas jääme vahendama või toome töödejuhataja välja ja saadame töölised laiali?',
            '{callsign}: the workers want someone to take responsibility. The main contractor’s representative promises to come. Do we stay and mediate, or bring the site manager out and send the workers away?',
          ),
        ],
        [
          opt(
            'mediate',
            T('Jääge peatöövõtjat ootama', 'Stay until the main contractor arrives'),
            T(
              '{callsign}, jääge kohale, kuni peatöövõtja esindaja jõuab. Selgitage töölistele, kuidas pöörduda Tööinspektsiooni poole ja esitada kuriteoteade.',
              '{callsign}, stay there until the main contractor’s representative arrives. Explain to the workers how to go to the Labour Inspectorate and report a crime.',
            ),
            { success: 0.2, time: 20, trust: 2 },
          ),
          opt(
            'disperse',
            T('Töödejuhataja välja, töölised laiali', 'Bring the manager out, send the workers away'),
            T('{callsign}, toimetage töödejuhataja välja ja saatke töölised objektilt laiali.', '{callsign}, bring the site manager out and send the workers off the site.'),
            { success: -0.1, risk: 0.05, trust: -2, outcome: 'window' },
          ),
        ],
        'disperse',
      ),
      qp(
        'suspect',
        8,
        [
          T(
            '{callsign}: akent löönud mees on {name}, isikukood {idcode}. Kontrolli palun.',
            '{callsign}: the man who hit the window is {name}, ID code {idcode}. Please check.',
          ),
        ],
        0.7,
      ),
    ],
    outcomes: [
      out(
        'mediated',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Peatöövõtja esindaja tuli kohale ja lubas võlgnetava palga töölistele otse välja maksta. Töödejuhataja pääses konteinerist, töölistele selgitati, kuidas pöörduda Tööinspektsiooni poole ja esitada kuriteoteade.',
          'The main contractor’s representative came and promised to pay the wages owed directly to the workers. The site manager got out of the container; the workers were told how to go to the Labour Inspectorate and report a crime.',
        ),
        { trust: 2, radio: T('{callsign}: peatöövõtja lubas maksta, olukord rahunes, lõpetame.', '{callsign}: the main contractor promised to pay, things have calmed down, closing.') },
      ),
      out(
        'complaints',
        'report',
        [0.4, 0.9],
        2,
        T(
          'Töölised esitasid avaldused ja alltöövõtja tegevust hakati kontrollima võimaliku kelmuse tunnustel. Materjalid edastati ka Tööinspektsioonile.',
          'The workers made complaints and the subcontractor is being investigated for possible fraud. The material was also passed to the Labour Inspectorate.',
        ),
        { radio: T('{callsign}: töölistelt avaldused, materjalid ka Tööinspektsioonile.', '{callsign}: complaints taken from the workers, also passed to the Labour Inspectorate.') },
      ),
      out(
        'window',
        'report',
        [0, 0.05],
        2,
        T(
          'Konteineri akna purustanud mehe suhtes alustati menetlust asja kahjustamise tunnustel. Töölised hajusid, palgavaidlus jäi lahendamata.',
          'Proceedings for criminal damage were opened against the man who smashed the container window. The workers dispersed; the wage dispute is unresolved.',
        ),
        { radio: T('{callsign}: aknalööja suhtes menetlus, töölised hajusid.', '{callsign}: case opened against the window smasher, the workers dispersed.') },
      ),
      out(
        'pushed',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Töölised tungisid konteinerisse ja töödejuhataja kukkus rüseluses vastu lauaserva. Ta toimetati haiglasse, kahe töölise suhtes alustati kriminaalmenetlust KarS § 121 järgi.',
          'The workers forced their way into the container and the site manager fell against the edge of a desk in the scuffle. He was taken to hospital; criminal proceedings were opened against two workers under KarS § 121.',
        ),
        { injuries: 1, radio: T('{callsign}: töödejuhataja haiglasse, kahe töölise suhtes menetlus.', '{callsign}: site manager to hospital, case opened against two workers.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.4,
      toPriority: 2,
      text: T(
        'Töödejuhataja: töölised lõhkusid akna ja üks tungis konteinerisse, mind tõugati maha.',
        'Site manager: the workers smashed the window and one forced his way into the container, I was pushed to the floor.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Töölised on mind ehitusplatsil kontorisse kinni pannud ja ei lase välja! Nad nõuavad palka.',
          'The workers have shut me in the office at the building site and will not let me out! They want their wages.',
        ),
        T(
          'Ma olen siin töödejuhataja. Paarkümmend töölist on konteineri ümber, üks lõi akent, palun saatke patrull.',
          'I am the site manager here. About twenty workers are round the container, one hit the window, please send a patrol.',
        ),
      ],
      answers: {
        count: [T('Neid on paarkümmend, aga ainult kolm-neli on tõesti agressiivsed.', 'There are about twenty, but only three or four are really aggressive.')],
        weapons: [T('Relvi ei ole, aga ehitusplatsil vedeleb igasugust rauda.', 'No weapons, but there is all kinds of metal lying around a building site.')],
        safe: [T('Ma olen konteineris, uks on lukus, aga aken on õhuke.', 'I am in the container with the door locked, but the window is thin.')],
        injured: [T('Veel ei ole keegi viga saanud.', 'Nobody is hurt yet.')],
        intoxicated: [T('Paar tükki on joonud, aga enamik on kained ja lihtsalt vihased.', 'A couple of them have been drinking, but most are sober and just angry.')],
        when: [T('Umbes pool tundi tagasi, kui nad said teada, et alltöövõtja on kadunud.', 'About half an hour ago, when they found out the subcontractor had vanished.')],
      },
      answersRu: {
        count: ['Их человек двадцать, но по-настоящему агрессивные только трое-четверо.'],
        weapons: ['Оружия нет, но на стройке всякого железа полно.'],
        safe: ['Я в вагончике, дверь заперта, но окно тонкое.'],
        injured: ['Пока никто не пострадал.'],
        intoxicated: ['Пара человек выпили, но большинство трезвые, просто злые.'],
        when: ['Где-то полчаса назад, когда они узнали, что субподрядчик пропал.'],
      },
      openingRu: [
        'Рабочие заперли меня в конторе на стройке и не выпускают! Они требуют зарплату.',
        'Я тут прораб. Человек двадцать рабочих стоят вокруг вагончика, один ударил по окну, пришлите патруль.',
      ],
    },
    tags: ['workers', 'construction', 'group'],
  },
];
