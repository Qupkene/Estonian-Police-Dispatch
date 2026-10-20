# Mitmikmäng: multiplayer over plain HTTP

The owner's decisions: three modes, all selectable by the players, up to four players, accounts required,
and co-op XP counts in every player's career.

| Mode | Estonian name | What it is |
| --- | --- | --- |
| (a) sector co-op | Sektorite koostöö | One shared shift. Each player runs a neighbouring sector desk of the same prefecture. |
| (b) role co-op | Rollide koostöö | One shared area, the roles split: a call-taker answers 112, a dispatcher sends the crews. |
| (c) same-seed competition | Võistlus | Everyone plays the identical shift on their own; the results are compared. |

Phase 1 (this document plus the code next to it) builds the shared room foundation and mode (c) end to end.
Modes (a) and (b) need a shared, synchronised simulation; section 4 chooses how, section 6 plans the phases.

Code: `server/lib/rooms.php` (routes in `server/api/index.php`, schema step 4 in `server/lib/db.php`),
`src/net/rooms.ts`, `src/sim/room.ts`, `src/ui/screens/LobbyScreen.tsx`, `src/ui/screens/shell/RoomBoard.tsx`,
the report (`src/ui/screens/ReportScreen.tsx`) and the menu row (`src/ui/screens/MenuScreen.tsx`). API reference:
docs/SERVER.md, "Multiplayer rooms".

## 1. Constraints

- **Hosting.** PHP 8.4 (FrankenPHP) and SQLite, deployed from `main` by pulling the repository. There is no
  WebSocket server and none can be added without the owner. Everything real-time runs over plain HTTP.
- **No long polling.** A held request occupies one PHP worker for its whole wait; FrankenPHP runs a small
  fixed pool (a few threads per CPU), so ten rooms of four players waiting 25 s each would starve every
  other route. Short polls cost a couple of milliseconds each and free the worker at once. All polling in
  this design is short polling, about once a second, with tiny "nothing changed" answers.
- **SQLite.** One writer at a time (WAL lets readers run alongside). The design keeps polls read-only and
  writes rare: presence is written at most every 5 s per player, everything else only on a real change.
- **The simulation is deterministic.** `src/sim` keeps its seeded RNG (mulberry32) in `SimState`, steps in
  fixed 5 s substeps (`SUBSTEP_MS`), and with `fixedSchedule` draws calls from a separate stream, so the
  calls come at the same times and places whatever the player does (the daily challenge relies on this).
  The engine never reads `Date.now()` or `Math.random()` (the only `Date.now()` in `src/sim` is a career's
  creation date and the daily helpers' "today"). The map's road routing (`src/map/roads.ts`) is display only:
  the engine moves units along straight lines between `departAt` and `arriveAt`, so engine state never
  depends on map tiles or web workers.
- **Data safety.** Migrations are additive only. Deleting an account removes its room rows.

## 2. The room foundation (built)

A room is the meeting point of every mode: a code, a lobby, a host, up to four seats and the shift's options.

**Lifecycle.** `lobby` → (host starts) → `running` → (every player still in has a result, or 12 hours) →
`finished`. A lobby nobody polled for 30 minutes becomes `closed`, and so does a lobby everybody left.

**Code.** Six characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I, O, 0, 1, so a code read aloud or off a
screen is unambiguous), about 10^9 codes. Typed codes are upper-cased and lose spaces and dashes. The UI shows
them as two groups of three (`K7M 2QX`).

**Seats.** Seat 0 to 3; the creator is the host and always counts as ready. A player is in one open room at a
time: creating or joining another one leaves the previous one. The host's role passes to whoever joined
first among those still in when the host leaves (or deletes their account).

**Options** (host only, lobby only; a change clears the others' ready marks): prefecture, area (a sector of
it or the whole prefecture), difficulty, length (2, 3, 4 or 6 game hours) and part of the day. The seed and
the day are chosen by the server and revealed only when the shift starts, so nobody can play it early.

