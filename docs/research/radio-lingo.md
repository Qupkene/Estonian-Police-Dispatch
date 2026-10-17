# Radio and dispatch language: research notes for EPD

Research notes for **EPD**, an unofficial, fan-made Estonian police dispatch simulator. They cover how Estonian police radio traffic, dispatcher speech, police jargon, press releases and 112 callers sound. Use them for in-game radio chatter, the newspaper generator and caller dialogue.

Compiled 2026-10-17.

**How these notes were made.** The workflow's web-search budget ran out before this agent's first query, so **no new web evidence was gathered for this file**. WebFetch is blocked as well. The content comes from:

1. Facts already **verified** in the sibling notes `ppa-organisation.md`, `112-and-priorities.md`, `law-references.md` and `vehicles-plates.md`. These are tagged **[VERIFIED (sibling)]**, with the file named.
2. The author's own knowledge of Estonian, Estonian institutions and Russian.
3. Natural professional phrasing written for the game wherever real usage is not public.

**Confidence tags**

- **[VERIFIED (sibling)]**: verified by web search in a sibling research note (named).
- **[LIKELY]**: strong prior knowledge, not contradicted by anything in the sibling notes.
- **[UNSURE]**: plausible but unconfirmed. Use only as flavour.
- **[PROPOSED]**: written for the game. It is natural Estonian (or Russian) but **not** a claim about real PPA procedure.

> **Unofficial-game caution.** The game will be served at `politsei.eu`, one TLD away from PPA's real site `politsei.ee`. Radio lines, press-release templates and caller lines must stay obviously fictional: invented call signs, invented names and no real PPA phone numbers or e-mail addresses in generated news. Keep the "not affiliated with PPA" disclaimer visible. (The same warning appears in `ppa-organisation.md`.)

---

## 0. Quick take

