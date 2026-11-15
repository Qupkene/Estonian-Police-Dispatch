# Kaamerad: live surveillance cameras (2.41.1)

Some incidents happen in sight of a surveillance camera. The dispatcher opens the camera from the incident's card and
watches the place live: the trouble itself, the patrol car driving up with its blue lights, the officers getting out,
people running off, the arrest, the ambulance. The picture is drawn from the game's own state on the game's own street
map, and made to look like the feed of a street camera: wide lens, low resolution, grain, a clock burned into the
corner, infrared black and white at night, rain on the dome. The street is the place the incident names: a petrol
station shows its canopy and its kiosk with its board, a bank its own front. While the picture is live, the game map
shows where the camera hangs and what it sees.

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
| `types.ts` | `StreetData` (roads, buildings, areas, points of interest, the place), `Site` (the lie of the land for one camera), `PlaceHint`, `SitePlace`, `Poi` | |
| `tiles.ts` | the street around a point, read from the street map (`tiles/estonia.pmtiles`, zoom 15), for the incident's place | pmtiles, @mapbox/vector-tile, pbf |
| `place.ts` | the place an incident names, found on the street: its point, its own building and front, and what stands before it (`POI_KINDS`, `pickPoi`, `ownBuilding`, `frontOf`, `planPlace`, `roadAnchor`, `dressStreet`, `settlePlace`, `carryDressing`, `wallAt`, `hasOwnBuilding`, `isShown`) | |
| `procedural.ts` | a made-up street when the map is not there or has nothing usable, with the place's own building marked | |
| `site.ts` | from a street: the road vehicles arrive on, the spot, the door, the lamps, where the camera hangs and what it sees, and the place the picture shows | |
| `coverage.ts` | which incidents have a camera, and what it is called | sim types |
| `env.ts` | sun, darkness, lamps, snow, rain, fog at the game's clock | sim time |
| `figure.ts` | a person's clothes (`Look`) and poses (`Pose`, acts, gaits) | |
| `vehicle.ts` | a vehicle's body, paint and markings (`CarLook`), its lamps (`CarLights`) | |
| `cast.ts` | the kind of scene an incident makes, its people and vehicles | sim types |
| `stage.ts` | shared types: `Situation` (what the game says now), `Frame` (where everything is) | |
| `situation.ts` | `situationOf(sim, incident, speed, paused = false, played = 0)`: reads a `Situation` from the simulation; `streetScale`: how fast the street runs | sim |
| `director.ts` | `Director`: moves the cast as the situation changes; `frame()` | all of the above |
| `session.ts` | one open camera: builds site, light, cast and director from a street, steps them at the pace the game clock really keeps, drives the view, tells it which vehicles are on their way, ends the feed once the closed incident's street has emptied; `mapPose(site)`: where the camera is on the map | all but three |
| `live.ts` | the lazy chunk's entry: `openCamera(canvas, options)` checks WebGL 2 (once per page), loads the body model and the street under the window's abort signal, creates the view and the session, has the view prepare the first frame within a budget, returns a handle that also lets go of the base body | all |
| `render/view.ts` | `CameraView`: three.js scene, light, weather, people and cars of a frame; `prepare()` gets the first frames onto the graphics card | three |
| `render/world.ts`, `facades.ts`, `textures.ts` | the standing street: ground, roads, houses, trees, lamps, parked cars | three |
| `render/place.ts` | what the place an incident names is dressed as (`dressOf`, `boardLines`, `ownBuildingOf`, `frontEdgeOf`, `ownFacade`), its sheet (`makePlaceSheet`) and the dressing of its own building (`dressOwn`), section 9.4 | three |
| `render/human.ts` (`people.ts` as fallback) | people: one real body mesh dressed per `Look`, posed by `Pose` | three |
| `render/carbody.ts`, `cars.ts` | vehicles: shaped bodies, markings, switchable lamps; `CarKit`, what one view's vehicles share | three |
| `render/props.ts` | what is neither a person nor a vehicle: a dropped weapon, a stretcher, a sheet, a hose | three |
| `render/post.ts` | the camera's lens and recorder (the two screen passes), the burned-in text | three |
| `render/mesh.ts` | `MeshBuilder`: merged triangle meshes with a colour per vertex | three |
| `assets/human.glb` | the base body (see section 11) | |
| `__dev__/` | harness pages for looking at pictures without the game (not in the build) | |

`src/cctv/place.ts` (pure, no three.js) and `src/cctv/render/place.ts` (three.js) are two files: the first finds the
place on the street, the second draws it.

The game's UI part is `src/ui/game/CameraWindow.tsx` (the picture over the map), a line on the incident card, and
`src/map/cameraCone.ts`, through which the window tells the map where the camera is (section 14). The game's own bundle imports only `coverage.ts` (and types) from here; everything else loads through
`import('@/cctv/live')` (`tests/cctv-lazy.test.ts`).

## 3. Conventions

- **Scene space.** Origin at the point the street was read around: the point where the map draws the incident's
  marker, moved to the place the incident names (section 4); on a street from the map `StreetData.origin` says where
  that is. "The incident" below means this origin. `x` east, `y` north, metres (`math.ts frameAt`). A yaw is in
  radians from east towards north; a unit direction is `(cos yaw, sin yaw)`. The sim's heading (degrees clockwise from
  north) converts with `yawOfHeading`.
- **three.js space.** `x` east, `y` up, `z` south: a scene point `(x, y)` at height `h` is `(x, h, -y)`. A model stands at
  its own origin facing `+x`; its left is `-z`; `rotation.y = yaw` turns it to a scene yaw.
- **Determinism.** Everything about a scene comes from `hash32(...)` of stable ids (the incident's id, a place's
  rounded coordinate). The same incident shows the same street, camera, cast and choices every time it is opened, on
  every player's screen. Only the fine timing of an animation differs between two viewers.
