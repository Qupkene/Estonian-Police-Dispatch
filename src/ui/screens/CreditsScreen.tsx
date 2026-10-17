// Credits, data sources and licences. Owned by ui-shell.
import { useT } from '@/i18n';
import { Badge, Emblem, Icon, type IconName } from '@/ui/components';
import { ShellPage } from './shell/ShellPage';
import { VERSION } from './shell/helpers';
import './shell/pages.css';

interface Source {
  name: string;
  licence: string;
  descKey: string;
  url: string;
  icon: IconName;
}

const DATA: Source[] = [
  {
    name: 'geoBoundaries',
    licence: 'CC BY 4.0',
    descKey: 'shell.cred.src.geob',
    url: 'https://www.geoboundaries.org',
    icon: 'map',
  },
  {
    name: 'Natural Earth',
    licence: 'Public domain',
    descKey: 'shell.cred.src.ne',
    url: 'https://www.naturalearthdata.com',
    icon: 'globe',
  },
  {
    name: '© OpenStreetMap contributors',
    licence: 'ODbL',
    descKey: 'shell.cred.src.osm',
    url: 'https://www.openstreetmap.org/copyright',
    icon: 'route',
  },
  {
    name: '© CARTO',
    licence: 'CC BY 3.0',
    descKey: 'shell.cred.src.carto',
    url: 'https://carto.com/attributions',
    icon: 'layers',
  },
  {
    name: 'Maa- ja Ruumiamet',
    licence: 'Maa- ja Ruumiameti litsents',
    descKey: 'shell.cred.src.maaamet',
    url: 'https://maaruum.ee',
    icon: 'pin',
  },
];

const SOFTWARE: Source[] = [
  {
    name: 'Noto Sans',
    licence: 'SIL OFL 1.1',
    descKey: 'shell.cred.src.noto',
    url: 'https://fonts.google.com/noto',
    icon: 'book',
  },
  {
    name: 'Inter',
    licence: 'SIL OFL 1.1',
    descKey: 'shell.cred.src.inter',
    url: 'https://rsms.me/inter/',
    icon: 'book',
  },
  {
    name: 'JetBrains Mono',
    licence: 'SIL OFL 1.1',
    descKey: 'shell.cred.src.jbm',
    url: 'https://www.jetbrains.com/lp/mono/',
    icon: 'keyboard',
  },
  {
    name: 'MapLibre GL JS',
    licence: 'BSD-3-Clause',
    descKey: 'shell.cred.src.maplibre',
    url: 'https://maplibre.org',
    icon: 'map',
  },
  {
    name: 'React · zustand · Vite',
    licence: 'MIT',
    descKey: 'shell.cred.src.react',
    url: 'https://react.dev',
    icon: 'wrench',
  },
];

export function CreditsScreen() {
  const t = useT();
  return (
    <ShellPage title={t('shell.cred.title')} subtitle={t('shell.cred.subtitle')} icon="star">
      <div className="sh-cred">
        <section className="sh-cred__hero sh-card">
          <Emblem size={72} />
          <div>
            <div className="sh-cred__name">EPD · {t('shell.menu.name')}</div>
            <div className="sh-muted mono">v{VERSION} · politsei.eu</div>
          </div>
        </section>

        <section className="sh-card sh-card--pad sh-cred__people">
          <h2 className="sh-section-title">
            <Icon name="users" size={14} /> {t('shell.cred.original')}
          </h2>
          <div className="sh-cred__authors">
            {['qupkene', '0kimum'].map((n) => (
              <div key={n} className="sh-author">
                <span className="sh-author__avatar" aria-hidden="true">
                  {n[0].toUpperCase()}
                </span>
                <div>
                  <div className="sh-author__name">{n}</div>
                  <div className="sh-author__role">
                    <Badge tone="accent">Discord</Badge> {t('shell.cred.originalRole')}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <h2 className="sh-section-title sh-cred__gap">
            <Icon name="refresh" size={14} /> {t('shell.cred.remake')}
          </h2>
          <p className="sh-cred__text">{t('shell.cred.remakeText')}</p>
          <h2 className="sh-section-title sh-cred__gap">
            <Icon name="star" size={14} /> {t('shell.cred.thanks')}
          </h2>
          <p className="sh-cred__text">{t('shell.cred.thanksText')}</p>
        </section>

        <section className="sh-card sh-card--pad sh-cred__sources">
          <h2 className="sh-section-title">
            <Icon name="map" size={14} /> {t('shell.cred.data')}
          </h2>
          <SourceList items={DATA} />
          <h2 className="sh-section-title sh-cred__gap">
            <Icon name="wrench" size={14} /> {t('shell.cred.libs')}
          </h2>
          <SourceList items={SOFTWARE} />
        </section>

        <section className="sh-card sh-card--pad sh-cred__legal">
          <Icon name="shield" size={20} />
          <div>
            <p>{t('core.disclaimer')}</p>
            <p className="sh-muted">{t('shell.cred.research')}</p>
            <p className="sh-muted">{t('shell.cred.emblem')}</p>
          </div>
        </section>
      </div>
    </ShellPage>
  );
}

function SourceList({ items }: { items: Source[] }) {
  const t = useT();
  return (
    <ul className="sh-src">
      {items.map((s) => (
        <li key={s.name} className="sh-src__item">
          <span className="sh-src__icon">
            <Icon name={s.icon} size={16} />
          </span>
          <div className="sh-src__body">
            <div className="sh-src__head">
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.name}
              </a>
              <Badge tone="neutral">{s.licence}</Badge>
            </div>
            <div className="sh-src__desc">{t(s.descKey)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
