import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEMPLATE_BY_ID, TEMPLATES } from '@/data/incidents';
import { directorSpawn } from '@/sim/commands';
import { createShift } from '@/sim/engine';
import { tallinnTime } from '@/sim/time';
import { castOf, sceneKindOf } from '@/cctv/cast';

describe('dump', () => {
  it('dumps', { timeout: 300_000 }, () => {
    const s = createShift({ seed: 5, regionId: 'pohja', mode: 'director', difficulty: 'normal', start: tallinnTime(2026, 10, 23, 19, 0), hours: 6, playerName: 'x', weather: 'clear' });
    const lines: string[] = [];
    let n = 0;
    for (const tpl of Object.values(TEMPLATE_BY_ID)) {
      n++;
      const kinds = new Map<string, string[]>();
      for (const place of tpl.places) {
        const inc = { category: tpl.category, tags: tpl.tags ?? [], templateId: tpl.id, location: { placeKind: place }, falseAlarm: false, truePriority: tpl.priority, vehicles: (tpl.vehicles ?? []).map((v, i) => ({ plate: `p${i}`, role: v.role })), persons: tpl.persons.map((p, i) => ({ personId: `x${i}`, role: p.role })) } as never;
        const k = sceneKindOf(inc);
        kinds.set(k, [...(kinds.get(k) ?? []), place]);
      }
      const ks = [...kinds.entries()].map(([k, p]) => `${k}(${p.join(',')})`).join(' ');
      lines.push([tpl.id, tpl.category, `P${tpl.priority}`, `[${(tpl.tags ?? []).join(',')}]`, `roles=${tpl.persons.map((p) => p.role[0]).join('')}`, `veh=${(tpl.vehicles ?? []).map((v) => v.role[0] + (v.kind ?? '')).join(',')}`, `beats=${(tpl.beats ?? []).map((b) => b.kind + (b.kind === 'transport' ? ':' + b.dest : b.kind === 'agency' ? ':' + b.agency : '')).join(',')}`, `out=${[...new Set(tpl.outcomes.map((o) => o.result))].join(',')}`, `ag=${(tpl.agencies ?? []).map((a) => a.agency).join(',')}`, `=> ${ks}`, `| ${tpl.title.en}`].join('  '));
    }
    writeFileSync('/tmp/claude-0/-home-user-Estonian-Police-Dispatch/07a791a6-10a4-5f34-b481-f9a687ec845c/scratchpad/cam/director/catalogue.txt', lines.join('\n'));
    let ok = 0;
    let fail = 0;
    for (const tpl of TEMPLATES) {
      const id = directorSpawn(s, { templateId: tpl.id });
      if (!id) { fail++; continue; }
      const inc = s.incidents[id];
      castOf(s, inc, tpl, { season: 'autumn', temp: 8 });
      ok++;
    }
    console.log('templates', n, 'spawned', ok, 'failed', fail);
    expect(n).toBeGreaterThan(10);
  });
});
