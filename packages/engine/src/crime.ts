import { addDays, addMonths, diffDays } from "./calendar";
import {
  CHANNEL_LABEL,
  chargeLabel,
  chargesText,
  CRIMES,
  penaltyYears,
  type ChargeKind,
  type DetectionChannel,
  type IllicitKind,
} from "./crimes";
import { worldPriceLevel } from "./finance";
import { isReal } from "./news/policy";
import { spawnProceduralCadre } from "./npc";
import { eraRules, OFFICES, type OfficeCode } from "./ruleset";
import type { Rng } from "./rng";
import type { Ctx } from "./state";
import type {
  Authority,
  Finding,
  IllicitActRow,
  InvestigationMeasure,
  InvestigationRow,
  Offer,
  PartyRow,
  PersonRow,
  PersonStateRow,
  Sentence,
} from "./types";

/**
 * Corrupção, fraudes eleitorais e investigação — por RISCO e EVIDÊNCIA,
 * nunca por tutorial de como ocultar crimes.
 *
 * Quem pode cometer crimes na simulação: jogadores e personagens procedurais
 * (que podem ser filiados a partidos reais). Pessoas reais nunca são autoras,
 * cúmplices nem alvos de investigação inventada — o motor recusa.
 *
 * Fluxo: conduta ilícita → rastros e testemunhas → alguém percebeu (Coaf,
 * Tribunal de Contas, imprensa, ex-assessor, adversário...) → investigação →
 * medidas (quebra de sigilo, busca, bloqueio, prisão) → processo → pena →
 * impacto no partido e nas eleições.
 */

export const STAGE_LABEL: Record<InvestigationRow["stage"], string> = {
  DENUNCIA: "Denúncia",
  IMPRENSA: "Na imprensa",
  INVESTIGACAO: "Investigação",
  PROCESSO: "Processo judicial",
  DESFECHO: "Desfecho",
};

export const AUTHORITY_LABEL: Record<Authority, string> = {
  PF: "Polícia Federal",
  MP: "Ministério Público",
  MP_ELEITORAL: "Ministério Público Eleitoral",
  CPI: "Comissão Parlamentar de Inquérito",
  IMPRENSA: "imprensa",
  TRIBUNAL_CONTAS: "Tribunal de Contas",
  JUSTICA_ELEITORAL: "Justiça Eleitoral",
};

const OPERATION_NAMES = [
  "Maré Alta", "Caixa Preta", "Pedra Angular", "Ponto Cego", "Lastro", "Fachada", "Retranca", "Vertente", "Contrapeso", "Areia Movediça",
  "Duplo Fundo", "Bússola", "Engrenagem", "Fio da Meada", "Sombra", "Antídoto", "Rachadura", "Gabinete Fantasma", "Nota Fria", "Cota Zero",
  "Edital Viciado", "Emenda Torta", "Voto de Cabresto", "Laranjal", "Tesouro Oculto", "Ponte Aérea", "Mão Dupla", "Atalho", "Recibo", "Espelho",
];

const CHANNEL_AUTHORITY: Record<DetectionChannel, Authority> = {
  COAF: "PF",
  TRIBUNAL_CONTAS: "TRIBUNAL_CONTAS",
  IMPRENSA: "IMPRENSA",
  MP_ELEITORAL: "MP_ELEITORAL",
  ADVERSARIO: "MP",
  EX_ASSESSOR: "MP",
  RECEITA: "PF",
  CONTROLADORIA: "PF",
  COLABORACAO: "PF",
};

const LEGISLATIVE = ["VEREADOR", "DEP_ESTADUAL", "DEP_FEDERAL", "SENADOR"];

export function canBeTargeted(p: PersonRow | undefined): p is PersonRow {
  return !!p && !isReal(p.kind) && p.status === "ACTIVE";
}

export function isJailed(st: PersonStateRow | undefined, date: string): boolean {
  return !!st?.jailed_until && st.jailed_until > date;
}

// ---------------------------------------------------------------------------
// Oportunidade e ganho
// ---------------------------------------------------------------------------

function liveCandidacy(ctx: Ctx, personId: string) {
  return [...ctx.t.candidacies.values()].find(
    (c) => c.person_id === personId && ["PRE", "HOMOLOGADA", "SEGUNDO_TURNO"].includes(c.status) && ctx.t.elections.get(c.election_id)?.status !== "ENCERRADA",
  );
}

function inCampaign(ctx: Ctx, personId: string): boolean {
  const c = liveCandidacy(ctx, personId);
  if (!c || c.status === "PRE") return false;
  const e = ctx.t.elections.get(c.election_id);
  return !!e && ctx.date >= e.calendar.campaignStart;
}

export function partyLedBy(ctx: Ctx, personId: string): PartyRow | undefined {
  return [...ctx.t.parties.values()].find((p) => p.president_id === personId && p.status === "ATIVO");
}

function openCaseAgainst(ctx: Ctx, personId: string): InvestigationRow | undefined {
  return [...ctx.t.investigations.values()].find((i) => i.person_id === personId && !i.outcome);
}

const officeList = (codes: OfficeCode[]) => codes.map((c) => OFFICES[c].name.toLowerCase()).join(", ");

/** Por que esta pessoa não tem oportunidade de praticar a conduta agora (null = tem). */
export function crimeOpportunity(ctx: Ctx, p: PersonRow, kind: IllicitKind): string | null {
  const def = CRIMES[kind];
  const st = ctx.pstate(p.id);
  if (isReal(p.kind)) return "Pessoas reais não cometem crimes na simulação.";
  if (!st) return "Sem estado.";
  if (isJailed(st, ctx.date)) return "Você está cumprindo pena em regime fechado.";
  if (def.since && Number(ctx.date.slice(0, 4)) < def.since) return "Ainda não existe nesta época.";
  if (def.offices.length && !(p.office_code && def.offices.includes(p.office_code))) return `Exige o cargo de ${officeList(def.offices)}.`;
  switch (kind) {
    case "CAIXA_DOIS":
      return liveCandidacy(ctx, p.id) || partyLedBy(ctx, p.id) ? null : "Só com pré-candidatura, candidatura ou à frente de um partido.";
    case "COMPRA_VOTOS":
    case "ABUSO_PODER_ECONOMICO":
    case "DESINFORMACAO":
      return inCampaign(ctx, p.id) ? null : "Só durante a campanha oficial, com candidatura homologada.";
    case "USO_MAQUINA":
      return inCampaign(ctx, p.id) ? null : "Só para quem está no cargo e em campanha.";
    case "CANDIDATURAS_LARANJA": {
      const party = partyLedBy(ctx, p.id);
      if (!party) return "Só para quem preside um partido.";
      const e = [...ctx.t.elections.values()].find((x) => x.status !== "AGENDADA" && x.status !== "ENCERRADA");
      return e && ctx.date >= e.calendar.conventionStart && ctx.date <= e.first_round ? null : "Só entre as convenções e o 1º turno.";
    }
    case "DESVIO_FUNDO_PARTIDARIO": {
      const party = partyLedBy(ctx, p.id);
      if (!party) return "Só para quem preside um partido.";
      return party.cash >= 50_000 * worldPriceLevel(ctx.world) ? null : "O caixa do partido está baixo demais.";
    }
    case "TRAFICO_INFLUENCIA": {
      if (p.office_code) return null;
      const knowsOfficial = [...ctx.t.relationships.values()].some((r) => r.a_id === p.id && r.score >= 40 && !!ctx.person(r.b_id)?.office_code);
      return knowsOfficial ? null : "Exige relação forte (40+) com alguém que tenha cargo.";
    }
    case "LAVAGEM":
      return st.dirty_money >= 20_000 * worldPriceLevel(ctx.world) ? null : "Você não tem dinheiro não declarado para lavar.";
    case "OBSTRUCAO_JUSTICA":
      return openCaseAgainst(ctx, p.id) ? null : "Não há investigação aberta contra você.";
    case "ENRIQUECIMENTO_ILICITO":
      return "Resulta de outras condutas.";
    default:
      return null;
  }
}

