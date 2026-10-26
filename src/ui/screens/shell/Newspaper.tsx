// Classic broadsheet front page rendering ShiftReport.newspaper.
import { useMemo, useState } from 'react';
import type { Lang, ShiftReport, Text } from '@/sim/types';
import { useT } from '@/i18n';
import { drawingForPaper, drawingSrc } from './paper/drawings';
import { crisisById } from '@/data/crises';
import { crisisArt } from '@/ui/game/crisis/art';
import './newspaper.css';

export function Newspaper({
  paper,
  lang,
  issue,
  weather,
  extra,
  photoKey,
}: {
  paper: ShiftReport['newspaper'];
  lang: Lang;
  issue?: number;
  weather?: string;
  /** A signed piece about the career's story (docs/STORY.md), set after the lead story. */
  extra?: { title: Text; body: Text; byline: string } | null;
  /** The shift the page is for (ShiftReport.shiftKey): the same report keeps its photo, the next one gets another. */
  photoKey?: string;
}) {
  const t = useT();
  const key = photoKey ?? `${paper.date}|${paper.headline.et}`;
  const drawing = useMemo(() => drawingForPaper(key, paper.topics), [key, paper.topics]);
  // Offline before the drawing was ever loaded (it is not precached): the old sketch instead.
  const [failed, setFailed] = useState<string | null>(null);
  const photo = drawing && failed !== drawing.id ? drawing : undefined;
  // A page that leads with a major incident shows the owner's drawing of it (2.37.0).
  const crisisSrc = paper.crisis && failed !== paper.crisis ? crisisArt(paper.crisis) : undefined;
  const crisisTitle = paper.crisis ? crisisById(paper.crisis)?.title : undefined;
  const own = paper.stories ?? [];
  const stories: { title: Text; body: Text; byline?: string }[] = extra
    ? [...own.slice(0, 1), extra, ...own.slice(1, 3)]
    : own;
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
          <div className={`sh-paper__halftone${photo || crisisSrc ? ' is-drawing' : ''}`}>
            {crisisSrc ? (
              <img
                src={crisisSrc}
                alt={crisisTitle ? crisisTitle[lang] || crisisTitle.et : ''}
                decoding="async"
                onError={() => setFailed(paper.crisis!)}
              />
            ) : photo ? (
              <img
                {...drawingSrc(photo)}
                sizes="(max-width: 600px) 92vw, (max-width: 1100px) 46vw, 320px"
                width={photo.w}
                height={photo.h}
                alt={photo.alt[lang] || photo.alt.et}
                decoding="async"
                onError={() => setFailed(photo.id)}
              />
            ) : (
              <svg aria-hidden="true" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
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
            )}
          </div>
          <figcaption>
            {crisisSrc && crisisTitle ? (
              <>
                <span aria-hidden="true">{crisisTitle[lang] || crisisTitle.et}. </span>
                {t('shell.paper.credit')}
              </>
            ) : photo ? (
              <>
                {/* The image's alt already says this: a screen reader hears it once, then the credit. */}
                <span aria-hidden="true">{photo.alt[lang] || photo.alt.et}. </span>
                {t('shell.paper.credit')}
              </>
            ) : (
              t('shell.paper.caption')
            )}
          </figcaption>
        </figure>
        {stories.map((s, i) => (
          <section
            key={i}
            className={`sh-paper__story${i === 0 ? ' is-lead' : ''}${s.byline ? ' is-signed' : ''}`}
          >
            <h4>{s.title[lang] || s.title.et}</h4>
            {s.byline && <p className="sh-paper__byline">{s.byline}</p>}
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
