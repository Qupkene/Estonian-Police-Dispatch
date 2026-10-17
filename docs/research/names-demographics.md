# Names and demographics: population data for procedural generation

Research notes for **EPD**, an unofficial fan-made Estonian police dispatch simulator. The goal is
to generate people, documents, phone numbers and rural addresses that look right to an Estonian
player. The data feeds `gen-people` (`isikukood.ts`, `names.ts`, `person.ts`, `phone.ts`).

## Confidence key and research limitations

**Read this first.** The web-search budget for this workflow run was already used up before this
agent started, and WebFetch is blocked. **No live source could be checked for this file.** So:

| Tag | Meaning in this file |
|---|---|
| **[VERIFIED]** | Not used. Nothing here was seen in a search result during this run. |
| **[COMPUTED]** | Checked by running code in this session. Used for isikukood checksums and examples. |
| **[LIKELY]** | Strong prior knowledge that matches widely known public data (Statistics Estonia, census, Estonian Wikipedia, ERR usage). Safe for game data. |
| **[UNSURE]** | Plausible, but exact numbers, ranges or rank order may be off. Fine for flavour; check before treating as fact. |
| **[DESIGN]** | A suggestion for the game, derived from the figures above. Not a fact about Estonia. |

Numbers given as "~" are rounded approximations. Name lists are grouped into tiers by frequency
and generation. The tier a name sits in is [LIKELY]; its exact rank inside a tier is [UNSURE].

Sources to check against later (not consulted this run): the Statistics Estonia name statistics
tool ("Nimede statistika" on stat.ee), Census 2021 (REL 2021) tables on andmed.stat.ee, the
Siseministeerium / PPA citizenship figures, the Estonian Wikipedia article "Isikukood", and
the standard EVS 585.

---

## 0. Quick generator recipe [DESIGN]

1. Pick the **locality** (district, town or rural area). Use the §5.4 table to choose a
   **population group**: Estonian, Russian-speaking resident, Ukrainian (war refugee or recent
   arrival), or other.
2. Pick **age** (18-80) from the §11 distribution. In Ida-Virumaa and among Russian-speakers,
   push the age distribution older.
3. Pick **sex** (women ~53% of adults; ~60-65% of people over 65).
4. Pick a **first name**. Filter the name tables to rows whose "peak birth years" include the
   person's birth year ±5 years. Sample by weight. This matters: an 18-year-old *Malle* or a
   75-year-old *Rasmus* looks wrong to Estonians.
5. Pick a **surname** from the group's list. Russian and Ukrainian surnames take a female form
   (§3.4, §4.3). Estonian surnames never do.
6. Pick **citizenship** from §6.4, conditioned on group, age and town.
7. Build the **isikukood** (§7). Take the century and sex digit from birth year and sex, then the
   birth date. For people born before 2013, the serial comes from their birthplace's hospital
   range. Then add the checksum.
8. Add a **phone** (§8). Most people have a mobile starting with 5. Older people and businesses
   may also have a landline with the county prefix.
9. Add an **occupation** (§9) and, for rural callers, a **farm name and address** (§10).
10. Mixing rule: ~5% of Estonians get a Russian or "international" first name, and ~5% of
    Russian-speakers get an Estonian surname (mixed families). This adds realism.

---

## 1. Estonian first names

General facts:

- Across *all* residents, the most common male first name is probably **Aleksandr** and the most
  common female name **Jelena** (both Russian-speaking). **Andres** is the most common
  Estonian-origin male name. [LIKELY]
- Estonian names are generation-specific. People born in 1940-1960 have short, often
  "Estonianised" names (Tiit, Jüri, Malle, Tiiu, Ene). People born in 1960-1975 have names like
  Aivar, Urmas, Margus, Tiina, Anne and Piret. The 1980s brought Martin, Kristjan, Kadri and
  Triin. The 1990s-2000s brought Rasmus, Robin, Karl, Laura, Sofia and Eliise. [LIKELY]
- **Hyphenated double names** (Mari-Liis, Karl-Erik, Hans-Kristjan, Anna-Liisa, Pille-Riin)
  are common among people born after ~1985 and rare before. [LIKELY] Use them for about 3-5% of
  people born after 1985 [DESIGN].
- Some names are shared with the Russian-speaking group (Maria, Anna, Viktor, Aleksander,
  Erik, Artur). These are good for ambiguous callers. [LIKELY]

### 1.1 Men (Estonian): 133 names

Weight: 5 = very common, 3 = common, 1 = occasional. "Peak birth years" means the cohort where
the name is concentrated. Ages assume the game year 2026.

**Older generation (born ~1935-1960, age ~66-80+)**

| Name | Peak birth years | Weight |
|---|---|---|
| Jüri | 1940-1965 | 5 |
| Tiit | 1945-1965 | 5 |
| Toomas | 1945-1970 | 5 |
| Rein | 1940-1960 | 4 |
| Peeter | 1940-1970 | 4 |
| Jaan | 1935-1965 | 4 |
| Mati | 1940-1960 | 4 |
| Tõnu | 1945-1965 | 4 |
| Mart | 1945-1975 | 4 |
| Ants | 1935-1960 | 3 |
| Enn | 1935-1955 | 3 |
| Arvo | 1935-1960 | 3 |
| Heino | 1930-1955 | 3 |
| Kalju | 1930-1955 | 3 |
| Väino | 1935-1955 | 3 |
| Ülo | 1935-1955 | 3 |
| Vello | 1935-1955 | 3 |
| Olev | 1935-1960 | 3 |
| Toivo | 1935-1960 | 3 |
| Aare | 1945-1965 | 3 |
| Jaak | 1945-1970 | 3 |
| Kalev | 1940-1960 | 3 |
| Heiki | 1950-1970 | 3 |
| Ain | 1950-1970 | 3 |
| Lembit | 1930-1955 | 2 |
| Uno | 1930-1955 | 2 |
| Hillar | 1935-1955 | 2 |
| Valdo | 1940-1960 | 2 |
| Endel | 1925-1950 | 2 |
| Raimond | 1930-1955 | 2 |
| Harri | 1935-1960 | 2 |
| Juhan | 1935-1955 | 2 |
| Enno | 1940-1960 | 2 |
| Arne | 1940-1960 | 2 |
| Kaljo | 1930-1955 | 2 |
| Elmar | 1925-1950 | 2 |
| Eino | 1930-1950 | 2 |
| Aleksander | 1930-1960 | 2 |
| Paul | 1930-1955 | 2 |
| Viktor | 1940-1965 | 2 |
| Vambola | 1930-1950 | 1 |

**Middle generation (born ~1955-1980, age ~46-70)**

| Name | Peak birth years | Weight |
|---|---|---|
| Andres | 1955-1980 | 5 |
| Aivar | 1955-1975 | 5 |
| Urmas | 1955-1975 | 5 |
| Margus | 1960-1980 | 5 |
| Priit | 1960-1985 | 5 |
| Indrek | 1960-1985 | 5 |
| Tarmo | 1960-1980 | 4 |
| Meelis | 1960-1980 | 4 |
| Raivo | 1955-1975 | 4 |
| Kalle | 1955-1980 | 4 |
| Jaanus | 1960-1980 | 4 |
| Marek | 1965-1985 | 4 |
| Andrus | 1960-1980 | 4 |
| Marko | 1970-1990 | 4 |
| Kristjan | 1970-2000 | 4 |
| Tanel | 1970-1995 | 4 |
| Hannes | 1960-1985 | 3 |
| Allan | 1960-1985 | 3 |
| Tõnis | 1960-1985 | 3 |
| Raul | 1960-1980 | 3 |
| Rene | 1965-1990 | 3 |
| Sulev | 1950-1970 | 3 |
| Veiko | 1965-1985 | 3 |
| Kaido | 1965-1985 | 3 |
| Alar | 1960-1980 | 3 |
| Ivar | 1955-1975 | 3 |
| Madis | 1960-1990 | 3 |
| Ahto | 1960-1980 | 3 |
| Janek | 1965-1985 | 3 |
| Lauri | 1970-1995 | 3 |
| Erik | 1960-2000 | 3 |
| Mihkel | 1965-2000 | 3 |
| Tarvo | 1960-1980 | 2 |
| Rait | 1965-1985 | 2 |
| Margo | 1965-1985 | 2 |
| Erki | 1965-1985 | 2 |
| Avo | 1950-1970 | 2 |
| Gunnar | 1960-1980 | 2 |
| Alo | 1960-1980 | 2 |
| Vahur | 1960-1980 | 2 |
| Kaupo | 1965-1985 | 2 |
| Aivo | 1955-1975 | 2 |
| Arno | 1955-1975 | 2 |
| Imre | 1960-1980 | 2 |

**Younger generation (born ~1975-2008, age 18-50)**

| Name | Peak birth years | Weight |
|---|---|---|
| Martin | 1975-2008 | 5 |
| Rasmus | 1990-2008 | 5 |
| Siim | 1975-2000 | 4 |
| Robin | 1995-2008 | 4 |
| Karl | 1990-2008 | 4 |
| Markus | 1995-2008 | 4 |
| Sander | 1985-2005 | 4 |
| Kristofer | 1995-2008 | 3 |
| Oliver | 1995-2008 | 3 |
| Kevin | 1990-2005 | 3 |
| Kristo | 1985-2000 | 3 |
| Taavi | 1980-2000 | 3 |
| Ott | 1980-2000 | 3 |
| Mikk | 1980-2005 | 3 |
| Kaspar | 1980-2005 | 3 |
| Henri | 1990-2005 | 3 |
| Joonas | 1990-2005 | 3 |
| Mattias | 1995-2008 | 3 |
| Rainer | 1970-1995 | 3 |
| Sebastian | 1995-2008 | 2 |
| Artur | 1995-2008 | 2 |
| Gregor | 1995-2008 | 2 |
| Joosep | 1995-2008 | 2 |
| Hendrik | 1985-2005 | 2 |
| Kenneth | 1990-2005 | 2 |
| Marten | 1990-2005 | 2 |
| Romet | 1995-2008 | 2 |
| Tristan | 1995-2008 | 2 |
| Ralf | 1995-2008 | 2 |
| Rauno | 1980-1995 | 2 |
| Risto | 1980-1995 | 2 |
| Silver | 1980-1995 | 2 |
| Argo | 1975-1990 | 2 |
| Janno | 1975-1995 | 2 |
| Raido | 1980-1995 | 2 |
| Kaarel | 1985-2005 | 2 |
| Kaur | 1985-2000 | 2 |
| Jakob | 2000-2008 | 2 |
| Johannes | 1995-2008 | 2 |
| Oskar | 2000-2008 | 2 |
| Patrick | 1990-2005 | 2 |
| Andreas | 1990-2005 | 2 |
| Robert | 1990-2008 | 2 |
| Karl-Erik | 1995-2008 | 1 |
| Hans-Kristjan | 1995-2008 | 1 |
| Märt | 1985-2000 | 1 |
| Kermo | 1985-2000 | 1 |
| Gert | 1985-2000 | 1 |

