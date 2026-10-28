import { addDays, diffDays } from "./calendar";
import { cityName } from "./cities";
import { UF_BY_CODE } from "./geo";
import { ideologyAffinity } from "./ideology";
import type { Ctx } from "./state";
import type { AffiliationRequestRow, PartyRow, PersonRow } from "./types";

/**
 * chance_de_aceite = afinidade_ideológica + reputação + relacionamento_local
 *                  + necessidade_do_partido + apoio_de_facção − histórico_de_escândalos
 * (documento técnico, "Partidos e luta interna")
 */
export interface AffiliationBreakdown {
  afinidade_ideologica: number;
  reputacao: number;
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
    afinidade_ideologica: (affinity - 0.6) * 120,
    reputacao: (person.reputation - 30) * 0.5,
    relacionamento_local: rel * 0.45,
    necessidade_do_partido: (1 - territory) * 15 + (ctx.date >= "2027-10-01" ? 5 : 0),
    apoio_de_faccao: factionSupport * 20,
    historico_de_escandalos: -st.scandal * 0.8,
    cultura_de_entrada: 0,
    total: 0,
  };
  if (kind === "PEDIDO") {
    if (party.entry_culture === "RELACIONAMENTO") b.cultura_de_entrada = rel >= 25 ? 0 : -20;
    if (party.entry_culture === "CONVITE") b.cultura_de_entrada = rel >= 50 ? -5 : -60;
    if (party.entry_culture === "ABERTO") b.cultura_de_entrada = 10;
  } else {
    b.cultura_de_entrada = 30;
  }
  b.total = Object.entries(b).filter(([k]) => k !== "total").reduce((s, [, v]) => s + v, 0);
  return b;
}

export function acceptanceProbability(total: number): number {
  return 1 / (1 + Math.exp(-(total - 10) / 10));
}

export function requestAffiliation(ctx: Ctx, person: PersonRow, party: PartyRow): AffiliationRequestRow {
  const rng = ctx.rng("affiliation-delay", person.id);
  const req: AffiliationRequestRow = {
    id: ctx.id("aff", person.id, party.id),
    world_id: ctx.world.id,
    person_id: person.id,
    party_id: party.id,
    kind: "PEDIDO",
    created_on: ctx.date,
    decide_on: addDays(ctx.date, rng.int(3, 9)),
    status: "PENDENTE",
    breakdown: {},
    reason: null,
  };
  ctx.save("affiliation_requests", req);
  return req;
}

export function joinParty(ctx: Ctx, person: PersonRow, party: PartyRow): void {
  const st = ctx.pstate(person.id)!;
  if (person.party_id && person.party_id !== party.id) leaveParty(ctx, person, "troca de partido");
  person.party_id = party.id;
  if (["CIDADAO", "ATIVISTA", "APROXIMACAO"].includes(person.stage)) person.stage = "FILIADO";
  st.filiation_date = ctx.date;
  st.party_standing = 25;
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
    const b = computeAffiliation(ctx, person, party, "PEDIDO");
    const p = acceptanceProbability(b.total);
    const accepted = ctx.rng("affiliation", req.id).chance(p);
    req.breakdown = { ...b, probabilidade: Math.round(p * 100) };
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
