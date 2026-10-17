// Owned by gen-people. Name pools for generated persons, ordered by (approximate) frequency.
import type { Rng } from '@/sim/rng';
import type { Gender, SpeakerLang } from '@/sim/types';

/** Name origin; finer than SpeakerLang ('en' speakers are often Latvians or Lithuanians). */
export type NameOrigin = 'et' | 'ru' | 'uk' | 'fi' | 'en' | 'lv' | 'lt';

type Era = 'old' | 'mid' | 'young' | 'kid';

// prettier-ignore
// Estonian given names by birth cohort: old ≤1959, mid 1960-84, young 1985-2004, kid ≥2005.
const EST_MALE_ERA: Record<Era, string[]> = {
  old: [
    'Jaan', 'Peeter', 'Toomas', 'Tiit', 'Jüri', 'Rein', 'Mati', 'Ants', 'Enn', 'Tõnu', 'Heino', 'Kalju',
    'Lembit', 'Vello', 'Arvo', 'Uno', 'Ülo', 'Endel', 'Heiki', 'Kalev', 'Aleksander', 'Olev', 'Elmar',
    'Valdur', 'Harri', 'Hillar', 'Ilmar', 'Väino', 'Eino', 'Evald', 'Leo', 'Aarne', 'Toivo', 'Juhan', 'Kaljo',
    'Raimond', 'Avo', 'Henn', 'Jaak', 'Udo', 'Valter', 'Rudolf', 'Johannes', 'Märt', 'Ahto', 'Aavo', 'Paul',
    'Sulev',
  ],
  mid: [
    'Andres', 'Toomas', 'Margus', 'Urmas', 'Aivar', 'Indrek', 'Priit', 'Raivo', 'Meelis', 'Tarmo', 'Jaanus',
    'Erik', 'Ain', 'Kaido', 'Alar', 'Andrus', 'Tõnis', 'Marko', 'Rene', 'Raul', 'Janek', 'Hannes', 'Ivo',
    'Heiki', 'Mart', 'Madis', 'Kalle', 'Veiko', 'Tanel', 'Peep', 'Rait', 'Allan', 'Argo', 'Arno', 'Margo',
    'Marek', 'Rainer', 'Riho', 'Silver', 'Sven', 'Taivo', 'Tarvo', 'Vahur', 'Ülar', 'Alo', 'Erki', 'Gunnar',
    'Imre', 'Janno', 'Kuldar', 'Neeme', 'Raigo', 'Rando', 'Urmo', 'Valdo', 'Vaido', 'Viljar', 'Aare', 'Ago',
    'Aimar', 'Ainar', 'Kaupo', 'Mihkel', 'Lauri',
  ],
  young: [
    'Martin', 'Kristjan', 'Siim', 'Rasmus', 'Karl', 'Mihkel', 'Marko', 'Sander', 'Kristo', 'Taavi', 'Tanel',
    'Mart', 'Lauri', 'Ott', 'Kaspar', 'Andreas', 'Joonas', 'Rauno', 'Henri', 'Kevin', 'Robin', 'Robert',
    'Markus', 'Oliver', 'Erik', 'Kaarel', 'Mikk', 'Gert', 'Ragnar', 'Rainer', 'Karel', 'Marten', 'Sten',
    'Kaur', 'Hendrik', 'Jaagup', 'Joosep', 'Kristofer', 'Tauri', 'Aleks', 'Andero', 'Anti', 'Ats', 'Gregor',
    'Janar', 'Jarmo', 'Johan', 'Kert', 'Kermo', 'Priit', 'Raiko', 'Randel', 'Reimo', 'Risto', 'Romet',
    'Silver', 'Villem', 'Madis', 'Hannes', 'Tõnis',
  ],
  kid: [
    'Rasmus', 'Oliver', 'Robin', 'Romet', 'Markus', 'Martin', 'Hugo', 'Mattias', 'Sebastian', 'Karl',
    'Robert', 'Henri', 'Kevin', 'Artur', 'Daniel', 'Oskar', 'Kristofer', 'Gregor', 'Joosep', 'Johannes',
    'Jakob', 'Elias', 'Theodor', 'Mark', 'Aleksander', 'Georg', 'Hendrik', 'Kaspar', 'Lukas', 'Patrick',
    'Tristan', 'Mihkel', 'Mikk', 'Uku', 'Remi', 'Emil', 'Tobias', 'Leo', 'Kaarel', 'Jaan', 'Paul', 'Aron',
    'Albert', 'Herman', 'Kenert', 'Lenno', 'Mathias', 'Stefan',
  ],
};

