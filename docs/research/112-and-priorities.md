# 112, Häirekeskus and police event priorities (Estonia, 2020–2026)

Research notes for **EPD**, an unofficial fan-made dispatch game. EPD is not affiliated with Politsei- ja Piirivalveamet (PPA) or Häirekeskus.
Compiled 2026-10-17. Sources were web search results (ERR, Riigi Teataja, siseministeerium.ee, 112.ee, politsei.ee, Postimees). Direct page fetches were not possible.

**Confidence tags**
- **[VERIFIED]**: the fact appeared in a search result or snippet. The source is listed at the end.
- **[LIKELY]**: strong prior knowledge that no result contradicted.
- **[UNSURE]**: plausible but unconfirmed, or the sources disagree.
- **[DERIVED]**: our own arithmetic from verified numbers.
- **[DESIGN]**: a suggestion for game data, not a real-world fact.

> Branding note for designers: the real PPA site is politsei.ee. If the game lives on a lookalike domain (e.g. politsei.eu), the "unofficial / fan-made / not the police" disclaimer must be prominent on every page. Do not use the PPA logo, the 112 logo or real crest artwork. Never make in-game UI suggest that players can contact real police or report real crimes there.

---

## 0. TL;DR for game designers

| Topic | Key fact | Confidence |
|---|---|---|
| Who answers 112 | **Häirekeskus** (Emergency Response Centre), one national agency with 4 regional centres: Tallinn, Tartu, Jõhvi, Pärnu | [VERIFIED] |
| Police number 110 | Calls forwarded to 112 from about 2015. **Closed for good on 1 March 2020** (automatic message for 1 year). | [VERIFIED] |
| How a police event reaches the police | Häirekeskus takes the call, does a threat assessment (*ohuhinnang*), then **electronically forwards** the report to the PPA *juhtimiskeskus* (police command centre), which dispatches patrols. Häirekeskus itself dispatches only ambulance and rescue. | [VERIFIED] |
| Police priority levels | **Alfa, Bravo, Charlie** (Charlie = highest) | [VERIFIED] |
| 112 call volume | 2023: about 1.16 M contacts. 2024: **989,711 calls** (−14%). Typically up to about 3,000 calls/day, plus about 1,000 on jaanipäev. | [VERIFIED] |
| Share of 112 events that are police | **About 27%** (medical 60%, rescue 5%, 2023) | [VERIFIED] |
| Police events/day nationally | About 300–450 per day. 2018: 308/day via 112. 2017: "nearly 400 of about 2,800 daily calls". | [VERIFIED] for those years; current figure [DERIVED] |
| Patrols on duty | National average **62** in 2024 (68 in 2023; target 86). About 112 in 2016. | [VERIFIED] |
| Response to life/health threats | 2023: 82% reached within **10.5 min** in towns; 74% within **19.5 min** in rural areas | [VERIFIED] |
| Häirekeskus processing target | ≤ **2 min 15 s** for life/health-threat reports (2025–2028 programme) | [VERIFIED] |
| Top call-out types | Drunk persons, offences against persons (incl. domestic violence), night-quiet violations: about **2/3 of call-outs in larger cities** (2024). Traffic accidents are next. | [VERIFIED] |
| Domestic violence | About **10,000 call-outs/year** (2025). About 30/day normally, about 50/day on holiday peaks. | [VERIFIED] |
| Peak nights | New Year's Eve 2025/26: **500+ call-outs**, 70 domestic violence. Jaanipäev 2022: **1,200+ call-outs over 23–24 June**. | [VERIFIED] |
| Non-emergency line | **1247** riigiinfo (state helpline). 24/7, free, ET/RU/EN. It also took over the environment line 1313 and road info line 1510. | [VERIFIED] |
| Removal order in domestic violence | *Viibimiskeeld* (KorS § 44) extended from 12 h to **up to 72 h**, in force **17 April 2026** | [VERIFIED]; year [LIKELY] |

---

## 1. Häirekeskus (Emergency Response Centre)

### 1.1 Organisation
- **Independent agency since 1 January 2012**, under the Ministry of the Interior (Siseministeerium). It sits alongside Päästeamet (Rescue Board) and PPA. [VERIFIED]
- **One national centre, four regional centres** (*keskused*). [VERIFIED]
  - **Põhja keskus**: Tallinn, Osmussaare 2. Handles Tallinn and Harju County. [VERIFIED]
  - **Lõuna keskus**: Tartu. [VERIFIED]
  - **Ida keskus**: Jõhvi. It shares a building with the PPA Ida prefektuur command centre. [VERIFIED, 2012 yearbook]
  - **Lääne keskus**: Pärnu. [VERIFIED]
  - Calls are routed nationally, so any centre can take overflow from another region. [LIKELY]
  - County split per centre. A rough guide: Põhja = Harju; Ida = Ida-Viru (+ Lääne-Viru?); Lõuna = Tartu, Jõgeva, Põlva, Valga, Võru, Viljandi; Lääne = Pärnu, Lääne, Saare, Hiiu, Rapla (+ Järva?). [UNSURE]
- **Staff**: about 250 people, working 24/7 [VERIFIED as an unofficial figure]. In 2024 about 20% of planned staffing was unfilled [VERIFIED].
- **Job titles** [VERIFIED from 112.ee job descriptions]:
  - *päästekorraldaja*: call handler. Answers 112, interviews the caller, does the *ohuhinnang*.
  - *päästekorraldaja-logistik*: dispatcher/logistician. Assigns ambulance and rescue units.
  - *vahetuse vanem* (shift senior) and *grupijuht* (group leader).
  - Staff work *summeeritud tööaeg* (aggregated hours), including nights, weekends and public holidays. Exact shift length is [UNSURE]; 12 h shifts are common in such centres.
- Abbreviation used in official documents: **HÄK**. [VERIFIED]
- Legal basis:
  - **Päästeseadus** (Rescue Act) sets Häirekeskus's tasks. [VERIFIED]
  - **Siseministri määrus nr 26 (13.06.2017) "Hädaabiteadete menetlemise kord…"** sets how emergency reports are handled; a newer 2022 version exists. [VERIFIED]
  - **Hädaabiteadete menetlemise andmekogu** (emergency report database): Häirekeskus is the controller and PPA an authorised processor. It is connected via X-tee. [VERIFIED]

### 1.2 Answering 112
- Target: answer **within 10 seconds** and start handling ("üldjuhul kümne sekundi jooksul"). [VERIFIED]
  - 2018: 94% answered in 1–10 s [VERIFIED].
  - Holiday peaks and staff shortages can stretch waits. During IT outages (e.g. 30 June, around 2025) waits reached **about 6 min**, and staff fell back on paper. [VERIFIED]
- Languages: Estonian, Russian, English as standard. [LIKELY]
- Channels:
  - Voice call.
  - **SMS to 112**: 6,501 SMS contacts in 2023. [VERIFIED]
  - **eCall** from cars. eCalls are rising, but most are false: one year had 129 eCalls with only 3 real events. [VERIFIED]
  - SOS buttons for the elderly (*häirenupud*) and fall-detector watches. Pocket dials. [VERIFIED]
- From abroad, Estonian Häirekeskus can be reached on **+372 6000 112**. [VERIFIED headline, ERR]
- Abuse and nuisance:
  - In one year the **20 most frequent callers** made **12,995 calls**. The single most active caller in 2017 made 1,744 calls (about 140/month). [VERIFIED]
  - Social-need calls can take about one third of handlers' talk time. On one sample day (5 June) there were 3,096 calls and about 35 h of talk time went to social calls. [VERIFIED; year unclear]
  - The ministry proposed (2023) penalties for deliberately obstructing Häirekeskus. [VERIFIED as a proposal; enactment UNSURE]

### 1.3 Call and event volume (Häirekeskus)

