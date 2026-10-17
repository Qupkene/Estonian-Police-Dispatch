# Vehicles, plates and the traffic register (Estonia, 2023–2026)

Research notes for **EPD**, an unofficial fan-made dispatch game. EPD is not affiliated with Politsei- ja Piirivalveamet (PPA), Transpordiamet, Liikluskindlustuse Fond or any insurer.
Compiled 2026-10-17.

> **Read this first: how these notes were made.** The workflow's shared web-search budget was used up before this agent began, so **no web searches and no page fetches were done for this file**. Everything below comes from the author's prior knowledge. So:
> - **No fact in this file is tagged [VERIFIED] from its own searching.**
> - A few facts carry **[VERIFIED*]**. These were verified by a sibling research note in this folder (`ppa-organisation.md` or `law-references.md`) and are copied here with a pointer. They were not re-checked.
> - Section 11 lists the facts most worth re-checking when search is available again.

**Confidence tags**
- **[VERIFIED*]**: verified by a sibling research doc, which is named. Not re-checked here.
- **[LIKELY]**: strong prior knowledge, not contradicted by anything seen.
- **[UNSURE]**: plausible but unconfirmed, or memory is weak or conflicting.
- **[DESIGN]**: a suggested value for game data, not a claim about the real world.

> Branding note (repeated from the sibling docs): the real PPA site is politsei.ee and the real register belongs to Transpordiamet. If the game lives on a lookalike domain such as **politsei.eu**, every page needs a clear "unofficial / fan-made / not the police" notice. The in-game registry screen must not look like Transpordiamet's e-teenindus, PPA's internal systems or lkf.ee. Do not use real logos. Every generated plate, VIN and person must be fictional; see §10.5 for avoiding real plates.

---

## 0. TL;DR for game designers

| Topic | Key fact | Confidence |
|---|---|---|
| Standard plate | **`123 ABC`**: 3 digits, a space, 3 Latin letters. Black on white with the EU blue band and "EST" on the left. Used since about 1993; the EU band since 2004. | [LIKELY] |
| Region in plate? | Not today. Letters once hinted at the registering office; plates are now issued from national series. Players can't tell a car's region from its plate. | [UNSURE] history; [LIKELY] now |
| Police / taxi / EV plates | No special series. Police cars, unmarked cars, taxis and EVs carry normal `123 ABC` plates. | [LIKELY] |
| Defence Forces | Kaitsevägi keeps its own register, so a military plate returns **"not found in liiklusregister"** | [LIKELY] separate register; plate format [UNSURE] |
| Register keeper | **Transpordiamet** (since 1 Jan 2021). Before that **Maanteeamet** (from 2009). Before that **ARK** (Riiklik Autoregistrikeskus). | [LIKELY] |
| Owner vs. user | The register records an **omanik** (owner) and a **vastutav kasutaja** (responsible user). Leasing companies own many cars; camera fines go to the vastutav kasutaja. | [LIKELY] |
| Inspection | **Tehnoülevaatus**. Cars: first after about 4 years, then every 2 years, then **yearly once the car is old (about 8–10 years)**. Trucks, buses and taxis: yearly. | [UNSURE] exact intervals |
| Insurance | **Liikluskindlustus** (motor third-party liability) is compulsory for every registered vehicle unless its registration is suspended. **LKF** keeps the insurance register, pays for uninsured or unknown vehicles, and bills uninsured owners a *lepingutasu*. | [LIKELY]; LKF lepingutasu [VERIFIED*] |
| Suspended registration | **Registreeringu peatamine**: the vehicle may not be driven on public roads, and needs no insurance or inspection while suspended | [LIKELY] |
| Carrying documents | In Estonia, drivers need not carry the registration card or driving licence if they carry an ID document; police check the registers | [LIKELY] |
| First licence | **Esmane juhiluba**, valid **2 years** (A and B groups). It is swapped for a full licence (usually 10 years) after a clean record and the *lõppastme koolitus* (final-stage training: skid pad and night driving). | [LIKELY] |
| Most common makes | **Toyota** is #1 by a wide margin, then **Volkswagen**, then Škoda, Audi, BMW, Volvo, Opel, Ford, Mercedes-Benz. The fleet is old: about **15–17 years** on average. | [LIKELY] ranking; [UNSURE] shares and age |
| Most-stolen cars | **Toyota Land Cruiser** (150 Prado / 200 / 250), **Lexus RX / NX / LX**, **Toyota RAV4**, often by keyless relay attack. Also older Audi, BMW and VW for parts, and catalytic converters. | [LIKELY] |
| VIN | 17 characters, **no I, O, Q**. Position 9 is the check digit (mandatory only in North America and China). Position 10 is the model year (R = 2024, S = 2025, T = 2026). | [LIKELY] |
| ANPR | Police **numbrituvastuskaamerad**: fixed cameras on main roads and at borders, plus in-car units. They raise hits on stolen, wanted, uninsured and similar flags. The legal basis was disputed around 2023–24 (Chancellor of Justice criticism), followed by law changes. | [LIKELY] use; [UNSURE] dates and law |
| Speed cameras | Fixed **kiiruskaamerad** in grey roadside boxes, plus **8 mobile cameras** (PPA). Mobile cameras fine from ≥ 6 km/h over. Some fixed cameras now measure in **both directions** because motorcycles only have rear plates. | [VERIFIED*] (ppa-organisation.md) |
| Average-speed cameras | Discussed for main roads such as Tallinn–Tartu; **no confirmed system in operation** | [UNSURE] |
| Island ferries | Virtsu–Kuivastu (about 28 min), Rohuküla–Heltermaa (about 75 min), Rohuküla–Sviby, Sõru–Triigi, Munalaiu–Kihnu. Main operator **TS Laevad**; booking at praamid.ee; tickets tied to the **plate number**. | [LIKELY] |
| Ice roads | Opened by Transpordiamet in cold winters only. Rules: **seat belts unfastened**, **no 25–40 km/h** (resonance band), **max 70 km/h**, **≥ 250 m between cars**, no stopping, daylight only, mass limit about 2–2.5 t | [LIKELY] |

---

## 1. Licence plates (registreerimismärgid)

Terms: the official word is **registreerimismärk** ("registration mark"). People say **numbrimärk**, **numbrid** or just "number". "Plate check" = *numbri kontroll*. The register field is **registreerimisnumber** (EU certificate code **A**).

### 1.1 Standard plate (current, since about 1993)

| Property | Value | Confidence |
|---|---|---|
| Format | `NNN LLL`: three digits, a space, three letters. Example `123 ABC`. | [LIKELY] |
| Digits | `000`–`999`. Low or "pretty" numbers such as `001` or `777` exist but are rare; see 1.4 | [UNSURE] whether `000` is ever issued |
| Letters | Basic Latin capitals. **Õ Ä Ö Ü Š Ž never appear** on standard plates | [LIKELY] |
| Excluded letters | No authoritative list was found. Some countries drop I, O and Q to avoid confusion with 1 and 0; whether Estonia does is unknown | [UNSURE] |
| Size | EU standard long plate, about **520 × 113 mm** | [LIKELY] |
| Colours | Black characters on a white reflective background, with a black border | [LIKELY] |
| Left band (2004 onward) | EU blue band with the ring of 12 yellow stars and the country code **"EST"** in white | [LIKELY] |
| Left band (about 1993–2004) | A small Estonian tricolour flag (sinine-must-valge, blue-black-white) with **"EST"** under it | [LIKELY] |
| Font | A narrow, DIN-1451-style sans-serif, similar to older German and Nordic plates. No anti-forgery FE-font is known. | [UNSURE] |
| Front and rear | Cars, vans, trucks and buses carry plates front and rear. Motorcycles, mopeds and trailers carry a rear plate only. | [LIKELY] |
| Short or square plate | Vehicles that can't fit a long plate (US or Japanese imports, some tractors and quads) can get a **two-row** plate: digits on top, letters below (`123` / `ABC`) | [LIKELY] it exists; [UNSURE] exact size |
| Who makes them | Plates are issued by Transpordiamet service bureaus (*teenindusbüroo*) and some dealers, and stay with the vehicle when it changes owner | [LIKELY] |

**Regional letters (history).** Many Estonians believe the first letter once showed where the car was registered, for example Tallinn and Harju with A or B, Tartu with T and Pärnu with P. The author cannot confirm the actual table. Today plates come from national series, and the letter means nothing. [UNSURE]
- [DESIGN] Do not encode regions in letters. If you want a light "feel", favour plates starting with **B**, **M**, **T**, **O** and **L**, but uniform random letters are fine.

**Which series are current?** Unknown. New plates around 2023–2026 probably start with letters late in the alphabet, but this is not confirmed. [UNSURE]
- [DESIGN] Draw letters uniformly at random from the allowed set. Optionally tie the plate to the car's age: older cars get A–H first letters, newer cars get later letters. Players won't notice the difference, and it adds texture.

### 1.2 Other plate types

