/**
 * Metsapõleng (2.37.0, docs/CRISIS.md): a forest fire driven by the wind towards the houses, the smoke over the
 * roads, people who will not leave, mushroom pickers caught in the burning forest, empty homes and a suspicion of
 * arson. The owner's drawing: src/ui/game/crisis/crisis-forest.webp.
 *
 * Tasks: the evacuation and the road closures (at once), the mushroom pickers in the fire zone, the suspected arson
 * and the guarding of the evacuated homes (later). Road closures that wait too long bring a collision in the smoke;
 * an evacuation that waits, the wind turning on more houses.
 */
import type { CrisisScenario } from '@/sim/crisis';
import type { IncidentTemplate } from '@/sim/types';
import { T, agency, choice, info, opt, out, qVehicle, search, u } from '../incidents/_helpers_c';

const evacuation: IncidentTemplate = {
  id: 'crisis_forest_evacuation',
  category: 'major',
  code: 'SUUR',
  title: T('Metsapõleng: majade evakueerimine', 'Forest fire: evacuating the houses'),
  priority: 1,
  weight: 0,
  places: ['village', 'summerhouse'],
  units: { need: [u('patrol', 2)], ideal: [u('patrol', 3), u('community')] },
  onScene: [40, 90],
  persons: [
    { role: 'victim', gender: 'M', age: [81, 93] },
    { role: 'caller', gender: 'any', age: [30, 70], relation: 'neighbour' },
  ],
  agencies: [
    {
      agency: 'paaste',
      chance: 1,
      reason: T(
        'Tuli läheneb majadele, päästjad peavad hooneid kaitsma',
        'The fire is nearing the houses and the rescuers must protect the buildings',
      ),
    },
    {
      agency: 'kov',
      chance: 1,
      reason: T('Evakueeritutele on vaja evakuatsioonikeskust', 'The evacuees need an evacuation centre'),
    },
  ],
  summary: [
    T(
      '{address}. Tuul ajab metsapõlengut elamute poole, tulerinne on lähimatest majadest mõnesaja meetri kaugusel. Elanikud tuleb kohe evakueerida.',
      '{address}. The wind is driving the forest fire towards the homes and the fire front is a few hundred metres from the nearest houses. The residents must be evacuated at once.',
    ),
    T(
      '{address}. Suits katab elamuid ja metsa servas on tuld näha. Päästeamet palub politseil elanikud ohualalt välja viia.',
      '{address}. Smoke covers the homes and flames can be seen at the edge of the forest. The Rescue Board asks the police to get the residents out of the danger zone.',
    ),
  ],
  callerLines: [
    T(
      'Tuli on juba meie maja taga metsas ja suits tuleb tuppa! Kuhu me minema peame?',
      'The fire is already in the forest behind our house and the smoke is coming indoors! Where do we have to go?',
    ),
    T(
      'Mu naaber on üle kaheksakümne ja ütleb, et ei lähe kuhugi. Saatke keegi, kes ta ära toob!',
      'My neighbour is over eighty and says he is not going anywhere. Send someone to get him out!',
    ),
  ],
  details: [
    T(
      'Päästjad hoiavad tuld majadest eemal, kuid tuul võib selle iga hetk üle tee kanda.',
      'The rescuers are holding the fire back from the houses, but the wind could carry it across the road at any moment.',
    ),
    T(
      'Mõni elanik ei taha kodust lahkuda ja kastab maja aiavoolikuga.',
      'Some residents do not want to leave home and are hosing down their houses.',
    ),
  ],
  beats: [
    agency(
      'paaste',
      [
        T(
          '{callsign}: tuli on majadest paarisaja meetri kaugusel, päästjaid on siia kohe vaja!',
          '{callsign}: the fire is a couple of hundred metres from the houses, we need firefighters here now!',
        ),
      ],
      { timeoutMin: 3 },
    ),
    agency(
      'kov',
      [
        T(
          '{callsign}: evakueeritavaid on palju, omavalitsus peab avama evakuatsioonikeskuse!',
          '{callsign}: there are a lot of evacuees, the municipality must open an evacuation centre!',
        ),
      ],
      { at: 2, timeoutMin: 5 },
    ),
    choice(
      8,
      [
        T(
          '{callsign}: mitu elanikku keeldub lahkumast, nad tahavad maju aiavoolikuga kasta. Kas lubame neil jääda?',
          '{callsign}: several residents refuse to leave; they want to hose down their houses. Do we let them stay?',
        ),
      ],
      [
        opt(
          'out',
          T('Kõik lahkuvad', 'Everyone leaves'),
          T(
            '{callsign}, kõik lahkuvad kohe, vajadusel viige nad välja. Maju kaitsevad päästjad.',
            '{callsign}, everyone leaves now; bring them out if you have to. The rescuers will protect the houses.',
          ),
          { success: 0.15, time: 5 },
        ),
        opt(
          'stay',
          T('Lubage jääda', 'Let them stay'),
          T(
            '{callsign}, pange nimed kirja ja hoiatage, et keegi neile enam järele ei tule.',
            '{callsign}, take their names and warn them that nobody will come back for them.',
          ),
          { success: -0.1, risk: 0.05 },
        ),
      ],
      'out',
    ),
    info(20, [
      T(
        '{callsign}: majad on läbi käidud, viimased elanikud on teel evakuatsioonikeskusesse.',
        '{callsign}: the houses have been checked and the last residents are on their way to the evacuation centre.',
      ),
    ]),
  ],
  outcomes: [
    out(
      'evacuated',
      'resolved',
      [0.55, 1],
      4,
      T(
        'Kõik elanikud viidi õigel ajal ohutusse, evakuatsioonikeskuses on kirjas {n}0 inimest. Ükski maja ei põlenud.',
        'Every resident was brought to safety in time; {n}0 people are registered at the evacuation centre. None of the houses burned.',
      ),
    ),
    out(
      'outbuildings',
      'resolved',
      [0.3, 0.7],
      3,
      T(
        'Kaks kõrvalhoonet põles metsa servas maha, kuid elanikud evakueeriti õigel ajal ja keegi viga ei saanud.',
        'Two outbuildings at the edge of the forest burned down, but the residents were evacuated in time and nobody was hurt.',
      ),
    ),
    out(
      'smoke',
      'hospital',
      [0.15, 0.45],
      2,
      T(
        'Evakueerimine venis ja kolm elanikku said suitsumürgituse. Tuli hävitas metsa servas kaks maja.',
        'The evacuation dragged on and three residents suffered smoke inhalation. The fire destroyed two houses at the edge of the forest.',
      ),
      { injuries: 3 },
    ),
    out(
      'fatal',
      'tragedy',
      [0, 0.25],
      2,
      T(
        'Üks eakas elanik hukkus, tuli jõudis majadeni enne evakueerimist. Surma asjaolude selgitamiseks alustati kriminaalmenetlust.',
        'An elderly resident died, as the fire reached the houses before the evacuation. Criminal proceedings were opened to establish the circumstances of the death.',
      ),
      { injuries: 3 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['fire', 'crisis'],
};

const roads: IncidentTemplate = {
  id: 'crisis_forest_roads',
  category: 'major',
  code: 'SUUR',
  title: T('Metsapõleng: teede sulgemine', 'Forest fire: closing the roads'),
  priority: 2,
  weight: 0,
  places: ['highway'],
  units: { need: [u('traffic')], ideal: [u('traffic'), u('patrol')] },
  onScene: [30, 70],
  persons: [{ role: 'caller', gender: 'M', age: [35, 60] }],
  summary: [
    T(
      '{address}. Põlengualale viivad teed tuleb sulgeda, tuletõrjeautod vajavad vaba koridori. Suits on juba üle tee.',
      '{address}. The roads into the fire area must be closed and the fire engines need a clear corridor. Smoke is already drifting across the road.',
    ),
    T(
      '{address}. Uudishimulikud ja elanikud, kes tahavad oma asjadele järele minna, sõidavad põlengu poole ja jäävad paakautodele ette. Tee tuleb sulgeda.',
      '{address}. Onlookers and residents who want to go back for their belongings are driving towards the fire and getting in the way of the water tenders. The road must be closed.',
    ),
  ],
  callerLines: [
    T(
      'Autod sõidavad otse suitsu sisse ja keegi ei peata neid. Tuletõrjeauto ei pääse mööda!',
      'Cars are driving straight into the smoke and nobody is stopping them. The fire engine cannot get past!',
    ),
    T(
      'Mu ema on veel kodus seal metsa taga, ma pean talle järele sõitma! Miks keegi ei ütle, kas tee on lahti?',
      'My mother is still at home behind that forest, I have to drive in and fetch her! Why does nobody say whether the road is open?',
    ),
  ],
  details: [
    T(
      'Päästeameti paakautod sõidavad veevõtukoha ja põlengu vahet, tee peab jääma neile vabaks.',
      'The Rescue Board’s water tenders are shuttling between the water point and the fire, so the road must stay clear for them.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: tõkked on üleval, tuletõrjeautode koridor on vaba.',
        '{callsign}: the roadblocks are up and the corridor for the fire engines is clear.',
      ),
    ]),
    choice(
      8,
      [
        T(
          '{callsign}: tõkke juures on mees, kelle ema on veel kodus põlengu lähedal. Ta tahab ise talle järele sõita. Kas laseme ta läbi?',
          '{callsign}: there is a man at the roadblock whose mother is still at home near the fire. He wants to drive in and fetch her himself. Do we let him through?',
        ),
      ],
      [
        opt(
          'fetch',
          T('Ei, ema toob patrull', 'No, a patrol fetches her'),
          T(
            '{callsign}, mees jääb tõkke taha, ema aadressi anname evakueerivale patrullile.',
            '{callsign}, the man stays behind the roadblock; we pass his mother’s address to the evacuating patrol.',
          ),
          { success: 0.1 },
        ),
        opt(
          'pass',
          T('Laske läbi', 'Let him through'),
          T(
            '{callsign}, laske ta läbi, aga hoiatage, et tagasi tuleb tulla kohe.',
            '{callsign}, let him through, but warn him to come straight back.',
          ),
          { success: -0.1, risk: 0.05 },
        ),
      ],
      'fetch',
    ),
  ],
  outcomes: [
    out(
      'closed',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Teed suleti ja päästekoridor püsis vaba. Liiklus suunati ümber kõrvalteedele.',
        'The roads were closed and the emergency corridor stayed clear. Traffic was diverted to the side roads.',
      ),
    ),
    out(
      'late',
      'resolved',
      [0.25, 0.6],
      3,
      T(
        'Tee suleti hilja, mitu autot jõudis suitsu sisse. Paakautod pääsesid siiski läbi.',
        'The road was closed late; several cars drove into the smoke. The water tenders still got through.',
      ),
    ),
    out(
      'blocked',
      'report',
      [0, 0.3],
      2,
      T(
        'Paakauto jäi pooleks tunniks kinni, uudishimulike autod ummistasid tee. Mitmele juhile koostati protokoll.',
        'A water tender was stuck for half an hour; onlookers’ cars blocked the road. Reports were filed against several drivers.',
      ),
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['fire', 'crisis'],
};

const missing: IncidentTemplate = {
  id: 'crisis_forest_missing',
  category: 'major',
  code: 'SUUR',
  title: T('Metsapõleng: seenelised põlengualal', 'Forest fire: mushroom pickers in the fire zone'),
  priority: 2,
  weight: 0,
  places: ['forest'],
  units: { need: [u('patrol')], ideal: [u('patrol'), u('k9'), u('heli')] },
  onScene: [30, 80],
  persons: [
    { role: 'missing', gender: 'M', age: [66, 84] },
    { role: 'caller', gender: 'F', age: [64, 82], relation: 'partner', known: true },
  ],
  agencies: [
    {
      agency: 'kiirabi',
      chance: 0.7,
      reason: T(
        'Kadunud võivad olla suitsumürgitusega',
        'The missing pair may be suffering from smoke inhalation',
      ),
    },
  ],
  summary: [
    T(
      '{address}. Eakas paar jäi seenel olles põlengualale. Naine helistas, et suits on igal pool ja nad ei leia teed välja.',
      '{address}. An elderly couple out picking mushrooms are caught in the fire zone. The woman called to say there is smoke everywhere and they cannot find the way out.',
    ),
    T(
      '{address}. Kaks seenelist on põleva metsa sees, nende auto seisab metsateel. Mees köhib ega jaksa enam käia, telefoni aku saab tühjaks.',
      '{address}. Two mushroom pickers are inside the burning forest and their car is on the forest road. The man is coughing and can hardly walk, and the phone battery is running out.',
    ),
  ],
  callerLines: [
    T(
      'Me oleme metsas ja igal pool on suits, ma ei näe enam rada. Mu mees köhib kogu aeg ega jaksa käia.',
      'We are in the forest and there is smoke everywhere, I cannot see the path any more. My husband keeps coughing and can hardly walk.',
    ),
    T(
      'Me läksime seenele ja nüüd on tuli kuskil lähedal, ma kuulen, kuidas see praksub. Tulge meile järele!',
      'We went mushroom picking and now the fire is somewhere close, I can hear it crackling. Come and get us!',
    ),
  ],
  details: [
    T(
      'Mobiilioperaator andis telefoni asukoha umbes kahe kilomeetri täpsusega.',
      'The mobile operator gave the phone’s location to within about two kilometres.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: kadunute auto seisab metsateel, edasi on paks suits.',
        '{callsign}: the missing couple’s car is on the forest road; beyond it the smoke is thick.',
      ),
    ]),
    choice(
      'arrive',
      [
        T(
          '{callsign}: päästjate sõnul jõuab tulerinne otsingualale umbes poole tunni pärast. Kas läheme kohe jalgsi metsa või ootame kopterit?',
          '{callsign}: the rescuers say the fire front will reach the search area in about half an hour. Do we go into the forest on foot now or wait for the helicopter?',
        ),
      ],
      [
        opt(
          'now',
          T('Minge kohe', 'Go in now'),
          T(
            '{callsign}, minge koos päästjatega, hoidke tuulepoolset serva ja olge pidevalt ühenduses.',
            '{callsign}, go in with the rescuers, keep to the windward side and stay in contact.',
          ),
          { success: 0.15, risk: 0.05 },
        ),
        opt(
          'wait',
          T('Oodake kopterit', 'Wait for the helicopter'),
          T(
            '{callsign}, jääge metsatee otsa, kopter otsib õhust.',
            '{callsign}, stay at the end of the forest road; the helicopter will search from the air.',
          ),
          { success: -0.05, time: 15 },
        ),
      ],
      'now',
    ),
    search('arrive', 2, [
      T(
        '{callsign}: otsingud algasid auto juurest, raadius kaks kilomeetrit. Hüüame ja kasutame sireeni.',
        '{callsign}: the search has started from the car, a two-kilometre radius. We are shouting and using the siren.',
      ),
    ]),
  ],
  outcomes: [
    out(
      'found',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Mõlemad leiti metsasihilt ja toodi õigel ajal välja. Kiirabi vaatas nad üle, haiglasse polnud vaja minna.',
        'Both were found in time on a forest ride. The ambulance crew checked them over and neither needed hospital.',
      ),
    ),
    out(
      'smoke',
      'hospital',
      [0.25, 0.6],
      3,
      T(
        'Mõlemad leiti suitsu seest, mees viidi suitsumürgitusega haiglasse.',
        'Both were found in the smoke; the man was taken to hospital with smoke inhalation.',
      ),
      { injuries: 1 },
    ),
    out(
      'ongoing',
      'report',
      [0, 0.3],
      2,
      T(
        'Kadunuid põlengualalt ei leitud. Otsingud jätkuvad, kui päästjad ala avavad.',
        'Neither was found in the fire zone. The search will resume when the rescuers open the area.',
      ),
    ),
    out(
      'fatal',
      'tragedy',
      [0, 0.2],
      1,
      T(
        'Mees leiti põlenud metsast surnuna, naine viidi raskes seisundis haiglasse.',
        'The man was found dead in the burnt forest; the woman was taken to hospital in a serious condition.',
      ),
      { injuries: 1 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['fire', 'crisis'],
};

const cause: IncidentTemplate = {
  id: 'crisis_forest_cause',
  category: 'major',
  code: 'SUUR',
  title: T('Metsapõleng: süütamise kahtlus', 'Forest fire: suspected arson'),
  priority: 3,
  weight: 0,
  places: ['forest'],
  units: { need: [u('criminal')], ideal: [u('criminal'), u('patrol')] },
  onScene: [40, 90],
  persons: [
    { role: 'witness', gender: 'any', age: [25, 75] },
    { role: 'suspect', gender: 'M', age: [18, 45], record: 0.3, intoxicated: 0.15 },
  ],
  vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
  summary: [
    T(
      '{address}. Tunnistaja nägi, kuidas metsa servas peatunud autost tuli keegi välja ja varsti tõusis sealt suits. Kahtlustatakse süütamist.',
      '{address}. A witness saw someone get out of a car that had stopped at the edge of the forest, and soon afterwards smoke rose from there. Arson is suspected.',
    ),
    T(
      '{address}. Põleng algas korraga mitmest kohast metsatee ääres, kahtlustatakse süütamist. Vaja on uurijat: jäljed tuleb fikseerida ja tunnistajaid küsitleda.',
      '{address}. The fire started in several places along the forest road at once and arson is suspected. An investigator is needed to record the traces and question the witnesses.',
    ),
  ],
  callerLines: [
    T(
      'Ma nägin, kuidas üks auto peatus metsa ääres ja kohe pärast seda tõusis sealt suits. Panin numbri kirja.',
      'I saw a car stop at the edge of the forest and right after that smoke rose from there. I wrote down the number.',
    ),
    T(
      'Mingi auto kihutas tuledeta metsa äärest minema ja kohe oli seal suits. Ma olin oma aias ja nägin kõike.',
      'A car sped away from the edge of the forest with no lights on, and straight away there was smoke. I was in my garden and saw everything.',
    ),
  ],
  details: [
    T(
      'Päästeameti tuleuurija leidis tekkekohast kergestisüttiva vedeliku lõhna ja kaks eraldi põlengukollet.',
      'The Rescue Board’s fire investigator found a smell of flammable liquid and two separate seats of fire at the point of origin.',
    ),
  ],
  beats: [
    qVehicle('arrive', {
      radio: [
        T(
          '{callsign}: tunnistaja pani kirja auto numbri, {plate}, {car}. Palun kontrolli, kellele see kuulub.',
          '{callsign}: a witness wrote down the car’s plate, {plate}, {car}. Please check who it belongs to.',
        ),
      ],
    }),
    choice(
      15,
      [
        T(
          '{callsign}: auto omanik on kodus ja auto pagasiruumist tuleb bensiini lõhna. Kas peame ta kinni?',
          '{callsign}: the car’s owner is at home and there is a smell of petrol from the boot. Do we detain him?',
        ),
      ],
      [
        opt(
          'detain',
          T('Pidage kinni', 'Detain him'),
          T(
            '{callsign}, pidage ta kahtlustatavana kinni ja vaadake auto läbi.',
            '{callsign}, detain him as a suspect and search the car.',
          ),
          { success: 0.15, time: 15 },
        ),
        opt(
          'question',
          T('Küsitlege kohapeal', 'Question him there'),
          T(
            '{callsign}, küsitlege teda kohapeal ja pange ütlused kirja, kinni ei pea.',
            '{callsign}, question him there and take a statement; no detention.',
          ),
          { success: -0.05 },
        ),
      ],
      'detain',
    ),
  ],
  outcomes: [
    out(
      'arrest',
      'arrest',
      [0.55, 1],
      4,
      T(
        'Süütamises kahtlustatav peeti kinni, tema autost leiti bensiinikanister. Alustati kriminaalmenetlust.',
        'An arson suspect was detained; a petrol canister was found in his car. Criminal proceedings were opened.',
      ),
      { arrests: 1 },
    ),
    out(
      'evidence',
      'report',
      [0.25, 0.6],
      3,
      T(
        'Tunnistajaid küsitleti ja tekkekoht fikseeriti, süütamise asjas alustati kriminaalmenetlust. Kahtlustatavat veel ei ole.',
        'The witnesses were questioned and the point of origin recorded; criminal proceedings for arson were opened. There is no suspect yet.',
      ),
    ),
    out(
      'lost',
      'unfounded',
      [0, 0.25],
      2,
      T(
        'Jäljed hävisid kustutustöödel ja põlengu põhjus jäi selgusetuks.',
        'The traces were lost in the firefighting; the cause of the fire remains unclear.',
      ),
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['arson', 'crisis'],
};

const property: IncidentTemplate = {
  id: 'crisis_forest_property',
  category: 'major',
  code: 'SUUR',
  title: T('Metsapõleng: evakueeritud kodude valve', 'Forest fire: guarding the evacuated homes'),
  priority: 3,
  weight: 0,
  places: ['village', 'summerhouse'],
  units: { need: [u('patrol')], ideal: [u('patrol'), u('aux', 2)] },
  onScene: [40, 90],
  persons: [
    { role: 'suspect', gender: 'M', age: [20, 55], record: 0.4 },
    { role: 'caller', gender: 'any', age: [35, 75] },
  ],
  vehicles: [{ role: 'suspect', kind: 'van', driverRole: 'suspect' }],
  summary: [
    T(
      '{address}. Evakueeritud majade vahel sõidab aeglaselt võõras kaubik, elanikud kardavad vargusi. Tühjad kodud vajavad valvet.',
      '{address}. A strange van is driving slowly between the evacuated houses and the residents fear burglaries. The empty homes need guarding.',
    ),
    T(
      '{address}. Majaomanik näeb valvekaamerast, et tema evakueeritud kodu õuel liigub võõras. Piirkonda on vaja patrulli.',
      '{address}. A homeowner can see on a security camera that a stranger is moving about the yard of their evacuated home. A patrol is needed in the area.',
    ),
  ],
  callerLines: [
    T(
      'Meid saadeti kodust minema ja nüüd näen kaamerast, et keegi on mu õuel! Kes seal valvab?',
      'We were sent away from home and now I can see on the camera that someone is in my yard! Who is guarding the place?',
    ),
    T(
      'Seal sõidab {car}, juba teist korda majade vahelt läbi, ja tuled ei põle.',
      'There is a {car} driving between the houses, the second time already, with its lights off.',
    ),
  ],
  details: [
    T(
      'Omavalitsuse andmetel on evakueeritud majad tühjad, osa uksi jäi kiirustades lukustamata.',
      'According to the municipality the evacuated houses are empty, and some doors were left unlocked in the rush.',
    ),
  ],
  beats: [
    info('arrive', [
      T(
        '{callsign}: oleme kohal, sõidame majad läbi ja kontrollime uksi.',
        '{callsign}: on scene, driving round the houses and checking the doors.',
      ),
    ]),
    qVehicle(6, {
      radio: [
        T(
          '{callsign}: peatasime tühjade majade vahel kaubiku {plate}, {car}. Juht ütleb, et tuli sugulase asjadele järele. Kontrolli palun.',
          '{callsign}: we have stopped a van between the empty houses, {plate}, {car}. The driver says he came to fetch a relative’s things. Please check it.',
        ),
      ],
    }),
    choice(
      12,
      [
        T(
          '{callsign}: kaubikus on tööriistad, teler ja kaks mootorsaagi, juht ei suuda tõendada, et need on sugulase omad. Kas peame ta kinni?',
          '{callsign}: there are tools, a TV and two chainsaws in the van, and the driver cannot show they belong to his relative. Do we detain him?',
        ),
      ],
      [
        opt(
          'detain',
          T('Pidage kinni', 'Detain him'),
          T(
            '{callsign}, pidage ta varguses kahtlustatavana kinni, asjad võtame hoiule.',
            '{callsign}, detain him on suspicion of theft; we take the items into safekeeping.',
          ),
          { success: 0.15, time: 10 },
        ),
        opt(
          'release',
          T('Pange andmed kirja', 'Take his details'),
          T(
            '{callsign}, pange andmed kirja ja laske ta minna, asjad jäävad kaubikusse.',
            '{callsign}, take his details and let him go; the items stay in the van.',
          ),
          { success: -0.1, trust: -1 },
        ),
      ],
      'detain',
    ),
  ],
  outcomes: [
    out(
      'caught',
      'arrest',
      [0.5, 1],
      4,
      T(
        'Evakueeritud majadest varastanud mees peeti kinni, varastatud asjad tagastati omanikele.',
        'A man stealing from the evacuated houses was detained; the stolen goods were returned to their owners.',
      ),
      { arrests: 1 },
    ),
    out(
      'quiet',
      'resolved',
      [0.5, 1],
      2,
      T(
        'Evakueeritud kodud olid valve all, vargusi ei olnud. Kaubiku juhi jutt leidis kinnitust, asjad kuulusid tema sugulasele.',
        'The evacuated homes stayed under guard and nothing was stolen. The van driver’s story checked out: the things belonged to his relative.',
      ),
    ),
    out(
      'burgled',
      'report',
      [0.2, 0.6],
      3,
      T(
        'Kahest evakueeritud majast varastati asju enne patrulli saabumist. Alustati kriminaalmenetlust.',
        'Things were stolen from two evacuated houses before the patrol arrived. Criminal proceedings were opened.',
      ),
    ),
    out(
      'looted',
      'escaped',
      [0, 0.25],
      2,
      T(
        'Mitu tühja kodu tühjendati ja vargad pääsesid. Elanikud kaebavad, et nende vara jäeti valveta.',
        'Several empty homes were cleared out; the thieves got away. The residents complain that their property was left unguarded.',
      ),
      { trust: -2 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['crisis'],
};

const smoke: IncidentTemplate = {
  id: 'crisis_forest_smoke',
  category: 'major',
  code: 'SUUR',
  title: T('Metsapõleng: kokkupõrge suitsus', 'Forest fire: collision in the smoke'),
  priority: 2,
  weight: 0,
  places: ['highway'],
  units: { need: [u('traffic')], ideal: [u('traffic'), u('patrol')] },
  onScene: [30, 60],
  persons: [
    { role: 'driver', gender: 'any', age: [20, 70], intoxicated: 0.05 },
    { role: 'victim', gender: 'any', age: [18, 80] },
  ],
  vehicles: [{ role: 'involved', kind: 'car', driverRole: 'driver' }],
  agencies: [
    {
      agency: 'kiirabi',
      chance: 0.7,
      reason: T('Kokkupõrkes sai keegi viga', 'Someone was hurt in the collision'),
    },
  ],
  summary: [
    T(
      '{address}. Metsapõlengu suits on teel nii paks, et nähtavus on alla 50 meetri. Kaks autot põrkasid kokku.',
      '{address}. The smoke from the forest fire is so thick on the road that visibility is under 50 metres. Two cars have collided.',
    ),
    T(
      '{address}. Suitsus sõitis sõiduauto pidurdanud veokile tagant otsa. Autod sõidavad ikka täie kiirusega suitsu sisse.',
      '{address}. In the smoke a car ran into the back of a braking lorry. Cars are still driving into the smoke at full speed.',
    ),
  ],
  callerLines: [
    T(
      'Siin ei näe mitte midagi, suits on üle tee! Üks auto sõitis mulle tagant sisse.',
      'You cannot see a thing here, the smoke is right across the road! A car ran into the back of me.',
    ),
    T(
      'Autod tulevad suitsust välja ja pidurdavad viimasel hetkel. Keegi peab selle tee kinni panema!',
      'Cars come out of the smoke and brake at the last moment. Someone has to close this road!',
    ),
  ],
  details: [
    T(
      'Päästeameti hinnangul suits lähima tunni jooksul ei hõrene, tee tuleb mõlemal pool suitsuala sulgeda.',
      'The Rescue Board does not expect the smoke to thin within the next hour, so the road must be closed on both sides of it.',
    ),
  ],
  beats: [
    agency(
      'kiirabi',
      [
        T(
          '{callsign}: ühel juhil on peavigastus, palun kiirabi.',
          '{callsign}: one driver has a head injury, ambulance please.',
        ),
      ],
      { chance: 0.7, timeoutMin: 5 },
    ),
    qVehicle('arrive', { chance: 0.5 }),
    choice(
      5,
      [
        T(
          '{callsign}: suits läheb aina paksemaks. Kas sulgeme tee täielikult või juhime autod aeglaselt ühes reas läbi?',
          '{callsign}: the smoke is getting thicker. Do we close the road completely or lead the cars through slowly in single file?',
        ),
      ],
      [
        opt(
          'close',
          T('Sulgege tee', 'Close the road'),
          T(
            '{callsign}, sulgege tee mõlemal pool suitsuala, liiklus suunatakse ümber.',
            '{callsign}, close the road on both sides of the smoke; traffic is diverted.',
          ),
          { success: 0.1 },
        ),
        opt(
          'convoy',
          T('Juhtige läbi', 'Lead them through'),
          T(
            '{callsign}, juhtige autod aeglaselt ükshaaval läbi, ohutuled põlema.',
            '{callsign}, lead the cars through slowly one at a time, hazard lights on.',
          ),
          { success: -0.05, risk: 0.05 },
        ),
      ],
      'close',
    ),
  ],
  outcomes: [
    out(
      'cleared',
      'resolved',
      [0.5, 1],
      4,
      T(
        'Tee suleti suitsuala ees, autod teisaldati ja uusi kokkupõrkeid ei tulnud.',
        'The road was closed ahead of the smoke, the cars were moved and there were no more collisions.',
      ),
    ),
    out(
      'slow',
      'report',
      [0.2, 0.6],
      3,
      T(
        'Kokkupõrge vormistati, kuid tee suleti hilja ja suitsus põrkas kokku veel kaks autot.',
        'The collision was recorded, but the road was closed late and two more cars crashed in the smoke.',
      ),
    ),
    out(
      'hurt',
      'hospital',
      [0, 0.25],
      2,
      T(
        'Suitsus põrkas kokku mitu autot, kaks inimest viidi haiglasse.',
        'Several cars crashed in the smoke; two people were taken to hospital.',
      ),
      { injuries: 2 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['fire', 'crisis'],
};

const second: IncidentTemplate = {
  id: 'crisis_forest_second',
  category: 'major',
  code: 'SUUR',
  title: T('Metsapõleng: tuul pööras, uus evakueerimine', 'Forest fire: the wind turned, a new evacuation'),
  priority: 1,
  weight: 0,
  places: ['village', 'summerhouse'],
  units: { need: [u('patrol', 2)], ideal: [u('patrol', 2), u('aux', 2)] },
  onScene: [40, 90],
  persons: [
    { role: 'victim', gender: 'F', age: [78, 96] },
    { role: 'caller', gender: 'any', age: [45, 70], relation: 'family' },
  ],
  agencies: [
    {
      agency: 'kov',
      chance: 1,
      reason: T(
        'Uutele evakueeritutele on vaja transporti ja majutust',
        'The new evacuees need transport and shelter',
      ),
    },
  ],
  summary: [
    T(
      '{address}. Tuul pööras ja metsapõleng liigub nüüd majade poole, mida varem ohustatuks ei peetud. Elanikud tuleb kiiresti välja viia.',
      '{address}. The wind has turned and the forest fire is now moving towards houses that were not thought to be in danger before. The residents must be brought out quickly.',
    ),
    T(
      '{address}. Tulerinne muutis suunda ja suits on juba õuedes. Elanikud ei ole lahkumiseks valmis ja mitmel pole autot.',
      '{address}. The fire front has changed direction and the smoke is already in the yards. The residents are not ready to leave and several have no car.',
    ),
  ],
  callerLines: [
    T(
      'Alles öeldi, et meie majad on ohust väljas, aga nüüd on suits õues ja metsa taga on tuld näha! Kuhu me minema peame?',
      'They have only just said our houses were out of danger, but now there is smoke in the yard and flames behind the forest! Where do we have to go?',
    ),
    T(
      'Mu ema on voodihaige ja meil pole autot. Kes ta siit ära viib?',
      'My mother is bedridden and we have no car. Who is going to take her away from here?',
    ),
  ],
  details: [
    T(
      'Omavalitsuse andmetel elab piirkonnas mitu liikumisraskustega inimest.',
      'According to the municipality several people with limited mobility live in the area.',
    ),
  ],
  beats: [
    agency(
      'kov',
      [
        T(
          '{callsign}: mitmel elanikul pole autot, omavalitsus peab kohe bussi saatma!',
          '{callsign}: several residents have no car, the municipality must send a bus right away!',
        ),
      ],
      { timeoutMin: 5 },
    ),
    choice(
      6,
      [
        T(
          '{callsign}: ühes majas on voodihaige eakas naine, kiirabi jõuab alles poole tunni pärast. Kas viime ta ise ära?',
          '{callsign}: there is a bedridden elderly woman in one of the houses and the ambulance is half an hour away. Do we take her out ourselves?',
        ),
      ],
      [
        opt(
          'carry',
          T('Viige ise ära', 'Take her yourselves'),
          T(
            '{callsign}, kandke ta autosse ja viige evakuatsioonikeskusesse, kiirabi vaatab ta seal üle.',
            '{callsign}, carry her to the car and take her to the evacuation centre; the ambulance crew will check her there.',
          ),
          { success: 0.15, time: 5 },
        ),
        opt(
          'wait',
          T('Oodake kiirabi', 'Wait for the ambulance'),
          T(
            '{callsign}, jääge tema juurde ja oodake kiirabi.',
            '{callsign}, stay with her and wait for the ambulance.',
          ),
          { success: -0.05, risk: 0.05 },
        ),
      ],
      'carry',
    ),
    info(15, [
      T(
        '{callsign}: kõik majad on tühjad, buss viib viimased elanikud minema.',
        '{callsign}: every house is empty and the bus is taking the last residents away.',
      ),
    ]),
  ],
  outcomes: [
    out(
      'evacuated',
      'resolved',
      [0.55, 1],
      4,
      T(
        'Ka need majad evakueeriti enne tule jõudmist, omavalitsuse buss viis elanikud evakuatsioonikeskusesse.',
        'These houses were also cleared before the fire came; the municipality’s bus took the residents to the evacuation centre.',
      ),
    ),
    out(
      'close',
      'hospital',
      [0.25, 0.65],
      3,
      T(
        'Elanikud viidi välja viimasel hetkel, kaks inimest said suitsumürgituse. Tuli hävitas kaks kõrvalhoonet.',
        'The residents were brought out at the last moment; two people suffered smoke inhalation. The fire destroyed two outbuildings.',
      ),
      { injuries: 2 },
    ),
    out(
      'late',
      'hospital',
      [0, 0.3],
      2,
      T(
        'Evakueerimine jäi hiljaks, tuli hävitas kolm maja. Voodihaige naine viidi raskes seisundis haiglasse.',
        'The evacuation came too late; the fire destroyed three houses. The bedridden woman was taken to hospital in a serious condition.',
      ),
      { injuries: 3 },
    ),
  ],
  expiresMin: 240,
  interactiveChance: 0,
  tags: ['fire', 'crisis'],
};

export const FOREST: CrisisScenario = {
  id: 'forest',
  title: T('Metsapõleng', 'Forest fire'),
  places: ['forest', 'village', 'summerhouse'],
  months: [4, 5, 6, 7, 8, 9],
  briefing: T(
    '{address}. Tugev tuul ajab metsapõlengut elamute poole, metsa kohal seisab suitsusein ja teed on suitsu all. Päästeamet kustutab mitmes kohas, kuid tuli levib kiiresti. Häirekeskus kuulutas välja suurõnnetuse: lähimad majad tuleb evakueerida, teed põlengualale sulgeda ja tuletõrjeautodele vaba koridor tagada.',
    '{address}. A strong wind is driving a forest fire towards the homes; a wall of smoke stands over the forest and the roads are under smoke. The Rescue Board is fighting it in several places, but the fire is spreading fast. The Emergency Response Centre has declared a major incident: the nearest houses must be evacuated, the roads into the fire area closed and a clear corridor kept for the fire engines.',
  ),
  tasks: [
    {
      id: 'evacuation',
      name: T('Majade evakueerimine', 'Evacuating the houses'),
      template: evacuation,
      deadlineMin: 10,
      followUp: 'second',
    },
    {
      id: 'roads',
      name: T('Teede sulgemine', 'Closing the roads'),
      template: roads,
      deadlineMin: 12,
      offsetKm: [1.5, 3],
      followUp: 'smoke',
    },
    {
      id: 'missing',
      name: T('Seenelised põlengualal', 'Mushroom pickers in the fire zone'),
      template: missing,
      atMin: 10,
      deadlineMin: 15,
      offsetKm: [1, 2],
    },
    {
      id: 'cause',
      name: T('Süütamise kahtlus', 'Suspected arson'),
      template: cause,
      atMin: 30,
      deadlineMin: 30,
      offsetKm: [0.5, 1.5],
    },
    {
      id: 'property',
      name: T('Evakueeritud kodude valve', 'Guarding the evacuated homes'),
      template: property,
      atMin: 40,
      deadlineMin: 30,
      offsetKm: [0.2, 0.6],
    },
  ],
  followUps: [
    {
      id: 'smoke',
      name: T('Kokkupõrge suitsus', 'Collision in the smoke'),
      template: smoke,
      deadlineMin: 10,
      offsetKm: [2, 4],
    },
    {
      id: 'second',
      name: T('Tuul pööras: uus evakueerimine', 'The wind turned: a new evacuation'),
      template: second,
      deadlineMin: 10,
      offsetKm: [2.5, 4.5],
    },
  ],
  decisions: [
    {
      id: 'zone',
      title: T('Evakuatsiooniala', 'Evacuation zone'),
      question: T(
        'Kas evakueerime kohe kõik kolme kilomeetri raadiuses või ainult tule teel olevad majad?',
        'Do we evacuate everyone within three kilometres now, or only the houses in the fire’s path?',
      ),
      options: [
        {
          id: 'wide',
          label: T('Kõik 3 km raadiuses', 'Everyone within 3 km'),
          effect: T(
            'Evakueeritakse kõik kolme kilomeetri raadiuses, omavalitsus avab evakuatsioonikeskuse.',
            'Everyone within three kilometres is being evacuated and the municipality is opening an evacuation centre.',
          ),
          success: 0.05,
          deadline: 1.2,
        },
        {
          id: 'path',
          label: T('Ainult tule teel', 'Only in the fire’s path'),
          effect: T(
            'Evakueeritakse ainult tule teel olevad majad, teised elanikud on lahkumiseks valmis.',
            'Only the houses in the fire’s path are being evacuated; the other residents stand ready to leave.',
          ),
          success: -0.05,
          deadline: 0.85,
        },
      ],
      defaultOption: 'wide',
      atMin: 3,
    },
    {
      id: 'help',
      title: T('Lisajõud', 'Reinforcements'),
      question: T(
        'Kas kutsume appi naaberüksused ja Kaitseliidu vabatahtlikud, kui mõni ülesanne jääb ekipaažita?',
        'Do we call in the neighbouring units and the Defence League volunteers if a task is left without a crew?',
      ),
      options: [
        {
          id: 'ask',
          label: T('Kutsu appi', 'Call them in'),
          effect: T(
            'Naaberüksused ja Kaitseliidu vabatahtlikud on valmis appi tulema, kui mõni ülesanne jääb ootama.',
            'The neighbouring units and the Defence League volunteers stand ready to help if a task is left waiting.',
          ),
          help: true,
        },
        {
          id: 'alone',
          label: T('Saame ise hakkama', 'We manage ourselves'),
          effect: T(
            'Abi ei kutsuta: kõik ülesanded jäävad meile.',
            'No help is called in: every task stays with us.',
          ),
        },
      ],
      defaultOption: 'ask',
      atMin: 6,
    },
  ],
  radio: {
    outbreak: T(
      'Suurõnnetus! {address}: tuul ajab metsapõlengut elamute poole. Päästeamet kustutab, politseid on vaja evakueerimiseks ja teede sulgemiseks.',
      'Major incident! {address}: the wind is driving a forest fire towards the homes. The Rescue Board is fighting it; the police are needed to evacuate and to close the roads.',
    ),
    escalate: T(
      'Metsapõlengu ülesanne on endiselt ekipaažita, tuli läheneb.',
      'A forest fire task still has no crew and the fire is closing in.',
    ),
    end: T(
      '{address}: politsei tööd metsapõlengul on lõpetatud, päästjad jätkavad kustutamist. Aitäh kõigile.',
      '{address}: the police work at the forest fire is finished and the rescuers carry on putting it out. Thank you, everyone.',
    ),
  },
};