**Polling.** `GET /api/rooms/{code}?v=<tag>`. The tag is `<revision>.<online seats as a bit mask>`; the
revision grows on every change (join, leave, ready, options, start, result, host change, expiry). While the
tag still matches, the answer is `{ v, unchanged: true }` (about 30 bytes). A player counts as online when
they polled within the last 20 s; their `seen` stamp is written at most every 5 s, so a poll is a read.
The client (`RoomPoller` in `src/net/rooms.ts`) polls every second in the lobby, every 2 s once the shift
runs, every 5 s while the page is hidden, backs off to 15 s after failures, and stops by itself on 404.

**Tables (schema step 4).** `rooms` (code, mode, host, options, seed, day, state, revision, times),
`room_players` (room, user, seat, ready, joined, seen, left_at), `room_results` (room, user, score, grade,
incidents, arrests, at). Foreign keys cascade from `users` and `rooms`; `rooms.host_id` is set to NULL.

**Expiry and cleanup.** Time rules are applied whenever a room is read or written (no cron): the 30 minute
lobby rule and the 12 hour running rule above. Rooms older than 30 days are deleted with their players and
results, swept whenever a room is created.

**Abuse limits.**
- Accounts only: every room route needs a session (401), state changes need `X-EPD: 1` (CSRF guard) and
  honour `X-EPD-User` (409 `user_mismatch`).
- New rooms: 20 per IP and hour (`rate_events`, bucket `room_create`), and one open room per player.
- Wrong codes: 30 unknown or malformed codes per IP in 10 minutes, then 429 (`room_miss`). A room you are
  not in answers 404 exactly like a missing one, so codes cannot be probed through the poll route.
- Bodies are the small JSON endpoints' 64 kB; every field is validated like `POST /api/score`.
- Polls are not rate limited: they are cheap reads, one at a time per client, and a misbehaving client only
  burns its own worker slot for ~2 ms per request.

**Account deletion.** In the same transaction as the rest of the account: the player's seats and results
are removed, the host's role passes on, a room nobody is left in closes (`epd_rooms_forget_user`).

## 3. Mode (c), Võistlus (built)

1. The host creates a room (mode `race`), the others join with the code and mark ready.
2. The host starts once at least two players are in and all are ready. The server stores the start time, the
   day (Europe/Tallinn) and reveals the seed.
3. Every client sees `running` on its next poll and goes on shift by itself. The shift follows from the room
   alone (`roomShiftOptions` in `src/sim/room.ts`): the seed, the room's day at an hour of the chosen part of
   the day (picked by the seed), the options, mode `free`, `fixedSchedule: true`. The weather comes from the
   seed inside `createShift`. So every player gets the same world and the same calls at the same times.
4. The run is marked `sim.flags.room = <code>`. It is saved and resumed like any shift, so a reload or a
   closed tab continues it; the menu row shows the open room and leads back to it (`GET /api/rooms`).
5. The report posts the result once to `POST /api/rooms/{code}/result` (never to `/api/score` or
   `/api/daily`) and shows the room's board, polled every 2 s until every player still in has finished.
   A player who leaves stays on the board as having left; a shift without incidents is refused
   (`empty_shift`), as on the other boards.

**XP and career.** As a normal free shift: the report shows the XP, the career is not touched, the normal
leaderboard is not touched.

**Trust.** Results are reported by the client, as for the daily challenge, and validated the same way. A
modified client could send a better score; rooms are played among people who invite each other, and nothing
is won. If that ever matters, phase 2's command log gives a way out: a client can upload its commands and any
other client (or a headless job) can replay the shift from the seed and confirm the score.

## 4. Co-op (modes a and b): the choice

Co-op needs one shared shift that several people act on. Three ways to do that over HTTP:

**A. Host-authoritative state streaming.** The host's browser runs the only simulation and publishes its state;
the others render it. Rejected: a `SimState` is about 175 kB after two game hours (36 kB gzipped) and over a
megabyte late in a long shift. Even deltas at 1 Hz for three viewers mean megabytes per minute through PHP and
SQLite, the viewers' map moves in 1 s jumps, and the host's machine and connection carry everyone.

**B. Host-authoritative command relay.** Clients send commands, the host's sim applies them in tick order and
publishes the outcome. The commands are small, but the others still need the outcome to draw the map, the
queue and the calls, which brings back A's payload. Its good half, the host as the clock and the reference,
is kept below.