/** Faixas de ganho por cargo (R$ de 2026; o motor corrige pelo nível de preços da época). */
const OFFICE_SCALE: Record<OfficeCode, number> = {
  VEREADOR: 0.15,
  PREFEITO: 0.6,
  DEP_ESTADUAL: 0.5,
  DEP_FEDERAL: 1,
  SENADOR: 1.6,
  GOVERNADOR: 4,
  PRESIDENTE: 15,
};

function cityFactor(ctx: Ctx, p: PersonRow): number {
  if (p.office_code !== "PREFEITO" && p.office_code !== "VEREADOR") return 1;
  const city = ctx.s.cities?.get(p.office_geo ?? "");
  if (!city) return 1;
  return Math.max(0.3, Math.min(4, Math.sqrt(city.electorate / 150_000)));
}

export interface CrimeGain {
  /** ganho de uma vez (R$) */
  amount: number;
  /** ganho mensal, para esquemas recorrentes */
  monthly: number;
}

export function crimeGain(ctx: Ctx, p: PersonRow, kind: IllicitKind, rng: Rng): CrimeGain {
  const pl = worldPriceLevel(ctx.world);
  const scale = (p.office_code ? OFFICE_SCALE[p.office_code] : 0.4) * cityFactor(ctx, p) * pl;
  const r = (lo: number, hi: number) => Math.round(rng.range(lo, hi) * scale / 1000) * 1000;
  const flat = (lo: number, hi: number) => Math.round(rng.range(lo, hi) * pl / 1000) * 1000;
  switch (kind) {
    case "PROPINA":
      return { amount: r(80_000, 900_000), monthly: 0 };
    case "CONCUSSAO":
      return { amount: r(50_000, 500_000), monthly: 0 };
    case "PECULATO":
      return { amount: r(150_000, 1_500_000), monthly: 0 };
    case "FRAUDE_LICITACAO":
      return { amount: r(200_000, 2_000_000), monthly: 0 };
    case "DESVIO_EMENDAS":
      return { amount: r(200_000, 2_500_000), monthly: 0 };
    case "CORRUPCAO_ATIVA":
      return { amount: r(100_000, 800_000), monthly: 0 };
    case "RACHADINHA":
      return { amount: 0, monthly: r(12_000, 45_000) };
    case "FUNCIONARIO_FANTASMA":
      return { amount: 0, monthly: flat(5_000, 15_000) };
    case "DESVIO_COTA":
      return { amount: 0, monthly: r(8_000, 25_000) };
    case "NEPOTISMO":
      return { amount: 0, monthly: flat(6_000, 18_000) };
    case "CAIXA_DOIS":
      return { amount: flat(60_000, 1_200_000), monthly: 0 };
    case "TRAFICO_INFLUENCIA":
      return { amount: flat(40_000, 400_000), monthly: 0 };
    case "CANDIDATURAS_LARANJA": {
      const party = partyLedBy(ctx, p.id);
      return { amount: Math.round(Math.max(80_000 * pl, (party?.cash ?? 0) * rng.range(0.05, 0.15)) / 1000) * 1000, monthly: 0 };
    }
    case "DESVIO_FUNDO_PARTIDARIO": {
      const party = partyLedBy(ctx, p.id);
      return { amount: Math.round(((party?.cash ?? 0) * rng.range(0.1, 0.3)) / 1000) * 1000, monthly: 0 };
    }
    default:
      return { amount: 0, monthly: 0 };
  }
}

// ---------------------------------------------------------------------------
// Atos
// ---------------------------------------------------------------------------

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

export interface ActOptions {
  amount: number;
  partners?: string[];
  description: string;
  witnesses?: number;
  paperTrail?: number;
  ongoing?: boolean;
  monthlyGain?: number;
  votesGain?: number;
  partyId?: string | null;
}

export function createIllicitAct(ctx: Ctx, person: PersonRow, kind: IllicitKind, opts: ActOptions): IllicitActRow {
  if (isReal(person.kind)) throw new Error("Pessoas reais não cometem crimes na simulação.");
  const def = CRIMES[kind];
  const rng = ctx.rng("act", `${person.id}:${kind}`);
  const previous = [...ctx.t.illicit_acts.values()].filter((a) => a.person_id === person.id).length;
  const partnerLoyalty = (opts.partners ?? []).map((id) => ctx.pstate(id)?.traits.loyalty ?? 0.5).reduce((m, v) => Math.min(m, v), 1);
  const act: IllicitActRow = {
    id: ctx.id("act", person.id, kind),
    world_id: ctx.world.id,
    person_id: person.id,
    kind,
    created_on: ctx.date,
    amount: Math.round(opts.amount),
    value_relative: Math.min(1, opts.amount / (2_000_000 * worldPriceLevel(ctx.world))),
    participants: 1 + (opts.partners?.length ?? 0) + rng.int(0, 3),
    witnesses: opts.witnesses ?? rng.int(def.witnesses[0], def.witnesses[1]),
    paper_trail: opts.paperTrail ?? rng.range(def.trail[0], def.trail[1]),
    recurrence: previous + 1,
    exposure: person.office_code ? 0.7 : person.stage === "CANDIDATO" ? 0.5 : 0.25,
    accomplice_loyalty: partnerLoyalty,
    partners: opts.partners ?? [],
    party_id: opts.partyId !== undefined ? opts.partyId : person.party_id,
    description: opts.description,
    discovered: false,
    discovered_on: null,
    ongoing: !!opts.ongoing,
    monthly_gain: Math.round(opts.monthlyGain ?? 0),
    stopped_on: null,
    office_code: person.office_code,
    geo: person.office_geo ?? person.uf,
    votes_gain: opts.votesGain ?? 0,
  };
  ctx.save("illicit_acts", act);
  ctx.emit("ILLICIT_ACT", { actors: [person.id, ...(opts.partners ?? [])], geography: person.uf, payload: { kind, actId: act.id } });
  return act;
}

