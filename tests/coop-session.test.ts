// The lockstep co-op session (src/store/coop.ts) when the room leaves its shift behind between rounds
// (docs/MULTIPLAYER.md section 11): back in the lobby the host may switch the room to a race, and the log then
// answers 409 `not_coop`. The shift is over then, not the connection.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startCoop, stopCoop, useCoop } from '@/store/coop';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const SHIFT = {
  code: 'K7M2QX',
  mode: 'role' as const,
  seed: 1234567,
  day: '2026-10-23',
  options: {
    regionId: 'pohja' as const,
    sector: '',
    difficulty: 'normal' as const,
    hours: 2,
    slot: 'evening' as const,
  },
};

describe('co-op session between rounds', () => {
  afterEach(() => {
    stopCoop();
    vi.unstubAllGlobals();
  });

  for (const [code, message] of [
    ['not_coop', 'See ruum ei mängi ühisvahetust.'],
    ['left_room', 'Sa lahkusid sellest ruumist.'],
  ]) {
    it(`ends the shift when the log answers 409 ${code}`, async () => {
      const log: string[] = [];
      // The game's frame loop (src/store/game.ts) starts with the shift; node has no frames. It never runs here: what
      // is tested is the session's own polling, and a frame left pending would outlive the stubs at the end.
      vi.stubGlobal('requestAnimationFrame', () => 0);
      vi.stubGlobal('cancelAnimationFrame', () => {});
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          log.push(url);
          if (url.includes('/snapshot'))
            return json({ error: 'no_snapshot', message: 'Hetkeseisu pole.' }, 404);
          if (url.includes('/log')) return json({ error: code, message }, 409);
          return json({ error: 'not_found', message: 'Pole.' }, 404);
        }),
      );
      await startCoop(SHIFT.code, SHIFT);
      await vi.waitFor(() => expect(useCoop.getState().status).toBe('ended'), { timeout: 3000 });
      expect(useCoop.getState().error).toBe('round_over');
      // Stopped: no more polling of a log that is not this shift's.
      const polls = log.filter((u) => u.includes('/log')).length;
      await new Promise((r) => setTimeout(r, 400));
      expect(log.filter((u) => u.includes('/log')).length).toBe(polls);
    });
  }
});