- **Two clocks.** The game clock runs 15 to 120 times faster than real time (`src/sim/coop.ts TURN_SPEEDS`), so people
  on camera cannot follow it second by second: they would move like a time-lapse. The camera's scene clock, the
  street's own time, runs in real seconds at the game's 1x speed (15 game seconds a second) and below it (the
  real-time mode, an open 112 call), and at 2x, 4x and 8x two, four and eight times as fast, like a recording played
  faster (`situation.ts streetScale`, section 14); it stands while the game is paused. The game decides *what*
  happens and *when it starts* (a unit arrives, the incident closes); the director plays each change at a natural
  pace in the street's time. How many of the street's seconds away an arrival is comes from the game's speed at the
  pace its clock really keeps (section 14, the session's pace): from 1x up, 15 game seconds each. The picture's own
  life (the blue lights, the hazards, rain, grain and shake, the recording dot) keeps real seconds at every speed.
  The clock burned into the picture shows the game's date, hours and minutes.
- **Language.** Code comments and docs in plain English; UI texts through `src/i18n` (Estonian and English). No em
  dash and no en dash anywhere (owner's rule): write "-", ":" or a new sentence.

## 4. The street (`StreetData`, `Site`)

`tiles.ts` reads the Protomaps v4 basemap tiles at zoom 15 (the same archive the map draws, opened once by
`src/map/streetTiles.ts`): the one to four tiles that cover a circle of 160 m around the scene's origin. Layers used:

- `roads` (lines): `kind` and `kind_detail` give the class exactly as `scripts/build-mapdata.mjs roadClass` reads them
  for cars (`highway`, `major_road`, `minor_road`, living streets), plus `path` kinds (footway, cycleway, path, steps,
  pedestrian) and `rail` (`kind_detail` tram or rail). `oneway`, `is_bridge`, `is_tunnel`, `name` as there.
- `buildings` (polygons): `kind` building (parts are skipped as in the build script); `height` when the map has it,
  else a height from the footprint (section 4.1). A building cut by a tile edge appears in both tiles: pieces with
  the same feature id are kept as separate footprints with the same id (same colour and height), which draws right.
- `landuse` and `water` (polygons): parks, grass, forest and wood become `green` or `forest`; water `water`;
  pedestrian areas `paved`; parking `parking`; sand and beach `sand`; pitches and playgrounds `pitch`.
- `pois` (points), where the archive has the layer: `kind` and `name`. Only the kinds a place of the game can be are
  kept (the table below), each point once, the nearest 120 (`MAX_POIS`) within 200 m (`StreetData.pois`). An archive
  without the layer gives no `pois` field at all, and the rest of the street is the same.

Tile coordinates become scene metres through Web Mercator and the cosine of the origin's latitude. Roads are cut at
the circle of 160 m (`STREET_RADIUS`); buildings and areas that reach within 200 m are kept and clipped to a square
of 200 m half size around the origin. `StreetData.origin` is that origin on the map.

**Read for a place.** The window opens the camera at the point where the map draws the incident's marker
(`OpenOptions.origin`, section 14), and `live.ts` reads the street there for the incident's kind of place and its
name: `readStreet(archive, origin, { place: { kind, name } })`. The origin then moves in up to three steps:

1. To the map's own point for the place (`place.ts pickPoi`): among the archive's points of the kinds the place can
   be within 250 m (`POI_REACH_M`; read from the tiles that cover that circle), one whose name matches first (one
   name holds the other, or both start with the same word of three letters or more, compared in lower case without
   accents); else the nearest, a less likely kind (later in the table) only when it is 60 m nearer per step down the
   list. The game's coordinates are typed by hand and are often 100 to 300 m off. Without a `pois` layer, or for a
   kind not in the table, this step is skipped.
2. To just before the front of the place's own building (section 4.3, `planPlace`): 0.8 to 2 m out from the door
   (less where the road is closer), stepped out 3 m at a time while that point is inside a house. Where the road the
   front faces is more than 62 m off, the origin is 25 m short of that road instead. So the scene plays before the
   place, not on the street behind it.
3. Where step 2 gives no point and no road is within 70 m (the middle of a stadium or a station hall): beside the
   nearest road the street has (`roadAnchor`), on the origin's side, up to 5 m past its edge.

When the origin moves by more than 3 m, the street is read again around the new one (tiles already read are not
fetched again), and what was found to stand before the place (a canopy, a kiosk, a forecourt, bays, shelters) is
carried over to it (`carryDressing`), so that the site is built for the very place the origin was moved for.
`StreetData.place` (`PlaceHint`: `kind`, `name`, `at` the place's own point in scene metres, `door` the door found
on its front) tells `buildSite` what it is. Without `place`, `readStreet` reads the bare point as before.

| Kind of place | The map's point kinds, likeliest first |
| --- | --- |
| gasstation | fuel |
| bank | bank |
| bar | bar, pub, biergarten |
| nightclub | nightclub, bar, pub |
| shop | supermarket, convenience, department_store, marketplace |
| mall | mall, department_store, supermarket |
| school | school |
| kindergarten | kindergarten, childcare |
| university | university, college |
| hospital | hospital, clinic |
| trainstation | station, train_station, halt |
| busstation | bus_station |
| parking | parking |
| church | place_of_worship |
| hotel | hotel, hostel, guest_house, motel |
| stadium | stadium |
| museum | museum |

Any failure (no archive, a network error, a tile that does not parse, a read that takes more than 6 s, no road
within 70 m of the final origin, no place on the roads that holds a scene: section 4.2) ends in
`procedural.ts makeStreet(placeKind, seed, name)`, a believable street of the incident's kind of place. The picture
works without the map file; `StreetData.source` says which one it is (`'tiles'` or `'made'`).

A made-up street tells its place too (`StreetData.place`, for every kind `isShown` allows, section 4.2): its own
building is the layout's own (the shop, the hall, the petrol station's kiosk) or else the house nearest the origin
(within 30 m) for a kind that has a building, and `name` is the incident's place name, for its board. A bus station
has a layout of its own (`station`): the town street with the houses on the incident's side 9 m further back behind
a paved strip, so that its shelters fit along the kerb.

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

A street that names its place (`StreetData.place`) is first settled for it (`place.ts settlePlace`, section 4.3):
what stands before the place is added as street data, and the place's own building and front are found. `Site.street`
is that street with what was added (the street passed in is never changed); the session and the renderer use it.
The rules below then also want the scene before that front.

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
  the site with the least cost (the place's own and what its camera misses) is taken. With a place's front, a place
  not before it (on the front's side, within 30 m of it, with a free line to the door) costs 6 more
  (`OFF_FRONT_COST`): more than the next road. A place more than 30 m from an own building that has no front costs 3.
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
- **Door**: the own front's door when the scene is before that front and the door is within 32 m (`DOOR_REACH_M`);
  else the nearest wall point within 32 m, with its outward normal and its building (the own building's wall counts
  6 m nearer than another house's). When that is more than 12 m from the spot, the door is on the wall near the spot
  that the camera sees best (facing the lens and seen squarely, its foot and the window above it in the picture,
  free ground before it), on the own building first, when there is such a wall; an own front's door the camera
  already sees is kept.
- **Camera**: candidates are poles at both kerbs 8 to 31 m along the road (on the wall where a house stands at the
  kerb), points on the walls within 30 m, and poles on open ground 13 to 24 m round the spot; 7 to 40 m from the
  spot, with a free line to the spot and to the road; 5 to 7.8 m up (on a wall below its top). Each is aimed to hold
  as much as it can and its lens fitted (vertical field of view 36 to 64 degrees), then scored by what the picture
  misses (`rate`): the people at the spot, readable; the stretch of road the first crews stop on from each end they
  can come from (14 m before the spot to 6 m past it), with the first car whole; the door; not looking steeply down
  on heads; a long stretch of street rather than a close-up. The best eight are scored again at their other height,
  for a wall or a roof right before the lens and for a door out of the picture; among those within 0.3 of the best
  the seed chooses.
- **The place in the picture.** With a place, the lens is fitted first to hold also what says which place this is:
  what stands before it (a canopy's middle, the bays, the shelters, within 45 m of the spot) and, when the scene is
  not at a door, the own front's door. Each missed costs: the first thing before the place 2.5, the further ones
  0.7, the own front's door 1; a door at the scene that is the own building's costs 1.5 per mark missed (else 1).
  Where the door is far, a camera that sees no wall of the own building a door could be on costs 1.5 more. A place's
  camera also pays for a wall or a roof right before the lens (within 5 m) beyond the capped 1.5 of other cameras:
  8 times the share of the picture it covers less 0.2.
- **`Site.seen`**: the stretch of the drive line in the picture, in metres along it (as `drive.at`): from the point
  of the road nearest the scene that is in the picture, outwards both ways (at most 80 m) for as long as the road's
  centre line is inside the frame and not behind a house. Not set when the camera does not see the road at the
  scene. The director prefers stopping places inside it (section 8), so that the first cars stop in the picture.
- **Lamps** every 30 m (34 m on main roads) along the drive line, on alternate sides of roads wider than 6.2 m, else
  across from the spot; none right before the lens. A main road without pavements is lit only where a road joins it.
- **`Site.place`** (`SitePlace`): what the picture is to show of the place. Null for a street that names no place
  and for the kinds with nothing of their own (`isShown` false: residential, house, street, forest, lake, beach,
  highway, ruralroad, village, farm, summerhouse, oldtown, border). Else `kind`, `name` (the incident's place name, or
  null), `building` and `front`. `building` is a `Building.id` (parts of one building can share an id), null for a
  kind without a building of its own (a car park, a bus station, a park) or where none was found, and for a petrol
  station that is only a canopy. `front` is the stretch of that building's wall the scene is before (the wall the
  door is on when the door is the own building's, else the front that faces the road), at most 14 m to each side of
  the door, with its outward normal (`place.ts wallAt`); null without a building. The renderer takes the building
  with that id whose wall `front` lies on, and the wall the camera sees best when it lies on none (section 9.4).

`projectPoint(camera, p, h)` says where a point `h` m above the ground lands in the picture (16:9, before the lens's
bulge): `x` and `y` from -1 to 1, `z` metres in front of the lens. The site's scoring and the tests use the same
projection. Also exported: `clearLine`, `insideBuilding`, `onDrive`, `blocksView`, `walkLine`, `pavement`.

Known limits. `buildSite` costs about 6 ms for a typical street and up to about 70 ms for a large one, once per
opening; for a place up to about 100 ms at a petrol station and about 25 ms at a bus station (more places are
tried). In narrow lanes between high fronts the walls can fill a large part of the frame (about 4 percent of
old-town lanes). A door further than 12 m from the spot can be out of the picture when the camera sees no wall
near the spot. A wall or a roof right before the lens still fills a quarter to a third of the picture at some
places in the Florence sample (two churches, a petrol station).

### 4.3 The place (`place.ts`)

Works from the buildings, the roads and the areas alone; the map's points of interest only make the place's point
more exact. Pure.

**The own building** (`ownBuilding`), for the kinds that have one (`hasOwnBuilding`: gasstation, bank, bar,
nightclub, shop, mall, school, kindergarten, university, hospital, trainstation, hotel, church, stadium, museum,
office, government, embassy, prison, industrial). Of the solid buildings of 12 m2 and more: the one the place's point
is in, else the nearest within 35 m. For a big kind (mall, school, university, hospital, trainstation, church,
stadium, museum, government, prison, industrial) the most prominent within 60 m, by its distance less 0.6 times the
square root of its area, as the map puts its marker: a large hall 10 m off before the shed the point is in. For a
petrol station a small one (more than 400 m2 counts 30 m further), and where the map has a canopy (an open building
of 30 m2 and more within 40 m), one standing within 14 m of it. When the street was read for the place, the building
its door was found on.

**The front** (`frontOf`): the wall of 4 m or more that faces the best road. Each wall is asked, from a point every
3 m along it, what road lies before it along its normal within 110 m. A road counts its distance plus a reluctance:
a street 0, a service road or a motorway 30, a pedestrian street 12, a footpath 45; 30 more when another house or a
railway lies between. A long wall comes before a short one, and when the place's point is outside the building (the
map puts a shop's point at its entrance), the wall it lies before. The door is the point of the front that is about
as good as the best, nearest the place's own point. A kiosk faces a canopy the map has (or a house taken as the
canopy, below), whatever road lies beyond: the forecourt is its road. A canopy made beside the kiosk does not turn
the front.

**What stands before it** (`dressStreet`), added as plain street data so that the director keeps people and
vehicles out of what is solid and the renderer draws it as on a made-up street. A street that already has the thing
(a made-up petrol station, a mapped canopy) is left as it is.

| Place | What is added |
| --- | --- |
| petrol station | A canopy: an open building the map already has within 40 m; else a free-standing house of 80 to 600 m2 (short side 6.5 m or more, long side at most 45 m) within 14 m of the kiosk, marked open, 5.2 m high; else one made of 21 x 9.4, 16 x 9, 12 x 8 or 11 x 7.5 m, 5.2 m high, before the kiosk's front or about the point along the nearest road, clear of houses, roads, water, trees and pitches; else, when the point is inside a house of 80 to 400 m2, that house is the canopy and the station has no kiosk. No canopy is under 80 m2: the renderer puts pumps under a canopy only from that size. A `paved` forecourt about the canopy, reaching the road's edge where a road is near. A kiosk of 17 x 9, 12 x 7 or 8 x 6 m (4.2 m high) behind or beside a made canopy where the map has no building. |
| car park | A `parking` area (bays and parked cars are drawn on it) where the map has none within 30 m: the largest of 52 x 32 down to 18 x 12 m about the point, along the nearest road, clear of houses, roads, water, trees and pitches. |
| bus station | Where fewer than two shelters stand within 45 m: up to three shelters of 3.8 x 1.6 m (2.5 m high, open) along the kerb of the nearest road, 3.4 m beyond the kerb on the scene's side. |

`settlePlace` plans the place, dresses the street, and plans again where the dressing changed the own building or
what its front faces.

Known limits. A place far from any road (more than about 30 m) is played at the road, with its front in the
background. At big buildings the front can still be missed: a hotel 36 m back from its road and a hall whose map
point lies in the open 12 m from it showed no own front in the Florence sample, and at two railway stations the
door is on a neighbouring building, because the stations' own fronts face platforms and tracks. A church's tower
and spire are drawn but stood above the frame at every church tried: the camera neither tilts nor stands back for
them. No fence, school
yard, ambulance bay, platform or stand is made: the street data has no such thing and the renderer draws none.
Schools and hospitals say their kind only through the dressing of their own front (section 9.4).

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

`situationOf(sim, incident, speed, paused = false, played = 0): Situation` (`stage.ts`). `speed` is game seconds per
second of the street's own time while the game runs: the session passes its measured speed divided by
`streetScale` (so 15 from 1x up while the clock keeps its pace), and the last running one while paused, with `paused`
true. `played` is how much of the street's time the session has already played of a long step it plays in parts:
every eta is that much shorter. Pure: it only reads the state.

`streetScale(nominal, measured = nominal)`: seconds of the street's time one real second plays. 1 when the nominal
speed is at most `BASE_SPEED` (`TURN_SPEEDS[1]`, the 1x speed), else `max(1, measured / BASE_SPEED)`: 2, 4 and 8 at
2x, 4x and 8x when the clock keeps its pace, less on a slow device whose clock runs behind.

- A unit is listed when it is in the incident's `unitHistory`, assigned to it, or has it as its job.
  - `here`: standing within 150 m of the incident on a job there (on scene, writing its report after the incident
    closed, or waiting for help with an injured officer at the same address).
  - `near`: driving to the incident's own place with `(arriveAt - now) / 1000 / speed - played <= NEAR_S` (7 seconds
    of the street's time: real seconds at 1x, under a real second at 8x); `eta` is those seconds.
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

`sceneKindOf(incident)` gives one of eleven kinds from the incident's category, tags, template id and kind of place,
and from who and what the incident has (a victim, a suspect, vehicles). When in doubt it is the kind that shows less:
a camera never shows what the card does not say. A false alarm is `empty`; somebody about to harm themselves, on the
water or in an aircraft, and the side jobs of a forest fire are not staged (`indoor` at an indoor place, else
`empty`).

| Kind | When | What is on the street before anyone comes |
| --- | --- | --- |
| `brawl` | fights outdoors (violence with a suspect, public order with a fight), street robbery | people fighting, witnesses at a distance |
| `threat` | violence, public order or a major incident with a weapon, outdoors (in a shop, a school or a filling station it is `indoor`) | one person with a weapon, others keeping away |
| `disorder` | drunk, loud or unwelcome people, harassment without a vehicle, drugs in the open, a drunk or confused person to help, electric scooters without a victim | one to three people swaying, arguing, sitting |
| `lying` | drunk in the snow, an overdose, somebody who fell or lies in the road, outdoors; a traffic incident with a victim and no vehicle | somebody on the ground, the caller beside them |
| `crash` | collisions (traffic templates whose id or tags say so), bus crashes | the wrecks in the road, hazard lights, the drivers |
| `stop` | traffic incidents with a vehicle, harassment from a vehicle, a wanted vehicle on the plate cameras, drugs in a car, a fuel drive-off, the border's vehicles held with their driver | a vehicle at the kerb with its driver, or only whoever reported it (below) |
| `theft` | thieves and vandals at work outdoors (from a car, bicycles, graffiti, catalytic converters, fuel, copper), alarms outdoors | somebody working at a car or a door, a lookout |
| `indoor` | domestic, noise, anything under a roof, a fire alarm or a panic button | the door; perhaps the caller waiting outside |
| `crowd` | demonstrations, fans, riots; a bomb threat at a shop or a mall | twelve to twenty people |
| `fire` | fires and arson, burned cars | smoke from the building or the vehicle, onlookers |
| `empty` | false alarms, fraud and missing persons outdoors, anything a street camera would not show | nothing, perhaps the caller |

`castOf(sim, incident, template, dress)` builds the `Cast`. It reads the template as the incident's own scenario tells
it (`withScenario(template, incident.scenarioId)`, the same whether or not the caller has resolved it already), and
the card's own resolved summary (`incident.summary.et`) where the template alone does not say what happened.

**People.** Everyone of the incident except the missing and the dead, dressed by `figure.ts` for the weather
(`lookOfPerson`). People of nobody's registry are added as extras with ids `e:<n>`: twelve to twenty for a crowd,
three to six onlookers at a fire. **Vehicles** in their registry colour and kind (`lookOfVehicle`), else a made-up
car (`lookOfAnyCar`).

**What a stop shows of its vehicle** (`STOP_STORY`, `stopStoryOf`). Every template that can make a `stop` has a line
in the table: one answer for the whole template, or one for each of its summary variants in their order. A scenario
that tells another story has its own line, keyed `<template id>#<scenario id>`, which wins over the template's.
`variantOf` finds which variant the card is by matching its text against each variant with the `{placeholders}` as
wildcards. A template the table does not know, or a card that is none of its variants, shows the least (`away`).
`tests/cctv-cast.test.ts` keeps the table and the catalogue in step.

| Story | Example | On the street |
| --- | --- | --- |
| `held` | a drunk driver at a filling station | the vehicle at the kerb with its driver, in it or beside it (by seed) |
| `inside` | a driver asleep at a junction, a car watching a house | the vehicle, its driver inside until the officers have them out (`driverIn`) |
| `alone` | a child locked in a hot car | the vehicle, none of its people; only callers and witnesses |
| `gone` | a fuel drive-off, a driver who did not stop, a speeder | no vehicle and no driver: whoever reported it waits for the crew (`gone`) |
| `away` | a drunk driver reported from the road, a car still on a ferry | nobody at all (`gone` as well) |

**Crashes.** A crash is of one vehicle (`single`) when the template is one (a ditch, an elk, a train, the sea, an
armoured column: `SINGLE_ID`) or when the card says so in its own words, whatever the template usually tells
(`kraavi`, `katusel`, `külili`, `teelt välja`, `tammilt`, `teepervele`, `merre`): only the story's first vehicle is in
the cast. Somebody is still inside a wreck (`trapped`) when the card says that (`inimene sees`, `juht sees`,
`kiilunud`, `ei saa välja`, `juhti pole näha`, `autos on vähemalt`). After a hit-and-run (`lahkunud` in the id) the
suspect's vehicle is not there. A crash with fewer vehicles than it needs gets made-up ones of nobody's
(`v:other<n>`): two, or one for a single vehicle or a hit-and-run.

**Weapons.** `armed` when the tags say `armed`, `weapon_knife`, `weapon_firearm`, `weapon_gun` or `firearm`. The
weapon (`Held`) is a pistol for the firearm tags, a knife for `weapon_knife`, else a knife or a bat by seed.

**`Cast`** carries:

- `kind`, `seed` (`hash32('cast', incident.id)`), `people`, `cars`, `dress`, `priority` (the true priority, 1 the
  worst).
- `armed`, `weapon`; `drunk` (tags `alcohol`, `drunk`, `dui`, `drunk_driving`, `drugs`).
- `live`: the suspects are at it when the crew comes. True for every kind but `theft`, where it is true for a theft in
  progress or an alarm and else six times in ten; the director plays a theft that is not live as `indoor`.
- `down`, somebody on the ground from the start: always in `lying`; a `brawl` of priority 1 or 2 by a chance of 0.45;
  a `crash` of priority 1 unless somebody is trapped; a `threat` of priority 1 by a chance of 0.5.
- `runs`, somebody runs when the police come in sight: `theft` 0.7, `brawl` 0.3, `threat` 0.2, `disorder` 0.12.
- `mayFlee`: a pursuit can start (tag `vehicle_flee`, or a pursuit beat in the template), never for a vehicle that has
  gone.
- `single`, `trapped`, `gone`, `driverIn` (above); `inRoad` (a `lying` whose template is somebody in the carriageway);
  `chant` (a demonstration or fans) and `riot` (a riot or a clash) for a crowd; `carFire` (a vehicle burns, not a
  building).

## 8. The director (`director.ts`)

```ts
type Phase = 'open' | 'seen' | 'contact' | 'closing' | 'after';
class Director {
  constructor(site: Site, cast: Cast, opts: { night: boolean; quiet?: boolean; wet?: boolean; parked?: readonly ParkedCar[] });
  /** Follow the situation for `dt` seconds of the street's own time (section 14). The first call settles the stage (see 8.6). */
  update(sit: Situation, dt: number): void;
  /** Everything on stage now, for the renderer. */
  frame(): Frame;
  /** Where the story is (the session, the window's data-phase and the tests read it). */
  phase: Phase;
}
```

The director is plain state stepped by `update`: no timers, no three.js, no randomness outside `rand(seed)`. The same
site, cast and situations give the same frames. Every change has to be safe at any moment: a newer instruction
replaces the older one, and whoever should be elsewhere walks or drives there.

- `night`: the light is dark (the session passes `env.night >= 0.5`). `quiet`: no passing traffic and no
  passers-by (the tests). `wet`: it rains (`env.rain`).
- `parked`: the cars the renderer drew parked in the street (`types.ts ParkedCar`: the middle of the car, its yaw,
  length and width). `render/world.ts` decides which places are filled and returns them as `World.parked`; the
  view keeps them as `view.parked`; the session sets the scene on the view first and passes them on. The director
  treats each as solid: no vehicle stops, drives or turns in one, nobody stands in one or walks through one.
- `site.seen` (section 4.2) is the stretch of road the camera sees: an arriving crew's stopping place is weighed
  against it and against the real picture (8.2), so that the first cars stop in sight.

**Steps of the scene.** The scene runs in steps of 0.1 s (`STEP_S`) whatever the frame rate, kept up to one step
ahead of the picture; `frame()` draws everybody between the last two steps, so the picture does not depend on how
time is cut into frames. Somebody put elsewhere at once (out at a door) is drawn where they are, not on the way. A
gap of more than 2 s (a hidden tab) is not played out in full.

### 8.1 Bodies and steps

A person on stage has a position, a yaw, an `Act` (what it does standing still), a gait while it walks, and a queue
of steps:

- `go` (walk, run, stagger, back away, escort or shuffle in a straight line to a point),
- `act` (an act, facing a point, for some seconds or until another replaces it), `wait`,
- `slide` (moved to a point in some seconds without walking: out of a car door, onto a stretcher),
- `follow` (kept at somebody's side while they walk: 0.6 m behind them and half a step to the right, the hand on
  their arm, or on their left 0.75 m off; where a wall or a parked car has that place, 0.7 m right behind them; at up
  to 1.5 times the escort's pace, turned the way they walk; it ends when they have arrived, or after 6 s kept from
  that place, 2 s on the left),
- `door` (shrink into the door or grow out of it in half a second), `hide` and `show`, `gone`, `call` (run a
  function).

A walk to a point is planned as `go` steps (`route`): straight when no house is in the way, else by way of the spot,
the road or the door, or along the walking lines; then round every vehicle that stands in the way (the parked cars
and the scene's own standing vehicles), by its corners 0.6 m out (`CORNER_M`), up to three vehicles one after the
other. Whoever starts at a car's door goes round its front. The walking lines are the site's, moved off the cars
parked along them.

- **Feet and turns.** Walking advances a step phase by distance covered, so feet do not slide (`figure.ts STRIDE`,
  `PACE`: walk 1.35 m/s, run 4.6, stagger 0.75, back 0.8, escort 1.1, shuffle 0.6). Each body has its own pace,
  0.9 to 1.1 of that, except in step with somebody it leads or is led by, and nobody walks in step with a neighbour.
  When the act changes, the pose blends from the one shown over 0.3 s (`BLEND_S`), longer where a step says so
  (getting up, getting out of a car). A body turns towards where it walks or what it faces at no more than 7 rad/s;
  `figure.ts DOWN` acts (lying, prone, sitting, falling, on one side, on a stretcher) do not turn.
- **Nobody inside anybody.** People keep 0.6 m between their middles (`NEAR_M`). A step that would come nearer goes
  round on the right, as people pass on a pavement, else on the left, else waits; kept waiting 1.6 s (`STALL_S`), they
  squeeze through for two seconds. Exempt: whoever they walk with (an officer and the one they lead, two fighters, a
  crew at work), whoever lies or kneels, and the last step to somebody's side; somebody led to a car by an officer
  is not held up by the other officers (they make room).
- **Led by the arm.** A body with a `keeper` (the cuffed on the way to the car) does not step on while that
  officer's `follow` has fallen more than 1.15 m behind, unless the officer has been kept from their place for 3 s.
- **Nothing solid.** Never into a house, never within 0.4 m of a parked car (`PARK_BERTH`) except to get out of
  that berth: a `go` step that would enter one ends there. In gait `escort` the two go round the corner instead, by
  a sidestep, for at most 1.6 s (`STALL_S`). Never into the way of a moving vehicle (the stretch before it, an arm's
  length beside it, the swing of one turning round): they wait for it to pass. A stretcher is not pushed under one
  either. Nobody stands on open water.
- **Places.** At the start nobody stands on somebody else's place (0.6 m apart; fighting pairs excepted). An
  officer's post is never within 0.8 m of another post or on a standing person of the incident.
- **The idle step.** Somebody who stands calmly (idle, stand, phone, cold, smoke, point, guard, cower, gasp) turns
  their head towards the action (a vehicle driving up, the fight, the weapon, an officer at work, else the spot), up
  to 1.15 rad and a third of a second behind. While somebody lies dead there, an officer's head follows whoever of the
  public walks within 14 m, else looks straight ahead. A pointing arm comes down after 2 to 4 s, hands thrown up
  (`cower`) after 4 to 8 s. Every 5 to 11 s a body (not a passer-by) either shuffles a step or two aside (0.35 to
  0.8 m) and back to its own place, or, somebody of the incident, changes pose (`lookOn`: idle, phone, cold, point,
  and `gasp` while there is something to be afraid of: a weapon out, a fight, somebody down or dead, a fire) and
  turns their body to the action. An extra makes no call. A frightened body (`cower`, `gasp`) steps 0.3 to 0.6 m
  back from the action instead and returns after 2.5 to 6 s. Nobody takes a step that brings them nearer to a weapon.
  An officer at a `notes` post writes 9 to 15 s, looks up 4 to 8 s (`guard`) and writes on. None of this is an order:
  such a body takes new orders at once.
- **Some acts.** `guard` is hands on the vest at the chest, feet apart, the weight going from one foot to the other.
  `bar` is an arm raised forward, palm out, at somebody who comes too near: held a few seconds, not a stance. `gasp`
  is a hand over the mouth, the other arm across the body. `aid` and `cpr` are on both knees, sitting back on the
  heels (hip 0.4 and 0.47): low and compact from every side.
- **Directing traffic.** An officer at a `direct` post waves only while a vehicle comes towards them within 40 m;
  else they stand and watch the road.

People leave along the pavement of their side (or across the road and along the other) to an open end of the drive
line, each on a line of their own up to half a metre off the pavement's middle, arms down, and are removed 60 m from
the spot (`OUT_M`).

### 8.2 Vehicles

A vehicle follows the drive line (`s` metres along, `lat` metres to the left, a direction) at a speed that eases in
and brakes to a stop at its place; its yaw is the line's direction over 3 m about it, plus the swing of its wheels
(at most 0.3 rad). It moves sideways only as far as wheels turn: nothing while it stands, sharply at a crawl, gently
at speed (about 1.2 m/s, `SIDE_V`).

- **Lanes.** Right-hand traffic: from end a to end b at `lat = -width/4`, the other way at `+width/4`; on roads
  narrower than 5.4 m (`NARROW_M`) on the middle, `lat = 0`.
- **The kerb.** A vehicle stops at `lat = -/+(width/2 - 1.15)`; on a lane narrower than 3.3 m (`KERB_MIN_M`) there is
  no kerb to pull in to and it stands on the centre line.
- **Stopping places** (`slot`). Every metre within 70 m of the scene, at both kerbs, is weighed by its cost: how far
  it is from the usual 5.5 m short of the scene (`STOP_M`; never nearer than 4 m, `MIN_STOP_M`); across the road from
  the scene, the road's width plus 5 (the crew would cross it on foot); past the scene, 3 (30 past somebody armed or
  ahead of a car the police pulled over); not wholly inside `Site.seen`, 60; not wholly in the camera's real picture
  (its eight corners through `projectPoint`), 40; in the lane beside parked cars instead of at the kerb, 1.5. A
  `crash` stops 10 to 12 m short of the wrecks, a `threat` 9 to 10 m short of the weapon; the police stop 9 to 9.5 m
  short when an ambulance is asked for and somebody is down, leaving the kerb beside them to the ambulance, which
  stops level with its patient (in the lane when wrecks shut the road). Until the ambulance is here, and when the one
  down is not in the carriageway, a patrol's place on the side of the patient the ambulance will come from costs 8
  more, so that it stops beyond the patient where it can. Never within 6 m of what blocks the carriageway, beyond a
  place where the road is shut for it, on a place taken or about to be, or on somebody in the road. Room is asked for
  first (5 m before and behind, `ROOM_M`, and 3 m of road left free beside, `PASS_FREE`), then less (1.2 m), then
  none. A place out of the picture is taken only when no place in it fits even with less room;
  none at all, and the vehicle stays out of the picture.
- **Taken places.** From a car parked in the street a vehicle keeps 0.8 m before and behind (`PARK_GAP`), 1.2 m
  beside for its doors (`PARK_SIDE`) and 2.6 m of free kerb behind its place to swing in (`PARK_IN`). It does not stop
  across the road from a standing vehicle where less than 3.5 m of road (`PASS_M`) would stay between them, unless far
  enough along for an 8.5 m lorry (`LONGEST_M`) to swing from one side to the other. Where cars are parked along the
  kerb it may stop in the lane beside them, half a metre off them, while 3 m of road stay free.
- **Parked cars are solid.** No vehicle stops, drives or turns round in one. It passes them a hand's breadth off;
  one on the inside of a bend counts wider by the swing a passing vehicle takes. Where the parked cars alone leave no
  way through for a vehicle of a width (a pinch), nothing of that width passes.
- **Arrival.** A unit that turns `near` (or `here` first) comes in at the end of the drive line on the side it comes
  `from`; the first crew at a `stop` comes from the end behind the stopped car, so that it pulls in behind it at the
  same kerb; another service's end is chosen by seed. Nobody comes out of a dead end while the other end is open.
  An end where the drive line was cut at a house is a wall: nothing comes from behind it, unless the open end has no
  place for the vehicle at all. Arrivals from the two ends come in turn: while one vehicle drives up to its place, or
  something moves near the mouth of the road (on a road of one lane: anything moving), a vehicle at the other end
  waits for its turn and looks again every 0.45 s. It comes from the other end only when that gets it 25 nearer in
  cost. It comes with blue lights (as its livery has them) and headlights on.
- **Timing against the game.** Its speed is planned so that it stands at its place when `eta` runs out (between 3.5
  and 10 s; 3.5 s for a unit already `here`; cruise 5 to 24 m/s, braking 3 to 9 m/s2). While the unit stays `near`
  and its `eta` moves by more than a second from the car's own (the game's clock ran slower or faster than it said),
  the car is planned again to the new time. Once the game says `here`, it stands within 3 s. Nobody gets out of the
  car before the game says the unit is `here`, however early the car stands; the session's pace (section 14) keeps a
  `near` crew `coming` until the pace has been measured.
- **On the way.** A moving vehicle keeps its lane and moves over in good time round whatever stands ahead: 0.8 m
  (`BERTH_M`) from a standing vehicle, a hand's breadth in a squeeze, 0.3 m from a parked car, 0.9 m from somebody
  standing in the road, 0.6 m from somebody walking along the road's edge (the passing walker is overtaken slowly
  where less than a metre is free, not followed at a walk). It never passes between a standing vehicle and the road
  edge that one stands by unless a lane's width is there, never moves out into the way of one that comes towards it
  (it waits in its lane), and on a road of one lane two that meet each keep to their right, using up to 1.2 m of the
  verge. It follows a vehicle going its way, creeps round one standing at 1.6 m/s (`CREEP_V`), waits 5 m back from
  one it cannot get round, stops short of one coming straight at it, and stops for anybody in the road before it.
- **Pulling in.** It moves over to its place from 16 m before it, 8 m more for each metre across, but only once past
  the last thing standing at that kerb before the place. A place at the far kerb crosses the way of oncoming traffic:
  it waits short of the turn until that has passed. A vehicle that stops more than 0.35 m short of its kerb line backs
  off and comes again, twice at most, then stands where it got to. Its wheels come straight as it stands, unless its
  tail would swing into what is beside it.
- **Jams.** Wedged against something it could get round with more road, a vehicle backs off up to 4 m first. Kept
  from getting on for 8 s (`STUCK_S`) it goes on slowly; it may then pass people closer than usual, but never moves
  into a person before 32 s and never into another vehicle or a parked car at all: it stands instead, and every 4 s
  backs off a little and comes again. Two that stand nose to flank, each steered for its own lane, straighten
  together.
- **A held-back crew.** Kept for 4 s within 14 m of its place by people standing in the road (beside whoever lies
  there), a crew's car stands where it is. A crew the game has had on scene for 8 s (`LATE_S`) that is still kept from
  its place gives it up for the nearest free one in the picture, never past its own.
- **Crew.** Up to two officers for a patrol, up to four for rapid response and special units. They open their doors
  a moment after the car stops (the first after 1.5 to 3 s, each next 0.8 to 1.5 s later; 0.9 to 1.4 s and 0.5 to 0.9 s
  when it is urgent: a `threat`, priority 1, a fight going on). The bent pose (`duck`) is the first one shown, held
  0.2 s in the door; then they rise over 0.6 s while stepping out of the car's outline (0.3 m in 0.55 s). Getting
  in, they are bent low within 0.2 s, hold it 0.3 s, and slide 0.45 m into the car's outline over 0.45 s before they
  are hidden. Doors: the driver left front, then right front, then the rear doors; a van's or a lorry's crew at the
  driver's door and the side door; where a door opens into a wall or a parked car, the one across. They walk to their
  posts (run for a `threat`, priority 1, a fight going on, a victim about to fall, or a closing scene being played);
  somebody getting out on the road side walks round the front of the car. While the crew is here the lamps are on
  only at night and the blue lights while the incident is open; a police car's at a crash also after that, while a
  wreck still stands in the carriageway.
- **Leaving.** A unit that turns `left` (or is no longer named) leaves: its officers walk back, duck in (anybody still
  kept away after 40 s is put aboard), and the car pulls out when it can. A closing scene (8.5) is played first, for
  at most 14 s (`HOLD_S`) from the outcome; the police also wait while the wrecks are being moved, for at most 55 s
  from the outcome (`WRECK_HOLD_S`; the ending's clock runs on after its scene is played). It pulls out when nobody it
  waits for is still on the way to it, nobody stands right before it, nothing passes, and nothing comes towards it
  within 60 m (on a road of one lane, anywhere along it); on a road of one lane blocked ahead a crew waits up to a
  minute (a car of the incident as long as it takes), and after a minute any vehicle goes. It drives off the far end
  at 11 m/s (17 with blue lights). Blue lights on only for a pursuit, the cells or the hospital, not for a ride home.
- **U-turns.** A standing vehicle turns round in 3.4 s (`UTURN_S`) when the way ahead is worse than the way back
  (blocked, then ending at a wall, then ending) or when it has to follow a vehicle that made off; to the other kerb's
  side when that is free. It waits for the room to swing (no vehicle within its swing, nobody within reach, for up to
  32 s), and edges out from a parked car beside it first.
- **Recalled and called back.** Told to leave before it stopped, a car drives on through when the road ahead is
  open; where it ends, it stops, turns round and goes without anybody getting out. Called back while boarding, its
  crew gets out again; called back after it pulled away, it stops again at the kerb ahead.
- **Wrecks.** When a crash is over, every wreck that can roll is moved to a kerb (8.5). Its driver walks to the door
  and gets in; a free officer does when the driver cannot or is more than 25 m from it. Another officer walks to the
  roadside 2.2 m past the kerb place and stands there in `direct` while it rolls, then goes back to the car. The
  wreck backs free of the other one and straightens, and rolls at 3.2 m/s to the nearest free kerb place 6 to 40 m
  ahead (not past anything standing ahead), else to one 4.5 to 10 m behind at its own kerb, else it straightens in
  its lane at its kerb, else it joins the other wreck's kerb; hazard lights stay on. No free place yet: it tries again
  every 4 s, eight times. A wreck kept from its place (it has not moved for 6 s, or has not parked within 24 s of
  setting off: somebody stands where it would back to, the way ahead is shut) is parked where it stands, and the move
  ends as any other: the driver or the officer gets out and the guiding officer goes back to the car. On a road
  narrower than 5.4 m nothing is moved, and nothing once the phase is `after`. The driver, out again, steps onto the
  pavement and stays by the car (`phone` 9 to 15 s, then `idle`) until the last police crew boards, and walks off 2
  to 6 s after that (`driversGo`); one still on the way out of the wreck then finishes that first. With no police
  crew here or arriving when they get out, they phone 9 to 15 s, wait 2 to 6 s and walk off.
- **Other services** arrive the same way (`vehicle.ts lookOfAgency`): an ambulance with two paramedics, the rescue
  service a lorry with three rescuers, the local government two, others one (social workers, vets and the security
  police in plain clothes). A service with no vehicle a camera would see (the sea rescue) is not staged, nor are
  helicopters and boats. Each comes once; it leaves when the incident has closed and its part is played.
- **Passing traffic.** On through roads of class tertiary and up without a dead end, a car every 6 to 25 s by class
  (2.4 times fewer at night), 10 to 13.5 m/s, headlights at night. None while the carriageway is blocked, while
  somebody armed is in the street, while a crew member stands in the road, or on a road of one lane while a crew's
  vehicle moves.
- **Passers-by.** One every 10 to 40 s along a pavement (three times fewer at night; none with `wet`, which the
  session sets from `env.rain`: rain, storm and sleet, not snow; none while somebody armed is in the street), on the
  far side while a `brawl` or `threat` is open or a cordon stands. Whoever is on their way within 30 m of a weapon, or
  on the cordoned side, turns round.

### 8.3 Posts

Each kind of scene keeps a list of posts for the officers who arrive: where to stand, what to face, what to do
(`guard`, `talk`, `notes`, `aim`, `aid`, `cpr`, `lean`, `direct`, `look`, or "go in at the door"), and whom the post
is for. An officer takes the first free post; when all are taken, or the story has been played, they stand guard by
their car on the pavement side. The first officer reaching a post (or the door) is the moment of `contact`. When the
person a post is for has gone, the post goes and its officer stands by the car.

### 8.4 The kinds, phase by phase

Phases: `open` (nobody has come) -> `seen` (the first police car is in sight: 3 s before it stops) -> `contact` (the
first officer is at a post) -> `closing` (the outcome is known and being played) -> `after`.

When the first police car comes in sight, witnesses and extras who stand 2.5 to 9 m from the spot make room: after
a moment they back off 2 to 3.5 m further (not in a `crowd` or at a `fire`; somebody cowering then gasps).

Whenever a paramedic reaches a patient, an officer who knelt there (`aid` or `cpr`, within 3 m) hands over
(`handOver`): they get up (0.8 s), step back 2.4 m to a free place round the patient and stand guard with their back
to the work; that post becomes `guard`.

**brawl.** Suspects and victims pair up (two groups of suspects when there are no victims), each pair 3.8 m from the
next. They fight in turns of 5 to 9 s, hitting (`fight`) and holding on (`grapple`, closer), the pair drifting a few
decimetres and slowly circling round its middle at a fighter's shuffle. A suspect without an opponent rages
(`argue`), a victim without one cowers. With `down`, the fall is for the camera: 6 to 12 s after the picture opens
(or when the police come in sight) one victim falls (`fall`, then `lie`), the suspect kicks (`kick`) and then prowls:
a few steps away, shouting at a witness, back, now and then another kick. Witnesses and the caller stand 7.5 m and
more away, not in a row (`phone`, `point`, `cold` in winter). *Seen:* the caller waves; with `runs`, one suspect runs
off along the pavement away from the arriving car, and the first officer out runs 14 m after them, looks, and comes
back. The fight stops when an officer on foot is within 8 m of a suspect or a fighter, or the police have been in
sight for 6 s, so that it is over before an officer is in it: the fighters step back to their places, the suspects put
their hands up (`handsUp`, 2.5 s) and then stand or argue, a victim on the ground stays there. Posts: `guard` by each
suspect, `notes` with the first victim (`aid` kneeling when they are down), two more `guard` between. Paramedics kneel
at a victim on the ground.

**threat.** One suspect with the weapon in the hand (`brandish`, `Cast.weapon`), pacing a metre to either side
(`PACE_M`). Everybody else stands 9.4 m and more from it, along the pavement either way and then across the road, in
a loose knot, starting nearer and backing off (`cower`, `phone`); whoever finds no such place is not there (they left
while they could). Nobody but the police comes within 6 m. A victim who is `down` lies a few metres off. Crews stop
10 m short. The `aim` posts are on a ring of 8 to 8.6 m round the weapon, towards the road; an officer whose car
stands within 13 m takes cover behind it instead (the first over its bonnet, the next behind its door, on the side
away from the weapon, at least 7.2 m from it). With `runs` the armed suspect runs at *seen*. *Contact:* 2 to 4 s later
the suspect gives up: hands up, the weapon dropped a step to the side (it lies there, a prop), the back turned to the
officers, on the knees (flat on the ground with a pistol). The nearest officer walks up from behind, still aiming,
kneels behind them with a hand on them (`kneelHold`) and cuffs them in 4 s (`kneelCuffed`); the others keep their
aim until the cuffs are on, then lower it (`guard`), look on for 2.5 s (each next one 1.3 s longer), and walk back
to their own car, where they write (`notes`, 7 to 12 s) and then stand guard by it: nobody stays at a cover post. One
of them first picks up the weapon (`crouch`, 2 s) and carries it to the boot of their own car (`carry`, then `lean`
2.5 s at the rear). The officer who cuffed them stays behind them holding (`hold`) until the arrest is played. With
nobody left to aim at, the officers look round.

**disorder.** One to three people at the spot: swaying (`sway`; the third smokes), arguing with each other, the
second sitting on the kerb six times in ten; a drunk one may stagger 2 m to and fro. With `runs` (and more than one
of them) one runs at *seen*. *Contact:* the one staggering comes back to their place, and they turn to the officers
(`sway` when drunk, else `talk` or `argue`). Posts beside them (`talk`, `notes`, `guard`) and one more `guard`.

**lying.** The victim lies at the spot (in the lane on the spot's side when `inRoad`: the road is then blocked and no
traffic passes). The caller stands beside (`phone`; at the kerb when the victim is in the road) and waves when the car
is seen. Posts: `aid` kneeling beside the victim (`cpr` at priority 1: nobody looks at somebody whose heart has
stopped), `notes` with the caller, `guard`. The ambulance stops level with the patient; its paramedics kneel at them
(`aid`, or `cpr` for the first at priority 1), and the officer who knelt there hands over (above).

**crash.** Two wrecks in the road at the scene: one in its lane 1.8 m short of it turned 0.44 rad, the other 2.8 m past
it (6.5 m for a long vehicle) across it; they block the carriageway. A single-vehicle crash is one vehicle half off
the road on the scene's side; a wreck that would stand in a parked car stands straighter. Hazard lights blink. The
drivers stand at the road's edge (`phone`, `argue`), and once each walks round their own car and looks at the damage,
some seconds after the picture opens. With `down`, an injured person sits or lies at the kerb by the wrecks. With
`trapped` one person is inside the first wreck, not seen; an officer leans in at its door, and the paramedics and the
first two rescuers go to its doors: 9 s after the rescuers are there (12 s after the paramedics) they have the person
out, lying beside the wreck, and the paramedics see to them there; an outcome gets them out too, except a tragedy.
Posts: `notes` with a driver, `direct` in the road 8 m before the wrecks (not for one vehicle), `aid` at the injured,
`guard`. Crews stop 10 to 12 m short and come from the side they can reach, never through the wrecks. The rescue crew
works: the first two crouch at the wrecks' noses (the batteries), then lean in at a door (or the second sees to the
injured), the third crouches along a wreck three times and then guards the road 30 m out. After the outcome no
driver walks off while their wreck stands in the road: they wait beside it (up from the kerb if they sat there) and
move it (8.2, Wrecks); a driver who sat with the paramedics gets up when the ambulance packs and stays by their wreck.

**stop.** The vehicle stands at the kerb on the scene's side, lamps on at night. The driver sits inside (`driverIn`,
half the time by seed, or where there is no room beside it), not shown, or stands on the pavement side (`sway` when
`drunk`, else `idle` or `smoke`); other suspects stand on the pavement beside it. Posts: at the driver's window from
just behind it (`lean`: the driver has to turn to the officer), or `talk` with a driver who stands; `guard` at the
vehicle's rear corner on the pavement. The patrol pulls in behind it at the same kerb, never ahead. *Contact:* a driver
who sat inside gets out 6 s later and comes round to the pavement, and the officer at the window follows with notes.
With `gone` there is no vehicle: whoever reported it waits at the spot, an officer hears them out (`notes`) and the
second looks along the road the vehicle went by. *Pursuit* (`situation.pursuit` turns `on`): every crew here runs for
its doors at once; the suspects run to their vehicle (it waits for them up to 3.5 s; too late, they run off on foot),
it pulls out hard and is gone off an end; the officers follow the way it went with blue lights (their unit turns
`left` in the situation).

**theft.** With `live`: the thief crouches (`crouch`) at a victim's car door on the pavement side, else at the
building's door or the spot; a second suspect keeps watch (`look`) a few metres along; a suspect vehicle waits at the
kerb behind with its lamps off. Without `live` it is played as `indoor` (the thieves have gone). *Seen:* with `runs`
the thieves drive off in their vehicle, or without one all run together, and the first officer out chases them a
stretch. *Contact:* anyone left puts their hands up for 3 s. Posts: `guard` beside each suspect, `lean` at the damage,
`notes` with the victim or the caller, `look`.

**indoor.** Everybody but the caller and the witnesses is behind the door. The first of those waits at the door half
the time (by seed: `phone`, `smoke`, `idle`, `cold`) and waves when the car is seen; the rest are inside. Posts: the
first two officers go in at the door (when it is more than 10 m from the spot they look at the spot first); a third
stays outside (`guard`). While the crew works, every 25 to 40 s one officer comes out, walks to the car's door, leans
in for 5 s (the radio) and goes back in. Paramedics go in. Without a door in sight "in" is round the corner, 20 m
along the pavement.

**crowd.** The extras stand in a loose cluster 6 m across, far enough from the kerb for the line before it (`idle`,
`talk`, `chant` for demonstrations and fans, a few `argue`); with `riot` up to three pairs fight where they stand.
Suspects and victims stand at its front. The fights stop as in a brawl. Posts: a line of eight officers 1.5 m apart
between the crowd and the road, behind the kerb, facing it (`guard`).

**fire.** Smoke from just before the door's wall at 2.8 m (a window above the door: smoke from the roof would rise out
of the picture at once), or from a vehicle at the kerb with `carFire`, strength 1. The onlookers stand in a loose knot
on the pavement about 11 m out from it and up to 2.6 m further back (`point`, `phone`, `cold`). Posts: `direct` and
`guard` at the kerb before them. When the rescue service is here, two rescuers are on the hose (`hose`): the first
4.2 m before the smoke on its own side of the road, the second 1.2 m behind on the same line, both facing it. The
third stands at the lorry's pump, at its road side a metre from the rear. The hose lies on the ground in a
loose curve from the pump, comes up a step behind the crew, runs through the second one's hands to the nozzle at the
first one's waist, and a water jet arcs from the nozzle to the smoke (`PropFrame.aim`). While they are at it the
smoke fades towards 0.15 (by 0.85 over 30 s), and to nothing once the story has been played.

