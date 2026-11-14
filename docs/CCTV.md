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
| `tiles.ts` | the street around a point, read from the street map (`tiles/estonia.pmtiles`, zoom 15) | pmtiles, @mapbox/vector-tile, pbf |
| `procedural.ts` | a made-up street when the map is not there or has nothing usable | |
| `site.ts` | from a street: the road vehicles arrive on, the spot, the door, the lamps, where the camera hangs and what it sees | |
| `coverage.ts` | which incidents have a camera, and what it is called | sim types |
| `env.ts` | sun, darkness, lamps, snow, rain, fog at the game's clock | sim time |
| `figure.ts` | a person's clothes (`Look`) and poses (`Pose`, acts, gaits) | |
| `vehicle.ts` | a vehicle's body, paint and markings (`CarLook`), its lamps (`CarLights`) | |
| `cast.ts` | the kind of scene an incident makes, its people and vehicles | sim types |
| `stage.ts` | shared types: `Situation` (what the game says now), `Frame` (where everything is) | |
| `situation.ts` | `situationOf(sim, incident, speed, paused = false)`: reads a `Situation` from the simulation | sim |
| `director.ts` | `Director`: moves the cast as the situation changes; `frame()` | all of the above |
| `session.ts` | one open camera: builds site, light, cast and director from a street, steps them at the pace the game clock really keeps, drives the view, tells it which vehicles are on their way, ends the feed once the closed incident's street has emptied | all but three |
| `live.ts` | the lazy chunk's entry: `openCamera(canvas, options)` checks WebGL 2 (once per page), loads the body model and the street under the window's abort signal, creates the view and the session, has the view prepare the first frame within a budget, returns a handle that also lets go of the base body | all |
| `render/view.ts` | `CameraView`: three.js scene, light, weather, people and cars of a frame; `prepare()` gets the first frames onto the graphics card | three |
| `render/world.ts`, `facades.ts`, `textures.ts` | the standing street: ground, roads, houses, trees, lamps, parked cars | three |
| `render/human.ts` (`people.ts` as fallback) | people: one real body mesh dressed per `Look`, posed by `Pose` | three |
| `render/carbody.ts`, `cars.ts` | vehicles: shaped bodies, markings, switchable lamps; `CarKit`, what one view's vehicles share | three |
| `render/props.ts` | what is neither a person nor a vehicle: a dropped weapon, a stretcher, a sheet, a hose | three |
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
  the incident closes); the director plays each change at a natural pace. How many real seconds away an arrival is
  comes from the game's speed at the pace its clock really keeps (section 14, the session's pace). The clock burned
  into the picture shows the game's date, hours and minutes.
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

Tile coordinates become scene metres through Web Mercator and the cosine of the incident's latitude. Roads are cut at
the circle of 160 m (`STREET_RADIUS`); buildings and areas that reach within 200 m are kept and clipped to a square
of 200 m half size around the incident.

Any failure (no archive, a network error, a tile that does not parse, a read that takes more than 6 s, no road
within 70 m, no place on the roads that holds a scene: section 4.2) ends in `procedural.ts makeStreet(placeKind,
seed)`, a believable street of the incident's kind of place. The picture works without the map file;
`StreetData.source` says which one it is (`'tiles'` or `'made'`).

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

`site.ts buildSite(street, seed): Site | null`. Two things are never given up: nothing stands inside a house or in
water (the spot, the camera, the walking lines near the spot), and the camera has a free line to the spot. The map
is taken as it is drawn, not as it is labelled. Null only when no place holds; the session then makes a street up
(`procedural.ts`) and builds the site on that.

- **Roads.** Every road within 70 m of the incident, ranked by its distance plus a reluctance: car roads first
  (service roads +5 m, motorways +8 m), then pedestrian streets (+14 m), then paths (+26 m); never a tunnel. Each is
  followed past its ends through the straightest drivable continuation (turning less than 55 degrees) until it
  leaves a circle of 120 m (`DRIVE_RADIUS`); ends inside the circle are dead ends. At most 12 roads are tried, each
  at least 24 m long. Vehicles enter and leave along the chosen one, the drive line.
- **Places, in order.** On each road: the point nearest to the incident, then 6, 12, 20 and 30 m along it both ways;
  at each, the incident's own side (as far from the road as the incident is, and the kerb when that is deep in a
  yard) and the other side. A place costs more the further it is from the incident (a later road, a shift along
  it, a bend within 14 m, the other side of the road). Places are tried cheapest first and a place that does not
  hold is dropped. Once one holds, at most six are worked out, and only while a further one could still cost less;
  the site with the least cost (the place's own and what its camera misses) is taken.
- **Drive line.** `drive.width` is what the house fronts leave within 16 m either way (at least 2.6 m): an old
  town's lane is as narrow as its walls. A front within 1.2 m of the centre line near the place drops the place (an
  archway). Where a house stands on the line further along, the line ends 2 m before it as a dead end. The scene
  keeps 8 m from both ends.
