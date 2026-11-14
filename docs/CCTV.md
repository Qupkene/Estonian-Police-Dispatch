# Kaamerad: live surveillance cameras (2.41.0)

Some incidents happen in sight of a surveillance camera. The dispatcher opens the camera from the incident's card and
watches the place live: the trouble itself, the patrol car driving up with its blue lights, the officers getting out,
people running off, the arrest, the ambulance. The picture is drawn from the game's own state on the game's own street
map, and made to look like the feed of a street camera: wide lens, low resolution, grain, a clock burned into the
corner, infrared black and white at night, rain on the dome.

Nothing here changes the simulation. A camera is a second way of looking at what the engine already decided.

## 1. Rules

- **Outdoors only.** A camera hangs on a pole or a wall. What happens inside a building is shown as its door: the crew
  goes in, and later comes out with or without somebody.
- **The picture never contradicts the incident card.** The people are the incident's people (their build, hair and
  clothes from the registry), the vehicles its vehicles (registry colour and kind), the crews the units really sent.
  When in doubt a scene shows less, not something made up: a caller waiting, the crew arriving and looking around.
- **It is a game and says so.** Every frame carries the mark `EPD v<version>` in its lower right corner (the owner's
  wording). Vehicles carry the word POLITSEI and the services' colours; emblems and logos only as docs/PERMISSIONS.md
  allows.
- **No outside service, no downloaded video.** Everything is drawn in the browser. The lazy chunk and its one model
  file come from the game's own server (the Content Security Policy stays `script-src 'self'`, no WebAssembly).
- **Cheap enough for a phone.** One camera at a time, 640x360 pixels, about 12 frames a second, loaded only when a
  camera is first opened.

## 2. Parts

Everything lives in `src/cctv/`. The upper half is plain TypeScript with no DOM and no three.js (testable in node);
`render/` is the only part that draws.

| File | What it is | Depends on |
| --- | --- | --- |
| `math.ts` | scene geometry (metres east and north of the incident), seeded randomness | |
| `types.ts` | `StreetData` (roads, buildings, areas), `Site` (the lie of the land for one camera) | |
| `tiles.ts` | the street around a point, read from the street map (`tiles/estonia.pmtiles`, zoom 15) | pmtiles, vector-tile |
| `procedural.ts` | a made-up street when the map is not there or has nothing usable | |
| `site.ts` | from a street: the road vehicles arrive on, the spot, the door, the lamps, where the camera hangs | |
| `coverage.ts` | which incidents have a camera, and what it is called | sim types |
| `env.ts` | sun, darkness, lamps, snow, rain, fog at the game's clock | sim time |
| `figure.ts` | a person's clothes (`Look`) and poses (`Pose`, acts, gaits) | |
| `vehicle.ts` | a vehicle's body, paint and markings (`CarLook`), its lamps (`CarLights`) | |
| `cast.ts` | the kind of scene an incident makes, its people and vehicles | sim types |
| `stage.ts` | shared types: `Situation` (what the game says now), `Frame` (where everything is) | |
| `situation.ts` | `situationOf(sim, incident, speed)`: reads a `Situation` from the simulation | sim |
| `director.ts` | `Director`: moves the cast as the situation changes; `frame()` | all of the above |
| `session.ts` | one open camera: builds site, light, cast and director from a street, steps them with the game, drives the view, ends the feed once the closed incident's street has emptied | all but three |
| `live.ts` | the lazy chunk's entry: `openCamera(canvas, ...)` checks WebGL 2 (once per page), loads the body model and the street under the window's abort signal, creates the view and the session, returns a handle that also lets go of what the views share | all |
| `render/view.ts` | `CameraView`: three.js scene, light, weather, people and cars of a frame | three |
| `render/world.ts`, `facades.ts`, `textures.ts` | the standing street: ground, roads, houses, trees, lamps | three |
| `render/human.ts` (`people.ts` as fallback) | people: one real body mesh dressed per `Look`, posed by `Pose` | three |
| `render/carbody.ts`, `cars.ts` | vehicles: shaped bodies, markings, switchable lamps | three |
| `render/post.ts` | the camera's lens and recorder (the two screen passes), the burned-in text | three |
| `render/mesh.ts` | `MeshBuilder`: merged triangle meshes with a colour per vertex | three |
| `assets/human.glb` | the base body (see section 11) | |
| `__dev__/` | harness pages for looking at pictures without the game (not in the build) | |

The game's UI part is `src/ui/game/CameraWindow.tsx` (the picture over the map) and a line on the incident card
(section 14). The game's own bundle imports only `coverage.ts` (and types) from here; everything else loads through
`import('@/cctv/live')` (`tests/cctv-lazy.test.ts`).

## 3. Conventions

- **Scene space.** Origin at the incident's coordinate. `x` east, `y` north, metres (`math.ts frameAt`). A yaw is in
  radians from east towards north; a unit direction is `(cos yaw, sin yaw)`. The sim's heading (degrees clockwise from
  north) converts with `yawOfHeading`.
- **three.js space.** `x` east, `y` up, `z` south: a scene point `(x, y)` at height `h` is `(x, h, -y)`. A model stands at
  its own origin facing `+x`; its left is `-z`; `rotation.y = yaw` turns it to a scene yaw.
- **Determinism.** Everything about a scene comes from `hash32(...)` of stable ids (the incident's id, a place's
  rounded coordinate). The same incident shows the same street, camera, cast and choices every time it is opened, on
  every player's screen. Only the fine timing of an animation differs between two viewers.
