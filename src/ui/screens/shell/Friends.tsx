// Sõbrad (2.40.0, docs/MULTIPLAYER.md section 18): the friends panel of the multiplayer screen (add by user name, the
// requests either way, who is online and what they do, joining a friend's room, invitations waiting), the invitation
// to the room the player is in, a challenge sent to friends, and the notice that brings an invitation or a friend
// request to the menu with a one-click answer. FriendsGate (in App) keeps the presence call going for a signed-in
// account. Styles in friends.css.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAccount } from '@/net/account';
import {
  canJoin,
  friendErrorKey,
  type Friend,
  type FriendRequest,
  type Invite,
  type InviteKind,
} from '@/net/friends';
import { joinRoom, roomErrorKey, type Room } from '@/net/rooms';
import { useT } from '@/i18n';
import { sfx } from '@/audio/sfx';
import { displayRoomCode } from '@/sim/room';
import { presenceDelay, presenceOf, PresenceLoop, useFriends } from '@/store/friends';
import { useGame } from '@/store/game';
import { Button, Modal, PlayerAvatar, Spinner } from '@/ui/components';
import { useChallengeLink } from './challengeLink';
import { openLobby } from './lobbyNav';
import { VkLayer } from './VkLayer';
import './friends.css';

/** Signed in with an account and the server is there: friends work. */
export function useFriendsOn(): boolean {
  const account = useAccount((s) => s.user);
  const backend = useAccount((s) => s.backend);
  const gameUser = useGame((s) => s.user);
  return !!account && gameUser?.method === 'account' && backend === 'online';
}

/** The friends list while the component is shown: fetched at once and kept current with each presence answer. */
function useWatchedList() {
  const on = useFriendsOn();
  const list = useFriends((s) => s.list);
  useEffect(() => (on ? useFriends.getState().watch() : undefined), [on]);
  return on ? list : null;
}

/** What an online friend does, in a few words. */
function activity(t: ReturnType<typeof useT>, f: Friend): string {
  if (!f.online) return t('friends.offline');
  if (f.room) {
    if (f.room.state === 'running')
      return t('friends.what.roomShift', { mode: t(`rooms.mode.${f.room.mode}`) });
    return t('friends.what.lobby', {
      code: displayRoomCode(f.room.code),
      n: f.room.players,
      max: f.room.max,
    });
  }
  return t(`friends.what.${f.what ?? 'menu'}`);
}

function Avatar({ who, size = 30 }: { who: { name: string; avatar?: string }; size?: number }) {
  return <PlayerAvatar avatar={who.avatar} name={who.name} size={size} className="vk-mp__pic" />;
}

// ── The panel of the multiplayer screen ──────────────────────────────────────

/**
 * Friends on the multiplayer screen. Without a room: invitations waiting, and a friend's room that takes players can
 * be joined from the list (`onRoom`). In a room's lobby (`room`): each friend can be invited to it.
 */
