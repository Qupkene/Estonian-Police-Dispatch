// Ühine raport pildina (2.36.0): the joint report drawn as a 1200 × 675 picture for sending to friends. The team's
// grade and points, each player with their picture, numbers and awards. Shared through the system's share sheet
// where the browser can share files (phones), downloaded elsewhere. Always dark, like the game's map.
import { REGIONS } from '@/data/regions';
import { faceUrl } from '@/gen/face';
import { nameSeed, playerPicture } from '@/gen/faceSearch';
import { t } from '@/i18n';
import { avgResponse, coopAwards, type Award, type RoomSummary } from '@/sim/joint';
import type { CoopReportSeat } from '@/sim/coop';
import { sectorById } from '@/sim/sectors';
import { ddmmyyyy, hhmm } from '@/sim/time';
import type { Lang } from '@/sim/types';
import { playerDrawing } from '@/ui/components';
import { AWARD_ICON, AWARD_TONE_HEX } from './jointArt';

const W = 1200;
const H = 675;
const PAD = 48;
const INK = '#eef2f7';
const MUTED = '#9aa6b8';
const DIM = '#6f7b8f';
const CARD = '#1b2231';
const LINE = '#2b3548';
const GRADE_HEX: Record<string, string> = {
  S: '#f0b44c',
  A: '#5fd39a',
  B: '#d5dce6',
  C: '#9aa6b8',
  D: '#f2826f',
  F: '#f2826f',
};
const DISPLAY = "'Archivo Variable', Archivo, 'Helvetica Neue', sans-serif";
const TEXT = "'Instrument Sans Variable', 'Instrument Sans', 'Helvetica Neue', sans-serif";
const MONO = "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** A player's picture as an image (the name's drawing when a photo does not load). */
async function pictureOf(avatar: string | undefined, name: string): Promise<HTMLImageElement | null> {
  const pic = playerPicture(avatar, name);
  const img = await loadImage(pic.kind === 'face' ? faceUrl(pic.face) : playerDrawing(pic.seed));
  return img ?? loadImage(playerDrawing(nameSeed(name)));
}

