// "Teated" — BOLO, päevakäsk, ilmahoiatused, üritused. Owned by ui-tools. Reads everything from the stores.
import type { Bulletin, SimState } from '@/sim/types';
import { MIN, ddmmyyyy, hhmm } from '@/sim/time';
import { useGame } from '@/store/game';
import { useT, useTx } from '@/i18n';
import { Avatar, Badge, Button, Empty, Icon, type IconName } from '@/ui/components';
import { ageAt } from './lib/helpers';
import { regionOf, useSim } from './lib/engine';
import { Plate } from './parts';
import './tools.css';

const GROUPS: Bulletin['kind'][] = ['order', 'bolo_vehicle', 'bolo_person', 'weather', 'event'];
const GROUP_ICON: Record<Bulletin['kind'], IconName> = {
  order: 'shield',
  bolo_vehicle: 'car',
  bolo_person: 'user',
  weather: 'cloud',
  event: 'flag',
};
const NEW_FOR_MS = 30 * MIN;

export function BulletinsPanel() {
  const t = useT();
  const sim = useSim();
  if (!sim) {
    return (
      <div className="tl-bul">
        <Empty icon="newspaper" title={t('tools.bul.title')}>
          {t('tools.noSim')}
        </Empty>
      </div>
    );
  }
  const all = [...sim.bulletins].sort((a, b) => b.t - a.t);
  if (!all.length) {
    return (
      <div className="tl-bul">
        <Empty icon="newspaper" title={t('tools.bul.title')}>
          {t('tools.bul.empty')}
        </Empty>
      </div>
    );
  }
  return (
    <div className="tl-bul">
      <div className="tl-bul__summary">
        {GROUPS.map((g) => {
          const n = all.filter((b) => b.kind === g).length;
          return n ? (
            <a key={g} className="tl-bul__jump" href={`#tl-bul-${g}`} onClick={(e) => (e.preventDefault(), document.getElementById(`tl-bul-${g}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))}>
              <Icon name={GROUP_ICON[g]} size={13} />
              {n}
            </a>
          ) : null;
        })}
        <span className="tl-bul__count">{t('tools.bul.count', { n: all.length })}</span>
      </div>
      {GROUPS.map((g) => {
        const items = all.filter((b) => b.kind === g);
        if (!items.length) return null;
        return (
          <section key={g} id={`tl-bul-${g}`} className={`tl-bul__group tl-bul__group--${g}`}>
            <h4 className="tl-sec__title">
              <Icon name={GROUP_ICON[g]} size={13} />
              <span>{t(`tools.bul.${g}`)}</span>
              <span className="tl-sec__aside">{items.length}</span>
            </h4>
            <ul role="list" className="tl-bul__list">
              {items.map((b) => (
                <BulletinItem key={b.id} b={b} sim={sim} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function BulletinItem({ b, sim }: { b: Bulletin; sim: SimState }) {
  const t = useT();
  const tx = useTx();
  const isNew = sim.now - b.t < NEW_FOR_MS && sim.now >= b.t;
  const person = b.personId ? sim.persons[b.personId] : undefined;
  const cmd = b.kind === 'order' ? regionOf(sim).commander : undefined;
  // Only sign the order if the text does not already end with the commander's signature.
  const commander = cmd && !tx(b.text).includes(cmd.name) ? cmd : undefined;
  const sameDay = ddmmyyyy(b.t) === ddmmyyyy(sim.now);
  return (
    <li className={`tl-bitem tl-bitem--${b.kind}${isNew ? ' is-new' : ''}`}>
      <div className="tl-bitem__head">
        <span className="tl-bitem__time mono">{sameDay ? hhmm(b.t) : `${ddmmyyyy(b.t)} ${hhmm(b.t)}`}</span>
        {isNew && <Badge tone="accent">{t('tools.bul.new')}</Badge>}
        <strong className="tl-bitem__title">{tx(b.title)}</strong>
      </div>
      <div className="tl-bitem__body">
        {b.kind === 'bolo_person' && person && (
          <Avatar
            seed={person.avatarSeed}
            size={44}
            gender={person.gender}
            age={ageAt(person.birthDate, sim.now)}
            hair={person.appearance.hair}
            hairColor={person.appearance.hairColor}
            beard={person.appearance.beard}
            glasses={person.appearance.glasses}
          />
        )}
        {b.kind === 'bolo_vehicle' && b.plate && <Plate plate={b.plate} size="md" />}
        <p className="tl-bitem__text">{tx(b.text)}</p>
      </div>
      {commander && <div className="tl-bitem__sign">{t('tools.bul.signed', { name: commander.name, title: tx(commander.title) })}</div>}
      {(b.plate || person) && (
        <div className="tl-bitem__actions">
          {b.plate && (
            <Button size="sm" icon="car" onClick={() => useGame.getState().openRegistry('vehicle', b.plate as string)}>
              {t('tools.bul.openVehicle')}
            </Button>
          )}
          {person && (
            <Button size="sm" icon="user" onClick={() => useGame.getState().openRegistry('person', person.idcode)}>
              {t('tools.bul.openPerson')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
