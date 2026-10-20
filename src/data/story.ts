/**
 * The career told in chapters (docs/STORY.md): the recurring cast, the five chapters with their milestones,
 * objectives, intro and outro, the small questions the characters ask and the newspaper's pieces. Content only;
 * the rules are in src/sim/story.ts. To add a chapter, append one to STORY_CHAPTERS (ids stay stable: saves
 * keep objective and choice ids).
 *
 * Placeholders, filled by src/sim/story.ts (names always stand in the nominative):
 *   {name} the player's first name, {fullName} the whole name, {rank} the player's rank (lower case in Estonian),
 *   {sector} the first sector of the home prefecture, {region} the home prefecture ("Lõuna prefektuur"),
 *   {regionGen} its genitive ("Lõuna prefektuuri"),
 *   {city} the city of its juhtimiskeskus ({cityGen} in the genitive: "Tallinna"), {mentor} the shift supervisor, {prefect} the home prefect,
 *   {colleague} the AI colleague at the featured neighbouring desk, {colleagueSector} that desk's sector,
 *   {journalist} the reporter, {paper} the reporter's newspaper, {union} the union representative.
 */
import type { Gender, RegionId, ShiftReport, Text } from '@/sim/types';

const T = (et: string, en: string): Text => ({ et, en });

// ─────────────────────────────────────────────────────────────────────────────
// Cast
// ─────────────────────────────────────────────────────────────────────────────

/** Who speaks: the prefect is the prefecture's commander (src/data/regions), the colleague a sector's desk. */
export type StoryCastId = 'mentor' | 'prefect' | 'colleague' | 'union' | 'journalist';

export interface StoryPerson {
  name: string;
  /** Job and rank as a line under the name ("vahetuse vanem, vanemkomissar"). */
  role: Text;
  gender: Gender;
}

/** The shift supervisor (vahetuse vanem) of each prefecture's juhtimiskeskus: the player's mentor. Fictional. */
export const MENTORS: Record<RegionId, StoryPerson> = {
  pohja: {
    name: 'Aivar Kuusemets',
    role: T('vahetuse vanem, vanemkomissar', 'shift supervisor, senior commissioner'),
    gender: 'M',
  },
  ida: {
    name: 'Svetlana Ignatjeva',
    role: T('vahetuse vanem, vanemkomissar', 'shift supervisor, senior commissioner'),
    gender: 'F',
  },
  louna: {
    name: 'Mati Tõnisson',
    role: T('vahetuse vanem, vanemkomissar', 'shift supervisor, senior commissioner'),
    gender: 'M',
  },
  laane: {
    name: 'Piret Laansoo',
    role: T('vahetuse vanem, vanemkomissar', 'shift supervisor, senior commissioner'),
    gender: 'F',
  },
};

/** The reporter of each prefecture's newspaper (MASTHEADS in src/sim/report.ts). Fictional. */
export const JOURNALISTS: Record<RegionId, StoryPerson & { paper: string }> = {
  pohja: {
    name: 'Joonas Vaarik',
    paper: 'Pealinna Kuulutaja',
    role: T('reporter, Pealinna Kuulutaja', 'reporter, Pealinna Kuulutaja'),
    gender: 'M',
  },
  ida: {
    name: 'Olga Kalinina',
    paper: 'Viru Valvur',
    role: T('reporter, Viru Valvur', 'reporter, Viru Valvur'),
    gender: 'F',
  },
  louna: {
    name: 'Karl-Erik Mõttus',
    paper: 'Lõuna Postipoiss',
    role: T('reporter, Lõuna Postipoiss', 'reporter, Lõuna Postipoiss'),
    gender: 'M',
  },
  laane: {
    name: 'Liis Rannamäe',
    paper: 'Lääne Lainetus',
    role: T('reporter, Lääne Lainetus', 'reporter, Lääne Lainetus'),
    gender: 'F',
  },
};

/** The staff's union representative (usaldusisik) at the juhtimiskeskus. Fictional. */
export const UNION_REP: StoryPerson = {
  name: 'Helle Rand',
  role: T('ametiühingu usaldusisik', 'union representative'),
  gender: 'F',
};

