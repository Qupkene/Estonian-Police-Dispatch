# Map tiles, routing, daylight, climate and calendar: research notes for EPD

Research notes for **EPD**, an unofficial, fan-made Estonian police dispatch simulator. The game is a static Vite + React + MapLibre GL 6.14 app on GitHub Pages at the custom domain **politsei.eu** (`public/CNAME`). These notes cover the external map, tile and routing services the game may call, plus the sun, climate and calendar data that the `sun.ts`, `weather.ts` and `calendar.ts` engine systems need.

Compiled 2026-10-17.

> **Read this first: how far these notes are verified.** The shared web-search budget for this workflow run (200 searches, shared by all agents) was used up before this agent's first search ran, and WebFetch and direct `curl` to tile hosts are blocked by the sandbox proxy (HTTP 403 on CONNECT). So **no fact here is tagged [VERIFIED] from the web.** Every claim about service URLs, terms and licences comes from prior knowledge and must be checked once by a human in a browser (checklist in §12). Some things *were* checked inside this environment and carry their own tags (see below): DST dates from the system tz database, MapLibre's URL-template support read from `node_modules/maplibre-gl@6.14.0`, and sun tables computed with the NOAA algorithm.

**Confidence tags**

- **[VERIFIED-local]**: checked in this sandbox (tzdata `zdump`, MapLibre 6.14.0 source code, a Node test run).
- **[COMPUTED]**: calculated here with the NOAA/Meeus algorithm (§7). Expect about ±1 min accuracy.
- **[LIKELY]**: strong prior knowledge (training data up to 2025-26) that nothing contradicted. Not checked live.
- **[UNSURE]**: plausible but unconfirmed. Must be tested or checked before shipping.
- **[ESTIMATE]**: my own game-balancing numbers derived from the above. Never present them as fact.

---

## 0. Quick reference: which map service for which job

