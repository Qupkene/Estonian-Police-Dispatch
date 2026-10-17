/**
 * Interactive 112 transfers (DESIGN §4.11). Häirekeskus connects a caller to the police
 * command centre; the player answers, asks questions, and ends the call with a decision.
 *
 * Contract notes for UI / engine-core:
 *  - The incident stays hidden (`s.flags['hidden:<id>'] = true`) until the call ends.
 *  - `ActiveCall.lines[i].t` may lie in the future (caller still "talking"); show only lines
 *    with `t <= s.now`.
 *  - Russian callers: every caller line carries the original in `ru`. While no interpreter is on
 *    the call, `text` ALSO holds the Russian original (both et/en) — so the UI can always render
 *    `text`. Switching the interpreter on translates earlier lines in place and later answers
 *    arrive translated (+20 game-s each, −75 % with the `interpreter_line` upgrade).
 *  - Facts the caller gives (address confirmed, weapon, description, plate…) are appended to
 *    `inc.details` as "Helistaja: …" lines the first time each fact is learned.
 *
 * Owned by engine-systems.
 */
import { closeIncident } from '@/sim/commands';
import { ageOf, describePerson, describeVehicle } from '@/gen/describe';
import { addTimeline, emit, publishIncident, regionOf, tplOf } from './internal';
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

type Phrase = { ru: string; et: string; en: string };
const P = (ru: string, et: string, en: string): Phrase => ({ ru, et, en });

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher phrasing (standard Estonian call-taking questions)
// ─────────────────────────────────────────────────────────────────────────────

export const DISPATCHER_QUESTIONS: Record<CallQuestionId, Phrase> = {
  what: P('Расскажите подробнее, что случилось?', 'Rääkige palun täpsemalt, mis juhtus?', 'Please tell me exactly what happened.'),
  where: P('Какой точный адрес?', 'Mis on täpne aadress?', 'What is the exact address?'),
  injured: P('Есть пострадавшие?', 'Kas keegi on vigastatud?', 'Is anyone injured?'),
  weapons: P('У кого-нибудь есть оружие?', 'Kas kellelgi on relv?', 'Does anyone have a weapon?'),
  suspect: P('Опишите, пожалуйста, этого человека.', 'Kirjeldage palun isikut.', 'Please describe the person.'),
  vehicle: P('У него есть машина? Номер?', 'Kas tal on sõiduk? Number?', 'Does he have a vehicle? The plate number?'),
  direction: P('В какую сторону он ушёл?', 'Mis suunas ta läks?', 'Which way did he go?'),
  count: P('Сколько там человек?', 'Kui palju inimesi seal on?', 'How many people are there?'),
  when: P('Когда это произошло?', 'Millal see juhtus?', 'When did this happen?'),
  name: P('Ваше имя, пожалуйста?', 'Teie nimi, palun?', 'Your name, please?'),
  safe: P('Вы сами в безопасном месте?', 'Kas olete ise ohutus kohas?', 'Are you somewhere safe yourself?'),
  children: P('Там есть дети?', 'Kas lapsi on seal?', 'Are there children there?'),
  intoxicated: P('Он пьян?', 'Kas ta on joobes?', 'Is he drunk?'),
};

const GREETING: Phrase = P(
  'Полиция, слушаю вас. Что случилось?',
  'Häirekeskus ühendas teid politseiga. Mis juhtus?',
  'The emergency centre has put you through to the police. What happened?',
);

// ─────────────────────────────────────────────────────────────────────────────
// Situations & caller phrasebooks
// ─────────────────────────────────────────────────────────────────────────────

export type Situation =
  | 'domestic'
  | 'domestic_neighbour'
  | 'fight'
  | 'knife'
  | 'shots'
  | 'noise'
  | 'drunk_person'
  | 'burglary'
  | 'burglary_progress'
  | 'shoplift'
  | 'theft'
  | 'car_theft'
  | 'accident'
  | 'drunk_driver'
  | 'traffic'
  | 'drugs'
  | 'missing_child'
  | 'missing_adult'
  | 'suspicious'
  | 'alarm'
  | 'assist'
  | 'fraud'
  | 'border'
  | 'environment'
  | 'bomb'
  | 'animal'
  | 'easter'
  | 'generic';

