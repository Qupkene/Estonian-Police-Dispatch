# Sectors and Career 2.0

A career no longer starts with a whole prefecture. It starts at one desk of the prefecture's juhtimiskeskus,
covering one **sector**, and takes on more sectors as the prefect trusts the player with them. The other
sectors are run by AI colleagues at the neighbouring desks.

This is how the real centres work: the operatiivinfo haldurid sit at desks that each cover a sector, a new
dispatcher gets one, an experienced one several, and the vahetuse vanem sees all of them (see
docs/research/ppa-organisation.md section 4).

## Positions (display only)

| Covers | Position |
|---|---|
| 1 sector | Operatiivinfo haldur |
| 2 or more sectors | Vanem-operatiivinfo haldur |
| a whole prefecture | Vahetuse vanem |
| two or more whole prefectures | Grupijuht |
| all four prefectures | Keskuse juht |

The police ranks (data/economy.ts RANKS) stay as they are; the position comes from the area.

## Sectors

`src/data/sectors.ts` lists `SectorDef`s (types in src/sim/types.ts) after the real politseijaoskonnad and
their piirkonnagrupid, cut so one sector is a sensible desk: a city, or a county. Target layout:

- **Põhja**: Tallinna kesklinn (Kesklinn, Pirita), Lasnamäe, Lääne-Tallinn (Põhja-Tallinn, Haabersti,
  Kristiine, Mustamäe, Nõmme), Ida-Harju, Lääne-Harju.
- **Lõuna**: Tartu linn, Tartumaa ja Elva, Jõgevamaa, Viljandimaa, Põlvamaa, Võrumaa, Valgamaa.
- **Ida**: Narva (Narva, Narva-Jõesuu), Jõhvi ja Kohtla-Järve (with Sillamäe, Kiviõli, Alutaguse),
  Lääne-Virumaa.
- **Lääne**: Pärnu, Pärnumaa, Läänemaa, Saaremaa, Hiiumaa, Raplamaa, Järvamaa.

Starter sectors (1 or 2 per prefecture, with a difficulty): Tallinna kesklinn (normal), Lasnamäe (hard),
Tartu linn (normal), Viljandimaa (easy), Lääne-Virumaa (easy), Narva (hard), Pärnu (normal), Saaremaa (easy).

Each sector names its stations (the first is the main station, always staffed; a main station can serve two
sectors, as the Ida-Harju jaoskond serves Lasnamäe and Ida-Harju), the posts a career can open (existing post
stations: Põhja-Tallinn, Kose, Saku, Narva-Jõesuu, Kohtla-Järve, Sillamäe, Kiviõli, Tapa, Elva, Räpina,
Otepää; 9 000-18 000 € and 450-850 € a month), its neighbours (always both ways), a blurb and 4-5 traits in
Estonian and English, and the AI colleague at its desk. Residents per sector come from `COUNTY_POPULATION`
and `TOWN_DISTRICTS` (src/data/sectors.ts): a town goes to its sector, Tallinn by its districts, the rest of a
county (its villages) to the sectors matching the county. Shares of the prefecture: Tallinna kesklinn 14 %,
Lasnamäe 19 %, Lääne-Tallinn 40 %, Tartu linn 30 %, Viljandimaa 14 %, Narva 32 %, Lääne-Virumaa 31 %, Pärnu
19 %, Saaremaa 15 %.

**Membership** (`sectorOf`, most specific first): (1) a Tallinn district: the address's own district, else
the district polygon at its point, else the district of a Tallinn street or place within 1.5 km; (2) the town,
when the location carries a town's name a sector lists and lies within its built-up radius (3 km + 2 km ×
√(population / 10 000)); (3) the county: a rural spot's own county, the town's, the county polygon at the
point, else the nearest town's. A county split between sectors (Harju, Ida-Viru) goes by the nearest town one
of those sectors lists, then by the nearest main station; a location nothing matches goes to the sector with
the nearest main station. `sectorAt` does the same for a bare map point. Every town, street and place of the
four prefectures, and every generated address, belongs to exactly one sector (tests/sectors.test.ts).

