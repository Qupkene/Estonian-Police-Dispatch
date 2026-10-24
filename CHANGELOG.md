# Muudatuste logi / Changelog

Kõik olulised muudatused on kirjas siin. Each version has a short English summary below it.

## 2.32.0 (2026-10-24)

- **Tuntud eestlased on nüüd ka väljakutsetes:** 8 uut lugu, kus kuulsus helistab, on tunnistaja või kannatanu. Petturid kasutavad tema nime ja nägu investeerimisreklaamis ning raha kaotanud fänn tuleb kontorisse. Fänn jälitab esinejat. Esinemise ajal murtakse tema autosse. Ta näeb teelt väljasõitu ja jääb kannatanu juurde. Sportlane leiab metsarajalt vigastatu. Poliitikut ahistatakse tänavaüritusel. Autogrammitunnil tekib tunglemine.
- **Ööklubis väidab joobes mees, et ta on kuulus laulja**, ja nõuab tasuta VIP-lauda. Registrikontroll näitab kedagi muud.
- **Tuntud inimene ei ole kunagi kahtlusalune.** Kui lool on süüdlane, on see väljamõeldud isik. Selline kõne tuleb umbes korra vahetuse või kahe jooksul. Inimene valitakse loo järgi (spordilugu sportlasele, tänavaüritus poliitikule) ja samas vahetuses ei kordu keegi.

<details>
<summary>English</summary>

Public figures now turn up in calls: 8 stories (`src/data/incidents/celebrity.ts`) in which a well-known Estonian calls, witnesses something or is wronged. Scammers run fake investment ads with their face and a fan who lost money comes to the office; a fan stalks a performer; a performer's car is broken into during the show; someone sees a car leave the road and stays with the driver; an athlete finds an injured person on a forest trail; a politician is harassed at a street event; a signing ends in a crowd surge; and a drunk man at a club door claims to be a famous singer while his ID says otherwise. A new person spec field `celebrity` casts someone who fits the story's fields, gender and age (callers, witnesses and victims only; a suspect is always made up), nobody twice in a shift, and texts name them with `{celeb}` and `{celebFor}`. Together the stories are about one call in sixty.

</details>

## 2.31.0 (2026-10-24)

- **Andmebaasis on 300 tuntud eestlast:** poliitikud, muusikud, näitlejad, sportlased, saatejuhid, kirjanikud, ettevõtjad, teadlased, kunstnikud ja modellid. Otsi nime järgi ja inimene tuleb registrist välja koos oma autoga. Leiab ka lavanime järgi: „Tommy Cash“ leiab Tomas Tammemetsa ja „Alika“ Alika Milova. Leiab ka isikukoodi ja auto numbri järgi.
- **Kaardil on märge „Avaliku elu tegelane“**, amet, mille poolest inimest teatakse, ja auto. Karistusregister on alati puhas: tuntud inimene ei ole kunagi tagaotsitav, kahtlustatav ega mõne loo tegelane.
- **Päris on ainult nimi, sünniaeg ja avalik info.** Isikukood, auto, telefon ja välimus on mängu jaoks välja mõeldud ja kaart ütleb seda. Kodust aadressi ei näidata. Isikukoodi järjenumber on 701-999, sellist enne 2013. aastat sündinutel päriselt ei ole.

<details>
<summary>English</summary>

The registry knows 300 well-known living Estonians from the owner's list (politics, music, film and theatre, sport, media, literature, business, science, art and fashion): search a name, a stage name (Tommy Cash finds Tomas Tammemets), an isikukood or a plate and the person comes up with a car. The card carries a "public figure" flag, the occupation and what the person is known for; the record is always clean and a public figure is never wanted, a suspect or part of a story. Only the name, birth date and public facts are real: the isikukood serial (701-999, which hospitals never used before 2013), the car, the phone and the looks are made up, the card says so, and there is no home address. They join a shift only when a search finds them, so saves and co-op snapshots stay the same size.

</details>

## 2.30.1 (2026-10-24)

