import { checkAchievements } from "./achievements";
import { affiliationCooldown, infidelityRisk, joinParty, leaveParty, loseMandateForInfidelity, relKey, requestAffiliation } from "./affiliation";
import { addDays, formatDatePt } from "./calendar";
import {
  canBeTargeted,
  commitCrime,
  createIllicitAct,
  crimeOpportunity,
  dossierLabel,
  gatherIntel,
  isJailed,
  openInvestigation,
  partyLedBy,
  respondToOffer,
  stopScheme,
  type SchemeResult,
} from "./crime";
import { CRIMES, type IllicitKind } from "./crimes";
import { worldPriceLevel } from "./finance";
import { checkEligibility, emptyCampaign, ensureRace, geoName, tallyMajoritarian, ufOfGeo } from "./elections";
import { canonicalGeo, capitalId, isMunicipality, UF_BY_CODE, UF_CODES } from "./geo";
import { POLICY_CATALOG, startPolicy } from "./government";
import { AXES, AXIS_INFO, clampAxis, ideologyAffinity, type Axis } from "./ideology";
import { moderateText } from "./news/moderation";
import { isReal } from "./news/policy";
import {
  addSignatures,
  decideJoinRequest,
  ENTRY_OPTIONS,
  formationProgress,
  foundingCost,
  foundParty,
  inviteToParty,
  joinOwnParty,
  PARTY_COLORS,
  partyFoundedBy,
  partyInFormationBy,
  signatureCost,
  validateFounding,
} from "./partyfounding";
import { profession } from "./names";
import { fundableCandidacies, giveFefc, indicableMembers, indicateCandidate, indicationElection, pendingIndications, withdrawIndication } from "./partycampaign";
import type { Rng } from "./rng";
import { StoryCtx } from "./story/context";
import { closeStory, promote } from "./story/state";
import { reachScale, reputationGain, standingGain } from "./story/effects";
import { afterAction } from "./story/hooks";
import { endCareer } from "./story/life";
import { eraRules, OFFICES, type OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import type { CandidacyRow, EntryCulture, ElectionRow, PersonRow, PersonStateRow, RaceRow } from "./types";

export type ActionCategory = "BASE" | "PARTIDO" | "MEU_PARTIDO" | "CAMPANHA" | "MANDATO" | "INVESTIGACAO" | "ESQUEMA" | "FINANCAS";

export interface ActionParam {
  name: string;
  label: string;
  type:
    | "party"
    | "person"
    | "uf"
    | "uf_br"
    | "axis"
    | "choice"
    | "text"
    | "number"
    | "amount"
    | "faction"
    | "office"
    | "bill"
    | "offer"
    | "request"
    | "party_request"
    | "recruit"
    | "scheme"
    | "policy"
    | "debate"
    | "member"
    | "indication"
    | "party_candidacy"
    | "fund_share";
  options?: Array<{ value: string; label: string }>;
  /** valores de referência (R$ de 2026) para type "amount"; a tela corrige pela época */
  amounts?: number[];
  optional?: boolean;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  effects?: Record<string, number | string>;
}

interface RunArgs {
  ctx: Ctx;
  p: PersonRow;
  st: PersonStateRow;
  params: Record<string, string>;
  rng: Rng;
  dr: (key: string) => number;
}

export interface ActionDef {
  id: string;
  label: string;
  description: string;
  category: ActionCategory;
  energy: number;
  cost?: number;
  /** custo que depende da época ou da situação */
  costFn?: (ctx: Ctx, p: PersonRow, st: PersonStateRow) => number;
  /** conduta ilícita que a ação representa (a tela mostra a lei e o aviso) */
  crime?: IllicitKind;
  /** pede confirmação antes de executar (ações irreversíveis) */
  confirm?: string;
  params?: ActionParam[];
  /** null = disponível; string = motivo da indisponibilidade */
  available: (ctx: Ctx, p: PersonRow, st: PersonStateRow) => string | null;
  run: (a: RunArgs) => ActionResult;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const fmtMoney = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

/** Valor de referência (R$ de 2026) corrigido para o nível de preços do dia. */
export function scaledAmount(ctx: Ctx, base: number): number {
  return Math.round((base * worldPriceLevel(ctx.world)) / 1000) * 1000;
}

/** Valor escolhido numa lista de type "amount" (aceita só as opções oferecidas). */
function pickAmount(ctx: Ctx, raw: string | undefined, bases: number[]): number | null {
  const v = Math.round(Number(raw));
  const allowed = bases.map((b) => scaledAmount(ctx, b));
  return allowed.includes(v) ? v : null;
}

/** Paga primeiro com dinheiro não declarado e completa com o declarado. */
function payDirtyFirst(st: PersonStateRow, amount: number): void {
  const fromDirty = Math.min(st.dirty_money, amount);
  st.dirty_money -= fromDirty;
  st.money -= amount - fromDirty;
}

function addReach(st: PersonStateRow, uf: string, amount: number): void {
  st.reach[uf] = Math.min(0.98, (st.reach[uf] ?? 0) + amount * (1 - (st.reach[uf] ?? 0) * 0.6));
}

function bumpRelationship(ctx: Ctx, a: string, b: string, delta: number): number {
  const id = relKey(a, b);
  const rel = ctx.t.relationships.get(id) ?? { id, world_id: ctx.world.id, a_id: a, b_id: b, score: 0, interactions: 0, last_on: ctx.date };
  rel.score = clamp(rel.score + delta, -100, 100);
  rel.interactions += 1;
  rel.last_on = ctx.date;
  ctx.save("relationships", rel);
  return rel.score;
}

/** Eleição corrente (pré-campanha a 2º turno) para o cargo/escopo. */
export function currentElection(ctx: Ctx): ElectionRow | undefined {
  return [...ctx.t.elections.values()]
    .filter((e) => e.status !== "AGENDADA" && e.status !== "ENCERRADA")
    .sort((a, b) => a.year - b.year)[0];
}

export function nextElection(ctx: Ctx): ElectionRow | undefined {
  return [...ctx.t.elections.values()].filter((e) => e.status !== "ENCERRADA").sort((a, b) => a.year - b.year)[0];
}

export function activeCandidacy(ctx: Ctx, personId: string): CandidacyRow | undefined {
  return [...ctx.t.candidacies.values()].find(
    (c) => c.person_id === personId && ["PRE", "HOMOLOGADA", "SEGUNDO_TURNO"].includes(c.status) && ctx.t.elections.get(c.election_id)?.status !== "ENCERRADA",
  );
}

function campaignOpen(ctx: Ctx, p: PersonRow): CandidacyRow | string {
  const c = activeCandidacy(ctx, p.id);
  if (!c || (c.status !== "HOMOLOGADA" && c.status !== "SEGUNDO_TURNO")) return "Disponível apenas com candidatura homologada.";
  const e = ctx.t.elections.get(c.election_id)!;
  if (ctx.date < e.calendar.campaignStart) return `A campanha oficial começa em ${formatDatePt(e.calendar.campaignStart)}.`;
  if (c.status === "HOMOLOGADA" && e.status === "SEGUNDO_TURNO") return "Sua disputa terminou no 1º turno.";
  return c;
}

function campaignUfs(c: CandidacyRow): string[] {
  return c.geo === "BR" ? UF_CODES : [ufOfGeo(c.geo)];
}

const ufOptions = () => UF_CODES.map((u) => ({ value: u, label: `${u} — ${UF_BY_CODE[u].name}` }));
const axisOptions = () => AXES.map((a) => ({ value: a, label: AXIS_INFO[a].label }));
const sideOptions = (a?: Axis) => [
  { value: "-1", label: a ? AXIS_INFO[a].neg : "primeiro extremo" },
  { value: "1", label: a ? AXIS_INFO[a].pos : "segundo extremo" },
];

function spend(ctx: Ctx, p: PersonRow, st: PersonStateRow, amount: number, description: string, c?: CandidacyRow): void {
  if (!amount) return;
  if (c) {
    const fromCampaign = Math.min(amount, Math.max(0, c.campaign.budget - c.campaign.spent));
    c.campaign.spent += fromCampaign;
    const rest = amount - fromCampaign;
    if (rest > 0) st.money -= rest;
    ctx.save("candidacies", c);
  } else {
    st.money -= amount;
  }
  ctx.insert("finance_transactions", {
    id: ctx.id("fin", p.id),
    world_id: ctx.world.id,
    person_id: p.id,
    candidacy_id: c?.id ?? null,
    kind: "DESPESA",
    amount: -amount,
    declared: true,
    game_date: ctx.date,
    description,
  });
}

function campaignFunds(st: PersonStateRow, c?: CandidacyRow): number {
  return st.money + (c ? Math.max(0, c.campaign.budget - c.campaign.spent) : 0);
}

const CAMPAIGN_STAGE_REASON = (ctx: Ctx, p: PersonRow) => {
  const r = campaignOpen(ctx, p);
  return typeof r === "string" ? r : null;
};

function campaignAction(
  id: string,
  label: string,
  description: string,
  energy: number,
  cost: number,
  effect: (a: RunArgs, c: CandidacyRow) => string,
  params?: ActionParam[],
): ActionDef {
  return {
    id,
    label,
    description,
    category: "CAMPANHA",
    energy,
    cost,
    params,
    available: (ctx, p, st) => CAMPAIGN_STAGE_REASON(ctx, p) ?? (campaignFunds(st, activeCandidacy(ctx, p.id)) < cost ? `Recursos insuficientes (${fmtMoney(cost)}).` : null),
    run: (a) => {
      const c = campaignOpen(a.ctx, a.p) as CandidacyRow;
      spend(a.ctx, a.p, a.st, cost, label, c);
      const msg = effect(a, c);
      a.ctx.save("candidacies", c);
      return { ok: true, message: msg };
    },
  };
}

export const ACTIONS: ActionDef[] = [
  // ------------------------------------------------------------------ BASE
  {
    id: "trabalhar",
    label: "Pegar trabalho extra na sua profissão",
    description: "Plantões, consultorias e serviços avulsos além do salário que já cai todo mês. Rende menos se repetir muito.",
    category: "BASE",
    energy: 25,
    available: () => null,
    run: ({ ctx, p, st, dr }) => {
      const income = Math.round(profession(professionIdOf(p)).income * worldPriceLevel(ctx.world) * 0.2 * (0.5 + 0.5 * dr("trabalhar")));
      st.money += income;
      st.income_last_year += income;
      ctx.insert("finance_transactions", { id: ctx.id("fin", p.id), world_id: ctx.world.id, person_id: p.id, candidacy_id: null, kind: "RENDA", amount: income, declared: true, game_date: ctx.date, description: "Trabalho extra" });
      return { ok: true, message: `Trabalho extra feito: ${fmtMoney(income)} a mais na conta.`, effects: { dinheiro: income } };
    },
  },
  {
    id: "evento_local",
    label: "Participar de evento comunitário",
    description: "Associações de bairro, audiências públicas e festas locais. Constrói reputação e contatos.",
    category: "BASE",
    energy: 15,
    available: () => null,
    run: ({ ctx, p, st, rng, dr }) => {
      const f = dr("evento_local");
      p.reputation = clamp(p.reputation + 2 * f);
      addReach(st, p.uf, 0.01 * f);
      st.activism += 5 * f;
      const locals = [...ctx.t.persons.values()].filter((x) => x.uf === p.uf && x.kind !== "PLAYER" && x.status === "ACTIVE" && x.party_id);
      let met = "";
      if (locals.length && rng.chance(0.6)) {
        const who = rng.pick(locals);
        bumpRelationship(ctx, p.id, who.id, 4 + 4 * f);
        met = ` Você conheceu ${who.name} (${who.role_label ?? ctx.t.parties.get(who.party_id!)?.acronym ?? ""}).`;
      }
      promote(p, st);
      return { ok: true, message: `Sua presença foi notada no evento.${met}`, effects: { reputacao: +(2 * f).toFixed(1) } };
    },
  },
  {
    id: "voluntariado",
    label: "Voluntariado em uma causa",
    description: "Engaje-se em um movimento. Aumenta ativismo e aproxima você de quem pensa parecido.",
    category: "BASE",
    energy: 20,
    params: [
      { name: "axis", label: "Tema", type: "axis", options: axisOptions() },
      { name: "side", label: "Lado", type: "choice", options: sideOptions() },
    ],
    available: () => null,
    run: ({ p, st, params, dr }) => {
      const axis = params.axis as Axis;
      const side = Number(params.side) >= 0 ? 1 : -1;
      const f = dr(`voluntariado:${axis}`);
      st.activism += 8 * f;
      p.reputation = clamp(p.reputation + 1 * f);
      p.ideology[axis] = clampAxis(p.ideology[axis] + side * 3);
      st.political_capital = clamp(st.political_capital + 2 * f);
      promote(p, st);
      return { ok: true, message: `Você se engajou na causa: ${side > 0 ? AXIS_INFO[axis].pos : AXIS_INFO[axis].neg}.` };
    },
  },
  {
    id: "artigo",
    label: "Publicar artigo de opinião",
    description: "Ganha visibilidade. Posições distantes do eleitorado local podem gerar polêmica.",
    category: "BASE",
    energy: 10,
    params: [
      { name: "axis", label: "Tema", type: "axis", options: axisOptions() },
      { name: "side", label: "Posição", type: "choice", options: sideOptions() },
    ],
    available: () => null,
    run: ({ ctx, p, st, params, rng, dr }) => {
      const axis = params.axis as Axis;
      const side = Number(params.side) >= 0 ? 1 : -1;
      const f = dr("artigo");
      const segs = [...ctx.t.voter_segments.values()].filter((s) => s.uf === p.uf);
      const median = segs.reduce((s, sg) => s + sg.ideology[axis] * sg.weight, 0);
      const aligned = Math.sign(median) === side || Math.abs(median) < 10;
      p.visibility = clamp(p.visibility + (aligned ? 2 : 4) * f);
      addReach(st, p.uf, 0.006 * f);
      if (!aligned && rng.chance(0.4)) {
        p.reputation = clamp(p.reputation - 1.5);
        return { ok: true, message: "O artigo viralizou — mas dividiu opiniões. Mais gente sabe quem você é; nem todos gostaram." };
      }
      p.reputation = clamp(p.reputation + (aligned ? 1 : 0) * f);
      return { ok: true, message: "Seu artigo foi bem recebido." };
    },
  },
  {
    id: "reuniao_partidaria",
    label: "Ir a uma reunião aberta de partido",
    description: "Conheça a máquina partidária por dentro e as lideranças locais.",
    category: "BASE",
    energy: 15,
    params: [{ name: "party", label: "Partido", type: "party" }],
    available: () => null,
    run: ({ ctx, p, params, rng, dr }) => {
      const party = ctx.t.parties.get(params.party);
      if (!party) return { ok: false, message: "Partido inválido." };
      const f = dr(`reuniao:${party.id}`);
      const locals = [...ctx.t.persons.values()].filter((x) => x.party_id === party.id && x.uf === p.uf && x.status === "ACTIVE" && x.kind !== "PLAYER");
      if (!locals.length) return { ok: true, message: `O ${party.acronym} tem pouca estrutura em ${p.uf}; a reunião foi esvaziada.` };
      const who = rng.weighted(locals, (x) => (x.kind === "FICTIONAL_GENERATED" ? 3 : 1));
      const aff = ideologyAffinity(p.ideology, party.ideology);
      const score = bumpRelationship(ctx, p.id, who.id, (4 + aff * 8) * f);
      if (p.stage === "CIDADAO" || p.stage === "ATIVISTA") p.stage = "APROXIMACAO";
      return { ok: true, message: `Você conversou com ${who.name} (${who.role_label ?? party.acronym}). Relação: ${Math.round(score)}.` };
    },
  },
  {
    id: "conversar",
    label: "Conversar com uma liderança",
    description: "Construa relacionamento com políticos da sua UF. Alguns partidos só filiam quem tem padrinho.",
    category: "BASE",
    energy: 10,
    params: [{ name: "target", label: "Pessoa", type: "person" }],
    available: () => null,
    run: ({ ctx, p, st, params, dr }) => {
      const t = ctx.person(params.target);
      if (!t || t.id === p.id || t.status !== "ACTIVE") return { ok: false, message: "Pessoa indisponível." };
      if (t.uf !== p.uf && t.tier > 1) return { ok: false, message: "Você só alcança lideranças da sua UF (ou nacionais)." };
      const f = dr(`conversar:${t.id}`);
      const aff = ideologyAffinity(p.ideology, t.ideology);
      const gain = (3 + st.traits.charisma * 6 + (aff - 0.6) * 15) * f * (t.tier === 1 ? 0.4 : 1);
      const score = bumpRelationship(ctx, p.id, t.id, gain);
      return { ok: true, message: `Conversa com ${t.name}. Relação agora: ${Math.round(score)}.` };
    },
  },
  {
    id: "curso",
    label: "Curso de formação política",
    description: "Oratória, orçamento público e legislação eleitoral. Melhora preparo para debates.",
    category: "BASE",
    energy: 20,
    cost: 1500,
    available: (_c, _p, st) => (st.money < 1500 ? "Custa R$ 1.500." : null),
    run: ({ ctx, p, st, dr }) => {
      const f = dr("curso");
      st.money -= 1500;
      st.debate_prep = clamp(st.debate_prep + 8 * f);
      st.traits.competence = Math.min(0.95, st.traits.competence + 0.01 * f);
      ctx.insert("finance_transactions", { id: ctx.id("fin", p.id), world_id: ctx.world.id, person_id: p.id, candidacy_id: null, kind: "DESPESA", amount: -1500, declared: true, game_date: ctx.date, description: "Curso de formação política" });
      return { ok: true, message: "Você concluiu o módulo do curso." };
    },
  },
  {
    id: "pedir_filiacao",
    label: "Pedir filiação a um partido",
    description: "O diretório avalia afinidade, reputação, relacionamento, necessidade do partido, alas e escândalos.",
    category: "BASE",
    energy: 5,
    params: [{ name: "party", label: "Partido", type: "party" }],
    available: (ctx, p) => {
      if (p.party_id) return "Você já é filiado(a). Desfilie-se antes.";
      if ([...ctx.t.affiliation_requests.values()].some((r) => r.person_id === p.id && r.status === "PENDENTE" && r.kind === "PEDIDO")) return "Você já tem um pedido em análise.";
      return null;
    },
    run: ({ ctx, p, params }) => {
      const party = ctx.t.parties.get(params.party);
      if (!party || party.status !== "ATIVO") return { ok: false, message: "Partido inválido." };
      const wait = affiliationCooldown(ctx, p, party);
      if (wait) return { ok: false, message: wait };
      const req = requestAffiliation(ctx, p, party);
      const president = party.founder_id ? ctx.person(party.president_id) : undefined;
      if (president?.kind === "PLAYER") {
        req.decide_on = addDays(ctx.date, 30);
        ctx.save("affiliation_requests", req);
        ctx.notify(president.id, `Pedido de filiação ao ${party.acronym}`, `${p.name} (jogador, ${p.uf}) quer entrar no partido.`, "/jogo/meu-partido");
        return { ok: true, message: `Pedido enviado à presidência do ${party.acronym}, que tem até ${formatDatePt(req.decide_on)} para responder.` };
      }
      return { ok: true, message: `Pedido enviado ao ${party.acronym}. A direção vai analisar seu perfil, conversar com quem conhece você e responder até ${formatDatePt(req.decide_on)}.` };
    },
  },
  {
    id: "responder_convite",
    label: "Responder a convite de filiação",
    description: "Aceite ou recuse um convite recebido.",
    category: "BASE",
    energy: 0,
    params: [
      { name: "request", label: "Convite", type: "request" },
      { name: "decision", label: "Decisão", type: "choice", options: [{ value: "ACEITAR", label: "Aceitar" }, { value: "RECUSAR", label: "Recusar" }] },
    ],
    available: (ctx, p) => ([...ctx.t.affiliation_requests.values()].some((r) => r.person_id === p.id && r.kind === "CONVITE" && r.status === "PENDENTE") ? null : "Nenhum convite pendente."),
    run: ({ ctx, p, st, params }) => {
      const req = ctx.t.affiliation_requests.get(params.request);
      if (!req || req.person_id !== p.id || req.status !== "PENDENTE") return { ok: false, message: "Convite inválido." };
      const party = ctx.t.parties.get(req.party_id)!;
      if (params.decision === "ACEITAR") {
        req.status = "ACEITO";
        ctx.save("affiliation_requests", req);
        joinParty(ctx, p, party);
        closeStory(st, "convite_filiacao", "req", req.id, ctx.date, `Aceitar e se filiar ao ${party.acronym}`, `Você aceitou o convite e se filiou ao ${party.acronym}.`);
        return { ok: true, message: `Bem-vindo(a) ao ${party.acronym}!` };
      }
      req.status = "RECUSADO";
      ctx.save("affiliation_requests", req);
      closeStory(st, "convite_filiacao", "req", req.id, ctx.date, "Recusar o convite", `Você recusou o convite do ${party.acronym}.`);
      return { ok: true, message: "Convite recusado." };
    },
  },
  {
    id: "aposentar",
    confirm: "Você vai encerrar a carreira deste personagem. Ele deixa cargos, candidaturas e o partido, e o jogo mostra o balanço da trajetória. Não dá para desfazer.",
    label: "Encerrar a carreira",
    description: "Anunciar a aposentadoria da vida pública. A trajetória vira um balanço final com cargos, eleições, conquistas e escândalos.",
    category: "BASE",
    energy: 0,
    available: () => null,
    run: ({ ctx, p, st }) => {
      const c = new StoryCtx(ctx, p, st, ctx.rng("aposentar", p.id));
      endCareer(c, "APOSENTADORIA", "aposentadoria anunciada");
      return { ok: true, message: "Você anunciou que deixa a vida pública. Veja o balanço da sua carreira." };
    },
  },
  {
    id: "desfiliar",
    confirm: "Você vai deixar o partido. Com mandato proporcional, fora da janela partidária, perde o cargo.",
    label: "Desfiliar-se do partido",
    description: "Sair do partido. Fora da janela partidária, parlamentares podem perder o mandato por infidelidade.",
    category: "PARTIDO",
    energy: 5,
    available: (_c, p) => (p.party_id ? null : "Você não é filiado(a)."),
    run: ({ ctx, p }) => {
      const party = ctx.t.parties.get(p.party_id!)!;
      const loses = infidelityRisk(ctx, p);
      leaveParty(ctx, p, "desfiliação voluntária");
      if (loses) {
        loseMandateForInfidelity(ctx, p);
        return { ok: true, message: `Você deixou o ${party.acronym} fora da janela partidária e perdeu o mandato por infidelidade partidária.` };
      }
      return { ok: true, message: `Você deixou o ${party.acronym}.` };
    },
  },
  // ------------------------------------------------------------------ PARTIDO
  {
    id: "militancia",
    label: "Trabalho de base para o partido",
    description: "Panfletagem, reuniões e organização. Aumenta seu prestígio interno.",
    category: "PARTIDO",
    energy: 20,
    available: (_c, p) => (p.party_id ? null : "Requer filiação."),
    run: ({ ctx, p, st, dr }) => {
      const f = dr("militancia");
      st.party_standing = clamp(st.party_standing + 4 * f);
      st.activism += 3 * f;
      addReach(st, p.uf, 0.005 * f);
      if (p.faction_id) {
        const fac = ctx.t.factions.get(p.faction_id);
        if (fac?.leader_id) bumpRelationship(ctx, p.id, fac.leader_id, 3 * f);
      }
      promote(p, st);
      return { ok: true, message: `Prestígio interno: ${Math.round(st.party_standing)}.` };
    },
  },
  {
    id: "aproximar_faccao",
    label: "Aproximar-se de uma ala interna",
    description: "Alas disputam diretórios, recursos e candidaturas. Escolha seu grupo.",
    category: "PARTIDO",
    energy: 10,
    params: [{ name: "faction", label: "Ala", type: "faction" }],
    available: (_c, p) => (p.party_id ? null : "Requer filiação."),
    run: ({ ctx, p, st, params }) => {
      const fac = ctx.t.factions.get(params.faction);
      if (!fac || fac.party_id !== p.party_id) return { ok: false, message: "Ala inválida." };
      p.faction_id = fac.id;
      st.party_standing = clamp(st.party_standing + 2 * fac.strength * 5);
      return { ok: true, message: `Você agora integra a ${fac.name}.` };
    },
  },
  {
    id: "contribuir_partido",
    label: "Contribuir financeiramente com o partido",
    description: "Doação declarada ao partido. Abre portas na direção.",
    category: "PARTIDO",
    energy: 5,
    params: [{ name: "amount", label: "Valor (R$)", type: "number" }],
    available: (_c, p) => (p.party_id ? null : "Requer filiação."),
    run: ({ ctx, p, st, params }) => {
      const amount = Math.floor(Number(params.amount));
      if (!Number.isFinite(amount) || amount < 100) return { ok: false, message: "Valor mínimo: R$ 100." };
      if (amount > st.money) return { ok: false, message: "Saldo insuficiente." };
      const party = ctx.t.parties.get(p.party_id!)!;
      st.money -= amount;
      party.cash += amount;
      st.party_standing = clamp(st.party_standing + Math.min(10, amount / 5000));
      ctx.save("parties", party);
      ctx.insert("finance_transactions", { id: ctx.id("fin", p.id), world_id: ctx.world.id, person_id: p.id, candidacy_id: null, kind: "CONTRIBUICAO_PARTIDO", amount: -amount, declared: true, game_date: ctx.date, description: `Contribuição ao ${party.acronym}` });
      return { ok: true, message: `Contribuição de ${fmtMoney(amount)} registrada.` };
    },
  },
  {
    id: "pre_candidatura",
    label: "Lançar pré-candidatura",
    description: "Peça ao partido para disputar um cargo. A convenção decide entre você e os outros nomes.",
    category: "PARTIDO",
    energy: 10,
    params: [{ name: "office", label: "Cargo", type: "office" }],
    available: (ctx, p) => {
      if (!p.party_id) return "Requer filiação.";
      if (activeCandidacy(ctx, p.id)) return "Você já tem uma pré-candidatura/candidatura.";
      const e = currentElection(ctx);
      if (!e || e.status === "SEGUNDO_TURNO" || e.status === "CAMPANHA") return "Fora do período de pré-campanha.";
      if (ctx.date > e.calendar.conventionEnd) return "As convenções já terminaram.";
      return null;
    },
    run: ({ ctx, p, params }) => {
      const e = currentElection(ctx)!;
      const office = params.office as OfficeCode;
      const rule = OFFICES[office];
      if (!rule || rule.election !== e.kind) return { ok: false, message: "Este cargo não está em disputa nesta eleição." };
      const city = canonicalGeo(p.municipality);
      const geo = rule.scope === "BR" ? "BR" : rule.scope === "UF" ? p.uf : isMunicipality(city) ? city : capitalId(p.uf);
      // cidade de jogador que ainda não tinha disputa aberta
      const race = ctx.t.races.get(`${e.id}:${office}:${geo}`) ?? (rule.scope === "MUNICIPIO" && e.status !== "AGENDADA" ? ensureRace(ctx, e, office, geo) : undefined);
      if (!race) return { ok: false, message: "Disputa inexistente na sua região." };
      const elig = checkEligibility(ctx, p, office, geo, e);
      const party = ctx.t.parties.get(p.party_id!)!;
      const cand: CandidacyRow = {
        id: ctx.id("cand", race.id, p.id),
        world_id: ctx.world.id,
        election_id: e.id,
        race_id: race.id,
        person_id: p.id,
        party_id: party.id,
        office_code: office,
        geo,
        status: "PRE",
        is_player: true,
        ballot_number: party.number * (rule.system === "PROPORCIONAL" ? 1000 : 1) + (rule.system === "PROPORCIONAL" ? (Number(p.id.replace(/\D/g, "").slice(0, 3)) || 123) : 0),
        campaign: emptyCampaign(),
        votes: 0,
        vote_share: 0,
        note: elig.ok ? null : `Atenção: ${elig.reasons.join(" ")}`,
      };
      ctx.save("candidacies", cand);
      p.stage = "PRE_CANDIDATO";
      return {
        ok: true,
        message: `Pré-candidatura a ${rule.name} em ${geoName(geo, ctx.s)} registrada no ${party.acronym}. Convenções: ${formatDatePt(e.calendar.conventionStart)} a ${formatDatePt(e.calendar.conventionEnd)}.${elig.ok ? "" : " " + cand.note}`,
      };
    },
  },
  // ------------------------------------------------------------------ CAMPANHA
  campaignAction("comicio", "Comício", "Grande ato público. Muito alcance, custa caro. Retorno decrescente se repetido no mesmo lugar.", 20, 20_000, ({ st, params, dr }, c) => {
    const uf = c.geo === "BR" ? params.uf || UF_CODES[0] : ufOfGeo(c.geo);
    const f = dr(`comicio:${uf}`);
    addReach(st, uf, 0.03 * f);
    c.campaign.momentum = Math.min(1, c.campaign.momentum + 0.05 * f);
    return `Comício em ${UF_BY_CODE[uf].name}: ${f > 0.7 ? "praça cheia" : "público menor que da última vez"}.`;
  }, [{ name: "uf", label: "Estado (para disputas nacionais)", type: "uf", options: ufOptions(), optional: true }]),
  campaignAction("caminhada", "Caminhada e corpo a corpo", "Barato, cansativo e eficaz em pequena escala.", 15, 2_000, ({ st, dr }, c) => {
    const uf = c.geo === "BR" ? "DF" : ufOfGeo(c.geo);
    const f = dr("caminhada");
    addReach(st, uf, 0.015 * f);
    c.campaign.volunteers += Math.round(20 * f);
    return "Você percorreu bairros e conversou com eleitores.";
  }),
  campaignAction("entrevista", "Entrevista na TV/rádio", "Alcance amplo; risco de gafe depende da sua competência.", 10, 0, ({ p, st, rng, dr }, c) => {
    const f = dr("entrevista");
    for (const uf of campaignUfs(c)) addReach(st, uf, 0.012 * f);
    if (rng.chance(0.25 * (1 - st.traits.competence))) {
      c.campaign.momentum -= 0.08;
      p.reputation = clamp(p.reputation - 2);
      return "Uma resposta mal colocada virou meme. O dano é real, mas passageiro.";
    }
    c.campaign.momentum = Math.min(1, c.campaign.momentum + 0.03 * f);
    return "Boa entrevista: você soou preparado(a).";
  }),
  campaignAction("podcast", "Podcast e redes sociais", "Conversa longa com público jovem e conectado.", 10, 1_000, ({ st, dr }, c) => {
    const f = dr("podcast");
    for (const uf of campaignUfs(c)) addReach(st, uf, 0.008 * f);
    c.campaign.momentum = Math.min(1, c.campaign.momentum + 0.02 * f);
    return "O episódio rendeu cortes compartilhados.";
  }),
  campaignAction("agenda_empresarial", "Agenda com empresários", "Arrecadação e apoio do setor produtivo.", 15, 0, ({ ctx, p, st, rng, dr }, c) => {
    const era = eraRules(ctx.t.elections.get(c.election_id)!.year);
    const f = dr("agenda_empresarial");
    const amount = Math.round((5_000 + p.reputation * 800 + st.traits.charisma * 30_000) * f * (era.corporateDonations ? 3 : 1) * rng.range(0.6, 1.3));
    c.campaign.donations += amount;
    c.campaign.budget += amount;
    ctx.insert("finance_transactions", { id: ctx.id("fin", p.id), world_id: ctx.world.id, person_id: p.id, candidacy_id: c.id, kind: "DOACAO", amount, declared: true, game_date: ctx.date, description: era.corporateDonations ? "Doações de empresas e pessoas físicas (declaradas)" : "Doações de pessoas físicas (declaradas)" });
    return `Você arrecadou ${fmtMoney(amount)} em doações declaradas${era.corporateDonations ? " (empresas ainda podem doar nesta época)" : ""}.`;
  }),
  campaignAction("evento_sindical", "Evento com sindicatos", "Mobiliza trabalhadores; rende mais para quem defende o Estado na economia.", 15, 3_000, ({ p, st, dr }, c) => {
    const f = dr("evento_sindical") * (p.ideology.economy < 0 ? 1 : 0.4);
    addReach(st, c.geo === "BR" ? "SP" : ufOfGeo(c.geo), 0.015 * f);
    c.campaign.momentum = Math.min(1, c.campaign.momentum + 0.03 * f);
    c.campaign.volunteers += Math.round(40 * f);
    return f > 0.5 ? "Plateia receptiva." : "Recepção fria: o público desconfia das suas posições econômicas.";
  }),
  campaignAction("visita_universidade", "Visita a universidade", "Debate com estudantes e professores.", 15, 1_000, ({ p, st, dr }, c) => {
    const f = dr("visita_universidade") * (p.ideology.social < 20 ? 1 : 0.5);
    addReach(st, c.geo === "BR" ? "SP" : ufOfGeo(c.geo), 0.012 * f);
    c.campaign.momentum = Math.min(1, c.campaign.momentum + 0.025 * f);
    return "Auditório lotado e perguntas difíceis.";
  }),
  campaignAction("lancar_proposta", "Lançar proposta", "Defina sua plataforma. Propostas alinhadas ao eleitorado rendem mais.", 15, 5_000, ({ ctx, p, params, dr }, c) => {
    const axis = params.axis as Axis;
    const side = Number(params.side) >= 0 ? 1 : -1;
    const title = (params.title ?? "").trim() || `${AXIS_INFO[axis].label}: ${side > 0 ? AXIS_INFO[axis].pos : AXIS_INFO[axis].neg}`;
    const mod = moderateText(title, { maxLength: 90, checkRealNames: true });
    if (!mod.ok) return `Proposta não publicada: ${mod.reason}`;
    const segs = [...ctx.t.voter_segments.values()].filter((s) => campaignUfs(c).includes(s.uf));
    const median = segs.reduce((s, sg) => s + sg.ideology[axis] * sg.weight, 0) / (segs.reduce((s, sg) => s + sg.weight, 0) || 1);
    const aligned = Math.sign(median) === side;
    c.campaign.proposals.push({ axis, value: side, title });
    p.ideology[axis] = clampAxis(p.ideology[axis] * 0.8 + side * 60 * 0.2);
    c.campaign.momentum = Math.min(1, c.campaign.momentum + (aligned ? 0.04 : -0.01) * dr(`proposta:${axis}`));
    return aligned ? `"${title}" agradou a maior parte do eleitorado.` : `"${title}" mobiliza sua base, mas afasta parte do eleitorado.`;
  }, [
    { name: "axis", label: "Tema", type: "axis", options: axisOptions() },
    { name: "side", label: "Direção", type: "choice", options: sideOptions() },
    { name: "title", label: "Título (opcional)", type: "text", optional: true },
  ]),
  campaignAction("captar_recursos", "Captar doações de pessoas físicas", "Vaquinha e jantares de adesão, com limite legal por doador.", 15, 0, ({ ctx, p, st, rng, dr }, c) => {
    const f = dr("captar_recursos");
    const amount = Math.round((2_000 + p.reputation * 400 + c.campaign.volunteers * 20) * f * rng.range(0.7, 1.2));
    c.campaign.donations += amount;
    c.campaign.budget += amount;
    st.political_capital = clamp(st.political_capital + 1);
    ctx.insert("finance_transactions", { id: ctx.id("fin", p.id), world_id: ctx.world.id, person_id: p.id, candidacy_id: c.id, kind: "DOACAO", amount, declared: true, game_date: ctx.date, description: "Doações de pessoas físicas" });
    return `Você captou ${fmtMoney(amount)}.`;
  }),
  campaignAction("treinar_debate", "Treinar para debates", "Simulações com a equipe. Essencial antes dos debates na TV.", 20, 3_000, ({ st, dr }) => {
    st.debate_prep = clamp(st.debate_prep + 12 * dr("treinar_debate"));
    return `Preparo para debates: ${Math.round(st.debate_prep)}.`;
  }),
  campaignAction("resposta_crise", "Responder a ataques e boatos", "Nota oficial, checagem e direito de resposta.", 15, 10_000, ({ ctx, p, st }, c) => {
    c.campaign.rumor_damage *= 0.5;
    st.scandal = Math.max(0, st.scandal - 3);
    for (const r of ctx.t.rumors.values()) {
      if (r.target_id === p.id && r.status === "ATIVO") {
        r.status = "DESMENTIDO";
        ctx.save("rumors", r);
        ctx.publish("RUMOR_DEBUNKED", { facts: { name: p.name, topic: r.topic }, personIds: [p.id], geography: p.uf });
      }
    }
    return "Sua equipe desmontou os boatos em circulação.";
  }),
  campaignAction("mobilizacao_regional", "Mobilização regional", "Carreata, lideranças locais e cabos eleitorais em uma região.", 25, 30_000, ({ st, params, dr }, c) => {
    const uf = c.geo === "BR" ? params.uf || "SP" : ufOfGeo(c.geo);
    addReach(st, uf, 0.04 * dr(`mobilizacao:${uf}`));
    c.campaign.volunteers += 100;
    return `Mobilização em ${UF_BY_CODE[uf].name} concluída.`;
  }, [{ name: "uf", label: "Estado (para disputas nacionais)", type: "uf", options: ufOptions(), optional: true }]),
  campaignAction("contratar_equipe", "Contratar equipe", "Comunicação, jurídico, agenda, pesquisa ou gestão de crise.", 5, 30_000, ({ params }, c) => {
    const area = params.area || "comunicacao";
    c.campaign.team[area] = (c.campaign.team[area] ?? 0) + 1;
    c.campaign.momentum = Math.min(1, c.campaign.momentum + 0.02);
    return `Equipe de ${area} reforçada.`;
  }, [{ name: "area", label: "Área", type: "choice", options: ["comunicacao", "juridico", "agenda", "pesquisa", "crise"].map((v) => ({ value: v, label: v })) }]),
  campaignAction("pesquisa_interna", "Encomendar pesquisa interna", "Retrato mais preciso (e privado) da disputa.", 5, 40_000, ({ ctx, p }, c) => {
    const race = ctx.t.races.get(c.race_id)!;
    if (OFFICES[race.office_code].system === "PROPORCIONAL") return "Para cargos proporcionais, a pesquisa mostra seu reconhecimento: " + Math.round((ctx.pstate(p.id)?.reach[ufOfGeo(c.geo)] ?? 0) * 100) + "% dos eleitores conhecem você.";
    const cands = [...ctx.t.candidacies.values()].filter((x) => x.race_id === race.id && x.status === c.status);
    const tally = tallyMajoritarian(ctx, race, cands);
    const results = cands
      .map((x) => ({ id: x.id, name: ctx.person(x.person_id)!.name, party: ctx.t.parties.get(x.party_id)?.acronym ?? "", pct: Math.round(((tally.votes.get(x.id) ?? 0) / (tally.valid || 1)) * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct);
    ctx.insert("polls", { id: ctx.id("poll", race.id, p.id), world_id: ctx.world.id, race_id: race.id, institute: "Pesquisa interna", game_date: ctx.date, sample: 3000, margin: 1.8, results, undecided: 0, private_for: p.id });
    return `Pesquisa interna: ${results.map((r) => `${r.name} ${r.pct}%`).join(", ")}.`;
  }),
  {
    id: "preparar_debate",
    label: "Definir estratégia para o próximo debate",
    description: "Escolha o tema que vai puxar, a postura e quanto risco correr.",
    category: "CAMPANHA",
    energy: 5,
    params: [
      { name: "debate", label: "Debate", type: "debate" },
      { name: "theme", label: "Tema", type: "choice", options: ["economia", "segurança pública", "saúde", "educação", "corrupção", "meio ambiente", "emprego"].map((v) => ({ value: v, label: v })) },
      { name: "stance", label: "Postura", type: "choice", options: [{ value: "PROPOSITIVO", label: "Propositiva" }, { value: "ATAQUE", label: "Ataque" }, { value: "DEFENSIVO", label: "Defensiva" }] },
      { name: "risk", label: "Risco", type: "choice", options: [{ value: "0.1", label: "Baixo" }, { value: "0.3", label: "Médio" }, { value: "0.6", label: "Alto" }] },
    ],
    available: (ctx, p) => {
      const c = activeCandidacy(ctx, p.id);
      if (!c) return "Sem candidatura.";
      const has = [...ctx.t.debates.values()].some((d) => d.status === "AGENDADO" && d.participants.includes(c.id));
      return has ? null : "Nenhum debate agendado para você.";
    },
    run: ({ ctx, p, params }) => {
      const c = activeCandidacy(ctx, p.id)!;
      const d = ctx.t.debates.get(params.debate) ?? [...ctx.t.debates.values()].find((x) => x.status === "AGENDADO" && x.participants.includes(c.id));
      if (!d || !d.participants.includes(c.id)) return { ok: false, message: "Debate inválido." };
      d.player_choices[c.id] = { theme: params.theme, stance: params.stance, risk: Number(params.risk) || 0.3 };
      ctx.save("debates", d);
      return { ok: true, message: `Estratégia definida para o debate de ${formatDatePt(d.scheduled_on)} na ${d.outlet}.` };
    },
  },
  {
    id: "impulsionar_boato",
    label: "Impulsionar boato contra adversário",
    description: "Desinformação com perfis automatizados DENTRO do mundo simulado. Pode render votos — e uma investigação. Nunca atinge pessoas reais.",
    category: "ESQUEMA",
    crime: "DESINFORMACAO",
    energy: 10,
    cost: 15_000,
    params: [{ name: "target", label: "Adversário", type: "person" }],
    available: (ctx, p, st) => CAMPAIGN_STAGE_REASON(ctx, p) ?? (st.money + st.dirty_money < 15_000 ? "Custa R$ 15.000 (por fora)." : null),
    run: ({ ctx, p, st, params, rng }) => {
      const target = ctx.person(params.target);
      if (!target || isReal(target.kind)) return { ok: false, message: "O jogo não cria boatos sobre pessoas reais. Escolha um adversário fictício ou outro jogador." };
      const tc = activeCandidacy(ctx, target.id);
      if (!tc) return { ok: false, message: "Esse alvo não está em campanha." };
      payDirtyFirst(st, 15_000);
      const topic = rng.pick(["uso de dinheiro público em viagens", "ligação com empresas investigadas", "promessas falsas a servidores", "patrimônio incompatível"]);
      tc.campaign.rumor_damage += rng.range(3, 9);
      ctx.save("candidacies", tc);
      ctx.save("rumors", { id: ctx.id("rum", target.id), world_id: ctx.world.id, target_id: target.id, source_id: p.id, topic, created_on: ctx.date, reach: 0.4, credibility: 0.4, bots: rng.int(200, 2000), status: "ATIVO" });
      createIllicitAct(ctx, p, "DESINFORMACAO", { amount: 15_000, description: `Impulsionamento de boato contra ${target.name}`, witnesses: rng.int(1, 4), paperTrail: rng.range(0.3, 0.7) });
      ctx.publish("RUMOR", { facts: { name: target.name, topic }, personIds: [target.id], geography: target.uf });
      ctx.notify(target.id, "Você é alvo de boatos", `Mensagens sobre "${topic}" circulam contra você. Considere responder.`, "/jogo/campanha");
      return { ok: true, message: "O boato começou a circular. Há rastros digitais — o risco ficou registrado." };
    },
  },
  // ------------------------------------------------------------------ MANDATO
  {
    id: "votar_projeto",
    label: "Votar projeto em plenário",
    description: "Seu voto conta no placar. Votar contra a orientação do partido custa prestígio interno.",
    category: "MANDATO",
    energy: 5,
    params: [
      { name: "bill", label: "Projeto", type: "bill" },
      { name: "vote", label: "Voto", type: "choice", options: [{ value: "SIM", label: "Sim" }, { value: "NAO", label: "Não" }, { value: "ABSTENCAO", label: "Abstenção" }] },
    ],
    available: (_c, p) => (p.office_code === "DEP_FEDERAL" ? null : "Disponível para deputados federais."),
    run: ({ ctx, p, params }) => {
      const bill = ctx.t.bills.get(params.bill);
      if (!bill || bill.status !== "TRAMITANDO") return { ok: false, message: "Projeto fora de pauta." };
      bill.player_votes[p.id] = params.vote as "SIM" | "NAO" | "ABSTENCAO";
      ctx.save("bills", bill);
      return { ok: true, message: `Voto registrado: ${params.vote}. A votação ocorre em ${formatDatePt(bill.vote_on)}.` };
    },
  },
  {
    id: "apresentar_projeto",
    label: "Apresentar projeto de lei",
    description: "Marque posição. Projetos alinhados ao seu eleitorado rendem reputação.",
    category: "MANDATO",
    energy: 15,
    params: [
      { name: "axis", label: "Tema", type: "axis", options: axisOptions() },
      { name: "side", label: "Direção", type: "choice", options: sideOptions() },
    ],
    available: (_c, p) => (p.office_code && OFFICES[p.office_code].system === "PROPORCIONAL" || p.office_code === "SENADOR" ? null : "Disponível para parlamentares."),
    run: ({ ctx, p, st, params, dr }) => {
      const axis = params.axis as Axis;
      const side = Number(params.side) >= 0 ? 1 : -1;
      const f = dr("apresentar_projeto");
      const segs = [...ctx.t.voter_segments.values()].filter((s) => s.uf === p.uf);
      const median = segs.reduce((s, sg) => s + sg.ideology[axis] * sg.weight, 0);
      const aligned = Math.sign(median) === side;
      p.reputation = clamp(p.reputation + (aligned ? 2 : 0.5) * f);
      addReach(st, p.uf, 0.01 * f);
      if (p.office_code === "DEP_FEDERAL") {
        ctx.save("bills", {
          id: ctx.id("bill", p.id),
          world_id: ctx.world.id,
          chamber: "CAMARA",
          title: `PL de ${p.name}: ${side > 0 ? AXIS_INFO[axis].pos : AXIS_INFO[axis].neg} (${AXIS_INFO[axis].label.toLowerCase()})`,
          summary: "Projeto apresentado pelo seu gabinete.",
          axis,
          direction: side,
          author_party_id: p.party_id,
          author_person_id: p.id,
          gov_position: 0,
          vote_on: addDays(ctx.date, 60),
          status: "TRAMITANDO",
          votes: { yes: 0, no: 0, abstain: 0 },
          player_votes: { [p.id]: "SIM" },
          fiscal_effect: 0,
        });
      }
      return { ok: true, message: aligned ? "Projeto bem recebido na sua base." : "Projeto apresentado; sua base ficou dividida." };
    },
  },
  {
    id: "destinar_emenda",
    label: "Destinar emenda para sua base",
    description: "Recursos para obras locais. Fortalece seu nome na região.",
    category: "MANDATO",
    energy: 10,
    available: (_c, p, st) => (!p.office_code || !["DEP_FEDERAL", "DEP_ESTADUAL", "SENADOR", "VEREADOR"].includes(p.office_code) ? "Disponível para parlamentares." : st.political_capital < 5 ? "Capital político insuficiente." : null),
    run: ({ p, st, dr }) => {
      const f = dr("emenda");
      st.political_capital = clamp(st.political_capital - 5);
      addReach(st, p.uf, 0.02 * f);
      p.reputation = clamp(p.reputation + 1.5 * f);
      return { ok: true, message: "Emenda destinada. Prefeitos aliados agradecem." };
    },
  },
  {
    id: "fiscalizar_governo",
    label: "Fiscalizar o governo",
    description: "Requerimentos, convocações e discursos. Rende visibilidade, sobretudo na oposição.",
    category: "MANDATO",
    energy: 15,
    available: (_c, p) => (p.office_code && p.office_code !== "PRESIDENTE" && p.office_code !== "GOVERNADOR" && p.office_code !== "PREFEITO" ? null : "Disponível para parlamentares."),
    run: ({ ctx, p, st, dr }) => {
      const f = dr("fiscalizar");
      const party = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
      p.visibility = clamp(p.visibility + 3 * f);
      if (party && party.gov_alignment < 0) p.reputation = clamp(p.reputation + 1 * f);
      st.political_capital = clamp(st.political_capital + 2 * f);
      return { ok: true, message: "Sua atuação fiscalizadora repercutiu." };
    },
  },
  {
    id: "lancar_politica",
    label: "Lançar política pública",
    description: "Programas com custo, cronograma, risco de atraso e efeito defasado.",
    category: "MANDATO",
    energy: 20,
    params: [{ name: "policy", label: "Política", type: "policy", options: POLICY_CATALOG.map((p) => ({ value: p.kind, label: p.title })) }],
    available: (_c, p) => (p.office_code && ["PRESIDENTE", "GOVERNADOR", "PREFEITO"].includes(p.office_code) ? null : "Disponível para chefes do Executivo."),
    run: ({ ctx, p, params }) => {
      const def = POLICY_CATALOG.find((d) => d.kind === params.policy);
      if (!def || !def.offices.includes(p.office_code!)) return { ok: false, message: "Política indisponível para seu cargo." };
      if ([...ctx.t.policies.values()].some((x) => x.owner_person_id === p.id && x.kind === def.kind && x.status !== "CONCLUIDA" && x.status !== "CANCELADA")) return { ok: false, message: "Essa política já está em andamento." };
      const pol = startPolicy(ctx, p, def.kind);
      return { ok: true, message: `${def.title} lançado. Previsão de conclusão: ${formatDatePt(pol.completes_on)}.` };
    },
  },
  {
    id: "abrir_cpi",
    label: "Propor CPI contra alguém",
    description: "Comissão Parlamentar de Inquérito. Exige capital político; se o seu dossiê não tiver prova, quem perde é você.",
    category: "MANDATO",
    energy: 25,
    params: [{ name: "target", label: "Alvo", type: "person" }],
    available: (_c, p, st) => (!p.office_code || !["DEP_FEDERAL", "DEP_ESTADUAL", "SENADOR", "VEREADOR"].includes(p.office_code) ? "Disponível para parlamentares." : st.political_capital < 30 ? "Exige 30 de capital político." : null),
    run: ({ ctx, p, st, params }) => {
      const target = ctx.person(params.target);
      if (!canBeTargeted(target)) return { ok: false, message: "Pessoas reais não podem ser alvo de investigações inventadas no jogo." };
      st.political_capital = clamp(st.political_capital - 30);
      p.visibility = clamp(p.visibility + 6);
      const proof = provenActs(st, target.id);
      openInvestigation(ctx, target, { authority: "CPI", openedBy: p.id, initialEvidence: (st.dossiers[target.id] ?? 0) * 0.8 + 0.05, actIds: proof, reason: `CPI proposta por ${p.name}`, channel: "CPI" });
      return { ok: true, message: `CPI instalada para apurar a conduta de ${target.name}.${proof.length ? "" : " Sem provas no seu dossiê, a comissão tende a terminar sem nada."}` };
    },
  },
  // ------------------------------------------------------------------ INVESTIGAÇÃO
  {
    id: "investigar",
    label: "Levantar informações sobre alguém",
    description: "Cartórios, diários oficiais, juntas comerciais, prestação de contas e fontes. O dossiê mostra o que de fato apareceu, inclusive quando não há nada.",
    category: "INVESTIGACAO",
    energy: 20,
    costFn: (ctx) => scaledAmount(ctx, 3_000),
    params: [{ name: "target", label: "Alvo", type: "person" }],
    available: (ctx, _p, st) => (st.money < scaledAmount(ctx, 3_000) ? `Custa ${fmtMoney(scaledAmount(ctx, 3_000))}.` : null),
    run: ({ ctx, p, st, params, rng, dr }) => {
      const target = ctx.person(params.target);
      if (!canBeTargeted(target) || target.id === p.id) return { ok: false, message: "Alvo inválido. Pessoas reais não podem ser investigadas por fatos inventados." };
      st.money -= scaledAmount(ctx, 3_000);
      const skill = (0.55 + st.traits.competence * 0.45) * dr(`investigar:${target.id}`);
      const r = gatherIntel(ctx, st, { person: target }, rng, skill);
      return { ok: true, message: intelMessage(target.name, r.found, r.level), effects: { dossie: Math.round(r.level * 100) } };
    },
  },
  {
    id: "investigar_partido",
    label: "Investigar as contas de um partido",
    description: "Cruza prestação de contas, fornecedores e candidaturas. Só aparecem atos de membros fictícios ou de jogadores.",
    category: "INVESTIGACAO",
    energy: 20,
    costFn: (ctx) => scaledAmount(ctx, 8_000),
    params: [{ name: "party", label: "Partido", type: "party" }],
    available: (ctx, _p, st) => (st.money < scaledAmount(ctx, 8_000) ? `Custa ${fmtMoney(scaledAmount(ctx, 8_000))}.` : null),
    run: ({ ctx, p, st, params, rng, dr }) => {
      const party = ctx.t.parties.get(params.party);
      if (!party || party.status !== "ATIVO") return { ok: false, message: "Partido inválido." };
      st.money -= scaledAmount(ctx, 8_000);
      const skill = (0.5 + st.traits.competence * 0.4) * dr(`investigar_partido:${party.id}`);
      const r = gatherIntel(ctx, st, { party }, rng, skill);
      if (party.id === p.party_id) st.party_standing = clamp(st.party_standing - 3);
      return { ok: true, message: intelMessage(`o ${party.acronym}`, r.found, r.level), effects: { dossie: Math.round(r.level * 100) } };
    },
  },
  {
    id: "denunciar",
    label: "Acionar a polícia / Ministério Público",
    description: "Leve o caso às autoridades. Com provas no dossiê, a investigação anda; denúncia sem prova é arquivada e desgasta você.",
    category: "INVESTIGACAO",
    energy: 10,
    params: [
      { name: "target", label: "Alvo", type: "person" },
      { name: "authority", label: "Autoridade", type: "choice", options: [{ value: "PF", label: "Polícia Federal" }, { value: "MP", label: "Ministério Público" }, { value: "MP_ELEITORAL", label: "Ministério Público Eleitoral" }] },
    ],
    available: () => null,
    run: ({ ctx, p, st, params }) => {
      const target = ctx.person(params.target);
      if (!canBeTargeted(target) || target.id === p.id) return { ok: false, message: "Alvo inválido. Pessoas reais não podem ser alvo de denúncias inventadas." };
      const authority = params.authority === "MP" ? "MP" : params.authority === "MP_ELEITORAL" ? "MP_ELEITORAL" : "PF";
      const proof = provenActs(st, target.id);
      openInvestigation(ctx, target, { authority, openedBy: p.id, initialEvidence: (st.dossiers[target.id] ?? 0) * 0.9 + 0.05, actIds: proof, reason: `Denúncia apresentada por ${p.name}`, channel: "DENUNCIA" });
      const where = authority === "PF" ? "na Polícia Federal" : authority === "MP" ? "no Ministério Público" : "no Ministério Público Eleitoral";
      const base = proof.length ? `Denúncia registrada ${where}, com ${proof.length} prova(s) do seu dossiê.` : `Denúncia registrada ${where}, mas sem prova documental: a tendência é o arquivamento.`;
      if (target.party_id && target.party_id === p.party_id) {
        st.party_standing = clamp(st.party_standing - 10);
        return { ok: true, message: `${base} Denunciar um correligionário abalou sua posição no partido.` };
      }
      return { ok: true, message: base };
    },
  },
  {
    id: "denunciar_partido",
    label: "Denunciar as contas de um partido",
    description: "Representação ao Ministério Público Eleitoral sobre o uso do fundo partidário e das candidaturas do partido.",
    category: "INVESTIGACAO",
    energy: 10,
    params: [{ name: "party", label: "Partido", type: "party" }],
    available: () => null,
    run: ({ ctx, p, st, params }) => {
      const party = ctx.t.parties.get(params.party);
      if (!party || party.status !== "ATIVO") return { ok: false, message: "Partido inválido." };
      const key = `party:${party.id}`;
      const proof = provenActs(st, key);
      openInvestigation(ctx, null, { authority: "MP_ELEITORAL", partyId: party.id, openedBy: p.id, initialEvidence: (st.dossiers[key] ?? 0) * 0.9 + 0.05, actIds: proof, reason: `Representação apresentada por ${p.name}`, channel: "DENUNCIA" });
      if (party.id === p.party_id) st.party_standing = clamp(st.party_standing - 25);
      return { ok: true, message: proof.length ? `Representação contra o ${party.acronym} protocolada com ${proof.length} prova(s).` : `Representação contra o ${party.acronym} protocolada, sem provas: deve ser arquivada.` };
    },
  },
  {
    id: "vazar_imprensa",
    label: "Vazar dossiê para a imprensa",
    description: "Dano rápido à reputação do alvo. Se as provas não se sustentarem, a conta volta para você.",
    category: "INVESTIGACAO",
    energy: 10,
    params: [{ name: "target", label: "Alvo", type: "person" }],
    available: () => null,
    run: ({ ctx, p, st, params }) => {
      const target = ctx.person(params.target);
      if (!canBeTargeted(target) || target.id === p.id) return { ok: false, message: "Alvo inválido. O jogo não publica acusações inventadas sobre pessoas reais." };
      const proof = provenActs(st, target.id);
      openInvestigation(ctx, target, { authority: "IMPRENSA", openedBy: p.id, initialEvidence: (st.dossiers[target.id] ?? 0) * 0.7 + 0.05, actIds: proof, reason: "Reportagem com base em dossiê recebido", channel: "IMPRENSA" });
      return { ok: true, message: `O material chegou às redações. ${target.name} terá de se explicar.${proof.length ? "" : " Sem documentos, a história pode não parar em pé."}` };
    },
  },
  {
    id: "responder_oferta",
    label: "Responder a uma oferta ilícita",
    description: "Aceitar traz dinheiro não declarado e risco; recusar não traz nada; denunciar pode render reputação — e inimigos.",
    category: "INVESTIGACAO",
    energy: 5,
    params: [
      { name: "offer", label: "Oferta", type: "offer" },
      { name: "decision", label: "Decisão", type: "choice", options: [{ value: "ACEITAR", label: "Aceitar" }, { value: "RECUSAR", label: "Recusar" }, { value: "DENUNCIAR", label: "Denunciar à Polícia Federal" }] },
    ],
    available: (_c, _p, st) => (st.offers.length ? null : "Nenhuma oferta pendente."),
    run: ({ ctx, p, st, params }) => {
      const offer = st.offers.find((o) => o.id === params.offer) ?? st.offers[0];
      if (!offer) return { ok: false, message: "Oferta expirada." };
      const decision = params.decision === "ACEITAR" ? "ACEITAR" : params.decision === "DENUNCIAR" && ctx.person(offer.from) ? "DENUNCIAR" : "RECUSAR";
      const message = respondToOffer(ctx, p, st, offer.id, decision);
      const label = decision === "ACEITAR" ? "Aceitar" : decision === "DENUNCIAR" ? "Denunciar à Polícia Federal" : "Recusar";
      for (const def of ["proposta_ilicita", "proposta_financiamento"]) closeStory(st, def, "offer", offer.id, ctx.date, label, message);
      if (decision === "DENUNCIAR") p.reputation = clamp(p.reputation + 3);
      return { ok: true, message };
    },
  },
  {
    id: "contratar_defesa",
    label: "Contratar defesa jurídica",
    description: "Bons advogados reduzem a chance de condenação em casos abertos contra você.",
    category: "INVESTIGACAO",
    energy: 5,
    costFn: (ctx) => scaledAmount(ctx, 50_000),
    available: (ctx, p, st) => (![...ctx.t.investigations.values()].some((i) => i.person_id === p.id && !i.outcome) ? "Não há investigação aberta contra você." : st.money < scaledAmount(ctx, 50_000) ? `Custa ${fmtMoney(scaledAmount(ctx, 50_000))}.` : null),
    run: ({ ctx, p, st }) => {
      const cost = scaledAmount(ctx, 50_000);
      st.money -= cost;
      for (const inv of ctx.t.investigations.values()) {
        if (inv.person_id === p.id && !inv.outcome) {
          inv.defense = Math.min(1, inv.defense + 0.15);
          ctx.save("investigations", inv);
        }
      }
      ctx.insert("finance_transactions", { id: ctx.id("fin", p.id), world_id: ctx.world.id, person_id: p.id, candidacy_id: null, kind: "DESPESA", amount: -cost, declared: true, game_date: ctx.date, description: "Honorários advocatícios" });
      return { ok: true, message: "Escritório contratado. Sua defesa ficou mais robusta." };
    },
  },
  {
    id: "colaborar",
    confirm: "A colaboração é definitiva: sua reputação cai e seus parceiros viram alvo.",
    label: "Fazer colaboração premiada",
    description: "Confessar e entregar cúmplices. A pena cai, a reputação despenca e os parceiros viram alvo.",
    category: "INVESTIGACAO",
    energy: 10,
    available: (ctx, p) => ([...ctx.t.investigations.values()].some((i) => i.person_id === p.id && !i.outcome) ? null : "Não há investigação aberta contra você."),
    run: ({ ctx, p, st }) => {
      for (const inv of ctx.t.investigations.values()) {
        if (inv.person_id !== p.id || inv.outcome) continue;
        inv.defense = Math.min(1, inv.defense + 0.5);
        inv.measures.push({ on: ctx.date, kind: "ACORDO", text: `${p.name} assina acordo de colaboração premiada` });
        ctx.save("investigations", inv);
        for (const actId of inv.act_ids) {
          const act = ctx.t.illicit_acts.get(actId);
          for (const pid of act?.partners ?? []) {
            const partner = ctx.person(pid);
            if (canBeTargeted(partner)) openInvestigation(ctx, partner, { authority: "PF", initialEvidence: 0.5, actIds: [actId], reason: `Citado(a) na colaboração de ${p.name}`, channel: "COLABORACAO" });
          }
        }
      }
      p.reputation = clamp(p.reputation - 6);
      st.party_standing = clamp(st.party_standing - 20);
      return { ok: true, message: "Acordo de colaboração assinado. Seus antigos parceiros não vão esquecer." };
    },
  },
  {
    id: "nota_publica",
    label: "Divulgar nota pública de defesa",
    description: "Funciona quando as provas são fracas; quando são fortes, pode piorar.",
    category: "INVESTIGACAO",
    energy: 5,
    available: (ctx, p) => ([...ctx.t.investigations.values()].some((i) => i.person_id === p.id && !i.outcome) ? null : "Não há investigação aberta contra você."),
    run: ({ ctx, p }) => {
      const inv = [...ctx.t.investigations.values()].find((i) => i.person_id === p.id && !i.outcome)!;
      if (inv.evidence < 0.4) {
        p.reputation = clamp(p.reputation + 2);
        return { ok: true, message: "A nota convenceu parte do público." };
      }
      p.reputation = clamp(p.reputation - 3);
      return { ok: true, message: "A nota soou como deboche diante das provas. Pegou mal." };
    },
  },
  // ------------------------------------------------------------------ ESQUEMAS (condutas ilícitas)
  schemeAction({
    id: "rachadinha",
    kind: "RACHADINHA",
    label: "Exigir parte do salário dos assessores",
    description: "A chamada rachadinha: assessores devolvem parte do salário todo mês. Rende sempre, e cada mês deixa mais testemunhas.",
    energy: 15,
  }),
  schemeAction({
    id: "funcionario_fantasma",
    kind: "FUNCIONARIO_FANTASMA",
    label: "Nomear funcionário fantasma",
    description: "Alguém recebe sem trabalhar e repassa parte do salário. Pequeno, recorrente e fácil de flagrar pela imprensa.",
    energy: 10,
  }),
  schemeAction({
    id: "desviar_cota",
    kind: "DESVIO_COTA",
    label: "Usar notas frias na cota parlamentar",
    description: "Reembolsos de despesas que não existiram. Recorrente; as notas ficam públicas no portal da transparência.",
    energy: 10,
  }),
  schemeAction({
    id: "nomear_parentes",
    kind: "NEPOTISMO",
    label: "Nomear parentes para cargos de confiança",
    description: "Família na folha: renda extra para a casa e aliados leais. É improbidade, e a imprensa adora o tema.",
    energy: 10,
    after: ({ st }) => {
      st.political_capital = clamp(st.political_capital + 5);
    },
  }),
  schemeAction({
    id: "cobrar_propina",
    kind: "CONCUSSAO",
    label: "Cobrar 'pedágio' de empresários",
    description: "Exigir vantagem para liberar pagamentos ou licenças. Dinheiro rápido; quem paga pode gravar.",
    energy: 15,
  }),
  schemeAction({
    id: "fraudar_licitacao",
    kind: "FRAUDE_LICITACAO",
    label: "Direcionar uma licitação",
    description: "Edital feito sob medida para uma empresa combinada, com sobrepreço. Muito dinheiro e muito papel: o Tribunal de Contas olha os contratos.",
    energy: 20,
  }),
  schemeAction({
    id: "desviar_verba",
    kind: "PECULATO",
    label: "Desviar verba de um contrato",
    description: "Pagar por serviço que não foi prestado e dividir o dinheiro. Auditorias e controladorias costumam achar.",
    energy: 20,
  }),
  schemeAction({
    id: "desviar_emenda",
    kind: "DESVIO_EMENDAS",
    label: "Desviar uma emenda parlamentar",
    description: "Emenda para uma entidade de fachada ou prefeitura aliada, com retorno de parte do valor. A Controladoria vistoria as obras.",
    energy: 20,
  }),
  schemeAction({
    id: "vender_influencia",
    kind: "TRAFICO_INFLUENCIA",
    label: "Vender acesso a autoridades",
    description: "Cobrar de empresários pela promessa de influência sobre decisões. Exige conhecer quem tem cargo.",
    energy: 15,
  }),
  {
    id: "buscar_caixa_dois",
    label: "Buscar doação não declarada (caixa dois)",
    description: "Dinheiro de campanha por fora da prestação de contas. Reforça a campanha (ou o seu caixa), com risco de cassação.",
    category: "ESQUEMA",
    crime: "CAIXA_DOIS",
    energy: 15,
    params: [{ name: "amount", label: "Valor", type: "amount", amounts: [50_000, 150_000, 400_000] }],
    available: (ctx, p) => crimeOpportunity(ctx, p, "CAIXA_DOIS"),
    run: ({ ctx, p, st, params }) => {
      const amount = pickAmount(ctx, params.amount, [50_000, 150_000, 400_000]);
      if (!amount) return { ok: false, message: "Escolha um dos valores." };
      const r = commitCrime(ctx, p, "CAIXA_DOIS", { amount });
      const c = activeCandidacy(ctx, p.id);
      if (c && c.status !== "PRE") {
        st.dirty_money -= amount;
        c.campaign.budget += amount;
        ctx.save("candidacies", c);
        return { ok: true, message: `${fmtMoney(amount)} entraram na campanha por fora, via ${partnerText(r)}. Não aparecem na prestação de contas.` };
      }
      return { ok: true, message: `${fmtMoney(amount)} guardados por fora para a próxima campanha, via ${partnerText(r)}.` };
    },
  },
  {
    id: "comprar_votos",
    label: "Comprar votos",
    description: "Dinheiro, cestas e favores em troca do voto, por meio de cabos eleitorais. Rende votos rápido; muitas testemunhas.",
    category: "ESQUEMA",
    crime: "COMPRA_VOTOS",
    energy: 20,
    params: [{ name: "amount", label: "Quanto distribuir", type: "amount", amounts: [20_000, 60_000, 150_000] }],
    available: (ctx, p) => crimeOpportunity(ctx, p, "COMPRA_VOTOS"),
    run: ({ ctx, p, st, params }) => {
      const amount = pickAmount(ctx, params.amount, [20_000, 60_000, 150_000]);
      if (!amount) return { ok: false, message: "Escolha um dos valores." };
      if (st.money + st.dirty_money < amount) return { ok: false, message: "Você não tem esse dinheiro." };
      const c = activeCandidacy(ctx, p.id)!;
      payDirtyFirst(st, amount);
      const boost = Math.min(0.25, amount / scaledAmount(ctx, 600_000));
      c.campaign.momentum = Math.min(1, c.campaign.momentum + boost);
      c.campaign.volunteers += Math.round(amount / scaledAmount(ctx, 1_000));
      ctx.save("candidacies", c);
      commitCrime(ctx, p, "COMPRA_VOTOS", { amount, votesGain: boost });
      return { ok: true, message: `Cabos eleitorais distribuíram ${fmtMoney(amount)}. A campanha ganhou fôlego — e dezenas de pessoas sabem.` };
    },
  },
  {
    id: "usar_maquina",
    label: "Usar a máquina pública na campanha",
    description: "Servidores, carros oficiais e programas sociais a serviço da reeleição. Funciona; e é conduta vedada.",
    category: "ESQUEMA",
    crime: "USO_MAQUINA",
    energy: 15,
    available: (ctx, p) => crimeOpportunity(ctx, p, "USO_MAQUINA"),
    run: ({ ctx, p, dr }) => {
      const c = activeCandidacy(ctx, p.id)!;
      const boost = 0.1 * dr("usar_maquina");
      c.campaign.momentum = Math.min(1, c.campaign.momentum + boost);
      c.campaign.volunteers += 60;
      ctx.save("candidacies", c);
      commitCrime(ctx, p, "USO_MAQUINA", { amount: 0, votesGain: boost, noPartner: false });
      return { ok: true, message: "A estrutura do governo trabalhou pela sua campanha. Adversários estão fotografando tudo." };
    },
  },
  {
    id: "gastar_por_fora",
    label: "Gastar acima do teto com dinheiro não declarado",
    description: "Estrutura de campanha bancada com dinheiro por fora, além do limite legal. Desequilibra a disputa; pode cassar o registro.",
    category: "ESQUEMA",
    crime: "ABUSO_PODER_ECONOMICO",
    energy: 15,
    params: [{ name: "amount", label: "Quanto injetar", type: "amount", amounts: [100_000, 300_000, 800_000] }],
    available: (ctx, p, st) => crimeOpportunity(ctx, p, "ABUSO_PODER_ECONOMICO") ?? (st.dirty_money < scaledAmount(ctx, 100_000) ? "Exige dinheiro não declarado guardado." : null),
    run: ({ ctx, p, st, params }) => {
      const amount = pickAmount(ctx, params.amount, [100_000, 300_000, 800_000]);
      if (!amount) return { ok: false, message: "Escolha um dos valores." };
      if (st.dirty_money < amount) return { ok: false, message: "Você não tem esse dinheiro não declarado." };
      const c = activeCandidacy(ctx, p.id)!;
      st.dirty_money -= amount;
      c.campaign.budget += amount;
      c.campaign.momentum = Math.min(1, c.campaign.momentum + Math.min(0.15, amount / scaledAmount(ctx, 1_500_000)));
      ctx.save("candidacies", c);
      commitCrime(ctx, p, "ABUSO_PODER_ECONOMICO", { amount });
      return { ok: true, message: `${fmtMoney(amount)} a mais na rua, fora da prestação de contas.` };
    },
  },
  {
    id: "pagar_mesada",
    label: "Pagar mesada a parlamentares por apoio",
    description: "Repasses mensais a parlamentares em troca de votos na Casa. Compra governabilidade; um único delator derruba tudo.",
    category: "ESQUEMA",
    crime: "CORRUPCAO_ATIVA",
    energy: 20,
    params: [{ name: "amount", label: "Valor do repasse", type: "amount", amounts: [100_000, 300_000] }],
    available: (ctx, p, st) => crimeOpportunity(ctx, p, "CORRUPCAO_ATIVA") ?? (st.dirty_money + st.money < scaledAmount(ctx, 100_000) ? "Exige dinheiro para os repasses." : null),
    run: ({ ctx, p, st, params }) => {
      const amount = pickAmount(ctx, params.amount, [100_000, 300_000]);
      if (!amount) return { ok: false, message: "Escolha um dos valores." };
      if (st.money + st.dirty_money < amount) return { ok: false, message: "Você não tem esse dinheiro." };
      payDirtyFirst(st, amount);
      st.political_capital = clamp(st.political_capital + Math.min(30, amount / scaledAmount(ctx, 10_000)));
      commitCrime(ctx, p, "CORRUPCAO_ATIVA", { amount });
      return { ok: true, message: `Repasses de ${fmtMoney(amount)} feitos. A base ficou mais dócil (+capital político).` };
    },
  },
  schemeAction({
    id: "lancar_laranjas",
    kind: "CANDIDATURAS_LARANJA",
    label: "Registrar candidaturas laranjas",
    description: "Candidatas de fachada para cumprir a cota de gênero e desviar parte do fundo eleitoral do partido. Pode cassar a chapa.",
    energy: 20,
  }),
  schemeAction({
    id: "desviar_fundo",
    kind: "DESVIO_FUNDO_PARTIDARIO",
    label: "Desviar dinheiro do partido",
    description: "Gastos pessoais pagos com o caixa da legenda (que vem do fundo partidário). A Justiça Eleitoral julga as contas todo ano.",
    energy: 15,
  }),
  {
    id: "lavar_dinheiro",
    label: "Lavar dinheiro não declarado",
    description: "Dar aparência legal ao dinheiro por fora, com perda de cerca de 30% no caminho. Movimentações grandes chamam a atenção do Coaf.",
    category: "ESQUEMA",
    crime: "LAVAGEM",
    energy: 15,
    params: [{ name: "amount", label: "Quanto lavar", type: "amount", amounts: [50_000, 200_000, 1_000_000] }],
    available: (ctx, p) => crimeOpportunity(ctx, p, "LAVAGEM"),
    run: ({ ctx, p, st, params }) => {
      const asked = pickAmount(ctx, params.amount, [50_000, 200_000, 1_000_000]);
      if (!asked) return { ok: false, message: "Escolha um dos valores." };
      const amount = Math.min(asked, Math.floor(st.dirty_money));
      if (amount <= 0) return { ok: false, message: "Você não tem dinheiro não declarado." };
      const net = Math.round(amount * 0.7);
      st.dirty_money -= amount;
      st.money += net;
      st.assets += Math.round(amount * 0.1);
      const r = commitCrime(ctx, p, "LAVAGEM", { amount });
      ctx.insert("finance_transactions", { id: ctx.id("fin", p.id, "lavagem"), world_id: ctx.world.id, person_id: p.id, candidacy_id: null, kind: "LAVAGEM", amount: net, declared: true, game_date: ctx.date, description: `"Lucros" de empresa de fachada (dinheiro lavado via ${r.partner?.role_label ?? "intermediário"})` });
      return { ok: true, message: `${fmtMoney(amount)} lavados: ${fmtMoney(net)} entraram na sua conta como se fossem lucros de empresa.` };
    },
  },
  {
    id: "obstruir_investigacao",
    label: "Pressionar testemunhas e sumir com provas",
    description: "Pode enfraquecer o caso contra você. Se descoberto, é crime à parte e motivo clássico de prisão preventiva.",
    category: "ESQUEMA",
    crime: "OBSTRUCAO_JUSTICA",
    energy: 20,
    available: (ctx, p) => crimeOpportunity(ctx, p, "OBSTRUCAO_JUSTICA"),
    run: ({ ctx, p, rng }) => {
      for (const inv of ctx.t.investigations.values()) {
        if (inv.person_id !== p.id || inv.outcome) continue;
        inv.evidence = Math.max(0, inv.evidence - rng.range(0.04, 0.12));
        ctx.save("investigations", inv);
      }
      createIllicitAct(ctx, p, "OBSTRUCAO_JUSTICA", { amount: 0, description: "Pressão sobre testemunhas e destruição de documentos", witnesses: rng.int(2, 4), paperTrail: rng.range(0.4, 0.7) });
      return { ok: true, message: "Uma testemunha recuou e alguns papéis sumiram. Se isso vier à tona, a situação piora muito." };
    },
  },
  {
    id: "encerrar_esquema",
    label: "Encerrar um esquema em andamento",
    description: "Parar o que se repete todo mês. O que já foi feito continua rastreável, mas o risco para de crescer.",
    category: "ESQUEMA",
    energy: 5,
    params: [{ name: "scheme", label: "Esquema", type: "scheme" }],
    available: (ctx, p) => ([...ctx.t.illicit_acts.values()].some((a) => a.person_id === p.id && a.ongoing) ? null : "Você não tem esquemas em andamento."),
    run: ({ ctx, p, params }) => {
      const act = ctx.t.illicit_acts.get(params.scheme);
      if (!act || act.person_id !== p.id || !act.ongoing) return { ok: false, message: "Esquema inválido." };
      stopScheme(ctx, act);
      return { ok: true, message: `${CRIMES[act.kind].label} encerrado. Rendeu ${fmtMoney(act.amount)} no total.` };
    },
  },
  // ------------------------------------------------------------------ MEU PARTIDO
  {
    id: "fundar_partido",
    label: "Fundar um partido",
    description: "Estatuto, fundadores e registro civil; depois, dois anos para reunir o apoio de eleitores em pelo menos nove estados e pedir o registro ao TSE.",
    category: "MEU_PARTIDO",
    energy: 30,
    costFn: (ctx) => foundingCost(ctx.world),
    params: [
      { name: "name", label: "Nome do partido", type: "text" },
      { name: "acronym", label: "Sigla", type: "text" },
      { name: "number", label: "Número (de 10 a 99)", type: "number" },
      { name: "color", label: "Cor", type: "choice", options: PARTY_COLORS },
      { name: "entry", label: "Como se entra", type: "choice", options: ENTRY_OPTIONS },
    ],
    available: (ctx, p, st) => {
      if (partyInFormationBy(ctx, p.id)) return "Você já está fundando um partido.";
      if (partyFoundedBy(ctx, p.id)) return "Você já fundou um partido.";
      if (p.reputation < 25) return "Exige reputação de pelo menos 25 para reunir fundadores.";
      if (st.money < foundingCost(ctx.world)) return `Custa ${fmtMoney(foundingCost(ctx.world))}.`;
      return null;
    },
    run: ({ ctx, p, params }) => {
      const input = { name: params.name ?? "", acronym: params.acronym ?? "", number: Number(params.number), color: params.color ?? "", entry: (params.entry ?? "") as EntryCulture };
      const err = validateFounding(ctx, p, input);
      if (err) return { ok: false, message: err };
      const party = foundParty(ctx, p, input);
      const f = party.formation!;
      return { ok: true, message: `O ${party.acronym} está em formação. Meta: ${f.goal.toLocaleString("pt-BR")} apoios, com o mínimo em ${f.ufs_needed} estados, até ${formatDatePt(f.deadline)}.` };
    },
  },
  {
    id: "coletar_assinaturas",
    label: "Pagar coleta de assinaturas",
    description: "Equipes contratadas recolhem apoios nas ruas. Escolha um estado ou espalhe pelo país, proporcional ao eleitorado.",
    category: "MEU_PARTIDO",
    energy: 10,
    params: [
      { name: "uf", label: "Onde coletar", type: "uf_br" },
      { name: "amount", label: "Investimento", type: "amount", amounts: [20_000, 60_000, 150_000, 400_000] },
    ],
    available: (ctx, p) => {
      const party = partyInFormationBy(ctx, p.id);
      if (!party) return "Só durante a fundação de um partido.";
      return party.formation?.stage === "APOIAMENTO" ? null : "A coleta está fechada enquanto o TSE confere as assinaturas.";
    },
    run: ({ ctx, p, st, params, rng }) => {
      const party = partyInFormationBy(ctx, p.id)!;
      const amount = pickAmount(ctx, params.amount, [20_000, 60_000, 150_000, 400_000]);
      if (!amount) return { ok: false, message: "Escolha um dos valores." };
      if (st.money < amount) return { ok: false, message: "Saldo insuficiente." };
      const uf = params.uf === "BR" || UF_BY_CODE[params.uf ?? ""] ? params.uf! : "BR";
      st.money -= amount;
      const got = addSignatures(party, uf, (amount / signatureCost(ctx.world)) * rng.range(0.85, 1.1));
      party.formation!.spent += amount;
      ctx.save("parties", party);
      ctx.insert("finance_transactions", { id: ctx.id("fin", p.id, "assinaturas"), world_id: ctx.world.id, person_id: p.id, candidacy_id: null, kind: "COLETA_ASSINATURAS", amount: -amount, declared: true, game_date: ctx.date, description: `Coleta de assinaturas do ${party.acronym} (${uf === "BR" ? "todo o país" : uf})` });
      const prog = formationProgress(party.formation!);
      return { ok: true, message: `${got.toLocaleString("pt-BR")} novos apoios. Total: ${Math.round(prog.pct * 100)}% da meta, ${prog.ufsOk} de ${prog.ufsNeeded} estados com o mínimo.` };
    },
  },
  {
    id: "mobilizar_voluntarios",
    label: "Mutirão de voluntários pela coleta",
    description: "Feiras, igrejas, sindicatos, universidades. De graça, mas cansa; rende mais onde você é conhecido(a).",
    category: "MEU_PARTIDO",
    energy: 25,
    params: [{ name: "uf", label: "Onde", type: "uf", options: ufOptions() }],
    available: (ctx, p) => (partyInFormationBy(ctx, p.id)?.formation?.stage === "APOIAMENTO" ? null : "Só durante a coleta de apoio para um partido."),
    run: ({ ctx, p, st, params, rng, dr }) => {
      const party = partyInFormationBy(ctx, p.id)!;
      const uf = UF_BY_CODE[params.uf ?? ""] ? params.uf! : p.uf;
      const got = addSignatures(party, uf, (1_500 + 25_000 * (st.reach[uf] ?? 0) + st.activism * 40) * dr(`mutirao:${uf}`) * rng.range(0.7, 1.2));
      ctx.save("parties", party);
      const prog = formationProgress(party.formation!);
      return { ok: true, message: `Mutirão em ${UF_BY_CODE[uf].name}: ${got.toLocaleString("pt-BR")} apoios. Total: ${Math.round(prog.pct * 100)}% da meta.` };
    },
  },
  {
    id: "desistir_fundacao",
    confirm: "A fundação será encerrada e todo o dinheiro gasto até aqui fica perdido.",
    label: "Desistir da fundação do partido",
    description: "Encerra a coleta. O dinheiro gasto não volta.",
    category: "MEU_PARTIDO",
    energy: 0,
    available: (ctx, p) => (partyInFormationBy(ctx, p.id) ? null : "Você não está fundando um partido."),
    run: ({ ctx, p }) => {
      const party = partyInFormationBy(ctx, p.id)!;
      party.formation!.stage = "FRACASSADA";
      party.status = "EXTINTO";
      ctx.save("parties", party);
      return { ok: true, message: `A fundação do ${party.acronym} foi encerrada.` };
    },
  },
  {
    id: "filiar_meu_partido",
    confirm: "Se você tem mandato proporcional e está fora da janela partidária, a troca custa o mandato.",
    label: "Filiar-se ao seu partido",
    description: "Para quem fundou o partido tendo mandato proporcional: fora da janela partidária, a troca custa o mandato.",
    category: "MEU_PARTIDO",
    energy: 5,
    available: (ctx, p) => {
      const party = partyFoundedBy(ctx, p.id);
      if (!party) return "Você não fundou um partido registrado.";
      return p.party_id === party.id ? "Você já é do seu partido." : null;
    },
    run: ({ ctx, p }) => ({ ok: true, message: joinOwnParty(ctx, p, partyFoundedBy(ctx, p.id)!) }),
  },
  {
    id: "decidir_filiacao",
    label: "Decidir pedido de filiação",
    description: "Como presidente, você aprova ou recusa quem quer entrar no partido.",
    category: "MEU_PARTIDO",
    energy: 0,
    params: [
      { name: "request", label: "Pedido", type: "party_request" },
      { name: "decision", label: "Decisão", type: "choice", options: [{ value: "ACEITAR", label: "Aprovar" }, { value: "RECUSAR", label: "Recusar" }] },
    ],
    available: (ctx, p) => {
      const party = partyLedBy(ctx, p.id);
      if (!party) return "Só para quem preside um partido.";
      return [...ctx.t.affiliation_requests.values()].some((r) => r.party_id === party.id && r.kind === "PEDIDO" && r.status === "PENDENTE") ? null : "Nenhum pedido aguardando.";
    },
    run: ({ ctx, p, params }) => {
      const party = partyLedBy(ctx, p.id)!;
      const req = ctx.t.affiliation_requests.get(params.request);
      if (!req || req.party_id !== party.id || req.status !== "PENDENTE" || req.kind !== "PEDIDO") return { ok: false, message: "Pedido inválido." };
      return { ok: true, message: decideJoinRequest(ctx, p, req, params.decision === "ACEITAR") };
    },
  },
  {
    id: "convidar_filiacao",
    label: "Convidar alguém para o partido",
    description: "Convide políticos e quadros. A resposta depende da afinidade, do relacionamento com você e da fidelidade partidária.",
    category: "MEU_PARTIDO",
    energy: 10,
    params: [{ name: "target", label: "Pessoa", type: "recruit" }],
    available: (ctx, p) => (partyLedBy(ctx, p.id) ? null : "Só para quem preside um partido."),
    run: ({ ctx, p, params }) => {
      const party = partyLedBy(ctx, p.id)!;
      const target = ctx.person(params.target);
      if (!target || target.status !== "ACTIVE" || target.id === p.id) return { ok: false, message: "Pessoa indisponível." };
      if (isReal(target.kind) && target.tier <= 1) return { ok: false, message: "Lideranças nacionais reais não mudam de partido por convite no jogo." };
      return { ok: true, message: inviteToParty(ctx, p, party, target) };
    },
  },
  {
    id: "indicar_candidato",
    label: "Indicar candidato(a) do partido",
    description: "Escolha um membro da legenda para disputar a eleição. No partido que você preside, a chapa é decisão da presidência; a convenção só confere a elegibilidade.",
    category: "MEU_PARTIDO",
    energy: 5,
    params: [
      { name: "member", label: "Membro", type: "member" },
      { name: "office", label: "Cargo", type: "office" },
    ],
    available: (ctx, p) => {
      const party = partyLedBy(ctx, p.id);
      if (!party?.founder_id) return "Só para quem preside um partido fundado no jogo.";
      const e = indicationElection(ctx);
      if (!e) return "As indicações abrem no ano eleitoral e vão até o fim das convenções.";
      if (!indicableMembers(ctx, party, e).length) return "Nenhum membro fictício disponível: convide gente para o partido.";
      return null;
    },
    run: ({ ctx, p, params }) => {
      const party = partyLedBy(ctx, p.id)!;
      const member = ctx.person(params.member);
      if (!member) return { ok: false, message: "Membro inválido." };
      return indicateCandidate(ctx, party, member, params.office as OfficeCode);
    },
  },
  {
    id: "retirar_indicacao",
    label: "Retirar indicação",
    description: "Desista de um nome antes da convenção.",
    category: "MEU_PARTIDO",
    energy: 0,
    params: [{ name: "indication", label: "Indicação", type: "indication" }],
    available: (ctx, p) => {
      const party = partyLedBy(ctx, p.id);
      return party && pendingIndications(ctx, party).length ? null : "Nenhuma indicação esperando a convenção.";
    },
    run: ({ ctx, p, params }) => withdrawIndication(ctx, partyLedBy(ctx, p.id)!, params.indication),
  },
  {
    id: "repassar_fundo",
    label: "Repassar fundo eleitoral",
    description: "Divida a cota do partido no FEFC entre as candidaturas homologadas. O que sobrar no 1º turno volta ao Tesouro.",
    category: "MEU_PARTIDO",
    energy: 2,
    params: [
      { name: "candidacy", label: "Candidatura", type: "party_candidacy" },
      { name: "share", label: "Quanto", type: "fund_share" },
    ],
    available: (ctx, p) => {
      const party = partyLedBy(ctx, p.id);
      const fund = party?.campaign_fund;
      if (!party || !fund) return "O fundo eleitoral chega ao partido depois das convenções.";
      const e = ctx.t.elections.get(fund.election_id);
      if (!e || ctx.date >= e.first_round) return "Depois do 1º turno, a sobra do fundo volta ao Tesouro.";
      if (fund.left <= 0) return "O fundo do partido já foi todo repassado.";
      if (!fundableCandidacies(ctx, party).length) return "O partido não tem candidaturas homologadas.";
      return null;
    },
    run: ({ ctx, p, params }) => {
      const party = partyLedBy(ctx, p.id)!;
      const pct = Number(params.share);
      if (![10, 25, 50, 100].includes(pct)) return { ok: false, message: "Escolha quanto repassar." };
      return giveFefc(ctx, party, params.candidacy, Math.round(((party.campaign_fund?.left ?? 0) * pct) / 100));
    },
  },
  // ------------------------------------------------------------------ FINANÇAS
  {
    id: "pegar_emprestimo",
    label: "Pegar empréstimo",
    description: "Crédito pessoal com juros mensais (Selic + 2,5% ao mês). O limite depende da sua renda e dos seus bens.",
    category: "FINANCAS",
    energy: 0,
    params: [{ name: "amount", label: "Valor", type: "amount", amounts: [10_000, 50_000, 200_000] }],
    available: () => null,
    run: ({ ctx, st, params }) => {
      const amount = pickAmount(ctx, params.amount, [10_000, 50_000, 200_000]);
      if (!amount) return { ok: false, message: "Escolha um dos valores." };
      const limit = Math.round(st.income_last_year * 0.5 + st.assets * 0.4);
      if (st.debt + amount > limit) return { ok: false, message: `O banco recusou: seu limite de crédito é ${fmtMoney(limit)} e você já deve ${fmtMoney(st.debt)}.` };
      st.money += amount;
      st.debt += amount;
      return { ok: true, message: `${fmtMoney(amount)} na conta. Dívida total: ${fmtMoney(st.debt)}.` };
    },
  },
  {
    id: "quitar_divida",
    label: "Pagar a dívida",
    description: "Use o saldo para abater o que deve e parar de pagar juros.",
    category: "FINANCAS",
    energy: 0,
    params: [{ name: "share", label: "Quanto pagar", type: "choice", options: [{ value: "1", label: "Tudo o que der" }, { value: "0.5", label: "Metade da dívida" }, { value: "0.1", label: "10% da dívida" }] }],
    available: (_c, _p, st) => (st.debt <= 0 ? "Você não tem dívidas." : st.money <= 0 ? "Sem saldo para pagar." : null),
    run: ({ ctx, p, st, params }) => {
      const share = Math.min(1, Math.max(0.1, Number(params.share) || 1));
      const pay = Math.round(Math.min(st.money, st.debt * share));
      st.money -= pay;
      st.debt -= pay;
      ctx.insert("finance_transactions", { id: ctx.id("fin", p.id, "amortizacao"), world_id: ctx.world.id, person_id: p.id, candidacy_id: null, kind: "AMORTIZACAO", amount: -pay, declared: true, game_date: ctx.date, description: "Pagamento de dívida" });
      return { ok: true, message: `Você pagou ${fmtMoney(pay)}. Dívida restante: ${fmtMoney(st.debt)}.` };
    },
  },
];

/** Ações de esquema padrão: oportunidade pelo catálogo, ganho em dinheiro não declarado. */
function schemeAction(o: { id: string; kind: IllicitKind; label: string; description: string; energy: number; after?: (a: RunArgs) => void }): ActionDef {
  return {
    id: o.id,
    label: o.label,
    description: o.description,
    category: "ESQUEMA",
    crime: o.kind,
    energy: o.energy,
    available: (ctx, p) => {
      const reason = crimeOpportunity(ctx, p, o.kind);
      if (reason) return reason;
      if (CRIMES[o.kind].recurring && [...ctx.t.illicit_acts.values()].some((a) => a.person_id === p.id && a.kind === o.kind && a.ongoing)) return "Esse esquema já está em andamento.";
      return null;
    },
    run: (a) => {
      const r = commitCrime(a.ctx, a.p, o.kind);
      o.after?.(a);
      if (r.monthly) return { ok: true, message: `Esquema montado com ${partnerText(r)}: cerca de ${fmtMoney(r.monthly)} por mês ${o.kind === "NEPOTISMO" ? "para a família" : "em dinheiro não declarado"}. Cada mês deixa mais rastro.` };
      return { ok: true, message: `${fmtMoney(r.amount)} em dinheiro não declarado, com ${partnerText(r)}. ${CRIMES[o.kind].sphere === "ELEITORAL" ? "A Justiça Eleitoral pode cassar o registro." : "Há rastro: documentos e testemunhas."}` };
    },
  };
}

function partnerText(r: SchemeResult): string {
  return r.partner ? `${r.partner.name} (${r.partner.role_label ?? "intermediário"})` : "ajuda de terceiros";
}

/** Atos comprovados por achados verificados do dossiê (ainda não descobertos pelas autoridades). */
function provenActs(st: PersonStateRow, key: string): string[] {
  return [...new Set((st.findings[key] ?? []).filter((f) => f.verified && f.act_id).map((f) => f.act_id!))];
}

function intelMessage(who: string, found: Array<{ text: string; verified: boolean; act_id: string | null; crime: IllicitKind | null }>, level: number): string {
  const lines = found.map((f) => (f.act_id ? `Achado: ${f.text}.` : f.verified ? f.text : `Pista sem prova: ${f.text}`));
  return `Dossiê sobre ${who} (${dossierLabel(level)}). ${lines.join(" ")}`;
}

export const ACTIONS_BY_ID: Record<string, ActionDef> = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

function professionIdOf(p: PersonRow): string {
  return p.profession.split("|")[0];
}

/** Retorno decrescente: repetir a mesma ação logo em seguida rende menos. */
export function diminishing(st: PersonStateRow, key: string, tick: number): number {
  const e = st.action_log[key];
  if (!e) return 1;
  const decayed = e.n * Math.pow(0.5, (tick - e.last_tick) / 30);
  return 1 / (1 + 0.5 * decayed);
}

function recordUse(st: PersonStateRow, key: string, tick: number): void {
  const e = st.action_log[key];
  const decayed = e ? e.n * Math.pow(0.5, (tick - e.last_tick) / 30) : 0;
  st.action_log[key] = { n: Math.round((decayed + 1) * 100) / 100, last_tick: tick };
}

/** Preso em regime fechado, só dá para cuidar da defesa e das finanças. */
const JAIL_ALLOWED = new Set(["contratar_defesa", "colaborar", "nota_publica", "quitar_divida", "responder_convite", "decidir_filiacao"]);

function jailReason(ctx: Ctx, st: PersonStateRow, id: string): string | null {
  if (!isJailed(st, ctx.date) || JAIL_ALLOWED.has(id)) return null;
  return `Você está em regime fechado até ${formatDatePt(st.jailed_until!)}.`;
}

export function availableActions(ctx: Ctx, personId: string): Array<{ def: ActionDef; reason: string | null }> {
  const p = ctx.person(personId);
  const st = ctx.pstate(personId);
  if (!p || !st) return [];
  return ACTIONS.map((def) => {
    let reason = jailReason(ctx, st, def.id) ?? def.available(ctx, p, st);
    if (!reason && st.energy < def.energy) reason = `Energia insuficiente (${def.energy}).`;
    return { def, reason };
  });
}

export function performAction(ctx: Ctx, personId: string, actionId: string, params: Record<string, string> = {}): ActionResult {
  const p = ctx.person(personId);
  const st = ctx.pstate(personId);
  const def = ACTIONS_BY_ID[actionId];
  if (!p || !st || p.kind !== "PLAYER") return { ok: false, message: "Personagem não encontrado." };
  if (p.status !== "ACTIVE") return { ok: false, message: "Seu personagem está fora da vida pública." };
  if (!def) return { ok: false, message: "Ação desconhecida." };
  const reason = jailReason(ctx, st, def.id) ?? def.available(ctx, p, st);
  if (reason) return { ok: false, message: reason };
  if (st.energy < def.energy) return { ok: false, message: `Energia insuficiente: esta ação exige ${def.energy}.` };
  for (const param of def.params ?? []) {
    if (!param.optional && !params[param.name]) return { ok: false, message: `Informe: ${param.label}.` };
  }
  const usedKeys: string[] = [];
  const rng = ctx.rng(`action:${actionId}`, `${personId}:${st.action_seq}`);
  const dr = (key: string) => {
    usedKeys.push(key);
    return diminishing(st, key, ctx.tick);
  };
  const repBefore = p.reputation;
  const standingBefore = st.party_standing;
  const reachBefore = { ...st.reach };
  const result = def.run({ ctx, p, st, params, rng, dr });
  if (!result.ok) return result;
  // quanto mais alto, mais devagar se sobe (as quedas valem por inteiro); e reputação não se fabrica em série:
  // o que passa de ~2,5 pontos por semana em ações rende só uma fração
  if (p.reputation > repBefore) {
    const gain = reputationGain(repBefore, p.reputation - repBefore);
    const log = st.action_log.__rep;
    const used = log ? log.n * Math.pow(0.5, (ctx.tick - log.last_tick) / 7) : 0;
    const room = Math.max(0, 2.5 - used);
    const granted = Math.min(gain, room) + Math.max(0, gain - room) * 0.15;
    p.reputation = repBefore + granted;
    st.action_log.__rep = { n: Math.round((used + granted) * 100) / 100, last_tick: ctx.tick };
  }
  if (st.party_standing > standingBefore && p.party_id) st.party_standing = standingBefore + standingGain(standingBefore, st.party_standing - standingBefore);
  // fora da campanha, o nome se espalha devagar pelo estado (mais devagar nos estados grandes)
  if (def.category !== "CAMPANHA") {
    for (const [uf, v] of Object.entries(st.reach)) {
      const b = reachBefore[uf] ?? 0;
      if (v > b) st.reach[uf] = b + (v - b) * reachScale(uf);
    }
  }
  st.energy = Math.max(0, st.energy - def.energy);
  st.action_seq += 1;
  st.last_action_tick = ctx.tick;
  for (const k of usedKeys.length ? usedKeys : [actionId]) recordUse(st, k, ctx.tick);
  p.reputation = Math.round(p.reputation * 10) / 10;
  ctx.save("persons", p);
  ctx.save("person_states", st);
  ctx.emit("PLAYER_ACTION", { actors: [personId], geography: p.uf, payload: { action: actionId, params, message: result.message } });
  afterAction(ctx, personId, actionId, params);
  checkAchievements(ctx, p);
  return result;
}

export const OFFICE_CHOICES = (Object.keys(OFFICES) as OfficeCode[]).map((c) => ({ value: c, label: OFFICES[c].name }));

export type { RaceRow };
