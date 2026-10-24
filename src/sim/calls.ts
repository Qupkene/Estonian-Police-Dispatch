/**
 * Interactive 112 transfers (DESIGN §4.11). Häirekeskus connects a caller to the police
 * command centre; the player answers, asks questions, and ends the call with a decision.
 *
 * Contract notes for UI / engine-core:
 *  - The incident stays hidden (`s.flags['hidden:<id>'] = true`) until the call ends.
 *  - `ActiveCall.lines[i].t` may lie in the future (caller still "talking"); show only lines
 *    with `t <= s.now`.
 *  - Russian callers: every caller line carries the original in `ru`. While no interpreter is on
 *    the call, `text` ALSO holds the Russian original (both et/en), so the UI can always render
 *    `text`. Switching the interpreter on translates earlier lines in place and later answers
 *    arrive translated (+20 game-s each, −75 % with the `interpreter_line` upgrade).
 *    A Russian caller tells the same story as an Estonian one: the Russian originals of the scripted
 *    lines (call.openingRu, call.answersRu, callerLinesRu) are paired index for index with the
 *    Estonian lines the interpreter renders; generated answers say addresses, streets, vehicles and
 *    clothes in Russian (ruAddress, ruStreet, ruClothing).
 *  - Facts the caller gives (address confirmed, weapon, description, plate…) are appended to
 *    `inc.details` as "Helistaja: …" lines the first time each fact is learned.
 *
 * Owned by engine-systems.
 */