| Type (Estonian) | What it is | Format / look | Confidence |
|---|---|---|---|
| **Mootorratta märk** (motorcycle) | Rear plate only, a smaller two-row plate | Digits over letters, e.g. `12` / `ABC`. Real digit and letter counts unconfirmed | [LIKELY] two-row; [UNSURE] format |
| **Mopeedi märk** (moped, L1e) | Mopeds are believed to have needed registration and a small rear plate since about 2011 | Small two-row plate. Format unconfirmed | [UNSURE] (both the requirement and the format) |
| **Haagise märk** (trailer, O1–O4) | Trailers have their own series. The towing car's plate is *not* repeated on the trailer. | Believed to have fewer characters than a car plate. Either `12 ABC` or `123 AB` is plausible | [LIKELY] separate series; [UNSURE] format |
| **Traktori / liikurmasina märk** (tractor, mobile machinery) | Tractors, self-propelled machinery and off-road vehicles (*maastikusõidukid*: ATVs, snowmobiles) are registered in the same liiklusregister | Separate series with a different format | [LIKELY] registered; [UNSURE] format |
| **Eritellimusel registreerimismärk / soovinumber** (personalised) | A plate with the owner's chosen text. Costs a state fee (a few hundred €). Attractive standard-format numbers (e.g. `777 AAA`) are reportedly sold at Transpordiamet **auctions** (*numbrioksjon*). | Up to about **9 characters**, letters and digits, white plate with EU band. Examples: `KALLE`, `AUDI 6`, `TOOMAS1` | [LIKELY] exists; [UNSURE] length, fee and character rules |
| **Diplomaatiline märk** (diplomatic) | For embassies (Tallinn). Series such as **CD** (corps diplomatique) and possibly **CMD** (head of mission) | `CD 1234`-style. Colour unconfirmed | [UNSURE] |
| **Transiitmärk / ajutine märk** (transit, temporary) | For export or temporary moves of unregistered vehicles; short validity (days or weeks) | A distinct colour or marker with a validity date. Format unconfirmed | [UNSURE] |
| **Proovisõidu märk** (trade or test plate) | Dealers and garages use these on unregistered or test cars | Unconfirmed | [UNSURE] |
| **Kaitseväe märk** (Defence Forces) | **Kaitsevägi (and probably Kaitseliit) register their vehicles in their own military register**, not in liiklusregister | Distinct format, possibly with a KV-style marking. Unconfirmed | [LIKELY] separate register; [UNSURE] format |
| **Ajaloolise sõiduki märk** (historic vehicle) | Old vehicles (historic status, usually 30+ years old) may have special treatment and inspection rules | Unconfirmed | [UNSURE] |

**Vehicles with no special plates** [LIKELY]:
- Police cars, marked and unmarked. They are registered normally, owned by PPA or a leasing company.
- Ambulances, rescue vehicles, taxis, buses, electric cars and rental cars.

### 1.3 Plate-related crime and incidents (for event templates)

- **Registreerimismärgi vargus** (plate theft). Common. Stolen plates are used for **fuel drive-offs** (*tankla petmine*, *kütusevargus*) at Circle K, Neste, Olerex, Alexela and Terminal stations, and to hide stolen cars. [LIKELY]
- **Valenumbrid / kloonitud numbrid** (false or cloned plates). A stolen car is given plates copied from a legal car of the **same make, model and colour**, so a plate check comes back "clean" while the VIN does not match. [LIKELY] (a known European pattern)
- **Numbrimärgita sõiduk** (no plates). Often a quad or an old car in a rural area, a car fresh from Latvia, or a "drift" car. [LIKELY]
- **Unreadable plates.** Dirty or snowed-over plates in winter, or a tow-bar ball covering the plate. Minor misdemeanours. [LIKELY]

### 1.4 Foreign plates a dispatcher will see

| Country | Format | Notes | Confidence |
|---|---|---|---|
| Finland (FIN) | `ABC-123` | Very common in Tallinn (ferry tourists) | [LIKELY] |
| Latvia (LV) | `AB-1234` | Common in the south (Valga/Valka, Ikla) | [LIKELY] |
| Lithuania (LT) | `ABC 123` | **Looks like a reversed Estonian plate**: a nice confusion beat | [LIKELY] |
| Russia (RUS) | `А123ВС 78` (letter, 3 digits, 2 letters, region code) | **Estonia, Latvia, Lithuania and Finland have refused entry to Russian-registered passenger cars since mid-September 2023** (EU sanctions reading). A Russian plate deep inside Estonia is a red flag. | [LIKELY] |
| Ukraine (UA) | `AA1234BB` | Many since 2022 (war refugees) | [LIKELY] |
| Poland (PL) | `WX 12345` | Trucks and vans | [LIKELY] |
| Germany (D) | `B AB 1234` | Seen on fresh used imports, often with **German export plates** (*Ausfuhrkennzeichen*: red date band) | [LIKELY] |
| Sweden (S) | `ABC 123` / `ABC 12A` | Same layout as Lithuania. Common on used Volvo imports before re-registration | [LIKELY] |

---

## 2. The passenger-car fleet

### 2.1 Fleet facts

| Fact | Value | Confidence |
|---|---|---|
| Registered passenger cars (M1) | Roughly **800,000–870,000**. Population about 1.37 M; about 600–650 cars per 1,000 people | [UNSURE] |
| All registered vehicles | About **1.0–1.1 million** (cars, vans, trucks, motorcycles, mopeds, trailers, tractors) | [UNSURE] |
| Average car age | **About 15–17 years**, one of the oldest fleets in the EU (EU average about 12). The capital region is younger, rural Ida-Viru and Võru older. | [UNSURE] figure; [LIKELY] "old fleet" |
| Used imports | Most first registrations are **used imports** from Germany, Finland, Sweden, the Netherlands and Belgium. New-car sales are only about 20,000–25,000 a year. | [LIKELY] |
| Car tax | **Mootorsõidukimaks** in force **1 January 2025**: a registration fee (*registreerimistasu*) plus an annual tax (*aastamaks*). It caused a buying rush in late 2024 and a slump in 2025. Later political changes to the tax are unconfirmed. | [LIKELY] start; [UNSURE] later changes |
| Fuel mix | Diesel very common in the fleet (estates and SUVs); petrol, petrol hybrid (Toyota) and a small but growing EV and PHEV share | [LIKELY] |
| Popular body styles | **Universaal** (estate/wagon, very popular), sedaan, luukpära (hatchback), **maastur** (SUV, growing), mahtuniversaal (MPV) | [LIKELY] |

### 2.2 Top 40 make/model in the fleet (game weights)

Rough shares inferred from prior knowledge of Estonian registration statistics and street mix. **These are [DESIGN] weights, not verified register counts.** The ranking at the top is [LIKELY]: Toyota is #1, VW #2, and the Passat and Avensis have been the top models for years.

| # | Make | Model | Typical years in fleet | Weight % [DESIGN] | Notes |
|---|---|---|---|---|---|
| 1 | Volkswagen | Passat (B5/B6/B7/B8) | 1998–2020 | 4.0 | The classic Estonian estate. Many diesel. |
| 2 | Toyota | Avensis | 1998–2018 | 3.6 | Very common, older |
| 3 | Toyota | Corolla / Corolla Verso | 2000–2025 | 3.4 | New Corollas often hybrid |
| 4 | Škoda | Octavia | 2000–2025 | 3.4 | Also a common taxi and fleet car |
| 5 | Toyota | RAV4 | 2003–2025 | 3.0 | A top new-car seller in recent years. **Theft target.** |
| 6 | Audi | A4 (B6–B9) | 2001–2020 | 2.4 | |
| 7 | Audi | A6 (C5–C8) | 1998–2022 | 2.4 | C5/C6 allroad popular |
| 8 | BMW | 5 Series (E39/E60/F10/G30) | 1997–2022 | 2.3 | E39/E60 have a "tough guy" image |
| 9 | Volkswagen | Golf | 1998–2024 | 2.2 | |
| 10 | Volvo | V70 / XC70 | 1997–2016 | 2.0 | Swedish imports |
| 11 | BMW | 3 Series | 1998–2022 | 1.9 | |
| 12 | Opel | Astra | 1998–2020 | 1.8 | |
| 13 | Ford | Focus | 1999–2020 | 1.8 | |
| 14 | Toyota | Yaris / Yaris Cross | 2000–2025 | 1.7 | |
| 15 | Škoda | Superb | 2002–2025 | 1.6 | Also a common police and taxi car |
| 16 | Toyota | Auris | 2007–2018 | 1.5 | Many hybrids, often taxis |
| 17 | Ford | Mondeo | 1997–2018 | 1.4 | |
| 18 | Opel | Vectra / Insignia | 1998–2020 | 1.4 | |
| 19 | Volvo | XC90 | 2003–2025 | 1.2 | |
| 20 | Volvo | XC60 | 2009–2025 | 1.2 | |
| 21 | Nissan | Qashqai | 2007–2024 | 1.2 | |
| 22 | Honda | CR-V | 2002–2022 | 1.1 | |
| 23 | Mercedes-Benz | E-Class | 1996–2022 | 1.1 | |
| 24 | Škoda | Fabia | 2000–2024 | 1.1 | |
| 25 | Honda | Accord / Civic | 1998–2018 | 1.1 | |
| 26 | Mercedes-Benz | C-Class | 2000–2022 | 1.0 | |
| 27 | Mazda | 6 / CX-5 | 2002–2024 | 1.0 | |
| 28 | Volkswagen | Touran / Sharan | 2003–2020 | 0.9 | Family MPVs |
| 29 | Toyota | Land Cruiser (100/120/150/200/250) | 2000–2025 | 0.9 | **Top theft target** |
| 30 | Lexus | RX (and NX) | 2003–2025 | 0.8 | **Top theft target** |
| 31 | Volkswagen | Tiguan | 2008–2025 | 0.8 | |
| 32 | Škoda | Kodiaq / Karoq | 2017–2025 | 0.8 | Popular new SUVs |
| 33 | Kia | Ceed / Sportage | 2007–2025 | 0.8 | |
| 34 | Hyundai | i30 / Tucson | 2008–2025 | 0.7 | |
| 35 | Volvo | S40 / V50 / S60 / V60 | 2000–2022 | 0.7 | |
| 36 | Peugeot | 307 / 308 / 407 | 2001–2020 | 0.7 | |
| 37 | Renault | Mégane / Clio | 1999–2020 | 0.6 | |
| 38 | Subaru | Forester / Outback | 2000–2022 | 0.6 | Rural favourite |
| 39 | Toyota | C-HR | 2017–2025 | 0.6 | |
| 40 | Tesla / BYD / MG (EVs) | Model 3 / Model Y / Atto 3 / MG4 | 2019–2026 | 0.5 | New, mostly Tallinn |
| — | **Long tail** | Lada Niva / 2107, Mitsubishi Outlander / Lancer, Citroën C4 / C5, Seat Leon, Dacia Duster, Nissan X-Trail, Audi A3 / Q5 / Q7, BMW X5, Mercedes-Benz ML / GLE, Mini, Jeep Grand Cherokee | | about 32 | Use make-level weights (2.3) to fill the tail |

