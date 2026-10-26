# Suurõnnetus: a crisis for several desks at once (2.37.0)

The owner's list, point 9: "Suurõnnetus kõigile korraga: näiteks bussiõnnetus, metsatulekahju või laulupidu. Kõik
lauad peavad koostööd tegema ja ressursse jagama." The owner drew the first scenes (docs/art/major/: a bus crash, a
plane crash, a forest fire) and asked for more. The game already has rare single incidents of the category `major`
(src/data/incidents/major.ts, code SUUR, such as `major_bussionnetus`): one event, many crews. A crisis is bigger: a
scene with its own briefing and staff, made of several ordinary incidents (its tasks) that may fall to different
desks, run at the same time as the everyday calls, and get worse when they wait. In the code it is a *crisis*
(`src/sim/crisis.ts`, `SimState.crisis`) so it never mixes with the `major` category.

## 1. The flow

1. **Scheduled at the start.** A shift that allows one (section 6) decides from its seed whether a crisis comes, which
   scenario, where and when: between 20 % and 50 % of the shift, so there is time to finish it, and only in the
   scenario's months and hours (no forest fire in winter, no shopping centre evacuation at night). Its own random
   stream (`epd-crisis:<seed>`), so no other draw moves. Nobody sees a scheduled crisis before it breaks out.
2. **It breaks out.** The tasks that start at once become incidents in the queue, each tagged
   `crisis:<scenario>:<task>`, coded SUUR and already acknowledged. Häirekeskus radios the major incident and every
   player gets the briefing: the owner's drawing (or a text card), what happened, where, the tasks now and later. In
   single player the shift waits while it is open. It opens once per crisis, also on a shift resumed or joined while one
   runs.
3. **The staff works it.** The staff panel (the right panel's "Staap" tab, marked while a decision waits) shows the
   situation, who commands, the decisions and the tasks: each with its state (opens at, waiting with the time left,
   past its deadline, en route, on scene, done with its points, taken over), its crews and, in a sector room, the desk
   it falls to; a click opens its incident on the map. A bar over the map shows the crisis, its situation, the tasks
   done and waiting and a decision waiting; a crisis task's queue card and incident carry a note with the time left,
   and its map marker a turning red ring. Later tasks open as the crisis unfolds (the investigator after 20 minutes).
4. **Waiting makes it worse.** A task that has no crew by its deadline escalates the crisis one level (Olukord:
   kontrolli all → pingeline → kriitiline): its incident becomes P1 and the scenario's follow-up for it opens (a chain
   collision in the queue of cars, onlookers at the tape, a second village). Each level costs the crisis score.
5. **The commander decides.** Two decisions per scenario (close the highway completely or keep a lane; a 1 km or a 3
   km cordon; ask the neighbours for help or not). They change the tasks' risk and deadlines and what the AI colleagues
   do. In single player the player is the commander; in co-op one player takes command ("Võta juhtimine"). A decision
   nobody makes in 10 minutes is made by the staff's default.
6. **The neighbours help.** When a task has waited past its deadline by 10 minutes and the commander asked for help
   (or a desk nobody holds owns it), the AI colleague of the next desk takes it over (closed by the colleague, half the
   points). Without help asked, nobody comes.