- **Jaoskonnad, arestimajad ja vanglad on kaardil oma päris kohas:** iga aadress on üle kontrollitud (politsei.ee ja vangla.ee) ja punkt võetud Maa-ameti aadressiregistrist, nii et märk on õige maja peal. Varem olid paljud punktid sadu meetreid kuni mitu kilomeetrit mööda, näiteks Ida-Harju jaoskond 3,6 km, Viru vangla 3,1 km ja Tartu vangla 2,1 km. Ekipaažid alustavad nüüd päris jaoskonnast, nii et sõiduajad on õigemad.
- **Parandatud aadressid:** PPA lennusalk (Väike-Sõjamäe tn 22a), Sillamäe (I. Pavlovi tn 4), Kiviõli politsei- ja päästemaja (Viru tn 23), Narva kordon (Tiigi tn 9a), Võru politseimaja (Räpina mnt 20a), Kärdla jaoskond ja merepääste (Sadama tn 26 ja sadam), Pärnu ja Roomassaare merepääste sadamas ning Vasknarva sadam.
- **Õiged nimed:** Tartu „vangla“ jaam on nüüd Tartu arestimaja (Riia tn 179a), Tartu vangla jääb Turu tänavale. Luhamaa piiripunkt on Lütä külas. Narva-Jõesuu post on kordoni hoones (Suur-Lootsi tn 1b). Kinnitamata Värska kordoni asemel on Piusa kordon.

<details>
<summary>English</summary>

Police stations, arrest houses, prisons, border points and police harbours sit at their real places: every address was checked against politsei.ee and vangla.ee, and every point is the Estonian address register (ADS) point of that address, taken from the Overture Maps addresses release. Many points were hundreds of metres to several kilometres off (Ida-Harju 3.6 km, Viru Vangla 3.1 km, Tartu Vangla 2.1 km), so crews now start from the real buildings and drive times change with them. Wrong or out-of-date addresses were corrected (the PPA air unit, Sillamäe, Kiviõli, Narva kordon, Võru, Kärdla, the Pärnu and Roomassaare boat bases, Vasknarva), the Tartu arrest station is the Tartu arestimaja at Riia tn 179a instead of a second copy of Tartu Vangla, the Luhamaa crossing is in Lütä küla, the Narva-Jõesuu post is the kordon building, and the unconfirmed Värska kordon became the Piusa kordon. Station ids are unchanged, so saves and sectors keep working.

</details>

## 2.30.0 (2026-10-24)

- **Igal prefektuuril on nüüd oma lood:** 48 uut väljakutset, 12 igas prefektuuris. Need juhtuvad ainult seal ja just neis kohtades. Umbes iga kuueteistkümnes väljakutse on nüüd oma prefektuuri lugu, see tähendab üks või kaks vahetuse kohta. Iga lugu on oma kohas harv: sama asi ei kordu igas vahetuses.
  - **Põhja:** kruiisireisija ei jõua laevale tagasi, joobes päevareisijad sadamaterminalis, taskuvargad turistigrupi kallal vanalinnas, rahutu reisija antakse lennukis üle, koputused veoki haagisest Muuga või Paldiski sadamas, hüppaja Rummu karjääris, ujujad Ülemiste joogiveehoidlas, loomaaiast pääsenud kaljukits, turistile tuhandete eurode klubiarve, ärritunud mees saatkonna väravas, noormees kukkus suletud Linnahallis ja palgata ehitustöölised piiravad töödejuhatajat.
  - **Ida:** krossisõitja kukkus tuhamäe nõlval, metallivargad Kreenholmi tühjas vabrikuhoones, tüli Narva piiripunkti jalakäijate järjekorras, keelatud sümboolika Siivertsi sõjahaudade juures, vool viib ujuja Narva-Jõesuus jõesuust merele, mees kukkus promenaadilt Narva jõkke, sõiduauto ja sõjaväekolonn E20 maanteel, kahtlane pildistaja Tapa linnaku väravas, õlireostus Sillamäe või Kunda sadamas, taskuvargad Kuremäe palverändurite seas, ajateenija lahkus linnakust ja alaealiste joomapidu Võsu rannas.
  - **Lõuna:** purjus noormees Kaarsilla kaarel, tudengit rööviti öösel Toomemäel, Valkas varastatud auto sõitis üle piiri Valgasse, joobes veokijuht Luhamaa piiripunkti järjekorras, sibulavargad Peipsi vanausuliste külades, suusataja ei tulnud Tehvandi radadelt tagasi, joobes mees kukkus Viljandi lossimägedel vallikraavi, noored suletud Piusa koobastes, seeneline eksis Saatse saapas piiri äärde, öine driftimine Raadi lennuväljal, vanausuliste palvelast varastati ikoonid ja joobes seltskond ronib Suudlevate tudengite skulptuurile.
  - **Lääne:** inimene tormisel Pärnu muulil, joobes juht Läti piiripoest tagasi, praamile kiirustav juht möödub ohtlikult, auto sõitis Väinatammilt merre, viimasest praamist maha jäänud mees märatseb sadamas, varastatud auto praamijärjekorras, tabletimüüja Raeküla festivalil, kanuumatkajad Soomaa suurveel, kulupõletamisest süttis Matsalu roostik, hülgepoeg rannal, jaht saabus piirikontrollita ja joobes pealtvaataja sõitis Saaremaa ralli kiiruskatsele.
  - Igal lool on oma 112 kõne (ka vene keelt kõnelevale helistajale), raadioread, otsused ja mitu lõppu. Paljud lood lähevad hullemaks, kui keegi ei jõua õigel ajal kohale. Osa lugusid kuulub oma aastaaega või kellaaega: Soomaa suurvesi kevadel, Rummu suvel, Tehvandi talveõhtul, Kaarsild ja Raadi öösel.