/** Built-in caller openings per situation (Russian original + Estonian/English translation). */
export const OPENINGS: Record<Situation, Phrase[]> = {
  domestic: [
    P('Муж опять пьяный, бьёт меня… помогите, пожалуйста!', 'Mees on jälle purjus ja lööb mind… aidake, palun!', 'My husband is drunk again and hitting me… please help!'),
    P('Он кричит и швыряет вещи, я боюсь, что он меня убьёт!', 'Ta karjub ja loobib asju, ma kardan, et ta tapab mu!', "He's screaming and throwing things, I'm afraid he'll kill me!"),
  ],
  domestic_neighbour: [
    P('У соседей крики, женщина зовёт на помощь!', 'Naabrite juures karjutakse, naine hüüab appi!', "There's screaming at the neighbours', a woman is calling for help!"),
    P('За стеной что-то падает, бьётся посуда, ребёнок плачет.', 'Seina taga kukub midagi, nõud purunevad, laps nutab.', 'Things are crashing behind the wall, dishes breaking, a child is crying.'),
  ],
  fight: [
    P('Тут драка, мужика бьют ногами!', 'Siin on kaklus, üht meest peksavad jalgadega!', "There's a fight here, they're kicking a man!"),
    P('Возле бара дерутся, человек пять!', 'Baari ees kakeldakse, umbes viis inimest!', "They're fighting outside the bar, about five people!"),
  ],
  knife: [
    P('У него нож, он угрожает людям!', 'Tal on nuga, ta ähvardab inimesi!', "He's got a knife, he's threatening people!"),
    P('Человека ударили ножом, тут кровь!', 'Üht inimest pussitati, siin on verd!', "Someone's been stabbed, there's blood!"),
  ],
  shots: [
    P('Я слышал выстрелы! Несколько раз!', 'Ma kuulsin laske! Mitu korda!', 'I heard gunshots! Several!'),
    P('Там мужчина с пистолетом, он стрелял!', 'Seal on mees püstoliga, ta tulistas!', "There's a man with a gun, he fired it!"),
  ],
  noise: [
    P('Соседи опять врубили музыку, уже третий час ночи!', 'Naabrid panid jälle muusika põhja, kell on juba kolm öösel!', "The neighbours have the music blasting again, it's three in the morning!"),
    P('Сверху вечеринка, топают и орут, спать невозможно.', 'Ülemisel korrusel on pidu, trampivad ja kisavad, magada ei saa.', "There's a party upstairs, stomping and yelling, I can't sleep."),
  ],
  drunk_person: [
    P('Тут мужчина лежит на остановке, пьяный, не встаёт.', 'Bussipeatuses lamab mees, purjus, ei tõuse püsti.', "There's a man lying at the bus stop, drunk, he won't get up."),
    P('Пьяный пристаёт к прохожим, кричит на всех.', 'Joobes mees norib möödujate kallal ja karjub kõigi peale.', "A drunk is harassing passers-by and yelling at everyone."),
  ],
  burglary: [
    P('Ко мне в квартиру залезли, дверь взломана!', 'Minu korterisse on sisse murtud, uks on lõhutud!', 'Someone broke into my flat, the door has been forced!'),
    P('Пришла домой — всё перевёрнуто, техники нет.', 'Tulin koju — kõik on pea peale pööratud, tehnika on kadunud.', 'I came home and everything is turned upside down, the electronics are gone.'),
  ],
  burglary_progress: [
    P('Кто-то лезет в окно к соседям, прямо сейчас!', 'Keegi ronib praegu naabrite aknast sisse!', 'Someone is climbing in through the neighbours’ window right now!'),
    P('В доме напротив фонарик ходит, а хозяева в отъезде.', 'Vastasmajas liigub taskulamp, aga omanikud on ära.', "There's a torch moving around in the house opposite, and the owners are away."),
  ],
  shoplift: [
    P('В магазине поймали вора, охранник его держит.', 'Poes tabati varas, turvatöötaja hoiab teda kinni.', 'We caught a shoplifter, the security guard is holding him.'),
    P('Мужчина набрал полную сумку и выбежал, не заплатив!', 'Mees toppis koti täis ja jooksis maksmata välja!', 'A man filled a bag and ran out without paying!'),
  ],
  theft: [
    P('У меня украли сумку, прямо из рук вырвали!', 'Mu kott varastati, tõmmati otse käest!', 'My bag was stolen, snatched right out of my hand!'),
    P('Украли велосипед, замок перерезан.', 'Mu jalgratas varastati, lukk on läbi lõigatud.', 'My bike was stolen, the lock has been cut.'),
  ],
  car_theft: [
    P('Мою машину угнали, стояла во дворе, а теперь нет!', 'Mu auto varastati, seisis hoovis ja nüüd on läinud!', 'My car has been stolen, it was in the yard and now it’s gone!'),
    P('Кто-то копается в машине у дома, разбил стекло.', 'Keegi sorib maja ees autos, aken on katki löödud.', "Someone is rummaging in a car outside, they've smashed the window."),
  ],
  accident: [
    P('Тут авария, две машины столкнулись!', 'Siin on avarii, kaks autot põrkasid kokku!', "There's been a crash, two cars collided!"),
    P('Машина вылетела в кювет и перевернулась!', 'Auto sõitis kraavi ja läks katusele!', 'A car went into the ditch and rolled over!'),
  ],
  drunk_driver: [
    P('Впереди меня машина виляет по всей дороге, водитель, похоже, пьяный!', 'Minu ees sõitev auto looklen üle tee, juht on vist purjus!', 'The car in front of me is weaving all over the road, the driver seems drunk!'),
    P('Мужчина еле стоит на ногах и садится за руль!', 'Mees vaevu seisab jalul ja istub rooli!', 'A man can barely stand and he’s getting behind the wheel!'),
  ],
  traffic: [
    P('Машина стоит посреди дороги, мешает всем.', 'Auto seisab keset teed ja segab kõiki.', 'A car is standing in the middle of the road blocking everyone.'),
    P('Тут гонщики носятся по двору, дети гуляют!', 'Siin kihutavad autod hoovis ringi, lapsed mängivad!', "Cars are racing around the yard here, kids are playing!"),
  ],
  drugs: [
    P('В подъезде колются, шприцы везде валяются.', 'Trepikojas süstitakse, süstlaid vedeleb igal pool.', "People are injecting in the stairwell, there are needles everywhere."),
    P('Возле школы парень что-то продаёт подросткам.', 'Kooli juures müüb üks noormees teismelistele midagi.', 'A young man is selling something to teenagers near the school.'),
  ],
  missing_child: [
    P('Мой ребёнок пропал, не вернулся из школы!', 'Mu laps on kadunud, ta ei tulnud koolist koju!', "My child is missing, didn't come home from school!"),
    P('Сын гулял во дворе, и его нигде нет!', 'Poeg mängis hoovis ja nüüd pole teda kusagil!', 'My son was playing in the yard and now he’s nowhere to be found!'),
  ],
  missing_adult: [
    P('Мама пропала, у неё деменция, ушла из дома!', 'Ema on kadunud, tal on dementsus, ta läks kodust ära!', 'My mother is missing, she has dementia, she wandered off!'),
    P('Муж ушёл в лес за грибами и не вернулся.', 'Mees läks metsa seenele ega tulnud tagasi.', 'My husband went mushroom picking in the forest and hasn’t come back.'),
  ],
  suspicious: [
    P('Какой-то подозрительный тип ходит вокруг машин.', 'Mingi kahtlane tüüp tiirutab autode ümber.', 'Some suspicious guy is walking around the cars.'),
    P('Уже час у подъезда стоит машина, внутри кто-то сидит и смотрит.', 'Juba tund aega seisab trepikoja ees auto, keegi istub sees ja vaatab.', "A car has been parked by the entrance for an hour, someone is sitting inside watching."),
  ],
  alarm: [
    P('Сработала сигнализация в магазине, внутри кто-то есть!', 'Poes läks signalisatsioon tööle, sees on keegi!', 'The alarm went off in the shop, someone is inside!'),
    P('У соседей воет сигнализация, а свет внутри мигает.', 'Naabrite juures huilgab signalisatsioon ja sees vilgub tuli.', 'The neighbours’ alarm is wailing and a light is flickering inside.'),
  ],
  assist: [
    P('Тут человеку плохо, он упал и не двигается!', 'Siin on inimesel halb, ta kukkus ja ei liiguta!', "Someone's unwell here, he fell and isn't moving!"),
    P('Скорая просит полицию, пациент буйный.', 'Kiirabi palub politseid, patsient on vägivaldne.', 'The ambulance crew is asking for police, the patient is violent.'),
  ],
  fraud: [
    P('Мне позвонили, сказали, что из банка, и я перевела деньги…', 'Mulle helistati, öeldi, et pangast, ja ma kandsin raha üle…', 'They called and said they were from the bank, and I transferred the money…'),
    P('Звонят и требуют коды от Smart-ID, это мошенники?', 'Helistatakse ja nõutakse Smart-ID koode, kas need on petised?', "Someone keeps calling demanding my Smart-ID codes, are these scammers?"),
  ],
  border: [
    P('Тут какие-то люди с рюкзаками вышли из леса у границы.', 'Siin tulid piiri lähedal metsast välja mingid inimesed seljakottidega.', 'Some people with backpacks just came out of the woods near the border.'),
    P('Над рекой летает дрон, уже давно.', 'Jõe kohal lendab juba pikalt droon.', "There's been a drone flying over the river for a long time."),
  ],
  environment: [
    P('В реку что-то сливают, вода вся в пятнах.', 'Jõkke lastakse midagi, vesi on laike täis.', "Someone is dumping something into the river, the water is full of slicks."),
    P('В лесу стреляют, а сейчас не сезон охоты.', 'Metsas lastakse, aga praegu pole jahihooaeg.', "There's shooting in the forest, and it's not hunting season."),
  ],
  bomb: [
    P('На вокзале оставили сумку, хозяина нет уже полчаса.', 'Jaama on jäetud kott, omanikku pole pool tundi näha olnud.', "There's an abandoned bag at the station, no owner for half an hour."),
    P('Нам позвонили и сказали, что в здании бомба!', 'Meile helistati ja öeldi, et majas on pomm!', 'Someone called us and said there’s a bomb in the building!'),
  ],
  animal: [
    P('На дороге лось, машины еле объезжают!', 'Teel on põder, autod vaevu pääsevad mööda!', "There's an elk on the road, cars can barely get past!"),
    P('Собака без хозяина бросается на людей!', 'Omanikuta koer ründab inimesi!', 'A dog without its owner is attacking people!'),
  ],
  easter: [
    P('Вы не поверите, но тут что-то светится в небе и садится в поле!', 'Te ei usu, aga siin helendab midagi taevas ja maandub põllule!', "You won't believe it, but something is glowing in the sky and landing in the field!"),
    P('Тут такое… я даже не знаю, как объяснить.', 'Siin on selline asi… ma ei teagi, kuidas seletada.', "There's this thing here… I don't even know how to explain it."),
  ],
  generic: [
    P('Алло, полиция? Нужна помощь!', 'Halloo, politsei? Mul on abi vaja!', 'Hello, police? I need help!'),
    P('Здравствуйте, у нас тут проблема, приезжайте.', 'Tere, meil on siin probleem, tulge palun.', 'Hello, we have a problem here, please come.'),
  ],
};

