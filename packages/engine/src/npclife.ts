import { ageAt } from "./calendar";
import { AXES, AXIS_INFO, ideologyAffinity, type Axis } from "./ideology";
import { isReal } from "./news/policy";
import { spawnProceduralCadre } from "./npc";
import { eraRules } from "./ruleset";
import type { Ctx } from "./state";
import type { ElectionRow, PersonRow } from "./types";
import { joinParty } from "./affiliation";

/**
 * Vida autônoma dos atores não-jogadores: troca de partido (janela partidária),
 * aposentadoria, renovação de quadros e agenda pública de personagens procedurais.
 */

/** Janela partidária: parlamentares (reais ou procedurais) podem trocar de legenda. */
export function partySwitchWindow(ctx: Ctx, e: ElectionRow): void {
  const era = eraRules(e.year);
  const parties = [...ctx.t.parties.values()].filter((p) => p.status === "ATIVO");
  const proportional = e.kind === "GERAL" ? ["DEP_FEDERAL", "DEP_ESTADUAL"] : ["VEREADOR"];
  for (const p of ctx.t.persons.values()) {
    if (p.kind === "PLAYER" || p.status !== "ACTIVE" || !p.party_id) continue;
    if (era.partySwitchWindow && !proportional.includes(p.office_code ?? "")) continue;
    const rng = ctx.rng("switch", p.id);
    if (!rng.chance(era.partySwitchWindow ? 0.012 : 0.0015)) continue;
    const current = ctx.t.parties.get(p.party_id);
    if (!current) continue;
    const uf = p.uf;
    const options = parties
      .filter((x) => x.id !== current.id)
      .map((x) => ({ x, u: ideologyAffinity(p.ideology, x.ideology) * 2 + (x.territory[uf] ?? 0) * 1.5 + (x.seats.camara ?? 0) / 200 + rng.normal(0, 0.2) }))
      .sort((a, b) => b.u - a.u);
    const target = options[0]?.x;
    const currentU = ideologyAffinity(p.ideology, current.ideology) * 2 + (current.territory[uf] ?? 0) * 1.5 + (current.seats.camara ?? 0) / 200;
    if (!target || options[0].u < currentU + 0.15) continue;
    joinParty(ctx, p, target);
    p.stage = p.office_code ? "MANDATO" : "QUADRO";
    ctx.save("persons", p);
    ctx.publish("NPC_PARTY_SWITCH", { facts: { name: p.name, fromParty: current.acronym, toParty: target.acronym, uf: p.uf }, personIds: [p.id], geography: p.uf });
  }
}

/** Anual: aposentadoria (neutra para pessoas reais) e renovação de quadros procedurais. */
export function yearlyRenewal(ctx: Ctx): void {
  for (const p of ctx.t.persons.values()) {
    if (p.kind === "PLAYER" || p.status !== "ACTIVE") continue;
    const age = ageAt(p.birth_year, ctx.date);
    const rng = ctx.rng("retire", p.id);
    const hasFutureOrActive = [...ctx.t.mandates.values()].some((m) => m.person_id === p.id && (m.status === "ATIVO" || m.status === "FUTURO"));
    let prob = 0;
    if (age >= 70) prob = 0.06 + (age - 70) * 0.03;
    if (!hasFutureOrActive && age >= 60) prob += 0.05;
    if (!hasFutureOrActive && p.kind === "FICTIONAL_GENERATED" && p.role_label?.includes("operador")) prob += 0.1;
    if (hasFutureOrActive) prob *= 0.2;
    if (!rng.chance(prob)) continue;
    retire(ctx, p);
  }
  // Renovação: cada partido mantém ao menos um dirigente procedural nas UFs onde tem força
  for (const party of ctx.t.parties.values()) {
    if (party.status !== "ATIVO") continue;
    for (const [uf, strength] of Object.entries(party.territory)) {
      if (strength < 0.1) continue;
      const active = [...ctx.t.persons.values()].filter((p) => p.party_id === party.id && p.uf === uf && p.status === "ACTIVE");
      if (active.length >= 2) continue;
      const np = spawnProceduralCadre(ctx, { partyId: party.id, uf, ideology: party.ideology, roleLabel: `dirigente estadual do ${party.acronym}`, ageRange: [25, 45], tier: 3 });
      if (ctx.rng("newface", np.id).chance(0.3)) {
        ctx.publish("NEW_FACE", { facts: { party: party.acronym, name: np.name, uf, age: ageAt(np.birth_year, ctx.date), profession: np.profession }, personIds: [np.id], geography: uf });
      }
    }
  }
}