import { closeIncident } from '@/sim/commands';
import { ageOf, describePerson, describeVehicle, withArticleEn } from '@/gen/describe';
import { CELEB_PREFIX, celebrityDef, knownName } from './celebrities';
import { deskLineBusy } from './desks';
import { addTimeline, emit, publishIncident, regionOf, tplOf } from './internal';
import { placeText, spokenPlace, spokenPlaceLabel } from './radio';
import {
  OPENINGS,
  P,
  SITUATION_BY_TEMPLATE,
  bandFits,
  genderize,
  genderizePhrase,
  spokenStreetGenitive,
  type Gn,
  type Phrase as BookPhrase,
  type Situation,
} from './callPhrases';
import { hashString, withRng, type Rng } from './rng';
import { fill, fillText, type Vars } from './text';
import { hhmm, wall } from './time';
import type {
  ActiveCall,
  Agency,
  Appearance,
  CallerMood,
  CallQuestionId,
  Incident,
  IncidentTemplate,
  Person,
  PersonSpec,
  Priority,
  SimState,
  Text,
  Vehicle,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default interactive chance by priority (template.interactiveChance overrides). */
export const INTERACTIVE_CHANCE: Record<Priority, number> = { 1: 0.35, 2: 0.25, 3: 0.12, 4: 0.05 };
/** Unanswered for this long → Häirekeskus creates the card itself. */
export const RING_TIMEOUT_MS = 45_000;
/** Ended calls stay visible this long (UI fade-out). */
export const PRUNE_AFTER_MS = 30_000;
/** Answered call with no dispatcher activity → caller hangs up, HK creates the card. */
export const IDLE_HANGUP_MS = 5 * 60_000;
export const INTERPRETER_DELAY_MS = 20_000;
/** Share of interactive P3/P4 non-serious calls that are pranks. */
export const PRANK_SHARE = 0.04;

type Phrase = BookPhrase;

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher phrasing (standard Estonian call-taking questions)
// ─────────────────────────────────────────────────────────────────────────────

export const DISPATCHER_QUESTIONS: Record<CallQuestionId, Phrase> = {
  what: P(
    'Расскажите подробнее, что случилось?',
    'Rääkige palun täpsemalt, mis juhtus?',
    'Please tell me exactly what happened.',
  ),
  where: P('Какой точный адрес?', 'Mis on täpne aadress?', 'What is the exact address?'),
  injured: P('Есть пострадавшие?', 'Kas keegi on vigastatud?', 'Is anyone injured?'),
  weapons: P('У кого-нибудь есть оружие?', 'Kas kellelgi on relv?', 'Does anyone have a weapon?'),
  suspect: P(
    'Опишите, пожалуйста, этого человека.',
    'Kirjeldage palun isikut.',
    'Please describe the person.',
  ),
  vehicle: P(
    'У этого человека есть машина? Номер?',
    'Kas tal on sõiduk? Number?',
    'Does the person have a vehicle? The plate number?',
  ),
  direction: P('В какую сторону он ушёл?', 'Mis suunas ta läks?', 'Which way did they go?'),
  count: P('Сколько там человек?', 'Kui palju inimesi seal on?', 'How many people are there?'),
  when: P('Когда это произошло?', 'Millal see juhtus?', 'When did this happen?'),
  name: P('Ваше имя, пожалуйста?', 'Teie nimi, palun?', 'Your name, please?'),
  safe: P('Вы сами в безопасном месте?', 'Kas olete ise ohutus kohas?', 'Are you somewhere safe yourself?'),
  children: P('Там есть дети?', 'Kas lapsi on seal?', 'Are there children there?'),
  intoxicated: P('Этот человек пьян?', 'Kas ta on joobes?', 'Is the person drunk?'),
};

const GREETING: Phrase = P(
  'Полиция, слушаю вас. Что случилось?',
  'Häirekeskus ühendas teid politseiga. Mis juhtus?',
  'The emergency centre has put you through to the police. What happened?',
);

// ─────────────────────────────────────────────────────────────────────────────
// Situations & caller phrasebooks (data in callPhrases.ts)
// ─────────────────────────────────────────────────────────────────────────────

export type { Situation } from './callPhrases';
export { OPENINGS } from './callPhrases';

/**
 * Situation-free answer phrases. Placeholders: {address} {city} {place} {desc} {car} {plate}
 * {platePart} {dir} {n} {m} {name}. `{m|f}` and `[m|f|n]` pick gendered forms (see callPhrases.ts).
 */
export const ANSWERS = {
  where_addr: P(
    'Адрес: {address}, {city}.',
    'Aadress on {address}, {city}.',
    'The address is {address}, {city}.',
  ),
  where_addr_only: P('Адрес: {address}.', 'Aadress on {address}.', 'The address is {address}.'),
  // "Ma olen {place} juures" would need the genitive of any place name; this word order does not.
  where_place: P(
    'Адрес: {address}, тут {place}.',
    'Aadress on {address}, siin on {place}.',
    "I'm at {place}, {address}.",
  ),
  where_rural: P(
    'Точно не знаю… где-то тут, ближайший адрес: {address}.',
    'Täpselt ei tea… kuskil siin, lähim aadress on {address}.',
    "I'm not sure exactly… somewhere around here, the nearest address is {address}.",
  ),
  where_road: P('На трассе {address}.', 'Maantee peal, {address}.', 'On the main road, {address}.'),
  injured_yes: P(
    'Да, есть пострадавший, идёт кровь!',
    'Jah, üks on vigastatud, ta veritseb!',
    "Yes, someone's hurt, they're bleeding!",
  ),
  injured_no: P(
    'Нет, вроде никто не ранен.',
    'Ei, tundub, et keegi pole vigastatud.',
    'No, nobody seems to be hurt.',
  ),
  injured_unknown: P(
    'Не знаю, мне отсюда не видно.',
    'Ma ei tea, siit ei ole näha.',
    "I don't know, I can't see from here.",
  ),
  weapon_knife: P(
    'Да, у [него|неё] нож!',
    'Jah, tal on nuga!',
    '[Yes, he has|Yes, she has|Yes, they have] a knife!',
  ),
  weapon_gun: P(
    'У [него|неё] пистолет, я {сам видел|сама видела}!',
    'Tal on püstol, ma nägin ise!',
    '[He has|She has|They have] a pistol, I saw it myself!',
  ),
  weapon_maybe: P(
    'Что-то было в руке, может, оружие.',
    'Tal oli midagi käes, võib-olla relv.',
    '[He had something in his|She had something in her|They had something in their] hand, maybe a weapon.',
  ),
  weapon_none: P('Оружия я не {видел|видела}.', 'Relva ma ei näinud.', "I didn't see any weapon."),
  suspect_desc: P('{desc}.', '{desc}.', '{desc}.'),
  suspect_none: P(
    'Я [его|её] не {разглядел|разглядела}, было темно.',
    'Ma ei näinud teda hästi, oli pime.',
    "I didn't get a good look, it was dark.",
  ),
  suspect_parent: P(
    'Это папа… он очень злой.',
    'See on issi… ta on väga vihane.',
    "It's daddy… he's really angry.",
  ),
  suspect_nobody: P(
    'Тут нет никакого подозреваемого.',
    'Siin pole kedagi kahtlast.',
    "There's nobody suspicious here.",
  ),
  vehicle_full: P('Да, {car}, номер {plate}.', 'Jah, {car}, number {plate}.', 'Yes, {car}, plate {plate}.'),
  vehicle_partial: P(
    '{car}, номер… начинается на {platePart}, дальше не {запомнил|запомнила}.',
    '{car}, number… algas {platePart}, edasi ei jäänud meelde.',
    "{car}, the plate… started with {platePart}, I didn't catch the rest.",
  ),
  vehicle_none: P(
    'Нет, [он|она] пешком.',
    'Ei, ta oli jala.',
    '[No, he was|No, she was|No, they were] on foot.',
  ),
  vehicle_nobody: P(
    'Нет, тут никого с машиной нет.',
    'Ei, siin pole kedagi autoga.',
    "No, there's nobody here with a vehicle.",
  ),
  direction: P(
    '[Он убежал|Она убежала] в сторону {dir}.',
    'Ta jooksis {dir} suunas.',
    '[He ran|She ran|They ran] towards {dir}.',
  ),
  direction_car: P(
    '[Уехал|Уехала] в сторону {dir}.',
    'Ta sõitis {dir} suunas minema.',
    '[He drove|She drove|They drove] off towards {dir}.',
  ),
  direction_here: P(
    'Никуда, [он|она] всё ещё здесь!',
    'Mitte kuhugi, ta on ikka veel siin!',
    "[Nowhere, he's|Nowhere, she's|Nowhere, they're] still here!",
  ),
  direction_missing: P(
    'Не знаю, куда [он пошёл|она пошла], поэтому и звоню.',
    'Ma ei tea, kuhu ta läks, sellepärast helistangi.',
    "I don't know where [he went|she went|they went], that's why I'm calling.",
  ),
  direction_adrift: P(
    '[Его|Её] уносит всё дальше от берега.',
    'Teda viib aina kaugemale kaldast.',
    '[He is|She is|They are] drifting further and further from the shore.',
  ),
  direction_drowning: P(
    '[Он был|Она была] вон там, метрах в пятидесяти от берега.',
    'Ta oli seal, umbes viiekümne meetri kaugusel kaldast.',
    '[He was|She was|They were] over there, about fifty metres from the shore.',
  ),
  direction_nobody: P('Никто никуда не убегал.', 'Keegi pole kuhugi läinud.', 'Nobody has gone anywhere.'),
  direction_unknown: P(
    'Не {видел|видела}, куда [он делся|она делась].',
    'Ma ei näinud, kuhu ta kadus.',
    "I didn't see where [he|she|they] went.",
  ),
  count: P('Их там человек {n}.', 'Neid on seal umbes {n}.', 'There are about {n} of them.'),
  count_one: P('Один человек.', 'Üks inimene.', 'Just one person.'),
  count_many: P('Много, десятки человек!', 'Palju, kümneid inimesi!', 'Lots, dozens of people!'),
  when_now: P(
    'Прямо сейчас, это происходит сейчас!',
    'Praegu, see käib praegu!',
    "Right now, it's happening right now!",
  ),
  when_ago: P(
    'Минут {m} назад, где-то в {time}.',
    'Umbes {m} minutit tagasi, kella {time} paiku.',
    'About {m} minutes ago, around {time}.',
  ),
  when_night: P(
    'Ночью, я утром {заметил|заметила}.',
    'Öösel, ma märkasin hommikul.',
    'During the night, I noticed it in the morning.',
  ),
  name: P('Меня зовут {name}.', 'Minu nimi on {name}.', 'My name is {name}.'),
  name_anon: P('Я не хочу называть своё имя.', 'Ma ei taha oma nime öelda.', "I'd rather not give my name."),
  safe_yes: P('Да, я в безопасном месте.', 'Jah, olen ohutus kohas.', "Yes, I'm safe."),
  safe_yes_home: P(
    'Да, я в безопасности, я у себя дома.',
    'Jah, olen ohutus kohas, olen kodus.',
    "Yes, I'm safe, I'm at home.",
  ),
  safe_hiding: P(
    'Нет! Я {спрятался|спряталась}, сижу тихо…',
    'Ei! Ma peidan end ja olen vaikselt…',
    "No! I'm hiding and keeping quiet…",
  ),
  safe_hiding_home: P(
    'Нет! Я {заперся|заперлась} в ванной…',
    'Ei! Ma panin end vannituppa lukku…',
    "No! I've locked myself in the bathroom…",
  ),
  safe_no: P(
    'Не знаю… [он|она] рядом.',
    'Ma ei tea… ta on lähedal.',
    "I don't know… [he's|she's|they're] close by.",
  ),
  children_yes: P('Да, тут есть дети.', 'Jah, siin on lapsi.', 'Yes, there are children here.'),
  children_yes_home: P(
    'Да, дети дома, они плачут.',
    'Jah, lapsed on kodus, nad nutavad.',
    "Yes, the kids are at home, they're crying.",
  ),
  children_no: P('Нет, детей нет.', 'Ei, lapsi ei ole.', 'No, there are no children.'),
  intox_yes: P(
    'Да, [он пьяный|она пьяная] в стельку.',
    'Jah, ta on täiesti purjus.',
    "[Yes, he's|Yes, she's|Yes, they're] completely drunk.",
  ),
  intox_no: P(
    'Нет, [трезвый|трезвая] вроде.',
    'Ei, tundub kaine.',
    '[No, he seems|No, she seems|No, they seem] sober.',
  ),
  intox_unknown: P('Не знаю, может быть.', 'Ei tea, võib-olla.', "I don't know, maybe."),
  // The caller is the person in trouble (lost in the forest, fallen at home): questions about "the person" are about them.
  injured_self: P(
    'Я {ушибся|ушиблась}, очень больно.',
    'Ma sain haiget, valutab väga.',
    "I've hurt myself, it really hurts.",
  ),
  injured_self_no: P(
    'Нет, я не {ранен|ранена}, только очень страшно.',
    'Ei, viga ma ei saanud, aga mul on väga hirm.',
    "No, I'm not hurt, but I'm really scared.",
  ),
  vehicle_self: P(
    'Моя машина: {car}, номер {plate}.',
    'Minu auto on {car}, number {plate}.',
    'My car is a {car}, plate {plate}.',
  ),
  vehicle_self_none: P(
    'Нет, машины у меня тут нет.',
    'Ei, mul pole siin autot.',
    "No, I don't have a car here.",
  ),
  direction_self: P(
    'Я никуда не ухожу, жду здесь.',
    'Ma ei lähe kuhugi, ootan siin.',
    "I'm not going anywhere, I'm waiting here.",
  ),
  intox_self: P('Нет, я {трезвый|трезвая}.', 'Ei, ma olen kaine.', "No, I'm sober."),
  // The victim calling about the attack, and the suspect calling about himself (callerRole 'suspect').
  injured_victim: P(
    'Да, я {ранен|ранена}, у меня кровь идёт.',
    'Jah, ma sain viga, mul jookseb verd.',
    "Yes, I'm hurt, I'm bleeding.",
  ),
  injured_victim_unsure: P(
    'Не знаю... всё болит, но вроде ничего серьёзного.',
    'Ma ei tea… kõik valutab, aga vist midagi hullu pole.',
    "I don't know… everything hurts, but I don't think it's serious.",
  ),
  suspect_self: P(
    'Это я {сам|сама}. Я жду здесь.',
    'See olin mina ise. Ma ootan siin.',
    "It was me. I'm waiting here.",
  ),
  weapon_self_none: P('Нет, у меня ничего нет.', 'Ei, mul pole midagi.', "No, I don't have anything."),
  weapon_self_knife: P(
    'Нож я уже {положил|положила}, больше его не трогаю.',
    'Noa panin käest ära, ma ei puutu seda enam.',
    "I've put the knife down, I won't touch it again.",
  ),
  weapon_self_gun: P(
    'Оружие я {положил|положила}, я его не трогаю.',
    'Relva panin käest ära, ma ei puutu seda.',
    "I've put the gun down, I'm not touching it.",
  ),
  intox_self_yes: P(
    'Да, я {выпил|выпила}, врать не буду.',
    'Jah, ma jõin, ma ei hakka valetama.',
    "Yes, I've been drinking, I won't lie.",
  ),
  repeat: P('Я же уже {сказал|сказала}: ', 'Ma juba ütlesin: ', 'I already told you: '),
  unhelpful_panic: P(
    'Я не знаю, не знаю! Просто приезжайте быстрее!',
    'Ma ei tea, ma ei tea! Tulge lihtsalt kiiresti!',
    "I don't know, I don't know! Just come quickly!",
  ),
  unhelpful_drunk: P(
    'Какой адрес… щас, погоди… где-то тут.',
    'Mis aadress… oot, kohe… kuskil siin.',
    'What address… hang on… somewhere around here.',
  ),
  unhelpful_confused: P(
    'Ой, я {забыл|забыла}… что вы спросили?',
    'Oi, ma unustasin… mida te küsisite?',
    'Oh, I forgot… what did you ask?',
  ),
} satisfies Record<string, Phrase>;

/** Small head counts in words ("Neid on kaks."), not "umbes 2". */
const FEW: Record<number, Phrase> = {
  2: P('Их двое.', 'Neid on kaks.', 'There are two of them.'),
  3: P('Их трое.', 'Neid on kolm.', 'There are three of them.'),
  4: P('Их четверо.', 'Neid on neli.', 'There are four of them.'),
  5: P('Их человек пять.', 'Neid on umbes viis.', 'There are about five of them.'),
  6: P('Их человек шесть.', 'Neid on umbes kuus.', 'There are about six of them.'),
};

/** Mood fillers wrapped around answers. */
const MOOD_FILLERS: Partial<
  Record<CallerMood, { pre: Phrase[]; post: Phrase[]; pPre: number; pPost: number }>
> = {
  panic: {
    pre: [
      P('Боже… ', 'Oh jumal… ', 'Oh God… '),
      P('Слушайте… ', 'Kuulge… ', 'Listen… '),
      P('Сейчас… сейчас… ', 'Oot… oot… ', 'Wait… wait… '),
    ],
    post: [
      P(' Быстрее!', ' Kiiresti!', ' Hurry!'),
      P(' Скорее приезжайте!', ' Tulge ruttu!', ' Come quickly!'),
      P(' Пожалуйста, быстрее!', ' Palun kiirustage!', ' Please hurry!'),
    ],
    pPre: 0.3,
    pPost: 0.5,
  },
  drunk: {
    pre: [
      P('Слушай, командир… ', 'No kuule, ülemus… ', 'Listen, chief… '),
      P('Ну это… короче… ', 'Noh… see on nii, et… ', 'Well… the thing is… '),
    ],
    post: [
      P(
        ' …и вообще, чего вы столько спрашиваете?',
        ' …ja üldse, miks te nii palju küsite?',
        ' …and why are you asking so many questions anyway?',
      ),
      P(
        ' Я {трезвый|трезвая}, между прочим.',
        ' Ma olen muide täiesti kaine.',
        " I'm totally sober, by the way.",
      ),
    ],
    pPre: 0.6,
    pPost: 0.45,
  },
  elderly: {
    pre: [
      P('Извините, что беспокою… ', 'Vabandage, et tülitan… ', 'Sorry to bother you… '),
      P('Деточка, ', 'Kullake, ', 'Dear, '),
    ],
    post: [
      P(' Спасибо вам, дай вам бог здоровья.', ' Aitäh teile, kullake.', ' Thank you, dear.'),
      P(
        ' Я уже старый человек, понимаете.',
        ' Ma olen juba vana inimene, saate aru.',
        " I'm an old person, you see.",
      ),
    ],
    pPre: 0.45,
    pPost: 0.35,
  },
  child: {
    pre: [P('Мама сказала… ', 'Emme ütles, et… ', 'Mummy said… '), P('Эээ… ', 'Ee… ', 'Um… ')],
    post: [
      P(' Вы приедете?', ' Kas te tulete kohe?', ' Are you coming?'),
      P(' Мне страшно.', ' Mul on hirm.', " I'm scared."),
    ],
    pPre: 0.45,
    pPost: 0.5,
  },
  whisper: {
    pre: [P('(шёпотом) ', '(sosinal) ', '(whispering) ')],
    post: [P(' …я не могу говорить громче.', ' …ma ei saa valjemini rääkida.', " …I can't talk any louder.")],
    pPre: 1,
    pPost: 0.3,
  },
  angry: {
    pre: [
      P(
        'Я уже третий раз звоню! ',
        'Ma helistan juba kolmandat korda! ',
        "This is the third time I'm calling! ",
      ),
      P('Слушайте, ', 'Kuulge, ', 'Listen, '),
    ],
    post: [
      P(' Сделайте уже что-нибудь!', ' Tehke ometi midagi!', ' Do something for once!'),
      P(' Полиция вообще работает?', ' Kas politsei üldse töötab?', ' Do the police even work?'),
    ],
    pPre: 0.45,
    pPost: 0.45,
  },
  confused: {
    pre: [
      P('Подождите… что вы спросили? ', 'Oot-oot… mis te küsisite? ', 'Wait… what did you ask? '),
      P('Я не {уверен|уверена}… ', 'Ma pole kindel… ', "I'm not sure… "),
    ],
    post: [P(' …или это было вчера?', ' …või oli see eile?', ' …or was that yesterday?')],
    pPre: 0.5,
    pPost: 0.3,
  },
};

/** Prank caller lines (laughter, contradictions). */
const PRANK_OPENINGS: Phrase[] = [
  P(
    'Алло, у вас холодильник работает? Тогда бегите его ловить! (смех)',
    'Halloo, kas teie külmkapp töötab? Siis jookske talle järele! (naer)',
    'Hello, is your fridge running? Then you better go catch it! (laughter)',
  ),
  P(
    'Тут у соседа кот наркотиками торгует! Ха-ха-ха!',
    'Mu naabri kass müüb narkot! Hahaha!',
    "My neighbour's cat is dealing drugs! Hahaha!",
  ),
  P(
    'У нас тут НЛО приземлилось, инопланетяне хотят поговорить с полицией.',
    'Meil maandus UFO, tulnukad tahavad politseiga rääkida.',
    'A UFO has landed here, the aliens want to talk to the police.',
  ),
  P(
    'Алло… (хихиканье на фоне) …у нас ограбление… чипсов!',
    'Halloo… (taustal itsitamine) …meil on rööv… krõpsuröövel!',
    'Hello… (giggling in the background) …there’s a robbery… a crisps robber!',
  ),
];

const PRANK_ANSWERS: Partial<Record<CallQuestionId, Phrase[]>> = {
  where: [
    P(
      'Адрес? Э… Кремль, третий этаж. (хихиканье)',
      'Aadress? Ee… Valge Maja, Washington. (itsitamine)',
      'The address? Er… the White House, Washington. (giggling)',
    ),
    P(
      'На Луне, третий кратер слева.',
      'Kuu peal, kolmas kraater vasakult.',
      'On the Moon, third crater on the left.',
    ),
  ],
  what: [
    P(
      'Ну это… кот украл колбасу! Ха-ха!',
      'Noh… kass varastas vorsti! Hahaa!',
      'Well… the cat stole a sausage! Haha!',
    ),
  ],
  injured: [
    P(
      'Да, все ранены! …нет, никто. (смех)',
      'Jah, kõik on vigastatud! …ei, tegelikult mitte keegi. (naer)',
      "Yes, everyone's hurt! …no, actually nobody. (laughter)",
    ),
  ],
  weapons: [
    P(
      'У него банан! Очень опасный банан.',
      'Tal on banaan! Väga ohtlik banaan.',
      'He has a banana! A very dangerous banana.',
    ),
  ],
  suspect: [
    P(
      'Он зелёный и с тремя глазами. (смех на фоне)',
      'Ta on roheline ja kolme silmaga. (taustal naer)',
      "He's green with three eyes. (laughter in the background)",
    ),
  ],
  vehicle: [
    P(
      'Уехал на санках, номер 007.',
      'Ta sõitis minema kelguga, number 007.',
      'He left on a sledge, plate 007.',
    ),
  ],
  direction: [P('Он улетел, прямо вверх!', 'Ta lendas ära, otse üles!', 'He flew away, straight up!')],
  count: [P('Их миллион! Или два.', 'Neid on miljon! Või kaks.', 'There are a million of them! Or two.')],
  when: [P('Завтра. (смех)', 'Homme. (naer)', 'Tomorrow. (laughter)')],
  name: [
    P(
      'Меня зовут… Калевипоэг. (хихиканье)',
      'Minu nimi on… Kalevipoeg. (itsitamine)',
      'My name is… Kalevipoeg. (giggling)',
    ),
  ],
  safe: [
    P(
      'Я в полной безопасности на диване, ха-ха.',
      'Ma olen täitsa turvaliselt diivanil, hahaa.',
      "I'm perfectly safe on the sofa, haha.",
    ),
  ],
  children: [
    P(
      'Только мой младший брат тут хихикает.',
      'Ainult mu väike vend itsitab siin.',
      'Only my little brother giggling here.',
    ),
  ],
  intoxicated: [
    P(
      'Я? Нет, я не пью. (звон бутылок)',
      'Mina? Ei, mina ei joo. (taustal pudelite kõlin)',
      "Me? No, I don't drink. (bottles clinking)",
    ),
  ],
};

const CLOSING: Record<'create' | 'prank' | 'advice', Phrase> = {
  create: P(
    'Понятно. Полиция уже едет. Оставайтесь на связи и перезвоните, если что-то изменится.',
    'Selge. Politsei on teel. Jääge telefoni lähedale ja helistage kohe tagasi, kui olukord muutub.',
    'Understood. The police are on their way. Stay by the phone and call back straight away if anything changes.',
  ),
  prank: P(
    'Ложный вызов наказуем. Заканчиваю разговор.',
    'Valeväljakutse tegemine on karistatav. Lõpetan kõne.',
    'Making a false emergency call is punishable. I am ending the call.',
  ),
  advice: P(
    'Советую подать заявление через е-полицию или позвонить на справочную линию 1247.',
    'Soovitan esitada avalduse politsei e-teeninduses või helistada riigiinfo telefonil 1247.',
    'I suggest filing a report through the police e-service or calling the state helpline 1247.',
  ),
};

const AGENCY_NAME: Record<Agency, Text & { ru: string }> = {
  kiirabi: { et: 'kiirabi', en: 'the ambulance service', ru: 'скорая помощь' },
  paaste: { et: 'Päästeamet', en: 'the Rescue Board', ru: 'спасательная служба' },
  keskkonnaamet: { et: 'Keskkonnaamet', en: 'the Environmental Board', ru: 'Департамент окружающей среды' },
  kapo: { et: 'Kaitsepolitseiamet', en: 'the Internal Security Service', ru: 'полиция безопасности' },
  kov: { et: 'kohalik omavalitsus', en: 'the local municipality', ru: 'местное самоуправление' },
  sotsiaal: {
    et: 'lastekaitse ja sotsiaaltöö',
    en: 'child protection and social services',
    ru: 'социальная служба и защита детей',
  },
  merepaaste: { et: 'merepääste', en: 'maritime rescue', ru: 'морская спасательная служба' },
  tolliamet: {
    et: 'Maksu- ja Tolliamet',
    en: 'the Tax and Customs Board',
    ru: 'Налогово-таможенный департамент',
  },
  transpordiamet: {
    et: 'Transpordiamet',
    en: 'the Transport Administration',
    ru: 'Транспортный департамент',
  },
  veterinaar: {
    et: 'veterinaar- ja toiduamet',
    en: 'the veterinary and food board',
    ru: 'ветеринарная служба',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Russian names of towns as Russian-speaking callers say them. */
const RU_CITY: Record<string, string> = {
  Tallinn: 'Таллин',
  Narva: 'Нарва',
  Tartu: 'Тарту',
  Pärnu: 'Пярну',
  'Kohtla-Järve': 'Кохтла-Ярве',
  Sillamäe: 'Силламяэ',
  Jõhvi: 'Йыхви',
  Maardu: 'Маарду',
  'Narva-Jõesuu': 'Нарва-Йыэсуу',
  Rakvere: 'Раквере',
  Paldiski: 'Палдиски',
  Kiviõli: 'Кивиыли',
  Viljandi: 'Вильянди',
  Valga: 'Валга',
};

const RU_TOWNS = new Set([
  'Narva',
  'Sillamäe',
  'Narva-Jõesuu',
  'Kohtla-Järve',
  'Jõhvi',
  'Maardu',
  'Paldiski',
  'Kiviõli',
  'Püssi',
  'Kallaste',
  'Mustvee',
]);

// ── Russian place names ──────────────────────────────────────────────────────
// Russian speakers in Estonia keep the Estonian names (written here in Latin script) and say the
// street type in Russian when there is a common word for it ("улица Pikk", "площадь Viru",
// "проспект Kangelaste"); "tee", "maantee" and "puiestee" stay part of the name ("Laagna tee").

/** Street types said in Russian before the name: nominative and genitive ("в сторону улицы Pikk"). */
const RU_STREET_TYPE: Record<string, [string, string]> = {
  tn: ['улица', 'улицы'],
  tänav: ['улица', 'улицы'],
  pl: ['площадь', 'площади'],
  plats: ['площадь', 'площади'],
  väljak: ['площадь', 'площади'],
  prospekt: ['проспект', 'проспекта'],
  põik: ['переулок', 'переулка'],
  allee: ['аллея', 'аллеи'],
};
/** Street types that stay Estonian, abbreviations spoken out. */
const ET_STREET_TYPE: Record<string, string> = {
  pst: 'puiestee',
  puiestee: 'puiestee',
  mnt: 'maantee',
  maantee: 'maantee',
  tee: 'tee',
};
const STREET_RE =
  /^(.+?) (tn|tänav|pst|puiestee|mnt|maantee|tee|pl|plats|väljak|prospekt|põik|allee)(?: (\d+\w*)(?:-(\d+\w*))?)?$/;

/** A street as a Russian speaker names it: "Pikk tn" → "улица Pikk" (genitive "улицы Pikk"), "Narva mnt" → "Narva maantee". */
export function ruStreet(name: string, genitive = false): string {
  const m = STREET_RE.exec(name.trim());
  if (!m || m[3]) return name.trim();
  const ru = RU_STREET_TYPE[m[2]];
  return ru ? `${ru[genitive ? 1 : 0]} ${m[1]}` : `${m[1]} ${ET_STREET_TYPE[m[2]]}`;
}

/** Other address parts a Russian speaker says in Russian ("Varangu küla" → "деревня Varangu"). */
const RU_ADDRESS_PART: [RegExp, string][] = [
  [/^(.+) küla$/, 'деревня $1'],
  [/^(.+) alevik$/, 'посёлок $1'],
  [/^(.+) alev$/, 'посёлок $1'],
  [/^(.+) maakond$/, 'уезд $1'],
  [/^(.+) vald$/, 'волость $1'],
  [/^(.+) talu$/, 'хутор $1'],
  [/^(.+) AÜ$/, 'садовое товарищество $1'],
  [/^krunt (\d+)$/, 'участок $1'],
  [/^(.+) sadam$/, 'порт $1'],
  [/^(.+) järv$/, 'озеро $1'],
  [/^(.+) raba$/, 'болото $1'],
  [/^(.+) rahvuspark$/, 'национальный парк $1'],
  [/^(\d+)\. km$/, '$1-й километр'],
];

/** "Pikk tn 12-45" → "улица Pikk, дом 12, квартира 45"; "Tallinna-Narva mnt (E20), 85. km" → "трасса Tallinna-Narva (E20), 85-й километр". */
export function ruAddress(address: string): string {
  const house = (n?: string, flat?: string) => (n ? `, дом ${n}` : '') + (flat ? `, квартира ${flat}` : '');
  return address
    .split(', ')
    .map((part) => {
      let m = STREET_RE.exec(part);
      if (m) return ruStreet(`${m[1]} ${m[2]}`) + house(m[3], m[4]);
      m = /^(.+?) (?:maantee|mnt) (\([\w-]+\))$/.exec(part);
      if (m) return `трасса ${m[1]} ${m[2]}`;
      // One-word streets: "Toompuiestee 35", "Keskallee 35-9", "Keskväljak 6".
      m = /^(\S+(?:puiestee|allee|väljak|tee|tänav)) (\d+\w*)(?:-(\d+\w*))?$/.exec(part);
      if (m) return m[1] + house(m[2], m[3]);
      for (const [re, to] of RU_ADDRESS_PART) if (re.test(part)) return part.replace(re, to);
      return part;
    })
    .join(', ');
}

// ── Russian clothing ─────────────────────────────────────────────────────────
// Clothing is generated Estonian text (gen/person.ts makeClothing): "seljas must talvejope, jalas
// sinised teksad, peas hall kootud müts". A Russian caller says it after "в" in the prepositional:
// "в чёрной зимней куртке, синих джинсах и серой вязаной шапке".

type RuGn = 'm' | 'f' | 'n' | 'pl';
/** Estonian colour (singular and plural) → Russian prepositional stem; '' = "цвета хаки" after the noun. */
const CLOTH_COLOR: [string, string, string][] = [
  ['must', 'mustad', 'чёрн'],
  ['valge', 'valged', 'бел'],
  ['tumehall', 'tumehallid', 'тёмно-сер'],
  ['hall', 'hallid', 'сер'],
  ['tumesinine', 'tumesinised', 'тёмно-син'],
  ['helesinine', 'helesinised', 'голуб'],
  ['sinine', 'sinised', 'син'],
  ['bordoopunane', 'bordoopunased', 'бордов'],
  ['punane', 'punased', 'красн'],
  ['tumeroheline', 'tumerohelised', 'тёмно-зелён'],
  ['oliivroheline', 'oliivrohelised', 'оливков'],
  ['roheline', 'rohelised', 'зелён'],
  ['pruun', 'pruunid', 'коричнев'],
  ['beež', 'beežid', 'бежев'],
  ['kollane', 'kollased', 'жёлт'],
  ['oranž', 'oranžid', 'оранжев'],
  ['lilla', 'lillad', 'фиолетов'],
  ['roosa', 'roosad', 'розов'],
  ['khakivärvi', 'khakivärvi', ''],
];
/** Garment → Russian prepositional noun phrase and its gender. */
const CLOTH_GARMENT: Record<string, [string, RuGn]> = {
  talvejope: ['зимней куртке', 'f'],
  sulejope: ['пуховике', 'm'],
  parka: ['парке', 'f'],
  'villane mantel': ['шерстяном пальто', 'n'],
  'kerge jope': ['лёгкой куртке', 'f'],
  tuulejope: ['ветровке', 'f'],
  nahkjope: ['кожаной куртке', 'f'],
  teksajakk: ['джинсовой куртке', 'f'],
  'kapuutsiga pusa': ['толстовке с капюшоном', 'f'],
  vihmajope: ['дождевике', 'm'],
  mantel: ['пальто', 'n'],
  kampsun: ['свитере', 'm'],
  'T-särk': ['футболке', 'f'],
  polosärk: ['рубашке поло', 'f'],
  triiksärk: ['рубашке', 'f'],
  pluus: ['блузке', 'f'],
  topp: ['топе', 'm'],
  kleit: ['платье', 'n'],
  teksad: ['джинсах', 'pl'],
  püksid: ['брюках', 'pl'],
  dressipüksid: ['спортивных штанах', 'pl'],
  'lühikesed püksid': ['шортах', 'pl'],
  retuusid: ['леггинсах', 'pl'],
  seelik: ['юбке', 'f'],
  'kootud müts': ['вязаной шапке', 'f'],
  nokamüts: ['кепке', 'f'],
};

/** Prepositional adjective ending for a stem: "чёрн" + f → "чёрной", "син" + pl → "синих". */
function ruPrepAdj(stem: string, g: RuGn): string {
  const soft = /син$/.test(stem);
  if (g === 'f') return stem + (soft ? 'ей' : 'ой');
  if (g === 'pl') return stem + (soft || /[кгхжшчщ]$/.test(stem) ? 'их' : 'ых');
  return stem + (soft ? 'ем' : 'ом');
}

/** "must talvejope" → "чёрной зимней куртке"; undefined when the words are not known. */
function ruGarment(et: string): string | undefined {
  for (const [sg, pl, stem] of CLOTH_COLOR) {
    for (const c of [sg, pl]) {
      if (!et.startsWith(`${c} `)) continue;
      const g = CLOTH_GARMENT[et.slice(c.length + 1)];
      if (!g) return undefined;
      return stem ? `${ruPrepAdj(stem, g[1])} ${g[0]}` : `${g[0]} цвета хаки`;
    }
  }
  return undefined;
}

/** Generated Estonian clothing in Russian ("в чёрной куртке и синих джинсах"); undefined if any part is unknown. */
export function ruClothing(et: string | undefined): string | undefined {
  if (!et?.trim()) return undefined;
  const items: string[] = [];
  let hood = false;
  for (const part of et.split(', ')) {
    if (part === 'kapuuts peas') {
      hood = true;
      continue;
    }
    const m = /^(seljas|jalas|peas) (.+)$/.exec(part);
    if (!m) return undefined;
    for (const g of m[2].split(' ja ')) {
      const ru = ruGarment(g);
      if (!ru) return undefined;
      items.push(ru);
    }
  }
  if (!items.length) return undefined;
  const list =
    items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`;
  return `в ${list}${hood ? ', капюшон на голове' : ''}`;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Deterministic 0..1 value per incident & key (keeps repeated answers consistent). */
function h01(inc: Incident, key: string): number {
  return hashString(`${inc.id}:${key}`) / 4294967296;
}

function low(s: string): string {
  return s.toLowerCase();
}

function textOf(tpl: IncidentTemplate | undefined, inc: Incident): string {
  return low(
    `${tpl?.id ?? inc.templateId} ${tpl?.title.et ?? inc.title.et} ${(tpl?.tags ?? inc.tags).join(' ')}`,
  );
}

function personByRole(s: SimState, inc: Incident, ...roles: string[]): Person | undefined {
  for (const role of roles) {
    const ref = inc.persons.find((r) => r.role === role);
    if (ref && s.persons[ref.personId]) return s.persons[ref.personId];
  }
  return undefined;
}

function callerPerson(s: SimState, inc: Incident): Person | undefined {
  const id = inc.caller?.personId;
  if (id && s.persons[id]) return s.persons[id];
  return personByRole(s, inc, 'caller');
}

function suspectVehicle(s: SimState, inc: Incident): Vehicle | undefined {
  const ref =
    inc.vehicles.find((v) => v.role === 'suspect') ??
    inc.vehicles.find((v) => v.role === 'involved') ??
    inc.vehicles[0];
  if (!ref) return undefined;
  return (
    s.vehicles[ref.plate] ??
    Object.values(s.vehicles).find((v) => v.plate.replace(/\s/g, '') === ref.plate.replace(/\s/g, ''))
  );
}

/**
 * Map an incident to a phrasebook situation: the curated per-template entry first, then a keyword
 * guess for templates added later. A guess that would make a calm event sound like an emergency
 * (or the other way round) falls back to a neutral line, so the caller never misleads the
 * priority classification.
 */
export function situationOf(inc: Incident, tpl?: IncidentTemplate, s?: SimState): Situation {
  const mapped = SITUATION_BY_TEMPLATE[tpl?.id ?? inc.templateId];
  if (mapped) return mapped;
  const sit = guessSituation(inc, tpl, s);
  if (bandFits(sit, inc.truePriority)) return sit;
  return inc.truePriority <= 2 ? 'emergency' : 'generic';
}

function guessSituation(
  inc: Incident,
  tpl: IncidentTemplate | undefined,
  s: SimState | undefined,
): Situation {
  const txt = textOf(tpl, inc);
  const tags = new Set(tpl?.tags ?? inc.tags);
  const has = (...w: string[]) => w.some((x) => txt.includes(x));
  const urgent = inc.truePriority <= 2;
  const gun = tags.has('weapon_gun') || has('tulist', 'shoot');
  const knife = tags.has('weapon_knife') || has('puss', 'nuga', 'knife');
  switch (inc.category) {
    case 'domestic': {
      if (!urgent) return has('jälit', 'ahist', 'stalk') ? 'harassment' : 'domestic_argument';
      if (knife) return 'domestic';
      const neighbourCaller =
        (tpl?.persons ?? []).some((p) => p.role === 'caller' && p.relation === 'neighbour') ||
        has('naab', 'neighbour');
      return neighbourCaller ? 'domestic_neighbour' : 'domestic';
    }
    case 'violence':
      if (gun) return 'shots';
      if (knife) return 'knife';
      if (!urgent)
        return has('ähvard', 'threat') ? 'threat' : has('jälit', 'stalk') ? 'stalking' : 'assault_minor';
      return 'fight';
    case 'public_order':
      if (!urgent && has('öörahu', 'müra', 'lärm', 'noise', 'muusika', 'pidu')) return 'noise';
      if (has('joob', 'purjus', 'drunk'))
        return has('lamab', 'lebab', 'lying') ? 'drunk_lying' : 'drunk_person';
      if (knife) return 'knife';
      if (has('kahtlane', 'suspicious', 'pildistab')) return 'suspicious';
      return urgent ? 'aggressive_person' : 'dispute';
    case 'property':
      if (has('rööv', 'robbery')) return gun || tags.has('armed') ? 'armed_robbery' : 'robbery';
      if (has('autost', 'from_car')) return 'theft_from_car';
      if (has('auto', 'sõiduk', 'car_theft')) return 'car_theft';
      if (has('pood', 'kauplus', 'shoplift')) return 'shoplift';
      if (has('sissemurd', 'murdvargus', 'burglary', 'korteri', 'suvila'))
        return urgent || tags.has('in_progress') ? 'burglary_progress' : 'burglary';
      if (has('vandal', 'lõhu', 'grafiti')) return urgent ? 'vandalism' : 'vandalism_after';
      return urgent ? 'theft_progress' : 'theft_after';
    case 'traffic':
      if (has('joobes juh', 'joobes_juh', 'purjus juh', 'purjus auto', 'autorool', 'joobes koju', 'drunk'))
        return urgent ? 'drunk_driver' : 'drunk_driver_home';
      if (has('õnnetus', 'avarii', 'kokkupõrge', 'accident', 'crash', 'jalakäija'))
        return urgent ? 'accident' : 'fender_bender';
      if (has('põder', 'põdra', 'elk', 'moose')) return 'elk_road';
      if (has('loom', 'hobune', 'animal')) return 'animal_road';
      if (has('kihut', 'ralli', 'racing', 'speed')) return 'racing';
      return 'traffic';
    case 'drugs':
      if (has('üledoos', 'overdose')) return 'overdose';
      if (has('süstal', 'syringe')) return 'syringes';
      if (has('lõhn', 'smell', 'kanep', 'cannabis')) return 'drug_smell';
      if (has('leitud', 'found')) return 'drug_found';
      return urgent ? 'drugged_person' : 'drug_dealing';
    case 'missing': {
      if (has('dement')) return 'missing_dementia';
      if (has('ujuja', 'upp', 'drown')) return 'drowning';
      const m = s ? personByRole(s, inc, 'missing', 'victim') : undefined;
      if (
        (m && s && safe(() => ageOf(m, s.now), 30) < 14) ||
        has('laps', 'child', 'koolilaps', 'poeg', 'tütar', 'teismeline')
      )
        return 'missing_child';
      if (has('mets', 'forest', 'seen')) return 'lost_forest';
      return 'missing_adult';
    }
    case 'alarm':
      return 'alarm';
    case 'assist':
      if (has('koer', 'dog')) return 'dog';
      if (has('hobune', 'horse')) return 'horse_road';
      if (has('põder', 'põdra', 'metsloom', 'elk')) return 'elk_road';
      if (has('loom', 'animal')) return 'animal_road';
      if (has('enesetap', 'suitsiid', 'suicid')) return 'suicide';
      if (has('surnu', 'surnud', 'dead')) return 'found_body';
      if (has('gaas', 'gas')) return 'gas';
      if (has('tulekahju', 'põleng', 'sütti', 'fire')) return 'fire';
      if (has('laps', 'child')) return urgent ? 'child_alone' : 'child_screams';
      return urgent ? 'unwell' : 'person_lying';
    case 'fraud':
      if (has('võlts', 'counterfeit')) return has('dokument', 'pass', 'document') ? 'forgery' : 'counterfeit';
      if (has('küber', 'cyber')) return 'cyber';
      if (has('takso', 'taxi', 'palk', 'wage')) return 'fraud_generic';
      return 'scam';
    case 'border':
      if (has('droon', 'drone')) return 'drone';
      if (has('paat', 'boat')) return 'border_boat';
      if (has('salavedu', 'smuggl', 'salakaub')) return 'smuggling';
      if (has('dokument', 'pass', 'document')) return 'border_check';
      return 'border_crossing';
    case 'environment':
      if (has('reost', 'pollut', 'õli')) return 'pollution';
      if (has('prügi', 'waste', 'dump')) return 'dumping';
      if (has('raie', 'logging')) return 'logging';
      if (has('salakütt', 'poach', 'jaht')) return 'poaching';
      if (has('kalast', 'fishing', 'võrk')) return 'illegal_fishing';
      if (has('lõke', 'tuli', 'fire')) return 'fire_outdoor';
      if (has('koer', 'loom', 'animal', 'hunt', 'põder', 'wolf')) return 'wildlife';
      return 'suspicious';
    case 'major':
      if (has('pomm', 'lõhke', 'bomb', 'pakk'))
        return has('ähvard', 'threat') ? 'bomb_threat' : 'suspicious_item';
      if (has('pantvang', 'hostage', 'kaaper')) return 'hostage';
      if (gun || has('relv')) return 'shots';
      if (has('põgen', 'escape')) return 'escape';
      if (has('mäss', 'riot')) return has('vangla', 'prison') ? 'prison_riot' : 'riot';
      if (has('leke', 'kemik', 'hazmat', 'leak')) return 'hazard';
      if (has('tulekahju', 'fire')) return 'fire';
      if (has('õnnetus', 'accident', 'crash', 'tungle')) return 'major_accident';
      return 'emergency';
    case 'easter':
      return has('ufo', 'tulnuk', 'alien') ? 'ufo' : 'easter';
  }
  return 'generic';
}

// ── Descriptions ─────────────────────────────────────────────────────────────

const BUILD: Record<Appearance['build'], Phrase> = {
  slim: P('худой', 'sale', 'slim'),
  average: P('среднего телосложения', 'keskmise kehaehitusega', 'average build'),
  athletic: P('спортивного телосложения', 'sportliku kehaehitusega', 'athletic build'),
  heavy: P('плотный', 'tugeva kehaehitusega', 'heavy build'),
};
const HAIR_COLOR: Record<Appearance['hairColor'], Phrase> = {
  black: P('тёмные', 'tumedad', 'dark'),
  brown: P('каштановые', 'pruunid', 'brown'),
  blond: P('светлые', 'heledad', 'blond'),
  red: P('рыжие', 'punased', 'red'),
  grey: P('седые', 'hallid', 'grey'),
  white: P('белые', 'valged', 'white'),
  dyed: P('крашеные', 'värvitud', 'dyed'),
};
const BEARD: Record<NonNullable<Appearance['beard']>, Phrase> = {
  stubble: P('небритый', 'habemetüükaga', 'stubble'),
  full: P('с бородой', 'täishabemega', 'full beard'),
  moustache: P('с усами', 'vuntsidega', 'moustache'),
  goatee: P('с бородкой', 'kitsehabemega', 'goatee'),
};

function hairPhrase(a: Appearance): Phrase {
  const c = HAIR_COLOR[a.hairColor];
  switch (a.hair) {
    case 'bald':
      return P('лысый', 'kiilakas', 'bald');
    case 'shaved':
      return P('бритая голова', 'kiilaks aetud peaga', 'shaved head');
    case 'buzz':
      return P(
        `короткая стрижка, ${c.ru} волосы`,
        `siilisoenguga, ${c.et} juuksed`,
        `buzz cut, ${c.en} hair`,
      );
    case 'long':
      return P(`длинные ${c.ru} волосы`, `pikad ${c.et} juuksed`, `long ${c.en} hair`);
    case 'ponytail':
      return P(`${c.ru} волосы в хвосте`, `${c.et} juuksed hobusesabas`, `${c.en} hair in a ponytail`);
    case 'curly':
      return P(`кудрявые ${c.ru} волосы`, `lokkis ${c.et} juuksed`, `curly ${c.en} hair`);
    default:
      return P(`короткие ${c.ru} волосы`, `lühikesed ${c.et} juuksed`, `short ${c.en} hair`);
  }
}

/**
 * Witness-style description in all three languages from the appearance enums. The clothing is
 * generated Estonian text; it is added when `withClothing`, and for a Russian caller (`ru`) only
 * when it can be said in Russian too (ruClothing), so the original and the translation agree.
 */
export function witnessDescription(p: Person, now: number, withClothing = true, ru = false): Phrase {
  const a = p.appearance;
  const age = Math.max(5, Math.round(safe(() => ageOf(p, now), 35) / 5) * 5);
  const male = p.gender === 'M';
  const parts: Phrase[] = [
    male
      ? P(`мужчина, лет ${age}`, `mees, umbes ${age}-aastane`, `a man, about ${age}`)
      : P(`женщина, лет ${age}`, `naine, umbes ${age}-aastane`, `a woman, about ${age}`),
  ];
  if (a) {
    const hgt = Math.round(a.heightCm / 5) * 5;
    parts.push(P(`рост около ${hgt}`, `u ${hgt} cm pikk`, `around ${hgt} cm`));
    const b = BUILD[a.build];
    parts.push(
      male
        ? b
        : a.build === 'slim'
          ? P('худая', b.et, b.en)
          : a.build === 'heavy'
            ? P('плотная', b.et, b.en)
            : b,
    );
    const hair = hairPhrase(a);
    parts.push(!male && a.hair === 'bald' ? P('лысая', hair.et, hair.en) : hair);
    if (a.beard && male) parts.push(BEARD[a.beard]);
    if (a.glasses) parts.push(P('в очках', 'prillidega', 'glasses'));
  }
  const out = P(
    parts.map((x) => x.ru).join(', '),
    parts.map((x) => x.et).join(', '),
    parts.map((x) => x.en).join(', '),
  );
  const clothesRu = ruClothing(a?.clothing?.et);
  if (withClothing && a?.clothing?.et && (clothesRu || !ru)) {
    if (clothesRu) out.ru += `, ${clothesRu}`;
    out.et += /^(seljas|jalas|peas|kannab)/i.test(a.clothing.et)
      ? `; ${a.clothing.et}`
      : `, seljas ${a.clothing.et}`;
    out.en += /^(wearing|in |dressed)/i.test(a.clothing.en)
      ? `; ${a.clothing.en}`
      : `, wearing ${a.clothing.en}`;
  }
  return out;
}

const COLOR_RU: [RegExp, string][] = [
  [/tumesinine/, 'тёмно-синий'],
  [/helesinine/, 'голубой'],
  [/tumehall/, 'тёмно-серый'],
  [/tumeroheline/, 'тёмно-зелёный'],
  [/sinine/, 'синий'],
  [/must/, 'чёрный'],
  [/valge/, 'белый'],
  [/hõbe/, 'серебристый'],
  [/hall/, 'серый'],
  [/punane/, 'красный'],
  [/bordoo|veinipunane/, 'бордовый'],
  [/roheline/, 'зелёный'],
  [/kollane/, 'жёлтый'],
  [/oranž/, 'оранжевый'],
  [/pruun/, 'коричневый'],
  [/beež/, 'бежевый'],
  [/lilla/, 'фиолетовый'],
  [/kuldne/, 'золотистый'],
];

/** Car makes Russian speakers treat as feminine ("серая Toyota", like "машина"); the others are masculine ("серый Volkswagen"). */
const RU_FEMININE_MAKE =
  /^(Toyota|Mazda|Honda|Škoda|Skoda|Lada|Kia|Audi|Volvo|Dacia|Tesla|Subaru|Suzuki|Mitsubishi|Cupra)$/;
/** Vehicles other than cars are named by their kind ("белый бус Ford Transit"). */
const RU_VEHICLE_KIND: Partial<Record<Vehicle['kind'], string>> = {
  van: 'бус',
  truck: 'грузовик',
  bus: 'автобус',
  moto: 'мотоцикл',
  moped: 'мопед',
  quad: 'квадроцикл',
};

function vehiclePhrase(v: Vehicle): Phrase {
  const colorEt = low(v.color.et);
  let ru = COLOR_RU.find(([re]) => re.test(colorEt))?.[1] ?? '';
  const kind = RU_VEHICLE_KIND[v.kind];
  if (ru && !kind && RU_FEMININE_MAKE.test(v.make)) ru = ru.replace(/ий$/, 'яя').replace(/[ыо]й$/, 'ая');
  const et = safe(() => describeVehicle(v), {
    et: `${colorEt} ${v.make} ${v.model}`,
    en: `${low(v.color.en)} ${v.make} ${v.model}`,
  });
  // describeVehicle may already include the plate in parentheses; strip it for the "car" slot.
  const strip = (x: string) => x.replace(/\s*\([^)]*\)\s*$/, '');
  return P([ru, kind, v.make, v.model].filter(Boolean).join(' '), strip(et.et), strip(et.en));
}

function partialPlate(plate: string, u: number): string {
  const m = /^(\d+)\s*([A-ZÕÄÖÜŠŽ]+)$/i.exec(plate.trim());
  if (!m) return plate.slice(0, 2) + '…';
  return u < 0.5 ? `${m[1]}…` : `${m[1][0]}… ${m[2]}`;
}

function directionPhrase(s: SimState, inc: Incident): Phrase {
  const region = safe(() => regionOf(s), undefined);
  const street = inc.location.address.split(/\s\d/)[0];
  const streets = (region?.streets ?? []).filter((x) => x.city === inc.location.city && x.name !== street);
  if (streets.length > 0) {
    const st = streets[Math.floor(h01(inc, 'dir') * streets.length)];
    // Estonian "suunas" takes the genitive, and a caller says the street type in full: "Pika tänava suunas";
    // Russian "в сторону" too: "в сторону улицы Pikk".
    return P(ruStreet(st.name, true), spokenStreetGenitive(st.name), st.name);
  }
  const opts: Phrase[] = [
    P('центра', 'kesklinna', 'the town centre'),
    P('железной дороги', 'raudtee', 'the railway'),
    P('леса', 'metsa', 'the forest'),
    P('трассы', 'maantee', 'the main road'),
    P('моря', 'mere', 'the sea'),
  ];
  return opts[Math.floor(h01(inc, 'dir') * opts.length)];
}

// ── Facts ────────────────────────────────────────────────────────────────────

interface Facts {
  injured: 'yes' | 'no' | 'unknown';
  weapon: 'knife' | 'gun' | 'maybe' | 'none';
  count: number;
  children: boolean;
  intoxicated: 'yes' | 'no' | 'unknown';
  inProgress: boolean;
  fled: boolean;
  byCar: boolean;
  minutesAgo: number;
}

/** Situations whose lines name a firearm or a knife: the weapon answer must agree. */
const GUN_SITUATIONS = new Set<Situation>(['shots', 'gun_threat', 'armed_robbery', 'weapon_deal']);
/** The person the caller talks about has left the scene. */
const FLED_SITUATIONS = new Set<Situation>([
  'scam_door',
  'hit_and_run',
  'abduction',
  'escape',
  'fleeing_vehicle',
  'street_robbery',
  'robbery',
]);
/** The person the caller talks about is still there (held, locked in, at the door, lying on the ground…). */
const STAYED_SITUATIONS = new Set<Situation>([
  'shoplift',
  'fare_refusal',
  'hostage',
  'barricaded',
  'prison_riot',
  'held_captive',
  'order_breach',
  'domestic',
  'domestic_child',
  'domestic_neighbour',
  'aggressive_person',
  'drunk_person',
  'drunk_lying',
  'person_lying',
  'person_on_road',
  'pestering',
  'suicide',
  'driver_asleep',
  'drugged_person',
]);

function factsOf(inc: Incident, tpl: IncidentTemplate | undefined, sit: Situation): Facts {
  const tags = new Set([...(tpl?.tags ?? []), ...inc.tags]);
  const txt = textOf(tpl, inc);
  const kiirabi =
    inc.agencyNeeds.some((a) => a.agency === 'kiirabi') ||
    (tpl?.agencies ?? []).some((a) => a.agency === 'kiirabi' && a.chance >= 0.5);
  const injuredTag = tags.has('injury') || tags.has('injured') || tags.has('stabbing');
  let injured: Facts['injured'] = 'no';
  if (kiirabi || injuredTag) injured = 'yes';
  else if (
    (inc.category === 'violence' || inc.category === 'domestic' || inc.category === 'major') &&
    inc.truePriority <= 2
  )
    injured = h01(inc, 'inj') < 0.5 ? 'yes' : 'unknown';
  else if (inc.category === 'traffic' && txt.includes('õnnetus'))
    injured = h01(inc, 'inj') < 0.35 ? 'yes' : 'no';

  let weapon: Facts['weapon'] = 'none';
  if (tags.has('weapon_gun') || GUN_SITUATIONS.has(sit)) weapon = 'gun';
  else if (tags.has('weapon_knife') || sit === 'knife') weapon = 'knife';
  else if (tags.has('armed') || tags.has('weapon')) weapon = h01(inc, 'wpn') < 0.5 ? 'maybe' : 'knife';
  else if ((inc.category === 'domestic' || inc.category === 'violence') && h01(inc, 'wpn') < 0.12)
    weapon = 'maybe';

  const suspects = inc.persons.filter((r) => r.role === 'suspect').length;
  let count = Math.max(1, suspects + inc.persons.filter((r) => r.role === 'victim').length);
  if (tags.has('group') || tags.has('gang')) count = 3 + Math.floor(h01(inc, 'cnt') * 4);
  if (tags.has('crowd') || tags.has('mass')) count = 25;

  const childSpec = (tpl?.persons ?? []).some((p) => p.relation === 'child' || (p.age && p.age[1] < 14));
  const children =
    childSpec ||
    tags.has('children') ||
    tags.has('child') ||
    (inc.category === 'domestic' && h01(inc, 'kids') < 0.4);

  const intoxChance = Math.max(
    0,
    ...(tpl?.persons ?? [])
      .filter((p) => p.role === 'suspect' || p.role === 'driver')
      .map((p) => p.intoxicated ?? 0),
  );
  let intoxicated: Facts['intoxicated'] = 'unknown';
  if (
    tags.has('drunk') ||
    tags.has('alcohol') ||
    tags.has('intoxicated') ||
    txt.includes('joob') ||
    txt.includes('purjus')
  )
    intoxicated = 'yes';
  else if (intoxChance > 0)
    intoxicated = h01(inc, 'intox') < intoxChance ? 'yes' : h01(inc, 'intox2') < 0.5 ? 'no' : 'unknown';
  else if (inc.category === 'fraud' || inc.category === 'missing' || inc.category === 'alarm')
    intoxicated = 'no';

  const inProgress = inc.truePriority <= 2 || tags.has('in_progress');
  // A suspect the caller is holding (shop security, a taxi driver with a passenger) has not fled anywhere.
  const scriptTxt = low(
    [...(tpl?.call?.opening ?? []), ...(tpl?.callerLines ?? [])].map((l) => l.et).join(' '),
  );
  const held =
    tags.has('detained') ||
    /hoiab teda kinni|hoiame teda|kinni peetud|pidasime kinni|turvaruum|lukustanud uksed/.test(scriptTxt);
  const fled =
    !held &&
    !STAYED_SITUATIONS.has(sit) &&
    (FLED_SITUATIONS.has(sit) ||
      tags.has('fled') ||
      tags.has('vehicle_flee') ||
      tags.has('escaped') ||
      tags.has('bolo') ||
      inc.category === 'property' ||
      (inc.category === 'violence' && h01(inc, 'fled') < 0.4));
  const byCar = tags.has('vehicle_flee') || inc.vehicles.some((v) => v.role === 'suspect');
  const minutesAgo = inProgress
    ? 0
    : inc.truePriority === 3
      ? 10 + Math.floor(h01(inc, 'ago') * 35)
      : 30 + Math.floor(h01(inc, 'ago') * 150);
  return { injured, weapon, count, children, intoxicated, inProgress, fled, byCar, minutesAgo };
}

/**
 * Placeholder values for template lines a CALLER speaks: spoken forms, not card notation (a witness
 * description instead of "mees, 35a", the place without its bracketed qualifier).
 */
function varsFor(s: SimState, inc: Incident): Vars {
  const suspect = personByRole(s, inc, 'suspect', 'missing');
  const victim = personByRole(s, inc, 'victim');
  const v = suspectVehicle(s, inc);
  // Template lines start a sentence with {suspect} ("{suspect}. Valged tossud."), hence capitalised.
  const spoken = (p: Person | undefined): Text | undefined => {
    if (!p) return undefined;
    const w = witnessDescription(p, s.now, true);
    return { et: cap1(w.et), en: cap1(w.en) };
  };
  const celebRef = inc.persons.find((x) => x.personId.startsWith(CELEB_PREFIX));
  const celeb = celebRef ? s.persons[celebRef.personId] : undefined;
  return {
    address: inc.location.address,
    place: spokenPlaceLabel(inc.location),
    city: inc.location.city,
    district: inc.location.district ?? inc.location.city,
    suspect: spoken(suspect),
    suspectName: suspect ? `${suspect.firstName} ${suspect.lastName}` : undefined,
    victim: spoken(victim),
    victimName: victim ? `${victim.firstName} ${victim.lastName}` : undefined,
    caller: inc.caller?.name,
    plate: v?.plate ?? inc.vehicles[0]?.plate,
    car: v ? { et: vehiclePhrase(v).et, en: vehiclePhrase(v).en } : undefined,
    n: String(Math.max(2, inc.persons.length)),
    time: hhmm(inc.createdAt),
    direction: (() => {
      const d = directionPhrase(s, inc);
      return { et: `${d.et} suunas`, en: `towards ${d.en}` };
    })(),
    age: suspect ? String(safe(() => ageOf(suspect, s.now), 35)) : undefined,
    celeb: celeb ? knownName(celeb) : undefined,
    celebFor: celeb ? celebrityDef(celeb.id)?.knownAs : undefined,
  };
}

/** Fill a template line the caller speaks; the first letter is capitalised ("{car}, number {plate}."). */
function fillCaller(t: Text, s: SimState, inc: Incident): Text {
  const f = fillText(t, varsFor(s, inc));
  return { et: cap1(f.et), en: cap1(f.en) };
}

/**
 * The same placeholders as a Russian-speaking caller says them (openingRu, answersRu): the address
 * with Russian street types and cases, the town's Russian name, the vehicle and the suspect in
 * Russian, the direction after "в сторону".
 */
function varsRu(s: SimState, inc: Incident): Vars {
  const suspect = personByRole(s, inc, 'suspect', 'missing');
  const victim = personByRole(s, inc, 'victim');
  const v = suspectVehicle(s, inc);
  const spoken = (p: Person | undefined) =>
    p ? cap1(witnessDescription(p, s.now, true, true).ru) : undefined;
  const place = spokenPlace(inc.location)?.ru;
  const celebRef = inc.persons.find((x) => x.personId.startsWith(CELEB_PREFIX));
  const celeb = celebRef ? s.persons[celebRef.personId] : undefined;
  return {
    address: ruAddress(inc.location.address),
    place: place ? cap1(place) : ruAddress(inc.location.address),
    city: RU_CITY[inc.location.city] ?? inc.location.city,
    district: inc.location.district ?? RU_CITY[inc.location.city] ?? inc.location.city,
    suspect: spoken(suspect),
    suspectName: suspect ? `${suspect.firstName} ${suspect.lastName}` : undefined,
    victim: spoken(victim),
    victimName: victim ? `${victim.firstName} ${victim.lastName}` : undefined,
    caller: inc.caller?.name,
    plate: v?.plate ?? inc.vehicles[0]?.plate,
    car: v ? vehiclePhrase(v).ru : undefined,
    n: String(Math.max(2, inc.persons.length)),
    time: hhmm(inc.createdAt),
    direction: `в сторону ${directionPhrase(s, inc).ru}`,
    age: suspect ? String(safe(() => ageOf(suspect, s.now), 35)) : undefined,
    celeb: celeb ? knownName(celeb) : undefined,
  };
}

/** Fill a Russian line the caller speaks (the original of a scripted line); the first letter is capitalised. */
function fillRu(line: string, s: SimState, inc: Incident): string {
  const vars = varsRu(s, inc);
  // A value that starts a sentence ("...третьего этажа. {address}.") is capitalised; "..." continues one.
  const out = line.replace(/\{(\w+)\}/g, (m, k: string, at: number) => {
    const v = vars[k];
    if (v === undefined) return m;
    const val = typeof v === 'string' ? v : v.et;
    return /(^|[^.][.!?])\s*$/.test(line.slice(0, at)) ? cap1(val) : val;
  });
  return cap1(out);
}

/** Fill {placeholders}; a value of '§' is replaced per language from `per` (e.g. a vehicle description). */
function fillPhrase(p: Phrase, vars: Record<string, string>, per?: Phrase): Phrase {
  const f = (x: string, lang: keyof Phrase) =>
    x.replace(/\{(\w+)\}/g, (m, k: string) => {
      const v = vars[k];
      if (v === undefined) return m;
      return v === '§' && per ? per[lang] : v;
    });
  return { ru: f(p.ru, 'ru'), et: f(p.et, 'et'), en: f(p.en, 'en') };
}

function capPhrase(p: Phrase): Phrase {
  return { ru: cap1(p.ru), et: cap1(p.et), en: cap1(p.en) };
}

// ── Mood & language ──────────────────────────────────────────────────────────

/** Situations reported by someone calling in a professional role. */
const PROFESSIONAL_SITUATIONS = new Set<Situation>([
  'ambulance_help',
  'child_injured',
  'customs',
  'border_check',
  'prison_riot',
  'escape',
  'missing_patient',
  'child_not_collected',
  'cyber',
  'sabotage',
  'drone',
]);

function deriveMood(s: SimState, inc: Incident, tpl: IncidentTemplate | undefined, rng: Rng): CallerMood {
  if (tpl?.call?.mood) return tpl.call.mood;
  const caller = callerPerson(s, inc);
  const age = caller ? safe(() => ageOf(caller, s.now), 40) : 40;
  if (age < 14) return 'child';
  const victim = personByRole(s, inc, 'victim', 'missing');
  const victimAge = victim ? safe(() => ageOf(victim, s.now), 30) : 30;
  if (victimAge < 12 && caller === undefined && rng.chance(0.25)) return 'child';
  if (age >= 72)
    return inc.category === 'missing' || rng.chance(0.25)
      ? rng.chance(0.7)
        ? 'elderly'
        : 'confused'
      : 'elderly';
  // Paramedics, customs officers, prison and hospital staff report calmly (and never drunk).
  if (PROFESSIONAL_SITUATIONS.has(situationOf(inc, tpl, s))) return 'calm';
  const hour = wall(s.now).hour;
  const night = hour >= 22 || hour < 5;
  if (inc.truePriority === 1) {
    if ((inc.category === 'domestic' || situationOf(inc, tpl, s) === 'burglary_progress') && rng.chance(0.3))
      return 'whisper';
    return rng.chance(0.75) ? 'panic' : 'calm';
  }
  if (inc.category === 'domestic' && inc.truePriority === 2 && rng.chance(0.35)) return 'panic';
  if (night && inc.category === 'public_order' && rng.chance(0.35)) return 'drunk';
  if (inc.category === 'public_order' && rng.chance(0.4)) return 'angry';
  if (night && rng.chance(0.06)) return 'drunk';
  if (inc.category === 'traffic' && inc.truePriority >= 3 && rng.chance(0.3)) return 'angry';
  if (inc.category === 'assist' && rng.chance(0.15)) return 'confused';
  return 'calm';
}

function deriveLang(s: SimState, inc: Incident, rng: Rng): ActiveCall['lang'] {
  const person = callerPerson(s, inc);
  const lang = person?.lang ?? inc.caller?.lang;
  if (lang) return lang === 'ru' || lang === 'uk' ? 'ru' : lang === 'en' ? 'en' : 'et';
  const region = safe(() => regionOf(s), undefined);
  const town = region?.towns.find((t) => t.name === inc.location.city);
  let p = town?.ruShare;
  if (p === undefined) {
    if (RU_TOWNS.has(inc.location.city)) p = 0.8;
    else if (s.regionId === 'ida') p = 0.45;
    else if (s.regionId === 'pohja')
      p = inc.location.district === 'Lasnamäe' ? 0.55 : inc.location.city === 'Tallinn' ? 0.3 : 0.15;
    else p = 0.04;
  }
  return rng.chance(p) ? 'ru' : 'et';
}

function isSeriousTemplate(inc: Incident, tpl?: IncidentTemplate): boolean {
  const tags = new Set(tpl?.tags ?? inc.tags);
  return (
    inc.truePriority <= 2 ||
    ['violence', 'domestic', 'major', 'missing'].includes(inc.category) ||
    tags.has('armed') ||
    tags.has('weapon_gun') ||
    tags.has('weapon_knife')
  );
}

// ── Line plumbing ────────────────────────────────────────────────────────────

function findCall(s: SimState, callId: string): ActiveCall | undefined {
  return s.calls.find((c) => c.id === callId);
}

const trKey = (callId: string, idx: number) => `tr:${callId}:${idx}`;

function lastCallerT(call: ActiveCall): number {
  let t = 0;
  for (const l of call.lines) if (l.who === 'caller' && l.t > t) t = l.t;
  return t;
}

/** Dispatcher lines are shown in the player's language (the interpreter relays them); no `ru` so the UI does not flag them untranslated. */
function pushDispatcher(s: SimState, call: ActiveCall, p: Phrase): void {
  call.lines.push({ who: 'dispatcher', text: { et: p.et, en: p.en }, t: s.now });
}

function pushSystem(s: SimState, call: ActiveCall, text: Text): void {
  call.lines.push({ who: 'system', text, t: s.now });
}

function answerDelayMs(s: SimState, call: ActiveCall, rng: Rng): number {
  let ms = rng.range(2, 6) * 1000;
  if (call.mood === 'elderly' || call.mood === 'drunk' || call.mood === 'confused') ms += 2000;
  if (call.mood === 'child') ms += 1000;
  if (call.mood === 'panic') ms = Math.max(1500, ms - 1000);
  if (call.lang === 'ru' && call.interpreter)
    ms += INTERPRETER_DELAY_MS * (s.flags['upg:interpreter_line'] ? 0.25 : 1);
  return Math.round(ms);
}

function pushCaller(s: SimState, call: ActiveCall, p: Phrase, rng: Rng): void {
  const t = Math.max(s.now, lastCallerT(call)) + answerDelayMs(s, call, rng);
  if (call.lang === 'ru') {
    const translated: Text = { et: p.et, en: p.en };
    if (call.interpreter) {
      call.lines.push({ who: 'caller', text: translated, ru: p.ru, t });
    } else {
      call.lines.push({ who: 'caller', text: { et: p.ru, en: p.ru }, ru: p.ru, t });
      s.flags[trKey(call.id, call.lines.length - 1)] = JSON.stringify(translated);
    }
  } else {
    call.lines.push({ who: 'caller', text: { et: p.et, en: p.en }, t });
  }
}

/** Answers that already sound hesitant or are plain facts get no leading filler. */
const NO_PRE =
  /^(Ma ei tea|Ma pole|Ei[ ,.!]|Minu nimi|Jah[,.!…]|Üks inimene|Mitte kuhugi|Oi, ma|Mis aadress|Oot)/;

/**
 * Lower-case an answer's first letter after a filler ("Kuulge… relva ma ei näinud"), except after a
 * full stop or question mark, for English "I", for acronyms and for two-word names ("Toyota Corolla").
 */
export function lcAfter(x: string, prev = ''): string {
  // After a sentence end or a stage direction ("(sosinal) ") the answer starts a new sentence.
  if (!x || /[.!?)]\s*$/.test(prev)) return x;
  if (/^I\b/.test(x) || /^[A-ZÕÄÖÜŠŽА-ЯЁ]{2}/.test(x)) return x;
  const [first, second] = x.split(/\s+/);
  const lc = x.charAt(0).toLowerCase() + x.slice(1);
  if (COLOUR_START.test(first)) return lc; // "Kullake, sinine Mercedes-Benz…"
  if (second && !/[:,]$/.test(first) && /^[A-ZÕÄÖÜŠŽА-ЯЁ]/.test(second)) return x;
  return lc;
}

/** Colour adjectives that start a vehicle description ("Hall Toyota") are common words, not names. */
const COLOUR_START =
  /^((tume|hele)?(sinine|must|valge|hõbe\w*|hall|punane|bordoo|veinipunane|roheline|kollane|oranž|pruun|beež|lilla|kuldne)|(dark|light)?(blue|black|white|silver|grey|red|burgundy|green|yellow|orange|brown|beige|purple|gold\w*)|тёмно-синий|голубой|синий|чёрный|белый|серебристый|серый|красный|бордовый|зелёный|жёлтый|оранжевый|коричневый|бежевый|фиолетовый|золотистый)$/i;

/** Genders that pick the `{m|f}` (caller) and `[m|f|n]` (person talked about) forms. */
interface Genders {
  caller: Gn;
  subject: Gn;
}

function gendersOf(s: SimState, inc: Incident): Genders {
  const caller = callerPerson(s, inc);
  if (SELF_SITUATIONS.has(situationOf(inc, tplOf(inc), s)))
    return { caller: caller?.gender, subject: caller?.gender };
  const subject = personByRole(s, inc, 'suspect', 'missing', 'driver', 'victim', 'deceased');
  return { caller: caller?.gender, subject: subject?.gender };
}

function styled(
  call: ActiveCall,
  p: Phrase,
  rng: Rng,
  q?: CallQuestionId,
  g: Genders = { caller: undefined, subject: undefined },
): Phrase {
  const f = MOOD_FILLERS[call.mood];
  if (!f) return p;
  let out = { ...p };
  if (call.mood === 'panic' && q !== 'suspect') {
    const frag = (x: string) => x.replace(/, /g, '… ');
    out = { ru: frag(out.ru), et: frag(out.et), en: frag(out.en) };
  }
  const skipPre = q === 'name' || NO_PRE.test(p.et);
  // A filler the line already contains ("Vabandage, et tülitan…") is not said twice.
  const says = (x: Phrase) => low(p.et).includes(low(x.et).replace(/^[\s(]+|[\s….,!?)]+$/g, ''));
  if (!skipPre && rng.chance(f.pPre)) {
    const pre = genderizePhrase(rng.pick(f.pre), g.caller, g.subject);
    if (!says(pre))
      out = {
        ru: pre.ru + lcAfter(out.ru, pre.ru),
        et: pre.et + lcAfter(out.et, pre.et),
        en: pre.en + lcAfter(out.en, pre.en),
      };
  }
  if (rng.chance(f.pPost)) {
    const post = genderizePhrase(rng.pick(f.post), g.caller, g.subject);
    if (!says(post)) out = { ru: out.ru + post.ru, et: out.et + post.et, en: out.en + post.en };
  }
  return out;
}

function addFact(inc: Incident, text: Text): void {
  if (!inc.details.some((d) => d.et === text.et)) inc.details.push(text);
}

const fact = (et: string, en: string): Text => ({ et: `Helistaja: ${et}`, en: `Caller: ${en}` });

// ─────────────────────────────────────────────────────────────────────────────
// Opening
// ─────────────────────────────────────────────────────────────────────────────

function openingPhrase(
  s: SimState,
  call: ActiveCall,
  inc: Incident,
  tpl: IncidentTemplate | undefined,
  rng: Rng,
): Phrase {
  if (call.prank) return rng.pick(PRANK_OPENINGS);
  const sit = situationOf(inc, tpl, s);
  const built = rng.pick(OPENINGS[sit]);
  if (call.lang === 'ru') {
    const ruLines = tpl?.call?.openingRu ?? [];
    if (ruLines.length > 0) return scriptedRu(s, inc, tpl!, rng.int(0, ruLines.length - 1));
    // No Russian call script: the story's own caller quotes in Russian, as an Estonian caller opens with callerLines.
    const quotes = callerLinesRu(tpl);
    if (quotes) return quoteRu(s, inc, tpl!, rng.int(0, quotes.length - 1));
    // No Russian lines at all: the situation line for THIS incident (original and translation match).
    return built;
  }
  const pool = tpl?.call?.opening?.length
    ? tpl.call.opening
    : tpl?.callerLines?.length
      ? tpl.callerLines
      : undefined;
  if (pool) {
    const t = fillCaller(rng.pick(pool), s, inc);
    return { ru: built.ru, et: t.et, en: t.en };
  }
  return built;
}

/** The template's Russian caller quotes, when there is one for every Estonian quote (callerLinesRu). */
function callerLinesRu(tpl: IncidentTemplate | undefined): string[] | undefined {
  const ru = tpl?.callerLinesRu;
  return ru?.length && ru.length === tpl?.callerLines?.length ? ru : undefined;
}

/** Russian caller quote `i` with its translation (template `callerLines[i]`). */
function quoteRu(s: SimState, inc: Incident, tpl: IncidentTemplate, i: number): Phrase {
  const t = fillCaller(tpl.callerLines![i], s, inc);
  return { ru: fillRu(tpl.callerLinesRu![i], s, inc), et: t.et, en: t.en };
}

/** Scripted Russian line `i` with its Estonian/English translation (template `call.opening[i]`). */
function scriptedRu(s: SimState, inc: Incident, tpl: IncidentTemplate, i: number): Phrase {
  const ruLines = tpl.call?.openingRu ?? [];
  const tr = tpl.call?.opening[i] ??
    tpl.call?.opening[0] ??
    tpl.callerLines?.[0] ?? { et: ruLines[i], en: ruLines[i] };
  const trf = fillCaller({ et: tr.et, en: tr.en }, s, inc);
  return { ru: fillRu(ruLines[i], s, inc), et: trf.et, en: trf.en };
}

/**
 * Card wording a caller would never use: labels ("Kirjeldus: …"), the caller in the third person
 * ("teataja", "kadunu", "eakas"), reported speech ("naabrite sõnul", "video järgi"), police and
 * registry knowledge (patrols, records, operators, ANPR), legal or explanatory notes and card
 * abbreviations ("u 300 €", "1,5 km raadiuses").
 */
const CARD_WORDING: RegExp[] = [
  /: /,
  /\(/,
  /^(teataja|helistaja|häirekeskus|hk|valvekeskus|kannatanu|tunnistaja|kahtlustatav|isik|patsient|klient)\b/i,
  /§|\b(KorS|KarS|LSV|PPA|ANPR)\b/,
  /teataja|helistaja|kannatanu|tunnistaja|kahtlusalune|kahtlustata|kinnipeetu\b|\bisik(ud|ul|ut|ute)?\b|\bkadunu(l|t|le|ga)?\b|\beaka(t|le|l)?\b/i,
  /\bsõnul\b|\bjärgi\b|andmetel|teadaolevalt|\bjuhtum/i,
  /häirekeskus|politsei|patrull|ekipaa|päästeamet|päästjad|lastekaitse|kriminaal|mobiili|operaator|tuvasta|registreer|edastat|edastati|teavita|menetl|väljakutse|andmebaas|register|sündmuskoh|\bleiti\b/i,
  /pädevus|järelevalve|väärteg|süüvõime|kohaldati|keelatud|lubatud|hinnanguliselt|läheneda|ettevaatlikult|ümbersõit|tuleb hoida|sihtmärgiks|mõnikord|kontrolljoon|varem kasutatud|\bsarnane\b|sama skeemi|sama sõiduk|eelmisel kuul|piirkonnas (on viimase|mitu|asub)|teatati|laekunud|veebikonstaab|kasutajakonto|võib häirida|peetakse\b/i,
  /\bu \d|€|\d+(,\d+)? ?(km|m|m\/s)\b|\d+\. (jaanuar|veebruar|märts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember)/i,
];

/** Whether a hidden card detail reads as something the caller could say (card notes stay on the card). */
export function speakableDetail(d: Text): boolean {
  const et = d.et.trim();
  return !!et && !CARD_WORDING.some((re) => re.test(et));
}

// ─────────────────────────────────────────────────────────────────────────────
// Answers
// ─────────────────────────────────────────────────────────────────────────────

/** Someone is missing: the caller does not know where they went (that is why they call). */
const MISSING_SITUATIONS = new Set<Situation>([
  'missing_child',
  'lost_child',
  'missing_youth',
  'missing_adult',
  'missing_dementia',
  'missing_patient',
  'lost_forest',
]);

/** Situations in which the caller is the person in trouble. */
const SELF_SITUATIONS = new Set<Situation>(['lost_self', 'fallen_self']);

/** Answers about "the person" when the caller is that person. */
function selfAnswer(s: SimState, inc: Incident, q: CallQuestionId, f: Facts): Answer | undefined {
  switch (q) {
    case 'injured':
      return f.injured === 'yes'
        ? {
            phrase: ANSWERS.injured_self,
            informative: true,
            fact: fact('on ise vigastatud', 'is injured themselves'),
          }
        : {
            phrase: ANSWERS.injured_self_no,
            informative: true,
            fact: fact('ise vigastusteta', 'not injured'),
          };
    case 'suspect':
      return { phrase: ANSWERS.suspect_nobody, informative: true };
    case 'vehicle': {
      const veh = suspectVehicle(s, inc);
      if (!veh)
        return {
          phrase: ANSWERS.vehicle_self_none,
          informative: true,
          fact: fact('sõidukit ei ole', 'no vehicle'),
        };
      const vp = vehiclePhrase(veh);
      return {
        phrase: fillPhrase(ANSWERS.vehicle_self, { car: '§', plate: veh.plate }, vp),
        informative: true,
        fact: {
          et: `Helistaja sõiduk: ${vp.et}, reg nr ${veh.plate}`,
          en: `Caller's vehicle: ${vp.en}, plate ${veh.plate}`,
        },
      };
    }
    case 'direction':
      return {
        phrase: ANSWERS.direction_self,
        informative: true,
        fact: fact('ootab kohapeal', 'waiting where they are'),
      };
    case 'intoxicated':
      return { phrase: ANSWERS.intox_self, informative: true, fact: fact('kaine', 'sober') };
  }
  return undefined;
}