- **Lood juhtuvad õiges kohas:** praamijärjekorra tüli ja tulekahju parvlaeval tulevad nüüd ainult Virtsu, Kuivastu, Rohuküla või Heltermaa sadamas, mitte Pärnu kaubasadamas või jahisadamas. Uued lood on oma kohtadega seotud samamoodi.
- **Vahetuse tingimused nimetavad uppumisi:** jaanipäeval on veeõnnetusi rohkem (ka kadunud ujuja lugu tuleb siis sagedamini) ja eripäeva juures on nüüd kirjas ka „uppumised“.
- **Raadio parandused:** kui otsitakse kadunud või kukkunud inimest, ütleb ekipaaž leidmisel „isik leitud“, mitte „kahtlustatav kinni peetud“. Puhta registripäringu vastus ei ütle enam „laseme minna“, sest inimene võidakse sama juhtumi pärast ikkagi kinni pidada.

<details>
<summary>English</summary>

Every prefecture gets its own stories: 48 regional incident templates, 12 each, in `src/data/incidents/regional/` (all with `regions` set to one prefecture), together about one call in sixteen (one or two a shift), each kept rare at its own place. Põhja has the Tallinn port, the old town, the airport, the embassies, Rummu, Ülemiste and the closed Linnahall; Ida the ash hills, Kreenholm, the Narva-1 queue, Siivertsi, the Narva river, a military convoy on the E20, Tapa, the harbours, Kuremäe and Võsu; Lõuna the Kaarsild, Toomemägi, Valga-Valka, Luhamaa, Peipsi's old-believer villages, Tehvandi, the Viljandi castle hills, Piusa, the Saatse Boot, Raadi and the Kissing Students; Lääne the Pärnu breakwater, Ikla, the ferry roads, ports and queues, the Väinatamm, the Raeküla festival, Soomaa's spring flood, Matsalu, seal pups, yachts and Saaremaa Rally. Each has a 112 call with Russian lines, radio beats, decisions and several endings; most escalate when nobody arrives in time. Each set was written, reviewed twice (realism and game logic; Estonian, English and Russian) and fixed.

A new template field `placeTags` ties a story to curated places with a tag (`Place.tags`): the ferry queue fight and the ferry fire now happen only at the island ferry ports. A tagged template never spawns where no such place exists (a prefecture, a sector) and is never a colleague's help call; untagged templates pick exactly as before. The briefing names the `drowning` day tag (Midsummer), which the regional water stories and the nationwide missing swimmer story now answer. A search in a story with no suspect radios "person found" instead of "suspect detained", and a clean registry check no longer answers "letting them go".

