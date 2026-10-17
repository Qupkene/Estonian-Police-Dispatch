/**
 * Estonian radio voice: the text normaliser and voice choice (src/audio/ttsText.ts), and the
 * server-voice queue (src/audio/neurokone.ts) with a stub AudioContext, fetch and backend probe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spellDigits, spellLetters, ttsText, ttsVoice, TTS_VOICES_F, TTS_VOICES_M } from '@/audio/ttsText';

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
    expect(ttsText('Alustati kriminaalmenetlust KarS § 121 järgi.')).toBe(
      'Alustati kriminaalmenetlust karistusseadustiku paragrahvi 121 järgi.',
    );
    expect(ttsText('Kriminaalmenetlus KarS § 199 lg 2 järgi.')).toBe(
      'Kriminaalmenetlus karistusseadustiku paragrahvi 199 lõike 2 järgi.',
    );
    expect(ttsText('Väärteomenetlus LS § 224.')).toBe('Väärteomenetlus liiklusseaduse paragrahv 224.');
    // A law reference in brackets is a note for the reader.
    expect(ttsText('Alustati menetlust lähenemiskeelu rikkumise eest (KarS § 331²).')).toBe(
      'Alustati menetlust lähenemiskeelu rikkumise eest.',
    );
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
