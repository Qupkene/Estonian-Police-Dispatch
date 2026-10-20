# Muudatuste logi / Changelog

Kõik olulised muudatused on kirjas siin. Each version has a short English summary below it.

## 2.22.0 (2026-10-20)

- **Mängu tutvustavad lehed:** uued lehed politsei.eu/politseimang, /juhend, /mitmikmang ja ingliskeelne /en. Neil on kirjas, mis mäng see on, kuidas mängida, kuidas sõpradega koos mängida ja vastused levinud küsimustele.
- **Otsingumootorid:** avalehe pealkiri ja kirjeldus on nüüd otsingusõnade „politsei mäng“ ja „politseimäng“ järgi. Juurde tulid struktureeritud andmed (mitmikmäng, KKK, leivapururada), keelevariandid ja uued lehed saidikaardis.
- Mängu menüü jaluses on lingid lehtedele „Mängust“, „Juhend“ ja „English“.
- **Uued pildid:** mängu ekraanipildid on tehtud uuesti praeguse kujundusega, nüüd ka telefonivaated. Tutvustavatel lehtedel näeb telefonis telefoni pilte ja lehe päis mahub ekraanile. Telefoni pildid on ka rakenduse paigaldusaknas.

<details>
<summary>English</summary>

New pages about the game: /politseimang, /juhend (how to play), /mitmikmang (multiplayer) and /en (English), with real content and FAQs. The home page title and description target "politsei mäng" and "politseimäng"; structured data adds multiplayer, FAQ and breadcrumbs, with hreflang alternates and the new pages in the sitemap. The menu footer links to the About, Guide and English pages. New screenshots of the current design, including phone views; the pages show the phone screenshots on phones with a tidier mobile header, and the manifest gains narrow screenshots for the install dialog.

</details>

## 2.21.1 (2026-10-20)

- Eesti lipu kilp on nüüd sakiikoon ka 404 lehel ning 2024. ja 2025. aasta algversioonides, mitte ainult mängus.

<details>
<summary>English</summary>

The Estonian flag shield is now the tab icon on the 404 page and the 2024 and 2025 original versions too, not only in the game.

</details>

## 2.21.0 (2026-10-20)

- **Mitmikmäng jookseb serveris:** ühine vahetus (rollid ja sektorid) ei käi enam igaühe brauseris, vaid politsei.eu mänguserveris. Brauser saadab käsu kohe ja näeb tulemust umbes kümnendiku sekundiga, enne kulus selleks 2 kuni 3 sekundit.
- Kõik mängijad näevad täpselt sama seisu, sest vahetust arvutab ainult server. Aruanne tehakse serveri lõppseisust.
- Kui ühendus katkeb, ühendub mäng ise uuesti ja jätkab sealt, kus vahetus parasjagu on. Serveri uuendus vahetust ei katkesta, toad salvestuvad ja jätkuvad.
- Võistlus jääb nagu oli: igaüks mängib oma vahetust ise ja seal ei pea midagi ootama.

<details>
<summary>English</summary>

Co-op shifts (roles and sectors) now run on the politsei.eu game server instead of in every browser: a click takes effect in about a tenth of a second instead of two to three. Everyone sees the same state because only the server simulates, and the report is built from the server's final state. A dropped connection reconnects and continues; a server update saves and resumes the rooms. Race mode is unchanged (each player runs their own copy locally). When the game server is not available, rooms fall back to the previous lockstep.

</details>

## 2.20.0 (2026-10-20)

- **Mitmikmäng, sektorid:** ruumi looja valib prefektuuri ja 2 kuni 4 naabersektorit ning iga mängija võtab oma laua. Igal laual on oma 112 liin, oma väljakutsed ja oma ekipaažid. Naabrite sündmused ja üksused on kaardil tuhmilt näha.
- **Ekipaaži laenamine:** küsi naabrilt vaba ekipaaži või paku oma, naaber annab või keeldub. Naabri väljakutsel aitamine läheb sinu arvele ja üle piiri läinud jälituse saab naabrile üle anda.
- Tühja lauda või lahkunud mängija lauda hoiab AI kolleeg. Aruandes on laudade tabel, mis on kõigil sama, ja koostöö kogemuspunktid lähevad iga mängija karjääri üks kord.