**C. Deterministic lockstep over a server-sequenced command log (chosen).** Every client runs the same sim
from the same seed. Every input that changes shared state is a command in one ordered log; every command
takes effect at a fixed turn; the same commands at the same turns give the same state everywhere. The server
only appends and relays commands of about 100 bytes, and the map stays smooth because each client simulates
locally. The engine is already deterministic (section 1), and `fixedSchedule` already proves that two runs of
the same seed stay identical over a whole shift.

### 4.1 Turns and the clock

- A **turn** is one second of real time. Its game length is `speed × 1 s`, where `speed` is shared state
  (changed only by commands) and the existing slow-down while a 112 call is open (`CALL_SPEED`) becomes a rule
  inside the sim, computed from shared state. Each client steps exactly one turn's game time at a time with
  `step()`, so the 5 s substep boundaries fall on the same instants everywhere.
- The **server is the sequencer**: a command posted while the server's turn is `T` (from `rooms.started`, the
  paused time and the turn length) is stamped turn `T + D` with a growing id; `D = 2` is the input delay.
  Within a turn, commands apply in id order. Pause and speed are host commands like any other.
- A client may simulate turn `k` once it holds every command up to the server's current turn, because nothing
  new can land on a turn earlier than `T + D`. With 1 s polls and `D = 2`, a client stays one turn ahead of
  starvation, and every player sees the room about two seconds behind real time, all at the same moment.

**Latency.** A command takes effect for everyone (its issuer included) 2 to 3 s after the click: `D` turns plus
up to one poll. Dispatching is not twitch play; the UI marks the action as sent at once (a pending state on the
unit or the call) so the wait never feels like a lost click. During a 112 call the game runs near real time
(speed 2), so the delay is a few game seconds there.

### 4.2 Desync detection and recovery

- Every 10 turns each client puts a hash of a canonical digest in its poll: RNG state, `now`, id counters,
  incident ids with their state and priority, unit ids with status, incident and arrival time rounded to the
  second, and the stats. The server keeps the latest hash per seat and turn.
- The host's hash is the reference. A client whose hash differs gets `resync: true` in its next poll answer.
- **Why it can still happen:** the engine uses `Math.sin`, `cos`, `atan2` and `sqrt` (distances and bearings).
  The JavaScript specification lets engines approximate the transcendental functions, so Chrome, Firefox and
  Safari may differ in the last bit, and such a difference can grow into a different unit choice. Rounding in
  the digest avoids false alarms; resync repairs real drift.
- **Snapshots.** The host uploads its `SimState` (gzipped, at most 2 MB) with its turn every 60 turns and on
  request. A client that desynced downloads the latest snapshot, replays the log from that turn as fast as the
  CPU allows (no rendering), and rejoins at the live turn.

### 4.3 Reconnect, a player leaving, the host leaving

- **Reconnect** is a resync: the latest snapshot plus the log since. The local autosave is not used for a
  co-op shift (the server's log is the truth); it only says which room to return to.
- **A player leaving** (the leave button, or offline for 60 s): the server sequences a `seat_left` command.
  In sector co-op the seat's desk falls to an AI colleague (the Career 2.0 neighbour desks already handle a
  sector without a player); in role co-op the remaining players take the role over (with two players left,
  one gets both). Coming back sequences `seat_back` and the seat returns.
- **The host leaving:** the host role (pause and speed, snapshot uploads, the reference hash) passes to the
  earliest-joined player still online; the server announces it in the poll answer. Every client holds the full
  state, so nothing is lost; the new host uploads a snapshot at once.
- **Everybody leaving** finishes the room. A running co-op room nobody polled for 15 minutes is finished too.

### 4.4 Commands and permissions

The commands are the existing functions of `src/sim/commands.ts` (`acknowledge`, `setPriority`,
`dispatchUnits`, `recallUnit`, `closeIncident`, `requestAgency`, `replyRadio`, `setUnitBreak`, `markChecked`,
`answerCall`, `askCall`, `toggleInterpreter`, `endCall`, `pursuitAction`), serialised as
`{ k: 'dispatch', a: [incidentId, unitIds] }` with the issuing seat. In a co-op shift the UI calls
`room.issue(cmd)` instead of the function. Permissions (which desk or role may do what) are checked inside the
sim when the command is applied, so every client rejects a forbidden command identically; the server only
checks that the seat belongs to the caller. Selection, camera and panels stay local and never enter the log.