### 1.2 Women (Estonian): 142 names

**Older generation (born ~1935-1960)**

| Name | Peak birth years | Weight |
|---|---|---|
| Malle | 1940-1960 | 5 |
| Tiiu | 1940-1960 | 5 |
| Ene | 1940-1960 | 5 |
| Sirje | 1945-1965 | 5 |
| Ülle | 1945-1970 | 5 |
| Anne | 1945-1975 | 5 |
| Tiina | 1950-1975 | 5 |
| Eha | 1935-1955 | 4 |
| Maie | 1940-1960 | 4 |
| Reet | 1945-1965 | 4 |
| Helgi | 1930-1955 | 3 |
| Aino | 1930-1955 | 3 |
| Silvi | 1935-1955 | 3 |
| Mare | 1945-1965 | 3 |
| Laine | 1930-1955 | 3 |
| Vaike | 1930-1955 | 3 |
| Aili | 1930-1955 | 3 |
| Elvi | 1935-1955 | 3 |
| Evi | 1940-1960 | 3 |
| Heli | 1945-1965 | 3 |
| Hille | 1940-1960 | 3 |
| Maret | 1945-1965 | 3 |
| Riina | 1950-1970 | 3 |
| Siiri | 1945-1965 | 3 |
| Urve | 1940-1960 | 3 |
| Viivi | 1935-1955 | 3 |
| Virve | 1935-1955 | 3 |
| Helle | 1940-1960 | 3 |
| Lea | 1940-1960 | 3 |
| Luule | 1935-1955 | 3 |
| Kaie | 1950-1970 | 3 |
| Leida | 1925-1945 | 2 |
| Hilja | 1925-1945 | 2 |
| Linda | 1925-1945 | 2 |
| Milvi | 1930-1950 | 2 |
| Ester | 1930-1950 | 2 |
| Mall | 1940-1960 | 2 |
| Meeli | 1945-1965 | 2 |
| Eda | 1945-1965 | 2 |
| Inge | 1945-1965 | 2 |
| Aime | 1935-1955 | 2 |
| Valve | 1925-1950 | 2 |
| Imbi | 1940-1960 | 2 |
| Õie | 1935-1955 | 2 |
| Eevi | 1935-1955 | 2 |
| Marju | 1950-1970 | 2 |
| Ingrid | 1945-1970 | 2 |

**Middle generation (born ~1960-1980)**

| Name | Peak birth years | Weight |
|---|---|---|
| Piret | 1960-1980 | 5 |
| Katrin | 1970-1990 | 5 |
| Kadri | 1970-1995 | 5 |
| Kristiina | 1970-1995 | 5 |
| Anu | 1960-1980 | 4 |
| Kaja | 1960-1975 | 4 |
| Merike | 1960-1975 | 4 |
| Kersti | 1960-1980 | 4 |
| Pille | 1960-1980 | 4 |
| Margit | 1965-1985 | 4 |
| Marika | 1960-1980 | 4 |
| Kristi | 1970-1990 | 4 |
| Ave | 1965-1985 | 3 |
| Eve | 1955-1975 | 3 |
| Tiia | 1960-1980 | 3 |
| Krista | 1965-1985 | 3 |
| Maire | 1955-1975 | 3 |
| Mari | 1960-1990 | 3 |
| Signe | 1965-1985 | 3 |
| Terje | 1960-1980 | 3 |
| Karin | 1960-1980 | 3 |
| Merle | 1960-1980 | 3 |
| Kai | 1965-1985 | 3 |
| Kairi | 1975-1990 | 3 |
| Jaana | 1965-1985 | 3 |
| Evelin | 1975-1995 | 3 |
| Helen | 1980-2000 | 3 |
| Marje | 1960-1975 | 2 |
| Monika | 1965-1990 | 2 |
| Aune | 1955-1975 | 2 |
| Annely | 1965-1985 | 2 |
| Kaire | 1970-1985 | 2 |
| Janika | 1970-1990 | 2 |
| Sirli | 1970-1990 | 2 |
| Marge | 1965-1985 | 2 |
| Heidi | 1970-1990 | 2 |
| Anneli | 1970-1990 | 2 |
| Kaidi | 1975-1995 | 2 |

**Younger generation (born ~1980-2008)**

| Name | Peak birth years | Weight |
|---|---|---|
| Laura | 1985-2008 | 5 |
| Triin | 1980-1995 | 4 |
| Liis | 1980-2000 | 4 |
| Maarja | 1980-2005 | 4 |
| Mari-Liis | 1985-2005 | 4 |
| Maria | 1985-2008 | 4 |
| Anna | 1995-2008 | 4 |
| Kerli | 1985-2000 | 3 |
| Annika | 1980-2000 | 3 |
| Merilin | 1990-2005 | 3 |
| Kristel | 1980-2000 | 3 |
| Kristina | 1980-2000 | 3 |
| Getter | 1990-2005 | 3 |
| Grete | 1990-2005 | 3 |
| Hanna | 1990-2008 | 3 |
| Helena | 1990-2008 | 3 |
| Sandra | 1990-2005 | 3 |
| Liisa | 1985-2005 | 3 |
| Karoliina | 1990-2005 | 3 |
| Kätlin | 1990-2005 | 3 |
| Kertu | 1990-2005 | 3 |
| Eliise | 2000-2008 | 3 |
| Elisabeth | 1995-2008 | 3 |
| Sofia | 2000-2008 | 3 |
| Kati | 1980-1995 | 2 |
| Jaanika | 1980-1995 | 2 |
| Marit | 1980-1995 | 2 |
| Kärt | 1985-2000 | 2 |
| Kaisa | 1985-2000 | 2 |
| Sigrid | 1985-2005 | 2 |
| Liina | 1980-1995 | 2 |
| Elina | 1985-2005 | 2 |
| Karmen | 1985-2000 | 2 |
| Tuuli | 1980-1995 | 2 |
| Gretel | 1995-2008 | 2 |
| Johanna | 1995-2008 | 2 |
| Emma | 2003-2008 | 2 |
| Mia | 2004-2008 | 2 |
| Lisandra | 2000-2008 | 2 |
| Liisi | 1990-2005 | 2 |
| Marleen | 1995-2008 | 2 |
| Kirke | 1995-2008 | 2 |
| Triinu | 1990-2005 | 2 |
| Viktoria | 1995-2008 | 2 |
| Kristin | 1990-2005 | 2 |
| Ketlin | 1990-2005 | 2 |
| Lisette | 1995-2008 | 2 |
| Teele | 1990-2005 | 2 |
| Anette | 1995-2008 | 2 |
| Kadi | 1985-2000 | 2 |
| Kaia | 1985-2000 | 2 |
| Reelika | 1978-1990 | 2 |
| Elis | 1995-2008 | 2 |
| Pille-Riin | 1990-2005 | 1 |
| Anna-Liisa | 1990-2005 | 1 |
| Keiti | 1995-2008 | 1 |
| Brigitta | 1995-2008 | 1 |

Note: *Mia*, *Emma* and *Sofia* peak among children born in the 2010s. They are common among
under-20s but rare in adults. Weight them low for an 18-80 population [LIKELY].

---

## 2. Estonian surnames

Estonian surnames are **not gendered**: the husband, wife and children are all *Tamm* [LIKELY].
Married women usually take the husband's surname. Hyphenated double surnames (*Tamm-Saar*) occur
but are uncommon [LIKELY].

Most surnames come from the 1820s-1830s peasant naming. They fall into a few groups:

- **Nature**: Tamm (oak), Kask (birch), Kuusk (spruce), Mänd (pine), Pärn (linden), Saar
  (island, or ash tree), Lepp (alder).
- **Landscape**: Mägi (hill), Oja (brook), Jõgi (river), Kivi (stone), Org (valley), Soo
  (bog), Nõmm (heath), Väli (field), Rand (beach), Allik (spring).
- **Trades**: Sepp (smith), Raudsepp (blacksmith), Rätsep (tailor), Mölder (miller), Kangur
  (weaver), Puusepp (carpenter), Kütt (hunter).
- **Animals**: Rebane (fox), Ilves (lynx), Karu (bear), Kukk (rooster), Põder (moose), Hunt
  (wolf), Orav (squirrel), Kotkas (eagle), Luik (swan), Kurg (crane), Vares (crow), Kull (hawk).
- **Patronymic "-son"**: Peterson, Jürgenson, Tõnisson, Jakobson, Martinson, Mihkelson.

[LIKELY]

### 2.1 Most common Estonian surnames: 110, roughly ordered

The top ~15 are well established: **Tamm, Saar, Sepp, Mägi, Kask, Kukk, Rebane, Ilves, Pärn,
Koppel** [LIKELY]. In whole-population lists, Russian names (Ivanov, Smirnov, Vassiljev, Petrov,
Mihhailov) rank in the top 15 too. The order after rank ~20 is [UNSURE]; use the weights.