<details>
<summary>English</summary>

Multiplayer sector co-op: the host picks a prefecture and 2 to 4 neighbouring sectors, each player runs one desk with its own 112 line, calls and crews, neighbours shown dimmed. Lend or borrow free crews across a border, help a neighbour's call, hand over pursuits. An AI colleague runs empty or abandoned desks. The report shows a per-desk table identical for everyone; co-op XP once per career.

</details>

## 2.19.0 (2026-10-20)

- **Mitmikmäng, rollid:** kaks kuni neli mängijat töötavad ühes ja samas vahetuses. Üks on 112 kõnede vastuvõtja, teine saadab üksusi; kolmas võtab raadio ja registrid, neljas on teine dispetšer. Kõik näevad sama kaarti, aga igaühel on oma laua nupud. Mängu sees on meeskonna paneel ja lühisõnumid.
- Aruandes on tabel „Meeskonna töö“ ja kõigil on sama tulemus. Koostöö kogemuspunktid lähevad iga mängija karjääri üks kord.
- Ruumi looja juhib kiirust ja pausi. Kui keegi lahkub või ühendus katkeb, võtab tema laua üle teine mängija ja tagasi tulles jätkab ta sealt, kus vahetus parasjagu on.

<details>
<summary>English</summary>

Multiplayer role co-op: two to four players share one shift as call-taker, dispatcher, radio and registry, and a second dispatcher; same map, each desk with its own controls, an in-game team panel with short messages. The report adds a team table identical for everyone, and co-op XP goes into each player's career once. The host controls speed and pause; a player who drops is covered by another desk and rejoins mid-shift.

</details>

## 2.18.0 (2026-10-20)

- **Karjäär peatükkides:** viis peatükki (Esimene laud, Naabrid, Vahetuse vanem, Prefektuur, Keskuse juht), mis algavad päris karjääri verstapostidest. Igal peatükil on sissejuhatus, lõpp, neli eesmärki (kolmest piisab) ja väike tasu.
- **Tegelased:** prefekt, sinu vahetuse vanem, naaberlaua kolleeg, ametiühingu esindaja ja ajakirjanik räägivad teadetes, päevakäsus ja ajalehes. Igas peatükis on üks küsimus, mille vastusel on väike mõju.
- Karjääri lehel on peatüki paneel ja peamenüüs üks rida. Vanad karjäärid jätkuvad peatükist, mis nende seisuga sobib, ja salvestused jäävad alles.

<details>
<summary>English</summary>

The career now unfolds in five chapters tied to real milestones, each with an intro, an outro, four objectives (any three) and a small reward. A recurring cast (prefect, shift supervisor mentor, a neighbouring colleague, a union rep and a reporter) speaks through the notices, the briefing and the newspaper, with one choice per chapter. Old careers continue from the matching chapter; saves are kept.

</details>

## 2.17.0 (2026-10-20)

- **AI kolleegid töötavad päriselt:** karjääri sektorivahetuses palub naaberlaua kolleeg aeg-ajalt abi väljakutsega otse piiri tagant, sinu meeskondade lähedal. Kui saadad üksuse, kasvab Staatus; kui ei saada, võtab kolleeg selle tagasi ilma karistuseta.
- **Jälituse üleandmine:** kui jälitus läheb sinu alast välja, pakub naaberlaud selle üle võtta. Anna üle või jätka ise.
- **Öine katmine:** mõnel ööl on naabri kolleeg vaba ja sina katad ka tema väikest sektorit. Päevakäsk ütleb selle ette.
- **Naaberlaudade raadio:** aeg-ajalt kostab raadiost naaberlaudade lühikesi jutte.
- Päeva väljakutset ja vanu salvestusi see ei muuda.

<details>
<summary>English</summary>

AI colleagues now act in sector career shifts: neighbouring desks ask for help with calls just across the border near your crews (Staatus bonus when helped, no penalty otherwise), offer to take over pursuits leaving your area, hand you a small sector to cover on some nights, and chat briefly on the radio. Daily challenge and old saves are unchanged.

</details>

## 2.16.0 (2026-10-20)

