import { addDays, diffDays } from "./calendar";
import { cityName } from "./cities";
import { UF_BY_CODE } from "./geo";
import { ideologyAffinity } from "./ideology";
import { eraRules } from "./ruleset";
import type { Ctx } from "./state";
import { scheduleStory, storyOf } from "./story/state";
import type { AffiliationRequestRow, PartyRow, PersonRow } from "./types";

/**
 * chance_de_aceite = afinidade_ideológica + reputação + trajetória + relacionamento_local
 *                  + necessidade_do_partido + apoio_de_facção − histórico_de_escândalos
 * (documento técnico, "Partidos e luta interna"). Afinidade sozinha não basta:
 * quem acabou de chegar à política precisa de ativismo, reputação ou padrinho.
 */
export interface AffiliationBreakdown {
  afinidade_ideologica: number;
  reputacao: number;
  /** ativismo, etapa da carreira e mandato */
  trajetoria: number;
  relacionamento_local: number;
  necessidade_do_partido: number;
  apoio_de_faccao: number;
  historico_de_escandalos: number;
  cultura_de_entrada: number;
  total: number;
}

export function relationshipScore(ctx: Ctx, aId: string, bId: string): number {
  return ctx.t.relationships.get(relKey(aId, bId))?.score ?? 0;
}

export function relKey(a: string, b: string): string {
  return `rel_${a}__${b}`;
}

/** Melhor relacionamento do jogador com membros do partido na UF. */
export function bestPartyRelationship(ctx: Ctx, person: PersonRow, party: PartyRow): { score: number; withId: string | null } {
  let best = 0;
  let withId: string | null = null;
  for (const rel of ctx.t.relationships.values()) {
    if (rel.a_id !== person.id) continue;
    const other = ctx.person(rel.b_id);
    if (!other || other.party_id !== party.id) continue;
    const weight = other.uf === person.uf ? 1 : 0.5;
    if (rel.score * weight > best) {
      best = rel.score * weight;
      withId = other.id;
    }
  }
  return { score: best, withId };
}

export function computeAffiliation(ctx: Ctx, person: PersonRow, party: PartyRow, kind: "PEDIDO" | "CONVITE"): AffiliationBreakdown {
  const st = ctx.pstate(person.id)!;
  const affinity = ideologyAffinity(person.ideology, party.ideology);
  const rel = bestPartyRelationship(ctx, person, party).score;
  const territory = party.territory[person.uf] ?? 0;
  const factionSupport = [...ctx.t.factions.values()]
    .filter((f) => f.party_id === party.id)
    .reduce((m, f) => Math.max(m, ideologyAffinity(person.ideology, f.ideology) * f.strength), 0);
  const b: AffiliationBreakdown = {
    afinidade_ideologica: (affinity - 0.6) * 80,
    reputacao: (person.reputation - 30) * 0.5,
    trajetoria: Math.min(15, st.activism * 0.3) + (STAGE_WEIGHT[person.stage] ?? 0) + (person.office_code ? 20 : 0),
    relacionamento_local: rel * 0.45,
    necessidade_do_partido: (1 - territory) * 10 + (ctx.date >= "2027-10-01" ? 5 : 0),
    apoio_de_faccao: factionSupport * 15,
    historico_de_escandalos: -st.scandal * 0.8,
    cultura_de_entrada: 0,
    total: 0,
  };
  if (kind === "PEDIDO") {
    if (party.entry_culture === "RELACIONAMENTO") b.cultura_de_entrada = rel >= 25 ? 0 : -20;
    if (party.entry_culture === "CONVITE") b.cultura_de_entrada = rel >= 50 ? -5 : -60;
    if (party.entry_culture === "ABERTO") b.cultura_de_entrada = 5;
  } else {
    b.cultura_de_entrada = 30;
  }
  b.total = Object.entries(b).filter(([k]) => k !== "total").reduce((s, [, v]) => s + v, 0);
  return b;
}

/** Peso da etapa da carreira: quem nunca militou é uma aposta; quem já foi filiado traz bagagem. */
const STAGE_WEIGHT: Partial<Record<PersonRow["stage"], number>> = {
  CIDADAO: -15,
  ATIVISTA: -5,
  APROXIMACAO: 0,
  FILIADO: 5,
  QUADRO: 8,
  PRE_CANDIDATO: 8,
  CANDIDATO: 8,
};

/** Curva de aceite: um perfil mediano (total 30) tem metade de chance. */
export function acceptanceProbability(total: number): number {
  return 1 / (1 + Math.exp(-(total - 30) / 12));
}

