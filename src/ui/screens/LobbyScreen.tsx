// Mitmikmäng (docs/MULTIPLAYER.md): create a room or join one with its code, the lobby (the code, the players and
// their ready marks, the host's options, the start) and, once the shift is on, the way into it and the room's board.
// Accounts only: a guest gets a sign-in hint. Owned by ui-shell.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadAutosave, useGame } from '@/store/game';
import { useAccount } from '@/net/account';
import {
  createRoom,
  fetchMyRoom,
  isHost,
  joinRoom,
  leaveRoom,
  meIn,
  myResult,
  pollRoom,
  present,
  reopenRoom,
  roomErrorKey,
  RoomPoller,
  roomShiftOf,
  setRoomCustom,
  setRoomReady,
  startBlock,
  startRoom,
  updateRoomOptions,
  type Room,
} from '@/net/rooms';
import { useLang, useT, useTx } from '@/i18n';
import { sfx } from '@/audio/sfx';
import { sectorsOf, starterSectors } from '@/sim/sectors';
import {
  customForMode,
  DEFAULT_ROOM_OPTIONS,
  displayRoomCode,
  markRoom,
  normalizeRoomCode,
  isCoopMode,
  OPEN_ROOM_MODES,
  ROOM_DIFFICULTIES,
  ROOM_HOURS,
  ROOM_SLOTS,
  roomCodeOf,
  roomShiftOptions,
  roomStart,
  type RoomMode,
  type RoomOptions,
} from '@/sim/room';
import { hhmm, HOUR } from '@/sim/time';
import { COOP_ROLES, DEFAULT_ROLES, type CoopRole } from '@/sim/coop';
import { setRoomDesk, setRoomRole } from '@/net/coop';
import { defaultDesks } from '@/sim/desks';
import { sectorById } from '@/sim/sectors';
import { startCoop } from '@/store/coop';
import type { Difficulty, RegionId } from '@/sim/types';
import { Button, Modal, Segmented, Select, Spinner } from '@/ui/components';
import { ShellPage, useToast } from './shell/ShellPage';
import { regionSummary } from './shell/helpers';
import { lobbyFocus } from './shell/lobbyNav';
import { boardCount, ResultsBoard, RoomBoard } from './shell/RoomBoard';
import { VkLayer } from './shell/VkLayer';
import { DeskOptions, DeskPicker, DeskSummary, deskOfPlayer, desksOf, withDesks } from './shell/LobbyDesks';
import { CustomEditor } from './custom/CustomEditor';
import { RoomDraft } from './custom/RoomDraft';
import { adaptSetup, budgetOf, costOf, defaultSetup, type CustomSetup } from '@/sim/custom';
import './shell/lobby.css';

const REGIONS: RegionId[] = ['pohja', 'ida', 'louna', 'laane'];
const MODES: RoomMode[] = ['race', 'role', 'sector'];

/** Options for a prefecture: its first starter sector, as a new career would get, and its default desks. */
function optionsFor(regionId: RegionId, prev: RoomOptions): RoomOptions {
  const first = starterSectors(regionId)[0] ?? sectorsOf(regionId)[0];
  // A custom force belongs to its prefecture's stations and officers: another prefecture starts from the standard.
  const { custom: _custom, ...rest } = prev;
  void _custom;
  return { ...rest, regionId, sector: first?.id ?? '', desks: defaultDesks(regionId) };
}

/** The area a room's shift covers (a sector room: its desks; otherwise its sector or the whole prefecture). */
function roomArea(o: RoomOptions, mode: RoomMode): string[] {
  return mode === 'sector' ? desksOf(o) : o.sector ? [o.sector] : [];
}

/** What a room of this mode is created with: a sector room carries its desks (the first is its sector). */
function optionsForMode(mode: RoomMode, o: RoomOptions): RoomOptions {
  return mode === 'sector' ? withDesks(o, desksOf(o)) : o;
}

/** The options when the host switches the room to another mode in the lobby (the custom force follows the mode). */
function switchMode(mode: RoomMode, o: RoomOptions): RoomOptions {
  const { custom, ...rest } = o;
  const next = customForMode(mode, custom);
  return optionsForMode(mode, next ? { ...rest, custom: next } : rest);
}

