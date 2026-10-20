// Sektorid (sector co-op, docs/MULTIPLAYER.md section 8) in the lobby: the host picks 2-4 neighbouring sectors of the
// prefecture on its map (like the career's sector map), each player picks the desk they run, and the line-up says
// which desk an AI colleague holds. The lists next to the map are the real controls; the map is a pointer shortcut.
import { useT, useTx } from '@/i18n';
import { sectorById, sectorsOf } from '@/sim/sectors';
import { addableDesks, defaultDesk, defaultDesks, removableDesk, validDesks } from '@/sim/desks';
import type { RoomOptions } from '@/sim/room';
import { meIn, present, type Room, type RoomPlayer } from '@/net/rooms';
import { SectorMap, type SectorPaint } from '../career/SectorMap';
import { colleagueName } from '../career/sectors';

/** The desks of the options, or the prefecture's default pair. */
export function desksOf(o: Pick<RoomOptions, 'regionId' | 'desks'>): string[] {
  return validDesks(o.regionId, o.desks) ?? defaultDesks(o.regionId);
}

/** Options with a desk list (the first desk is also the room's `sector`). */
export function withDesks(o: RoomOptions, desks: string[]): RoomOptions {
  return { ...o, desks, sector: desks[0] ?? o.sector };
}

/** A player's desk: the one they picked if the room has it, else their seat's default (the server's rule). */
export function deskOfPlayer(room: Pick<Room, 'options'>, p: Pick<RoomPlayer, 'desk' | 'seat'>): string {
  const desks = room.options.desks ?? [];
  return p.desk && desks.includes(p.desk) ? p.desk : defaultDesk(desks, p.seat);
}

/** The host's desk choice: the prefecture's map with the chosen desks and a toggle per sector. */
export function DeskOptions({
  value,
  onChange,
  disabled,
}: {
  value: RoomOptions;
  onChange: (o: RoomOptions) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const tx = useTx();
  const desks = desksOf(value);
  const addable = new Set(addableDesks(value.regionId, desks));
  const toggle = (id: string) => {
    if (disabled) return;
    if (desks.includes(id)) {
      if (removableDesk(desks, id))
        onChange(
          withDesks(
            value,
            desks.filter((x) => x !== id),
          ),
        );
    } else if (addable.has(id)) {
      const next = validDesks(value.regionId, [...desks, id]);
      if (next) onChange(withDesks(value, next));
    }
  };
  const paint: Record<string, SectorPaint> = {};
  for (const x of sectorsOf(value.regionId))
    paint[x.id] = desks.includes(x.id) ? 'picked' : addable.has(x.id) ? 'pickable' : 'other';
  return (
    <div className="vk-mp__desks" data-testid="desk-options">
      <div className="vk-mp__deskMap">
        <SectorMap
          regionId={value.regionId}
          paint={paint}
          labels="mine"
          onPick={disabled ? undefined : toggle}
        />
      </div>
      <div className="vk-mp__deskList" role="group" aria-label={t('desk.opt.desks')}>
        {sectorsOf(value.regionId).map((x) => {
          const on = desks.includes(x.id);
          const can = on ? removableDesk(desks, x.id) : addable.has(x.id);
          return (
            <button
              key={x.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={disabled || !can}
              className={`vk-mp__desk${on ? ' is-on' : ''}`}
              data-sector={x.id}
              title={t(on ? 'desk.opt.remove' : 'desk.opt.add', { name: tx(x.name) })}
              onClick={() => toggle(x.id)}
            >
              <span className="vk-mp__check" aria-hidden="true" />
              {tx(x.name)}
            </button>
          );
        })}
        <p className="vk-mp__hint">{t('desk.opt.hint')}</p>
      </div>
    </div>
  );
}

/** The desks as read-only lines with the map (players other than the host, a started room). */
export function DeskSummary({ room }: { room: Pick<Room, 'options' | 'players' | 'me'> }) {
  const tx = useTx();
  const desks = desksOf(room.options);
  const me = room.players.find((p) => p.id === room.me);
  const mine = me ? deskOfPlayer(room, me) : '';
  const paint: Record<string, SectorPaint> = {};
  for (const id of desks) paint[id] = id === mine ? 'mine' : 'picked';
  return (
    <div className="vk-mp__deskMap vk-mp__deskMap--summary">
      <SectorMap regionId={room.options.regionId} paint={paint} labels="mine" />
      <span className="vk-sr">
        {desks.map((id) => tx(sectorById(id)?.name ?? { et: id, en: id })).join(', ')}
      </span>
    </div>
  );
}

/** Each player's desk, and what the line-up means (who runs a desk nobody picked). */
export function DeskPicker({
  room,
  busy,
  onPick,
}: {
  room: Room;
  busy: boolean;
  onPick: (desk: string) => void;
}) {
  const t = useT();
  const tx = useTx();
  const me = meIn(room);
  if (!me || room.state !== 'lobby') return null;
  const desks = desksOf(room.options);
  const here = present(room);
  const mine = deskOfPlayer(room, me);
  const at = (d: string) => here.filter((p) => deskOfPlayer(room, p) === d);
  const free = desks.filter((d) => !at(d).length);
  return (
    <div className="vk-mp__roles" data-testid="desk-picker">
      <span className="vk-label" id="vk-mp-desk">
        {t('desk.pick')}
      </span>
      <div className="vk-mp__modes" role="radiogroup" aria-labelledby="vk-mp-desk">
        {desks.map((d) => {
          const sec = sectorById(d);
          const who = at(d);
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={mine === d}
              disabled={busy}
              className={`vk-mp__mode${mine === d ? ' is-active' : ''}`}
              data-sector={d}
              onClick={() => mine !== d && onPick(d)}
            >
              <span className="vk-mp__modeHead">
                <span className="vk-mp__radio" aria-hidden="true" />
                <strong>{sec ? tx(sec.name) : d}</strong>
                <span className="vk-dim">
                  {who.length ? who.map((p) => p.name).join(', ') : t('desk.pick.nobody')}
                </span>
              </span>
              {sec && <span className="vk-mp__modeDesc">{tx(sec.blurb)}</span>}
            </button>
          );
        })}
      </div>
      <p className="vk-mp__hint" data-testid="desk-hint">
        {free.length
          ? t('desk.hint.ai', { names: free.map((d) => colleagueName(sectorById(d))).join(', ') })
          : t('desk.hint.all')}
      </p>
    </div>
  );
}