- **Mitmikmäng, võistlus:** peamenüüs on uus rida „Mitmikmäng“. Loo ruum ja jaga 6-tähelist koodi, kuni neli sõpra liituvad. Ruumi looja valib prefektuuri, ala, raskuse, pikkuse ja kellaaja ning alustab, kui kõik on valmis. Kõik mängivad täpselt sama vahetust ja aruandes on ruumi tulemuste tabel, mis uueneb ise. Mängimiseks on vaja kontot.
- Koostöö variandid (sektorid ja rollid) tulevad järgmistes versioonides, plaan on kirjas docs/MULTIPLAYER.md failis.

<details>
<summary>English</summary>

Multiplayer, race mode: create a room, share its 6-character code, up to four players join; the host picks prefecture, area, difficulty, length and time of day; everyone plays the identical shift and the report shows the room's live results board. Requires an account. Co-op modes follow; the plan is in docs/MULTIPLAYER.md.

</details>

## 2.15.0 (2026-10-20)

- **Mänguekraan Valvekaardi värvides:** vahetuse ajal on samad pinnad, jooned, tekstid, sinine aktsent ja fondid nagu menüüdes, tumedas ja heledas teemas. Paigutus ja tihedus on täpselt samad. Helendused, üleminekud ja hägustused on eemaldatud, nii et ekraan on rahulikum ja kiirem. Prioriteetide ja üksuste olekute värvid jäävad samade tähendustega, mõne punase ja oranži märgi kontrast on parem.
- **Sisselogimise aken** on paremal poolel keskel, mitte ääres. PPA logoga päis on alati nähtav ja e-ID valikud on ühtlase rea kujul.

<details>
<summary>English</summary>

The in-game screen now uses the Valvekaart colours, fonts and flat surfaces of the menus (dark and light) with the exact same layout and density; glows, gradients and blurs are gone; status and priority colours keep their meaning with better contrast on a few red and amber badges. The login panel sits in the middle of the right half with an always-visible PPA header and an even e-ID tab row.

</details>

## 2.14.0 (2026-10-20)

- **Politsei- ja Piirivalveameti logo ameti loal:** PPA logo on igal ekraanil ülemisel ribal esimesena, laadimisel, sisselogimisel, mängu ülemisel ribal ning päevakäsu ja aruande päises nagu päris dokumendil.
- **E-identiteedi logod omanike loal:** ID-kaart, Mobiil-ID ja Smart-ID sisselogimisel ning DigiDoci „Allkirjastatud digitaalselt“ tempel päevakäsul ja aruandel.
- **Klassikaline sisselogimine** on jälle täisekraanil sinisena nagu 2024. aastal, PPA logoga. Tavalise sisselogimise aken on paremal ja kaart vasakul.
- Uus brauseri- ja äpiikoon (Eesti lipuga kilp). Jalusesse lisati, et mäng on tasuta ega ole PPA toode, ning kontakt info@politsei.eu, mis on ka tiitrites küsimuste ja soovide jaoks.

<details>
<summary>English</summary>

The PPA logo, used with the agency's permission, now heads every screen, the login, the in-game top bar and the briefing and report letterheads. ID-kaart, Mobiil-ID and Smart-ID logos on the login and a DigiDoc "digitally signed" stamp, with their owners' permission. The classic login is a full blue screen again with the PPA logo; the regular login panel moved right. New favicon and app icon, footer note that the game is free and not a PPA product, contact info@politsei.eu.

</details>

## 2.13.0 (2026-10-19)

- **Kõik menüüd Valvekaardis:** laadimisekraan, sisselogimine, vahetuse eelinfo, aruanne, seaded, tiitrid, algsed versioonid ja päeva edetabel on nüüd sama kujundusega nagu peamenüü ja karjäär. Tumedas, heledas ja telefonis.
- Sisselogimisel on kaardi taustal lihtne paneel ilma radari, helendava logo ja reklaamita. ID-kaardi sisselogimisel on kolm sammu, 2024. aasta Klassika jääb alles.
- Eelinfo kaardil on sinu ala ja tänane katmine, ekipaažid on tabelis, päevakäsk jääb paberina. Aruandes on helendava ringi asemel tihe numbririba ja tabelid, ajaleht jääb.
- **Kiirem:** taustakaart joonistatakse ühe korra pildiks, nii et vahetuse alustamine ja jätkamine on ka graafikakiirenduseta arvutis kiire.

