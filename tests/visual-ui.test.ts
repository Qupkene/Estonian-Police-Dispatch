// Layout and contrast regressions found in the visual review (toasts over the 112 card, modals
// wider than a phone, dark-on-dark map chrome, stale map focus, light-theme contrast).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { capToasts, MAX_TOASTS, TOAST_TTL, useGameUi, type Toast, type ToastKind } from '@/ui/game/uiStore';
import { useGame } from '@/store/game';
import { tallinnTime } from '@/sim/time';

const css = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
const GAME = css('src/ui/game/game.css');
const TOOLS = css('src/ui/tools/tools.css');
const COMPONENTS = css('src/ui/components/components.css');
const MAP = css('src/map/map.css');
const TOKENS = css('src/ui/styles/tokens.css');
const LOGIN = css('src/ui/screens/shell/login.css');

/** Declarations of the first rule whose selector list is exactly `selector` (comments stripped). */
function rule(src: string, selector: string, from = 0): Record<string, string> {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[}\\s])${esc}\\s*\\{([^}]*)\\}`, 'g');
  re.lastIndex = from;
  const m = re.exec(text);
  if (!m) throw new Error(`no rule for ${selector}`);
  const out: Record<string, string> = {};
  for (const decl of m[2].split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

/** Body of the first @media block whose condition contains `cond`. */
function media(src: string, cond: string): string {
  const start = src.indexOf(`@media ${cond}`);
  if (start < 0) throw new Error(`no @media ${cond}`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(src.indexOf('{', start) + 1, i);
  }
  throw new Error('unbalanced');
}

/** Bodies of every @media block whose condition contains `cond`, one after the other. */
function mediaAll(src: string, cond: string): string {
  let out = '';
  for (let at = src.indexOf(`@media ${cond}`); at >= 0; at = src.indexOf(`@media ${cond}`, at + 1)) {
    out += `${media(src.slice(at), cond)}\n`;
  }
  return out;
}

function lum(hex: string): number {
  const v = hex.replace('#', '').match(/../g)!.map((x) => parseInt(x, 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(v[0]) + 0.7152 * f(v[1]) + 0.0722 * f(v[2]);
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** A token's value in the given block of tokens.css (':root {' or the light theme block). */
function token(block: 'dark' | 'light', name: string): string {
  const start = block === 'dark' ? TOKENS.indexOf(':root {') : TOKENS.indexOf(":root[data-theme='light'] {");
  const body = TOKENS.slice(start, TOKENS.indexOf('}', start));
  const m = body.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`no --${name} in ${block}`);
  return m[1].trim();
}

let seq = 0;
const toast = (kind: ToastKind): Toast => ({ id: ++seq, kind, title: `game.toast.${kind}`, createdAt: seq });

describe('toast stack (visual-1)', () => {
  afterEach(() => {
    vi.useRealTimers();
    useGameUi.setState({ toasts: [] });
  });

  it('never keeps more than three toasts', () => {
    expect(MAX_TOASTS).toBe(3);
    const list = ['p1', 'p1', 'p1', 'p1', 'p1', 'p1'].map((k) => toast(k as ToastKind));
    const out = capToasts(list);
    expect(out).toHaveLength(3);
    // Same rank: the oldest go first, order is kept.
    expect(out.map((t) => t.id)).toEqual(list.slice(-3).map((t) => t.id));
  });

  it('drops the least important toast first, not the officer-in-danger alert', () => {
    const sos = toast('emergency');
    const list = [sos, toast('ok'), toast('p1'), toast('pursuitEnd'), toast('backup')];
    const out = capToasts(list);
    expect(out.map((t) => t.kind)).toEqual(['emergency', 'p1', 'backup']);
    expect(out[0]).toBe(sos);
  });

  it('pushToast applies the cap and the short TTLs', () => {
    vi.useFakeTimers();
    const push = useGameUi.getState().pushToast;
    for (let i = 0; i < 6; i++) push({ kind: 'p1', title: 'game.toast.p1', incidentId: `i${i}` });
    expect(useGameUi.getState().toasts).toHaveLength(3);
    expect(useGameUi.getState().toasts.map((t) => t.incidentId)).toEqual(['i3', 'i4', 'i5']);
    useGameUi.setState({ toasts: [] });
    push({ kind: 'pursuitEnd', title: 'game.toast.pursuitEnd' });
    expect(TOAST_TTL.pursuitEnd).toBeLessThanOrEqual(5_000);
    vi.advanceTimersByTime(5_001);
    expect(useGameUi.getState().toasts).toHaveLength(0);
  });

  it('drops below the 112 call card and moves to the top of the map while a call is up', () => {
    const callZ = Number(rule(TOOLS, '.tl-call')['z-index']);
    const base = rule(GAME, '.gm-toasts');
    const withCall = rule(GAME, '.gm:has(.tl-call) .gm-toasts');
    expect(Number(base['z-index'])).toBeGreaterThan(callZ);
    expect(Number(withCall['z-index'])).toBeLessThan(callZ);
    expect(withCall.bottom).toBe('auto');
    expect(withCall.top).toMatch(/topbar-h/);
    // The phone layout has its own placement (full width at the bottom) and needs the same move.
    expect(media(GAME, '(max-width: 899px)')).toMatch(/\.gm:has\(\.tl-call\) \.gm-toasts\s*\{[^}]*bottom:\s*auto/);
  });

  it('older toasts collapse to one line', () => {
    const compact = rule(GAME, '.gm-toast.is-compact .gm-toast__text');
    expect(compact.display).toBe('none');
    expect(rule(GAME, '.gm-toast.is-compact .gm-toast__body')['white-space']).toBe('nowrap');
  });
});

describe('modals on a phone (visual-2, acc-ui-2)', () => {
  it('the overlay grid has one track as wide as the viewport, so max-width clamps the card', () => {
    const overlay = rule(COMPONENTS, '.ui-modal');
    expect(overlay.display).toBe('grid');
    expect(overlay['grid-template-columns']).toBe('minmax(0, 1fr)');
    expect(rule(COMPONENTS, '.ui-modal__card')['max-width']).toBe('100%');
  });
});

describe('map chrome (visual-3, visual-7)', () => {
  it('keeps light ink on the always-dark map glass in both themes', () => {
    const root = rule(MAP, '.epdm');
    const glass = '#11171c'; // --epdm-glass, nearly opaque
    for (const name of ['--text-0', '--text-1', '--text-2', '--text-3']) {
      expect(root[name], name).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(root[name], glass), name).toBeGreaterThanOrEqual(4.5);
    }
    // Valvekaart's dark blue (its lighter step), the same in both themes on the dark map.
    expect(root['--accent-2']).toBe('#8addff');
  });

  it('gives the marker layer its own stacking context below the toolbar', () => {
    expect(rule(MAP, '.epdm__map')['z-index']).toBe('0');
    expect(Number(rule(MAP, '.epdm-tools')['z-index'])).toBeGreaterThan(0);
  });
});

describe('a new shift opens on its own map view (visual-4)', () => {
  beforeAll(() => {
    // The game loop is not wanted here; startShift schedules it with requestAnimationFrame.
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  it('clears the previous shift focus on start, resume and quit', () => {
    const opts = { seed: 3, regionId: 'pohja' as const, mode: 'free' as const, difficulty: 'normal' as const, start: tallinnTime(2026, 10, 16, 22, 0), hours: 2, playerName: 'Test' };
    const g = useGame.getState();
    g.startShift(opts);
    useGame.getState().focusMap([24.41, 59.3], 13);
    expect(useGame.getState().mapFocus).not.toBeNull();

    useGame.getState().startShift({ ...opts, seed: 4, regionId: 'louna' });
    expect(useGame.getState().mapFocus).toBeNull();

    const sim = useGame.getState().sim!;
    useGame.getState().focusMap([26.7, 58.4], 14);
    useGame.getState().resumeShift(sim);
    expect(useGame.getState().mapFocus).toBeNull();

    useGame.getState().focusMap([26.7, 58.4], 14);
    useGame.getState().quitShift();
    expect(useGame.getState().mapFocus).toBeNull();
  });
});

describe('radio replies and call card layout (visual-5, visual-6)', () => {
  it('reply chips get their own row under the route and text columns', () => {
    expect(rule(GAME, '.gm-rl__replies')['grid-column']).toBe('2 / -1');
  });

  it('short laptop screens shrink the dock while a call is in progress, never when it is closed', () => {
    const block = media(GAME, '(min-width: 900px) and (max-height: 800px)');
    expect(block).toMatch(/\.gm:not\(\.gm--dock-closed\):has\(\.tl-call:not\(\.is-ringing\):not\(\.is-collapsed\)\)/);
    expect(block).toMatch(/--gm-dock-h:\s*150px/);
  });

  it('the call header drops the waveform and number on narrow cards instead of wrapping', () => {
    expect(rule(TOOLS, '.tl-call').container).toBe('tl-call / inline-size');
    expect(TOOLS).toMatch(/@container tl-call \(max-width: 700px\)[\s\S]*?\.tl-call__head \.tl-wave\s*\{\s*display:\s*none/);
    expect(TOOLS).toMatch(/@container tl-call \(max-width: 580px\)[\s\S]*?\.tl-call__head \.tl-call__num\s*\{\s*display:\s*none/);
  });
});

describe('phone layouts (visual-8, visual-10)', () => {
  it('the login screen does not centre content that is taller than the screen', () => {
    expect(rule(LOGIN, '.sh-login')['justify-content']).toBeUndefined();
  });

  it('the top bar speed group gives way so the menu button stays on screen', () => {
    const phone = media(GAME, '(max-width: 899px)');
    expect(phone).toMatch(/\.gm-speed--rt span/);
    expect(phone).toMatch(/\.gm-top__speed\s*\{[^}]*min-width:\s*0[^}]*flex-shrink:\s*1/);
    expect(phone).toMatch(/\.gm-top__end\s*\{[^}]*flex-shrink:\s*0/);
    expect(phone).toMatch(/\.gm-board__filters\s*\{[^}]*flex-wrap:\s*wrap/);
    // The PAUSED badge stacks under the clock instead of pushing the speed buttons off screen.
    expect(phone).toMatch(/\.gm-top__clock \.gm-top__time\s*\{[^}]*flex-direction:\s*column/);
  });
});

describe('the phone pass: fingers, safe areas, toasts and the 112 card', () => {
  const PHONE = '(max-width: 899px)';
  const VK = css('src/ui/screens/shell/vk.css');
  const GLOBAL = css('src/ui/styles/global.css');

  it('asks for the whole screen and keeps the tab bar and the screens clear of the notch and the home bar', () => {
    expect(css('index.html')).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/);
    const game = mediaAll(GAME, PHONE);
    expect(game).toMatch(/\.gm-mnav\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom/);
    expect(game).toMatch(/\.gm-top\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top/);
    expect(VK).toMatch(/\.sh-login\s*\{\s*padding:\s*env\(safe-area-inset-top\)/);
  });

  it('gives the controls a 44 px target on a phone and leaves the desktop sizes alone', () => {
    const game = mediaAll(GAME, PHONE);
    for (const sel of ['.gm-speed', '.gm-top__menu']) {
      expect(game, sel).toMatch(new RegExp(`\\${sel}\\s*\\{[^}]*height:\\s*44px`));
    }
    expect(mediaAll(MAP, PHONE)).toMatch(/\.epdm-tool\s*\{[^}]*width:\s*44px;\s*height:\s*44px/);
    expect(mediaAll(COMPONENTS, PHONE)).toMatch(/\.ui-btn,[^{]*\{\s*min-height:\s*44px/);
    expect(rule(COMPONENTS, '.ui-btn--sm').height).toBe('26px');
    expect(rule(GAME, '.gm-speed').height).toBe('28px');
    // iOS zooms into a focused field under 16 px.
    expect(mediaAll(GLOBAL, PHONE)).toMatch(/font-size:\s*max\(16px, 1em\)/);
  });

  it('shows only the newest toast on a phone, and none over the open call card', () => {
    const game = mediaAll(GAME, PHONE);
    expect(game).toMatch(/\.gm-toast:not\(:last-child\)\s*\{\s*display:\s*none/);
    expect(game).toMatch(/\.gm:has\(\.tl-call:not\(\.is-ringing\):not\(\.is-collapsed\)\) \.gm-toasts\s*\{\s*display:\s*none/);
  });

  it('docks the 112 card and the co-op panel in the pane between the top bar and the tab bar', () => {
    expect(mediaAll(TOOLS, PHONE)).toMatch(/\.tl-call\s*\{\s*grid-area:\s*main/);
    expect(mediaAll(GAME, PHONE)).toMatch(/\.gm-coop\s*\{\s*grid-area:\s*main/);
    // Its questions scroll; the decision row stays on screen.
    expect(mediaAll(TOOLS, PHONE)).toMatch(/\.tl-call__grid\s*\{[^}]*overflow-y:\s*auto/);
  });
});

describe('contrast in both themes (visual-9 and the light palette)', () => {
  it('the PAUSED badge and the pause button use dark ink on amber', () => {
    expect(rule(GAME, '.gm-top__paused').color).toBe('var(--ink-on-bright)');
    expect(rule(GAME, '.gm-speed.is-pause.is-active').color).toBe('var(--ink-on-bright)');
    expect(contrast(token('dark', 'ink-on-bright'), token('dark', 'warn'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('dark', 'ink-on-bright'), token('dark', 'gold'))).toBeGreaterThanOrEqual(4.5);
  });

  it('secondary text tokens reach 4.5:1 on the panel backgrounds', () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const bg of ['bg-1', 'bg-2', 'bg-3']) {
        for (const ink of ['text-1', 'text-2', 'text-3']) {
          expect(contrast(token(theme, ink), token(theme, bg)), `${theme} ${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    expect(contrast(token('light', 'accent-2'), token('light', 'bg-0'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the light theme deepens every status ink token, and the CAD uses them for text', () => {
    for (const name of ['warn', 'gold', 'ok', 'danger', 'info', 'p1', 'p2', 'p3', 'p4', 'st-enroute', 'st-onscene']) {
      expect(token('dark', `${name}-ink`)).toBe(`var(--${name})`);
      expect(token('light', `${name}-ink`)).toMatch(new RegExp(`^color-mix\\(in srgb, var\\(--${name}\\) \\d+%, var\\(--text-0\\)\\)$`));
    }
    // No status fill colour is used directly as a text colour any more.
    for (const src of [GAME, TOOLS]) expect(src).not.toMatch(/^\s+color: var\(--(warn|gold|ok|danger|info|p[1-4]|st-enroute|st-onscene)\);/m);
  });
});
