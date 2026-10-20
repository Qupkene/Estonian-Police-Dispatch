# EPD 2.0: Eesti Politsei Dispetšer

> Mitteametlik fännimäng. Ei ole seotud Politsei- ja Piirivalveametiga (PPA).
> Domeen: **politsei.eu**

This is the game design + architecture spec. Every module author must read it. Types live in
`src/sim/types.ts` (the contract: do not change existing fields; adding optional fields is OK
if you coordinate in your report).

## 1. Vision

The 2024 prototype (`public/legacy/politseimang-2024.html`) and the 2025 live version
(`public/legacy/politseimang-2025.html`) were a list of random calls, an officer list with
"Send" buttons, a person search, a rating ("Staatus"), money, hiring officers, backup requests
("Toetust vajab → Saada abi!") and bonus for the right officer type.

EPD 2.0 keeps **exactly that idea**: you are the dispatcher at a police command centre
(*juhtimiskeskus*), calls come in, you send officers, you look people up in the database, you
grow your prefecture. It turns that idea into a modern, realistic, hyper-detailed CAD
(computer-aided dispatch) simulator:

* A real map of Estonia (offline vector map built from geoBoundaries + Natural Earth; online
  street/orthophoto layers when available). Units drive on the map in real time.
* Four playable prefectures (Põhja, Ida, Lõuna, Lääne) with real towns, streets, stations.
* 150+ incident types (all 116 legacy calls included, flagged `legacy: true`), with on-scene
  "beats": registry checks, decisions, backup requests, ambulance/rescue requests, transports
  to the arrest house, pursuits and area searches.
* A living registry ("Andmebaas", a homage to the original "Politsei Andmebaas"): people with
  valid isikukood, addresses, driving licences, weapon permits, criminal records citing real
  Estonian law paragraphs, wanted flags, restraining orders; vehicles with plates, VIN,
  insurance, inspection and stolen flags. Procedural SVG portraits.
* Interactive 112 transfers: Häirekeskus connects a caller, you ask questions, classify, create
  the event. Russian-speaking callers in Ida-Virumaa (interpreter option). Prank calls.
* Radio log styled on ESTER, Estonia’s TETRA emergency-services network (VIRVE is Finland’s), with replies, procedural radio/phone sounds, optional speech synthesis.
* Day/night (real sunrise/sunset for 59°N), seasons, weather, holidays (jaanipäev, New Year).
* Career with economy (from the 2025 version): reputation **Staatus**, **budget (€)**, monthly
  funding based on performance, **hire officers** (salary, skill, specialty), buy vehicles and
  upgrades (body cams, tasers, ANPR, drones, K9, helicopter hours), ranks, achievements.
* End-of-shift report with grades and a generated newspaper front page.
* **Director mode** (*Režissööri režiim*) for filming police movies (README promise): spawn any
  incident anywhere, write your own radio lines, hide HUD, real-time clock.
* Estonian first, English second (toggle). Works offline. Deployed to GitHub Pages at politsei.eu.

## 2. Tech stack

* Vite 8 + React 19 + TypeScript 7 (strict), plain CSS (one CSS file per component folder,
  BEM-ish class names prefixed per module to avoid clashes, design tokens in
  `src/ui/styles/tokens.css`).
* State: zustand (`src/store/*`). The simulation state (`SimState`) is a plain JSON object
  mutated in place by the engine; the store bumps a `tick` counter ~8×/s so React re-renders.
* Map: maplibre-gl 6 (`setWorkerUrl` with `maplibre-gl/dist/maplibre-gl-worker.mjs?url`),
  glyphs served from `public/glyphs/{fontstack}/{range}.pbf` (Noto Sans Regular/Medium/Italic,
  ranges 0-255, 256-511, 8192-8447 only).
* Fonts: `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono` (offline).
* Tests: vitest (`tests/**/*.test.ts`), Playwright e2e (`e2e/`).
* No other runtime dependencies. Charts are hand-written SVG. Sounds are synthesised with the
  Web Audio API (no audio files).

Path alias: `@/` → `src/`.

## 3. Directory & ownership map