<details>
<summary>English</summary>

Every remaining out-of-game screen now uses the Valvekaart design: boot, sign-in, briefing, report, settings, credits, original versions and the daily board, in dark, light and phone layouts. No radar, glow or marketing on sign-in; the briefing shows your area on the duty map; the report uses a figure strip and tables, and keeps the newspaper.

</details>

## 2.12.0 (2026-10-19)

- **Uus karjääri leht (Valvekaart):** üleval on näitajate riba (eelarve, kuukulud, Staatus, auaste, palgapäev, viimane vahetus) ja nupp vahetuse alustamiseks. Keskel on sinu prefektuuri kaart, kus on näha sinu sektor, prefekti pakkumine ja kolleegide sektorid. Vasakul on vastutusala tabel ja paremal prefekti pakkumine.
- Allpool on järgmise vahetuse ekipaažid, viimaste vahetuste hinded, autopark, teated, järgmine auaste, politseipunktid ja kõik haldusvahekaardid (personal, värbamine, autopark, uuendused, eelarve, ajalugu). Uue karjääri alustamine, hele teema ja telefonivaade on samas stiilis.

<details>
<summary>English</summary>

New career page in the Valvekaart style: a figure strip and the start button, a duty map of your prefecture with your sector, the offer and colleagues, the area table and the prefect's offer, then crews, recent grades, fleet, notices, next rank, posts and every management tab. Onboarding, light theme and phone layout restyled too.

</details>

## 2.11.1 (2026-10-19)

- **Kinnipeetu viiakse lähimasse jaoskonda:** kui arestimaja (Lõunas Tartu vangla) on sündmuskohast üle 30 km kaugusel, viib ekipaaž kinnipeetu lähimasse politseijaoskonda menetlusse, näiteks Viljandist Viljandi jaoskonda. Edasine konvoi vanglasse toimub hiljem ega koorma sinu ekipaaže.

<details>
<summary>English</summary>

Detainees go to the nearest police station for processing when the arrest house is more than 30 km away (Viljandi stays in Viljandi instead of driving to Tartu prison); the later escort is off-screen.

</details>

## 2.11.0 (2026-10-19)

- **Uus peamenüü (Valvekaart):** kogu ekraan on Eesti valvekaart, kus on näha sinu sektor, prefekti pakkumine ja päeva väljakutse koht. Kaardi peal on menüü, teated, päeva väljakutse, karjääri ülevaade koos viimaste vahetuste hinnetega ja edetabel. Ülemisel ribal on kuupäev, kell ja konto ning all versioon ja klahvivihjed.
- Uued fondid (Archivo, Instrument Sans), tume ja hele teema, telefonis oma paigutus. Klaasikumad, helendused ja reklaamtekstid on menüüst eemaldatud.

<details>
<summary>English</summary>

New main menu (Valvekaart): the whole screen is a duty map of Estonia with your sector, the prefect's offer and the daily challenge marked, with flat panels for the menu, notices, the daily challenge, a career summary and the leaderboard. New fonts, dark and light themes, a phone layout; the glass, glow and marketing copy are gone.

</details>

## 2.10.0 (2026-10-19)

- **Päeva väljakutse:** iga päev üks vahetus, mis on kõigile sama: sama sektor, kellaaeg, ilm ja samad kõned samal ajal, mida iganes sa teed. Kolm mängutundi, tavaline raskus. Uus väljakutse tuleb Eesti aja järgi keskööl ja sektorid vahelduvad.
- **Päeva edetabel:** arvesse läheb päeva esimene tulemus (kontoga mängides), edasi saab harjutada. Peamenüüs on väljakutse kaart, mängijate arv ja sinu koht.

<details>
<summary>English</summary>

Daily challenge: one shift a day that is the same for everyone (sector, time, weather and the same calls at the same times), 3 game hours on normal. The first run of the day counts on the day's own leaderboard (signed in); replays are practice. A tile on the main menu shows the challenge, the number of players and your place.

</details>

## 2.9.0 (2026-10-19)

