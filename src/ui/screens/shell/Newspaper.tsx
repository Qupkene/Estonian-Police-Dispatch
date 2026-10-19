// Classic broadsheet front page rendering ShiftReport.newspaper.
import type { Lang, ShiftReport } from '@/sim/types';
import { useT } from '@/i18n';
import './newspaper.css';

export function Newspaper({
  paper,
  lang,
  issue,
  weather,
}: {
  paper: ShiftReport['newspaper'];
  lang: Lang;
  issue?: number;
  weather?: string;
}) {
  const t = useT();
  const stories = paper.stories ?? [];
  return (
    <article className="sh-paper" lang={lang} aria-label={t('shell.rep.paper')}>
      <div className="sh-paper__strip">
        <span>{t('shell.paper.issue', { n: issue ?? 1 })}</span>
        <span>{paper.date}</span>
        <span>{t('shell.paper.price')}</span>
      </div>
      <header className="sh-paper__mast">
        <div className="sh-paper__ears">
          <span>{t('shell.paper.earLeft')}</span>
          <span>{weather ?? t('shell.paper.earRight')}</span>
        </div>
        <h2 className="sh-paper__title">{paper.masthead}</h2>
        <div className="sh-paper__motto">{t('shell.paper.motto')}</div>
      </header>
      <div className="sh-paper__rule" />
      <h3 className="sh-paper__headline">{paper.headline[lang] || paper.headline.et}</h3>
      <p className="sh-paper__deck">{paper.sub[lang] || paper.sub.et}</p>
      <div className="sh-paper__body">
        <figure className="sh-paper__photo">
          <div className="sh-paper__halftone" aria-hidden="true">
            <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
              <rect width="320" height="180" className="sh-paper__sky" />
              <path
                d="M0 132 L60 120 L110 128 L170 112 L230 124 L320 116 L320 180 L0 180Z"
                className="sh-paper__ground"
              />
              <g className="sh-paper__car">
                <path d="M96 128 l14-18 h62 l20 18 h22 a6 6 0 0 1 6 6 v12 h-140 v-12 a6 6 0 0 1 6-6z" />
                <rect x="132" y="102" width="22" height="7" rx="2" className="sh-paper__bar" />
                <circle cx="118" cy="148" r="11" />
                <circle cx="196" cy="148" r="11" />
              </g>
            </svg>
          </div>
          <figcaption>{t('shell.paper.caption')}</figcaption>
        </figure>
        {stories.map((s, i) => (
          <section key={i} className={`sh-paper__story${i === 0 ? ' is-lead' : ''}`}>
            <h4>{s.title[lang] || s.title.et}</h4>
            <p>{s.body[lang] || s.body.et}</p>
          </section>
        ))}
        {stories.length === 0 && (
          <section className="sh-paper__story is-lead">
            <p>{t('shell.paper.empty')}</p>
          </section>
        )}
      </div>
      <footer className="sh-paper__foot">
        <span>{t('shell.paper.foot1')}</span>
        <span>{t('shell.paper.foot2')}</span>
        <span>{t('shell.paper.foot3')}</span>
      </footer>
    </article>
  );
}