Geometry (src/sim/sectors.ts): `areaBounds` (the map camera), `sectorOutlines` (a padded convex hull of a
sector's towns, streets, places, stations and villages, one ring per movement zone, so Saaremaa and Ruhnu are
two rings), `areaStations` (main stations, then opened posts), `areaShare`, `inArea`, `neighbourSectors`,
`mainStation`, `borderPoints` (a neighbour's points nearest the area).

## Shifts

`NewShiftOptions.sectors` (and `SimState.sectors`) name the sectors the player covers. Missing or empty
means the whole prefecture, exactly as before sectors existed: free mode, the director, the tutorial, every
older save and every converted career covering a whole prefecture play as they did (tests/sectors.test.ts
resumes every shift autosave of tests/fixtures/saves/).

With sectors:
- Calls spawn only inside the area. The address generator works on the area as a region of its own
  (`areaView`: its towns, Tallinn split into its districts, streets and places), each location is checked
  with `inArea` and picked again up to 8 times, and a template with no place there (a farm call in the city
  centre) gives way to another, at most 3 per arrival; then the arrival is dropped (well under 1 % of them).
- The call volume (`areaCallFactor`) is the prefecture's × the area's population share ^ 0.6
  (`AREA_SOFTEN`), but at least `AREA_MIN_VOLUME` = 2.5 calls an hour (2 before 2.23.0) before the hour curve,
  difficulty and weather (one desk's worth), at most the prefecture's. A career
  shift then applies the load factor: (its response crews ÷ the regular response roster of the area's
  stations, a station shared by two sectors counted by their population share) ^ 0.75. A starter sector with a
  new career's force (10 officers, 5 cars) on an ordinary weekday at normal difficulty gets about 27 calls on an
  8 h day shift and 33 on a night shift (tests/sim-balance.test.ts, five shifts per sector: 26-28 by day, 27-35
  by night; about 10 and 15 before 2.23.0); Friday and Saturday nights are busier, as everywhere.
- The crews come from the area's stations (`rosterFromCareer`): each post the career has opened there
  (`openPosts`) gets one crew, border and boat crews go to the area's border points and harbours, the rest
  to the sectors' main stations in proportion to the sectors' population, under callsigns of the station's
  regular roster. On-call assets (K-komando, helicopter) keep their prefecture base; kennel K9 teams join the
  first sector's main station. A career covering the prefecture whole gets exactly the old allocation. Free
  mode and the daily challenge filter the default roster to the sectors' stations plus the on-call assets;
  when that leaves fewer than 3 response units (`MIN_AREA_RESPONSE`), the nearest crews are lent to the first
  sector's main station under its callsigns.
- The map fits the area and dims the rest; neighbouring sectors are labelled with their AI colleague.
- **Night cover** (öine katmine): on some career night shifts (start 18:00-05:59) a small neighbouring sector is
  added for the night (`SimState.coverSectors`): its colleague is off, its calls spawn for the player (the
  spawner's area, `areaOf`, includes it, and the call volume grows with its population), no crew is based
  there. `nightCoverFor` (src/sim/colleagues.ts) decides it from the seed and the start, so the briefing shows
  exactly what `createShift` picks: with `COLLEAGUES.nightCoverChance` (35 %) one neighbour of the prefecture
  with at most `nightCoverMaxShare` (20 %) of its residents whose main station is in a movement zone of the
  area's main stations (no ferry). The briefing and the map show it, the shift's "Vastutusala" order names it
  and its colleague ("on täna öösel vaba"). Never by day, in free play or in the daily challenge.
- **AI colleagues** (src/sim/colleagues.ts, numbers in `COLLEAGUES`, src/data/sectors.ts). The colleague of
  each sector is named in its `SectorDef.colleague`; on the radio their desk is `JK <SHORT>` ("JK VILJANDIMAA").
  They act only when `SimState.colleagues` is set: `createShift` sets it on a sector shift in career or free
  play outside the daily challenge (not in the tutorial or the director, not on a whole-prefecture shift). A
  save without it, every older save, has no colleague events and plays exactly as before. A sector co-op room
  (docs/MULTIPLAYER.md section 8) sets it too, with `ColleagueState.area` = the desks the players hold, so the
  colleagues also run the room's desks nobody holds. All their draws
  (timers, picks, phrases, the help call's generation) run on `SimState.colleagues.rng`, a stream of its own
  seeded from the seed and the area, so a resumed save goes on identically.
  - **Help requests**: a Poisson process (`helpPerHour` 0.18, none in the first and last 30 minutes, at most
    `helpMax` 3 a shift and one open at a time). A desk next to the player's own sectors (not tonight's cover,
    which has no crews to lend) whose crews are all out asks for help with an ordinary P2/P3 patrol job
    (`helpTemplates`: no story event, no specialist, at most two crews) at a real street address in the
    colleague's sector, but within `helpMaxKm` (13 km, straight line) of the player's nearest crew or station
    (`helpRefs`; `nearLocation(s, rng, to, refs, maxKm, kind)` in src/sim/spawner.ts over `spotsNear` in
    src/sim/sectors.ts), reachable by road. Each desk and each place kind the call fits is tried; when no address
    is that close the colleague does not ask. So the city desks (Tallinn, Tartu, Pärnu) get them, a few km away
    (median about 3 km, a 6 minute drive); a desk whose crews sit far from every neighbour (Viljandimaa,
    Lääne-Virumaa and Narva from their main stations, the islands) gets none until a crew is near the border. The
    event is in the queue at once, already taken in (state `queued`, so no acknowledgement to miss), tagged
    `help:<sectorId>`, with the colleague's request on the radio and in the timeline, and a timeout of
    `helpTimeoutMin` 14 minutes. A crew of the player's that gets there counts in `ReportExtras.helpGiven`
    (`helpGivenCount`: closed by units, or reached and still open), the colleague thanks on the radio, and the
    career gets its Staatus bonus (below). When nobody goes (nobody is on the way at the timeout, or nobody was
    sent by the end of the shift), the colleague takes it back: closed as `colleague`, no outcome, no trust or
    score change, out of the shift's incident counts and the report. It never keeps the player in overtime.
  - **Pursuit hand-over**: when a pursuit's suspect is in a sector of the prefecture outside the area, that
    desk offers once to take it over (a radio prompt with "Anna üle naaberlauale" / "Jätkame ise", shown in
    the incident panel too, open `handoverOfferMin` 2 minutes). Handing over closes the event for the player
    as the neighbour's (`closedBy` `colleague`, pursuit ended `handedOver`, units released, neutral in the
    score, the Staatus and the report); keeping it, or not answering, changes nothing.
  - **Radio**: short lines from the desks next door now and then (`chatterPerHour` 0.3, at least
    `chatterGapMin` 40 minutes apart, at most `chatterMax` 4 a shift): their own crews, a busy evening, a
    question about the traffic near a town across the border. Flavour only, no reply buttons. Phrases
    `colleague*` and `jkHandover` in src/data/radioPhrases.ts.
- `fixedSchedule` (daily challenge): the spawner and incident generation draw from `SimState.spawnRng`, so
  every player gets the same calls at the same times and places whatever they do. `createShift` seeds it
  from the seed; the template, place, story, people and cars of each call and the weather (it moves the rate
  and the mix) come from it, and the weather changes and arrivals run at their own times in time order, so
  frame rate and speed change nothing either. Whether a call rings as a 112 call (the player's line must be
  free) and the card's publishing run on a stream of their own, seeded by one draw. The schedule's incidents
  are i1, i2 ...; incidents raised from the field number from 901. Everything that follows the player's
  actions (drives, outcomes, conversations) stays on `s.rng`. Without `fixedSchedule` nothing changes: the
  same seed gives the same shift as before.

## Career

`CareerProfile.sectors[regionId]` lists the sectors covered per prefecture. Rules in `src/sim/careerSectors.ts`
and `src/sim/career.ts` (newCareer, dailyBudget, monthlyCosts, applyShiftReport); numbers in
`src/data/economy.ts` (START_MONEY, SECTOR_BUDGET, SECTOR_OFFER, SECTOR_HANDOVER, COLLEAGUE_HELP). Every rule
returns a new profile and never changes its input.

- **Start** (`newCareer(name, badge, regionId, seed, startSector?)`): one starter sector, picked on the
  onboarding screen (by default the prefecture's first starter), and a force for one sector: 10 officers (nine
  patrol, one investigator; in Põhja the 2024 homage patrol crew and Ursula Treen plus four more), 5 cars (four
  Octavias and the investigator's Scala), 30 000 €, Staatus 25, `sectorsChangedDay` 1. It costs about 850 € a
  day against a budget of 1 150 €, so an ordinary shift makes money.
- **Daily budget** (`dailyBudget`): 750 € plus 400 € for every sector the career covers, counted over all its
  prefectures (one force answers for all of them, so playing a newly unlocked prefecture is no money trap), and
  never less than the prefecture's DAILY_BUDGET in a prefecture it covers whole. A career from before sectors
  gets exactly DAILY_BUDGET, as before. Opened posts are part of the upkeep in `monthlyCosts` (its `posts`).
- **Offers** (`maybeOffer`, run after every paid shift for the shift's prefecture): when no offer is waiting,
  the prefecture is unlocked and not covered whole, at least 3 paid shifts have passed since
  `sectorsChangedDay`, and with n sectors covered in that prefecture Staatus is at least 30 + 7 × (n - 1) (at
  most 70) and the rank index at least n (Konstaabel for a second sector, Vanemkonstaabel for a third ...), the
  prefect offers one or two sectors next to the covered ones (any sector not covered when none is next to
  them), drawn from the career seed and day (`CareerProfile.offer`). The inbox says so. `offerProgress` lists
  what is still missing for the career screen.
- **Accepting** (`acceptOffer`): the sector joins the area with 3-4 officers of that area (one or two of them
  tired, morale 0.32-0.48) and two used cars (an Octavia and an Octavia or a RAV4, condition 0.45-0.7), a
  one-off handover grant of 3 000 € in the ledger, and 400 € more daily budget, more than the new crew and cars
  cost (about 300-350 € a day). `sectorsChangedDay` becomes today.
- **Declining** (`declineOffer`): the offer goes, `sectorsChangedDay` is set two days ahead, so the next offer
  comes five shifts later at the earliest.
- **Posts** (`openPost`): a post of `SectorDef.posts` in a covered sector opens for its price (ledger entry)
  and costs its monthly upkeep from then on, while the post has a crew (not once the career covers the
  prefecture whole); one of the area's crews is based there.
- **AI colleagues**: every call of a colleague the player helped with (`ReportExtras.helpGiven`, 0 when
  missing) adds 1 Staatus, at most 3 a shift.
- **Other prefectures** still unlock by rank (EXTRA_REGION_RANKS). A career created with sectors starts there
  in one of its starter sectors (a normal one when there is one); offers there follow the shifts played there.
- **Position** (`positionTitle`): the table above, from the sectors covered in all unlocked prefectures.

## Old careers

A career from before sectors has no `sectors` field and no `sectorsChangedDay`. The career normaliser
(`normalizeCareerProfile`, also for cloud copies) checks the new fields (bad entries dropped one by one and
listed, the original kept in `epd:backup.career.repaired`), then `withSectors` fills in every sector of each
unlocked prefecture, so it plays exactly as before: the whole prefecture in every shift, exactly DAILY_BUDGET,
no offers, and the Vahetuse vanem position at once (Grupijuht with two prefectures, Keskuse juht with all
four). A prefecture it unlocks later is covered whole too. Staff, fleet, money and history are untouched; the
filled-in field is written with the next change. `withSectors` is idempotent and a stored sector career comes
back deep-equal.

No version was raised: all four fields are optional, and the previous release (2.8.0) keeps them, since its
normaliser keeps unknown fields (`tests/upgrade-paths.test.ts`). A prefecture 2.8.0 unlocks for a sector
career in the meantime starts in a starter sector when the player comes back. Golden fixture of a sector
career: `tests/fixtures/saves/sectors/`.

Sectors a later version adds: an id this version does not know but shaped like a sector of the prefecture
(`<prefecture>-<name>`, `isLaterSectorId`) stays in `sectors` and is not played here, so a career opened in an
older tab and synced keeps it. Other unknown ids are dropped (with the backup above).

## Code map

| Part | Where |
|---|---|
| Types | src/sim/types.ts (SectorDef, NewShiftOptions.sectors/openPosts/fixedSchedule, SimState.sectors/coverSectors/spawnRng/colleagues, ColleagueState, CareerProfile.sectors/openPosts/offer/sectorsChangedDay) |
| Data | src/data/sectors.ts |
| Geometry, membership | src/sim/sectors.ts |
| Spawner, roster | src/sim/spawner.ts (areaCallFactor, fixed schedule, borderLocation), src/sim/career.ts (rosterFromCareer), src/sim/units.ts (areaRosterSpecs, stationCallsign), src/sim/engine.ts |
| AI colleagues, night cover | src/sim/colleagues.ts (initColleagues, updateColleagues, nightCoverFor, answerColleague, helpGivenCount), src/sim/incidents.ts (closeByColleague), COLLEAGUES in src/data/sectors.ts |
| Tests | tests/sectors.test.ts, tests/sim-balance.test.ts (sector shifts), tests/career-sectors.test.ts, tests/colleagues.test.ts |
| Career rules | src/sim/careerSectors.ts, src/sim/career.ts (newCareer, applyShiftReport), src/store/career.ts, src/store/migrate.ts |
| UI | src/ui/screens/career/*, src/ui/screens/BriefingScreen.tsx, src/map/*, src/ui/game/* |
| The career in chapters | docs/STORY.md (src/data/story.ts, src/sim/story.ts): the AI colleague of a neighbouring desk is one of its cast |