```
src/
  main.tsx, app/App.tsx           app shell + screen router            (core)
  sim/                            pure engine, NO DOM / React imports
    types.ts rng.ts geo.ts time.ts text.ts                              (core, done)
    engine.ts       createShift, step, finalizeShift                    (engine-core)
    spawner.ts      Poisson spawning, template pick, incident creation  (engine-core)
    units.ts        roster→units, movement, patrol wander, ETA          (engine-core)
    incidents.ts    lifecycle, beats, outcomes                          (engine-core)
    radio.ts        radio messages, status chatter                      (engine-core)
    commands.ts     player commands (public API)                        (engine-core)
    selectors.ts    derived data for UI (public API)                    (engine-core)
    scoring.ts      score breakdown, stats                              (engine-core)
    calls.ts        interactive 112 call logic                          (engine-systems)
    registry.ts     search + correct-reply evaluation                   (engine-systems)
    weather.ts sun.ts calendar.ts                                       (engine-systems)
    pursuit.ts search.ts                                                (engine-systems)
    report.ts       ShiftReport + newspaper                             (engine-systems)
    career.ts       pure career/economy rules (payday, hiring, roster)  (engine-systems)
  gen/                            procedural generators (pure, take Rng)
    isikukood.ts names.ts person.ts describe.ts phone.ts avatar.ts     (gen-people)
    vehicle.ts                                                          (registry-data)
    address.ts                                                          (gen-people)
  data/
    geo/*.json                    processed geodata                    (core, done)
    regions/{pohja,ida,louna,laane}.ts, regions/index.ts               (regions-*)
    incidents/*.ts, incidents/index.ts                                  (incidents-*)
    laws.ts vehicles.ts                                                 (registry-data)
    occupations.ts                                                      (gen-people)
    radioPhrases.ts                                                     (engine-core)
    economy.ts      upgrades, vehicle catalogue, salaries, ranks        (engine-systems)
  audio/sfx.ts audio/speech.ts                                          (ui-shell)
  map/                            MapView + style + markers             (map)
  store/game.ts store/settings.ts store/career.ts                      (core skeleton; career store: ui-career)
  i18n/index.ts i18n/parts/*.ts   UI strings, one part file per module (each module adds its own)
  ui/
    styles/tokens.css global.css                                        (core, done)
    components/     shared primitives (Button, Panel, Badge, Kbd…)     (ui-shell)
    screens/        Boot, Login, Menu, Briefing, Settings, Credits,
                    Report (+ Newspaper), Career (HQ management)        (ui-shell / ui-career)
    game/           GameScreen layout, TopBar, Queue, IncidentPanel,
                    UnitBoard, RadioPanel, Toasts, hotkeys              (ui-game)
    tools/          Registry (Andmebaas), CallTaker (112), Stats,
                    Bulletins, Director panel                           (ui-tools)
tests/              vitest unit tests (each module adds its own file)
e2e/                playwright smoke tests (core)
docs/research/      realism research notes (read them!)
docs/legacy/legacy-calls.json   the 116 legacy call types
public/legacy/      the original 2024 & 2025 versions, playable from the menu
```

Rule: **only edit files you own**. If you need something from another module, code against the
documented signature below (stubs exist). Report needed changes instead of editing others' files.

## 4. Simulation model

### 4.1 Clock
`SimState.now` is game epoch ms. The UI calls `step(state, dtGameMs)` every animation frame with
`dtGameMs = dtRealMs × speed`. Speeds (game seconds per real second): pause 0, `1×` = 15,
`2×` = 30, `4×` = 60, `8×` = 120, director "real time" = 1. Shift lengths: 4 h, 8 h, 12 h
(day 07-19 or night 19-07). Engine internally sub-steps in ≤ 5 game-second slices.

### 4.2 Spawning
Poisson process: rate/h = `region.callVolume × hourCurve[h] × weekdayFactor × holidayFactor ×
difficultyFactor × weatherFactor`. Default hour curve peaks 22-02 (1.6×), lowest 04-07 (0.45×).
Difficulty factor (tuned for fun over realism): cadet 0.4, normal 0.65, veteran 0.9, realistic 1.25.
Career shifts also multiply by the career `loadFactor` (§4.12). Callers wait `CALLER_PATIENCE`
(1.4) times the template's expiry. A sector shift (docs/SECTORS.md) spawns only inside its area and also
multiplies by `areaCallFactor` (the area's population share ^ 0.6, at least 2 calls an hour before the
other factors); a `fixedSchedule` shift (daily challenge) draws arrivals, incidents and weather from
`SimState.spawnRng`, each at its own time, so every player gets the same calls.
Template choice weight = `template.weight × hourProfile(template.hours)[h] × weekendBoost ×
season/month filter × region filter × place-availability × repetition`. Easter eggs (`easterEgg: true`) are
scaled to about 4 % of events (never more than 7 %). `legacy: true` templates are normal content.
Repetition (spawner.ts): a template among the shift's last 8 incidents × 0.08, each earlier telling
in the shift ÷ (1 + 0.4 × count), and a third incident of the same category in a row × 0.3. The
memory lives in `s.flags` (`recent:tpl`, `recent:cat`, `seen:scn`), so it survives autosave.
Template scenarios (`IncidentTemplate.scenarios`, src/sim/scenario.ts): one coherent story per
incident (who is involved, the trigger, the caller, what the patrol finds, the endings). One is
picked at spawn and stored as `Incident.scenarioId` (a scenario already told this shift × 0.02);
its fields replace the template's everywhere through `tplOf`, so the card, the 112 caller, the
beats and the closing report tell the same story. `callerRole` names who calls (victim, suspect).

