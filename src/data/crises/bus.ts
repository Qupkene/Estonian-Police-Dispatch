/**
 * Bussiõnnetus maanteel (2.37.0, docs/CRISIS.md): a long-distance bus off the highway, its passengers hurt and some
 * trapped, the road blocked both ways. The owner's drawing: src/ui/game/crisis/crisis-bus.webp.
 *
 * Tasks: the casualties and the rescue (at once), the traffic diversion and the cordon (at once, off the spot), the
 * investigation of the cause and the relatives' information point (later). A diversion that waits too long brings a
 * pile-up in the queue; a cordon that waits, a drone over the rescuers.
 */
import type { CrisisScenario } from '@/sim/crisis';
import type { IncidentTemplate } from '@/sim/types';
import { T, agency, choice, info, opt, out, qPerson, qVehicle, u } from '../incidents/_helpers_c';

const scene: IncidentTemplate = {
  id: 'crisis_bus_scene',
  category: 'major',
  code: 'SUUR',
  title: T('Bussiõnnetus: kannatanud ja päästetööd', 'Bus crash: casualties and rescue'),
  priority: 1,
  weight: 0,
  places: ['highway'],
  units: { need: [u('patrol', 2)], ideal: [u('patrol', 3), u('heli')] },
  onScene: [40, 90],
  persons: [
    { role: 'driver', gender: 'M', age: [35, 64], intoxicated: 0.05 },
    { role: 'victim', gender: 'any', age: [8, 82] },
    { role: 'witness', gender: 'any', age: [20, 70] },
  ],
  vehicles: [{ role: 'involved', kind: 'bus', driverRole: 'driver' }],
  agencies: [
    {
      agency: 'kiirabi',
      chance: 1,
      reason: T(
        'Palju vigastatuid, kannatanuid tuleb sorteerida',
        'Many injured, the casualties must be triaged',
      ),
    },
    {
      agency: 'paaste',
      chance: 1,
      reason: T('Reisijad on bussi kiilunud', 'Passengers are trapped in the bus'),
    },
  ],
  summary: [
    T(
      '{address}. Kaugliinibuss on teelt väljas ja külili, pardal umbes {n}0 reisijat. Osa reisijaid on kiilunud.',
      '{address}. A long-distance bus is off the road and on its side with about {n}0 passengers on board. Some are trapped.',
    ),
    T(
      '{address}. Buss ja veok põrkasid kokku, buss on kraavis. Palju vigastatuid, Häirekeskus kuulutas välja suurõnnetuse.',
      '{address}. A bus and a lorry collided and the bus is in the ditch. Many injured; the Emergency Response Centre has declared a major incident.',
    ),
  ],
  callerLines: [
    T(
      'Buss on kraavis külili, inimesed karjuvad ja mõned ei saa välja!',
      'The bus is on its side in the ditch, people are screaming and some cannot get out!',
    ),
    T(
      'Ma olin selles bussis. Palju inimesi on haavatud ja juht ei liigu.',
      'I was on that bus. Lots of people are hurt and the driver is not moving.',
    ),
    T(
      'Sõitsin just otsa peale: buss on kraavis, klaasikillud on igal pool. Tulge kiiresti!',
      'I have just come upon it: the bus is in the ditch with broken glass everywhere. Come quickly!',
    ),
  ],
  details: [
    T(
      'Kiirabi sorteerib kannatanuid tee ääres, raskelt vigastatuid on mitu.',
      'Ambulance crews are triaging the casualties by the road; several are badly hurt.',
    ),
    T(
      'Päästjad lõikavad bussi katust lahti, et kiilunud reisijad välja tuua.',
      'Rescuers are cutting open the roof of the bus to free the trapped passengers.',
    ),
  ],
  beats: [
    agency(
      'kiirabi',
      [
        T(
          '{callsign}: vigastatuid on palju, kinnitage veel kiirabibrigaade!',
          '{callsign}: there are many injured, confirm more ambulance crews!',
        ),
      ],
      { timeoutMin: 3 },
    ),
    agency(
      'paaste',
      [
        T(
          '{callsign}: reisijad on kiilunud, vajame päästjaid lõikeseadmetega!',
          '{callsign}: passengers are trapped, we need rescue with cutting equipment!',
        ),
      ],
      { at: 2, timeoutMin: 4 },
    ),
    info(10, [
      T(
        '{callsign}: kannatanud on sorteeritud, raskemad viiakse esimesena haiglasse.',
        '{callsign}: the casualties are triaged; the worst go to hospital first.',
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
        'Kõik reisijad toodi bussist välja. {n}0 inimest viidi haiglatesse, enamik kergete vigastustega.',
        'All the passengers were brought out of the bus. {n}0 people were taken to hospitals, most with minor injuries.',
      ),
      { injuries: 10 },
    ),
    out(
      'serious',
      'hospital',
      [0.25, 0.7],
      3,
      T(
        'Mitu reisijat viidi raskes seisundis haiglasse, üks neist kopteriga. Õnnetuse asjaolusid uuritakse.',
        'Several passengers were taken to hospital in a serious condition, one of them by helicopter. The circumstances are under investigation.',
      ),
      { injuries: 16 },
    ),
    out(
      'slow',
      'report',
      [0.15, 0.45],
      2,
      T(
        'Päästetööd venisid ja abi jõudis osa kannatanuteni hilja. Alustati kriminaalmenetlust.',
        'The rescue dragged on and help reached some of the casualties late. Criminal proceedings were opened.',
      ),
      { injuries: 18 },
    ),
    out(
      'fatal',
      'tragedy',
      [0, 0.25],
      2,
      T(
        'Õnnetuses hukkus inimesi ja kümned said viga. Uurimist juhib prokuratuur.',
        'People were killed in the crash and dozens were injured. The prosecutor is leading the investigation.',
      ),
      { injuries: 24 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['mass_casualty', 'crisis'],
};

const traffic: IncidentTemplate = {
  id: 'crisis_bus_traffic',
  category: 'major',
  code: 'SUUR',
  title: T('Bussiõnnetus: liikluse ümbersuunamine', 'Bus crash: traffic diversion'),
  priority: 2,
  weight: 0,
  places: ['highway'],
  units: { need: [u('traffic')], ideal: [u('traffic', 2)] },
  onScene: [30, 70],
  persons: [{ role: 'driver', gender: 'any', age: [22, 66] }],
  summary: [
    T(
      '{address}. Maantee on bussiõnnetuse tõttu blokeeritud ja ummik kasvab mõlemas suunas. Liiklus tuleb ümber suunata.',
      '{address}. The highway is blocked by the bus crash and the queue is growing both ways. Traffic must be diverted.',
    ),
    T(
      '{address}. Õnnetuskoha taha on kogunenud pikk autode rivi, juhid pööravad keset teed ümber. Vaja on liiklusreguleerijat.',
      '{address}. A long line of cars has built up behind the crash and drivers are turning round in the road. Traffic control is needed.',
    ),
  ],
  callerLines: [
    T(
      'Seisame siin juba pool tundi, keegi ei ütle midagi ja inimesed pööravad keset maanteed otsa ringi.',
      'We have been standing here for half an hour, nobody tells us anything and people are turning round in the middle of the highway.',
    ),
    T(
      'Ummik on kilomeetreid pikk ja kiirabi ei pääse läbi. Kes siin liiklust juhib?',
      'The queue is kilometres long and the ambulances cannot get through. Who is directing the traffic here?',
    ),
  ],
  details: [
    T(
      'Päästesõidukitele peab jääma vaba koridor, ümbersõit on võimalik kõrvalteede kaudu.',
      'A clear corridor must stay open for the emergency vehicles; a diversion is possible via the side roads.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: alustame ümbersuunamist, päästekoridor on vaba.',
        '{callsign}: starting the diversion, the emergency corridor is clear.',
      ),
    ]),
    choice(
      8,
      [
        T(
          '{callsign}: ummikus on poolhaagisega veok, mis ümbersõidule ei mahu. Kas laseme selle aeglaselt õnnetuskohast mööda?',
          '{callsign}: there is an articulated lorry in the queue that will not fit the diversion. Do we let it past the scene slowly?',
        ),
      ],
      [
        opt(
          'wait',
          T('Ei, veok ootab', 'No, the lorry waits'),
          T(
            '{callsign}, veok jääb ootama, kuni tee avatakse.',
            '{callsign}, the lorry waits until the road reopens.',
          ),
          { success: 0.1 },
        ),
        opt(
          'pass',
          T('Jah, saatke läbi', 'Yes, escort it through'),
          T(
            '{callsign}, saatke veok aeglaselt läbi, päästjad on hoiatatud.',
            '{callsign}, escort the lorry through slowly; the rescuers are warned.',
          ),
          { success: -0.05, risk: 0.05 },
        ),
      ],
      'wait',
    ),
  ],
  outcomes: [
    out(
      'flowing',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Liiklus suunati kõrvalteedele ja päästesõidukite koridor püsis kogu aeg vaba.',
        'Traffic was diverted to the side roads and the emergency corridor stayed clear throughout.',
      ),
    ),
    out(
      'slow',
      'resolved',
      [0.25, 0.6],
      3,
      T(
        'Ümbersuunamine hakkas tööle hilja ja ummik ulatus mitme kilomeetri kaugusele.',
        'The diversion started late and the queue stretched for several kilometres.',
      ),
    ),
    out(
      'blocked',
      'report',
      [0, 0.3],
      2,
      T(
        'Ummik takistas kiirabi liikumist ja ummikus põrkasid kokku kaks autot. Juhtunu kohta alustati menetlust.',
        'The queue held up the ambulances and two cars collided in it. Proceedings were opened.',
      ),
      { injuries: 1 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

const cordon: IncidentTemplate = {
  id: 'crisis_bus_cordon',
  category: 'major',
  code: 'SUUR',
  title: T('Bussiõnnetus: sündmuskoha piiramine', 'Bus crash: securing the scene'),
  priority: 2,
  weight: 0,
  places: ['highway'],
  units: { need: [u('patrol')], ideal: [u('patrol'), u('aux', 2)] },
  onScene: [30, 70],
  persons: [{ role: 'witness', gender: 'any', age: [16, 70] }],
  summary: [
    T(
      '{address}. Bussiõnnetuse juurde koguneb pealtvaatajaid, mõni filmib kannatanuid. Ala tuleb piirata.',
      '{address}. Onlookers are gathering at the bus crash and some are filming the casualties. The area must be cordoned off.',
    ),
    T(
      '{address}. Õnnetuspaigal liigub kõrvalisi inimesi. Päästjad paluvad ala piirata ja tunnistajad kokku koguda.',
      '{address}. Bystanders are walking about the crash site. The rescuers ask for the area to be cordoned off and the witnesses gathered.',
    ),
  ],
  callerLines: [
    T(
      'Siin on rahvast täis ja keegi filmib telefoniga otse vigastatute kõrval. Tehke midagi!',
      'The place is full of people and someone is filming right next to the injured. Do something!',
    ),
    T(
      'Ma nägin, kuidas see juhtus. Kellele ma peaksin rääkima?',
      'I saw how it happened. Who should I talk to?',
    ),
  ],
  details: [
    T(
      'Tunnistajad tuleb koguda ühte kohta, et uurija saaks nendega rääkida.',
      'The witnesses must be gathered in one place so that the investigator can talk to them.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: paneme lindi üles ja suuname pealtvaatajad eemale.',
        '{callsign}: putting the tape up and moving the onlookers away.',
      ),
    ]),
    choice(
      6,
      [
        T(
          '{callsign}: üks pealtvaataja ei lõpeta filmimist ja segab päästjaid. Kas eemaldame ta jõuga?',
          '{callsign}: one onlooker will not stop filming and is in the rescuers’ way. Do we remove them by force?',
        ),
      ],
      [
        opt(
          'talk',
          T('Rääkige rahulikult', 'Talk to them calmly'),
          T(
            '{callsign}, selgitage ja suunake ta lindi taha, vajadusel vormistage protokoll.',
            '{callsign}, explain and send them behind the tape; write a report if needed.',
          ),
          { success: 0.1 },
        ),
        opt(
          'force',
          T('Eemaldage jõuga', 'Remove them by force'),
          T(
            '{callsign}, eemaldage isik alalt, kasutage vajalikku jõudu.',
            '{callsign}, remove the person from the area, using the force needed.',
          ),
          { success: -0.05, trust: -2 },
        ),
      ],
      'talk',
    ),
  ],
  outcomes: [
    out(
      'secured',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Ala piirati kiiresti, tunnistajad koguti kokku ja päästjad said rahus töötada.',
        'The area was cordoned off quickly, the witnesses were gathered and the rescuers could work undisturbed.',
      ),
    ),
    out(
      'partly',
      'warning',
      [0.25, 0.6],
      3,
      T(
        'Pealtvaatajad saadeti lindi taha, kuid osa tunnistajaid lahkus enne küsitlemist.',
        'The onlookers were sent behind the tape, but some witnesses left before they could be questioned.',
      ),
    ),
    out(
      'chaos',
      'report',
      [0, 0.3],
      2,
      T(
        'Kõrvalised inimesed segasid päästetöid ja video kannatanutest levis internetis. Alustati menetlust.',
        'Bystanders hindered the rescue and a video of the casualties spread online. Proceedings were opened.',
      ),
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

const investigation: IncidentTemplate = {
  id: 'crisis_bus_investigation',
  category: 'major',
  code: 'SUUR',
  title: T(
    'Bussiõnnetus: juhi ja tunnistajate küsitlemine',
    'Bus crash: questioning the driver and witnesses',
  ),
  priority: 3,
  weight: 0,
  places: ['highway'],
  units: { need: [u('criminal')], ideal: [u('criminal'), u('traffic')] },
  onScene: [40, 90],
  persons: [
    { role: 'driver', gender: 'M', age: [35, 64], intoxicated: 0.1, noLicense: 0.05 },
    { role: 'witness', gender: 'any', age: [18, 75] },
  ],
  vehicles: [{ role: 'involved', kind: 'bus', driverRole: 'driver' }],
  summary: [
    T(
      '{address}. Bussiõnnetuse põhjus tuleb välja selgitada: juht on teadvusel, tunnistajad ootavad sündmuskohal.',
      '{address}. The cause of the bus crash must be established: the driver is conscious and witnesses are waiting at the scene.',
    ),
    T(
      '{address}. Õnnetuskohale on vaja uurijat: jäljed tuleb fikseerida, tunnistajad küsitleda ja juht kontrollida.',
      '{address}. An investigator is needed at the scene to record the marks, question the witnesses and check the driver.',
    ),
  ],
  callerLines: [
    T(
      'Buss sõitis enne õnnetust väga kiiresti ja vahetas kogu aeg rada. Ma tahan seda politseile rääkida.',
      'Before the crash the bus was going very fast and kept changing lanes. I want to tell the police.',
    ),
    T(
      'Ma sõitsin bussi taga ja nägin, mis juhtus. Kas keegi tuleb mu ütlusi võtma?',
      'I was driving behind the bus and saw what happened. Is anyone coming to take my statement?',
    ),
  ],
  details: [
    T(
      'Bussi sõidumeerikus olevad andmed tuleb kindlustada enne, kui buss ära veetakse.',
      'The data in the bus’s tachograph must be secured before the bus is towed away.',
    ),
  ],
  beats: [
    qPerson('driver', 'arrive'),
    choice(
      15,
      [
        T(
          '{callsign}: juht ütleb, et teda pimestas vastutulev auto, tunnistaja räägib kiiruse ületamisest. Kas tellime ekspertiisi?',
          '{callsign}: the driver says an oncoming car dazzled him; a witness talks about speeding. Do we order an expert examination?',
        ),
      ],
      [
        opt(
          'expert',
          T('Jah, tellige ekspertiis', 'Yes, order an examination'),
          T(
            '{callsign}, tellime liiklusõnnetuse ekspertiisi ja kindlustame sõidumeerikuandmed.',
            '{callsign}, we are ordering a crash examination and securing the tachograph data.',
          ),
          { success: 0.15, time: 15 },
        ),
        opt(
          'statements',
          T('Piisab ütlustest', 'Statements are enough'),
          T(
            '{callsign}, võtke ütlused ja vormistage materjal.',
            '{callsign}, take the statements and write it up.',
          ),
          { success: -0.05 },
        ),
      ],
      'expert',
    ),
  ],
  outcomes: [
    out(
      'clear',
      'report',
      [0.5, 1],
      4,
      T(
        'Ütlused võeti, sõidumeerikuandmed kindlustati ja õnnetuse põhjuste selgitamiseks alustati kriminaalmenetlust.',
        'Statements were taken, the tachograph data was secured and criminal proceedings were opened to establish the cause.',
      ),
    ),
    out(
      'partial',
      'report',
      [0.2, 0.6],
      3,
      T(
        'Osa tõendeid läks bussi äraveol kaotsi, kuid menetlust alustati tunnistajate ütluste põhjal.',
        'Some evidence was lost when the bus was towed away, but proceedings were opened on the witnesses’ statements.',
      ),
    ),
    out(
      'lost',
      'unfounded',
      [0, 0.25],
      2,
      T(
        'Jäljed ja andmed jäid kindlustamata ning õnnetuse põhjus jäi selgusetuks.',
        'The marks and the data were not secured and the cause of the crash remained unclear.',
      ),
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

const relatives: IncidentTemplate = {
  id: 'crisis_bus_relatives',
  category: 'major',
  code: 'SUUR',
  title: T('Bussiõnnetus: lähedaste infopunkt', 'Bus crash: information point for relatives'),
  priority: 3,
  weight: 0,
  places: ['school'],
  units: { need: [u('patrol')], ideal: [u('community'), u('patrol')] },
  onScene: [40, 90],
  persons: [{ role: 'caller', gender: 'F', age: [35, 70] }],
  summary: [
    T(
      '{address}. Bussireisijate lähedased kogunevad infopunkti ja helistavad Häirekeskusesse. Vaja on politseinikku, kes annab infot ja peab nimekirja.',
      '{address}. The bus passengers’ relatives are gathering at the information point and phoning the Emergency Response Centre. An officer is needed to give information and keep the list.',
    ),
    T(
      '{address}. Lähedaste infopunkt on avatud ja kohal on ohvriabi. Politsei peab reisijate nimekirja üle kontrollima.',
      '{address}. The information point for relatives is open and victim support is there. The police must check the passenger list.',
    ),
  ],
  callerLines: [
    T(
      'Mu tütar sõitis selle bussiga ja ta ei vasta telefonile! Kust ma saan teada, mis temaga on?',
      'My daughter was on that bus and she is not answering her phone! Where can I find out what has happened to her?',
    ),
    T(
      'Ootan siin infopunktis juba tund aega ja keegi ei tea midagi. Kas mu mees on haiglas?',
      'I have been waiting at the information point for an hour and nobody knows anything. Is my husband in hospital?',
    ),
  ],
  details: [
    T(
      'Reisijate nimekiri tuleb enne lähedastele info andmist haiglate andmetega üle kontrollida.',
      'The passenger list must be checked against the hospitals’ records before the relatives are told anything.',
    ),
  ],
  beats: [
    agency(
      'sotsiaal',
      [
        T(
          '{callsign}: lähedasi on palju ja mitu on šokis. Kas kriisiabi on teel?',
          '{callsign}: there are many relatives and several are in shock. Is crisis support on its way?',
        ),
      ],
      { timeoutMin: 6 },
    ),
    choice(
      10,
      [
        T(
          '{callsign}: lähedased nõuavad reisijate nimekirja kohe. Kas loeme selle ette või ootame haiglate kinnitust?',
          '{callsign}: the relatives demand the passenger list now. Do we read it out or wait for the hospitals to confirm?',
        ),
      ],
      [
        opt(
          'confirm',
          T('Oodake kinnitust', 'Wait for confirmation'),
          T(
            '{callsign}, andke infot pere kaupa ja alles pärast haiglate kinnitust.',
            '{callsign}, give information one family at a time and only once the hospitals confirm.',
          ),
          { success: 0.15 },
        ),
        opt(
          'read',
          T('Lugege nimekiri ette', 'Read the list out'),
          T(
            '{callsign}, lugege nimekiri ette, aga hoiatage, et see pole lõplik.',
            '{callsign}, read the list out, but warn them that it is not final.',
          ),
          { success: -0.1, trust: -2 },
        ),
      ],
      'confirm',
    ),
  ],
  outcomes: [
    out(
      'informed',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Kõik lähedased said infot kinnitatud andmete põhjal ja ohvriabi jäi nendega edasi tegelema.',
        'Every family was told what had happened from confirmed records and victim support stayed with them.',
      ),
    ),
    out(
      'confused',
      'warning',
      [0.2, 0.6],
      3,
      T(
        'Info liikus aeglaselt ja mõni pere sai vastuolulisi teateid, kuid lõpuks selgus kõigi reisijate asukoht.',
        'Information moved slowly and some families got conflicting messages, but in the end every passenger was accounted for.',
      ),
    ),
    out(
      'wrong',
      'report',
      [0, 0.25],
      2,
      T(
        'Ühele perele anti ekslikku infot, mis tekitas suurt kahju. Juhtunu võeti kontrolli alla.',
        'One family was given wrong information, which caused great distress. The case was put under review.',
      ),
      { trust: -3 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

const chain: IncidentTemplate = {
  id: 'crisis_bus_chain',
  category: 'major',
  code: 'SUUR',
  title: T('Bussiõnnetus: ahelõnnetus ummikus', 'Bus crash: pile-up in the queue'),
  priority: 2,
  weight: 0,
  places: ['highway'],
  units: { need: [u('traffic')], ideal: [u('traffic'), u('patrol')] },
  onScene: [30, 60],
  persons: [
    { role: 'driver', gender: 'any', age: [20, 70], intoxicated: 0.05 },
    { role: 'victim', gender: 'any', age: [10, 80] },
  ],
  vehicles: [{ role: 'involved', kind: 'car', driverRole: 'driver' }],
  agencies: [
    {
      agency: 'kiirabi',
      chance: 0.6,
      reason: T('Ahelõnnetuses sai keegi viga', 'Someone was hurt in the pile-up'),
    },
  ],
  summary: [
    T(
      '{address}. Bussiõnnetuse ummiku lõpus sõitsid kolm autot üksteisele tagant otsa. Vaja on liikluspolitseid.',
      '{address}. At the end of the queue behind the bus crash three cars ran into one another. Traffic police are needed.',
    ),
    T(
      '{address}. Ummikus pidurdanud autole sõideti tagant otsa ja tee on veel kitsam. Üks juht kaebab kaelavalu.',
      '{address}. A car braking in the queue was hit from behind and the road is narrower still. One driver complains of neck pain.',
    ),
  ],
  callerLines: [
    T(
      'Keegi ei hoiatanud, et ees on ummik! Mulle sõideti tagant otsa ja mu laps on autos.',
      'Nobody warned us there was a queue ahead! I was hit from behind and my child is in the car.',
    ),
    T(
      'Siin on nüüd kolm autot kokku põrganud, kõik seisavad ja keegi ei reguleeri.',
      'Now three cars have crashed here, everything is at a standstill and nobody is directing traffic.',
    ),
  ],
  details: [
    T(
      'Ummiku lõppu on vaja hoiatusmärke, et uusi kokkupõrkeid ei tuleks.',
      'Warning signs are needed at the end of the queue so that there are no more collisions.',
    ),
  ],
  beats: [
    agency(
      'kiirabi',
      [
        T(
          '{callsign}: ühel juhil on kaelavalu, palun kiirabi.',
          '{callsign}: one driver has neck pain, ambulance please.',
        ),
      ],
      { chance: 0.6, timeoutMin: 5 },
    ),
    qVehicle('arrive', { chance: 0.5 }),
  ],
  outcomes: [
    out(
      'cleared',
      'fine',
      [0.5, 1],
      4,
      T(
        'Autod teisaldati, ummiku lõppu pandi hoiatusmärgid ja süüdi olnud juhti trahviti.',
        'The cars were moved, warning signs were put at the end of the queue and the driver at fault was fined.',
      ),
    ),
    out(
      'slow',
      'report',
      [0.2, 0.6],
      3,
      T(
        'Kokkupõrge vormistati, kuid ummik pikenes veel mitu kilomeetrit.',
        'The collision was recorded, but the queue grew by several more kilometres.',
      ),
    ),
    out(
      'hurt',
      'hospital',
      [0, 0.25],
      2,
      T(
        'Üks juht viidi kaelavigastusega haiglasse ja tee jäi pikaks ajaks kinni.',
        'One driver was taken to hospital with a neck injury and the road stayed closed for a long time.',
      ),
      { injuries: 1 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

const onlookers: IncidentTemplate = {
  id: 'crisis_bus_onlookers',
  category: 'major',
  code: 'SUUR',
  title: T('Bussiõnnetus: droon päästjate kohal', 'Bus crash: a drone over the rescuers'),
  priority: 2,
  weight: 0,
  places: ['highway'],
  units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
  onScene: [20, 50],
  persons: [{ role: 'suspect', gender: 'M', age: [18, 45] }],
  summary: [
    T(
      '{address}. Bussiõnnetuse kohal lendab droon ja meditsiinikopter ei saa maanduda. Droonipiloot tuleb leida.',
      '{address}. A drone is flying over the bus crash and the medical helicopter cannot land. The drone pilot must be found.',
    ),
    T(
      '{address}. Piiramata õnnetuspaigale tungivad pealtvaatajad, üks neist juhib drooni otse päästjate kohal.',
      '{address}. Onlookers are pushing into the unsecured crash site and one of them is flying a drone right above the rescuers.',
    ),
  ],
  callerLines: [
    T(
      'Siin lendab droon otse päästjate kohal ja kopter tiirutab, ei saa maha tulla!',
      'There is a drone right above the rescuers and the helicopter is circling, it cannot land!',
    ),
    T(
      'Mingi noormees seisab põllu ääres ja juhib drooni, inimesed filmivad igalt poolt.',
      'Some young man is standing at the edge of the field flying a drone, and people are filming from everywhere.',
    ),
  ],
  details: [
    T(
      'Droonipiloot seisab arvatavasti põllu ääres õnnetuskohast mõnisada meetrit eemal.',
      'The drone pilot is probably standing at the edge of the field a few hundred metres from the scene.',
    ),
  ],
  beats: [
    choice(
      5,
      [
        T(
          '{callsign}: leidsime droonipiloodi, ta keeldub maandumast ja filmib edasi. Kas võtame drooni ära?',
          '{callsign}: we have found the drone pilot; he refuses to land and keeps filming. Do we take the drone off him?',
        ),
      ],
      [
        opt(
          'seize',
          T('Maandage ja võtke ära', 'Land it and seize it'),
          T(
            '{callsign}, nõudke maandumist, drooni võtame menetluse ajaks hoiule.',
            '{callsign}, order the landing; we keep the drone for the proceedings.',
          ),
          { success: 0.15 },
        ),
        opt(
          'warn',
          T('Hoiatage ja saatke minema', 'Warn him and send him off'),
          T(
            '{callsign}, tehke hoiatus ja saatke ta alalt minema.',
            '{callsign}, give a warning and send him away from the area.',
          ),
          { success: 0, risk: 0.05 },
        ),
      ],
      'seize',
    ),
  ],
  outcomes: [
    out(
      'grounded',
      'report',
      [0.5, 1],
      4,
      T(
        'Droon maandati ja võeti hoiule, kopter sai maanduda. Piloodi suhtes alustati väärteomenetlust.',
        'The drone was landed and seized and the helicopter could land. Misdemeanour proceedings were opened against the pilot.',
      ),
    ),
    out(
      'late',
      'warning',
      [0.2, 0.6],
      3,
      T(
        'Droonipiloot saadeti minema, kuid kopter pidi maandumist oodates tiirutama.',
        'The drone pilot was sent away, but the helicopter had to circle while it waited to land.',
      ),
    ),
    out(
      'delayed',
      'escaped',
      [0, 0.25],
      2,
      T(
        'Droonipiloot kadus enne politsei saabumist ja raske kannatanu jõudis haiglasse hilinemisega.',
        'The drone pilot was gone before the police arrived and a badly injured casualty reached hospital late.',
      ),
      { injuries: 1 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

export const BUS: CrisisScenario = {
  id: 'bus',
  title: T('Bussiõnnetus maanteel', 'Bus crash on the highway'),
  places: ['highway'],
  briefing: T(
    '{address}. Kaugliinibuss sõitis teelt välja ja jäi külili, pardal on umbes 40 reisijat. Osa reisijaid on kiilunud, maantee on blokeeritud ja ummik kasvab mõlemas suunas. Häirekeskus kuulutas välja suurõnnetuse: kannatanutele on vaja abi, liiklus tuleb ümber suunata ja sündmuskoht piirata.',
    '{address}. A long-distance bus went off the road and is on its side with about 40 passengers on board. Some are trapped, the highway is blocked and the queue is growing both ways. The Emergency Response Centre has declared a major incident: the casualties need help, traffic must be diverted and the scene secured.',
  ),
  tasks: [
    {
      id: 'scene',
      name: T('Kannatanud ja päästetööd', 'Casualties and rescue'),
      template: scene,
      deadlineMin: 6,
    },
    {
      id: 'traffic',
      name: T('Liikluse ümbersuunamine', 'Traffic diversion'),
      template: traffic,
      deadlineMin: 12,
      offsetKm: [1, 2],
      followUp: 'chain',
    },
    {
      id: 'cordon',
      name: T('Sündmuskoha piiramine', 'Securing the scene'),
      template: cordon,
      deadlineMin: 15,
      offsetKm: [0.2, 0.4],
      followUp: 'onlookers',
    },
    {
      id: 'investigation',
      name: T('Põhjuste uurimine', 'Investigating the cause'),
      template: investigation,
      atMin: 20,
      deadlineMin: 30,
    },
    {
      id: 'relatives',
      name: T('Lähedaste infopunkt', 'Information point for relatives'),
      template: relatives,
      atMin: 25,
      deadlineMin: 30,
      place: 'school',
      offsetKm: [1.5, 3],
    },
  ],
  followUps: [
    {
      id: 'chain',
      name: T('Ahelõnnetus ummikus', 'Pile-up in the queue'),
      template: chain,
      deadlineMin: 10,
      offsetKm: [1.5, 3],
    },
    {
      id: 'onlookers',
      name: T('Droon päästjate kohal', 'A drone over the rescuers'),
      template: onlookers,
      deadlineMin: 10,
      offsetKm: [0.1, 0.3],
    },
  ],
  decisions: [
    {
      id: 'road',
      title: T('Maantee', 'Highway'),
      question: T(
        'Kas sulgeme maantee mõlemas suunas täielikult või jätame ühe raja vahelduvaks liikluseks?',
        'Do we close the highway completely in both directions or keep one lane for alternating traffic?',
      ),
      options: [
        {
          id: 'close',
          label: T('Sulge täielikult', 'Close it completely'),
          effect: T(
            'Maantee on mõlemas suunas suletud, liiklus suunatakse kõrvalteedele.',
            'The highway is closed in both directions and traffic goes to the side roads.',
          ),
          success: 0.05,
          deadline: 1.25,
        },
        {
          id: 'lane',
          label: T('Jäta üks rada', 'Keep one lane'),
          effect: T(
            'Üks rada jääb päästesõidukitele ja vahelduvale liiklusele.',
            'One lane stays open for emergency vehicles and alternating traffic.',
          ),
          success: -0.05,
          deadline: 0.9,
        },
      ],
      defaultOption: 'close',
      atMin: 3,
    },
    {
      id: 'help',
      title: T('Naabrite abi', 'Help from the neighbours'),
      question: T(
        'Kas palume naaberüksustelt abi, kui mõni ülesanne jääb ekipaažita?',
        'Do we ask the neighbouring units for help if a task is left without a crew?',
      ),
      options: [
        {
          id: 'ask',
          label: T('Palu abi', 'Ask for help'),
          effect: T(
            'Naaberüksused on valmis appi tulema, kui mõni ülesanne jääb ootama.',
            'The neighbouring units stand ready to help if a task is left waiting.',
          ),
          help: true,
        },
        {
          id: 'alone',
          label: T('Saame ise hakkama', 'We manage ourselves'),
          effect: T(
            'Abi ei küsita: kõik ülesanded jäävad meile.',
            'No help is asked for: every task stays with us.',
          ),
        },
      ],
      defaultOption: 'ask',
      atMin: 6,
    },
  ],
  radio: {
    outbreak: T(
      'Suurõnnetus! {address}: buss on teelt väljas, palju kannatanuid. Kiirabi ja pääste on teel, politseid on vaja mitmele ülesandele.',
      'Major incident! {address}: a bus is off the road with many casualties. Ambulances and rescue are on their way; the police are needed for several tasks.',
    ),
    escalate: T(
      'suurõnnetuse ülesanne on ilma ekipaažita, olukord halveneb',
      'a major incident task has no crew and the situation is getting worse',
    ),
    end: T(
      'Suurõnnetuse tööd {address} on lõpetatud. Aitäh kõigile.',
      'The work at the major incident at {address} is finished. Thank you, everyone.',
    ),
  },
};
