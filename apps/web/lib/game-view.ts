/**
 * Leituras do estado do mundo para as telas do jogo: próximos passos da
 * carreira, agenda com prazos e pendências que pedem resposta do jogador.
 */
import {
  acceptanceProbability,
  computeAffiliation,
  Ctx,
  geoName,
  ideologyAffinity,

  OFFICES,
  type ElectionRow,
  type PartyRow,
  type PersonRow,
  type PersonStateRow,
  type WorldState,
} from "@dp/engine";

const DAY = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export interface Step {
  title: string;
  detail: string;
  /** progresso até a meta (0..1), quando houver */
  progress?: { value: number; goal: number; label: string };
  /** atalho: ação do motor com parâmetros prontos */
  action?: { id: string; label: string; params?: Record<string, string> };
  href?: { label: string; to: string };
}

/** Próximos passos concretos para a etapa atual da carreira. */
export function careerSteps(state: WorldState, me: PersonRow, st: PersonStateRow, year: number): Step[] {
  const base = `/jogo/${year}`;
  const steps: Step[] = [];
  const next = nextElection(state);
  switch (me.stage) {
    case "CIDADAO":
      steps.push({
        title: "Torne-se ativista",
        detail: "Eventos comunitários e voluntariado constroem seu ativismo. Com 20 pontos, você passa a ser visto(a) como ativista.",
        progress: { value: st.activism, goal: 20, label: "ativismo" },
        action: { id: "evento_local", label: "Ir a um evento comunitário" },
      });
      break;
    case "ATIVISTA":
      steps.push({
        title: "Aproxime-se de um partido",
        detail: "Vá a uma reunião aberta do partido com que você tem mais afinidade. É assim que você conhece as lideranças.",
        href: { label: "Ver partidos com mais afinidade", to: `${base}/partidos` },
      });
      break;
    case "APROXIMACAO":
      steps.push({
        title: "Peça filiação",
        detail: "A aprovação depende da afinidade, do seu relacionamento com gente de dentro e da cultura de entrada de cada legenda.",
        href: { label: "Escolher partido", to: `${base}/partidos` },
      });
      break;
    case "FILIADO":
      steps.push({
        title: "Ganhe prestígio no partido",
        detail: "Trabalho de base e presença nas reuniões aumentam seu prestígio. Com 45, você vira quadro partidário e pode disputar convenções.",
        progress: { value: st.party_standing, goal: 45, label: "prestígio interno" },
        action: { id: "militancia", label: "Fazer trabalho de base" },
      });
      break;
    case "QUADRO":
      steps.push(
        next && next.status !== "ENCERRADA"
          ? {
              title: `Prepare a pré-candidatura de ${next.year}`,
              detail: `A pré-campanha abre em ${fmt(next.calendar.preCampaignStart)} e as convenções terminam em ${fmt(next.calendar.conventionEnd)}. Prestígio e reputação pesam na escolha.`,
              href: { label: "Ir para a campanha", to: `${base}/campanha` },
            }
          : { title: "Fortaleça sua posição", detail: "Construa reputação e relações enquanto a próxima eleição não chega.", action: { id: "militancia", label: "Fazer trabalho de base" } },
      );
      break;
    case "PRE_CANDIDATO":
      steps.push({ title: "Vença a convenção", detail: "Prestígio interno, reputação e apoio de uma ala decidem quem o partido indica.", href: { label: "Acompanhar a campanha", to: `${base}/campanha` } });
      break;
    case "CANDIDATO":
      steps.push({ title: "Faça campanha", detail: "Comícios, entrevistas, propostas, arrecadação e debates. Acompanhe as pesquisas.", href: { label: "Abrir a campanha", to: `${base}/campanha` } });
      break;
    case "MANDATO":
      steps.push({ title: "Exerça o mandato", detail: "Vote, apresente projetos, destine emendas e prepare o próximo degrau.", href: { label: "Abrir governo e plenário", to: `${base}/governo` } });
      break;
  }
  if (me.party_id === null && (me.stage === "CIDADAO" || me.stage === "ATIVISTA")) {
    steps.push({ title: "Conheça gente", detail: "Converse com lideranças da sua região: convites de filiação vêm de quem gosta de você.", href: { label: "Ver relações", to: `${base}/relacoes` } });
  }
  if (st.energy < 20) {
    steps.push({ title: "Recupere energia", detail: "Você recupera 25 de energia por dia de jogo. Passe o tempo no Painel para descansar.", href: { label: "Passar o tempo", to: `${base}#tempo` } });
  }
  if (st.money < 2_000) {
    steps.push({ title: "Reforce o caixa", detail: "Trabalhar na sua profissão traz renda para bancar as próximas ações.", action: { id: "trabalhar", label: "Trabalhar" } });
  }
  return steps;
}

