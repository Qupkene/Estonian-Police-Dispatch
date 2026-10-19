// The version the game shows, package-lock.json and the newest CHANGELOG.md section agree (CLAUDE.md, "Versioon").
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VERSION } from '@/ui/screens/shell/helpers';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

describe('version', () => {
  const pkg = JSON.parse(read('package.json')) as { version: string };

  it('is x.y.z and the game shows package.json version', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(VERSION).toBe(pkg.version);
  });

  it('package-lock.json carries the same version', () => {
    const lock = JSON.parse(read('package-lock.json')) as { version: string; packages: Record<string, { version?: string }> };
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });

  it('the newest CHANGELOG.md section is this version', () => {
    const first = /^## (\d+\.\d+\.\d+)\b/m.exec(read('CHANGELOG.md'));
    expect(first?.[1]).toBe(pkg.version);
  });
});
