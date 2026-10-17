# PPA organisation (2024–2026): research notes for EPD

Research notes for **EPD**, an unofficial, fan-made Estonian police dispatch simulator. They cover the **Politsei- ja Piirivalveamet (PPA)**, Estonia's Police and Border Guard Board, as of 2024–2026.

Compiled 2026-10-17. WebFetch was blocked, so every fact comes from web-search result snippets plus prior knowledge. The search budget ran out before the end, so some items (rank insignia, Kärdla/Võru addresses, siren tones) could not be checked again.

**Confidence tags**

- **[VERIFIED]**: seen in search results (ERR, politsei.ee staff/contact pages, riigikogu.ee, riigiteataja.ee, oiguskantsler.ee, PPA documents in the public document register).
- **[LIKELY]**: strong prior knowledge that the results did not contradict.
- **[UNSURE]**: plausible but unconfirmed. Treat as placeholder or flavour.
- **[ESTIMATE]**: my own derivation from verified numbers. Use it for game balancing, never present it as fact.

> **Branding caution (domain politsei.eu):** PPA's official site is **politsei.ee**. A game served at `politsei.eu` sits one TLD away from it, so the game must say clearly that it is unofficial and fan-made. Do not use the PPA logo, coat of arms, badge artwork or official contact numbers in a way that could pass for the real service. Keep 112 as the "real emergency" reference with a disclaimer.

---

## 0. Quick reference

| Item | Value | Conf. |
|---|---|---|
| Agency | Politsei- ja Piirivalveamet (PPA). Formed 1 Jan 2010 by merging Politseiamet, Piirivalveamet and Kodakondsus- ja Migratsiooniamet. Sits under Siseministeerium. | VERIFIED |
| National HQ | Pärnu mnt 139, 15060 Tallinn (same building as Põhja prefektuur) | VERIFIED |
| Director General (peadirektor) | Egert Belitšev | VERIFIED (named as police chief) |
| Deputy DG, border guard | Veiko Kommusaar | VERIFIED |
| Regional units | 4 prefectures (prefektuurid): Põhja, Ida, Lõuna, Lääne | VERIFIED |
| Emergency number | 112, answered by **Häirekeskus** (a separate agency, the Emergency Response Centre). The police short number 110 stopped working on 1 March 2020. | VERIFIED |
| State helpline | 1247 | VERIFIED |
| Staff | About 5,000 employees in total; frontline shortage of 200–300 | VERIFIED |
| Patrol crew | 2 officers. The senior officer is *toimkonna vanem*. | VERIFIED (older source), LIKELY current |
| Radio | Estonia's TETRA network is **ESTER**, not VIRVE (VIRVE is Finland's network). See §8. | VERIFIED |

---

## 1. Prefectures, counties, HQs

| Prefecture | Counties (maakonnad) | HQ city | HQ address | Prefect (2025–26) | Conf. |
|---|---|---|---|---|---|
| **Põhja prefektuur** (North) | Harju maakond, including Tallinn | Tallinn | Pärnu mnt 139, Tallinn | Ats Kübarsepp (signed orders late 2025; base salary set from 1 Jan 2026) | VERIFIED |
| **Ida prefektuur** (East) | Ida-Viru maakond, Lääne-Viru maakond | Jõhvi | Rahu tn 38, 41588 Jõhvi | Tarvo Kruup (named in a 2024 presentation) | VERIFIED name; current tenure LIKELY |
| **Lõuna prefektuur** (South) | Tartu, Jõgeva, Põlva, Valga, Võru, Viljandi maakond | Tartu | Riia tn 132, 50096 Tartu. A new PPA building is planned at Kalda tee 5/11 (Annelinn, up to 6 storeys); the detailed plan was adopted, but there is no construction date. The Riia street building dates from the early 1970s and is rented. | Vallo Koppel (quoted as Lõuna prefect in 2026) | VERIFIED |
| **Lääne prefektuur** (West) | Pärnu, Lääne, Saare, Hiiu, Rapla, Järva maakond | Pärnu | Joint security building at the corner of Riia mnt and A. H. Tammsaare pst. Pärnu jaoskond is at A. H. Tammsaare pst 61; the operatiivkeskus is at A. H. Tammsaare pst 70, 80042 Pärnu. | Argo Tali (signed orders Aug 2025) | VERIFIED |

**County-to-prefecture mapping**: confirmed by a PPA procurement document [VERIFIED]:
- Põhja = Harju
- Ida = Ida-Viru + Lääne-Viru
- Lõuna = Jõgeva, Viljandi, Tartu, Põlva, Valga, Võru
- Lääne = Pärnu, Rapla, Lääne, Hiiu, Saare, Järva

**Extra main tasks per prefecture** (PPA statute amendment, in force 1 July 2025) [VERIFIED]:
- Ida and Lõuna: detect and clean up pollution on **border waters**, mainly Lake Peipus (Peipsi), Lämmijärv, Narva river and Pihkva.
- Lääne: take part in detecting sea pollution and guarding the sea border.
- Põhja: protect protected persons and guard designated objects. Personal protection moved from Keskkriminaalpolitsei to Põhja prefektuur's *julgestusbüroo*.

**Approximate population, for weighting call volume** [LIKELY, rounded, about 2024–25; check stat.ee if exact figures matter]:

| County | Pop. | Prefecture |
|---|---|---|
| Harju (Tallinn about 455k) | about 620k | Põhja |
| Tartu | about 160k | Lõuna |
| Ida-Viru | about 128k | Ida |
| Pärnu | about 87k | Lääne |
| Lääne-Viru | about 59k | Ida |
| Viljandi | about 45k | Lõuna |
| Võru | about 35k | Lõuna |
| Rapla | about 34k | Lääne |
| Saare | about 31k | Lääne |
| Järva | about 30k | Lääne |
| Valga | about 28k | Lõuna |
| Jõgeva | about 27k | Lõuna |
| Põlva | about 24k | Lõuna |
| Lääne | about 20k | Lääne |
| Hiiu | about 9.5k | Lääne |

Põhja handles roughly 45% of Estonia's population. Expect the same share of call load or more.

**Structural history (for lore)** [VERIFIED]:
- 2010: PPA founded.
- 1 Jan 2012: the prefectures lost their status as independent police authorities and management was centralised.
- 2014: service-based management model.
- About 2020: border guard turned into a separate unit inside PPA.
- Jan 2023: the four large PPA ships moved to the Navy.
- 2021 and 2025: arrest-house functions moved to prisons (§3).
- 2025: VIP protection moved to Põhja.

---

## 2. Police stations (politseijaoskonnad) and district groups

Structure inside a prefecture:
- **politseijaoskond** (police station / department), which contains:
  - **patrullitalitus** (patrol service), split into **patrulligrupp I…VIII**
  - **piirkonnagrupp** (community/district policing group)
  - **menetlustalitus / menetlusgrupp / uurimisgrupp** (case processing and investigation)
  - sometimes a **liiklusgrupp** (traffic) or **lubadegrupp** (permits)

The prefecture also has bureaus (*büroo*): **operatiivbüroo** (which holds the command centre), **teabebüroo**, **kriminaalbüroo**, **piirivalvebüroo** and others. [VERIFIED structure from politsei.ee contact pages]

