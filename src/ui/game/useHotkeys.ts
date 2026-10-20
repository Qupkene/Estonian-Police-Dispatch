import { useEffect } from 'react';
import { useGame } from '@/store/game';
import { myRoles } from '@/store/coop';
import { useDirector } from '@/ui/tools/directorStore';
import { acknowledgeNext, dispatchPicked, selectIncident } from './actions';
import { isTypingTarget } from './format';
import { visibleQueue } from './EventQueue';
import { useGameUi } from './uiStore';

const narrow = () => window.matchMedia('(max-width: 1199px)').matches;
const mobile = () => window.matchMedia('(max-width: 899px)').matches;

/**
 * Global CAD hotkeys. Ignored while typing in inputs, when a modal dialog is open, or when another
 * handler (e.g. the 112 call taker) already handled the key.
 */
export function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const g = useGame.getState();
      const ui = useGameUi.getState();
      const s = g.sim;
      if (!s || g.screen !== 'game') return;
      const director = s.mode === 'director';
      const modalOpen = !!document.querySelector('.ui-modal');
      if (modalOpen) return; // Modal handles its own Esc

      const key = e.key;
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      // HUD hidden (cinematic): only H / Space / Esc do anything.
      if (director && !g.hud) {
        if (key === 'h' || key === 'H' || key === 'Escape') {
          g.setHud(true);
          handled();
        } else if (key === ' ') {
          g.togglePause();
          handled();
        }
        return;
      }

      switch (key) {
        case ' ':
        case 'Spacebar':
          g.togglePause();
          return handled();
        case '1':
        case '2':
        case '3':
        case '4':
          g.setSpeed(Number(key));
          return handled();
        case '5':
          if (director) {
            g.setRealtime(!g.realtime);
            return handled();
          }
          return;
        case 'a':
        case 'A':
          // Co-op: A and D are the dispatcher's keys.
          if (myRoles(s)?.includes('dispatch') === false) return;
          acknowledgeNext();
          return handled();
        case 'd':
        case 'D': {
          if (myRoles(s)?.includes('dispatch') === false) return;
          const id = g.selection.incidentId;
          if (id) dispatchPicked(id);
          return handled();
        }
        case 'h':
        case 'H':
          if (director) {
            g.setHud(!g.hud);
            return handled();
          }
          return;
        case 'F2':
          ui.set({ focusQueueN: ui.focusQueueN + 1, drawerOpen: narrow() && !mobile() ? true : ui.drawerOpen, ...(mobile() ? { mobileTab: 'queue' } : {}) });
          return handled();
        case 'F3':
          g.setRightTab('registry');
          if (mobile()) ui.set({ mobileTab: 'panel' });
          return handled();
        case 'F4':
          g.setRightTab('unit');
          ui.set({ dockOpen: true, ...(mobile() ? { mobileTab: 'units' } : {}) });
          return handled();
        case 'F6':
          ui.set({ radioFilter: 'reply', dockOpen: true, ...(mobile() ? { mobileTab: 'radio' } : {}) });
          return handled();
        case 'Escape': {
          const dir = useDirector.getState();
          if (dir.placing) {
            dir.setPlacing(null);
          } else if (ui.drawerOpen) {
            ui.set({ drawerOpen: false });
          } else if (g.selection.incidentId || g.selection.unitId || g.selection.personId || g.selection.plate) {
            g.select({});
          } else {
            ui.set({ pauseOpen: true });
          }
          return handled();
        }
        case 'ArrowDown':
        case 'ArrowUp': {
          const list = visibleQueue(s, ui.queueFilter);
          if (!list.length) return;
          const cur = ui.queueCursor ?? g.selection.incidentId ?? null;
          let i = cur ? list.findIndex((x) => x.id === cur) : -1;
          if (i < 0) i = key === 'ArrowDown' ? 0 : list.length - 1;
          else i = Math.max(0, Math.min(list.length - 1, i + (key === 'ArrowDown' ? 1 : -1)));
          ui.set({ queueCursor: list[i].id });
          return handled();
        }
        case 'Enter': {
          if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return;
          const id = ui.queueCursor;
          if (id && s.incidents[id]) {
            selectIncident(id);
            return handled();
          }
          return;
        }
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