**empty.** Nothing; a caller in the cast may wait at the door as in `indoor`. Posts: `look` at the spot and near the
door.

### 8.5 How it ends

When the situation has an outcome, or the incident closes, the phase is `closing`. The closing scene starts once an
officer has reached a post, or no police crew is around, or 14 s (`HOLD_S`) have passed. Fights, pacing and whatever
the scene still had in store stop; somebody shut in a wreck is got out (except in a tragedy); officers still behind
a door with no part in the end come out one after another and wait by their car.

| Result | What is played |
| --- | --- |
| `arrest` | As many as there are arrests (at least one) of the suspects on stage (drivers when there are none). The crew the game sends to the cells (`takes: 'arrest'`) does the arresting, the others lend a hand: an officer to each suspect, and whoever already holds one keeps them. Anybody without an officer yet waits with their hands up. The officer walks up behind them (runs from over 9 m), takes hold (`hold`), the hands come down behind the back while the officer holds them (`cuffed`, about 3.6 s; somebody kneeling or lying is helped up). Then the two walk to the rear door of that crew's car as one: the cuffed goes ahead (gait `escort`), the officer is kept behind them at their right (`follow`), and the cuffed stops while the officer is more than 1.15 m off. A free officer of the same crew within 6 m walks on the cuffed's other side and then goes back to the car to write. A walk cut short (something in the way) is planned again from where they stand, up to twice. At the car the suspect is patted down (`frisk`, 6 s) and put in with a hand on the head (hide). The officer then takes whoever still waits; when their prisoner is in, the crew gets in too. The others walk off from 3 s on. |
| `escaped` | A suspect on stage and not on the ground runs off along the pavement; the nearest officer takes in what happens for a moment, runs ten metres after them, looks, and walks back. Nobody is taken. The others go from 4 s on. |
| `hospital` | The patient (whoever is down, else a victim) goes with the crew the game sends to hospital (`takes: 'hospital'`), else with the ambulance that stands here. Somebody who lay goes on the ambulance's stretcher: one paramedic fetches it from the back of the ambulance while the other stays with the patient, it is pushed up to them, both crouch and lift them on, and it is wheeled to the rear doors and in. Somebody who sat or stood, or who goes in a police car, gets up slowly (onto one side, sitting, a knee, standing: four to five seconds) and is walked to the rear door between the helpers; from an `indoor` scene they come out of the door together. Without a vehicle to take them the patient sits (`sit`) with an officer kneeling beside (`aid`); when the last police crew goes they get up and walk off, or go with it when it takes them to hospital. |
| `tragedy` | Whoever is down stays down. The paramedics stop and stand (`kneelUp`, then `stand`); one fetches a sheet from the back of the ambulance and covers them (a prop that names whom it covers); with no ambulance there, an officer fetches the blanket from the boot of their own car. Up to four officers stand 3.4 m round with their backs to the dead, facing out, hands on the vest (`guard`): a cordon, and no passer-by walks that side. An officer raises an arm (`bar`, 2.4 to 3.2 s) only at somebody who walks within 9 m of them from outside the ring. Nobody leaves in a hurry (the people of the incident go slowly from 10 s on). The dead and the sheet stay where they are after the last crew has gone, and the pavement stays closed. Only a stage settled before the first picture (8.6) has them taken away. |
| `warning`, `fine`, `report`, `resolved`, `referred`, `unfounded`, `false_alarm` | An officer writes for 4 s (`notes`, facing the main person when near), then stands guard. A crew that drives somebody home or to a station (`takes: 'ride'`) has the suspect or victim get into its car after a word. Everyone else of the incident goes their own way from 4.5 s on: drunk people stagger, residents go in at the door, somebody on the ground gets up first, or, while the ambulance is here, sits up and stays with a paramedic until it packs. Drivers walk to their own vehicle and drive off: a `stop`'s vehicle (not after an arrest), the wrecks of a crash where nobody was hurt and it was not a single vehicle; the vehicle pulls out ten seconds on at the earliest, when its driver is in. At a crash with somebody hurt or of a single vehicle the drivers do not go at 4.5 s: they stay by their wrecks (below) until the last police crew boards, and walk off then; with no police crew there they go when the phase turns `after`. A crowd breaks up in knots of one to three over half a minute, towards both ends of the street; some cross the road, a knot in seven stays talking 10 to 20 s longer. |
| closed without units (`closedBy` referral, phone, prank, duplicate, expired) | The people of the incident set off within fifteen seconds and drift away, drivers in their vehicles; an `indoor` caller goes in. |

