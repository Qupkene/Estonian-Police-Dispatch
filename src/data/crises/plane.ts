/**
 * Lennuõnnetus lennuvälja lähedal (2.37.0, docs/CRISIS.md): a regional turboprop came down in the forest short of the
 * runway while landing, broke up among the trees and caught fire. The owner's drawing:
 * src/ui/game/crisis/crisis-plane.webp.
 *
 * Tasks: the casualties and the fire, the cordon round the wreckage and the access roads (at once, off the airport),
 * the relatives at the terminal and the wreckage and flight recorders for the Ohutusjuurdluse Keskus (later). A cordon
 * that waits too long brings drones and a TV crew to the tape; access roads that wait, the cars of onlookers and
 * relatives in the emergency corridor.
 */
import type { CrisisScenario } from '@/sim/crisis';
import type { IncidentTemplate } from '@/sim/types';
import { T, agency, choice, info, opt, out, qPerson, qVehicle, u } from '../incidents/_helpers_c';

const scene: IncidentTemplate = {
  id: 'crisis_plane_scene',
  category: 'major',
  code: 'SUUR',
  title: T('Lennuõnnetus: kannatanud ja põleng', 'Plane crash: casualties and fire'),
  priority: 1,
  weight: 0,
  places: ['forest', 'airport'],
  units: { need: [u('patrol', 2)], ideal: [u('patrol', 3), u('heli')] },
  onScene: [40, 90],
  persons: [
    { role: 'victim', gender: 'any', age: [6, 80] },
    { role: 'witness', gender: 'any', age: [25, 75] },
  ],
  agencies: [
    {
      agency: 'kiirabi',
      chance: 1,
      reason: T(
        'Pardal oli kümneid inimesi, kannatanuid tuleb sorteerida',
        'There were dozens of people on board and the casualties must be triaged',
      ),
    },
    {
      agency: 'paaste',
      chance: 1,
      reason: T('Lennuki rusud põlevad ja maas on kütust', 'The wreckage is burning and fuel has spilled'),
    },
  ],
  summary: [
    T(
      '{address}. Regionaalliini reisilennuk kukkus maandumisel umbes poolteist kilomeetrit enne lennurada metsa. Pardal oli {n}0 inimest, rusud põlevad.',
      '{address}. A regional airliner came down in the forest about one and a half kilometres short of the runway while landing. There were {n}0 people on board and the wreckage is on fire.',
    ),
    T(
      '{address}. Lennujuht nägi, kuidas maanduv lennuk kadus puude taha ja metsast tõusis suits. Häirekeskus kuulutas välja suurõnnetuse, rusude juures on kannatanuid.',
      '{address}. The air traffic controller saw the landing aircraft disappear behind the trees and smoke rise from the forest. The Emergency Response Centre has declared a major incident; there are casualties at the wreckage.',
    ),
    T(
      '{address}. Turbopropellerlennuk riivas maandumisel puulatvu ja purunes metsas mitmeks osaks. Tiib põleb, maas on kütust ja osa reisijaid on rusudes kinni.',
      '{address}. A turboprop clipped the treetops on landing and broke into several pieces in the forest. A wing is on fire, fuel has spilled and some passengers are trapped in the wreckage.',
    ),
  ],
  callerLines: [
    T(
      'Lennuk tuli üle meie maja hirmus madalalt ja kukkus metsa. Seal on suur suits ja leegid!',
      'A plane came over our house terribly low and crashed into the forest. It is all smoke and flames over there!',
    ),
    T(
      'Ma olin selles lennukis! Lennuk on pooleks, inimesed karjuvad ja mõned ei saa välja. Tulge kiiresti!',
      'I was on that plane! It has broken in half, people are screaming and some cannot get out. Come quickly!',
    ),
    T(
      'Olin koeraga metsas ja kuulsin kõva mürtsu. Puud on murdunud, lennuki tükid on igal pool ja üks tiib põleb.',
      'I was in the forest with my dog and heard a huge crash. Trees are snapped off, there are pieces of the plane everywhere and one wing is on fire.',
    ),
  ],
  details: [
    T(
      'Päästjad kustutavad põlevat tiiba vahuga, rusude ümber on maas lennukikütust.',
      'Rescuers are putting out the burning wing with foam; there is aircraft fuel on the ground round the wreckage.',
    ),
    T(
      'Kiirabi sorteerib kannatanuid metsateel, kergemalt vigastatud reisijad kõnnivad ise rusudest eemale.',
      'Ambulance crews are triaging the casualties on the forest track; the less badly hurt passengers are walking away from the wreckage on their own.',
    ),
  ],
  beats: [
    agency(
      'paaste',
      [
        T(
          '{callsign}: tiib põleb ja maas on kütust, vajame päästjaid vahuga!',
          '{callsign}: a wing is on fire and there is fuel on the ground, we need the rescuers with foam!',
        ),
      ],
      { timeoutMin: 3 },
    ),
    agency(
      'kiirabi',
      [
        T(
          '{callsign}: kannatanuid on kümneid, saatke juurde kiirabibrigaade! Kogumispunkt on metsatee ääres.',
          '{callsign}: there are dozens of casualties, send more ambulance crews! The collection point is by the forest track.',
        ),
      ],
      { at: 2, timeoutMin: 4 },
    ),
    choice(
      8,
      [
        T(
          '{callsign}: kergemalt vigastatud reisijad kõnnivad metsast välja ja osa tahab ise minema minna. Kas kogume kõik ühte kohta?',
          '{callsign}: the less badly hurt passengers are walking out of the forest and some want to leave on their own. Do we gather everyone in one place?',
        ),
      ],
      [
        opt(
          'gather',
          T('Koguge kõik kokku', 'Gather everyone'),
          T(
            '{callsign}, koguge kõik kogumispunkti, pange nimed kirja ja laske kiirabil üle vaadata.',
            '{callsign}, bring everyone to the collection point, take their names and let the ambulance crews check them.',
          ),
          { success: 0.15 },
        ),
        opt(
          'let_go',
          T('Laske minna', 'Let them go'),
          T(
            '{callsign}, kes saab ise liikuda, võib lahkuda. Keskenduge raskelt vigastatutele.',
            '{callsign}, anyone who can walk may leave. Concentrate on the badly injured.',
          ),
          { success: -0.1, trust: -1 },
        ),
      ],
      'gather',
    ),
    info(15, [
      T(
        '{callsign}: tuli on kustutatud ja kõik on rusudest välja toodud. Raskelt vigastatud viiakse esimesena haiglasse.',
        '{callsign}: the fire is out and everyone is out of the wreckage. The badly injured go to hospital first.',
      ),
    ]),
  ],
  outcomes: [
    out(
      'rescued',
      'hospital',
      [0.55, 1],
      4,
      T(
        'Kõik pardal olnud toodi rusudest välja. {n}0 inimest viidi haiglatesse, enamik kergete vigastustega.',
        'Everyone on board was brought out of the wreckage. {n}0 people were taken to hospitals, most with minor injuries.',
      ),
      { injuries: 12 },
    ),
    out(
      'serious',
      'hospital',
      [0.25, 0.7],
      3,
      T(
        'Mitu reisijat viidi raskes seisundis haiglasse, kaks neist kopteriga. Õnnetuse põhjust uurib Ohutusjuurdluse Keskus.',
        'Several passengers were taken to hospital in a serious condition, two of them by helicopter. The Safety Investigation Bureau is investigating the cause.',
      ),
      { injuries: 18 },
    ),
    out(
      'slow',
      'report',
      [0.1, 0.45],
      2,
      T(
        'Abi jõudis osa kannatanuteni hilja, mitu reisijat sai rusudes raskeid põletushaavu. Prokuratuur alustas kriminaalmenetlust.',
        'Help reached some of the casualties late, and several passengers suffered severe burns in the wreckage. The prosecutor’s office has opened criminal proceedings.',
      ),
      { injuries: 22 },
    ),
    out(
      'fatal',
      'tragedy',
      [0, 0.25],
      2,
      T(
        'Lennuõnnetuses hukkus inimesi ja kümned said raskelt viga. Uurimist juhib prokuratuur.',
        'People died in the crash and dozens were badly hurt. The prosecutor’s office is leading the investigation.',
      ),
      { injuries: 26 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['mass_casualty', 'mass', 'crisis'],
};

const cordon: IncidentTemplate = {
  id: 'crisis_plane_cordon',
  category: 'major',
  code: 'SUUR',
  title: T('Lennuõnnetus: rusude ümbruse piiramine', 'Plane crash: cordon round the wreckage'),
  priority: 2,
  weight: 0,
  places: ['forest', 'airport'],
  units: { need: [u('patrol')], ideal: [u('patrol', 2), u('aux', 2)] },
  onScene: [30, 70],
  persons: [{ role: 'witness', gender: 'any', age: [16, 70] }],
  summary: [
    T(
      '{address}. Lennuki rusude ümbrus tuleb piirata: metsas liigub kõrvalisi inimesi ja maha voolanud kütus võib süttida.',
      '{address}. The area round the wreckage must be cordoned off: bystanders are wandering through the forest and the spilled fuel could catch fire.',
    ),
    T(
      '{address}. Metsa kaudu tuleb lennuõnnetuse kohale uudistajaid, mõni filmib rususid ja kannatanuid. Ala tuleb piirata ja tunnistajad kokku koguda.',
      '{address}. Onlookers are coming through the forest to the crash site and some are filming the wreckage and the casualties. The area must be cordoned off and the witnesses gathered.',
    ),
    T(
      '{address}. Lennuki tükid on laiali mitmesaja meetri ulatuses, osa ka metsateel. Päästjad paluvad ala piirata, et keegi rususid ei puutuks.',
      '{address}. Pieces of the aircraft are scattered over several hundred metres, some of them on the forest track. The rescuers ask for the area to be cordoned off so that nobody touches the wreckage.',
    ),
  ],
  callerLines: [
    T(
      'Me elame metsa servas ja praegu läheb siit terve rodu inimesi rusude juurde vaatama. Kas seal tohib üldse käia?',
      'We live at the edge of the forest and right now a whole stream of people is going past to look at the wreckage. Are they even allowed in there?',
    ),
    T(
      'Ma nägin, kuidas lennuk puude latvu riivas ja alla kukkus. Kellele ma sellest rääkima peaksin?',
      'I saw the plane clip the treetops and come down. Who should I tell about it?',
    ),
    T(
      'Rusude juures käivad mingid inimesed ja korjavad lennuki tükke kaasa! Keegi peaks nad sealt minema ajama.',
      'There are people walking round the wreckage and picking up pieces of the plane to take home! Someone should chase them off.',
    ),
  ],
  details: [
    T(
      'Kütuse tõttu tahavad päästjad rusude ümber vähemalt paarisaja meetri laiust tühja ala.',
      'Because of the fuel the rescuers want a clear zone of at least a couple of hundred metres round the wreckage.',
    ),
    T(
      'Tunnistajad tuleb kokku koguda, nende ütlusi vajavad hiljem nii uurija kui ka Ohutusjuurdluse Keskus.',
      'The witnesses must be gathered: both the detective and the Safety Investigation Bureau will need their statements later.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: paneme metsateedele lindi üles ja saadame uudistajad eemale.',
        '{callsign}: putting tape across the forest tracks and sending the onlookers away.',
      ),
    ]),
    choice(
      6,
      [
        T(
          '{callsign}: üks mees võttis rusude juurest lennuki tüki kaasa ega taha seda ära anda. Kuidas toimime?',
          '{callsign}: a man has taken a piece of the aircraft from the wreckage and will not hand it over. How do we proceed?',
        ),
      ],
      [
        opt(
          'seize',
          T('Võtke tükk ära', 'Take it off him'),
          T(
            '{callsign}, võtke tükk ära, märkige üles, kust see võeti, ja vormistage protokoll.',
            '{callsign}, take the piece off him, note where it came from and write a report.',
          ),
          { success: 0.15 },
        ),
        opt(
          'send_off',
          T('Saatke ta minema', 'Send him off'),
          T(
            '{callsign}, saatke ta alalt minema, tükiga ärge tegelege.',
            '{callsign}, send him away from the area and never mind the piece.',
          ),
          { success: -0.1 },
        ),
      ],
      'seize',
    ),
  ],
  outcomes: [
    out(
      'secured',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Rusude ümbrus piirati kiiresti, uudistajad saadeti eemale ja tunnistajate andmed pandi kirja.',
        'The area round the wreckage was cordoned off quickly, the onlookers were sent away and the witnesses’ details were taken.',
      ),
    ),
    out(
      'partly',
      'warning',
      [0.25, 0.6],
      3,
      T(
        'Uudistajad saadeti lindi taha, kuid osa lennuki tükke oli selleks ajaks rusude juurest kaasa viidud.',
        'The onlookers were sent behind the tape, but by then some pieces of the aircraft had been carried off.',
      ),
    ),
    out(
      'chaos',
      'report',
      [0, 0.3],
      2,
      T(
        'Osa lennuki tükke kadus, sest rusude vahel käis kõrvalisi inimesi. Juhtunu kohta alustati menetlust.',
        'Some pieces of the aircraft went missing because bystanders walked among the wreckage. Proceedings were opened.',
      ),
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crowd', 'crisis'],
};

const access: IncidentTemplate = {
  id: 'crisis_plane_access',
  category: 'major',
  code: 'SUUR',
  title: T('Lennuõnnetus: juurdepääsuteede sulgemine', 'Plane crash: closing the access roads'),
  priority: 2,
  weight: 0,
  places: ['highway', 'airport'],
  units: { need: [u('traffic')], ideal: [u('traffic', 2)] },
  onScene: [30, 70],
  persons: [{ role: 'driver', gender: 'any', age: [22, 66] }],
  summary: [
    T(
      '{address}. Lennuõnnetuse kohale viivad teed tuleb liiklusele sulgeda ja päästesõidukitele koridor vabaks hoida. Lennujaama poole liigub palju autosid.',
      '{address}. The roads to the crash site must be closed to traffic and a corridor kept clear for the emergency vehicles. Many cars are heading for the airport.',
    ),
    T(
      '{address}. Päästeautod ja kiirabid pööravad lennujaama teelt metsateele ja ristmikul on segadus. Vaja on liiklusreguleerijat.',
      '{address}. Fire engines and ambulances are turning off the airport road onto the forest track and the junction is in chaos. Traffic control is needed.',
    ),
  ],
  callerLines: [
    T(
      'Ristmikul on täielik segadus, kiirabi ei pääse autode vahelt läbi. Kes siin liiklust juhib?',
      'The junction is in total chaos and the ambulances cannot get through the cars. Who is directing the traffic here?',
    ),
    T(
      'Ma pean lennujaama jõudma, mu lend väljub tunni aja pärast, aga tee on kinni. Kust ma läbi pääsen?',
      'I have to get to the airport, my flight leaves in an hour, but the road is closed. Which way can I get through?',
    ),
    T(
      'Päästeautod kihutavad vilega metsa poole ja inimesed jätavad oma autod tee äärde, et vaatama minna.',
      'Fire engines are racing towards the forest with sirens on and people are leaving their cars by the road to go and look.',
    ),
  ],
  details: [
    T(
      'Päästesõidukitele peab jääma vaba koridor lennujaama teelt õnnetuskohani, muu liiklus tuleb ümber suunata.',
      'A clear corridor must stay open for the emergency vehicles from the airport road to the crash site; all other traffic must be diverted.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: sulgeme metsateed, päästekoridor lennujaama teelt on vaba.',
        '{callsign}: closing the forest tracks; the emergency corridor from the airport road is clear.',
      ),
    ]),
    choice(
      8,
      [
        T(
          '{callsign}: lennujaama poole tuleb veel autosid, reisijad tahavad lennule jõuda. Kas laseme nad lennujaama teele?',
          '{callsign}: more cars are coming towards the airport with passengers who want to catch their flights. Do we let them onto the airport road?',
        ),
      ],
      [
        opt(
          'divert',
          T('Ei, suunake ümber', 'No, divert them'),
          T(
            '{callsign}, suunake kõik ümber, lennujaama juurde pääseb ainult ümbersõitu pidi.',
            '{callsign}, divert everyone; the airport can only be reached by the diversion.',
          ),
          { success: 0.1 },
        ),
        opt(
          'let_through',
          T('Jah, laske läbi', 'Yes, let them through'),
          T(
            '{callsign}, laske autod aeglaselt läbi, aga koridor peab jääma vabaks.',
            '{callsign}, let the cars through slowly, but the corridor must stay clear.',
          ),
          { success: -0.05, risk: 0.05 },
        ),
      ],
      'divert',
    ),
  ],
  outcomes: [
    out(
      'clear',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Juurdepääsuteed suleti kiiresti, päästesõidukite koridor püsis kogu aeg vaba.',
        'The access roads were closed quickly, and the emergency corridor stayed clear throughout.',
      ),
    ),
    out(
      'late',
      'resolved',
      [0.25, 0.6],
      3,
      T(
        'Teed suleti hilinemisega, esimesed kiirabid jäid uudistajate autode taha kinni.',
        'The roads were closed late, and the first ambulances got stuck behind onlookers’ cars.',
      ),
    ),
    out(
      'blocked',
      'report',
      [0, 0.3],
      2,
      T(
        'Päästekoridor ummistus ja kiirabi jõudis õnnetuskohale hilja. Koridori blokeerinud juhtide suhtes alustati väärteomenetlust.',
        'The emergency corridor was blocked, so the ambulances reached the crash site late. Misdemeanour proceedings were opened against the drivers who blocked it.',
      ),
      { injuries: 1 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

const terminal: IncidentTemplate = {
  id: 'crisis_plane_terminal',
  category: 'major',
  code: 'SUUR',
  title: T('Lennuõnnetus: lähedased lennujaamas', 'Plane crash: relatives at the terminal'),
  priority: 3,
  weight: 0,
  places: ['airport'],
  units: { need: [u('patrol')], ideal: [u('community'), u('patrol')] },
  onScene: [40, 90],
  persons: [{ role: 'caller', gender: 'any', age: [30, 70] }],
  agencies: [
    {
      agency: 'sotsiaal',
      chance: 1,
      reason: T(
        'Lähedased vajavad ohvriabi ja kriisinõustamist',
        'The relatives need victim support and crisis counselling',
      ),
    },
  ],
  summary: [
    T(
      '{place}, {address}. Lennujaama saabuvad õnnetuslennu reisijate lähedased ja nõuavad infot. Vaja on politseinikku, kes kontrollib reisijate nimekirja ja hoiab korda.',
      '{place}, {address}. Relatives of the passengers on the crashed flight are arriving at the airport and demanding information. An officer is needed to check the passenger list and keep order.',
    ),
    T(
      '{place}, {address}. Lennujaamas on avatud lähedaste ruum, kohal on ohvriabi ja lennufirma esindaja. Politsei peab reisijate nimekirja haiglate andmetega kokku viima.',
      '{place}, {address}. A room for relatives has been opened at the airport, with victim support and an airline representative there. The police must match the passenger list with the hospitals’ records.',
    ),
    T(
      '{place}. Saabumissaalis on kümneid ärevaid inimesi, kes ootasid õnnetuslennu reisijaid. Mitu inimest on šokis.',
      '{place}. Dozens of anxious people who were waiting for the passengers of the crashed flight are in the arrivals hall. Several are in shock.',
    ),
  ],
  callerLines: [
    T(
      'Mu tütar pidi selle lennukiga koju tulema ja ta ei vasta telefonile! Kas te teate, mis temaga on?',
      'My daughter was meant to fly home on that plane and she is not answering her phone! Do you know what has happened to her?',
    ),
    T(
      'Ootame siin saabumissaalis juba tund aega ja keegi ei ütle meile midagi. Kas mu vend on haiglas?',
      'We have been waiting in the arrivals hall for an hour and nobody tells us anything. Is my brother in hospital?',
    ),
    T(
      'Mu abikaasa oli selles lennukis. Lennufirma telefon on kogu aeg kinni ja internetis kirjutatakse, et on hukkunuid!',
      'My partner was on that plane. The airline’s line is busy all the time and the internet says people have died!',
    ),
  ],
  details: [
    T(
      'Reisijate nimekiri tuleb enne lähedastele info andmist haiglate ja kiirabi andmetega üle kontrollida.',
      'The passenger list must be checked against the hospitals’ and the ambulance service’s records before the relatives are told anything.',
    ),
    T(
      'Ohvriabi kriisinõustajad on teel, lennujaam annab lähedastele eraldi ruumi.',
      'Victim support counsellors are on their way and the airport is giving the relatives a room of their own.',
    ),
  ],
  beats: [
    agency(
      'sotsiaal',
      [
        T(
          '{callsign}: lähedasi on kümneid ja mitu on šokis. Palun ohvriabi ja kriisinõustajad lennujaama.',
          '{callsign}: there are dozens of relatives and several are in shock. Victim support and crisis counsellors to the airport, please.',
        ),
      ],
      { timeoutMin: 6 },
    ),
    choice(
      10,
      [
        T(
          '{callsign}: ajakirjanikud küsivad lähedastelt intervjuusid ja tahavad nimekirja näha. Kas viime lähedased eraldi ruumi?',
          '{callsign}: journalists are asking the relatives for interviews and want to see the list. Do we take the relatives to a separate room?',
        ),
      ],
      [
        opt(
          'room',
          T('Jah, eraldi ruumi', 'Yes, to a separate room'),
          T(
            '{callsign}, viige lähedased eraldi ruumi. Ajakirjanikele annab infot pressiesindaja.',
            '{callsign}, take the relatives to a separate room. The press officer will brief the journalists.',
          ),
          { success: 0.15 },
        ),
        opt(
          'hall',
          T('Ei, jäägu saali', 'No, they stay in the hall'),
          T(
            '{callsign}, lähedased jäävad saali, hoidke ajakirjanikud neist eemal.',
            '{callsign}, the relatives stay in the hall; keep the journalists away from them.',
          ),
          { success: -0.05, trust: -1 },
        ),
      ],
      'room',
    ),
    info(20, [
      T(
        '{callsign}: nimekiri on haiglatega kokku viidud, ohvriabi räägib peredega ükshaaval.',
        '{callsign}: the list has been matched with the hospitals and victim support is talking to the families one by one.',
      ),
    ]),
  ],
  outcomes: [
    out(
      'informed',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Kõik pered said kinnitatud infot, ohvriabi jäi nendega edasi tegelema.',
        'Every family was given confirmed information, and victim support stayed with them.',
      ),
    ),
    out(
      'confused',
      'warning',
      [0.2, 0.6],
      3,
      T(
        'Info liikus aeglaselt, mõni pere luges halbu uudiseid internetist enne ametlikku teadet.',
        'Information moved slowly, and some families read bad news online before the official word.',
      ),
    ),
    out(
      'wrong',
      'report',
      [0, 0.25],
      2,
      T(
        'Ühele perele anti kinnitamata nimekirja põhjal vale teade. Juhtunu võeti kontrolli alla.',
        'One family was given wrong news from an unconfirmed list. The case was put under review.',
      ),
      { trust: -3 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crowd', 'crisis'],
};

const evidence: IncidentTemplate = {
  id: 'crisis_plane_evidence',
  category: 'major',
  code: 'SUUR',
  title: T('Lennuõnnetus: rusud ja pardasalvestid', 'Plane crash: the wreckage and the flight recorders'),
  priority: 3,
  weight: 0,
  places: ['forest', 'airport'],
  units: { need: [u('criminal')], ideal: [u('criminal'), u('patrol')] },
  onScene: [40, 90],
  persons: [{ role: 'witness', gender: 'any', age: [20, 75] }],
  summary: [
    T(
      '{address}. Ohutusjuurdluse Keskus on teel ja vajab lennuki rususid puutumatuna. Pardasalvestid tuleb üles leida ja valvata, kuni need on üle antud.',
      '{address}. The Safety Investigation Bureau is on its way and needs the wreckage left untouched. The flight recorders must be found and guarded until they are handed over.',
    ),
    T(
      '{address}. Lennuõnnetuse asjus alustatakse kriminaalmenetlust. Õnnetuspaigale on vaja uurijat: rusude asukohad tuleb fikseerida ja tunnistajad küsitleda.',
      '{address}. Criminal proceedings are being opened over the plane crash. A detective is needed at the crash site to record where the wreckage lies and question the witnesses.',
    ),
  ],
  callerLines: [
    T(
      'Ma nägin, et lennuki üks mootor suitses juba enne, kui see puude vahele kukkus. Kas keegi tahab mu ütlusi?',
      'I saw one of the plane’s engines smoking even before it came down among the trees. Does anyone want my statement?',
    ),
    T(
      'Filmisin lennukit, kui see maandumiseks madalale tuli. Video on mu telefonis, kellele ma selle annan?',
      'I was filming the plane as it came in low to land. The video is on my phone; who do I give it to?',
    ),
    T(
      'Leidsin oma aiast lennuki tüki, see on täitsa söestunud. Kas ma toon selle kuhugi või jätan siia?',
      'I found a piece of the plane in my garden and it is completely charred. Do I bring it somewhere or leave it here?',
    ),
  ],
  details: [
    T(
      'Pardasalvestid on lennuki sabaosas ja need tohib üle anda ainult Ohutusjuurdluse Keskusele.',
      'The flight recorders are in the tail section and may only be handed over to the Safety Investigation Bureau.',
    ),
    T(
      'Rusude asukohad tuleb enne äravedu pildistada ja plaanile kanda.',
      'Where each piece of wreckage lies must be photographed and mapped before anything is taken away.',
    ),
  ],
  beats: [
    qPerson('witness', 'arrive', {
      radio: [
        T(
          '{callsign}: lennuki allakukkumist nägi kohalik elanik {name}, isikukood {idcode}. Palun kontrolli.',
          '{callsign}: a local resident saw the plane come down: {name}, ID code {idcode}. Please check.',
        ),
      ],
    }),
    choice(
      15,
      [
        T(
          '{callsign}: kohale jõudnud lennufirma tehnikud leidsid pardasalvestid ja tahavad need kohe kaasa võtta. Kas anname?',
          '{callsign}: the airline’s technicians have arrived, found the flight recorders and want to take them away at once. Do we let them?',
        ),
      ],
      [
        opt(
          'guard',
          T('Ei, valvake neid', 'No, guard them'),
          T(
            '{callsign}, salvestid jäävad politsei valve alla, kuni Ohutusjuurdluse Keskus need üle võtab.',
            '{callsign}, the recorders stay under police guard until the Safety Investigation Bureau takes them over.',
          ),
          { success: 0.15 },
        ),
        opt(
          'hand_over',
          T('Jah, andke ära', 'Yes, hand them over'),
          T(
            '{callsign}, andke salvestid tehnikutele, vormistage üleandmine kirjalikult.',
            '{callsign}, give the recorders to the technicians and put the handover in writing.',
          ),
          { success: -0.1 },
        ),
      ],
      'guard',
    ),
    info(25, [
      T(
        '{callsign}: rusude asukohad on fikseeritud, ootame Ohutusjuurdluse Keskust.',
        '{callsign}: the wreckage positions are recorded; waiting for the Safety Investigation Bureau.',
      ),
    ]),
  ],
  outcomes: [
    out(
      'secured',
      'report',
      [0.5, 1],
      4,
      T(
        'Pardasalvestid anti üle Ohutusjuurdluse Keskusele, rusud fikseeriti ja tunnistajate ütlused võeti. Kriminaalmenetlust juhib prokuratuur.',
        'The flight recorders were handed over to the Safety Investigation Bureau, the wreckage was recorded and the witnesses’ statements were taken. The prosecutor’s office is leading the criminal proceedings.',
      ),
    ),
    out(
      'partial',
      'report',
      [0.2, 0.6],
      3,
      T(
        'Pardasalvestid jõudsid Ohutusjuurdluse Keskusele, kuid osa rusude asukohti jäi enne äravedu fikseerimata.',
        'The flight recorders reached the Safety Investigation Bureau, but some of the wreckage was moved before its position was recorded.',
      ),
    ),
    out(
      'lost',
      'report',
      [0, 0.25],
      2,
      T(
        'Üks pardasalvestitest leiti alles järgmisel päeval, sest rusude vahel käisid kõrvalised. Juurdlus venib.',
        'One flight recorder was only found the next day, because bystanders had walked among the wreckage. The investigation is delayed.',
      ),
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

const onlookers: IncidentTemplate = {
  id: 'crisis_plane_onlookers',
  category: 'major',
  code: 'SUUR',
  title: T(
    'Lennuõnnetus: droonid ja uudistajad lindi juures',
    'Plane crash: drones and onlookers at the tape',
  ),
  priority: 2,
  weight: 0,
  places: ['forest', 'airport'],
  units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
  onScene: [20, 50],
  persons: [
    { role: 'suspect', gender: 'M', age: [18, 45] },
    { role: 'witness', gender: 'any', age: [20, 60] },
  ],
  summary: [
    T(
      '{address}. Lennuõnnetuse kohal lendab mitu drooni ja päästekopter ei saa maanduda. Lindi juurde on kogunenud kümneid uudistajaid.',
      '{address}. Several drones are flying over the plane crash and the rescue helicopter cannot land. Dozens of onlookers have gathered at the tape.',
    ),
    T(
      '{address}. Valveta metsateelt tungivad uudistajad rusudele lähemale ja telekanali võttegrupp on lindi alt läbi tulnud. Rusude kohal tiirleb droon.',
      '{address}. Onlookers are pushing closer to the wreckage along an unguarded forest track and a TV crew has come under the tape. A drone is circling over the wreckage.',
    ),
  ],
  callerLines: [
    T(
      'Siin lendab mitu drooni otse suitsu kohal ja kopter tiirutab, ei saa maha tulla!',
      'There are several drones right over the smoke and the helicopter is circling, it cannot land!',
    ),
    T(
      'Mingi teleoperaator ronis lindi alt läbi ja filmib rususid, päästjad karjuvad talle, et ta minema läheks.',
      'Some TV cameraman climbed under the tape and is filming the wreckage, the rescuers are shouting at him to get out.',
    ),
    T(
      'Meie tänav on autosid ja inimesi täis, kõik tahavad lennukit näha. Noored ronivad juba lindi alt läbi.',
      'Our street is full of cars and people, everyone wants to see the plane. Young people are already climbing under the tape.',
    ),
  ],
  details: [
    T(
      'Transpordiamet kehtestas õnnetuspaiga kohal ajutise lennupiirangu, droonid tuleb maandada.',
      'The Transport Administration has imposed a temporary flight restriction over the crash site, and the drones must be landed.',
    ),
  ],
  beats: [
    qPerson('suspect', 'arrive', {
      radio: [
        T(
          '{callsign}: leidsime metsa servast ühe droonipiloodi: {name}, isikukood {idcode}. Palun kontrolli.',
          '{callsign}: we have found one of the drone pilots at the edge of the forest: {name}, ID code {idcode}. Please check.',
        ),
      ],
    }),
    choice(
      5,
      [
        T(
          '{callsign}: telekanali võttegrupp keeldub piiratud alalt lahkumast ja ütleb, et avalikkusel on õigus teada. Kuidas toimime?',
          '{callsign}: a TV crew refuses to leave the cordoned area and says the public has a right to know. How do we proceed?',
        ),
      ],
      [
        opt(
          'press_point',
          T('Juhatage pressipunkti', 'Show them to the press point'),
          T(
            '{callsign}, juhatage nad pressipunkti, sealt saavad nad filmida ja infot küsida.',
            '{callsign}, show them to the press point; they can film and ask questions from there.',
          ),
          { success: 0.15 },
        ),
        opt(
          'remove',
          T('Eemaldage alalt', 'Remove them from the area'),
          T(
            '{callsign}, eemaldage võttegrupp alalt, vajadusel vormistage protokoll.',
            '{callsign}, remove the TV crew from the area and write a report if needed.',
          ),
          { success: 0, trust: -2 },
        ),
      ],
      'press_point',
    ),
  ],
  outcomes: [
    out(
      'grounded',
      'report',
      [0.5, 1],
      4,
      T(
        'Droonid maandati ja kopter sai maanduda, võttegrupp juhatati pressipunkti. Droonipiloodi suhtes alustati väärteomenetlust.',
        'The drones were landed and the helicopter could land; the TV crew was shown to the press point. Misdemeanour proceedings were opened against the drone pilot.',
      ),
    ),
    out(
      'late',
      'warning',
      [0.2, 0.6],
      3,
      T(
        'Uudistajad saadeti lindi taha ja droonipiloodid hoiatati, kuid kopter pidi maandumist kaua ootama.',
        'The onlookers were sent behind the tape, and the drone pilots were warned, but the helicopter had to wait a long time to land.',
      ),
    ),
    out(
      'gone',
      'escaped',
      [0, 0.25],
      2,
      T(
        'Droonipiloot kadus metsa, video rusudest ja kannatanutest läks otse-eetrisse. Kopter sai maanduda alles poole tunni pärast.',
        'The drone pilot vanished into the forest, and footage of the wreckage and the casualties went out live. The helicopter could only land half an hour later.',
      ),
      { injuries: 1 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crowd', 'crisis'],
};

const jam: IncidentTemplate = {
  id: 'crisis_plane_jam',
  category: 'major',
  code: 'SUUR',
  title: T('Lennuõnnetus: ummik päästekoridoris', 'Plane crash: gridlock in the emergency corridor'),
  priority: 2,
  weight: 0,
  places: ['highway', 'airport'],
  units: { need: [u('traffic')], ideal: [u('traffic'), u('patrol')] },
  onScene: [30, 60],
  persons: [
    { role: 'driver', gender: 'any', age: [20, 70] },
    { role: 'witness', gender: 'any', age: [25, 65] },
  ],
  vehicles: [{ role: 'involved', kind: 'car', driverRole: 'driver' }],
  summary: [
    T(
      '{address}. Lennujaama teel on uudistajate ja lähedaste autod päästekoridori kinni pannud, kiirabid ei pääse õnnetuskohale. Vaja on liikluspolitseid.',
      '{address}. Cars of onlookers and relatives have blocked the emergency corridor on the airport road and the ambulances cannot reach the crash site. Traffic police are needed.',
    ),
    T(
      '{address}. Lennujaama poole viival teel seisab pikk autode rivi, juhid jätavad autod teepeenrale ja kõnnivad metsa poole. Päästeautod jäävad ummikusse kinni.',
      '{address}. A long line of cars is standing on the road to the airport and drivers are leaving their cars on the verge and walking towards the forest. Fire engines are getting stuck in the queue.',
    ),
  ],
  callerLines: [
    T(
      'Siin on täielik ummik, inimesed jätavad autod keset teed ja lähevad lennukit vaatama. Kiirabi seisab meie taga!',
      'It is total gridlock here, people are leaving their cars in the middle of the road to go and look at the plane. There is an ambulance stuck behind us!',
    ),
    T(
      'Mu poeg oli selles lennukis, ma pean sinna saama! Miks keegi meid läbi ei lase?',
      'My son was on that plane, I have to get there! Why will nobody let us through?',
    ),
    T(
      'Üks auto seisab risti üle tee ja juhti pole kuskil. Päästeauto ei mahu mööda.',
      'A car is standing right across the road and the driver is nowhere to be seen. The fire engine cannot get past.',
    ),
  ],
  details: [
    T(
      'Lähedastele tuleb öelda, et infot antakse lennujaamas, õnnetuskohale neid ei lubata.',
      'The relatives must be told that information is given at the airport; they will not be let through to the crash site.',
    ),
    T(
      'Teele jäetud autod tuleb teisaldada, et päästekoridor vabaneks.',
      'Cars left in the road must be towed away to clear the emergency corridor.',
    ),
  ],
  beats: [
    qVehicle('arrive', { chance: 0.5 }),
    choice(
      6,
      [
        T(
          '{callsign}: risti seisva auto juht tuli tagasi, ta on reisija lähedane ja nõuab, et teda lastaks õnnetuskohale. Kuidas toimime?',
          '{callsign}: the driver of the car across the road is back; they are a passenger’s relative and demand to be let through to the crash site. How do we proceed?',
        ),
      ],
      [
        opt(
          'terminal',
          T('Suunake lennujaama', 'Send them to the airport'),
          T(
            '{callsign}, selgitage, et lähedastele antakse infot lennujaamas, ja juhatage ta sinna. Auto teelt ära.',
            '{callsign}, explain that relatives are given information at the airport and direct them there. Get the car off the road.',
          ),
          { success: 0.15 },
        ),
        opt(
          'tow',
          T('Teisaldage auto', 'Have the car towed'),
          T(
            '{callsign}, teisaldage auto ja vormistage protokoll, juht lahkugu alalt.',
            '{callsign}, have the car towed and write a ticket; the driver must leave the area.',
          ),
          { success: 0.05, trust: -1 },
        ),
      ],
      'terminal',
    ),
  ],
  outcomes: [
    out(
      'cleared',
      'fine',
      [0.5, 1],
      4,
      T(
        'Päästekoridor tehti vabaks, teele jäetud autod teisaldati ja nende juhte trahviti.',
        'The emergency corridor was cleared, the cars left in the road were towed away and their drivers were fined.',
      ),
    ),
    out(
      'slow',
      'report',
      [0.2, 0.6],
      3,
      T(
        'Kiirabid jäid mitmeks minutiks ummikusse, enne kui koridor avati. Teed blokeerinud juhtide suhtes alustati väärteomenetlust.',
        'The ambulances were stuck in the queue for several minutes, until the corridor was opened. Misdemeanour proceedings were opened against the drivers who blocked the road.',
      ),
    ),
    out(
      'crash',
      'hospital',
      [0, 0.25],
      2,
      T(
        'Kiirabi põrkas ummikus kokku teele jäetud autoga, kannatanu jõudis haiglasse hilinemisega.',
        'An ambulance hit a car left in the road, and the casualty reached hospital late.',
      ),
      { injuries: 1 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

export const PLANE: CrisisScenario = {
  id: 'plane',
  title: T('Lennuõnnetus lennuvälja lähedal', 'Plane crash near the airfield'),
  places: ['airport'],
  briefing: T(
    '{place}. Regionaalliini turbopropellerlennuk kukkus maandumisel umbes poolteist kilomeetrit enne lennurada metsa ja purunes puude vahel. Pardal oli kümneid inimesi, rusud põlevad ja maas on kütust. Häirekeskus kuulutas välja suurõnnetuse: kannatanud vajavad abi, rusude ümbrus tuleb piirata ja juurdepääsuteed sulgeda. Ohutusjuurdluse Keskus vajab rususid ja pardasalvesteid puutumatuna.',
    '{place}. A regional turboprop came down in the forest about one and a half kilometres short of the runway while landing and broke up among the trees. There were dozens of people on board, the wreckage is burning and fuel has spilled. The Emergency Response Centre has declared a major incident: the casualties need help, the area round the wreckage must be cordoned off and the access roads closed. The Safety Investigation Bureau needs the wreckage and the flight recorders left untouched.',
  ),
  tasks: [
    {
      id: 'scene',
      name: T('Kannatanud ja põleng', 'Casualties and fire'),
      template: scene,
      deadlineMin: 8,
      offsetKm: [0.8, 1.6],
    },
    {
      id: 'cordon',
      name: T('Rusude ümbruse piiramine', 'Cordon round the wreckage'),
      template: cordon,
      deadlineMin: 12,
      near: 'scene',
      offsetKm: [0.15, 0.4],
      followUp: 'onlookers',
    },
    {
      id: 'access',
      name: T('Juurdepääsuteed ja päästekoridor', 'Access roads and the emergency corridor'),
      template: access,
      deadlineMin: 12,
      near: 'scene',
      offsetKm: [0.8, 1.8],
      followUp: 'jam',
    },
    {
      id: 'terminal',
      name: T('Lähedased lennujaamas', 'Relatives at the terminal'),
      template: terminal,
      atMin: 15,
      deadlineMin: 25,
      place: 'airport',
    },
    {
      id: 'evidence',
      name: T('Rusud ja pardasalvestid', 'The wreckage and the flight recorders'),
      template: evidence,
      atMin: 30,
      deadlineMin: 30,
      near: 'scene',
      offsetKm: [0.02, 0.1],
    },
  ],
  followUps: [
    {
      id: 'onlookers',
      name: T('Droonid ja uudistajad', 'Drones and onlookers'),
      template: onlookers,
      deadlineMin: 10,
      near: 'scene',
      offsetKm: [0.3, 0.7],
    },
    {
      id: 'jam',
      name: T('Ummik päästekoridoris', 'Gridlock in the emergency corridor'),
      template: jam,
      deadlineMin: 10,
      near: 'scene',
      offsetKm: [1, 2.5],
    },
  ],
  decisions: [
    {
      id: 'radius',
      title: T('Ohuala', 'Danger zone'),
      question: T(
        'Kas piirame ainult rusude ümbruse 1 km raadiuses või evakueerime kütuse ja suitsu tõttu ka lähimad majad?',
        'Do we cordon off just 1 km round the wreckage, or also evacuate the nearest houses because of the fuel and the smoke?',
      ),
      options: [
        {
          id: 'evacuate',
          label: T('Evakueeri majad', 'Evacuate the houses'),
          effect: T(
            'Lähimad majad evakueeritakse ja ohuala laieneb kahe kilomeetrini. Postidele on kiiresti vaja rohkem ekipaaže.',
            'The nearest houses are evacuated and the danger zone widens to two kilometres. More crews are needed at the posts, and fast.',
          ),
          success: 0.1,
          deadline: 0.85,
        },
        {
          id: 'one_km',
          label: T('Piira 1 km', 'Cordon 1 km'),
          effect: T(
            'Piiratakse 1 km raadius, lähimate majade elanikel palutakse jääda tuppa ja aknad sulgeda.',
            'A 1 km radius is cordoned off and the residents of the nearest houses are asked to stay indoors with the windows shut.',
          ),
          success: -0.05,
          deadline: 1.15,
        },
      ],
      defaultOption: 'evacuate',
      atMin: 3,
    },
    {
      id: 'help',
      title: T('Naabrite abi', 'Help from the neighbours'),
      question: T(
        'Kas kutsume naaberüksused appi, kui mõni lennuõnnetuse ülesanne jääb ekipaažita?',
        'Do we call in the neighbouring units if a plane crash task is left without a crew?',
      ),
      options: [
        {
          id: 'ask',
          label: T('Kutsu appi', 'Call them in'),
          effect: T(
            'Naaberüksused võtavad üle ülesanded, mis jäävad liiga kauaks ekipaažita.',
            'The neighbouring units will take over any task left too long without a crew.',
          ),
          help: true,
        },
        {
          id: 'alone',
          label: T('Saame ise hakkama', 'We manage ourselves'),
          effect: T(
            'Abi ei kutsuta, kõik lennuõnnetuse ülesanded jäävad meile.',
            'No help is called in; every task of the plane crash stays with us.',
          ),
        },
      ],
      defaultOption: 'ask',
      atMin: 6,
    },
  ],
  radio: {
    outbreak: T(
      'Suurõnnetus! {place}: reisilennuk kukkus maandumisel lennuvälja lähedal metsa, pardal on kümneid inimesi. Pääste ja kiirabi on teel, politseid on vaja mitmele ülesandele.',
      'Major incident! {place}: a passenger plane has come down in the forest near the airfield while landing, with dozens of people on board. Rescue and ambulances are on their way; the police are needed for several tasks.',
    ),
    escalate: T(
      'Lennuõnnetuse ülesanne on endiselt ekipaažita, olukord halveneb.',
      'A plane crash task still has no crew and the situation is getting worse.',
    ),
    end: T(
      '{place}: lennuõnnetuse tööd on lõpetatud, õnnetuspaik on üle antud Ohutusjuurdluse Keskusele. Aitäh kõigile.',
      '{place}: the work at the plane crash is finished and the crash site has been handed over to the Safety Investigation Bureau. Thank you, everyone.',
    ),
  },
};
