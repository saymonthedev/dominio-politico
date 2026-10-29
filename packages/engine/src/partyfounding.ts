import { joinParty, relationshipScore } from "./affiliation";
import { addDays, diffDays } from "./calendar";
import { worldPriceLevel, type PricedWorld } from "./finance";
import { UF_BY_CODE, UF_CODES } from "./geo";
import { ideologyAffinity } from "./ideology";
import { moderateText } from "./news/moderation";
import { isReal } from "./news/policy";
import { eraRules, OFFICES } from "./ruleset";
import type { Ctx } from "./state";
import type { AffiliationRequestRow, EntryCulture, PartyFormation, PartyRow, PersonRow } from "./types";

/**
 * Fundar um partido (Lei 9.096/95): estatuto e fundadores, apoiamento de
 * eleitores em dois anos (0,5% dos votos válidos da última eleição para a
 * Câmara, espalhados por um terço das UFs com ao menos 0,1% do eleitorado de
 * cada uma), conferência das assinaturas e registro no TSE.
 *
 * Depois do registro, o fundador preside a legenda e decide quem entra:
 * políticos (personagens e pessoas reais, como movimento político simulado)
 * podem pedir filiação, e o presidente pode convidar.
 */

export const PARTY_COLORS: Array<{ value: string; label: string }> = [
  { value: "#c62828", label: "Vermelho" },
  { value: "#ad1457", label: "Vinho" },
  { value: "#6a1b9a", label: "Roxo" },
  { value: "#283593", label: "Azul-marinho" },
  { value: "#1565c0", label: "Azul" },
  { value: "#00838f", label: "Azul-petróleo" },
  { value: "#2e7d32", label: "Verde" },
  { value: "#558b2f", label: "Verde-oliva" },
  { value: "#f9a825", label: "Amarelo" },
  { value: "#ef6c00", label: "Laranja" },
  { value: "#5d4037", label: "Marrom" },
  { value: "#37474f", label: "Grafite" },
];

export const ENTRY_OPTIONS: Array<{ value: EntryCulture; label: string }> = [
  { value: "ABERTO", label: "Portas abertas: qualquer um pode pedir" },
  { value: "RELACIONAMENTO", label: "Por indicação: valoriza quem tem padrinho" },
  { value: "CONVITE", label: "Só por convite da direção" },
];

/** Custo inicial: assessoria jurídica, estatuto, registro civil e estrutura de coleta. */
export function foundingCost(world: PricedWorld): number {
  return Math.round((120_000 * worldPriceLevel(world)) / 1000) * 1000;
}

/** Custo médio por assinatura numa coleta paga. */
export function signatureCost(world: PricedWorld): number {
  return Math.round(2.5 * worldPriceLevel(world) * 100) / 100;
}

function electorateTotal(): number {
  return UF_CODES.reduce((s, uf) => s + UF_BY_CODE[uf].electorate, 0);
}

export function formationGoals(): { goal: number; uf_goal: Record<string, number>; ufs_needed: number } {
  // 0,5% dos votos válidos para a Câmara (~72% do eleitorado comparece e vota válido)
  const goal = Math.round((electorateTotal() * 0.72 * 0.005) / 100) * 100;
  const uf_goal: Record<string, number> = {};
  for (const uf of UF_CODES) uf_goal[uf] = Math.max(100, Math.round(UF_BY_CODE[uf].electorate * 0.001));
  return { goal, uf_goal, ufs_needed: Math.ceil(UF_CODES.length / 3) };
}

export function formationProgress(f: PartyFormation): { pct: number; ufsOk: number; ufsNeeded: number; ready: boolean } {
  const ufsOk = Object.entries(f.uf_goal).filter(([uf, g]) => (f.by_uf[uf] ?? 0) >= g).length;
  return { pct: Math.min(1, f.signatures / f.goal), ufsOk, ufsNeeded: f.ufs_needed, ready: f.signatures >= f.goal && ufsOk >= f.ufs_needed };
}

export function partyInFormationBy(ctx: Ctx, personId: string): PartyRow | undefined {
  return [...ctx.t.parties.values()].find((p) => p.founder_id === personId && p.status === "EM_FORMACAO");
}

