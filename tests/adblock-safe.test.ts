// Ad blockers hide elements by class name: EasyList (Brave Shields, uBlock Origin, AdBlock) has generic rules such as
// `##.ad-field`, `##.ad-btn` and `##.ad-card`. The admin panel once used the prefix ad- and showed an empty login box in
// Brave (2.28.1). Every class the game and the panel style must stay clear of the names those lists hide.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, ext);
    return ext.test(name) ? [path] : [];
  });
}

/** Class names as ad blockers' generic rules match them: ad-..., ads_..., advert..., sponsored..., banner-ad... */
const RISKY =
  /^(?:ad|ads\w*|adv|advert\w*|advertisement\w*|adsense|adslot|adunit|adbox|adblock\w*|sponsor\w*|banner[-_]?ad\w*|google[-_]?ad\w*)(?:[-_]|$)|[-_]ads?(?:[-_]|$)/i;

describe('class names survive ad blockers', () => {
  const classes = new Map<string, string>();
  for (const file of files(join(ROOT, 'src'), /\.css$/)) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/\.([A-Za-z_][\w-]*)/g)) classes.set(m[1], file);
  }
  for (const file of files(join(ROOT, 'src'), /\.tsx$/)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/className=\{?[`"']([^`"']+)/g)) {
      for (const c of m[1].split(/\s+/)) if (/^[A-Za-z_][\w-]*$/.test(c)) classes.set(c, file);
    }
  }

  it('finds the classes to check', () => {
    expect(classes.size).toBeGreaterThan(500);
    expect(classes.has('pn-field')).toBe(true);
  });

  it('uses no class an ad blocker hides', () => {
    const risky = [...classes]
      .filter(([c]) => RISKY.test(c))
      .map(([c, f]) => `${c} (${f.slice(ROOT.length + 1)})`);
    expect(risky).toEqual([]);
  });

  it('the pattern catches what EasyList hides', () => {
    for (const c of [
      'ad-field',
      'ad-btn',
      'ad-card',
      'ads',
      'adsbox',
      'top-ad',
      'sponsored-post',
      'banner-ad',
      'ad_slot',
    ])
      expect(RISKY.test(c), c).toBe(true);
    for (const c of [
      'pn-field',
      'vk-road',
      'gm-head',
      'sh-paper',
      'loading',
      'header',
      'admin-link',
      'address',
    ])
      expect(RISKY.test(c), c).toBe(false);
  });
});