### 4.5 Abuse limits and load

- Commands go up in batches (what the player did in the last quarter second): at most 20 commands and 4 kB per
  batch, 2 batches per second per player, known kinds and id shapes only, at most 20 000 commands per room.
- Load: four players polling once a second is 4 requests per second per room. A poll is a few indexed reads
  (`rooms`, `room_players`, commands after an id) and a few hundred bytes; the only frequent writes are
  commands (a dispatcher issues a few per minute) and presence (one row per player every 5 s). Ten busy rooms
  are about 40 short requests per second, well within one PHP and SQLite host.
- Snapshots are the only large payload: one upload per minute per room, downloads only on reconnect or desync.
- The command log and the snapshots exist only while the room runs: they are deleted when it finishes or
  closes. They name seats, not accounts; a deleted account's seat simply becomes empty.

### 4.6 XP and career effects in co-op

At the end of a co-op shift every client builds the same report (same state), so the team result is the same
everywhere. Each player posts it with their seat's own figures (calls answered, incidents handled, crews
sent). Each player's XP is the team's XP plus a share for their own work. It goes into that player's own career
locally (the career lives in the browser and syncs as the `career` save): XP, rank progress, the shift count and
achievements, but no money, staff, fleet or reputation, which belong to the career's own sector. It is applied
once per room, keyed `room:<code>` in the profile's `paidShifts`, so a reload or a second report never pays
twice. The server keeps each player's row in `room_results` (with the XP) for the board.

## 5. What the co-op modes add on top

**(b) Role co-op.** Roles: *Kõnevastuvõtja* (answers 112, asks the questions, creates the incident, calls the
interpreter) and *Dispetšer* (acknowledges, sets priorities, sends and recalls crews, answers the radio, closes
incidents). With three or four players: two call-takers, or a third role *Registrid* (person and vehicle
queries, `markChecked`). One area, one queue; each player sees the screen of their role.

**(a) Sector co-op.** The host picks the prefecture; each seat takes one desk of neighbouring sectors
(`neighbourSectors`); the shift covers their union. A player's queue shows their sector's incidents, their
crews come from their sector's stations, and a crew can be lent to a neighbour's incident (a `lend` command
the neighbour accepts, or automatic for P1). Empty desks are AI colleagues.

Engine changes for both: the store loop steps whole turns from the log instead of `dtReal × speed`; the call
slow-down moves into the sim; a seat and a role or desk on every command; the permission matrix; per-seat
counters in the stats.

## 6. Phases

1. **Rooms and Võistlus (done).** Schema step 4, the room routes, the lobby, the room shift from the seed with
   `fixedSchedule`, the room board on the report, the menu entry, tests (server, client, two-browser e2e).
2. **Lockstep core.** Schema step 5 (`room_commands` with an index on `(room_id, id)`, `room_snapshots`, clock
   columns on `rooms` with defaults); `POST /api/rooms/{code}/cmd`, `GET /api/rooms/{code}/log?after=&h=`,
   `PUT` and `GET /api/rooms/{code}/snapshot`; the turn loop in the store; command serialisation; the state
   digest; pause and speed. Tests: two sims fed the same log stay hash-equal for a whole shift in every
   prefecture (vitest); Chromium against Firefox and WebKit in Playwright for cross-engine floating point;
   resync after a forced divergence; reconnect mid-shift.
3. **Role co-op (b).** Roles in the lobby, the permission matrix, the call-taker and dispatcher layouts of the
   game screen, per-seat counters, the co-op report.
4. **Sector co-op (a).** Desk choice in the lobby, multi-sector shifts with per-desk queues and crews, lending,
   AI colleagues for empty desks.
5. **Careers and polish.** Co-op XP into careers (section 4.6), achievements, a rematch with the same options,
   an invite link (`?ruum=K7M2QX`), spectators.
