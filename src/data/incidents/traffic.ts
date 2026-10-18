/**
 * Liiklus: traffic incidents (incidents-C).
 * Legacy titles covered: Autoavarii, Purjus autojuht, Loata rallivõistlus, Jalakäija vigastamine,
 * Valgustamata jalgrattur öösel, Rongilt alla kukkunud inimene.
 */
import type { IncidentScenario, IncidentTemplate } from '@/sim/types';
import {
  T,
  u,
  out,
  qPerson,
  qVehicle,
  backup,
  agency,
  transport,
  info,
  pursuit,
  search,
  choice,
  opt,
  breathRefusal,
  pursuitDecision,
  R_DRIVER,
} from './_helpers_c';

const B_PATROL = [
  T('{callsign}: osaline muutub agressiivseks, vajame lisapatrulli!', '{callsign}: one of the parties is getting aggressive, we need another patrol!'),
  T('{callsign}, JK-le. Rahvast koguneb, palun teine ekipaaž appi.', '{callsign} to Control. A crowd is gathering, please send a second unit.'),
];

const T_ARREST = [
  T('{callsign}: toimetame kinnipeetu arestimajja.', '{callsign}: taking the detainee to the arrest house.'),
  T('{callsign}, kinnipeetu peal, suundume arestimaja poole.', '{callsign}, detainee on board, heading for the arrest house.'),
];

const A_KIIRABI = [
  T('{callsign}: kannatanul vigastused, kinnitage kiirabi tulek!', '{callsign}: there are injuries, confirm an ambulance is coming!'),
  T('JK, {callsign}. Anname esmaabi, vajame kiirabi.', 'Control, {callsign}. Giving first aid, we need an ambulance.'),
];

// ─── Scenarios: one coherent story per incident (IncidentTemplate.scenarios) ──

// ── traffic_joobes_juhi_kahtlus ─────────────────────────────────────────────
const SC_DUI_SUSPICION: IncidentScenario[] = [
  {
    id: 'weaving_lanes',
    summary: [
      T(
        '{address}. Joobes juhi kahtlus: {car}, numbrimärk {plate}, looklev sõit, liigub {direction}. Teataja sõidab järel.',
        '{address}. Suspected drunk driver: {car}, plate {plate}, weaving, heading {direction}. The caller is following.',
      ),
      T(
        '{address}. Teataja sõidab sõiduki {plate} taga. Auto kõigub rajalt rajale ja pidurdab põhjuseta. Kiirus 50-110 km/h.',
        '{address}. The caller is driving behind vehicle {plate}. The car is swerving between lanes and braking for no reason. Speed 50-110 km/h.',
      ),
    ],
    callerLines: [
      T('Ma sõidan ühe auto taga, ta on kindlasti purjus! Kogu aeg üle keskjoone!', 'I am driving behind a car, he is definitely drunk! Over the centre line the whole time!'),
      T('Number on {plate}. Ta just sõitis peaaegu kraavi ja jätkab, me oleme {direction}.', 'The plate is {plate}. He nearly went into the ditch just now and carried on, we are heading {direction}.'),
    ],
    details: [
      T('Teataja jätab ohutu vahemaa ja annab asukohta jooksvalt.', 'The caller is keeping a safe distance and giving updates on the location.'),
      T('Sõiduk: {car}, reg nr {plate}.', 'Vehicle: {car}, plate {plate}.'),
    ],
  },
  {
    id: 'onto_the_verge',
    summary: [
      T(
        '{address}. Teataja sõnul sõitis {car} ({plate}) teepeenrale ja tagasi, ohustab vastutulijaid. Teataja on liinil.',
        '{address}. The caller says {car} ({plate}) drove onto the verge and back and is endangering oncoming traffic. The caller is on the line.',
      ),
      T(
        '{address}. Sõiduk {plate} kaldus kaks korda teepeenrale, vastutulijad pidid kõrvale põikama. Teataja hoiab vahet.',
        '{address}. Vehicle {plate} veered onto the verge twice and oncoming drivers had to swerve. The caller is keeping back.',
      ),
    ],
    callerLines: [
      T('Ma ei taha lähemale minna, aga ta sõidab nagu oleks magama jäämas.', 'I do not want to get closer, but he is driving like he is falling asleep.'),
      T('Vastutulev auto pidi kraavi poole põikama, see lõpeb halvasti!', 'An oncoming car had to swerve towards the ditch, this is going to end badly!'),
    ],
    details: [
      T('Viimati nähti sõidukit tankla juures.', 'The vehicle was last seen at a petrol station.'),
      T('Sõiduk liigub {direction}.', 'The vehicle is heading {direction}.'),
    ],
  },
  {
    id: 'asleep_at_lights',
    title: T('Joobes juhi kahtlus: juht magab roolis', 'Suspected drunk driver asleep at the wheel'),
    summary: [
      T(
        '{address}. Foori taga seisab auto, roheline tuli on mitu korda vahetunud ja juht magab roolis. Mootor töötab. Sõiduk: {car}.',
        '{address}. A car is stopped at the lights; they have turned green several times and the driver is asleep at the wheel. Engine running. Vehicle: {car}.',
      ),
      T(
        '{address}. Ristmikul seisab sõiduk {plate} keset sõidurada, juht on rooli peale vajunud ega reageeri signaalidele.',
        '{address}. Vehicle {plate} is stopped in the middle of a lane at a junction; the driver is slumped over the wheel and does not react to horns.',
      ),
    ],
    callerLines: [
      T('Ta seisab rohelise tule all ja magab. Ma signaalitasin, aga ta ei liiguta.', 'He is sitting at a green light asleep. I honked, but he does not move.'),
      T('Mootor käib ja jalg on vist piduri peal. Ma kardan, et ta sõidab ärgates kellelegi otsa.', 'The engine is running and I think his foot is on the brake. I am afraid he will hit someone when he wakes up.'),
    ],
    details: [
      T('Sõiduk seisab, mootor töötab, juht ei reageeri.', 'The vehicle is stationary with the engine running; the driver is not responding.'),
      T('Sõiduk: {car}, reg nr {plate}.', 'Vehicle: {car}, plate {plate}.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.3, reason: T('Juht ei reageeri', 'The driver is not responding') }],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: juht magab roolis, mootor töötab. Kas avame ukse ja võtame võtmed või ootame kiirabi?',
            '{callsign}: the driver is asleep at the wheel with the engine running. Do we open the door and take the keys or wait for the ambulance?',
          ),
        ],
        [
          opt(
            'keys',
            T('Avage uks, võtke võtmed', 'Open the door, take the keys'),
            T('{callsign}, juhtimine. Võtke võtmed ja kontrollige juhi seisundit.', '{callsign}, Control. Take the keys and check the driver’s condition.'),
            { success: 0.15 },
          ),
          opt(
            'wait',
            T('Oodake kiirabi', 'Wait for the ambulance'),
            T('{callsign}, juhtimine. Tõkestage auto ja oodake kiirabi.', '{callsign}, Control. Block the car in and wait for the ambulance.'),
            { time: 8, success: -0.05 },
          ),
        ],
        'keys',
        { timeoutMin: 3 },
      ),
      qVehicle(2),
      qPerson('driver', 4, { radio: R_DRIVER }),
      breathRefusal(8, 0.25),
    ],
    outcomes: [
      out(
        'crime',
        'arrest',
        [0.5, 1],
        3,
        T(
          'Juht äratati ja võtmed võeti ära. Joove oli kriminaalses ulatuses, alustati kriminaalmenetlust KarS § 424 järgi ja sõiduk teisaldati.',
          'The driver was woken and the keys taken. He was over the criminal limit; criminal proceedings were opened under KarS § 424 and the car was towed.',
        ),
        { arrests: 1, trust: 3 },
      ),
      out(
        'medical',
        'hospital',
        [0.3, 1],
        2,
        T(
          'Selgus, et juht ei olnud joobes, vaid kaotas madala veresuhkru tõttu teadvuse. Kiirabi toimetas ta haiglasse.',
          'It turned out the driver was not drunk but had passed out from low blood sugar. The ambulance took him to hospital.',
        ),
        { trust: 1 },
      ),
      out(
        'drove_off',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Juht ärkas enne patrulli saabumist ja sõitis minema. Numbrimärk edastati ekipaažidele, omanikku külastatakse elukohas.',
          'The driver woke before the patrol arrived and drove off. The plate was passed to the units and the owner will be visited at home.',
        ),
        { trust: -2 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [T('Tere, ristmikul seisab auto ja juht magab roolis, mootor töötab.', 'Hello, there is a car stopped at the junction and the driver is asleep at the wheel with the engine running.')],
      openingRu: ['Здравствуйте, на перекрёстке стоит машина, водитель спит за рулём, мотор работает.'],
      answers: {
        vehicle: [T('{car}, number {plate}.', '{car}, plate {plate}.')],
        direction: [T('Ta ei liigu kuhugi, seisab foori all.', 'He is not going anywhere, he is stopped at the lights.')],
        injured: [T('Ma ei tea, ta lihtsalt ei liiguta.', 'I do not know, he just is not moving.')],
      },
    },
  },
  {
    id: 'drive_through',
    title: T('Joobes juhi kahtlus: kiirtoidukoha autoteenindusest', 'Suspected drunk driver from a drive-through'),
    summary: [
      T(
        '{address}. Kiirtoidukoha autoteeninduse töötaja teatel on juht ilmselgelt purjus: pillas raha maha, ajas sõnu segi ja sõitis äärekivile. Sõiduk: {car}.',
        '{address}. A drive-through worker reports the driver is obviously drunk: he dropped his money, slurred his words and drove onto the kerb. Vehicle: {car}.',
      ),
      T(
        '{address}. Autoteenindusest lahkus sõiduk {plate}, juht haises alkoholi järele ja sõitis vastu postikest.',
        '{address}. Vehicle {plate} left the drive-through; the driver smelled of alcohol and hit a bollard on the way out.',
      ),
    ],
    callerLines: [
      T('Ta ei suutnud kaarti lugejasse panna ja haises nagu õllevaat. Nüüd sõitis ta minema!', 'He could not get his card into the reader and stank like a beer barrel. Now he has driven off!'),
      T('Ta keeras välja {direction}, number on {plate}.', 'He turned out {direction}, the plate is {plate}.'),
    ],
    details: [
      T('Teataja on kiirtoidukoha töötaja, salvestis on olemas.', 'The caller works at the fast food restaurant; there is a recording.'),
      T('Sõiduk: {car}, reg nr {plate}, liigub {direction}.', 'Vehicle: {car}, plate {plate}, heading {direction}.'),
    ],
    call: {
      mood: 'calm',
      opening: [T('Tere, ma töötan kiirtoidukohas. Üks juht oli täiesti purjus ja sõitis just minema.', 'Hello, I work at a fast food place. A driver was completely drunk and has just driven off.')],
      openingRu: ['Здравствуйте, я работаю в фастфуде. Водитель был совсем пьяный и только что уехал.'],
      answers: {
        vehicle: [T('{car}, number {plate}.', '{car}, plate {plate}.')],
        direction: [T('Ta sõitis {direction}.', 'He drove off {direction}.')],
        where: [T('Me oleme {address}, ta lahkus just meie juurest.', 'We are at {address}, he has just left us.')],
      },
    },
  },
  {
    id: 'clipped_mirror',
    summary: [
      T(
        '{address}. Teataja sõnul riivas {car} tema küljepeeglit ja jätkas sõitu siksakis. Teataja sõidab järel.',
        '{address}. The caller says {car} clipped his wing mirror and carried on weaving down the road. The caller is following.',
      ),
      T(
        '{address}. Vastu tulnud sõiduk {plate} lõhkus teataja küljepeegli ega peatunud, liigub ebakindlalt {direction}.',
        '{address}. An oncoming vehicle, {plate}, smashed the caller’s wing mirror and did not stop; it is moving erratically {direction}.',
      ),
    ],
    callerLines: [
      T('Ta sõitis mu peeglist läbi ega peatunudki! Ta kõigub mööda teed.', 'He took my mirror off and did not even stop! He is swaying all over the road.'),
      T('Ma sõidan tal järel, aga hoian vahet. Vahepeal sõidab ta vastassuunas.', 'I am following him but keeping back. Every now and then he drives on the wrong side.'),
    ],
    details: [
      T('Teataja sõidukil on lõhutud küljepeegel.', 'The caller’s car has a broken wing mirror.'),
      T('Sõiduk: {car}, reg nr {plate}.', 'Vehicle: {car}, plate {plate}.'),
    ],
  },
];

// ── traffic_lo_varaline ─────────────────────────────────────────────────────
const SC_MINOR_CRASH: IncidentScenario[] = [
  {
    id: 'rear_end_lights',
    summary: [
      T('{address}. Tagant otsasõit fooris, {car} ja teine sõiduauto. Osalised ei jõua kokkuleppele.', '{address}. Rear-end collision at traffic lights involving {car} and another car. The parties cannot agree.'),
      T(
        '{address}. Foori taga sõitis sõiduauto eesseisjale tagant sisse, juhid vaidlevad, kes on süüdi. Vigastusi pole.',
        '{address}. A car ran into the back of another at the lights and the drivers are arguing about who is to blame. No injuries.',
      ),
    ],
    callerLines: [
      T('Mulle sõideti fooris tagant sisse ja teine juht väidab, et mina pidurdasin järsult!', 'Someone drove into the back of me at the lights and the other driver claims I braked suddenly!'),
      T('Ma seisin punase tule taga ja siis tuli pauk. Tema ajab süü minu kaela.', 'I was waiting at a red light and then came the bang. He is putting the blame on me.'),
    ],
    details: [
      T('Tagumise sõiduki esituli ja kapott on kahjustatud.', 'The car behind has a damaged headlight and bonnet.'),
      T('Mõlemad sõidukid on sõidurajal, liiklus on aeglane.', 'Both cars are in the lane and traffic is slow.'),
    ],
  },
  {
    id: 'junction_no_give_way',
    summary: [
      T('{address}. Ristmikul kokkupõrge, üks sõiduk ei andnud teed. Vigastusi pole, liiklus aeglane.', '{address}. Collision at a junction, one vehicle failed to give way. No injuries, traffic slow.'),
      T(
        '{address}. Kõrvalteelt tulnud sõiduk sõitis peateel liikujale külje pealt sisse. Juhid ei suuda kokkuleppele jõuda.',
        '{address}. A car coming out of a side road hit a car on the main road side-on. The drivers cannot reach an agreement.',
      ),
    ],
    callerLines: [
      T('Meil oli väike avarii, keegi viga ei saanud, aga teine osapool ei taha kokkuleppeblanketti täita.', 'We had a small accident, nobody is hurt, but the other driver does not want to fill in the agreement form.'),
      T('Tema tuli kõrvalteelt ja sõitis mulle külje pealt sisse!', 'He came out of the side road and drove into the side of me!'),
    ],
    details: [
      T('Teine juht räägib vaid vene keelt.', 'The other driver only speaks Russian.'),
      T('Ühel sõidukil on kahjustatud uks ja tiib.', 'One car has a damaged door and wing.'),
    ],
  },
  {
    id: 'car_park_reversing',
    title: T('Liiklusõnnetus parklas', 'Collision in a car park'),
    summary: [
      T('{address}. Parklas tagurdas sõiduk vastu teist autot, juhid vaidlevad, kes on süüdi.', '{address}. A car reversed into another in a car park and the drivers are arguing about who is at fault.'),
      T(
        '{address}. Kaupluse parklas põrkasid kaks tagurdavat autot kokku, juhid kisavad teineteise peale.',
        '{address}. Two cars reversing in a shop car park hit each other and the drivers are shouting at each other.',
      ),
    ],
    callerLines: [
      T('Me mõlemad tagurdasime ja põrkasime kokku. Tema ütleb, et mina ei vaadanud.', 'We were both reversing and bumped into each other. He says I was not looking.'),
      T('Ta ei taha kokkuleppeblanketti täita ja ähvardab lihtsalt minema sõita.', 'He does not want to fill in the agreement form and is threatening to just drive off.'),
    ],
    details: [
      T('Kahju on väike, mõlemal autol on tagaosa mõlkis.', 'The damage is minor; both cars have dented rears.'),
      T('Parklas on valvekaamera.', 'There is a CCTV camera in the car park.'),
    ],
    call: {
      mood: 'angry',
      opening: [T('Tere, parklas põrkasime teise autoga kokku ja ta ei taha blanketti täita.', 'Hello, I bumped into another car in the car park and he will not fill in the form.')],
      openingRu: ['Здравствуйте, на парковке столкнулись с другой машиной, а он не хочет заполнять бланк.'],
      answers: {
        injured: [T('Ei, keegi viga ei saanud.', 'No, nobody is hurt.')],
        vehicle: [T('Tema auto on {car}, number {plate}.', 'His car is a {car}, plate {plate}.')],
      },
    },
  },
  {
    id: 'rental_tourist',
    title: T('Liiklusõnnetus: välismaalasest rendiautojuht', 'Collision with a foreign tourist in a hire car'),
    summary: [
      T(
        '{address}. Rendiautoga välismaalane põrkas kokku kohaliku juhiga, ühist keelt pole ja kokkulepet ei saa vormistada.',
        '{address}. A foreigner in a hire car collided with a local driver; they have no common language and cannot complete an agreement form.',
      ),
      T(
        '{address}. Turist sõitis rendiautoga ringristmikul teise autoga kokku. Juhid ei saa teineteisest aru.',
        '{address}. A tourist in a hire car collided with another car on a roundabout. The drivers cannot understand each other.',
      ),
    ],
    callerLines: [
      T('Teine juht räägib ainult inglise keelt ja näitab rendifirma pabereid. Ma ei saa aru, mida ta tahab.', 'The other driver only speaks English and keeps showing me the hire company papers. I do not understand what he wants.'),
      T('Ta ei teadnud vist, et ringil tuleb teed anda.', 'I do not think he knew you have to give way on the roundabout.'),
    ],
    details: [
      T('Üks juht on välisturist, sõiduk on renditud.', 'One driver is a foreign tourist in a hire car.'),
      T('Kahju on väike, vigastusi pole.', 'The damage is minor and nobody is injured.'),
    ],
    call: {
      mood: 'calm',
      opening: [T('Tere, meil oli väike avarii turistiga, me ei saa teineteisest üldse aru.', 'Hello, we had a small accident with a tourist and we cannot understand each other at all.')],
      openingRu: ['Здравствуйте, у нас небольшая авария с туристом, мы совсем не понимаем друг друга.'],
      answers: { injured: [T('Ei, keegi viga ei saanud.', 'No, nobody is hurt.')] },
    },
  },
  {
    id: 'narrow_street_mirrors',
    title: T('Liiklusõnnetus kitsal tänaval', 'Collision on a narrow street'),
    summary: [
      T(
        '{address}. Kitsal tänaval riivasid kaks sõidukit teineteist, üks juht sõitis edasi, kuid tuli teataja nõudmisel tagasi.',
        '{address}. Two cars clipped each other on a narrow street; one driver carried on but came back when the caller insisted.',
      ),
      T(
        '{address}. Vastassuundades sõitnud autod lõhkusid teineteise küljepeeglid. Juhid vaidlevad, kes oleks pidanud ootama.',
        '{address}. Two cars travelling in opposite directions smashed each other’s wing mirrors. The drivers are arguing about who should have waited.',
      ),
    ],
    callerLines: [
      T('Ta sõitis mu peeglist läbi ja tahtis edasi sõita, ma pidin talle järele signaalitama.', 'He took my mirror off and wanted to keep going, I had to honk after him.'),
      T('Tänav on kitsas, aga tema kihutas nagu oma õuel.', 'The street is narrow, but he was speeding like it was his own yard.'),
    ],
    details: [
      T('Mõlemal sõidukil on lõhutud küljepeegel.', 'Both cars have broken wing mirrors.'),
      T('Üks juht üritas sündmuskohalt lahkuda.', 'One driver tried to leave the scene.'),
    ],
  },
];