- **Two clocks.** The game clock runs 15 to 120 times faster than real time (`src/sim/coop.ts TURN_SPEEDS`), so people
  on camera cannot follow it second by second: they would move like a time-lapse. The camera's scene clock runs in
  real seconds whenever the game is not paused. The game decides *what* happens and *when it starts* (a unit arrives,
  the incident closes); the director plays each change at a natural pace. The clock burned into the picture shows the
  game's date, hours and minutes.
- **Language.** Code comments and docs in plain English; UI texts through `src/i18n` (Estonian and English). No em
  dash and no en dash anywhere (owner's rule): write "-", ":" or a new sentence.

## 4. The street (`StreetData`, `Site`)

`tiles.ts` reads the Protomaps v4 basemap tiles at zoom 15 (the same archive the map draws, opened once by
`src/map/streetTiles.ts`): the one to four tiles that cover a circle of 160 m around the incident. Layers used:

- `roads` (lines): `kind` and `kind_detail` give the class exactly as `scripts/build-mapdata.mjs roadClass` reads them
  for cars (`highway`, `major_road`, `minor_road`, living streets), plus `path` kinds (footway, cycleway, path, steps,
  pedestrian) and `rail` (`kind_detail` tram or rail). `oneway`, `is_bridge`, `is_tunnel`, `name` as there.
- `buildings` (polygons): `kind` building (parts are skipped as in the build script); `height` when the map has it,
  else a height from the footprint (section 4.1). A building cut by a tile edge appears in both tiles: pieces with
  the same feature id are kept as separate footprints with the same id (same colour and height), which draws right.
- `landuse` and `water` (polygons): parks, grass, forest and wood become `green` or `forest`; water `water`;
  pedestrian areas `paved`; parking `parking`; sand and beach `sand`; pitches and playgrounds `pitch`.

Tile coordinates become scene metres through Web Mercator and the cosine of the incident's latitude. Features are
clipped to the circle (roads cut at it, polygons kept whole when any vertex is inside 200 m).

Any failure (no archive, a network error, a tile that does not parse, no road within 70 m) ends in
`procedural.ts makeStreet(placeKind, seed)`, a believable street of the incident's kind of place. The picture works
without the map file; `StreetData.source` says which one it is.

### 4.1 Heights and roofs when the map has none

By footprint area `A` and its bounding rectangle (long side `L`, short side `S`), seeded by the feature id:

| Footprint | Building | Height |
| --- | --- | --- |
| `A < 25 m2` | shed, kiosk | 2.4 to 3 m, flat or pitched |
| `A < 260 m2` and `S < 14 m` | detached or small wooden house | 1 or 2 floors (3.4 or 6.2 m), pitched roof (`gable`) |
| `L > 38 m`, `S` 9 to 16 m | panel block | 5 floors (16 m), one in four 9 floors (28 m), flat |
| `A > 1500 m2` | shop, hall, school | 6 to 11 m, flat |
| otherwise | town house, office | 2 to 5 floors (3 m each plus 0.8), flat; in a dense town one in five pitched |

`walk` (pavements) is true for a road of class tertiary to living that has a building within 25 m, and for primary and
secondary roads with buildings within 18 m on both sides.

### 4.2 The site

`site.ts buildSite(street, seed)`:

- **Drive line**: the road nearest to the incident (cars first, then pedestrian streets, then paths), followed past
  its ends through the straightest continuations until it leaves a circle of 120 m. Vehicles enter and leave along
  it. Ends inside the circle are dead ends.
- **Spot**: where it happens. Beside the road on the incident's side: on the pavement at least, at most 9 m in (a
  forecourt), never inside a building, with a clear line to the road.
- **Door**: the nearest wall point within 32 m, with its outward normal.
- **Camera**: a pole on the far kerb 8 to 18 m along the road, else a wall across the way, else a pole on the same
  side, else anywhere with a clear view of spot and road; 5.4 to 7 m up, vertical field of view 48 to 56 degrees.
- **Lamps** every 30 to 34 m along the drive line.

## 5. Which incidents have a camera (`coverage.ts`)

`cameraOf(incident): CameraInfo | null`, pure and synchronous (the queue and the card call it while drawing).

A place either has a camera or not, for good: the decision is `hash01('cam', kind, round(lon * 1500), round(lat * 3000))`
(a cell of about 40 m) against the chance of the kind of place:

| Chance | Places |
| --- | --- |
| 0.95 | gasstation, bank, government, embassy, airport |
| 0.9 | mall, trainstation, busstation, port |
| 0.8 | hospital, hotel, prison, border |
| 0.7 | nightclub, bar, shop, oldtown, stadium, concert, museum |
| 0.55 | parking, school, university, office, kindergarten |
| 0.4 | street, industrial, construction, highway |
| 0.25 | residential, park, church |
| 0.08 | house, ruralroad, beach, cemetery |
| 0 | forest, lake, farm, summerhouse, village |

`CameraInfo`: `{ id: string, name: string, seed: number }`. The id is `K-` and three digits from the cell's hash. The
name is the camera's id and where it is: the street's name without the house number (`Narva mnt`), or the place's name
when the incident has one (`Viru Keskus`); a highway camera is `Teekaamera`. Example: `K-214 · Narva mnt`.

Not for: the tutorial's first steps if the tutorial script says so (flag), incidents whose `closedBy` is set without
any unit having been sent and that closed more than 5 game minutes ago (nothing left to see).

## 6. What the game says (`situation.ts`)

`situationOf(sim, incident, speed): Situation` (`stage.ts`). `speed` is game seconds per real second while the game
runs (the session passes the last running speed while paused, with `paused: true`).

