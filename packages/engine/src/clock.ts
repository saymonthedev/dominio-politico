import type { WorldRow } from "./types";

/**
 * Relógio dos mundos compartilhados: o tempo anda sozinho, em saltos fixos de
 * 7 dias de jogo a cada 2 horas reais, nas horas pares de Brasília (0h, 2h, …,
 * 22h). Ninguém avança na mão, então quem fica fora não é atropelado por quem
 * joga mais. Nos mundos só do jogador (próprio ou fictício) o relógio não anda
 * sozinho: o jogador avança quando quiser.
 */
export const SHARED_STEP_DAYS = 7;
export const SHARED_STEP_HOURS = 2;
/** velocidade gravada nos mundos compartilhados (dias de jogo por hora real) */
export const SHARED_SPEED = SHARED_STEP_DAYS / SHARED_STEP_HOURS;

const HOUR = 3_600_000;
/** Brasília (UTC−3, sem horário de verão desde 2019): os saltos caem nas horas pares de lá */
const BRT = 3 * HOUR;
const STEP = SHARED_STEP_HOURS * HOUR;

/** Número do salto em que a hora real `ms` está. */
export const clockStep = (ms: number): number => Math.floor((ms - BRT) / STEP);

/** Hora real (ms) do próximo salto depois de `ms`. */
export const nextClockStep = (ms: number): number => (clockStep(ms) + 1) * STEP + BRT;

/** Hora de Brasília (0 a 23) de uma hora real. */
export const brasiliaHour = (ms: number): number => new Date(ms - BRT).getUTCHours();

/**
 * Dia de jogo (tick) em que o relógio do mundo está na hora real `ms`: o dia da
 * âncora mais um salto para cada hora par de Brasília cruzada desde ela.
 * Velocidade zero (mundo só do jogador): o relógio não anda sozinho.
 */
export function clockTarget(w: Pick<WorldRow, "anchor_real_at" | "anchor_tick" | "game_days_per_real_hour">, ms: number): number {
  const speed = w.game_days_per_real_hour;
  if (!(speed > 0)) return w.anchor_tick;
  const steps = Math.max(0, clockStep(ms) - clockStep(Date.parse(w.anchor_real_at)));
  return w.anchor_tick + Math.floor(steps * speed * SHARED_STEP_HOURS);
}
