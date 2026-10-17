# Estonian law references for criminal records and offence codes

Research notes for **EPD**, an unofficial fan-made dispatch game. EPD is not affiliated with Politsei- ja Piirivalveamet (PPA). This is not legal advice.
Compiled 2026-10-17 for `src/data/laws.ts` (the `Law` interface) and `CriminalRecord` in `src/sim/types.ts`.

> **Read this first: nothing here is [VERIFIED].**
> The web-search budget for this workflow run was already used up before this note was written. Not one search ran, and direct page fetches are blocked. Every entry below comes from prior knowledge of Estonian law (KarS and the related acts as they stood around 2024–2025).
> - **No entry is tagged [VERIFIED].**
> - Before shipping, check paragraph numbers on Riigi Teataja (riigiteataja.ee, consolidated text "terviktekst"; English translations at riigiteataja.ee/en). The checklist is in section 9.
> - Entries tagged [UNSURE] should not be shown to players as fact until they have been checked.

**Confidence tags**
- **[VERIFIED]**: seen in a search result. *(Nothing in this document.)*
- **[LIKELY]**: strong prior knowledge, not contradicted. A paragraph number tagged [LIKELY] is probably right, but still check it.
- **[UNSURE]**: plausible but unconfirmed. This covers paragraph numbers recalled only partly, penalty amounts, and wording that may have changed in reforms.
- **[DESIGN]**: a suggestion for game data, not a real-world fact.

Notation: `§ 331²` = paragraph 331 superscript 2 (written `331^2` or `331-2` in ASCII). `lg` = lõige (subsection) and `p` = punkt (clause), so a record cites e.g. "KarS § 199 lg 2 p 2". `a` = aasta (year), `k` = kuu (month), `TÜ` = trahviühik (fine unit), `pm` = päevamäär (daily rate).

Acts referenced:
- **KarS**: Karistusseadustik (Penal Code)
- **LS**: Liiklusseadus (Traffic Act)
- **KorS**: Korrakaitseseadus (Law Enforcement Act)
- **NPALS**: Narkootiliste ja psühhotroopsete ainete ning nende lähteainete seadus (Narcotic Drugs and Psychotropic Substances Act)
- **RelvS**: Relvaseadus (Weapons Act)
- **JahiS**: Jahiseadus (Hunting Act)
- **VTMS**: Väärteomenetluse seadustik (Code of Misdemeanour Procedure)
- **KrMS**: Kriminaalmenetluse seadustik (Code of Criminal Procedure)
- **KRS**: Karistusregistri seadus (Criminal Records Database Act)
- **LKindlS**: Liikluskindlustuse seadus (Motor Insurance Act)

---

## 0. TL;DR for game designers

| Topic | Key fact | Confidence |
|---|---|---|
| Two kinds of offence | **Kuritegu** (criminal offence) or **väärtegu** (misdemeanour). Both are *süüteod*. A väärtegu can only be punished by a fine (*rahatrahv*) or detention (*arest*). | [LIKELY] |
| Fine unit | **1 trahviühik = €4** (KarS § 47). A väärtegu fine is **3–300 TÜ = €12–1,200** for a natural person. Raising the unit has been discussed politically, so check the current § 47. | [LIKELY] for €4; any change after 2025 [UNSURE] |
| Two different "fines" | A **rahatrahv** is a väärtegu fine counted in TÜ. A **rahaline karistus** is a criminal fine counted in **päevamäärad (30–500)**. Records must not mix them up. | [LIKELY] |
| Arest | Väärtegu detention of **1–30 days** (*ööpäeva*), KarS § 48. | [LIKELY] |
| Prison | **30 days to 20 years, or life** (*eluaegne vangistus*), KarS § 45. | [LIKELY] |
| Alcohol limit (driving) | Alcohol intoxication (*alkoholijoove*) starts at **0.20 mg/g in blood (0.2 ‰)** or **0.10 mg/l in exhaled air**. The limit is the same for all drivers, including novices. | [LIKELY] |
| Drunk driving as a väärtegu | 0.20–1.49 ‰ (0.10–0.74 mg/l): **LS § 224**, a fine up to 300 TÜ or arest, plus loss of licence. | [LIKELY] |
| Drunk driving as a crime | **≥ 1.5 ‰ (≥ 0.75 mg/l)**, or repeat drunk driving: **KarS § 424**, a criminal fine or up to 3 years in prison. | [LIKELY] |
| Speeding | Speeding is **never a crime by itself**: it is a väärtegu under **LS § 262**, in speed tiers. It becomes criminal only when it causes serious injury or death (KarS traffic-accident crime). | [LIKELY] |
| Drugs | Small amount or own use: **NPALS § 15**, a väärtegu (≤ 300 TÜ or arest). Large amount: **KarS § 184**, a crime with **1–10 years**. | [LIKELY] |
| Restraining order breach | **KarS § 331²**, a crime | [LIKELY] for the §; penalty [UNSURE] |
| Age of criminal responsibility | **14** (KarS § 33) | [LIKELY] |
| Police custody of a suspect | Up to **48 h** before a court must order arrest (KrMS § 217) | [LIKELY] |

---

## 1. Constants for the punishment generator

