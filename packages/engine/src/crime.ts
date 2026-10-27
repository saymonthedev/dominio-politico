import { addDays, addMonths, diffDays } from "./calendar";
import { isReal } from "./news/policy";
import { spawnProceduralCadre } from "./npc";
import type { Ctx } from "./state";
import type { IllicitActRow, IllicitKind, InvestigationRow, Offer, PartyRow, PersonRow } from "./types";

/**
 * Corrupção, caixa dois, desinformação e investigação — por RISCO e EVIDÊNCIA,
 * nunca por tutorial de como ocultar crimes.
 *
 * Quem pode cometer crimes na simulação: jogadores e personagens procedurais
 * (que podem ser filiados a partidos reais). Pessoas reais nunca são autoras,
 * cúmplices nem alvos de investigação inventada — o motor recusa.
 *
 * Fluxo: conduta ilícita → rastros e testemunhas → alguém percebeu? →
 * denúncia/vazamento → imprensa ou oposição → investigação institucional →
 * processo → absolvição/arquivamento/punição → impacto partidário e eleitoral.
 */

export const STAGE_LABEL: Record<InvestigationRow["stage"], string> = {
  DENUNCIA: "Denúncia",
  IMPRENSA: "Na imprensa",
  INVESTIGACAO: "Investigação institucional",
  PROCESSO: "Processo judicial",
  DESFECHO: "Desfecho",
};

export const AUTHORITY_LABEL: Record<InvestigationRow["authority"], string> = {
  PF: "Polícia Federal",
  MP: "Ministério Público",
  CPI: "Comissão Parlamentar de Inquérito",
  IMPRENSA: "imprensa",
};

const OPERATION_NAMES = [
  "Maré Alta", "Caixa Preta", "Pedra Angular", "Ponto Cego", "Lastro", "Fachada", "Retranca", "Vertente",
  "Contrapeso", "Areia Movediça", "Duplo Fundo", "Bússola", "Engrenagem", "Fio da Meada", "Sombra", "Antídoto",
];

export function canBeTargeted(p: PersonRow | undefined): p is PersonRow {
  return !!p && !isReal(p.kind) && p.status === "ACTIVE";
}

export function actRisk(ctx: Ctx, act: IllicitActRow): number {
  const person = ctx.person(act.person_id);
  const scrutiny = person?.office_code ? 0.15 : 0;
  const party = person?.party_id ? ctx.t.parties.get(person.party_id) : undefined;
  const opposition = party ? (party.gov_alignment === 1 ? 0.1 : 0.05) : 0.05;
  return Math.min(
    1,
    0.15 * act.value_relative +
      0.1 * Math.min(1, act.participants / 10) +
      0.15 * Math.min(1, act.witnesses / 10) +
      0.25 * act.paper_trail +
      0.1 * Math.min(1, act.recurrence / 5) +
      0.1 * act.exposure +
      opposition +
      scrutiny +
      0.2 * (1 - act.accomplice_loyalty),
  );
}

export function createIllicitAct(
  ctx: Ctx,
  person: PersonRow,
  kind: IllicitKind,
  opts: { amount: number; partners?: string[]; description: string; witnesses?: number; paperTrail?: number },
): IllicitActRow {
  if (isReal(person.kind)) throw new Error("Pessoas reais não cometem crimes na simulação.");
  const rng = ctx.rng("act", person.id);
  const previous = [...ctx.t.illicit_acts.values()].filter((a) => a.person_id === person.id).length;
  const partnerLoyalty = (opts.partners ?? [])
    .map((id) => ctx.pstate(id)?.traits.loyalty ?? 0.5)
    .reduce((m, v) => Math.min(m, v), 1);
  const act: IllicitActRow = {
    id: ctx.id("act", person.id, kind),
    world_id: ctx.world.id,
    person_id: person.id,
    kind,
    created_on: ctx.date,
    amount: Math.round(opts.amount),
    value_relative: Math.min(1, opts.amount / 2_000_000),
    participants: 1 + (opts.partners?.length ?? 0) + rng.int(0, 3),
    witnesses: opts.witnesses ?? rng.int(0, 6),
    paper_trail: opts.paperTrail ?? rng.range(0.15, 0.7),
    recurrence: previous + 1,
    exposure: person.office_code ? 0.7 : person.stage === "CANDIDATO" ? 0.5 : 0.25,
    accomplice_loyalty: partnerLoyalty,
    partners: opts.partners ?? [],
    party_id: person.party_id,
    description: opts.description,
    discovered: false,
    discovered_on: null,
  };
  ctx.save("illicit_acts", act);
  ctx.emit("ILLICIT_ACT", { actors: [person.id, ...(opts.partners ?? [])], geography: person.uf, payload: { kind, actId: act.id } });
  return act;
}