The escalating stories' checks moved to `tests/fixtures/incidentSuite.ts` and also run on the regional set (`tests/incidents-regional.test.ts`, with per-prefecture counts, spawnability and share). `docs/MANHUNT.md` designs the next feature: searching people and cars, wanted status and search parties.

</details>

## 2.29.0 (2026-10-23)

- **Mitmikmängus jätkate pärast mängu samas ruumis:** aruande põhinupp on nüüd „Tagasi ruumi“ (ka Enter), mitte „Uus vahetus“, mis viis kiirmängule. Keegi ei pea koodiga uuesti liituma.
  - Kui kõik on lõpetanud, avaneb ruum järgmiseks vooruks: sama kood ja samad mängijad. Eelmise vooru tulemused jäävad paneelile „Eelmine voor“.
  - Ruumi looja saab uuesti valida kõike, ka režiimi (võistlus, rollid, sektorid), prefektuuri, ala, raskuse, pikkuse ja koosseisu. Teised annavad uuesti märku, et on valmis, ja looja alustab.
  - Igal voorul on uus seeme, vahetus on iga kord uus. Rollid, töölauad ja oma ekipaažid jäävad alles.
  - Aruande ruumi paneel näitab, kas teised alles mängivad, kas voor on läbi või ootab ruum juba järgmist vooru. Ruumist saab lahkuda otse aruandest („Lahku ruumist“). Kui ruum on suletud, viib aruanne uue ruumi juurde.
  - Mängija, kes pani akna kinni, ei takista järgmise vooru alustamist ega lõppu. Kui kellelgi läheb kaua, saab looja vooru kõigi jaoks lõpetada („Lõpeta voor“). Kui looja on ruumist 5 minutit eemal, saab looja rolli järgmine kohalolija.
  - Voorude vahel näitab peamenüü mitmikmängu rida ruumi edasi ja sinna saab koodiga liituda ka uus mängija. Ühisvahetuse kogemuspunktid lähevad karjääri iga vooru eest eraldi. Admini paneelis on näha ruumi voorud ja nende tulemused.
- **Päeva väljakutse avaneb menüüst:** vajuta Teenistuse real „Päeva väljakutse“ ja paremalt libiseb sisse väljakutse paneel, kaardil muutub väljakutse sektor oranžiks.
  - Vajuta sama rida uuesti ja väljakutse algab. Rida ütleb ise, mis järgmisena juhtub (alusta, jätka, vaata tulemust või harjuta).
  - Paneeli all on suur nupp „Alusta väljakutset“. Kui tänane tulemus on juba kirjas, on nupp „Harjuta uuesti“ ja tulemus on paneelis kohe näha.
  - Paneeli saab sulgeda Esc-klahviga, ristiga või klõpsuga mujale menüüs. Telefonis tõuseb väljakutse alt lehena üles ja kaardiriba näitab samal ajal oranži ala.
- **Vahetuse „Tingimused“ on uue kujundusega:** ülal on kohe näha, millal vahetus on, milline ilm on ja kui suur on oodatav koormus.
  - Raskusastmed on kaartidel: väljakutsete hulk tavalisega võrreldes ning kiirmängus tööl olevate ekipaažide arv, karjääris XP kordaja.
  - Vahetus on 24 tunni joonel: iga tunni väljakutsete hulk, pimedad tunnid päikesetõusu ja -loojangu järgi ning valitud vahetus.
  - Kuupäevad on kalendrilehtedena koos sellega, kui tihe on valitud vahetus sel päeval. Eripäevadel öeldakse, mida rohkem juhtub (nt jaaniööl lõkked, ilutulestik ja joobes juhid).
  - Ilm on ikoonidega ja iga ilm näitab, kuidas see sõiduaegu, liiklussündmusi ja väljakutseid mõjutab.
  - „Alusta vahetust“ on lehe allservas ja alati käeulatuses, ka telefonis.
- **Vahetuse lõpu ajalehes on päris joonistused:** 12 joonistust, igas lehes uus ja päeva pealooga sobiv (liiklusloo juures kiiruse mõõtmine, jälituse juures patrullauto või politseibuss, rahutuste juures rahvahulk).
  - Uuesti avatud raport näitab sama pilti, järgmine vahetus toob uue. Viimati nähtud pilti kohe ei korrata, võimaluse korral ka eelviimast.
  - Pildid on lehe jaoks parajas suuruses ja telefonis teravad. Trükitud lehe täpiline filter jäi alles, aga on joonistuste peal pehmem.
  - Ilma internetita, kui pilti pole vahemälus, näitab leht vana visandit.

