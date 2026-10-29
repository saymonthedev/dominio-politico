import { addDays, diffDays } from "./calendar";
import type { WorldState } from "./state";

/**
 * Relógio compartilhado. O mundo é um só para todos os jogadores de um ponto
 * de partida: quem avança o tempo avança para todos. Sozinho, o jogador avança
 * sem limite. Com outros jogadores ativos, valem duas regras simples:
 *  - até 60 dias de jogo por hora real, somando os avanços de todos;
 *  - o avanço para na véspera dos marcos (prazo de filiação, fim das
 *    convenções, turnos), que só podem ser cruzados 30 minutos depois do
 *    último avanço manual. O relógio automático segue normal.
 */

export const SHARED_DAYS_PER_HOUR = 60;
export const MILESTONE_HOLD_MIN = 30;

export interface ClockAdvance {
  person_id: string | null;
  name: string | null;
  days: number;
  from: string | null;
  to: string | null;
  /** hora real do avanço (ISO) */
  at: string;
}

export interface ClockStatus {
  /** outros jogadores que agiram nas últimas 72 h */
  others: string[];
  /** há outros jogadores: valem a cota por hora e as paradas em marcos */
  shared: boolean;
  /** dias ainda disponíveis nesta hora (null = sem limite) */
  remaining: number | null;
  /** quando a cota volta a crescer (ISO) */
  freesAt: string | null;
  /** últimos avanços manuais, do mais recente para o mais antigo */
  recent: ClockAdvance[];
  /** hora do banco (ISO), para as contas de tempo */
  now: string;
}

export interface Milestone {
  date: string;
  label: string;
}

export interface AdvancePlan {
  ok: boolean;
  /** dias manuais que serão processados */
  days: number;
  message?: string;
  /** marco em cuja véspera o avanço para (ou que ainda não pode ser cruzado) */
  stop?: Milestone;
}

/** Datas que ninguém deve pular sem dar chance aos outros jogadores. */
export function clockMilestones(state: WorldState): Milestone[] {
  const out: Milestone[] = [];
  for (const e of state.t.elections.values()) {
    if (e.status === "ENCERRADA") continue;
    if (e.calendar.filiationDeadline) out.push({ date: e.calendar.filiationDeadline, label: `prazo de filiação de ${e.year}` });
    if (e.calendar.conventionEnd) out.push({ date: e.calendar.conventionEnd, label: `fim das convenções de ${e.year}` });
    out.push({ date: e.first_round, label: `1º turno de ${e.year}` });
    if (e.status === "SEGUNDO_TURNO") out.push({ date: e.runoff, label: `2º turno de ${e.year}` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function minutesUntil(iso: string, now: string): string {
  const m = Math.max(1, Math.ceil((Date.parse(iso) - Date.parse(now)) / 60_000));
  return m >= 60 ? `em cerca de ${Math.round(m / 60)} h` : `em ${m} min`;
}

/** Quanto um avanço manual pode andar agora, a partir de `from` (data de jogo). */
export function planAdvance(state: WorldState, clock: ClockStatus, from: string, wanted: number): AdvancePlan {
  if (!clock.shared) return { ok: true, days: wanted };
  const days = Math.min(wanted, clock.remaining ?? wanted);
  if (days < 1) {
    return {
      ok: false,
      days: 0,
      message: `Há outros jogadores neste mundo e o relógio já andou ${SHARED_DAYS_PER_HOUR} dias na última hora.${clock.freesAt ? ` Libera ${minutesUntil(clock.freesAt, clock.now)}.` : ""}`,
    };
  }
  const to = addDays(from, days);
  for (const m of clockMilestones(state)) {
    if (m.date <= from || m.date > to) continue;
    const eve = addDays(m.date, -1);
    if (from < eve) return { ok: true, days: diffDays(eve, from), stop: m };
    const last = clock.recent[0];
    const release = last ? Date.parse(last.at) + MILESTONE_HOLD_MIN * 60_000 : 0;
    if (Date.parse(clock.now) < release) {
      return {
        ok: false,
        days: 0,
        stop: m,
        message: `O mundo está na véspera do ${m.label}. Com outros jogadores ativos, o avanço manual passa dessa data ${minutesUntil(new Date(release).toISOString(), clock.now)}.`,
      };
    }
    // véspera liberada: cruza este marco e para antes do próximo, se houver
  }
  return { ok: true, days };
}
