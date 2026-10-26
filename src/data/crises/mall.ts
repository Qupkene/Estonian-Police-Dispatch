/**
 * Kaubanduskeskuse evakueerimine (2.37.0, docs/CRISIS.md): a bomb threat by e-mail to a shopping centre full of people,
 * thousands of visitors to lead out, an unattended bag by a staircase, the car park and the junctions jammed. The owner
 * has not drawn it yet: the briefing is a text card.
 *
 * Tasks: the evacuation, the cordon round the building and the car park and the traffic at the junctions (at once, the
 * last two off the spot), the search of the building with an explosives dog and the tracing of the threat's sender
 * (later). A cordon that waits too long brings a crush at an exit; traffic that waits, a gridlock that holds up bomb
 * disposal.
 */
import type { CrisisScenario } from '@/sim/crisis';
import type { IncidentTemplate } from '@/sim/types';
import { T, agency, choice, info, opt, out, qPerson, u } from '../incidents/_helpers_c';

const evacuation: IncidentTemplate = {
  id: 'crisis_mall_evacuation',
  category: 'major',
  code: 'SUUR',
  title: T('Pommiähvardus: külastajate evakueerimine', 'Bomb threat: evacuating the visitors'),
  priority: 1,
  weight: 0,
  places: ['mall'],
  units: { need: [u('patrol', 2)], ideal: [u('patrol', 3), u('rapid')] },
  onScene: [40, 90],
  persons: [
    { role: 'caller', gender: 'any', age: [30, 60], relation: 'employee' },
    { role: 'witness', gender: 'any', age: [16, 75], relation: 'customer' },
  ],
  summary: [
    T(
      '{place}, {address}. Keskusele saabus e-kirjaga pommiähvardus ja turvatöötajad alustasid evakueerimist. Hoones on umbes {n}000 inimest ja väljapääsud on rahvast täis.',
      '{place}, {address}. The centre has received a bomb threat by e-mail and the security staff have begun the evacuation. There are about {n},000 people inside and the exits are packed.',
    ),
    T(
      '{place}, {address}. Kaubanduskeskus evakueeritakse pommiähvarduse tõttu, kuid osa külastajaid ja töötajaid ei taha lahkuda. Politseid on vaja väljapääsudele ja kogunemiskohta.',
      '{place}, {address}. The shopping centre is being evacuated because of a bomb threat, but some visitors and staff do not want to leave. Police are needed at the exits and the assembly point.',
    ),
  ],
  callerLines: [
    T(
      'Ma olen keskuse turvajuht. Meile tuli e-kiri, et majas on pomm. Evakueerime, aga inimesi on tuhandeid!',
      'I am the centre’s head of security. We got an e-mail saying there is a bomb in the building. We are evacuating, but there are thousands of people!',
    ),
    T(
      'Teadaanne ütles, et kõik peavad lahkuma, aga keegi ei ütle, miks. Inimesed jooksevad ja lapsed nutavad.',
      'The announcement said everyone has to leave, but nobody says why. People are running and children are crying.',
    ),
    T(
      'Ma töötan siin kaupluses. Kas me peame poe lukku panema või kohe välja minema?',
      'I work in a shop here. Do we have to lock up the shop or get out straight away?',
    ),
  ],
  details: [
    T(
      'Turvatöötajad juhivad inimesi välja keskuse evakuatsiooniplaani järgi, liftid on välja lülitatud.',
      'The security staff are leading people out according to the centre’s evacuation plan; the lifts are switched off.',
    ),
    T(
      'Ratastoolis ja väikelastega külastajad vajavad treppidel abi.',
      'Visitors in wheelchairs and with small children need help on the stairs.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: kohal, aitame turvatöötajatel inimesi välja juhtida. Kogunemiskoht on parklast eemal.',
        '{callsign}: on scene, helping the security staff lead people out. The assembly point is away from the car park.',
      ),
    ]),
    choice(
      5,
      [
        T(
          '{callsign}: kaupluste töötajad tahavad enne lahkumist kassad kokku lüüa ja poed lukustada. Kas lubame?',
          '{callsign}: the shop staff want to cash up and lock their shops before they leave. Do we allow it?',
        ),
      ],
      [
        opt(
          'leave',
          T('Ei, kõik lahkuvad kohe', 'No, everyone leaves now'),
          T(
            '{callsign}, kõik lahkuvad kohe, poed jäävad turvatöötajate valve alla.',
            '{callsign}, everyone leaves now; the shops stay under the security staff’s watch.',
          ),
          { success: 0.1 },
        ),
        opt(
          'lock',
          T('Andke paar minutit', 'Give them a couple of minutes'),
          T(
            '{callsign}, andke neile paar minutit, siis kõik välja.',
            '{callsign}, give them a couple of minutes, then everyone out.',
          ),
          { success: -0.05, risk: 0.05 },
        ),
      ],
      'leave',
    ),
    info(15, [
      T(
        '{callsign}: keskus on tühi, turvatöötajad kontrollisid ka tualetid ja proovikabiinid. Inimesed on kogunemiskohas.',
        '{callsign}: the centre is empty; the security staff have also checked the toilets and the fitting rooms. People are at the assembly point.',
      ),
    ]),
  ],
  outcomes: [
    out(
      'orderly',
      'resolved',
      [0.55, 1],
      4,
      T(
        'Keskus evakueeriti poole tunniga ja inimesed juhiti kogunemiskohta. Keegi ei saanud viga.',
        'The centre was evacuated within half an hour, with everyone led to the assembly point. Nobody was hurt.',
      ),
    ),
    out(
      'fall',
      'hospital',
      [0.3, 0.7],
      3,
      T(
        'Evakueerimine venis ja trepil kukkus mitu inimest. Üks neist viidi kiirabiga haiglasse.',
        'The evacuation dragged on and several people fell on the stairs. One of them was taken to hospital by ambulance.',
      ),
      { injuries: 1 },
    ),
    out(
      'hidden',
      'report',
      [0.15, 0.45],
      2,
      T(
        'Koer leidis kaupluse laost end peitnud mehe, keda evakueerimisel ei märgatud. Tema suhtes alustati väärteomenetlust.',
        'The dog found a man hiding in a shop stockroom, missed during the evacuation. Misdemeanour proceedings were opened against him.',
      ),
    ),
    out(
      'crush',
      'hospital',
      [0, 0.3],
      2,
      T(
        'Väljapääsudel tekkis tunglemine, milles sai viga mitu inimest. Kolm neist viidi haiglasse ja evakueerimise korraldust uuritakse.',
        'A crush formed at the exits, injuring several people. Three were taken to hospital and the handling of the evacuation is under investigation.',
      ),
      { injuries: 4 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['bomb', 'crowd', 'crisis'],
};

const cordon: IncidentTemplate = {
  id: 'crisis_mall_cordon',
  category: 'major',
  code: 'SUUR',
  title: T(
    'Pommiähvardus: hoone ja parkla piiramine',
    'Bomb threat: cordoning off the building and car park',
  ),
  priority: 2,
  weight: 0,
  places: ['mall'],
  units: { need: [u('patrol')], ideal: [u('patrol'), u('aux', 2)] },
  onScene: [30, 70],
  persons: [{ role: 'witness', gender: 'any', age: [18, 75], relation: 'customer' }],
  summary: [
    T(
      '{address}. Evakueeritud inimesed seisavad keskuse uste ees ja parklas. Ala tuleb piirata ja inimesed kogunemiskohta suunata.',
      '{address}. The evacuated people are standing outside the doors of the centre and in the car park. The area must be cordoned off and people sent to the assembly point.',
    ),
    T(
      '{address}. Kaubanduskeskuse ümber pole veel linti, inimesed lähevad parklasse oma autode juurde ja mõni tahab tagasi sisse. Vaja on piiramist.',
      '{address}. There is no tape round the shopping centre yet; people are going to their cars in the car park and some want to go back inside. A cordon is needed.',
    ),
  ],
  callerLines: [
    T(
      'Inimesed seisavad otse uste ees ja keegi ei ütle, kui kaugele minna. Kas see pole ohtlik?',
      'People are standing right outside the doors and nobody tells them how far to go. Isn’t that dangerous?',
    ),
    T(
      'Mu auto on parklas, lapse turvatool ja kõik asjad on sees. Miks ma sinna minna ei tohi?',
      'My car is in the car park with the child seat and all my things in it. Why can’t I go there?',
    ),
  ],
  details: [
    T(
      'Parkla jääb ohualasse: sinna ei tohi kedagi lasta enne, kui koer on selle üle kontrollinud.',
      'The car park is inside the danger zone: nobody may go in until the dog has checked it.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: paneme lindi üles ja suuname inimesed kogunemiskohta.',
        '{callsign}: putting the tape up and sending people to the assembly point.',
      ),
    ]),
    choice(
      6,
      [
        T(
          '{callsign}: inimesed nõuavad pääsu parklasse oma autode juurde. Kas laseme neil autod välja viia?',
          '{callsign}: people are demanding to get to their cars in the car park. Do we let them drive out?',
        ),
      ],
      [
        opt(
          'hold',
          T('Ei, parkla jääb suletuks', 'No, the car park stays closed'),
          T(
            '{callsign}, parklasse ei lasta kedagi enne, kui koer on selle üle kontrollinud.',
            '{callsign}, nobody goes into the car park until the dog has checked it.',
          ),
          { success: 0.1 },
        ),
        opt(
          'let',
          T('Laske autod välja', 'Let the cars out'),
          T(
            '{callsign}, laske inimesed ükshaaval autode juurde ja suunake kohe välja.',
            '{callsign}, let people to their cars one at a time and send them straight out.',
          ),
          { success: -0.05, risk: 0.05 },
        ),
      ],
      'hold',
    ),
  ],
  outcomes: [
    out(
      'secured',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Ala piirati kiiresti. Keegi ei pääsenud tagasi hoonesse ega parklasse.',
        'The area was cordoned off quickly. Nobody got back into the building or the car park.',
      ),
    ),
    out(
      'partly',
      'warning',
      [0.25, 0.6],
      3,
      T(
        'Lint pandi üles hilja, nii et osa inimesi jõudis enne seda parklasse oma autode juurde.',
        'The tape went up late, so some people reached their cars in the car park before it did.',
      ),
    ),
    out(
      'breached',
      'report',
      [0, 0.3],
      2,
      T(
        'Inimesed liikusid ohualal vabalt. Üks mees läks isegi tagasi keskusesse oma asjade järele ja tema suhtes alustati väärteomenetlust.',
        'People moved freely in the danger zone. One man even went back into the centre for his things and misdemeanour proceedings were opened against him.',
      ),
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

const traffic: IncidentTemplate = {
  id: 'crisis_mall_traffic',
  category: 'major',
  code: 'SUUR',
  title: T('Pommiähvardus: ristmikud ja parkla väljasõidud', 'Bomb threat: junctions and car park exits'),
  priority: 2,
  weight: 0,
  places: ['mall'],
  units: { need: [u('traffic')], ideal: [u('traffic'), u('patrol')] },
  onScene: [30, 70],
  persons: [{ role: 'driver', gender: 'any', age: [20, 70] }],
  summary: [
    T(
      '{address}. Evakueeritud külastajad tahavad korraga parklast välja sõita ja lähimad ristmikud on umbes. Liiklust tuleb reguleerida.',
      '{address}. The evacuated visitors are all trying to drive out of the car park at once and the nearest junctions are jammed. Traffic must be directed.',
    ),
    T(
      '{address}. Parkla väljasõidud on ummistunud, autod seisavad keset ristmikku ja päästeautod ei pääse keskuse juurde.',
      '{address}. The car park exits are blocked, cars are stuck in the middle of the junction and the fire engines cannot get to the centre.',
    ),
  ],
  callerLines: [
    T(
      'Seisan parkla väljasõidus juba kakskümmend minutit, midagi ei liigu ja kõik tuututavad.',
      'I have been stuck at the car park exit for twenty minutes, nothing moves and everyone is hooting.',
    ),
    T(
      'Ristmik on täiesti umbes ja foorid ei aita. Päästeauto seisab vilkuritega ummikus.',
      'The junction is completely jammed and the lights are no help. A fire engine is stuck in the queue with its lights flashing.',
    ),
  ],
  details: [
    T(
      'Demineerijatele ja päästjatele peab jääma vaba sissesõit keskuse juurde.',
      'A clear way in to the centre must stay open for bomb disposal and the rescuers.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: oleme ristmikul, reguleerime käsitsi ja hoiame päästesõidukitele raja vaba.',
        '{callsign}: at the junction, directing traffic by hand and keeping a lane free for the emergency vehicles.',
      ),
    ]),
    choice(
      8,
      [
        T(
          '{callsign}: üks juht sõitis tõkkepuust läbi ja kihutas parklast minema. Kas sõidame talle järele?',
          '{callsign}: a driver has smashed through the barrier and sped out of the car park. Do we go after the car?',
        ),
      ],
      [
        opt(
          'stay',
          T('Ei, jääge ristmikule', 'No, stay at the junction'),
          T(
            '{callsign}, jääge ristmikule, numbrimärk läheb teistele ekipaažidele.',
            '{callsign}, stay at the junction; the plate goes out to the other crews.',
          ),
          { success: 0.1 },
        ),
        opt(
          'chase',
          T('Sõitke järele', 'Go after the car'),
          T(
            '{callsign}, sõitke järele, ristmik jääb reguleerijata.',
            '{callsign}, go after it; the junction is left with nobody directing traffic.',
          ),
          { success: -0.1, risk: 0.05 },
        ),
      ],
      'stay',
    ),
  ],
  outcomes: [
    out(
      'flowing',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Parkla tühjenes korrapäraselt. Demineerijate sissesõit püsis kogu aeg vaba.',
        'The car park emptied in good order. The way in for bomb disposal stayed clear throughout.',
      ),
    ),
    out(
      'slow',
      'resolved',
      [0.25, 0.6],
      3,
      T(
        'Ristmikud olid tund aega umbes, kuid päästesõidukid pääsesid keskuse juurde.',
        'The junctions were jammed for an hour, but the emergency vehicles got through to the centre.',
      ),
    ),
    out(
      'blocked',
      'report',
      [0, 0.3],
      2,
      T(
        'Parkla väljasõidus põrkasid kokku kaks autot. Ummik takistas päästesõidukeid ja alustati menetlust.',
        'Two cars collided at the car park exit. The jam held up the emergency vehicles and proceedings were opened.',
      ),
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

const search: IncidentTemplate = {
  id: 'crisis_mall_search',
  category: 'major',
  code: 'SUUR',
  title: T(
    'Pommiähvardus: hoone läbiotsimine lõhkeainekoeraga',
    'Bomb threat: searching the building with an explosives dog',
  ),
  priority: 1,
  weight: 0,
  places: ['mall'],
  units: { need: [u('k9')], ideal: [u('k9'), u('special')] },
  onScene: [40, 80],
  persons: [{ role: 'witness', gender: 'any', age: [22, 60], relation: 'employee' }],
  agencies: [
    {
      agency: 'paaste',
      chance: 1,
      reason: T(
        'Demineerimiskeskus: omanikuta kott trepi juures ja hoone kontroll',
        'Bomb disposal centre: the unattended bag by the stairs and the building search',
      ),
    },
  ],
  summary: [
    T(
      '{place}, {address}. Evakueeritud keskuses leiti trepi juurest omanikuta kott. Hoone tuleb lõhkeainekoeraga läbi otsida, demineerijad on teel.',
      '{place}, {address}. An unattended bag has been found by a staircase in the evacuated centre. The building must be searched with an explosives dog; bomb disposal are on their way.',
    ),
    T(
      '{place}, {address}. Keskus on tühi, kuid hoone on kontrollimata. Turvatöötaja märkas evakuatsioonitrepi all musta spordikotti, mida keegi ei tunne.',
      '{place}, {address}. The centre is empty, but the building has not been checked. A security guard noticed a black sports bag under the emergency stairs that nobody recognises.',
    ),
  ],
  callerLines: [
    T(
      'Ma olen siin turvatöötaja. Trepi all on must kott, mida enne seal polnud. Ma ei puutunud seda.',
      'I am a security guard here. There is a black bag under the stairs that was not there before. I have not touched it.',
    ),
    T(
      'Kaamera järgi on kott seal olnud vähemalt tund aega ja keegi pole sellele järele tulnud.',
      'According to the camera the bag has been there for at least an hour and nobody has come back for it.',
    ),
  ],
  details: [
    T(
      'Keskuses on mitu korrust, laod ja tehnoruumid: koer peab need kõik läbi käima.',
      'The centre has several floors, storerooms and plant rooms, and the dog must go through them all.',
    ),
  ],
  beats: [
    agency(
      'paaste',
      [
        T(
          '{callsign}: kohal. Kott on trepi all ja ala on inimestest tühi. Kinnitage demineerijate väljasõit!',
          '{callsign}: on scene. The bag is under the stairs and the area is clear of people. Confirm bomb disposal is on its way!',
        ),
      ],
      { timeoutMin: 5 },
    ),
    choice(
      15,
      [
        T(
          '{callsign}: koer on kaks korrust läbi käinud ja midagi ei leidnud. Keskuse juhataja tahab need korrused avada. Kas lubame?',
          '{callsign}: the dog has been through two floors and found nothing. The centre manager wants to reopen those floors. Do we allow it?',
        ),
      ],
      [
        opt(
          'wait',
          T('Ei, enne kogu hoone kontroll', 'No, the whole building first'),
          T(
            '{callsign}, keskus jääb suletuks, kuni koer ja demineerijad on kogu hoone üle vaadanud.',
            '{callsign}, the centre stays closed until the dog and bomb disposal have checked the whole building.',
          ),
          { success: 0.15 },
        ),
        opt(
          'open',
          T('Avage kontrollitud korrused', 'Reopen the checked floors'),
          T(
            '{callsign}, kontrollitud korrused võib avada, ülejäänud hoone jääb lindi taha.',
            '{callsign}, the checked floors may reopen; the rest of the building stays behind the tape.',
          ),
          { success: -0.1, risk: 0.05 },
        ),
      ],
      'wait',
    ),
    info(30, [
      T(
        '{callsign}: demineerijad tegid kotist röntgenpildi. Koer kontrollib nüüd parklat ja tehnoruume.',
        '{callsign}: bomb disposal have X-rayed the bag. The dog is now checking the car park and the plant rooms.',
      ),
    ]),
  ],
  outcomes: [
    out(
      'clear',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Koer ja demineerijad kontrollisid kogu hoone. Kotis olid riided ja spordijalanõud, lõhkekeha ei leitud ja keskus avati.',
        'The dog and bomb disposal checked the whole building. The bag held clothes and trainers, no device was found and the centre reopened.',
      ),
    ),
    out(
      'mockup',
      'report',
      [0.45, 1],
      2,
      T(
        'Kotis oli juhtmete ja kellaga lõhkeseadeldise makett. Demineerijad kahjutustasid selle ja alustati kriminaalmenetlust.',
        'The bag held a mock-up bomb with wires and a clock. Bomb disposal made it safe and criminal proceedings were opened.',
      ),
    ),
    out(
      'long',
      'resolved',
      [0.2, 0.6],
      3,
      T(
        'Otsing venis, sest koer vajas vahepeal puhkust. Keskus oli mitu tundi suletud, lõhkekeha ei leitud.',
        'The search dragged on because the dog needed rests. The centre was closed for several hours and no device was found.',
      ),
    ),
    out(
      'second',
      'report',
      [0, 0.25],
      2,
      T(
        'Teine omanikuta kott leiti alles pärast keskuse avamist, nii et hoone tuli uuesti evakueerida. Juhtunut uuritakse.',
        'A second unattended bag turned up after the centre reopened, so the building had to be evacuated again. The case is under investigation.',
      ),
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['bomb', 'crisis'],
};

const sender: IncidentTemplate = {
  id: 'crisis_mall_sender',
  category: 'major',
  code: 'SUUR',
  title: T('Pommiähvardus: saatja tuvastamine', 'Bomb threat: tracing the sender'),
  priority: 2,
  weight: 0,
  places: ['mall'],
  units: { need: [u('criminal')], ideal: [u('criminal'), u('patrol')] },
  onScene: [40, 90],
  persons: [
    { role: 'suspect', gender: 'any', age: [16, 45], record: 0.2 },
    { role: 'caller', gender: 'any', age: [30, 60], relation: 'employee' },
  ],
  summary: [
    T(
      '{place}, {address}. Pommiähvardus saadeti keskuse üldmeilile välismaiselt aadressilt. Uurija peab kirja ja kaamerasalvestised kindlustama ning saatja tuvastama.',
      '{place}, {address}. The bomb threat was sent to the centre’s general e-mail address from a foreign address. An investigator must secure the e-mail and the CCTV footage and trace the sender.',
    ),
    T(
      '{place}, {address}. Sama ähvarduskiri jõudis ka mitme keskuses tegutseva kaupluse postkasti. Kriminaalpolitsei peab välja selgitama, kes selle saatis.',
      '{place}, {address}. The same threatening e-mail also reached the inboxes of several shops in the centre. The criminal police must find out who sent it.',
    ),
  ],
  callerLines: [
    T(
      'Ma olen keskuse juhataja. Kiri tuli meie üldaadressile: majas olevat pomm, mis plahvatab tunni aja pärast.',
      'I am the centre manager. The e-mail came to our general address: it says there is a bomb in the building that will go off within an hour.',
    ),
    T(
      'Kiri on kirjutatud vigases eesti keeles ja all on mingi hüüdnimi. Ma ei kustutanud midagi.',
      'The e-mail is written in poor Estonian and signed with some nickname. I have not deleted anything.',
    ),
  ],
  details: [
    T(
      'Ähvarduskiri saadeti anonüümse välismaise e-posti teenuse kaudu.',
      'The threatening e-mail was sent through an anonymous foreign e-mail service.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: oleme keskuse turvaruumis, ähvarduskiri ja kaamerasalvestised on kindlustatud.',
        '{callsign}: we are in the centre’s security room; the threatening e-mail and the CCTV footage are secured.',
      ),
    ]),
    qPerson('suspect', 15, {
      radio: [
        T(
          '{callsign}: kirja saatmiseks kasutatud internetiühendus on registreeritud isikule {name}, isikukood {idcode}. Palun kontrolli.',
          '{callsign}: the internet connection used to send the e-mail is registered to {name}, ID code {idcode}. Please check.',
        ),
        T(
          'Juhtimiskeskus, {callsign}. Ähvarduse saatja võib olla {name}, isikukood {idcode}. Kas on varem karistatud või tagaotsitav?',
          'Control, {callsign}. The sender of the threat may be {name}, ID code {idcode}. Any previous convictions or warrants?',
        ),
      ],
    }),
    choice(
      25,
      [
        T(
          '{callsign}: isik on praegu kodus. Kas teeme kohe kiireloomulise läbiotsimise või ootame kohtu luba?',
          '{callsign}: the person is at home now. Do we carry out an urgent search right away or wait for the court’s permission?',
        ),
      ],
      [
        opt(
          'search',
          T('Otsige kohe läbi', 'Search it now'),
          T(
            '{callsign}, prokurör kiitis kiireloomulise läbiotsimise heaks, minge kohe.',
            '{callsign}, the prosecutor has approved an urgent search; go now.',
          ),
          { success: 0.15, time: 15 },
        ),
        opt(
          'wait',
          T('Oodake kohtu luba', 'Wait for the court’s permission'),
          T(
            '{callsign}, jälgige elukohta, läbiotsimine tehakse pärast kohtu luba.',
            '{callsign}, keep watch on the address; the search will be done once the court gives permission.',
          ),
          { success: -0.05 },
        ),
      ],
      'search',
    ),
  ],
  outcomes: [
    out(
      'caught',
      'arrest',
      [0.5, 1],
      4,
      T(
        'Ähvarduse saatja tuvastati ja peeti kinni. Kahtlustatava arvutist leiti saadetud kiri ja alustati kriminaalmenetlust.',
        'The sender of the threat was identified and detained. The e-mail was found on the suspect’s computer and criminal proceedings were opened.',
      ),
      { arrests: 1 },
    ),
    out(
      'grudge',
      'arrest',
      [0.55, 1],
      2,
      T(
        'Kirja saatis keskusest hiljuti vallandatud töötaja, kes tahtis endisele tööandjale kätte maksta. Kahtlustatav peeti kinni.',
        'A worker recently dismissed by the centre sent the e-mail, wanting revenge on the former employer. The suspect was detained.',
      ),
      { arrests: 1 },
    ),
    out(
      'partial',
      'report',
      [0.25, 0.6],
      3,
      T(
        'Saatja tuvastati, kuid enne läbiotsimist jõudis ta osa andmeid kustutada. Kriminaalmenetlus jätkub.',
        'The sender was identified but managed to delete some of the data before the search. The criminal proceedings continue.',
      ),
    ),
    out(
      'unknown',
      'escaped',
      [0, 0.3],
      2,
      T(
        'Saatjat ei õnnestunud tuvastada, sest kiri saadeti välismaise teenuse kaudu. Menetlus jätkub.',
        'The sender could not be identified, as the e-mail came through a foreign service. The proceedings continue.',
      ),
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['bomb', 'crisis'],
};

const panic: IncidentTemplate = {
  id: 'crisis_mall_panic',
  category: 'major',
  code: 'SUUR',
  title: T('Pommiähvardus: tunglemine väljapääsul', 'Bomb threat: crush at an exit'),
  priority: 1,
  weight: 0,
  places: ['mall'],
  units: { need: [u('patrol')], ideal: [u('patrol', 2)] },
  onScene: [20, 50],
  persons: [
    { role: 'victim', gender: 'F', age: [62, 88] },
    { role: 'witness', gender: 'any', age: [20, 60], relation: 'employee' },
  ],
  agencies: [
    {
      agency: 'kiirabi',
      chance: 1,
      reason: T('Tunglemises kukkus inimene kokku', 'Someone collapsed in the crush'),
    },
  ],
  summary: [
    T(
      '{address}. Piiramata väljapääsu ees seisab rahvamass ja hoonest väljujad ei pääse edasi. Tunglemises kukkus eakas naine kokku.',
      '{address}. A crowd is standing outside an exit with no cordon and the people coming out of the building cannot get through. An elderly woman has collapsed in the crush.',
    ),
    T(
      '{address}. Keskuse peaukse juures on tunglemine: ühed tahavad välja, teised tagasi sisse. Üks inimene on maas.',
      '{address}. There is a crush at the main door of the centre: some want to get out, others back in. One person is on the ground.',
    ),
  ],
  callerLines: [
    T(
      'Siin surutakse ukse juures, üks vanem naine kukkus ja inimesed astuvad temast üle!',
      'People are pushing at the door, an older woman fell and people are stepping over her!',
    ),
    T(
      'Ma olen keskuse turvatöötaja. Uste ees on nii palju rahvast, et väljujad ei saa liikuda. Meil on vaja abi!',
      'I am a security guard at the centre. There are so many people outside the doors that those coming out cannot move. We need help!',
    ),
  ],
  details: [
    T(
      'Kokku kukkunud naine on teadvusel, kuid ei saa ise püsti tõusta.',
      'The woman who collapsed is conscious but cannot get up by herself.',
    ),
  ],
  beats: [
    agency(
      'kiirabi',
      [
        T(
          '{callsign}: naine on maas ja hingab raskelt, kinnitage kiirabi!',
          '{callsign}: the woman is on the ground and struggling to breathe, confirm the ambulance!',
        ),
      ],
      { timeoutMin: 3 },
    ),
    choice(
      4,
      [
        T(
          '{callsign}: rahvas surub ühe ukse poole, kõrval on kaks suletud avariiust. Kas laseme turvatöötajatel need avada?',
          '{callsign}: the crowd is pressing towards one door and there are two closed emergency doors next to it. Do we have the security staff open them?',
        ),
      ],
      [
        opt(
          'open',
          T('Avage avariiuksed', 'Open the emergency doors'),
          T(
            '{callsign}, avariiuksed lahti, suunake rahvas laiali ja hoidke naise ümber ruumi.',
            '{callsign}, open the emergency doors, spread the crowd out and keep space round the woman.',
          ),
          { success: 0.15 },
        ),
        opt(
          'hold',
          T('Peatage väljumine', 'Stop the outflow'),
          T(
            '{callsign}, peatage väljumine selle ukse juures, kuni rahvas on hajunud.',
            '{callsign}, stop people coming out through that door until the crowd has dispersed.',
          ),
          { success: -0.1, risk: 0.05 },
        ),
      ],
      'open',
    ),
  ],
  outcomes: [
    out(
      'eased',
      'hospital',
      [0.5, 1],
      4,
      T(
        'Avariiuksed avati ja rahvas hajus. Kokku kukkunud naine viidi haiglasse, tema elu ei ole ohus.',
        'The emergency doors were opened and the crowd dispersed. The woman who collapsed was taken to hospital; her life is not in danger.',
      ),
      { injuries: 1 },
    ),
    out(
      'hurt',
      'hospital',
      [0.2, 0.6],
      3,
      T(
        'Tunglemises sai viga veel mitu inimest, kolm neist viidi haiglasse.',
        'Several more people were hurt in the crush, and three of them were taken to hospital.',
      ),
      { injuries: 3 },
    ),
    out(
      'critical',
      'hospital',
      [0, 0.25],
      2,
      T(
        'Naine elustati kohapeal ja viidi raskes seisundis haiglasse. Tunglemise asjaolusid uuritakse.',
        'The woman was resuscitated on the spot, then taken to hospital in a serious condition. The circumstances of the crush are under investigation.',
      ),
      { injuries: 2 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crowd', 'crisis'],
};

const jam: IncidentTemplate = {
  id: 'crisis_mall_jam',
  category: 'major',
  code: 'SUUR',
  title: T('Pommiähvardus: ummik peatab demineerijad', 'Bomb threat: gridlock holds up bomb disposal'),
  priority: 2,
  weight: 0,
  places: ['mall'],
  units: { need: [u('patrol')], ideal: [u('traffic'), u('patrol')] },
  onScene: [20, 50],
  persons: [{ role: 'driver', gender: 'any', age: [20, 70] }],
  summary: [
    T(
      '{address}. Keskuse ümbruse tänavad on täiesti umbes ja demineerijate auto seisab ummikus. Neile on vaja teed teha.',
      '{address}. The streets round the centre are completely gridlocked and the bomb disposal vehicle is stuck in the queue. A way must be cleared for it.',
    ),
    T(
      '{address}. Reguleerimata ristmikul seisavad autod risti-rästi ja ükski suund ei liigu. Demineerijad ei pääse keskuse juurde.',
      '{address}. At a junction with nobody directing traffic, cars are standing every which way and nothing moves in any direction. Bomb disposal cannot get to the centre.',
    ),
  ],
  callerLines: [
    T(
      'Seisan keset ristmikku ja autod on igast küljest ümber. Tagant tuleb vilkuritega päästeameti auto, aga ma ei saa kuhugi minna!',
      'I am stuck in the middle of the junction with cars all round me. A Rescue Board vehicle is coming up behind with its lights on, but I cannot go anywhere!',
    ),
    T(
      'Ristmikul pole kedagi ja kõik sõidavad, kuidas tahavad. Siin on juba pool tundi täielik seisak.',
      'There is nobody at the junction and everyone drives however they like. It has been at a complete standstill here for half an hour.',
    ),
  ],
  details: [
    T(
      'Demineerijate auto on ristmikust umbes kilomeetri kaugusel ja vajab saatjat.',
      'The bomb disposal vehicle is about a kilometre from the junction and needs an escort.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: oleme ristmikul ja teeme demineerijatele koridori.',
        '{callsign}: at the junction, clearing a corridor for bomb disposal.',
      ),
    ]),
    choice(
      5,
      [
        T(
          '{callsign}: demineerijate auto seisab ummiku sabas. Kas toome nad vastassuunavööndist läbi või suuname ümbersõidule?',
          '{callsign}: the bomb disposal vehicle is at the tail of the queue. Do we bring it through on the wrong side of the road or send it on a detour?',
        ),
      ],
      [
        opt(
          'escort',
          T('Tooge vilkuritega läbi', 'Escort it through on blue lights'),
          T(
            '{callsign}, sõitke ees ja tooge demineerijad vastassuunavööndist läbi.',
            '{callsign}, drive ahead and bring bomb disposal through on the wrong side of the road.',
          ),
          { success: 0.15, risk: 0.03 },
        ),
        opt(
          'detour',
          T('Suunake ümbersõidule', 'Send it on the detour'),
          T(
            '{callsign}, suunake demineerijad ümbersõidule, see võtab kauem aega.',
            '{callsign}, send bomb disposal round the detour; it will take longer.',
          ),
          { success: -0.05, time: 10 },
        ),
      ],
      'escort',
    ),
  ],
  outcomes: [
    out(
      'through',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Demineerijad saadeti ummikust läbi. Nad jõudsid keskuse juurde mõne minutiga.',
        'Bomb disposal were escorted through the jam. They reached the centre within minutes.',
      ),
    ),
    out(
      'late',
      'resolved',
      [0.2, 0.6],
      3,
      T(
        'Demineerijad jõudsid kohale veerand tundi hiljem, mistõttu hoone kontroll lükkus edasi.',
        'Bomb disposal arrived a quarter of an hour late, which held up the building search.',
      ),
    ),
    out(
      'stuck',
      'report',
      [0, 0.25],
      2,
      T(
        'Demineerijad jõudsid kohale alles tunni pärast, sest ummikus põrkasid kokku kaks autot. Kokkupõrke asjus alustati menetlust.',
        'Bomb disposal arrived only an hour later because two cars collided in the jam. Proceedings were opened over the collision.',
      ),
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

export const MALL: CrisisScenario = {
  id: 'mall',
  title: T('Kaubanduskeskuse evakueerimine', 'Shopping centre evacuation'),
  places: ['mall'],
  // While the centres are open and full of people.
  hours: [10, 21],
  briefing: T(
    '{place}, {address}. Keskuse üldmeilile saabus pommiähvardus: kirja järgi on hoonesse paigutatud lõhkekeha, mis plahvatab tunni aja jooksul. Keskuses on tuhandeid külastajaid, turvatöötajad alustasid evakueerimist ja trepi juurest leiti omanikuta kott. Häirekeskus kuulutas välja suurõnnetuse: inimesed tuleb välja juhtida, hoone ja parkla piirata, ristmikel liiklust juhtida ning hoone lõhkeainekoeraga läbi otsida.',
    '{place}, {address}. A bomb threat has arrived at the centre’s general e-mail address: it says a device has been placed in the building and will go off within the hour. There are thousands of visitors inside, the security staff have begun the evacuation and an unattended bag has been found by a staircase. The Emergency Response Centre has declared a major incident: people must be led out, the building and the car park cordoned off, traffic at the junctions directed and the building searched with an explosives dog.',
  ),
  tasks: [
    {
      id: 'evacuation',
      name: T('Külastajate evakueerimine', 'Evacuating the visitors'),
      template: evacuation,
      deadlineMin: 8,
    },
    {
      id: 'cordon',
      name: T('Hoone ja parkla piiramine', 'Cordoning off the building and car park'),
      template: cordon,
      deadlineMin: 10,
      offsetKm: [0.15, 0.35],
      followUp: 'panic',
    },
    {
      id: 'traffic',
      name: T('Ristmikud ja parkla väljasõidud', 'Junctions and car park exits'),
      template: traffic,
      deadlineMin: 15,
      offsetKm: [0.4, 0.9],
      followUp: 'jam',
    },
    {
      id: 'search',
      name: T('Hoone läbiotsimine koeraga', 'Searching the building with a dog'),
      template: search,
      atMin: 10,
      deadlineMin: 12,
    },
    {
      id: 'sender',
      name: T('Ähvarduse saatja tuvastamine', 'Tracing the sender'),
      template: sender,
      atMin: 20,
      deadlineMin: 30,
    },
  ],
  followUps: [
    {
      id: 'panic',
      name: T('Tunglemine väljapääsul', 'Crush at an exit'),
      template: panic,
      deadlineMin: 8,
      offsetKm: [0.05, 0.15],
    },
    {
      id: 'jam',
      name: T('Ummik peatab demineerijad', 'Gridlock holds up bomb disposal'),
      template: jam,
      deadlineMin: 10,
      offsetKm: [0.6, 1.5],
    },
  ],
  decisions: [
    {
      id: 'scope',
      title: T('Evakueerimise ulatus', 'Scope of the evacuation'),
      question: T(
        'Ähvarduskirjas on nimetatud keskuse üks tiib. Kas evakueerime kogu keskuse või ainult selle tiiva?',
        'The threat names one wing of the centre. Do we evacuate the whole centre or only that wing?',
      ),
      options: [
        {
          id: 'whole',
          label: T('Kogu keskus', 'The whole centre'),
          effect: T(
            'Kogu keskus evakueeritakse ja parkla suletakse. Väljujaid on rohkem ja ristmikud täituvad kiiremini.',
            'The whole centre is evacuated and the car park closed. More people are coming out and the junctions will fill up faster.',
          ),
          success: 0.05,
          deadline: 0.9,
        },
        {
          id: 'wing',
          label: T('Ainult see tiib', 'Only that wing'),
          effect: T(
            'Evakueeritakse ainult ähvarduses nimetatud tiib, ülejäänud keskus jääb avatuks.',
            'Only the wing named in the threat is evacuated; the rest of the centre stays open.',
          ),
          success: -0.1,
          deadline: 1.2,
        },
      ],
      defaultOption: 'whole',
      atMin: 3,
    },
    {
      id: 'help',
      title: T('Naabrite abi', 'Help from the neighbours'),
      question: T(
        'Evakueerimine seob suure osa ekipaažidest. Kas palume naaberüksustelt abi, kui mõni ülesanne jääb ekipaažita?',
        'The evacuation ties up a large share of the crews. Do we ask the neighbouring units for help if a task is left without a crew?',
      ),
      options: [
        {
          id: 'ask',
          label: T('Palu abi', 'Ask for help'),
          effect: T(
            'Naaberüksused hoiavad ekipaaže valmis, kui mõni ülesanne jääb ootama.',
            'The neighbouring units keep crews ready in case a task is left waiting.',
          ),
          help: true,
        },
        {
          id: 'alone',
          label: T('Saame ise hakkama', 'We manage ourselves'),
          effect: T(
            'Abi ei küsita, kõik ülesanded jäävad oma ekipaažidele.',
            'No help is asked for; every task stays with our own crews.',
          ),
        },
      ],
      defaultOption: 'ask',
      atMin: 6,
    },
  ],
  radio: {
    outbreak: T(
      'Suurõnnetus! {place}, {address}: kaubanduskeskusele saabus pommiähvardus ja hoone evakueeritakse. Politseid on vaja evakueerimisele, piiramisele ja liikluse juhtimisele.',
      'Major incident! {place}, {address}: the shopping centre has received a bomb threat and the building is being evacuated. Police are needed for the evacuation, the cordon and traffic control.',
    ),
    escalate: T(
      'Pommiähvarduse ülesanne on endiselt ekipaažita, olukord keskuse juures halveneb.',
      'A bomb threat task still has no crew and the situation at the centre is getting worse.',
    ),
    end: T(
      '{place}, {address}: hoone on kontrollitud ja suurõnnetuse tööd on lõpetatud. Aitäh kõigile.',
      '{place}, {address}: the building has been checked and the work at the major incident is finished. Thank you, everyone.',
    ),
  },
};