A crash's wrecks are moved to the kerb (8.2), the first 9 s and the second 18 s after the closing scene starts, unless
their drivers drive them away. While they wait to be moved, and after, their drivers stay by them; they walk off when
the last police crew boards, or, when no police crew is there (closed with nobody sent, only an ambulance, a camera
opened after it was over), when the last crew of any kind has gone and the phase turns `after`. A driver who was to
get up from the kerb first still does. From an `indoor` scene the officers come out of the door first (with the cuffed
suspect or the patient).

When the story is played, no wreck is still to be moved (or 55 s have passed since the outcome) and nobody of the
incident is left in the street, a police crew gets into its car until its unit is released; one officer stays out at
an `indoor` scene's door. (At a tragedy the dead are still in the street, so the cordon stands until the units are
released.) Then the crews leave as their units are released (8.2), the people of the incident still there walk off,
and the phase is `after`: the street with its passing traffic. After a tragedy played live, the dead under their sheet
are still there in `after`, and the pavement round them stays closed.

**Not done.** Car doors do not swing: people duck in and out at a shut door. There is no tow truck: a wreck moved to
the kerb stays there, hazard lights on, and still takes that lane; it goes to the nearest free kerb place, which can
be 15 to 20 m on when the nearer kerb is taken. The dead are not taken away while the camera looks, and nobody stays
with them once the crews have driven off: the dead and the sheet stay, the pavement stays closed. In a lane where
only one vehicle fits, a second patrol that comes before the ambulance can still stand between the patient and the
ambulance. Arrivals from the two ends coming in turn can hold a second wave back for some seconds (about 25 s with
eight vehicles at once). A vehicle using the verge of a narrow lane does not check the house fronts there. A wreck
that is kept from every kerb (people behind it, no free place in eight tries) stays in its lane. A camera opened a
few seconds after the outcome shows the ending already played (8.6): the arrest's walk to the car is not seen then.
The director does not know a petrol station's pump islands or a bus shelter's panels: open buildings are not solid
for it, so somebody can stand in a pump island (at one station the spot is under the canopy 2 m from its middle).
Keeping people out would need the islands' places from the renderer, as it gets the parked cars.

