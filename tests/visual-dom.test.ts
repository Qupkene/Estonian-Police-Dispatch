// @vitest-environment jsdom
// DOM structure the visual fixes rely on: reply chips outside the narrow text column, the realtime
// label in a span the phone CSS can hide, older toasts rendered compact.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { createShift } from '@/sim/engine';
import { pushRadio } from '@/sim/internal';
import { tallinnTime } from '@/sim/time';
import { useGame } from '@/store/game';
import { RadioPanel } from '@/ui/game/RadioPanel';
import { TopBar } from '@/ui/game/TopBar';
import { Toasts } from '@/ui/game/Toasts';
import { useGameUi } from '@/ui/game/uiStore';
import type { NewShiftOptions } from '@/sim/types';

const OPTS: NewShiftOptions = { seed: 11, regionId: 'pohja', mode: 'free', difficulty: 'normal', start: tallinnTime(2026, 10, 16, 22, 0), hours: 2, playerName: 'Test' };

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  cleanup();
  useGameUi.setState({ toasts: [] });
});
afterAll(() => {
  useGame.setState({ sim: null });
  vi.unstubAllGlobals();
});

describe('radio log (visual-5)', () => {
  it('renders reply chips as their own grid item, not inside the text column', () => {
    const sim = createShift(OPTS);
    pushRadio(sim, {
      from: 'PÕHJA 12',
      to: 'JK',
      kind: 'query',
      level: 'priority',
      text: { et: 'Juhtimine, Põhja 12. Palun isikupäring: Kristo Väli, 50006131495.', en: 'Control, Põhja 12. Person check: Kristo Väli, 50006131495.' },
      replies: [
        { id: 'a', label: { et: 'Puhas, märkeid pole', en: 'Clean' } },
        { id: 'b', label: { et: 'Tagaotsitav, pidage kinni', en: 'Wanted, detain' } },
      ],
      expiresAt: sim.now + 6 * 60_000,
    });
    act(() => useGame.setState({ sim, selection: {} }));
    const { container } = render(createElement(RadioPanel));
    const line = container.querySelector('.gm-rl.is-pending');
    expect(line).not.toBeNull();
    const replies = line!.querySelector(':scope > .gm-rl__replies');
    expect(replies).not.toBeNull();
    expect(replies!.querySelectorAll('.gm-reply')).toHaveLength(2);
    expect(line!.querySelector('.gm-rl__text .gm-replies')).toBeNull();
    expect(line!.querySelector('.gm-rl__text')!.textContent).toContain('Kristo Väli');
  });
});

describe('top bar (visual-10)', () => {
  it('wraps the director realtime label in a span so the phone layout can hide it', () => {
    const sim = createShift({ ...OPTS, mode: 'director' });
    act(() => useGame.setState({ sim, realtime: true, speedIndex: 1 }));
    const { container } = render(createElement(TopBar));
    const rt = container.querySelector('.gm-speed--rt');
    expect(rt).not.toBeNull();
    const label = rt!.querySelector(':scope > span');
    expect(label?.textContent?.trim().length).toBeGreaterThan(0);
    // No bare text node left next to the icon.
    expect([...rt!.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())).toBe(false);
    expect(container.querySelector('.gm-top__end .gm-top__menu')).not.toBeNull();
  });
});

describe('toasts (visual-1)', () => {
  it('only the newest toast is expanded', () => {
    const sim = createShift(OPTS);
    act(() => useGame.setState({ sim }));
    const push = useGameUi.getState().pushToast;
    act(() => {
      push({ kind: 'p1', title: 'game.toast.p1', text: { et: 'Kaklus baari ees', en: 'Fight outside a bar' }, vars: { sub: 'KL · Viru tn' } });
      push({ kind: 'backup', title: 'game.toast.backup', text: { et: 'Vajame lisajõude', en: 'Need backup' }, vars: { sub: 'PÕHJA 21' } });
      push({ kind: 'emergency', title: 'game.toast.emergency', text: { et: 'Ametnik vajab abi, Kopli 5', en: 'Officer down, Kopli 5' } });
      push({ kind: 'ok', title: 'game.toast.p1' });
    });
    const { container } = render(createElement(Toasts));
    const items = [...container.querySelectorAll('.gm-toast')];
    expect(items).toHaveLength(3);
    expect(items.slice(0, -1).every((el) => el.classList.contains('is-compact'))).toBe(true);
    expect(items[items.length - 1].classList.contains('is-compact')).toBe(false);
    // The collapsed ones keep their text as a tooltip.
    expect(items[0].getAttribute('title')).toBeTruthy();
  });
});
