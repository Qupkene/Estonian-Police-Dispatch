// Edetabel: every leaderboard result, filtered by name, region and mode; add, edit, delete.
import { useState } from 'react';
import { api, qs, type Score } from '../api';
import { MODES, REGIONS } from '../labels';
import { LoadState, Pager, SearchInput, Select, useLoad } from '../ui';
import { ScoreDialog, ScoreTable } from './results';

const LIMIT = 50;

export function Scores() {
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [mode, setMode] = useState('');
  const [sort, setSort] = useState('at');
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const path = `/admin/scores${qs({ q, region, mode, sort, limit: LIMIT, offset })}`;
  const loaded = useLoad(() => api<{ total: number; scores: Score[] }>('GET', path), path);
  const reset =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setOffset(0);
    };
  return (
    <section>
      <div className="pn-head">
        <h1>Edetabel</h1>
        <button type="button" className="pn-btn pn-btn--primary" onClick={() => setAdding(true)}>
          Lisa tulemus
        </button>
      </div>
      <div className="pn-filters">
        <SearchInput value={q} placeholder="Mängija nimi" onChange={reset(setQ)} />
        <Select
          label="Piirkond"
          value={region}
          options={REGIONS}
          all="Kõik piirkonnad"
          onChange={reset(setRegion)}
        />
        <Select label="Režiim" value={mode} options={MODES} all="Kõik režiimid" onChange={reset(setMode)} />
        <Select
          label="Järjekord"
          value={sort}
          options={{ at: 'Uuemad ees', score: 'Suurem skoor ees' }}
          onChange={reset(setSort)}
        />
      </div>
      <LoadState loaded={loaded}>
        {loaded.data && (
          <>
            <ScoreTable rows={loaded.data.scores} showName onChanged={loaded.reload} />
            <Pager total={loaded.data.total} limit={LIMIT} offset={offset} onOffset={setOffset} />
          </>
        )}
      </LoadState>
      {adding && <ScoreDialog onClose={() => setAdding(false)} onSaved={loaded.reload} />}
    </section>
  );
}