### 8.6 Opening a camera in the middle

The first `update` builds the stage for the situation as it is and then runs the scene forward 90 s in steps of 0.2 s
with the same situation, without drawing: cars that were `here` are parked with their crews at their posts, people
who ran are gone, a closed incident's street is empty (after a tragedy too: the dead are taken away only while a
stage settles, never in a live picture), and no driver stands by a wreck. No special "instant" paths exist;
whatever plays live also settles a stage. So a camera opened after the outcome, however soon, finds the ending played
to its end: the crews in their cars or gone.
Two things are kept for the live picture. A unit or service that is `near` is settled as still
`coming`: the first live step lets it drive up in the time the game gives it, instead of standing parked with its
officers out. And the beats of the story a viewer should see (the fall in a brawl, a driver walking round their car)
do not run down while the stage settles: they play some seconds after the picture opens.

While `situation.paused` is true `update` moves nothing (a camera opened while paused shows the settled stage).

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
  bins. Shop fronts carry boards with made-up words chosen by seed. The building the incident's place owns
  (`Site.place`) is dressed by its kind instead (section 9.4): a board with the place's own name, a ground floor of
  its kind and what hangs on its front. It never gets a random board, and when the place has a board of its own, the
  other shop boards whose wall lies within 42 m of the spot carry no words (their glass and coloured band stay).
  Streets without a dressed place keep their random boards.
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
- **Props** (`render/props.ts`, `stage.ts PropFrame`). A dropped weapon, an ambulance's stretcher, the sheet over
  somebody who died, a fire hose: a handful of triangles each, coloured per vertex, one material for all (a weapon in
  a hand too). The sheet is cloth that follows the body: thirteen stations along it from the toes to the head, each
  with the cloth's height over the body and the body's width there, seven points across, and a skirt 0.16 m out all
  round whose rim lies 0.14 m below the prop's own level (the pavement's), so that no gap shows under it on the road
  either; its normals come from its neighbours, so it is shaded round, with a faint fold in each face. `covers` names
  whom it covers: that person is still in the frame but is not drawn (`view.ts stage()`), the cloth is all the camera
  sees. The hose's `line` lies on the ground as a ribbon 0.17 m wide from the lorry's pump to where it comes up a
  step behind its crew; from there it rises through the second one's hands (0.92 m) to the nozzle at the first one's
  waist (1.02 m), with a dark nozzle tip. With `aim` (what its water is played on: a point and its height) a pale jet
  arcs in seven sections from the tip to that point, widening as it goes. A hose is laid anew when its line or its
  aim changes.