export function FriendsPanel({ onRoom, room }: { onRoom?: (r: Room) => void; room?: Room }) {
  const t = useT();
  const list = useWatchedList();
  const online = useFriends((s) => s.online);
  const invites = useFriends((s) => s.invites);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Friend | null>(null);
  /** Friends invited to this room from here (they stay marked while the panel is open). */
  const [invited, setInvited] = useState<number[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const inRoom = useMemo(() => new Set(room?.players.filter((p) => !p.left).map((p) => p.id) ?? []), [room]);

  const join = async (code: string) => {
    if (joining) return;
    setJoining(code);
    setError(null);
    try {
      const r = await joinRoom(code);
      sfx.play('click');
      onRoom?.(r);
    } catch (e) {
      sfx.play('error');
      setError(t(roomErrorKey(e)));
    } finally {
      setJoining(null);
    }
  };

  const run = async (id: number, fn: () => Promise<unknown>) => {
    if (busy !== null) return;
    setBusy(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      sfx.play('error');
      setError(t(friendErrorKey(e)));
    } finally {
      setBusy(null);
    }
  };

  const inviteToRoom = (f: Friend) =>
    run(f.id, async () => {
      if (!room) return;
      await useFriends.getState().invite('room', room.code, [f.id]);
      setInvited((ids) => (ids.includes(f.id) ? ids : [...ids, f.id]));
      sfx.play('click');
    });

  const friends = list?.friends ?? [];
  return (
    <section className="vk-panel vk-fr" aria-labelledby="vk-fr-title" data-testid="friends">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-fr-title">
          {t(room ? 'friends.inviteTitle' : 'friends.title')}
        </h2>
        {list && friends.length > 0 && (
          <span className="vk-meta" data-testid="friends-online">
            {t('friends.onlineN', { n: online })}
          </span>
        )}
      </div>
      <AddFriend />
      {error && (
        <p className="vk-msg is-bad vk-fr__err" role="alert">
          {error}
        </p>
      )}
      {list === null ? (
        <p className="vk-fr__state">
          <Spinner size={13} />
        </p>
      ) : (
        <>
          {!room && invites.length > 0 && (
            <Group title={t('friends.invites')} n={invites.length} testId="friends-invites">
              {invites.map((inv) => (
                <InviteRow key={inv.id} inv={inv} onJoin={onRoom} />
              ))}
            </Group>
          )}
          {list.asking.length > 0 && (
            <Group title={t('friends.asking')} n={list.asking.length} testId="friends-asking">
              {list.asking.map((r) => (
                <RequestRow key={r.id} r={r} busy={busy === r.id}>
                  <button
                    type="button"
                    className="vk-btn vk-btn--primary vk-fr__btn"
                    onClick={() => void run(r.id, () => useFriends.getState().accept(r.id))}
                    disabled={busy !== null}
                    data-testid="friend-accept"
                  >
                    {t('friends.accept')}
                  </button>
                  <button
                    type="button"
                    className="vk-btn vk-btn--ghost vk-fr__btn"
                    onClick={() => void run(r.id, () => useFriends.getState().remove(r.id))}
                    disabled={busy !== null}
                  >
                    {t('friends.decline')}
                  </button>
                </RequestRow>
              ))}
            </Group>
          )}
          {friends.length > 0 ? (
            <Group title={t('friends.list')} n={friends.length} testId="friends-list">
              {friends.map((f) => (
                <FriendRow key={f.id} f={f}>
                  {room ? (
                    inRoom.has(f.id) ? (
                      <span className="vk-fr__tag">{t('friends.inRoom')}</span>
                    ) : invited.includes(f.id) ? (
                      <span className="vk-fr__tag is-ok" data-testid="friend-invited">
                        {t('friends.invited')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="vk-btn vk-fr__btn"
                        onClick={() => void inviteToRoom(f)}
                        disabled={busy !== null || (room.state !== 'lobby' && room.state !== 'finished')}
                        aria-label={t('friends.inviteAria', { name: f.name })}
                        data-testid="friend-invite"
                      >
                        {busy === f.id && <Spinner size={12} />}
                        {t('friends.invite')}
                      </button>
                    )
                  ) : (
                    canJoin(f.room) && (
                      <button
                        type="button"
                        className="vk-btn vk-btn--primary vk-fr__btn"
                        onClick={() => void join(f.room!.code)}
                        disabled={!!joining}
                        aria-label={t('friends.joinAria', { name: f.name })}
                        data-testid="friend-join"
                      >
                        {joining === f.room.code && <Spinner size={12} />}
                        {t('friends.join')}
                      </button>
                    )
                  )}
                  {!room && (
                    <button
                      type="button"
                      className="vk-btn vk-btn--ghost vk-fr__remove"
                      onClick={() => setRemoving(f)}
                      aria-label={t('friends.removeAria', { name: f.name })}
                      title={t('friends.remove')}
                    >
                      ×
                    </button>
                  )}
                </FriendRow>
              ))}
            </Group>
          ) : (
            list.asking.length === 0 && <p className="vk-fr__empty">{t('friends.empty')}</p>
          )}
          {!room && list.asked.length > 0 && (
            <Group title={t('friends.asked')} n={list.asked.length} testId="friends-asked">
              {list.asked.map((r) => (
                <RequestRow key={r.id} r={r} busy={busy === r.id} note={t('friends.askedNote')}>
                  <button
                    type="button"
                    className="vk-btn vk-btn--ghost vk-fr__btn"
                    onClick={() => void run(r.id, () => useFriends.getState().remove(r.id))}
                    disabled={busy !== null}
                  >
                    {t('friends.takeBack')}
                  </button>
                </RequestRow>
              ))}
            </Group>
          )}
          {room && friends.length > 0 && <p className="vk-mp__hint vk-fr__hint">{t('friends.inviteHint')}</p>}
        </>
      )}
      {removing && (
        <VkLayer>
          <Modal
            open
            onClose={() => setRemoving(null)}
            title={t('friends.remove')}
            width={440}
            footer={
              <>
                <Button variant="ghost" onClick={() => setRemoving(null)}>
                  {t('friends.remove.no')}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    const f = removing;
                    setRemoving(null);
                    void run(f.id, () => useFriends.getState().remove(f.id));
                  }}
                >
                  {t('friends.remove.yes')}
                </Button>
              </>
            }
          >
            <div className="vk-dialog">
              <p>{t('friends.remove.confirm', { name: removing.name })}</p>
            </div>
          </Modal>
        </VkLayer>
      )}
    </section>
  );
}

