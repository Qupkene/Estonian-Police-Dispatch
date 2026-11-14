# Licence texts kept by hand

`THIRD-PARTY-LICENSES.txt` in the build (written by the `thirdPartyLicences` plugin in `vite.config.ts`, linked from
the credits screen) carries the licence text of everything third-party the game ships. Most texts come straight
from the packages in `node_modules`. The files here cover what ships no text of its own:

| File | For | Taken from |
| --- | --- | --- |
| `pmtiles.txt` | the npm package `pmtiles` (BSD-3-Clause; its tarball has no licence file) | `LICENSE` of github.com/protomaps/PMTiles |
| `protomaps-basemaps.txt` | the npm package `@protomaps/basemaps` (BSD-3-Clause; no licence file in the tarball) | `LICENSE.md` of github.com/protomaps/basemaps |
| `noto-sans.txt` | the map's glyphs in `public/glyphs` (Noto Sans Regular, Medium, Italic; SIL OFL 1.1) | `fonts/OFL.txt` of github.com/protomaps/basemaps-assets |

The texts are copied unchanged. A package that ships no licence file and has no text here fails the build: add its
text to this folder and its name to `LICENCE_FALLBACK` in `vite.config.ts`.
