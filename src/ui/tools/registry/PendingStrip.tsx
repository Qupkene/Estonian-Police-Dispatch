// "Ametnik ootab vastust" — reply strip shown on a record that an officer is asking about.
import type { RadioMsg } from '@/sim/types';
import { replyRadio } from '@/sim/commands';
import { hhmm } from '@/sim/time';
import { Button, Icon } from '@/ui/components';
import { useT, useTx } from '@/i18n';
import { run } from '../lib/engine';

const REPLY_TONE: Record<string, 'success' | 'danger' | 'warning' | 'secondary'> = {
  clean: 'success',
  wanted: 'danger',
  stolen: 'danger',
  ownerwanted: 'danger',
  restraining: 'warning',
  nolicense: 'warning',
  noinsurance: 'warning',
  noinspection: 'warning',
  suspended: 'warning',
  probation: 'warning',
  weapon: 'warning',
};

export function PendingStrip({ msgs }: { msgs: RadioMsg[] }) {
  const t = useT();
  const tx = useTx();
  if (!msgs.length) return null;
  return (
    <div className="tl-waiting" role="region" aria-label={t('tools.reg.officerWaiting')}>
      {msgs.map((m) => (
        <div key={m.id} className="tl-waiting__item">
          <div className="tl-waiting__head">
            <Icon name="radio" size={14} />
            <strong>{t('tools.reg.officerWaiting')}</strong>
            <span className="tl-waiting__from mono">{m.from}</span>
            <span className="tl-waiting__time mono">{hhmm(m.t)}</span>
          </div>
          <p className="tl-waiting__text">“{tx(m.text)}”</p>
          <div className="tl-waiting__replies">
            {(m.replies ?? []).map((r) => (
              <Button key={r.id} size="sm" variant={REPLY_TONE[r.id] ?? 'secondary'} onClick={() => run((s) => replyRadio(s, m.id, r.id))}>
                {tx(r.label)}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