- A unit is listed when it is assigned to the incident, on its way to it, on scene, or in its `unitHistory`.
  - `here`: status `onscene` with this incident.
  - `near`: `enroute` to it with `(arriveAt - now) / 1000 / speed <= NEAR_S` (7 real seconds).
  - `coming`: `enroute` to it, further away.
  - `left`: was here or sent here and is not any more (released, sent elsewhere, driving in a pursuit, transporting).
  - `takes`: `'arrest'` or `'hospital'` when it leaves on a transport beat to the cells or to hospital.
  - `from`: the yaw from the incident towards where the unit is (its position, or the vertex before last of its path
    when it is already close).
- Agencies: every `agencyNeeds[].requested`; `here` once `arrived`, `near` inside the same 7 seconds.
- `pursuit`: `on` while `incident.pursuit` has not ended, `over` after.
- `searching`: an unfinished `incident.search`.
- `outcome`: the incident's outcome when it has one (result, arrests, injuries).
- `progress`: the share of the on-scene work done, 0..1 (how the engine counts it towards closing).

## 7. The cast (`cast.ts`)

`sceneKindOf(incident)` gives one of eleven kinds from the template's category, tags, id and kind of place:

| Kind | When | What is on the street before anyone comes |
| --- | --- | --- |
| `brawl` | fights outdoors, street robbery | people fighting, witnesses at a distance |
| `threat` | armed suspects outdoors | one person with a weapon, others keeping away |
| `disorder` | drunk, loud, unwelcome people outdoors | one to three people swaying, arguing, sitting |
| `lying` | drunk in the snow, overdose, injured pedestrian | somebody on the ground, the caller beside them |
| `crash` | collisions | two vehicles at angles in the road, hazard lights, the drivers |
| `stop` | drunk or wanted drivers, suspicious vehicles | a vehicle at the kerb with its driver |
| `theft` | thieves and vandals at work outdoors, alarms | somebody working at a car or a door, a lookout |
| `indoor` | domestic, anything under a roof | the door; perhaps the caller waiting outside |
| `crowd` | demonstrations, fans, evacuations | twelve to twenty people |
| `fire` | fires | smoke from the building or the vehicle, onlookers |
| `empty` | false alarms, anything a street camera would not show | nothing, perhaps the caller |

`castOf(sim, incident, template, dress)` adds the people (everyone of the incident except the missing and the dead,
dressed by `figure.ts` for the weather), the vehicles, and the choices made once by seed: `armed`, `drunk`, `down`
(somebody already on the ground), `live` (the suspects are still there), `runs` (somebody runs when the police come
in sight), `mayFlee` (a vehicle pursuit can start).

## 8. The director (`director.ts`)

```ts
class Director {
  constructor(site: Site, cast: Cast, opts: { night: boolean; quiet?: boolean });
  /** Follow the situation for `dt` real seconds. The first call settles the stage (see 8.6). */
  update(sit: Situation, dt: number): void;
  /** Everything on stage now, for the renderer. */
  frame(): Frame;
  /** 'open' | 'seen' | 'contact' | 'closing' | 'after': where the story is (tests and the picture's note read it). */
  readonly phase: string;
}
```

The director is plain state stepped by `update`: no timers, no three.js, no randomness outside `rand(seed)`.

### 8.1 Bodies and steps

A person on stage has a position, a yaw, an `Act` (what it does standing still), and a queue of steps:

- `go` (walk, run, stagger, back away or be escorted in a straight line to a point), `path` (along several points),
- `act` (an act, facing a point, for some seconds or for good), `wait`,
- `door` (shrink into the door or grow out of it in half a second), `hide` and `show`, `call` (run a function).

Walking advances a step phase by distance covered, so feet do not slide (`figure.ts STRIDE`, `PACE`). When the act
changes, the pose blends from the old one over 0.3 s. A body turns towards where it walks or what it faces at no more
than 7 rad/s. `figure.ts DOWN` acts (lying, sitting) do not turn.

People leave the scene along the pavement of their side to an end of the drive line and are removed there. People
never walk through buildings: door to pavement to exit, or straight lines between points that `site.ts clearLine`
allows.

### 8.2 Vehicles

A vehicle follows a path at a speed that eases in and brakes to a stop at its end; its yaw is the path's direction.

- **Lanes** (drive-line frame: `s` metres along, `lat` metres to the left). Right-hand traffic: a vehicle going from
  end a to end b drives at `lat = -width/4`, the other way at `+width/4`; on roads narrower than 5.4 m at `lat = 0`.
- **Slots.** Emergency vehicles stop at their kerb (`lat = -/+(width/2 - 1.15)`): from a at `s = at - 7 - 6.4 k`, from b
  at `s = at + 7 + 6.4 k` for the k-th vehicle from that side, moved back while a slot is taken. In a `crash` the first
  slot is 12 m before the wreck (its lane is blocked).
- **Arrival.** A unit that turns `near` spawns at the end of the drive line on the side it comes `from` (the other end
  if that one is a dead end), blue lights and headlights on, and drives to its slot so as to stop when `eta` runs out
  (between 3.5 and 10 s; faster if the game says `here` first).