// ─────────────────────────────────────────────────────────────────────────────
// Chapters
// ─────────────────────────────────────────────────────────────────────────────

/** What an objective asks for. Shift objectives read the paid shift's report; the others the career's state. */
export type StoryTest =
  /** Paid shifts in this chapter. */
  | { kind: 'shifts'; n: number }
  /** One shift with this grade or better. */
  | { kind: 'grade'; min: ShiftReport['grade'] }
  /** One shift with at least `minIncidents` incidents and none expired. */
  | { kind: 'noExpired'; minIncidents: number }
  /** One shift with at least `n` 112 calls answered. */
  | { kind: 'calls'; n: number }
  /** Calls of the AI colleagues the player's crews reached in one shift (ReportExtras.helpGiven). */
  | { kind: 'help'; n: number }
  /** One shift with at least `minCount` P1 incidents reached in `maxAvg` minutes on average. */
  | { kind: 'p1'; maxAvg: number; minCount: number }
  /** One shift with at least `minIncidents` incidents and no officer injured. */
  | { kind: 'safe'; minIncidents: number }
  /** Staatus at least `min` at the end of a shift. */
  | { kind: 'staatus'; min: number }
  /** Sectors covered in the home prefecture (covering it whole counts as all). */
  | { kind: 'sectors'; n: number }
  /** A shift played in a prefecture other than the home one. */
  | { kind: 'away' }
  /** `n` shifts in a row with grade A or S. */
  | { kind: 'streak'; n: number }
  /** The whole home prefecture covered. */
  | { kind: 'wholeHome' }
  /** `n` prefectures covered whole. */
  | { kind: 'wholeRegions'; n: number }
  /** At least `n` officers on the staff list. */
  | { kind: 'staff'; n: number };

export interface StoryObjectiveDef {
  id: string;
  text: Text;
  test: StoryTest;
}

/** The milestone a chapter begins at (after the previous one is finished): every given field must hold. */
export interface StoryGate {
  /** Rank index (RANKS in src/data/economy.ts). */
  rank?: number;
  /** Sectors covered in the home prefecture (covering it whole counts as all). */
  homeSectors?: number;
  /** Prefectures covered whole. */
  wholeRegions?: number;
}

/** What an answer or a finished chapter changes: always modest, never anything taken away from the player. */
export interface StoryEffect {
  /** Staatus points (clamped to 0..100). */
  reputation?: number;
  /** A ledger line (negative: a cost, refused when the budget does not have it). */
  money?: { amount: number; text: Text };
  /** Added to every officer's morale (clamped as everywhere). */
  morale?: number;
  /** Paid shifts the prefect's next offer of a sector comes later (a sector career with no offer waiting). */
  offerDelay?: number;
}

export interface StoryOptionDef {
  id: string;
  label: Text;
  /** The consequence in a few words, shown under the button. */
  note: Text;
  effect: StoryEffect;
  /** What the character says back (an inbox message). */
  reply: Text;
}

export interface StoryChoiceDef {
  id: string;
  who: StoryCastId;
  /** Asked after this many paid shifts in the chapter. */
  after: number;
  text: Text;
  options: StoryOptionDef[];
}

export interface StoryChapterDef {
  /** Stable id (docs, tests); the save keeps the chapter number. */
  id: string;
  title: Text;
  /** One line about the chapter for the panel. */
  summary: Text;
  gate: StoryGate;
  intro: { who: StoryCastId; text: Text };
  outro: { who: StoryCastId; text: Text };
  objectives: StoryObjectiveDef[];
  /** Objectives needed to finish the chapter. */
  need: number;
  /** Paid shifts the chapter lasts at least, however fast its objectives are met. */
  minShifts: number;
  /** Given once when the chapter is finished. */
  reward: StoryEffect;
  choice?: StoryChoiceDef;
  /** A line of the briefing's päevakäsk while the chapter runs. */
  order: Text;
  /** The newspaper's piece on the report of the shift that finished the chapter. */
  press: { title: Text; body: Text };
}