<details>
<summary>English</summary>

Rooms play round after round: the report's main action is "Back to the room" instead of a new quick shift. The first player back reopens a finished room (`POST /api/rooms/{code}/reopen`) with the same code and players, a new secret seed and reset ready marks; the round's results are archived (schema step 11, additive only: `rooms.round`, `room_round_results`) and shown as the last round. Options, mode, roles, desks and drafts stay, and the host can switch the mode in the lobby (PUT with `mode`). Players who are away no longer hold up the start, a round waits only for those who took part, the host can end a waiting round (late results answer 409 `round_over` by seed), and a lobby whose host has been away for 5 minutes passes to the next player present. Co-op rounds are new shared shifts on both engines, and co-op XP is paid once per room and round (`room:<code>:<seed>`). Rooms are deleted 30 days after their last change; the admin panel shows a room's rounds.

The daily challenge opens from the menu: pressing its Teenistus row slides the challenge panel in from the right and lights the challenge's sector amber on the duty map; pressing the row again (or the panel's wide amber button) starts it. Esc, the close button or a click elsewhere closes it; on a phone the panel is a bottom sheet under the lit map strip.

The briefing's Conditions panel was redesigned around the sim's own numbers: a summary strip (when, weather, expected load), difficulty cards with call volume and crews on duty (XP in career), the shift on a 24-hour line with calls per hour and the dark hours, calendar tiles that rate how busy the chosen shift is and name what special days bring, and weather tiles with icons and their effect on drive times, traffic incidents and calls. "Start shift" sits in a bar that sticks to the bottom of the screen.

The end-of-shift newspaper prints the owner's 12 halftone drawings instead of the flat sketch: one that fits the lead story where it can (every incident category but the easter eggs has one), a different one each shift (never the last one shown, and not the one before it when another fits), the same one when a report is reopened. Two sizes each, cached when first shown, with the old sketch as the offline fallback; `node scripts/paper-drawing.mjs` adds the next one.

</details>

## 2.28.2 (2026-10-23)

- **Mängu versioon on nüüd vahetuse ajal näha:** väikselt kaardi all vasakus nurgas. Menüü ülaribalt võeti see ära, menüü jaluses on versioon nagu varem.

<details>
<summary>English</summary>