/** Situation-free answer phrases. Placeholders: {address} {city} {place} {desc} {car} {plate} {platePart} {dir} {n} {m} {name}. */
export const ANSWERS = {
  where_addr: P('Адрес — {address}, {city}.', 'Aadress on {address}, {city}.', 'The address is {address}, {city}.'),
  where_place: P('Я возле «{place}», адрес {address}.', 'Ma olen {place} juures, {address}.', "I'm at {place}, {address}."),
  where_rural: P('Точно не знаю… где-то возле {address}.', 'Täpselt ei tea… kuskil {address} lähedal.', "I'm not sure exactly… somewhere near {address}."),
  where_road: P('На трассе, {address}.', 'Maantee peal, {address}.', "On the highway, {address}."),
  injured_yes: P('Да, есть раненый, у него кровь идёт!', 'Jah, üks on vigastatud, ta veritseb!', "Yes, someone's hurt, he's bleeding!"),
  injured_no: P('Нет, вроде никто не ранен.', 'Ei, tundub, et keegi pole vigastatud.', 'No, nobody seems to be hurt.'),
  injured_unknown: P('Не знаю, мне отсюда не видно.', 'Ma ei tea, siit ei ole näha.', "I don't know, I can't see from here."),
  weapon_knife: P('Да, у него нож!', 'Jah, tal on nuga!', 'Yes, he has a knife!'),
  weapon_gun: P('У него пистолет, я сама видела!', 'Tal on püstol, ma nägin ise!', 'He has a pistol, I saw it myself!'),
  weapon_maybe: P('Что-то было в руке, может, оружие.', 'Tal oli midagi käes, võib-olla relv.', 'He had something in his hand, maybe a weapon.'),
  weapon_none: P('Оружия я не видел.', 'Relva ma ei näinud.', "I didn't see any weapon."),
  suspect_desc: P('{desc}.', '{desc}.', '{desc}.'),
  suspect_none: P('Я его не разглядел, было темно.', 'Ma ei näinud teda hästi, oli pime.', "I didn't get a good look, it was dark."),
  suspect_nobody: P('Тут нет никакого подозреваемого.', 'Siin pole kedagi kahtlast.', "There's nobody suspicious here."),
  vehicle_full: P('Да, {car}, номер {plate}.', 'Jah, {car}, number {plate}.', 'Yes, {car}, plate {plate}.'),
  vehicle_partial: P('{car}, номер… начинается на {platePart}, дальше не запомнил.', '{car}, number… algas {platePart}, edasi ei jäänud meelde.', "{car}, the plate… started with {platePart}, I didn't catch the rest."),
  vehicle_none: P('Нет, он пешком.', 'Ei, ta oli jala.', 'No, he was on foot.'),
  direction: P('Он убежал в сторону {dir}.', 'Ta jooksis {dir} suunas.', 'He ran towards {dir}.'),
  direction_car: P('Уехал в сторону {dir}.', 'Ta sõitis {dir} suunas minema.', 'He drove off towards {dir}.'),
  direction_here: P('Никуда, он всё ещё здесь!', 'Mitte kuhugi, ta on ikka veel siin!', "Nowhere, he's still here!"),
  direction_unknown: P('Не видел, куда он делся.', 'Ma ei näinud, kuhu ta kadus.', "I didn't see where he went."),
  count: P('Их там человек {n}.', 'Neid on seal umbes {n}.', 'There are about {n} of them.'),
  count_one: P('Один человек.', 'Üks inimene.', 'Just one person.'),
  count_many: P('Много, десятки человек!', 'Palju, kümneid inimesi!', 'Lots, dozens of people!'),
  when_now: P('Прямо сейчас, это происходит сейчас!', 'Praegu, see käib praegu!', "Right now, it's happening right now!"),
  when_ago: P('Минут {m} назад, где-то в {time}.', 'Umbes {m} minutit tagasi, kella {time} paiku.', 'About {m} minutes ago, around {time}.'),
  when_night: P('Ночью, я утром заметил.', 'Öösel, ma märkasin hommikul.', 'During the night, I noticed it in the morning.'),
  name: P('Меня зовут {name}.', 'Minu nimi on {name}.', 'My name is {name}.'),
  name_anon: P('Я не хочу называть своё имя.', 'Ma ei taha oma nime öelda.', "I'd rather not give my name."),
  safe_yes: P('Да, я в безопасности, я у себя дома.', 'Jah, olen ohutus kohas, olen kodus.', "Yes, I'm safe, I'm at home."),
  safe_hiding: P('Нет! Я заперлась в ванной…', 'Ei! Ma panin end vannituppa lukku…', "No! I've locked myself in the bathroom…"),
  safe_no: P('Не знаю… он рядом.', 'Ma ei tea… ta on lähedal.', "I don't know… he's close by."),
  children_yes: P('Да, дети дома, они плачут.', 'Jah, lapsed on kodus, nad nutavad.', "Yes, the kids are at home, they're crying."),
  children_no: P('Нет, детей нет.', 'Ei, lapsi ei ole.', 'No, there are no children.'),
  intox_yes: P('Да, он пьяный в стельку.', 'Jah, ta on täiesti purjus.', "Yes, he's completely drunk."),
  intox_no: P('Нет, трезвый вроде.', 'Ei, tundub kaine.', 'No, he seems sober.'),
  intox_unknown: P('Не знаю, может быть.', 'Ei tea, võib-olla.', "I don't know, maybe."),
  repeat: P('Я же уже сказал: ', 'Ma juba ütlesin: ', 'I already told you: '),
  unhelpful_panic: P('Я не знаю, не знаю! Просто приезжайте быстрее!', 'Ma ei tea, ma ei tea! Tulge lihtsalt kiiresti!', "I don't know, I don't know! Just come quickly!"),
  unhelpful_drunk: P('Какой адрес… щас, погоди… где-то тут.', 'Mis aadress… oot, kohe… kuskil siin.', "What address… hang on… somewhere around here."),
  unhelpful_confused: P('Ой, я забыла… что вы спросили?', 'Oi, ma unustasin… mida te küsisite?', 'Oh, I forgot… what did you ask?'),
} satisfies Record<string, Phrase>;

