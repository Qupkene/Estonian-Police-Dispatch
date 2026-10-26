// The owner's drawings of the crisis scenarios (docs/CRISIS.md): crisis-<id>.webp (960 px wide) and crisis-<id>-sm.webp
// (480 px). A scenario without a drawing gets a text card instead.
const FILES = import.meta.glob<string>('./crisis-*.webp', { eager: true, import: 'default' });

/** The drawing of a scenario (`small`: the 480 px one), or undefined when it has none. */
export function crisisArt(id: string, small = false): string | undefined {
  return FILES[`./crisis-${id}${small ? '-sm' : ''}.webp`];
}