/** The caller's part in the story when the caller is one of its persons ('suspect' calling about himself, 'victim'). */
function callerRoleOf(inc: Incident): 'suspect' | 'victim' | undefined {
  const id = inc.caller?.personId;
  if (!id) return undefined;
  const roles = inc.persons.filter((r) => r.personId === id).map((r) => r.role);
  return roles.includes('suspect') ? 'suspect' : roles.includes('victim') ? 'victim' : undefined;
}

/**
 * Answers about "the person" when the caller is the suspect himself ("I hit my wife, I'm waiting
 * downstairs"): never "he is close by" or a witness description of someone else.
 */
function suspectSelfAnswer(
  s: SimState,
  call: ActiveCall,
  inc: Incident,
  sit: Situation,
  q: CallQuestionId,
  f: Facts,
): Answer | undefined {
  switch (q) {
    case 'suspect':
      return {
        phrase: ANSWERS.suspect_self,
        informative: true,
        fact: fact(
          'helistaja on ise kahtlustatav, ootab kohapeal',
          'the caller is the suspect, waiting on scene',
        ),
      };
    case 'weapons':
      if (f.weapon === 'gun')
        return {
          phrase: ANSWERS.weapon_self_gun,
          informative: true,
          fact: fact('relv oli helistajal, pani käest', 'the caller had a firearm, has put it down'),
        };
      if (f.weapon === 'knife')
        return {
          phrase: ANSWERS.weapon_self_knife,
          informative: true,
          fact: fact('nuga oli helistajal, pani käest', 'the caller had a knife, has put it down'),
        };
      return { phrase: ANSWERS.weapon_self_none, informative: true, fact: fact('relva ei ole', 'no weapon') };
    case 'direction':
      return {
        phrase: ANSWERS.direction_self,
        informative: true,
        fact: fact('ootab kohapeal', 'waiting on scene'),
      };
    case 'intoxicated':
      return f.intoxicated === 'yes'
        ? {
            phrase: ANSWERS.intox_self_yes,
            informative: true,
            fact: fact('helistaja on joobes', 'the caller has been drinking'),
          }
        : {
            phrase: ANSWERS.intox_self,
            informative: true,
            fact: fact('helistaja ütleb, et on kaine', 'the caller says they are sober'),
          };
    case 'vehicle': {
      const veh = suspectVehicle(s, inc);
      if (!veh)
        return {
          phrase: ANSWERS.vehicle_self_none,
          informative: true,
          fact: fact('sõidukit ei ole', 'no vehicle'),
        };
      const vp = vehiclePhrase(veh);
      return {
        phrase: fillPhrase(ANSWERS.vehicle_self, { car: '§', plate: veh.plate }, vp),
        informative: true,
        fact: {
          et: `Helistaja sõiduk: ${vp.et}, reg nr ${veh.plate}`,
          en: `Caller's vehicle: ${vp.en}, plate ${veh.plate}`,
        },
      };
    }
    case 'safe':
      return callerAtHome(inc, sit) && call.mood !== 'whisper'
        ? { phrase: ANSWERS.safe_yes_home, informative: true, fact: fact('on kodus', 'at home') }
        : {
            phrase: ANSWERS.safe_yes,
            informative: true,
            fact: fact('on ohutus kohas', 'is in a safe place'),
          };
  }
  return undefined;
}