function Group({
  title,
  n,
  testId,
  children,
}: {
  title: string;
  n: number;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="vk-fr__group" data-testid={testId}>
      <p className="vk-fr__groupHead">
        <span className="vk-label">{title}</span>
        <span className="vk-count">{n}</span>
      </p>
      <ul className="vk-fr__list">{children}</ul>
    </div>
  );
}

function FriendRow({ f, children }: { f: Friend; children?: ReactNode }) {
  const t = useT();
  return (
    <li className={`vk-fr__row${f.online ? ' is-on' : ''}`} data-testid="friend" data-name={f.name}>
      <span className="vk-fr__who">
        <span className="vk-fr__pic">
          <Avatar who={f} />
          <span
            className={`vk-mp__dot vk-fr__dot${f.online ? ' is-on' : ''}`}
            role="img"
            aria-label={t(f.online ? 'friends.online' : 'friends.offline')}
          />
        </span>
        <span className="vk-fr__text">
          <span className="vk-fr__name">{f.name}</span>
          <span className="vk-fr__what" data-testid="friend-what">
            {activity(t, f)}
          </span>
        </span>
      </span>
      {children}
    </li>
  );
}

function RequestRow({
  r,
  busy,
  note,
  children,
}: {
  r: FriendRequest;
  busy: boolean;
  note?: string;
  children: ReactNode;
}) {
  return (
    <li className="vk-fr__row" data-testid="friend-request" data-name={r.name}>
      <span className="vk-fr__who">
        <span className="vk-fr__pic">
          <Avatar who={r} />
        </span>
        <span className="vk-fr__text">
          <span className="vk-fr__name">{r.name}</span>
          {note && <span className="vk-fr__what">{note}</span>}
        </span>
      </span>
      {busy && <Spinner size={12} />}
      {children}
    </li>
  );
}

