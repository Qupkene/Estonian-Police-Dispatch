// "Andmebaas": homage to the 2024 "Politsei Andmebaas". Owned by ui-tools. Reads everything from the stores.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Person, RadioMsg, SimState, Vehicle } from '@/sim/types';
import { markChecked } from '@/sim/commands';
import { coopIssue, myRoles } from '@/store/coop';
import { hhmm } from '@/sim/time';
import { useGame } from '@/store/game';
import { useLang, useT, useTx } from '@/i18n';
import { Avatar, Button, Empty, Icon, IconButton, Segmented } from '@/ui/components';
import { ageAt, isLegend, querySubject, queriesForRecord, uncheckedLinks, vehicleByPlate, type RecordRef } from './lib/helpers';
import { pending, pFlags, run, searchP, searchV, TEMPLATES_BY_ID, useSim, vFlags } from './lib/engine';
import { FlagDots, Plate } from './parts';
import { useRegistryUi, type RegMode, type RegResults, type RegView } from './lib/registryUi';
import { PersonCard } from './registry/PersonCard';
import { VehicleCard } from './registry/VehicleCard';
import { ClassicProfile } from './registry/ClassicProfile';
import './tools.css';

type Mode = RegMode;
type View = RegView;
type Results = RegResults;

const CLASSIC_KEY = 'epd:tools:classic';

function readClassic(): boolean {
  try {
    return localStorage.getItem(CLASSIC_KEY) === '1';
  } catch {
    return false;
  }
}

function refOf(v: View): RecordRef {
  return v.kind === 'person' ? { personId: v.id } : { plate: v.plate };
}