- **Karjäär algab ühest sektorist:** uus karjäär algab juhtimiskeskuses ühe sektori laua tagant ja sektori valid ise (kaheksa algsektorit üle Eesti). Kõned tulevad sinu sektorist ja selle piirilt, ekipaažid on sinu sektori jaoskondades.
- **Vastutusala kasvab:** kui vahetused lähevad hästi, pakub prefekt sulle uut naabersektorit. Sellega tulevad kaasa inimesed, kaks kasutatud autot ja üleandmistoetus ning päevaeelarve kasvab. Raha eest saab sektorisse avada lisapostid.
- **Ametikoht:** operatiivinfo haldurist vanem-operatiivinfo haldur, vahetuse vanem, grupijuht ja keskuse juht, vastavalt sellele, kui palju sinu vastutusel on.
- **Sektorite kaart** karjääri lehel ja vahetuse eelinfos näitab sinu sektoreid, pakkumist ja naabreid. Mängus on sinu ala kaardil välja joonistatud.
- **Vanad karjäärid jätkavad nagu enne:** terve prefektuur, sama eelarve ja ametikoht vahetuse vanem. Salvestused ja edenemine jäävad alles.

<details>
<summary>English</summary>

A new career starts at one sector desk of the command centre, in a starter sector you choose. Calls come from your sector and its border. The prefect offers neighbouring sectors (with officers, two used cars and a grant), the daily budget grows with them, and money opens extra posts. Your position follows how much you cover. A sector map on the career page and the briefing, and your area outlined in game. Existing careers keep the whole prefecture and play exactly as before.

</details>

## 2.8.0 (2026-10-18)

- **Teised ametid kaardil:** kutsutud kiirabi, Päästeameti auto, lastekaitse, omavalitsus, Keskkonnaamet, veterinaar, toll, Transpordiamet, KAPO ja merepääste paat sõidavad kaardil sündmuskohale ja jõuavad kohale täpselt siis, kui raadio seda teatab. Kiirabi on punane, kiirabil ja päästjatel vilguvad sõidu ajal sinised tuled.
- **Õige versioon:** mäng näitab nüüd oma tegelikku versiooni ja iga uuendus tõstab seda (väike uuendus 2.x.Y, suurem 2.X.0).

<details>
<summary>English</summary>

Other agencies drive to the scene on the map (ambulance in red, blue lights on ambulances and rescue trucks) and arrive exactly when the radio says so. The game shows its real version, and every update now bumps it.

</details>

## 2.7.1 (2026-10-18)

- **Konto ja külalise andmed on eraldi:** pärast väljalogimist ei saa külaline enam konto pooleli vahetust ega karjääri jätkata. Konto andmed on serveris ja väljalogimisel saab need sellest brauserist kustutada.
- Edetabelisse läheb ainult sisse logituna mängitud vahetus.

<details>
<summary>English</summary>

Account and guest data never mix: after logging out, a guest can no longer continue the account's shift or career. Account data lives on the server and can be removed from the browser at logout. Only shifts played signed in post a score.

</details>

## 2.7.0 (2026-10-18)

- **Venekeelsed helistajad räägivad loo järgi:** iga küsimuse vastus sobib juhtumiga, sugu ja käändeline vene keel on õiged, Eesti kohanimed jäävad ladina tähtedega. Tõlk näitab sama vastuse eesti keeles.

<details>
<summary>English</summary>

Russian-speaking 112 callers answer from the story like Estonian ones, with correct gender and Russian place names; the interpreter shows the matching Estonian line.

</details>

## 2.6.1 (2026-10-18)

- **Vahetuse varajane lõpetamine:** enne aega lõpetades jääb punktidest alles kõige rohkem pool (mida varem, seda vähem) ja hinne ei saa olla parem kui D.

<details>
<summary>English</summary>

Ending a shift early keeps at most half the points (fewer the earlier it ends) and can never grade above D.

</details>

## 2.6.0 (2026-10-18)

- **132 lugu:** lähisuhtevägivalla ja teised sagedased väljakutsed räägivad igaüks erinevat lugu ning sama juhtum ei kordu vahetuses enam nii tihti.

<details>
<summary>English</summary>

132 scenarios: frequent calls such as domestic violence each tell a different story, and the spawner stops repeating itself.

</details>

## 2.5.0 (2026-10-18)

- **35 uut juhtumit,** mis arenevad ja eskaleeruvad vahetuse jooksul.

<details>
<summary>English</summary>