/** Dias de espera depois de uma recusa para pedir de novo ao mesmo partido. */
export const AFFILIATION_RETRY_DAYS = 60;

/** Motivo para não aceitar um novo pedido agora (recusa recente no mesmo partido). */
export function affiliationCooldown(ctx: Ctx, person: PersonRow, party: PartyRow): string | null {
  // a recusa fica na memória do personagem (os pedidos já decididos não voltam do banco)
  const st = ctx.pstate(person.id);
  const flagged = st?.story?.flags[`recusa:${party.id}`];
  const fromRows = [...ctx.t.affiliation_requests.values()]
    .filter((r) => r.person_id === person.id && r.party_id === party.id && r.kind === "PEDIDO" && r.status === "RECUSADO")
    .map((r) => r.decide_on)
    .sort()
    .pop();
  const last = [typeof flagged === "string" ? flagged : null, fromRows ?? null].filter((x): x is string => !!x).sort().pop();
  if (!last) return null;
  const until = addDays(last, AFFILIATION_RETRY_DAYS);
  return ctx.date < until ? `O ${party.acronym} recusou seu pedido há pouco. Um novo pedido só será analisado a partir de ${until.split("-").reverse().join("/")}.` : null;
}

/**
 * Pedido de filiação. A análise leva de duas a três semanas: no meio dela,
 * os dirigentes levantam uma objeção (acontecimento da carreira) e o que o
 * jogador fizer conta na decisão.
 */
export function requestAffiliation(ctx: Ctx, person: PersonRow, party: PartyRow): AffiliationRequestRow {
  const rng = ctx.rng("affiliation-delay", person.id);
  const player = person.kind === "PLAYER";
  const req: AffiliationRequestRow = {
    id: ctx.id("aff", person.id, party.id),
    world_id: ctx.world.id,
    person_id: person.id,
    party_id: party.id,
    kind: "PEDIDO",
    created_on: ctx.date,
    decide_on: addDays(ctx.date, player ? rng.int(12, 24) : rng.int(3, 9)),
    status: "PENDENTE",
    breakdown: {},
    reason: null,
  };
  ctx.save("affiliation_requests", req);
  const st = ctx.pstate(person.id);
  if (player && st) {
    scheduleStory(st, "filiacao_analise", addDays(ctx.date, rng.int(4, 8)), { req: req.id, party: party.id });
    ctx.save("person_states", st);
  }
  return req;
}

export type AffiliationConcern = "ESCANDALOS" | "CULTURA" | "AFINIDADE" | "TRAJETORIA" | "REPUTACAO" | "RELACIONAMENTO";

/** O ponto que mais preocupa a direção na análise de um pedido (null = nada sério). */
export function affiliationConcern(b: AffiliationBreakdown): AffiliationConcern | null {
  if (b.historico_de_escandalos < -10) return "ESCANDALOS";
  if (b.cultura_de_entrada <= -20) return "CULTURA";
  if (b.afinidade_ideologica < 0) return "AFINIDADE";
  if (b.trajetoria < 0) return "TRAJETORIA";
  if (b.reputacao < 0) return "REPUTACAO";
  if (b.relacionamento_local < 5) return "RELACIONAMENTO";
  return null;
}

export function joinParty(ctx: Ctx, person: PersonRow, party: PartyRow): void {
  const st = ctx.pstate(person.id)!;
  if (person.party_id && person.party_id !== party.id) leaveParty(ctx, person, "troca de partido");
  person.party_id = party.id;
  if (["CIDADAO", "ATIVISTA", "APROXIMACAO"].includes(person.stage)) person.stage = "FILIADO";
  st.filiation_date = ctx.date;
  // quem chega não manda: o prestígio interno se conquista com trabalho
  st.party_standing = person.kind === "PLAYER" ? 10 : 25;
  ctx.save("persons", person);
  ctx.save("person_states", st);
  ctx.save("memberships", {
    id: ctx.id("mem", person.id, party.id),
    world_id: ctx.world.id,
    person_id: person.id,
    party_id: party.id,
    role: "MEMBRO",
    joined_on: ctx.date,
    left_on: null,
    status: "ATIVA",
  });
  party.members += 1;
  ctx.save("parties", party);
}