// prettier-ignore
const EST_FEMALE_ERA: Record<Era, string[]> = {
  old: [
    'Tiiu', 'Malle', 'Ene', 'Sirje', 'Aino', 'Helgi', 'Maie', 'Laine', 'Linda', 'Aili', 'Elvi', 'Hilja',
    'Leida', 'Vaike', 'Valve', 'Silvi', 'Ilme', 'Milvi', 'Ella', 'Salme', 'Leili', 'Helju', 'Asta', 'Aime',
    'Evi', 'Lehte', 'Mare', 'Reet', 'Tiina', 'Anne', 'Mai', 'Urve', 'Viivi', 'Virve', 'Ülle', 'Eha', 'Elle',
    'Helle', 'Maret', 'Marje', 'Meeli', 'Saima', 'Hilda', 'Heli', 'Hiie', 'Ines', 'Riina', 'Rutt', 'Erika',
    'Ester', 'Maimu', 'Vilma', 'Õie', 'Ellen',
  ],
  mid: [
    'Tiina', 'Anne', 'Kersti', 'Marika', 'Kadri', 'Katrin', 'Piret', 'Pille', 'Merike', 'Ülle', 'Reet',
    'Riina', 'Margit', 'Anu', 'Kristi', 'Maria', 'Eve', 'Kaja', 'Kaire', 'Krista', 'Tiia', 'Signe', 'Helen',
    'Liina', 'Kai', 'Mari', 'Ave', 'Evelin', 'Maarja', 'Heli', 'Inga', 'Jaana', 'Karin', 'Kätlin', 'Leelo',
    'Merle', 'Monika', 'Pirjo', 'Raili', 'Sille', 'Terje', 'Triin', 'Viivika', 'Ilona', 'Ingrid', 'Kairi',
    'Külli', 'Lea', 'Mariann', 'Meelika', 'Merit', 'Siiri', 'Tuuli', 'Annika', 'Marje',
  ],
  young: [
    'Kristiina', 'Kadi', 'Laura', 'Liis', 'Maria', 'Anna', 'Triin', 'Kätlin', 'Kerli', 'Kertu', 'Mari',
    'Marleen', 'Merili', 'Getter', 'Helen', 'Kaisa', 'Kelly', 'Kristel', 'Liisa', 'Maarja', 'Merilin',
    'Annika', 'Hanna', 'Sandra', 'Grete', 'Elisabeth', 'Karmen', 'Katariina', 'Keit', 'Kärt', 'Liisi',
    'Mirjam', 'Piia', 'Reelika', 'Sigrid', 'Sirli', 'Teele', 'Triinu', 'Jaanika', 'Johanna', 'Kaia', 'Keiti',
    'Kristin', 'Marit', 'Marta', 'Moonika', 'Nele', 'Ragne', 'Riin', 'Eneli', 'Egle', 'Gerli', 'Heleri',
    'Helena', 'Kadri',
  ],
  kid: [
    'Sofia', 'Mia', 'Eliise', 'Emma', 'Lisandra', 'Maria', 'Laura', 'Mirtel', 'Hanna', 'Sandra', 'Anna',
    'Elisabeth', 'Amelia', 'Marta', 'Lenna', 'Liisa', 'Isabel', 'Aleksandra', 'Mirjam', 'Grete', 'Emily',
    'Victoria', 'Melissa', 'Nora', 'Lisete', 'Elsa', 'Loore', 'Adeele', 'Liisbet', 'Johanna', 'Karoliina',
    'Kristella', 'Paula', 'Säde', 'Marleen', 'Teele', 'Olivia', 'Eva', 'Elis', 'Iris', 'Simona', 'Saskia',
    'Hele', 'Lilian', 'Mariette',
  ],
};

// prettier-ignore
const RU_MALE_ERA: Record<Era, string[]> = {
  old: [
    'Vladimir', 'Nikolai', 'Viktor', 'Anatoli', 'Valeri', 'Juri', 'Gennadi', 'Vassili', 'Aleksandr',
    'Mihhail', 'Ivan', 'Boriss', 'Leonid', 'Valentin', 'Pjotr', 'Grigori', 'Fjodor', 'Arkadi', 'Semjon',
    'Stepan', 'Jakov', 'Eduard', 'Lev', 'German', 'Vjatšeslav',
  ],
  mid: [
    'Aleksandr', 'Sergei', 'Andrei', 'Igor', 'Dmitri', 'Aleksei', 'Oleg', 'Vladimir', 'Juri', 'Jevgeni',
    'Viktor', 'Vadim', 'Vitali', 'Konstantin', 'Pavel', 'Mihhail', 'Vjatšeslav', 'Roman', 'Deniss',
    'Stanislav', 'Anton', 'Ruslan', 'Valeri', 'Eduard', 'Ilja', 'Maksim', 'Artur', 'Vladislav', 'Nikolai',
  ],
  young: [
    'Aleksandr', 'Dmitri', 'Andrei', 'Sergei', 'Aleksei', 'Maksim', 'Artjom', 'Deniss', 'Nikita', 'Jevgeni',
    'Roman', 'Ilja', 'Anton', 'Kirill', 'Pavel', 'Vladislav', 'Ivan', 'Daniil', 'Jegor', 'Mihhail',
    'Konstantin', 'Igor', 'Vadim', 'Ruslan', 'Timur', 'Stanislav', 'Artur', 'German', 'Filipp',
  ],
  kid: [
    'Maksim', 'Artjom', 'Nikita', 'Daniil', 'Kirill', 'Jegor', 'Mark', 'Matvei', 'Ivan', 'Aleksandr',
    'Timofei', 'Lev', 'Arseni', 'Gleb', 'Mihhail', 'Daniel', 'Roman', 'Platon', 'Bogdan', 'Zahhar',
    'Svjatoslav', 'Georgi', 'Dmitri', 'Robert',
  ],
};