| Year | Calls / contacts to 112 | Events where help was sent | Notes |
|---|---|---|---|
| 2017 | 986,402 | – | [VERIFIED] |
| 2018 | 994,514 | 408,250 | Jan–Aug 2018: 277,722 events; police 27%; **308 police events/day** [VERIFIED] |
| 2019 | 726 calls per 1,000 residents | about 65% of calls event-related | Regional share of calls: Põhja 46%, Lõuna 22%, Ida 19%, Lääne 13%. Per 1,000 residents: Ida 908, Põhja 751, Lõuna 663, Lääne 585. [VERIFIED] |
| 2023 | 1,126,580 mobile + 29,948 landline + 6,501 SMS ≈ **1.16 M** (MoI also gives 1,156,528) | 41% of calls needed urgent help | Events: medical 60%, police 27%, rescue 5%. Lääne region alone: about 35,364 ambulance, just over 12,000 police, just over 4,000 rescue. [VERIFIED] |
| 2024 | **989,711** (−14% vs 2023) | – | [VERIFIED] |

- Daily: "usually **up to 3,000 calls per day**". **Jaanipäev adds about 1,000**, and Häirekeskus rosters about twice the normal staff on Midsummer night. [VERIFIED]
- Older averages: about 2,725/day with 90% answered within 10 s [VERIFIED, undated]; 2,817/day in 2018 [VERIFIED].
- **[DERIVED] police events per year, 2023**: 1.16 M × 41% ≈ 475k events × 27% ≈ **128,000 police events (~350/day)**. The Lääne-region figure (about 12k at 13% of calls) suggests the lower end, about **100–130k/year**. For 2024, with 14% fewer calls, roughly **110–125k (~300–340/day)** [UNSURE].

### 1.4 How a police event goes from Häirekeskus to PPA
Text of the regulation [VERIFIED]: *"Häirekeskus võtab politsei pädevuses oleva hädaabiteate vastu, töötleb seda ja annab sellele ohuhinnangu ning edastab hädaabiteate Politsei- ja Piirivalveametile edasiseks menetlemiseks."* PPA then gives its own **täiendav ohuhinnang** (additional threat assessment). PPA closes its actions after entering the report and the essential response information into the emergency report database.

Workflow (model for the game):
1. **Caller dials 112 → päästekorraldaja answers** (target ≤10 s).
   - Interview: what happened, where, injuries, is the threat present, weapons, intoxication, children present, descriptions, direction of travel. The question list is [LIKELY].
   - Caller location comes from the network/AML handset location. [LIKELY]
2. **Classification and threat assessment** (*ohuhinnang*). The päästekorraldaja picks an event type and sets the **police priority (Alfa/Bravo/Charlie)**. [VERIFIED]
   - Priority can be changed mid-call. In one Tallinn case Häirekeskus upgraded a call to Bravo during the conversation, after the caller said a man with knives looked likely to harm someone. [VERIFIED]
3. **Electronic transfer** of the event to the PPA *juhtimiskeskus* (police command centre).
   - Real-time police tactical work runs in **KILP** (*Politsei taktikalise juhtimise andmekogu*, created by siseministri määrus nr 22 of 25.09.2018, amended 2025). KILP holds "reactive resource planning and management" data and "operational message and event handling" data. [VERIFIED]
   - Events received via 112 that have a police link are also registered in **MIS**. [VERIFIED]
   - That the Häirekeskus-to-KILP hand-off is a direct system interface is [LIKELY]; the exact interface is not public.
   - **Häirekeskus does not dispatch patrols.** *"PPA saadab ise patrullid ja muud üksused … HÄK saadab välja vaid pääste- ja kiirabialast abi."* [VERIFIED, explanatory memo for the 2025 statute change]
   - Live phone transfer of the caller to police is not the normal model. Häirekeskus keeps the caller and relays updates. Direct phone contact between the centres is used when needed. [LIKELY]