export function leaveParty(ctx: Ctx, person: PersonRow, reason: string): void {
  for (const m of ctx.t.memberships.values()) {
    if (m.person_id === person.id && m.status === "ATIVA") {
      m.status = "ENCERRADA";
      m.left_on = ctx.date;
      ctx.save("memberships", m);
    }
  }
  // candidatura registrada pela legenda não sobrevive à saída do partido
  for (const c of ctx.t.candidacies.values()) {
    if (c.person_id !== person.id || c.party_id !== person.party_id || !["PRE", "HOMOLOGADA"].includes(c.status)) continue;
    if (ctx.t.elections.get(c.election_id)?.status === "ENCERRADA") continue;
    c.status = "DESISTENTE";
    c.note = `Candidatura cancelada: saída do partido (${reason}).`;
    ctx.save("candidacies", c);
    if (person.stage === "PRE_CANDIDATO" || person.stage === "CANDIDATO") person.stage = "APROXIMACAO";
  }
  const st = ctx.pstate(person.id)!;
  person.party_id = null;
  person.faction_id = null;
  if (["FILIADO", "QUADRO", "PRE_CANDIDATO"].includes(person.stage)) person.stage = "APROXIMACAO";
  st.filiation_date = null;
  st.party_standing = 0;
  ctx.save("persons", person);
  ctx.save("person_states", st);
  ctx.emit("PARTY_LEFT", { actors: [person.id], geography: person.uf, payload: { reason } });
}

/** Decide pedidos pendentes cujo prazo chegou. */
export function processAffiliationRequests(ctx: Ctx): void {
  for (const req of ctx.t.affiliation_requests.values()) {
    if (req.status !== "PENDENTE" || req.kind !== "PEDIDO" || req.decide_on > ctx.date) continue;
    const person = ctx.person(req.person_id);
    const party = ctx.t.parties.get(req.party_id);
    if (!person || !party) continue;
    // partido presidido por jogador: quem decide é o presidente (partyfounding.ts)
    if (party.founder_id && ctx.person(party.president_id)?.kind === "PLAYER") continue;
    const b = computeAffiliation(ctx, person, party, "PEDIDO");
    // o que o jogador fez durante a análise (conversa com a direção, padrinho)
    const extra = req.breakdown.apoio_na_analise ?? 0;
    b.total += extra;
    const p = acceptanceProbability(b.total);
    const accepted = ctx.rng("affiliation", req.id).chance(p);
    req.breakdown = { ...b, apoio_na_analise: extra, probabilidade: Math.round(p * 100) };
    req.status = accepted ? "ACEITO" : "RECUSADO";
    req.reason = accepted ? acceptReason(b) : rejectReason(b, party);
    ctx.save("affiliation_requests", req);
    if (accepted) {
      joinParty(ctx, person, party);
      ctx.notify(person.id, `Filiação aprovada: ${party.acronym}`, `O diretório do ${party.acronym} em ${person.uf} aprovou sua filiação. ${req.reason}`, "/jogo/carreira");
      ctx.publish("AFFILIATION_ACCEPTED", {
        facts: { party: party.acronym, name: person.name, uf: person.uf, municipality: cityName(ctx.s, person.municipality) ?? UF_BY_CODE[person.uf]?.capital ?? person.uf, reasonText: req.reason ?? "afinidade com o programa" },
        personIds: [person.id],
        geography: person.uf,
      });
    } else {
      ctx.notify(person.id, `Filiação recusada: ${party.acronym}`, `O diretório do ${party.acronym} recusou seu pedido. ${req.reason}`, "/jogo/partidos");
    }
    const st = ctx.pstate(person.id);
    if (st && person.kind === "PLAYER") {
      if (!accepted) storyOf(st).flags[`recusa:${party.id}`] = ctx.date;
      scheduleStory(st, accepted ? "filiacao_aprovada" : "filiacao_recusada", ctx.date, { req: req.id, party: party.id });
      ctx.save("person_states", st);
    }
    ctx.emit(accepted ? "AFFILIATION_ACCEPTED" : "AFFILIATION_REJECTED", { actors: [person.id, party.id], geography: person.uf, payload: { breakdown: req.breakdown } });
  }
}

function acceptReason(b: AffiliationBreakdown): string {
  const top = Object.entries(b)
    .filter(([k]) => !["total", "historico_de_escandalos", "cultura_de_entrada"].includes(k))
    .sort((x, y) => y[1] - x[1])[0]?.[0];
  const labels: Record<string, string> = {
    afinidade_ideologica: "a afinidade com o programa do partido",
    reputacao: "a boa reputação local",
    trajetoria: "a trajetória de militância",
    relacionamento_local: "o relacionamento com lideranças da legenda",
    necessidade_do_partido: "a necessidade de reforçar a presença na região",
    apoio_de_faccao: "o apoio de uma das alas internas",
  };
  return `Pesou a favor: ${labels[top ?? ""] ?? "o perfil apresentado"}.`;
}