Budget per frame at 640x360: under 300 000 triangles, under 120 draw calls with a full street, a dozen people and six
vehicles; no program compiled or linked while the picture is steady. A dressed place costs one more draw call and
no program of its own.

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
  are kept, except the place's sheet (9.4), which is painted again with the street. Its programs are then linked in the first frame after: one long frame, rarely.

### 9.3 What is kept, and what an opening costs

- **Per view, never per page.** A renderer hangs a listener on whatever it uploads, so a three.js object kept past
  its view would keep that view's renderer and graphics context alive. Each view therefore has its own `CarKit`
  (the vehicles' materials, the atlases of their paintings, the flare and beam textures, the sprites' quad) and its
  own textures of the street, all disposed with it. A closed camera holds no graphics context. What is kept per page
  is plain pixels and numbers: the house-front sheet (`facades.ts`, painted once per seed at 1536 and shrunk to
  1024 by an area average, its night twin at 512), the last two car paintings (`PAINTINGS_KEPT`), the drops' table,
  and the base body (`human.ts`, loaded once; `live.ts` disposes of its GPU side when a camera closes).
- **Texture memory** per opening, measured: about 32 MB by day and 18 MB at night (the house-front sheet with its
  mipmaps is 5.6 MB of it). A dressed place adds about 1.8 MB: its sheet and its night twin with mipmaps.
