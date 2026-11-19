import type { ActionCategory } from "./actions";
import type { ISODate } from "./calendar";
import type { Ctx } from "./state";
import { storyOf } from "./story/state";
import type { CareerStage, PersonRow, PersonStateRow } from "./types";

/**
 * Missões da semana (retenção, 19/11): três metas por semana do jogo, de acordo com a etapa da
 * carreira, com recompensa na hora (energia e capital político) e um bônus por fechar as três.
 * Esquemas ilícitos nunca contam: o jogo não premia crime.
 */

/** A semana do jogo: a segunda-feira da data. */
export function weekOf(date: ISODate): ISODate {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export interface Mission {
  id: string;
  label: string;
  goal: number;
  reward: { energy: number; capital: number };
  cats: ActionCategory[] | null;
}

const MAIN: Record<CareerStage, { cats: ActionCategory[]; label: string }> = {
  CIDADAO: { cats: ["BASE"], label: "Faça 3 ações na sua comunidade" },
  ATIVISTA: { cats: ["BASE"], label: "Faça 3 ações na sua comunidade" },
  APROXIMACAO: { cats: ["BASE", "PARTIDO"], label: "Faça 3 ações na comunidade ou no partido" },
  FILIADO: { cats: ["PARTIDO", "MEU_PARTIDO", "COMANDO"], label: "Faça 3 ações no partido" },
  QUADRO: { cats: ["PARTIDO", "MEU_PARTIDO", "COMANDO"], label: "Faça 3 ações no partido" },
  PRE_CANDIDATO: { cats: ["CAMPANHA", "PARTIDO"], label: "Faça 3 ações de pré-campanha ou no partido" },
  CANDIDATO: { cats: ["CAMPANHA"], label: "Faça 3 ações de campanha" },
  MANDATO: { cats: ["MANDATO"], label: "Faça 3 ações de mandato" },
};

/** As missões desta semana para a etapa da carreira. */
export function missionsFor(p: Pick<PersonRow, "stage">): Mission[] {
  const main = MAIN[p.stage] ?? MAIN.CIDADAO;
  return [
    { id: "principal", label: main.label, goal: 3, reward: { energy: 15, capital: 3 }, cats: main.cats },
    { id: "vida", label: "Cuide da vida: 1 ação com a família, a saúde ou os bens", goal: 1, reward: { energy: 10, capital: 0 }, cats: ["VIDA", "BENS"] },
    { id: "ritmo", label: "Faça 6 ações na semana, de qualquer tipo", goal: 6, reward: { energy: 10, capital: 2 }, cats: null },
  ];
}

/** Conta a ação nas missões da semana e paga a recompensa de quem cumpriu. Devolve o aviso para a tela. */
export function missionProgress(ctx: Ctx, p: PersonRow, st: PersonStateRow, category: ActionCategory): string | null {
  if (p.kind !== "PLAYER" || category === "ESQUEMA") return null;
  const story = storyOf(st, p, ctx.date);
  const week = weekOf(ctx.date);
  if (story.missions?.week !== week) story.missions = { week, count: {}, done: [] };
  const m = story.missions;
  const list = missionsFor(p);
  const notes: string[] = [];
  for (const x of list) {
    if (m.done.includes(x.id) || (x.cats && !x.cats.includes(category))) continue;
    m.count[x.id] = (m.count[x.id] ?? 0) + 1;
    if (m.count[x.id] < x.goal) continue;
    m.done.push(x.id);
    st.energy = Math.min(100, st.energy + x.reward.energy);
    st.political_capital = Math.min(100, st.political_capital + x.reward.capital);
    notes.push(`Missão da semana cumprida (+${x.reward.energy} de energia${x.reward.capital ? `, +${x.reward.capital} de capital político` : ""}).`);
  }
  if (list.every((x) => m.done.includes(x.id)) && !m.done.includes("semana")) {
    m.done.push("semana");
    p.reputation = Math.min(100, p.reputation + 1);
    notes.push("Você cumpriu as três missões da semana: +1 de reputação.");
  }
  return notes.length ? notes.join(" ") : null;
}

/** As missões para o Painel: progresso de cada uma na semana de hoje. */
export function missionsView(p: Pick<PersonRow, "stage">, st: Pick<PersonStateRow, "story">, date: ISODate) {
  const week = weekOf(date);
  const m = st.story?.missions?.week === week ? st.story.missions : null;
  const items = missionsFor(p).map((x) => ({ ...x, count: Math.min(x.goal, m?.count[x.id] ?? 0), done: !!m?.done.includes(x.id) }));
  return { week, items, all: !!m?.done.includes("semana") };
}
