// Sõbrad (2.40.0, docs/MULTIPLAYER.md section 18): the friends list, what waits for the player (invitations, friend
// requests) and the presence call that keeps both current. The call says what the player does (the menu, a shift, a
// room) every 20 seconds out of a shift, every minute in one and every 100 seconds while the page is hidden, so a
// friend shows online within the server's 150 seconds. Started by FriendsGate (src/ui/screens/shell/Friends.tsx) for
// a signed-in account.
import { create } from 'zustand';
import {
  acceptFriend,
  addFriend,
  fetchFriends,
  inviteDone,
  removeFriend,
  sendInvites,
  sendPresence,
  type FriendList,
  type FriendWhat,
  type Invite,
  type InviteKind,
  type Presence,
} from '@/net/friends';
import { roomCodeOf } from '@/sim/room';
import type { SimState } from '@/sim/types';
import { spaceKey, storageGet, storageSet } from './migrate';

/** What the player does, as the presence call says it. */
export function presenceOf(
  screen: string,
  sim: Pick<SimState, 'flags' | 'coop'> | null,
  lobbyRoom: string | null,
): { what: FriendWhat; room: string | null } {
  if (screen === 'game') return { what: 'shift', room: sim?.coop?.code ?? roomCodeOf(sim) };
  if (screen === 'lobby' && lobbyRoom) return { what: 'room', room: lobbyRoom };
  return { what: 'menu', room: null };
}

/** Pause before the next presence call: shorter out of a shift, longer while hidden, backing off after failures. */
export function presenceDelay(screen: string, visible: boolean, failures: number): number {
  if (failures > 0) return Math.min(5 * 60_000, 20_000 * 2 ** Math.min(4, failures));
  if (!visible) return 100_000;
  return screen === 'game' ? 60_000 : 20_000;
}

export interface PresenceLoopOptions {
  state: () => { what: FriendWhat; room: string | null };
  delay: (failures: number) => number;
  onPresence: (p: Presence) => void;
}

/** The loop running for the signed-in account, if any. */
let active: PresenceLoop | null = null;

/** Say it at once (the menu after an answer of the player's; a test that does not wait for the next call). */
export function pokePresence(): void {
  active?.now();
}

/** One presence call at a time until stopped; `now()` says it at once when what the player does changed. */
export class PresenceLoop {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private busy = false;
  private again = false;
  private failures = 0;

  constructor(private readonly opts: PresenceLoopOptions) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    active = this;
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (active === this) active = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  now(): void {
    if (this.stopped) return;
    if (this.busy) {
      this.again = true;
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    this.busy = true;
    this.again = false;
    const { what, room } = this.opts.state();
    try {
      const p = await sendPresence(what, room);
      if (this.stopped) return;
      this.failures = 0;
      this.opts.onPresence(p);
    } catch {
      if (this.stopped) return;
      this.failures++;
    } finally {
      this.busy = false;
    }
    if (this.stopped) return;
    if (this.again) {
      void this.tick();
      return;
    }
    this.timer = setTimeout(() => void this.tick(), this.opts.delay(this.failures));
  }
}

/** Notices put away, kept per account in this browser (epd:acct:<id>:friends) so they do not come back on a reload. */
const KEEP = 100;
const keyOf = (userId: number) => spaceKey('friends', userId);

function loadPut(userId: number): { later: number[]; seenAsking: number[] } {
  try {
    const v = JSON.parse(storageGet(keyOf(userId)) ?? '{}') as { later?: unknown; seen?: unknown };
    const ids = (x: unknown) =>
      Array.isArray(x) ? x.filter((n): n is number => typeof n === 'number').slice(-KEEP) : [];
    return { later: ids(v.later), seenAsking: ids(v.seen) };
  } catch {
    return { later: [], seenAsking: [] };
  }
}

interface FriendsStore {
  /** The list once fetched (null before, and for a guest). */
  list: FriendList | null;
  /** Invitations waiting for the player, newest first. */
  invites: Invite[];
  /** Friend requests waiting for the player (the presence call's count; the list has the names). */
  asking: number;
  /** Friends online now (the presence call's count). */
  online: number;
  /** Invitations the player put away for now in this tab ("Hiljem"): no notice for them again. */
  later: number[];
  /** Friend requests whose notice the player has seen in this tab. */
  seenAsking: number[];
  /** The room the lobby shows (presence 'room'). */
  lobbyRoom: string | null;
  /** The signed-in account the notices put away belong to. */
  userId: number | null;
  /** Panels showing the list: each presence answer refreshes it while there is one. */
  watchers: number;