| Constant | Value | Source | Confidence |
|---|---|---|---|
| Trahviühik (TÜ) | €4 | KarS § 47 lg 1 | [LIKELY] |
| Väärtegu fine, natural person | 3–300 TÜ (€12–1,200). Many offence paragraphs set a lower cap, e.g. "kuni 100 TÜ". | KarS § 47 | [LIKELY] |
| Väärtegu fine, legal person | up to €400,000, unless the offence paragraph sets less | KarS § 47 lg 2 | [LIKELY] |
| Väärtegu arest | 1–30 ööpäeva | KarS § 48 | [LIKELY] |
| Hoiatustrahv (on-the-spot warning fine) | A fixed small fine given without full proceedings. Cap was about €190, and speed cameras charged about €3 per km/h over the limit. These amounts may have changed. | VTMS § 54 / § 54¹ | concept [LIKELY]; amounts and § [UNSURE] |
| Rahaline karistus (criminal fine) | 30–500 päevamäära. Päevamäär = the offender's average daily net income, with a floor of about €10. | KarS § 44 | range [LIKELY]; floor [UNSURE] |
| Vangistus | 30 days – 20 years, or eluaegne (life) | KarS § 45 | [LIKELY] |
| Tingimisi vangistus (suspended sentence) | Katseaeg (probation period) **18 months – 5 years**. § 73: without supervision. § 74: with *käitumiskontroll* (supervised by a probation officer). | KarS §§ 73–74 | [LIKELY] |
| Osaline tingimisi (partly suspended, "šokivangistus") | Part of the sentence is served, the rest is suspended | KarS § 74 | [LIKELY] |
| Üldkasulik töö (community service) | Replaces prison of up to 2 years. 1 day of prison = 2 hours of work. | KarS § 69 | [LIKELY] |
| Elektrooniline valve (electronic tag) | An alternative to serving a short prison sentence | KarS § 75 | [LIKELY] |
| Juhtimisõiguse äravõtmine (licence removal, an additional penalty) | Crime: up to 3 years. Väärtegu: up to 12 months. | KarS § 50 | [LIKELY] |
| Konfiskeerimine (confiscation) | Courts may confiscate the vehicle used in a crime. This is used against repeat or heavy drunk drivers. | KarS § 83 | [LIKELY] |
| Suur kahju / eriti suur kahju (large / very large damage) | over €40,000 / over €400,000. These are the "suures ulatuses" thresholds for property crimes. | KarS general part | [LIKELY] |
| Väheses ulatuses (petty property) threshold | Value up to **€200** makes it a väärtegu (KarS § 218). There is a faint recollection of a later rise to €400; before 2015 it was €64. | KarS § 218 | [UNSURE] |
| Suur kogus (large quantity) of drugs | Enough to intoxicate **at least 10 people**. This comes from Riigikohus (Supreme Court) case law. | court practice | [LIKELY] |
| Öörahu (night quiet) | 23:00–07:00 | KorS | time [LIKELY]; § [UNSURE] |
| Kinnipidamine kahtlustatavana (custody as a suspect) | up to 48 h | KrMS § 217 | [LIKELY] |
| Viibimiskeeld (removal order, domestic violence) | KorS § 44. Extended to up to 72 h (see `112-and-priorities.md`). | KorS § 44 | per that doc |
| Age of criminal responsibility | 14 | KarS § 33 | [LIKELY] |
| Attempt / complicity | Attempt: **KarS § 25** (*katse*), cited together with the offence, e.g. "KarS § 25 lg 2, § 114" = mõrvakatse (attempted murder). Complicity: **§ 22** (*kihutaja*, instigator; *kaasaaitaja*, accessory). | KarS §§ 22, 25 | [LIKELY] |

---

## 2. Main table: criminal offences (kuriteod)

Format: shortName | full Estonian name | act & paragraph | kuritegu/väärtegu | typical punishment range | confidence (for § and punishment separately).

### 2.1 Offences against the person

| shortName | Full Estonian name | Act & § | Type | Typical punishment range | Confidence |
|---|---|---|---|---|---|
| murder | Mõrv | KarS § 114 | kuritegu | 8–20 a vangistus või eluaegne vangistus | §[LIKELY] pun[LIKELY] |
| manslaughter | Tapmine | KarS § 113 | kuritegu | 6–15 a vangistus | §[LIKELY] pun[LIKELY] |
| attempted_murder | Mõrvakatse | KarS § 25 lg 2, § 114 | kuritegu | the court may reduce the § 114 range | concept [LIKELY] |
| negligent_homicide | Ettevaatamatusest surma põhjustamine | KarS § 117 | kuritegu | lg 1: rahaline karistus või kuni 3 a. lg 2 (2+ victims): kuni 5 a. | §[LIKELY] pun[UNSURE] |
| grievous_harm | Raske tervisekahjustuse tekitamine | KarS § 118 | kuritegu | 4–12 a vangistus | §[LIKELY] pun[LIKELY] |
| assault | Kehaline väärkohtlemine | KarS § 121 lg 1 | kuritegu (even a minor assault is a crime, not a väärtegu) | rahaline karistus või kuni 3 a vangistus | §[LIKELY] pun[LIKELY] |
| assault_domestic | Kehaline väärkohtlemine lähedase vastu (*lähisuhtevägivald*) | KarS § 121 lg 2 (p 2: against a close person or someone in a relationship of dependency) | kuritegu | kuni 5 a vangistus | §[LIKELY] clause[UNSURE] pun[LIKELY] |
| threat | Ähvardamine | KarS § 120 lg 1 | kuritegu | rahaline karistus või kuni 1 a | §[LIKELY] pun[LIKELY] |
| threat_aggravated | Ähvardamine (lähedase vastu / alaealise juuresolekul) | KarS § 120 lg 2 | kuritegu | kuni 3 a | [UNSURE] |
| stalking | Ahistav jälitamine | KarS § 157³ | kuritegu | rahaline karistus või kuni 1 a | §[LIKELY] pun[UNSURE] |
| restraining_breach | Lähenemiskeelu rikkumine. The official title may be longer, roughly "Lähenemiskeelu ja muude isiku kaitseks kohaldatud abinõude rikkumine". | KarS § 331² | kuritegu | rahaline karistus või kuni 1 a vangistus | §[LIKELY] title[UNSURE] pun[UNSURE] |

