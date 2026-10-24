# Tagaotsimine: wanted people, wanted cars and search parties

The owner's idea: the player searches the Andmebaas for a person or a car, makes them wanted, or sends a search
party after them. This document develops that idea into a feature set that runs as a B-plot under the ordinary call
load, and says how to build it on the engine as it is today.

*Tagaotsimine* means the search for a wanted person or vehicle. *Otsingud* are searches for a missing person. Both
start in the same place: the record.

Status: design, nothing built. A change to this file alone needs no version bump (CLAUDE.md). Each phase in
section 10 is its own version.

## 1. The idea

The dispatcher in the *juhtimiskeskus* (JK, command centre) finds the right record from fragments (half a plate,
"a dark estate car", "a young man in a black hooded jacket", an address) and acts on it. The JK's own tools are
instant: a lookout to every crew (*orienteering*), a roadblock, a stake-out, an address check, a search party.
Putting a car on the ANPR watch list or making someone formally wanted is not the JK's decision: the player asks the
shift supervisor or the on-call investigator and prosecutor, the answer takes game minutes, and it depends on the
grounds the player has gathered. Behind every case is a hidden but fair target: a fugitive who drives past
*numbrituvastus* (ANPR) cameras, sleeps at a friend's flat and runs for the border, or an old man with dementia
walking towards the farm he grew up on. Every place the target can go is written somewhere in the registry, so
reading the records well wins the case. Every crew put on a roadblock or a search sector is a crew missing from the
queue. Wrong calls are survivable but remembered: an innocent man stopped at gunpoint comes back as a complaint, as
the existing fallout does today.

## 2. What exists today (2.29.0)

Checked against the code. Line numbers are as of 2.29.0.

| Part | Today | Missing for this feature |
|---|---|---|
| Andmebaas search (src/sim/registry.ts) | isikukood exact or prefix, folded name tokens, plate, VIN; 30 results (`MAX_RESULTS`); every search logs a `QueryLog` (kind `person` or `vehicle`, at most 500) | address, description, make and colour, partial plates; no action can be taken from a record |
| Wanted flags | `Person.flags.wanted` (`WantedFlag`: reason, since, dangerous, authority, armed) set by the generator and `addBulletins` | `Vehicle.flags.wanted` is typed, shown as OTSITAV and counted as `ownerwanted` (registry.ts:255, :314), but nothing ever sets it |
| Query truth | `personReply` and `vehicleReply` decide the correct radio answer at `s.now` | `personReply` never returns `missing` (patched in `expectedReply`, incidents.ts:639-640); the fallback `truthReply` ignores SIS and `Vehicle.flags.wanted`; the `ownerwanted` reply is labelled „Omanik tagaotsitav“ even when the car itself is the wanted one |
| BOLO bulletins (engine.ts:389-459) | 1-2 stolen cars and 1-2 wanted persons each shift, Okimum 15 % of shifts; the text says "ANPR hoiatus aktiivne" | inert text: nothing reads a bulletin, no camera, no hit, no lifecycle (`Bulletin` has no status) |
| ANPR | the templates `alarm_anpr_stolen_vehicle` (weight 0.4) and `alarm_anpr_wanted_owner` (0.15), each with a newly generated car | no camera positions anywhere; the career upgrade `anpr` (18 000 €, "more hits and BOLO pursuits") is read nowhere in src/sim |
| Pursuit (src/sim/pursuit.ts) | one fleeing car with position, heading and speed, ends caught, crashed, escaped or terminated | an escaped pursuit radios „Teen otsimise piirkonnas“ (pursuit.ts:496) and starts nothing; an `escaped` outcome only counts in the stats |
| Area search (src/sim/search.ts) | a circle at the incident, progress = Σ unit weight × 0.035 / r² per minute, luck roll | only a template beat starts it; the target has no position; units stand still; `Movement.purpose 'search'` is typed and never used; the drone is a virtual weight although the shop says "adds a drone unit" |
| Movement | straight lines with one or two bends, ETA = km × road factor ÷ speed | no road graph in the engine; the pursuit's road bias reads `src/data/geo/roads.json` (142 features, 936 vertices) |
| Fallout (src/sim/fallout.ts) | a wrong registry answer comes back later on the radio, with trust and score costs of 1 to 4 points; own hash stream | keyed to (incident, query beat) only |
| Co-op | every shared change is a command: `COMMAND_ROLE`, `server/mp/validate.ts`, `server/lib/coop.php` | no test keeps the three tables equal; no shape for a coordinate |
| Career | money, staff, story, sectors persist | no person, car or case survives a shift (the career seed is `Date.now()` at the briefing) |
| Missing persons | 14 templates in missing.ts and three more elsewhere, with search beats and hint lines („Telefon jäi koju“, "may be heading for his childhood home", "a favourite spot by the playground") | the hints change nothing; the search ignores them |

So the pieces are there: records, flags, bulletins, a pursuit mover, a search, fallout, a deterministic engine and
co-op. What is missing is the case that ties them together, a target with a position, and the player's actions.

## 3. Rules the design keeps

1. **The JK asks, someone else decides.** The player's own tools are instant. Formal steps are requests with a
   clock, answered by NPCs from grounds the sim checks. A refused request costs time, not points.
2. **The registry is the map of the target's mind.** Every place a fugitive or a missing person heads for (home, a
   relative, a co-offender's address, a summer house, a border crossing for a foreign citizen, a childhood farm in
   the 112 call) is readable in the records or the call. Nothing the target uses is secret.
3. **A lookout is not registry truth.** Only a granted formal status changes what a crew's registry check should
   be answered with. So `personReply` stays honest and the existing fallout kinds stay right.
4. **Crews are the currency.** Roadblocks, stake-outs and search teams are ordinary crews on ordinary incidents. The
   hunt never pauses the shift.
5. **Honest uncertainty.** The ring on the map and the shading in the search planner follow the same rules the
   hidden target follows. The detection chance on screen is the real chance.
6. **Nothing is invented to rescue a case.** True leads come only from the target's real track. False leads have
   their own rate, set by how public the hunt is.
7. **Old saves, seeds and the daily schedule do not move.** One optional sub-state with its own random streams.

## 4. The player's loop

### 4.1 A manhunt, from the first radio line to the report

Lõuna prefecture, Tartu linn desk, Tuesday night shift, normal difficulty, career day 41, phases 1 to 3 built.

- **21:40.** A pursuit of a stolen Škoda Octavia, 312 MKT, ends `escaped` near Ropka. LÕUNA 13: „Kaotasime sõiduki
  silmist, jälitus katkestatud. Teen otsimise piirkonnas.“ The incident panel offers **Ava toimik** (open a case).
  The player opens it: case **T-1**, vehicle 312 MKT, driver unknown, the crew's description „noormees, must
  kapuutsiga jope“. The car is already stolen in the registry, so it is on the ANPR watch list. The *viimane
  teadaolev asukoht* (VTA, last known position) is the pursuit's end point, mode "car"; a ring around it grows by
  about a kilometre a minute.
- **21:41.** The vehicle card now shows **Numbrituvastus: 2 läbimist** (two camera passes this evening): Ringtee at
  21:12 and Riia mnt at 21:31. The car came from Annelinn.
- **21:42.** **Anna orienteering** on the car: a bulletin in Teated and a radio line to all crews. It costs nothing,
  and it cannot be wrong: the car is stolen.
- **21:44.** Who drives? The owner, Malle Kask (54, Elva), reported the theft yesterday. Her card's **Seosed**
  (links) section shows her son Rasmus Kask (19) at the same address, with a record for taking a vehicle without
  consent in 2025; his record's co-offender, Karl Pärn, lives on Kaunase puiestee in Annelinn. The player suspects
  Rasmus but does nothing formal yet: no one has seen his face.
- **21:51.** **Teetõke** (roadblock) on the Riia mnt and Ringtee junction with LÕUNA 11. The planner suggested
  three road points ahead of the ring.
- **21:58.** A queue card **Vihje · T-1**: a 112 caller saw a dark Škoda stop on Kalda tee and a young man run into
  the yards ten minutes ago. On normal difficulty the card says grade B. The player sends LÕUNA 13.
- **22:06.** LÕUNA 13 finds the car empty, engine warm. A crew's own find moves the VTA by itself; the mode switches
  to foot and the ring shrinks to 0.6 km. The vehicle part of the case closes as found, and the case reminds the
  player to cancel the car's alert (forgetting it is a later complaint from the owner).