/** Cúmplice fictício (empresário, operador, laranja...) do mesmo estado. */
export function findOrCreateBroker(ctx: Ctx, uf: string, party: PartyRow | undefined, role?: string): PersonRow {
  const rng = ctx.rng("broker", `${uf}:${role ?? ""}`);
  const candidates = [...ctx.t.persons.values()].filter(
    (p) =>
      p.kind === "FICTIONAL_GENERATED" &&
      p.status === "ACTIVE" &&
      p.uf === uf &&
      !p.office_code &&
      (ctx.pstate(p.id)?.traits.riskTolerance ?? 0) > 0.6 &&
      (!party || p.party_id === party.id || !p.party_id) &&
      (!role || p.role_label === role),
  );
  if (candidates.length && rng.chance(0.7)) return rng.pick(candidates);
  const label = role ?? (party ? `operador ligado ao ${party.acronym}` : rng.pick(["empresário da construção civil", "lobista do setor de serviços", "empresário do transporte"]));
  const ideology = party?.ideology ?? [...ctx.t.parties.values()][0].ideology;
  const broker = spawnProceduralCadre(ctx, { partyId: party?.id ?? "", uf, ideology, roleLabel: label, tier: 3 });
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

/** Condutas que não geram dinheiro novo para quem pratica (custam, convertem ou rendem votos). */
const NO_CASH_GAIN = new Set<IllicitKind>(["NEPOTISMO", "OBSTRUCAO_JUSTICA", "DESINFORMACAO", "COMPRA_VOTOS", "ABUSO_PODER_ECONOMICO", "USO_MAQUINA", "LAVAGEM", "CORRUPCAO_ATIVA"]);

export interface SchemeResult {
  act: IllicitActRow;
  amount: number;
  monthly: number;
  partner: PersonRow | null;
}

/** Pratica uma conduta: cria o ato, o cúmplice e credita o ganho em dinheiro não declarado. */
export function commitCrime(ctx: Ctx, p: PersonRow, kind: IllicitKind, opts: { amount?: number; votesGain?: number; description?: string; noPartner?: boolean } = {}): SchemeResult {
  const def = CRIMES[kind];
  const st = ctx.pstate(p.id)!;
  const rng = ctx.rng("commit", `${p.id}:${kind}:${st.action_seq}`);
  const gain = crimeGain(ctx, p, kind, rng);
  const amount = opts.amount ?? gain.amount;
  const party = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
  const partner = opts.noPartner ? null : findOrCreateBroker(ctx, p.uf, kind === "CANDIDATURAS_LARANJA" || kind === "DESVIO_FUNDO_PARTIDARIO" ? party : undefined, rng.pick(def.partnerRole));
  const where = p.office_code ? `${OFFICES[p.office_code].name.toLowerCase()}` : p.role_label ?? "liderança política";
  const act = createIllicitAct(ctx, p, kind, {
    amount: amount + gain.monthly,
    partners: partner ? [partner.id] : [],
    description: opts.description ?? `${def.label} (${where})`,
    ongoing: !!def.recurring,
    monthlyGain: gain.monthly,
    votesGain: opts.votesGain,
  });
  // o dinheiro desviado não passa pela conta declarada
  if (!NO_CASH_GAIN.has(kind)) st.dirty_money += amount + gain.monthly;
  if (kind === "DESVIO_FUNDO_PARTIDARIO" || kind === "CANDIDATURAS_LARANJA") {
    const led = partyLedBy(ctx, p.id);
    if (led) {
      led.cash = Math.max(0, led.cash - amount);
      ctx.save("parties", led);
    }
  }
  ctx.save("person_states", st);
  return { act, amount, monthly: gain.monthly, partner };
}

/** Encerra um esquema recorrente (o que já foi feito continua rastreável). */
export function stopScheme(ctx: Ctx, act: IllicitActRow): void {
  act.ongoing = false;
  act.stopped_on = ctx.date;
  ctx.save("illicit_acts", act);
}

// ---------------------------------------------------------------------------
// Dossiês: o que de fato aparece quando alguém investiga
// ---------------------------------------------------------------------------

const NOTHING_FOUND = [
  "Nada de irregular nas fontes consultadas: cartórios, diários oficiais, juntas comerciais e prestação de contas.",
  "Patrimônio e gastos compatíveis com a renda declarada. Nenhum contrato suspeito encontrado.",
  "As fontes ouvidas não relataram irregularidades. Os documentos públicos estão em ordem.",
];

const RUMORS = [
  "Um informante fala em irregularidades, mas não apresenta nenhum documento.",
  "Comentários de bastidor apontam suspeitas, sem prova que se sustente.",
  "Uma fonte anônima faz acusações genéricas e não volta a atender.",
];

export function dossierKey(target: { person?: PersonRow; party?: PartyRow }): string {
  return target.party ? `party:${target.party.id}` : target.person!.id;
}

/** Força do dossiê: provas verificadas se somam; boatos quase não contam. */
export function dossierLevel(findings: Finding[]): number {
  const verified = findings.filter((f) => f.verified && f.act_id);
  const miss = verified.reduce((m, f) => m * (1 - f.strength), 1);
  const rumor = Math.min(0.1, findings.filter((f) => !f.verified).reduce((s, f) => s + f.strength, 0));
  return Math.min(0.95, Math.round((1 - miss + rumor) * 100) / 100);
}

export interface IntelResult {
  found: Finding[];
  level: number;
  nothing: boolean;
}

/** Levanta informações sobre uma pessoa (fictícia ou jogador) ou sobre um partido. */
export function gatherIntel(ctx: Ctx, st: PersonStateRow, target: { person?: PersonRow; party?: PartyRow }, rng: Rng, skill: number): IntelResult {
  const key = dossierKey(target);
  const known = st.findings[key] ?? [];
  const knownActs = new Set(known.filter((f) => f.act_id && f.verified).map((f) => f.act_id));
  const knownTexts = new Set(known.map((f) => f.text));
  const acts = [...ctx.t.illicit_acts.values()].filter((a) => {
    if (a.discovered && !target.party) return false;
    if (target.party) {
      const author = ctx.person(a.person_id);
      return a.party_id === target.party.id && !!author && !isReal(author.kind);
    }
    return a.person_id === target.person!.id;
  });
  const found: Finding[] = [];
  const fresh = rng.shuffle(acts.filter((a) => !knownActs.has(a.id))).slice(0, 2);
  for (const act of fresh) {
    const p = (0.2 + act.paper_trail * 0.55 + Math.min(0.2, act.witnesses * 0.02) + Math.min(0.15, act.recurrence * 0.03)) * skill;
    if (!rng.chance(Math.min(0.92, p))) continue;
    const def = CRIMES[act.kind];
    const text = def.findings.find((t) => !knownTexts.has(t)) ?? def.findings[0];
    knownTexts.add(text);
    found.push({
      id: ctx.id("fnd", act.id),
      on: ctx.date,
      act_id: act.id,
      crime: act.kind,
      text,
      strength: Math.round(Math.min(0.6, 0.15 + act.paper_trail * 0.35 + rng.range(0, 0.1)) * 100) / 100,
      verified: true,
      person_id: act.person_id,
    });
  }
  // aprofundar um ato já conhecido também fortalece a prova
  if (!found.length && knownActs.size && rng.chance(0.5 * skill)) {
    const actId = rng.pick([...knownActs]) as string;
    const act = ctx.t.illicit_acts.get(actId);
    if (act) {
      const extra = CRIMES[act.kind].evidence.find((t) => !knownTexts.has(t));
      if (extra) {
        found.push({ id: ctx.id("fnd", act.id, "mais"), on: ctx.date, act_id: act.id, crime: act.kind, text: extra, strength: 0.12, verified: true, person_id: act.person_id });
      }
    }
  }
  let nothing = false;
  if (!found.length) {
    if (acts.length && rng.chance(0.5)) {
      const act = rng.pick(acts);
      found.push({ id: ctx.id("fnd", "pista"), on: ctx.date, act_id: null, crime: act.kind, text: `Há sinais de ${CRIMES[act.kind].noun}, mas ainda sem documento que comprove.`, strength: 0.05, verified: false, person_id: act.person_id });
    } else if (rng.chance(0.25)) {
      const kind = rng.pick(["CAIXA_DOIS", "PROPINA", "FUNCIONARIO_FANTASMA", "RACHADINHA"] as const);
      found.push({ id: ctx.id("fnd", "boato"), on: ctx.date, act_id: null, crime: kind, text: rng.pick(RUMORS), strength: 0.04, verified: false, person_id: null });
    } else {
      nothing = true;
      found.push({ id: ctx.id("fnd", "nada"), on: ctx.date, act_id: null, crime: null, text: rng.pick(NOTHING_FOUND), strength: 0, verified: true, person_id: null });
    }
  }
  const all = [...known, ...found].slice(-30);
  st.findings[key] = all;
  const level = dossierLevel(all);
  st.dossiers[key] = level;
  return { found, level, nothing };
}

export function dossierLabel(level: number): string {
  return level < 0.15 ? "nada consistente" : level < 0.4 ? "indícios fracos" : level < 0.7 ? "indícios moderados" : "indícios fortes";
}

// ---------------------------------------------------------------------------
// Investigações
// ---------------------------------------------------------------------------

function chargesFor(acts: IllicitActRow[]): ChargeKind[] {
  const kinds: ChargeKind[] = [...new Set(acts.map((a) => a.kind))];
  const participants = acts.reduce((s, a) => s + a.participants, 0);
  const recurring = acts.some((a) => a.recurrence >= 3 || a.ongoing);
  if (acts.length && participants >= 4 && (acts.length >= 2 || recurring)) kinds.push("ORGANIZACAO_CRIMINOSA");
  return kinds;
}

export interface OpenOptions {
  authority: Authority;
  openedBy?: string | null;
  initialEvidence?: number;
  /** atos cobertos; sem eles, a denúncia não tem base (o caso tende ao arquivamento) */
  actIds?: string[];
  reason: string;
  channel?: InvestigationRow["channel"];
  partyId?: string | null;
}

/** Abre investigação contra uma pessoa (fictícia ou jogador) ou contra um partido. */
export function openInvestigation(ctx: Ctx, target: PersonRow | null, opts: OpenOptions): InvestigationRow | null {
  if (target && !canBeTargeted(target)) return null;
  const partyTarget = !target && opts.partyId ? ctx.t.parties.get(opts.partyId) : undefined;
  if (!target && !partyTarget) return null;
  const actIds = opts.actIds ?? [];
  const existing = [...ctx.t.investigations.values()].find((i) => !i.outcome && (target ? i.person_id === target.id : i.target_type === "PARTIDO" && i.party_id === partyTarget!.id));
  if (existing) {
    for (const a of actIds) if (!existing.act_ids.includes(a)) existing.act_ids.push(a);
    existing.crimes = chargesFor(existing.act_ids.map((id) => ctx.t.illicit_acts.get(id)).filter((a): a is IllicitActRow => !!a));
    existing.evidence = Math.min(1, existing.evidence + (opts.initialEvidence ?? 0) * 0.5);
    existing.evidences.push({ on: ctx.date, description: opts.reason, strength: Math.round((opts.initialEvidence ?? 0) * 50) / 100 });
    ctx.save("investigations", existing);
    return existing;
  }
  const acts = actIds.map((id) => ctx.t.illicit_acts.get(id)).filter((a): a is IllicitActRow => !!a);
  const party = target ? (target.party_id ? ctx.t.parties.get(target.party_id) : undefined) : partyTarget;
  const inv: InvestigationRow = {
    id: ctx.id("inv", target?.id ?? partyTarget!.id),
    world_id: ctx.world.id,
    person_id: target?.id ?? null,
    party_id: party?.id ?? null,
    target_type: target ? "PESSOA" : "PARTIDO",
    crimes: chargesFor(acts),
    channel: opts.channel ?? (opts.openedBy ? "DENUNCIA" : null),
    measures: [],
    sentence: null,
    stage: "DENUNCIA",
    opened_on: ctx.date,
    next_step_on: addDays(ctx.date, ctx.rng("inv-step", target?.id ?? partyTarget!.id).int(7, 20)),
    evidence: opts.initialEvidence ?? 0.1,
    defense: 0,
    evidences: [{ on: ctx.date, description: opts.reason, strength: Math.round((opts.initialEvidence ?? 0.1) * 100) / 100 }],
    outcome: null,
    authority: opts.authority,
    opened_by: opts.openedBy ?? null,
    act_ids: acts.map((a) => a.id),
  };
  ctx.save("investigations", inv);
  for (const act of acts) {
    if (!act.discovered) {
      act.discovered = true;
      act.discovered_on = ctx.date;
      act.ongoing = false;
      act.stopped_on = act.stopped_on ?? ctx.date;
      ctx.save("illicit_acts", act);
    }
  }
  const ev = ctx.emit("INVESTIGATION_OPENED", { actors: target ? [target.id] : [], geography: target?.uf ?? "BR", payload: { authority: opts.authority, investigation: inv.id, party: partyTarget?.id ?? null } });
  if (target) {
    ctx.notify(target.id, "Você é alvo de uma investigação", `${capitalize(AUTHORITY_LABEL[opts.authority])} abriu um caso envolvendo você (${inv.crimes.length ? chargesText(inv.crimes) : "suspeita ainda genérica"}). Prepare sua defesa.`, "/jogo/investigacoes");
  } else if (partyTarget?.president_id) {
    ctx.notify(partyTarget.president_id, `Investigação sobre o ${partyTarget.acronym}`, `${capitalize(AUTHORITY_LABEL[opts.authority])} abriu apuração sobre as contas e a atuação do partido.`, "/jogo/investigacoes");
  }
  if (opts.openedBy) ctx.notify(opts.openedBy, "Denúncia registrada", `${capitalize(AUTHORITY_LABEL[opts.authority])} registrou sua denúncia contra ${target?.name ?? `o ${partyTarget!.acronym}`}.`, "/jogo/investigacoes");
  publishScandal(ctx, inv, ev.id);
  return inv;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function officeShort(code: string): string {
  const m: Record<string, string> = {
    VEREADOR: "vereador(a)", PREFEITO: "prefeito(a)", DEP_ESTADUAL: "deputado(a) estadual", DEP_FEDERAL: "deputado(a) federal",
    SENADOR: "senador(a)", GOVERNADOR: "governador(a)", PRESIDENTE: "presidente",
  };
  return m[code] ?? code;
}

function describeTarget(target: PersonRow, party: PartyRow | undefined): string {
  const role = target.office_code ? officeShort(target.office_code) : target.role_label ?? (target.kind === "PLAYER" ? "liderança política" : "figura política");
  return `${target.name} (${role}${party ? `, ${party.acronym}` : ""}, ${target.uf})`;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function operationName(inv: InvestigationRow): string {
  return OPERATION_NAMES[hashCode(inv.id) % OPERATION_NAMES.length];
}

function publishScandal(ctx: Ctx, inv: InvestigationRow, eventId: string): void {
  const target = ctx.person(inv.person_id);
  const party = inv.party_id ? ctx.t.parties.get(inv.party_id) : undefined;
  const acts = inv.act_ids.map((id) => ctx.t.illicit_acts.get(id)).filter((a): a is IllicitActRow => !!a);
  const what = inv.crimes.length ? chargesText(inv.crimes) : "irregularidades";
  const hook = acts.length ? CRIMES[acts[0].kind].hook : "documentos ainda são analisados";
  const op = operationName(inv);
  const year = Number(ctx.date.slice(0, 4));
  const who = target ? describeTarget(target, party) : `o ${party!.acronym}`;
  const name = target ? target.name : `${party!.acronym}`;
  const sentence = inv.sentence;
  const sentenceText = sentence
    ? sentence.years > 0
      ? `Pena de ${sentence.years} ano(s) em regime ${sentence.regime.toLowerCase().replace("_", " ")}${sentence.ineligible_until ? `, além da inelegibilidade` : ""}${sentence.cassation ? " e da cassação do mandato" : ""}.`
      : `${sentence.cassation ? "Cassação do mandato ou do registro" : "Multa"}${sentence.ineligible_until ? " e inelegibilidade" : ""}.`
    : "";
  const texts: Record<InvestigationRow["stage"], { title: string; body: string }> = {
    DENUNCIA: {
      title: target ? `Denúncia aponta suspeita de ${what} envolvendo ${name}` : `Denúncia pede apuração de ${what} no ${party!.acronym}`,
      body: `${capitalize(AUTHORITY_LABEL[inv.authority])} recebeu ${inv.channel && inv.channel !== "DENUNCIA" && inv.channel !== "CPI" ? `um ${CHANNEL_LABEL[inv.channel]}` : "uma denúncia"} que cita ${who}. A defesa nega irregularidades. O caso está em fase preliminar.`,
    },
    IMPRENSA: {
      title: target ? `Reportagem: ${hook}, em caso que envolve ${name}` : `Reportagem revela suspeitas nas contas do ${party!.acronym}`,
      body: `Documentos obtidos pela reportagem reforçam a suspeita de ${what} envolvendo ${who}. Adversários cobram explicações${party && target ? ` e a direção do ${party.acronym} discute o caso` : ""}.`,
    },
    INVESTIGACAO: {
      title: `Operação ${op}: ${inv.authority === "TRIBUNAL_CONTAS" ? "auditoria" : "Polícia Federal"} mira ${target ? name : `as contas do ${party!.acronym}`}`,
      body: `A investigação apura ${what} (${inv.crimes.map((c) => chargeLabel(c, year).toLowerCase()).join(", ") || "sem tipificação definida"}). ${inv.measures.length ? `Medidas: ${inv.measures.slice(-3).map((m) => m.text.toLowerCase()).join("; ")}.` : ""}`,
    },
    PROCESSO: {
      title: target ? `Justiça aceita denúncia e ${name} vira réu por ${what}` : `Justiça Eleitoral julga as contas do ${party!.acronym}`,
      body: `${capitalize(who)} responderá ${target ? "à ação" : "ao processo"}. A defesa afirma que vai provar a inocência.`,
    },
    DESFECHO: {
      title:
        inv.outcome === "CONDENADO"
          ? target
            ? `${name} é condenado(a) por ${what}`
            : `Justiça Eleitoral pune o ${party!.acronym} por ${what}`
          : inv.outcome === "ABSOLVIDO"
            ? `${name} é absolvido(a) em processo por ${what}`
            : `Investigação sobre ${name} é arquivada`,
      body:
        inv.outcome === "CONDENADO"
          ? target
            ? `${sentenceText}${party ? ` O caso desgasta a imagem do ${party.acronym}.` : ""}`
            : `O partido terá de devolver recursos e fica sem cotas do fundo partidário por alguns meses.`
          : inv.outcome === "ABSOLVIDO"
            ? `O tribunal entendeu que as provas eram insuficientes. ${capitalize(who)} diz que foi vítima de perseguição.`
            : `Sem provas suficientes, o caso envolvendo ${who} foi arquivado.`,
    },
  };
  const t = texts[inv.stage];
  ctx.publish("SCANDAL_STAGE", { facts: { title: t.title, body: t.body }, personIds: target ? [target.id] : [], geography: target?.uf ?? "BR", eventId, importance: inv.stage === "DENUNCIA" ? 2 : 3 });
}

function measure(ctx: Ctx, inv: InvestigationRow, kind: InvestigationMeasure["kind"], text: string): void {
  if (inv.measures.some((m) => m.kind === kind)) return;
  inv.measures.push({ on: ctx.date, kind, text });
}

/** Avanço diário: descoberta espontânea e progressão das investigações. */
export function dailyCrime(ctx: Ctx): void {
  const campaignOn = [...ctx.t.elections.values()].some((e) => (e.status === "CAMPANHA" || e.status === "SEGUNDO_TURNO") && ctx.date >= e.calendar.campaignStart);
  for (const act of ctx.t.illicit_acts.values()) {
    if (act.discovered) continue;
    const def = CRIMES[act.kind] ?? CRIMES.PROPINA;
    const risk = actRisk(ctx, act);
    const age = diffDays(ctx.date, act.created_on);
    const electoral = def.sphere === "ELEITORAL";
    const p = 0.0025 * risk * (age < 30 ? 0.5 : 1) * (electoral && campaignOn ? 2 : 1) * (act.ongoing ? 1.2 : 1);
    if (!ctx.rng("detect", act.id).chance(p)) continue;
    const person = ctx.person(act.person_id);
    if (!canBeTargeted(person)) continue;
    const channels = Object.entries(def.channels) as Array<[DetectionChannel, number]>;
    const [channel] = ctx.rng("detect-who", act.id).weighted(channels, ([, w]) => w);
    let authority = CHANNEL_AUTHORITY[channel];
    if (electoral && authority === "MP") authority = "MP_ELEITORAL";
    openInvestigation(ctx, person, {
      authority,
      initialEvidence: 0.15 + act.paper_trail * 0.3,
      actIds: [act.id],
      reason: `Caso começou por ${CHANNEL_LABEL[channel]}`,
      channel,
    });
  }

  for (const inv of ctx.t.investigations.values()) {
    if (inv.outcome || inv.next_step_on > ctx.date) continue;
    progressInvestigation(ctx, inv);
  }
}

function progressInvestigation(ctx: Ctx, inv: InvestigationRow): void {
  const target = ctx.person(inv.person_id);
  if (inv.target_type === "PESSOA" && !target) return;
  const party = inv.party_id ? ctx.t.parties.get(inv.party_id) : undefined;
  const rng = ctx.rng("inv", inv.id);
  const year = Number(ctx.date.slice(0, 4));
  // a investigação puxa o fio: outros atos do mesmo alvo podem aparecer
  if (inv.stage === "INVESTIGACAO" && inv.evidence > 0.3) {
    const more = [...ctx.t.illicit_acts.values()].filter((a) => !a.discovered && !inv.act_ids.includes(a.id) && (target ? a.person_id === target.id : a.party_id === inv.party_id && !isReal(ctx.person(a.person_id)?.kind ?? "PLAYER")));
    for (const a of more) {
      if (!rng.chance(0.25 + a.paper_trail * 0.3)) continue;
      a.discovered = true;
      a.discovered_on = ctx.date;
      a.ongoing = false;
      a.stopped_on = a.stopped_on ?? ctx.date;
      ctx.save("illicit_acts", a);
      inv.act_ids.push(a.id);
      inv.evidences.push({ on: ctx.date, description: `Investigação encontra indícios de ${CRIMES[a.kind].noun}`, strength: 0.1 });
    }
    inv.crimes = chargesFor(inv.act_ids.map((id) => ctx.t.illicit_acts.get(id)).filter((a): a is IllicitActRow => !!a));
  }
  const acts = inv.act_ids.map((id) => ctx.t.illicit_acts.get(id)).filter((a): a is IllicitActRow => !!a);
  const truth = acts.length ? Math.max(...acts.map((a) => 0.4 + a.paper_trail * 0.4 + Math.min(0.2, a.witnesses * 0.03))) : 0.05;
  const obstruction = target ? acts.some((a) => a.kind === "OBSTRUCAO_JUSTICA") || [...ctx.t.illicit_acts.values()].some((a) => a.person_id === target.id && a.kind === "OBSTRUCAO_JUSTICA" && a.created_on >= inv.opened_on) : false;
  const gain = rng.range(0.05, 0.2) * truth * (inv.authority === "PF" ? 1.2 : inv.authority === "CPI" ? 0.9 : 1) * (obstruction ? 0.6 : 1);
  inv.evidence = Math.min(1, inv.evidence + gain);
  const pool = acts.flatMap((a) => CRIMES[a.kind].evidence);
  const used = new Set(inv.evidences.map((e) => e.description));
  const fresh = pool.filter((t) => !used.has(t));
  inv.evidences.push({ on: ctx.date, description: fresh.length ? rng.pick(fresh) : genericEvidence(rng.int(0, 5)), strength: Math.round(gain * 100) / 100 });
  const st = target ? ctx.pstate(target.id) : undefined;
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
  const totalAmount = acts.reduce((s, a) => s + a.amount, 0);

  // Medidas da investigação
  if (inv.stage === "INVESTIGACAO") {
    measure(ctx, inv, "QUEBRA_SIGILO", "Quebra dos sigilos bancário e fiscal");
    if (inv.evidence >= 0.4) measure(ctx, inv, "BUSCA", `Busca e apreensão${target ? ` em endereços ligados a ${target.name}` : ` na sede do ${party?.acronym ?? "partido"}`}`);
    if (totalAmount >= 500_000 * worldPriceLevel(ctx.world) && inv.evidence >= 0.5) measure(ctx, inv, "BLOQUEIO_BENS", `Bloqueio de até R$ ${Math.round(totalAmount).toLocaleString("pt-BR")} em bens`);
    if (target && (obstruction || (totalAmount >= 5_000_000 * worldPriceLevel(ctx.world) && inv.evidence >= 0.7))) {
      measure(ctx, inv, "PRISAO_PREVENTIVA", obstruction ? "Prisão preventiva por risco à investigação" : "Prisão preventiva pelo volume desviado");
      if (st) {
        st.jailed_until = addDays(ctx.date, rng.int(30, 120));
        ctx.save("person_states", st);
      }
    }
    if (target?.office_code && ["PREFEITO", "GOVERNADOR"].includes(target.office_code) && inv.evidence >= 0.6) {
      measure(ctx, inv, "AFASTAMENTO", "Afastamento cautelar do cargo por 180 dias");
      if (st) {
        st.political_capital = Math.max(0, st.political_capital - 30);
        ctx.save("person_states", st);
      }
    }
  }
  if (inv.stage === "PROCESSO") measure(ctx, inv, "DENUNCIA_ACEITA", target ? "Denúncia aceita: o investigado vira réu" : "Contas do partido vão a julgamento");
  ctx.save("investigations", inv);

  // Impacto
  const severity = inv.evidence;
  const repHit = { DENUNCIA: 3, IMPRENSA: 6, INVESTIGACAO: 10, PROCESSO: 8, DESFECHO: inv.outcome === "CONDENADO" ? 15 : -4 }[inv.stage] * severity;
  if (target) {
    target.reputation = Math.max(0, Math.min(100, Math.round(target.reputation - repHit)));
    ctx.save("persons", target);
  }
  if (st) {
    st.scandal = Math.min(100, Math.round(st.scandal + repHit * 1.2));
    if (inv.outcome === "ABSOLVIDO" || inv.outcome === "ARQUIVADO") st.scandal = Math.max(0, st.scandal - 10);
    ctx.save("person_states", st);
  }
  if (party) {
    party.reputation = Math.max(0, Math.round((party.reputation - repHit * (target ? 0.25 : 0.6)) * 10) / 10);
    if (inv.stage === "DESFECHO" && inv.outcome === "CONDENADO") party.integrity = Math.max(0, Math.round((party.integrity - (target ? 0.04 : 0.08)) * 1000) / 1000);
    else if (inv.stage === "INVESTIGACAO") party.integrity = Math.max(0, Math.round((party.integrity - 0.01) * 1000) / 1000);
    ctx.save("parties", party);
  }
  if (inv.outcome === "CONDENADO" && inv.stage === "DESFECHO") {
    if (target) inv.sentence = applyConviction(ctx, target, inv);
    else if (party) applyPartySanction(ctx, party, inv);
    ctx.save("investigations", inv);
  }
  const ev = ctx.emit("INVESTIGATION_STAGE", { actors: target ? [target.id] : [], geography: target?.uf ?? "BR", payload: { stage: inv.stage, outcome: inv.outcome, evidence: inv.evidence, party: inv.party_id } });
  publishScandal(ctx, inv, ev.id);
  const label = `${STAGE_LABEL[inv.stage]}${inv.outcome ? `: ${inv.outcome.toLowerCase()}` : ""}`;
  if (target) ctx.notify(target.id, `Investigação: ${label}`, inv.outcome ? outcomeText(inv) : `O caso avançou para "${STAGE_LABEL[inv.stage]}". ${inv.measures.length ? `Última medida: ${inv.measures[inv.measures.length - 1].text.toLowerCase()}.` : ""}`, "/jogo/investigacoes");
  else if (party?.president_id) ctx.notify(party.president_id, `Caso do ${party.acronym}: ${label}`, inv.outcome ? outcomeText(inv) : "A apuração sobre o partido avançou.", "/jogo/investigacoes");
  if (inv.opened_by) ctx.notify(inv.opened_by, `Caso ${target?.name ?? party?.acronym ?? ""}: ${label}`, inv.outcome ? outcomeText(inv) : "O caso que você denunciou avançou.", "/jogo/investigacoes");

  // Colaboração: cúmplice pouco leal pode entregar outros envolvidos
  if (inv.stage === "INVESTIGACAO") {
    for (const act of acts) {
      for (const partnerId of act.partners) {
        const partner = ctx.person(partnerId);
        const loyalty = ctx.pstate(partnerId)?.traits.loyalty ?? 0.5;
        if (canBeTargeted(partner) && rng.chance((1 - loyalty) * 0.5)) {
          openInvestigation(ctx, partner, { authority: "PF", initialEvidence: 0.3, actIds: [], reason: `Citado(a) em colaboração no caso de ${target?.name ?? party?.acronym}`, channel: "COLABORACAO" });
          measure(ctx, inv, "ACORDO", `${partner.name} (${partner.role_label ?? "envolvido"}) fecha acordo de colaboração`);
          inv.evidence = Math.min(1, inv.evidence + 0.12);
          ctx.save("investigations", inv);
        }
      }
    }
    // caso de partido também mira quem praticou os atos
    if (!target) {
      for (const act of acts) {
        const author = ctx.person(act.person_id);
        if (canBeTargeted(author) && rng.chance(0.6)) openInvestigation(ctx, author, { authority: "PF", initialEvidence: 0.25, actIds: [act.id], reason: `Apontado(a) na apuração sobre o ${party?.acronym ?? "partido"}`, channel: "COLABORACAO" });
      }
    }
  }

  if (inv.outcome && inv.stage === "DESFECHO" && inv.opened_by) {
    const reporter = ctx.person(inv.opened_by);
    if (reporter) {
      reporter.reputation = Math.max(0, Math.min(100, reporter.reputation + (inv.outcome === "CONDENADO" ? 6 : inv.outcome === "ARQUIVADO" ? -4 : -2)));
      ctx.save("persons", reporter);
    }
  }
}

function outcomeText(inv: InvestigationRow): string {
  if (inv.outcome === "ARQUIVADO") return "O caso foi arquivado por falta de provas.";
  if (inv.outcome === "ABSOLVIDO") return "Absolvição: o tribunal considerou as provas insuficientes.";
  const s = inv.sentence;
  if (!s) return "Condenação.";
  const parts = [s.years > 0 ? `${s.years} ano(s) de pena em regime ${s.regime.toLowerCase().replace("_", " ")}` : "sem pena de prisão"];
  if (s.fine) parts.push(`multa de R$ ${Math.round(s.fine).toLocaleString("pt-BR")}`);
  if (s.cassation) parts.push("cassação do mandato ou do registro");
  if (s.ineligible_until) parts.push(`inelegível até ${s.ineligible_until.split("-").reverse().join("/")}`);
  return `Condenação: ${parts.join(", ")}.`;
}

function genericEvidence(i: number): string {
  return [
    "Quebra de sigilo bancário identifica movimentações atípicas",
    "Testemunha presta depoimento",
    "Perícia analisa documentos apreendidos",
    "Relatório de inteligência financeira é anexado ao caso",
    "Mensagens extraídas de celular são analisadas",
    "Auditoria encontra inconsistências em prestação de contas",
  ][i];
}

/** Calcula e aplica a pena: prisão (com progressão de regime), multa, inelegibilidade e cassação. */
function applyConviction(ctx: Ctx, target: PersonRow, inv: InvestigationRow): Sentence {
  const rng = ctx.rng("sentence", inv.id);
  const year = Number(ctx.date.slice(0, 4));
  const era = eraRules(year);
  const acts = inv.act_ids.map((id) => ctx.t.illicit_acts.get(id)).filter((a): a is IllicitActRow => !!a);
  const charges = inv.crimes.length ? inv.crimes : (["PROPINA"] as ChargeKind[]);
  let years = 0;
  for (const c of charges) {
    const [lo, hi] = penaltyYears(c, year);
    if (hi <= 0) continue;
    years += lo + (hi - lo) * Math.min(1, inv.evidence * 0.6 + rng.range(0, 0.3));
  }
  years = Math.min(30, Math.round(years * 10) / 10);
  const regime: Sentence["regime"] = years <= 0 ? "SEM_PRISAO" : years > 8 ? "FECHADO" : years > 4 ? "SEMIABERTO" : "ABERTO";
  const fine = Math.round(acts.reduce((s, a) => s + a.amount * (CRIMES[a.kind]?.penalty.fineMult ?? 1), 0));
  const cassation = charges.some((c) => c !== "ORGANIZACAO_CRIMINOSA" && CRIMES[c].penalty.cassation) || regime === "FECHADO";
  const makesIneligible = charges.some((c) => c === "ORGANIZACAO_CRIMINOSA" || CRIMES[c].penalty.ineligible);
  // Ficha Limpa: da condenação colegiada até 8 anos após cumprir a pena; antes de 2012, 3 anos
  const ineligibleYears = makesIneligible ? (era.fichaLimpa ? Math.ceil(years) + 8 : 3) : 0;
  const sentence: Sentence = {
    years,
    regime,
    fine,
    ineligible_until: ineligibleYears ? addMonths(ctx.date, ineligibleYears * 12) : null,
    cassation,
    charges,
  };
  const st = ctx.pstate(target.id);
  if (st) {
    if (sentence.ineligible_until && (!st.ineligible_until || st.ineligible_until < sentence.ineligible_until)) st.ineligible_until = sentence.ineligible_until;
    st.money -= fine;
    if (st.money < 0) {
      st.debt += -st.money;
      st.money = 0;
    }
    // perdimento: o dinheiro do crime é confiscado
    st.dirty_money = 0;
    // regime fechado: progressão depois de cerca de um sexto da pena (Lei 13.964/2019: 16%)
    if (regime === "FECHADO") st.jailed_until = addDays(ctx.date, Math.round(years * 365 * 0.16));
    st.sentence = sentence;
    ctx.save("person_states", st);
  }
  if (cassation) {
    for (const m of ctx.t.mandates.values()) {
      if (m.person_id === target.id && (m.status === "ATIVO" || m.status === "FUTURO")) {
        m.status = "ENCERRADO";
        m.end_on = ctx.date;
        ctx.save("mandates", m);
      }
    }
    if (target.office_code) {
      target.office_code = null;
      target.office_geo = null;
      target.stage = target.party_id ? "QUADRO" : "CIDADAO";
    }
  }
  for (const c of ctx.t.candidacies.values()) {
    if (c.person_id === target.id && (c.status === "PRE" || c.status === "HOMOLOGADA" || c.status === "SEGUNDO_TURNO") && (sentence.ineligible_until || cassation)) {
      c.status = "INDEFERIDA";
      c.note = era.fichaLimpa ? "Indeferida: condenação por órgão colegiado (Ficha Limpa)" : "Indeferida por condenação";
      ctx.save("candidacies", c);
    }
  }
  if (target.kind === "FICTIONAL_GENERATED") {
    target.status = "RETIRED";
    target.status_note = "Condenado(a) na simulação; afastado(a) da vida pública.";
  }
  ctx.save("persons", target);
  return sentence;
}

/** Partido condenado: devolve recursos, paga multa e perde cotas do fundo partidário (Lei 9.096/95, art. 37). */
function applyPartySanction(ctx: Ctx, party: PartyRow, inv: InvestigationRow): void {
  const acts = inv.act_ids.map((id) => ctx.t.illicit_acts.get(id)).filter((a): a is IllicitActRow => !!a);
  const amount = acts.reduce((s, a) => s + a.amount, 0);
  const fine = Math.round(amount * 0.2);
  party.cash = Math.max(0, party.cash - amount - fine);
  const months = ctx.rng("party-sanction", inv.id).int(1, 12);
  party.fund_suspended_until = addMonths(ctx.date, months);
  inv.sentence = { years: 0, regime: "SEM_PRISAO", fine: amount + fine, ineligible_until: null, cassation: false, charges: inv.crimes };
  ctx.save("parties", party);
}

// ---------------------------------------------------------------------------
// Mensal: esquemas em andamento, crimes de personagens fictícios e ofertas
// ---------------------------------------------------------------------------

/** Pesos de oportunidade por conduta (personagens fictícios). */
function npcWeight(ctx: Ctx, p: PersonRow, kind: IllicitKind): number {
  const def = CRIMES[kind];
  if (def.offices.length) return 3;
  if (["COMPRA_VOTOS", "ABUSO_PODER_ECONOMICO", "USO_MAQUINA", "DESINFORMACAO"].includes(kind)) return 4;
  if (kind === "CAIXA_DOIS") return liveCandidacy(ctx, p.id) ? 4 : 1.5;
  if (kind === "LAVAGEM") return 2;
  return 1;
}

const NPC_KINDS = (Object.keys(CRIMES) as IllicitKind[]).filter((k) => k !== "OBSTRUCAO_JUSTICA" && k !== "ENRIQUECIMENTO_ILICITO");

export function monthlyCrime(ctx: Ctx): void {
  const dirtyByParty = new Map<string, number>();
  for (const a of ctx.t.illicit_acts.values()) if (!a.discovered && a.party_id) dirtyByParty.set(a.party_id, (dirtyByParty.get(a.party_id) ?? 0) + 1);

  // Esquemas recorrentes rendem mais um mês (e deixam mais rastro)
  for (const act of ctx.t.illicit_acts.values()) {
    if (!act.ongoing || act.discovered) continue;
    const owner = ctx.person(act.person_id);
    const st = ctx.pstate(act.person_id);
    // perdeu o cargo: o esquema acaba sozinho
    if (!owner || owner.status !== "ACTIVE" || (CRIMES[act.kind].offices.length && !owner.office_code)) {
      stopScheme(ctx, act);
      continue;
    }
    act.amount += act.monthly_gain;
    act.recurrence += 1;
    act.paper_trail = Math.min(0.95, act.paper_trail + 0.02);
    if (ctx.rng("scheme-witness", act.id).chance(0.25)) act.witnesses += 1;
    act.value_relative = Math.min(1, act.amount / (2_000_000 * worldPriceLevel(ctx.world)));
    ctx.save("illicit_acts", act);
    if (st) {
      if (act.kind === "NEPOTISMO") st.money += act.monthly_gain;
      else st.dirty_money += act.monthly_gain;
      ctx.save("person_states", st);
    }
  }

  for (const p of ctx.t.persons.values()) {
    if (p.status !== "ACTIVE") continue;
    const st = ctx.pstate(p.id);
    if (!st) continue;
    const party = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
    const contagion = party ? 1 + 2 * (0.5 - party.integrity) + Math.min(1, (dirtyByParty.get(party.id) ?? 0) * 0.1) : 1;
    const opportunity = p.office_code ? 2.5 : p.stage === "CANDIDATO" ? 2 : 1;

    if (p.kind === "FICTIONAL_GENERATED" && (p.party_id || p.office_code)) {
      const rng = ctx.rng("npc-crime", p.id);
      const prob = 0.018 * st.traits.riskTolerance * st.traits.ambition * opportunity * contagion;
      if (rng.chance(prob)) {
        const options = NPC_KINDS.filter((k) => crimeOpportunity(ctx, p, k) === null);
        if (options.length) {
          const kind = rng.weighted(options, (k) => npcWeight(ctx, p, k));
          commitCrime(ctx, p, kind);
        }
      }
      // quem acumula dinheiro sujo tenta lavá-lo
      if (st.dirty_money > 200_000 * worldPriceLevel(ctx.world) && rng.chance(0.15)) {
        const amount = Math.round(st.dirty_money * rng.range(0.3, 0.7));
        commitCrime(ctx, p, "LAVAGEM", { amount, description: "Lavagem por meio de empresa de fachada" });
        st.dirty_money = Math.max(0, st.dirty_money - amount);
        st.money += Math.round(amount * 0.7);
        ctx.save("person_states", st);
      }
    }

    if (p.kind === "PLAYER" && p.status === "ACTIVE" && !isJailed(st, ctx.date)) {
      const rng = ctx.rng("offer", p.id);
      st.offers = st.offers.filter((o) => o.expires_tick > ctx.tick);
      if (st.offers.length >= 2) continue;
      const exposure = p.office_code ? 0.18 : p.stage === "CANDIDATO" || p.stage === "PRE_CANDIDATO" ? 0.14 : p.party_id ? 0.05 : 0.01;
      if (!rng.chance(exposure * contagion)) continue;
      const broker = findOrCreateBroker(ctx, p.uf, rng.chance(0.5) ? party : undefined);
      const kind: Offer["kind"] = p.office_code ? "PROPINA" : "CAIXA_DOIS";
      const amount = Math.round((rng.range(30_000, 400_000) * (p.office_code ? 2 : 1) * worldPriceLevel(ctx.world)) / 1000) * 1000;
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

/** Lista de atos de um jogador, com os esquemas em andamento primeiro (para telas). */
export function schemesOf(ctx: Ctx, personId: string): IllicitActRow[] {
  return [...ctx.t.illicit_acts.values()].filter((a) => a.person_id === personId).sort((a, b) => Number(b.ongoing) - Number(a.ongoing) || b.created_on.localeCompare(a.created_on));
}

/** Chance estimada de condenação de um caso aberto (para a tela). */
export function convictionChance(inv: InvestigationRow): number {
  const score = inv.evidence - inv.defense * 0.35;
  return Math.max(0.02, Math.min(0.98, 1 / (1 + Math.exp(-(score - 0.55) / 0.1))));
}

export { LEGISLATIVE as LEGISLATIVE_OFFICES };