### 2.2 Liberty, trafficking, sexual offences

| shortName | Full Estonian name | Act & § | Type | Typical punishment range | Confidence |
|---|---|---|---|---|---|
| false_imprisonment | Isikuvabaduse ebaseaduslik võtmine | KarS § 136 | kuritegu | lg 1: rahaline karistus või kuni 3 a. Aggravated cases (violence, against a minor, long duration): roughly 1–10 a. | §[UNSURE] (leaning yes) pun[UNSURE] |
| kidnapping / hostage | Inimrööv / Pantvangi võtmine | a neighbouring paragraph (§ 134–137 range). The exact number was not determined. | kuritegu | roughly 5–15 a | [UNSURE] |
| human_trafficking | Inimkaubandus | KarS § 133 | kuritegu | lg 1: 1–7 a. lg 2 (aggravated, e.g. a minor victim or a group): 3–15 a. | §[LIKELY] pun[LIKELY] |
| rape | Vägistamine | KarS § 141 | kuritegu | lg 1: about 1–6 a (1–5 a before the 2024 consent-based reform). lg 2 (aggravated): 6–15 a. | §[LIKELY] pun[UNSURE]; 2024 reform date [UNSURE] |

> [DESIGN] Consider leaving sexual offences, and offences against children, out of random background generation, or keep them abstract. They add little to gameplay and are easy to get wrong in tone.

### 2.3 Property offences

| shortName | Full Estonian name | Act & § | Type | Typical punishment range | Confidence |
|---|---|---|---|---|---|
| theft | Vargus | KarS § 199 lg 1 | kuritegu | rahaline karistus või kuni 3 a vangistus | §[LIKELY] pun[LIKELY] |
| burglary | Vargus (ruumi/hoidlasse tungimisega, i.e. *murdvargus*) | KarS § 199 lg 2 (break-in is one of the clauses; others: weapon, group, large scale) | kuritegu | rahaline karistus või kuni 5 a | §[LIKELY] clause[UNSURE] pun[UNSURE] |
| petty_theft | Väheses ulatuses varavastane süütegu (shoplifting / pisivargus) | KarS § 218 | **väärtegu** (a repeat may become a crime) | rahatrahv (up to 300 TÜ) või arest | §[LIKELY] threshold[UNSURE] |
| robbery | Röövimine | KarS § 200 lg 1 | kuritegu | 2–10 a vangistus | §[LIKELY] pun[LIKELY] |
| armed_robbery | Röövimine (relva või relvana kasutatava eseme kasutamisega / grupi poolt) | KarS § 200 lg 2 | kuritegu | roughly 3–15 a | §[LIKELY] pun[UNSURE] |
| fraud | Kelmus | KarS § 209 | kuritegu | lg 1: rahaline karistus või kuni 3 a. Aggravated (large scale, group): roughly up to 5–10 a. | §[LIKELY] lg1[LIKELY] aggravated[UNSURE] |
| computer_fraud | Arvutikelmus | KarS § 213 | kuritegu | rahaline karistus või kuni 5 a | §[LIKELY] pun[UNSURE] |
| embezzlement | Omastamine | KarS § 201 | kuritegu | lg 1: rahaline karistus või kuni 3 a. Aggravated: up to 5 a or more. | §[LIKELY] lg1[LIKELY] aggravated[UNSURE] |
| fencing | Kuritegelikul teel saadud vara omandamine, hoidmine või turustamine | KarS § 202 | kuritegu | rahaline karistus või kuni 3 a | §[LIKELY] pun[UNSURE] |
| property_damage | Asja rikkumine (võõra asja hävitamine või rikkumine) | KarS § 203 | kuritegu. Whether a small damage falls under § 218 as a väärtegu is [UNSURE]. | rahaline karistus või kuni 2 a | §[LIKELY] pun[UNSURE] |
| arson | Süütamine. **No stand-alone "süütamine" paragraph was confirmed.** Arson is normally charged as asja rikkumine *üldohtlikul viisil* (§ 203, aggravated subsection). If many people are endangered, it falls under the chapter "Üldohtlikud süüteod" (around § 404 or later). If people die, it is § 114 (mõrv committed üldohtlikul viisil). | KarS § 203 (aggravated) / ch. Üldohtlikud süüteod | kuritegu | roughly up to 5–10 a | [UNSURE] |
| joyriding | Asja (sõiduki) omavoliline kasutamine | KarS § 215 | kuritegu | rahaline karistus või kuni 3 a | [UNSURE] |
| extortion | Väljapressimine | KarS § 214 | kuritegu | roughly 1–5 a | [UNSURE] |

### 2.4 Public order, authority, documents, justice

