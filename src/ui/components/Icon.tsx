// EPD icon set — hand-drawn 24 × 24 stroke icons (1.8 px, round caps/joins).
// API (ICON_NAMES, IconName, <Icon name size className />) is shared by every module; keep it stable.
import type { ReactNode } from 'react';

export const ICON_NAMES = [
  'phone', 'phone-off', 'radio', 'car', 'user', 'users', 'search', 'map', 'alert', 'shield', 'clock', 'pause', 'play',
  'fast', 'close', 'check', 'x', 'chevron-down', 'chevron-right', 'chevron-left', 'plus', 'minus', 'settings', 'stats',
  'list', 'pin', 'siren', 'heli', 'dog', 'bike', 'boat', 'money', 'star', 'eye', 'eye-off', 'target', 'flag', 'volume',
  'mute', 'fire', 'ambulance', 'info', 'warning', 'lock', 'id', 'fingerprint', 'book', 'film', 'home', 'logout', 'refresh',
  'download', 'send', 'sun', 'moon', 'cloud', 'rain', 'snow', 'wind', 'fog', 'layers', 'crosshair', 'trophy', 'briefcase',
  'building', 'wrench', 'cart', 'handcuffs', 'newspaper', 'mic', 'keyboard', 'globe', 'gauge', 'route', 'timer',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

const GEAR =
  'M9.46 5.26L9.93 2.73L14.07 2.73L14.54 5.26L14.97 5.44L17.09 3.98L20.02 6.91L18.56 9.03L18.74 9.46L21.27 9.93L21.27 14.07L18.74 14.54L18.56 14.97L20.02 17.09L17.09 20.02L14.97 18.56L14.54 18.74L14.07 21.27L9.93 21.27L9.46 18.74L9.03 18.56L6.91 20.02L3.98 17.09L5.44 14.97L5.26 14.54L2.73 14.07L2.73 9.93L5.26 9.46L5.44 9.03L3.98 6.91L6.91 3.98L9.03 5.44Z';

const HANDSET = 'M5.2 3.5h3.1l1.9 4.8-2.3 1.5a11.5 11.5 0 0 0 6.3 6.3l1.5-2.3 4.8 1.9v3.1a2 2 0 0 1-2.2 2A17 17 0 0 1 3.2 5.7a2 2 0 0 1 2-2.2z';

/** Path data per icon. Drawn by hand on a 24 px grid; keep visual weight consistent (≈ 2 px safe margin). */
const PATHS: Record<IconName, ReactNode> = {
  phone: <path d={HANDSET} />,
  'phone-off': (
    <>
      <path d="M10.3 13.7a11.5 11.5 0 0 1-2.4-3.9l2.3-1.5-1.9-4.8H5.2a2 2 0 0 0-2 2.2 17 17 0 0 0 4.4 10.2" />
      <path d="M11.7 17.1a17 17 0 0 0 6.6 2.7 2 2 0 0 0 2.2-2v-3.1l-4.8-1.9-1.4 2.1" />
      <path d="M3 3l18 18" />
    </>
  ),
  radio: (
    <>
      <rect x="5" y="8" width="10" height="13" rx="2" />
      <path d="M8 8V2.8" />
      <path d="M8 12h4M8 15h4" />
      <circle cx="10" cy="18.2" r=".6" />
      <path d="M17.6 5a4.2 4.2 0 0 1 0 5.6M20 2.8a7.5 7.5 0 0 1 0 10" />
    </>
  ),
  car: (
    <>
      <path d="M5 12l1.5-4.5A2 2 0 0 1 8.4 6h7.2a2 2 0 0 1 1.9 1.5L19 12" />
      <rect x="3" y="12" width="18" height="5.5" rx="1.6" />
      <path d="M5.5 17.5v2M18.5 17.5v2" />
      <path d="M6.5 14.7h1.5M16 14.7h1.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6" />
      <path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5l5 5" />
    </>
  ),
  map: (
    <>
      <path d="M3 6.2 9 3.8l6 2.4 6-2.4v14L15 20.2l-6-2.4-6 2.4z" />
      <path d="M9 3.8v14M15 6.2v14" />
    </>
  ),
  alert: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.8a2.2 2.2 0 0 0 4 0" />
      <path d="M12 2.6v1.6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.8 19.5 5.6v6c0 4.6-3.1 8.2-7.5 9.6-4.4-1.4-7.5-5-7.5-9.6v-6z" />
      <path d="M12 7.5l1.3 2.7 2.9.4-2.1 2 .5 2.9L12 14.1l-2.6 1.4.5-2.9-2.1-2 2.9-.4z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  pause: (
    <>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" />
    </>
  ),
  play: <path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11-7.2a.8.8 0 0 0 0-1.4l-11-7.2a.8.8 0 0 0-1.2.7z" />,
  fast: (
    <>
      <path d="M3 6.2v11.6a.7.7 0 0 0 1.1.6l7.4-5.8a.7.7 0 0 0 0-1.2L4.1 5.6A.7.7 0 0 0 3 6.2z" />
      <path d="M12.5 6.2v11.6a.7.7 0 0 0 1.1.6l7.4-5.8a.7.7 0 0 0 0-1.2l-7.4-5.8a.7.7 0 0 0-1.1.6z" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="M4.5 12.5l4.8 4.8L19.5 7" />,
  x: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'chevron-left': <path d="M15 6l-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  settings: (
    <>
      <path d={GEAR} />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  stats: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M6.5 16.5v-4M11 16.5V6.5M15.5 16.5v-7M20 16.5V4" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.2s-7-6.1-7-11.7a7 7 0 0 1 14 0c0 5.6-7 11.7-7 11.7z" />
      <circle cx="12" cy="9.5" r="2.6" />
    </>
  ),
  siren: (
    <>
      <path d="M7 18v-5.5a5 5 0 0 1 10 0V18" />
      <path d="M4.5 18h15v3h-15z" />
      <path d="M12 2.5v2.2M4.6 5.6l1.6 1.6M19.4 5.6l-1.6 1.6M2.5 12.5h2M19.5 12.5h2" />
      <path d="M10 13a2 2 0 0 1 2-2" />
    </>
  ),
  heli: (
    <>
      <path d="M4 4.5h15M11.5 4.5v3.5" />
      <path d="M8.5 8h6a4 4 0 0 1 4 4v.5a2.5 2.5 0 0 1-2.5 2.5h-6.5A3.5 3.5 0 0 1 6 11.5 3.5 3.5 0 0 1 8.5 8z" />
      <path d="M6 11H2.5M2.5 9v4" />
      <path d="M14.5 8v4h4" />
      <path d="M8 19.5h11M10.5 15v4.5M15.5 15v4.5" />
    </>
  ),
  dog: (
    <>
      <path d="M8 5.5h8l1 3.5v5a5 5 0 0 1-10 0V9z" />
      <path d="M8 5.5 4.3 7.6l1.1 5.2L7 11.6M16 5.5l3.7 2.1-1.1 5.2-1.6-1.2" />
      <path d="M11 15.2h2l-1 1.1z" />
      <path d="M10 11h.01M14 11h.01" />
    </>
  ),
  bike: (
    <>
      <circle cx="5.8" cy="16" r="3.6" />
      <circle cx="18.2" cy="16" r="3.6" />
      <path d="M5.8 16 9.5 9h5.8M9.5 9l3.5 7H5.8M15.3 9l2.9 7M13.6 5.5h2.7l-1 3.5" />
    </>
  ),
  boat: (
    <>
      <path d="M3 14.5 4.6 19h14.8l1.6-4.5z" />
      <path d="M6.5 14.5v-4h7l3 4" />
      <path d="M10 10.5V4.5l4 2.5-4 1.2" />
      <path d="M2.5 21.8c1.6 0 1.6-.9 3.2-.9s1.6.9 3.2.9 1.6-.9 3.2-.9 1.6.9 3.2.9 1.6-.9 3.2-.9 1.6.9 2.9.9" />
    </>
  ),
  money: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M14 9.7a3 3 0 1 0 0 4.6M8.8 11.2h4M8.8 12.8h4" />
      <path d="M5.5 9h.01M18.5 15h.01" />
    </>
  ),
  star: <path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9z" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M9.9 5.8A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M14.1 14.1A3 3 0 0 1 9.9 9.9M6.6 6.7A16.6 16.6 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9.3 9.3 0 0 0 5-1.5" />
      <path d="M3.5 3.5l17 17" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.3" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21.5V3.5" />
      <path d="M5 4h12.5l-2.6 4.3 2.6 4.2H5" />
    </>
  ),
  volume: (
    <>
      <path d="M3.5 9.5h3.7L12 5.3v13.4l-4.8-4.2H3.5z" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.3a8 8 0 0 1 0 11.4" />
    </>
  ),
  mute: (
    <>
      <path d="M3.5 9.5h3.7L12 5.3v13.4l-4.8-4.2H3.5z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  fire: (
    <>
      <path d="M12 21.2a6.3 6.3 0 0 0 6.3-6.3c0-3.8-2.6-5.7-3.8-8.9-1 2.1-1.9 3.1-3.4 3.6C11.2 7 10.3 5 9.8 2.8 7.5 6.1 5.7 9.4 5.7 14.9a6.3 6.3 0 0 0 6.3 6.3z" />
      <path d="M12 21.2a2.6 2.6 0 0 1-2.6-2.6c0-1.6 1.3-2.6 2.6-4.2 1.3 1.6 2.6 2.6 2.6 4.2a2.6 2.6 0 0 1-2.6 2.6z" />
    </>
  ),
  ambulance: (
    <>
      <path d="M5 17.5H3.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h10v11M9 17.5h6.2M18.8 17.5h1.7v-4l-3-4h-4" />
      <circle cx="7" cy="17.8" r="1.9" />
      <circle cx="17" cy="17.8" r="1.9" />
      <path d="M8 8.8v4.4M5.8 11h4.4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 4.2a2 2 0 0 1 3.4 0l7.6 13.1a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z" />
      <path d="M12 9.5v4.3M12 17h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5v-3a4 4 0 0 1 8 0v3" />
      <path d="M12 14.5v2.2" />
    </>
  ),
  id: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <circle cx="8.5" cy="10.8" r="2.1" />
      <path d="M5.3 16.2a3.4 3.4 0 0 1 6.4 0" />
      <path d="M14 10h4.5M14 13.5h4.5" />
    </>
  ),
  fingerprint: (
    <>
      <path d="M6.2 5.3A8.5 8.5 0 0 1 20.5 11v1.5" />
      <path d="M3.9 8.6A8.5 8.5 0 0 0 3.5 11v2" />
      <path d="M8.3 20.6A12 12 0 0 1 6.5 14v-3a5.5 5.5 0 0 1 11 0v2.5" />
      <path d="M12 11v3a9 9 0 0 0 1.8 6.6" />
      <path d="M9.2 16.3a12 12 0 0 1-.2-2.3v-3a3 3 0 0 1 6 0v3.2a13 13 0 0 0 .9 4.3" />
      <path d="M20.3 16a16 16 0 0 1-.5 3.6" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5C10 5 7 4.4 3.5 4.8v13c3.5-.4 6.5.2 8.5 1.7 2-1.5 5-2.1 8.5-1.7v-13C17 4.4 14 5 12 6.5z" />
      <path d="M12 6.5v13" />
    </>
  ),
  film: (
    <>
      <rect x="3.5" y="9.5" width="17" height="11" rx="1.4" />
      <path d="m3.4 9.4-.6-3 15.5-3 .6 3z" />
      <path d="m7.6 5.6 2.6 2.9M12.6 4.6l2.6 2.9" />
      <path d="M3.5 13.5h17" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.2h4V20" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 7.5l4.5 4.5-4.5 4.5M19.5 12H9" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.8 10.5A8 8 0 0 0 5.4 7.4L4 9" />
      <path d="M4 4.5V9h4.5" />
      <path d="M4.2 13.5a8 8 0 0 0 14.4 3.1L20 15" />
      <path d="M20 19.5V15h-4.5" />
    </>
  ),
  download: <path d="M12 3.5v11.5M7.3 10.3 12 15l4.7-4.7M4.5 19.8h15" />,
  send: (
    <>
      <path d="M20.8 3.2 10.4 13.6" />
      <path d="M20.8 3.2 14.2 21l-3.8-7.4L3 9.8z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  moon: <path d="M20 14.6A8.3 8.3 0 0 1 9.4 4 8.4 8.4 0 1 0 20 14.6z" />,
  cloud: <path d="M7.4 18.5h10.1a4.2 4.2 0 0 0 .5-8.4A6.2 6.2 0 0 0 6.2 9.5a4.5 4.5 0 0 0 1.2 9z" />,
  rain: (
    <>
      <path d="M7.4 14.5h10.1a3.6 3.6 0 0 0 .4-7.2A5.6 5.6 0 0 0 6.9 7a3.8 3.8 0 0 0 .5 7.5z" />
      <path d="M8.5 17.5 7.5 20.5M12.5 17.5l-1 3M16.5 17.5l-1 3" />
    </>
  ),
  snow: (
    <>
      <path d="M12 2.8v18.4M4 7.4l16 9.2M4 16.6l16-9.2" />
      <path d="M9.6 4.4 12 6.3l2.4-1.9M9.6 19.6 12 17.7l2.4 1.9M4.4 10.6l2.9-1.1-.5-3M19.6 13.4l-2.9 1.1.5 3M4.4 13.4l2.9 1.1-.5 3M19.6 10.6l-2.9-1.1.5-3" />
    </>
  ),
  wind: (
    <>
      <path d="M3 9h10.5a2.8 2.8 0 1 0-2.8-2.8" />
      <path d="M3 13h15a3 3 0 1 1-3 3" />
      <path d="M3 17h6" />
    </>
  ),
  fog: (
    <>
      <path d="M5.5 10a6.5 6.5 0 0 1 13 0" />
      <path d="M3 13.5h18M5 17h14M8 20.5h8" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5 21 8l-9 4.5L3 8z" />
      <path d="M3 12l9 4.5 9-4.5" />
      <path d="M3 16l9 4.5 9-4.5" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2v5.5M12 16.5V22M2 12h5.5M16.5 12H22" />
      <path d="M12 12h.01" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 3.8h10v5.4a5 5 0 0 1-10 0z" />
      <path d="M7 5.5H4.5V7A3.4 3.4 0 0 0 7.3 10.4M17 5.5h2.5V7a3.4 3.4 0 0 1-2.8 3.4" />
      <path d="M12 14.2v3.3" />
      <path d="M8.5 20.5h7l-1-3h-5z" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7.5" width="18" height="12.5" rx="2" />
      <path d="M9 7.5V5.6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.9" />
      <path d="M3 12.5h18M11 12.5v1.6h2v-1.6" />
    </>
  ),
  building: (
    <>
      <path d="M4.5 21V4.8a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V21" />
      <path d="M14.5 9.5h4a1 1 0 0 1 1 1V21" />
      <path d="M2.5 21h19" />
      <path d="M8 7.5h3M8 11h3M8 14.5h3M8 18v3" />
    </>
  ),
  wrench: (
    <path d="M15.6 3.2a4.7 4.7 0 0 0-4.5 6.2l-7 7a2.1 2.1 0 0 0 3 3l7-7a4.7 4.7 0 0 0 6.2-4.5l-3 3-2.7-.4-.4-2.7z" />
  ),
  cart: (
    <>
      <path d="M2.8 3.8h2.5l2.3 10.6a1.1 1.1 0 0 0 1.1.9h8.5a1.1 1.1 0 0 0 1-.8l1.9-6.7H6.3" />
      <circle cx="9.5" cy="19.3" r="1.4" />
      <circle cx="17" cy="19.3" r="1.4" />
    </>
  ),
  handcuffs: (
    <>
      <circle cx="6.5" cy="15.5" r="4" />
      <circle cx="17.5" cy="15.5" r="4" />
      <path d="M5 11.8V9.3h3v2.5M16 11.8V9.3h3v2.5" />
      <path d="M6.5 9.3V8M17.5 9.3V8" />
      <path d="M6.5 8c.9-2.3 2.8-3.5 5.5-3.5S16.6 5.7 17.5 8" strokeDasharray="1.6 1.4" />
    </>
  ),
  newspaper: (
    <>
      <path d="M4 4.5h12.5v13.5a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" />
      <path d="M16.5 8.5h3.5v9.5a2 2 0 0 1-2 2" />
      <path d="M7 8h6.5M7 11.5h6.5M7 15h4" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2.8" width="6" height="11.2" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5v3.7M9 21.2h6" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 9.5h.01M9.3 9.5h.01M12.6 9.5h.01M15.9 9.5h.01M18.2 9.5h.01M6 12h.01M18.2 12h.01M8.3 12h.01M15.7 12h.01" />
      <path d="M8 14.8h8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M3.2 12h17.6M4.5 7.5h15M4.5 16.5h15" />
      <path d="M12 3.2c2.4 2.4 3.6 5.3 3.6 8.8s-1.2 6.4-3.6 8.8c-2.4-2.4-3.6-5.3-3.6-8.8S9.6 5.6 12 3.2z" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.6 18.2a8.8 8.8 0 1 1 14.8 0" />
      <path d="M12 14.5l4.2-4.6" />
      <circle cx="12" cy="14.5" r="1.5" />
      <path d="M6.6 11.5h.01M8.4 8h.01M12 6.6h.01" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18.5" r="2" />
      <circle cx="18" cy="5.5" r="2" />
      <path d="M8 18.5h8.2a3.3 3.3 0 0 0 0-6.6H7.8a3.2 3.2 0 0 1 0-6.4H16" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5M9.5 2.5h5M12 2.5V6M18.2 6.3l1.6-1.6" />
    </>
  ),
};

/** Consistent 24 px stroke icon. Inherits colour from `currentColor`. */
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`ui-icon${className ? ' ' + className : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size <= 14 ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      {PATHS[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}
