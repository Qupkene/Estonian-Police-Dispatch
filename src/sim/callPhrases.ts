/**
 * Phrasebook for interactive 112 callers (DESIGN §4.11), used by calls.ts.
 *
 * Russian-speaking callers need a Russian original next to the Estonian/English translation. Most
 * templates only script Estonian lines, so a Russian caller describes the incident with the
 * situation phrases below. Each template maps to the situation that describes THAT incident
 * (SITUATION_BY_TEMPLATE); the keyword heuristic in calls.ts only covers templates added later.
 * Every situation has a priority band so a calm P3/P4 matter never sounds like an emergency and
 * the other way round (tests/calls-text.test.ts checks every template).
 *
 * Gendered forms inside a phrase:
 *  - `{m|f}` follows the CALLER's gender (Russian past tense: "я видел" / "я видела");
 *  - `[m|f|n]` follows the gender of the person the caller talks about (suspect, missing person…):
 *    m = man, f = woman, n = not known (defaults to m when left out). English uses it for
 *    he/she/they, Russian for он/она.
 * Estonian needs neither ("ta" is gender-neutral).
 */

export type Phrase = { ru: string; et: string; en: string };
export const P = (ru: string, et: string, en: string): Phrase => ({ ru, et, en });

export type Situation =
  // domestic
  | 'domestic'
  | 'domestic_neighbour'
  | 'domestic_child'
  | 'domestic_argument'
  | 'harassment'
  | 'order_breach'
  | 'child_neglect'
  | 'child_injured'
  // violence and public order
  | 'fight'
  | 'party_fight'
  | 'fight_after'
  | 'assault_minor'
  | 'aggressive_person'
  | 'road_rage'
  | 'threat'
  | 'stalking'
  | 'knife'
  | 'shots'
  | 'gun_threat'
  | 'hostage'
  | 'riot'
  | 'prison_riot'
  | 'found_victim'
  | 'found_body'
  | 'welfare'
  | 'noise'
  | 'dispute'
  | 'nuisance'
  | 'pestering'
  | 'drunk_person'
  | 'drunk_lying'
  | 'person_lying'
  | 'person_on_road'
  // property
  | 'burglary'
  | 'burglary_cottage'
  | 'burglary_progress'
  | 'intrusion'
  | 'theft_progress'
  | 'theft_after'
  | 'bike_theft'
  | 'shoplift'
  | 'robbery'
  | 'armed_robbery'
  | 'street_robbery'
  | 'car_theft'
  | 'theft_from_car'
  | 'burned_car'
  | 'vandalism'
  | 'vandalism_after'
  | 'tip'
  // traffic
  | 'accident'
  | 'single_crash'
  | 'fender_bender'
  | 'hit_and_run'
  | 'animal_collision'
  | 'rail_accident'
  | 'rail_person'
  | 'wrong_way'
  | 'drunk_driver'
  | 'drunk_driver_parked'
  | 'drunk_driver_home'
  | 'driver_asleep'
  | 'racing'
  | 'traffic'
  | 'traffic_lights'
  | 'traffic_tip'
  | 'child_in_car'
  // drugs
  | 'drug_dealing'
  | 'drug_smell'
  | 'drug_found'
  | 'overdose'
  | 'drugged_person'
  | 'syringes'
  | 'weapon_deal'
  // missing persons
  | 'missing_child'
  | 'lost_child'
  | 'missing_youth'
  | 'missing_adult'
  | 'missing_dementia'
  | 'missing_patient'
  | 'lost_forest'
  | 'lost_self'
  | 'abduction'
  | 'adrift'
  | 'adrift_self'
  | 'drowning'
  // assistance
  | 'unwell'
  | 'injured_person'
  | 'ambulance_help'
  | 'child_alone'
  | 'child_locked'
  | 'child_not_collected'
  | 'child_screams'
  | 'suicide'
  | 'suicide_risk'
  | 'gas'
  | 'fire'
  | 'fire_outdoor'
  | 'road_blocked'
  | 'climbers'
  | 'ordnance'
  | 'fallen_self'
  | 'dog'
  | 'dog_bite'
  | 'dog_dispute'
  | 'elk_road'
  | 'horse_road'
  | 'animal_road'
  | 'wildlife'
  | 'livestock_attack'
  | 'animal_cruelty'
  // fraud
  | 'scam'
  | 'scam_door'
  | 'scam_ongoing'
  | 'counterfeit'
  | 'forgery'
  | 'fraud_generic'
  | 'cyber'
  | 'fare_refusal'
  // border
  | 'border_crossing'
  | 'migrants'
  | 'smuggling'
  | 'customs'
  | 'border_check'
  | 'border_boat'
  | 'drone'
  // environment
  | 'pollution'
  | 'dumping'
  | 'logging'
  | 'offroad'
  | 'poaching'
  | 'illegal_fishing'
  // major incidents
  | 'bomb_threat'
  | 'suspicious_item'
  | 'major_accident'
  | 'hazard'
  | 'escape'
  | 'barricaded'
  | 'online_threat'
  | 'sabotage'
  | 'trafficking'
  | 'held_captive'
  | 'emergency'
  // other
  | 'suspicious_school'
  | 'car_tracker'
  | 'fleeing_vehicle'
  | 'suspicious'
  | 'alarm'
  | 'easter'
  | 'ufo'
  | 'generic';

/**
 * How urgent a situation sounds. 'urgent' phrases suit P1/P2 events only, 'calm' ones P3/P4 only,
 * 'any' fits both (the caller's wording does not decide the priority on its own).
 */
export type Band = 'urgent' | 'calm' | 'any';

interface SituationDef {
  band: Band;
  /** Two lines: an opening and a second line the caller uses when asked what happened. */
  lines: Phrase[];
}

const S = (band: Band, ...lines: Phrase[]): SituationDef => ({ band, lines });