- **Spot**: where it happens. Beside the road on the place's side: on the pavement at least (1.4 m past the kerb,
  1.7 m where the fronts leave no pavement), at most 9 m in (a forecourt, a yard), at least 0.7 m from any wall, not
  in water (on a bridge or a quay it moves towards the road).
- **Walking lines** (`walkLeft`, `walkRight`): along both sides of the drive line, 1.3 m past the kerb (1.5 m
  without pavements), drawn in to 0.7 m from a house front where the fronts leave less: in a lane people walk at
  the wall. Within 22 m of the spot no point of them may be inside a house.
- **Door**: the nearest wall point within 32 m, with its outward normal and its building. When that is more than
  12 m from the spot, the door is on the wall near the spot that the camera sees best (facing the lens and seen
  squarely, its foot and the window above it in the picture, free ground before it), when there is such a wall.
- **Camera**: candidates are poles at both kerbs 8 to 31 m along the road (on the wall where a house stands at the
  kerb), points on the walls within 30 m, and poles on open ground 13 to 24 m round the spot; 7 to 40 m from the
  spot, with a free line to the spot and to the road; 5 to 7.8 m up (on a wall below its top). Each is aimed to hold
  as much as it can and its lens fitted (vertical field of view 36 to 64 degrees), then scored by what the picture
  misses (`rate`): the people at the spot, readable; the stretch of road the first crews stop on from each end they
  can come from (14 m before the spot to 6 m past it), with the first car whole; the door; not looking steeply down
  on heads; a long stretch of street rather than a close-up. The best eight are scored again at their other height,
  for a wall or a roof right before the lens and for a door out of the picture; among those within 0.3 of the best
  the seed chooses.
- **`Site.seen`**: the stretch of the drive line in the picture, in metres along it (as `drive.at`): from the point
  of the road nearest the scene that is in the picture, outwards both ways (at most 80 m) for as long as the road's
  centre line is inside the frame and not behind a house. Not set when the camera does not see the road at the
  scene. The director prefers stopping places inside it (section 8), so that the first cars stop in the picture.
- **Lamps** every 30 m (34 m on main roads) along the drive line, on alternate sides of roads wider than 6.2 m, else
  across from the spot; none right before the lens. A main road without pavements is lit only where a road joins it.

`projectPoint(camera, p, h)` says where a point `h` m above the ground lands in the picture (16:9, before the lens's
bulge): `x` and `y` from -1 to 1, `z` metres in front of the lens. The site's scoring and the tests use the same
projection. Also exported: `clearLine`, `insideBuilding`, `onDrive`, `blocksView`, `walkLine`, `pavement`.

Known limits. `buildSite` costs about 6 ms for a typical street and up to about 70 ms for a large one, once per
opening. In narrow lanes between high fronts the walls can fill a large part of the frame (about 4 percent of
old-town lanes). A door further than 12 m from the spot can be out of the picture when the camera sees no wall
near the spot.

## 5. Which incidents have a camera (`coverage.ts`)

`cameraOf(incident, now?): CameraInfo | null`, pure and synchronous (the queue and the card call it while drawing).

A place either has a camera or not, for good: the decision is `hash01('cam', kind, cx, cy)` with
`cx = round(lon * 1500)` and `cy = round(lat * 3000)` (a cell of about 37 m) against the chance of the kind of place
(`CAMERA_CHANCE`):

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

`CameraInfo`: `{ id: string, name: string, seed: number }`.

- The id is `K-` and four digits, `K-1000` to `K-9999`, from `cameraNumber(cx, cy)`: the cell's place in a block of
  90 x 100 cells (about 3.4 x 3.7 km), shuffled by a permutation of those 9000 places (four rounds keyed by
  `hash32('camno', ...)`). Neighbours get numbers that look unrelated, and no two cells of a block share one, so no
  two cameras within about 3 km of each other have the same code.
- The name is the id and where the camera is: the street's name without the house number (`streetOfAddress`:
  `Narva mnt`), or the place's name when the incident has one (`Viru Keskus`); a highway camera is `Teekaamera`.
  Example: `K-4821 · Narva mnt`.
- The seed, `hash32('site', cx, cy)`, chooses the street's made-up details, where the camera hangs and its lens: the
  same place, the same picture.

With `now` (the game clock), an incident closed from the desk (`closedBy` set) without any unit ever sent loses its
camera five game minutes after it closed: nothing is left to see. The card, the queue, the K key and the session
pass `now`; the window reads the camera's name once, as it opens, without it.

## 6. What the game says (`situation.ts`)

