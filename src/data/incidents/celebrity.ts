/**
 * Stories with a well-known Estonian in them (2.32.0): a public figure from src/data/celebrities.ts calls, sees
 * something or is the one wronged, and texts name them with {celeb}. A public figure is never the suspect
 * (PersonSpec.celebrity only casts callers, witnesses and victims); where the story needs a wrongdoer, it is
 * someone made up, like the man at the club door who says he is the singer.
 */
import type { IncidentTemplate } from '@/sim/types';
import { R_SUSPECT, T, agency, backup, choice, info, opt, out, qp, search, u } from './escalating';

const FAMOUS: ('music' | 'acting' | 'media' | 'sport')[] = ['music', 'acting', 'media', 'sport'];

export const TEMPLATES_CELEBRITY: IncidentTemplate[] = [
  // 1. Scammers run fake investment ads with a public figure's face; a fan who lost money turns up at the office.
  {
    id: 'fraud_kuulsuse_nimega_investeerimispettus',
    category: 'fraud',
    code: 'KE',
    title: T('Kuulsuse nimega investeerimispettus', 'Investment scam in a celebrity’s name'),
    priority: 4,
    weight: 0.2,
    hours: 'business',
    places: ['office'],
    units: { need: [u('patrol')] },
    onScene: [20, 45],
    persons: [
      {
        role: 'caller',
        celebrity: ['politics', 'music', 'sport', 'acting', 'media', 'business'],
        age: [25, 85],
      },
      { role: 'victim', gender: 'any', age: [55, 82] },
    ],
    summary: [
      T(
        '{address}. {celeb} teatab, et petturid kasutavad tema nime ja pilti võltsitud investeerimisreklaamis. Kontorisse tuli raha kaotanud eakas inimene, kes nõuab oma raha tagasi.',
        '{address}. {celeb} reports that scammers use their name and photo in a fake investment ad. An elderly person who lost money has come to the office demanding it back.',
      ),
      T(
        '{address}. Kontoris on ärritunud külastaja, kes kaotas libareklaami kaudu oma säästud. Reklaamis olid {celeb} nimi ja nägu.',
        '{address}. An upset visitor at the office lost their savings through a fake ad that carried the name and face of {celeb}.',
      ),
    ],
    callerLines: [
      T(
        'Tere, siin {celeb}. Keegi teeb minu nime ja näoga libareklaame, kus kutsutakse krüptosse raha panema. Mul pole sellega mingit pistmist.',
        'Hello, this is {celeb}. Someone is running fake ads with my name and face telling people to put money into crypto. I have nothing to do with it.',
      ),
      T(
        'Mu kontoris on praegu üks eakas inimene, kes andis neile kaheksa tuhat eurot. Ta arvab, et mina petsin teda, ega lahku enne, kui raha tagasi saab.',
        'There is an elderly person in my office right now who gave them eight thousand euros. They think I cheated them and will not leave until they get the money back.',
      ),
      T(
        'Ta on täiesti endast väljas. Palun saatke keegi, kes oskab talle asja selgeks teha.',
        'They are completely beside themselves. Please send someone who can explain it to them.',
      ),
    ],
    details: [
      T(
        'Kannatanu tegi ülekandeid kolm nädalat ja andis petturitele oma arvutile kaugligipääsu. Pank ei tea veel midagi.',
        'The victim made transfers for three weeks and gave the scammers remote access to their computer. The bank does not know yet.',
      ),
      T(
        '{celeb} on libareklaamide eest sotsiaalmeedias juba hoiatanud, aga reklaame näidatakse edasi.',
        '{celeb} has already warned about the fake ads on social media, but they keep running.',
      ),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: oleme kohal. Kannatanu on veidi rahunenud, aga petturitel on tema arvutile endiselt kaugligipääs. Kas aitame tal kohe panka helistada ja kontod sulgeda?',
            '{callsign}: on scene. The victim has calmed down a little, but the scammers still have remote access to the computer. Do we help them call the bank and block the accounts right away?',
          ),
        ],
        [
          opt(
            'bank',
            T('Jah, kontod kohe kinni', 'Yes, block the accounts now'),
            T(
              '{callsign}, selge, helistage koos kannatanuga panka, kontod ja kaardid tuleb kohe sulgeda.',
              '{callsign}, understood, call the bank together with the victim; the accounts and cards must be blocked now.',
            ),
            { success: 0.2, time: 10 },
          ),
          opt(
            'later',
            T('Kõigepealt seletus', 'Statement first'),
            T(
              '{callsign}, võtke kõigepealt seletus, panka teavitab kannatanu ise.',
              '{callsign}, take the statement first; the victim will tell the bank.',
            ),
            { success: -0.05 },
          ),
        ],
        'later',
      ),
      info(8, [
        T(
          '{callsign}: kannatanu andis petturite telefoninumbri ja kontonumbri. Edastame need küberkuritegude talitusele ja veebikonstaablile.',
          '{callsign}: the victim gave us the scammers’ phone and account numbers. Passing them to the cybercrime unit and the web constable.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'accounts_saved',
        'report',
        [0.55, 1],
        4,
        T(
          'Kannatanu kontod suleti enne, kui petturid jõudsid järgmise ülekande teha. Kelmuse asjas alustati kriminaalmenetlust ja libareklaamid saadeti veebikonstaablile eemaldamiseks.',
          'The victim’s accounts were blocked before the scammers could make the next transfer. A criminal case for fraud was opened and the fake ads went to the web constable for removal.',
        ),
        {
          trust: 3,
          radio: T(
            '{callsign}: kontod suletud, seletus võetud, menetlus alustatud, lõpetame.',
            '{callsign}: accounts blocked, statement taken, case opened, closing.',
          ),
        },
      ),
      out(
        'statement',
        'report',
        [0.3, 0.7],
        3,
        T(
          'Kannatanult võeti seletus ja alustati kriminaalmenetlust. Raha tagasisaamine on ebatõenäoline, sest ülekanded läksid välismaa kontodele.',
          'A statement was taken and a criminal case opened. Getting the money back is unlikely, as the transfers went to foreign accounts.',
        ),
        {
          radio: T(
            '{callsign}: seletus võetud, menetlus alustatud.',
            '{callsign}: statement taken, case opened.',
          ),
        },
      ),
      out(
        'more_lost',
        'report',
        [0, 0.35],
        2,
        T(
          'Seletuse võtmise ajal tegid petturid kannatanu kontolt veel ühe suure ülekande. Pank peatas selle liiga hilja.',
          'While the statement was being taken, the scammers made another large transfer from the victim’s account. The bank stopped it too late.',
        ),
        {
          trust: -2,
          radio: T(
            '{callsign}: petturid jõudsid veel raha välja viia, menetlus alustatud.',
            '{callsign}: the scammers moved more money out, case opened.',
          ),
        },
      ),
      out(
        'left',
        'unfounded',
        [0, 0.15],
        1,
        T(
          'Kannatanu lahkus enne patrulli saabumist ega vasta telefonile. {celeb} saatis libareklaamide kuvatõmmised politseile e-postiga.',
          'The victim left before the patrol arrived and does not answer the phone. {celeb} emailed screenshots of the fake ads to the police.',
        ),
      ),
    ],
  },

  // 2. A fan has been following a performer for weeks and waits at the stage door again.
  {
    id: 'public_order_fann_jalitab_kuulsust',
    category: 'public_order',
    code: 'AK',
    title: T('Fänn jälitab tuntud esinejat', 'Fan stalking a well-known performer'),
    priority: 3,
    weight: 0.2,
    hours: 'evening',
    places: ['concert', 'hotel'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [20, 50],
    persons: [
      { role: 'victim', celebrity: ['music', 'acting', 'media', 'fashion', 'sport'], age: [18, 70] },
      { role: 'suspect', gender: 'any', age: [25, 55], relation: 'stranger', record: 0.3, restraining: 0.2 },
    ],
    callerRole: 'victim',
    summary: [
      T(
        '{place}, {address}. {celeb} teatab, et teda on nädalaid jälitanud võõras inimene, kes ootab nüüd taas teenindusukse juures.',
        '{place}, {address}. {celeb} reports being followed for weeks by a stranger who is now waiting at the service door again.',
      ),
      T(
        '{place}, {address}. Sama inimene on käinud {celeb} kõigil esinemistel, saatnud ähvardavaid sõnumeid ja püüab praegu lava taha pääseda.',
        '{place}, {address}. The same person has been at every show by {celeb}, has sent threatening messages and is now trying to get backstage.',
      ),
    ],
    callerLines: [
      T(
        'Tere, siin {celeb}. Üks inimene käib mul juba kolmandat nädalat igal pool järel. Praegu seisab ta jälle tagaukse juures.',
        'Hello, this is {celeb}. Someone has been following me everywhere for three weeks. Right now they are standing at the back door again.',
      ),
      T(
        'Ta saadab mulle iga päev kümneid sõnumeid ja teab, kus ma elan. Viimases kirjas oli, et kui ma ei vasta, tuleb ta ise.',
        'They send me dozens of messages a day and know where I live. The last one said that if I do not answer, they will come in person.',
      ),
      T(
        'Mul on hirm siit välja minna. Turvamees on minuga, aga ta ei saa teda minema ajada.',
        'I am afraid to go out. The security guard is with me but cannot make them leave.',
      ),
    ],
    details: [
      T(
        'Turvamehe sõnul on inimesel kotis lilled ja kiri ning ta ütleb, et tahab ainult rääkida. Varem on ta proovinud riietusruumi pääseda.',
        'The security guard says the person has flowers and a letter in a bag and says they only want to talk. They have tried to get into the dressing room before.',
      ),
      T(
        'Sõnumid on alles. Viimastes on ähvardusi ja vihjeid {celeb} kodule.',
        'The messages are saved. The latest ones contain threats and hints about the home of {celeb}.',
      ),
    ],
    beats: [
      qp('suspect', 3, R_SUSPECT),
      choice(
        6,
        [
          T(
            '{callsign}: isik on rahulik, aga keeldub lahkumast ja ütleb, et tal on õigus siin seista. Sõnumites on ähvardusi. Kuidas edasi?',
            '{callsign}: the person is calm but refuses to leave and says they have every right to stand here. The messages contain threats. How do we proceed?',
          ),
        ],
        [
          opt(
            'case',
            T('Seletused ja menetlus', 'Statements and a case'),
            T(
              '{callsign}, võtke kannatanult seletus ja sõnumid, rääkige isikuga ja alustage ahistava jälitamise menetlust.',
              '{callsign}, take a statement and the messages from the victim, talk to the person and open a stalking case.',
            ),
            { success: 0.2, time: 15 },
          ),
          opt(
            'moveon',
            T('Saata isik lihtsalt minema', 'Just send them away'),
            T(
              '{callsign}, saatke isik minema ja öelge, et ta siia tagasi ei tuleks.',
              '{callsign}, send the person away and tell them not to come back.',
            ),
            { success: 0 },
          ),
        ],
        'moveon',
      ),
    ],
    outcomes: [
      out(
        'case_opened',
        'report',
        [0.5, 1],
        4,
        T(
          'Kannatanult võeti seletus ja ähvardavad sõnumid. Isiku suhtes alustati ahistava jälitamise menetlust ja kannatanule selgitati, kuidas lähenemiskeeldu taotleda.',
          'A statement and the threatening messages were taken from the victim. A stalking case was opened against the person and the victim was told how to apply for a restraining order.',
        ),
        {
          trust: 3,
          radio: T(
            '{callsign}: seletused võetud, menetlus alustatud, isik lahkus.',
            '{callsign}: statements taken, case opened, the person has left.',
          ),
        },
      ),
      out(
        'detained',
        'arrest',
        [0.4, 1],
        2,
        T(
          'Isik keeldus korduvalt lahkumast ja hakkas turvameest tõukama. Ta peeti kinni ja toimetati arestimajja.',
          'The person refused again and again to leave and started pushing the security guard. They were detained and taken to the arrest house.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: isik kinni peetud, toimetame arestimajja.',
            '{callsign}: person detained, taking them to the arrest house.',
          ),
        },
      ),
      out(
        'sent_away',
        'warning',
        [0.2, 0.6],
        2,
        T(
          'Isik saadeti minema ja teda hoiatati. {celeb} lahkus turvamehe saatel tagauksest.',
          'The person was sent away with a warning. {celeb} left by the back door with the security guard.',
        ),
        { radio: T('{callsign}: isik hoiatatud ja lahkus.', '{callsign}: person warned and gone.') },
      ),
      out(
        'back_again',
        'escaped',
        [0, 0.25],
        1,
        T(
          'Isik lahkus enne patrulli saabumist. Hiljem samal õhtul ootas ta {celeb} maja juures ja politseisse helistati uuesti.',
          'The person left before the patrol arrived. Later that evening they were waiting outside the house of {celeb} and the police were called again.',
        ),
      ),
    ],
  },

  // 3. A performer's car is broken into in the venue car park during the show.
  {
    id: 'property_kuulsuse_auto_lahti_murtud',
    category: 'property',
    code: 'VG',
    title: T('Esineja autost varastati kott', 'Bag stolen from a performer’s car'),
    priority: 3,
    weight: 0.2,
    hours: 'evening',
    places: ['stadium', 'concert'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [25, 60],
    persons: [
      { role: 'victim', celebrity: FAMOUS, age: [18, 75] },
      { role: 'suspect', gender: 'M', age: [18, 45], record: 0.6 },
      { role: 'witness', gender: 'any', age: [20, 65], relation: 'employee' },
    ],
    callerRole: 'victim',
    summary: [
      T(
        '{place}, {address}. Esinemise ajal murti parklas {celeb} autosse ja tagaistmelt varastati kott dokumentide ja sülearvutiga.',
        '{place}, {address}. During the show, the car of {celeb} was broken into in the car park and a bag with documents and a laptop was taken from the back seat.',
      ),
      T(
        '{place}, {address}. {celeb} teatab purustatud autoaknast ja varastatud kotist. Parkla valvur nägi meest bussipeatuse poole jooksmas.',
        '{place}, {address}. {celeb} reports a smashed car window and a stolen bag. The car park guard saw a man running towards the bus stop.',
      ),
    ],
    callerLines: [
      T(
        'Tere, siin {celeb}. Tulin esinemiselt autosse ja juhipoolne aken on puruks löödud. Seljakott on läinud.',
        'Hello, this is {celeb}. I came back to the car after the show and the driver’s window is smashed. My backpack is gone.',
      ),
      T(
        'Seal olid sülearvuti, pass ja kõik järgmise tuuri lepingud. See on täielik katastroof.',
        'It had my laptop, my passport and all the contracts for the next tour. It is a complete disaster.',
      ),
      T(
        'Valvur ütles, et nägi kapuutsiga meest bussipeatuse poole jooksmas.',
        'The guard says he saw a man in a hood running towards the bus stop.',
      ),
    ],
    details: [
      T(
        'Parkla valvekaamera salvestas sissemurdmise. Valvuri sõnul vaatas sama mees ka varem autode akendest sisse.',
        'The car park camera recorded the break-in. The guard says the same man had been looking into car windows earlier.',
      ),
      T(
        'Sülearvuti asukoht on telefonist näha, viimati oli see umbes kilomeetri kaugusel.',
        'The laptop’s location shows on the phone; it was last about a kilometre away.',
      ),
    ],
    beats: [
      search(2, 1.5, [
        T(
          '{callsign}: alustame otsinguid parklast bussipeatuse suunas, sülearvuti asukoht näitab sinnapoole.',
          '{callsign}: starting the search from the car park towards the bus stop; the laptop’s location points that way.',
        ),
      ]),
      qp('suspect', 8, R_SUSPECT),
    ],
    outcomes: [
      out(
        'caught',
        'arrest',
        [0.55, 1],
        4,
        T(
          'Kirjeldusele vastav mees peeti sülearvuti asukoha järgi kinni lähedalt hoovist. Kott ja dokumendid anti {celeb} tagasi juba samal õhtul.',
          'A man matching the description was caught in a nearby yard by the laptop’s location. The bag and documents were back with {celeb} the same evening.',
        ),
        {
          arrests: 1,
          trust: 3,
          radio: T(
            '{callsign}: kahtlustatav kinni, asjad tagasi, toimetame arestimajja.',
            '{callsign}: suspect detained, property recovered, taking him in.',
          ),
        },
      ),
      out(
        'bag_found',
        'report',
        [0.3, 0.75],
        3,
        T(
          'Seljakott leiti prügikastist, pass ja lepingud olid alles, aga sülearvuti puudus. Valvekaamera salvestis lisati kriminaalasja.',
          'The backpack was found in a bin with the passport and contracts still in it, but the laptop was gone. The camera footage was added to the criminal case.',
        ),
        {
          radio: T(
            '{callsign}: kott leitud ilma arvutita, menetlus alustatud.',
            '{callsign}: bag found without the laptop, case opened.',
          ),
        },
      ),
      out(
        'gone',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Varas kadus enne patrulli saabumist ja sülearvuti lülitati välja. Alustati kriminaalmenetlust ja salvestis anti uurijale.',
          'The thief was gone before the patrol arrived and the laptop was switched off. A criminal case was opened and the footage handed to an investigator.',
        ),
      ),
    ],
  },

  // 4. A public figure driving past sees a car leave the road and stays with the trapped driver.
  {
    id: 'traffic_kuulus_inimene_nagi_onnetust',
    category: 'traffic',
    code: 'LÕ',
    title: T('Tuntud inimene teatab teelt väljasõidust', 'Well-known person reports a car off the road'),
    priority: 2,
    weight: 0.2,
    hours: 'day',
    places: ['highway', 'ruralroad'],
    units: { need: [u('patrol')] },
    onScene: [30, 70],
    persons: [
      { role: 'caller', celebrity: true, age: [20, 80] },
      { role: 'victim', gender: 'any', age: [18, 80] },
    ],
    summary: [
      T(
        '{address}. Sõiduauto sõitis teelt välja ja jäi katusele. Teatab mööda sõitnud {celeb}, kes peatus ja on kannatanu juures.',
        '{address}. A car left the road and landed on its roof. {celeb}, who was driving past, stopped and is with the injured driver.',
      ),
      T(
        '{address}. Teelt välja sõitnud auto on kraavis ja juht ei saa välja. Kohal on peatunud {celeb} ja veel kaks autot.',
        '{address}. A car is in the ditch and the driver cannot get out. {celeb} and two other cars have stopped at the scene.',
      ),
    ],
    callerLines: [
      T(
        'Tere, siin {celeb}. Sõitsin just mööda, üks auto lendas mu silme all kraavi ja on katuse peal.',
        'Hello, this is {celeb}. I was just driving past and a car flew into the ditch right in front of me. It is on its roof.',
      ),
      T(
        'Juht on sees, rihm kinni, ja räägib, aga ütleb, et jalg on kinni jäänud. Ma ei julge teda liigutada.',
        'The driver is inside with the belt on and talking, but says their leg is stuck. I do not dare move them.',
      ),
      T(
        'Panin ohukolmnurga välja, siin on veel kaks autot peatunud.',
        'I have put out the warning triangle; two more cars have stopped here.',
      ),
    ],
    details: [
      T(
        'Autost lekib kütust ja mootor on veel soe.',
        'Fuel is leaking from the car and the engine is still warm.',
      ),
      T(
        'Juhi sõnul hüppas põder tee peale ja ta keeras kõrvale.',
        'The driver says an elk jumped onto the road and they swerved.',
      ),
    ],
    beats: [
      agency(
        'paaste',
        'arrive',
        [
          T(
            '{callsign}: oleme kohal, juht on autos kinni, jalg tundub murtud ja kütust lekib. Palun päästjad ja kiirabi.',
            '{callsign}: on scene, the driver is trapped, the leg looks broken and fuel is leaking. Rescue and an ambulance please.',
          ),
        ],
        { timeoutMin: 6, ok: { success: 0.1 }, fail: { success: -0.2, trust: -3 } },
      ),
      info(5, [
        T(
          '{callsign}: {celeb} jäi kohale tunnistajaks, võtame temalt seletuse. Liiklus on ühest suunast suletud.',
          '{callsign}: {celeb} stayed as a witness; taking a statement. Traffic is closed in one direction.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'rescued',
        'hospital',
        [0.5, 1],
        4,
        T(
          'Päästjad lõikasid juhi autost välja ja kiirabi viis ta jalavigastusega haiglasse. {celeb} andis tunnistajana seletuse, õnnetuse põhjustas tee peale hüpanud põder.',
          'Rescuers cut the driver out and the ambulance took them to hospital with a leg injury. {celeb} gave a witness statement; an elk on the road caused the crash.',
        ),
        {
          injuries: 1,
          trust: 2,
          radio: T(
            '{callsign}: juht autost väljas, kiirabiga haiglasse, seletused võetud.',
            '{callsign}: driver out, to hospital by ambulance, statements taken.',
          ),
        },
      ),
      out(
        'slow',
        'hospital',
        [0.2, 0.6],
        2,
        T(
          'Juht saadi autost välja alles pika aja pärast ja toimetati raskes seisus haiglasse.',
          'The driver was freed only after a long time and taken to hospital in a serious condition.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: juht raskes seisus haiglasse.',
            '{callsign}: driver to hospital in a serious condition.',
          ),
        },
      ),
      out(
        'fire',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Lekkiv kütus süttis enne päästjate saabumist. Mööda sõitnud inimesed ja {celeb} tõmbasid juhi autost välja, juht sai põletushaavu.',
          'The leaking fuel caught fire before the rescuers arrived. {celeb} and other passers-by pulled the driver out; the driver suffered burns.',
        ),
        { injuries: 1 },
      ),
    ],
  },

  // 5. An athlete training on a forest trail finds an injured elderly mushroom picker.
  {
    id: 'assist_sportlane_leidis_metsast_vigastatu',
    category: 'assist',
    code: 'ABI',
    title: T('Sportlane leidis metsarajalt vigastatu', 'Athlete finds an injured person on a forest trail'),
    priority: 2,
    weight: 0.15,
    hours: 'day',
    places: ['forest', 'park'],
    units: { need: [u('patrol')] },
    onScene: [25, 60],
    persons: [
      { role: 'caller', celebrity: ['sport'], age: [16, 70] },
      { role: 'victim', gender: 'any', age: [60, 85] },
    ],
    summary: [
      T(
        '{address}. {celeb} leidis jooksurajalt kukkunud eaka inimese, kes ei saa ise püsti. Kannatanu on jahtunud ja segaduses.',
        '{address}. {celeb} found an elderly person who has fallen on a running trail and cannot get up. The person is cold and confused.',
      ),
      T(
        '{address}. Metsarajal treeninud {celeb} teatab abitult maas lamavast vanemast inimesest. Kohta on autoga raske leida.',
        '{address}. {celeb}, training on a forest trail, reports an older person lying helpless on the ground. The spot is hard to find by car.',
      ),
    ],
    callerLines: [
      T(
        'Tere, siin {celeb}. Olin trennis ja rajal lamab üks vanem inimene, ta on vist kukkunud ega saa püsti.',
        'Hello, this is {celeb}. I was training and there is an older person lying on the trail; they must have fallen and cannot get up.',
      ),
      T(
        'Ta on külm ja räägib segaselt. Panin talle oma jope peale.',
        'They are cold and confused. I have put my jacket over them.',
      ),
      T(
        'Me oleme parklast umbes kilomeetri kaugusel, autoga siia ei saa. Ma võin parklasse vastu joosta.',
        'We are about a kilometre from the car park and you cannot drive here. I can run back to the car park to meet you.',
      ),
    ],
    details: [
      T(
        'Kannatanu läks hommikul seenele ja kodused otsivad teda juba mitu tundi.',
        'The person went mushroom picking in the morning and the family has been looking for them for hours.',
      ),
      T('Kannatanul on puusavalu ja ta ei saa kõndida.', 'The person has pain in the hip and cannot walk.'),
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: oleme parklas. {celeb} pakub, et jookseb meile ja kiirabile vastu ja juhatab raja peale. Kas ootame teda?',
            '{callsign}: at the car park. {celeb} offers to run to meet us and the ambulance and lead us onto the trail. Do we wait?',
          ),
        ],
        [
          opt(
            'guide',
            T('Jah, las juhatab', 'Yes, let them guide us'),
            T(
              '{callsign}, jah, oodake juhatajat, kiirabi tuleb teie järel.',
              '{callsign}, yes, wait for the guide; the ambulance follows you.',
            ),
            { success: 0.2 },
          ),
          opt(
            'alone',
            T('Ei, otsime ise', 'No, we search ourselves'),
            T(
              '{callsign}, otsige ise raja pealt, juhataja jäägu kannatanu juurde.',
              '{callsign}, search the trail yourselves; the guide stays with the person.',
            ),
            { success: 0.05, time: 10 },
          ),
        ],
        'alone',
      ),
      agency(
        'kiirabi',
        4,
        [
          T(
            '{callsign}: oleme kannatanu juures, tõenäoliselt puusaluumurd ja alajahtumine. Kiirabi on vaja raja peale.',
            '{callsign}: with the person now, probably a broken hip and hypothermia. The ambulance needs to come onto the trail.',
          ),
        ],
        { timeoutMin: 6, ok: { success: 0.1 }, fail: { success: -0.2, trust: -2 } },
      ),
    ],
    outcomes: [
      out(
        'carried',
        'hospital',
        [0.5, 1],
        4,
        T(
          'Kannatanu kanti koos kiirabiga raja pealt autoni ja viidi puusaluumurruga haiglasse. Kodustele anti teada.',
          'The person was carried from the trail to the vehicles with the ambulance crew and taken to hospital with a broken hip. The family was told.',
        ),
        {
          injuries: 1,
          trust: 3,
          radio: T(
            '{callsign}: kannatanu kiirabiga haiglasse, lõpetame.',
            '{callsign}: person to hospital by ambulance, closing.',
          ),
        },
      ),
      out(
        'cold',
        'hospital',
        [0.2, 0.6],
        2,
        T(
          'Kannatanu leiti alles pikema otsimise järel tugevalt alajahtununa. Kiirabi viis ta haiglasse.',
          'The person was found only after a longer search and badly chilled. The ambulance took them to hospital.',
        ),
        {
          injuries: 1,
          radio: T(
            '{callsign}: kannatanu alajahtunud, haiglasse.',
            '{callsign}: person hypothermic, to hospital.',
          ),
        },
      ),
      out(
        'critical',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Kiirabi saabudes oli kannatanu teadvuseta ja raskes seisus. Ta viidi intensiivravisse.',
          'When the ambulance arrived the person was unconscious and in a serious condition, and was taken to intensive care.',
        ),
        { injuries: 1 },
      ),
    ],
  },

  // 6. A drunk man at a club door says he is a famous singer and wants the VIP table; he is not.
  {
    id: 'public_order_kuulsuse_teesklija_klubis',
    category: 'public_order',
    code: 'AK',
    title: T('Mees väidab end olevat kuulsus', 'Man claims to be a celebrity'),
    priority: 3,
    weight: 0.2,
    hours: 'nightlife',
    weekendBoost: 1.5,
    places: ['nightclub', 'hotel'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [20, 45],
    persons: [
      { role: 'suspect', gender: 'M', age: [22, 50], intoxicated: 0.8, record: 0.3 },
      { role: 'caller', gender: 'any', age: [20, 50], relation: 'employee' },
      { role: 'witness', celebrity: FAMOUS, gender: 'M', age: [20, 65] },
    ],
    summary: [
      T(
        '{place}, {address}. Turvatöötaja teatab joobes mehest, kes väidab end olevat {celeb}, nõuab tasuta VIP-lauda ja lükkab töötajaid.',
        '{place}, {address}. Security reports a drunk man who claims to be {celeb}, demands a free VIP table and is pushing staff.',
      ),
      T(
        '{place}, {address}. Mees esitleb end kui {celeb} ja on teinud suure arve, mida ta ei maksa. Töötajate sõnul ei ole ta {celeb} moodigi.',
        '{place}, {address}. A man introduces himself as {celeb} and has run up a big bill he will not pay. Staff say he does not even look like {celeb}.',
      ),
    ],
    callerLines: [
      T(
        'Siin on üks mees, kes ütleb, et ta on {celeb}, ja nõuab VIP-lauda. Ma tean väga hästi, kuidas {celeb} välja näeb, see ei ole tema.',
        'There is a man here saying he is {celeb} and demanding a VIP table. I know exactly what {celeb} looks like, and it is not him.',
      ),
      T(
        'Ta on joonud kolmesaja euro eest ja ei taha nüüd maksta, ütleb, et kuulsused ei maksa.',
        'He has drunk three hundred euros’ worth and now will not pay; he says celebrities do not pay.',
      ),
      T(
        'Kui me teda välja ei lasknud, hakkas ta tõukama ja lubas meile oma juristid kaela saata.',
        'When we would not let him out, he started pushing and threatened to set his lawyers on us.',
      ),
    ],
    details: [
      T(
        'Mees näitab telefonist pilte {celeb} kontserdilt ja kinnitab, et need tõestavad tema isikut.',
        'The man shows photos from a concert by {celeb} on his phone and insists they prove who he is.',
      ),
      T(
        'Klubi juhataja helistas {celeb} mänedžerile: päris {celeb} on praegu hoopis teises linnas.',
        'The club manager called the manager of {celeb}: the real {celeb} is in another town right now.',
      ),
    ],
    beats: [
      qp('suspect', 2, R_SUSPECT),
      info(5, [
        T(
          '{callsign}: dokumendi järgi on tegu hoopis teise inimesega. Mees jääb endiselt oma loo juurde, et ta on {celeb}.',
          '{callsign}: his ID says he is somebody else entirely. He still sticks to his story that he is {celeb}.',
        ),
      ]),
    ],
    outcomes: [
      out(
        'paid_fined',
        'fine',
        [0.5, 1],
        4,
        T(
          'Mees maksis arve ja talle määrati avaliku korra rikkumise eest trahv. Dokumendi järgi oli tegu hoopis kohaliku ehitajaga.',
          'The man paid the bill and was fined for a public order offence. His ID showed he was in fact a local builder.',
        ),
        {
          trust: 2,
          radio: T(
            '{callsign}: arve makstud, trahv tehtud, lõpetame.',
            '{callsign}: bill paid, fine issued, closing.',
          ),
        },
      ),
      out(
        'detained',
        'arrest',
        [0.4, 1],
        2,
        T(
          'Mees keeldus maksmast ja ründas turvatöötajat. Ta peeti kinni ja toimetati kainenema.',
          'The man refused to pay and attacked a security guard. He was detained and taken to sober up.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: mees kinni peetud, toimetame kainenema.',
            '{callsign}: man detained, taking him to sober up.',
          ),
        },
      ),
      out(
        'calmed',
        'warning',
        [0.25, 0.6],
        2,
        T(
          'Mees rahunes, maksis osa arvest ja lubas ülejäänu homme tasuda. Teda hoiatati ja ta lahkus.',
          'The man calmed down, paid part of the bill and promised to pay the rest tomorrow. He was warned and left.',
        ),
        { radio: T('{callsign}: mees hoiatatud ja lahkus.', '{callsign}: man warned and gone.') },
      ),
      out(
        'ran',
        'escaped',
        [0, 0.3],
        2,
        T(
          'Mees lahkus enne patrulli saabumist arvet maksmata. Turvakaamera salvestis ja tema telefoninumber anti menetlejale.',
          'The man left before the patrol arrived without paying. The camera footage and his phone number were handed to an investigator.',
        ),
      ),
    ],
  },

  // 7. A drunk man harasses a politician at a street meeting with voters.
  {
    id: 'public_order_poliitiku_ahistamine_tanaval',
    category: 'public_order',
    code: 'AK',
    title: T('Poliitikut ahistatakse tänavaüritusel', 'Politician harassed at a street event'),
    priority: 3,
    weight: 0.15,
    hours: 'day',
    places: ['street', 'oldtown', 'mall'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [20, 45],
    persons: [
      { role: 'victim', celebrity: ['politics'], age: [25, 85] },
      { role: 'suspect', gender: 'M', age: [30, 65], intoxicated: 0.6, record: 0.3 },
      { role: 'caller', gender: 'any', age: [20, 60], relation: 'stranger' },
    ],
    summary: [
      T(
        '{address}. Joobes mees karjub kohtumisel valijatega {celeb} peale, lükkas laua ümber ega lase tal minna.',
        '{address}. A drunk man is shouting at {celeb} at a meeting with voters, has knocked a table over and will not let them leave.',
      ),
      T(
        '{address}. Tänavaüritusel on agressiivne mees, kes sõimab {celeb} ja tikub kallale. Korraldajate palvel ta ei lahku.',
        '{address}. An aggressive man at a street event is abusing {celeb} and trying to pick a fight. He will not leave when the organisers ask.',
      ),
    ],
    callerLines: [
      T(
        'Siin on üks purjus mees, kes karjub juba kümme minutit {celeb} peale ja lükkas meie laua ümber.',
        'There is a drunk man here who has been shouting at {celeb} for ten minutes and knocked our table over.',
      ),
      T(
        'Ta ei lase meil minna, seisab ees ja ähvardab. Inimesed filmivad.',
        'He will not let us go, he stands in the way and makes threats. People are filming.',
      ),
      T('Palun tulge kiiresti, ta läheb aina hullemaks.', 'Please come quickly, he is getting worse.'),
    ],
    details: [
      T(
        'Mehe sõnul on ta vihane otsuse pärast, mis puudutas tema pensioni.',
        'The man says he is angry about a decision that affected his pension.',
      ),
      T('Mehel on käes klaaspudel.', 'The man is holding a glass bottle.'),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.35,
      toPriority: 2,
      text: T(
        'Mees on hakanud inimesi tõukama ja vehib pudeliga, korraldajad püüavad teda eemal hoida.',
        'The man has started pushing people and waving the bottle; the organisers are trying to hold him back.',
      ),
    },
    beats: [
      qp('suspect', 2, R_SUSPECT),
      choice(
        5,
        [
          T(
            '{callsign}: mees on rahunemas, aga keeldub lahkumast ja nõuab {celeb} vastust. Kas viime ta eemale ja vormistame või piisab hoiatusest?',
            '{callsign}: the man is calming down but refuses to leave and demands an answer from {celeb}. Do we remove him and write it up, or is a warning enough?',
          ),
        ],
        [
          opt(
            'process',
            T('Eemaldada ja vormistada', 'Remove and write it up'),
            T(
              '{callsign}, viige mees eemale, võtke tunnistajatelt seletused ja vormistage avaliku korra rikkumine.',
              '{callsign}, take the man away, get statements from witnesses and write up the public order offence.',
            ),
            { success: 0.2, time: 10 },
          ),
          opt(
            'warn',
            T('Suuline hoiatus', 'Verbal warning'),
            T('{callsign}, piisab hoiatusest, kui ta lahkub.', '{callsign}, a warning will do if he leaves.'),
            { success: 0.05 },
          ),
        ],
        'warn',
      ),
    ],
    outcomes: [
      out(
        'removed',
        'fine',
        [0.45, 1],
        4,
        T(
          'Mees viidi eemale ja talle koostati avaliku korra rikkumise eest protokoll. Üritus jätkus.',
          'The man was taken away and written up for a public order offence. The event went on.',
        ),
        {
          trust: 3,
          radio: T(
            '{callsign}: mees eemaldatud, protokoll koostatud, lõpetame.',
            '{callsign}: man removed, report written, closing.',
          ),
        },
      ),
      out(
        'detained',
        'arrest',
        [0.5, 1],
        1,
        T(
          'Mees üritas patrullist mööda {celeb} juurde tagasi tungida ja peeti kinni. Ta toimetati kainenema.',
          'The man tried to push past the patrol back towards {celeb} and was detained. He was taken to sober up.',
        ),
        {
          arrests: 1,
          radio: T(
            '{callsign}: mees kinni peetud, toimetame kainenema.',
            '{callsign}: man detained, taking him to sober up.',
          ),
        },
      ),
      out(
        'warned',
        'warning',
        [0.2, 0.6],
        2,
        T(
          'Mees sai hoiatuse ja lahkus. Korraldajad lõpetasid ürituse plaanitust varem.',
          'The man was warned and left. The organisers ended the event earlier than planned.',
        ),
        { radio: T('{callsign}: mees hoiatatud ja lahkus.', '{callsign}: man warned and gone.') },
      ),
      out(
        'bottle',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Enne patrulli saabumist viskas mees pudeli, mis tabas üht korraldajat. Kiirabi vaatas kannatanu üle, mees peeti hiljem kinni.',
          'Before the patrol arrived the man threw the bottle and hit one of the organisers. The ambulance checked the injured person; the man was detained later.',
        ),
        { injuries: 1, arrests: 1 },
      ),
    ],
  },

  // 8. Far more fans than expected come to a signing at a shopping centre and the crowd surges.
  {
    id: 'public_order_fannide_tunglemine_kaubanduskeskuses',
    category: 'public_order',
    code: 'AK',
    title: T('Tunglemine kuulsuse autogrammitunnil', 'Crowd surge at a celebrity signing'),
    priority: 2,
    weight: 0.15,
    hours: 'day',
    places: ['mall'],
    units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
    onScene: [25, 60],
    persons: [
      { role: 'caller', gender: 'any', age: [22, 55], relation: 'employee' },
      { role: 'witness', celebrity: FAMOUS, age: [16, 50] },
      { role: 'victim', gender: 'F', age: [11, 15] },
    ],
    summary: [
      T(
        '{place}, {address}. {celeb} autogrammitunnile tuli oodatust palju rohkem inimesi. Rahvas surub lava poole ja üks laps minestas.',
        '{place}, {address}. Far more people than expected came to a signing by {celeb}. The crowd is pushing towards the stage and a child has fainted.',
      ),
      T(
        '{place}, {address}. Keskuse turvajuht teatab tunglemisest {celeb} autogrammitunnil, turvatöötajad ei saa rahvast enam kontrolli alla.',
        '{place}, {address}. The centre’s head of security reports a crowd surge at a signing by {celeb}; the guards can no longer control the crowd.',
      ),
    ],
    callerLines: [
      T(
        'Siin on {celeb} autogrammitund ja tuli umbes kaks tuhat inimest. Me ootasime paarisadat.',
        'It is a signing by {celeb} and about two thousand people came. We expected a couple of hundred.',
      ),
      T(
        'Rahvas surub tõkete peale, üks tüdruk minestas ja tal on raske hingata.',
        'The crowd is pressing on the barriers; a girl has fainted and is struggling to breathe.',
      ),
      T(
        'Meil on neli turvameest ja me ei saa enam midagi teha. Saatke palun abi.',
        'We have four guards and there is nothing more we can do. Please send help.',
      ),
    ],
    details: [
      T(
        '{celeb} lõpetas autogrammide jagamise ja palus mikrofoni kaudu rahval taganeda, aga tagumised read ei kuule.',
        '{celeb} stopped signing and asked the crowd over the microphone to step back, but the rows at the back cannot hear.',
      ),
      T(
        'Keskuse peauks on rahvast täis, kiirabi peab tulema kaubaväravast.',
        'The main entrance is packed; the ambulance has to come through the goods entrance.',
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.35,
      toPriority: 1,
      text: T(
        'Tõkked kukkusid, mitu inimest on maas ja rahvas surub edasi.',
        'The barriers have collapsed, several people are on the ground and the crowd keeps pushing.',
      ),
    },
    beats: [
      backup(u('patrol'), 'arrive', [
        T(
          '{callsign}: oleme kohal, rahvast on väga palju ja tõkked hakkavad järele andma. Vajame veel üht ekipaaži.',
          '{callsign}: on scene, the crowd is huge and the barriers are starting to give. We need one more crew.',
        ),
      ]),
      agency(
        'kiirabi',
        3,
        [
          T(
            '{callsign}: minestanud laps on välja toodud, ta on teadvusel, aga hingab raskelt. Palun kiirabi kaubavärava juurde.',
            '{callsign}: the girl who fainted has been brought out; she is conscious but breathing with difficulty. Ambulance to the goods entrance please.',
          ),
        ],
        { timeoutMin: 6 },
      ),
    ],
    outcomes: [
      out(
        'cleared',
        'resolved',
        [0.5, 1],
        4,
        T(
          'Patrullid ja turvatöötajad juhtisid rahva rahulikult välja ning üritus lõpetati. Minestanud laps viidi ülevaatuseks haiglasse, raskeid vigastusi ei olnud.',
          'The patrols and guards led the crowd out calmly and the event was ended. The girl who fainted was taken to hospital for a check; nobody was seriously hurt.',
        ),
        {
          trust: 3,
          radio: T(
            '{callsign}: rahvas laiali, üritus lõpetatud, lõpetame.',
            '{callsign}: crowd dispersed, event ended, closing.',
          ),
        },
      ),
      out(
        'injured',
        'hospital',
        [0.2, 0.6],
        2,
        T(
          'Tunglemises said mitu inimest kergeid vigastusi ja kiirabi viis kaks last haiglasse. Üritus lõpetati.',
          'Several people were slightly hurt in the crush and the ambulance took two children to hospital. The event was ended.',
        ),
        {
          injuries: 2,
          radio: T(
            '{callsign}: mitu kergelt vigastatut, kaks last haiglasse.',
            '{callsign}: several slightly hurt, two children to hospital.',
          ),
        },
      ),
      out(
        'crush',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Tõkked kukkusid ja mitu inimest jäi rahva alla. Kiirabi viis viis inimest haiglasse, kaks neist raskes seisus.',
          'The barriers collapsed and several people went down under the crowd. Ambulances took five people to hospital, two of them in a serious condition.',
        ),
        { injuries: 5 },
      ),
    ],
  },
];