**Make-level shares** (for the long tail and the "make only" witness reports) [DESIGN, ordering LIKELY]:
Toyota 15 · Volkswagen 11 · Škoda 7.5 · Audi 6.5 · BMW 6.5 · Volvo 6 · Opel 5 · Ford 5 · Mercedes-Benz 4.5 · Nissan 3.5 · Honda 3 · Mazda 2.5 · Peugeot 2.5 · Renault 2.5 · Kia 2.5 · Hyundai 2 · Lexus 1.5 · Subaru 1.5 · Citroën 1.5 · Mitsubishi 1.5 · Seat 1 · Lada 0.8 · Dacia 0.7 · Tesla 0.5 · other 3

**New-car top sellers, 2023–2025** (for cars ≤ 3 years old) [LIKELY ordering of the top 2, rest UNSURE]:
Toyota RAV4, Škoda Octavia, Toyota Corolla, Toyota C-HR, Toyota Yaris Cross, Škoda Kodiaq, Kia Sportage, Hyundai Tucson, Škoda Karoq, Volvo XC60, VW Tiguan, Toyota Land Cruiser 250 (new in 2024), Tesla Model Y, BYD (2025).

### 2.3 Commonly stolen cars and theft methods

The term in Estonia: **sõiduki vargus / auto ärandamine** (theft, KarS § 199). **Omavoliline kasutamine** (joyriding, KarS § 215; see `law-references.md`).

| Rank | Model | Why | Confidence |
|---|---|---|---|
| 1 | **Toyota Land Cruiser** 150 Prado / 200 / 250 | High value, export demand (historically to Russia and Central Asia; now parts), keyless or CAN-bus attacks | [LIKELY] |
| 2 | **Lexus RX** (also NX, LX) | Same platform and electronics as Toyota, high value | [LIKELY] |
| 3 | **Toyota RAV4** | Large fleet, keyless entry, parts demand | [LIKELY] |
| 4 | Toyota Highlander / C-HR / Camry | Same attack methods | [UNSURE] |
| 5 | Older **Audi A4 / A6**, **BMW 3 / 5**, **VW Passat** | Stolen for parts or joyriding. Older locks; sometimes the key is stolen in a burglary. | [LIKELY] |
| 6 | Mazda CX-5 / 6, Honda CR-V | Keyless relay attacks | [UNSURE] |
| — | **Catalytic converters** (*katalüsaatorite vargus*), from Toyota Prius / Auris hybrids and vans | Peaked about 2021–22 | [LIKELY] |
| — | **Diesel siphoning** (*kütusevargus*) from trucks, forestry and farm machinery | Rural and industrial areas | [LIKELY] |
| — | **Tools from vans** (*tööriistade vargus kaubikust*) | Construction sites, overnight in housing areas | [LIKELY] |
| — | Motorcycles, mopeds, e-scooters (*kergliikurid*), **bicycles** | Summer peak. Bicycle theft is a huge volume crime | [LIKELY] |

- **Volume.** Estonia has a low car-theft rate today compared with the 1990s–2000s. Roughly **a few hundred cars a year** (perhaps 300–600). [UNSURE]
  - [DESIGN] About 1–2 car-theft reports per in-game day nationally. Tallinn and Harju make up about half.
- **Typical method** [LIKELY in outline; details DESIGN]:
  1. **Relay attack** (*releerünnak*, "signaalivõimendiga vargus") or **CAN-bus "headlight" injection**, at night, at private houses in Tallinn suburbs (Viimsi, Rae/Peetri, Harku, Saue, Pirita, Nõmme) or Tartu's outskirts.
  2. The car is parked in a big car park for a day or two to see whether a GPS tracker leads anyone to it.
  3. It gets **cloned plates** and is driven south (Ikla, Valga) or dismantled in a shed.
- **Owner trackers.** Many Land Cruiser and Lexus owners now fit GPS trackers. "The owner can see the car on an app" is a realistic call. [LIKELY]

### 2.4 Typical colours

Register colour words (field **R** on the certificate, *värvus*). The register most likely stores basic colour names, possibly with *hele-* (light) or *tume-* (dark) prefixes. [UNSURE]

| Colour (ET) | EN | Weight % [DESIGN] |
|---|---|---|
| hall / hõbedane | grey / silver | 30 |
| must | black | 22 |
| sinine / tumesinine | blue / dark blue | 14 |
| valge | white | 12 |
| punane / bordoo | red / maroon | 8 |
| roheline | green (mostly older cars) | 5 |
| pruun / beež | brown / beige | 4 |
| kollane, oranž, lilla, kuldne | yellow, orange, purple, gold | 5 |

Notes [DESIGN, LIKELY in tendency]:
- Black dominates on Land Cruiser, Lexus, Audi, BMW and Mercedes.
- White on vans, Teslas, taxis and new Toyotas.
- Green and maroon on 1995–2005 cars.

---

## 3. Vans, trucks, buses, motorcycles, mopeds, other

All lists are [LIKELY] for "common in Estonia" unless marked; weights are [DESIGN].

### 3.1 Vans (N1 *kaubik*, ≤ 3.5 t) and pickups (*pikap*)

| Model | Weight % | Typical user |
|---|---|---|
| Volkswagen Transporter (T4/T5/T6) | 16 | Tradesmen, small firms. **Also a common police van.** |
| Mercedes-Benz Sprinter | 12 | Couriers, minibuses (M2), ambulances (base vehicle) |
| Ford Transit / Transit Custom | 12 | |
| Volkswagen Caddy | 9 | |
| Renault Trafic / Master / Kangoo | 8 | |
| Mercedes-Benz Vito | 7 | |
| Volkswagen Crafter | 6 | |
| Peugeot Boxer / Partner / Expert, Citroën Jumper / Berlingo / Jumpy | 8 | |
| Opel Vivaro / Movano / Combo | 5 | |
| Fiat Ducato / Doblò | 4 | Camper base vehicles |
| Toyota Hilux | 5 | **Pickup favourite**: farmers, forestry, border guard |
| Mitsubishi L200, Ford Ranger, Nissan Navara, VW Amarok, Isuzu D-Max | 5 | Pickups |
| Toyota Proace / Hiace, Iveco Daily, Nissan NV / Primastar | 3 | |

Couriers seen in towns: Omniva, DPD, Itella (Smartpost), Venipak, Wolt/Bolt food couriers in cars and on bikes. [LIKELY]

### 3.2 Trucks (N2/N3 *veok*, *poolhaagisveduk*) and buses

- **Tractor units** [LIKELY]: Volvo FH, Scania R / S / G, MAN TGX, DAF XF, Mercedes-Benz Actros, Iveco S-Way, Renault T.
  - Many Estonian, Lithuanian, Latvian and Polish hauliers. Heavy flows on **Via Baltica (E67, Tallinn–Pärnu–Ikla)** and **Tallinn–Narva (E20)**, and through **Muuga** and **Vanasadam** ports to Finland.
