// Icon set — API owned by core; ui-shell replaces the path data with a polished set. Keep the names.
export const ICON_NAMES = [
  'phone', 'phone-off', 'radio', 'car', 'user', 'users', 'search', 'map', 'alert', 'shield', 'clock', 'pause', 'play',
  'fast', 'close', 'check', 'x', 'chevron-down', 'chevron-right', 'chevron-left', 'plus', 'minus', 'settings', 'stats',
  'list', 'pin', 'siren', 'heli', 'dog', 'bike', 'boat', 'money', 'star', 'eye', 'eye-off', 'target', 'flag', 'volume',
  'mute', 'fire', 'ambulance', 'info', 'warning', 'lock', 'id', 'fingerprint', 'book', 'film', 'home', 'logout', 'refresh',
  'download', 'send', 'sun', 'moon', 'cloud', 'rain', 'snow', 'wind', 'fog', 'layers', 'crosshair', 'trophy', 'briefcase',
  'building', 'wrench', 'cart', 'handcuffs', 'newspaper', 'mic', 'keyboard', 'globe', 'gauge', 'route', 'timer',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

/** Placeholder glyphs (simple shapes) until ui-shell provides real paths. */
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`ui-icon${className ? ' ' + className : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon={name}
    >
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