35 new escalating, story-driven incidents.

</details>

## 2.4.4 (2026-10-18)

- Raadio: kui lahendad ekipaaži palve, vastab ta loomulikult („selge“, „aa okei“) või jääb lihtsalt vait.

<details>
<summary>English</summary>

Radio: units acknowledge naturally when the player resolves their request.

</details>

## 2.4.3 (2026-10-18)

- Raadio räägib ka 2x kiirusel kõik välja; katkestatud lause järel tuleb loomulik kinnitus.

<details>
<summary>English</summary>

Radio speaks everything at 2x and adds a natural acknowledgement after a cut line.

</details>

## 2.4.2 (2026-10-18)

- Põgenevad autod ja jälitajad sõidavad teid mööda.

<details>
<summary>English</summary>

Fleeing vehicles and their chasers drive on the roads.

</details>

## 2.4.1 (2026-10-18)

- Raadio: vananenud lauseid enam ei loeta, kiirusel loetakse ainult olulist, sõnastus on päris raadiokeel ja paragrahve ei loeta.

<details>
<summary>English</summary>

Radio: stale lines are dropped, only what matters is spoken at speed, real radio phrasing, no law paragraphs.

</details>

## 2.4.0 (2026-10-18)

- **Raadio räägib päris eesti keeles:** TartuNLP Neurokõne meie serveri kaudu.

<details>
<summary>English</summary>

The radio speaks real Estonian (TartuNLP Neurokõne through our server).

</details>

## 2.3.1 (2026-10-18)

- 112 kõne ajal saab vestluses tagasi üles kerida.

<details>
<summary>English</summary>

112 call: the conversation can be scrolled back up.

</details>

## 2.3.0 (2026-10-18)

- **Autod sõidavad teid mööda:** marsruudid ja autod järgivad päris teid, väljakutsed on majade ja kaubanduskeskuste juures (teedevõrk ja hooned tehakse serveris tänavakaardist, väliseid teenuseid pole).

<details>
<summary>English</summary>

Units drive on real roads and calls sit at houses and shopping centres (road graph and buildings are derived on the server from the self-hosted street map).

</details>

## 2.2.0 (2026-10-17)

- **Mängijate andmed jäävad uuendustes alles:** salvestused teisendatakse uude vormi, enne iga uuendust tehakse varukoopia ja andmebaasist hetktõmmis.

<details>
<summary>English</summary>

Player data survives every update: saves are migrated, and a backup and a database snapshot are taken before each update.

</details>

## 2.1.0 (2026-10-17)

- **Mäng on kergem:** vähem väljakutseid, alguses rohkem ekipaaže ja raha, odavamad autod, rohkem lihavõttemune.
- 86 vea parandust, lingi eelvaated sotsiaalmeedias ja otsingumootorite tugi.

<details>
<summary>English</summary>

Easier balance in every mode (fewer calls, more crews and money at the start, cheaper cars, more easter eggs), 86 review fixes, link previews and SEO.

</details>

## 2.0.0 (2026-10) · EPD 2.0

Mängu täielik uusversioon. Idee on sama mis 2024. ja 2025. aastal, kuid kõik on tehtud uuesti.