Location: pick a place kind from `template.places`, then:
* a curated `Place` of that kind in the region (preferred when available), else
* `residential`/`house`/`street` → a generated address on a `Street` (interpolate along the
  polyline by house number; apartment number for `apartment` streets, e.g. "Punane tn 16-45"),
* `village`/`farm`/`summerhouse`/`forest`/`ruralroad`/`lake` → a rural settlement from
  `data/geo/settlements.json` within the region's counties, e.g. "Mäe talu, Kuusiku-Nõmme küla,
  Rapla maakond", jittered up to 600 m,
* `highway` → point along a Natural Earth road within region bounds, e.g. "Tallinna-Tartu
  maantee (E263), 34. km".

### 4.3 Incident lifecycle
`incoming` (new card, unacknowledged, blinking) → `queued` (acknowledged) → `dispatched`
(≥1 unit assigned and en route) → `onscene` (≥1 unit arrived) → `closed`.

* **Acknowledge** within ~2 game-min or trust drops (legacy "Aktsepteeri").
* **Reject/close without units** (legacy "Keeldu"): `closeIncident(how)`, where `how` is `referral` to an
  agency, `phone` advice, `duplicate` or `prank`. Correct when the template is a referral/prank/
  false alarm or truly P4; wrong for real emergencies (big penalty).
* Units en route: `move` with siren for P1-P2. On arrival `onscene`. Work progresses at
  `assigned units on scene × skill factor` unit-minutes per minute until `onSceneMin` is reached
  (+ `effects.time`). Beats fire at their `at` time. Then the outcome is computed and units go
  `available` (or `transport`/`busy` paperwork 10-30 min after arrests).
* **Need vs ideal**: `need` is the minimum to make progress (e.g. armed robbery needs 2 patrols
  or 1 rapid response); with fewer units on scene work is paused and risk grows. Meeting `ideal`
  gives a bonus (legacy `bonus_officers_type`).
* **Expiry**: if no unit arrives before `expiresAt` the caller leaves → `closedBy: 'expired'`,
  penalty (legacy timeout progress bar, Staatus −7).
* **Escalation**: if not attended within `escalation.afterMin`, chance to escalate to the new
  priority with a radio/HK update.

### 4.4 Beats (on-scene interactions)
Each `BeatSpec` in a template becomes a `BeatState`. When it fires:
* `query`: unit radios "kontrolli isikut, isikukood 38506120236" (or plate). A `RadioMsg` with
  `replies` is created. Reply ids for person: `clean`, `wanted`, `restraining`, `nolicense`,
  `weapon`, `probation`, `notfound`; for vehicle: `clean`, `stolen`, `noinsurance`,
  `noinspection`, `suspended`, `ownerwanted`, `notfound`. The engine knows the truth from the
  generated record (most severe flag wins: wanted > restraining > stolen > nolicense…). The
  player looks it up in the Andmebaas (the radio message links straight to the record) and
  answers. Correct → `success +0.15`; wrong → `success −0.2`, possibly `trust −5` (e.g. released
  a wanted person). No answer within 6 game-min → officers check themselves slowly (`time +8`,
  `success −0.05`) unless the MDT upgrade is owned.
* `choice`: radio message with option replies; `defaultOption` applied on timeout.
* `backup` (legacy "Toetust vajab"): the incident card turns red, alarm sound, countdown
  (`timeoutMin`). Dispatching a unit matching `need` before timeout → `successEffects`; else
  `failEffects` (legacy: call failed, Staatus −6..−8). While waiting work is paused.
* `agency` ("vajame kiirabi"): player must press "Teavita Häirekeskust: Kiirabi". Agency arrival
  time 8-20 min (rural longer). The map shows every requested agency's vehicle (ambulance, rescue
  truck, lastekaitse car, sea rescue boat...) leaving a base at `requestedAt`, driving on the roads
  to the scene, arriving exactly at `arriveAt`, standing there until the incident closes and then
  driving off (display only, derived from `AgencyRequest`, `src/map/agencies.ts`).
* `transport`: unit status `transport`, drives to arrest house (`region.arrestHouseId`) /
  nearest hospital / station, then `busy` paperwork.
* `escalate`, `info`, `pursuit` (§4.6), `search` (§4.7).

### 4.5 Outcome & score
`success` (0..1) = 0.55 base
 + response factor (arrival vs SLA: ≤ SLA +0.15, ≤ 1.5×SLA 0, later −0.2)
 + resource factor (ideal met +0.1, only need met 0, under-resourced −0.15)
 + mean officer skill × 0.15 − mean fatigue × 0.1
 + `effects.success` + weather/night modifiers + random ±0.1, clamped.
Outcome = weighted pick among `outcomes` eligible for that success. Officer injury chance =
`risk` (template tags `armed` 0.12 base) × (1 − success) × upgrade modifiers.
Score per incident 0..100 from the `ScoreBreakdown` (response 30, resources 15, decisions 20,
outcome 20, safety 10, classification 5). Shift score = weighted average by priority
(P1 ×3, P2 ×2, P3 ×1, P4 ×0.5) minus penalties for expired/missed.

