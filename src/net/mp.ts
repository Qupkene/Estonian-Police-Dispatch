// Mänguserver (docs/MULTIPLAYER.md section 9, server/mp): the entry ticket from the PHP API and the WebSocket
// address. No UI strings and no store: src/store/coop.ts drives these.
import { request } from './api';
import { isObj } from './sync';

export interface MpTicket {
  ticket: string;
  /** WebSocket path on this site, '/mp/ws'. */
  url: string;
}

/** A fresh ticket for one connection (good for a minute). */
export async function fetchTicket(code: string): Promise<MpTicket> {
  const r = await request<unknown>('POST', `/rooms/${encodeURIComponent(code)}/ticket`, {});
  const o = isObj(r) ? r : {};
  if (typeof o.ticket !== 'string' || !o.ticket) throw new Error('bad ticket answer');
  return { ticket: o.ticket, url: typeof o.url === 'string' && o.url.startsWith('/') ? o.url : '/mp/ws' };
}

/** ws:// or wss:// address of a path on this site. */
export function socketUrl(path: string): string {
  const loc = window.location;
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}${path}`;
}
