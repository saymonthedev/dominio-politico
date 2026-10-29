import { worldPriceLevel } from "./finance";
import { OFFICES, type OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import type { PersonRow, PersonStateRow } from "./types";

/**
 * Conquistas da carreira. Cada uma é conferida pelo estado do mundo e fica
 * registrada com a data em que aconteceu (person_states.achievements). Só
 * jogadores têm conquistas; elas somam pontos para o ranking do mundo.
 */
export interface AchievementDef {
  id: string;
  title: string;
  text: string;
  icon: string;
  points: number;
  check: (ctx: Ctx, p: PersonRow, st: PersonStateRow) => boolean;
}

const STAGE_ORDER = ["CIDADAO", "ATIVISTA", "APROXIMACAO", "FILIADO", "QUADRO", "PRE_CANDIDATO", "CANDIDATO", "MANDATO"];
const reached = (p: PersonRow, stage: string) => STAGE_ORDER.indexOf(p.stage) >= STAGE_ORDER.indexOf(stage) || !!p.office_code;
const mandates = (ctx: Ctx, p: PersonRow) => [...ctx.t.mandates.values()].filter((m) => m.person_id === p.id && m.status !== "FUTURO");
const heldOffice = (ctx: Ctx, p: PersonRow, office: OfficeCode) => p.office_code === office || mandates(ctx, p).some((m) => m.office_code === office);

const office = (code: OfficeCode, points: number, text: string): AchievementDef => ({
  id: `cargo_${code.toLowerCase()}`,
  title: OFFICES[code].name,
  text,
  icon: code === "PRESIDENTE" ? "star" : "landmark",
  points,
  check: (ctx, p) => heldOffice(ctx, p, code),
});

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "ativista", title: "Voz do bairro", text: "Virou ativista: os partidos começaram a notar você.", icon: "megaphone", points: 5, check: (_c, p) => reached(p, "ATIVISTA") },
  { id: "filiado", title: "Ficha de filiação", text: "Entrou para um partido.", icon: "flag", points: 10, check: (_c, p) => !!p.party_id || reached(p, "FILIADO") },
  { id: "quadro", title: "Quadro partidário", text: "Ganhou peso dentro do partido para disputar convenções.", icon: "users", points: 15, check: (_c, p) => reached(p, "QUADRO") },
  {
    id: "candidato",
    title: "Nome na urna",
    text: "Teve a candidatura homologada.",
    icon: "ballot",
    points: 20,
    check: (ctx, p) => [...ctx.t.candidacies.values()].some((c) => c.person_id === p.id && ["HOMOLOGADA", "ELEITO", "NAO_ELEITO", "SEGUNDO_TURNO", "SUPLENTE"].includes(c.status)),
  },
  { id: "eleito", title: "Primeiro mandato", text: "Venceu uma eleição e tomou posse.", icon: "check", points: 30, check: (ctx, p) => !!p.office_code || mandates(ctx, p).length > 0 },
  { id: "reeleito", title: "De novo", text: "Exerceu dois mandatos ou mais.", icon: "trending", points: 25, check: (ctx, p) => mandates(ctx, p).length >= 2 },
  office("VEREADOR", 10, "Exerceu mandato na Câmara Municipal."),
  office("PREFEITO", 30, "Governou uma cidade."),
  office("DEP_ESTADUAL", 25, "Exerceu mandato na Assembleia Legislativa."),
  office("DEP_FEDERAL", 35, "Exerceu mandato na Câmara dos Deputados."),
  office("SENADOR", 45, "Exerceu mandato no Senado Federal."),
  office("GOVERNADOR", 55, "Governou um estado."),
  office("PRESIDENTE", 100, "Chegou ao Planalto."),
  {
    id: "fundador",
    title: "Fundador(a)",
    text: "Fundou um partido e conseguiu o registro no TSE.",
    icon: "flag",
    points: 40,
    check: (ctx, p) => [...ctx.t.parties.values()].some((x) => x.founder_id === p.id && x.status === "ATIVO"),
  },
  { id: "presidente_partido", title: "Dono da caneta", text: "Presidiu um partido.", icon: "key", points: 20, check: (ctx, p) => [...ctx.t.parties.values()].some((x) => x.president_id === p.id && x.status === "ATIVO") },
  { id: "reputacao", title: "Nome respeitado", text: "Chegou a 70 de reputação.", icon: "star", points: 15, check: (_c, p) => p.reputation >= 70 },
  {
    id: "articulador",
    title: "Articulador(a)",
    text: "Construiu dez relações fortes na política.",
    icon: "users",
    points: 15,
    check: (ctx, p) => [...ctx.t.relationships.values()].filter((r) => r.a_id === p.id && r.score >= 50).length >= 10,
  },
  {
    id: "patrimonio",
    title: "Primeiro milhão",
    text: "Chegou a R$ 1 milhão de patrimônio declarado (em valores de 2026).",
    icon: "coins",
    points: 10,
    check: (ctx, _p, st) => st.money + st.assets - st.debt >= 1_000_000 * worldPriceLevel(ctx.world),
  },
  {
    id: "maos_limpas",
    title: "Mãos limpas",
    text: "Exerceu um mandato inteiro sem nenhuma conduta ilegal.",
    icon: "shield",
    points: 25,
    check: (ctx, p) => mandates(ctx, p).some((m) => m.status === "ENCERRADO") && ![...ctx.t.illicit_acts.values()].some((a) => a.person_id === p.id),
  },
  {
    id: "absolvido",
    title: "Inocentado(a)",
    text: "Foi investigado(a) e o caso terminou arquivado ou com absolvição.",
    icon: "scale",
    points: 10,
    check: (ctx, p) => [...ctx.t.investigations.values()].some((i) => i.person_id === p.id && (i.outcome === "ARQUIVADO" || i.outcome === "ABSOLVIDO")),
  },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Confere as conquistas de um jogador e registra as novas (com aviso). */
export function checkAchievements(ctx: Ctx, p: PersonRow): string[] {
  const st = ctx.pstate(p.id);
  if (!st || p.kind !== "PLAYER" || p.status !== "ACTIVE") return [];
  st.achievements ??= {};
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (st.achievements[a.id] || !a.check(ctx, p, st)) continue;
    st.achievements[a.id] = ctx.date;
    fresh.push(a.id);
    ctx.notify(p.id, `Conquista: ${a.title}`, `${a.text} +${a.points} pontos no ranking do mundo.`, "/jogo/carreira");
  }
  if (fresh.length) ctx.save("person_states", st);
  return fresh;
}

/** Pontos de carreira: conquistas, cargo atual e reputação. */
export function careerScore(p: PersonRow, st: PersonStateRow | undefined): number {
  const fromAch = Object.keys(st?.achievements ?? {}).reduce((s, id) => s + (ACHIEVEMENT_BY_ID[id]?.points ?? 0), 0);
  const fromOffice = p.office_code ? OFFICES[p.office_code].rank * 10 : 0;
  return Math.round(fromAch + fromOffice + p.reputation / 2);
}
