# Kordus: the shift replayed on the map (2.39.0)

The owner's list, point 13 ("Kordus: vahetuse lõpus saab ajajoonelt vaadata, mis kaardil juhtus"), as agreed: the
crews drive and incidents appear on the map, faster; the timeline marks the calls, the crews sent and the pursuits;
the replay can be scrubbed, paused, and one crew followed.

Code: `src/sim/replay.ts` (the recording), `src/sim/replayFrame.ts` (playing it back), `src/store/replay.ts` (the
running shift's recording and the replays kept on the device), `src/ui/replay/` (the viewer: `ReplayLayer.tsx`,
`ReplayScreen.tsx`, `Timeline.tsx`, `replay.css`), `src/ui/screens/shell/ReplayCard.tsx` (the report's card and its
picture). Tests: `tests/replay.test.ts`, `tests/replay-store.test.ts`, `e2e/replay.spec.ts`, and the replay checks in
`e2e/coop-sectors.spec.ts`.

## 1. Why a recording

The simulation is deterministic, but a shift cannot be stepped again from its seed to show it: a tab steps real time
times the speed, so the steps of a run (and every random draw that depends on a step's length) differ from any other
run, and outside a room the player's commands are not logged anywhere. So the shift is watched while it runs and what
changes is kept. That costs little: a busy eight-hour shift of a whole prefecture is about 170 KB (its save is over
a megabyte), and looking at the state once a frame takes about a hundredth of a millisecond.

Nothing of the recording is in the simulation state, its saves, its digest or a room's snapshots: it lives beside the
shift and never changes how the shift plays.

## 2. What is recorded

`observe(recorder, sim)` runs every frame the game clock moved (`src/store/game.ts`, the game loop) and keeps what
changed since the frame before:

| What | Kept as | Time |
| --- | --- | --- |
| a crew's status and the incident it works on | `ReplayUnit.st`: `{t, s, i?}` | the crew's own `statusSince` |
| a crew's movement | `ReplayUnit.mv`: the engine's path (to five decimals, about a metre), departure, arrival, purpose, siren; `c` when it was cut short | the movement's own times |
| a crew found where no movement took it (a resync, a lost frame) | a one-point movement | the frame |
| an incident | `ReplayIncident`: its card (number, code, title, true priority, place), when it showed on the map (a 112 call's incident: when the call ended), its state, priority and escalation over time, when it closed and how it ended, the crews that worked on it, the other agencies asked for | `closedAt` for the closing, else the frame |
| a pursuit | `pu`: the fleeing vehicle's samples (`[t, lon, lat, heading]`, one per 25 m or 10 game seconds), its start, end and how it ended | the frame |
| an area search | `sr`: centre, radius, how far it got | its own start, the frame for the end |
| a 112 call | `ReplayCall`: rang, answered, ended, missed; in co-op the seat that answered | the call's own times |
| the weather, the crisis | `wx`, `crisis` (its place, start, end, result) | the frame, the crisis's own |

A frame sees at most a few game seconds (the fastest speed is 120 game seconds a second), and every time that matters
comes from the object itself, so the replay shows each crew where the engine had it: the tests compare the replay
with the running shift every five minutes, and 95 % of the positions are within three metres (the rest within a few
tens, where a crew stopped between two frames), every status, incident and state exactly.

When the shift ends (`finishRecording`, from the store's `endShift`) the recording takes what only the end knows: the
crews' kilometres and, in sector co-op, their desks; each incident's result, its crews and agencies, its desk; the
seats of a co-op room and the room's code; the result. Then it builds the timeline's marks: every call, every crew sent
(`send`, with the seat that sent it in co-op when one seat sent crews in that frame), every pursuit as a span, the
crisis as a span, and the report's highlights (`good`, `bad`).

## 3. On the device

`src/store/replay.ts`:

- The first frame of a shift looks for a recording of it kept before a reload (by its key, `${seed}:${startTime}`)
  and goes on with it; otherwise a new one starts. One started within the shift's first two minutes counts from the
  shift's start; later (the shift began on another device) it counts from where this device first saw it, and the
  replay says so.
- Every 30 seconds and when the page is hidden the recording is kept, so a reload loses nothing. A kept recording that
  went on past the moment the shift resumes from (an older save, a save from another device) is cut back to it; a
  longer break than a minute is a gap, drawn hatched on the timeline.
- `finishReplay` ends it with the report and keeps the finished replay. It is the report's from then on
  (`useReplay.last`).
- IndexedDB (`epd-replays`), never localStorage: a long shift's save already fills a good part of the browser's
  storage there, and a recording must never be what pushes a save out. Per identity (the guest's or an account's
  namespace, `src/store/space.ts`): the last 12 finished replays stay, an unfinished one (a shift saved and left) seven
  days. Removing an account's cache from the device (signing out on a shared computer, a deleted account) removes its
  replays too. Without IndexedDB the replays live as long as the page.
- Replays stay on the device that played the shift: they are not uploaded.

## 4. The viewer

`ReplayFrame` (`src/sim/replayFrame.ts`) builds a `SimState`-shaped state for any moment: the crews with their status,
incident and movement then, the incidents that had showed with their state, priority, assigned crews, pursuit,
search and agencies then. The game's own map (`MapView`) draws it as it draws a running shift, so the replay looks
exactly like the shift did: crews drive on the roads along their routes, other agencies drive to the scenes and back,
pursued vehicles run on the roads with their trail, searches grow. Playing moves the same state object on; a jump
makes a new one, so the map's road layer starts over instead of driving a crew from where it was shown to where it
is now.

The viewer (`src/ui/replay/`, its own chunk with the map, loaded with the first replay) is a dialog over the page:

- **The map** with the clock, the playing speed and, during a pursuit, "Jälitus: aeglaselt"; the feed of what just
  happened (calls, new incidents, crews sent and on scene, pursuits starting and ending, incidents closed, the
  crisis), each line a way to its incident.
- **The timeline**: lanes for the report's highlights and the crisis, the 112 calls (by priority, a missed call
  hollow), the crews sent (in co-op by the seat that sent them), the pursuits as spans; the open incidents as a curve
  below; the crisis as a band; the planned end of a shift that ran into overtime; what was not recorded hatched. A
  click jumps there (a mark: shortly before it, and its incident is shown; a crew sent is followed; a pursuit is
  watched from its lead crew; the crisis takes the map there), a drag scrubs.
- **Controls**: play and pause, the previous and next event (calls, pursuits, the crisis, highlights), the speed (1,
  3, 10 or 30 game minutes a second, 3 by default), and "Aeglusta jälitustel" (on by default): during a pursuit the
  replay plays a minute a second, so the chase can be followed.
- **The crews**: every crew with its status and incident at the moment (or only those at work); a crew picked is
  followed on the map, with its card: type, vehicle, station (in sector co-op its desk and player), its status now, a
  bar of its statuses over the shift (a click jumps there), its incidents with their times (a click shows each).
- **The incident** picked: its priority, title, number and address, its moments (the 112 call, created, the first crew
  sent, the first on scene, closed), how it ended, its crews (a click follows one), "Vaata algusest".
- **Keys**: Space plays and pauses, ← → a minute (Shift: ten), PgUp PgDn (or , .) the previous and next event, Home End
  the start and end, 1-4 the speed, F follow, Esc closes the incident, then the crew, then the replay. Nothing under
  the dialog hears them (the report's Enter among them).
- On a narrow screen the crews are a drawer, closed until asked for; the crew followed shows as a bar on the map.

## 5. The ways in

- **The report**: the "Kordus" card under the result strip, with a picture of the shift as a long exposure (every
  drive of every crew on the menus' map of Estonia: runs to incidents bright, patrols faint, transports purple,
  pursuits red; the incidents as dots by priority), what it holds (calls, crews sent, pursuits, kilometres) and
  "Vaata kordust". Each highlight has a play button that opens the replay at its incident.
- **The joint report** of a co-op shift (docs/MULTIPLAYER.md section 14): each moment of its timeline opens the replay
  half a minute before it.
- **The history** (docs/MULTIPLAYER.md 14.4): a round played on this device offers its replay ("Vaata kordust", and
  the timeline's moments).

## 6. Limits

- A replay is on the device that played the shift; another device, or the other players of a room, have their own.
- A recording begun late (the shift was started on another device) has no beginning; a page closed without its
  recording kept (a crash between two keeps) leaves a gap of up to 30 seconds.
- Director mode is not recorded (a sandbox with no end).
- The replay shows the map: the radio, the call dialogues and the registry are not in it.
- Each player's replay in a room is what their client saw: on the game server the same state, in lockstep the same
  after any resync.