- **Timber trucks** (*metsaveok*, often Scania or Volvo with a crane) are a rural staple. Typical events: loads, axle weight, diesel theft. [LIKELY]
- **Rigid trucks** [LIKELY]: MAN TGL / TGM, Volvo FL, Mercedes Atego, Isuzu, Scania P (municipal, waste, construction).
- **Road charge** (*teekasutustasu*): a time-based road charge for trucks (≥ 3.5 t) since **2018** [LIKELY]. Any extension to vans or cars is [UNSURE].
- **City buses** [LIKELY]:
  - Tallinn (TLT): MAN Lion's City, Solaris Urbino, Volvo 7900 Hybrid, Scania Citywide (CNG). Also trams (Škoda ForCity, Tatra KT4/KT6, CAF Urbos) and, until 2022, trolleybuses (Škoda).
  - Tartu: Scania Citywide gas buses (blue).
- **Coaches** [LIKELY]: Lux Express (Irizar / Scania / Setra), regional county buses (*maakonnaliinid*) in green, red or other county liveries.

### 3.3 Motorcycles (L3e *mootorratas*)

| Make | Typical models | Weight % [DESIGN] |
|---|---|---|
| Honda | CBR600RR, CB500 / CB650, Africa Twin, NC750X | 18 |
| Yamaha | MT-07 / MT-09, R1 / R6, XJ6, Ténéré 700 | 17 |
| Suzuki | GSX-R600 / 750 / 1000, V-Strom, Bandit, Hayabusa | 12 |
| Kawasaki | Z650 / Z900, Ninja ZX-6R / ZX-10R, Versys | 12 |
| BMW | R 1200 / 1250 GS, S 1000 RR, F 800 / 900 | 11 |
| KTM | Duke 390 / 790 / 1290, Adventure, EXC enduro | 9 |
| Harley-Davidson | Sportster, Softail, Road King | 6 |
| Triumph, Ducati, Husqvarna, Aprilia, Indian | | 10 |
| Ural / IŽ / Java (old) | | 5 |

- **Season**: roughly April–October. **Motorcycle crashes and fleeing riders peak in May–August.** [LIKELY]
- Rear plate only, so fixed front-facing cameras can't identify riders. PPA has set some fixed speed cameras to measure in both directions for this reason. [VERIFIED*: `ppa-organisation.md` source list, ERR headline "PPA paneb eelkõige mootorratturite tõttu kiiruskaamerad kahes suunas tööle"]

### 3.4 Mopeds, light vehicles, quads, tractors

- **Mopeds** (*mopeed*, L1e, max 45 km/h, licence category **AM** from 14) [LIKELY]:
  - Yamaha Aerox / Neo's, Piaggio / Vespa, Peugeot Speedfight / Kisbee, Honda, cheap Chinese scooters (Baotian, Znen, Keeway), Aprilia SR.
  - Teen moped events: rural joyrides, tuned mopeds ("tuunitud mopeed"), riding without a helmet.
- **Light vehicles** (*kergliikurid*: e-scooters, monowheels) [LIKELY]:
  - Rental from **Bolt** and **Tuul** in Tallinn, Tartu and Pärnu. Not registered, no plates.
  - Speed limit **25 km/h**. Riding drunk is fined.
  - Tallinn has restricted night-time rentals at times. [UNSURE] details
- **Pisimopeed** (small low-speed mopeds) is a separate category. [LIKELY] it exists; [UNSURE] exact rules
- **Quads / ATVs** (*ATV*, registered as L-category or *maastikusõiduk*) [LIKELY]:
  - CFMoto, Polaris, Can-Am, Yamaha Grizzly, TGB, Linhai.
  - Classic rural events: drunk quad rider, quad on the road without plates, quad on the beach or in the dunes.
- **Snowmobiles** (*mootorsaan*): registered as off-road vehicles. Lake Peipus, Hiiumaa, south-east Estonia. [LIKELY]
- **Tractors** (*traktor*): MTZ "Belarus", Valtra, John Deere, New Holland, Claas, old T-25 / T-40. Slow vehicles on rural roads cause rear-end crashes. [LIKELY]
- **Soviet classics**: Lada 2101–2107, Lada Niva (still common in rural areas and Ida-Viru), UAZ-452 "buhanka", Moskvitch, GAZ-21/24 Volga (collector cars). [LIKELY]
- **Trailers** (*haagis*): Tiki (Finnish), Brenderup, Respo, Neptun, Agados, Böckmann; boat and horse trailers. [LIKELY] Tiki and Brenderup common; others [UNSURE]

---

## 4. The traffic register (liiklusregister) and documents

### 4.1 Institutions

| Name | Period | Notes | Confidence |
|---|---|---|---|
| **ARK**: Riiklik Autoregistrikeskus (State Motor Vehicle Registration Centre) | 1990s–2008 | Registration, driving tests, licences | [LIKELY] |
| **Maanteeamet** (Road Administration) | 2009–2020 | ARK merged into it on 1 Jan 2009 | [LIKELY] |
| **Transpordiamet** (Transport Administration) | **1 Jan 2021 onward** | Merger of Maanteeamet, Veeteede Amet and Lennuamet. Keeps **liiklusregister**, runs driving exams, service bureaus (*teenindusbürood*) and the e-service (*e-teenindus*). | [LIKELY] |
| **Liikluskindlustuse Fond (LKF)** | Since 2001 | Compulsory motor insurance register and guarantee fund; lkf.ee | [LIKELY] |
| **Kaitsevägi** | — | Own register for military vehicles | [LIKELY] |

Older people still call it "ARK" or "Maanteeamet". Good flavour for NPC dialogue. [DESIGN]

### 4.2 Registration certificate (registreerimistunnistus)

- **Format**: a credit-card-size (ID-1) card following the EU-harmonised certificate (Directive 1999/37/EC). It is **not required to be carried in Estonia**. Physical cards may now be issued only on request. [LIKELY] card; [UNSURE] on-request rule
- **Roles in the register** [LIKELY]:
  - **omanik**: legal owner, often a leasing company. Real Estonian leasing firms include Swedbank Liising, SEB Liising, LHV Liising, Luminor Liising, Citadele Leasing and Bigbank.
    - [DESIGN] Real company names are fine as background owners, but avoid putting them in negative contexts. Fictional names are safer, e.g. "Põhjala Liising AS".
  - **vastutav kasutaja**: responsible user. Gets camera fines (*omanikuvastutus*, owner liability) and tax notices.
  - **kasutaja**: other registered users (optional).

**Certificate fields (EU codes) to show in the game's registry window** [LIKELY for the codes; Estonian labels DESIGN]:

| Code | Field (ET) | Field (EN) | Example |
|---|---|---|---|
| A | Registreerimisnumber | Registration number | `512 BLK` |
| B | Esmane registreerimine | Date of first registration (anywhere) | 2014-03-11 |
| — | Registreeritud Eestis | First registered in Estonia | 2019-06-04 (used import) |
| C.1 | Vastutav kasutaja (nimi, aadress) | Responsible user | Mari Tamm, Tartu |
| C.2 | Omanik | Owner | SEB Liising AS / private person |
| D.1 | Mark | Make | TOYOTA |
| D.2 | Tüüp / variant / versioon | Type / variant / version | XA4 |
| D.3 | Mudel (kaubanduslik nimetus) | Model | RAV4 |
| E | VIN (identifitseerimisnumber) | VIN | `JTMRJREV3KD012345` (valid check digit, K = 2019) |
| F.1 | Täismass | Max permissible mass | 2,135 kg |
| G | Tühimass | Kerb mass | 1,655 kg |
| J | Kategooria | Category | M1 |
| — | Keretüüp | Body type | AC universaal / AF mahtuniversaal / AA sedaan / AB luukpära |
| P.1 | Mootori maht | Engine capacity | 2,494 cm³ |
| P.2 | Võimsus | Power | 131 kW |
| P.3 | Kütus | Fuel | bensiin-hübriid / diisel / elekter |
| R | Värvus | Colour | HALL |
| S.1 | Istekohti | Seats | 5 |
| — | Tehnoülevaatus kehtib kuni | Inspection valid until | 2027-05-31 |
| — | Liikluskindlustus | Insurance status (from LKF) | Kehtiv kuni 2027-01-14, If P&C |
| — | Registreeringu staatus | Registration status | Registreeritud / Peatatud / Registrist kustutatud |
| — | Piirangud / märked | Restrictions / notes | Kohtutäituri keelumärge, Tagaotsitav |

**Category codes** [LIKELY]:
- M1 = sõiduauto (car); M2/M3 = buss (bus).
- N1 = kaubik (van ≤ 3.5 t); N2/N3 = veok (truck).
- L1e = mopeed; L3e = mootorratas; L6e/L7e = (ATV-type) quadricycle.
- O1–O4 = haagis (trailer); T = traktor.

### 4.3 Registration status and register notes