export function partyFoundedBy(ctx: Ctx, personId: string): PartyRow | undefined {
  return [...ctx.t.parties.values()].find((p) => p.founder_id === personId && p.status === "ATIVO");
}

/** Partido presidido por um jogador: ele decide quem entra. */
export function isPlayerLed(ctx: Ctx, party: PartyRow): boolean {
  const pres = ctx.person(party.president_id);
  return !!party.founder_id && !!pres && pres.kind === "PLAYER";
}

/**
 * Fidelidade partidária: quem tem mandato proporcional só troca de legenda
 * sem perder o cargo na janela partidária. Até a Lei 13.165/2015, a criação
 * de um partido novo era justa causa (Res. TSE 22.610/2007) para quem migrasse
 * em até 30 dias do registro. Mandatos majoritários não se sujeitam à regra
 * (STF, ADI 5.081).
 */
export function switchBlocked(ctx: Ctx, person: PersonRow, target: PartyRow): string | null {
  if (!person.office_code || OFFICES[person.office_code].system !== "PROPORCIONAL") return null;
  const year = Number(ctx.date.slice(0, 4));
  if (!eraRules(year).partyFidelity) return null;
  if (target.founded_on && ctx.date < "2015-09-29" && diffDays(ctx.date, target.founded_on) <= 30) return null;
  const inWindow = [...ctx.t.elections.values()].some((e) => ctx.date >= e.calendar.partySwitchWindowStart && ctx.date <= e.calendar.partySwitchWindowEnd);
  if (inWindow) return null;
  return "Fora da janela partidária, trocar de partido custa o mandato proporcional (infidelidade partidária).";
}

export interface FoundInput {
  name: string;
  acronym: string;
  number: number;
  color: string;
  entry: EntryCulture;
}

export function validateFounding(ctx: Ctx, p: PersonRow, input: FoundInput): string | null {
  const st = ctx.pstate(p.id);
  if (!st) return "Sem estado.";
  if (partyInFormationBy(ctx, p.id)) return "Você já está fundando um partido.";
  if (partyFoundedBy(ctx, p.id)) return "Você já fundou um partido.";
  if (p.reputation < 25) return "Reputação mínima de 25 para reunir fundadores.";
  const cost = foundingCost(ctx.world);
  if (st.money < cost) return `Custa R$ ${cost.toLocaleString("pt-BR")} (estatuto, advogados, registro e estrutura de coleta).`;
  const realNames = [...ctx.t.persons.values()].filter((x) => isReal(x.kind) && x.name.split(" ").length >= 2).map((x) => x.name);
  const name = input.name.trim().replace(/\s+/g, " ");
  const mod = moderateText(name, { minLength: 6, maxLength: 50, extraRealNames: realNames });
  if (!mod.ok) return `Nome: ${mod.reason}`;
  const acronym = input.acronym.trim().toUpperCase();
  if (!/^[A-ZÀ-Ý0-9]{2,12}$/.test(acronym)) return "Sigla: de 2 a 12 letras ou números, sem espaços.";
  const modAcr = moderateText(acronym, { minLength: 2, maxLength: 12, checkRealNames: false });
  if (!modAcr.ok) return `Sigla: ${modAcr.reason}`;
  const all = [...ctx.t.parties.values()].filter((x) => x.status !== "EXTINTO");
  if (all.some((x) => x.acronym.toUpperCase() === acronym)) return "Já existe um partido com essa sigla.";
  if (all.some((x) => x.name.toLowerCase() === name.toLowerCase())) return "Já existe um partido com esse nome.";
  const n = Math.floor(Number(input.number));
  if (!Number.isFinite(n) || n < 10 || n > 99) return "Número: de 10 a 99.";
  if (all.some((x) => x.number === n)) return `O número ${n} já pertence a outro partido.`;
  if (!PARTY_COLORS.some((c) => c.value === input.color)) return "Escolha uma cor da lista.";
  if (!ENTRY_OPTIONS.some((e) => e.value === input.entry)) return "Escolha como as pessoas entram no partido.";
  return null;
}

