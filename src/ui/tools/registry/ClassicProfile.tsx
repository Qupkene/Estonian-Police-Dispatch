// "Klassikaline vaade": the person rendered like the 2024 "Politsei Andmebaas" profile (nostalgia).
import type { Person, SimState } from '@/sim/types';
import { lawById } from '@/data/laws';
import { Avatar } from '@/ui/components';
import { useT, useTx } from '@/i18n';
import { ageAt, isoToEt, lawIdLabel } from '../lib/helpers';
import { faceFor } from '@/gen/face';

export function ClassicProfile({ person: p, sim: s }: { person: Person; sim: SimState }) {
  const t = useT();
  const tx = useTx();
  const age = ageAt(p.birthDate, s.now);
  const a = p.appearance;
  return (
    <div className="tl-classic">
      <div className="tl-classic__header">{t('tools.classic.header')}</div>
      <div className="tl-classic__body">
        <div className="tl-classic__profile">
          <div className="tl-classic__pic">
            <Avatar seed={p.avatarSeed} face={faceFor(s, p)} size={150} gender={p.gender} age={age} hair={a.hair} hairColor={a.hairColor} beard={a.beard} glasses={a.glasses} />
          </div>
          <div className="tl-classic__info">
            <h3>
              {p.firstName} {p.lastName}
            </h3>
            <p>
              {t('tools.classic.age')}: {age}
            </p>
            <p>
              {t('tools.classic.job')}: {tx(p.occupation)}
            </p>
            <p>
              {t('tools.classic.home')}: {p.city || p.address}
            </p>
            <div className="tl-classic__crimes">
              <h4>{t('tools.classic.cases')}</h4>
              <ul>
                {p.records.length === 0 && <li>{t('tools.classic.noCases')}</li>}
                {p.records.map((r, i) => {
                  const law = lawById(r.lawId);
                  return (
                    <li key={i}>
                      {law ? tx(law.title) : lawIdLabel(r.lawId)} ({isoToEt(r.date)})
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="tl-classic__wanted">
              <h4>{t('tools.classic.wanted', { v: p.flags.wanted ? t('tools.yes') : t('tools.no') })}</h4>
            </div>
          </div>
        </div>
      </div>
      <div className="tl-classic__caption">{t('tools.classic.caption')}</div>
    </div>
  );
}
