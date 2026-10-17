# EPD 2.0 — Eesti Politsei Dispetšer

> Mitteametlik fännimäng. Ei ole seotud Politsei- ja Piirivalveametiga (PPA).
> Domeen: **politsei.eu**

This is the game design + architecture spec. Every module author must read it. Types live in
`src/sim/types.ts` (the contract — do not change existing fields; adding optional fields is OK
if you coordinate in your report).

## 1. Vision

The 2024 prototype (`public/legacy/politseimang-2024.html`) and the 2025 live version
(`public/legacy/politseimang-2025.html`) were a list of random calls, an officer list with
"Send" buttons, a person search, a rating ("Staatus"), money, hiring officers, backup requests
("Toetust vajab → Saada abi!") and bonus for the right officer type.

EPD 2.0 keeps **exactly that idea** — you are the dispatcher at a police command centre
(*juhtimiskeskus*), calls come in, you send officers, you look people up in the database, you
grow your prefecture — and makes it a modern, realistic, hyper-detailed CAD
(computer-aided dispatch) simulator:

* A real map of Estonia (offline vector map built from geoBoundaries + Natural Earth; online
  street/orthophoto layers when available). Units drive on the map in real time.
* Four playable prefectures (Põhja, Ida, Lõuna, Lääne) with real towns, streets, stations.
* 150+ incident types (all 116 legacy calls included, flagged `legacy: true`), with on-scene
  "beats": registry checks, decisions, backup requests, ambulance/rescue requests, transports
  to the arrest house, pursuits and area searches.
* A living registry ("Andmebaas" — homage to the original "Politsei Andmebaas"): people with
  valid isikukood, addresses, driving licences, weapon permits, criminal records citing real
  Estonian law paragraphs, wanted flags, restraining orders; vehicles with plates, VIN,
  insurance, inspection and stolen flags. Procedural SVG portraits.
* Interactive 112 transfers: Häirekeskus connects a caller, you ask questions, classify, create
  the event. Russian-speaking callers in Ida-Virumaa (interpreter option). Prank calls.
* Radio log (VIRVE-style) with replies, procedural radio/phone sounds, optional speech synthesis.
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
(day 07–19 or night 19–07). Engine internally sub-steps in ≤ 5 game-second slices.

### 4.2 Spawning
Poisson process: rate/h = `region.callVolume × hourCurve[h] × weekdayFactor × holidayFactor ×
difficultyFactor × weatherFactor`. Default hour curve peaks 22–02 (1.6×), lowest 04–07 (0.45×).
Difficulty factor: cadet 0.6, normal 1, veteran 1.35, realistic 1.8.
Template choice weight = `template.weight × hourProfile(template.hours)[h] × weekendBoost ×
season/month filter × region filter × place-availability`. Easter eggs (`easterEgg: true`) total
≤ 1.5 % of events. `legacy: true` templates are normal content.

Location: pick a place kind from `template.places`, then:
* a curated `Place` of that kind in the region (preferred when available), else
* `residential`/`house`/`street` → a generated address on a `Street` (interpolate along the
  polyline by house number; apartment number for `apartment` streets, e.g. "Punane tn 16-45"),
* `village`/`farm`/`summerhouse`/`forest`/`ruralroad`/`lake` → a rural settlement from
  `data/geo/settlements.json` within the region's counties, e.g. "Mäe talu, Kuusiku-Nõmme küla,
  Rapla maakond", jittered up to 600 m,
* `highway` → point along a Natural Earth road within region bounds, e.g. "Tallinna–Tartu
  maantee (E263), 34. km".

### 4.3 Incident lifecycle
`incoming` (new card, unacknowledged, blinking) → `queued` (acknowledged) → `dispatched`
(≥1 unit assigned and en route) → `onscene` (≥1 unit arrived) → `closed`.

* **Acknowledge** within ~2 game-min or trust drops (legacy "Aktsepteeri").
* **Reject/close without units** (legacy "Keeldu"): `closeIncident(how)` — `referral` to an
  agency, `phone` advice, `duplicate`, `prank`. Correct when the template is a referral/prank/
  false alarm or truly P4; wrong for real emergencies (big penalty).
* Units en route: `move` with siren for P1–P2. On arrival `onscene`. Work progresses at
  `assigned units on scene × skill factor` unit-minutes per minute until `onSceneMin` is reached
  (+ `effects.time`). Beats fire at their `at` time. Then the outcome is computed and units go
  `available` (or `transport`/`busy` paperwork 10–30 min after arrests).