SLA defaults (minutes): P1 urban 10 / rural 20; P2 20 / 35; P3 45 / 60; P4 120.

### 4.6 Pursuit (jälitus)
Started by a `pursuit` beat or ANPR hit. The suspect vehicle moves (speed 70-140 km/h, random
heading changes, biased to roads/away from units). Pursuing units follow; each game-minute:
`pressure += 0.06 × units close (<1.5 km) + 0.2 if heli + 0.35 if spikes ahead` ; `risk += 0.02
× speed factor` (night, rain, snow raise it). Player actions: request helicopter (if available),
deploy spike strips (traffic unit within 3 km ahead), **terminate pursuit** (safe, suspect
escapes, small trust loss but avoids crash). Ends caught (pressure ≥ 1), crashed (risk roll),
escaped (distance > 8 km from all units for 3 min).

### 4.7 Area search
Search circle on the map. Each assigned unit adds progress per minute (K9 ×2.5, heli ×4, drone
×3, patrol ×1, aux ×1.2) scaled by `1/radius²`. Found at progress ≥ 1 (or random earlier).

### 4.8 Units
Roster: `region.roster` (UnitSpec) or career `RosterUnit[]`. Each unit spawns at its station.
`available` units patrol: pick a random waypoint within 3-6 km of their station every 15-40 min
and drive at 35 km/h without siren (lively map). ETA: straight-line distance × road factor
(urban 1.35, rural 1.25) ÷ speed (siren: urban 58 km/h, rural 95 km/h; no siren 40/75; heli
200 km/h straight, no road factor) × weather road factor. Paths: straight segments with a mild
mid-point bend so movement looks organic (no external routing in the engine). The map draws a
moving unit at the same fraction of a road route instead (display only, `src/map/roads.ts`, data
from the self-hosted street map, see SERVER.md 2.1) and incident markers at the nearest building
or road; without that data it shows the engine's own positions. Cross-zone travel
(islands) adds `zone.ferryMinutes` or is impossible (`null`) except for heli/boat.
Fatigue +0.06/h, ×1.5 for P1 work; breaks (`break` 30 min) reset 60 %. Fatigue > 0.8 → mistakes
(success −0.1). Units `onCall` (K-komando, heli) sit at base until dispatched (activation delay
5 min).

### 4.9 Radio
`RadioMsg.from` = unit callsign / 'JK' / 'HK'. Engine emits chatter for status changes
("Põhja 21, suundun.", "21, kohal.", "21, vaba."), arrivals, beats and outcomes, using
`data/radioPhrases.ts`. Max 300 messages kept.