| Topic | Answer for game designers | Confidence |
|---|---|---|
| Radio network name | **ESTER** (Estonia's national TETRA network). **VIRVE is Finland's network.** The DESIGN doc's "VIRVE-style" label should become "ESTER-style" or a fictional name. | [VERIFIED (sibling: ppa-organisation.md §8)] |
| Real PPA radio procedure published? | **No.** PPA does not publish its radio procedure, call signs (*kutsungid*) or status codes. All call signs in the game are invented. | [VERIFIED (sibling: ppa-organisation.md §9)] that nothing was found; procedure itself [UNSURE] |
| Core prowords | **Kuulen** (go ahead), **Selge** (copy), **Vastu võetud / Võtsin vastu** (received), **Kinnitan** (affirm), **Korrake** (say again), **Parandus** (correction), **Oodake** (wait), **Lõpp** (out). These are standard Estonian radio words, from Defence Forces and maritime/aviation radiotelephony usage. Police TETRA traffic is shorter and less formal. | Words [LIKELY]; exact police usage [UNSURE] |
| Ten-codes ("10-4", "code 3")? | **Not used** in Estonia. Speech is plain Estonian. Avoid Americanisms. | [LIKELY] |
| Spelling alphabet | **No official Estonian police spelling alphabet was found.** Plates are most likely read with **Estonian letter names** (*bee-ell-kaa*). Unclear letters are clarified ad hoc ("B nagu Bruno") or with the **NATO/ICAO** alphabet, which the border guard, maritime and air units certainly know. The "Anna, Boris…" alphabet mentioned in `vehicles-plates.md` is actually the **Russian** spelling alphabet. | [LIKELY] / [UNSURE] |
| Domestic violence abbreviation | Official term **lähisuhtevägivald (LSV)**. *Perevägivald* is older and colloquial. "PV" is not an established abbreviation, and it would clash with **PV = piirivalve** (border guard). | [VERIFIED (sibling: 112-and-priorities.md §6)] for LSV; PV [UNSURE] |
| Suspect | Legal term **kahtlustatav** (KrMS). *Kahtlusalune* is the colloquial/media form. | [LIKELY] |
| Sobering-up | **kainenema toimetama** ("politsei viis kainenema 90 inimest", ERR headline) | [VERIFIED (sibling: 112-and-priorities.md sources)] |
| Press style | Time as **kell 23.15**, ages as **34-aastane mees**, standard phrases "Politsei alustas kriminaalmenetlust … tunnustel", "Teade ei leidnud kinnitust". See §5. | [LIKELY] |
| DESIGN.md example personal code | `38506120234` fails the checksum. The valid code with the same first 10 digits is **`38506120236`**. | Checksum computed here |

---

## 1. How officers and dispatchers talk on the radio

### 1.1 Context: what the radio traffic is like

- **Network:** ESTER, nationwide TETRA. It has over 100 base stations and about 10,000 daily users from police, border guard, rescue, EMS and prisons. Terminals support **DMO** (direct mode, radio to radio without the network). [VERIFIED (sibling: ppa-organisation.md §8)]
- **TETRA features to imitate:** talkgroups (*kõnegrupid*), individual calls, **status messages** sent with a button instead of voice, an **emergency button** on every handset, PTT beep and DMO fallback out of coverage. [LIKELY]
- **Data versus voice:** patrol cars receive event details on an in-car terminal or tablet, through PPA's tactical command database **KILP**. A lot of routine traffic (status changes, addresses, query results) therefore travels as data, and **voice traffic is short**. [VERIFIED (sibling: 112-and-priorities.md §6) for KILP; terminals in cars LIKELY]
- **Who talks:** the prefecture **juhtimiskeskus** (Lääne prefecture calls it **operatiivkeskus**) with its *operatiivinfo haldurid* and *vahetuse vanem*, the patrol crews, and the **välijuht** (field supervisor). [VERIFIED (sibling: ppa-organisation.md §4)]
- **Register:** speech is clipped and plain. The dispatcher uses **plural imperatives** to a crew (*sõitke, suunduge, kontrollige*), and the crew answers in the **first person plural** (*oleme kohal, liigume, peame kinni*). Officers who know each other often slip into **sina** forms (*kontrolli palun*). [LIKELY]
- **Swearing and humour** happen on real radio but are discouraged, and recordings exist (ESTER has ASC call recording [VERIFIED (sibling)]). Keep in-game chatter professional, with occasional dry humour.

### 1.2 Procedure words (prowords)

| Estonian | Meaning / use | English equivalent | Confidence |
|---|---|---|---|
| **Kuulen** / "{callsign}, kuulen" | Answer to a call: "I hear you, go ahead" | Go ahead | [LIKELY] |
| **Selge** | Understood. The most common acknowledgement. | Copy / roger | [LIKELY] |
| **Vastu võetud** / **Võtsin vastu** / **Võtan vastu** | Received. *Võtan* alone means "I'll take it" (accepting a job). | Received / copy | [LIKELY] |
| **Kinnitan** | Affirmative, or "I confirm" | Affirm | [LIKELY] |
| **Jah / Ei** | Plain yes/no, the normal choice on police radio | Affirm / negative | [LIKELY] |
| **Jaatav / Eitav** | Formal affirmative/negative (radiotelephony style) | Affirmative / negative | [UNSURE] for police |
| **Korrake** / **Korda** | Say again | Say again | [LIKELY] |
| **Parandus** | Correction ("Parandus: maja number kaksteist, mitte kakskümmend") | Correction | [LIKELY] |
| **Oodake** / **Oota** / **Üks hetk** | Wait | Wait / stand by | [LIKELY] |
| **Ootan** | "I'm standing by" | Standing by | [LIKELY] |
| **Siin {callsign}** | "This is {callsign}". Military/formal; police usually just say the call sign. | This is | [LIKELY] military / [UNSURE] police |
| **Vastuvõtt** | "Over" in Defence Forces procedure. Rare on police TETRA. | Over | [UNSURE] |
| **Lõpp** | End of exchange. Formal; on TETRA the call simply ends. | Out | [LIKELY] word / [UNSURE] frequency |
| **Kuidas kuulete?** / **Kuidas kuuled?** | Radio check | How do you read? | [LIKELY] |
| **Kuulen hästi / halvasti / katkendlikult** | Signal report | Loud and clear / weak / broken | [LIKELY] |
| **Eeter vabaks!** / **Raadiovaikus!** | Clear the channel (emergency) | Clear the net | [PROPOSED] |
| **Aitäh** | Polite close. Very common in Estonian speech, including on the radio. | Thanks | [LIKELY] |

**Call structure (who first).** Estonian radio practice names the **addressee first, then the sender**: "Juhtimine, Põhja 21" → "Põhja 21, kuulen" → message → "Selge". [LIKELY]

### 1.3 Situation phrasebook

The placeholders follow `src/data/radioPhrases.ts`: `{callsign}` (e.g. "Põhja 21"), `{short}` ("21"), `{address}`, `{title}`, `{number}`, `{n}`. **JK** means juhtimiskeskus (the player) and **HK** means Häirekeskus. These are the game's own short forms; the official abbreviation for Häirekeskus is **HÄK** [VERIFIED (sibling)].

All lines below are **[PROPOSED]** phrasing unless marked otherwise. They are natural, professional Estonian, but real PPA wording is not public.

#### a) Opening a call

| Estonian | English | Direction |
|---|---|---|
| Juhtimine, {callsign}. | Control, {callsign}. | unit → JK |
| Juhtimiskeskus, {short}, kuulete? | Control, {short}, do you read? | unit → JK |
| {callsign}, juhtimiskeskus. | {callsign}, this is control. | JK → unit |
| {callsign}, kuulen. | {callsign}, go ahead. | reply |
| Kuulen, {short}. | Go ahead, {short}. | reply |
| Kõik Põhja üksused, juhtimiskeskus. | All Põhja units, this is control. | JK → talkgroup |
| Lasnamäe üksused, tähelepanu. | Lasnamäe units, attention. | JK → talkgroup |

#### b) Dispatch orders (JK → unit)

| Estonian | English |
|---|---|
| {callsign}, teile sündmus {number}: {title}, {address}. | {callsign}, event {number} for you: {title}, {address}. |
| {callsign}, sõitke {address}, {title}. Info tahvlis. | {callsign}, go to {address}, {title}. Details on your terminal. |
| {callsign}, eritunnustega {address}. {title}. Olge ettevaatlikud. | {callsign}, lights and siren to {address}. {title}. Use caution. |
| {callsign}, teataja ootab maja ees, tumedas jopes naine. | {callsign}, the caller is waiting in front of the building, a woman in a dark jacket. |
| {callsign}, ohutusinfo: aadressil elab relvaloa omanik. | {callsign}, safety info: a firearms-licence holder lives at the address. |
| {callsign}, aadressil kolm varasemat LSV-väljakutset. | {callsign}, three previous domestic-violence call-outs at the address. |
| {callsign}, teataja soovib jääda anonüümseks. | {callsign}, the caller wishes to stay anonymous. |
| {callsign}, kiirabi on teavitatud, teel. | {callsign}, ambulance notified, on its way. |
| {callsign}, jätke praegune pooleli, kiirem väljakutse. | {callsign}, leave the current job, more urgent call. |

#### c) Acknowledging and en route (unit → JK)

| Estonian | English |
|---|---|
| Selge, {short} suundub. | Copy, {short} en route. |
| {short}, võtsin vastu, kohal {n} minutiga. | {short}, copy, on scene in {n} minutes. |
| {callsign} teel, eritunnustega, {n} minutit. | {callsign} en route, lights and siren, {n} minutes. |
| Võtan. Oleme Pirita teel, {n} minutit. | Taking it. We're on Pirita tee, {n} minutes. |
| {short}, korrake aadressi. | {short}, say again the address. |
| {short}, oleme hõivatud, kas on teist vaba üksust? | {short}, we're busy, is there another free unit? |

#### d) Arrival

| Estonian | English | Confidence |
|---|---|---|
| {short}, kohal. | {short}, on scene. | [LIKELY] |
| Oleme kohal. | We're on scene. | [LIKELY] |
| {callsign}, jõudsime kohale. | {callsign}, we've arrived. | [LIKELY] |
| {short} on sündmuskohal. | {short} is at the scene. | [LIKELY] (*sündmuskoht* is the standard term [VERIFIED (sibling)]) |
| {short}, kohal, läheme sisse. | {short}, on scene, going in. | [PROPOSED] |

#### e) First situation report (sitrep)

| Estonian | English |
|---|---|
| Olukord rahulik, suhtleme osapooltega. | Situation calm, talking to the parties. |
| Olukord kontrolli all. | Situation under control. |
| Teatajat kohapeal ei ole, vaatame ümbrust. | Caller not at the scene, checking the area. |
| Isikud on lahkunud, otsime lähiümbrusest. | The people have left, searching nearby. |
| Kohapeal üks joobes meesterahvas, agressiivne. | One drunk male on scene, aggressive. |
| Üks vigastatu, peahaav, teadvusel. Vajame kiirabi. | One injured, head wound, conscious. Need an ambulance. |
| Uks on lukus, keegi ei ava, seest kostab müra. | Door locked, nobody answers, noise inside. |
| Teade ei leidnud kinnitust. | The report was not confirmed. [LIKELY: standard police phrase] |
| Valeväljakutse, teataja on joobes. | False call, the caller is drunk. |

Use *meesterahvas* and *naisterahvas* (adult male/female) and *noormees* and *neiu* (young male/female). This is typical police and press register [LIKELY].

#### f) Person check (*isikupäring*)

| Estonian | English |
|---|---|
| Juhtimine, {short}. Palun isikupäring. | Control, {short}. Person query, please. |
| Kontrolli palun isikut: Tamm, Mart, sünniaeg kaksteist kuus kaheksakümmend viis. | Please check a person: Tamm, Mart, born 12 June 1985. |
| Isikukood: kolm-kaheksa-viis, null-kuus-üks-kaks, null-kaks-kolm-kuus. | Personal code 385 0612 0236. |
| Isik ilma dokumentideta, nimi tema enda sõnul … | Person has no documents; name by his own account … |

**Replies (JK → unit).** Align them with the DESIGN reply ids:

| Reply id | Estonian | English |
|---|---|---|
| clean | Isiku kohta piiranguid ega tagaotsimisi ei ole. | No restrictions or warrants on the person. |
| clean (colloquial) | Isik puhas. | Person clean. [PROPOSED colloquial] |
| wanted | Tähelepanu, isik on tagaotsitav! Olge ettevaatlikud. | Caution, the person is wanted! Be careful. |
| restraining | Isikul kehtib lähenemiskeeld kannatanu suhtes. | The person has a restraining order against the victim. |
| nolicense | Isikul juhtimisõigus puudub. / Juhtimisõigus on peatatud. | Person has no driving licence. / Licence suspended. |
| weapon | Isikul on relvaluba, registreeritud kaks relva. | Person holds a firearms licence; two weapons registered. |
| probation | Isik on katseajal, varem karistatud vägivalla eest. | Person is on probation, previously convicted of violence. |
| notfound | Sellise isikukoodiga isikut rahvastikuregistrist ei leia. | No person with that code in the population register. |
| mismatch | Isikukood ei vasta nimele, palun kontrollige uuesti. | The code doesn't match the name, please check again. |

#### g) Vehicle check (*sõidukipäring*)

| Estonian | English |
|---|---|
| Palun sõidukipäring: viis-üks-kaks, bee-ell-kaa. | Vehicle query please: 512 BLK. |
| Kontrolli numbrit viissada kaksteist BLK, hall Toyota. | Check plate 512 BLK, grey Toyota. |
| Soome numbrimärk, korrake tähthaaval. | Finnish plate, spell it letter by letter. |

The full reply table (stolen, uninsured, deregistered and so on) is in `vehicles-plates.md` §8. [PROPOSED there]

#### h) Detention and transport

| Estonian | English | Confidence |
|---|---|---|
| {short}, üks isik kinni peetud. | {short}, one person detained. | [PROPOSED] |
| Meesterahvas kahtlustatavana kinni peetud, toimetame arestimajja. | Male detained as a suspect, taking him to the arrest house. | [PROPOSED]; *kahtlustatavana kinnipidamine* [VERIFIED (sibling: 112 doc)] |
| Joobes isik, viime kainenema. | Drunk person, taking him to sober up. | [PROPOSED]; *kainenema* [VERIFIED (sibling)] |
| Isik käeraudades, rahunenud. | Person in handcuffs, calmed down. | [PROPOSED] |
| Kasutasime otsest sundi, isik vigastusteta. | We used force; the person is uninjured. | [PROPOSED]; *otsene sund* [VERIFIED (sibling)] |
| Vajame transporti, kolm kinnipeetut. | Need transport, three detainees. | [PROPOSED] |
| Sõidame Soodevahele. | Heading to Soodevahe. Soodevahe is Põhja's detention centre at Linnaaru tee 5/1 [VERIFIED (sibling)]; using the place name like this is [PROPOSED] colloquial. | [PROPOSED] |
| {short}, oleme arestimajas, vormistame. | {short}, we're at the arrest house, doing the paperwork. | [PROPOSED] |
| Isik üle antud, {short} vabaneb {n} minuti pärast. | Person handed over, {short} free in {n} minutes. | [PROPOSED] |
| Kehtestasime viibimiskeelu 72 tunniks. | We imposed a 72-hour ban on staying at the address. | [PROPOSED]; 72 h rule [VERIFIED (sibling: 112 doc §8)] |
| Isik toimetatakse haiglasse, saadame ühe ametniku kaasa. | Person goes to hospital, we send one officer along. | [PROPOSED] |

#### i) Backup (*lisajõud*, *abi*)

| Estonian | English |
|---|---|
| {short}, vajame lisapatrulli. | {short}, we need another patrol. |
| Saatke veel üks ekipaaž, osalisi rohkem, kui teatati. | Send one more crew, more people involved than reported. |
| Kohapeal viis-kuus agressiivset isikut, vajame lisajõude. | Five or six aggressive people on scene, we need reinforcements. |
| Kas kiirreageerijad on vabad? | Are the rapid-response team free? |
| Vajame koera, kahtlusalune põgenes metsa. | Need a dog, the suspect fled into the woods. |
| Vajame kopterit, otsime metsas kadunud isikut. | Need the helicopter, searching for a missing person in the woods. |
| Välijuht, palun tulge kohale. | Field supervisor, please come to the scene. |

*Lisajõud* (reinforcements) is standard in press ("politsei kutsus kohale lisajõud") [LIKELY]. *Ekipaaž* and *patrullekipaaž* mean crew [VERIFIED (sibling glossary)].

#### j) Officer in danger

The real trigger is the **emergency button** on the TETRA handset, which opens a priority call and alerts the dispatcher [LIKELY for TETRA in general]. The Estonian name **häirenupp** or **hädaabinupp** is [PROPOSED].

| Estonian | English | Direction |
|---|---|---|
| Kiiresti abi! {address}! | Urgent help! {address}! | unit |
| Meid rünnatakse! Noaga! | We're being attacked! Knife! | unit |
| Relv! Tal on relv! | Weapon! He has a gun! | unit |
| Lasud! Lasti! | Shots! Shots fired! | unit |
| Kolleeg vigastatud, vajame kiirabi kohe! | Colleague injured, ambulance now! | unit |
| Kasutasime teenistusrelva. | We used a service weapon. | unit |
| Kõik üksused, eeter vabaks! {callsign} vajab kiiresti abi, {address}. Lähimad üksused eritunnustega kohale! | All units, clear the channel! {callsign} needs urgent help at {address}. Nearest units, lights and siren! | JK |
| {callsign}, kas kuulete? Andke oma olukord! | {callsign}, do you read? Give your status! | JK |
| {callsign}, häirenupp aktiveeritud, kas kõik korras? | {callsign}, your emergency button is active, are you OK? | JK |
| Olukord kontrolli all, ründaja kinni, kolleeg kergelt vigastatud. | Situation under control, attacker detained, colleague lightly injured. | unit (clear) |
| Valehäire, nupp vajus kogemata. | False alarm, the button was pressed by accident. | unit (clear) |

#### k) Pursuit (*jälitus*, *jälitamine*, colloquially *tagaajamine*)

The standard press wording is **"juht eiras politseinike peatumismärguannet"** (the driver ignored the officers' signal to stop) [LIKELY]. The legal concept *peatumismärguande eiramine* appears in `law-references.md` [VERIFIED (sibling) as a term]. Stopping devices are the **naelmatt** (spike strip) [LIKELY] and the **teetõkkeseade** (road-blocking device) [UNSURE].

| Estonian | English |
|---|---|
| Sõiduk ei allu peatumismärguandele, alustame jälitust! | Vehicle ignoring the stop signal, starting pursuit! |
| Juht eirab märguannet, sõiduk ei peatu! | Driver ignoring the signal, vehicle won't stop! |
| Jälitame halli Audit, number viis-üks-kaks, bee-ell-kaa. | Pursuing a grey Audi, plate 512 BLK. |
| Liigume Peterburi teel ida suunas, kiirus sada nelikümmend. | Heading east on Peterburi tee, speed 140. |
| Pööras Väo ristmikult paremale, Maardu suunas. | Turned right at the Väo junction, towards Maardu. |
| Sõitis punase tule alt läbi, liiklus tihe. | Ran a red light, heavy traffic. |
| Juht viskas aknast midagi välja, Narva maantee 12 juures. | Driver threw something out of the window near Narva mnt 12. |
| Tõstame distantsi, ohtlik. | Dropping back, too dangerous. |
| Sõiduk sõitis kraavi, juht põgeneb jalgsi metsa poole! | Car went into the ditch, driver fleeing on foot to the woods! |
| Juht kinni! Jälitus lõpetatud. | Driver detained! Pursuit over. |
| Kaotasime sõiduki silmist, viimati nähtud Lagedi suunas. | Lost sight of the vehicle, last seen heading to Lagedi. |
| *(JK)* Üksused Peterburi tee piirkonnas, olge valmis. | *(JK)* Units near Peterburi tee, stand ready. |
| *(JK)* Liikluspolitsei, kas saate panna naelmati Jõelähtme juurde? | *(JK)* Traffic police, can you lay a spike strip near Jõelähtme? |
| *(JK)* Kopter õhus, kohal kaheksa minutiga. | *(JK)* Helicopter airborne, there in eight minutes. |
| *(JK)* {callsign}, lõpetage jälitus! Kordan: lõpetage jälitus. | *(JK)* {callsign}, terminate the pursuit! I say again, terminate. |

**Direction reporting format** [PROPOSED]: road → direction (*suunas* + place, or *ida/lääne/põhja/lõuna suunas*) → speed → behaviour. Estonians name roads by the city they lead to: *Tartu maantee*, *Narva maantee*, *Pärnu maantee*, *Peterburi tee*. Highways can be named by number or as *Tallinna–Tartu maantee* [LIKELY].

#### l) Clearing and closing

| Estonian | English |
|---|---|
| {short}, sündmus {number} lõpetatud, vaba. | {short}, event {number} closed, available. |
| {short} vaba, tagasi patrulli. | {short} free, back on patrol. |
| Osapooli hoiatatud, rikkumine lõpetatud. | Parties warned, the disturbance has stopped. |
| Koostasime väärteoprotokolli. | We wrote up a misdemeanour report. |
| Alustatakse kriminaalmenetlust. | Criminal proceedings will be opened. |
| Isik lahkus enne politsei saabumist. | Person left before police arrived. |
| Teade ei leidnud kinnitust, lõpetame. | Report not confirmed, closing. |
| Selge, aitäh. Lõpp. | Copy, thanks. Out. |

#### m) Breaks and shift (radio side; see §4)

| Estonian | English |
|---|---|
| {short}, läheme söögipausile, oleme jaoskonnas, kättesaadavad. | {short}, going on a meal break at the station, reachable. |
| {short}, paus läbi, oleme vabad. | {short}, break over, available. |
| *(JK)* {short}, vabandust, katkestan pausi: {title}, {address}. | *(JK)* {short}, sorry, I have to interrupt your break: {title}, {address}. |
| {short}, läheme jaoskonda paberitööle. | {short}, going to the station for paperwork. |
| {short}, vahetuse lõpp, lahkume eetrist. | {short}, end of shift, signing off. |
| *(JK)* Öövahetus alustas, Põhja üksused, palun kontrollige sidet. | *(JK)* Night shift has started; Põhja units, radio check please. |

### 1.4 Unit status vocabulary (UI labels and status messages) [PROPOSED]

| Status (UI) | Radio form | English |
|---|---|---|
| **Vaba** | "{short} vaba." | Available |
| **Suundub** / **Teel** | "{short} teel." | En route |
| **Kohal** | "{short} kohal." | On scene |
| **Hõivatud** / **Tegeleb** | "{short} tegeleb." | Busy on scene |
| **Transport** | "{short} transpordil." | Transporting |
| **Arestimajas** / **Haiglas** | "{short} arestimajas." | At the arrest house / hospital |
| **Paberitöö** | "{short} jaoskonnas." | Paperwork at the station |
| **Paus** | "{short} söögil." | Break |
| **Hädaolukord** | (emergency button) | Officer emergency |
| **Teenistusest väljas** | "{short} lahkub eetrist." | Off duty |

### 1.5 Example exchanges (ready-made scripts) [PROPOSED]

The call signs are fictional, following the scheme in `ppa-organisation.md` §9. Event numbers, names and addresses are invented. The personal codes have valid checksums.

**A. Domestic call, detention, clear**
```
JK:  Põhja 21, juhtimiskeskus.
21:  Kuulen, 21.
JK:  21, sündmus 4512: lähisuhtevägivald, Lasnamäe, Punane 16–45. Naaber kuuleb karjumist ja
     lõhkumist. Aadressil kolm varasemat LSV-väljakutset. Bravo.
21:  Selge, 21 suundub, kohal kaheksa minutiga.
...
21:  21, kohal.
...
21:  21, olukord rahunenud. Mees joobes, naisel vigastus näos. Mees kahtlustatavana kinni,
     toimetame Soodevahele. Kehtestame viibimiskeelu.
JK:  Selge. Kas kiirabi on vaja?
21:  Ei, naine keeldub.
...
21:  21, isik üle antud. Sündmus 4512 lõpetatud, kriminaalmenetlus. Oleme vabad.
JK:  Selge, aitäh.
```

**B. Person query with a warrant hit**
```
22:  Juhtimine, 22. Palun isikupäring.
JK:  22, kuulen.
22:  Isikukood: kolm-seitse-kaks, null-kaks-kaks-üks, null-null-üks-üheksa.
JK:  Oodake... 22, tähelepanu: isik on tagaotsitav, kohtumäärus. Olge ettevaatlikud.
22:  Selge. Peame kinni.
```

**C. Vehicle check: stolen car**
```
L-14: Juhtimine, Lõuna 14. Sõidukipäring: kolm-neli-null, ee-emm-tee, sinine Volkswagen Passat.
JK:   14, number 340 EMT on tagaotsitav, varastatud eile Tartust Annelinnast. Kas juht on autos?
L-14: Jah, üks meesterahvas. Vajame teist ekipaaži.
JK:   Selge, Lõuna 17 suundub, kohal viie minutiga.
```

**D. Backup escalation**
```
31:  Juhtimine, 31! Kohapeal umbes kümme inimest, kaklus, üks lamab maas. Vajame lisajõude ja kiirabi!
JK:  Selge, 31. Kõik vabad Kesklinna üksused: Viru väljak, massikaklus, 31 vajab abi. Kiirabi teavitatud.
24:  24 suundub, kaks minutit.
K-2: K-2 suundub, neli minutit.
```

**E. Officer in danger**
```
[häirenupp: Põhja 26]
JK:  Põhja 26, juhtimiskeskus, kas kuulete?
26:  ...rünnatakse... nuga... Mustamäe tee 50, trepikoda!
JK:  Kõik üksused, eeter vabaks! Põhja 26 vajab kiiresti abi, Mustamäe tee 50, ründajal nuga.
     Lähimad üksused eritunnustega kohale. Kiirabi teavitatud.
23:  23 suundub, kolm minutit.
...
26:  26: ründaja kinni, kolleeg lõikehaavaga käes, teadvusel. Olukord kontrolli all.
JK:  Selge, 26. Kiirabi kahe minuti kaugusel. Eeter vaba.
```

**F. Pursuit**
```
P-12: Juhtimine, 12! Juht eirab peatumismärguannet, alustame jälitust. Hall BMW, number
      kaheksa-kaheksa-null, haa-ell-gee. Liigume Tartu maanteel Ülemiste suunas, kiirus 120.
JK:   Selge, 12. Kõik üksused: jälitus Tartu maanteel, hall BMW 880 HLG.
P-12: Pööras Kurekivi teele, väga kiire.
JK:   12, liikluspolitsei paneb naelmati Jüri liiklussõlme juurde. Kopter tõuseb.
P-12: Sõiduk sõitis kraavi! Juht jookseb põllule!
JK:   Koer suundub, kohal kümne minutiga.
P-12: Juht kinni. Jälitus lõpetatud. Vigastusi ei ole.
```

**G. Sobering-up case with a medical check**
```
41:  Juhtimine, 41. Bussipeatuses magav meesterahvas, tugevas joobes, ei suuda seista.
     Viime kainenema, aga enne kiirabi ülevaatus.
JK:  Selge, 41. Kiirabi teavitatud, ooteaeg u 15 minutit.
```

**H. Ida-Viru: language switch**
```
JK:   Ida 31, teataja räägib ainult vene keelt. Ütleb, et naaber ähvardab noaga, Narva, Kreenholmi 10,
      kolmas trepikoda. Kas teil on vene keele oskaja?
I-31: Jah, kolleeg räägib vene keelt. Suundume, kohal kuue minutiga.
```

### 1.6 Style rules for the chatter generator

1. **Keep it short.** Most real transmissions are 2–8 words: "21 kohal." "Selge." "Vaba." Long lines only for dispatch orders and sitreps.
2. **Call sign first** on almost every transmission. After the first exchange, crews drop the prefecture word ("Põhja 21" becomes "21").
3. **No ten-codes or "over/roger"** in Estonian text. The English subtitles may say "copy" and "en route".
4. **Numbers:** digit by digit for codes and plates, as normal numbers for minutes, speeds and house numbers (see §2.4).
5. **Politeness:** "palun" is used, but not in every line. "Aitäh" closes many exchanges.
6. **Priority words:** the sibling notes verify **Alfa / Bravo / Charlie** as Häirekeskus/PPA priority labels [VERIFIED (sibling: 112-and-priorities.md §6)]. Do not also use NATO "Alfa…" for plate spelling in the same message, because players would confuse the two.
7. **Estonian word order** puts the place before the event in many reports ("Lasnamäel kaklus"), and new information last.
8. **The dispatcher never says "I"** in orders. The crew often omits the subject ("Suundume.", "Peame kinni.").

### 1.7 Suggested additions to `radioPhrases.ts` keys [PROPOSED]

These sit alongside the existing keys (`dispatch`, `ack`, `arrive`, `emergency`, `queryAck`…):

| New key | Example line |
|---|---|
| `callOpen` | "Juhtimine, {callsign}." |
| `callAnswer` | "{callsign}, kuulen." |
| `sitrepCalm` | "{short}, olukord rahulik, suhtleme osapooltega." |
| `sitrepEscalated` | "{short}, olukord pingeline, osalisi rohkem kui teatati." |
| `sitrepNobody` | "{short}, kohapeal kedagi ei ole, vaatame ümbrust." |
| `personQuery` | "Juhtimine, {short}. Palun isikupäring, isikukood {text}." |
| `vehicleQuery` | "{short}, palun sõidukipäring: {text}." |
| `detain` | "{short}, üks isik kinni peetud." |
| `soberUp` | "{short}, joobes isik, viime kainenema." |
| `pursuitStart` | "{callsign}, juht eirab peatumismärguannet, alustame jälitust!" |
| `pursuitUpdate` | "{short}, liigume {place} suunas, kiirus {n}." |
| `pursuitLost` | "{short}, kaotasime sõiduki silmist, viimati {place} suunas." |
| `pursuitAbortJK` | "{callsign}, lõpetage jälitus! Kordan: lõpetage jälitus." |
| `radioCheck` | "Juhtimine, {short}, kuidas kuulete?" / "{short}, kuulen hästi." |
| `notConfirmed` | "{short}, teade ei leidnud kinnitust, lõpetame." |
| `sayAgain` | "{short}, korrake." |
| `correction` | "Parandus: {text}." |

---

## 2. Spelling, letters and numbers on the radio

### 2.1 Estonian letter names (how a plate is read aloud)

Estonian reads Latin letters by their **Estonian names**. This is the default way to say a plate such as `512 BLK`: *"viis-üks-kaks, bee-ell-kaa"*. [LIKELY]

| Letter | Estonian name | | Letter | Estonian name |
|---|---|---|---|---|
| A | aa | | O | oo |
| B | bee | | P | pee |
| C | tsee | | Q | kuu |
| D | dee | | R | err |
| E | ee | | S | ess |
| F | eff | | Š | šaa |
| G | gee | | Z | zett |
| H | haa | | Ž | žee |
| I | ii | | T | tee |
| J | jott | | U | uu |
| K | kaa | | V | vee |
| L | ell | | W | kaksisvee |
| M | emm | | Õ Ä Ö Ü | õõ, ää, öö, üü |
| N | enn | | X / Y | iks / igrek |

Standard Estonian plates use only basic Latin letters. Õ Ä Ö Ü Š Ž **never** appear on them [LIKELY (sibling: vehicles-plates.md)], although they do appear in names and street names.

**Letters that are easy to confuse by sound:** *bee/pee/dee/gee/tee/vee/ee* all end in -ee, and *emm/enn* and *eff/ess* are close. This is where a clarifying word is used. [LIKELY]

### 2.2 Spelling alphabets: what is actually used

| Option | Status | Confidence |
|---|---|---|
| **Official Estonian name-based police spelling alphabet** (e.g. "Aadu, Bernhard, …") | **None found.** The author knows of no published national Estonian spelling alphabet in police or rescue use. Names like "Aadu" and "Bernhard" in the brief are examples, not a known standard. Searches to confirm were impossible this session. | [UNSURE]: assume none |
| **Ad hoc clarification with common words or names** ("B nagu Bruno", "M nagu Mari") | How most Estonians spell on the phone, and probably on police radio too | [LIKELY] |
| **NATO/ICAO alphabet** (Alfa, Bravo, Charlie…) | Used by the Defence Forces (NATO member), by aviation and maritime services, and by PPA's border guard, JRCC and aviation units. Patrol officers know it but do not consistently use it for plates. | [LIKELY] |
| **"Anna, Boris, …"** | That is the **Russian** spelling alphabet (Анна, Борис, Василий…). Russian-speaking callers in Ida-Virumaa and Tallinn do use it. It is **not** an Estonian police alphabet; this corrects `vehicles-plates.md` §8. | [LIKELY] |

**Game recommendation:**
- Default radio reading: **Estonian letter names**.
- When a plate query fails (e.g. a "notfound" result), have the unit repeat it with clarification: *"Korrake tähthaaval. — Bee nagu Bruno, ell nagu Lembit, kaa nagu Kalle."*
- Let traffic, border and helicopter units use **NATO words**: *"Bravo-Lima-Kilo"*.

**[PROPOSED] Estonian clarification words for the game.** These are flavour only and do not claim to be a real standard. They use common, unambiguous Estonian first names, with ordinary words where no name fits.

| Letter | Word | | Letter | Word |
|---|---|---|---|---|
| A | Ants | | O | Olev |
| B | Bruno | | P | Peeter |
| C | Cecilia ("tsee nagu Cecilia") | | Q | Kuubik ("kuu") |
| D | Daavid | | R | Rein |
| E | Enn | | S | Siim |
| F | Feliks | | T | Toomas |
| G | Gustav | | U | Urmas |
| H | Heino | | V | Villem |
| I | Ivo | | W | Wilhelm ("kaksisvee") |
| J | Jaan | | X | Iks ("iks nagu Xaver") |
| K | Kalle | | Y | Igrek ("Yrjö") |
| L | Lembit | | Z | Zoja ("zett") |
| M | Mari | | Õ / Ä / Ö / Ü | Õie / Ärni / Ööbik / Ülle |
| N | Nelli | | Š / Ž | Šokolaad / Žanna |

**NATO alphabet as Estonian speakers say it** [LIKELY]: Alfa, Bravo, Tšarli, Delta, Ekko, Fokstrot, Golf, Hotell, India, Džuuliet, Kilo, Liima, Maik, November, Oskar, Papa, Kebek, Romeo, Sierra, Tango, Juunifoorm, Viktor, Viski, Eksrei, Jänki, Suulu. The spellings are phonetic, for TTS. Written messages use the standard English spellings.

**Russian spelling alphabet** (callers in Ida-Virumaa, Tallinn Lasnamäe/Põhja-Tallinn, Maardu) [LIKELY]:
А Анна · Б Борис · В Василий · Г Григорий · Д Дмитрий · Е Елена · Ж Женя · З Зинаида · И Иван · Й Иван краткий · К Константин · Л Леонид · М Михаил · Н Николай · О Ольга · П Павел · Р Роман · С Семён · Т Татьяна · У Ульяна · Ф Фёдор · Х Харитон · Ц Цапля · Ч Человек · Ш Шура · Щ Щука · Ъ твёрдый знак · Ы Еры · Ь мягкий знак · Э Эхо · Ю Юрий · Я Яков

### 2.3 Gameplay twist: Cyrillic look-alike misreads [LIKELY phenomenon; PROPOSED mechanic]

Russian speakers sometimes read Latin plate letters **as the Cyrillic letters they resemble**. A caller reading `BHP` aloud in Russian may say "**вэ-эн-эр**" (ve-en-er) because В, Н and Р look like B, H and P. The dispatcher has to "translate" this back.

| Latin on plate | Look-alike Cyrillic | Caller may say | Means |
|---|---|---|---|
| B | В (ve) | "вэ" | B |
| H | Н (en) | "эн" | H |
| P | Р (er) | "эр" | P |
| C | С (es) | "эс" | C |
| X | Х (kha) | "ха" | X |
| Y | У (u) | "у" | Y |
| E, K, M, O, T, A | same shapes | "е", "ка", "эм", "о", "тэ", "а" | same letters |

Other callers say the **Latin letter names in Russian**: "бэ, эл, ка" for BLK.

### 2.4 Reading numbers [LIKELY unless marked]

| Item | Spoken form | Notes |
|---|---|---|
| Digits | null, üks, kaks, kolm, neli, viis, kuus, seitse, kaheksa, üheksa | "null" for 0. Never "oo". |
| Plate `512 BLK` | "viis-üks-kaks, bee-ell-kaa" (radio) or "viissada kaksteist BLK" (casual) | Digit by digit on the radio |
| Personal code `38506120236` | "kolm-kaheksa-viis, null-kuus-üks-kaks, null-kaks-kolm-kuus" | Grouping 3-4-4 is [PROPOSED]; any grouping works |
| Phone `5123 4567` | "viis-üks-kaks-kolm, neli-viis-kuus-seitse" | Estonian mobile numbers start with 5 and have 7–8 digits |
| Time 23.15 | "kakskümmend kolm viisteist" / "veerand kaksteist" (casual: quarter past eleven) | 24-hour clock in official speech; written **23.15** [LIKELY (sibling)] |
| Speed | "sada nelikümmend" (140) | |
| Road km | written "38. kilomeetril", spoken "kolmekümne kaheksandal kilomeetril" | Press uses the ordinal |
| House/flat `16-45` | "Punane kuusteist, korter nelikümmend viis" | Written with a dash |
| Event number | "sündmus neli-viis-üks-kaks" or "nelikümmend viis kaksteist" | Invented format |
| Ages | "kolmekümne neljane mees" (spoken), "34-aastane mees" (written) | |

---

## 3. Police slang, jargon and abbreviations

### 3.1 Organisations and units

| Term | Meaning | Register | Confidence |
|---|---|---|---|
| **PPA** | Politsei- ja Piirivalveamet | official | [VERIFIED (sibling)] |
| **politsei** | Police (people say "politsei", not "PPA") | neutral | [LIKELY] |
| **prefektuur** (Põhja, Ida, Lõuna, Lääne) | Regional police HQ | official | [VERIFIED (sibling)] |
| **jaoskond** / politseijaoskond | Police station / district | neutral | [VERIFIED (sibling)] |
| **juhtimiskeskus** / "juhtimine" | Command centre / "Control" on radio | official / radio | centre [VERIFIED (sibling)]; "juhtimine" as a radio call [PROPOSED] |
| **JK** | Juhtimiskeskus. A game abbreviation; real internal use [UNSURE]. | game | [UNSURE] |
| **HÄK** | Häirekeskus (Emergency Response Centre, answers 112). Official abbreviation. | official | [VERIFIED (sibling)] |
| **HK** | Häirekeskus. Game/informal short form. | informal | [UNSURE] |
| **KAPO** / *kapo* | Kaitsepolitseiamet (Internal Security Service) | official short / colloquial | [VERIFIED (sibling)] |
| **KKP** | Keskkriminaalpolitsei (Central Criminal Police) | official | [LIKELY] |
| **kriminaalid** | Criminal-police detectives | colloquial | [LIKELY] |
| **K-komando** | National counter-terror unit | official name | [VERIFIED (sibling)] |
| **kiirreageerijad** | Armed rapid-response teams | official | [VERIFIED (sibling)] |
| **välijuht** | Field supervisor | official | [VERIFIED (sibling)] |
| **konstaabel** / piirkonnapolitseinik | Community officer | official | [VERIFIED (sibling glossary)] |
| **abipolitseinik** | Volunteer auxiliary officer | official | [VERIFIED (sibling)] |
| **mupo** | Tallinna Munitsipaalpolitsei: the **city** enforcement agency, not PPA | colloquial | [VERIFIED (sibling)] |
| **PV** | Usually **piirivalve** (border guard), not "perevägivald" | colloquial | [LIKELY] |
| **liikluspolitsei** / "liiklus" | Traffic police | neutral | [LIKELY] |
| **piirivalvur** | Border guard officer | official | [LIKELY] |
| **päästjad**, colloquially **tuletõrje** | Rescue (Päästeamet) | neutral / colloquial | [LIKELY] |
| **kiirabi** | Ambulance | neutral | [LIKELY] |
| **ATS** | No established Estonian police meaning is known. Do not use without a definition. | | [UNSURE] |
| **"kollane"** | No established police slang meaning is known. PPA tested a mustard-yellow reflective livery in 2017 [VERIFIED (sibling)], but "kollane" as a nickname is unconfirmed. | | [UNSURE] |

### 3.2 Systems and registers

| Term | Meaning | Confidence |
|---|---|---|
| **KILP** | Police tactical command database (events, resources) | [VERIFIED (sibling)] |
| **MIS** | Menetlusinfosüsteem (case-proceedings system) | [VERIFIED (sibling)] |
| **POLIS** | Older police information system name; may still be heard | [UNSURE] |
| **rahvastikuregister (RR)** | Population register | [LIKELY] |
| **liiklusregister** | Vehicle and driver register (Transpordiamet). Older officers may still say **ARK** (Autoregistrikeskus, merged into Transpordiamet in 2021). | [LIKELY] |
| **relvaregister** | Firearms register | [LIKELY] |
| **päring** | Query ("teen päringu", "isikupäring", "sõidukipäring") | [LIKELY] |
| **tahvel** / tahvelarvuti | In-car tablet terminal | [PROPOSED] colloquial |

### 3.3 Legal status of people (get these right in game text)

| Term | Meaning | Note | Confidence |
|---|---|---|---|
| **kahtlustatav** | Suspect (formal, KrMS) | Use in official text | [LIKELY] |
| **kahtlusalune** | Suspect (colloquial/media) | Fine for chatter and quotes | [LIKELY] |
| **süüdistatav** | Accused (after charges are filed) | | [LIKELY] |
| **süüdimõistetu** | Convicted person | | [LIKELY] |
| **kinnipeetu** | Detainee (generic) | | [LIKELY] |
| **kinnipeetav** | Prisoner serving a sentence | | [LIKELY] |
| **vahistatu** | Person held in pre-trial custody on a **court** order (*vahistamine*) | Not the same as police detention (*kinnipidamine*, up to 48 h) | [LIKELY]; 48 h [VERIFIED (sibling) as LIKELY] |
| **arestialune** | Person serving administrative arrest (*arest*) | | [LIKELY] |
| **tagaotsitav** | Wanted person | | [LIKELY] |
| **kannatanu** | Victim | | [VERIFIED (sibling)] |
| **tunnistaja** / **pealtnägija** | Witness (formal) / eyewitness | | [LIKELY] |
| **teataja** | Caller / reporting person | | [VERIFIED (sibling)] |

### 3.4 Offences and procedure

| Term | Meaning | Confidence |
|---|---|---|
| **väärtegu** | Misdemeanour. Fine 3–300 trahviühikut (1 TÜ = €4), or arest. | [LIKELY (sibling: law-references.md)] |
| **kuritegu** | Crime (criminal offence) | [LIKELY] |
| **süütegu** | Offence (umbrella term for both) | [LIKELY] |
| **väärteoprotokoll** | Misdemeanour report | [LIKELY] |
| **kiirmenetlus** | On-the-spot fine procedure | [LIKELY (sibling)] |
| **kriminaalmenetlus** "… tunnustel" | Criminal proceedings "on the elements of …" | [LIKELY] |
| **LSV** | Lähisuhtevägivald (domestic/intimate-partner violence). *Perevägivald* and *peretüli* are colloquial. | [VERIFIED (sibling)] |
| **LÕ** | Liiklusõnnetus (traffic accident) | [VERIFIED (sibling)] |
| **roolijoodik** | Drunk driver (media/colloquial) | [LIKELY] |
| **kriminaalne joove** | Media shorthand for ≥ 1.5 ‰ / 0.75 mg/l | [LIKELY] |
| **viibimiskeeld** | Police ban on staying at a place (up to 72 h in DV cases since 17.04.2026) | [VERIFIED (sibling)] |
| **lähenemiskeeld** | Court restraining order | [VERIFIED (sibling)] |
| **otsene sund**, **erivahendid** | Use of force, special equipment (handcuffs, baton, gas) | [VERIFIED (sibling)] |
| **teenistusrelv** | Service weapon | [LIKELY] |
| **eritunnused** | Blue lights and siren ("sõitis eritunnustega"); also *vilkurid*, *sinised*, *sireen/eriheli* | [LIKELY] |

### 3.5 Colloquial and street slang (for caller lines and NPC dialogue)

| Slang | Meaning | Who says it | Confidence |
|---|---|---|---|
| **võmm**, **võmmid** | Cop(s); mildly disrespectful | Public, offenders | [LIKELY] |
| **menti** / **мент**, **менты** | Cop(s), from Russian | Russian speakers | [LIKELY] |
| **мусора** | Cops, derogatory | Russian-speaking offenders | [LIKELY] |
| **miilits** / **милиция** | Old Soviet term that elderly people still use | Elderly callers (both languages) | [LIKELY] |
| **kartser**, **kong**, **kamber** | Cell / lock-up | Public | [LIKELY] |
| **puur** | The detainee cage in a police van | Officers, public | [LIKELY] |
| **purjus**, **täis**, **vintis**, **napsune**, **"täis kui tint"** | Drunk (from mild to very) | Everyone | [LIKELY] |
| **puhuma** ("lase puhuda", "puhus null koma viis") | Breathalyser test ("had him blow", "blew 0.5") | Officers, public | [LIKELY] |
| **lubad** | Driving licence (official: *juhiluba*, *juhtimisõigus*) | Everyone | [LIKELY] |
| **numbrid** | Licence plates | Everyone | [LIKELY] |
| **klient** | The person being dealt with | Officers, ironic | [LIKELY] colloquial |
| **püsiklient** | Repeat caller or offender | Officers | [LIKELY] colloquial |
| **asots** (from *asotsiaal*) | Marginal heavy drinker; pejorative | Officers and public (avoid in official text) | [LIKELY] |
| **kaklus**, **lööming**, **madin** | Fight, brawl, scuffle | Everyone | [LIKELY] |
| **peretüli** | Family row (often a DV call) | Public | [LIKELY] |
| **jaoskonda viima** | Take to the station | Everyone | [LIKELY] |
| **kinni panema / kinni võtma** | To lock up / to nab | Everyone | [LIKELY] |
| **trahvi tegema / trahvi saama** | Write / get a ticket | Everyone | [LIKELY] |
| **kaamera**, **radar**, **laser** | Speed camera, radar, laser speed gun | Drivers | [LIKELY] |

---

## 4. Patrol shift routine and break terminology

### 4.1 Verified frame (from the sibling notes)

- Working time is **summeeritud tööaeg** (hours averaged over a period), including night work [VERIFIED (sibling: ppa-organisation.md §10)].
- Officers work about **48 h a week** at a station. **12-hour day and night shifts** (e.g. 07–19 and 19–07) in a 2-on/2-off-style rotation fit this [VERIFIED quote; 12 h pattern LIKELY].
- Patrol crews are usually **two officers**. The senior is the **toimkonna vanem** [VERIFIED (older source)].
- Põhja juhtimiskeskus has **teabegrupid I–IV**, which looks like a 4-crew rotation; Tallinn jaoskonnad have **patrulligrupid I–VIII** [VERIFIED (sibling)].

### 4.2 Shift timeline [LIKELY in outline; exact local practice varies]

| Phase | Estonian terms | What happens | Game hook |
|---|---|---|---|
| Arrival | **vahetuse algus**, vormi selga panemine | Change into uniform, collect kit | "shiftStart" line |
| Kit issue | **relva ja erivahendite väljastamine**, relvaruum | Service pistol, handcuffs (*käerauad*), baton (*teleskoopnui*), pepper spray (*gaasipihusti*), possibly an electroshock weapon (*elektrišokirelv*) [UNSURE whether every patrol carries one], body camera (*kehakaamera*) [UNSURE] | Equipment upgrades |
| Briefing | **instruktaaž** (shift briefing) by the välijuht or group leader | Wanted persons, stolen cars, hot spots, events of the day, special tasks | "Today's briefing" panel with BOLOs |
| Car check | **patrullauto ülevaatus**, kütus, varustus; **sideproov** (radio check) | Check car, fuel, first-aid kit, alkomeeter; log in to the terminal | Radio check at shift start |
| Patrol | **patrullimine**, **patrullteenistus**, **väljakutsed** | Respond to calls; between calls do proactive work (*omaalgatuslik töö*): traffic stops, sobriety checks (*kainuskontroll*), checking hot spots | Idle units roam (DESIGN §4.8) |
| Raids | **reid**, **massiline kainuskontroll**, **ühisreid** (joint raid with MTA or Transpordiamet) | Planned operations | Special event days |
| Breaks | **söögipaus**, **lõunapaus** (day), **öine söögipaus**, **puhkepaus** | Usually at the jaoskond or a petrol station. Often interrupted ("paus katkes"). | Break status; interruptions cost morale |
| Paperwork | **paberitöö**, **dokumenteerimine**, **protokolli vormistamine**, **seletuste võtmine**, **ettekanne**, MIS-i sisestamine | Hours of each shift; unit unavailable | "paperwork" key exists |
| Custody runs | **arestimajja toimetamine**, **konvoeerimine**, **haiglas valvamine** | Transport and guard; one call can take a crew out for 1–3 h | Transport status |
| End | **vahetuse lõpp**, **üleandmine** (handover), **relva tagastamine** | Hand over unfinished matters | "shiftEnd" key |
| Overtime | **ületunnid**, **ületunnitöö**, **lisavahetus** | A chronic complaint given the 200–300 frontline shortage [VERIFIED (sibling)] | Fatigue mechanic |

### 4.3 Break and status phrases (non-radio)

- "Läheme sööma." (Let's go eat.) / "Kas jõuame süüa?" (Will we manage to eat?) [LIKELY colloquial]
- "Paus jäi jälle vahele." (Missed the break again.) [PROPOSED]
- "Täna on rahulik öö." People often avoid saying "rahulik" aloud, the same superstition as the English "quiet" [UNSURE whether Estonian officers share it, but it makes good flavour] [PROPOSED].
- "Jaanipäev / aastavahetus / palgapäev": known busy nights [VERIFIED (sibling) for jaanipäev and New Year].

---

## 5. Press-release and news style (newspaper generator)

### 5.1 Style rules [LIKELY]

- **Time:** "kell 23.15" (period, not colon); "kella 23.15 paiku" / "kella 23 ajal" for approximate times. **Dates:** "17. oktoobril", "laupäeval", "eile õhtul", "ööl vastu pühapäeva".
- **Ages:** "34-aastane mees", "15-aastane tüdruk", "eakas naine". Names are usually **not** given for suspects, and victims are not named.
- **Places:** county → municipality → village/street: "Harjumaal Kose vallas", "Tallinnas Lasnamäel Punasel tänaval", "Tallinna–Tartu maantee 38. kilomeetril".
- **Passive voice** is very common: "teatati", "peeti kinni", "toimetati", "alustati".
- **Legal phrasing:** "kriminaalmenetlust alustati karistusseadustiku § 121 alusel, mis käsitleb kehalist väärkohtlemist" or "… kehalise väärkohtlemise tunnustel".
- **Quotes** use Estonian quotation marks **„…“**, followed by "ütles X" or "sõnas X". Per EKI style the comma goes after the closing mark: „…“, ütles ta. [LIKELY]
- **Officials named by role:** "Põhja prefektuuri pressiesindaja", "Lõuna prefektuuri välijuht", "Ida prefektuuri kriminaalbüroo juht". In the game, use invented names only.
- **Do not print real PPA phone numbers or e-mail addresses** in generated news. Use "politsei kodulehe kaudu" or "hädaabinumbril 112" (generic and safe).

### 5.2 Templates [PROPOSED wording in real style]

Placeholders: `{weekday}` (laupäeval), `{time}` (23.15), `{place_in}` (inessive, e.g. "Tallinnas Lasnamäel"), `{age}`, `{gender_noun}` (mees/naine/noormees), `{offence_gen}` (genitive, e.g. "kehalise väärkohtlemise"), `{n}`, `{county_in}` ("Harjumaal"), `{prefecture}` ("Põhja"), `{road}`, `{km}`, `{vehicle}`, `{value}`, `{name}` (fictional).

**Opening sentences**
1. "{Weekday} kell {time} teatati Häirekeskusele, et {place_in} {event_desc}."
2. "{Weekday} kella {time} paiku sai politsei teate, et {place_in} kakleb grupp noori."
3. "Ööl vastu {weekday_gen} teatati politseile, et {place_in} on sisse murtud {object_gen}."
4. "Politsei pidas {weekday} {place_in} kinni {age}-aastase {gender_gen}, keda kahtlustatakse {offence_iness}." (e.g. "kehalises väärkohtlemises", "vargustes")
5. "{Weekday} õhtul juhtus {county_in} {road} {km}. kilomeetril liiklusõnnetus, kus {vehicle} sõitis teelt välja ja paiskus vastu puud."
6. "Möödunud ööpäeval tabati liikluses {n} joobes juhti, neist {k} olid kriminaalses joobes."
7. "Nädalavahetusel reageeris politsei {prefecture} prefektuuris {n} väljakutsele, neist {k} olid seotud lähisuhtevägivallaga."
8. "Ööpäeva jooksul registreeriti {n} kuritegu, neist {k} olid kehalised väärkohtlemised ja {m} vargused."

**Body sentences**

9. "Sündmuskohale saabunud politseinikud tuvastasid, et {finding}."
10. "Politsei alustas kriminaalmenetlust {offence_gen} tunnustel."
11. "Kriminaalmenetlust alustati karistusseadustiku § {para} alusel, mis käsitleb {offence_desc}."
12. "Kriminaalmenetlust juhib {region} Ringkonnaprokuratuur." (Põhja / Lõuna / Ida / Lääne [LIKELY])
13. "{Age}-aastane {gender_noun} peeti kahtlustatavana kinni ja toimetati arestimajja."
14. "Juht eiras politseinike peatumismärguannet ja üritas põgeneda. Jälitamise käigus kaotas ta sõiduki üle kontrolli ja sõitis kraavi."
15. "Väljahingatavas õhus oli juhil alkoholi {x} milligrammi liitri kohta." (≥ 0.75 mg/l is a crime [LIKELY (sibling: law-references.md)])
16. "Õnnetuses sai viga {age}-aastane {gender_noun}, kes toimetati haiglasse."
17. "Kiirabi toimetas kannatanu haiglasse, tema elu ei ole ohus."
18. "Politsei kasutas kinnipidamisel otsest sundi."
19. "Vargad pääsesid {object_ill} akent lõhkudes ning varastasid {loot}. Kahju on umbes {value} eurot."
20. "Kahtlustatav lahkus sündmuskohalt enne politsei saabumist, politsei selgitab tema isikut."
21. "Sündmuse täpsed asjaolud selgitatakse menetluse käigus."
22. "Pommiähvardus osutus valeks. Politsei alustas kriminaalmenetlust avaliku korra raske rikkumise tunnustel." (bomb threats are handled under KarS § 263 [VERIFIED (sibling: 112 doc)])
23. "Ööpäeva jooksul toimetati kainenema {n} inimest."
24. "Teade ei leidnud kinnitust."

**Missing person (*kadunud isik*)**

25. "Politsei otsib {age}-aastast {name_part}, kes lahkus {date} {place_el} ja pole sellest ajast koju naasnud."
26. "{Name} on umbes {height} cm pikk, {build} kehaehitusega, {hair} juustega. Kodust lahkudes oli tal seljas {jacket} ja jalas {trousers}."
27. "Kõigil, kes on {name_part} näinud või teavad tema asukohta, palub politsei helistada hädaabinumbril 112."
28. "Kadunuks peetud {name} on leitud. Politsei tänab kõiki, kes otsingutele kaasa aitasid."

**Appeals and advice**

29. "Politsei palub kõigil, kes nägid sündmust või kellel on selle kohta infot, anda sellest teada."
30. "Politsei tuletab meelde, et joobes juhtimine on kuritegu ning ohustab nii juhti kui ka teisi liiklejaid."
31. "Politsei soovitab mitte avada ukse võõrastele ega anda telefoni teel oma Smart-ID või pangakoodide andmeid."

**Quotes**

32. „Joobes juht on ohtlik nii endale kui ka teistele“, ütles {prefecture} prefektuuri liiklusjärelevalve talituse juht {name}.
33. „Täname inimesi, kes märkasid ja helistasid kohe 112“, sõnas {prefecture} prefektuuri välijuht {name}.
34. „Kõigil sellistel juhtumitel tuleb helistada kohe hädaabinumbril 112, mitte oodata“, rõhutas {name}.

### 5.3 Headline patterns (ERR / regional-paper style) [PROPOSED wording in real style]

The place usually comes first, in the inessive case, then the verb, then the subject.

- "{Place_in} peeti kinni noaga ähvardanud mees"
- "Politsei tabas ööpäevaga {n} joobes juhti"
- "{County_in} hukkus liiklusõnnetuses mootorrattur"
- "{Place_in} süüdati öösel kolm prügikonteinerit"
- "Politsei otsib {place_in} kadunud {age}-aastast tüdrukut"
- "Joobes juht põgenes politsei eest ja sõitis kraavi"
- "Pommiähvardus {place_in} osutus valeks"
- "Aastavahetusel kutsuti politsei välja {n} korral"
- "Töised pühad: politsei viis kainenema {n} inimest" (models a real ERR headline [VERIFIED (sibling: 112 doc sources)])
- "Politsei argipäevik: „{snippet}“" (models a real ERR series title [VERIFIED (sibling)])

### 5.4 "Police diary" ticker snippets [PROPOSED]

These model the real ERR "Politsei argipäevik" format, which the sibling note quotes: „Tartus magavad kaks meest kiriku esikus laua peal“ [VERIFIED (sibling)].

- "Kell 01.42, Tartu: kaks meest magavad kiriku esikus laua peal." (real example, quoted above)
- "Kell 03.10, Pärnu: naaber laulab rõdul karaokes."
- "Kell 07.55, Viljandimaa: lehm jalutab maantee ääres."
- "Kell 14.20, Tallinn: poes varastati kaks pudelit viina ja vorst."
- "Kell 22.05, Kohtla-Järve: noored sõidavad mopeediga mööda kõnniteed."
- "Kell 23.40, Rakvere: mees otsib oma autot, ei mäleta, kuhu parkis."
- "Kell 00.15, Haapsalu: tuvi lendas korterisse ja ei taha lahkuda."
- "Kell 02.30, Narva: trepikojas magab tundmatu meesterahvas."

---

## 6. Russian caller utterances (Ida-Virumaa, Tallinn, Maardu)

**Context.** Russian is the mother tongue of about 28% of Estonia's population, and the share is highest in Ida-Virumaa (Narva, Sillamäe, Kohtla-Järve) [VERIFIED/LIKELY (sibling: names-demographics.md §5)]. Häirekeskus answers in Russian and English as well as Estonian [LIKELY]. Elderly callers may still say **милиция**. Local Russian borrows Estonian words and place names: Ласнамяэ, Йыхви, Кохтла-Ярве, Ахтме, Силламяэ, Маарду, "ID-карта", "Smart-ID". In Russian, Tallinn is often spelled **Таллин** (one н).

All lines are **[PROPOSED]**: natural colloquial Russian with Estonian translations.

| # | Event | Russian (caller) | Estonian translation |
|---|---|---|---|
| 1 | Knife fight | Алло, полиция? Тут драка у подъезда, человек пять, у одного нож! | Halloo, politsei? Siin kaklevad trepikoja ees, umbes viis inimest, ühel on nuga! |
| 2 | DV | Муж пьяный, бьёт меня, я заперлась в ванной, приезжайте скорее! | Mees on purjus, peksab mind, panin end vannituppa lukku, tulge kiiresti! |
| 3 | Noise | Соседи орут всю ночь, музыка гремит, уже три часа ночи, сделайте что-нибудь. | Naabrid karjuvad terve öö, muusika mürtsub, kell on juba kolm öösel, tehke midagi. |
| 4 | Car break-in | У меня из машины украли магнитолу, стекло разбито. | Mu autost varastati autoraadio, aken on puruks löödud. |
| 5 | Person down | Тут мужчина лежит на остановке, не двигается, не знаю, живой или нет. | Siin lamab bussipeatuses mees, ei liigu, ma ei tea, kas ta on elus. |
| 6 | Crash | Авария на Таллиннском шоссе, две машины, одна перевернулась! | Avarii Tallinna maanteel, kaks autot, üks läks katuse peale! |
| 7 | Drunk driver | Водитель пьяный, еле на ногах стоит, сейчас сел за руль и уехал в сторону Йыхви. | Juht on purjus, vaevu seisab jalul, istus just rooli ja sõitis Jõhvi suunas. |
| 8 | Plate | Номер машины... эм... пятьсот двенадцать, бэ, эл, ка. | Auto number... ee... viissada kaksteist, B, L, K. |
| 9 | Missing child | Ребёнок пропал, ему семь лет, ушёл гулять и не вернулся! | Laps on kadunud, ta on seitsmeaastane, läks õue ega tulnud tagasi! |
| 10 | Threat | Кто-то ломится в дверь, кричит, что убьёт! | Keegi murrab ust, karjub, et tapab! |
| 11 | Language | Я не говорю по-эстонски, можно по-русски? | Ma ei räägi eesti keelt, kas võib vene keeles? |
| 12 | Arson | Подростки подожгли мусорный бак во дворе. | Teismelised panid hoovis prügikasti põlema. |
| 13 | Harassment | У магазина какой-то мужик пристаёт к людям, требует деньги. | Poe juures tüütab mingi mees inimesi, nõuab raha. |
| 14 | Phone fraud | Мне позвонили, сказали, что из банка, и я назвала коды от Smart-ID... | Mulle helistati, öeldi, et pangast, ja ma ütlesin oma Smart-ID koodid... |
| 15 | Welfare check | Сосед-старик уже три дня не открывает, из квартиры запах. | Eakas naabrimees pole kolm päeva ust avanud, korterist tuleb haisu. |
| 16 | Suspect description | Он убежал в сторону леса, в чёрной куртке, с капюшоном. | Ta jooksis metsa poole, musta jopega, kapuuts peas. |
| 17 | Shots | Стреляли! Я слышал два выстрела во дворе! | Tulistati! Kuulsin hoovis kaht lasku! |
| 18 | Address | Улица... как её... Кренгольми, дом десять, третий подъезд. | Tänav... kuidas ta oligi... Kreenholmi, maja kümme, kolmas trepikoda. |
| 19 | Suicide threat | Он угрожает, что выпрыгнет с балкона, пятый этаж! | Ta ähvardab, et hüppab rõdult alla, viies korrus! |
| 20 | Lost elderly | Тут бабушка заблудилась, не помнит, где живёт. | Siin on üks vanaema ära eksinud, ei mäleta, kus ta elab. |
| 21 | Drunk | Да не надо скорую, просто заберите его, он пьяный в стельку. | Kiirabi pole vaja, viige ta lihtsalt ära, ta on täiesti täis. |
| 22 | Dog attack | Собака без намордника кидается на детей, а хозяину всё равно! | Suukorvita koer kargab lastele kallale, aga omanikku see ei huvita! |
| 23 | Suspicious car | Машина стоит с работающим мотором уже час, внутри кто-то спит. | Auto seisab juba tund aega mootor töötamas, sees keegi magab. |
| 24 | Hit-and-run | Я свидетель, я всё видел, он сбил женщину и уехал! | Ma olen pealtnägija, nägin kõike, ta sõitis naisele otsa ja sõitis minema! |
| 25 | Drugs | Милиция? Ой, полиция... у нас опять эти наркоманы в подъезде. | Miilits? Oi, politsei... meil on jälle need narkomaanid trepikojas. |
| 26 | Not breathing | Пожалуйста, быстрее, он не дышит! | Palun kiiremini, ta ei hinga! |
| 27 | Border (Narva river) | Какие-то люди перешли границу у реки, я с огорода видел. | Mingid inimesed tulid jõe ääres üle piiri, nägin oma aiamaalt. |
| 28 | Robbery | Меня ограбили, вырвали сумку и убежали к Астри! | Mind rööviti, tõmmati kott käest ja jooksid Astri keskuse poole! (Astri is a shopping centre in Narva [LIKELY]) |
| 29 | Drowning | Человек тонет! В Силламяэ, на пляже! | Inimene upub! Sillamäel, rannas! |
| 30 | Request | Пришлите кого-нибудь, кто говорит по-русски. | Saatke keegi, kes räägib vene keelt. |

**Dispatcher replies in Russian** (a call taker or officer switching language) [PROPOSED]:

| Russian | Estonian | English |
|---|---|---|
| Назовите, пожалуйста, точный адрес. | Öelge palun täpne aadress. | Please give the exact address. |
| Что случилось? | Mis juhtus? | What happened? |
| Есть пострадавшие? | Kas on vigastatuid? | Is anyone hurt? |
| У него есть оружие? | Kas tal on relv? | Does he have a weapon? |
| Оставайтесь на линии. | Jääge liinile. | Stay on the line. |
| Патруль уже едет. | Patrull on juba teel. | A patrol is on its way. |
| Закройтесь и не открывайте дверь. | Pange end lukku ja ärge avage ust. | Lock yourself in and don't open the door. |
| Как он выглядит? Во что одет? | Kuidas ta välja näeb? Mis tal seljas on? | What does he look like? What is he wearing? |

**Police commands in both languages** (on-scene shouts) [LIKELY]:

| Estonian | Russian | English |
|---|---|---|
| Politsei! Seis! | Полиция! Стоять! | Police! Stop! |
| Käed üles! | Руки вверх! | Hands up! |
| Näita käsi! | Покажи руки! | Show your hands! |
| Pikali! / Maha! | На землю! / Лежать! | Get down! |
| Relv maha! | Брось оружие! | Drop the weapon! |
| Käed selja taha! | Руки за спину! | Hands behind your back! |
| Ära liiguta! | Не двигаться! | Don't move! |

---

## 7. Panicked Estonian caller lines (112-style)

All lines are **[PROPOSED]** (fictional). The style is [LIKELY]: short bursts, repetition, "palun", "appi", "issand", fillers like "ee" and "oot", details in the wrong order, and an address given late. Häirekeskus takes 112 calls and forwards police events to the juhtimiskeskus [VERIFIED (sibling: 112-and-priorities.md)].

| # | Event type | Estonian | English |
|---|---|---|---|
| 1 | Domestic violence | Palun tulge kiiresti, ta lööb mind... ta on purjus, ma olen lapsega magamistoas, uks on lukus! | Please come quickly, he's hitting me... he's drunk, I'm in the bedroom with my child, the door is locked! |
| 2 | Burglary in progress | Keegi on meie majas! Ma kuulen, kuidas all klaas puruneb, me oleme teisel korrusel, palun! | Someone's in our house! I hear glass breaking downstairs, we're upstairs, please! |
| 3 | Traffic accident | Siin on avarii, auto on katusel kraavis, keegi on sees ja ei liigu... Tartu maantee, Kose juures! | There's a crash, the car is on its roof in the ditch, someone's inside and not moving... Tartu road, near Kose! |
| 4 | Knife fight | Nad kaklevad poe ees, ühel on nuga, üks mees juba lamab maas, verd on nii palju! | They're fighting outside the shop, one has a knife, a man is already on the ground, there's so much blood! |
| 5 | Missing child | Mu poeg on kadunud! Ta oli just siin mänguväljakul, viieaastane, punane jope... ma ei leia teda! | My son is missing! He was just here at the playground, five years old, red jacket... I can't find him! |
| 6 | Drunk driver | Mu ees sõidab üks auto täiesti siksakis, ühest servast teise... number on, oot, kolm-neli-null, ee-emm-tee! | The car ahead is weaving all over, edge to edge... the plate is, wait, 340 EMT! |
| 7 | Street robbery | Mind rööviti just! Kaks noort kiskusid koti käest ja jooksid Viru keskuse poole! | I've just been robbed! Two young guys tore my bag away and ran towards Viru Centre! |
| 8 | Shots fired | Ma kuulsin laske, kolm-neli pauku, metsa poolt, siin on suvilad ja lapsed on õues! | I heard shots, three or four bangs, from the woods, there are summer cottages here and kids outside! |
| 9 | Suicide threat | Mu vend saatis sõnumi, et ta tapab end ära, ta ei vasta telefonile, ta elab üksi Mustamäel! | My brother texted that he's going to kill himself, he isn't answering, he lives alone in Mustamäe! |
| 10 | Fire / smoke | Trepikoda on suitsu täis, keegi pani prügi põlema, ma ei saa välja! | The stairwell is full of smoke, someone set rubbish on fire, I can't get out! |
| 11 | Escalated row | Naabrid on kolm tundi karjunud, nüüd oli kõva karje ja nagu midagi kukkus... ja nüüd on täiesti vaikne. | The neighbours have been shouting for three hours, now there was a loud scream and something fell... and now it's completely silent. |
| 12 | Hit-and-run | Üks auto sõitis jalgratturile otsa ja lihtsalt sõitis minema! Hall universaal, ma ei näinud numbrit! | A car hit a cyclist and just drove off! Grey estate car, I didn't see the plate! |
| 13 | Missing elderly | Mu ema läks hommikul poodi ja pole tagasi tulnud, tal on dementsus, ta on kaheksakümmend kaks... | My mother went to the shop this morning and hasn't come back, she has dementia, she's 82... |
| 14 | Restraining order breach | Mu endine mees seisab maja ees, tal on lähenemiskeeld, ta karjub, et tuleb sisse! | My ex-husband is standing outside, he has a restraining order, he's shouting that he's coming in! |
| 15 | Fraud in progress | Mulle helistas keegi, ütles, et on politseinik, ja käskis raha üle kanda... ma juba kandsin kaks tuhat... kas see oli pettus? | Someone called saying he was a police officer and told me to transfer money... I already sent two thousand... was it a scam? |
| 16 | Road rage | Üks auto ajab mind taga, sõidab mulle tagant sisse, ma olen Pärnu maanteel, mida ma teen?! | A car is chasing me, ramming me from behind, I'm on Pärnu road, what do I do?! |
| 17 | Drowning | Appi, keegi upub! Pirita rannas, ta oli just vees ja nüüd teda pole! | Help, someone's drowning! At Pirita beach, he was just in the water and now he's gone! |
| 18 | Weapon at school | Koolis on üks poiss, kes näitas püstolit, kõik lapsed on klassides kinni, palun tulge! | A boy at school showed a gun, all the kids are locked in the classrooms, please come! |
| 19 | Overdose | Ta ei hinga... ta süstis midagi, huuled on sinised, mida ma teen?! | He's not breathing... he injected something, his lips are blue, what do I do?! |
| 20 | Ice floe | Kalamehed on jääpangal ja pank triivib ära! Peipsil, Mustvee juures, neid on vist kümme! | The fishermen are on an ice floe and it's drifting off! On Peipus, near Mustvee, there are maybe ten of them! |
| 21 | Shoplifter / guard | Turvatöötaja siin, hoiame poevarast kinni, ta läheb agressiivseks, tal on süstal käes! | Security guard here, we're holding a shoplifter, he's getting aggressive, he has a syringe! |
| 22 | Car theft | Mu auto on läinud! Ma parkisin selle siia tund aega tagasi ja nüüd teda lihtsalt pole! | My car is gone! I parked it here an hour ago and now it's just not there! |

**Filler and urgency words to sprinkle in** [LIKELY]: *appi*, *issand jumal*, *palun palun*, *kiiresti*, *ma ei tea*, *oot-oot*, *ee*, *noh*, *kuulge*, *ta tuleb*, *ma kardan*, *mis ma teen*.

---

## 8. Open questions and uncertainties

1. **Real PPA radio procedure:** whether patrols use "Lõpp", "Vastuvõtt" or "Siin …", whether the call is "Juhtimine" or "Juhtimiskeskus", and what the status codes are. None of it is public. Everything in §1 is natural phrasing, not a record of practice.
2. **Spelling alphabet:** no national Estonian police/rescue spelling alphabet could be confirmed. If one exists, for example in an internal PPA or Häirekeskus manual, it would replace the §2.2 [PROPOSED] table.
3. **Call signs:** still invented (see `ppa-organisation.md` §9).
4. **"ATS" and "kollane":** no known police meaning. The brief may have been guessing.
5. **Equipment** (electroshock weapons and body cameras on every patrol): unconfirmed.
6. **How Häirekeskus answers** the phone (exact greeting): unconfirmed. Use a neutral "Häirekeskus, kuulan." [PROPOSED]
7. **No web search ran for this note** (shared budget exhausted). Re-check on a later pass: (a) ERR/politsei.ee press phrasing, which is already strongly matched from memory; (b) any PPA radio-procedure mention in Riigi Teataja (e.g. a *raadioside kord*); (c) an Estonian spelling alphabet.

---

## 9. Sources

No new sources were retrieved for this note (search budget exhausted, WebFetch blocked). The facts tagged [VERIFIED (sibling)] come from sources cited in:

- `docs/research/ppa-organisation.md`: ESTER network (§8), call signs (§9), command centres (§4), staffing and shifts (§10), detention facilities, livery
- `docs/research/112-and-priorities.md`: dispatch chain, Alfa/Bravo/Charlie priorities, glossary (§6), LSV and viibimiskeeld (§8). ERR headlines used as style models:
  - ERR: Töised pühad: politsei viis kainenema 90 inimest…: https://www.err.ee/1609380005/toised-puhad-politsei-viis-kainenema-90-inimest-ule-saja-perevagivalla-juhtumi
  - ERR: Politsei argipäevik: „Tartus magavad kaks meest kiriku esikus laua peal“: https://www.err.ee/614809/politsei-argipaevik-tartus-magavad-kaks-meest-kiriku-esikus-laua-peal
  - ERR: Politsei kutsuti aastavahetusel lähisuhtevägivalla tõttu välja 48 korral: https://www.err.ee/1609209298/politsei-kutsuti-aastavahetusel-lahisuhtevagivalla-tottu-valja-48-korral
  - ERR: Riigikogu andis politseile õiguse kehtestada kuni 72-tunnine viibimisekeeld: https://www.err.ee/1609971083/riigikogu-andis-politseile-oiguse-kehtestada-kuni-72-tunnine-viibimisekeeld
- `docs/research/law-references.md`: väärtegu/kuritegu, fine unit, alcohol thresholds, peatumismärguande eiramine
- `docs/research/vehicles-plates.md`: plate format and the vehicle-query reply table
- `docs/research/names-demographics.md`: share of Russian speakers
