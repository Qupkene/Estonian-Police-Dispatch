// Hash routes of the admin panel: '#/kontod/12' is ['kontod', '12'], so a reload stays where it was.

export function readRoute(): string[] {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function go(path: string): void {
  window.location.hash = `#/${path}`;
}
