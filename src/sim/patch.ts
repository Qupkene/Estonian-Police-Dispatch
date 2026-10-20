/**
 * State patches of a server-run co-op shift (docs/MULTIPLAYER.md section 9). The server keeps a shadow: a plain JSON
 * copy of the shift exactly as every client holds it. Each piece it compares the live state with the shadow, brings
 * the shadow up to date and sends the differences; a client applies them to its copy and draws it. A client never
 * steps the simulation itself, so the clients cannot drift apart.
 *
 * Display-only numbers that change every piece (a crew's fatigue and heading, its position, the work done on a
 * scene) are sent only once they moved by more than a small step, which keeps a patch to a few hundred bytes. The
 * exact state reaches the clients with every full copy: on joining and when the shift ends.
 */

/** A path into the state: object keys are strings, array indices numbers. */
export type PatchPath = (string | number)[];

/**
 * One change. `[path, value]` sets a value, `[path]` deletes a key. The last key of a path can be `'+'` (append the
 * value's items to the array) or `'length'` (cut the array to that length).
 */
export type PatchOp = [PatchPath, unknown] | [PatchPath];

/** How far a display-only number may lag before it is sent, by key (`pos` covers both coordinates). */
const SLACK: Record<string, number> = {
  fatigue: 0.005,
  heading: 2,
  workDone: 0.5,
  success: 0.005,
};
const POS_SLACK = 0.00002;

/** Plain JSON copy (drops undefined, turns NaN and Infinity into null, as JSON does). */
export function jsonClone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Rounds a fraction to six decimals (a tenth of a metre in degrees): the patch stays short. */
function shortNumber(v: number): number {
  return Number.isInteger(v) ? v : Math.round(v * 1e6) / 1e6;
}

function slackOf(path: PatchPath): number {
  const key = path[path.length - 1];
  if (typeof key === 'string') return SLACK[key] ?? 0;
  return path[path.length - 2] === 'pos' ? POS_SLACK : 0;
}

/**
 * Bring `shadow` (a JSON copy) up to `live` and push the changes onto `ops`. Returns the new shadow value: the same
 * object updated in place where it could be, a fresh copy where the type changed. `skip` names top-level keys left
 * out (the transient event list).
 */
export function diffInto(
  shadow: unknown,
  live: unknown,
  path: PatchPath,
  ops: PatchOp[],
  skip?: ReadonlySet<string>,
): unknown {
  if (live === shadow) return shadow;
  if (typeof live === 'number' && typeof shadow === 'number') {
    if (!Number.isFinite(live)) {
      ops.push([path, null]);
      return null;
    }
    if (Math.abs(live - shadow) <= slackOf(path)) return shadow;
    const v = shortNumber(live);
    if (v === shadow) return shadow;
    ops.push([path, v]);
    return v;
  }
  if (typeof live === 'number' && !Number.isFinite(live) && shadow === null) return shadow;
  if (Array.isArray(live) && Array.isArray(shadow)) {
    if (live.length < shadow.length) {
      ops.push([[...path, 'length'], live.length]);
      shadow.length = live.length;
    }
    for (let i = 0; i < live.length; i++) {
      if (i >= shadow.length) {
        const rest = jsonClone(live.slice(i)).map((x) => (x === undefined ? null : x));
        ops.push([[...path, '+'], rest]);
        shadow.push(...rest);
        break;
      }
      shadow[i] = diffInto(shadow[i], live[i] === undefined ? null : live[i], [...path, i], ops);
    }
    return shadow;
  }
  if (isObj(live) && isObj(shadow)) {
    for (const k of Object.keys(live)) {
      if (skip?.has(k) && path.length === 0) continue;
      const v = live[k];
      if (v === undefined || typeof v === 'function') {
        if (k in shadow) {
          ops.push([[...path, k]]);
          delete shadow[k];
        }
        continue;
      }
      if (!(k in shadow)) {
        const c = jsonClone(v);
        ops.push([[...path, k], c]);
        shadow[k] = c;
        continue;
      }
      shadow[k] = diffInto(shadow[k], v, [...path, k], ops);
    }
    for (const k of Object.keys(shadow)) {
      if (!(k in live) && !(skip?.has(k) && path.length === 0)) {
        ops.push([[...path, k]]);
        delete shadow[k];
      }
    }
    return shadow;
  }
  const c = live === undefined ? null : jsonClone(live);
  ops.push([path, c]);
  return c;
}

/** Apply a patch to a client's copy in place. Never throws on a path that does not fit: that op is skipped. */
export function applyPatch(target: Record<string, unknown>, ops: readonly PatchOp[]): void {
  for (const op of ops) {
    const path = op[0];
    if (!Array.isArray(path) || !path.length) continue;
    let node: unknown = target;
    for (let i = 0; i < path.length - 1; i++) {
      node = (node as Record<string | number, unknown> | null)?.[path[i] as string];
      if (typeof node !== 'object' || node === null) break;
    }
    if (typeof node !== 'object' || node === null) continue;
    const key = path[path.length - 1];
    if (Array.isArray(node)) {
      if (key === '+' && Array.isArray(op[1])) node.push(...(op[1] as unknown[]));
      else if (key === 'length' && typeof op[1] === 'number') node.length = op[1];
      else if (typeof key === 'number' && op.length > 1) node[key] = op[1];
      continue;
    }
    const obj = node as Record<string, unknown>;
    if (op.length === 1) delete obj[key as string];
    else obj[key as string] = op[1];
  }
}