| Status / note (ET) | Meaning | Game flag | Confidence |
|---|---|---|---|
| **Registreeritud** | Normal | `clean` | [LIKELY] |
| **Registreering peatatud** | Suspended, either at the owner's request (car laid up, sold abroad, being repaired) or by the authority (unpaid car tax? missing documents?). **Must not be driven on public roads**; insurance and inspection not needed meanwhile. | `suspended` | [LIKELY] concept; [UNSURE] automatic triggers |
| **Registrist kustutatud** | Deregistered (scrapped, exported, destroyed). A deregistered car on the road means false plates. | `deregistered` (suggest adding) | [LIKELY] |
| **Ajutine registreerimine** | Temporary registration (transit) | — | [UNSURE] |
| **Tagaotsitav** (wanted) / **varastatud** (stolen) | Police note for a stolen vehicle or stolen plates; also an SIS alert | `stolen` | [LIKELY] concept; [UNSURE] exact register wording |
| **Kohtutäituri keelumärge / arest** | Bailiff's prohibition on disposal: the owner can't sell it. Police may be asked to seize the car (*sõiduki arestimine*). | `seizure` (suggest adding) | [LIKELY] |
| **Omandireservatsioon / liising** | Leasing company keeps ownership | ownerCompany | [LIKELY] |
| **Mootorsõidukimaks tasumata** | Car-tax debt. Blocks ownership change; effect on driving unconfirmed. | note | [UNSURE] |

**Design mapping to the existing `Vehicle.flags`** [DESIGN]:
- `stolen` → "Sõiduk on tagaotsitav (varastatud DD.MM.YYYY)".
- `suspended` → "Registreering peatatud".
- `insurance.valid=false` → "Kehtiv liikluskindlustus puudub".
- `inspection.valid=false` → "Tehnoülevaatus kehtetu (kuni DD.MM.YYYY)".
- `wanted` → free text, e.g. "Sõidukit kasutati vargusel, peatada ja tuvastada juht".

### 4.4 Technical inspection (tehnoülevaatus)

Carried out at private inspection stations (*ülevaatuspunktid*) licensed by Transpordiamet. Result levels follow the EU three-level defect scale. [LIKELY]

| Result (ET) | Meaning |
|---|---|
| **Korras** / *kerge puudus* | Pass, or minor defect (pass) |
| **Oluline puudus**: *kordusülevaatus* | Major defect. Must be repaired and re-inspected within a set time (about 30 days). |
| **Ohtlik puudus**: *sõidukeeld* | Dangerous defect. **Driving ban** until repaired; the car leaves on a tow truck. |

**Intervals** [UNSURE: the EU minimum is 4-2-2; Estonia is stricter for older cars, but the exact age bands are not confirmed]:

| Vehicle | First inspection | Then | Game default [DESIGN] |
|---|---|---|---|
| Car (M1) and van (N1) | About **4 years** after first registration (some sources may say 3) | Every **2 years**; **every year** once older than about 8–10 years | New car: first at 4 y, then every 2 y until 10 y old, then yearly |
| Taxi, driving-school car, rental car, ambulance | — | **Yearly** | Yearly |
| Truck (N2/N3), bus (M2/M3), heavy trailer (O3/O4) | 1 year | **Yearly** | Yearly |
| Motorcycle (L3e) | About 4 years | Every 2 years | Every 2 years |
| Moped, light trailer (O1) | Probably none or simplified | — | No inspection |
| Historic vehicle | Special, longer intervals | — | Every 2 years |

- The inspection date and validity are in the register. Police see them during a plate check, and ANPR can flag them. [LIKELY]
- Driving without a valid inspection is a misdemeanour (see `law-references.md`, *no_inspection*, [UNSURE] §). [VERIFIED*: the item exists in law-references.md]
- [DESIGN] Given the old fleet, about **8–12%** of cars checked at random should show an expired inspection. Often it lapsed weeks ago and the owner "didn't notice".

### 4.5 Compulsory motor insurance (liikluskindlustus) and LKF

- **Law**: Liikluskindlustuse seadus (LKindlS); the current act has been in force since about **1 Oct 2014**. [LIKELY]
- **Covered**: third-party bodily injury and property damage. Insurance is **vehicle-based**: it follows the plate, not the driver. [LIKELY]
- **Who must insure**: every registered vehicle **unless its registration is suspended**. No paper policy is needed in Estonia; status is checked in the LKF register. The public can check any plate on **lkf.ee**. [LIKELY]
- **LKF roles** [LIKELY]:
  1. Keeps the insurance register.
  2. Pays claims caused by **uninsured** vehicles and **unidentified** vehicles (*tundmatuks jäänud sõiduk*, e.g. hit-and-run), then recovers from the guilty party.
  3. Charges owners of uninsured vehicles a **lepingutasu** (penalty fee for the uninsured period). [VERIFIED*: `law-references.md`]
  4. Green Card bureau for cross-border claims.
- **Insurers active in Estonia** (for `insurance.insurer`) [LIKELY unless noted]:
  - If P&C Insurance (If Kindlustus)
  - ERGO Insurance
  - Swedbank P&C Insurance
  - Salva Kindlustus
  - Compensa (Vienna Insurance Group)
  - BTA Baltic Insurance
  - LHV Kindlustus [LIKELY, launched about 2023]
  - Inges Kindlustus [UNSURE]
  - [DESIGN] Real insurer names as data are low-risk. If you want zero real brands, use fictional names such as "Läänemere Kindlustus".
- [DESIGN] Uninsured share among stopped cars: **about 2–4%**. Higher among cheap old cars, cars just bought without re-insuring, and young drivers in Ida-Viru and rural areas.

### 4.6 Other register-linked items

- **Mootorsõidukimaks** (car tax, 2025): the registration fee is paid when a car is first registered in Estonia (and possibly on later registrations), plus an annual tax. Tax debt blocks owner changes. [LIKELY] concept; [UNSURE] details
- **Winter tyres**: studded tyres (*naastrehvid*) allowed roughly **15 Oct – 31 Mar** (dates can shift with weather); winter tyres mandatory roughly **1 Dec – 1 Mar**. The game date (17 Oct 2026) is in the "studs now allowed" window. [LIKELY]
- **Lights**: low beam or DRL compulsory at all times. [LIKELY]
- **Speed limits**: built-up area 50, rural 90, some 2+2 sections 100–120 in summer (often lowered in winter), gravel roads 90 unless signed. [LIKELY] general; [UNSURE] the 120 sections
- **Mobile parking**: Estonian cities charge parking by plate via phone (*m-parkimine*, an Estonian invention, about 2000). Parking control checks plates. [LIKELY]

### 4.7 Driving licences (juhiload, juhtimisõigus)

Estonia follows the EU licence directive (2006/126/EC) and adds national tractor and machinery categories. The ages are EU defaults. [LIKELY unless marked]

| Category | Vehicles | Min. age | Notes |
|---|---|---|---|
| **AM** | Mopeds (≤ 45 km/h), light quadricycles | 14 | Under-16s may have extra limits [UNSURE] |
| **A1** | Motorcycles ≤ 125 cm³ / 11 kW, tricycles ≤ 15 kW | 16 | |
| **A2** | Motorcycles ≤ 35 kW | 18 | |
| **A** | All motorcycles | 24 (or 20 after 2 years of A2) | |
| **B1** | Quadricycles (ATV-type) | 16 | |
| **B** | Cars ≤ 3,500 kg, ≤ 8 passenger seats; light trailer | 18 | Accompanied driving at 17 is in the new EU directive (2025, to be transposed later) [UNSURE] for Estonia |
| **B + code 96** | Car plus trailer, combination up to 4,250 kg | 18 | |
| **BE** | Car plus heavy trailer (trailer ≤ 3,500 kg) | 18 | Common for boat and horse trailers |
| **C1 / C1E** | 3.5–7.5 t trucks (+ trailer) | 18 | |
| **C / CE** | Trucks > 3.5 t (+ trailer, articulated) | 21 (18 with CPC, *ametikoolitus*) | |
| **D1 / D1E** | Minibuses ≤ 16 passengers | 21 | |
| **D / DE** | Buses | 24 (21 with CPC) | |
| **T** (national) | Tractors, self-propelled machinery | 16 [UNSURE] | National category; details [UNSURE] |
| **R** (national?) | Road trains, tractor + trailer? | — | [UNSURE] whether it still exists |

**Esmane juhiluba (probationary first licence)** [LIKELY unless marked]:
- Issued for **2 years** for A1, A2, A, B1 and B.
- During this time the holder must complete the **lõppastme koolitus** (final-stage training: skid-pad and slippery-road practice called *libedasõit*, plus a night-driving module called *pimeda aja sõit*).
- **Swapping it for a full licence** (*juhiluba*, normally **10 years**; C/D groups shorter, linked to medical certificates) requires no serious unpunished traffic offences. If the holder has offences, they may need to resit tests or wait. [UNSURE] details
- **Novice sign**: a "**vahtraleht**" (maple-leaf) novice-driver sign exists. Whether it is still compulsory is [UNSURE]; it may have become optional in the 2010s.
- **Alcohol limit**: the same **0.20 ‰ blood / 0.10 mg/l breath** applies to everyone; there is no separate zero limit for novices. [LIKELY] (thresholds match `law-references.md`)
- [DESIGN] The person's `license.probationary = true` if they got category B less than 2 years before the game date. They are usually 18–20, but late starters exist.

