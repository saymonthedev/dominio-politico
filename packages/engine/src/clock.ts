import { addDays, diffDays, type ISODate } from "./calendar";
import type { WorldState } from "./state";
import type { WorldRow } from "./types";

/**
 * Relógio dos mundos compartilhados, em rodadas de 2 horas reais (viradas nas horas pares de
 * Brasília). Dentro da rodada o mundo fica parado no dia em que ela começou e cada jogador vive
 * os próprios dias, no ritmo dele, até o fim da rodada (a história dele, as decisões, a energia e
 * as ações correm na data dele). Na virada, o mundo anda tudo de uma vez, para todos: quem não
 * viveu os dias da rodada fica sem eles.
 *
 * Tamanho da rodada: 2 meses de jogo de dia; 1 semana nas rodadas da madrugada (as que começam à
 * 0h, às 2h e às 4h). A rodada termina antes num marco do calendário eleitoral (prazo de
 * filiação, convenções, campanha, turnos), para ninguém viver um dia que o mundo ainda não
 * processou; durante a campanha, a rodada tem no máximo 15 dias, para as pesquisas e os debates
 * andarem a cada 2 horas.
 */
export const ROUND_HOURS = 2;
export const ROUND_DAY_DAYS = 60;
export const ROUND_NIGHT_DAYS = 7;
export const CAMPAIGN_ROUND_DAYS = 15;
/** rodadas da madrugada: as que começam antes desta hora de Brasília */
export const NIGHT_UNTIL = 6;
/** marca gravada nos mundos compartilhados que usam as rodadas */
export const SHARED_SPEED = (3 * ROUND_NIGHT_DAYS + 9 * ROUND_DAY_DAYS) / 24;

const HOUR = 3_600_000;
/** Brasília: UTC−3, sem horário de verão desde 2019 */
const BRT = 3 * HOUR;
const ROUND = ROUND_HOURS * HOUR;

/** Hora de Brasília (0 a 23) de uma hora real. */
export const brasiliaHour = (ms: number): number => new Date(ms - BRT).getUTCHours();
/** Número da rodada em que a hora real `ms` está. */
export const roundIndex = (ms: number): number => Math.floor((ms - BRT) / ROUND);
/** Hora real (ms) em que a rodada `i` começa. */
export const roundStartsAt = (i: number): number => i * ROUND + BRT;
/** Dias de jogo de uma rodada sem marco no caminho. */
export const roundDays = (i: number): number => (brasiliaHour(roundStartsAt(i)) < NIGHT_UNTIL ? ROUND_NIGHT_DAYS : ROUND_DAY_DAYS);

type ClockRow = Pick<WorldRow, "tick" | "anchor_tick" | "game_days_per_real_hour" | "stats">;

/** O mundo usa as rodadas (mundo compartilhado já no relógio novo). */
export const usesRounds = (w: ClockRow): boolean => typeof w.stats?.round_done === "number" && w.game_days_per_real_hour === SHARED_SPEED;

export interface Milestone {
  date: ISODate;
  label: string;
}