- **Uus alus:** Vite, React ja TypeScript. Mäng töötab ka võrguühenduseta (PWA) ja avaldatakse GitHub Pagesis aadressil [politsei.eu](https://politsei.eu).
- **Päris Eesti kaart:** võrguühenduseta vektorkaart ning võrgus tänavakaart, hallkaart ja ortofoto. Üksused liiguvad kaardil reaalajas.
- **Neli prefektuuri:** Põhja, Ida, Lõuna ja Lääne, päris linnade, tänavate ja jaoskondadega.
- **Üle 150 sündmusetüübi**, sealhulgas kõik 116 algset väljakutset. Kohapealsed otsused, toetuse palved, kiirabi kutsumine, kinnipeetute transport, jälitused ja otsingud.
- **Andmebaas:** kehtivad isikukoodid, numbrimärgid, juhi- ja relvaload ning karistusregistri kanded viidetega Eesti seadustele. Legendaarsed 2025. aasta tegelased on alles.
- **Interaktiivsed 112 kõned:** küsimused, prioriteedi määramine, pahatahtlikud kõned, venekeelsed helistajad ja tõlk.
- **Raadioside vastustega**, sünteesitud raadio- ja telefonihelid, valikuline kõnesüntees.
- **Elav maailm:** päev ja öö, aastaajad, ilm, pühad.
- **Karjäär:** Staatus, eelarve ja kuupalgad, ametnike palkamine, autopark, uuendused, auastmed, saavutused.
- **Vahetuse aruanne** hinnetega ja **ajalehe esikülg**.
- **Režissööri režiim** politseifilmide filmimiseks.
- **Eesti ja inglise keel.**
- Algsed 2024. ja 2025. aasta versioonid on mängitavad menüüst.

<details>
<summary>English</summary>

A complete remake. Same idea as in 2024 and 2025, rebuilt from scratch.

- New stack: Vite, React and TypeScript. Works offline (PWA); deployed to GitHub Pages at politsei.eu.
- Real map of Estonia: offline vector map plus online street, grey-scale and orthophoto layers. Units move on the map in real time.
- Four prefectures (Põhja, Ida, Lõuna, Lääne) with real towns, streets and stations.
- 150+ incident types, including all 116 original calls, with on-scene decisions, backup requests, ambulance requests, detainee transport, pursuits and area searches.
- Registry (Andmebaas): valid ID codes, plates, licences, weapon permits and criminal records citing Estonian law. The legendary 2025 characters are still there.
- Interactive 112 transfers: questioning, priority classification, prank calls, Russian-speaking callers and an interpreter.
- Radio log with replies, synthesised radio and phone sounds, optional speech synthesis.
- Living world: day and night, seasons, weather, holidays.
- Career: reputation (Staatus), budget and monthly pay, hiring, vehicle fleet, upgrades, ranks, achievements.
- End-of-shift report with grades and a newspaper front page.
- Director mode for filming police movies.
- Estonian and English.
- The original 2024 and 2025 versions are playable from the menu.

</details>

## 2025 · Live-versioon

Fail [`public/legacy/politseimang-2025.html`](public/legacy/politseimang-2025.html).

- **Staatus:** maine, mis tõuseb hästi lahendatud ja langeb ebaõnnestunud väljakutsetega.
- **Päevad ja raha:** mängus jookseb päevaloendur ja iga 30 päeva järel laekub eelarve, mille suurus sõltub sellest, kui palju Staatus vahepeal kasvas.
- **Palkamine:** „Palka ohvitserid“, uute ametnike palkamine raha eest. Kandidaatide nimekiri täieneb iga kuu.
- **Toetuse nõue:** „Toetust vajab“ ja nupp „Saada abi!“. Kui abi õigel ajal ei jõua, väljakutse ebaõnnestub.
- **Ametnike tüübid** (patrull, kiirreageerija, korrakaitse, kriminaalpolitsei) ja boonus, kui saadad sündmusele õige tüübi.
- Aeguvad väljakutsed: kui keegi kohale ei jõua, langeb Staatus.
- **115 väljakutset.**
- Andmebaasi tekkisid legendaarsed tegelased.

<details>
<summary>English</summary>

The live version (`public/legacy/politseimang-2025.html`): reputation (Staatus), a day counter with a 30-day budget payout based on reputation growth, hiring officers, backup requests ("Toetust vajab" → "Saada abi!"), officer types with a bonus for sending the right one, expiring calls, 115 call types and the first legendary registry characters.

</details>

## 2024-09 · Prototüüp

Fail [`public/legacy/politseimang-2024.html`](public/legacy/politseimang-2024.html). Valmis 11.-15. septembril 2024.

- Sisselogimine ja „Politsei Andmebaasi“ avaleht.
- **Aktiivsed kõned:** juhuslikud väljakutsed, nupud „Aktsepteeri“ ja „Keeldu“.
- **Ametnikud:** nimekiri ja nupp „Send“ ametniku väljasaatmiseks.
- **Isikuotsing:** „Otsi isikut“ andmebaasist.
- Profiili täitmine ja statistika.
- 61 väljakutset.

<details>
<summary>English</summary>

The first prototype (`public/legacy/politseimang-2024.html`), built 11-15 September 2024: login, random calls with accept/reject, an officer list with "Send" buttons, person search, a profile page, statistics and 61 call types.

</details>