### 4.10 Registry
Persons/vehicles are generated per incident (suspect, victim, caller, witness, driver, vehicle)
with flags from `PersonSpec`/`VehicleSpec`, plus a background population of ~150 people per
shift so name searches return plausible hits and some BOLO/wanted entries exist. Two legendary
easter-egg persons from the 2025 version are always present: **Rainer Okimum** (22, "CSS koodi
kirjutaja", records: "Kriminaalne mittepeatumine", "Tule avamine relvast avalikus kohas",
"Kehavigastuste tekitamine", wanted) and **Magnus Sarmert 「✔ ᵛᵉʳᶦᶠᶦᵉᵈ」** (age 438,
"Hesburgeri klienditeenindaja", records "Mõrvakatse", "Toidumürgitamine", "Relvastatud
Hesburgerirööv", wanted). Both are shown with a gold "LEGEND 2025" ribbon.
Search: by isikukood (exact), by name (case/diacritic-insensitive substring), by plate
(normalise spaces/case), by VIN. Every query is logged (`QueryLog`).

### 4.11 112 interactive calls
When an incident is created with `interactive` (chance from template, default P1 0.35,
P2 0.25, P3 0.12, P4 0.05; max one ringing call at a time), an `ActiveCall` rings. The incident
stays hidden (`state: 'incoming'`, flagged `flags['hidden:<id>']`) until the call ends. The player
answers, asks questions (`CallQuestionId`), each answer is generated from the incident facts (or
`template.call.answers`), reveals info; then ends the call with a decision: create event with a
chosen priority, mark prank, refer, or give phone advice. Classification accuracy is scored.
Unanswered for 45 game-seconds → Häirekeskus creates a card itself (no bonus, `callsMissed++`).
Russian-speaking callers: lines shown in Russian; enabling the interpreter adds 20 s per answer
but translates.

### 4.12 Career & economy (2025 idea, expanded)
Persistent profile (localStorage): name, badge number, home region, career day, **money**
(start 30 000 €, 10 officers, 5 cars and one sector; see docs/SECTORS.md for sectors, offers and posts),
**Staatus** (start 25, 0..100), rank, xp, staff, fleet, upgrades, ledger, history, achievements, recruit pool.
* A career shift = one day. After each shift: daily base budget (750 € + 400 € per sector covered; a career
  from before sectors keeps the region-dependent ~1 600 €)
  + performance bonus (from shift score & reputation delta, like the 2025 formula) − daily
  salaries (monthly/30) − vehicle upkeep − fuel (km × 0.14 €) − overtime.
* Every 30 days: payday summary, recruit pool refresh (8-10 candidates), month report.
* Hiring: candidates with specialty (patrol, rapid, criminal, k9, traffic, aux…), skill,
  salary demand (realistic 1 700-3 400 €/month), years of service, bio. Fire staff.
* Fleet: buy vehicles from a catalogue (realistic models & prices), each suits unit types.
* Roster: before a shift the player sees auto-generated crews (2 officers + a vehicle per patrol,
  editable), only `active` staff.
* Upgrades (data/economy.ts) change engine numbers (see §6). Rank thresholds unlock regions,
  helicopter, K-komando, Director mode is always free.
* Injured officers are out for 2-10 days.
* The career is told in five chapters with a recurring cast (docs/STORY.md): milestones, objectives met by
  normal play, small questions with modest consequences. It only reads the paid shift's report.
* Call load follows the force on duty (computed once in `createShift`, kept in `SimState.flags`):
  the spawn rate is multiplied by `loadFactor` = the square root of (response units on duty ÷
  response units of the regular normal-difficulty roster for that shift: patrol, rapid, aux,
  traffic, K9, border, community), clamped to 0.1..1; the difficulty factor still applies on top. Zones the regular
  roster staffs but the career force does not (`skipZones`, e.g. Saaremaa and Hiiumaa before an
  island crew exists) get no calls; the briefing bulletins say so.

## 5. Public APIs (signatures: stubs exist, implementers keep them)

```ts
// sim/engine.ts
createShift(opts: NewShiftOptions): SimState
step(s: SimState, dtGameMs: number): void
drainEvents(s: SimState): GameEvent[]
finalizeShift(s: SimState): ShiftReport            // uses report.ts

// sim/commands.ts (all mutate s; return value where noted)
acknowledge(s, incidentId)
setPriority(s, incidentId, p: Priority)
dispatchUnits(s, incidentId, unitIds: string[]): { ok: boolean; reason?: Text }
recallUnit(s, unitId)
closeIncident(s, incidentId, how: 'referral' | 'phone' | 'duplicate' | 'prank', agency?: Agency)
requestAgency(s, incidentId, agency: Agency)
replyRadio(s, msgId, replyId)
setUnitBreak(s, unitId, onBreak: boolean)
markChecked(s, incidentId, ref: { personId?: string; plate?: string })
answerCall(s, callId) / askCall(s, callId, q: CallQuestionId) / toggleInterpreter(s, callId)
endCall(s, callId, d: { action: 'create' | 'prank' | 'refer' | 'advice'; priority?: Priority; agency?: Agency })
pursuitAction(s, incidentId, a: 'terminate' | 'heli' | 'spikes')
directorSpawn(s, o: { templateId: string; coord?: LngLat; priority?: Priority; summary?: Text }): string
directorRadio(s, from: string, text: Text, level?: RadioMsg['level'])
directorMoveUnit(s, unitId, coord: LngLat)

// sim/selectors.ts
queue(s): Incident[]                    // visible open incidents, sorted
recommendUnits(s, incidentId): Recommendation[]
unitPos(s, u: Unit, t?: number): { pos: LngLat; heading: number }
pendingRadio(s): RadioMsg[]             // unanswered messages with replies
slaRemainingMin(s, inc: Incident): number
incidentAgeMin(s, inc: Incident): number
shiftProgress(s): number                // 0..1
sun(s): { isDay: boolean; sunrise: number; sunset: number; altitude: number }
liveStats(s): { open: number; p1: number; avgResponse: number | null; unitsFree: number; unitsTotal: number }
getRegion(s): RegionDef
templateOf(s, inc): IncidentTemplate | undefined
```
`Recommendation = { unit: Unit; etaMin: number; km: number; fit: 'ideal' | 'need' | 'weak' |
'unavailable' | 'unreachable'; reason?: Text; manual?: boolean }`. Ranking: fit first ('ideal' and
'need' only for units that fill a remaining need slot; ideal-only types such as an investigator or
the helicopter are 'weak' until the basic need is covered), then effective ETA (drive time plus a
penalty for pulling a unit off a less urgent job or a break). `manual` marks units the D key never
sends on its own: specialists (heli, boat, special, criminal, transport) on routine calls, units
beyond an already covered need, and crews across a ferry (except a mainland crew for a P1 on an
island with no local crew free). Boats are 'unreachable' away from their own water body.

Registry (`sim/registry.ts`): `searchPersons(s, q): Person[]`, `searchVehicles(s, q): Vehicle[]`,
`personFlags(p, now): RecordFlag[]`, `vehicleFlags(v, now): RecordFlag[]`
(`RecordFlag = { id: string; severity: 'info' | 'warn' | 'danger'; text: Text }`),
`correctReply(s, subject): string` (engine use).

## 6. Economy numbers (data/economy.ts)
Upgrades: `bodycam` (complaints −50 %, trust +), `taser` (officer injury −35 %), `mdt`
(officers self-resolve unanswered queries without penalty), `anpr` (ANPR hits & BOLO
pursuits), `drone` (search ×3, unlocks drone unit), `k9kennel` (unlock K9 units),
`heli_hours` (helicopter available on call), `spikes` (spike strips in pursuits),
`negotiation` (choice beats + success in crisis), `psychologist` (stress/fatigue −30 %),
`kkomando` (K-komando on call), `interpreter_line` (interpreter delay −75 %), `extra_station`.
Each: `{ id, name: Text, desc: Text, price, upkeep, minRank, icon }`.

## 7. UI
Dark professional CAD look. Tokens in `src/ui/styles/tokens.css`. Layout (≥ 1280 px):
TopBar (logo, prefecture, clock with day/night, weather, speed controls, live stats, Staatus,
money in career) · left: event queue · centre: map · right: context panel (incident / unit /
Andmebaas / Statistika tabs) · bottom: radio log + unit status board. 112 call = modal-ish
dock that slides in. Below 1100 px the side panels become tabs.
Hotkeys: Space pause, 1-5 speed, F2 queue, F3 Andmebaas, F4 units, F6 radio, A acknowledge,
D dispatch recommended, Esc close. Everything keyboard reachable.
Screens: Boot (fake OS boot log) → Login (ID-kaart / Mobiil-ID / Smart-ID simulation; empty
user+password = legacy login easter egg "Tere tagasi, 2024!") → Menu (Karjäär, Kiirmäng,
Režissööri režiim, Seaded, Algsed versioonid 2024/2025, Tiitrid) → Briefing → Game → Report.
A disclaimer is always visible on login/menu: "Mitteametlik fännimäng · ei ole seotud PPA-ga ·
hädaolukorras helista 112". Never use the real PPA logo/coat of arms; our emblem is an original
shield with a cornflower (rukkilill) and "EPD".

## 8. Content style
Estonian text must be natural, idiomatic Estonian (correct õ ä ö ü š ž, "tn", "mnt", "pst",
dates `17.10.2026`, decimal comma in prose). Häirekeskus summaries are terse, professional:
"Lasnamäe, Punane tn 16-45. Naabri teatel kostab korterist karjumist ja kolinat, naine hüüab
appi. Vägivald käimas. Relvad teadmata." English is a faithful, natural translation.
No gore; serious events are described soberly. No real private persons (except the two
legacy easter eggs above); no real company names in crimes (use generic: "kaubanduskeskus",
"pank", "tankla"). Real *place* names (streets, malls as locations) are fine.

## 9. Salvestuste ühilduvus

Mängija juba mängitud andmed ei tohi ühegi uuendusega kaduda: ei brauseris ega pilves, ei uue
versiooni ega tagasipööramise (rollback) korral.

| Kus | Mis | Kood |
| --- | --- | --- |
| `epd:career` | karjäär: `{ state: { profile, inbox }, version }` | `src/store/career.ts` |
| `epd:settings` | seaded: `{ state: { lang, volume, ... }, version }` | `src/store/settings.ts` |
| `epd:autosave` | pooleli vahetus (SimState JSON, `version: 2`) | `src/store/game.ts` |
| `epd:sync` | külalise pilvesünkroonimise märk (vorming 3; vanemad 1 ja 2), sisselogitud konto | `src/net/account.ts`, `src/net/sync.ts` |
| `epd:acct:<id>:*` | konto vahemälu: `career`, `settings`, `autosave`, `sync`, `backup.*` samas vormis | `src/store/space.ts` |
| serveri `saves` tabel | kontokasutajate `career`, `settings`, `autosave` muutmata JSON-ina | `server/lib/saves.php` |
| `epd:backup.*` | varukoopiad, vaata allpool | `src/store/migrate.ts` |

**Igal identiteedil on oma andmed.** Tavalised võtmed kuuluvad külalisele, iga konto andmed on brauseris
ainult serveri koopia vahemälu nimeruumis `epd:acct:<id>:` (server on tõe allikas). Korraga on aktiivne üks
nimeruum: sisselogimine teeb aktiivseks konto oma, väljalogimine, konto kustutamine ja mujal lõppenud seanss
toovad tagasi külalise oma, nii et külaline ei näe ega jätka kunagi konto mängu. Brauser, mis sünkroonis enne
nimeruume (märgi vorming 1 või 2), viiakse laadimisel üks kord üle: konto andmed liiguvad koos märgi kirjetega
konto nimeruumi (üles laadimata muudatused jäävad märgituks ja laaditakse järgmisel sisselogimisel üles),
külaline saab tagasi selle, mille konto pilvekoopia kunagi asendas (`epd:backup.<slot>` kirjed, mille `owner`
on `null`), omanikuta andmed jäävad külalisele. Kui salvestusruum ei luba, jääb kõik paigale ja üleviimist
proovitakse järgmisel laadimisel uuesti (`migrateLayout`, `tests/saves-upgrade.test.ts`).

**Kuidas laadimine andmeid hoiab** (`src/store/migrate.ts`):
* zustand 5 viskab salvestatud oleku ise ära, kui versioon erineb ja `migrate` puudub (logib vea,
  jätab vaikeväärtused ja järgmine muudatus kirjutab vana üle), samuti loetamatu JSON-i või vigase
  `migrate` korral. Seepärast kasutavad `useCareer` ja `useSettings` funktsiooni `guardedPersist`:
  vanem versioon viiakse samm-sammult üles (originaal jääb varukoopiasse), uuemat või tundmatut
  versiooni loetakse mängimiseks, aga selle võtit ei kirjutata selles seansis kunagi üle, ja
  loetamatu JSON pannakse enne vaikeväärtusi varukoopiasse. Kui varukoopiat ei saa kirjutada, ei
  kirjutata üle ka põhivõtit.
* Salvestatud olek liidetakse praeguste vaikeväärtuste peale: uued väljad saavad vaikeväärtuse,
  tundmatud (uuema versiooni) väljad jäävad alles ja kirjutatakse tagasi.
* `normalizeCareerProfile` teeb igast salvestatud profiilist kuju, millega mäng töötab: puuduvad
  loendid ja objektid saavad vaikeväärtuse, vigased kirjed visatakse välja ükshaaval (mitte kogu
  loend), arvud jäävad arvudeks. Sama normaliseerijat kasutab pilvest tulev karjäär
  (`src/net/account.ts`). Kui midagi tuli välja jätta, jääb originaal `epd:backup.career.repaired`.
* Karjäär 2.0 (sektorid, docs/SECTORS.md) lisas profiilile valikulised väljad `sectors`, `openPosts`, `offer` ja
  `sectorsChangedDay`, versiooni tõstmata. Normaliseerija kontrollib neid (vigased kirjed ükshaaval välja) ja
  `withSectors` annab sektoriteta karjäärile iga avatud prefektuuri kõik sektorid: see mängib täpselt nagu enne
  (terve prefektuur, sama päevaeelarve), töötajad, autod, raha ja ajalugu jäävad puutumata ning täidetud väli
  kirjutatakse järgmise muudatusega. Eelmise väljalaske (2.8.0) normaliseerija hoiab uued väljad alles
  (`tests/upgrade-paths.test.ts`); sektorikarjääri kuldfiksatuur on `tests/fixtures/saves/sectors/`.
* Karjääri lugu peatükkidena (docs/STORY.md) lisas profiilile valikulise välja `story`, versiooni tõstmata.
  Normaliseerija kontrollib seda ainult siis, kui see on salvestatud (vigased kirjed ükshaaval välja, tundmatud
  väljad jäävad alles); vanem karjäär laeb muutmata kujul ja alustab lugu oma järgmise makstud vahetusega peatükist,
  mis vastab tema olekule, ilma varasemate peatükkide tasudeta. Eelmise väljalaske (2.17.0) normaliseerija hoiab
  välja alles (`tests/upgrade-paths.test.ts`); loo kuldfiksatuur on `tests/fixtures/saves/story/`.
* Vahetuse salvestus sai sektoritega (docs/SECTORS.md) valikulised väljad `sectors`, `coverSectors` ja
  `spawnRng`, versiooni tõstmata: puuduv väli tähendab tervet prefektuuri ja tavalist juhuvoogu, nii et iga
  vanem salvestus jätkub täpselt nagu enne (`tests/sectors.test.ts`), ja eelmine väljalase mängib sektoriga
  salvestuse edasi terve prefektuurina.
* Vahetuse salvestus viiakse sammudega (`SIM_STEPS`) praeguse SimState versioonini. Kui seda ei saa
  jätkata, liigub see oma varukoopiavõtmesse ja põhivõti vabaneb; ilma koopiata ei kustutata seda
  kunagi. Ainult vahetus, mille aruanne on juba olemas, eemaldatakse lihtsalt.
* 92ed7f5 salvestas enne aega lõpetatud vahetuse uuesti, kui vaheleht aruande ekraanil suleti, ja maksis
  selle jätkamisel teist korda. Seepärast ei jätkata karjäärivahetust, mille tulemus on karjääri ajaloos
  juba olemas (möödunud päev sama kalendrikuupäeva, prefektuuri ja sündmuste arvuga, `careerShiftPaid`).
  Salvestus jääb `epd:backup.autosave.unresumable`.
* Enne kui pilvekoopia, uus karjäär, karjääri kustutamine või uus vahetus asendab brauseri andmed
  teistsugustega, jääb eelmine väärtus varukoopiasse.

**Varukoopiad** (iga nimeruumi omad: külalisel `epd:backup.*`, kontol `epd:acct:<id>:backup.*`; need eemaldab
„Kustuta kõik andmed”; kui brauseri salvestusruum on täis, võib
käimasoleva vahetuse salvestamiseks kustuda ainult `epd:backup.autosave` ja `epd:backup.autosave.cloud`,
sest pikk vahetus võtab üle megabaidi):
* `epd:backup.career` ja `epd:backup.career.prev`: kaks viimast asendatud karjääri. Andmed, mida
  mujal pole (külalise karjäär, üleslaadimata muudatused), jäävad teiste ees alles.
* `epd:backup.settings`, `epd:backup.autosave`: viimane asendatud koopia.
* `epd:backup.<slot>.v<n>`: teise versiooni salvestus baidi täpsusega (vanem enne migratsiooni,
  uuem lisaks puutumata põhivõtmele); `.unknown`, kui versioon puudub.
* `epd:backup.<slot>.invalid`: loetamatu JSON. `epd:backup.<slot>.repaired`: originaal enne parandust.
* `epd:backup.career.guest`: külalise karjääri koopia viimasest sisselogimisest (tagasipööramiseks 92ed7f5 peale).
  `epd:acct:<id>:backup.<slot>.replaced`: konto vahemälu, mille asendas tagasipööramise ajal kirjutatud koopia.
* `epd:backup.autosave.unresumable`: sama versiooni vahetus, mida ei saa jätkata (nt tundmatu
  prefektuur või juba makstud karjäärivahetus). `epd:backup.autosave.cloud`: pilve vahetus, mida see versioon ei jätka.

Baidi täpsusega koopia taastamiseks kopeeri väärtus tagasi oma võtmesse; teiste puhul on andmed väljas
`data` (`{ at, reason, unique, owner, data }`).

**Kuidas salvestuse kuju turvaliselt muuta:**
1. Eelista uut valikulist välja: see ei vaja versiooni tõstmist. Lisa selle vaikeväärtus
   normaliseerijasse (`normalizeCareerProfile`, `SETTING_RULES`), mitte ainult tüüpi.
2. Kui olemasoleva välja kuju või tähendus muutub, tõsta versiooni (`CAREER_VERSION`,
   `SETTINGS_VERSION` või `SimState.version` koos `SIM_VERSION`-iga) ja lisa samm
   (`CAREER_STEPS[v]`, `SETTINGS_STEPS[v]`, `SIM_STEPS[v]`), mis teeb versioonist v versiooni v + 1.
   Samm on puhas funktsioon, ei eelda andmetest midagi ja viskab erindi, kui andmed on
   kasutuskõlbmatud (siis jääb originaal alles).
3. Ära nimeta välja ümber ega kustuta seda ilma sammuta: samm loeb vana välja ja kannab selle üle.
4. Lisa uus kuldfiksatuuride komplekt `tests/fixtures/saves/<commit>/`, mille on kirjutanud
   **eelmise väljalaske** kood (generaator ja juhend on komplekti juures), koos README-ga. Vanu
   komplekte ei muudeta ega kustutata kunagi; `tests/saves-upgrade.test.ts` käib kõik läbi.
5. Tagasipööramine: 92ed7f5 kood ei tunne seda kaitset. Kui `epd:career` või `epd:settings` versioon
   tõuseb ja server pööratakse 92ed7f5 peale tagasi, kaotab see brauser oma andmed. Ära tõsta neid
   versioone, kui saab ilma. Alates sellest versioonist jätab vanem kood uuema versiooni andmed
   puutumata. `epd:sync` hoiab vormingu 3 kõrval ka vormingu 1 välju (`owner`, `updated`), sest 92ed7f5
   loeb ainult neid ja tunneb ainult tavalisi võtmeid, kus on nüüd külalise andmed. Kui konto on sisse
   logitud, on `owner` 0 (sellist kontot pole): 92ed7f5 ei laadi siis külalise andmeid kunagi konto
   pilvekoopia peale, vaid täidab ainult tühjad pesad. Sama kehtib väljalogituna, kui selles brauseris on
   mõni konto kunagi sisse logitud: tavalistes võtmetes on siis kas mitte midagi või konto edenemisest vanem
   külalise koopia. Pilvekoopia, mille ta külalise karjääri asemele
   tõmbab, ei kaota midagi: sisselogimisel jääb külalise karjäärist koopia `epd:backup.career.guest` ja
   tagasiteel taastatakse see. Konto nimeruumi üles laadimata muudatusi 92ed7f5 ei näe ega kirjuta üle;
   tagasiteel jäävad need alles ja laaditakse üles (`legacyMeta`, `tests/upgrade-paths.test.ts`). Ära eemalda
   neid välju, kuni tagasipööramine 92ed7f5 peale on võimalik.
6. Pilvekoopiad on sama JSON: kui kuju muutub, peab ka pilvest tulev koopia läbima sama sammu ja
   normaliseerija (`validAutosave`, `normalizeCareerState`, `sanitizeSettings`).