| # | Surname | Weight |
|---|---|---|
| 1 | Tamm | 10 |
| 2 | Saar | 9 |
| 3 | Sepp | 7 |
| 4 | Mägi | 7 |
| 5 | Kask | 6 |
| 6 | Kukk | 6 |
| 7 | Rebane | 6 |
| 8 | Ilves | 5 |
| 9 | Pärn | 5 |
| 10 | Koppel | 5 |
| 11 | Lepik | 4 |
| 12 | Kuusk | 4 |
| 13 | Raudsepp | 4 |
| 14 | Vaher | 4 |
| 15 | Oja | 4 |
| 16 | Kõiv | 4 |
| 17 | Lepp | 4 |
| 18 | Luik | 4 |
| 19 | Kivi | 4 |
| 20 | Karu | 4 |
| 21 | Põder | 3 |
| 22 | Kallas | 3 |
| 23 | Teder | 3 |
| 24 | Lõhmus | 3 |
| 25 | Kangur | 3 |
| 26 | Laur | 3 |
| 27 | Mets | 3 |
| 28 | Ots | 3 |
| 29 | Kuusik | 3 |
| 30 | Mänd | 3 |
| 31 | Jõgi | 3 |
| 32 | Kütt | 3 |
| 33 | Pihlak | 3 |
| 34 | Kruus | 3 |
| 35 | Kaasik | 3 |
| 36 | Hein | 3 |
| 37 | Org | 3 |
| 38 | Toom | 3 |
| 39 | Laas | 3 |
| 40 | Mölder | 3 |
| 41 | Mikk | 2 |
| 42 | Paju | 2 |
| 43 | Liiv | 2 |
| 44 | Kalda | 2 |
| 45 | Uibo | 2 |
| 46 | Väli | 2 |
| 47 | Kiik | 2 |
| 48 | Aas | 2 |
| 49 | Allik | 2 |
| 50 | Rand | 2 |
| 51 | Nõmm | 2 |
| 52 | Kurg | 2 |
| 53 | Sild | 2 |
| 54 | Lill | 2 |
| 55 | Kull | 2 |
| 56 | Põld | 2 |
| 57 | Paas | 2 |
| 58 | Raud | 2 |
| 59 | Roos | 2 |
| 60 | Rätsep | 2 |
| 61 | Tooming | 2 |
| 62 | Nurm | 2 |
| 63 | Pukk | 2 |
| 64 | Hunt | 2 |
| 65 | Kuld | 2 |
| 66 | Tamme | 2 |
| 67 | Unt | 2 |
| 68 | Valk | 2 |
| 69 | Vares | 2 |
| 70 | Sarv | 2 |
| 71 | Leppik | 2 |
| 72 | Saks | 2 |
| 73 | Puusepp | 2 |
| 74 | Orav | 2 |
| 75 | Aavik | 2 |
| 76 | Annus | 2 |
| 77 | Eller | 1 |
| 78 | Jürgenson | 1 |
| 79 | Kolk | 1 |
| 80 | Kotkas | 1 |
| 81 | Lind | 1 |
| 82 | Martinson | 1 |
| 83 | Meri | 1 |
| 84 | Mõttus | 1 |
| 85 | Nurk | 1 |
| 86 | Parts | 1 |
| 87 | Peterson | 1 |
| 88 | Pihl | 1 |
| 89 | Sikk | 1 |
| 90 | Soo | 1 |
| 91 | Suits | 1 |
| 92 | Talts | 1 |
| 93 | Tuisk | 1 |
| 94 | Uustalu | 1 |
| 95 | Vahter | 1 |
| 96 | Vaht | 1 |
| 97 | Vill | 1 |
| 98 | Õunapuu | 1 |
| 99 | Kirs | 1 |
| 100 | Kalm | 1 |
| 101 | Kont | 1 |
| 102 | Veski | 1 |
| 103 | Tõnisson | 1 |
| 104 | Jakobson | 1 |
| 105 | Sarapuu | 1 |
| 106 | Kivisild | 1 |
| 107 | Ojamaa | 1 |
| 108 | Tammemägi | 1 |
| 109 | Lillemets | 1 |
| 110 | Põldma | 1 |

### 2.2 Compound surname generator [DESIGN]

Many real Estonian surnames are two-part compounds. Generating them gives unlimited plausible
variety. Collisions with real surnames are fine, because they are generic words.

- **First parts** (genitive stem): Tamme-, Kase-, Kuuse-, Männi-, Lepa-, Pärna-, Lille-, Kivi-,
  Mäe-, Oja-, Saare-, Põllu-, Metsa-, Järve-, Raua-, Kalju-, Sau-, Rande-, Vahtra-, Linnu-
- **Second parts**: -mets, -mägi, -saar, -oja, -maa, -pere, -salu, -soo, -väli, -nurm, -puu,
  -kivi, -aru, -küla, -org, -lo, -ste, -põld
- **Examples**: Kasemets, Tammemägi, Kivisaar, Ojamaa, Lepasalu, Saarepuu, Kuusemets, Mäeorg,
  Lillesaar, Metsaküla, Järvesoo, Põlluste, Kivimägi, Vahtramäe.
- Use the compound generator for at most ~25% of Estonian surnames. Draw the rest from the
  table above.

---

## 3. Russian-speaking residents (Estonian transliteration)

### 3.1 Two spellings exist: important for documents [LIKELY]

The population register spells a name from the person's identity document. So the same Russian
name appears differently depending on citizenship:

| Holder | Spelling system | Example |
|---|---|---|
| **Estonian citizen** (and most grey-passport holders with Estonian-issued documents) | **Estonian transliteration** | Mihhail Kuznetsov, Tatjana Vassiljeva, Jevgeni Semjonov, Julia Fjodorova |
| **Russian Federation citizen** (Russian passport, ICAO-style since ~2013) | **ICAO / English-style** | Mikhail Kuznetsov, Tatiana Vasileva, Evgenii Semenov, Iuliia Fedorova |
| Older Russian passports and mixed cases | Older Russian-passport style | Sergey, Yuriy, Natalya, Tatyana |

[DESIGN] Have the database store one canonical Estonian spelling. Add a `docSpelling` variant
for Russian citizens. Make name search diacritic- and variant-tolerant (Jelena/Elena/Yelena), so
the player hits the realistic snag of variant spellings.

### 3.2 Estonian transliteration rules (Russian → Estonian) [LIKELY]

| Cyrillic | Estonian | Example |
|---|---|---|
| х | h; **hh** between vowels | Mihhail, Mihhailov, Zahharov, Tihhonov |
| ш | š | Šarov, Šapovalov |
| ж | ž | Žukov, Nadežda |
| ч | tš | Tšernov, Vjatšeslav |
| щ | štš | Hruštšov |
| ц | ts | Kuznetsov, Zaitsev |
| с | s; **ss** between vowels and at word end after a vowel | Vassili, Larissa, Anastassia, Borissov, Boriss, Deniss |
| е | e; **je** at word start, after a vowel, or after ь/ъ | Jelena, Jevgeni, Aleksejev, Nikolajev |
| ё | **jo** (after most consonants, at word start, after a vowel or ь); **o** after ж, ч, ш, щ | Semjonov, Fjodorov, Solovjov, Kisseljov, Artjom, Pjotr; Hruštšov |
| ю / я | ju / ja | Ljudmila, Juri, Tatjana, Jakovlev |
| й | i (final -ей → -ei, -ий → -i) | Sergei, Andrei, Dmitri, Jevgeni, Vitali, Zaitsev |
| ы | **õ** | Krõlov, Bõstrov, Rõbakov, Võssotski |
| ь | dropped, or j before a vowel | Igor, Natalja, Iljin, Vassiljev |
| -ия | -ia | Maria, Julia, Lidia, Anastassia, Viktoria |
| -ский / -ская | -ski / -skaja | Kovalevski / Kovalevskaja |

The **ы → õ** rule (Krõlov, Bõstrov) looks very Estonian. It is good flavour that the
English-style spellings lack.

### 3.3 First names

Columns: Estonian form (use in game), Cyrillic, Russian-passport (ICAO) form, peak birth years,
weight.

**Men (50)**

| Estonian form | Cyrillic | ICAO passport | Peak born | W |
|---|---|---|---|---|
| Aleksandr | Александр | Aleksandr | 1940-2008 | 5 |
| Sergei | Сергей | Sergei | 1955-1990 | 5 |
| Andrei | Андрей | Andrei | 1960-1995 | 5 |
| Dmitri | Дмитрий | Dmitrii | 1970-2005 | 5 |
| Vladimir | Владимир | Vladimir | 1940-1975 | 5 |
| Aleksei | Алексей | Aleksei | 1965-2000 | 4 |
| Jevgeni | Евгений | Evgenii | 1955-1990 | 4 |
| Igor | Игорь | Igor | 1955-1985 | 4 |
| Juri | Юрий | Iurii | 1940-1970 | 4 |
| Nikolai | Николай | Nikolai | 1935-1965 | 4 |
| Viktor | Виктор | Viktor | 1940-1970 | 4 |
| Oleg | Олег | Oleg | 1960-1985 | 4 |
| Mihhail | Михаил | Mikhail | 1940-1970; 1995-2008 | 4 |
| Maksim | Максим | Maksim | 1980-2008 | 4 |
| Artjom | Артём | Artem | 1985-2008 | 4 |
| Vitali | Виталий | Vitalii | 1965-1990 | 3 |
| Anatoli | Анатолий | Anatolii | 1935-1960 | 3 |
| Valeri | Валерий | Valerii | 1945-1970 | 3 |
| Gennadi | Геннадий | Gennadii | 1940-1965 | 3 |
| Vadim | Вадим | Vadim | 1965-1990 | 3 |
| Konstantin | Константин | Konstantin | 1970-1995 | 3 |
| Roman | Роман | Roman | 1975-2000 | 3 |
| Deniss | Денис | Denis | 1978-2000 | 3 |
| Ilja | Илья | Ilia | 1985-2008 | 3 |
| Kirill | Кирилл | Kirill | 1985-2008 | 3 |
| Nikita | Никита | Nikita | 1990-2008 | 3 |
| Daniil | Даниил | Daniil | 1995-2008 | 3 |
| Jegor | Егор | Egor | 1995-2008 | 3 |
| Pavel | Павел | Pavel | 1960-1995 | 3 |
| Anton | Антон | Anton | 1975-2000 | 3 |
| Vladislav | Владислав | Vladislav | 1985-2005 | 3 |
| Vjatšeslav | Вячеслав | Viacheslav | 1955-1985 | 3 |
| Ivan | Иван | Ivan | 1930-1960; 1995-2008 | 3 |
| Ruslan | Руслан | Ruslan | 1975-1995 | 2 |
| Boriss | Борис | Boris | 1935-1960 | 2 |
| Leonid | Леонид | Leonid | 1935-1960 | 2 |
| Vassili | Василий | Vasilii | 1935-1960 | 2 |
| Stanislav | Станислав | Stanislav | 1965-1990 | 2 |
| Eduard | Эдуард | Eduard | 1955-1980 | 2 |
| Valentin | Валентин | Valentin | 1935-1960 | 2 |
| Timur | Тимур | Timur | 1980-2005 | 2 |
| Artur | Артур | Artur | 1980-2005 | 2 |
| Jaroslav | Ярослав | Iaroslav | 1985-2005 | 2 |
| Matvei | Матвей | Matvei | 2002-2008 | 2 |
| Mark | Марк | Mark | 2000-2008 | 2 |
| Grigori | Григорий | Grigorii | 1930-1955 | 1 |
| Pjotr | Пётр | Petr | 1930-1955 | 1 |
| Fjodor | Фёдор | Fedor | 1930-1955 | 1 |
| Arkadi | Аркадий | Arkadii | 1935-1960 | 1 |
| Semjon | Семён | Semen | 1930-1955 | 1 |

**Women (50)**

