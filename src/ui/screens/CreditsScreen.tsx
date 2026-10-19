// Credits, data sources and licences. Owned by ui-shell.
import { useT } from '@/i18n';
import { ShellPage } from './shell/ShellPage';
import { VERSION } from './shell/helpers';
import './shell/pages.css';

interface Source {
  name: string;
  licence: string;
  descKey: string;
  url: string;
}

const DATA: Source[] = [
  {
    name: 'geoBoundaries',
    licence: 'CC BY 4.0',
    descKey: 'shell.cred.src.geob',
    url: 'https://www.geoboundaries.org',
  },
  {
    name: 'Natural Earth',
    licence: 'Public domain',
    descKey: 'shell.cred.src.ne',
    url: 'https://www.naturalearthdata.com',
  },
  {
    name: '© OpenStreetMap contributors',
    licence: 'ODbL',
    descKey: 'shell.cred.src.osm',
    url: 'https://www.openstreetmap.org/copyright',
  },
  {
    name: 'Protomaps',
    licence: 'BSD-3-Clause',
    descKey: 'shell.cred.src.protomaps',
    url: 'https://protomaps.com',
  },
  {
    name: 'Maa- ja Ruumiamet',
    licence: 'Maa- ja Ruumiameti litsents',
    descKey: 'shell.cred.src.maaamet',
    url: 'https://maaruum.ee',
  },
];

const SOFTWARE: Source[] = [
  {
    name: 'Noto Sans',
    licence: 'SIL OFL 1.1',
    descKey: 'shell.cred.src.noto',
    url: 'https://fonts.google.com/noto',
  },
  {
    name: 'Inter',
    licence: 'SIL OFL 1.1',
    descKey: 'shell.cred.src.inter',
    url: 'https://rsms.me/inter/',
  },
  {
    name: 'Archivo',
    licence: 'SIL OFL 1.1',
    descKey: 'shell.cred.src.archivo',
    url: 'https://fonts.google.com/specimen/Archivo',
  },
  {
    name: 'Instrument Sans',
    licence: 'SIL OFL 1.1',
    descKey: 'shell.cred.src.instrument',
    url: 'https://fonts.google.com/specimen/Instrument+Sans',
  },
  {
    name: 'JetBrains Mono',
    licence: 'SIL OFL 1.1',
    descKey: 'shell.cred.src.jbm',
    url: 'https://www.jetbrains.com/lp/mono/',
  },
  {
    name: 'MapLibre GL JS',
    licence: 'BSD-3-Clause',
    descKey: 'shell.cred.src.maplibre',
    url: 'https://maplibre.org',
  },
  {
    name: 'React · zustand · Vite',
    licence: 'MIT',
    descKey: 'shell.cred.src.react',
    url: 'https://react.dev',
  },
];

export function CreditsScreen() {
  const t = useT();
  return (
    <ShellPage title={t('shell.cred.title')} subtitle={t('shell.cred.subtitle')} meta={`EPD ${VERSION}`}>
      <div className="vk-cred">
        <div className="vk-cred__col">
          <section className="vk-panel" aria-labelledby="vk-cred-people">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-cred-people">
                {t('shell.cred.original')}
              </h2>
            </div>
            <table className="vk-table">
              <caption>{t('shell.cred.original')}</caption>
              <tbody>
                {['qupkene', '0kimum'].map((n) => (
                  <tr key={n}>
                    <th scope="row" className="vk-cred__name">
                      {n}
                    </th>
                    <td className="vk-cred__where">Discord</td>
                    <td>{t('shell.cred.originalRole')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="vk-panel" aria-labelledby="vk-cred-remake">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-cred-remake">
                {t('shell.cred.remake')}
              </h2>
            </div>
            <div className="vk-panel__body">
              <p>{t('shell.cred.remakeText')}</p>
            </div>
          </section>
          <section className="vk-panel" aria-labelledby="vk-cred-thanks">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-cred-thanks">
                {t('shell.cred.thanks')}
              </h2>
            </div>
            <div className="vk-panel__body">
              <p>{t('shell.cred.thanksText')}</p>
            </div>
          </section>
          <section className="vk-panel" aria-labelledby="vk-cred-legal">
            <div className="vk-panel__head">
              <h2 className="vk-h" id="vk-cred-legal">
                {t('shell.cred.legal')}
              </h2>
            </div>
            <div className="vk-panel__body">
              <p className="vk-cred__disclaimer">{t('core.disclaimer')}</p>
              <p>{t('shell.cred.research')}</p>
              <p>{t('shell.cred.emblem')}</p>
            </div>
          </section>
        </div>
        <div className="vk-cred__col">
          <SourceTable id="data" title={t('shell.cred.data')} items={DATA} />
          <SourceTable id="libs" title={t('shell.cred.libs')} items={SOFTWARE} />
        </div>
      </div>
    </ShellPage>
  );
}

function SourceTable({ id, title, items }: { id: string; title: string; items: Source[] }) {
  const t = useT();
  return (
    <section className="vk-panel" aria-labelledby={`vk-cred-${id}`}>
      <div className="vk-panel__head">
        <h2 className="vk-h" id={`vk-cred-${id}`}>
          {title}
        </h2>
        <span className="vk-count">{items.length}</span>
      </div>
      <table className="vk-table vk-cred__src">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{t('shell.cred.col.name')}</th>
            <th scope="col">{t('shell.cred.col.use')}</th>
            <th scope="col">{t('shell.cred.col.licence')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.name}>
              <th scope="row" className="vk-cred__srcName">
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.name}
                </a>
              </th>
              <td>{t(s.descKey)}</td>
              <td className="vk-cred__licence">{s.licence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