// prettier-ignore
const RU_FEMALE_ERA: Record<Era, string[]> = {
  old: [
    'Galina', 'Ljudmila', 'Valentina', 'Tamara', 'Nina', 'Tatjana', 'Ljubov', 'Nadežda', 'Raissa', 'Zinaida',
    'Vera', 'Antonina', 'Lidia', 'Zoja', 'Klavdia', 'Alevtina', 'Taissia', 'Maja', 'Jelena', 'Larissa',
    'Svetlana', 'Olga', 'Irina', 'Alla', 'Nelli',
  ],
  mid: [
    'Jelena', 'Olga', 'Tatjana', 'Natalja', 'Irina', 'Svetlana', 'Marina', 'Julia', 'Larissa', 'Oksana',
    'Inna', 'Anna', 'Jekaterina', 'Ljudmila', 'Galina', 'Žanna', 'Viktoria', 'Ilona', 'Anžela', 'Elvira',
    'Lilia', 'Jevgenia', 'Margarita', 'Regina', 'Alla', 'Diana', 'Kristina', 'Jana', 'Nadežda',
  ],
  young: [
    'Anastassia', 'Jekaterina', 'Julia', 'Anna', 'Maria', 'Darja', 'Kristina', 'Viktoria', 'Aleksandra',
    'Jelena', 'Olga', 'Natalja', 'Alina', 'Jana', 'Ksenia', 'Valeria', 'Veronika', 'Diana', 'Polina',
    'Jelizaveta', 'Margarita', 'Irina', 'Tatjana', 'Svetlana', 'Angelina', 'Karina', 'Marina', 'Kira',
  ],
  kid: [
    'Sofia', 'Anastassia', 'Maria', 'Polina', 'Darja', 'Alissa', 'Viktoria', 'Jelizaveta', 'Varvara', 'Eva',
    'Arina', 'Uljana', 'Milana', 'Valeria', 'Veronika', 'Kira', 'Vassilissa', 'Miroslava', 'Anna',
    'Aleksandra', 'Stefania', 'Jaroslava',
  ],
};