| shortName | Full Estonian name | Act & § | Type | Typical punishment range | Confidence |
|---|---|---|---|---|---|
| public_disorder | Avaliku korra rikkumine (disturbing others or degrading human dignity in a public place) | KarS § 262 | **väärtegu** | rahatrahv või arest | §[LIKELY] amount[UNSURE] |
| public_disorder_aggr | Avaliku korra raske rikkumine (with violence, a weapon or explosive, or by a group) | KarS § 263 | kuritegu | rahaline karistus või kuni 5 a | §[LIKELY] pun[LIKELY] |
| officer_violence | Võimuesindaja või muu avalikku korda kaitsva isiku vastu vägivalla kasutamine | KarS § 274 | kuritegu | rahaline karistus või kuni 5 a | §[LIKELY] pun[UNSURE] |
| resisting | Vastupanu osutamine võimuesindajale või muule avalikku korda kaitsvale isikule | KarS § 276 | probably a väärtegu (rahatrahv / arest) | rahatrahv või arest | [UNSURE] |
| fleeing_police | Peatumismärguande eiramine (ignoring a police signal to stop) | LS väärtegu. A newer KarS crime for dangerous flight may exist. Neither § was determined. | väärtegu, or kuritegu if dangerous | fine / arest; if a crime, up to a few years | [UNSURE] |
| forgery | Dokumendi, pitsati või plangi võltsimine | KarS § 344 | kuritegu | rahaline karistus või kuni 3 a | §[LIKELY] pun[UNSURE] |
| forged_doc_use | Võltsitud dokumendi kasutamine. Separate paragraphs for official or identity documents exist in the § 345–349 range. | KarS § 345 (?) | kuritegu | rahaline karistus või kuni 1–3 a | [UNSURE] |
| false_accusation | Teadvalt valekaebus / valeteatamine kuriteost (knowingly reporting a crime that did not happen) | KarS chapter "Õigusemõistmisevastased süüteod" (around § 310–322). The exact § was not determined. | kuritegu | rahaline karistus või kuni 1–3 a | [UNSURE] |
| false_112 | Hädaabinumbri väärkasutamine / teadvalt valeteate edastamine (a hoax 112 call) | Not determined. Probably a väärtegu in the act that governs emergency calls (Päästeseadus or a related act). If it causes serious disruption, it may be prosecuted as § 263 or § 120. | väärtegu (usually) | rahatrahv up to about 300 TÜ | [UNSURE] |
| escape | Vangistusest põgenemine. Could also be titled "Kinnipidamiskohast põgenemine". | KarS § 324 (?) | kuritegu | kuni 3 a vangistus | [UNSURE] |

### 2.5 Drugs, weapons, smuggling, environment

| shortName | Full Estonian name | Act & § | Type | Typical punishment range | Confidence |
|---|---|---|---|---|---|
| drugs_large | Narkootilise või psühhotroopse aine ebaseaduslik käitlemine suures koguses | KarS § 184 | kuritegu | lg 1: 1–10 a. Aggravated (group, criminal organisation, minors involved): up to about 15 a. | §[LIKELY] lg1[LIKELY] aggravated[UNSURE] |
| drugs_small_supply | Narkootilise või psühhotroopse aine ebaseaduslik käitlemine väikeses koguses (the crime variant, e.g. handing a small amount to someone else) | KarS § 183 | kuritegu | rahaline karistus või kuni 3 a | [UNSURE] |
| weapon_illegal | Tulirelva, laskemoona või lõhkeaine ebaseaduslik käitlemine | KarS § 418 (?) | kuritegu | rahaline karistus või kuni 5 a | [UNSURE] |
| smuggling | Salakaubavedu | KarS § 391 | kuritegu (small amounts: customs or excise väärtegu) | rahaline karistus või kuni 5 a | §[UNSURE] (leaning yes) pun[UNSURE] |
| smuggling_prohibited | Keelatud kauba või eriliigilise kauba salakaubavedu (drugs, weapons, strategic goods) | KarS § 392 | kuritegu | roughly 1–5 a or more | [UNSURE] |
| poaching | Ebaseaduslik jahipidamine (salaküttimine). A crime when the damage is significant, the species is protected, or the offence is repeated. Otherwise it is a JahiS väärtegu. The offender also pays *keskkonnakahju* (environmental damage compensation per animal). | KarS chapter "Keskkonnavastased süüteod" (around § 364–365). The exact § was not determined. | kuritegu / väärtegu | rahaline karistus või kuni 3 a, plus keskkonnakahju hüvitamine | [UNSURE] |
| pollution | Pinnase, veekogu või õhu saastamine (keskkonna saastamine) | KarS keskkonnavastased süüteod (around § 365–366) | kuritegu | rahaline karistus või kuni 3–5 a | [UNSURE] |

### 2.6 Terrorism and threats

| shortName | Full Estonian name | Act & § | Type | Typical punishment range | Confidence |
|---|---|---|---|---|---|
| terrorism | Terroritegu | KarS § 237. Related offences (preparing, financing, supporting terrorism) are in § 237¹ and later. | kuritegu | 5–20 a või eluaegne | §[LIKELY] pun[UNSURE] |
| bomb_threat | Pommiähvardus. **There is no single paragraph.** A threat against a specific person is § 120 (ähvardamine). A threat to commit a terrorist act falls under § 237 (threat subsection, [UNSURE]). A hoax that disrupts a school, mall or airport is usually § 263 (avaliku korra raske rikkumine) or the false-report offence. | KarS § 120 / § 237 / § 263 | kuritegu | from rahaline karistus up to 5 a; much more if real terrorism | [UNSURE] |

### 2.7 Traffic crimes

