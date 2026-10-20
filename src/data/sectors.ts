/**
 * Sectors of the four prefectures (docs/SECTORS.md): the areas one desk of a prefecture's juhtimiskeskus
 * covers, after the real politseijaoskonnad and their piirkonnagrupid. Built on the region data
 * (src/data/regions/*.ts): `match` names its towns, counties and Tallinn districts, `stationIds` its stations.
 *
 * Membership rules live in src/sim/sectors.ts (sectorOf). A county split between two sectors (Harju,
 * Ida-Viru) lists the county in both and its towns in one each: a village goes with the nearest listed town.
 */
import type { SectorDef, Text } from '@/sim/types';

const T = (et: string, en: string): Text => ({ et, en });

/**
 * Residents per county (rounded, about 2024; docs/research/ppa-organisation.md). The region data lists
 * towns only, so the rest of a county (its villages) is shared among the sectors that match the county.
 */
export const COUNTY_POPULATION: Record<string, number> = {
  'Harju maakond': 625_000,
  'Tartu maakond': 160_000,
  'Ida-Viru maakond': 129_000,
  'Pärnu maakond': 86_000,
  'Lääne-Viru maakond': 59_000,
  'Viljandi maakond': 45_000,
  'Võru maakond': 35_000,
  'Rapla maakond': 33_500,
  'Saare maakond': 31_500,
  'Järva maakond': 30_000,
  'Valga maakond': 28_000,
  'Jõgeva maakond': 27_000,
  'Põlva maakond': 24_000,
  'Lääne maakond': 20_000,
  'Hiiu maakond': 9_400,
};

/** Residents per district of a town split between sectors (rounded, about 2024); scaled to the town's population. */
export const TOWN_DISTRICTS: Record<string, Record<string, number>> = {
  Tallinn: {
    Kesklinn: 67_000,
    Pirita: 19_000,
    Lasnamäe: 121_000,
    'Põhja-Tallinn': 64_000,
    Haabersti: 49_000,
    Kristiine: 34_000,
    Mustamäe: 68_000,
    Nõmme: 41_000,
  },
};