/** Who the suspect is to a victim who calls (template relation), said before the description. */
const RELATION_OF_CALLER: Partial<Record<NonNullable<PersonSpec['relation']>, Phrase>> = {
  partner: P(
    'Это [мой муж|моя жена|мой партнёр]',
    'See on mu elukaaslane',
    '[It is my husband|It is my wife|It is my partner]',
  ),
  ex_partner: P(
    'Это [мой бывший|моя бывшая|мой бывший]',
    'See on mu endine elukaaslane',
    '[It is my ex|It is my ex|It is my ex]',
  ),
  child: P(
    'Это [мой сын|моя дочь|мой ребёнок]',
    '[See on mu poeg|See on mu tütar|See on mu laps]',
    '[It is my son|It is my daughter|It is my child]',
  ),
  parent: P(
    'Это [мой отец|моя мать|мой отец]',
    '[See on mu isa|See on mu ema|See on mu vanem]',
    '[It is my father|It is my mother|It is my parent]',
  ),
};

/** Fill {placeholders} per language: a value is one string for all three languages or a Phrase. */
function fillTri(p: Phrase, vars: Record<string, string | Phrase>): Phrase {
  const f = (x: string, lang: keyof Phrase) =>
    x.replace(/\{(\w+)\}/g, (m, k: string) => {
      const v = vars[k];
      return v === undefined ? m : typeof v === 'string' ? v : v[lang];
    });
  return { ru: f(p.ru, 'ru'), et: f(p.et, 'et'), en: f(p.en, 'en') };
}

