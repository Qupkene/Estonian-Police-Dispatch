# Muudatuste logi / Changelog

Kõik olulised muudatused on kirjas siin. Each version has a short English summary below it.

## 2.0.0 (2026-10) · EPD 2.0

Mängu täielik uusversioon. Idee on sama mis 2024. ja 2025. aastal, kuid kõik on tehtud uuesti.

- **Uus alus:** Vite, React ja TypeScript. Mäng töötab ka võrguühenduseta (PWA) ja avaldatakse GitHub Pagesis aadressil [politsei.eu](https://politsei.eu).
- **Päris Eesti kaart:** võrguühenduseta vektorkaart ning võrgus tänavakaart, hallkaart ja ortofoto. Üksused liiguvad kaardil reaalajas.
- **Autod sõidavad teid mööda:** marsruudid ja autod järgivad päris teid, väljakutsed on majade ja kaubanduskeskuste juures (teedevõrk ja hooned tehakse serveris tänavakaardist, väliseid teenuseid pole).
- **Teised ametid kaardil:** kutsutud kiirabi, Päästeameti auto, lastekaitse, omavalitsus, Keskkonnaamet, veterinaar, toll, Transpordiamet, KAPO ja merepääste paat sõidavad kaardil sündmuskohale ja jõuavad kohale täpselt siis, kui raadio seda teatab. Kiirabil ja päästjatel vilguvad sõidu ajal sinised tuled.
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
- Cars drive on the roads: routes and units follow real roads, calls sit at houses and shopping centres (road graph and buildings are derived on the server from the self-hosted street map, no external service).
- Other agencies on the map: a requested ambulance, Rescue Board truck, child protection worker, local council, Environmental Board, vet, customs, Transport Administration, KAPO or sea rescue boat drives to the scene and arrives exactly when the radio says so. Ambulances and rescue trucks flash blue lights on the way.
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