export const SECTORS: SectorDef[] = [
  // ── Põhja: Tallinn by districts, rural Harju east and west (Ida-Harju and Lääne-Harju jaoskond) ──────────
  {
    id: 'pohja-kesklinn',
    regionId: 'pohja',
    name: T('Tallinna kesklinn', 'Tallinn city centre'),
    short: 'KESKLINN',
    match: { districts: ['Kesklinn', 'Pirita'] },
    stationIds: ['pohja-hq'],
    neighbours: ['pohja-lasnamae', 'pohja-laanetallinn', 'pohja-idaharju'],
    starter: { difficulty: 'normal' },
    blurb: T(
      'Vanalinn, sadam ja ööelu: päeval turistid, kruiisilaevad ja ministeeriumid, nädalavahetuse öödel baarid ja taksojärjekorrad. Pirita poolt tulevad rand, Kloostrimetsa ja teletorni kandi vaiksed eramajad.',
      'The Old Town, the harbour and the nightlife: tourists, cruise ships and ministries by day, bars and taxi queues on weekend nights. Pirita adds the beach and the quiet houses around Kloostrimetsa and the TV tower.',
    ),
    traits: [T('Vanalinn', 'Old Town'), T('Ööelu', 'Nightlife'), T('Sadam', 'Harbour'), T('Turistid', 'Tourists'), T('Saatkonnad', 'Embassies')],
    colleague: { firstName: 'Kadri', lastName: 'Lepik', gender: 'F' },
  },
  {
    id: 'pohja-lasnamae',
    regionId: 'pohja',
    name: T('Lasnamäe', 'Lasnamäe'),
    short: 'LASNAMÄE',
    match: { districts: ['Lasnamäe'] },
    stationIds: ['pohja-idaharju'],
    neighbours: ['pohja-kesklinn', 'pohja-idaharju'],
    starter: { difficulty: 'hard' },
    blurb: T(
      'Tallinna suurim linnaosa: paneelmajad Laagna tee kanali ääres ja Peterburi tee tööstusalad. Üle poole elanikest räägib vene keelt, õhtud toovad korteritülid ja lähisuhtevägivalla, ööd poeröövid ja kaklused.',
      "Tallinn's largest district: panel blocks along the Laagna road canyon and the industrial estates of Peterburi tee. More than half the residents speak Russian; evenings bring flat rows and domestic violence, nights shop robberies and fights.",
    ),
    traits: [T('Paneelmajad', 'Panel blocks'), T('Venekeelsed helistajad', 'Russian-speaking callers'), T('Lähisuhtevägivald', 'Domestic violence'), T('Tööstusalad', 'Industrial estates')],
    colleague: { firstName: 'Jelena', lastName: 'Smirnova', gender: 'F' },
  },
  {
    id: 'pohja-laanetallinn',
    regionId: 'pohja',
    name: T('Lääne-Tallinn', 'West Tallinn'),
    short: 'LÄÄNE-TALLINN',
    match: { districts: ['Põhja-Tallinn', 'Haabersti', 'Kristiine', 'Mustamäe', 'Nõmme'] },
    stationIds: ['pohja-laaneharju', 'pohja-pohjatallinn'],
    posts: [{ stationId: 'pohja-pohjatallinn', price: 18_000, upkeep: 850 }],
    neighbours: ['pohja-kesklinn', 'pohja-laaneharju'],
    blurb: T(
      'Viis linnaosa ja kolmandik linnast: Kalamaja puumajad ja Kopli sadamaala, Mustamäe ja Õismäe paneelmajad, Tehnikaülikool, Nõmme männid ja villad. Ühest servast teise on pikk sõit.',
      "Five districts and a third of the city: Kalamaja's wooden houses and the Kopli harbour area, the Mustamäe and Õismäe blocks, the Technical University, Nõmme's pines and villas. A long drive from one edge to the other.",
    ),
    traits: [T('Kalamaja', 'Kalamaja'), T('Kopli', 'Kopli'), T('Mustamäe', 'Mustamäe'), T('Nõmme', 'Nõmme'), T('Rocca al Mare', 'Rocca al Mare')],
    colleague: { firstName: 'Andrus', lastName: 'Kask', gender: 'M' },
  },
  {
    id: 'pohja-idaharju',
    regionId: 'pohja',
    name: T('Ida-Harju', 'East Harju'),
    short: 'IDA-HARJU',
    match: {
      towns: ['Maardu', 'Haabneeme', 'Viimsi', 'Peetri', 'Jüri', 'Loo', 'Lagedi', 'Assaku', 'Vaida', 'Kostivere', 'Aruküla', 'Raasiku', 'Kose', 'Kehra', 'Aegviidu', 'Kuusalu', 'Kolga', 'Loksa'],
      counties: ['Harju maakond'],
    },
    stationIds: ['pohja-idaharju', 'pohja-kose'],
    posts: [{ stationId: 'pohja-kose', price: 12_000, upkeep: 600 }],
    neighbours: ['pohja-kesklinn', 'pohja-lasnamae', 'pohja-laaneharju'],
    blurb: T(
      'Tallinna idapoolne ümbrus: Maardu sadam ja tööstus, Viimsi ja Rae uusarendused, Jüri ja Tallinna-Tartu maantee. Kaugemal Kose, Kehra ning Lahemaa piiril Loksa, kuhu on Lasnamäelt pool tundi sõitu.',
      'The eastern ring around Tallinn: Maardu harbour and industry, the new suburbs of Viimsi and Rae, Jüri and the Tallinn-Tartu road. Further out Kose, Kehra and Loksa on the edge of Lahemaa, half an hour from Lasnamäe.',
    ),
    traits: [T('Uusarendused', 'New suburbs'), T('Maardu', 'Maardu'), T('Tallinna ringtee', 'Tallinn ring road'), T('Pikad sõidud', 'Long drives')],
    colleague: { firstName: 'Margus', lastName: 'Org', gender: 'M' },
  },
  {
    id: 'pohja-laaneharju',
    regionId: 'pohja',
    name: T('Lääne-Harju', 'West Harju'),
    short: 'LÄÄNE-HARJU',
    match: {
      towns: ['Keila', 'Saue', 'Laagri', 'Saku', 'Kangru', 'Kiisa', 'Kiili', 'Luige', 'Tabasalu', 'Harku', 'Keila-Joa', 'Klooga', 'Paldiski', 'Vasalemma', 'Ämari', 'Riisipere', 'Turba'],
      counties: ['Harju maakond'],
    },
    stationIds: ['pohja-laaneharju', 'pohja-saku'],
    posts: [{ stationId: 'pohja-saku', price: 12_000, upkeep: 600 }],
    neighbours: ['pohja-laanetallinn', 'pohja-idaharju'],
    blurb: T(
      'Tallinnast läände ja lõunasse: Keila, Saue, Laagri ja Saku magalad, Harku ja Tabasalu uued eramurajoonid, Paldiski sadam ja Pakri poolsaar. Suvel Keila-Joa ja Klooga rannad.',
      'West and south of Tallinn: the commuter towns of Keila, Saue, Laagri and Saku, the new housing of Harku and Tabasalu, Paldiski port and the Pakri peninsula. In summer the beaches of Keila-Joa and Klooga.',
    ),
    traits: [T('Magalad', 'Commuter towns'), T('Paldiski sadam', 'Paldiski port'), T('Rannad', 'Beaches'), T('Pikad sõidud', 'Long drives')],
    colleague: { firstName: 'Triin', lastName: 'Kallas', gender: 'F' },
  },

  // ── Ida: Narva, the oil-shale towns, Lääne-Virumaa (Narva, Jõhvi and Rakvere jaoskond) ──────────────────
  {
    id: 'ida-narva',
    regionId: 'ida',
    name: T('Narva', 'Narva'),
    short: 'NARVA',
    match: { towns: ['Narva', 'Narva-Jõesuu', 'Olgina', 'Sinimäe'], counties: ['Ida-Viru maakond'] },
    stationIds: ['ida-narva', 'ida-narvajoesuu', 'ida-narva-pp', 'ida-narva-kordon'],
    posts: [{ stationId: 'ida-narvajoesuu', price: 10_000, upkeep: 500 }],
    neighbours: ['ida-johvi'],
    starter: { difficulty: 'hard' },
    blurb: T(
      'Piirilinn Narva jõe ääres, Hermanni linnus vastamisi Ivangorodiga. Peaaegu kõik helistajad räägivad vene keelt, piiripunkt toob järjekorrad ja salakauba, suvel täituvad Narva-Jõesuu rand ja spaad.',
      'A border city on the Narva river, Hermann castle facing Ivangorod. Nearly every caller speaks Russian, the crossing brings queues and smuggling, and in summer the beach and spas of Narva-Jõesuu fill up.',
    ),
    traits: [T('Piiripunkt', 'Border crossing'), T('Venekeelne linn', 'Russian-speaking city'), T('Narva jõgi', 'Narva river'), T('Salakaup', 'Smuggling'), T('Narva-Jõesuu rand', 'Narva-Jõesuu beach')],
    colleague: { firstName: 'Dmitri', lastName: 'Kuznetsov', gender: 'M' },
  },
  {
    id: 'ida-johvi',
    regionId: 'ida',
    name: T('Jõhvi ja Kohtla-Järve', 'Jõhvi and Kohtla-Järve'),
    short: 'JÕHVI',
    match: {
      towns: ['Jõhvi', 'Kohtla-Järve', 'Sillamäe', 'Kiviõli', 'Tammiku', 'Püssi', 'Kohtla-Nõmme', 'Toila', 'Voka', 'Mäetaguse', 'Iisaku', 'Lüganuse', 'Sonda'],
      counties: ['Ida-Viru maakond'],
    },
    stationIds: ['ida-hq', 'ida-kohtlajarve', 'ida-sillamae', 'ida-kivioli', 'ida-vasknarva'],
    posts: [
      { stationId: 'ida-kohtlajarve', price: 15_000, upkeep: 700 },
      { stationId: 'ida-sillamae', price: 13_000, upkeep: 650 },
      { stationId: 'ida-kivioli', price: 9_000, upkeep: 450 },
    ],
    neighbours: ['ida-narva', 'ida-laaneviru'],
    blurb: T(
      'Põlevkivimaa: Kohtla-Järve keemiatehased ja kaevandused, maakonnakeskus Jõhvi, Sillamäe ja Kiviõli. Lõuna pool Alutaguse metsad ja Peipsi põhjarannik Kauksi rannaga. Enamik helistajaid räägib vene keelt.',
      'Oil-shale country: the chemical plants and mines of Kohtla-Järve, the county seat Jõhvi, Sillamäe and Kiviõli. To the south the Alutaguse forests and the north shore of Lake Peipus with Kauksi beach. Most callers speak Russian.',
    ),
    traits: [T('Põlevkivi', 'Oil shale'), T('Tööstus', 'Industry'), T('Venekeelsed helistajad', 'Russian-speaking callers'), T('Alutaguse metsad', 'Alutaguse forests'), T('Peipsi põhjarannik', 'North shore of Peipus')],
    colleague: { firstName: 'Natalja', lastName: 'Volkova', gender: 'F' },
  },
  {
    id: 'ida-laaneviru',
    regionId: 'ida',
    name: T('Lääne-Virumaa', 'Lääne-Viru County'),
    short: 'LÄÄNE-VIRUMAA',
    match: { counties: ['Lääne-Viru maakond'] },
    stationIds: ['ida-rakvere', 'ida-tapa'],
    posts: [{ stationId: 'ida-tapa', price: 11_000, upkeep: 550 }],
    neighbours: ['ida-johvi'],
    starter: { difficulty: 'easy' },
    blurb: T(
      'Rakvere linnus ja Tarvas, Lahemaa rahvuspark Palmse, Sagadi ja Käsmuga, suvel Võsu rannapeod. Tapal on suur kaitseväelinnak, Tallinna-Narva maanteel kiirustajad ja rekkad.',
      'Rakvere castle and the Tarvas aurochs, Lahemaa national park with Palmse, Sagadi and Käsmu, and the beach parties of Võsu in summer. Tapa has a large army base; the Tallinn-Narva road brings speeders and trucks.',
    ),
    traits: [T('Lahemaa', 'Lahemaa'), T('Rakvere', 'Rakvere'), T('Tapa linnak', 'Tapa army base'), T('Tallinna-Narva maantee', 'Tallinn-Narva road'), T('Suvitajad', 'Summer visitors')],
    colleague: { firstName: 'Tarmo', lastName: 'Sepp', gender: 'M' },
  },

  // ── Lõuna: Tartu city and county, one sector per county elsewhere (Tartu, Kagu and Viljandi jaoskond) ─────
  {
    id: 'louna-tartu',
    regionId: 'louna',
    name: T('Tartu linn', 'Tartu city'),
    short: 'TARTU',
    match: { towns: ['Tartu'] },
    stationIds: ['lo-tartu'],
    neighbours: ['louna-tartumaa'],
    starter: { difficulty: 'normal' },
    blurb: T(
      'Ülikoolilinn Emajõe kaldal: tuhanded tudengid, Rüütli tänava baarid ja aprilli lõpus Tudengipäevad, kui Raekoja plats on rahvast täis. Annelinna paneelmajad, Raadi ja Lõunakeskus, öösiti palju avaliku korra rikkumisi.',
      'A university town on the Emajõgi: thousands of students, the bars of Rüütli street and, at the end of April, Tudengipäevad, the student days, when the Town Hall Square is packed. The Annelinn blocks, Raadi and the Lõunakeskus mall, and plenty of public-order calls at night.',
    ),
    traits: [T('Tudengid', 'Students'), T('Tudengipäevad', 'Student days'), T('Emajõgi', 'Emajõgi'), T('Ööelu', 'Nightlife'), T('Annelinn', 'Annelinn')],
    colleague: { firstName: 'Kristjan', lastName: 'Põder', gender: 'M' },
  },
  {
    id: 'louna-tartumaa',
    regionId: 'louna',
    name: T('Tartumaa ja Elva', 'Tartu County and Elva'),
    short: 'TARTUMAA',
    match: { counties: ['Tartu maakond'] },
    stationIds: ['lo-tartu', 'lo-elva'],
    posts: [{ stationId: 'lo-elva', price: 12_000, upkeep: 550 }],
    neighbours: ['louna-tartu', 'louna-jogeva', 'louna-viljandi', 'louna-polva', 'louna-valga'],
    blurb: T(
      'Tartu ümbrus ja maakond: Ülenurme ja Tõrvandi uusasumid, Elva männimetsad ja järved, Peipsi kaldal Kallaste ja Kolkja vanausuliste külad ning Piirissaar. Võrtsjärve ja Emajõe ääres kalamehed ja suvitajad.',
      'The countryside around Tartu: the new suburbs of Ülenurme and Tõrvandi, the pine woods and lakes of Elva, Kallaste and the Old Believer villages of Kolkja on Lake Peipus, and Piirissaar island. Fishermen and summer people along Võrtsjärv and the Emajõgi.',
    ),
    traits: [T('Peipsi rand', 'Peipus shore'), T('Vanausulised', 'Old Believers'), T('Elva', 'Elva'), T('Piirissaar', 'Piirissaar'), T('Uusasumid', 'New suburbs')],
    colleague: { firstName: 'Liina', lastName: 'Raudsepp', gender: 'F' },
  },
  {
    id: 'louna-jogeva',
    regionId: 'louna',
    name: T('Jõgevamaa', 'Jõgeva County'),
    short: 'JÕGEVAMAA',
    match: { counties: ['Jõgeva maakond'] },
    stationIds: ['lo-jogeva'],
    neighbours: ['louna-tartumaa', 'louna-viljandi'],
    blurb: T(
      'Väike ja vaikne maakond Tallinna-Tartu maantee ääres: Jõgeva, Põltsamaa ja Peipsi kaldal Mustvee. Pikad vahemaad, metsad ja külmad talved, Jõgeval mõõdeti Eesti külmarekord.',
      "A small, quiet county on the Tallinn-Tartu road: Jõgeva, Põltsamaa and Mustvee on Lake Peipus. Long distances, forests and cold winters; Estonia's record low was measured at Jõgeva.",
    ),
    traits: [T('Tallinna-Tartu maantee', 'Tallinn-Tartu road'), T('Peipsi rand', 'Peipus shore'), T('Pikad vahemaad', 'Long distances'), T('Külmad talved', 'Cold winters')],
    colleague: { firstName: 'Urmas', lastName: 'Kivi', gender: 'M' },
  },
  {
    id: 'louna-viljandi',
    regionId: 'louna',
    name: T('Viljandimaa', 'Viljandi County'),
    short: 'VILJANDIMAA',
    match: { counties: ['Viljandi maakond'] },
    stationIds: ['lo-viljandi'],
    neighbours: ['louna-tartumaa', 'louna-jogeva', 'louna-valga'],
    starter: { difficulty: 'easy' },
    blurb: T(
      'Mulgimaa süda: Viljandi lossimäed ja järv, juulis Viljandi Folk, kui linna tuleb kümneid tuhandeid inimesi. Ülejäänud aasta rahulik maakond, kevadel Soomaa üleujutus ehk viies aastaaeg.',
      'The heart of Mulgimaa: the castle hills and the lake of Viljandi, and in July Viljandi Folk, when tens of thousands come to town. The rest of the year a quiet county, with the Soomaa flood, the fifth season, in spring.',
    ),
    traits: [T('Viljandi Folk', 'Viljandi Folk'), T('Mulgimaa', 'Mulgimaa'), T('Soomaa', 'Soomaa'), T('Viljandi järv', 'Lake Viljandi'), T('Rahulik maa', 'Quiet countryside')],
    colleague: { firstName: 'Maarja', lastName: 'Mägi', gender: 'F' },
  },
  {
    id: 'louna-polva',
    regionId: 'louna',
    name: T('Põlvamaa', 'Põlva County'),
    short: 'PÕLVAMAA',
    match: { counties: ['Põlva maakond'] },
    stationIds: ['lo-polva', 'lo-rapina', 'lo-mehikoorma'],
    posts: [{ stationId: 'lo-rapina', price: 9_000, upkeep: 450 }],
    neighbours: ['louna-tartumaa', 'louna-voru', 'louna-valga'],
    blurb: T(
      'Põlva, Räpina ja Kanepi: metsad, järved ja Peipsi lõunakallas. Ahja jõe ürgorg ja Taevaskoja, Räpina aiad ja Mehikoorma kalasadam, Lämmijärvel piirivalve.',
      'Põlva, Räpina and Kanepi: forests, lakes and the southern shore of Lake Peipus. The Ahja valley and Taevaskoja, the gardens of Räpina and the fishing harbour of Mehikoorma, with the border guard on Lämmijärv.',
    ),
    traits: [T('Metsad', 'Forests'), T('Lämmijärv', 'Lämmijärv'), T('Taevaskoja', 'Taevaskoja'), T('Pikad vahemaad', 'Long distances')],
    colleague: { firstName: 'Ain', lastName: 'Hallik', gender: 'M' },
  },
  {
    id: 'louna-voru',
    regionId: 'louna',
    name: T('Võrumaa', 'Võru County'),
    short: 'VÕRUMAA',
    match: { counties: ['Võru maakond'] },
    stationIds: ['lo-voru', 'lo-koidula', 'lo-luhamaa', 'lo-varska'],
    neighbours: ['louna-polva', 'louna-valga'],
    blurb: T(
      'Kagu-Eesti kõrgustik: Haanja ja Suur Munamägi, Rõuge järved, Setomaa ning Luhamaa ja Koidula piiripunktid. Võru keel, suitsusaunad ja talvel paks lumi.',
      'The south-eastern uplands: Haanja and Suur Munamägi, the lakes of Rõuge, Setomaa and the Luhamaa and Koidula border crossings. The Võro language, smoke saunas and deep snow in winter.',
    ),
    traits: [T('Piiripunktid', 'Border crossings'), T('Setomaa', 'Setomaa'), T('Haanja', 'Haanja'), T('Võru keel', 'Võro language'), T('Paks lumi', 'Deep snow')],
    colleague: { firstName: 'Helen', lastName: 'Kõiv', gender: 'F' },
  },
  {
    id: 'louna-valga',
    regionId: 'louna',
    name: T('Valgamaa', 'Valga County'),
    short: 'VALGAMAA',
    match: { counties: ['Valga maakond'] },
    stationIds: ['lo-valga', 'lo-otepaa'],
    posts: [{ stationId: 'lo-otepaa', price: 10_000, upkeep: 500 }],
    neighbours: ['louna-tartumaa', 'louna-viljandi', 'louna-polva', 'louna-voru'],
    blurb: T(
      'Valga ja Läti Valka: üks linn kahes riigis, piiri ületatakse jalgsi. Otepää on talvepealinn Tehvandi ja Pühajärvega, Tõrva ja Helme on vaiksed.',
      'Valga and Latvian Valka: one town in two countries, crossed on foot. Otepää is the winter capital with Tehvandi and Pühajärv; Tõrva and Helme stay quiet.',
    ),
    traits: [T('Läti piir', 'Latvian border'), T('Otepää', 'Otepää'), T('Talisport', 'Winter sports'), T('Pühajärv', 'Pühajärv')],
    colleague: { firstName: 'Rando', lastName: 'Ilves', gender: 'M' },
  },

  // ── Lääne: Pärnu city and county, the islands, Läänemaa, Rapla and Järva (five jaoskonnad) ─────────────
  {
    id: 'laane-parnu',
    regionId: 'laane',
    name: T('Pärnu', 'Pärnu'),
    short: 'PÄRNU',
    match: { towns: ['Pärnu'] },
    stationIds: ['la-parnu', 'la-parnu-sadam'],
    neighbours: ['laane-parnumaa'],
    starter: { difficulty: 'normal' },
    blurb: T(
      'Suvepealinn: rand ja Rannapark, Rüütli tänav ja suvised festivalid, kui linnas on mitu korda rohkem rahvast. Talvel vaikne kuurortlinn oma sadama ja Pärnu jõe sildadega.',
      'The summer capital: the beach and Rannapark, Rüütli street and the summer festivals, when the town fills several times over. In winter a quiet resort with its harbour and the bridges over the Pärnu river.',
    ),
    traits: [T('Suvepealinn', 'Summer capital'), T('Rand', 'Beach'), T('Ööelu', 'Nightlife'), T('Festivalid', 'Festivals'), T('Sadam', 'Harbour')],
    colleague: { firstName: 'Kertu', lastName: 'Pärn', gender: 'F' },
  },
  {
    id: 'laane-parnumaa',
    regionId: 'laane',
    name: T('Pärnumaa', 'Pärnu County'),
    short: 'PÄRNUMAA',
    match: { counties: ['Pärnu maakond'] },
    stationIds: ['la-parnu', 'la-parnu-sadam'],
    neighbours: ['laane-parnu', 'laane-laanemaa', 'laane-saaremaa', 'laane-rapla', 'laane-jarva'],
    blurb: T(
      'Pärnu ümbrus ja suur maakond: Sindi, Vändra ja Kilingi-Nõmme, Häädemeeste rannakülad Läti piirini, Lihula ja Virtsu praamisadam. Kihnu elab oma elu, Soomaa rabadesse on pikk tee.',
      'Around Pärnu and a big county: Sindi, Vändra and Kilingi-Nõmme, the coastal villages of Häädemeeste down to the Latvian border, Lihula and the Virtsu ferry port. Kihnu lives its own life; the Soomaa bogs are a long drive away.',
    ),
    traits: [T('Via Baltica', 'Via Baltica'), T('Kihnu', 'Kihnu'), T('Rannakülad', 'Coastal villages'), T('Pikad vahemaad', 'Long distances'), T('Läti piir', 'Latvian border')],
    colleague: { firstName: 'Indrek', lastName: 'Lill', gender: 'M' },
  },
  {
    id: 'laane-laanemaa',
    regionId: 'laane',
    name: T('Läänemaa', 'Lääne County'),
    short: 'LÄÄNEMAA',
    match: { counties: ['Lääne maakond'] },
    stationIds: ['la-haapsalu'],
    neighbours: ['laane-parnumaa', 'laane-hiiumaa', 'laane-rapla'],
    blurb: T(
      'Haapsalu piiskopilinnus ja Valge Daam, Rohukülast praamid Hiiumaale ja Vormsile, Matsalu linnud ja Noarootsi rannad. Suvel suvitajad, talvel tühjad külad.',
      "Haapsalu's bishop's castle and the White Lady, ferries from Rohuküla to Hiiumaa and Vormsi, the birds of Matsalu and the beaches of Noarootsi. Summer visitors in summer, empty villages in winter.",
    ),
    traits: [T('Haapsalu', 'Haapsalu'), T('Praamid', 'Ferries'), T('Vormsi', 'Vormsi'), T('Matsalu', 'Matsalu'), T('Suvitajad', 'Summer visitors')],
    colleague: { firstName: 'Reet', lastName: 'Vaher', gender: 'F' },
  },
  {
    id: 'laane-saaremaa',
    regionId: 'laane',
    name: T('Saaremaa', 'Saaremaa'),
    short: 'SAAREMAA',
    match: { counties: ['Saare maakond'] },
    stationIds: ['la-kuressaare', 'la-roomassaare'],
    neighbours: ['laane-parnumaa', 'laane-hiiumaa'],
    starter: { difficulty: 'easy' },
    blurb: T(
      'Eesti suurim saar: Kuressaare piiskopilinnus ja spaad, Virtsu-Kuivastu praam ja külmal talvel jäätee üle Suure väina. Ruhnu on kaugel merel, sinna jõuab ainult lennuki või paadiga.',
      "Estonia's largest island: Kuressaare castle and spas, the Virtsu-Kuivastu ferry and, in a cold winter, the ice road across the Suur väin strait. Ruhnu lies far out at sea and is reached only by plane or boat.",
    ),
    traits: [T('Praamid', 'Ferries'), T('Jäätee', 'Ice road'), T('Kuressaare', 'Kuressaare'), T('Ruhnu', 'Ruhnu'), T('Suvitajad', 'Summer visitors')],
    colleague: { firstName: 'Jaanus', lastName: 'Kuusk', gender: 'M' },
  },
  {
    id: 'laane-hiiumaa',
    regionId: 'laane',
    name: T('Hiiumaa', 'Hiiumaa'),
    short: 'HIIUMAA',
    match: { counties: ['Hiiu maakond'] },
    stationIds: ['la-kardla', 'la-kardla-sadam'],
    neighbours: ['laane-laanemaa', 'laane-saaremaa'],
    blurb: T(
      'Vaikne saar: Kärdla, Käina ja Kõpu tuletorn, Rohuküla-Heltermaa praam ja talvel jäätee. Kõik on kaugel ja abijõud tuleb üle mere.',
      'A quiet island: Kärdla, Käina and the Kõpu lighthouse, the Rohuküla-Heltermaa ferry and an ice road in winter. Everything is far, and reinforcements come across the sea.',
    ),
    traits: [T('Praamid', 'Ferries'), T('Jäätee', 'Ice road'), T('Kõpu tuletorn', 'Kõpu lighthouse'), T('Vaikne saar', 'Quiet island')],
    colleague: { firstName: 'Ülle', lastName: 'Kaasik', gender: 'F' },
  },
  {
    id: 'laane-rapla',
    regionId: 'laane',
    name: T('Raplamaa', 'Rapla County'),
    short: 'RAPLAMAA',
    match: { counties: ['Rapla maakond'] },
    stationIds: ['la-rapla'],
    neighbours: ['laane-parnumaa', 'laane-laanemaa', 'laane-jarva'],
    blurb: T(
      'Tallinna lõunanaaber: Rapla, Kohila ja Märjamaa, Tallinna-Pärnu maanteel tihe liiklus ja kiirustajad. Pendelrändajad, mõisad ja metsased külad.',
      "Tallinn's southern neighbour: Rapla, Kohila and Märjamaa, with heavy traffic and speeders on the Tallinn-Pärnu road. Commuters, manor houses and wooded villages.",
    ),
    traits: [T('Tallinna-Pärnu maantee', 'Tallinn-Pärnu road'), T('Pendelrändajad', 'Commuters'), T('Mõisad', 'Manor houses'), T('Metsad', 'Forests')],
    colleague: { firstName: 'Siim', lastName: 'Teder', gender: 'M' },
  },
  {
    id: 'laane-jarva',
    regionId: 'laane',
    name: T('Järvamaa', 'Järva County'),
    short: 'JÄRVAMAA',
    match: { counties: ['Järva maakond'] },
    stationIds: ['la-paide'],
    neighbours: ['laane-parnumaa', 'laane-rapla'],
    blurb: T(
      'Eesti süda: Paide Vallimägi ja Arvamusfestival, Türi lillelaat ja Mäo ristmik, kus Tallinna-Tartu maantee kohtub Pärnu teega. Põllud, farmid ja vaiksed ööd.',
      "The heart of Estonia: Paide's castle hill and the Opinion Festival, the Türi flower fair and the Mäo junction, where the Tallinn-Tartu road meets the road to Pärnu. Fields, farms and quiet nights.",
    ),
    traits: [T('Eesti süda', 'Heart of Estonia'), T('Mäo ristmik', 'Mäo junction'), T('Arvamusfestival', 'Opinion Festival'), T('Põllumajandus', 'Farming')],
    colleague: { firstName: 'Kaire', lastName: 'Aavik', gender: 'F' },
  },
];