/** Mood fillers wrapped around answers. */
const MOOD_FILLERS: Partial<Record<CallerMood, { pre: Phrase[]; post: Phrase[]; pPre: number; pPost: number }>> = {
  panic: {
    pre: [P('Боже… ', 'Oh jumal… ', 'Oh God… '), P('Слушайте… ', 'Kuulge… ', 'Listen… '), P('Сейчас… сейчас… ', 'Oot… oot… ', 'Wait… wait… ')],
    post: [P(' Быстрее!', ' Kiiresti!', ' Hurry!'), P(' Скорее приезжайте!', ' Tulge ruttu!', ' Come quickly!'), P(' Пожалуйста, быстрее!', ' Palun kiirustage!', ' Please hurry!')],
    pPre: 0.3,
    pPost: 0.5,
  },
  drunk: {
    pre: [P('Слушай, командир… ', 'No kuule, ülemus… ', 'Listen, chief… '), P('Ну это… короче… ', 'Noh… see on nii, et… ', 'Well… the thing is… ')],
    post: [
      P(' …и вообще, чего вы столько спрашиваете?', ' …ja üldse, miks te nii palju küsite?', ' …and why are you asking so many questions anyway?'),
      P(' Я трезвый, между прочим.', ' Ma olen muide täiesti kaine.', " I'm totally sober, by the way."),
    ],
    pPre: 0.6,
    pPost: 0.45,
  },
  elderly: {
    pre: [P('Извините, что беспокою… ', 'Vabandage, et tülitan… ', 'Sorry to bother you… '), P('Деточка, ', 'Kullake, ', 'Dear, ')],
    post: [P(' Спасибо вам, милая.', ' Aitäh teile, kullake.', ' Thank you, dear.'), P(' Я уже старый человек, понимаете.', ' Ma olen juba vana inimene, saate aru.', " I'm an old person, you see.")],
    pPre: 0.45,
    pPost: 0.35,
  },
  child: {
    pre: [P('Мама сказала… ', 'Emme ütles, et… ', 'Mummy said… '), P('Эээ… ', 'Ee… ', 'Um… ')],
    post: [P(' Вы приедете?', ' Kas te tulete kohe?', ' Are you coming?'), P(' Мне страшно.', ' Mul on hirm.', " I'm scared.")],
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
    pre: [P('Я уже третий раз звоню! ', 'Ma helistan juba kolmandat korda! ', "This is the third time I'm calling! "), P('Слушайте, ', 'Kuulge, ', 'Listen, ')],
    post: [P(' Сделайте уже что-нибудь!', ' Tehke ometi midagi!', ' Do something for once!'), P(' Полиция вообще работает?', ' Kas politsei üldse töötab?', ' Do the police even work?')],
    pPre: 0.45,
    pPost: 0.45,
  },
  confused: {
    pre: [P('Подождите… что вы спросили? ', 'Oot-oot… mis te küsisite? ', 'Wait… what did you ask? '), P('Я не уверена… ', 'Ma pole kindel… ', "I'm not sure… ")],
    post: [P(' …или это было вчера?', ' …või oli see eile?', ' …or was that yesterday?')],
    pPre: 0.5,
    pPost: 0.3,
  },
};

/** Prank caller lines (laughter, contradictions). */
const PRANK_OPENINGS: Phrase[] = [
  P('Алло, у вас холодильник работает? Тогда бегите его ловить! (смех)', 'Halloo, kas teie külmkapp töötab? Siis jookske talle järele! (naer)', 'Hello, is your fridge running? Then you better go catch it! (laughter)'),
  P('Тут у соседа кот наркотиками торгует! Ха-ха-ха!', 'Mu naabri kass müüb narkot! Hahaha!', "My neighbour's cat is dealing drugs! Hahaha!"),
  P('У нас тут НЛО приземлилось, инопланетяне хотят поговорить с полицией.', 'Meil maandus UFO, tulnukad tahavad politseiga rääkida.', 'A UFO has landed here, the aliens want to talk to the police.'),
  P('Алло… (хихиканье на фоне) …у нас ограбление… чипсов!', 'Halloo… (taustal itsitamine) …meil on rööv… krõpsuröövel!', 'Hello… (giggling in the background) …there’s a robbery… a crisps robber!'),
];

const PRANK_ANSWERS: Partial<Record<CallQuestionId, Phrase[]>> = {
  where: [
    P('Адрес? Э… Кремль, третий этаж. (хихиканье)', 'Aadress? Ee… Valge Maja, Washington. (itsitamine)', 'The address? Er… the White House, Washington. (giggling)'),
    P('На Луне, третий кратер слева.', 'Kuu peal, kolmas kraater vasakult.', 'On the Moon, third crater on the left.'),
  ],
  what: [P('Ну это… кот украл колбасу! Ха-ха!', 'Noh… kass varastas vorsti! Hahaa!', 'Well… the cat stole a sausage! Haha!')],
  injured: [P('Да, все ранены! …нет, никто. (смех)', 'Jah, kõik on vigastatud! …ei, tegelikult mitte keegi. (naer)', "Yes, everyone's hurt! …no, actually nobody. (laughter)")],
  weapons: [P('У него банан! Очень опасный банан.', 'Tal on banaan! Väga ohtlik banaan.', 'He has a banana! A very dangerous banana.')],
  suspect: [P('Он зелёный и с тремя глазами. (смех на фоне)', 'Ta on roheline ja kolme silmaga. (taustal naer)', "He's green with three eyes. (laughter in the background)")],
  vehicle: [P('Уехал на санках, номер 007.', 'Ta sõitis minema kelguga, number 007.', 'He left on a sledge, plate 007.')],
  direction: [P('Он улетел, прямо вверх!', 'Ta lendas ära, otse üles!', 'He flew away, straight up!')],
  count: [P('Их миллион! Или два.', 'Neid on miljon! Või kaks.', 'There are a million of them! Or two.')],
  when: [P('Завтра. (смех)', 'Homme. (naer)', 'Tomorrow. (laughter)')],
  name: [P('Меня зовут… Калевипоэг. (хихиканье)', 'Minu nimi on… Kalevipoeg. (itsitamine)', 'My name is… Kalevipoeg. (giggling)')],
  safe: [P('Я в полной безопасности на диване, ха-ха.', 'Ma olen täitsa turvaliselt diivanil, hahaa.', "I'm perfectly safe on the sofa, haha.")],
  children: [P('Только мой младший брат тут хихикает.', 'Ainult mu väike vend itsitab siin.', 'Only my little brother giggling here.')],
  intoxicated: [P('Я? Нет, я не пью. (звон бутылок)', 'Mina? Ei, mina ei joo. (taustal pudelite kõlin)', "Me? No, I don't drink. (bottles clinking)")],
};

const CLOSING: Record<'create' | 'prank' | 'advice', Phrase> = {
  create: P(
    'Понятно. Полиция уже едет. Оставайтесь на связи и перезвоните, если что-то изменится.',
    'Selge. Politsei on teel. Jääge telefoni lähedale ja helistage kohe tagasi, kui olukord muutub.',
    'Understood. The police are on their way. Stay by the phone and call back straight away if anything changes.',
  ),
  prank: P('Ложный вызов наказуем. Заканчиваю разговор.', 'Valeväljakutse tegemine on karistatav. Lõpetan kõne.', 'Making a false emergency call is punishable. I am ending the call.'),
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
  sotsiaal: { et: 'lastekaitse ja sotsiaaltöö', en: 'child protection and social services', ru: 'социальная служба и защита детей' },
  merepaaste: { et: 'merepääste', en: 'maritime rescue', ru: 'морская спасательная служба' },
  tolliamet: { et: 'Maksu- ja Tolliamet', en: 'the Tax and Customs Board', ru: 'Налогово-таможенный департамент' },
  transpordiamet: { et: 'Transpordiamet', en: 'the Transport Administration', ru: 'Транспортный департамент' },
  veterinaar: { et: 'veterinaar- ja toiduamet', en: 'the veterinary and food board', ru: 'ветеринарная служба' },
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

const RU_TOWNS = new Set(['Narva', 'Sillamäe', 'Narva-Jõesuu', 'Kohtla-Järve', 'Jõhvi', 'Maardu', 'Paldiski', 'Kiviõli', 'Püssi', 'Kallaste', 'Mustvee']);

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
  return low(`${tpl?.id ?? inc.templateId} ${tpl?.title.et ?? inc.title.et} ${(tpl?.tags ?? inc.tags).join(' ')}`);
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
  const ref = inc.vehicles.find((v) => v.role === 'suspect') ?? inc.vehicles.find((v) => v.role === 'involved') ?? inc.vehicles[0];
  if (!ref) return undefined;
  return s.vehicles[ref.plate] ?? Object.values(s.vehicles).find((v) => v.plate.replace(/\s/g, '') === ref.plate.replace(/\s/g, ''));
}

