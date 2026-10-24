/**
 * Ida prefektuur: stories that only happen here (regions: ['ida']). Ida-Viru's oil-shale hills, the empty
 * Kreenholm mill, the Narva river with the state border down its middle, the foot passengers' queue at the
 * Narva-1 checkpoint, May at the war graves, the industrial harbours of Sillamäe and Kunda, the Kuremäe convent's
 * pilgrims, and in Lääne-Viru the Tapa garrison, its convoys on the Tallinn-Narva highway and the Võsu beach in
 * summer. Most callers in Narva, Sillamäe and Kohtla-Järve speak Russian, so every story carries a Russian call
 * script.
 *
 * Each story is tied to its real place with `placeTags` (tags added in src/data/regions/ida.ts): ashhill,
 * abandoned, borderqueue, memorial, rivermouth, riverside, e20, military, convent, garrison, partybeach, and the
 * existing industrial tag on the Sillamäe and Kunda harbours. Same rules as escalating.ts: a unit on scene in
 * time prevents the escalation, the best decision has the highest success effect, the worst endings need a low
 * success score, and law paragraphs stay in the outcome texts. Outcomes are chosen by success score alone, so
 * a wrong decision either forces its own ending (`effects.outcome`) or every ending it can reach is worded to
 * stay true after it.
 */
import type { IncidentTemplate } from '@/sim/types';
import { T, u, out, qp, qv, backup, agency, info, search, choice, opt, R_SUSPECT, R_DRIVER } from '../escalating';

