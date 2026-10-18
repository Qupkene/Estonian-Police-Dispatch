// Lähisuhte- ja perevägivald (LSV): partnerid, endised partnerid, lapsed, eakad vanemad.
import type { IncidentScenario, IncidentTemplate, PersonSpec, Text } from '@/sim/types';
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
  qVehicle,
  search,
  toArrest,
  toSober,
  un,
} from './_helpers_a';

/**
 * Shared decision: what to do with a calmed-down aggressor (KorS § 44 viibimiskeeld up to 72 h since
 * 17.04.2026). `who` is the aggressor's gender, for the English replies.
 */
const aggressorChoice = (at: number, radio: Text[], who: 'M' | 'F' = 'M') =>
  choice(
    at,
    radio,
    [
      opt(
        'detain',
        T('Pidage kinni kahtlustatavana', 'Detain as a suspect'),
        T(
          '{callsign}, juhtimine. Pidage kinni ja toimetage arestimajja.',
          who === 'F'
            ? '{callsign}, Control. Detain and take her to the arrest house.'
            : '{callsign}, Control. Detain and take him to the arrest house.',
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
          who === 'F'
            ? '{callsign}, Control. Issue a removal order, she must leave the home.'
            : '{callsign}, Control. Issue a removal order, he must leave the home.',
        ),
        {
          success: 0.1,
          trust: 1,
          time: 15,
        },
      ),
      opt(
        'leave',
        T('Vestlus, jätke koju', who === 'F' ? 'Talk, leave her at home' : 'Talk, leave him at home'),
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

// ─── Scenarios: one coherent story per incident (IncidentTemplate.scenarios) ──
// Every scenario keeps its own card, caller, beats and endings in step: who is involved, what set
// it off, who calls and what the patrol finds on arrival.

const NEIGHBOUR: PersonSpec = { role: 'caller', gender: 'any', age: [25, 80], relation: 'neighbour' };

/** A victim with no relation: the household anchor the other persons relate to. */
const vic = (gender: 'M' | 'F' | 'any', age: [number, number], o: Partial<PersonSpec> = {}): PersonSpec => ({
  role: 'victim',
  gender,
  age,
  ...o,
});

/** A suspect known to the victim, related as `relation`. */
const sus = (
  gender: 'M' | 'F' | 'any',
  age: [number, number],
  relation: PersonSpec['relation'],
  o: Partial<PersonSpec> = {},
): PersonSpec => ({ role: 'suspect', gender, age, relation, known: true, ...o });

const Q_LSV: Text[] = [
  T(
    'Juhtimiskeskus, {callsign}. Palun kontrolli {name}, isikukood {idcode}. Kas tal on lähenemiskeeld või varasemaid LSV-sündmusi?',
    'Control, {callsign}. Please check {name}, ID code {idcode}. Any restraining order or previous domestic incidents?',
  ),
];

// ── domestic_violence (legacy "Koduvägivald") ──────────────────────────────
const SC_DOMESTIC_VIOLENCE: IncidentScenario[] = [
  {
    id: 'stairwell_jealous',
    title: T('Koduvägivald: armukade mees trepikojas', 'Domestic violence: jealous man in the stairwell'),
    persons: [
      vic('F', [22, 50]),
      sus('M', [25, 55], 'partner', { intoxicated: 0.85, record: 0.45, restraining: 0.05 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naabri teatel peksab joobes mees trepikojas korteri ust ja karjub, et naine tuleks välja rääkima. Naine on end sisse lukustanud, enne kostis korterist löögihelisid.',
        '{address}. A neighbour reports a drunk man in the stairwell pounding on a flat door and shouting for the woman to come out and talk. She has locked herself in; sounds of blows came from the flat earlier.',
      ),
      T(
        '{address}. Trepikojas karjub mees elukaaslase peale, kes jõudis peolt hilja koju. Naabri sõnul lõi mees teda juba ukse ees, naine põgenes korterisse.',
        '{address}. A man is shouting in the stairwell at his partner, who came home late from a party. According to a neighbour he already hit her at the door and she fled into the flat.',
      ),
    ],
    callerLines: [
      T(
        'Ta lööb jalaga vastu ust ja karjub, et tapab ta ära, kui ta ust ei ava.',
        'He is kicking the door and shouting that he will kill her if she does not open it.',
      ),
      T(
        'Ma nägin piilukast, kuidas ta lõi teda trepil. Naine jooksis tuppa ja keeras ukse lukku.',
        'I saw through the peephole how he hit her on the stairs. She ran inside and locked the door.',
      ),
    ],
    details: [
      T(
        'Mees: {suspect}. Tüli põhjus armukadedus, naine oli töökaaslaste peol.',
        'The man: {suspect}. The row is about jealousy; the woman had been at a work party.',
      ),
      T(
        'Teataja jälgib piilukast, mees on endiselt trepikojas.',
        'The caller is watching through the peephole; the man is still in the stairwell.',
      ),
    ],
    agencies: [
      { agency: 'kiirabi', chance: 0.3, reason: T('Kannatanul näovigastus', 'Victim has a facial injury') },
    ],
    beats: [
      backup(0.15, un('rapid'), {
        radio: [
          T(
            '{callsign}: mees trepikojas agressiivne, ei allu korraldustele. Vajame kiiresti lisajõude!',
            '{callsign}: the man in the stairwell is aggressive and ignores orders. We need backup fast!',
          ),
        ],
      }),
      info('arrive', [
        T(
          '{callsign}: kohal. Mees on trepikojas ukse taga, naine korteris. Eraldame nad.',
          '{callsign}: on scene. The man is at the door in the stairwell, the woman inside. Separating them.',
        ),
      ]),
      qPerson('suspect', 4, { radio: Q_LSV }),
      toArrest(15, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Mees peeti trepikojas kinni ja toimetati arestimajja. Naise näol olid löögijäljed, alustati kriminaalmenetlust KarS § 121 järgi. Naisele anti ohvriabi kontaktid.',
          'The man was detained in the stairwell and taken to the arrest house. The woman had marks of blows on her face; criminal proceedings were opened under KarS § 121. She was given victim support contacts.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'ban',
        'report',
        [0.4, 0.75],
        3,
        T(
          'Mehele kohaldati 72-tunnine viibimiskeeld ja ta viidi ööseks venna juurde. Alustati kriminaalmenetlust, naine nõustus ohvriabi nõustamisega.',
          'The man was given a 72-hour removal order and driven to his brother’s for the night. Criminal proceedings were opened and the woman agreed to victim support counselling.',
        ),
        { trust: 1 },
      ),
      oc(
        'calmed',
        'warning',
        [0.2, 0.5],
        2,
        T(
          'Mees rahunes patrulli nähes ja naine keeldus ütlusi andmast. Mõlemaid hoiatati, sündmus registreeriti LSV-na ja edastati piirkonnapolitseinikule.',
          'The man calmed down when he saw the patrol and the woman declined to give a statement. Both were warned; the event was logged as domestic and passed to the community officer.',
        ),
      ),
      oc(
        'fled',
        'escaped',
        [0, 0.3],
        2,
        T(
          'Mees jooksis patrulli nähes tagatrepist minema. Naine toimetati EMO-sse, mees kuulutati tagaotsitavaks.',
          'The man ran down the back stairs when he saw the patrol. The woman was taken to A&E and the man is now wanted.',
        ),
        { injuries: 1, trust: -3 },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.3,
      toPriority: 1,
      text: T(
        'Teataja: mees murrab ust, uks hakkab järele andma.',
        'Caller: the man is breaking the door down and it is starting to give way.',
      ),
    },
    call: {
      mood: 'panic',
      opening: [
        T(
          'Meie trepikojas peksab mees naabri ust ja karjub, et tapab ta!',
          'In our stairwell a man is pounding on my neighbour’s door, shouting that he will kill her!',
        ),
        T(
          'Ta lõi naist trepil ja nüüd peksab ust, sest naine pani end luku taha.',
          'He hit her on the stairs and now he is pounding on the door because she locked herself in.',
        ),
      ],
      openingRu: [
        'У нас в подъезде мужчина ломится к соседке и кричит, что убьёт её!',
        'Он ударил её на лестнице, а теперь ломится в дверь, она заперлась.',
      ],
      answers: {
        where: [
          T(
            '{address}, ta on otse minu ukse kõrval trepimademel.',
            '{address}, he is right next to my door on the landing.',
          ),
        ],
        weapons: [
          T(
            'Käes tal midagi ei ole, aga ta on suur ja väga vihane.',
            'He has nothing in his hands, but he is big and very angry.',
          ),
        ],
        suspect: [T('{suspect}. Ta elab seal oma naisega.', '{suspect}. He lives there with his wife.')],
        safe: [T('Mina olen oma korteris, uks on lukus.', 'I am in my own flat with the door locked.')],
        children: [T('Lapsi neil ei ole.', 'They have no children.')],
        intoxicated: [
          T('Purjus, ta vaarub ja karjub segast juttu.', 'Drunk, he is staggering and shouting nonsense.'),
        ],
      },
      answersRu: {
        where: ['{address}, он прямо возле моей двери на площадке.'],
        weapons: ['В руках у него ничего нет, но он здоровый и очень злой.'],
        suspect: ['{suspect}. Он там живёт со своей женой.'],
        safe: ['Я у себя в квартире, дверь закрыта.'],
        children: ['Детей у них нет.'],
        intoxicated: ['Пьяный, шатается и орёт что-то невнятное.'],
      },
    },
    tags: ['jealousy'],
  },
  {
    id: 'teen_daughter_calls',
    title: T('Koduvägivald: teismeline tütar helistab', 'Domestic violence: teenage daughter calls'),
    persons: [
      vic('F', [30, 50]),
      sus('M', [30, 55], 'partner', { intoxicated: 0.85, record: 0.5 }),
      { role: 'caller', gender: 'F', age: [13, 16], relation: 'child' },
    ],
    summary: [
      T(
        '{address}. Helistab teismeline tüdruk: ema elukaaslane lõi ema, ema nutab köögis. Tüdruk on oma toas, mees joob edasi.',
        '{address}. A teenage girl is calling: her mother’s partner hit her mother, who is crying in the kitchen. The girl is in her room and the man keeps drinking.',
      ),
      T(
        '{address}. Teismelise tütre kõne: kasuisa jõi palgapäeval end täis ja lõi ema. Tüdruk kardab, et läheb hullemaks.',
        '{address}. Call from a teenage daughter: her stepfather got drunk on payday and hit her mother. The girl is afraid it will get worse.',
      ),
    ],
    callerLines: [
      T(
        'Ta lõi emmet, ma kuulsin. Ma ei julge toast välja minna.',
        'He hit mum, I heard it. I do not dare to leave my room.',
      ),
      T(
        'Ema ütles, et ära helista, aga ma ei taha, et ta jälle haiget saab.',
        'Mum said not to call, but I do not want her to get hurt again.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}, ema elukaaslane. Lapse sõnul joob ta igal palgapäeval.',
        'Suspect: {suspect}, the mother’s partner. The child says he drinks every payday.',
      ),
      T('Korteris magab ka väike vend.', 'A little brother is also asleep in the flat.'),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 1,
        reason: T('Alaealised vägivalla tunnistajad', 'Minors witnessed violence'),
      },
      { agency: 'kiirabi', chance: 0.3, reason: T('Kannatanul vigastused', 'Victim injured') },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal. Mees istub köögis õllega ja ütleb, et midagi ei juhtunud. Ema on vannitoas.',
          '{callsign}: on scene. The man is sitting in the kitchen with a beer saying nothing happened. The mother is in the bathroom.',
        ),
      ]),
      qPerson('suspect', 3, { radio: Q_LSV }),
      agency('sotsiaal', 8, {
        radio: [
          T(
            '{callsign}: lapsed olid vägivalla tunnistajad, palun teavitage lastekaitset.',
            '{callsign}: the children witnessed the violence, please notify child protection.',
          ),
        ],
      }),
      aggressorChoice(12, [
        T(
          '{callsign}: tüdruk kinnitab, et mees lõi ema. Ema palub meest mitte viia. Kuidas toimime?',
          '{callsign}: the girl confirms the man hit her mother. The mother asks us not to take him. How do we proceed?',
        ),
      ]),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Ema elukaaslane peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi, tütre ütlused võeti lapsesõbralikus ruumis. Lastekaitset teavitati.',
          'The mother’s partner was detained and taken to the arrest house. Criminal proceedings were opened under KarS § 121 and the daughter was interviewed in a child-friendly room. Child protection was notified.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'ban',
        'report',
        [0.35, 0.75],
        3,
        T(
          'Mehele kohaldati viibimiskeeld ja ta pidi korterist lahkuma. Alustati kriminaalmenetlust, pere suunati ohvriabisse ja lastekaitse võttis juhtumi menetlusse.',
          'The man was given a removal order and had to leave the flat. Criminal proceedings were opened, the family was referred to victim support and child protection took up the case.',
        ),
        { trust: 1 },
      ),
      oc(
        'denied',
        'referred',
        [0.15, 0.45],
        2,
        T(
          'Ema eitas vägivalda ja mees lahkus ise sõbra juurde. Lapse teade edastati lastekaitsele, piirkonnapolitseinik külastab peret.',
          'The mother denied the violence and the man went to a friend’s on his own. The child’s report was passed to child protection and the community officer will visit the family.',
        ),
      ),
      oc(
        'hurt',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Enne patrulli saabumist lõi mees ema uuesti. Ema toimetati haiglasse, mees peeti kinni ja lapsed jäid vanaema hoole alla.',
          'Before the patrol arrived the man hit the mother again. She was taken to hospital, the man was detained and the children stayed with their grandmother.',
        ),
        { arrests: 1, injuries: 1, trust: -3 },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.3,
      toPriority: 1,
      text: T(
        'Tüdruk helistas uuesti: mees lõhub mööblit ja ema karjub appi.',
        'The girl called again: the man is smashing furniture and her mother is screaming for help.',
      ),
    },
    call: {
      mood: 'whisper',
      opening: [
        T(
          '(sosinal) Tere... ema elukaaslane lõi emmet. Palun tulge.',
          '(whispering) Hello... my mum’s boyfriend hit my mum. Please come.',
        ),
        T(
          '(sosinal) Ta jõi jälle ja lõi emmet näkku. Emme nutab köögis.',
          '(whispering) He was drinking again and hit mum in the face. Mum is crying in the kitchen.',
        ),
      ],
      openingRu: [
        '(шёпотом) Алло... мамин сожитель ударил маму. Приезжайте, пожалуйста.',
        '(шёпотом) Он опять напился и ударил маму по лицу. Мама плачет на кухне.',
      ],
      answers: {
        name: [
          T(
            'Mina olen tütar. Palun ärge öelge talle, et mina helistasin.',
            'I am the daughter. Please do not tell him I called.',
          ),
        ],
        safe: [
          T(
            'Ma olen oma toas, uks on kinni. Tema on köögis.',
            'I am in my room with the door shut. He is in the kitchen.',
          ),
        ],
        children: [T('Mina ja mu väike vend. Ta magab.', 'Me and my little brother. He is asleep.')],
        intoxicated: [
          T('Jah, ta on terve õhtu viina joonud.', 'Yes, he has been drinking vodka all evening.'),
        ],
        weapons: [T('Ei, ta lõi käega.', 'No, he hit her with his hand.')],
        suspect: [
          T(
            'See on ema elukaaslane. Ta ei ole mu päris isa.',
            'It is my mum’s boyfriend. He is not my real dad.',
          ),
        ],
      },
      answersRu: {
        name: ['Я дочь. Пожалуйста, не говорите ему, что это я позвонила.'],
        safe: ['Я в своей комнате, дверь закрыта. Он на кухне.'],
        children: ['Я и мой младший брат. Он спит.'],
        intoxicated: ['Да, он весь вечер водку пил.'],
        weapons: ['Нет, он рукой ударил.'],
        suspect: ['Это мамин сожитель. Он мне не родной папа.'],
      },
    },
    tags: ['children'],
  },
  {
    id: 'victim_denies',
    title: T('Koduvägivald: kannatanu eitab', 'Domestic violence: the victim denies it'),
    persons: [
      vic('F', [22, 55]),
      sus('M', [25, 60], 'partner', { intoxicated: 0.5, record: 0.5, restraining: 0.05 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naabri teatel kostis korterist naise karjumine ja mitu tugevat mütsu, siis jäi vaikseks. Aadressil on varem olnud LSV-väljakutseid.',
        '{address}. A neighbour heard a woman screaming and several heavy thuds from the flat, then silence. There have been domestic call-outs at this address before.',
      ),
      T(
        '{address}. Teataja kuulis seina tagant löömist ja naise nuttu. Naaber kahtleb, kas naine julgeb politseile midagi rääkida.',
        '{address}. The caller heard blows and a woman crying through the wall. The neighbour doubts the woman will dare tell the police anything.',
      ),
    ],
    callerLines: [
      T(
        'Seal oli kõva mürts ja naine karjus, nüüd on vaikus. See vaikus hirmutab mind rohkem.',
        'There was a loud thud and the woman screamed, now it is quiet. The silence scares me more.',
      ),
      T(
        'Ta ütleb alati, et kukkus. Aga keegi ei kuku nii tihti.',
        'She always says she fell. But nobody falls that often.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Aadressil kolm LSV-sündmust viimase aasta jooksul.',
        'Suspect: {suspect}. Three domestic incidents at this address in the past year.',
      ),
      T('Kannatanu on varem keeldunud ütlusi andmast.', 'The victim has refused to give statements before.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.25, reason: T('Kannatanul vigastused', 'Victim injured') }],
    beats: [
      info('arrive', [
        T(
          '{callsign}: naine avas ukse, põsk on punane. Ütleb, et kukkus vannitoas ja kõik on korras.',
          '{callsign}: the woman opened the door with a red cheek. She says she fell in the bathroom and everything is fine.',
        ),
      ]),
      choice(
        4,
        [
          T(
            '{callsign}: naine eitab, mees on rahulik ja viisakas. Kas küsitleme neid eraldi või lõpetame?',
            '{callsign}: the woman denies it and the man is calm and polite. Do we interview them separately or close?',
          ),
        ],
        [
          opt(
            'separate',
            T('Küsitlege eraldi, tehke riskihindamine', 'Interview separately, do a risk assessment'),
            T(
              '{callsign}, juhtimine. Rääkige naisega eraldi ja täitke riskihindamine.',
              '{callsign}, Control. Talk to the woman alone and complete the risk assessment.',
            ),
            { success: 0.2, time: 15 },
          ),
          opt(
            'close',
            T('Lõpetage sündmus', 'Close the event'),
            T(
              '{callsign}, juhtimine. Kui kaebust ei ole, lõpetage.',
              '{callsign}, Control. If there is no complaint, close it.',
            ),
            { success: -0.25, trust: -2 },
          ),
        ],
        'separate',
      ),
      qPerson('suspect', 6, { radio: Q_LSV }),
    ],
    outcomes: [
      oc(
        'strangled',
        'arrest',
        [0.75, 1],
        2,
        T(
          'Naise kaelal leiti kägistamisjäljed. Mees peeti kinni ja toimetati arestimajja, alustati kriminaalmenetlust KarS § 121 järgi.',
          'Strangulation marks were found on the woman’s neck. The man was detained and taken to the arrest house; criminal proceedings were opened under KarS § 121.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'told',
        'report',
        [0.5, 1],
        3,
        T(
          'Eraldi vestluses rääkis naine, et mees lükkas ta vastu kappi. Kriminaalmenetlus KarS § 121 järgi alustati ka ilma kaebuseta, juhtum esitati MARAC-võrgustikule.',
          'Alone with the officers the woman said the man had shoved her into a cupboard. Proceedings under KarS § 121 were opened even without a complaint and the case was referred to MARAC.',
        ),
        { trust: 2 },
      ),
      oc(
        'logged',
        'warning',
        [0.2, 0.55],
        2,
        T(
          'Naine jäi oma jutu juurde ja keeldus abist. Sündmus registreeriti LSV-na, naisele jäeti ohvriabi ja naiste tugikeskuse kontaktid.',
          'The woman stuck to her story and refused help. The event was logged as domestic and she was left victim support and women’s support centre contacts.',
        ),
      ),
      oc(
        'missed',
        'report',
        [0, 0.25],
        2,
        T(
          'Patrull lahkus ilma tõenditeta. Järgmisel päeval pöördus naine vigastustega EMO-sse ja kriminaalmenetlus alustati tagantjärele.',
          'The patrol left without evidence. The next day the woman went to A&E with injuries and proceedings were opened afterwards.',
        ),
        { injuries: 1, trust: -4 },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.25,
      toPriority: 1,
      text: T(
        'Teataja: korterist kostab jälle karjumist, naine hüüab appi.',
        'Caller: screaming from the flat again, the woman is calling for help.',
      ),
    },
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Naabrite juures oli just kõva mürts ja naine karjus, nüüd on täiesti vaikne.',
          'Hello. There was just a loud thud at the neighbours’ and the woman screamed, now it is completely quiet.',
        ),
        T(
          'Seina tagant kostis löömist ja naise nuttu, nüüd on vaikus.',
          'There were blows and a woman crying behind the wall, now it is silent.',
        ),
      ],
      openingRu: [
        'Здравствуйте. У соседей что-то грохнуло, женщина закричала, а теперь полная тишина.',
        'За стеной были удары и женский плач, а теперь тишина.',
      ],
      answers: {
        what: [
          T(
            'Ma kuulsin mitu mütsu ja karjet. Ma arvan, et ta lõi teda jälle.',
            'I heard several thuds and a scream. I think he hit her again.',
          ),
        ],
        injured: [
          T(
            'Ma ei tea, ma ei ole teda täna näinud. Eelmine kord oli tal silm sinine.',
            'I do not know, I have not seen her today. Last time she had a black eye.',
          ),
        ],
        children: [T('Lapsi neil ei ole.', 'They have no children.')],
        name: [T('Ma ei taha, et nad teaksid, et mina helistasin.', 'I do not want them to know I called.')],
      },
      answersRu: {
        what: ['Я {слышал|слышала} несколько глухих ударов и крик. Думаю, он опять её ударил.'],
        injured: [
          'Не знаю, я её сегодня не {видел|видела}. В прошлый раз у неё был синяк под глазом.',
        ],
        children: ['Детей у них нет.'],
        name: ['Я не хочу, чтобы они знали, что это я {позвонил|позвонила}.'],
      },
    },
  },
  {
    id: 'suspect_called',
    title: T('Koduvägivald: mees helistas ise', 'Domestic violence: the man called himself'),
    persons: [vic('F', [22, 55]), sus('M', [25, 60], 'partner', { intoxicated: 0.4, record: 0.3 })],
    callerRole: 'suspect',
    summary: [
      T(
        '{address}. Mees helistab ise: lõi tülis oma naist ja palub politsei kohale, enne kui midagi hullemat juhtub. Ootab maja ees pingil.',
        '{address}. A man is calling himself: he hit his wife during a row and asks the police to come before something worse happens. He is waiting on a bench outside.',
      ),
      T(
        '{address}. Helistaja ütleb, et kaotas enesevalitsuse ja lõi elukaaslast. Naine on korteris, huul veritseb. Mees lubab mitte põgeneda.',
        '{address}. The caller says he lost control and hit his partner. She is in the flat with a bleeding lip. He promises not to run.',
      ),
    ],
    callerLines: [
      T(
        'Ma lõin teda. Ma ei tea, mis minuga juhtus. Tulge palun, ma ootan all.',
        'I hit her. I do not know what came over me. Please come, I am waiting downstairs.',
      ),
      T(
        'Ta ütles, et lahkub minust, ja mul läks lihtsalt silme eest mustaks. Ma ei taha talle enam haiget teha.',
        'She said she was leaving me and I just lost it. I do not want to hurt her any more.',
      ),
    ],
    details: [
      T('Helistaja on kahtlustatav ise: {suspect}.', 'The caller is the suspect himself: {suspect}.'),
      T(
        'Naine on korteris, huul veritseb. Ta ei ole ise helistanud.',
        'The woman is in the flat with a bleeding lip. She has not called herself.',
      ),
    ],
    agencies: [
      {
        agency: 'kiirabi',
        chance: 0.5,
        reason: T('Huulehaav, võimalik peatrauma', 'Split lip, possible head injury'),
      },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: mees ootab maja ees, käed nähtaval, koostööaldis. Läheme naise juurde.',
          '{callsign}: the man is waiting outside with his hands visible, cooperative. Going up to the woman.',
        ),
      ]),
      kiirabi(3, {
        chance: 0.5,
        radio: [
          T(
            '{callsign}: naisel lõhkine huul ja pea valutab, palun kiirabi.',
            '{callsign}: the woman has a split lip and a headache, request an ambulance.',
          ),
        ],
      }),
      qPerson('suspect', 5, { radio: Q_LSV }),
      toArrest(12, { chance: 0.75 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.5, 1],
        3,
        T(
          'Mees andis end vabatahtlikult üles ja peeti kinni. Alustati kriminaalmenetlust KarS § 121 järgi, mehele soovitati vägivallast loobumise programmi ja naine suunati ohvriabisse.',
          'The man gave himself up and was detained. Criminal proceedings were opened under KarS § 121; he was pointed to a programme for people who use violence and the woman was referred to victim support.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'ban',
        'report',
        [0.3, 0.7],
        2,
        T(
          'Mehele kohaldati viibimiskeeld ja ta läks ööseks ema juurde. Alustati kriminaalmenetlust, naine sai ohvriabi kontaktid.',
          'The man was given a removal order and went to his mother’s for the night. Criminal proceedings were opened and the woman got victim support contacts.',
        ),
        { trust: 1 },
      ),
      oc(
        'concussion',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Naisel hakkas pea ringi käima ja ta toimetati kiirabiga põrutuse kahtlusega EMO-sse. Mees peeti kinni.',
          'The woman became dizzy and was taken by ambulance to A&E with a suspected concussion. The man was detained.',
        ),
        { arrests: 1, injuries: 1, trust: -1 },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.15,
      toPriority: 1,
      text: T(
        'Häirekeskus: mees helistas uuesti, naine ei vasta ja lamab põrandal.',
        'ERC: the man called again; the woman is not responding and is lying on the floor.',
      ),
    },
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere... ma pean ennast üles andma. Ma lõin oma naist.',
          'Hello... I need to turn myself in. I hit my wife.',
        ),
        T(
          'Ta ütles, et lahkub minust, ja mul läks silme eest mustaks. Ma lõin teda. Ma ootan all.',
          'She said she was leaving me and I lost it. I hit her. I am waiting downstairs.',
        ),
      ],
      openingRu: [
        'Алло... я хочу сам заявить. Я ударил жену.',
        'Она сказала, что уходит от меня, и я сорвался. Я её ударил. Жду внизу.',
      ],
      answers: {
        vehicle: [
          T(
            'Ei, ma ei lähe kuhugi. Auto seisab garaažis.',
            'No, I am not going anywhere. The car is in the garage.',
          ),
        ],
        count: [T('Meie kahekesi, mina ja tema.', 'Just the two of us, me and her.')],
        when: [T('Just praegu, viis minutit tagasi.', 'Just now, five minutes ago.')],
        suspect: [T('Mina ise. Ma ootan maja ees pingil.', 'Me. I am waiting on the bench outside.')],
        injured: [
          T(
            'Tal on huul katki, ta istub köögis. Pea valutab ka.',
            'Her lip is split and she is sitting in the kitchen. Her head hurts too.',
          ),
        ],
        weapons: [T('Ei, ei mingit relva. Ma lõin käega.', 'No, no weapon. I hit her with my hand.')],
        direction: [
          T('Ma ei lähe kuhugi. Ma ootan teid siin.', 'I am not going anywhere. I am waiting for you here.'),
        ],
        intoxicated: [T('Ma jõin paar õlut. Ma ei ole purjus.', 'I had a couple of beers. I am not drunk.')],
        safe: [
          T(
            'Ma olen õues, tema on üleval. Ma ei lähe enam üles.',
            'I am outside, she is upstairs. I will not go up again.',
          ),
        ],
        children: [T('Lapsi meil ei ole.', 'We have no children.')],
      },
      answersRu: {
        vehicle: ['Нет, я никуда не поеду. Машина стоит в гараже.'],
        count: ['Мы вдвоём, я и она.'],
        when: ['Только что, минут пять назад.'],
        suspect: ['Это я сам. Я жду на скамейке у дома.'],
        injured: ['У неё губа разбита, она сидит на кухне. И голова у неё болит.'],
        weapons: ['Нет, никакого оружия. Я ударил рукой.'],
        direction: ['Я никуда не ухожу. Я вас здесь жду.'],
        intoxicated: ['Я выпил пару пива. Я не пьяный.'],
        safe: ['Я на улице, она наверху. Я больше наверх не пойду.'],
        children: ['Детей у нас нет.'],
      },
    },
  },
  {
    id: 'dog_at_door',
    title: T('Koduvägivald: koer valvab ust', 'Domestic violence: a dog guarding the door'),
    persons: [
      vic('F', [22, 55]),
      sus('M', [25, 55], 'partner', { intoxicated: 0.8, record: 0.5 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naabri teatel karjub naine appi ja mees ei ava ust. Ukse taga möirgab suur rotveiler, mees ähvardab koera politsei peale lasta.',
        '{address}. A neighbour reports a woman screaming for help and the man refusing to open the door. A big Rottweiler is snarling behind the door and the man threatens to set it on the police.',
      ),
      T(
        '{address}. Korterist kostab löömist ja naise nuttu. Naabri sõnul on peres agressiivne suur koer, kes on varem hammustanud.',
        '{address}. Sounds of blows and a woman crying from the flat. The neighbour says the family has a big aggressive dog that has bitten before.',
      ),
    ],
    callerLines: [
      T(
        'Nad tülitsevad jälle ja koer möirgab ukse taga. Ma ei julge isegi koputada.',
        'They are fighting again and the dog is snarling behind the door. I do not even dare to knock.',
      ),
      T(
        'See koer hammustas eelmisel aastal postiljoni. Mees karjub, et keegi ei tule tema koju.',
        'That dog bit the postman last year. The man is shouting that nobody is coming into his home.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Koer on rotveiler, omanik on mees.',
        'Suspect: {suspect}. The dog is a Rottweiler owned by the man.',
      ),
      T(
        'Koer on varem hammustanud inimest, omavalitsus on sellest teadlik.',
        'The dog has bitten a person before; the municipality knows about it.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.3, reason: T('Kannatanul vigastused', 'Victim injured') }],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: ukse taga on agressiivne suur koer, mees ei võta seda kinni. Naine nutab sees. Kuidas toimime?',
            '{callsign}: there is a big aggressive dog behind the door and the man will not restrain it. The woman is crying inside. How do we proceed?',
          ),
        ],
        [
          opt(
            'talk',
            T('Laske naisel koer tuppa lukustada', 'Get the woman to lock the dog in a room'),
            T(
              '{callsign}, juhtimine. Rääkige läbi ukse, koer tuleb enne sisenemist ära lukustada.',
              '{callsign}, Control. Talk through the door; the dog must be locked away before you go in.',
            ),
            { success: 0.15, time: 8 },
          ),
          opt(
            'force',
            T('Sisenege kohe, kasutage erivahendeid', 'Go in now, use your equipment'),
            T(
              '{callsign}, juhtimine. Sisenege, oht elule. Olge koeraga ettevaatlikud.',
              '{callsign}, Control. Go in, danger to life. Careful with the dog.',
            ),
            { success: 0.05, risk: 0.12 },
          ),
        ],
        'talk',
        { timeoutMin: 3 },
      ),
      qPerson('suspect', 6, { radio: Q_LSV }),
      aggressorChoice(12, [
        T(
          '{callsign}: koer on rõdul kinni, mees rahunes. Naisel on käsivarrel sinikad. Kuidas jätkame?',
          '{callsign}: the dog is shut on the balcony and the man has calmed down. The woman has bruises on her arm. How do we continue?',
        ),
      ]),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Kui koer oli rõdule suletud, peeti mees kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi, naine suunati ohvriabisse.',
          'Once the dog was shut on the balcony, the man was detained and taken to the arrest house. Criminal proceedings were opened under KarS § 121 and the woman was referred to victim support.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'ban',
        'report',
        [0.4, 0.75],
        2,
        T(
          'Mehele kohaldati viibimiskeeld ja ta lahkus koos koeraga oma isa juurde. Alustati kriminaalmenetlust, naisele anti ohvriabi kontaktid.',
          'The man was given a removal order and left with the dog for his father’s place. Criminal proceedings were opened and the woman got victim support contacts.',
        ),
        { trust: 1 },
      ),
      oc(
        'calm',
        'warning',
        [0.2, 0.5],
        2,
        T(
          'Naine keeldus ütlustest ja mees rahunes. Mõlemaid hoiatati, sündmus registreeriti LSV-na ning koera ohtlikkusest teavitati omavalitsust.',
          'The woman declined to give a statement and the man calmed down. Both were warned, the event was logged as domestic and the municipality was told about the dangerous dog.',
        ),
      ),
      oc(
        'bite',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Sisenemisel hammustas koer politseinikku jalast. Mees peeti kinni, politseinik ja naine said arstiabi.',
          'On entry the dog bit an officer on the leg. The man was detained; the officer and the woman received medical care.',
        ),
        { arrests: 1, injuries: 1, trust: -2 },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.25,
      toPriority: 1,
      text: T(
        'Teataja: naine karjub, et mees kägistab teda.',
        'Caller: the woman is screaming that the man is strangling her.',
      ),
    },
    call: {
      mood: 'panic',
      opening: [
        T(
          'Naabrid kaklevad jälle, naine karjub appi, aga ukse taga on nende hull koer!',
          'The neighbours are fighting again and she is screaming for help, but their crazy dog is behind the door!',
        ),
        T(
          'Naine karjub appi, aga mees ei ava ja koer möirgab ukse taga.',
          'The woman is screaming for help, but the man will not open and the dog is snarling behind the door.',
        ),
      ],
      openingRu: [
        'Соседи опять дерутся, она зовёт на помощь, а за дверью их бешеная собака!',
        'Женщина зовёт на помощь, а мужчина не открывает, и собака рычит за дверью.',
      ],
      answers: {
        weapons: [
          T(
            'Relva ma ei tea, aga see koer on hullem kui relv.',
            'I do not know about a weapon, but that dog is worse than a weapon.',
          ),
        ],
        children: [T('Lapsi ei ole, ainult see koer.', 'No children, just that dog.')],
        safe: [
          T(
            'Ma olen oma korteris, ma ei lähe trepikotta.',
            'I am in my flat, I am not going into the stairwell.',
          ),
        ],
      },
      answersRu: {
        weapons: ['Про оружие не знаю, но эта собака хуже любого оружия.'],
        children: ['Детей нет, только эта собака.'],
        safe: ['Я у себя в квартире, в подъезд не выхожу.'],
      },
    },
    tags: ['dog'],
  },
  {
    id: 'elderly_couple',
    title: T('Koduvägivald eakate paari vahel', 'Domestic violence between an elderly couple'),
    persons: [
      vic('F', [68, 86]),
      sus('M', [70, 88], 'partner', { intoxicated: 0.75, record: 0.2 }),
      { role: 'caller', gender: 'any', age: [25, 70], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naabri teatel lööb eakas mees pensionipäeval purjus peaga oma naist kepiga. Naine nutab trepikojas.',
        '{address}. A neighbour reports an elderly man, drunk on pension day, hitting his wife with a walking stick. She is crying in the stairwell.',
      ),
      T(
        '{address}. Eakas naine koputas naabri uksele: mees lõi teda ja ajas korterist välja. Naine on hommikumantlis ja külmetab trepil.',
        '{address}. An elderly woman knocked on a neighbour’s door: her husband hit her and threw her out of the flat. She is in her dressing gown, getting cold on the stairs.',
      ),
    ],
    callerLines: [
      T(
        'Proua on meie juures, käsi on sinine. Vanahärra jõi jälle terve päeva.',
        'The lady is with us and her arm is bruised. The old man has been drinking all day again.',
      ),
      T(
        'Nad on viiskümmend aastat koos olnud. Aga kui ta joob, siis ta lööb.',
        'They have been together fifty years. But when he drinks, he hits her.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Liigub kepiga, joobes.',
        'Suspect: {suspect}. Walks with a stick, intoxicated.',
      ),
      T(
        'Kannatanu on naabri korteris ja keeldub esialgu kiirabist.',
        'The victim is in the neighbour’s flat and so far refuses an ambulance.',
      ),
    ],
    agencies: [
      { agency: 'kiirabi', chance: 0.4, reason: T('Eakal kannatanul vigastused', 'Elderly victim injured') },
      {
        agency: 'kov',
        chance: 0.6,
        reason: T('Eakas paar vajab sotsiaaltöötaja abi', 'The elderly couple need a social worker'),
      },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: naine on naabri juures, vanahärra istub oma korteris diivanil ja sõimab.',
          '{callsign}: the woman is at the neighbour’s; the old man is sitting on the sofa in his flat, swearing.',
        ),
      ]),
      qPerson('suspect', 4, { radio: Q_LSV }),
      agency('kov', 10, {
        radio: [
          T(
            '{callsign}: eakas paar vajab sotsiaaltöötajat, palun teavitage omavalitsust.',
            '{callsign}: the elderly couple need a social worker, please notify the municipality.',
          ),
        ],
      }),
      aggressorChoice(12, [
        T(
          '{callsign}: vanahärra on purjus ja kepp on tal käes, naine ei taha avaldust teha. Kuidas toimime?',
          '{callsign}: the old man is drunk with the stick in his hand; the woman does not want to make a complaint. How do we proceed?',
        ),
      ]),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.65, 1],
        2,
        T(
          'Vanahärra peeti kinni ja kuulati pärast kainenemist üle. Alustati kriminaalmenetlust KarS § 121 järgi, omavalitsust teavitati paari abivajadusest.',
          'The old man was detained and interviewed once sober. Criminal proceedings were opened under KarS § 121 and the municipality was told the couple need support.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'ban',
        'report',
        [0.35, 0.8],
        3,
        T(
          'Mehele kohaldati viibimiskeeld ja ta viidi ööseks poja juurde. Alustati kriminaalmenetlust, sotsiaaltöötaja külastab peret.',
          'The man was given a removal order and driven to his son’s for the night. Criminal proceedings were opened and a social worker will visit the family.',
        ),
        { trust: 1 },
      ),
      oc(
        'slept',
        'warning',
        [0.15, 0.45],
        2,
        T(
          'Vanahärra jäi magama, naine keeldus ütlustest ja jäi naabri juurde ööbima. Sündmus registreeriti LSV-na, info edastati omavalitsusele.',
          'The old man fell asleep; the woman declined to give a statement and stayed the night at the neighbour’s. The event was logged as domestic and passed to the municipality.',
        ),
      ),
      oc(
        'fracture',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Naisel kahtlustati käeluumurdu ja ta toimetati haiglasse. Mees peeti kinni.',
          'The woman was suspected of having a broken arm and was taken to hospital. The man was detained.',
        ),
        { arrests: 1, injuries: 1, trust: -3 },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.15,
      toPriority: 1,
      text: T(
        'Teataja: vanahärra tuli trepikotta ja peksab kepiga naabri ust.',
        'Caller: the old man has come into the stairwell and is beating on the neighbour’s door with his stick.',
      ),
    },
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, naabriproua on meie juures, mees lõi teda kepiga.',
          'Hello, the lady from next door is with us, her husband hit her with his walking stick.',
        ),
        T(
          'Vanahärra jõi pensionipäeval ja lõi oma naist kepiga, proua on nüüd meie juures.',
          'The old man was drinking on pension day and hit his wife with his stick; the lady is with us now.',
        ),
      ],
      openingRu: [
        'Здравствуйте, соседка сейчас у нас, муж ударил её палкой.',
        'Дед напился в день пенсии и ударил жену палкой, она сейчас у нас.',
      ],
      answers: {
        injured: [
          T(
            'Käsivars on sinine ja paistes, ta hoiab seda.',
            'Her arm is bruised and swollen, she is holding it.',
          ),
        ],
        weapons: [T('Kepp, tal on jalutuskepp.', 'A stick, he has a walking stick.')],
        children: [
          T(
            'Ei, nad on kahekesi, lapsed on ammu suured.',
            'No, it is just the two of them, the children grew up long ago.',
          ),
        ],
        safe: [
          T('Jah, proua on meie juures, uks on lukus.', 'Yes, the lady is with us and the door is locked.'),
        ],
        intoxicated: [
          T('Jah, pensionipäev oli, ta jõi terve päeva.', 'Yes, it was pension day, he drank all day.'),
        ],
      },
      answersRu: {
        injured: ['Рука вся синяя и опухла, она её держит.'],
        weapons: ['Палка, у него трость.'],
        children: ['Нет, они вдвоём живут, дети давно взрослые.'],
        safe: ['Да, соседка у нас, дверь закрыта.'],
        intoxicated: ['Да, день пенсии был, он весь день пил.'],
      },
    },
    tags: ['elderly'],
  },
  {
    id: 'both_injured',
    title: T('Koduvägivald: mõlemad osapooled vigastatud', 'Domestic violence: both parties injured'),
    persons: [
      vic('F', [22, 55], { intoxicated: 0.7 }),
      sus('M', [25, 58], 'partner', { intoxicated: 0.85, record: 0.5 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naabri teatel kaklevad elukaaslased korteris, mõlemad veritsevad. Naine lõi mehele pudeliga pähe, kui mees haaras tal kõrist.',
        '{address}. A neighbour reports partners fighting in a flat, both bleeding. The woman hit the man over the head with a bottle when he grabbed her by the throat.',
      ),
      T(
        '{address}. Joobes paar kakleb trepikojas ja mõlemad süüdistavad teineteist. Mehe pea veritseb, naine hoiab kätt kaelal.',
        '{address}. A drunk couple is fighting in the stairwell, each blaming the other. The man’s head is bleeding and the woman is holding her neck.',
      ),
    ],
    callerLines: [
      T(
        'Nad mõlemad karjuvad ja trepil on verd. Ma ei saa aru, kes keda lõi.',
        'They are both screaming and there is blood on the stairs. I cannot tell who hit whom.',
      ),
      T(
        'Kõigepealt karjus naine, et ta kägistab teda, siis purunes pudel ja nüüd karjub mees.',
        'First she screamed that he was strangling her, then a bottle smashed and now he is the one screaming.',
      ),
    ],
    details: [
      T('Mõlemad osapooled on tugevas joobes.', 'Both parties are heavily intoxicated.'),
      T('Mees: {suspect}. Peahaav, veritseb.', 'The man: {suspect}. Head wound, bleeding.'),
    ],
    agencies: [
      { agency: 'kiirabi', chance: 0.9, reason: T('Mõlemal osapoolel vigastused', 'Both parties injured') },
    ],
    beats: [
      kiirabi('arrive', {
        radio: [
          T(
            '{callsign}: mõlemad vigastatud, mehel peahaav ja naisel kaelal jäljed. Palun kiirabi.',
            '{callsign}: both injured; the man has a head wound and the woman has marks on her neck. Request an ambulance.',
          ),
        ],
      }),
      backup(0.2, un('patrol'), {
        radio: [
          T(
            '{callsign}: kaks agressiivset osapoolt, ei suuda neid lahus hoida. Vajame lisapatrulli!',
            '{callsign}: two aggressive parties and we cannot keep them apart. We need another patrol!',
          ),
        ],
      }),
      choice(
        6,
        [
          T(
            '{callsign}: mõlemad süüdistavad teineteist. Mees kägistas, naine lõi pudeliga. Keda peame kinni?',
            '{callsign}: they blame each other. He strangled her, she hit him with a bottle. Who do we detain?',
          ),
        ],
        [
          opt(
            'man',
            T(
              'Pidage kinni mees, naise tegu hinnata hädakaitsena',
              'Detain the man, assess her act as self-defence',
            ),
            T(
              '{callsign}, juhtimine. Pidage kinni mees, naise tegevust hinnatakse menetluses.',
              '{callsign}, Control. Detain the man; the woman’s actions will be assessed in the proceedings.',
            ),
            { success: 0.15, arrests: 1, time: 20 },
          ),
          opt(
            'both',
            T('Pidage kinni mõlemad', 'Detain both'),
            T(
              '{callsign}, juhtimine. Pidage kinni mõlemad, asjaolud selgitame hiljem.',
              '{callsign}, Control. Detain both, we will establish the facts later.',
            ),
            { success: 0.05, arrests: 2, time: 30, trust: -1 },
          ),
          opt(
            'none',
            T('Kedagi kinni ei pea, võtke seletused', 'No detention, take statements'),
            T(
              '{callsign}, juhtimine. Võtke seletused ja eraldage nad.',
              '{callsign}, Control. Take statements and separate them.',
            ),
            { success: -0.2, trust: -2 },
          ),
        ],
        'man',
      ),
    ],
    outcomes: [
      oc(
        'man',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees peeti kinni pärast haava õmblemist EMO-s. Alustati kriminaalmenetlust KarS § 121 järgi, naise tegu hinnatakse hädakaitsena. Naine suunati ohvriabisse.',
          'The man was detained after his wound was stitched at A&E. Criminal proceedings were opened under KarS § 121 and the woman’s act is being assessed as self-defence. She was referred to victim support.',
        ),
        { arrests: 1, injuries: 2, trust: 2 },
      ),
      oc(
        'both',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Pärast arstiabi toimetati mõlemad kainenema. Kriminaalmenetlus alustati mõlema suhtes, asjaolud selgitatakse ülekuulamistel.',
          'After medical treatment both were taken to sober up. Proceedings were opened against both and the facts will be established in interviews.',
        ),
        { injuries: 2 },
      ),
      oc(
        'serious',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Mehe peahaav osutus raskeks ja ta toimetati haiglasse. Naine peeti kinni, menetlus jätkub.',
          'The man’s head wound turned out to be serious and he was taken to hospital. The woman was detained; proceedings continue.',
        ),
        { arrests: 1, injuries: 2, trust: -2 },
      ),
    ],
    escalation: {
      afterMin: 10,
      chance: 0.3,
      toPriority: 1,
      text: T(
        'Teataja: mees ei liiguta enam, lamab trepil.',
        'Caller: the man has stopped moving and is lying on the stairs.',
      ),
    },
    call: {
      mood: 'panic',
      opening: [
        T(
          'Naabrid kaklevad trepikojas, mõlemad on verised!',
          'The neighbours are fighting in the stairwell and they are both covered in blood!',
        ),
        T(
          'Ta kägistas naist ja naine lõi talle pudeliga pähe. Mõlemad veritsevad.',
          'He was strangling her and she hit him over the head with a bottle. They are both bleeding.',
        ),
      ],
      openingRu: [
        'Соседи дерутся в подъезде, оба в крови!',
        'Он её душил, а она ударила его бутылкой по голове. Оба в крови.',
      ],
      answers: {
        injured: [
          T(
            'Mõlemad! Mehel jookseb peast verd, naine köhib ja hoiab kaela.',
            'Both! Blood is running from his head, and she is coughing and holding her neck.',
          ),
        ],
        weapons: [
          T(
            'Klaasikilde on igal pool, keegi lõi pudeliga.',
            'There is broken glass everywhere, somebody used a bottle.',
          ),
        ],
        count: [T('Kaks, mees ja naine.', 'Two, the man and the woman.')],
        intoxicated: [T('Mõlemad on purjus.', 'They are both drunk.')],
        children: [T('Ei, lapsi seal ei ole.', 'No, there are no children there.')],
      },
      answersRu: {
        injured: ['Оба! У мужика кровь из головы течёт, а она кашляет и держится за шею.'],
        weapons: ['Везде осколки, кто-то ударил бутылкой.'],
        count: ['Двое, мужчина и женщина.'],
        intoxicated: ['Оба пьяные.'],
        children: ['Нет, детей там нет.'],
      },
    },
    tags: ['injury'],
  },
  {
    id: 'video_call_friend',
    title: T('Koduvägivald: sõbranna nägi videokõnes', 'Domestic violence: a friend saw it on a video call'),
    persons: [
      vic('F', [20, 45]),
      sus('M', [22, 50], 'partner', { intoxicated: 0.75, record: 0.4 }),
      { role: 'caller', gender: 'F', age: [20, 45], relation: 'friend' },
    ],
    summary: [
      T(
        '{address}. Teataja oli sõbrannaga videokõnes, kui koju jõudis purjus elukaaslane ja hakkas naist lööma. Kõne katkes, sõbranna ei saa enam ühendust.',
        '{address}. The caller was on a video call with her friend when the friend’s drunk partner came home and started hitting her. The call cut off and the caller cannot reach her any more.',
      ),
      T(
        '{address}. Helistab naise sõbranna teisest linnast: nägi videokõnes, kuidas mees tiris naise juustest kaamera eest ära. Pärast seda keegi ei vasta.',
        '{address}. A friend calling from another town saw on a video call how a man dragged the woman away from the camera by her hair. Nobody has answered since.',
      ),
    ],
    callerLines: [
      T(
        'Me rääkisime videos, siis tuli ta koju ja hakkas karjuma. Ma nägin, kuidas ta teda lõi, ja siis läks pilt mustaks.',
        'We were talking on video, then he came home and started shouting. I saw him hit her and then the screen went black.',
      ),
      T(
        'Ma olen teises linnas, ma ei saa ise minna. Palun minge kohe vaatama, ta ei vasta telefonile.',
        'I am in another town, I cannot go myself. Please go and check right now, she is not answering her phone.',
      ),
    ],
    details: [
      T(
        'Teataja ei ole sündmuskohal, info videokõne põhjal.',
        'The caller is not at the scene; the information comes from the video call.',
      ),
      T(
        'Kahtlustatav: {suspect}. Teataja sõnul on mees varem naise telefoni ära võtnud.',
        'Suspect: {suspect}. The caller says he has taken the woman’s phone away before.',
      ),
    ],
    agencies: [
      {
        agency: 'kiirabi',
        chance: 0.35,
        reason: T('Kannatanul võimalikud vigastused', 'Victim possibly injured'),
      },
    ],
    beats: [
      doorChoice('arrive'),
      info(3, [
        T(
          '{callsign}: naine on sees, nägu paistes ja telefon katki. Mees istub köögis ja eitab kõike.',
          '{callsign}: the woman is inside with a swollen face and a smashed phone. The man is sitting in the kitchen denying everything.',
        ),
      ]),
      qPerson('suspect', 5, { radio: Q_LSV }),
      toArrest(14, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Mees peeti kinni ja toimetati arestimajja. Sõbranna salvestatud kuvatõmmis videokõnest lisati tõendina, alustati kriminaalmenetlust KarS § 121 järgi.',
          'The man was detained and taken to the arrest house. A screenshot of the video call saved by the friend was added as evidence; criminal proceedings were opened under KarS § 121.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'ban',
        'report',
        [0.35, 0.75],
        3,
        T(
          'Mehele kohaldati viibimiskeeld ja ta lahkus korterist. Alustati kriminaalmenetlust, naine suunati ohvriabisse ja sõbranna lubas ta enda juurde võtta.',
          'The man was given a removal order and left the flat. Criminal proceedings were opened, the woman was referred to victim support and her friend offered to take her in.',
        ),
        { trust: 1 },
      ),
      oc(
        'neighbour',
        'warning',
        [0.2, 0.5],
        2,
        T(
          'Selgus, et naine oli juba naabri juurde põgenenud ja ei soovinud avaldust teha. Meest hoiatati, sündmus registreeriti LSV-na.',
          'It turned out the woman had already fled to a neighbour and did not want to make a complaint. The man was warned and the event logged as domestic.',
        ),
      ),
      oc(
        'late',
        'hospital',
        [0, 0.25],
        2,
        T(
          'Uks murti lahti ja naine leiti teadvusel, kuid peavigastusega. Ta toimetati haiglasse, mees peeti kinni.',
          'The door was forced and the woman was found conscious but with a head injury. She was taken to hospital and the man was detained.',
        ),
        { arrests: 1, injuries: 1, trust: -3 },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.25,
      toPriority: 1,
      text: T(
        'Teataja: sõbranna saatis sõnumi "appi", rohkem ta ei vasta.',
        'Caller: her friend sent a message saying "help" and has not answered since.',
      ),
    },
    call: {
      mood: 'panic',
      opening: [
        T(
          'Ma olin sõbrannaga videokõnes ja tema mees hakkas teda peksma! Nüüd ta ei vasta!',
          'I was on a video call with my friend and her husband started beating her! Now she is not answering!',
        ),
        T(
          'Ma nägin videos, kuidas ta teda lõi, ja siis läks pilt mustaks. Ta ei vasta enam.',
          'I saw him hit her on the video and then the screen went black. She is not answering any more.',
        ),
      ],
      openingRu: [
        'Я говорила с подругой по видео, и её муж начал её бить! Теперь она не отвечает!',
        'Я видела по видео, как он её ударил, потом экран погас. Она больше не отвечает.',
      ],
      answers: {
        where: [
          T(
            'Tema aadress on {address}. Mina olen teises linnas.',
            'Her address is {address}. I am in another town.',
          ),
        ],
        safe: [T('Mina olen kodus, aga tema ei ole ohutus kohas!', 'I am at home, but she is not safe!')],
        suspect: [T('{suspect}. Ta on tema elukaaslane.', '{suspect}. He is her partner.')],
        children: [T('Lapsi neil ei ole.', 'They have no children.')],
        intoxicated: [
          T('Ta tuli baarist, see oli kohe näha.', 'He came from the bar, you could see it straight away.'),
        ],
        weapons: [T('Ma nägin ainult, et ta lõi käega.', 'I only saw him hit her with his hand.')],
      },
      answersRu: {
        where: ['Её адрес: {address}. Я сама в другом городе.'],
        safe: ['Я дома, а вот она не в безопасности!'],
        suspect: ['{suspect}. Это её сожитель.'],
        children: ['Детей у них нет.'],
        intoxicated: ['Он пришёл из бара, это сразу было видно.'],
        weapons: ['Я только видела, что он бил рукой.'],
      },
    },
  },
];

// ── domestic_partner_assault ────────────────────────────────────────────────
const SC_PARTNER_ASSAULT: IncidentScenario[] = [
  {
    id: 'phone_jealousy',
    title: T(
      'Lähisuhtevägivald: naine lukustas end vannituppa',
      'Domestic violence: woman locked in the bathroom',
    ),
    persons: [
      vic('F', [20, 55]),
      sus('M', [22, 60], 'partner', { intoxicated: 0.8, record: 0.5, restraining: 0.08 }),
    ],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab sosinal, et elukaaslane leidis tema telefonist sõnumid, lõi teda ja peksab nüüd vannitoa ust. Mees joobes.',
        '{address}. A woman reports in a whisper that her partner found messages on her phone, hit her and is now pounding on the bathroom door. The man is drunk.',
      ),
      T(
        '{address}. Kannatanu on end vannituppa lukustanud: mees süüdistab teda petmises ja lubab ukse maha lõhkuda. Naisel ninaverejooks.',
        '{address}. The victim has locked herself in the bathroom: the man accuses her of cheating and says he will break the door down. She has a nosebleed.',
      ),
    ],
    callerLines: [
      T(
        '(sosinal) Ta luges mu telefoni ja läks hulluks. Ma olen vannitoas, ta peksab ust.',
        '(whispering) He read my phone and went mad. I am in the bathroom and he is pounding on the door.',
      ),
      T(
        '(sosinal) Need olid ainult töökaaslase sõnumid... ta ei kuula. Palun kiiresti.',
        '(whispering) They were just messages from a colleague... he will not listen. Please hurry.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Aadressil on 12 kuu jooksul olnud kaks LSV-väljakutset.',
        'Suspect: {suspect}. Two domestic call-outs at this address in the last 12 months.',
      ),
      T('Kannatanul ninaverejooks, teadvusel.', 'The victim has a nosebleed and is conscious.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.4, reason: T('Näovigastus', 'Facial injury') }],
    beats: [
      qPerson('suspect', 'arrive', { radio: Q_LSV }),
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
          '{callsign}: mees on rahunenud ja vabandab, naise telefon on katki visatud. Naine kardab. Kuidas toimime?',
          '{callsign}: the man has calmed down and is apologising; the woman’s phone has been smashed. She is afraid. How do we proceed?',
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
          'Mees peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi, purustatud telefon võeti asitõendiks ja täideti riskihindamise küsimustik.',
          'The man was detained and taken to the arrest house. Criminal proceedings were opened under KarS § 121, the smashed phone was taken as evidence and a risk assessment questionnaire was completed.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'ban',
        'report',
        [0.4, 0.75],
        3,
        T(
          'Mehele kohaldati 72-tunnine viibimiskeeld ja ta lahkus sõbra juurde. Alustati kriminaalmenetlust, naine suunati ohvriabisse.',
          'The man was given a 72-hour removal order and went to a friend’s. Criminal proceedings were opened and the woman was referred to victim support.',
        ),
        { trust: 1 },
      ),
      oc(
        'fled',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees murdis vannitoa ukse lahti ja lahkus enne patrulli saabumist. Naine toimetati EMO-sse, mees kuulutati tagaotsitavaks.',
          'The man broke the bathroom door open and left before the patrol arrived. The woman was taken to A&E and the man is now wanted.',
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
        'ERC: the call dropped; the last thing heard was the door being broken.',
      ),
    },
    call: {
      mood: 'whisper',
      opening: [
        T(
          '(sosinal) Palun... mu mees lõi mind. Ma olen vannitoas.',
          '(whispering) Please... my husband hit me. I am in the bathroom.',
        ),
        T(
          '(sosinal) Ta luges mu telefoni ja lõi mind. Nüüd peksab ta vannitoa ust.',
          '(whispering) He read my phone and hit me. Now he is pounding on the bathroom door.',
        ),
      ],
      openingRu: [
        '(шёпотом) Он меня ударил... я закрылась в ванной, он ломает дверь.',
        '(шёпотом) Он прочитал мой телефон и ударил меня. Теперь ломает дверь в ванную.',
      ],
      answers: {
        injured: [T('Nina veritseb, silm on paistes.', 'My nose is bleeding and my eye is swollen.')],
        weapons: [T('Ma ei tea... köögis on noad.', 'I do not know... there are knives in the kitchen.')],
        safe: [T('Uks on lukus, aga ta peksab seda.', 'The door is locked, but he is hitting it.')],
        children: [T('Lapsi meil ei ole.', 'We have no children.')],
        intoxicated: [T('Ta on joonud terve õhtu.', 'He has been drinking all evening.')],
      },
      answersRu: {
        injured: ['Из носа кровь идёт, и глаз опух.'],
        weapons: ['Не знаю... на кухне ножи.'],
        safe: ['Дверь заперта, но он в неё колотит.'],
        children: ['Детей у нас нет.'],
        intoxicated: ['Он весь вечер пил.'],
      },
    },
    tags: ['jealousy'],
  },
  {
    id: 'left_on_foot',
    title: T('Lähisuhtevägivald: mees lahkus jalgsi', 'Domestic violence: the man left on foot'),
    persons: [vic('F', [20, 55]), sus('M', [22, 60], 'partner', { intoxicated: 0.5, record: 0.45 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et elukaaslane lõi teda tüli käigus rusikaga ja lahkus jalgsi, kui naine ütles, et helistab politseisse. Mees võib olla lähedal.',
        '{address}. A woman reports her partner punched her during a row and left on foot when she said she was calling the police. He may still be nearby.',
      ),
      T(
        '{address}. Tüli tekkis rahast: mees oli kaotanud palga mänguautomaatides. Ta lõi naist ja lahkus umbes kümme minutit tagasi.',
        '{address}. The row was about money: the man had lost his wages on slot machines. He hit the woman and left about ten minutes ago.',
      ),
    ],
    callerLines: [
      T(
        'Ta lõi mind ja jooksis minema, kui ma telefoni võtsin. Ta ei saa kaugel olla.',
        'He hit me and ran off when I picked up the phone. He cannot be far.',
      ),
      T(
        'Kogu palk on läinud, kõik automaatidesse. Kui ma küsisin, siis ta lõi.',
        'The whole salary is gone, all into the slot machines. When I asked about it, he hit me.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Lahkus jalgsi {direction}.',
        'Suspect: {suspect}. Left on foot {direction}.',
      ),
      T(
        'Kannatanul on silm paistes, kiirabi ta esialgu ei soovi.',
        'The victim has a swollen eye and does not want an ambulance for now.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.25, reason: T('Näovigastus', 'Facial injury') }],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal. Naisel silm paistes, mees lahkus jalgsi umbes veerand tundi tagasi. Saime kirjelduse.',
          '{callsign}: on scene. The woman has a swollen eye; the man left on foot about a quarter of an hour ago. We have a description.',
        ),
      ]),
      qPerson('suspect', 3, { radio: Q_LSV }),
      search(5, 1.5, [
        T(
          '{callsign}: kahtlustatav liigub jalgsi, kammime lähiümbruse läbi.',
          '{callsign}: the suspect is on foot, we are sweeping the immediate area.',
        ),
      ]),
    ],
    outcomes: [
      oc(
        'caught',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Mees leiti lähedalt kioski juurest ja peeti kinni. Alustati kriminaalmenetlust KarS § 121 järgi, naisele anti ohvriabi ja võlanõustamise kontaktid.',
          'The man was found near a kiosk close by and detained. Criminal proceedings were opened under KarS § 121; the woman was given victim support and debt counselling contacts.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'walked_in',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Meest kohe ei leitud, kuid ta tuli öösel ise jaoskonda. Alustati kriminaalmenetlust ja mehele kohaldati viibimiskeeld.',
          'The man was not found straight away, but he walked into the station himself during the night. Criminal proceedings were opened and he was given a removal order.',
        ),
        { trust: 1 },
      ),
      oc(
        'wanted',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Meest ei leitud. Alustati kriminaalmenetlust, mees kuulutati tagaotsitavaks ja naine ööbis õe juures.',
          'The man was not found. Proceedings were opened, he was put on the wanted list and the woman stayed the night at her sister’s.',
        ),
        { trust: -2 },
      ),
    ],
    escalation: {
      afterMin: 20,
      chance: 0.2,
      toPriority: 1,
      text: T(
        'Teataja: mees on tagasi ja proovib ust lahti murda.',
        'Caller: the man is back and trying to break the door open.',
      ),
    },
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mu mees lõi mind ja jooksis minema, kui ma ütlesin, et helistan politseisse!',
          'My husband hit me and ran off when I said I was calling the police!',
        ),
        T(
          'Ta lõi mind rusikaga ja läks jala minema. Ta ei saa kaugel olla.',
          'He punched me and walked off. He cannot be far.',
        ),
      ],
      openingRu: [
        'Муж ударил меня и убежал, когда я сказала, что звоню в полицию!',
        'Он ударил меня кулаком и ушёл пешком. Он не мог далеко уйти.',
      ],
      answers: {
        direction: [T('Ta läks jala, {direction}.', 'He left on foot, {direction}.')],
        safe: [T('Jah, ta on läinud. Ma panin ukse ketti.', 'Yes, he is gone. I put the chain on the door.')],
        injured: [T('Silm läheb kinni, aga ma saan hakkama.', 'My eye is swelling shut, but I will manage.')],
        weapons: [T('Ei, ta lõi rusikaga.', 'No, he punched me.')],
        children: [T('Ei, me oleme kahekesi.', 'No, it is just the two of us.')],
        intoxicated: [
          T('Natuke, aga ta oli pigem vihane kui purjus.', 'A little, but he was more angry than drunk.'),
        ],
      },
      answersRu: {
        direction: ['Он ушёл пешком, {direction}.'],
        safe: ['Да, он ушёл. Я закрыла дверь на цепочку.'],
        injured: ['Глаз заплывает, но я справлюсь.'],
        weapons: ['Нет, он ударил кулаком.'],
        children: ['Нет, мы вдвоём.'],
        intoxicated: ['Немного, но он был скорее злой, чем пьяный.'],
      },
    },
    tags: ['fled'],
  },
  {
    id: 'sitting_in_car',
    title: T('Lähisuhtevägivald: mees istub autos', 'Domestic violence: the man is sitting in his car'),
    persons: [
      vic('F', [20, 55]),
      sus('M', [22, 60], 'partner', { intoxicated: 0.9, record: 0.4, noLicense: 0.15 }),
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et elukaaslane lõi teda kojusõidul autos. Naine jooksis tuppa, mees istub joobes peaga maja ees autos ja mootor töötab.',
        '{address}. A woman reports her partner hit her in the car on the way home. She ran inside; the man is sitting drunk in the car outside the building with the engine running.',
      ),
      T(
        '{address}. Mees lõi naist ja istub nüüd hoovis autos. Sõiduk: {car}, reg nr {plate}. Naine kardab, et mees sõidab purjus peaga minema.',
        '{address}. A man hit a woman and is now sitting in a car in the yard. Vehicle: {car}, plate {plate}. She is afraid he will drive off drunk.',
      ),
    ],
    callerLines: [
      T(
        'Ta lõi mind autos ja ma jooksin tuppa. Ta istub ikka veel all autos, mootor käib.',
        'He hit me in the car and I ran inside. He is still sitting down there in the car with the engine running.',
      ),
      T(
        'Ta on purjus, ta ei tohi sõita! Ta ütles, et sõidab ennast puruks.',
        'He is drunk, he must not drive! He said he would drive himself into a wall.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}.', 'Suspect: {suspect}.'),
      T('Sõiduk: {car}, reg nr {plate}. Mootor töötab.', 'Vehicle: {car}, plate {plate}. Engine running.'),
    ],
    agencies: [],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: mees istub roolis, mootor töötab, tugev alkoholilõhn. Kas võtame võtmed kohe ära või räägime temaga?',
            '{callsign}: the man is at the wheel with the engine running and smells strongly of alcohol. Do we take the keys right away or talk to him?',
          ),
        ],
        [
          opt(
            'keys',
            T('Võtke võtmed, kõrvaldage ta roolist', 'Take the keys, get him out from behind the wheel'),
            T(
              '{callsign}, juhtimine. Võtke võtmed ja kõrvaldage ta sõidukist.',
              '{callsign}, Control. Take the keys and get him out of the vehicle.',
            ),
            { success: 0.15, risk: 0.03 },
          ),
          opt(
            'talk',
            T('Rääkige, laske tal ise välja tulla', 'Talk him out of the car'),
            T(
              '{callsign}, juhtimine. Proovige rahulikult, ärge laske tal minema sõita.',
              '{callsign}, Control. Try calmly, do not let him drive off.',
            ),
            { time: 6, success: -0.05 },
          ),
        ],
        'keys',
        { timeoutMin: 3 },
      ),
      qVehicle(3),
      qPerson('suspect', 5, { radio: Q_LSV }),
      toArrest(14, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees kõrvaldati roolist ja peeti kinni, alkomeeter näitas tugevat joovet. Alustati kriminaalmenetlust KarS § 121 järgi, auto jäeti lukustatult parklasse.',
          'The man was removed from the wheel and detained; the breathalyser showed heavy intoxication. Criminal proceedings were opened under KarS § 121 and the car was left locked in the car park.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'drove',
        'report',
        [0.25, 0.6],
        2,
        T(
          'Mees jõudis hoovist välja sõita, kuid peeti lähedal kinni. Alustati menetlust kehalise väärkohtlemise ja joobes juhtimise eest (KarS § 121 ja § 424).',
          'The man managed to drive out of the yard but was stopped nearby. Proceedings were opened for assault and drink-driving (KarS § 121 and § 424).',
        ),
        { arrests: 1 },
      ),
      oc(
        'gone',
        'escaped',
        [0, 0.3],
        2,
        T(
          'Mees sõitis minema enne patrulli saabumist. Sõiduk kuulutati otsitavaks, naine ööbis tuttava juures.',
          'The man drove off before the patrol arrived. The car was put out on a lookout notice and the woman stayed at a friend’s.',
        ),
        { trust: -3 },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.3,
      toPriority: 1,
      text: T(
        'Teataja: mees sõitis hoovist välja ja kihutab minema.',
        'Caller: the man has driven out of the yard and is speeding off.',
      ),
    },
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mu mees lõi mind autos, nüüd istub ta purjus peaga all autos ja mootor käib!',
          'My husband hit me in the car, now he is sitting drunk in the car downstairs with the engine running!',
        ),
        T(
          'Ta lõi mind kojusõidul autos. Nüüd istub ta all autos ja on täiesti purjus.',
          'He hit me in the car on the way home. Now he is sitting in the car downstairs, completely drunk.',
        ),
      ],
      openingRu: [
        'Муж ударил меня в машине, теперь сидит пьяный внизу в машине, мотор работает!',
        'Он ударил меня в машине по дороге домой. Теперь сидит внизу в машине, совсем пьяный.',
      ],
      answers: {
        vehicle: [
          T(
            '{car}, number {plate}. See seisab maja ees.',
            '{car}, plate {plate}. It is parked outside the building.',
          ),
        ],
        direction: [
          T(
            'Ta on veel all autos. Aga ta võib iga hetk minema sõita!',
            'He is still down in the car. But he could drive off any moment!',
          ),
        ],
        safe: [T('Ma olen kodus, uks on lukus.', 'I am at home and the door is locked.')],
        intoxicated: [
          T(
            'Jah, ta jõi sünnipäeval, ta ei tohiks rooli minna.',
            'Yes, he was drinking at a birthday party, he should not be driving.',
          ),
        ],
        injured: [T('Põsk valutab ja huul on katki.', 'My cheek hurts and my lip is split.')],
        children: [T('Lapsi meil ei ole.', 'We have no children.')],
      },
      answersRu: {
        vehicle: ['{car}, номер {plate}. Стоит перед домом.'],
        direction: ['Он ещё внизу в машине. Но он в любую секунду может уехать!'],
        safe: ['Я дома, дверь закрыта.'],
        intoxicated: ['Да, он пил на дне рождения, ему нельзя за руль.'],
        injured: ['Щека болит, и губа разбита.'],
        children: ['Детей у нас нет.'],
      },
    },
  },
  {
    id: 'custody_handover',
    title: T('Lähisuhtevägivald lapse üleandmisel', 'Domestic violence at a child handover'),
    persons: [
      vic('F', [24, 45]),
      sus('M', [26, 50], 'ex_partner', { intoxicated: 0.65, record: 0.4, restraining: 0.05 }),
    ],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et endine elukaaslane tõi lapse kokkulepitust kolm tundi hiljem tagasi, oli joobes ja lõi naist ukse peal, kui too teda sisse ei lasknud. Laps nägi pealt.',
        '{address}. A woman reports her ex-partner brought their child back three hours late, drunk, and hit her at the door when she would not let him in. The child saw it.',
      ),
      T(
        '{address}. Lapse üleandmisel läks endiste elukaaslaste vahel tüliks, mees tõukas naist ja lõi teda. Mees on trepikojas ja nõuab last tagasi.',
        '{address}. A child handover between ex-partners turned into a row; the man shoved the woman and hit her. He is in the stairwell demanding the child back.',
      ),
    ],
    callerLines: [
      T(
        'Ta tõi poja kolm tundi hiljem ja oli purjus. Kui ma ütlesin, et ta sisse ei tule, lõi ta mind.',
        'He brought our son back three hours late and he was drunk. When I said he was not coming in, he hit me.',
      ),
      T(
        'Ta karjub trepikojas, et võtab lapse endaga kaasa. Laps nutab mu süles.',
        'He is shouting in the stairwell that he will take the child with him. The child is crying in my arms.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}, lapse isa. Suhtluskord on määratud kohtus.',
        'Suspect: {suspect}, the child’s father. Contact arrangements were set by a court.',
      ),
      T('Kohal on 5-aastane laps.', 'A 5-year-old child is present.'),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 0.8,
        reason: T('Laps oli vägivalla tunnistaja', 'A child witnessed the violence'),
      },
      { agency: 'kiirabi', chance: 0.2, reason: T('Kannatanul vigastused', 'Victim injured') },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: isa on trepikojas, rahutu, nõuab last. Ema ja laps on korteris.',
          '{callsign}: the father is in the stairwell, agitated, demanding the child. Mother and child are in the flat.',
        ),
      ]),
      qPerson('suspect', 3, { radio: Q_LSV }),
      agency('sotsiaal', 8, {
        radio: [
          T(
            '{callsign}: laps nägi vägivalda pealt, palun teavitage lastekaitset.',
            '{callsign}: the child witnessed the violence, please notify child protection.',
          ),
        ],
      }),
      toArrest(14, { chance: 0.55 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Isa peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi, lastekaitset teavitati suhtluskorra ülevaatamiseks.',
          'The father was detained and taken to the arrest house. Criminal proceedings were opened under KarS § 121 and child protection was notified so the contact arrangements can be reviewed.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'left',
        'report',
        [0.3, 0.65],
        3,
        T(
          'Isa lahkus patrulli korraldusel. Alustati kriminaalmenetlust, emale selgitati lähenemiskeelu taotlemise võimalust ja anti ohvriabi kontaktid.',
          'The father left on the patrol’s orders. Criminal proceedings were opened; the mother was told how to apply for a restraining order and given victim support contacts.',
        ),
        { trust: 1 },
      ),
      oc(
        'took_child',
        'escaped',
        [0, 0.3],
        2,
        T(
          'Isa haaras enne patrulli saabumist lapse ja sõitis minema. Laps leiti tunni aja pärast vanaema juurest, isa jäi tabamata.',
          'Before the patrol arrived the father grabbed the child and drove off. The child was found an hour later at the grandmother’s; the father was not found.',
        ),
        { trust: -3 },
      ),
    ],
    escalation: {
      afterMin: 12,
      chance: 0.25,
      toPriority: 1,
      text: T(
        'Teataja: mees haaras lapse ja tirib teda trepist alla.',
        'Caller: the man has grabbed the child and is dragging him down the stairs.',
      ),
    },
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mu endine mees tõi lapse tagasi ja lõi mind! Ta on purjus ja tahab last ära viia!',
          'My ex brought our son back and hit me! He is drunk and wants to take the child away!',
        ),
        T(
          'Ta tõi poja kolm tundi hiljem, purjus peaga, ja lõi mind ukse peal.',
          'He brought our son back three hours late, drunk, and hit me at the door.',
        ),
      ],
      openingRu: [
        'Бывший муж привёз ребёнка и ударил меня! Он пьяный и хочет забрать сына!',
        'Он привёз сына на три часа позже, пьяный, и ударил меня в дверях.',
      ],
      answers: {
        children: [T('Jah, poeg on minuga, ta on viiene.', 'Yes, my son is with me, he is five.')],
        suspect: [T('{suspect}. See on lapse isa.', '{suspect}. It is the child’s father.')],
        safe: [
          T(
            'Me oleme korteris, uks on lukus. Tema on trepil.',
            'We are in the flat with the door locked. He is on the stairs.',
          ),
        ],
        intoxicated: [T('Jah, ta haiseb viina järele.', 'Yes, he reeks of vodka.')],
        weapons: [T('Ei, ta lõi lahtise käega.', 'No, he slapped me.')],
      },
      answersRu: {
        children: ['Да, сын со мной, ему пять лет.'],
        suspect: ['{suspect}. Это отец ребёнка.'],
        safe: ['Мы в квартире, дверь закрыта. Он на лестнице.'],
        intoxicated: ['Да, от него водкой несёт.'],
        weapons: ['Нет, он ударил ладонью.'],
      },
    },
    tags: ['children'],
  },
  {
    id: 'woman_hit_man',
    title: T('Lähisuhtevägivald: naine lõi meest', 'Domestic violence: a woman hit her partner'),
    persons: [
      vic('M', [25, 60], { intoxicated: 0.9 }),
      sus('F', [23, 58], 'partner', { intoxicated: 0.05, record: 0.1 }),
    ],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Mees teatab, et elukaaslane lõi teda praepanniga pähe, kui ta lubadusest hoolimata purjus peaga koju tuli. Mehel on peas haav.',
        '{address}. A man reports his partner hit him on the head with a frying pan when he came home drunk despite his promise not to drink. He has a head wound.',
      ),
      T(
        '{address}. Mees helistab vannitoast: naine viskab teda nõudega ja kriimustas küüntega nägu. Naine karjub, et mees on kõik ära joonud.',
        '{address}. A man is calling from the bathroom: his partner is throwing dishes at him and clawed his face. She is shouting that he has drunk everything away.',
      ),
    ],
    callerLines: [
      T(
        'Jah, ma tean, ma lubasin, et ei joo. Aga ta lõi mind praepanniga pähe ja veri jookseb.',
        'Yes, I know, I promised I would not drink. But she hit me on the head with a frying pan and I am bleeding.',
      ),
      T(
        'Mul on piinlik helistada, aga ta on täiesti endast väljas ja viskab taldrikuid.',
        'I am embarrassed to call, but she has completely lost it and is throwing plates.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}, kannatanu elukaaslane.', 'Suspect: {suspect}, the victim’s partner.'),
      T('Kannatanu on joobes, peas lõikehaav.', 'The victim is intoxicated and has a cut on his head.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.6, reason: T('Peahaav', 'Head wound') }],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal. Mehel peas lõikehaav, naine on köögis ja nutab. Pann on põrandal.',
          '{callsign}: on scene. The man has a cut on his head and the woman is crying in the kitchen. The pan is on the floor.',
        ),
      ]),
      kiirabi(2, {
        chance: 0.6,
        radio: [
          T(
            '{callsign}: mehe peahaav vajab õmblemist, palun kiirabi.',
            '{callsign}: the man’s head wound needs stitches, request an ambulance.',
          ),
        ],
      }),
      qPerson('suspect', 5, {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Palun kontrolli naist {name}, isikukood {idcode}. Kas varasemaid sündmusi on?',
            'Control, {callsign}. Please check the woman {name}, ID code {idcode}. Any previous incidents?',
          ),
        ],
      }),
      aggressorChoice(
        10,
        [
          T(
            '{callsign}: naine on rahunenud ja kahetseb, mees ei soovi avaldust teha. Kuidas toimime?',
            '{callsign}: the woman has calmed down and regrets it; the man does not want to make a complaint. How do we proceed?',
          ),
        ],
        'F',
      ),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.5, 1],
        3,
        T(
          'Naise suhtes alustati kriminaalmenetlust KarS § 121 järgi. Mehe haav õmmeldi EMO-s, paarile anti perenõustamise ja sõltuvusnõustamise kontaktid.',
          'Criminal proceedings were opened against the woman under KarS § 121. The man’s wound was stitched at A&E and the couple were given family and addiction counselling contacts.',
        ),
        { injuries: 1, trust: 2 },
      ),
      oc(
        'ban',
        'report',
        [0.35, 0.8],
        2,
        T(
          'Naisele kohaldati viibimiskeeld ja ta läks ema juurde. Alustati kriminaalmenetlust, mehele anti ohvriabi kontaktid.',
          'The woman was given a removal order and went to her mother’s. Criminal proceedings were opened and the man got victim support contacts.',
        ),
        { trust: 1 },
      ),
      oc(
        'warned',
        'warning',
        [0.15, 0.45],
        2,
        T(
          'Mõlemad rahunesid. Mees keeldus avaldusest, sündmus registreeriti LSV-na ja edastati piirkonnapolitseinikule.',
          'Both calmed down. The man declined to make a complaint; the event was logged as domestic and passed to the community officer.',
        ),
      ),
      oc(
        'concussion',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Mees kaotas hetkeks teadvuse ja toimetati põrutuse kahtlusega haiglasse. Naise suhtes alustati kriminaalmenetlust.',
          'The man briefly lost consciousness and was taken to hospital with a suspected concussion. Proceedings were opened against the woman.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.15,
      toPriority: 1,
      text: T(
        'Häirekeskus: mees helistas uuesti, tal läheb silme ees mustaks.',
        'ERC: the man called again, saying everything is going black.',
      ),
    },
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere... mul on natuke piinlik, aga mu naine lõi mind praepanniga pähe.',
          'Hello... this is a bit embarrassing, but my wife hit me on the head with a frying pan.',
        ),
        T(
          'Ma tulin koju natuke purjus ja ta lõi mind praepanniga pähe. Verd tuleb.',
          'I came home a bit drunk and she hit me on the head with a frying pan. I am bleeding.',
        ),
      ],
      openingRu: [
        'Алло... мне неудобно, но жена ударила меня сковородкой по голове.',
        'Я пришёл домой немного выпивши, и она ударила меня сковородкой по голове. Идёт кровь.',
      ],
      answers: {
        injured: [
          T('Peast jookseb verd, ma hoian rätikut peal.', 'My head is bleeding, I am holding a towel on it.'),
        ],
        suspect: [T('Mu naine. Ta on köögis ja nutab nüüd.', 'My wife. She is in the kitchen crying now.')],
        weapons: [T('Praepann. Ja ta viskas taldrikuid.', 'A frying pan. And she threw plates.')],
        intoxicated: [T('Mina jõin, jah. Tema on kaine.', 'I was drinking, yes. She is sober.')],
        children: [T('Ei, lapsi meil ei ole.', 'No, we have no children.')],
        safe: [T('Ma olen vannitoas, uks on lukus.', 'I am in the bathroom with the door locked.')],
      },
      answersRu: {
        injured: ['Из головы кровь идёт, я держу полотенце.'],
        suspect: ['Моя жена. Она на кухне, теперь плачет.'],
        weapons: ['Сковородка. И она тарелки бросала.'],
        intoxicated: ['Я выпивал, да. Она трезвая.'],
        children: ['Нет, детей у нас нет.'],
        safe: ['Я в ванной, дверь закрыта.'],
      },
    },
    tags: ['injury'],
  },
  {
    id: 'taxi_driver',
    title: T('Lähisuhtevägivald: kannatanu istub taksos', 'Domestic violence: the victim is in a taxi'),
    persons: [
      vic('F', [20, 55]),
      sus('M', [22, 60], 'partner', { intoxicated: 0.75, record: 0.45 }),
      { role: 'caller', gender: 'M', age: [30, 65], relation: 'stranger' },
    ],
    summary: [
      T(
        '{address} ees. Taksojuht teatab, et tema autosse istus nutev naine, kelle nina veritseb. Naise sõnul peksis elukaaslane teda korteris ja mees on ikka veel kodus.',
        'Outside {address}. A taxi driver reports a crying woman with a bleeding nose got into his cab. She says her partner beat her in the flat and he is still at home.',
      ),
      T(
        '{address}. Taksojuht ootab maja ees: kliendiks on naine, kes jooksis pidžaamas trepikojast välja ja palub end ära viia. Naise sõnul lõi elukaaslane teda.',
        '{address}. A taxi driver is waiting outside: his passenger is a woman who ran out of the stairwell in her pyjamas asking to be driven away. She says her partner hit her.',
      ),
    ],
    callerLines: [
      T(
        'Mul istub autos naine, nina veritseb. Ta ütleb, et mees peksis teda üleval korteris.',
        'I have a woman in my car with a bleeding nose. She says her husband beat her up in the flat upstairs.',
      ),
      T(
        'Ta tellis takso sõbranna juurde, aga ta väriseb nii, et ma otsustasin teile helistada.',
        'She ordered a taxi to a friend’s place, but she is shaking so much that I decided to call you.',
      ),
    ],
    details: [
      T(
        'Teataja on taksojuht, kannatanu istub taksos maja ees.',
        'The caller is a taxi driver; the victim is sitting in the taxi outside the building.',
      ),
      T(
        'Kahtlustatav: {suspect}. Kannatanu sõnul on ta korteris.',
        'Suspect: {suspect}. The victim says he is in the flat.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.4, reason: T('Näovigastus', 'Facial injury') }],
    beats: [
      info('arrive', [
        T(
          '{callsign}: naine on taksos, nina veritseb. Mees on korteris, läheme üles.',
          '{callsign}: the woman is in the taxi with a bleeding nose. The man is in the flat, going up.',
        ),
      ]),
      kiirabi(2, {
        chance: 0.4,
        radio: [
          T(
            '{callsign}: naisel võib olla nina murtud, palun kiirabi maja ette.',
            '{callsign}: the woman may have a broken nose, request an ambulance outside the building.',
          ),
        ],
      }),
      qPerson('suspect', 6, { radio: Q_LSV }),
      toArrest(15, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Mees peeti korteris kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi, taksojuht andis tunnistajana seletuse ja naine viidi sõbranna juurde.',
          'The man was detained in the flat and taken to the arrest house. Criminal proceedings were opened under KarS § 121; the taxi driver gave a witness statement and the woman was taken to her friend’s.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'ban',
        'report',
        [0.35, 0.75],
        3,
        T(
          'Mehele kohaldati viibimiskeeld. Alustati kriminaalmenetlust, naine suunati ohvriabisse ja ta jäi ööseks sõbranna juurde.',
          'The man was given a removal order. Criminal proceedings were opened; the woman was referred to victim support and stayed the night at her friend’s.',
        ),
        { trust: 1 },
      ),
      oc(
        'gone',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Selgus, et mees oli korterist juba lahkunud. Alustati kriminaalmenetlust, mees kuulutati tagaotsitavaks ja naine toimetati EMO-sse.',
          'It turned out the man had already left the flat. Proceedings were opened, he was put on the wanted list and the woman was taken to A&E.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.2,
      toPriority: 1,
      text: T(
        'Teataja: mees tuli trepikojast välja ja tõmbab takso ust.',
        'Caller: the man has come out of the stairwell and is pulling at the taxi door.',
      ),
    },
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, ma olen taksojuht. Mu autosse istus naine, kelle nina veritseb, ta ütleb, et mees peksis teda.',
          'Hello, I am a taxi driver. A woman got into my car with a bleeding nose, she says her husband beat her.',
        ),
        T(
          'Mul on autos naine, nina veritseb. Ta ütleb, et mees peksis teda üleval korteris.',
          'I have a woman in my car with a bleeding nose. She says her husband beat her in the flat upstairs.',
        ),
      ],
      openingRu: [
        'Здравствуйте, я таксист. Ко мне в машину села женщина, у неё кровь из носа, говорит, муж избил.',
        'У меня в машине женщина, кровь из носа. Говорит, муж избил её в квартире наверху.',
      ],
      answers: {
        weapons: [
          T('Ma ei tea, naise sõnul lõi mees rusikaga.', 'I do not know, she says he used his fists.'),
        ],
        intoxicated: [
          T('Naise sõnul oli mees terve õhtu joonud.', 'She says he had been drinking all evening.'),
        ],
        vehicle: [
          T('Mina olen taksoga siin, temal autot pole.', 'I am here with my taxi; he does not have a car.'),
        ],
        where: [
          T(
            'Ma seisan {address} ees, ohutuled põlevad.',
            'I am parked outside {address} with the hazard lights on.',
          ),
        ],
        safe: [T('Jah, me oleme autos, uksed on lukus.', 'Yes, we are in the car with the doors locked.')],
        injured: [
          T(
            'Nina veritseb, põsk on punane. Muidu ta räägib normaalselt.',
            'Her nose is bleeding and her cheek is red. Otherwise she is talking normally.',
          ),
        ],
        suspect: [
          T(
            'Ma ei ole teda näinud. Naine ütleb, et ta on üleval korteris.',
            'I have not seen him. She says he is upstairs in the flat.',
          ),
        ],
        name: [T('Minu nimi on {caller}, ma sõidan taksot.', 'My name is {caller}, I drive a taxi.')],
        children: [T('Ta ütleb, et lapsi kodus ei ole.', 'She says there are no children at home.')],
        direction: [
          T(
            'Ta peaks olema veel korteris, keegi pole välja tulnud.',
            'He should still be in the flat, nobody has come out.',
          ),
        ],
      },
      answersRu: {
        weapons: ['Не знаю, она говорит, что он бил кулаками.'],
        intoxicated: ['Она говорит, что он весь вечер пил.'],
        vehicle: ['Я тут на такси, а у него машины нет.'],
        where: ['Я стою возле дома: {address}, аварийка включена.'],
        safe: ['Да, мы в машине, двери заблокированы.'],
        injured: ['Кровь из носа, щека красная. А так она нормально разговаривает.'],
        suspect: ['Я его не видел. Она говорит, что он наверху, в квартире.'],
        name: ['Меня зовут {caller}, я таксист.'],
        children: ['Она говорит, что детей дома нет.'],
        direction: ['Он должен быть ещё в квартире, никто не выходил.'],
      },
    },
  },
  {
    id: 'neighbours_holding',
    title: T(
      'Lähisuhtevägivald: naabrid hoiavad meest kinni',
      'Domestic violence: neighbours holding the man',
    ),
    persons: [
      vic('F', [20, 55]),
      sus('M', [22, 60], 'partner', { intoxicated: 0.85, record: 0.55 }),
      { role: 'caller', gender: 'M', age: [25, 65], relation: 'neighbour' },
    ],
    summary: [
      T(
        '{address}. Naabrid kuulsid naise appikarjeid, läksid korterisse ja hoiavad nüüd joobes meest trepikojas põrandal kinni. Naisel on näol vigastused.',
        '{address}. Neighbours heard a woman screaming for help, went into the flat and are now holding a drunk man down on the stairwell floor. The woman has facial injuries.',
      ),
      T(
        '{address}. Kaks naabrimeest pidasid kinni mehe, kes peksis oma elukaaslast. Mees rabeleb ja ähvardab kõiki.',
        '{address}. Two neighbours have restrained a man who was beating his partner. He is struggling and threatening everyone.',
      ),
    ],
    callerLines: [
      T(
        'Me hoiame teda kahekesi maas, aga ta on tugev. Tulge ruttu!',
        'Two of us are holding him down, but he is strong. Come quickly!',
      ),
      T(
        'Ma kuulsin, kuidas ta karjus appi, ja läksin sisse. Ta lõi teda põrandal.',
        'I heard her screaming for help and went in. He was hitting her on the floor.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Naabrid hoiavad teda trepikojas maas.',
        'Suspect: {suspect}. Neighbours are holding him down in the stairwell.',
      ),
      T('Kannatanu on korteris, näol verevalumid.', 'The victim is in the flat with bruises on her face.'),
    ],
    agencies: [
      { agency: 'kiirabi', chance: 0.5, reason: T('Kannatanul näovigastused', 'Victim has facial injuries') },
    ],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: naabrid lamavad mehe peal, ta hingeldab ja rabeleb. Kas võtame ta kohe üle?',
            '{callsign}: the neighbours are lying on top of the man, he is panting and struggling. Do we take over right away?',
          ),
        ],
        [
          opt(
            'take',
            T('Võtke kohe üle, vabastage hingamine', 'Take over now, free his breathing'),
            T(
              '{callsign}, juhtimine. Võtke ta üle, pange käeraudu ja asetage külili.',
              '{callsign}, Control. Take over, cuff him and put him on his side.',
            ),
            { success: 0.15, risk: 0.04 },
          ),
          opt(
            'wait',
            T('Oodake teist patrulli', 'Wait for the second patrol'),
            T(
              '{callsign}, juhtimine. Oodake lisajõude, jälgige tema hingamist.',
              '{callsign}, Control. Wait for backup and watch his breathing.',
            ),
            { time: 6, success: -0.1, risk: 0.05 },
          ),
        ],
        'take',
        { timeoutMin: 3 },
      ),
      kiirabi(3, { chance: 0.5 }),
      qPerson('suspect', 6, { radio: Q_LSV }),
      toArrest(12),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.45, 1],
        3,
        T(
          'Mees võeti naabritelt üle ja peeti kinni. Alustati kriminaalmenetlust KarS § 121 järgi, naabrid andsid tunnistajana seletused ja naine suunati ohvriabisse.',
          'Officers took the man over from the neighbours and detained him. Criminal proceedings were opened under KarS § 121, the neighbours gave witness statements and the woman was referred to victim support.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'hurt_neighbour',
        'arrest',
        [0.2, 0.55],
        2,
        T(
          'Mees peeti kinni, kuid rabelemisel sai üks naaber käest vigastada. Alustati kriminaalmenetlust, naabrile soovitati arstiabi.',
          'The man was detained, but one neighbour hurt his hand in the struggle. Proceedings were opened and the neighbour was advised to see a doctor.',
        ),
        { arrests: 1, injuries: 1 },
      ),
      oc(
        'broke_free',
        'escaped',
        [0, 0.3],
        2,
        T(
          'Mees rebis end enne patrulli saabumist lahti ja jooksis minema. Ta kuulutati tagaotsitavaks, naine toimetati EMO-sse.',
          'The man tore himself free before the patrol arrived and ran off. He is now wanted and the woman was taken to A&E.',
        ),
        { injuries: 1, trust: -3 },
      ),
    ],
    escalation: {
      afterMin: 10,
      chance: 0.3,
      toPriority: 1,
      text: T(
        'Teataja: mees rebis end lahti ja lõi naabrit.',
        'Caller: the man has torn himself free and hit a neighbour.',
      ),
    },
    call: {
      mood: 'panic',
      opening: [
        T(
          'Me hoiame naabrimeest maas, ta peksis oma naist! Tulge kiiresti!',
          'We are holding the man next door down, he was beating his wife! Come quickly!',
        ),
        T(
          'Ta peksis oma naist põrandal, me läksime sisse ja hoiame teda nüüd kinni.',
          'He was beating his wife on the floor, we went in and now we are holding him down.',
        ),
      ],
      openingRu: [
        'Мы держим соседа на полу, он избивал жену! Приезжайте быстрее!',
        'Он бил жену на полу, мы зашли и теперь держим его.',
      ],
      answers: {
        count: [
          T(
            'Meid on kaks naabrit, lisaks tema ja ta naine.',
            'There are two of us neighbours, plus him and his wife.',
          ),
        ],
        direction: [T('Ta ei lähe kuhugi, me hoiame teda!', 'He is not going anywhere, we are holding him!')],
        weapons: [T('Ei, relva ei ole. Ainult rusikad.', 'No weapon. Just his fists.')],
        injured: [
          T(
            'Naise nägu on verine, ta istub köögis.',
            'The woman’s face is bloody, she is sitting in the kitchen.',
          ),
        ],
        safe: [T('Praegu jah, aga kaua me teda ei hoia.', 'For now yes, but we cannot hold him for long.')],
        intoxicated: [T('Purjus, nagu kõigil neil õhtutel.', 'Drunk, like on all those nights.')],
      },
      answersRu: {
        count: ['Нас двое соседей, плюс он и его жена.'],
        direction: ['Никуда он не денется, мы его держим!'],
        weapons: ['Нет, оружия нет. Только кулаки.'],
        injured: ['У женщины всё лицо в крови, она сидит на кухне.'],
        safe: ['Пока да, но долго мы его не удержим.'],
        intoxicated: ['Пьяный, как всегда в такие вечера.'],
      },
    },
    tags: ['detained'],
  },
];

// ── domestic_verbal_dispute ("Perekonflikt") ────────────────────────────────
/** Calm family argument decision: who leaves for the night. */
const disputeChoice = (radio: Text[]) =>
  choice(
    8,
    radio,
    [
      opt(
        'friend',
        T('Üks osapool ööbib mujal', 'One of them sleeps elsewhere'),
        T(
          '{callsign}, juhtimine. Leppige kokku, et üks neist ööbib täna mujal.',
          '{callsign}, Control. Agree that one of them stays somewhere else tonight.',
        ),
        { success: 0.05, trust: 1, time: 15 },
      ),
      opt(
        'ban',
        T('Viibimiskeeld', 'Removal order'),
        T('{callsign}, juhtimine. Kohaldage viibimiskeeld.', '{callsign}, Control. Issue a removal order.'),
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
  );

const SC_VERBAL_DISPUTE: IncidentScenario[] = [
  {
    id: 'balcony_loans',
    title: T('Perekonflikt rõdul', 'Family argument on a balcony'),
    persons: [
      vic('F', [25, 65]),
      sus('M', [25, 65], 'partner', { intoxicated: 0.5, record: 0.25 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naabri teatel tülitseb abielupaar rõdul valjult, mees karjub kiirlaenude pärast. Füüsilisest vägivallast pole teada.',
        '{address}. A neighbour reports a married couple arguing loudly on their balcony, the man shouting about payday loans. No known physical violence.',
      ),
      T(
        '{address}. Rõdult kostab juba pool tundi sõimu: naine on mehe teadmata laene võtnud. Naaber kardab, et tüli läheb käest ära.',
        '{address}. Swearing has been coming from a balcony for half an hour: the woman has taken out loans without the man knowing. The neighbour fears it will get out of hand.',
      ),
    ],
    callerLines: [
      T(
        'Nad karjuvad rõdul nii, et terve maja kuuleb. Midagi laenudest ja kohtutäiturist.',
        'They are shouting on the balcony so the whole building can hear. Something about loans and the bailiff.',
      ),
      T(
        'Löömist ma ei näinud, aga mees on väga vihane. Võiks keegi üle vaadata.',
        'I did not see any hitting, but the man is very angry. Someone could check.',
      ),
    ],
    details: [
      T(
        'Paaril on teadaolevalt võlad, korterisse on tulnud kohtutäituri kirju.',
        'The couple are known to have debts; bailiff letters have arrived at the flat.',
      ),
      T('Osapooled: {suspect} ja tema abikaasa.', 'Parties: {suspect} and his wife.'),
    ],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.7 }),
      disputeChoice([
        T(
          '{callsign}: vägivalda pole, aga mees ei rahune, raha pärast käib karjumine. Kuidas jätkame?',
          '{callsign}: no violence, but the man will not calm down; the shouting is about money. How do we proceed?',
        ),
      ]),
    ],
    outcomes: [
      oc(
        'calm',
        'resolved',
        [0.5, 1],
        3,
        T(
          'Pooled rahunesid, füüsilise vägivalla tunnuseid ei tuvastatud. Paarile anti võlanõustamise ja perenõustamise kontaktid.',
          'The couple calmed down and no signs of physical violence were found. They were given debt and family counselling contacts.',
        ),
      ),
      oc(
        'warning',
        'warning',
        [0.25, 0.65],
        2,
        T(
          'Mõlemaid hoiatati öörahu rikkumise eest. Mees läks ööseks venna juurde.',
          'Both were warned for disturbing the peace. The man went to stay at his brother’s for the night.',
        ),
      ),
      oc(
        'shook',
        'report',
        [0, 0.4],
        2,
        T(
          'Selgus, et mees oli naist rõdul raputanud ja tõuganud. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'It turned out the man had shaken and shoved the woman on the balcony. Criminal proceedings were opened under KarS § 121.',
        ),
        { trust: -1 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Naabrid karjuvad rõdul juba pool tundi, midagi laenude pärast.',
          'Hello. The neighbours have been shouting on their balcony for half an hour, something about loans.',
        ),
        T(
          'Nad karjuvad rõdul laenude pärast, löömist ma ei näe.',
          'They are shouting on the balcony about loans, I cannot see any hitting.',
        ),
      ],
      openingRu: [
        'Здравствуйте. Соседи уже полчаса орут на балконе, что-то из-за кредитов.',
        'Они кричат на балконе из-за кредитов, драки я не вижу.',
      ],
      answers: {
        what: [
          T(
            'Ainult karjumine ja sõimamine. Löömist ma ei näe.',
            'Just shouting and swearing. I cannot see any hitting.',
          ),
        ],
        children: [T('Lapsi ma seal näinud ei ole.', 'I have not seen any children there.')],
        intoxicated: [T('Ma arvan, et mees on natuke võtnud.', 'I think the man has had a few.')],
      },
      answersRu: {
        what: ['Только крики и ругань. Чтобы кто-то кого-то бил, не видно.'],
        children: ['Детей я у них не {видел|видела}.'],
        intoxicated: ['Думаю, муж немного выпил.'],
      },
    },
    tags: ['money'],
  },
  {
    id: 'inheritance_siblings',
    title: T('Pärandustüli õe ja venna vahel', 'Inheritance row between a brother and sister'),
    persons: [
      vic('F', [35, 68]),
      sus('M', [35, 70], 'family', { intoxicated: 0.3, record: 0.15 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naabri teatel tülitsevad surnud korteriomaniku täiskasvanud lapsed valjult selle üle, kes korteri saab. Vend vahetas lukud ega lase õde sisse.',
        '{address}. A neighbour reports the grown-up children of the late flat owner arguing loudly about who gets the flat. The brother changed the locks and will not let his sister in.',
      ),
      T(
        '{address}. Pärast ema matuseid läksid vend ja õde ema korteris tülli. Õde seisab trepikojas, vend karjub seestpoolt ust.',
        '{address}. After their mother’s funeral a brother and sister started a row in her flat. The sister is in the stairwell and the brother is shouting from behind the door.',
      ),
    ],
    callerLines: [
      T(
        'Vana proua suri kuu aega tagasi ja nüüd nad karjuvad iga päev, kes korteri saab.',
        'The old lady died a month ago and now they shout every day about who gets the flat.',
      ),
      T(
        'Õde nutab trepil, vend ei lase teda sisse ja karjub, et see on tema kodu.',
        'The sister is crying on the stairs; the brother will not let her in and shouts that it is his home.',
      ),
    ],
    details: [
      T(
        'Pärimismenetlus on pooleli, korteri omanik on surnud.',
        'Probate is in progress; the owner of the flat has died.',
      ),
      T('Osapooled: {suspect} ja tema õde.', 'Parties: {suspect} and his sister.'),
    ],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.6 }),
      choice(
        6,
        [
          T(
            '{callsign}: vägivalda pole, vend vahetas lukud ja õde tahab ema asju. Kuidas lahendame?',
            '{callsign}: no violence; the brother changed the locks and the sister wants her mother’s things. How do we resolve it?',
          ),
        ],
        [
          opt(
            'civil',
            T('Selgitage, et tegu on tsiviilvaidlusega', 'Explain it is a civil dispute'),
            T(
              '{callsign}, juhtimine. Selgitage, et pärandi jagamine käib notari ja kohtu kaudu.',
              '{callsign}, Control. Explain that dividing the estate goes through a notary and the courts.',
            ),
            { success: 0.1, time: 10 },
          ),
          opt(
            'escort',
            T('Laske õel isiklikud asjad võtta', 'Let the sister collect personal items'),
            T(
              '{callsign}, juhtimine. Olge juures, kui õde võtab oma isiklikud asjad.',
              '{callsign}, Control. Stay present while the sister takes her personal belongings.',
            ),
            { success: 0.05, time: 20, trust: 1 },
          ),
          opt(
            'leave',
            T('Lõpetage sündmus', 'Close the event'),
            T(
              '{callsign}, juhtimine. Lõpetage, see ei ole politsei pädevuses.',
              '{callsign}, Control. Close it, this is not a police matter.',
            ),
            { success: -0.1, trust: -1 },
          ),
        ],
        'civil',
      ),
    ],
    outcomes: [
      oc(
        'civil',
        'referred',
        [0.45, 1],
        3,
        T(
          'Pooltele selgitati, et pärandvara jagatakse notari juures ja vajadusel kohtus. Õde lahkus ja tüli vaibus.',
          'Both were told the estate will be divided at a notary and, if needed, in court. The sister left and the row died down.',
        ),
      ),
      oc(
        'items',
        'resolved',
        [0.3, 0.7],
        2,
        T(
          'Patrulli juuresolekul sai õde kätte ema fotoalbumid ja oma isiklikud asjad. Tüli lõppes.',
          'With the patrol present the sister collected her mother’s photo albums and her own belongings. The row ended.',
        ),
      ),
      oc(
        'shove',
        'report',
        [0, 0.35],
        2,
        T(
          'Selgus, et vend oli õde trepil tõuganud ja too kukkus. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'It turned out the brother had shoved his sister on the stairs and she fell. Criminal proceedings were opened under KarS § 121.',
        ),
        { trust: -1 },
      ),
    ],
    escalation: {
      afterMin: 25,
      chance: 0.2,
      toPriority: 2,
      text: T(
        'Teataja: vend tuli trepikotta ja lükkas õe vastu seina.',
        'Caller: the brother came out into the stairwell and shoved his sister against the wall.',
      ),
    },
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Meie majas tülitsevad õde ja vend oma surnud ema korteri pärast, juba tund aega.',
          'Hello. A brother and sister in our building have been arguing about their late mother’s flat for an hour.',
        ),
        T(
          'Vend ei lase õde ema korterisse ja nad karjuvad läbi ukse.',
          'The brother will not let his sister into their mother’s flat and they are shouting through the door.',
        ),
      ],
      openingRu: [
        'Здравствуйте. У нас в доме брат с сестрой уже час ругаются из-за квартиры покойной матери.',
        'Брат не пускает сестру в квартиру матери, они кричат через дверь.',
      ],
      answers: {
        what: [
          T(
            'Vend ei lase õde sisse ja nad karjuvad läbi ukse. Löömist ei ole.',
            'The brother will not let the sister in and they are shouting through the door. No hitting.',
          ),
        ],
        children: [T('Ei, ainult need kaks.', 'No, just those two.')],
        count: [T('Kaks inimest, vend ja õde.', 'Two people, the brother and the sister.')],
        intoxicated: [
          T('Ei tundu, et keegi oleks joonud.', 'It does not look like anyone has been drinking.'),
        ],
      },
      answersRu: {
        what: ['Брат не пускает сестру, и они кричат через дверь. Драки нет.'],
        children: ['Нет, только они двое.'],
        count: ['Двое, брат и сестра.'],
        intoxicated: ['Не похоже, чтобы кто-то пил.'],
      },
    },
    tags: ['civil'],
  },
  {
    id: 'teen_vs_father',
    title: T(
      'Perekonflikt: teismeline lõhub kodus asju',
      'Family argument: a teenager smashing things at home',
    ),
    persons: [vic('M', [35, 58]), sus('M', [14, 17], 'child', { intoxicated: 0.05 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Isa teatab, et teismeline poeg lõhub oma toas mööblit, sest isa võttis tal öise mängimise pärast telefoni ära. Poeg ähvardab isa ega ava ust.',
        '{address}. A father reports his teenage son is smashing furniture in his room because the father took his phone away over gaming at night. The son is threatening his father and will not open the door.',
      ),
      T(
        '{address}. Teismeline lükkas tüli käigus isa vastu ust ja lukustas end tuppa. Isa palub abi, poeg karjub ja loobib asju.',
        '{address}. A teenager shoved his father against a door during a row and locked himself in his room. The father is asking for help; the son is shouting and throwing things.',
      ),
    ],
    callerLines: [
      T(
        'Ma võtsin tal telefoni ära, sest ta mängib terve öö ega lähe kooli. Nüüd ta lõhub tuba.',
        'I took his phone away because he games all night and skips school. Now he is smashing up his room.',
      ),
      T(
        'Ta lükkas mind ja ütles, et lööb maha. Ma ei tea enam, mida teha.',
        'He shoved me and said he would kill me. I do not know what to do any more.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}, alaealine.', 'Suspect: {suspect}, a minor.'),
      T('Ema on töö juures öövahetuses.', 'The mother is at work on a night shift.'),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 0.6,
        reason: T('Alaealine vajab lastekaitse sekkumist', 'The minor needs child protection involvement'),
      },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal. Poiss on toas ja ust ei ava, sees on kõik segamini. Isa on rahulik.',
          '{callsign}: on scene. The boy is in his room and will not open the door; it is a mess in there. The father is calm.',
        ),
      ]),
      backup(0.3, un('community'), {
        radio: [
          T(
            '{callsign}: palun noorsoopolitseinik, alaealine ei suhtle meiega.',
            '{callsign}: please send a youth officer, the minor will not talk to us.',
          ),
        ],
      }),
      agency('sotsiaal', 10, {
        chance: 0.6,
        radio: [
          T(
            '{callsign}: alaealine on vanema vastu agressiivne, palun teavitage lastekaitset.',
            '{callsign}: the minor is aggressive towards his parent, please notify child protection.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'calm',
        'resolved',
        [0.5, 1],
        3,
        T(
          'Poiss tuli toast välja ja rahunes. Pere suunati lastekaitse kaudu pereteraapiasse ja noorsoopolitseinik võtab perega ühendust.',
          'The boy came out of his room and calmed down. Through child protection the family was referred to family therapy and a youth officer will contact them.',
        ),
      ),
      oc(
        'grandma',
        'referred',
        [0.25, 0.6],
        2,
        T(
          'Juhtum edastati lastekaitsele. Poiss jäi ööseks vanaema juurde, isale anti nõu.',
          'The case was passed to child protection. The boy spent the night at his grandmother’s and the father was given advice.',
        ),
      ),
      oc(
        'hit',
        'report',
        [0, 0.35],
        2,
        T(
          'Selgus, et poeg oli isa löönud. Alustati kriminaalmenetlust KarS § 121 järgi, alaealise puhul kaalub prokuratuur mõjutusvahendeid. Lastekaitset teavitati.',
          'It turned out the son had hit his father. Criminal proceedings were opened under KarS § 121; as he is a minor, the prosecutor will consider diversion measures. Child protection was notified.',
        ),
        { trust: -1 },
      ),
    ],
    escalation: {
      afterMin: 25,
      chance: 0.2,
      toPriority: 2,
      text: T(
        'Isa helistas uuesti: poeg tuli toast välja ja ähvardab teda.',
        'The father called again: his son has come out of the room and is threatening him.',
      ),
    },
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere... ma ei saa oma pojaga hakkama. Ta lõhub toas asju ja ähvardab mind.',
          'Hello... I cannot cope with my son. He is smashing things in his room and threatening me.',
        ),
        T(
          'Ma võtsin pojal telefoni ära ja nüüd ta lõhub toas asju ja ähvardab mind.',
          'I took my son’s phone away and now he is smashing things in his room and threatening me.',
        ),
      ],
      openingRu: [
        'Здравствуйте... я не справляюсь с сыном. Он громит комнату и угрожает мне.',
        'Я забрал у сына телефон, теперь он громит комнату и угрожает мне.',
      ],
      answers: {
        suspect: [T('See on mu poeg, ta on teismeline.', 'It is my son, he is a teenager.')],
        weapons: [T('Ei, ta loobib asju. Raamatuid, toole.', 'No, he is throwing things. Books, chairs.')],
        children: [T('Ainult tema. Ema on tööl.', 'Only him. His mother is at work.')],
        intoxicated: [T('Ei, ta on kaine. Ta on lihtsalt vihane.', 'No, he is sober. He is just angry.')],
        injured: [
          T(
            'Õlg valutab, kui ta mind vastu ust lükkas. Muidu oleme terved.',
            'My shoulder hurts from when he shoved me into the door. Otherwise we are fine.',
          ),
        ],
        safe: [T('Ma olen köögis, tema on oma toas.', 'I am in the kitchen and he is in his room.')],
      },
      answersRu: {
        suspect: ['Это мой сын, он подросток.'],
        weapons: ['Нет, он кидается вещами. Книги, стулья.'],
        children: ['Только он. Мать на работе.'],
        intoxicated: ['Нет, он трезвый. Он просто злой.'],
        injured: ['Плечо болит, он толкнул меня на дверь. А так мы целы.'],
        safe: ['Я на кухне, а он у себя в комнате.'],
      },
    },
    tags: ['youth', 'children'],
  },
  {
    id: 'adult_son_eviction',
    title: T('Perekonflikt: täiskasvanud poeg ei lahku', 'Family argument: an adult son will not move out'),
    persons: [vic('F', [55, 80]), sus('M', [28, 50], 'family', { intoxicated: 0.5, record: 0.3 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Ema teatab, et palus täiskasvanud pojal välja kolida. Poeg keeldub, karjub ja lõi rusikaga vastu seina. Ema kardab.',
        '{address}. A mother reports she asked her adult son to move out. He refuses, shouts and punched the wall. She is afraid.',
      ),
      T(
        '{address}. Eakas naine palub abi: poeg elab tema juures, ei maksa midagi ja sõimab teda iga päev. Täna lubas poeg tema asjad aknast välja visata.',
        '{address}. An elderly woman asks for help: her son lives with her, pays nothing and swears at her every day. Today he threatened to throw her things out of the window.',
      ),
    ],
    callerLines: [
      T(
        'Ma ütlesin, et ta peab välja kolima. Nüüd ta karjub ja lõi seina sisse augu.',
        'I told him he has to move out. Now he is shouting and has punched a hole in the wall.',
      ),
      T('Korter on minu nimel. Kas ma saan ta välja visata?', 'The flat is in my name. Can I throw him out?'),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}, kannatanu poeg. Elab ema juures.',
        'Suspect: {suspect}, the victim’s son. Lives with his mother.',
      ),
      T('Korter kuulub emale.', 'The flat belongs to the mother.'),
    ],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.8 }),
      choice(
        6,
        [
          T(
            '{callsign}: poeg keeldub lahkumast, ema tahab ta välja. Vägivalda pole olnud. Kuidas toimime?',
            '{callsign}: the son refuses to leave and the mother wants him out. There has been no violence. How do we proceed?',
          ),
        ],
        [
          opt(
            'ban',
            T('Viibimiskeeld ähvarduste tõttu', 'Removal order because of the threats'),
            T(
              '{callsign}, juhtimine. Ähvardusi on olnud, kohaldage viibimiskeeld.',
              '{callsign}, Control. There have been threats, issue a removal order.',
            ),
            { success: 0.1, time: 15 },
          ),
          opt(
            'explain',
            T('Selgitage väljatõstmise korda', 'Explain the eviction procedure'),
            T(
              '{callsign}, juhtimine. Selgitage, et väljatõstmine käib kohtu kaudu, ja hoiatage poega.',
              '{callsign}, Control. Explain that eviction goes through the court and warn the son.',
            ),
            { success: 0.05, time: 10 },
          ),
          opt(
            'leave',
            T('Lõpetage', 'Close it'),
            T('{callsign}, juhtimine. Lõpetage sündmus.', '{callsign}, Control. Close the event.'),
            { success: -0.15, trust: -1 },
          ),
        ],
        'explain',
      ),
    ],
    outcomes: [
      oc(
        'ban',
        'report',
        [0.55, 1],
        3,
        T(
          'Pojale kohaldati ähvarduste tõttu viibimiskeeld ja ta lahkus sõbra juurde. Emale selgitati kohtu kaudu väljatõstmise korda ja anti ohvriabi kontaktid.',
          'Because of the threats the son was given a removal order and went to a friend’s. The mother was told how eviction works through the court and given victim support contacts.',
        ),
        { trust: 1 },
      ),
      oc(
        'explained',
        'warning',
        [0.25, 0.65],
        2,
        T(
          'Poega hoiatati ja ta lubas nädala jooksul välja kolida. Emale anti õigusabi ja ohvriabi kontaktid.',
          'The son was warned and promised to move out within a week. The mother was given legal aid and victim support contacts.',
        ),
      ),
      oc(
        'threat',
        'report',
        [0, 0.35],
        2,
        T(
          'Poeg ähvardas patrulli juuresolekul ema tappa. Alustati kriminaalmenetlust ähvardamise eest (KarS § 120).',
          'In front of the patrol the son threatened to kill his mother. Criminal proceedings were opened for threats (KarS § 120).',
        ),
        { trust: -1 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Ma palusin pojal välja kolida ja nüüd ta peksab seinu ja karjub.',
          'Hello. I asked my son to move out and now he is punching walls and shouting.',
        ),
        T(
          'Poeg keeldub välja kolimast ja lõi seina sisse augu.',
          'My son refuses to move out and punched a hole in the wall.',
        ),
      ],
      openingRu: [
        'Здравствуйте. Я попросила сына съехать, а теперь он бьёт стены и кричит.',
        'Сын отказывается съезжать и пробил кулаком стену.',
      ],
      answers: {
        suspect: [T('Mu poeg, ta elab minu juures.', 'My son, he lives with me.')],
        weapons: [T('Ei, ta lõi ainult seina.', 'No, he only hit the wall.')],
        children: [T('Ei, ainult mina ja tema.', 'No, just me and him.')],
        intoxicated: [T('Ta on õlut joonud, nagu alati.', 'He has been drinking beer, as always.')],
        safe: [T('Ma olen magamistoas, uks on lukus.', 'I am in the bedroom with the door locked.')],
      },
      answersRu: {
        suspect: ['Мой сын, он живёт у меня.'],
        weapons: ['Нет, он только по стене бил.'],
        children: ['Нет, только я и он.'],
        intoxicated: ['Пиво пил, как всегда.'],
        safe: ['Я в спальне, дверь закрыта.'],
      },
    },
    tags: ['civil'],
  },
  {
    id: 'dementia',
    title: T('Perekonflikt: dementne abikaasa', 'Family argument: a husband with dementia'),
    persons: [vic('F', [65, 88]), sus('M', [70, 92], 'partner', { intoxicated: 0 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Eakas naine teatab, et dementsusega abikaasa ei tunne teda ära, karjub, et võõras on tema kodus, ja viskas teda tassiga.',
        '{address}. An elderly woman reports that her husband, who has dementia, does not recognise her, is shouting that a stranger is in his home and threw a cup at her.',
      ),
      T(
        '{address}. Dementne eakas mees on õhtul rahutu, ajab naist korterist välja ja ähvardab kepiga. Naine ei saa temaga hakkama.',
        '{address}. An elderly man with dementia is restless this evening, trying to throw his wife out of the flat and threatening her with a stick. She cannot cope with him.',
      ),
    ],
    callerLines: [
      T(
        'Ta ei tunne mind ära. Ta arvab, et ma olen varas, ja karjub, et ma lahkuksin.',
        'He does not recognise me. He thinks I am a burglar and shouts at me to leave.',
      ),
      T(
        'Viiskümmend aastat abielus ja nüüd ta viskab mind tassiga. See ei ole tema, see on haigus.',
        'Fifty years married and now he throws a cup at me. That is not him, it is the illness.',
      ),
    ],
    details: [
      T(
        'Mehel on diagnoositud dementsus, õhtuti on ta segaduses.',
        'The man has been diagnosed with dementia and is confused in the evenings.',
      ),
      T('Mees: {suspect}.', 'The man: {suspect}.'),
    ],
    agencies: [
      {
        agency: 'kiirabi',
        chance: 0.7,
        reason: T(
          'Dementne eakas vajab arstlikku hinnangut',
          'The man with dementia needs a medical assessment',
        ),
      },
      { agency: 'kov', chance: 0.6, reason: T('Pere vajab hooldusabi', 'The family needs care support') },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal. Vanahärra on segaduses ja peab meid võõrasteks, kuid rahuneb vormi nähes.',
          '{callsign}: on scene. The old man is confused and takes us for strangers, but calms down at the sight of the uniform.',
        ),
      ]),
      kiirabi(4, {
        chance: 0.7,
        radio: [
          T(
            '{callsign}: dementne eakas, väga rahutu. Palun kiirabi hinnangut.',
            '{callsign}: elderly man with dementia, very agitated. Request an ambulance assessment.',
          ),
        ],
      }),
      agency('kov', 10, {
        chance: 0.6,
        radio: [
          T(
            '{callsign}: abikaasa ei tule hooldamisega toime, palun teavitage omavalitsuse sotsiaaltöötajat.',
            '{callsign}: the wife cannot cope with his care, please notify the municipal social worker.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'care',
        'referred',
        [0.45, 1],
        3,
        T(
          'Kiirabi viis vanahärra hindamiseks haiglasse. Kuritegu ei tuvastatud, omavalitsus lubas perele hooldusabi korraldada.',
          'The ambulance took the old man to hospital for assessment. No offence was found and the municipality promised to arrange care support for the family.',
        ),
      ),
      oc(
        'daughter',
        'resolved',
        [0.25, 0.65],
        2,
        T(
          'Vanahärra rahunes, kui tütar kohale jõudis. Perele selgitati hooldusabi võimalusi, info edastati omavalitsusele.',
          'The old man calmed down when his daughter arrived. The family was told about care options and the information passed to the municipality.',
        ),
      ),
      oc(
        'fell',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Naine sai kukkudes käevigastuse ja toimetati EMO-sse. Mees paigutati ajutiselt hooldusosakonda.',
          'The woman injured her arm in a fall and was taken to A&E. The man was temporarily placed in a care ward.',
        ),
        { injuries: 1, trust: -1 },
      ),
    ],
    escalation: {
      afterMin: 30,
      chance: 0.15,
      toPriority: 2,
      text: T(
        'Naine helistas uuesti: mees läks koduriietes õue ja kadus.',
        'The wife called again: her husband went outside in his house clothes and has disappeared.',
      ),
    },
    call: {
      mood: 'elderly',
      opening: [
        T(
          'Halloo... mu mees ei tunne mind ära. Ta viskas mind tassiga ja ajab välja.',
          'Hello... my husband does not recognise me. He threw a cup at me and is trying to throw me out.',
        ),
        T(
          'Ta arvab, et ma olen võõras, ja viskas mind tassiga. Tal on dementsus.',
          'He thinks I am a stranger and threw a cup at me. He has dementia.',
        ),
      ],
      openingRu: [
        'Алло... муж меня не узнаёт. Бросил в меня чашкой и выгоняет из дома.',
        'Он думает, что я чужая, и бросил в меня чашкой. У него деменция.',
      ],
      answers: {
        suspect: [T('Mu abikaasa. Tal on dementsus.', 'My husband. He has dementia.')],
        intoxicated: [
          T('Ei, ta ei joo üldse. See on haigus.', 'No, he does not drink at all. It is the illness.'),
        ],
        weapons: [
          T(
            'Tal on kepp käes, aga sellega ta hästi lüüa ei saa.',
            'He has his stick, but he cannot really hit with it.',
          ),
        ],
        children: [T('Ei, tütar elab teises linnas.', 'No, our daughter lives in another town.')],
        injured: [
          T('Tass läks mööda, ainult natuke kriimustas.', 'The cup missed, it only scratched me a little.'),
        ],
      },
      answersRu: {
        suspect: ['Мой муж. У него деменция.'],
        intoxicated: ['Нет, он вообще не пьёт. Это болезнь.'],
        weapons: ['У него палка в руках, но ударить ею как следует он не может.'],
        children: ['Нет, дочка живёт в другом городе.'],
        injured: ['Чашка пролетела мимо, только чуть-чуть поцарапала.'],
      },
    },
    tags: ['elderly'],
  },
  {
    id: 'flatmates',
    title: T('Tüli kaasüürnike vahel', 'Row between flatmates'),
    persons: [
      vic('any', [19, 40]),
      sus('any', [19, 40], 'friend', { intoxicated: 0.5, record: 0.2 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naabri teatel tülitsevad kaasüürnikud maksmata üüri pärast, üks viskas teise asjad trepikotta. Kostab karjumist.',
        '{address}. A neighbour reports flatmates arguing over unpaid rent; one has thrown the other’s belongings into the stairwell. Shouting can be heard.',
      ),
      T(
        '{address}. Kaasüürnike vahel käib vali tüli: üks vahetas oma toa ukse luku ja teine üritab ust maha lõhkuda.',
        '{address}. A loud row between flatmates: one changed the lock on their room door and the other is trying to break the door down.',
      ),
    ],
    callerLines: [
      T(
        'Trepikoda on nende kotte ja riideid täis ning nad karjuvad teineteise peale.',
        'The stairwell is full of their bags and clothes and they are shouting at each other.',
      ),
      T(
        'Nad on noored ja üürivad seda korterit koos. Täna läks asi päris käest ära.',
        'They are young and rent the flat together. Today it really got out of hand.',
      ),
    ],
    details: [
      T(
        'Osapooled üürivad korterit koos, omanik elab välismaal.',
        'The parties rent the flat together; the owner lives abroad.',
      ),
      T('Üks osapool: {suspect}.', 'One of the parties: {suspect}.'),
    ],
    agencies: [],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.7 }),
      choice(
        6,
        [
          T(
            '{callsign}: vägivalda pole, vaidlus käib üüri ja asjade üle. Kuidas lõpetame?',
            '{callsign}: no violence, the dispute is about rent and belongings. How do we wrap it up?',
          ),
        ],
        [
          opt(
            'separate',
            T('Üks ööbib mujal, asjad tagasi', 'One stays elsewhere tonight, belongings back'),
            T(
              '{callsign}, juhtimine. Leppige kokku, et üks ööbib täna mujal ja asjad tuuakse tuppa.',
              '{callsign}, Control. Agree that one of them stays elsewhere tonight and the belongings are brought back in.',
            ),
            { success: 0.1, time: 12 },
          ),
          opt(
            'civil',
            T('Selgitage, et üürivaidlus on tsiviilasi', 'Explain the rent dispute is a civil matter'),
            T(
              '{callsign}, juhtimine. Selgitage, et üürivaidlus lahendatakse üürikomisjonis või kohtus.',
              '{callsign}, Control. Explain that rent disputes go to the rental committee or the court.',
            ),
            { success: 0.05, time: 8 },
          ),
        ],
        'civil',
      ),
    ],
    outcomes: [
      oc(
        'resolved',
        'resolved',
        [0.45, 1],
        3,
        T(
          'Asjad toodi tuppa tagasi ja üks kaasüürnik läks ööseks sõbra juurde. Pooltele selgitati üürivaidluse lahendamise võimalusi.',
          'The belongings were brought back inside and one flatmate went to a friend’s for the night. Both were told how rent disputes can be settled.',
        ),
      ),
      oc(
        'warning',
        'warning',
        [0.2, 0.6],
        2,
        T(
          'Mõlemaid hoiatati avaliku korra rikkumise eest. Trepikoda koristati patrulli juuresolekul.',
          'Both were warned for a breach of public order. The stairwell was cleared with the patrol present.',
        ),
      ),
      oc(
        'damage',
        'report',
        [0, 0.3],
        2,
        T(
          'Toa uks oli lõhutud. Alustati menetlust võõra asja rikkumise eest, kahjustatud uks pildistati.',
          'The room door had been broken. Proceedings were opened for damaging someone else’s property and the damaged door was photographed.',
        ),
        { trust: -1 },
      ),
    ],
    escalation: {
      afterMin: 25,
      chance: 0.15,
      toPriority: 2,
      text: T(
        'Teataja: tüli läks kakluseks, üks lõi teist.',
        'Caller: the row has turned into a fight, one of them hit the other.',
      ),
    },
    call: {
      mood: 'angry',
      opening: [
        T(
          'Kuulge, meie trepikoda on kotte täis ja kaks noort karjuvad seal juba pool tundi!',
          'Listen, our stairwell is full of bags and two young people have been shouting there for half an hour!',
        ),
        T(
          'Kaasüürnikud tülitsevad üüri pärast, üks viskas teise asjad trepikotta.',
          'The flatmates are fighting about rent; one threw the other’s things into the stairwell.',
        ),
      ],
      openingRu: [
        'Слушайте, у нас подъезд завален сумками, двое молодых орут уже полчаса!',
        'Соседи по квартире ругаются из-за аренды, один выкинул вещи другого в подъезд.',
      ],
      answers: {
        count: [T('Kaks inimest, need kaasüürnikud.', 'Two people, those flatmates.')],
        children: [T('Ei, lapsi ei ole.', 'No, no children.')],
        weapons: [T('Ei, relva pole. Ainult kotid lendavad.', 'No weapon. Just bags flying.')],
      },
      answersRu: {
        count: ['Двое, эти соседи по квартире.'],
        children: ['Нет, детей нет.'],
        weapons: ['Нет, оружия нет. Только сумки летают.'],
      },
    },
    tags: ['civil'],
  },
  {
    id: 'visiting_brother',
    title: T(
      'Perekonflikt: külas olev sugulane ei lahku',
      'Family argument: a visiting relative will not leave',
    ),
    persons: [vic('F', [30, 65]), sus('M', [30, 65], 'family', { intoxicated: 0.9, record: 0.35 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et paariks päevaks külla tulnud mehe vend on purjus, sõimab peret ja keeldub lahkumast. Füüsilist vägivalda pole olnud.',
        '{address}. A woman reports her husband’s brother, who came to stay for a couple of days, is drunk, swearing at the family and refusing to leave. There has been no physical violence.',
      ),
      T(
        '{address}. Külas olev mehe vend jõi end täis, lõhkus vannitoa kraanikausi ja nõuab veel viina. Pererahvas tahab, et ta lahkuks.',
        '{address}. The husband’s brother, who is staying with them, got drunk, broke the bathroom sink and is demanding more vodka. The family want him to leave.',
      ),
    ],
    callerLines: [
      T(
        'Ta tuli paariks päevaks, aga joob ja sõimab juba teist päeva. Mu mees ei saa temaga hakkama.',
        'He came for a couple of days, but he has been drinking and swearing for two days now. My husband cannot handle him.',
      ),
      T(
        'Me tahame lihtsalt, et ta lahkuks. Ta ütleb, et vend ei saa teda välja visata.',
        'We just want him to leave. He says his brother cannot throw him out.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}, pereisa vend. Elab teises maakonnas.',
        'Suspect: {suspect}, the husband’s brother. Lives in another county.',
      ),
      T('Korteris on ka kaks kooliealist last.', 'Two school-age children are also in the flat.'),
    ],
    beats: [
      qPerson('suspect', 'arrive', { chance: 0.8 }),
      choice(
        6,
        [
          T(
            '{callsign}: külaline on purjus ja keeldub lahkumast, pere tahab ta välja. Kuidas toimime?',
            '{callsign}: the guest is drunk and refuses to leave; the family wants him out. How do we proceed?',
          ),
        ],
        [
          opt(
            'taxi',
            T('Saatke ta taksoga bussijaama', 'Send him by taxi to the bus station'),
            T(
              '{callsign}, juhtimine. Aidake tal asjad kokku panna ja saatke ta taksoga minema.',
              '{callsign}, Control. Help him pack and send him off in a taxi.',
            ),
            { success: 0.1, time: 15 },
          ),
          opt(
            'sober',
            T('Toimetage kainenema', 'Take him to sober up'),
            T(
              '{callsign}, juhtimine. Kui ta ei allu, toimetage kainenema.',
              '{callsign}, Control. If he does not comply, take him to sober up.',
            ),
            { success: 0.05, time: 25 },
          ),
          opt(
            'stay',
            T('Las jääb, tehke hoiatus', 'Let him stay, give a warning'),
            T(
              '{callsign}, juhtimine. Hoiatage teda ja lõpetage.',
              '{callsign}, Control. Warn him and close.',
            ),
            { success: -0.15, trust: -1 },
          ),
        ],
        'taxi',
      ),
    ],
    outcomes: [
      oc(
        'left',
        'resolved',
        [0.45, 1],
        3,
        T(
          'Külaline pakkis patrulli juuresolekul asjad ja sõitis taksoga bussijaama. Perele anti nõu, kuidas edaspidi toimida.',
          'With the patrol present the guest packed his things and took a taxi to the bus station. The family was advised what to do next time.',
        ),
      ),
      oc(
        'sober',
        'warning',
        [0.2, 0.6],
        2,
        T(
          'Mees toimetati kainenema. Perele selgitati, kuidas lõhutud kraanikausi eest kahju hüvitamist nõuda.',
          'The man was taken to sober up. The family was told how to claim compensation for the broken sink.',
        ),
      ),
      oc(
        'threat',
        'report',
        [0, 0.3],
        2,
        T(
          'Lahkudes ähvardas mees venda tappa. Alustati menetlust ähvardamise eest (KarS § 120) ja mees toimetati arestimajja.',
          'As he was leaving the man threatened to kill his brother. Proceedings were opened for threats (KarS § 120) and he was taken to the arrest house.',
        ),
        { arrests: 1, trust: -1 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Mehe vend on meil külas, jõi end täis ja ei lähe ära. Kas te saate aidata?',
          'Hello. My husband’s brother is staying with us, he got drunk and will not leave. Can you help?',
        ),
        T(
          'Mehe vend jõi end täis, lõhkus kraanikausi ja ei lähe ära.',
          'My husband’s brother got drunk, broke the sink and will not leave.',
        ),
      ],
      openingRu: [
        'Здравствуйте. У нас в гостях брат мужа, напился и не уходит. Можете помочь?',
        'Брат мужа напился, разбил раковину и не уходит.',
      ],
      answers: {
        suspect: [
          T(
            'Mu mehe vend. Ta on köögis ja nõuab viina.',
            'My husband’s brother. He is in the kitchen demanding vodka.',
          ),
        ],
        children: [
          T('Jah, lapsed on oma toas, neil on hirm.', 'Yes, the kids are in their room, they are scared.'),
        ],
        weapons: [T('Ei, relva ei ole.', 'No, no weapon.')],
        intoxicated: [T('Väga purjus, juba teist päeva järjest.', 'Very drunk, two days in a row now.')],
      },
      answersRu: {
        suspect: ['Брат моего мужа. Он на кухне и требует водку.'],
        children: ['Да, дети у себя в комнате, им страшно.'],
        weapons: ['Нет, оружия нет.'],
        intoxicated: ['Очень пьяный, уже второй день подряд.'],
      },
    },
    tags: ['alcohol'],
  },
];

// ── domestic_son_vs_parent ──────────────────────────────────────────────────
const SC_SON_VS_PARENT: IncidentScenario[] = [
  {
    id: 'vodka_money',
    persons: [vic('F', [60, 90]), sus('M', [22, 50], 'family', { intoxicated: 0.85, record: 0.5 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Eakas naine teatab, et täiskasvanud poeg nõudis viinaraha, lükkas ta pikali ja lõhub kodus asju.',
        '{address}. An elderly woman reports that her adult son demanded money for vodka, pushed her over and is smashing things at home.',
      ),
      T(
        '{address}. Eakas naine teatab, et poeg nõudis pensionipäeval raha, lükkas ta vastu kappi ja otsib nüüd korterist rahakotti.',
        '{address}. An elderly woman reports her son demanded money on pension day, shoved her into a cupboard and is now searching the flat for her purse.',
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
    callerLinesRu: [
      'Сын опять пьяный... толкнул меня, я {упал|упала}, когда денег не {дал|дала}.',
      'Я не хочу, чтобы его посадили, но я его боюсь.',
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
    call: {
      mood: 'elderly',
      opening: [
        T(
          'Halloo... kas see on politsei? Mu poeg... ta lükkas mind.',
          'Hello... is that the police? My son... he pushed me.',
        ),
        T(
          'Poeg nõudis viinaraha ja lükkas mu pikali, kui ma ei andnud.',
          'My son demanded money for vodka and pushed me over when I would not give it.',
        ),
      ],
      openingRu: [
        'Алло... это полиция? Сын опять пьяный, толкнул меня, требует деньги на водку.',
        'Сын требовал деньги на водку и толкнул меня, когда я не дала.',
      ],
      answers: {
        injured: [T('Käsi valutab, aga ma saan hakkama.', 'My arm hurts, but I will manage.')],
        suspect: [T('See on mu poeg, ta elab minuga.', 'It is my son, he lives with me.')],
        intoxicated: [T('Purjus, nagu iga päev.', 'Drunk, like every day.')],
        safe: [
          T('Ma olen köögis, tema on toas ja karjub.', 'I am in the kitchen; he is in the room shouting.'),
        ],
        children: [T('Ei, ainult mina ja poeg.', 'No, just me and my son.')],
      },
      answersRu: {
        injured: ['Рука болит, но я справлюсь.'],
        suspect: ['Это мой сын, он живёт со мной.'],
        intoxicated: ['Пьяный, как каждый день.'],
        safe: ['Я на кухне, а он в комнате и кричит.'],
        children: ['Нет, только я и сын.'],
      },
    },
  },
  {
    id: 'daughter_calls_bank_card',
    title: T('Täiskasvanud poeg ründas ema, õde helistab', 'Adult son attacked his mother, his sister calls'),
    persons: [
      vic('F', [60, 88]),
      sus('M', [25, 50], 'family', { intoxicated: 0.6, record: 0.5 }),
      { role: 'caller', gender: 'F', age: [30, 60], relation: 'family' },
    ],
    summary: [
      T(
        '{address}. Helistab tütar teisest linnast: vend võttis ema pangakaardi ja lükkas ema pikali, ema helistas talle nuttes. Ema ja vend on korteris.',
        '{address}. A daughter is calling from another town: her brother took their mother’s bank card and pushed her over, and the mother rang her in tears. The mother and the brother are in the flat.',
      ),
      T(
        '{address}. Tütre teatel kasutab vend ema pensionikaarti ja lõi ema, kui too keelas. Ema ise politseisse helistada ei julge.',
        '{address}. According to the daughter, her brother uses their mother’s pension card and hit her when she tried to stop him. The mother does not dare call the police herself.',
      ),
    ],
    callerLines: [
      T(
        'Ema helistas mulle nuttes, ta ei julge ise teile helistada. Vend võttis jälle ta kaardi.',
        'Mum rang me crying, she does not dare call you herself. My brother took her card again.',
      ),
      T(
        'Ma olen kolmesaja kilomeetri kaugusel, ma ei saa ise minna. Palun vaadake, kas ema on terve.',
        'I am three hundred kilometres away, I cannot go myself. Please check that mum is all right.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}, kannatanu poeg. Elab emaga koos.',
        'Suspect: {suspect}, the victim’s son. Lives with his mother.',
      ),
      T(
        'Teataja ei ole sündmuskohal. Tema sõnul on ema kontolt viimasel kuul kogu pension välja võetud.',
        'The caller is not at the scene. She says the mother’s entire pension was withdrawn from her account last month.',
      ),
    ],
    agencies: [
      {
        agency: 'kov',
        chance: 0.5,
        reason: T('Eakas vajab sotsiaaltöötaja abi', 'The elderly woman needs a social worker'),
      },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: ema avas ukse, käsivarrel sinikad. Poeg magab toas, ema rahakott on tema taskus.',
          '{callsign}: the mother opened the door with bruises on her arm. The son is asleep in the room with her purse in his pocket.',
        ),
      ]),
      qPerson('suspect', 4),
      aggressorChoice(9, [
        T(
          '{callsign}: poeg ärkas, ema pangakaart oli tema taskus. Ema palub teda mitte viia. Kuidas toimime?',
          '{callsign}: the son woke up; his mother’s bank card was in his pocket. She begs us not to take him. How do we proceed?',
        ),
      ]),
      agency('kov', 14, {
        chance: 0.5,
        radio: [
          T(
            '{callsign}: eakas vajab sotsiaaltöötajat ja abi rahaasjade korraldamisel, palun teavitage omavalitsust.',
            '{callsign}: the elderly woman needs a social worker and help with her finances, please notify the municipality.',
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
          'Poeg peeti kinni. Alustati kriminaalmenetlust kehalise väärkohtlemise ja pangakaardi omastamise eest, emale korraldati uus kaart ja sotsiaaltöötaja abi.',
          'The son was detained. Criminal proceedings were opened for assault and taking the bank card; the mother was arranged a new card and help from a social worker.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'ban',
        'report',
        [0.35, 0.75],
        3,
        T(
          'Pojale kohaldati viibimiskeeld ja ta lahkus. Kaart tagastati emale, alustati kriminaalmenetlust KarS § 121 järgi. Tütar sõidab homme ema juurde.',
          'The son was given a removal order and left. The card was returned to the mother and criminal proceedings were opened under KarS § 121. The daughter is driving over tomorrow.',
        ),
        { trust: 1 },
      ),
      oc(
        'declined',
        'warning',
        [0.15, 0.45],
        2,
        T(
          'Ema keeldus ütlustest ja kaart leiti köögist. Poega hoiatati, juhtum registreeriti LSV-na ja edastati omavalitsusele.',
          'The mother declined to give a statement and the card was found in the kitchen. The son was warned; the case was logged as domestic and passed to the municipality.',
        ),
      ),
      oc(
        'hip',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Emal kahtlustati puusamurdu ja ta toimetati haiglasse. Poeg peeti kinni.',
          'The mother was suspected of a broken hip and taken to hospital. The son was detained.',
        ),
        { arrests: 1, injuries: 1, trust: -3 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, ma helistan teisest linnast. Mu vend lõi meie ema ja võttis tema pangakaardi.',
          'Hello, I am calling from another town. My brother hit our mother and took her bank card.',
        ),
        T(
          'Vend võttis ema pangakaardi ja lükkas ta pikali. Ema helistas mulle nuttes.',
          'My brother took mum’s bank card and pushed her over. Mum rang me crying.',
        ),
      ],
      openingRu: [
        'Здравствуйте, я звоню из другого города. Брат ударил нашу маму и забрал её банковскую карту.',
        'Брат забрал у мамы банковскую карту и толкнул её. Мама позвонила мне в слезах.',
      ],
      answers: {
        where: [
          T(
            'Ema aadress on {address}. Ise olen ma kaugel.',
            'Mum’s address is {address}. I am far away myself.',
          ),
        ],
        safe: [T('Mina olen kodus. Aga ema on temaga kahekesi!', 'I am at home. But mum is alone with him!')],
        injured: [
          T('Ema ütles, et käsi valutab. Rohkem ma ei tea.', 'Mum said her arm hurts. That is all I know.'),
        ],
        suspect: [
          T(
            'Mu vend, ta elab emaga koos. Ta joob ega tööta.',
            'My brother, he lives with mum. He drinks and does not work.',
          ),
        ],
        children: [T('Ei, seal on ainult ema ja vend.', 'No, just mum and my brother.')],
      },
      answersRu: {
        where: ['Мамин адрес: {address}. Я сама далеко.'],
        safe: ['Я дома. Но мама там с ним одна!'],
        injured: ['Мама сказала, что рука болит. Больше я ничего не знаю.'],
        suspect: ['Мой брат, он живёт с мамой. Пьёт и не работает.'],
        children: ['Нет, там только мама и брат.'],
      },
    },
    tags: ['elderly'],
  },
  {
    id: 'daughter_vs_father',
    title: T('Täiskasvanud tütar ründas eakat isa', 'Adult daughter attacked her elderly father'),
    persons: [vic('M', [65, 90]), sus('F', [28, 50], 'family', { intoxicated: 0.7, record: 0.4 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Eakas mees teatab, et tütar tuli raha küsima, tõukas teda ja lõi telefoniga. Tütar on endiselt korteris ja karjub.',
        '{address}. An elderly man reports his daughter came asking for money, shoved him and hit him with a phone. She is still in the flat shouting.',
      ),
      T(
        '{address}. Sõltuvusprobleemiga tütar nõuab eakalt isalt raha, lõhkus vaasi ja lükkas isa pikali. Isa liigub kepiga.',
        '{address}. A daughter with an addiction problem is demanding money from her elderly father; she smashed a vase and pushed him over. The father walks with a stick.',
      ),
    ],
    callerLines: [
      T(
        'Mu tütar... ta on jälle mingi aine all. Ma ei andnud raha ja ta lükkas mu pikali.',
        'My daughter... she is on something again. I would not give her money and she pushed me over.',
      ),
      T(
        'Ma olen vana mees, ma ei jaksa temaga maadelda. Palun tulge.',
        'I am an old man, I cannot wrestle with her. Please come.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}, kannatanu tütar. Teadaolevalt sõltuvusprobleemid.',
        'Suspect: {suspect}, the victim’s daughter. Known addiction problems.',
      ),
      T('Kannatanu liigub kepiga ja kukkus.', 'The victim walks with a stick and fell.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.4, reason: T('Eakas kukkus', 'Elderly man fell') }],
    beats: [
      qPerson('suspect', 'arrive', {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Palun kontrolli tütart {name}, isikukood {idcode}. Kas tal on varasemaid sündmusi?',
            'Control, {callsign}. Please check the daughter {name}, ID code {idcode}. Any previous incidents?',
          ),
        ],
      }),
      kiirabi(3, {
        chance: 0.4,
        radio: [
          T(
            '{callsign}: vanahärra kukkus ja puus valutab, palun kiirabi.',
            '{callsign}: the old man fell and his hip hurts, request an ambulance.',
          ),
        ],
      }),
      aggressorChoice(
        9,
        [
          T(
            '{callsign}: tütar on narkojoobes ja rahutu, isa ei taha avaldust teha. Kuidas toimime?',
            '{callsign}: the daughter is high and restless; the father does not want to make a complaint. How do we proceed?',
          ),
        ],
        'F',
      ),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        2,
        T(
          'Tütar peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi, tütrele anti sõltuvusravi kontaktid.',
          'The daughter was detained and taken to the arrest house. Criminal proceedings were opened under KarS § 121 and she was given addiction treatment contacts.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'ban',
        'report',
        [0.35, 0.75],
        3,
        T(
          'Tütrele kohaldati viibimiskeeld ja ta lahkus. Isale anti ohvriabi kontaktid, omavalitsust teavitati.',
          'The daughter was given a removal order and left. The father was given victim support contacts and the municipality was notified.',
        ),
        { trust: 1 },
      ),
      oc(
        'left',
        'warning',
        [0.15, 0.45],
        2,
        T(
          'Tütar rahunes ja lahkus patrulli juuresolekul. Isa keeldus avaldusest, sündmus registreeriti LSV-na.',
          'The daughter calmed down and left with the patrol present. The father declined to make a complaint; the event was logged as domestic.',
        ),
      ),
      oc(
        'hip',
        'hospital',
        [0, 0.25],
        1,
        T(
          'Isal tuvastati reieluukaela murd ja ta toimetati haiglasse. Tütar peeti kinni.',
          'The father had a broken hip and was taken to hospital. The daughter was detained.',
        ),
        { arrests: 1, injuries: 1, trust: -3 },
      ),
    ],
    call: {
      mood: 'elderly',
      opening: [
        T(
          'Halloo... mu tütar lükkas mu pikali. Ta tahab raha.',
          'Hello... my daughter pushed me over. She wants money.',
        ),
        T(
          'Tütar nõudis raha ja lükkas mu pikali, ma ei saa üles.',
          'My daughter demanded money and pushed me over, I cannot get up.',
        ),
      ],
      openingRu: [
        'Алло... дочь толкнула меня, я упал. Она требует деньги.',
        'Дочь требовала деньги и толкнула меня, я не могу встать.',
      ],
      answers: {
        suspect: [
          T('Mu tütar. Ta ei ole täna päris tema ise.', 'My daughter. She is not quite herself today.'),
        ],
        intoxicated: [
          T(
            'Ma arvan, et ta on midagi võtnud. Silmad on imelikud.',
            'I think she has taken something. Her eyes look strange.',
          ),
        ],
        injured: [
          T('Puus valutab, ma kukkusin. Istun põrandal.', 'My hip hurts, I fell. I am sitting on the floor.'),
        ],
        children: [T('Ei, ainult mina ja tütar.', 'No, just me and my daughter.')],
        weapons: [T('Ei, ta lõi telefoniga.', 'No, she hit me with her phone.')],
      },
      answersRu: {
        suspect: ['Моя дочь. Она сегодня сама не своя.'],
        intoxicated: ['Думаю, она что-то приняла. Глаза какие-то странные.'],
        injured: ['Бедро болит, я упал. Сижу на полу.'],
        children: ['Нет, только я и дочь.'],
        weapons: ['Нет, она ударила меня телефоном.'],
      },
    },
    tags: ['elderly'],
  },
  {
    id: 'mother_locked_on_balcony',
    title: T('Täiskasvanud poeg lukustas ema rõdule', 'Adult son locked his mother out on the balcony'),
    persons: [vic('F', [62, 90]), sus('M', [25, 50], 'family', { intoxicated: 0.9, record: 0.4 }), NEIGHBOUR],
    summary: [
      T(
        '{address}. Naabri teatel seisab eakas naine öösärgis rõdul ja palub abi. Joobes poeg lukustas ta rõdule ja jäi toas magama.',
        '{address}. A neighbour reports an elderly woman standing on her balcony in a nightdress asking for help. Her drunk son locked her out on the balcony and fell asleep inside.',
      ),
      T(
        '{address}. Eakas naine koputab rõdul klaasi ja nutab. Naabri sõnul pani poeg ta tüli järel rõdule ja ei ava ust.',
        '{address}. An elderly woman is knocking on the balcony glass and crying. The neighbour says her son put her out there after a row and will not open the door.',
      ),
    ],
    callerLines: [
      T(
        'Ta seisab rõdul ainult öösärgis ja väriseb. Poeg ei tee ust lahti.',
        'She is standing on the balcony in just her nightdress, shivering. Her son will not open the door.',
      ),
      T(
        'Ma andsin talle üle rõdu oma teki, aga ta on seal juba tund aega.',
        'I passed her my blanket across the balcony, but she has been out there for an hour.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}, kannatanu poeg. Tugevas joobes, magab.',
        'Suspect: {suspect}, the victim’s son. Heavily drunk, asleep.',
      ),
      T('Kannatanu on rõdul, alajahtumise oht.', 'The victim is on the balcony; risk of hypothermia.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.5, reason: T('Alajahtumise oht', 'Risk of hypothermia') }],
    beats: [
      choice(
        'arrive',
        [
          T(
            '{callsign}: poeg ei ava, ema on rõdul ja külmetab. Kas murrame ukse või kutsume päästjad?',
            '{callsign}: the son will not open and the mother is freezing on the balcony. Do we force the door or call rescue?',
          ),
        ],
        [
          opt(
            'force',
            T('Murdke uks, oht tervisele', 'Force the door, risk to health'),
            T(
              '{callsign}, juhtimine. Sisenege, eakas tuleb kohe tuppa saada.',
              '{callsign}, Control. Go in, she must be brought inside now.',
            ),
            { success: 0.15, time: 5 },
          ),
          opt(
            'rescue',
            T('Kutsuge päästjad ust avama', 'Call rescue to open the door'),
            T(
              '{callsign}, juhtimine. Päästjad on teel, hoidke rõduga kontakti.',
              '{callsign}, Control. Rescue is on the way, keep in contact with the balcony.',
            ),
            { success: 0.05, time: 15 },
          ),
        ],
        'force',
        { timeoutMin: 3 },
      ),
      kiirabi(3, {
        chance: 0.5,
        radio: [
          T(
            '{callsign}: eakas on läbi külmunud, palun kiirabi.',
            '{callsign}: the elderly woman is chilled through, request an ambulance.',
          ),
        ],
      }),
      qPerson('suspect', 6),
      toArrest(14, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Ema toodi tuppa ja soojendati, poeg peeti kinni. Alustati kriminaalmenetlust, omavalitsust teavitati eaka abivajadusest.',
          'The mother was brought inside and warmed up, and the son was detained. Criminal proceedings were opened and the municipality was told she needs support.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'ban',
        'report',
        [0.3, 0.7],
        2,
        T(
          'Pojale kohaldati viibimiskeeld ja ta viidi kainenema. Ema jäi naabri hoole alla, sündmusest teavitati omavalitsust.',
          'The son was given a removal order and taken to sober up. The mother stayed with the neighbour and the municipality was informed.',
        ),
        { trust: 1 },
      ),
      oc(
        'cold',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Ema toimetati alajahtumisega haiglasse. Poeg peeti kinni ja alustati kriminaalmenetlust.',
          'The mother was taken to hospital with hypothermia. The son was detained and criminal proceedings were opened.',
        ),
        { arrests: 1, injuries: 1, trust: -3 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, naabriproua seisab öösärgis rõdul, poeg lukustas ta välja!',
          'Hello, the old lady next door is standing on her balcony in her nightdress, her son locked her out!',
        ),
        T(
          'Poeg pani ema rõdule ja jäi ise tuppa magama. Ema väriseb külmast.',
          'The son put his mother out on the balcony and fell asleep inside. She is shivering with cold.',
        ),
      ],
      openingRu: [
        'Здравствуйте, соседка стоит на балконе в ночной рубашке, сын запер её снаружи!',
        'Сын выставил мать на балкон и уснул. Она дрожит от холода.',
      ],
      answers: {
        where: [
          T(
            '{address}, ta on rõdul, ma näen teda oma rõdult.',
            '{address}, she is on her balcony, I can see her from mine.',
          ),
        ],
        injured: [T('Ta väriseb ja huuled on sinised.', 'She is shivering and her lips are blue.')],
        suspect: [
          T('Tema poeg, ta joob. Praegu vist magab.', 'Her son, he drinks. He is probably asleep now.'),
        ],
        children: [T('Ei, ainult tema ja poeg.', 'No, just her and her son.')],
        safe: [T('Mina olen oma rõdul, minuga on kõik korras.', 'I am on my own balcony, I am fine.')],
      },
      answersRu: {
        where: ['{address}, она на балконе, я её со своего балкона вижу.'],
        injured: ['Она дрожит, и губы синие.'],
        suspect: ['Её сын, он пьёт. Сейчас, наверное, спит.'],
        children: ['Нет, только она и сын.'],
        safe: ['Я на своём балконе, со мной всё в порядке.'],
      },
    },
    tags: ['elderly', 'alcohol'],
  },
  {
    id: 'son_psychosis',
    title: T('Täiskasvanud poeg psühhoosis, ema kardab', 'Adult son in psychosis, his mother is afraid'),
    persons: [vic('F', [50, 80]), sus('M', [20, 45], 'family', { intoxicated: 0.05, record: 0.2 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Ema teatab, et täiskasvanud poeg on jätnud ravimid võtmata, usub, et ema mürgitas tema toitu, loobib asju ja on end oma tuppa barrikadeerinud.',
        '{address}. A mother reports her adult son has stopped taking his medication, believes she poisoned his food, is throwing things and has barricaded himself in his room.',
      ),
      T(
        '{address}. Psüühikahäirega poeg ähvardab ema ja räägib, et teda jälgitakse. Ema on köögis, poeg lõhub toas mööblit.',
        '{address}. A son with a mental illness is threatening his mother and saying he is being watched. She is in the kitchen; he is smashing furniture in his room.',
      ),
    ],
    callerLines: [
      T(
        'Ta ei ole juba kaks nädalat rohtu võtnud. Ta arvab, et ma tahan teda mürgitada.',
        'He has not taken his medicine for two weeks. He thinks I want to poison him.',
      ),
      T(
        'Ta ei ole kuri inimene, ta on haige. Aga täna ma kardan teda.',
        'He is not a bad person, he is ill. But tonight I am afraid of him.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Ema sõnul skisofreenia diagnoos, ravimid võtmata.',
        'Suspect: {suspect}. According to his mother he has schizophrenia and is off his medication.',
      ),
      T(
        'Poeg on oma toas, ukse taha on lükatud kapp.',
        'The son is in his room with a wardrobe pushed against the door.',
      ),
    ],
    agencies: [
      {
        agency: 'kiirabi',
        chance: 0.9,
        reason: T('Vajalik psühhiaatriline hinnang', 'Psychiatric assessment needed'),
      },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: poeg on toas barrikaadi taga ja räägib segaselt jälgimisest. Ema on köögis, vigastusi pole.',
          '{callsign}: the son is behind a barricade in his room, talking confusedly about being watched. The mother is in the kitchen, no injuries.',
        ),
      ]),
      kiirabi(3, {
        radio: [
          T(
            '{callsign}: isikul psühhoosi tunnused, palun kiirabi psühhiaatriliseks hindamiseks.',
            '{callsign}: the man shows signs of psychosis, request an ambulance for a psychiatric assessment.',
          ),
        ],
      }),
      choice(
        6,
        [
          T(
            '{callsign}: poeg ei tule välja ja ähvardab endale haiget teha. Kas siseneme või räägime edasi ja ootame kiirabi?',
            '{callsign}: the son will not come out and threatens to hurt himself. Do we go in, or keep talking and wait for the ambulance?',
          ),
        ],
        [
          opt(
            'talk',
            T('Rääkige, oodake kiirabi', 'Keep talking, wait for the ambulance'),
            T(
              '{callsign}, juhtimine. Hoidke rahulikku kontakti, kiirabi on teel.',
              '{callsign}, Control. Keep calm contact, the ambulance is on its way.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'enter',
            T('Sisenege ja ohjeldage', 'Go in and restrain him'),
            T(
              '{callsign}, juhtimine. Sisenege ettevaatlikult ja ohjeldage.',
              '{callsign}, Control. Go in carefully and restrain him.',
            ),
            { success: 0.05, risk: 0.1 },
          ),
        ],
        'talk',
      ),
    ],
    outcomes: [
      oc(
        'agreed',
        'referred',
        [0.5, 1],
        3,
        T(
          'Poeg nõustus kiirabiga psühhiaatriakliinikusse minema. Kuritegu ei tuvastatud, emale anti psühhiaatrilise abi ja lähedaste nõustamise kontaktid.',
          'The son agreed to go to the psychiatric clinic with the ambulance. No offence was found; the mother was given contacts for psychiatric help and counselling for relatives.',
        ),
      ),
      oc(
        'involuntary',
        'hospital',
        [0.25, 0.65],
        2,
        T(
          'Poeg ohjeldati ja toimetati kiirabiga psühhiaatriakliinikusse tahtest olenematule ravile. Ema jäi koju naabri toel.',
          'The son was restrained and taken by ambulance to the psychiatric clinic for involuntary treatment. The mother stayed at home with a neighbour’s support.',
        ),
      ),
      oc(
        'selfharm',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Poeg vigastas end enne sisenemist klaasikildudega ja toimetati haiglasse. Emale pakuti kriisiabi.',
          'The son injured himself with broken glass before officers got in and was taken to hospital. The mother was offered crisis support.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    call: {
      mood: 'whisper',
      opening: [
        T(
          '(vaikselt) Tere... mu poeg ei ole rohtu võtnud ja arvab, et ma mürgitan teda. Ta lõhub toas.',
          '(quietly) Hello... my son has not taken his medicine and thinks I am poisoning him. He is smashing up his room.',
        ),
        T(
          '(vaikselt) Ta on end tuppa barrikadeerinud ja räägib, et teda jälgitakse.',
          '(quietly) He has barricaded himself in his room and says he is being watched.',
        ),
      ],
      openingRu: [
        '(тихо) Алло... сын не пьёт лекарства и думает, что я его травлю. Он громит комнату.',
        '(тихо) Он забаррикадировался в комнате и говорит, что за ним следят.',
      ],
      answers: {
        suspect: [T('Mu poeg. Tal on skisofreenia.', 'My son. He has schizophrenia.')],
        intoxicated: [
          T(
            'Ei, ta ei joo. Ta on lihtsalt ilma ravimiteta.',
            'No, he does not drink. He is just off his medication.',
          ),
        ],
        weapons: [
          T(
            'Ma ei tea, mis tal toas on. Köögist on üks nuga puudu.',
            'I do not know what he has in his room. One knife is missing from the kitchen.',
          ),
        ],
        children: [T('Ei, ainult meie kahekesi.', 'No, just the two of us.')],
        safe: [T('Ma olen köögis, uks on kinni.', 'I am in the kitchen with the door shut.')],
      },
      answersRu: {
        suspect: ['Мой сын. У него шизофрения.'],
        intoxicated: ['Нет, он не пьёт. Он просто без лекарств.'],
        weapons: ['Не знаю, что у него в комнате. С кухни пропал один нож.'],
        children: ['Нет, только мы вдвоём.'],
        safe: ['Я на кухне, дверь закрыта.'],
      },
    },
    tags: ['mental'],
  },
];

// ── domestic_restraining_breach ─────────────────────────────────────────────
const Q_RESTRAINING: Text[] = [
  T(
    'Juhtimiskeskus, {callsign}. Palun kontrolli {name}, isikukood {idcode}. Kas tal on kehtiv lähenemiskeeld?',
    'Control, {callsign}. Please check {name}, ID code {idcode}. Does he have a valid restraining order?',
  ),
];

const SC_RESTRAINING_BREACH: IncidentScenario[] = [
  {
    id: 'at_the_door',
    persons: [
      vic('F', [22, 55]),
      sus('M', [25, 55], 'ex_partner', { restraining: 0.95, record: 0.7, intoxicated: 0.4 }),
    ],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et endine elukaaslane, kellele kohus on määranud lähenemiskeelu, seisab ukse taga ja nõuab sisselaskmist.',
        '{address}. A woman reports that her ex-partner, who is under a court restraining order, is standing outside her door demanding to be let in.',
      ),
      T(
        '{address}. Lähenemiskeelu all olev endine mees helistab uksekella ja lubab ukse maha võtta, kui naine ei ava. Naine on lastega kodus.',
        '{address}. An ex-partner under a restraining order is ringing the doorbell and says he will take the door down if she does not open. She is at home with the children.',
      ),
    ],
    callerLines: [
      T(
        'Tal on lähenemiskeeld, aga ta on jälle siin! Ta peksab ust ja karjub.',
        'He has a restraining order but he is here again! He is banging on the door and shouting.',
      ),
      T(
        'Kohus andis talle keelu, aga ta seisab jälle ukse taga ja helistab kella.',
        'The court gave him an order, but he is standing at my door again ringing the bell.',
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
      info('arrive', [
        T(
          '{callsign}: mees on trepikojas ukse taga, rahutu. Võtame ta kontrolli alla.',
          '{callsign}: the man is in the stairwell outside the door, agitated. Taking control of him.',
        ),
      ]),
      qPerson('suspect', 2, { radio: Q_RESTRAINING }),
      toArrest(10, { chance: 0.75 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees peeti trepikojas kinni. Alustati kriminaalmenetlust lähenemiskeelu rikkumise eest (KarS § 331²), naisele anti ohvriabi kontaktid.',
          'The man was detained in the stairwell. Criminal proceedings were opened for breaching the restraining order (KarS § 331²) and the woman was given victim support contacts.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'removed',
        'report',
        [0.3, 0.6],
        2,
        T(
          'Mees eemaldati trepikojast ja rikkumine vormistati. Alustati kriminaalmenetlust, prokuratuurile tehti ettepanek keelu tingimusi karmistada.',
          'The man was removed from the stairwell and the breach recorded. Criminal proceedings were opened and the prosecutor was asked to tighten the terms of the order.',
        ),
      ),
      oc(
        'ran',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees jooksis patrulli nähes keldrikorruse kaudu minema. Rikkumine on tõendatud uksekella kaamera salvestisega, mees kuulutati tagaotsitavaks.',
          'The man ran off through the basement when he saw the patrol. The breach is proven by the doorbell camera recording and he was put on the wanted list.',
        ),
        { trust: -3 },
      ),
    ],
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mu endine mees on jälle ukse taga, tal on lähenemiskeeld!',
          'My ex is outside my door again, he has a restraining order!',
        ),
        T(
          'Kohus keelas tal minu juurde tulla, aga ta peksab jälle ust.',
          'The court banned him from coming near me, but he is banging on my door again.',
        ),
      ],
      openingRu: [
        'Мой бывший опять стоит за дверью, а ему запрещено ко мне подходить!',
        'Суд запретил ему ко мне подходить, а он опять ломится в дверь.',
      ],
      answers: {
        suspect: [
          T(
            'Ta on mu endine elukaaslane, kohus andis keelu kevadel.',
            'He is my ex-partner, the court gave the order in spring.',
          ),
        ],
        weapons: [T('Ma ei tea, varem on tal nuga olnud.', 'I do not know, he has had a knife before.')],
        safe: [
          T(
            'Uks on lukus ja ketis. Ma olen magamistoas.',
            'The door is locked and chained. I am in the bedroom.',
          ),
        ],
        children: [
          T('Jah, lapsed on minuga, nad on hirmul.', 'Yes, the children are with me, they are frightened.'),
        ],
      },
      answersRu: {
        suspect: ['Это мой бывший сожитель, суд весной запретил ему подходить.'],
        weapons: ['Не знаю, раньше у него был нож.'],
        safe: ['Дверь закрыта и на цепочке. Я в спальне.'],
        children: ['Да, дети со мной, они напуганы.'],
      },
    },
  },
  {
    id: 'flowers_and_car',
    title: T('Lähenemiskeelu rikkumine: mees ootab autos', 'Restraining order breach: man waiting in a car'),
    persons: [
      vic('F', [22, 55]),
      sus('M', [25, 58], 'ex_partner', { restraining: 0.95, record: 0.6, intoxicated: 0.15 }),
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine leidis ukse eest lilled ja kirja endiselt elukaaslaselt, kellel on lähenemiskeeld. Mees istub teisel pool tänavat autos ja jälgib maja.',
        '{address}. A woman found flowers and a letter at her door from her ex-partner, who is under a restraining order. He is sitting in a car across the street watching the building.',
      ),
      T(
        '{address}. Lähenemiskeelu all olev mees on juba kolmandat õhtut maja ees autos. Sõiduk: {car}, reg nr {plate}.',
        '{address}. A man under a restraining order has been parked outside the building for the third evening running. Vehicle: {car}, plate {plate}.',
      ),
    ],
    callerLines: [
      T(
        'Ukse ees olid roosid ja kiri, et ta ei loobu minust kunagi. Ja nüüd ta istub all autos.',
        'There were roses at my door and a letter saying he will never give up on me. And now he is sitting in his car downstairs.',
      ),
      T(
        'Ta ei tule uksele, ta lihtsalt istub ja vaatab mu akent. See on veel hirmsam.',
        'He does not come to the door, he just sits there watching my window. That is even scarier.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Lähenemiskeeld keelab tal maja juurde tulla.',
        'Suspect: {suspect}. The restraining order bans him from coming near the building.',
      ),
      T(
        'Sõiduk: {car}, reg nr {plate}, seisab maja vastas.',
        'Vehicle: {car}, plate {plate}, parked opposite the building.',
      ),
    ],
    agencies: [],
    beats: [
      qVehicle('arrive'),
      qPerson('suspect', 3, { radio: Q_RESTRAINING }),
      choice(
        6,
        [
          T(
            '{callsign}: mees on autos, rahulik, ütleb et "lihtsalt istub". Kirjal on tema allkiri. Kuidas toimime?',
            '{callsign}: the man is in the car, calm, says he is "just sitting". The letter is signed by him. How do we proceed?',
          ),
        ],
        [
          opt(
            'detain',
            T('Pidage kinni keelu rikkumise eest', 'Detain him for the breach'),
            T(
              '{callsign}, juhtimine. Keeld on kehtiv, pidage kinni.',
              '{callsign}, Control. The order is valid, detain him.',
            ),
            { success: 0.15, arrests: 1, time: 20 },
          ),
          opt(
            'away',
            T('Saatke minema, vormistage rikkumine', 'Send him away, record the breach'),
            T(
              '{callsign}, juhtimine. Vormistage rikkumine ja saatke ta minema.',
              '{callsign}, Control. Record the breach and send him on his way.',
            ),
            { success: -0.05, time: 10 },
          ),
        ],
        'detain',
      ),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees peeti kinni. Lilled ja kiri võeti asitõenditeks, alustati kriminaalmenetlust lähenemiskeelu rikkumise eest (KarS § 331²).',
          'The man was detained. The flowers and the letter were taken as evidence and criminal proceedings were opened for breaching the restraining order (KarS § 331²).',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'recorded',
        'report',
        [0.3, 0.6],
        2,
        T(
          'Rikkumine vormistati ja mees lahkus. Alustati kriminaalmenetlust, naisele anti nõu kõik kirjad ja sõnumid alles hoida.',
          'The breach was recorded and the man left. Criminal proceedings were opened and the woman was advised to keep every letter and message.',
        ),
      ),
      oc(
        'drove_off',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees sõitis patrulli nähes minema. Rikkumine on tõendatud kirja ja naabri videoga, mees kuulutati tagaotsitavaks.',
          'The man drove off when he saw the patrol. The breach is proven by the letter and a neighbour’s video; he was put on the wanted list.',
        ),
        { trust: -2 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Mu endisel mehel on lähenemiskeeld, aga ta jättis ukse taha lilled ja istub nüüd maja ees autos.',
          'Hello. My ex-husband has a restraining order, but he left flowers at my door and is now sitting in a car outside the building.',
        ),
        T(
          'Ukse taga olid lilled ja kiri ning ta istub maja ees autos ja vaatab mu akent.',
          'There were flowers and a letter at my door, and he is sitting in his car outside watching my window.',
        ),
      ],
      openingRu: [
        'Здравствуйте. Бывшему мужу запрещено ко мне подходить, а он оставил цветы под дверью и сидит в машине у дома.',
        'Под дверью цветы и письмо, а он сидит в машине у дома и смотрит в моё окно.',
      ],
      answers: {
        vehicle: [
          T(
            '{car}, number {plate}. See seisab otse vastas.',
            '{car}, plate {plate}. It is parked right opposite.',
          ),
        ],
        direction: [
          T(
            'Ta on veel autos, ma näen teda aknast.',
            'He is still in the car, I can see him from the window.',
          ),
        ],
        weapons: [
          T('Ma ei tea. Ta ei ole autost väljunud.', 'I do not know. He has not got out of the car.'),
        ],
        safe: [T('Jah, ma olen kodus, uks on lukus.', 'Yes, I am at home with the door locked.')],
        children: [T('Ei, ma olen üksi.', 'No, I am alone.')],
      },
      answersRu: {
        vehicle: ['{car}, номер {plate}. Стоит прямо напротив.'],
        direction: ['Он ещё в машине, я его из окна вижу.'],
        weapons: ['Не знаю. Он из машины не выходил.'],
        safe: ['Да, я дома, дверь закрыта.'],
        children: ['Нет, я одна.'],
      },
    },
    tags: ['stalking'],
  },
  {
    id: 'electronic_alarm',
    title: T(
      'Lähenemiskeelu rikkumine: jälgimisseadme häire',
      'Restraining order breach: electronic tag alarm',
    ),
    persons: [
      vic('F', [22, 55]),
      sus('M', [25, 58], 'ex_partner', { restraining: 1, record: 0.8, intoxicated: 0.4 }),
      { role: 'caller', gender: 'any', age: [25, 55], relation: 'employee' },
    ],
    summary: [
      T(
        '{address}. Elektroonilise valve keskus teatab: lähenemiskeelu all oleva mehe jälgimisseade sisenes keelualasse ja läheneb kannatanu elukohale. Kannatanu telefonile ei vasta.',
        '{address}. The electronic monitoring centre reports that the tag of a man under a restraining order has entered the exclusion zone and is approaching the victim’s home. The victim is not answering her phone.',
      ),
      T(
        '{address}. Valvekeskuse häire: lähenemiskeelu rikkuja on kannatanu elukohast 50 meetri kaugusel ja liigub edasi. Kannatanu on teavitatud ja lukustas end korterisse.',
        '{address}. Monitoring centre alarm: the man breaching a restraining order is 50 metres from the victim’s home and still moving. The victim has been warned and has locked herself in.',
      ),
    ],
    callerLines: [
      T(
        'Elektroonilise valve keskus. Jälgitav isik on keelualas ja liigub kannatanu elukoha poole.',
        'Electronic monitoring centre here. The monitored person is inside the exclusion zone and moving towards the victim’s home.',
      ),
      T(
        'Anname asukohta jooksvalt edasi. Kannatanu on teavitatud.',
        'We will keep passing on his location. The victim has been warned.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Kohtu määratud lähenemiskeeld elektroonilise valvega.',
        'Suspect: {suspect}. Court-ordered restraining order with electronic monitoring.',
      ),
      T('Kannatanu on varem teatanud ähvardustest.', 'The victim has reported threats before.'),
    ],
    agencies: [],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal. Mees on maja ees, väidab, et läks poodi ja ei teadnud tsooni piiri.',
          '{callsign}: on scene. The man is outside the building, claims he was going to the shop and did not know the zone boundary.',
        ),
      ]),
      qPerson('suspect', 2, { radio: Q_RESTRAINING }),
      toArrest(10, { chance: 0.8 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.5, 1],
        3,
        T(
          'Mees peeti kinni enne, kui ta jõudis kannatanu ukseni. Valvekeskuse andmed lisati tõenditeks, alustati kriminaalmenetlust KarS § 331² järgi.',
          'The man was detained before he reached the victim’s door. The monitoring data was added as evidence and criminal proceedings were opened under KarS § 331².',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'recorded',
        'report',
        [0.3, 0.6],
        2,
        T(
          'Mees lahkus keelualast patrulli saabudes. Rikkumine vormistati valvekeskuse andmete põhjal, kannatanule anti ohvriabi kontaktid.',
          'The man left the exclusion zone as the patrol arrived. The breach was recorded from the monitoring data and the victim was given victim support contacts.',
        ),
      ),
      oc(
        'tag_off',
        'escaped',
        [0, 0.3],
        2,
        T(
          'Jälgimisseadme signaal katkes ja meest ei leitud. Ta kuulutati tagaotsitavaks, kannatanu viidi turvalisse kohta.',
          'The tag’s signal was lost and the man was not found. He was put on the wanted list and the victim was taken to a safe place.',
        ),
        { trust: -3 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, elektroonilise valve keskus. Lähenemiskeelu all olev isik sisenes keelualasse, kannatanu elab aadressil {address}.',
          'Hello, electronic monitoring centre. A person under a restraining order has entered the exclusion zone; the victim lives at {address}.',
        ),
        T(
          'Jälgitav liigub kannatanu elukoha poole, anname asukohta jooksvalt edasi.',
          'The monitored person is moving towards the victim’s home; we will keep passing on his location.',
        ),
      ],
      openingRu: [
        'Здравствуйте, центр электронного надзора. Человек под запретом приближения вошёл в запретную зону, потерпевшая живёт по адресу {address}.',
        'Поднадзорный движется к дому потерпевшей, будем сообщать местоположение.',
      ],
      answers: {
        where: [
          T(
            'Kannatanu aadress on {address}. Jälgitav on sellest umbes 50 meetri kaugusel.',
            'The victim’s address is {address}. The monitored person is about 50 metres from it.',
          ),
        ],
        suspect: [
          T(
            'Jälgitav on {suspectName}. Andmed saadan teile kohe.',
            'The monitored person is {suspectName}. I will send you the details right away.',
          ),
        ],
        direction: [
          T(
            'Ta liigub kannatanu maja poole, signaal on stabiilne.',
            'He is moving towards the victim’s building, the signal is stable.',
          ),
        ],
        weapons: [T('Selle kohta meil andmeid ei ole.', 'We have no information about that.')],
        safe: [
          T(
            'Mina olen keskuses. Kannatanu on teavitatud ja kodus.',
            'I am at the centre. The victim has been warned and is at home.',
          ),
        ],
        name: [
          T(
            'Elektroonilise valve keskuse operaator, minu nimi on {caller}.',
            'Electronic monitoring centre operator, my name is {caller}.',
          ),
        ],
      },
      answersRu: {
        where: ['Адрес потерпевшей: {address}. Поднадзорный примерно в 50 метрах от него.'],
        suspect: ['Поднадзорный: {suspectName}. Данные сейчас вам пришлю.'],
        direction: ['Он движется к дому потерпевшей, сигнал стабильный.'],
        weapons: ['Таких данных у нас нет.'],
        safe: ['Я в центре. Потерпевшую предупредили, она дома.'],
        name: ['Оператор центра электронного надзора, меня зовут {caller}.'],
      },
    },
  },
  {
    id: 'drunk_under_window',
    title: T(
      'Lähenemiskeelu rikkumine: joobes mees akna all',
      'Restraining order breach: drunk man under the window',
    ),
    persons: [
      vic('F', [22, 55]),
      sus('M', [25, 58], 'ex_partner', { restraining: 0.95, record: 0.6, intoxicated: 0.95 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naabri teatel karjub joobes mees öösel akna all endise elukaaslase nime ja viskab aknasse kive. Naise sõnul on mehel lähenemiskeeld.',
        '{address}. A neighbour reports a drunk man shouting his ex-partner’s name under the window at night and throwing stones at her window. She says he has a restraining order.',
      ),
      T(
        '{address}. Hoovis laulab ja karjub purjus mees, nõuab, et naine alla tuleks. Pool maja on üleval, naine on hirmul.',
        '{address}. A drunk man is singing and shouting in the yard, demanding that the woman come down. Half the building is awake and she is frightened.',
      ),
    ],
    callerLines: [
      T(
        'Ta karjub juba pool tundi tema nime ja viskab kivikesi aknasse. Kõik on üleval.',
        'He has been shouting her name for half an hour and throwing pebbles at her window. Everyone is awake.',
      ),
      T(
        'Naine ütles mulle trepil, et kohus keelas tal siia tulla.',
        'She told me on the stairs that the court banned him from coming here.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Tugevas joobes, hoovis.',
        'Suspect: {suspect}. Heavily drunk, in the yard.',
      ),
      T(
        'Kannatanu on korteris, lähenemiskeeld on kehtiv.',
        'The victim is in her flat; the restraining order is valid.',
      ),
    ],
    agencies: [],
    beats: [
      qPerson('suspect', 'arrive', { radio: Q_RESTRAINING }),
      k9Choice(4, 0.25),
      toArrest(10, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees peeti hoovis kinni ja toimetati arestimajja. Alustati kriminaalmenetlust lähenemiskeelu rikkumise eest (KarS § 331²), naabrid andsid tunnistusi.',
          'The man was detained in the yard and taken to the arrest house. Criminal proceedings were opened for breaching the restraining order (KarS § 331²) and neighbours gave statements.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'sober',
        'report',
        [0.3, 0.6],
        2,
        T(
          'Mees toimetati kainenema ja rikkumine vormistati. Kriminaalmenetlus jätkub, naisele anti ohvriabi kontaktid.',
          'The man was taken to sober up and the breach recorded. Criminal proceedings continue and the woman was given victim support contacts.',
        ),
      ),
      oc(
        'ran',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees jooksis enne patrulli saabumist garaažide vahele ja jäi tabamata. Rikkumine on tõendatud naabrite videoga.',
          'The man ran off between the garages before the patrol arrived and was not found. The breach is proven by the neighbours’ video.',
        ),
        { trust: -2 },
      ),
    ],
    call: {
      mood: 'angry',
      opening: [
        T(
          'Kuulge, hoovis karjub purjus mees juba pool tundi naabrinaise nime ja viskab ta aknasse kive!',
          'Listen, a drunk man has been shouting my neighbour’s name in the yard for half an hour and throwing stones at her window!',
        ),
        T(
          'Purjus mees karjub hoovis naabrinaise nime ja viskab kive aknasse.',
          'A drunk man is shouting my neighbour’s name in the yard and throwing stones at her window.',
        ),
      ],
      openingRu: [
        'Слушайте, во дворе пьяный уже полчаса орёт имя соседки и кидает камни ей в окно!',
        'Пьяный во дворе орёт имя соседки и кидает камни ей в окно.',
      ],
      answers: {
        what: [
          T(
            'Ta karjub, et naine alla tuleks. Naisel on tema vastu lähenemiskeeld.',
            'He is shouting for her to come down. She has a restraining order against him.',
          ),
        ],
        children: [
          T(
            'Naisel on väike laps, ma arvan, et ta on kodus.',
            'She has a little child, I think he is at home.',
          ),
        ],
        intoxicated: [T('Täiesti purjus, vaevu seisab.', 'Completely drunk, he can barely stand.')],
        safe: [
          T('Ma olen oma korteris, mind ta ei puuduta.', 'I am in my own flat, he is not bothering me.'),
        ],
      },
      answersRu: {
        what: ['Он орёт, чтобы она спустилась. А ей суд запретил ему к ней подходить.'],
        children: ['У неё маленький ребёнок, думаю, он дома.'],
        intoxicated: ['В стельку пьяный, еле на ногах стоит.'],
        safe: ['Я у себя в квартире, меня он не трогает.'],
      },
    },
  },
  {
    id: 'new_partner_fight',
    title: T(
      'Lähenemiskeelu rikkumine: kaklus uue elukaaslasega',
      'Restraining order breach: fight with the new partner',
    ),
    persons: [
      vic('F', [22, 50]),
      sus('M', [25, 55], 'ex_partner', { restraining: 0.95, record: 0.7, intoxicated: 0.6 }),
      { role: 'witness', gender: 'M', age: [23, 55], relation: 'partner' },
    ],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et lähenemiskeelu all olev endine elukaaslane tuli maja juurde ja lõi tema uut elukaaslast. Mehed kaklevad hoovis.',
        '{address}. A woman reports her ex-partner, who is under a restraining order, came to the building and hit her new partner. The men are fighting in the yard.',
      ),
      T(
        '{address}. Endine mees ootas naist ja tema uut kaaslast poe juures ning ründas kaaslast. Kaaslase nina veritseb, ründaja on veel kohal.',
        '{address}. The ex waited for the woman and her new partner by the shop and attacked the partner. The partner’s nose is bleeding and the attacker is still there.',
      ),
    ],
    callerLines: [
      T(
        'Ta lõi mu elukaaslast, nad kaklevad õues! Tal on lähenemiskeeld, ta ei tohi siin olla!',
        'He hit my partner and they are fighting outside! He has a restraining order, he is not allowed here!',
      ),
      T(
        'Ta karjus, et kui mina temaga ei ole, siis ei ole ma kellegagi.',
        'He shouted that if I am not with him, I will not be with anyone.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Kehtiv lähenemiskeeld kannatanu suhtes.',
        'Suspect: {suspect}. Valid restraining order protecting the victim.',
      ),
      T('Naise uuel elukaaslasel on ninaverejooks.', 'The woman’s new partner has a nosebleed.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.4, reason: T('Kannatanul näovigastus', 'Facial injury') }],
    beats: [
      backup(0.25, un('patrol'), {
        at: 'arrive',
        radio: [
          T(
            '{callsign}: kaks meest kaklevad, vajame lisapatrulli!',
            '{callsign}: two men fighting, we need another patrol!',
          ),
        ],
      }),
      qPerson('suspect', 3, { radio: Q_RESTRAINING }),
      toArrest(10, { chance: 0.75 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Endine elukaaslane peeti kinni. Alustati kriminaalmenetlust lähenemiskeelu rikkumise ja kehalise väärkohtlemise eest (KarS § 331² ja § 121).',
          'The ex-partner was detained. Criminal proceedings were opened for breaching the restraining order and for assault (KarS § 331² and § 121).',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'both',
        'report',
        [0.3, 0.6],
        2,
        T(
          'Mõlemal mehel olid vigastused. Endise elukaaslase suhtes alustati kriminaalmenetlust, uue kaaslase tegevust hinnatakse hädakaitsena.',
          'Both men were injured. Proceedings were opened against the ex-partner and the new partner’s actions are being assessed as self-defence.',
        ),
        { injuries: 1 },
      ),
      oc(
        'fled',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Ründaja jooksis enne patrulli saabumist minema. Naise uus kaaslane toimetati EMO-sse, ründaja kuulutati tagaotsitavaks.',
          'The attacker ran off before the patrol arrived. The woman’s new partner was taken to A&E and the attacker was put on the wanted list.',
        ),
        { injuries: 1, trust: -3 },
      ),
    ],
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mu endine mees lõi mu elukaaslast, nad kaklevad õues! Tal on lähenemiskeeld!',
          'My ex hit my partner, they are fighting outside! He has a restraining order!',
        ),
        T(
          'Endine mees tuli siia ja lõi mu elukaaslast, nüüd nad kaklevad õues.',
          'My ex came here and hit my partner, now they are fighting outside.',
        ),
      ],
      openingRu: [
        'Мой бывший ударил моего парня, они дерутся во дворе! Ему запрещено ко мне подходить!',
        'Бывший пришёл сюда и ударил моего парня, теперь они дерутся во дворе.',
      ],
      answers: {
        count: [
          T('Kaks meest, mu endine ja mu praegune elukaaslane.', 'Two men, my ex and my current partner.'),
        ],
        injured: [T('Mu elukaaslase nina veritseb.', 'My partner’s nose is bleeding.')],
        weapons: [
          T(
            'Ma ei näinud relva, nad kaklevad rusikatega.',
            'I did not see a weapon, they are fighting with their fists.',
          ),
        ],
        safe: [T('Ma olen trepikojas, uks on lukus.', 'I am in the stairwell and the door is locked.')],
      },
      answersRu: {
        count: ['Двое мужчин, мой бывший и мой нынешний.'],
        injured: ['У моего парня кровь из носа идёт.'],
        weapons: ['Оружия я не видела, они дерутся на кулаках.'],
        safe: ['Я в подъезде, дверь закрыта.'],
      },
    },
  },
];

// ── domestic_drunk_parent_children ──────────────────────────────────────────
const SC_DRUNK_PARENT: IncidentScenario[] = [
  {
    id: 'mother_door_locked',
    title: T('Joobes ema, lapsed nutavad lukus korteris', 'Drunk mother, children crying in a locked flat'),
    persons: [
      vic('any', [2, 7]),
      sus('F', [23, 45], 'parent', { intoxicated: 0.95, record: 0.2 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naabri teatel nutavad korteris väikesed lapsed juba tunde, ema on purjus ega ava ust.',
        '{address}. A neighbour reports small children have been crying in a flat for hours; the mother is drunk and will not open the door.',
      ),
      T(
        '{address}. Korterist kostab juba õhtust saati laste nuttu. Naaber nägi ema poest viinaga tulemas, uksele keegi ei reageeri.',
        '{address}. Children have been crying in the flat since early evening. A neighbour saw the mother coming back from the shop with vodka; nobody answers the door.',
      ),
    ],
    callerLines: [
      T(
        'Lapsed nutavad juba kolm tundi. Ema nägin õhtul poest viinaga tulemas.',
        'The kids have been crying for three hours. I saw the mother coming back from the shop with vodka this evening.',
      ),
      T('Ma koputasin, aga keegi ei ava. Ainult nutt.', 'I knocked, but nobody opens. Just the crying.'),
    ],
    details: [
      T('Ema: {suspect}.', 'The mother: {suspect}.'),
      T('Lastekaitsel on pere kohta varasem info.', 'Child protection already has a file on the family.'),
    ],
    beats: [
      agency('paaste', 'arrive', {
        chance: 0.5,
        radio: [
          T(
            '{callsign}: uks lukus, sees lapsed. Palun päästjad ust avama.',
            '{callsign}: door locked, children inside. Request rescue to open the door.',
          ),
        ],
      }),
      qPerson('suspect', 5),
      agency('sotsiaal', 8, {
        radio: [
          T(
            '{callsign}: lapsed järelevalveta, ema tugevas joobes. Palun lastekaitse.',
            '{callsign}: children unsupervised, mother heavily intoxicated. Request child protection.',
          ),
        ],
      }),
      toSober(15, { chance: 0.6 }),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Naaberkorteris nutavad väikesed lapsed juba tunde ja keegi ei ava ust.',
          'Hello. Small children have been crying next door for hours and nobody opens the door.',
        ),
        T(
          'Lapsed nutavad juba tunde ja ema on purjus, ust keegi ei ava.',
          'The children have been crying for hours and the mother is drunk; nobody opens the door.',
        ),
      ],
      openingRu: [
        'Здравствуйте. У соседей маленькие дети плачут уже несколько часов, дверь никто не открывает.',
        'Дети плачут уже несколько часов, мать пьяная, дверь никто не открывает.',
      ],
      answers: {
        children: [T('Kaks väikest last, mõlemad nutavad.', 'Two little kids, both crying.')],
        suspect: [
          T(
            'Ema, ta joob. Isa ei ela nendega.',
            'The mother, she drinks. The father does not live with them.',
          ),
        ],
        intoxicated: [
          T(
            'Ma nägin, et ta tõi viina. Ta on kindlasti purjus.',
            'I saw her bring vodka home. She is definitely drunk.',
          ),
        ],
      },
      answersRu: {
        children: ['Двое маленьких детей, оба плачут.'],
        suspect: ['Мать, она пьёт. Отец с ними не живёт.'],
        intoxicated: ['Я {видел|видела}, как она несла водку. Она точно пьяная.'],
      },
    },
  },
  {
    id: 'father_asleep_stairwell',
    title: T(
      'Joobes isa magab trepikojas, lapsed üksi',
      'Drunk father asleep in the stairwell, children alone',
    ),
    persons: [
      vic('any', [2, 7]),
      sus('M', [23, 50], 'parent', { intoxicated: 0.98, record: 0.3 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Trepikojas magab tugevas joobes mees, korteri uks on lahti ja sees on kaks väikest last üksi.',
        '{address}. A heavily drunk man is asleep in the stairwell; the flat door is open and two small children are alone inside.',
      ),
      T(
        '{address}. Naaber leidis trepimademelt magava isa, kes ei ärka. Väike poiss istub lahtise ukse taga esikus ja nutab.',
        '{address}. A neighbour found a father asleep on the landing who will not wake up. A little boy is sitting in the hall behind the open door, crying.',
      ),
    ],
    callerLines: [
      T(
        'Isa magab trepil, uks on pärani ja väike poiss istub esikus üksi.',
        'The father is asleep on the stairs, the door is wide open and a little boy is sitting alone in the hall.',
      ),
      T(
        'Ma raputasin teda, aga ta ainult pomiseb. Lapsed on täiesti üksi.',
        'I shook him, but he only mumbles. The kids are completely alone.',
      ),
    ],
    details: [
      T('Isa: {suspect}.', 'The father: {suspect}.'),
      T('Ema on teadaolevalt välismaal tööl.', 'The mother is known to be working abroad.'),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: isa magab trepil, ei reageeri hästi. Kaks last on korteris, üks on mähkmetes.',
          '{callsign}: the father is asleep on the stairs and barely responds. Two children are in the flat, one in nappies.',
        ),
      ]),
      qPerson('suspect', 4),
      agency('sotsiaal', 8, {
        radio: [
          T(
            '{callsign}: väikesed lapsed üksi, isa tugevas joobes. Palun lastekaitse.',
            '{callsign}: small children alone, father heavily intoxicated. Request child protection.',
          ),
        ],
      }),
      toSober(15, { chance: 0.7 }),
    ],
    outcomes: [
      oc(
        'placed',
        'referred',
        [0.5, 1],
        3,
        T(
          'Lapsed anti lastekaitse kaudu vanaema hoole alla ja isa toimetati kainenema. Juhtum edastati lastekaitsele, emaga võeti ühendust.',
          'Through child protection the children were placed with their grandmother and the father was taken to sober up. The case was passed to child protection and the mother was contacted.',
        ),
        { trust: 2 },
      ),
      oc(
        'neighbour',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Lapsed jäid naabri hoole alla, kuni tädi kohale jõudis. Isa käitumine vormistati ja info edastati lastekaitsele.',
          'The children stayed with the neighbour until their aunt arrived. The father’s conduct was recorded and passed to child protection.',
        ),
      ),
      oc(
        'hurt',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Väiksem laps oli üksi olles kukkunud ja pead löönud. Ta toimetati kontrolliks haiglasse, isa toimetati kainenema.',
          'The younger child had fallen and hit his head while alone. He was taken to hospital for a check-up and the father was taken to sober up.',
        ),
        { injuries: 1, trust: -3 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, meie trepil magab purjus mees ja tema korteris on väikesed lapsed üksi.',
          'Hello, a drunk man is asleep on our stairs and there are small children alone in his flat.',
        ),
        T(
          'Isa magab purjus peaga trepil ja väike poiss istub lahtise ukse taga üksi.',
          'The father is asleep drunk on the stairs and a little boy is sitting alone behind the open door.',
        ),
      ],
      openingRu: [
        'Здравствуйте, у нас на лестнице спит пьяный, а у него в квартире одни маленькие дети.',
        'Отец пьяный спит на лестнице, а маленький мальчик один сидит за открытой дверью.',
      ],
      answers: {
        children: [T('Kaks last, üks on päris beebi veel.', 'Two kids, one is still a baby really.')],
        suspect: [
          T('See on nende isa. Ema on välismaal tööl.', 'It is their father. The mother is working abroad.'),
        ],
        intoxicated: [T('Täiesti purjus, ei ärka üles.', 'Completely drunk, he will not wake up.')],
        safe: [T('Ma olen trepil laste juures.', 'I am on the stairs with the children.')],
      },
      answersRu: {
        children: ['Двое детей, один совсем ещё грудной.'],
        suspect: ['Это их отец. Мать за границей на работе.'],
        intoxicated: ['В стельку пьяный, не просыпается.'],
        safe: ['Я на лестнице, с детьми.'],
      },
    },
  },
  {
    id: 'child_in_yard_at_night',
    title: T('Väike laps üksi õues, vanem joobes', 'Small child alone outside, parent drunk'),
    persons: [
      vic('any', [4, 7]),
      sus('any', [23, 45], 'parent', { intoxicated: 0.95, record: 0.2 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naaber leidis hoovist pidžaamas väikese lapse, kes ütleb, et ema magab ja ei ärka. Korteri uks on lahti.',
        '{address}. A neighbour found a small child in pyjamas in the yard who says mum is sleeping and will not wake up. The flat door is open.',
      ),
      T(
        '{address}. Pidžaamas laps kõndis hilja õhtul üksi mänguväljakul. Naabri sõnul on vanem kodus tugevas joobes.',
        '{address}. A child in pyjamas was walking alone on the playground late in the evening. The neighbour says the parent is at home heavily drunk.',
      ),
    ],
    callerLines: [
      T(
        'Laps on minu juures, ta on ainult pidžaamas ja paljajalu. Ta ütleb, et emme magab.',
        'The child is with me, in just pyjamas and barefoot. He says mummy is sleeping.',
      ),
      T(
        'Ma käisin nende korteris, vanem magab diivanil ja ei ärka. Pudelid on laual.',
        'I went into their flat; the parent is asleep on the sofa and will not wake up. There are bottles on the table.',
      ),
    ],
    details: [
      T('Vanem: {suspect}.', 'The parent: {suspect}.'),
      T('Laps on naabri korteris, soe ja turvaline.', 'The child is in the neighbour’s flat, warm and safe.'),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: laps on naabri juures. Vanem on korteris tugevas joobes, ärkab vaevu.',
          '{callsign}: the child is at the neighbour’s. The parent is in the flat, heavily drunk and barely waking.',
        ),
      ]),
      qPerson('suspect', 4),
      agency('sotsiaal', 8, {
        radio: [
          T(
            '{callsign}: väike laps leiti öösel õues, vanem joobes. Palun lastekaitse.',
            '{callsign}: a small child was found outside at night, parent drunk. Request child protection.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'placed',
        'referred',
        [0.5, 1],
        3,
        T(
          'Laps anti lastekaitse kaudu vanaema hoole alla. Vanema käitumine vormistati ja info edastati lastekaitsele.',
          'Through child protection the child was placed with the grandmother. The parent’s conduct was recorded and passed to child protection.',
        ),
        { trust: 2 },
      ),
      oc(
        'neighbour',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Laps jäi naabri juurde, kuni teine vanem töölt koju jõudis. Juhtum edastati lastekaitsele.',
          'The child stayed at the neighbour’s until the other parent got home from work. The case was passed to child protection.',
        ),
      ),
      oc(
        'cold',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Laps oli õues külmetanud ja toimetati kontrolliks haiglasse. Vanem toimetati kainenema.',
          'The child had got cold outside and was taken to hospital for a check-up. The parent was taken to sober up.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere, ma leidsin hoovist pidžaamas väikese lapse. Ta ütleb, et ema magab ja ei ärka.',
          'Hello, I found a small child in pyjamas in the yard. He says his mum is asleep and will not wake up.',
        ),
        T(
          'Laps oli hoovis paljajalu ja pidžaamas, ema magab kodus purjus peaga.',
          'The child was in the yard barefoot in pyjamas; his mum is asleep at home, drunk.',
        ),
      ],
      openingRu: [
        'Здравствуйте, я {нашёл|нашла} во дворе маленького ребёнка в пижаме. Он говорит, что мама спит и не просыпается.',
        'Ребёнок был во дворе босиком в пижаме, мама спит дома пьяная.',
      ],
      answers: {
        children: [T('Jah, laps on praegu minu juures.', 'Yes, the child is with me now.')],
        injured: [T('Ta on külmunud, aga muidu terve.', 'He is cold, but otherwise fine.')],
        suspect: [T('Lapse vanem, ta on korteris purjus.', 'The child’s parent, drunk in the flat.')],
        safe: [T('Jah, me oleme minu korteris.', 'Yes, we are in my flat.')],
      },
      answersRu: {
        children: ['Да, ребёнок сейчас у меня.'],
        injured: ['Он замёрз, а так вроде целый.'],
        suspect: ['Родитель ребёнка, пьяный в квартире.'],
        safe: ['Да, мы у меня в квартире.'],
      },
    },
  },
  {
    id: 'grandmother_babysitter',
    title: T('Lapsehoidjast vanaema joobes, laps helistab', 'Babysitting grandmother drunk, child calls'),
    persons: [
      vic('any', [2, 5]),
      sus('F', [55, 75], 'family', { intoxicated: 0.95, record: 0.1 }),
      { role: 'caller', gender: 'any', age: [9, 12], relation: 'family' },
    ],
    summary: [
      T(
        '{address}. Helistab laps: vanaema, kes neid hoiab, jõi palju ja kukkus põrandale magama. Väike õde nutab. Vanemad on tööl.',
        '{address}. A child is calling: the grandmother looking after them drank a lot and fell asleep on the floor. The little sister is crying. The parents are at work.',
      ),
      T(
        '{address}. Lapse kõne: vanaema ei ärka, köögis on pudelid. Laps ei saa vanematele helistada.',
        '{address}. Call from a child: grandmother will not wake up and there are bottles in the kitchen. The child cannot reach the parents.',
      ),
    ],
    callerLines: [
      T(
        'Vanaema jõi ja jäi põrandale magama. Ma ei saa teda üles.',
        'Grandma drank and fell asleep on the floor. I cannot get her up.',
      ),
      T(
        'Ma helistasin emmele, aga ta ei vasta. Ta on tööl.',
        'I called mummy but she is not answering. She is at work.',
      ),
    ],
    details: [
      T(
        'Vanaema: {suspect}. Lapsevanemad on öövahetuses.',
        'The grandmother: {suspect}. The parents are on a night shift.',
      ),
      T('Helistaja on umbes kümneaastane laps.', 'The caller is a child of about ten.'),
    ],
    agencies: [
      { agency: 'sotsiaal', chance: 1, reason: T('Lapsed järelevalveta', 'Children unsupervised') },
      {
        agency: 'kiirabi',
        chance: 0.5,
        reason: T('Eakas teadvusehäirega', 'Elderly woman with reduced consciousness'),
      },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: vanaema on teadvusel, aga tugevas joobes. Lapsed on terved.',
          '{callsign}: the grandmother is conscious but heavily drunk. The children are fine.',
        ),
      ]),
      kiirabi(3, {
        chance: 0.5,
        radio: [
          T(
            '{callsign}: eakas tugevas joobes, kukkus. Palun kiirabi kontrolliks.',
            '{callsign}: elderly woman heavily drunk, she fell. Request an ambulance to check her.',
          ),
        ],
      }),
      agency('sotsiaal', 8, {
        radio: [
          T(
            '{callsign}: lapsed järelevalveta, palun teavitage lastekaitset.',
            '{callsign}: children unsupervised, please notify child protection.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'parents',
        'referred',
        [0.5, 1],
        3,
        T(
          'Patrull jõudis lapsevanemateni, ema tuli töölt koju. Info edastati lastekaitsele, vanaema jäi kiirabi järelevalve alla.',
          'The patrol reached the parents and the mother came home from work. The information was passed to child protection and the grandmother was left under the ambulance’s care.',
        ),
        { trust: 2 },
      ),
      oc(
        'stayed',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Lapsed jäid naabri hoole alla, kuni ema töölt jõudis. Vanaema toimetati kainenema, juhtum edastati lastekaitsele.',
          'The children stayed with a neighbour until their mother got back from work. The grandmother was taken to sober up and the case passed to child protection.',
        ),
      ),
      oc(
        'hospital',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Vanaema oli kukkudes pead löönud ja toimetati haiglasse. Lapsed viidi lastekaitse kaudu turvalisse kohta.',
          'The grandmother had hit her head when she fell and was taken to hospital. Through child protection the children were taken somewhere safe.',
        ),
        { injuries: 1, trust: -1 },
      ),
    ],
    call: {
      mood: 'child',
      opening: [
        T(
          'Halloo... vanaema jõi ja ei ärka üles. Mu väike õde nutab.',
          'Hello... grandma drank and will not wake up. My little sister is crying.',
        ),
        T(
          'Vanaema jõi seda pruuni asja ja kukkus maha. Ta ei ärka.',
          'Grandma drank that brown stuff and fell over. She will not wake up.',
        ),
      ],
      openingRu: [
        'Алло... бабушка выпила и не просыпается. Моя сестрёнка плачет.',
        'Бабушка выпила что-то коричневое и упала. Она не просыпается.',
      ],
      answers: {
        where: [
          T(
            'Me elame {address}. Vanaema tuli meid hoidma.',
            'We live at {address}. Grandma came to look after us.',
          ),
        ],
        name: [T('Mina olen vanem õde. Emme on tööl.', 'I am the big sister. Mummy is at work.')],
        injured: [T('Vanaema hingab, aga ta ei räägi.', 'Grandma is breathing, but she is not talking.')],
        children: [T('Mina ja mu väike õde.', 'Me and my little sister.')],
        safe: [T('Jah, me oleme kodus.', 'Yes, we are at home.')],
        intoxicated: [T('Ta jõi seda pruuni asja pudelist.', 'She drank that brown stuff from a bottle.')],
        suspect: [T('See on meie vanaema.', 'It is our grandma.')],
      },
      answersRu: {
        where: ['Мы живём: {address}. Бабушка пришла с нами посидеть.'],
        name: ['Я старшая сестра. Мама на работе.'],
        injured: ['Бабушка дышит, но ничего не говорит.'],
        children: ['Я и моя маленькая сестрёнка.'],
        safe: ['Да, мы дома.'],
        intoxicated: ['Она пила это коричневое из бутылки.'],
        suspect: ['Это наша бабушка.'],
      },
    },
  },
  {
    id: 'party_with_toddlers',
    title: T('Joomapidu väikeste lastega korteris', 'Drinking party in a flat with toddlers'),
    persons: [
      vic('any', [1, 5]),
      sus('any', [22, 45], 'parent', { intoxicated: 0.95, record: 0.3 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naabri teatel käib korteris juba teist päeva joomapidu, kostab muusikat ja kisa. Sees on väikesed lapsed, kes nutavad.',
        '{address}. A neighbour reports a drinking party has been going on in the flat for two days, with music and shouting. There are small children inside, crying.',
      ),
      T(
        '{address}. Purjus täiskasvanud peavad korteris pidu, trepikojas on katkised pudelid. Naabri sõnul jooksis väike laps üksi trepil ringi.',
        '{address}. Drunk adults are partying in a flat and there are broken bottles in the stairwell. The neighbour says a small child was running around the stairs alone.',
      ),
    ],
    callerLines: [
      T(
        'Seal on mingi joomapidu juba teist päeva. Ja nende väikesed lapsed on seal keskel.',
        'There has been some drinking party going on there for two days. And their little kids are right in the middle of it.',
      ),
      T(
        'Ma leidsin nende pisikese trepilt ja viisin tagasi. Keegi ei märganud, et ta oli kadunud.',
        'I found their little one on the stairs and took her back. Nobody had noticed she was gone.',
      ),
    ],
    details: [
      T(
        'Lapsevanem: {suspect}. Korteris on mitu joobes täiskasvanut.',
        'The parent: {suspect}. Several drunk adults are in the flat.',
      ),
      T('Lastekaitsel on pere kohta varasem info.', 'Child protection already has a file on the family.'),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 1,
        reason: T('Lapsed joobes täiskasvanute keskel', 'Children among drunk adults'),
      },
    ],
    beats: [
      backup(0.2, un('patrol'), {
        radio: [
          T(
            '{callsign}: korteris on mitu joobes täiskasvanut, palun lisapatrull.',
            '{callsign}: several drunk adults in the flat, request another patrol.',
          ),
        ],
      }),
      qPerson('suspect', 4),
      agency('sotsiaal', 8, {
        radio: [
          T(
            '{callsign}: väikesed lapsed joomapeo keskel, palun lastekaitse.',
            '{callsign}: small children in the middle of a drinking party, request child protection.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'placed',
        'referred',
        [0.5, 1],
        3,
        T(
          'Pidu lõpetati ja lapsed anti lastekaitse kaudu tädi hoole alla. Külalised saadeti laiali, vanemate käitumine vormistati.',
          'The party was ended and through child protection the children were placed with an aunt. The guests were sent away and the parents’ conduct recorded.',
        ),
        { trust: 2 },
      ),
      oc(
        'fined',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Pidu lõpetati, öörahu rikkumise eest koostati väärteoprotokollid. Laste olukorrast teavitati lastekaitset.',
          'The party was ended and misdemeanour reports were drawn up for disturbing the peace. Child protection was told about the children’s situation.',
        ),
      ),
      oc(
        'injured_child',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Üks väike laps oli astunud klaasikillule ja toimetati haiglasse. Vanemate suhtes alustati menetlust, lastekaitse võttis juhtumi üle.',
          'One small child had stepped on broken glass and was taken to hospital. Proceedings were opened against the parents and child protection took over the case.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    call: {
      mood: 'angry',
      opening: [
        T(
          'Kuulge, naabrite juures on juba teist päeva joomapidu ja nende väikesed lapsed on seal sees!',
          'Listen, the neighbours have had a drinking party going for two days and their little kids are in there!',
        ),
        T(
          'Seal on juba teist päeva joomapidu ja väikesed lapsed on keset seda.',
          'There has been a drinking party there for two days and the little kids are in the middle of it.',
        ),
      ],
      openingRu: [
        'Слушайте, у соседей уже второй день пьянка, а у них там маленькие дети!',
        'Там второй день пьянка, а маленькие дети прямо посреди этого.',
      ],
      answers: {
        count: [
          T(
            'Täiskasvanuid on vist viis või kuus, lisaks lapsed.',
            'There are maybe five or six adults, plus the kids.',
          ),
        ],
        children: [T('Kaks väikest, üks vaevu käib.', 'Two little ones, one can barely walk.')],
        intoxicated: [
          T('Kõik on purjus, iga viimane kui üks.', 'They are all drunk, every last one of them.'),
        ],
      },
      answersRu: {
        count: ['Взрослых, наверное, пять или шесть, плюс дети.'],
        children: ['Двое маленьких, один еле ходит.'],
        intoxicated: ['Все пьяные, все до одного.'],
      },
    },
    tags: ['noise'],
  },
];

// ── domestic_ex_stalking ────────────────────────────────────────────────────
const SC_EX_STALKING: IncidentScenario[] = [
  {
    id: 'messages_at_work',
    persons: [vic('F', [20, 55]), sus('M', [22, 55], 'ex_partner', { record: 0.4, restraining: 0.2 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et endine elukaaslane helistab talle kümneid kordi päevas, ootab teda töö juures ja saatis lilled koos ähvardava kirjaga.',
        '{address}. A woman reports her ex-partner calls her dozens of times a day, waits for her at work and sent flowers with a threatening note.',
      ),
      T(
        '{address}. Naise sõnul ootas endine mees teda täna jälle töökoha parklas ja sõitis talle koju järele. Sõnumeid on sadu.',
        '{address}. The woman says her ex waited for her in the workplace car park again today and followed her home. There are hundreds of messages.',
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
    callerLinesRu: [
      'Мы расстались полгода назад, но он не оставляет меня в покое. Сегодня опять ждал меня у работы.',
      'Я {сохранил|сохранила} все сообщения. Их сотни.',
    ],
    details: [
      T('Mees: {suspect}.', 'The man: {suspect}.'),
      T(
        'Teataja sõnul ütles mees, et kui ta pole temaga, siis ei ole ta kellegagi.',
        'The caller says he told her that if she is not with him, she will not be with anyone.',
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Mu endine elukaaslane jälitab mind, täna ootas ta mind jälle töö juures.',
          'Hello. My ex-partner is stalking me, today he was waiting for me at work again.',
        ),
        T(
          'Ta helistab mulle kümneid kordi päevas ja ootas mind täna jälle töö juures.',
          'He calls me dozens of times a day and was waiting for me at work again today.',
        ),
      ],
      openingRu: [
        'Здравствуйте. Бывший меня преследует, сегодня опять ждал меня у работы.',
        'Он звонит мне десятки раз в день и сегодня опять ждал у работы.',
      ],
      answers: {
        suspect: [T('{suspect}. See on mu endine elukaaslane.', '{suspect}. He is my ex-partner.')],
        weapons: [
          T(
            'Relva ma ei ole näinud, aga ta on ähvardanud.',
            'I have not seen a weapon, but he has made threats.',
          ),
        ],
        safe: [T('Praegu jah, ma olen kodus.', 'For now yes, I am at home.')],
      },
      answersRu: {
        suspect: ['{suspect}. Это мой бывший сожитель.'],
        weapons: ['Оружия я не видела, но он угрожал.'],
        safe: ['Пока да, я дома.'],
      },
    },
  },
  {
    id: 'gps_tracker',
    title: T('Ahistav jälitamine: auto all jälgimisseade', 'Stalking: a tracker under the car'),
    persons: [vic('F', [20, 55]), sus('M', [22, 55], 'ex_partner', { record: 0.35, restraining: 0.15 })],
    vehicles: [{ role: 'victim', kind: 'car', driverRole: 'victim' }],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Teataja kahtlustab, et endine elukaaslane on paigaldanud tema autole jälgimisseadme, kuna ilmub kõikjale, kuhu ta läheb. Mees on praegu maja ees.',
        '{address}. The caller suspects her ex-partner has put a tracker on her car because he turns up everywhere she goes. He is outside the building now.',
      ),
      T(
        '{address}. Naine leidis oma auto põhja alt magnetiga kinnitatud seadme. Endine mees kirjutas samal päeval, et teab, kus ta käis.',
        '{address}. A woman found a magnetic device stuck under her car. The same day her ex wrote that he knows where she has been.',
      ),
    ],
    callerLines: [
      T(
        'Ta jälitab mind kõikjal. Täna leidsin auto alt mingi musta karbi.',
        'He follows me everywhere. Today I found a little black box under my car.',
      ),
      T(
        'Ma ei julge seda karpi ära võtta. Mis siis, kui ta saab aru?',
        'I do not dare take the box off. What if he notices?',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}.', 'Suspect: {suspect}.'),
      T(
        'Kannatanu sõiduk: {car}, reg nr {plate}. Seade on auto all.',
        'The victim’s car: {car}, plate {plate}. The device is under the car.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: auto all on magnetiga GPS-seade. Pildistame ja võtame asitõendiks.',
          '{callsign}: there is a magnetic GPS device under the car. Photographing it and taking it as evidence.',
        ),
      ]),
      qPerson('suspect', 6, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.5, 1],
        3,
        T(
          'Jälgimisseade võeti asitõendiks ja alustati kriminaalmenetlust ahistava jälitamise eest (KarS § 157³). Naisele selgitati lähenemiskeelu taotlemist.',
          'The tracker was taken as evidence and criminal proceedings were opened for stalking (KarS § 157³). The woman was told how to apply for a restraining order.',
        ),
        { trust: 2 },
      ),
      oc(
        'warned',
        'warning',
        [0.25, 0.6],
        2,
        T(
          'Seade eemaldati ja mehega vesteldi. Teda hoiatati kriminaalvastutusest, menetlus jätkub seadme ostuandmete kontrolliga.',
          'The device was removed and officers spoke to the man. He was warned about criminal liability; the case continues with a check of who bought the device.',
        ),
      ),
      oc(
        'declined',
        'referred',
        [0, 0.35],
        2,
        T(
          'Naine ei soovinud avaldust esitada. Seade eemaldati, talle anti ohvriabi ja naiste tugikeskuse kontaktid.',
          'The woman did not want to file a complaint. The device was removed and she was given victim support and women’s support centre contacts.',
        ),
        { trust: -1 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Ma arvan, et mu endine mees jälgib mu autot, ma leidsin auto alt mingi seadme.',
          'Hello. I think my ex is tracking my car, I found a device under it.',
        ),
        T(
          'Ta jälitab mind kõikjal. Täna leidsin auto alt mingi musta karbi.',
          'He follows me everywhere. Today I found a little black box under my car.',
        ),
      ],
      openingRu: [
        'Здравствуйте. Кажется, бывший следит за моей машиной, я нашла под ней какое-то устройство.',
        'Он преследует меня повсюду. Сегодня нашла под машиной какую-то чёрную коробочку.',
      ],
      answers: {
        vehicle: [
          T(
            'Minu auto on {car}, number {plate}. Seade on selle all.',
            'My car is a {car}, plate {plate}. The device is under it.',
          ),
        ],
        suspect: [
          T(
            'Mu endine elukaaslane. Ta on praegu maja ees.',
            'My ex-partner. He is outside the building right now.',
          ),
        ],
        safe: [T('Ma olen kodus, uks on lukus.', 'I am at home with the door locked.')],
        weapons: [T('Ei, relva ma ei ole näinud.', 'No, I have not seen a weapon.')],
      },
      answersRu: {
        vehicle: ['Моя машина: {car}, номер {plate}. Устройство под ней.'],
        suspect: ['Мой бывший. Он сейчас стоит у дома.'],
        safe: ['Я дома, дверь закрыта.'],
        weapons: ['Нет, оружия я не видела.'],
      },
    },
    tags: ['stalking'],
  },
  {
    id: 'fake_profiles',
    title: T('Ahistav jälitamine: libaprofiilid ja pildistamine', 'Stalking: fake profiles and photographs'),
    persons: [vic('F', [20, 50]), sus('M', [22, 55], 'ex_partner', { record: 0.3 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et endine elukaaslane loob libaprofiile, kirjutab tema töökaaslastele ja uuele kaaslasele. Täna pildistas mees tema maja.',
        '{address}. A woman reports her ex-partner creates fake profiles and writes to her colleagues and her new partner. Today he was photographing her house.',
      ),
      T(
        '{address}. Teataja sõnul postitas endine mees tema aadressi sotsiaalmeediasse ja seisis täna tunni aega maja ees telefoniga pildistades.',
        '{address}. The caller says her ex posted her address on social media and today stood outside her house for an hour taking photos with his phone.',
      ),
    ],
    callerLines: [
      T(
        'Ta kirjutab mu ülemusele võltsprofiilidelt. Nüüd seisis ta mu maja ees ja pildistas.',
        'He writes to my boss from fake profiles. Now he was standing outside my house taking pictures.',
      ),
      T(
        'Ma olen teinud kuvatõmmiseid kõigest, mis ta on kirjutanud.',
        'I have taken screenshots of everything he has written.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}.', 'Suspect: {suspect}.'),
      T(
        'Kannatanu on salvestanud ekraanipildid umbes kümnelt libaprofiililt.',
        'The victim has saved screenshots from about ten fake profiles.',
      ),
    ],
    beats: [
      info(3, [
        T(
          '{callsign}: teataja näitas kuvatõmmiseid, profiile on üle kümne. Vormistame avalduse.',
          '{callsign}: the caller showed us the screenshots, there are over ten profiles. Taking a statement.',
        ),
      ]),
      qPerson('suspect', 8, { chance: 0.5 }),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.5, 1],
        3,
        T(
          'Võeti vastu avaldus ja alustati kriminaalmenetlust ahistava jälitamise eest (KarS § 157³). Kuvatõmmised lisati toimikusse, veebikonstaablit teavitati.',
          'A complaint was taken and criminal proceedings were opened for stalking (KarS § 157³). The screenshots were added to the file and the web constable was informed.',
        ),
        { trust: 2 },
      ),
      oc(
        'warned',
        'warning',
        [0.25, 0.6],
        2,
        T(
          'Mehega vesteldi telefoni teel ja teda hoiatati. Naisele anti nõu, kuidas profiilidest platvormidele teatada.',
          'Officers spoke to the man by phone and warned him. The woman was advised how to report the profiles to the platforms.',
        ),
      ),
      oc(
        'referred',
        'referred',
        [0, 0.35],
        2,
        T(
          'Naine otsustas esialgu avaldust mitte esitada. Talle anti ohvriabi kontaktid ja soovitati kõik tõendid alles hoida.',
          'The woman decided not to file a complaint for now. She was given victim support contacts and advised to keep all the evidence.',
        ),
        { trust: -1 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Mu endine elukaaslane ahistab mind libaprofiilidelt ja täna pildistas ta mu maja.',
          'Hello. My ex-partner harasses me from fake profiles and today he was photographing my house.',
        ),
        T(
          'Ta ei jäta mind rahule: kirjutab mu töökaaslastele libaprofiilidelt ja seisis täna mu maja ees pildistamas.',
          'He will not leave me alone: he writes to my colleagues from fake profiles and was standing outside my house today taking pictures.',
        ),
      ],
      openingRu: [
        'Здравствуйте. Бывший преследует меня с фальшивых аккаунтов, а сегодня фотографировал мой дом.',
        'Он не оставляет меня в покое: пишет моим коллегам с фейковых страниц, а сегодня стоял у моего дома и фотографировал.',
      ],
      answers: {
        suspect: [
          T(
            'Mu endine elukaaslane, me läksime lahku eelmisel aastal.',
            'My ex-partner, we split up last year.',
          ),
        ],
        direction: [T('Ta läks ära, kui ma ukse avasin.', 'He left when I opened the door.')],
        weapons: [T('Ei, relva ma ei näinud.', 'No, I did not see a weapon.')],
        safe: [T('Jah, ma olen kodus.', 'Yes, I am at home.')],
      },
      answersRu: {
        suspect: ['Мой бывший, мы расстались в прошлом году.'],
        direction: ['Он ушёл, когда я открыла дверь.'],
        weapons: ['Нет, оружия я не видела.'],
        safe: ['Да, я дома.'],
      },
    },
    tags: ['stalking', 'cyber'],
  },
  {
    id: 'ex_girlfriend',
    title: T(
      'Ahistav jälitamine: endine elukaaslane ei jäta meest rahule',
      'Stalking: an ex-girlfriend will not leave a man alone',
    ),
    persons: [vic('M', [22, 55]), sus('F', [20, 50], 'ex_partner', { record: 0.15, intoxicated: 0.3 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Mees teatab, et endine elukaaslane käib iga päev tema ukse taga, kriimustas tema auto ja saadab ähvardavaid sõnumeid. Naine on praegu trepikojas.',
        '{address}. A man reports his ex-partner comes to his door every day, scratched his car and sends threatening messages. She is in the stairwell right now.',
      ),
      T(
        '{address}. Endine elukaaslane ei aktsepteeri lahkuminekut: helistab öösiti, istub tunde trepil ja ähvardab teha endale midagi, kui mees ust ei ava.',
        '{address}. An ex-partner will not accept the break-up: she calls at night, sits on the stairs for hours and threatens to harm herself if he does not open the door.',
      ),
    ],
    callerLines: [
      T(
        'Ta istub jälle mu ukse taga. Ma ei tea, mida teha, ma ei taha talle haiget teha.',
        'She is sitting outside my door again. I do not know what to do, I do not want to hurt her.',
      ),
      T(
        'Mu auto küljel on kriimustatud sõna, ma tean, et see oli tema.',
        'There is a word scratched into the side of my car, I know it was her.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}.', 'Suspect: {suspect}.'),
      T('Naine on ähvardanud endale haiget teha.', 'The woman has threatened to harm herself.'),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: naine istub trepil ja nutab, ütleb, et tahab ainult rääkida.',
          '{callsign}: the woman is sitting on the stairs crying, says she only wants to talk.',
        ),
      ]),
      qPerson('suspect', 3, {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Palun kontrolli naist {name}, isikukood {idcode}.',
            'Control, {callsign}. Please check the woman {name}, ID code {idcode}.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'report',
        'report',
        [0.5, 1],
        3,
        T(
          'Alustati kriminaalmenetlust ahistava jälitamise ja auto kahjustamise eest. Naisele pakuti kriisinõustamist, mehele selgitati lähenemiskeelu taotlemist.',
          'Criminal proceedings were opened for stalking and damaging the car. The woman was offered crisis counselling and the man was told how to apply for a restraining order.',
        ),
        { trust: 2 },
      ),
      oc(
        'taken_home',
        'warning',
        [0.25, 0.6],
        2,
        T(
          'Naist hoiatati ja ta viidi koju. Mees otsustas avalduse esitada hiljem.',
          'The woman was warned and driven home. The man decided to file a complaint later.',
        ),
      ),
      oc(
        'crisis',
        'referred',
        [0, 0.35],
        2,
        T(
          'Naine oli väga häiritud ja ähvardas endale haiget teha. Ta anti kiirabi hoole alla, menetlus otsustatakse hiljem.',
          'The woman was very distressed and threatened to harm herself. She was handed over to the ambulance crew and the proceedings will be decided later.',
        ),
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Mu endine elukaaslane istub jälle mu ukse taga ja ei lähe ära.',
          'Hello. My ex-girlfriend is sitting outside my door again and will not leave.',
        ),
        T(
          'Ta ei jäta mind rahule: istub iga päev mu ukse taga ja kriimustas mu auto ära.',
          'She will not leave me alone: she sits outside my door every day and scratched my car.',
        ),
      ],
      openingRu: [
        'Здравствуйте. Бывшая опять сидит у меня под дверью и не уходит.',
        'Она не оставляет меня в покое: каждый день сидит у меня под дверью и поцарапала мне машину.',
      ],
      answers: {
        suspect: [
          T(
            'Mu endine elukaaslane, me läksime lahku kaks kuud tagasi.',
            'My ex-girlfriend, we broke up two months ago.',
          ),
        ],
        weapons: [T('Ei, relva tal ei ole.', 'No, she does not have a weapon.')],
        safe: [T('Jah, ma olen korteris, uks on lukus.', 'Yes, I am in the flat with the door locked.')],
        intoxicated: [T('Võib-olla natuke, ta lõhnab veini järele.', 'Maybe a bit, she smells of wine.')],
      },
      answersRu: {
        suspect: ['Моя бывшая, мы расстались два месяца назад.'],
        weapons: ['Нет, оружия у неё нет.'],
        safe: ['Да, я в квартире, дверь закрыта.'],
        intoxicated: ['Может, немного, от неё пахнет вином.'],
      },
    },
    tags: ['stalking'],
  },
  {
    id: 'kindergarten_run',
    title: T(
      'Ahistav jälitamine: endine mees varitseb hommikuti',
      'Stalking: an ex lies in wait every morning',
    ),
    persons: [vic('F', [24, 45]), sus('M', [26, 50], 'ex_partner', { record: 0.4, restraining: 0.1 })],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et endine elukaaslane ootab teda igal hommikul maja ees ja sõidab autoga järele, kui ta last lasteaeda viib.',
        '{address}. A woman reports her ex-partner waits outside her building every morning and follows her by car when she takes their child to kindergarten.',
      ),
      T(
        '{address}. Endine mees on juba nädal aega hommikuti maja juures. Täna blokeeris ta autoga naise tee ja karjus lapse ees.',
        '{address}. The ex has been at the building every morning for a week. Today he blocked her way with his car and shouted in front of the child.',
      ),
    ],
    callerLines: [
      T(
        'Ta on igal hommikul siin. Suhtluskord on kohtus paika pandud, aga ta ei pea sellest kinni.',
        'He is here every morning. Contact arrangements were set by the court, but he does not stick to them.',
      ),
      T(
        'Täna pani ta auto mu ette ja karjus. Laps nuttis terve tee lasteaeda.',
        'Today he put his car in front of me and shouted. The child cried all the way to kindergarten.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}, lapse isa.', 'Suspect: {suspect}, the child’s father.'),
      T('Mehe sõiduk: {car}, reg nr {plate}.', 'The man’s vehicle: {car}, plate {plate}.'),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 0.5,
        reason: T('Laps on konflikti tunnistaja', 'A child witnesses the conflict'),
      },
    ],
    beats: [
      qVehicle('arrive', { chance: 0.6 }),
      info(4, [
        T(
          '{callsign}: teataja on kõik hommikud kirja pannud, naabril on ka video. Vormistame avalduse.',
          '{callsign}: the caller has written down every morning and a neighbour has video too. Taking a statement.',
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
          'Alustati kriminaalmenetlust ahistava jälitamise eest (KarS § 157³). Lastekaitset teavitati, emale selgitati lähenemiskeelu ja suhtluskorra muutmise võimalusi.',
          'Criminal proceedings were opened for stalking (KarS § 157³). Child protection was informed and the mother was told how to seek a restraining order and change the contact arrangements.',
        ),
        { trust: 2 },
      ),
      oc(
        'warned',
        'warning',
        [0.25, 0.6],
        2,
        T(
          'Mees leiti ja teda hoiatati kriminaalvastutusest. Naisele anti nõu tõendite kogumiseks.',
          'The man was found and warned about criminal liability. The woman was advised on collecting evidence.',
        ),
      ),
      oc(
        'referred',
        'referred',
        [0, 0.35],
        2,
        T(
          'Naine ei soovinud avaldust esitada, et mitte last konflikti tõmmata. Talle anti ohvriabi ja perelepitusteenuse kontaktid.',
          'The woman did not want to file a complaint so as not to drag the child into the conflict. She was given victim support and family mediation contacts.',
        ),
        { trust: -1 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Mu endine mees ootab mind igal hommikul maja ees ja sõidab mulle järele.',
          'Hello. My ex waits for me outside the building every morning and follows me.',
        ),
        T(
          'Ta jälitab mind igal hommikul ja täna blokeeris ta mu tee autoga.',
          'He follows me every morning and today he blocked my way with his car.',
        ),
      ],
      openingRu: [
        'Здравствуйте. Бывший муж каждое утро ждёт меня у дома и едет следом.',
        'Он каждое утро меня преследует, а сегодня перегородил мне дорогу машиной.',
      ],
      answers: {
        vehicle: [T('{car}, number {plate}.', '{car}, plate {plate}.')],
        children: [T('Meil on ühine laps, ta on viieaastane.', 'We have a child together, she is five.')],
        suspect: [
          T('Lapse isa, me läksime lahku aasta tagasi.', 'The child’s father, we split up a year ago.'),
        ],
        safe: [T('Praegu jah, ta sõitis minema.', 'For now yes, he drove off.')],
      },
      answersRu: {
        vehicle: ['{car}, номер {plate}.'],
        children: ['У нас общий ребёнок, дочке пять лет.'],
        suspect: ['Отец ребёнка, мы расстались год назад.'],
        safe: ['Пока да, он уехал.'],
      },
    },
    tags: ['stalking', 'children'],
  },
];

// ── domestic_child_caller ───────────────────────────────────────────────────
const SC_CHILD_CALLER: IncidentScenario[] = [
  {
    id: 'hiding_in_wardrobe',
    persons: [
      vic('F', [25, 50]),
      sus('M', [25, 50], 'partner', { intoxicated: 0.8, record: 0.5 }),
      { role: 'caller', gender: 'any', age: [6, 10], relation: 'child' },
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
    callerLinesRu: [
      '(плачет) Папа бьёт маму... приезжайте, пожалуйста.',
      'Я {спрятался|спряталась} в шкаф. Папа кричит, и что-то разбилось.',
    ],
  },
  {
    id: 'big_brother',
    title: T('Laps teatab: vend lööb ema', 'Child reports: big brother hitting mum'),
    persons: [
      vic('F', [35, 55]),
      sus('M', [17, 25], 'child', { intoxicated: 0.6, record: 0.4 }),
      { role: 'caller', gender: 'any', age: [8, 12], relation: 'child' },
    ],
    summary: [
      T(
        '{address}. Helistab laps rõdult: suur vend lõi ema, sest ema ei andnud talle raha. Vend lõhub köögis asju.',
        '{address}. A child is calling from the balcony: their big brother hit their mother because she would not give him money. He is smashing things in the kitchen.',
      ),
      T(
        '{address}. Lapse kõne: täiskasvanud vend karjub ema peale ja tõukas ta vastu kappi. Laps on end rõdule peitnud.',
        '{address}. Call from a child: their grown-up brother is shouting at their mother and shoved her against a cupboard. The child is hiding on the balcony.',
      ),
    ],
    callerLines: [
      T(
        'Vend lõi emmet! Ma olen rõdul, ma kardan sisse minna.',
        'My brother hit mummy! I am on the balcony, I am scared to go in.',
      ),
      T(
        'Ta tahtis raha ja emme ütles ei. Siis ta läks täitsa hulluks.',
        'He wanted money and mummy said no. Then he went completely mad.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}, pere vanem poeg.', 'Suspect: {suspect}, the family’s elder son.'),
      T(
        'Helistaja on umbes kümneaastane, peidab end rõdul.',
        'The caller is about ten and hiding on the balcony.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: vend on köögis, rahutu, ema istub esikus ja nutab. Väike laps on rõdul.',
          '{callsign}: the brother is in the kitchen, agitated; the mother is sitting in the hall crying. The little one is on the balcony.',
        ),
      ]),
      qPerson('suspect', 4, { radio: Q_LSV }),
      agency('sotsiaal', 9, {
        radio: [
          T(
            '{callsign}: alaealine nägi vägivalda pealt, palun teavitage lastekaitset.',
            '{callsign}: a minor witnessed the violence, please notify child protection.',
          ),
        ],
      }),
      toArrest(15, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Vanem poeg peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi, lastekaitset teavitati noorema lapse olukorrast.',
          'The elder son was detained and taken to the arrest house. Criminal proceedings were opened under KarS § 121 and child protection was told about the younger child.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'ban',
        'report',
        [0.35, 0.7],
        3,
        T(
          'Vanemale pojale kohaldati viibimiskeeld ja ta läks isa juurde. Alustati kriminaalmenetlust, pere suunati ohvriabisse.',
          'The elder son was given a removal order and went to his father’s. Criminal proceedings were opened and the family was referred to victim support.',
        ),
        { trust: 1 },
      ),
      oc(
        'hurt',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Ema sai köögis kukkudes peavigastuse ja toimetati haiglasse. Vend jooksis minema ja kuulutati tagaotsitavaks.',
          'The mother hit her head when she fell in the kitchen and was taken to hospital. The brother ran off and is wanted.',
        ),
        { injuries: 1, trust: -4 },
      ),
    ],
    call: {
      mood: 'child',
      opening: [
        T('(nuttes) Halloo... mu suur vend lõi emmet!', '(crying) Hello... my big brother hit mummy!'),
        T(
          '(nuttes) Vend tahtis raha ja lõi emmet. Ma olen rõdul.',
          '(crying) My brother wanted money and hit mummy. I am on the balcony.',
        ),
      ],
      openingRu: [
        '(плачет) Алло... мой старший брат ударил маму!',
        '(плачет) Брат хотел денег и ударил маму. Я на балконе.',
      ],
      answers: {
        where: [T('Me elame {address}. Ma olen rõdul.', 'We live at {address}. I am on the balcony.')],
        name: [T('Mina olen noorem laps. Mul on hirm.', 'I am the younger one. I am scared.')],
        safe: [T('Ma olen rõdul, uks on kinni.', 'I am on the balcony, the door is shut.')],
        suspect: [
          T(
            'See on mu suur vend. Ta on juba täiskasvanu.',
            'It is my big brother. He is a grown-up already.',
          ),
        ],
        children: [T('Ainult mina. Vend on suur.', 'Only me. My brother is big.')],
        weapons: [T('Ma ei tea... ta viskas taldrikuid.', 'I do not know... he threw plates.')],
      },
      answersRu: {
        where: ['Мы живём: {address}. Я на балконе.'],
        name: ['Я младший ребёнок. Мне страшно.'],
        safe: ['Я на балконе, дверь закрыта.'],
        suspect: ['Это мой старший брат. Он уже взрослый.'],
        children: ['Только я. Брат уже большой.'],
        weapons: ['Не знаю... он тарелки бросал.'],
      },
    },
  },
  {
    id: 'mums_boyfriend',
    title: T('Laps teatab: ema elukaaslane lõi teda', 'Child reports: mum’s boyfriend hit him'),
    persons: [vic('any', [9, 13]), sus('M', [25, 45], 'family', { intoxicated: 0.75, record: 0.5 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Helistab laps: ema elukaaslane lõi teda, kuna ta lõhkus mehe telefoni. Ema ei ole kodus, laps on vannitoas lukus.',
        '{address}. A child is calling: their mother’s boyfriend hit them because they broke his phone. The mother is not at home; the child is locked in the bathroom.',
      ),
      T(
        '{address}. Lapse kõne vannitoast: ema mees on purjus, karjub ja peksab vannitoa ust. Laps on nutune, põsk valutab.',
        '{address}. A child calling from the bathroom: their mother’s partner is drunk, shouting and pounding on the bathroom door. The child is tearful and their cheek hurts.',
      ),
    ],
    callerLines: [
      T(
        'Ta lõi mind... ma kogemata lõhkusin ta telefoni. Ma olen vannitoas.',
        'He hit me... I broke his phone by accident. I am in the bathroom.',
      ),
      T(
        'Emme on tööl. Palun ärge öelge onule, et ma helistasin.',
        'Mummy is at work. Please do not tell him I called.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}, lapse ema elukaaslane.',
        'Suspect: {suspect}, the child’s mother’s partner.',
      ),
      T(
        'Ema on öövahetuses tööl, temaga püütakse ühendust saada.',
        'The mother is on a night shift; officers are trying to reach her.',
      ),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 1,
        reason: T('Laps on vägivalla ohver', 'The child is a victim of violence'),
      },
      {
        agency: 'kiirabi',
        chance: 0.3,
        reason: T('Lapsel võimalikud vigastused', 'The child may be injured'),
      },
    ],
    beats: [
      doorChoice('arrive'),
      qPerson('suspect', 4, { radio: Q_LSV }),
      agency('sotsiaal', 8, {
        radio: [
          T(
            '{callsign}: laps on vägivalla ohver, ema on tööl. Palun lastekaitse kohe.',
            '{callsign}: the child is a victim of violence and the mother is at work. Request child protection now.',
          ),
        ],
      }),
      toArrest(14, { chance: 0.75 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust lapse kehalise väärkohtlemise eest, laps anti ema hoole alla ja lastekaitse võttis juhtumi menetlusse.',
          'The man was detained and taken to the arrest house. Criminal proceedings were opened for assaulting the child; the child was handed to the mother and child protection took up the case.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'ban',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Mehele kohaldati viibimiskeeld ja ta pidi korterist lahkuma. Alustati kriminaalmenetlust, laps jäi naabri juurde ema saabumiseni.',
          'The man was given a removal order and had to leave the flat. Criminal proceedings were opened and the child stayed with a neighbour until the mother arrived.',
        ),
        { trust: 1 },
      ),
      oc(
        'late',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Mees oli vannitoa ukse lahti murdnud ja last uuesti löönud. Laps toimetati kontrolliks haiglasse, mees peeti kinni.',
          'The man had broken the bathroom door open and hit the child again. The child was taken to hospital for a check-up and the man was detained.',
        ),
        { arrests: 1, injuries: 1, trust: -5 },
      ),
    ],
    call: {
      mood: 'child',
      opening: [
        T(
          '(sosinal) Halloo... ema mees lõi mind. Ma olen vannitoas.',
          '(whispering) Hello... my mum’s boyfriend hit me. I am in the bathroom.',
        ),
        T(
          '(sosinal) Ma lõhkusin kogemata ta telefoni ja ta lõi mind. Emme on tööl.',
          '(whispering) I broke his phone by accident and he hit me. Mummy is at work.',
        ),
      ],
      openingRu: [
        '(шёпотом) Алло... мамин друг меня ударил. Я в ванной.',
        '(шёпотом) Я случайно {разбил|разбила} его телефон, и он меня ударил. Мама на работе.',
      ],
      answers: {
        weapons: [T('Ei, ta lõi käega.', 'No, he hit me with his hand.')],
        name: [
          T(
            'Mina olen see laps, kes siin elab. Emme on tööl.',
            'I am the kid who lives here. Mummy is at work.',
          ),
        ],
        injured: [
          T('Põsk valutab ja nina tilgub natuke verd.', 'My cheek hurts and my nose is bleeding a little.'),
        ],
        safe: [
          T(
            'Ma olen vannitoas, uks on lukus. Ta peksab ust.',
            'I am in the bathroom, the door is locked. He is banging on it.',
          ),
        ],
        suspect: [T('See on emme uus mees. Ta on purjus.', 'It is mummy’s new boyfriend. He is drunk.')],
        children: [T('Ainult mina. Emme on tööl.', 'Only me. Mummy is at work.')],
        intoxicated: [T('Jah, ta jõi õlut terve õhtu.', 'Yes, he drank beer all evening.')],
      },
      answersRu: {
        weapons: ['Нет, он рукой ударил.'],
        name: ['Я ребёнок, я тут живу. Мама на работе.'],
        injured: ['Щека болит, и из носа немножко кровь капает.'],
        safe: ['Я в ванной, дверь закрыта. Он стучит в дверь.'],
        suspect: ['Это мамин новый друг. Он пьяный.'],
        children: ['Только я. Мама на работе.'],
        intoxicated: ['Да, он весь вечер пиво пил.'],
      },
    },
    tags: ['children'],
  },
  {
    id: 'grandparents',
    title: T('Laps teatab: vanaisa lööb vanaema', 'Child reports: grandad hitting grandma'),
    persons: [
      vic('F', [58, 80]),
      sus('M', [60, 82], 'partner', { intoxicated: 0.85, record: 0.3 }),
      { role: 'caller', gender: 'any', age: [7, 12], relation: 'family' },
    ],
    summary: [
      T(
        '{address}. Vanavanemate juures külas olev laps helistab: vanaisa jõi ja lööb vanaema. Laps on teisel korrusel toas.',
        '{address}. A child staying with their grandparents is calling: grandad has been drinking and is hitting grandma. The child is in a room upstairs.',
      ),
      T(
        '{address}. Lapse kõne: vanaisa karjub ja lükkas vanaema pikali. Vanemad on linnas, laps on vanavanemate juures puhkusel.',
        '{address}. Call from a child: grandad is shouting and pushed grandma over. The parents are in town and the child is staying with the grandparents for the holidays.',
      ),
    ],
    callerLines: [
      T(
        'Vanaisa lõi vanaema ja vanaema kukkus. Ma olen ülakorrusel.',
        'Grandad hit grandma and she fell. I am upstairs.',
      ),
      T(
        'Emme tuleb mulle alles pühapäeval järele. Ma tahan koju.',
        'Mummy is only picking me up on Sunday. I want to go home.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}, lapse vanaisa.', 'Suspect: {suspect}, the child’s grandfather.'),
      T(
        'Lapse vanemad on teises linnas, nendega võetakse ühendust.',
        'The child’s parents are in another town; officers are contacting them.',
      ),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 1,
        reason: T('Laps on vägivalla tunnistaja', 'A child witnessed the violence'),
      },
      { agency: 'kiirabi', chance: 0.5, reason: T('Eakas kannatanu kukkus', 'Elderly victim fell') },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: vanaema istub köögis, käsi valutab. Vanaisa on purjus ja sõimab. Laps on üleval.',
          '{callsign}: the grandmother is sitting in the kitchen holding her arm. The grandfather is drunk and swearing. The child is upstairs.',
        ),
      ]),
      kiirabi(3, {
        chance: 0.5,
        radio: [
          T(
            '{callsign}: eakas naine kukkus, käsi võib olla murtud. Palun kiirabi.',
            '{callsign}: an elderly woman fell, her arm may be broken. Request an ambulance.',
          ),
        ],
      }),
      qPerson('suspect', 5, { radio: Q_LSV }),
      toArrest(15, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Vanaisa peeti kinni. Alustati kriminaalmenetlust KarS § 121 järgi, lapse ema sõitis lapsele järele ja lastekaitset teavitati.',
          'The grandfather was detained. Criminal proceedings were opened under KarS § 121; the child’s mother drove over to collect the child and child protection was informed.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'ban',
        'report',
        [0.3, 0.65],
        3,
        T(
          'Vanaisale kohaldati viibimiskeeld ja ta viidi venna juurde. Alustati kriminaalmenetlust, laps jäi vanaema juurde kuni ema saabumiseni.',
          'The grandfather was given a removal order and driven to his brother’s. Criminal proceedings were opened and the child stayed with the grandmother until the mother arrived.',
        ),
        { trust: 1 },
      ),
      oc(
        'fracture',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Vanaemal oli käsi murtud ja ta toimetati haiglasse. Vanaisa peeti kinni, laps anti lastekaitse kaudu tädi hoole alla.',
          'The grandmother’s arm was broken and she was taken to hospital. The grandfather was detained and through child protection the child was placed with an aunt.',
        ),
        { arrests: 1, injuries: 1, trust: -3 },
      ),
    ],
    call: {
      mood: 'child',
      opening: [
        T(
          '(nuttes) Halloo... vanaisa lõi vanaema. Vanaema kukkus maha.',
          '(crying) Hello... grandad hit grandma. Grandma fell down.',
        ),
        T(
          '(nuttes) Vanaisa jõi palju ja lükkas vanaema pikali. Ma olen üleval.',
          '(crying) Grandad drank a lot and pushed grandma over. I am upstairs.',
        ),
      ],
      openingRu: [
        '(плачет) Алло... дедушка ударил бабушку. Бабушка упала.',
        '(плачет) Дедушка много выпил и толкнул бабушку. Я наверху.',
      ],
      answers: {
        where: [
          T('Ma olen vanaema juures. Aadress on {address}.', 'I am at grandma’s. The address is {address}.'),
        ],
        name: [T('Mina olen lapselaps. Ma olen siin külas.', 'I am their grandchild. I am staying here.')],
        safe: [
          T('Ma olen ülakorrusel toas. Vanaisa on all.', 'I am in a room upstairs. Grandad is downstairs.'),
        ],
        suspect: [T('See on mu vanaisa. Ta jõi palju.', 'It is my grandad. He drank a lot.')],
        injured: [T('Vanaema hoiab kätt ja nutab.', 'Grandma is holding her arm and crying.')],
        children: [T('Ainult mina.', 'Only me.')],
      },
      answersRu: {
        where: ['Я у бабушки. Адрес: {address}.'],
        name: ['Я их {внук|внучка}. Я тут в гостях.'],
        safe: ['Я наверху в комнате. Дедушка внизу.'],
        suspect: ['Это мой дедушка. Он много выпил.'],
        injured: ['Бабушка держится за руку и плачет.'],
        children: ['Только я.'],
      },
    },
    tags: ['children', 'elderly'],
  },
  {
    id: 'from_neighbours_phone',
    title: T('Laps põgenes naabri juurde, vanemad kaklevad', 'Child fled to a neighbour, parents fighting'),
    persons: [
      vic('F', [25, 50], { intoxicated: 0.7 }),
      sus('M', [25, 52], 'partner', { intoxicated: 0.85, record: 0.5 }),
      { role: 'caller', gender: 'any', age: [8, 12], relation: 'child' },
    ],
    summary: [
      T(
        '{address}. Laps jooksis naabri juurde ja helistab naabri telefonilt: vanemad on purjus ja kaklevad, ema karjub appi.',
        '{address}. A child ran to a neighbour and is calling on the neighbour’s phone: the parents are drunk and fighting, the mother is screaming for help.',
      ),
      T(
        '{address}. Naabrinaise juures olev laps teatab, et isa ja ema kaklevad korteris ja isa lõi ema pudeliga. Laps on naabri juures turvaliselt.',
        '{address}. A child at a neighbour’s flat reports that dad and mum are fighting at home and dad hit mum with a bottle. The child is safe at the neighbour’s.',
      ),
    ],
    callerLines: [
      T(
        'Ma jooksin naabritädi juurde. Issi ja emme kaklevad ja emme karjub.',
        'I ran to the lady next door. Daddy and mummy are fighting and mummy is screaming.',
      ),
      T(
        'Naabritädi ütles, et ma helistaksin teile ise. Issi lõi emmet pudeliga.',
        'The lady next door told me to call you myself. Daddy hit mummy with a bottle.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Mõlemad vanemad on joobes.',
        'Suspect: {suspect}. Both parents are intoxicated.',
      ),
      T('Laps on naabrinaise korteris turvaliselt.', 'The child is safe in the neighbour’s flat.'),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 1,
        reason: T('Laps on vägivalla tunnistaja', 'A child witnessed the violence'),
      },
      { agency: 'kiirabi', chance: 0.6, reason: T('Kannatanul peavigastus', 'Victim has a head injury') },
    ],
    beats: [
      backup(0.2, un('patrol'), {
        radio: [
          T(
            '{callsign}: kaks joobes ja agressiivset osapoolt, palun lisapatrull.',
            '{callsign}: two drunk and aggressive parties, request another patrol.',
          ),
        ],
      }),
      kiirabi(3, {
        chance: 0.6,
        radio: [
          T(
            '{callsign}: naisel peahaav, palun kiirabi.',
            '{callsign}: the woman has a head wound, request an ambulance.',
          ),
        ],
      }),
      qPerson('suspect', 5, { radio: Q_LSV }),
      agency('sotsiaal', 9, {
        radio: [
          T(
            '{callsign}: laps on naabri juures, vanemad joobes. Palun lastekaitse.',
            '{callsign}: the child is at the neighbour’s and the parents are drunk. Request child protection.',
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
          'Isa peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi, laps jäi lastekaitse otsusel vanaema juurde.',
          'The father was detained and taken to the arrest house. Criminal proceedings were opened under KarS § 121 and child protection placed the child with the grandmother.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'both_sober',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Mõlemad vanemad toimetati kainenema, isa suhtes alustati kriminaalmenetlust. Laps jäi ööseks naabri juurde, lastekaitse võttis juhtumi üle.',
          'Both parents were taken to sober up and proceedings were opened against the father. The child stayed the night at the neighbour’s and child protection took over the case.',
        ),
      ),
      oc(
        'hurt',
        'hospital',
        [0, 0.35],
        2,
        T(
          'Ema peahaav vajas haiglaravi. Isa jooksis enne patrulli saabumist minema ja kuulutati tagaotsitavaks.',
          'The mother’s head wound needed hospital treatment. The father ran off before the patrol arrived and is wanted.',
        ),
        { injuries: 1, trust: -4 },
      ),
    ],
    call: {
      mood: 'child',
      opening: [
        T(
          'Halloo... ma olen naabritädi juures. Issi ja emme kaklevad!',
          'Hello... I am at the lady next door’s. Daddy and mummy are fighting!',
        ),
        T(
          'Issi lõi emmet pudeliga ja ma jooksin naabritädi juurde.',
          'Daddy hit mummy with a bottle and I ran to the lady next door.',
        ),
      ],
      openingRu: [
        'Алло... я у соседки. Папа с мамой дерутся!',
        'Папа ударил маму бутылкой, и я {убежал|убежала} к соседке.',
      ],
      answers: {
        where: [
          T(
            'Meie korter on {address}. Ma olen naabri juures.',
            'Our flat is {address}. I am at the neighbour’s.',
          ),
        ],
        name: [
          T('Mina olen nende laps. Naabritädi on minuga.', 'I am their kid. The lady next door is with me.'),
        ],
        safe: [
          T(
            'Jah, ma olen naabritädi juures, uks on lukus.',
            'Yes, I am at the neighbour’s and the door is locked.',
          ),
        ],
        suspect: [T('Issi. Ta on väga purjus.', 'Daddy. He is very drunk.')],
        weapons: [T('Issi lõi pudeliga.', 'Daddy hit her with a bottle.')],
        children: [T('Ainult mina. Ma olen nüüd naabri juures.', 'Only me. I am at the neighbour’s now.')],
      },
      answersRu: {
        where: ['Наша квартира: {address}. Я у соседки.'],
        name: ['Я их ребёнок. Соседка со мной.'],
        safe: ['Да, я у соседки, дверь закрыта.'],
        suspect: ['Папа. Он очень пьяный.'],
        weapons: ['Папа ударил бутылкой.'],
        children: ['Только я. Я теперь у соседки.'],
      },
    },
    tags: ['children'],
  },
];

// ── domestic_knife ──────────────────────────────────────────────────────────
const SC_KNIFE: IncidentScenario[] = [
  {
    id: 'kitchen_cut',
    persons: [
      vic('F', [22, 60]),
      sus('M', [25, 60], 'partner', { intoxicated: 0.8, record: 0.6, restraining: 0.1 }),
    ],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine karjub telefoni: elukaaslane ähvardab teda noaga ja lõikas kätt. Mees on köögis.',
        '{address}. A woman is screaming down the phone: her partner is threatening her with a knife and has cut her arm. He is in the kitchen.',
      ),
      T(
        '{address}. Naine põgenes trepikotta, käsi veritseb. Elukaaslane on köögis noaga ja lubab tappa, kui naine tagasi tuleb.',
        '{address}. The woman fled into the stairwell with a bleeding arm. Her partner is in the kitchen with a knife and says he will kill her if she comes back.',
      ),
    ],
    callerLines: [
      T('Tal on nuga! Ta lõikas mind, palun kiiresti!', 'He has a knife! He cut me, please hurry!'),
      T(
        'Ma jooksin trepikotta, käsi on verine. Ta on köögis ja karjub.',
        'I ran into the stairwell and my arm is bloody. He is in the kitchen shouting.',
      ),
    ],
    callerLinesRu: [
      'У него нож! Он меня порезал, пожалуйста, быстрее!',
      'Я выбежала в подъезд, рука в крови. Он на кухне и орёт.',
    ],
  },
  {
    id: 'barricaded_selfharm',
    title: T('Lähisuhtevägivald noaga: mees barrikadeerus', 'Domestic violence with a knife: man barricaded'),
    persons: [
      vic('F', [22, 60]),
      sus('M', [25, 60], 'partner', { intoxicated: 0.8, record: 0.6 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Teataja sõnul on mehel nuga, naine on trepikojas ja veritseb. Mees lukustas end korterisse.',
        '{address}. The caller says a man has a knife; the woman is in the stairwell bleeding. He has locked himself in the flat.',
      ),
      T(
        '{address}. Naabri teatel lõikas mees elukaaslast ja lukustas end korterisse, karjub, et tapab ka enda. Naine istub trepil.',
        '{address}. A neighbour reports a man cut his partner and locked himself in the flat, shouting that he will kill himself too. The woman is sitting on the stairs.',
      ),
    ],
    callerLines: [
      T(
        'Naine istub trepil, käsi on verine. Mees karjub korteris, et tapab ennast ka.',
        'The woman is sitting on the stairs, her arm is bloody. The man is shouting in the flat that he will kill himself too.',
      ),
      T(
        'Ma sidusin naise käe rätikuga kinni. Mees ei ava ust.',
        'I tied a towel round the woman’s arm. The man will not open the door.',
      ),
    ],
    call: {
      mood: 'panic',
      opening: [
        T(
          'Naabrimees lõikas oma naist noaga ja pani end korterisse lukku! Naine istub verisena trepil!',
          'The man next door cut his wife with a knife and locked himself in the flat! She is sitting on the stairs covered in blood!',
        ),
        T(
          'Ta lõikas naist ja pani end korterisse lukku. Ta karjub, et tapab ka enda.',
          'He cut his wife and locked himself in the flat. He is shouting that he will kill himself too.',
        ),
      ],
      openingRu: [
        'Сосед порезал жену ножом и заперся в квартире! Она сидит на лестнице вся в крови!',
        'Он порезал жену и заперся в квартире. Кричит, что убьёт и себя.',
      ],
      answers: {
        injured: [
          T(
            'Naise käsi veritseb, ma hoian rätikut peal.',
            'The woman’s arm is bleeding, I am holding a towel on it.',
          ),
        ],
        weapons: [
          T(
            'Tal on nuga, naise sõnul suur kööginuga.',
            'He has a knife, a big kitchen knife the woman says.',
          ),
        ],
        safe: [
          T('Me oleme trepil, tema on korteris lukus.', 'We are on the stairs and he is locked in the flat.'),
        ],
        direction: [T('Ta on korteris ja ust ei ava.', 'He is in the flat and will not open the door.')],
        intoxicated: [T('Naine ütleb, et ta on täiesti purjus.', 'The woman says he is completely drunk.')],
        children: [T('Ei, lapsi neil ei ole.', 'No, they have no children.')],
      },
      answersRu: {
        injured: ['У женщины рука в крови, я держу на ней полотенце.'],
        weapons: ['У него нож, она говорит, большой кухонный.'],
        safe: ['Мы на лестнице, а он заперся в квартире.'],
        direction: ['Он в квартире и дверь не открывает.'],
        intoxicated: ['Она говорит, что он в стельку пьяный.'],
        children: ['Нет, детей у них нет.'],
      },
    },
  },
  {
    id: 'knife_on_table',
    title: T('Ähvardamine noaga: nuga on laual', 'Threats with a knife: the knife is on the table'),
    persons: [vic('F', [22, 60]), sus('M', [25, 65], 'partner', { intoxicated: 0.9, record: 0.5 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine põgenes naabrite juurde: elukaaslane pani köögilauale noa ja ütles, et see on tema jaoks. Mees istub köögis ja joob.',
        '{address}. A woman fled to the neighbours: her partner put a knife on the kitchen table and said it was meant for her. He is sitting in the kitchen drinking.',
      ),
      T(
        '{address}. Joobes mees ähvardab elukaaslast laual oleva noaga. Naine on naabrite juures, mees on korteris üksi.',
        '{address}. A drunk man is threatening his partner with a knife from the table. She is at the neighbours’; he is alone in the flat.',
      ),
    ],
    callerLines: [
      T(
        'Ta pani noa lauale ja ütles, et see on minu jaoks. Ma jooksin naabrite juurde.',
        'He put the knife on the table and said it was for me. I ran to the neighbours.',
      ),
      T(
        'Ta ei ole mind veel puutunud, aga ma tean, et ta teeb seda.',
        'He has not touched me yet, but I know he will.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Tugevas joobes, köögis üksi, nuga laual.',
        'Suspect: {suspect}. Heavily drunk, alone in the kitchen, knife on the table.',
      ),
      T('Kannatanu on naabrite korteris, vigastusteta.', 'The victim is in the neighbours’ flat, uninjured.'),
    ],
    agencies: [],
    beats: [
      backup(0.5, un('rapid'), {
        at: 'arrive',
        radio: [
          T(
            '{callsign}: mees noaga korteris, vajame kiirreageerijaid enne sisenemist!',
            '{callsign}: man with a knife in the flat, we need rapid response before we go in!',
          ),
        ],
      }),
      choice(
        3,
        [
          T(
            '{callsign}: mees istub köögis, nuga on laual tema ees. Uks on lahti. Kas siseneme kohe või kutsume ta välja?',
            '{callsign}: the man is sitting in the kitchen with the knife on the table in front of him. The door is open. Do we go in now or call him out?',
          ),
        ],
        [
          opt(
            'callout',
            T('Kutsuge ta välja, käed nähtaval', 'Call him out with his hands visible'),
            T(
              '{callsign}, juhtimine. Käskige tal nuga mitte puutuda ja välja tulla.',
              '{callsign}, Control. Order him not to touch the knife and to come out.',
            ),
            { success: 0.15, time: 8 },
          ),
          opt(
            'rush',
            T('Sisenege kohe', 'Go in now'),
            T(
              '{callsign}, juhtimine. Sisenege, kasutage erivahendeid.',
              '{callsign}, Control. Go in and use your equipment.',
            ),
            { success: 0.05, risk: 0.15 },
          ),
        ],
        'callout',
      ),
      qPerson('suspect', 8, { radio: Q_LSV }),
      toArrest(14, { chance: 0.8 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees tuli käsklusel välja ja peeti kinni, nuga võeti asitõendiks. Alustati kriminaalmenetlust ähvardamise eest (KarS § 120), naine suunati ohvriabisse.',
          'The man came out when ordered and was detained; the knife was taken as evidence. Criminal proceedings were opened for threats (KarS § 120) and the woman was referred to victim support.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'struggle',
        'arrest',
        [0.3, 0.6],
        2,
        T(
          'Mees haaras noa, kuid ta relvitustati ja peeti kinni. Alustati kriminaalmenetlust ähvardamise ja politseiametniku vastu vägivalla tarvitamise eest.',
          'The man grabbed the knife but was disarmed and detained. Criminal proceedings were opened for threats and for using violence against a police officer.',
        ),
        { arrests: 1, trust: 1 },
      ),
      oc(
        'cut',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Mees vigastas noaga iseennast enne, kui teda peatada jõuti. Ta toimetati haiglasse, menetlus jätkub.',
          'The man cut himself with the knife before he could be stopped. He was taken to hospital and proceedings continue.',
        ),
        { injuries: 1, trust: -3 },
      ),
    ],
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mu mees pani noa lauale ja ütles, et see on minu jaoks! Ma olen naabrite juures!',
          'My husband put a knife on the table and said it was for me! I am at the neighbours’!',
        ),
        T(
          'Ta istub köögis, nuga on laual tema ees, ja ütleb, et see on minu jaoks.',
          'He is sitting in the kitchen with the knife on the table in front of him, saying it is meant for me.',
        ),
      ],
      openingRu: [
        'Муж положил нож на стол и сказал, что это для меня! Я у соседей!',
        'Он сидит на кухне, нож на столе перед ним, и говорит, что это для меня.',
      ],
      answers: {
        weapons: [
          T(
            'Kööginuga, suur. See on laual tema ees.',
            'A big kitchen knife. It is on the table in front of him.',
          ),
        ],
        injured: [T('Ei, ta ei jõudnud mind puudutada.', 'No, he did not get to touch me.')],
        safe: [
          T(
            'Jah, ma olen naabrite juures, uks on lukus.',
            'Yes, I am at the neighbours’ with the door locked.',
          ),
        ],
        direction: [T('Ta on köögis, ta ei liigu.', 'He is in the kitchen, he is not moving.')],
        intoxicated: [T('Ta on joonud hommikust saati.', 'He has been drinking since the morning.')],
        children: [T('Ei, lapsi meil ei ole.', 'No, we have no children.')],
      },
      answersRu: {
        weapons: ['Кухонный нож, большой. Лежит на столе перед ним.'],
        injured: ['Нет, он не успел меня тронуть.'],
        safe: ['Да, я у соседей, дверь закрыта.'],
        direction: ['Он на кухне, никуда не двигается.'],
        intoxicated: ['Он с утра пьёт.'],
        children: ['Нет, детей у нас нет.'],
      },
    },
  },
  {
    id: 'son_threatens_father',
    title: T('Ähvardamine noaga: poeg ähvardab isa', 'Threats with a knife: son threatening his father'),
    persons: [vic('M', [50, 78]), sus('M', [20, 45], 'family', { intoxicated: 0.75, record: 0.55 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Mees teatab, et täiskasvanud poeg nõuab raha ja ähvardab teda noaga. Isa on end magamistuppa lukustanud.',
        '{address}. A man reports his adult son is demanding money and threatening him with a knife. The father has locked himself in the bedroom.',
      ),
      T(
        '{address}. Isa helistab magamistoast: poeg on narkojoobes, vehib noaga ja lõhub korteris asju.',
        '{address}. A father is calling from the bedroom: his son is high, waving a knife around and smashing things in the flat.',
      ),
    ],
    callerLines: [
      T(
        'Mu poeg tahab raha ja tal on nuga. Ma panin end magamistuppa lukku.',
        'My son wants money and he has a knife. I have locked myself in the bedroom.',
      ),
      T(
        'Ta ei ole täna tema ise. Ma kardan, et ta teeb midagi.',
        'He is not himself today. I am afraid he will do something.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}, kannatanu poeg. Võimalik narkojoove.',
        'Suspect: {suspect}, the victim’s son. Possibly under the influence of drugs.',
      ),
      T('Kannatanu on magamistoas, uks lukus.', 'The victim is in the bedroom with the door locked.'),
    ],
    agencies: [{ agency: 'kiirabi', chance: 0.3, reason: T('Võimalikud vigastused', 'Possible injuries') }],
    beats: [
      backup(0.6, un('rapid'), {
        at: 'arrive',
        radio: [
          T(
            '{callsign}: noaga isik korteris, vajame kiirreageerijaid!',
            '{callsign}: person with a knife in the flat, we need rapid response!',
          ),
        ],
      }),
      choice(
        4,
        [
          T(
            '{callsign}: poeg on esikus noaga, isa magamistoas. Kas siseneme kohe või räägime läbi ukse?',
            '{callsign}: the son is in the hall with the knife, the father is in the bedroom. Do we go in now or talk through the door?',
          ),
        ],
        [
          opt(
            'enter',
            T('Sisenege', 'Go in'),
            T(
              '{callsign}, juhtimine. Sisenege, kasutage erivahendeid.',
              '{callsign}, Control. Go in and use your equipment.',
            ),
            { success: 0.1, risk: 0.15 },
          ),
          opt(
            'talk',
            T('Rääkige, kuni lisajõud on kohal', 'Talk until backup arrives'),
            T(
              '{callsign}, juhtimine. Hoidke ust ja rääkige temaga.',
              '{callsign}, Control. Hold the door and talk to him.',
            ),
            { time: 15, success: 0.1, risk: -0.05 },
          ),
        ],
        'talk',
      ),
      qPerson('suspect', 8),
      toArrest(18, { chance: 0.75 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.6, 1],
        3,
        T(
          'Poeg loovutas noa ja peeti kinni. Alustati kriminaalmenetlust ähvardamise eest (KarS § 120), isale anti ohvriabi kontaktid.',
          'The son gave up the knife and was detained. Criminal proceedings were opened for threats (KarS § 120) and the father was given victim support contacts.',
        ),
        { arrests: 1, trust: 4 },
      ),
      oc(
        'long_talk',
        'arrest',
        [0.3, 0.65],
        2,
        T(
          'Poeg peeti kinni pärast pikki läbirääkimisi. Tal tuvastati narkojoove, menetlus jätkub ähvardamise ja asjade lõhkumise eest.',
          'The son was detained after lengthy negotiations. He was found to be on drugs; proceedings continue for threats and property damage.',
        ),
        { arrests: 1 },
      ),
      oc(
        'stabbed',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Poeg tungis magamistuppa ja isa sai käest noahaava. Isa toimetati haiglasse, poeg peeti kinni.',
          'The son forced his way into the bedroom and the father received a knife wound to the hand. The father was taken to hospital and the son was detained.',
        ),
        { arrests: 1, injuries: 1, trust: -4 },
      ),
    ],
    call: {
      mood: 'whisper',
      opening: [
        T(
          '(vaikselt) Mu poeg ähvardab mind noaga... ma olen magamistoas lukus.',
          '(quietly) My son is threatening me with a knife... I am locked in the bedroom.',
        ),
        T(
          '(vaikselt) Poeg nõuab raha ja vehib noaga. Ma olen magamistoas lukus.',
          '(quietly) My son is demanding money and waving a knife. I am locked in the bedroom.',
        ),
      ],
      openingRu: [
        '(тихо) Сын угрожает мне ножом... я заперся в спальне.',
        '(тихо) Сын требует деньги и машет ножом. Я заперся в спальне.',
      ],
      answers: {
        suspect: [T('Mu poeg, ta elab minuga.', 'My son, he lives with me.')],
        weapons: [T('Kööginuga. Suur.', 'A kitchen knife. A big one.')],
        safe: [
          T(
            'Ma olen magamistoas, uks on lukus. Ta tõmbab ukselinki.',
            'I am in the bedroom with the door locked. He is pulling at the handle.',
          ),
        ],
        intoxicated: [
          T('Ta on midagi võtnud, silmad on imelikud.', 'He has taken something, his eyes look strange.'),
        ],
        children: [T('Ei, ainult meie kaks.', 'No, just the two of us.')],
        injured: [T('Veel mitte. Palun kiiresti.', 'Not yet. Please hurry.')],
      },
      answersRu: {
        suspect: ['Мой сын, он живёт со мной.'],
        weapons: ['Кухонный нож. Большой.'],
        safe: ['Я в спальне, дверь заперта. Он дёргает ручку.'],
        intoxicated: ['Он что-то принял, глаза какие-то странные.'],
        children: ['Нет, только мы вдвоём.'],
        injured: ['Пока нет. Пожалуйста, быстрее.'],
      },
    },
    tags: ['drugs'],
  },
  {
    id: 'woman_stabbed_partner',
    title: T(
      'Noahaav lähisuhtes: naine lõi meest noaga',
      'Knife wound in a relationship: woman stabbed her partner',
    ),
    persons: [
      vic('M', [25, 60], { intoxicated: 0.85, record: 0.6 }),
      sus('F', [22, 58], 'partner', { intoxicated: 0.3, record: 0.05 }),
    ],
    callerRole: 'suspect',
    summary: [
      T(
        '{address}. Naine helistab ise: elukaaslane kägistas teda ja ta lõi mehele noaga kõhtu. Mees veritseb põrandal, naine surub haavale rätikut.',
        '{address}. A woman is calling herself: her partner was strangling her and she stabbed him in the stomach. He is bleeding on the floor and she is pressing a towel on the wound.',
      ),
      T(
        '{address}. Naise teatel lõi ta enesekaitseks vägivaldset elukaaslast noaga. Mees on teadvusel, kuid veritseb tugevalt.',
        '{address}. A woman says she stabbed her violent partner in self-defence. He is conscious but bleeding heavily.',
      ),
    ],
    callerLines: [
      T(
        'Ta kägistas mind ja ma haarasin noa... Ma ei tahtnud! Ta veritseb!',
        'He was strangling me and I grabbed the knife... I did not mean to! He is bleeding!',
      ),
      T(
        'Ta on mind aastaid peksnud. Täna ma arvasin, et ta tapab mu.',
        'He has beaten me for years. Tonight I thought he was going to kill me.',
      ),
    ],
    details: [
      T(
        'Helistaja on noa kasutaja ise: {suspect}. Kaelal on punased jäljed.',
        'The caller is the one who used the knife: {suspect}. Red marks on her neck.',
      ),
      T(
        'Aadressil on varasemaid LSV-sündmusi, kus mees oli vägivallatseja.',
        'Previous domestic incidents at this address with the man as the abuser.',
      ),
    ],
    agencies: [{ agency: 'kiirabi', chance: 1, reason: T('Noahaav kõhus', 'Stab wound to the abdomen') }],
    beats: [
      kiirabi('arrive', {
        radio: [
          T(
            '{callsign}: mehel noahaav kõhus, teadvusel. Kiirabi kiiresti!',
            '{callsign}: the man has a stab wound to the abdomen, conscious. Ambulance urgently!',
          ),
        ],
      }),
      backup(0.4, un('criminal'), {
        at: 4,
        timeoutMin: 8,
        radio: [
          T(
            '{callsign}: raske vigastus, palun kriminaalpolitsei ja ekspertiis.',
            '{callsign}: serious injury, request CID and forensics.',
          ),
        ],
      }),
      qPerson('victim', 6, {
        radio: [
          T(
            'Juhtimiskeskus, {callsign}. Kannatanu on {name}, isikukood {idcode}. Kas tal on varasemaid LSV-sündmusi vägivallatsejana?',
            'Control, {callsign}. The injured man is {name}, ID code {idcode}. Any previous domestic incidents as the abuser?',
          ),
        ],
      }),
      toArrest(20, {
        chance: 0.8,
        radio: [
          T(
            '{callsign}: naine kinni peetud, toimetame jaoskonda ülekuulamisele.',
            '{callsign}: the woman is detained, taking her to the station for questioning.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'self_defence',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees toimetati operatsioonile ja jääb ellu. Naine peeti kinni, alustati kriminaalmenetlust, kus hinnatakse hädakaitset (KarS § 28). Naisele anti ohvriabi kontaktid.',
          'The man was taken into surgery and will survive. The woman was detained and criminal proceedings were opened in which self-defence will be assessed (KarS § 28). She was given victim support contacts.',
        ),
        { arrests: 1, injuries: 1, trust: 3 },
      ),
      oc(
        'stable',
        'hospital',
        [0.2, 0.6],
        2,
        T(
          'Mees toimetati raskes seisundis haiglasse. Naine kuulati üle, menetlus jätkub raske tervisekahjustuse tekitamise asjaoludes.',
          'The man was taken to hospital in a serious condition. The woman was questioned and proceedings continue into the circumstances of the serious injury.',
        ),
        { injuries: 1 },
      ),
      oc(
        'died',
        'tragedy',
        [0, 0.2],
        1,
        T(
          'Mees suri haiglas. Naise suhtes alustati kriminaalmenetlust tapmise asjaoludes, hinnatakse hädakaitset.',
          'The man died in hospital. Criminal proceedings were opened against the woman into the killing, and self-defence will be assessed.',
        ),
        { injuries: 1, trust: -4 },
      ),
    ],
    call: {
      mood: 'panic',
      opening: [
        T(
          'Ma lõin oma meest noaga! Ta kägistas mind! Ta veritseb!',
          'I stabbed my husband! He was strangling me! He is bleeding!',
        ),
        T(
          'Ta kägistas mind ja ma haarasin noa... Ta veritseb põrandal!',
          'He was strangling me and I grabbed the knife... He is bleeding on the floor!',
        ),
      ],
      openingRu: [
        'Я ударила мужа ножом! Он меня душил! У него кровь!',
        'Он душил меня, и я схватила нож... Он истекает кровью на полу!',
      ],
      answers: {
        vehicle: [
          T('Ei, me oleme kodus, ta ei lähe kuhugi!', 'No, we are at home, he is not going anywhere!'),
        ],
        count: [T('Meie kahekesi.', 'Just the two of us.')],
        injured: [
          T(
            'Tal on kõhus haav, veri tuleb läbi rätiku. Mu kael valutab.',
            'He has a wound in his stomach, the blood is coming through the towel. My neck hurts.',
          ),
        ],
        weapons: [
          T(
            'Nuga on põrandal. Ma ei puutu seda enam.',
            'The knife is on the floor. I will not touch it again.',
          ),
        ],
        suspect: [
          T('Mina tegin seda. Ta kägistas mind enne.', 'I did it. He was strangling me before that.'),
        ],
        direction: [T('Me oleme mõlemad siin. Ta ei saa liikuda.', 'We are both here. He cannot move.')],
        safe: [
          T(
            'Ma ei tea... ta ei saa praegu midagi teha.',
            'I do not know... he cannot do anything right now.',
          ),
        ],
        intoxicated: [
          T('Tema on purjus. Mina jõin ühe klaasi veini.', 'He is drunk. I had one glass of wine.'),
        ],
        children: [T('Ei, lapsi kodus ei ole.', 'No, there are no children at home.')],
      },
      answersRu: {
        vehicle: ['Нет, мы дома, он никуда не денется!'],
        count: ['Мы вдвоём.'],
        injured: ['У него рана в животе, кровь проходит через полотенце. У меня шея болит.'],
        weapons: ['Нож на полу. Я его больше не трогаю.'],
        suspect: ['Это я сделала. Он перед этим меня душил.'],
        direction: ['Мы оба здесь. Он не может двигаться.'],
        safe: ['Не знаю... сейчас он ничего не может сделать.'],
        intoxicated: ['Он пьяный. Я выпила один бокал вина.'],
        children: ['Нет, детей дома нет.'],
      },
    },
    tags: ['stabbing'],
  },
];

// ── domestic_removal_order_breach ───────────────────────────────────────────
const Q_REMOVAL: Text[] = [
  T(
    'Juhtimiskeskus, {callsign}. Palun kontrolli {name}, isikukood {idcode}. Kas tal on kehtiv viibimiskeeld?',
    'Control, {callsign}. Please check {name}, ID code {idcode}. Is there a valid removal order for him?',
  ),
];

const SC_REMOVAL_BREACH: IncidentScenario[] = [
  {
    id: 'banging_door',
    persons: [
      vic('F', [22, 60]),
      sus('M', [25, 60], 'partner', { record: 0.8, intoxicated: 0.75, restraining: 0.1 }),
    ],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Mees, kellele eile kohaldati viibimiskeeld, tuli koju tagasi ja nõuab sisselaskmist. Naine kardab.',
        '{address}. A man who was given a removal order yesterday has come back home and is demanding to be let in. The woman is afraid.',
      ),
      T(
        '{address}. Viibimiskeelu saanud elukaaslane peksab ust ja karjub, et see on tema korter. Naine on lastega toas.',
        '{address}. A partner under a removal order is banging on the door and shouting that it is his flat. The woman is in a room with the children.',
      ),
    ],
    callerLines: [
      T(
        'Politsei viis ta eile ära, aga nüüd on ta tagasi ja peksab ust!',
        'The police took him away yesterday, but now he is back banging on the door!',
      ),
      T(
        'Ta karjub, et see on tema kodu ja keegi ei saa teda keelata.',
        'He is shouting that it is his home and nobody can stop him.',
      ),
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: mees on ukse taga trepikojas, joobes ja vihane. Võtame ta kontrolli alla.',
          '{callsign}: the man is outside the door in the stairwell, drunk and angry. Taking control of him.',
        ),
      ]),
      qPerson('suspect', 2, { radio: Q_REMOVAL }),
      toArrest(8, { chance: 0.75 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.5, 1],
        3,
        T(
          'Mees peeti trepikojas kinni. Menetlus jätkub, prokuratuurile tehti ettepanek taotleda lähenemiskeeldu.',
          'The man was detained in the stairwell. The case continues and the prosecutor was asked to seek a restraining order.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'removed',
        'report',
        [0.3, 0.6],
        2,
        T(
          'Mees eemaldati majast ja viibimiskeelu rikkumine vormistati. Naisele korraldati turvaline ööbimiskoht.',
          'The man was removed from the building and the breach recorded. The woman was found a safe place to stay.',
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
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mu mehel on viibimiskeeld, aga ta on tagasi ja peksab ust!',
          'My husband has a removal order, but he is back and banging on the door!',
        ),
        T(
          'Politsei viis ta eile ära, aga ta on tagasi ja peksab ust.',
          'The police took him away yesterday, but he is back and banging on the door.',
        ),
      ],
      openingRu: [
        'Мужу запретили находиться дома, а он вернулся и ломится в дверь!',
        'Вчера полиция его увезла, а он вернулся и ломится в дверь.',
      ],
      answers: {
        safe: [
          T(
            'Ma olen lastega magamistoas, uks on lukus.',
            'I am in the bedroom with the children and the door is locked.',
          ),
        ],
        children: [T('Jah, kaks last on minuga.', 'Yes, two children are with me.')],
        intoxicated: [T('Jah, ta on joonud.', 'Yes, he has been drinking.')],
        weapons: [
          T('Ma ei tea, ma ei julge uksest välja vaadata.', 'I do not know, I do not dare look out.'),
        ],
      },
      answersRu: {
        safe: ['Я с детьми в спальне, дверь закрыта.'],
        children: ['Да, двое детей со мной.'],
        intoxicated: ['Да, он выпивши.'],
        weapons: ['Не знаю, я боюсь выглянуть.'],
      },
    },
  },
  {
    id: 'balcony_climb',
    title: T(
      'Viibimiskeelu rikkumine: mees ronis rõdult sisse',
      'Removal order breach: man climbed in from the balcony',
    ),
    persons: [vic('F', [22, 60]), sus('M', [25, 60], 'partner', { record: 0.8, intoxicated: 0.8 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et viibimiskeelu saanud elukaaslane ronis rõdu kaudu korterisse.',
        '{address}. A woman reports that her partner, who is under a removal order, climbed into the flat via the balcony.',
      ),
      T(
        '{address}. Viibimiskeelu all olev mees tuli korterisse rõdu kaudu ja istub nüüd elutoas. Naine on köögis ja helistab vaikselt.',
        '{address}. A man under a removal order got into the flat via the balcony and is now sitting in the living room. The woman is in the kitchen calling quietly.',
      ),
    ],
    callerLines: [
      T(
        'Ta ronis rõdult sisse. Ta ütleb, et see on tema korter ja keegi ei saa teda keelata.',
        'He climbed in from the balcony. He says it is his flat and nobody can stop him.',
      ),
      T(
        'Ma ei tea, kuidas ta üles sai, me elame teisel korrusel.',
        'I do not know how he got up, we live on the first floor.',
      ),
    ],
    details: [
      T(
        'Viibimiskeeld kohaldati eile õhtul KorS § 44 alusel.',
        'The removal order was issued last night under KorS § 44.',
      ),
      T('Mees: {suspect}. Joobes.', 'The man: {suspect}. Intoxicated.'),
    ],
    beats: [qPerson('suspect', 'arrive', { radio: Q_REMOVAL }), toArrest(8, { chance: 0.75 })],
    call: {
      mood: 'whisper',
      opening: [
        T(
          '(vaikselt) Mu mees ronis rõdult sisse, kuigi tal on viibimiskeeld.',
          '(quietly) My husband climbed in from the balcony even though he has a removal order.',
        ),
        T(
          '(vaikselt) Ta ronis rõdult sisse ja istub elutoas. Tal on viibimiskeeld.',
          '(quietly) He climbed in from the balcony and is sitting in the living room. He has a removal order.',
        ),
      ],
      openingRu: [
        '(тихо) Муж залез через балкон, хотя ему запрещено здесь находиться.',
        '(тихо) Он залез через балкон и сидит в комнате. Ему запрещено здесь находиться.',
      ],
      answers: {
        safe: [
          T('Ma olen köögis, tema istub elutoas.', 'I am in the kitchen, he is sitting in the living room.'),
        ],
        direction: [T('Ta on siin, elutoas.', 'He is here, in the living room.')],
        intoxicated: [T('Jah, ta haiseb viina järele.', 'Yes, he reeks of vodka.')],
        children: [T('Ei, lapsed on vanaema juures.', 'No, the children are at their grandmother’s.')],
      },
      answersRu: {
        safe: ['Я на кухне, а он сидит в комнате.'],
        direction: ['Он здесь, в комнате.'],
        intoxicated: ['Да, от него водкой несёт.'],
        children: ['Нет, дети у бабушки.'],
      },
    },
  },
  {
    id: 'came_for_things',
    title: T(
      'Viibimiskeelu rikkumine: tuli "asjadele järele"',
      'Removal order breach: came "just for his things"',
    ),
    persons: [vic('F', [22, 60]), sus('M', [25, 62], 'partner', { record: 0.7, intoxicated: 0.6 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine lasi viibimiskeelu saanud mehe sisse, kuna too tahtis vaid riided võtta. Nüüd keeldub mees lahkumast ja läheb järjest vihasemaks.',
        '{address}. A woman let her partner, who is under a removal order, in because he only wanted to collect his clothes. Now he refuses to leave and is getting angrier.',
      ),
      T(
        '{address}. Viibimiskeelu all olev mees tuli asjadele järele, kuid istus köögis maha ja nõuab naiselt selgitusi. Naine palub ta ära viia.',
        '{address}. A man under a removal order came to collect his things but sat down in the kitchen demanding explanations from the woman. She asks for him to be taken away.',
      ),
    ],
    callerLines: [
      T(
        'Ta ütles, et võtab ainult riided. Nüüd istub ta köögis ega lähe ära.',
        'He said he would only take his clothes. Now he is sitting in the kitchen and will not leave.',
      ),
      T(
        'Ma tean, et ma ei oleks pidanud teda sisse laskma. Palun tulge.',
        'I know I should not have let him in. Please come.',
      ),
    ],
    details: [
      T(
        'Mees: {suspect}. Viibimiskeeld kehtib veel kaks ööpäeva.',
        'The man: {suspect}. The removal order is valid for two more days.',
      ),
      T('Kannatanu lasi mehe ise sisse.', 'The victim let the man in herself.'),
    ],
    beats: [
      qPerson('suspect', 'arrive', { radio: Q_REMOVAL }),
      choice(
        4,
        [
          T(
            '{callsign}: mees on rahulik, kotid on pakitud. Naine lasi ta ise sisse. Kuidas toimime?',
            '{callsign}: the man is calm and his bags are packed. The woman let him in herself. How do we proceed?',
          ),
        ],
        [
          opt(
            'escort',
            T('Saatke ta asjadega välja, vormistage', 'Escort him out with his things, record it'),
            T(
              '{callsign}, juhtimine. Saatke ta asjadega välja ja vormistage rikkumine.',
              '{callsign}, Control. Escort him out with his things and record the breach.',
            ),
            { success: 0.15, time: 12 },
          ),
          opt(
            'detain',
            T('Pidage kinni keelu rikkumise eest', 'Detain him for the breach'),
            T(
              '{callsign}, juhtimine. Keeld kehtib, pidage kinni.',
              '{callsign}, Control. The order stands, detain him.',
            ),
            { success: 0.05, arrests: 1, time: 20 },
          ),
        ],
        'escort',
      ),
    ],
    outcomes: [
      oc(
        'escorted',
        'report',
        [0.45, 1],
        3,
        T(
          'Mees lahkus patrulli saatel koos asjadega. Viibimiskeelu rikkumine vormistati, naisele selgitati, et keeld kehtib ka siis, kui ta mehe ise sisse laseb.',
          'The man left with his things, escorted by the patrol. The breach was recorded and the woman was told the order applies even if she lets him in herself.',
        ),
        { trust: 2 },
      ),
      oc(
        'arrest',
        'arrest',
        [0.25, 0.7],
        2,
        T(
          'Mees hakkas karjuma ja peeti kinni. Alustati menetlust viibimiskeelu rikkumise eest, prokuratuurile tehti ettepanek lähenemiskeelu taotlemiseks.',
          'The man started shouting and was detained. Proceedings were opened for the breach and the prosecutor was asked to seek a restraining order.',
        ),
        { arrests: 1, trust: 1 },
      ),
      oc(
        'pushed',
        'report',
        [0, 0.3],
        2,
        T(
          'Enne patrulli saabumist tõukas mees naist ja lahkus. Alustati kriminaalmenetlust KarS § 121 järgi, mees kuulutati tagaotsitavaks.',
          'Before the patrol arrived the man shoved the woman and left. Criminal proceedings were opened under KarS § 121 and he was put on the wanted list.',
        ),
        { trust: -2 },
      ),
    ],
    escalation: {
      afterMin: 15,
      chance: 0.2,
      toPriority: 1,
      text: T(
        'Teataja: mees hakkas lööma, naine karjub.',
        'Caller: the man has started hitting her, the woman is screaming.',
      ),
    },
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Ma lasin oma mehe sisse, et ta võtaks asjad, aga tal on viibimiskeeld ja nüüd ta ei lahku.',
          'Hello. I let my husband in to collect his things, but he has a removal order and now he will not leave.',
        ),
        T(
          'Ma lasin ta asju võtma, aga nüüd istub ta köögis ja ei lähe ära.',
          'I let him in to get his things, but now he is sitting in the kitchen and will not leave.',
        ),
      ],
      openingRu: [
        'Здравствуйте. Я пустила мужа забрать вещи, но ему запрещено здесь быть, а теперь он не уходит.',
        'Я пустила его забрать вещи, а теперь он сидит на кухне и не уходит.',
      ],
      answers: {
        safe: [T('Ma olen elutoas, tema on köögis.', 'I am in the living room and he is in the kitchen.')],
        weapons: [T('Ei, relva ei ole.', 'No, no weapon.')],
        intoxicated: [T('Natuke on võtnud, aga mitte palju.', 'He has had a little, but not much.')],
        children: [T('Lapsed on oma toas, nad magavad.', 'The children are in their room, asleep.')],
      },
      answersRu: {
        safe: ['Я в комнате, а он на кухне.'],
        weapons: ['Нет, оружия нет.'],
        intoxicated: ['Немного выпил, но не сильно.'],
        children: ['Дети у себя в комнате, спят.'],
      },
    },
  },
  {
    id: 'asleep_on_landing',
    title: T('Viibimiskeelu rikkumine: magab ukse ees', 'Removal order breach: asleep outside the door'),
    persons: [
      vic('F', [22, 60]),
      sus('M', [25, 62], 'partner', { record: 0.7, intoxicated: 0.95 }),
      NEIGHBOUR,
    ],
    summary: [
      T(
        '{address}. Naabri teatel magab viibimiskeelu saanud mees purjus peaga oma korteri ukse ees trepimademel. Naine ei julge välja tulla.',
        '{address}. A neighbour reports a man under a removal order is asleep drunk on the landing outside his flat door. The woman does not dare come out.',
      ),
      T(
        '{address}. Trepimademel lamab joobes mees, kes ei tohiks seal olla. Naabri sõnul viidi ta eile korterist ära.',
        '{address}. A drunk man who is not supposed to be there is lying on the landing. The neighbour says he was taken from the flat yesterday.',
      ),
    ],
    callerLines: [
      T(
        'Ta magab otse oma ukse ees. Naine ei saa isegi tööle minna.',
        'He is asleep right outside their door. The woman cannot even go to work.',
      ),
      T(
        'Eile viis politsei ta minema, täna öösel oli ta tagasi.',
        'The police took him away yesterday, and last night he was back.',
      ),
    ],
    details: [
      T(
        'Mees: {suspect}. Tugevas joobes, magab trepil.',
        'The man: {suspect}. Heavily drunk, asleep on the stairs.',
      ),
      T('Viibimiskeeld kohaldati eile.', 'The removal order was issued yesterday.'),
    ],
    beats: [qPerson('suspect', 'arrive', { radio: Q_REMOVAL }), toSober(8, { chance: 0.8 })],
    outcomes: [
      oc(
        'sober',
        'arrest',
        [0.45, 1],
        3,
        T(
          'Mees toimetati kainenema ja viibimiskeelu rikkumine vormistati. Prokuratuurile tehti ettepanek lähenemiskeelu taotlemiseks.',
          'The man was taken to sober up and the breach recorded. The prosecutor was asked to seek a restraining order.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'removed',
        'report',
        [0.2, 0.6],
        2,
        T(
          'Mees äratati ja saadeti majast välja. Rikkumine vormistati, naisele anti ohvriabi kontaktid.',
          'The man was woken and sent out of the building. The breach was recorded and the woman was given victim support contacts.',
        ),
      ),
      oc(
        'gone',
        'escaped',
        [0, 0.3],
        2,
        T(
          'Mees ärkas ja lahkus enne patrulli saabumist. Ta jäi tabamata, rikkumine vormistati naabri tunnistuse põhjal.',
          'The man woke and left before the patrol arrived. He was not found; the breach was recorded from the neighbour’s statement.',
        ),
        { trust: -2 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Naabrimees magab purjus peaga oma ukse ees, aga talle anti eile viibimiskeeld.',
          'Hello. The man next door is asleep drunk outside his door, but he was given a removal order yesterday.',
        ),
        T(
          'Ta magab purjus peaga oma ukse ees, kuigi talle anti eile viibimiskeeld.',
          'He is asleep drunk outside his own door, even though he was given a removal order yesterday.',
        ),
      ],
      openingRu: [
        'Здравствуйте. Сосед спит пьяный у своей двери, а ему вчера запретили там находиться.',
        'Он пьяный спит у своей двери, хотя вчера ему запретили там находиться.',
      ],
      answers: {
        intoxicated: [T('Täiesti purjus, norskab.', 'Completely drunk, snoring.')],
        weapons: [T('Ei, ta lihtsalt magab.', 'No, he is just sleeping.')],
        children: [
          T(
            'Neil on üks laps, ta on vist ema juures.',
            'They have one child, I think he is with his mother.',
          ),
        ],
        safe: [T('Jah, ma olen oma korteris.', 'Yes, I am in my own flat.')],
      },
      answersRu: {
        intoxicated: ['В стельку пьяный, храпит.'],
        weapons: ['Нет, он просто спит.'],
        children: ['У них один ребёнок, он, кажется, у матери.'],
        safe: ['Да, я у себя в квартире.'],
      },
    },
  },
  {
    id: 'son_let_him_in',
    title: T(
      'Viibimiskeelu rikkumine: poeg lasi isa sisse',
      'Removal order breach: the son let his father in',
    ),
    persons: [vic('F', [30, 55]), sus('M', [32, 60], 'partner', { record: 0.7, intoxicated: 0.6 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine tuli töölt koju ja leidis eest elukaaslase, kellel on viibimiskeeld. Teismeline poeg oli isa sisse lasknud.',
        '{address}. A woman came home from work and found her partner, who is under a removal order, in the flat. Their teenage son had let his father in.',
      ),
      T(
        '{address}. Viibimiskeelu all olev isa istub kodus poja juures. Ema kardab, et mees ei lahku ja tüli algab uuesti.',
        '{address}. A father under a removal order is sitting at home with his son. The mother is afraid he will not leave and the row will start again.',
      ),
    ],
    callerLines: [
      T(
        'Ma tulin koju ja tema istub diivanil. Poeg lasi ta sisse, ta ei saanud aru.',
        'I came home and he is sitting on the sofa. Our son let him in, he did not understand.',
      ),
      T(
        'Ma ei taha, et poeg näeks, kuidas teda jälle ära viiakse, aga ma kardan.',
        'I do not want our son to see him taken away again, but I am afraid.',
      ),
    ],
    details: [
      T(
        'Mees: {suspect}. Viibimiskeeld kohaldati kaks päeva tagasi.',
        'The man: {suspect}. The removal order was issued two days ago.',
      ),
      T('Kodus on 13-aastane poeg.', 'A 13-year-old son is at home.'),
    ],
    agencies: [
      {
        agency: 'sotsiaal',
        chance: 0.6,
        reason: T('Laps on konflikti keskel', 'A child is caught in the conflict'),
      },
    ],
    beats: [
      qPerson('suspect', 'arrive', { radio: Q_REMOVAL }),
      choice(
        4,
        [
          T(
            '{callsign}: mees on kaine ja rahulik, poeg palub isa mitte viia. Kuidas toimime?',
            '{callsign}: the man is sober and calm; the son begs us not to take his father. How do we proceed?',
          ),
        ],
        [
          opt(
            'calm_exit',
            T('Laske tal rahulikult lahkuda, vormistage', 'Let him leave calmly, record it'),
            T(
              '{callsign}, juhtimine. Laske tal lahkuda ja vormistage rikkumine, rääkige poisiga.',
              '{callsign}, Control. Let him leave and record the breach; talk to the boy.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'detain',
            T('Pidage kinni', 'Detain him'),
            T(
              '{callsign}, juhtimine. Pidage kinni, keeld on keeld.',
              '{callsign}, Control. Detain him, an order is an order.',
            ),
            { success: 0.05, arrests: 1, time: 20, trust: -1 },
          ),
        ],
        'calm_exit',
      ),
      agency('sotsiaal', 10, {
        chance: 0.6,
        radio: [
          T(
            '{callsign}: alaealine on vanemate konflikti keskel, palun teavitage lastekaitset.',
            '{callsign}: a minor is caught in his parents’ conflict, please notify child protection.',
          ),
        ],
      }),
    ],
    outcomes: [
      oc(
        'left',
        'report',
        [0.45, 1],
        3,
        T(
          'Isa lahkus rahulikult ja rikkumine vormistati. Pojale selgitati olukorda, perele soovitati lastekaitse kaudu nõustamist.',
          'The father left calmly and the breach was recorded. The situation was explained to the son and the family was advised to seek counselling through child protection.',
        ),
        { trust: 2 },
      ),
      oc(
        'detained',
        'arrest',
        [0.25, 0.65],
        2,
        T(
          'Isa peeti viibimiskeelu rikkumise eest kinni. Poeg jäi emaga koju, juhtum edastati lastekaitsele.',
          'The father was detained for breaching the removal order. The son stayed at home with his mother and the case was passed to child protection.',
        ),
        { arrests: 1 },
      ),
      oc(
        'row',
        'report',
        [0, 0.3],
        2,
        T(
          'Enne patrulli saabumist läks vanemate vahel tüliks ja mees lükkas naise pikali. Alustati kriminaalmenetlust KarS § 121 järgi.',
          'Before the patrol arrived the parents started arguing and the man knocked the woman down. Criminal proceedings were opened under KarS § 121.',
        ),
        { trust: -2 },
      ),
    ],
    call: {
      mood: 'calm',
      opening: [
        T(
          'Tere. Mu elukaaslasel on viibimiskeeld, aga poeg lasi ta sisse. Ta istub praegu kodus.',
          'Hello. My partner has a removal order, but our son let him in. He is sitting at home now.',
        ),
        T(
          'Poeg lasi isa sisse, kuigi tal on viibimiskeeld. Ta istub praegu diivanil.',
          'Our son let his father in although he has a removal order. He is sitting on the sofa now.',
        ),
      ],
      openingRu: [
        'Здравствуйте. Мужу запретили находиться дома, но сын его впустил. Он сейчас сидит дома.',
        'Сын впустил отца, хотя ему запрещено здесь быть. Он сейчас сидит на диване.',
      ],
      answers: {
        children: [
          T('Jah, meie poeg on kodus, ta on kolmeteistkümnene.', 'Yes, our son is at home, he is thirteen.'),
        ],
        intoxicated: [T('Ei, täna tundub kaine olevat.', 'No, today he seems to be sober.')],
        weapons: [T('Ei, relva ei ole.', 'No, no weapon.')],
        safe: [
          T('Ma olen trepikojas, ma ei läinud veel sisse.', 'I am in the stairwell, I have not gone in yet.'),
        ],
      },
      answersRu: {
        children: ['Да, сын дома, ему тринадцать.'],
        intoxicated: ['Нет, сегодня вроде трезвый.'],
        weapons: ['Нет, оружия нет.'],
        safe: ['Я в подъезде, ещё не заходила.'],
      },
    },
    tags: ['children'],
  },
];

// ── domestic_midsummer_summerhouse ──────────────────────────────────────────
const SC_MIDSUMMER: IncidentScenario[] = [
  {
    id: 'guests_in_sauna',
    persons: [
      vic('F', [22, 60], { intoxicated: 0.5 }),
      sus('M', [25, 60], 'partner', { intoxicated: 0.95, record: 0.4 }),
      { role: 'witness', gender: 'any', age: [20, 70], relation: 'friend', intoxicated: 0.7 },
    ],
    summary: [
      T(
        '{address}. Jaanipeol läks purjus mees naisega tülli, lõi teda ja lõhub nüüd mööblit. Külalised lukustasid end sauna.',
        '{address}. At a Midsummer party a drunk man started a row with his wife, hit her and is now smashing furniture. The guests have locked themselves in the sauna.',
      ),
      T(
        '{address}. Jaanipeo külalised peidavad end saunas: peremees jõi end täis, lõi naist ja loobib õues toole.',
        '{address}. Midsummer party guests are hiding in the sauna: the host got drunk, hit his wife and is throwing chairs around outside.',
      ),
    ],
    callerLines: [
      T(
        '(taustal muusika) Halloo, politsei? Siin jaanipeol läks jamaks, peremees lõi oma naist!',
        '(music in the background) Hello, police? Things went bad at the Midsummer party, the host hit his wife!',
      ),
      T(
        'Me oleme saunas peidus, ta loobib õues toole ja karjub.',
        'We are hiding in the sauna, he is throwing chairs around outside and shouting.',
      ),
    ],
    callerLinesRu: [
      '(на фоне музыка) Алло, полиция? Тут на Янов день всё пошло наперекосяк, хозяин ударил жену!',
      'Мы спрятались в бане, а он на улице швыряет стулья и орёт.',
    ],
  },
  {
    id: 'bonfire_relatives',
    title: T('Jaanitule kaklus sugulaste vahel', 'Fight between relatives at a Midsummer bonfire'),
    persons: [
      vic('M', [25, 65], { intoxicated: 0.7 }),
      sus('M', [25, 65], 'family', { intoxicated: 0.95, record: 0.4 }),
      { role: 'caller', gender: 'F', age: [25, 70], relation: 'family' },
    ],
    summary: [
      T(
        '{address}. Jaanitule ääres tekkis sugulaste vahel kaklus, purjus mees ähvardab teisi. Kohal on lapsi.',
        '{address}. A fight broke out between relatives at the Midsummer bonfire; a drunk man is threatening the others. Children present.',
      ),
      T(
        '{address}. Vennad läksid jaanitule ääres vana pärandustüli pärast kaklema, ühel on nägu verine. Teised külalised ei saa neid lahutada.',
        '{address}. Two brothers started fighting by the Midsummer bonfire over an old inheritance dispute; one has a bloody face. The other guests cannot separate them.',
      ),
    ],
    callerLines: [
      T(
        'Mu vennad kaklevad lõkke ääres! Vanem lõi nooremat, nägu on verine!',
        'My brothers are fighting by the bonfire! The older one hit the younger one, his face is all bloody!',
      ),
      T(
        'See vana talu jagamise jutt jälle. Igal jaanipäeval sama, aga täna läks käest ära.',
        'That old farm inheritance story again. Every Midsummer the same, but tonight it got out of hand.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}. Väga purjus.', 'Suspect: {suspect}. Very drunk.'),
      T(
        'Peol on üle kümne inimese, sealhulgas lapsi.',
        'More than ten people are at the party, including children.',
      ),
    ],
    agencies: [
      { agency: 'kiirabi', chance: 0.4, reason: T('Kannatanul näovigastus', 'Victim has a facial injury') },
    ],
    beats: [
      backup(0.25, un('patrol'), {
        at: 'arrive',
        radio: [
          T(
            '{callsign}: palju joobes inimesi, mitu kaklejat. Vajame lisapatrulli!',
            '{callsign}: lots of drunk people, several fighting. We need another patrol!',
          ),
        ],
      }),
      qPerson('suspect', 4),
      toArrest(15, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Ründaja peeti kinni ja toimetati arestimajja. Alustati kriminaalmenetlust KarS § 121 järgi, pidu lõpetati.',
          'The attacker was detained and taken to the arrest house. Criminal proceedings were opened under KarS § 121 and the party was ended.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'sober',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Mõlemad vennad toimetati kainenema, kannatanult võeti avaldus. Ülejäänud külalised viis koju kaine juht.',
          'Both brothers were taken to sober up and the injured one gave a statement. A sober driver took the other guests home.',
        ),
      ),
      oc(
        'forest',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Ründaja jooksis enne patrulli saabumist metsa. Kannatanu toimetati EMO-sse, ründaja kuulutati tagaotsitavaks.',
          'The attacker ran into the forest before the patrol arrived. The injured man was taken to A&E and the attacker is wanted.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    call: {
      mood: 'drunk',
      opening: [
        T(
          'Halloo... politsei? Mu vennad kaklevad jaanitule ääres, üks on verine!',
          'Hello... police? My brothers are fighting by the Midsummer bonfire, one of them is bleeding!',
        ),
        T(
          'Vennad läksid vana talu pärast kaklema, üks on verine.',
          'The brothers started fighting over the old farm, one of them is bleeding.',
        ),
      ],
      openingRu: [
        'Алло... полиция? Мои братья дерутся у костра, у одного всё лицо в крови!',
        'Братья подрались из-за старого хутора, у одного кровь.',
      ],
      answers: {
        where: [
          T(
            'Siin maja juures... aadress on vist {address}. Lõke on aia taga.',
            'Here at the house... the address is {address} I think. The bonfire is behind the garden.',
          ),
        ],
        injured: [
          T(
            'Noorema venna nina on katki, veri tuleb.',
            'The younger brother’s nose is broken, it is bleeding.',
          ),
        ],
        children: [
          T('Lapsed on majas, aga nad nägid kõike.', 'The kids are in the house, but they saw everything.'),
        ],
        count: [
          T('Meid on siin kümmekond, kaklevad kaks.', 'There are about ten of us here, two are fighting.'),
        ],
        intoxicated: [
          T(
            'Noh... kõik on natuke võtnud. Vanem vend väga palju.',
            'Well... everyone has had a bit. The older brother a lot.',
          ),
        ],
      },
      answersRu: {
        where: ['Тут у дома... адрес вроде {address}. Костёр за огородом.'],
        injured: ['У младшего брата нос разбит, кровь идёт.'],
        children: ['Дети в доме, но они всё видели.'],
        count: ['Нас тут человек десять, дерутся двое.'],
        intoxicated: ['Ну... все немножко выпили. Старший брат очень много.'],
      },
    },
    tags: ['group'],
  },
  {
    id: 'jealous_dance',
    title: T('Jaanipeo armukadedustüli', 'Midsummer jealousy row'),
    persons: [
      vic('M', [25, 60], { intoxicated: 0.6 }),
      sus('M', [25, 60], 'stranger', { intoxicated: 0.95, record: 0.35 }),
      { role: 'caller', gender: 'F', age: [22, 58], relation: 'friend' },
    ],
    summary: [
      T(
        '{address}. Jaanipeol lõi armukade mees naabrit, kes tantsis tema naisega. Kannatanu nina veritseb, ründaja karjub ja ähvardab.',
        '{address}. At a Midsummer party a jealous man hit a neighbour who had danced with his wife. The victim’s nose is bleeding and the attacker is shouting threats.',
      ),
      T(
        '{address}. Peol läks tantsimise pärast kakluseks: purjus mees lõi teist meest pudeliga. Naine helistab ja palub abi.',
        '{address}. A dance at a party turned into a fight: a drunk man hit another man with a bottle. A woman is calling for help.',
      ),
    ],
    callerLines: [
      T(
        'Mu mees läks hulluks, sest ma tantsisin naabriga. Ta lõi teda!',
        'My husband went mad because I danced with the neighbour. He hit him!',
      ),
      T(
        'Ta karjub, et tapab ta ära. Teised hoiavad teda.',
        'He is shouting that he will kill him. The others are holding him back.',
      ),
    ],
    details: [
      T('Kahtlustatav: {suspect}. Väga purjus, armukade.', 'Suspect: {suspect}. Very drunk and jealous.'),
      T('Kannatanu on naaber, nina veritseb.', 'The victim is a neighbour with a bleeding nose.'),
    ],
    agencies: [
      { agency: 'kiirabi', chance: 0.5, reason: T('Kannatanul näovigastus', 'Victim has a facial injury') },
    ],
    beats: [
      info('arrive', [
        T(
          '{callsign}: kohal. Ründajat hoiavad sõbrad kinni, kannatanu istub trepil.',
          '{callsign}: on scene. Friends are holding the attacker back; the victim is sitting on the steps.',
        ),
      ]),
      qPerson('suspect', 3),
      kiirabi(4, {
        chance: 0.5,
        radio: [
          T(
            '{callsign}: kannatanu nina on murtud, palun kiirabi.',
            '{callsign}: the victim’s nose is broken, request an ambulance.',
          ),
        ],
      }),
      toArrest(15, { chance: 0.65 }),
    ],
    outcomes: [
      oc(
        'arrest',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Armukade mees peeti kinni. Alustati kriminaalmenetlust KarS § 121 järgi, peo külalised andsid tunnistusi.',
          'The jealous man was detained. Criminal proceedings were opened under KarS § 121 and the guests gave statements.',
        ),
        { arrests: 1, trust: 2 },
      ),
      oc(
        'sober',
        'report',
        [0.3, 0.65],
        2,
        T(
          'Mees toimetati kainenema ja kannatanult võeti avaldus. Menetlus jätkub.',
          'The man was taken to sober up and the victim gave a statement. The case continues.',
        ),
      ),
      oc(
        'ran',
        'escaped',
        [0, 0.35],
        2,
        T(
          'Mees rebis end lahti ja kadus metsa. Kannatanu toimetati EMO-sse.',
          'The man tore himself free and disappeared into the forest. The victim was taken to A&E.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mu mees lõi naabrit, sest ma tantsisin temaga! Tulge kiiresti!',
          'My husband hit the neighbour because I danced with him! Come quickly!',
        ),
        T(
          'Ta läks armukadedaks ja lõi naabrit, kellega ma tantsisin.',
          'He got jealous and hit the neighbour I was dancing with.',
        ),
      ],
      openingRu: [
        'Мой муж ударил соседа, потому что я с ним танцевала! Приезжайте быстрее!',
        'Он приревновал и ударил соседа, с которым я танцевала.',
      ],
      answers: {
        suspect: [
          T(
            'See on mu mees. Teised hoiavad teda praegu kinni.',
            'It is my husband. The others are holding him back right now.',
          ),
        ],
        injured: [
          T(
            'Naabri nina veritseb, ta istub trepil.',
            'The neighbour’s nose is bleeding, he is sitting on the steps.',
          ),
        ],
        weapons: [T('Ma ei näinud relva, ta lõi rusikaga.', 'I did not see a weapon, he punched him.')],
        children: [T('Lapsed magavad majas.', 'The kids are asleep in the house.')],
        intoxicated: [T('Ta on väga purjus, ta jõi terve päeva.', 'He is very drunk, he drank all day.')],
      },
      answersRu: {
        suspect: ['Это мой муж. Остальные его сейчас держат.'],
        injured: ['У соседа кровь из носа, он сидит на крыльце.'],
        weapons: ['Оружия я не видела, он ударил кулаком.'],
        children: ['Дети спят в доме.'],
        intoxicated: ['Он очень пьяный, весь день пил.'],
      },
    },
  },
  {
    id: 'drove_off_drunk',
    title: T('Jaanipäeva tüli: mees sõitis purjus peaga minema', 'Midsummer row: man drove off drunk'),
    persons: [
      vic('F', [22, 60]),
      sus('M', [25, 60], 'partner', { intoxicated: 0.95, record: 0.4, noLicense: 0.25 }),
    ],
    vehicles: [{ role: 'suspect', kind: 'car', driverRole: 'suspect' }],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et jaanipeol lõi elukaaslane teda ja sõitis siis purjus peaga autoga metsateed mööda minema.',
        '{address}. A woman reports her partner hit her at the Midsummer party and then drove off drunk down the forest road.',
      ),
      T(
        '{address}. Purjus mees lõi suvila juures naist ja lahkus autoga. Sõiduk: {car}, reg nr {plate}. Naine kardab, et mees sõidab kellelegi otsa.',
        '{address}. A drunk man hit a woman at a summer house and left by car. Vehicle: {car}, plate {plate}. She is afraid he will run someone over.',
      ),
    ],
    callerLines: [
      T(
        'Ta lõi mind ja hüppas autosse. Ta on täiesti purjus, ta sõidab kellelegi otsa!',
        'He hit me and jumped into the car. He is completely drunk, he will run someone over!',
      ),
      T(
        'Ta sõitis metsatee poole, maantee suunas. Ilma tuledeta.',
        'He drove towards the forest track, heading for the main road. Without lights.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Lahkus autoga {direction}.',
        'Suspect: {suspect}. Left by car {direction}.',
      ),
      T('Sõiduk: {car}, reg nr {plate}.', 'Vehicle: {car}, plate {plate}.'),
    ],
    agencies: [],
    beats: [
      info('arrive', [
        T(
          '{callsign}: naine on suvilas, põsk paistes. Mees lahkus autoga, saime numbri.',
          '{callsign}: the woman is at the summer house with a swollen cheek. The man left by car, we have the plate.',
        ),
      ]),
      qVehicle(3),
      choice(
        5,
        [
          T(
            '{callsign}: joobes juht on maanteel, sõiduk on teada. Kas saadame teise patrulli maanteele vastu või jääme kannatanu juurde?',
            '{callsign}: a drunk driver is on the main road and we know the car. Do we send another patrol to intercept or stay with the victim?',
          ),
        ],
        [
          opt(
            'intercept',
            T('Saatke patrull vastu', 'Send a patrol to intercept'),
            T(
              '{callsign}, juhtimine. Teavitame lähimaid ekipaaže, sõiduk on otsitav.',
              '{callsign}, Control. Alerting the nearest units, the car is on a lookout.',
            ),
            { success: 0.15, time: 15 },
          ),
          opt(
            'stay',
            T('Jääge kannatanu juurde', 'Stay with the victim'),
            T(
              '{callsign}, juhtimine. Jääge, võtke seletus.',
              '{callsign}, Control. Stay and take a statement.',
            ),
            { success: -0.05 },
          ),
        ],
        'intercept',
      ),
    ],
    outcomes: [
      oc(
        'stopped',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees peeti maanteel kinni, joove tuvastati. Alustati menetlust kehalise väärkohtlemise ja joobes juhtimise eest (KarS § 121 ja § 424).',
          'The man was stopped on the main road and found to be drunk. Proceedings were opened for assault and drink-driving (KarS § 121 and § 424).',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'ditch',
        'report',
        [0.25, 0.6],
        2,
        T(
          'Auto leiti kraavist kilomeetri kauguselt, mees magas roolis. Ta toimetati kainenema, menetlus alustati.',
          'The car was found in a ditch a kilometre away with the man asleep at the wheel. He was taken to sober up and proceedings were opened.',
        ),
        { arrests: 1 },
      ),
      oc(
        'gone',
        'escaped',
        [0, 0.3],
        2,
        T(
          'Meest ega autot ei leitud. Sõiduk kuulutati otsitavaks, naine jäi naabrite juurde.',
          'Neither the man nor the car was found. The car was put on a lookout and the woman stayed with neighbours.',
        ),
        { trust: -2 },
      ),
    ],
    call: {
      mood: 'panic',
      opening: [
        T('Mu mees lõi mind ja sõitis purjus peaga autoga minema!', 'My husband hit me and drove off drunk!'),
        T(
          'Ta lõi mind ja hüppas autosse. Ta on täiesti purjus!',
          'He hit me and jumped into the car. He is completely drunk!',
        ),
      ],
      openingRu: [
        'Муж ударил меня и уехал пьяный на машине!',
        'Он ударил меня и прыгнул в машину. Он совсем пьяный!',
      ],
      answers: {
        vehicle: [T('{car}, number {plate}.', '{car}, plate {plate}.')],
        direction: [
          T(
            'Ta sõitis metsateed mööda maantee poole.',
            'He drove down the forest track towards the main road.',
          ),
        ],
        injured: [T('Põsk on paistes, aga ma saan hakkama.', 'My cheek is swollen, but I will manage.')],
        intoxicated: [T('Täiesti purjus, ta jõi terve päeva.', 'Completely drunk, he drank all day.')],
        children: [
          T('Ei, lapsed on linnas vanaema juures.', 'No, the children are in town at their grandmother’s.'),
        ],
      },
      answersRu: {
        vehicle: ['{car}, номер {plate}.'],
        direction: ['Он поехал по лесной дороге в сторону трассы.'],
        injured: ['Щека опухла, но я справлюсь.'],
        intoxicated: ['В стельку пьяный, весь день пил.'],
        children: ['Нет, дети в городе у бабушки.'],
      },
    },
    tags: ['vehicle_flee'],
  },
  {
    id: 'lake_boat',
    title: T('Jaanipäeva tüli: mees läks paadiga järvele', 'Midsummer row: man took a boat out on the lake'),
    persons: [vic('F', [22, 60]), sus('M', [25, 60], 'partner', { intoxicated: 0.95, record: 0.3 })],
    callerRole: 'victim',
    summary: [
      T(
        '{address}. Naine teatab, et elukaaslane lõi teda tülis, võttis siis purjus peaga paadi ja sõudis järvele. Mees karjub, et uputab end ära.',
        '{address}. A woman reports her partner hit her during a row, then took the boat out on the lake drunk. He is shouting that he will drown himself.',
      ),
      T(
        '{address}. Jaanipeol lõi purjus mees naist ja läks paadiga järvele. Päästevestita, paat on kaldast juba kaugel.',
        '{address}. At a Midsummer party a drunk man hit his wife and went out on the lake in a boat. No life jacket, and the boat is already far from the shore.',
      ),
    ],
    callerLines: [
      T(
        'Ta lõi mind ja läks paadiga järvele. Ta karjub, et uputab end ära!',
        'He hit me and took the boat out on the lake. He is shouting that he will drown himself!',
      ),
      T(
        'Tal ei ole päästevesti ja ta ei oska hästi ujuda.',
        'He has no life jacket and he cannot swim well.',
      ),
    ],
    details: [
      T(
        'Kahtlustatav: {suspect}. Paadis järvel, tugevas joobes.',
        'Suspect: {suspect}. In a boat on the lake, heavily drunk.',
      ),
      T('Kannatanul on huul katki.', 'The victim has a split lip.'),
    ],
    agencies: [
      {
        agency: 'paaste',
        chance: 0.8,
        reason: T('Joobes inimene paadis järvel', 'Drunk person in a boat on the lake'),
      },
    ],
    beats: [
      agency('paaste', 'arrive', {
        radio: [
          T(
            '{callsign}: joobes mees paadiga järvel, ähvardab end uputada. Palun päästjad veele.',
            '{callsign}: drunk man in a boat on the lake threatening to drown himself. Request rescue on the water.',
          ),
        ],
      }),
      info(
        6,
        [
          T(
            '{callsign}: räägime mehega kaldalt, ta sõuab aeglaselt tagasi.',
            '{callsign}: talking to the man from the shore, he is slowly rowing back.',
          ),
        ],
        0.6,
      ),
      toArrest(18, { chance: 0.6 }),
    ],
    outcomes: [
      oc(
        'back',
        'arrest',
        [0.55, 1],
        3,
        T(
          'Mees sõudis kaldale ja peeti kinni. Alustati kriminaalmenetlust KarS § 121 järgi, naine sai ohvriabi kontaktid.',
          'The man rowed back to the shore and was detained. Criminal proceedings were opened under KarS § 121 and the woman got victim support contacts.',
        ),
        { arrests: 1, trust: 3 },
      ),
      oc(
        'rescued',
        'report',
        [0.25, 0.6],
        2,
        T(
          'Päästjad tõid mehe paadist kaldale, ta toimetati kainenema. Kehalise väärkohtlemise eest alustati menetlust.',
          'Rescuers brought the man ashore from the boat and he was taken to sober up. Proceedings were opened for the assault.',
        ),
      ),
      oc(
        'fell_in',
        'hospital',
        [0, 0.3],
        2,
        T(
          'Mees kukkus paadist vette, päästjad tõid ta välja alajahtununa. Ta toimetati haiglasse.',
          'The man fell out of the boat; rescuers pulled him out hypothermic. He was taken to hospital.',
        ),
        { injuries: 1, trust: -2 },
      ),
    ],
    call: {
      mood: 'panic',
      opening: [
        T(
          'Mu mees lõi mind ja läks paadiga järvele! Ta tahab end ära uputada!',
          'My husband hit me and took the boat out on the lake! He wants to drown himself!',
        ),
        T(
          'Ta lõi mind ja sõudis paadiga järvele, karjub, et uputab end.',
          'He hit me and rowed out onto the lake, shouting that he will drown himself.',
        ),
      ],
      openingRu: [
        'Муж ударил меня и уплыл на лодке на озеро! Говорит, что утопится!',
        'Он ударил меня и уплыл на лодке на озеро, кричит, что утопится.',
      ],
      answers: {
        where: [
          T(
            'Suvila järve ääres, {address}. Ta on keset järve.',
            'The summer house by the lake, {address}. He is in the middle of the lake.',
          ),
        ],
        direction: [
          T(
            'Ta on paadiga järvel, umbes saja meetri kaugusel.',
            'He is out on the lake in the boat, about a hundred metres away.',
          ),
        ],
        injured: [
          T('Huul on katki, aga see pole praegu tähtis!', 'My lip is split, but that does not matter now!'),
        ],
        intoxicated: [T('Ta on täiesti purjus.', 'He is completely drunk.')],
        children: [T('Ei, oleme kahekesi.', 'No, it is just the two of us.')],
      },
      answersRu: {
        where: ['Дача у озера, {address}. Он посреди озера.'],
        direction: ['Он в лодке на озере, метрах в ста отсюда.'],
        injured: ['Губа разбита, но это сейчас неважно!'],
        intoxicated: ['Он в стельку пьяный.'],
        children: ['Нет, мы вдвоём.'],
      },
    },
  },
];

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
    callerLinesRu: [
      'В квартире слышны крики и сильный грохот, мне кажется, муж бьёт жену.',
      'Опять эти соседи... но сегодня по-другому, она зовёт на помощь, и что-то сильно упало.',
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
          'The abuser was detained and taken to the arrest house. Criminal proceedings opened under KarS § 121; the victim was advised about victim support.',
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
      answersRu: {
        where: ['{address}, квартира рядом с моей.'],
        weapons: ['Не знаю, мне не видно, что там внутри.'],
        children: ['У них двое маленьких детей, я слышу, как они плачут.'],
        intoxicated: ['Он часто пьёт, сегодня точно тоже.'],
        when: ['Началось минут десять назад, и становится всё хуже.'],
      },
    },
    tags: ['dv', 'alcohol'],
    legacy: true,
    scenarios: SC_DOMESTIC_VIOLENCE,
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
    callerLinesRu: [
      'Я {слышал|слышала} крики, а потом всё стихло... дверь была открыта, а она лежит на полу.',
      'Он убежал вниз по лестнице, у него руки были в крови!',
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
    callerLinesRu: [
      'Это скорая. Травмы ребёнка не сходятся с тем, что говорят родители, пожалуйста, пришлите полицию.',
      'Отец говорит, что ребёнок упал с лестницы, но эти следы старые и в нескольких местах.',
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
    callerLinesRu: [
      '(шёпотом) Он меня ударил... я в ванной, он ломится в дверь.',
      'Муж пьяный, совсем с катушек слетел. Приезжайте, пожалуйста, я боюсь, что он и детям что-нибудь сделает.',
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
          'The man was detained and taken to the arrest house. Criminal proceedings opened under KarS § 121 and a risk assessment questionnaire was completed.',
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
        'ERC: the call dropped; the last thing heard was the door being broken.',
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
      openingRu: ['(шёпотом) Он меня ударил... я {закрылся|закрылась} в ванной, он ломает дверь.'],
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
      answersRu: {
        injured: ['Из носа кровь идёт, глаз опух.'],
        weapons: ['Не знаю... на кухне ножи.'],
        children: ['Дети спят в своей комнате, им четыре и семь лет.'],
        safe: ['Дверь заперта, но он в неё колотит.'],
        intoxicated: ['Он весь вечер пил.'],
      },
    },
    tags: ['dv', 'alcohol'],
    scenarios: SC_PARTNER_ASSAULT,
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
    callerLinesRu: [
      'Они уже час орут друг на друга. Не знаю, может, там что-то происходит.',
      'Они каждую неделю ругаются, но сегодня особенно громко.',
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
      answersRu: {
        what: ['Только крики, ударов я не слышу.'],
        children: ['У них сын-подросток.'],
        intoxicated: ['Наверное, выпили, как обычно по пятницам.'],
      },
    },
    tags: ['dv'],
    scenarios: SC_VERBAL_DISPUTE,
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
    callerLinesRu: [
      'Ему запрещено ко мне подходить, а он опять здесь! Колотит в дверь и кричит.',
      'Я его из окна {видел|видела}, он ждёт меня у подъезда.',
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
      openingRu: ['Мой бывший опять за дверью, а ему запрещено ко мне подходить!'],
      answers: {
        suspect: [
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
      answersRu: {
        suspect: ['Это мой бывший сожитель, суд весной запретил ему подходить.'],
        weapons: ['Не знаю, раньше у него был нож.'],
        safe: ['Дверь закрыта, на цепочке. Я в спальне.'],
      },
    },
    tags: ['dv', 'restraining'],
    scenarios: SC_RESTRAINING_BREACH,
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
    callerLinesRu: [
      'Сын опять пьяный... толкнул меня, я {упал|упала}, когда денег не {дал|дала}.',
      'Я не хочу, чтобы его посадили, но я его боюсь.',
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
      answersRu: {
        injured: ['Рука болит, но я справлюсь.'],
        suspect: ['Это мой сын, он живёт со мной.'],
        intoxicated: ['Пьяный, как каждый день.'],
        safe: ['Я на кухне, а он в комнате и кричит.'],
      },
    },
    tags: ['dv', 'elderly', 'alcohol'],
    scenarios: SC_SON_VS_PARENT,
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
    callerLinesRu: [
      '(плачет) Папа бьёт маму... приезжайте, пожалуйста.',
      'Я {спрятался|спряталась} в шкаф. Папа кричит, и что-то разбилось.',
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
      openingRu: ['(плачет) Алло... папа бьёт маму.'],
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
      answersRu: {
        where: ['Я точно не знаю... мы живём в большом доме, на четвёртом этаже.'],
        name: ['Меня зовут Мия, мне восемь.'],
        safe: ['Я у себя в комнате, в шкафу.'],
        children: ['Моя маленькая сестрёнка спит.'],
        intoxicated: ['Папа много пива выпил.'],
        weapons: ['Я не {видел|видела}... он тарелку бросил.'],
      },
    },
    tags: ['dv', 'children'],
    scenarios: SC_CHILD_CALLER,
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
    callerLinesRu: [
      'У него нож! Он меня порезал, пожалуйста, быстрее!',
      'Женщина сидит на лестнице, рука в крови. Муж орёт в квартире, что и себя убьёт.',
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
      answersRu: {
        injured: ['Рука в крови, я держу полотенце.'],
        weapons: ['Большой кухонный нож. А в шкафу у него ружьё.'],
        safe: ['Я {выбежал|выбежала} в подъезд, он в квартире.'],
        intoxicated: ['Он в стельку пьяный.'],
      },
    },
    tags: ['dv', 'armed', 'weapon_knife'],
    scenarios: SC_KNIFE,
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
    callerLinesRu: [
      'Мы расстались полгода назад, но он не оставляет меня в покое. Сегодня опять ждал меня у работы.',
      'Я {сохранил|сохранила} все сообщения. Их сотни.',
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
    scenarios: SC_EX_STALKING,
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
    callerLinesRu: [
      'Полиция вчера его увезла, а теперь он вернулся и ломится в дверь!',
      'Он залез через балкон. Говорит, что это его квартира и никто ему не запретит.',
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
    scenarios: SC_REMOVAL_BREACH,
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
    callerLinesRu: [
      'Дети плачут уже три часа. Вечером я {видел|видела}, как мать шла из магазина с водкой.',
      'Отец спит в подъезде, дверь нараспашку, а маленький мальчик один сидит в прихожей.',
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
    scenarios: SC_DRUNK_PARENT,
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
        '(taustal muusika) Halloo, politsei? Siin jaanipeol läks jamaks, peremees lõi oma naist!',
        '(music in the background) Hello, police? Things went bad at the Midsummer party, the host hit his wife!',
      ),
      T(
        'Me oleme saunas peidus, ta loobib õues toole ja karjub.',
        'We are hiding in the sauna, he is throwing chairs around outside and shouting.',
      ),
    ],
    callerLinesRu: [
      '(на фоне музыка) Алло, полиция? Тут на Янов день всё пошло наперекосяк, хозяин ударил жену!',
      'Мы спрятались в бане, а он на улице швыряет стулья и орёт.',
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
          'The man was detained and taken to the arrest house. Criminal proceedings opened under KarS § 121.',
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
      openingRu: ['Алло... полиция? Тут на Янов день бардак, один мужик совсем с катушек слетел.'],
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
      answersRu: {
        where: ['Дача... адреса не знаю, в лесу, у озера.'],
        injured: ['У женщины голова разбита, кровь идёт.'],
        children: ['Дети в доме, спят.'],
        intoxicated: ['Ну... все немножко выпили. А он очень много.'],
      },
    },
    tags: ['dv', 'alcohol', 'holiday'],
    scenarios: SC_MIDSUMMER,
  },
];