| shortName | Full Estonian name | Act & § | Type | Typical punishment range | Confidence |
|---|---|---|---|---|---|
| dui_crime | Mootorsõiduki, maastikusõiduki, trammi või väikelaeva juhtimine joobeseisundis (≥ 1.5 ‰ / ≥ 0.75 mg/l) | KarS § 424 | kuritegu | rahaline karistus või kuni 3 a vangistus, plus juhtimisõiguse äravõtmine up to 3 a. Sõiduki konfiskeerimine is possible. | §[LIKELY] threshold[LIKELY] pun[LIKELY] |
| dui_repeat | Joobeseisundis juhtimine korduvalt (any level ≥ 0.2 ‰ while an earlier punishment for drunk driving is still in the karistusregister) | KarS § 424 (the subsection or wording was not confirmed) | kuritegu | same as above, in practice more often real prison or confiscation | concept [LIKELY], structure [UNSURE] |
| dui_drugs | Mootorsõiduki juhtimine narkojoobes (under drugs) | LS § 224 (väärtegu) / KarS § 424 | It is not confirmed whether a first offence under drugs is always a crime. | as for drunk driving | [UNSURE] |
| traffic_harm | Liiklusohutuse nõuete rikkumine, millega ettevaatamatusest põhjustati raske tervisekahjustus või surm (traffic accident caused by negligence) | KarS § 422 (?) | kuritegu | serious injury: rahaline karistus või kuni 3 a. Death: about 1–5 a. Several deaths: more. Plus licence removal. | [UNSURE] |
| no_licence_repeat | Juhtimisõiguseta juhtimine (korduv) | Probably **not** a crime today: it is handled as a väärtegu with higher fines or arest. | väärtegu (probably) | see section 3 | [UNSURE] |
| speeding_as_crime | Speeding alone is **not** a crime. It is a väärtegu under LS § 262. It becomes a crime only through its consequences (traffic_harm). | n/a | n/a | n/a | [LIKELY] (a 2023-era proposal to criminalise extreme speeding [UNSURE]) |

---

## 3. Misdemeanours (väärteod)

| shortName | Full Estonian name | Act & § | Type | Typical punishment range | Confidence |
|---|---|---|---|---|---|
| dui_misd | Mootorsõiduki juhtimine joobeseisundis (0.20–1.49 ‰ / 0.10–0.74 mg/l) | LS § 224 | väärtegu | rahatrahv kuni 300 TÜ (€1,200) või arest, plus juhtimisõiguse äravõtmine up to 12 months | §[LIKELY] pun[LIKELY] |
| dui_handover | Joobeseisundis isikule mootorsõiduki juhtimise üleandmine (letting a drunk person drive) | LS § 225 (?) | väärtegu | rahatrahv kuni 300 TÜ või arest | [UNSURE] |
| speeding | Lubatud suurima sõidukiiruse ületamine | LS § 262 (tiers in lg 1–4, see section 5) | väärtegu | from a hoiatustrahv up to 300 TÜ or arest, plus licence removal at the top tiers | §[LIKELY] amounts[UNSURE] |
| no_licence | Mootorsõiduki juhtimine juhtimisõiguseta isiku poolt | LS § 201 (?) | väärtegu | rahatrahv kuni 300 TÜ või arest | §[UNSURE] pun[UNSURE] |
| no_insurance | Liikluskindlustuseta sõiduki kasutamine. The owner also pays the Liikluskindlustuse Fond (LKF) a **"lepingutasu"** (a penalty fee for the uninsured period). | LKindlS (§ not determined) | väärtegu | rahatrahv (roughly up to 100–300 TÜ), plus the LKF lepingutasu | [UNSURE] |
| no_inspection | Tehnoülevaatust mitte läbinud sõiduki juhtimine (driving without a valid technical inspection) | LS (§ not determined) | väärtegu | rahatrahv (roughly up to 100 TÜ) | [UNSURE] |
| red_light | Foori keelava tule (punase tule) eiramine (running a red light) | LS (penalty paragraph possibly around § 242) | väärtegu | rahatrahv (roughly up to 100–200 TÜ) | [UNSURE] |
| phone | Telefoni kasutamine sõidu ajal (hands-free devices are allowed) | duty in LS § 70 (?); penalty § not determined | väärtegu | rahatrahv (roughly up to 100 TÜ) | [UNSURE] |
| seatbelt | Turvavöö kasutamata jätmine (not wearing a seat belt) | duty in LS § 32 (?); penalty § not determined | väärtegu | rahatrahv (roughly up to 20–100 TÜ), often a hoiatustrahv | [UNSURE] |
| dui_bicycle | Jalgratta või kergliikuri (e-scooter) joobes juhtimine | LS (§ not determined) | väärtegu | rahatrahv (roughly up to 100 TÜ) | [UNSURE] |
| traffic_accident_misd | Liiklusõnnetuse põhjustamine (property damage or minor injury only) | LS (§ not determined) | väärtegu | rahatrahv kuni 300 TÜ or arest, plus possible licence removal | [UNSURE] |
| leaving_scene | Liiklusõnnetuse kohalt lahkumine (leaving the scene of an accident) | LS (§ not determined) | väärtegu | rahatrahv või arest, plus licence removal | [UNSURE] |
| public_drinking | Alkohoolse joogi tarbimine avalikus kohas (drinking alcohol in a public place) | The ban is in KorS § 55 (?). The penalty is in KorS chapter "Vastutus". Older versions may have had it in Alkoholiseadus. | väärtegu | rahatrahv (roughly up to 100 TÜ) | §[UNSURE] pun[UNSURE] |
| public_order_kors | Avalikus kohas käitumise üldnõuete rikkumine | KorS § 54 (?) for the rules; penalty in KorS "Vastutus" | väärtegu | rahatrahv (roughly up to 100 TÜ) | [UNSURE] |
| night_quiet | Öörahu rikkumine (23:00–07:00) | KorS (rule about § 56–57 (?)); local avaliku korra eeskiri (public order bylaws) may add detail | väärtegu | rahatrahv (roughly up to 100 TÜ) | time[LIKELY] §[UNSURE] |
| drugs_small | Narkootilise või psühhotroopse aine ebaseaduslik valmistamine, omandamine või valdamine väikeses koguses, või tarvitamine ilma arsti ettekirjutuseta (without a prescription) | NPALS § 15 | väärtegu | rahatrahv kuni 300 TÜ või arest | §[LIKELY] pun[LIKELY] |
| petty_theft | Väheses ulatuses varavastane süütegu | KarS § 218 | väärtegu | rahatrahv või arest | §[LIKELY] |
| public_disorder | Avaliku korra rikkumine | KarS § 262 | väärtegu | rahatrahv või arest | §[LIKELY] |
| weapon_misd | Relvaseaduse nõuete rikkumine. Examples: relva kandmine joobeseisundis (carrying a gun while drunk), relva hoidmise nõuete rikkumine (storage rules), loata gaasirelv (gas pistol without a permit), külmrelv avalikus kohas (blade weapon in public). | RelvS chapter "Vastutus" (§§ not determined) | väärtegu | rahatrahv (up to 300 TÜ) või arest, plus confiscation of the weapon or revocation of the permit | [UNSURE] |
| hunting_misd | Jahieeskirja rikkumine / jahipidamine ilma jahitunnistuse või jahiloata (without a hunting certificate or licence) | JahiS (§ not determined) | väärtegu | rahatrahv up to 300 TÜ, plus keskkonnakahju hüvitamine | [UNSURE] |
| littering | Prügistamine | Jäätmeseadus (§ 120?) | väärtegu | rahatrahv (up to about 300 TÜ) | [UNSURE] |
| minor_alcohol | Alaealise alkoholi omamine või tarbimine (a minor possessing or drinking alcohol) | Alkoholiseadus (§ not determined) | väärtegu. Under-14s are not liable and go to child protection. | small rahatrahv or a child-protection referral | [UNSURE] |