/** Inicia a fundação: o partido existe "em formação" até o registro no TSE. */
export function foundParty(ctx: Ctx, p: PersonRow, input: FoundInput): PartyRow {
  const st = ctx.pstate(p.id)!;
  const cost = foundingCost(ctx.world);
  st.money -= cost;
  const goals = formationGoals();
  const formation: PartyFormation = {
    stage: "APOIAMENTO",
    started_on: ctx.date,
    deadline: addDays(ctx.date, 730),
    goal: goals.goal,
    uf_goal: goals.uf_goal,
    ufs_needed: goals.ufs_needed,
    signatures: 0,
    by_uf: {},
    spent: cost,
    registry_on: null,
    rejected: 0,
    founder_pending: false,
  };
  const acronym = input.acronym.trim().toUpperCase();
  const party: PartyRow = {
    id: ctx.id("pty", p.id, acronym),
    world_id: ctx.world.id,
    name: input.name.trim().replace(/\s+/g, " "),
    acronym,
    number: Math.floor(Number(input.number)),
    ideology: { ...p.ideology },
    entry_culture: input.entry,
    reputation: Math.round(Math.min(70, 10 + p.reputation * 0.6)),
    cash: 0,
    discipline: 0.6,
    color: input.color,
    description: `Partido criado por ${p.name} na linha do tempo simulada.`,
    gov_alignment: 0,
    president_id: p.id,
    territory: {},
    seats: {},
    members: 0,
    integrity: 0.5,
    federation: null,
    federation_name: null,
    is_fictional: true,
    status: "EM_FORMACAO",
    founder_id: p.id,
    founded_on: null,
    formation,
    fund_suspended_until: null,
    campaign_fund: null,
  };
  ctx.save("parties", party);
  ctx.save("person_states", st);
  ctx.insert("finance_transactions", { id: ctx.id("fin", p.id, "fundacao"), world_id: ctx.world.id, person_id: p.id, candidacy_id: null, kind: "FUNDACAO_PARTIDO", amount: -cost, declared: true, game_date: ctx.date, description: `Fundação do ${acronym}: estatuto, advogados e registro` });
  ctx.emit("PARTY_FOUNDING_STARTED", { actors: [p.id], geography: p.uf, payload: { party: party.id } });
  ctx.publish("WORLD_EVENT", {
    facts: { title: `Grupo liderado por ${p.name} começa a coletar assinaturas para criar o ${acronym}`, body: `O ${party.name} precisa de cerca de ${goals.goal.toLocaleString("pt-BR")} apoios de eleitores em pelo menos ${goals.ufs_needed} estados em até dois anos para pedir o registro ao TSE.` },
    personIds: [p.id],
    geography: p.uf,
    importance: 1,
  });
  return party;
}

/** Soma assinaturas a uma UF ("BR" espalha pelo país, proporcional ao eleitorado). */
export function addSignatures(party: PartyRow, uf: string, amount: number): number {
  const f = party.formation!;
  const n = Math.max(0, Math.round(amount));
  if (!n) return 0;
  if (uf === "BR") {
    const total = electorateTotal();
    let given = 0;
    for (const code of UF_CODES) {
      const share = Math.round((n * UF_BY_CODE[code].electorate) / total);
      f.by_uf[code] = (f.by_uf[code] ?? 0) + share;
      given += share;
    }
    f.signatures += given;
    return given;
  }
  f.by_uf[uf] = (f.by_uf[uf] ?? 0) + n;
  f.signatures += n;
  return n;
}