| `MapStyleKey` (src/store/settings.ts) | Recommended source | Key / signup | Commercial? | CORS for WebGL | Main risk | Conf. |
|---|---|---|---|---|---|---|
| `tactical` | Offline vector built at build time (geoBoundaries + Natural Earth, per DESIGN.md). No network. | none | yes | n/a (same origin) | none | design choice |
| `dark` | **CARTO `dark_all`** raster (or `dark_nolabels` with EPD's own labels). Vector alternative: OpenFreeMap `dark` or CARTO Dark Matter GL. | none | **non-commercial only** on the free tier | yes | Free-tier cap (about 75k map views/month) and the non-commercial rule | LIKELY |
| `maaamet` | **Maa- ja Ruumiamet `hallkaart@GMC`** (grey) or `kaart@GMC` (colour), TMS y-axis | none | yes (open data licence) | **UNSURE: test first** | CORS header, possible domain change after the 2025 rename | LIKELY / UNSURE |
| `foto` | **Maa- ja Ruumiamet `foto@GMC` (JPG) + `hybriid@GMC` (PNG overlay)** | none | yes | **UNSURE** | Same as above; orthophotos are heavy | LIKELY / UNSURE |
| (fallback street map) | OpenFreeMap `liberty` / `positron` vector styles | none | yes | yes | No SLA (donation-run) | LIKELY |
| (do not use as primary) | `tile.openstreetmap.org` | none | discouraged | yes | OSMF can block at any time; prefetching banned | LIKELY |
| Routing (optional "real roads" mode) | Precompute offline from a Geofabrik Estonia extract (§5.4). Live demo servers only for rare, user-triggered requests. | none | - | yes | Demo servers allow 1 req/s and no heavy use | LIKELY |

**Bottom line for designers:** keep the engine's own straight-line movement (DESIGN.md §"no external routing in the engine") as the default. Treat every online layer as a *visual* enhancement that can fail without harm. Show attribution for whichever layer is active (§6).

---

## 1. Estonian Land Board tiles: Maa-amet, now Maa- ja Ruumiamet

### 1.1 Agency rename (2025)

| Item | Value | Conf. |
|---|---|---|
| Old name | Maa-amet (Estonian Land Board), under the Ministry of Climate (Kliimaministeerium) since 2023 | LIKELY |
| New name | **Maa- ja Ruumiamet** (English: Estonian Land and Spatial Development Board; short form "MaRu"). Took effect **1 January 2025**, when it took over spatial planning and building-related functions from ministries and other agencies. | LIKELY (name), UNSURE (exact date and scope) |
| New web domain | `maaruum.ee` is my best guess for the new agency site | **UNSURE** |
| Tile domain after rename | Probably still **`tiles.maaamet.ee`**. Government agencies usually keep legacy service hostnames alive because thousands of apps embed them. A future `tiles.maaruum.ee` alias is possible. | **UNSURE**: test both |

**Design rule:** put the tile base URL in one constant (e.g. `MAAAMET_TILE_BASE`) and make the `maaamet`/`foto` styles degrade to `dark` when tiles fail. MapLibre fires `map.on('error')` per failed tile, so count failures and switch styles after about 10 in a row.

### 1.2 URL templates (TMS, Web Mercator "GMC" matrix set)

Generic pattern [LIKELY]:

```
https://tiles.maaamet.ee/tm/tms/1.0.0/{layer}@{matrixSet}/{z}/{x}/{y}.{ext}
```

- `{matrixSet}`: **`GMC`** (Google Maps Compatible = EPSG:3857 Web Mercator, the grid MapLibre, Leaflet and OSM use) or **`LEST`** (EPSG:3301 L-EST97, Estonia's national grid). **Use `GMC`.** MapLibre cannot show EPSG:3301 tiles. [LIKELY]
- **Y-axis: TMS convention (origin bottom-left)**, as the `/tms/1.0.0/` path says. Maa-amet's own examples used `tms: true` in Leaflet and `{-y}` in OpenLayers. [LIKELY]
  - **MapLibre:** keep `{y}` in the URL and set **`scheme: "tms"`** on the raster source. MapLibre 6.14 then sends `y' = 2^z − 1 − y`. [VERIFIED-local: `node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs` contains `.replace(/{y}/g, String(n==='tms' ? 2**this.z-this.y-1 : this.y))`.]
  - MapLibre does **not** support `{-y}` or `{s}`; the placeholders it does support are `{z} {x} {y} {ratio} {quadkey} {bbox-epsg-3857}` (plus `{prefix}`). [VERIFIED-local]
- Sample tiles to test by hand (z/x/TMS-y): Tallinn z10 → `10/582/723`, z14 → `14/9318/11575`. Tartu z12 → `12/2352/2870`. (The XYZ y values are 300, 4808 and 1225.) [COMPUTED]

| Layer | Estonian name | Template (GMC) | Ext | Content | Conf. |
|---|---|---|---|---|---|
| `kaart` | Aluskaart / põhikaart (colour base map) | `https://tiles.maaamet.ee/tm/tms/1.0.0/kaart@GMC/{z}/{x}/{y}.png` | png | Full-colour topographic base map: roads, buildings, addresses at high zoom, Estonian place names | LIKELY |
| `hallkaart` | Hallkaart (grey map) | `https://tiles.maaamet.ee/tm/tms/1.0.0/hallkaart@GMC/{z}/{x}/{y}.png` | png | Greyscale version of `kaart`. **Best base for a CAD look**; can be inverted to dark (§1.6). | LIKELY |
| `foto` | Ortofoto | `https://tiles.maaamet.ee/tm/tms/1.0.0/foto@GMC/{z}/{x}/{y}.jpg` | **jpg** | Aerial orthophoto mosaic, updated in regional cycles | LIKELY (jpg: LIKELY) |
| `hybriid` | Hübriidkaart | `https://tiles.maaamet.ee/tm/tms/1.0.0/hybriid@GMC/{z}/{x}/{y}.png` | png | **Transparent overlay** of roads, street names and place names, drawn on top of `foto` | LIKELY |
| `reljeef` | Reljeef (shaded relief) | `.../reljeef@GMC/{z}/{x}/{y}.png` | png | Hillshade from the LiDAR elevation model | UNSURE |
| others | e.g. historical maps, cadastre | - | - | Exist as WMS layers; TMS names unknown | UNSURE |

**Zoom range:** GMC tiles cover roughly **z 6-18** for `kaart`/`hallkaart`. `foto` may go to z 19-20 in cities. Set `maxzoom: 18` on the source and let MapLibre overzoom past it. [UNSURE: test z19 for `foto`.]

**Coverage:** Estonia only. Outside Estonia's bounding box the server returns 404 or blank tiles. Set `bounds` on the source so MapLibre never requests them:

- Estonia's extent is about lon **21.76-28.21 E**, lat **57.51-59.82 N** (Vilsandi in the west, Narva in the east, Vaindloo in the north, the Latvian border near Ikla/Valga and Ruhnu at 57.78 N). [LIKELY]
- Recommended source `bounds`: `[21.5, 57.3, 28.5, 59.95]`.

**Usage-statistics query string (optional):** Maa-amet's old TMS example appended `&ASUTUS=MAAAMET&KESKKOND=LIVE&IS=TMSNAIDE` (asutus = organisation, keskkond = environment, IS = information system) so the agency could see who uses the service. [UNSURE whether still wanted. The odd `&` without `?` is how I remember it.] If EPD adds it, use honest values such as `?ASUTUS=EPD_FANNIMANG&IS=EPD`. **Never** put PPA or POLITSEI there: the game must not look like the real police in the agency's logs (see §11).

### 1.3 WMTS and WMS alternatives

- **WMTS GetCapabilities** is probably at `https://tiles.maaamet.ee/tm/wmts/1.0.0/WMTSCapabilities.xml` or `https://tiles.maaamet.ee/tm/wmts?SERVICE=WMTS&REQUEST=GetCapabilities`. [UNSURE] WMTS uses a top-left origin, so a RESTful WMTS URL (`.../{TileMatrixSet}/{z}/{y}/{x}`) would work in MapLibre **without** `scheme: "tms"`. Read the real template from the capabilities document.
- **WMS fallback:** MapLibre's `{bbox-epsg-3857}` placeholder [VERIFIED-local] lets a raster source call a WMS GetMap URL directly, e.g. `https://kaart.maaamet.ee/wms/alus?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=<layer>&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png`. [UNSURE: host, path and layer names.] WMS renders each tile on demand, so it is slower and heavier for the agency than cached TMS. Use it only as a fallback.

### 1.4 CORS (critical for MapLibre)

MapLibre draws raster tiles as **WebGL textures**. A cross-origin image can only be uploaded to WebGL if the server sends `Access-Control-Allow-Origin` (MapLibre requests with `crossOrigin='anonymous'` / fetch `mode: 'cors'`). Leaflet uses plain `<img>` tags and does not need CORS, so "it works in Leaflet" proves nothing here.

- Whether `tiles.maaamet.ee` sends `Access-Control-Allow-Origin: *`: **[UNSURE]**. I lean towards yes, because OpenLayers WebGL and MapLibre users in Estonia (e.g. municipal web maps) embed it, but this is not checked.
- **Test it once from the deployed origin** (browser devtools on https://politsei.eu):

```js
fetch('https://tiles.maaamet.ee/tm/tms/1.0.0/hallkaart@GMC/10/582/723.png', { mode: 'cors' })
  .then((r) => console.log(r.status, r.headers.get('access-control-allow-origin'), r.headers.get('content-type')))
  .catch((e) => console.error('CORS blocked or network error', e));
```

- **If CORS is missing:** GitHub Pages cannot proxy. Options, in order: (a) ship `maaamet`/`foto` as "unavailable in this build" and use CARTO/OpenFreeMap only; (b) a tiny Cloudflare Worker proxy that adds the CORS header and caches (check that the licence allows redistribution; it does in principle, see §1.5); (c) WMS through the same proxy.

### 1.5 Licence and attribution

| Item | Value | Conf. |
|---|---|---|
| Licence | **Maa-ameti avatud andmete litsents** (Land Board open data licence). Free of charge since 2018, **commercial use allowed**, attribution required. Designed to be compatible with **CC BY 4.0**. Presumably carried over unchanged to Maa- ja Ruumiamet. | LIKELY (open, free, attribution), UNSURE (exact name after the rename) |
| Attribution content | Data source (agency), optionally the dataset name and year | LIKELY |
| Old example string | `Eesti kaardid: <a href="http://www.maaamet.ee/">Maa-amet</a>` (from the Maa-amet TMS example) | LIKELY |
| **Recommended EPD string (et)** | `Aluskaart: © Maa- ja Ruumiamet 2026` (for `foto`: `Ortofoto: © Maa- ja Ruumiamet 2026`) | recommendation |
| Recommended EPD string (en) | `Base map: © Estonian Land and Spatial Development Board (Maa- ja Ruumiamet), 2026` | recommendation |
| Link target | `https://www.maaamet.ee/` (probably redirects to the new site) | UNSURE |
| Usage limits | No published per-user rate limit that I know of. The agency asks very high-volume users (e.g. bulk downloaders) to make an agreement or use the download service instead of the tile service. | UNSURE |

**Do not pre-cache Maa-amet tiles in bulk.** Orthophoto tiles are about 20-60 kB each. The service worker should cache only tiles the user actually viewed, with a size cap (as it already does for CARTO).

### 1.6 Dark-mode trick for `hallkaart`

To give the grey map a dark CAD look, MapLibre raster paint can invert brightness: `raster-brightness-min: 1` and `raster-brightness-max: 0` (min greater than max inverts the luminance), then `raster-contrast: 0.2` and `raster-saturation: -1`. [LIKELY that the inversion works; tune visually.] This gives an "official Estonian base map, dark theme" option without a third-party dark provider.

---

## 2. CARTO basemaps

| Item | Value | Conf. |
|---|---|---|
| Raster template | `https://{s}.basemaps.cartocdn.com/{style}/{z}/{x}/{y}{r}.png`, where `{s}` ∈ `a b c d` and `{r}` = `@2x` for retina or empty. The hostname without a subdomain (`https://basemaps.cartocdn.com/...`) also works. | LIKELY |
| Raster styles | `light_all`, `dark_all`, `light_nolabels`, `light_only_labels`, `dark_nolabels`, `dark_only_labels`, `rastertiles/voyager`, `rastertiles/voyager_nolabels`, `rastertiles/voyager_only_labels`, `rastertiles/voyager_labels_under` | LIKELY |
| Max zoom | 20 (data from OSM, so street-level detail in Estonia is good) | LIKELY |
| Vector (GL) styles, MapLibre-compatible | `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`, `.../positron-gl-style/style.json`, `.../voyager-gl-style/style.json`; no-label variants such as `dark-matter-nolabels-gl-style` | LIKELY |
| Free terms | Free **for non-commercial use** up to about **75,000 map views per month**. Commercial use needs a paid CARTO Enterprise licence. The free tier has no API key or SLA. | LIKELY (non-commercial + 75k), UNSURE (how a "map view" is counted) |
| Is EPD "non-commercial"? | Yes **as long as there are no ads, paid features or sponsorship**. If the game ever shows ads or takes payments, switch to OpenFreeMap or Maa-amet, which allow commercial use. | recommendation |
| CORS | `Access-Control-Allow-Origin: *` (widely used with MapLibre and deck.gl) | LIKELY |
| Attribution (required) | `© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>` | LIKELY |
| Attribution (et) | `© <a href="https://www.openstreetmap.org/copyright">OpenStreetMapi</a> kaastöölised © <a href="https://carto.com/attributions">CARTO</a>` | recommendation |

**MapLibre gotchas:** MapLibre has no `{s}` placeholder, so expand subdomains into the `tiles` array. Its retina placeholder is **`{ratio}`**, not `{r}`. With a 256 tile size it requests `@2x` tiles when `devicePixelRatio > 1`. [VERIFIED-local: `.replace(/{ratio}/g, t>1 ? '@2x' : '')`]

```ts
tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{ratio}.png`),
```

**Service worker note:** `public/sw.js` already caches CARTO tiles opportunistically (cache-first, capped at about 400 entries, never pre-warmed). That is browser-cache-like behaviour and fine in spirit. **Do not** add a "download Estonia for offline" feature for CARTO tiles; bulk storage is outside the free terms. [LIKELY]

---

## 3. OpenFreeMap

| Item | Value | Conf. |
|---|---|---|
| What | Free OSM vector tiles (OpenMapTiles schema) with ready MapLibre styles. Run by Zsolt Ero, funded by donations and sponsors. | LIKELY |
| Style URLs | `https://tiles.openfreemap.org/styles/liberty`, `.../styles/bright`, `.../styles/positron`; newer `.../styles/dark` and `.../styles/fiord` (dark blue-grey) | LIKELY (first three), LIKELY/UNSURE (dark, fiord) |
| TileJSON | `https://tiles.openfreemap.org/planet` (weekly planet builds) | LIKELY |
| Glyphs / sprites | Served from `tiles.openfreemap.org` (`/fonts/{fontstack}/{range}.pbf`, `/sprites/...`). Styles use "Noto Sans Regular / Bold / Italic". | LIKELY (host), UNSURE (exact paths) |
| Terms | **No API key, no registration, no view limits, commercial use allowed.** Attribution required. No SLA or uptime guarantee. Very heavy users are encouraged to self-host (the whole stack is open source). Bulk scraping of tiles is not welcome. | LIKELY |
| CORS | Yes | LIKELY |
| Attribution (from their styles) | `<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>` | LIKELY |

**Fit with EPD's local glyphs (DESIGN.md):** EPD serves only Noto Sans **Regular / Medium / Italic**, ranges 0-255, 256-511 and 8192-8447. If EPD loads an OpenFreeMap style but points `glyphs` at `/glyphs/{fontstack}/{range}.pbf` (for offline use), it must rewrite every `text-font` that says "Noto Sans Bold" to "Noto Sans Medium". The ranges are enough for Estonian: õ ä ö ü are U+00F5/E4/F6/FC (0-255), š ž are U+0161/017E (256-511), and the quotes „ “ plus the en and em dashes (U+2013/2014) are in 8192-8447. **Cyrillic (1024-1279) is missing.** OSM `name` tags in Ida-Viru are mostly Estonian, but some shop and POI names are in Russian and would render blank. Add range 1024-1279 if POI labels are shown. [VERIFIED-local for the code points; LIKELY for the Ida-Viru data]

---

## 4. OpenStreetMap standard tiles (tile.openstreetmap.org)

Policy page: `https://operations.osmfoundation.org/policies/tiles/`. Key points [LIKELY]:

- URL: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. The old `a./b./c.` subdomains are deprecated.
- **Must:** show visible attribution `© OpenStreetMap contributors` linked to `https://www.openstreetmap.org/copyright`; send a valid Referer from web apps (do not set `Referrer-Policy: no-referrer`); follow HTTP caching headers.
- **Must not:** bulk download or prefetch (no "offline area" downloads, no warming caches by crawling zoom levels); send heavy traffic; fake User-Agent or Referer headers.
- The service is a **donation-funded, best-effort** service for OSM mappers. OSMF can block any site at any time without notice, and the policy says commercial or high-traffic apps should use another provider.
- **Can a game use it?** A low-traffic, non-commercial hobby game that attributes correctly and does not prefetch is technically within the policy. **Recommendation: do not make it the default.** Use CARTO or OpenFreeMap, which render the same OSM data and are made for embedding. If kept as a fallback, exclude it from any service-worker pre-warming. Opportunistic caching that follows the response headers is acceptable.

---

## 5. Routing services

### 5.1 OSRM public demo server (Project OSRM)

| Item | Value | Conf. |
|---|---|---|
| Endpoint | `https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson&steps=false`. Also `/table/v1`, `/nearest/v1`, `/match/v1`, `/trip/v1`. Coordinates are **lon,lat**. | LIKELY |
| Profiles | Car only in practice. The profile segment of the URL (`driving`, `car`, …) is ignored. | LIKELY |
| Usage policy (OSRM wiki "Demo server" / API usage policy) | **At most 1 request per second**, valid User-Agent, **no heavy use, no scraping**, clearly display data attribution. Provided as-is for testing and demos and **may be changed or shut down without notice**. Not meant as a production backend. | LIKELY |
| CORS | Enabled (the separate `map.project-osrm.org` frontend calls it) | LIKELY |
| Attribution | `Routing: OSRM (project-osrm.org) · data © OpenStreetMap contributors` | recommendation |

### 5.2 FOSSGIS servers (routing.openstreetmap.de, used by openstreetmap.org "Directions")

| Item | Value | Conf. |
|---|---|---|
| OSRM car | `https://routing.openstreetmap.de/routed-car/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson` | LIKELY |
| OSRM bike / foot | `.../routed-bike/route/v1/driving/...`, `.../routed-foot/route/v1/driving/...` (the profile in the path selects the dataset) | LIKELY |
| Valhalla | `https://valhalla1.openstreetmap.de/route?json={...}` with `"costing":"auto"`. **Isochrones** at `/isochrone`, which could draw "reachable within 10 min" response-time zones. | LIKELY (route), UNSURE (whether isochrone is open publicly) |
| Usage policy (`https://routing.openstreetmap.de/about.html`) | Free, **at most 1 request per second per user**, no bulk or systematic queries, valid Referer or User-Agent, attribution required, may be blocked. Meant for OSM-related and light use. | LIKELY (spirit), UNSURE (exact wording) |
| CORS | Enabled (openstreetmap.org calls it cross-origin) | LIKELY |
| Attribution | `Routing: © FOSSGIS e.V. (OSRM / Valhalla) · data © OpenStreetMap contributors` | recommendation |

### 5.3 Other online routers (need API keys)

- **openrouteservice** (HeiGIT): free key, daily quotas (about 2,000 directions/day). [UNSURE: numbers]
- **GraphHopper**: free key with a small daily credit allowance. [UNSURE]

A key embedded in a public GitHub Pages bundle is visible to anyone and can be abused or exhausted. Avoid this for EPD.

### 5.4 Recommended approach for EPD

1. **Default:** keep the engine's road-free movement (DESIGN.md: straight segments with a mild bend, `× weather road factor`). Fully offline and deterministic.
2. **"Real roads" upgrade, no runtime dependency:** at build time, download `https://download.geofabrik.de/europe/estonia-latest.osm.pbf` (roughly 100-150 MB [UNSURE]). Extract the main road network (`motorway … tertiary`, plus `residential` inside the playable towns) into a compact graph JSON, and run A* in a Web Worker. Alternatively, run OSRM locally in Docker (`osrm-extract` / `osrm-contract`) to precompute station-to-district route polylines.
3. **Licence consequence:** a road graph extracted from OSM is a **derivative database under the ODbL 1.0**. If shipped in the public bundle, it must be offered under ODbL with the attribution "© OpenStreetMap contributors". Rendered map images and route lines only need attribution (they count as "produced works"). [LIKELY]
4. **Live demo routers only for rare, player-triggered actions** (e.g. "show the route" on a selected unit). Throttle to 1 request per second globally, cache by origin/destination, and never call them for every simulated unit at sim speed.

---

## 6. Attribution strings: copy-paste table

MapLibre's `AttributionControl` gathers the `attribution` field of every *visible* source. Set it on each source and use `compact: true` on narrow screens. Attribution must stay visible; do not hide it in director mode. Put a small "Kaardiandmed / Map data" button there if needed.

| Source | Attribution HTML (en) | Estonian variant | Conf. |
|---|---|---|---|
| Maa- ja Ruumiamet base map | `Base map © <a href="https://www.maaamet.ee/">Maa- ja Ruumiamet</a> 2026` | `Aluskaart © <a href="https://www.maaamet.ee/">Maa- ja Ruumiamet</a> 2026` | wording UNSURE, requirement LIKELY |
| Maa- ja Ruumiamet orthophoto | `Orthophoto © Maa- ja Ruumiamet 2026` | `Ortofoto © Maa- ja Ruumiamet 2026` | same |
| CARTO | `© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>` | `© OpenStreetMapi kaastöölised © CARTO` | LIKELY |
| OpenFreeMap | `<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>` | `OpenFreeMap © OpenMapTiles, andmed: OpenStreetMap` | LIKELY |
| OSM standard tiles | `© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors` | `© OpenStreetMapi kaastöölised` | LIKELY |
| OSRM demo | `Routing: <a href="https://project-osrm.org/">OSRM</a>, data © OpenStreetMap contributors` | `Teekonnad: OSRM, andmed © OpenStreetMapi kaastöölised` | recommendation |
| FOSSGIS routing | `Routing: © <a href="https://routing.openstreetmap.de/about.html">FOSSGIS e.V.</a>, data © OpenStreetMap contributors` | `Teekonnad: © FOSSGIS e.V., andmed © OpenStreetMap` | recommendation |
| geoBoundaries (offline tactical map) | `Boundaries: <a href="https://www.geoboundaries.org/">geoBoundaries</a> (CC BY 4.0)` | `Piirid: geoBoundaries (CC BY 4.0)` | LIKELY CC BY 4.0. UNSURE for the EST layers, some of which are ODbL; check the dataset metadata. |
| Natural Earth | Public domain, no attribution required (credit appreciated): `Natural Earth` | - | LIKELY |
| Open-Meteo (if live weather is ever added) | `Weather data by <a href="https://open-meteo.com/">Open-Meteo.com</a>` (CC BY 4.0) | `Ilmaandmed: Open-Meteo.com` | LIKELY |
| Bundled OSM road graph (if built) | `Road network © OpenStreetMap contributors, ODbL 1.0` | `Teedevõrk © OpenStreetMapi kaastöölised, ODbL` | LIKELY |

### 6.1 Ready MapLibre source definitions

```ts
// src/map/sources.ts (proposal). URLs are LIKELY and must be checked in a browser (§12).
import type { SourceSpecification } from 'maplibre-gl';

export const ESTONIA_BOUNDS: [number, number, number, number] = [21.5, 57.3, 28.5, 59.95];
const YEAR = new Date().getFullYear();
const MAAAMET_TILE_BASE = 'https://tiles.maaamet.ee/tm/tms/1.0.0'; // UNSURE after the 2025 rename
const MAARU_ATTR = `© <a href="https://www.maaamet.ee/" target="_blank" rel="noopener">Maa- ja Ruumiamet</a> ${YEAR}`;
const OSM_LINK = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const maaamet = (layer: string, ext: 'png' | 'jpg', maxzoom = 18): SourceSpecification => ({
  type: 'raster',
  tiles: [`${MAAAMET_TILE_BASE}/${layer}@GMC/{z}/{x}/{y}.${ext}`],
  scheme: 'tms', // the Maa-amet TMS y-axis starts at the bottom
  tileSize: 256,
  minzoom: 6,
  maxzoom,
  bounds: ESTONIA_BOUNDS,
  attribution: MAARU_ATTR,
});

export const SOURCES: Record<string, SourceSpecification> = {
  maaametHall: maaamet('hallkaart', 'png'),
  maaametKaart: maaamet('kaart', 'png'),
  maaametFoto: maaamet('foto', 'jpg'),
  maaametHybriid: maaamet('hybriid', 'png'), // transparent overlay above foto
  cartoDark: {
    type: 'raster',
    tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{ratio}.png`),
    tileSize: 256,
    maxzoom: 20,
    attribution: `© ${OSM_LINK} contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>`,
  },
  cartoDarkNoLabels: {
    type: 'raster',
    tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{ratio}.png`),
    tileSize: 256,
    maxzoom: 20,
    attribution: `© ${OSM_LINK} contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>`,
  },
};
// Vector alternatives (pass to new maplibregl.Map({ style })):
//   'https://tiles.openfreemap.org/styles/dark' | '.../positron' | '.../liberty'
//   'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
```

---

## 7. Sun: sunrise, sunset and daylight in Estonia

### 7.1 Algorithm reference

- **NOAA Global Monitoring Laboratory Solar Calculator**: `https://gml.noaa.gov/grad/solcalc/`. Equations are in "General Solar Position Calculations" (`https://gml.noaa.gov/grad/solcalc/solareqns.PDF`) and the spreadsheets `NOAA_Solar_Calculations_day.xls` / `_year.xls`. Based on **Jean Meeus, *Astronomical Algorithms* (2nd ed., 1998)**. NOAA states rise/set accuracy of about **±1 minute** for latitudes within ±72°, which covers Estonia (57.5-59.8° N). [LIKELY]
- Standard altitudes: **−0.833°** for sunrise/sunset (34′ refraction + 16′ solar semidiameter), **−6°** civil twilight, **−12°** nautical, **−18°** astronomical. [LIKELY; standard astronomy]
- A JS alternative is `suncalc` (mourner/suncalc, BSD-2). DESIGN.md forbids extra runtime dependencies, so use the about 70-line implementation below.

### 7.2 Drop-in TypeScript (tested here)

Tested with `node --experimental-strip-types`. For Tallinn it gives 21 Jun 2026 sunrise 04:03 / sunset 22:42 / civil dusk 00:16, and 21 Dec 2026 09:17 / 15:20 (6 h 03 min). These match well-known almanac values. [VERIFIED-local run, COMPUTED values]

```ts
// src/sim/sun.ts: NOAA/Meeus low-precision solar position. No dependencies. Times are UTC ms.
const RAD = Math.PI / 180;
const julianDay = (ms: number) => ms / 86400000 + 2440587.5;

function solarParams(jd: number): { decl: number; eqTime: number } {
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const L0r = L0 * RAD;
  const eqTime =
    (4 / RAD) *
    (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  return { decl, eqTime }; // degrees, minutes
}

/** Geometric sun altitude in degrees (no refraction). lon is east-positive. */
export function sunAltitude(ms: number, lat: number, lon: number): number {
  const { decl, eqTime } = solarParams(julianDay(ms));
  const d = new Date(ms);
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const tst = (((utcMin + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  const ha = tst / 4 - 180;
  const cosZ = Math.sin(lat * RAD) * Math.sin(decl * RAD) +
    Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(ha * RAD);
  return 90 - Math.acos(Math.min(1, Math.max(-1, cosZ))) / RAD;
}

/** Rise/set for the UTC day containing dayMs (pass local noon). h0: −0.833 | −6 | −12 | −18. */
export function sunTimes(dayMs: number, lat: number, lon: number, h0 = -0.833) {
  const day0 = Math.floor(dayMs / 86400000) * 86400000;
  const at = (min: number) => solarParams(julianDay(day0 + min * 60000));
  const cosHA = (decl: number) =>
    (Math.sin(h0 * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD)) / (Math.cos(lat * RAD) * Math.cos(decl * RAD));
  let p = at(720 - 4 * lon);
  const noonMin = 720 - 4 * lon - p.eqTime;
  const c0 = cosHA(p.decl);
  if (c0 < -1 || c0 > 1) return { noon: day0 + noonMin * 60000, rise: null, set: null, polar: c0 < -1 ? 'up' : 'down' } as const;
  const refine = (sign: -1 | 1) => {
    let t = noonMin + (sign * 4 * Math.acos(c0)) / RAD;
    for (let i = 0; i < 2; i++) {
      p = at(t);
      t = 720 - 4 * lon - p.eqTime + (sign * 4 * Math.acos(Math.min(1, Math.max(-1, cosHA(p.decl))))) / RAD;
    }
    return day0 + t * 60000;
  };
  return { noon: day0 + noonMin * 60000, rise: refine(-1), set: refine(1), polar: null } as const;
}
```

Notes for `sun.ts` / DESIGN `sun(s): { isDay, sunrise, sunset, altitude }`:

- Pass the **UTC instant of local noon** for the day. Estonian local midnight to 02:00/03:00 falls in the previous UTC day.
- In summer, `polar: 'up'` is **normal** for h0 = −12° and −18° (no nautical or astronomical night). Handle the nulls.
- Suggested lighting phases [ESTIMATE]: `day` when altitude > 6°, `golden` 0.833…6°, `dusk/dawn` −6…−0.833° (streetlights on), `night` < −6°. Make "night" crime multipliers follow altitude < −6°, not the clock, so June nights are short and December nights long.

### 7.3 Monthly tables, 2026 (local Europe/Tallinn time, DST applied) [COMPUTED]

**Tallinn (59.437 N, 24.745 E)**

| Date | Sunrise | Sunset | Day length | Civil dawn | Civil dusk | Solar noon | Noon altitude |
|---|---|---|---|---|---|---|---|
| 15 Jan | 09:04 | 15:56 | 6 h 52 | 08:13 | 16:48 | 12:30 | 9.5° |
| 15 Feb | 07:57 | 17:13 | 9 h 17 | 07:14 | 17:57 | 12:35 | 18.0° |
| 15 Mar | 06:37 | 18:23 | 11 h 45 | 05:57 | 19:03 | 12:29 | 28.5° |
| 20 Mar (equinox) | 06:23 | 18:35 | 12 h 12 | 05:42 | 19:16 | 12:28 | 30.5° |
| 15 Apr | 06:06 | 20:37 | 14 h 31 | 05:21 | 21:22 | 13:21 | 40.4° |
| 15 May | 04:47 | 21:48 | 17 h 01 | 03:46 | 22:50 | 13:17 | 49.5° |
| 15 Jun | 04:03 | 22:40 | 18 h 37 | 02:31 | 00:12 | 13:21 | 53.9° |
| **21 Jun (solstice)** | **04:03** | **22:42** | **18 h 40** | 02:29 | 00:16 | 13:22 | 54.0° |
| 15 Jul | 04:29 | 22:23 | 17 h 54 | 03:15 | 23:36 | 13:27 | 52.0° |
| 15 Aug | 05:37 | 21:11 | 15 h 34 | 04:47 | 22:01 | 13:25 | 44.5° |
| 15 Sep | 06:49 | 19:42 | 12 h 53 | 06:07 | 20:23 | 13:16 | 33.5° |
| 23 Sep (equinox) | 07:07 | 19:18 | 12 h 11 | 06:26 | 19:58 | 13:13 | 30.4° |
| 15 Oct | 07:58 | 18:13 | 10 h 15 | 07:17 | 18:55 | 13:06 | 22.0° |
| 15 Nov | 08:15 | 15:55 | 7 h 40 | 07:27 | 16:43 | 12:05 | 12.0° |
| 15 Dec | 09:12 | 15:19 | 6 h 06 | 08:17 | 16:14 | 12:16 | 7.3° |
| **21 Dec (solstice)** | **09:17** | **15:20** | **6 h 03** | 08:21 | 16:16 | 12:19 | 7.1° |

Tallinn, 1st of each month (sunrise / sunset / length): Jan 09:18/15:31/6h13 · Feb 08:32/16:37/8h06 · Mar 07:18/17:49/10h30 · Apr 06:47/20:03/13h16 · May 05:22/21:15/15h54 · Jun 04:15/22:23/18h07 · Jul 04:09/22:40/18h31 · Aug 05:05/21:47/16h43 · Sep 06:17/20:23/14h06 · Oct 07:25/18:54/11h29 · Nov 07:40/16:27/8h47 · Dec 08:51/15:28/6h37. [COMPUTED]

**Regional comparison (solstices)** [COMPUTED]

| City | 21 Jun rise / set / length | 21 Dec rise / set / length | Note |
|---|---|---|---|
| Tallinn 59.44 N 24.75 E | 04:03 / 22:42 / 18 h 40 | 09:17 / 15:20 / 6 h 03 | |
| Narva 59.38 N 28.19 E | 03:49 / 22:28 / 18 h 38 | 09:03 / 15:07 / 6 h 04 | About 14 min earlier than Tallinn (further east) |
| Tartu 58.38 N 26.73 E | 04:05 / 22:23 / 18 h 18 | 09:00 / 15:21 / 6 h 21 | |
| Kuressaare 58.25 N 22.49 E | 04:23 / 22:39 / 18 h 16 | 09:16 / 15:39 / 6 h 23 | West: latest sunsets |
| Pärnu 58.39 N 24.50 E | 04:14 / 22:32 / 18 h 18 | 09:09 / 15:30 / 6 h 21 | |

Tartu monthly (15th, rise/set/length): Jan 08:49/15:56/7h07 · Feb 07:45/17:09/9h24 · Mar 06:29/18:15/11h46 · Apr 06:01/20:26/14h24 · May 04:46/21:33/16h47 · Jun 04:06/22:21/18h15 · Jul 04:30/22:06/17h36 · Aug 05:34/20:59/15h25 · Sep 06:42/19:33/12h51 · Oct 07:48/18:08/10h19 · Nov 08:01/15:53/7h52 · Dec 08:55/15:20/6h25. [COMPUTED]

### 7.4 White nights (valged ööd) [COMPUTED]

- The sun never goes below **−18°** (no astronomical night) from about **23 Apr to 20 Aug** in Tallinn (27 Apr, 17 Aug in Tartu).
- It never goes below **−12°** (no nautical night) from about **14 May to 30 Jul** in Tallinn (19 May, 25 Jul in Tartu, 21 May, 23 Jul in Võru).
- **Civil twilight does still end** everywhere in Estonia. Even at midsummer the sun dips to about −7.1° below the horizon at Tallinn's solar midnight (about 01:20 EEST). So "dark" in June means a deep blue twilight from roughly 00:15 to 02:30, never pitch black.
- In December, civil dusk in Tallinn is about **16:15**, so the evening rush hour is fully dark. Pedestrians must wear a **helkur** (reflector) in the dark, and police run reflector campaigns in October-March. [LIKELY]

---

## 8. Climate by month (for `weather.ts`)

Normals are from memory of Riigi Ilmateenistus (Estonian Weather Service) 1991-2020 data for Tallinn-Harku and Tartu-Tõravere. **[LIKELY, ±1 °C and ±15 % on precipitation]**. They are fine for game simulation, not for citation.

| Month | Tallinn mean °C | Tallinn max / min | Tartu mean °C | Tartu max / min | Tallinn precip mm | Tartu precip mm | Sunshine h (Tallinn) |
|---|---|---|---|---|---|---|---|
| Jan | −2.5 | 0 / −5 | −4.0 | −1.5 / −7 | 55 | 45 | 30 |
| Feb | −3.0 | −1 / −6 | −4.5 | −1.5 / −8 | 40 | 35 | 60 |
| Mar | −0.5 | 3 / −4 | −1.0 | 3 / −5 | 35 | 35 | 130 |
| Apr | 4.5 | 9 / 1 | 5.5 | 11 / 0 | 35 | 35 | 200 |
| May | 10.0 | 15 / 5 | 11.5 | 17 / 5 | 40 | 50 | 280 |
| Jun | 14.5 | 19 / 10 | 15.5 | 21 / 10 | 70 | 75 | 290 |
| Jul | 17.5 | 22 / 13 | 18.0 | 23.5 / 12.5 | 80 | 75 | 290 |
| Aug | 16.5 | 21 / 12 | 16.5 | 22 / 11 | 85 | 80 | 240 |
| Sep | 12.0 | 16 / 8 | 11.5 | 16 / 7 | 70 | 60 | 150 |
| Oct | 6.5 | 10 / 4 | 6.0 | 9.5 / 3 | 85 | 65 | 80 |
| Nov | 2.5 | 5 / 0 | 1.5 | 3.5 / −1 | 70 | 50 | 30 |
| Dec | −0.5 | 1 / −3 | −2.0 | 0 / −4.5 | 60 | 45 | 20 |
| Year | ≈ 6.5 | | ≈ 6.2 | | ≈ 725 | ≈ 650 | ≈ 1,800 |

Regional pattern [LIKELY]:

- **West coast and islands** (Saaremaa, Hiiumaa, Pärnu, Haapsalu): milder winters (January about −1.5 °C), cooler springs, warmer autumns, windiest. Snow cover is shortest here.
- **Inland south-east** (Tartu, Võru, Haanja upland) and **north-east** (Jõhvi, Alutaguse): coldest winters (January −4 to −6 °C), warmest summer days, longest snow cover.
- **Records:** about **+35.6 °C** (Võru, 11 Aug 1992) and about **−43.5 °C** (Jõgeva, 17 Jan 1940). [LIKELY]

### 8.1 Snow, ice and hazards [LIKELY unless tagged]

| Phenomenon | Season | Notes for the game |
|---|---|---|
| First snow | Usually late Oct, late Nov, melts quickly | **"First snow day" = traffic chaos**: many cars still on summer tyres, crashes ×2 (consistent with `112-and-priorities.md`) |
| Permanent snow cover | Inland about mid-Dec → late Mar. Tallinn and the coast in shorter, broken spells. Islands least. | Days with snow cover per winter: islands about 50-75, Tallinn about 75-100, Tartu about 100-110, Haanja up to about 130. Mild winters can have only a few weeks. [UNSURE on recent averages, which are falling] |
| Max snow depth | Feb, early Mar, typically 15-40 cm inland | Snowdrifts (*tuisk*) close rural roads |
| Black ice (*kiilasjää*) and glaze (*jäide*) | Nov, Mar, worst on thaw-freeze days around 0 °C | Biggest crash multiplier. Pedestrian falls too (ambulance calls, not police) |
| Ice roads (*jäätee*) | Cold winters only, Jan, Mar (Rohuküla-Heltermaa, Virtsu-Kuivastu, Haapsalu-Noarootsi, Tärkma-Triigi, Lake Peipus) | Opened by Transpordiamet when the ice is thick enough. Rules: drive alone, no seatbelt, keep distance. Rare "car through the ice" incidents. |
| Lake Peipus ice floes | Feb, Mar | **Ice fishermen stranded on drifting floes** (*jääpangal triivivad kalamehed*) are a classic rescue job with the PPA helicopter (*lennusalk*) and Päästeamet. |
| Autumn and winter storms | Oct, Feb, W/SW gales, coastal gusts 25-30+ m/s | Fallen trees on roads, power cuts, **Pärnu storm surge** (Jan 2005: about +2.75 m) |
| Fog | Spring (Apr, May) on coasts, autumn (Oct, Nov) inland | Road speed ×0.8 |
| Thunderstorms | Jun, Aug, peak July | Lightning fires, sudden downpours |
| Heat | Jul, Aug, a few 30 °C+ days inland most summers | **Drownings** (alcohol + swimming) and hot-car calls |

**Tyre law (traffic flavour)** [LIKELY]: winter tyres are **mandatory 1 Dec, 1 Mar**. Studded tyres (*naastrehvid*) are allowed **15 Oct, 31 Mar**, and the dates can be shifted when the weather requires it. Dipped headlights or DRLs are required at all times.

### 8.2 Game weather table [ESTIMATE]

Daily weather draw weights in % (rows sum to 100), for an inland/coastal mix. Shift snow +10 points inland in Jan-Feb and −15 points on the islands.

| Month | Clear | Cloudy | Rain | Heavy rain / thunder | Snow | Sleet / glaze (*jäide*) | Fog | Storm |
|---|---|---|---|---|---|---|---|---|
| Jan | 10 | 35 | 5 | 0 | 33 | 10 | 4 | 3 |
| Feb | 15 | 33 | 4 | 0 | 33 | 8 | 4 | 3 |
| Mar | 22 | 33 | 10 | 0 | 18 | 8 | 7 | 2 |
| Apr | 30 | 32 | 20 | 1 | 5 | 3 | 8 | 1 |
| May | 40 | 30 | 20 | 4 | 0 | 0 | 6 | 0 |
| Jun | 40 | 28 | 20 | 9 | 0 | 0 | 3 | 0 |
| Jul | 42 | 25 | 18 | 12 | 0 | 0 | 3 | 0 |
| Aug | 35 | 28 | 24 | 9 | 0 | 0 | 4 | 0 |
| Sep | 28 | 33 | 28 | 3 | 0 | 0 | 6 | 2 |
| Oct | 15 | 40 | 30 | 1 | 2 | 2 | 6 | 4 |
| Nov | 7 | 45 | 25 | 0 | 10 | 5 | 4 | 4 |
| Dec | 6 | 40 | 12 | 0 | 27 | 8 | 3 | 4 |

Suggested `weatherFactor` for road speed [ESTIMATE]: dry 1.00 · wet/rain 0.92 · heavy rain 0.85 · fog 0.80 · snow 0.72 · sleet/glaze 0.60 · snowstorm/drifting 0.55 · storm (fallen trees) 0.85. Crash-incident multipliers: rain ×1.3, first snow ×2.0, glaze ×2.5, fog ×1.4.

**Live weather (optional, later):** Riigi Ilmateenistus publishes XML observation and forecast feeds (`https://www.ilmateenistus.ee/ilma_andmed/xml/observations.php`, `.../forecast.php`). [UNSURE: paths and whether CORS is enabled, probably not.] Open-Meteo (`https://api.open-meteo.com/v1/forecast?latitude=59.44&longitude=24.75&current=temperature_2m,weather_code,wind_speed_10m,snow_depth`) has no key, CORS enabled, a free non-commercial tier of about 10k calls/day, and CC BY 4.0 data. [LIKELY]

---

## 9. Calendar: public holidays, police-heavy dates, events, DST

### 9.1 Riigipühad (public holidays): Pühade ja tähtpäevade seadus [LIKELY]

| Date | Estonian name | English | 2026 | 2027 | Police load |
|---|---|---|---|---|---|
| 1 Jan | uusaasta | New Year's Day | Thu | Fri | **Very high 00:00-06:00** (fireworks injuries, fights, DV, drunk driving the next morning) |
| 24 Feb | iseseisvuspäev, **Eesti Vabariigi aastapäev** | Independence Day | Tue | Wed | High: Defence Forces **paraad** (traffic closures; city varies by year [UNSURE]), the President's evening reception (*presidendi vastuvõtt*, broadcast live; VIP security), private parties |
| movable | **suur reede** | Good Friday | **3 Apr** | **26 Mar** | Long weekend: traffic |
| movable | ülestõusmispühade 1. püha (lihavõtted) | Easter Sunday | **5 Apr** | **28 Mar** | Low-medium |
| 1 May | kevadpüha | Spring Day | Fri | Sat | **Volbriöö (30 Apr → 1 May)**: student celebrations, especially Tartu Raekoja plats; drinking, noise |
| movable | nelipühade 1. püha | Pentecost Sunday | **24 May** | **16 May** | Low |
| 23 Jun | **võidupüha** | Victory Day (Battle of Võnnu/Cēsis, 1919) | Tue | Wed | Kaitseliit **võidupüha paraad** (host town rotates) plus the start of Midsummer |
| 23 Jun eve | **jaanilaupäev** (not itself a separate holiday; coincides with võidupüha) | Midsummer Eve | Tue | Wed | **Peak police night of the year** (see §9.3) |
| 24 Jun | **jaanipäev** | Midsummer Day | Wed | Thu | Very high in the early morning, then hangover traffic |
| 20 Aug | taasiseseisvumispäev | Restoration of Independence (1991) | Thu | Fri | Medium (concerts) |
| 24 Dec | **jõululaupäev** | Christmas Eve | Thu | Fri | **DV peak** |
| 25 Dec | esimene jõulupüha | Christmas Day | Fri | Sat | DV |
| 26 Dec | teine jõulupüha | Boxing Day | Sat | Sun | DV, traffic |

Easter dates computed with the Gregorian computus [COMPUTED]:

| Year | Suur reede | Lihavõtted | Nelipühad |
|---|---|---|---|
| 2025 | 18 Apr | 20 Apr | 8 Jun |
| 2026 | 3 Apr | 5 Apr | 24 May |
| 2027 | 26 Mar | 28 Mar | 16 May |
| 2028 | 14 Apr | 16 Apr | 4 Jun |
| 2029 | 30 Mar | 1 Apr | 20 May |
| 2030 | 19 Apr | 21 Apr | 9 Jun |

- **Shortened working day:** the working day before **24 Feb, 23 Jun, 24 Dec and 1 Jan** is three hours shorter (Töölepingu seadus §53), so the exodus traffic starts early afternoon. [LIKELY]
- In the game, a holiday falling on a weekend does **not** move to a weekday (Estonia has no substitute days). [LIKELY]
- **Vana-aastaõhtu (31 Dec)** is not a public holiday but is a top-three police night. Consumer fireworks are allowed without a permit only from **31 Dec 18:00 to 1 Jan 02:00** (other times need municipal permission). [LIKELY] Verified figure in `112-and-priorities.md`: 500+ call-outs on NYE 2025/26.

### 9.2 Other police-relevant dates (not public holidays)

| Date | What | Why the police care | Conf. |
|---|---|---|---|
| 14 Feb | Sõbrapäev | flavour only | LIKELY |
| 26-27 Apr | Anniversary of **Pronksiöö** (Bronze Night riots, 2007) | Public-order watch in Tallinn | LIKELY |
| Late Apr & early Oct | **Tartu tudengipäevad** (student days): spring and autumn | Noise, drinking, öörahu (night-quiet) complaints in Tartu | LIKELY |
| **9 May** | Soviet "Victory Day" for parts of the Russian-speaking community | **Public-order operations in Narva and at Maarjamäe (Tallinn)**. Since 2022, displaying symbols that support aggression (St George ribbon, Z) at gatherings is punishable. | LIKELY |
| Mid-May | Viimane koolikell (last school bell) | Teen parties | LIKELY |
| Mid-late June | Graduations (*lõpuaktused*), Pärnu *suvepealinn* season opening | Youth drinking, beach town crowds | LIKELY |
| 1 Sep | Teadmistepäev (school start) | PPA school-traffic campaign, speed checks near schools | LIKELY |
| 2nd Sun of May / Nov | Emadepäev / isadepäev | flavour | LIKELY |
| 2 Nov | Hingedepäev | flavour (candles, cemetery traffic) | LIKELY |
| Dec | Christmas markets (Tallinn Raekoja plats, Tartu) | Pickpockets, crowds | LIKELY |

### 9.3 Midsummer reference figures (from sibling notes)

`112-and-priorities.md` [VERIFIED there]:

- Jaanipäev 2022: **1,200+ call-outs on 23-24 June**, 133 drunk drivers.
- Jaanipäev 2026 (19-23 June): **317 crime reports, 889 misdemeanours, about 210 DV call-outs**, 38 injury crashes (3 dead), 32,000+ sobriety checks.
- Häirekeskus gets **about 1,000 extra calls** and doubles its staff on Midsummer night.

Use these to calibrate the holiday multiplier, e.g. ×2.0-2.5 spawn rate from 23 Jun 18:00 to 24 Jun 08:00 [ESTIMATE].

### 9.4 Big recurring events

| Event | Where | When | Size / police angle | Conf. |
|---|---|---|---|---|
| **Üldlaulu- ja tantsupidu** (Song and Dance Celebration) | Tallinna Lauluväljak + Kalevi staadion | Early July, roughly every 5 years. **XXVIII laulupidu "Iseoma": 4-6 July 2025.** The previous one was 2019 "Minu arm" (150th anniversary). Next one probably about **2029-2030**. | Tens of thousands of performers; the procession (*rongkäik*) through central Tallinn; total audience well over 100k across the days. Massive traffic and crowd operation. | LIKELY (2025 dates), UNSURE (next date) |
| **Noorte laulu- ja tantsupidu** (Youth celebration) | same venues | 2023 "Püha on maa" (about 30 Jun, 2 Jul 2023); next probably about 2028-2029 | Smaller version of the above | UNSURE |
| **Tartu Maraton** (ski) | Otepää → Elva, 63 km classic | A Sunday in **mid/late February** | About 4-8k skiers, rural road closures. **Cancelled when snow is lacking** (e.g. 2020; possibly also later years [UNSURE]). Game rule: third Sunday of February, 20 % cancellation chance [ESTIMATE]. | LIKELY / UNSURE |
| Tartu Rattamaraton (MTB) / Tartu Jooksumaraton | Otepää-Elva / Tartu | Rattamaraton in September (bike); running event in late spring or autumn | Road closures | UNSURE (dates) |
| **SEB Tallinna Maraton** | Central Tallinn (start and finish Vabaduse väljak), Pirita | **2nd weekend of September** (Sat 10 km / Sun marathon and half) | About 15-20k runners across distances. Many road closures, collapsed runners. | LIKELY |
| **Weekend Festival Baltic** | Pärnu (beach area) | Mid-August, 3 days | Large EDM festival (tens of thousands per day). Drugs, drunk youth, traffic. **2025-26 status UNSURE** (has paused before). | LIKELY (event exists), UNSURE (current status) |
| **Õllesummer** | Tallinna Lauluväljak | Early July (since 1994) | Was the biggest beer and music festival (about 70k visitors). **Held only irregularly in recent years; 2025-26 status UNSURE.** In 2025 the grounds were taken by the laulupidu. Treat as a fictionalised "suvine õllefestival". | UNSURE |
| "Hõbelaev" | ? | ? | **I know of no major Estonian festival by this name.** Do not use it as a real event without a source. | UNSURE |
| Viljandi Pärimusmuusika Festival | Viljandi lossimäed | Late July, 4 days | About 20-25k visitors, a calm crowd | LIKELY |
| Tallinna Merepäevad | Tallinn harbour areas | Mid-July | Very large crowds, water incidents | LIKELY |
| Saaremaa Ooperipäevad / Kuressaare Merepäevad | Kuressaare | July | Ferry queues (Virtsu-Kuivastu) | LIKELY |
| Haapsalu Augustibluus | Haapsalu | Early August | Medium | LIKELY |
| Hard Rock Laager | Vana-Vigala | July | Camping, drinking | LIKELY |
| **Rally Estonia** | Tartu area forest stages | July | Large spectator crowds, rural traffic, spectator-safety calls. WRC round 2020-2024; **2025-26 championship status UNSURE**. | LIKELY / UNSURE |
| Saaremaa Rally | Saaremaa | October | Regional | UNSURE |
| Big stadium concerts | Tallinna Lauluväljak (capacity for concerts about 60-100k) | Summer | E.g. Metallica 2019 (about 60k+). Huge one-night crowd operations. | LIKELY |
| PÖFF (Black Nights Film Festival) | Tallinn | November | Low police relevance | LIKELY |

### 9.5 Time zone and DST

| Item | Value | Conf. |
|---|---|---|
| Standard time | **EET = UTC+2** | VERIFIED-local (tzdata) |
| Summer time | **EEST = UTC+3** | VERIFIED-local |
| Rule (EU) | Starts on the **last Sunday of March at 01:00 UTC** (local 03:00 → 04:00) and ends on the **last Sunday of October at 01:00 UTC** (local 04:00 → 03:00) | VERIFIED-local |
| 2025 | 30 Mar → 26 Oct | VERIFIED-local (`zdump -v Europe/Tallinn`) |
| **2026** | **29 Mar → 25 Oct** | VERIFIED-local |
| 2027 | 28 Mar → 31 Oct | VERIFIED-local |
| 2028 | 26 Mar → 29 Oct | VERIFIED-local |
| History | Estonia skipped DST in 2000-2001 and resumed it in 2002. The EU plan (2018-19) to abolish clock changes has stalled, and changes are still happening in 2026. | LIKELY |

**Implementation:** store sim time as UTC ms. Render the clock with `Intl.DateTimeFormat('et-EE', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' })`. Never hard-code +2/+3. On the autumn change night, 03:00-03:59 happens twice; shift reports should show times with "EEST/EET" or as UTC to avoid ambiguity. The Häirekeskus night shift that night is 1 hour longer, a nice flavour line.

---

## 10. Suggested data shapes (for `calendar.ts` / `weather.ts`)

```ts
// [ESTIMATE] values; facts behind them are tagged in §8-9.
export const HOLIDAYS_FIXED = [
  { md: '01-01', id: 'uusaasta', et: 'Uusaasta', en: "New Year's Day", load: 1.8, peakHours: [0, 6] },
  { md: '02-24', id: 'vabariigi_aastapaev', et: 'Eesti Vabariigi aastapäev', en: 'Independence Day', load: 1.4 },
  { md: '05-01', id: 'kevadpuha', et: 'Kevadpüha', en: 'Spring Day', load: 1.3, eve: 'volbriöö' },
  { md: '06-23', id: 'voidupuha', et: 'Võidupüha / jaanilaupäev', en: 'Victory Day / Midsummer Eve', load: 2.4, peakHours: [18, 6] },
  { md: '06-24', id: 'jaanipaev', et: 'Jaanipäev', en: 'Midsummer Day', load: 1.8 },
  { md: '08-20', id: 'taasiseseisvumispaev', et: 'Taasiseseisvumispäev', en: 'Restoration of Independence Day', load: 1.2 },
  { md: '12-24', id: 'joululaupaev', et: 'Jõululaupäev', en: 'Christmas Eve', load: 1.5, dvMultiplier: 1.7 },
  { md: '12-25', id: 'joulupuha1', et: 'Esimene jõulupüha', en: 'Christmas Day', load: 1.3, dvMultiplier: 1.6 },
  { md: '12-26', id: 'joulupuha2', et: 'Teine jõulupüha', en: 'Boxing Day', load: 1.2, dvMultiplier: 1.4 },
  { md: '12-31', id: 'vana_aasta_ohtu', et: 'Vana-aastaõhtu', en: "New Year's Eve", load: 2.2, peakHours: [20, 24], notPublicHoliday: true },
] as const;
// Movable: suur reede = Easter − 2 d, lihavõtted = Easter, nelipühad = Easter + 49 d (computus; table in §9.1).
```

---

## 11. Domain note: politsei.eu

The user has said the domain will be **politsei.eu** (already in `public/CNAME` and DESIGN.md).

- **Referer and Origin:** browsers send `Referer: https://politsei.eu/` (default `strict-origin-when-cross-origin`) and `Origin: https://politsei.eu` on CORS tile requests. That satisfies the OSM, OSRM and FOSSGIS rules that a Referer must be present. **Do not** set `<meta name="referrer" content="no-referrer">`. [LIKELY]
- **HTTPS everywhere:** GitHub Pages enforces HTTPS on the custom domain, so every tile and API URL must be `https://`, or browsers will block it as mixed content. All URLs in this document already are.
- **Naming in third-party logs:** tile and routing providers see `politsei.eu` in their logs, one TLD away from the real **politsei.ee** (Politsei- ja Piirivalveamet). To avoid looking like an official police system, (a) never identify as PPA or POLITSEI in User-Agent strings or query parameters such as Maa-amet's `ASUTUS` (use "EPD fan game"), and (b) keep the "Mitteametlik fännimäng, ei ole seotud PPA-ga" disclaimer visible next to the map attribution. This matches the branding caution in `ppa-organisation.md`.
- If a provider's fair-use page asks heavy users to register or contact them (CARTO above about 75k views, Maa-amet bulk use), contact them as a hobby project, not as a police service.

---

## 12. Open uncertainties: check once in a browser before shipping

1. **`tiles.maaamet.ee` still serves after the 2025 rename?** Is there a `maaruum` hostname? Do the layers `kaart`, `hallkaart`, `foto` (`.jpg`) and `hybriid` exist in `@GMC`? Use the TMS test tile `hallkaart@GMC/10/582/723.png` (should show Tallinn).
2. **CORS header on Maa-amet tiles.** This decides whether the `maaamet` and `foto` styles work in MapLibre at all (§1.4 snippet).
3. Max zoom per Maa-amet layer (`foto` z19/20?).
4. Maa- ja Ruumiamet licence name and the exact attribution wording they request.
5. CARTO free-tier wording ("non-commercial", "75,000 mapviews/month") on carto.com / the `CartoDB/basemap-styles` README.
6. OpenFreeMap `dark` and `fiord` style URLs and the current ToS.
7. OSRM demo and FOSSGIS usage-policy wording (both "1 req/s" from memory).
8. Event statuses for 2025-26: Weekend Festival Baltic, Õllesummer, Rally Estonia (WRC?), the next laulupidu and youth festival years, recent Tartu Maraton cancellations, and the 24 Feb parade city.
9. Climate normals: replace the §8 table with exact 1991-2020 figures from ilmateenistus.ee if precision matters (it does not for gameplay).
10. "Hõbelaev": unknown. Ask the designer what was meant.

Things **not** in doubt: DST dates (tzdata), MapLibre's `scheme: 'tms'` / `{ratio}` / `{bbox-epsg-3857}` support and lack of `{s}` / `{-y}` (source code), and the sun tables (NOAA algorithm, tested).
