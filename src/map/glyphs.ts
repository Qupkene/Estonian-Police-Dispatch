/** Inline SVG glyphs (16×16, currentColor) for unit types, other agencies' vehicles and map overlays. */
import type { Agency, UnitType } from '@/sim/types';

const svg = (body: string, extra = '') =>
  `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor"${extra}>${body}</svg>`;

const CAR_FRONT =
  '<path fill-rule="evenodd" d="M3.4 7.1 4.5 4.2c.2-.6.8-1 1.4-1h4.2c.6 0 1.2.4 1.4 1l1.1 2.9h.4c.6 0 1 .4 1 1V12h-1.4v1.6h-2.1V12H5.5v1.6H3.4V12H2V8.1c0-.6.4-1 1-1zm1.8 0h5.6l-.7-2.2H5.9zM3.6 9.6a1 1 0 1 0 2 0 1 1 0 0 0-2 0m6.8 0a1 1 0 1 0 2 0 1 1 0 0 0-2 0"/>';

export const UNIT_GLYPHS: Record<UnitType, string> = {
  patrol: svg(`${CAR_FRONT}<path d="M6.2 1.2h3.6v1.3H6.2z"/>`),
  rapid: svg('<path d="M9.4.8 3.2 9.2h4.1l-1.1 6 6.6-8.9H8.6z"/>'),
  k9: svg(
    '<ellipse cx="8" cy="11" rx="3.3" ry="2.8"/><ellipse cx="3.5" cy="7.3" rx="1.45" ry="1.7"/><ellipse cx="6.2" cy="4.2" rx="1.45" ry="1.75"/><ellipse cx="9.8" cy="4.2" rx="1.45" ry="1.75"/><ellipse cx="12.5" cy="7.3" rx="1.45" ry="1.7"/>',
  ),
  traffic: svg(
    '<path fill-rule="evenodd" d="M8 2.6a6.6 6.6 0 0 0-5.7 9.9l.3.5h10.8l.3-.5A6.6 6.6 0 0 0 8 2.6m0 2a4.6 4.6 0 0 1 4.4 6.4H3.6A4.6 4.6 0 0 1 8 4.6"/><path d="m7.1 10.2 3.9-4.1-2.3 5a1 1 0 0 1-1.6-.9"/>',
  ),
  criminal: svg(
    '<circle cx="6.7" cy="6.7" r="4.1" fill="none" stroke="currentColor" stroke-width="2"/><path d="m9.7 9.7 4.4 4.4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  ),
  special: svg(
    '<circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7.2.8h1.6v4H7.2zm0 10.4h1.6v4H7.2zM.8 7.2h4v1.6h-4zm10.4 0h4v1.6h-4z"/><circle cx="8" cy="8" r="1.4"/>',
  ),
  heli: svg(
    '<path d="M1.5 2.2h11.2v1.3H1.5z"/><path d="M6.4 3.4h1.3v1.6H6.4z"/><path d="M6.1 4.8h2.4c2.6 0 4.3 1.6 4.3 3.6 0 1.4-1 2.4-2.6 2.4H6.6c-1.9 0-3-1.1-3.1-2.6H1V6.9h2.6c.4-1.3 1.3-2.1 2.5-2.1"/><path d="M5 12.4h6.8v1.2H5z"/><path d="M6.5 10.6h1.2v2H6.5zm3 0h1.2v2H9.5z"/>',
  ),
  border: svg('<path d="M2.6 1.2h1.5v13.6H2.6z"/><path d="M4.1 2h9.4l-2.1 3.1 2.1 3.1H4.1z"/>'),
  aux: svg('<path d="m8 .9 2.1 4.5 4.9.6-3.6 3.4.9 4.9L8 11.9l-4.3 2.4.9-4.9L1 6l4.9-.6z"/>'),
  community: svg('<circle cx="8" cy="4.5" r="2.8"/><path d="M2.6 14.4c.4-3.1 2.6-5.2 5.4-5.2s5 2.1 5.4 5.2z"/>'),
  transport: svg(
    '<path fill-rule="evenodd" d="M1.2 4.2h8.9l2.7 3.2 1.9.7V12h-1.2a1.8 1.8 0 0 1-3.6 0H6a1.8 1.8 0 0 1-3.6 0H1.2zm9.4 1.5v2.1h1.7zM2.6 5.6v2.3h1.4V5.6zm2.6 0v2.3h1.4V5.6zm2.6 0v2.3h1.3V5.6z"/>',
  ),
  boat: svg('<path d="M1.6 9.4h12.8l-2 3.9H3.6z"/><path d="M7.3 1.8h1.3v7H7.3z"/><path d="m8.6 2.6 4.2 5.4H8.6zM6.9 4.4 3.6 8h3.3z"/>'),
};

export const SIREN_GLYPH = svg(
  '<path d="M4.2 8.4a3.8 3.8 0 0 1 7.6 0V12H4.2z"/><path d="M2.6 12.6h10.8v1.8H2.6zM7.3.8h1.4v2.3H7.3zM1.7 3.2l1-1 1.7 1.6-1 1zm10.6-1 1 1-1.7 1.6-1-1z"/>',
);

export const SUSPECT_GLYPH = svg(
  '<path fill-rule="evenodd" d="M5.2 1.6h5.6c.9 0 1.6.7 1.6 1.6v9.6c0 .9-.7 1.6-1.6 1.6H5.2c-.9 0-1.6-.7-1.6-1.6V3.2c0-.9.7-1.6 1.6-1.6m.4 2.6.6 2h3.6l.6-2zm0 7.8.6-1.8h3.6l.6 1.8z"/>',
);

const STROKE = ' fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"';

/** Vehicles of the other agencies (agencies.ts): what each one is, readable at marker size. */
export const AGENCY_GLYPHS: Record<Agency, string> = {
  // Van with a cross.
  kiirabi: svg(
    '<path fill-rule="evenodd" d="M.9 3.3h9.6l2.6 3.5 2 .7v4.6h-1.2a1.8 1.8 0 0 1-3.6 0H5.7a1.8 1.8 0 0 1-3.6 0H.9zm10.4 1.9v2h1.5zM4.6 4.9v1.6H3v1.7h1.6v1.6h1.7V8.2h1.6V6.5H6.3V4.9z"/>',
  ),
  // Fire engine with a ladder on the roof.
  paaste: svg(
    '<path d="M1 2.6h8.4v.9H1zm0 1.9h8.4v.9H1zM2.3 3.5h.8v1h-.8zm2.5 0h.8v1h-.8zm2.5 0h.8v1h-.8z"/><path fill-rule="evenodd" d="M.8 6.3h9.8V4.6h2.2l2.4 3.1v4.4h-1.1a1.8 1.8 0 0 1-3.6 0H5.7a1.8 1.8 0 0 1-3.6 0H.8zm10.7-.3v1.9h1.5z"/>',
  ),
  // Lifeboat with a wheelhouse.
  merepaaste: svg(
    '<path d="M.9 9h14.2l-2.3 4.3H3.4z"/><path fill-rule="evenodd" d="M4.2 4.6h5.4l1.9 3.6H4.2zm1.2 1v1.6h1.5V5.6zm2.4 0v1.6h1.9l-.8-1.6z"/><path d="M6.6 1.6h1.2v3H6.6z"/>',
  ),
  // Grown-up and child.
  sotsiaal: svg(
    '<circle cx="5.1" cy="3.5" r="2.1"/><path d="M1.4 14c.2-3.9 1.5-6.3 3.7-6.3s3.5 2.4 3.7 6.3z"/><circle cx="11.9" cy="7.2" r="1.7"/><path d="M9.4 14c.2-2.6 1.1-4.3 2.5-4.3s2.3 1.7 2.5 4.3z"/>',
  ),
  // Town hall.
  kov: svg(
    '<path d="M8 1.4 1.3 5.2v1.3h13.4V5.2z"/><path d="M2.4 7.4h1.8v4.8H2.4zm3.1 0h1.8v4.8H5.5zm3.2 0h1.8v4.8H8.7zm3.1 0h1.8v4.8h-1.8z"/><path d="M1 12.9h14v1.7H1z"/>',
  ),
  // Spruce.
  keskkonnaamet: svg('<path d="M8 .8 3.4 6h2.3L2.4 10.2h3L1.6 13h5.5v2.2h1.8V13h5.5l-3.8-2.8h3L10.3 6h2.3z"/>'),
  // Paw with a cross.
  veterinaar: svg(
    '<ellipse cx="7" cy="11.2" rx="3.1" ry="2.6"/><ellipse cx="2.9" cy="7.8" rx="1.3" ry="1.6"/><ellipse cx="5.3" cy="5" rx="1.3" ry="1.6"/><ellipse cx="8.7" cy="5" rx="1.3" ry="1.6"/><ellipse cx="11.1" cy="7.8" rx="1.3" ry="1.6"/><path d="M12.6.8H14v1.7h1.7v1.4H14v1.7h-1.4V3.9h-1.7V2.5h1.7z"/>',
  ),
  // Parcel.
  tolliamet: svg(`<path d="M8 1.5 14.5 4.7v6.6L8 14.5l-6.5-3.2V4.7z"${STROKE}/><path d="M1.8 4.9 8 8l6.2-3.1M8 8v6.3"${STROKE}/>`),
  // Road with lane marks.
  transpordiamet: svg(
    '<path fill-rule="evenodd" d="M5.6 1.2h4.8l4.4 13.6H1.2zm1.7 1.6v2.1h1.4V2.8zm-.4 4v2.6h2.2V6.8zm-.5 4.4v2.4h3.2v-2.4z"/>',
  ),
  // Unmarked car.
  kapo: svg(
    '<path fill-rule="evenodd" d="M4.6 4.6h5.2l2.6 2.8 2 .5c.5.1.9.6.9 1.1v2.5h-1.4a1.8 1.8 0 0 1-3.5 0H5.7a1.8 1.8 0 0 1-3.5 0H.9V8.6c0-.5.3-.9.8-1zm.6 1.1L3.9 7.4h3.4V5.7zm3.3 0v1.7h2.6L9.6 5.7z"/>',
  ),
};