> [DESIGN] The game's `Law.act` union has no acts for insurance (LKindlS), Päästeseadus, Alkoholiseadus, Jäätmeseadus or customs. Either add codes (`'LKindlS' | 'PäästeS' | 'AS' | 'JäätS'`) or map these few laws to the closest existing act and note it in `para`.

---

## 4. Drunk driving: decision table for the game

| Measured value | Blood (‰ = mg/g) | Breath (mg/l) | Offence | Law | Typical outcome in records | Confidence |
|---|---|---|---|---|---|---|
| Below the limit | < 0.20 | < 0.10 | none | — | — | [LIKELY] |
| Väärtegu band | 0.20–1.49 | 0.10–0.74 | väärtegu | LS § 224 | "Rahatrahv 150–300 TÜ (€600–1,200)" or "Arest 5–20 ööpäeva", plus "Juhtimisõiguse äravõtmine 3–12 kuuks" | §[LIKELY]; typical values [DESIGN] |
| Criminal band | ≥ 1.50 | ≥ 0.75 | kuritegu | KarS § 424 | First offence: "Rahaline karistus 60–150 pm" or "Tingimisi vangistus 6 k – 1 a, katseaeg 2–3 a", plus "Juhtimisõiguse äravõtmine 1–2 a". Repeat: real prison of months, plus "Sõiduki konfiskeerimine". | §[LIKELY]; typical values [DESIGN] |
| Repeat at any level ≥ 0.20 (earlier punishment still on record) | ≥ 0.20 | ≥ 0.10 | kuritegu | KarS § 424 | as the criminal band | [UNSURE] on structure |
| Drugs detected | — | — | väärtegu or kuritegu | LS § 224 / KarS § 424 | treat as the väärtegu band unless repeated | [UNSURE] |

Breath and blood values convert at roughly 1 : 2000 (0.75 mg/l ≈ 1.5 ‰). [LIKELY]
Refusing the breath test leads to a blood sample at a medical facility. The legal consequence of refusing everything was not determined. [UNSURE]

---

## 5. Speeding tiers (LS § 262)

The tier structure below is recalled with fair confidence. **The amounts are [UNSURE].** Treat them as placeholders that "feel right".

| Tier | Over the limit | Recalled maximum penalty | Suggested in-game typical [DESIGN] |
|---|---|---|---|
| lg 1 | up to 20 km/h | rahatrahv up to about 20 TÜ (camera: hoiatustrahv about €3 per km/h) | Hoiatustrahv €30–60 |
| lg 2 | 21–40 km/h | rahatrahv up to about 100–120 TÜ | Rahatrahv 40–100 TÜ (€160–400) |
| lg 3 | 41–60 km/h | rahatrahv up to about 200 TÜ or arest, plus licence removal up to a few months | Rahatrahv 120–200 TÜ, plus juhtimisõiguse äravõtmine 1–3 k |
| lg 4 | over 60 km/h | rahatrahv up to 300 TÜ or arest, plus licence removal up to about 6 months | Arest 5–10 ööpäeva or 300 TÜ, plus äravõtmine 3–6 k |

Not a crime at any tier. [LIKELY]

---

## 6. Wording for record entries (bilingual templates)

Use these strings in `CriminalRecord.punishment` (`Text`). [DESIGN], built on [LIKELY] terminology.