// ── traffic_autoavarii (legacy "Autoavarii") ────────────────────────────────
const SC_DUI_CRASH: IncidentScenario[] = [
  {
    id: 'barely_standing',
    summary: [
      T(
        '{address}. Kahe sõiduauto kokkupõrge, teataja hinnangul on üks juhtidest joobes. Vigastusi teadaolevalt ei ole, sõidukid takistavad liiklust.',
        '{address}. Two cars have collided and the caller thinks one of the drivers is drunk. No known injuries; the cars are blocking traffic.',
      ),
      T(
        '{address}. Kaks autot põrkasid kokku. Üks juht kõnnib ebakindlalt ja lõhnab alkoholi järele, osalised vaidlevad.',
        '{address}. Two cars collided. One driver is unsteady on his feet and smells of alcohol; the parties are arguing.',
      ),
    ],
    callerLines: [
      T('Siin põrkasid kaks autot kokku ja see üks juht on täiesti purjus, vaevu seisab püsti!', 'Two cars have crashed here and one of the drivers is completely drunk, he can barely stand!'),
      T('Ta vaarub auto ümber ja räägib, et midagi ei juhtunud.', 'He is staggering around his car saying nothing happened.'),
    ],
    details: [
      T('Teataja jälgib süüdlast eemalt ja jääb kohale.', 'The caller is watching the driver at fault from a distance and is staying at the scene.'),
      T('Ühest sõidukist lekib vedelikku, üks sõidurada on suletud.', 'One car is leaking fluid and one lane is closed.'),
    ],
  },
  {
    id: 'trying_to_leave',
    summary: [
      T(
        '{address}. LÕ, 2 sõidukit. Süüdi oleva sõiduki ({car}) juht on teataja sõnul ilmselt joobes ja üritab lahkuda.',
        '{address}. Collision, 2 vehicles. The caller says the driver of the car at fault ({car}) is apparently drunk and trying to leave.',
      ),
      T(
        '{address}. Pärast kokkupõrget üritab süüdlane oma autoga minema sõita, teataja võttis tal võtmed ära.',
        '{address}. After the collision the driver at fault tried to drive off and the caller took his keys.',
      ),
    ],
    callerLines: [
      T('Mulle sõideti tagant sisse. Teine juht haiseb viina järele ja tahab ära minna.', 'Someone drove into the back of me. The other driver reeks of vodka and wants to leave.'),
      T('Ma võtsin tal võtmed ära, nüüd ta karjub minu peale.', 'I took his keys and now he is shouting at me.'),
    ],
    details: [
      T('Teataja hoiab süüdlase võtmeid enda käes.', 'The caller is holding the keys of the driver at fault.'),
      T('Süüdlase sõiduk: {car}, reg nr {plate}.', 'The car at fault: {car}, plate {plate}.'),
    ],
  },
  {
    id: 'red_light_witness',
    summary: [
      T(
        '{address}. Pealtnägija teatel sõitis {car} punase tulega ristmikule ja põrkas teise autoga kokku. Juht ajab segast juttu.',
        '{address}. A witness says {car} drove through a red light into the junction and hit another car. The driver is talking nonsense.',
      ),
      T(
        '{address}. Ristmikul kokkupõrge: süüdlane eiras punast tuld ja on pealtnägija sõnul ilmselt joobes.',
        '{address}. Collision at a junction: the driver at fault ignored the red light and, according to a witness, is apparently drunk.',
      ),
    ],
    callerLines: [
      T('Ma olen pealtnägija. See auto sõitis punase tulega ristmikule ja juht ajab nüüd segast juttu.', 'I am a witness. That car went through a red light into the junction and now the driver is talking nonsense.'),
      T('Ma jäin kohale, et tunnistust anda.', 'I have stayed at the scene to give a statement.'),
    ],
    details: [
      T('Pealtnägija jääb kohale ja annab tunnistuse.', 'The witness is staying to give a statement.'),
      T('Kannatanu sõidukil on külg sisse sõidetud.', 'The other car has been hit in the side.'),
    ],
  },
  {
    id: 'teen_driver_parked_car',
    title: T('Autoavarii: noor juht sõitis pargitud autole otsa', 'Car crash: young driver hit a parked car'),
    persons: [
      { role: 'driver', gender: 'M', age: [18, 22], intoxicated: 0.75, noLicense: 0.3, record: 0.15 },
      { role: 'victim', gender: 'any', age: [25, 75] },
      { role: 'witness', gender: 'any', age: [18, 75] },
    ],
    summary: [
      T(
        '{address}. Noor juht sõitis sõpradega öösel pargitud autole otsa, kõik on joobes. Auto esiosa on purustatud.',
        '{address}. A young driver out with friends at night crashed into a parked car and they are all drunk. The front of the car is smashed.',
      ),
      T(
        '{address}. Teataja kuulis pauku: noorukite auto sõitis parkivale sõidukile otsa ja noored üritavad autot minema lükata.',
        '{address}. The caller heard a bang: a car full of youngsters hit a parked vehicle and they are trying to push their car away.',
      ),
    ],
    callerLines: [
      T('Pauk oli nii kõva, et ärkasin üles. Noored lükkavad autot minema!', 'The bang was so loud it woke me up. The youngsters are pushing the car away!'),
      T('Juht on päris laps, vaevu täisealine, ja kõik haisevad alkoholi järele.', 'The driver is just a kid, barely of age, and they all smell of alcohol.'),
    ],
    details: [
      T('Autos oli neli noort, kõik joobes.', 'There were four young people in the car, all drunk.'),
      T('Pargitud sõiduki omanikku on teavitatud.', 'The owner of the parked car has been informed.'),
    ],
    call: {
      mood: 'calm',
      opening: [T('Tere, noored sõitsid meie maja ees pargitud autole otsa ja nüüd lükkavad oma autot minema.', 'Hello, some youngsters crashed into a parked car outside our building and now they are pushing their car away.')],
      openingRu: ['Здравствуйте, молодёжь врезалась в припаркованную машину у нашего дома, теперь толкают свою машину прочь.'],
      answers: {
        count: [T('Neid on neli, kõik noored.', 'There are four of them, all young.')],
        injured: [T('Tundub, et keegi viga ei saanud.', 'It looks like nobody is hurt.')],
        intoxicated: [T('Jah, nad kõik on purjus.', 'Yes, they are all drunk.')],
      },
    },
  },
];

