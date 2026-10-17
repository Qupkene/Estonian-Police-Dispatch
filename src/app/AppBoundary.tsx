// App error boundaries (used by App.tsx). Kept apart from App so they can be tested without every screen.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { autosave, clearAutosave, loadAutosave, setCrashed, stopLoop, useGame } from '@/store/game';
import { useT } from '@/i18n';
import { Button, Icon } from '@/ui/components';

/** True for the error a failed dynamic import throws (an old build's chunk after a deploy, offline). */
export function isChunkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'ChunkLoadError' ||
    /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(err.message)
  );
}

/** Sound only: if it fails the game goes on silently. */
export class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[EPD] audio bridge failed', error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface BoundaryState {
  failed: boolean;
  error: unknown;
}

/**
 * One exception in any panel used to blank the whole page while the shift ran on and kept saving the
 * broken state. Now the shift pauses (loop stopped, automatic saves off) and the player chooses: save
 * and go to the menu, leave without saving, delete the saved shift or reload. Keyed by screen, so
 * moving to another screen starts clean.
 */
export class AppBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failed: true, error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    stopLoop();
    setCrashed(true);
    console.error('[EPD] screen failed', error, info.componentStack);
  }

  componentWillUnmount() {
    if (this.state.failed) setCrashed(false);
  }

  reset = () => {
    setCrashed(false);
    this.setState({ failed: false, error: null });
  };

  render() {
    return this.state.failed ? <CrashScreen error={this.state.error} onDone={this.reset} /> : this.props.children;
  }
}

function CrashScreen({ error, onDone }: { error: unknown; onDone: () => void }) {
  const t = useT();
  const g = useGame.getState();
  const sim = g.screen === 'game' ? g.sim : null;
  const canSave = !!sim && sim.mode !== 'director';
  // The escape hatch when the saved shift itself is what breaks (menu or resume crashing every time).
  const hasSave = safeHasSave();
  const chunk = isChunkError(error);
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  const act = (fn: () => void) => () => {
    try {
      fn();
    } catch (err) {
      console.error('[EPD] recovery failed', err);
    }
    onDone();
  };
  const saveAndMenu = act(() => {
    if (sim) autosave(sim);
    useGame.getState().quitShift();
  });
  const toMenu = act(() => useGame.getState().quitShift());
  const discard = act(() => {
    clearAutosave();
    useGame.getState().quitShift();
  });

  return (
    <div className="app-crash" role="alert">
      <div className="app-crash__card">
        <Icon name="warning" size={28} className="app-crash__icon" />
        <h1 className="app-crash__title">{t('game.crash.title')}</h1>
        <p className="app-crash__text">{chunk ? t('game.crash.chunk') : sim ? t('game.crash.textShift') : t('game.crash.text')}</p>
        <div className="app-crash__actions">
          {canSave && (
            <Button variant="primary" icon="download" block onClick={saveAndMenu}>
              {t('game.crash.save')}
            </Button>
          )}
          <Button variant={canSave ? 'secondary' : 'primary'} icon="home" block onClick={toMenu}>
            {sim ? t('game.crash.menuNoSave') : t('game.toMenu')}
          </Button>
          {hasSave && (
            <Button variant="danger" icon="close" block onClick={discard}>
              {t('game.crash.discard')}
            </Button>
          )}
          <Button variant="ghost" icon="refresh" block onClick={() => location.reload()}>
            {t('game.crash.reload')}
          </Button>
        </div>
        <details className="app-crash__details">
          <summary>{t('game.crash.details')}</summary>
          <code>{detail}</code>
        </details>
      </div>
    </div>
  );
}

function safeHasSave(): boolean {
  try {
    return !!loadAutosave();
  } catch {
    return false;
  }
}
