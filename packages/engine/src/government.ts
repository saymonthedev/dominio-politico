import { addDays } from "./calendar";
import { type Axis } from "./ideology";
import { OFFICES, type OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import type { BillRow, PersonRow, PolicyRow } from "./types";
import { geoName, ufOfGeo } from "./elections";

/**
 * Governo e Congresso simulados.
 * Projetos de lei são fictícios (gerados pelo motor); votações de bancada são
 * agregadas por partido. Políticas públicas têm custo, cronograma, chance de
 * atraso e efeitos com defasagem — uma obra não aumenta produtividade no dia
 * em que se aperta "aprovar".
 */

const BILL_TEMPLATES: Array<{ axis: Axis; dir: 1 | -1; title: string; summary: string; fiscal: number }> = [
  { axis: "economy", dir: -1, title: "PL que amplia o programa de transferência de renda", summary: "Eleva o valor do benefício e amplia a faixa de renda atendida.", fiscal: 0.3 },
  { axis: "economy", dir: 1, title: "PEC que limita o crescimento dos gastos públicos", summary: "Cria regra mais rígida para a despesa primária da União.", fiscal: -0.3 },
  { axis: "economy", dir: 1, title: "PL de simplificação tributária para pequenas empresas", summary: "Unifica tributos e reduz custos de conformidade.", fiscal: -0.05 },
  { axis: "economy", dir: -1, title: "PL que cria imposto sobre grandes fortunas", summary: "Institui alíquota progressiva sobre patrimônios elevados.", fiscal: -0.1 },
  { axis: "security", dir: 1, title: "PL que endurece penas para crimes violentos", summary: "Aumenta penas e restringe progressão de regime.", fiscal: 0.05 },
  { axis: "security", dir: -1, title: "PL de penas alternativas para crimes sem violência", summary: "Amplia alternativas à prisão para crimes de menor potencial ofensivo.", fiscal: -0.02 },
  { axis: "social", dir: 1, title: "PL que altera diretrizes do currículo escolar sobre costumes", summary: "Restringe conteúdos sobre temas de costumes nas escolas.", fiscal: 0 },
  { axis: "social", dir: -1, title: "PL de combate à discriminação no mercado de trabalho", summary: "Cria mecanismos de denúncia e punição por discriminação.", fiscal: 0.01 },
  { axis: "environment", dir: 1, title: "PL que endurece punições por desmatamento ilegal", summary: "Amplia multas e cria rastreamento de cadeias produtivas.", fiscal: 0.02 },
  { axis: "environment", dir: -1, title: "PL que acelera licenciamento ambiental de obras", summary: "Reduz prazos e etapas do licenciamento.", fiscal: -0.02 },
  { axis: "federalism", dir: 1, title: "PEC que amplia repasses a estados e municípios", summary: "Aumenta a fatia dos fundos de participação.", fiscal: 0.1 },
  { axis: "institutions", dir: 1, title: "PEC que amplia o poder de edição de medidas provisórias", summary: "Facilita a edição de MPs pelo Executivo.", fiscal: 0 },
  { axis: "institutions", dir: -1, title: "PL que cria orçamento participativo federal", summary: "Abre parte do orçamento a consultas públicas.", fiscal: 0.02 },
];

/** Mensal: novos projetos entram em pauta na Câmara. */
export function monthlyBills(ctx: Ctx): void {
  const rng = ctx.rng("bills");
  const n = rng.int(1, 3);
  const president = ctx.person(ctx.world.gov.president_id);
  const presParty = president?.party_id ? ctx.t.parties.get(president.party_id) : undefined;
  for (let i = 0; i < n; i++) {
    const tpl = rng.pick(BILL_TEMPLATES);
    const gov = presParty ? Math.sign(presParty.ideology[tpl.axis] * tpl.dir + 1e-9) : 0;
    const author = rng.pick([...ctx.t.parties.values()].filter((p) => (p.seats.camara ?? 0) > 0));
    const bill: BillRow = {
      id: ctx.id("bill"),
      world_id: ctx.world.id,
      chamber: "CAMARA",
      title: tpl.title,
      summary: tpl.summary,
      axis: tpl.axis,
      direction: tpl.dir,
      author_party_id: author?.id ?? null,
      author_person_id: null,
      gov_position: Math.abs(presParty?.ideology[tpl.axis] ?? 0) < 15 ? 0 : gov,
      vote_on: addDays(ctx.date, rng.int(14, 45)),
      status: "TRAMITANDO",
      votes: { yes: 0, no: 0, abstain: 0 },
      player_votes: {},
      fiscal_effect: tpl.fiscal,
    };
    ctx.save("bills", bill);
    for (const p of ctx.t.persons.values()) {
      if (p.kind === "PLAYER" && p.office_code === "DEP_FEDERAL") {
        ctx.notify(p.id, "Novo projeto em pauta", `${bill.title}. Votação prevista para ${bill.vote_on}.`, "/jogo/governo");
      }
    }
  }
}

/** Votação: bancadas votam conforme ideologia, orientação do governo e disciplina. */
export function dailyBillVotes(ctx: Ctx): void {
  for (const bill of ctx.t.bills.values()) {
    if (bill.status !== "TRAMITANDO" || bill.vote_on > ctx.date) continue;
    const rng = ctx.rng("vote", bill.id);
    let yes = 0;
    let no = 0;
    let abstain = 0;
    for (const party of ctx.t.parties.values()) {
      const seats = party.seats.camara ?? 0;
      if (!seats) continue;
      const position = party.ideology[bill.axis as Axis] * bill.direction;
      const govPull = bill.gov_position * party.gov_alignment * 30;
      const support = 1 / (1 + Math.exp(-(position + govPull) / 25));
      const cohesive = party.discipline;
      for (let s = 0; s < seats; s++) {
        const r = rng.float();
        const p = cohesive * (support > 0.5 ? 1 : 0) + (1 - cohesive) * support;
        if (r < 0.03) abstain++;
        else if (r < p) yes++;
        else no++;
      }
    }
    // Votos dos jogadores deputados federais substituem votos genéricos
    for (const [pid, v] of Object.entries(bill.player_votes)) {
      const p = ctx.person(pid);
      if (!p || p.office_code !== "DEP_FEDERAL") continue;
      if (v === "SIM") yes++;
      else if (v === "NAO") no++;
      else abstain++;
      if (yes + no + abstain > 513) {
        if (yes > no) yes--;
        else no--;
      }
      applyPlayerVoteConsequences(ctx, p, bill, v);
    }
    const quorum = bill.title.startsWith("PEC") ? 308 : Math.floor((yes + no + abstain) / 2) + 1;
    const approved = bill.title.startsWith("PEC") ? yes >= quorum : yes > no && yes + no + abstain >= 257;
    bill.status = approved ? "APROVADO" : "REJEITADO";
    bill.votes = { yes, no, abstain };
    ctx.save("bills", bill);
    if (approved && bill.fiscal_effect) {
      ctx.world.gov.fiscal_stance = Math.max(-1, Math.min(1, ctx.world.gov.fiscal_stance + bill.fiscal_effect * 0.5));
      ctx.saveWorld();
    }
    const govNote = bill.gov_position === 0 ? "O governo liberou a bancada." : (bill.gov_position > 0) === approved ? "Vitória do governo no plenário." : "Derrota para o governo no plenário.";
    ctx.publish("BILL_VOTE", {
      facts: { chamber: "Câmara", result: approved ? "aprova" : "rejeita", title: bill.title.replace(/^(PL|PEC) /, (m) => m), yes, no, govNote },
    });
  }
}

function applyPlayerVoteConsequences(ctx: Ctx, p: PersonRow, bill: BillRow, vote: "SIM" | "NAO" | "ABSTENCAO"): void {
  const party = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
  const st = ctx.pstate(p.id);
  if (!party || !st) return;
  const partyLine = party.ideology[bill.axis as Axis] * bill.direction + bill.gov_position * party.gov_alignment * 30 > 0 ? "SIM" : "NAO";
  if (vote !== "ABSTENCAO" && vote !== partyLine) {
    st.party_standing = Math.max(0, st.party_standing - 8 * party.discipline);
    ctx.notify(p.id, "Voto contra a orientação", `Você votou contra a orientação do ${party.acronym}. A direção não gostou.`, "/jogo/governo");
  } else if (vote === partyLine) {
    st.party_standing = Math.min(100, st.party_standing + 2);
  }
  // Coerência com o eleitorado da UF
  const segs = [...ctx.t.voter_segments.values()].filter((s) => s.uf === p.uf);
  const ufPosition = segs.reduce((s, sg) => s + sg.ideology[bill.axis as Axis] * sg.weight, 0) * bill.direction;
  const aligned = (vote === "SIM" && ufPosition > 0) || (vote === "NAO" && ufPosition < 0);
  p.reputation = Math.max(0, Math.min(100, p.reputation + (aligned ? 1 : -1)));
  ctx.save("persons", p);
  ctx.save("person_states", st);
}

// ---------------------------------------------------------------------------
// Políticas executivas
// ---------------------------------------------------------------------------

export interface PolicyDef {
  kind: string;
  title: string;
  description: string;
  costShare: number;
  months: [number, number];
  delayChance: number;
  effects: Record<string, number>;
  offices: OfficeCode[];
}

export const POLICY_CATALOG: PolicyDef[] = [
  { kind: "infraestrutura", title: "Programa de obras de infraestrutura", description: "Rodovias, saneamento e mobilidade. Caro e demorado, mas eleva a produtividade e a aprovação regional quando concluído.", costShare: 0.06, months: [12, 30], delayChance: 0.35, effects: { approval: 4, productivity: 0.15, fiscal: 0.15 }, offices: ["PRESIDENTE", "GOVERNADOR", "PREFEITO"] },
  { kind: "social", title: "Ampliação de programas sociais", description: "Mais renda para famílias pobres. Efeito rápido na aprovação, custo fiscal contínuo.", costShare: 0.04, months: [3, 6], delayChance: 0.1, effects: { approval: 6, fiscal: 0.25 }, offices: ["PRESIDENTE", "GOVERNADOR", "PREFEITO"] },
  { kind: "ajuste", title: "Ajuste fiscal", description: "Corte de despesas e revisão de benefícios. Melhora as contas e as expectativas, mas custa popularidade.", costShare: 0, months: [2, 4], delayChance: 0.15, effects: { approval: -5, fiscal: -0.35, confidence: 4 }, offices: ["PRESIDENTE", "GOVERNADOR", "PREFEITO"] },
  { kind: "seguranca", title: "Plano de segurança pública", description: "Mais policiamento, inteligência e presídios.", costShare: 0.03, months: [6, 12], delayChance: 0.2, effects: { approval: 4, fiscal: 0.1 }, offices: ["GOVERNADOR", "PRESIDENTE"] },
  { kind: "saude", title: "Mutirão da saúde", description: "Redução de filas de cirurgias e exames.", costShare: 0.03, months: [4, 9], delayChance: 0.2, effects: { approval: 5, fiscal: 0.1 }, offices: ["PRESIDENTE", "GOVERNADOR", "PREFEITO"] },
  { kind: "educacao", title: "Escolas em tempo integral", description: "Investimento de longo prazo; efeito eleitoral lento.", costShare: 0.03, months: [12, 24], delayChance: 0.25, effects: { approval: 3, productivity: 0.1, fiscal: 0.1 }, offices: ["PRESIDENTE", "GOVERNADOR", "PREFEITO"] },
  { kind: "transparencia", title: "Pacote de transparência e controle", description: "Portais de dados, auditorias e compliance. Reduz espaço para esquemas.", costShare: 0.005, months: [3, 8], delayChance: 0.1, effects: { approval: 2, integrity: 0.05 }, offices: ["PRESIDENTE", "GOVERNADOR", "PREFEITO"] },
];

export function startPolicy(ctx: Ctx, person: PersonRow, kind: string): PolicyRow {
  const def = POLICY_CATALOG.find((p) => p.kind === kind);
  if (!def) throw new Error("Política desconhecida");
  const office = person.office_code!;
  const rng = ctx.rng("policy", `${person.id}:${kind}`);
  const months = rng.int(def.months[0], def.months[1]);
  const row: PolicyRow = {
    id: ctx.id("pol", person.id, kind),
    world_id: ctx.world.id,
    owner_person_id: person.id,
    office_code: office,
    geo: person.office_geo ?? "BR",
    kind,
    title: def.title,
    started_on: ctx.date,
    completes_on: addDays(ctx.date, months * 30),
    status: "EM_ANDAMENTO",
    cost: def.costShare,
    delays: 0,
    effects: def.effects,
  };
  ctx.save("policies", row);
  return row;
}

/** Diário: políticas concluem, atrasam e produzem efeitos. */
export function dailyPolicies(ctx: Ctx): void {
  for (const pol of ctx.t.policies.values()) {
    if (pol.status !== "EM_ANDAMENTO" && pol.status !== "ATRASADA") continue;
    if (pol.completes_on > ctx.date) continue;
    const rng = ctx.rng("policy-done", pol.id);
    const def = POLICY_CATALOG.find((d) => d.kind === pol.kind);
    if (def && pol.delays < 2 && rng.chance(def.delayChance)) {
      pol.delays++;
      pol.status = "ATRASADA";
      pol.completes_on = addDays(ctx.date, rng.int(60, 180));
      ctx.save("policies", pol);
      ctx.publish("POLICY_DONE", { facts: { title: pol.title, status: "obra atrasa", body: `${OFFICES[pol.office_code].name} em ${geoName(pol.geo, ctx.s)}: o cronograma foi revisto por problemas de execução.` }, geography: ufOfGeo(pol.geo) });
      ctx.notify(pol.owner_person_id, "Política atrasada", `${pol.title} sofreu atraso.`, "/jogo/governo");
      continue;
    }
    pol.status = "CONCLUIDA";
    ctx.save("policies", pol);
    const owner = ctx.person(pol.owner_person_id);
    for (const m of ctx.t.mandates.values()) {
      if (m.person_id === pol.owner_person_id && m.status === "ATIVO") {
        m.approval = Math.max(0, Math.min(100, m.approval + (pol.effects.approval ?? 0)));
        ctx.save("mandates", m);
      }
    }
    if (owner) {
      owner.reputation = Math.max(0, Math.min(100, owner.reputation + (pol.effects.approval ?? 0) * 0.6));
      ctx.save("persons", owner);
    }
    if (pol.office_code === "PRESIDENTE") {
      ctx.world.gov.approval = Math.max(5, Math.min(90, ctx.world.gov.approval + (pol.effects.approval ?? 0)));
      ctx.world.gov.fiscal_stance = Math.max(-1, Math.min(1, ctx.world.gov.fiscal_stance + (pol.effects.fiscal ?? 0)));
      ctx.saveWorld();
      const e = ctx.s.economy;
      ctx.saveEconomy({ ...e, productivity: e.productivity + (pol.effects.productivity ?? 0), confidence: e.confidence + (pol.effects.confidence ?? 0) });
    }
    if (pol.effects.integrity && owner?.party_id) {
      const party = ctx.t.parties.get(owner.party_id);
      if (party) {
        party.integrity = Math.min(1, party.integrity + pol.effects.integrity);
        ctx.save("parties", party);
      }
    }
    ctx.publish("POLICY_DONE", { facts: { title: pol.title, status: "concluído", body: `${OFFICES[pol.office_code].name} em ${geoName(pol.geo, ctx.s)} entrega a política anunciada em ${pol.started_on}.` }, geography: ufOfGeo(pol.geo) });
    ctx.notify(pol.owner_person_id, "Política concluída", `${pol.title} foi concluída.`, "/jogo/governo");
  }
}

/** Mensal: o governo federal ajusta a postura fiscal (decisão do motor, narrada de forma institucional). */
export function monthlyFiscalStance(ctx: Ctx): void {
  const e = ctx.s.economy;
  const rng = ctx.rng("fiscal");
  const electionYear = Number(ctx.date.slice(0, 4)) % 4 === 2;
  let target = 0.1 + (electionYear ? 0.25 : 0) - (e.debt_gdp - 75) * 0.01 - (e.inflation_12m - 4.5) * 0.04 + (7 - e.unemployment) * -0.02;
  target += rng.normal(0, 0.05);
  const prev = ctx.world.gov.fiscal_stance;
  ctx.world.gov.fiscal_stance = Math.round((prev * 0.8 + target * 0.2) * 100) / 100;
  ctx.saveWorld();
  if (Math.abs(ctx.world.gov.fiscal_stance - prev) > 0.06) {
    const expansive = ctx.world.gov.fiscal_stance > prev;
    ctx.publish("GOV_FISCAL", {
      facts: {
        fiscalVerb: expansive ? "sinaliza aumento de gastos" : "sinaliza aperto nas contas",
        fiscalLabel: expansive ? "mais expansionista" : "mais contracionista",
        marketReaction: expansive ? "desconfiança e alta nos juros futuros" : "alívio nos juros futuros",
      },
    });
  }
}