- **22:08.** **Saada otsingurühm** from the VTA: the planner proposes the K9 crew LÕUNA 82, nine minutes away; the
  scent is 30 minutes old and the night is dry. At 22:19 the dog has the track along the Emajõgi bank, heading
  north-east. The VTA follows the track and the ring gets a cone towards Annelinn.
- **22:24.** The cone points at Karl Pärn's address. **Varitsus** (stake-out) at Kaunase pst 10 with LÕUNA 84, the
  unmarked criminal police car. The player releases the roadblock, because a P1 domestic just came in from
  Tähtvere and there is no other free crew.
- **22:31.** **Taotle tagaotsimist** for Rasmus Kask. The request shows its grounds: identified by isikukood (yes),
  linked to a crime in this shift (the stolen car of his household: yes), fled from police (the pursuit: yes),
  home address checked (no), seen by a witness or a crew (no). Three of five: the valveprokurör approves at 22:52.
  Rasmus's record now reads TAGAOTSITAV, and from now on a crew's check of him should be answered „Tagaotsitav“.
- **23:12.** A figure in a black hooded jacket walks up to Kaunase pst 10. LÕUNA 84: „Objekt saabus, kas peatame
  või jälgime?“ The player answers **Peata**. Detained. The case closes: *kinni peetud*.
- **Report, Tagaotsimised:** T-1, 312 MKT and Rasmus Kask, opened 21:40, detained 23:12 (92 min), 3.4 crew-hours,
  4 leads (3 true, 1 false), one lookout and one request, both right, nobody innocent stopped. Case score 86, counted
  in the shift score like a P2 incident.

The other evening: at 21:44 the player gives a dangerous lookout on Karl Pärn, the co-offender, on no grounds but a
hunch. At 22:40 LÕUNA 12 stops Karl at gunpoint on his way home from work. At 01:10 SISEKONTROLL reports his
lawyer's complaint, and the next morning's paper leads with „Politsei pidas relvaähvardusel kinni vale noormehe“.
Rasmus sleeps at Karl's and is never found that night; the case goes cold.

### 4.2 A missing-person search, from the 112 call to the report

Lõuna prefecture, Viljandimaa desk, a Sunday in early November, 15:40, 4 °C, drizzle, sunset in under an hour.

- **15:40.** A 112 call: „Mu isa on kadunud, tal on dementsus.“ Heino (81) left his house in a village near
  Viljandi an hour ago in a light jacket. The call-taker's questions give the anchors: „Kas tal on telefon kaasas?“
  „Jah, taskus.“ „Kuhu ta võiks minna?“ „Ta räägib kogu aeg vanast talust, kus ta üles kasvas, see on teisel pool
  metsa.“ The player creates a P2 missing-person incident; Heino's record shows KADUNUD.
- **15:43.** The incident offers **Ava otsinguplaan**. The starting point is the home. Category: person with
  dementia. The planner draws 24 segments in four rings (0.3, 0.8, 1.8 and 5 km) and six directions, shaded by
  probability: roads and ditches near the home are darkest, and the old farm's segment, now known from the call,
  is darker still. A strip says „Päike loojub 50 min pärast · +4 °C · vihm“, and the critical-time band reads
  „õhtu“ (a few hours, not a countdown).
- **15:45.** **Positsioneeri telefon** (life at risk): the vahetuse vanem approves at 15:47, the operator answers at
  15:58 with a cell wedge north-east of the village, 1.2 km wide. The wedge's segments darken; it covers the farm.
- **15:50.** LÕUNA 31 searches the roadside segments; LÕUNA 32 takes the path through the wood towards the farm.
  The K9 crew is in Tartu, 45 minutes away; the player sends it anyway with Heino's cap as the scent item. The
  player asks for volunteers (they assemble in about 75 minutes) and, with the career's drone, puts the drone on the
  forest edge, flown by LÕUNA 31's crew.
- **16:35.** Dusk. The patrols lose sharpness (x0.7 at night); the drone's thermal camera gains. The planner's
  probability of success climbs to 0.64.
- **17:05.** The drone sees a warm figure by a fallen fence near the old farm. LÕUNA 32 reaches him at 17:12: alive,
  cold and confused. The ambulance takes him in. Found inside the critical time: „alajahtunud, haiglasse“.
- **Report:** the incident's outcome, plus a search line: found after 1 h 32 min, probability of success at the find
  0.71, 2.6 team-hours, positioning justified, volunteers stood down before they arrived.