/** Merge era lists round-robin (dedup) into one list approximating overall frequency. */
function mergeEras(eras: Record<Era, string[]>): string[] {
  const lists = [eras.mid, eras.old, eras.young, eras.kid];
  const out: string[] = [];
  const seen = new Set<string>();
  const max = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const l of lists) {
      const n = l[i];
      if (n !== undefined && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

export const EST_MALE: string[] = mergeEras(EST_MALE_ERA);
export const EST_FEMALE: string[] = mergeEras(EST_FEMALE_ERA);
export const RU_MALE: string[] = mergeEras(RU_MALE_ERA);
export const RU_FEMALE: string[] = mergeEras(RU_FEMALE_ERA);

// prettier-ignore
export const EST_SURNAMES: string[] = [
  'Tamm', 'Saar', 'Sepp', 'Mägi', 'Kask', 'Kukk', 'Rebane', 'Ilves', 'Pärn', 'Koppel', 'Lepik', 'Luik',
  'Kaasik', 'Lepp', 'Oja', 'Raudsepp', 'Kuusk', 'Vaher', 'Kallas', 'Mets', 'Karu', 'Kõiv', 'Põder', 'Jõgi',
  'Kivi', 'Lill', 'Teder', 'Peterson', 'Kuusik', 'Laur', 'Kruus', 'Saks', 'Kangur', 'Jakobson', 'Org',
  'Lõhmus', 'Mölder', 'Paju', 'Ots', 'Toom', 'Uibo', 'Sild', 'Rand', 'Kull', 'Liiv', 'Nõmm', 'Vares', 'Põld',
  'Aas', 'Unt', 'Hunt', 'Raud', 'Paas', 'Laas', 'Tooming', 'Leppik', 'Kütt', 'Kangro', 'Allik', 'Kurg',
  'Hein', 'Väli', 'Mänd', 'Kalda', 'Lind', 'Aru', 'Kala', 'Laine', 'Nurk', 'Tomson', 'Pihlak', 'Remmel',
  'Moor', 'Sarapuu', 'Arro', 'Kikas', 'Pukk', 'Rätsep', 'Kalmus', 'Kont', 'Laane', 'Mark', 'Martin', 'Lember',
  'Tuisk', 'Kirs', 'Kaljuste', 'Kaljurand', 'Luts', 'Lumi', 'Matson', 'Mikk', 'Must', 'Nurm', 'Oras', 'Parts',
  'Pärtel', 'Piir', 'Puusepp', 'Raidma', 'Rannik', 'Rohtla', 'Ruus', 'Saarma', 'Sikk', 'Soo', 'Soosaar',
  'Suits', 'Tali', 'Tamme', 'Tiits', 'Toots', 'Truu', 'Tõnisson', 'Õun', 'Ader', 'Alas', 'Hallik', 'Heinsalu',
  'Jaakson', 'Jalakas', 'Juhkam', 'Jürgenson', 'Jürisson', 'Kaev', 'Kahar', 'Kaur', 'Kiik', 'Klaas', 'Kokk',
  'Kolk', 'Koort', 'Kotkas', 'Kuus', 'Kõrv', 'Käär', 'Laanemets', 'Laht', 'Lass', 'Lee', 'Leis', 'Liblik',
  'Lukk', 'Lõoke', 'Lääne', 'Maasik', 'Mihkelson', 'Mõttus', 'Mätas', 'Nõmmik', 'Ojala', 'Ojaste', 'Orav',
  'Ott', 'Palm', 'Pedak', 'Pihl', 'Piho', 'Pilv', 'Poom', 'Pruul', 'Põldma', 'Raag', 'Rahu', 'Randma', 'Raus',
  'Reinsalu', 'Rist', 'Roos', 'Rosin', 'Saare', 'Salu', 'Seppel', 'Sibul', 'Sillaste', 'Simm', 'Soots',
  'Sutt', 'Talts', 'Tammik', 'Teearu', 'Tiik', 'Tikk', 'Tomingas', 'Treier', 'Tuul', 'Türk', 'Uustalu',
  'Vaik', 'Valk', 'Vall', 'Varik', 'Veski', 'Vesik', 'Vihma', 'Viks', 'Villems', 'Visnapuu', 'Võsu', 'Õunap',
  'Kivistik', 'Kalm', 'Laidre', 'Nuut', 'Kaljula', 'Kärner', 'Kasemets', 'Lepmets', 'Metsala', 'Mürk', 'Paal',
  'Pajula', 'Pent', 'Puhm', 'Reimann', 'Sooväli', 'Tamberg', 'Undrus', 'Vahtra', 'Viira',
];

// prettier-ignore
/** Russian surnames (masculine form, Estonian transliteration). */
export const RU_SURNAMES: string[] = [
  'Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Vassiljev', 'Petrov', 'Sokolov', 'Mihhailov', 'Novikov',
  'Fjodorov', 'Morozov', 'Volkov', 'Aleksejev', 'Lebedev', 'Semjonov', 'Jegorov', 'Pavlov', 'Kozlov',
  'Stepanov', 'Nikolajev', 'Orlov', 'Andrejev', 'Makarov', 'Nikitin', 'Zahharov', 'Zaitsev', 'Solovjov',
  'Borissov', 'Jakovlev', 'Grigorjev', 'Romanov', 'Vorobjov', 'Sergejev', 'Kuzmin', 'Frolov', 'Aleksandrov',
  'Dmitrijev', 'Koroljov', 'Gussev', 'Kisseljov', 'Iljin', 'Maksimov', 'Poljakov', 'Sorokin', 'Vinogradov',
  'Kovaljov', 'Belov', 'Medvedev', 'Antonov', 'Tarassov', 'Žukov', 'Baranov', 'Filippov', 'Komarov',
  'Davõdov', 'Beljajev', 'Gerassimov', 'Bogdanov', 'Ossipov', 'Sidorov', 'Matvejev', 'Titov', 'Markov',
  'Mironov', 'Krõlov', 'Kulikov', 'Karpov', 'Vlassov', 'Melnikov', 'Denissov', 'Gavrilov', 'Tihhonov',
  'Kazakov', 'Afanasjev', 'Danilov', 'Saveljev', 'Timofejev', 'Fomin', 'Tšernov', 'Abramov', 'Martõnov',
  'Jefimov', 'Fedotov', 'Štšerbakov', 'Nazarov', 'Kalinin', 'Issajev', 'Bõkov', 'Suvorov', 'Gontšarov',
  'Golubev', 'Kudrjavtsev', 'Prohhorov', 'Naumov', 'Potapov', 'Žuravljov', 'Ovtšinnikov', 'Trofimov',
  'Leonov', 'Sobolev', 'Jermakov', 'Kolesnikov', 'Jemeljanov', 'Nikiforov', 'Kotov', 'Šestakov', 'Rõbakov',
  'Suhhanov', 'Širokov', 'Jurjev', 'Agafonov', 'Moissejev', 'Jeršov', 'Gorbunov', 'Voronin', 'Bobrov',
  'Lukin', 'Beloussov', 'Rodionov', 'Sinitsõn', 'Rjabov', 'Kornilov', 'Tšistjakov', 'Golovin', 'Lavrov',
  'Ignatjev', 'Zujev', 'Krjukov', 'Muravjov', 'Galkin', 'Lapin', 'Kovalevski', 'Zaretski', 'Kaminski',
  'Žukovski', 'Tolstoi', 'Donskoi', 'Sedõh', 'Tšernõh', 'Belõh', 'Bondarenko', 'Kravtšenko', 'Rabinovitš',
  'Šapiro',
];

// prettier-ignore
export const UA_MALE: string[] = [
  'Oleksandr', 'Andrii', 'Serhii', 'Volodymyr', 'Dmytro', 'Oleksii', 'Mykola', 'Ivan', 'Yurii', 'Viktor',
  'Vasyl', 'Petro', 'Taras', 'Bohdan', 'Ihor', 'Maksym', 'Artem', 'Denys', 'Roman', 'Vitalii', 'Oleh',
  'Pavlo', 'Yaroslav', 'Stepan', 'Vadym', 'Ruslan', 'Vladyslav', 'Danylo', 'Nazar', 'Kyrylo', 'Illia',
  'Yevhen', 'Anatolii', 'Valerii', 'Hryhorii', 'Ostap', 'Matvii', 'Tymofii', 'Mykhailo',
];

// prettier-ignore
export const UA_FEMALE: string[] = [
  'Olena', 'Nataliia', 'Tetiana', 'Iryna', 'Svitlana', 'Oksana', 'Yuliia', 'Anna', 'Mariia', 'Kateryna',
  'Liudmyla', 'Halyna', 'Nadiia', 'Viktoriia', 'Valentyna', 'Larysa', 'Alina', 'Daria', 'Anastasiia', 'Inna',
  'Liliia', 'Khrystyna', 'Sofiia', 'Olha', 'Yana', 'Vira', 'Polina', 'Diana', 'Oleksandra', 'Veronika',
  'Solomiia', 'Ivanna', 'Myroslava', 'Uliana', 'Lesia',
];

// prettier-ignore
/**
 * Ukrainian surnames in Ukrainian-passport romanisation, as the Estonian register stores them
 * (docs/research/names-demographics.md §4.1). Mostly gender-invariant; -skyi/-yi take -ska/-a.
 */
export const UA_SURNAMES: string[] = [
  'Melnyk', 'Shevchenko', 'Kovalenko', 'Bondarenko', 'Boiko', 'Tkachenko', 'Kravchenko', 'Kovalchuk',
  'Koval', 'Oliinyk', 'Shevchuk', 'Polishchuk', 'Lysenko', 'Bondar', 'Tkachuk', 'Savchenko', 'Rudenko',
  'Moroz', 'Marchenko', 'Petrenko', 'Kravets', 'Klymenko', 'Pavlenko', 'Ponomarenko', 'Savchuk', 'Vasylenko',
  'Levchenko', 'Kharchenko', 'Karpenko', 'Mazur', 'Kuzmenko', 'Melnychuk', 'Zinchenko', 'Kozak', 'Kushnir',
  'Prykhodko', 'Honcharenko', 'Panasiuk', 'Romanenko', 'Prokopenko', 'Sydorenko', 'Lytvynenko', 'Danyliuk',
  'Tymoshenko', 'Hrytsenko', 'Fedorenko', 'Nazarenko', 'Yakovenko', 'Stepanenko', 'Ostapenko', 'Demchenko',
  'Ivanchenko', 'Didenko', 'Radchenko', 'Kostenko', 'Yurchenko', 'Kostiuk', 'Hnatiuk', 'Kyrylenko', 'Vovk',
  'Tkach', 'Hrabovskyi', 'Kovalskyi', 'Kaminskyi', 'Bilyi',
];

// prettier-ignore
const FI_MALE = [
  'Mikko', 'Juha', 'Timo', 'Jari', 'Antti', 'Matti', 'Janne', 'Mika', 'Ville', 'Jukka', 'Pekka', 'Kari',
  'Petri', 'Markku', 'Sami', 'Teemu', 'Tuomas', 'Lauri', 'Eero', 'Heikki', 'Ilkka', 'Jussi', 'Aleksi', 'Joni',
];
// prettier-ignore
const FI_FEMALE = [
  'Anne', 'Tiina', 'Sari', 'Päivi', 'Johanna', 'Riikka', 'Minna', 'Hanna', 'Laura', 'Satu', 'Katja', 'Kaisa',
  'Maria', 'Emilia', 'Elina', 'Heidi', 'Sanna', 'Leena', 'Outi', 'Anu',
];
// prettier-ignore
const FI_SURNAMES = [
  'Korhonen', 'Virtanen', 'Mäkinen', 'Nieminen', 'Mäkelä', 'Hämäläinen', 'Laine', 'Heikkinen', 'Koskinen',
  'Järvinen', 'Lehtonen', 'Lehtinen', 'Saarinen', 'Salminen', 'Heinonen', 'Niemi', 'Heikkilä', 'Kinnunen',
  'Salonen', 'Turunen', 'Salo', 'Laitinen', 'Tuominen', 'Rantanen', 'Karjalainen', 'Jokinen', 'Mattila',
  'Savolainen', 'Lahtinen', 'Ahonen',
];
// prettier-ignore
const EN_MALE = [
  'James', 'John', 'David', 'Michael', 'Daniel', 'Thomas', 'Mark', 'Paul', 'Andrew', 'Christopher', 'Matthew',
  'Ryan', 'Ben', 'Liam', 'Jack', 'Oliver', 'Peter', 'Steven', 'Richard', 'Robert',
];
// prettier-ignore
const EN_FEMALE = [
  'Sarah', 'Emma', 'Laura', 'Emily', 'Jessica', 'Hannah', 'Sophie', 'Rachel', 'Kate', 'Amy', 'Charlotte',
  'Lucy', 'Anna', 'Megan', 'Rebecca', 'Olivia', 'Claire', 'Helen', 'Grace', 'Julia',
];
// prettier-ignore
const EN_SURNAMES = [
  'Smith', 'Jones', 'Williams', 'Brown', 'Taylor', 'Davies', 'Wilson', 'Evans', 'Thomas', 'Johnson',
  'Roberts', 'Walker', 'Wright', 'Robinson', 'Thompson', 'White', 'Hughes', 'Edwards', 'Green', 'Hall',
  'Wood', 'Harris', 'Clarke', 'Jackson', 'Murphy', 'Kelly', 'Miller', 'Anderson', 'Moore', 'Martin',
];
// prettier-ignore
const LV_MALE = [
  'Jānis', 'Andris', 'Mārtiņš', 'Edgars', 'Kārlis', 'Aivars', 'Juris', 'Māris', 'Artūrs', 'Raivis', 'Roberts',
  'Kristaps', 'Valdis', 'Guntis', 'Ivars', 'Ainārs', 'Dainis', 'Uldis', 'Gints', 'Normunds',
];
// prettier-ignore
const LV_FEMALE = [
  'Anna', 'Kristīne', 'Inese', 'Ilze', 'Laura', 'Līga', 'Santa', 'Linda', 'Dace', 'Ieva', 'Sanita', 'Evija',
  'Agnese', 'Zane', 'Elīna', 'Marta', 'Baiba', 'Liene', 'Inga', 'Madara',
];
/** Latvian surnames as [masculine, feminine]. */
const LV_SURNAMES: [string, string][] = [
  ['Bērziņš', 'Bērziņa'],
  ['Kalniņš', 'Kalniņa'],
  ['Ozoliņš', 'Ozoliņa'],
  ['Jansons', 'Jansone'],
  ['Ozols', 'Ozola'],
  ['Liepiņš', 'Liepiņa'],
  ['Krūmiņš', 'Krūmiņa'],
  ['Balodis', 'Balode'],
  ['Eglītis', 'Eglīte'],
  ['Zariņš', 'Zariņa'],
  ['Pētersons', 'Pētersone'],
  ['Vītols', 'Vītola'],
  ['Kļaviņš', 'Kļaviņa'],
  ['Kārkliņš', 'Kārkliņa'],
  ['Vanags', 'Vanaga'],
  ['Lapiņš', 'Lapiņa'],
  ['Siliņš', 'Siliņa'],
  ['Kalējs', 'Kalēja'],
  ['Ābols', 'Ābola'],
  ['Grīnbergs', 'Grīnberga'],
];
// prettier-ignore
const LT_MALE = [
  'Tomas', 'Mantas', 'Darius', 'Andrius', 'Jonas', 'Paulius', 'Marius', 'Lukas', 'Vytautas', 'Giedrius',
  'Mindaugas', 'Donatas', 'Saulius', 'Rokas', 'Tadas', 'Aurimas', 'Gintaras', 'Arūnas', 'Algirdas', 'Linas',
];
// prettier-ignore
const LT_FEMALE = [
  'Rūta', 'Jurgita', 'Laura', 'Kristina', 'Agnė', 'Ieva', 'Inga', 'Asta', 'Greta', 'Eglė', 'Rasa', 'Vaida',
  'Simona', 'Monika', 'Gabija', 'Indrė', 'Lina', 'Aistė', 'Jolanta', 'Dovilė',
];
/** Lithuanian surnames as [masculine, feminine (married form)]. */
const LT_SURNAMES: [string, string][] = [
  ['Kazlauskas', 'Kazlauskienė'],
  ['Jankauskas', 'Jankauskienė'],
  ['Petrauskas', 'Petrauskienė'],
  ['Stankevičius', 'Stankevičienė'],
  ['Vasiliauskas', 'Vasiliauskienė'],
  ['Žukauskas', 'Žukauskienė'],
  ['Butkus', 'Butkienė'],
  ['Paulauskas', 'Paulauskienė'],
  ['Urbonas', 'Urbonienė'],
  ['Kavaliauskas', 'Kavaliauskienė'],
  ['Baranauskas', 'Baranauskienė'],
  ['Pocius', 'Pocienė'],
  ['Sakalauskas', 'Sakalauskienė'],
  ['Navickas', 'Navickienė'],
  ['Rimkus', 'Rimkienė'],
  ['Žilinskas', 'Žilinskienė'],
  ['Ramanauskas', 'Ramanauskienė'],
  ['Šimkus', 'Šimkienė'],
  ['Adomaitis', 'Adomaitienė'],
  ['Lukoševičius', 'Lukoševičienė'],
];

// prettier-ignore
/** Farm (talu) names in the genitive, as used in rural addresses: "Mäe talu". */
export const FARM_NAMES: string[] = [
  'Mäe', 'Kase', 'Uuetoa', 'Männi', 'Jaani', 'Vanatoa', 'Metsa', 'Kivi', 'Nurme', 'Välja', 'Kuuse', 'Saare',
  'Lepa', 'Tamme', 'Pihlaka', 'Paju', 'Allika', 'Järve', 'Oja', 'Niidu', 'Põllu', 'Aia', 'Kalda', 'Liiva',
  'Tõnise', 'Mardi', 'Peetri', 'Hansu', 'Andrese', 'Mihkli', 'Jüri', 'Toomase', 'Juhani', 'Kaarli', 'Madise',
  'Aadu', 'Hindrikse', 'Jaagu', 'Matsi', 'Pärtli', 'Tiidu', 'Uustalu', 'Alttoa', 'Ülejõe', 'Teeääre',
  'Ojaääre', 'Põldotsa', 'Metsatuka', 'Kõrtsi', 'Veski', 'Sepa', 'Rätsepa', 'Kooli', 'Mõisa', 'Kännu',
  'Vahtra', 'Haava', 'Sarapuu', 'Kadaka', 'Kuusiku', 'Kasesalu', 'Lepiku', 'Kõrve', 'Raja', 'Silla',
  'Kanarbiku', 'Pajusalu', 'Rehe', 'Laane', 'Tagametsa', 'Mäeotsa', 'Oru', 'Nõmme', 'Künka', 'Kingu',
  'Kaasiku', 'Sooääre', 'Vainu', 'Kopli', 'Tõrva', 'Rabaääre', 'Soo', 'Kuldse', 'Vana-Jaani', 'Uue-Mardi',
  'Lauri', 'Ado', 'Tooma', 'Rebase', 'Karu', 'Kure',
];

// ─────────────────────────────────────────────────────────────────────────────
// Sampling
// ─────────────────────────────────────────────────────────────────────────────

/** Zipf-like pick: weight 1/(rank+q)^s. Cumulative tables are cached per list. */
const cumCache = new WeakMap<readonly unknown[], Float64Array>();

function zipfIndex(rng: Rng, n: number, list: readonly unknown[], s: number, q: number): number {
  let cum = cumCache.get(list);
  if (!cum || cum.length !== n) {
    cum = new Float64Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += 1 / Math.pow(i + q, s);
      cum[i] = acc;
    }
    cumCache.set(list, cum);
  }
  const r = rng.next() * cum[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] > r) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Frequency-weighted pick from a list ordered by frequency. */
export function zipfPick<T>(rng: Rng, list: readonly T[], s = 0.85, q = 6): T {
  return list[zipfIndex(rng, list.length, list, s, q)];
}

function eraOf(birthYear: number): Era {
  if (birthYear < 1960) return 'old';
  if (birthYear < 1985) return 'mid';
  if (birthYear < 2005) return 'young';
  return 'kid';
}

const ERA_ORDER: Era[] = ['old', 'mid', 'young', 'kid'];

// prettier-ignore
const DOUBLE_MALE = [
  'Karl-Erik', 'Hans-Kristjan', 'Karl-Martin', 'Jan-Erik', 'Karl-Joosep', 'Mihkel-Martin', 'Hans-Gregor',
  'Karl-Robert',
];
// prettier-ignore
const DOUBLE_FEMALE = [
  'Mari-Liis', 'Anna-Liisa', 'Pille-Riin', 'Hanna-Liisa', 'Kerli-Ann', 'Liisa-Maria', 'Mari-Ann', 'Kadri-Ann',
];

/** Mostly the person's own cohort, sometimes a neighbouring one (names drift). */
function pickEraList(rng: Rng, eras: Record<Era, string[]>, birthYear: number): string[] {
  const i = ERA_ORDER.indexOf(eraOf(birthYear));
  const r = rng.next();
  let j = i;
  if (r < 0.12 && i > 0) j = i - 1;
  else if (r > 0.9 && i < ERA_ORDER.length - 1) j = i + 1;
  return eras[ERA_ORDER[j]];
}

function givenName(rng: Rng, origin: NameOrigin, gender: Gender, birthYear?: number): string {
  const male = gender === 'M';
  switch (origin) {
    case 'et':
    case 'ru': {
      // Hyphenated double names became common for Estonians born from the mid-1980s.
      if (origin === 'et' && birthYear !== undefined && birthYear >= 1985 && rng.chance(0.04)) {
        return rng.pick(male ? DOUBLE_MALE : DOUBLE_FEMALE);
      }
      const eras =
        origin === 'et' ? (male ? EST_MALE_ERA : EST_FEMALE_ERA) : male ? RU_MALE_ERA : RU_FEMALE_ERA;
      if (birthYear === undefined) {
        return zipfPick(rng, origin === 'et' ? (male ? EST_MALE : EST_FEMALE) : male ? RU_MALE : RU_FEMALE);
      }
      return zipfPick(rng, pickEraList(rng, eras, birthYear), 0.8, 5);
    }
    case 'uk':
      return zipfPick(rng, male ? UA_MALE : UA_FEMALE);
    case 'fi':
      return zipfPick(rng, male ? FI_MALE : FI_FEMALE);
    case 'lv':
      return zipfPick(rng, male ? LV_MALE : LV_FEMALE);
    case 'lt':
      return zipfPick(rng, male ? LT_MALE : LT_FEMALE);
    default:
      return zipfPick(rng, male ? EN_MALE : EN_FEMALE);
  }
}

function familyName(rng: Rng, origin: NameOrigin, gender: Gender): string {
  switch (origin) {
    case 'et':
      return zipfPick(rng, EST_SURNAMES, 0.7, 8);
    case 'ru':
      return russianSurnameForGender(zipfPick(rng, RU_SURNAMES, 0.75, 6), gender);
    case 'uk':
      return ukrainianSurnameForGender(zipfPick(rng, UA_SURNAMES, 0.75, 6), gender);
    case 'fi':
      return zipfPick(rng, FI_SURNAMES);
    case 'lv': {
      const [m, f] = zipfPick(rng, LV_SURNAMES);
      return gender === 'M' ? m : f;
    }
    case 'lt': {
      const [m, f] = zipfPick(rng, LT_SURNAMES);
      return gender === 'M' ? m : f;
    }
    default:
      return zipfPick(rng, EN_SURNAMES);
  }
}

/** Random name for an origin; with `birthYear` the given name fits the person's generation. */
export function randomNameFor(
  rng: Rng,
  origin: NameOrigin,
  gender: Gender,
  birthYear?: number,
): { firstName: string; lastName: string } {
  // Mixed families: some Estonians have a Russian given name or surname, and vice versa.
  const mixed = rng.next();
  const firstOrigin = origin === 'et' && mixed < 0.03 ? 'ru' : origin;
  const surnameOrigin =
    origin === 'et' && mixed >= 0.03 && mixed < 0.06 ? 'ru' : origin === 'ru' && mixed < 0.05 ? 'et' : origin;
  const firstName = givenName(rng, firstOrigin, gender, birthYear);
  return { firstName, lastName: familyName(rng, surnameOrigin, gender) };
}

/** Random name for a speaker language ('en' → native English names). */
export function randomName(
  rng: Rng,
  lang: SpeakerLang,
  gender: Gender,
  birthYear?: number,
): { firstName: string; lastName: string } {
  return randomNameFor(rng, lang, gender, birthYear);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gendered surname forms
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Feminine form of a (masculine) Russian surname: Ivanov → Ivanova, Kovalevski → Kovalevskaja,
 * Tolstoi → Tolstaja. Indeclinable surnames (Bondarenko, Sedõh, Rabinovitš, Šapiro) stay as is.
 */
export function russianFeminine(surname: string): string {
  if (/(ski|tski|zki)$/.test(surname)) return surname.replace(/i$/, 'aja');
  if (/(skiy|skii|skij)$/.test(surname)) return surname.replace(/(iy|ii|ij)$/, 'aja');
  if (/(oi|õi)$/.test(surname)) return surname.replace(/(oi|õi)$/, 'aja');
  if (/(ov|ev|jov|ëv|in|õn|yn)$/.test(surname)) return surname + 'a';
  return surname;
}

/** Masculine form of a feminine Russian surname: Ivanova → Ivanov, Tolstaja → Tolstoi. */
export function russianMasculine(surname: string): string {
  if (/skaja$/.test(surname)) return surname.replace(/aja$/, 'i');
  if (/aja$/.test(surname)) return surname.replace(/aja$/, 'oi');
  if (/(ova|eva|jova|ina|õna|yna)$/.test(surname)) return surname.slice(0, -1);
  return surname;
}

export function russianSurnameForGender(surname: string, gender: Gender): string {
  return gender === 'F' ? russianFeminine(surname) : russianMasculine(surname);
}

/** Ukrainian surnames: only adjectival forms change (Hrabovskyi → Hrabovska, Bilyi → Bila). */
export function ukrainianSurnameForGender(surname: string, gender: Gender): string {
  if (gender === 'F') {
    if (/(yi|ii)$/.test(surname)) return surname.replace(/(yi|ii)$/, 'a');
    if (/(ov|ev|in)$/.test(surname)) return surname + 'a';
    return surname;
  }
  if (/ska$/.test(surname)) return surname.replace(/a$/, 'yi');
  return surname;
}

/** Adapt a (family) surname to a person's gender for the given origin. */
export function surnameForGender(surname: string, gender: Gender, origin: NameOrigin): string {
  if (origin === 'ru') return russianSurnameForGender(surname, gender);
  if (origin === 'uk') return ukrainianSurnameForGender(surname, gender);
  // Latvian/Lithuanian pairs are looked up for any foreign origin ('en' speakers are often Balts).
  if (origin !== 'et') {
    const row = [...LV_SURNAMES, ...LT_SURNAMES].find((r) => r[0] === surname || r[1] === surname);
    if (row) return gender === 'M' ? row[0] : row[1];
  }
  return surname;
}