export const SITUATIONS: Record<Situation, SituationDef> = {
  // ── Domestic ──────────────────────────────────────────────────────────────
  domestic: S(
    'urgent',
    P('[Он опять распускает руки|Она опять распускает руки], бьёт меня… помогите, пожалуйста!', 'Ta läks jälle käsitsi kallale, lööb mind… aidake, palun!', "[He's|She's|They're] attacking me again, hitting me… please help!"),
    P('[Он кричит|Она кричит] и швыряет вещи, я боюсь, что [он|она] меня убьёт!', 'Ta karjub ja loobib asju, ma kardan, et ta tapab mu!', "[He's|She's|They're] screaming and throwing things, I'm afraid [he'll|she'll|they'll] kill me!"),
  ),
  domestic_neighbour: S(
    'urgent',
    P('У соседей крики, кто-то зовёт на помощь!', 'Naabrite juures karjutakse, keegi hüüab appi!', "There's screaming at the neighbours', someone is calling for help!"),
    P('За стеной что-то падает, бьётся посуда, кто-то плачет.', 'Seina taga kukub midagi, nõud purunevad, keegi nutab.', 'Things are crashing behind the wall, dishes are breaking, someone is crying.'),
  ),
  domestic_child: S(
    'urgent',
    P('Папа бьёт маму… мне страшно.', 'Issi lööb emmet… mul on hirm.', "Daddy is hitting mummy… I'm scared."),
    P('Мама плачет, а папа кричит и всё ломает.', 'Emme nutab, issi karjub ja lõhub kõike.', 'Mummy is crying, daddy is shouting and breaking everything.'),
  ),
  domestic_argument: S(
    'calm',
    P('Соседи уже давно ругаются, кричат друг на друга.', 'Naabrid tülitsevad juba tükk aega ja karjuvad üksteise peale.', 'The neighbours have been arguing for ages, shouting at each other.'),
    P('Драки вроде нет, но лучше бы кто-нибудь проверил.', 'Kaklust vist ei ole, aga parem oleks, kui keegi üle vaataks.', "There doesn't seem to be any fighting, but it would be better if someone checked."),
  ),
  harassment: S(
    'calm',
    P('[Бывший не даёт|Бывшая не даёт] мне покоя, всё время меня преследует.', 'Endine elukaaslane ei jäta mind rahule, ta jälitab mind pidevalt.', 'My ex will not leave me alone, [he keeps|she keeps|they keep] following me.'),
    P('[Он опять писал и ждал|Она опять писала и ждала] меня у дома, я боюсь выходить.', 'Ta kirjutas jälle ja ootas mind maja juures, ma kardan väljas käia.', '[He|She|They] messaged again and waited for me outside the house, I am afraid to go out.'),
  ),
  order_breach: S(
    'urgent',
    P('[Ему|Ей] запрещено сюда подходить, а [он|она] опять ломится в дверь!', 'Tal on keelatud siia tulla, aga ta peksab jälle ust!', "[He's|She's|They're] banned from coming here, but [he's|she's|they're] banging on the door again!"),
    P('Дверь закрыта, но [он|она] не уходит и кричит.', 'Uks on lukus, aga ta ei lähe ära ja karjub.', "The door is locked, but [he won't go away and he's|she won't go away and she's|they won't go away and they're] shouting."),
  ),
  child_neglect: S(
    'any',
    P('Дети уже несколько часов плачут одни, мать, похоже, пьяная.', 'Lapsed nutavad juba mitu tundi üksi, ema on vist purjus.', 'The children have been crying alone for hours, the mother seems to be drunk.'),
    P('Из квартиры слышно, как плачут маленькие дети, взрослые не открывают.', 'Korterist on kuulda väikeste laste nuttu, täiskasvanud ust ei ava.', "You can hear small children crying in the flat, the adults won't open the door."),
  ),
  child_injured: S(
    'urgent',
    P('Ребёнок сильно травмирован, а объяснения родителей не сходятся.', 'Laps on raskelt vigastatud ja vanemate jutt ei klapi.', "The child is badly injured and the parents' story doesn't add up."),
    P('Мы подозреваем, что ребёнка избивали, нужна полиция.', 'Kahtlustame, et last on pekstud, politseid on vaja.', 'We suspect the child has been beaten, we need the police.'),
  ),

  // ── Violence and public order ─────────────────────────────────────────────
  fight: S(
    'urgent',
    P('Тут драка, человека бьют ногами!', 'Siin on kaklus, üht inimest peksavad jalgadega!', "There's a fight, they're kicking someone!"),
    P('Тут дерутся, разнимать никто не решается!', 'Siin kakeldakse ja keegi ei julge vahele minna!', "They're fighting here and nobody dares to step in!"),
  ),
  party_fight: S(
    'urgent',
    P('Тут на празднике один разбушевался, бросается на людей!', 'Siin peol läks üks täiesti hulluks ja kargab inimestele kallale!', 'Someone at the party here has gone berserk and is going for people!'),
    P('Все пьяные, началась драка, люди кричат.', 'Kõik on purjus, läks kakluseks, inimesed karjuvad.', "Everyone's drunk, a fight broke out, people are screaming."),
  ),
  fight_after: S(
    'calm',
    P('Ребёнка избили в школе, и это сняли на видео.', 'Last peksti koolis ja see filmiti üles.', 'A child was beaten up at school and it was filmed.'),
    P('Видео уже в интернете, родители в шоке.', 'Video on juba internetis, lapsevanemad on šokis.', 'The video is already online, the parents are in shock.'),
  ),
  assault_minor: S(
    'calm',
    P('Тут один ударил другого кулаком в лицо, теперь все спорят.', 'Siin lõi üks teist rusikaga näkku, nüüd vaidlevad kõik.', 'Someone punched another person in the face here, now everyone is arguing.'),
    P('Драка уже закончилась, но обстановка напряжённая.', 'Kaklus on läbi, aga õhkkond on pingeline.', 'The fight is over, but the atmosphere is tense.'),
  ),
  aggressive_person: S(
    'any',
    P('Тут человек ведёт себя агрессивно, кричит на всех и не успокаивается.', 'Siin käitub üks inimene agressiivselt, karjub kõigi peale ega rahune maha.', "Someone here is being aggressive, shouting at everyone and won't calm down."),
    P('Мы боимся, что [он|она] сейчас на кого-нибудь набросится.', 'Me kardame, et ta kargab kohe kellelegi kallale.', "We're afraid [he's|she's|they're] about to go for someone."),
  ),
  road_rage: S(
    'urgent',
    P('Водитель подрезал меня, вышел из машины и ударил!', 'Üks juht lõikas mulle ette, tuli autost välja ja lõi mind!', 'A driver cut me up, got out of the car and hit me!'),
    P('[Он агрессивный|Она агрессивная], бьёт по машине и кричит.', 'Ta on agressiivne, peksab autot ja karjub.', "[He's|She's|They're] aggressive, hitting the car and shouting."),
  ),
  threat: S(
    'any',
    P('Мне угрожают, я боюсь за себя.', 'Mind ähvardatakse, ma kardan enda pärast.', "I'm being threatened, I'm afraid for my safety."),
    P('[Он сказал|Она сказала], что разберётся со мной, мне страшно.', 'Ta ütles, et õiendab minuga arved, mul on hirm.', '[He said he|She said she|They said they] would settle the score with me, I am scared.'),
  ),
  stalking: S(
    'any',
    P('Меня уже несколько дней кто-то преследует, я боюсь.', 'Keegi on mind juba mitu päeva jälitanud, ma kardan.', "Someone has been following me for days, I'm scared."),
    P('Один человек ко мне пристаёт и идёт следом, я не знаю, что делать.', 'Üks inimene norib mind ja käib mul kannul, ma ei tea, mida teha.', "Someone is pestering me and following me, I don't know what to do."),
  ),
  knife: S(
    'urgent',
    P('У [него|неё] нож, [он угрожает|она угрожает] людям!', 'Tal on nuga, ta ähvardab inimesi!', "[He's|She's|They've] got a knife, [he's|she's|they're] threatening people!"),
    P('Человека ударили ножом, тут кровь!', 'Üht inimest pussitati, siin on verd!', "Someone's been stabbed, there's blood!"),
  ),
  shots: S(
    'urgent',
    P('Я {слышал|слышала} выстрелы! Несколько раз!', 'Ma kuulsin laske! Mitu korda!', 'I heard gunshots! Several!'),
    P('Тут стреляют, люди разбегаются!', 'Siin tulistatakse, inimesed jooksevad laiali!', "There's shooting, people are running!"),
  ),
  gun_threat: S(
    'urgent',
    P('У [него|неё] оружие, [он целится|она целится] в людей!', 'Tal on relv, ta sihib inimesi!', "[He's|She's|They've] got a gun, [he's|she's|they're] aiming at people!"),
    P('Тут человек с оружием, люди прячутся, быстрее!', 'Siin on üks inimene relvaga, inimesed peidavad end, kiiresti!', 'There is someone here with a gun, people are hiding, hurry!'),
  ),
  hostage: S(
    'urgent',
    P('Тут держат заложников и угрожают!', 'Siin hoitakse inimesi pantvangis ja ähvardatakse!', 'People are being held hostage here and threatened!'),
    P('Нас не подпускают, есть угрозы, выдвигают требования.', 'Me ei pääse ligi, ähvardatakse ja esitatakse nõudmisi.', "We can't get near, there are threats and demands."),
  ),
  riot: S(
    'urgent',
    P('Тут полный хаос, толпа бросается чем попало!', 'Siin on täielik kaos, rahvas loobib kõike, mis kätte juhtub!', "It's total chaos here, the crowd is throwing anything they can get their hands on!"),
    P('Толпа вышла из-под контроля, это может плохо кончиться.', 'Rahvahulk on kontrolli alt väljas, see võib halvasti lõppeda.', 'The crowd is out of control, this could end badly.'),
  ),
  prison_riot: S(
    'urgent',
    P('У нас бунт, заключённые захватили отделение!', 'Meil on mäss, kinnipeetavad võtsid osakonna üle!', 'We have a riot, the prisoners have taken over a wing!'),
    P('Есть раненый сотрудник, нужна помощь немедленно!', 'Üks ametnik on vigastatud, abi on kohe vaja!', 'An officer is injured, we need help right now!'),
  ),
  found_victim: S(
    'urgent',
    P('Тут человек лежит на полу, кругом кровь, он не двигается!', 'Siin lamab inimene põrandal, igal pool on verd, ta ei liiguta!', "Someone is lying on the floor, there's blood everywhere, they're not moving!"),
    P('Были крики, потом стало тихо… а теперь человек лежит и не дышит.', 'Kostis karjeid, siis jäi vaikseks… ja nüüd lamab inimene seal ega hinga.', 'There was screaming, then it went quiet… and now someone is lying there, not breathing.'),
  ),
  found_body: S(
    'any',
    P('Тут человек… он не дышит, кажется, он мёртв.', 'Siin on inimene… ta ei hinga, ta on vist surnud.', "There's a person here… they're not breathing, I think they're dead."),
    P('Человек лежит без движения и не отвечает, похоже, уже поздно…', 'Inimene lamab liikumatult ega vasta, tundub, et on juba hilja…', "Someone is lying motionless and not responding, it looks like it's too late…"),
  ),
  welfare: S(
    'any',
    P('Соседей давно не видно, а изнутри идёт запах.', 'Naabreid pole ammu nähtud ja seest tuleb haisu.', "The neighbours haven't been seen for ages and there's a smell coming from inside."),
    P('Никто не открывает, я боюсь, что там что-то случилось.', 'Keegi ei ava ust, ma kardan, et seal on midagi juhtunud.', "Nobody answers the door, I'm afraid something has happened in there."),
  ),
  noise: S(
    'calm',
    P('Тут уже который час страшный шум, ни спать, ни отдыхать невозможно.', 'Siin on juba mitu tundi kohutav müra, ei saa magada ega puhata.', "There's been a terrible racket for hours, nobody can sleep or rest."),
    P('Шум не прекращается, их уже просили перестать, но без толку.', 'Müra ei lõpe, neil on juba palutud lõpetada, aga asjata.', "The noise won't stop, they've already been asked to stop, but it's no use."),
  ),
  dispute: S(
    'calm',
    P('Тут люди ругаются и мешают всем, приезжайте разобраться.', 'Siin on inimesed tülis ja segavad teisi, tulge palun asja klaarima.', 'People are arguing here and disturbing everyone, please come and sort it out.'),
    P('Человек скандалит и оскорбляет, но драки нет.', 'Üks inimene tekitab tüli ja sõimab, aga kaklust ei ole.', "Someone is making a scene and swearing, but there's no fight."),
  ),
  nuisance: S(
    'calm',
    P('Тут опять мешают жильцам, это продолжается уже давно.', 'Siin häiritakse jälle elanikke ja see kestab juba ammu.', 'The residents here are being disturbed again and it has been going on for ages.'),
    P('Это не в первый раз, сколько можно терпеть? Приезжайте, пожалуйста.', 'See pole esimene kord, kaua me peame seda taluma? Tulge palun.', "It's not the first time, how long do we have to put up with it? Please come."),
  ),
  pestering: S(
    'calm',
    P('Тут человек ходит за людьми, требует денег и кричит.', 'Siin käib üks inimene teistel järel, nõuab raha ja karjub.', 'There is someone here following people around, demanding money and shouting.'),
    P('[Он не отстаёт, но пока никого не тронул|Она не отстаёт, но пока никого не тронула].', 'Ta ei jäta rahule, aga kedagi pole veel puutunud.', "[He won't leave people alone, but he hasn't|She won't leave people alone, but she hasn't|They won't leave people alone, but they haven't] touched anyone yet."),
  ),
  drunk_person: S(
    'any',
    P('Пьяный пристаёт к прохожим и кричит на всех.', 'Joobes inimene norib möödujate kallal ja karjub kõigi peale.', 'A drunk is harassing passers-by and shouting at everyone.'),
    P('[Он хватает|Она хватает] людей за руки, все боятся.', 'Ta haarab inimestel käest kinni, kõik kardavad.', "[He's|She's|They're] grabbing people by the arm, everyone's scared."),
  ),
  drunk_lying: S(
    'any',
    P('Тут лежит пьяный и не может встать.', 'Siin lamab üks purjus inimene ega saa püsti.', "There's a drunk lying here who can't get up."),
    P('[Он еле реагирует, так его|Она еле реагирует, так её] оставлять нельзя.', 'Ta reageerib vaevu, nii ei saa teda jätta.', "[He's barely responding, he|She's barely responding, she|They're barely responding, they] can't be left like this."),
  ),
  person_lying: S(
    'any',
    P('Тут лежит человек, не знаю, пьяный он или ему плохо.', 'Siin lamab üks inimene, ma ei tea, kas ta on purjus või haige.', "Someone is lying here, I don't know whether they're drunk or ill."),
    P('Встать не может и еле отвечает.', 'Ta ei saa ise püsti ja vastab vaevu.', "They can't get up by themselves and are barely answering."),
  ),
  person_on_road: S(
    'urgent',
    P('Посреди дороги лежит человек, машины еле объезжают!', 'Keset teed lamab inimene, autod pääsevad vaevu mööda!', 'Someone is lying in the middle of the road, cars can barely get past!'),
    P('Я {остановился и включил|остановилась и включила} аварийку, но кто-нибудь может наехать!', 'Ma peatusin ja panin ohutuled põlema, aga keegi võib otsa sõita!', "I've stopped and put my hazard lights on, but someone could run them over!"),
  ),

  // ── Property ──────────────────────────────────────────────────────────────
  burglary: S(
    'calm',
    P('Ко мне домой залезли, дверь взломана!', 'Minu koju on sisse murtud, uks on lõhutud!', 'Someone has broken into my home, the door has been forced!'),
    P('Всё перевёрнуто, пропали ценные вещи.', 'Kõik on pea peale pööratud, väärtasjad on kadunud.', 'Everything has been turned upside down, valuables are missing.'),
  ),
  burglary_cottage: S(
    'calm',
    P('Тут вскрыли сразу несколько дач.', 'Siin on mitmesse suvilasse korraga sisse murtud.', 'Several summer cottages here have been broken into at once.'),
    P('Унесли всё ценное, замки сломаны.', 'Kõik väärtuslik on viidud, lukud on lõhutud.', 'Everything of value has been taken, the locks are broken.'),
  ),
  burglary_progress: S(
    'urgent',
    P('Кто-то прямо сейчас взламывает дверь у соседей!', 'Keegi murrab praegu naabrite ust lahti!', "Someone is breaking down the neighbours' door right now!"),
    P('Хозяев нет дома, а внутри кто-то ходит с фонариком.', 'Omanikke pole kodus, aga sees liigub keegi taskulambiga.', "The owners aren't home, but someone is moving around inside with a torch."),
  ),
  intrusion: S(
    'any',
    P('Ночью у меня в доме кто-то был, я {слышал|слышала} шаги.', 'Öösel käis mul keegi majas, ma kuulsin samme.', 'Someone was in my house during the night, I heard footsteps.'),
    P('Вещи лежат не на своих местах, мне страшно.', 'Asjad pole oma kohtadel, mul on hirm.', "Things aren't where they should be, I'm scared."),
  ),
  theft_progress: S(
    'urgent',
    P('Тут прямо сейчас воруют, что-то срезают и грузят в машину!', 'Siin varastatakse praegu, midagi lõigatakse ja laaditakse autosse!', "There's a theft going on right now, they're cutting something off and loading it into a vehicle!"),
    P('Я смотрю из окна, это происходит прямо сейчас.', 'Ma vaatan aknast, see toimub just praegu.', "I'm watching from the window, it's happening right now."),
  ),
  theft_after: S(
    'calm',
    P('Только что обнаружили кражу, вещей на месте нет.', 'Avastasime just varguse, asjad on kadunud.', 'We have just discovered a theft, the things are gone.'),
    P('Хотим заявить о краже, может, кто-то что-то видел.', 'Tahame vargusest teada anda, äkki keegi nägi midagi.', 'We want to report the theft, maybe someone saw something.'),
  ),
  bike_theft: S(
    'calm',
    P('Украли велосипед, замок перерезан.', 'Jalgratas varastati, lukk on läbi lõigatud.', 'A bike has been stolen, the lock has been cut.'),
    P('Велосипеда на месте нет, а он стоил дорого.', 'Jalgratast pole enam kohal ja see oli kallis.', "The bike isn't there any more and it was expensive."),
  ),
  shoplift: S(
    'calm',
    P('В магазине поймали вора, охранник держит [его|её].', 'Poes tabati varas, turvatöötaja hoiab teda kinni.', "We've caught a shoplifter, the security guard is holding [him|her|them]."),
    P('Задержали вора, сидит у нас в комнате охраны.', 'Pidasime varga kinni, ta istub meil turvaruumis.', "We've caught the thief, they're sitting in our security room."),
  ),
  robbery: S(
    'urgent',
    P('Нас ограбили, забрали деньги из кассы!', 'Meid rööviti, kassast võeti raha!', "We've been robbed, they took the money from the till!"),
    P('Тут было ограбление! Угрожали и забрали деньги!', 'Siin oli rööv! Ähvardati ja raha võeti ära!', 'There has been a robbery! They threatened us and took the money!'),
  ),
  armed_robbery: S(
    'urgent',
    P('Тут вооружённое ограбление, прямо сейчас!', 'Siin on relvastatud rööv, just praegu!', "There's an armed robbery going on right now!"),
    P('Люди с оружием забирают деньги, все лежат на полу!', 'Relvastatud mehed võtavad raha, kõik lamavad põrandal!', 'Armed men are taking the money, everyone is lying on the floor!'),
  ),
  street_robbery: S(
    'urgent',
    P('Меня только что ограбили, отобрали телефон!', 'Mind rööviti just, telefon võeti ära!', "I've just been robbed, they took my phone!"),
    P('На меня напали на улице и забрали вещи, [он убежал|она убежала]!', 'Mind rünnati tänaval ja asjad võeti ära, ta jooksis minema!', 'I was attacked in the street and my things were taken, [he ran off|she ran off|they ran off]!'),
  ),
  car_theft: S(
    'calm',
    P('Мою машину угнали, стояла у дома, а теперь её нет!', 'Mu auto varastati, seisis maja ees ja nüüd on läinud!', 'My car has been stolen, it was parked outside the house and now it has gone!'),
    P('Машины на месте нет, а ключи у меня.', 'Autot pole kohal, aga võtmed on minu käes.', "The car isn't there, but I have the keys."),
  ),
  theft_from_car: S(
    'calm',
    P('Мне разбили окно в машине и украли вещи!', 'Mu auto aken on katki löödud ja asjad on varastatud!', 'Someone has smashed my car window and stolen my things!'),
    P('Из машины всё вытащили, стекло вдребезги.', 'Autost on kõik välja võetud, aken on puru.', 'Everything has been taken out of the car, the window is smashed.'),
  ),
  burned_car: S(
    'calm',
    P('На парковке сгорела машина, никто не знает, чья она.', 'Parklas on üks auto ära põlenud, keegi ei tea, kelle oma see on.', 'A car has burnt out in the car park, nobody knows whose it is.'),
    P('Похоже, её подожгли, ночью тут кто-то ходил.', 'Tundub, et see pandi meelega põlema, öösel käis siin keegi.', 'It looks like it was set on fire deliberately, someone was walking around here at night.'),
  ),
  vandalism: S(
    'any',
    P('Тут кто-то ломает и портит имущество!', 'Siin lõhub keegi vara!', 'Someone is smashing up property here!'),
    P('Это происходит прямо сейчас, приезжайте, пока они здесь.', 'See toimub just praegu, tulge, kuni nad on veel siin.', "It's happening right now, come while they're still here."),
  ),
  vandalism_after: S(
    'calm',
    P('Всё разбито, ночью тут кто-то всё разгромил.', 'Kõik on puruks löödud, keegi on öösel siin laamendanud.', 'Everything is smashed, someone ran riot here during the night.'),
    P('Ущерб большой, хотим заявить.', 'Kahju on suur, tahame sellest teada anda.', 'The damage is considerable, we want to report it.'),
  ),
  tip: S(
    'calm',
    P('Я знаю, что готовится преступление, но имя называть не хочу.', 'Ma tean, et kavandatakse kuritegu, aga oma nime ma ei ütle.', "I know a crime is being planned, but I won't give my name."),
    P('Они обсуждали всё открыто, я боюсь, что это всерьёз.', 'Nad arutasid kõike avalikult, ma kardan, et see on tõsine.', "They talked about it all openly, I'm afraid it's serious."),
  ),

  // ── Traffic ───────────────────────────────────────────────────────────────
  accident: S(
    'urgent',
    P('Тут авария, приезжайте скорее!', 'Siin juhtus liiklusõnnetus, tulge palun kiiresti!', "There's been a traffic accident here, please come quickly!"),
    P('Тут столкновение, люди в шоке, нужна помощь.', 'Siin oli kokkupõrge, inimesed on šokis, abi on vaja.', "There's been a collision, people are in shock, we need help."),
  ),
  single_crash: S(
    'urgent',
    P('Машина вылетела в кювет и лежит на боку!', 'Auto sõitis kraavi ja on külili!', 'A car has gone into the ditch and is on its side!'),
    P('Машину занесло, внутри люди.', 'Auto libises teelt välja, inimesed on sees.', 'The car skidded off the road and there are people inside.'),
  ),
  fender_bender: S(
    'calm',
    P('Мне въехали сзади, другой водитель спорит, кто виноват.', 'Mulle sõideti tagant sisse ja teine juht vaidleb, kes on süüdi.', 'Someone drove into the back of me and the other driver is arguing about who is to blame.'),
    P('Никто не пострадал, но договориться мы не можем.', 'Keegi viga ei saanud, aga me ei saa omavahel kokkuleppele.', "Nobody is hurt, but we can't agree between ourselves."),
  ),
  hit_and_run: S(
    'calm',
    P('В мою машину врезались и уехали!', 'Keegi sõitis mu autole otsa ja põgenes!', 'Someone hit my car and drove off!'),
    P('Никто не пострадал, но машина помята, а виновник скрылся.', 'Keegi viga ei saanud, aga auto on mõlkis ja süüdlane kadus.', 'Nobody is hurt, but the car is dented and the other driver has gone.'),
  ),
  animal_collision: S(
    'any',
    P('Мы сбили лося, стекло разбито!', 'Me sõitsime põdrale otsa, klaas on katki!', 'We hit an elk, the windscreen is smashed!'),
    P('Лось выскочил прямо перед машиной, мы ничего не успели сделать.', 'Põder hüppas otse auto ette, me ei jõudnud midagi teha.', "The elk jumped right out in front of the car, we couldn't do anything."),
  ),
  rail_accident: S(
    'urgent',
    P('Поезд столкнулся с машиной на переезде!', 'Rong põrkas ülesõidul autoga kokku!', 'A train has hit a car at the level crossing!'),
    P('Мы экстренно затормозили, машина под поездом!', 'Tegime hädapidurduse, auto on rongi all!', 'We made an emergency stop, the car is under the train!'),
  ),
  rail_person: S(
    'urgent',
    P('Человек выпал из поезда, мы остановились!', 'Üks inimene kukkus rongist välja, me peatusime!', 'Someone fell out of the train, we have stopped!'),
    P('Человек лежит у путей, мы идём к нему.', 'Inimene lamab rööbaste kõrval, me läheme tema juurde.', 'The person is lying by the tracks, we are going to them.'),
  ),
  wrong_way: S(
    'urgent',
    P('Машина едет по встречной полосе на трассе!', 'Üks auto sõidab maanteel vastassuunas!', 'A car is driving the wrong way on the main road!'),
    P('Едет прямо на встречные машины, сейчас будет авария!', 'See sõidab otse vastutulevatele autodele, kohe juhtub õnnetus!', "It's driving straight at oncoming cars, there's going to be a crash!"),
  ),
  drunk_driver: S(
    'urgent',
    P('Впереди меня машина виляет по всей дороге, водитель, похоже, пьяный!', 'Minu ees sõitev auto lookleb üle tee, juht on vist purjus!', 'The car in front of me is weaving all over the road, the driver seems drunk!'),
    P('Машина то и дело выезжает на встречку, водитель, кажется, пьян.', 'Auto kaldub pidevalt vastassuunavööndisse, juht on vist joobes.', 'The car keeps drifting into the oncoming lane, the driver seems to be drunk.'),
  ),
  drunk_driver_parked: S(
    'urgent',
    P('Человек еле стоит на ногах и садится за руль!', 'Üks inimene vaevu seisab jalul ja istub rooli!', 'Someone can barely stand and is getting behind the wheel!'),
    P('[Он явно пьяный|Она явно пьяная], сейчас уедет, остановите!', 'Ta on selgelt purjus ja sõidab kohe minema, peatage ta!', "[He's|She's|They're] clearly drunk and about to drive off, stop [him|her|them]!"),
  ),
  drunk_driver_home: S(
    'calm',
    P('[Сосед опять приехал домой пьяный|Соседка опять приехала домой пьяная] за рулём.', 'Naaber sõitis jälle purjus peaga koju.', 'My neighbour drove home drunk again.'),
    P('Машина стоит во дворе, [он|она] сейчас дома.', 'Auto seisab hoovis, ta on praegu kodus.', "The car is in the yard, [he's|she's|they're] at home now."),
  ),
  driver_asleep: S(
    'urgent',
    P('Водитель уснул за рулём прямо на светофоре, машина на передаче!', 'Juht on fooris roolis magama jäänud, auto on käigus!', 'The driver has fallen asleep at the wheel at the lights, the car is in gear!'),
    P('Стучим в окно, [он|она] не реагирует.', 'Koputame aknale, aga ta ei reageeri.', "We're knocking on the window, but [he isn't|she isn't|they aren't] responding."),
  ),
  racing: S(
    'any',
    P('Тут гоняют как на ралли, это опасно!', 'Siin kihutatakse nagu rallil, see on ohtlik!', "They're racing here like it's a rally, it's dangerous!"),
    P('Носятся на бешеной скорости, кто-нибудь точно разобьётся.', 'Nad kihutavad meeletu kiirusega, keegi sõidab end kindlasti puruks.', "They're tearing around at insane speeds, someone is bound to crash."),
  ),
  traffic: S(
    'calm',
    P('Тут на дороге опасная ситуация, приезжайте посмотреть.', 'Siin on liikluses ohtlik olukord, tulge palun vaatama.', "There's a dangerous situation on the road here, please come and take a look."),
    P('Так ездить нельзя, рано или поздно кто-нибудь пострадает.', 'Nii ei tohi liigelda, varem või hiljem saab keegi viga.', "You can't carry on like this on the road, sooner or later someone will get hurt."),
  ),
  traffic_lights: S(
    'calm',
    P('На перекрёстке не работают светофоры, все едут как попало!', 'Ristmikul ei tööta foorid, kõik sõidavad, kuidas juhtub!', "The traffic lights at the junction aren't working, everyone is driving any old how!"),
    P('Никто не знает, кто кому уступает, сейчас будет авария.', 'Keegi ei tea, kes peab teed andma, kohe juhtub õnnetus.', "Nobody knows who has right of way, there's going to be a crash."),
  ),
  traffic_tip: S(
    'calm',
    P('Один человек всё время ездит без прав, их у [него|неё] отобрали.', 'Üks inimene sõidab pidevalt ilma lubadeta, need võeti tal ära.', 'Someone keeps driving without a licence, it was taken away from [him|her|them].'),
    P('[Он опять сел|Она опять села] за руль, проверьте, пожалуйста.', 'Ta istus jälle rooli, palun kontrollige.', '[He has|She has|They have] got behind the wheel again, please check.'),
  ),
  child_in_car: S(
    'urgent',
    P('В машине заперт маленький ребёнок, а на улице жара!', 'Autos on lukus väike laps ja väljas on palav!', "There's a small child locked in a car and it's hot outside!"),
    P('Ребёнок плачет и весь красный, родителей нигде нет.', 'Laps nutab ja on üleni punane, vanemaid pole kusagil.', "The child is crying and bright red, there's no sign of the parents."),
  ),

  // ── Drugs ─────────────────────────────────────────────────────────────────
  drug_dealing: S(
    'calm',
    P('Тут торгуют наркотиками, все об этом знают.', 'Siin müüakse narkootikume, kõik teavad seda.', "They're dealing drugs here, everyone knows it."),
    P('Каждый день одни и те же, к ним всё время подходят за товаром.', 'Iga päev on samad inimesed ja nende juurde käiakse pidevalt kaupa ostmas.', 'The same people every day, and others keep coming to them to buy.'),
  ),
  drug_smell: S(
    'calm',
    P('Тут всё пропахло травкой, запах очень сильный.', 'Siin haiseb kõik kanepi järele, lõhn on väga tugev.', 'Everything here reeks of cannabis, the smell is very strong.'),
    P('Запах каждый день, похоже, её там курят или выращивают.', 'Lõhn on iga päev, tundub, et seal seda suitsetatakse või kasvatatakse.', 'The smell is there every day, it seems someone is smoking or growing it.'),
  ),
  drug_found: S(
    'calm',
    P('Мы нашли пакетик с белым порошком.', 'Leidsime kotikese valge pulbriga.', 'We found a little bag of white powder.'),
    P('Похоже на наркотики, мы ничего не трогали.', 'Näeb välja nagu narkootikumid, me ei puutunud midagi.', "It looks like drugs, we didn't touch anything."),
  ),
  overdose: S(
    'any',
    P('Человек не приходит в себя, похоже, передозировка!', 'Inimene ei tule teadvusele, tundub, et see on üledoos!', "Someone won't come round, it looks like an overdose!"),
    P('[Он принял|Она приняла] какие-то таблетки и теперь не просыпается!', 'Ta võttis mingeid tablette ja nüüd ei ärka üles!', "[He took some pills and now he won't|She took some pills and now she won't|They took some pills and now they won't] wake up!"),
  ),
  drugged_person: S(
    'any',
    P('Тут человек явно под чем-то, не понимает, где находится.', 'Siin on üks inimene ilmselgelt millegi mõju all, ta ei saa aru, kus ta on.', "There's someone here who's clearly on something, they don't know where they are."),
    P('Ведёт себя очень странно, мы боимся подходить.', 'Ta käitub väga imelikult, me kardame tema juurde minna.', "They're behaving really strangely, we're afraid to go near them."),
  ),
  syringes: S(
    'calm',
    P('На детской площадке опять валяются шприцы!', 'Mänguväljakul vedelevad jälle süstlad!', 'There are syringes lying around the playground again!'),
    P('Тут играют дети, кто-нибудь это уберёт?', 'Siin mängivad lapsed, kas keegi koristab selle ära?', 'Children play here, is anyone going to clear this up?'),
  ),
  weapon_deal: S(
    'any',
    P('Тут из багажника продали оружие, я всё {видел|видела}.', 'Siin müüdi pagasnikust relva, ma nägin kõike.', 'Someone sold a gun out of a car boot here, I saw everything.'),
    P('Деньги передали прямо у машины, потом разъехались.', 'Raha anti üle otse auto juures ja siis sõideti laiali.', 'The money changed hands right by the car and then they drove off.'),
  ),

  // ── Missing persons ───────────────────────────────────────────────────────
  missing_child: S(
    'any',
    P('Мой ребёнок пропал, его нигде нет!', 'Mu laps on kadunud, teda pole kusagil!', "My child is missing, [he's|she's|they're] nowhere to be found!"),
    P('Ребёнок давно должен быть дома, телефон не отвечает.', 'Laps pidi juba ammu kodus olema, telefon ei vasta.', 'My child should have been home long ago, the phone is not answering.'),
  ),
  lost_child: S(
    'any',
    P('Ребёнок только что был рядом, а теперь его нигде нет!', 'Laps oli just siinsamas, aga nüüd pole teda kusagil!', 'My child was right here a moment ago and now [he is|she is|they are] nowhere to be seen!'),
    P('Мы всё обыскали, охрана тоже ищет.', 'Me otsisime kõik läbi, turvamehed otsivad ka.', 'We have searched everywhere, security are looking too.'),
  ),
  missing_youth: S(
    'any',
    P('У нас опять пропал подросток, это уже не первый раз.', 'Meie noor on jälle ära läinud, see pole esimene kord.', "One of our young people has gone again, it's not the first time."),
    P('Телефон выключен, где искать, мы не знаем.', 'Telefon on välja lülitatud ja me ei tea, kust otsida.', "The phone is switched off and we don't know where to look."),
  ),
  missing_adult: S(
    'any',
    P('Пропал близкий человек, уже несколько часов не можем найти.', 'Mu lähedane on kadunud, juba mitu tundi ei leia me teda.', "Someone close to me is missing, we haven't been able to find them for hours."),
    P('Телефон не отвечает, никто не знает, где искать, мы очень волнуемся.', 'Telefon ei vasta, keegi ei tea, kust otsida, me oleme väga mures.', "The phone isn't answering, nobody knows where to look, we're very worried."),
  ),
  missing_dementia: S(
    'any',
    P('Из дома ушёл пожилой человек с деменцией, его нигде нет.', 'Dementsusega eakas läks kodust ära ja teda pole kusagil.', 'An elderly relative with dementia has wandered off and is nowhere to be found.'),
    P('[Он сам|Она сама] дорогу домой не найдёт, пожалуйста, помогите.', 'Ta ei leia ise koduteed üles, palun aidake.', "[He won't|She won't|They won't] find the way home alone, please help."),
  ),
  missing_patient: S(
    'any',
    P('У нас из отделения пропал пациент, без присмотра ему находиться нельзя.', 'Meie osakonnast on kadunud patsient, kes ei tohi järelevalveta olla.', 'A patient has gone missing from our ward, they must not be left unsupervised.'),
    P('Мы обыскали всю больницу, нигде не нашли.', 'Me otsisime terve haigla läbi, aga ei leidnud.', "We've searched the whole hospital and can't find them."),
  ),
  lost_forest: S(
    'any',
    P('Человек ушёл в лес и не вернулся, телефон не отвечает.', 'Inimene läks metsa ega tulnud tagasi, telefon ei vasta.', "Someone went into the forest and hasn't come back, the phone isn't answering."),
    P('Мы ищем и кричим, но никто не отзывается.', 'Me otsime ja hüüame, aga keegi ei vasta.', "We're searching and shouting, but nobody answers."),
  ),
  lost_self: S(
    'any',
    P('Не могу найти дорогу из леса, телефон садится.', 'Ma ei leia metsast välja, telefoni aku saab tühjaks.', "I can't find my way out of the forest, my phone battery is running out."),
    P('Вокруг только лес, никаких ориентиров.', 'Ümberringi on ainult mets, mitte ühtegi orientiiri.', "There's nothing but forest all around, no landmarks at all."),
  ),
  abduction: S(
    'urgent',
    P('Ребёнка увели с площадки и посадили в машину!', 'Laps viidi mänguväljakult ära ja tõsteti autosse!', 'A child has been taken from the playground and put in a car!'),
    P('Машина уже уехала, ребёнка увезли!', 'Auto sõitis juba minema, laps viidi ära!', 'The car has already driven off, the child has been taken away!'),
  ),
  adrift: S(
    'urgent',
    P('Человека уносит от берега, сам он вернуться не может!', 'Inimest kantakse kaldast eemale ja ta ei jõua ise tagasi!', "Someone is being carried away from the shore and can't get back by themselves!"),
    P('Ветер сильный, уносит всё дальше, уже еле видно!', 'Tuul on tugev ja viib teda aina kaugemale, teda on juba vaevu näha!', 'The wind is strong and carrying them further out, we can barely see them now!'),
  ),
  adrift_self: S(
    'urgent',
    P('Льдина откололась, нас уносит от берега!', 'Jää murdus lahti, meid kantakse kaldast eemale!', 'The ice has broken off and we are drifting away from the shore!'),
    P('Между нами и берегом уже вода, помогите!', 'Meie ja kalda vahel on juba vesi, aidake!', 'There is already water between us and the shore, help!'),
  ),
  drowning: S(
    'urgent',
    P('Человек ушёл под воду и не всплывает!', 'Inimene läks vee alla ega tule üles!', "Someone went under the water and hasn't come up!"),
    P('Мы больше не видим [его|её] на воде, помогите!', 'Me ei näe teda enam vee peal, aidake!', "We can't see [him|her|them] in the water any more, help!"),
  ),

  // ── Assistance ────────────────────────────────────────────────────────────
  unwell: S(
    'urgent',
    P('Тут человеку плохо, он упал и не двигается!', 'Siin on inimesel halb, ta kukkus ega liiguta!', "Someone's unwell here, they fell and aren't moving!"),
    P('Человек лежит и не реагирует, помогите!', 'Inimene lamab ega reageeri, aidake!', 'Someone is lying here and not responding, help!'),
  ),
  injured_person: S(
    'any',
    P('Тут человек упал и сильно ударился головой!', 'Siin kukkus üks inimene ja lõi pea tugevasti ära!', 'Someone has fallen here and hit their head hard!'),
    P('В сознании, но идёт кровь, нужна скорая.', 'Ta on teadvusel, aga veritseb, kiirabi on vaja.', "They're conscious but bleeding, we need an ambulance."),
  ),
  ambulance_help: S(
    'urgent',
    P('Скорая просит полицию, пациент буйный.', 'Kiirabi palub politseid, patsient on vägivaldne.', 'This is the ambulance crew, we need the police, the patient is violent.'),
    P('Пациент агрессивный, мы не можем оказать помощь.', 'Patsient on agressiivne ja me ei saa teda aidata.', "The patient is aggressive and we can't treat them."),
  ),
  child_alone: S(
    'urgent',
    P('Маленький ребёнок совсем один, взрослых рядом нет!', 'Väike laps on täiesti üksi, täiskasvanuid pole läheduses!', 'A small child is all alone, there are no adults around!'),
    P('Ребёнок может упасть, а дома никто не открывает.', 'Laps võib alla kukkuda, aga keegi ei ava ust.', 'The child could fall, and nobody is answering the door.'),
  ),
  child_locked: S(
    'urgent',
    P('Дверь захлопнулась, а маленький ребёнок остался внутри один!', 'Uks lõi kinni ja väike laps jäi üksi sisse!', 'The door slammed shut and a small child is inside alone!'),
    P('Ребёнок плачет за дверью, ключей нет, помогите!', 'Laps nutab ukse taga, võtmeid pole, aidake!', 'The child is crying behind the door, there are no keys, help!'),
  ),
  child_not_collected: S(
    'calm',
    P('Ребёнка до сих пор не забрали из садика, родители не отвечают.', 'Lapsele pole siiani lasteaeda järele tuldud ja vanemad ei vasta.', "Nobody has come to collect a child from the kindergarten and the parents aren't answering."),
    P('Мы уже всем звонили, никто не берёт трубку.', 'Me oleme juba kõigile helistanud, keegi ei võta vastu.', "We've already called everyone, nobody picks up."),
  ),
  child_screams: S(
    'any',
    P('Ребёнок кричит уже несколько минут, очень страшно!', 'Laps karjub juba mitu minutit, väga hirmsasti!', 'A child has been screaming for several minutes, it sounds terrible!'),
    P('Мне не видно, что там происходит, но крик не прекращается.', 'Ma ei näe, mis seal toimub, aga karjumine ei lõpe.', "I can't see what's going on, but the screaming won't stop."),
  ),
  suicide: S(
    'urgent',
    P('Тут человек хочет прыгнуть, стоит на самом краю!', 'Siin tahab üks inimene alla hüpata, ta seisab päris ääre peal!', "Someone here wants to jump, they're standing right on the edge!"),
    P('Говорит, что покончит с собой, пожалуйста, быстрее!', 'Ta ütleb, et võtab endalt elu, palun kiiresti!', "They're saying they'll take their own life, please hurry!"),
  ),
  suicide_risk: S(
    'urgent',
    P('Близкий человек прислал прощальное сообщение и не отвечает, я очень боюсь!', 'Mu lähedane saatis hüvastijätusõnumi ega vasta, ma kardan väga!', "Someone close to me sent a goodbye message and isn't answering, I'm really scared!"),
    P('Там написано, что так жить больше невозможно, телефон молчит.', 'Seal oli kirjas, et ta ei suuda enam nii elada, ja telefon on vait.', "It said they can't go on living like this, and the phone is silent."),
  ),
  gas: S(
    'urgent',
    P('В подъезде сильно пахнет газом, голова болит!', 'Trepikojas on tugev gaasilõhn, pea hakkab valutama!', "There's a strong smell of gas in the stairwell, it's giving me a headache!"),
    P('Запах всё сильнее, а люди ещё в квартирах.', 'Gaasilõhn läheb aina tugevamaks, aga inimesed on veel korterites.', 'The smell is getting stronger and people are still in their flats.'),
  ),
  fire: S(
    'urgent',
    P('Тут пожар, много дыма!', 'Siin on tulekahju, palju suitsu!', "There's a fire here, lots of smoke!"),
    P('Горит, огонь распространяется, нужна помощь!', 'Põleb, tuli levib, abi on vaja!', "It's burning, the fire is spreading, we need help!"),
  ),
  fire_outdoor: S(
    'any',
    P('В лесу горит костёр, а сейчас пожароопасный период!', 'Metsas põleb lõke, aga praegu on tuleohtlik aeg!', "There's a campfire burning in the forest, and it's the fire danger season!"),
    P('Огонь большой, и ветер, может перекинуться на лес.', 'Tuli on suur ja tuul puhub, see võib metsa üle kanduda.', 'The fire is big and the wind is blowing, it could spread to the forest.'),
  ),
  road_blocked: S(
    'calm',
    P('Дерево упало поперёк дороги, проехать невозможно!', 'Puu kukkus üle tee, läbi ei pääse!', "A tree has come down across the road, you can't get through!"),
    P('Его плохо видно, кто-нибудь может врезаться.', 'Seda on halvasti näha, keegi võib otsa sõita.', "It's hard to see, someone could drive into it."),
  ),
  climbers: S(
    'any',
    P('Подростки залезли на кран, на самый верх!', 'Teismelised ronisid kraana otsa, päris tippu!', 'Some teenagers have climbed a crane, right to the top!'),
    P('Если кто-нибудь сорвётся… снимите их оттуда!', 'Kui keegi kukub… tooge nad sealt alla!', 'If someone falls… get them down from there!'),
  ),
  ordnance: S(
    'calm',
    P('Мы нашли в земле снаряд, старый и ржавый.', 'Leidsime maast mürsu, vana ja roostes.', 'We found a shell in the ground, old and rusty.'),
    P('Мы его не трогали, отошли подальше.', 'Me ei puutunud seda, läksime eemale.', "We didn't touch it, we moved away."),
  ),
  fallen_self: S(
    'calm',
    P('Не могу встать с пола, ноги не слушаются.', 'Ma ei saa põrandalt püsti, jalad ei kuula sõna.', "I can't get up off the floor, my legs won't work."),
    P('Простите за беспокойство, но без помощи мне не подняться.', 'Vabandage, et tülitan, aga ilma abita ma püsti ei saa.', "Sorry to bother you, but I can't get up without help."),
  ),
  dog: S(
    'any',
    P('Собака без хозяина бросается на людей!', 'Omanikuta koer ründab inimesi!', 'A dog without its owner is attacking people!'),
    P('Большая собака бегает тут и уже покусала человека!', 'Siin jookseb suur koer ja on juba ühe inimese ära hammustanud!', 'A big dog is running around here and has already bitten someone!'),
  ),
  dog_bite: S(
    'calm',
    P('Собака укусила меня за ногу, а хозяин ещё и спорит.', 'Koer hammustas mind jalga ja omanik veel vaidleb.', 'A dog bit my leg and the owner is arguing with me about it.'),
    P('Собака выскочила со двора без поводка и укусила меня.', 'Koer jooksis väravast välja ilma rihmata ja hammustas mind.', 'The dog ran out of the gate off the lead and bit me.'),
  ),
  dog_dispute: S(
    'calm',
    P('Чужая собака без поводка набросилась на мою!', 'Võõras koer oli rihmata ja kargas minu koerale kallale!', 'Someone else’s dog was off the lead and went for mine!'),
    P('А хозяин ещё и угрожает мне, вместо того чтобы извиниться.', 'Ja omanik veel ähvardab mind, selle asemel et vabandada.', 'And instead of apologising, the owner is threatening me.'),
  ),
  elk_road: S(
    'any',
    P('На дороге лось, машины еле объезжают!', 'Teel on põder, autod pääsevad vaevu mööda!', "There's an elk on the road, cars can barely get past!"),
    P('Стоит посреди дороги и не уходит, сейчас кто-нибудь врежется!', 'See seisab keset teed ega lähe ära, kohe sõidab keegi otsa!', "It's standing in the middle of the road and won't move, someone's going to hit it!"),
  ),
  horse_road: S(
    'any',
    P('На дороге бегает лошадь, машины еле объезжают!', 'Teel jookseb hobune, autod pääsevad vaevu mööda!', "There's a horse running on the road, cars can barely get past!"),
    P('Хозяина не видно, сейчас кто-нибудь в неё врежется!', 'Omanikku pole näha, kohe sõidab keegi talle otsa!', "There's no sign of the owner, someone's going to hit it any moment!"),
  ),
  animal_road: S(
    'any',
    P('На дороге животное, машины еле объезжают!', 'Teel on loom, autod pääsevad vaevu mööda!', "There's an animal on the road, cars can barely get past!"),
    P('Сейчас кто-нибудь в него врежется!', 'Kohe sõidab keegi talle otsa!', "Someone's going to hit it any moment!"),
  ),
  wildlife: S(
    'calm',
    P('Тут дикий зверь возле домов, люди боятся.', 'Siin on metsloom majade juures, inimesed kardavad.', 'There is a wild animal near the houses, people are scared.'),
    P('Он не уходит, а скоро здесь пойдут дети.', 'See ei lähe ära ja varsti käivad siin lapsed.', 'It will not go away, and children will be walking past here soon.'),
  ),
  livestock_attack: S(
    'calm',
    P('Собаки гоняют овец, одна уже лежит!', 'Koerad ajavad lambaid taga, üks lamab juba maas!', 'Dogs are chasing the sheep, one is already down!'),
    P('Это бродячие собаки, хозяина нигде нет.', 'Need on hulkuvad koerad, omanikku pole kusagil.', "They're stray dogs, there's no owner anywhere."),
  ),
  animal_cruelty: S(
    'calm',
    P('Сосед мучает свою собаку, слушать это невозможно!', 'Naaber piinab oma koera, seda ei saa kuulata!', "My neighbour is tormenting their dog, I can't bear to listen to it!"),
    P('Животное держат в ужасных условиях, сделайте что-нибудь.', 'Looma peetakse kohutavates tingimustes, tehke palun midagi.', 'The animal is being kept in terrible conditions, please do something.'),
  ),

  // ── Fraud ─────────────────────────────────────────────────────────────────
  scam: S(
    'calm',
    P('Меня обманули, деньги ушли, а теперь никто не отвечает.', 'Mind peteti, raha on läinud ja nüüd ei vasta keegi.', "I've been scammed, the money's gone and now nobody answers."),
    P('Я только сейчас {понял|поняла}, что это были мошенники.', 'Ma alles nüüd sain aru, et need olid petised.', "I've only just realised they were scammers."),
  ),
  scam_door: S(
    'any',
    P('Ко мне приходили мужчины, сказали, что из газовой службы, а потом пропали деньги.', 'Minu juures käisid mehed, kes ütlesid, et on gaasifirmast, ja nüüd on raha kadunud.', 'Some men came round saying they were from the gas company, and now my money is gone.'),
    P('Они только что ушли, может, ещё ходят по квартирам в этом доме.', 'Nad lahkusid just, äkki käivad veel selles majas korterite kaupa.', 'They have only just left, they may still be going door to door in the building.'),
  ),
  scam_ongoing: S(
    'any',
    P('Мне звонят и требуют деньги, говорят, что родственник в беде.', 'Mulle helistatakse ja nõutakse raha, öeldakse, et sugulane on hädas.', 'Someone keeps calling and demanding money, saying a relative is in trouble.'),
    P('Сказали, что за деньгами придёт курьер, что мне делать?', 'Öeldi, et raha järele tuleb kuller, mida ma tegema pean?', 'They said a courier will come for the money, what should I do?'),
  ),
  counterfeit: S(
    'calm',
    P('Нам дали фальшивую купюру, это видно сразу.', 'Meile anti võltsitud rahatäht, see on kohe näha.', 'Someone gave us a counterfeit banknote, you can tell straight away.'),
    P('Клиент расплатился фальшивыми деньгами, детектор пищит.', 'Klient maksis võltsrahaga, detektor piiksub.', 'A customer paid with counterfeit money, the detector is beeping.'),
  ),
  forgery: S(
    'calm',
    P('Нам показали поддельный документ, фото явно переклеено.', 'Meile näidati võltsitud dokumenti, pilt on selgelt peale kleebitud.', "We've been shown a forged document, the photo has clearly been stuck on."),
    P('Человек нервничает и требует документ обратно.', 'Inimene on närviline ja nõuab dokumenti tagasi.', 'The person is nervous and wants the document back.'),
  ),
  fraud_generic: S(
    'calm',
    P('Мне кажется, меня обманывают, хочу об этом заявить.', 'Mulle tundub, et mind petetakse, tahan sellest teada anda.', 'I think I am being cheated and I want to report it.'),
    P('Это нечестно, так с людьми поступать нельзя.', 'See on ebaaus, inimestega ei tohi nii käituda.', "This isn't fair, you can't treat people like this."),
  ),
  cyber: S(
    'any',
    P('У нас взломали системы, ничего не работает!', 'Meie süsteemid on häkitud, mitte midagi ei tööta!', 'Our systems have been hacked, nothing is working!'),
    P('Компьютеры заблокированы, доступа к данным нет.', 'Arvutid on lukus ja andmetele ei pääse ligi.', "The computers are locked and we can't get at the data."),
  ),
  fare_refusal: S(
    'calm',
    P('Пассажир не платит и ещё угрожает!', 'Reisija ei maksa ja ähvardab mind veel pealegi!', "The passenger won't pay and is threatening me on top of that!"),
    P('Сидит в машине и не выходит.', 'Ta istub autos ega tule välja.', "They're sitting in the car and won't get out."),
  ),

  // ── Border ────────────────────────────────────────────────────────────────
  border_crossing: S(
    'any',
    P('Тут кто-то только что перешёл границу!', 'Siin tuli keegi just üle piiri!', 'Someone has just crossed the border here!'),
    P('Этот человек уходит от границы и прячется.', 'See inimene liigub piirist eemale ja peidab end.', 'The person is moving away from the border and hiding.'),
  ),
  migrants: S(
    'any',
    P('Из фургона вышло много людей, похоже, их привезли нелегально.', 'Kaubikust tuli välja palju inimesi, tundub, et nad toodi ebaseaduslikult.', 'Lots of people got out of a van, it looks like they were brought in illegally.'),
    P('Они растерянные и говорят не по-нашему.', 'Nad on segaduses ja räägivad võõrast keelt.', "They're confused and speaking a foreign language."),
  ),
  smuggling: S(
    'any',
    P('Тут, похоже, контрабанда, товар возят через границу.', 'Siin tundub olevat salakaubavedu, kaupa veetakse üle piiri.', 'It looks like smuggling here, goods are being brought across the border.'),
    P('Это происходит постоянно, все уже знают.', 'See käib pidevalt, kõik juba teavad.', 'It happens all the time, everyone knows about it.'),
  ),
  customs: S(
    'any',
    P('Это таможня. Подозрительный контейнер, его сейчас заберут.', 'Siin Tolliamet. Kahtlane konteiner, see viiakse kohe ära.', 'Customs here. A suspicious container, it is about to be collected.'),
    P('Полиция нужна до того, как перевозчик уедет.', 'Politseid on vaja enne, kui vedaja lahkub.', 'We need the police before the haulier leaves.'),
  ),
  border_check: S(
    'calm',
    P('У нас человек без документов, объяснить ничего не может.', 'Meil on üks isik ilma dokumentideta ja ta ei oska midagi seletada.', "We have someone without documents who can't explain anything."),
    P('Ведёт себя спокойно, но кто это, непонятно.', 'Ta käitub rahulikult, aga kes ta on, pole selge.', "They're calm, but it's not clear who they are."),
  ),
  border_boat: S(
    'any',
    P('На озере лодка без огней, пришла с российской стороны.', 'Järvel on tuledeta paat, see tuli Vene poolt.', "There's a boat without lights on the lake, it came from the Russian side."),
    P('Лодка идёт к нашему берегу, мне её отсюда видно.', 'Paat liigub meie kalda poole, mul on see siit näha.', 'The boat is heading for our shore, I can see it from here.'),
  ),
  drone: S(
    'any',
    P('Опять летает дрон, уже не первый раз.', 'Jälle lendab droon, see pole esimene kord.', "There's a drone flying again, it's not the first time."),
    P('Не знаю, чей он, но это очень подозрительно.', 'Ma ei tea, kelle oma see on, aga see on väga kahtlane.', "I don't know whose it is, but it's very suspicious."),
  ),

  // ── Environment ───────────────────────────────────────────────────────────
  pollution: S(
    'calm',
    P('В реку что-то сливают, вода вся в пятнах.', 'Jõkke lastakse midagi, vesi on laike täis.', 'Someone is dumping something into the river, the water is full of slicks.'),
    P('Вода покрыта плёнкой и пахнет нефтью.', 'Vesi on kilega kaetud ja haiseb nafta järele.', 'The water is covered in a film and smells of oil.'),
  ),
  dumping: S(
    'calm',
    P('В лес вывалили целую кучу мусора!', 'Metsa visati terve hunnik prügi!', 'Someone has dumped a whole heap of rubbish in the forest!'),
    P('Приехал фургон, выгрузили мусор и уехали.', 'Kaubik tuli, prügi visati maha ja siis sõideti minema.', 'A van came, the rubbish was thrown out and then they drove off.'),
  ),
  logging: S(
    'calm',
    P('В моём лесу рубят деревья без разрешения!', 'Minu metsas raiutakse puid ilma loata!', 'Someone is cutting down trees in my forest without permission!'),
    P('Разрешения никто не давал, лес просто вывозят.', 'Keegi pole luba andnud, metsa lihtsalt veetakse minema.', "Nobody gave permission, they're just carting the timber away."),
  ),
  offroad: S(
    'calm',
    P('По заповеднику гоняют на квадроциклах, прямо по дюнам!', 'Kaitsealal sõidetakse ATV-dega, otse üle luidete!', 'People are riding quad bikes in the nature reserve, right over the dunes!'),
    P('Тут гнездятся птицы, а они всё разъездили.', 'Siin pesitsevad linnud, aga nad on kõik puruks sõitnud.', "Birds nest here, and they've churned everything up."),
  ),
  poaching: S(
    'any',
    P('В лесу стреляют, а сейчас не сезон охоты.', 'Metsas lastakse, aga praegu pole jahihooaeg.', "There's shooting in the forest, and it's not hunting season."),
    P('Тут кто-то охотится без разрешения, слышны выстрелы.', 'Siin küttib keegi loata, laske on kuulda.', 'Someone is hunting here without a permit, you can hear the shots.'),
  ),
  illegal_fishing: S(
    'calm',
    P('Тут опять ставят сети, хотя это запрещено.', 'Siin pannakse jälle võrke, kuigi see on keelatud.', 'People are setting nets here again, even though it is banned.'),
    P('Каждый день одни и те же, скоро рыбы не останется.', 'Iga päev samad mehed, varsti pole enam kala alles.', 'The same men every day, soon there will be no fish left.'),
  ),

  // ── Major incidents ───────────────────────────────────────────────────────
  bomb_threat: S(
    'urgent',
    P('Нам позвонили и сказали, что в здании бомба!', 'Meile helistati ja öeldi, et majas on pomm!', 'Someone called us and said there is a bomb in the building!'),
    P('Сказали, что взорвётся, людей уже выводим.', 'Öeldi, et see plahvatab, viime inimesi juba välja.', "They said it will go off, we're already getting people out."),
  ),
  suspicious_item: S(
    'urgent',
    P('Тут что-то подозрительное, похоже на взрывчатку.', 'Siin on midagi kahtlast, see näeb välja nagu lõhkeaine.', 'There is something suspicious here, it looks like explosives.'),
    P('Я боюсь подходить ближе, вдруг взорвётся.', 'Ma kardan lähemale minna, äkki plahvatab.', "I'm afraid to go closer, it might explode."),
  ),
  major_accident: S(
    'urgent',
    P('Тут большая авария, много пострадавших!', 'Siin on suur õnnetus, palju inimesi on viga saanud!', "There's been a major accident, lots of people are hurt!"),
    P('Люди кричат, некоторые не могут выбраться!', 'Inimesed karjuvad, mõned ei saa välja!', "People are screaming, some can't get out!"),
  ),
  hazard: S(
    'urgent',
    P('Тут что-то вытекает, какой-то газ, у людей режет глаза!', 'Siin lekib midagi, mingi gaas, inimestel kipitavad silmad!', "Something is leaking here, some kind of gas, people's eyes are stinging!"),
    P('Сильный химический запах, всех надо отсюда убрать!', 'Tugev keemialõhn, kõik tuleb siit eemale viia!', 'There is a strong chemical smell, everyone needs to be moved away!'),
  ),
  escape: S(
    'urgent',
    P('[Сбежал заключённый, он опасен|Сбежала заключённая, она опасна]!', 'Kinnipeetav on põgenenud, ta on ohtlik!', 'A prisoner has escaped, [he is|she is|they are] dangerous!'),
    P('Мы потеряли [его|её] из виду, [он может|она может] быть где угодно поблизости.', 'Kaotasime ta silmist, ta võib olla kus iganes siin lähedal.', '[We lost sight of him, he|We lost sight of her, she|We lost sight of them, they] could be anywhere nearby.'),
  ),
  barricaded: S(
    'urgent',
    P('Тот, кого ищет полиция, здесь, заперся и кричит.', 'See, keda politsei otsib, on siin, ta pani end luku taha ja karjub.', 'The person the police are looking for is here, locked inside and shouting.'),
    P('Дверь не открывает и угрожает, мы боимся.', 'Ta ei ava ust ja ähvardab, me kardame.', "They won't open the door and they're making threats, we're scared."),
  ),
  online_threat: S(
    'any',
    P('В интернете написали, что нападут на школу, там фото с оружием.', 'Internetis kirjutati, et kooli rünnatakse, seal on pilt relvaga.', "Someone has written online that they'll attack the school, there's a picture with a gun."),
    P('Дети показали этот пост, мы очень боимся.', 'Lapsed näitasid seda postitust, me kardame väga.', 'The children showed us the post, we are very frightened.'),
  ),
  sabotage: S(
    'any',
    P('Кто-то сломал оборудование на подстанции, полрайона без света.', 'Keegi lõhkus alajaamas seadmed, pool piirkonda on elektrita.', "Someone has smashed the equipment at the substation, half the area has no power."),
    P('Это не авария, кто-то сделал это специально.', 'See ei ole rike, keegi tegi seda meelega.', "This isn't a fault, someone did it on purpose."),
  ),
  trafficking: S(
    'any',
    P('В этой квартире живёт очень много людей, их возят на работу, они боятся говорить.', 'Selles korteris elab väga palju inimesi, neid viiakse tööle ja nad kardavad rääkida.', "A lot of people live in this flat, they get driven to work and they're afraid to talk."),
    P('Мне кажется, их держат там против воли.', 'Mulle tundub, et neid hoitakse seal vastu nende tahtmist.', "I think they're being kept there against their will."),
  ),
  held_captive: S(
    'urgent',
    P('Нас здесь держат взаперти, мы не можем уйти.', 'Meid hoitakse siin luku taga, me ei saa ära minna.', "We're being kept locked up here, we can't leave."),
    P('У нас забрали паспорта, пожалуйста, помогите.', 'Meie passid võeti ära, palun aidake.', 'They took our passports, please help.'),
  ),
  emergency: S(
    'urgent',
    P('Тут что-то страшное случилось, нужна помощь, быстрее!', 'Siin juhtus midagi kohutavat, abi on vaja, kiiresti!', 'Something terrible has happened here, we need help, quickly!'),
    P('Приезжайте скорее, тут очень опасно!', 'Tulge kiiresti, siin on väga ohtlik!', "Come quickly, it's really dangerous here!"),
  ),

  // ── Other ─────────────────────────────────────────────────────────────────
  suspicious_school: S(
    'any',
    P('Возле школы уже час стоит человек и смотрит на детей.', 'Kooli juures seisab juba tund aega üks inimene ja vaatab lapsi.', 'Someone has been standing by the school for an hour, watching the children.'),
    P('Когда к [нему|ней] подходят, [он отходит|она отходит], а потом возвращается.', 'Kui keegi lähemale läheb, läheb ta eemale ja tuleb siis tagasi.', 'When anyone goes up to [him, he walks away and then comes|her, she walks away and then comes|them, they walk away and then come] back.'),
  ),
  car_tracker: S(
    'any',
    P('Телефон показывает, что моя машина сейчас едет, а я дома!', 'Telefon näitab, et mu auto sõidab praegu ringi, aga mina olen kodus!', 'My phone shows my car is being driven right now, but I am at home!'),
    P('Её кто-то угнал, она сейчас движется по городу.', 'Keegi on selle ära viinud, see liigub praegu linnas.', 'Someone has taken it, it is moving through town right now.'),
  ),
  fleeing_vehicle: S(
    'urgent',
    P('Машина не остановилась и уходит на большой скорости!', 'Auto ei peatunud ja põgeneb suure kiirusega!', "The car didn't stop and is getting away at high speed!"),
    P('Гонит как сумасшедший, сейчас кого-нибудь собьёт!', 'Ta kihutab nagu hull, kohe sõidab kellelegi otsa!', "They're driving like a maniac, they'll hit someone any moment!"),
  ),
  suspicious: S(
    'calm',
    P('Тут происходит что-то подозрительное, лучше проверьте.', 'Siin toimub midagi kahtlast, parem kontrollige üle.', 'Something suspicious is going on here, you had better check it out.'),
    P('Мне это совсем не нравится, пусть лучше кто-нибудь посмотрит.', 'See ei meeldi mulle üldse, parem tuleks keegi vaatama.', "I don't like this at all, someone had better come and take a look."),
  ),
  alarm: S(
    'any',
    P('Сработала сигнализация, внутри кто-то есть!', 'Signalisatsioon läks tööle, sees on keegi!', 'The alarm has gone off, someone is inside!'),
    P('Сигнализация воет, а внутри мигает свет.', 'Signalisatsioon huilgab ja sees vilgub tuli.', 'The alarm is wailing and a light is flickering inside.'),
  ),
  easter: S(
    'any',
    P('Тут такое… я даже не знаю, как объяснить.', 'Siin on selline asi… ma ei teagi, kuidas seletada.', "There's this thing here… I don't even know how to explain it."),
    P('Вы не поверите, но тут происходит что-то очень странное.', 'Te ei usu, aga siin toimub midagi väga imelikku.', "You won't believe it, but something very strange is going on here."),
  ),
  ufo: S(
    'any',
    P('Вы не поверите, но тут что-то светится в небе и садится в поле!', 'Te ei usu, aga siin helendab midagi taevas ja maandub põllule!', "You won't believe it, but something is glowing in the sky and landing in the field!"),
    P('Тут такое… я даже не знаю, как объяснить.', 'Siin on selline asi… ma ei teagi, kuidas seletada.', "There's this thing here… I don't even know how to explain it."),
  ),
  generic: S(
    'any',
    P('Алло, полиция? Нужна помощь!', 'Halloo, politsei? Mul on abi vaja!', 'Hello, police? I need help!'),
    P('Здравствуйте, у нас тут проблема, приезжайте.', 'Tere, meil on siin probleem, tulge palun.', 'Hello, we have a problem here, please come.'),
  ),
};