Had Heino left his phone at home (one of the template's own variants), the wedge would have pointed at his house.
Reading the card matters.

### 4.3 Pacing inside an eight-hour shift

- At shift start the BOLO bulletins (already generated today) become dormant hidden targets. Most lie low and give 0
  to 2 leads all shift: a slow B-plot for the quiet hours.
- About one hot case per eight hours on normal difficulty arises from play: an escaped pursuit, a suspect who ran
  from a scene (the `escaped` outcome), a missing-person call. The player can also open a case on any record.
- A case has three phases: **kuum** (hot, 0 to 60 min: small ring, fresh scent, roadblocks work), **jahtuv**
  (cooling, 1 to 3 h: big ring, leads trickle, stake-outs matter) and **külm** (cold: handed to criminal police at
  shift end, or kept in a career).
- Caps: 2 hot cases at once (3 on Veteran), 8 cases in all, about 6 lead events per case and hour.
- A case never keeps the shift in overtime by itself. An open pursuit or a P1 still does, as today.

## 5. The parts

### 5.1 Andmebaas: finding the right record

The search field gets a mode row: **Isik · Sõiduk · Aadress · Kirjeldus**. Everything fits the 380 to 470 px side
panel.

- **Partial plates.** `4?? BK?`, `*BK`, `312 M*`: `?` is one unknown character, `*` any run. "Loose match" also
  accepts the ANPR misread pairs from vehicles-plates.md 10.1 (8/B, 0/D, 5/S, 2/Z, 1/7). Results say „number sobib
  5/6“.
- **Vehicle by look.** Make, colour and kind as chips („hall · Toyota · universaal“). With a partial plate this
  narrows 60 cars to a handful.
- **Address.** `Kalda tee 12` lists the residents, the cars registered to them and this shift's incidents there.
  Before a domestic call it also shows weapon permits at the address: a real pre-dispatch check.
- **Description** (phase 4). Gender, age band, height band, build, hair, beard, glasses, a tattoo word; every field
  maps onto the existing `Appearance` type. Clothing matches only this shift's sightings (people change clothes),
  and the card says so. A description search is broad, so it needs a basis (5.7).
- **Owner to vehicles and back**: already a link on the card, now also a query.
- Results are sorted by a match score with reason chips („number sobib · värv sobib · vanus sobib“), never by truth.
  `MAX_RESULTS` stays 30, so a vague query asks the player to narrow it.

**Seosed (links).** A new section on the person card, a compact list:

| Chip | Meaning | Source (new in phase 2) |
|---|---|---|
| sama aadress | lives at the same address | generated households |
| pereliige | relative at another address (same surname, linked) | generated households |
| kaasosaline | co-offender in a past record | generated record pairs |
| sõiduki kasutaja | drives a car owned by someone else | `Vehicle.responsibleUserId` (vastutav kasutaja, vehicles-plates.md 10.2) |
| sündmus täna | in an incident this shift | the shift's incidents |

The generator has no households or co-offenders today; `src/sim/hunt/links.ts` adds them after `populateRegistry`
on a stream of its own (section 9.4), so no seed's population is reshuffled. Each chip opens the linked record on
the existing breadcrumb trail.

**ANPR history.** A vehicle card shows the camera passes of this shift („Numbrituvastus: 3 läbimist“, each with the
camera, the time and the direction) only while the plate is linked to a crime case. That is also the rule of the
2025 law (section 8). A car that becomes a case mid-shift (a pursuit's car) gets its route since the shift start
filled in from the case's stream, ending where it was first seen, and that route starts near one of its driver's
anchors: where the car came from is itself a hint.

**Identification puzzles** (phase 4). A case built to be solved by searching places its true subject among 3 to 6
decoys that share the visible facts (same make and colour, an overlapping plate, a similar age), and 1 or 2
*nimekaimud* (namesakes) in other towns. Exactly one registry fact breaks the tie: a link to the scene's area, a
record matching the crime, a "front damage" note after a hit-and-run. Templates: a hit-and-run with a partial plate;
a shop robbery with a description; a stolen car whose driver is the owner's son; a missing teenager whose phone is
registered to a parent.

### 5.2 The case file (toimik) and the levers

**Toimik** is a third mode of Andmebaas, **Otsitavad** (F7), not a seventh tab: the tab bar is full. The case list
is on top, one open case below:

```
T-1  312 MKT · Škoda Octavia, hall       AKTIIVNE · 0:26
Juht: tundmatu · noormees, must kapuutsiga jope
Orienteering 21:42 · ANPR jälgimisel      [Taotle] [Tühista]
VTA 22:06 Kalda tee (LÕUNA 13) · jalgsi · ala 1,4 km
Vihjed
  22:19 K9 jälg Emajõe kaldal, suund KI          A
  22:14 112: „jooksis Ropka poole“               C  [Kinnita VTA] [Kontrolli]
Postid
  Teetõke Riia mnt / Ringtee · LÕUNA 11 · 33 min  [Vabasta]
  Varitsus Kaunase pst 10 · LÕUNA 84 · 4 min      [Vabasta]
```

Every record card and every case has an action bar. The levers, from cheap to formal:

| Button | Who decides | Wait (day / night) | Effect | Registry truth? | If wrong |
|---|---|---|---|---|---|
| **Anna orienteering** (lookout) | JK | none | bulletin with the case id, radio line to all crews, a display flag ORIENTEERING on the record; crews passing the target notice it 4 times as often for 60 min (renewable) | no | an innocent stopped: `hunt_false`, heavier when "ohtlik" was ticked |
| **Seo sõiduk kuriteoga** (vehicle linked to a crime) | vahetuse vanem | 3-6 / 4-8 min | `Vehicle.flags.wanted` (OTSITAV) at last set by something; fixed cameras watch the plate; crews stop it | yes | the owner stopped: the existing `false_alert` |
| **Taotle tagaotsimist** (request wanted status) | valveuurija and valveprokurör | 15-30 / 25-45 min | `Person.flags.wanted` with the case id and an authority („Lõuna Ringkonnaprokuratuur“); his cars on the watch list; an SIS alert, so the external border stops him; a bulletin mid-shift | yes | the wrong man detained: `unfounded_detention` keyed to the case |
| **Positsioneeri telefon**, life at risk | vahetuse vanem, then the operator | 2 + 5-12 / 2 + 8-20 min | a cell wedge on the map | no | an adult who left of their own will: `unfounded_positioning` |
| **Positsioneeri telefon**, suspect | prosecutor and court | 30-60 / 45-90 min, often refused | a wedge, then every 30 min while the phone is on | no | none (the court checks) |
| **Meediapöördumine** (public appeal) | vahetuse vanem with the family's consent (missing), prosecutor (suspect, formal status first) | 8-15 min | „Politsei palub abi“: tips about 4 times as often for 2 hours, mostly noise; a suspect is warned and reacts | no | not withdrawn after the find: `appeal_left`; an innocent's photo: trust and a news item |
| **Vabatahtlikud** (volunteers) | vahetuse vanem | 5 min, then 60-120 min to assemble | a volunteer line for the search planner, daylight best | no | refused for a dangerous suspect |
| **Tühista** (cancel) | JK | none | ends the lookout or withdraws the request; free before the first stop | | |
| **Leitud** (found) | JK | none | closes a vehicle or missing-person case | | a forgotten alert on a found car: `stale_alert` |

Notes:

- **Grounds** are a checklist the sim evaluates from state, never from truth: identified by isikukood; linked to a
  crime incident of this shift (named in it, owner or household of its vehicle); fled from police or failed to
  appear; home address checked empty; seen by a witness or a crew. Identification is required, and three of five
  are enough. A well-argued case against a decoy is approved, and that hurts. A request with too few grounds comes
  back after half the wait: „Alus puudub: isik on tuvastamata.“
- **Options on a lookout or a request**: *ohtlik* (dangerous: high-risk stops, a safer arrest, a much worse wrong
  stop) and *relvastatud* (armed: rapid response preferred, volunteers barred).
- **Being too timid costs too.** A dangerous fugitive with no lookout for an hour may cause a follow-up incident
  linked to the case (another burglary, a car taken at a fuel station), told soberly.
- **Wording.** The owner's „teha tagaotsitavaks“ is the request button. The JK's own lever is the *orienteering*
  (open question 1).

### 5.3 The hidden target

Every case has a hidden actor in the deterministic world. It moves in planned **legs**, not per-tick steps: a leg is
a path, a departure and an arrival time, and the position is a pure function of the leg and the clock, exactly like
`Unit.move`. State changes only when something happens.

**Profiles** (`src/data/fugitives.ts`), chosen from the record and the links, so the player can read them:

| Profile | Telegraphed by | Behaviour | Under pressure |
|---|---|---|---|
| `koju` (homebody) | young, local, first record | heads home or to a parent within 1 to 2 h | goes to ground 30 to 120 min; runs on foot when a crew is under 0.5 km |
| `tuttav` (to a friend) | a co-offender or partner link | goes to a linked address and stays | walks past a marked car parked at the door |
| `piirile` (runner) | foreign citizenship, SIS note, relatives abroad, a serious wanted record | main roads towards a border crossing or the Tallinn port, 70 to 110 km/h | switches to a relative's car, leaves the main road |
| `peidab` (lies low) | long record, no local links | goes to ground in a forest, garage or summer house and waits | stays put |
| `sõitja` (joyrider) | stolen car, unknown young driver | 10 to 25 min loops in town | flees; a pursuit if a crew engages |
| `eksinu` (lost) | missing person: dementia, a child, a berry picker | walks 1 to 3 km/h along roads, paths or forest edges | none; the condition worsens with cold and dark |
| `tavaline` (ordinary) | an innocent picked without grounds, or a decoy | everyday trips: home, work, shops | stops when asked, and the stop has consequences |

**Anchors** (`src/sim/hunt/anchors.ts`) are the places the actor can go, each with an id: `home`, `rel.<personId>`
(household and relatives), `co.<personId>` (co-offenders), `veh.<plate>` (cars it may switch to), `place.<id>`
(fuel stations, bus stations, ports, border crossings), `call.<n>` (an anchor named in a 112 call or a template
detail, such as the childhood farm). The actor's goals come from the same list. A case shows an anchor once it is
revealed, and anchors are revealed by searching: open the mother's card and the son appears; open his record and the
co-offender's address appears. That is the answer to "search people and cars in the database": the search tells the
player where to put the stake-out.

**Movement.** On foot about 5 km/h for the first 20 minutes, then slower, with stops. By car, the units' own model
(km × 1.35 urban or 1.25 rural ÷ the profile's speed × the weather road factor) along a corridor graph built from
the `roads.json` the sim already ships (9.2). Every sample is checked with `isOnLand` and `zoneAt`, so an actor
reaches an island only by ferry, and the ferry is a lead.

**Tricks**, by difficulty: dumping the car (it becomes a lead), stealing another car (Veteran and up; a theft report
10 to 40 minutes later is a lead in itself), changing clothes (after a public appeal), avoiding known roadblock points
(Realistlik).

**Fairness.** Until the actor is pressed (a crew within its alert distance, a search circle around it, a roadblock
in sight, a public appeal), its path depends on the seed only. In a race room every player's BOLO car passes the
Kose camera at the same minute; the only difference is what each player does about it.

### 5.4 Leads, ANPR and the ring

**Lead sources:**

| Lead | What it gives | Delay | Reliability | Cost |
|---|---|---|---|---|
| Fixed ANPR camera | plate, camera, direction, time | 0 to 2 min | high; 3 % misreads one character off (opening the record shows the make and colour do not match) | none |
| In-car ANPR (the `anpr` upgrade, as its text promises) | the same, from any patrol or traffic car passing within 60 m | live | high | none |
| Crew sighting (*tähelepanek*) | position, direction, current clothes; the crew asks **Peata** (stop) or **Jälgi** (follow) | live | high; more likely with a lookout, less in the dark | the crew |
| 112 tip (*vihje*) | „nägin teda 10 min tagasi ...“ | 5 to 40 min | about half true with a lookout, a quarter after a public appeal | a crew to check it |
| Address check (*elukoha kontroll*) | found (he may flee on foot), „naaber nägi teda 40 min tagasi lahkumas“, or nothing | 5 to 10 min on scene | true | a crew; a community officer finds a clue twice as often |
| K9 track | direction, a VTA moving along the track | live | high while the scent is under 2 to 4 h old; rain kills it | the dog crew |
| Phone positioning | a cell wedge: hundreds of metres in town, kilometres in the country | see 5.2 | high while the phone is on | grounds |
| Ferry or port query | „Kas 312 MKT sõitis Virtsu praamile?“ (tickets are bound to the plate) | 2 min | exact | none |
| AI colleague | a sighting in the neighbouring sector | live | high | none |
| Border | a formally wanted person stopped at an external border crossing | at arrival | exact | none |

**Grades.** Each lead has a grade from A to D. On Kadett and Tavaline it is printed; on Veteran and Realistlik only
the source and the details are shown, and the player judges: is the time lag plausible, is the place inside the
ring, does the description match?

**The VTA and the ring.** The map shows the VTA pin („viimati nähtud 22:06 · 18 min tagasi“) and a ring whose radius
is the farthest the current mode can reach since then, clipped by the sea and by zones the actor cannot reach
without a ferry. A camera hit, a crew sighting or a crew's find moves the VTA by itself; a tip moves it only when the
player presses **Kinnita VTA**. Pinning a false tip moves the ring to the wrong place: the player's own visible
mistake. The ring is never clipped by roadblocks, because a roadblock stops a car only most of the time. Two camera
hits on one road or a K9 track add a direction cone. On Kadett a soft shading inside the ring leans towards the
revealed anchors; elsewhere only the ring is shown.

**Cameras** (`src/data/anpr.ts`): about 10 to 16 per prefecture at generic points: the main-road exits of the
largest towns, the road border crossings (Narva, Koidula, Luhamaa, Ikla, Valga) and the ferry and port gates
(Tallinn, Virtsu, Kuivastu, Rohuküla, Heltermaa). The real network is much denser (section 8); the game keeps a few
for readability and speed. The file header says the positions are invented, and the map labels them "ANPR" only.

**The watch list** is registry truth only: stolen cars, cars with `Vehicle.flags.wanted`, and the cars of a person
with `Person.flags.wanted`. A lookout alone puts nothing on the cameras; „Seo sõiduk kuriteoga“ does. Every pass is
recorded for the ANPR history whether the plate is watched or not. One radio line per camera and case in 10 minutes
at most, and hit toasts rank below P1 so they never push one out.

### 5.5 Actions in the field

- **Peata või jälgi.** A crew that sees the target asks. Stop opens a stop incident with the real person or plate
  (the existing query beat checks it, and the existing answer path closes the case when the arrest is the target).
  Follow keeps the target in view and reveals its goal anchor when it arrives, with a small chance each minute of
  losing it. No answer in a minute counts as follow. A car that flees starts the existing pursuit, from the code
  this time (DESIGN 4.6 has promised "started by a pursuit beat or ANPR hit" since the start).
- **Teetõke (roadblock).** Placed on a *tõkkepunkt*: precomputed road points at junctions, bridges and town exits
  near the corridor graph. The planner suggests the 2 to 4 best points ahead of the ring. A target car passing is
  stopped about 60 % of the time with one crew, 85 % with two, 95 % with spikes. A dangerous driver may ram through,
  which starts a pursuit. A driver who sees it from 300 m turns back. A main-road roadblock held over 45 minutes draws
  small traffic complaints; it is released after 60 minutes unless extended.
- **Varitsus (stake-out).** Placed on a revealed anchor's address from the record card. A marked car catches a
  visiting fugitive about 35 % of the time (he sees it), an unmarked criminal police car about 80 %. Stake-outs never
  end by themselves; the case lists every post with its age.
- **Elukoha kontroll (address check).** 5 to 10 minutes on scene; it is also one of the grounds for a request. A
  dangerous or armed target needs two crews or rapid response; one crew alone raises the risk of an officer hurt.
- **Otsinguplaan (search planner).** For missing persons, for suspects who fled on foot, and after a car is found
  abandoned. Opening it switches the map into planner mode (on a phone, to the map pane).
  - The starting point is a point already in the state: the home, the incident, the VTA, a lead, a wedge's centre.
  - The area is 4 rings × 6 directions = 24 segments, plus "elsewhere". Ring radii by category (DESIGN values in the
    spirit of the published lost-person statistics, to be checked before tuning):

    | Category | 25 % | 50 % | 75 % | 95 % |
    |---|---|---|---|---|
    | Child 1-6 | 0,2 | 0,5 | 1,0 | 2,5 km |
    | Child 7-12 | 0,4 | 1,0 | 2,0 | 5 km |
    | Person with dementia | 0,3 | 0,8 | 1,8 | 5 km |
    | Berry or mushroom picker, hiker | 1,0 | 2,5 | 5,0 | 10 km |
    | Despondent adult | 0,3 | 1,0 | 2,5 | 7 km |
    | Suspect on foot | along the VTA's cone, 0,5 to 3 km by the minutes since the VTA |

  - The prior (POA, probability of area) gives the rings 25/25/25/20 % and "elsewhere" 5 %, tilted by terrain
    (forest x1.5 for walkers, roads x1.3 for dementia, built-up x1.2 for children, water x0.5) and by clues: a K9
    direction x2 in its wedge, a phone wedge x4, an anchor from the call x3, a tip x3 (true or false), a found item
    x5. The true segment is drawn from exactly this prior on the case's stream, so the shading is honest.
  - Teams are assigned by clicking a segment and a crew. Each team adds coverage `C` per minute; the chance of a find
    in that minute, if the person is there, is `1 - exp(-dC)`, rolled on the case's stream. After each pass the POA
    updates (the segment's share falls by its detection chance, the rest is renormalised). A target that moves
    (dementia, a fugitive) drifts to neighbouring segments by the same rule the planner uses, every 10 minutes. The
    header shows the probability of success so far and per hour.
  - Teams (game values, tuned so a search ends in 30 to 120 game minutes; real sweep widths are smaller):

    | Team | Sweep | Strong | Weak |
    |---|---|---|---|
    | Patrol pair | about 0,5 km² an hour | yards, road edges, buildings | x0.7 at night |
    | K9 | tracks from the start point while the scent is under 2 to 4 h old; about 1 km² an hour as area search | the first hours, forest | rain kills the scent; needs a scent item |
    | Helicopter (the on-call unit) | about 10 km² an hour, thermal | night, open land, coast | grounded in fog or storm; 15 min lift-off plus flight |
    | Drone (the `drone` upgrade, flown by a crew on scene) | about 2 km² an hour, thermal, 35 min a battery | night, forest edges, bog | no flying in rain, storm or strong wind |
    | Volunteer line (about 20 people with a patrol in charge) | about 3 km² an hour | daylight forest and fields | 60 to 120 min to assemble; never for an armed suspect |

  - A strip gives the conditions: „Päike loojub 16.12 · -4 °C · lumi: jäljed nähtavad“. Snow helps the ground
    teams, rain helps nobody, night favours thermal cameras.
  - For a missing person a **kriitiline aeg** (critical time) band comes from temperature, age and health: a child
    outdoors on a winter night has hours, an adult in summer has a day. It is a band, never a countdown. Found
    inside it: unharmed or „alajahtunud, haiglasse“. The planner adds no new death outcomes; a template's existing
    sober tragedy outcome stays as rare as it is.
  - A search still running at shift end is a report line („otsingud jätkuvad“).
  - Old template searches keep today's formula until the player opens the planner, which converts them.

### 5.6 Wrong calls and their fallout

The existing fallout system takes them, with an optional `caseId` and ids `h:<caseId>:<n>`:

| Kind | When | Comes back from |
|---|---|---|
| `hunt_false` (new) | an innocent stopped on a JK lookout | SISEKONTROLL, a complaint; heavy when "ohtlik" |
| `unfounded_detention` (existing) | a wrongly granted wanted status leads to an arrest | ARESTIMAJA |
| `false_alert` (existing) | the owner of a wrongly linked car stopped | SISEKONTROLL |
| `stale_alert` (new) | a found car's alert not cancelled | the owner, later |
| `unfounded_positioning` (new) | positioning an adult who left of their own will | VALVEKORRAPIDAJA |
| `appeal_left` (new) | a public appeal not withdrawn after the find | the family, a news item |
| `unjustified_query` (new) | the audit (5.7) | SISEKONTROLL |
| `missed_wanted` (existing) | a crew's check of the target answered wrongly | as today |

Points follow the existing scale (1 to 4 shift-score points and some trust each).

### 5.7 Päringu alus: data protection and the audit

Police databases log who looked at which record, and officers have been disciplined for private look-ups. The game
makes that rule playable.

- Every registry query and every record opened logs a **basis** (`QueryLog.basis`): an incident, a call, a crew's
  radio query, a bulletin, a case, a tip, or none.
- The basis fills itself in almost all normal play: from the selected incident, the call card, the radio query,
  the bulletin or the case the record was opened from.
- It counts only when the record really belongs to it: a person or car in that incident or call, a case's target or
  one of its anchors, a bulletin's subject, a match of a description given in it. Selecting an incident and then
  searching anybody does not count.
- At shift end the **sisekontroll** audit flags records opened with no fitting basis, and broad searches (address,
  description) with none. Each shift seeds 1 to 3 sensitive records: a fictional celebrity in today's news, the
  story's reporter, the AI colleague at the neighbouring desk. Opening one without a fitting basis costs more.
- The first flag in a shift is a note. Each further flag costs 1 shift-score point and 1 trust (at most 5); a
  sensitive record 3. The report says „Põhjendamata päringud: 2“.
- In a career, marks persist: 3 bring a *noomitus* (reprimand) in the inbox and Staatus -2; 6 freeze promotion for
  three shifts; a clean month earns one back.
- The legends still unlock their achievement; the audit only jokes: „Okimumi päring on arusaadav, teda otsivad
  kõik.“
- A setting **Andmekaitse audit**: on in career, off in quick play, the daily challenge and the tutorial, so
  curious players can explore. In co-op the note names the seat.

### 5.8 Difficulty, scoring and the report

| | Kadett | Tavaline | Veteran | Realistlik |
|---|---|---|---|---|
| Lead grades | printed, A leads move the VTA by themselves | printed | source only | source only |
| Shading in the ring | towards revealed anchors | none | none | none |
| False tip share | low | normal | high | high |
| Fugitive tricks | none | clothes | clothes, car theft | all, avoids roadblocks |
| Request waits | x0.5 | x1 | x1 | x1.5 |
| Wrong-call cost | x0.5 | x1 | x1 | x1.5 |

**Case score**, 0 to 100: outcome 40 (detained, found alive), time against a par set by the profile 20, crew-hours
against par 15, decisions 15 (right lookouts and requests, A and B leads chased, D leads ignored, timely cancels),
safety 10 (no innocent stopped, no crash, no officer hurt). The shift score is a priority-weighted mean of closed
incidents (scoring.ts:294); each case enters it once, with weight 3 for a dangerous fugitive or a missing child and
2 otherwise. The case's own posts and search incidents are left out of the mean, so nothing counts twice. Ordinary
calls that expired while their crews sat on roadblocks still count against the shift, which keeps the hunt from
swallowing it.

**Report**: a section **Tagaotsimised**: case, target, opened, outcome, minutes, crew-hours, leads (true and false),
lookouts and requests (right and wrong), case score. Fallout lines stay in the fallout section. The newspaper can lead
with a capture („Kolm tundi kestnud otsing Tartus lõppes kinnipidamisega“) or with a mistake.

**Achievements**: *Kuldne tund* (detain within 30 minutes of the case opening), *Koera nina* (a K9 track leads to the
find), *Kolm märki* (identify a car from three plate characters), *Puhas leht* (three or more lookouts or requests in
a shift, none wrong), *Enim otsitud* (catch a board fugitive at the highest heat).

## 6. Careers: the Enim otsitud board

- A case still open at the end of a career shift offers a choice: **Anna üle kriminaalpolitseile** (the case closes,
  a little XP) or **Jäta tahvlile** (keep it on the board).
- The **Enim otsitud** (most wanted) board on the career page holds up to 8 fugitives, each with a generated portrait
  (the existing avatar), plate, reason, days on the run, last sighting and a heat of 1 to 5. Heat rises with time on
  the board and with each new crime.
- In each career shift in the same prefecture a board fugitive may resurface with a lead (about 25 to 40 % a shift,
  more with heat). The identity is injected into that shift's registry with the same name, isikukood, record and
  links, so the player meets an old acquaintance.
- A formally wanted case not closed by shift end can be decided by the court overnight: the next briefing lists
  „tagaselja vahistatud, Tartu Maakohus“.
- A capture pays Staatus +2 to +5 and a prefect's bonus of 500 to 2 000 €. After 10 shifts on the board a case ages
  out: „Läti politsei pidas kinni“ appears as a news item, with no reward.
- A light nemesis: a recurring car thief with a pattern (always Audis, always nights, always the same district) the
  player learns across shifts.
- Audit marks persist (5.7).
- Story: a new objective kind `capture` for a later chapter. Chapters 1 to 5 keep their objectives, so no career's
  progress moves (open question 8).
- Only single-player career shifts carry anything. Co-op, race and daily shifts never do.

## 7. Multiplayer

### 7.1 Role co-op

- **Raadio ja registrid** becomes the analyst: owns the toimik, the searches, lookouts, requests, cancels, the ferry
  and positioning queries, and pins the VTA. It cannot move crews, but it can post a **plaan** (a roadblock here, a
  stake-out there, these segments) that appears in the dispatcher's panel.
- **Dispetšer** approves the plan with one click or edits it, and balances it against the queue: posts, address
  checks, search teams.
- **Kõnevastuvõtja** takes tip calls as interactive 112 calls with new questions („Mis tal seljas oli?“, „Kuhu ta
  läks?“, „Millal see oli?“, „Kas nägite numbrit?“) and grades the tip A to D; the grade goes into the toimik.
- The vahetuse vanem, the investigator and the prosecutor stay NPCs. A fourth "lead" seat does not fit: rooms hold at
  most four seats, and the law should not be argued away by a friend.

### 7.2 Sector co-op

- A case is prefecture-wide (desk `''`, like a general radio message): everyone sees it.
- Its posts and searches are incidents and belong to the desk of the sector they stand in; neighbours' crews join
  only through the existing lend.
- Each lead goes to the desk of `sectorAt(lead.pos)`, like `msgDesk`. Neighbours see the ring dimmed on their side.
- When the VTA moves into a sector a player holds, that desk gets a prompt like the pursuit hand-over.

### 7.3 Race and the daily challenge

Every player gets the same BOLO targets with the same unpressed paths. Each player's actions press them differently,
so the hunts diverge. Case scores count in the shift score like any incident. The same day's daily challenge must
run one version of the rules (open question 4).

### 7.4 Tagaotsitav, the asymmetric mode (last phase)

*Tagaotsitav* means "the wanted one". One player is the fugitive; one to three players run the JK.

- **Setup.** The fugitive picks one of three character cards. Each card is a full registry record with records,
  links and anchors, and the police get the same record, so each side knows what the other can know. The goal: reach
  an exit before a deadline (the Tallinn port gate before a sailing, the Ikla border, the Virtsu ferry to a Muhu
  summer house) or stay free until the round ends. A round is 2 to 3 game hours at a fixed slower speed, about 20 to
  30 real minutes.
- **Fugitive screen.** A stripped map: their own position and the roads; police units only within sight (about
  400 m in town, 1 km on an open road; the helicopter heard within 3 km); the known camera sites; a *jälg* (trail)
  meter for how fresh the police's information probably is. Actions with cooldowns: drive to a clicked point, ditch
  the car, steal a car at a car park (5 minutes; reported 10 to 40 minutes later), change clothes once at a shop, lie
  low, switch the phone off (the last ping becomes a lead).
- **Police screen.** The normal game with the toimik at a reduced call rate, so ordinary work still competes for
  crews. Every lead comes from the sim's rules applied to the fugitive's real track.
- **Rules of taste.** No weapons, no hostages, no harm to bystanders. Ramming a roadblock only starts a pursuit.
  Capture is by pressure, as in pursuits today.
- **Win.** An exit reached or time out: the fugitive wins. Captured: the police win. Both sides earn XP, with bonuses
  for clean play.
- **The catch.** Today every seat receives the whole state, and a modified client can already read
  `pursuit.suspectPos`. This mode needs the game server to keep one shadow per side and leave the actor out of the
  police patches and unseen units out of the fugitive's. The lockstep fallback cannot hide anything, so the mode
  runs on the game server only, and it needs a coordinate argument shape for the fugitive's clicks.

## 8. Realism notes

Confidence tags as in docs/research: [VERIFIED] seen in a source, [LIKELY] strong prior or search snippets,
[UNSURE] plausible but unchecked, [DESIGN] a game choice. No law paragraph numbers are given on purpose; check Riigi
Teataja before legal wording reaches players. A research note `docs/research/manhunt.md` should settle these before
phase 2.

| Topic | How it is | In the game |
|---|---|---|
| Who declares someone wanted | In criminal procedure the investigative body or the prosecutor's office declares a suspect who evades the proceedings wanted, and a court can order arrest in absentia. Court rulings show a county court declaring an absconding convict wanted with arrest on capture, and a pre-trial judge arresting a wanted suspect at the prosecutor's request. The police's duties include searching for missing and wanted persons. The JK declares nothing. [LIKELY; the provisions are UNSURE] | the JK gives a lookout and requests; NPCs decide; the BOLO records already name a maakohus as authority |
| The lookout | A description broadcast to crews; "orienteering" is likely current jargon (from the Russian "ориентировка") [UNSURE] | „Anna orienteering“; fallback wording „ekipaažide teavitus“ |
| ANPR | PPA's camera network has more than 200 devices. In 2025 the Chancellor of Justice's office said the collection lacked a legal basis, the interior minister suspended its use, and the Riigikogu then amended the Police and Border Guard Act: images may be used in criminal proceedings, against serious threats and to locate wanted persons, not for traffic supervision, and photos are deleted after 45 days. [LIKELY from ERR reporting; dates and details to check] | cameras watch only stolen and wanted plates; the ANPR history needs a crime case; the shop text of the upgrade notes the 45 days. vehicles-plates.md 6.1 ("data kept 30 days", "dates and outcome UNSURE") should be updated |
| Phone positioning | Location data falls under the Electronic Communications Act; operators give the police real-time location in narrow cases of danger to life [LIKELY]. For a suspect it needs authorisation. The EU Court of Justice ruled in C-746/18 (2 March 2021) that the Estonian prosecutor's office could not authorise access to traffic and location data; the Riigikohus then held such data inadmissible (June 2021). How the law changed since is [UNSURE]. | life at risk: fast through the supervisor; suspect: slow, through prosecutor and court, often refused |
| Missing persons | The police get about 3 500 to 5 000 reports a year; most are solved by phone and enquiries, about a hundred need a terrain search. The police lead land searches, with volunteers, volunteer search dogs, drones, the helicopter and local hunters. There is no 24-hour waiting rule. [LIKELY, ERR] JRCC Tallinn coordinates at sea. [VERIFIED, ppa-organisation.md] Organised callouts of Kaitseliit or Päästeliit are [UNSURE]. | the planner; volunteers through the supervisor; the call card's hints matter |
| Assets | 3 AW139 helicopters, often one available, 15 min lift-off; 70 to 80 police dogs; drones [VERIFIED, ppa-organisation.md]; thermal drones in land searches [LIKELY] | as today's units, plus the drone flown by a crew |
| Borders | Latvia (Ikla, Valga) and the Tallinn to Helsinki ferries are internal Schengen borders without routine checks; Narva, Koidula and Luhamaa are external border crossings with border control. [LIKELY] | a formally wanted person (SIS) is stopped at an external crossing; leaving through Latvia or the port is "lost abroad" unless a camera hit lets the player act; a foreign arrest comes between shifts |
| SIS and SIRENE | A hit on a foreign alert is confirmed with the issuing state through the SIRENE bureau before anyone acts; namesakes are a known source of wrong hits. [LIKELY] | phase 4: „Küsi SIRENE kinnitust“, the crew holds the person 10 to 60 min |
| Public appeals | „Politsei palub abi ...“, and when found, „Kadunuks peetud ... on leitud. Politsei tänab ...“ [VERIFIED as headline style]. A missing person's appeal goes out with the family's consent; a suspect's photo needs the prosecutor's [LIKELY] | as 5.2, with the withdrawal |
| Query logs | Database look-ups are logged; private look-ups have led to discipline [LIKELY; cases not checked]; the state portal's Andmejälgija shows some look-ups to the citizen [LIKELY] | 5.7 |
| Search theory | Probability of area, sweep width and detection follow international search-and-rescue practice; lost-person distances follow published statistics [LIKELY]; whether PPA uses them formally is [UNSURE] | 5.5, with game-speed numbers |

**Compressed on purpose:** approvals that are phone calls become request cards with a countdown; the player is also
the field commander and the search staff; grades, rings and percentages are game aids. **Never imitated:** the
registry stays the EPD Andmebaas (law-references.md 7: no POLIS name or look), no real camera list, no real procedure
guide.

## 9. Technical design

### 9.1 Data model (src/sim/types.ts)

One optional sub-state, like `colleagues` and `fallout`. A save without it plays exactly as today and makes no extra
draws. `SIM_VERSION` stays 2.

```ts
export interface ManhuntState {
  rng: number;                       // hashString(`epd-hunt:${seed}:${regionId}`), bound by withHunt()
  seq: number;                       // case numbers T-1, T-2 ...
  cases: Record<string, HuntCase>;   // at most 8 active
  order: string[];
  requests: HuntRequest[];           // newest last, at most 40
}
export type HuntKind = 'vehicle' | 'person' | 'missing';
export type HuntStatus = 'open' | 'lookout' | 'wanted' | 'caught' | 'found' | 'cancelled' | 'lost' | 'handed';

export interface HuntCase {
  id: string;
  number: string;                    // "T-1"; the report adds the prefecture prefix
  kind: HuntKind;
  key: string;                       // personId or plate: seeds the actor's stream
  personId?: string;
  plate?: string;
  status: HuntStatus;
  origin: 'bulletin' | 'jk' | 'pursuit' | 'escaped' | 'call' | 'career';
  originIncident?: string;
  openedAt: number;
  closedAt?: number;
  lookout?: { at: number; until: number; dangerous: boolean };
  vta: { t: number; pos: LngLat; mode: 'car' | 'foot' | 'transit' | 'hide'; by: string };
  cone?: number;                     // heading in degrees, when known
  revealed: string[];                // anchor ids
  leads: HuntLead[];                 // newest last, at most 24
  posts: string[];                   // incident ids: roadblocks, stake-outs, checks, stops, searches
  score?: number;                    // set when closed
  seat?: number;                     // co-op: who opened it
  actor?: Fugitive;                  // hidden truth
}
export interface HuntLead {
  n: number; t: number; pos: LngLat;
  how: 'anpr' | 'carcam' | 'crew' | 'tip' | 'check' | 'k9' | 'phone' | 'ferry' | 'colleague' | 'border';
  grade: 'A' | 'B' | 'C' | 'D';
  camId?: string; unitId?: string; heading?: number;
  confirmed?: boolean;
  decoy?: true;                      // hidden: a false tip
}
export interface Fugitive {
  profile: string;                   // src/data/fugitives.ts
  mode: 'car' | 'foot' | 'transit' | 'hide';
  plate?: string;                    // the car in use, may differ from the case's
  leg: { path: LngLat[]; cum: number[]; departAt: number; arriveAt: number };
  goal: string;                      // anchor id
  restUntil: number;
  cams: { id: string; t: number }[]; // crossings of this leg, worked out at plan time, ascending
  seen: { id: string; t: number }[]; // past passes, at most 12 (the ANPR history)
  pressedAt?: number;
  rng: number;                       // hashString(`epd-hunt:${seed}:${key}`)
}
export interface HuntRequest {
  id: string; caseId: string;
  kind: 'vehwanted' | 'wanted' | 'position' | 'appeal' | 'volunteers' | 'sirene';
  at: number; answerAt: number;
  grounds: string[];                 // the grounds met when asked, shown on the card
  answer?: 'yes' | 'no';
  reason?: Text;
}
```

Smaller optional additions:

- `SearchState.plan?`: `{ caseId?, ipp, category, rings, poa, cov, teams, drone?, cleared? }`: the start point, the
  category, 4 ring radii, 25 POA shares (24 segments and "elsewhere"), 24 coverage sums, unit id to segment, the
  drone's crew. Without it, the old formula.
- `Person.links?: { id: string; kind: 'home' | 'rel' | 'co' }[]`, `Vehicle.responsibleUserId?`, `CriminalRecord.withId?`.
- `Bulletin.caseId?` and `Bulletin.status?` (`active`, `found`, `cancelled`); `RadioMsg.caseId?`.
- `QueryLog.kind` gains `'address' | 'look' | 'desc'`; `QueryLog.basis?: { k: string; ref: string }`.
- `Fallout.caseId?`; `FalloutKind` gains the new kinds of 5.6.
- `GameEvent.type` gains `'hunt_lead' | 'hunt_closed'`; `ShiftStats.hunt?`; `ShiftReport.hunt?`.
- `CareerProfile.wanted?` (the board) and `CareerProfile.auditMarks?`; `NewShiftOptions.carry?`.

### 9.2 Modules

| File | Holds |
|---|---|
| src/sim/hunt/index.ts | `initHunt`, `updateHunt`, `settleHunt`, `ensureHunt`, `withHunt` |
| src/sim/hunt/cases.ts | opening, lookout, cancel, close, case score |
| src/sim/hunt/move.ts | `planLeg`, `fugitivePos`, `crossings`, replans and pressure |
| src/sim/hunt/anchors.ts | `huntAnchors`, `huntReveal` (called from `registry.logQuery`) |
| src/sim/hunt/leads.ts | cameras, in-car ANPR, crew sightings, tips, colleagues, border |
| src/sim/hunt/posts.ts | roadblocks, stake-outs, address checks, stops |
| src/sim/hunt/requests.ts | grounds, waits, answers |
| src/sim/hunt/sar.ts | segments, POA, coverage, drift, critical time |
| src/sim/hunt/audit.ts | query basis and the shift-end audit |
| src/sim/hunt/links.ts | households, relatives and co-offenders after `populateRegistry` |
| src/sim/corridors.ts | the road segments moved out of pursuit.ts, a lazily built graph (endpoints within 50 m joined), `corridorRoute` (Dijkstra), the road points for roadblocks |
| src/data/anpr.ts, src/data/fugitives.ts | cameras and profiles, with tests |
| src/data/incidents/system.ts | `SYSTEM_TEMPLATES`: `sys:hunt_stop_person`, `sys:hunt_stop_vehicle` (one query beat each), `sys:hunt_post`, `sys:hunt_search`; merged into `TEMPLATE_BY_ID` only, never `TEMPLATES`, so the spawner, `helpTemplates` and the catalogue tests (weight > 0, places) never see them |

### 9.3 Commands

Each command is a pure function, with a `run()` case, a `COMMAND_ROLE` entry, a `deskAllows` rule, the same shape in
`server/mp/validate.ts` and `server/lib/coop.php`, and a wrapper in `src/ui/game/actions.ts` (`coopIssue` first, else
`run`). The target id comes first, because `usePending` keys on it. Map points are ids of things already in the state
(road points, anchors, leads, segments), so no coordinate shape is needed before the asymmetric mode.

| Kind | Args (shapes) | Role | Desk (sector co-op) | Phase |
|---|---|---|---|---|
| `look` | target `ref`, kind `word`, danger `bit` | radio | any | 1 |
| `drop` | case `id`, reason `word` (found, wrong, done) | radio | any | 1 |
| `vta` | case `id`, lead `num` | radio | any | 1 |
| `post` | case `id`, kind `word` (block, stake, check, stop), unit `id`, point `ref` (road point or anchor id) | dispatch | desk of the point | 1 (block, stop), 2 (stake, check) |
| `unpost` | incident `id` | dispatch | the incident's desk | 1 |
| `req` | case `id`, kind `word` | radio | any | 2 to 4 |
| `plan` | incident `id`, start `ref` (anchor or lead id), category `word` | dispatch | the incident's desk | 3 |
| `team` | incident `id`, unit `id`, segment `num` (1 to 25) | dispatch | the incident's desk | 3 |
| `drone` | incident `id`, unit `id` | dispatch | the incident's desk | 3 |
| `tip` | call `id`, grade `word` | calls | the call's desk | 4 |
| `sug` | case `id`, kind `word`, point `ref` | radio | any | 4 |
| `fug*` | the fugitive's actions, with a new `pt` shape ([lng, lat] inside Estonia's bounds) | fugitive seat | none | 6 |

- Crew questions (stop or follow) and the prosecutor's answer use the existing `reply` with `RadioMsg.caseId` and a
  new branch in `handleRadioReply`.
- New search modes reuse `q` with new words (`address`, `look`, `desc`; plate wildcards inside `vehicle`). Today
  `run()` treats an unknown word as a NOOP. The basis travels as two optional arguments, which need a new optional
  `ref?` shape in both validators.
- Releasing a post is `unpost`, not `close`, so a post closes with no outcome and no score.
- A new test, `tests/command-tables.test.ts`, keeps `COMMAND_ROLE`, `COMMAND_SHAPES` and `EPD_COOP_KINDS` (parsed
  from coop.php) equal. Today no test does, and a kind missing from one table is silently refused on that engine.
- `SeatStats` gains `lookouts`, `posts` and `caught`, with `emptySeatStats`, `seatWork`, the digest string and
  `coopReport`.

### 9.4 Determinism

- **Streams.** `manhunt.rng` for engine helpers, bound into `s.rng` by `withHunt(s, fn)` exactly like
  `colleagues.withDesk` (colleagues.ts:136). Every `createIncident`, `moveUnit`, `startPursuit` and phrase call the
  hunt makes runs inside it. Each actor decides on its own `actor.rng`. Per-event rolls (a camera read, a search pass,
  a request's wait) use `hashString` of the seed, the case and the event, like fallout (fallout.ts:371). The links use
  `hashString(`epd-links:${seed}`)`. Nothing draws from `s.rng` directly, `rReg`, `rMisc` or `spawnRng`.
- **Shift start.** `initHunt` runs at the very end of `createShift`. It must not touch `rMisc`: `nextSpawnAt` is
  drawn from it right after the bulletins (engine.ts:167), so one extra draw would move the first call of every seed.
- **Substep.** `updateHunt` runs after `updateFallout` and before `updateColleagues`, inside try/catch. It returns
  at once when `s.manhunt` is missing or has no active case.
- **Camera crossings** are worked out when a leg is planned (point-to-segment distance under 120 m), so a car at
  120 km/h, which moves about 170 m in a 5 s substep, never slips past a camera. A test compares them with brute-force
  1 s sampling.
- **Fixed-schedule shifts** (daily, rooms). The hunt never touches `spawnRng`; its incidents are created outside
  `withSpawnStream`, so they number from 901 and the schedule stays the same whatever the players do.
- **Normal shifts.** A hunt incident takes the next `s.seq.incident`, and `makeIncident` forks by that number, so
  later incidents differ, as they already do after `endCall`. A BOLO target that is only watched creates no incident:
  a camera hit is a lead and a radio line, and only the player's stop order makes an incident.
- **Modes.** Director: no cases at shift start, commands allowed. Tutorial: off. Colleague sightings only where
  colleagues run.
- **Registry truth.** A lookout never changes `correctReply`; only a granted request does, through a sim event.
  Phase 0 makes `personReply` return `missing` itself and `truthReply` delegate to the registry, so SIS and
  `Vehicle.flags.wanted` count everywhere, and relabels the `ownerwanted` reply „Sõiduk või omanik otsitav“.

### 9.5 Saves and the digest

- The new fields are optional; `isValidSave` is unchanged; no `SIM_STEPS` entry. `ensureHunt` creates the sub-state
  when someone gives a lookout on a resumed older save.
- A golden fixture `tests/fixtures/saves/hunt/` holds an active case; the old fixtures still resume with no
  `manhunt`.
- Career: `CareerProfile.wanted` and `auditMarks` are normalised only when present (the `story` and `sectors`
  pattern); `CAREER_VERSION` stays 1; an upgrade-paths case proves the previous release keeps them. Carried records
  are inserted under ids `cc1` and onwards, so `seq.person` does not move.
- `simDigest` adds `h${rng}|${seq}` and, per case, `id:status:leads.length:posts.length:leg.arriveAt`, plus each
  plan's coverage sum, so drift in hidden movement shows within 10 turns.

### 9.6 Performance

| Item | Cost |
|---|---|
| Corridor graph | built once, about 900 nodes, a few ms; a route under 1 ms |
| Replans | every 10 to 60 game minutes per case, plus pressure |
| Camera crossings | at plan time: at most 16 cameras × 60 segments |
| Per substep | one time comparison per active case; once a game minute, units × cases distance checks (40 × 8) |
| Search plans | 25 + 24 numbers each, at most 2 active, updated once a game minute, rounded to 0.001 (or a `SLACK` rule for them in patch.ts) |
| State | about 1.5 kB per case, 12 kB for 8, against about 440 kB for a six-hour shift |
| Patches | only on leads, replans, posts and status changes; a replan sends one path of at most 60 points |
| Map | at most 192 lead points, 8 rings, 60 cameras and 25 segments, all GeoJSON, no DOM markers |

### 9.7 UI and map

- **Andmebaas.** The mode row and chips under the field (RegistryPanel.tsx:186-203); a third `Segmented` mode
  **Otsitavad** (`RegMode`, registryUi.ts:5) for the case list; a new `RegView` kind `'case'`; `CaseActions.tsx` (the
  action bar under the PersonCard and VehicleCard headers), `CaseFile.tsx` (stamp, status, leads, anchors with
  „Näita kaardil“ and „Otsi siit“, posts, ANPR history, linked incidents through `RelatedIncidents`). F7 opens it.
- **Teated.** A status chip and **Ava toimik** on each bulletin with a `caseId`.
- **Incident panel.** `SearchBlock` becomes `SearchPlanner` for planned searches: segments list with POA and POD,
  team chips (RecommendBlock's pick pattern), drone toggle, conditions strip, critical-time band. QueueCard shows a
  case tag (**T-1**) and the lead grade.
- **Map.** New sources in `SRC` and `OVERLAY_SOURCES`: `epd-anpr` (built once per region, like stations),
  `epd-hunt-leads` (fading with age), `epd-hunt-rings` (VTA pin, ring and cone), `epd-hunt-plan` (segments, shaded),
  `epd-hunt-points` (road points and anchors, shown while placing). Builders are pure functions in overlays.ts at
  the 500 ms cadence; tests/map-style.test.ts lists the ids. An **ANPR** toggle next to heat in MapToolbar.
  Clicking a lead or the VTA opens the case through a new `onHuntLead` handler.
- **Placing.** The director's arm, click, commit flow (directorStore.ts) is generalised: while a roadblock, stake-out
  or plan start is armed, the map shows the candidate points and a click on one commits the command with that
  point's id. Esc cancels it (useHotkeys.ts:99-110). Nothing commits a raw coordinate.
- **Radio and toasts.** A radio filter **Otsitavad**; a `ToastKind` `'hunt'` ranked below P1.
- **Phone.** The toimik lives in Info; „Näita kaardil“ and an armed placement switch `mobileTab` to the map.
- **Style.** Flat CAD panels and hairlines; classes `tl-case-*`, `gm-hunt-*`, `epdm-hunt-*`, with no class segment
  that starts with `ad` (tests/adblock-safe.test.ts). Strings in parts/tools.ts (`tools.case.*`, `tools.reg.find.*`),
  parts/game.ts (`game.hunt.*`), parts/map.ts (`map.hunt.*`, `map.anpr.*`), parts/coop.ts; sim text as `Text {et,
  en}`; radio phrases in radioPhrases.ts (`anprHit`, `crewSighting`, `prosecutorYes`, `prosecutorNo`, `huntCaught`,
  `searchCleared`, `borderStop`). No dashes; Estonian quotes; decimal comma.

### 9.8 Tests

- `tests/hunt-core.test.ts`: the same seed and commands give the same `simDigest`; an old fixture run for 2 hours
  gives the same digest as before; a lookout on a fixed-schedule shift leaves every incident below 901 identical;
  `initHunt` and the links leave the draws of `populateRegistry` and `addBulletins` and the first spawn time of 20
  seeds unchanged.
- `tests/hunt-move.test.ts`: legs stay on land, in the region and in reachable zones; crossings match brute-force
  sampling on 500 random legs.
- `tests/anpr-data.test.ts`: unique ids; every camera on land, in its region, within 300 m of a corridor.
- `tests/hunt-registry.test.ts`: a lookout leaves `correctReply` unchanged; a granted request changes it and a
  refused one does not; the truth is unified; `huntReveal` gives the same anchors in single player and through `q`.
- `tests/hunt-sar.test.ts`: template searches keep their found minute on fixed seeds; the shown POA equals the
  prior the truth is drawn from (a statistical test over seeds); a planned search never finds a target outside its
  segments.
- `tests/command-tables.test.ts`; additions to coop.test.ts, coop-sectors.test.ts and mp.test.ts.
- Headless play: the dispatcher bot in tests/sim-balance.test.ts gives a lookout on every BOLO and sends the nearest
  crews to new leads. No exceptions, at least one capture across the seeds, balance ranges hold, state grows by less
  than 20 kB.
- Saves: the `hunt` fixture in saves-upgrade.test.ts; an upgrade-paths case in phase 5.
- e2e: `e2e/hunt.spec.ts` (search a BOLO person, give a lookout, see the bulletin chip, open the case, place a
  stake-out, also on the phone layout); `e2e/coop.spec.ts` (a `look` from one seat is seen by the other).

## 10. Phases

Each phase is playable on its own, keeps every save, and takes the next free version number when it merges, with a
CHANGELOG section (Estonian bullets and an English summary). Today is 2.29.0 and 2.30.0 is reserved for the regional
incidents. Sizes: S is a few days of work, M about a week, L two weeks or more.

| Phase | Version (expected) | Contents | Size |
|---|---|---|---|
| 0. Vundament | 2.30.1 | unified registry truth (`missing`, SIS, `Vehicle.flags.wanted`) and the relabelled vehicle reply; `postBulletin` exported (weather.ts uses it too) with `Bulletin.status` and `caseId`; `CreateOpts.involve` so an incident can name existing persons and cars; `corridors.ts` extracted (pursuit unchanged, shown by its determinism test); `SYSTEM_TEMPLATES`; the command-table test. Docs alongside: the research note, vehicles-plates.md 6.1 updated, MULTIPLAYER.md section 5's stale "Registrid" role | S |
| 1. Numbrituvastus | 2.31.0 | `SimState.manhunt`; vehicle cases from BOLO cars, escaped pursuits and `look` on a plate; car actors on legs; fixed cameras and the watch list; ANPR history; hits as leads; VTA, ring and „Kinnita VTA“; stop or follow, the stop incident with the real plate and a pursuit started in code; roadblocks; the `anpr` upgrade made real (in-car hits, and ANPR templates weighted x1.5); map cameras, leads and rings; the Otsitavad list; `look`, `drop`, `vta`, `post`, `unpost`; the report section | L |
| 2. Tagaotsitavad | 2.32.0 | person cases; generated links and the Seosed section; anchors and reveal; partial plates, look and address search; requests with grounds (`req`: `vehwanted`, `wanted`) and the NPC answers; stake-outs and address checks; the profiles; case proposals after escapes; the border payoff; `hunt_false` and the case fallout; case scores in the shift score; achievements | L |
| 3. Otsinguplaan | 2.33.0 | the search planner: segments, POA and POD, teams, sweeping crews (`Movement.purpose 'search'` finally used), K9 track, helicopter, the drone flown by a crew (the shop text changed to match), volunteers, critical time, conditions; phone positioning; public appeals for missing persons with withdrawal; the missing-person templates and their hints feeding the planner; the `eksinu` profile; `plan`, `team`, `drone` | L |
| 4. Avalikkus ja andmekaitse | 2.34.0 | description search, namesakes and identification puzzles; the query basis and the audit; public appeals for suspects and the fugitive's reactions; tip calls for the call-taker with grades (`tip`); the analyst's plan (`sug`); SIS hits and SIRENE confirmation; AI colleague sightings and hand-overs; desk routing of leads; difficulty labelling | M |
| 5. Enim otsitud | 2.35.0 | the career board, carry-over (`NewShiftOptions.carry`), arrest in absentia at the briefing, rewards, ageing out, the nemesis, audit marks, the `capture` story objective, newspaper pieces; the Okimum legend as a rare `piirile` case | M |
| 6. Tagaotsitav | 2.36.0 | the asymmetric room mode on the game server: per-side shadows and patches, the fugitive's screen and commands, the `pt` shape in both validators, lobby and report | L |

Phases 1 and 2 are the core: they turn the owner's "search cars or people and make them wanted" into play. Phase 3 is
the "send a search party". Phase 1 alone already makes the BOLO bulletins and the ANPR upgrade do what they say.

## 11. Open questions for the owner

1. **Who presses "make wanted".** This design has the JK request it („Taotle tagaotsimist“) and give its own lookout
   („Anna orienteering“), as in real life. Or should there be a direct „Kuuluta tagaotsitavaks“ button that skips the
   prosecutor, for fun over realism?
2. **Words.** *Orienteering*, *ekipaažide teavitus* or *BOLO* for the lookout? *Otsingurühm*, *otsingusalk* or
   *otsingugrupp* for the search party?
3. **Everyone or opt-in.** Should BOLO hunts run for every player from phase 1, or only after the player opens a
   case? With low rates it adds a few radio lines a shift for players who ignore it.
4. **The daily challenge.** Hunts in the daily challenge and race rooms from the start (the same for everyone), or
   career and quick play first?
5. **The audit.** On by default in career, off elsewhere? Should it also count in co-op?
6. **The asymmetric mode.** Worth building? It needs per-seat views on the game server, the largest server change
   since 2.21.0.
7. **Missing persons.** Is „alajahtunud, haiglasse“ the worst outcome the planner may cause, with the templates' rare
   sober tragedy left as it is?
8. **Story.** A sixth chapter around the Enim otsitud board, or a capture objective swapped into an existing chapter
   (which would move some careers' progress)?
9. **Leaving the country.** May a fugitive escape through Latvia or the Tallinn port for good, or should every case
   stay winnable inside Estonia?
10. **Cameras.** About 10 to 16 per prefecture keeps the map readable; the real network is much denser. Enough?