/** Text cut with an ellipsis to fit `max` px. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function awardIcon(ctx: CanvasRenderingContext2D, a: Award, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = AWARD_TONE_HEX[a.id];
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of AWARD_ICON[a.id]) ctx.stroke(new Path2D(d));
  ctx.restore();
}

/** The picture of a joint report, as PNG. */
export async function drawJointPicture(
  summary: RoomSummary,
  lang: Lang,
  avatarOf: (x: CoopReportSeat) => string | undefined,
): Promise<Blob> {
  const coop = summary.coop;
  const seats = coop.seats;
  const awards = coopAwards(coop);
  const name = (x: CoopReportSeat) => x.name || t('joint.deleted', lang);
  const [pics] = await Promise.all([
    Promise.all(seats.map((x) => pictureOf(avatarOf(x), x.name || '?'))),
    document.fonts?.ready,
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');

  // The ground: deep blue with the map's faint grid.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#10151f');
  bg.addColorStop(1, '#172033');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(120, 150, 190, 0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }

  // The head: what shift it was, and the team's result.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = MUTED;
  ctx.font = `600 15px ${DISPLAY}`;
  ctx.letterSpacing = '3px';
  ctx.fillText('EPD 2.0 · POLITSEI.EU', PAD, PAD + 14);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = INK;
  ctx.font = `700 44px ${DISPLAY}`;
  ctx.fillText(t('joint.img.title', lang), PAD, PAD + 64);
  const region = REGIONS[summary.regionId]?.name[lang] ?? '';
  const when = `${ddmmyyyy(summary.start)} · ${hhmm(summary.start)} ${lang === 'et' ? 'kuni' : 'to'} ${hhmm(summary.end)}`;
  ctx.fillStyle = MUTED;
  ctx.font = `400 20px ${TEXT}`;
  ctx.fillText(fit(ctx, `${region} · ${when}`, 640), PAD, PAD + 98);

  const gx = W - PAD - 104;
  const grade = GRADE_HEX[summary.grade] ?? INK;
  roundRect(ctx, gx, PAD, 104, 104, 14);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.fill();
  ctx.strokeStyle = grade;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = grade;
  ctx.font = `700 64px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(summary.grade, gx + 52, PAD + 75);
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.font = `700 34px ${DISPLAY}`;
  ctx.fillText(t('joint.img.points', lang, { n: summary.score }), gx - 24, PAD + 44);
  ctx.fillStyle = MUTED;
  ctx.font = `400 18px ${TEXT}`;
  ctx.fillText(
    `${t('joint.img.incidents', lang, { n: summary.incidents })} · ${t('joint.img.arrests', lang, { n: summary.arrests })}`,
    gx - 24,
    PAD + 76,
  );
  ctx.fillStyle = DIM;
  ctx.font = `600 13px ${DISPLAY}`;
  ctx.letterSpacing = '2px';
  ctx.fillText(t('joint.img.team', lang).toUpperCase(), gx - 24, PAD + 100);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';

  // A card per player.
  const top = 190;
  const gap = 24;
  const n = Math.max(1, seats.length);
  const cw = (W - PAD * 2 - gap * (n - 1)) / n;
  const ch = 410;
  seats.forEach((x, i) => {
    const cx = PAD + i * (cw + gap);
    roundRect(ctx, cx, top, cw, ch, 16);
    ctx.fillStyle = CARD;
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.stroke();
    const mid = cx + cw / 2;
    // The picture, round.
    const r = 46;
    const pic = pics[i];
    ctx.save();
    ctx.beginPath();
    ctx.arc(mid, top + 28 + r, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#263044';
    ctx.fill();
    if (pic) {
      ctx.clip();
      ctx.drawImage(pic, mid - r, top + 28, r * 2, r * 2);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(mid, top + 28 + r, r + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = `700 24px ${DISPLAY}`;
    ctx.fillText(fit(ctx, name(x), cw - 32), mid, top + 158);
    const where = x.desk ? (sectorById(x.desk)?.name[lang] ?? x.desk) : t(`coop.role.${x.role}`, lang);
    ctx.fillStyle = MUTED;
    ctx.font = `400 17px ${TEXT}`;
    ctx.fillText(fit(ctx, where, cw - 32), mid, top + 184);

    // Four numbers.
    const resp = avgResponse(x.stats);
    const rows: [string, string][] = [
      [t('joint.stat.calls', lang), String(x.stats.calls)],
      [t('joint.stat.worked', lang), String(x.worked ?? 0)],
      [t('joint.stat.sent', lang), String(x.stats.sent)],
      [t('joint.stat.resp', lang), resp === null ? '-' : respShort(resp)],
    ];
    ctx.textAlign = 'left';
    rows.forEach(([label, value], k) => {
      const y = top + 222 + k * 28;
      ctx.fillStyle = MUTED;
      ctx.font = `400 16px ${TEXT}`;
      ctx.fillText(fit(ctx, label, cw - 120), cx + 22, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = INK;
      ctx.font = `600 17px ${MONO}`;
      ctx.fillText(value, cx + cw - 22, y);
      ctx.textAlign = 'left';
    });

    // Their awards.
    const mine = awards.filter((a) => a.seat === x.seat);
    mine.slice(0, 3).forEach((a, k) => {
      const y = top + 344 + k * 26;
      awardIcon(ctx, a, cx + 20, y - 17, 22);
      ctx.fillStyle = AWARD_TONE_HEX[a.id];
      ctx.font = `600 16px ${DISPLAY}`;
      ctx.fillText(fit(ctx, awardLabel(a, coop.mode, lang), cw - 70), cx + 50, y);
    });
    if (mine.length > 3) {
      ctx.fillStyle = MUTED;
      ctx.font = `400 15px ${TEXT}`;
      ctx.fillText(`+${mine.length - 3}`, cx + cw - 40, top + ch - 16);
    }
  });

  // The foot.
  ctx.fillStyle = DIM;
  ctx.font = `400 16px ${TEXT}`;
  ctx.textAlign = 'left';
  ctx.fillText(lang === 'et' ? 'Mängi koos: politsei.eu' : 'Play together: politsei.eu', PAD, H - 34);
  if (coop.code) {
    ctx.textAlign = 'right';
    ctx.font = `500 16px ${MONO}`;
    ctx.fillText(`${coop.code.slice(0, 3)} ${coop.code.slice(3)}`, W - PAD, H - 34);
  }

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no picture'))), 'image/png'),
  );
}

/** "0:42", "4:07": a response time for the picture's narrow column. */
function respShort(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function awardLabel(a: Award, mode: RoomSummary['coop']['mode'], lang: Lang): string {
  return a.id === 'helper'
    ? t(`joint.award.helper.${mode === 'sector' ? 'sector' : 'role'}`, lang)
    : t(`joint.award.${a.id}`, lang);
}

/**
 * Make the picture and share it (the share sheet, where the browser shares files) or download it. 'cancelled' when
 * the player closed the share sheet.
 */
export async function shareJointPicture(
  summary: RoomSummary,
  lang: Lang,
  avatarOf: (x: CoopReportSeat) => string | undefined,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await drawJointPicture(summary, lang, avatarOf);
  const fileName = `epd-${lang === 'et' ? 'uhine-raport' : 'joint-report'}-${summary.coop.code || 'shift'}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('joint.img.title', lang) });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
