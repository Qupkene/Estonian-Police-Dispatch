// The duty map's key (Valvekaart): what the map shows for this player, the borders and a scale bar. Shared by
// the main menu and the career screen; styles in vk.css.
import type { ReactNode } from 'react';
import { useT } from '@/i18n';
import type { DutyInput } from './dutyMap';

export function MapLegend({
  input,
  compact,
  pxPerKm,
  km = 50,
  className,
  offerLabel,
}: {
  input: DutyInput;
  /** The phone strip: the player's marks only, no borders or scale. */
  compact: boolean;
  /** Screen pixels per kilometre at the map's scale, for the scale bar. */
  pxPerKm: number;
  /** Length of the scale bar. */
  km?: number;
  className?: string;
  /** The hatched sectors' name in the key (default "Pakkumine"). */
  offerLabel?: string;
}) {
  const t = useT();
  const items: ReactNode[] = [];
  if (input.mine.length)
    items.push(
      <li key="mine">
        <span className="vk-legend__mine" aria-hidden="true" />
        {t('shell.menu.legend.mine')}
      </li>,
    );
  if (input.whole.length)
    items.push(
      <li key="whole">
        <span className="vk-legend__whole" aria-hidden="true" />
        {t('shell.menu.legend.whole')}
      </li>,
    );
  if (input.offered.length)
    items.push(
      <li key="offer">
        <span className="vk-legend__offer" aria-hidden="true" />
        {offerLabel ?? t('shell.menu.legend.offer')}
      </li>,
    );
  if (input.others?.length)
    items.push(
      <li key="colleague">
        <span className="vk-legend__colleague" aria-hidden="true" />
        {t('shell.menu.legend.colleague')}
      </li>,
    );
  if (input.challenge)
    items.push(
      <li key="challenge">
        <svg className="vk-mark" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.2" />
          <circle cx="7" cy="7" r="2" />
        </svg>
        {t('shell.menu.legend.challenge')}
      </li>,
    );
  if (!compact) {
    const sector = input.home ? (
      <li key="sector">
        <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden="true">
          <path className="vk-legend__sector" d="M1 3H21" />
        </svg>
        {t('shell.menu.legend.sector')}
      </li>
    ) : null;
    const pref = (
      <li key="pref">
        <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden="true">
          <path className="vk-legend__pref" d="M0 3H22" />
        </svg>
        {t('shell.menu.legend.pref')}
      </li>
    );
    // The career screen (colleagues named) reads from the sector out, the menu from the prefecture in.
    items.push(...(input.others ? [sector, pref] : [pref, sector]));
    const half = (km / 2) * pxPerKm;
    items.push(
      <li key="scale" className="vk-legend__scale">
        <svg
          width={Math.round(half * 2 + 22)}
          height="22"
          viewBox={`0 0 ${half * 2 + 22} 22`}
          role="img"
          aria-label={t('shell.menu.legend.scale', { km })}
        >
          <rect x="1" y="14" width={half} height="4" className="vk-legend__bar" />
          <rect x={1 + half} y="14.5" width={half} height="3" className="vk-legend__bar is-open" />
          <text x="1" y="10">
            0
          </text>
          <text x={1 + half} y="10" textAnchor="middle">
            {km / 2}
          </text>
          <text x={1 + half * 2} y="10" textAnchor="middle">
            {km} km
          </text>
        </svg>
      </li>,
    );
  }
  if (!items.length) return null;
  return (
    <ul
      className={`vk-legend${compact ? ' is-compact' : ' vk-panel'}${className ? ' ' + className : ''}`}
      aria-label={t('shell.menu.legend')}
    >
      {items}
    </ul>
  );
}