/** Add a friend by their user name. */
function AddFriend() {
  const t = useT();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const who = name.trim();
    if (!who || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const state = await useFriends.getState().add(who);
      setNote({
        text: t(state === 'friends' ? 'friends.add.friends' : 'friends.add.asked', { name: who }),
        ok: true,
      });
      setName('');
      sfx.play('click');
    } catch (err) {
      sfx.play('error');
      setNote({ text: t(friendErrorKey(err)), ok: false });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="vk-fr__add" onSubmit={(e) => void submit(e)} noValidate>
      <label className="vk-label" htmlFor="vk-fr-name">
        {t('friends.add.label')}
      </label>
      <div className="vk-fr__addRow">
        <input
          id="vk-fr-name"
          className="vk-fr__input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNote(null);
          }}
          placeholder={t('friends.add.placeholder')}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={24}
          aria-describedby="vk-fr-note"
          data-testid="friend-name"
        />
        <button
          type="submit"
          className="vk-btn vk-btn--primary"
          disabled={busy || !name.trim()}
          data-testid="friend-add"
        >
          {busy && <Spinner size={13} />}
          {t('friends.add.go')}
        </button>
      </div>
      <p
        className={note ? `vk-msg vk-fr__note${note.ok ? ' is-ok' : ' is-bad'}` : 'vk-mp__hint vk-fr__note'}
        id="vk-fr-note"
        role={note ? 'status' : undefined}
        data-testid="friend-note"
      >
        {note ? note.text : t('friends.add.hint')}
      </p>
    </form>
  );
}

/** What an invitation is for, in one line. */
function inviteLine(t: ReturnType<typeof useT>, inv: Invite): string {
  if (inv.room)
    return t('friends.inv.roomLine', {
      mode: t(`rooms.mode.${inv.room.mode}`),
      region: t(`account.lb.region.${inv.room.regionId}`),
      n: inv.room.players,
      max: inv.room.max,
    });
  const region = t(`account.lb.region.${inv.challenge?.regionId ?? 'pohja'}`);
  return inv.challenge?.score != null
    ? t('friends.inv.challengeLine', { region, score: inv.challenge.score })
    : t('friends.inv.challengeLineNoScore', { region });
}

/**
 * Take an invitation up: into the room's lobby, or the challenge opens. Throws when the room cannot be joined; the
 * invitation then stays with the reason shown (the server leaves out a room that started or closed on its next
 * answer, and the player can put it away).
 */
async function takeInvite(inv: Invite, onRoom?: (r: Room) => void): Promise<void> {
  const store = useFriends.getState();
  if (inv.kind === 'challenge') {
    store.done(inv.id);
    useChallengeLink.getState().set(inv.code);
    // The challenge opens over the menu or the multiplayer screen.
    const screen = useGame.getState().screen;
    if (screen !== 'menu' && screen !== 'lobby') useGame.getState().setScreen('menu');
    return;
  }
  const room = await joinRoom(inv.code);
  store.done(inv.id);
  if (onRoom) onRoom(room);
  else openLobby(room.code);
}

function InviteRow({ inv, onJoin }: { inv: Invite; onJoin?: (r: Room) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const take = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await takeInvite(inv, onJoin);
      sfx.play('click');
    } catch (e) {
      sfx.play('error');
      setError(t(roomErrorKey(e)));
      setBusy(false);
    }
  };
  return (
    <li className="vk-fr__row vk-fr__row--inv" data-testid="friend-invite-row" data-kind={inv.kind}>
      <span className="vk-fr__who">
        <span className="vk-fr__pic">
          <Avatar who={inv.from} />
        </span>
        <span className="vk-fr__text">
          <span className="vk-fr__name">
            {t(inv.kind === 'room' ? 'friends.inv.room' : 'friends.inv.challenge', { name: inv.from.name })}
          </span>
          <span className="vk-fr__what">{error ?? inviteLine(t, inv)}</span>
        </span>
      </span>
      <button
        type="button"
        className="vk-btn vk-btn--primary vk-fr__btn"
        onClick={() => void take()}
        disabled={busy}
      >
        {busy && <Spinner size={12} />}
        {t(inv.kind === 'room' ? 'friends.join' : 'friends.inv.view')}
      </button>
      <button
        type="button"
        className="vk-btn vk-btn--ghost vk-fr__remove"
        onClick={() => useFriends.getState().done(inv.id)}
        aria-label={t('friends.inv.decline')}
        title={t('friends.inv.decline')}
      >
        ×
      </button>
    </li>
  );
}