function rejectReason(b: AffiliationBreakdown, party: PartyRow): string {
  if (party.entry_culture === "CONVITE" && b.cultura_de_entrada <= -60) return "Este partido só filia por convite de alguém de dentro. Construa relacionamento com membros da legenda.";
  if (b.cultura_de_entrada <= -20) return "Faltou relacionamento com lideranças do partido.";
  if (b.historico_de_escandalos < -10) return "O histórico de escândalos pesou contra.";
  if (b.afinidade_ideologica < 0) return "A direção considerou suas posições distantes do programa partidário.";
  if (b.trajetoria < 0) return "A direção quer ver mais trajetória: militância, eventos e trabalho de base antes da filiação.";
  return "A direção preferiu aguardar uma trajetória mais consolidada.";
}

/** Convites: partidos procuram jogadores promissores (semanal). */
export function partyInvitations(ctx: Ctx): void {
  for (const person of ctx.t.persons.values()) {
    if (person.kind !== "PLAYER" || person.party_id || person.status !== "ACTIVE") continue;
    const pending = [...ctx.t.affiliation_requests.values()].some((r) => r.person_id === person.id && r.status === "PENDENTE");
    if (pending) continue;
    const rng = ctx.rng("invite", person.id);
    for (const party of ctx.t.parties.values()) {
      if (party.status !== "ATIVO" || party.founder_id) continue;
      const rel = bestPartyRelationship(ctx, person, party);
      const b = computeAffiliation(ctx, person, party, "CONVITE");
      const interest = acceptanceProbability(b.total) * Math.min(1, person.reputation / 50) * (rel.score > 30 ? 1 : 0.3);
      if (!rng.chance(interest * 0.15)) continue;
      const inviter = rel.withId ? ctx.person(rel.withId) : undefined;
      const inviteId = ctx.id("inv", person.id, party.id);
      ctx.save("affiliation_requests", {
        id: inviteId,
        world_id: ctx.world.id,
        person_id: person.id,
        party_id: party.id,
        kind: "CONVITE",
        created_on: ctx.date,
        decide_on: addDays(ctx.date, 30),
        status: "PENDENTE",
        breakdown: { ...b },
        reason: inviter ? `Convite feito por ${inviter.name}${inviter.role_label ? ` (${inviter.role_label})` : ""}.` : `Convite da direção estadual do ${party.acronym}.`,
      });
      ctx.notify(person.id, `Convite de filiação: ${party.acronym}`, `${inviter ? inviter.name : `A direção do ${party.acronym}`} convidou você para se filiar. O convite vale por 30 dias.`, `convite:${inviteId}`);
      const st = ctx.pstate(person.id);
      if (st) {
        scheduleStory(st, "convite_filiacao", ctx.date, { req: inviteId, party: party.id, inviter: inviter?.id ?? "" });
        ctx.save("person_states", st);
      }
      ctx.publish("PARTY_INVITATION", { facts: { party: party.acronym, uf: person.uf, municipality: cityName(ctx.s, person.municipality) ?? UF_BY_CODE[person.uf]?.capital ?? person.uf }, geography: person.uf });
      break;
    }
  }
  for (const req of ctx.t.affiliation_requests.values()) {
    if (req.kind === "CONVITE" && req.status === "PENDENTE" && diffDays(ctx.date, req.decide_on) > 0) {
      req.status = "EXPIRADO";
      ctx.save("affiliation_requests", req);
    }
  }
}

/** Com mandato proporcional, sair do partido fora da janela custa o mandato (fidelidade partidária). */
export function infidelityRisk(ctx: Ctx, person: PersonRow): boolean {
  if (!person.office_code || !["VEREADOR", "DEP_ESTADUAL", "DEP_FEDERAL"].includes(person.office_code)) return false;
  if (!eraRules(Number(ctx.date.slice(0, 4))).partyFidelity) return false;
  const e = [...ctx.t.elections.values()].filter((x) => x.status !== "ENCERRADA").sort((a, b) => a.year - b.year)[0];
  const inWindow = !!e && ctx.date >= e.calendar.partySwitchWindowStart && ctx.date <= e.calendar.partySwitchWindowEnd;
  return !inWindow;
}

/** Perda do mandato por infidelidade partidária. */
export function loseMandateForInfidelity(ctx: Ctx, person: PersonRow): void {
  for (const m of ctx.t.mandates.values()) {
    if (m.person_id === person.id && m.status === "ATIVO") {
      m.status = "ENCERRADO";
      m.end_on = ctx.date;
      ctx.save("mandates", m);
    }
  }
  person.office_code = null;
  person.office_geo = null;
  person.stage = person.party_id ? "FILIADO" : "CIDADAO";
  ctx.save("persons", person);
}
