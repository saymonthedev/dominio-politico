import type { Ctx } from "./state";
import { storyOf } from "./story/state";
import type { PersonRow, PersonStateRow } from "./types";

/**
 * Missões de início (19/11): os primeiros passos do Painel viram missões com recompensa e levam o
 * jogador novo até a filiação e a pré-candidatura, que é quando o jogo fica emocionante. Cada passo
 * se cumpre pelo que o jogador já fez no mundo; a recompensa sai na ação que cumpre o passo (ou na
 * seguinte, quando ele se cumpre com o tempo, como a resposta do partido). Personagem de antes das
 * missões começa com o que já tinha feito, sem recompensa por isso.
 */

export type StartStepId = "energia" | "reuniao" | "partido" | "tempo" | "acontecimento" | "mes" | "pre";

export interface StartStep {
  id: StartStepId;
  reward: { energy: number; capital: number; reputation: number };
}

/** Na ordem do Painel: primeiro o caminho até o partido, depois o que se aprende jogando, e a pré-candidatura. */
export const START_STEPS: readonly StartStep[] = [
  { id: "energia", reward: { energy: 10, capital: 0, reputation: 0 } },
  { id: "reuniao", reward: { energy: 10, capital: 2, reputation: 0 } },
  { id: "partido", reward: { energy: 15, capital: 3, reputation: 0 } },
  { id: "tempo", reward: { energy: 10, capital: 0, reputation: 0 } },
  { id: "acontecimento", reward: { energy: 5, capital: 0, reputation: 0 } },
  { id: "mes", reward: { energy: 5, capital: 0, reputation: 0 } },
  { id: "pre", reward: { energy: 20, capital: 5, reputation: 2 } },
];

const CANDIDATE_STAGES = new Set(["PRE_CANDIDATO", "CANDIDATO", "MANDATO"]);

/** O que o jogador já fez no mundo (no dia dele): cada passo cumprido. */
export function startDone(p: Pick<PersonRow, "stage" | "party_id" | "created_tick">, st: Pick<PersonStateRow, "action_seq" | "story" | "ledger">, tick: number): Record<StartStepId, boolean> {
  return {
    energia: st.action_seq > 0,
    // a reunião aberta de partido tira o cidadão do anonimato (aproximação); filiado já passou por isso
    reuniao: !(p.stage === "CIDADAO" || p.stage === "ATIVISTA") || !!p.party_id,
    partido: !!p.party_id,
    tempo: tick - p.created_tick >= 7,
    acontecimento: (st.story?.log ?? []).some((e) => !e.auto && e.kind !== "INFO"),
    mes: !!st.ledger?.month,
    pre: CANDIDATE_STAGES.has(p.stage),
  };
}

/** Texto da recompensa de um passo ("+10 de energia, +2 de capital político"). */
export function startRewardLabel(r: StartStep["reward"]): string {
  const parts = [`+${r.energy} de energia`];
  if (r.capital) parts.push(`+${r.capital} de capital político`);
  if (r.reputation) parts.push(`+${r.reputation} de reputação`);
  return parts.join(", ");
}

/** Personagem novo: as missões de início começam do zero (createCharacter). */
export function startFresh(st: PersonStateRow, p: PersonRow, date: string): void {
  storyOf(st, p, date).start = { done: [] };
}

/**
 * Antes da ação: personagem sem registro (criado antes das missões) começa com o que já tinha
 * feito, sem recompensa.
 */
export function startBaseline(ctx: Ctx, p: PersonRow, st: PersonStateRow): void {
  if (p.kind !== "PLAYER" || st.story?.start) return;
  const done = startDone(p, st, ctx.tick);
  storyOf(st, p, ctx.date).start = { done: START_STEPS.filter((s) => done[s.id]).map((s) => s.id) };
}

/** Depois da ação: paga os passos que acabaram de ser cumpridos. Devolve o aviso para a tela. */
export function startProgress(ctx: Ctx, p: PersonRow, st: PersonStateRow): string | null {
  if (p.kind !== "PLAYER") return null;
  const story = storyOf(st, p, ctx.date);
  const start = (story.start ??= { done: [] });
  if (start.done.length >= START_STEPS.length) return null;
  const done = startDone(p, st, ctx.tick);
  const paid: string[] = [];
  for (const s of START_STEPS) {
    if (!done[s.id] || start.done.includes(s.id)) continue;
    start.done.push(s.id);
    st.energy = Math.min(100, st.energy + s.reward.energy);
    st.political_capital = Math.min(100, st.political_capital + s.reward.capital);
    p.reputation = Math.min(100, p.reputation + s.reward.reputation);
    paid.push(startRewardLabel(s.reward));
  }
  if (!paid.length) return null;
  const all = START_STEPS.every((s) => start.done.includes(s.id));
  return `${paid.length === 1 ? "Missão de início cumprida" : `${paid.length} missões de início cumpridas`} (${paid.join("; ")}).${all ? " Você fechou as missões de início!" : ""}`;
}

/** As missões de início para o Painel: cumpridas (pelo estado ou pelo registro) e a recompensa de cada uma. */
export function startView(p: Pick<PersonRow, "stage" | "party_id" | "created_tick">, st: Pick<PersonStateRow, "action_seq" | "story" | "ledger">, tick: number) {
  const done = startDone(p, st, tick);
  const recorded = st.story?.start?.done ?? [];
  return START_STEPS.map((s) => ({ id: s.id, done: done[s.id] || recorded.includes(s.id), reward: startRewardLabel(s.reward) }));
}