// ── A challenge sent to friends ──────────────────────────────────────────────

/** Friends to send a challenge (or another invitation of `kind`) to, one button each. */
export function FriendPicker({ kind, code }: { kind: InviteKind; code: string }) {
  const t = useT();
  const list = useWatchedList();
  const [sent, setSent] = useState<number[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!list) return null;
  const send = async (f: Friend) => {
    if (busy !== null) return;
    setBusy(f.id);
    setError(null);
    try {
      await useFriends.getState().invite(kind, code, [f.id]);
      setSent((ids) => [...ids, f.id]);
      sfx.play('click');
    } catch (e) {
      sfx.play('error');
      setError(t(friendErrorKey(e)));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="vk-fr vk-fr--pick" data-testid="friend-picker">
      <p className="vk-fr__groupHead">
        <span className="vk-label">{t('friends.pick.title')}</span>
      </p>
      {list.friends.length === 0 ? (
        <p className="vk-fr__empty">{t('friends.pick.empty')}</p>
      ) : (
        <ul className="vk-fr__list">
          {list.friends.map((f) => (
            <FriendRow key={f.id} f={f}>
              {sent.includes(f.id) ? (
                <span className="vk-fr__tag is-ok" data-testid="friend-sent">
                  {t('friends.pick.sent')}
                </span>
              ) : (
                <button
                  type="button"
                  className="vk-btn vk-fr__btn"
                  onClick={() => void send(f)}
                  disabled={busy !== null}
                  aria-label={t('friends.pick.sendAria', { name: f.name })}
                  data-testid="friend-send"
                >
                  {busy === f.id && <Spinner size={12} />}
                  {t('friends.pick.send')}
                </button>
              )}
            </FriendRow>
          ))}
        </ul>
      )}
      {error && (
        <p className="vk-msg is-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ── The presence call and the notice ─────────────────────────────────────────

/** Screens without the notice: the start, the sign-in and the shift (an invitation waits for the menu). */
const QUIET = new Set(['boot', 'login', 'game']);

/** Keeps the presence call going for a signed-in account and shows what waits for the player. Mounted in App. */
export function FriendsGate() {
  const on = useFriendsOn();
  const userId = useAccount((s) => s.user?.id ?? null);
  const screen = useGame((s) => s.screen);
  const lobbyRoom = useFriends((s) => s.lobbyRoom);
  const loop = useRef<PresenceLoop | null>(null);

  useEffect(() => {
    if (!on || userId === null) return;
    useFriends.getState().bind(userId);
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const l = new PresenceLoop({
      state: () => {
        const g = useGame.getState();
        return presenceOf(g.screen, g.sim, useFriends.getState().lobbyRoom);
      },
      delay: (failures) => presenceDelay(useGame.getState().screen, visible(), failures),
      onPresence: (p) => useFriends.getState().applyPresence(p),
    });
    loop.current = l;
    l.start();
    const onVisible = () => {
      if (visible()) l.now();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      l.stop();
      loop.current = null;
      // Another account (or none) next: nothing of this one's stays.
      useFriends.getState().reset();
    };
  }, [on, userId]);

  // What the player does changed: friends see it at once (the loop's start says the first).
  const doing = screen === 'game' ? 'game' : screen === 'lobby' && lobbyRoom ? `room:${lobbyRoom}` : 'menu';
  const said = useRef(doing);
  useEffect(() => {
    if (said.current === doing) return;
    said.current = doing;
    loop.current?.now();
  }, [doing]);

  if (!on || QUIET.has(screen)) return null;
  return <FriendsNotice />;
}

type NoticeItem = { k: 'invite'; inv: Invite } | { k: 'ask'; r: FriendRequest };

/** The newest invitation not put off, else the newest friend request not seen yet. */
function useNoticeItem(): { item: NoticeItem | null; more: number } {
  const invites = useFriends((s) => s.invites);
  const later = useFriends((s) => s.later);
  const asking = useFriends((s) => s.list?.asking);
  const seen = useFriends((s) => s.seenAsking);
  return useMemo(() => {
    const inv = invites.filter((i) => !later.includes(i.id));
    const ask = (asking ?? []).filter((r) => !seen.includes(r.id)).sort((a, b) => b.since - a.since);
    const item: NoticeItem | null = inv[0]
      ? { k: 'invite', inv: inv[0] }
      : ask[0]
        ? { k: 'ask', r: ask[0] }
        : null;
    return { item, more: Math.max(0, inv.length + ask.length - 1) };
  }, [invites, later, asking, seen]);
}

function FriendsNotice() {
  const t = useT();
  const { item, more } = useNoticeItem();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = item ? (item.k === 'invite' ? `i${item.inv.id}` : `a${item.r.id}`) : '';
  // A new notice: a short sound, and a fresh start.
  useEffect(() => {
    setBusy(false);
    setError(null);
    if (key) sfx.play('radioIn');
  }, [key]);
  if (!item) return null;

  const store = useFriends.getState();
  const later = () => {
    if (item.k === 'invite') store.putOff(item.inv.id);
    else store.seeAsking([item.r.id]);
  };
  const yes = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (item.k === 'invite') await takeInvite(item.inv);
      else {
        await store.accept(item.r.id);
        store.seeAsking([item.r.id]);
      }
      sfx.play('click');
    } catch (e) {
      sfx.play('error');
      setError(t(item.k === 'invite' ? roomErrorKey(e) : friendErrorKey(e)));
      setBusy(false);
    }
  };

  const who = item.k === 'invite' ? item.inv.from : item.r;
  const kind = item.k === 'ask' ? 'ask' : item.inv.kind;
  return (
    <VkLayer>
      <aside
        className="vk-frn"
        role="status"
        aria-live="polite"
        data-testid="friend-notice"
        data-kind={kind}
        key={key}
      >
        <PlayerAvatar avatar={who.avatar} name={who.name} size={40} className="vk-mp__pic vk-frn__pic" />
        <div className="vk-frn__body">
          <p className="vk-label vk-frn__kind">{t(`friends.notice.${kind}`)}</p>
          <p className="vk-frn__title">
            {item.k === 'ask'
              ? t('friends.notice.askText', { name: who.name })
              : t(item.inv.kind === 'room' ? 'friends.inv.room' : 'friends.inv.challenge', {
                  name: who.name,
                })}
          </p>
          {(error || item.k === 'invite') && (
            <p className={error ? 'vk-frn__line is-bad' : 'vk-frn__line'}>
              {error ?? (item.k === 'invite' ? inviteLine(t, item.inv) : '')}
            </p>
          )}
          <div className="vk-frn__actions">
            <button
              type="button"
              className="vk-btn vk-btn--primary"
              onClick={() => void yes()}
              disabled={busy}
              data-testid="friend-notice-yes"
            >
              {busy && <Spinner size={13} />}
              {t(
                kind === 'ask'
                  ? 'friends.accept'
                  : kind === 'room'
                    ? 'friends.notice.join'
                    : 'friends.inv.view',
              )}
            </button>
            <button
              type="button"
              className="vk-btn vk-btn--ghost"
              onClick={later}
              data-testid="friend-notice-later"
            >
              {t('friends.notice.later')}
            </button>
            {more > 0 && (
              <button type="button" className="vk-linkbtn vk-frn__more" onClick={() => openLobby()}>
                {t('friends.notice.more', { n: more })}
              </button>
            )}
          </div>
        </div>
      </aside>
    </VkLayer>
  );
}