export const STORY_CHAPTERS: StoryChapterDef[] = [
  // ── 1 ─────────────────────────────────────────────────────────────────────
  {
    id: 'esimene-laud',
    title: T('Esimene laud', 'The first desk'),
    summary: T(
      'Üks sektor, oma ekipaažid ja vahetuse vanem selja taga.',
      'One sector, your own crews and the shift supervisor behind you.',
    ),
    gate: {},
    intro: {
      who: 'mentor',
      text: T(
        'Tere tulemast juhtimiskeskusesse, {name}. Mina olen {mentor}, sinu vahetuse vanem. Sinu laud on {sector}: üks sektor, oma ekipaažid, naaberlauad kõrval. Esimestel vahetustel vaatan sulle aeg-ajalt üle õla. Küsi julgelt, raadios loeb rahulik hääl rohkem kui kiirus.',
        'Welcome to the command centre, {name}. I am {mentor}, your shift supervisor. Your desk is {sector}: one sector, your own crews, the neighbouring desks next to you. For the first shifts I will look over your shoulder now and then. Ask when you need to; on the radio a calm voice counts for more than speed.',
      ),
    },
    outro: {
      who: 'mentor',
      text: T(
        'Esimene nädal on seljataga. Hoiad pead külmana ka siis, kui kolm kõnet korraga sisse tuleb, ja ekipaažid usaldavad sinu häält. Edaspidi vaatan su tööd harvem. Naaberlaudades istuvad samuti inimesed: kui nemad kitsikusse jäävad, on hea, kui sina oled see, kes aitab.',
        'The first week is behind you. You keep a cool head even when three calls come in at once, and the crews trust your voice. From now on I will look in less often. There are people at the neighbouring desks too: when they are stretched, it is good if you are the one who helps.',
      ),
    },
    objectives: [
      {
        id: 'c1-shifts',
        text: T('Kolm vahetust laua taga', 'Three shifts at the desk'),
        test: { kind: 'shifts', n: 3 },
      },
      {
        id: 'c1-grade',
        text: T('Vahetus hindega B või parem', 'A shift graded B or better'),
        test: { kind: 'grade', min: 'B' },
      },
      {
        id: 'c1-noexpired',
        text: T(
          'Vahetus vähemalt 8 sündmusega, kus ükski väljakutse ei aegu',
          'A shift of at least 8 incidents with no call expired',
        ),
        test: { kind: 'noExpired', minIncidents: 8 },
      },
      {
        id: 'c1-calls',
        text: T('Ühes vahetuses vähemalt 3 vastatud 112-kõnet', 'At least 3 112 calls answered in one shift'),
        test: { kind: 'calls', n: 3 },
      },
    ],
    need: 3,
    minShifts: 3,
    reward: { reputation: 2 },
    choice: {
      id: 'c1-debrief',
      who: 'mentor',
      after: 1,
      text: T(
        'Pärast vahetust: kui sul on tund aega, kuulame koos su vahetuse raadioside läbi. Näitan, kus saab lühemalt öelda.',
        'After the shift: if you have an hour, let us listen through the radio traffic of your shift together. I will show you where it can be said shorter.',
      ),
      options: [
        {
          id: 'stay',
          label: T('Jään ja kuulan läbi', 'Stay and listen'),
          note: T('Staatus +1, ületunnid 90 €', 'Staatus +1, overtime €90'),
          effect: {
            reputation: 1,
            money: {
              amount: -90,
              text: T(
                'Ületunnitöö: vahetuse raadioside analüüs',
                'Overtime: review of the shift radio traffic',
              ),
            },
          },
          reply: T(
            'Hea. Pane tähele, kui sageli ütled „kordan“. Pooltel juhtudel pole seda vaja.',
            'Good. Notice how often you say "repeat". Half the time it is not needed.',
          ),
        },
        {
          id: 'home',
          label: T('Täna mitte, lähen koju', 'Not today, I am going home'),
          note: T('Muutusi pole', 'No change'),
          effect: {},
          reply: T(
            'Selge, puhka välja. Salvestus ei kao kuhugi.',
            'Fine, get some rest. The recording is not going anywhere.',
          ),
        },
      ],
    },
    order: T(
      'Operatiivinfo haldur {fullName} ({sector}) töötab juhendamisel; juhendaja vahetuse vanem {mentor}.',
      'Shift supervisor {mentor} is mentoring dispatcher {fullName} ({sector}).',
    ),
    press: {
      title: T('Juhtimiskeskuses on uus operatiivinfo haldur', 'A new dispatcher at the command centre'),
      body: T(
        '{cityGen} juhtimiskeskuses töötab uus operatiivinfo haldur {fullName}, kelle vastutada on {sector}. „Esimestel nädalatel õpitakse kõige rohkem. Uus kolleeg on rahulik ja täpne,“ ütles vahetuse vanem {mentor}.',
        'A new dispatcher, {fullName}, has joined the command centre in {city} and covers {sector}. "The first weeks are when you learn the most. Our new colleague is calm and precise," said shift supervisor {mentor}.',
      ),
    },
  },

  // ── 2 ─────────────────────────────────────────────────────────────────────
  {
    id: 'naabrid',
    title: T('Naabrid', 'Neighbours'),
    summary: T(
      'Naaberlauad, abikutsed ja prefekti esimene pakkumine.',
      'The neighbouring desks, calls for help and the prefect’s first offer.',
    ),
    gate: { rank: 1 },
    intro: {
      who: 'colleague',
      text: T(
        'Tere, {name}. Siin {colleague}, {colleagueSector} laud, kohe sinu kõrval. Kui mul on kõik ekipaažid väljas, küsin raadios abi. Kui sul läheb kitsaks, ütle julgelt. Selles majas ei jäeta kedagi üksi.',
        'Hi, {name}. {colleague} here, the {colleagueSector} desk, right next to you. When all my crews are out, I ask for help on the radio. When you are stretched, just say so. Nobody is left alone in this building.',
      ),
    },
    outro: {
      who: 'prefect',
      text: T(
        '{name}, naaberlauad räägivad sinust head. Kui kolleeg palub abi ja sina saadad ekipaaži, siis see ongi juhtimiskeskus. Varsti tuleb sul vastutust juurde.',
        '{name}, the neighbouring desks speak well of you. When a colleague asks for help and you send a crew, that is what a command centre is. More responsibility is coming your way soon.',
      ),
    },
    objectives: [
      {
        id: 'c2-help',
        text: T(
          'Sinu ekipaaž jõuab naaberlaua abikutsele',
          'A crew of yours reaches a neighbouring desk’s call for help',
        ),
        test: { kind: 'help', n: 1 },
      },
      {
        id: 'c2-rep',
        text: T('Staatus vähemalt 35 vahetuse lõpus', 'Staatus at least 35 at the end of a shift'),
        test: { kind: 'staatus', min: 35 },
      },
      {
        id: 'c2-sector',
        text: T('Teine sektor prefektilt', 'A second sector from the prefect'),
        test: { kind: 'sectors', n: 2 },
      },
      {
        id: 'c2-p1',
        text: T(
          'Vahetus, kus P1 sündmustele jõutakse keskmiselt 12 minutiga',
          'A shift where P1 incidents are reached in 12 minutes on average',
        ),
        test: { kind: 'p1', maxAvg: 12, minCount: 1 },
      },
    ],
    need: 3,
    minShifts: 3,
    reward: { reputation: 2 },
    choice: {
      id: 'c2-breakroom',
      who: 'union',
      after: 2,
      text: T(
        'Jaoskonna puhkeruumis on külmkapp katki ja diivan lagunenud, öövahetuse ekipaažid söövad autos. Ametiühing aitaks sisustusega, aga 1 200 € peaks tulema sinu eelarvest. Kas leiad selle?',
        'At the station the break room fridge is broken and the sofa has fallen apart; the night crews eat in their cars. The union would help with the furniture, but €1,200 would have to come from your budget. Can you find it?',
      ),
      options: [
        {
          id: 'fund',
          label: T('Eraldan 1 200 €', 'Allocate €1,200'),
          note: T('Kõigi ametnike moraal +4 %', 'Morale +4% for all officers'),
          effect: {
            money: {
              amount: -1200,
              text: T(
                'Jaoskonna puhkeruumi sisustus (koos ametiühinguga)',
                'Station break room furniture (with the union)',
              ),
            },
            morale: 0.04,
          },
          reply: T(
            'Aitäh. Ütlen ekipaažidele, kust raha tuli. Seda mäletatakse kauem kui ühte head vahetust.',
            'Thank you. I will tell the crews where the money came from. That is remembered longer than one good shift.',
          ),
        },
        {
          id: 'later',
          label: T('Praegu ei saa', 'Not now'),
          note: T('Muutusi pole', 'No change'),
          effect: {},
          reply: T(
            'Saan aru, eelarve on tihe. Tulen selle juurde tagasi, kui kuu lõpp paistab paremini.',
            'I understand, the budget is tight. I will come back to it when the end of the month looks better.',
          ),
        },
      ],
    },
    order: T(
      'Hoida ühendust naaberlaudadega; abipalvele reageerida võimalusel oma ekipaažiga.',
      'Keep in touch with the neighbouring desks; answer a call for help with a crew of your own when you can.',
    ),
    press: {
      title: T('Naabrid aitavad naabreid', 'Neighbours helping neighbours'),
      body: T(
        '{regionGen} juhtimiskeskuse lauad aitavad üksteist üha sagedamini: kui ühe sektori patrullid on väljas, saadab naabersektori operatiivinfo haldur appi oma ekipaaži. „Piir kaardil ei tähenda inimese jaoks midagi,“ ütles {fullName}.',
        'The desks of the {region} command centre help each other more and more often: when one sector’s patrols are all out, the dispatcher next door sends a crew of their own. "A line on the map means nothing to the person calling," said {fullName}.',
      ),
    },
  },

  // ── 3 ─────────────────────────────────────────────────────────────────────
  {
    id: 'vahetuse-vanem',
    title: T('Vahetuse vanem', 'Shift supervisor'),
    summary: T(
      'Vahetuse vanem on koolitusel ja vahetus on sinu kanda.',
      'The shift supervisor is away on a course and the shift is yours to carry.',
    ),
    gate: { homeSectors: 2 },
    intro: {
      who: 'mentor',
      text: T(
        '{name}, lähen kolmeks nädalaks täienduskoolitusele. Prefekt on nõus, et sel ajal oled sina vahetuse vanema kohusetäitja. Lisaks oma sektoritele vaatad, kuidas teistel laudadel läheb, ja teed otsuse, kui keegi teine seda ei tee. Hoia meeskond terve. Ja ära unusta ise süüa.',
        '{name}, I am off on a three-week course. The prefect agrees that you stand in as acting shift supervisor meanwhile. Besides your own sectors you keep an eye on the other desks and make the call when nobody else does. Keep the team in one piece. And do not forget to eat.',
      ),
    },
    outro: {
      who: 'mentor',
      text: T(
        'Olen tagasi. Logist näen, et said hakkama ja keegi ei jäänud üksi. Ütlen ausalt: prefektuuris on su nimi juba jutuks olnud.',
        'I am back. The log tells me you managed and nobody was left alone. To be honest, your name has already come up at the prefecture.',
      ),
    },
    objectives: [
      { id: 'c3-sectors', text: T('Kolmas sektor', 'A third sector'), test: { kind: 'sectors', n: 3 } },
      {
        id: 'c3-grade',
        text: T('Vahetus hindega A või parem', 'A shift graded A or better'),
        test: { kind: 'grade', min: 'A' },
      },
      {
        id: 'c3-safe',
        text: T(
          'Vahetus vähemalt 10 sündmusega, kus ükski ametnik viga ei saa',
          'A shift of at least 10 incidents with no officer hurt',
        ),
        test: { kind: 'safe', minIncidents: 10 },
      },
      {
        id: 'c3-rep',
        text: T('Staatus vähemalt 50 vahetuse lõpus', 'Staatus at least 50 at the end of a shift'),
        test: { kind: 'staatus', min: 50 },
      },
    ],
    need: 3,
    minShifts: 3,
    reward: {
      reputation: 2,
      money: {
        amount: 1000,
        text: T(
          'Prefektuuri lisaeelarve: vahetuse vanema asendamine',
          'Prefecture top-up: standing in as shift supervisor',
        ),
      },
    },
    choice: {
      id: 'c3-press',
      who: 'journalist',
      after: 1,
      text: T(
        'Tere, {journalist} ajalehest {paper}. Kirjutan loo politsei reageerimisaegadest maapiirkondades. Kas oleksite nõus andma lühikese kommentaari juhtimiskeskuse poolt?',
        'Hello, {journalist} from {paper}. I am writing about police response times in the countryside. Would you give a short comment from the command centre?',
      ),
      options: [
        {
          id: 'comment',
          label: T('Annan lühikese kommentaari', 'Give a short comment'),
          note: T(
            'Staatus +2, prefekti järgmine pakkumine vahetuse võrra hiljem',
            'Staatus +2, the prefect’s next offer a shift later',
          ),
          effect: { reputation: 2, offerDelay: 1 },
          reply: T(
            'Aitäh, see on aus ja asjalik. Lugu ilmub homme. (Prefekt eelistab, et ajakirjanikud läheksid pressiesindaja kaudu.)',
            'Thank you, that is honest and to the point. The piece runs tomorrow. (The prefect prefers journalists to go through the press officer.)',
          ),
        },
        {
          id: 'press-office',
          label: T('Suunan pressiesindaja juurde', 'Refer them to the press officer'),
          note: T('Muutusi pole', 'No change'),
          effect: {},
          reply: T(
            'Selge, võtan pressiesindajaga ühendust. Kui kunagi tahate ise rääkida, teate, kust mind leida.',
            'Understood, I will contact the press officer. If you ever want to speak yourself, you know where to find me.',
          ),
        },
      ],
    },
    order: T(
      'Vahetuse vanema kohusetäitja: {rank} {fullName}.',
      'Acting shift supervisor: {rank} {fullName}.',
    ),
    press: {
      title: T(
        'Juhtimiskeskuse öö: vähem ootamist, rohkem koostööd',
        'A night at the command centre: less waiting, more teamwork',
      ),
      body: T(
        'Vahetuse vanema kohusetäitjana töötanud {fullName} hoidis viimastel nädalatel {regionGen} juhtimiskeskuse vahetusi koos. „Keegi ei tee seda tööd üksi. Hea vahetus on see, kus kõik ekipaažid jõuavad hommikul koju,“ ütles {fullName}.',
        'As acting shift supervisor, {fullName} has held the shifts of the {region} command centre together over the past weeks. "Nobody does this job alone. A good shift is one where every crew gets home in the morning," said {fullName}.',
      ),
    },
  },

  // ── 4 ─────────────────────────────────────────────────────────────────────
  {
    id: 'prefektuur',
    title: T('Prefektuur', 'The prefecture'),
    summary: T(
      'Juhtkonna koosolekud, teine prefektuur ja terve prefektuuri vastutus.',
      'Leadership meetings, a second prefecture and a whole prefecture to answer for.',
    ),
    gate: { rank: 2, homeSectors: 3 },
    intro: {
      who: 'prefect',
      text: T(
        '{name}, kutsun sind neljapäeval prefektuuri juhtkonna koosolekule. Räägime, kuidas juhtimiskeskus järgmisel aastal töötab. Sul on nüüd luba töötada ka teises prefektuuris ja tahan, et näeksid, kuidas seal asjad käivad. Hea operatiivinfo haldur tunneb ka naabri maad.',
        '{name}, I am inviting you to the prefecture’s leadership meeting on Thursday. We will talk about how the command centre works next year. You are now cleared to work in a second prefecture as well, and I want you to see how things are done there. A good dispatcher knows the neighbour’s ground too.',
      ),
    },
    outro: {
      who: 'prefect',
      text: T(
        'Ütlesin koosolekul, et juhtimiskeskus vajab inimest, kes näeb tervikut ja mitte ainult oma lauda. Mõtlesin sind. Jätka samamoodi.',
        'I told the meeting that the command centre needs someone who sees the whole picture and not only their own desk. I had you in mind. Keep it up.',
      ),
    },
    objectives: [
      {
        id: 'c4-away',
        text: T('Vahetus teises prefektuuris', 'A shift in another prefecture'),
        test: { kind: 'away' },
      },
      {
        id: 'c4-rep',
        text: T('Staatus vähemalt 60 vahetuse lõpus', 'Staatus at least 60 at the end of a shift'),
        test: { kind: 'staatus', min: 60 },
      },
      {
        id: 'c4-streak',
        text: T('Kolm vahetust järjest hindega A või parem', 'Three shifts in a row graded A or better'),
        test: { kind: 'streak', n: 3 },
      },
      {
        id: 'c4-whole',
        text: T('Kogu koduprefektuur sinu vastutusel', 'The whole home prefecture under your responsibility'),
        test: { kind: 'wholeHome' },
      },
    ],
    need: 3,
    minShifts: 3,
    reward: { reputation: 3 },
    choice: {
      id: 'c4-trainees',
      who: 'prefect',
      after: 2,
      text: T(
        'Meile tulevad kaks uut operatiivinfo haldurit. Kas võtaksid nad esimeseks nädalaks enda kõrvale? Koolitusraha tuleb prefektuurist, aga sinu laud saab olema rahvarohke.',
        'Two new dispatchers are joining us. Would you take them at your side for their first week? The training money comes from the prefecture, but your desk will be crowded.',
      ),
      options: [
        {
          id: 'mentor',
          label: T('Võtan nad enda juurde', 'I will take them'),
          note: T(
            'Staatus +2, koolitustoetus 1 500 €, järgmine sektoripakkumine vahetuse võrra hiljem',
            'Staatus +2, training grant €1,500, the next sector offer a shift later',
          ),
          effect: {
            reputation: 2,
            money: {
              amount: 1500,
              text: T(
                'Koolitustoetus: uute operatiivinfo haldurite juhendamine',
                'Training grant: mentoring new dispatchers',
              ),
            },
            offerDelay: 1,
          },
          reply: T(
            'Hea. Nad on esmaspäeval kell seitse sinu laua juures. Ära lase neil kohe kõige raskemaid kõnesid võtta.',
            'Good. They will be at your desk at seven on Monday. Do not let them take the hardest calls straight away.',
          ),
        },
        {
          id: 'busy',
          label: T('Praegu ei jõua', 'Not right now'),
          note: T('Muutusi pole', 'No change'),
          effect: {},
          reply: T(
            'Saan aru. Annan nad seekord teisele vahetusele.',
            'I understand. This time they go to another shift.',
          ),
        },
      ],
    },
    order: T(
      'Prefektuuri juhtkond jälgib juhtimiskeskuse tulemusi; vahetuse kokkuvõte esitada prefektile.',
      'The prefecture leadership follows the command centre’s results; the shift summary goes to the prefect.',
    ),
    press: {
      title: T(
        'Prefektuur kaalub juhtimiskeskuse ümberkorraldamist',
        'Prefecture weighs a reorganisation of the command centre',
      ),
      body: T(
        '{regionGen} juhtkond arutab, kuidas juhtimiskeskuse laudu edaspidi jagada. Prefekt {prefect} kiitis vahetuste koostööd. „Heaks näiteks on {fullName}, kes näeb tervikut ja mitte ainult oma lauda,“ ütles prefekt.',
        'The leadership of the {region} is discussing how the command centre’s desks are split in future. Prefect {prefect} praised the teamwork of the shifts. "A good example is {fullName}, who sees the whole picture and not only their own desk," the prefect said.',
      ),
    },
  },

  // ── 5 ─────────────────────────────────────────────────────────────────────
  {
    id: 'keskuse-juht',
    title: T('Keskuse juht', 'Head of the centre'),
    summary: T('Rohkem laudu, rohkem inimesi, vähem und.', 'More desks, more people, less sleep.'),
    gate: { rank: 4, wholeRegions: 1 },
    intro: {
      who: 'prefect',
      text: T(
        '{name}, juhtimiskeskuse juht jääb kevadel pensionile. Ma ei luba midagi, aga tahan näha, kas suudad hoida kogu keskust: rohkem laudu, rohkem inimesi, vähem und. Ametiühing ja ajakirjanikud vaatavad samuti.',
        '{name}, the head of the command centre retires in the spring. I promise nothing, but I want to see whether you can hold the whole centre: more desks, more people, less sleep. The union and the press are watching too.',
      ),
    },
    outro: {
      who: 'prefect',
      text: T(
        'Juhtkond on näinud, mida sa suudad. Kui ühel päeval on kõik neli prefektuuri sinu laual, ei pea keegi enam küsima, kes on keskuse juht. Aitäh, {name}.',
        'The leadership has seen what you can do. The day all four prefectures are on your desk, nobody will need to ask who the head of the centre is. Thank you, {name}.',
      ),
    },
    objectives: [
      {
        id: 'c5-two',
        text: T(
          'Kaks prefektuuri tervikuna sinu vastutusel',
          'Two whole prefectures under your responsibility',
        ),
        test: { kind: 'wholeRegions', n: 2 },
      },
      {
        id: 'c5-rep',
        text: T('Staatus vähemalt 75 vahetuse lõpus', 'Staatus at least 75 at the end of a shift'),
        test: { kind: 'staatus', min: 75 },
      },
      { id: 'c5-s', text: T('Vahetus hindega S', 'A shift graded S'), test: { kind: 'grade', min: 'S' } },
      {
        id: 'c5-staff',
        text: T('Koosseisus vähemalt 25 ametnikku', 'At least 25 officers on the staff list'),
        test: { kind: 'staff', n: 25 },
      },
    ],
    need: 3,
    minShifts: 3,
    reward: { reputation: 3 },
    choice: {
      id: 'c5-overtime',
      who: 'union',
      after: 1,
      text: T(
        'Ületunnid on kuhjunud ja inimesed on väsinud. Ametiühing palub ületunnitasu välja maksta kohe, mitte järgmise kuu palgaga. See on 2 500 €.',
        'Overtime has piled up and people are tired. The union asks for the overtime to be paid out now rather than with next month’s salary. It comes to €2,500.',
      ),
      options: [
        {
          id: 'pay',
          label: T('Maksan kohe välja', 'Pay it now'),
          note: T('2 500 €, moraal +5 %, Staatus +1', '€2,500, morale +5%, Staatus +1'),
          effect: {
            reputation: 1,
            morale: 0.05,
            money: {
              amount: -2500,
              text: T('Ületunnitasu väljamakse (ametiühingu taotlus)', 'Overtime pay-out (union request)'),
            },
          },
          reply: T(
            'Aitäh. Teatan inimestele täna. See ei ole väike asi.',
            'Thank you. I will tell everyone today. This is not a small thing.',
          ),
        },
        {
          id: 'next-month',
          label: T('Järgmise kuu palgaga', 'With next month’s salary'),
          note: T('Moraal -3 %', 'Morale -3%'),
          effect: { morale: -0.03 },
          reply: T(
            'Edastan. Rõõmsaks see kedagi ei tee, aga inimesed saavad aru, kui sa ise neile ütled.',
            'I will pass it on. Nobody will be happy, but people will understand if you tell them yourself.',
          ),
        },
      ],
    },
    order: T('Vahetuse eest vastutab {rank} {fullName}.', '{rank} {fullName} is responsible for the shift.'),
    press: {
      title: T('Kes juhib juhtimiskeskust?', 'Who runs the command centre?'),
      body: T(
        'Juhtimiskeskuse juhi kohale on mitu kandidaati, kuid majas nimetatakse ühte nime sagedamini kui teisi: {fullName}. Ametiühingu usaldusisik {union} ütles, et inimesed usaldavad juhti, kes tuleb ise öövahetusse.',
        'There are several candidates to head the command centre, but one name comes up more often than the others in the building: {fullName}. Union representative {union} said that people trust a leader who turns up for the night shift.',
      ),
    },
  },
];