function fmt(d: string) {
  return d.split("-").reverse().join("/");
}

export function nextElection(state: WorldState): ElectionRow | undefined {
  return [...state.t.elections.values()].filter((e) => e.status !== "ENCERRADA").sort((a, b) => a.year - b.year)[0];
}

export interface AgendaItem {
  date: string;
  days: number;
  title: string;
  detail: string;
  tone: "info" | "warn" | "hot";
  /** verbete do glossário que explica o item */
  term?: string;
}

/** Prazos e datas do calendário a partir de hoje (eleição, posse, debates e votações do jogador). */
export function agenda(state: WorldState, me: PersonRow, limit = 8): AgendaItem[] {
  const today = state.world.game_date;
  const items: AgendaItem[] = [];
  for (const e of [...state.t.elections.values()].filter((x) => x.status !== "ENCERRADA").sort((a, b) => a.year - b.year).slice(0, 2)) {
    const kind = e.kind === "GERAL" ? "gerais" : "municipais";
    const c = e.calendar;
    const add = (date: string | undefined, title: string, detail: string, tone: AgendaItem["tone"] = "info", term?: string) => {
      if (date && date >= today) items.push({ date, days: daysBetween(today, date), title, detail, tone, term });
    };
    add(c.preCampaignStart, `Começa o ano eleitoral de ${e.year}`, `Eleições ${kind}: abrem as disputas e as pré-candidaturas.`);
    add(c.filiationDeadline, "Prazo final de filiação", `Quem quiser disputar em ${e.year} precisa estar filiado(a) até esta data.`, me.party_id ? "info" : "hot", "Prazo de filiação");
    add(c.partySwitchWindowStart, "Abre a janela partidária", "Parlamentares podem trocar de partido sem perder o mandato.", "info", "Janela partidária");
    add(c.conventionStart, "Começam as convenções", "Os partidos escolhem seus candidatos.", "warn", "Convenção partidária");
    add(c.conventionEnd, "Fim das convenções", "Último dia para definir candidaturas.", "warn", "Convenção partidária");
    add(c.campaignStart, "Começa a campanha oficial", "Propaganda liberada nas ruas e na internet.");
    add(e.first_round, `1º turno das eleições ${kind}`, `Eleições de ${e.year}.`, "hot");
    add(e.runoff, "2º turno", "Disputas majoritárias que não terminaram no 1º turno.", "warn");
  }
  for (const d of state.t.debates.values()) {
    const mine = [...state.t.candidacies.values()].some((c) => c.person_id === me.id && d.participants.includes(c.id));
    if (mine && d.status === "AGENDADO" && d.scheduled_on >= today) items.push({ date: d.scheduled_on, days: daysBetween(today, d.scheduled_on), title: `Debate na ${d.outlet}`, detail: "Defina sua estratégia antes.", tone: "warn" });
  }
  if (me.office_code) {
    for (const b of state.t.bills.values()) {
      if (b.status === "TRAMITANDO" && b.vote_on >= today) items.push({ date: b.vote_on, days: daysBetween(today, b.vote_on), title: `Votação: ${b.title}`, detail: "Projeto em pauta no plenário.", tone: "info" });
    }
  }
  for (const m of state.t.mandates.values()) {
    if (m.person_id === me.id && m.status === "FUTURO") items.push({ date: m.start_on, days: daysBetween(today, m.start_on), title: `Sua posse: ${OFFICES[m.office_code].name}`, detail: geoName(m.geo, state), tone: "hot" });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}

export interface Pending {
  invites: Array<{ id: string; party: PartyRow; reason: string | null; until: string; days: number }>;
  requests: Array<{ id: string; party: PartyRow; until: string; days: number }>;
  offers: Array<{ id: string; kind: string; amount: number; from: string }>;
  investigations: number;
  /** pedidos de filiação ao partido que você preside */
  partyRequests: Array<{ id: string; name: string; role: string; until: string }>;
  /** fundação de partido em andamento */
  founding: { acronym: string; pct: number; days: number } | null;
}

export function pending(state: WorldState, me: PersonRow, st: PersonStateRow): Pending {
  const today = state.world.game_date;
  const reqs = [...state.t.affiliation_requests.values()].filter((r) => r.person_id === me.id && r.status === "PENDENTE");
  const party = (id: string) => state.t.parties.get(id)!;
  return {
    invites: reqs.filter((r) => r.kind === "CONVITE").map((r) => ({ id: r.id, party: party(r.party_id), reason: r.reason, until: r.decide_on, days: daysBetween(today, r.decide_on) })),
    requests: reqs.filter((r) => r.kind === "PEDIDO").map((r) => ({ id: r.id, party: party(r.party_id), until: r.decide_on, days: daysBetween(today, r.decide_on) })),
    offers: st.offers.map((o) => ({ id: o.id, kind: o.kind === "PROPINA" ? "Propina" : "Caixa dois", amount: o.amount, from: state.t.persons.get(o.from)?.name ?? "um intermediário" })),
    investigations: [...state.t.investigations.values()].filter((i) => i.person_id === me.id && !i.outcome).length,
    partyRequests: (() => {
      const led = [...state.t.parties.values()].find((p) => p.president_id === me.id && p.status === "ATIVO" && p.founder_id);
      if (!led) return [];
      return [...state.t.affiliation_requests.values()]
        .filter((r) => r.party_id === led.id && r.kind === "PEDIDO" && r.status === "PENDENTE")
        .map((r) => {
          const who = state.t.persons.get(r.person_id);
          return { id: r.id, name: who?.name ?? "Alguém", role: who?.office_code ? OFFICES[who.office_code].name : who?.role_label ?? "político(a)", until: r.decide_on };
        });
    })(),
    founding: (() => {
      const f = [...state.t.parties.values()].find((p) => p.founder_id === me.id && p.status === "EM_FORMACAO");
      if (!f?.formation) return null;
      return { acronym: f.acronym, pct: Math.min(1, f.formation.signatures / f.formation.goal), days: daysBetween(today, f.formation.deadline) };
    })(),
  };
}

export interface PartyFit {
  party: PartyRow;
  /** afinidade ideológica (0..1) */
  affinity: number;
  /** chance estimada de aprovar um pedido de filiação agora (0..1) */
  chance: number;
}

/** Afinidade e chance de filiação em cada partido, para orientar a escolha. */
export function partyFits(state: WorldState, me: PersonRow): PartyFit[] {
  const ctx = new Ctx(state, "view");
  return [...state.t.parties.values()]
    .filter((p) => p.status === "ATIVO")
    .map((party) => ({ party, affinity: ideologyAffinity(me.ideology, party.ideology), chance: acceptanceProbability(computeAffiliation(ctx, me, party, "PEDIDO").total) }))
    .sort((a, b) => b.affinity - a.affinity);
}


