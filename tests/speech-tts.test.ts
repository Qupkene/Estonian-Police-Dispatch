/**
 * Estonian radio voice: the text normaliser and voice choice (src/audio/ttsText.ts), and the
 * server-voice queue (src/audio/neurokone.ts) with a stub AudioContext, fetch and backend probe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spellDigits, spellLetters, ttsText, ttsVoice, TTS_VOICES_F, TTS_VOICES_M } from '@/audio/ttsText';
import {
  ACK_CHANCE,
  ACK_PHRASES,
  isStale,
  maxWaitingAt,
  pickAck,
  minPrioAt,
  pickSpoken,
  PRIO,
  speakableAt,
  speechPrio,
  speechTag,
  voiceSpeedIndex,
  type SpeechTag,
} from '@/audio/radioSpeech';
import { SPEEDS } from '@/store/game';
import type { Incident, RadioMsg, SimState, Unit } from '@/sim/types';

const probe = vi.hoisted(() => ({ online: true }));
vi.mock('@/net/api', () => ({ API_BASE: '/api', probeBackend: () => Promise.resolve(probe.online) }));

const audio = vi.hoisted(() => ({ out: null as unknown, played: [] as string[] }));
vi.mock('@/audio/sfx', () => ({
  sfx: {
    speechOut: () => audio.out,
    play: (name: string) => audio.played.push(name),
  },
}));

describe('Estonian text for the neural voice', () => {
  it('spells digits and letters the Estonian way', () => {
    expect(spellDigits('386')).toBe('kolm kaheksa kuus');
    expect(spellLetters('VPR')).toBe('vee pee err');
    expect(spellLetters('kž')).toBe('kaa žee');
  });

  it('reads the emergency number, priorities and event numbers like the radio', () => {
    expect(ttsText('Helista 112.')).toBe('Helista üks üks kaks.');
    expect(ttsText('Vastamata 112-kõne')).toBe('Vastamata üks üks kaks kõne');
    expect(ttsText('Prioriteet P1, kiire.')).toBe('Prioriteet üks, kiire.');
    expect(ttsText('Uus P3 sündmus.')).toBe('Uus prioriteet kolm sündmus.');
    expect(ttsText('Põhja 23, teile sündmus PÕ-261016-0004: Perekonflikt.')).toBe(
      'Põhja 23, teile sündmus 4: Perekonflikt.',
    );
  });

  it('reads personal codes and plates digit by digit', () => {
    expect(ttsText('Palun kontrolli isikut, isikukood 36705188676.')).toBe(
      'Palun kontrolli isikut, isikukood kolm, kuus seitse null viis üks kaheksa, kaheksa kuus seitse kuus.',
    );
    expect(ttsText('Numbrimärk 304 YHG, beež Opel Meriva.')).toBe(
      'Numbrimärk kolm null neli, igrek haa gee, beež Opel Meriva.',
    );
    expect(ttsText('Mopeed 12 AB.')).toBe('Mopeed üks kaks, aa bee.');
  });

  it('expands street, unit and measure abbreviations', () => {
    expect(ttsText('Lõuna 13 sündmuskohal, Ploomi tn 8-3.')).toBe('Lõuna 13 sündmuskohal, Ploomi tänav 8 korter 3.');
    expect(ttsText('Väljakutse: Keskallee 19-82.')).toBe('Väljakutse: Keskallee 19 korter 82.');
    expect(ttsText('Paldiski mnt 145 ja Pärnu pst 10.')).toBe('Paldiski maantee 145 ja Pärnu puiestee 10.');
    expect(ttsText('Kiirus 90 km/h.')).toBe('Kiirus 90 kilomeetrit tunnis.');
    expect(ttsText('HK: kiirabi kohal u 11 min pärast.')).toBe('Häirekeskus: kiirabi kohal umbes 11 minuti pärast.');
    expect(ttsText('Ida 31: protokollid veel teha, 13 min.')).toBe('Ida 31: protokollid veel teha, 13 minutit.');
    expect(ttsText('Õhus 0,4 mg/l.')).toBe('Õhus 0,4 milligrammi liitri kohta.');
    expect(ttsText('Tallinna-Tartu mnt (E263), 35. km.')).toBe('Tallinna-Tartu maantee, ee 263, 35. kilomeeter.');
    expect(ttsText('Vahetus algas kell 19:00, teine 07:05.')).toBe('Vahetus algas kell 19 null null, teine 07 null 5.');
  });

  it('turns callsigns, codes and laws into words', () => {
    expect(ttsText('PÕHJA K1: hea, liigume.')).toBe('Põhja kaa 1: hea, liigume.');
    expect(ttsText('IDA KOER 1, selge.')).toBe('Ida Koer 1, selge.');
    expect(ttsText('JK, Lõuna 31. Varasemaid LSV-sündmusi? KV kahtlus.')).toBe(
      'juhtimiskeskus, Lõuna 31. Varasemaid lähisuhtevägivalla sündmusi? kehaline väärkohtlemine kahtlus.',
    );
    expect(ttsText('Leiti MDMA tablette.')).toBe('Leiti emm dee emm aa tablette.');
    // Law paragraphs are never said on the radio (they stay in the incident panel and the report).
    expect(ttsText('Alustati kriminaalmenetlust KarS § 121 järgi.')).toBe('Alustati kriminaalmenetlust.');
    expect(ttsText('Kriminaalmenetlus KarS § 199 lg 2 järgi, kahju 49 €.')).toBe('Kriminaalmenetlus, kahju 49 eurot.');
    expect(ttsText('Väärteomenetlus LS § 224.')).toBe('Väärteomenetlus.');
    expect(ttsText('Alustati kriminaalmenetlust KarS § 263 ja § 274 järgi.')).toBe('Alustati kriminaalmenetlust.');
    expect(ttsText('Viibimiskeeld kohaldati eile KorS § 44 alusel.')).toBe('Viibimiskeeld kohaldati eile.');
    expect(ttsText('Alustati menetlust lähenemiskeelu rikkumise eest (KarS § 331²).')).toBe(
      'Alustati menetlust lähenemiskeelu rikkumise eest.',
    );
    expect(ttsText('Peame kinni NPALS väärteo tõttu.')).toBe('Peame kinni väärteo tõttu.');
    expect(ttsText('Paragrahv § 12 jäi.')).not.toMatch(/§|12/);
    expect(ttsText('lastekaitse / sotsiaaltöö saabus')).toBe('lastekaitse või sotsiaaltöö saabus');
  });

  it('drops notes and symbols, never uses dashes as pauses, and keeps lines short', () => {
    expect(ttsText('Põhja 21 [auto] «kohal» ★')).toBe('Põhja 21 kohal');
    expect(ttsText('Sihtkoht Viru Vangla (arestimaja ülesanded).')).toBe('Sihtkoht Viru Vangla, arestimaja ülesanded.');
    const long = 'Lause on siin päris pikk. '.repeat(30);
    const cut = ttsText(long);
    expect(cut.length).toBeLessThanOrEqual(300);
    expect(cut.endsWith('.')).toBe(true);
    expect(ttsText(long, 60).length).toBeLessThanOrEqual(61);
    expect(ttsText('Mees - naine')).not.toMatch(new RegExp('[\\u2013\\u2014]'));
  });
});

describe('voice per radio sender', () => {
  it('gives the dispatcher and Häirekeskus their own voice', () => {
    expect(ttsVoice({ from: 'JK' }).voice).toBe('mari');
    expect(ttsVoice(undefined).voice).toBe('mari');
    expect(ttsVoice({ from: 'HK' }).voice).toBe('vesta');
    expect(ttsVoice({ from: 'Päästeamet' }).voice).toBe('vesta');
  });

  it('keeps a unit on one voice of its crew leader’s gender', () => {
    const units = ['PÕHJA 21', 'PÕHJA K1', 'IDA 13', 'LÕUNA 95', 'LÄÄNE 82', 'PÕHJA KOER 1', 'KOPTER 1', 'IDA PIIR 2'];
    for (const from of units) {
      const a = ttsVoice({ from });
      expect(ttsVoice({ from: ` ${from.toLowerCase()} ` }), from).toEqual(a);
      expect([...TTS_VOICES_F, ...TTS_VOICES_M] as string[]).toContain(a.voice);
      expect(TTS_VOICES_F as readonly string[]).toContain(ttsVoice({ from, gender: 'F' }).voice);
      expect(TTS_VOICES_M as readonly string[]).toContain(ttsVoice({ from, gender: 'M' }).voice);
      expect(a.speed).toBeGreaterThanOrEqual(0.75);
      expect(a.speed).toBeLessThanOrEqual(1.35);
      expect(Math.round(a.speed * 100) / 100).toBe(a.speed);
    }
    // Different crews sound different.
    expect(new Set(units.map((from) => ttsVoice({ from, gender: 'M' }).voice)).size).toBeGreaterThan(2);
    expect(ttsVoice({ from: 'PÕHJA 21' }, false).speed).toBe(1);
  });
});

// ── which lines are read, and when they go stale ─────────────────────────────

describe('radio voice: what is read and what goes stale', () => {
  const msg = (o: Partial<RadioMsg> = {}): RadioMsg => ({
    id: 'r1',
    t: 1000,
    from: 'PÕHJA 21',
    text: { et: 'Põhja 21, kohal.', en: 'Põhja 21, on scene.' },
    level: 'routine',
    kind: 'status',
    ...o,
  });
  const inc = (o: Partial<Incident> = {}) =>
    ({ id: 'i1', state: 'onscene', priority: 3, truePriority: 3, assigned: ['u1'], beats: [], ...o }) as unknown as Incident;
  const unit = (o: Partial<Unit> = {}) => ({ id: 'u1', callsign: 'PÕHJA 21', status: 'onscene', crew: [], ...o }) as unknown as Unit;
  const world = (o: { radio?: RadioMsg[]; incidents?: Incident[]; units?: Unit[]; now?: number } = {}) =>
    ({
      now: o.now ?? 1000,
      radio: o.radio ?? [],
      incidents: Object.fromEntries((o.incidents ?? [inc()]).map((x) => [x.id, x])),
      units: Object.fromEntries((o.units ?? [unit()]).map((x) => [x.id, x])),
    }) as unknown as SimState;

  it('ranks a line by what it asks of the dispatcher', () => {
    const s = world({ incidents: [inc(), inc({ id: 'p1', priority: 1, truePriority: 1 })] });
    expect(speechPrio(s, msg())).toBe(PRIO.routine);
    expect(speechPrio(s, msg({ incidentId: 'i1' }))).toBe(PRIO.routine);
    expect(speechPrio(s, msg({ incidentId: 'p1' }))).toBe(PRIO.important);
    expect(speechPrio(s, msg({ kind: 'pursuit', level: 'priority' }))).toBe(PRIO.important);
    expect(speechPrio(s, msg({ level: 'priority', kind: 'info' }))).toBe(PRIO.important);
    expect(speechPrio(s, msg({ kind: 'choice', replies: [{ id: 'a', label: { et: 'A', en: 'A' } }] }))).toBe(PRIO.reply);
    expect(speechPrio(s, msg({ kind: 'backup', level: 'emergency' }))).toBe(PRIO.emergency);
  });

  it('reads less the faster the game runs, and nothing while paused', () => {
    expect(SPEEDS[2] / SPEEDS[1]).toBe(2);
    expect(SPEEDS[3] / SPEEDS[1]).toBe(4);
    expect(minPrioAt(0)).toBeNull();
    for (const p of Object.values(PRIO)) expect(speakableAt(p, 0)).toBe(false);
    // 1x: everything.
    for (const p of Object.values(PRIO)) expect(speakableAt(p, 1)).toBe(true);
    // 2x: still everything.
    for (const p of Object.values(PRIO)) expect(speakableAt(p, 2)).toBe(true);
    // 4x and 8x: only lines that need a reply, and emergencies.
    for (const i of [3, 4]) {
      expect(speakableAt(PRIO.important, i)).toBe(false);
      expect(speakableAt(PRIO.reply, i)).toBe(true);
      expect(speakableAt(PRIO.emergency, i)).toBe(true);
    }
    // At most one line waits from 4x up; 1x and 2x use the normal queue.
    expect(maxWaitingAt(1)).toBeUndefined();
    expect(maxWaitingAt(2)).toBeUndefined();
    expect(maxWaitingAt(3)).toBe(1);
    expect(maxWaitingAt(4)).toBe(1);
    // Director mode runs in real time; paused is paused.
    expect(voiceSpeedIndex({ speedIndex: 1, realtime: true })).toBe(1);
    expect(voiceSpeedIndex({ speedIndex: 0, realtime: true })).toBe(0);
    expect(voiceSpeedIndex({ speedIndex: 3 })).toBe(3);
  });

  it('picks the line that matters most among those read at this speed', () => {
    const routine = msg({ id: 'r1' });
    const pursuit = msg({ id: 'r2', kind: 'pursuit', level: 'priority' });
    const question = msg({ id: 'r3', kind: 'query', level: 'priority', replies: [{ id: 'clean', label: { et: 'Puhas', en: 'Clean' } }] });
    const s = world({ radio: [routine, pursuit, question] });
    expect(pickSpoken(s, [routine], 1)?.msg.id).toBe('r1');
    expect(pickSpoken(s, [routine], 2)?.msg.id).toBe('r1');
    expect(pickSpoken(s, [routine, pursuit], 2)?.msg.id).toBe('r2');
    expect(pickSpoken(s, [routine, pursuit], 3)).toBeUndefined();
    expect(pickSpoken(s, [routine, pursuit, question], 3)?.msg.id).toBe('r3');
    expect(pickSpoken(s, [routine, pursuit, question], 0)).toBeUndefined();
  });

  it('sometimes acknowledges a cut line, varied, and never at 4x or with a line waiting', () => {
    const seq = (...v: number[]) => () => v.shift() ?? 0;
    // Under the chance: a phrase; at or over it: silence.
    expect(pickAck('et', { speedIndex: 1, waiting: 0, rnd: seq(0, 0) })).toBe(ACK_PHRASES.et[0]);
    expect(pickAck('et', { speedIndex: 2, waiting: 0, rnd: seq(ACK_CHANCE - 0.01, 0.99) })).toBe(ACK_PHRASES.et.at(-1));
    expect(pickAck('et', { speedIndex: 1, waiting: 0, rnd: seq(ACK_CHANCE) })).toBeNull();
    expect(ACK_CHANCE).toBeCloseTo(0.6);
    // Not at 4x and faster, not paused, not when another line waits.
    for (const speedIndex of [0, 3, 4]) expect(pickAck('et', { speedIndex, waiting: 0, rnd: () => 0 })).toBeNull();
    expect(pickAck('et', { speedIndex: 1, waiting: 1, rnd: () => 0 })).toBeNull();
    // Never the same one twice in a row.
    let last: string | undefined;
    for (let i = 0; i < 200; i++) {
      const a = pickAck('et', { speedIndex: 1, waiting: 0, last, rnd: Math.random });
      if (!a) continue;
      expect(a).not.toBe(last);
      last = a;
    }
    expect(pickAck('et', { speedIndex: 1, waiting: 0, last: ACK_PHRASES.et[0], rnd: () => 0 })).toBe(ACK_PHRASES.et[1]);
    // English UI has its own; no dashes used as pauses.
    expect(pickAck('en', { speedIndex: 1, waiting: 0, rnd: () => 0 })).toBe(ACK_PHRASES.en[0]);
    for (const p of [...ACK_PHRASES.et, ...ACK_PHRASES.en]) expect(p).not.toMatch(/[\u2013\u2014]/);
  });

  it('drops a line once the player has acted on it or the world has moved past it', () => {
    // Answered question.
    const q = msg({ id: 'r5', incidentId: 'i1', kind: 'choice', level: 'priority', replies: [{ id: 'a', label: { et: 'A', en: 'A' } }] });
    const beat = { index: 0, status: 'active' as const, radioId: 'r5' };
    const s = world({ radio: [q], incidents: [inc({ beats: [beat] })] });
    const tag = speechTag(s, q);
    expect(isStale(s, tag)).toBe(false);
    q.answered = 'a';
    expect(isStale(s, tag)).toBe(true);
    // The beat it opened is over (backup sent, decision taken by the unit).
    q.answered = undefined;
    beat.status = 'done' as never;
    expect(isStale(s, tag)).toBe(true);

    // The incident was closed after the line was said; the closing report itself is not stale.
    const working = msg({ id: 'r6', t: 900, incidentId: 'i2', unitId: undefined });
    const closing = msg({ id: 'r7', t: 1000, incidentId: 'i2', unitId: undefined });
    const s2 = world({ radio: [working, closing], incidents: [inc({ id: 'i2', state: 'closed', closedAt: 1000 })] });
    expect(isStale(s2, speechTag(s2, working))).toBe(true);
    expect(isStale(s2, speechTag(s2, closing))).toBe(false);

    // The unit moved on: "teel" is stale once it is on scene.
    const u = unit({ status: 'enroute' });
    const ack = msg({ id: 'r8', unitId: 'u1', incidentId: 'i1' });
    const s3 = world({ radio: [ack], units: [u] });
    const ackTag: SpeechTag = speechTag(s3, ack);
    expect(ackTag.unitStatus).toBe('enroute');
    expect(isStale(s3, ackTag)).toBe(false);
    (u as { status: string }).status = 'onscene';
    expect(isStale(s3, ackTag)).toBe(true);

    // Häirekeskus asks for units; once the player sends one, the notice is stale.
    const p1 = inc({ id: 'i3', state: 'queued', priority: 1, truePriority: 1, assigned: [] });
    const hk = msg({ id: 'r9', from: 'HK', kind: 'info', level: 'priority', incidentId: 'i3', unitId: undefined });
    const s4 = world({ radio: [hk], incidents: [p1] });
    const hkTag = speechTag(s4, hk);
    expect(isStale(s4, hkTag)).toBe(false);
    p1.assigned.push('u1');
    expect(isStale(s4, hkTag)).toBe(true);

    // A question past its deadline.
    const late = msg({ id: 'r10', kind: 'query', replies: [{ id: 'clean', label: { et: 'P', en: 'C' } }], expiresAt: 1500 });
    const s5 = world({ radio: [late], now: 1000 });
    const lateTag = speechTag(s5, late);
    expect(isStale(s5, lateTag)).toBe(false);
    (s5 as { now: number }).now = 1600;
    expect(isStale(s5, lateTag)).toBe(true);
  });
});

// ── server voice queue ───────────────────────────────────────────────────────

interface Stub {
  tag?: string;
  duration: number;
}

const log: string[] = [];
const until = async (ok: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out; log: ${log.join(' ')}`);
    await new Promise((r) => setTimeout(r, 10));
  }
};

function param() {
  return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} };
}
function node(): Record<string, unknown> {
  return {
    connect: (d: unknown) => d,
    disconnect() {},
    gain: param(),
    frequency: param(),
    Q: param(),
    threshold: param(),
    knee: param(),
    ratio: param(),
    attack: param(),
    release: param(),
  };
}

function fakeContext() {
  return {
    state: 'running',
    currentTime: 0,
    sampleRate: 8000,
    createGain: node,
    createBiquadFilter: node,
    createWaveShaper: node,
    createDynamicsCompressor: node,
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => {
      const src = {
        ...node(),
        buffer: null as Stub | null,
        onended: null as null | (() => void),
        loop: false,
        timer: undefined as ReturnType<typeof setTimeout> | undefined,
        start() {
          const b = src.buffer;
          if (!b?.tag) return; // the hiss
          log.push(`start:${b.tag}`);
          src.timer = setTimeout(() => {
            log.push(`end:${b.tag}`);
            src.onended?.();
          }, b.duration * 1000);
        },
        stop() {
          if (src.timer) {
            clearTimeout(src.timer);
            src.timer = undefined;
            log.push(`stop:${src.buffer?.tag}`);
          }
        },
      };
      return src;
    },
    decodeAudioData: async (data: ArrayBuffer): Promise<Stub> => ({ tag: new TextDecoder().decode(data), duration: 0.06 }),
    resume: async () => {},
  };
}

describe('server voice queue', () => {
  let nk: typeof import('@/audio/neurokone');
  let fetchMock: ReturnType<typeof vi.fn>;
  /** Pending upstream answers by text, when a test wants to hold them back. */
  let hold: Map<string, () => void>;
  const consoleCalls: unknown[] = [];

  const line = (text: string, fallback = () => Promise.resolve(log.push(`fallback:${text}`)).then(() => undefined)) => ({
    text,
    voice: 'tambet',
    speed: 1.06,
    radio: true,
    fallback,
  });

  beforeEach(async () => {
    log.length = 0;
    audio.played.length = 0;
    probe.online = true;
    hold = new Map();
    vi.stubGlobal('window', { AudioContext: function AudioContext() {} });
    audio.out = { ctx: fakeContext(), out: node() };
    fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const { text } = JSON.parse(init.body) as { text: string };
      log.push(`fetch:${text}`);
      if (text.startsWith('hold')) await new Promise<void>((r) => hold.set(text, r));
      if (text.startsWith('down')) return new Response('{"error":"tts_unavailable"}', { status: 503, headers: { 'content-type': 'application/json' } });
      return new Response(text, { status: 200, headers: { 'content-type': 'audio/wav' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    for (const k of ['log', 'warn', 'error', 'info', 'debug'] as const)
      vi.spyOn(console, k).mockImplementation((...a: unknown[]) => void consoleCalls.push(a));
    nk = await import('@/audio/neurokone');
    nk.resetTts();
  });

  afterEach(() => {
    nk.resetTts();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    expect(consoleCalls, 'nothing is logged').toEqual([]);
  });

  it('plays lines one after another, never at the same time', async () => {
    nk.say(line('A'));
    nk.say(line('B'));
    await until(() => log.includes('end:B'));
    const starts = log.filter((e) => e.startsWith('start') || e.startsWith('end'));
    expect(starts).toEqual(['start:A', 'end:A', 'start:B', 'end:B']);
    // Squelch around each clip.
    expect(audio.played).toEqual(['radioIn', 'radioOut', 'radioIn', 'radioOut']);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ text: 'A', voice: 'tambet', speed: 1.06 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/tts');
    expect(fetchMock.mock.calls[0][1].headers['X-EPD']).toBe('1');
  });

  it('drops the oldest waiting lines when traffic piles up, and never fetches them', async () => {
    nk.say(line('hold-1'));
    await until(() => log.includes('fetch:hold-1'));
    for (const t of ['B', 'C', 'D', 'E', 'F']) nk.say(line(t));
    hold.get('hold-1')!();
    await until(() => log.includes('end:F'));
    expect(log.filter((e) => e.startsWith('start'))).toEqual(['start:hold-1', 'start:D', 'start:E', 'start:F']);
    expect(log.filter((e) => e.startsWith('fetch'))).toEqual(['fetch:hold-1', 'fetch:D', 'fetch:E', 'fetch:F']);
  });

  it('skips a radio line that waited too long', async () => {
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    nk.say(line('hold-old'));
    nk.say(line('old-2'));
    await until(() => log.includes('fetch:hold-old'));
    clock += nk.STALE_MS + 1;
    hold.get('hold-old')!();
    nk.say(line('fresh'));
    await until(() => log.includes('end:fresh'));
    expect(log.filter((e) => e.startsWith('start'))).toEqual(['start:fresh']);
    expect(log.some((e) => e.startsWith('fallback'))).toBe(false);
  });

  it('keeps decoded clips, so a repeated line is fetched once', async () => {
    nk.say(line('Selge, puhas.'));
    await until(() => log.includes('end:Selge, puhas.'));
    nk.say(line('Selge, puhas.'));
    await until(() => log.filter((e) => e === 'end:Selge, puhas.').length === 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the fallback without asking the server when there is no backend', async () => {
    probe.online = false;
    nk.say(line('A'));
    await until(() => log.includes('fallback:A'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log.some((e) => e.startsWith('start'))).toBe(false);
    await until(() => nk.ttsReady() === false);
  });

  it('falls back on server trouble and pauses the server voice', async () => {
    expect(nk.ttsReady()).toBeNull();
    await until(() => nk.ttsReady() === true);
    nk.say(line('down-1'));
    await until(() => log.includes('fallback:down-1'));
    expect(nk.ttsReady()).toBe(false);
    // While paused, lines go to the fallback without a request.
    nk.say(line('A'));
    await until(() => log.includes('fallback:A'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the fallback for a line with no text (server voice known to be off)', async () => {
    nk.say(line(''));
    await until(() => log.includes('fallback:'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops the playing clip and forgets the queue', async () => {
    const ctx = (audio.out as { ctx: { createBufferSource: () => unknown } }).ctx;
    const decode = vi.fn(async (data: ArrayBuffer): Promise<Stub> => ({ tag: new TextDecoder().decode(data), duration: 5 }));
    Object.assign(ctx, { decodeAudioData: decode });
    nk.say(line('long'));
    nk.say(line('next'));
    await until(() => log.includes('start:long'));
    nk.stopTts();
    await new Promise((r) => setTimeout(r, 400));
    expect(log).toContain('stop:long');
    expect(log.some((e) => e === 'start:next' || e === 'fallback:next')).toBe(false);
    // The queue works again afterwards.
    Object.assign(ctx, { decodeAudioData: async (d: ArrayBuffer): Promise<Stub> => ({ tag: new TextDecoder().decode(d), duration: 0.05 }) });
    nk.say(line('after'));
    await until(() => log.includes('end:after'));
  });

  const tagged = (text: string, tag: Partial<SpeechTag>, extra: Record<string, unknown> = {}) => ({
    ...line(text),
    tag: { msgId: 'r0', t: 0, from: 'PÕHJA 21', prio: PRIO.routine, ...tag } as SpeechTag,
    ...extra,
  });
  const longClips = () => {
    const ctx = (audio.out as { ctx: Record<string, unknown> }).ctx;
    Object.assign(ctx, { decodeAudioData: async (d: ArrayBuffer): Promise<Stub> => ({ tag: new TextDecoder().decode(d), duration: 5 }) });
    return () => Object.assign(ctx, { decodeAudioData: async (d: ArrayBuffer): Promise<Stub> => ({ tag: new TextDecoder().decode(d), duration: 0.05 }) });
  };

  it('cuts the line that plays and drops waiting lines about a message the player answered', async () => {
    const short = longClips();
    nk.say(tagged('A', { msgId: 'r1', incidentId: 'i1' }));
    nk.say(tagged('B', { msgId: 'r2', incidentId: 'i1' }));
    nk.say(tagged('C', { msgId: 'r3', incidentId: 'i2' }));
    await until(() => log.includes('start:A'));
    expect(nk.ttsTags().map((t) => t.msgId)).toEqual(['r1', 'r2', 'r3']);
    short();
    // The player closed incident i1: A is cut, B never plays, C goes on.
    expect(nk.cancelTts((t) => t.incidentId === 'i1')).toBe(2);
    await until(() => log.includes('end:C'));
    expect(log).toContain('stop:A');
    // (B may have been fetched ahead while A played; it is never heard.)
    expect(log.some((e) => e === 'start:B' || e === 'fallback:B')).toBe(false);
    expect(log.filter((e) => e.startsWith('start'))).toEqual(['start:A', 'start:C']);
    expect(nk.ttsTags()).toEqual([]);
  });

  it('reports a cut only for a line that was being heard and with nothing waiting', async () => {
    const short = longClips();
    const cuts: string[] = [];
    const onCut = (id: string) => () => void cuts.push(id);
    // Playing, nothing waiting: reported, and a line said from the hook plays next.
    nk.say(tagged('A', { msgId: 'a' }, { onCut: () => { cuts.push('a'); nk.say(line('Ee, selge.')); } }));
    await until(() => log.includes('start:A'));
    short();
    nk.cancelTts((t) => t.msgId === 'a');
    await until(() => log.includes('end:Ee, selge.'));
    expect(cuts).toEqual(['a']);
    // Playing, another line waiting: not reported.
    longClips();
    nk.say(tagged('B', { msgId: 'b' }, { onCut: onCut('b') }));
    nk.say(tagged('C', { msgId: 'c' }, { onCut: onCut('c') }));
    await until(() => log.includes('start:B'));
    short();
    nk.cancelTts((t) => t.msgId === 'b');
    await until(() => log.includes('start:C'));
    expect(cuts).toEqual(['a']);
    // (C was fetched ahead as a long clip; stopTts never reports a cut.)
    nk.stopTts();
    // Dropped from the queue before playing, or cut while its clip was on the way: not reported.
    nk.say(tagged('hold-d', { msgId: 'd' }, { onCut: onCut('d') }));
    nk.say(tagged('E', { msgId: 'e' }, { onCut: onCut('e') }));
    await until(() => log.includes('fetch:hold-d'));
    nk.cancelTts((t) => t.msgId === 'e');
    nk.cancelTts((t) => t.msgId === 'd');
    hold.get('hold-d')!();
    await new Promise((r) => setTimeout(r, 50));
    expect(cuts).toEqual(['a']);
  });

  it('never plays a line cancelled while its clip was still on the way', async () => {
    nk.say(tagged('hold-x', { msgId: 'r9' }));
    await until(() => log.includes('fetch:hold-x'));
    expect(nk.cancelTts((t) => t.msgId === 'r9')).toBe(1);
    hold.get('hold-x')!();
    nk.say(tagged('next', { msgId: 'r10' }));
    await until(() => log.includes('end:next'));
    expect(log.some((e) => e === 'start:hold-x' || e === 'fallback:hold-x')).toBe(false);
  });

  it('keeps one waiting line at higher speed and can shorten the queue later', async () => {
    nk.say(tagged('hold-1', { msgId: 'r1' }));
    await until(() => log.includes('fetch:hold-1'));
    for (const t of ['B', 'C', 'D']) nk.say(tagged(t, { msgId: t }, { maxWaiting: 1 }));
    expect(nk.ttsTags().map((t) => t.msgId)).toEqual(['r1', 'D']);
    nk.say(tagged('E', { msgId: 'E' }));
    nk.say(tagged('F', { msgId: 'F' }));
    nk.limitTtsQueue(1);
    expect(nk.ttsTags().map((t) => t.msgId)).toEqual(['r1', 'F']);
    hold.get('hold-1')!();
    await until(() => log.includes('end:F'));
    expect(log.filter((e) => e.startsWith('start'))).toEqual(['start:hold-1', 'start:F']);
  });

  it('cuts a line that the browser voice is reading', async () => {
    probe.online = false;
    let stopped = 0;
    let release: () => void = () => {};
    nk.say(
      tagged('slow', { msgId: 'r1' }, {
        fallback: () => new Promise<void>((r) => { log.push('fallback:slow'); release = r; }),
        stopFallback: () => { stopped++; release(); },
      }),
    );
    nk.say(tagged('after', { msgId: 'r2' }));
    await until(() => log.includes('fallback:slow'));
    expect(nk.cancelTts((t) => t.msgId === 'r1')).toBe(1);
    expect(stopped).toBe(1);
    await until(() => log.includes('fallback:after'));
  });

  it('speaks Estonian through the queue with the sender’s voice, English through the browser', async () => {
    const { speak } = await import('@/audio/speech');
    await until(() => nk.ttsReady() === true);
    speak('HK: kiirabi kohal u 11 min pärast.', 'et', { radio: true, speaker: { from: 'HK' } });
    await until(() => fetchMock.mock.calls.length === 1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      text: 'Häirekeskus: kiirabi kohal umbes 11 minuti pärast.',
      voice: 'vesta',
      speed: 1.06,
    });
    speak('Põhja 21, on scene.', 'en', { radio: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