**Licence status words** (`Person.license.status`) [LIKELY concepts; labels DESIGN]:

| Status (ET) | Meaning | Map to |
|---|---|---|
| **Kehtiv** | Valid | `valid` |
| **Peatatud** (juhtimisõiguse peatamine) | **Suspended**, temporarily. Causes: the police remove the driver on the spot (drunk, no medical certificate, etc.) and suspend the right during proceedings; or a **bailiff suspends it for unpaid child support or fines** (*elatisvõlgnik*) | `suspended` |
| **Ära võetud** (juhtimisõiguse äravõtmine) | **Deprived** as a penalty: up to 12 months for misdemeanours (LS) or up to 3 years as an additional criminal penalty (KarS). See `law-references.md`. | `revoked` |
| **Kehtetu / aegunud** | Expired, or invalid on medical grounds | `expired` |
| **Puudub** | Never had one | `none` |

- **Carrying the licence** is not required in Estonia if the driver has an ID document; police check the register by isikukood. [LIKELY]
- **Common real events**: *juhtimisõiguseta juht* (unlicensed driver; often a former drunk driver whose right was taken away), *peatatud juhtimisõigusega juht*, and a foreign licence that has expired for residence purposes. [LIKELY]

---

## 5. VIN (sõiduki identifitseerimisnumber, "VIN-kood")

### 5.1 Structure [LIKELY: ISO 3779 / 3780, well-known]

```
 J T M R J R E V 3 K D 0 1 2 3 4 5
 └─WMI─┘ └───VDS────┘ │ │ │ └─serial─┘
  1-3      4-8        9 10 11  12-17
                      │  │  └ plant code
                      │  └ model year (mandatory in NA; common but optional in EU)
                      └ check digit (mandatory in North America and China; EU makers often put a letter or 0 here)
```

- **17 characters.** Digits 0–9 and letters A–Z **except I, O, Q** (to avoid confusion with 1 and 0).
- **Position 10 (model year)** codes: `Y`=2000, `1`–`9`=2001–2009, `A`=2010, `B`=2011, `C`=2012, `D`=2013, `E`=2014, `F`=2015, `G`=2016, `H`=2017, `J`=2018, `K`=2019, `L`=2020, `M`=2021, `N`=2022, `P`=2023, **`R`=2024, `S`=2025, `T`=2026**, `V`=2027. The letters I, O, Q, U and Z and the digit 0 are never year codes; the 30-year cycle restarts (`A` was also 1980).
- **Check digit (position 9)**, as in North America:
  - Transliterate: A=1 B=2 C=3 D=4 E=5 F=6 G=7 H=8 · J=1 K=2 L=3 M=4 N=5 P=7 R=9 · S=2 T=3 U=4 V=5 W=6 X=7 Y=8 Z=9. Digits keep their value.
  - Weights for positions 1–17: `8 7 6 5 4 3 2 10 0 9 8 7 6 5 4 3 2`.
  - Sum of value × weight, mod 11. A remainder of 10 is written `X`.
  - [DESIGN] For EU-market cars, real position 9 is often not a valid check digit. The game may still compute it for every VIN, because it is harmless and lets a "VIN tampering" puzzle exist. A "cloned car" beat can then show a VIN whose check digit fails, or a VIN whose WMI does not match the make.

### 5.2 WMI codes for makes common in Estonia

[LIKELY] unless marked. Several makes have more than one code by factory and era.

