// Päeva väljakutse: results by day (today first), by name and region; add, edit, delete.
import { useState } from 'react';
import { api, qs, type Daily } from '../api';
import { REGIONS, tallinnToday } from '../labels';
import { LoadState, Pager, SearchInput, Select, useLoad } from '../ui';
import { DailyDialog, DailyTable } from './results';

const LIMIT = 50;

export function DailyPage() {
  const [day, setDay] = useState(tallinnToday());
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const path = `/admin/daily${qs({ day, q, region, limit: LIMIT, offset })}`;
  const loaded = useLoad(() => api<{ total: number; daily: Daily[] }>('GET', path), path);
  return (
    <section>
      <div className="ad-head">
        <h1>Päeva väljakutse</h1>
        <button type="button" className="ad-btn ad-btn--primary" onClick={() => setAdding(true)}>
          Lisa tulemus
        </button>
      </div>
      <div className="ad-filters">
        <input
          type="date"
          className="ad-input"
          aria-label="Päev"
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            setOffset(0);
          }}
        />
        <button
          type="button"
          className="ad-btn ad-btn--small"
          onClick={() => {
            setDay(day ? '' : tallinnToday());
            setOffset(0);
          }}
        >
          {day ? 'Kõik päevad' : 'Täna'}
        </button>
        <SearchInput
          value={q}
          placeholder="Mängija nimi"
          onChange={(v) => {
            setQ(v);
            setOffset(0);
          }}
        />
        <Select
          label="Piirkond"
          value={region}
          options={REGIONS}
          all="Kõik piirkonnad"
          onChange={(v) => {
            setRegion(v);
            setOffset(0);
          }}
        />
      </div>
      <LoadState loaded={loaded}>
        {loaded.data && (
          <>
            <DailyTable rows={loaded.data.daily} showName onChanged={loaded.reload} />
            <Pager total={loaded.data.total} limit={LIMIT} offset={offset} onOffset={setOffset} />
          </>
        )}
      </LoadState>
      {adding && <DailyDialog onClose={() => setAdding(false)} onSaved={loaded.reload} />}
    </section>
  );
}