export function retire(ctx: Ctx, p: PersonRow): void {
  p.status = "RETIRED";
  p.status_note = "Não participa mais da vida política nesta linha do tempo simulada.";
  ctx.save("persons", p);
  for (const m of ctx.t.mandates.values()) {
    if (m.person_id === p.id && m.status === "FUTURO") {
      m.status = "ENCERRADO";
      ctx.save("mandates", m);
    }
  }
  const party = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
  if (isReal(p.kind)) {
    if (p.tier <= 2) ctx.publish("REAL_RETIREMENT", { facts: { name: p.name }, personIds: [p.id], geography: p.uf });
  } else if (p.tier <= 2 || ctx.rng("retire-news", p.id).chance(0.2)) {
    ctx.publish("NPC_RETIREMENT", { facts: { name: p.name, party: party?.acronym ?? "sem partido", uf: p.uf }, personIds: [p.id], geography: p.uf });
  }
}

const PROPOSALS: Record<Axis, { pos: string[]; neg: string[] }> = {
  economy: { pos: ["reduzir impostos sobre empresas", "privatizar estatais deficitárias", "simplificar regras trabalhistas"], neg: ["ampliar programas de transferência de renda", "criar um banco público de fomento regional", "taxar grandes fortunas"] },
  social: { pos: ["reforçar o ensino de valores tradicionais nas escolas", "restringir a pauta de costumes no currículo"], neg: ["ampliar políticas de igualdade de gênero", "criar programas contra a discriminação"] },
  security: { pos: ["endurecer penas para crimes violentos", "ampliar o efetivo policial nas ruas"], neg: ["investir em prevenção e mediação de conflitos", "ampliar penas alternativas"] },
  institutions: { pos: ["fortalecer o poder do Executivo em situações de crise"], neg: ["criar conselhos participativos de orçamento"] },
  environment: { pos: ["zerar o desmatamento ilegal até o fim da década", "ampliar unidades de conservação"], neg: ["acelerar licenças ambientais para obras", "expandir a fronteira agrícola"] },
  federalism: { pos: ["dar mais autonomia tributária aos estados"], neg: ["centralizar a coordenação nacional da saúde"] },
};

/** Agenda pública semanal: personagens procedurais fazem propostas (nunca pessoas reais). */
export function weeklyAgenda(ctx: Ctx): void {
  const rng = ctx.rng("agenda");
  const procedural = [...ctx.t.persons.values()].filter((p) => p.kind === "FICTIONAL_GENERATED" && p.status === "ACTIVE" && p.party_id && p.tier <= 2);
  if (!procedural.length) return;
  const n = rng.int(0, 2);
  for (let i = 0; i < n; i++) {
    const p = rng.pick(procedural);
    const party = ctx.t.parties.get(p.party_id!);
    if (!party) continue;
    const ax = [...AXES].sort((a, b) => Math.abs(p.ideology[b]) - Math.abs(p.ideology[a]))[0];
    const dir = p.ideology[ax] >= 0 ? "pos" : "neg";
    const proposal = rng.pick(PROPOSALS[ax][dir]);
    const opposite = AXIS_INFO[ax][dir === "pos" ? "neg" : "pos"];
    ctx.publish("NPC_PROPOSAL", {
      facts: { name: p.name, party: party.acronym, uf: p.uf, proposal, quote: `Vamos ${proposal}. É o que a população espera de nós.`, opposite: `uma linha ${opposite}` },
      personIds: [p.id],
      geography: p.uf,
    });
  }
}