/** Map an incident to a phrasebook situation. */
export function situationOf(inc: Incident, tpl?: IncidentTemplate, s?: SimState): Situation {
  const txt = textOf(tpl, inc);
  const tags = new Set(tpl?.tags ?? inc.tags);
  const has = (...w: string[]) => w.some((x) => txt.includes(x));
  switch (inc.category) {
    case 'domestic':
      return h01(inc, 'sit') < 0.4 ? 'domestic_neighbour' : 'domestic';
    case 'violence':
      if (tags.has('weapon_gun') || has('tulist', 'lask', 'shoot')) return 'shots';
      if (tags.has('weapon_knife') || has('puss', 'nuga', 'knife')) return 'knife';
      return 'fight';
    case 'public_order':
      if (has('öörahu', 'müra', 'lärm', 'pidu', 'noise', 'sünnipäev', 'muusika')) return 'noise';
      if (has('joob', 'purjus', 'drunk')) return 'drunk_person';
      if (tags.has('weapon_knife')) return 'knife';
      if (has('kahtlane', 'suspicious', 'jälit', 'pildistab')) return 'suspicious';
      return 'fight';
    case 'property':
      if (has('auto', 'sõiduk', 'car_theft')) return 'car_theft';
      if (has('pood', 'kauplus', 'shoplift')) return 'shoplift';
      if (has('sissemurd', 'murdvargus', 'burglary', 'korteri', 'suvila')) return (inc.truePriority <= 2 || tags.has('in_progress')) ? 'burglary_progress' : 'burglary';
      if (has('rööv', 'robbery')) return tags.has('weapon_gun') ? 'shots' : 'theft';
      return 'theft';
    case 'traffic':
      if (has('joobes juht', 'purjus juht', 'joobes autojuht', 'purjus autojuht', 'drunk_driver', 'drunk driver', 'joobes_juht')) return 'drunk_driver';
      if (has('õnnetus', 'avarii', 'kokkupõrge', 'accident', 'crash', 'jalakäija')) return 'accident';
      if (has('põder', 'loom', 'hobune', 'animal')) return 'animal';
      return 'traffic';
    case 'drugs':
      return 'drugs';
    case 'missing': {
      const m = s ? personByRole(s, inc, 'missing', 'victim') : undefined;
      if (m && s && safe(() => ageOf(m, s.now), 30) < 14) return 'missing_child';
      return has('laps', 'child', 'koolilaps', 'poeg', 'tütar') ? 'missing_child' : 'missing_adult';
    }
    case 'alarm':
      return 'alarm';
    case 'assist':
      if (has('koer', 'loom', 'animal', 'hobune', 'põder')) return 'animal';
      return 'assist';
    case 'fraud':
      return 'fraud';
    case 'border':
      return 'border';
    case 'environment':
      if (has('koer', 'loom', 'animal')) return 'animal';
      return 'environment';
    case 'major':
      if (has('pomm', 'lõhke', 'bomb', 'pakk')) return 'bomb';
      if (tags.has('weapon_gun') || has('tulist', 'lask', 'relv')) return 'shots';
      return 'knife';
    case 'easter':
      return 'easter';
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
      return P(`короткая стрижка, ${c.ru} волосы`, `siilisoenguga, ${c.et} juuksed`, `buzz cut, ${c.en} hair`);
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
 * Witness-style description in all three languages from the appearance enums. Clothing is free
 * Estonian/English text, so it is only added when `withClothing` (not for Russian callers, whose
 * original line could not contain it).
 */
export function witnessDescription(p: Person, now: number, withClothing = true): Phrase {
  const a = p.appearance;
  const age = Math.max(5, Math.round(safe(() => ageOf(p, now), 35) / 5) * 5);
  const male = p.gender === 'M';
  const parts: Phrase[] = [
    male ? P(`мужчина, лет ${age}`, `mees, umbes ${age}-aastane`, `a man, about ${age}`) : P(`женщина, лет ${age}`, `naine, umbes ${age}-aastane`, `a woman, about ${age}`),
  ];
  if (a) {
    const hgt = Math.round(a.heightCm / 5) * 5;
    parts.push(P(`рост около ${hgt}`, `u ${hgt} cm pikk`, `around ${hgt} cm`));
    const b = BUILD[a.build];
    parts.push(male || a.build !== 'slim' ? b : P('худая', b.et, b.en));
    parts.push(hairPhrase(a));
    if (a.beard && male) parts.push(BEARD[a.beard]);
    if (a.glasses) parts.push(P('в очках', 'prillidega', 'glasses'));
  }
  const out = P(parts.map((x) => x.ru).join(', '), parts.map((x) => x.et).join(', '), parts.map((x) => x.en).join(', '));
  if (withClothing && a?.clothing) {
    out.et += /^(seljas|jalas|peas|kannab)/i.test(a.clothing.et) ? `; ${a.clothing.et}` : `, seljas ${a.clothing.et}`;
    out.en += /^(wearing|in |dressed)/i.test(a.clothing.en) ? `; ${a.clothing.en}` : `, wearing ${a.clothing.en}`;
  }
  return out;
}

const COLOR_RU: [RegExp, string][] = [
  [/tumesinine/, 'тёмно-синий'],
  [/helesinine/, 'голубой'],
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

function vehiclePhrase(v: Vehicle): Phrase {
  const colorEt = low(v.color.et);
  const ru = COLOR_RU.find(([re]) => re.test(colorEt))?.[1] ?? '';
  const et = safe(() => describeVehicle(v), { et: `${colorEt} ${v.make} ${v.model}`, en: `${low(v.color.en)} ${v.make} ${v.model}` });
  // describeVehicle may already include the plate in parentheses; strip it for the "car" slot.
  const strip = (x: string) => x.replace(/\s*\([^)]*\)\s*$/, '');
  return P(`${ru ? ru + ' ' : ''}${v.make} ${v.model}`.trim(), strip(et.et), strip(et.en));
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
    return P(st.name, st.name, st.name);
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

function factsOf(inc: Incident, tpl?: IncidentTemplate): Facts {
  const tags = new Set([...(tpl?.tags ?? []), ...inc.tags]);
  const txt = textOf(tpl, inc);
  const kiirabi = inc.agencyNeeds.some((a) => a.agency === 'kiirabi') || (tpl?.agencies ?? []).some((a) => a.agency === 'kiirabi' && a.chance >= 0.5);
  const injuredTag = tags.has('injury') || tags.has('injured') || tags.has('stabbing');
  let injured: Facts['injured'] = 'no';
  if (kiirabi || injuredTag) injured = 'yes';
  else if ((inc.category === 'violence' || inc.category === 'domestic' || inc.category === 'major') && inc.truePriority <= 2) injured = h01(inc, 'inj') < 0.5 ? 'yes' : 'unknown';
  else if (inc.category === 'traffic' && txt.includes('õnnetus')) injured = h01(inc, 'inj') < 0.35 ? 'yes' : 'no';

  let weapon: Facts['weapon'] = 'none';
  if (tags.has('weapon_gun')) weapon = 'gun';
  else if (tags.has('weapon_knife')) weapon = 'knife';
  else if (tags.has('armed') || tags.has('weapon')) weapon = h01(inc, 'wpn') < 0.5 ? 'maybe' : 'knife';
  else if ((inc.category === 'domestic' || inc.category === 'violence') && h01(inc, 'wpn') < 0.12) weapon = 'maybe';

  const suspects = inc.persons.filter((r) => r.role === 'suspect').length;
  let count = Math.max(1, suspects + inc.persons.filter((r) => r.role === 'victim').length);
  if (tags.has('group') || tags.has('gang')) count = 3 + Math.floor(h01(inc, 'cnt') * 4);
  if (tags.has('crowd') || tags.has('mass')) count = 25;

  const childSpec = (tpl?.persons ?? []).some((p) => p.relation === 'child' || (p.age && p.age[1] < 14));
  const children = childSpec || tags.has('children') || tags.has('child') || (inc.category === 'domestic' && h01(inc, 'kids') < 0.4);

  const intoxChance = Math.max(0, ...(tpl?.persons ?? []).filter((p) => p.role === 'suspect' || p.role === 'driver').map((p) => p.intoxicated ?? 0));
  let intoxicated: Facts['intoxicated'] = 'unknown';
  if (tags.has('drunk') || tags.has('alcohol') || tags.has('intoxicated') || txt.includes('joob') || txt.includes('purjus')) intoxicated = 'yes';
  else if (intoxChance > 0) intoxicated = h01(inc, 'intox') < intoxChance ? 'yes' : h01(inc, 'intox2') < 0.5 ? 'no' : 'unknown';
  else if (inc.category === 'fraud' || inc.category === 'missing' || inc.category === 'alarm') intoxicated = 'no';

  const inProgress = inc.truePriority <= 2 || tags.has('in_progress');
  const fled = tags.has('fled') || tags.has('vehicle_flee') || tags.has('escaped') || tags.has('bolo') || inc.category === 'property' || (inc.category === 'violence' && h01(inc, 'fled') < 0.4);
  const byCar = tags.has('vehicle_flee') || inc.vehicles.some((v) => v.role === 'suspect');
  const minutesAgo = inProgress ? 0 : inc.truePriority === 3 ? 10 + Math.floor(h01(inc, 'ago') * 35) : 30 + Math.floor(h01(inc, 'ago') * 150);
  return { injured, weapon, count, children, intoxicated, inProgress, fled, byCar, minutesAgo };
}

function varsFor(s: SimState, inc: Incident): Vars {
  const suspect = personByRole(s, inc, 'suspect', 'missing');
  const victim = personByRole(s, inc, 'victim');
  const v = suspectVehicle(s, inc);
  const short = (p: Person | undefined): string | Text | undefined => {
    if (!p) return undefined;
    const age = safe(() => ageOf(p, s.now), 35);
    return p.gender === 'M' ? { et: `mees, ${age}a`, en: `man, ${age}` } : { et: `naine, ${age}a`, en: `woman, ${age}` };
  };
  return {
    address: inc.location.address,
    place: inc.location.placeName ?? inc.location.address,
    city: inc.location.city,
    district: inc.location.district ?? inc.location.city,
    suspect: short(suspect),
    suspectName: suspect ? `${suspect.firstName} ${suspect.lastName}` : undefined,
    victim: short(victim),
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
  };
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

function deriveMood(s: SimState, inc: Incident, tpl: IncidentTemplate | undefined, rng: Rng): CallerMood {
  if (tpl?.call?.mood) return tpl.call.mood;
  const caller = callerPerson(s, inc);
  const age = caller ? safe(() => ageOf(caller, s.now), 40) : 40;
  if (age < 14) return 'child';
  const victim = personByRole(s, inc, 'victim', 'missing');
  const victimAge = victim ? safe(() => ageOf(victim, s.now), 30) : 30;
  if (victimAge < 12 && caller === undefined && rng.chance(0.25)) return 'child';
  if (age >= 72) return inc.category === 'missing' || rng.chance(0.25) ? (rng.chance(0.7) ? 'elderly' : 'confused') : 'elderly';
  const hour = wall(s.now).hour;
  const night = hour >= 22 || hour < 5;
  if (inc.truePriority === 1) {
    if ((inc.category === 'domestic' || situationOf(inc, tpl, s) === 'burglary_progress') && rng.chance(0.3)) return 'whisper';
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
    else if (s.regionId === 'pohja') p = inc.location.district === 'Lasnamäe' ? 0.55 : inc.location.city === 'Tallinn' ? 0.3 : 0.15;
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
  if (call.lang === 'ru' && call.interpreter) ms += INTERPRETER_DELAY_MS * (s.flags['upg:interpreter_line'] ? 0.25 : 1);
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
const NO_PRE = /^(Ma ei tea|Ma pole|Ei[ ,.!]|Minu nimi|Jah[,.!…]|Üks inimene|Mitte kuhugi|Oi, ma|Mis aadress|Oot)/;

function styled(call: ActiveCall, p: Phrase, rng: Rng, q?: CallQuestionId): Phrase {
  const f = MOOD_FILLERS[call.mood];
  if (!f) return p;
  let out = { ...p };
  if (call.mood === 'panic' && q !== 'suspect') {
    const frag = (x: string) => x.replace(/, /g, '… ');
    out = { ru: frag(out.ru), et: frag(out.et), en: frag(out.en) };
  }
  const skipPre = q === 'name' || NO_PRE.test(p.et);
  if (!skipPre && rng.chance(f.pPre)) {
    const pre = rng.pick(f.pre);
    const lc = (x: string) => (x.length > 1 && x[1] === x[1].toLowerCase() ? x[0].toLowerCase() + x.slice(1) : x);
    out = { ru: pre.ru + lc(out.ru), et: pre.et + lc(out.et), en: pre.en + lc(out.en) };
  }
  if (rng.chance(f.pPost)) {
    const post = rng.pick(f.post);
    out = { ru: out.ru + post.ru, et: out.et + post.et, en: out.en + post.en };
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

function openingPhrase(s: SimState, call: ActiveCall, inc: Incident, tpl: IncidentTemplate | undefined, rng: Rng): Phrase {
  if (call.prank) return rng.pick(PRANK_OPENINGS);
  const vars = varsFor(s, inc);
  const sit = situationOf(inc, tpl, s);
  const built = rng.pick(OPENINGS[sit]);
  if (call.lang === 'ru') {
    const ruLines = tpl?.call?.openingRu ?? [];
    if (ruLines.length > 0) {
      const i = rng.int(0, ruLines.length - 1);
      const tr = tpl?.call?.opening[i] ?? tpl?.call?.opening[0] ?? tpl?.callerLines?.[0] ?? built;
      const trf = fillText({ et: tr.et, en: tr.en }, vars);
      return { ru: fill(ruLines[i], vars), et: trf.et, en: trf.en };
    }
    return built;
  }
  const pool = tpl?.call?.opening?.length ? tpl.call.opening : tpl?.callerLines?.length ? tpl.callerLines : undefined;
  if (pool) {
    const t = fillText(rng.pick(pool), vars);
    return { ru: built.ru, et: t.et, en: t.en };
  }
  return built;
}

// ─────────────────────────────────────────────────────────────────────────────
// Answers
// ─────────────────────────────────────────────────────────────────────────────

interface Answer {
  phrase: Phrase;
  informative: boolean;
  fact?: Text;
}

function generateAnswer(s: SimState, call: ActiveCall, inc: Incident, tpl: IncidentTemplate | undefined, q: CallQuestionId, rng: Rng): Answer {
  if (call.prank) {
    const pool = PRANK_ANSWERS[q] ?? PRANK_ANSWERS.what!;
    return { phrase: rng.pick(pool), informative: true };
  }
  // Unhelpful first answers for difficult moods (asking again always works).
  if (!call.asked.includes(q) && q !== 'name') {
    if (call.mood === 'panic' && rng.chance(0.25)) return { phrase: ANSWERS.unhelpful_panic, informative: false };
    if (call.mood === 'drunk' && q === 'where' && rng.chance(0.4)) return { phrase: ANSWERS.unhelpful_drunk, informative: false };
    if (call.mood === 'confused' && rng.chance(0.25)) return { phrase: ANSWERS.unhelpful_confused, informative: false };
  }

  const loc = inc.location;
  const v: Record<string, string> = {
    address: loc.address,
    city: loc.city,
    place: loc.placeName ?? loc.address,
  };
  const ruCity = RU_CITY[loc.city];

  // Template-scripted answers (Estonian callers; Russian callers keep the phrasebook so original & translation match).
  const scripted = tpl?.call?.answers?.[q];
  if (scripted?.length && call.lang !== 'ru') {
    const t = fillText(rng.pick(scripted), varsFor(s, inc));
    return { phrase: { ru: t.et, et: t.et, en: t.en }, informative: true, fact: { et: `Helistaja: ${t.et}`, en: `Caller: ${t.en}` } };
  }

  const f = factsOf(inc, tpl);
  switch (q) {
    case 'where': {
      const k = loc.placeKind;
      if (k === 'highway') return { phrase: fillPhrase(ANSWERS.where_road, v), informative: true, fact: fact(`asukoht ${loc.address}`, `location ${loc.address}`) };
      if (['forest', 'lake', 'ruralroad', 'farm', 'summerhouse', 'village'].includes(k) && rng.chance(0.4)) {
        return { phrase: fillPhrase(ANSWERS.where_rural, v), informative: true, fact: fact(`asukoht ligikaudu ${loc.address}`, `approximate location ${loc.address}`) };
      }
      if (loc.placeName && loc.placeName !== loc.address) {
        return { phrase: fillPhrase(ANSWERS.where_place, v), informative: true, fact: fact(`aadress kinnitatud — ${loc.placeName}, ${loc.address}`, `address confirmed — ${loc.placeName}, ${loc.address}`) };
      }
      const addr = fillPhrase(ANSWERS.where_addr, v);
      if (ruCity) addr.ru = addr.ru.replace(`, ${loc.city}.`, `, ${ruCity}.`);
      return { phrase: addr, informative: true, fact: fact(`aadress kinnitatud — ${loc.address}, ${loc.city}`, `address confirmed — ${loc.address}, ${loc.city}`) };
    }
    case 'what': {
      const sit = situationOf(inc, tpl, s);
      const opening = call.lines.find((l) => l.who === 'caller');
      let ph: Phrase | undefined;
      if (call.lang !== 'ru' && tpl?.callerLines?.length) {
        const pool = tpl.callerLines.filter((l) => l.et !== opening?.text.et);
        const t = fillText(rng.pick(pool.length ? pool : tpl.callerLines), varsFor(s, inc));
        ph = { ru: t.et, et: t.et, en: t.en };
      }
      if (!ph) {
        const pool = OPENINGS[sit].filter((x) => x.ru !== opening?.ru && x.et !== opening?.text.et);
        ph = rng.pick(pool.length ? pool : OPENINGS[sit]);
      }
      // Estonian callers may add one detail the HK card does not show yet.
      const extra = call.lang !== 'ru' && inc.hiddenDetails[0] ? fillText(inc.hiddenDetails[0], varsFor(s, inc)) : undefined;
      if (extra) ph = { ru: ph.ru, et: `${ph.et} Ja veel — ${lcFirst(extra.et)}`, en: `${ph.en} And also — ${lcFirst(extra.en)}` };
      return { phrase: ph, informative: true, fact: extra ? { et: `Helistaja lisab: ${extra.et}`, en: `Caller adds: ${extra.en}` } : undefined };
    }
    case 'injured':
      if (f.injured === 'yes') return { phrase: ANSWERS.injured_yes, informative: true, fact: fact('on vigastatu(id), vajalik kiirabi', 'there are injured, ambulance needed') };
      if (f.injured === 'unknown') return { phrase: ANSWERS.injured_unknown, informative: true, fact: fact('vigastused teadmata', 'injuries unknown') };
      return { phrase: ANSWERS.injured_no, informative: true, fact: fact('vigastatuid ei ole', 'no injuries') };
    case 'weapons':
      if (f.weapon === 'gun') return { phrase: ANSWERS.weapon_gun, informative: true, fact: fact('isikul on TULIRELV', 'the person has a FIREARM') };
      if (f.weapon === 'knife') return { phrase: ANSWERS.weapon_knife, informative: true, fact: fact('isikul on NUGA', 'the person has a KNIFE') };
      if (f.weapon === 'maybe') return { phrase: ANSWERS.weapon_maybe, informative: true, fact: fact('võimalik relv käes', 'possibly holding a weapon') };
      return { phrase: ANSWERS.weapon_none, informative: true, fact: fact('relva ei näinud', 'no weapon seen') };
    case 'suspect': {
      const p = personByRole(s, inc, 'suspect', 'missing', 'driver');
      if (!p) return { phrase: ANSWERS.suspect_nobody, informative: true };
      const hour = wall(s.now).hour;
      if ((hour >= 22 || hour < 5) && inc.category !== 'missing' && h01(inc, 'dark') < 0.2) return { phrase: ANSWERS.suspect_none, informative: true, fact: fact('isikut ei näinud', 'did not see the person') };
      const w = witnessDescription(p, s.now, call.lang !== 'ru');
      let desc: Phrase = w;
      if (call.lang !== 'ru') {
        const d = safe(() => describePerson(p, s.now), { et: w.et, en: w.en });
        desc = { ru: w.ru, et: d.et, en: d.en };
      }
      return {
        phrase: capPhrase(fillPhrase(ANSWERS.suspect_desc, { desc: '§' }, desc)),
        informative: true,
        fact: { et: `Kirjeldus: ${desc.et}`, en: `Description: ${desc.en}` },
      };
    }
    case 'vehicle': {
      const veh = suspectVehicle(s, inc);
      if (!veh || (!f.byCar && inc.category !== 'traffic')) return { phrase: ANSWERS.vehicle_none, informative: true, fact: fact('sõidukit ei ole / jalgsi', 'no vehicle / on foot') };
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
        fact: { et: `Sõiduk: ${vp.et}, reg nr osaliselt ${part}`, en: `Vehicle: ${vp.en}, partial plate ${part}` },
      };
    }
    case 'direction': {
      if (!f.fled) return { phrase: ANSWERS.direction_here, informative: true, fact: fact('kahtlustatav on endiselt kohal', 'suspect still on scene') };
      if (h01(inc, 'dirk') < 0.15) return { phrase: ANSWERS.direction_unknown, informative: true, fact: fact('liikumissuund teadmata', 'direction unknown') };
      const d = directionPhrase(s, inc);
      return {
        phrase: fillPhrase(f.byCar ? ANSWERS.direction_car : ANSWERS.direction, { dir: '§' }, d),
        informative: true,
        fact: { et: `Liikumissuund: ${d.et} suunas${f.byCar ? ' (sõidukiga)' : ' (jalgsi)'}`, en: `Direction: towards ${d.en}${f.byCar ? ' (by vehicle)' : ' (on foot)'}` },
      };
    }
    case 'count':
      if (f.count >= 20) return { phrase: ANSWERS.count_many, informative: true, fact: fact('palju inimesi (kümneid)', 'many people (dozens)') };
      if (f.count === 1) return { phrase: ANSWERS.count_one, informative: true, fact: fact('üks isik', 'one person') };
      return { phrase: fillPhrase(ANSWERS.count, { n: String(f.count) }), informative: true, fact: fact(`isikuid umbes ${f.count}`, `about ${f.count} people`) };
    case 'when': {
      if (f.inProgress) return { phrase: ANSWERS.when_now, informative: true, fact: fact('toimub praegu', 'happening right now') };
      if (f.minutesAgo > 120 && (inc.category === 'property' || inc.category === 'fraud')) return { phrase: ANSWERS.when_night, informative: true, fact: fact('toimus öösel / varem', 'happened overnight / earlier') };
      const time = hhmm(inc.createdAt - f.minutesAgo * 60_000);
      const m = String(Math.round(f.minutesAgo / 5) * 5 || 5);
      return { phrase: fillPhrase(ANSWERS.when_ago, { m, time }), informative: true, fact: fact(`toimus u kell ${time}`, `happened around ${time}`) };
    }
    case 'name': {
      const person = callerPerson(s, inc);
      const name = person ? `${person.firstName} ${person.lastName}` : inc.caller?.name;
      const anon = !name || ((inc.category === 'drugs' || inc.category === 'public_order') && h01(inc, 'anon') < 0.2);
      if (anon) return { phrase: ANSWERS.name_anon, informative: true, fact: fact('soovib jääda anonüümseks', 'wishes to stay anonymous') };
      const phone = inc.caller?.phone ? `, tel ${inc.caller.phone}` : '';
      return { phrase: fillPhrase(ANSWERS.name, { name }), informative: true, fact: { et: `Helistaja: ${name}${phone}`, en: `Caller: ${name}${phone}` } };
    }
    case 'safe': {
      const danger = (inc.category === 'domestic' || inc.category === 'violence' || inc.category === 'major') && inc.truePriority <= 2;
      if (danger && call.mood === 'whisper') return { phrase: ANSWERS.safe_hiding, informative: true, fact: fact('peidab end, ei ole ohutus kohas', 'hiding, not safe') };
      if (danger && h01(inc, 'safe') < 0.4) return { phrase: ANSWERS.safe_no, informative: true, fact: fact('ei ole ohutus kohas, ründaja lähedal', 'not safe, attacker nearby') };
      return { phrase: ANSWERS.safe_yes, informative: true, fact: fact('on ohutus kohas', 'is in a safe place') };
    }
    case 'children':
      return f.children
        ? { phrase: ANSWERS.children_yes, informative: true, fact: fact('kohal on LAPSED', 'CHILDREN present') }
        : { phrase: ANSWERS.children_no, informative: true, fact: fact('lapsi kohal ei ole', 'no children present') };
    case 'intoxicated':
      if (f.intoxicated === 'yes') return { phrase: ANSWERS.intox_yes, informative: true, fact: fact('isik on joobes', 'person is intoxicated') };
      if (f.intoxicated === 'no') return { phrase: ANSWERS.intox_no, informative: true, fact: fact('isik tundub kaine', 'person seems sober') };
      return { phrase: ANSWERS.intox_unknown, informative: true, fact: fact('joove teadmata', 'intoxication unknown') };
  }
  return { phrase: ANSWERS.injured_unknown, informative: false };
}

function lcFirst(x: string): string {
  return x ? x.charAt(0).toLowerCase() + x.slice(1) : x;
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
  if (s.calls.some((c) => c.endedAt === undefined)) return null;
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
    emit(s, { type: 'call_ring', incidentId: inc.id, text: { et: 'Häirekeskus ühendab kõnet', en: 'Emergency centre transferring a call' } });
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
        pushSystem(s, call, { et: 'Kõnele ei vastatud. Häirekeskus edastas sündmuse kaardina.', en: 'Call not answered. The emergency centre forwarded the event as a card.' });
        inc.source = 'hk';
        if (!inc.tags.includes('call:missed')) inc.tags.push('call:missed');
        s.stats.callsMissed++;
        addTimeline(s, inc, 'hk', { et: 'Häirekeskus: 112-kõne jäi juhtimiskeskuses vastamata, sündmus edastati kaardina.', en: 'Emergency centre: the 112 transfer went unanswered, event forwarded as a card.' });
        emit(s, { type: 'call_missed', incidentId: inc.id, text: { et: 'Vastamata 112-kõne', en: 'Missed 112 call' } });
        // publishIncident clears the hidden flag itself (and shifts expiry timers by the ring time).
        safe(() => publishIncident(s, inc), undefined);
        delete s.flags[`hidden:${inc.id}`];
      }
      continue;
    }
    // Answered but abandoned by the dispatcher → caller hangs up, HK creates the card with its own priority.
    const lastDispatcher = Math.max(call.answeredAt, ...call.lines.filter((l) => l.who === 'dispatcher').map((l) => l.t));
    if (s.now - lastDispatcher > IDLE_HANGUP_MS) {
      pushSystem(s, call, { et: 'Helistaja katkestas kõne. Häirekeskus vormistas sündmuse.', en: 'The caller hung up. The emergency centre filed the event.' });
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
      ? { et: 'Häirekeskus ühendas kõne. Helistaja räägib vene keeles.', en: 'Call connected by the emergency centre. The caller speaks Russian.' }
      : { et: 'Häirekeskus ühendas kõne.', en: 'Call connected by the emergency centre.' },
  );
  pushDispatcher(s, call, GREETING);
  if (!inc) return;
  withRng(s, (rng) => {
    const opening = openingPhrase(s, call, inc, tplOf(inc), rng);
    pushCaller(s, call, styled(call, opening, rng), rng);
  });
  addTimeline(s, inc, 'hk', { et: '112-kõne ühendati juhtimiskeskusega.', en: '112 call connected to the command centre.' });
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
    let phrase = styled(call, ans.phrase, rng, q);
    if (askedBefore && call.learned.includes(q) && !call.prank && call.mood !== 'confused') {
      const r = ANSWERS.repeat;
      phrase = { ru: r.ru + lcFirst(phrase.ru), et: r.et + lcFirst(phrase.et), en: r.en + lcFirst(phrase.en) };
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
    pushSystem(s, call, { et: 'Tõlk liitus kõnega (vene keel).', en: 'An interpreter joined the call (Russian).' });
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

function finishCreate(s: SimState, call: ActiveCall, inc: Incident, tpl: IncidentTemplate | undefined, priority: Priority, byPlayer: boolean): void {
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
      setTag(inc, tpl?.referral || inc.referral ? (inc.referral && d.agency && inc.referral !== d.agency ? 'class:off1' : 'class:ok') : 'class:off2');
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
