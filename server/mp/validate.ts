/**
 * The shapes of the commands a player may send (the same table as EPD_COOP_KINDS in server/lib/coop.php). The sim
 * checks the meaning and the permissions when it applies a command; this only lets well-formed, small commands in.
 *
 * id: a game id (i12, u3, c4, r40); ids: 1 to 12 of them; word: a lower-case keyword; word?: the same or '';
 * ref: a person id or a plate, or ''; prio: 1..4; prio0: 0..4; bit: 0 or 1; speed: 0..4; num: a positive whole
 * number (a lend request's id); text64 and text140: plain text of at most that many characters.
 */
type Shape =
  'id' | 'ids' | 'word' | 'word?' | 'ref' | 'prio' | 'prio0' | 'bit' | 'speed' | 'num' | 'text64' | 'text140';

export const COMMAND_SHAPES: Record<string, Shape[]> = {
  ack: ['id'],
  prio: ['id', 'prio'],
  send: ['id', 'ids'],
  recall: ['id'],
  close: ['id', 'word', 'word?'],
  agency: ['id', 'word'],
  pursuit: ['id', 'word'],
  reply: ['id', 'word'],
  break: ['id', 'bit'],
  check: ['id', 'ref', 'ref'],
  answer: ['id'],
  ask: ['id', 'word'],
  interp: ['id'],
  endcall: ['id', 'word', 'prio0', 'word?'],
  q: ['word', 'text64'],
  ping: ['text140'],
  speed: ['speed'],
  end: [],
  lend: ['id', 'id'],
  lendans: ['num', 'bit'],
  take: ['id'],
  give: ['id'],
};

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const int = (v: unknown, lo: number, hi: number): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const plain = (v: unknown, max: number): boolean =>
  typeof v === 'string' && [...v].length <= max && !/[\x00-\x1F\x7F]/.test(v) && v.trim() !== '';

function argOk(shape: Shape, v: unknown): boolean {
  switch (shape) {
    case 'id':
      return typeof v === 'string' && ID.test(v);
    case 'ids':
      return (
        Array.isArray(v) &&
        v.length >= 1 &&
        v.length <= 12 &&
        v.every((x) => typeof x === 'string' && ID.test(x))
      );
    case 'word':
      return typeof v === 'string' && /^[a-z_]{1,24}$/.test(v);
    case 'word?':
      return typeof v === 'string' && /^[a-z_]{0,24}$/.test(v);
    case 'ref':
      return typeof v === 'string' && /^[\p{L}\p{N} _.-]{0,40}$/u.test(v);
    case 'prio':
      return int(v, 1, 4);
    case 'prio0':
      return int(v, 0, 4);
    case 'bit':
      return v === 0 || v === 1;
    case 'speed':
      return int(v, 0, 4);
    case 'num':
      return int(v, 1, 1_000_000);
    case 'text64':
      return plain(v, 64);
    case 'text140':
      return plain(v, 140);
  }
}

/** A player's command if it is a known kind with well-formed arguments, else null. */
export function validCommand(k: unknown, a: unknown): { k: string; a: unknown[] } | null {
  if (typeof k !== 'string' || !Object.hasOwn(COMMAND_SHAPES, k) || !Array.isArray(a)) return null;
  const shapes = COMMAND_SHAPES[k];
  const optional = shapes.filter((s) => s.endsWith('?')).length;
  if (a.length > shapes.length || a.length < shapes.length - optional) return null;
  return a.every((v, i) => argOk(shapes[i], v)) ? { k, a } : null;
}
