// Varukoopiad: the database copies in data/varu, and one more now.
import { api, type Backup } from '../api';
import { bytes, when } from '../labels';
import { LoadState, useAction, useLoad } from '../ui';

export function Backups() {
  const loaded = useLoad(() => api<{ backups: Backup[] }>('GET', '/admin/backups'), 'backups');
  const run = useAction();
  return (
    <section>
      <div className="pn-head">
        <h1>Varukoopiad</h1>
        <button
          type="button"
          className="pn-btn pn-btn--primary"
          onClick={async () => {
            if (await run(() => api('POST', '/admin/backups'), 'Varukoopia tehtud ja kontrollitud.'))
              loaded.reload();
          }}
        >
          Tee varukoopia kohe
        </button>
      </div>
      <p className="pn-hint">
        Andmebaasi koopiad serveri kaustas data/varu. Uuendus teeb koopia enne iga vahetust ise ja hoiab
        uuemad alles. Siit tehtud koopia kontrollitakse kohe (integrity_check). Taastamine käib serveris:
        docs/DEPLOY.md, punkt Taastamine varukoopiast.
      </p>
      <LoadState loaded={loaded}>
        {loaded.data && (
          <div className="pn-scroll">
            <table className="pn-table">
              <thead>
                <tr>
                  <th>Fail</th>
                  <th>Aeg</th>
                  <th className="num">Maht</th>
                </tr>
              </thead>
              <tbody>
                {loaded.data.backups.map((b) => (
                  <tr key={b.name}>
                    <td className="mono">{b.name}</td>
                    <td className="mono">{when(b.at)}</td>
                    <td className="num">{bytes(b.bytes)}</td>
                  </tr>
                ))}
                {loaded.data.backups.length === 0 && (
                  <tr>
                    <td colSpan={3} className="pn-empty">
                      Varukoopiaid pole veel.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </LoadState>
    </section>
  );
}