export const TEMPLATES_TRAFFIC: IncidentTemplate[] = [
  // ─── Legacy ───────────────────────────────────────────────────────────────
  {
    id: 'traffic_autoavarii',
    category: 'traffic',
    code: 'LÕ',
    title: T('Autoavarii', 'Car crash'),
    priority: 2,
    weight: 0.9,
    hours: 'commute',
    places: ['street', 'oldtown', 'parking'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('traffic')] },
    onScene: [25, 50],
    persons: [
      { role: 'driver', gender: 'M', age: [20, 65], intoxicated: 0.7, noLicense: 0.25, record: 0.35 },
      { role: 'victim', gender: 'any', age: [18, 80] },
      { role: 'witness', gender: 'any', age: [18, 75] },
    ],
    vehicles: [
      { role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.1, noInspection: 0.1 },
      { role: 'victim', kind: 'car', driverRole: 'victim' },
    ],
    summary: [
      T('{address}. Kahe sõiduauto kokkupõrge, teataja hinnangul on üks juhtidest joobes. Vigastusi teadaolevalt ei ole, sõidukid takistavad liiklust.', '{address}. Collision between two cars; the caller believes one of the drivers is drunk. No known injuries, the vehicles are blocking traffic.'),
      T('{address}. Kaks autot põrkasid kokku. Üks juht kõnnib ebakindlalt ja lõhnab alkoholi järele, osalised vaidlevad.', '{address}. Two cars have collided. One driver is unsteady on his feet and smells of alcohol; the parties are arguing.'),
      T('{address}. LÕ, 2 sõidukit. Süüdi oleva sõiduki ({car}) juht on teataja sõnul ilmselt joobes ja üritab lahkuda.', '{address}. RTC, 2 vehicles. The at-fault driver ({car}) is apparently drunk according to the caller and trying to leave.'),
    ],
    callerLines: [
      T('Siin keset väljakut põrkasid kaks autot kokku ja see üks juht on täiesti purjus, vaevu seisab püsti!', 'Two cars just crashed in the middle of the square and one of the drivers is completely drunk, he can barely stand!'),
      T('Mulle sõideti tagant sisse. Teine juht haiseb viina järele ja tahab ära minna.', 'Someone drove into the back of me. The other driver reeks of vodka and wants to leave.'),
      T('Ma olen pealtnägija. Hall auto sõitis punase tulega ristmikule ja juht ajab nüüd segast juttu.', 'I am a witness. A grey car ran the red light into the junction and now the driver is talking nonsense.'),
    ],
    details: [
      T('Teataja jälgib süüdlast eemalt ja jääb kohale.', 'The caller is watching the at-fault driver from a distance and will stay.'),
      T('Ühest sõidukist lekib vedelikku, üks sõidurada on suletud.', 'Fluid is leaking from one vehicle; one lane is closed.'),
    ],
    beats: [
      qPerson('driver', 'arrive'),
      qVehicle(3, { chance: 0.6 }),
      breathRefusal(6, 0.3),
      backup(0.02, u('patrol'), B_PATROL, { at: 4 }),
    ],
    outcomes: [
      out('crime', 'arrest', [0.55, 1], 4, T('Juhi joove tuvastati (1,8 promilli). Alustati kriminaalmenetlust KarS § 424 järgi, juht toimetati arestimajja ja sõiduk teisaldati.', 'The driver was found to be over the limit (1.8 per mille). Criminal proceedings were opened under Penal Code § 424, the driver was taken into custody and the car towed.'), { arrests: 1 }),
      out('misd', 'report', [0.35, 0.85], 3, T('Juhi joove jäi väärteo piiridesse. Alustati väärteomenetlust LS § 224 järgi, juhtimisõigus peatati, õnnetus vormistati.', 'The driver was over the limit within the misdemeanour range. Proceedings under Traffic Act § 224, licence suspended, the collision was recorded.')),
      out('sober', 'resolved', [0.3, 1], 1, T('Joovet ei tuvastatud, juht oli šokis. Osalised vormistasid liiklusõnnetuse kokkuleppel, liiklus taastati.', 'No intoxication found: the driver was in shock. The parties recorded the collision by mutual agreement and traffic was restored.')),
      out('fled', 'escaped', [0, 0.4], 2, T('Joobes juht lahkus enne patrulli saabumist jalgsi. Sõiduk teisaldati, omaniku tuvastamiseks alustati menetlust.', 'The drunk driver left on foot before the patrol arrived. The car was towed and proceedings opened to identify him.')),
      out('hurt', 'hospital', [0, 0.25], 1, T('Kannatanu kaebas hiljem kaelavalu ja viidi kiirabiga haiglasse. Süüdlane osutas kinnipidamisel vastupanu.', 'The other driver later complained of neck pain and was taken to hospital. The at-fault driver resisted arrest.'), { injuries: 1, arrests: 1 }),
    ],
    escalation: { afterMin: 15, chance: 0.25, toPriority: 1, text: T('Teataja: süüdlane istus tagasi rooli ja sõitis minema!', 'Caller: the at-fault driver got back in and drove off!') },
    expiresMin: 60,
    interactiveChance: 0.2,
    tags: ['dui'],
    legacy: true,
    scenarios: SC_DUI_CRASH,
  },
  {
    id: 'traffic_purjus_autojuht',
    category: 'traffic',
    code: 'JJ',
    title: T('Purjus autojuht', 'Drunk driver'),
    priority: 2,
    weight: 0.8,
    hours: 'nightlife',
    weekendBoost: 1.6,
    places: ['street', 'highway', 'ruralroad'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('traffic')] },
    onScene: [30, 60],
    persons: [
      { role: 'caller', gender: 'any', age: [20, 70] },
      { role: 'driver', gender: 'M', age: [19, 65], intoxicated: 0.9, noLicense: 0.3, record: 0.4 },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', stolen: 0.03, noInsurance: 0.1, noInspection: 0.12 }],
    summary: [
      T('{address}. Teataja nägi, kuidas {car} sõidab ettevaatamatult ja kaldub korduvalt vastassuunavööndisse. Sõidab {direction}.', '{address}. The caller saw a {car} driving carelessly and repeatedly drifting into the oncoming lane. Heading {direction}.'),
      T('{address}. Joobes juhi kahtlus: {car}, numbrimärk {plate}, looklev sõit, kiirus muutlik. Teataja sõidab järel.', '{address}. Suspected drunk driver: {car}, plate {plate}, weaving, erratic speed. The caller is following.'),
      T('{address}. Sõiduauto sõitis kaks korda äärekivile ja jätkas. Juht ilmselt joobes, liigub {direction}.', '{address}. A car hit the kerb twice and carried on. The driver is apparently drunk, moving {direction}.'),
    ],
    callerLines: [
      T('Nägin, kuidas see auto sõitis täiesti siksakis ja kaldus mitu korda vastassuunda!', 'I saw this car driving in a total zigzag, it veered into the oncoming lane several times!'),
      T('Ma sõidan tema taga. Ta ei hoia üldse rada, peaaegu sõitis bussile otsa.', 'I am driving behind him. He cannot keep his lane at all, he nearly hit a bus.'),
      T('Number on {plate}. Ta peatus fooris rohelise tulega ja siis kihutas punasega minema.', 'The plate is {plate}. He stopped at a green light and then sped off on red.'),
    ],
    details: [
      T('Teataja kinnitab, et juht on sõidukis üksi.', 'The caller confirms the driver is alone in the car.'),
      T('Sõiduki vasak esituli ei põle.', 'The car’s left headlight is out.'),
    ],
    beats: [
      qVehicle('arrive'),
      pursuit(1, [T('{callsign}: {car} ei peatu märguande peale, kiirendab {direction}! Alustame jälitust.', '{callsign}: the {car} is not stopping for our lights, accelerating {direction}! Starting pursuit.')], 0.15),
      qPerson('driver', 3),
      backup(0.09, u('patrol'), B_PATROL, { at: 5 }),
    ],
    outcomes: [
      out('crime', 'arrest', [0.55, 1], 5, T('Juhi väljahingatavas õhus tuvastati 0,98 mg/l alkoholi. Alustati kriminaalmenetlust KarS § 424 järgi, juht peeti kinni ja juhiluba võeti ära.', 'The driver’s breath reading was 0.98 mg/l. Criminal proceedings under Penal Code § 424, the driver was detained and the licence seized.'), { arrests: 1 }),
      out('misd', 'report', [0.35, 0.9], 3, T('Juht peatati, tuvastati joove väärteo piirides. Alustati väärteomenetlust LS § 224 järgi, sõidukit juhtima ei lubatud.', 'The driver was stopped and found over the limit within the misdemeanour range. Proceedings under Traffic Act § 224, not allowed to drive on.')),
      out('tired', 'warning', [0.3, 1], 1, T('Juht oli kaine, kuid väsinud pärast pikka sõitu. Tehti hoiatus ja soovitati puhata.', 'The driver was sober but exhausted after a long drive. Given a warning and told to rest.')),
      out('lost', 'escaped', [0, 0.4], 2, T('Sõidukit piirkonnast ei leitud. Andmed edastati kõigile ekipaažidele, omanikku kontrolliti elukohas.', 'The car was not found in the area. Details passed to all units, the owner was checked at home.')),
      out('crash', 'hospital', [0, 0.2], 1, T('Juht sõitis enne peatamist teelt välja ja vigastas end. Ta toimetati haiglasse, joove tuvastati vereanalüüsiga.', 'The driver left the road before he could be stopped and was injured. Taken to hospital; intoxication established by blood test.'), { injuries: 1, arrests: 1 }),
    ],
    escalation: { afterMin: 12, chance: 0.3, toPriority: 1, text: T('Teataja: auto sõitis peaaegu ülekäigurajal jalakäijale otsa!', 'Caller: the car nearly ran down a pedestrian on a crossing!') },
    expiresMin: 45,
    interactiveChance: 0.3,
    tags: ['dui', 'vehicle_flee'],
    legacy: true,
  },
  {
    id: 'traffic_loata_rallivoistlus',
    category: 'traffic',
    code: 'LJ',
    title: T('Loata rallivõistlus', 'Illegal street racing'),
    priority: 2,
    weight: 0.12,
    hours: 'night',
    weekendBoost: 1.6,
    seasons: ['spring', 'summer', 'autumn'],
    places: ['ruralroad', 'forest', 'parking'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('traffic')] },
    onScene: [30, 60],
    persons: [
      { role: 'caller', gender: 'any', age: [25, 75] },
      { role: 'driver', gender: 'M', age: [18, 30], intoxicated: 0.15, noLicense: 0.25, record: 0.3 },
      { role: 'suspect', gender: 'M', age: [18, 28], record: 0.2 },
    ],
    vehicles: [
      { role: 'suspect', kind: 'car', driverRole: 'driver', noInspection: 0.4, noInsurance: 0.15 },
      { role: 'involved', kind: 'car', driverRole: 'suspect', noInspection: 0.3 },
    ],
    summary: [
      T('{address}. Metsateedel toimub loata rallivõistlus, kihutavad autod ohustavad teisi liiklejaid. Teataja sõnul on kohal {n} autot.', '{address}. An unauthorised rally is taking place on forest roads; speeding cars are endangering other road users. The caller counts {n} cars.'),
      T('{address}. Noored sõidavad kruusateel võidu, tolm ja mürin, üks auto lendas peaaegu kraavi.', '{address}. Young people are racing on a gravel road, dust and roaring engines, one car nearly ended up in the ditch.'),
      T('{address}. Parklas driftitakse, pealtvaatajaid kümmekond, autod libisevad inimestest mõne meetri kaugusel.', '{address}. Drifting in the car park, about ten spectators, the cars slide within a few metres of people.'),
    ],
    callerLines: [
      T('Siin metsateel kihutavad mingid poisid nagu rallil, ma pidin oma autoga kraavi põikama!', 'Some lads are tearing along the forest road like it is a rally, I had to swerve into the ditch!'),
      T('Juba tund aega käib see möirgamine, nad sõidavad ringiratast ja publik seisab tee ääres.', 'This roaring has been going on for an hour, they drive in circles and the crowd stands by the road.'),
    ],
    details: [
      T('Sõidukitel on numbrimärgid osaliselt kaetud.', 'The cars’ plates are partly covered.'),
      T('Teataja sõnul filmitakse sõitu sotsiaalmeedia jaoks.', 'According to the caller the runs are being filmed for social media.'),
    ],
    beats: [
      qVehicle('arrive'),
      pursuit(1, [T('{callsign}: üks auto, {car}, põgeneb metsateed pidi {direction}! Jälitame.', '{callsign}: one car, the {car}, is fleeing down the forest track {direction}! In pursuit.')], 0.2),
      qPerson('driver', 4),
      backup(0.25, u('patrol'), [T('{callsign}: autosid ja inimesi on palju, vajame väljasõitude sulgemiseks lisapatrulli!', '{callsign}: lots of cars and people, we need another patrol to block the exits!')], { at: 2 }),
    ],
    outcomes: [
      out('fined', 'fine', [0.5, 1], 4, T('Kohal tuvastati {n} juhti. Koostati väärteoprotokollid ohtliku sõidu ja tehniliselt nõuetele mittevastavate sõidukite eest, kaks autot saadeti ülevaatusele.', '{n} drivers were identified. Misdemeanour reports for dangerous driving and unroadworthy vehicles; two cars were ordered to inspection.')),
      out('arrest', 'arrest', [0.6, 1], 2, T('Peakorraldaja juhtis autot juhtimisõiguseta ja joobes. Ta peeti kinni, sõiduk teisaldati hoiuplatsile.', 'The organiser was driving disqualified and drunk. He was detained and the car impounded.'), { arrests: 1 }),
      out('dispersed', 'warning', [0.3, 0.75], 3, T('Patrulli saabudes osalejad hajusid. Kohalolijaid hoiatati, numbrimärgid fikseeriti edasiseks menetluseks.', 'The participants scattered when the patrol arrived. Those present were warned and plates noted for follow-up.')),
      out('gone', 'escaped', [0, 0.35], 2, T('Kohale jõudes oli võistlus lõppenud, alles jäid vaid rehvijäljed. Piirkonda lisati öine patrullimine.', 'By the time we arrived the race was over, only tyre marks were left. Night patrols added to the area.')),
      out('crash', 'hospital', [0, 0.2], 1, T('Üks auto sõitis puusse, kaassõitja toimetati kiirabiga haiglasse. Juhi suhtes alustati menetlust.', 'One car hit a tree; the passenger was taken to hospital. Proceedings opened against the driver.'), { injuries: 1 }),
    ],
    expiresMin: 50,
    tags: ['vehicle_flee'],
    legacy: true,
  },
  {
    id: 'traffic_jalakaija_vigastamine',
    category: 'traffic',
    code: 'LÕK',
    title: T('Jalakäija vigastamine', 'Pedestrian injured'),
    priority: 2,
    weight: 0.25,
    hours: 'day',
    seasons: ['spring', 'summer', 'autumn'],
    places: ['street', 'park', 'oldtown'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [30, 50],
    persons: [
      { role: 'victim', gender: 'any', age: [8, 88] },
      { role: 'suspect', gender: 'M', age: [15, 45], record: 0.15, intoxicated: 0.2 },
      { role: 'witness', gender: 'any', age: [18, 75] },
    ],
    summary: [
      T('{address}. Jalgrattur sõitis jalakäijale otsa ja vigastas teda. Rattur põgenes sündmuskohalt {direction}.', '{address}. A cyclist rode into a pedestrian and injured them. The cyclist fled {direction}.'),
      T('{address}. Kõnniteel sõitnud rattur paiskas eaka naise pikali, kannatanul peahaav. Rattur lahkus peatumata.', '{address}. A cyclist on the pavement knocked an elderly woman down; she has a head wound. The cyclist left without stopping.'),
      T('{address}. Kergliiklusteel kokkupõrge, jalakäija lamab maas. Süüdlane: {suspect}.', '{address}. Collision on the cycle path, the pedestrian is on the ground. Suspect: {suspect}.'),
    ],
    callerLines: [
      T('Üks ratturipoiss kihutas kõnniteel ja sõitis vanaprouale otsa! Ta lihtsalt sõitis minema!', 'Some lad on a bike was speeding on the pavement and hit an old lady! He just rode off!'),
      T('Mu ema lükati rattaga pikali, tal jookseb peast verd. Rattur oli mustas dressis.', 'My mother was knocked over by a bike, her head is bleeding. The cyclist was in a black tracksuit.'),
    ],
    details: [
      T('Kannatanu on teadvusel, kuid segaduses.', 'The casualty is conscious but confused.'),
      T('Tunnistaja filmis põgenevat ratturit telefoniga.', 'A witness filmed the fleeing cyclist on their phone.'),
    ],
    beats: [
      agency('kiirabi', A_KIIRABI),
      search(3, 1.5, [T('{callsign}: rattur sõitis {direction}, otsime ümbrusest.', '{callsign}: the cyclist went {direction}, searching the area.')]),
      qPerson('suspect', 12, { chance: 0.5, radio: [T('{callsign}: peatasime kirjeldusele vastava ratturi. Kontrolli palun: {name}, isikukood {idcode}.', '{callsign}: we have stopped a cyclist matching the description. Please check: {name}, ID code {idcode}.')] }),
      backup(0.08, u('patrol'), [T('{callsign}: pealtvaatajad lähevad ratturiga tülli, vajame lisapatrulli!', '{callsign}: bystanders are confronting the cyclist, we need another patrol!')], { at: 6 }),
    ],
    outcomes: [
      out('found', 'report', [0.55, 1], 4, T('Rattur tuvastati lähiümbrusest. Alustati menetlust liiklusõnnetuse põhjustamise ja sündmuskohalt lahkumise eest, kannatanu viidi haiglasse.', 'The cyclist was found nearby. Proceedings opened for causing a collision and leaving the scene; the casualty was taken to hospital.'), { injuries: 1 }),
      out('video', 'report', [0.35, 0.8], 3, T('Ratturit kohe ei leitud, kuid tunnistaja video põhjal ta hiljem tuvastati. Kannatanu sai haiglas abi.', 'The cyclist was not found at once but was identified later from the witness video. The casualty was treated in hospital.'), { injuries: 1 }),
      out('minor', 'resolved', [0.4, 1], 1, T('Kannatanul olid vaid marrastused, abi anti kohapeal. Rattur tuli ise tagasi ja vabandas, vormistati protokoll.', 'The casualty had only grazes, treated on scene. The cyclist came back and apologised; a report was filed.')),
      out('escaped', 'escaped', [0, 0.4], 2, T('Ratturit ei leitud. Kannatanu toimetati haiglasse, menetlus jätkub tunnistajate ütluste põhjal.', 'The cyclist was not found. The casualty went to hospital; the case continues on witness statements.'), { injuries: 1 }),
    ],
    expiresMin: 45,
    legacy: true,
  },
  {
    id: 'traffic_valgustamata_jalgrattur',
    category: 'traffic',
    code: 'LJ',
    title: T('Valgustamata jalgrattur öösel', 'Unlit cyclist at night'),
    priority: 3,
    weight: 0.25,
    hours: 'night',
    seasons: ['autumn', 'winter', 'spring'],
    places: ['ruralroad', 'street', 'highway'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [10, 25],
    persons: [
      { role: 'suspect', gender: 'M', age: [16, 70], intoxicated: 0.45, record: 0.25 },
      { role: 'caller', gender: 'any', age: [20, 70] },
    ],
    summary: [
      T('{address}. Mitmed autojuhid teatavad ratturist, kes sõidab pimedas ilma tulede ja helkurita keset sõiduteed.', '{address}. Several drivers report a cyclist riding in the dark without lights or reflectors in the middle of the road.'),
      T('{address}. Valgustamata jalgrattur looklevalt maanteel, autod on teda viimasel hetkel märganud. Liigub {direction}.', '{address}. Unlit cyclist weaving on the highway; cars have spotted him at the last moment. Moving {direction}.'),
    ],
    callerLines: [
      T('Ma peaaegu sõitsin talle otsa! Mustad riided, ei mingit tuld, sõidab keset teed!', 'I nearly hit him! Dark clothes, no light, riding in the middle of the road!'),
      T('Siin maanteel loksub üks rattur, tundub purjus, varsti saab keegi talle otsa.', 'There is a cyclist wobbling on the main road, looks drunk, someone is going to hit him soon.'),
    ],
    details: [T('Rattal on ostukotid sangadel, sõit on ebakindel.', 'Shopping bags are hanging off the handlebars; the riding is unsteady.')],
    beats: [
      qPerson('suspect', 'arrive', { radio: [T('{callsign}: rattur peatatud. Kontrolli palun: {name}, isikukood {idcode}.', '{callsign}: cyclist stopped. Please check: {name}, ID code {idcode}.')] }),
      info(4, [T('{callsign}: andsime ratturile helkurvesti ja lambi, sõit kodu poole jätkub jalgsi.', '{callsign}: we gave the cyclist a hi-vis vest and a light; he is walking the bike home.')], 0.4),
      backup(0.01, u('patrol'), B_PATROL, { at: 3 }),
    ],
    outcomes: [
      out('fine', 'fine', [0.5, 1], 3, T('Ratturile määrati trahv valgustusnõuete rikkumise eest, ratas jäeti ta sõbra hoolde.', 'The cyclist was fined for riding without lights; the bike was left with a friend.')),
      out('drunk', 'fine', [0.4, 1], 2, T('Rattur oli joobes. Koostati väärteoprotokoll joobes jalgratta juhtimise eest, edasisõit keelati.', 'The cyclist was drunk. Misdemeanour report for cycling under the influence; not allowed to ride on.')),
      out('warn', 'warning', [0.25, 0.8], 2, T('Ratturit hoiatati ja talle anti helkur. Ta jätkas teepeenral jalgsi.', 'The cyclist was warned and given a reflector. He continued on foot along the verge.')),
      out('gone', 'unfounded', [0, 0.35], 1, T('Ratturit piirkonnast ei leitud.', 'The cyclist was not found in the area.')),
      out('hit', 'hospital', [0, 0.15], 1, T('Enne patrulli saabumist põrkas sõiduauto ratturiga kokku. Rattur toimetati kergete vigastustega haiglasse.', 'Before the patrol arrived a car clipped the cyclist. He was taken to hospital with minor injuries.'), { injuries: 1 }),
    ],
    expiresMin: 60,
    legacy: true,
  },
  {
    id: 'traffic_rongilt_kukkunud',
    category: 'traffic',
    code: 'RAUD',
    title: T('Rongilt alla kukkunud inimene', 'Person fell from a train'),
    priority: 1,
    weight: 0.03,
    hours: 'evening',
    places: ['trainstation', 'village', 'ruralroad'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('criminal')] },
    onScene: [40, 80],
    persons: [
      { role: 'victim', gender: 'any', age: [15, 80], intoxicated: 0.4 },
      { role: 'witness', gender: 'any', age: [25, 60], relation: 'employee' },
    ],
    agencies: [
      { agency: 'kiirabi', chance: 1, reason: T('Raskelt vigastatud reisija', 'Seriously injured passenger') },
      { agency: 'paaste', chance: 0.4, reason: T('Kannatanu raudteetammilt evakueerimine', 'Recovering the casualty from the embankment') },
    ],
    summary: [
      T('{address}. Raudteel on rongilt kukkunud reisija, kes vajab kiiret meditsiinilist abi. Rong peatatud.', '{address}. A passenger has fallen from a train onto the track and needs urgent medical help. The train has stopped.'),
      T('{address}. Rongi saatja teatel kukkus reisija sõidu ajal avatud uksest välja. Kannatanu asukoht u 500 m jaamast.', '{address}. The train conductor reports a passenger fell out of an open door while moving. Casualty about 500 m from the station.'),
    ],
    callerLines: [
      T('Ma olen rongi saatja. Üks reisija kukkus uksest välja, me peatasime rongi, ta lamab rööbaste kõrval!', 'I am the conductor. A passenger fell out of the door, we stopped the train, he is lying by the rails!'),
      T('Perroonilt kukkus mees rööbastele just siis, kui rong liikuma hakkas!', 'A man fell off the platform onto the rails just as the train pulled out!'),
    ],
    details: [
      T('Raudtee-ettevõte on rongiliikluse lõigul peatanud.', 'The rail operator has stopped traffic on the section.'),
      T('Kaasreisijate sõnul oli kannatanu enne kukkumist purjus ja vaidles saatjaga.', 'Fellow passengers say the casualty was drunk and arguing with the conductor before the fall.'),
    ],
    beats: [
      agency('kiirabi', A_KIIRABI),
      info(3, [T('{callsign}: rongiliiklus lõigul peatatud, kinnitage raudtee juhtimiskeskusele.', '{callsign}: rail traffic on the section stopped, confirm with rail traffic control.')]),
      qPerson('victim', 8, { chance: 0.6 }),
      choice(12, [T('{callsign}: kaasreisijad räägivad tülist enne kukkumist. Kas kaasame kriminaalpolitsei?', '{callsign}: passengers mention an argument before the fall. Do we bring in CID?')], [
        opt('cid', T('Jah, kutsuge uurija', 'Yes, call an investigator'), T('{callsign}, uurija on teel, säilitage sündmuskoht ja küsitlege tunnistajaid.', '{callsign}, an investigator is on the way, preserve the scene and take statements.'), { success: 0.1, time: 20 }),
        opt('accident', T('Ei, vormistame õnnetusena', 'No, record it as an accident'), T('{callsign}, vormistage õnnetusena, tunnistajate andmed üles.', '{callsign}, record it as an accident, take witness details.'), { success: -0.05 }),
      ], 'cid', { chance: 0.4 }),
    ],
    outcomes: [
      out('hospital', 'hospital', [0.4, 1], 5, T('Kannatanu toimetati raskes seisundis haiglasse. Rongiliiklus taastati tunni aja pärast, asjaolusid selgitatakse.', 'The casualty was taken to hospital in a serious condition. Rail traffic resumed an hour later; the circumstances are being investigated.'), { injuries: 1 }),
      out('minor', 'hospital', [0.6, 1], 2, T('Kannatanu pääses murtud käe ja marrastustega, ta viidi haiglasse. Saatja tegevust kontrollitakse.', 'The casualty escaped with a broken arm and grazes and was taken to hospital. The conductor’s actions are being reviewed.'), { injuries: 1 }),
      out('cid', 'report', [0.3, 0.8], 2, T('Selgus, et kannatanu lükati tüli käigus uksest välja. Alustati kriminaalmenetlust, kahtlustatav peeti kinni järgmises jaamas.', 'It emerged the casualty was pushed out during an argument. Criminal proceedings opened; the suspect was detained at the next station.'), { injuries: 1, arrests: 1 }),
      out('fatal', 'tragedy', [0, 0.25], 1, T('Kannatanu suri sündmuskohal saadud vigastustesse. Surma asjaolude väljaselgitamiseks alustati menetlust.', 'The casualty died at the scene from their injuries. An investigation into the circumstances has been opened.'), { injuries: 1 }),
    ],
    expiresMin: 60,
    interactiveChance: 0.3,
    legacy: true,
  },

  // ─── New: drunk driving ───────────────────────────────────────────────────
  {
    id: 'traffic_joobes_juhi_kahtlus',
    category: 'traffic',
    code: 'JJ',
    title: T('Joobes juhi kahtlus', 'Suspected drunk driver'),
    priority: 2,
    weight: 2,
    hours: 'nightlife',
    weekendBoost: 1.6,
    places: ['highway', 'street', 'ruralroad'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('traffic')] },
    onScene: [30, 60],
    persons: [
      { role: 'caller', gender: 'any', age: [20, 70] },
      { role: 'driver', gender: 'M', age: [19, 70], intoxicated: 0.9, noLicense: 0.3, record: 0.4, wanted: 0.04 },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', stolen: 0.04, noInsurance: 0.12, noInspection: 0.15, suspended: 0.05 }],
    summary: [
      T('{address}. Joobes juhi kahtlus: {car}, numbrimärk {plate}, looklev sõit, liigub {direction}. Teataja sõidab järel.', '{address}. Suspected drunk driver: {car}, plate {plate}, weaving, moving {direction}. The caller is following.'),
      T('{address}. Teataja sõidab sõiduki {plate} taga. Auto kõigub rajalt rajale ja pidurdab põhjuseta. Kiirus 50-110 km/h.', '{address}. The caller is behind {plate}. The car drifts lane to lane and brakes for no reason. Speed 50-110 km/h.'),
      T('{address}. Teataja sõnul sõitis {car} ({plate}) teepeenrale ja tagasi, ohustab vastutulijaid. Teataja on liinil.', '{address}. According to the caller, a {car} ({plate}) ran onto the verge and back, endangering oncoming traffic. The caller is on the line.'),
    ],
    callerLines: [
      T('Ma sõidan ühe auto taga, ta on kindlasti purjus! Kogu aeg üle keskjoone!', 'I am driving behind a car, he is definitely drunk! Over the centre line all the time!'),
      T('Number on {plate}. Ta just sõitis peaaegu kraavi ja jätkab, me oleme {direction}.', 'The plate is {plate}. He nearly went into the ditch and carried on, we are heading {direction}.'),
      T('Ma ei taha lähemale minna, aga ta sõidab nagu oleks magama jäämas.', 'I do not want to get closer, but he drives like he is falling asleep.'),
    ],
    details: [
      T('Teataja jätab ohutu vahemaa ja annab asukohta jooksvalt.', 'The caller keeps a safe distance and is giving running locations.'),
      T('Viimati nähti sõidukit tankla juures.', 'The car was last seen near a petrol station.'),
    ],
    beats: [
      qVehicle('arrive'),
      qPerson('driver', 2),
      pursuit(1, [T('{callsign}: {plate} eirab peatumismärguannet ja kiirendab {direction}! Alustame jälitust.', '{callsign}: {plate} ignores the stop signal and accelerates {direction}! Starting pursuit.')], 0.18),
      breathRefusal(6, 0.25),
    ],
    outcomes: [
      out('crime', 'arrest', [0.55, 1], 5, T('Juht toimetati joobe tuvastamiseks haiglasse, alustati kriminaalmenetlust KarS § 424 järgi. Juhiluba võeti ära, sõiduk teisaldati.', 'The driver was taken to hospital to establish intoxication; criminal proceedings under Penal Code § 424. Licence seized, car towed.'), { arrests: 1 }),
      out('misd', 'report', [0.35, 0.9], 4, T('Juhi väljahingatavas õhus 0,4 mg/l. Alustati väärteomenetlust LS § 224 järgi, juhtimisõigus peatati.', 'Breath reading 0.4 mg/l. Proceedings under Traffic Act § 224, licence suspended.')),
      out('medical', 'hospital', [0.3, 1], 1, T('Juht oli kaine, kuid tal oli madal veresuhkur. Kiirabi abistas, auto jäeti teepeenrale.', 'The driver was sober but had low blood sugar. Paramedics treated him, the car was left on the verge.')),
      out('lost', 'escaped', [0, 0.4], 2, T('Sõidukit ei õnnestunud tabada. Numbrimärk edastati ekipaažidele, omanikku külastatakse elukohas.', 'The car could not be intercepted. The plate was circulated; the owner will be visited at home.')),
      out('crash', 'hospital', [0, 0.18], 1, T('Juht kaotas jälituse ajal kontrolli ja sõitis kraavi. Ta toimetati haiglasse, kõrvalisi kannatanuid ei olnud.', 'The driver lost control during the pursuit and went into the ditch. Taken to hospital; no third parties were hurt.'), { injuries: 1, arrests: 1 }),
    ],
    escalation: { afterMin: 12, chance: 0.25, toPriority: 1, text: T('Teataja: sõiduk põrkas vastu piirdeaeda, juht jätkab sõitu!', 'Caller: the car hit the barrier and the driver is carrying on!') },
    expiresMin: 45,
    interactiveChance: 0.35,
    call: {
      mood: 'calm',
      opening: [
        T('Tere, ma sõidan praegu ühe auto taga, juht on ilmselgelt purjus. Ma räägin vabakäega.', 'Hello, I am driving behind a car right now and the driver is obviously drunk. I am on hands-free.'),
        T('Häirekeskus? Mu ees sõidab keegi täiesti siksakis, ma kardan, et ta tapab kellegi ära.', 'Emergency? Someone in front of me is driving in a total zigzag, I am afraid he will kill someone.'),
      ],
      answers: {
        vehicle: [T('{car}, number {plate}.', '{car}, plate {plate}.')],
        direction: [T('Me sõidame {direction}, just möödusime bussipeatusest.', 'We are going {direction}, just passed a bus stop.')],
        where: [T('{address}, ma näen teeviita.', '{address}, I can see the sign.')],
        count: [T('Tundub, et ta on autos üksi.', 'He seems to be alone in the car.')],
        injured: [T('Veel ei ole kellelegi otsa sõitnud, aga peaaegu.', 'He has not hit anyone yet, but nearly.')],
      },
      openingRu: ['Алло, я еду за машиной, водитель явно пьяный, виляет по всей дороге.'],
    },
    tags: ['dui', 'vehicle_flee'],
    scenarios: SC_DUI_SUSPICION,
  },
  {
    id: 'traffic_joobes_juht_tanklas',
    category: 'traffic',
    code: 'JJ',
    title: T('Joobes isik istus autorooli', 'Drunk person got behind the wheel'),
    priority: 2,
    weight: 0.6,
    hours: 'nightlife',
    weekendBoost: 1.5,
    places: ['gasstation', 'shop', 'parking'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [25, 50],
    persons: [
      { role: 'caller', gender: 'any', age: [19, 60], relation: 'employee' },
      { role: 'driver', gender: 'M', age: [20, 65], intoxicated: 0.9, noLicense: 0.3, record: 0.4 },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.1, noInspection: 0.15 }],
    summary: [
      T('{address}. Tankla müüja teatel ostis tugevas joobes mees alkoholi ja istus auto rooli. Mootor käib. Auto: {car}.', '{address}. The petrol station clerk reports a heavily drunk man bought alcohol and got behind the wheel of a {car}. Engine running.'),
      T('{address}. Poe parklas istub joobes juht autos {plate}, üritab ära sõita. Müüja võttis tal võtmed ära, mees nõuab neid tagasi.', '{address}. In the shop car park a drunk driver sits in car {plate} trying to leave. The clerk took his keys, he is demanding them back.'),
      T('{address}. Klient ei suutnud kaardiga maksta, komistas ja sõitis seejärel parkimisplatsil vastu prügikasti. Auto {car}.', '{address}. A customer could not manage to pay by card, stumbled, then drove into a bin in the car park. Car: {car}.'),
    ],
    callerLines: [
      T('Siin on üks klient, vaevu seisab püsti, ostis kaks pudelit ja istus nüüd autosse. Ta tahab ära sõita!', 'There is a customer here who can barely stand, bought two bottles and is now sitting in his car. He wants to drive off!'),
      T('Ma võtsin tal võtmed ära, aga tal on vist varuvõti. Palun tulge kiiresti.', 'I took his keys but he may have a spare. Please come quickly.'),
    ],
    details: [T('Turvakaamera salvestis on olemas.', 'CCTV footage is available.')],
    beats: [
      qPerson('driver', 'arrive'),
      qVehicle(2, { chance: 0.5 }),
      breathRefusal(5, 0.35),
      transport('arrest', T_ARREST, { at: 15, chance: 0.5 }),
    ],
    outcomes: [
      out('crime', 'arrest', [0.55, 1], 4, T('Juht peeti kinni enne väljasõitu. Joove 2,1 promilli, alustati kriminaalmenetlust KarS § 424 järgi.', 'The driver was stopped before leaving. 2.1 per mille; criminal proceedings under Penal Code § 424.'), { arrests: 1 }),
      out('notdriven', 'warning', [0.35, 1], 3, T('Mees ei olnud veel sõitnud. Võtmed anti üle tema abikaasale, mees saadeti taksoga koju.', 'The man had not driven yet. The keys were handed to his wife and he was sent home by taxi.')),
      out('misd', 'report', [0.3, 0.85], 2, T('Juht oli parklas sõitnud ja põhjustanud varalise kahju. Alustati väärteomenetlust LS § 224 järgi.', 'The driver had driven in the car park and caused damage. Proceedings under Traffic Act § 224.')),
      out('gone', 'escaped', [0, 0.35], 2, T('Juht sõitis enne patrulli saabumist minema. Numbrimärk edastati ekipaažidele.', 'The driver left before the patrol arrived. The plate was circulated to units.')),
    ],
    expiresMin: 40,
    interactiveChance: 0.3,
    call: {
      mood: 'calm',
      opening: [T('Tere, ma helistan tanklast. Üks täiesti purjus mees istub oma autos ja tahab ära sõita.', 'Hello, I am calling from a petrol station. A completely drunk man is sitting in his car and wants to drive away.')],
      answers: {
        vehicle: [T('{car}, number {plate}.', '{car}, plate {plate}.')],
        intoxicated: [T('Väga purjus, ta kukkus kassa ees peaaegu ümber.', 'Very drunk, he nearly fell over at the till.')],
        weapons: [T('Relva ei näinud.', 'I did not see any weapon.')],
      },
      openingRu: ['Здравствуйте, я с заправки. Тут совсем пьяный мужчина сел в машину и хочет уехать.'],
    },
    tags: ['dui'],
  },
  {
    id: 'traffic_naaber_joobes_rooli',
    category: 'traffic',
    code: 'JJ',
    title: T('Naaber sõitis joobes koju', 'Neighbour drove home drunk'),
    priority: 3,
    weight: 0.3,
    hours: 'evening',
    weekendBoost: 1.4,
    places: ['residential', 'house', 'village'],
    units: { need: [u('patrol')] },
    onScene: [20, 40],
    persons: [
      { role: 'caller', gender: 'M', age: [35, 75], intoxicated: 0.8, relation: 'neighbour', known: true },
      { role: 'driver', gender: 'M', age: [25, 70], intoxicated: 0.7, noLicense: 0.35, record: 0.35, relation: 'neighbour', known: true },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.15, noInspection: 0.2 }],
    summary: [
      T('{address}. Teataja (ise joobes) väidab, et naaber sõitis just purjus peaga koju, auto {plate} seisab hoovis.', '{address}. The caller (himself drunk) claims his neighbour has just driven home drunk; car {plate} is parked in the yard.'),
      T('{address}. Naabri teatel sõitis {car} hoovis vastu prügikonteinerit, juht läks tuppa. Teataja kõne segane.', '{address}. A neighbour reports a {car} hit a bin in the yard and the driver went inside. The call is muddled.'),
    ],
    callerLines: [
      T('Kuule, see naaber… ta jälle sõitis purjus peaga, ma nägin! Ma tean, ma ise ka võtsin natuke, aga mina ei sõida!', 'Listen, that neighbour… he drove drunk again, I saw it! I know, I have had a bit myself, but I do not drive!'),
      T('Ta sõitis mu aiale peaaegu otsa ja läks nüüd tuppa, auto mootor on veel soe.', 'He nearly drove into my fence and has gone inside now, the engine is still warm.'),
    ],
    details: [
      T('Naabrite vahel on pikaajaline tüli.', 'There is a long-running feud between the neighbours.'),
      T('Auto kapott on soe, esistanges värske mõlk.', 'The bonnet is warm and there is a fresh dent in the front bumper.'),
    ],
    beats: [
      qVehicle('arrive'),
      qPerson('driver', 4),
      choice(8, [T('{callsign}: juht ütleb, et jõi alles kodus pärast sõitu. Kas toimetame ekspertiisi?', '{callsign}: the driver says he only drank at home after driving. Do we take him for an expert examination?')], [
        opt('exam', T('Jah, ekspertiisi', 'Yes, examination'), T('{callsign}, toimetage joobe tuvastamisele, võtke tunnistajate ütlused.', '{callsign}, take him for an intoxication test and get witness statements.'), { success: 0.1, time: 25 }),
        opt('note', T('Ei, vormistame teate', 'No, just file a report'), T('{callsign}, vormistage teade, tõendeid napib.', '{callsign}, file a report, evidence is thin.'), { success: -0.05 }),
      ], 'exam', { chance: 0.5 }),
    ],
    outcomes: [
      out('report', 'report', [0.55, 1], 3, T('Tunnistajate ütluste ja kaamerasalvestise põhjal alustati menetlust joobes juhtimise asjas.', 'Proceedings for drunk driving were opened on the basis of witness statements and camera footage.')),
      out('nolicense', 'report', [0.45, 1], 2, T('Selgus, et juhil puudub juhtimisõigus. Koostati väärteoprotokoll, auto võtmed jäid abikaasale.', 'It turned out the driver has no licence. Misdemeanour report filed; the car keys stayed with his wife.')),
      out('feud', 'unfounded', [0, 0.7], 3, T('Kohapeal teadet kinnitada ei õnnestunud. Tegemist oli naabrite omavahelise tüliga. Osalisi hoiatati.', 'The report could not be confirmed on scene. It was a quarrel between neighbours. Both were warned.')),
      out('sleeping', 'warning', [0, 0.45], 1, T('Juht ei avanud ust. Info edastati piirkonnapolitseinikule.', 'The driver did not open the door. The information was passed to the community officer.')),
    ],
    falseAlarmChance: 0.25,
    expiresMin: 90,
    interactiveChance: 0.4,
    call: {
      mood: 'drunk',
      opening: [
        T('Hallo… politsei? No kuulge, mu naaber… ta sõitis jälle täis peaga! Ma nägin oma silmaga!', 'Hello… police? Listen, my neighbour… he drove drunk again! I saw it with my own eyes!'),
        T('Ma tean, et ma olen ise ka natuke… aga see on teine asi! Tema sõitis autoga!', 'I know I am a bit… myself, but that is different! He drove a car!'),
      ],
      answers: {
        where: [T('Ee… {address}. Hoovis, see sinine auto.', 'Er… {address}. In the yard, that blue car.')],
        vehicle: [T('Number on… oot… {plate}. Jah.', 'The plate is… hang on… {plate}. Yes.')],
        intoxicated: [T('Tema on palju purjus! Mina natuke ainult.', 'He is very drunk! Me, only a little.')],
        when: [T('Just praegu, kümme minutit tagasi vist.', 'Just now, ten minutes ago maybe.')],
      },
      openingRu: ['Алло, полиция? Сосед опять пьяный за руль сел! Я сам видел!'],
    },
    tags: ['dui'],
  },

  {
    id: 'traffic_joobes_juht_sadamas',
    category: 'traffic',
    code: 'JJ',
    title: T('Joobes juht laevalt maha sõitmas', 'Drunk driver about to drive off a ship'),
    priority: 2,
    weight: 0.12,
    regions: ['pohja', 'laane'],
    hours: 'evening',
    weekendBoost: 1.5,
    places: ['port'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('traffic')] },
    onScene: [25, 50],
    persons: [
      { role: 'caller', gender: 'any', age: [25, 60], relation: 'employee' },
      { role: 'driver', gender: 'M', age: [22, 65], intoxicated: 0.9, noLicense: 0.15, record: 0.3 },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.08 }],
    summary: [
      T('{place}, {address}. Laeva meeskonna teatel istus sõidukitekil autorooli tugevas joobes juht, {car}, numbrimärk {plate}. Laev randub 15 minuti pärast.', '{place}, {address}. The ship’s crew report a heavily drunk driver has got behind the wheel on the car deck: {car}, plate {plate}. The ship docks in 15 minutes.'),
      T('{place}, {address}. Parvlaeva baaris alkoholi tarvitanud mees läks oma auto juurde ja kavatseb kail maha sõita. Meeskond ei saanud võtmeid ära.', '{place}, {address}. A man who was drinking in the ferry bar has gone to his car and intends to drive off at the quay. The crew could not take his keys.'),
    ],
    callerLines: [
      T('Laeva pootsman siin. Üks reisija on täiesti purjus ja istub autos, tahab kohe maale sõita.', 'This is the ship’s boatswain. A passenger is completely drunk and sitting in his car, he wants to drive ashore straight away.'),
      T('Ta jõi terve sõidu baaris, nüüd käivitas autos mootori. Palun olge kail ootamas.', 'He drank in the bar the whole crossing and has now started the engine. Please be waiting at the quay.'),
    ],
    details: [
      T('Piletisüsteemi andmetel on pilet ostetud sõiduki numbrimärgiga {plate}.', 'According to the ticketing system the ticket was booked against plate {plate}.'),
      T('Sadama väravakaamera tuvastab numbrimärgi väljasõidul.', 'The port gate camera will read the plate on the way out.'),
    ],
    beats: [
      qVehicle('arrive', { radio: [T('{callsign}: oleme kail. Kontrolli palun sõidukit {plate}, {car}.', '{callsign}: we are at the quay. Please run {plate}, {car}.')] }),
      qPerson('driver', 2),
      breathRefusal(5, 0.3),
    ],
    outcomes: [
      out('stopped', 'arrest', [0.5, 1], 4, T('Juht peatati kail enne sadamaväravat. Joove 1,9 promilli, alustati kriminaalmenetlust KarS § 424 järgi.', 'The driver was stopped on the quay before the port gate. 1.9 per mille; criminal proceedings under Penal Code § 424.'), { arrests: 1 }),
      out('misd', 'report', [0.35, 0.9], 3, T('Juhi joove jäi väärteo piiridesse. Alustati väärteomenetlust LS § 224 järgi, auto jäeti sadama parklasse.', 'The driver was over the limit within the misdemeanour range. Proceedings under Traffic Act § 224; the car was left in the port car park.')),
      out('passenger', 'warning', [0.3, 1], 1, T('Rooli vahetas kaine kaassõitja, juhti hoiatati.', 'A sober passenger took the wheel and the driver was warned.')),
      out('missed', 'escaped', [0, 0.4], 2, T('Juht jõudis sadamast lahkuda. ANPR-teavitus edastati ekipaažidele, juht peeti kinni hiljem kodu juures.', 'The driver got out of the port. An ANPR alert went to units and he was detained later near his home.'), { arrests: 1 }),
    ],
    expiresMin: 40,
    interactiveChance: 0.2,
    tags: ['dui', 'ferry'],
  },

  // ─── New: collisions ──────────────────────────────────────────────────────
  {
    id: 'traffic_lo_varaline',
    category: 'traffic',
    code: 'LÕ',
    title: T('Liiklusõnnetus varalise kahjuga', 'Collision, property damage only'),
    priority: 3,
    weight: 2,
    hours: 'commute',
    places: ['street', 'parking', 'highway', 'gasstation'],
    units: { need: [u('patrol')], ideal: [u('traffic')] },
    onScene: [25, 45],
    persons: [
      { role: 'driver', gender: 'any', age: [18, 80], intoxicated: 0.08, noLicense: 0.08, record: 0.15 },
      { role: 'victim', gender: 'any', age: [18, 80] },
    ],
    vehicles: [
      { role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.08, noInspection: 0.1 },
      { role: 'victim', kind: 'car', driverRole: 'victim' },
    ],
    summary: [
      T('{address}. LÕ varalise kahjuga, 2 sõiduautot, kannatanuid pole. Sõidukid takistavad liiklust, osalised vaidlevad süü üle.', '{address}. Collision, damage only, 2 cars, no casualties. The vehicles are blocking traffic and the parties dispute who is at fault.'),
      T('{address}. Tagant otsasõit fooris, {car} ja teine sõiduauto. Osalised ei jõua kokkuleppele.', '{address}. Rear-end shunt at the lights between a {car} and another car. The parties cannot agree.'),
      T('{address}. Ristmikul kokkupõrge, üks sõiduk ei andnud teed. Vigastusi pole, liiklus aeglane.', '{address}. Collision at a junction, one vehicle failed to give way. No injuries, traffic slow.'),
    ],
    callerLines: [
      T('Mulle sõideti fooris tagant sisse ja teine juht väidab, et mina pidurdasin järsult!', 'Someone drove into my back at the lights and the other driver says I braked suddenly!'),
      T('Meil oli väike avarii, keegi viga ei saanud, aga teine osapool ei taha kokkuleppeblanketti täita.', 'We had a small accident, nobody is hurt, but the other party will not fill in the agreement form.'),
    ],
    details: [
      T('Teine juht räägib vaid vene keelt.', 'The other driver speaks only Russian.'),
      T('Ühel sõidukil on kahjustatud esituli ja kapott.', 'One car has a damaged headlight and bonnet.'),
    ],
    beats: [
      qPerson('driver', 'arrive'),
      qVehicle(3),
      info(8, [T('{callsign}: sõidukid teisaldatud teepeenrale, liiklus taastatud.', '{callsign}: vehicles moved onto the verge, traffic restored.')], 0.6),
    ],
    outcomes: [
      out('agreed', 'resolved', [0.4, 1], 4, T('Osalised vormistasid liiklusõnnetuse kokkuleppel, liiklus taastati.', 'The parties recorded the collision by mutual agreement and traffic was restored.')),
      out('fined', 'fine', [0.5, 1], 3, T('Süüdi olnud juhile määrati trahv pikivahe mittehoidmise eest, kahju hüvitab kindlustus.', 'The at-fault driver was fined for following too closely; insurance will cover the damage.')),
      out('noins', 'report', [0.3, 1], 1, T('Selgus, et süüdlase sõidukil puudub liikluskindlustus. Alustati väärteomenetlust.', 'It turned out the at-fault car was uninsured. Misdemeanour proceedings opened.')),
      out('drunk', 'arrest', [0.5, 1], 1, T('Süüdlasel tuvastati joove. Alustati menetlust, juht peeti kinni.', 'The at-fault driver was found intoxicated. Proceedings opened, the driver was detained.'), { arrests: 1 }),
      out('left', 'unfounded', [0, 0.4], 2, T('Osalised olid patrulli saabumise ajaks lahkunud.', 'The parties had left by the time the patrol arrived.')),
    ],
    expiresMin: 70,
    interactiveChance: 0.1,
    scenarios: SC_MINOR_CRASH,
  },
  {
    id: 'traffic_lo_vigastatutega',
    category: 'traffic',
    code: 'LÕK',
    title: T('Liiklusõnnetus inimkannatanuga', 'Injury collision'),
    priority: 1,
    weight: 0.6,
    hours: 'commute',
    weekendBoost: 1.2,
    places: ['highway', 'ruralroad', 'street'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('traffic')] },
    onScene: [45, 90],
    persons: [
      { role: 'driver', gender: 'any', age: [18, 85], intoxicated: 0.2, noLicense: 0.12, record: 0.2 },
      { role: 'victim', gender: 'any', age: [5, 85] },
      { role: 'witness', gender: 'any', age: [20, 70] },
    ],
    vehicles: [
      { role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.08 },
      { role: 'victim', kind: 'car', driverRole: 'victim' },
    ],
    agencies: [
      { agency: 'kiirabi', chance: 1, reason: T('Vigastatud osalised', 'Injured occupants') },
      { agency: 'paaste', chance: 0.7, reason: T('Kiilunud inimene, kütuselekke oht', 'Trapped occupant, fuel leak risk') },
    ],
    summary: [
      T('{address}. LÕ inimkannatanuga, sõiduauto katusel kraavis, 1 inimene sees. Kiirabi ja pääste väljas.', '{address}. Injury collision, a car on its roof in the ditch, 1 person inside. Ambulance and rescue dispatched.'),
      T('{address}. Laupkokkupõrge kahe sõiduauto vahel, {n} vigastatut, üks kiilunud. Liiklus seisab.', '{address}. Head-on collision between two cars, {n} injured, one trapped. Traffic at a standstill.'),
      T('{address}. Sõiduauto põrkas möödasõidul vastutulijaga, kannatanud teadvusel. Teataja annab esmaabi.', '{address}. A car hit an oncoming vehicle while overtaking; the casualties are conscious. The caller is giving first aid.'),
    ],
    callerLines: [
      T('Siin on kohutav õnnetus, auto on katuse peal ja keegi on sees! Palun kiiresti!', 'There is a terrible crash here, the car is on its roof and someone is inside! Please hurry!'),
      T('Kaks autot laupkokkupõrkes, üks juht ei saa välja, tal on jalad kinni.', 'Two cars head-on, one driver cannot get out, his legs are trapped.'),
    ],
    details: [
      T('Sündmuskohal on kütuselõhn.', 'There is a smell of fuel at the scene.'),
      T('Tunnistaja sõnul tegi süüdlane ohtliku möödasõidu.', 'A witness says the at-fault driver made a dangerous overtake.'),
    ],
    beats: [
      agency('kiirabi', A_KIIRABI),
      choice(3, [T('{callsign}: maanteel tihe liiklus, päästjad töötavad. Kas sulgeme tee täielikult ja suuname ümber?', '{callsign}: heavy traffic, rescue is working. Do we close the road completely and divert?')], [
        opt('close', T('Sulgege tee', 'Close the road'), T('{callsign}, sulgege tee, ümbersuunamine kõrvalteele. Teavitame Transpordiametit.', '{callsign}, close the road and divert via the side road. We will inform the Transport Administration.'), { success: 0.1, time: 10 }),
        opt('lane', T('Üks rada lahti', 'Keep one lane open'), T('{callsign}, jätke üks rada vahelduvaks liikluseks, reguleerige käsitsi.', '{callsign}, keep one lane open for alternating traffic, direct it manually.'), { success: -0.05, risk: 0.05 }),
      ], 'close', { chance: 0.7 }),
      qPerson('driver', 8),
      agency('paaste', [T('{callsign}: juht on kiilunud, vajame päästjaid hüdrauliliste tööriistadega!', '{callsign}: the driver is trapped, we need rescue with hydraulic tools!')], { at: 2, chance: 0.5 }),
    ],
    outcomes: [
      out('treated', 'hospital', [0.45, 1], 5, T('Kannatanud toimetati haiglasse, nende elu ohus ei ole. Süüdlasele alustati menetlust, liiklus taastati kahe tunni pärast.', 'The casualties were taken to hospital and are not in danger. Proceedings against the at-fault driver; the road reopened after two hours.'), { injuries: 2 }),
      out('drunk', 'arrest', [0.5, 1], 2, T('Süüdlasel tuvastati joove. Ta peeti kinni, alustati kriminaalmenetlust KarS § 424 järgi.', 'The at-fault driver was found intoxicated. He was detained; criminal proceedings under Penal Code § 424.'), { arrests: 1, injuries: 1 }),
      out('serious', 'hospital', [0.2, 0.6], 2, T('Üks osaline toimetati raskes seisundis haiglasse. Liiklusõnnetuse asjaolude selgitamiseks alustati kriminaalmenetlust.', 'One person was taken to hospital in a serious condition. Criminal proceedings opened to establish the circumstances.'), { injuries: 2 }),
      out('fatal', 'tragedy', [0, 0.25], 1, T('Üks osaline hukkus sündmuskohal. Alustati kriminaalmenetlust, sündmuskohal töötasid uurijad.', 'One person died at the scene. Criminal proceedings opened; investigators worked at the scene.'), { injuries: 2 }),
    ],
    expiresMin: 90,
    interactiveChance: 0.35,
    call: {
      mood: 'panic',
      opening: [
        T('Appi, siin on avarii! Auto on katuse peal ja keegi on sees, ta ei liigu!', 'Help, there has been a crash! The car is on its roof and someone is inside, not moving!'),
        T('Kaks autot põrkasid kokku, igal pool on klaasi, üks naine karjub!', 'Two cars collided, there is glass everywhere, a woman is screaming!'),
      ],
      answers: {
        injured: [T('Üks on teadvusel, teine ei vasta. Verd on palju.', 'One is conscious, the other is not answering. There is a lot of blood.')],
        count: [T('Kaks autot, vist kolm inimest.', 'Two cars, three people I think.')],
        where: [T('{address}, vahetult pärast silda.', '{address}, just past the bridge.')],
        safe: [T('Ma panin ohukolmnurga, autod sõidavad mööda.', 'I put out the warning triangle, cars are passing.')],
      },
      openingRu: ['Помогите, авария! Машина перевернулась, внутри человек, он не двигается!'],
    },
  },
  {
    id: 'traffic_lo_uhissoiduk',
    category: 'traffic',
    code: 'LÕ',
    title: T('Liiklusõnnetus ühissõidukiga', 'Collision involving a bus or tram'),
    priority: 2,
    weight: 0.15,
    hours: 'commute',
    places: ['street', 'busstation'],
    units: { need: [u('patrol')], ideal: [u('patrol'), u('traffic')] },
    onScene: [35, 60],
    persons: [
      { role: 'driver', gender: 'any', age: [18, 80], intoxicated: 0.1, noLicense: 0.1 },
      { role: 'witness', gender: 'any', age: [28, 64], relation: 'employee' },
      { role: 'victim', gender: 'any', age: [55, 88] },
    ],
    vehicles: [
      { role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.06 },
      { role: 'involved', kind: 'bus', driverRole: 'witness' },
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.7, reason: T('Bussis kukkunud reisijad', 'Passengers who fell inside the bus') }],
    summary: [
      T('{address}. Liinibuss ja sõiduauto põrkasid kokku. Bussis kukkus järsu pidurduse tõttu {n} reisijat, üks eakas kaebab puusavalu.', '{address}. A city bus and a car collided. {n} passengers fell when the bus braked hard; an elderly passenger has hip pain.'),
      T('{address}. Tramm ja sõiduauto ristmikul, trammiliiklus seisab. Autojuht väidab, et tal oli roheline tuli.', '{address}. Tram and car at a junction, tram traffic halted. The car driver insists he had a green light.'),
    ],
    callerLines: [
      T('Ma olen bussijuht, üks auto lõikas ette, pidin järsult pidurdama ja reisijad kukkusid.', 'I am the bus driver, a car cut in front of me, I had to brake hard and passengers fell.'),
      T('Tramm sõitis autole külje pealt sisse, liiklus on täiesti kinni.', 'The tram hit a car side-on, traffic is completely blocked.'),
    ],
    details: [T('Bussil on videosalvesti, salvestis säilitatakse.', 'The bus has a dash camera; the footage is being kept.')],
    beats: [
      agency('kiirabi', A_KIIRABI, { chance: 0.7 }),
      qPerson('driver', 4),
      qVehicle(6, { chance: 0.6 }),
      info(10, [T('{callsign}: reisijad suunatud järgmisele bussile, ühistranspordi dispetšer teavitatud.', '{callsign}: passengers moved to the next bus, the transit dispatcher informed.')], 0.5),
    ],
    outcomes: [
      out('resolved', 'report', [0.45, 1], 4, T('Õnnetus vormistati, süüdi oli sõiduauto juht. Kaks reisijat said kergeid vigastusi ja pöördusid ise EMO-sse.', 'The collision was recorded; the car driver was at fault. Two passengers had minor injuries and went to A&E themselves.'), { injuries: 2 }),
      out('hospital', 'hospital', [0.3, 0.8], 3, T('Eakas reisija toimetati puusavigastusega haiglasse. Alustati menetlust liiklusõnnetuse asjaolude selgitamiseks.', 'An elderly passenger was taken to hospital with a hip injury. Proceedings opened to establish the circumstances.'), { injuries: 1 }),
      out('chaos', 'report', [0, 0.4], 2, T('Liiklus seisis üle tunni, mitu reisijat lahkus enne ütluste andmist. Menetlus jätkub videosalvestise põhjal.', 'Traffic was blocked for over an hour and several passengers left before giving statements. The case continues on the camera footage.'), { injuries: 1 }),
    ],
    expiresMin: 80,
  },
  {
    id: 'traffic_kokkuporge_podraga',
    category: 'traffic',
    code: 'LÕ',
    title: T('Kokkupõrge põdraga', 'Collision with a moose'),
    priority: 2,
    weight: 0.3,
    hours: [1.2, 0.8, 0.6, 0.6, 0.8, 1.4, 1.6, 1.4, 0.8, 0.5, 0.4, 0.4, 0.4, 0.4, 0.5, 0.6, 0.9, 1.4, 1.8, 2, 1.8, 1.6, 1.4, 1.3],
    months: [5, 6, 9, 10, 11],
    places: ['highway', 'ruralroad'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [30, 60],
    persons: [
      { role: 'driver', gender: 'any', age: [18, 80], intoxicated: 0.05, noLicense: 0.05 },
      { role: 'victim', gender: 'any', age: [5, 80] },
    ],
    vehicles: [{ role: 'involved', kind: 'car', driverRole: 'driver' }],
    agencies: [
      { agency: 'kiirabi', chance: 0.5, reason: T('Sõitjatel võimalikud vigastused', 'Possible injuries to the occupants') },
      { agency: 'keskkonnaamet', chance: 0.6, reason: T('Hukkunud või vigastatud suurulukk, kohaliku jahimehe kaasamine', 'Dead or injured large game, local hunter to attend') },
    ],
    summary: [
      T('{address}. Sõiduauto põrkas kokku põdraga, esiklaas purunenud. Sõitjad teadvusel, juhil peavalu.', '{address}. A car hit a moose; the windscreen is smashed. The occupants are conscious, the driver has a headache.'),
      T('{address}. Kokkupõrge põdraga hämaras, loom lamab sõidurajal, vigastatud. Liiklus peab looma ümber põikama.', '{address}. Collision with a moose at dusk; the injured animal is lying in the lane. Traffic has to swerve around it.'),
      T('{address}. Auto sõitis põtra vältides kraavi. Põder lahkus metsa, juht šokis.', '{address}. A car swerved to avoid a moose and went into the ditch. The moose ran into the forest; the driver is in shock.'),
    ],
    callerLines: [
      T('Põder hüppas otse auto ette, ma ei jõudnud midagi teha. Klaas on katki, laps on tagaistmel.', 'A moose jumped right in front of the car, I could not do anything. The glass is broken, my child is in the back seat.'),
      T('Põder lamab keset teed ja liigutab veel. Autod kihutavad mööda, keegi sõidab otsa!', 'The moose is lying in the middle of the road and still moving. Cars are speeding past, someone will hit it!'),
    ],
    details: [
      T('Põder on suur isasloom, sarved teel.', 'The moose is a large bull, antlers across the road.'),
      T('Tee on märg ja valgustamata.', 'The road is wet and unlit.'),
    ],
    beats: [
      qPerson('driver', 'arrive'),
      choice(3, [T('{callsign}: põder on raskelt vigastatud ja piinleb teepeenral. Jahimees jõuab kohale alles 40 minutiga.', '{callsign}: the moose is badly injured and suffering on the verge. The hunter will take 40 minutes.')], [
        opt('put_down', T('Lõpetage looma piinad', 'Put the animal down'), T('{callsign}, tagage ohutus ja lõpetage looma piinad teenistusrelvaga, vormistage relvakasutus.', '{callsign}, make it safe and put the animal down with your service weapon; file the use-of-weapon report.'), { success: 0.1, time: 10 }),
        opt('wait', T('Oodake jahimeest', 'Wait for the hunter'), T('{callsign}, piirake ala ja oodake jahimeest.', '{callsign}, cordon the area and wait for the hunter.'), { time: 25 }),
      ], 'wait', { chance: 0.5 }),
      info(6, [T('{callsign}: ohukolmnurgad ja vilkurid üleval, liiklus suunatud vastassuuna rajale.', '{callsign}: warning triangles and lights out, traffic routed via the opposite lane.')]),
    ],
    outcomes: [
      out('handled', 'resolved', [0.4, 1], 5, T('Liiklusõnnetus vormistati, sõitjad said kergelt viga. Hukkunud põder anti üle jahiseltsile, tee puhastati.', 'The collision was recorded; the occupants had minor injuries. The dead moose was handed to the hunting club and the road cleared.')),
      out('hospital', 'hospital', [0.2, 0.7], 2, T('Juht toimetati peavigastuse kontrolliks haiglasse. Auto teisaldati puksiiriga.', 'The driver was taken to hospital to check for a head injury. The car was towed.'), { injuries: 1 }),
      out('second', 'hospital', [0, 0.3], 1, T('Enne ala tähistamist sõitis teine auto teel lamavale põdrale otsa. Üks inimene toimetati haiglasse.', 'Before the area was marked, a second car struck the moose on the road. One person was taken to hospital.'), { injuries: 2 }),
    ],
    expiresMin: 75,
    tags: ['animal'],
  },
  {
    id: 'traffic_kihutaja',
    category: 'traffic',
    code: 'LJ',
    title: T('Kihutaja', 'Speeding driver'),
    priority: 3,
    weight: 0.7,
    hours: 'evening',
    weekendBoost: 1.3,
    places: ['street', 'highway', 'residential'],
    units: { need: [u('patrol')], ideal: [u('traffic')] },
    onScene: [15, 30],
    persons: [
      { role: 'caller', gender: 'any', age: [25, 80] },
      { role: 'driver', gender: 'M', age: [18, 32], noLicense: 0.2, record: 0.3, intoxicated: 0.1 },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInspection: 0.2, noInsurance: 0.08 }],
    summary: [
      T('{address}. Elurajoonis kihutab {car} edasi-tagasi, teataja hinnangul üle 100 km/h. Lapsed mängivad tänaval.', '{address}. A {car} keeps racing up and down a residential street, over 100 km/h in the caller’s estimate. Children are playing in the street.'),
      T('{address}. Sõiduauto {plate} kihutab ja teeb järske möödasõite, liigub {direction}.', '{address}. Car {plate} is speeding and making sharp overtakes, moving {direction}.'),
    ],
    callerLines: [
      T('Iga õhtu sama asi: üks poiss sõidab siit läbi nagu rajal, kunagi jääb laps alla!', 'Every evening the same thing: a lad drives through here like it is a racetrack, one day a child will get hit!'),
      T('Ta möödus minust pidevjoonel ja kihutas vähemalt 150-ga!', 'He overtook me on a solid line doing at least 150!'),
    ],
    details: [T('Sõidukil on vali summuti ja toonitud esiklaasid.', 'The car has a loud exhaust and tinted front windows.')],
    beats: [
      qVehicle('arrive'),
      qPerson('driver', 3),
      pursuit(1, [T('{callsign}: kihutaja ei peatu, kiirendab {direction}!', '{callsign}: the speeder will not stop, accelerating {direction}!')], 0.1),
    ],
    outcomes: [
      out('fined', 'fine', [0.45, 1], 4, T('Juht peatati, kiiruseületamine fikseeriti. Määrati trahv LS § 262 järgi, toonitud klaasid tuleb eemaldada.', 'The driver was stopped and the speeding recorded. Fined under Traffic Act § 262; the tinted windows must be removed.')),
      out('nolicense', 'report', [0.5, 1], 1, T('Selgus, et juhil puudub juhtimisõigus. Alustati väärteomenetlust, sõiduk teisaldati.', 'It turned out the driver has no licence. Misdemeanour proceedings opened, car towed.')),
      out('warned', 'warning', [0.3, 0.8], 2, T('Juht leiti kodu juurest ja teda hoiatati. Piirkonda lisati liiklusjärelevalve.', 'The driver was found at home and warned. Traffic enforcement was added to the area.')),
      out('gone', 'escaped', [0, 0.35], 2, T('Kihutajat ei leitud. Numbrimärk edastati liiklusjärelevalvele.', 'The speeder was not found. The plate was passed to traffic enforcement.')),
    ],
    expiresMin: 60,
    tags: ['vehicle_flee'],
  },
  {
    id: 'traffic_vastassuunas_soitja',
    category: 'traffic',
    code: 'VSS',
    title: T('Vastassuunas sõitja maanteel', 'Wrong-way driver on the highway'),
    priority: 1,
    weight: 0.05,
    hours: 'night',
    places: ['highway'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('traffic')] },
    onScene: [20, 40],
    persons: [
      { role: 'driver', gender: 'any', age: [18, 92], intoxicated: 0.4, noLicense: 0.2 },
      { role: 'caller', gender: 'any', age: [20, 70] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.05 }],
    summary: [
      T('{address}. Neljarealisel maanteel sõidab sõiduauto vastassuunas! Mitu teadet, autod põiklevad. Liigub {direction}.', '{address}. A car is driving the wrong way on the dual carriageway! Several reports, vehicles swerving. Moving {direction}.'),
      T('{address}. Vastassuunas sõitja, {car}, tuled põlevad, kiirus u 80 km/h. Teatajad vilgutavad tulesid.', '{address}. Wrong-way driver, {car}, headlights on, speed about 80 km/h. Callers are flashing their lights.'),
    ],
    callerLines: [
      T('Minu rajal tuli auto otse vastu! Ta sõidab valel pool, see on hullumeelne!', 'A car came straight at me in my lane! He is on the wrong side, it is insane!'),
      T('Vastassuunas sõitja, ma vaevu jõudsin kõrvale põigata!', 'Wrong-way driver, I barely managed to swerve!'),
    ],
    details: [
      T('Häirekeskus on saanud viis teadet kolme minuti jooksul.', 'The ERC has received five reports within three minutes.'),
      T('Üks teataja arvab, et roolis on eakas inimene.', 'One caller thinks an elderly person is at the wheel.'),
    ],
    beats: [
      info('arrive', [T('{callsign}: oleme pealesõidul, paneme vilkurid ja hoiatame liiklust. Juhtimiskeskus, palun sulgege järgmine pealesõit.', '{callsign}: we are at the slip road with lights on, warning traffic. Control, please close the next on-ramp.')]),
      choice(2, [T('{callsign}: vastassuunas sõitja läheneb meile. Kas blokeerime raja patrullautoga?', '{callsign}: the wrong-way driver is approaching us. Do we block the lane with the patrol car?')], [
        opt('block', T('Blokeerige rada', 'Block the lane'), T('{callsign}, blokeerige rada vilkuritega, hoidke autost eemale.', '{callsign}, block the lane with lights on and stay clear of the car.'), { success: 0.2, risk: 0.1 }),
        opt('warn', T('Ainult hoiatage liiklust', 'Only warn traffic'), T('{callsign}, ärge blokeerige, peatage pärisuunaline liiklus.', '{callsign}, do not block, stop the traffic going the right way.'), { success: -0.05, risk: -0.05 }),
      ], 'block', { timeoutMin: 1.5 }),
      qPerson('driver', 5),
    ],
    outcomes: [
      out('stopped', 'resolved', [0.5, 1], 3, T('Sõiduk peatati ohutult. Eakas juht oli eksinud, juhtimisõigus peatati terviseseisundi kontrollini.', 'The car was stopped safely. The elderly driver had become disoriented; the licence was suspended pending a medical check.')),
      out('drunk', 'arrest', [0.5, 1], 3, T('Juht peatati, tuvastati raske joove. Alustati kriminaalmenetlust KarS § 424 järgi, juht peeti kinni.', 'The driver was stopped and found heavily intoxicated. Criminal proceedings under Penal Code § 424, driver detained.'), { arrests: 1 }),
      out('exited', 'escaped', [0.2, 0.6], 2, T('Sõiduk lahkus maanteelt mahasõidul enne patrulli saabumist ja jäi leidmata.', 'The car left the highway at an exit before the patrol arrived and was not found.')),
      out('crash', 'tragedy', [0, 0.2], 1, T('Vastassuunas sõitja põrkas kokku sõiduautoga. Kannatanud toimetati haiglasse, ühe elu ei õnnestunud päästa.', 'The wrong-way driver collided with a car. The injured were taken to hospital; one person could not be saved.'), { injuries: 3 }),
    ],
    expiresMin: 20,
    interactiveChance: 0.4,
    tags: ['dui'],
  },
  {
    id: 'traffic_juht_magab_ristmikul',
    category: 'traffic',
    code: 'JJ',
    title: T('Juht magab roolis ristmikul', 'Driver asleep at the wheel at a junction'),
    priority: 2,
    weight: 0.35,
    hours: 'night',
    weekendBoost: 1.3,
    places: ['street'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [20, 45],
    persons: [
      { role: 'driver', gender: 'M', age: [19, 70], intoxicated: 0.7, noLicense: 0.25, record: 0.3 },
      { role: 'caller', gender: 'any', age: [20, 65] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.1, stolen: 0.03 }],
    agencies: [{ agency: 'kiirabi', chance: 0.3, reason: T('Võimalik terviserike (nt diabeet)', 'Possible medical emergency (e.g. diabetes)') }],
    summary: [
      T('{address}. Ristmikul seisab fooris sõiduauto {car}, mootor käib, juht magab roolis. Tuli on mitu korda roheliseks läinud.', '{address}. A {car} is stopped at the lights, engine running, the driver asleep at the wheel. The light has gone green several times.'),
      T('{address}. Juht ei reageeri signaalidele ega koputusele, auto on käigus ja jalg piduril. Teataja kahtlustab joovet või terviseriket.', '{address}. The driver does not respond to horns or knocking; the car is in gear with a foot on the brake. The caller suspects drink or a medical problem.'),
    ],
    callerLines: [
      T('Siin on keegi fooris roolis magama jäänud, auto on käigus! Ma koputasin, ta ei ärka!', 'Someone has fallen asleep at the wheel at the lights, the car is in gear! I knocked, he will not wake up!'),
      T('Ta pea on rooli peal, ma ei tea, kas ta on purjus või haige.', 'His head is on the wheel, I do not know if he is drunk or ill.'),
    ],
    details: [T('Kõrvalistmel on avatud õllepurk.', 'There is an open beer can on the passenger seat.')],
    beats: [
      choice('arrive', [T('{callsign}: juht ei reageeri, uksed lukus, auto on käigus. Kas lõhume akna?', '{callsign}: the driver is unresponsive, doors locked, car in gear. Do we break a window?')], [
        opt('break', T('Lõhkuge aken', 'Break the window'), T('{callsign}, lõhkuge kõrvalakna klaas, lülitage mootor välja ja kontrollige elutähtsaid näitajaid.', '{callsign}, break a side window, turn off the engine and check vital signs.'), { success: 0.15 }),
        opt('wait', T('Proovige äratada', 'Try to wake him'), T('{callsign}, proovige veel äratada, blokeerige auto ette patrullautoga.', '{callsign}, keep trying to wake him, block the front with the patrol car.'), { time: 10, risk: 0.05 }),
      ], 'break', { timeoutMin: 2 }),
      qPerson('driver', 3),
      qVehicle(5, { chance: 0.5 }),
      agency('kiirabi', A_KIIRABI, { at: 2, chance: 0.3 }),
    ],
    outcomes: [
      out('drunk', 'arrest', [0.5, 1], 4, T('Juht oli raskes joobes. Joove tuvastati haiglas, alustati kriminaalmenetlust KarS § 424 järgi.', 'The driver was heavily intoxicated, confirmed at hospital. Criminal proceedings under Penal Code § 424.'), { arrests: 1 }),
      out('medical', 'hospital', [0.4, 1], 2, T('Juhil oli madal veresuhkur. Kiirabi andis abi ja toimetas ta haiglasse, auto teisaldati.', 'The driver had low blood sugar. Paramedics treated him and took him to hospital; the car was towed.'), { injuries: 1 }),
      out('tired', 'warning', [0.3, 0.8], 1, T('Kaine juht oli pärast öövahetust magama jäänud. Teda hoiatati, auto pargiti ohutult.', 'The sober driver had nodded off after a night shift. He was warned and the car parked safely.')),
      out('rolled', 'report', [0, 0.35], 2, T('Auto veeres enne patrulli saabumist ristmikule ja põrkas vastu postkasti. Joobes juht peeti kinni.', 'Before the patrol arrived the car rolled into the junction and hit a post box. The drunk driver was detained.'), { arrests: 1 }),
    ],
    expiresMin: 40,
    tags: ['dui'],
  },
  {
    id: 'traffic_soiduk_kraavis',
    category: 'traffic',
    code: 'LÕ',
    title: T('Sõiduk sõitis kraavi', 'Vehicle in the ditch'),
    priority: 2,
    weight: 0.8,
    hours: 'commute',
    seasons: ['winter'],
    places: ['highway', 'ruralroad'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [25, 50],
    persons: [
      { role: 'driver', gender: 'any', age: [18, 85], intoxicated: 0.15, noLicense: 0.1 },
      { role: 'caller', gender: 'any', age: [20, 70] },
    ],
    vehicles: [{ role: 'involved', kind: 'car', driverRole: 'driver', noInsurance: 0.05 }],
    agencies: [
      { agency: 'kiirabi', chance: 0.3, reason: T('Juhi vigastuste kontroll', 'Check the driver for injuries') },
      { agency: 'transpordiamet', chance: 0.4, reason: T('Klaasjää: teehooldusele libedustõrje tellimine', 'Black ice: request gritting from road maintenance') },
    ],
    summary: [
      T('{address}. Sõiduauto libises jäisel teel kraavi ja jäi külili. Juht väljas, kaebab käevalu.', '{address}. A car slid on the icy road into the ditch and is on its side. The driver is out and complaining of arm pain.'),
      T('{address}. Lumetuisus sõitis auto teelt välja, sõiduk osaliselt teel, ohustab liiklust.', '{address}. In blowing snow a car left the road; the vehicle is partly on the carriageway and endangering traffic.'),
      T('{address}. Teataja nägi, kuidas {car} sõitis kurvis otse kraavi. Juhti pole näha.', '{address}. The caller saw a {car} go straight on at a bend into the ditch. The driver cannot be seen.'),
    ],
    callerLines: [
      T('Tee on nagu klaas, üks auto libises otse kraavi ja on külili!', 'The road is like glass, a car slid straight into the ditch and is on its side!'),
      T('Mu auto on kraavis, ma ei saa välja. Ma ei ole viga saanud, aga siin on külm.', 'My car is in the ditch, I cannot get out. I am not hurt, but it is cold here.'),
    ],
    details: [
      T('Teekate on lumine ja klaasjäine, piirkonnas mitu sarnast teadet.', 'The road surface is snowy and glazed; several similar reports in the area.'),
      T('Juhi sõnul pimestas teda vastutulija.', 'The driver says an oncoming car dazzled him.'),
    ],
    beats: [
      qPerson('driver', 'arrive'),
      qVehicle(3, { chance: 0.5 }),
      info(6, [T('{callsign}: tee on väga libe, palun teavitage teehooldust. Ohukolmnurk üleval.', '{callsign}: the road is very slippery, please notify road maintenance. Warning triangle out.')]),
    ],
    outcomes: [
      out('towed', 'resolved', [0.4, 1], 5, T('Juht ei saanud viga, sõiduk tõmmati puksiiriga kraavist välja. Teehooldust teavitati libedusest.', 'The driver was unhurt and the car was pulled out by a tow truck. Road maintenance was told about the ice.')),
      out('drunk', 'arrest', [0.45, 1], 1, T('Juhil tuvastati joove. Alustati menetlust joobes juhtimise asjas, juht peeti kinni.', 'The driver was found intoxicated. Drunk-driving proceedings opened, driver detained.'), { arrests: 1 }),
      out('hurt', 'hospital', [0.2, 0.7], 2, T('Juht toimetati käeluumurru kahtlusega haiglasse.', 'The driver was taken to hospital with a suspected broken arm.'), { injuries: 1 }),
      out('second', 'hospital', [0, 0.3], 1, T('Enne ala tähistamist libises teine sõiduk samasse kohta. Üks inimene viidi haiglasse.', 'Before the scene was marked a second car slid off at the same spot. One person was taken to hospital.'), { injuries: 2 }),
    ],
    expiresMin: 80,
  },
  {
    id: 'traffic_jaatee_rikkuja',
    category: 'traffic',
    code: 'JÄÄ',
    title: T('Jäätee rikkuja', 'Ice road violation'),
    priority: 3,
    weight: 0.2,
    months: [1, 2, 3],
    regions: ['laane', 'louna'],
    places: ['lake', 'beach', 'port'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [20, 45],
    persons: [
      { role: 'driver', gender: 'M', age: [20, 70], noLicense: 0.15, intoxicated: 0.2, record: 0.2 },
      { role: 'caller', gender: 'any', age: [25, 70] },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.1 }],
    agencies: [{ agency: 'transpordiamet', chance: 0.5, reason: T('Jäätee haldaja teavitamine, vajadusel tee sulgemine', 'Notify the ice road operator, close the road if needed') }],
    summary: [
      T('{address}. Jääteel peatus sõiduauto {car}, juht ja kaassõitja pildistavad jääl. Järgmised autod peavad mööduma.', '{address}. A {car} has stopped on the ice road; the driver and passenger are taking photos on the ice. Following cars have to pass them.'),
      T('{address}. Jääteele sõitis kaubik, mis teataja hinnangul ületab lubatud massi. Jää ragiseb.', '{address}. A van has driven onto the ice road that the caller thinks is over the permitted weight. The ice is cracking.'),
      T('{address}. Jääteel sõidetakse pärast sulgemisaega pimedas, sõiduk {plate} möödus teistest ja ei hoia vahet.', '{address}. Someone is driving the ice road after closing time in the dark; vehicle {plate} overtook others and is not keeping its distance.'),
      T('{address}. Sõiduk {plate} kihutab jääteel teataja hinnangul üle 70 km/h, sõitjad on turvavöödega kinnitatud.', '{address}. Vehicle {plate} is speeding on the ice road at over 70 km/h by the caller’s estimate, with the occupants’ seat belts fastened.'),
    ],
    callerLines: [
      T('Üks auto seisab keset jääteed ja inimesed teevad pilte! Jääl ei tohi ju peatuda!', 'A car is standing in the middle of the ice road and people are taking pictures! You are not allowed to stop on the ice!'),
      T('Mingi raske kaubik sõitis jääle, ma kuulen, kuidas jää praksub.', 'Some heavy van drove onto the ice, I can hear the ice cracking.'),
    ],
    details: [
      T('Jääteel kehtib piirang: pikivahe vähemalt 250 m, peatumine keelatud, turvavöö tuleb lahti hoida.', 'Ice road rules: at least 250 m between vehicles, no stopping, seat belts must be left unfastened.'),
      T('Jää paksus on viimastel päevadel sulailma tõttu vähenenud.', 'The ice has thinned in recent days because of a thaw.'),
    ],
    beats: [
      qVehicle('arrive'),
      qPerson('driver', 3),
      choice(5, [T('{callsign}: jää praguneb sõiduki ümber. Kas suuname juhi kohe kaldale või kutsume päästjad?', '{callsign}: the ice is cracking around the vehicle. Do we send the driver to shore at once or call rescue?')], [
        opt('shore', T('Kohe kaldale', 'To shore now'), T('{callsign}, juhatage sõiduk aeglaselt kaldale, inimesed jalgsi eraldi.', '{callsign}, guide the vehicle slowly to shore, people walk separately.'), { success: 0.1, risk: 0.05 }),
        opt('rescue', T('Kutsuge päästjad', 'Call rescue'), T('{callsign}, inimesed jalgsi kaldale, sõiduk jääb paigale, päästjad teavitatud.', '{callsign}, people walk to shore, the vehicle stays put, rescue informed.'), { time: 20 }),
      ], 'shore', { chance: 0.35 }),
    ],
    outcomes: [
      out('fined', 'fine', [0.45, 1], 4, T('Juhile määrati trahv jäätee kasutamise nõuete rikkumise eest. Sõiduk juhatati kaldale.', 'The driver was fined for breaking the ice road rules. The vehicle was escorted to shore.')),
      out('warned', 'warning', [0.3, 0.8], 3, T('Juhti hoiatati ja talle selgitati jäätee nõudeid. Jäätee haldajat teavitati.', 'The driver was warned and the ice road rules were explained. The ice road operator was informed.')),
      out('drunk', 'arrest', [0.5, 1], 1, T('Juht oli joobes. Ta peeti kinni, alustati menetlust joobes juhtimise asjas.', 'The driver was intoxicated. He was detained; drunk-driving proceedings opened.'), { arrests: 1 }),
      out('sank', 'hospital', [0, 0.25], 1, T('Sõiduki esiosa vajus jääpragu. Sõitjad pääsesid ise välja, üks toimetati alajahtumisega haiglasse. Jäätee suleti.', 'The front of the vehicle broke through the ice. The occupants got out themselves; one was taken to hospital with hypothermia. The ice road was closed.'), { injuries: 1 }),
    ],
    expiresMin: 60,
  },
  {
    id: 'traffic_mootorratturid_kihutavad',
    category: 'traffic',
    code: 'LJ',
    title: T('Mootorratturid kihutavad', 'Motorcyclists speeding'),
    priority: 3,
    weight: 0.3,
    months: [5, 6, 7, 8, 9],
    hours: 'evening',
    weekendBoost: 1.4,
    places: ['highway', 'street', 'ruralroad'],
    units: { need: [u('patrol')], ideal: [u('traffic')] },
    onScene: [15, 35],
    persons: [
      { role: 'driver', gender: 'M', age: [17, 40], noLicense: 0.3, record: 0.25, intoxicated: 0.08 },
      { role: 'caller', gender: 'any', age: [25, 80] },
    ],
    vehicles: [{ role: 'suspect', kind: 'moto', driverRole: 'driver', noInsurance: 0.2, noInspection: 0.25, stolen: 0.05 }],
    summary: [
      T('{address}. Grupp mootorrattureid kihutab, teevad tagarattal sõitu ja möödasõite pidevjoonel. Liiguvad {direction}.', '{address}. A group of motorcyclists is speeding, pulling wheelies and overtaking on solid lines. Moving {direction}.'),
      T('{address}. Mootorratas {plate} sõidab teataja hinnangul üle 180 km/h, mitu korda edasi-tagasi.', '{address}. Motorcycle {plate} is doing over 180 km/h in the caller’s estimate, back and forth several times.'),
    ],
    callerLines: [
      T('Neli mootorratast lendasid siit mööda, üks sõitis tagarattal, autod pidid pidurdama!', 'Four motorbikes flew past here, one on its back wheel, cars had to brake!'),
      T('Iga suveõhtu sõidavad nad siin võidu, müra on talumatu ja varsti juhtub õnnetus.', 'Every summer evening they race here, the noise is unbearable and there will be an accident soon.'),
    ],
    details: [T('Ühel mootorrattal pole tagumist numbrimärki.', 'One of the motorcycles has no rear plate.')],
    beats: [
      qVehicle('arrive'),
      pursuit(1, [T('{callsign}: mootorrattur ei peatu, kiirendab {direction}!', '{callsign}: the motorcyclist will not stop, accelerating {direction}!')], 0.25),
      pursuitDecision(3, 0.3),
      qPerson('driver', 6, { chance: 0.7 }),
    ],
    outcomes: [
      out('fined', 'fine', [0.5, 1], 4, T('Mootorrattur peatati. Määrati trahv kiiruseületamise eest LS § 262 järgi, A-kategooria juhtimisõigus puudus, mistõttu sõiduk teisaldati.', 'The motorcyclist was stopped. Fined for speeding under Traffic Act § 262; he had no category A licence, so the bike was impounded.')),
      out('warned', 'warning', [0.3, 0.8], 2, T('Rattureid hoiatati, tehnilised puudused fikseeriti. Piirkonda lisati liiklusjärelevalve.', 'The riders were warned and defects noted. Traffic enforcement added to the area.')),
      out('gone', 'escaped', [0, 0.4], 2, T('Mootorratturid lahkusid enne patrulli saabumist.', 'The motorcyclists left before the patrol arrived.')),
      out('crash', 'hospital', [0, 0.2], 1, T('Põgenev mootorrattur kukkus kurvis. Ta toimetati raskes seisundis haiglasse.', 'The fleeing motorcyclist crashed on a bend. He was taken to hospital in a serious condition.'), { injuries: 1 }),
    ],
    expiresMin: 60,
    tags: ['vehicle_flee'],
  },
  {
    id: 'traffic_laps_autos_palavus',
    category: 'traffic',
    code: 'ABI',
    title: T('Laps üksi autos palavusega', 'Child left alone in a hot car'),
    priority: 1,
    weight: 0.1,
    months: [6, 7, 8],
    hours: 'day',
    places: ['parking', 'mall', 'shop'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [20, 40],
    persons: [
      { role: 'victim', gender: 'any', age: [1, 5] },
      { role: 'caller', gender: 'any', age: [20, 70] },
      { role: 'suspect', gender: 'any', age: [22, 45], relation: 'parent', intoxicated: 0.1 },
    ],
    vehicles: [{ role: 'involved', kind: 'car', driverRole: 'suspect' }],
    agencies: [
      { agency: 'kiirabi', chance: 0.6, reason: T('Lapse ülekuumenemine', 'Child overheating') },
      { agency: 'sotsiaal', chance: 0.5, reason: T('Lastekaitse teavitamine', 'Notify child protection') },
    ],
    summary: [
      T('{address}. Parklas päikese käes seisvas autos on väike laps üksi, aknad suletud. Laps nutab, välistemperatuur +28. Auto: {car}.', '{address}. A small child is alone in a {car} parked in the sun, windows closed. The child is crying, it is +28 outside.'),
      T('{address}. Lukustatud sõiduautos magab umbes 2-aastane laps, higine ja punane. Vanemat pole näha juba 20 minutit.', '{address}. A child of about 2 is asleep in a locked car, sweaty and flushed. No parent seen for 20 minutes.'),
    ],
    callerLines: [
      T('Siin autos on beebi üksi, aknad kinni, päike lõõmab! Laps on täiesti punane!', 'There is a baby alone in this car, windows shut, the sun is blazing! The child is bright red!'),
      T('Me koputame aknale, aga laps ei reageeri hästi. Mida me teeme, kas lõhume klaasi?', 'We are knocking on the window but the child is barely responding. What do we do, break the glass?'),
    ],
    details: [
      T('Kaubanduskeskuse turvatöötaja teeb kuulutust omaniku leidmiseks.', 'The mall security guard is making an announcement to find the owner.'),
      T('Auto sisetemperatuur on hinnanguliselt üle 45 kraadi.', 'The temperature inside the car is estimated at over 45 degrees.'),
    ],
    beats: [
      choice('arrive', [T('{callsign}: laps on loid ja higine, vanemat pole. Kas lõhume akna?', '{callsign}: the child is limp and sweaty, no parent. Do we break a window?')], [
        opt('break', T('Lõhkuge aken', 'Break the window'), T('{callsign}, lõhkuge lapsest kaugeim aken, võtke laps varju ja jahutage.', '{callsign}, break the window furthest from the child, get the child into the shade and cool them.'), { success: 0.25 }),
        opt('wait', T('Oodake omanikku', 'Wait for the owner'), T('{callsign}, oodake veel, turvatöötaja otsib omanikku.', '{callsign}, wait a little longer, security is looking for the owner.'), { success: -0.25, time: 10 }),
      ], 'break', { timeoutMin: 1.5 }),
      qVehicle(4, { radio: [T('{callsign}: kontrolli palun sõiduki {plate} omanikku, vajame vanema kontakti.', '{callsign}: please check the owner of {plate}, we need the parent’s contact.')] }),
      agency('kiirabi', A_KIIRABI, { at: 2, chance: 0.6 }),
      qPerson('suspect', 12, { chance: 0.7, radio: [T('{callsign}: vanem saabus. Kontrolli palun: {name}, isikukood {idcode}.', '{callsign}: the parent has arrived. Please check: {name}, ID code {idcode}.')] }),
    ],
    outcomes: [
      out('saved', 'resolved', [0.5, 1], 4, T('Laps võeti autost välja ja jahutati, kiirabi hinnangul tervis ohus ei ole. Lastekaitset teavitati, vanema suhtes alustati menetlust.', 'The child was taken out and cooled; paramedics say the child is not in danger. Child protection was notified and proceedings opened against the parent.')),
      out('hospital', 'hospital', [0.25, 0.75], 3, T('Laps toimetati ülekuumenemisega haiglasse jälgimisele. Vanema suhtes alustati menetlust lapse abituses olukorda jätmise asjas.', 'The child was taken to hospital for observation with heat exhaustion. Proceedings opened against the parent for leaving a child in danger.'), { injuries: 1 }),
      out('parent', 'warning', [0.35, 1], 1, T('Vanem saabus enne akna lõhkumist. Laps oli korras, vanemale tehti hoiatus ja teavitati lastekaitset.', 'The parent returned before the window was broken. The child was fine; the parent was warned and child protection informed.')),
      out('critical', 'hospital', [0, 0.25], 1, T('Laps oli kriitilises seisundis ja toimetati kiirabiga intensiivravisse. Alustati kriminaalmenetlust.', 'The child was in a critical condition and taken to intensive care. Criminal proceedings opened.'), { injuries: 1 }),
    ],
    expiresMin: 25,
    interactiveChance: 0.4,
    call: {
      mood: 'panic',
      opening: [
        T('Tere, siin parklas on väike laps üksi autos ja on nii palav! Ta nutab ja on täiesti punane!', 'Hello, there is a little child alone in a car in the car park and it is so hot! The child is crying and completely red!'),
        T('Palun aidake, beebi on lukustatud autos, me ei leia vanemaid!', 'Please help, a baby is locked in a car, we cannot find the parents!'),
      ],
      answers: {
        children: [T('Üks laps, umbes kaheaastane, turvatoolis.', 'One child, about two, in a car seat.')],
        injured: [T('Ta hingab, aga on loid ja higine.', 'Breathing, but limp and sweaty.')],
        vehicle: [T('{car}, number {plate}.', '{car}, plate {plate}.')],
        where: [T('{place}, parkla päikesepoolses otsas.', '{place}, the sunny end of the car park.')],
      },
      openingRu: ['Помогите, в машине на парковке один маленький ребёнок, очень жарко, он весь красный!'],
    },
  },
  {
    id: 'traffic_juhtimisoiguseta_juht',
    category: 'traffic',
    code: 'LJ',
    title: T('Juhtimisõiguseta juht', 'Disqualified driver'),
    priority: 3,
    weight: 0.35,
    hours: 'day',
    places: ['street', 'residential', 'ruralroad', 'village'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [20, 40],
    persons: [
      { role: 'caller', gender: 'any', age: [25, 75] },
      { role: 'driver', gender: 'M', age: [19, 60], noLicense: 0.95, record: 0.6, intoxicated: 0.2, known: true },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.2, noInspection: 0.25 }],
    summary: [
      T('{address}. Teataja sõnul juhib tuttav mees, kellelt juhtimisõigus kohtuotsusega ära võeti, taas autot: {car}, numbrimärk {plate}. Liigub {direction}.', '{address}. The caller says a man he knows, who was disqualified by a court, is driving again: {car}, plate {plate}. Moving {direction}.'),
      T('{address}. Külas sõidab noormees ilma lubadeta ema autoga, on mitu korda nähtud. Praegu pargib poe ees.', '{address}. A young man is driving his mother’s car in the village without a licence, seen several times. Currently parking outside the shop.'),
    ],
    callerLines: [
      T('Temal on load ära võetud purjuspäi sõitmise eest, aga ta sõidab iga päev tööle!', 'He lost his licence for drink-driving but he drives to work every day!'),
      T('See poiss on 16, aga sõidab siin külas emme autoga ringi.', 'That boy is 16 but he drives around the village in his mum’s car.'),
    ],
    details: [T('Sõiduk on registreeritud juhi elukaaslase nimele.', 'The car is registered to the driver’s partner.')],
    beats: [
      qVehicle('arrive'),
      qPerson('driver', 2),
      pursuit(1, [T('{callsign}: juht nägi meid ja põgeneb {direction}!', '{callsign}: the driver saw us and is fleeing {direction}!')], 0.12),
      transport('arrest', T_ARREST, { at: 12, chance: 0.4 }),
    ],
    outcomes: [
      out('caught', 'report', [0.5, 1], 4, T('Juht peatati, juhtimisõigus puudus. Korduva rikkumise tõttu alustati kriminaalmenetlust, sõiduk teisaldati.', 'The driver was stopped and had no licence. As a repeat offence, criminal proceedings were opened and the car impounded.'), { arrests: 1 }),
      out('misd', 'fine', [0.35, 0.9], 3, T('Juhtimisõiguseta juhile koostati väärteoprotokoll, auto võtmed anti omanikule.', 'A misdemeanour report was filed against the unlicensed driver; the keys were handed to the owner.')),
      out('notseen', 'unfounded', [0, 0.45], 2, T('Juhti sõidukist ei leitud. Info edastati piirkonnapolitseinikule.', 'The driver was not found with the car. Information passed to the community officer.')),
      out('escaped', 'escaped', [0, 0.3], 1, T('Juht põgenes ja jäi tabamata. Isik kuulutati tagaotsitavaks.', 'The driver fled and was not caught. He was put on the wanted list.')),
    ],
    expiresMin: 60,
    tags: ['vehicle_flee'],
  },
  {
    id: 'traffic_valgusfoorid_rikkis',
    category: 'traffic',
    code: 'LK',
    title: T('Valgusfoorid ei tööta', 'Traffic lights out of order'),
    priority: 3,
    weight: 0.15,
    hours: 'commute',
    places: ['street'],
    units: { need: [u('patrol')], ideal: [u('traffic')] },
    onScene: [30, 60],
    persons: [{ role: 'caller', gender: 'any', age: [20, 75] }],
    agencies: [{ agency: 'kov', chance: 0.8, reason: T('Valgusfoori remont: linna teehoolduse teavitamine', 'Traffic light repair: notify city road maintenance') }],
    referral: { agency: 'kov', chance: 0.3 },
    summary: [
      T('{address}. Suurel ristmikul ei tööta valgusfoorid, tipptunnil liiklus kaootiline, mitu peaaegu-kokkupõrget.', '{address}. The traffic lights at a major junction are out; rush-hour traffic is chaotic with several near misses.'),
      T('{address}. Foorid vilguvad kollaselt, ristmikul ummik. Teataja palub liiklusreguleerijat.', '{address}. The lights are flashing amber and the junction is jammed. The caller asks for someone to direct traffic.'),
    ],
    callerLines: [
      T('Ristmikul foorid ei tööta ja keegi ei tea, kes peab teed andma. Kohe juhtub õnnetus!', 'The lights at the junction are dead and nobody knows who should give way. There will be a crash any minute!'),
      T('Kas te saaksite kellegi liiklust reguleerima saata? Siin on täielik kaos.', 'Could you send someone to direct traffic? It is total chaos here.'),
    ],
    details: [T('Ümbruskonnas on elektrikatkestus.', 'There is a power cut in the surrounding area.')],
    beats: [
      choice('arrive', [T('{callsign}: tipptund, ristmik kinni. Kas jääme liiklust reguleerima kuni remondibrigaadi saabumiseni?', '{callsign}: rush hour, junction jammed. Do we stay and direct traffic until the repair crew arrives?')], [
        opt('direct', T('Reguleerige liiklust', 'Direct traffic'), T('{callsign}, jääge reguleerima, remondibrigaad on teavitatud.', '{callsign}, stay and direct traffic, the repair crew has been notified.'), { success: 0.15, time: 20 }),
        opt('signs', T('Ajutised märgid ja lahkuge', 'Temporary signs, then leave'), T('{callsign}, paigaldage ajutised eesõigusmärgid ja jätkake patrullimist.', '{callsign}, put up temporary priority signs and resume patrol.'), { success: -0.05, time: -10 }),
      ], 'direct'),
      info(10, [T('{callsign}: linna teehoolduse brigaad saabus, foorid taastatakse.', '{callsign}: the city maintenance crew has arrived, the lights are being restored.')], 0.6),
    ],
    outcomes: [
      out('directed', 'resolved', [0.45, 1], 4, T('Patrull reguleeris liiklust tund aega, kuni foorid taastati. Õnnetusi ei juhtunud.', 'The patrol directed traffic for an hour until the lights were restored. No collisions.')),
      out('referred', 'referred', [0.2, 1], 2, T('Rike edastati linna teehooldusele, ajutised märgid paigaldati.', 'The fault was passed to city road maintenance and temporary signs were put up.')),
      out('bump', 'report', [0, 0.4], 2, T('Enne patrulli saabumist toimus ristmikul kaks väiksemat kokkupõrget. Õnnetused vormistati.', 'Before the patrol arrived there were two minor collisions at the junction. Both were recorded.')),
    ],
    expiresMin: 90,
  },
  {
    id: 'traffic_toukerattur_vigastatud',
    category: 'traffic',
    code: 'LÕK',
    title: T('Elektritõukerattur vigastatud', 'E-scooter rider injured'),
    priority: 2,
    weight: 0.45,
    months: [4, 5, 6, 7, 8, 9, 10],
    hours: 'nightlife',
    weekendBoost: 1.4,
    places: ['street', 'park', 'oldtown'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [20, 40],
    persons: [
      { role: 'victim', gender: 'any', age: [14, 45], intoxicated: 0.5 },
      { role: 'witness', gender: 'any', age: [18, 60] },
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.9, reason: T('Peavigastus', 'Head injury') }],
    summary: [
      T('{address}. Renditõukerattur kukkus äärekivil, lamab maas, peast veritseb. Kiivrit polnud.', '{address}. A rental e-scooter rider fell at the kerb and is lying on the ground, head bleeding. No helmet.'),
      T('{address}. Tõukerattal sõitnud kaks noort kukkusid koos, üks ei tõuse. Pealtnägijate sõnul olid nad joobes.', '{address}. Two young people riding one e-scooter fell together; one is not getting up. Witnesses say they were drunk.'),
      T('{address}. Sõiduauto ja tõukerattur ülekäigurajal, rattur kaebab jalavalu.', '{address}. Car and e-scooter rider on a pedestrian crossing; the rider complains of leg pain.'),
    ],
    callerLines: [
      T('Üks tüdruk kukkus tõukerattalt ja lõi pea vastu äärekivi, ta on segaduses!', 'A girl fell off a scooter and hit her head on the kerb, she is confused!'),
      T('Kaks tükki sõitsid ühe tõukerattaga, mõlemad purjus, ja nüüd üks lamab maas.', 'Two of them were riding one scooter, both drunk, and now one is lying on the ground.'),
    ],
    details: [T('Tõukeratas on rendiettevõtte oma, sõit katkestati.', 'The scooter is a rental; the ride has been ended.')],
    beats: [
      agency('kiirabi', A_KIIRABI),
      qPerson('victim', 5, { chance: 0.5 }),
      info(8, [T('{callsign}: kannatanu kiirabis, tõukeratas viidud kõnniteelt eemale.', '{callsign}: casualty in the ambulance, scooter moved off the pavement.')], 0.5),
    ],
    outcomes: [
      out('hospital', 'hospital', [0.35, 1], 5, T('Kannatanu toimetati peavigastusega haiglasse. Juhtunu vormistati liiklusõnnetusena.', 'The casualty was taken to hospital with a head injury. The incident was recorded as a road traffic accident.'), { injuries: 1 }),
      out('fine', 'fine', [0.5, 1], 2, T('Kergelt vigastatud sõitjale määrati trahv joobes kergliikuri juhtimise eest.', 'The lightly injured rider was fined for riding a light vehicle under the influence.'), { injuries: 1 }),
      out('serious', 'hospital', [0, 0.35], 2, T('Sõitja toimetati raske peatraumaga haiglasse, asjaolusid selgitatakse.', 'The rider was taken to hospital with a serious head injury; the circumstances are being investigated.'), { injuries: 1 }),
    ],
    expiresMin: 40,
  },
  {
    id: 'traffic_raudteeylesoit',
    category: 'traffic',
    code: 'RAUD',
    title: T('Rong põrkas sõidukiga raudteeülesõidul', 'Train hit a vehicle at a level crossing'),
    priority: 1,
    weight: 0.025,
    places: ['ruralroad', 'village', 'trainstation'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('criminal')] },
    onScene: [60, 120],
    persons: [
      { role: 'driver', gender: 'any', age: [18, 88], intoxicated: 0.15, noLicense: 0.1 },
      { role: 'witness', gender: 'M', age: [30, 62], relation: 'employee' },
    ],
    vehicles: [{ role: 'involved', kind: 'car', driverRole: 'driver' }],
    agencies: [
      { agency: 'kiirabi', chance: 1, reason: T('Kannatanu sõidukis', 'Casualty in the vehicle') },
      { agency: 'paaste', chance: 0.9, reason: T('Sõiduki lõikamine, kütuseleke', 'Cutting the vehicle open, fuel leak') },
    ],
    summary: [
      T('{address}. Reisirong põrkas raudteeülesõidul kokku sõiduautoga. Sõiduauto paiskus tammilt alla, juht sees.', '{address}. A passenger train collided with a car at a level crossing. The car was thrown off the embankment with the driver inside.'),
      T('{address}. Valvamata ülesõidul jäi kaubik rööbastele, rong ei jõudnud pidurdada. Rongis {n} reisijat, vigastusi selgitatakse.', '{address}. A van was stuck on the rails at an unguarded crossing and the train could not stop. {n} passengers on board; injuries being assessed.'),
    ],
    callerLines: [
      T('Ma olen vedurijuht. Auto sõitis ülesõidule otse rongi ette, ma ei saanud midagi teha!', 'I am the train driver. A car drove onto the crossing right in front of the train, I could not do anything!'),
      T('Rong rammis autot ülesõidul, auto on täiesti puruks, palun kiiresti!', 'A train rammed a car at the crossing, the car is completely smashed, please hurry!'),
    ],
    details: [
      T('Rongiliiklus lõigul on peatatud, reisijad jäävad rongi.', 'Rail traffic on the section is stopped; passengers stay on the train.'),
      T('Ülesõidu tõkkepuud olid tunnistaja sõnul all.', 'A witness says the crossing barriers were down.'),
    ],
    beats: [
      agency('kiirabi', A_KIIRABI),
      agency('paaste', [T('{callsign}: juht on kiilunud ja auto lekib kütust, vajame päästjaid!', '{callsign}: the driver is trapped and the car is leaking fuel, we need rescue!')], { at: 2, chance: 0.7 }),
      qVehicle(6, { chance: 0.6 }),
      info(10, [T('{callsign}: raudtee juhtimiskeskus kinnitas lõigu sulgemise, reisijate ümberveoks tellitakse bussid.', '{callsign}: rail traffic control confirmed the section is closed; buses are being ordered for the passengers.')]),
    ],
    outcomes: [
      out('injured', 'hospital', [0.45, 1], 4, T('Autojuht toimetati raskes seisundis haiglasse, rongis vigastatuid ei olnud. Alustati menetlust õnnetuse asjaolude selgitamiseks.', 'The car driver was taken to hospital in a serious condition; nobody on the train was hurt. Proceedings opened to establish the circumstances.'), { injuries: 1 }),
      out('escaped', 'resolved', [0.6, 1], 1, T('Juht jõudis enne kokkupõrget autost välja hüpata. Vigastatuid ei olnud, rongiliiklus taastati kolme tunni pärast.', 'The driver jumped out of the car before the impact. Nobody was injured; rail traffic resumed three hours later.')),
      out('fatal', 'tragedy', [0, 0.35], 2, T('Autojuht hukkus sündmuskohal. Alustati kriminaalmenetlust, rongiliiklus taastati õhtul.', 'The car driver died at the scene. Criminal proceedings opened; rail traffic resumed in the evening.'), { injuries: 1 }),
      out('passengers', 'hospital', [0, 0.5], 1, T('Kokkupõrkes said vigastada ka {n} reisijat, nad toimetati haiglasse.', '{n} passengers were also injured in the collision and taken to hospital.'), { injuries: 3 }),
    ],
    expiresMin: 120,
    interactiveChance: 0.3,
  },
  {
    id: 'traffic_mittepeatumine',
    category: 'traffic',
    code: 'JÄL',
    title: T('Sõiduk ei peatu politsei märguande peale', 'Vehicle fails to stop for police'),
    priority: 1,
    weight: 0.25,
    hours: 'night',
    weekendBoost: 1.5,
    places: ['street', 'highway', 'ruralroad'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2), u('traffic')] },
    onScene: [25, 50],
    persons: [{ role: 'driver', gender: 'M', age: [16, 40], intoxicated: 0.5, noLicense: 0.55, record: 0.6, wanted: 0.12 }],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', stolen: 0.3, noInsurance: 0.25, noInspection: 0.3, suspended: 0.1 }],
    summary: [
      T('{address}. Patrull teatab: {car}, numbrimärk {plate}, eiras peatumismärguannet ja põgeneb {direction}.', '{address}. A patrol reports: {car}, plate {plate}, ignored the stop signal and is fleeing {direction}.'),
      T('{address}. ANPR-kaamera tuvastas sõiduki {plate}, patrull andis peatumismärguande, kuid juht kiirendas ja lülitas tuled välja.', '{address}. ANPR flagged vehicle {plate}; the patrol signalled it to stop, but the driver accelerated and switched off his lights.'),
      T('{address}. Liikluskontrollis pööras {car} ({plate}) ümber ja põgenes, kiirus üle 120 km/h.', '{address}. At a traffic checkpoint a {car} ({plate}) turned around and fled at over 120 km/h.'),
    ],
    details: [
      T('Sõidukis on vähemalt kaks inimest.', 'There are at least two people in the car.'),
      T('Sama sõiduk põgenes politsei eest ka eelmisel nädalal.', 'The same vehicle fled from police last week as well.'),
    ],
    beats: [
      pursuit('arrive', [
        T('{callsign}: {car}, {plate} ei peatu, sõidab {direction}! Alustame jälitust, kõik ekipaažid!', '{callsign}: {car}, {plate} not stopping, heading {direction}! Starting pursuit, all units!'),
        T('{callsign}: jälitame, sihtmärk kiirendab, tuled kustus!', '{callsign}: in pursuit, the target is accelerating with lights off!'),
      ]),
      qVehicle(1),
      pursuitDecision(4, 0.6),
      qPerson('driver', 8, { chance: 0.7 }),
    ],
    outcomes: [
      out('caught', 'arrest', [0.55, 1], 4, T('Sõiduk peatati teetõkkega. Juht oli joobes ja juhtimisõiguseta, ta peeti kinni. Alustati menetlust ka peatumismärguande eiramise eest.', 'The car was stopped with a roadblock. The driver was drunk and disqualified and was detained. Proceedings also opened for failing to stop.'), { arrests: 1 }),
      out('stolen', 'arrest', [0.5, 1], 2, T('Selgus, et auto oli varastatud. Juht ja kaassõitja peeti kinni, sõiduk tagastatakse omanikule.', 'The car turned out to be stolen. The driver and passenger were detained; the car will be returned to its owner.'), { arrests: 2 }),
      out('abandoned', 'report', [0.3, 0.7], 2, T('Juht jättis auto metsateele ja põgenes jalgsi. Sõiduk konfiskeeriti, isik tuvastati hiljem.', 'The driver dumped the car on a forest track and ran off. The car was seized and he was identified later.')),
      out('escaped', 'escaped', [0, 0.4], 2, T('Jälitus lõpetati ohutuse huvides, sõiduk jäi tabamata. Numbrimärk on tagaotsitavate nimekirjas.', 'The pursuit was terminated for safety and the car got away. The plate is on the wanted list.')),
      out('crash', 'hospital', [0, 0.2], 1, T('Põgenev sõiduk kaotas kontrolli ja põrkas vastu posti. Juht toimetati vigastustega haiglasse ja peeti seal kinni.', 'The fleeing car lost control and hit a pole. The driver was taken to hospital with injuries and arrested there.'), { injuries: 1, arrests: 1 }),
    ],
    expiresMin: 30,
    interactiveChance: 0,
    tags: ['vehicle_flee', 'field'],
  },
  {
    id: 'traffic_sundmuskohalt_lahkunud',
    category: 'traffic',
    code: 'LÕ',
    title: T('Õnnetuspaigalt lahkunud juht', 'Hit-and-run (property damage)'),
    priority: 3,
    weight: 0.6,
    hours: 'day',
    places: ['parking', 'street', 'mall'],
    units: { need: [u('patrol')], ideal: [u('patrol')] },
    onScene: [20, 40],
    persons: [
      { role: 'caller', gender: 'any', age: [20, 75] },
      { role: 'driver', gender: 'any', age: [18, 85], intoxicated: 0.3, noLicense: 0.2, record: 0.2 },
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'driver', noInsurance: 0.15 }],
    summary: [
      T('{address}. Parklas sõitis {car} vastu pargitud autot ja lahkus. Teataja jäi numbrimärgi {plate} meelde.', '{address}. In the car park a {car} hit a parked car and drove off. The caller remembered the plate {plate}.'),
      T('{address}. Sõiduk riivas tänaval kahte pargitud autot ja jätkas sõitu {direction}. Pealtnägija filmis.', '{address}. A vehicle scraped two parked cars and carried on {direction}. A witness filmed it.'),
    ],
    callerLines: [
      T('Keegi sõitis mu autole külje sisse ja lihtsalt sõitis minema! Õnneks üks mees nägi numbrit.', 'Someone drove into the side of my car and just drove off! Luckily a man saw the plate.'),
      T('Ma nägin, kuidas see auto tagurdas vastu teist autot ja juht kiirustas minema.', 'I saw this car reverse into another one and the driver hurried away.'),
    ],
    details: [T('Kahjustatud sõidukil on mõlki tagauks ja lõhutud peegel.', 'The damaged car has a dented rear door and a broken mirror.')],
    beats: [
      qVehicle('arrive'),
      qPerson('driver', 10, { chance: 0.6, radio: [T('{callsign}: leidsime sõiduki omaniku kodust. Kontrolli palun: {name}, isikukood {idcode}.', '{callsign}: we found the vehicle owner at home. Please check: {name}, ID code {idcode}.')] }),
      info(5, [T('{callsign}: pealtnägija video on salvestatud, edastame menetlejale.', '{callsign}: the witness video has been saved, passing it to the investigator.')], 0.5),
    ],
    outcomes: [
      out('found', 'fine', [0.5, 1], 4, T('Juht tuvastati ja ta tunnistas, et ei märganud kokkupõrget. Koostati väärteoprotokoll õnnetuspaigalt lahkumise eest.', 'The driver was identified and said he had not noticed the collision. A misdemeanour report for leaving the scene was filed.')),
      out('drunk', 'arrest', [0.55, 1], 1, T('Juht leiti kodust joobes. Alustati menetlust joobes juhtimise ja õnnetuspaigalt lahkumise asjas.', 'The driver was found drunk at home. Proceedings opened for drunk driving and leaving the scene.'), { arrests: 1 }),
      out('report', 'report', [0.25, 0.7], 3, T('Kannatanu avaldus võeti vastu, sõiduki omaniku tuvastamiseks alustati menetlust.', 'The victim’s statement was taken and proceedings opened to trace the vehicle owner.')),
      out('nothing', 'unfounded', [0, 0.3], 1, T('Numbrimärk osutus valesti meelde jäetuks, süüdlast tuvastada ei õnnestunud.', 'The plate had been remembered wrongly; the culprit could not be identified.')),
    ],
    expiresMin: 90,
  },
];
