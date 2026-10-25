// Suurõnnetus in the shift report (2.37.0, docs/CRISIS.md): the owner's drawing, the result, the tasks and the
// decisions. Styles in report.css.
import { useLang, useT } from '@/i18n';
import type { CrisisReport } from '@/sim/crisis';
import { hhmm, MIN } from '@/sim/time';
import type { Text } from '@/sim/types';
import { Icon } from '@/ui/components';
import { crisisArt } from '@/ui/game/crisis/art';

export function CrisisReportPanel({ crisis, lead }: { crisis: CrisisReport; /** Co-op: who commanded. */ lead?: string }) {
  const t = useT();
  const lang = useLang();
  const tx = (x: Text) => x[lang] || x.et;
  const art = crisisArt(crisis.id, true);
  const tone = crisis.result >= 70 ? 'good' : crisis.result >= 45 ? 'mid' : 'bad';
  const mins = crisis.endedAt !== undefined ? Math.round((crisis.endedAt - crisis.at) / MIN) : null;
  return (
    <section className={`vk-panel vk-crep vk-crep--${tone}`} aria-labelledby="vk-rep-crisis" data-testid="report-crisis">
      <div className="vk-panel__head">
        <h2 className="vk-h" id="vk-rep-crisis">
          {t('crisis.rep.title')}
        </h2>
        <span className="vk-count vk-crep__score">{crisis.result}/100</span>
      </div>
      <div className="vk-crep__top">
        {art ? (
          <img className="vk-crep__img" src={art} alt={tx(crisis.title)} />
        ) : (
          <div className="vk-crep__img is-card" role="img" aria-label={tx(crisis.title)}>
            <Icon name="alert" size={22} />
          </div>
        )}
        <div className="vk-crep__facts">
          <strong>{tx(crisis.title)}</strong>
          <span>
            {crisis.address} ·{' '}
            <span className="vk-mono">
              {hhmm(crisis.at)}
              {crisis.endedAt !== undefined ? `-${hhmm(crisis.endedAt)}` : ''}
            </span>
          </span>
          <span>{mins !== null ? t('crisis.rep.took', { n: mins }) : t('crisis.rep.open')}</span>
          <span>{t('crisis.rep.level', { level: t(`game.crisis.level.${crisis.level}`) })}</span>
          {crisis.helped > 0 && <span>{t('crisis.rep.helped', { n: crisis.helped })}</span>}
          {lead && <span>{t('crisis.rep.lead', { name: lead })}</span>}
        </div>
      </div>
      <div className="vk-panel__head vk-rep__subhead">
        <h3 className="vk-h">{t('crisis.rep.tasks')}</h3>
      </div>
      <ul className="vk-crep__list">
        {crisis.tasks.map((task) => (
          <li key={task.id} className={task.escalated ? 'is-bad' : undefined}>
            <span>
              {tx(task.name)}
              {task.escalated && <em> · {t('crisis.rep.escalated')}</em>}
            </span>
            <span className="vk-mono">
              {task.helped ? t('crisis.rep.taskHelped') : task.score !== undefined ? Math.round(task.score) : '-'}
            </span>
          </li>
        ))}
      </ul>
      {crisis.decisions.length > 0 && (
        <>
          <div className="vk-panel__head vk-rep__subhead">
            <h3 className="vk-h">{t('crisis.rep.decisions')}</h3>
          </div>
          <ul className="vk-crep__list">
            {crisis.decisions.map((d) => (
              <li key={d.id}>
                <span>{tx(d.title)}</span>
                <span>
                  <strong>{tx(d.option)}</strong>
                  {d.byDefault && <em> · {t('game.crisis.byStaff')}</em>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
