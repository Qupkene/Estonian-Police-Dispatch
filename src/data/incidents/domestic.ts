// Lähisuhte- ja perevägivald (LSV): partnerid, endised partnerid, lapsed, eakad vanemad.
import type { IncidentTemplate, Text } from '@/sim/types';
import {
  T,
  agency,
  backup,
  choice,
  k9Choice,
  kiirabi,
  info,
  oc,
  opt,
  qPerson,
  search,
  toArrest,
  toSober,
  un,
} from './_helpers_a';

/** Shared decision: what to do with a calmed-down aggressor (KorS § 44 viibimiskeeld up to 72 h since 17.04.2026). */
const aggressorChoice = (at: number, radio: Text[]) =>
  choice(
    at,
    radio,
    [
      opt(
        'detain',
        T('Pidage kinni kahtlustatavana', 'Detain as a suspect'),
        T(
          '{callsign}, juhtimine. Pidage kinni ja toimetage arestimajja.',
          '{callsign}, Control. Detain and take him to the detention house.',
        ),
        {
          success: 0.1,
          arrests: 1,
          time: 25,
        },
      ),
      opt(
        'ban',
        T('Viibimiskeeld kuni 72 h', 'Removal order up to 72 h'),
        T(
          '{callsign}, juhtimine. Kohaldage viibimiskeeld, isik peab kodust lahkuma.',
          '{callsign}, Control. Issue a removal order, he must leave the home.',
        ),
        {
          success: 0.1,
          trust: 1,
          time: 15,
        },
      ),
      opt(
        'leave',
        T('Vestlus, jätke koju', 'Talk, leave him at home'),
        T(
          '{callsign}, juhtimine. Selgitage tagajärgi ja lõpetage sündmus.',
          '{callsign}, Control. Explain the consequences and close the event.',
        ),
        {
          success: -0.2,
          trust: -3,
        },
      ),
    ],
    'ban',
  );

/** Locked door, screams inside. */
const doorChoice = (at: number | 'arrive') =>
  choice(
    at,
    [
      T(
        '{callsign}: uks on lukus, seest kostab karjeid. Kas murrame ukse maha?',
        '{callsign}: the door is locked and we can hear screaming. Do we break it down?',
      ),
      T(
        'Juhtimine, {callsign}. Keegi ei ava, sees karjutakse. Kas siseneme jõuga?',
        'Control, {callsign}. Nobody answers, someone is screaming inside. Do we force entry?',
      ),
    ],
    [
      opt(
        'force',
        T('Murdke uks, oht elule', 'Force the door, danger to life'),
        T(
          '{callsign}, juhtimine. Sisenege, alus on olemas.',
          '{callsign}, Control. Go in, you have grounds.',
        ),
        { success: 0.15, risk: 0.05 },
      ),
      opt(
        'knock',
        T('Koputage edasi, oodake', 'Keep knocking, wait'),
        T(
          '{callsign}, juhtimine. Proovige veel ust avada lasta.',
          '{callsign}, Control. Keep trying to get them to open up.',
        ),
        { time: 8, success: -0.1 },
      ),
    ],
    'knock',
    { timeoutMin: 3 },
  );

