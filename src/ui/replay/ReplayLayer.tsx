// Kordus (2.39.0, docs/REPLAY.md): the replay opens over whatever screen asked for it (the report, the history). The
// viewer and the map are their own chunk, loaded when the first replay opens.
import { lazy, Suspense } from 'react';
import { useT } from '@/i18n';
import { useReplay } from '@/store/replay';
import { Spinner } from '@/ui/components';
import { VkLayer } from '@/ui/screens/shell/VkLayer';

const ReplayScreen = lazy(() => import('./ReplayScreen').then((m) => ({ default: m.ReplayScreen })));

export function ReplayLayer() {
  const open = useReplay((s) => s.open);
  const t = useT();
  if (!open) return null;
  return (
    <VkLayer>
      <Suspense
        fallback={
          <div className="rp-wait" role="status">
            <Spinner size={22} />
            <span>{t('replay.card.wait')}</span>
          </div>
        }
      >
        <ReplayScreen key={`${open.rep.key}|${open.at ?? ''}|${open.inc ?? ''}|${open.unit ?? ''}`} open={open} />
      </Suspense>
    </VkLayer>
  );
}