- **Crew.** Once stopped: lamps stay on at night, blue lights stay on while the incident is open. Officers appear at
  their doors (driver left front, then right front, then the rear doors; a van's crew at its side door), up to two
  for a patrol, up to four for rapid response and special units, and walk (run when the scene is `threat` or the
  incident's priority is 1) to their posts. Somebody getting out on the road side walks round the front of the car.
- **Leaving.** A unit that turns `left` (or disappears from the situation): its officers walk back, get in (hide), the
  car pulls out and drives off the far end (a dead end: it turns round and leaves the way it came). Blue lights off
  unless it leaves for a pursuit or with `takes`. A closing scene (8.5) is played out first, for at most 14 s.
- **Other services** arrive the same way (`vehicle.ts lookOfAgency`): an ambulance brings two paramedics, the rescue
  service a lorry with three rescuers. They leave when the incident has closed and their part is played.
- **Passing traffic.** On through roads of class tertiary and up, a car every 6 to 25 s by class and hour (fewer at
  night), headlights at dusk and night. It keeps clear of stopped vehicles by moving towards the middle. None while
  a `crash` blocks the road. `quiet` (the tests) turns it and the passers-by off.
- **Passers-by.** One every 10 to 40 s along a pavement (rarely at night, none in heavy rain or storm), on the far
  side while a `brawl` or `threat` is open.

### 8.3 Posts

Each kind of scene keeps a list of posts for the officers who arrive: where to stand, what to face, what to do
(`guard`, `talk`, `notes`, `aim`, `aid`, `direct`, `look`, or "go in at the door"). An officer takes the first free
post; when all are taken the rest stand guard by their car. The first officer reaching a post is the moment of
`contact`.

### 8.4 The kinds, phase by phase

Phases: `open` (nobody has come) -> `seen` (the first police car is in sight: 3 s before it stops) -> `contact` (the
first officer is at a post) -> `closing` (the outcome is known and being played) -> `after`.

**brawl.** Suspects and victims pair up and fight (acts `fight` and `grapple` in turns of 5 to 9 s, the pair drifting
and slowly circling round its middle); a suspect without an opponent rages (`argue`) at whoever is near. With `down`,
after a while one victim falls (`fall`, then `lie`) and the suspect kicks (`kick`) and then stands over them.
Witnesses and the caller stand 7 to 10 m away (`phone`, `point`, `cold` in winter). *Seen:* with `runs`, one suspect
breaks off and runs along the pavement away from the arriving car and is gone; the caller waves. *Contact:* the fight
stops; suspects put their hands up for a moment, then stand or argue; a victim on the ground stays there. Posts: one
officer by each suspect (`guard`), one with the victim (`notes`, or `aid` kneeling when the victim is down), the rest
`guard` between the groups. Paramedics kneel at a victim on the ground (`aid`).

**threat.** One suspect with a weapon (`brandish`), pacing a few metres to and fro. Everybody else keeps 8 m or more
away (`cower`), backing off at first. *Contact:* officers stop 7 to 9 m from the suspect and aim (`aim`); after 2 to 4 s
the suspect raises their hands (`handsUp`), then kneels (`kneel`); the first officer walks up and holds them (`hold`).

**disorder.** One to three people at the spot: swaying (`sway`), arguing with each other, sitting on the kerb, smoking,
staggering a few metres and back. *Contact:* they turn to the officers (`talk`, `argue`, `sway`); posts beside them
(`talk`, `notes`, `guard`).

**lying.** The victim lies at the spot (in the lane itself when the template is about somebody in the road); the
caller stands or kneels beside (`phone`, then `wave` when the car is seen). Posts: `aid` kneeling at the victim, `notes`
with the caller. Paramedics: `aid`, or `cpr` when the incident's true priority is 1.

**crash.** Two vehicles in the road at the point nearest to the incident, one in its lane turned 25 degrees, the
other across it, hazard lights blinking; a single-vehicle crash (a ditch, an animal) is one vehicle half off the road.
Drivers stand by their cars (`phone`, `argue`); with `down`, an injured person sits against a car or lies beside it.
Posts: `notes` with the drivers, `direct` in the road 8 m before the wreck, `aid` at the injured.

**stop.** The suspect's (or involved) vehicle stands at the kerb near the spot, lamps on at night. The driver stands
at their door (`sway` when `drunk`, else `idle` or `smoke`) or sits inside (not shown). Posts: at the driver's window
(`lean`), on the pavement behind the vehicle (`guard`). Six seconds after contact a driver who was inside gets out.
*Pursuit* (`situation.pursuit` turns `on`): the driver jumps in, the vehicle pulls out hard and is gone off the far
end; the officers run to their car and follow with blue lights (their unit turns `left` in the situation).

**theft.** With `live`: the thief crouches (`crouch`) at a victim's car door, a bicycle or the building's door, a
second suspect keeps watch (`look`); a suspect vehicle waits nearby with its lamps off. Without `live` it is an
`indoor` scene (the thief has gone). *Seen:* with `runs` the thieves run (or drive off in their vehicle). *Contact:*
anyone left raises their hands. Posts: beside each suspect, one looking at the damage (`lean`), one with the caller.

**indoor.** With a caller or a witness in the cast, half the time (by seed) they wait at the door (`phone`, `smoke`,
`cold`, `idle`) and wave when the car is seen. Posts: the first two officers go in at the door; a third stays outside
(`guard`). While the crew works, now and then (every 25 to 40 s) one officer comes out, walks to the car, leans in
(the radio), and goes back. Paramedics go in. Without a door in sight the officers walk off round the nearest corner
instead.

**crowd.** The extras stand in a loose cluster 6 m across at the spot (`idle`, `talk`, `chant` for demonstrations and
fans, a few `argue`; pairs `fight` when the template is a riot or a clash). Posts: a line of officers 1.5 m apart
between the crowd and the road, facing it (`guard`).

**fire.** Smoke from the door building at 5 m (or from a vehicle), strength 1; three to six onlookers (`point`,
`phone`, `cold`). Posts: `direct` and `guard` keeping people back. When the rescue service is `here` its crew stands
before the building (`aim`: the hose) and the smoke fades to 0.15 over 30 s.

**empty.** Nothing; a caller in the cast may wait as in `indoor`. Posts: `look` at the spot and near the door.

### 8.5 How it ends

When the situation has an outcome (phase `closing`):

| Result | What is played |
| --- | --- |
| `arrest` | For each arrest (as many as there are suspects on stage): the suspect is cuffed (`handsUp` 1 s, then `cuffed`), an officer holds them (`hold`), both walk to the rear door of the officer's car on the kerb side (gait `escort`, the suspect half a metre ahead), the suspect gets in (hide). Other suspects are let go and walk off. |
| `escaped` | A suspect still on stage bolts and runs off along the pavement; the nearest officer runs ten metres after them and comes back. Nobody is taken. |
| `hospital` | With an ambulance here: the paramedics bring the patient to it (a patient who was down gets up via `sit`; from an `indoor` scene they come out of the door together) and the patient gets in at its rear. Without one: the patient sits (`sit`) with an officer kneeling beside (`aid`). |
| `tragedy` | Whoever is down stays down; paramedics stop and stand (`kneelUp`, then `stand`); officers stand guard; nobody leaves in a hurry. |
| `warning`, `fine`, `report`, `resolved`, `referred`, `unfounded`, `false_alarm` | An officer talks or writes for a few seconds (`notes`), then everyone of the incident walks off their own way (drunk people stagger; residents go in at the door). In a `stop` the driver gets back in and drives off, except after an arrest. Crashed vehicles stay; a vehicle that can drive leaves after ten seconds. |
| closed without units (`closedBy` referral, phone, prank, duplicate, expired) | The people of the incident drift away within twenty seconds; an `indoor` caller goes in. |

From an `indoor` scene the officers come out of the door first (with the cuffed suspect or the patient).

Then the crews leave as their units are released (8.2), and the phase is `after`: the street with its passing traffic.

### 8.6 Opening a camera in the middle

The first `update` builds the stage for the situation as it is and then runs the scene forward 90 s in steps of 0.2 s
with the same situation, without drawing: cars that were `here` are parked with their crews at their posts, people
who ran are gone, a closed incident's street is empty. No special "instant" paths exist; whatever plays live also
settles a stage.

While `situation.paused` is true `update` moves nothing.

## 9. The picture

- **View** (`render/view.ts`). `CameraView(canvas)`, `setHumans(base)`, `setScene(site, env)`, `setEnv(env)`,
  `render(frame, osd, zoom, panX, panY)`, `dispose()`, `dead`; `FRAME_W`, `FRAME_H`, `canRender()`. One shadow-casting
  sun by day; at night up to six lamp lights with pools on the ground, up to three blue lights that flash with the
  cars' bars, and the camera's own infrared lamp when its picture is black and white. Paint and glass reflect a small
  sky built for the hour.
- **Street** (`render/world.ts`). One call builds a handful of merged meshes. Houses get the front of their kind
  (`facades.ts`: plaster, panel block, brick, boarded wood, glass office, sheet-metal hall) with a ground floor of
  doors, windows and shop fronts, lit windows at night; flat roofs have parapets and roof boxes, pitched roofs
  chimneys. The ground has the grain of asphalt, paving or grass, kerbs, a centre line, pedestrian crossings, parking
  bays with parked cars, manhole covers, and a soft shade where walls meet it. Trees are birches, lindens, pines and
  spruces by season (bare in winter, yellow in autumn); private houses have hedges or fences; streets have signs and
  bins.
- **People** (`render/human.ts`). Section 11's base body, padded where clothes are, proportioned for women and
  children, painted per person (jacket, trousers, skin, hair, a police vest with reflective bands and POLITSEI on the
  back), with hair, cap peaks, rucksacks and belt kit added. `figure.ts` poses drive the skeleton.
- **Vehicles** (`render/carbody.ts`, `cars.ts`). Bodies shaped from cross-sections at real sizes; markings as small
  paintings on the sides and bonnet. Estonian police, ambulance and rescue vehicles follow the real ones as closely
  as the research allows (section 10).
- **Lens and recorder** (`render/post.ts`). Barrel distortion, softness, colour fringes, a trail in poor light, drops
  on the dome in rain; then stream blocks, grain, infrared black and white with a hot centre, dark corners, scan
  lines, a torn line now and then, lifted blacks, and the burned-in text. Each camera differs a little by its seed.

Budget per frame at 640x360: under 300 000 triangles, under 120 draw calls with a full street, a dozen people and six
vehicles; no shader compiled after the first second of a scene.

## 10. Emergency vehicles of Estonia

What the models follow, and why. Sources: Government regulation no. 77 of 16.06.2011 on the marking of alarm vehicles
(version in force since 12.06.2026, read on riigiteataja.ee), dated photos on Wikimedia Commons (2012 to 2025) and a
Police and Border Guard Board press photo of 2022. Nothing from a photo is copied or traced; the photos decided the
shapes and proportions. Where the sources leave a question open, the model takes the most plausible reading, marked
*chosen* below.

**Police (PPA), the current scheme (from about 2018).** The law fixes white as the main colour and blue as the
contrast, on the doors, the bonnet and the tailgate or rear wall, below the windows at least; reflective blue and
yellow patterns on the front and sides up to half the body's height and blue and yellow at the rear.

- White body. All four doors blue below the windows down to the sill; the window frames stay as the car has them.
  The whole top of the bonnet blue to its shut lines, white `POLITSEI` across it, read from in front (not mirrored).
- `POLITSEI` in white bold capitals about 12 cm tall on the upper half of the front doors, the same on both sides.
- On a patrol car (Superb 3777, 2023) the lower half of the doors, from door mid-height to the sill, is a band of
  fluorescent yellow-green blocks on reflective blue, the yellow as wide as the blue between (about 0.27 m), leaning
  27 degrees with their tops towards the front on both flanks. It runs from the front wheel arch to the rear one:
  the first block stands on the white front wing just behind the arch, the last runs into the rear wing. Under it,
  parted by a thin blue line, a row of short yellow and blue steps along the sill, shifted half a block. The band
  glows a little at night, as reflective film does in the camera's light.
- A four-digit board number in bold blue on the white front wing, as tall as the `POLITSEI` letters and level with
  them, ending just before the front door (the model's number is made up); on the rear quarter a phone sign with
  `112` and `www.POLITSEI.ee` in small blue letters.
- Mirrors: a compact housing on a black sail at the front corner of the side window, its foot at the belt line;
  blue on the patrol Škodas (the 2023 photo), white on the ID.4, black on the community Kodiaq and on every van.
- A low, slim light bar (1.22 x 0.28 x 0.065 m) over the B-pillar on short black feet on the roof rails: a silver
  clear lens in segments 0.15 m apart over a thin dark grey base, the same from both ends; two small LED heads on a
  bracket over the front plate. The left and right halves flash in turn. A lit lens shows as a flat flare on its own
  half of the bar; a wider glow and the blue light thrown on the road and the houses come only with the dark (by day
  no beacon lights up the street).
- *Chosen:* the rear of an estate or SUV in this scheme was not in any photo. The model gives the tailgate below the
  rear screen the contrast blue with `POLITSEI` and the plate, and a band of yellow-green and blue chevrons meeting in
  the middle along the bumper, as the law allows and as the vans' rear doors show.
- Community officers' cars (`lookOfUnit('community', ...)`, `marks: 'local'`): the same blue doors and bonnet without
  the reflective band and without the roof bar; their blue lights are behind the top of the windscreen and in the
  grille (a 2024 photo of a Kodiaq in Tapa).
- Vans (Mercedes-Benz Vito 3684 of 2023 as the model for the Transporter and the Sprinter): white; the cab door blue
  to the sill with `POLITSEI`; the cargo side blue from the windows down to 0.78 m, then a white gap, then from 0.62 m
  to the sill the yellow-green band on dark navy in two rows split at the moulding; `112` and the web address on the
  upper rear panel. Bumpers, a moulding along the sill (with a grey trim line on it) and the arches' rims in
  unpainted black plastic. The rear doors blue: `POLITSEI` large across both in the upper third, the board number on
  the right door only with `112` and the web address under it, yellow-green chevrons meeting in the middle below
  them. A light bar at the front and at the back of the roof and LED modules along the roof's edges.
- Unmarked cars (Škoda Superb liftback, BMW 530d, VW Passat; dark metallic paint, no markings): blue LED heads hidden
  in the grille, behind the top of the windscreen on the passenger's side, inside the rear screen's upper corners
  and at the rear reflectors, seen only when they flash; nothing on or above the roof (a 2023 photo of an unmarked
  Superb in Tallinn).
- No crest: no photo shows the PPA emblem on a car, and docs/PERMISSIONS.md covers the logo only where it lists it.
- Older scheme (until about 2018, Octavia II and Superb II): doors blue including the window frames, blue-lens light
  bar, `INFO 612 3000` on the rear. Not modelled: the game's picture is of 2026.

**Bodies.** Each police model has its own measurements and character (render/carbody.ts `MODELS`): Škoda Octavia IV
Combi (most stations' patrol car), Superb III Combi and liftback, Kodiaq I (upright tailgate, black cladding),
VW Tiguan, Scala, ID.4 (short bonnet, sloping tail), Toyota RAV4, Nissan Patrol, VW Amarok (double cab and bed),
VW Transporter T6.1, Mercedes-Benz Vito (a longer bonnet and a more raked windscreen than the Transporter) and
Sprinter. `lookOfUnit` picks the body from the unit's vehicle name. The skin has a shoulder crease 8 cm under the
belt line, the roof falls towards the tail, the nose and tail round off in plan and a car's bumper face leans back;
the arches hug the tyres (3 cm), the tyres have a rounded shoulder and a 10 cm sidewall, the rims sit 3 cm back.
Fronts follow the make: a Škoda's low, wide black grille with a thin chrome frame and the badge on the bonnet's lip,
VW's slim slot, and for cars without a model three neutral fronts picked by the plate, with no brand marks. Paint
and glass are under a clear coat that mirrors the sky; tyres, bumpers and cladding are rough unpainted plastic.

**Ambulance.** White with red (Tallinn and Tartu; the law allows white or yellow with red), on a high-roof Sprinter
panel van: a dark grey lower band and bumpers, a red band 0.3 m high at the handles with `TALLINNA KIIRABI` in white
and the unit's number over the front wing, a red stripe under the roof edge, a red bonnet with `KIIRABI`, a red lamp
fairing with `KIIRABI` over the windscreen, and at the rear a red band with `17 KIIRABI` under dark door windows.
The service's roundel is a stand-in (a red ring with a plain yellow cross). Blue lights only: a fairing across the
front of the roof, two in the grille, and on the rear corners of the box clear blue lenses that flash in turn with
the front bar. *Chosen:* the green chequer that the 2025 rule
allows was not seen on any ambulance, so it is not drawn.

**Rescue Board.** The main engine (Scania P): a forward-control crew cab with two doors a side, upright to the
windscreen and raked 8 degrees above it, its corners chamfered; a black bumper with rectangular headlamps at its
ends, a dark grille panel with two blue lamps over it and a dark band under the windscreen; the equipment body down
to 0.6 m with arches cut round the wheels, twin tyres at the back, aluminium roller shutters, `112` on the crew
door, `PÄÄSTE` over the windscreen and on the fascia, a light bar on the cab roof and blue lamps on the body's upper
rear corners. Most engines wear the livery of the rule of 2022 (and of the Scania P450 engines of 2025): red all
over with white and yellow diagonal reflective stripes along the lower half. A third of them (by the plate) still
wear the old livery of the 2021 photo: the front door white below its window with a stand-in star (a plain gold
eight-pointed star) and the brigade's name, red and white stripes along the sill and on the bumper's corners.
*Chosen:* the rear was in no photo; it gets red and yellow stripes low down, `PÄÄSTE` and `112`.

**Number plates.** 520 x 113 mm, white, black characters `123 ABC`, a blue EU band with the stars and `EST` at the
left; emergency vehicles carry ordinary plates.

**Levels of detail.** A moving vehicle (`CarMesh`) is at most 5 500 triangles: its body (paint, glass and rough
plastic), one painting laid over it (an atlas per model, livery, plate and front: both sides, the top, the back and
the front, cached and shared), and one lamp mesh whose lamps glow from an eight-texel state texture. A parked car
baked through `drawCar(mb, look, f)` is the 'low' level: vertex colours only, at most 2 300 triangles.

## 11. Assets and licences

- `src/cctv/assets/human.glb`: "Male Base Mesh" by orange-juice-games (itch.io), Creative Commons Zero 1.0, taken from
  github.com/BoQsc/Godot-Male-Base-Mesh (`Original/male_base_mesh.glb`, unchanged). 1 804 triangles, a 56-bone
  armature. No attribution is required; it is credited in the game's credits all the same.
- three.js (MIT) is the only new runtime dependency; `@mapbox/vector-tile` and `pbf` (already used by the map data
  script) become runtime dependencies of the camera chunk.
- Every texture is drawn on a canvas at start; there are no image files.

## 12. Looking at pictures without the game

```
npx vite --config src/cctv/__dev__/vite.harness.config.ts --port 5392 --strictPort
```

- `/src/cctv/__dev__/harness.html?kind=street&seed=3&hour=22&month=11&weather=rain` draws a made-up street of a kind
  of place at an hour, month and weather. `near=<m>&angle=<rad>&h=<m>&fov=<deg>&at=<s>,<lat>` moves the camera close
  for inspecting models; `clean=1` turns the camera's faults off; `acts=idle,talk,...` and `cars=police:estate,amb,...`
  choose what stands there; `dolls=1` uses the plain mannequins.
- `window.__cctv.step(dt, frames)` advances the scene's clock and draws (the screenshot scripts use it).

## 13. Tests

`tests/cctv-*.test.ts`: geometry, the made-up streets and sites (a road, a spot outside every building, a camera with
a clear view, for every kind of place and many seeds), tiles (synthetic tiles through `tests/fixtures/mapdata.ts`),
coverage, cast (every template of the catalogue gets a kind and a cast without throwing), situation, and the director
(per kind: the stage before anyone comes, a patrol arriving, contact, each outcome, opening in the middle, pause,
nobody inside a building, nobody left behind after `after`).
`e2e/camera.spec.ts`: a shift with an incident under a camera, the window opens and draws, the patrol arrives.

## 14. The window in the game

**Where the camera shows.** The incident card has a line under the address when `cameraOf(incident)` gives a
camera: the camera icon, "Valvekaamera" and the camera's name, and a button "Kaamera" with the key chip K (pressed
and labelled "Sulge kaamera" while this incident's camera is open). A place without a camera has no line at all.
The queue marks the rows of places with a camera with a small camera icon (its title names the camera). Watching
is open to every role and desk of a co-op room: nothing is changed by it.

**One camera at a time.** `useGameUi.camera` (`src/ui/game/uiStore.ts`, not persisted, no setting) holds the
incident whose camera is open. It stays on that incident while the player selects others: that is the point,
watching one place while working on another. Opening another incident's camera closes the first. A new shift,
the end of a shift and leaving the game screen close it.

**Keys.** K opens or closes the selected incident's camera (a short note when nothing is selected or the place
has no camera). When that camera is open and the focus is elsewhere, K first moves the focus to the window's close
button; a second K closes it. Escape closes the topmost thing: the director's placing, then the queue drawer (on a
narrow screen it lies over the window), then the camera, then the selection, else it opens the menu; Escape inside
the window closes it as well. Opened by K, the focus goes to the window's close button; when the window closes with
the focus in it, the focus goes back to the card's camera button. In the page the window comes right after the map,
so Tab reaches it before the right panel. The window never traps the focus and never takes it from a text field
(the hotkeys do not fire while typing).

**The window.** A small window over the map (`.gm-cam`, a sibling of the 112 card and the co-op panel in
`GameScreen`, grid area `map`), in the upper right corner left of the map's tools: the 112 card and its Answer button
are at the bottom, the co-op panel top left, the crisis bar top centre, the version bottom left. Its title bar
carries a lamp (red and blinking while live, amber while the game is paused, blue and pulsing while connecting),
the camera's name and the incident's number (two incidents can share one camera, and the picture tells the story of
the one it was opened for; on a narrow bar the camera's place name gives way first, and a phone shows only the
camera's code and the number), zoom out and in, the size button (corner arrows: about 448 px wide or the native 640 px;
the picture is always 16:9, drawn at 640x360 and scaled by CSS) and the close button. It is dragged by its title
bar. The window measures the map area (on a resize of the map or of itself, on the size button, and every 400 ms
for the 112 card) and sets its own width: never wider than the map leaves beside its tools, never taller than the
map, never below the top of an answered 112 card (the call stays on top and the camera fits above it, at least
240 px wide); a dragged window is pushed back inside. A large size that does not fit is as large as fits.

**The map beside it.** Selecting an incident centres the map on it, which on a desktop is where the window
sits. So while a window is open, every focus of the map that names a zoom (the selection, the window's own open
and its size button) is moved by `clearOfCamera` (`CameraWindow.tsx`, used by `GameScreen` `MapHost`): the map is
centred so that the place shows in the middle of the largest strip of the map the window leaves free. Closing the
window moves nothing back.

**On a phone** (899 px and narrower) the window is docked at the top of the map pane at full width, opaque, shown
only on the map tab, with 44 px controls and no size button. The picture box itself is 16:9 (at most 42vh tall), so
the zoom badge sits on the picture. Upright, the map's tools move down below the window (`--gm-cam-h` on `.gm`,
written by the window). On its side, the picture is at most 55vh tall on the left, the map and its tools beside it.

**Zoom.** The mouse wheel over the picture zooms 1x to 4x, dragging pans while zoomed, a double click goes back to
1x; the plus and minus buttons do the same on a touch screen. The view's lens does the zoom (`post.ts setZoom`), so
the picture stays 640x360.

**States** (`data-state` on the window, for the tests; `data-phase` carries the director's phase):

| State | When | In the picture |
| --- | --- | --- |
| `connecting` | the chunk, the body model and the street load (at most 20 s from the click, `CONNECT_DEADLINE_MS`) | "Ühendan kaameraga...", a quiet pulse, the same 16:9 box (no jump) |
| `live` | the session runs | the picture |
| `unavailable` | `canRender()` is false (no WebGL 2) | "Pilt pole saadaval" and why |
| `failed` | the model or the street did not load, the open passed its deadline, the session or the view threw (while opening, drawing or zooming), or the browser took the WebGL context away (`view.dead`) | "Signaal katkes" and "Proovi uuesti" (a new canvas and a new view) |
| `reload` | the camera chunk itself could not be fetched (`isChunkError`): the browser keeps a failed import for the page's life, so a retry could never work | "Mäng on uuenenud" (or, offline, "Võrguühendus puudub": the camera needs the network the first time) and "Lae leht uuesti", which saves the shift and reloads |
| `ended` | the incident was closed and its story played out ('after') with AFTER_HOLD_S (15) real seconds of empty street, a closed incident nobody went to fell off the camera list, or the incident left the simulation (a replay) | "Ülekanne lõppes" |

Whatever the camera throws ends in `failed` (or `reload`) with a button that can work, never in the game's crash
screen: the open's promise chain catches its errors, the frame loop and the zoom catch theirs (`fail()`: log, stop
the loop, dispose of the handle, `failed`), and the window's own error boundary catches what React rendering
throws. `data-people` and `data-cars` on the window carry what the last frame held, for the tests.

**The loop.** The window runs its own `requestAnimationFrame` loop at 12 frames a second and reads the stores
directly (`useGame.getState()`: `sim`, `speedIndex`, `realtime`); no React state changes per frame, only when the
state or the phase changes. Game seconds per real second are `effectiveSpeed(sim, realtime ? 1 : SPEEDS[speedIndex])`
(the 112 slow-down included); the game is paused when `speedIndex` is 0. Nothing is done while the tab is hidden,
the window is not shown (the phone's other tabs) or the game is paused (a zoom then draws the standing frame once).
The session (`session.ts`) reads the situation, steps the director by the real seconds, reads the light again at
most every 2 real seconds (dusk falls in seconds at the fastest speed), and draws with the burned-in texts: the
camera's name top left, the game's date and clock top right ("23.10.2026 19:42"), `EPD v<version>` bottom right.

**Disposal.** The view (its WebGL context, geometry, textures, render targets) is disposed when the window closes,
when another incident's camera opens, when a new shift starts, when the game screen unmounts, when a retry starts,
and as soon as the feed ends or fails (not only when the window closes). A camera closed while it is still
connecting leaves nothing behind (the open is aborted and whatever it made is disposed). Every renderer hangs a
'dispose' listener on each material, texture and geometry it uploads, and those listeners hold the renderer: so the
handle also disposes of what the views share between cameras (the cars' paint and glass from `render/cars.ts`, the
base body's geometry, materials and textures). They stay usable; the next view uploads them again.

**Where it comes from.** `live.ts` and everything it imports beyond the game's own bundle (three.js, `render/`,
the director, the cast, the tile reader with `@mapbox/vector-tile` and `pbf`) build into one chunk,
`assets/cctv-<hash>.js` (`vite.config.ts chunkFileName`), about 800 kB (220 kB compressed). The window fetches it
through one loader per page that forgets a failed fetch. The body model is
`assets/human-<hash>.glb`. Neither is in the service worker's precache list (`vite.config.ts precacheList`,
`CAMERA_CHUNK`): they are fetched the first time a camera is opened, from the game's own server, and then kept by
the worker's runtime cache of `assets/` (cache first, content-hashed names). The street comes from the archive the
map has already opened (`src/map/streetTiles.ts openedStreetArchive`); when the map has not opened it yet,
`live.ts` opens the same file itself, and when the map found no street file it does not ask again: a made-up
street of the kind of place is used (`procedural.ts`), as on any failure of `readStreet` within 6 seconds.

**Tests.** `tests/cctv-session.test.ts` (the session over a real shift with a fake view, closed through the engine
to 'ended'), `tests/cctv-lazy.test.ts` (the import guard; three.js only in `render/` and `__dev__/`; after a build,
three.js only in the camera chunk and nothing of the camera in `sw.js`, required with `CCTV_DIST=1`),
`tests/sw.test.ts` (the chunk's name, nothing of the camera precached), `tests/visual-ui.test.ts` (the window's
place, the phone upright and on its side, reduced motion), `e2e/camera.spec.ts` (the card, no chunk before the
click, live picture that stands while paused and moves while running, the incident's marker beside the window, the
patrol's car arriving, size and drag inside the map, K and Escape, every camera context lost and none held after
garbage collection over three opens, a throw while drawing ending in a working retry, a blocked chunk offering the
reload, the phone).