export function RegistryPanel() {
  const t = useT();
  const sim = useSim();
  const registryQuery = useGame((g) => g.registryQuery);
  const selPerson = useGame((g) => g.selection.personId);
  const selPlate = useGame((g) => g.selection.plate);
  const shift = sim ? `${sim.seed}:${sim.startTime}` : '';

  const ui = useRegistryUi();
  const { mode, input, results, trail, showHistory } = ui.shift === shift ? ui : { ...ui, mode: 'person' as Mode, input: '', results: null, trail: [] as View[], showHistory: false };
  const [classic, setClassic] = useState(readClassic);
  const inputRef = useRef<HTMLInputElement>(null);
  const view = trail[trail.length - 1] ?? null;
  const setUi = useRegistryUi.getState().set;
  const setMode = (m: Mode) => setUi({ mode: m });
  const setInput = (v: string) => setUi({ input: v });
  const setTrail = (fn: (tr: View[]) => View[]) => setUi({ trail: fn(useRegistryUi.getState().trail) });
  const setShowHistory = (fn: (h: boolean) => boolean) => setUi({ showHistory: fn(useRegistryUi.getState().showHistory) });

  const open = (v: View, push = false) => setTrail((tr) => (push ? [...tr, v] : [v]));

  const doSearch = (kind: Mode, q: string) => {
    const query = q.trim();
    if (!query) return;
    const out = run((s) => (kind === 'person' ? searchP(s, query).map((p) => p.id) : searchV(s, query).map((v) => v.plate))) ?? [];
    setUi({
      results: { kind, q: query, ids: out },
      showHistory: false,
      trail: out.length === 1 ? [kind === 'person' ? { kind: 'person', id: out[0] } : { kind: 'vehicle', plate: out[0] }] : [],
    });
  };

  // New shift → fresh panel state.
  useEffect(() => {
    if (shift) useRegistryUi.getState().syncShift(shift);
  }, [shift]);

  // External requests: openRegistry(kind, q) from radio / incident panel / bulletins (each request handled once).
  useEffect(() => {
    if (!registryQuery || registryQuery.n === useRegistryUi.getState().handledN) return;
    useRegistryUi.getState().syncShift(shift);
    setUi({ handledN: registryQuery.n, mode: registryQuery.kind, input: registryQuery.q });
    doSearch(registryQuery.kind, registryQuery.q);
  }, [registryQuery?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selection-based requests: select({ personId } | { plate }, 'registry').
  useEffect(() => {
    const key = selPerson ? `p:${selPerson}` : selPlate ? `v:${selPlate}` : '';
    if (key === useRegistryUi.getState().handledSel) return;
    setUi({ handledSel: key });
    if (!key) return;
    if (selPerson) open({ kind: 'person', id: selPerson });
    else if (selPlate) open({ kind: 'vehicle', plate: selPlate });
  }, [selPerson, selPlate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opening a record linked to an open incident counts as "checked".
  const viewKey = view ? (view.kind === 'person' ? `p:${view.id}` : `v:${view.plate}`) : '';
  useEffect(() => {
    if (!view) return;
    const s = useGame.getState().sim;
    if (!s) return;
    const ref = refOf(view);
    const ids = uncheckedLinks(s, ref);
    if (!ids.length) return;
    if (s.coop) {
      // Co-op: the radio desk's checks go through the room (cosmetic for the others, so skipped).
      if (myRoles(s)?.includes('radio')) for (const id of ids) coopIssue('check', [id, ref.personId ?? '', ref.plate ?? '']);
      return;
    }
    run((st) => ids.forEach((id) => markChecked(st, id, ref)));
  }, [viewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleClassic = () => {
    setClassic((c) => {
      try {
        localStorage.setItem(CLASSIC_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  if (!sim) {
    return (
      <div className="tl-reg">
        <Empty icon="search" title={t('tools.reg.title')}>
          {t('tools.noSim')}
        </Empty>
      </div>
    );
  }

  const pendQueries = pending(sim).filter((m) => m.kind === 'query');

  const openSubject = (ref: RecordRef | null) => {
    if (!ref) return;
    if (ref.personId) {
      const p = sim.persons[ref.personId];
      if (!p) return;
      setMode('person');
      setInput(p.idcode);
      doSearch('person', p.idcode);
      open({ kind: 'person', id: p.id });
    } else if (ref.plate) {
      setMode('vehicle');
      setInput(ref.plate);
      doSearch('vehicle', ref.plate);
      open({ kind: 'vehicle', plate: ref.plate });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    doSearch(mode, input);
  };

  return (
    <div className="tl-reg">
      <div className="tl-reg__top">
        <div className="tl-reg__bar">
          <Segmented<Mode>
            size="sm"
            label={t('tools.reg.title')}
            value={mode}
            onChange={(m) => {
              setMode(m);
              inputRef.current?.focus();
            }}
            options={[
              { value: 'person', label: t('tools.reg.mode.person'), icon: 'user' },
              { value: 'vehicle', label: t('tools.reg.mode.vehicle'), icon: 'car' },
            ]}
          />
          <span className="tl-reg__spacer" />
          <IconButton
            icon="clock"
            size="sm"
            label={t('tools.reg.history')}
            className={showHistory ? 'is-on' : undefined}
            onClick={() => setShowHistory((h) => !h)}
          />
          {view?.kind === 'person' && (
            <button type="button" className={`tl-chipbtn${classic ? ' is-on' : ''}`} aria-pressed={classic} onClick={toggleClassic}>
              <Icon name="book" size={13} />
              {t('tools.reg.classic')}
            </button>
          )}
        </div>
        <form className="tl-reg__search" onSubmit={onSubmit} role="search">
          <span className="tl-reg__inputbox">
            <Icon name={mode === 'person' ? 'id' : 'car'} size={15} />
            <input
              ref={inputRef}
              className="mono"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t(mode === 'person' ? 'tools.reg.ph.person' : 'tools.reg.ph.vehicle')}
              aria-label={t(mode === 'person' ? 'tools.reg.ph.person' : 'tools.reg.ph.vehicle')}
              spellCheck={false}
              autoComplete="off"
            />
          </span>
          <Button variant="primary" size="sm" icon="search" onClick={() => doSearch(mode, input)}>
            {t('tools.reg.searchBtn')}
          </Button>
        </form>
      </div>

      {pendQueries.length > 0 && <PendingList sim={sim} msgs={pendQueries} onOpen={openSubject} current={view ? refOf(view) : null} />}

      <div className="tl-reg__body">
        {showHistory || (!view && !results) ? (
          <History sim={sim} onRun={(kind, q) => (setMode(kind), setInput(q), doSearch(kind, q))} />
        ) : view ? (
          <>
            {(results || trail.length > 1) && (
              <nav className="tl-reg__crumbs">
                <button
                  type="button"
                  className="tl-linkbtn"
                  onClick={() => setTrail((tr) => (tr.length > 1 ? tr.slice(0, -1) : []))}
                >
                  <Icon name="chevron-left" size={14} />
                  {trail.length > 1 ? t('tools.back') : t('tools.reg.backToResults')}
                </button>
              </nav>
            )}
            <RecordView
              sim={sim}
              view={view}
              classic={classic}
              pendingMsgs={queriesForRecord(sim, pendQueries, refOf(view), TEMPLATES_BY_ID)}
              onOpen={(v) => open(v, true)}
            />
          </>
        ) : results ? (
          <ResultsList sim={sim} results={results} onOpen={(v) => open(v)} />
        ) : null}
      </div>
    </div>
  );
}

function RecordView({
  sim,
  view,
  classic,
  pendingMsgs,
  onOpen,
}: {
  sim: SimState;
  view: View;
  classic: boolean;
  pendingMsgs: RadioMsg[];
  onOpen: (v: View) => void;
}) {
  const t = useT();
  if (view.kind === 'person') {
    const p = sim.persons[view.id];
    if (!p) return <Empty icon="user">{t('tools.reg.noResults', { q: view.id })}</Empty>;
    if (classic) return <ClassicProfile person={p} sim={sim} />;
    return <PersonCard person={p} sim={sim} pendingMsgs={pendingMsgs} onOpenVehicle={(plate) => onOpen({ kind: 'vehicle', plate })} />;
  }
  const v = vehicleByPlate(sim, view.plate);
  if (!v) return <Empty icon="car">{t('tools.reg.noResults', { q: view.plate })}</Empty>;
  return <VehicleCard vehicle={v} sim={sim} pendingMsgs={pendingMsgs} onOpenPerson={(id) => onOpen({ kind: 'person', id })} />;
}

function ResultsList({ sim, results, onOpen }: { sim: SimState; results: Results; onOpen: (v: View) => void }) {
  const t = useT();
  const tx = useTx();
  const items = useMemo(
    () =>
      results.kind === 'person'
        ? results.ids.map((id) => sim.persons[id]).filter((p): p is Person => !!p)
        : results.ids.map((pl) => vehicleByPlate(sim, pl)).filter((v): v is Vehicle => !!v),
    [results, sim],
  );
  if (!items.length) {
    return (
      <Empty icon="search" title={t('tools.reg.noResults', { q: results.q })}>
        {t(results.kind === 'person' ? 'tools.reg.ph.person' : 'tools.reg.ph.vehicle')}
      </Empty>
    );
  }
  return (
    <div className="tl-results">
      <div className="tl-results__head">{t('tools.reg.results', { n: items.length, q: results.q })}</div>
      <ul className="tl-rows" role="list">
        {results.kind === 'person'
          ? (items as Person[]).map((p) => {
              const age = ageAt(p.birthDate, sim.now);
              return (
                <li key={p.id}>
                  <button type="button" className="tl-row tl-row--person" onClick={() => onOpen({ kind: 'person', id: p.id })}>
                    <Avatar
                      seed={p.avatarSeed}
                      size={38}
                      gender={p.gender}
                      age={age}
                      hair={p.appearance.hair}
                      hairColor={p.appearance.hairColor}
                      beard={p.appearance.beard}
                      glasses={p.appearance.glasses}
                    />
                    <span className="tl-row__main">
                      {p.firstName} {p.lastName}
                      <span className="tl-row__sub">
                        <span className="mono">{p.idcode}</span> · {age} · {p.city}
                      </span>
                    </span>
                    <FlagDots flags={pFlags(p, sim.now)} legend={isLegend(p)} />
                  </button>
                </li>
              );
            })
          : (items as Vehicle[]).map((v) => {
              const owner = v.ownerId ? sim.persons[v.ownerId] : undefined;
              return (
                <li key={v.plate}>
                  <button type="button" className="tl-row" onClick={() => onOpen({ kind: 'vehicle', plate: v.plate })}>
                    <Plate plate={v.plate} size="sm" />
                    <span className="tl-row__main">
                      {v.make} {v.model}
                      <span className="tl-row__sub">
                        {v.year} · {tx(v.color)}
                        {owner ? ` · ${owner.firstName} ${owner.lastName}` : v.ownerCompany ? ` · ${v.ownerCompany}` : ''}
                      </span>
                    </span>
                    <FlagDots flags={vFlags(v, sim)} />
                  </button>
                </li>
              );
            })}
      </ul>
    </div>
  );
}

function PendingList({
  sim,
  msgs,
  onOpen,
  current,
}: {
  sim: SimState;
  msgs: RadioMsg[];
  onOpen: (ref: RecordRef | null) => void;
  current: RecordRef | null;
}) {
  const t = useT();
  const tx = useTx();
  return (
    <div className="tl-pendq">
      <div className="tl-pendq__head">
        <span className="tl-pulse" aria-hidden="true" />
        {t('tools.reg.pending')}
        <span className="tl-pendq__n">{msgs.length}</span>
      </div>
      <ul role="list">
        {msgs.slice(0, 4).map((m) => {
          const ref = querySubject(sim, m, TEMPLATES_BY_ID);
          const isCurrent = !!ref && !!current && ((ref.personId && ref.personId === current.personId) || (ref.plate && ref.plate === current.plate));
          return (
            <li key={m.id} className={isCurrent ? 'is-current' : undefined}>
              <span className="tl-pendq__from mono">{m.from}</span>
              <span className="tl-pendq__text">{tx(m.text)}</span>
              {ref ? (
                <button type="button" className="tl-linkbtn" onClick={() => onOpen(ref)} disabled={!!isCurrent}>
                  {t('tools.reg.pendingOpen')}
                  <Icon name="chevron-right" size={13} />
                </button>
              ) : (
                <span className="tl-pendq__unk">{t('tools.reg.pendingUnknown')}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function History({ sim, onRun }: { sim: SimState; onRun: (kind: Mode, q: string) => void }) {
  const t = useT();
  const lang = useLang();
  const list = [...sim.queries].reverse().slice(0, 40);
  return (
    <div className="tl-history">
      <div className="tl-results__head">
        <Icon name="clock" size={13} /> {t('tools.reg.history')}
      </div>
      {list.length === 0 ? (
        <Empty icon="search" title={t('tools.reg.subtitle')}>
          {t('tools.reg.historyEmpty')}
        </Empty>
      ) : (
        <ul className="tl-rows" role="list">
          {list.map((q, i) => (
            <li key={`${q.t}-${i}`}>
              <button type="button" className="tl-row tl-row--hist" onClick={() => onRun(q.kind, q.query)} title={t('tools.reg.rerun')}>
                <span className="tl-row__time mono">{hhmm(q.t)}</span>
                <Icon name={q.kind === 'person' ? 'user' : 'car'} size={14} />
                <span className="tl-row__main mono">{q.query}</span>
                <span className="tl-row__hits" lang={lang}>
                  {t('tools.reg.hits', { n: q.resultIds.length })}
                </span>
                <Icon name="refresh" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