/** Diário: apoio espontâneo, conferência no TSE, registro ou prazo vencido. */
export function dailyPartyFormation(ctx: Ctx): void {
  for (const party of ctx.t.parties.values()) {
    if (party.status !== "EM_FORMACAO" || !party.formation) continue;
    const f = party.formation;
    const founder = ctx.person(party.founder_id);
    const st = founder ? ctx.pstate(founder.id) : undefined;
    if (!founder || !st || founder.status !== "ACTIVE") {
      f.stage = "FRACASSADA";
      party.status = "EXTINTO";
      ctx.save("parties", party);
      continue;
    }
    if (f.stage === "APOIAMENTO") {
      // apoio espontâneo: nome conhecido, reputação e apoiadores próximos
      const supporters = Math.min(20, [...ctx.t.relationships.values()].filter((r) => r.a_id === founder.id && r.score >= 40).length);
      const rep = founder.reputation / 100;
      for (const [uf, reach] of Object.entries(st.reach)) {
        if (reach <= 0) continue;
        addSignatures(party, uf, (40 + 3500 * reach) * rep * ctx.rng("sig", `${party.id}:${uf}`).range(0.6, 1.3));
      }
      if (supporters) addSignatures(party, founder.uf, supporters * 60);
      const prog = formationProgress(f);
      if (prog.ready) {
        f.stage = "REGISTRO";
        f.registry_on = addDays(ctx.date, ctx.rng("registry", party.id).int(90, 150));
        ctx.notify(founder.id, `${party.acronym}: pedido de registro protocolado`, `As assinaturas foram entregues. O TSE confere os apoios e julga o registro até ${f.registry_on.split("-").reverse().join("/")}.`, "/jogo/meu-partido");
      } else if (ctx.date > f.deadline) {
        f.stage = "FRACASSADA";
        party.status = "EXTINTO";
        ctx.notify(founder.id, `${party.acronym} não conseguiu o registro`, "O prazo de dois anos para o apoiamento terminou sem as assinaturas necessárias.", "/jogo/meu-partido");
        ctx.publish("WORLD_EVENT", { facts: { title: `Criação do ${party.acronym} não sai do papel`, body: `O grupo liderado por ${founder.name} não reuniu os apoios exigidos dentro do prazo.` }, personIds: [founder.id], geography: founder.uf, importance: 1 });
      }
      ctx.save("parties", party);
      continue;
    }
    if (f.stage === "REGISTRO" && f.registry_on && ctx.date >= f.registry_on) {
      const rng = ctx.rng("registry-check", party.id);
      // conferência: parte das assinaturas é invalidada (duplicadas, eleitores filiados, títulos irregulares)
      const rate = rng.range(0.05, 0.15);
      const rejected = Math.round(f.signatures * rate);
      f.rejected += rejected;
      for (const uf of Object.keys(f.by_uf)) f.by_uf[uf] = Math.round(f.by_uf[uf] * (1 - rate));
      f.signatures -= rejected;
      if (!formationProgress(f).ready) {
        f.stage = "APOIAMENTO";
        f.registry_on = null;
        ctx.notify(founder.id, `${party.acronym}: TSE invalidou assinaturas`, `${rejected.toLocaleString("pt-BR")} apoios foram invalidados na conferência e o partido ficou abaixo do mínimo. A coleta continua até o fim do prazo.`, "/jogo/meu-partido");
        ctx.save("parties", party);
        continue;
      }
      registerParty(ctx, party, founder);
    }
  }
}

function registerParty(ctx: Ctx, party: PartyRow, founder: PersonRow): void {
  const f = party.formation!;
  f.stage = "CONCLUIDA";
  party.status = "ATIVO";
  party.founded_on = ctx.date;
  party.members = Math.round(f.signatures * 0.02);
  const max = Math.max(...Object.values(f.by_uf), 1);
  for (const [uf, n] of Object.entries(f.by_uf)) party.territory[uf] = Math.round(Math.min(0.12, (n / max) * 0.08) * 1000) / 1000;
  ctx.save("parties", party);
  ctx.save("factions", { id: ctx.id("fac", party.id), world_id: ctx.world.id, party_id: party.id, name: "Grupo fundador", ideology: { ...party.ideology }, strength: 1, leader_id: founder.id });
  const blocked = founder.party_id !== party.id ? switchBlocked(ctx, founder, party) : null;
  if (blocked) {
    f.founder_pending = true;
    ctx.notify(founder.id, `${party.acronym} registrado!`, `O TSE aprovou o registro. Como você tem mandato proporcional, a filiação ao novo partido fora da janela partidária custaria o mandato. Use "Filiar-se ao seu partido" quando quiser.`, "/jogo/meu-partido");
  } else {
    joinParty(ctx, founder, party);
    const st = ctx.pstate(founder.id)!;
    st.party_standing = 100;
    ctx.save("person_states", st);
    markPresident(ctx, founder, party);
    ctx.notify(founder.id, `${party.acronym} registrado!`, `O TSE aprovou o registro do ${party.name}. Você é o(a) presidente da legenda e decide quem entra.`, "/jogo/meu-partido");
  }
  ctx.save("parties", party);
  ctx.publish("WORLD_EVENT", {
    facts: { title: `TSE aprova o registro do ${party.acronym}, partido fundado por ${founder.name}`, body: `Com ${f.signatures.toLocaleString("pt-BR")} apoios validados, o ${party.name} (nº ${party.number}) passa a existir oficialmente e pode disputar as próximas eleições.` },
    personIds: [founder.id],
    geography: founder.uf,
    importance: 2,
  });
}

