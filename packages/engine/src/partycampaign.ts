import { formatDatePt } from "./calendar";
import { checkEligibility, emptyCampaign, ensureRace, fefcPartyShare, fefcTotalFor, geoName } from "./elections";
import { canonicalGeo, capitalId, isMunicipality } from "./geo";
import { isPlayerLed } from "./partyfounding";
import { OFFICES, type OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import type { CampaignFund, CandidacyRow, ElectionRow, PartyRow, PersonRow } from "./types";

/**
 * Candidaturas do partido próprio. Quem preside um partido fundado no jogo
 * decide quem a legenda lança: indica membros fictícios para a convenção (a
 * própria pré-candidatura segue pelo caminho normal) e, depois das convenções,
 * reparte a cota do partido no fundo eleitoral (FEFC) entre as candidaturas.
 * O que não for repassado até o 1º turno volta ao Tesouro.
 */

/** Parte da cota teórica do partido que vira fundo para candidaturas no jogo (mantém a escala das campanhas simuladas). */
const POOL_FACTOR = 0.25;

/** Eleição em que ainda dá para indicar nomes (antes do fim das convenções). */
export function indicationElection(ctx: Ctx): ElectionRow | undefined {
  return [...ctx.t.elections.values()]
    .filter((e) => (e.status === "PRE_CAMPANHA" || e.status === "CONVENCOES") && ctx.date < e.calendar.conventionEnd)
    .sort((a, b) => a.year - b.year)[0];
}

/** Disputa em que a pessoa concorreria a um cargo (pela UF ou cidade dela). */
export function raceGeoFor(p: PersonRow, office: OfficeCode): string {
  const rule = OFFICES[office];
  const city = canonicalGeo(p.municipality);
  return rule.scope === "BR" ? "BR" : rule.scope === "UF" ? p.uf : isMunicipality(city) ? city : capitalId(p.uf);
}

/** Membros que a presidência pode indicar: fictícios, ativos e sem candidatura na eleição. */
export function indicableMembers(ctx: Ctx, party: PartyRow, e: ElectionRow): PersonRow[] {
  const running = new Set([...ctx.t.candidacies.values()].filter((c) => c.election_id === e.id && ["PRE", "HOMOLOGADA"].includes(c.status)).map((c) => c.person_id));
  return [...ctx.t.persons.values()]
    .filter((p) => p.party_id === party.id && p.status === "ACTIVE" && p.kind === "FICTIONAL_GENERATED" && !running.has(p.id))
    .sort((a, b) => Number(!!b.office_code) - Number(!!a.office_code) || b.reputation - a.reputation);
}

/** Indicações da presidência ainda à espera da convenção. */
export function pendingIndications(ctx: Ctx, party: PartyRow): CandidacyRow[] {
  return [...ctx.t.candidacies.values()].filter((c) => c.party_id === party.id && c.status === "PRE" && !c.is_player);
}

export function indicateCandidate(ctx: Ctx, party: PartyRow, member: PersonRow, office: OfficeCode): { ok: boolean; message: string } {
  const e = indicationElection(ctx);
  if (!e) return { ok: false, message: "Fora do período de pré-campanha e convenções." };
  const rule = OFFICES[office];
  if (!rule || rule.election !== e.kind) return { ok: false, message: "Este cargo não está em disputa nesta eleição." };
  if (member.party_id !== party.id || member.kind !== "FICTIONAL_GENERATED" || member.status !== "ACTIVE") return { ok: false, message: "Só membros do partido podem ser indicados." };
  if ([...ctx.t.candidacies.values()].some((c) => c.person_id === member.id && c.election_id === e.id && ["PRE", "HOMOLOGADA"].includes(c.status))) {
    return { ok: false, message: `${member.name} já tem candidatura nesta eleição.` };
  }
  const geo = raceGeoFor(member, office);
  const race = ctx.t.races.get(`${e.id}:${office}:${geo}`) ?? (rule.scope === "MUNICIPIO" ? ensureRace(ctx, e, office, geo) : undefined);
  if (!race) return { ok: false, message: "Não há essa disputa na região de quem você quer indicar." };
  const elig = checkEligibility(ctx, member, office, geo, e);
  if (!elig.ok) return { ok: false, message: `${member.name} não pode concorrer: ${elig.reasons.join(" ")}` };
  // majoritária: uma vaga por partido (no Senado, uma por cadeira em disputa)
  if (rule.system === "MAJORITARIO") {
    const taken = [...ctx.t.candidacies.values()].filter((c) => c.race_id === race.id && c.party_id === party.id && ["PRE", "HOMOLOGADA"].includes(c.status)).length;
    if (taken >= Math.max(1, office === "SENADOR" ? race.seats : 1)) return { ok: false, message: `O ${party.acronym} já tem nome para ${rule.name} em ${geoName(geo, ctx.s)}.` };
  }
  const cand: CandidacyRow = {
    id: ctx.id("cand", race.id, member.id),
    world_id: ctx.world.id,
    election_id: e.id,
    race_id: race.id,
    person_id: member.id,
    party_id: party.id,
    office_code: office,
    geo,
    status: "PRE",
    is_player: false,
    ballot_number: party.number * (rule.system === "PROPORCIONAL" ? 1000 : 1) + (rule.system === "PROPORCIONAL" ? (Number(member.id.replace(/\D/g, "").slice(-3)) || 321) : 0),
    campaign: emptyCampaign(),
    votes: 0,
    vote_share: 0,
    note: "Indicação da presidência do partido",
  };
  ctx.save("candidacies", cand);
  member.stage = "PRE_CANDIDATO";
  ctx.save("persons", member);
  return { ok: true, message: `${member.name} indicado(a) para ${rule.name} em ${geoName(geo, ctx.s)}. A convenção acontece até ${formatDatePt(e.calendar.conventionEnd)}.` };
}

export function withdrawIndication(ctx: Ctx, party: PartyRow, candId: string): { ok: boolean; message: string } {
  const c = ctx.t.candidacies.get(candId);
  if (!c || c.party_id !== party.id || c.status !== "PRE" || c.is_player) return { ok: false, message: "Indicação não encontrada." };
  c.status = "DESISTENTE";
  c.note = "Indicação retirada pela presidência do partido";
  ctx.save("candidacies", c);
  const p = ctx.person(c.person_id);
  if (p && p.stage === "PRE_CANDIDATO") {
    p.stage = "QUADRO";
    ctx.save("persons", p);
  }
  return { ok: true, message: `Indicação de ${p?.name ?? "membro"} retirada.` };
}

/** Cota do partido no fundo eleitoral desta eleição. */
export function partyFefcQuota(ctx: Ctx, party: PartyRow, e: ElectionRow): number {
  const camaraTotal = [...ctx.t.parties.values()].filter((p) => p.status === "ATIVO").reduce((s, p) => s + (p.seats.camara ?? 0), 0) || 1;
  return Math.round((fefcTotalFor(ctx, e) * fefcPartyShare(party, camaraTotal) * POOL_FACTOR) / 1000) * 1000;
}

/** Depois das convenções: cada partido presidido por jogador recebe a cota para repartir. */
export function creditPartyFunds(ctx: Ctx, e: ElectionRow): void {
  for (const party of ctx.t.parties.values()) {
    if (party.status !== "ATIVO" || !isPlayerLed(ctx, party) || party.campaign_fund?.election_id === e.id) continue;
    const total = partyFefcQuota(ctx, party, e);
    party.campaign_fund = { election_id: e.id, total, left: total, given: {} };
    ctx.save("parties", party);
    if (total > 0) {
      ctx.notify(
        party.president_id!,
        `Fundo eleitoral do ${party.acronym}: R$ ${total.toLocaleString("pt-BR")}`,
        `A cota do partido no FEFC chegou. Reparta entre as candidaturas homologadas até o 1º turno (${formatDatePt(e.first_round)}); o que sobrar volta ao Tesouro.`,
        "/jogo/meu-partido",
      );
    }
  }
}

/** Candidaturas do partido que podem receber repasse do fundo. */
export function fundableCandidacies(ctx: Ctx, party: PartyRow): CandidacyRow[] {
  const fund = party.campaign_fund;
  if (!fund) return [];
  return [...ctx.t.candidacies.values()].filter((c) => c.party_id === party.id && c.election_id === fund.election_id && (c.status === "HOMOLOGADA" || c.status === "SEGUNDO_TURNO"));
}

export function giveFefc(ctx: Ctx, party: PartyRow, candId: string, amount: number): { ok: boolean; message: string } {
  const fund: CampaignFund | null = party.campaign_fund;
  const c = ctx.t.candidacies.get(candId);
  if (!fund || fund.left <= 0) return { ok: false, message: "O fundo do partido está vazio." };
  if (!c || !fundableCandidacies(ctx, party).some((x) => x.id === c.id)) return { ok: false, message: "Candidatura inválida." };
  const value = Math.min(Math.round(amount), fund.left);
  if (value <= 0) return { ok: false, message: "Escolha um valor." };
  fund.left -= value;
  fund.given[c.id] = (fund.given[c.id] ?? 0) + value;
  c.campaign.fefc += value;
  c.campaign.budget += value;
  ctx.save("candidacies", c);
  ctx.save("parties", party);
  const p = ctx.person(c.person_id);
  ctx.insert("finance_transactions", {
    id: ctx.id("fin", c.id, "fefc-repasse"),
    world_id: ctx.world.id,
    person_id: c.person_id,
    candidacy_id: c.id,
    kind: "FEFC",
    amount: value,
    declared: true,
    game_date: ctx.date,
    description: `Repasse do FEFC decidido pela presidência do ${party.acronym}`,
  });
  if (p?.kind === "PLAYER" && p.id !== party.president_id) ctx.notify(p.id, `Repasse do fundo eleitoral: R$ ${value.toLocaleString("pt-BR")}`, `A presidência do ${party.acronym} reforçou sua campanha.`, "/jogo/campanha");
  return { ok: true, message: `R$ ${value.toLocaleString("pt-BR")} para a campanha de ${p?.name ?? "candidatura"}. Restam R$ ${fund.left.toLocaleString("pt-BR")} no fundo do partido.` };
}

/** No 1º turno, a sobra do fundo dos partidos de jogadores volta ao Tesouro. */
export function returnUnusedFunds(ctx: Ctx, e: ElectionRow): void {
  for (const party of ctx.t.parties.values()) {
    const fund = party.campaign_fund;
    if (!fund || fund.election_id !== e.id || fund.left <= 0) continue;
    const left = fund.left;
    fund.left = 0;
    ctx.save("parties", party);
    if (party.president_id) ctx.notify(party.president_id, "Sobra do fundo eleitoral devolvida", `R$ ${left.toLocaleString("pt-BR")} do FEFC do ${party.acronym} não foram repassados a candidaturas e voltaram ao Tesouro Nacional.`, "/jogo/meu-partido");
  }
}