/**
 * The AI colleagues at the neighbouring desks on a sector shift (src/sim/colleagues.ts, docs/SECTORS.md).
 * Rates are per game hour of a Poisson process on the shift's own colleague stream; none of it runs in the
 * daily challenge, the tutorial, the director or on a shift that covers the whole prefecture.
 */
export const COLLEAGUES = {
  /** Help requests (a call just across the border, tag help:<sectorId>) per game hour. */
  helpPerHour: 0.18,
  /** No help request in the first minutes of the shift, nor in its last ones. */
  helpQuietStartMin: 30,
  helpQuietEndMin: 30,
  /** At most this many help requests a shift, and one open at a time. */
  helpMax: 3,
  /**
   * A call for help lies in the colleague's sector but at most this far (km, straight line) from the player's
   * nearest crew or station; when no address is that close the colleague does not ask.
   */
  helpMaxKm: 13,
  /** The colleague takes the call back after this long when nobody is sent (game minutes). */
  helpTimeoutMin: 14,
  /** Template priorities a colleague asks help with (no P1: that goes to everyone on the radio). */
  helpPriorities: [2, 3] as number[],
  /** A pursuit that leaves the area: how long the colleague's hand-over offer waits for an answer (min). */
  handoverOfferMin: 2,
  /** Short lines on the radio from the neighbouring desks per game hour, at least `chatterGapMin` apart. */
  chatterPerHour: 0.3,
  chatterGapMin: 40,
  chatterMax: 4,
  /** Chance that a career night shift covers a small neighbouring sector too (öine katmine). */
  nightCoverChance: 0.35,
  /** Only a neighbour with at most this share of the prefecture's residents is covered at night. */
  nightCoverMaxShare: 0.2,
};