**Kriminaalkaristused (kind: 'crime')**
- `Rahaline karistus 80 päevamäära (1 600 €)` / `Criminal fine of 80 daily rates (€1,600)`
- `Vangistus 2 a 6 k` / `Imprisonment 2 y 6 m`
- `Tingimisi vangistus 1 a, katseaeg 2 a` / `Suspended sentence 1 y, probation 2 y` (KarS § 73)
- `Vangistus 1 a 6 k, käitumiskontroll katseajaga 3 a` / `… under supervision, probation 3 y` (KarS § 74)
- `Vangistus 3 a, millest 4 k kanda, ülejäänu tingimisi` / `3 y, 4 m to serve, rest suspended`
- `Vangistus asendatud üldkasuliku tööga 240 tundi` / `Replaced by 240 h community service`
- `Eluaegne vangistus` / `Life imprisonment`
- `Juhtimisõiguse äravõtmine 18 kuuks` / `Driving licence revoked for 18 months` (additional penalty)
- `Sõiduki konfiskeerimine` / `Vehicle confiscated`
- `Kriminaalmenetlus lõpetatud otstarbekuse kaalutlusel (KrMS § 202), 500 € riigi tuludesse` / `Proceedings terminated on grounds of expediency, €500 to state revenue`. This outcome is common for first-time minor theft and assault. [LIKELY]

**Väärteokaristused (kind: 'misdemeanour')**
- `Rahatrahv 120 trahviühikut (480 €)` / `Fine of 120 fine units (€480)`
- `Hoiatustrahv 60 €` / `Warning fine €60`
- `Arest 10 ööpäeva` / `Detention 10 days`
- `Juhtimisõiguse äravõtmine 6 kuuks` / `Licence revoked for 6 months`
- `Relva konfiskeerimine` / `Weapon confiscated`

**Citation format in the UI**
`KarS § 199 lg 2 p 2 — Vargus` · `LS § 224 lg 1 — Joobes juhtimine` · `KarS § 25 lg 2, § 114 — Mõrvakatse` · `KarS § 331² — Lähenemiskeelu rikkumine`

---

## 7. Karistusregister: notes for realistic records

- **Law and keeper**: the register runs under the Karistusregistri seadus (KRS). The controller is the Ministry of Justice (Justiitsministeerium; renamed Justiits- ja Digiministeerium around 2024–2025, date [UNSURE]). It is operated by RIK (Registrite ja Infosüsteemide Keskus). [LIKELY]
- **What it holds**: both kuritegu and väärtegu punishments, for natural and legal persons. Citizens can view their own record via eesti.ee. [LIKELY]
- **Police systems**: PPA officers query **POLIS** (the police information system) and related databases. Criminal case files live in **e-toimik**. [LIKELY] The in-game "Andmebaas" is an homage to these and should not use their real names or look.
- **Deletion (*kustutamine*)**:
  - Väärtegu punishments are deleted **1 year** after the punishment is served or paid. [LIKELY]
  - Criminal punishments are deleted after longer, sentence-dependent periods: roughly 5 years for a fine and 10 or more years for long prison sentences. Life sentences are not deleted. [UNSURE] on exact terms.
  - Deleted entries move to the register archive and are kept for decades. [UNSURE]
  - [DESIGN] Do not generate väärtegu records older than about 18 months, except as "kustutatud / arhiivis". Criminal records may go back 10+ years.
- **The repeat rule depends on the register**: "previously punished" (e.g. for dui_repeat) means a punishment that has **not yet been deleted**. [UNSURE] on exact wording, but this is good game logic.
- **Frequency weights for background population** [DESIGN], loosely based on prior knowledge of Estonian crime statistics [UNSURE]:
  - Estonia registers roughly 25–30k crimes per year.
  - Theft (vargus): about 30–35%.
  - Assault (kehaline väärkohtlemine): about 15–20%, much of it domestic.
  - Fraud and computer fraud: about 10% and rising.
  - KarS § 424 drunk driving: about 5%.
  - Drugs: about 3–5%.
  - Robbery, homicide, rape: well under 1–2% each.
  - Väärteod far outnumber crimes. Traffic misdemeanours are the most common, then KorS public-order offences and petty theft.

---

## 8. Suggested game data (`src/data/laws.ts`)

[DESIGN]
- Use paragraph-based ids **only for [LIKELY] paragraphs**.
- Use semantic ids for [UNSURE] ones, so the ids do not change when the number is checked.