function markPresident(ctx: Ctx, person: PersonRow, party: PartyRow): void {
  for (const m of ctx.t.memberships.values()) {
    if (m.person_id === person.id && m.party_id === party.id && m.status === "ATIVA" && m.role !== "PRESIDENTE") {
      m.role = "PRESIDENTE";
      ctx.save("memberships", m);
    }
  }
  if (person.stage === "FILIADO") {
    person.stage = "QUADRO";
    ctx.save("persons", person);
  }
}

/** O fundador com mandato proporcional entra no partido quando decidir (na janela, sem perder o mandato). */
export function joinOwnParty(ctx: Ctx, founder: PersonRow, party: PartyRow): string {
  const blocked = switchBlocked(ctx, founder, party);
  let lost = false;
  if (blocked) {
    for (const m of ctx.t.mandates.values()) {
      if (m.person_id === founder.id && m.status === "ATIVO") {
        m.status = "ENCERRADO";
        m.end_on = ctx.date;
        ctx.save("mandates", m);
        lost = true;
      }
    }
    founder.office_code = null;
    founder.office_geo = null;
  }
  joinParty(ctx, founder, party);
  const st = ctx.pstate(founder.id)!;
  st.party_standing = 100;
  ctx.save("person_states", st);
  markPresident(ctx, founder, party);
  if (party.formation) {
    party.formation.founder_pending = false;
    ctx.save("parties", party);
  }
  return lost ? `Você se filiou ao ${party.acronym} fora da janela e perdeu o mandato por infidelidade partidária.` : `Você se filiou ao ${party.acronym} e assumiu a presidência.`;
}

/** Utilidade de um político trocar de legenda para um partido presidido por jogador. */
function joinUtility(ctx: Ctx, person: PersonRow, party: PartyRow): number {
  const founder = ctx.person(party.president_id);
  const current = person.party_id ? ctx.t.parties.get(person.party_id) : undefined;
  const aff = ideologyAffinity(person.ideology, party.ideology);
  const curAff = current ? ideologyAffinity(person.ideology, current.ideology) : 0.4;
  const rel = founder ? relationshipScore(ctx, founder.id, person.id) : 0;
  const size = Math.min(0.6, party.members / 20_000);
  return (aff - curAff) * 2.2 + (founder?.reputation ?? 30) / 120 + (party.territory[person.uf] ?? 0) * 1.5 + rel / 60 + size + (current ? 0 : 0.5) - (current && (current.seats.camara ?? 0) > 40 ? 0.3 : 0);
}

function joinable(ctx: Ctx, person: PersonRow, party: PartyRow): boolean {
  if (person.kind === "PLAYER" || person.status !== "ACTIVE" || person.party_id === party.id) return false;
  // pessoas reais: só movimentos políticos plausíveis (sem lideranças nacionais)
  if (isReal(person.kind) && person.tier <= 1) return false;
  return !switchBlocked(ctx, person, party);
}