/** Abre investigação contra um alvo. */
export function openInvestigation(
  ctx: Ctx,
  target: PersonRow,
  opts: { authority: InvestigationRow["authority"]; openedBy?: string | null; initialEvidence?: number; actIds?: string[]; reason: string },
): InvestigationRow | null {
  if (!canBeTargeted(target)) return null;
  const existing = [...ctx.t.investigations.values()].find((i) => i.person_id === target.id && !i.outcome);
  if (existing) {
    for (const a of opts.actIds ?? []) if (!existing.act_ids.includes(a)) existing.act_ids.push(a);
    existing.evidence = Math.min(1, existing.evidence + (opts.initialEvidence ?? 0) * 0.5);
    ctx.save("investigations", existing);
    return existing;
  }
  const acts = opts.actIds ?? [...ctx.t.illicit_acts.values()].filter((a) => a.person_id === target.id && !a.discovered).map((a) => a.id);
  const inv: InvestigationRow = {
    id: ctx.id("inv", target.id),
    world_id: ctx.world.id,
    person_id: target.id,
    stage: "DENUNCIA",
    opened_on: ctx.date,
    next_step_on: addDays(ctx.date, ctx.rng("inv-step", target.id).int(7, 20)),
    evidence: opts.initialEvidence ?? 0.1,
    defense: 0,
    evidences: [{ on: ctx.date, description: opts.reason, strength: opts.initialEvidence ?? 0.1 }],
    outcome: null,
    authority: opts.authority,
    opened_by: opts.openedBy ?? null,
    act_ids: acts,
  };
  ctx.save("investigations", inv);
  for (const id of acts) {
    const act = ctx.t.illicit_acts.get(id);
    if (act && !act.discovered) {
      act.discovered = true;
      act.discovered_on = ctx.date;
      ctx.save("illicit_acts", act);
    }
  }
  const party = target.party_id ? ctx.t.parties.get(target.party_id) : undefined;
  const ev = ctx.emit("INVESTIGATION_OPENED", { actors: [target.id], geography: target.uf, payload: { authority: opts.authority, investigation: inv.id } });
  ctx.notify(target.id, "Você é alvo de uma denúncia", `${AUTHORITY_LABEL[opts.authority]} recebeu uma denúncia envolvendo você. Prepare sua defesa.`, "/jogo/investigacoes");
  if (opts.openedBy) ctx.notify(opts.openedBy, "Denúncia registrada", `${AUTHORITY_LABEL[opts.authority]} registrou sua denúncia contra ${target.name}.`, "/jogo/investigacoes");
  publishScandal(ctx, target, party, "DENUNCIA", inv, ev.id);
  return inv;
}

function describeTarget(target: PersonRow, party: PartyRow | undefined): string {
  const role = target.office_code ? officeShort(target.office_code) : target.role_label ?? (target.kind === "PLAYER" ? "liderança política" : "figura política");
  return `${target.name} (${role}${party ? `, ${party.acronym}` : ""}, ${target.uf})`;
}

function officeShort(code: string): string {
  const m: Record<string, string> = {
    VEREADOR: "vereador(a)", PREFEITO: "prefeito(a)", DEP_ESTADUAL: "deputado(a) estadual", DEP_FEDERAL: "deputado(a) federal",
    SENADOR: "senador(a)", GOVERNADOR: "governador(a)", PRESIDENTE: "presidente",
  };
  return m[code] ?? code;
}

