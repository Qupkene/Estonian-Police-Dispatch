// The original 2024 and 2025 versions, playable in a new tab. Owned by ui-shell.
import { useT } from '@/i18n';
import { Badge, Button, Icon } from '@/ui/components';
import { ShellPage } from './shell/ShellPage';
import './shell/pages.css';

const base = import.meta.env.BASE_URL;

function open(file: string) {
  window.open(`${base}legacy/${file}`, '_blank', 'noopener');
}

export function LegacyScreen() {
  const t = useT();
  return (
    <ShellPage title={t('shell.leg.title')} subtitle={t('shell.leg.subtitle')} icon="book">
      <p className="sh-leg__intro">{t('shell.leg.intro')}</p>
      <div className="sh-leg">
        <article className="sh-card sh-legcard">
          <div className="sh-legprev sh-legprev--2024" aria-hidden="true">
            <div className="sh-legprev__head">Politsei Andmebaas</div>
            <div className="sh-legprev__tabs">
              <span>Kõned</span>
              <span>Ohvitserid</span>
              <span>Otsing</span>
            </div>
            <div className="sh-legprev__rows">
              {['Kakluse teade', 'Varastatud jalgratas', 'Liiklusõnnetus'].map((r) => (
                <div key={r} className="sh-legprev__row">
                  <span>{r}</span>
                  <i className="is-ok">Aktsepteeri</i>
                  <i className="is-no">Keeldu</i>
                </div>
              ))}
            </div>
          </div>
          <div className="sh-legcard__body">
            <div className="sh-legcard__top">
              <Badge tone="gold">2024</Badge>
              <span className="sh-dim">{t('shell.leg.v2024')}</span>
            </div>
            <h2>„Politsei Andmebaas“</h2>
            <p>{t('shell.leg.v2024desc')}</p>
            <ul className="sh-legcard__list">
              <li>
                <Icon name="lock" size={14} /> {t('shell.leg.v2024f1')}
              </li>
              <li>
                <Icon name="list" size={14} /> {t('shell.leg.v2024f2')}
              </li>
              <li>
                <Icon name="search" size={14} /> {t('shell.leg.v2024f3')}
              </li>
            </ul>
            <Button
              variant="primary"
              icon="play"
              iconRight="chevron-right"
              onClick={() => open('politseimang-2024.html')}
            >
              {t('shell.leg.open')}
            </Button>
          </div>
        </article>

        <article className="sh-card sh-legcard">
          <div className="sh-legprev sh-legprev--2025" aria-hidden="true">
            <div className="sh-legprev__head">
              Politsei Andmebaas
              <small>Staatus: 25 · Raha: 10000 · Päev: 1</small>
            </div>
            <div className="sh-legprev__tabs">
              <span>Aktiivsed Kõned</span>
              <span>Profiili Täitmine</span>
              <span>Statistika</span>
            </div>
            <div className="sh-legprev__rows">
              <div className="sh-legprev__row is-alert">
                <span>Toetust vajab!</span>
                <i className="is-no">Saada abi!</i>
              </div>
              <div className="sh-legprev__row">
                <span>Palka ohvitser · 2400 €</span>
                <i className="is-ok">Palka</i>
              </div>
            </div>
          </div>
          <div className="sh-legcard__body">
            <div className="sh-legcard__top">
              <Badge tone="gold">2025</Badge>
              <span className="sh-dim">{t('shell.leg.v2025')}</span>
            </div>
            <h2>{t('shell.leg.v2025name')}</h2>
            <p>{t('shell.leg.v2025desc')}</p>
            <ul className="sh-legcard__list">
              <li>
                <Icon name="star" size={14} /> {t('shell.leg.v2025f1')}
              </li>
              <li>
                <Icon name="users" size={14} /> {t('shell.leg.v2025f2')}
              </li>
              <li>
                <Icon name="siren" size={14} /> {t('shell.leg.v2025f3')}
              </li>
            </ul>
            <Button
              variant="primary"
              icon="play"
              iconRight="chevron-right"
              onClick={() => open('politseimang-2025.html')}
            >
              {t('shell.leg.open')}
            </Button>
          </div>
        </article>
      </div>
      <p className="sh-leg__note">
        <Icon name="warning" size={16} /> {t('shell.leg.note')}
      </p>
    </ShellPage>
  );
}