- **The long task that remains.** Each opening creates a new WebGL context (1 to 4 s on a software renderer, one
  task); only one context kept for the whole page would remove it, and that is not done. With it, 'live' comes 10
  to 15 s after the click on a loaded software renderer and the first frame then takes 5 to 9 ms.

### 9.4 The place's own building (`render/place.ts`)

**The split.** The street data holds everything that stands on the ground where people walk and cars drive (a
canopy on posts, its pumps, the forecourt, the bays, the shelters: section 4.3), because the director keeps people
and vehicles out of what is solid. The renderer adds only what is within 0.6 m of the front wall or at least 2.6 m up,
which the director need not know: the board, a band, an awning (its edge at 2.6 m), an entrance canopy (2.7 to 3.3 m
up, 2.2 m deep, hung from the wall), a projecting sign (from 2.75 m, at most 2 m out), a cash machine, poster cases,
a clock, flags, a scaffold (standards at 0.1 and 0.56 m out), a church's tower, door and windows.

**The board.** The place's own name without what the game adds in brackets (`Pank (Liivalaia)` is a board that says
PANK), in capitals, in two lines above 18 letters (above 9 on a bus shelter); the kind's word when there is no name.
Most of the game's names are of that form, so most boards say the kind's word; real names such as
`Ida-Tallinna Keskhaigla` are painted as they are.

**The front.** The own building's front can differ from what its footprint would give (section 4.1): a ground floor
of the kind (shop glass along its street walls, a public building's windows, closed walls, a hall's gates) with one
entrance in the front; a flat roof for kiosk, shop, mall, bus station, port, airport, stadium, industrial and parking
house (small buildings otherwise get pitched roofs, which made petrol kiosks look like houses); a plaster front in
place of boarded wood where shop glass is needed; no upper windows for church, stadium and parking house.

| Kind | Word | What it gets |
| --- | --- | --- |
| bar | BAAR | shop glass, awning, projecting sign |
| nightclub | ÖÖKLUBI | closed wall, lit strips round the door, projecting sign |
| mall | KAUBANDUSKESKUS | shop glass, band, entrance canopy, flat roof |
| shop | POOD | shop glass, band, flat roof |
| bank | PANK | shop glass, band, cash machine, projecting sign |
| school, kindergarten, university | KOOL, LASTEAED, ÜLIKOOL | a public building's front; a flag for school and university |
| hospital | HAIGLA, with a cross | public front, entrance canopy, lit |
| trainstation | RAUDTEEJAAM | public front, entrance canopy, clock |
| busstation | BUSSIJAAM | shop glass, entrance canopy, clock, flat roof; the name also on the roofs of the three shelters nearest the spot |
| port, airport | SADAM, LENNUJAAM | shop glass, entrance canopy, flat roof |
| stadium, industrial | STAADION, TEHAS | a hall front with gates, flat roof |
| concert | KONTSERDIMAJA | shop glass, entrance canopy, poster cases |
| museum | MUUSEUM | public front, poster cases, flag |
| office | BÜROOHOONE | glass front |
| construction | EHITUS | scaffold and netting |
| parking (a parking house) | PARKLA, with a P | closed walls, flat roof, no upper windows |
| hotel | HOTELL | public front, entrance canopy, three flags, projecting sign |
| church | KIRIK, a plate beside the door | tower with spire and cross, tall arched door, tall windows, no upper windows |
| cemetery | KALMISTU, a plate beside the door | |
| gasstation | TANKLA | a glass kiosk with band and flat roof; the name also on the canopy's fascia; one of four made-up brand colours by the site's seed, on the board, the band and the canopy's band (no real brand) |
| government | RIIGIASUTUS | public front, flag |
| embassy | SAATKOND, a plate beside the door | a plain white-over-red flag that claims no country |
| prison | VANGLA | closed walls |

Kinds with nothing of their own: residential, house, street, park, beach, forest, lake, highway, ruralroad, farm,
summerhouse, village, oldtown, border (they are what the street already is). The table in the code also dresses a
border crossing (PIIRIPUNKT, entrance canopy, flag), but `Site.place` is null for it, so the game never shows it;
only the harness's `pk=border` does.

**Where the board goes.** Over the ground floor at the entrance (on a building of one floor, on the edge of its
roof). Where the picture does not hold all of it there: lower on the wall, on the front edge of the entrance canopy,
at eye level beside the entrance, on a wall round the corner (within 18 m of the entrance), then all of that at 0.78
and at 0.6 of its size. A place counts only when all of the board projects inside the picture (`site.ts
projectPoint`), under the burned-in text of the top corners, at more than about 17 degrees to its wall, and not
behind another house, another wing of its own building, a roof on posts, or its own canopy or awning. The first such
place is taken, else the place seen most. On a long front whose entrance is more than 6 m from where it happens, the
board goes where it happens. Where the camera looks along the wall, a copy of the board stands out from it.