export const TEMPLATES_REGIONAL_IDA: IncidentTemplate[] = [
  // 1. A teenager on a motocross bike crashes on the steep slope of an ash hill (Kohtla-Järve, Kiviõli).
  {
    id: 'assist_tuhamae_noolvalt_kukkunud',
    category: 'assist',
    code: 'ABI',
    title: T('Krossisõitja kukkus tuhamäe nõlval', 'Motocross rider fell on an ash hill slope'),
    priority: 2,
    weight: 0.8,
    months: [4, 5, 6, 7, 8, 9, 10],
    hours: 'evening',
    weekendBoost: 1.4,
    places: ['industrial', 'park'],
    placeTags: ['ashhill'],
    regions: ['ida'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [40, 90],
    persons: [
      { role: 'victim', gender: 'M', age: [14, 17] },
      { role: 'caller', gender: 'any', age: [14, 17], relation: 'friend' },
    ],
    agencies: [
      { agency: 'paaste', chance: 0.8, reason: T('Köispääste: kukkunu tuleb järsult nõlvalt alla tuua', 'Rope rescue: the casualty has to be brought down a steep slope') },
    ],
    summary: [
      T(
        '{address}. Krossitsikliga tuhamäe järsust nõlvast üles sõitnud noormees kukkus ja libises koos tsikliga alla. Ta jäi umbes poolel kõrgusel kivide vahele pidama ega saa jala tõttu liikuda.',
        '{address}. A young man who rode a motocross bike up the steep side of the ash hill crashed and slid down with the bike. He came to a stop among the stones about halfway down and cannot move because of his leg.',
      ),
      T(
        '{address}. Sõbra teatel kukkus noormees tuhamäel krossitsikliga, tsikkel veeres alla. Noormees ei tõuse püsti ja sõbrad ei pääse tema juurde.',
        '{address}. A friend reports that a young man crashed his motocross bike on the ash hill and the bike rolled down. He is not getting up and his friends cannot reach him.',
      ),
      T(
        '{address}. Noored sõitsid tuhamäel krossitsiklitega mööda järske nõlvu. Üks kukkus ja karjub valust, pinnas vajub jalge all ja sõbrad ei pääse tema juurde.',
        '{address}. Teenagers were riding motocross bikes up and down the steep slopes of the ash hill. One crashed and is screaming in pain; the ground gives way underfoot and his friends cannot reach him.',
      ),
    ],
    callerLines: [
      T(
        'Mu sõber kukkus tsikliga mäelt alla ja ei saa püsti, jalg on kuidagi viltu! Me ei pääse tema juurde, nõlv on nii järsk.',
        'My friend came off his bike and fell down the hill and he cannot get up, his leg is all twisted! We cannot get to him, the slope is so steep.',
      ),
      T('Ta tahtis otse üles sõita ja tsikkel viskas ta maha. Nüüd on ta seal poolel teel ja karjub.', 'He wanted to ride straight up and the bike threw him off. Now he is up there halfway and screaming.'),
      T('Nõlv on järsk ja pinnas vajub jalge all. Me ei tea, kust üles minna.', 'The slope is steep and the ground slides away underfoot. We do not know which way to climb up.'),
    ],
    callerLinesRu: [
      'Мой друг вместе с мотоциклом слетел с горы и не может встать, нога как-то вывернута! Мы не можем к нему подобраться, склон такой крутой.',
      'Он хотел заехать прямо наверх, и мотоцикл его сбросил. Теперь он там на полпути и кричит.',
      'Склон крутой, земля осыпается под ногами. Мы не знаем, как к нему залезть.',
    ],
    details: [
      T(
        'Teataja sõnul libiseb noormees aeg-ajalt veel allapoole. Ilma köiteta tema juurde ei pääse.',
        'The caller says the young man keeps slipping further down. He cannot be reached without ropes.',
      ),
      T(
        'Mäe järsud nõlvad on sõitmiseks keelatud, kuid noored käivad seal ikka, tsiklid on sageli registreerimata.',
        'Riding on the steep slopes of the hill is forbidden, but teenagers still go there; the bikes are often unregistered.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal mäe jalamil. Noormees on umbes kolmekümne meetri kõrgusel nõlval, pinnas vajub. Kas läheme ise üles või hoiame temaga häälkontakti ja ootame päästjate köisi?',
            '{callsign}: on scene at the foot of the hill. The young man is about thirty metres up the slope and the ground is giving way. Do we climb up ourselves, or keep voice contact and wait for the rescuers’ ropes?',
          ),
        ],
        [
          opt(
            'wait',
            T('Hoidke kontakti, oodake päästjaid', 'Keep contact, wait for the rescuers'),
            T('{callsign}, ärge ronige. Hoidke teda silmas, rääkige temaga ja juhatage päästjad kohale.', '{callsign}, do not climb. Keep your eyes on him, keep talking to him and guide the rescuers in.'),
            { success: 0.15, time: 15 },
          ),
          opt(
            'climb',
            T('Minge ise üles', 'Go up yourselves'),
            T('{callsign}, proovige ettevaatlikult tema juurde jõuda, üks jääb alla.', '{callsign}, try carefully to reach him, one of you stays below.'),
            { success: -0.1, risk: 0.12, time: -5 },
          ),
        ],
        'climb',
      ),
      agency('paaste', 2, [
        T('{callsign}: noormees on liiga järsul nõlval, vajame Päästeametit köisvarustusega.', '{callsign}: the young man is on too steep a slope, we need the Rescue Board with rope gear.'),
      ], { timeoutMin: 6 }),
      agency('kiirabi', 10, [
        T(
          '{callsign}: päästjad on noormehe juures, jalg võib olla murtud. Kiirabi mäe jalamile, palun.',
          '{callsign}: the rescuers have reached the young man, the leg may be broken. Ambulance to the foot of the hill, please.',
        ),
      ], { chance: 0.8, timeoutMin: 6 }),
      info(18, [
        T('{callsign}: paneme noorte andmed kirja ja helistame vanematele. Tsikkel on registreerimata.', '{callsign}: taking the teenagers’ details and calling their parents. The bike is unregistered.'),
      ]),
    ],
    outcomes: [
      out(
        'rescued',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Päästjad tõid noormehe köitega nõlvalt alla ja kiirabi viis ta jalavigastusega haiglasse. Vanemaid teavitati, registreerimata krossitsikliga sõitmise eest alustati väärteomenetlust.',
          'The rescuers brought the young man down the slope on a rope and the ambulance took him to hospital with a leg injury. The parents were informed and misdemeanour proceedings were opened for riding an unregistered bike.',
        ),
        { injuries: 1, radio: T('{callsign}: noormees alla toodud, kiirabi viis haiglasse.', '{callsign}: young man brought down, ambulance took him to hospital.') },
      ),
      out(
        'sprain',
        'resolved',
        [0.6, 1],
        2,
        T(
          'Noormehel oli ainult nikastatud pahkluu ja marrastused. Päästjad aitasid ta alla, vanemad tulid talle järele ja viisid ta ise traumapunkti.',
          'The young man had only a sprained ankle and grazes. The rescuers helped him down; his parents came for him and took him to A&E themselves.',
        ),
        { radio: T('{callsign}: nikastus, päästjad aitasid alla, vanemad võtsid üle.', '{callsign}: a sprain, rescuers helped him down, parents took over.') },
      ),
      out(
        'warned',
        'warning',
        [0.4, 0.9],
        2,
        T(
          'Kukkunud noormehe jalavigastus osutus kergeks. Noored saadeti mäelt ära ja neile tehti hoiatus, vanemaid ja mäe valdajat teavitati.',
          'The young man’s leg injury turned out to be minor. The teenagers were sent off the hill and warned, and their parents and the owner of the hill were informed.',
        ),
        { radio: T('{callsign}: vigastus kerge, noortele hoiatus, vanemad teavitatud.', '{callsign}: minor injury, kids warned, parents informed.') },
      ),
      out(
        'serious',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Noormees libises veel kümmekond meetrit allapoole ja lõi pea vastu kivi. Päästjad tõid ta alla ja kiirabi viis ta raskes seisundis haiglasse.',
          'The young man slipped another ten metres or so and hit his head on a stone. The rescuers brought him down and the ambulance took him to hospital in a serious condition.',
        ),
        { injuries: 1, radio: T('{callsign}: noormees libises allapoole, raskelt vigastatud, haiglasse.', '{callsign}: he slipped further, seriously injured, to hospital.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.45,
      toPriority: 1,
      text: T(
        'Teataja: sõber ei vasta enam hüüetele ja libises veel allapoole, me ei näe teda enam.',
        'Caller: our friend no longer answers when we shout and has slipped further down, we cannot see him any more.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.35,
    call: {
      mood: 'panic',
      opening: [
        T('Mu sõber kukkus tuhamäelt alla ja ei saa püsti! Ta on poolel nõlval ja karjub!', 'My friend fell down the ash hill and cannot get up! He is halfway down the slope and screaming!'),
        T('Ta sõitis krossitsikliga mäest üles ja kukkus, tsikkel veeres alla. Me ei pääse tema juurde!', 'He rode a motocross bike up the hill and crashed, the bike rolled down. We cannot get to him!'),
      ],
      answers: {
        injured: [T('Jalg on kuidagi viltu, ta ei saa sellele toetuda. Kiiver oli tal peas.', 'His leg is twisted somehow, he cannot put weight on it. He was wearing a helmet.')],
        count: [T('Meid on kolm, kõik siin all mäe jalamil.', 'There are three of us, all down here at the foot of the hill.')],
        when: [T('Kümme minutit tagasi, äkki veerand tundi.', 'Ten minutes ago, maybe a quarter of an hour.')],
        safe: [T('Me oleme all, aga nõlv vajub, ma ei julge üles minna.', 'We are at the bottom, but the slope keeps sliding, I do not dare go up.')],
        vehicle: [T('Tal on krossitsikkel, see veeres mäest alla. Numbrimärki sellel ei ole.', 'He has a motocross bike, it rolled down the hill. It has no number plate.')],
        intoxicated: [T('Ei, keegi meist ei joonud.', 'No, none of us had been drinking.')],
      },
      answersRu: {
        injured: ['Нога как-то вывернута, он не может на неё встать. Он был в шлеме.'],
        count: ['Нас трое, все тут внизу, у подножия.'],
        when: ['Минут десять назад, может, пятнадцать.'],
        safe: ['Мы внизу, но склон осыпается, я боюсь туда лезть.'],
        vehicle: ['У него кроссовый мотоцикл, он скатился с горы. Номера на нём нет.'],
        intoxicated: ['Нет, никто из нас не пил.'],
      },
      openingRu: [
        'Мой друг упал с горы и не может встать! Он на середине склона и кричит!',
        'Он поехал на кроссовом мотоцикле в гору и упал, мотоцикл скатился вниз. Мы не можем к нему подобраться!',
      ],
    },
    tags: ['youth'],
  },

  // 2. Metal thieves strip pipes in an empty Kreenholm mill building; the rotten floors may give way.
  {
    id: 'property_kreenholmi_metallivargad',
    category: 'property',
    code: 'VG',
    title: T('Metallivargad Kreenholmi tühjas vabrikuhoones', 'Metal thieves in an empty Kreenholm mill building'),
    priority: 2,
    weight: 1,
    hours: 'night',
    places: ['industrial'],
    placeTags: ['abandoned'],
    regions: ['ida'],
    units: { need: [u('patrol', 2)], ideal: [u('patrol', 2), u('k9')] },
    onScene: [40, 90],
    persons: [
      { role: 'suspect', gender: 'M', age: [22, 50], record: 0.6, wanted: 0.15, intoxicated: 0.2 },
      { role: 'suspect', gender: 'M', age: [18, 45], record: 0.5 },
      { role: 'caller', gender: 'M', age: [45, 70], relation: 'employee' },
    ],
    vehicles: [{ role: 'suspect', kind: 'van', driverRole: 'suspect', stolen: 0.15, noInsurance: 0.3 }],
    summary: [
      T(
        '{address}. Kreenholmi valvur kuuleb tühjast ketrusvabriku hoonest nurklihvija häält ja näeb akendes taskulampe. Aia taga seisab kustunud tuledega kaubik.',
        '{address}. The Kreenholm security guard hears an angle grinder in the empty spinning mill building and sees torches in the windows. A van with its lights off is parked outside the fence.',
      ),
      T(
        '{address}. Manufaktuuri mahajäetud korpuses lõigatakse öösel metalli, sees on vähemalt kaks meest. Hoone vahelaed on kohati sisse varisenud.',
        '{address}. Someone is cutting metal at night in an abandoned block of the manufactory; there are at least two men inside. The floors of the building have partly collapsed.',
      ),
      T(
        '{address}. Valvur märkas, et vana kudumisvabriku aknast tõstetakse välja vasktorusid ja radiaatoreid. Ise ta sisse ei lähe, hoone on varisemisohtlik.',
        '{address}. The guard noticed copper pipes and radiators being lifted out through a window of the old weaving mill. He will not go in himself; the building is in danger of collapse.',
      ),
    ],
    callerLines: [
      T('Olen siin valvur. Tühjas vabrikuhoones lõigatakse metalli, ma näen taskulampe.', 'I am the security guard here. Someone is cutting metal in the empty mill building, I can see torches.'),
      T('Aia taga seisab kaubik, tuled kustus. Nad tassivad torusid aknast välja.', 'There is a van behind the fence with its lights off. They are carrying pipes out through the window.'),
      T(
        'Ise ma sisse ei lähe, seal on laed sisse kukkunud. Kui midagi juhtub, ei leia neid sealt keegi üles.',
        'I am not going in myself, the floors have caved in there. If anything happens, nobody will ever find them in there.',
      ),
    ],
    callerLinesRu: [
      'Я здесь охранник. В пустом корпусе режут металл, я вижу фонарики.',
      'За забором стоит бус с выключенными фарами. Они вытаскивают трубы через окно.',
      'Сам я туда не пойду, там перекрытия обвалились. Если что-то случится, их там никто не найдёт.',
    ],
    details: [
      T(
        'Valvuri sõnul on hoone vahelaed mädanenud ja kohati sisse varisenud, raskete torude lõikamine võib lae alla tuua.',
        'The guard says the floors of the building are rotten and have partly collapsed; cutting out heavy pipes could bring a floor down.',
      ),
      T(
        'Manufaktuuri territooriumilt on viimasel kuul mitu korda varastatud malmradiaatoreid ja vaskkaablit.',
        'Cast-iron radiators and copper cable have been stolen from the manufactory site several times in the last month.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal. Hoones põlevad taskulambid ja lõigatakse metalli, kaubik seisab aia taga. Hoone on varisemisohtlik. Kas läheme sisse või sulgeme väljapääsud ja kutsume nad välja?',
            '{callsign}: on scene. Torches inside and metal being cut, the van is behind the fence. The building is in danger of collapse. Do we go in, or block the exits and call them out?',
          ),
        ],
        [
          opt(
            'contain',
            T('Sulgege väljapääsud, kutsuge välja', 'Block the exits, call them out'),
            T(
              '{callsign}, sisse ei lähe. Teine ekipaaž jääb kaubiku juurde, kutsuge mehed valjuhääldiga välja.',
              '{callsign}, nobody goes in. The second crew stays by the van, call the men out over the loudspeaker.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'enter',
            T('Minge sisse', 'Go in'),
            T('{callsign}, minge sisse, liikuge ainult mööda seinaääri.', '{callsign}, go in and keep to the walls.'),
            { success: -0.1, risk: 0.12, time: -5 },
          ),
        ],
        'enter',
      ),
      qv(3, [
        T(
          '{callsign}: aia taga on {car}, numbrimärk {plate}, kaubaruum on torusid täis. Kontrolli palun.',
          '{callsign}: behind the fence: {car}, plate {plate}, the cargo space full of pipes. Please run it.',
        ),
      ]),
      qp('suspect', 8, R_SUSPECT, 0.7),
      agency('paaste', 12, [
        T('{callsign}: hoones varises vahelagi, üks mees on rusude all kinni. Vajame kiiresti päästjaid!', '{callsign}: a floor has collapsed in the building and one man is trapped under the rubble. We need the rescuers fast!'),
      ], { chance: 0.3, timeoutMin: 5, fail: { success: -0.25, risk: 0.08, trust: -4, outcome: 'collapse_late' }, ok: { success: 0.05, outcome: 'collapse' } }),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Mõlemad mehed peeti hoone juures kinni. Kaubikust leiti lõigatud malmradiaatoreid ja vasktorusid, alustati kriminaalmenetlust KarS § 199 järgi. Valdajal paluti hoone avad sulgeda.',
          'Both men were detained at the building. Cut cast-iron radiators and copper pipes were found in the van; criminal proceedings were opened under KarS § 199. The owner was asked to seal the openings of the building.',
        ),
        { arrests: 2, radio: T('{callsign}: kaks metallivarast kinni, kaubik torusid täis.', '{callsign}: two metal thieves detained, van full of pipes.') },
      ),
      out(
        'one_ran',
        'arrest',
        [0.35, 0.85],
        2,
        T(
          'Üks mees peeti kinni kaubiku juures, teine põgenes läbi varemete jõe poole. Põgeneja isik tehti kindlaks kaubiku kaudu, kriminaalmenetlus jätkub.',
          'One man was detained by the van; the other fled through the ruins towards the river. The runaway was identified through the van and the criminal case continues.',
        ),
        { arrests: 1, radio: T('{callsign}: üks kinni, teine põgenes, isik on teada.', '{callsign}: one detained, the other fled, identity known.') },
      ),
      out(
        'collapse',
        'hospital',
        [0, 0.05],
        1,
        T(
          'Ühe varga all varises vahelagi ja ta kukkus korruse võrra alla. Päästjad tõid ta rusudest välja ja kiirabi viis ta haiglasse, mõlemad mehed peeti kahtlustatavana kinni.',
          'A floor gave way under one of the thieves and he fell a storey. The rescuers got him out of the rubble and the ambulance took him to hospital; both men were detained as suspects.',
        ),
        { injuries: 1, arrests: 2, radio: T('{callsign}: vahelagi varises, üks haiglasse, mõlemad kinni.', '{callsign}: floor collapsed, one to hospital, both detained.') },
      ),
      out(
        'collapse_late',
        'hospital',
        [0, 0.05],
        1,
        T(
          'Vahelagi varises ühe varga all ja ta jäi rusude alla. Päästjad jõudsid kohale hilinemisega ja mees viidi raskes seisundis haiglasse, kaaslane põgenes.',
          'A floor gave way under one of the thieves and he was trapped under the rubble. The rescuers arrived late and he was taken to hospital in a serious condition; his accomplice fled.',
        ),
        { injuries: 1, radio: T('{callsign}: mees rusude all, raskes seisundis haiglasse.', '{callsign}: man trapped under rubble, to hospital in a serious condition.') },
      ),
      out(
        'gone',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Lõikajad põgenesid läbi varemete jõe poole. Kaubiku juures tabatud juht väidab, et ootas sõpra ega tea midagi; kaubik ja lõigatud torud võeti hoiule, kriminaalmenetlus jätkub.',
          'The men cutting the pipes fled through the ruins towards the river. The driver found by the van claims he was waiting for a friend and knows nothing; the van and the cut pipes were seized and the criminal case continues.',
        ),
        { radio: T('{callsign}: lõikajad põgenesid varemetes, kaubik hoiule võetud.', '{callsign}: the men cutting fled through the ruins, van seized.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.4,
      toPriority: 1,
      text: T(
        'Valvur: hoonest kostis mürin, osa vahelaest varises alla. Mehed on ikka sees ja lõikavad edasi.',
        'Guard: there was a rumble in the building and part of a floor came down. The men are still inside and still cutting.',
      ),
    },
    expiresMin: 75,
    interactiveChance: 0.3,
    call: {
      mood: 'whisper',
      opening: [
        T('Olen siin valvur. Vana vabrikuhoone sees lõigatakse metalli, ma näen taskulampe.', 'I am the security guard here. Someone is cutting metal inside the old mill building, I can see torches.'),
        T(
          'Aia taga seisab kaubik ilma tuledeta ja aknast tõstetakse välja torusid. Palun saatke kedagi.',
          'There is a van with no lights behind the fence and pipes are being passed out of a window. Please send someone.',
        ),
      ],
      answers: {
        count: [T('Vähemalt kaks, äkki kolm.', 'At least two, maybe three.')],
        weapons: [T('Relva ma ei näinud, neil on nurklihvija ja kangid.', 'I did not see a weapon, they have an angle grinder and crowbars.')],
        vehicle: [T('Aia taga seisab {car}, number {plate}.', 'The van behind the fence: {car}, number {plate}.')],
        safe: [T('Olen valvuriputkas, uks on lukus.', 'I am in the guard hut with the door locked.')],
        direction: [T('Nad on veel hoones, kaubik seisab aia taga.', 'They are still in the building, the van is behind the fence.')],
        intoxicated: [T('Ei tea, ma näen ainult nende taskulampe.', 'I do not know, I can only see their torches.')],
      },
      answersRu: {
        count: ['Минимум двое, может, трое.'],
        weapons: ['Оружия я не видел, у них болгарка и ломы.'],
        vehicle: ['За забором стоит {car}, номер {plate}.'],
        safe: ['Я в будке охраны, дверь заперта.'],
        direction: ['Они ещё в здании, бус стоит за забором.'],
        intoxicated: ['Не знаю, я вижу только их фонарики.'],
      },
      openingRu: [
        'Я тут охранником работаю. В старом корпусе режут металл, вижу фонарики.',
        'За забором стоит бус с выключенными фарами, из окна вытаскивают трубы. Пришлите кого-нибудь, пожалуйста.',
      ],
    },
    tags: ['metal_theft'],
  },

  // 3. A row over places in the queue of foot passengers outside the Narva-1 checkpoint.
  {
    id: 'public_order_piiriuletuse_jarjekorra_tuli',
    category: 'public_order',
    code: 'AK',
    title: T('Tüli piiriületuse järjekorras', 'Row in the border crossing queue'),
    priority: 3,
    weight: 1.4,
    hours: [0.1, 0.1, 0.1, 0.2, 0.5, 1.2, 2, 2, 1.8, 1.5, 1.3, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1, 0.6, 0.3, 0.1, 0.1, 0.1, 0.1],
    places: ['border'],
    placeTags: ['borderqueue'],
    regions: ['ida'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('border')] },
    onScene: [20, 50],
    persons: [
      { role: 'suspect', gender: 'M', age: [30, 60], intoxicated: 0.3, record: 0.3 },
      { role: 'victim', gender: 'F', age: [62, 85] },
      { role: 'caller', gender: 'any', age: [30, 75] },
    ],
    summary: [
      T(
        '{place}, {address}. Piiripunkti ees on pikk jalakäijate järjekord. Üks mees laseb oma tuttavaid ette ja väidetavalt võtab selle eest raha, ootajad on vihased ja käib sõimlemine.',
        '{place}, {address}. A long queue of foot passengers outside the border checkpoint. One man is letting his acquaintances in ahead and allegedly taking money for it; the people waiting are angry and there is a shouting match.',
      ),
      T(
        '{place}, {address}. Piiriületust ootavate inimeste järjekorras lükati eakas naine trügimise käigus pikali. Ümber on kogunenud vihane rahvahulk, üks mees ähvardab teisi.',
        '{place}, {address}. An elderly woman was pushed over in the queue for the border crossing during a scramble for places. An angry crowd has gathered and one man is threatening the others.',
      ),
      T(
        '{place}, {address}. Piiripunkti ees tülitsetakse järjekorra pärast: mitu meest trügib kohvrite ja kärudega ette, tekkinud on tõuklemine ja üks vanem naine kukkus.',
        '{place}, {address}. A row over the queue outside the checkpoint: several men are pushing ahead with suitcases and trolleys, there is shoving and an older woman has fallen.',
      ),
    ],
    callerLines: [
      T(
        'Me oleme siin hommikust saati seisnud ja nüüd laseb üks mees oma tuttavaid ette. Ta võtab selle eest veel raha ka!',
        'We have been standing here since the morning and now one man is letting his acquaintances in ahead. And he is taking money for it!',
      ),
      T('Üks vana naine lükati pikali, ta istub kohvri peal ja põlv veritseb.', 'An old woman was pushed over, she is sitting on her suitcase and her knee is bleeding.'),
      T('Inimesed on närvis, mehed karjuvad üksteise peale. Kohe läheb kakluseks.', 'People are on edge, the men are shouting at each other. It is about to turn into a fight.'),
    ],
    callerLinesRu: [
      'Мы тут с утра стоим, а теперь один мужик пропускает своих знакомых вперёд. И ещё деньги за это берёт!',
      'Одну бабушку толкнули, она упала, сидит на чемодане, колено в крови.',
      'Люди на нервах, мужики орут друг на друга. Сейчас до драки дойдёт.',
    ],
    details: [
      T(
        'Teataja sõnul on järjekorras mitu joobes meest, kes on omavahel juba rinnutsi läinud.',
        'The caller says there are several drunk men in the queue who have already squared up to each other.',
      ),
      T('Piiri ületamist oodatakse tunde, paljud ootajad on eakad ja raske pagasiga.', 'People wait for hours to cross; many of those waiting are elderly and carry heavy luggage.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.35, reason: T('Eakas naine kukkus järjekorras, põlv veritseb', 'An elderly woman fell in the queue, her knee is bleeding') }],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal. Järjekorras on paarsada inimest, ühe mehe ümber on karjuv seltskond. Eakas naine istub kohvri peal.',
          '{callsign}: on scene. A couple of hundred people in the queue, a shouting group round one man. An elderly woman is sitting on a suitcase.',
        ),
      ]),
      choice(
        3,
        [
          T(
            '{callsign}: mees väidab, et hoidis kohti sugulastele. Ootajad nõuavad, et ta järjekorrast välja viidaks. Kuidas toimime?',
            '{callsign}: the man says he was keeping places for relatives. The people waiting demand that he be taken out of the queue. How do we proceed?',
          ),
        ],
        [
          opt(
            'aside',
            T('Viige ta kõrvale, võtke seletused', 'Take him aside, take statements'),
            T(
              '{callsign}, viige mees järjekorrast kõrvale, tuvastage ja võtke seletused. Tema tuttavad lähevad järjekorra lõppu.',
              '{callsign}, take the man out of the queue, identify him and take statements. His acquaintances go to the back of the queue.',
            ),
            { success: 0.15, time: 10, trust: 1 },
          ),
          opt(
            'leave',
            T('Las jääb, rahustage rahvast', 'Let him stay, calm the crowd'),
            T('{callsign}, ärge seda suuremaks ajage, rahustage rahvast ja jälgige.', '{callsign}, do not escalate it, calm people down and keep watch.'),
            { success: -0.1, trust: -2, outcome: 'stayed' },
          ),
        ],
        'leave',
      ),
      qp('suspect', 6, R_SUSPECT, 0.7),
      agency('kiirabi', 8, [
        T('{callsign}: eakal naisel on põlv lahti ja ta ei saa kõndida. Palun kiirabi piiripunkti ette.', '{callsign}: the elderly woman has a cut knee and cannot walk. Ambulance to the checkpoint, please.'),
      ], { chance: 0.4, timeoutMin: 6 }),
    ],
    outcomes: [
      out(
        'sorted',
        'warning',
        [0.45, 1],
        4,
        T(
          'Kohtade hoidja viidi järjekorrast kõrvale ja talle tehti hoiatus, tema tuttavad läksid järjekorra lõppu. Ootajad rahunesid, eaka naise põlv seoti kohapeal kinni.',
          'The man keeping places was taken out of the queue and warned, and his acquaintances went to the back. The crowd calmed down and the elderly woman’s knee was bandaged on the spot.',
        ),
        { radio: T('{callsign}: trügijad järjekorra lõppu, hoiatus tehtud, lõpetame.', '{callsign}: queue-jumpers to the back, warning given, closing.') },
      ),
      out(
        'fine',
        'fine',
        [0.55, 1],
        2,
        T(
          'Mehe suhtes alustati väärteomenetlust avaliku korra rikkumise eest KarS § 262 järgi. Kohtade müümine raha eest pandi kirja tunnistajate seletustes.',
          'Misdemeanour proceedings were opened against the man for a breach of public order under KarS § 262. The selling of places in the queue was recorded in witness statements.',
        ),
        { radio: T('{callsign}: mehele väärteomenetlus, järjekord rahunes.', '{callsign}: misdemeanour case for the man, queue calm.') },
      ),
      out(
        'pushed',
        'report',
        [0.35, 0.8],
        2,
        T(
          'Selgus, et mees oli eakat naist trügides tõuganud ja naine kukkus. Alustati kriminaalmenetlust KarS § 121 järgi, kannatanu vaadati üle kiirabis.',
          'It turned out the man had shoved the elderly woman while pushing ahead and she fell. Criminal proceedings were opened under KarS § 121 and the woman was checked over by the ambulance crew.',
        ),
        { injuries: 1, radio: T('{callsign}: mees tõukas eakat naist, menetlus alustatud.', '{callsign}: the man shoved the elderly woman, case opened.') },
      ),
      out(
        'stayed',
        'warning',
        [0, 0.05],
        1,
        T(
          'Mees jäi järjekorda ja ootajad rahunesid politsei juuresolekul. Kohtade müümist ei fikseeritud ja tund hiljem tuli samast järjekorrast uus kaebus.',
          'The man stayed in the queue and the crowd calmed down while the police were there. The selling of places was not recorded, and an hour later another complaint came from the same queue.',
        ),
        { radio: T('{callsign}: rahvas rahunes, mees jäi järjekorda, lõpetame.', '{callsign}: crowd calm, the man stays in the queue, closing.') },
      ),
      out(
        'brawl',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Järjekorras läks kakluseks, üks mees sai peavigastuse ja viidi haiglasse. Kaklejad tuvastati, alustati kriminaalmenetlust.',
          'It turned into a fight in the queue; one man suffered a head injury and was taken to hospital. The men who fought were identified and criminal proceedings were opened.',
        ),
        { injuries: 1, radio: T('{callsign}: kaklus järjekorras, üks peavigastusega haiglasse.', '{callsign}: fight in the queue, one with a head injury to hospital.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.45,
      toPriority: 2,
      text: T(
        'Teataja: järjekorras läks kakluseks, mitu meest on teineteisel kallal ja inimesed trügivad eemale.',
        'Caller: it has turned into a fight in the queue, several men are going at each other and people are pushing to get away.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.3,
    call: {
      mood: 'angry',
      opening: [
        T('Siin piiri järjekorras on tüli! Üks mees laseb oma tuttavaid ette ja võtab selle eest raha!', 'There is a row here in the border queue! One man is letting his acquaintances in ahead and taking money for it!'),
        T(
          'Me oleme siin hommikust saati seisnud ja nüüd trügib terve kamp ette. Üks vana naine lükati pikali!',
          'We have been standing here since the morning and now a whole gang is pushing ahead. An old woman was knocked over!',
        ),
      ],
      answers: {
        count: [T('Järjekorras on paarsada inimest, tülitsejaid on viis-kuus.', 'There are a couple of hundred people in the queue, five or six of them are rowing.')],
        injured: [T('Vana naine kukkus, põlv veritseb, ta istub kohvri peal.', 'The old woman fell, her knee is bleeding, she is sitting on a suitcase.')],
        intoxicated: [T('Tundub, et ta on joonud, haiseb viina järele.', 'He seems to have been drinking, he smells of vodka.')],
        children: [T('Järjekorras on ka lapsi, emad hoiavad neid eemal.', 'There are children in the queue too, their mothers are keeping them back.')],
      },
      answersRu: {
        count: ['В очереди человек двести, скандалят человек пять-шесть.'],
        injured: ['Бабушка упала, колено в крови, сидит на чемодане.'],
        intoxicated: ['Похоже, он выпивший, перегаром несёт.'],
        children: ['В очереди и дети есть, мамы держат их в стороне.'],
      },
      openingRu: [
        'Тут в очереди на границу скандал! Один мужик пропускает своих знакомых вперёд и берёт за это деньги!',
        'Мы тут с утра стоим, а теперь целая компания лезет без очереди. Бабушку толкнули, она упала!',
      ],
    },
    tags: ['queue'],
  },

  // 4. May at the war graves of Siivertsi cemetery in Narva: a drunk man with prohibited symbols draws a crowd.
  {
    id: 'public_order_siivertsi_keelatud_sumboolika',
    category: 'public_order',
    code: 'AK',
    title: T('Keelatud sümboolika sõjahaudade juures', 'Prohibited symbols at the war graves'),
    priority: 3,
    weight: 0.3,
    months: [5],
    hours: 'day',
    places: ['cemetery'],
    placeTags: ['memorial'],
    regions: ['ida'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('community')] },
    onScene: [25, 60],
    persons: [
      { role: 'suspect', gender: 'M', age: [40, 75], intoxicated: 0.6, record: 0.3 },
      { role: 'caller', gender: 'F', age: [55, 85] },
    ],
    summary: [
      T(
        '{address}. Kalmistul sõjahaudade juures on inimesi lilli panemas. Joobes mees lipu ja keelatud sümboolikaga karjub loosungeid ja sõimab teisi, tema ümber koguneb rahvast.',
        '{address}. People are laying flowers at the war graves in the cemetery. A drunk man with a flag and prohibited symbols is shouting slogans and abusing others, and a crowd is gathering round him.',
      ),
      T(
        '{address}. Mälestuspaiga juures seisab mees, rinnas keelatud sümboolikaga lint. Teataja sõnul provotseerib ta inimesi ja mitu inimest filmib teda telefoniga.',
        '{address}. A man is standing at the memorial with a ribbon bearing prohibited symbols on his chest. The caller says he is provoking people and several of them are filming him on their phones.',
      ),
    ],
    callerLines: [
      T(
        'Me tulime lilli panema ja siin on üks mees lipuga, karjub ja sõimab inimesi. Ma ei taha mingit jama, aga nii ei saa.',
        'We came to lay flowers and there is a man here with a flag, shouting and swearing at people. I do not want any trouble, but this is not right.',
      ),
      T('Tal on rinnas Georgi lint ja ta karjub loosungeid. Noored filmivad teda ja naeravad.', 'He has a St George ribbon on his chest and is shouting slogans. Young people are filming him and laughing.'),
      T(
        'Inimesi tuleb aina juurde, mõned on tema poolt ja mõned vastu. Ma kardan, et läheb tüliks.',
        'More and more people are coming, some are on his side and some against. I am afraid it will turn into a row.',
      ),
    ],
    callerLinesRu: [
      'Мы пришли цветы положить, а тут мужчина с флагом, кричит, людей оскорбляет. Я не хочу никаких проблем, но так нельзя.',
      'У него на груди георгиевская ленточка, и он выкрикивает лозунги. Молодёжь его снимает и смеётся.',
      'Людей всё больше, кто-то за него, кто-то против. Я боюсь, что начнётся ссора.',
    ],
    details: [
      T(
        'Teataja sõnul on mehe ümber kümmekond inimest, osa toetab teda ja osa nõuab, et ta lahkuks.',
        'The caller says there are about ten people round the man; some support him and some want him to leave.',
      ),
      T(
        'Agressiooni toetava sümboolika avalik kasutamine on keelatud, mälestamine ja lillede asetamine on lubatud.',
        'Public use of symbols supporting aggression is prohibited; remembrance and laying flowers are allowed.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal. Sõjahaudade juures on palju inimesi, mehe ümber on kogunenud rahvas. Mees lipu ja lindiga seisab keskel ja karjub.',
          '{callsign}: on scene. Lots of people at the war graves and a crowd has gathered round the man. The man with the flag and the ribbon is in the middle, shouting.',
        ),
      ]),
      choice(
        3,
        [
          T(
            '{callsign}: mees on joobes ja keeldub lindist loobumast. Ümberringi filmitakse. Kuidas toimime?',
            '{callsign}: the man is drunk and refuses to give up the ribbon. People around are filming. How do we proceed?',
          ),
        ],
        [
          opt(
            'talk',
            T('Rahulikult: selgitage, paluge eemaldada', 'Calmly: explain, ask him to remove it'),
            T(
              '{callsign}, rääkige temaga rahulikult vene keeles, paluge sümboolika eemaldada ja viige ta rahva keskelt kõrvale. Kehakaamerad tööle.',
              '{callsign}, talk to him calmly in Russian, ask him to remove the symbols and take him aside from the crowd. Body cameras on.',
            ),
            { success: 0.15, time: 10, trust: 2 },
          ),
          opt(
            'grab',
            T('Pidage kohe kinni', 'Detain him at once'),
            T('{callsign}, pidage mees kohe kinni ja viige autosse.', '{callsign}, detain the man at once and put him in the car.'),
            { success: -0.05, risk: 0.06, trust: -2, outcome: 'sober_up' },
          ),
          opt(
            'ignore',
            T('Ärge sekkuge, jälgige', 'Do not intervene, observe'),
            T('{callsign}, kalmistul ärge sekkuge, jälgige olukorda eemalt.', '{callsign}, it is a cemetery, do not intervene, watch from a distance.'),
            { success: -0.15, trust: -3, outcome: 'scuffle' },
          ),
        ],
        'grab',
      ),
      qp('suspect', 6, R_SUSPECT, 0.8),
      backup(
        u('patrol'),
        8,
        [T('{callsign}: rahvast tuleb juurde ja kaks meest tõukavad teineteist. Vajame teist ekipaaži.', '{callsign}: more people are arriving and two men are shoving each other. We need a second crew.')],
        { chance: 0.3, timeoutMin: 6, fail: { success: -0.2, trust: -3, outcome: 'scuffle' } },
      ),
    ],
    outcomes: [
      out(
        'removed',
        'fine',
        [0.5, 1],
        4,
        T(
          'Mees eemaldas lindi ja keeras lipu kokku. Tema suhtes alustati väärteomenetlust agressiooni toetava sümboli avaliku kasutamise eest, mälestajad jätkasid rahulikult.',
          'The man removed the ribbon and rolled up the flag. Misdemeanour proceedings were opened against him for public use of a symbol supporting aggression, and the people at the graves carried on quietly.',
        ),
        { radio: T('{callsign}: sümboolika eemaldatud, väärteomenetlus, rahvas rahulik.', '{callsign}: symbols removed, misdemeanour case opened, crowd calm.') },
      ),
      out(
        'left',
        'warning',
        [0.4, 1],
        2,
        T(
          'Pärast rahulikku selgitamist võttis mees lindi ära ja lahkus koos sugulastega. Talle tehti hoiatus, rahvas läks rahulikult laiali.',
          'After a calm explanation the man took the ribbon off and left with his relatives. He was warned and the crowd dispersed quietly.',
        ),
        { radio: T('{callsign}: lint ära, mees lahkus, hoiatus tehtud.', '{callsign}: ribbon off, the man left, warning given.') },
      ),
      out(
        'sober_up',
        'arrest',
        [0.45, 0.9],
        2,
        T(
          'Mees keeldus sümboolikast loobumast ja hakkas ametnikke sõimama. Ta toimetati kainenema ning tema suhtes alustati väärteomenetlust.',
          'The man refused to give up the symbols and started swearing at the officers. He was taken to sober up and misdemeanour proceedings were opened.',
        ),
        { arrests: 1, radio: T('{callsign}: mees viidi kainenema, väärteomenetlus alustatud.', '{callsign}: man taken to sober up, misdemeanour case opened.') },
      ),
      out(
        'scuffle',
        'report',
        [0, 0.45],
        2,
        T(
          'Mehe ümber kogunenud rahvas läks omavahel tülli ja kaks meest tõukasid teineteist. Pooled lahutati ja tuvastati, juhtumi video levib sotsiaalmeedias.',
          'The crowd round the man fell out among themselves and two men shoved each other. They were separated and identified; a video of the incident is spreading on social media.',
        ),
        { trust: -2, radio: T('{callsign}: tõuklemine rahva seas, pooled lahutatud ja tuvastatud.', '{callsign}: shoving in the crowd, parties separated and identified.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.4,
      toPriority: 2,
      text: T(
        'Teataja: mehe ümber on juba mitukümmend inimest, karjutakse ja kaks meest kisuvad teineteist.',
        'Caller: there are dozens of people round the man now, shouting, and two men are grabbing at each other.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.3,
    call: {
      mood: 'elderly',
      opening: [
        T(
          'Me tulime lilli panema ja siin on üks purjus mees lipuga, karjub ja sõimab inimesi. Palun saatke keegi.',
          'We came to lay flowers and there is a drunk man here with a flag, shouting and swearing at people. Please send someone.',
        ),
        T('Tal on rinnas Georgi lint ja ta karjub loosungeid. Tema ümber hakkab rahvast kogunema.', 'He has a St George ribbon on his chest and is shouting slogans. A crowd is starting to gather round him.'),
      ],
      answers: {
        count: [T('Tema ümber on kümmekond inimest, mõned filmivad telefoniga.', 'There are about ten people round him, some are filming on their phones.')],
        intoxicated: [T('Ta on purjus, kõigub ja taskus on pudel.', 'He is drunk, swaying, and there is a bottle in his pocket.')],
        weapons: [T('Relva pole, ainult lipuvarras.', 'No weapon, just the flagpole.')],
        safe: [T('Ma seisan eemal, värava juures.', 'I am standing away from it, by the gate.')],
      },
      answersRu: {
        count: ['Вокруг него человек десять, некоторые снимают на телефон.'],
        intoxicated: ['Он пьяный, шатается, в кармане бутылка.'],
        weapons: ['Оружия нет, только древко от флага.'],
        safe: ['Я стою в стороне, у ворот.'],
      },
      openingRu: [
        'Мы пришли цветы положить, а тут пьяный мужчина с флагом, кричит, людей оскорбляет. Пришлите, пожалуйста, кого-нибудь.',
        'У него на груди георгиевская ленточка, и он выкрикивает лозунги. Вокруг него начинают собираться люди.',
      ],
    },
    tags: ['public_order_watch'],
  },

  // 5. A swimmer caught by the outflow where the Narva river meets the sea, drifting towards the border line.
  {
    id: 'missing_narva_joesuu_vool_viis_ujuja',
    category: 'missing',
    code: 'VEE',
    title: T('Vool viib ujuja jõesuust merele', 'Current carries a swimmer out of the river mouth'),
    priority: 1,
    weight: 1,
    months: [6, 7, 8],
    hours: 'day',
    weekendBoost: 1.3,
    places: ['beach'],
    placeTags: ['rivermouth'],
    regions: ['ida'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('border'), u('boat')] },
    onScene: [30, 80],
    persons: [
      { role: 'missing', gender: 'M', age: [16, 55] },
      { role: 'caller', gender: 'any', age: [16, 65], relation: 'friend' },
    ],
    agencies: [
      { agency: 'merepaaste', chance: 1, reason: T('Mereotsing jõesuus, JRCC koordineerib', 'Sea search at the river mouth, coordinated by JRCC') },
      { agency: 'paaste', chance: 1, reason: T('Veepääste ja tuukrid', 'Water rescue and divers') },
      { agency: 'kiirabi', chance: 0.8, reason: T('Uppumisoht, elustamise valmidus', 'Drowning risk, ready to resuscitate') },
    ],
    summary: [
      T(
        '{place}, {address}. Jõesuu muuli lähedal ujunud mehe haaras jõe väljavool ja kannab teda merele. Mees on kaldast juba üle saja meetri kaugusel, rannavalve on teel.',
        '{place}, {address}. A man swimming near the pier at the river mouth has been caught by the outflow and is being carried out to sea. He is already over a hundred metres from the shore; the lifeguards are on their way.',
      ),
      T(
        '{place}, {address}. Kaks sõpra läksid ujuma jõesuu lähedale, üks jõudis kaldale, teist viib vool merele ja jõe keskjoone poole. Ta lehvitab ja kaob aeg-ajalt lainetesse.',
        '{place}, {address}. Two friends went swimming near the river mouth; one made it back, the other is being carried out to sea and towards the middle of the river. He is waving and keeps disappearing in the waves.',
      ),
      T(
        '{place}, {address}. Rannas puhkajate teatel ujus mees jõesuu suunas ja jäi voolu kätte. Ta on väsinud ja hüüab appi, punane lipp oli väljas.',
        '{place}, {address}. People on the beach report that a man swam towards the river mouth and got caught in the current. He is tiring and shouting for help; the red flag was up.',
      ),
    ],
    callerLines: [
      T('Ta ujus muuli juures ja vool haaras ta kaasa! Ta on juba nii kaugel, ma näen ainult pead!', 'He was swimming by the pier and the current took him! He is so far out already, I can only see his head!'),
      T('Ta karjub appi ja lehvitab, aga vool viib teda ikka kaugemale.', 'He is shouting for help and waving, but the current keeps taking him further out.'),
      T('Punane lipp oli küll väljas, aga ta ütles, et ujub ainult natuke.', 'The red flag was up, but he said he would only swim for a bit.'),
    ],
    callerLinesRu: [
      'Он плавал у мола, и его подхватило течением! Он уже так далеко, я вижу только голову!',
      'Он зовёт на помощь и машет, а течение уносит его всё дальше.',
      'Красный флаг висел, но он сказал, что только чуть-чуть поплавает.',
    ],
    details: [
      T(
        'Narva jõe suudmes on tugev väljavool, ujujat kannab merele ja keskjoone poole, kus kulgeb riigipiir. Piirivalvet on teavitatud.',
        'There is a strong outflow at the mouth of the Narva river; the swimmer is being carried out to sea and towards the middle line, where the state border runs. The border guard has been informed.',
      ),
      T('Rannavalve on kummipaadiga välja minemas, tuul puhub kaldast merele.', 'The lifeguards are about to launch their inflatable; the wind is blowing offshore.'),
    ],
    beats: [
      agency('merepaaste', 'arrive', [
        T(
          '{callsign}: kohal rannas. Ujuja on jõesuust paarisaja meetri kaugusel ja triivib merele. Kinnitage merepäästjate ja paadi tulek!',
          '{callsign}: on the beach. The swimmer is a couple of hundred metres off the river mouth and drifting out to sea. Confirm sea rescue and a boat are coming!',
        ),
      ], { timeoutMin: 4 }),
      choice(
        2,
        [
          T(
            '{callsign}: rannavalve tahab kohe paadiga välja minna, aga ujuja on jõe keskjoone lähedal. Kas lähevad kohe või ootame piirivalvet?',
            '{callsign}: the lifeguards want to go out in their boat now, but the swimmer is close to the middle of the river. Do they go now, or do we wait for the border guard?',
          ),
        ],
        [
          opt(
            'go',
            T('Paat kohe välja, piirivalve teavitab teist poolt', 'Boat out now, border guard informs the other side'),
            T(
              '{callsign}, rannavalve läheb kohe. Piirivalve annab teise poole piirivalvele teada, et käib päästmine.',
              '{callsign}, the lifeguards go now. The border guard will tell the other side’s border guard that a rescue is under way.',
            ),
            { success: 0.2, time: 5 },
          ),
          opt(
            'wait',
            T('Oodake piirivalve kaatrit', 'Wait for the border guard boat'),
            T('{callsign}, keskjoone lähedale ärge minge, oodake piirivalve kaatrit.', '{callsign}, do not go near the middle of the river, wait for the border guard boat.'),
            { success: -0.15, time: 10 },
          ),
        ],
        'wait',
        { timeoutMin: 3 },
      ),
      agency('kiirabi', 10, [
        T('{callsign}: kiirabi peab olema rannas valmis, ujuja võib vajada elustamist.', '{callsign}: we need the ambulance ready on the beach, the swimmer may need resuscitation.'),
      ], { chance: 0.8, timeoutMin: 5 }),
      info(20, [T('{callsign}: tunnistajate andmed kirjas, ujuja riided ja telefon kaldalt kogutud.', '{callsign}: witness details taken, the swimmer’s clothes and phone collected from the beach.')], 0.6),
    ],
    outcomes: [
      out(
        'rescued',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Paat jõudis ujujani enne jõe keskjoont ja tõi ta kaldale. Kiirabi vaatas ta üle, mees oli kurnatud, kuid terve.',
          'The boat reached the swimmer before the middle of the river and brought him ashore. The ambulance crew checked him over; he was exhausted but unhurt.',
        ),
        { radio: T('{callsign}: ujuja kaldal, kurnatud, aga terve.', '{callsign}: swimmer ashore, exhausted but unhurt.') },
      ),
      out(
        'hypothermia',
        'hospital',
        [0.35, 0.85],
        2,
        T(
          'Ujuja tõmmati veest välja teadvusel, kuid ta oli vett neelanud ja alajahtunud. Kiirabi viis ta haiglasse.',
          'The swimmer was pulled out of the water conscious, but he had swallowed water and was hypothermic. The ambulance took him to hospital.',
        ),
        { injuries: 1, radio: T('{callsign}: ujuja veest väljas, alajahtunud, kiirabi viis haiglasse.', '{callsign}: swimmer out of the water, hypothermic, ambulance took him to hospital.') },
      ),
      out(
        'other_side',
        'report',
        [0.15, 0.5],
        1,
        T(
          'Vool kandis ujuja üle keskjoone ja ta ronis kaldale teisel pool piiri, kus teda hoiab kinni teise poole piirivalve. Tema tagasitoomist korraldatakse piirivolinike kaudu.',
          'The current carried the swimmer across the middle line and he climbed ashore on the other side of the border, where the other side’s border guard is holding him. His return is being arranged through the border commissioners.',
        ),
        { radio: T('{callsign}: ujuja jõudis teisele kaldale, teine pool hoiab kinni.', '{callsign}: swimmer reached the far bank, the other side is holding him.') },
      ),
      out(
        'drowned',
        'tragedy',
        [0, 0.2],
        2,
        T(
          'Ujuja kadus lainetesse enne, kui paat temani jõudis. Tuukrid leidsid ta hiljem jõesuust, elustamine ei õnnestunud. Lähedastele osutati kriisiabi.',
          'The swimmer disappeared in the waves before the boat reached him. Divers later recovered him from the river mouth and he could not be resuscitated. The family was given crisis support.',
        ),
        { injuries: 1, radio: T('{callsign}: ujujat ei õnnestunud päästa, lähedastele kriisiabi.', '{callsign}: the swimmer could not be saved, crisis support for the family.') },
      ),
    ],
    expiresMin: 45,
    interactiveChance: 0.4,
    call: {
      mood: 'panic',
      opening: [
        T('Mu sõber ujus muuli juures ja vool viib ta merele! Ta on juba väga kaugel!', 'My friend was swimming by the pier and the current is taking him out to sea! He is already very far out!'),
        T('Appi, inimene upub jõesuus! Vool on nii tugev, ta ei saa kaldale!', 'Help, someone is drowning at the river mouth! The current is so strong, he cannot get back to shore!'),
      ],
      answers: {
        where: [T('Me oleme rannas jõesuu juures, muuli kõrval.', 'We are on the beach by the river mouth, next to the pier.')],
        when: [T('Paar minutit tagasi, ta oli alles kalda lähedal.', 'A couple of minutes ago, he was still close to the shore.')],
        intoxicated: [T('Ei, ta on kaine, me tulime alles randa.', 'No, he is sober, we only just got to the beach.')],
        count: [T('Vees on üks inimene, minu sõber.', 'One person in the water, my friend.')],
        injured: [T('Ta ei ole vigastatud, aga ta väsib ja vajub aeg-ajalt vee alla.', 'He is not hurt, but he is tiring and keeps going under.')],
        suspect: [T('Ta on vees, ma näen ainult tema pead ja aeg-ajalt kätt.', 'He is in the water, I can only see his head and now and then an arm.')],
        direction: [T('Vool viib teda merele ja jõe keskkoha poole.', 'The current is taking him out to sea and towards the middle of the river.')],
      },
      answersRu: {
        where: ['Мы на пляже у устья, рядом с молом.'],
        when: ['Пару минут назад, он ещё был у берега.'],
        intoxicated: ['Нет, он трезвый, мы только пришли на пляж.'],
        count: ['В воде один человек, мой друг.'],
        injured: ['Он не ранен, но устаёт и иногда уходит под воду.'],
        suspect: ['Он в воде, я вижу только голову и иногда руку.'],
        direction: ['Течение уносит его в море и к середине реки.'],
      },
      openingRu: [
        'Мой друг плавал у мола, и его уносит течением в море! Он уже очень далеко!',
        'Помогите, в устье тонет человек! Течение такое сильное, он не может выплыть к берегу!',
      ],
    },
    tags: ['drowning', 'water'],
  },

  // 6. A man in the Narva river below the promenade on a summer night, the current taking him towards the border line.
  {
    id: 'assist_narva_promenaadilt_jokke',
    category: 'assist',
    code: 'VEE',
    title: T('Mees kukkus promenaadilt Narva jõkke', 'Man fell from the promenade into the Narva river'),
    priority: 1,
    weight: 0.5,
    months: [5, 6, 7, 8, 9],
    hours: 'nightlife',
    weekendBoost: 1.6,
    places: ['park'],
    placeTags: ['riverside'],
    regions: ['ida'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('border')] },
    onScene: [30, 70],
    persons: [
      { role: 'victim', gender: 'M', age: [18, 50], intoxicated: 0.8 },
      { role: 'caller', gender: 'any', age: [18, 60] },
    ],
    agencies: [
      { agency: 'paaste', chance: 1, reason: T('Veepääste: inimene jões', 'Water rescue: a person in the river') },
      { agency: 'kiirabi', chance: 0.8, reason: T('Alajahtumine ja uppumisoht', 'Hypothermia and risk of drowning') },
    ],
    summary: [
      T(
        '{address}. Möödujate teatel kukkus joobes mees promenaadilt jõkke. Vool kannab teda allavoolu, mees hoiab end veel pinnal.',
        '{address}. Passers-by report that a drunk man fell from the promenade into the river. The current is carrying him downstream; he is still keeping afloat.',
      ),
      T(
        '{address}. Mees hüppas sõprade õhutusel promenaadilt Narva jõkke ega jõua tagasi kaldale. Sõbrad jooksevad kallast mööda kaasa.',
        '{address}. A man jumped from the promenade into the Narva river on a dare and cannot get back to the bank. His friends are running along the bank beside him.',
      ),
      T(
        '{address}. Teataja kuulis promenaadilt appihüüdeid ja nägi jões inimest, keda vool kannab jõe keskosa poole.',
        '{address}. The caller heard cries for help from the promenade and saw someone in the river being carried towards the middle.',
      ),
    ],
    callerLines: [
      T('Üks mees kukkus promenaadilt vette! Ta ujub, aga vool viib teda eemale!', 'A man fell off the promenade into the water! He is swimming, but the current is taking him away!'),
      T('Ma viskasin päästerõnga, aga see ei ulatunud. Ta on juba peaaegu keskel!', 'I threw the lifebuoy but it did not reach. He is almost in the middle already!'),
      T('Ta hüüab midagi, ma ei saa aru. Vesi on külm ja vool on nii kiire!', 'He is shouting something, I cannot make it out. The water is cold and the current is so fast!'),
    ],
    callerLinesRu: [
      'Мужчина упал с набережной в воду! Он плывёт, но его уносит течением!',
      'Я {бросил|бросила} спасательный круг, но он не долетел. Он уже почти на середине!',
      'Он что-то кричит, я не разберу. Вода холодная, и течение такое быстрое!',
    ],
    details: [
      T(
        'Jõe keskel kulgeb riigipiir, piirivalvet on teavitatud. Vool on promenaadi juures kiire ja kaldad on järsud.',
        'The state border runs down the middle of the river; the border guard has been informed. The current by the promenade is fast and the banks are steep.',
      ),
      T('Kannatanu oli koos seltskonnaga, kes tarvitas promenaadil alkoholi.', 'The man was with a group drinking on the promenade.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal promenaadil. Mees on kaldast paarikümne meetri kaugusel ja jääb jõuetuks. Kas üks meist läheb vette või viskame viskeköie ja ootame päästjaid?',
            '{callsign}: on the promenade. The man is about twenty metres from the bank and tiring. Does one of us go in, or do we throw a line and wait for the rescuers?',
          ),
        ],
        [
          opt(
            'line',
            T('Viskeköis ja päästerõngas kaldalt', 'Throw line and lifebuoy from the bank'),
            T('{callsign}, vette ei lähe. Visake viskeköis, valgustage teda ja juhatage päästjad kohale.', '{callsign}, nobody goes in. Throw the line, keep a light on him and guide the rescuers in.'),
            { success: 0.2, time: 5 },
          ),
          opt(
            'swim',
            T('Üks läheb vette', 'One of you goes in'),
            T('{callsign}, üks läheb vette, teine kindlustab kaldalt.', '{callsign}, one of you goes in, the other secures from the bank.'),
            { success: -0.1, risk: 0.15, outcome: 'officer_swam' },
          ),
        ],
        'swim',
        { timeoutMin: 3 },
      ),
      agency('paaste', 1, [
        T('{callsign}: mees triivib allavoolu, kinnitage päästjate ja paadi tulek!', '{callsign}: the man is drifting downstream, confirm the rescuers and a boat are coming!'),
      ], { timeoutMin: 4, fail: { success: -0.25, trust: -4 } }),
      info(5, [
        T('{callsign}: piirivalve paat liigub jõel, hoiame meest prožektori valgusvihus.', '{callsign}: a border guard boat is out on the river, we are keeping the man in the searchlight.'),
      ], 0.6),
      agency('kiirabi', 10, [
        T(
          '{callsign}: kiirabi promenaadile, mees on külmas vees olnud üle kümne minuti ja võib vajada elustamist.',
          '{callsign}: ambulance to the promenade, the man has been in cold water for over ten minutes and may need resuscitation.',
        ),
      ], { chance: 0.8, timeoutMin: 5 }),
    ],
    outcomes: [
      out(
        'line',
        'hospital',
        [0.5, 1],
        4,
        T(
          'Mees haaras viskeköiest kinni ja tõmmati kaldale. Kiirabi viis ta alajahtumisega haiglasse, seltskonnale tehti hoiatus.',
          'The man grabbed the throw line and was pulled ashore. The ambulance took him to hospital with hypothermia and his friends were warned.',
        ),
        { injuries: 1, radio: T('{callsign}: mees köiega kaldale tõmmatud, kiirabi viis haiglasse.', '{callsign}: man pulled ashore on the line, ambulance took him to hospital.') },
      ),
      out(
        'sober',
        'resolved',
        [0.6, 1],
        2,
        T(
          'Mees tõmmati köiega kaldale, ta oli märg ja külmunud, kuid terve. Kiirabi vaatas ta üle ja ta toimetati kainenema.',
          'The man was pulled ashore on the line, wet and frozen but unhurt. The ambulance crew checked him over and he was taken to sober up.',
        ),
        { radio: T('{callsign}: mees kaldal ja terve, viime kainenema.', '{callsign}: man ashore and unhurt, taking him to sober up.') },
      ),
      out(
        'boat',
        'resolved',
        [0.4, 0.85],
        2,
        T(
          'Vool kandis mehe allavoolu, kus päästepaat ta veest välja tõmbas. Ta oli alajahtunud, kuid teadvusel, ja kiirabi võttis ta üle.',
          'The current carried the man downstream, where the rescue boat pulled him out of the water. He was hypothermic but conscious, and the ambulance crew took over.',
        ),
        { radio: T('{callsign}: päästepaat tõi mehe veest välja, kiirabi võttis üle.', '{callsign}: rescue boat got the man out, ambulance took over.') },
      ),
      out(
        'officer_swam',
        'hospital',
        [0, 0.05],
        1,
        T(
          'Üks politseinik läks vette ja sai mehest kinni, kuid vool kandis mõlemad allavoolu, kus päästepaat nad välja tõmbas. Mõlemad viidi alajahtumisega haiglasse.',
          'One officer went into the water and got hold of the man, but the current swept them both downstream, where the rescue boat pulled them out. Both were taken to hospital with hypothermia.',
        ),
        { injuries: 1, radio: T('{callsign}: üks meist ja mees veest väljas, mõlemad haiglasse.', '{callsign}: one of us and the man out, both to hospital.') },
      ),
      out(
        'downstream',
        'hospital',
        [0.15, 0.5],
        2,
        T(
          'Mees kandus voolu mööda kaugele allavoolu. Päästjad leidsid ta kaldavõsast raskelt alajahtununa ja ta viidi haiglasse.',
          'The man was swept far downstream. The rescuers found him in the bushes on the bank, severely hypothermic, and he was taken to hospital.',
        ),
        { injuries: 1, radio: T('{callsign}: mees leitud allavoolu, raskelt alajahtunud, haiglasse.', '{callsign}: man found downstream, severely hypothermic, to hospital.') },
      ),
      out(
        'lost',
        'tragedy',
        [0, 0.2],
        2,
        T(
          'Mees kadus vee alla enne, kui päästjad temani jõudsid. Tuukrid leidsid ta hiljem, elustamine ei õnnestunud. Lähedastele osutati kriisiabi.',
          'The man went under before the rescuers reached him. Divers recovered him later and he could not be resuscitated. The family was given crisis support.',
        ),
        { injuries: 1, radio: T('{callsign}: meest ei õnnestunud päästa, tuukrid leidsid ta.', '{callsign}: the man could not be saved, divers recovered him.') },
      ),
    ],
    expiresMin: 40,
    interactiveChance: 0.4,
    call: {
      mood: 'panic',
      opening: [
        T('Üks mees kukkus promenaadilt jõkke! Vool viib ta minema!', 'A man fell off the promenade into the river! The current is taking him away!'),
        T('Inimene on jões, ta vaevu hoiab end pinnal. Kiiresti, palun!', 'There is someone in the river, barely staying afloat. Quickly, please!'),
      ],
      answers: {
        where: [T('Promenaadil, seal kus trepid lähevad vee äärde.', 'On the promenade, where the steps go down to the water.')],
        intoxicated: [T('Ta tundus purjus, kogu seltskond on purjus.', 'He seemed drunk, the whole group is drunk.')],
        count: [T('Vees on üks mees, tema sõbrad jooksevad kaldal.', 'One man in the water, his friends are running along the bank.')],
        safe: [T('Ma olen kaldal, viskasin talle päästerõnga.', 'I am on the bank, I threw him the lifebuoy.')],
        injured: [T('Ma ei tea, kas ta sai viga, ta kukkus otse vette.', 'I do not know if he is hurt, he fell straight into the water.')],
        suspect: [T('Ta on vees, ma näen ainult pead. Täiskasvanud mees.', 'He is in the water, I can only see his head. A grown man.')],
        direction: [T('Vool viib teda allavoolu ja jõe keskkoha poole.', 'The current is taking him downstream and towards the middle of the river.')],
      },
      answersRu: {
        where: ['На набережной, там, где ступеньки спускаются к воде.'],
        intoxicated: ['Он вроде пьяный, вся компания пьяная.'],
        count: ['В воде один мужчина, друзья бегают по берегу.'],
        safe: ['Я на берегу, {бросил|бросила} ему спасательный круг.'],
        injured: ['Не знаю, ранен ли он, он упал прямо в воду.'],
        suspect: ['Он в воде, мне видна только голова. Взрослый мужчина.'],
        direction: ['Течение уносит его вниз по реке, к середине.'],
      },
      openingRu: ['Мужчина упал с набережной в реку! Его уносит течением!', 'Человек в реке, еле держится на воде. Быстрее, пожалуйста!'],
    },
    tags: ['drowning', 'drunk', 'water'],
  },

  // 7. A car cuts back into a military convoy from the Tapa base on the Tallinn-Narva highway and is hit.
  {
    id: 'traffic_soiduauto_ja_sojavaekolonn',
    category: 'traffic',
    code: 'LÕ',
    title: T('Sõiduauto põrkas kokku sõjaväekolonni soomukiga', 'Car collided with an armoured vehicle in a military convoy'),
    priority: 2,
    weight: 0.35,
    hours: 'day',
    places: ['highway'],
    placeTags: ['e20'],
    regions: ['ida'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('traffic')] },
    onScene: [40, 100],
    persons: [
      { role: 'driver', gender: 'M', age: [20, 65], record: 0.2 },
      { role: 'witness', gender: 'M', age: [24, 45], relation: 'stranger' },
      { role: 'caller', gender: 'any', age: [20, 70] },
    ],
    vehicles: [{ role: 'involved', kind: 'car', driverRole: 'driver', noInsurance: 0.1 }],
    agencies: [
      { agency: 'kiirabi', chance: 0.9, reason: T('Sõiduauto juht sai kokkupõrkes viga', 'The car driver was hurt in the collision') },
      { agency: 'paaste', chance: 1, reason: T('Kinni kiilunud uks ja kütuseleke', 'A jammed door and a fuel leak') },
    ],
    summary: [
      T(
        '{address}. Sõjaväekolonnist möödasõitu teinud sõiduauto pressis end vastutuleva veoki eest kolonni vahele ja sai tagant löögi soomukilt. Auto paiskus teepervele, juht on sees. Kolonn seisab maanteel.',
        '{address}. A car overtaking a military convoy squeezed back in between the vehicles to avoid an oncoming lorry and was hit from behind by an armoured vehicle. The car spun onto the verge with the driver inside. The convoy has stopped on the highway.',
      ),
      T(
        '{address}. Liitlaste soomukite kolonn ja sõiduauto põrkasid kokku, sõiduauto juht on vigastatud. Sõdurid on auto juures, liiklus on mõlemas suunas seisma jäänud.',
        '{address}. A column of allied armoured vehicles and a car have collided and the car driver is hurt. Soldiers are with the car and traffic has stopped in both directions.',
      ),
    ],
    callerLines: [
      T(
        'Siin maanteel põrkas auto sõjaväe soomukiga kokku! Auto on teepervel ja sõdurid jooksevad selle juurde.',
        'A car has just collided with a military armoured vehicle on the highway! The car is on the verge and soldiers are running to it.',
      ),
      T(
        'Ta hakkas kolonnist mööda sõitma ja pidi siis vahele pugema, sest vastu tuli rekka. Soomuk ei jõudnud pidurdada.',
        'He was overtaking the convoy and had to cut in between because a lorry was coming the other way. The armoured vehicle could not brake in time.',
      ),
      T(
        'Juht on autos, liigutab, aga ei saa ust lahti. Soomukeid on kümmekond, terve tee on kinni.',
        'The driver is in the car and moving, but cannot get the door open. There are about ten armoured vehicles and the whole road is blocked.',
      ),
    ],
    callerLinesRu: [
      'Тут на трассе машина столкнулась с военной бронемашиной! Машина на обочине, солдаты бегут к ней.',
      'Он обгонял колонну, а потом пришлось втиснуться между машинами, потому что навстречу шла фура. Бронемашина не успела затормозить.',
      'Водитель в машине, шевелится, но не может открыть дверь. Бронемашин штук десять, вся дорога перекрыта.',
    ],
    details: [
      T(
        'Teataja sõnul lekib sõiduautost kütust ja juht ei saa ust lahti.',
        'The caller says fuel is leaking from the car and the driver cannot open the door.',
      ),
      T(
        'Kolonni ülema sõnul liigub kolonn Tapa linnakust õppusele, sõjaväepolitseid on teavitatud.',
        'The convoy commander says the convoy is on its way from the Tapa base to an exercise; the military police have been informed.',
      ),
    ],
    beats: [
      agency('kiirabi', 'arrive', [
        T(
          '{callsign}: kohal. Sõiduauto on teepervel, juht on teadvusel ja kaebab kaela- ja rinnavalu, juhiuks on kinni kiilunud. Kiirabi, palun.',
          '{callsign}: on scene. The car is on the verge, the driver is conscious and complains of neck and chest pain, the driver’s door is jammed. Ambulance, please.',
        ),
      ], { timeoutMin: 5 }),
      choice(
        4,
        [
          T(
            '{callsign}: kolonni ülem tahab edasi liikuda, maantee on mõlemas suunas kinni. Kas kolonn läheb ühelt rajalt edasi ja kokkupõrkes osalenud soomuk jääb kohale või laseme kõik minema?',
            '{callsign}: the convoy commander wants to move on and the highway is blocked both ways. Does the convoy carry on in one lane while the armoured vehicle involved stays, or do we let them all go?',
          ),
        ],
        [
          opt(
            'partial',
            T('Kolonn edasi, kokkupõrkes olnud soomuk jääb', 'Convoy on, the vehicle involved stays'),
            T(
              '{callsign}, kolonn võib ühelt rajalt edasi minna, kokkupõrkes osalenud soomuk ja tema meeskond jäävad kohale, kuni mõõtmised on tehtud.',
              '{callsign}, the convoy may carry on in one lane; the armoured vehicle involved and its crew stay until the measurements are done.',
            ),
            { success: 0.15, time: 10 },
          ),
          opt(
            'all_go',
            T('Laske kogu kolonn minema', 'Let the whole convoy go'),
            T('{callsign}, laske kolonn minema, soomuki andmed saame hiljem sõjaväepolitseilt.', '{callsign}, let the convoy go, we will get the vehicle’s details from the military police later.'),
            { success: -0.15, trust: -2, outcome: 'convoy_left' },
          ),
        ],
        'all_go',
      ),
      qp('driver', 6, R_DRIVER),
      info(10, [
        T('{callsign}: sõjaväepolitsei jõudis kohale. Juhime liiklust õnnetuskohast ühelt rajalt mööda.', '{callsign}: the military police have arrived. We are directing traffic past the scene in one lane.'),
      ]),
    ],
    outcomes: [
      out(
        'documented',
        'report',
        [0.5, 1],
        4,
        T(
          'Sõiduauto juht viidi kiirabiga haiglasse kontrolli. Õnnetus vormistati koos sõjaväepolitseiga: kolonn jätkas ühelt rajalt ja kokkupõrkes osalenud soomuk jäi mõõtmiste lõpuni kohale. Juhi suhtes alustati väärteomenetlust möödasõidu nõuete rikkumise eest.',
          'The car driver was taken to hospital by ambulance for a check-up. The accident was documented together with the military police: the convoy carried on in one lane and the armoured vehicle involved stayed until the measurements were done. Misdemeanour proceedings were opened against the driver for breaking the overtaking rules.',
        ),
        { injuries: 1, radio: T('{callsign}: õnnetus vormistatud, juht haiglasse, kolonn liigub edasi.', '{callsign}: accident documented, driver to hospital, convoy moving again.') },
      ),
      out(
        'minor',
        'resolved',
        [0.6, 1],
        2,
        T(
          'Sõiduauto juht pääses marrastustega ja keeldus haiglasse minemast. Õnnetus vormistati koos sõjaväepolitseiga ja juhi suhtes alustati väärteomenetlust möödasõidu nõuete rikkumise eest.',
          'The car driver got away with grazes and refused to go to hospital. The accident was documented together with the military police and misdemeanour proceedings were opened against the driver for breaking the overtaking rules.',
        ),
        { radio: T('{callsign}: juhil marrastused, õnnetus vormistatud koos sõjaväepolitseiga.', '{callsign}: driver grazed, accident documented with the military police.') },
      ),
      out(
        'convoy_left',
        'report',
        [0, 0.05],
        1,
        T(
          'Kolonn, ka kokkupõrkes osalenud soomuk, jätkas teed enne mõõtmisi. Õnnetuse asjaolusid selgitatakse tagantjärele sõjaväepolitsei kaudu, sõiduauto juht viidi haiglasse.',
          'The convoy, including the armoured vehicle involved, drove on before the measurements. The circumstances are being established afterwards through the military police; the car driver was taken to hospital.',
        ),
        { injuries: 1, radio: T('{callsign}: kolonn lahkus enne mõõtmisi, asjaolud selgitatakse hiljem.', '{callsign}: convoy left before the measurements, details to follow later.') },
      ),
      out(
        'jam',
        'hospital',
        [0, 0.5],
        2,
        T(
          'Sõiduauto juht viidi raskemate vigastustega haiglasse. Maanteel tekkis kilomeetrite pikkune ummik ja selle sabas juhtus veel kaks kokkupõrget.',
          'The car driver was taken to hospital with more serious injuries. A tailback several kilometres long built up on the highway and two more collisions happened at its tail.',
        ),
        { injuries: 1, radio: T('{callsign}: juht raskelt vigastatud, maanteel pikk ummik.', '{callsign}: driver seriously hurt, a long tailback on the highway.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.35,
      toPriority: 1,
      text: T(
        'Teataja: sõiduauto mootoriruumist tuleb suitsu, juht on ikka sees ja sõdurid proovivad ust lahti kangutada.',
        'Caller: smoke is coming from the car’s engine, the driver is still inside and the soldiers are trying to prise the door open.',
      ),
    },
    expiresMin: 75,
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T('Maanteel põrkas auto sõjaväe soomukiga kokku! Juht on autos ja ei saa välja.', 'A car has collided with a military armoured vehicle on the highway! The driver is in the car and cannot get out.'),
        T(
          'Siin on terve sõjaväekolonn tee peal seisma jäänud ja üks sõiduauto on teepervel puruks. Sõdurid on juba auto juures.',
          'A whole military convoy has stopped on the road here and a car is wrecked on the verge. Soldiers are already at the car.',
        ),
      ],
      answers: {
        injured: [T('Juht liigutab, aga hoiab kaelast kinni. Rohkem autos kedagi pole.', 'The driver is moving but holding his neck. There is nobody else in the car.')],
        vehicle: [T('Sõiduauto on {car}, number {plate}. Soomukeid on kümmekond.', 'The car: {car}, number {plate}. There are about ten armoured vehicles.')],
        count: [T('Autos on üks juht, sõdureid on ümberringi palju.', 'One driver in the car, lots of soldiers around.')],
        weapons: [T('Sõduritel on relvad, aga keegi ei ähvarda kedagi, nad aitavad.', 'The soldiers carry weapons, but nobody is threatening anyone, they are helping.')],
        when: [T('Just praegu, paar minutit tagasi.', 'Just now, a couple of minutes ago.')],
        safe: [T('Seisan oma auto juures teepervel, ohukolmnurk on üleval.', 'I am by my car on the verge, the warning triangle is out.')],
      },
      answersRu: {
        injured: ['Водитель шевелится, но держится за шею. Больше в машине никого нет.'],
        vehicle: ['Легковушка: {car}, номер {plate}. Бронемашин штук десять.'],
        count: ['В машине один водитель, вокруг много солдат.'],
        weapons: ['У солдат оружие, но никто никому не угрожает, они помогают.'],
        when: ['Только что, пару минут назад.'],
        safe: ['Я стою у своей машины на обочине, аварийный знак выставлен.'],
      },
      openingRu: [
        'На трассе машина столкнулась с военной бронемашиной! Водитель в машине и не может выбраться.',
        'Тут на дороге встала целая военная колонна, одна легковушка разбита на обочине. Солдаты уже у машины.',
      ],
    },
    tags: ['military', 'collision'],
  },

  // 8. A man films the gate of the Tapa military base for an hour; a drone case on his back seat.
  {
    id: 'public_order_tapa_linnaku_pildistaja',
    category: 'public_order',
    code: 'AK',
    title: T('Kahtlane pildistaja linnaku värava juures', 'Suspicious photographer at the base gate'),
    priority: 3,
    weight: 0.5,
    hours: 'day',
    places: ['government'],
    placeTags: ['military'],
    regions: ['ida'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('criminal')] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [22, 60], record: 0.2, wanted: 0.05 },
      { role: 'caller', gender: 'any', age: [21, 50], relation: 'employee' },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect', noInsurance: 0.1 }],
    agencies: [{ agency: 'kapo', chance: 0.5, reason: T('Võimalik luuretegevus kaitseväe objekti juures', 'Possible intelligence gathering at a military site') }],
    summary: [
      T(
        '{address}. Linnaku valve teatel seisab värava vastas juba tund aega sõiduauto. Juht filmib pika objektiiviga kaameraga väravat ning sisse ja välja sõitvaid sõidukeid.',
        '{address}. The base guard reports that a car has been parked opposite the gate for an hour. The driver is filming the gate and the vehicles going in and out with a long-lens camera.',
      ),
      T(
        '{address}. Valvur märkas, et sama sõiduauto on päeva jooksul kolm korda värava eest aeglaselt mööda sõitnud ja peatunud. Juht pildistab ja kirjutab midagi üles.',
        '{address}. A guard has noticed the same car slowly passing and stopping in front of the gate three times today. The driver is taking photos and writing something down.',
      ),
      T(
        '{address}. Linnaku aia ääres seisab mees, kes pildistab soomukeid ja sõdureid. Valvuri lähenedes istus ta autosse, kuid jäi lähedale seisma.',
        '{address}. A man by the base fence is photographing armoured vehicles and soldiers. When a guard approached he got into his car but stayed parked nearby.',
      ),
    ],
    callerLines: [
      T(
        'Siin värava vastas seisab auto ja mees filmib meie väravat juba tund aega. Pildistamise keelu silt on tal otse nina all.',
        'There is a car opposite the gate and the man has been filming our gate for an hour. The no-photography sign is right under his nose.',
      ),
      T('Kui ma tema juurde läksin, keeras ta akna kinni ja sõitis natuke eemale. Nüüd on ta jälle tagasi.', 'When I went over to him he wound the window up and drove off a little. Now he is back again.'),
      T('Tagaistmel on tal mingi kast, see näeb välja nagu drooni kohver.', 'He has some kind of case on the back seat, it looks like a drone case.'),
    ],
    callerLinesRu: [
      'Напротив ворот стоит машина, и мужчина уже час снимает наши ворота. Табличка о запрете съёмки прямо у него перед носом.',
      'Когда я к нему {подошёл|подошла}, он закрыл окно и немного отъехал. Теперь опять вернулся.',
      'На заднем сиденье у него какой-то ящик, похоже на кейс от дрона.',
    ],
    details: [
      T('Valvuri sõnul on mehel autos droon ja ta on juba proovinud seda käivitada.', 'The guard says the man has a drone in the car and has already tried to start it.'),
      T(
        'Linnaku ümbruses kehtib droonilennu keeld ja kaitseväe objekti pildistamine on piiratud.',
        'There is a no-fly zone for drones around the base and photographing the military site is restricted.',
      ),
    ],
    beats: [
      qv('arrive', [
        T(
          '{callsign}: kohal. Värava vastas seisab {car}, numbrimärk {plate}, roolis mees kaameraga. Kontrolli palun.',
          '{callsign}: on scene. Opposite the gate: {car}, plate {plate}, a man with a camera at the wheel. Please run it.',
        ),
      ]),
      qp('suspect', 4, R_SUSPECT),
      choice(
        7,
        [
          T(
            '{callsign}: mees ütleb, et on sõjatehnika huviline. Kaameras ja telefonis on sadu pilte väravast, valvuritest ja autode numbritest. Kas võtame seletuse ja teavitame Kaitsepolitseid või laseme tal minna?',
            '{callsign}: the man says he is a military vehicle enthusiast. His camera and phone hold hundreds of photos of the gate, the guards and number plates. Do we take a statement and inform the Internal Security Service, or let him go?',
          ),
        ],
        [
          opt(
            'kapo',
            T('Seletus, teavitage Kaitsepolitseid', 'Statement, inform the Internal Security Service'),
            T(
              '{callsign}, võtke seletus, fikseerige pildid ja sõiduk. Teavitame Kaitsepolitseid, mees jääb ootama.',
              '{callsign}, take a statement, record the photos and the car. We are informing the Internal Security Service, he waits.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'go',
            T('Hoiatage ja laske minna', 'Warn him and let him go'),
            T('{callsign}, selgitage pildistamise piirangut, tehke hoiatus ja laske minna.', '{callsign}, explain the photography restriction, warn him and let him go.'),
            { success: -0.1, time: -5, outcome: 'enthusiast' },
          ),
        ],
        'go',
      ),
      agency('kapo', 10, [
        T(
          '{callsign}: palun teavitage Kaitsepolitseid, mehe kaameras on pildid väravast ja sõidukite numbritest.',
          '{callsign}: please inform the Internal Security Service, the man’s camera has photos of the gate and vehicle plates.',
        ),
      ], { chance: 0.7, timeoutMin: 8 }),
    ],
    outcomes: [
      out(
        'handed',
        'report',
        [0.5, 1],
        3,
        T(
          'Mehe isik, sõiduk ja pildid fikseeriti ning info anti üle Kaitsepolitseile, kes võttis asja üle. Mees lahkus pärast seletuse andmist.',
          'The man’s identity, car and photos were recorded and the information handed to the Internal Security Service, which took the matter over. The man left after giving a statement.',
        ),
        { radio: T('{callsign}: andmed ja pildid fikseeritud, info Kaitsepolitseile.', '{callsign}: details and photos recorded, info passed to the Internal Security Service.') },
      ),
      out(
        'enthusiast',
        'warning',
        [0.4, 1],
        3,
        T(
          'Selgus, et mees oli sõjatehnika huviline, kes ei teadnud pildistamise piirangust. Talle selgitati keeldu, ta kustutas pildid ise ja info edastati kaitseväele.',
          'It turned out the man was a military vehicle enthusiast who did not know about the photography restriction. The ban was explained to him, he deleted the photos himself and the Defence Forces were informed.',
        ),
        { radio: T('{callsign}: sõjatehnika huviline, pildid kustutatud, hoiatus tehtud.', '{callsign}: a military enthusiast, photos deleted, warning given.') },
      ),
      out(
        'drone',
        'fine',
        [0.45, 0.95],
        2,
        T(
          'Mees oli enne patrulli saabumist lennutanud drooni linnaku kohal. Droon võeti hoiule, tema suhtes alustati väärteomenetlust lennupiirangu rikkumise eest ja info edastati Kaitsepolitseile.',
          'Before the patrol arrived the man had flown the drone over the base. The drone was seized, misdemeanour proceedings were opened against him for breaching the no-fly zone and the Internal Security Service was informed.',
        ),
        { radio: T('{callsign}: droon hoiule, väärteomenetlus lennupiirangu rikkumise eest.', '{callsign}: drone seized, misdemeanour case for breaching the no-fly zone.') },
      ),
      out(
        'deleted',
        'report',
        [0, 0.45],
        2,
        T(
          'Mees kustutas kontrolli ajal kaamerast ja telefonist osa pilte ning keeldus seletust andmast. Tema andmed ja sõiduk edastati Kaitsepolitseile.',
          'During the check the man deleted some of the photos from his camera and phone and refused to give a statement. His details and car were passed to the Internal Security Service.',
        ),
        { radio: T('{callsign}: osa pilte kustutati, seletusest keeldus, andmed edastatud.', '{callsign}: some photos deleted, statement refused, details passed on.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.4,
      toPriority: 2,
      text: T(
        'Teataja: mees lasi drooni õhku, see lendab linnaku kohal tehnikapargi suunas.',
        'Caller: the man has launched the drone and it is flying over the base towards the vehicle park.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Helistan Tapa linnakust. Värava vastas seisab auto ja juht filmib meie väravat juba tund aega.',
          'I am calling from the Tapa base. There is a car opposite the gate and the driver has been filming our gate for an hour.',
        ),
        T(
          'Üks mees pildistab aia äärest soomukeid ja sõdureid. Kui ma lähenesin, istus ta autosse, aga ära ei sõitnud.',
          'A man is photographing armoured vehicles and soldiers from by the fence. When I approached he got into his car, but he did not leave.',
        ),
      ],
      answers: {
        vehicle: [T('See on {car}, number {plate}.', 'It is a {car}, number {plate}.')],
        count: [T('Autos on ta üksi.', 'He is alone in the car.')],
        weapons: [T('Relva ma ei näinud, ainult kaamera ja see kohver.', 'I did not see a weapon, just the camera and that case.')],
        safe: [T('Olen värava juures putkas, meid on siin mitu.', 'I am in the hut by the gate, there are several of us here.')],
      },
      answersRu: {
        vehicle: ['Это {car}, номер {plate}.'],
        count: ['В машине он один.'],
        weapons: ['Оружия я не {видел|видела}, только камера и этот кейс.'],
        safe: ['Я в будке у ворот, нас тут несколько.'],
      },
      openingRu: [
        'Я звоню с базы в Тапа. Напротив ворот стоит машина, водитель уже час снимает наши ворота.',
        'Какой-то мужчина фотографирует у забора бронетехнику и солдат. Когда я {подошёл|подошла}, он сел в машину, но не уехал.',
      ],
    },
    tags: ['military', 'drone'],
  },

  // 9. Oil in the harbour at Sillamäe or Kunda: a cargo ship pumps out at night and wants to sail.
  {
    id: 'environment_sadamas_oline_vesi',
    category: 'environment',
    code: 'KK',
    title: T('Õlireostus sadamas, laev tahab väljuda', 'Oil pollution in the harbour, ship about to sail'),
    priority: 3,
    weight: 0.35,
    hours: 'night',
    places: ['port'],
    placeTags: ['industrial'],
    regions: ['ida'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('border')] },
    onScene: [40, 100],
    persons: [
      { role: 'suspect', gender: 'M', age: [30, 65] },
      { role: 'caller', gender: 'any', age: [25, 65], relation: 'employee' },
    ],
    agencies: [
      { agency: 'keskkonnaamet', chance: 1, reason: T('Reostuse proovid ja keskkonnajärelevalve', 'Pollution samples and environmental supervision') },
      { agency: 'paaste', chance: 0.6, reason: T('Reostuse tõkestamine poomidega', 'Containing the spill with booms') },
    ],
    summary: [
      T(
        '{place}, {address}. Sadama töötaja teatel jookseb kai ääres seisva kaubalaeva pardast vette tumedat õlist vedelikku. Sadamabasseinis on lai vikerkaarekiht ja tugev diislilõhn.',
        '{place}, {address}. A port worker reports dark oily liquid running into the water from the side of a cargo ship at the quay. There is a wide rainbow sheen across the harbour basin and a strong smell of diesel.',
      ),
      T(
        '{place}, {address}. Valvur nägi, kuidas kaubalaev pumpab öösel räpast vett otse sadamabasseini. Laev peab graafiku järgi väljuma paari tunni pärast.',
        '{place}, {address}. A guard saw a cargo ship pumping dirty water straight into the harbour basin at night. The ship is due to sail in a couple of hours.',
      ),
    ],
    callerLines: [
      T('Ühe laeva küljest jookseb vette midagi musta, kogu bassein haiseb diisli järele.', 'Something black is running into the water from the side of a ship, the whole basin stinks of diesel.'),
      T('Nad pumpavad seda öösel, et keegi ei näeks. Hommikuks on laev läinud.', 'They pump it out at night so that nobody sees. By the morning the ship will be gone.'),
      T('Vesi on vikerkaarevärviline, kai ääres ujub üks õline lind.', 'The water is rainbow-coloured, there is an oily bird swimming by the quay.'),
    ],
    callerLinesRu: [
      'С борта одного судна что-то чёрное льётся в воду, вся гавань воняет соляркой.',
      'Они это ночью откачивают, чтобы никто не видел. К утру судна уже не будет.',
      'Вода вся в радужных разводах, у причала плавает птица в мазуте.',
    ],
    details: [
      T(
        'Sadama töötaja sõnul valmistub laev juba otsi lahti andma ja reostus kandub tuulega sadama suudme poole.',
        'The port worker says the ship is already getting ready to cast off and the wind is carrying the pollution towards the harbour mouth.',
      ),
      T(
        'Lekke allikas ja aine tehakse kindlaks laevast ja veest võetud proovide järgi.',
        'The source and the substance will be established from samples taken from the ship and from the water.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal kail. Laeva pardast jookseb vette tume õline joga, basseinis on vikerkaarekiht ja diislilõhn. Meeskond kerib voolikut kokku.',
          '{callsign}: on the quay. A dark oily stream is running into the water from the ship’s side, there is a rainbow sheen on the basin and a smell of diesel. The crew is reeling in a hose.',
        ),
      ]),
      choice(
        4,
        [
          T(
            '{callsign}: vanemtüürimees väidab, et lekkis ainult natuke pilsivett ja laev peab tunni aja pärast väljuma. Kas palume sadamakaptenil laeva kinni hoida, kuni proovid on võetud?',
            '{callsign}: the chief mate says only a little bilge water leaked and the ship has to sail within the hour. Do we ask the harbour master to hold the ship until samples have been taken?',
          ),
        ],
        [
          opt(
            'hold',
            T('Laev jääb kaile, kuni proovid on võetud', 'The ship stays at the quay until samples are taken'),
            T(
              '{callsign}, palume sadamakaptenil laev kinni hoida. Pildistage voolikut ja reostust, Keskkonnaamet on teel.',
              '{callsign}, we are asking the harbour master to hold the ship. Photograph the hose and the spill, the Environmental Board is on its way.',
            ),
            { success: 0.2, time: 15 },
          ),
          opt(
            'let',
            T('Fotod ja andmed, laev võib väljuda', 'Photos and details, the ship may sail'),
            T('{callsign}, tehke fotod ja võtke meeskonna andmed, laeva kinni ei hoia.', '{callsign}, take photos and the crew’s details, we will not hold the ship.'),
            { success: -0.15, trust: -2, outcome: 'sailed' },
          ),
        ],
        'let',
      ),
      agency('keskkonnaamet', 6, [
        T('{callsign}: vajame Keskkonnaameti inspektorit proovide võtmiseks, laev tahab väljuda.', '{callsign}: we need an Environmental Board inspector to take samples, the ship wants to sail.'),
      ], { timeoutMin: 8 }),
      agency('paaste', 10, [
        T('{callsign}: reostus levib üle basseini, vajame Päästeametit poomidega.', '{callsign}: the spill is spreading across the basin, we need the Rescue Board with booms.'),
      ], { chance: 0.7, timeoutMin: 8 }),
    ],
    outcomes: [
      out(
        'held',
        'report',
        [0.5, 1],
        4,
        T(
          'Laev jäi kaile, Keskkonnaamet võttis proovid laevast ja veest ning päästjad piirasid reostuse poomidega. Laevaomaniku suhtes alustati menetlust merereostuse tekitamise asjas.',
          'The ship stayed at the quay, the Environmental Board took samples from the ship and the water, and the rescuers contained the spill with booms. Proceedings for causing marine pollution were opened against the shipowner.',
        ),
        { radio: T('{callsign}: laev kail, proovid võetud, reostus poomidega piiratud.', '{callsign}: ship held, samples taken, spill boomed off.') },
      ),
      out(
        'hose',
        'resolved',
        [0.45, 1],
        2,
        T(
          'Selgus, et punkerdamisel oli lekkima hakanud ühendusvoolik ja see suleti kiiresti. Reostus korjati sorbentidega kokku, Keskkonnaamet jätkab menetlust.',
          'It turned out a connecting hose had started leaking during bunkering and it was quickly shut off. The spill was mopped up with sorbents and the Environmental Board is continuing the case.',
        ),
        { radio: T('{callsign}: voolik lekkis, suletud, reostus korjatud.', '{callsign}: a leaking hose, shut off, spill cleaned up.') },
      ),
      out(
        'sailed',
        'report',
        [0, 0.05],
        2,
        T(
          'Laev väljus enne, kui proovid jõuti võtta. Fotod ja meeskonna andmed edastati Keskkonnaametile ja laeva järgmise sadama riigile, reostus piirati poomidega ja korjati kokku.',
          'The ship sailed before samples could be taken. The photos and crew details were sent to the Environmental Board and to the state of the ship’s next port, and the spill was boomed off and cleaned up.',
        ),
        { radio: T('{callsign}: laev väljus enne proove, info edastatud.', '{callsign}: ship sailed before sampling, info passed on.') },
      ),
      out(
        'shore',
        'report',
        [0, 0.45],
        2,
        T(
          'Enne poomide paigaldamist kandus õli sadamast välja randa, kus leiti õliseid linde. Koristustööd kestavad mitu päeva.',
          'Before the booms were in place oil drifted out of the harbour onto the shore, where oiled birds were found. The clean-up will take several days.',
        ),
        { radio: T('{callsign}: õli kandus randa, õlised linnud, koristus kestab.', '{callsign}: oil reached the shore, oiled birds, clean-up ongoing.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.45,
      toPriority: 2,
      text: T(
        'Teataja: õlilaik on jõudnud sadama suudmeni, kai ääres on mitu õlist lindu.',
        'Caller: the oil slick has reached the harbour mouth and there are several oiled birds by the quay.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Sadamas on vesi õline, ühe kaubalaeva küljest jookseb midagi musta vette! Kogu bassein haiseb diisli järele.',
          'The water in the harbour is oily, something black is running into the water from a cargo ship! The whole basin stinks of diesel.',
        ),
        T(
          'Ma töötan siin sadamas. Üks laev pumpab öösel räpast vett otse merre, pind on vikerkaarevärviline.',
          'I work here at the port. One ship is pumping dirty water straight into the sea at night, the surface is all rainbow-coloured.',
        ),
      ],
      answers: {
        count: [T('Laeval on vist kümmekond meeskonnaliiget, kail on neist kaks.', 'There are maybe ten crew on the ship, two of them on the quay.')],
        when: [T('Märkasin seda pool tundi tagasi, aga see jookseb siiani.', 'I noticed it half an hour ago and it is still running.')],
        safe: [T('Olen kail, eemal, aga lõhn on väga terav.', 'I am on the quay, at a distance, but the smell is very sharp.')],
      },
      answersRu: {
        count: ['На судне, наверное, человек десять экипажа, двое на причале.'],
        when: ['Я {заметил|заметила} полчаса назад, а оно до сих пор течёт.'],
        safe: ['Я на причале, в стороне, но запах очень резкий.'],
      },
      openingRu: [
        'В порту вода вся в мазуте, с борта грузового судна что-то чёрное льётся в воду! Вся гавань воняет соляркой.',
        'Я тут в порту работаю. Одно судно ночью откачивает грязную воду прямо в море, вся поверхность в радужных разводах.',
      ],
    },
    tags: ['pollution'],
  },

  // 10. Pickpockets work the crowd of pilgrims at the Kuremäe convent and its holy spring in summer.
  {
    id: 'property_kuremae_palverandurite_taskuvargad',
    category: 'property',
    code: 'VG',
    title: T('Taskuvargad palverändurite seas', 'Pickpockets among pilgrims'),
    priority: 3,
    weight: 1,
    months: [6, 7, 8],
    hours: 'day',
    places: ['church'],
    placeTags: ['convent'],
    regions: ['ida'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 30], record: 0.6, wanted: 0.1 },
      { role: 'suspect', gender: 'M', age: [18, 30], record: 0.5 },
      { role: 'victim', gender: 'F', age: [60, 85] },
      { role: 'caller', gender: 'F', age: [45, 80] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect', stolen: 0.1, noInsurance: 0.2 }],
    summary: [
      T(
        '{address}. Kloostri juures on palju palverändureid. Mitmel inimesel on kotist kadunud rahakott, kahtlustatakse kahte noormeest, kes trügisid rahva seas.',
        '{address}. There are many pilgrims at the convent. Several people have had their wallets taken from their bags; two young men who were pushing through the crowd are suspected.',
      ),
      T(
        '{address}. Kloostri püha allika juures varastati eaka naise kotist rahakott pensioni ja passiga. Tunnistajate sõnul läksid kaks noormeest parkla poole.',
        '{address}. At the convent’s holy spring an elderly woman’s wallet with her pension and passport was stolen from her bag. Witnesses say two young men went towards the car park.',
      ),
      T(
        '{address}. Palverändurite seas tegutsevad taskuvargad: üks naine tabas noormehe oma kotti avamast, mees kadus rahva sekka. Kadunud on mitu rahakotti.',
        '{address}. Pickpockets are at work among the pilgrims: a woman caught a young man opening her bag and he vanished into the crowd. Several wallets are missing.',
      ),
    ],
    callerLines: [
      T(
        'Minu sõbranna kotist varastati rahakott, seal oli kogu tema pension ja pass! Me tulime bussiga palverännakule.',
        'My friend’s wallet was stolen from her bag, her whole pension and her passport were in it! We came on a pilgrimage by coach.',
      ),
      T('Kaks noormeest trügisid inimeste vahel ja nüüd on mitmel inimesel rahakott kadunud.', 'Two young men were pushing between people and now several people’s wallets are missing.'),
      T('Nad läksid parkla poole, üks oli kapuutsiga. Neil on seal vist auto.', 'They went towards the car park, one had his hood up. They probably have a car there.'),
    ],
    callerLinesRu: [
      'У моей подруги из сумки украли кошелёк, там вся её пенсия и паспорт! Мы с паломнической группой на автобусе приехали.',
      'Двое парней толкались между людьми, и теперь у нескольких человек пропали кошельки.',
      'Они пошли к парковке, один в капюшоне. У них там, наверное, машина.',
    ],
    details: [
      T('Tunnistajate sõnul seisab parklas töötava mootoriga sõiduauto, roolis on noormees.', 'Witnesses say a car is standing in the car park with its engine running and a young man at the wheel.'),
      T(
        'Palverännakute ajal on kloostri juures taskuvargusi varemgi olnud, vargad tegutsevad tavaliselt paarikaupa.',
        'There have been pickpocketing cases at the convent during pilgrimages before; the thieves usually work in pairs.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal. Kloostri juures on sadu palverändureid, kannatanu nutab. Tema kotist kadus rahakott pensioni ja passiga.',
          '{callsign}: on scene. Hundreds of pilgrims at the convent, the victim is in tears. Her wallet with her pension and passport has gone from her bag.',
        ),
      ]),
      search(3, 2, [
        T(
          '{callsign}: tunnistajate kirjelduse järgi läksid kaks noormeest parkla poole. Kontrollime parklat ja teed.',
          '{callsign}: according to witnesses two young men went towards the car park. Checking the car park and the road.',
        ),
      ]),
      qv(6, [
        T(
          '{callsign}: parklas on töötava mootoriga {car}, numbrimärk {plate}, roolis noormees. Kontrolli palun.',
          '{callsign}: in the car park, engine running: {car}, plate {plate}, a young man at the wheel. Please run it.',
        ),
      ]),
      qp('suspect', 10, R_SUSPECT),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.5, 1],
        4,
        T(
          'Kaks meest peeti parklas autos kinni, autost leiti mitu võõrast rahakotti ja kannatanu pass. Alustati kriminaalmenetlust KarS § 199 järgi, asjad tagastati omanikele.',
          'Two men were detained in their car in the car park; several other people’s wallets and the victim’s passport were found in the car. Criminal proceedings were opened under KarS § 199 and the property was returned to its owners.',
        ),
        { arrests: 2, radio: T('{callsign}: kaks taskuvarast kinni, rahakotid tagastatud.', '{callsign}: two pickpockets detained, wallets returned.') },
      ),
      out(
        'one',
        'arrest',
        [0.45, 1],
        1.5,
        T(
          'Roolis olnud noormees peeti kinni, autost leiti kannatanu pass ja raha. Tema kaaslane põgenes metsa poole, kaaslase isik on teada.',
          'The young man at the wheel was detained and the victim’s passport and money were found in the car. His accomplice ran off towards the forest; the accomplice’s identity is known.',
        ),
        { arrests: 1, radio: T('{callsign}: üks taskuvaras kinni, teine põgenes metsa.', '{callsign}: one pickpocket detained, the other ran into the forest.') },
      ),
      out(
        'wallet',
        'report',
        [0.3, 0.8],
        2,
        T(
          'Autos olnud noormehelt võõraid asju ei leitud. Kannatanu rahakott leiti allika lähedalt põõsast, raha oli võetud, kuid pass oli alles. Alustati kriminaalmenetlust, vargad on seni tabamata.',
          'Nothing stolen was found on the young man in the car. The victim’s wallet was found in the bushes near the spring with the cash gone but the passport still in it. Criminal proceedings were opened; the thieves have not been caught yet.',
        ),
        { radio: T('{callsign}: rahakott leitud rahata, pass alles, vargad tabamata.', '{callsign}: wallet found without the cash, passport there, thieves not caught.') },
      ),
      out(
        'gone',
        'escaped',
        [0, 0.4],
        3,
        T(
          'Autos olnud noormehelt varastatud asju ei leitud ja vargad olid jõudnud rahva sekka kaduda. Alustati kriminaalmenetlust, kannatanutele anti juhised pangakaartide sulgemiseks ja kloostrit paluti palverändureid hoiatada.',
          'Nothing stolen was found on the young man in the car, and the thieves had managed to vanish into the crowd. Criminal proceedings were opened, the victims were told how to block their bank cards and the convent was asked to warn the pilgrims.',
        ),
        { radio: T('{callsign}: vargad kadusid rahva sekka, kaardid suletud.', '{callsign}: thieves vanished into the crowd, bank cards blocked.') },
      ),
    ],
    expiresMin: 90,
    interactiveChance: 0.3,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Allika juures varastati mu sõbranna kotist rahakott, seal oli kogu pension ja pass! Palun aidake.',
          'At the spring someone stole my friend’s wallet from her bag, her whole pension and passport were in it! Please help.',
        ),
        T(
          'Siin on palju rahvast, kaks noormeest trügisid inimeste vahel ja nüüd on mitmel inimesel rahakott kadunud.',
          'There are lots of people here, two young men were pushing between people and now several people’s wallets are gone.',
        ),
      ],
      answers: {
        suspect: [T('Kaks noormeest, umbes kahekümnesed, tumedates dressides, üks kapuutsiga.', 'Two young men, about twenty, in dark tracksuits, one with his hood up.')],
        direction: [T('Nad läksid parkla poole, maantee suunas.', 'They went towards the car park, in the direction of the main road.')],
        count: [T('Kadunud on vähemalt kolm rahakotti.', 'At least three wallets are missing.')],
        when: [T('Umbes kümme minutit tagasi, kui inimesed allikas käisid.', 'About ten minutes ago, while people were bathing in the spring.')],
      },
      answersRu: {
        suspect: ['Двое парней, лет по двадцать, в тёмных спортивных костюмах, один в капюшоне.'],
        direction: ['Они пошли к парковке, в сторону шоссе.'],
        count: ['Пропало минимум три кошелька.'],
        when: ['Минут десять назад, когда люди окунались в источнике.'],
      },
      openingRu: [
        'У источника у моей подруги из сумки украли кошелёк, там была вся пенсия и паспорт! Помогите, пожалуйста.',
        'Тут много народу, двое парней толкались между людьми, и теперь у нескольких человек пропали кошельки.',
      ],
    },
    tags: ['pickpocket', 'crowd'],
  },

  // 11. A conscript leaves the Tapa base without permission after bad news and heads for the railway station.
  {
    id: 'missing_ajateenija_lahkus_linnakust',
    category: 'missing',
    code: 'OTS',
    title: T('Ajateenija lahkus linnakust, võib olla ohus', 'Conscript has left the base and may be at risk'),
    priority: 2,
    weight: 0.35,
    hours: 'evening',
    places: ['trainstation'],
    placeTags: ['garrison'],
    regions: ['ida'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('k9')] },
    onScene: [40, 100],
    persons: [
      { role: 'missing', gender: 'M', age: [18, 22] },
      { role: 'caller', gender: 'any', age: [24, 50], relation: 'employee' },
    ],
    summary: [
      T(
        '{place}, {address}. Kaitseväe korrapidaja teatel lahkus ajateenija tund aega tagasi loata linnakust. Ta saatis kaaslastele sõnumi, et ei jaksa enam, telefon asub raudteejaama lähedal.',
        '{place}, {address}. The Defence Forces duty officer reports that a conscript left the base without permission an hour ago. He sent his mates a message saying he cannot take it any more; his phone is near the railway station.',
      ),
      T(
        '{place}, {address}. Linnakust kadunud ajateenijat nähti jaamas perroonil, ta ei läinud rongile ja kõndis rööbaste suunas. Kaaslaste sõnul sai ta kodust halbu uudiseid.',
        '{place}, {address}. A conscript missing from the base was seen on the platform at the station; he did not board the train and walked off towards the tracks. His mates say he had bad news from home.',
      ),
    ],
    callerLines: [
      T(
        'Helistan linnakust. Üks meie ajateenija lahkus loata ja saatis sõbrale sõnumi, et ei jaksa enam.',
        'I am calling from the base. One of our conscripts has left without permission and sent a friend a message saying he cannot go on.',
      ),
      T(
        'Ta sai täna kodust halbu uudiseid ja oli terve päeva vait. Telefon näitab, et ta on jaama juures.',
        'He had bad news from home today and did not say a word all day. His phone shows he is near the station.',
      ),
      T('Sõjaväepolitsei on teel, aga teie olete lähemal. Palun leidke ta enne rongi.', 'The military police are on their way, but you are closer. Please find him before the train comes.'),
    ],
    callerLinesRu: [
      'Звоню с базы. Один наш срочник ушёл без разрешения и написал другу, что больше не может.',
      'Он сегодня получил плохие новости из дома и весь день молчал. Телефон показывает, что он у вокзала.',
      'Военная полиция едет, но вы ближе. Найдите его, пожалуйста, до поезда.',
    ],
    details: [
      T(
        'Korrapidaja sõnul on ajateenija telefon olnud viimased kümme minutit raudtee ääres liikumatu, jaamast sõidavad läbi kaubarongid.',
        'The duty officer says the conscript’s phone has been stationary by the railway line for the last ten minutes; freight trains pass through the station.',
      ),
      T('Ajateenijal relva kaasas ei ole, ta on vormis ja tal on seljakott.', 'The conscript has no weapon with him; he is in uniform with a backpack.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.3, reason: T('Ajateenija võis võtta tablette', 'The conscript may have taken pills') }],
    beats: [
      search('arrive', 1, [
        T('{callsign}: kohal jaamas. Perroonil teda ei ole, kontrollime ooteruumi ja raudtee äärt.', '{callsign}: at the station. He is not on the platform, checking the waiting room and along the tracks.'),
      ]),
      choice(
        3,
        [
          T(
            '{callsign}: jaamast peaks varsti läbi sõitma kaubarong. Kas palume rongiliikluse juhtimiskeskusel rongid jaama ümbruses peatada, kuni ta on leitud?',
            '{callsign}: a freight train is due through the station soon. Do we ask rail traffic control to stop the trains around the station until he is found?',
          ),
        ],
        [
          opt(
            'stop',
            T('Peatage rongiliiklus jaama ümbruses', 'Stop rail traffic around the station'),
            T('{callsign}, palume raudteel rongid kinni pidada, otsige rööbaste äärest.', '{callsign}, we are asking the railway to hold the trains, search along the tracks.'),
            { success: 0.15, time: 5 },
          ),
          opt(
            'keep',
            T('Rongid sõidavad, otsige edasi', 'Trains keep running, keep searching'),
            T('{callsign}, rongiliiklust ei peata, otsige edasi ja olge rööbaste juures ettevaatlikud.', '{callsign}, we will not stop the trains, keep searching and take care by the tracks.'),
            { success: -0.15, risk: 0.05 },
          ),
        ],
        'keep',
      ),
      choice(
        8,
        [
          T(
            '{callsign}: leidsime ta, istub raudtee ääres kraavis ja nutab. Ütleb, et linnakusse tagasi ei lähe. Kuidas edasi?',
            '{callsign}: we found him, sitting in the ditch by the tracks and crying. He says he will not go back to the base. What now?',
          ),
        ],
        [
          opt(
            'talk',
            T('Rääkige rahulikult, oodake sõjaväepolitseid', 'Talk calmly, wait for the military police'),
            T(
              '{callsign}, ärge kiirustage. Rääkige temaga rahulikult, viige ta rööbastelt eemale autosse sooja ja oodake sõjaväepolitseid.',
              '{callsign}, do not rush. Talk to him calmly, get him away from the tracks into the warm car and wait for the military police.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'grab',
            T('Võtke kinni ja viige linnakusse', 'Take hold of him and drive him to the base'),
            T('{callsign}, võtke ta kinni ja viige kohe linnakusse.', '{callsign}, take hold of him and drive him straight to the base.'),
            { success: -0.1, risk: 0.05, time: -5 },
          ),
        ],
        'grab',
      ),
      agency('kiirabi', 12, [
        T('{callsign}: ta ütleb, et võttis tablette, aga ei ütle, mida. Kiirabi jaama, palun.', '{callsign}: he says he took some pills but will not say what. Ambulance to the station, please.'),
      ], { chance: 0.35, timeoutMin: 6, ok: { success: 0.05, outcome: 'pills' }, fail: { success: -0.2, trust: -3, outcome: 'pills' } }),
    ],
    outcomes: [
      out(
        'handed_over',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Ajateenija toodi raudtee äärest ära ja anti üle sõjaväepolitseile, kes viis ta linnakusse arsti ja psühholoogi juurde.',
          'The conscript was brought away from the tracks and handed over to the military police, who took him back to the base to see a doctor and a psychologist.',
        ),
        { radio: T('{callsign}: ajateenija leitud ja sõjaväepolitseile üle antud.', '{callsign}: conscript found and handed over to the military police.') },
      ),
      out(
        'pills',
        'hospital',
        [0, 0.05],
        2,
        T(
          'Ajateenija ütles, et oli võtnud tablette. Kiirabi viis ta haiglasse, kaitseväge teavitati ja tema juurde jäi üks kaaslane.',
          'The conscript said he had taken pills. The ambulance took him to hospital, the Defence Forces were informed and one of his mates stayed with him.',
        ),
        { injuries: 1, radio: T('{callsign}: ajateenija võttis tablette, kiirabi viis haiglasse.', '{callsign}: conscript took pills, ambulance took him to hospital.') },
      ),
      out(
        'ran',
        'hospital',
        [0, 0.5],
        2,
        T(
          'Ajateenija jooksis politseinike eest mööda raudteetammi minema, kukkus ja sai peavigastuse. Ta viidi haiglasse, juhtumit uurivad politsei ja sõjaväepolitsei.',
          'The conscript ran away from the officers along the railway embankment, fell and suffered a head injury. He was taken to hospital; the police and the military police are looking into what happened.',
        ),
        { injuries: 1, radio: T('{callsign}: ajateenija jooksis, kukkus raudteetammil, haiglasse.', '{callsign}: conscript ran, fell on the embankment, to hospital.') },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.4,
      toPriority: 1,
      text: T(
        'Korrapidaja: ajateenija saatis emale sõnumi, kus palub andestust. Telefon on raudtee ääres ja ta ei vasta.',
        'Duty officer: the conscript has texted his mother asking her forgiveness. His phone is by the railway line and he is not answering.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Helistan kaitseväe linnakust. Üks meie ajateenija lahkus loata ja saatis sõbrale sõnumi, et ei jaksa enam.',
          'I am calling from the Defence Forces base. One of our conscripts has left without permission and sent a friend a message saying he cannot go on.',
        ),
        T(
          'Ajateenija on kadunud ja telefoni järgi on ta raudteejaama juures. Ta sai täna kodust halbu uudiseid.',
          'A conscript is missing and his phone puts him near the railway station. He had bad news from home today.',
        ),
      ],
      answers: {
        suspect: [T('Ta on vormis ja seljas on tal roheline seljakott.', 'He is in uniform with a green backpack.')],
        weapons: [T('Relva tal ei ole, relvad on relvaruumis.', 'He has no weapon, the weapons are in the armoury.')],
        when: [T('Ta lahkus umbes tund aega tagasi, märkasime seda loendusel.', 'He left about an hour ago, we noticed at roll call.')],
        direction: [T('Telefon näitab raudteejaama, rongid lähevad sealt Tallinna, Tartu ja Narva poole.', 'His phone shows the railway station; trains from there go towards Tallinn, Tartu and Narva.')],
        injured: [
          T('Me ei tea, keegi pole teda pärast lahkumist näinud ja ta ei vasta telefonile.', 'We do not know, nobody has seen him since he left and he is not answering his phone.'),
        ],
      },
      answersRu: {
        suspect: ['Он в форме, за спиной зелёный рюкзак.'],
        weapons: ['Оружия у него нет, всё оружие в оружейной.'],
        when: ['Он ушёл примерно час назад, заметили на поверке.'],
        direction: ['Телефон показывает вокзал, оттуда поезда идут на Таллинн, Тарту и Нарву.'],
        injured: ['Не знаем, после ухода его никто не видел, и он не отвечает на телефон.'],
      },
      openingRu: [
        'Звоню с базы Сил обороны. Один наш срочник ушёл без разрешения и написал другу, что больше не может.',
        'Пропал срочник, телефон показывает, что он у вокзала. Он сегодня получил плохие новости из дома.',
      ],
    },
    tags: ['search'],
  },

  // 12. A summer night on Võsu beach: minors drinking, an adult supplying vodka, one girl in a bad way.
  {
    id: 'public_order_vosu_rannapidu_alaealised',
    category: 'public_order',
    code: 'AK',
    title: T('Alaealiste joomapidu rannas', 'Underage drinking party on the beach'),
    priority: 3,
    weight: 1.6,
    months: [6, 7, 8],
    hours: 'nightlife',
    weekendBoost: 2,
    places: ['beach'],
    placeTags: ['partybeach'],
    regions: ['ida'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'victim', gender: 'F', age: [14, 16], intoxicated: 1 },
      { role: 'suspect', gender: 'M', age: [19, 26], intoxicated: 0.6, record: 0.2 },
      { role: 'caller', gender: 'any', age: [35, 70], relation: 'neighbour' },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect', noInsurance: 0.15 }],
    agencies: [{ agency: 'sotsiaal', chance: 0.4, reason: T('Joobes alaealised, lastekaitse teavitamine', 'Drunk minors, child protection to be notified') }],
    summary: [
      T(
        '{place}, {address}. Rannas on öine noortepidu, kus joovad ka alaealised. Muusika mürtsub, liival on pudelid ja paar noort on juba väga joobes.',
        '{place}, {address}. A night-time youth party on the beach, with minors drinking too. The music is booming, there are bottles on the sand and a couple of the teenagers are already very drunk.',
      ),
      T(
        '{place}, {address}. Suvitajate teatel joodab täisealine noormees rannas alaealisi, viinapudel käib ringi. Üks tüdruk oksendab ja vaevu seisab.',
        '{place}, {address}. Holidaymakers report that a young adult man is plying minors with alcohol on the beach and a vodka bottle is going round. One girl is vomiting and can barely stand.',
      ),
    ],
    callerLines: [
      T(
        'Rannas on kolmkümmend last, kõik purjus, mõned on ehk kolmteist-neliteist. Muusika mürtsub kolmandat tundi.',
        'There are thirty kids on the beach, all drunk, some of them maybe thirteen or fourteen. The music has been booming for three hours.',
      ),
      T('Üks vanem poiss toob neile autost viina. Ma nägin seda oma silmaga.', 'One older lad is bringing them vodka from his car. I saw it with my own eyes.'),
      T('Üks tüdruk oksendab liival ja teised naeravad. Ta ei saa enam püsti.', 'A girl is throwing up on the sand and the others are laughing. She cannot get up any more.'),
    ],
    callerLinesRu: [
      'На пляже человек тридцать детей, все пьяные, некоторым лет тринадцать-четырнадцать. Музыка гремит уже третий час.',
      'Один парень постарше носит им водку из машины. Я своими глазами {видел|видела}.',
      'Одну девочку тошнит на песке, а остальные смеются. Она уже не может встать.',
    ],
    details: [
      T(
        'Teataja sõnul ei vasta liival lamav tüdruk enam hüüdmisele, kaaslased jätavad ta üksi ja lähevad ujuma.',
        'The caller says the girl lying on the sand no longer responds when called; her friends are leaving her alone and going for a swim.',
      ),
      T('Suvel kogunevad noored siia igal nädalavahetusel, alkohol tuuakse kohale autodega.', 'In summer young people gather here every weekend; the alcohol is brought in by car.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kohal. Rannas on paarkümmend noort, enamik alaealised ja joobes. Üks tüdruk lamab liival. Kas lõpetame peo ja kutsume vanemad või tegeleme ainult tüdrukuga?',
            '{callsign}: on scene. About twenty young people on the beach, most of them underage and drunk. A girl is lying on the sand. Do we end the party and call the parents, or deal only with the girl?',
          ),
        ],
        [
          opt(
            'end',
            T('Tüdruk kiirabile, pidu lõpetada, vanemad kohale', 'Girl to the ambulance, end the party, call the parents'),
            T(
              '{callsign}, kõigepealt tüdruk külili ja kiirabi, siis pidu lõpetada. Alaealiste andmed kirja ja vanemad kohale.',
              '{callsign}, first the girl in the recovery position and an ambulance, then end the party. Take the minors’ details and get the parents here.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'girl',
            T('Ainult tüdruk, teised las jäävad', 'Only the girl, leave the others'),
            T('{callsign}, tegelege tüdrukuga, ülejäänutele tehke hoiatus.', '{callsign}, deal with the girl and warn the rest.'),
            { success: -0.1, time: -5, outcome: 'girl_only' },
          ),
        ],
        'girl',
      ),
      agency('kiirabi', 2, [
        T('{callsign}: tüdruk on raskes alkoholijoobes ja reageerib vaevu. Kiirabi randa, palun.', '{callsign}: the girl is severely drunk and barely responsive. Ambulance to the beach, please.'),
      ], { timeoutMin: 5, fail: { success: -0.2, trust: -3 } }),
      qp('suspect', 6, [
        T(
          '{callsign}: alkoholi tõi autost täisealine noormees, ütleb nimeks {name}, isikukood {idcode}. Kontrolli palun.',
          '{callsign}: the alcohol came from the car of a young adult man, he gives the name {name}, ID code {idcode}. Please check.',
        ),
      ], 0.8),
      info(12, [T('{callsign}: paneme alaealiste andmed kirja. Mõni noor jooksis luidete vahele.', '{callsign}: taking the minors’ details. A few kids ran off into the dunes.')]),
    ],
    outcomes: [
      out(
        'ended',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Tüdruk viidi kiirabiga haiglasse jälgimisele. Pidu lõpetati, alaealised anti vanematele üle ja lastekaitset teavitati.',
          'The girl was taken to hospital by ambulance for observation. The party was ended, the minors were handed over to their parents and child protection was informed.',
        ),
        { injuries: 1, radio: T('{callsign}: tüdruk haiglasse, pidu lõpetatud, vanemad võtsid üle.', '{callsign}: girl to hospital, party ended, parents took over.') },
      ),
      out(
        'supplier',
        'fine',
        [0.55, 1],
        2,
        T(
          'Alaealistele alkoholi toonud täisealise noormehe suhtes alustati väärteomenetlust alaealisele alkoholi üleandmise eest. Pidu lõpetati, vanemaid teavitati.',
          'Misdemeanour proceedings were opened against the young adult who supplied the minors with alcohol. The party was ended and the parents were informed.',
        ),
        { radio: T('{callsign}: alkoholi toojale väärteomenetlus, pidu lõpetatud.', '{callsign}: misdemeanour case for the supplier, party over.') },
      ),
      out(
        'parents',
        'warning',
        [0.4, 0.9],
        2,
        T(
          'Pidu lõpetati ja noored saadeti laiali, alaealiste vanematele helistati. Tüdruk toibus kiirabi järelevalve all ja vanemad viisid ta koju.',
          'The party was ended and the teenagers sent home, and the minors’ parents were phoned. The girl came round under the ambulance crew’s eye and her parents took her home.',
        ),
        { radio: T('{callsign}: pidu laiali, tüdruk toibus, vanemad viisid koju.', '{callsign}: party broken up, girl came round, parents took her home.') },
      ),
      out(
        'girl_only',
        'warning',
        [0, 0.05],
        1,
        T(
          'Tüdruk viidi kiirabiga haiglasse jälgimisele. Ülejäänud noortele tehti hoiatus, kuid pidu jätkus ja hiljem tuli samast rannast uus väljakutse.',
          'The girl was taken to hospital by ambulance for observation. The other teenagers were warned, but the party went on and another call came from the same beach later.',
        ),
        { injuries: 1, radio: T('{callsign}: tüdruk haiglasse, teistele hoiatus, pidu jätkub.', '{callsign}: girl to hospital, the rest warned, party goes on.') },
      ),
      out(
        'poisoned',
        'hospital',
        [0, 0.45],
        2,
        T(
          'Tüdrukul oli raske alkoholimürgistus ja ta viidi haiglasse intensiivravile. Enamik noori jooksis enne laiali, alkoholi tooja suhtes alustati menetlust.',
          'The girl had severe alcohol poisoning and was taken to hospital for intensive care. Most of the teenagers ran off first; proceedings were opened against the man who supplied the alcohol.',
        ),
        { injuries: 1, radio: T('{callsign}: tüdruk raske mürgistusega haiglasse, noored jooksid laiali.', '{callsign}: girl to hospital with severe poisoning, teenagers ran off.') },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.45,
      toPriority: 2,
      text: T(
        'Teataja: tüdruk lamab liival teadvuseta ja hingab imelikult, keegi ei vaata tema järele.',
        'Caller: the girl is lying unconscious on the sand and breathing strangely, nobody is looking after her.',
      ),
    },
    expiresMin: 90,
    interactiveChance: 0.25,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Rannas on kolmkümmend last, kõik purjus, muusika mürtsub kolmandat tundi! Mõned on ehk kolmteist-neliteist.',
          'There are thirty kids on the beach, all drunk, the music has been booming for three hours! Some of them are maybe thirteen or fourteen.',
        ),
        T('Üks vanem poiss joodab rannas lapsi, toob autost viina. Üks tüdruk juba oksendab.', 'An older lad is getting the kids drunk on the beach, bringing vodka from his car. One girl is already throwing up.'),
      ],
      answers: {
        count: [T('Kokku kolmkümmend, äkki rohkemgi.', 'Thirty altogether, maybe more.')],
        children: [T('Jah, enamik on lapsed, mõni näeb välja nagu seitsmenda klassi õpilane.', 'Yes, most of them are kids, some look like seventh-graders.')],
        injured: [T('Üks tüdruk oksendab ja ei saa püsti, teised naeravad.', 'One girl is throwing up and cannot get up, the others are laughing.')],
        intoxicated: [T('Kõik on purjus, see vanem poiss ka.', 'They are all drunk, that older lad too.')],
        vehicle: [T('Ta toob viina autost, parklas seisab {car}, number {plate}.', 'He fetches the vodka from his car in the car park: {car}, number {plate}.')],
      },
      answersRu: {
        vehicle: ['Водку он носит из машины, на парковке стоит {car}, номер {plate}.'],
        count: ['Всего человек тридцать, может, и больше.'],
        children: ['Да, в основном дети, некоторые выглядят как семиклассники.'],
        injured: ['Одну девочку тошнит, она не может встать, остальные смеются.'],
        intoxicated: ['Все пьяные, и этот старший парень тоже.'],
      },
      openingRu: [
        'На пляже человек тридцать детей, все пьяные, музыка гремит уже третий час! Некоторым лет тринадцать-четырнадцать.',
        'Один парень постарше спаивает детей на пляже, носит им водку из машины. Одну девочку уже тошнит.',
      ],
    },
    tags: ['youth', 'drunk', 'alcohol'],
  },
];