Staff-page addresses are where officers sit, which is usually but not always the public station. PPA public service halls (*teenindussaalid*) in 11 towns were cut to 3 days a week [VERIFIED, ERR], so some towns have a part-time desk rather than a full station.

### 2.1 Põhja prefektuur (Harju county, Tallinn)

Two jaoskonnad cover all of Harju [VERIFIED].

| Unit | Address | Notes | Conf. |
|---|---|---|---|
| **Ida-Harju politseijaoskond** | P. Pinna tn 4, Lasnamäe, Tallinn | Has patrullitalitus with **patrulligrupp I–VIII**, a menetlustalitus (isikuvastaste süütegude menetlusgrupp, tänavasüütegude menetlusgrupp) and three district groups (rows below). | VERIFIED |
| ↳ Kesklinna piirkonnagrupp | P. Pinna tn 4 (staff address) | Kesklinn and the Old Town. There was a separate **Kesklinna politseijaoskond** until the late 2010s; its patrol chief Taavi Kirss was quoted by ERR. It is now a district group under Ida-Harju. | VERIFIED; merge date UNSURE |
| ↳ Ida-Tallinna piirkonnagrupp | P. Pinna tn 4 | Covers Lasnamäe and Pirita | VERIFIED group; area LIKELY |
| ↳ Ida-Harju piirkonnagrupp | Office at Hariduse tn 1, Kose alevik | Covers eastern rural Harju: Maardu, Rae, Jõelähtme, Kose, Raasiku, Anija (Kehra), Kuusalu | VERIFIED office; area LIKELY |
| **Lääne-Harju politseijaoskond** | Rahumäe tee 6/1, Kristiine, Tallinn | Has patrullitalitus with **patrulligrupp I–VIII** and four district groups (rows below). An older court ruling mentions a Põhja prefecture arrest house at Rahumäe tee 6. | VERIFIED |
| ↳ Põhja-Tallinna piirkonnagrupp | Kolde pst 65, Põhja-Tallinn | Covers Kalamaja, Kopli, Pelguranna and Merimetsa | VERIFIED address |
| ↳ Mustamäe-Kristiine piirkonnagrupp | (Kolde pst 65 listed for one officer) | | VERIFIED |
| ↳ Nõmme-Haabersti piirkonnagrupp | — | | VERIFIED group |
| ↳ Lääne-Harju piirkonnagrupp | Office at Päästekeskuse tee 1, Tammemäe küla, Saku vald | Covers western and southern rural Harju: Keila, Saue, Harku, Saku, Kiili, Lääne-Harju (Paldiski), Kernu | VERIFIED office; area LIKELY |
| Operatiivbüroo / **juhtimiskeskus** | Osmussaare tn 2, Lasnamäe, Tallinn | Regional command centre; see §4 | VERIFIED |
| Teabebüroo / **kinnipidamiskeskus** | Linnaaru tee 5/1, Soodevahe küla, Rae vald | Detention centre; see §3 | VERIFIED |
| Julgestusbüroo | (Tallinn) | Protects persons and guards objects | VERIFIED |
| Piirivalvebüroo | Pärnu mnt 139 | Border control at Tallinn port and airport; temporary-protection (Ukraine) procedures | VERIFIED |

### 2.2 Ida prefektuur (Ida-Viru and Lääne-Viru)

Three jaoskonnad plus a piirivalvebüroo [VERIFIED].

| Unit | Address | Notes | Conf. |
|---|---|---|---|
| **Narva politseijaoskond** | Vahtra tn 3, Narva (staff pages) | Menetlusgrupp I–III; Sillamäe piirkonnagrupp; "Narva teenindus" service desk | VERIFIED (address from search snippet) |
| ↳ Sillamäe piirkonnagrupp | Sillamäe | | VERIFIED group |
| **Jõhvi politseijaoskond** | Rahu tn 38, Jõhvi (prefecture HQ) | Patrullitalitus, Jõhvi piirkonnagrupp, Kohtla-Järve piirkonnagrupp, liiklusgrupp, lubadegrupp, menetlusgrupp II | VERIFIED units; address LIKELY |
| ↳ Kohtla-Järve office | Järveküla tee 40, Kohtla-Järve | | VERIFIED |
| ↳ Kiviõli | Joint police and rescue building, planned to open spring 2023 | | VERIFIED plan |
| **Rakvere politseijaoskond** | F. R. Kreutzwaldi tn 5A, Rakvere | Patrullitalitus with **patrulligrupp I–V**; Rakvere piirkonnagrupp | VERIFIED |
| ↳ Tapa office | Pikk tn 18A, Tapa | | VERIFIED |
| ↳ Kunda, Haljala, Väike-Maarja, Tamsalu, Vinni | Community police offices | Probably part-time | UNSURE |
| **Piirivalvebüroo** | Jõhvi | Has a teabeseiretalitus (surveillance). Field units: **Narva kordon** and **Narva piiripunkt**. **Mustajõe kordon** (Narva-Jõesuu) is closed. **Alajõe teeninduskoht** (Peipus shore) closed to save €80k a year. | VERIFIED |

### 2.3 Lõuna prefektuur (Tartu, Jõgeva, Põlva, Valga, Võru, Viljandi)

Three jaoskonnad [VERIFIED from a 2020 order, 2024–2026 staff pages and a 2026 page].

| Unit | Address | Notes | Conf. |
|---|---|---|---|
| **Tartu politseijaoskond** | Riia tn 132, Tartu (prefecture building) | Groups for Tartu city, **Elva** and **Jõgeva**. Jõgeva county is served through Tartu jaoskond. | VERIFIED groups; address LIKELY |
| **Kagu politseijaoskond** | Has three district groups (rows below) | Covers Põlva, Valga and Võru counties | VERIFIED |
| ↳ Põlva piirkonnagrupp | Võru tn 12, Põlva | | VERIFIED |
| ↳ Valga piirkonnagrupp | Puiestee tn 4, Valga | | VERIFIED |
| ↳ Võru piirkonnagrupp | Võru (street not found) | Likely the jaoskond's main seat | UNSURE address |
| **Viljandi politseijaoskond** | Pargi tn 1, Viljandi | Piirkonnagrupp for Viljandi county | VERIFIED |
| Operatiivbüroo / **juhtimiskeskus** | Jaama tn 207, Tartu. The head is listed as Ottomar Virk. | Operatiivbüroo itself is at Riia 132 | VERIFIED |
| Border (south-east) | **Koidula** piiripunkt (Põlva county, road and rail), **Luhamaa** piiripunkt (Võru county, road). Saatse area. | Kordonid such as Värska, Piusa, Meremäe and Mehikoorma/Räpina are from memory | VERIFIED crossings; kordon list UNSURE |

### 2.4 Lääne prefektuur (Pärnu, Lääne, Saare, Hiiu, Rapla, Järva)

Five jaoskonnad [VERIFIED].