`situationOf(sim, incident, speed, paused = false): Situation` (`stage.ts`). `speed` is game seconds per real second
while the game runs (the session passes its measured speed, and the last running one while paused, with `paused`
true). Pure: it only reads the state.

- A unit is listed when it is in the incident's `unitHistory`, assigned to it, or has it as its job.
  - `here`: standing within 150 m of the incident on a job there (on scene, writing its report after the incident
    closed, or waiting for help with an injured officer at the same address).
  - `near`: driving to the incident's own place with `(arriveAt - now) / 1000 / speed <= NEAR_S` (7 real seconds);
    `eta` is those seconds.
  - `coming`: driving there, further away.
  - `left`: was here or sent here and is not any more (released, sent elsewhere, driving in a pursuit, transporting).
  - `takes`: `'arrest'`, `'hospital'` or `'ride'` when it left on a transport of this incident to the cells, to the
    nearest hospital, or anywhere else (somebody driven home or to a station).
  - `from`: the yaw from the incident towards where the unit is (its position, or the vertex before last of its path
    when it is `near` or within 300 m).
- Agencies: every `agencyNeeds[].requested`; `here` once `arrived`, `near` inside the same 7 seconds; one that had
  not come when the incident closed stays `coming`.
- `pursuit`: `on` while `incident.pursuit` has not ended, `over` after.
- `searching`: an `incident.search` that is still running (not found, not ended) while the incident is open.
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
type Phase = 'open' | 'seen' | 'contact' | 'closing' | 'after';
class Director {
  constructor(site: Site, cast: Cast, opts: { night: boolean; quiet?: boolean; wet?: boolean; parked?: readonly ParkedCar[] });
  /** Follow the situation for `dt` real seconds. The first call settles the stage (see 8.6). */
  update(sit: Situation, dt: number): void;
  /** Everything on stage now, for the renderer. */
  frame(): Frame;
  /** Where the story is (the session, the window's data-phase and the tests read it). */
  phase: Phase;
}
```

The director is plain state stepped by `update`: no timers, no three.js, no randomness outside `rand(seed)`.

- `night`: the light is dark (the session passes `env.night >= 0.5`). `quiet`: no passing traffic and no
  passers-by (the tests). `wet`: it rains (`env.rain`).
- `parked`: the cars the renderer drew parked in the street (`types.ts ParkedCar`: the middle of the car, its yaw,
  length and width). `render/world.ts` decides which places are filled and returns them as `World.parked`; the
  view keeps them as `view.parked`; the session sets the scene on the view first and passes them on. The director
  treats each as solid: no vehicle stops in one, nobody stands in one or walks through one.
- `site.seen` (section 4.2) is the stretch of road the camera sees: where it is set, an arriving crew's stopping
  place inside it is preferred, so that the first cars stop in the picture.

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

- **View** (`render/view.ts`). `new CameraView(canvas)`, `setHumans(base)`, `setScene(site, env)`, `parked`,
  `setEnv(env)`, `prepare(first, osd, signal?, budgetMs = 10000)`, `expect(looks)`, `render(frame, osd, zoom, panX,
  panY)`, `dispose()`, `dead`; `FRAME_W`, `FRAME_H` (640, 360), `canRender()`. One shadow-casting sun in clear
  weather (above 3 degrees); while the street lamps are on, the six lamps nearest to what the camera looks at paint
  their pools on the ground, the nearest four of them with a real light; up to three blue lights that flash with
  the cars' bars; and the camera's own infrared lamp when its picture is black and white. Paint and glass reflect a
  small sky built for the hour.
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
  The zoom is the lens's (`setZoom`), so the picture stays 640x360.
- **Props** (`render/props.ts`). A dropped weapon, an ambulance's stretcher, the sheet over somebody who died, a fire
  hose: a handful of triangles each, coloured per vertex, one material for all (a weapon in a hand too).

Budget per frame at 640x360: under 300 000 triangles, under 120 draw calls with a full street, a dozen people and six
vehicles; no program compiled or linked while the picture is steady.

### 9.1 Getting the first picture onto the card

Making a shader program is costly, and where the browser has no `KHR_parallel_shader_compile` (a software renderer,
many phones) three.js's `compileAsync` resolves at once and the driver finishes the program only at its first use,
holding the page for seconds. So `live.ts` creates the session, takes its first frame without drawing
(`CameraSession.stage(sim)`, the stage settled as the game stands) and awaits `CameraView.prepare(first, osd,
signal, budgetMs)` before the window shows 'live'. Every step of `prepare` checks the budget before it starts and is
one short task (the game's clock, the map and the queue run on between them):

1. The first frame's people and vehicles are staged, and the hidden warm group is made (below).
2. Every texture the street draws with is uploaded, one to a task.
3. The reflection's scene and the passes of the PMREM generator are compiled (`KeptPmrem.prepare` makes the passes
   without drawing them).
4. The street's materials, a few to a task, with the shadow pass's depth programs (compiled on stand-ins: three's own
   depth materials are out of `compile()`'s reach), then the two screen passes (`Post.compile`).
5. A GPU fence (`fenceSync`, polled between tasks) says when the graphics process has linked them all.
6. Each program is touched (its uniforms and attributes asked for), one to a task: the first such question waits
   for the link, and asked in its own task it costs the page little. Skipped where `KHR_parallel_shader_compile`
   exists: `compileAsync` has then already waited for each program without holding the page.
7. The reflection is rendered and the first frame is drawn inside `prepare`: a driver finishes a program's last
   part when it is first drawn with, and the page must not wait for that in a frame of its own.
8. With what is left of the budget, the liveries of the vehicles on their way (`expect`) are painted and uploaded;
   then the fence is waited for once more.

The budget is `OPEN_BUDGET_MS`, 30 s counted from the window's start (section 14), and at least 1.5 s for `prepare`
itself (`PREPARE_MIN_MS`). What is not ready when it runs out is finished in the first frame, which then holds the
page; on a fast device it never comes near.

- **The warm group.** Out of sight for the view's life, never drawn: a car's parts as stand-ins with one-texel
  textures (`CarKit.standIns()`: both paints, glass, plastic, lamps, a painting, a flare, the headlights' pool), a
  constable holding a knife, and one of each prop (stretcher, sheet, hose, knife). Their programs are compiled in
  `prepare` and with every later change of the lights, so whatever arrives later draws with a ready program.
- **Liveries ahead.** The session tells the view, through `SessionView.expect(looks)`, which vehicles are on their
  way (the incident's units and services that are coming or near). Their paintings are painted (`CarKit.prime`) and
  uploaded in `prepare`, or once live when the page is idle, one to a task, not in the car's first frame.

### 9.2 Light and weather

- **The light key.** The session reads the light every 2 real seconds. `setEnv` does nothing while `lightKey(env)`
  (the light in steps finer than the eye follows) is what was applied last. When it changes, what exists is changed
  in place: the fog keeps its object, the sky is repainted into the same canvas and texture, the lamps and the
  camera's look are set again. Nothing is rebuilt.
- **The reflection key.** The reflection is rendered again only when the coarser `reflectionKey(env)` changes, into
  the same render target: `KeptPmrem` overrides three's `_setSize` and `_allocateTarget` to keep one 64 px cube
  (three's own minimum is 256) and hand it back from every `fromScene`, so every material keeps the program it was
  compiled with. Should a later three.js rename those, it simply works as three's own.
- **Lamps and shadows switching.** How many lamp lights are on and whether the sun casts shadows are part of every
  lit program. Once prepared, a change of them (the lamps at dusk, the sun's shadows at sunset) is compiled in the
  background first, fenced and touched as above, and switched to when ready; the picture goes on with the lights as
  they were meanwhile.
- **A change of weather.** Rain starting or stopping, snow cover changing by more than 0.3, or a new season rebuilds
  the street (`setScene`) with its parked cars and clears the shadow pass's stand-in materials; the painted sheets
  are kept. Its programs are then linked in the first frame after: one long frame, rarely.

### 9.3 What is kept, and what an opening costs

- **Per view, never per page.** A renderer hangs a listener on whatever it uploads, so a three.js object kept past
  its view would keep that view's renderer and graphics context alive. Each view therefore has its own `CarKit`
  (the vehicles' materials, the atlases of their paintings, the flare and beam textures, the sprites' quad) and its
  own textures of the street, all disposed with it. A closed camera holds no graphics context. What is kept per page
  is plain pixels and numbers: the house-front sheet (`facades.ts`, painted once per seed at 1536 and shrunk to
  1024 by an area average, its night twin at 512), the last two car paintings (`PAINTINGS_KEPT`), the drops' table,
  and the base body (`human.ts`, loaded once; `live.ts` disposes of its GPU side when a camera closes).
- **Texture memory** per opening, measured: about 32 MB by day and 18 MB at night (the house-front sheet with its
  mipmaps is 5.6 MB of it).
- **The long task that remains.** Each opening creates a new WebGL context (1 to 4 s on a software renderer, one
  task); only one context kept for the whole page would remove it, and that is not done. With it, 'live' comes 10
  to 15 s after the click on a loaded software renderer and the first frame then takes 5 to 9 ms.

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
the front; uploaded once per view and shared by its cars of the same kind, the last two paintings kept for the
page as canvases), and one lamp mesh whose lamps glow from an eight-texel state texture. A parked car
baked through `drawCar(mb, look, f)` is the 'low' level: vertex colours only, at most 2 300 triangles.

## 11. Assets and licences

- `src/cctv/assets/human.glb`: "Male Base Mesh" by orange-juice-games (itch.io), Creative Commons Zero 1.0, taken from
  github.com/BoQsc/Godot-Male-Base-Mesh (`Original/male_base_mesh.glb`, unchanged). 1 804 triangles, a 56-bone
  armature. No attribution is required; it is credited in the game's credits all the same.
- The camera brings three runtime dependencies (`package.json` `dependencies`): `three` (MIT), and
  `@mapbox/vector-tile` and `pbf` (BSD-3-Clause, used before only by the map data script). All three load only in
  the camera chunk.
- The build writes `THIRD-PARTY-LICENSES.txt` (`vite.config.ts thirdPartyLicences`): the full licence text of every
  npm package whose code or fonts the build contains, since the minifier strips the notices MIT and BSD ask to
  travel with the code. The credits screen links to it (`shell.cred.licenceTexts`). Two packages of the map ship no
  licence file in their tarball (`pmtiles`, `@protomaps/basemaps`) and the map's glyphs come from `public/`, not
  from npm: their texts are kept in `licences/` (its README says where each is from) and added by the plugin. A
  package with no text of its own and none kept there stops the build.
- Every texture is drawn on a canvas at start; there are no image files.

## 12. Looking at pictures without the game

```
npx vite --config src/cctv/__dev__/vite.harness.config.ts --port 5392 --strictPort
```

Dev only: none of these pages is in the build. Files are watched, with no hot reload (a page loaded after an edit
shows the edit). `EPD_VITE_CACHE=<folder>` gives a second server running at the same time a cache of its own.
`EPD_MAP_TILES=<folder>` names a folder of map archives (`.pmtiles`) outside the checkout; it is served only when the
variable is set, and without it the scene page says that no sample is configured.

- `harness.html` draws one still picture of a made-up street: `kind=<PlaceKind>&seed=<n>&hour=22&month=11&weather=rain`
  (also `temp`, `wind`). `near=<m>&angle=<rad>&h=<m>&fov=<deg>&at=<s>,<lat>` moves the camera close for inspecting
  models; `clean=1` turns the camera's faults off; `acts=idle,talk,...` and `cars=...` choose who and what stands
  there, `cast=0` the street alone; `dolls=1` uses the plain mannequins; `smoke=1`, `lamps=1`, `zoom=<k>`, `t=<s>`;
  `hide=<parts>` leaves parts of the picture out to see what they cost; `sheet=atlas` shows the painted house-front
  sheet and its night twin.
- `scene.html` plays a whole scenario through the director and the real renderer, for filming scenes from start to
  end. The street: `place=<PlaceKind>&seed=<n>`, a hand-made `plain=dead|narrow|far|square`, or a real street with
  `tiles=<lng>,<lat>` (and `archive=<file>`) from the `EPD_MAP_TILES` folder. The cast: `kind=<SceneKind>&roles=...`
  with flags, or `tpl=<templateId>` for a real incident of a shift. The situation is scripted over the scene's clock:
  units `u=...`, services `ag=...`, `out=<result>@<s>`, `pursuit`, `search`, `pause`, `open=<s>`. The top of
  `scene.ts` lists every parameter.
- `vehicles.html` shows the vehicles on plain asphalt: `car=<id>,...` or `set=police|ems|civil|all`,
  `view=front|rear|side|top|cctv`, `night=1`, `lamps=1`, `beacons=1`, `low=1` for the parked cars' level of detail.
- `model.html?src=<url>` draws a glTF model four times, turned a quarter each (`plain=1`: one grey material).
- `window.__cctv.step(dt, frames)` advances the scene's clock and draws (the screenshot scripts use it); the scene
  page also has `seek(t)`.

## 13. Tests

| File | What it guards |
| --- | --- |
| `tests/cctv-math.test.ts` | the local frame, angles, rings (area, inside, nearest wall and its normal), segments, the box round a house, lines (offset, slice, cut at a circle), the seeded randomness |
| `tests/cctv-tiles.test.ts` | the street read from zoom 15 tiles: synthetic tiles written through `tests/fixtures/mapdata.ts`, roads, buildings, areas, bounds, section 4.1's heights, `readStreet` and its failure paths, the map's own opened archive; a real archive too when `EPD_PMTILES_SAMPLE` names one |
| `tests/cctv-site.test.ts` | every site is sound (nothing inside a house or in water, a free line to the spot) for every kind of place over forty seeds, and for a dozen of them the story is in the picture (the spot, a standing adult's size, the first crew's stretch and car from each end, the door, street rather than a wall), measured with its own projection checked against `projectPoint`; hand-made streets with what real tiles bring (a lane between house fronts, an incident inside a block, a quay, a dead end, a passage); null where nothing holds; a real town's points when the Florence sample is there |
| `tests/cctv-coverage.test.ts` | the table of chances, a place has a camera or not for good, the four-digit number and the name, nothing left to see, the share of a real shift's incidents that can be watched |
| `tests/cctv-cast.test.ts` | every template of the catalogue gets a kind and a cast without throwing; well-known templates get the expected kind; the picture never contradicts the card |
| `tests/cctv-situation.test.ts` | a crew coming, near, here, then left over a real shift; other services; a pursuit; the outcome and the transports |
| `tests/cctv-director.test.ts` | per kind: the stage before anyone comes, a patrol arriving, contact, each outcome, any moment safe to open, awkward streets and many crews, a real shift's incidents, the parked cars solid, crews stopping where the camera sees them; on every frame nobody inside a house, nothing teleporting, vehicles on the road, nobody left behind |
| `tests/cctv-session.test.ts` | the session over a real shift with a fake view: frames with the incident's people and a patrol arriving, the clock and the light read at most every 2 s, dusk, pause, the measured pace, a crew getting out only once the game says on scene on a slow device, `expect`, the settled first frame (`stage`), the feed ending ('ended') after the street empties or when the incident leaves the simulation, the made-up street fallback, the same place twice |
| `tests/cctv-lazy.test.ts` | the import guard (section 14); after a build, three.js only in the camera chunk and nothing of the camera in `sw.js` (skipped without `dist/`, required with `CCTV_DIST=1`: the CI job runs this file once more after its build with that set) |
| `tests/sw.test.ts` | the camera chunk's name, neither it nor the body model precached, the licence file's entries |
| `tests/visual-ui.test.ts` | the window's place on a desktop, the phone upright and on its side, the title bar never cutting the code or the number, the folded bar, reduced motion |
| `e2e/camera.spec.ts` | see section 14, Tests |

## 14. The window in the game

**Where the camera shows.** The incident card has a line under the address when `cameraOf(incident, now)` gives a
camera: the camera icon, "Valvekaamera" and the camera's name, and a button "Kaamera" with the key chip K. While
this incident's camera is open the button is the primary one with a close icon and says "Sulge kaamera" (its words
say what a press does; it has no `aria-pressed`). A place without a camera has no line at all. The queue marks the
rows of places with a camera with a small camera icon (`data-camera` holds its code, its title names the camera).
Watching is open to every role and desk of a co-op room: nothing is changed by it.

**One camera at a time.** `useGameUi.camera` (`src/ui/game/uiStore.ts`, not persisted, no setting) holds the
incident whose camera is open (`{ incidentId, byKey? }`); `toggleCamera(incidentId, byKey)` opens or closes it, and
on a phone opening goes to the map tab. It stays on that incident while the player selects others: that is the
point, watching one place while working on another. Opening another incident's camera closes the first. A new
shift, the end of a shift and leaving the game screen close it (`GameScreen`); the window itself is keyed by the
shift (`shiftKeyOf`) and the incident, so another shift or incident always starts a fresh one.

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
the one it was opened for; see the title bar below; a phone shows only the camera's code and the number), zoom out
and in, the size button (corner arrows: about 448 px wide or the native 640 px; the picture is always 16:9, drawn
at 640x360 and scaled by CSS) and the close button. It is dragged by its title bar.

The window measures the map area and sets its own width: never wider than the map leaves beside its tools (60 px),
never taller than the map, never below the top of an answered 112 card, and never under 240 px. A large size that
does not fit is as large as fits; a dragged window is pushed back inside. It fits again whenever the map, the window
or its title changes size (a `ResizeObserver`), whenever a 112 card appears, changes size or goes (the card is
watched as it comes), in the same commit as a call rung, answered or ended, on the size button, and every 400 ms as
a safety net (`FIT_EVERY_MS`).

**Above a 112 call.** The answered 112 card (open or collapsed to its header) stays on top and the camera fits above
it. When the room there is less than the least picture (240 x 135 px) plus its bar, the window folds to its title
bar alone (lamp, code, number, close), 4 px above the card, and draws nothing until the call ends; then it comes back
as it was and draws again. A focus on the zoom or size buttons moves to the close button as they go. While a camera
window is open on a wide screen (900 px and more), an answered card leaves 64 px above itself for that bar, so the
bar is never under the card, also in the first seconds after the answer. While a call only rings, its card may cover
the bottom of the picture: the call comes first, and answering it moves the window.

**The title bar** never clips the camera's code or the incident's number. It gives way in four steps, measured
(`fitTitle`), never by a fixed width: everything; without the place name (less than about five letters of it would
show); also without the camera icon and the live tag (the lamp still says live or paused), so that the whole number
fits beside the code; and only when even that does not fit, the number's last part (`K-4821 · 0001`). In a window of
312 px and less the place name, the icon and the tag are hidden by the style sheet as well.

**The map beside it.** Selecting an incident centres the map on it, which on a desktop is where the window
sits. So while a window is open, every focus of the map that names a zoom (the selection, the window's own open
and its size button) is moved by `clearOfCamera` (`CameraWindow.tsx`, used by `GameScreen` `MapHost`): the map is
centred so that the place shows in the middle of the largest strip of the map the window leaves free. Closing the
window moves nothing back.

**On a phone** (899 px and narrower) the window is docked at the top of the map pane at full width, opaque, shown
only on the map tab, with 44 px controls and no size button. The picture box itself is 16:9 (at most 42vh tall), so
the zoom badge sits on the picture. Upright, the map's tools move down below the window (`--gm-cam-h` on `.gm`,
written by the window). On its side, the picture is at most 55vh tall on the left with 40 px controls, the map and
its tools beside it. The window does not fold there: an answered 112 card covers it, as it should.

**Zoom.** The mouse wheel over the picture zooms 1x to 4x (it never scrolls or zooms the map under it), dragging
pans while zoomed, a double click goes back to 1x; the minus and plus buttons step by 1.5 times and are disabled at
the limits. A button that reaches its limit while it has the keyboard's focus hands the focus to the other one, so
the focus never drops to the page. The view's lens does the zoom (`post.ts setZoom`), so the picture stays 640x360.

**States** (`data-state` on the window, for the tests; `data-phase` carries the director's phase):

| State | When | In the picture |
| --- | --- | --- |
| `connecting` | the chunk, the body model and the street load and the view prepares the first frame (at most 60 s from the click, `CONNECT_DEADLINE_MS`) | "Ühendan kaameraga...", a quiet pulse, the same 16:9 box (no jump) |
| `live` | the session runs; its first frame can be drawn at once | the picture |
| `unavailable` | `canRender()` is false (no WebGL 2) | "Pilt pole saadaval" and why |
| `failed` | the model or the street did not load, the open passed its deadline, the session or the view threw (while opening, drawing or zooming), or the browser took the WebGL context away (`view.dead`) | "Signaal katkes" and "Proovi uuesti" (a new canvas and a new view) |
| `reload` | the camera chunk itself could not be fetched (`isChunkError`): after an update the old chunk's name is gone from the server, and the browser keeps a failed import for the page's life, so a retry could never work | "Mäng on uuenenud" (or, offline, "Võrguühendus puudub": the camera needs the network the first time it opens) and "Lae leht uuesti" (below) |
| `ended` | the incident was closed and its story played out ('after') with AFTER_HOLD_S (15) real seconds of empty street, a closed incident nobody went to fell off the camera list, or the incident left the simulation (a replay) | "Ülekanne lõppes" |

Whatever the camera throws ends in `failed` (or `reload`) with a button that can work, never in the game's crash
screen: the open's promise chain catches its errors, the frame loop and the zoom catch theirs (`fail()`: log, stop
the loop, dispose of the handle, `failed`), and the window's own error boundary catches what React rendering
throws. `data-people` and `data-cars` on the window carry what the last frame held, for the tests.

**The reload note.** The button goes by what `saveNow()` answers. A shift that saves is saved, and one press
reloads the page. A shift that cannot be saved is never reloaded by a single press: a director-mode shift (or one
off the game screen) says "Seda vahetust ei saa salvestada: laadimine lõpetab selle.", a co-op room's shift says
"Ühisvahetus jätkub ruumis: pärast laadimist liitu sellega uuesti." The first press then reloads nothing and asks
again ("Vajuta uuesti, kui oled kindel."); only the second, deliberate press ("Lae siiski uuesti") reloads.

**The loop.** The window runs its own `requestAnimationFrame` loop at 12 frames a second and reads the stores
directly (`useGame.getState()`: `sim`, `speedIndex`, `realtime`); no React state changes per frame, only when the
state or the phase changes. Game seconds per real second are `effectiveSpeed(sim, realtime ? 1 : SPEEDS[speedIndex])`
(the 112 slow-down included); the game is paused when `speedIndex` is 0. Nothing is done while the tab is hidden,
the window is not shown (the phone's other tabs), the window is folded above a call, or the game is paused (a zoom
then draws the standing frame once).

The session (`session.ts`) reads the situation, steps the director by the real seconds (a step of at most 0.5 s),
reads the light again at most every 2 real seconds (`ENV_EVERY_S`: dusk falls in seconds at the fastest speed), and
draws with the burned-in texts: the camera's name top left, the game's date and clock top right ("23.10.2026 19:42"),
`EPD v<version>` bottom right, and a recording dot that blinks once a second of the camera's own clock.

**The session's pace.** The game plays at most 250 ms of a slow frame, so on a slow device its clock runs behind
the nominal speed. The picture follows the game's real clock, not the nominal speed: over windows of 0.5 real
seconds (`PACE_WINDOW_S`) the session measures how far `sim.now` moved against the real time between camera frames,
keeps that pace between 0.05 and 1.5 of the nominal speed (`PACE_MIN`, `PACE_MAX`), smooths it, and passes the
nominal speed times the pace to `situationOf` (`CameraSession.speed`). The measuring starts again after a pause or a
change of speed. Until the pace has been measured once, units and services that are `near` are handed to the
director as still `coming`, so a crew never gets out on camera while the unit list still says it is on its way;
half a second later it drives in on the measured speed.

**Disposal.** The view (its WebGL context, geometry, textures, render targets) is disposed when the window closes,
when another incident's camera opens, when a new shift starts, when the game screen unmounts, when a retry starts,
and as soon as the feed ends or fails (not only when the window closes). A camera closed while it is still
connecting leaves nothing behind (the open is aborted and whatever it made is disposed). Every renderer hangs a
'dispose' listener on each material, texture and geometry it uploads, and those listeners hold the renderer. The
vehicles' materials and paintings are the view's own (its `CarKit`, section 9.3) and go with it; the one three.js
object every view shares, the base body (`human.ts`, loaded once per page), has its geometry, materials and
textures disposed by the handle (`live.ts releaseShared`). It stays usable; the next view uploads it again.

**The opening.** The window starts its deadline, `CONNECT_DEADLINE_MS` (60 s), as it begins to open the camera (on
opening and on every retry), and passes that moment to `openCamera` as `startedAt`. `openCamera` (in the chunk)
checks WebGL 2 once per page, loads the body model and the street together under the window's abort signal,
creates the view and the session, and awaits `view.prepare` (section 9.1) with what is left of `OPEN_BUDGET_MS`
(30 s, counted from `startedAt`, at least 1.5 s).
Without `startedAt` the budget counts from the browser's first request for the chunk on the page's first opening,
else from the call. The budget limits the compiling only; the half of the deadline beyond it is for what the budget
does not limit (the chunk and the body model over a slow line, the graphics context), so a slow device goes live
with a frame left to finish rather than failing. Measured on a loaded software renderer: live after 18 to 30 s, the
first frame 4 to 12 ms, and the game's clock and map run on while the camera connects. With a budget of 14 s the
same machine went live sooner and then stood still for 3 to 6 s in the first frame.

**Where it comes from.** `live.ts` and everything it imports beyond the game's own bundle (three.js, `render/`,
the director, the cast, the tile reader with `@mapbox/vector-tile` and `pbf`) build into one chunk,
`assets/cctv-<hash>.js` (`vite.config.ts chunkFileName`), about 1 000 kB (290 kB gzipped). The window fetches it
through one loader per page that forgets a failed fetch. The body model is `assets/human-<hash>.glb` (94 kB).
Neither is in the service worker's precache list (`vite.config.ts precacheList`, `CAMERA_CHUNK`): they are fetched
the first time a camera is opened, from the game's own server, so the first opening needs the network; then the
worker's runtime cache of `assets/` keeps them (cache first, content-hashed names). The street comes from the
archive the map has already opened (`src/map/streetTiles.ts openedStreetArchive`); when the map has not opened it yet,
`live.ts` opens the same file itself, and when the map found no street file it does not ask again: a made-up
street of the kind of place is used (`procedural.ts`), as on any failure of `readStreet` within 6 seconds.

**Tests.** `tests/cctv-session.test.ts` (the session over a real shift with a fake view, closed through the engine
to 'ended'), `tests/cctv-lazy.test.ts` (the import guard: no module outside `src/cctv` imports more of it than
`coverage.ts` and types, `coverage.ts` pulls in nothing heavy, the window reaches the chunk through `import()`,
three.js only in `render/` and `__dev__/`; after a build, three.js only in the camera chunk and nothing of the
camera in `sw.js`, required with `CCTV_DIST=1`, which the CI job's step after its build sets), `tests/sw.test.ts`
(the chunk's name, nothing of the camera precached), `tests/visual-ui.test.ts` (the window's place, the phone
upright and on its side, the title bar, the folded bar, reduced motion), `e2e/camera.spec.ts`: the card and the
queue's mark, no chunk before the click, a live picture that stands while paused and moves while running, the
incident's marker beside the window, the patrol's car arriving, the zoom buttons' focus at the limits, the size
button (its label, no `aria-pressed`), the title bar at every width from 240 px up, paused and live, in Estonian and
English, size and drag inside the map, K and Escape, every camera context lost and none held after garbage
collection over three opens, a throw while drawing ending in a working retry, the phone, the fold above an answered
112 call at 1280x720 and its unfolding, and a blocked chunk offering the reload: saved in a normal shift, a second
press in a director-mode shift.
