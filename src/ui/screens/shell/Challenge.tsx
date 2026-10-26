// Väljakutse lingiga (2.38.0, docs/CHALLENGE.md): the challenge a link opens, sending one from a free shift's report,
// the comparison in a challenge run's report and the player's challenges in the multiplayer menu. Styles in
// challenge.css.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { useGame } from '@/store/game';
import { useAccount } from '@/net/account';
import {
  challengeCodeFromPath,
  challengeUrl,
  createChallenge,
  fetchChallenge,
  fetchMyChallenges,
  submitChallengeOnce,
  type Challenge,
  type ChallengeReply,
  type ChallengeRow,
} from '@/net/challenges';
import { ApiError } from '@/net/api';
import { useLang, useT } from '@/i18n';
import { sfx } from '@/audio/sfx';
import {
  challengeShiftOptions,
  challengeStats,
  markChallenge,
  shiftWhen,
  type ChallengeStats,
  type ShiftSetup,
} from '@/sim/challenge';
import { hhmm, HOUR } from '@/sim/time';
import type { ShiftReport } from '@/sim/types';
import { Button, Modal, PlayerAvatar, Spinner } from '@/ui/components';
import { regionSummary, VERSION } from './helpers';
import { VkLayer } from './VkLayer';
import './challenge.css';

// ── The link (/v/<code>) ─────────────────────────────────────────────────────

/** A challenge link the game was opened with: remembered until the player has seen it. */
export const useChallengeLink = create<{ code: string | null; set: (code: string | null) => void }>()((set) => ({
  code: null,
  set: (code) => set({ code }),
}));

/** Read a challenge link from the address once (the address goes back to the game's own). */
export function takeChallengeLink(): void {
  if (typeof location === 'undefined') return;
  const code = challengeCodeFromPath(location.pathname);
  if (!code) return;
  useChallengeLink.getState().set(code);
  try {
    history.replaceState(null, '', '/');
  } catch {
    /* an address that cannot change: the code is remembered anyway */
  }
}

/** Opens the challenge of a link once the player is in the menu (after signing in, or as a guest). */
export function ChallengeGate() {
  const code = useChallengeLink((s) => s.code);
  const screen = useGame((s) => s.screen);
  if (!code || (screen !== 'menu' && screen !== 'lobby')) return null;
  return <ChallengeModal code={code} onClose={() => useChallengeLink.getState().set(null)} />;
}

// ── What the shift is ────────────────────────────────────────────────────────

function useShiftLine(setup: ShiftSetup) {
  const t = useT();
  const lang = useLang();
  const when = shiftWhen(setup.start)[lang];
  return {
    region: regionSummary(setup.regionId).name[lang],
    regionShort: t(`account.lb.region.${setup.regionId}`),
    when,
    line: t('challenge.shiftLine', {
      when: when.charAt(0).toUpperCase() + when.slice(1),
      from: hhmm(setup.start),
      to: hhmm(setup.start + setup.hours * HOUR),
      hours: setup.hours,
      difficulty: t(`shell.diff.${setup.difficulty}`),
    }),
    weather: setup.weather ? t(`shell.weather.${setup.weather}`) : null,
  };
}

/** Start a challenge run: the same shift, marked with the challenge's code. */
function startChallenge(ch: Challenge): void {
  const g = useGame.getState();
  g.startShift(challengeShiftOptions(ch.setup, g.user?.name ?? 'Dispetšer'));
  const sim = useGame.getState().sim;
  if (sim) markChallenge(sim, ch.code);
  sfx.play('dispatch');
}

/** The text that goes with the link: who, how many points, where and when. */
function useShareText(ch: Challenge | null, row: Pick<ChallengeRow, 'score'> | null, name: string) {
  const t = useT();
  const lang = useLang();
  if (!ch || !row) return '';
  return t('challenge.share.text', {
    name,
    score: row.score,
    region: t(`account.lb.region.${ch.setup.regionId}`),
    when: shiftWhen(ch.setup.start)[lang],
  });
}