/** Semanal: políticos procuram partidos presididos por jogadores. */
export function playerPartyRecruitment(ctx: Ctx): void {
  for (const party of ctx.t.parties.values()) {
    if (party.status !== "ATIVO" || !isPlayerLed(ctx, party)) continue;
    const founder = ctx.person(party.president_id)!;
    const pending = [...ctx.t.affiliation_requests.values()].filter((r) => r.party_id === party.id && r.status === "PENDENTE" && r.kind === "PEDIDO").length;
    if (pending >= 6) continue;
    const rng = ctx.rng("recruit", party.id);
    const strongUfs = new Set([founder.uf, ...Object.entries(party.territory).filter(([, v]) => v >= 0.02).map(([uf]) => uf)]);
    const pool = [...ctx.t.persons.values()].filter((p) => strongUfs.has(p.uf) && joinable(ctx, p, party));
    const already = new Set([...ctx.t.affiliation_requests.values()].filter((r) => r.party_id === party.id && (r.status === "PENDENTE" || r.created_on > addDays(ctx.date, -120))).map((r) => r.person_id));
    let sent = 0;
    for (const p of rng.shuffle(pool)) {
      if (sent >= 2) break;
      if (already.has(p.id)) continue;
      const u = joinUtility(ctx, p, party);
      const chance = (1 / (1 + Math.exp(-(u - 0.9) * 3))) * (isReal(p.kind) ? 0.08 : 0.25);
      if (!rng.chance(chance)) continue;
      const req: AffiliationRequestRow = {
        id: ctx.id("aff", p.id, party.id),
        world_id: ctx.world.id,
        person_id: p.id,
        party_id: party.id,
        kind: "PEDIDO",
        created_on: ctx.date,
        decide_on: addDays(ctx.date, 30),
        status: "PENDENTE",
        breakdown: { utilidade: Math.round(u * 100) / 100 },
        reason: requestReason(ctx, p, party),
      };
      ctx.save("affiliation_requests", req);
      ctx.notify(founder.id, `Pedido de filiação ao ${party.acronym}`, `${p.name} (${p.office_code ? OFFICES[p.office_code].name : p.role_label ?? "político(a)"}, ${p.uf}) quer entrar no partido. ${req.reason}`, "/jogo/meu-partido");
      sent++;
    }
  }
}

function requestReason(ctx: Ctx, p: PersonRow, party: PartyRow): string {
  // pessoas reais: nada de motivação ou fala inventada, só o movimento simulado
  if (isReal(p.kind)) return "Pedido de filiação na linha do tempo simulada.";
  const current = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
  const aff = ideologyAffinity(p.ideology, party.ideology);
  if (!current) return "Está sem partido e se identifica com o programa.";
  if (aff > ideologyAffinity(p.ideology, current.ideology) + 0.1) return `Diz ter mais afinidade com o ${party.acronym} do que com o ${current.acronym}.`;
  return `Busca mais espaço do que tem no ${current.acronym}.`;
}

/** O presidente decide um pedido de filiação ao seu partido. */
export function decideJoinRequest(ctx: Ctx, president: PersonRow, req: AffiliationRequestRow, accept: boolean): string {
  const party = ctx.t.parties.get(req.party_id)!;
  const person = ctx.person(req.person_id);
  if (!person || person.status !== "ACTIVE") {
    req.status = "EXPIRADO";
    ctx.save("affiliation_requests", req);
    return "Essa pessoa não está mais disponível.";
  }
  if (!accept) {
    req.status = "RECUSADO";
    req.reason = `Recusado pela presidência do ${party.acronym}.`;
    ctx.save("affiliation_requests", req);
    ctx.notify(person.id, `Filiação recusada: ${party.acronym}`, `A presidência do ${party.acronym} recusou seu pedido.`, "/jogo/partidos");
    return `Pedido de ${person.name} recusado.`;
  }
  const blocked = person.kind !== "PLAYER" ? switchBlocked(ctx, person, party) : null;
  if (blocked) {
    req.status = "EXPIRADO";
    ctx.save("affiliation_requests", req);
    return `${person.name} desistiu: ${blocked}`;
  }
  const from = person.party_id ? ctx.t.parties.get(person.party_id) : undefined;
  req.status = "ACEITO";
  ctx.save("affiliation_requests", req);
  joinParty(ctx, person, party);
  if (person.office_code) person.stage = "MANDATO";
  else if (person.kind !== "PLAYER") person.stage = "QUADRO";
  ctx.save("persons", person);
  ctx.notify(person.id, `Filiação aprovada: ${party.acronym}`, `${president.name} aprovou sua entrada no ${party.acronym}.`, "/jogo/carreira");
  if (from) {
    ctx.publish("NPC_PARTY_SWITCH", { facts: { name: person.name, fromParty: from.acronym, toParty: party.acronym, uf: person.uf }, personIds: [person.id], geography: person.uf });
  }
  return `${person.name} agora é do ${party.acronym}.`;
}