| Estonian form | Cyrillic | ICAO passport | Peak born | W |
|---|---|---|---|---|
| Jelena | Елена | Elena | 1955-1985 | 5 |
| Tatjana | Татьяна | Tatiana | 1945-1980 | 5 |
| Olga | Ольга | Olga | 1950-1985 | 5 |
| Natalja | Наталья | Natalia | 1955-1985 | 5 |
| Svetlana | Светлана | Svetlana | 1950-1980 | 5 |
| Irina | Ирина | Irina | 1955-1985 | 5 |
| Ljudmila | Людмила | Liudmila | 1940-1965 | 4 |
| Galina | Галина | Galina | 1935-1960 | 4 |
| Valentina | Валентина | Valentina | 1930-1960 | 4 |
| Marina | Марина | Marina | 1960-1985 | 4 |
| Anna | Анна | Anna | 1985-2008 (+older) | 4 |
| Julia | Юлия | Iuliia | 1980-2000 | 4 |
| Jekaterina | Екатерина | Ekaterina | 1985-2005 | 4 |
| Anastassia | Анастасия | Anastasiia | 1985-2008 | 4 |
| Larissa | Лариса | Larisa | 1950-1975 | 3 |
| Nadežda | Надежда | Nadezhda | 1935-1965 | 3 |
| Oksana | Оксана | Oksana | 1970-1990 | 3 |
| Ljubov | Любовь | Liubov | 1930-1960 | 3 |
| Tamara | Тамара | Tamara | 1930-1960 | 3 |
| Nina | Нина | Nina | 1930-1960 | 3 |
| Aleksandra | Александра | Aleksandra | 1985-2008 | 3 |
| Viktoria | Виктория | Viktoriia | 1985-2008 | 3 |
| Kristina | Кристина | Kristina | 1985-2005 | 3 |
| Darja | Дарья | Daria | 1990-2008 | 3 |
| Alina | Алина | Alina | 1990-2008 | 3 |
| Maria | Мария | Mariia | 1990-2008 | 3 |
| Vera | Вера | Vera | 1930-1960 | 2 |
| Zoja | Зоя | Zoia | 1925-1955 | 2 |
| Lidia | Лидия | Lidiia | 1930-1960 | 2 |
| Raissa | Раиса | Raisa | 1930-1960 | 2 |
| Antonina | Антонина | Antonina | 1925-1955 | 2 |
| Polina | Полина | Polina | 1995-2008 | 2 |
| Anžela | Анжела | Anzhela | 1970-1990 | 2 |
| Inna | Инна | Inna | 1960-1985 | 2 |
| Alla | Алла | Alla | 1950-1975 | 2 |
| Jevgenia | Евгения | Evgeniia | 1970-1995 | 2 |
| Margarita | Маргарита | Margarita | 1960-1990 | 2 |
| Veronika | Вероника | Veronika | 1975-2000 | 2 |
| Ksenia | Ксения | Kseniia | 1985-2005 | 2 |
| Valeria | Валерия | Valeriia | 1995-2008 | 2 |
| Diana | Диана | Diana | 1985-2005 | 2 |
| Jana | Яна | Iana | 1975-1995 | 2 |
| Jelizaveta | Елизавета | Elizaveta | 2000-2008 | 2 |
| Sofia | София | Sofiia | 2000-2008 | 2 |
| Alisa | Алиса | Alisa | 2000-2008 | 2 |
| Karina | Карина | Karina | 1990-2005 | 2 |
| Elvira | Эльвира | Elvira | 1950-1975 | 1 |
| Zinaida | Зинаида | Zinaida | 1925-1950 | 1 |
| Uljana | Ульяна | Uliana | 2000-2008 | 1 |
| Milana | Милана | Milana | 2004-2008 | 1 |

