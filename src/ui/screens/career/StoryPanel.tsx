// The career's story (docs/STORY.md) as a compact Valvekaart panel on the career page: the chapter strip, the
// speaker's intro, the objectives, and the question a character waits to have answered (or what the next chapter
// waits for). Rules and texts in src/sim/story.ts and src/data/story.ts; styles in career.css.
import { useMemo, useState } from 'react';
import { useCareer } from '@/store/career';
import { useLang, useT, useTx } from '@/i18n';
import { STORY_CHAPTERS } from '@/data/story';
import { castPerson, storyOf, storyView } from '@/sim/story';
import type { CareerProfile } from '@/sim/types';
import { Modal } from '@/ui/components';
import { MonoNumbers } from '../shell/notices';
import { safe } from './helpers';
import { useToast } from './Toasts';

type SegState = 'done' | 'current' | 'locked' | 'before';

export function StoryPanel({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const notify = useToast();
  const view = useMemo(() => safe(() => storyView(profile), null), [profile]);
  const cast = useMemo(
    () =>
      safe(() => {
        const st = storyOf(profile);
        return (['mentor', 'prefect', 'colleague', 'union', 'journalist'] as const).map((id) =>
          castPerson(profile, id, st),
        );
      }, []),
    [profile],
  );
  const [open, setOpen] = useState(false);
  if (!view) return null;
  const quote = (s: string) => (lang === 'et' ? `„${s}“` : `“${s}”`);

  const segState = (n: number): SegState =>
    n < view.from
      ? 'before'
      : n < view.chapter || (n === view.chapter && view.state !== 'active')
        ? 'done'
        : n === view.chapter
          ? 'current'
          : 'locked';

  const answer = (id: string) => {
    let err;
    try {
      err = useCareer.getState().answerChoice(id);
    } catch (e) {
      console.warn('[EPD career] story answer failed', e);
      notify('danger', t('story.answerFailed'), t('career.actionError'));
      return;
    }
    if (err) notify('danger', t('story.answerFailed'), tx(err));
    else notify('ok', t('story.answered'));
  };

  return (
    <section className={`vk-panel cr-story is-${view.state}`} aria-labelledby="cr-story-title">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="cr-story-title">
          {t('story.chapterTitle', { n: view.chapter, title: tx(view.title) })}
        </h2>
        <span className="vk-panel__meta">
          <span className="vk-mono">{t('story.of', { n: view.chapter, total: view.total })}</span>
          {view.started && (
            <>
              {' · '}
              {t('story.since', { day: view.since })}
            </>
          )}
        </span>
      </div>
      <div className="cr-story__body">
        {/* ── The chapter: the strip and the speaker ── */}
        <div className="cr-story__lead">
          <ol className="cr-story__strip" aria-label={t('story.strip')}>
            {STORY_CHAPTERS.map((c, i) => {
              const n = i + 1;
              const s = segState(n);
              return (
                <li
                  key={c.id}
                  className={`is-${s}`}
                  title={`${n}. ${tx(c.title)}`}
                  aria-label={t('story.seg', { n, title: tx(c.title), state: t(`story.state.${s}`) })}
                >
                  <span className="cr-story__segn vk-mono" aria-hidden="true">
                    {n}
                  </span>
                  <span className="cr-story__segt" aria-hidden="true">
                    {tx(c.title)}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="cr-story__who">
            <strong>{view.intro.who.name}</strong>
            <span>{tx(view.intro.who.role)}</span>
          </p>
          <blockquote className="cr-story__quote">{quote(tx(view.intro.text))}</blockquote>
          <p className="cr-story__more">
            <button type="button" className="vk-linkbtn" onClick={() => setOpen(true)}>
              {t('story.readAll')}
            </button>
          </p>
        </div>

        {/* ── Objectives ── */}
        <div className="cr-story__goals">
          <p className="cr-story__label">
            <span className="vk-label">{t('story.goals')}</span>
            <span
              className="vk-mono cr-story__count"
              title={t('story.metOf', { need: view.need, total: view.objectives.length })}
            >
              {t('story.met', { met: view.met, need: view.need })}
            </span>
          </p>
          <ul className="cr-story__list">
            {view.objectives.map((o) => (
              <li key={o.id} className={o.done ? 'is-done' : undefined}>
                <span
                  className="cr-story__tick"
                  aria-label={t(o.done ? 'story.goalDone' : 'story.goalOpen')}
                  role="img"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    {o.done ? (
                      <path d="M3 7.4 5.8 10 11 4.2" />
                    ) : (
                      <rect x="2.5" y="2.5" width="9" height="9" rx="1.5" />
                    )}
                  </svg>
                </span>
                <span className="cr-story__goal">{tx(o.text)}</span>
                {o.progress && <span className="vk-mono cr-story__prog">{o.progress}</span>}
              </li>
            ))}
          </ul>
          {view.state === 'active' && view.met >= view.need && view.shiftsLeft > 0 && (
            <p className="cr-story__small cr-story__left">
              {view.shiftsLeft === 1
                ? t('story.shiftsLeftOne')
                : t('story.shiftsLeft', { n: view.shiftsLeft })}
            </p>
          )}
        </div>

        {/* ── The question, the next chapter, or the end ── */}
        <div className="cr-story__side">
          {view.choice ? (
            <div className="cr-story__ask" data-choice={view.choice.id}>
              <p className="cr-story__label">
                <span className="vk-label">{t('story.ask')}</span>
                <span className="vk-meta">{t('shell.menu.note.day', { day: view.choice.day })}</span>
              </p>
              <p className="cr-story__who">
                <strong>{view.choice.who.name}</strong>
                <span>{tx(view.choice.who.role)}</span>
              </p>
              <p className="cr-story__asktext">
                <MonoNumbers text={tx(view.choice.text)} />
              </p>
              <div className="cr-story__opts">
                {view.choice.options.map((o, i) => (
                  <div key={o.id} className="cr-story__opt">
                    <button
                      type="button"
                      className={`vk-btn${i === 0 ? '' : ' vk-btn--ghost'}`}
                      disabled={o.short}
                      title={o.short ? t('story.noMoney') : undefined}
                      onClick={() => answer(o.id)}
                    >
                      {tx(o.label)}
                    </button>
                    <span className="cr-story__note">
                      <MonoNumbers text={tx(o.note)} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : view.state === 'waiting' && view.next ? (
            <div className="cr-story__next">
              <p className="cr-story__label">
                <span className="vk-label">{t('story.waiting')}</span>
              </p>
              <p className="cr-story__nexttitle">
                {t('story.next', { title: `${view.next.chapter}. ${tx(view.next.title)}` })}
              </p>
              {view.next.needs.length ? (
                <>
                  <p className="cr-story__small">{t('story.nextNeeds')}</p>
                  <ul className="cr-rank__unlocks">
                    {view.next.needs.map((n, i) => (
                      <li key={i}>
                        <span aria-hidden="true">·</span>
                        <MonoNumbers text={tx(n)} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="cr-story__small">{t('story.nextReady')}</p>
              )}
            </div>
          ) : view.state === 'told' ? (
            <p className="cr-story__small cr-story__told">{t('story.told')}</p>
          ) : (
            <div className="cr-story__cast">
              <p className="cr-story__label">
                <span className="vk-label">{t('story.cast')}</span>
              </p>
              <ul>
                {cast.map((c) => (
                  <li key={c.name}>
                    <strong>{c.name}</strong>
                    <span>{tx(c.role)}</span>
                  </li>
                ))}
              </ul>
              {!view.started && <p className="cr-story__small">{t('story.notStarted')}</p>}
            </div>
          )}
        </div>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('story.chapterTitle', { n: view.chapter, title: tx(view.title) })}
        width={560}
      >
        <div className="cr-story__modal" lang={lang}>
          <p className="cr-story__summary">{tx(view.summary)}</p>
          <p className="vk-label">{t('story.intro')}</p>
          <p className="cr-story__who">
            <strong>{view.intro.who.name}</strong>
            <span>{tx(view.intro.who.role)}</span>
          </p>
          <blockquote className="cr-story__quote is-full">{quote(tx(view.intro.text))}</blockquote>
          {view.from > 1 && <p className="cr-story__small">{t('story.before', { n: view.from })}</p>}
          <p className="vk-label">{t('story.cast')}</p>
          <ul className="cr-story__castlist">
            {cast.map((c) => (
              <li key={c.name}>
                <strong>{c.name}</strong>
                <span>{tx(c.role)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </section>
  );
}