The version now shows during a shift, small in the lower left corner of the map (on a phone just above the map's attribution row; the offline-map badge moves up a line). It left the menu's top bar again: the menus keep it in their footer.

</details>

## 2.28.1 (2026-10-23)

- **Admini paneel töötab ka Brave'is:** Brave'i reklaamiblokeerija peitis sisselogimise välja ja nupud, sest paneeli kujunduse nimed algasid „ad-“ (nagu reklaamidel). Nimed on nüüd teised ja test hoiab, et ükski mängu või paneeli nimi ei satu reklaamiblokeerijate nimekirja.
- **Mängu versioon on menüü ülaribal** väikselt kella ja keelevaliku vahel.

<details>
<summary>English</summary>

The admin panel works in Brave: its class names used the prefix ad-, and ad blockers' generic EasyList rules (`.ad-field`, `.ad-btn`, `.ad-card`, `.ad-panel` and more) hid the login form and most of the panel. The prefix is now pn-, every class of the game and the panel was checked against EasyList's generic hiding rules, and `tests/adblock-safe.test.ts` keeps class names clear of them. The out-of-game top bar shows the version, small and quiet, in its free stretch.

</details>

## 2.28.0 (2026-10-22)

- **Admini paneel aadressil politsei.eu/admin:** omanik saab hallata kõike ühest kohast, ka telefonis.
  - **Kontod:** otsi, sorteeri, loo uus konto (parooli võib server ise teha), nimeta ümber, blokeeri ja luba, tee adminiks, kustuta.
  - **Paroolid:** määra uus parool või lase serveril teha tugev parool, mida näidatakse üks kord. Konto kõik seansid lõpevad. Saab ka lihtsalt kõikjalt välja logida ja sisselogimise piirangu tühistada.
  - **Tulemused:** edetabeli ja päeva väljakutse tulemusi saab lisada, muuta ja kustutada, nii kõigi kaupa kui ühe mängija lehel.
  - **Salvestused:** mängija pilvesalvestust saab vaadata, muuta, alla laadida, failist üles laadida ja kustutada. Muudatus jõuab mängija seadmetesse järgmisel sünkroonimisel.
  - **Ruumid:** mitmikmängu ruumide mängijad ja tulemused, ruumi sulgemine ja kustutamine.
  - **Ülevaade, logi ja varukoopiad:** kontode ja tulemuste arv, viimase 30 päeva graafik, parimad mängijad. Iga admini muudatus jääb logisse (kes, millal, mida, IP). Andmebaasist saab teha kontrollitud varukoopia.
- **Turvalisus:** paneel avaneb ainult admini kontoga ja küsib parooli uuesti (kaheks tunniks). Esimene admin tehakse serveris käsuga, veebist seda õigust anda ei saa. Admin ei saa ennast kogemata välja lukustada.
- Blokeeritud konto ei saa sisse logida. Admini mängumenüüs (konto nupu all) on link „Admini paneel“.

<details>
<summary>English</summary>

An admin panel at politsei.eu/admin/ (its own page and bundle, `src/admin/`, built by `vite.admin.config.ts`): accounts (search, sort, create with a given or generated password, rename, block, make admin, delete), password resets and "log out everywhere" (a session generation, `users.sess_gen`, ends every older session), lifting the login limit, leaderboard and daily results (add, edit, delete), cloud saves (read, edit, download, upload, delete, as a new version the devices pick up), rooms (players, results, close, delete), statistics with a 30-day chart, an audit log of every admin write and a checked database backup. Access needs an account with the admin role (schema step 10: `users.role`, `users.disabled`, `users.sess_gen`, table `admin_log`) and the password again, good for two hours per session. The first admin is made on the server (`server/bin/admin.php`); admins cannot delete, block or demote themselves. A blocked account's login answers 403 `account_disabled`. The service worker leaves /admin/ alone, robots.txt and the Caddyfile keep it out of search engines.

</details>

## 2.27.0 (2026-10-22)

- **Mitmikmängu kohandatud koosseis parandatud:** enne valis ainult ruumi looja ekipaažid ja kõik juurde lisatud ekipaažid läksid esimese laua baasi, nii et teised said vaevu ühe üksuse. Nüüd:
  - võistlusel ja sektorite koostöös valib **iga mängija oma ekipaažid** („Vali oma ekipaažid“). Sektorites valid oma laua ekipaaže ja vahetad lauda, siis kolib su valik kaasa;
  - **iga politseinik saab olla ainult ühe mängija koosseisus**, nagu fantaasialiigas. Teiste valitud politseinikud on nimekirjas märgitud;
  - laud, mille jaoks keegi ei valinud, saab automaatselt tavalised ekipaažid, nii et ükski laud ei jää tühjaks;
  - rollidega mängus valib ühise koosseisu endiselt ruumi looja.
- **Peamenüü on lihtsam:** 9 rea asemel 6. „Üksikmäng“ avab kiirmängu, kohandatud mängu ja režissööri režiimi, „Muu“ avab algsed versioonid ja tiitrid.

<details>
<summary>English</summary>

Multiplayer custom forces fixed: only the host could draft, and every crew added in the editor landed at the first desk's station, so the other desks got next to nothing. Now in race and sector rooms every player drafts their own force (a sector player for their desk; a desk change moves the draft along), each officer belongs to one player of the room, and a desk nobody drafted for gets its usual crews. In role rooms the host still drafts the shared force. Server: `POST /api/rooms/{code}/custom`, `room_players.custom` (schema step 9), a sector room's drafts joined at the start. The main menu is down from nine rows to six: "Single player" opens quick play, custom game and director mode; "More" opens the original versions and the credits.

</details>

## 2.26.0 (2026-10-22)

- **Kohandatud mäng:** uus valik peamenüüs. Pane vahetuseks ise kokku oma meeskond nagu fantaasiajalgpallis:
  - vali prefektuur ja alad, mida teenindad (üks sektor, mitu või kogu prefektuur);
  - lisa nii palju ekipaaže, kui tahad: patrullid, kiirreageerijad, koerad, liiklus, kriminaalpolitsei, piirivalve, kaatrid, K-komando ja kopter;
  - vali neile igast prefektuurist 60 politseiniku seast oma inimesed. Igaühel on oskus, staaž, eriala ja hind. Väljaspool eriala töötab politseinik nõrgemalt.
- **Eelarve:** soovi korral on eelarve sama, mis ala tavalise koosseisu hind. Head politseinikud ja kopter on kallid, nii et kõike parimat korraga ei saa. Eelarve saab ka välja lülitada.
- **Mitmikmängus** saab ruumi looja valida „Koosseis: Kohandatud“ ja panna sama moodi kokku kogu ruumi meeskonna. See käib võistluse, rollide ja sektorite kohta. Kõik mängijad saavad sama koosseisu.
- Kohandatud mängu tulemusi edetabelisse ei kanta.

<details>
<summary>English</summary>

Custom game: a new menu entry to draft your own force like a fantasy league. Pick the prefecture and the areas you cover, add as many crews of any kind as you like (patrols, rapid response, K9, traffic, CID, border, boats, K-Commando, the helicopter) and staff them from the prefecture's pool of 60 officers, each with skill, years, a specialty and a price; outside their specialty an officer works below their skill. An optional budget equals what the area's standard roster costs. In multiplayer the host can switch the room's force to "Custom" and draft it the same way for every mode; every player gets the same force. Custom games are never ranked. The server validates and stores the force (schema step 8, `rooms.custom`) and the game server's frame limit is now 16 KiB so the largest force fits its ticket.

</details>

## 2.25.0 (2026-10-22)

- **Valed registrivastused saavad tagajärjed:** patrull ei näe registrit ja tegutseb selle järgi, mida sa raadios ütlesid. Kui ütled süütu kohta „tagaotsitav“, pannakse ta raudu. Kui ütled tagaotsitava kohta „puhas“, lastakse ta minema. Kohe keegi viga ei märka.
- **Tõde tuleb välja hiljem, nagu päriselt:** arestimaja kontrollib kinnipeetu andmeid, inimene vaidlustab trahvi, tagaotsitav peetakse kinni mujal, kannatanu helistab uuesti. Seejärel tuleb sageli sisekontrolli kaebus, mis võtab avalikku usaldust ja vahetuse hinnet (kehakaamerad vähendavad kaebuse mõju poole võrra).
- **Paranda õigel ajal:** kui märkad viga, saad vastust raadios kümne mänguminuti jooksul parandada („Parandus!“). See maksab vähe. Nupp on igal vastusel, nii et see ei reeda, kas vastus oli vale.
- Tahvelarvutitega (MDT) patrull kontrollib raske otsuse vahel ise üle ja peatub õigel ajal. Õppemängus teeb patrull seda alati.
- Statistikapaneel näitab vahetuse ajal ainult vastatud päringuid, mitte õigeid ja valesid. Vahetuse aruandes on uus osa „Päringute järelkontroll“, ja ajaleht kirjutab süütult kinni peetud inimesest.

<details>
<summary>English</summary>

Wrong registry answers now have consequences. The crew cannot see the registry and acts on what control told them: an innocent person called wanted is cuffed, a wanted one called clean is let go, and nobody notices on the air. The truth comes out later through the channel it would in real life (the custody suite at intake, a contested fine, the wanted person caught elsewhere, the victim calling again, a follow-up audit), often followed by a complaint to internal review that costs public trust and shift score (body cams halve it). Control can correct an answer on the radio within ten game minutes ("Parandus!") at a small cost; the button is offered on every answer, so it gives nothing away. Crews with terminals (MDT) sometimes re-check a heavy call and stop in time; in the tutorial they always do. The live statistics show answered checks only; the report gets a "Registry follow-up" section and the newspaper covers an innocent person's detention.

</details>

## 2.24.0 (2026-10-20)

- **Telefonivaade üle käidud:** kõik nupud on telefonis vähemalt 44 px, tekstiväljad ei suumi iPhone'is enam sisse ja mäng arvestab ekraani sälgu ning kodunupu ribaga.
- **Tutvustavad lehed:** telefonis on uus menüüriba: üks rida logo ja „Menüü“ nupuga, mis avab suured lingid. Enne läks „English“ ekraanist välja.
- **Dispetšerivaade telefonis:** suuremad kiiruse ja kaardi nupud, korraga ainult üks teade (ja 112 kõne ajal mitte ühtegi), soovitatud ekipaažid kahel real ilma lõigatud kutsungiteta, raadio vastused terves laiuses, ekipaažide tabel ilma „…“.
- **112 kaart** püsib ülemise ja alumise riba vahel, küsimused kerivad ja otsuse nupud (prioriteet, loo sündmus, suuna edasi, valekõne) jäävad alati nähtavale.
- **Koostöö paneel** ei kata enam kella ega kiiruse nuppe. Vahetuse lõpu numbrid, aruande tabel ja ajalehe tekst mahuvad kitsale ekraanile.

<details>
<summary>English</summary>

A phone pass over the whole game. Controls are at least 44 px on phones, inputs are 16 px so iOS does not zoom, and the app respects the notch and home indicator (viewport-fit=cover, safe-area insets). The landing pages get a single-row phone header with a script-free "Menu" disclosure. In the dispatch view: bigger top-bar and map buttons, only the newest toast (none over an open 112 call), two-line recommended units, full-width radio replies, an untruncated units table, a 112 card docked between the bars with a fixed decision row, a co-op panel that no longer covers the clock, and end-of-shift, report and newspaper layouts that fit narrow screens. Desktop is unchanged.

</details>

## 2.23.1 (2026-10-20)

- **Mitmikmäng:** ekipaaži registripäringule saab nüüd vastata iga mängija, ka sõbra eest, ja registris kontrollitud isik või auto läheb kõigile kirja. Muud raadiovastused jäävad laua juurde.
- Jälituses ei saa helikopterit enam mitu korda kutsuda: nupp jääb ootele, kui kopter on teel, ja raadio ütleb „Helikopter on juba teel“ ainult ühe korra.
- Suvilate murdvargus ja loata tuletegemine ei teki enam järve keskele.

<details>
<summary>English</summary>

Co-op: any player can answer a crew's registry query, a friend's included, and registry checks count for everyone; other radio replies stay with their desk. The pursuit's helicopter button waits while the helicopter is alerted or on its way, and "the helicopter is already on its way" is said once a pursuit. Cottage burglaries and illegal fires no longer happen in the middle of a lake.

</details>

## 2.23.0 (2026-10-20)

- **Rohkem väljakutseid:** päeva väljakutses tuleb kolme tunni peale nüüd 10 kuni 15 kutset (enne 1 kuni 12), sektori vahetusel umbes neli tunnis ja uues karjääris umbes kolm tunnis. Mäng jääb võidetavaks: testides jõuab hea dispetšer igal pool järele.
- **Ühtlasem tempo:** pikki tühje vaheaegu enam ei ole. Kõige pikem vaikus kahe kutse vahel on 20 mänguminutit (karjääris veidi rohkem). Kutsed ei tule enam ka ühe hooga hunnikus.
- **Mitmikmäng:** sektorite koostöös toob iga laud oma kutsed, nii et kahe lauaga on kutseid kaks korda rohkem. Rollide koostöös lisab iga mängija 60 % kutseid juurde (ekipaaže on sama palju).
- Sama perekonna lugu ei tule ühes vahetuses kaks korda.

<details>
<summary>English</summary>

More calls and steadier pacing: the daily challenge now brings 10 to 15 calls in three hours (1 to 12 before), a sector shift about four an hour and a new career about three, still winnable in the balance tests. The longest silence between calls is 20 game minutes (a bit more in a career), and arrivals bunch up less (Erlang-2 gaps). Co-op: every sector desk brings its own calls (two desks, twice the calls); in role co-op each player beyond the first adds 60 %. A family's story is never told twice in a shift. Also fixed: account deletion used the real clock instead of the rooms' clock, which made two server tests depend on the time of day.

</details>

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