export const TEMPLATES_DOMESTIC: IncidentTemplate[] = [
  // ─── Legacy ───────────────────────────────────────────────────────────────
  {
    id: 'domestic_violence',
    category: 'domestic',
    code: 'LSV',
    title: T('Koduvägivald', 'Domestic violence'),
    priority: 2,
    weight: 1.6,
    hours: 'evening',
    weekendBoost: 1.4,
    places: ['residential', 'house'],
    units: { need: [un('patrol', 1)], ideal: [un('rapid', 1), un('patrol', 1)] },
    onScene: [40, 90],
    persons: [
      {
        role: 'suspect',
        gender: 'M',
        age: [25, 55],
        relation: 'partner',
        known: true,
        intoxicated: 0.7,
        record: 0.45,
        restraining: 0.08,
      },
      { role: 'victim', gender: 'F', age: [22, 55], relation: 'partner' },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naabri teatel kostab korterist karjeid ja tugevat kolinat, teataja kahtlustab, et mees lööb oma naist. Vägivald käimas. Relvad teadmata.',
        '{address}. A neighbour reports screams and loud banging from a flat and suspects a man is beating his wife. Violence in progress. Weapons unknown.',
      ),
      T(
        '{address}. Korterist kostab karjumist ja klaasi purunemist, naine hüüab appi. Aadressil on varem olnud LSV-väljakutseid.',
        '{address}. Screaming and breaking glass heard from a flat, a woman is calling for help. Previous domestic violence call-outs at this address.',
      ),
    ],
    callerLines: [
      T(
        'Korteris on kuulda karjeid ja tugevat kolinat, kahtlustan, et mees lööb oma naist.',
        'I can hear screams and loud banging in the flat, I think the man is hitting his wife.',
      ),
      T(
        'Jälle need naabrid... aga täna on teisiti, ta karjub appi ja midagi kukkus kõvasti.',
        'Those neighbours again... but tonight is different, she is screaming for help and something fell hard.',
      ),
    ],
    details: [
      T(
        'Teataja täpsustab: mees on purjus, naisel on varem trepikojas olnud sinikad.',
        'Caller update: the man is drunk; the woman has been seen with bruises in the stairwell before.',
      ),
      T('Korteris on ka kaks väikest last.', 'There are also two small children in the flat.'),
    ],
    agencies: [
      { agency: 'kiirabi', chance: 0.35, reason: T('Kannatanul vigastused', 'Victim injured') },
      { agency: 'sotsiaal', chance: 0.35, reason: T('Korteris on lapsed', 'Children in the flat') },
    ],
    beats: [
      backup(0.15, un('rapid'), {
        radio: [
          T(
            '{callsign}: mees agressiivne, vajame kiiresti lisajõude!',
            '{callsign}: man is aggressive, we need backup fast!',
          ),
        ],
      }),
      doorChoice('arrive'),
      qPerson('suspect', 5, {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Palun kontrolli isikut, isikukood {idcode}. Kas aadressil on kehtiv lähenemiskeeld?',
            'Control, {callsign}. Please check ID code {idcode}. Is there a restraining order for this address?',
          ),
          T(
            '{callsign}: elukaaslane on {name}, isikukood {idcode}. Kontrolli palun varasemaid LSV-sündmusi.',
            '{callsign}: the partner is {name}, ID code {idcode}. Please check previous domestic incidents.',
          ),
        ],
      }),
      toArrest(20, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Vägivallatseja peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi, kannatanut nõustati ohvriabi võimalustest.',
          'The abuser was detained and taken to the detention house. Criminal proceedings opened under KarS § 121; the victim was advised about victim support.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'ban',
        'report',
        [0.4, 0.75],
        3,
        T(
          'Mehele kohaldati 72-tunnine viibimiskeeld ja alustati kriminaalmenetlust. Kannatanu suunati ohvriabisse, juhtum esitati MARAC-võrgustikule.',
          'The man was given a 72-hour removal order and criminal proceedings were opened. The victim was referred to victim support and the case flagged to MARAC.',
        ),
        { trust: 1 },
      ),
      oc(
        'warning',
        'warning',
        [0.2, 0.5],
        2,
        T(
          'Pooled olid rahunenud, füüsilise vägivalla tunnuseid ei tuvastatud. Mõlemaid hoiatati, sündmus registreeriti LSV-na.',
          'The parties had calmed down and no signs of physical violence were found. Both were warned and the event logged as domestic.',
        ),
      ),
      oc(
        'injured',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Naine sai tõsiseid vigastusi ja toimetati haiglasse. Mees põgenes enne patrulli saabumist ja kuulutati tagaotsitavaks.',
          'The woman was seriously hurt and taken to hospital. The man fled before the patrol arrived and is now wanted.',
        ),
        { injuries: 1, trust: -4 },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.3,
      toPriority: 1,
      text: T(
        'Teataja: naine karjub, et mees ähvardab teda noaga.',
        'Caller: the woman is screaming that the man is threatening her with a knife.',
      ),
    },
    interactiveChance: 0.3,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Naaberkorteris peksab mees naist, ta karjub appi!',
          'Next door a man is beating his wife, she is screaming for help!',
        ),
      ],
      openingRu: ['Алло, полиция? Сосед опять бьёт жену, она кричит, помогите!'],
      answers: {
        where: [T('{address}, korter on minu oma kõrval.', '{address}, the flat next to mine.')],
        weapons: [T('Ma ei tea, ma ei näe sisse.', 'I do not know, I cannot see inside.')],
        children: [
          T('Neil on kaks väikest last, ma kuulen nutmist.', 'They have two little kids, I can hear crying.'),
        ],
        intoxicated: [
          T('Mees joob tihti, täna kindlasti ka.', 'The man drinks a lot, definitely tonight too.'),
        ],
        when: [
          T(
            'Algas umbes kümme minutit tagasi ja läheb hullemaks.',
            'It started about ten minutes ago and it is getting worse.',
          ),
        ],
      },
    },
    tags: ['dv', 'alcohol'],
    legacy: true,
  },
  {
    id: 'domestic_fatal',
    category: 'domestic',
    code: 'LSV',
    title: T('Perevägivald lõppes surmaga', 'Domestic violence ended in death'),
    priority: 1,
    weight: 0.003,
    hours: 'night',
    places: ['residential', 'house'],
    units: { need: [un('any', 2)], ideal: [un('patrol', 2), un('criminal', 1)] },
    onScene: [90, 150],
    persons: [
      { role: 'victim', gender: 'F', age: [25, 60], relation: 'partner' },
      {
        role: 'suspect',
        gender: 'M',
        age: [25, 60],
        relation: 'partner',
        known: true,
        record: 0.7,
        restraining: 0.25,
        intoxicated: 0.6,
        wanted: 0.1,
      },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naaber kutsus politsei, kuuldes karjeid. Korterist leiti naine mitme noahaavaga. Mees on sündmuskohalt põgenenud.',
        '{address}. A neighbour called the police after hearing screams. A woman with several stab wounds was found in the flat. The man has fled the scene.',
      ),
      T(
        '{address}. Naine leiti korterist elutuna, elukaaslane on kadunud. Mees võib olla relvastatud noaga.',
        '{address}. A woman was found dead in the flat; her partner is missing. The man may be armed with a knife.',
      ),
    ],
    callerLines: [
      T(
        'Ma kuulsin karjeid ja siis jäi vaikseks... uks oli lahti ja ta lamab põrandal.',
        'I heard screaming and then it went quiet... the door was open and she is lying on the floor.',
      ),
      T(
        'Ta jooksis trepist alla, käed olid verised!',
        'He ran down the stairs, his hands were covered in blood!',
      ),
    ],
    details: [
      T('Põgenenud elukaaslane: {suspect}.', 'The partner who fled: {suspect}.'),
      T(
        'Naabrite sõnul on politsei sel aadressil varemgi käinud.',
        'Neighbours say police have been called to this address before.',
      ),
    ],
    agencies: [
      {
        agency: 'kiirabi',
        chance: 1,
        reason: T('Raskelt vigastatud kannatanu', 'Critically injured victim'),
      },
      { agency: 'sotsiaal', chance: 0.3, reason: T('Peres on lapsi', 'Children in the family') },
    ],
    beats: [
      kiirabi('arrive', {
        radio: [
          T(
            '{callsign}: naine raskelt vigastatud, alustame elustamist! Kiirabi kohe!',
            '{callsign}: woman critically injured, starting CPR! Ambulance now!',
          ),
        ],
      }),
      backup(0.88, un('any', 2), { at: 2 }),
      search(5, 1.5, [
        T(
          '{callsign}: kahtlustatav põgenes jalgsi {direction}, võib olla relvastatud.',
          '{callsign}: suspect fled on foot {direction}, may be armed.',
        ),
      ]),
      qPerson('suspect', 10, {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Elukaaslane on {name}, isikukood {idcode}. Palun kontrolli ja kuuluta tagaotsitavaks.',
            'Control, {callsign}. The partner is {name}, ID code {idcode}. Please check and put out a wanted notice.',
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
          'Kahtlustatav tabati lähistelt, nuga leiti. Alustati kriminaalmenetlust KarS § 114 järgi.',
          'The suspect was caught nearby and the knife recovered. Criminal proceedings opened under KarS § 114.',
        ),
        { arrests: 1, injuries: 1, trust: 3 },
      ),
      oc(
        'wanted',
        'report',
        [0.3, 0.7],
        3,
        T(
          'Kahtlustatav tuvastati ja kuulutati tagaotsitavaks. Sündmuskoht vormistati, lähedastele pakuti kriisiabi.',
          'The suspect was identified and put on the wanted list. The scene was processed and relatives were offered crisis support.',
        ),
        { injuries: 1 },
      ),
      oc(
        'escaped',
        'tragedy',
        [0, 0.4],
        2,
        T(
          'Kannatanu suri. Kahtlustatav jäi tabamata, otsingud jätkuvad üle Eesti.',
          'The victim died. The suspect was not caught and a nationwide search continues.',
        ),
        { injuries: 1, trust: -5 },
      ),
    ],
    tags: ['dv', 'homicide', 'armed', 'weapon_knife', 'bolo'],
    legacy: true,
  },
  {
    id: 'domestic_injured_child',
    category: 'domestic',
    code: 'LSV',
    title: T('Raskelt vigastatud laps kodus', 'Seriously injured child at home'),
    priority: 2,
    weight: 0.015,
    hours: 'flat',
    places: ['residential', 'house'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 1), un('criminal', 1)] },
    onScene: [60, 120],
    persons: [
      { role: 'victim', gender: 'any', age: [1, 6], relation: 'child' },
      {
        role: 'suspect',
        gender: 'M',
        age: [20, 45],
        relation: 'parent',
        known: true,
        record: 0.4,
        intoxicated: 0.4,
      },
      { role: 'witness', gender: 'any', age: [25, 55], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Kiirabi kutsus politsei, kuna väike laps on saanud seletamatuid vigastusi. Kahtlustatakse perevägivalda.',
        '{address}. The ambulance service called police because a small child has unexplained injuries. Domestic abuse is suspected.',
      ),
      T(
        '{address}. Kiirabibrigaadi teatel ei klapi lapse vigastused vanemate seletusega. Laps toimetatakse haiglasse.',
        '{address}. The ambulance crew says the child’s injuries do not match the parents’ explanation. The child is being taken to hospital.',
      ),
    ],
    callerLines: [
      T(
        'Siin kiirabi. Lapse vigastused ei klapi vanemate jutuga, palun saatke politsei.',
        'Ambulance here. The child’s injuries do not match what the parents say, please send police.',
      ),
      T(
        'Isa ütleb, et laps kukkus trepist, aga need jäljed on vanemad ja mitmes kohas.',
        'The father says the child fell down the stairs, but the marks are older and in several places.',
      ),
    ],
    details: [
      T(
        'Isa käitub närviliselt ja nõuab, et kiirabi lahkuks.',
        'The father is agitated and demands that the ambulance leave.',
      ),
      T('Peres on veel üks laps, viieaastane.', 'There is another child in the family, five years old.'),
    ],
    agencies: [
      { agency: 'sotsiaal', chance: 1, reason: T('Lapse ohutuse hindamine', 'Assessing the child’s safety') },
    ],
    beats: [
      backup(0.41, un('patrol'), {
        at: 'arrive',
        radio: [
          T(
            '{callsign}: isa muutub agressiivseks, vajame teist patrulli.',
            '{callsign}: the father is getting aggressive, we need a second patrol.',
          ),
        ],
      }),
      qPerson('suspect', 5),
      agency('sotsiaal', 10, {
        radio: [
          T(
            '{callsign}: palun teavitage kohe lastekaitset, kahtlus lapse väärkohtlemisele.',
            '{callsign}: please notify child protection now, suspected child abuse.',
          ),
        ],
      }),
      choice(
        15,
        [
          T(
            '{callsign}: teine laps on samuti kodus. Kas toimetame lapse lastekaitse kaudu turvalisse kohta?',
            '{callsign}: the other child is at home too. Do we move the child to safety through child protection?',
          ),
        ],
        [
          opt(
            'separate',
            T('Jah, turvalisse kohta', 'Yes, move to safety'),
            T(
              '{callsign}, juhtimine. Ootame lastekaitset, laps eraldatakse.',
              '{callsign}, Control. Wait for child protection; the child will be moved.',
            ),
            { success: 0.1, time: 20 },
          ),
          opt(
            'leave',
            T('Jätke ema juurde', 'Leave with the mother'),
            T(
              '{callsign}, juhtimine. Laps jääb ema juurde, lastekaitse kontrollib homme.',
              '{callsign}, Control. The child stays with the mother; child protection will check tomorrow.',
            ),
            { success: -0.1, trust: -2 },
          ),
        ],
        'separate',
      ),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Kahtlustatav peeti kinni. Alustati kriminaalmenetlust KarS § 121 järgi, lastekaitse paigutas lapsed turvalisse kohta.',
          'The suspect was detained. Criminal proceedings opened under KarS § 121; child protection moved the children to safety.',
        ),
        { arrests: 1, injuries: 1, trust: 3 },
      ),
      oc(
        'report',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Laps toimetati haiglasse uuringuteks, alustati kriminaalmenetlust. Juhtum anti lastekaitsele.',
          'The child was taken to hospital for tests and criminal proceedings were opened. The case was handed to child protection.',
        ),
        { injuries: 1 },
      ),
      oc(
        'unclear',
        'report',
        [0, 0.4],
        2,
        T(
          'Vanemad keeldusid koostööst ja vigastuste päritolu jäi esialgu selgusetuks. Lastekaitset teavitati, menetlus jätkub.',
          'The parents refused to cooperate and the cause of the injuries remains unclear for now. Child protection was notified; the case continues.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    tags: ['dv', 'children'],
    legacy: true,
  },

  // ─── Everyday domestic call-outs ──────────────────────────────────────────
  {
    id: 'domestic_partner_assault',
    category: 'domestic',
    code: 'LSV',
    title: T('Lähisuhtevägivald: elukaaslane lõi', 'Domestic violence: partner assault'),
    priority: 2,
    weight: 1.4,
    hours: 'evening',
    weekendBoost: 1.4,
    places: ['residential', 'house'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 2)] },
    onScene: [45, 90],
    persons: [
      { role: 'victim', gender: 'F', age: [20, 55], relation: 'partner' },
      {
        role: 'suspect',
        gender: 'M',
        age: [22, 60],
        relation: 'partner',
        known: true,
        intoxicated: 0.75,
        record: 0.5,
        restraining: 0.1,
        weapon: 0.03,
      },
    ],
    summary: [
      T(
        '{address}. Naine teatab, et elukaaslane lõi teda rusikaga näkku ja ähvardab tappa. Naine lukustas end vannituppa. Mees joobes.',
        '{address}. A woman reports her partner punched her in the face and is threatening to kill her. She has locked herself in the bathroom. The man is drunk.',
      ),
      T(
        '{address}. Ohver helistab sosinal: mees lõhub korteris asju ja lõi teda. Kodus on kaks last.',
        '{address}. The victim is calling in a whisper: the man is smashing things in the flat and hit her. Two children at home.',
      ),
    ],
    callerLines: [
      T(
        '(sosinal) Ta lõi mind... ma olen vannitoas, ta peksab ust.',
        '(whispering) He hit me... I am in the bathroom, he is pounding on the door.',
      ),
      T(
        'Mu mees on purjus ja läks endast välja. Palun tulge, ma kardan, et ta teeb lastele ka midagi.',
        'My husband is drunk and lost it. Please come, I am afraid he will hurt the kids too.',
      ),
    ],
    details: [
      T(
        'Mees: {suspect}. Aadressil on 12 kuu jooksul olnud mitu LSV-väljakutset.',
        'The man: {suspect}. Several domestic call-outs at this address in the last 12 months.',
      ),
      T('Naisel on ninaverejooks, ta on teadvusel.', 'The woman has a nosebleed and is conscious.'),
    ],
    agencies: [
      { agency: 'kiirabi', chance: 0.4, reason: T('Näovigastus', 'Facial injury') },
      {
        agency: 'sotsiaal',
        chance: 0.4,
        reason: T('Lapsed vägivalla tunnistajad', 'Children witnessed violence'),
      },
    ],
    beats: [
      qPerson('suspect', 'arrive', {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Palun kontrolli {name}, isikukood {idcode}. Kas on kehtiv lähenemiskeeld või varasemaid LSV-sündmusi?',
            'Control, {callsign}. Please check {name}, ID code {idcode}. Any restraining order or previous domestic incidents?',
          ),
        ],
      }),
      kiirabi(3, {
        chance: 0.4,
        radio: [
          T(
            '{callsign}: naisel näovigastus, palun kiirabi.',
            '{callsign}: the woman has a facial injury, request an ambulance.',
          ),
        ],
      }),
      aggressorChoice(10, [
        T(
          '{callsign}: mees on rahunenud ja lubab "hommikuni magada". Naine kardab. Kuidas toimime?',
          '{callsign}: the man has calmed down and promises to "sleep it off". The woman is afraid. How do we proceed?',
        ),
      ]),
      toArrest(15, { chance: 0.5 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Mees peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi, täideti riskihindamise küsimustik.',
          'The man was detained and taken to the detention house. Criminal proceedings opened under KarS § 121 and a risk assessment questionnaire was completed.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'ban',
        'report',
        [0.4, 0.75],
        3,
        T(
          'Mehele kohaldati viibimiskeeld ja ta lahkus kodust. Alustati kriminaalmenetlust, naine ja lapsed suunati ohvriabisse.',
          'The man was given a removal order and left the home. Criminal proceedings opened; the woman and children were referred to victim support.',
        ),
        { trust: 1 },
      ),
      oc(
        'fled',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees lahkus enne patrulli saabumist. Naine toimetati EMO-sse, mees kuulutati tagaotsitavaks.',
          'The man left before the patrol arrived. The woman was taken to A&E and the man is now wanted.',
        ),
        { injuries: 1, trust: -3 },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.25,
      toPriority: 1,
      text: T(
        'Häirekeskus: kõne katkes, viimati oli kuulda ukse murdmist.',
        'Emergency centre: the call dropped; the last thing heard was the door being broken.',
      ),
    },
    interactiveChance: 0.35,
    call: {
      mood: 'whisper',
      opening: [
        T(
          '(sosinal) Palun... mu mees lõi mind. Ma olen vannitoas.',
          '(whispering) Please... my husband hit me. I am in the bathroom.',
        ),
      ],
      openingRu: ['(шёпотом) Он меня ударил... я закрылась в ванной, он ломает дверь.'],
      answers: {
        injured: [T('Nina veritseb, silm on paistes.', 'My nose is bleeding, my eye is swollen.')],
        weapons: [T('Ma ei tea... köögis on noad.', 'I do not know... there are knives in the kitchen.')],
        children: [
          T(
            'Lapsed magavad oma toas, neli ja seitse aastat.',
            'The kids are asleep in their room, four and seven.',
          ),
        ],
        safe: [T('Uks on lukus, aga ta peksab seda.', 'The door is locked, but he is hitting it.')],
        intoxicated: [T('Ta on joonud terve õhtu.', 'He has been drinking all evening.')],
      },
    },
    tags: ['dv', 'alcohol'],
  },
  {
    id: 'domestic_verbal_dispute',
    category: 'domestic',
    code: 'LSV',
    title: T('Perekonflikt', 'Family argument'),
    priority: 3,
    weight: 1.5,
    hours: 'evening',
    weekendBoost: 1.3,
    places: ['residential', 'house'],
    units: { need: [un('patrol', 1)] },
    onScene: [25, 50],
    persons: [
      {
        role: 'suspect',
        gender: 'M',
        age: [25, 65],
        relation: 'partner',
        known: true,
        intoxicated: 0.5,
        record: 0.25,
      },
      { role: 'victim', gender: 'F', age: [25, 65], relation: 'partner' },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naabri teatel käib korteris juba tund aega vali tüli, kostab sõimu. Füüsilisest vägivallast pole teada.',
        '{address}. A neighbour reports a loud argument in a flat for an hour, lots of swearing. No known physical violence.',
      ),
      T(
        '{address}. Abielupaar tülitseb rõdul valjult, naaber kardab, et olukord läheb käest ära.',
        '{address}. A married couple is arguing loudly on the balcony; a neighbour fears it will get out of hand.',
      ),
    ],
    callerLines: [
      T(
        'Nad karjuvad juba tund aega teineteise peale. Ma ei tea, kas seal juhtub midagi.',
        'They have been shouting at each other for an hour. I do not know if something is happening in there.',
      ),
      T(
        'Nad tülitsevad iga nädal, aga täna on eriti vali.',
        'They argue every week, but tonight it is especially loud.',
      ),
    ],
    details: [
      T('Mõlemad osapooled on alkoholijoobes.', 'Both parties are intoxicated.'),
      T('Korteris on ka teismeline poeg.', 'A teenage son is also in the flat.'),
    ],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.7 }),
      choice(
        8,
        [
          T(
            '{callsign}: füüsilist vägivalda pole, kuid pooled ei rahune. Kuidas jätkame?',
            '{callsign}: no physical violence, but they will not calm down. How do we proceed?',
          ),
        ],
        [
          opt(
            'friend',
            T('Mees ööbib mujal', 'The man sleeps elsewhere'),
            T(
              '{callsign}, juhtimine. Leppige kokku, et mees ööbib täna sugulaste juures.',
              '{callsign}, Control. Agree that the man stays with relatives tonight.',
            ),
            { success: 0.05, trust: 1, time: 15 },
          ),
          opt(
            'ban',
            T('Viibimiskeeld', 'Removal order'),
            T(
              '{callsign}, juhtimine. Kohaldage viibimiskeeld.',
              '{callsign}, Control. Issue a removal order.',
            ),
            { success: 0.05, time: 20 },
          ),
          opt(
            'talk',
            T('Vestlus ja lõpetamine', 'Talk and close'),
            T(
              '{callsign}, juhtimine. Selgitage ja lõpetage sündmus.',
              '{callsign}, Control. Explain and close the event.',
            ),
            { time: -5 },
          ),
        ],
        'talk',
      ),
    ],
    outcomes: [
      oc(
        'calm',
        'resolved',
        [0.5, 1],
        3,
        T(
          'Pooled rahunesid, füüsilise vägivalla tunnuseid ei tuvastatud. Sündmus registreeriti, pooltele selgitati abivõimalusi.',
          'The parties calmed down and no signs of physical violence were found. The event was logged and both were told where to get help.',
        ),
      ),
      oc(
        'warning',
        'warning',
        [0.25, 0.65],
        2,
        T(
          'Mõlemaid hoiatati. Mees läks ööseks sugulaste juurde.',
          'Both were warned. The man went to stay with relatives for the night.',
        ),
      ),
      oc(
        'pushed',
        'report',
        [0, 0.4],
        2,
        T(
          'Selgus, et mees oli naist tõuganud. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'It turned out the man had shoved the woman. Criminal proceedings opened under KarS § 121.',
        ),
        { trust: -1 },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.3,
      toPriority: 2,
      text: T(
        'Teataja: tüli muutus füüsiliseks, kostab löömist ja naise karjeid.',
        'Caller: the argument has turned physical, sounds of hitting and a woman screaming.',
      ),
    },
    falseAlarmChance: 0.1,
    interactiveChance: 0.15,
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Naabrid tülitsevad juba tükk aega, äkki keegi võiks üle vaadata.',
          'Hello. The neighbours have been arguing for a long time, maybe someone could check.',
        ),
      ],
      openingRu: ['Здравствуйте. Соседи уже час ругаются, кричат, может кто-нибудь приедет проверить.'],
      answers: {
        what: [T('Ainult karjumine, löömist ma ei kuule.', 'Only shouting, I do not hear any hitting.')],
        children: [T('Neil on teismeline poeg.', 'They have a teenage son.')],
        intoxicated: [
          T(
            'Ilmselt on joonud, nagu tavaliselt reedeti.',
            'They have probably been drinking, as usual on Fridays.',
          ),
        ],
      },
    },
    tags: ['dv'],
  },
  {
    id: 'domestic_restraining_breach',
    category: 'domestic',
    code: 'LSV',
    title: T('Lähenemiskeelu rikkumine', 'Restraining order breach'),
    priority: 2,
    weight: 0.4,
    hours: 'evening',
    places: ['residential', 'house', 'street'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 2)] },
    onScene: [30, 70],
    persons: [
      {
        role: 'suspect',
        gender: 'M',
        age: [25, 55],
        relation: 'ex_partner',
        known: true,
        restraining: 0.9,
        record: 0.7,
        intoxicated: 0.4,
      },
      { role: 'victim', gender: 'F', age: [22, 55], relation: 'ex_partner' },
    ],
    summary: [
      T(
        '{address}. Naine teatab, et endine elukaaslane, kellele kohus on määranud lähenemiskeelu, seisab ukse taga ja nõuab sisselaskmist.',
        '{address}. A woman reports that her ex-partner, who is under a court restraining order, is standing outside her door demanding to be let in.',
      ),
      T(
        '{address}. Lähenemiskeelu all olev mees jälitab endist elukaaslast, praegu ootab ta maja ees.',
        '{address}. A man under a restraining order is following his ex-partner and is now waiting outside her building.',
      ),
    ],
    callerLines: [
      T(
        'Tal on lähenemiskeeld, aga ta on jälle siin! Ta peksab ust ja karjub.',
        'He has a restraining order but he is here again! He is banging on the door and shouting.',
      ),
      T(
        'Ma nägin teda aknast, ta ootab mind trepikoja ees.',
        'I saw him from the window, he is waiting for me outside the stairwell.',
      ),
    ],
    details: [
      T(
        'Mees: {suspect}. Lähenemiskeeld kehtib veel mitu kuud.',
        'The man: {suspect}. The restraining order is valid for several more months.',
      ),
      T(
        'Teataja sõnul on mees varem ähvardanud teda tappa.',
        'The caller says the man has threatened to kill her before.',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive', {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Palun kontrolli {name}, isikukood {idcode}. Kas tal on kehtiv lähenemiskeeld?',
            'Control, {callsign}. Please check {name}, ID code {idcode}. Does he have a valid restraining order?',
          ),
        ],
      }),
      k9Choice(4, 0.3),
      toArrest(12, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees peeti kinni. Alustati kriminaalmenetlust lähenemiskeelu rikkumise eest (KarS § 331²).',
          'The man was detained. Criminal proceedings opened for breaching the restraining order (KarS § 331²).',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'wanted',
        'report',
        [0.3, 0.6],
        2,
        T(
          'Mees lahkus enne patrulli saabumist, rikkumine on tõendatud kaamerasalvestisega. Alustati kriminaalmenetlust, isik kuulutati tagaotsitavaks.',
          'The man left before the patrol arrived; the breach is proven by camera footage. Proceedings opened and he was put on the wanted list.',
        ),
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees jäi tabamata. Naisele anti nõu ja korraldati turvaline ööbimiskoht.',
          'The man was not caught. The woman was given advice and a safe place to stay.',
        ),
        { trust: -3 },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.2,
      toPriority: 1,
      text: T(
        'Teataja: mees murrab ust ja ähvardab tappa.',
        'Caller: the man is breaking the door and threatening to kill her.',
      ),
    },
    interactiveChance: 0.25,
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mu endine mees on jälle ukse taga, tal on lähenemiskeeld!',
          'My ex is outside my door again, he has a restraining order!',
        ),
      ],
      answers: {
        name: [
          T(
            'Ta on mu endine elukaaslane, kohus andis keelu kevadel.',
            'He is my ex-partner, the court gave the order in spring.',
          ),
        ],
        weapons: [T('Ma ei tea, varem on tal nuga olnud.', 'I do not know, he has had a knife before.')],
        safe: [
          T(
            'Uks on lukus, ketis. Ma olen magamistoas.',
            'The door is locked and chained. I am in the bedroom.',
          ),
        ],
      },
    },
    tags: ['dv', 'restraining'],
  },
  {
    id: 'domestic_son_vs_parent',
    category: 'domestic',
    code: 'LSV',
    title: T('Täiskasvanud poeg ründas eakat ema', 'Adult son attacked elderly mother'),
    priority: 2,
    weight: 0.5,
    hours: 'evening',
    places: ['residential', 'house', 'village'],
    units: { need: [un('patrol', 1)] },
    onScene: [40, 80],
    persons: [
      {
        role: 'suspect',
        gender: 'M',
        age: [22, 50],
        relation: 'child',
        known: true,
        intoxicated: 0.8,
        record: 0.5,
      },
      { role: 'victim', gender: 'F', age: [60, 90], relation: 'parent' },
    ],
    summary: [
      T(
        '{address}. Eakas naine teatab, et täiskasvanud poeg nõudis viinaraha, lükkas ta pikali ja lõhub kodus asju.',
        '{address}. An elderly woman reports that her adult son demanded money for vodka, pushed her over and is smashing things at home.',
      ),
      T(
        '{address}. Naabri teatel karjub joobes mees oma eaka ema peale, kostab kolinat. Ema on varem kurtnud, et poeg võtab tema pensioni.',
        '{address}. A neighbour reports a drunk man shouting at his elderly mother, with banging noises. The mother has complained before that her son takes her pension.',
      ),
    ],
    callerLines: [
      T(
        'Poeg on jälle purjus... ta lükkas mu pikali, kui ma raha ei andnud.',
        'My son is drunk again... he pushed me over when I would not give him money.',
      ),
      T(
        'Ma ei taha, et teda vangi pandaks, aga ma kardan teda.',
        'I do not want him put in prison, but I am afraid of him.',
      ),
    ],
    details: [
      T('Poeg: {suspect}. Elab emaga koos, töötu.', 'The son: {suspect}. Lives with his mother, unemployed.'),
      T(
        'Emal on käsivarrel verevalumid, ta keeldub kiirabist.',
        'The mother has bruises on her arm and refuses an ambulance.',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive'),
      aggressorChoice(8, [
        T(
          '{callsign}: ema palub poega mitte kinni pidada. Kas rakendame viibimiskeeldu, peame kinni või piirdume vestlusega?',
          '{callsign}: the mother begs us not to arrest her son. Removal order, detention, or just a talk?',
        ),
      ]),
      agency('kov', 15, {
        chance: 0.4,
        radio: [
          T(
            '{callsign}: eakas vajab sotsiaaltöötaja abi, palun teavitage omavalitsust.',
            '{callsign}: the elderly woman needs a social worker, please notify the municipality.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        2,
        T(
          'Poeg peeti kinni. Alustati kriminaalmenetlust KarS § 121 järgi, omavalitsust teavitati eaka abivajadusest.',
          'The son was detained. Criminal proceedings opened under KarS § 121; the municipality was told the elderly woman needs support.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'ban',
        'report',
        [0.4, 0.8],
        3,
        T(
          'Pojale kohaldati viibimiskeeld ja ta lahkus. Alustati kriminaalmenetlust, emale anti ohvriabi kontaktid.',
          'The son was given a removal order and left. Criminal proceedings opened; the mother was given victim support contacts.',
        ),
        { trust: 1 },
      ),
      oc(
        'talk',
        'warning',
        [0.15, 0.5],
        2,
        T(
          'Poeg rahunes ja läks magama. Teda hoiatati, ema keeldus avaldusest. Sündmus registreeriti LSV-na.',
          'The son calmed down and went to bed. He was warned; the mother declined to file a complaint. Logged as domestic violence.',
        ),
      ),
      oc(
        'hurt',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Ema kukkus uuesti ja murdis randme, ta toimetati haiglasse. Poeg peeti kinni.',
          'The mother fell again and broke her wrist; she was taken to hospital. The son was detained.',
        ),
        { arrests: 1, injuries: 1, trust: -3 },
      ),
    ],
    interactiveChance: 0.25,
    call: {
      mood: 'elderly',
      opening: [
        T(
          'Halloo... kas see on politsei? Mu poeg... ta lükkas mind.',
          'Hello... is that the police? My son... he pushed me.',
        ),
      ],
      openingRu: ['Алло... это полиция? Сын опять пьяный, толкнул меня, требует деньги на водку.'],
      answers: {
        injured: [T('Käsi valutab, aga ma saan hakkama.', 'My arm hurts, but I will manage.')],
        suspect: [T('See on mu poeg, ta elab minuga.', 'It is my son, he lives with me.')],
        intoxicated: [T('Purjus, nagu iga päev.', 'Drunk, like every day.')],
        safe: [
          T('Ma olen köögis, tema on toas ja karjub.', 'I am in the kitchen, he is in the room shouting.'),
        ],
      },
    },
    tags: ['dv', 'elderly', 'alcohol'],
  },
  {
    id: 'domestic_child_caller',
    category: 'domestic',
    code: 'LSV',
    title: T('Laps teatab perevägivallast', 'Child reports domestic violence'),
    priority: 1,
    weight: 0.25,
    hours: 'evening',
    weekendBoost: 1.3,
    places: ['residential', 'house'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 2)] },
    onScene: [45, 90],
    persons: [
      {
        role: 'suspect',
        gender: 'M',
        age: [25, 50],
        relation: 'partner',
        known: true,
        intoxicated: 0.8,
        record: 0.5,
      },
      { role: 'victim', gender: 'F', age: [25, 50], relation: 'partner' },
      { role: 'caller', gender: 'any', age: [6, 12], relation: 'child' },
    ],
    summary: [
      T(
        '{address}. Helistab laps (u 8 a): isa lööb ema, ema nutab. Laps on oma toas. Vägivald käimas.',
        '{address}. A child (about 8) is calling: dad is hitting mum, mum is crying. The child is in their room. Violence in progress.',
      ),
      T(
        '{address}. Lapse kõne: "Issi on purjus ja peksab emmet." Taustal on kuulda karjeid ja kolinat.',
        '{address}. Call from a child: "Daddy is drunk and beating mummy." Screams and banging in the background.',
      ),
    ],
    callerLines: [
      T('(nuttes) Issi lööb emmet... palun tulge.', '(crying) Daddy is hitting mummy... please come.'),
      T(
        'Ma peitsin end kappi. Issi karjub ja midagi läks katki.',
        'I am hiding in the wardrobe. Daddy is shouting and something broke.',
      ),
    ],
    details: [
      T('Laps ütleb, et isa on terve õhtu joonud.', 'The child says dad has been drinking all evening.'),
      T('Korteris on ka väiksem õde.', 'A younger sister is also in the flat.'),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 1,
        reason: T('Laps on vägivalla tunnistaja', 'Child witnessed violence'),
      },
      { agency: 'kiirabi', chance: 0.4, reason: T('Kannatanul vigastused', 'Victim injured') },
    ],
    beats: [
      doorChoice('arrive'),
      qPerson('suspect', 5),
      agency('sotsiaal', 10, {
        radio: [
          T(
            '{callsign}: laps oli vägivalla tunnistaja, palun teavitage lastekaitset.',
            '{callsign}: a child witnessed the violence, please notify child protection.',
          ),
        ],
      }),
      toArrest(15, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Isa peeti kinni. Alustati kriminaalmenetlust KarS § 121 järgi, lastekaitset teavitati. Laps sai ohvriabi kontaktid.',
          'The father was detained. Criminal proceedings opened under KarS § 121 and child protection was notified. The family was given victim support contacts.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'ban',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Isale kohaldati viibimiskeeld. Alustati kriminaalmenetlust, juhtum edastati lastekaitsele ja MARAC-võrgustikule.',
          'The father was given a removal order. Criminal proceedings opened; the case was passed to child protection and MARAC.',
        ),
      ),
      oc(
        'hurt',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Patrull jõudis kohale hilja, ema toimetati vigastustega haiglasse. Isa põgenes ja kuulutati tagaotsitavaks.',
          'The patrol arrived late; the mother was taken to hospital with injuries. The father fled and is wanted.',
        ),
        { injuries: 1, trust: -5 },
      ),
    ],
    interactiveChance: 0.75,
    call: {
      mood: 'child',
      opening: [T('(nuttes) Halloo... issi lööb emmet.', '(crying) Hello... daddy is hitting mummy.')],
      answers: {
        where: [
          T(
            'Ma ei tea täpselt... me elame suures majas, neljandal korrusel.',
            'I do not know exactly... we live in a big building, on the fourth floor.',
          ),
        ],
        name: [T('Ma olen Mia, ma olen kaheksa.', 'I am Mia, I am eight.')],
        safe: [T('Ma olen oma toas kapis.', 'I am in my room, in the wardrobe.')],
        children: [T('Mu väike õde magab.', 'My little sister is asleep.')],
        intoxicated: [T('Issi jõi palju õlut.', 'Daddy drank lots of beer.')],
        weapons: [T('Ma ei näinud... ta viskas taldriku.', 'I did not see... he threw a plate.')],
      },
    },
    tags: ['dv', 'children'],
  },
  {
    id: 'domestic_knife',
    category: 'domestic',
    code: 'LSV',
    title: T('Lähisuhtevägivald noaga', 'Domestic violence with a knife'),
    priority: 1,
    weight: 0.2,
    hours: 'night',
    weekendBoost: 1.3,
    places: ['residential', 'house'],
    units: { need: [un('any', 2)], ideal: [un('rapid', 1), un('patrol', 1)] },
    onScene: [50, 110],
    persons: [
      {
        role: 'suspect',
        gender: 'M',
        age: [25, 60],
        relation: 'partner',
        known: true,
        intoxicated: 0.8,
        record: 0.6,
        restraining: 0.1,
      },
      { role: 'victim', gender: 'F', age: [22, 60], relation: 'partner' },
    ],
    summary: [
      T(
        '{address}. Naine karjub telefoni: elukaaslane ähvardab teda noaga, lõikas kätt. Mees on köögis.',
        '{address}. A woman is screaming down the phone: her partner is threatening her with a knife and has cut her arm. He is in the kitchen.',
      ),
      T(
        '{address}. Teataja sõnul on mehel nuga, naine on trepikojas ja veritseb. Mees lukustas end korterisse.',
        '{address}. The caller says a man has a knife; the woman is in the stairwell bleeding. He has locked himself in the flat.',
      ),
    ],
    callerLines: [
      T('Tal on nuga! Ta lõikas mind, palun kiiresti!', 'He has a knife! He cut me, please hurry!'),
      T(
        'Naine istub trepil, käsi on verine. Mees karjub korteris, et tapab ennast ka.',
        'The woman is sitting on the stairs, her arm is bloody. The man is shouting in the flat that he will kill himself too.',
      ),
    ],
    details: [
      T('Mees: {suspect}. Tugevas joobes.', 'The man: {suspect}. Heavily intoxicated.'),
      T('Korteris võib olla ka jahirelv.', 'There may also be a hunting rifle in the flat.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Lõikehaav', 'Knife wound') }],
    beats: [
      backup(0.6, un('rapid'), {
        at: 'arrive',
        radio: [
          T(
            '{callsign}: mees noaga korteris, vajame kiirreageerijaid!',
            '{callsign}: man with a knife in the flat, we need rapid response!',
          ),
        ],
      }),
      kiirabi('arrive', {
        radio: [
          T(
            '{callsign}: naisel lõikehaav käel, seome. Kiirabi trepikotta.',
            '{callsign}: the woman has a cut on her arm, we are bandaging it. Ambulance to the stairwell.',
          ),
        ],
      }),
      choice(
        4,
        [
          T(
            '{callsign}: mees barrikadeeris end korterisse noaga ja ähvardab endale haiget teha. Kas siseneme kohe või ootame läbirääkijat?',
            '{callsign}: the man has barricaded himself in with the knife and threatens to hurt himself. Go in now or wait for a negotiator?',
          ),
        ],
        [
          opt(
            'enter',
            T('Sisenege', 'Go in'),
            T(
              '{callsign}, juhtimine. Sisenege, kasutage erivahendeid.',
              '{callsign}, Control. Go in, use your equipment.',
            ),
            { success: 0.1, risk: 0.15 },
          ),
          opt(
            'negotiate',
            T('Alustage läbirääkimisi', 'Start negotiating'),
            T(
              '{callsign}, juhtimine. Hoidke ust silmas ja rääkige temaga.',
              '{callsign}, Control. Keep the door covered and talk to him.',
            ),
            { time: 20, success: 0.1, risk: -0.05 },
          ),
        ],
        'negotiate',
      ),
      toArrest(20, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Mees loovutas noa ja peeti kinni. Alustati kriminaalmenetlust KarS § 121 ja § 120 järgi.',
          'The man gave up the knife and was detained. Criminal proceedings opened under KarS § 121 and § 120.',
        ),
        { arrests: 1, injuries: 1, trust: 4 },
      ),
      oc(
        'victim_hosp',
        'hospital',
        [0.3, 0.65],
        2,
        T(
          'Naine toimetati haiglasse haava õmblemiseks, mees peeti kinni pärast pikki läbirääkimisi.',
          'The woman was taken to hospital for stitches; the man was detained after lengthy negotiations.',
        ),
        { arrests: 1, injuries: 1 },
      ),
      oc(
        'selfharm',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Mees vigastas end enne sisenemist ja toimetati haiglasse. Menetlus jätkub.',
          'The man injured himself before officers got in and was taken to hospital. Proceedings continue.',
        ),
        { injuries: 1, trust: -3 },
      ),
      oc(
        'fled',
        'escaped',
        [0, 0.25],
        1,
        T(
          'Mees pääses rõdu kaudu minema. Ta on tagaotsitav, naine on haiglas.',
          'The man got away over the balcony. He is wanted; the woman is in hospital.',
        ),
        { injuries: 1, trust: -4 },
      ),
    ],
    interactiveChance: 0.4,
    call: {
      mood: 'panic',
      opening: [T('Tal on nuga! Ta lõikas mind!', 'He has a knife! He cut me!')],
      openingRu: ['У него нож! Он меня порезал, приезжайте скорее!'],
      answers: {
        injured: [
          T('Käsi veritseb, ma hoian rätikut peal.', 'My arm is bleeding, I am holding a towel on it.'),
        ],
        weapons: [
          T(
            'Suur kööginuga. Ja kapis on tal püss.',
            'A big kitchen knife. And he has a gun in the cupboard.',
          ),
        ],
        safe: [T('Ma jooksin trepikotta, tema on korteris.', 'I ran into the stairwell, he is in the flat.')],
        intoxicated: [T('Ta on täiesti purjus.', 'He is completely drunk.')],
      },
    },
    tags: ['dv', 'armed', 'weapon_knife'],
  },
  {
    id: 'domestic_ex_stalking',
    category: 'domestic',
    code: 'AJ',
    title: T('Endise elukaaslase ahistav jälitamine', 'Stalking by an ex-partner'),
    priority: 3,
    weight: 0.35,
    hours: 'evening',
    places: ['residential', 'house', 'street', 'mall'],
    units: { need: [un('patrol', 1)] },
    onScene: [30, 60],
    persons: [
      {
        role: 'suspect',
        gender: 'M',
        age: [22, 55],
        relation: 'ex_partner',
        known: true,
        record: 0.4,
        restraining: 0.2,
      },
      { role: 'victim', gender: 'F', age: [20, 55], relation: 'ex_partner' },
    ],
    summary: [
      T(
        '{address}. Naine teatab, et endine elukaaslane helistab talle kümneid kordi päevas, ootab teda töö juures ja saatis lilled koos ähvardava kirjaga.',
        '{address}. A woman reports her ex-partner calls her dozens of times a day, waits for her at work and sent flowers with a threatening note.',
      ),
      T(
        '{address}. Teataja kahtlustab, et endine elukaaslane on paigaldanud tema autole jälgimisseadme, kuna ilmub kõikjale, kuhu ta läheb. Mees on praegu maja ees.',
        '{address}. The caller suspects her ex-partner has put a tracker on her car because he turns up everywhere she goes. He is outside the building now.',
      ),
    ],
    callerLines: [
      T(
        'Me läksime lahku pool aastat tagasi, aga ta ei jäta mind rahule. Täna ootas ta mind jälle töö juures.',
        'We split up six months ago but he will not leave me alone. Today he was waiting for me at work again.',
      ),
      T(
        'Ma olen kõik sõnumid alles hoidnud. Neid on sadu.',
        'I have kept all the messages. There are hundreds.',
      ),
    ],
    details: [
      T('Mees: {suspect}.', 'The man: {suspect}.'),
      T(
        'Teataja sõnul ütles mees, et "kui sa minuga ei ole, siis ei ole sa kellegagi".',
        'The caller says he told her "if you are not with me, you will not be with anyone".',
      ),
    ],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.6 }),
      info(5, [
        T(
          '{callsign}: teataja näitas sõnumeid, neid on üle kahesaja. Vormistame avalduse.',
          '{callsign}: the caller showed us the messages, over two hundred. Taking a statement.',
        ),
      ]),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.5, 1],
        3,
        T(
          'Võeti vastu avaldus, alustati kriminaalmenetlust KarS § 157³ järgi. Teatajat nõustati lähenemiskeelu taotlemisel.',
          'A complaint was taken and criminal proceedings opened under KarS § 157³. The caller was advised on applying for a restraining order.',
        ),
        { trust: 2 },
      ),
      oc(
        'warned',
        'warning',
        [0.25, 0.6],
        2,
        T(
          'Mehega vesteldi ja teda hoiatati kriminaalvastutusest. Teatajale anti nõu tõendite kogumiseks.',
          'Officers spoke to the man and warned him about criminal liability. The caller was advised on collecting evidence.',
        ),
      ),
      oc(
        'referred',
        'referred',
        [0, 0.35],
        2,
        T(
          'Teataja ei soovinud avaldust esitada. Talle anti ohvriabi ja naiste tugikeskuse kontaktid.',
          'The caller did not want to file a complaint. She was given victim support and women’s support centre contacts.',
        ),
        { trust: -1 },
      ),
    ],
    tags: ['dv', 'stalking'],
  },
  {
    id: 'domestic_removal_order_breach',
    category: 'domestic',
    code: 'LSV',
    title: T('Viibimiskeelu rikkumine', 'Removal order breach'),
    priority: 2,
    weight: 0.2,
    hours: 'evening',
    places: ['residential', 'house'],
    units: { need: [un('patrol', 1)] },
    onScene: [30, 60],
    persons: [
      {
        role: 'suspect',
        gender: 'M',
        age: [25, 60],
        relation: 'partner',
        known: true,
        record: 0.8,
        intoxicated: 0.7,
        restraining: 0.1,
      },
      { role: 'victim', gender: 'F', age: [22, 60], relation: 'partner' },
    ],
    summary: [
      T(
        '{address}. Mees, kellele eile kohaldati viibimiskeeld, tuli koju tagasi ja nõuab sisselaskmist. Naine kardab.',
        '{address}. A man who was given a removal order yesterday has come back home and is demanding to be let in. The woman is afraid.',
      ),
      T(
        '{address}. Naine teatab, et viibimiskeelu saanud elukaaslane ronis rõdu kaudu korterisse.',
        '{address}. A woman reports that her partner, who is under a removal order, climbed into the flat via the balcony.',
      ),
    ],
    callerLines: [
      T(
        'Politsei viis ta eile ära, aga nüüd on ta tagasi ja peksab ust!',
        'The police took him away yesterday, but now he is back banging on the door!',
      ),
      T(
        'Ta ronis rõdult sisse. Ta ütleb, et see on tema korter ja keegi ei saa teda keelata.',
        'He climbed in from the balcony. He says it is his flat and nobody can stop him.',
      ),
    ],
    details: [
      T(
        'Viibimiskeeld kohaldati eile õhtul KorS § 44 alusel.',
        'The removal order was issued last night under KorS § 44.',
      ),
      T('Mees: {suspect}. Joobes.', 'The man: {suspect}. Intoxicated.'),
    ],
    beats: [qPerson('suspect', 'arrive'), toArrest(8, { chance: 0.75 })],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.5, 1],
        3,
        T(
          'Mees peeti kinni. Menetlus jätkub, prokuratuurile tehti ettepanek taotleda lähenemiskeeldu.',
          'The man was detained. The case continues and the prosecutor was asked to seek a restraining order.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'removed',
        'report',
        [0.3, 0.6],
        2,
        T(
          'Mees eemaldati korterist ja viibimiskeelu rikkumine vormistati. Naisele korraldati turvaline ööbimiskoht.',
          'The man was removed from the flat and the breach recorded. The woman was found a safe place to stay.',
        ),
      ),
      oc(
        'escaped',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees lahkus enne patrulli saabumist ja jäi tabamata.',
          'The man left before the patrol arrived and was not found.',
        ),
        { trust: -3 },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.25,
      toPriority: 1,
      text: T('Teataja: mees on korteris ja lööb teda.', 'Caller: the man is inside and hitting her.'),
    },
    tags: ['dv', 'restraining'],
  },
  {
    id: 'domestic_drunk_parent_children',
    category: 'domestic',
    code: 'LSV',
    title: T('Joobes vanem, lapsed järelevalveta', 'Drunk parent, children unsupervised'),
    priority: 2,
    weight: 0.4,
    hours: 'evening',
    places: ['residential', 'house'],
    units: { need: [un('patrol', 1)] },
    onScene: [45, 90],
    persons: [
      {
        role: 'suspect',
        gender: 'any',
        age: [23, 45],
        relation: 'parent',
        known: true,
        intoxicated: 0.95,
        record: 0.2,
      },
      { role: 'victim', gender: 'any', age: [2, 8], relation: 'child' },
      { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naabri teatel nutavad korteris väikesed lapsed juba tunde, ema on purjus ja ei ava ust.',
        '{address}. A neighbour reports small children have been crying in a flat for hours; the mother is drunk and will not open the door.',
      ),
      T(
        '{address}. Trepikojas magab tugevas joobes mees, korteri uks on lahti ja sees on kaks väikest last üksi.',
        '{address}. A heavily drunk man is asleep in the stairwell; the flat door is open and two small children are alone inside.',
      ),
    ],
    callerLines: [
      T(
        'Lapsed nutavad juba kolm tundi. Ema nägin õhtul poest viinaga tulemas.',
        'The kids have been crying for three hours. I saw the mother coming back from the shop with vodka this evening.',
      ),
      T(
        'Isa magab trepikojas, uks on pärani ja väike poiss istub esikus üksi.',
        'The father is asleep in the stairwell, the door is wide open and a little boy is sitting alone in the hall.',
      ),
    ],
    details: [
      T('Vanem: {suspect}.', 'The parent: {suspect}.'),
      T('Lastekaitsel on pere kohta varasem info.', 'Child protection already has a file on the family.'),
    ],
    agencies: [{ agency: 'sotsiaal', chance: 1, reason: T('Lapsed järelevalveta', 'Children unsupervised') }],
    beats: [
      agency('paaste', 'arrive', {
        chance: 0.4,
        radio: [
          T(
            '{callsign}: uks lukus, sees lapsed üksi. Palun päästjad ust avama.',
            '{callsign}: door locked, children alone inside. Request rescue to open the door.',
          ),
        ],
      }),
      qPerson('suspect', 5),
      agency('sotsiaal', 8, {
        radio: [
          T(
            '{callsign}: lapsed järelevalveta, vanem tugevas joobes. Palun lastekaitse.',
            '{callsign}: children unsupervised, parent heavily intoxicated. Request child protection.',
          ),
        ],
      }),
      toSober(15, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'placed',
        'referred',
        [0.5, 1],
        3,
        T(
          'Lapsed anti lastekaitse kaudu sugulaste hoole alla, vanem toimetati kainenema. Juhtum edastati lastekaitsele.',
          'Through child protection the children were placed with relatives and the parent taken to sober up. The case was passed to child protection.',
        ),
        { trust: 2 },
      ),
      oc(
        'neighbour',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Lapsed jäid naabri hoole alla kuni vanaema saabumiseni. Vanema käitumine vormistati, info edastati lastekaitsele.',
          'The children stayed with a neighbour until their grandmother arrived. The parent’s conduct was recorded and passed to child protection.',
        ),
      ),
      oc(
        'late',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Uks avati alles hiljem. Väiksem laps oli nõrk ja toimetati kontrolliks haiglasse.',
          'The door was only opened later. The younger child was weak and taken to hospital for a check-up.',
        ),
        { injuries: 1, trust: -3 },
      ),
    ],
    tags: ['children', 'alcohol'],
  },
  {
    id: 'domestic_midsummer_summerhouse',
    category: 'domestic',
    code: 'LSV',
    title: T('Jaanipäeva tüli suvilas', 'Midsummer row at a summer house'),
    priority: 2,
    weight: 0.6,
    hours: 'nightlife',
    weekendBoost: 1.3,
    months: [6],
    places: ['summerhouse', 'village', 'farm'],
    units: { need: [un('patrol', 1)], ideal: [un('patrol', 2)] },
    onScene: [45, 100],
    persons: [
      {
        role: 'suspect',
        gender: 'M',
        age: [25, 60],
        relation: 'partner',
        known: true,
        intoxicated: 0.95,
        record: 0.4,
      },
      { role: 'victim', gender: 'F', age: [22, 60], relation: 'partner', intoxicated: 0.5 },
      { role: 'witness', gender: 'any', age: [20, 70], relation: 'friend', intoxicated: 0.7 },
    ],
    summary: [
      T(
        '{address}. Jaanipeol läks purjus mees naisega tülli, lõi teda ja lõhub nüüd mööblit. Külalised lukustasid end sauna.',
        '{address}. At a Midsummer party a drunk man started a row with his wife, hit her and is now smashing furniture. The guests have locked themselves in the sauna.',
      ),
      T(
        '{address}. Jaanitule ääres tekkis sugulaste vahel kaklus, purjus mees ähvardab teisi. Kohal on lapsi.',
        '{address}. A fight broke out between relatives at the Midsummer bonfire; a drunk man is threatening the others. Children present.',
      ),
    ],
    callerLines: [
      T(
        '(taustal muusika) Halloo, politsei? Siin jaanipeol läks jamaks, Tõnu lõi oma naist!',
        '(music in the background) Hello, police? Things went bad at the Midsummer party, Tõnu hit his wife!',
      ),
      T(
        'Me oleme saunas peidus, ta loobib õues toole ja karjub.',
        'We are hiding in the sauna, he is throwing chairs around outside and shouting.',
      ),
    ],
    details: [
      T(
        'Suvila asub metsatee lõpus, navigeerimine on keeruline.',
        'The summer house is at the end of a forest track; it is hard to find.',
      ),
      T('Kahtlustatav: {suspect}. Väga purjus.', 'Suspect: {suspect}. Very drunk.'),
    ],
    beats: [
      qPerson('suspect', 'arrive'),
      kiirabi(3, {
        chance: 0.35,
        radio: [
          T(
            '{callsign}: naisel peavigastus, palun kiirabi. Arvestage pika sõiduga.',
            '{callsign}: the woman has a head injury, request an ambulance. Expect a long drive.',
          ),
        ],
      }),
      toArrest(15, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'The man was detained and taken to the detention house. Criminal proceedings opened under KarS § 121.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'report',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Mees toimetati kainenema, kannatanult võeti avaldus. Peo külalised viidi koju kaine juhiga.',
          'The man was taken to sober up and the victim gave a statement. A sober driver took the guests home.',
        ),
      ),
      oc(
        'forest',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees jooksis metsa enne patrulli saabumist. Naine toimetati EMO-sse, mees kuulutati tagaotsitavaks.',
          'The man ran into the forest before the patrol arrived. The woman was taken to A&E and the man is wanted.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    interactiveChance: 0.25,
    call: {
      mood: 'drunk',
      opening: [
        T(
          'Halloo... politsei? Siin jaanipeol on jama, üks mees läks täitsa hulluks.',
          'Hello... police? There is trouble at the Midsummer party, a guy has gone totally crazy.',
        ),
      ],
      answers: {
        where: [
          T(
            'Suvila... ma ei tea aadressi, metsa sees, järve ääres.',
            'The summer house... I do not know the address, in the woods, by the lake.',
          ),
        ],
        injured: [T('Naisel on pea katki, veri tuleb.', 'The woman has a cut on her head, it is bleeding.')],
        children: [T('Lapsed on majas, nad magavad.', 'The kids are in the house, asleep.')],
        intoxicated: [
          T('Noh... kõik on natuke võtnud. Tema väga palju.', 'Well... everyone has had a bit. Him a lot.'),
        ],
      },
    },
    tags: ['dv', 'alcohol', 'holiday'],
  },
];