**The sheet.** One canvas of 1024 x 256: the board as large as its text fits, and the small parts in the board's
colours (the word sign, the cash machine, the awning's cloth, two flags, the clock, a church's door and window, plain
colours). Its night twin of 512 x 128 holds what is lit. It is made in `buildWorld`, uploaded in `prepare` with the
street's other textures and disposed with the street. It is opaque, so its paintings take the colour of their corners
(white: as painted; the wall's colour for a church's door and windows). The mesh `place` draws it with a material
built like the house fronts' (the same `onBeforeCompile`, cache key `cctv-wall`): one more draw call, no program of
its own, no shadow. Its emissive is 0.5 + 0.5 x night while the lamps are on (the house fronts' 0.2 + 0.5 x night).

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
  sheet and its night twin. `name=<text>` is the place's own name on the made-up street (its board);
  `pk=<PlaceKind>&pname=<text>` dresses the building nearest the spot as a place of that kind by hand, on any
  street. The log line says `place=<kind>/<name>/own=<id>`.
- `scene.html` plays a whole scenario through the director and the real renderer, for filming scenes from start to
  end. The street: `place=<PlaceKind>&seed=<n>`, a hand-made `plain=dead|narrow|far|square`, or a real street with
  `tiles=<lng>,<lat>` (and `archive=<file>`, default `sample.pmtiles`) from the `EPD_MAP_TILES` folder. With
  `tiles=`, `place=<PlaceKind>&name=<text>` reads the street for that place as the game does (section 4); without
  `place` the bare point is read as before. `name=` also names the place on a made-up street. The log line then adds
  `place= own= front=` (what the site made of the place). The cast:
  `kind=<SceneKind>&roles=svcw&cars=...` (roles as letters) with the flags `down`, `runs`, `mayFlee`, `armed`,
  `drunk`, `live=0`, `single`, `inRoad`, `chant`, `riot`, `carFire`, `prio=<1..4>`, or `tpl=<templateId>` for a real
  incident of a shift. The situation is scripted over the scene's clock: units
  `u=<id>[:<type>[:<model>]],<side>,c<s>,n<s>,h<s>,l<s>` (side `a`, `b` or a yaw; with `t=arrest|hospital|ride`),
  services `ag=<agency>,n<s>,h<s>`, `out=<result>@<s>[,a<n>][,i<n>]` (or `closed=<s>`), `pursuit=<on>,<over>`,
  `search=<from>-<to>`, `pause=<from>-<to>`, `open=<s>` (the camera opened late). The picture: `hour`, `month`,
  `weather`, `temp`, `wind`, the close view and `clean=1` as `harness.html`, and the window's own zoom
  (`zoom=<k>&panx&pany`). `quiet=1` turns passing traffic and passers-by off; `who=1` adds everybody and every vehicle
  on stage with their place and yaw to the log line; `manual=1` keeps the page from playing by itself, for a caller
  that drives it with `step` and `seek`. The top of `scene.ts` lists the parameters.
- `vehicles.html` shows the vehicles on plain asphalt: `car=<id>,...` or `set=police|ems|civil|all`,
  `view=front|rear|side|top|cctv`, `night=1`, `lamps=1`, `beacons=1`, `low=1` for the parked cars' level of detail.
- `model.html?src=<url>` draws a glTF model four times, turned a quarter each (`plain=1`: one grey material).
- `window.__cctv.step(dt, frames)` advances the scene's clock and draws (the screenshot scripts use it); the scene
  page also has `seek(t)`.

## 13. Tests

| File | What it guards |
| --- | --- |
| `tests/cctv-math.test.ts` | the local frame, angles, rings (area, inside, nearest wall and its normal), segments, the box round a house, lines (offset, slice, cut at a circle), the seeded randomness |
| `tests/cctv-tiles.test.ts` | the street read from zoom 15 tiles: synthetic tiles written through `tests/fixtures/mapdata.ts`, roads, buildings, areas, bounds, section 4.1's heights, `readStreet` and its failure paths, the map's own opened archive; points of interest (kept kinds with their names, each once; no list without the layer); `readStreet` for a place (a matching name first, else the nearest, nothing beyond 250 m, without a `pois` layer, a plain kind, no road within 70 m); a real archive too when `EPD_PMTILES_SAMPLE` names one |
| `tests/cctv-site.test.ts` | every site is sound (nothing inside a house or in water, a free line to the spot) for every kind of place over forty seeds, and for a dozen of them the story is in the picture (the spot, a standing adult's size, the first crew's stretch and car from each end, the door, street rather than a wall), measured with its own projection checked against `projectPoint`; hand-made streets with what real tiles bring (a lane between house fronts, an incident inside a block, a quay, a dead end, a passage); null where nothing holds; a real town's points when the Florence sample is there; the place the incident names (a petrol station without a building, with its kiosk, and with a canopy drawn as a house; a made-up station left as it is; a car park; a bus station; a bank in a row of houses; a school between a street and a back lane; plain kinds; the made-up streets' own building) and, with `EPD_PMTILES_SAMPLE`, the audit's places in a real town |
| `tests/cctv-coverage.test.ts` | the table of chances, a place has a camera or not for good, the four-digit number and the name, nothing left to see, the share of a real shift's incidents that can be watched |
| `tests/cctv-cast.test.ts` | every template of the catalogue gets a kind at each of its places and a cast from a real incident without throwing; well-known templates get the expected kind; the choices a scene reads from its template (drunk, single, in the road, armed, chanting); the picture tells the card's story: every template and scenario that can make a `stop` has its line in `STOP_STORY`, variant by variant; a vehicle the card says has gone is not at the kerb (drive-offs, speeders, drivers who did not stop); a template whose variants differ shows the vehicle only for the variant that says it is there; a crash is of one vehicle, with somebody trapped inside, when its own card says so |
| `tests/cctv-situation.test.ts` | a crew coming, near, here, then left over a real shift; other services; a pursuit; the outcome and the transports; `streetScale` at every speed; the etas of a step played in parts |
| `tests/cctv-director.test.ts` | the stage before anyone comes; a patrol arrives (from the side the game says, from the open end of a dead end); what each kind of scene does; how it ends, every result; any moment is safe (opening in the middle, a closed incident, pause, the same frames from the same inputs, rapid changes, recalls); awkward streets and many crews; incidents of a real shift, traffic and passers-by, the cost of a step; what the reviewers found (crews driving up when the camera opens, a slowed clock, call-backs, stops and pursuits, arrests into the right car, the threat's distances, frames independent of how time is cut); what the films showed (arrests out of a door, officers left inside, water, smoke, chases, nobody on another's place); the parked cars solid; crews stopping where the camera sees them and the first patrol in the picture (a real town's points with `EPD_PMTILES_SAMPLE`), nobody out of the car before the game says on scene; the scenes as two reviewers wanted them (a vehicle that has gone, somebody trapped in a wreck, nobody inside anybody, the brawl's fall for the camera, crews getting out one after the other, aim kept until the cuffs are on, cuffing and the search at the car, the stretcher, the sheet and the cordon, the hose and the wrecks to the kerb, the crowd in knots, the window and the cover posts of a stop); the last pass after the reviewers (an arrest as one walk for two, never more than 1.5 m apart, for four kinds on five streets, and with parked cars, people about and one crew or two from the two ends; a crash with somebody hurt: nobody walks off while a wreck stands in the road, a wreck that moves has somebody at the wheel, and both drivers are by their cars afterwards; nobody holds their hands at their head for long; an officer who knelt by the patient gets up and steps back when the paramedics have them; out of a car door bent low for the first quarter of a second; the hose from the lorry to a nozzle aimed at the smoke, its crew before the burning house); what the verifiers of the last pass proved (a wreck kept from its kerb stands where it got to; the police are held by a wreck for 55 s after the end at most; no driver is left by a wreck when the last police crew has gone or none ever came; a camera opened after a crash has ended finds no driver by a wreck); after a tragedy the dead and the sheet (which names whom it covers) stay where they lie once the crews have gone, and a camera opened when it is long over finds the street empty; on every frame nobody inside a house, nothing jumping, moving vehicles on the road and in nothing, nobody left behind |
| `tests/cctv-session.test.ts` | the session over a real shift with a fake view: frames with the incident's people and a patrol arriving, the clock and the light read at most every 2 s, dusk, pause, the measured pace, a crew getting out only once the game says on scene on a slow device, the street two, four and eight times as fast at 2x, 4x and 8x and as at 1x at the real-time and call speeds, a patrol standing when the game says on scene at 1x, 4x and 8x, through a change of speed and a pause in its approach, a slow frame at 8x played in full, `expect`, the settled first frame (`stage`), the feed ending ('ended') after the street empties or when the incident leaves the simulation, the made-up street fallback, the same place twice; the place on a made-up street, the session's street as the site's own; `mapPose` (map coordinates, bearings north 0 to west 270, no pose on a made-up street) |
| `tests/cctv-lazy.test.ts` | the import guard (section 14); after a build, three.js only in the camera chunk and nothing of the camera in `sw.js` (skipped without `dist/`, required with `CCTV_DIST=1`: the CI job runs this file once more after its build with that set) |
| `tests/sw.test.ts` | the camera chunk's name, neither it nor the body model precached, the licence file's entries |
| `tests/visual-ui.test.ts` | the window's place on a desktop, the phone upright and on its side, the title bar never cutting the code or the number, the folded bar, reduced motion |
| `tests/map-camera-cone.test.ts` | the cone's geometry (its width, bearing, bands, outline), the window's zoom and pan, a broken pose; bringing it into view (the free part beside the window, below it on a phone; no move when it shows; closer when too small, back when it does not fit; only the marker before the picture is live); the marker and its fallback; the layers in every base map |
| `tests/map-camera-window.test.ts` | (jsdom) the window opens the camera at the map's marker and shows the map its pose only while live, nothing once closed; the fallback to the incident's own coordinates; no cone without a picture |
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
| `ended` | the incident was closed and its story played out ('after') with AFTER_HOLD_S (15) real seconds of empty street (after a tragedy, of the dead under their sheet alone), a closed incident nobody went to fell off the camera list, or the incident left the simulation (a replay) | "Ülekanne lõppes" |

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

The session (`session.ts`) reads the situation and steps the director by the real seconds of the frame (at most
0.5 s, `MAX_DT`) times the street's scale (`CameraSession.scale`, `streetScale` of the nominal and the measured
speed): at 1x and below the street plays in real seconds, at 2x, 4x and 8x two, four and eight times as fast, like a
recording played faster. A new speed counts from the next frame, and nothing jumps: the director goes on from where
it stands, and from 1x up an eta is the same number of the street's seconds at every speed (15 game seconds each),
so a change of speed does not time a car anew. A pause keeps the scale it stood at. The step is played in parts of
at most 0.5 s of the street (`PART_S`), each with the situation read again with the etas shortened by what the step
has played (`played`), because the director plays at most 2 s at once and times a car anew when its eta is off by
more than a second: a slow frame at 8x (4 s of the street, 40 of the director's steps of 0.1 s) is played in full.
A frame at 8x and 12 frames a second costs about 0.13 ms (at 1x about 0.06 ms), a slow frame of 0.5 s at 8x about
0.5 ms.
What stays in real seconds whatever the speed: the frames a second, the picture's own life (the view is handed the
director's frame with `t` set to the picture's own clock, which starts where the director's stood and runs in real
seconds: the blue lights and hazards flash, the rain falls, the smoke rises, the grain and the torn lines run and the camera shakes at
their real pace), the light read again at most every 2 real seconds (`ENV_EVERY_S`: dusk falls in seconds at the
fastest speed), the 15 s of empty street before a finished feed ends, the pace windows and the opening. It draws with
the burned-in texts: the camera's name top left, the game's date and clock top right ("23.10.2026 19:42"),
`EPD v<version>` bottom right, and a recording dot that blinks once a real second (it stands while the game is
paused).

**The session's pace.** The game plays at most 250 ms of a slow frame, so on a slow device its clock runs behind
the nominal speed. The picture follows the game's real clock, not the nominal speed: over windows of 0.5 real
seconds (`PACE_WINDOW_S`) the session measures how far `sim.now` moved against the real time between camera frames,
keeps that pace between 0.05 and 1.5 of the nominal speed (`PACE_MIN`, `PACE_MAX`), smooths it, and passes the
nominal speed times the pace (`CameraSession.speed`), divided by the street's scale, to `situationOf`. Above 1x the
scale follows the measured clock too (8x on a device whose clock keeps half the pace plays the street at 4x). The
measuring starts again after a pause or a change of speed. Until the pace has been measured once, units and services
that are `near` are handed to the director as still `coming`, so a crew never gets out on camera while the unit list
still says it is on its way; half a real second later it drives in on the measured speed. At 8x that half second is
4 s of the street (60 game seconds): a camera opened in the last minute or two of game time of an approach sees the
car stand up to about 7 of the street's seconds (under a real second) after the game says it is on scene, and its
officers get out after that as usual. Opened earlier, the car stands when the game says on scene at every speed.

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