| id | act | para | kind | tags |
|---|---|---|---|---|
| kars_114 | KarS | § 114 | crime | violence |
| kars_113 | KarS | § 113 | crime | violence |
| kars_25_114 | KarS | § 25 lg 2, § 114 | crime | violence |
| kars_117 | KarS | § 117 | crime | violence |
| kars_118 | KarS | § 118 | crime | violence |
| kars_121 | KarS | § 121 lg 1 | crime | violence |
| kars_121_2 | KarS | § 121 lg 2 | crime | violence, domestic |
| kars_120 | KarS | § 120 lg 1 | crime | violence, domestic |
| kars_157_3 | KarS | § 157³ | crime | domestic |
| kars_331_2 | KarS | § 331² | crime | domestic, order |
| kars_133 | KarS | § 133 | crime | violence |
| kars_141 | KarS | § 141 | crime | violence (exclude from random generation) |
| kars_false_imprisonment | KarS | § 136 (verify) | crime | violence |
| kars_hostage | KarS | (verify) | crime | violence |
| kars_199 | KarS | § 199 lg 1 | crime | property |
| kars_199_2 | KarS | § 199 lg 2 | crime | property |
| kars_218 | KarS | § 218 | misdemeanour | property |
| kars_200 | KarS | § 200 lg 1 | crime | property, violence |
| kars_200_2 | KarS | § 200 lg 2 | crime | property, violence, weapons |
| kars_209 | KarS | § 209 | crime | property |
| kars_213 | KarS | § 213 | crime | property |
| kars_201 | KarS | § 201 | crime | property |
| kars_202 | KarS | § 202 | crime | property |
| kars_203 | KarS | § 203 | crime | property |
| kars_arson | KarS | § 203 (üldohtlikul viisil) (verify) | crime | property |
| kars_joyriding | KarS | § 215 (verify) | crime | property, traffic |
| kars_262 | KarS | § 262 | misdemeanour | order |
| kars_263 | KarS | § 263 | crime | order, violence |
| kars_274 | KarS | § 274 | crime | order, violence |
| kars_resisting | KarS | § 276 (verify) | misdemeanour | order |
| kars_344 | KarS | § 344 | crime | order |
| kars_false_report | KarS | (verify) | crime | order |
| kars_escape | KarS | § 324 (verify) | crime | order |
| kars_184 | KarS | § 184 | crime | drugs |
| kars_drugs_small_supply | KarS | § 183 (verify) | crime | drugs |
| kars_weapon | KarS | § 418 (verify) | crime | weapons |
| kars_smuggling | KarS | § 391 (verify) | crime | order |
| kars_poaching | KarS | (verify) | crime | order |
| kars_pollution | KarS | (verify) | crime | order |
| kars_237 | KarS | § 237 | crime | violence, weapons |
| kars_424 | KarS | § 424 | crime | traffic |
| kars_traffic_harm | KarS | § 422 (verify) | crime | traffic, violence |
| ls_224 | LS | § 224 | misdemeanour | traffic |
| ls_262 | LS | § 262 | misdemeanour | traffic |
| ls_no_licence | LS | § 201 (verify) | misdemeanour | traffic |
| ls_no_inspection, ls_red_light, ls_phone, ls_seatbelt, ls_dui_bicycle, ls_accident, ls_leaving_scene, ls_fleeing | LS | (verify) | misdemeanour | traffic |
| lkindls_no_insurance | (new act code) | (verify) | misdemeanour | traffic |
| kors_public_drinking, kors_public_order, kors_night_quiet | KorS | (verify) | misdemeanour | order |
| npals_15 | NPALS | § 15 | misdemeanour | drugs |
| relvs_misd | RelvS | (verify) | misdemeanour | weapons |
| jahis_misd | JahiS | (verify) | misdemeanour | order |

**Mapping the 2025 legacy easter-egg records** (DESIGN.md § 4.10) to real law [DESIGN]:
- "Kehavigastuste tekitamine" → `kars_121`, or `kars_118` if serious.
- "Tule avamine relvast avalikus kohas" → `kars_263` (relva kasutamisega). Add `kars_weapon` if the gun is unlicensed.
- "Kriminaalne mittepeatumine" → `ls_fleeing` (its crime status is [UNSURE]). Keep the joke title and cite LS.
- "Mõrvakatse" → `kars_25_114`.
- "Relvastatud (Hesburgeri)rööv" → `kars_200_2`.
- "Toidumürgitamine" has no real paragraph. Use `kars_121`, or keep it as a pure joke without a citation.

Legacy calls mention "pantvangid" (hostages) and "lapse röövimine" (child abduction). Map them to `kars_hostage` / `kars_false_imprisonment` once checked.

---

## 9. Open questions and verification checklist

Check these on Riigi Teataja, in priority order:

1. **Trahviühik**: is it still €4 in 2026? (KarS § 47)
2. **KarS § 424**: exact text and subsections. Is "repeat" in the same paragraph? How are drugs handled?
3. **LS § 224** and the **LS § 262** speed tiers, with their exact maximum fines.
4. **LS paragraph numbers** for no licence (§ 201?), red light, phone, seat belt, technical inspection, accident and leaving the scene, and ignoring a police stop signal.
5. **KorS paragraph numbers** for the public-order rules (§ 54?), drinking in public (§ 55?) and öörahu, plus the matching penalty paragraphs.
6. **KarS § 136**: is it isikuvabaduse ebaseaduslik võtmine? Where are pantvangi võtmine and inimrööv?
7. **KarS § 141**: date of the consent-based reform and the new lg 1 range.
8. The KarS paragraphs for: resisting an officer (§ 276?), false accusation, escape (§ 324?), weapons (§ 418?), smuggling (§ 391/392), poaching and pollution (around § 364–366), traffic harm (§ 422?), joyriding (§ 215?), extortion (§ 214?).
9. **False 112 calls**: which act and paragraph?
10. **KarS § 218** petty threshold: €200 or €400?
11. **KRS**: exact deletion terms.
12. **Hoiatustrahv** cap and the speed-camera formula (VTMS § 54¹).

## 10. Sources

- No web sources were consulted in this run. The search budget was exhausted, and fetching is blocked in this environment.
- Repository context was read from `docs/DESIGN.md`, `src/sim/types.ts` and `src/data/laws.ts`.
- Authoritative places to verify:
  - Riigi Teataja (riigiteataja.ee): consolidated texts of KarS, LS, KorS, NPALS, RelvS, JahiS, VTMS, KrMS, KRS and LKindlS.
  - politsei.ee: guidance on fines and drunk driving.
  - kriminaalpoliitika.ee (Ministry of Justice crime statistics): offence frequencies.
