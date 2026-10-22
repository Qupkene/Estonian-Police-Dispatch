// Ülevaade: the counts, the last 30 days and the best players.
import { api, type Stats } from '../api';
import { bytes, label, n, ROOM_STATES } from '../labels';
import { LoadState, useLoad } from '../ui';

export function Dashboard() {
  const loaded = useLoad(() => api<Stats>('GET', '/admin/stats'), 'stats');
  const s = loaded.data;
  return (
    <section>
      <div className="ad-head">
        <h1>Ülevaade</h1>
        <button
          type="button"
          className="ad-btn ad-btn--small"
          onClick={loaded.reload}
          disabled={loaded.loading}
        >
          Värskenda
        </button>
      </div>
      <LoadState loaded={loaded}>
        {s && (
          <>
            <div className="ad-cards">
              <Card title="Kontod" big={s.users.total} href="#/kontod">
                <Line k="Uued 24 h" v={s.users.new1d} />
                <Line k="Uued 7 päeva" v={s.users.new7d} />
                <Line k="Uued 30 päeva" v={s.users.new30d} />
                <Line k="Sees käinud 24 h" v={s.users.active1d} />
                <Line k="Sees käinud 7 päeva" v={s.users.active7d} />
                <Line k="Adminid" v={s.users.admins} />
                <Line k="Blokeeritud" v={s.users.disabled} />
              </Card>
              <Card title="Edetabel" big={s.scores.total} href="#/tulemused">
                <Line k="Viimased 7 päeva" v={s.scores.last7d} />
                <Line k="Mängijaid edetabelis" v={s.scores.players} />
              </Card>
              <Card title="Päeva väljakutse" big={s.daily.total} href="#/paev">
                <Line k="Täna" v={s.daily.today} />
              </Card>
              <Card title="Ruumid" big={Object.values(s.rooms).reduce((a, b) => a + b, 0)} href="#/ruumid">
                {Object.entries(s.rooms).map(([state, count]) => (
                  <Line key={state} k={label(ROOM_STATES, state)} v={count} />
                ))}
              </Card>
              <Card title="Andmed" big={bytes(s.db.bytes)} href="#/varu">
                <Line k="Pilvesalvestusi" v={s.saves.count} />
                <Line k="Salvestuste maht" v={bytes(s.saves.bytes)} />
                <Line k="Skeemi versioon" v={s.db.schema} />
              </Card>
            </div>
            <div className="ad-grid2">
              <div className="ad-panel">
                <h2>Viimased 30 päeva</h2>
                <Chart
                  now={s.now}
                  series={[
                    { name: 'Uued kontod', data: s.series.signups, cls: 'acc' },
                    { name: 'Edetabeli tulemused', data: s.series.scores, cls: 'ok' },
                  ]}
                />
              </div>
              <div className="ad-panel">
                <h2>Parimad mängijad</h2>
                {s.top.length === 0 ? (
                  <p className="ad-empty">Edetabel on tühi.</p>
                ) : (
                  <table className="ad-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Mängija</th>
                        <th className="num">Parim</th>
                        <th className="num">Vahetusi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.top.map((t, i) => (
                        <tr key={t.id}>
                          <td className="mono">{i + 1}</td>
                          <td>
                            <a href={`#/kontod/${t.id}`}>{t.name}</a>
                          </td>
                          <td className="num">{t.best}</td>
                          <td className="num">{t.shifts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </LoadState>
    </section>
  );
}

function Card({
  title,
  big,
  href,
  children,
}: {
  title: string;
  big: number | string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a className="ad-card" href={href}>
      <span className="ad-card__title">{title}</span>
      <span className="ad-card__big">{typeof big === 'number' ? n(big) : big}</span>
      <dl className="ad-card__lines">{children}</dl>
    </a>
  );
}

function Line({ k, v }: { k: string; v: number | string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{typeof v === 'number' ? n(v) : v}</dd>
    </div>
  );
}

/** Thirty days as paired bars, newest on the right. */
function Chart({
  now,
  series,
}: {
  now: number;
  series: { name: string; data: Record<string, number>; cls: string }[];
}) {
  const days: string[] = [];
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  for (let i = 29; i >= 0; i--) days.push(fmt.format(now - i * 86400_000));
  const max = Math.max(1, ...series.flatMap((s) => days.map((d) => s.data[d] ?? 0)));
  return (
    <div className="ad-chart">
      <div className="ad-chart__legend">
        {series.map((s) => (
          <span key={s.name}>
            <i className={`ad-dot ad-dot--${s.cls}`} /> {s.name}
          </span>
        ))}
        <span className="ad-chart__max">kuni {max} päevas</span>
      </div>
      <div className="ad-chart__bars" role="img" aria-label="Uued kontod ja tulemused päevade kaupa">
        {days.map((d) => (
          <div
            key={d}
            className="ad-chart__day"
            title={`${d.slice(8)}.${d.slice(5, 7)}: ${series.map((s) => `${s.name} ${s.data[d] ?? 0}`).join(', ')}`}
          >
            {series.map((s) => (
              <span
                key={s.name}
                className={`ad-bar ad-bar--${s.cls}`}
                style={{ height: `${((s.data[d] ?? 0) / max) * 100}%` }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="ad-chart__axis">
        <span>{`${days[0].slice(8)}.${days[0].slice(5, 7)}`}</span>
        <span>täna</span>
      </div>
    </div>
  );
}