| Make | WMI(s) | Notes |
|---|---|---|
| Toyota (Japan) | **JTD**, **JTE**, **JTM** (RAV4, Land Cruiser), **JTN**, JT2, JT3 | **JTE**/**JTM** for Land Cruiser [UNSURE which] |
| Toyota (Europe) | **SB1** (UK: Avensis, Auris, Corolla), **VNK** (France: Yaris), **NMT** (Turkey: Corolla, C-HR) | |
| Lexus | **JTH** (cars), **JTJ** (SUVs: RX, NX) | |
| Škoda | **TMB** | |
| Volkswagen | **WVW** (cars), **WVG** (SUVs/MPVs: Tiguan, Touareg, Touran), **WV1** (commercial: Transporter/Caddy/Crafter van), **WV2** (Transporter bus/Multivan) | |
| Audi | **WAU** (cars), **WA1** (Q-series SUVs), **WUA** (Audi Sport / quattro GmbH), TRU (Hungary: TT) | |
| BMW | **WBA** (cars), **WBS** (M), **WBY** (i), **5UX** / **5YM** (US-built X models), **WMW** (MINI), **WB1** (BMW Motorrad) | |
| Mercedes-Benz | **WDB** (older), **WDD** (cars, about 2000–2020), **WDC** (SUVs), **WDF** (Vito/Viano), **W1K** (cars about 2020+), **W1N** (SUVs 2020+), **W1V** (vans 2020+) | Era split [LIKELY] |
| Volvo | **YV1** (cars), **YV4** (SUVs: XC60/XC90), **YV2** (trucks), **YV3** (buses), LYV (China-built) | |
| Ford | **WF0** (Germany: Focus, Mondeo, Fiesta), **NM0** (Turkey: Transit, Transit Custom/Connect), VS6 (Spain, older) | Note the digit zero in WF0 |
| Opel / Vauxhall | **W0L** (GM era), **W0V** (Stellantis era, about 2018+), VXK (France-built) | Digit zero |
| Kia | **KNA** / **KNE** (Korea), **U5Y** / **U6Y** (Slovakia, Žilina: Ceed, Sportage) | |
| Hyundai | **KMH** (Korea), **TMA** (Czechia, Nošovice: i30, Tucson) | |
| Nissan | **SJN** (UK, Sunderland: Qashqai, Juke), **JN1** (Japan cars), **JN8** (Japan SUVs), VSK (Spain: Navara) | |
| Honda | **JHM** (Japan), **SHH** / **SHS** (UK, Swindon: Civic, CR-V) | |
| Mazda | **JMZ** (European-spec), JM1 | |
| Subaru | **JF1** (cars), **JF2** (SUVs: Forester, Outback) | |
| Mitsubishi | **JMB** / **JMY**, XMC (NedCar) | |
| Renault | **VF1**; Renault Trucks VF6 | |
| Dacia | **UU1** | |
| Peugeot | **VF3**, VR3 (newer) | |
| Citroën | **VF7**, VR7 (newer) | |
| Seat / Cupra | **VSS** | |
| Fiat | **ZFA**; Iveco ZCF | |
| Tesla | **5YJ** (US), **LRW** (Shanghai), **XP7** (Berlin) | |
| Lada (AvtoVAZ) | **XTA** | UAZ XTT, GAZ X96 [UNSURE] |
| Scania / MAN / DAF | **YS2** (Scania trucks), **WMA** (MAN), **XLR** (DAF) | |
| Motorcycles | Honda **JH2**, Yamaha **JYA**, Suzuki **JS1**, Kawasaki **JKA**, KTM **VBK**, Harley-Davidson **1HD** | |

[DESIGN] VIN generator:
1. WMI from the table by make (and era).
2. Positions 4–8: random from the allowed set.
3. Position 9: check digit.
4. Position 10: year code.
5. Position 11: plant letter.
6. Positions 12–17: six digits.

---

## 6. Plate-recognition (ANPR) and traffic cameras

### 6.1 Numbrituvastuskaamerad (ANPR)

- **What exists** [LIKELY]:
  - **Fixed ANPR cameras** on main roads, at town exits and at border crossings (Narva, Koidula, Luhamaa, Ikla on the Latvian border, ports).
  - **In-car ANPR** in some patrol cars.
  - **Port and ferry gate cameras**: Tallinn port, and Virtsu, Kuivastu, Rohuküla and Heltermaa, where praamid.ee tickets are bound to the plate.
  - Municipal or private plate cameras (car parks, fuel stations) that police can request in investigations.
- **Hit categories** (what the system flags) [LIKELY; exact list UNSURE]:
  - stolen vehicle, stolen plates
  - vehicle linked to a wanted person or a crime ("BOLO")
  - SIS (Schengen) alerts
  - uninsured vehicle, expired inspection, suspended or deregistered registration
  - owner or responsible user with a suspended or revoked licence (a hint only; the driver may be someone else)
  - Russian-registered car (border)
  - customs and tax interest (MTA)
- **Controversy** [LIKELY outline; UNSURE dates and outcome]:
  - Around **2023–2024**, media and the **Õiguskantsler** (Chancellor of Justice, Ülle Madise) said PPA's plate-camera network stored all passing vehicles' plates, times and places without a clear enough legal basis, and that other agencies could use the data.
  - The government then drafted law changes to set out ANPR use and data-retention limits.
  - [DESIGN] In-game, the ANPR upgrade can show a short "data kept 30 days" note. This matches the spirit of the debate, not a confirmed number.
- **Game behaviour** [DESIGN]:
  - An ANPR hit creates a radio alert from the command centre: *"Numbrituvastuse tabamus: 512 BLK, hall Toyota RAV4, tagaotsitav, liigub Tartu maanteel Tallinna suunas, kaamera Kose."*
  - The nearest patrol is asked to intercept, which can lead to a pursuit.
  - About **10–20% of hits are false or stale**: misread plates (8↔B, 0↔O), a car already returned, a plate swapped onto another car.

### 6.2 Speed and red-light cameras

- **Fixed speed cameras** (*statsionaarsed kiiruskaamerad*) [LIKELY]:
  - Grey boxes on poles. There are more posts than cameras: cameras rotate between posts.
  - Owned or maintained by Transpordiamet; fines processed by the **PPA liiklusjärelevalvekeskus**. [VERIFIED*: the centre exists, `ppa-organisation.md`]
  - The fine is a **hoiatustrahv** (warning fine) mailed to the **vastutav kasutaja** (owner liability), not to the driver.
  - Fixed cameras fine from a lower excess than mobile ones. [VERIFIED*: fixed 3 km/h, mobile ≥ 6 km/h (since a recent 1 July), `ppa-organisation.md`]
  - Count: a few dozen to about 100+ fixed camera sites. [UNSURE]
- **Mobile speed cameras**: **8 mobile speed cameras** nationwide. **Warning signs before mobile cameras are required** under a recent rule. [VERIFIED*: `ppa-organisation.md`]
- **Two-direction measuring**: introduced mainly because of motorcyclists with rear-only plates. [VERIFIED*: ERR headline in `ppa-organisation.md` sources]
- **Red-light and intersection cameras** (*foorikaamerad*, *ristmikukaamerad*) in Tallinn and Tartu catch red-light running and sometimes speeding. [LIKELY]
- **Average-speed cameras** (*keskmise kiiruse mõõtmine*, *lõigukiiruse mõõtmine*) [UNSURE]:
  - Proposed and discussed for Estonia's main roads (Tallinn–Tartu E263 and Tallinn–Pärnu were mentioned).
  - The author **could not confirm** any section in operation by October 2026.
  - [DESIGN] Leave it out of the base game, or add it as a fictional "pilot section" upgrade, clearly labelled.
- **Handheld lidar and radar**: patrols use handheld laser guns and in-car radar (*laserkiirusmõõtur*, *radar*); unmarked cars do mobile speed checks. [LIKELY]
- **Fine amounts** for automated fines: capped hoiatustrahv amounts per km/h band; caps were raised in the mid-2020s. [UNSURE] Use `law-references.md` section 5.

---

## 7. Ferries and ice roads

### 7.1 Ferry lines (praamiliinid)

| Line | Connects | Crossing time | Operator / ships | Confidence |
|---|---|---|---|---|
| **Virtsu–Kuivastu** | Mainland (Läänemaa/Pärnumaa border) ↔ **Muhu**, then the **Väinatamm** causeway (about 3.6 km) to **Saaremaa** (Kuressaare is about 75 km from Kuivastu) | **About 28 min** | **TS Laevad** (a subsidiary of Tallinna Sadam, operating since Oct 2016). Ships **Tõll** and **Piret** on this line; reserve possibly Regula | [LIKELY]; ship allocation [UNSURE] |
| **Rohuküla–Heltermaa** | Mainland (near Haapsalu) ↔ **Hiiumaa** (Kärdla about 25 km from Heltermaa) | **About 75 min** (70–90) | TS Laevad. Ships **Leiger** and **Tiiu** | [LIKELY] |
| **Rohuküla–Sviby** | Mainland ↔ **Vormsi** | About 45 min | Kihnu Veeteed (state); ferry *Ormsö* [UNSURE] | [LIKELY] line; [UNSURE] operator |
| **Sõru–Triigi** | Hiiumaa ↔ Saaremaa | About 60 min, few sailings a day | Kihnu Veeteed; ferry *Soela* [UNSURE] | [LIKELY] line |
| **Munalaiu–Kihnu** | Pärnumaa (Tõstamaa) ↔ **Kihnu** (also Pärnu–Kihnu in summer) | About 60 min | Kihnu Veeteed; *Kihnu Virve* [UNSURE] | [LIKELY] |
| Roomassaare–Abruka; Saaremaa/Pärnu–Ruhnu (summer); Laaksaare–Piirissaar (Lake Peipus) | Small islands | Varies | Small state-contracted vessels | [UNSURE] |
| **Tallinn–Helsinki** | Tallinn **Vanasadam** (Old City Harbour) ↔ Helsinki (West Harbour / Katajanokka) | **About 2 h** (Tallink shuttles), about 2.5 h (Viking, Eckerö) | **Tallink** (*Megastar*, *MyStar*; D-terminal), **Viking Line** (*Viking XPRS*; A-terminal), **Eckerö Line** (*Finlandia*; A-terminal) | [LIKELY]; terminal letters [UNSURE] |
| Muuga–Vuosaari | Freight (trucks) | About 2–3.5 h | Eckerö *Finbo Cargo*, Tallink freight | [LIKELY] |
| Tallinn–Stockholm (via Mariehamn); Paldiski–Kapellskär | Sweden | Overnight (about 10–16 h) | Tallink; DFDS | [LIKELY] |

**Notes for the game** [LIKELY in substance; numbers DESIGN]:
- **Tickets by plate.** On the island lines, the ticket is booked on **praamid.ee** against the vehicle's **registration number**, and port gates read plates. The game can query "did 512 BLK board the 14:30 Virtsu ferry?" This is a very realistic investigative step.
- **Queues.** Summer Friday and Sunday queues at Virtsu and Kuivastu, and Rohuküla and Heltermaa, cause "queue jumping" (*järjekorrast möödatrügimine*) disputes, drunk waiting drivers and ill passengers.
- **Island police response.** Police reinforcement to Saaremaa or Hiiumaa by road means the ferry (at least 30–90 min plus waiting), unless a PPA helicopter is used. A suspect on an island is "trapped" unless they reach a ferry.
- **Weather.** Storms cancel small-island lines first; ice-breaking in winter slows crossings (Tõll and Piret are ice-class).
- **Tallinn port.**
  - Finnish "booze tourists" (*viinaturistid*): drunk passengers, fights at the terminal.
  - Drunk drivers driving off the ferry: PPA and Finnish police run joint checks.
  - Trucks: overweight, cargo checks (MTA customs).
  - A wanted person leaving on a ferry: alert the port and the Finnish police.

### 7.2 Ice roads (jääteed)

**General** [LIKELY]:
- Official ice roads are opened **by Transpordiamet** (formerly Maanteeamet), only in **cold winters** once the ice is thick enough, and only on marked routes.
- They have **not opened every year**: mild winters such as 2020 had none. Which recent winters had them (2021? 2024? 2026?) is [UNSURE].
- Driving on sea ice **outside** an official ice road is dangerous and can be punished.
- Ice fishermen's cars going through the ice on **Lake Peipus (Peipsi)**, and fishermen stranded on **drifting ice floes**, are classic PPA, rescue and helicopter events.

**Known ice-road routes** [route existence LIKELY; lengths UNSURE]:

| Route | Approx. length | Notes |
|---|---|---|
| **Rohuküla–Heltermaa** (Hiiumaa) | **About 26–27 km** | Often called **Europe's longest official ice road** [LIKELY] |
| **Virtsu–Kuivastu** (Muhu) | About 7–8 km | Opens most often of the long routes |
| **Rohuküla–Vormsi** | About 10–15 km | |
| **Haapsalu–Noarootsi** | About 3–4 km | Short, across Haapsalu bay |
| **Munalaiu–Kihnu** or **Pärnu coast–Kihnu** | About 12–15 km | |
| **Sõru–Triigi** (Hiiumaa–Saaremaa) | About 15–20 km | Rare |
| **Roomassaare–Abruka** | About 5 km | |
| **Laaksaare / Mehikoorma–Piirissaar** (Lake Peipus) | About 6–10 km | |

**Ice-road rules** (*jäätee kasutamise reeglid*). The game should display these. [LIKELY: widely publicised every winter; exact figures may vary by route and year]
1. Drive **only on the marked route** between the stakes or markers.
2. **Mass limit**: usually cars up to **2 t or 2.5 t** total mass (may rise to about 3 t on very thick ice). Buses and trucks are normally not allowed. [UNSURE] the exact limit each year
3. **Seat belts must be UNFASTENED** (*turvavöö peab olema lahti*), so occupants can escape if the car breaks through. This is the famous reversal of the normal rule. Some advise keeping a door ready to open.
4. **Do not drive at 25–40 km/h**: that speed band can set up a resonance wave in the ice. Allowed: **up to 25 km/h** or **40–70 km/h**. **Max 70 km/h.**
5. **Keep at least 250 m from the vehicle ahead.** No convoys.
6. **No stopping or standing** on the ice road, and no overtaking.
7. **Daylight only**: open only in daylight hours (roughly sunrise to sunset; posted hours, e.g. 08–18); closed at night and in poor visibility or fog.
8. **No pedestrians, cyclists or trailers** on most ice roads. [UNSURE]
9. Ice roads can be **closed at short notice** in thaw, wind or cracks; status is published by Transpordiamet and in the news.

**Game hooks** [DESIGN]:
- Winter events: "auto vajus jäätee kõrval läbi jää" (a car went through the ice beside the ice road); "jäätee rikkuja seisab jääl" (a car stopped on the ice road); "kalamehed triiviva jäätüki peal Peipsil" (fishermen on a drifting ice floe on Peipus), which needs a helicopter.
- Fines for **speeding on an ice road**, **wearing a seat belt** (a fun inversion) and **stopping**.

---

## 8. Ready-to-use Estonian phrases (radio and registry UI) [DESIGN]

| Situation | Estonian | English |
|---|---|---|
| Plate query | "Kontrolli sõidukit, number viis-üks-kaks, Boris-Leo-Kalju." / "Palun kontrolli 512 BLK." | "Check vehicle 512 BLK." |
| Clean | "Sõiduk korras: Toyota RAV4, hall, 2019. Vastutav kasutaja Mari Tamm, kindlustus ja ülevaatus kehtivad." | "Vehicle OK…" |
| Stolen | "Tähelepanu! Sõiduk on tagaotsitav, varastatud 14.10 Viimsist. Ole ettevaatlik." | "Caution! Vehicle wanted, stolen 14 Oct in Viimsi." |
| No insurance | "Sõidukil kehtiv liikluskindlustus puudub alates 02.09." | "No valid motor insurance since 2 Sep." |
| Inspection expired | "Tehnoülevaatus kehtis kuni 31.07." | "Inspection valid until 31 Jul." |
| Suspended registration | "Sõiduki registreering on peatatud, liiklemine keelatud." | "Registration suspended; may not be driven." |
| Deregistered | "Sõiduk on registrist kustutatud 2023. aastal: numbrid ei vasta sõidukile." | "Deregistered in 2023; plates don't belong to this car." |
| Plates stolen | "Registreerimismärgid on tagaotsitavad, varastatud Ford Focuselt." | "The plates are wanted, stolen from a Ford Focus." |
| Plate/VIN mismatch | "VIN ei vasta registreerimisnumbrile, võimalik kloon." | "VIN doesn't match the plate, possible clone." |
| Not found | "Sellist numbrit liiklusregistrist ei leia." | "No such number in the traffic register." |
| Driver licence suspended | "Juhi juhtimisõigus on peatatud." / "Juhtimisõigus ära võetud kuni 03.2027." | "Driver's licence suspended." / "Licence removed until Mar 2027." |
| No licence | "Isikul juhtimisõigus puudub." | "Person has no driving licence." |
| ANPR hit | "Numbrituvastuse tabamus: …" | "ANPR hit: …" |

Phonetic alphabet: the Estonian police use a name-based spelling alphabet (Anna, Boris, …) or the ICAO alphabet. [UNSURE] Leave this to the radio research note.

---

## 9. Real-world event frequencies relevant to vehicles [DESIGN, informed by prior knowledge]

| Situation (per random traffic stop) | Probability |
|---|---|
| Everything in order | 70% |
| Inspection expired | 8–12% |
| No insurance | 2–4% |
| Registration suspended | 0.5–1% |
| Driver has no licence, or a suspended or revoked one | 2–3% |
| Driver drunk (in a routine *joobekontroll* raid) | 0.3–1% (higher on weekend nights) |
| Vehicle stolen | ≤ 0.1% (much higher for ANPR-triggered stops) |
| Plates don't match the vehicle | ≤ 0.2% |

---

## 10. Concrete generator spec for the game [DESIGN]

### 10.1 Plate generator

```
standardPlate():   DDD␠LLL      D=0-9 (avoid "000"), L ∈ ALLOWED
ALLOWED = A B C D E F G H J K L M N P R S T U V X Y Z   // drops I, O, Q, W as a safe choice; [UNSURE] vs reality
motoPlate():       DD / LLL      (two-row; render stacked)
mopedPlate():      DD / LL       (two-row, small)                         [format UNSURE]
trailerPlate():    DD␠LLL                                                  [format UNSURE]
personalPlate():   2–9 chars [A-Z0-9 ␠], at least one letter              (≈0.5% of cars)
foreign: FI "ABC-123", LV "AB-1234", LT "ABC 123", RU "А123ВС 78", UA "AA1234BB", PL "WX 12345"
```
- Store as uppercase with a single space; search ignores the space (`512blk` matches `512 BLK`).
- **Misread variants** for ANPR false hits: 8↔B, 0↔D, 5↔S, 2↔Z, 1↔7.

### 10.2 Vehicle record

Extends the existing `Vehicle` in `src/sim/types.ts`. Suggested optional additions:
- `firstRegistered`, `registeredInEstonia` (dates)
- `bodyType` (`'sedaan' | 'universaal' | 'luukpära' | 'maastur' | 'mahtuniversaal' | 'kaubik' | 'pikap' | 'kupee'`)
- `fuel`
- `category` (`'M1' | 'N1' | 'N3' | 'L1e' | 'L3e' | 'O1' | 'T' | …`)
- `responsibleUserId` (vastutav kasutaja, separate from `ownerId` / `ownerCompany`)
- `flags.deregistered`, `flags.seizure` (kohtutäituri keelumärge), `flags.platesStolen`

### 10.3 Age and validity rules

- Car year: draw from a distribution with **mean age about 15 years** (median about 14, long tail to 30+). Land Cruiser and Lexus skew younger (median about 8); Lada Niva older.
- Inspection `until`: computed from year and the §4.4 interval rule, then made "expired" with the §9 probability.
- Insurance: yearly policy with a random start date; expired with the §9 probability; insurer from the §4.5 list.

### 10.4 Theft

Stolen-vehicle spawns use the §2.3 table, weighted:
- Land Cruiser 25%
- Lexus RX / NX 15%
- RAV4 15%
- other Toyota 10%
- older Audi / BMW / VW 20%
- motorcycles and mopeds 15%

### 10.5 Avoiding real plates

There is no way to know which `123 ABC` combinations are real. The game can't avoid them all; it should:
- show the disclaimer;
- not use plates from famous news stories;
- ideally keep personalised plates fictional and silly rather than names of real people.

---

## 11. Open uncertainties: verify first when search is available

1. **Plate formats** for motorcycles, mopeds, trailers, tractors, diplomatic, transit, trade and Defence Forces plates. Check the Transpordiamet page "Registreerimismärgid" and Wikipedia ("Vehicle registration plates of Estonia" / "Eesti registreerimismärgid").
2. Whether any letters (I, O, Q, W…) are **excluded** from standard series, which **series are current** (2025–26), and the plate **font** name.
3. **Personalised plate** rules: character count, fee, auction.
4. **Tehnoülevaatus intervals** by vehicle age. Check the Transpordiamet page and the relevant MKM/MTM määrus on Riigi Teataja.
5. **Fleet numbers**: total M1 count, top makes and models with exact counts, average age. Sources: Transpordiamet statistics ("sõidukite statistika"), stat.ee, ACEA.
6. **Car-theft numbers and top-stolen models** for 2023–2025 (PPA, ERR).
7. **ANPR legal changes**: Õiguskantsler opinion date, the law amendment, retention period.
8. **Average-speed cameras**: did any section open? Number of fixed speed-camera sites; current hoiatustrahv caps.
9. **Ferry operator** after the TS Laevad contract (the public-service contract period may end around 2026), and the current ship allocation per line.
10. **Ice-road** opening years since 2020, the current mass limit and opening hours; whether the 250 m spacing and 25–40 km/h band still apply.
11. **Esmane juhiluba** details (the novice maple-leaf sign, what happens after offences), the national tractor categories (T / R), and whether B is available at 17.
12. **Moped registration** (since when, and plate format).
13. **Mootorsõidukimaks** changes after 2025, and whether unpaid tax affects registration or driving.

---

## Sources

- **No web pages were searched or fetched by this agent**: the shared search budget was exhausted before this agent started.
- Facts marked **[VERIFIED*]** come from the sibling notes in this folder, which list their own sources:
  - `docs/research/ppa-organisation.md`, §5 table "Liiklusjärelevalve" and the source list. It includes ERR, "PPA paneb eelkõige mootorratturite tõttu kiiruskaamerad kahes suunas tööle": https://www.err.ee/1609707585/ppa-paneb-eelkoige-mootorratturite-tottu-kiiruskaamerad-kahes-suunas-toole
  - `docs/research/law-references.md`: LKindlS / LKF *lepingutasu*, drink-driving thresholds, *no_inspection* and *no_licence* items.
- Suggested sources to check:
  - transpordiamet.ee (registreerimismärgid, tehnoülevaatus, jääteed, statistika)
  - lkf.ee
  - riigiteataja.ee (Liiklusseadus, LKindlS, tehnoülevaatuse määrus)
  - err.ee
  - politsei.ee
  - praamid.ee
  - stat.ee
  - et.wikipedia.org
