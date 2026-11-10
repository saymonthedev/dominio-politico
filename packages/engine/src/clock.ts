import type { WorldRow } from "./types";

/**
 * Relógio dos mundos compartilhados: o tempo anda sozinho, igual para todos, e ninguém
 * avança na mão. De dia (das 7h à meia-noite de Brasília) passam 2 meses de jogo a cada
 * 2 horas reais (1 dia a cada 2 minutos); de madrugada (da 0h às 7h), enquanto quase
 * todo mundo dorme, bem mais devagar: 7 dias a cada 2 horas. Nos mundos só do jogador
 * (próprio ou fictício) o relógio não anda sozinho: o jogador avança quando quiser.
 */
export const SHARED_DAY_SPEED = 30;
export const SHARED_NIGHT_SPEED = 3.5;
/** a madrugada vai da 0h até esta hora de Brasília */
export const NIGHT_UNTIL = 7;
/** velocidade gravada nos mundos compartilhados (marca o relógio em uso) */
export const SHARED_SPEED = SHARED_DAY_SPEED;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Brasília: UTC−3, sem horário de verão desde 2019 */
const BRT = 3 * HOUR;
const PER_DAY = NIGHT_UNTIL * SHARED_NIGHT_SPEED + (24 - NIGHT_UNTIL) * SHARED_DAY_SPEED;

/** Hora de Brasília (0 a 23) de uma hora real. */
export const brasiliaHour = (ms: number): number => new Date(ms - BRT).getUTCHours();

/** Dias de jogo que o relógio compartilhado acumulou até a hora real `ms` (desde 1970). */
function sharedDaysAt(ms: number): number {
  const local = ms - BRT;
  const d = Math.floor(local / DAY);
  const h = (local - d * DAY) / HOUR;
  const today = h < NIGHT_UNTIL ? h * SHARED_NIGHT_SPEED : NIGHT_UNTIL * SHARED_NIGHT_SPEED + (h - NIGHT_UNTIL) * SHARED_DAY_SPEED;
  return d * PER_DAY + today;
}

/** Ritmo do relógio compartilhado na hora real `ms` e a hora real em que ele muda. */
export function clockPace(ms: number): { night: boolean; perHour: number; changesAt: number } {
  const local = ms - BRT;
  const dayStart = Math.floor(local / DAY) * DAY;
  const night = local - dayStart < NIGHT_UNTIL * HOUR;
  return { night, perHour: night ? SHARED_NIGHT_SPEED : SHARED_DAY_SPEED, changesAt: (night ? dayStart + NIGHT_UNTIL * HOUR : dayStart + DAY) + BRT };
}

/**
 * Dia de jogo (tick) em que o relógio do mundo está na hora real `ms`: o dia da âncora
 * mais o que o relógio compartilhado andou desde ela. Velocidade zero (mundo só do
 * jogador): o relógio não anda sozinho.
 */
export function clockTarget(w: Pick<WorldRow, "anchor_real_at" | "anchor_tick" | "game_days_per_real_hour">, ms: number): number {
  const speed = w.game_days_per_real_hour;
  if (!(speed > 0)) return w.anchor_tick;
  const days = (sharedDaysAt(ms) - sharedDaysAt(Date.parse(w.anchor_real_at))) * (speed / SHARED_SPEED);
  return w.anchor_tick + Math.max(0, Math.floor(days + 1e-6));
}