7. **It ends** when every task is closed. Häirekeskus radios the end; the report shows the crisis: its drawing, the
   result (the tasks' outcomes, the level reached, the time to contain it), the decisions, who commanded, and the
   joint report's timeline gets its moments. A crisis still running when the shift ends is settled where it stands
   (`settleCrisis`): its result, "not resolved".

## 2. Scenarios (2.37.0)

| id | Title | Where, when | Tasks (follow-ups) | Decisions | Drawing |
| --- | --- | --- | --- | --- | --- |
| `bus` | Bussiõnnetus maanteel | a highway place | casualties, traffic, cordon, investigation (20 min), relatives' point at a school (25 min); chain collision, onlookers | close the road or keep a lane; ask the neighbours | `crisis-bus.webp` |
| `plane` | Lennuõnnetus lennuvälja lähedal | an airport, the wreckage 0.8 to 1.6 km off it | casualties and fire, cordon, access roads, relatives at the terminal (15 min), wreckage and flight recorders (30 min); drones and onlookers, gridlock | 1 km cordon or evacuate the houses; ask the neighbours | `crisis-plane.webp` |
| `forest` | Metsapõleng | a forest, a village or summer houses; April to September | evacuation, roads, mushroom pickers (10 min), arson (30 min), the evacuated homes (40 min); collision in the smoke, the wind turned | 3 km or only in the fire's path; neighbours and Kaitseliit | `crisis-forest.webp` |
| `mall` | Kaubanduskeskuse evakueerimine | a shopping centre; 10:00 to 21:00 | evacuation, cordon, traffic, the dog search (10 min), the sender (20 min); crush at an exit, gridlock holding up bomb disposal | the whole centre or one wing; ask the neighbours | text card until drawn |

Each scenario (src/data/crises/) has its tasks (each an `IncidentTemplate` of weight 0 that never spawns by itself,
registered with the others by id, with its need, beats and outcomes, checked by the incident suite in
`tests/crisis-data.test.ts`), a deadline and a start time per task, a follow-up per task that escalates, and two
decisions with their options and effects. A scenario is picked only where its place exists in the shift's area, in
its months (`months`) and hours (`hours`, Tallinn time); a sector room prefers a place near the border between two
held desks, so the crisis falls to more than one desk.

## 3. Placement

- The crisis point is a place of the scenario's kinds in the shift's area (all held desks in a sector room), on the
  mainland or an island with a police station (Saaremaa, Hiiumaa; not Ruhnu, Kihnu or Vormsi). In a room of several
  desks a place within 1.5 km of a border between two of them weighs four times as much.
- Tasks are placed around it: on the spot (the scene), a few hundred metres off (the cordon), 1 to 2 km along the road
  (traffic posts), at the nearest place of a kind within 15 km (the relatives' point at a school, the terminal), or
  from another task's spot (`near`: the cordon round a plane's wreckage, not round the terminal). Always in the area
  and on the same island; a spot without an address takes the address of the spot it is placed from. Each task's
  incident belongs to the desk of its own location, so a traffic post can be the neighbour's.
- A shift whose area has no fitting place at that time gets none, even when asked for one: Tallinn's centre or Tartu
  at night (no highway, no airport, the centres closed).

## 4. State (`SimState.crisis`)

`{ id, phase: 'due' | 'on' | 'over', due, rng, center, address, placeName?, sector?, at?, tasks: [{ id, opensAt,
deadline, incidentId?, escalated?, helped? }], level, lead, decisions, asked, defaulted?, help?, helped, endedAt?,
result? }`. Absent in every shift without a crisis and in every save from before. Deterministic: it changes only from
the shift's own state and commands, so every co-op client and the game server keep the same; it is in the digest
(`crisisDigest`). Events for the UI: `crisis_start`, `crisis_decision`, `crisis_escalated`, `crisis_end`.

## 5. Co-op

- Commands: `lead []` (take command when nobody holds it; the host may take it over), `cdec [decision, option]` (the
  commander only). Both role `any`, checked in the command.
- Any desk may send its own crews straight to a crisis task (no lend request): the staff coordinates. Recalling and
  answering stay by the desk rules.
- A seat that leaves gives up command; the next player may take it.
- The joint report's timeline gets the crisis moments: it broke out, it escalated, a decision, it ended.

## 6. When a shift has one

| Shift | Crisis |
| --- | --- |
| Free shift (single player) | the briefing's choice ("Suurõnnetus": Juhus, the default; Kindlasti; Ei). Random: 10 % (cadet 5 %, veteran and realistic 15 %), times hours ÷ 4 |
| Career | random, 8 % times hours ÷ 4 |
| Co-op room | the lobby's choice (`crisis` option, default random): random 35 %, always, never (docs/MULTIPLAYER.md section 15) |
| Race room | the lobby's choice, random 20 %: every racer gets the same crisis at the same time and place |
| Daily challenge, tutorial, director | never (the director's panel starts one by hand; so does `__epd.engine.crisis.start(sim, id)` in the console) |

`NewShiftOptions.crisis`: missing means never, so nothing that existed before changes.

## 7. Score

The crisis tasks are ordinary incidents: they count in the shift's score like any other. The crisis result in the
report is their average score, minus 8 points per level reached, plus 5 when no neighbour had to help. Not part of the
shift score itself, so a shift with a crisis is not easier or harder to rank than before beyond its incidents.

## 8. Not now

- More scenarios (the owner's next drawings): laulupidu and lost children, an ammonia leak at Muuga, a storm (it would
  fit every area, Tallinn's centre at night too), fishers adrift on Peipsi ice, a train and a lorry at a crossing.
- The shopping centre's drawing.
- Temporary reinforcement crews from another prefecture.
- A crisis in the daily challenge.