| Unit | Address | Notes | Conf. |
|---|---|---|---|
| **Pärnu politseijaoskond** | A. H. Tammsaare pst 61, Pärnu | Patrullitalitus; **merepääste- ja piirikontrolligrupp** (sea rescue and border control); patrol boat *Terje* | VERIFIED |
| **Haapsalu politseijaoskond** | Lossiplats 4, 90502 Haapsalu | Head Andrei Taratuhin; patrol and case-processing groups. The Haapsalu sea rescue unit was abolished; volunteers and Kärdla now cover that sea area. | VERIFIED |
| **Kuressaare politseijaoskond** | Transvaali tn 58, Kuressaare (menetlusgrupp office) | **Merepääste- ja patrulligrupp**; patrol boat *Tuul* patrols the Saaremaa area | VERIFIED |
| **Kärdla politseijaoskond** | Kärdla (street not found) | Piirkonna- ja menetlusgrupp; **merepääste- ja patrulligrupp I/II** | VERIFIED units; address UNSURE |
| **Kesk-Eesti politseijaoskond** | Savi tn 2, Rapla (head's office) | Has Rapla and Paide groups (rows below) and its own patrullitalitus | VERIFIED |
| ↳ Paide | Tallinna tn 12, Paide | Paide menetlusgrupp | VERIFIED |
| ↳ Rapla | Savi tn 2, Rapla | | VERIFIED |
| Operatiivbüroo / **operatiivkeskus** | A. H. Tammsaare pst 70, 80042 Pärnu. The head is listed as Meelis Peiker. | Named *operatiivkeskus*, not *juhtimiskeskus* | VERIFIED |

---

## 3. Custody: arrest houses, sobering-up, prisons

### 3.1 Background numbers (historic, about 2020)
- PPA ran **14 arrest houses with 639 places** in total [VERIFIED, Riigikogu bill memo]. Per region:

  | Region | Places |
  |---|---|
  | Põhja | 172 (including the Tallinn sobering-up house) |
  | Ida | 199 |
  | Lõuna | 141 |
  | Lääne | 127 |

- Jõhvi arrest house: 157 places, but only 5–10% used. Tartu arrest house: 64 places, about 20% used. [VERIFIED]

### 3.2 Reforms: arrest-house work moved to prisons
- **Tartu and Ida-Viru** [VERIFIED law text; start date LIKELY Jan 2021]: Tartu and Jõhvi arrest-house functions moved to **Tartu Vangla** and **Viru Vangla**. Vangistusseadus § 172⁷ lets these two prisons hold:
  - people serving misdemeanour arrest
  - people detained for up to 48 hours
  - people under compelled appearance (*sundtoomine*)
  - **intoxicated people brought in to sober up**

  The old arrest-house buildings were not handed to the prisons.
- **Tallinn, from 1 April 2025** [VERIFIED as law and plan; implementation LIKELY]: Põhja prefektuur's arrest house tasks (arrest, 48-hour detention, remand, compelled appearance) moved to **Tallinna Vangla**. **Sobering-up was explicitly excluded** and stays with PPA (Interior Ministry area) at the **Tallinna kainestusmaja**. The change saved Põhja prefektuur €371,087 a year.
- An Interior Ministry proposal (about 2020) would have shifted transport of non-aggressive drunks to local governments. Adoption was not confirmed, so assume police still do it [VERIFIED proposal; outcome UNSURE].

### 3.3 Facility list for the game

| Facility | Location | Who goes there (game logic) | Conf. |
|---|---|---|---|
| **Tallinna Vangla** (prison, includes eelvangistusosakond and avavangla) | **Linnaaru tee 5, Soodevahe küla, Rae vald, 75322**. On the Tallinn/Rae border off Lagedi tee; bus 160, stop "Vangla". Opened 2018, replacing Magasini street. | Arrested and detained people from the Tallinn/Harju area (since Apr 2025) | VERIFIED |
| **Põhja prefektuuri kinnipidamiskeskus** | Linnaaru tee 5/1, Soodevahe (next to the prison) | PPA detention centre: valvegrupp I–III, konvoeerimisgrupp (escort), teabegrupp, kainestusmaja grupp. Head Remo Tänav. | VERIFIED |
| ↳ Konvoeerimisgrupp office | Lubja tn 4, Tallinn (Harju Maakohus courthouse) | Escorts detainees to court | VERIFIED |
| **Tallinna kainestusmaja** (sobering-up house) | Group leader's office is at **Merelahe tee 4**, Põhja-Tallinn. A 2013 photo labelled "Tallinna kainestusmaja" is filed under Merimetsa. | Drunks from Tallinn and Harju. A health worker assesses them on arrival. **About 6,000 sobering-ups a year** in Põhja prefecture. Group leader: politseimajor Margus Trees. | VERIFIED office/group; site LIKELY |
| **Tartu Vangla** | Turu 56, 51013 Tartu | Arrested, 48-hour and sobering-up cases from Lõuna prefecture. Half its places were cut; a plan to rent places to Sweden is under discussion. | VERIFIED |
| **Viru Vangla** | Ülesõidu 1, 41536 Jõhvi | Arrested, 48-hour and sobering-up cases from Ida-Viru | VERIFIED |
| **Pärnu arestimaja** | Pärnu | Lääne prefecture's main arrest house; also takes sobering-up cases. The Chancellor of Justice inspected it in April 2023. | VERIFIED |
| Small arrest cells (*arestimaja kambrid*) | Haapsalu, Kärdla, Paide, Viljandi, Võru, Valga (a new Valga arrest house was planned for 2021) | Short holds before transfer | VERIFIED via Chancellor inspection reports; current operation of each UNSURE |
| Rakvere, Narva, Kuressaare cells | — | Short holds | UNSURE |
| **Harku kinnipidamiskeskus** | Harku vald | Immigration detention for people being deported; not for drunks or arrests | LIKELY |

**Legal hooks** [LIKELY unless marked]:
- Sobering-up is regulated by the Korrakaitseseadus (KorS). One search source cites **KorS § 42** for taking a person to sober up; § 44 is about *viibimiskeeld* (an order to stay away from a place).
- The person must be a danger to themselves or others, or at risk of becoming a crime victim, because of intoxication. Grounds include aggression, marked loss of coordination, or inability to orient or move [VERIFIED from a court ruling quoting older law].
- Maximum stay is "until sober, capped by law". The exact cap (24 hours?) is UNSURE.
- Criminal detention as a suspect lasts up to **48 hours** under the Kriminaalmenetluse seadustik (KrMS) [LIKELY].

---

## 4. Command and dispatch

### 4.1 Call flow (game core loop)
1. The caller dials **112**. **Häirekeskus** answers; it handles about 1 million calls a year and has regional centres. [VERIFIED]
2. Häirekeskus classifies the call and **passes police events to PPA**. Rescue and ambulance are dispatched by Häirekeskus itself. [VERIFIED]
3. The prefecture's **juhtimiskeskus** (Lääne: **operatiivkeskus**) assigns a resource. [VERIFIED]
   - The **operatiivinfo haldur** (dispatcher) does *"väljakutsete edastamine reageerivale ressursile ning neile nende tööks vajaliku informatsiooni saamine"*: passing the call to the responding unit and getting the information it needs.
   - The dispatcher also keeps the live incident picture, runs background checks before sending units (Lõuna job description), and can start a procedure to locate a person's phone when there is heightened danger.
4. In the field, the **välijuht** (field commander or shift supervisor) or the **rühmajuht** (team leader) leads the patrols. Patrol officers report to them. [VERIFIED]

Information systems named in a 2026 PPA document [VERIFIED]:
- **SOS**: Häirekeskus's emergency system.
- **KILP**: PPA's operational system.
- Navy systems.

### 4.2 Command centres (as listed on politsei.ee, 2024–2026)

| Prefecture | Centre | Address | Internal structure | Conf. |
|---|---|---|---|---|
| Põhja | Juhtimiskeskus (operatiivbüroo) | Osmussaare tn 2, Lasnamäe, Tallinn | Head ("keskuse juht"): Katrin Laasik. **Teabegrupp I–IV**, which looks like four rotating shift crews, each with a *grupijuht* (for example politseikapten Ivar Kärner) and several *operatiivinfo haldurid*. Also acts as the **RCC** (regional coordination centre) for border surveillance, coordinating the local **LCCs** in the EUROSUR model. Handles PPA's international information exchange. | VERIFIED |
| Lõuna | Juhtimiskeskus | Jaama tn 207, Tartu | Head: Ottomar Virk. Teabegrupid (at least III). | VERIFIED |
| Lääne | Operatiivkeskus | A. H. Tammsaare pst 70, Pärnu | Head: Meelis Peiker | VERIFIED |
| Ida | No juhtimiskeskus page was found, although the operatiivbüroo exists | Jõhvi? | Ida-Viru may be dispatched from Jõhvi or from the Tallinn centre | UNSURE |

The Tartu centre (Jaama 207) is probably in the same building as the Lõuna rescue centre and Häirekeskus. Osmussaare 2 may also be a joint emergency-services building. [UNSURE]

### 4.3 Job titles inside the centre (Nov 2024 job descriptions) [VERIFIED]
- **operatiivinfo haldur**: dispatcher / operations information handler.
- **ekspert (juhtimiskeskuse vahetuse vanem)**: shift senior. This is effectively the duty officer for the shift.
- **grupijuht**: shift group leader (rank around politseikapten).
- **rakendusekspert**: systems and quality expert (not live dispatch).
- **keskuse juht**: head of the centre.

On older terms: "**operatiivkorrapidaja**" (operational duty officer) and "**korrapidaja**" are traditional names you will still hear informally. Current PPA job titles in search results use the names above instead [UNSURE whether "operatiivkorrapidaja" exists formally today]. "**Operatiivjuht**" did not appear in current titles [UNSURE]. For the game, *vahetuse vanem* or *operatiivkorrapidaja* both work as the player's boss title.

### 4.4 Other national centres [VERIFIED]
- **JRCC Tallinn**, also called the *merevalvekeskus* or "Air and Maritime Security Centre". It is PPA's joint rescue coordination centre for sea and air search and rescue in Estonia's SAR region, handles border-water pollution and keeps a 24/7 watch on distress radio channels.
- **PPA liiklusjärelevalvekeskus**: national traffic enforcement centre. Its head is Taavi Kirss, and it has its own *välijuht* (for example Marek Vähi).
- **Keskkriminaalpolitsei (KKP)**: national criminal police.

### 4.5 Centralisation reforms
- Searches found **no announced single national police dispatch centre** as of 2026. Each prefecture still has its own centre. [VERIFIED by absence; UNSURE overall]
- Centralisation steps so far:
  - 110 was folded into 112 (calls stopped in 2015, the number was switched off 1 Mar 2020).
  - The prefectures lost their independent status in 2012.
  - Border guard became a separate unit around 2020.
  - Arrest houses moved to prisons.
  - The fleet moved to the Navy in 2023.

---

## 5. Unit types

| Unit (Estonian) | What it is | Numbers / facts | Conf. |
|---|---|---|---|
| **Patrullpolitsei** (patrullitalitus) | General response patrols in each jaoskond: answering calls, public order, misdemeanours, traffic, guarding detainees | 2-officer crews. Tallinn's two jaoskonnad each have **patrulligrupp I–VIII**; Rakvere has I–V. Officers work *summeeritud tööaeg* (hours averaged over a period) with night work. In one recent year there were **about 1,000 hours** when every patrol in a jaoskond was busy on a call. | VERIFIED |
| **Kiirreageerijad** (kiirreageerimisüksused) | Armed rapid-response teams in each prefecture. They act as extra patrols and take the **most dangerous calls**, and support criminal police in searches and arrests. | 2017 plan to double from 75 to 150: Põhja 65, Lõuna 35, plus new 25-person units in Ida and Lääne; Lääne's is the youngest. Entry test: 14 exercises in 16 minutes, situational tasks, shooting. | VERIFIED (plan figures) |
| **K-komando** | National tier-1 counter-terror / SWAT unit, founded 1991, based in Tallinn. Members are also trained paramedics: K-komando won the national paramedic championship twice, with Põhja kiirreageerijad second. | Usually placed under Keskkriminaalpolitsei | VERIFIED existence; parent unit LIKELY |
| **Julgestusbüroo** (Põhja) | Close protection of state leaders and guarding objects | Moved from KKP to Põhja (2025 statute) | VERIFIED |
| **Koerajuhid** (K9) | Patrol dogs, plus drug, explosive and tracking dogs | **About 70–80 police dogs** nationally; about 2 years of training; Belgian Malinois common. Shortage of handlers. Dog-service lead: Helen Komussar. | VERIFIED |
| **Liiklusjärelevalve** | Liiklusjärelevalvekeskus (national) plus **liiklusgrupid** in jaoskonnad (for example Jõhvi) | **8 mobile speed cameras** nationwide. Mobile cameras fine at ≥6 km/h over the limit since 1 July (fixed cameras at 3 km/h). Warning signs before mobile cameras required from 1 August. | VERIFIED (years of the threshold and sign rules UNSURE, 2025/26) |
| **Kriminaalpolitsei** | KKP (national) plus prefecture *kriminaalbüroo* plus jaoskond *menetlustalitus*, *uurimisgrupp* and *menetlusgrupp* | Typical titles: uurija, vanemuurija, menetleja. KKP leadership (Aivar Alavere, Toomas Lõhmus) was removed in the 2025–26 Heldna affair. | VERIFIED |
| **Piirkonnapolitseinikud** (community police) | District officers in *piirkonnagrupid*; goal of at least one per municipality | 126 officers (about 2017), with +45 planned for 2018–21 (€21.5M programme) | VERIFIED (historic) |
| **Noorsoopolitsei** (youth police) | Youth crime prevention and juvenile cases, normally inside piirkonnagrupid / prevention | No current numbers found | LIKELY (role); numbers UNSURE |
| **Abipolitseinikud** (auxiliary volunteers) | Unpaid volunteers in uniform, patrolling with regular officers | **1,235 at end of 2024** (1,184 in 2023; 1,109 in 2022), **159,137 hours** in 2024 (+30%). Over 1,200 and over 170,000 hours in 2025. Target 1,500 by 2029. In 2026 recruitment was paused until a new Abipolitseiniku seadus takes effect (expected autumn 2027). About 1 in 5 may carry a firearm and 1 in 8 may drive with blue lights. In Põhja in 2017 they made up about 3 patrols a day. | VERIFIED |
| **Piirivalve** (border guard) | Piirivalvebüroo in Ida and Lõuna (and Põhja for port and airport). Border crossings, kordonid, Peipsi. | See §5.1 | VERIFIED |
| **Merevalve / merepääste** | JRCC plus coastal *merepääste- ja patrulligrupid* (Kärdla, Kuressaare, Pärnu) | See §5.2 | VERIFIED |
| **PPA lennusalk** (air unit) | Helicopters and a surveillance aircraft | See §5.3 | VERIFIED |
| **Drones** | Border surveillance drones and counter-drone systems | See §5.4 | VERIFIED |

### 5.1 Border guard details [VERIFIED unless marked]

**Road crossings to Russia: Narva, Koidula, Luhamaa**

| Crossing | Crossings in 2025 | 2026 hours and status |
|---|---|---|
| **Narva-1** (Ida, Narva) | 626,470 | Pedestrian crossing open 07–19 from 15 June 2026. PPA has temporarily closed exit traffic when Russian processing slowed (2024). |
| **Narva-2** (pedestrian bridge) | — | Closed on 28 November, probably 2022, for border infrastructure rebuilding |
| **Koidula** (Lõuna, Põlva county; road and rail) | 213,910 | Since **24 Feb 2026**, closed to all traffic at night (open 07:00–19:00). Extended to 31 Aug 2026. Traffic up 6% since the night closure. |
| **Luhamaa** (Lõuna, Võru county) | 239,542 | Same night closure and extension as Koidula. Traffic down about 20% since the night closure. |

**Other border features**
- **Saatse** area (the "Saatse boot" road through Russian territory). PPA logistics staff strayed into Russia there in 2026.
- **Kordonid** (border guard stations): Narva kordon is active. Mustajõe and Alajõe are closed. Others on Lake Peipus and in the south-east (Vasknarva, Mehikoorma, Värska, Piusa, Meremäe) are from memory [UNSURE].
- The eastern border build-out (fence, surveillance, patrol tracks) is due to be finished by the **end of 2027**. Six new surveillance positions were built.
- **Lake Peipus** (Peipsi): PPA is responsible for border-water pollution and ice/SAR situations, using hovercraft (hõljukid) and boats.

### 5.2 Maritime [VERIFIED]
- **January 2023**: the four large PPA ships moved to the **Navy** (*Mereväe patrull-laevade divisjon*) with their crews. They are:
  - *Kindral Kurvits* (multipurpose pollution-control ship)
  - *Raju* (patrol ship with pollution-control capability)
  - *Pikker*
  - *Valve*

  Sea-border surveillance passed to the Navy. **PPA kept maritime search and rescue** and border-water pollution response.
- PPA small craft: two **12 m patrol boats from Baltic Workboats (2023)**: ***Tuul*** (Saaremaa) and ***Terje*** (Pärnu). They replaced plastic fast boats that were about 20 years old.
- The PPA maritime base was planned to move from Süsta harbour to **Miinisadam / Hundipea** (Tallinn) by the end of 2022. Completion is not confirmed.
- The Haapsalu sea rescue unit was abolished. Volunteer sea rescue units and Päästeamet water-rescue commandos cover nearshore areas.

### 5.3 PPA lennusalk (air unit) [VERIFIED unless marked]
- **3 × AgustaWestland (Leonardo) AW139**, registrations **ES-PWA, ES-PWB, ES-PWC**, delivered 2007, 2008 and Feb 2011.
- **Fixed-wing**: **Beechcraft King Air 350ER** surveillance aircraft (about 2018). It replaced the 35-year-old **Let L-410**, whose last flight was a medical flight from Kuressaare to Tallinn in Dec 2015 and which is now in the Tartu aviation museum. A recent report says the unit has "three helicopters and two airplanes" [VERIFIED as reported; the second plane's type is UNSURE].
- **Base**: Tallinn airport [LIKELY]. A second, smaller helicopter base at **Tartu airport** was planned. The unit says a helicopter can lift off **from Tallinn within 15 minutes, 24/7**.
- **Readiness problems**: readiness for flying two helicopters at once fell to 20–25%. A 1,200-hour / 4-year heavy maintenance takes about 5 months at the manufacturer's Belgian facility. The de-icing system is unreliable.
- Proposals: expand to **5 helicopters plus another surveillance plane** (about €250M, 2026 debate). Air-ambulance competition with private operators.
- **Tasks**: SAR, medical evacuation from islands, police support, border surveillance, pollution detection.

### 5.4 Drones [VERIFIED]
- Border guard first used about 10 drones (9 backpack type on the eastern border). PPA later bought **9 × ELIX-XL** drones for about €0.5M (EU funds).
- **Drone wall** (*droonimüür*): about €12M. Fixed counter-drone detection sensors run from the Estonia–Latvia–Russia tripoint to Luhamaa, the whole eastern border is to be covered, and mobile radars were added. Phase 1 target: the external border plus the **four largest cities** covered by drone detection. A draft law would let police bring down non-compliant drones.

---

## 6. Vehicles

### 6.1 Fleet facts [VERIFIED unless marked]
- PPA has **about 1,000 vehicles**, mostly **leased** (*kasutusrent*); cars go back to the lessor at end of term.
- **Models confirmed in the 2020s**, mainly through donations of retired cars to Ukraine (57 vehicles in total from 2024–2025) and trials:

| Model | Use |
|---|---|
| **Škoda Octavia** | Community policing and patrol. 16 + 4 donated in 2024. |
| **Volkswagen Tiguan** | Community policing. 15 donated in 2024. |
| **Škoda Scala** | Leased *alarmsõiduk* (emergency vehicle). 8 donated in 2025. |
| **Volkswagen Amarok** | Border guard pickup. 13 donated in 2025. |
| **Nissan Patrol** | Border guard. 1 donated in 2025. |
| **Volkswagen ID.4 GTX** | Electric patrol / VIP escort trial, about €66k. Joined a Peugeot electric van already in use. |
| **Mitsubishi** EVs | 19 admin cars, around 2011 |
| **Mercedes-Benz Sprinter** | **8 riot vans (märulibussid, 2016–18, €800k)** and **9 detainee convoy vans (konvoibussid)**, rebuilt by a Silberauto (now Veho) subsidiary. They turned out to be over the 3.5 t limit and were banned from use for a while, so PPA rented 3 replacements. |
| **20 new "high-tech" SUVs**, June 2025, €2M | Eastern border patrol and Frontex operations. Model not found [UNSURE]. |

- **Probable but unconfirmed in the 2020s** [UNSURE]: Škoda Superb and Škoda Kodiaq patrol cars, VW Passat (2010s), Toyota Land Cruiser / Hilux (border), unmarked BMW/Audi/Škoda for traffic enforcement, VW Transporter / Crafter vans, police motorcycles.
- Unmarked patrol cars are used [VERIFIED, Baltic Times].

### 6.2 Livery [VERIFIED]
- Under the regulation on marking emergency vehicles and PPA's vehicle-marking annex, **police emergency vehicles are white (base colour) with blue (contrast colour)**.
- Contrast colour goes on the **bonnet, doors and tailgate / rear wall** of cars. Vans and buses get a **290 mm side stripe** instead. Motorcycles, mopeds and bicycles use the base colour only.
- **Reflective additional markings** are applied over the base and contrast areas.
- In **2017** PPA tested a mustard-yellow reflective marking for winter visibility; a final rollout was not confirmed.
- A **2026** regulation loosened how colour schemes may be used on emergency vehicles but kept **police = white + blue**.
- The text "POLITSEI" on the sides and bonnet is LIKELY. Whether a Battenburg checker pattern is used is UNSURE.
- **Game palette**: white body, blue doors / bonnet / tailgate, reflective trim, "POLITSEI" in blue or white.
- **Tallinna Munitsipaalpolitsei** ("mupo") is a *city* agency, not PPA, with its own livery. Do not confuse the two.

### 6.3 Lights and siren
- Blue flashing lights (*sinine vilkur*) plus a special sound signal (*eriheli*) make an *alarmsõiduk* under the Liiklusseadus [LIKELY].
- Specific siren tones (wail / yelp / hi-lo) are UNSURE. Use generic EU wail/yelp.

---

## 7. Ranks (eriastmed / teenistusastmed) and job titles

### 7.1 Rank ladder, lowest to highest
Source: the Politsei ja piirivalve seadus (PPVS) rank list. The search reached a 2011–2012 version of the text. Use of *vanemkomissar*, *politseikapten* and *politseimajor* is **VERIFIED in 2025–26 politsei.ee staff listings**. Treat the full ladder as LIKELY current; check the consolidated PPVS on riigiteataja.ee.

| # | Main rank | Parallel ranks at same level (older text) | Tier |
|---|---|---|---|
| 1 | **nooremkonstaabel** | nooremassistent, nooreminspektor | junior specialist |
| 2 | **konstaabel** | assistent, inspektor (nooremveebel for ship posts) | specialist |
| 3 | **vanemkonstaabel** | vanemassistent, vaneminspektor (veebel) | specialist |
| 4 | **ülemkonstaabel** | ülemassistent, üleminspektor (vanemveebel) | senior specialist |
| 5 | **komissar** | (ülemveebel) | senior specialist / junior leader |
| 6 | **vanemkomissar** | — | leader / senior specialist |
| 7 | **politseileitnant** | — | officer |
| 8 | **politseikapten** | — | officer |
| 9 | **politseimajor** | — | officer |
| 10 | **politseikolonelleitnant** | — | senior officer |
| 11 | **politseikolonel** | — | senior officer |
| 12 | **politseikindral** | — | general (Director General) |

Notes:
- The veebel ranks applied only to ship specialist posts in the older text [VERIFIED].
- In older pay tables, politseikolonelleitnant was pay grade 14–15 and politseikolonel 15–16 [VERIFIED].
- The interior minister grants politseileitnant through politseikolonelleitnant (older text) [VERIFIED].
- Border guard equivalents used to carry a *piirivalve-* prefix (for example piirivalvenooremleitnant = politseileitnant) [VERIFIED historic].
- Real 2025–26 examples [VERIFIED]: vanemkomissar on a patrol *rühmajuht*, on investigators and on community officers; politseikapten as a command-centre *grupijuht*; politseimajor as head of the kainestusmaja group.
- Shoulder-board insignia were not found [UNSURE]. Do not draw them as "real".

### 7.2 Common job titles (ametinimetused)

**Patrol and field**
- patrullpolitseinik (patrol officer)
- vanempatrullpolitseinik (senior patrol officer) [LIKELY]
- **rühmajuht** (team leader) [VERIFIED]
- **välijuht** (field commander / shift supervisor) [VERIFIED]
- **grupijuht** (group leader) [VERIFIED]
- **talituse juht** (head of patrol or case service)
- **jaoskonna juht** (station head)
- **prefekt**
- **peadirektor**

**Community**
- piirkonnapolitseinik (community officer) [VERIFIED]
- noorsoopolitseinik (youth officer) [LIKELY]

**Investigation**
- uurija, vanemuurija, juhtivuurija
- menetleja (case handler) [VERIFIED for uurija / menetleja]

**Command centre**
- operatiivinfo haldur
- ekspert / juhtimiskeskuse vahetuse vanem
- grupijuht
- keskuse juht

All [VERIFIED].

**Custody**
- arestimaja spetsialist (custody officer) [VERIFIED]
- konvoeerija [LIKELY]

**Other**
- kiirreageerija, koerajuht, piirivalvur, vanempiirivalvur [LIKELY]
- abipolitseinik [VERIFIED]
- juhtivpolitseinik [UNSURE as a formal title]
- ekspert / juhtivekspert [VERIFIED]

---

## 8. Radio: ESTER (not VIRVE)

**Correction to the brief: VIRVE is Finland's network.** *VIRVE* (Viranomaisradioverkko) is Finland's authorities' TETRA network, run by Erillisverkot. *Virve 2.0* is Finland's broadband successor, with Elisa providing 4G/5G radio access and Ericsson the core under a 10-year deal [VERIFIED].

**Estonia's network is ESTER** [VERIFIED]:
- Nationwide **TETRA** network built in **2007 by Cassidian** (now Airbus), with **over 100 base stations**.
- **About 10,000 daily users**: police, border guard, rescue, emergency medical, prisons and others. **8 ministries and 17 agencies** use it.
- Owned by **SMIT** (Siseministeeriumi infotehnoloogia- ja arenduskeskus). Upgraded from TETRA release 5.5 to **6.0**, with ASC call recording.
- **RIKS** (Riigi Infokommunikatsiooni Sihtasutus) runs it under a 2021 operating contract worth about €641k a year.
- Terminals support **DMO** (direct mode, radio-to-radio without the network).
- ESTER cooperates with Finnish VIRVE along the Gulf of Finland and on border guard work.
- **Successor "ESTER 2.0"**: a planned next-generation secure network for emergency services, with **RIKS** as lead agency (seen in a job ad). Timeline unknown [VERIFIED existence of plan; details UNSURE].
- Related: RIKS, Päästeamet and a Norwegian vendor are building **cell-broadcast emergency alerts** to phones, targeted by the end of 2026 [VERIFIED].

Game use: call the in-game radio "ESTER" (real, generic) or a fictional name. TETRA flavour: talkgroups, status messages, a PTT (push-to-talk) beep, emergency button, DMO fallback when out of coverage.

---

## 9. Radio call signs

**No public information was found** on PPA patrol call-sign conventions (*kutsungid*). PPA does not publish them, and searches returned only amateur-radio call-sign rules. Anything we use is **invented**.

Suggested **fictional** scheme, clearly game-only, built on real unit structure (prefecture → jaoskond → patrulligrupp):

| Prefix | Prefecture |
|---|---|
| P | Põhja |
| I | Ida |
| L | Lõuna |
| W | Lääne |

- Then a jaoskond digit (for example P1 = Ida-Harju, P2 = Lääne-Harju), then a crew number: **"P1-23"**.
- Special units: **"K-"** for kiirreageerijad, **"KOER-"** for K9, **"LIIK-"** for traffic, **"ABI-"** for crews with abipolitseinikud, **"KOPTER 1/2/3"** for AW139s, **"VÄLI-P1"** for the field commander.
- The command centre answers as "Juhtimiskeskus" or "Põhja juhtimine".

Do **not** claim this matches reality.

---

## 10. Staffing and shifts

| Metric | Value | Conf. |
|---|---|---|
| PPA total staff | **About 5,000** (ERR; a 2016 National Audit Office report said about 5,000, 1,000 fewer than in 2010) | VERIFIED |
| Staff trend | Down about 2,000 over 15 years. PPA took 86% of the public sector's 2,500-person reduction. 615 left vs 260 hired in one year (about 2022). | VERIFIED |
| Shortage | "Permanently short 200–300 frontline staff" (Belitšev). About 300 vacancies. | VERIFIED |
| Police officers (ametnikud) | Not found. Order of 3,500–4,000 including border guards. | UNSURE / ESTIMATE |
| Pay | Police minimum salary rose from €1,850 to **€2,035** (2026). 43% of officers are on the lowest base pay level. | VERIFIED |
| Patrols nationally | About **90–100 patrol cars on a normal day** (2020). Raised to 130, and up to 200 on a sunny COVID-restriction day. | VERIFIED |
| Harju + Tallinn | **64 patrol cars out at once** during the 2020 surge (about double normal) | VERIFIED |
| Tallinn per shift (derived) | Normal daytime in Harju is about 30 cars, so **Tallinn ≈ 15–25 patrol crews by day and ≈ 10–18 at night**. Add 1–3 kiirreageerija cars, traffic and K9 units, and on some nights auxiliary-police crews (Põhja averaged about 3 auxiliary patrols a day in 2017). | ESTIMATE |
| Call volume | Over 0.5 million requests to police a year; about 700 requests in a sample day. ERR also says a patrol goes to calls "on average 144 times a day"; the scope (national or regional) is unclear. | VERIFIED (scope of 144 UNSURE) |
| Working-time model | *Summeeritud tööaeg* (hours averaged over a period) with night work | VERIFIED |
| Shift length | Officers work about **48 h/week** at a station; a "short shift week" has only 2 workdays. This fits **12-hour day/night shifts** in a 2-on/2-off style rotation, for example 07–19 and 19–07. | VERIFIED quote; 12 h pattern LIKELY |
| Command-centre shifts | Põhja juhtimiskeskus has **4 teabegrupid (I–IV)**, consistent with a 4-crew rotation of 12-hour shifts | VERIFIED groups; rotation LIKELY |
| Patrol groups | Tallinn jaoskonnad have patrulligrupp I–VIII each, so about 8 crews rotate per jaoskond | VERIFIED groups; rotation ESTIMATE |

---

## 11. Game-design takeaways

1. **Map regions**: four prefectures with fixed county lists (§1). Tallinn is split between Ida-Harju (Kesklinn, Lasnamäe, Pirita, east Harju) and Lääne-Harju (Põhja-Tallinn, Kristiine, Mustamäe, Haabersti, Nõmme, west Harju).
2. **Dispatch chain**: caller → 112 Häirekeskus → prefecture juhtimiskeskus (player = *operatiivinfo haldur*, boss = *vahetuse vanem*) → patrol crew of 2 → välijuht on scene.
3. **Disposal destinations**:

   | Prefecture | Arrested / detained | Drunks |
   |---|---|---|
   | Põhja | Tallinna Vangla, Soodevahe | Tallinna kainestusmaja (Merelahe tee, Põhja-Tallinn) |
   | Lõuna | Tartu Vangla | Tartu Vangla |
   | Ida-Viru | Viru Vangla, Jõhvi | Viru Vangla, Jõhvi |
   | Lääne | Pärnu arestimaja; small cells in Haapsalu, Kuressaare, Kärdla, Paide | same |

4. **Special assets** with scarcity:
   - kiirreageerijad: a few per prefecture
   - K-komando: national, slow to mobilise
   - K9: 70–80 dogs nationally
   - AW139: 3 helicopters, often only 1 available, 15-minute launch from Tallinn
   - abipolitseinikud: evenings and weekends
5. **Vehicles**: white and blue Škoda Octavia / Scala / VW Tiguan patrol cars, VW Amarok / Nissan Patrol at the border, Mercedes Sprinter convoy and riot vans.
6. **Border**: Narva-1, Koidula and Luhamaa have 2026 opening hours of 07–19, which allows time-of-day events.

---

## 12. Open uncertainties / to verify later
- Whether **Ida prefektuur** still has its own juhtimiskeskus or is dispatched from Tallinn.
- The exact current **PPVS rank list** (whether parallel inspektor/assistent tracks survive) and rank **insignia**.
- Street addresses for **Kärdla** and **Võru**, and the exact site of the **Tallinna kainestusmaja** building.
- Whether the **Tallinn arrest house → Tallinna Vangla** transfer took effect exactly on 1 Apr 2025, and the start date of the Tartu/Jõhvi transfer.
- Current numbers for **kiirreageerijad**, **piirkonnapolitseinikud**, **noorsoopolitseinikud** and the police-officer headcount.
- The current **patrol car models** (Superb, Kodiaq, Toyota?) and the model of the 20 border SUVs from June 2025.
- Livery details (Battenburg or not, "POLITSEI" lettering colour) and siren tones.
- Any **call-sign** convention (none public).

---

## Sources (from search results)

**Structure and prefectures**
- PPA prefecture/county mapping (procurement doc): https://adr-docs.karlerss.com/UG1OVAhlTep0jIpVuAvOYJRnam6Zuoor/
- PPA statute amendment 2025 (riigiteataja): https://www.riigiteataja.ee/akt/128062025001.pdf
- PPA statute 2025 explanatory memo: https://adr-docs.karlerss.com/9j57PPglKEh63xBETnabEm6fKs17CllK/
- Põhja prefektuur contacts: https://www.politsei.ee/en/contacts/pohja_prefektuur
- Lääne prefektuur Haapsalu / Kesk-Eesti: https://www.politsei.ee/en/contacts/laane_prefektuur/haapsalu_politseijaoskond ; https://www.politsei.ee/en/contacts/laane_prefektuur/kesk-eesti_politseijaoskond
- Lõuna operatiivbüroo: https://www.politsei.ee/en/contacts/louna_prefektuur/operatiivbyroo
- Rakvere patrol groups: https://www.politsei.ee/en/contacts/ida_prefektuur/rakvere_politseijaoskond/patrullitalitus/patrulligrupp_v
- Pärnu joint building: https://www.err.ee/1608386702/parnu-politsei-joudis-uhishoonesse-kolimisega-lopule
- Tartu new police building plan: https://www.err.ee/1610048077/tartu-linnavalitsus-vottis-vastu-uue-politseimaja-planeeringu
- Separate border guard unit: https://www.err.ee/1083588/politsei-ja-piirivalveameti-struktuuri-tekib-eraldi-piirivalve-uksus
- Lõuna prefect Koppel (2026): https://www.err.ee/1609006961/louna-prefekt-ppa-ametnike-venemaale-eksimisest-on-eestil-videosalvestis

**Custody**
- Tallinn arrest house to Tallinna Vangla: https://adr-docs.karlerss.com/4nikGDWbuOmu0F8jqVn7MRYqUYAHGWfF/ ; https://www.riigikogu.ee/download/6cce96ca-5990-49ea-9e86-c16b237e9dd1
- Tartu/Jõhvi to prisons, arrest house counts: https://www.riigikogu.ee/download/c9d4f7d6-4b49-493c-bc8d-6d39c6935662
- Kinnipidamiskeskus / kainestusmaja group: https://www.politsei.ee/en/contacts/pohja_prefektuur/teabebyroo/kinnipidamiskeskus/employee/remo.tanav ; https://www.politsei.ee/en/contacts/pohja_prefektuur/teabebyroo/kinnipidamiskeskus/kainestusmaja_grupp/employee/margus.trees
- Tallinn Prison: https://en.wikipedia.org/wiki/Tallinn_Prison ; Tartu Vangla statute: https://www.riigiteataja.ee/akt/106022024006.pdf
- Sobering-up volumes and policy: https://www.err.ee/1608486107/ministeerium-annaks-joodikute-kantseldamise-politseilt-omavalitsustele
- Chancellor of Justice inspections: https://www.oiguskantsler.ee/sites/default/files/2024-11/Kontrollk%C3%A4ik%20L%C3%A4%C3%A4ne%20prefektuuri%20P%C3%A4rnu%20arestimajja.pdf

**Dispatch**
- 110 shut down: https://www.err.ee/1058502/politsei-luhinumber-110-lopetas-too ; https://www.err.ee/1021133/alates-martsist-numbrile-110-helistades-politseid-kutsuda-ei-saa
- Juhtimiskeskus pages: https://www.politsei.ee/en/contacts/pohja_prefektuur/operatiivbyroo/juhtimiskeskus ; https://www.politsei.ee/en/contacts/louna_prefektuur/operatiivbyroo/juhtimiskeskus ; https://www.politsei.ee/en/contacts/laane_prefektuur/operatiivbyroo/operatiivkeskus
- Command-centre job descriptions: https://www.politsei.ee/files/jobdescriptions/kq9vyscng9qwfcrlm2d5.pdf (and related files)
- JRCC Tallinn: https://www.politsei.ee/en/sea-and-air-rescue

**Units**
- Kiirreageerijad: https://www.err.ee/632327/politsei-alustas-varbamist-kiirreageerijate-arv-kahekordistub ; https://www.err.ee/943885/ak-jalgis-politsei-kiirreageerijateks-purgijate-katseid
- K-komando: https://www.err.ee/1119262/galerii-parameedikute-kutsemeistrivoistlused-voitis-k-komando
- Police dogs: https://www.err.ee/1609655864/ak-nadal-uuris-kuidas-kasvatakse-teenistuskoeri
- Abipolitseinikud: https://www.err.ee/1610118991/ppa-teeb-abipolitseinike-varbamises-pausi ; https://www.err.ee/869808/tulirelvaoigus-on-igal-viiendal-abipolitseinikul-alarmsoiduluba-igal-kaheksandal
- Piirkonnapolitsei: https://www.err.ee/588229/ppa-saab-piirkonnapolitsei-ja-kiirreageerimise-arendamiseks-21-5-miljonit
- Speed cameras: https://www.err.ee/1609707585/ppa-paneb-eelkoige-mootorratturite-tottu-kiiruskaamerad-kahes-suunas-toole

**Border, sea, air, drones**
- Border crossings 2026: https://emta.ee/uudised/eesti-sulgeb-24-veebruarist-kolmeks-kuuks-oise-liikluse-luhamaa-ja-koidula-maanteepiiril ; https://www.err.ee/1608793015/narva-2-piiripunkt-laheb-kinni-28-novembril
- Closed border posts: https://www.err.ee/1608474350/ppa-sulges-idapiiril-jarjekordse-piirivalve-tugipunkti
- Ships to Navy: https://www.err.ee/1608838663/politsei-ja-piirivalveameti-laevad-alustavad-tegevust-merevae-laevastikus
- Tuul and Terje: https://www.err.ee/1608996940/ppa-sai-saaremaa-ja-parnu-mereala-kontrollimiseks-kaks-patrull-laeva
- Lennusalk: https://www.err.ee/1609576394/varuosade-puudus-ja-vigane-jaatorje-riik-kaalub-kopterite-valjavahetamist ; https://www.err.ee/840967/politsei-ja-piirivalveamet-vottis-teenistusse-uue-seirelennuki ; https://www.helis.com/database/modelorg/Estonia-Border-Guard-Police-AW139/ ; https://www.err.ee/1608541039/tartu-lennujaama-tuleb-politsei-ja-piirivalveameti-kopterite-baas
- Drones: https://www.err.ee/653704/ppa-sai-idapiiri-valvamiseks-poole-miljoni-euro-eest-droone ; https://www.err.ee/1609520056/ppa-saab-ligi-12-miljonit-eurot-eesti-droonimuuri-arendamiseks

**Vehicles**
- Ukraine donations: https://news.err.ee/1609373225/estonian-police-donate-31-cars-to-ukrainian-colleagues ; https://news.err.ee/1609761837/estonia-donates-22-more-vehicles-to-ukraine-s-police-and-border-guard
- EV patrol car: https://news.err.ee/1608736948/weekly-ppa-gets-to-grips-with-electric-patrol-car
- Border SUVs 2025: https://news.err.ee/1609724670/ppa-gets-20-new-high-tech-suvs-for-patrolling-estonia-russia-border
- Sprinter riot/convoy vans: https://www.err.ee/1608226183/epl-17-kallist-maruli-ja-konvoibussi-seisavad-ebaseaduslikena-parklas
- Livery: https://adr-docs.karlerss.com/6JvEUKnzFeQe42RfWheUHxeEtgN041G0/ ; https://www.err.ee/581901/fotod-politsei-katsetab-uue-margistusega-autosid

**Ranks**
- PPVS rank list (2011 draft / 2012 text): https://www.riigikogu.ee/download/1b4eb49b-2dc3-acd5-0d7a-77ffdcaa198f ; https://www.riigiteataja.ee/akt/104072012022
- Rank in use (vanemkomissar): https://www.politsei.ee/en/contacts/pohja_prefektuur/ida-harju_politseijaoskond/employee/karin.sirp

**Radio**
- ESTER: https://asctechnologies.com/fileadmin/media/Brochures/Success_Stories/Neo/Success_Story_Smit_EN.pdf ; https://www.criticalcomms.com/news/ascs-evoipneo-recording-solution-adopted-by-estonias-ester-network
- Finnish VIRVE: https://en.wikipedia.org/wiki/VIRVE

**Staffing**
- https://www.err.ee/1608828094/belitsev-politseis-on-pusivalt-puudu-kuni-300-eesliinitootajat
- https://www.err.ee/1083697/eriolukorra-tottu-on-valjas-kaks-korda-rohkem-politseipatrulle
- https://www.err.ee/1068289/vaher-suurendame-patrullpolitseinike-hulka
- https://news.postimees.ee/6895023/half-of-patrol-policemen-have-fallen-asleep-behind-the-wheel
- https://www.err.ee/1609654676/ppa-ja-paasteameti-juhid-ootavad-oma-tootajatele-kiiret-palgatousu
