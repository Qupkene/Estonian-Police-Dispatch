// Narkootikumid ja ebaseaduslik relvakaubandus (vihjed, leiud, joobes isikud, müük).
import type { IncidentTemplate } from '@/sim/types';
import {
  T,
  backup,
  choice,
  info,
  kiirabi,
  oc,
  opt,
  pursuit,
  qPerson,
  qVehicle,
  toArrest,
  un,
} from './_helpers_a';

export const TEMPLATES_DRUGS: IncidentTemplate[] = [
  // ─── Legacy ───────────────────────────────────────────────────────────────
  {
    id: 'drugs_found_at_school',
    category: 'drugs',
    code: 'NA',
    title: T('Leitud narkootikumid', 'Drugs found'),
    priority: 3,
    weight: 0.3,
    hours: 'business',
    months: [1, 2, 3, 4, 5, 9, 10, 11, 12],
    places: ['school'],
    units: { need: [un('any', 1)], ideal: [un('community', 1)] },
    onScene: [25, 50],
    persons: [
      { role: 'caller', gender: 'any', age: [25, 60], relation: 'employee' },
      { role: 'suspect', gender: 'any', age: [14, 18], record: 0.1, known: false },
    ],
    summary: [
      T(
        '{address}. Kooli õpetaja leidis tualetist kahtlase valge pulbriga kotikese.',
        '{address}. A teacher found a small bag of suspicious white powder in the school toilets.',
      ),
      T(
        '{address}. Koolis leidis koristaja riietusruumist minigrip-kotikesed tablettide ja rohelise taimse ainega. Kotid on õpetajate toas.',
        '{address}. At a school a cleaner found zip bags with pills and green plant material in the changing room. The bags are in the staff room.',
      ),
    ],
    callerLines: [
      T(
        'Leidsin poiste tualetist kotikese valge pulbriga. Ma ei puutunud seda paljaste kätega.',
        'I found a little bag of white powder in the boys’ toilets. I did not touch it with bare hands.',
      ),
      T(
        'Me ei taha paanikat tekitada, aga lapsevanemad peavad teadma. Mida me tegema peame?',
        'We do not want to cause panic, but parents need to know. What should we do?',
      ),
    ],
    details: [
      T(
        'Koolis on valvekaamerad koridoris, tualeti ukse juures.',
        'The school has CCTV in the corridor by the toilet door.',
      ),
      T(
        'Õpetajate sõnul on paar õpilast viimasel ajal käitunud imelikult.',
        'Teachers say a couple of pupils have been acting strangely lately.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}, kohal. Õpetaja andis üle kotikese valge pulbriga, pakendame asitõendiks.',
          '{callsign}, on scene. The teacher handed over a bag of white powder; bagging it as evidence.',
        ),
      ]),
      qPerson('suspect', 15, {
        chance: 0.4,
        radio: [
          T(
            '{callsign}: kaamerast tuvastati õpilane, {name}, isikukood {idcode}. Palun kontrolli.',
            '{callsign}: a pupil has been identified on camera, {name}, ID code {idcode}. Please check.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.45, 1],
        3,
        T(
          'Aine saadeti ekspertiisi, alustati menetlust NPALS § 15 järgi. Kooli kaasati noorsoopolitseinik.',
          'The substance was sent for analysis and proceedings opened under NPALS § 15. A youth officer is working with the school.',
        ),
        { trust: 1 },
      ),
      oc(
        'identified',
        'report',
        [0.65, 1],
        1,
        T(
          'Kaamerast tuvastati õpilane, kes koti tualetti jättis. Vanemaid ja lastekaitset teavitati.',
          'The pupil who left the bag in the toilets was identified on camera. Parents and child protection were informed.',
        ),
        { trust: 2 },
      ),
      oc(
        'harmless',
        'false_alarm',
        [0.2, 0.6],
        1,
        T(
          'Kiirtest narkootilist ainet ei näidanud, tegemist oli tõenäoliselt valuvaigistiga. Ekspertiis kinnitab.',
          'A field test showed no illegal drugs; it was probably a painkiller. The lab will confirm.',
        ),
      ),
      oc(
        'unknown',
        'report',
        [0, 0.4],
        2,
        T(
          'Kotike anti üle, kuid selle päritolu jäi selgusetuks.',
          'The bag was handed over but its origin remains unclear.',
        ),
      ),
    ],
    tags: ['drugs', 'school'],
    legacy: true,
  },
  {
    id: 'drugs_secret_meeting',
    category: 'drugs',
    code: 'RT',
    title: T('Salajane kokkusaamine', 'Secret meeting'),
    priority: 3,
    weight: 0.03,
    hours: 'night',
    places: ['industrial'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 1), un('criminal', 1)] },
    onScene: [40, 90],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 55], record: 0.7, wanted: 0.15, weapon: 0.1 },
      { role: 'suspect', gender: 'M', age: [25, 55], record: 0.5 },
      { role: 'caller', gender: 'any', age: [30, 75] },
    ],
    vehicles: [{ role: 'suspect', kind: 'van', stolen: 0.2, driverRole: 'suspect' }],
    summary: [
      T(
        '{address}. Kohalik elanik kahtlustab, et mahajäetud laohoones toimub ebaseaduslik relvakaup.',
        '{address}. A local resident suspects an illegal arms deal is taking place in an abandoned warehouse.',
      ),
      T(
        '{address}. Laohoone juurde saabusid öösel kaks sõidukit, mehed tassisid pikki pakke. Teataja kahtlustab relvi.',
        '{address}. Two vehicles arrived at a warehouse at night and men carried long packages inside. The caller suspects weapons.',
      ),
    ],
    callerLines: [
      T(
        'Seal vanas laos käivad öösiti mingid mehed. Täna tõid nad pikad kastid, nagu püssid.',
        'Some men go to that old warehouse at night. Tonight they brought long boxes, like rifles.',
      ),
      T(
        'Ma ei taha, et nad teaksid, kes helistas. Need ei ole kohalikud.',
        'I do not want them to know who called. They are not locals.',
      ),
    ],
    details: [
      T(
        'Laohoone ees seisab kaubik {car}, number {plate}.',
        'A {car} van, plate {plate}, is parked outside the warehouse.',
      ),
      T(
        'Teataja sõnul on mehed käinud laos kolmel ööl järjest, alati pärast keskööd.',
        'The caller says the men have come to the warehouse three nights running, always after midnight.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: laohoone juures kaks sõidukit, sees liigub inimesi. Kas sekkume kohe või jälgime ja ootame kriminaalpolitseid?',
            '{callsign}: two vehicles at the warehouse, people moving inside. Go in now or observe and wait for CID?',
          ),
        ],
        [
          opt(
            'engage',
            T('Sekkuge kohe', 'Go in now'),
            T(
              '{callsign}, juhtimine. Sekkuge, olge valmis relvaks.',
              '{callsign}, Control. Go in, be ready for weapons.',
            ),
            { success: 0.05, risk: 0.15 },
          ),
          opt(
            'observe',
            T('Jälgige, oodake kriminaalpolitseid', 'Observe, wait for CID'),
            T(
              '{callsign}, juhtimine. Jälgige varjatult, kriminaalpolitsei on teel.',
              '{callsign}, Control. Observe covertly, CID is on the way.',
            ),
            { time: 20, success: 0.1 },
          ),
        ],
        'observe',
      ),
      qVehicle(3),
      qPerson('suspect', 10, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        3,
        T(
          'Laohoonest leiti ebaseaduslikud tulirelvad ja laskemoon. Kaks isikut peeti kinni, alustati kriminaalmenetlust ebaseadusliku relvakäitlemise tunnustel.',
          'Illegal firearms and ammunition were found in the warehouse. Two people were detained; criminal proceedings opened for illegal handling of weapons.',
        ),
        { arrests: 2, trust: 5 },
      ),
      oc(
        'intel',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Kokkusaamine jäi ära, kuid sõidukid ja isikud tuvastati. Info edastati kriminaalpolitseile.',
          'The meeting did not happen, but the vehicles and people were identified. The information went to CID.',
        ),
      ),
      oc(
        'scrap',
        'unfounded',
        [0, 0.45],
        2,
        T(
          'Laos olid metallikogujad, relvadega seotud tegevust ei tuvastatud.',
          'The people in the warehouse were scrap collectors; no weapons-related activity was found.',
        ),
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.3],
        1,
        T(
          'Sõidukid lahkusid patrulli nähes, laohoone oli tühi.',
          'The vehicles left when they saw the patrol and the warehouse was empty.',
        ),
        { trust: -2 },
      ),
    ],
    tags: ['weapons', 'tip'],
    legacy: true,
  },
  {
    id: 'drugs_local_dealers',
    category: 'drugs',
    code: 'NA',
    title: T('Kohalikud narkodiilerid', 'Local drug dealers'),
    priority: 3,
    weight: 0.4,
    hours: 'evening',
    places: ['residential', 'street', 'park'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 1), un('criminal', 1)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 35], record: 0.6, wanted: 0.1 },
      { role: 'caller', gender: 'any', age: [30, 80], relation: 'neighbour' },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect', noInsurance: 0.15 }],
    summary: [
      T(
        '{address}. Kohalikud elanikud kahtlustavad, et naabruses tegutseb narkodiilerite võrgustik. Trepikojas käib öösiti pidevalt võõraid.',
        '{address}. Local residents suspect a network of drug dealers is operating in the neighbourhood. Strangers come and go in the stairwell all night.',
      ),
      T(
        '{address}. Maja taga parkiva auto juures käivad lühikest aega erinevad inimesed, raha ja pakid vahetavad omanikku.',
        '{address}. Different people keep visiting a car parked behind the building for a minute or two; money and packages change hands.',
      ),
    ],
    callerLines: [
      T(
        'Siin müüakse narkootikume, kõik teavad seda. Iga päev seisab see auto siin ja noored käivad juures.',
        'They are selling drugs here, everyone knows it. That car is here every day and young people keep going up to it.',
      ),
      T(
        'Trepikojas vedelevad süstlad ja öösel helistatakse kõigi uksekella.',
        'There are syringes lying in the stairwell and at night people ring every doorbell.',
      ),
    ],
    details: [
      T(
        'Auto: {car}, {plate}. Roolis on tavaliselt {suspect}.',
        'Car: {car}, {plate}. Usually driven by {suspect}.',
      ),
      T(
        'Kriminaalpolitseil on piirkonna kohta varasemat infot.',
        'CID already has intelligence on the area.',
      ),
    ],
    beats: [
      qVehicle('arrive'),
      qPerson('suspect', 5),
      backup(0.18, un('patrol'), {
        at: 6,
        radio: [
          T(
            '{callsign}: autos kolm meest, üks püüab põgeneda. Vajame teist patrulli!',
            '{callsign}: three men in the car, one is trying to run. We need a second patrol!',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        2,
        T(
          'Sõidukist leiti müügiks pakendatud narkootikumid ja sularaha. Juht peeti kinni, alustati kriminaalmenetlust KarS § 184 järgi.',
          'Drugs packaged for sale and cash were found in the car. The driver was detained; criminal proceedings opened under KarS § 184.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'small',
        'fine',
        [0.35, 0.75],
        3,
        T(
          'Isikult leiti väike kogus kanepit. Alustati väärteomenetlust NPALS § 15 järgi, info edastati kriminaalpolitseile.',
          'A small amount of cannabis was found on the man. Misdemeanour proceedings opened under NPALS § 15; the information went to CID.',
        ),
      ),
      oc(
        'nothing',
        'unfounded',
        [0, 0.45],
        2,
        T(
          'Kontrollil midagi ei leitud. Elanikele selgitati, kuidas vihjeid edastada.',
          'Nothing was found in the check. Residents were told how to pass on tips.',
        ),
      ),
    ],
    tags: ['drugs'],
    legacy: true,
  },
  {
    id: 'drugs_abandoned_factory',
    category: 'drugs',
    code: 'RT',
    title: T('Kahtlane tegevus mahajäetud tehases', 'Suspicious activity at an abandoned factory'),
    priority: 3,
    weight: 0.02,
    hours: 'night',
    places: ['industrial'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 2), un('criminal', 1)] },
    onScene: [40, 90],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 60], record: 0.6, weapon: 0.2 },
      { role: 'caller', gender: 'any', age: [30, 75] },
    ],
    summary: [
      T(
        '{address}. Inimesed käivad öösiti mahajäetud tehases, kostub masinate müra. Kahtlustatakse ebaseaduslikku relvatöökoda.',
        '{address}. People go to an abandoned factory at night and machine noise can be heard. An illegal weapons workshop is suspected.',
      ),
      T(
        '{address}. Vanast tehasehoonest kostab öösiti treipingi häält ja lasud tunduvad tulevat keldrist. Akende ees on kilekotid.',
        '{address}. At night a lathe can be heard in the old factory building and shots seem to come from the basement. The windows are covered with plastic.',
      ),
    ],
    callerLines: [
      T(
        'Seal pidi tühi tehas olema, aga igal ööl põlevad keldris tuled ja masinad töötavad.',
        'That factory is supposed to be empty, but every night the basement lights are on and machines are running.',
      ),
      T(
        'Eile kuulsin sealt paar pauku, nagu keegi prooviks relva.',
        'Yesterday I heard a couple of bangs from there, like someone testing a gun.',
      ),
    ],
    details: [
      T(
        'Tehase värav on uue tabalukuga, territooriumile on toodud generaator.',
        'The factory gate has a new padlock and a generator has been brought onto the site.',
      ),
      T('Teataja kirjeldab ühte meest: {suspect}.', 'The caller describes one man: {suspect}.'),
    ],
    beats: [
      backup(0.49, un('patrol'), { at: 3 }),
      choice(
        5,
        [
          T(
            '{callsign}: hoones on tuli ja masinamüra. Kas siseneme kohe või ootame kriminaalpolitseid ja läbiotsimisluba?',
            '{callsign}: lights and machine noise inside. Do we go in now or wait for CID and a search warrant?',
          ),
        ],
        [
          opt(
            'enter',
            T('Sisenege kohe', 'Go in now'),
            T(
              '{callsign}, juhtimine. Sisenege, oht relvadele.',
              '{callsign}, Control. Go in, weapons possible.',
            ),
            { success: 0.05, risk: 0.15 },
          ),
          opt(
            'wait',
            T('Oodake kriminaalpolitseid', 'Wait for CID'),
            T(
              '{callsign}, juhtimine. Piirake hoone, kriminaalpolitsei tuleb.',
              '{callsign}, Control. Contain the building, CID is coming.',
            ),
            { time: 25, success: 0.1 },
          ),
        ],
        'wait',
      ),
      qPerson('suspect', 15, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'workshop',
        'arrest',
        [0.65, 1],
        2,
        T(
          'Keldrist leiti relvatöökoda ja ümbertöödeldud gaasirelvad. Isik peeti kinni, alustati kriminaalmenetlust ebaseadusliku relvakäitlemise tunnustel.',
          'A weapons workshop and converted gas pistols were found in the basement. The man was detained; criminal proceedings opened for illegal handling of weapons.',
        ),
        { arrests: 1, trust: 5 },
      ),
      oc(
        'metal',
        'report',
        [0.35, 0.7],
        2,
        T(
          'Hoones lõigati varastatud metalli. Alustati kriminaalmenetlust, info edastati omanikule.',
          'Stolen metal was being cut up in the building. Criminal proceedings opened and the owner was informed.',
        ),
      ),
      oc(
        'airsoft',
        'unfounded',
        [0, 0.45],
        2,
        T(
          'Hoones mängisid noored õhkrelvadega, masinamüra tuli generaatorist. Neid hoiatati ja hoone suleti.',
          'Youngsters were playing with airsoft guns and the noise was a generator. They were warned and the building was sealed.',
        ),
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.3],
        1,
        T(
          'Hoone oli patrulli saabudes tühi, seadmed oli ära viidud.',
          'The building was empty when the patrol arrived and the equipment had been removed.',
        ),
        { trust: -2 },
      ),
    ],
    tags: ['weapons'],
    legacy: true,
  },

  // ─── Everyday drug-related call-outs ──────────────────────────────────────
  {
    id: 'drugs_intoxicated_person',
    category: 'drugs',
    code: 'NA',
    title: T('Narkojoobes isik', 'Person under the influence of drugs'),
    priority: 2,
    weight: 0.8,
    hours: 'nightlife',
    weekendBoost: 1.3,
    places: ['street', 'residential', 'park', 'busstation', 'trainstation'],
    units: { need: [un('patrol', 1)] },
    onScene: [30, 60],
    persons: [
      { role: 'suspect', gender: 'any', age: [17, 40], intoxicated: 0.95, record: 0.5, wanted: 0.05 },
      { role: 'caller', gender: 'any', age: [18, 75] },
    ],
    summary: [
      T(
        '{address}. Noormees käitub segaselt, karjub ja jookseb autode vahel. Kahtlus narkojoobele.',
        '{address}. A young man is behaving erratically, shouting and running between cars. Suspected drug intoxication.',
      ),
      T(
        '{address}. Trepikojas istub isik, pupillid ahenenud, ei reageeri adekvaatselt. Kõrval on süstal.',
        '{address}. A person is sitting in a stairwell with pinpoint pupils, not responding properly. A syringe lies nearby.',
      ),
    ],
    callerLines: [
      T(
        'Üks noormees jookseb keset teed, karjub, et keegi jälitab teda. Ta on vist millegi all.',
        'A young man is running down the middle of the road shouting that someone is after him. He must be on something.',
      ),
      T(
        'Trepikojas istub tüdruk, silmad on kinni ja ta kõigub. Kõrval on süstal.',
        'A girl is sitting in the stairwell, eyes closed and swaying. There is a syringe next to her.',
      ),
    ],
    details: [
      T('Isik: {suspect}.', 'Subject: {suspect}.'),
      T(
        'Teataja sõnul on isik endale haiget teinud, käel on verd.',
        'The caller says the person has hurt themselves; there is blood on their hand.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.6, reason: T('Võimalik üledoos', 'Possible overdose') }],
    beats: [
      qPerson('suspect', 'arrive'),
      kiirabi(2, {
        chance: 0.6,
        radio: [
          T(
            '{callsign}: isik segasusseisundis, kahtlus üledoosile. Palun kiirabi.',
            '{callsign}: subject confused, suspected overdose. Request an ambulance.',
          ),
        ],
      }),
      choice(
        6,
        [
          T(
            '{callsign}: isik on psühhoosilaadses seisundis. Kas toimetame kiirabiga haiglasse või peame kinni NPALS väärteo tõttu?',
            '{callsign}: subject is in a psychosis-like state. Send to hospital by ambulance, or detain for the drugs offence?',
          ),
        ],
        [
          opt(
            'hospital',
            T('Haiglasse', 'Hospital'),
            T(
              '{callsign}, juhtimine. Toimetage haiglasse, menetlus hiljem.',
              '{callsign}, Control. Take them to hospital, paperwork later.',
            ),
            { success: 0.1, time: 15, trust: 1 },
          ),
          opt(
            'detain',
            T('Pidage kinni', 'Detain'),
            T(
              '{callsign}, juhtimine. Pidage kinni, arstlik kontroll arestimajas.',
              '{callsign}, Control. Detain; medical check at the arrest house.',
            ),
            { time: 20 },
          ),
        ],
        'hospital',
      ),
    ],
    outcomes: [
      oc(
        'hospital',
        'hospital',
        [0.4, 1],
        3,
        T(
          'Isik toimetati kiirabiga haiglasse, alustati väärteomenetlust NPALS § 15 järgi.',
          'The person was taken to hospital by ambulance; misdemeanour proceedings opened under NPALS § 15.',
        ),
        { trust: 1 },
      ),
      oc(
        'fine',
        'fine',
        [0.45, 1],
        2,
        T(
          'Isikul tuvastati narkojoove, alustati väärteomenetlust NPALS § 15 järgi ja ta toimetati arestimajja kainenema.',
          'Drug intoxication was confirmed; misdemeanour proceedings opened under NPALS § 15 and the person was taken to the arrest house to sober up.',
        ),
      ),
      oc(
        'hurt',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Isik vigastas end enne patrulli saabumist ja toimetati haiglasse.',
          'The person injured themselves before the patrol arrived and was taken to hospital.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    interactiveChance: 0.15,
    call: {
      mood: 'confused',
      opening: [
        T(
          'Ee... siin on üks tüüp, ta on täiesti... ma ei tea, mis temaga on.',
          'Er... there is this guy here, he is totally... I do not know what is wrong with him.',
        ),
      ],
      openingRu: ['Тут парень какой-то неадекватный, кричит, бегает между машинами, похоже под кайфом.'],
      answers: {
        intoxicated: [
          T('Alkoholi lõhna pole, aga silmad on imelikud.', 'No smell of alcohol, but his eyes look weird.'),
        ],
        weapons: [T('Relva ma ei näe.', 'I do not see a weapon.')],
        injured: [
          T('Käsi veritseb, ta lõi vist vastu akent.', 'His hand is bleeding, I think he punched a window.'),
        ],
      },
    },
    tags: ['drugs'],
  },
  {
    id: 'drugs_syringes_playground',
    category: 'drugs',
    code: 'NA',
    title: T('Süstlad mänguväljakul', 'Syringes on a playground'),
    priority: 4,
    weight: 0.4,
    hours: 'day',
    places: ['park', 'residential', 'school'],
    units: { need: [un('any', 1)] },
    onScene: [15, 30],
    persons: [{ role: 'caller', gender: 'any', age: [25, 50], relation: 'parent' }],
    summary: [
      T(
        '{address}. Lapsevanem leidis mänguväljaku liivakastist mitu kasutatud süstalt.',
        '{address}. A parent found several used syringes in the playground sandpit.',
      ),
      T(
        '{address}. Lasteaia aia äärest leiti süstlaid ja tühje ravimiampulle. Lapsed on toas.',
        '{address}. Syringes and empty ampoules were found by the kindergarten fence. The children are indoors.',
      ),
    ],
    callerLines: [
      T(
        'Mu laps leidis liivakastist süstla! Õnneks ei torganud. Kes need ära koristab?',
        'My child found a syringe in the sandpit! Luckily he was not pricked. Who will clear these up?',
      ),
      T(
        'See ei ole esimene kord, öösel käivad siin narkomaanid.',
        'This is not the first time, drug users come here at night.',
      ),
    ],
    details: [T('Süstlaid on vähemalt {n}.', 'There are at least {n} syringes.')],
    referral: { agency: 'kov', chance: 0.5 },
    beats: [
      info('arrive', [
        T(
          '{callsign}, kohal. Liivakastis on {n} süstalt, kogume need ohutult kokku.',
          '{callsign}, on scene. {n} syringes in the sandpit, collecting them safely.',
        ),
      ]),
    ],
    outcomes: [
      oc(
        'cleared',
        'resolved',
        [0.4, 1],
        3,
        T(
          'Süstlad koguti ohutult kokku ja anti üle hävitamiseks. Omavalitsust teavitati.',
          'The syringes were collected safely and handed over for disposal. The municipality was notified.',
        ),
        { trust: 1 },
      ),
      oc(
        'kov',
        'referred',
        [0.2, 0.6],
        2,
        T(
          'Omavalitsuse heakorrateenistus koristas ala, piirkonnapolitseinik lisas koha patrullkaardile.',
          'The municipal maintenance service cleaned the area and the community officer added it to the patrol map.',
        ),
      ),
      oc(
        'pricked',
        'hospital',
        [0, 0.3],
        1,
        T(
          'Üks laps oli end enne patrulli saabumist süstlaga torganud ja saadeti arsti juurde kontrolli.',
          'A child had been pricked by a syringe before the patrol arrived and was sent to a doctor for a check.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    interactiveChance: 0.1,
    call: {
      mood: 'angry',
      opening: [
        T(
          'Mänguväljakul vedelevad jälle süstlad! Kas keegi teeb selle vastu midagi?',
          'There are syringes lying on the playground again! Is anyone going to do something about it?',
        ),
      ],
      openingRu: ['У нас во дворе на детской площадке опять шприцы валяются! Дети же там играют!'],
      answers: {
        count: [T('Viis-kuus tükki, võib-olla rohkem.', 'Five or six, maybe more.')],
        injured: [T('Ei, keegi ei saanud viga.', 'No, nobody got hurt.')],
        children: [
          T(
            'Lapsed on mänguväljakul, ma ajasin nad eemale.',
            'The kids are at the playground, I moved them away.',
          ),
        ],
      },
    },
    tags: ['drugs', 'children'],
  },
  {
    id: 'drugs_dealer_near_school',
    category: 'drugs',
    code: 'NA',
    title: T('Narkodiiler kooli juures', 'Drug dealer near a school'),
    priority: 3,
    weight: 0.25,
    hours: 'business',
    months: [1, 2, 3, 4, 5, 9, 10, 11, 12],
    places: ['school', 'park', 'busstation'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 1), un('community', 1)] },
    onScene: [30, 60],
    persons: [
      { role: 'suspect', gender: 'M', age: [17, 30], record: 0.5, wanted: 0.05 },
      { role: 'caller', gender: 'any', age: [25, 60], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Õpetajate teatel müüb noormees vahetundide ajal kooli taga õpilastele "midagi". Isik on praegu kohal.',
        '{address}. Teachers report a young man selling "something" to pupils behind the school during breaks. He is there now.',
      ),
      T(
        '{address}. Lapsevanem nägi, kuidas noormees andis bussipeatuses koolipoisile väikese paki raha eest.',
        '{address}. A parent saw a young man hand a schoolboy a small package for cash at the bus stop.',
      ),
    ],
    callerLines: [
      T(
        'Ta seisab iga päev seal kooli taga, õpilased käivad tema juures. Üks tüdruk ütles, et ta müüb tablette.',
        'He stands behind the school every day and pupils go up to him. One girl said he sells pills.',
      ),
      T(
        'Ma olen kooli direktor. Me ei taha last kahjustada, aga see peab lõppema.',
        'I am the head teacher. We do not want to harm any child, but this has to stop.',
      ),
    ],
    details: [
      T('Kirjeldus: {suspect}.', 'Description: {suspect}.'),
      T(
        'Noormehel on seljakott ja ta lahkub tavaliselt jalgrattaga.',
        'The young man has a backpack and usually leaves by bike.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: kahtlustatav suhtleb kooli ees õpilastega. Kas peame ta kohe kinni laste nähes või jälgime ja peame kinni eemal?',
            '{callsign}: the suspect is talking to pupils outside the school. Detain him now in front of the kids, or follow and detain him away from them?',
          ),
        ],
        [
          opt(
            'now',
            T('Pidage kohe kinni', 'Detain now'),
            T('{callsign}, juhtimine. Pidage kinni.', '{callsign}, Control. Detain him.'),
            { success: 0.05, trust: -1 },
          ),
          opt(
            'follow',
            T('Jälgige ja pidage kinni eemal', 'Follow and detain away from the kids'),
            T(
              '{callsign}, juhtimine. Jälgige, kinnipidamine eemal koolist.',
              '{callsign}, Control. Follow him, detain away from the school.',
            ),
            { time: 15, success: 0.1 },
          ),
        ],
        'follow',
      ),
      qPerson('suspect', 5),
      toArrest(10, { chance: 0.5 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Isikult leiti müügiks pakendatud kanepit ja tablette. Ta peeti kinni, alustati kriminaalmenetlust narkootikumide ebaseadusliku käitlemise tunnustel.',
          'Cannabis and pills packaged for sale were found on him. He was detained; criminal proceedings opened for illegal handling of narcotics.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'small',
        'fine',
        [0.35, 0.7],
        2,
        T(
          'Isikult leiti väike kogus kanepit. Alustati väärteomenetlust NPALS § 15 järgi, kooli teavitati.',
          'A small amount of cannabis was found on him. Misdemeanour proceedings opened under NPALS § 15 and the school was informed.',
        ),
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.4],
        2,
        T(
          'Noormees märkas patrulli ja põgenes jalgrattaga. Kirjeldus edastati kõigile ekipaažidele.',
          'The young man spotted the patrol and fled on his bike. His description was passed to all units.',
        ),
        { trust: -2 },
      ),
    ],
    tags: ['drugs', 'school', 'youth'],
  },
  {
    id: 'drugs_cannabis_grow',
    category: 'drugs',
    code: 'NA',
    title: T('Kanepikasvandus korteris', 'Cannabis grow in a flat'),
    priority: 4,
    weight: 0.3,
    hours: 'flat',
    places: ['residential', 'house'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 1), un('criminal', 1)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [22, 50], record: 0.4 },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naabri teatel levib korterist pidevalt tugev kanepilõhn, aknad on kaetud fooliumiga ja elektriarve tõusis ühistus.',
        '{address}. A neighbour reports a constant strong smell of cannabis from a flat; the windows are covered in foil and the building’s electricity bill has jumped.',
      ),
      T(
        '{address}. Trepikojas on tugev kanepilõhn, korteri ukse vahelt paistab lillat valgust ja kostab ventilaatorite huminat.',
        '{address}. Strong smell of cannabis in the stairwell; purple light shows under the flat door and fans can be heard humming.',
      ),
    ],
    callerLines: [
      T(
        'Terve trepikoda haiseb kanepi järele ja öösiti kostab ventilaatorite huminat.',
        'The whole stairwell stinks of cannabis and fans hum all night.',
      ),
      T(
        'Ma kardan tulekahju, seal on mingid lambid ja juhtmed igal pool.',
        'I am afraid of a fire, there are lamps and cables everywhere in there.',
      ),
    ],
    details: [
      T(
        'Korteri omanik on {suspectName}, naabrite sõnul seal keegi ei ela.',
        'The flat belongs to {suspectName}; neighbours say nobody lives there.',
      ),
      T(
        'Korteri uksel on lisalukk ja rõdul ventilatsioonitoru.',
        'The flat door has an extra lock and there is a ventilation pipe on the balcony.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: trepikojas tugev kanepilõhn, korteri uksel ventilatsioonitorud.',
          '{callsign}: strong cannabis smell in the stairwell, ventilation ducts by the flat door.',
        ),
      ]),
      choice(
        3,
        [
          T(
            '{callsign}: korteri omanik ust ei ava. Kas taotleme läbiotsimisluba või jätame jälgimisele ja edastame kriminaalpolitseile?',
            '{callsign}: the owner will not open up. Apply for a search warrant, or keep the flat under watch and pass it to CID?',
          ),
        ],
        [
          opt(
            'warrant',
            T('Taotlege läbiotsimisluba', 'Apply for a warrant'),
            T(
              '{callsign}, juhtimine. Taotleme loa, hoidke ust silmas.',
              '{callsign}, Control. We are applying for a warrant, keep the door under watch.',
            ),
            { time: 30, success: 0.15 },
          ),
          opt(
            'cid',
            T('Edastage kriminaalpolitseile', 'Pass it to CID'),
            T(
              '{callsign}, juhtimine. Vormistage teade, kriminaalpolitsei jätkab.',
              '{callsign}, Control. File the report, CID will take it from here.',
            ),
            { success: -0.1 },
          ),
        ],
        'cid',
      ),
      qPerson('suspect', 10, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'grow',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Korterist leiti kümnete taimedega kasvandus. Omanik peeti kinni, alustati kriminaalmenetlust KarS § 184 järgi.',
          'A grow with dozens of plants was found in the flat. The owner was detained; criminal proceedings opened under KarS § 184.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'cid',
        'report',
        [0.35, 0.7],
        2,
        T(
          'Info edastati kriminaalpolitseile, korter võeti jälgimisele.',
          'The information was passed to CID and the flat put under surveillance.',
        ),
      ),
      oc(
        'balcony',
        'unfounded',
        [0, 0.4],
        2,
        T(
          'Lõhn tuli rõdult, kus naaber suitsetas. Kasvandust ei leitud.',
          'The smell came from a balcony where a neighbour was smoking. No grow was found.',
        ),
      ),
    ],
    falseAlarmChance: 0.3,
    interactiveChance: 0.08,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Ma ei tea, kas see on hädaabi asi, aga meie trepikoda haiseb kanepi järele juba kuid.',
          'Hello. I do not know if this is an emergency, but our stairwell has smelt of cannabis for months.',
        ),
      ],
      answers: {
        when: [
          T('Juba paar kuud, aga eriti hull on öösiti.', 'A couple of months now, but it is worst at night.'),
        ],
        name: [
          T('Palun ärge öelge neile, et mina helistasin.', 'Please do not tell them it was me who called.'),
        ],
      },
    },
    tags: ['drugs'],
  },
  {
    id: 'drugs_party',
    category: 'drugs',
    code: 'NA',
    title: T('Narkootikumid peol', 'Drugs at a party'),
    priority: 3,
    weight: 0.4,
    hours: 'nightlife',
    weekendBoost: 1.6,
    places: ['residential', 'house', 'nightclub', 'summerhouse'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      { role: 'suspect', gender: 'M', age: [18, 30], intoxicated: 0.6, record: 0.35 },
      { role: 'victim', gender: 'any', age: [17, 25], intoxicated: 0.9 },
      { role: 'caller', gender: 'any', age: [17, 70] },
    ],
    summary: [
      T(
        '{address}. Peol tarvitatakse narkootikume, üks külaline on teadvuseta. Teised keelduvad kiirabi kutsumast.',
        '{address}. Drugs are being used at a party and one guest is unconscious. The others refuse to call an ambulance.',
      ),
      T(
        '{address}. Naabri teatel müüakse korteripeol "tablette", trepikojas käib pidevalt noori.',
        '{address}. A neighbour reports "pills" being sold at a flat party; young people keep coming and going in the stairwell.',
      ),
    ],
    callerLines: [
      T(
        'Mu sõbranna ei ärka üles! Ta võttis mingi tableti ja nüüd ta lihtsalt lamab.',
        'My friend will not wake up! She took some pill and now she is just lying there.',
      ),
      T(
        'Seal korteris käib pidu ja üks tüüp müüb kõigile mingeid tablette.',
        'There is a party in that flat and one guy is selling everyone pills.',
      ),
    ],
    details: [
      T('Arvatav müüja: {suspect}.', 'Suspected seller: {suspect}.'),
      T('Peol on ka alaealisi.', 'There are minors at the party.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.4, reason: T('Teadvuseta külaline', 'Unconscious guest') }],
    beats: [
      kiirabi('arrive', {
        chance: 0.4,
        radio: [
          T(
            '{callsign}: noor naine teadvuseta, hingab. Kiirabi kohe!',
            '{callsign}: young woman unconscious, breathing. Ambulance now!',
          ),
        ],
      }),
      qPerson('suspect', 3),
      choice(
        6,
        [
          T(
            '{callsign}: peolised hakkavad laiali minema. Kas kontrollime kõiki või keskendume müüjale?',
            '{callsign}: the partygoers are starting to leave. Check everyone or focus on the seller?',
          ),
        ],
        [
          opt(
            'all',
            T('Kontrollige kõiki', 'Check everyone'),
            T(
              '{callsign}, juhtimine. Kontrollige kõiki, alaealised eraldi.',
              '{callsign}, Control. Check everyone, minors separately.',
            ),
            { time: 25, success: 0.05 },
          ),
          opt(
            'dealer',
            T('Keskenduge müüjale', 'Focus on the seller'),
            T(
              '{callsign}, juhtimine. Keskenduge müüjale.',
              '{callsign}, Control. Concentrate on the seller.',
            ),
            { success: 0.1 },
          ),
        ],
        'dealer',
      ),
      toArrest(15, { chance: 0.5 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Müüjalt leiti MDMA tablette ja sularaha. Ta peeti kinni, alustati kriminaalmenetlust narkootikumide ebaseadusliku käitlemise tunnustel.',
          'MDMA pills and cash were found on the seller. He was detained; criminal proceedings opened for illegal handling of narcotics.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'fines',
        'fine',
        [0.35, 0.7],
        2,
        T(
          'Mitmele peolisele alustati väärteomenetlust NPALS § 15 järgi, alaealiste vanemaid teavitati.',
          'Misdemeanour proceedings under NPALS § 15 were opened against several partygoers; the minors’ parents were informed.',
        ),
      ),
      oc(
        'overdose',
        'hospital',
        [0, 0.4],
        2,
        T(
          'Teadvuseta noor toimetati haiglasse. Müüja lahkus enne patrulli saabumist.',
          'The unconscious young person was taken to hospital. The seller left before the patrol arrived.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    tags: ['drugs', 'youth'],
  },
  {
    id: 'drugs_weapon_deal_tip',
    category: 'drugs',
    code: 'RT',
    title: T('Relvatehingu vihje', 'Tip-off about an arms deal'),
    priority: 2,
    weight: 0.05,
    hours: 'evening',
    places: ['parking', 'gasstation', 'industrial', 'street'],
    units: { need: [un('any', 2)], ideal: [un('rapid', 1), un('criminal', 1)] },
    onScene: [40, 90],
    persons: [
      { role: 'suspect', gender: 'M', age: [25, 50], record: 0.7, wanted: 0.15, weapon: 0.15 },
      { role: 'suspect', gender: 'M', age: [20, 45], record: 0.5 },
      { role: 'caller', gender: 'any', age: [20, 70] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', stolen: 0.2, driverRole: 'suspect' }],
    summary: [
      T(
        '{address}. Anonüümse vihje kohaselt müüakse parklas sõidukist tulirelva. Tehing toimub järgmise poole tunni jooksul.',
        '{address}. An anonymous tip says a firearm is being sold from a car in a car park. The deal will happen in the next half hour.',
      ),
      T(
        '{address}. Teataja nägi, kuidas mees näitas teisele auto pagasnikus relva, raha vahetas omanikku.',
        '{address}. The caller saw a man show another a gun in his car boot; money changed hands.',
      ),
    ],
    callerLines: [
      T(
        'Ma nägin täiesti selgelt: tal oli pagasnikus püstol ja teine mees andis talle raha.',
        'I saw it clearly: he had a pistol in the boot and the other man gave him money.',
      ),
      T(
        'Ma ei ütle oma nime. Aga kui te kohe tulete, on nad veel seal.',
        'I will not give my name. But if you come right now they will still be there.',
      ),
    ],
    details: [
      T('Sõiduk: {car}, {plate}.', 'Vehicle: {car}, {plate}.'),
      T('Arvatav müüja: {suspect}.', 'Suspected seller: {suspect}.'),
    ],
    beats: [
      backup(0.6, un('rapid'), {
        at: 'arrive',
        radio: [
          T(
            '{callsign}: kahtlus tulirelvale, vajame kiirreageerijaid!',
            '{callsign}: firearm suspected, we need rapid response!',
          ),
        ],
      }),
      qVehicle('arrive'),
      choice(
        3,
        [
          T(
            '{callsign}: kahtlustatavad on autos, relv tõenäoliselt pagasnikus. Kas blokeerime sõiduki kohe või ootame kiirreageerijaid?',
            '{callsign}: the suspects are in the car, the gun probably in the boot. Box the car in now or wait for rapid response?',
          ),
        ],
        [
          opt(
            'block',
            T('Blokeerige kohe', 'Box in now'),
            T(
              '{callsign}, juhtimine. Blokeerige sõiduk, käsklused selgelt.',
              '{callsign}, Control. Box the car in, clear commands.',
            ),
            { success: 0.1, risk: 0.15 },
          ),
          opt(
            'wait',
            T('Oodake kiirreageerijaid', 'Wait for rapid response'),
            T(
              '{callsign}, juhtimine. Jälgige, kiirreageerijad on teel.',
              '{callsign}, Control. Observe, rapid response is on the way.',
            ),
            { time: 10, success: 0.05 },
          ),
        ],
        'wait',
      ),
      pursuit(
        5,
        [
          T(
            '{callsign}: sõiduk {plate} lahkub kiirendades, alustame jälitust!',
            '{callsign}: vehicle {plate} is speeding off, starting pursuit!',
          ),
        ],
        0.2,
      ),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Sõidukist leiti registreerimata püstol ja laskemoon. Kaks isikut peeti kinni, alustati kriminaalmenetlust ebaseadusliku relvakäitlemise tunnustel.',
          'An unregistered pistol and ammunition were found in the car. Two people were detained; criminal proceedings opened for illegal handling of weapons.',
        ),
        { arrests: 2, trust: 5 },
      ),
      oc(
        'intel',
        'report',
        [0.35, 0.7],
        2,
        T(
          'Relva ei leitud, kuid isikud tuvastati. Info edastati kriminaalpolitseile.',
          'No gun was found, but the people were identified. The information was passed to CID.',
        ),
      ),
      oc(
        'false',
        'unfounded',
        [0, 0.45],
        2,
        T(
          'Selgus, et müüdi õhkrelva koos dokumentidega. Ebaseaduslikku tegevust ei tuvastatud.',
          'It turned out an airsoft gun was being sold with its paperwork. No illegal activity was found.',
        ),
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.3],
        1,
        T(
          'Sõiduk lahkus enne patrulli saabumist. See on tagaotsitav.',
          'The car left before the patrol arrived. It is on the BOLO list.',
        ),
        { trust: -2 },
      ),
    ],
    tags: ['weapons', 'armed', 'tip', 'vehicle_flee'],
  },
  {
    id: 'drugs_overdose_stairwell',
    category: 'drugs',
    code: 'NA',
    title: T('Üledoos trepikojas', 'Overdose in a stairwell'),
    priority: 1,
    weight: 0.25,
    hours: 'night',
    places: ['residential', 'busstation', 'park'],
    units: { need: [un('any', 1)] },
    onScene: [20, 50],
    persons: [
      { role: 'victim', gender: 'any', age: [18, 45], intoxicated: 1, record: 0.4 },
      { role: 'caller', gender: 'any', age: [18, 70] },
    ],
    summary: [
      T(
        '{address}. Trepikojas lamab noormees teadvuseta, hingab harva, kõrval on süstal. Kiirabi väljas.',
        '{address}. A young man is lying unconscious in a stairwell, breathing slowly, a syringe beside him. Ambulance dispatched.',
      ),
      T(
        '{address}. Teataja leidis sõbra korterist reageerimatuna ja kahtlustab üledoosi. Teataja on paanikas.',
        '{address}. The caller found a friend unresponsive in a flat and suspects an overdose. The caller is panicking.',
      ),
    ],
    callerLines: [
      T(
        'Ta ei hinga peaaegu üldse! Huuled on sinised, palun kiiresti!',
        'He is barely breathing! His lips are blue, please hurry!',
      ),
      T(
        'Me olime koos ja ta süstis... nüüd ta ei ärka.',
        'We were together and he injected... now he will not wake up.',
      ),
    ],
    details: [
      T('Teataja sõnul tarvitas kannatanu fentanüüli.', 'The caller says the victim used fentanyl.'),
      T('Kannatanu on politseile varem tuttav.', 'The victim is known to police.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Üledoos', 'Overdose') }],
    beats: [
      kiirabi('arrive', {
        radio: [
          T(
            '{callsign}, kohal. Isik ei hinga normaalselt, alustame elustamist. Kiirabi ETA?',
            '{callsign}, on scene. Subject not breathing normally, starting CPR. Ambulance ETA?',
          ),
        ],
      }),
      qPerson('victim', 10, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'revived',
        'hospital',
        [0.3, 1],
        3,
        T(
          'Isik toodi elustamisega teadvusele ja kiirabi toimetas ta haiglasse.',
          'The man was revived with CPR and taken to hospital by ambulance.',
        ),
        { trust: 3 },
      ),
      oc(
        'refused',
        'resolved',
        [0.6, 1],
        1,
        T(
          'Kiirabi manustas vastumürki, isik toibus ja keeldus haiglasse minemast.',
          'Paramedics gave an antidote; the man came round and refused to go to hospital.',
        ),
      ),
      oc(
        'died',
        'tragedy',
        [0, 0.35],
        2,
        T(
          'Isikut ei õnnestunud elustada. Surma asjaolude selgitamiseks alustati menetlust.',
          'The man could not be revived. Proceedings were opened to establish the circumstances of death.',
        ),
        { injuries: 1, trust: -3 },
      ),
    ],
    interactiveChance: 0.35,
    call: {
      mood: 'panic',
      opening: [
        T('Ta ei hinga! Ma arvan, et see on üledoos!', 'He is not breathing! I think it is an overdose!'),
      ],
      openingRu: ['Тут парень не дышит, кажется передоз, шприц рядом!'],
      answers: {
        injured: [T('Ta on teadvuseta, huuled sinised.', 'He is unconscious, his lips are blue.')],
        intoxicated: [T('Ta süstis midagi, ma ei tea mida.', 'He injected something, I do not know what.')],
        where: [
          T(
            'Trepikojas, kolmanda korruse mademel. {address}.',
            'In the stairwell, on the third-floor landing. {address}.',
          ),
        ],
      },
    },
    tags: ['drugs'],
  },
  {
    id: 'drugs_car_smell',
    category: 'drugs',
    code: 'NA',
    title: T('Kanepilõhn sõidukist', 'Cannabis smell from a car'),
    priority: 4,
    weight: 0.35,
    hours: 'evening',
    places: ['parking', 'street', 'beach', 'gasstation'],
    units: { need: [un('patrol', 1)] },
    onScene: [15, 35],
    persons: [
      { role: 'driver', gender: 'M', age: [18, 30], intoxicated: 0.4, noLicense: 0.1, record: 0.25 },
      { role: 'caller', gender: 'any', age: [20, 75] },
    ],
    vehicles: [{ role: 'involved', kind: 'car', driverRole: 'driver', noInspection: 0.15 }],
    summary: [
      T(
        '{address}. Parklas seisab sõiduauto, mille aknast tuleb kanepisuitsu. Autos 3-4 noort.',
        '{address}. A car is parked with cannabis smoke coming out of the window. Three or four young people inside.',
      ),
      T(
        '{address}. Teataja sõnul suitsetavad noored autos kanepit ja kavatsevad ära sõita. Auto: {car}.',
        '{address}. The caller says young people are smoking cannabis in a car and are about to drive off. Car: {car}.',
      ),
    ],
    callerLines: [
      T(
        'Siin parklas haiseb kogu ümbrus kanepi järele, see tuleb sellest autost.',
        'The whole car park smells of cannabis, it is coming from that car.',
      ),
      T(
        'Nad suitsetavad ja siis tahavad veel sõita. See on ju ohtlik!',
        'They are smoking and then they want to drive. That is dangerous!',
      ),
    ],
    details: [T('Auto number {plate}.', 'The car is {plate}.')],
    beats: [qVehicle('arrive'), qPerson('driver', 3)],
    outcomes: [
      oc(
        'fine',
        'fine',
        [0.45, 1],
        3,
        T(
          'Autost leiti väike kogus kanepit. Alustati väärteomenetlust NPALS § 15 järgi.',
          'A small amount of cannabis was found in the car. Misdemeanour proceedings opened under NPALS § 15.',
        ),
      ),
      oc(
        'driver',
        'report',
        [0.65, 1],
        1,
        T(
          'Juhil tuvastati narkojoove, ta kõrvaldati juhtimiselt ja saadeti ekspertiisi. Menetlus jätkub.',
          'The driver was found to be under the influence of drugs, was stopped from driving and sent for testing. Proceedings continue.',
        ),
        { trust: 2 },
      ),
      oc(
        'warning',
        'warning',
        [0.2, 0.55],
        2,
        T('Kanepit ei leitud, noori hoiatati.', 'No cannabis was found; the young people were warned.'),
      ),
      oc(
        'gone',
        'unfounded',
        [0, 0.35],
        2,
        T('Auto oli patrulli saabudes lahkunud.', 'The car had left by the time the patrol arrived.'),
      ),
    ],
    expiresMin: 40,
    tags: ['drugs', 'vehicle'],
  },
];