/** Caller phrases per situation (Russian original + Estonian/English translation). */
export const OPENINGS: Record<Situation, Phrase[]> = Object.fromEntries(
  Object.entries(SITUATIONS).map(([k, v]) => [k, v.lines]),
) as Record<Situation, Phrase[]>;

/**
 * The situation that describes each template's incident. Russian callers speak these lines (most
 * templates only script Estonian ones), so the mapping decides whether a Russian caller describes
 * the right event.
 */
export const SITUATION_BY_TEMPLATE: Record<string, Situation> = {
  // assist
  assist_enesetapuoht: 'suicide_risk',
  assist_joobes_isik_soiduteel: 'person_on_road',
  assist_kontserdil_vigastatu: 'unwell',
  assist_mehe_enesetapukatse: 'suicide',
  assist_suitsiidikatse_korghoones: 'suicide',
  assist_agressiivne_koer: 'dog',
  assist_gaasilohn: 'gas',
  assist_jarelevalveta_laps_rodul: 'child_alone',
  assist_joobes_isik_lumes: 'drunk_lying',
  assist_kiirabi_abistamine: 'ambulance_help',
  assist_laps_lukus_korteris: 'child_locked',
  assist_maja_suttimine: 'fire',
  assist_pogenenud_hobune: 'horse_road',
  assist_surnud_isik_hotellitoas: 'found_body',
  assist_abivajaja_trepikojas: 'person_lying',
  assist_eakas_kukkunud: 'fallen_self',
  assist_kahtlane_lohn_trepikojas: 'welfare',
  assist_koer_hammustas: 'dog_bite',
  assist_koer_rundas_koera: 'dog_dispute',
  assist_lasteaed_jarele_tulemata: 'child_not_collected',
  assist_lastekarjed_manguvaljakul: 'child_screams',
  assist_leitud_lohkekeha: 'ordnance',
  assist_metsloom_teel: 'elk_road',
  assist_surnud_isik_kodus: 'found_body',
  assist_teismelised_kraanadel: 'climbers',
  assist_torm_puu_teel: 'road_blocked',
  // alarm (alarm-centre and ANPR events never arrive as interactive calls)
  alarm_vehicle_tracker: 'car_tracker',
  // border
  border_drone_crossing: 'drone',
  border_migrant_smuggling: 'migrants',
  border_peipsi_boat: 'border_boat',
  border_river_crossing: 'border_crossing',
  border_weapons_smuggling_port: 'customs',
  border_cigarette_smuggling: 'smuggling',
  border_forged_passport: 'forgery',
  border_fuel_smuggling: 'smuggling',
  border_undocumented_person: 'border_check',
  // domestic
  domestic_child_caller: 'domestic_child',
  domestic_fatal: 'found_victim',
  domestic_knife: 'domestic',
  domestic_drunk_parent_children: 'child_neglect',
  domestic_injured_child: 'child_injured',
  domestic_midsummer_summerhouse: 'party_fight',
  domestic_partner_assault: 'domestic',
  domestic_removal_order_breach: 'order_breach',
  domestic_restraining_breach: 'order_breach',
  domestic_son_vs_parent: 'domestic',
  domestic_violence: 'domestic_neighbour',
  domestic_ex_stalking: 'harassment',
  domestic_verbal_dispute: 'domestic_argument',
  // drugs
  drugs_overdose_stairwell: 'overdose',
  drugs_intoxicated_person: 'drugged_person',
  drugs_weapon_deal_tip: 'weapon_deal',
  drugs_abandoned_factory: 'suspicious',
  drugs_dealer_near_school: 'drug_dealing',
  drugs_found_at_school: 'drug_found',
  drugs_local_dealers: 'drug_dealing',
  drugs_party: 'overdose',
  drugs_secret_meeting: 'suspicious',
  drugs_cannabis_grow: 'drug_smell',
  drugs_car_smell: 'drug_smell',
  drugs_syringes_playground: 'syringes',
  // easter eggs
  easter_alien_landing: 'ufo',
  easter_crashed_ufo: 'ufo',
  // environment
  environment_illegal_fire: 'fire_outdoor',
  environment_poaching: 'poaching',
  environment_animal_cruelty: 'animal_cruelty',
  environment_dog_attack_livestock: 'livestock_attack',
  environment_moose_in_town: 'wildlife',
  environment_night_digging: 'suspicious',
  environment_offroad_reserve: 'offroad',
  environment_peipsi_fishing: 'illegal_fishing',
  environment_polluted_river: 'pollution',
  environment_wolf_near_village: 'wildlife',
  environment_illegal_logging: 'logging',
  environment_waste_dumping: 'dumping',
  // fraud
  fraud_cyberattack: 'cyber',
  fraud_fake_officials: 'scam_door',
  fraud_grandchild_scam: 'scam_ongoing',
  fraud_counterfeit_money: 'counterfeit',
  fraud_counterfeit_notes_shop: 'counterfeit',
  fraud_doorstep_sales: 'fraud_generic',
  fraud_forged_document: 'forgery',
  fraud_smart_id_scam: 'scam',
  fraud_taxi_fare_refusal: 'fare_refusal',
  fraud_taxi_overcharge: 'fraud_generic',
  fraud_unpaid_wages: 'fraud_generic',
  fraud_computer_fraud: 'scam',
  fraud_fake_online_sale: 'scam',
  fraud_investment_scam: 'scam',
  fraud_pirate_taxis: 'fraud_generic',
  // major incidents
  major_bussionnetus: 'major_accident',
  major_kooli_pommiahvardus: 'bomb_threat',
  major_lennuki_kaaperdamine: 'hostage',
  major_massitulistamine_bussijaamas: 'shots',
  major_ohtliku_veose_leke: 'hazard',
  major_pantvangikriis_pangas: 'hostage',
  major_parvlaeva_tulekahju: 'fire',
  major_pogenenud_vang: 'escape',
  major_politseinik_tapeti: 'shots',
  major_pommiahvardus: 'bomb_threat',
  major_pommikahtlus_rongijaamas: 'suspicious_item',
  major_relvaga_isik_koolis: 'gun_threat',
  major_relvastatud_mees_katusel: 'gun_threat',
  major_tulistamine_kaubanduskeskuses: 'shots',
  major_tulistamine_koolis: 'shots',
  major_tunglemine_massiyritusel: 'major_accident',
  major_vangide_pogenemine_konvoist: 'escape',
  major_vangla_mass: 'prison_riot',
  major_droon_taristu_kohal: 'drone',
  major_kahtlane_pakk_postkastis: 'suspicious_item',
  major_kahtlane_pakk_rongijaamas: 'suspicious_item',
  major_kahtlustatav_kodust_valjumata: 'barricaded',
  major_kooliahvardus_internetis: 'online_threat',
  major_lohkematerjal_korteris: 'suspicious_item',
  major_tehnovorgu_saboteerimine: 'sabotage',
  // missing persons
  missing_aerulaud_merele: 'adrift',
  missing_kalurid_jaatykil: 'adrift_self',
  missing_lapse_roovimine: 'abduction',
  missing_ujuja_kadunud: 'drowning',
  missing_dementne_eakas: 'missing_dementia',
  missing_eakas_autojuht: 'missing_adult',
  missing_isik_metsa_eksinud: 'lost_forest',
  missing_kadunud_laps: 'missing_child',
  missing_koolilapse_kadumine: 'missing_child',
  missing_laps_kaubanduskeskuses: 'lost_child',
  missing_patsient_lahkus_haiglast: 'missing_patient',
  missing_seenel_eksinud: 'lost_self',
  missing_noor_asenduskodust: 'missing_youth',
  missing_teismeline_ei_tulnud_koju: 'missing_child',
  // property
  property_armed_shop_robbery: 'robbery',
  property_bank_robbery: 'armed_robbery',
  property_gas_station_robbery: 'robbery',
  property_burglary_in_progress: 'burglary_progress',
  property_catalytic_converter_theft: 'theft_progress',
  property_copper_cable_theft: 'theft_progress',
  property_elderly_home_intrusion: 'intrusion',
  property_street_robbery: 'street_robbery',
  property_till_snatch: 'robbery',
  property_van_vandalism: 'vandalism',
  property_abandoned_house: 'suspicious',
  property_bike_lock_cut: 'bike_theft',
  property_bike_theft: 'bike_theft',
  property_burned_car: 'burned_car',
  property_construction_tools: 'theft_after',
  property_flat_burglary: 'burglary',
  property_fuel_driveoff: 'theft_after',
  property_graffiti: 'vandalism',
  property_missing_jewellery: 'theft_after',
  property_moped_theft: 'theft_after',
  property_planned_bank_robbery: 'tip',
  property_shop_vandalism: 'vandalism_after',
  property_shoplifting_detained: 'shoplift',
  property_shoplifting_minor: 'shoplift',
  property_stolen_car: 'car_theft',
  property_storage_unit_theft: 'theft_after',
  property_summerhouse_burglaries: 'burglary_cottage',
  property_theft_from_car: 'theft_from_car',
  property_parcel_theft: 'theft_after',
  // public order
  public_order_drunk_on_road: 'person_on_road',
  public_order_protest_violent: 'riot',
  public_order_aggressive_customer: 'aggressive_person',
  public_order_airport_security: 'aggressive_person',
  public_order_apartment_smashing: 'aggressive_person',
  public_order_bar_troublemaker: 'aggressive_person',
  public_order_demonstration: 'riot',
  public_order_football_fans: 'fight',
  public_order_kids_party_brawl: 'fight',
  public_order_midsummer_bonfire: 'party_fight',
  public_order_suspicious_person_school: 'suspicious_school',
  public_order_drunk_harassing: 'drunk_person',
  public_order_drunk_lying: 'drunk_lying',
  public_order_hoa_conflict: 'threat',
  public_order_neighbourhood_watch: 'suspicious',
  public_order_night_noise: 'noise',
  public_order_parking_dispute: 'dispute',
  public_order_suspicious_parked_car: 'suspicious',
  public_order_youth_vandalism: 'vandalism',
  public_order_aggressive_beggar: 'pestering',
  public_order_balcony_litter: 'nuisance',
  public_order_car_music_parking: 'noise',
  public_order_garage_noise: 'noise',
  public_order_homeless_stairwell: 'nuisance',
  public_order_neighbour_noise_day: 'noise',
  public_order_night_fireworks: 'noise',
  public_order_noisy_birthday: 'noise',
  public_order_photographing_houses: 'suspicious',
  public_order_public_drinking: 'nuisance',
  // traffic
  traffic_laps_autos_palavus: 'child_in_car',
  traffic_lo_vigastatutega: 'accident',
  traffic_mittepeatumine: 'fleeing_vehicle',
  traffic_raudteeylesoit: 'rail_accident',
  traffic_rongilt_kukkunud: 'rail_person',
  traffic_vastassuunas_soitja: 'wrong_way',
  traffic_autoavarii: 'accident',
  traffic_jalakaija_vigastamine: 'accident',
  traffic_joobes_juhi_kahtlus: 'drunk_driver',
  traffic_joobes_juht_sadamas: 'drunk_driver_parked',
  traffic_joobes_juht_tanklas: 'drunk_driver_parked',
  traffic_juht_magab_ristmikul: 'driver_asleep',
  traffic_kokkuporge_podraga: 'animal_collision',
  traffic_lo_uhissoiduk: 'accident',
  traffic_loata_rallivoistlus: 'racing',
  traffic_purjus_autojuht: 'drunk_driver',
  traffic_soiduk_kraavis: 'single_crash',
  traffic_toukerattur_vigastatud: 'injured_person',
  traffic_jaatee_rikkuja: 'traffic',
  traffic_juhtimisoiguseta_juht: 'traffic_tip',
  traffic_kihutaja: 'racing',
  traffic_lo_varaline: 'fender_bender',
  traffic_mootorratturid_kihutavad: 'racing',
  traffic_naaber_joobes_rooli: 'drunk_driver_home',
  traffic_sundmuskohalt_lahkunud: 'hit_and_run',
  traffic_valgusfoorid_rikkis: 'traffic_lights',
  traffic_valgustamata_jalgrattur: 'traffic',
  // violence
  violence_attack_on_paramedic: 'ambulance_help',
  violence_bus_stop_beating: 'fight',
  violence_firearm_threat: 'gun_threat',
  violence_knife_threat: 'knife',
  violence_livestream_killing: 'shots',
  violence_officer_stabbed: 'knife',
  violence_playground_shooting: 'shots',
  violence_street_shootout: 'shots',
  violence_street_stabbing: 'knife',
  violence_trafficking_apartment: 'held_captive',
  violence_youth_revenge_attack: 'fight',
  violence_bar_fight_outside: 'fight',
  violence_human_trafficking: 'trafficking',
  violence_motel_killing: 'found_victim',
  violence_road_rage: 'road_rage',
  violence_sexual_harassment: 'stalking',
  violence_three_bodies: 'welfare',
  violence_remains_in_vehicle: 'found_body',
  violence_school_fight: 'fight_after',
  violence_sports_fight: 'assault_minor',
  violence_stalking_vehicle: 'stalking',
  violence_threatening: 'threat',
};