export function LobbyScreen() {
  const t = useT();
  const backend = useAccount((s) => s.backend);
  const account = useAccount((s) => s.user);
  const gameUser = useGame((s) => s.user);
  const setScreen = useGame((s) => s.setScreen);
  const loggedIn = !!account && gameUser?.method === 'account';
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    void useAccount.getState().init();
  }, []);

  // The room to show: the one the lobby was opened for (a report's), else the player's open room.
  useEffect(() => {
    if (!loggedIn || backend !== 'online') {
      setLoading(backend === 'unknown');
      return;
    }
    let alive = true;
    setLoading(true);
    const focus = lobbyFocus();
    const load = focus ? pollRoom(focus).then((r) => r.room) : fetchMyRoom();
    load
      .then((r) => alive && setRoom(r))
      .catch(() => alive && setRoom(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [loggedIn, backend]);

  const subtitle = room
    ? t('rooms.sub.room', { code: displayRoomCode(room.code), state: t(`rooms.state.${room.state}`) })
    : t('rooms.sub');

  let body: ReactNode;
  if (backend === 'offline') body = <Notice title={t('rooms.title')} text={t('rooms.offline')} />;
  else if (!loggedIn)
    body = (
      <Notice
        title={t('rooms.guest.title')}
        text={t('rooms.guest.text')}
        action={
          <button type="button" className="vk-btn vk-btn--primary" onClick={() => setScreen('login')}>
            {t('rooms.guest.signin')}
          </button>
        }
        testid="rooms-guest"
      />
    );
  else if (loading)
    body = (
      <p className="vk-mp__state" role="status">
        <Spinner size={14} /> {t('rooms.loading')}
      </p>
    );
  else if (!room) body = <NoRoom onRoom={setRoom} error={error} setError={setError} />;
  else
    body = (
      <RoomView
        key={room.code}
        initial={room}
        onRoom={setRoom}
        onLeft={() => {
          setRoom(null);
          setError(null);
        }}
        toast={toast.show}
      />
    );

  return (
    <ShellPage title={t('rooms.title')} subtitle={subtitle} backTo="menu" onBack={() => setScreen('menu')}>
      {toast.node}
      {body}
    </ShellPage>
  );
}

function Notice({
  title,
  text,
  action,
  testid,
}: {
  title: string;
  text: string;
  action?: ReactNode;
  testid?: string;
}) {
  return (
    <section className="vk-panel vk-mp__notice" aria-labelledby="vk-mp-notice" data-testid={testid}>
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-mp-notice">
          {title}
        </h2>
      </div>
      <div className="vk-panel__body">
        <p>{text}</p>
      </div>
      {action && <div className="vk-panel__foot">{action}</div>}
    </section>
  );
}

// ── No room yet: create one or join with a code ─────────────────────────────

function NoRoom({
  onRoom,
  error,
  setError,
}: {
  onRoom: (r: Room) => void;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<RoomMode>('race');
  const [opts, setOpts] = useState<RoomOptions>(() => ({
    ...DEFAULT_ROOM_OPTIONS,
    desks: defaultDesks(DEFAULT_ROOM_OPTIONS.regionId),
  }));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const create = async () => {
    if (busy) return;
    setBusy('create');
    setError(null);
    try {
      onRoom(await createRoom(mode, optionsForMode(mode, opts)));
      sfx.play('click');
    } catch (e) {
      sfx.play('error');
      setError(t(roomErrorKey(e)));
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    if (busy) return;
    if (!normalizeRoomCode(code)) {
      setJoinError(t('rooms.err.bad_code'));
      return;
    }
    setBusy('join');
    setJoinError(null);
    try {
      onRoom(await joinRoom(code));
      sfx.play('click');
    } catch (e) {
      sfx.play('error');
      setJoinError(t(roomErrorKey(e)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="vk-mp">
      <section className="vk-panel vk-mp__create" aria-labelledby="vk-mp-create">
        <div className="vk-panel__head">
          <h2 className="vk-h" id="vk-mp-create">
            {t('rooms.create.title')}
          </h2>
          <span className="vk-meta">{t('rooms.create.meta')}</span>
        </div>
        <ModePicker value={mode} onChange={setMode} />
        <OptionsForm value={opts} onChange={setOpts} mode={mode} />
        <p className="vk-mp__hint">{t('rooms.opt.hint')}</p>
        {error && (
          <p className="vk-msg is-bad vk-mp__err" role="alert">
            {error}
          </p>
        )}
        <div className="vk-panel__foot">
          <button
            type="button"
            className="vk-btn vk-btn--primary"
            onClick={() => void create()}
            disabled={!!busy || !OPEN_ROOM_MODES.includes(mode)}
            data-sfx="click"
          >
            {busy === 'create' && <Spinner size={13} />}
            {t('rooms.create.go')}
          </button>
        </div>
      </section>

      <div className="vk-mp__col">
        <section className="vk-panel" aria-labelledby="vk-mp-join">
          <div className="vk-panel__head">
            <h2 className="vk-h" id="vk-mp-join">
              {t('rooms.join.title')}
            </h2>
          </div>
          <form
            className="vk-mp__join"
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
            noValidate
          >
            <label className="vk-label" htmlFor="vk-mp-code">
              {t('rooms.join.label')}
            </label>
            <div className="vk-mp__joinRow">
              <input
                id="vk-mp-code"
                className="vk-mp__codeInput"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setJoinError(null);
                }}
                placeholder={t('rooms.join.placeholder')}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={9}
                aria-invalid={joinError ? true : undefined}
                aria-describedby="vk-mp-code-hint"
              />
              <button type="submit" className="vk-btn vk-btn--primary" disabled={!!busy}>
                {busy === 'join' && <Spinner size={13} />}
                {t('rooms.join.go')}
              </button>
            </div>
            {joinError ? (
              <p className="vk-msg is-bad" role="alert" id="vk-mp-code-hint">
                {joinError}
              </p>
            ) : (
              <p className="vk-mp__hint" id="vk-mp-code-hint">
                {t('rooms.join.hint')}
              </p>
            )}
          </form>
        </section>
        <section className="vk-panel" aria-labelledby="vk-mp-how">
          <div className="vk-panel__head">
            <h2 className="vk-h" id="vk-mp-how">
              {t('rooms.how.title')}
            </h2>
          </div>
          <ol className="vk-mp__how">
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <span className="vk-mp__step vk-mono" aria-hidden="true">
                  {n}
                </span>
                <span>{t(`rooms.how.${n}`)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function ModePicker({ value, onChange }: { value: RoomMode; onChange: (m: RoomMode) => void }) {
  const t = useT();
  return (
    <div className="vk-mp__modes" role="radiogroup" aria-label={t('rooms.mode')}>
      {MODES.map((m) => {
        const open = OPEN_ROOM_MODES.includes(m);
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!open}
            className={`vk-mp__mode${active ? ' is-active' : ''}`}
            onClick={() => onChange(m)}
          >
            <span className="vk-mp__modeHead">
              <span className="vk-mp__radio" aria-hidden="true" />
              <strong>{t(`rooms.mode.${m}`)}</strong>
              {!open && <span className="vk-mp__soon">{t('rooms.mode.soon')}</span>}
            </span>
            <span className="vk-mp__modeDesc">{t(`rooms.mode.${m}.desc`)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The shift's options: prefecture, area (a sector room: its desks), difficulty, length and time of day. In a room's
 * lobby (`onMode`) the host switches the mode here too.
 */
function OptionsForm({
  value,
  onChange,
  disabled,
  mode,
  onMode,
}: {
  value: RoomOptions;
  onChange: (o: RoomOptions) => void;
  disabled?: boolean;
  mode: RoomMode;
  onMode?: (m: RoomMode) => void;
}) {
  const t = useT();
  const tx = useTx();
  const sectors = sectorsOf(value.regionId);
  // A custom force follows the area: crews of a sector that is no longer in it move to one that is.
  const emit = (o: RoomOptions) =>
    onChange(o.custom ? { ...o, custom: adaptSetup(o.regionId, roomArea(o, mode), o.custom) } : o);
  const [editing, setEditing] = useState<CustomSetup | null>(null);
  const area = roomArea(value, mode);
  const draftOk =
    !!editing &&
    editing.crews.length > 0 &&
    !(editing.budget !== false && costOf(value.regionId, editing) > budgetOf(value.regionId, area));
  const row = (label: string, control: ReactNode) => (
    <div className="vk-mp__field">
      <span className="vk-label">{label}</span>
      <div>{control}</div>
    </div>
  );
  return (
    <div className="vk-mp__form" aria-disabled={disabled || undefined}>
      {onMode &&
        row(
          t('rooms.mode'),
          <Segmented<RoomMode>
            size="sm"
            label={t('rooms.mode')}
            value={mode}
            onChange={(m) => m !== mode && onMode(m)}
            options={MODES.map((m) => ({
              value: m,
              label: t(`rooms.mode.${m}`),
              disabled: disabled || !OPEN_ROOM_MODES.includes(m),
            }))}
          />,
        )}
      {row(
        t('rooms.opt.region'),
        <Segmented<RegionId>
          size="sm"
          label={t('rooms.opt.region')}
          value={value.regionId}
          onChange={(r) => onChange(optionsFor(r, value))}
          options={REGIONS.map((r) => ({ value: r, label: t(`account.lb.region.${r}`), disabled }))}
        />,
      )}
      {mode === 'sector' ? (
        <div className="vk-mp__field vk-mp__field--desks">
          <span className="vk-label">{t('desk.opt.desks')}</span>
          <DeskOptions value={value} onChange={emit} disabled={disabled} />
        </div>
      ) : row(
        t('rooms.opt.sector'),
        <Select<string>
          label={<span className="vk-sr">{t('rooms.opt.sector')}</span>}
          value={value.sector}
          disabled={disabled}
          onChange={(sector) => emit({ ...value, sector })}
          options={[
            ...sectors.map((x) => ({ value: x.id, label: tx(x.name) })),
            { value: '', label: t('rooms.opt.whole') },
          ]}
        />,
      )}
      {row(
        t('rooms.opt.difficulty'),
        <Segmented<Difficulty>
          size="sm"
          label={t('rooms.opt.difficulty')}
          value={value.difficulty}
          onChange={(difficulty) => onChange({ ...value, difficulty })}
          options={ROOM_DIFFICULTIES.map((d) => ({ value: d, label: t(`shell.diff.${d}`), disabled }))}
        />,
      )}
      {row(
        t('rooms.opt.hours'),
        <Segmented<string>
          size="sm"
          label={t('rooms.opt.hours')}
          value={String(value.hours)}
          onChange={(h) => onChange({ ...value, hours: Number(h) })}
          options={ROOM_HOURS.map((h) => ({
            value: String(h),
            label: t('rooms.opt.hoursN', { n: h }),
            disabled,
          }))}
        />,
      )}
      {row(
        t('rooms.opt.slot'),
        <Segmented<RoomOptions['slot']>
          size="sm"
          label={t('rooms.opt.slot')}
          value={value.slot}
          onChange={(slot) => onChange({ ...value, slot })}
          options={ROOM_SLOTS.map((s) => ({ value: s, label: t(`daily.slot.${s}`), disabled }))}
        />,
      )}
      {row(
        t('custom.room.force'),
        <div className="vk-mp__force">
          <Segmented<'standard' | 'custom'>
            size="sm"
            label={t('custom.room.force')}
            value={value.custom ? 'custom' : 'standard'}
            onChange={(v) => {
              if (v === 'standard') {
                const { custom: _c, ...rest } = value;
                void _c;
                onChange(rest);
              } else if (mode === 'role') setEditing(defaultSetup(value.regionId, area));
              // A race or sector room: custom forces on, every player drafts their own (RoomDraft).
              else onChange({ ...value, custom: { crews: [], budget: true } });
            }}
            options={[
              { value: 'standard', label: t('custom.room.standard'), disabled },
              { value: 'custom', label: t('custom.room.custom'), disabled },
            ]}
          />
          {value.custom && mode === 'role' && (
            <button type="button" className="vk-linkbtn" disabled={disabled} onClick={() => setEditing(value.custom!)}>
              {t('custom.room.edit', { n: value.custom.crews.length })}
            </button>
          )}
        </div>,
      )}
      {value.custom && mode !== 'role' && (
        <p className="vk-mp__hint vk-mp__hint--inline">
          {t(mode === 'sector' ? 'custom.room.eachSector' : 'custom.room.each')}
        </p>
      )}
      {editing && (
        <VkLayer>
          <Modal
            open
            onClose={() => setEditing(null)}
            title={t('custom.title')}
            width={1180}
            footer={
              <Button
                variant="primary"
                disabled={!draftOk}
                onClick={() => {
                  onChange({ ...value, custom: editing });
                  setEditing(null);
                }}
              >
                {t('custom.room.done')}
              </Button>
            }
          >
            <div className="vk-mp__customEdit">
              <CustomEditor regionId={value.regionId} sectors={area} value={editing} onChange={setEditing} />
            </div>
          </Modal>
        </VkLayer>
      )}
    </div>
  );
}

/** The options as read-only lines (players other than the host, and a started room). */
function OptionsSummary({ o, room }: { o: RoomOptions; room?: Room }) {
  const t = useT();
  const lang = useLang();
  const tx = useTx();
  const sector = sectorsOf(o.regionId).find((x) => x.id === o.sector);
  const desks = room?.mode === 'sector' ? desksOf(o) : null;
  return (
    <dl className="vk-kv vk-mp__kv">
      {desks && room && (
        <div className="vk-mp__kvMap">
          <DeskSummary room={room} />
        </div>
      )}
      <div>
        <dt>{t(desks ? 'desk.opt.desks' : 'rooms.opt.sector')}</dt>
        <dd data-testid="room-area">
          {desks
            ? desks.map((id) => tx(sectorById(id)?.name ?? { et: id, en: id })).join(', ')
            : sector
              ? tx(sector.name)
              : t('rooms.opt.whole')}{' '}
          <span className="vk-dim">· {regionSummary(o.regionId).name[lang]}</span>
        </dd>
      </div>
      <div>
        <dt>{t('rooms.opt.difficulty')}</dt>
        <dd>{t(`shell.diff.${o.difficulty}`)}</dd>
      </div>
      <div>
        <dt>{t('rooms.opt.hours')}</dt>
        <dd className="vk-mono">{t('rooms.opt.hoursN', { n: o.hours })}</dd>
      </div>
      <div>
        <dt>{t('rooms.opt.slot')}</dt>
        <dd>{t(`daily.slot.${o.slot}`)}</dd>
      </div>
      {o.custom && (
        <div>
          <dt>{t('custom.room.force')}</dt>
          <dd data-testid="room-custom">
            {room && room.mode !== 'role'
              ? t(room.mode === 'sector' ? 'custom.room.eachSector' : 'custom.room.each')
              : t('custom.room.summary', { n: o.custom.crews.length })}
          </dd>
        </div>
      )}
    </dl>
  );
}

// ── In a room ────────────────────────────────────────────────────────────────

function RoomView({
  initial,
  onRoom,
  onLeft,
  toast,
}: {
  initial: Room;
  /** The room as it is now (the page's subtitle shows its state). */
  onRoom: (r: Room) => void;
  onLeft: () => void;
  toast: (text: string, tone?: 'ok' | 'gold' | 'danger' | 'info') => void;
}) {
  const t = useT();
  const gameUser = useGame((s) => s.user);
  const resumeShift = useGame((s) => s.resumeShift);
  const [room, setRoom] = useState<Room>(initial);
  useEffect(() => onRoom(room), [room]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const pollerRef = useRef<RoomPoller | null>(null);
  const seenLobby = useRef(initial.state === 'lobby');
  /** The round (its seed) this view sent the player into, so each round starts by itself only once. */
  const autoStarted = useRef<number | null>(null);
  /** The round this view asked to open again (once per round, docs/MULTIPLAYER.md section 11). */
  const reopened = useRef<number | null>(null);

  // A finished round opens again for the next one, so only a closed room stops being polled.
  const closed = room.state === 'closed';
  useEffect(() => {
    if (closed) return;
    const p = new RoomPoller({
      code: room.code,
      every: room.state === 'lobby' ? 1000 : 2000,
      onRoom: (r) => {
        setRoom(r);
        setError(null);
      },
      onError: (e, isGone) => {
        if (isGone) setGone(true);
        else setError(t(roomErrorKey(e)));
      },
    });
    pollerRef.current = p;
    p.start();
    return () => {
      p.stop();
      pollerRef.current = null;
    };
    // A new poller when the room moves from the lobby to the shift (slower) or is closed.
  }, [room.code, room.state === 'lobby', closed]);

  const host = isHost(room);
  const me = meIn(room);
  const mine = myResult(room);
  const shift = roomShiftOf(room);
  // Only a saved run of this round: an earlier round's shift of the same room is another shift.
  const saved = useMemo(() => {
    const s = loadAutosave();
    return s && roomCodeOf(s) === room.code && s.seed === room.seed ? s : null;
  }, [room.code, room.state, room.seed]);

  // Back in a room whose round is over: it opens for the next round, whoever of its players comes back first.
  const waiting = room.state === 'finished' && !!me && !me.left;
  const [reopenTry, setReopenTry] = useState(0);
  useEffect(() => {
    if (!waiting || reopened.current === room.round) return;
    reopened.current = room.round;
    reopenRoom(room.code, { round: room.round })
      .then((r) => {
        setRoom(r);
        pollerRef.current?.now();
      })
      .catch((e: unknown) => setError(t(roomErrorKey(e))));
  }, [waiting, room.code, room.round, reopenTry]);

  /** Into the room's shift: the saved run of it when there is one, else a new run from the room's seed. */
  const coop = isCoopMode(room.mode);
  const play = () => {
    if (!shift) return;
    if (coop) {
      // A shared shift: the room's latest snapshot and log (the first time, or back after a reload).
      startCoop(room.code, shift, room.engine)
        .then(() => sfx.play('dispatch'))
        .catch((e: unknown) => {
          sfx.play('error');
          setError(t(roomErrorKey(e)));
        });
      return;
    }
    if (saved) {
      resumeShift(saved);
      return;
    }
    try {
      // Kohandatud mäng: a race player commands the force they drafted.
      useGame.getState().startShift(roomShiftOptions(shift, gameUser?.name ?? 'Dispetšer', me?.custom));
      const sim = useGame.getState().sim;
      if (sim) markRoom(sim, room.code);
      sfx.play('dispatch');
    } catch (e) {
      sfx.play('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // The host started while we waited in the lobby: everybody goes on shift at once (every round).
  useEffect(() => {
    if (room.state === 'lobby') seenLobby.current = true;
    if (
      room.state === 'running' &&
      seenLobby.current &&
      autoStarted.current !== room.seed &&
      !mine &&
      me &&
      !me.left
    ) {
      autoStarted.current = room.seed;
      play();
    }
  });

  const act = async (fn: () => Promise<Room | void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (r) setRoom(r);
      pollerRef.current?.now();
    } catch (e) {
      sfx.play('error');
      setError(t(roomErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setConfirmLeave(false);
    setBusy(true);
    try {
      await leaveRoom(room.code);
    } catch {
      /* already gone: the room view closes either way */
    }
    setBusy(false);
    pollerRef.current?.stop();
    onLeft();
  };

  /** The host ends a round that waits for somebody: the room opens for the next one at once. */
  const endRound = () => {
    setConfirmEnd(false);
    void act(() => reopenRoom(room.code, { round: room.round, end: true }));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      toast(t('rooms.copied'), 'ok');
    } catch {
      toast(t('rooms.copyFailed'), 'info');
    }
  };

  if (gone)
    return (
      <Notice
        title={t('rooms.room')}
        text={t('rooms.gone')}
        action={
          <button type="button" className="vk-btn vk-btn--primary" onClick={onLeft}>
            {t('rooms.new')}
          </button>
        }
      />
    );

  const block = startBlock(room);
  const hostName = room.players.find((p) => p.host)?.name ?? '';
  const startTime = shift ? hhmm(roomStart(shift)) : null;

  return (
    <div className="vk-mp" data-testid="room" data-state={room.state}>
      <div className="vk-mp__col">
        <section className="vk-panel vk-mp__room" aria-labelledby="vk-mp-room">
          <div className="vk-panel__head vk-mp__boardHead">
            <h2 className="vk-h" id="vk-mp-room">
              {t('rooms.room')}
            </h2>
            <span className="vk-meta" data-testid="room-meta">
              {t(`rooms.mode.${room.mode}`)} ·{' '}
              {room.round > 1 ? `${t('rooms.round', { n: room.round })} · ` : ''}
              {t(`rooms.state.${room.state}`)}
            </span>
          </div>
          <div className="vk-mp__codeBox">
            <span className="vk-label">{t('rooms.code')}</span>
            <p
              className="vk-mp__code vk-mono"
              data-testid="room-code"
              aria-label={room.code.split('').join(' ')}
            >
              {displayRoomCode(room.code)}
            </p>
            <button type="button" className="vk-btn vk-btn--ghost" onClick={() => void copy()}>
              {t('rooms.copy')}
            </button>
          </div>
          {room.state === 'lobby' && host ? (
            <>
              <OptionsForm
                value={room.options}
                disabled={busy}
                mode={room.mode}
                onChange={(o) => void act(() => updateRoomOptions(room.code, optionsForMode(room.mode, o)))}
                onMode={(m) => void act(() => updateRoomOptions(room.code, switchMode(m, room.options), m))}
              />
              <p className="vk-mp__hint">{t('rooms.hostEdits')}</p>
            </>
          ) : (
            <OptionsSummary o={room.options} room={room} />
          )}
        </section>
        {room.state !== 'lobby' && (
          <section className="vk-panel vk-mp__run" aria-labelledby="vk-mp-run">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-mp-run">
                {t('rooms.run.title')}
              </h2>
              {shift && startTime && (
                <span className="vk-meta">
                  {startTime}-{hhmm(roomStart(shift) + room.options.hours * HOUR)}
                </span>
              )}
            </div>
            <div className="vk-panel__body">
              {room.state === 'closed' ? (
                <p>{t('rooms.closed')}</p>
              ) : waiting && !error ? (
                <p className="vk-mp__reopen" role="status" data-testid="room-reopening">
                  <Spinner size={13} /> {t('rooms.reopening')}
                </p>
              ) : me?.left && !mine ? (
                <p>{t('rooms.run.left')}</p>
              ) : mine ? (
                <>
                  <p data-testid="room-sent">
                    {t(room.state === 'finished' ? 'rooms.run.sentDone' : 'rooms.run.sent')}
                  </p>
                  {room.state === 'running' && (
                    <p className="vk-dim">{t(host ? 'rooms.run.endHint' : 'rooms.run.next')}</p>
                  )}
                </>
              ) : (
                <p>
                  {t(room.mode === 'sector' ? 'desk.run.text' : coop ? 'coop.run.text' : 'rooms.run.text', {
                    time: room.started ? hhmm(room.started) : '-',
                  })}
                </p>
              )}
            </div>
            {room.state === 'running' && ((!mine && me && !me.left) || host) && (
              <div className="vk-panel__foot">
                {!mine && me && !me.left && (
                  <button type="button" className="vk-btn vk-btn--primary" onClick={play} data-sfx="click">
                    {coop
                      ? t('coop.run.join')
                      : saved
                        ? t(saved.ended ? 'rooms.run.report' : 'rooms.run.resume')
                        : t('rooms.run.start')}
                  </button>
                )}
                {host && (
                  <button
                    type="button"
                    className="vk-btn vk-btn--ghost vk-mp__end"
                    onClick={() => setConfirmEnd(true)}
                    disabled={busy}
                  >
                    {t('rooms.endRound')}
                  </button>
                )}
              </div>
            )}
            {waiting && error && (
              <div className="vk-panel__foot">
                <button
                  type="button"
                  className="vk-btn vk-btn--primary"
                  onClick={() => {
                    reopened.current = null;
                    setError(null);
                    setReopenTry((n) => n + 1);
                  }}
                >
                  {t('rooms.retry')}
                </button>
              </div>
            )}
          </section>
        )}
      </div>

      <div className="vk-mp__col">
        {room.state === 'lobby' ? (
          <section className="vk-panel vk-mp__players" aria-labelledby="vk-mp-players">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-mp-players">
                {t('rooms.players')}
              </h2>
              <span className="vk-count">
                {present(room).length}/{room.max}
              </span>
            </div>
            <Seats room={room} />
            {room.mode === 'role' && (
              <RolePicker room={room} busy={busy} onPick={(role) => void act(async () => void (await setRoomRole(room.code, role)))} />
            )}
            {room.mode === 'sector' && (
              <DeskPicker
                room={room}
                busy={busy}
                onPick={(desk) =>
                  void act(async () => {
                    await setRoomDesk(room.code, desk);
                    // A draft is of its desk's stations: it moves along to the new desk.
                    if (me?.custom) return setRoomCustom(room.code, adaptSetup(room.options.regionId, [desk], me.custom));
                  })
                }
              />
            )}
            <RoomDraft room={room} busy={busy} onSave={(c) => void act(() => setRoomCustom(room.code, c))} />
            <div className="vk-mp__status">
              {host ? (
                <p className={`vk-msg${block ? '' : ' is-ok'}`} data-testid="room-block">
                  {t(block ? `rooms.block.${block}` : 'rooms.block.ok')}
                </p>
              ) : (
                <p className="vk-msg">
                  {t('rooms.wait.host', { name: hostName })} {me?.ready ? '' : t('rooms.wait.ready')}
                </p>
              )}
              {error && (
                <p className="vk-msg is-bad" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="vk-panel__foot">
              {host ? (
                <button
                  type="button"
                  className="vk-btn vk-btn--primary"
                  disabled={busy || !!block}
                  onClick={() => void act(() => startRoom(room.code))}
                  data-sfx="click"
                >
                  {t('rooms.start')}
                </button>
              ) : (
                <button
                  type="button"
                  className={`vk-btn${me?.ready ? '' : ' vk-btn--primary'}`}
                  disabled={busy}
                  aria-pressed={!!me?.ready}
                  onClick={() => void act(() => setRoomReady(room.code, !me?.ready))}
                  data-sfx="click"
                >
                  {me?.ready ? t('rooms.unready') : t('rooms.ready')}
                </button>
              )}
              <button
                type="button"
                className="vk-btn vk-btn--ghost vk-mp__leave"
                onClick={() => void leave()}
                disabled={busy}
              >
                {t('rooms.leave')}
              </button>
            </div>
          </section>
        ) : null}
        {room.state === 'lobby' && room.last && (
          <section className="vk-panel vk-mp__last" aria-labelledby="vk-mp-last" data-testid="room-last">
            <div className="vk-panel__head vk-mp__boardHead">
              <h2 className="vk-h" id="vk-mp-last">
                {t('rooms.last.title')}
              </h2>
              <span className="vk-meta">
                {t('rooms.round', { n: room.last.round })} · {t(`rooms.mode.${room.last.mode}`)}
              </span>
            </div>
            <ResultsBoard
              results={room.last.results}
              me={room.me}
              caption={t('rooms.last.caption', { n: room.last.round })}
            />
          </section>
        )}
        {room.state === 'lobby' && (
          <section className="vk-panel" aria-labelledby="vk-mp-rules">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-mp-rules">
                {t(coop ? 'coop.rules.title' : 'rooms.rules.title')}
              </h2>
            </div>
            <ol className="vk-mp__how">
              {[1, 2, 3, 4].map((n) => (
                <li key={n}>
                  <span className="vk-mp__step vk-mono" aria-hidden="true">
                    {n}
                  </span>
                  <span>{t(`${room.mode === 'sector' ? 'desk' : coop ? 'coop' : 'rooms'}.rules.${n}`)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {room.state !== 'lobby' && (
          <section className="vk-panel vk-mp__results" aria-labelledby="vk-mp-results">
            <div className="vk-panel__head vk-mp__boardHead">
              <h2 className="vk-h" id="vk-mp-results">
                {t('rooms.board.title')}
              </h2>
              <span className="vk-meta">
                {room.round > 1 ? `${t('rooms.round', { n: room.round })} · ` : ''}
                {boardCount(t, room)} · {room.state === 'running' ? t('rooms.board.live') : t('rooms.board.final')}
              </span>
            </div>
            <RoomBoard room={room} />
            <p className="vk-mp__hint vk-mp__boardNote">{t('rooms.board.note')}</p>
            {error && (
              <p className="vk-msg is-bad vk-mp__err" role="alert">
                {error}
              </p>
            )}
            <div className="vk-panel__foot">
              {closed || !me || me.left ? (
                <button type="button" className="vk-btn" onClick={onLeft}>
                  {t('rooms.new')}
                </button>
              ) : (
                <button
                  type="button"
                  className="vk-btn vk-btn--ghost vk-mp__leave"
                  onClick={() => (mine || room.state !== 'running' ? void leave() : setConfirmLeave(true))}
                  disabled={busy}
                >
                  {t('rooms.leave')}
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      {confirmEnd && (
        <VkLayer>
          <Modal
            open
            onClose={() => setConfirmEnd(false)}
            title={t('rooms.endRound')}
            width={460}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
                  {t('rooms.endRound.no')}
                </Button>
                <Button variant="danger" onClick={endRound}>
                  {t('rooms.endRound.yes')}
                </Button>
              </>
            }
          >
            <div className="vk-dialog">
              <p>{t('rooms.endRound.confirm')}</p>
            </div>
          </Modal>
        </VkLayer>
      )}

      {confirmLeave && (
        <VkLayer>
          <Modal
            open
            onClose={() => setConfirmLeave(false)}
            title={t('rooms.leave')}
            width={460}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmLeave(false)}>
                  {t('rooms.leave.no')}
                </Button>
                <Button variant="danger" onClick={() => void leave()}>
                  {t('rooms.leave.yes')}
                </Button>
              </>
            }
          >
            <div className="vk-dialog">
              <p>{t('rooms.leave.confirm')}</p>
            </div>
          </Modal>
        </VkLayer>
      )}
    </div>
  );
}

/** The four seats: who sits there, host and ready marks, and whether they are still connected. */
function Seats({ room }: { room: Room }) {
  const t = useT();
  const tx = useTx();
  const seats = Array.from(
    { length: room.max },
    (_, i) => room.players.find((p) => p.seat === i && !p.left) ?? null,
  );
  return (
    <ul className="vk-mp__seats" data-testid="room-seats">
      {seats.map((p, i) => (
        <li key={i} className={`vk-mp__seat${p ? '' : ' is-free'}${p?.id === room.me ? ' is-me' : ''}`}>
          <span className="vk-mp__seatNo vk-mono" aria-hidden="true">
            {i + 1}
          </span>
          {p ? (
            <>
              <span className="vk-mp__seatWho">
                <span className={`vk-mp__dot${p.online ? ' is-on' : ''}`} aria-hidden="true" />
                <span className="vk-mp__seatName">{p.name}</span>
                {p.host && <span className="vk-mp__tag">{t('rooms.badge.host')}</span>}
                {p.id === room.me && <span className="vk-dim">({t('rooms.badge.you')})</span>}
              </span>
              {room.mode === 'role' && (
                <span className="vk-mp__role" data-testid="seat-role">
                  {t(`coop.role.${p.role ?? DEFAULT_ROLES[i % 4]}`)}
                </span>
              )}
              {room.mode === 'sector' && (
                <span className="vk-mp__role" data-testid="seat-desk">
                  {tx(sectorById(deskOfPlayer(room, p))?.name ?? { et: '?', en: '?' })}
                </span>
              )}
              {room.options.custom && room.mode !== 'role' && (
                <span className="vk-mp__role vk-mono" data-testid="seat-force">
                  {p.custom ? t('custom.room.seatN', { n: p.custom.crews.length }) : '-'}
                </span>
              )}
              <span className={`vk-mp__ready${p.ready ? ' is-ready' : ''}`}>
                {!p.online ? t('rooms.p.offline') : p.ready ? t('rooms.p.ready') : t('rooms.p.waiting')}
              </span>
            </>
          ) : (
            <span className="vk-mp__seatWho vk-dim">{t('rooms.seat.free')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Role co-op: this player's desk, and what the room's line-up means (who takes over a desk nobody picked). */
function RolePicker({ room, busy, onPick }: { room: Room; busy: boolean; onPick: (r: CoopRole) => void }) {
  const t = useT();
  const me = meIn(room);
  if (!me || room.state !== 'lobby') return null;
  const here = present(room);
  const roleOf = (p: (typeof here)[number]) => p.role ?? DEFAULT_ROLES[p.seat % 4];
  const mine = roleOf(me);
  const missing = COOP_ROLES.filter((r) => !here.some((p) => roleOf(p) === r));
  return (
    <div className="vk-mp__roles" data-testid="role-picker">
      <span className="vk-label" id="vk-mp-role">
        {t('coop.role.pick')}
      </span>
      <div className="vk-mp__modes" role="radiogroup" aria-labelledby="vk-mp-role">
        {COOP_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={mine === r}
            disabled={busy}
            className={`vk-mp__mode${mine === r ? ' is-active' : ''}`}
            onClick={() => mine !== r && onPick(r)}
          >
            <span className="vk-mp__modeHead">
              <span className="vk-mp__radio" aria-hidden="true" />
              <strong>{t(`coop.role.${r}`)}</strong>
              <span className="vk-dim">{here.filter((p) => roleOf(p) === r).length || ''}</span>
            </span>
            <span className="vk-mp__modeDesc">{t(`coop.role.${r}.desc`)}</span>
          </button>
        ))}
      </div>
      <p className="vk-mp__hint" data-testid="role-hint">
        {missing.length ? missing.map((r) => t(`coop.role.${r}.cover`)).join(' ') : t('coop.role.allCovered')}
      </p>
    </div>
  );
}
