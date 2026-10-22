import { describe, expect, it } from 'vitest';
import { falloutKind } from '@/sim/fallout';

describe('what a wrong registry answer leads to (src/sim/fallout.ts)', () => {
  it('names nothing when JK told the truth', () => {
    expect(falloutKind('clean', 'clean', false)).toBeNull();
    expect(falloutKind('stolen', 'stolen', true)).toBeNull();
  });

  it('a wanted person let go is the worst miss, an innocent one cuffed the worst accusation', () => {
    expect(falloutKind('clean', 'wanted', false)).toBe('missed_wanted');
    expect(falloutKind('probation', 'wanted', false)).toBe('missed_wanted');
    expect(falloutKind('wanted', 'clean', false)).toBe('unfounded_detention');
    expect(falloutKind('wanted', 'weapon', false)).toBe('unfounded_detention');
  });

  it('knows the person checks', () => {
    expect(falloutKind('clean', 'missing', false)).toBe('missed_missing');
    expect(falloutKind('clean', 'restraining', false)).toBe('missed_restraining');
    expect(falloutKind('restraining', 'clean', false)).toBe('false_restraining');
    expect(falloutKind('missing', 'clean', false)).toBe('false_missing');
    expect(falloutKind('notfound', 'clean', false)).toBe('needless_identification');
    expect(falloutKind('clean', 'notfound', false)).toBe('false_identity');
    expect(falloutKind('weapon', 'clean', false)).toBe('false_alert');
    expect(falloutKind('clean', 'weapon', false)).toBe('missed_weapon');
    expect(falloutKind('nolicense', 'clean', false)).toBe('unfounded_fine');
    expect(falloutKind('clean', 'nolicense', false)).toBe('missed_violation');
    expect(falloutKind('probation', 'clean', false)).toBe('minor');
  });

  it('knows the vehicle checks', () => {
    expect(falloutKind('clean', 'stolen', true)).toBe('missed_stolen');
    expect(falloutKind('noinsurance', 'ownerwanted', true)).toBe('missed_wanted');
    expect(falloutKind('stolen', 'clean', true)).toBe('unfounded_detention');
    expect(falloutKind('ownerwanted', 'clean', true)).toBe('false_alert');
    expect(falloutKind('clean', 'notfound', true)).toBe('false_identity');
    expect(falloutKind('notfound', 'clean', true)).toBe('minor');
    expect(falloutKind('suspended', 'clean', true)).toBe('unfounded_fine');
    expect(falloutKind('noinsurance', 'noinspection', true)).toBe('unfounded_fine');
    expect(falloutKind('clean', 'noinspection', true)).toBe('missed_violation');
  });
});