function publishScandal(ctx: Ctx, target: PersonRow, party: PartyRow | undefined, stage: InvestigationRow["stage"], inv: InvestigationRow, eventId: string): void {
  const who = describeTarget(target, party);
  const acts = inv.act_ids.map((id) => ctx.t.illicit_acts.get(id)).filter((a): a is IllicitActRow => !!a);
  const kindText = acts.length
    ? [...new Set(acts.map((a) => ({ CAIXA_DOIS: "caixa dois", PROPINA: "pagamento de propina", DESINFORMACAO: "disseminação de desinformação" })[a.kind]))].join(" e ")
    : "irregularidades";
  const op = OPERATION_NAMES[Math.abs(hashCode(inv.id)) % OPERATION_NAMES.length];
  const texts: Record<InvestigationRow["stage"], { title: string; body: string }> = {
    DENUNCIA: {
      title: `Denúncia aponta suspeita de ${kindText} envolvendo ${target.name}`,
      body: `Uma denúncia encaminhada à ${AUTHORITY_LABEL[inv.authority]} cita ${who}. A defesa nega irregularidades. O caso ainda está em fase preliminar.`,
    },
    IMPRENSA: {
      title: `Reportagem revela detalhes de suspeita de ${kindText} ligada a ${target.name}`,
      body: `Documentos obtidos pela reportagem indicam movimentações atípicas envolvendo ${who}. Adversários cobram explicações${party ? ` e a direção do ${party.acronym} discute o caso` : ""}.`,
    },
    INVESTIGACAO: {
      title: `Operação ${op}: Polícia Federal cumpre mandados contra ${target.name}`,
      body: `A operação investiga suspeita de ${kindText}. Segundo a investigação, ${who} teria participação no esquema. ${acts.some((a) => a.partners.length) ? "Outros envolvidos também foram alvos." : ""}`,
    },
    PROCESSO: {
      title: `Justiça aceita denúncia e ${target.name} vira réu`,
      body: `O processo apura suspeita de ${kindText}. ${who} responderá à ação. A defesa afirma que vai provar a inocência.`,
    },
    DESFECHO: {
      title:
        inv.outcome === "CONDENADO"
          ? `${target.name} é condenado(a) por ${kindText} e fica inelegível`
          : inv.outcome === "ABSOLVIDO"
            ? `${target.name} é absolvido(a) em processo por ${kindText}`
            : `Investigação contra ${target.name} é arquivada`,
      body:
        inv.outcome === "CONDENADO"
          ? `Com a condenação por órgão colegiado, ${who} fica inelegível por ${ctx.s.ruleset.ineligibilityYears} anos (Lei da Ficha Limpa, na simulação).${party ? ` O caso desgasta a imagem do ${party.acronym}.` : ""}`
          : inv.outcome === "ABSOLVIDO"
            ? `O tribunal entendeu que as provas eram insuficientes. ${who} diz que foi vítima de perseguição.`
            : `Sem provas suficientes, o caso envolvendo ${who} foi arquivado.`,
    },
  };
  const t = texts[stage];
  ctx.publish("SCANDAL_STAGE", { facts: { title: t.title, body: t.body }, personIds: [target.id], geography: target.uf, eventId, importance: stage === "DENUNCIA" ? 2 : 3 });
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Avanço diário: descoberta espontânea e progressão das investigações. */
export function dailyCrime(ctx: Ctx): void {
  // Descoberta espontânea (vazamento, testemunha, auditoria)
  for (const act of ctx.t.illicit_acts.values()) {
    if (act.discovered) continue;
    const risk = actRisk(ctx, act);
    const age = diffDays(ctx.date, act.created_on);
    const p = 0.0025 * risk * (age < 30 ? 0.5 : 1);
    if (!ctx.rng("detect", act.id).chance(p)) continue;
    const person = ctx.person(act.person_id);
    if (!canBeTargeted(person)) continue;
    const authority = ctx.rng("detect-who", act.id).weighted(["IMPRENSA", "MP", "PF"] as const, (a) => (a === "IMPRENSA" ? 0.4 : 0.3));
    openInvestigation(ctx, person, { authority, initialEvidence: 0.15 + act.paper_trail * 0.3, actIds: [act.id], reason: "Vazamento de informações por pessoa próxima ao esquema" });
  }

  for (const inv of ctx.t.investigations.values()) {
    if (inv.outcome || inv.next_step_on > ctx.date) continue;
    const target = ctx.person(inv.person_id);
    if (!target) continue;
    const party = target.party_id ? ctx.t.parties.get(target.party_id) : undefined;
    const rng = ctx.rng("inv", inv.id);
    const acts = inv.act_ids.map((id) => ctx.t.illicit_acts.get(id)).filter((a): a is IllicitActRow => !!a);
    const truth = acts.length ? Math.max(...acts.map((a) => 0.4 + a.paper_trail * 0.4 + Math.min(0.2, a.witnesses * 0.03))) : 0.05;
    const gain = rng.range(0.05, 0.2) * truth * (inv.authority === "PF" ? 1.2 : inv.authority === "CPI" ? 0.9 : 1);
    inv.evidence = Math.min(1, inv.evidence + gain);
    inv.evidences.push({ on: ctx.date, description: evidenceText(rng.int(0, 5)), strength: Math.round(gain * 100) / 100 });
    const st = ctx.pstate(target.id);
    const order: InvestigationRow["stage"][] = ["DENUNCIA", "IMPRENSA", "INVESTIGACAO", "PROCESSO", "DESFECHO"];
    let next = order[order.indexOf(inv.stage) + 1];
    if (inv.stage === "INVESTIGACAO" && inv.evidence < 0.35) {
      next = "DESFECHO";
      inv.outcome = "ARQUIVADO";
    }
    if (next === "DESFECHO" && !inv.outcome) {
      const score = inv.evidence - inv.defense * 0.35 + rng.normal(0, 0.1);
      inv.outcome = score > 0.55 ? "CONDENADO" : "ABSOLVIDO";
    }
    inv.stage = next;
    inv.next_step_on = addDays(ctx.date, rng.int(20, 60));
    ctx.save("investigations", inv);

    // Impacto
    const severity = inv.evidence;
    const repHit = { DENUNCIA: 3, IMPRENSA: 6, INVESTIGACAO: 10, PROCESSO: 8, DESFECHO: inv.outcome === "CONDENADO" ? 15 : -4 }[inv.stage] * severity;
    target.reputation = Math.max(0, Math.min(100, Math.round(target.reputation - repHit)));
    ctx.save("persons", target);
    if (st) {
      st.scandal = Math.min(100, Math.round(st.scandal + repHit * 1.2));
      if (inv.outcome === "ABSOLVIDO" || inv.outcome === "ARQUIVADO") st.scandal = Math.max(0, st.scandal - 10);
      ctx.save("person_states", st);
    }
    if (party) {
      party.reputation = Math.max(0, Math.round((party.reputation - repHit * 0.25) * 10) / 10);
      if (inv.stage === "DESFECHO" && inv.outcome === "CONDENADO") party.integrity = Math.max(0, Math.round((party.integrity - 0.04) * 1000) / 1000);
      else if (inv.stage === "INVESTIGACAO") party.integrity = Math.max(0, Math.round((party.integrity - 0.01) * 1000) / 1000);
      ctx.save("parties", party);
    }
    const ev = ctx.emit("INVESTIGATION_STAGE", { actors: [target.id], geography: target.uf, payload: { stage: inv.stage, outcome: inv.outcome, evidence: inv.evidence } });
    publishScandal(ctx, target, party, inv.stage, inv, ev.id);
    ctx.notify(target.id, `Investigação: ${STAGE_LABEL[inv.stage]}`, inv.outcome ? `Desfecho: ${inv.outcome.toLowerCase()}.` : `O caso avançou para "${STAGE_LABEL[inv.stage]}".`, "/jogo/investigacoes");
    if (inv.opened_by) ctx.notify(inv.opened_by, `Caso ${target.name}: ${STAGE_LABEL[inv.stage]}`, inv.outcome ? `Desfecho: ${inv.outcome.toLowerCase()}.` : `O caso que você denunciou avançou.`, "/jogo/investigacoes");

    // Delação: cúmplice pouco leal pode entregar outros envolvidos
    if (inv.stage === "INVESTIGACAO") {
      for (const act of acts) {
        for (const partnerId of act.partners) {
          const partner = ctx.person(partnerId);
          const loyalty = ctx.pstate(partnerId)?.traits.loyalty ?? 0.5;
          if (canBeTargeted(partner) && rng.chance((1 - loyalty) * 0.5)) {
            openInvestigation(ctx, partner, { authority: "PF", initialEvidence: 0.3, reason: `Citado(a) em colaboração no caso de ${target.name}` });
          }
        }
      }
    }

    if (inv.outcome && inv.stage === "DESFECHO") {
      if (inv.opened_by) {
        const reporter = ctx.person(inv.opened_by);
        if (reporter) {
          reporter.reputation = Math.max(0, Math.min(100, reporter.reputation + (inv.outcome === "CONDENADO" ? 6 : inv.outcome === "ARQUIVADO" ? -4 : -2)));
          ctx.save("persons", reporter);
        }
      }
      if (inv.outcome === "CONDENADO") applyConviction(ctx, target, inv);
    }
  }
}

function evidenceText(i: number): string {
  return [
    "Quebra de sigilo bancário identifica movimentações atípicas",
    "Testemunha presta depoimento",
    "Perícia analisa documentos apreendidos",
    "Relatório de inteligência financeira é anexado ao caso",
    "Mensagens extraídas de celular são analisadas",
    "Auditoria encontra inconsistências em prestação de contas",
  ][i];
}

function applyConviction(ctx: Ctx, target: PersonRow, inv: InvestigationRow): void {
  const st = ctx.pstate(target.id);
  if (st) {
    st.ineligible_until = addMonths(ctx.date, ctx.s.ruleset.ineligibilityYears * 12);
    const fine = inv.act_ids.reduce((s, id) => s + (ctx.t.illicit_acts.get(id)?.amount ?? 0), 0) * 1.5;
    st.money = Math.max(0, st.money - fine);
    ctx.save("person_states", st);
  }
  // Perda do mandato
  for (const m of ctx.t.mandates.values()) {
    if (m.person_id === target.id && m.status === "ATIVO") {
      m.status = "ENCERRADO";
      m.end_on = ctx.date;
      ctx.save("mandates", m);
      target.office_code = null;
      target.office_geo = null;
      target.stage = target.party_id ? "QUADRO" : "CIDADAO";
    }
  }
  // Candidatura cassada
  for (const c of ctx.t.candidacies.values()) {
    if (c.person_id === target.id && (c.status === "PRE" || c.status === "HOMOLOGADA")) {
      c.status = "INDEFERIDA";
      c.note = "Indeferida: condenação por órgão colegiado (Ficha Limpa)";
      ctx.save("candidacies", c);
    }
  }
  if (target.kind === "FICTIONAL_GENERATED") {
    target.status = "RETIRED";
    target.status_note = "Condenado(a) na simulação; afastado(a) da vida pública.";
  }
  ctx.save("persons", target);
}

// ---------------------------------------------------------------------------
// Ofertas ilícitas a jogadores e crimes autônomos de personagens procedurais
// ---------------------------------------------------------------------------

function findOrCreateBroker(ctx: Ctx, uf: string, party: PartyRow | undefined): PersonRow {
  const rng = ctx.rng("broker", uf);
  const candidates = [...ctx.t.persons.values()].filter(
    (p) => p.kind === "FICTIONAL_GENERATED" && p.status === "ACTIVE" && p.uf === uf && (ctx.pstate(p.id)?.traits.riskTolerance ?? 0) > 0.6 && (!party || p.party_id === party.id || !p.party_id),
  );
  if (candidates.length && rng.chance(0.7)) return rng.pick(candidates);
  const ideology = party?.ideology ?? [...ctx.t.parties.values()][0].ideology;
  const broker = spawnProceduralCadre(ctx, {
    partyId: party?.id ?? "",
    uf,
    ideology,
    roleLabel: party ? `operador ligado ao ${party.acronym}` : rng.pick(["empresário da construção civil", "lobista do setor de serviços", "empresário do transporte"]),
    tier: 3,
  });
  if (!party) {
    broker.party_id = null;
    broker.stage = "CIDADAO";
    ctx.save("persons", broker);
  }
  const st = ctx.pstate(broker.id)!;
  st.traits.riskTolerance = Math.max(st.traits.riskTolerance, 0.7);
  ctx.save("person_states", st);
  return broker;
}

/** Mensal: personagens procedurais podem entrar em esquemas; jogadores recebem ofertas. */
export function monthlyCrime(ctx: Ctx): void {
  const dirtyByParty = new Map<string, number>();
  for (const a of ctx.t.illicit_acts.values()) if (!a.discovered && a.party_id) dirtyByParty.set(a.party_id, (dirtyByParty.get(a.party_id) ?? 0) + 1);

  for (const p of ctx.t.persons.values()) {
    if (p.status !== "ACTIVE") continue;
    const st = ctx.pstate(p.id);
    if (!st) continue;
    const party = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
    const contagion = party ? 1 + 2 * (0.5 - party.integrity) + Math.min(1, (dirtyByParty.get(party.id) ?? 0) * 0.1) : 1;
    const opportunity = p.office_code ? 2 : p.stage === "CANDIDATO" ? 1.6 : 1;

    if (p.kind === "FICTIONAL_GENERATED" && p.party_id) {
      const rng = ctx.rng("npc-crime", p.id);
      const prob = 0.003 * st.traits.riskTolerance * st.traits.ambition * opportunity * contagion;
      if (rng.chance(prob)) {
        const kind: IllicitKind = p.office_code ? "PROPINA" : "CAIXA_DOIS";
        const broker = findOrCreateBroker(ctx, p.uf, undefined);
        createIllicitAct(ctx, p, kind, {
          amount: rng.int(50_000, 1_500_000),
          partners: [broker.id],
          description: kind === "PROPINA" ? "Recebimento de vantagem indevida de empresa contratada" : "Recursos de campanha não declarados à Justiça Eleitoral",
        });
      }
    }

    if (p.kind === "PLAYER" && p.status === "ACTIVE") {
      const rng = ctx.rng("offer", p.id);
      st.offers = st.offers.filter((o) => o.expires_tick > ctx.tick);
      if (st.offers.length >= 2) continue;
      const exposure = p.office_code ? 0.18 : p.stage === "CANDIDATO" || p.stage === "PRE_CANDIDATO" ? 0.14 : p.party_id ? 0.05 : 0.01;
      if (!rng.chance(exposure * contagion)) continue;
      const broker = findOrCreateBroker(ctx, p.uf, rng.chance(0.5) ? party : undefined);
      const kind: Offer["kind"] = p.office_code ? "PROPINA" : "CAIXA_DOIS";
      const amount = Math.round(rng.range(30_000, 400_000) * (p.office_code ? 2 : 1) / 1000) * 1000;
      const offer: Offer = { id: ctx.id("ofr", p.id), kind, from: broker.id, amount, expires_tick: ctx.tick + 15 };
      st.offers.push(offer);
      ctx.save("person_states", st);
      ctx.notify(
        p.id,
        kind === "PROPINA" ? "Uma proposta indecente" : "Oferta de dinheiro não declarado",
        `${broker.name} (${broker.role_label ?? "intermediário"}) ofereceu R$ ${amount.toLocaleString("pt-BR")} ${kind === "PROPINA" ? "em troca de favorecimento" : "por fora, sem registro na prestação de contas"}. Você pode aceitar, recusar ou denunciar à Polícia Federal.`,
        "/jogo/investigacoes",
      );
    }
  }

  // Integridade partidária se recupera lentamente
  for (const party of ctx.t.parties.values()) {
    const target = 0.5;
    const next = Math.round((party.integrity + (target - party.integrity) * 0.02) * 1000) / 1000;
    if (next !== party.integrity) {
      party.integrity = next;
      ctx.save("parties", party);
    }
  }
}