  /** A signed-in account: its notices put away come back from this browser. */
  bind: (userId: number) => void;

  refresh: () => Promise<FriendList | null>;
  add: (name: string) => Promise<'asked' | 'friends'>;
  accept: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  invite: (kind: InviteKind, code: string, to: number[]) => Promise<number>;
  /** The invitation was taken up or declined: it goes from the list here and on the server. */
  done: (id: number) => void;
  putOff: (id: number) => void;
  seeAsking: (ids: number[]) => void;
  setLobbyRoom: (code: string | null) => void;
  watch: () => () => void;
  applyPresence: (p: Presence) => void;
  reset: () => void;
}

const EMPTY = {
  list: null,
  invites: [],
  asking: 0,
  online: 0,
  later: [],
  seenAsking: [],
  lobbyRoom: null,
  userId: null,
} satisfies Partial<FriendsStore>;

/** The store's figures as a fresh list has them. */
const fromList = (list: FriendList) => ({
  list,
  asking: list.asking.length,
  online: list.friends.filter((f) => f.online).length,
});

function save(s: Pick<FriendsStore, 'userId' | 'later' | 'seenAsking'>): void {
  if (s.userId !== null) storageSet(keyOf(s.userId), JSON.stringify({ later: s.later, seen: s.seenAsking }));
}

/** A list fetch on its way; a refresh asked for meanwhile fetches once more after it (the news may be newer). */
let fetching: Promise<FriendList | null> | null = null;
let fetchAgain = false;
/** Bumped by reset: answers of requests sent before it are dropped. */
let epoch = 0;

export const useFriends = create<FriendsStore>()((set, get) => ({
  ...EMPTY,
  watchers: 0,

  bind: (userId) => set({ userId, ...loadPut(userId) }),

  refresh: () => {
    if (fetching) {
      fetchAgain = true;
      return fetching;
    }
    const my = epoch;
    const p = fetchFriends()
      .then((list) => {
        if (my !== epoch) return null;
        set(fromList(list));
        return list;
      })
      .catch(() => null)
      .finally(() => {
        if (fetching !== p) return;
        fetching = null;
        if (fetchAgain) {
          fetchAgain = false;
          void get().refresh();
        }
      });
    fetching = p;
    return p;
  },

  add: async (name) => {
    const my = epoch;
    const r = await addFriend(name);
    if (my === epoch) set(fromList(r.list));
    return r.state;
  },

  accept: async (id) => {
    const my = epoch;
    const list = await acceptFriend(id);
    if (my === epoch) set(fromList(list));
  },

  remove: async (id) => {
    const my = epoch;
    const list = await removeFriend(id);
    if (my !== epoch) return;
    // Their invitations to the player went with the friendship.
    set((s) => ({ ...fromList(list), invites: s.invites.filter((i) => i.from.id !== id) }));
  },

  invite: (kind, code, to) => sendInvites(kind, code, to),

  done: (id) => {
    set((s) => ({ invites: s.invites.filter((i) => i.id !== id) }));
    void inviteDone(id).catch(() => {
      /* it runs out by itself */
    });
  },

  putOff: (id) => {
    if (get().later.includes(id)) return;
    set((s) => ({ later: [...s.later, id].slice(-KEEP) }));
    save(get());
  },

  seeAsking: (ids) => {
    const fresh = ids.filter((id) => !get().seenAsking.includes(id));
    if (!fresh.length) return;
    set((s) => ({ seenAsking: [...s.seenAsking, ...fresh].slice(-KEEP) }));
    save(get());
  },

  setLobbyRoom: (code) => {
    if (get().lobbyRoom !== code) set({ lobbyRoom: code });
  },

  watch: () => {
    set((s) => ({ watchers: s.watchers + 1 }));
    void get().refresh();
    return () => set((s) => ({ watchers: Math.max(0, s.watchers - 1) }));
  },

  applyPresence: (p) => {
    const s = get();
    set({ invites: p.invites, asking: p.asking, online: p.online });
    // The list follows while a panel shows it, and whenever somebody new asked (the notice names them).
    if (s.watchers > 0 || p.asking !== (s.list?.asking.length ?? 0) || (s.list && p.online !== s.online)) {
      void get().refresh();
    }
  },

  reset: () => {
    epoch++;
    fetching = null;
    fetchAgain = false;
    set({ ...EMPTY });
  },
}));