/** Whether a situation's wording suits an event of this priority (see Band). */
export function bandFits(sit: Situation, priority: number): boolean {
  const band = SITUATIONS[sit].band;
  return band === 'any' || (band === 'urgent' ? priority <= 2 : priority >= 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gendered forms
// ─────────────────────────────────────────────────────────────────────────────

export type Gn = 'M' | 'F' | undefined;

/** Resolve `{m|f}` (caller) and `[m|f|n]` (the person talked about) in one string. */
export function genderize(text: string, caller: Gn, subject: Gn): string {
  return text
    .replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_m, m: string, f: string) => (caller === 'F' ? f : m))
    .replace(/\[([^[\]|]*)\|([^[\]|]*)(?:\|([^[\]|]*))?\]/g, (_m, m: string, f: string, n?: string) =>
      subject === 'F' ? f : subject === 'M' ? m : (n ?? m),
    );
}

export function genderizePhrase(p: Phrase, caller: Gn, subject: Gn): Phrase {
  return { ru: genderize(p.ru, caller, subject), et: genderize(p.et, caller, subject), en: genderize(p.en, caller, subject) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spoken directions
// ─────────────────────────────────────────────────────────────────────────────

/** Street-type abbreviations as a caller says them, in the genitive ("Pikk tn" → "Pika tänava"). */
const STREET_TYPE_GEN: [RegExp, string][] = [
  [/ tn$/, ' tänava'],
  [/ tänav$/, ' tänava'],
  [/ pst$/, ' puiestee'],
  [/ mnt$/, ' maantee'],
  [/ pl$/, ' platsi'],
  [/ plats$/, ' platsi'],
  [/ prospekt$/, ' prospekti'],
  [/väljak$/, 'väljaku'],
  [/mägi$/, 'mäe'],
];

/** Street names that start with an adjective in the nominative ("Pikk tn" is "Pika tänava suunas"). */
const LEADING_ADJ_GEN: [RegExp, string][] = [
  [/^Pikk /, 'Pika '],
  [/^Lai /, 'Laia '],
  [/^Punane /, 'Punase '],
  [/^Suur /, 'Suure '],
  [/^Väike /, 'Väikese '],
  [/^Uus /, 'Uue '],
  [/^Vana /, 'Vana '],
];

/** A street as a caller names it before "suunas": genitive, abbreviations spoken out. */
export function spokenStreetGenitive(name: string): string {
  let out = name.trim();
  for (const [re, to] of LEADING_ADJ_GEN) if (re.test(out)) out = out.replace(re, to);
  for (const [re, to] of STREET_TYPE_GEN) {
    if (re.test(out)) {
      out = out.replace(re, to);
      break;
    }
  }
  return out;
}