* **Need vs ideal**: `need` is the minimum to make progress (e.g. armed robbery needs 2 patrols
  or 1 rapid response); with fewer units on scene work is paused and risk grows. Meeting `ideal`
  gives a bonus (legacy `bonus_officers_type`).
* **Expiry**: if no unit arrives before `expiresAt` the caller leaves → `closedBy: 'expired'`,
  penalty (legacy timeout progress bar, Staatus −7).
* **Escalation**: if not attended within `escalation.afterMin`, chance to escalate to the new
  priority with a radio/HK update.

### 4.4 Beats (on-scene interactions)
Each `BeatSpec` in a template becomes a `BeatState`. When it fires:
* `query` — unit radios "kontrolli isikut, isikukood 38506120234" (or plate). A `RadioMsg` with
  `replies` is created. Reply ids for person: `clean`, `wanted`, `restraining`, `nolicense`,
  `weapon`, `probation`, `notfound`; for vehicle: `clean`, `stolen`, `noinsurance`,
  `noinspection`, `suspended`, `ownerwanted`, `notfound`. The engine knows the truth from the
  generated record (most severe flag wins: wanted > restraining > stolen > nolicense…). The
  player looks it up in the Andmebaas (the radio message links straight to the record) and
  answers. Correct → `success +0.15`; wrong → `success −0.2`, possibly `trust −5` (e.g. released
  a wanted person). No answer within 6 game-min → officers check themselves slowly (`time +8`,
  `success −0.05`) unless the MDT upgrade is owned.
* `choice` — radio message with option replies; `defaultOption` applied on timeout.
* `backup` — legacy "Toetust vajab": the incident card turns red, alarm sound, countdown
  (`timeoutMin`). Dispatching a unit matching `need` before timeout → `successEffects`; else
  `failEffects` (legacy: call failed, Staatus −6..−8). While waiting work is paused.
* `agency` — "vajame kiirabi": player must press "Teavita Häirekeskust: Kiirabi". Agency arrival
  time 8–20 min (rural longer).
* `transport` — unit status `transport`, drives to arrest house (`region.arrestHouseId`) /
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
Started by a `pursuit` beat or ANPR hit. The suspect vehicle moves (speed 70–140 km/h, random
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
`available` units patrol: pick a random waypoint within 3–6 km of their station every 15–40 min
and drive at 35 km/h without siren (lively map). ETA: straight-line distance × road factor
(urban 1.35, rural 1.25) ÷ speed (siren: urban 58 km/h, rural 95 km/h; no siren 40/75; heli
200 km/h straight, no road factor) × weather road factor. Paths: straight segments with a mild
mid-point bend so movement looks organic (no external routing in the engine). Cross-zone travel
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
Hesburgerirööv", wanted) — shown with a gold "LEGEND 2025" ribbon.
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
(start 10 000 €), **Staatus** (start 25, 0..100), rank, xp, staff, fleet, upgrades, ledger,
history, achievements, recruit pool.
* A career shift = one day. After each shift: daily base budget (region-dependent, ~1 600 €)
  + performance bonus (from shift score & reputation delta, like the 2025 formula) − daily
  salaries (monthly/30) − vehicle upkeep − fuel (km × 0.14 €) − overtime.
* Every 30 days: payday summary, recruit pool refresh (8–10 candidates), month report.
* Hiring: candidates with specialty (patrol, rapid, criminal, k9, traffic, aux…), skill,
  salary demand (realistic 1 700–3 400 €/month), years of service, bio. Fire staff.
* Fleet: buy vehicles from a catalogue (realistic models & prices), each suits unit types.
* Roster: before a shift the player sees auto-generated crews (2 officers + a vehicle per patrol,
  editable), only `active` staff.
* Upgrades (data/economy.ts) change engine numbers (see §6). Rank thresholds unlock regions,
  helicopter, K-komando, Director mode is always free.
* Injured officers are out for 2–10 days.

## 5. Public APIs (signatures — stubs exist, implementers keep them)

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
'unavailable' | 'unreachable'; reason?: Text }`.

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
Hotkeys: Space pause, 1–5 speed, F2 queue, F3 Andmebaas, F4 units, F6 radio, A acknowledge,
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
"pank", "tankla") — real *place* names (streets, malls as locations) are fine.