/** Marcos do calendário eleitoral depois de `from`, em ordem. */
export function nextMilestones(state: WorldState, from: ISODate): Milestone[] {
  const out: Milestone[] = [];
  const add = (date: ISODate | undefined, label: string) => {
    if (date && date > from) out.push({ date, label });
  };
  for (const e of state.t.elections.values()) {
    if (e.status === "ENCERRADA") continue;
    const c = e.calendar;
    add(c.preCampaignStart, `início do ano eleitoral de ${e.year}`);
    add(c.filiationDeadline, `prazo de filiação de ${e.year}`);
    add(c.conventionStart, `início das convenções de ${e.year}`);
    add(c.conventionEnd, `fim das convenções de ${e.year}`);
    add(c.campaignStart, `início da campanha de ${e.year}`);
    add(e.first_round, `1º turno de ${e.year}`);
    if (e.status === "SEGUNDO_TURNO") add(e.runoff, `2º turno de ${e.year}`);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const inCampaign = (state: WorldState) => [...state.t.elections.values()].some((e) => e.status === "CAMPANHA" || e.status === "SEGUNDO_TURNO");

export interface RoundPlan {
  /** dia (tick) a que o mundo chega no fim da rodada */
  until: number;
  /** último dia que os jogadores podem viver na rodada (a véspera, se ela termina num marco) */
  cap: number;
  /** marco em que a rodada termina, se houver */
  milestone: Milestone | null;
}

/** Até onde vai a rodada `i`, começando no dia em que o mundo está agora. */
export function planRound(state: WorldState, i: number): RoundPlan {
  const w = state.world;
  let days = roundDays(i);
  if (inCampaign(state)) days = Math.min(days, CAMPAIGN_ROUND_DAYS);
  const m = nextMilestones(state, w.game_date)[0];
  if (m && diffDays(m.date, w.game_date) <= days) {
    const until = w.tick + diffDays(m.date, w.game_date);
    return { until, cap: until - 1, milestone: m };
  }
  return { until: w.tick + days, cap: w.tick + days, milestone: null };
}

/**
 * Põe o mundo compartilhado nas rodadas a partir de agora (a rodada em curso começa no dia em
 * que o mundo está), sem pular dias. Devolve true se mudou algo.
 */
export function alignRounds(state: WorldState, ms: number): boolean {
  if (usesRounds(state.world)) return false;
  const w = state.world;
  const i = roundIndex(ms);
  const plan = planRound(state, i);
  w.game_days_per_real_hour = SHARED_SPEED;
  w.anchor_tick = w.tick;
  w.anchor_real_at = new Date(ms).toISOString();
  w.stats = { ...w.stats, round_done: i - 1, round_until: plan.until, round_cap: plan.cap };
  return true;
}

/** Alguma rodada já terminou e o mundo ainda não andou até o fim dela. */
export const roundDue = (w: ClockRow, ms: number): boolean => usesRounds(w) && w.stats.round_done < roundIndex(ms) - 1;

/** O mundo chegou ao fim da rodada: ela fica fechada e a seguinte começa daqui. */
export function closeRound(state: WorldState): void {
  const w = state.world;
  const next = w.stats.round_done + 2;
  const plan = planRound(state, next);
  w.stats = { ...w.stats, round_done: w.stats.round_done + 1, round_until: plan.until, round_cap: plan.cap };
}

/** Rodada em curso para as telas. */
export interface RoundView {
  index: number;
  /** quando a rodada termina (hora real, ms) */
  endsAt: number;
  night: boolean;
  /** dia (tick) a que o mundo chega no fim da rodada e o último dia que dá para viver */
  until: number;
  cap: number;
  untilDate: ISODate;
  capDate: ISODate;
  milestone: Milestone | null;
}

export function roundView(state: WorldState, ms: number): RoundView | null {
  if (!usesRounds(state.world)) return null;
  const w = state.world;
  const i = Math.max(roundIndex(ms), w.stats.round_done + 1);
  const until = w.stats.round_until;
  const cap = w.stats.round_cap;
  const m = nextMilestones(state, w.game_date)[0];
  return {
    index: i,
    endsAt: roundStartsAt(i + 1),
    night: roundDays(i) === ROUND_NIGHT_DAYS,
    until,
    cap,
    untilDate: addDays(w.game_date, until - w.tick),
    capDate: addDays(w.game_date, cap - w.tick),
    milestone: m && diffDays(m.date, w.game_date) === until - w.tick ? m : null,
  };
}

/**
 * Dia (tick) a que o mundo precisa chegar agora. Mundo só do jogador (ou compartilhado ainda fora
 * das rodadas): parado, não anda sozinho. Nas rodadas: o fim da rodada mais antiga já terminada.
 */
export function clockTarget(w: ClockRow, ms: number): number {
  if (usesRounds(w)) return roundDue(w, ms) ? w.stats.round_until : w.tick;
  return Math.min(w.anchor_tick, w.tick);
}
