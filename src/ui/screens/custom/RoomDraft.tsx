// Kohandatud mäng in a race or sector room: every player drafts their own force (a sector player: for their desk).
// An officer belongs to one player of the room; the others' picks show as taken. Saved with POST /rooms/{code}/custom.
import { useState } from 'react';
import { useT } from '@/i18n';
import { budgetOf, costOf, defaultSetup, type CustomSetup } from '@/sim/custom';
import { meIn, type Room } from '@/net/rooms';
import { Button, Modal } from '@/ui/components';
import { VkLayer } from '../shell/VkLayer';
import { deskOfPlayer } from '../shell/LobbyDesks';
import { CustomEditor } from './CustomEditor';

/** The area a player drafts for: a sector player's desk, else the room's sector or the whole prefecture. */
export function draftArea(room: Pick<Room, 'mode' | 'options' | 'players' | 'me'>): string[] {
  const me = room.players.find((p) => p.id === room.me);
  if (room.mode === 'sector') return me ? [deskOfPlayer(room, me)] : [];
  return room.options.sector ? [room.options.sector] : [];
}

/** Officers the other players of the room drafted: pool index → their name. */
export function takenBy(room: Pick<Room, 'players' | 'me'>): Map<number, string> {
  const out = new Map<number, string>();
  for (const p of room.players) {
    if (p.id === room.me || p.left || !p.custom) continue;
    for (const [, , ...picks] of p.custom.crews) for (const i of picks) out.set(i, p.name);
  }
  return out;
}

export function RoomDraft({
  room,
  busy,
  onSave,
}: {
  room: Room;
  busy: boolean;
  onSave: (c: CustomSetup) => void;
}) {
  const t = useT();
  const me = meIn(room);
  const [editing, setEditing] = useState<CustomSetup | null>(null);
  if (!me || room.state !== 'lobby' || !room.options.custom || room.mode === 'role') return null;
  const area = draftArea(room);
  const region = room.options.regionId;
  const ok =
    !!editing &&
    editing.crews.length > 0 &&
    !(editing.budget !== false && costOf(region, editing) > budgetOf(region, area));
  const n = me.custom?.crews.length ?? 0;
  return (
    <div className="vk-mp__draft" data-testid="room-draft">
      <span className="vk-label">{t('custom.room.mine')}</span>
      <p className="vk-mp__draftLine">
        {n
          ? t('custom.room.mineN', { n })
          : t(room.mode === 'sector' ? 'custom.room.mineNoneDesk' : 'custom.room.mineNone')}
      </p>
      <button
        type="button"
        className="vk-btn"
        disabled={busy}
        onClick={() =>
          setEditing(
            me.custom ?? { ...defaultSetup(region, area), budget: room.options.custom?.budget !== false },
          )
        }
      >
        {t('custom.room.draft')}
      </button>
      {editing && (
        <VkLayer>
          <Modal
            open
            onClose={() => setEditing(null)}
            title={t('custom.room.mine')}
            width={1180}
            footer={
              <Button
                variant="primary"
                disabled={!ok || busy}
                onClick={() => {
                  onSave(editing);
                  setEditing(null);
                }}
              >
                {t('custom.room.done')}
              </Button>
            }
          >
            <div className="vk-mp__customEdit">
              <CustomEditor
                regionId={region}
                sectors={area}
                value={editing}
                onChange={setEditing}
                taken={takenBy(room)}
              />
            </div>
          </Modal>
        </VkLayer>
      )}
    </div>
  );
}