4. **PPA juhtimiskeskus** (one per prefecture; Põhja's is also at Osmussaare 2, Tallinn [VERIFIED]).
   - The **juhtimiskeskuse korrapidaja** (command centre duty officer/dispatcher) gives the dispatch order to a resource, collects more information and follows up. [VERIFIED]
   - The korrapidaja keeps an overview of on-duty resources (patrols, special capabilities, auxiliary police) and runs **background checks** on person, vehicle and address before passing information to the unit. [VERIFIED]
   - Other roles: *vahetuse vanem* (shift senior, also coordinates locating people under heightened threat), *grupijuht* (can personally lead an event until a higher command level takes over) [VERIFIED].
   - Field roles: *välijuht* (field supervisor of patrols) [VERIFIED]; *patrull* (usually two officers per car) [LIKELY].
5. **Response and closure**: the patrol drives out (*väljasõit*), arrives (*kohalejõudmine*), handles the call-out (*väljakutse teenindamine* [VERIFIED term]) and closes it in KILP. A *menetlus* (proceedings: misdemeanour or criminal) may follow.
6. **Lower-priority triage**: PPA decides case by case whether to send a patrol or give instructions another way. For example, for mass bomb-threat spam emails, PPA did not send units to every recipient. [VERIFIED]
   - "In the worst case police never get to a lower-priority call-out." [VERIFIED, ERR ~2024]
   - About **1,000 hours/year** when **all patrols were busy** at once. [VERIFIED]
- **Planned change [VERIFIED as draft, 16.06.2026]**: a Päästeseadus amendment would let Häirekeskus pass information to police **without an emergency call** when real-time monitoring detects a threat (e.g. automatic alerts).

**Old regulation timeline**
- From 2010 Häirekeskus began taking over police 110 reports region by region. By end of 2014 its päästekorraldajad handled police emergency reports in all regions. [VERIFIED]
- From 2015, 112 was the only actively used emergency number.

### 1.5 Fallen-elderly calls (recent real-world change, good flavour)
- From 2016 police attended people who had fallen at home under a Häirekeskus–PPA working arrangement: about 400–600 call-outs/year. [VERIFIED]
- In 2024 police command centres sent about one third of such reports back to the ambulance service, or brought in an ambulance as well. [VERIFIED]
- From **1 July 2025** police always involve an ambulance on these calls. [VERIFIED]
- From **1 September 2026** Häirekeskus may **no longer send police**; it chooses between an ambulance and a municipal social worker. [VERIFIED]
  - Temporary compromise (5 Sept 2026): weekdays 9–17 the municipality organises help; at other times state services respond. [VERIFIED]
- Game use: a "fallen elderly person, no danger" event should go to kiirabi or a social worker, not the police queue, from late 2026 on.

---

## 2. Numbers: 110 abolished, 112, 1247 and other lines

| Number / channel | What | Status | Confidence |
|---|---|---|---|
| **112** | Single emergency number: police, rescue, ambulance, sea rescue | Since 2015 the only one in active use | [VERIFIED] |
| **110** | Old police emergency number | Calls forwarded to 112 2015–Feb 2020. **Closed 1 March 2020** (last day 29 Feb), then an automatic message "dial 112" for 1 year. 110 had been about 1–2% of Häirekeskus calls (20–40k/yr). | [VERIFIED] |
| **+372 6000 112** | Reach Estonian Häirekeskus from abroad | Active | [VERIFIED] |
| **1247** | *Riigiinfo* / state helpline, run by Häirekeskus | Launched March 2020 as the COVID crisis line, kept as the permanent general state info line. 24/7, free (also from landline), ET/RU/EN, staffed largely by trained volunteers (180 trained in 2020). **Not** an emergency number. | [VERIFIED] |
| 1313 | Former Keskkonnainspektsioon (environment) hotline | **Merged into 1247** | [VERIFIED] |
| 1510 | Former road information line | **Merged into 1247** | [VERIFIED] |
| 1524, 1345 | Other short lines named in a 2019 plan to merge four numbers (1510, 1313, 1345, 1524). 1524 was the rescue info line. | Probably merged into 1247 | [UNSURE] |
| **612 3000** | PPA general information phone (*infotelefon*) | Only an old (2010) source found. Probably still the PPA switchboard. | [UNSURE] |
| korruptsioonivihje@politsei.ee / 612 3657 | Keskkriminaalpolitsei corruption tip line | Listed by Transparency International Estonia | [VERIFIED] |
| *Veebikonstaablid* | PPA "web constables": online tips and advice through social media and the web | Active page on politsei.ee | [VERIFIED] |
| General police tip line / e-mail (*vihjeliin*) | – | No current dedicated general tip number confirmed. Tips go via 112 (urgent), 1247, politsei.ee forms or web constables. | [UNSURE] |
| 116 111 | Lasteabi (child helpline) | Active | [LIKELY] |
| 116 006 | Ohvriabi kriisitelefon (victim support) | Active | [LIKELY] |
| 1220 | Perearsti nõuandeliin (GP advice) | Active | [LIKELY] |
| 16662 | Mürgistusteabe (poison info) | Active | [LIKELY] |

1247 handles environmental reports and storm problems (fallen trees or power lines on the road), injured or stranded wildlife, and large game killed on the road. Operators register the report and forward it to the right authority. [VERIFIED]

---

## 3. PPA event priority levels and response times

### 3.1 Alfa / Bravo / Charlie
These definitions come from the **PPA KILP open-data explanatory memo (2024)** and Postimees reporting [VERIFIED]:

| Priority | Definition (paraphrased from the PPA memo) | Patrol behaviour | Real examples |
|---|---|---|---|
| **CHARLIE** (highest) | Immediate police intervention is needed to remove a heightened, immediate danger or an immediate threat to someone's life. | The patrol **starts at once and drops** any lower-priority event or other activity. | Drunk person **lying on the road** (Postimees). Person waving a gun-like object (described as "kõige kõrgema prioriteediga väljakutse", about **2 per day** nationally, ~2022). |
| **BRAVO** | Police needed; the situation may escalate and timely intervention can reduce harm. | The patrol starts handling it **at the first opportunity**. | Upgraded knife-man call (Tallinn). A call forwarded by Häirekeskus driven "as a second-degree, bravo" call (ERR 2020). |
| **ALFA** (lowest) | Police involvement needed, but intervening **cannot improve the situation or reduce harm**. | Responded to at the first available opportunity, **with the resource best suited** to the event. It may be **delayed for hours** at busy times (weekend evenings and nights). | Drunk person **sleeping on a bench**. **Night-quiet (öörahu) violations** are "a very common Alfa call". |

- KILP memo definitions [VERIFIED]:
  - **prioriteet** = "a classification set by the event's threat assessment, which defines the requirements for responding".
  - **väljakutse** = "a KILP-registered event with Alfa, Bravo or Charlie priority tied to a PPA resource".
- Principle: police must respond to every event without undue delay, but when a higher-priority event arrives, a lower one is normally interrupted unless a free patrol exists. [VERIFIED]
- **Do not confuse with ambulance codes** (A/B/C/D, see §7.1). Ambulance "Charlie" means something else.
- No public share of A/B/C was found. [UNSURE]
  - **[DESIGN] default mix**: Charlie 10–15%, Bravo 35–40%, Alfa 45–55%.

### 3.2 Response-time statistics and targets
- **2016**: average response time to call-outs **30 min** (3 min faster than 2015). About **112 patrols** worked around the clock. [VERIFIED, Vaher]
- **2023** (Siseturvalisuse tulemusaruanne), life/health-threatening events [VERIFIED]:
  - **Tiheasustusala** (urban/dense areas): **82%** reached by police within **10.5 min**.
  - **Hajaasustusala** (rural/sparse areas): **74%** reached within **19.5 min**.
  - Response times were at the level of earlier years even though the average number of patrols fell.
- **2024**: in towns, **92%** of life/health-threat events were reached within the set limit; in rural areas **80%**. The target is **95%**. [VERIFIED]
  - Whether the 2024 limit is the same 10.5/19.5 min is [UNSURE].
- **Häirekeskus processing-time target** for life/health-threat reports: **≤ 2 min 15 s** (programme "Kiire ja asjatundlik abi 2025–2028"). Actuals were around 2.2–2.3 min in 2024. [VERIFIED target; actuals UNSURE]
- **Police helicopters** (PPA lennusalk): readiness to respond within **15 min** (same programme). [VERIFIED]
- **Patrol strength**:
  - Average daily patrol deployment (*keskmine väljapanek*): **2024: 62; 2023: 68; target 86**. [VERIFIED]
  - Whether 62 means simultaneous patrols or patrol-shifts per day is [UNSURE]. [DESIGN] treat it as the average number of crews on the road nationally at any time.
  - PPA had about 300 unfilled posts and staff about 2,000 lower than 15 years earlier. In 2026 it had about **4,500 staff**, the lowest ever. [VERIFIED]
- **Ambulance comparison**: ambulance arrival typically **8–15 min** in towns and **25–30+ min** in rural areas. **Police are often first on scene**, and the MoI is training police to give immediate life-saving help. [VERIFIED]

**[DESIGN] Response-time model:**
- Tallinn/Tartu Charlie: median 7–9 min, 80–90th percentile about 10.5 min.
- Rural Charlie: median 14–16 min, 75th percentile about 19.5 min, long tail 30–60 min on islands and in remote areas.
- Bravo: about 2× Charlie.
- Alfa: 30 min to several hours, or never on busy Friday/Saturday nights. Matches the 2016 average of about 30 min across all calls.

---

## 4. Volume: police events per day and year

### 4.1 National
- **2015** (PPA Facebook "24 h of calls" campaign): about **4,000 calls/day to 112, nearly 450 needing police**. [VERIFIED, old]
- **2016** (marathon): 650 posts in 24 h. **2017**: about **2,800 calls/day to 112, nearly 400 needing police**. [VERIFIED]
- **2018**: **308 police events/day** registered via 112 (Jan–Aug). [VERIFIED]
- **2016**: call-outs 5% lower than 2015, level with 2014. [VERIFIED]
- **2023–2024**: about **300–350 police events/day** (≈110–130k/year). [DERIVED, see §1.3]
- **Registered crimes**: **2023: 27,418; 2024: 28,345** (+3%, driven by property crime). [VERIFIED]

### 4.2 By region
PPA has four prefectures [LIKELY, current]:
- **Põhja** (Tallinn + Harjumaa)
- **Ida** (Ida-Viru + Lääne-Viru)
- **Lõuna** (Tartu, Jõgeva, Põlva, Valga, Viljandi, Võru)
- **Lääne** (Pärnu, Lääne, Saare, Hiiu, Rapla, Järva)

Exact county assignment is [LIKELY].

- Häirekeskus 112 call share, stable over years (2018/2019): **Põhja 46%, Lõuna 22%, Ida 19%, Lääne 13%**. Ida has the most calls per capita. [VERIFIED]
- Lääne region 2023: just over **12,000 police events** (≈33/day). [VERIFIED]
- **Rapla County 2024: 1,953 call-outs (≈6/day)**, mostly public order, then traffic, then offences against persons. [VERIFIED]
- [DESIGN] daily defaults (normal weekday → Friday/Saturday):

| Prefecture | Normal day | Friday/Saturday |
|---|---|---|
| Põhja | 140–160 | 190–220 |
| Lõuna | 60–75 | 80–100 |
| Ida | 55–70 | 70–90 |
| Lääne | 40–50 | 55–70 |

### 4.3 Peak days

| Event | Figure | Confidence / year |
|---|---|---|
| **New Year's Eve 2025/26** (likely) | **500+ police call-outs** overnight, "much busier than previous years". **70 domestic violence** responses. Narva stabbing: man killed his mother, wounded his sister and attacked the officer. | [VERIFIED]; year [LIKELY] |
| NYE (another year, ~2023/24) | 48 domestic violence call-outs | [VERIFIED]; year [LIKELY] |
| NYE (sobriety checks) | 1,700 drivers checked on 31 Dec, 8 drunk | [VERIFIED] |
| **Jaanipäev 2021** (likely) | **About 800 higher-priority call-outs over 22–23 June** (about 500 the year before). Patrols **roughly doubled**. DV about **50/day vs 30 normal**. | [VERIFIED]; year [LIKELY] |
| **Jaanipäev 2022** (likely) | **1,200+ call-outs on 23–24 June**, mostly alcohol and people endangering themselves. 24,000+ sobriety checks, **133 drunk drivers** (81 the year before). 100+ DV. 24 injury crashes, 3 dead. | [VERIFIED]; year [LIKELY] |
| Jaanipäev 2024 (likely) | 90 people taken to sober up, 105 DV incidents, knife incidents (e.g. Kadrina concert) | [VERIFIED]; year [LIKELY] |
| **Jaanipäev 2026** (19–23 June) | **317 crime reports, 889 misdemeanours, ~210 DV call-outs** (46 with a child as victim or witness). 38 injury crashes (3 dead, 45 injured). 32,000+ sobriety checks (~80 drunk). 190+ people taken to sober up. | [VERIFIED] |
| **Christmas 2025** (likely) | **159 DV responses**. Rescue had 164 call-outs by the morning of 26 Dec. | [VERIFIED]; year [LIKELY] |
| Häirekeskus on jaanipäev | +about 1,000 calls; staffing doubled for Midsummer night | [VERIFIED] |

---

## 5. Most common event types, shares and time patterns

### 5.1 Shares
- **2016**: public order **31%**, traffic **19%**, violence **14%** of call-outs. The remaining 36% includes property, missing persons, suspicious activity, assistance and so on. [VERIFIED for the three figures]
- **2024** (MoI performance report): **drunk-person incidents + offences against persons + night-quiet violations ≈ two thirds of all police call-outs in larger cities**. [VERIFIED]
- **2018** (Häirekeskus): most frequent police events relate to **drunk persons, police "teated"** (reports from attentive residents about suspicious drivers, troublesome neighbours, drunks) and **traffic accidents**. [VERIFIED]
- ~2018/2019: police get the most call-outs for violent incidents, mostly alcohol-fuelled. [VERIFIED]
- **Domestic violence (lähisuhtevägivald, LSV)**:
  - 2018: **15,125 calls, ~40/day**. [VERIFIED]
  - 2025: **~10,000 call-outs/year**. By ~Nov 2025 **7,000+ episodes** were recorded, about **1,000 with repeat victims**. [VERIFIED]
  - Normal day **~30** DV incidents; holiday peaks **~50**. [VERIFIED]
  - About 90% of DV reports come from the victim; 76% of perpetrators are men. Only about 40% of incidents reach police, and PPA estimates real incidence at up to 8× the recorded figure. [VERIFIED]
  - DV rose in the first half of 2026. [VERIFIED headline]
- **Night-quiet (öörahu)**: **920 reports nationwide in two weeks** (June 2021), about **65/day** in summer. Loud music is the main cause, usually handled with a verbal warning. Repeat offenders can have equipment seized. [VERIFIED]
- **Drunk-driver suspicion reports to 112**: 414 between 1 and 18 January 2020 (vs 288 a year earlier), about **23/day**. Reports spike after high-profile fatal crashes. [VERIFIED]
- **Weapon-like object waving**: about **2 call-outs/day** nationally, Charlie. [VERIFIED, ~2022]
- **Bomb suspicions** (abandoned bags etc.): **100+ call-outs over two years** (~1/week). Päästeamet bomb technicians (*demineerijad*) respond. [VERIFIED, 2026 article]
- **Fallen elderly** (until 2026): ~400–600/year. [VERIFIED]

### 5.2 [DESIGN] event-type table for game data
Shares are per 100 police events nationally. They are blended from the verified anchors above plus judgement, so treat them as design defaults, not statistics.

| Estonian label | English | Default priority | Share | Peak times |
|---|---|---|---|---|
| Joobes isik (avalikus kohas, abitu) | Intoxicated person, helpless or disturbing | A (C if on the road or hypothermia risk) | 14% | Fri/Sat 20–04; winter cold raises it to C |
| Avaliku korra rikkumine (lärm, kaklus, ähvardav käitumine) | Public order disturbance | A/B | 12% | Fri/Sat 22–04 |
| Öörahu rikkumine | Night-quiet violation (loud music, party) | A | 8% (summer 12%) | Weekdays 23–06, Fri/Sat 24–07 legal window [VERIFIED per ERR, check KorS § 55]; summer |
| Lähisuhtevägivald | Domestic violence | B (C if ongoing or weapon) | 9% | Evenings 18–02, weekends, holidays (×1.6) |
| Kehaline väärkohtlemine / kaklus | Assault / fight | B/C | 5% | Night-life hours |
| Liiklusõnnetus varalise kahjuga | Property-damage traffic collision | A/B | 7% | 07–09, 15–18; first snow/ice days ×2 |
| Liiklusõnnetus inimkannatanuga | Injury collision | C | 2% | As above, plus summer weekends on highways |
| Joobes juhi kahtlus / ohtlik juht | Suspected drunk or dangerous driver | B (C if imminent danger) | 5% | Evenings, weekends, holiday mornings |
| Kahtlane isik / sõiduk | Suspicious person or vehicle | A/B | 5% | Night |
| Vargus (pood) | Shoplifting (security guard holding suspect) | A | 5% | 11–21 |
| Vargus / sissemurdmine | Theft / burglary report | A/B (B if in progress) | 4% | Burglary in progress: day (homes), night (businesses) |
| Kadunud isik (laps, dementne eakas) | Missing person | B/C | 2% | Evening |
| Ähvardamine / relvataoline ese | Threats; weapon-like object | C | 1–2% | Any |
| Enesetapuoht / hädaohus isik | Suicide risk / person in danger | C | 2% | Night |
| Kelmus (telefonikelmus jne) | Fraud | A (often directed to written report) | 2% | Daytime |
| Naabrivaidlus | Neighbour dispute | A | 3% | Evening |
| Abistamine (teised teenistused) | Assist kiirabi/pääste (violent patient, cordon) | B | 4% | Any |
| Loom teel / ohtlik loom | Animal on the road (cow, elk) | A/B | 1% | Rural, dusk |
| Surnukeha leidmine | Body found (non-violent unless indicated) | B | 1% | Any |
| Kahtlane ese / pommiähvardus | Suspicious object / bomb threat | C (B for mass-mail threats) | <0.5% | Any |
| Muu | Other | – | rest | – |

### 5.3 Time patterns [mix]
- On a sample Friday-to-Saturday day (PPA 2018 Facebook campaign), alcohol-related events and **noise complaints dominated Saturday night and early morning**. Tallinn's sobering-up house (*kainestusmaja*) reported it was nearly full **after 03:00**. [VERIFIED]
- Weekend nights and holidays create the backlog in which Alfa calls wait. [VERIFIED]
- DV and alcohol cases peak on holidays: jaanipäev (23–24 June), Christmas (24–26 Dec), New Year's Eve, long weekends. [VERIFIED]
- **[DESIGN] hourly load curve**:
  - Weekday: trough 05–07 (index 0.4), morning rush crashes 07–09 (0.9), steady 10–16 (1.0), rising 17–22 (1.3), late peak 22–02 (1.2), decline 02–05 (0.7).
  - Friday/Saturday: 20–04 at 1.6–2.0.
  - Sunday: daytime low, evening DV bump.
- **[DESIGN] seasonality**:
  - Summer: more öörahu, festivals, water incidents, motorcycles; jaanipäev is the biggest day.
  - Winter: crash spikes on first-snow days, hypothermia risk for drunks (Alfa becomes Charlie).
  - December: shop thefts, Christmas DV.

---

## 6. Police terminology (Estonian → English)

### 6.1 Event handling
| Estonian | English / usage |
|---|---|
| **hädaabiteade** | Emergency report (legal term for what reaches 112) |
| hädaabikõne / hädaabinumber 112 | Emergency call / number |
| **teataja** (also helistaja, teavitaja) | Reporting person / caller ("teataja soovib jääda anonüümseks", "teataja liinil") |
| **päästekorraldaja** | Häirekeskus call handler |
| **ohuhinnang** / täiendav ohuhinnang | Threat assessment (Häirekeskus) / additional threat assessment (PPA) |
| **sündmus** | Event/incident (the generic unit in KILP) |
| **sündmuse liik** | Event type |
| **sündmuskoht** | Scene ("patrull jõudis sündmuskohale") |
| **väljakutse** | Call-out. In KILP: an event with an A/B/C priority tied to a PPA resource |
| **prioriteet: Alfa / Bravo / Charlie** | Priority levels |
| **teade** | Report / notification (also "teade kuriteost" = crime report) |
| operatiivteade | Operational message (KILP data category) |
| **juhtimiskeskus** | Police command centre (per prefecture) |
| juhtimiskeskuse korrapidaja | Command-centre duty officer / dispatcher |
| vahetuse vanem, grupijuht | Shift senior, group leader |
| **välijuht** | Field supervisor of patrols |
| **patrull** / patrullekipaaž / patrullpolitseinik | Patrol / patrol crew / patrol officer |
| kiirreageerija | Rapid-response officer (armed quick-reaction unit) [LIKELY] |
| piirkonnapolitseinik (konstaabel) | Community/district officer |
| noorsoopolitseinik | Youth officer |
| abipolitseinik | Volunteer auxiliary police officer |
| **reageerimine** / reageerimisaeg | Response / response time |
| väljasõit, kohalejõudmine | Dispatch/departure, arrival |
| väljakutse teenindamine | Handling a call-out (official phrase) |
| sündmuse lõpetamine | Closing the event |
| ressurss, vaba patrull | Resource, free patrol |
| tiheasustusala / hajaasustusala | Urban (dense) / rural (sparse) area: the basis of response targets |

### 6.2 Proceedings and coercive measures
| Estonian | English / usage |
|---|---|
| **menetlus** | Proceedings (generic) |
| **väärteomenetlus** | Misdemeanour proceedings (VTMS, *väärteomenetluse seadustik*) |
| kiirmenetlus | Expedited misdemeanour procedure (on-the-spot fine decision) [LIKELY] |
| hoiatamismenetlus | Warning procedure (e.g. speed cameras), *hoiatustrahv* [LIKELY] |
| **kriminaalmenetlus** | Criminal proceedings (KrMS, *kriminaalmenetluse seadustik*) |
| avaldus / kuriteoteade | Complaint / crime report |
| kahtlustatav, kannatanu, tunnistaja | Suspect, victim, witness |
| **kinnipidamine** | Detention. *Kahtlustatavana kinnipidamine* (KrMS § 217) up to 48 h before court [LIKELY] |
| **toimetamine** | Conveyance: *kainenema toimetamine* (to sober up), *arestimajja toimetamine*, *tervishoiuasutusse toimetamine* |
| kainestusmaja / kainenema | Sobering-up house / to sober up |
| arestimaja | Police detention house |
| isikusamasuse tuvastamine | Identity check |
| turvakontroll / läbiotsimine | Pat-down / search |
| **otsene sund**, erivahendid, käerauad | Direct coercion, special equipment, handcuffs |
| joobeseisund, joobe tuvastamine, kainuse kontroll, alkomeeter | Intoxication, establishing intoxication, sobriety check, breathalyser |
| roolijoodik / joobes juht | Drunk driver |
| ettekirjutus | Precept (administrative order) |
| **viibimiskeeld** | Ban on staying at a place (KorS § 44). In DV: removal of the aggressor for up to **72 h** (since 17.04.2026) [VERIFIED] |
| **lähenemiskeeld** | Restraining order (court-imposed, see §8) |
| lähisuhtevägivald (LSV) | Intimate-partner/domestic violence (current official term; *perevägivald* is older and colloquial) |
| avaliku korra rikkumine / **avaliku korra raske rikkumine** | Public order offence / serious public order offence (KarS § 263, crime, up to 5 years; used for bomb-threat mass mailings) [VERIFIED] |
| kehaline väärkohtlemine | Physical abuse/assault (KarS § 121) [LIKELY] |
| ähvardamine | Threatening (KarS § 120) [LIKELY] |
| vargus, väheväärtusliku asja vargus | Theft, petty theft (misdemeanour up to €220, KarS § 218) [LIKELY] |
| röövimine, kelmus, sissemurdmine | Robbery, fraud, break-in |
| liiklusõnnetus (LÕ) varalise kahjuga / inimkannatanuga | Traffic accident with property damage / with casualties |
| sündmuskohalt lahkumine | Leaving the scene (hit-and-run) |
| kadunud isik, otsingud | Missing person, search |

### 6.3 Abbreviations
| Abbreviation | Meaning |
|---|---|
| PPA | Politsei- ja Piirivalveamet |
| HÄK | Häirekeskus |
| PäA | Päästeamet |
| TeA | Terviseamet |
| SKA | Sotsiaalkindlustusamet |
| KeA | Keskkonnaamet |
| KAPO | Kaitsepolitseiamet |
| KILP | Politsei taktikalise juhtimise andmekogu |
| MIS | Menetlusinfosüsteem |
| KorS | Korrakaitseseadus |
| PPVS | Politsei ja piirivalve seadus |
| KarS | Karistusseadustik |
| KrMS | Kriminaalmenetluse seadustik |
| VTMS | Väärteomenetluse seadustik |
| VÕS | Võlaõigusseadus |
| LSV | Lähisuhtevägivald |
| LÕ | Liiklusõnnetus |
| JRCC Tallinn | Maritime rescue coordination centre (PPA) |

### 6.4 Writing conventions for in-game text
- Time is written with a period: **"kell 23.14"**. Dates: **17.10.2026**. [LIKELY]
- Addresses: "Tallinn, Lasnamäe linnaosa, Punane tn 16-45" (house-apartment). Rural: "Harju maakond, Kose vald, X küla, Y talu". Highways: "Tallinn–Tartu mnt (E263) km 38". [LIKELY]
- Registration plates: format "123 ABC" (3 digits + 3 letters). [LIKELY]

---

## 7. Coordination with other agencies

### 7.1 Kiirabi (ambulance)
- Häirekeskus dispatches ambulance crews (*kiirabibrigaad*) directly with a **väljasõidukorraldus** (dispatch order). [VERIFIED]
- Ambulance priorities (*kiirabi prioriteedid*) [VERIFIED]:

| Code | Patient condition |
|---|---|
| **D (delta)** | Life-threatening |
| **C (charlie)** | Serious, possibly life-threatening |
| **B (bravo)** | Not an emergency, no threat to life, or the caller cannot describe the condition |
| **A (alfa)** | Stable, no threat to life |

- Time limits [VERIFIED; UNSURE whether still current]:
  - D: crew in the vehicle within about 1 min, at the patient within about 15 min.
  - C: crew dispatched within 4 min.
  - A: older 2005 rule allowed dispatch within 2 h.
- Police assist ambulance with violent or intoxicated patients and are often first on scene (see §3.2).
- Cooperation is governed by "Kiirabi, haiglate ning päästeasutuste ja politsei kiirabialase koostöö kord" (2014). [VERIFIED]

### 7.2 Päästeamet (Rescue Board)
- Dispatched directly by Häirekeskus. [VERIFIED]
- Since **January 2019** crews may depart within **3 min** (instead of 1 min) for **lower-threat events** such as fallen trees and animal rescue. Häirekeskus adds a priority level to each rescue dispatch order. [VERIFIED]
- **Demineerimiskeskus** (Päästeamet's bomb-disposal centre) handles suspicious objects and abandoned bags. [VERIFIED for *demineerijad*]
- Typical joint events:
  - Injury traffic crash: police + kiirabi + pääste.
  - Fires with suspected arson.
  - Missing persons in water or forest.
  - Ice and sea rescue.
- Sea and air SAR are coordinated by **JRCC Tallinn** under PPA. The PPA helicopter has a 15-min readiness target. [VERIFIED/LIKELY]

### 7.3 Keskkonnaamet (Environmental Board)
- **Keskkonnainspektsioon merged into Keskkonnaamet in 2021.** [VERIFIED]
- Report to **1247**: pollution or risk of pollution, illegal logging, illegal fishing or other illegal use of nature, illegal waste dumping, mass animal or fish deaths, animal cruelty, large game killed on the road. [VERIFIED]
  - The operator registers the report and forwards it to the county's environmental inspectors. [VERIFIED]
- **Poaching / illegal hunting** goes to 1247, which forwards it to Keskkonnaamet inspectors. [VERIFIED]
  - Call **112** if there is immediate danger, e.g. shots near people, an armed confrontation or a serious spill. Police then attend as well. [LIKELY]
- In-game: an environmental event received on 112 with no danger → "forward to 1247 / Keskkonnaamet", not a patrol.

### 7.4 Kaitsepolitseiamet (KAPO, Internal Security Service)
- Investigates **terrorism** and crimes against the state (treason, espionage, constitutional order), plus high-level corruption. The basis is the investigative-jurisdiction regulation under KrMS § 212(4). [VERIFIED for crimes against the state and terrorism in older versions; LIKELY current]
- **Bomb threats are handled first by PPA** [VERIFIED]:
  - Threat e-mails to shopping centres were treated as malicious mass mailing, and *demineerijad* checked the premises.
  - PPA opened criminal proceedings for *avaliku korra raske rikkumine*.
  - Advice: stay calm, follow the site crisis plan and **call 112** for instructions.
- KAPO takes over if terrorist intent or a state-security link is suspected. [LIKELY]
- Armed or hostage situations use the PPA special unit **K-komando**. [LIKELY]

### 7.5 "Ühiskorralduskeskus"
- **No source found** for this term in Estonian official usage. [UNSURE / probably not a real institution name]
- What does exist [VERIFIED]:
  - **Shared premises**: Häirekeskus Põhja keskus and the PPA Põhja prefektuur juhtimiskeskus both list **Osmussaare 2, Tallinn**.
  - In **Jõhvi**, the Häirekeskus Ida keskus shares a building with the PPA Ida prefecture command centre, built to put them in one working environment.
  - There is a joint police and rescue building in Tapa.
- **[DESIGN]** The game may use a fictional "ühiskorralduskeskus" (joint dispatch room) as its setting. If so, label it fictional in the in-game codex.

### 7.6 Social side
- Social workers and municipalities (KOV) take fallen-elderly calls from Sept 2026 (§1.5).
- Child protection (*lastekaitse*) is informed when children are present at DV events. [LIKELY]

---

## 8. Domestic violence procedures: MARAC, viibimiskeeld, lähenemiskeeld

### 8.1 MARAC
- **MARAC** (*Multi-Agency Risk Assessment Conference*; Estonian *MARAC-võrgustik*) is a case-management model for victims at **high risk of death or serious harm** from intimate-partner violence. Estonia adopted it from the UK and Finland. [VERIFIED]
- Aim: prevent killings, suicides and serious harm. Premise: "no single agency can solve serious LSV cases alone". [VERIFIED]
- **Coordinated by Sotsiaalkindlustusamet (SKA)**: it runs the networks, training and quality control. **Ohvriabitöötajad** (victim-support workers) coordinate the core group and represent the victim. [VERIFIED]
- Members, usually: police, ohvriabi, municipal social worker and child protection, health care, prosecutor's office, women's support centre (*naiste tugikeskus*), sometimes probation and housing. [LIKELY]
- A risk-assessment questionnaire (DASH-based; Estonian *riskihindamise küsimustik*) is filled in by police or other agencies to flag high-risk cases. [VERIFIED that DASH is used in Estonia]
- Caseload example: 97 people assisted (97% women, 67% aged 26–45). [VERIFIED]
- In 2016 MARAC was still being piloted. It was rolled out nationally in later years. [VERIFIED / LIKELY]

### 8.2 Police on a DV call (typical sequence) [LIKELY unless marked]
1. Häirekeskus classifies it as LSV, usually **Bravo**, or **Charlie** if violence is ongoing, a weapon is present or there is a strangulation or death threat.
2. Patrol arrives, separates the parties, gives first aid and calls kiirabi if needed.
3. Patrol identifies children. Children were victims or witnesses in 46 of ~210 jaanipäev 2026 cases [VERIFIED].
4. Risk assessment; the case is flagged for MARAC if high risk.
5. Criminal proceedings for *kehaline väärkohtlemine* (KarS § 121) or *ähvardamine* (KarS § 120). The aggressor is detained or removed.
6. **Viibimiskeeld** (KorS § 44): police can now ban the aggressor from the home for **up to 72 h** (previously 12 h), **in force 17 April 2026**. [VERIFIED; year LIKELY]
   - Early PPA data: about one fifth of cases got 72 h and 25% got 48 h. Repeat violence was lower with longer bans. [VERIFIED]
   - The Justice Minister criticised the extended discretion. [VERIFIED]
7. Victim is referred to ohvriabi / 116 006 and a women's support centre. Child protection is informed.
8. Prosecutor may ask a court for **lähenemiskeeld**.

### 8.3 Lähenemiskeeld (restraining order)
- **In criminal proceedings**: KrMS § 141¹ (preliminary restraining order on the prosecutor's request, decided by a judge). [LIKELY]
- **Civil**: VÕS § 1055, on application to a court. [LIKELY]
- **Breach** is a crime: KarS § 331². [LIKELY]
  - Breaches are routinely charged alongside physical abuse. [VERIFIED that breach charges occur]
- Viibimiskeeld is a **police** measure lasting hours. Lähenemiskeeld is a **court** order lasting months to years. The ministry stresses they must not be confused. [VERIFIED]
- Policy debate: a November 2025 op-ed called gaps in victim protection out of hours a problem ("12 hours of protection") and proposed tougher penalties for breaches. [VERIFIED]

---

## 9. Example Häirekeskus → police event texts (illustrative, fictional)
These are **invented** examples in a realistic terse style. Real cards are not public, so the field layout below is **[DESIGN]** based on the KILP data groups (reporter location, event time, address, description) [VERIFIED as data groups]. Names, addresses and numbers are fictional.

### 9.1 Full event card
```
SÜNDMUS 26-1017-04471          17.10.2026 kell 23.14
PRIORITEET: CHARLIE             LIIK: Lähisuhtevägivald (füüsiline, toimumas)
AADRESS: Tallinn, Lasnamäe linnaosa, Punane tn 16-45, 5. korrus, uksekood 4512
TEATAJA: naine (ohver), tel 5xx xxxx, on liinil, lukustanud end vannituppa
KIRJELDUS: Elukaaslane (M, u 40 a) joobes, lõi rusikaga näkku, ähvardab tappa.
  Kodus 2 last (4 ja 7 a). Köögis noad, ründaja käes relva hetkel pole teada.
VIGASTUSED: ninaverejooks, teadvusel.  KIIRABI: välja saadetud (C).
OHUD: joove, külmrelv võimalik, lapsed korteris.
---- PPA juhtimiskeskus lisas: aadressil 3 LSV-sündmust 12 kuu jooksul;
     isikul kehtiv lähenemiskeeld? -> kontrollimisel.
```

### 9.2 One-liners (as they would appear in a dispatch queue)
- **C** | Joobes mees lamab sõiduteel, Pärnu mnt / Tammsaare tee ristmik, autod põiklevad. Teataja jääb kohale.
- **A** | Joobes mees magab bussipeatuse pingil, Mustamäe tee 50 juures, reageerib kõnetamisele, ilm +12.
- **A** | Öörahu rikkumine: vali muusika ja karjumine korterist, Tartu, Anne tn 57-xx, kestnud kell 23-st. Teataja naaber, ei soovi kohtuda.
- **B** | LÕ varalise kahjuga, 2 sõiduautot, Tartu mnt 80, kannatanuid pole, sõidukid takistavad liiklust, osalised vaidlevad.
- **C** | LÕ inimkannatanuga, Tallinn–Narva mnt km 38, sõiduauto katusel kraavis, 1 inimene sees. Kiirabi (D) ja pääste väljas.
- **B** | Joobes juhi kahtlus: hall VW Passat 123 ABC, Tallinnast Tartu suunas, Kose ristmikust möödas, looklev sõit, teataja sõidab järel.
- **A** | Poevargus: kauplus, Rakvere, turvatöötaja peab kinni mehe (u 30 a), alkohol 38 €, rahulik.
- **B** | Kaklus ööklubi ees, Tartu, Rüütli tn, 4–5 noormeest, ühel peast veri. Turvamehed juures. *(Upgrade to C if a knife is seen.)*
- **C** | Mees vehib püstolitaolise esemega, Narva, bussijaama juures, liigub kesklinna suunas. Tume jope, hall müts, u 25 a.
- **B** | Kadunud laps: poiss 8 a, pole koolist koju jõudnud (pidi olema kell 15.00), Viljandi. Sinine jope, punane seljakott.
- **A** | Kahtlane sõiduk seisab tühjal kinnistul, tuled kustus, 2 meest sees, Harjumaa, Saue vald. Teataja kardab vargust.
- **C** | Enesetapuoht: naine helistas, ütles et võttis tablette ja katkestas kõne. Asukoht: mobiilipositsioon Pärnu, Rääma linnaosa, raadius 300 m. Kiirabi välja saadetud.
- **C** | Kahtlane kohver bussipeatuses, Tallinn, Vabaduse väljak, omanikku pole 40 min. *(Plus Päästeamet demineerijad.)*
- **→ 1247** | Teataja nägi metsas ebaseaduslikku raiet, ohtu inimestele pole. Suunatud Keskkonnaametile, patrulli ei saadeta.

### 9.3 Mid-call priority change (realistic pattern)
```
23.41 ALFA   Lärm ja karjumine naaberkorterist.
23.43 BRAVO  Teataja kuuleb klaasi purunemist, naine karjub "appi".
23.44 CHARLIE Teataja: mees ähvardab noaga, uks lahti, naine trepikojas veritsev.
```

---

## 10. Open uncertainties
1. **Exact 2024–2025 national police event count** and per-prefecture breakdown. Not found; numbers here are derived. PPA open data (the KILP explanatory memo dated 2024-12-12 on politsei.ee) may contain event-level data worth downloading manually.
2. **Share of Alfa/Bravo/Charlie**. Not public in the search results.
3. **2024 response limits**: whether the 92%/80% figures use the same 10.5/19.5 min limits.
4. **Technical hand-off** Häirekeskus → PPA. The regulation and data flow are verified; the system interface and whether calls are ever live-transferred are not public.
5. **612 3000** and any general **vihjeliin**. Only old sources.
6. Fate of **1524 and 1345** after the 1247 consolidation.
7. Exact **county split** of Häirekeskus regional centres.
8. **"Ühiskorralduskeskus"** is not an attested official term.
9. Exact paragraphs for lähenemiskeeld (KrMS § 141¹, VÕS § 1055, KarS § 331²): from memory, not re-verified.
10. Years of several ERR holiday reports are inferred from article IDs.

---

## Sources (from search results)
- ERR: Politsei lühinumber 110 lõpetas töö: https://www.err.ee/1058502/politsei-luhinumber-110-lopetas-too
- ERR: Alates märtsist numbrile 110 helistades politseid kutsuda ei saa: https://www.err.ee/1021133/alates-martsist-numbrile-110-helistades-politseid-kutsuda-ei-saa
- ERR News: Emergency response number 110 cannot be called from March: https://news.err.ee/1021156/emergency-response-number-110-cannot-be-called-from-march
- Siseministeerium: Siseturvalisuse 2024. aasta tulemusaruanne: https://siseministeerium.ee/sites/default/files/documents/2025-06/Siseturvalisuse%202024.%20aasta%20tulemusaruanne.pdf
- Siseministeerium: Siseturvalisuse 2023. aasta tulemusaruanne: https://siseministeerium.ee/sites/default/files/documents/2024-06/%E2%80%9ESiseturvalisuse%202023.%20aasta%20tulemusaruanne%E2%80%9C.pdf
- Siseturvalisuse 2022. aasta tulemusaruanne: https://siseministeerium.ee/sites/default/files/documents/2023-05/Siseturvalisuse%202022.%20aasta%20tulemusaruanne.pdf
- Programm "Kiire ja asjatundlik abi 2025–2028": https://www.siseministeerium.ee/sites/default/files/documents/2025-01/Lisa%202.%20Programm%20Kiire%20ja%20asjatundlik%20abi%202025-2028.pdf
- PPA: 2024 Avaandmete seletuskiri, KILP: https://www.politsei.ee/files/2025-01/ppa-avaandmete-seletuskiri-kilp-20241212.pdf
- Riigi Teataja: Politsei taktikalise juhtimise andmekogu põhimäärus: https://www.riigiteataja.ee/akt/121102025017
- Riigi Teataja: Hädaabiteadete menetlemise kord…: https://www.riigiteataja.ee/akt/122122016013 and https://www.riigiteataja.ee/akt/122062022011
- Riigi Teataja: Hädaabiteadete menetlemise andmekogu põhimäärus: https://www.riigiteataja.ee/akt/107072020009
- Postimees: Politsei reageerimiskiirusest: on vahe, kas joodik magab pingil või sõiduteel: https://www.postimees.ee/3086455/politsei-reageerimiskiirusest-on-vahe-kas-joodik-magab-pingil-voi-soiduteel
- Postimees: Ajajoon: häirekeskus muutis käigult nugadega mehe väljakutse prioriteeti: https://www.postimees.ee/4303469/ajajoon-hairekeskus-muutis-kaigult-nugadega-mehe-valjakutse-prioriteeti
- ERR: PPA hinnangul on personalikulude kärpimine keeruline: https://www.err.ee/1609361702/ppa-hinnangul-on-personalikulude-karpimine-keeruline
- ERR: Vaher: mullu oli väljakutseid politseile vähem, reageerimine kiirem: https://www.err.ee/581036/vaher-mullu-oli-valjakutseid-politseile-vahem-reageerimine-kiirem
- 112.ee structure: https://www.112.ee/en/structure ; trends: https://112.ee/en/trends ; Sündmused – Trendid: https://www.112.ee/et/juhend/trendid/sundmused
- 112.ee aasta 2019: https://www.112.ee/files/2020-01/aasta-2019.pdf
- 112.ee Põhja keskuse põhimäärus: https://www.112.ee/files/2025-10/lisa-4-hairekeskuse-pk-pohimaarus.pdf
- 112.ee päästekorraldaja ametijuhend: https://www.112.ee/files/2023-02/lisa-1-ametijuhend-paeaestekorraldaja.pdf
- MKM/SIM presentation 112 (03.12.2024): https://mkm.ee/sites/default/files/documents/2024-12/Esitlus%2C%20112%2C%20Kadi%20Luht-Kallas%2C%20SIM%2C%2003.12.2024.pdf
- Lääne Elu: Häirekeskus: lääne piirkonnast tehti eelmisel aastal elanike kohta kõige vähem hädaabikõnesid: https://online.le.ee/2024/02/13/hairekeskus-laane-piirkonnast-tehti-eelmisel-aastal-elanike-kohta-koige-vahem-hadaabikonesid/
- ERR: Pühade ajal tuleb 112 helistades arvestada pikema ooteajaga: https://www.err.ee/1609376930/puhade-ajal-tuleb-112-helistades-arvestada-pikema-ooteajaga
- ERR: Ministeerium tahab karistada häirekeskuse töö takistajaid: https://www.err.ee/1609036124/ministeerium-tahab-karistada-hairekeskuse-too-takistajaid
- ERR: Häirekeskuse IT-süsteem vajab uuendamist: https://www.err.ee/1609735647/hairekeskuse-it-susteem-vajab-uuendamist
- ERR: Välismaalt saab Eesti häirekeskuse kätte numbril 6000 112: https://www.err.ee/911862/valismaalt-saab-eesti-hairekeskuse-katte-numbril-6000-112
- ERR: Infoabi telefoninumber 1247 jääb ka eriolukorra järel küsimustele avatuks: https://www.err.ee/1093340/infoabi-telefoninumber-1247-jaab-ka-eriolukorra-jarel-kusimustele-avatuks
- ERR News: 1247 new general information number: https://news.err.ee/1226011/1247-new-general-information-number
- ERR: Häirekeskus plaanib neli abinumbrit liita üheks: https://www.err.ee/937649/hairekeskus-plaanib-neli-abinumbrit-liita-uheks
- Keskkonnaamet: Inform us of breaches 1247: https://keskkonnaamet.ee/en/supervision-helpline-1247/informing/informing-board-breaches
- Keskkonnaamet: Environmental information via 1247: https://keskkonnaamet.ee/en/news/environmental-information-can-be-reported-national-hotline-1247-new-year
- Transparency.ee: Who else can you report to?: https://transparency.ee/en/node/3525
- politsei.ee Web constables: https://www.politsei.ee/en/web-constables
- ERR: Politsei reageeris aastavahetusel enam kui pooletuhandele väljakutsele: https://www.err.ee/1609898911/politsei-reageeris-aastavahetusel-enam-kui-pooletuhandele-valjakutsele
- ERR News: First responders and emergency staff kept busy over New Year's: https://news.err.ee/1609898917/first-responders-and-emergency-staff-kept-busy-over-new-year-s
- ERR: Politsei kutsuti aastavahetusel lähisuhtevägivalla tõttu välja 48 korral: https://www.err.ee/1609209298/politsei-kutsuti-aastavahetusel-lahisuhtevagivalla-tottu-valja-48-korral
- ERR: Politseile möödusid pühad mullusest töisemalt: https://www.err.ee/1608257208/politseile-moodusid-puhad-mullusest-toisemalt
- ERR: Jaanipühadel tegid politseile muret joobes juhid ja liiklusõnnetused: https://www.err.ee/1608639565/jaanipuhadel-tegid-politseile-muret-joobes-juhid-ja-liiklusonnetused
- ERR: Töised pühad: politsei viis kainenema 90 inimest…: https://www.err.ee/1609380005/toised-puhad-politsei-viis-kainenema-90-inimest-ule-saja-perevagivalla-juhtumi
- ERR: Politsei ja päästeameti jaoks möödus jaanilaupäev töiselt: https://www.err.ee/1610062135/politsei-ja-paasteameti-jaoks-moodus-jaanilaupaev-toiselt
- ERR: Pühad möödusid nii päästjatele kui ka politseinikele töiselt: https://www.err.ee/1609895341/puhad-moodusid-nii-paastjatele-kui-ka-politseinikele-toiselt
- ERR: Politsei avalikustatud väljakutsetes andsid tooni alkoholiga seotud juhtumid: https://www.err.ee/870365/politsei-avalikustatud-valjakutsetes-andsid-tooni-alkoholiga-seotud-juhtumid
- ERR: Politsei argipäevik: „Tartus magavad kaks meest kiriku esikus laua peal“: https://www.err.ee/614809/politsei-argipaevik-tartus-magavad-kaks-meest-kiriku-esikus-laua-peal
- ERR News: Cow by the road: Estonian police post real emergency calls for 24 hours: https://news.err.ee/614906/cow-by-the-road-estonian-police-post-real-emergency-calls-for-24-hours
- ERR: Mullu oli politseile suurimaks probleemiks napsist alanud vägivald: https://www.err.ee/896973/mullu-oli-politseile-suurimaks-probleemiks-napsist-alanud-vagivald
- ERR News: Police receive 40 domestic violence calls per day in 2018: https://news.err.ee/896868/police-receive-40-domestic-violence-calls-per-day-in-2018
- ERR: Politseijuht: oleme sageli vaid plaastri panijad: https://www.err.ee/1609853718/politseijuht-oleme-sageli-vaid-plaastri-panijad
- ERR: Öörahu rikkumiste teadete arv on suvel suurenenud: https://www.err.ee/1608275766/oorahu-rikkumiste-teadete-arv-on-suvel-suurenenud
- ERR: Häirekeskus: roolijoodikutest antakse aina rohkem teada: https://www.err.ee/1025741/hairekeskus-roolijoodikutest-antakse-aina-rohkem-teada
- ERR: "Pealtnägija": relvataolise esemega vehkimist on Eestis järjest rohkem: https://www.err.ee/1608798094/pealtnagija-relvataolise-esemega-vehkimist-on-eestis-jarjest-rohkem
- ERR: Pommikahtluste arv Eestis kasvab: https://www.err.ee/1610061553/pommikahtluste-arv-eestis-kasvab
- ERR: Politsei pommiähvardustest: käitumisnõu tasub küsida häirekeskusest: https://www.err.ee/1609129862/politsei-pommiahvardustest-kaitumisnou-tasub-kusida-hairekeskusest
- ERR: Tallinna nelja kaubanduskeskust tabasid pommiähvardused: https://www.err.ee/925567/tallinna-nelja-kaubanduskeskust-tabasid-pommiahvardused
- Riigi Teataja (KAPO/police investigative jurisdiction, older versions): https://www.riigiteataja.ee/akt/12855768.pdf ; https://www.riigiteataja.ee/akt/13327530.pdf
- ERR: Häirekeskus ei tohi enam kukkunud eakale politseid appi saata: https://www.err.ee/1610125582/hairekeskus-ei-tohi-enam-kukkunud-eakale-politseid-appi-saata
- ERR: Päästjad ei pea enam madalama ohutasemega väljakutsetele minuti jooksul reageerima: https://www.err.ee/1020976/paastjad-ei-pea-enam-madalama-ohutasemega-valjakutsetele-minuti-jooksul-reageerima
- Riigi Teataja: VV 119 lisa 1 (kiirabi priorities, 2005): https://www.riigiteataja.ee/aktilisa/1210/7202/2005/VV_119m_lisa1.pdf
- PERH Kiirabikeskus 2018 I kv (priority definitions): https://perh.dbweb.ee/sites/default/files/documents/Kiirabikeskuse_2018_aasta_I_kvartali_too_kokkuvote_0.pdf
- Siseministeerium: Eriväljaõppega politseinik saab tulevikus eluohtlikus seisundis inimest kohe aidata: https://siseministeerium.ee/uudised/erivaljaoppega-politseinik-saab-tulevikus-eluohtlikus-seisundis-inimest-kohe-aidata
- Sotsiaalkindlustusamet MARAC pages: https://www.sotsiaalkindlustusamet.ee/node/9953/chapter/15263/pdf ; https://www.sotsiaalkindlustusamet.ee/node/12902/chapter/20378/pdf
- UT MARAC study final report: https://skytte.ut.ee/sites/default/files/2022-08/maraci_uuringu_lopparuanne.pdf
- ERR: Riigikogu andis politseile õiguse kehtestada kuni 72-tunnine viibimisekeeld: https://www.err.ee/1609971083/riigikogu-andis-politseile-oiguse-kehtestada-kuni-72-tunnine-viibimisekeeld
- ERR: Politsei: pikem viibimiskeeld on end õigustanud: https://www.err.ee/1610128387/politsei-pikem-viibimiskeeld-on-end-oigustanud
- Siseministeerium: Siseminister Taro: 72-tunnine viibimiskeeld…: https://www.siseministeerium.ee/uudised/siseminister-taro-72-tunnine-viibimiskeeld-aitab-katkestada-vagivallaringi-ja-kaitsta
- Reform.ee (Timo Suslov op-ed): https://reform.ee/uudised/timo-suslov-kolm-oist-sonumit-ja-12-tundi-kaitset-kus-jaavad-lahisuhtevagivalla-ohvrid-hetkel-hatta/
- Raplamaa turvalisuse raport 2024: https://rol.raplamaa.ee/wp-content/uploads/2025/03/Raplamaa-turvalisuse-raport-2024-1.pdf
- Justdigi KP2030 aruanne 2024 (28,345 crimes): https://www.justdigi.ee/sites/default/files/documents/2025-05/KP2030%20k%C3%B5ne%202024.%20aasta%20kohta.pdf
- PPA job descriptions (juhtimiskeskus korrapidaja etc.): https://www.politsei.ee/files/jobdescriptions/jb1ivl8fj4xnvcvkimek.pdf ; https://www.politsei.ee/files/jobdescriptions/kq9vyscng9qwfcrlm2d5.pdf ; https://www.politsei.ee/files/jobdescriptions/vz2n0kjt9quwud4fvcxm.pdf
- politsei.ee Põhja prefektuur juhtimiskeskus contacts: https://www.politsei.ee/en/contacts/pohja_prefektuur/operatiivbyroo/juhtimiskeskus
- Õiguskantsler, väljakutse teenindamine (2024): https://www.oiguskantsler.ee/sites/default/files/2024-11/6iguskantsleri_seisukoht_oigusrikkumise_puudumise_kohta_valjakutse_teenindamine.pdf
- Riigikogu seletuskiri (HÄK statute / PPA dispatches its own patrols): https://www.riigikogu.ee/download/1dddcab1-cea2-43a0-81aa-955f260d8e90