/** Situations in which a caller at a residential address is calling from home. */
const HOME_SITUATIONS = new Set<Situation>([
  'domestic',
  'domestic_neighbour',
  'domestic_child',
  'domestic_argument',
  'harassment',
  'order_breach',
  'child_neglect',
  'noise',
  'nuisance',
  'burglary',
  'burglary_progress',
  'intrusion',
  'welfare',
  'drunk_driver_home',
  'scam',
  'scam_ongoing',
  'fallen_self',
  'animal_cruelty',
  'drug_smell',
  'threat',
]);
/** Family situations where "the children are at home" is the natural answer. */
const FAMILY_SITUATIONS = new Set<Situation>([
  'domestic',
  'domestic_neighbour',
  'domestic_child',
  'domestic_argument',
  'order_breach',
  'child_neglect',
]);

/** Is the caller at home (a residential address and a situation people report from home)? */
function callerAtHome(inc: Incident, sit: Situation): boolean {
  return (
    (inc.location.placeKind === 'residential' || inc.location.placeKind === 'house') &&
    HOME_SITUATIONS.has(sit)
  );
}

interface Answer {
  phrase: Phrase;
  informative: boolean;
  fact?: Text;
}

function generateAnswer(
  s: SimState,
  call: ActiveCall,
  inc: Incident,
  tpl: IncidentTemplate | undefined,
  q: CallQuestionId,
  rng: Rng,
): Answer {
  if (call.prank) {
    const pool = PRANK_ANSWERS[q] ?? PRANK_ANSWERS.what!;
    return { phrase: rng.pick(pool), informative: true };
  }
  // Unhelpful first answers for difficult moods (asking again always works).
  if (!call.asked.includes(q) && q !== 'name') {
    if (call.mood === 'panic' && rng.chance(0.25))
      return { phrase: ANSWERS.unhelpful_panic, informative: false };
    if (call.mood === 'drunk' && q === 'where' && rng.chance(0.4))
      return { phrase: ANSWERS.unhelpful_drunk, informative: false };
    if (call.mood === 'confused' && rng.chance(0.25))
      return { phrase: ANSWERS.unhelpful_confused, informative: false };
  }

  const loc = inc.location;
  // The address as each caller says it: Russian speakers name the street type in Russian ("улица Pikk, дом 5").
  const v: Record<string, string | Phrase> = {
    address: P(ruAddress(loc.address), loc.address, loc.address),
    city: P(RU_CITY[loc.city] ?? loc.city, loc.city, loc.city),
  };

  // Template-scripted answers: the story's own words. A Russian-speaking caller says the Russian
  // original of the same line (answersRu, index for index), which the interpreter renders as the
  // Estonian line. Only a template without Russian lines leaves a Russian caller to the phrasebook.
  const scripted = tpl?.call?.answers?.[q];
  const answersRu = tpl?.call?.answersRu?.[q];
  if (scripted?.length && (call.lang !== 'ru' || answersRu?.length === scripted.length)) {
    const i = rng.int(0, scripted.length - 1);
    const t = fillCaller(scripted[i], s, inc);
    const ru = call.lang === 'ru' && answersRu ? fillRu(answersRu[i], s, inc) : t.et;
    return {
      phrase: { ru, et: t.et, en: t.en },
      informative: true,
      fact: { et: `Helistaja: ${t.et}`, en: `Caller: ${t.en}` },
    };
  }

  const sit = situationOf(inc, tpl, s);
  const f = factsOf(inc, tpl, sit);
  if (SELF_SITUATIONS.has(sit)) {
    const self = selfAnswer(s, inc, q, f);
    if (self) return self;
  }
  // The story may have the suspect himself call (callerRole 'suspect'): questions about "the person" are about him.
  const role = callerRoleOf(inc);
  if (role === 'suspect') {
    const self = suspectSelfAnswer(s, call, inc, sit, q, f);
    if (self) return self;
  }
  switch (q) {
    case 'where': {
      const k = loc.placeKind;
      if (k === 'highway') {
        const road = {
          ...v,
          address: P(ruAddress(loc.address).replace(/^трасса /, ''), loc.address, loc.address),
        };
        return {
          phrase: fillTri(ANSWERS.where_road, road),
          informative: true,
          fact: fact(`asukoht ${loc.address}`, `location ${loc.address}`),
        };
      }
      // Someone in a forest or on a lake does not know an address; elsewhere in the country most still do.
      if (
        k === 'forest' ||
        k === 'lake' ||
        (['ruralroad', 'farm', 'summerhouse', 'village'].includes(k) && rng.chance(0.4))
      ) {
        return {
          phrase: fillTri(ANSWERS.where_rural, v),
          informative: true,
          fact: fact(`asukoht ligikaudu ${loc.address}`, `approximate location ${loc.address}`),
        };
      }
      const place = spokenPlace(loc);
      if (place) {
        const label = placeText(loc);
        const en = typeof label === 'string' ? label : label.en;
        return {
          phrase: fillTri(ANSWERS.where_place, { ...v, place }),
          informative: true,
          fact: fact(
            `aadress kinnitatud: ${loc.placeName}, ${loc.address}`,
            `address confirmed: ${en}, ${loc.address}`,
          ),
        };
      }
      // Rural addresses already name the village ("Varangu küla, Lääne-Viru maakond"): no town after them.
      const withCity = !loc.address.includes(loc.city);
      const addr = fillTri(withCity ? ANSWERS.where_addr : ANSWERS.where_addr_only, v);
      return {
        phrase: addr,
        informative: true,
        fact: fact(
          `aadress kinnitatud: ${loc.address}, ${loc.city}`,
          `address confirmed: ${loc.address}, ${loc.city}`,
        ),
      };
    }
    case 'what': {
      // Everything the caller has said so far (fillers and panic fragments change the punctuation: compare letters only).
      const norm = (x: string) => low(x).replace(/[^\p{L}\p{N}]+/gu, '');
      const before = call.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.who === 'caller');
      const heard = norm(
        before
          .map(({ l, i }) => {
            const pending = s.flags[trKey(call.id, i)]; // translation not yet shown
            return `${l.ru ?? ''} ${l.text.et} ${typeof pending === 'string' ? pending : ''}`;
          })
          .join(' '),
      );
      const g = gendersOf(s, inc);
      const said = (x: string) =>
        before.length > 0 && heard.includes(norm(genderize(x, g.caller, g.subject)).slice(0, 24));
      let ph: Phrase | undefined;
      if (call.lang !== 'ru' && tpl?.callerLines?.length) {
        const pool = tpl.callerLines.filter((l) => !said(fill(l.et, varsFor(s, inc))));
        if (pool.length) {
          const t = fillCaller(rng.pick(pool), s, inc);
          ph = { ru: t.et, et: t.et, en: t.en };
        }
      }
      if (!ph && call.lang === 'ru' && tpl) {
        // The story in Russian: the call script line not used as the opening, then the story's caller
        // quotes (callerLinesRu), each with its own translation. Once all of it has been told the caller
        // tells it again: stock lines could contradict the story.
        const script = (tpl.call?.openingRu ?? [])
          .map((_, i) => i)
          .filter((i) => tpl.call?.opening[i])
          .map((i) => scriptedRu(s, inc, tpl, i));
        const quotes = callerLinesRu(tpl) ? tpl.callerLines!.map((_, i) => quoteRu(s, inc, tpl, i)) : [];
        const freshScript = script.filter((x) => !said(x.ru));
        const freshQuotes = quotes.filter((x) => !said(x.ru));
        if (freshScript.length) ph = rng.pick(freshScript);
        else if (freshQuotes.length) ph = rng.pick(freshQuotes);
        else if (script.length || quotes.length) {
          const again = rng.pick(script.length ? script : quotes);
          // A second "what" gets the repeat prefix in callAsk; the first one says it here.
          const r = ANSWERS.repeat;
          ph = call.asked.includes('what')
            ? again
            : {
                ru: r.ru + lcAfter(again.ru, r.ru),
                et: r.et + lcAfter(again.et, r.et),
                en: r.en + lcAfter(again.en, r.en),
              };
        }
      }
      if (!ph) {
        // The situation lines describe this incident too; only when everything has been said is a line repeated.
        const pool = OPENINGS[sit].filter((x) => !said(x.ru) && !said(x.et));
        const scriptedEt =
          call.lang !== 'ru' && tpl?.callerLines?.length
            ? fillCaller(rng.pick(tpl.callerLines), s, inc)
            : undefined;
        ph = pool.length
          ? rng.pick(pool)
          : scriptedEt
            ? { ru: scriptedEt.et, et: scriptedEt.et, en: scriptedEt.en }
            : rng.pick(OPENINGS[sit]);
      }
      // Estonian callers may add one detail the HK card does not show yet, if it reads as speech.
      const hd = call.lang !== 'ru' ? inc.hiddenDetails.find(speakableDetail) : undefined;
      const extra = hd ? fillCaller(hd, s, inc) : undefined;
      if (extra)
        ph = {
          ru: ph.ru,
          et: `${ph.et} Ja veel üks asi. ${extra.et}`,
          en: `${ph.en} And one more thing. ${extra.en}`,
        };
      return {
        phrase: ph,
        informative: true,
        fact: extra ? { et: `Helistaja lisab: ${extra.et}`, en: `Caller adds: ${extra.en}` } : undefined,
      };
    }
    case 'injured':
      // The victim calling about the attack answers about themselves.
      if (role === 'victim' && personByRole(s, inc, 'suspect')) {
        if (f.injured === 'yes')
          return {
            phrase: ANSWERS.injured_victim,
            informative: true,
            fact: fact('on ise vigastatud, vajalik kiirabi', 'is injured themselves, ambulance needed'),
          };
        if (f.injured === 'unknown')
          return {
            phrase: ANSWERS.injured_victim_unsure,
            informative: true,
            fact: fact('valud, vigastused selgusetud', 'in pain, injuries unclear'),
          };
      }
      if (f.injured === 'yes')
        return {
          phrase: ANSWERS.injured_yes,
          informative: true,
          fact: fact('on vigastatu(id), vajalik kiirabi', 'there are injured, ambulance needed'),
        };
      if (f.injured === 'unknown')
        return {
          phrase: ANSWERS.injured_unknown,
          informative: true,
          fact: fact('vigastused teadmata', 'injuries unknown'),
        };
      return {
        phrase: ANSWERS.injured_no,
        informative: true,
        fact: fact('vigastatuid ei ole', 'no injuries'),
      };
    case 'weapons':
      if (f.weapon === 'gun')
        return {
          phrase: ANSWERS.weapon_gun,
          informative: true,
          fact: fact('isikul on TULIRELV', 'the person has a FIREARM'),
        };
      if (f.weapon === 'knife')
        return {
          phrase: ANSWERS.weapon_knife,
          informative: true,
          fact: fact('isikul on NUGA', 'the person has a KNIFE'),
        };
      if (f.weapon === 'maybe')
        return {
          phrase: ANSWERS.weapon_maybe,
          informative: true,
          fact: fact('võimalik relv käes', 'possibly holding a weapon'),
        };
      return {
        phrase: ANSWERS.weapon_none,
        informative: true,
        fact: fact('relva ei näinud', 'no weapon seen'),
      };
    case 'suspect': {
      const p = personByRole(s, inc, 'suspect', 'missing', 'driver');
      if (!p) return { phrase: ANSWERS.suspect_nobody, informative: true };
      // A child reporting violence at home does not give a witness description of their own father.
      if (sit === 'domestic_child')
        return {
          phrase: ANSWERS.suspect_parent,
          informative: true,
          fact: fact('ründaja on lapse isa', "the attacker is the child's father"),
        };
      // A victim who knows the attacker says who it is first ("It is my husband."); a stranger in the dark was not seen well.
      const rel =
        role === 'victim' && inc.persons.find((r) => r.personId === p.id)?.role === 'suspect'
          ? (tpl?.persons ?? []).find((x) => x.role === 'suspect')?.relation
          : undefined;
      const known = rel ? RELATION_OF_CALLER[rel] : undefined;
      const hour = wall(s.now).hour;
      if (!known && (hour >= 22 || hour < 5) && inc.category !== 'missing' && h01(inc, 'dark') < 0.2)
        return {
          phrase: ANSWERS.suspect_none,
          informative: true,
          fact: fact('isikut ei näinud', 'did not see the person'),
        };
      const ru = call.lang === 'ru';
      // A Russian caller describes the clothes too when they can be said in Russian (ruClothing), so original and translation agree.
      const w = witnessDescription(p, s.now, true, ru);
      let desc: Phrase = w;
      let card: Text = { et: w.et, en: w.en };
      if (!ru) {
        card = safe(() => describePerson(p, s.now), card);
        // Spoken, the card abbreviations are said in full and English needs its article ("A man, about 30…").
        desc = {
          ru: w.ru,
          et: card.et.replace(/\bu (\d)/g, 'umbes $1'),
          en: withArticleEn(card.en.replace(/\bapprox\. /g, 'about ')),
        };
      }
      let phrase = capPhrase(fillPhrase(ANSWERS.suspect_desc, { desc: '§' }, desc));
      if (known)
        phrase = {
          ru: `${known.ru}. ${phrase.ru}`,
          et: `${known.et}. ${phrase.et}`,
          en: `${known.en}. ${phrase.en}`,
        };
      return {
        phrase,
        informative: true,
        fact: { et: `Kirjeldus: ${card.et}`, en: `Description: ${card.en}` },
      };
    }
    case 'vehicle': {
      const veh = suspectVehicle(s, inc);
      const nobody = !personByRole(s, inc, 'suspect', 'missing', 'driver');
      if (!veh && nobody)
        return {
          phrase: ANSWERS.vehicle_nobody,
          informative: true,
          fact: fact('sõidukit ei ole', 'no vehicle'),
        };
      if (!veh || (!f.byCar && inc.category !== 'traffic'))
        return {
          phrase: ANSWERS.vehicle_none,
          informative: true,
          fact: fact('sõidukit ei ole / jalgsi', 'no vehicle / on foot'),
        };
      const vp = vehiclePhrase(veh);
      const full = h01(inc, 'plate') < 0.6 || inc.category === 'traffic';
      if (full) {
        return {
          phrase: fillPhrase(ANSWERS.vehicle_full, { car: '§', plate: veh.plate }, vp),
          informative: true,
          fact: { et: `Sõiduk: ${vp.et}, reg nr ${veh.plate}`, en: `Vehicle: ${vp.en}, plate ${veh.plate}` },
        };
      }
      const part = partialPlate(veh.plate, h01(inc, 'plate2'));
      return {
        phrase: capPhrase(fillPhrase(ANSWERS.vehicle_partial, { car: '§', platePart: part }, vp)),
        informative: true,
        fact: {
          et: `Sõiduk: ${vp.et}, reg nr osaliselt ${part}`,
          en: `Vehicle: ${vp.en}, partial plate ${part}`,
        },
      };
    }
    case 'direction': {
      if (sit === 'adrift')
        return {
          phrase: ANSWERS.direction_adrift,
          informative: true,
          fact: fact('kantakse kaldast eemale', 'drifting away from the shore'),
        };
      if (sit === 'drowning')
        return {
          phrase: ANSWERS.direction_drowning,
          informative: true,
          fact: fact('kadus vee alla u 50 m kaldast', 'went under about 50 m from the shore'),
        };
      if (MISSING_SITUATIONS.has(sit))
        return {
          phrase: ANSWERS.direction_missing,
          informative: true,
          fact: fact('liikumissuund teadmata', 'direction unknown'),
        };
      if (!personByRole(s, inc, 'suspect', 'missing', 'driver') && !suspectVehicle(s, inc))
        return { phrase: ANSWERS.direction_nobody, informative: true };
      if (!f.fled)
        return {
          phrase: ANSWERS.direction_here,
          informative: true,
          fact: fact('kahtlustatav on endiselt kohal', 'suspect still on scene'),
        };
      if (h01(inc, 'dirk') < 0.15)
        return {
          phrase: ANSWERS.direction_unknown,
          informative: true,
          fact: fact('liikumissuund teadmata', 'direction unknown'),
        };
      const d = directionPhrase(s, inc);
      return {
        phrase: fillPhrase(f.byCar ? ANSWERS.direction_car : ANSWERS.direction, { dir: '§' }, d),
        informative: true,
        fact: {
          et: `Liikumissuund: ${d.et} suunas${f.byCar ? ' (sõidukiga)' : ' (jalgsi)'}`,
          en: `Direction: towards ${d.en}${f.byCar ? ' (by vehicle)' : ' (on foot)'}`,
        },
      };
    }
    case 'count':
      if (f.count >= 20)
        return {
          phrase: ANSWERS.count_many,
          informative: true,
          fact: fact('palju inimesi (kümneid)', 'many people (dozens)'),
        };
      if (f.count === 1)
        return { phrase: ANSWERS.count_one, informative: true, fact: fact('üks isik', 'one person') };
      if (FEW[f.count])
        return {
          phrase: FEW[f.count],
          informative: true,
          fact: fact(`isikuid ${f.count}`, `${f.count} people`),
        };
      return {
        phrase: fillPhrase(ANSWERS.count, { n: String(f.count) }),
        informative: true,
        fact: fact(`isikuid umbes ${f.count}`, `about ${f.count} people`),
      };
    case 'when': {
      if (f.inProgress)
        return {
          phrase: ANSWERS.when_now,
          informative: true,
          fact: fact('toimub praegu', 'happening right now'),
        };
      if (f.minutesAgo > 120 && (inc.category === 'property' || inc.category === 'fraud'))
        return {
          phrase: ANSWERS.when_night,
          informative: true,
          fact: fact('toimus öösel / varem', 'happened overnight / earlier'),
        };
      const time = hhmm(inc.createdAt - f.minutesAgo * 60_000);
      const m = String(Math.round(f.minutesAgo / 5) * 5 || 5);
      return {
        phrase: fillPhrase(ANSWERS.when_ago, { m, time }),
        informative: true,
        fact: fact(`toimus u kell ${time}`, `happened around ${time}`),
      };
    }
    case 'name': {
      const person = callerPerson(s, inc);
      const name = person ? `${person.firstName} ${person.lastName}` : inc.caller?.name;
      const anon =
        !name || ((inc.category === 'drugs' || inc.category === 'public_order') && h01(inc, 'anon') < 0.2);
      if (anon)
        return {
          phrase: ANSWERS.name_anon,
          informative: true,
          fact: fact('soovib jääda anonüümseks', 'wishes to stay anonymous'),
        };
      const phone = inc.caller?.phone ? `, tel ${inc.caller.phone}` : '';
      return {
        phrase: fillPhrase(ANSWERS.name, { name }),
        informative: true,
        fact: { et: `Helistaja: ${name}${phone}`, en: `Caller: ${name}${phone}` },
      };
    }
    case 'safe': {
      const danger =
        (inc.category === 'domestic' || inc.category === 'violence' || inc.category === 'major') &&
        inc.truePriority <= 2;
      const home = callerAtHome(inc, sit);
      if (danger && call.mood === 'whisper')
        return {
          phrase: home ? ANSWERS.safe_hiding_home : ANSWERS.safe_hiding,
          informative: true,
          fact: fact('peidab end, ei ole ohutus kohas', 'hiding, not safe'),
        };
      if (danger && h01(inc, 'safe') < 0.4)
        return {
          phrase: ANSWERS.safe_no,
          informative: true,
          fact: fact('ei ole ohutus kohas, ründaja lähedal', 'not safe, attacker nearby'),
        };
      if (home)
        return {
          phrase: ANSWERS.safe_yes_home,
          informative: true,
          fact: fact('on ohutus kohas (kodus)', 'is in a safe place (at home)'),
        };
      return {
        phrase: ANSWERS.safe_yes,
        informative: true,
        fact: fact('on ohutus kohas', 'is in a safe place'),
      };
    }
    case 'children': {
      if (!f.children)
        return {
          phrase: ANSWERS.children_no,
          informative: true,
          fact: fact('lapsi kohal ei ole', 'no children present'),
        };
      const homeKids = callerAtHome(inc, sit) && FAMILY_SITUATIONS.has(sit);
      return {
        phrase: homeKids ? ANSWERS.children_yes_home : ANSWERS.children_yes,
        informative: true,
        fact: fact('kohal on LAPSED', 'CHILDREN present'),
      };
    }
    case 'intoxicated':
      if (f.intoxicated === 'yes')
        return {
          phrase: ANSWERS.intox_yes,
          informative: true,
          fact: fact('isik on joobes', 'person is intoxicated'),
        };
      if (f.intoxicated === 'no')
        return {
          phrase: ANSWERS.intox_no,
          informative: true,
          fact: fact('isik tundub kaine', 'person seems sober'),
        };
      return {
        phrase: ANSWERS.intox_unknown,
        informative: true,
        fact: fact('joove teadmata', 'intoxication unknown'),
      };
  }
  return { phrase: ANSWERS.injured_unknown, informative: false };
}

