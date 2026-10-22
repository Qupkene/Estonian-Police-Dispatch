// Estonian names and formats for the admin panel (the game's own words where it has them: src/i18n/parts/shell.ts).

export const REGIONS: Record<string, string> = { pohja: 'Põhja', ida: 'Ida', louna: 'Lõuna', laane: 'Lääne' };
export const MODES: Record<string, string> = {
  career: 'Karjäär',
  free: 'Kiirmäng',
  director: 'Režissööri režiim',
  tutorial: 'Õppevahetus',
};
export const DIFFICULTIES: Record<string, string> = {
  cadet: 'Kadett',
  normal: 'Tavaline',
  veteran: 'Veteran',
  realistic: 'Realistlik',
};
export const GRADES = ['S', 'A', 'B', 'C', 'D', 'F'];
export const ROOM_MODES: Record<string, string> = { race: 'Võistlus', sector: 'Sektorid', role: 'Rollid' };
export const ROOM_STATES: Record<string, string> = {
  lobby: 'Ootab',
  running: 'Käib',
  finished: 'Lõppenud',
  closed: 'Suletud',
};
export const SAVE_SLOTS: Record<string, string> = {
  career: 'Karjäär',
  settings: 'Seaded',
  autosave: 'Automaatsalvestus',
};

export const ACTIONS: Record<string, string> = {
  unlock: 'Avas paneeli',
  unlock_failed: 'Vale parool paneeli avamisel',
  user_create: 'Lõi konto',
  user_update: 'Muutis kontot',
  user_password: 'Vahetas parooli',
  user_logout: 'Logis kõikjalt välja',
  user_unlimit: 'Tühistas sisselogimise piirangu',
  user_delete: 'Kustutas konto',
  save_put: 'Muutis salvestust',
  save_delete: 'Kustutas salvestuse',
  score_create: 'Lisas tulemuse',
  score_update: 'Muutis tulemust',
  score_delete: 'Kustutas tulemuse',
  daily_create: 'Lisas päeva tulemuse',
  daily_update: 'Muutis päeva tulemust',
  daily_delete: 'Kustutas päeva tulemuse',
  room_close: 'Sulges ruumi',
  room_delete: 'Kustutas ruumi',
  room_result_delete: 'Kustutas ruumi tulemuse',
  backup: 'Tegi varukoopia',
};

export const label = (map: Record<string, string>, key: string): string => map[key] ?? key;

const dateTime = new Intl.DateTimeFormat('et-EE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Tallinn',
});
const dateOnly = new Intl.DateTimeFormat('et-EE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Tallinn',
});

/** "21.10.2026 14:05" in Tallinn time, or a dash-free placeholder for none. */
export const when = (ms: number | null | undefined): string => (ms ? dateTime.format(ms) : 'pole');
export const day = (ms: number): string => dateOnly.format(ms);

/** "5 min tagasi", "3 h tagasi", "2 p tagasi", else the date. */
export function ago(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return 'pole';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just praegu';
  if (s < 3600) return `${Math.floor(s / 60)} min tagasi`;
  if (s < 86400) return `${Math.floor(s / 3600)} h tagasi`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)} p tagasi`;
  return day(ms);
}

const num = new Intl.NumberFormat('et-EE');
export const n = (v: number): string => num.format(v);

export function bytes(v: number): string {
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1).replace('.', ',')} kB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(v / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} GB`;
}

/** Today in Tallinn as YYYY-MM-DD (the daily challenge's day). */
export function tallinnToday(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}

/** A datetime-local input value (Tallinn wall time is close enough: the browser's own zone) and back. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v: string): number | null {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}