**Patronymics** (isanimi, e.g. *Sergei Ivanovitš*, *Tatjana Petrovna*) are used in Russian
speech, especially when addressing older people. They are **not** recorded on Estonian ID cards
or in the population register. [LIKELY] [DESIGN] Use them in call dialogue ("Tatjana Petrovna,
vanus 74"), not in database records. The Estonian spelling is -ovitš / -evitš for men and
-ovna / -evna for women.

### 3.4 Surnames (80) with female forms

Female-form rules: **-ov → -ova**, **-ev → -eva**, **-jov → -jova**, **-in → -ina**,
**-ski → -skaja**. Ukrainian-type **-enko, -uk, -ik** and nouns like *Moroz* do **not** change.
The register stores the female form as the surname: a woman is *Ivanova*, never *Ivanov*. [LIKELY]

Roughly ordered by frequency in Estonia. The top ~10 are [LIKELY]; the rest are [UNSURE] in
order.

| # | Male | Female | Cyrillic (m) | W |
|---|---|---|---|---|
| 1 | Ivanov | Ivanova | Иванов | 10 |
| 2 | Smirnov | Smirnova | Смирнов | 8 |
| 3 | Vassiljev | Vassiljeva | Васильев | 8 |
| 4 | Petrov | Petrova | Петров | 7 |
| 5 | Mihhailov | Mihhailova | Михайлов | 6 |
| 6 | Kuznetsov | Kuznetsova | Кузнецов | 6 |
| 7 | Pavlov | Pavlova | Павлов | 5 |
| 8 | Fjodorov | Fjodorova | Фёдоров | 5 |
| 9 | Semjonov | Semjonova | Семёнов | 5 |
| 10 | Jakovlev | Jakovleva | Яковлев | 5 |
| 11 | Aleksejev | Aleksejeva | Алексеев | 5 |
| 12 | Nikolajev | Nikolajeva | Николаев | 5 |
| 13 | Stepanov | Stepanova | Степанов | 4 |
| 14 | Sokolov | Sokolova | Соколов | 4 |
| 15 | Popov | Popova | Попов | 4 |
| 16 | Volkov | Volkova | Волков | 4 |
| 17 | Morozov | Morozova | Морозов | 4 |
| 18 | Lebedev | Lebedeva | Лебедев | 4 |
| 19 | Kozlov | Kozlova | Козлов | 4 |
| 20 | Novikov | Novikova | Новиков | 4 |
| 21 | Jegorov | Jegorova | Егоров | 4 |
| 22 | Orlov | Orlova | Орлов | 3 |
| 23 | Andrejev | Andrejeva | Андреев | 4 |
| 24 | Makarov | Makarova | Макаров | 3 |
| 25 | Nikitin | Nikitina | Никитин | 3 |
| 26 | Zahharov | Zahharova | Захаров | 3 |
| 27 | Zaitsev | Zaitseva | Зайцев | 3 |
| 28 | Solovjov | Solovjova | Соловьёв | 3 |
| 29 | Borissov | Borissova | Борисов | 3 |
| 30 | Romanov | Romanova | Романов | 3 |
| 31 | Vorobjov | Vorobjova | Воробьёв | 3 |
| 32 | Frolov | Frolova | Фролов | 3 |
| 33 | Gusev | Guseva | Гусев | 3 |
| 34 | Kisseljov | Kisseljova | Киселёв | 3 |
| 35 | Iljin | Iljina | Ильин | 3 |
| 36 | Grigorjev | Grigorjeva | Григорьев | 3 |
| 37 | Sergejev | Sergejeva | Сергеев | 3 |
| 38 | Tarassov | Tarassova | Тарасов | 3 |
| 39 | Belov | Belova | Белов | 3 |
| 40 | Komarov | Komarova | Комаров | 3 |
| 41 | Kovaljov | Kovaljova | Ковалёв | 3 |
| 42 | Medvedev | Medvedeva | Медведев | 3 |
| 43 | Antonov | Antonova | Антонов | 3 |
| 44 | Tihhomirov | Tihhomirova | Тихомиров | 2 |
| 45 | Tšernov | Tšernova | Чернов | 2 |
| 46 | Baranov | Baranova | Баранов | 2 |
| 47 | Filippov | Filippova | Филиппов | 2 |
| 48 | Gavrilov | Gavrilova | Гаврилов | 2 |
| 49 | Maksimov | Maksimova | Максимов | 2 |
| 50 | Danilov | Danilova | Данилов | 2 |
| 51 | Matvejev | Matvejeva | Матвеев | 2 |
| 52 | Karpov | Karpova | Карпов | 2 |
| 53 | Afanasjev | Afanasjeva | Афанасьев | 2 |
| 54 | Bogdanov | Bogdanova | Богданов | 2 |
| 55 | Kuzmin | Kuzmina | Кузьмин | 2 |
| 56 | Sidorov | Sidorova | Сидоров | 2 |
| 57 | Dmitrijev | Dmitrijeva | Дмитриев | 2 |
| 58 | Tihhonov | Tihhonova | Тихонов | 2 |
| 59 | Žukov | Žukova | Жуков | 2 |
| 60 | Krõlov | Krõlova | Крылов | 2 |
| 61 | Bõstrov | Bõstrova | Быстров | 2 |
| 62 | Rõbakov | Rõbakova | Рыбаков | 1 |
| 63 | Vinogradov | Vinogradova | Виноградов | 1 |
| 64 | Ossipov | Ossipova | Осипов | 2 |
| 65 | Titov | Titova | Титов | 1 |
| 66 | Jefimov | Jefimova | Ефимов | 1 |
| 67 | Timofejev | Timofejeva | Тимофеев | 1 |
| 68 | Gerassimov | Gerassimova | Герасимов | 1 |
| 69 | Prohhorov | Prohhorova | Прохоров | 1 |
| 70 | Kalinin | Kalinina | Калинин | 1 |
| 71 | Vlassov | Vlassova | Власов | 1 |
| 72 | Kotov | Kotova | Котов | 1 |
| 73 | Žuravljov | Žuravljova | Журавлёв | 1 |
| 74 | Abramov | Abramova | Абрамов | 1 |
| 75 | Kovalevski | Kovalevskaja | Ковалевский | 1 |
| 76 | Kovalenko | Kovalenko | Коваленко | 2 |
| 77 | Bondarenko | Bondarenko | Бондаренко | 2 |
| 78 | Tkatšenko | Tkatšenko | Ткаченко | 1 |
| 79 | Melnik | Melnik | Мельник | 1 |
| 80 | Moroz | Moroz | Мороз | 1 |

The last five are Ukrainian or Belarusian-origin names carried by Soviet-era migrants. Most of
these people are now Russian-speaking long-term residents, *not* recent refugees [LIKELY].

**Peipsi coast Old Believers** (vanausulised; Mustvee, Kallaste, Kolkja, Varnja, Piirissaar)
are a distinct, centuries-old Russian community [LIKELY]. Flavour surnames for them include
Kuznetsov, Bõstrov, Rõbakov, Ossipov, Jefimov, Sidorov and Antonov [UNSURE as specific to them].

---

## 4. Ukrainians (war refugees since 2022)

### 4.1 Spelling [LIKELY]

- Refugees' documents are **Ukrainian passports**. These use the official Ukrainian
  romanisation (the 2010 national system): Oleksandr, Mykola, Serhii, Tetiana, Yuliia. The
  Estonian register and residence-permit cards use these passport spellings. **Use the passport
  form in game documents and database records.**
- Estonian **media** use their own transliteration of Ukrainian, with **и → õ**, **г/х → h**
  and **ч → tš**. Examples: Volodõmõr Zelenskõi, Dmõtro Kuleba, Oleksandr Sõrskõi, Denõs
  Šmõhal. Use this form in Estonian-language dialogue and news flavour text.
- Ukrainian patronymics exist (-ovych / -ivna), but they are not in Estonian records.
- Refugees mostly hold **ajutine kaitse** (temporary protection) residence permits [LIKELY].

### 4.2 First names

**Men (30)**

| Passport form | Estonian press form | Cyrillic |
|---|---|---|
| Oleksandr | Oleksandr | Олександр |
| Mykola | Mõkola | Микола |
| Volodymyr | Volodõmõr | Володимир |
| Andrii | Andri | Андрій |
| Serhii | Serhi | Сергій |
| Dmytro | Dmõtro | Дмитро |
| Oleh | Oleh | Олег |
| Ivan | Ivan | Іван |
| Vasyl | Vassõl | Василь |
| Yurii | Juri | Юрій |
| Bohdan | Bohdan | Богдан |
| Taras | Taras | Тарас |
| Vitalii | Vitali | Віталій |
| Oleksii | Oleksi | Олексій |
| Maksym | Maksõm | Максим |
| Denys | Denõs | Денис |
| Artem | Artem | Артем |
| Vladyslav | Vladõslav | Владислав |
| Ihor | Ihor | Ігор |
| Viktor | Viktor | Віктор |
| Pavlo | Pavlo | Павло |
| Mykhailo | Mõhhailo | Михайло |
| Yaroslav | Jaroslav | Ярослав |
| Roman | Roman | Роман |
| Nazar | Nazar | Назар |
| Danylo | Danõlo | Данило |
| Yevhen | Jevhen | Євген |
| Ruslan | Ruslan | Руслан |
| Anatolii | Anatoli | Анатолій |
| Vadym | Vadõm | Вадим |

[DESIGN] Most adult male refugees are older men (over ~60, outside mobilisation age) or men with
exemptions. Female refugees and children far outnumber men [LIKELY].

**Women (30)**

| Passport form | Estonian press form | Cyrillic |
|---|---|---|
| Olena | Olena | Олена |
| Kateryna | Katerõna | Катерина |
| Iryna | Irõna | Ірина |
| Oksana | Oksana | Оксана |
| Tetiana | Tetjana | Тетяна |
| Nataliia | Natalija | Наталія |
| Yuliia | Julija | Юлія |
| Svitlana | Svitlana | Світлана |
| Anastasiia | Anastassija | Анастасія |
| Olha | Olha | Ольга |
| Mariia | Marija | Марія |
| Viktoriia | Viktorija | Вікторія |
| Alina | Alina | Аліна |
| Liudmyla | Ljudmõla | Людмила |
| Halyna | Halõna | Галина |
| Nadiia | Nadija | Надія |
| Valentyna | Valentõna | Валентина |
| Larysa | Larõssa | Лариса |
| Hanna | Hanna | Ганна |
| Daryna | Darõna | Дарина |
| Sofiia | Sofija | Софія |
| Yana | Jana | Яна |
| Inna | Inna | Інна |
| Khrystyna | Hrõstõna | Христина |
| Diana | Diana | Діана |
| Polina | Polina | Поліна |
| Liliia | Lilija | Лілія |
| Valeriia | Valerija | Валерія |
| Vira | Vira | Віра |
| Mariana | Marjana | Мар'яна |

The press-form column is [UNSURE] in small details (single vs double s, -ija vs -ia). The
passport column is [LIKELY].

### 4.3 Surnames (40)

Female forms: **-enko, -uk/-chuk, -yk, -ets** and noun surnames (Moroz, Kozak, Mazur, Bondar)
stay unchanged. Adjectival **-skyi → -ska** and **-yi/-ii → -a**. Russian-type **-ov/-in → -ova/-ina**.
[LIKELY]

The top of the Ukraine-wide list (Melnyk, Shevchenko, Kovalenko, Bondarenko, Boiko, Tkachenko,
Kravchenko, Kovalchuk, Koval, Oliinyk) is [LIKELY].

| Passport form | Estonian press form | Female |
|---|---|---|
| Melnyk | Melnõk | Melnyk |
| Shevchenko | Ševtšenko | Shevchenko |
| Kovalenko | Kovalenko | Kovalenko |
| Bondarenko | Bondarenko | Bondarenko |
| Boiko | Boiko | Boiko |
| Tkachenko | Tkatšenko | Tkachenko |
| Kravchenko | Kravtšenko | Kravchenko |
| Kovalchuk | Kovaltšuk | Kovalchuk |
| Koval | Koval | Koval |
| Oliinyk | Oliinõk | Oliinyk |
| Shevchuk | Ševtšuk | Shevchuk |
| Polishchuk | Polištšuk | Polishchuk |
| Lysenko | Lõssenko | Lysenko |
| Rudenko | Rudenko | Rudenko |
| Savchenko | Savtšenko | Savchenko |
| Petrenko | Petrenko | Petrenko |
| Marchenko | Martšenko | Marchenko |
| Moroz | Moroz | Moroz |
| Tkachuk | Tkatšuk | Tkachuk |
| Kravets | Kravets | Kravets |
| Pavlenko | Pavlenko | Pavlenko |
| Kuzmenko | Kuzmenko | Kuzmenko |
| Levchenko | Levtšenko | Levchenko |
| Kharchenko | Hartšenko | Kharchenko |
| Ponomarenko | Ponomarenko | Ponomarenko |
| Klymenko | Klõmenko | Klymenko |
| Vasylenko | Vassõlenko | Vasylenko |
| Karpenko | Karpenko | Karpenko |
| Melnychuk | Melnõtšuk | Melnychuk |
| Savchuk | Savtšuk | Savchuk |
| Romanenko | Romanenko | Romanenko |
| Zinchenko | Zintšenko | Zinchenko |
| Bondar | Bondar | Bondar |
| Kozak | Kozak | Kozak |
| Mazur | Mazur | Mazur |
| Kushnir | Kušnir | Kushnir |
| Lytvynenko | Lõtvõnenko | Lytvynenko |
| Prykhodko | Prõhodko | Prykhodko |
| Kovalskyi | Kovalskõi | Kovalska |
| Hrytsenko | Hrõtsenko | Hrytsenko |

### 4.4 Refugee numbers (approx.)

- Since February 2022, well over 100,000 Ukrainian war refugees have entered or passed through
  Estonia [LIKELY]. Roughly **35,000-45,000** held temporary protection at any time in
  2023-2025 [UNSURE exact].
- Including pre-war residents (~25,000-30,000 ethnic Ukrainians in the 2021 census), people of
  Ukrainian origin are now ~4-5% of the population [UNSURE].
- They are concentrated in **Tallinn and Harjumaa**, then Tartu, Pärnu and Ida-Virumaa. In
  2022-23, Narva-Jõesuu spa hotels housed many refugees [LIKELY].
- Most speak Russian as well as Ukrainian. Many Ukrainian refugees in Estonia use Russian in
  daily life. Many younger ones also speak English [LIKELY].

---

## 5. Russian-speakers and ethnic Russians by area

### 5.1 National picture [LIKELY, approx.]

| Metric | Value |
|---|---|
| Population, Census 2021 (31.12.2021) | **1,331,824** [LIKELY] |
| Population, 1 Jan 2025 | **~1.37 million**; growth since 2022 is mostly Ukrainian refugees [LIKELY] |
| Ethnic Estonians (2021) | ~69% |
| Ethnic Russians (2021) | ~23-24% (~315,000) |
| Ukrainians (2021; before most refugees were counted) | ~2% |
| Belarusians | ~0.8% |
| Finns | ~0.6% |
| Russian as mother tongue | ~28% (~380,000) |
| Estonian as mother tongue | ~67% |

"Russian-speaking" means more than ethnic Russians. It includes most Ukrainians, Belarusians,
Tatars, Armenians and others who came in the Soviet era.

### 5.2 By county (maakond)

Shares are approximate, from Census 2021 and earlier patterns. "Ru-speaking" means Russian as
mother tongue.

| County | Estonians | Ethnic Russians | Ru-speaking | Conf. |
|---|---|---|---|---|
| **Ida-Viru** | ~20% | **~70%** | ~78-80% | [LIKELY] |
| **Harju** (incl. Tallinn) | ~62% | ~29% | ~33% | [LIKELY] |
| Harju without Tallinn | ~78% | ~16% | ~18% | [UNSURE] |
| Valga | ~82% | ~13% | ~15% | [UNSURE] |
| Tartu (county) | ~85% | ~10% | ~12% | [UNSURE] |
| Lääne-Viru | ~87% | ~9% | ~10% | [UNSURE] |
| Jõgeva | ~88% | ~9% | ~10% | [UNSURE] |
| Lääne (Läänemaa) | ~88% | ~8% | ~9% | [UNSURE] |
| Pärnu | ~91% | ~6% | ~7% | [UNSURE] |
| Järva | ~93% | ~4% | ~5% | [UNSURE] |
| Põlva | ~93% | ~4% | ~5% | [UNSURE] |
| Võru | ~94% | ~3% | ~4% | [UNSURE] |
| Rapla | ~94% | ~3% | ~4% | [UNSURE] |
| Viljandi | ~95% | ~3% | ~3% | [UNSURE] |
| Saare | ~97% | ~1-2% | ~2% | [LIKELY] |
| Hiiu | ~97% | ~1-2% | ~2% | [LIKELY] |

### 5.3 Cities, towns and Tallinn districts

| Place | Estonians | Ethnic Russians | Ru-speaking | Conf. |
|---|---|---|---|---|
| **Narva** | ~4-5% | ~82-87% | **~94-96%** | [LIKELY] |
| **Sillamäe** | ~4-6% | ~83-87% | ~94% | [LIKELY] |
| **Kohtla-Järve** | ~18-20% | ~70-74% | ~80% | [LIKELY] |
| **Maardu** | ~18-22% | ~65-70% | ~78% | [LIKELY] |
| Narva-Jõesuu (vald) | ~15-20% | ~70-75% | ~80% | [UNSURE] |
| **Jõhvi** (town) | ~33-38% | ~52-57% | ~60% | [LIKELY] |
| Kiviõli | ~45% | ~45% | ~50% | [UNSURE] |
| Paldiski | ~25-30% | ~55-60% | ~65% | [UNSURE] |
| Loksa | ~50% | ~40% | ~45% | [UNSURE] |
| Kallaste (Old Believers) | ~25% | ~70% | ~72% | [UNSURE] |
| Mustvee (town) | ~50% | ~45% | ~47% | [UNSURE] |
| Valga (town) | ~62% | ~30% | ~33% | [UNSURE] |
| Tapa (town) | ~65% | ~30% | ~32% | [UNSURE] |
| Kunda | ~65% | ~28% | ~30% | [UNSURE] |
| Keila | ~80% | ~15% | ~16% | [UNSURE] |
| **Tallinn** | ~55% | ~33-36% | ~38-41% | [LIKELY] |
| **Tartu** | ~80% | ~13-15% | ~16% | [LIKELY] |
| **Pärnu** (city) | ~85% | ~10% | ~11% | [LIKELY] |
| Haapsalu | ~85% | ~10% | ~11% | [UNSURE] |
| Rakvere | ~88% | ~8% | ~9% | [UNSURE] |
| Viljandi | ~95% | ~3% | ~3% | [LIKELY] |
| Kuressaare | ~97% | ~1-2% | ~2% | [LIKELY] |

**Tallinn districts (linnaosad)**:

| District | Estonians | Russian-speaking | Conf. |
|---|---|---|---|
| **Lasnamäe** (largest district, ~120,000 people) | ~30% | **~60-65%** | [LIKELY] |
| Põhja-Tallinn (Kopli, Kalamaja, Pelguranna) | ~45% | ~47% | [UNSURE] |
| Haabersti (Väike-Õismäe) | ~50% | ~42% | [UNSURE] |
| Mustamäe | ~55% | ~38% | [UNSURE] |
| Kristiine | ~65% | ~28% | [UNSURE] |
| Kesklinn | ~70% | ~22% | [UNSURE] |
| Pirita | ~80% | ~13% | [UNSURE] |
| Nõmme | ~85% | ~10% | [UNSURE] |

Within Tartu, **Annelinn** has a clearly higher Russian-speaking share (~25-30%) than the city
average [UNSURE].

Language use matters for gameplay [LIKELY]:

- In Narva, Sillamäe and much of Kohtla-Järve, everyday life is in Russian.
- Many residents over ~50 speak little or no Estonian.
- Young Russian-speakers in Tallinn are usually bilingual.
- The Ida-Virumaa population is older on average than Estonia's.

### 5.4 Generator mix by locality [DESIGN]

Percent of *adult callers or persons* by group. Derived from the tables above, with refugees
added.

| Locality | Estonian | Russian-speaking resident | Ukrainian (recent) | Other |
|---|---|---|---|---|
| Tallinn: Lasnamäe | 30 | 60 | 7 | 3 |
| Tallinn: Põhja-Tallinn | 45 | 47 | 5 | 3 |
| Tallinn: Mustamäe / Haabersti | 52 | 40 | 5 | 3 |
| Tallinn: Kesklinn / Kristiine | 66 | 25 | 4 | 5 |
| Tallinn: Nõmme / Pirita | 85 | 11 | 2 | 2 |
| Maardu | 20 | 72 | 6 | 2 |
| Paldiski | 30 | 62 | 6 | 2 |
| Harjumaa suburbs (Viimsi, Rae, Saue, Keila, Saku) | 82 | 13 | 3 | 2 |
| Narva | 4 | 91 | 4 | 1 |
| Sillamäe | 5 | 90 | 4 | 1 |
| Kohtla-Järve | 18 | 76 | 5 | 1 |
| Jõhvi | 35 | 58 | 6 | 1 |
| Narva-Jõesuu | 18 | 75 | 6 | 1 |
| Ida-Viru rural (Alutaguse, Lüganuse, Toila) | 50 | 45 | 4 | 1 |
| Peipsi coast (Mustvee, Kallaste, Kolkja) | 50 | 48 | 1 | 1 |
| Tartu city | 80 | 14 | 4 | 2 |
| Pärnu city | 86 | 10 | 3 | 1 |
| Valga, Tapa, Kunda | 68 | 28 | 3 | 1 |
| Other county towns (Rakvere, Viljandi, Paide, Võru, Põlva, Rapla, Haapsalu, Jõgeva, Kuressaare) | 90 | 7 | 2 | 1 |
| Rural mainland | 95 | 3 | 1 | 1 |
| Saaremaa / Hiiumaa / Muhu | 97 | 1.5 | 1 | 0.5 |

The **"Other" pool** [LIKELY name patterns, DESIGN shares]:

- Finnish: Mikko, Jari, Timo, Antti; Virtanen, Korhonen, Nieminen, Mäkinen
- Latvian: Jānis, Andris, Ilze, Inese; Bērziņš / Bērziņa, Kalniņš / Kalniņa, Ozols / Ozola
- Armenian: Arman, Gor, Anahit; Petrosjan, Grigorjan, Hakobjan
- Azerbaijani: Elvin, Rašad; Mamedov / Mamedova, Alijev, Gussejnov
- Georgian: Giorgi, Levan, Nino; Beridze, Kapanadze, Gelašvili
- Recent foreign workers and students from South Asia: Rahul, Arjun, Priya; Sharma, Singh, Patel
- EU and other: German, Polish, Italian, Nigerian and Turkish names, in small numbers

---

## 6. Citizenship structure

### 6.1 Categories [LIKELY]

| Category | Estonian term | Document |
|---|---|---|
| Estonian citizen | Eesti kodanik | Estonian passport, ID card (isikutunnistus) |
| Undetermined citizenship ("grey passport") | **määratlemata kodakondsusega isik** | **välismaalase pass** (alien's passport, grey cover, colloquially *hall pass*). The holder also has a residence-permit card (elamisloakaart). |
| Russian Federation citizen | Vene Föderatsiooni kodanik | Russian passport plus Estonian residence permit (elamisluba) |
| Other third-country national | välismaalane | Foreign passport plus residence permit |
| EU citizen | EL kodanik | Own ID or passport plus registered right of residence |
| Ukrainian refugee | ajutise kaitse saaja | Ukrainian passport plus temporary-protection residence permit |

Facts about grey-passport holders [LIKELY]:

- Most are Soviet-era migrants and their descendants who did not naturalise after 1991.
- Holders could travel visa-free both in the Schengen area and to Russia.
- Since 2016, children born in Estonia to stateless parents get Estonian citizenship
  automatically. So new grey-passport holders are rare and the group is ageing and shrinking.

### 6.2 Numbers (approx.)

| Year / source | Estonian citizens | Undetermined (grey) | Russian citizens | Conf. |
|---|---|---|---|---|
| 1992 | - | ~32% of residents had no citizenship | - | [LIKELY] |
| Census 2011 | ~84% | ~6.5% (~85,000) | ~6-7% (~89,000) | [LIKELY] |
| Census 2021 | **~85%** | **~5% (~65,000)** | **~5% (~65,000-70,000)** | [LIKELY approx] |
| ~2024-2025 (ministry / PPA data) | ~83-84% (more foreigners in the population) | **~57,000-62,000 (~4.3%)** | **~70,000-85,000** with residence permits | [UNSURE] |

Counts of Russian citizens vary between sources. Census counts usual residents; residence-permit
statistics count valid permits.

In 2025, a constitutional amendment removed local-election voting rights from Russian (and other
third-country) citizens [LIKELY]. Transitional rules for grey-passport holders were debated
[UNSURE on the final details]. This is good background for radio, news or dialogue flavour.

### 6.3 Citizenship in Ida-Virumaa and Tallinn [UNSURE approx.]

| Place | Estonian citizens | Russian citizens | Undetermined |
|---|---|---|---|
| Narva | ~50-55% | **~32-36%** | ~12-15% |
| Sillamäe | ~45-50% | ~35-40% | ~12-15% |
| Kohtla-Järve | ~65-70% | ~15-20% | ~12-15% |
| Maardu | ~65% | ~18% | ~15% |
| Tallinn | ~83-85% | ~6% | ~6% |
| Lasnamäe | ~70% | ~12% | ~14% |

Tallinn has the largest *absolute* number of grey-passport holders; Ida-Virumaa has the highest
*share* [LIKELY].

### 6.4 Generator rules [DESIGN]

| Group and age | Estonian citizen | Russian citizen | Undetermined | Other |
|---|---|---|---|---|
| Estonian (any age) | 99 | 0 | 0 | 1 |
| Russian-speaking, 18-34 | 85 | 7 | 6 | 2 |
| Russian-speaking, 35-59 | 58 | 20 | 19 | 3 |
| Russian-speaking, 60-80 | 40 | 33 | 25 | 2 |
| Russian-speaking, Narva or Sillamäe (any age) | 50 | 35 | 13 | 2 |
| Ukrainian refugee | 0 | 0 | 0 | 100 (Ukrainian citizen, temporary protection) |
| Other | 10 | 0 | 0 | 90 |

The isikukood does **not** encode citizenship. Every legal resident has an isikukood, including
grey-passport holders, Russian citizens with residence permits, refugees and even e-residents.
[LIKELY]

---

## 7. Isikukood (Estonian personal identification code)

### 7.1 Structure [LIKELY; examples COMPUTED]

The code has **11 digits**, in the form `G YY MM DD SSS C`.

| Position | Meaning |
|---|---|
| **G** (1) | Century of birth and sex (table below) |
| **YY** (2-3) | Last two digits of birth year |
| **MM** (4-5) | Birth month |
| **DD** (6-7) | Birth day |
| **SSS** (8-10) | Serial number. Before 2013 it encoded the birth hospital or region. From 2013 it is a plain sequence among people born on the same day. |
| **C** (11) | Check digit |

The structure is defined by the Estonian standard **EVS 585** (Isikukood. Struktuur). Codes have
been issued since **1992** under the Population Register (Rahvastikuregister) [LIKELY]. A code
is permanent; a new one is issued only in special cases such as legal gender change or an error
[LIKELY].

**First digit G:**

| G | Sex | Born |
|---|---|---|
| 1 | male | 1800-1899 |
| 2 | female | 1800-1899 |
| 3 | male | 1900-1999 |
| 4 | female | 1900-1999 |
| 5 | male | 2000-2099 |
| 6 | female | 2000-2099 |
| 7 | male | 2100-2199 (reserved) |
| 8 | female | 2100-2199 (reserved) |

Odd = male, even = female. Century = 1800 + floor((G − 1) / 2) × 100. For EPD's ages 18-80,
only **3/4** (born 1946-1999) and **5/6** (born 2000-2008) occur. [LIKELY]

### 7.2 Check digit algorithm [LIKELY; implementation COMPUTED]

1. Multiply the first 10 digits by the **stage-1 weights `1 2 3 4 5 6 7 8 9 1`**. Sum the
   products and take the remainder mod 11.
2. If the remainder is **0-9**, that is the check digit.
3. If the remainder is **10**, multiply the first 10 digits by the **stage-2 weights
   `3 4 5 6 7 8 9 1 2 3`**. Sum and take mod 11.
4. If the stage-2 remainder is 0-9, that is the check digit. If it is **10 again, the check
   digit is 0**.

**Worked example (stage 1):** `3760503029` (man, born 3 May 1976; the well-known textbook example)

3×1 + 7×2 + 6×3 + 0×4 + 5×5 + 0×6 + 3×7 + 0×8 + 2×9 + 9×1 = 108. Then 108 mod 11 = 9, so the
code is **`37605030299`** [COMPUTED].

**Worked example (stage 2):** `4800424287` (woman, born 24 April 1980, serial 287 = Tartu)

- Stage 1: 4+16+0+0+20+12+28+16+72+7 = 175, and 175 mod 11 = 10. Go to stage 2.
- Stage 2: 12+32+0+0+28+16+36+2+16+21 = 163, and 163 mod 11 = 9, so the code is
  **`48004242879`** [COMPUTED].

**Reference implementation (TypeScript), tested in this session [COMPUTED]:**

```ts
const W1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1];
const W2 = [3, 4, 5, 6, 7, 8, 9, 1, 2, 3];

export function isikukoodChecksum(first10: string): number {
  const d = [...first10].map(Number);
  let r = d.reduce((s, x, i) => s + x * W1[i], 0) % 11;
  if (r < 10) return r;
  r = d.reduce((s, x, i) => s + x * W2[i], 0) % 11;
  return r < 10 ? r : 0;
}

export function isValidIsikukood(code: string): boolean {
  if (!/^[1-8]\d{10}$/.test(code)) return false;
  const g = +code[0];
  const y = 1800 + Math.floor((g - 1) / 2) * 100 + +code.slice(1, 3);
  const m = +code.slice(3, 5), day = +code.slice(5, 7);
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) return false;
  return isikukoodChecksum(code.slice(0, 10)) === +code[10];
}
```

> **Bug found in `docs/DESIGN.md`.** Its example radio line uses `38506120234`. That code is
> **invalid**: the correct check digit is 6, giving **`38506120236`** [COMPUTED]. Fix the doc
> and any test fixtures copied from it.

### 7.3 Serial number (SSS) and birth hospital, births before 2013

For people born before 2013, the serial range showed the hospital or registration area of birth.
This is the widely circulated table (Estonian Wikipedia "Isikukood"). The overall scheme is
[LIKELY]; the exact range boundaries are [UNSURE].

| SSS range | Hospital / area |
|---|---|
| 001-010 | Kuressaare haigla (Saaremaa) |
| 011-019 | Tartu Ülikooli Naistekliinik (Tartu) |
| 021-220 | Ida-Tallinna Keskhaigla, Pelgulinna sünnitusmaja, Hiiu Ravila (Tallinn) |
| 221-270 | Ida-Viru Keskhaigla (Kohtla-Järve, formerly Järve haigla) |
| 271-370 | Maarjamõisa Kliinikum (Tartu), Lõuna-Eesti Haigla |
| 371-420 | Narva haigla |
| 421-470 | Pärnu haigla |
| 471-490 | Pelgulinna sünnitusmaja (Tallinn), Haapsalu haigla |
| 491-520 | Järvamaa haigla (Paide) |
| 521-570 | Rakvere haigla, Tapa haigla |
| 571-600 | Valga haigla |
| 601-650 | Viljandi haigla |
| 651-700 | Lõuna-Eesti Haigla (Võru), Põlva haigla |

- **From 1 Jan 2013**, the serial is just the birth order among codes issued for that date
  (001, 002, …). It carries no location [LIKELY].
- How serials were assigned retroactively in 1992 to people born in Soviet times or abroad is
  [UNSURE]. Immigrants and e-residents get codes from the same date-plus-serial scheme.

[DESIGN] The suggested mapping for EPD:

| Birthplace | Serial range |
|---|---|
| Tallinn / Harjumaa | 021-220 or 471-490 |
| Tartu | 011-019 or 271-370 |
| Narva | 371-420 |
| Kohtla-Järve, Jõhvi, Sillamäe | 221-270 |
| Pärnu | 421-470 |
| Saaremaa | 001-010 |
| Paide | 491-520 |
| Rakvere / Tapa | 521-570 |
| Valga | 571-600 |
| Viljandi | 601-650 |
| Võru / Põlva | 651-700 |
| Haapsalu | 471-490 |
| Born abroad / immigrant | 700-999 |
| Born 2013 or later | 001-030 (no location) |

Never reuse the same code for two people.

### 7.4 Valid example codes for tests [COMPUTED]

All of these pass the algorithm above. They are synthetic; any real-world collision is
coincidental.

| Code | Sex | Born | Serial meaning | Check stage |
|---|---|---|---|---|
| 37605030299 | M | 03.05.1976 | 029 Tallinn | 1 |
| 38506120236 | M | 12.06.1985 | 023 Tallinn | 1 |
| 49203153728 | F | 15.03.1992 | 372 Narva | 1 |
| 34801026058 | M | 02.01.1948 | 605 Viljandi | 1 |
| 45712302224 | F | 30.12.1957 | 222 Kohtla-Järve | 1 |
| 37611050122 | M | 05.11.1976 | 012 Tartu (naistekliinik) | 1 |
| 36909185318 | M | 18.09.1969 | 531 Rakvere | 1 |
| 51001010019 | M | 01.01.2010 | 001 Kuressaare | 1 |
| 60802294222 | F | 29.02.2008 | 422 Pärnu (leap day) | 1 |
| 51407070179 | M | 07.07.2014 | 017 (post-2013 sequence) | 1 |
| 61507070041 | F | 07.07.2015 | 004 (post-2013 sequence) | 1 |
| 48004242879 | F | 24.04.1980 | 287 Tartu | **2** |
| 38506120030 | M | 12.06.1985 | 003 | **2** |
| 38506120400 | M | 12.06.1985 | 040 | **2 (both stages = 10 → 0)** |

**Invalid codes for negative tests:**

- `38506120234`: wrong check digit
- `60802304222`: 30 February does not exist
- `98506120236`: first digit 9

---

## 8. Phone numbers

General rules [LIKELY]:

- The country code is **+372**. There is **no trunk prefix**: dial the same digits inside the
  country, with no leading 0.
- The international access prefix is **00**.
- **Closed numbering**: since 2004 all numbers are dialled in full. Old area codes are gone, but
  landline numbers still start with geographic digits.

### 8.1 Mobile

| Pattern | Notes | Conf. |
|---|---|---|
| **5xx xxxx** (7 digits) | Older mobile numbers. Still very common among middle-aged and older users. | [LIKELY] |
| **5xxx xxxx** (8 digits) | Most numbers issued in recent years | [LIKELY] |
| **8xxx xxxx** (8 digits, typically 81-84…) | Newer mobile ranges | [UNSURE exact sub-ranges] |

- Historically the operator could be read from the prefix: roughly 50/52 = Telia (formerly EMT),
  55/56 = Elisa, 58 = Tele2. Number portability now makes this unreliable [UNSURE].
- Written formats: `5123 4567`, `+372 5123 4567`, `512 3456`, `+372 512 3456`.

[DESIGN] For generation:

- About 60% `5xxx xxxx`, 30% `5xx xxxx` (weighted toward older people) and 10% `8xxx xxxx`.
- Estonia has no reserved "fictional" range like the US 555 numbers. Random numbers may belong to
  real people. Consider masking (`5xxx 4567`) or using a fixed pool of numbers that can be shown
  as obviously fake. Never use a generated number outside the game.

### 8.2 Landline (7 digits), by former area code

| First digits | Area | Conf. |
|---|---|---|
| **6xx xxxx** | Tallinn and Harjumaa; also many company and VoIP numbers nationwide | [LIKELY] |
| **32x xxxx** | Lääne-Virumaa (Rakvere) | [LIKELY] |
| **33x xxxx** | Ida-Virumaa (Jõhvi, Kohtla-Järve) | [LIKELY] |
| **35x xxxx** | Narva | [LIKELY] |
| 39x xxxx | Sillamäe | [UNSURE] |
| **38x xxxx** | Järvamaa (Paide) | [LIKELY] |
| **43x xxxx** | Viljandimaa | [LIKELY] |
| **44x xxxx** | Pärnumaa | [LIKELY] |
| **45x xxxx** | Saaremaa (Kuressaare) | [LIKELY] |
| **46x xxxx** | Hiiumaa (Kärdla) | [LIKELY] |
| **47x xxxx** | Läänemaa (Haapsalu) | [LIKELY] |
| **48x xxxx** | Raplamaa | [LIKELY] |
| **7xx xxxx** (73x, 74x) | Tartu and Tartumaa | [LIKELY] |
| **76x xxxx** | Valgamaa | [LIKELY] |
| **77x xxxx** | Jõgevamaa | [LIKELY] |
| **78x xxxx** | Võrumaa | [LIKELY] |
| **79x xxxx** | Põlvamaa | [LIKELY] |

Typical written formats: `612 3456`, `+372 612 3456`, `735 1234`.

### 8.3 Special and short numbers (flavour)

| Number | Service | Conf. |
|---|---|---|
| **112** | Single emergency number: police, rescue, ambulance (Häirekeskus) | [LIKELY] |
| 1247 | Riigiinfo: state helpline, run by Häirekeskus | [LIKELY] |
| 612 3000 | PPA general information line | [LIKELY] |
| 1220 | Perearsti nõuandeliin (family-doctor advice line) | [LIKELY] |
| 116 111 | Lasteabi (child helpline) | [LIKELY] |
| 116 006 | Ohvriabi kriisitelefon (victim support) | [LIKELY] |
| 16662 | Mürgistusteabe (poison information) | [LIKELY] |
| 800 xxxx / 8000 xxxx | Toll-free | [LIKELY] |
| 900 xxxx | Premium-rate | [LIKELY] |

---

## 9. Occupations and employers (flavour)

[DESIGN] `DESIGN.md` says **no real company names in crimes**. Use the generic employer labels
below in incident text and person records. The real employers in §9.3 are background reference
only.

### 9.1 Common occupations, with suggested weights for adults 18-80

| Estonian | English | W | Where especially |
|---|---|---|---|
| pensionär | pensioner | 10 | everywhere; Ida-Virumaa and rural areas more |
| müüja / klienditeenindaja | shop assistant, customer service | 6 | towns |
| kassapidaja | cashier | 3 | towns |
| autojuht / veokijuht | driver, truck driver | 5 | everywhere |
| taksojuht (platvormitakso) | taxi or ride-hail driver | 3 | Tallinn, Tartu |
| kuller | courier, food delivery | 3 | Tallinn, Tartu; often students or migrants |
| laotöötaja | warehouse worker | 4 | Harjumaa logistics parks |
| ehitustööline / ehitaja | construction worker | 5 | everywhere |
| keevitaja | welder | 2 | industry, Ida-Virumaa, Pärnu |
| elektrik | electrician | 2 | |
| lukksepp / automehaanik | fitter, car mechanic | 3 | |
| tisler / puusepp | joiner, carpenter | 2 | rural, Pärnu (furniture) |
| tehasetööline / operaator | factory worker, machine operator | 4 | Tallinn suburbs, Ida-Virumaa, Pärnu, Tartu |
| kaevur | (oil-shale) miner | 2 | **Ida-Virumaa only** |
| elektrijaama operaator | power plant operator | 1 | Narva |
| keemiatööstuse operaator | chemical plant operator | 1 | Kohtla-Järve |
| turvatöötaja | security guard | 3 | malls, shops, events; relevant to police calls |
| koristaja | cleaner | 3 | |
| kokk / ettekandja / baarman | cook, waiter, bartender | 3 | towns, Pärnu in summer |
| hooldaja | care worker (care home) | 2 | |
| õde | nurse | 2 | |
| arst | doctor | 1 | |
| kiirabitöötaja | paramedic | 1 | |
| õpetaja / lasteaiaõpetaja | teacher, kindergarten teacher | 3 | |
| raamatupidaja | accountant | 2 | |
| ametnik / spetsialist | civil servant, office specialist | 4 | Tallinn, Tartu, county towns |
| IT-arendaja / programmeerija | software developer | 3 | Tallinn, Tartu |
| projektijuht / müügijuht | project or sales manager | 3 | Tallinn |
| kinnisvaramaakler | estate agent | 1 | |
| ettevõtja / FIE | self-employed or business owner | 3 | |
| talunik / põllumees | farmer | 2 | rural |
| metsatööline / harvesterijuht | forestry worker, harvester operator | 2 | rural (Võru, Põlva, Järva, Pärnu, Ida-Viru) |
| kalur | fisherman | 1 | Saaremaa, Hiiumaa, **Peipsi coast** |
| bussi- / trammi- / rongijuht | bus, tram or train driver | 1 | |
| sadama- / laevatöötaja | port or ferry worker | 1 | Tallinn, Paldiski, Muuga, Virtsu, Rohuküla |
| kaitseväelane | soldier (Defence Forces) | 1 | Tapa, Paldiski, Võru, Jõhvi |
| politseinik / päästja | police officer, rescuer | 1 | |
| piirivalvur | border guard (PPA) | 1 | Narva, Koidula, Luhamaa |
| vanglaametnik | prison officer | 1 | Tartu, Viru (Jõhvi) |
| üliõpilane | university student | 4 | Tartu, Tallinn |
| õpilane | school pupil (18-year-olds in gymnasium or vocational school) | 2 | |
| töötu | unemployed | 4 | higher share in Ida-Virumaa |
| kodune / lapsehoolduspuhkusel | homemaker, parental leave | 2 | |

Context [UNSURE approx.]:

- National unemployment has been roughly 6-8% in 2023-2025.
- Ida-Virumaa has the highest regional rate, often above 10%.
- There are roughly 300,000 old-age pensioners.

### 9.2 Generic employer labels [DESIGN]

kaubanduskett (retail chain), toidupood (grocery), kaubanduskeskus (mall), tankla (petrol
station), pank (bank), energiaettevõte (energy company), elektrijaam (power plant), kaevandus
(mine), keemiatehas (chemical plant), sadam (port), laevafirma (ferry line), logistikafirma,
ehitusfirma, tehas (factory), saeveski (sawmill), mööblitehas, piimafarm, IT-firma, call-center,
haigla (hospital), hooldekodu (care home), kool, lasteaed, ülikool, vallavalitsus / linnavalitsus,
ministeerium, turvafirma, taksofirma, kullerfirma, hotell / spaa (Pärnu, Narva-Jõesuu,
Kuressaare, Haapsalu), restoran, autoremonditöökoda, metsafirma.

### 9.3 Real large employers: reference only, do not use in crimes [LIKELY]

- Public sector: the state, municipalities, schools, hospitals (Põhja-Eesti Regionaalhaigla,
  Tartu Ülikooli Kliinikum, Ida-Tallinna Keskhaigla), Kaitsevägi and PPA.
- Energy and industry: Eesti Energia / Enefit (oil-shale mines, Narva power plants), VKG in
  Kohtla-Järve, NPM Silmet in Sillamäe (rare earths), Ericsson Eesti, ABB, Stoneridge
  Electronics, Graanul Invest.
- Retail: Rimi, Maxima, Selver, Prisma, Coop.
- Transport and logistics: Tallink, Tallinna Sadam, Elron, Eesti Raudtee, Omniva, Tallinna
  Linnatranspordi AS.
- Telecoms and banks: Telia, Elisa, Tele2; Swedbank, SEB, LHV.
- Tech: Bolt, Wise.

Historical flavour: older Narva residents often worked at **Kreenholmi Manufaktuur**, the
textile mill that closed around 2010 [LIKELY].

---

## 10. Farm and house names (talunimed) and rural addresses

### 10.1 Address format [LIKELY]

- An official rural address (ADS) gives the **farm or property name, then the village (küla),
  rural municipality (vald) and county (maakond)**. Example: `Mäe, Kurtna küla, Saku vald,
  Harju maakond`.
- The word *talu* is usually **not** part of the official name. In speech people say
  "Mäe talu" or "Uuetoa talus".
- With a postal code: `Mäe, Kurtna küla, Saku vald, 75411 Harju maakond`.
- Urban addresses: `Mustamäe tee 12-34, 12915 Tallinn` (house-apartment). `Puškini 25-7,
  20308 Narva`. `Riia 15, 51010 Tartu`.
- Street abbreviations: tn (tänav), mnt (maantee), pst (puiestee), tee, põik, allee, väljak.
- **Summer-cottage cooperatives** (aiandusühistu, AÜ; suvilaühistu): e.g. `Kalda AÜ, krunt 112`.
  These matter for winter burglary calls. There are many around Tallinn (Harku, Saue, Saku, Rae)
  and around Narva and Sillamäe [LIKELY]. In Ida-Virumaa these cottages are called *dachas*.

### 10.2 Farm and house names: 100

Most are a genitive form of a nature, landscape or first name ("Mäe" = of the hill; "Jaani" =
Jaan's). Prefixes **Uue-** (new), **Vana-** (old), **Ala-/Alt-** (lower), **Üle-** (upper or
across), **Suure-** (big) and **Väike-** (small) make many variants: Uue-Mäe, Vana-Kase,
Alt-Jõe, Suure-Saare, Väike-Männi. [LIKELY]

**Nature and landscape (very common):**

| | | | |
|---|---|---|---|
| Mäe | Kase | Jõe | Männi |
| Kuuse | Tamme | Saare | Metsa |
| Välja | Oja | Pärna | Lepa |
| Niidu | Kalda | Allika | Kivi |
| Nõmme | Soo | Silla | Tiigi |
| Ranna | Järve | Oru | Paju |
| Haava | Pihlaka | Vahtra | Kadaka |
| Kuusiku | Kaasiku | Lepiku | Tammiku |
| Männiku | Sarapiku | Liiva | Laane |
| Nurme | Põllu | Raja | Nurga |
| Lille | Õuna | Toominga | Sireli |
| Ristiku | Kõrve | Kure | Rebase |

**Position, age and buildings:**

| | | | |
|---|---|---|---|
| Uuetoa | Vanatoa | Vahe | Mäeotsa |
| Metsaotsa | Teeotsa | Jõeääre | Järveotsa |
| Kivimäe | Kasemäe | Kuusemäe | Vahtramäe |
| Ristimäe | Linnamäe | Soovälja | Kiviaia |
| Rehe | Veski | Sauna | Saunaaluse |
| Kooli | Kõrtsi | Mõisa | Pargi |
| Kopli | Ülejõe | Uustalu | Kraavi |

**Trades:** Sepa (smith's), Möldri (miller's), Rätsepa (tailor's), Kingsepa (shoemaker's),
Kubja (bailiff's), Kärneri (gardener's), Tisleri (joiner's).

**First-name farms:** Jaani, Peetri, Hansu, Andrese, Juhani, Tõnise, Mihkli, Mardi, Jüri,
Jaagu, Tooma, Madise, Kaarli, Priidu, Matsi, Ado, Jaagupi, Lauri, Kusta, Tiidu.

[DESIGN] Generation:

- 70% from the nature and position lists, 20% first-name farms, 10% trades.
- Add an Uue-, Vana-, Alt-, Üle-, Suure- or Väike- prefix 15% of the time.
- Avoid producing two identical names in the same village.

### 10.3 Postal code first digits (for address realism) [UNSURE ranges]

Estonian postal codes have 5 digits.

| Area | Codes |
|---|---|
| Tallinn | 10xxx-15xxx |
| Narva | 20xxx-21xxx |
| Kohtla-Järve | 30xxx-31xxx |
| Jõhvi | 41xxx |
| Sillamäe | 40xxx |
| Rakvere | 44xxx |
| Jõgeva | 48xxx |
| Tartu | 50xxx-51xxx |
| Põlva | 63xxx |
| Võru | 65xxx |
| Valga | 68xxx |
| Viljandi | 71xxx |
| Paide | 72xxx |
| Harjumaa outside Tallinn | 74xxx-76xxx |
| Rapla | 79xxx |
| Pärnu | 80xxx |
| Haapsalu | 90xxx |
| Kärdla | 92xxx |
| Kuressaare | 93xxx |

---

## 11. Age, sex and town sizes (extra, for weighting)

| Metric | Value | Conf. |
|---|---|---|
| Share aged 65+ | ~21% | [LIKELY] |
| Women, share of total population | ~52-53% | [LIKELY] |
| Women, share of people over 65 | ~63-65% (large gender gap in life expectancy) | [LIKELY] |
| Life expectancy | men ~74-75, women ~82-83 | [LIKELY] |
| Median age | ~42; Ida-Virumaa highest (~47+) | [UNSURE] |

[DESIGN] **Adult age distribution (18-80)** for the person generator, reflecting large 1980s
birth cohorts and small 1990s cohorts:

| Age | Share |
|---|---|
| 18-24 | 9% |
| 25-34 | 15% |
| 35-44 | 19% |
| 45-54 | 17% |
| 55-64 | 16% |
| 65-74 | 15% |
| 75-80 | 9% |

For Ida-Virumaa and Russian-speakers, move about 5 points from the 25-44 bands into 55-80.

**Approximate populations (2024-2025)** [LIKELY approx; UNSURE for small towns]:

| Place | Population |
|---|---|
| Tallinn | ~455,000 (Lasnamäe ~120,000) |
| Tartu | ~97,000 |
| Narva | ~53,000 (declining) |
| Pärnu | ~41,000 city; ~52,000 municipality |
| Kohtla-Järve | ~32,000 |
| Viljandi | ~17,000 |
| Maardu | ~17,000 |
| Rakvere | ~15,000 |
| Kuressaare | ~13,000 |
| Sillamäe | ~12,000 |
| Valga | ~12,000 |
| Võru | ~11,500 |
| Keila | ~10,500 |
| Jõhvi | ~10,000 |
| Haapsalu | ~9,500 |
| Paide | ~7,800 |
| Põlva | ~5,500 |

---

## 12. Open uncertainties

1. **No live verification.** The search budget was exhausted, so every percentage, rank order
   and count above comes from prior knowledge. Before shipping "real statistics" text, check
   against stat.ee (name statistics; Census 2021 ethnicity and citizenship tables by county and
   municipality) and Siseministeerium citizenship data.
2. **Citizenship counts after 2021.** Russian-citizen counts differ between census and
   residence-permit data. The grey-passport count for 2025 (~57,000-62,000) is [UNSURE].
3. **Hospital serial ranges** (§7.3) follow the commonly cited table, but the exact boundaries
   and the handling of codes assigned retroactively in 1992 are unverified.
4. **Mobile 8xxx ranges** and the Sillamäe landline prefix (39x) are unverified.
5. **Small-town ethnic shares** (Paldiski, Loksa, Kiviõli, Valga, Tapa, Kunda, Kallaste) are
   rough.
6. **Estonian-press transliteration of Ukrainian female names** (Tetjana, Natalija, Anastassija)
   is uncertain in details. The passport forms are safer for data.
7. **Fix needed:** the `DESIGN.md` example isikukood `38506120234` fails the checksum. Use
   `38506120236`.
