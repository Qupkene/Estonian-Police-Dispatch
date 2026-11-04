#!/usr/bin/env node
// The menus' duty map, prebuilt: the heavy layers (land, prefectures, county lines, coast and land border, the
// neighbours, the lakes, the roads) of its standard views (dutyMap.ts STANDARD_VIEWS) in
// src/ui/screens/shell/dutyMapBase.json, so the start, the sign-in and the menus draw the map without most of a
// second of polygon work on a slow phone. Run it after changing src/data/geo, the region towns or
// src/ui/screens/shell/dutyMap.ts; tests/duty-map.test.ts fails while the file is not what the code builds.
//
//   npm run gen:dutymap
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'src', 'ui', 'screens', 'shell', 'dutyMapBase.json');

const { module: map } = await runnerImport(join(ROOT, 'src', 'ui', 'screens', 'shell', 'dutyMap.ts'), {
  root: ROOT,
  configFile: false,
  resolve: { alias: { '@': join(ROOT, 'src') } },
  logLevel: 'error',
});

const out = {};
for (const view of map.STANDARD_VIEWS) out[map.viewKey(view)] = map.heavyLayers(view);
const json = `${JSON.stringify(out)}\n`;
writeFileSync(OUT, json);
console.log(`${OUT}: ${Object.keys(out).length} views, ${Math.round(json.length / 1024)} KB`);