/** O presidente convida alguém; a resposta vem em até uma semana. */
export function inviteToParty(ctx: Ctx, president: PersonRow, party: PartyRow, target: PersonRow): string {
  if (target.party_id === party.id) return `${target.name} já é do ${party.acronym}.`;
  if ([...ctx.t.affiliation_requests.values()].some((r) => r.person_id === target.id && r.party_id === party.id && r.status === "PENDENTE")) return "Já existe um convite ou pedido em aberto com essa pessoa.";
  const req: AffiliationRequestRow = {
    id: ctx.id("inv", target.id, party.id),
    world_id: ctx.world.id,
    person_id: target.id,
    party_id: party.id,
    kind: "CONVITE",
    created_on: ctx.date,
    decide_on: target.kind === "PLAYER" ? addDays(ctx.date, 30) : addDays(ctx.date, ctx.rng("invite-delay", target.id).int(3, 7)),
    status: "PENDENTE",
    breakdown: {},
    reason: `Convite feito por ${president.name}, presidente do ${party.acronym}.`,
  };
  ctx.save("affiliation_requests", req);
  if (target.kind === "PLAYER") ctx.notify(target.id, `Convite de filiação: ${party.acronym}`, `${president.name} convidou você para o ${party.acronym}. O convite vale por 30 dias.`, `convite:${req.id}`);
  return `Convite enviado a ${target.name}. A resposta sai em alguns dias.`;
}

/** Diário: personagens respondem convites de partidos presididos por jogadores. */
export function processPartyInvites(ctx: Ctx): void {
  for (const req of ctx.t.affiliation_requests.values()) {
    if (req.status !== "PENDENTE" || req.decide_on > ctx.date) continue;
    const party = ctx.t.parties.get(req.party_id);
    if (!party || !isPlayerLed(ctx, party)) continue;
    const person = ctx.person(req.person_id);
    const president = ctx.person(party.president_id)!;
    if (req.kind === "PEDIDO") {
      // pedido sem resposta do presidente expira
      req.status = "EXPIRADO";
      ctx.save("affiliation_requests", req);
      if (person) ctx.notify(person.id, `Pedido ao ${party.acronym} expirou`, "A presidência não respondeu a tempo.", "/jogo/partidos");
      continue;
    }
    if (!person || person.kind === "PLAYER") continue;
    const u = joinUtility(ctx, person, party) + 0.4;
    const blocked = !joinable(ctx, person, party);
    const accept = !blocked && ctx.rng("invite-answer", req.id).chance(1 / (1 + Math.exp(-(u - 0.9) * 3)));
    req.status = accept ? "ACEITO" : "RECUSADO";
    ctx.save("affiliation_requests", req);
    if (accept) {
      const from = person.party_id ? ctx.t.parties.get(person.party_id) : undefined;
      joinParty(ctx, person, party);
      if (person.office_code) person.stage = "MANDATO";
      else person.stage = "QUADRO";
      ctx.save("persons", person);
      ctx.notify(president.id, `${person.name} aceitou o convite`, `${person.name} agora é do ${party.acronym}.`, "/jogo/meu-partido");
      if (from) ctx.publish("NPC_PARTY_SWITCH", { facts: { name: person.name, fromParty: from.acronym, toParty: party.acronym, uf: person.uf }, personIds: [person.id], geography: person.uf });
    } else {
      ctx.notify(president.id, `${person.name} recusou o convite`, blocked ? `${person.name} não pode trocar de partido agora sem perder o mandato.` : `${person.name} preferiu continuar onde está.`, "/jogo/meu-partido");
    }
  }
}