/** Share the link (the phone's share sheet) or copy it. Resolves 'copied' when it went to the clipboard. */
async function shareLink(title: string, text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  const nav = globalThis.navigator;
  if (nav?.share) {
    try {
      await nav.share({ title, text, url });
      return 'shared';
    } catch (e) {
      // The player closed the sheet: nothing to do. Anything else: copy instead.
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }
  try {
    await nav.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** The link in a box with its buttons: share (or copy) and copy. */
function LinkBox({ ch, text }: { ch: Challenge; text: string }) {
  const t = useT();
  const url = challengeUrl(ch.code);
  const [note, setNote] = useState<string | null>(null);
  const done = (r: 'shared' | 'copied' | 'failed') => setNote(r === 'copied' ? t('challenge.copied') : null);
  return (
    <div className="vk-chal__link">
      <input
        className="vk-input vk-mono"
        readOnly
        value={url}
        aria-label={t('challenge.title')}
        onFocus={(e) => e.currentTarget.select()}
        data-testid="challenge-link"
      />
      <div className="vk-chal__linkBtns">
        <Button size="sm" variant="primary" onClick={() => void shareLink(t('challenge.share.title'), text, url).then(done)}>
          {t('challenge.share')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void globalThis.navigator.clipboard
              ?.writeText(url)
              .then(() => setNote(t('challenge.copied')))
              .catch(() => setNote(null))
          }
        >
          {t('challenge.copy')}
        </Button>
      </div>
      {note && (
        <p className="vk-chal__note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}

// ── The board ────────────────────────────────────────────────────────────────

function Board({ rows, me }: { rows: ChallengeRow[]; me: ChallengeRow | null }) {
  const t = useT();
  const listed = !!me && rows.some((r) => r.me);
  const all = me && !listed ? [...rows, me] : rows;
  return (
    <table className="vk-table vk-chal__board" data-testid="challenge-board">
      <caption>{t('challenge.board')}</caption>
      <thead>
        <tr>
          <th scope="col" className="is-num">
            {t('account.lb.col.rank')}
          </th>
          <th scope="col">{t('account.lb.col.name')}</th>
          <th scope="col">{t('account.lb.col.grade')}</th>
          <th scope="col" className="is-num">
            {t('account.lb.col.score')}
          </th>
        </tr>
      </thead>
      <tbody>
        {all.map((r, i) => (
          <tr key={`${r.name}-${i}`} className={r.me ? 'is-me' : undefined}>
            <td className="is-num vk-mono">{r.rank}</td>
            <td>
              <span className="vk-chal__who">
                <PlayerAvatar avatar={r.avatar} name={r.name} size={22} />
                <span>{r.name}</span>
                {r.me && <span className="vk-dim">({t('challenge.you')})</span>}
                {r.sender && !r.me && <span className="vk-dim">({t('challenge.sender')})</span>}
              </span>
            </td>
            <td>{r.grade}</td>
            <td className="is-num vk-mono">{r.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function playersText(t: ReturnType<typeof useT>, n: number): string {
  return n === 1 ? t('challenge.players.1') : t('challenge.players', { n });
}

// ── The challenge a link opens ───────────────────────────────────────────────

export function ChallengeModal({
  code,
  initial,
  onClose,
}: {
  code: string;
  initial?: Challenge;
  onClose: () => void;
}) {
  const t = useT();
  const account = useAccount((s) => s.user);
  const gameUser = useGame((s) => s.user);
  const loggedIn = !!account && gameUser?.method === 'account';
  const [ch, setCh] = useState<Challenge | null>(initial ?? null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>(initial ? 'ok' : 'loading');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchChallenge(code)
      .then((c) => {
        if (!alive) return;
        setCh(c);
        setState('ok');
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setState(e instanceof ApiError && e.status === 404 ? 'missing' : (prev) => (prev === 'ok' ? 'ok' : 'error'));
      });
    return () => {
      alive = false;
    };
  }, [code, reload, account?.id]);

  const sender = ch?.results.find((r) => r.sender) ?? null;
  const own = !!ch && !!account && ch.by.name.toLocaleLowerCase('et') === account.name.toLocaleLowerCase('et');
  const shareText = useShareText(ch, sender, ch?.by.name ?? '');

  return (
    <VkLayer>
      <Modal
        open
        onClose={onClose}
        title={t('challenge.title')}
        width={600}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('challenge.close')}
            </Button>
            {ch && state === 'ok' && (
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  startChallenge(ch);
                }}
                data-testid="challenge-accept"
              >
                {ch.me ? t('challenge.again') : t('challenge.accept')}
              </Button>
            )}
          </>
        }
      >
        <div className="vk-chal" data-testid="challenge-modal">
          {state === 'loading' && !ch ? (
            <p className="vk-chal__state" role="status">
              <Spinner size={14} /> {t('challenge.loading')}
            </p>
          ) : state === 'missing' ? (
            <p className="vk-chal__state">{t('challenge.notFound')}</p>
          ) : !ch ? (
            <div className="vk-chal__state">
              <span>{t('challenge.error')}</span>
              <Button size="sm" variant="ghost" onClick={() => setReload((n) => n + 1)}>
                {t('account.lb.retry')}
              </Button>
            </div>
          ) : (
            <ChallengeBody ch={ch} own={own} loggedIn={loggedIn} sender={sender} shareText={shareText} />
          )}
        </div>
      </Modal>
    </VkLayer>
  );
}

function ChallengeBody({
  ch,
  own,
  loggedIn,
  sender,
  shareText,
}: {
  ch: Challenge;
  own: boolean;
  loggedIn: boolean;
  sender: ChallengeRow | null;
  shareText: string;
}) {
  const t = useT();
  const s = useShiftLine(ch.setup);
  return (
    <>
      <header className="vk-chal__head">
        <PlayerAvatar avatar={ch.by.avatar} name={ch.by.name || '?'} size={44} />
        <div>
          <h3 className="vk-chal__from">{own ? t('challenge.own') : t('challenge.from', { name: ch.by.name })}</h3>
          {sender && (
            <p className="vk-chal__theirs">
              {t('challenge.theirs', { name: ch.by.name, score: sender.score, grade: sender.grade })}
            </p>
          )}
        </div>
      </header>
      <dl className="vk-kv vk-chal__shift">
        <div>
          <dt>{t('challenge.shift')}</dt>
          <dd>
            <strong>{s.region}</strong>
            <br />
            {s.line}
            {s.weather ? ` · ${s.weather}` : ''}
          </dd>
        </div>
      </dl>
      <p className="vk-chal__about">
        {t('challenge.same')}
        {ch.setup.crisis ? ` ${t('challenge.crisisMay')}` : ''}
      </p>
      {ch.version && ch.version !== VERSION && (
        <p className="vk-chal__note" data-testid="challenge-version">
          {t('challenge.version', { version: ch.version })}
        </p>
      )}
      {ch.me && <p className="vk-chal__note">{t('challenge.played', { score: ch.me.score, rank: ch.me.rank })}</p>}
      {!loggedIn && <p className="vk-chal__note">{t('challenge.guest')}</p>}
      <div className="vk-chal__boardHead">
        <span className="vk-label">{t('challenge.board')}</span>
        <span className="vk-meta">{playersText(t, ch.players)}</span>
      </div>
      <Board rows={ch.results} me={ch.me} />
      {own && <LinkBox ch={ch} text={shareText} />}
    </>
  );
}

// ── Sending one from a free shift's report ───────────────────────────────────

/** "Saada väljakutse" in the report of a free shift another player can play the same (ShiftReport.setup). */
export function ChallengeSendPanel({ report }: { report: ShiftReport }) {
  const t = useT();
  const account = useAccount((s) => s.user);
  const gameUser = useGame((s) => s.user);
  const backend = useAccount((s) => s.backend);
  const loggedIn = !!account && gameUser?.method === 'account';
  const [state, setState] = useState<{ k: 'idle' } | { k: 'busy' } | { k: 'ok'; ch: Challenge } | { k: 'error' }>({
    k: 'idle',
  });
  const mine = useMemo(() => challengeStats(report), [report]);
  const ch = state.k === 'ok' ? state.ch : null;
  const text = useShareText(ch, mine, account?.name ?? report.playerName);
  if (!report.setup || backend !== 'online') return null;
  const send = () => {
    setState({ k: 'busy' });
    createChallenge(report, VERSION)
      .then((c) => {
        setState({ k: 'ok', ch: c });
        sfx.play('click');
      })
      .catch(() => setState({ k: 'error' }));
  };
  return (
    <Section title={t('challenge.send')} id="vk-rep-challenge" testId="challenge-send">
      <p className="vk-chal__about">{t('challenge.send.about')}</p>
      {!loggedIn ? (
        <p className="vk-rep__line is-hint">{t('challenge.send.guest')}</p>
      ) : state.k === 'ok' ? (
        <>
          <p className="vk-chal__ready">{t('challenge.send.ready')}</p>
          <p className="vk-chal__preview">„{text}“</p>
          <LinkBox ch={state.ch} text={text} />
        </>
      ) : (
        <div className="vk-chal__send">
          <Button variant="primary" onClick={send} disabled={state.k === 'busy'} data-testid="challenge-send-go">
            {state.k === 'busy' ? (
              <>
                <Spinner size={13} /> {t('challenge.send.busy')}
              </>
            ) : (
              t('challenge.send')
            )}
          </Button>
          {state.k === 'error' && <span className="vk-rep__line is-error">{t('challenge.send.error')}</span>}
        </div>
      )}
    </Section>
  );
}

function Section({ title, id, testId, children }: { title: string; id: string; testId: string; children: ReactNode }) {
  return (
    <section className="vk-panel vk-chal__panel" aria-labelledby={id} data-testid={testId}>
      <div className="vk-panel__head">
        <h2 className="vk-h" id={id}>
          {title}
        </h2>
      </div>
      <div className="vk-chal__body">{children}</div>
    </section>
  );
}

// ── A challenge run's report: side by side ───────────────────────────────────

type CompareKey = keyof Pick<ChallengeStats, 'score' | 'closed' | 'arrests' | 'p1' | 'crisis'>;

/** Who did better on a line: 1 the player, -1 the other, 0 the same or not comparable. */
function better(key: CompareKey, mine: number | null, theirs: number | null): number {
  if (mine === null || theirs === null || mine === theirs) return 0;
  // Less is better only for the time to the first crew.
  return (key === 'p1' ? mine < theirs : mine > theirs) ? 1 : -1;
}

/** The comparison and the board in a challenge run's report; an account's run goes on the board once. */
export function ChallengeReportPanel({ report, code }: { report: ShiftReport; code: string }) {
  const t = useT();
  const account = useAccount((s) => s.user);
  const gameUser = useGame((s) => s.user);
  const loggedIn = !!account && gameUser?.method === 'account';
  const mine = useMemo(() => challengeStats(report), [report]);
  const [reply, setReply] = useState<ChallengeReply | null>(null);
  const [ch, setCh] = useState<Challenge | null>(null);
  const [state, setState] = useState<'sending' | 'done' | 'error'>('sending');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState('sending');
    const job = loggedIn
      ? submitChallengeOnce(report, code).then((r) => {
          if (!alive) return;
          setReply(r);
          setCh(r.challenge);
        })
      : fetchChallenge(code).then((c) => {
          if (alive) setCh(c);
        });
    job.then(() => alive && setState('done')).catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [report, code, loggedIn, attempt]);

  // The other side: the sender, or when the player sent it themself, the best of the others.
  const other = ch ? (ch.results.find((r) => r.sender && !r.me) ?? ch.results.find((r) => !r.me) ?? null) : null;
  const text = useShareText(ch, ch?.results.find((r) => r.sender) ?? null, ch?.by.name ?? '');
  const lines: { key: CompareKey; label: string; fmt: (v: number) => string }[] = [
    { key: 'score', label: t('challenge.stat.score'), fmt: (v) => String(v) },
    { key: 'closed', label: t('challenge.stat.closed'), fmt: (v) => String(v) },
    { key: 'arrests', label: t('challenge.stat.arrests'), fmt: (v) => String(v) },
    { key: 'p1', label: t('challenge.stat.p1'), fmt: (v) => t('challenge.min', { n: v.toFixed(1) }) },
    ...(mine.crisis !== null || other?.crisis !== null
      ? [{ key: 'crisis' as const, label: t('challenge.stat.crisis'), fmt: (v: number) => `${v}/100` }]
      : []),
  ];
  const verdict = other ? better('score', mine.score, other.score) : 0;

  return (
    <Section title={t('challenge.rep.title')} id="vk-rep-challenge" testId="challenge-report">
      {state === 'sending' ? (
        <p className="vk-rep__line is-hint" role="status">
          <Spinner size={13} /> {t('challenge.rep.sending')}
        </p>
      ) : state === 'error' ? (
        <p className="vk-rep__line is-error">
          {t('challenge.rep.error')}
          <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
            {t('challenge.rep.retry')}
          </Button>
        </p>
      ) : (
        <>
          {other ? (
            <p className={`vk-chal__verdict is-${verdict > 0 ? 'win' : verdict < 0 ? 'lose' : 'tie'}`} data-testid="challenge-verdict">
              {verdict > 0
                ? t('challenge.rep.win', { name: other.name })
                : verdict < 0
                  ? t('challenge.rep.lose', { name: other.name })
                  : t('challenge.rep.tie')}
            </p>
          ) : (
            <p className="vk-rep__line is-hint">{t('challenge.rep.none')}</p>
          )}
          {reply && (
            <p className="vk-rep__line">
              {reply.counted
                ? reply.rank
                  ? t('challenge.rep.rank', { rank: reply.rank, players: reply.players })
                  : null
                : t('challenge.rep.practice')}
            </p>
          )}
          {!loggedIn && <p className="vk-rep__line is-hint">{t('challenge.guest')}</p>}
          {other && (
            <table className="vk-table vk-chal__vs" data-testid="challenge-compare">
              <caption>{t('challenge.rep.vs', { name: other.name })}</caption>
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col" className="is-num">
                    {t('challenge.col.you')}
                  </th>
                  <th scope="col" className="is-num">
                    {other.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const a = mine[l.key];
                  const b = other[l.key];
                  const w = better(l.key, a, b);
                  return (
                    <tr key={l.key}>
                      <th scope="row">{l.label}</th>
                      <td className={`is-num vk-mono${w > 0 ? ' is-best' : ''}`}>
                        {a === null ? '-' : l.fmt(a)}
                        {l.key === 'score' ? ` (${mine.grade})` : ''}
                      </td>
                      <td className={`is-num vk-mono${w < 0 ? ' is-best' : ''}`}>
                        {b === null ? '-' : l.fmt(b)}
                        {l.key === 'score' ? ` (${other.grade})` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {ch && ch.results.length > 1 && (
            <>
              <div className="vk-chal__boardHead">
                <span className="vk-label">{t('challenge.board')}</span>
                <span className="vk-meta">{playersText(t, ch.players)}</span>
              </div>
              <Board rows={ch.results} me={ch.me} />
            </>
          )}
          {ch && (
            <div className="vk-chal__pass">
              <span className="vk-label">{t('challenge.passOn')}</span>
              <LinkBox ch={ch} text={text} />
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ── The player's challenges (multiplayer menu) ───────────────────────────────

export function ChallengeList() {
  const t = useT();
  const account = useAccount((s) => s.user);
  const [list, setList] = useState<Challenge[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<Challenge | null>(null);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    fetchMyChallenges()
      .then((l) => alive && setList(l))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [account]);

  if (!account || error) return null;
  return (
    <section className="vk-panel vk-chal__panel" aria-labelledby="vk-mp-challenges" data-testid="challenge-list">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-mp-challenges">
          {t('challenge.list.title')}
        </h2>
        {list && list.length > 0 && <span className="vk-count">{list.length}</span>}
      </div>
      <div className="vk-chal__body">
        <p className="vk-chal__about">{t('challenge.list.about')}</p>
        {list === null ? (
          <p className="vk-chal__state" role="status">
            <Spinner size={14} />
          </p>
        ) : list.length === 0 ? (
          <p className="vk-chal__state">{t('challenge.list.empty')}</p>
        ) : (
          <ul className="vk-chal__list">
            {list.map((c) => (
              <ListItem key={c.code} ch={c} mineName={account.name} onOpen={() => setOpen(c)} />
            ))}
          </ul>
        )}
      </div>
      {open && <ChallengeModal code={open.code} initial={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function ListItem({ ch, mineName, onOpen }: { ch: Challenge; mineName: string; onOpen: () => void }) {
  const t = useT();
  const s = useShiftLine(ch.setup);
  const sent = ch.by.name.toLocaleLowerCase('et') === mineName.toLocaleLowerCase('et');
  return (
    <li>
      <button type="button" className="vk-chal__item" onClick={onOpen}>
        <PlayerAvatar avatar={ch.by.avatar} name={ch.by.name || '?'} size={28} />
        <span className="vk-chal__itemText">
          <strong>
            {s.regionShort} · {s.when}
          </strong>
          <span className="vk-dim">
            {sent ? t('challenge.list.sent') : t('challenge.list.by', { name: ch.by.name })} · {playersText(t, ch.players)}
          </span>
        </span>
        {ch.me && (
          <span className="vk-chal__itemScore vk-mono">
            {ch.me.rank}. · {ch.me.score}
          </span>
        )}
      </button>
    </li>
  );
}