function cap1(x: string): string {
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : x;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Decide whether a freshly created incident arrives as an interactive 112 transfer; if so create the ActiveCall. */
export function maybeCreateCall(s: SimState, inc: Incident, tpl: IncidentTemplate): ActiveCall | null {
  if (s.mode === 'director' || s.ended) return null;
  if (inc.source !== 'hk' && inc.source !== 'call') return null;
  // One 112 line; a sector co-op room has one per desk (src/sim/desks.ts).
  if (s.coop?.sec ? deskLineBusy(s, inc) : s.calls.some((c) => c.endedAt === undefined)) return null;
  const chance = tpl.interactiveChance ?? INTERACTIVE_CHANCE[inc.truePriority] ?? 0.1;
  return withRng(s, (rng) => {
    if (!rng.chance(chance)) return null;
    const prank = !isSeriousTemplate(inc, tpl) && inc.truePriority >= 3 && rng.chance(PRANK_SHARE);
    const call: ActiveCall = {
      id: `c${++s.seq.call}`,
      incidentId: inc.id,
      ringingSince: s.now,
      mood: prank ? 'prank' : deriveMood(s, inc, tpl, rng),
      lang: deriveLang(s, inc, rng),
      lines: [],
      asked: [],
      learned: [],
      prank: prank || undefined,
    };
    if (prank) {
      inc.falseAlarm = true;
      if (!inc.tags.includes('prank')) inc.tags.push('prank');
    }
    inc.source = 'call';
    s.flags[`hidden:${inc.id}`] = true;
    s.calls.push(call);
    emit(s, {
      type: 'call_ring',
      incidentId: inc.id,
      text: { et: 'Häirekeskus ühendab kõnet', en: 'ERC transferring a call' },
    });
    return call;
  });
}

/** Per-step update: ring timeouts (→ Häirekeskus creates the card itself), idle hang-ups, pruning. */
export function updateCalls(s: SimState): void {
  for (const call of s.calls) {
    if (call.endedAt !== undefined) continue;
    const inc = s.incidents[call.incidentId];
    if (!inc || inc.state === 'closed') {
      call.endedAt = s.now;
      delete s.flags[`hidden:${call.incidentId}`];
      continue;
    }
    if (call.answeredAt === undefined) {
      if (s.now - call.ringingSince > RING_TIMEOUT_MS) {
        call.endedAt = s.now;
        pushSystem(s, call, {
          et: 'Kõnele ei vastatud. Häirekeskus edastas sündmuse kaardina.',
          en: 'Call not answered. The ERC forwarded the event as a card.',
        });
        inc.source = 'hk';
        if (!inc.tags.includes('call:missed')) inc.tags.push('call:missed');
        s.stats.callsMissed++;
        addTimeline(s, inc, 'hk', {
          et: 'Häirekeskus: 112-kõne jäi juhtimiskeskuses vastamata, sündmus edastati kaardina.',
          en: 'ERC: the 112 transfer went unanswered, event forwarded as a card.',
        });
        emit(s, {
          type: 'call_missed',
          incidentId: inc.id,
          text: { et: 'Vastamata 112-kõne', en: 'Missed 112 call' },
        });
        // publishIncident clears the hidden flag itself (and shifts expiry timers by the ring time).
        safe(() => publishIncident(s, inc), undefined);
        delete s.flags[`hidden:${inc.id}`];
      }
      continue;
    }
    // Answered but abandoned by the dispatcher → caller hangs up, HK creates the card with its own priority.
    const lastDispatcher = Math.max(
      call.answeredAt,
      ...call.lines.filter((l) => l.who === 'dispatcher').map((l) => l.t),
    );
    if (s.now - lastDispatcher > IDLE_HANGUP_MS) {
      pushSystem(s, call, {
        et: 'Helistaja katkestas kõne. Häirekeskus vormistas sündmuse.',
        en: 'The caller hung up. The ERC filed the event.',
      });
      if (!inc.tags.includes('call:abandoned')) inc.tags.push('call:abandoned');
      const tpl = tplOf(inc);
      finishCreate(s, call, inc, tpl, tpl?.priority ?? inc.priority, false);
    }
  }
  // Prune ended calls after a short fade-out.
  const keep: ActiveCall[] = [];
  for (const c of s.calls) {
    if (c.endedAt !== undefined && s.now - c.endedAt > PRUNE_AFTER_MS) {
      for (let i = 0; i < c.lines.length; i++) delete s.flags[trKey(c.id, i)];
      continue;
    }
    keep.push(c);
  }
  if (keep.length !== s.calls.length) s.calls = keep;
}

export function callAnswer(s: SimState, callId: string): void {
  const call = findCall(s, callId);
  if (!call || call.endedAt !== undefined || call.answeredAt !== undefined) return;
  const inc = s.incidents[call.incidentId];
  call.answeredAt = s.now;
  s.stats.callsAnswered++;
  pushSystem(
    s,
    call,
    call.lang === 'ru'
      ? {
          et: 'Häirekeskus ühendas kõne. Helistaja räägib vene keeles.',
          en: 'Call connected by the Emergency Response Centre (ERC). The caller speaks Russian.',
        }
      : { et: 'Häirekeskus ühendas kõne.', en: 'Call connected by the Emergency Response Centre (ERC).' },
  );
  pushDispatcher(s, call, GREETING);
  if (!inc) return;
  withRng(s, (rng) => {
    const g = gendersOf(s, inc);
    const opening = genderizePhrase(openingPhrase(s, call, inc, tplOf(inc), rng), g.caller, g.subject);
    pushCaller(s, call, styled(call, opening, rng, undefined, g), rng);
  });
  addTimeline(s, inc, 'hk', {
    et: '112-kõne ühendati juhtimiskeskusega.',
    en: '112 call connected to the command centre.',
  });
}

export function callAsk(s: SimState, callId: string, q: CallQuestionId): void {
  const call = findCall(s, callId);
  if (!call || call.endedAt !== undefined) return;
  if (call.answeredAt === undefined) callAnswer(s, callId);
  const inc = s.incidents[call.incidentId];
  if (!inc) return;
  const tpl = tplOf(inc);
  const askedBefore = call.asked.includes(q);
  pushDispatcher(s, call, DISPATCHER_QUESTIONS[q]);
  withRng(s, (rng) => {
    const ans = generateAnswer(s, call, inc, tpl, q, rng);
    const g = gendersOf(s, inc);
    let phrase = styled(call, genderizePhrase(ans.phrase, g.caller, g.subject), rng, q, g);
    if (askedBefore && call.learned.includes(q) && !call.prank && call.mood !== 'confused') {
      const r = genderizePhrase(ANSWERS.repeat, g.caller, g.subject);
      phrase = {
        ru: r.ru + lcAfter(phrase.ru, r.ru),
        et: r.et + lcAfter(phrase.et, r.et),
        en: r.en + lcAfter(phrase.en, r.en),
      };
    }
    pushCaller(s, call, phrase, rng);
    if (!askedBefore) call.asked.push(q);
    if (ans.informative && !call.learned.includes(q)) {
      call.learned.push(q);
      if (ans.fact && !call.prank) addFact(inc, ans.fact);
    }
  });
}

export function callInterpreter(s: SimState, callId: string): void {
  const call = findCall(s, callId);
  if (!call || call.endedAt !== undefined) return;
  call.interpreter = !call.interpreter;
  if (call.interpreter) {
    pushSystem(s, call, {
      et: 'Tõlk liitus kõnega (vene keel).',
      en: 'An interpreter joined the call (Russian).',
    });
    call.lines.forEach((line, i) => {
      const raw = s.flags[trKey(call.id, i)];
      if (typeof raw === 'string') {
        try {
          line.text = JSON.parse(raw) as Text;
        } catch {
          /* keep original */
        }
        delete s.flags[trKey(call.id, i)];
      }
    });
    const inc = s.incidents[call.incidentId];
    if (inc && !inc.tags.includes('call:interpreter')) inc.tags.push('call:interpreter');
  } else {
    pushSystem(s, call, { et: 'Tõlk lahkus kõnest.', en: 'The interpreter left the call.' });
  }
}

function classify(inc: Incident, chosen: Priority): string {
  const d = Math.abs(chosen - inc.truePriority);
  return d === 0 ? 'class:ok' : d === 1 ? 'class:off1' : 'class:off2';
}

function setTag(inc: Incident, tag: string): void {
  inc.tags = inc.tags.filter((t) => !t.startsWith('class:'));
  inc.tags.push(tag);
}

function finishCreate(
  s: SimState,
  call: ActiveCall,
  inc: Incident,
  tpl: IncidentTemplate | undefined,
  priority: Priority,
  byPlayer: boolean,
): void {
  call.endedAt = s.now;
  inc.priority = priority;
  if (byPlayer) {
    setTag(inc, call.prank ? 'class:off2' : classify(inc, priority));
    if (call.learned.includes('where') && !inc.tags.includes('learned:where')) inc.tags.push('learned:where');
  }
  if (!inc.tags.includes('call:interactive')) inc.tags.push('call:interactive');
  if (call.lang === 'ru' && !inc.tags.includes('call:ru')) inc.tags.push('call:ru');
  const secs = Math.round((s.now - (call.answeredAt ?? call.ringingSince)) / 1000);
  addTimeline(s, inc, 'note', {
    et: `112-kõne lõpetatud (${Math.floor(secs / 60)} min ${String(secs % 60).padStart(2, '0')} s). Prioriteet P${priority}${tpl && tpl.priority !== priority ? ` (Häirekeskuse hinnang P${tpl.priority})` : ''}.`,
    en: `112 call ended (${Math.floor(secs / 60)} min ${String(secs % 60).padStart(2, '0')} s). Priority P${priority}.`,
  });
  // publishIncident clears the hidden flag itself (and shifts expiry timers by the call duration).
  safe(() => publishIncident(s, inc), undefined);
  delete s.flags[`hidden:${inc.id}`];
}

export function callEnd(
  s: SimState,
  callId: string,
  d: { action: 'create' | 'prank' | 'refer' | 'advice'; priority?: Priority; agency?: Agency },
): void {
  const call = findCall(s, callId);
  if (!call || call.endedAt !== undefined) return;
  const inc = s.incidents[call.incidentId];
  if (call.answeredAt === undefined) {
    call.answeredAt = s.now;
    s.stats.callsAnswered++;
  }
  if (!inc) {
    call.endedAt = s.now;
    return;
  }
  const tpl = tplOf(inc);

  switch (d.action) {
    case 'create': {
      pushDispatcher(s, call, CLOSING.create);
      finishCreate(s, call, inc, tpl, d.priority ?? tpl?.priority ?? inc.truePriority, true);
      return;
    }
    case 'prank': {
      pushDispatcher(s, call, CLOSING.prank);
      call.endedAt = s.now;
      delete s.flags[`hidden:${inc.id}`];
      const correct = !!(inc.easterEgg || call.prank || inc.falseAlarm);
      setTag(inc, correct ? 'class:ok' : 'class:off2');
      if (!inc.tags.includes('call:interactive')) inc.tags.push('call:interactive');
      if (correct) s.flags['stat:pranksCaught'] = ((s.flags['stat:pranksCaught'] as number) || 0) + 1;
      closeSafely(s, inc, 'prank');
      return;
    }
    case 'refer': {
      const ag = d.agency ?? tpl?.referral?.agency ?? 'kov';
      const name = AGENCY_NAME[ag];
      pushDispatcher(s, call, {
        ru: `Этим занимается ${name.ru}. Я передам информацию, с вами свяжутся.`,
        et: `Selle murega tegeleb ${name.et}. Edastan info, nemad võtavad teiega ühendust.`,
        en: `This is a matter for ${name.en}. I'm passing the information on and they will contact you.`,
      });
      call.endedAt = s.now;
      delete s.flags[`hidden:${inc.id}`];
      setTag(
        inc,
        tpl?.referral || inc.referral
          ? inc.referral && d.agency && inc.referral !== d.agency
            ? 'class:off1'
            : 'class:ok'
          : 'class:off2',
      );
      if (!inc.tags.includes('call:interactive')) inc.tags.push('call:interactive');
      closeSafely(s, inc, 'referral', ag);
      return;
    }
    case 'advice': {
      pushDispatcher(s, call, CLOSING.advice);
      call.endedAt = s.now;
      delete s.flags[`hidden:${inc.id}`];
      setTag(inc, inc.truePriority === 4 ? 'class:ok' : inc.truePriority === 3 ? 'class:off1' : 'class:off2');
      if (!inc.tags.includes('call:interactive')) inc.tags.push('call:interactive');
      closeSafely(s, inc, 'phone');
      return;
    }
  }
}

/** Close through engine-core's closeIncident (scoring, stats, events); minimal fallback if it is not wired yet. */
function closeSafely(s: SimState, inc: Incident, how: 'referral' | 'phone' | 'prank', agency?: Agency): void {
  try {
    closeIncident(s, inc.id, how, agency);
  } catch {
    if (inc.state !== 'closed') {
      inc.state = 'closed';
      inc.closedAt = s.now;
      inc.closedBy = how;
      if (agency) inc.referral = agency;
      emit(s, { type: 'incident_closed', incidentId: inc.id });
    }
  }
}

/** The ringing or in-progress call, if any (UI helper). */
export function currentCall(s: SimState): ActiveCall | undefined {
  return s.calls.find((c) => c.endedAt === undefined);
}

/** Lines the caller has finished saying by now (UI helper). */
export function visibleLines(s: SimState, call: ActiveCall): ActiveCall['lines'] {
  return call.lines.filter((l) => l.t <= s.now);
}

/** True while the caller is still "speaking" (an answer is scheduled in the future). */
export function callerTyping(s: SimState, call: ActiveCall): boolean {
  return call.lines.some((l) => l.t > s.now);
}
