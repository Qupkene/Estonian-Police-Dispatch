// The original 2024 and 2025 versions, playable in a new tab. Owned by ui-shell.
import { useT } from '@/i18n';
import { ShellPage } from './shell/ShellPage';
import './shell/pages.css';

const base = import.meta.env.BASE_URL;

function open(file: string) {
  window.open(`${base}legacy/${file}`, '_blank', 'noopener');
}

export function LegacyScreen() {
  const t = useT();
  return (
    <ShellPage title={t('shell.leg.title')} subtitle={t('shell.leg.intro')}>
      <div className="vk-leg">
        <article className="vk-panel vk-legcard" aria-labelledby="vk-leg-2024">
          <div className="vk-panel__head">
            <h2 className="vk-h" id="vk-leg-2024">
              2024
            </h2>
            <span className="vk-panel__meta">{t('shell.leg.v2024')}</span>
          </div>
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
          <div className="vk-legcard__body">
            <h3 className="vk-legcard__title">„Politsei Andmebaas“</h3>
            <p>{t('shell.leg.v2024desc')}</p>
            <ul className="vk-legcard__list">
              <li>{t('shell.leg.v2024f1')}</li>
              <li>{t('shell.leg.v2024f2')}</li>
              <li>{t('shell.leg.v2024f3')}</li>
            </ul>
          </div>
          <div className="vk-panel__foot">
            <button
              type="button"
              className="vk-btn vk-btn--primary"
              onClick={() => open('politseimang-2024.html')}
            >
              {t('shell.leg.open')}
            </button>
          </div>
        </article>

        <article className="vk-panel vk-legcard" aria-labelledby="vk-leg-2025">
          <div className="vk-panel__head">
            <h2 className="vk-h" id="vk-leg-2025">
              2025
            </h2>
            <span className="vk-panel__meta">{t('shell.leg.v2025')}</span>
          </div>
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
          <div className="vk-legcard__body">
            <h3 className="vk-legcard__title">{t('shell.leg.v2025name')}</h3>
            <p>{t('shell.leg.v2025desc')}</p>
            <ul className="vk-legcard__list">
              <li>{t('shell.leg.v2025f1')}</li>
              <li>{t('shell.leg.v2025f2')}</li>
              <li>{t('shell.leg.v2025f3')}</li>
            </ul>
          </div>
          <div className="vk-panel__foot">
            <button
              type="button"
              className="vk-btn vk-btn--primary"
              onClick={() => open('politseimang-2025.html')}
            >
              {t('shell.leg.open')}
            </button>
          </div>
        </article>
      </div>
      <p className="vk-msg is-warn vk-leg__note">{t('shell.leg.note')}</p>
    </ShellPage>
  );
}
