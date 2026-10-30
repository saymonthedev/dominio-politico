import { diffDays } from "../../calendar";
import { respondToOffer } from "../../crime";
import { debateTheme, DEBATE_THEMES, geoName, settleDebateMoment } from "../../elections";
import { OFFICES } from "../../ruleset";
import type { CandidacyRow, PersonRow } from "../../types";
import { mainRival, projectList, segLabel, strongSegments, weakSegments } from "../campaign";
import type { StoryCtx } from "../context";
import type { EventDef } from "../def";
import { canAct, partyLeader } from "../world";
import { actor, bairro, brl, communityLeader, first, home, partyOf, pct, relWith, signed } from "./util";

/**
 * Campanha eleitoral: estratégia, pesquisas que se explicam, dinheiro (e a
 * tentação do dinheiro por fora), debates ao vivo, adversários que atacam,
 * boatos, apoios, promessas e a reta final. Boas decisões aumentam as chances
 * — nenhuma garante a vitória.
 */

/** Candidatura viva, no turno certo. */
function running(c: StoryCtx): CandidacyRow | null {
  const cand = c.cand;
  if (!cand || (cand.status !== "HOMOLOGADA" && cand.status !== "SEGUNDO_TURNO")) return null;
  const e = c.ctx.t.elections.get(cand.election_id);
  if (!e || c.date < e.calendar.campaignStart) return null;
  if (e.status === "SEGUNDO_TURNO" && cand.status !== "SEGUNDO_TURNO") return null;
  return cand;
}

function candOf(c: StoryCtx, id: string | number | undefined): CandidacyRow | undefined {
  const cand = id ? c.ctx.t.candidacies.get(String(id)) : undefined;
  return cand && cand.person_id === c.p.id ? cand : undefined;
}

/** Custo de uma ação de propaganda proporcional ao tamanho do eleitorado. */
function adCost(c: StoryCtx, cand: CandidacyRow): number {
  const race = c.ctx.t.races.get(cand.race_id);
  const electorate = race?.electorate ?? 100_000;
  return c.money(Math.max(4_000, Math.min(400_000, electorate * 0.02)));
}

function funds(c: StoryCtx, cand: CandidacyRow): number {
  return Math.max(0, cand.campaign.budget - cand.campaign.spent) + c.st.money;
}

/** Quem ataca no debate: o adversário (se fictício) ou uma pergunta de jornalista. */
function debateAttacker(c: StoryCtx, cand: CandidacyRow, participants: string[]): PersonRow | undefined {
  const others = participants.filter((id) => id !== cand.id).map((id) => c.ctx.t.candidacies.get(id)).filter((x): x is CandidacyRow => !!x);
  const rival = mainRival(c.ctx, cand);
  const target = rival && others.some((o) => o.id === rival.cand.id) ? rival.person : others.map((o) => c.ctx.person(o.person_id)).find(Boolean);
  return canAct(target) ? target : undefined;
}

function attackTheme(c: StoryCtx, cand: CandidacyRow): { key: string; text: string } {
  if (c.st.scandal >= 20) return { key: "escandalo", text: "as denúncias que pesam contra você" };
  if (!c.p.office_code && !c.s.flags.projeto_ok) return { key: "experiencia", text: "sua falta de experiência: \"nunca administrou nem uma padaria\"" };
  if ((cand.campaign.promises?.length ?? 0) >= 3) return { key: "promessas", text: "as promessas que você fez \"sem dizer de onde sai o dinheiro\"" };
  if (cand.campaign.donations > cand.campaign.fefc * 2 && cand.campaign.donations > c.money(20_000)) return { key: "financiadores", text: "quem está pagando a sua campanha" };
  return { key: "partido", text: `o histórico do seu partido, o ${c.party?.acronym ?? "partido"}` };
}

// ---------------------------------------------------------------- estratégia
const reuniao_estrategia: EventDef = {
  id: "reuniao_estrategia",
  kind: "DECISAO",
  tags: ["CAMPANHA"],
  chained: true,
  milestone: true,
  expires: 4,
  when: (c, d) => {
    const cand = candOf(c, d?.cand);
    return cand && cand.status === "HOMOLOGADA" ? { cand: cand.id } : null;
  },
  render: (c, b) => {
    const cand = candOf(c, b.cand)!;
    const strong = strongSegments(c.ctx, cand);
    const weak = weakSegments(c.ctx, cand);
    const rival = mainRival(c.ctx, cand);
    const office = OFFICES[cand.office_code].name.toLowerCase();
    const lines = [
      `Primeira reunião da campanha a ${office} em ${geoName(cand.geo, c.ctx.s)}. A leitura da equipe:`,
      `você vai bem entre ${strong.map((s) => s.label.toLowerCase()).join(" e ") || "ninguém em especial"}`,
      `e mal entre ${weak.map((s) => s.label.toLowerCase()).join(" e ") || "ninguém em especial"}.`,
      rival ? `${rival.person.name} (${rival.party?.acronym ?? ""}) aparece como principal adversário(a).` : c.proportional ? "Na disputa proporcional, o adversário de verdade é o colega de chapa com mais votos." : "",
      "Tempo e dinheiro não dão para tudo: onde a campanha vai concentrar força?",
    ];
    return {
      title: "Reunião de estratégia",
      text: lines.filter(Boolean).join(" "),
      choices: [
        { id: "virar", label: `Virar o jogo entre ${weak.map((s) => s.label.toLowerCase()).join(" e ")}`, hint: "Mais votos em disputa; resposta mais lenta", tone: "bold" },
        { id: "base", label: `Consolidar a base: ${strong.map((s) => s.label.toLowerCase()).join(" e ")}`, hint: "Resultado rápido; teto mais baixo", tone: "safe" },
        { id: "ampla", label: "Campanha ampla, para todos os públicos", hint: "Sem foco: nada muito forte, nada muito fraco", tone: "neutral" },
        ...(rival && canAct(rival.person) ? [{ id: "confronto", label: `Campanha de confronto contra ${rival.person.name}`, hint: "Polariza a disputa; desgasta os dois", tone: "risky" as const }] : []),
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const cand = candOf(c, b.cand)!;
    const strong = strongSegments(c.ctx, cand).map((s) => s.segment);
    const weak = weakSegments(c.ctx, cand).map((s) => s.segment);
    fx.flag("estrategia", choice);
    if (choice === "virar") {
      cand.campaign.focus = weak;
      cand.campaign.tone = "PROPOSITIVO";
      fx.seg(weak, 0.02, "estratégia focada nos grupos difíceis");
      return `Decidido: a campanha vai disputar ${weak.map(segLabel).join(" e ").toLowerCase()}. Os primeiros números vão demorar a aparecer.`;
    }
    if (choice === "base") {
      cand.campaign.focus = strong;
      cand.campaign.tone = "PROPOSITIVO";
      fx.seg(strong, 0.04, "campanha na base");
      return `A campanha começa onde você já é forte: ${strong.map(segLabel).join(" e ").toLowerCase()}.`;
    }
    if (choice === "confronto") {
      cand.campaign.focus = strong;
      cand.campaign.tone = "ATAQUE";
      fx.momentum(0.02, "campanha de confronto");
      const rival = mainRival(c.ctx, cand);
      if (rival) fx.rel(rival.person.id, -12);
      return `A ordem é polarizar com ${rival?.person.name}. Os próximos dias serão quentes.`;
    }
    cand.campaign.focus = [];
    cand.campaign.tone = "PROPOSITIVO";
    fx.seg("all", 0.01, "campanha ampla");
    return "Campanha ampla: um pouco de tudo, em todo lugar.";
  },
  fallback: "ampla",
};

// ---------------------------------------------------------------- pesquisas
function pollText(c: StoryCtx, b: Record<string, string | number>): string {
  const rival = actor(c, b.rival) ?? c.ctx.person(String(b.rival));
  const change = Number(b.change);
  const ch = Number(b.hasPrev) ? ` (${change === 0 ? "estável" : `${signed(change)} ponto${Math.abs(change) >= 2 ? "s" : ""} desde a última`})` : "";
  const leader = Number(b.rank) === 1 ? `Você lidera; ${rival?.name ?? "o segundo colocado"} vem com ${pct(Number(b.rivalPct))}.` : `${b.leader} lidera com ${pct(Number(b.leaderPct))}.`;
  const down = String(b.down || "").split("|").filter(Boolean);
  const up = String(b.up || "").split("|").filter(Boolean);
  const why = [up.length ? `O que ajudou: ${up.join(", ")}.` : "", down.length ? `O que pesou contra: ${down.join(", ")}.` : ""].filter(Boolean).join(" ");
  return `Você aparece com ${pct(Number(b.pct))}, em ${b.rank}º lugar${ch}. ${leader} A margem de erro é de três pontos para mais ou para menos. ${why}`.trim();
}

const pesquisa_preocupante: EventDef = {
  id: "pesquisa_preocupante",
  kind: "DECISAO",
  tags: ["CAMPANHA"],
  chained: true,
  expires: 3,
  when: (c, d) => {
    const cand = running(c);
    return cand && d && cand.race_id === String(d.race) ? { ...d, cand: cand.id } : null;
  },
  render: (c, b) => {
    const cand = candOf(c, b.cand)!;
    const weak = weakSegments(c.ctx, cand);
    const rival = c.ctx.person(String(b.rival));
    const cost = adCost(c, cand);
    return {
      title: "Pesquisa eleitoral preocupante",
      who: canAct(rival) ? rival : null,
      text: `${pollText(c, b)} Onde você vai pior: ${weak.map((s) => s.label.toLowerCase()).join(" e ")}. A equipe quer uma decisão hoje.`,
      choices: [
        { id: "publicidade", label: "Investir em publicidade", hint: `${brl(cost)} em inserções e impulsionamento`, tone: "safe", cost: { money: 0 }, requires: () => (funds(c, cand) >= cost ? null : `Faltam recursos: a propaganda custa ${brl(cost)}.`) },
        { id: "bairros", label: `Ir para onde a aprovação é menor (${weak.map((s) => s.label.toLowerCase()).join(", ")})`, hint: "Agenda pesada de rua, resposta lenta e mais sólida", tone: "bold", cost: { energy: 25 } },
        ...(canAct(rival) ? [{ id: "atacar", label: `Atacar as propostas de ${rival!.name}`, hint: "Pode render — ou respingar em você", tone: "risky" as const }] : []),
        { id: "manter", label: "Manter a estratégia", hint: "Pesquisa é fotografia, não filme", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const cand = candOf(c, b.cand)!;
    if (choice === "publicidade") {
      const cost = adCost(c, cand);
      fx.campaignSpend(cost, "Propaganda e impulsionamento", "propaganda");
      const f = Math.max(0.4, 1 - c.num("propaganda_extra") * 0.2);
      fx.bump("propaganda_extra");
      fx.momentum(0.05 * f, "nova leva de propaganda");
      fx.seg("all", 0.01 * f);
      return "As inserções entram no ar amanhã. Propaganda não convence ninguém sozinha — mas lembra quem você é.";
    }
    if (choice === "bairros") {
      fx.energy(-25);
      const weak = weakSegments(c.ctx, cand).map((s) => s.segment);
      fx.seg(weak, 0.05, "agenda onde você ia mal");
      fx.volunteers(10);
      return "Uma semana de agenda nos lugares onde você era pouco conhecido(a). Ouviu críticas, deixou propostas, voltou com voluntários.";
    }
    if (choice === "atacar") {
      const rival = c.ctx.person(String(b.rival));
      const rc = rival ? [...c.ctx.t.candidacies.values()].find((x) => x.person_id === rival.id && x.race_id === cand.race_id) : undefined;
      cand.campaign.tone = "ATAQUE";
      if (rival) fx.rel(rival.id, -10);
      if (c.roll(0.4 + c.competence * 0.25 + (c.p.reputation - 50) / 200)) {
        fx.momentum(0.04, `críticas às propostas de ${rival?.name}`);
        if (rc) {
          rc.campaign.momentum = Math.max(-1, rc.campaign.momentum - 0.03);
          c.ctx.save("candidacies", rc);
        }
        return `Seus números contra as propostas de ${rival?.name} pegaram: a imprensa repercutiu e o adversário passou o dia se explicando.`;
      }
      fx.momentum(-0.03, "ataque que soou desespero");
      return "O ataque soou como desespero de quem está atrás. Os indecisos não gostaram.";
    }
    if (c.flag("estrategia") && c.flag("estrategia") !== "ampla") fx.momentum(0.01, "campanha sem pânico");
    return "Você manteve o plano. \"Quem muda de estratégia a cada pesquisa não tem estratégia\", disse a coordenação.";
  },
  fallback: "manter",
};

const pesquisa_divulgada: EventDef = {
  id: "pesquisa_divulgada",
  kind: "INFO",
  tags: ["CAMPANHA"],
  chained: true,
  when: (c, d) => {
    const cand = running(c);
    return cand && d && cand.race_id === String(d.race) ? d : null;
  },
  render: (c, b) => ({ title: `Nova pesquisa: você tem ${pct(Number(b.pct))}`, text: pollText(c, b), choices: [] }),
  resolve: (c, b) => pollText(c, b),
};

const projecao_lista: EventDef = {
  id: "projecao_lista",
  kind: "DECISAO",
  tags: ["CAMPANHA"],
  blocking: false,
  cooldown: 16,
  weight: 2.2,
  expires: 4,
  when: (c) => {
    const cand = running(c);
    if (!cand || !c.proportional) return null;
    const proj = projectList(c.ctx, cand);
    if (!proj) return null;
    return { cand: cand.id, low: proj.low, high: proj.high, mid: proj.mid, seats: proj.partySeats, cutoff: proj.cutoff, position: proj.position, chance: proj.chance };
  },
  render: (c, b) => {
    const cand = candOf(c, b.cand)!;
    const weak = weakSegments(c.ctx, cand);
    const cost = adCost(c, cand);
    return {
      title: `Projeção de votos: chance ${b.chance}`,
      text: `A coordenação refez as contas: você teria entre ${Number(b.low).toLocaleString("pt-BR")} e ${Number(b.high).toLocaleString("pt-BR")} votos. O ${c.party?.acronym} deve fazer ${b.seats} cadeira(s), e o último eleito da chapa deve ficar perto de ${Number(b.cutoff).toLocaleString("pt-BR")} votos. Hoje você seria o ${b.position}º da lista. Na eleição proporcional, cada voto conta duas vezes: para você e para a legenda.`,
      choices: [
        { id: "rua", label: `Reforçar a rua entre ${weak.map((s) => s.label.toLowerCase()).join(" e ")}`, tone: "bold", cost: { energy: 22 } },
        { id: "propaganda", label: "Impulsionar vídeos nas redes", hint: brl(cost), tone: "safe", requires: () => (funds(c, cand) >= cost ? null : `Faltam recursos (${brl(cost)}).`) },
        { id: "partido", label: "Pedir mais apoio ao partido", hint: "Depende do seu prestígio interno", tone: "neutral", cost: { energy: 6 } },
        { id: "manter", label: "Manter o plano", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const cand = candOf(c, b.cand)!;
    if (choice === "rua") {
      fx.energy(-22);
      fx.seg(weakSegments(c.ctx, cand).map((s) => s.segment), 0.05, "corpo a corpo nos bairros");
      fx.volunteers(6);
      return "Mais uma semana de sola de sapato. Os santinhos acabaram duas vezes.";
    }
    if (choice === "propaganda") {
      fx.campaignSpend(adCost(c, cand), "Impulsionamento de vídeos", "propaganda");
      fx.momentum(0.04, "vídeos impulsionados");
      fx.reach(0.01);
      return "Os vídeos rodaram nos bairros certos. O seu número começou a aparecer nas conversas.";
    }
    if (choice === "partido") {
      fx.energy(-6);
      if (c.roll(0.2 + c.st.party_standing / 120)) {
        const extra = c.money(6000);
        cand.campaign.budget += extra;
        cand.campaign.fefc += extra;
        fx.flag("reforco_partido", c.date);
        return `A direção liberou um reforço de ${brl(extra)} do fundo e incluiu você no material da chapa.`;
      }
      return "A direção disse que \"o fundo já está todo comprometido\". Prestígio interno faz falta nessas horas.";
    }
    return "Plano mantido.";
  },
  fallback: "manter",
};

// ---------------------------------------------------------------- dinheiro
const proposta_financiamento: EventDef = {
  id: "proposta_financiamento",
  kind: "DECISAO",
  tags: ["CAMPANHA", "DINHEIRO", "BASTIDORES"],
  chained: true,
  expires: 6,
  when: (c, d) => (d && c.st.offers.some((o) => o.id === String(d.offer)) && actor(c, d.broker) ? d : null),
  valid: (c, b) => c.st.offers.some((o) => o.id === String(b.offer)),
  render: (c, b) => {
    const broker = actor(c, b.broker)!;
    const amount = Number(b.amount);
    const legal = Math.min(Math.round(amount * 0.15), c.money(30_000));
    return {
      title: "Proposta de financiamento",
      who: broker,
      text: `${broker.name}${broker.role_label ? `, ${broker.role_label},` : ""} oferece ${brl(amount)} para a sua campanha. "Sem burocracia, sem nota, sem aparecer na prestação de contas. Se você ganhar, só quero ser lembrado." Pela lei, ${first(broker)} só poderia doar como pessoa física, dentro do limite — algo como ${brl(legal)}, declarado.`,
      choices: [
        { id: "recusar", label: "Recusar", hint: "Nada muda", tone: "safe" },
        { id: "legal", label: "Aceitar só o que for legal e declarado", hint: `${brl(legal)} na prestação de contas; ${first(broker)} vai querer acesso`, tone: "neutral" },
        { id: "denunciar", label: "Denunciar à Justiça Eleitoral e à PF", hint: "Reputação; um inimigo poderoso", tone: "bold" },
        { id: "negociar", label: "Aceitar tudo e negociar a contrapartida", hint: "Caixa dois: crime eleitoral", tone: "illegal" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const broker = actor(c, b.broker)!;
    const offer = String(b.offer);
    if (choice === "legal") {
      respondToOffer(c.ctx, c.p, c.st, offer, "RECUSAR");
      const legal = Math.min(Math.round(Number(b.amount) * 0.15), c.money(30_000));
      fx.donation(legal, `Doação de pessoa física: ${broker.name}`);
      fx.rel(broker.id, 2);
      fx.flag(`doador:${broker.id}`, legal);
      fx.schedule("cobranca_doador", [80, 260], { broker: broker.id, legal: 1 });
      return `${first(broker)} doou ${brl(legal)}, com recibo. Riu da sua "frescura" — e disse que vai lembrar do seu nome.`;
    }
    if (choice === "denunciar") {
      const msg = respondToOffer(c.ctx, c.p, c.st, offer, "DENUNCIAR");
      fx.reputation(3);
      fx.visibility(3);
      fx.flag("denunciou_oferta", c.date);
      if (c.cand) fx.momentum(0.02, "denúncia de caixa dois");
      return `${msg} A notícia correu: você virou "o(a) candidato(a) que recusou a mala".`;
    }
    if (choice === "negociar") {
      const msg = respondToOffer(c.ctx, c.p, c.st, offer, "ACEITAR");
      fx.flag(`contrapartida:${broker.id}`, c.date);
      fx.rel(broker.id, 10);
      fx.momentum(0.03, "campanha com mais estrutura");
      fx.schedule("cobranca_doador", [60, 200], { broker: broker.id, legal: 0 });
      return `${msg} ${first(broker)} já tem uma lista do que espera de você.`;
    }
    respondToOffer(c.ctx, c.p, c.st, offer, "RECUSAR");
    fx.rel(broker.id, -4);
    return "Você recusou. A campanha vai seguir mais pobre — e com a consciência tranquila.";
  },
  fallback: "recusar",
};

const partido_corta_verba: EventDef = {
  id: "partido_corta_verba",
  kind: "DECISAO",
  tags: ["CAMPANHA", "PARTIDO", "DINHEIRO"],
  cooldown: 300,
  expires: 3,
  when: (c) => {
    const cand = running(c);
    if (!cand || cand.campaign.fefc <= 0 || c.st.party_standing >= 40 || c.flag(`corte:${cand.id}`)) return null;
    const left = cand.campaign.budget - cand.campaign.spent;
    const cut = Math.round(Math.min(left, cand.campaign.fefc * 0.4) / 100) * 100;
    if (cut < c.money(2000)) return null;
    return { cand: cand.id, cut };
  },
  render: (c, b) => {
    const leader = partyLeader(c.ctx, c.p, c.party!);
    return {
      title: "O partido vai cortar sua verba",
      who: leader,
      text: `${leader.name} avisa: o ${c.party!.acronym} decidiu concentrar o fundo eleitoral nos nomes "com mais chance". Vão tirar ${brl(Number(b.cut))} do que ainda falta repassar para você. Seu prestígio interno (${Math.round(c.st.party_standing)}) não ajudou.`,
      choices: [
        { id: "aceitar", label: "Aceitar e captar por conta própria", hint: "Você corre atrás de doações", tone: "safe", cost: { energy: 12 } },
        { id: "pressionar", label: "Pressionar a direção", hint: "Pode reverter — ou piorar", tone: "bold", cost: { energy: 8 } },
        { id: "ameacar", label: "Ameaçar deixar o partido", hint: "Tudo ou nada", tone: "risky" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const cand = candOf(c, b.cand)!;
    const cut = Number(b.cut);
    const leader = partyLeader(c.ctx, c.p, c.party!);
    fx.flag(`corte:${cand.id}`, c.date);
    const apply = () => {
      cand.campaign.budget -= cut;
      cand.campaign.fefc -= cut;
      fx.journal("corte de verba do partido", -0.02);
    };
    if (choice === "aceitar") {
      fx.energy(-12);
      apply();
      const raised = Math.round((cut * (0.25 + c.charisma * 0.35)) / 100) * 100;
      fx.donation(raised, "Doações de apoiadores após corte do partido");
      return `Você perdeu ${brl(cut)}, mas uma rodada de telefonemas trouxe ${brl(raised)} em doações.`;
    }
    if (choice === "pressionar") {
      fx.energy(-8);
      if (c.roll(0.25 + relWith(c, leader.id) / 100 + c.st.party_standing / 150)) {
        fx.rel(leader.id, -2);
        return "Depois de uma reunião tensa, a direção recuou. A verba fica.";
      }
      apply();
      fx.standing(-4);
      fx.rel(leader.id, -6);
      return "A direção não recuou — e ainda anotou quem reclamou.";
    }
    if (c.roll(0.35 + c.p.reputation / 250)) {
      fx.standing(-6);
      return "Ninguém quer perder um nome a semanas da eleição: o corte foi suspenso. O clima, não.";
    }
    apply();
    fx.standing(-10);
    fx.flag("aberto_a_convites", c.date);
    return "A direção pagou para ver. Você ficou sem a verba e com fama de encrenqueiro(a).";
  },
  fallback: "aceitar",
};

const cabo_eleitoral: EventDef = {
  id: "cabo_eleitoral",
  kind: "OPORTUNIDADE",
  tags: ["CAMPANHA", "DINHEIRO"],
  cooldown: 25,
  expires: 5,
  when: (c) => {
    const cand = running(c);
    if (!cand) return null;
    const n = c.proportional ? 20 : 40;
    return { cand: cand.id, n, price: c.money(n * 450), coord: communityLeader(c, bairro(c, "cabos")).id };
  },
  render: (c, b) => ({
    title: "Uma equipe de rua à venda",
    who: actor(c, b.coord),
    text: `${actor(c, b.coord)?.name ?? "Um coordenador"} oferece ${b.n} cabos eleitorais para as últimas semanas: bandeiraço, panfletagem e conversa de porta em porta. Com contrato e nota, sai por ${brl(Number(b.price))}. "Por fora", ele faz pela metade — sem recibo, sem prestação de contas.`,
    choices: [
      { id: "legal", label: "Contratar com contrato e nota", hint: brl(Number(b.price)), tone: "safe", requires: () => (funds(c, candOf(c, b.cand)!) >= Number(b.price) ? null : "Faltam recursos.") },
      { id: "por_fora", label: "Contratar por fora, pela metade", hint: "Gasto não declarado: crime eleitoral", tone: "illegal", requires: () => (c.st.money + c.st.dirty_money >= Number(b.price) / 2 ? null : "Faltam recursos.") },
      { id: "voluntarios", label: "Recusar e apostar em voluntários", tone: "neutral", cost: { energy: 12 } },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    const cand = candOf(c, b.cand)!;
    const n = Number(b.n);
    if (choice === "legal") {
      fx.campaignSpend(Number(b.price), `Contratação de ${n} cabos eleitorais`, "pessoal");
      cand.campaign.canvassers = (cand.campaign.canvassers ?? 0) + n;
      fx.seg("focus", 0.025, "equipe de rua contratada");
      return `${n} pessoas com colete e prancheta nas ruas a partir de amanhã.`;
    }
    if (choice === "por_fora") {
      const v = Math.round(Number(b.price) / 2);
      const fromDirty = Math.min(c.st.dirty_money, v);
      if (fromDirty) fx.dirty(-fromDirty);
      if (v - fromDirty) fx.money(-(v - fromDirty), "Pagamento sem nota", "DESPESA");
      cand.campaign.canvassers = (cand.campaign.canvassers ?? 0) + n;
      fx.illicit("CAIXA_DOIS", { amount: v, description: `Pagamento de ${n} cabos eleitorais sem declaração`, witnesses: Math.round(n / 4), paperTrail: 0.35 });
      fx.seg("focus", 0.03, "equipe de rua");
      return `Combinado no fio do bigode. ${n} pessoas na rua — e ${n} pessoas que sabem como foi pago.`;
    }
    fx.energy(-12);
    fx.volunteers(12);
    return "Você passou a noite ligando para amigos e vizinhos. Doze toparam ajudar de graça.";
  },
  fallback: "voluntarios",
};

const vaquinha_apoiadores: EventDef = {
  id: "vaquinha_apoiadores",
  kind: "INFO",
  tags: ["CAMPANHA", "DINHEIRO"],
  cooldown: 30,
  when: (c) => {
    const cand = running(c);
    if (!cand || (cand.campaign.momentum <= 0.05 && cand.campaign.volunteers < 30)) return null;
    return { cand: cand.id, v: Math.round((c.money(800) + cand.campaign.volunteers * c.money(40) + Math.max(0, cand.campaign.momentum) * c.money(20_000)) / 100) * 100 };
  },
  render: (c, b) => ({ title: "A vaquinha dos apoiadores", text: `A campanha de financiamento coletivo bateu ${brl(Number(b.v))}: centenas de doações pequenas, de R$ 20, R$ 50, R$ 100.`, choices: [] }),
  resolve: (c, b, _choice, fx) => {
    fx.donation(Number(b.v), "Financiamento coletivo");
    return "Dinheiro limpo, declarado e com cara de povo.";
  },
};

// ---------------------------------------------------------------- debates
const debate_preparo: EventDef = {
  id: "debate_preparo",
  kind: "DECISAO",
  tags: ["CAMPANHA", "DEBATE"],
  cooldown: 3,
  weight: 6,
  expires: 2,
  valid: (c, b) => c.ctx.t.debates.get(String(b.debate))?.status === "AGENDADO",
  when: (c) => {
    const cand = running(c);
    if (!cand) return null;
    const d = [...c.ctx.t.debates.values()].find((x) => x.status === "AGENDADO" && x.participants.includes(cand.id) && diffDays(x.scheduled_on, c.date) >= 1 && diffDays(x.scheduled_on, c.date) <= 4);
    if (!d || c.flag(`prep:${d.id}`)) return null;
    const likely = c.rng.chance(0.7) ? debateTheme(c.ctx, d) : c.rng.pick(DEBATE_THEMES);
    return { cand: cand.id, debate: d.id, likely, outlet: d.outlet, on: d.scheduled_on };
  },
  render: (c, b) => {
    const cand = candOf(c, b.cand)!;
    const rival = mainRival(c.ctx, cand);
    return {
      title: `Debate na ${b.outlet} em ${diffDays(String(b.on), c.date)} dia(s)`,
      text: `A equipe aposta que o tema mais quente vai ser ${b.likely}. Seu preparo para debates está em ${Math.round(c.st.debate_prep)}. ${rival ? `${rival.person.name} chega com ${rival.pct !== null ? pct(rival.pct) : "força"} nas pesquisas.` : ""} Como usar os próximos dias?`,
      choices: [
        { id: "simulacao", label: "Simulação completa com a equipe", hint: "Treino pesado de perguntas e réplicas", tone: "safe", cost: { energy: 20, money: c.money(2500) } },
        { id: "tema", label: `Estudar a fundo: ${b.likely}`, hint: "Se o tema cair, você brilha", tone: "bold", cost: { energy: 10 } },
        ...(rival && canAct(rival.person) ? [{ id: "dossie", label: `Montar um dossiê sobre ${rival.person.name}`, hint: "Munição para atacar; o debate fica arriscado", tone: "risky" as const, cost: { energy: 10 } }] : []),
        { id: "descanso", label: "Descansar e confiar no improviso", hint: "Chega inteiro(a), mas cru(a)", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const d = c.ctx.t.debates.get(String(b.debate));
    const cand = candOf(c, b.cand)!;
    fx.flag(`prep:${b.debate}`, c.date);
    if (choice === "simulacao") {
      fx.energy(-20);
      fx.campaignSpend(c.money(2500), "Simulação de debate", "debate");
      fx.debate(14);
      if (d) {
        d.player_choices[cand.id] = { theme: String(b.likely), stance: "PROPOSITIVO", risk: 0.15 };
        c.ctx.save("debates", d);
      }
      return "Três noites de simulação, com um assessor fazendo o papel do adversário. Você já sabe onde vão tentar te pegar.";
    }
    if (choice === "tema") {
      fx.energy(-10);
      fx.debate(6);
      if (d) {
        d.player_choices[cand.id] = { theme: String(b.likely), stance: "PROPOSITIVO", risk: 0.25 };
        c.ctx.save("debates", d);
      }
      return `Você decorou os números de ${b.likely} e preparou três propostas de bolso.`;
    }
    if (choice === "dossie") {
      fx.energy(-10);
      fx.debate(4);
      if (d) {
        d.player_choices[cand.id] = { theme: String(b.likely), stance: "ATAQUE", risk: 0.45 };
        c.ctx.save("debates", d);
      }
      fx.flag("dossie_debate", String(b.debate));
      return "A pasta com o histórico do adversário está pronta. Agora é saber a hora de abrir.";
    }
    fx.energy(20);
    return "Você dormiu bem e chegou com a cabeça leve. Resta saber se leve demais.";
  },
  fallback: "descanso",
};

const debate_ao_vivo: EventDef = {
  id: "debate_ao_vivo",
  kind: "DECISAO",
  tags: ["CAMPANHA", "DEBATE"],
  chained: true,
  milestone: true,
  expires: 1,
  when: (c, d) => {
    const debate = d ? c.ctx.t.debates.get(String(d.debate)) : undefined;
    const cand = candOf(c, d?.cand);
    if (!debate || debate.status !== "AO_VIVO" || !cand || !debate.participants.includes(cand.id)) return null;
    const attacker = debateAttacker(c, cand, debate.participants);
    const theme = attackTheme(c, cand);
    return { debate: debate.id, cand: cand.id, attacker: attacker?.id ?? "", theme: theme.key, themeText: theme.text, topic: debateTheme(c.ctx, debate) };
  },
  valid: (c, b) => c.ctx.t.debates.get(String(b.debate))?.status === "AO_VIVO",
  render: (c, b) => {
    const debate = c.ctx.t.debates.get(String(b.debate))!;
    const attacker = actor(c, b.attacker);
    const prepared = c.st.debate_prep >= 50 ? "Você treinou para este momento." : c.st.debate_prep >= 25 ? "Você treinou um pouco para este momento." : "Você não treinou para este momento.";
    const moment = attacker
      ? `No bloco sobre ${b.topic}, ${attacker.name} ignora a pergunta do mediador e parte para cima de você, falando de ${b.themeText}. A plateia reage. As câmeras se viram para você.`
      : `No bloco sobre ${b.topic}, a jornalista da bancada faz a pergunta que você temia: ${b.themeText}. As câmeras se viram para você.`;
    return {
      title: `Ao vivo: debate na ${debate.outlet}`,
      who: attacker ?? null,
      text: `${moment} ${prepared} Você tem um minuto e meio.`,
      choices: [
        { id: "trajetoria", label: "Responder com sua trajetória e uma proposta concreta", hint: "Depende de conhecimento e preparo", tone: "safe" },
        {
          id: "devolver",
          label: attacker ? `Devolver o ataque com o histórico de ${attacker.name}` : "Questionar a premissa da pergunta",
          hint: "Alto risco, alto retorno",
          tone: "risky",
        },
        { id: "humor", label: "Usar humor para desarmar e mudar de assunto", hint: "Depende de carisma; pode virar meme — bom ou ruim", tone: "bold" },
        { id: "eleitor", label: "Olhar para a câmera e falar direto ao eleitor", hint: "Seguro e sem brilho", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const prep = c.st.debate_prep / 100;
    const dossier = c.flag("dossie_debate") === String(b.debate) ? 0.05 : 0;
    const attacker = actor(c, b.attacker);
    let bonus: number;
    if (choice === "trajetoria") bonus = -0.03 + c.competence * 0.12 + prep * 0.1 + c.rng.normal(0, 0.03);
    else if (choice === "devolver") bonus = -0.08 + c.charisma * 0.2 + dossier + prep * 0.04 + c.rng.normal(0, 0.07);
    else if (choice === "humor") bonus = -0.06 + c.charisma * 0.18 + c.rng.normal(0, 0.06);
    else bonus = 0.01 + prep * 0.04 + c.rng.normal(0, 0.02);
    if (choice === "devolver" && attacker) fx.rel(attacker.id, -8);
    fx.unflag("dossie_debate");
    settleDebateMoment(c.ctx, String(b.debate), String(b.cand), bonus);
    fx.energy(-10);
    fx.debate(2);
    if (bonus >= 0.08) {
      fx.visibility(3);
      return choice === "humor"
        ? "A plateia riu junto com você — e o corte da resposta virou o vídeo mais compartilhado da noite."
        : choice === "devolver"
          ? `Você abriu a pasta na hora certa. ${attacker ? `${attacker.name} gaguejou na réplica.` : "A bancada ficou sem resposta."} Os analistas apontaram o momento como o melhor do debate.`
          : "Firmeza e número na ponta da língua: a resposta foi citada por três comentaristas como a melhor da noite.";
    }
    if (bonus >= 0.02) return "Resposta correta, sem tropeço. Não ganhou o debate ali — mas não perdeu.";
    if (bonus >= -0.03) return "Você se enrolou um pouco no meio, mas terminou de pé. Nada que vire manchete.";
    fx.reputation(-1);
    return choice === "humor"
      ? "A piada não pegou. O silêncio no estúdio durou dois segundos que pareceram vinte — e já virou meme."
      : "O nervosismo apareceu. O corte do seu tropeço está nos grupos de WhatsApp antes do fim do debate.";
  },
  fallback: "eleitor",
};

// ---------------------------------------------------------------- adversários, boatos e crises
const ataque_adversario: EventDef = {
  id: "ataque_adversario",
  kind: "DECISAO",
  tags: ["CAMPANHA", "IMPRENSA"],
  chained: true,
  blocking: false,
  expires: 3,
  when: (c, d) => {
    const cand = running(c);
    const rival = actor(c, d?.rival);
    return cand && rival ? { ...d!, cand: cand.id } : null;
  },
  render: (c, b) => {
    const rival = actor(c, b.rival)!;
    const where = c.rng.pick(["num comício lotado", "na propaganda de TV", "num vídeo nas redes", "numa entrevista de rádio"]);
    return {
      title: `${rival.name} atacou você`,
      who: rival,
      text: `${rival.name} falou ${where} sobre ${b.theme}. O trecho já circula, e sua equipe calcula que o ataque custou alguns pontos. Responder dá palco ao adversário; não responder deixa a versão dele sozinha.`,
      choices: [
        { id: "fatos", label: "Responder com fatos e documentos", hint: "Seguro se você tiver os números", tone: "safe", cost: { energy: 10 } },
        { id: "contra", label: "Contra-atacar", hint: "A campanha esquenta", tone: "risky", cost: { energy: 8 } },
        { id: "justica", label: "Pedir direito de resposta na Justiça Eleitoral", hint: "Lento, mas oficial", tone: "neutral", cost: { money: c.money(3000) } },
        { id: "ignorar", label: "Ignorar", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const rival = actor(c, b.rival)!;
    const rc = c.ctx.t.candidacies.get(String(b.rivalCand));
    if (choice === "fatos") {
      fx.energy(-10);
      if (c.roll(0.45 + c.competence * 0.35)) {
        fx.momentum(0.035, `resposta a ${rival.name}`);
        return "Sua resposta, com documentos, desmontou o ataque. O assunto morreu em dois dias.";
      }
      fx.momentum(0.01, `resposta a ${rival.name}`);
      return "A resposta saiu técnica demais. Quem viu o ataque não viu a resposta.";
    }
    if (choice === "contra") {
      fx.energy(-8);
      fx.rel(rival.id, -10);
      if (c.roll(0.4 + c.charisma * 0.3)) {
        fx.momentum(0.03, `contra-ataque a ${rival.name}`);
        if (rc) {
          rc.campaign.momentum = Math.max(-1, rc.campaign.momentum - 0.025);
          c.ctx.save("candidacies", rc);
        }
        return `O contra-ataque doeu mais em ${rival.name} do que o ataque doeu em você.`;
      }
      fx.momentum(-0.02, "troca de ataques");
      return "Virou baixaria. Os indecisos olharam para os dois e torceram o nariz.";
    }
    if (choice === "justica") {
      fx.campaignSpend(c.money(3000), "Advogados eleitorais", "juridico");
      fx.schedule("direito_resposta", [3, 7], { rival: rival.id, rivalCand: String(b.rivalCand) });
      return "Os advogados protocolaram o pedido. A decisão sai em alguns dias.";
    }
    return "Você seguiu sua agenda. O ataque ficou no ar — e no ar ficou.";
  },
  fallback: "ignorar",
};

const direito_resposta: EventDef = {
  id: "direito_resposta",
  kind: "INFO",
  tags: ["CAMPANHA"],
  chained: true,
  when: (c, d) => (running(c) && d ? d : null),
  render: (c, b) => ({ title: "Decisão sobre o direito de resposta", who: actor(c, b.rival), text: "A Justiça Eleitoral decidiu o seu pedido.", choices: [] }),
  resolve: (c, b, _choice, fx) => {
    const rc = c.ctx.t.candidacies.get(String(b.rivalCand));
    if (c.roll(0.6)) {
      fx.momentum(0.04, "direito de resposta concedido");
      if (rc) {
        rc.campaign.rumor_damage += 3;
        c.ctx.save("candidacies", rc);
      }
      return "Direito de resposta concedido: você vai usar o tempo do próprio adversário na TV para responder.";
    }
    return "Pedido negado: o juiz entendeu que foi crítica política, não ofensa. Vida que segue.";
  },
};

const fake_news: EventDef = {
  id: "fake_news",
  kind: "DECISAO",
  tags: ["CAMPANHA", "IMPRENSA"],
  cooldown: 25,
  expires: 2,
  when: (c) => {
    const cand = running(c);
    if (!cand) return null;
    const lie = c.rng.pick([
      "vai fechar o posto de saúde do bairro se for eleito(a)",
      "tem um apartamento de luxo no nome de um laranja",
      "foi filmado(a) recebendo dinheiro num estacionamento (o vídeo é de outra pessoa)",
      "quer aumentar o IPTU em 40%",
      "abandonou a família para fazer campanha",
    ]);
    return { cand: cand.id, lie };
  },
  weightFn: (c) => {
    const cand = running(c);
    const lp = cand?.campaign.last_poll;
    return lp && lp.rank <= 2 ? 1.6 : 0.8;
  },
  render: (c, b) => {
    const cand = candOf(c, b.cand)!;
    const rival = mainRival(c.ctx, cand);
    return {
      title: "Uma mentira nos grupos de WhatsApp",
      text: `Um vídeo editado circula em centenas de grupos dizendo que você ${b.lie}. Ninguém sabe de onde saiu. A cada hora, mais gente encaminha.`,
      choices: [
        { id: "desmentir", label: "Desmentir com vídeo e documentos", hint: "Rápido e honesto", tone: "safe", cost: { energy: 10 } },
        { id: "justica", label: "Acionar a Justiça Eleitoral para derrubar", hint: "Funciona quase sempre — mas demora", tone: "neutral", cost: { money: c.money(4000) } },
        { id: "ignorar", label: "Ignorar e não dar palco", tone: "neutral" },
        ...(rival && canAct(rival.person) ? [{ id: "revidar", label: `Revidar com um boato contra ${rival.person.name}`, hint: "Desinformação: crime eleitoral", tone: "illegal" as const }] : []),
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const cand = candOf(c, b.cand)!;
    if (choice === "desmentir") {
      fx.energy(-10);
      fx.rumor(2);
      fx.momentum(-0.005, "boato no WhatsApp");
      return "Seu vídeo de desmentido viralizou quase tanto quanto a mentira. Quase.";
    }
    if (choice === "justica") {
      fx.campaignSpend(c.money(4000), "Ação contra desinformação", "juridico");
      if (c.roll(0.7)) {
        fx.rumor(1);
        return "A Justiça mandou derrubar o conteúdo e identificar quem pagou o impulsionamento.";
      }
      fx.rumor(5);
      fx.momentum(-0.02, "boato no WhatsApp");
      return "A decisão saiu tarde: o vídeo já tinha rodado o estado.";
    }
    if (choice === "revidar") {
      const rival = mainRival(c.ctx, cand);
      if (rival && canAct(rival.person)) {
        rival.cand.campaign.rumor_damage += 6;
        c.ctx.save("candidacies", rival.cand);
        fx.illicit("DESINFORMACAO", { amount: c.money(8000), description: `Impulsionamento de boato contra ${rival.person.name}`, witnesses: 2, paperTrail: 0.55 });
      }
      fx.rumor(5);
      return "Agora são duas mentiras circulando. O eleitor não sabe em quem acreditar — e há rastros digitais do que sua equipe fez.";
    }
    fx.rumor(7);
    fx.momentum(-0.03, "boato no WhatsApp");
    return "Você não respondeu. Na falta de outra versão, a mentira virou \"todo mundo sabe\".";
  },
  fallback: "ignorar",
};

const gafe: EventDef = {
  id: "gafe",
  kind: "DECISAO",
  tags: ["CAMPANHA", "IMPRENSA"],
  cooldown: 30,
  expires: 2,
  when: (c) => {
    const cand = running(c);
    if (!cand || !c.rng.chance(0.4 + (1 - c.competence) * 0.6)) return null;
    const what = c.rng.pick([
      `errou o nome do bairro em pleno comício no ${bairro(c, "gafe")}`,
      "foi gravado(a) por um microfone aberto fazendo piada com eleitores",
      "trocou o número da sua própria candidatura num vídeo",
      "chamou de \"invasão\" uma ocupação onde vivem duzentas famílias",
    ]);
    return { cand: cand.id, what };
  },
  render: (c, b) => ({
    title: "Uma gafe ao vivo",
    text: `Você ${b.what}. O vídeo tem trinta segundos e já está em todos os perfis de fofoca política da cidade.`,
    choices: [
      { id: "desculpas", label: "Pedir desculpas imediatamente", hint: "Dói hoje, passa amanhã", tone: "safe" },
      { id: "piada", label: "Rir de si mesmo(a) e transformar em piada", hint: "Depende de carisma", tone: "bold" },
      { id: "fingir", label: "Fingir que nada aconteceu", hint: "Pode morrer sozinho — ou voltar maior", tone: "risky" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "desculpas") {
      fx.reputation(-0.5);
      fx.momentum(-0.01, "gafe em evento");
      return "Desculpas sinceras, em vídeo. Em dois dias o assunto era outro.";
    }
    if (choice === "piada") {
      if (c.roll(0.3 + c.charisma * 0.5)) {
        fx.momentum(0.015, "bom humor depois da gafe");
        return "Seu vídeo rindo da própria gafe teve o triplo de visualizações. Virou ponto a favor.";
      }
      fx.momentum(-0.04, "gafe em evento");
      fx.reputation(-1.5);
      return "A piada piorou tudo: agora parece que você não leva o eleitor a sério.";
    }
    fx.momentum(-0.015, "gafe em evento");
    if (c.roll(0.45)) fx.schedule("gafe_repercute", [2, 6], {});
    return "Você seguiu a agenda como se nada fosse.";
  },
  fallback: "fingir",
};

const gafe_repercute: EventDef = {
  id: "gafe_repercute",
  kind: "INFO",
  tags: ["CAMPANHA", "IMPRENSA"],
  chained: true,
  when: (c) => (running(c) ? {} : null),
  render: () => ({ title: "A gafe voltou", text: "Um adversário transformou sua gafe em jingle de propaganda. Está tocando no rádio.", choices: [] }),
  resolve: (_c, _b, _choice, fx) => {
    fx.momentum(-0.03, "jingle do adversário com a sua gafe");
    fx.reputation(-1);
    return "O que não foi resolvido na hora custou mais caro depois.";
  },
};

const adversario_escandalo: EventDef = {
  id: "adversario_escandalo",
  kind: "DECISAO",
  tags: ["CAMPANHA", "IMPRENSA"],
  cooldown: 45,
  expires: 3,
  when: (c) => {
    const cand = running(c);
    const rival = cand ? mainRival(c.ctx, cand) : null;
    if (!cand || !rival || !canAct(rival.person)) return null;
    const rs = c.ctx.pstate(rival.person.id);
    if ((rs?.scandal ?? 0) < 8 && !c.rng.chance(0.3)) return null;
    const topic = c.rng.pick(["contratos sem licitação da época em que foi secretário(a)", "viagens pagas por uma empreiteira", "um funcionário fantasma no gabinete", "dívidas com a Receita"]);
    return { cand: cand.id, rival: rival.person.id, rivalCand: rival.cand.id, topic };
  },
  render: (c, b) => {
    const rival = actor(c, b.rival)!;
    return {
      title: `Reportagem complica ${rival.name}`,
      who: rival,
      text: `Um portal publicou uma reportagem ligando ${rival.name} a ${b.topic}. Ainda não há investigação aberta, só a reportagem. Sua equipe quer saber: explorar ou não?`,
      choices: [
        { id: "explorar", label: "Explorar o caso na propaganda e nos debates", hint: "Pode render muito; se a história cair, respinga em você", tone: "risky" },
        { id: "cobrar", label: "Cobrar investigação, com serenidade", hint: "Postura de quem tem ficha limpa", tone: "safe" },
        { id: "calar", label: "Não comentar", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const rival = actor(c, b.rival)!;
    const rc = c.ctx.t.candidacies.get(String(b.rivalCand));
    if (choice === "explorar") {
      fx.rel(rival.id, -12);
      if (rc) {
        rc.campaign.rumor_damage += c.rng.range(3, 7);
        c.ctx.save("candidacies", rc);
      }
      if (c.roll(0.7)) {
        fx.momentum(0.03, `caso de ${rival.name} na propaganda`);
        return `A propaganda martelou o caso a semana toda. ${rival.name} caiu nas pesquisas internas.`;
      }
      fx.momentum(-0.02, "acusação que não se sustentou");
      fx.reputation(-2);
      return "Dois dias depois, o portal corrigiu a reportagem. Quem ficou mal na história foi você.";
    }
    if (choice === "cobrar") {
      fx.reputation(1);
      fx.momentum(0.01, "postura serena diante do caso");
      return "Você pediu apuração \"doa a quem doer\" e voltou às suas propostas. Pegou bem.";
    }
    return "Você deixou o caso para a imprensa.";
  },
  fallback: "calar",
};

// ---------------------------------------------------------------- apoios e promessas
const apoio_lideranca: EventDef = {
  id: "apoio_lideranca",
  kind: "DECISAO",
  tags: ["CAMPANHA", "COMUNIDADE"],
  blocking: false,
  cooldown: 20,
  max: 8,
  expires: 4,
  when: (c) => {
    const cand = running(c);
    if (!cand) return null;
    const known = actor(c, c.flag("lider_comunitario") as string | undefined);
    const hood = known ? String(known.role_label ?? "").replace(/^.*associação de moradores do /, "") || home(c) : bairro(c, `apoio:${Number(c.date.slice(5, 7)) % 3}`);
    const leader = known ?? communityLeader(c, hood);
    if (c.flag(`apoio:${leader.id}:${cand.id}`)) return null;
    return { cand: cand.id, leader: leader.id, hood, known: known ? 1 : 0 };
  },
  weightFn: (_c, b) => (Number(b.known) ? 2.5 : 1),
  render: (c, b) => {
    const leader = actor(c, b.leader)!;
    const r = relWith(c, leader.id);
    const free = r >= 40;
    return {
      title: free ? `${first(leader)} quer subir no seu palanque` : `${first(leader)} pode apoiar você — com condições`,
      who: leader,
      text: free
        ? `${leader.name} lembra de tudo o que vocês fizeram juntos no ${b.hood}. "Quero declarar apoio e levar o bairro comigo." Liderança comunitária respeitada vale mais que muito santinho.`
        : `${leader.name} tem a confiança de muita gente no ${b.hood}. "Posso pedir voto para você. Mas o bairro precisa de alguém lá dentro: se você ganhar, quero um cargo para tocar os projetos daqui."`,
      choices: free
        ? [
            { id: "palanque", label: `Subir no palanque com ${first(leader)}`, hint: "Apoio forte entre trabalhadores e moradores do bairro", tone: "safe", cost: { energy: 8 } },
            { id: "discreto", label: "Agradecer e pedir um apoio discreto", tone: "neutral" },
          ]
        : [
            { id: "cargo", label: "Aceitar e prometer o cargo", hint: "Apoio forte; promessa que será cobrada", tone: "risky" },
            { id: "sem_promessa", label: "Pedir o apoio sem prometer nada", hint: "Depende de carisma", tone: "bold" },
            { id: "recusar", label: "Recusar", tone: "neutral" },
          ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const leader = actor(c, b.leader)!;
    const cand = candOf(c, b.cand)!;
    fx.flag(`apoio:${leader.id}:${cand.id}`, c.date);
    const segs = ["informais", "trabalhadores_formais", "aposentados"];
    if (choice === "palanque") {
      fx.energy(-8);
      fx.seg(segs, 0.05, `apoio de ${leader.name}`);
      fx.volunteers(20);
      fx.rel(leader.id, 4);
      return `${first(leader)} pegou o microfone e falou de você com os olhos marejados. O ${b.hood} inteiro estava lá.`;
    }
    if (choice === "discreto") {
      fx.seg(segs, 0.025, `apoio de ${leader.name}`);
      return `${first(leader)} vai pedir votos de porta em porta, sem palanque.`;
    }
    if (choice === "cargo") {
      fx.seg(segs, 0.06, `apoio de ${leader.name}`);
      fx.volunteers(15);
      fx.rel(leader.id, 10);
      fx.flag(`promessa_cargo:${leader.id}`, c.date);
      return `Aperto de mão selado. ${first(leader)} vai trabalhar por você — e vai cobrar a promessa.`;
    }
    if (choice === "sem_promessa") {
      if (c.roll(0.3 + c.charisma * 0.4 + relWith(c, leader.id) / 150)) {
        fx.seg(segs, 0.035, `apoio de ${leader.name}`);
        fx.rel(leader.id, 4);
        return `${first(leader)} topou: "Gostei da sua franqueza."`;
      }
      fx.rel(leader.id, -4);
      return `${first(leader)} agradeceu e disse que ia "pensar com o bairro". Na semana seguinte, apareceu na foto de outro candidato.`;
    }
    fx.rel(leader.id, -6);
    return `${first(leader)} entendeu o recado.`;
  },
  fallback: "recusar",
};

const PROMESSAS: Record<string, Array<{ group: string; text: string }>> = {
  aposentados: [{ group: "aposentados", text: "manter a isenção de IPTU para aposentados e ampliar a farmácia popular" }],
  jovens_urbanos: [{ group: "estudantes", text: "criar o passe livre estudantil" }],
  evangelicos: [{ group: "pastores e líderes de igrejas", text: "garantir a liberdade de culto e apoiar os projetos sociais das igrejas" }],
  agro: [{ group: "produtores rurais", text: "asfaltar as estradas vicinais em quatro anos" }],
  informais: [{ group: "ambulantes e motoristas de aplicativo", text: "regularizar os ambulantes do centro e criar pontos de apoio para motoristas" }],
  trabalhadores_formais: [{ group: "sindicatos", text: "manter ônibus até meia-noite nos bairros e cobrar o piso salarial dos terceirizados" }],
  classe_media: [{ group: "associações comerciais", text: "cortar 20% dos cargos comissionados e não criar novos impostos" }],
};

const promessa_publico: EventDef = {
  id: "promessa_publico",
  kind: "DECISAO",
  tags: ["CAMPANHA"],
  blocking: false,
  cooldown: 14,
  max: 10,
  expires: 3,
  when: (c) => {
    const cand = running(c);
    if (!cand) return null;
    const focus = cand.campaign.focus?.length ? cand.campaign.focus : weakSegments(c.ctx, cand).map((s) => s.segment);
    const seg = c.rng.pick(focus.filter((k) => PROMESSAS[k]).length ? focus.filter((k) => PROMESSAS[k]) : Object.keys(PROMESSAS));
    const pr = PROMESSAS[seg][0];
    if (cand.campaign.promises?.some((x) => x.segment === seg)) return null;
    return { cand: cand.id, seg, group: pr.group, text: pr.text };
  },
  render: (c, b) => ({
    title: "Assine aqui, candidato(a)",
    text: `Num encontro com ${b.group}, a liderança estende uma carta-compromisso: você promete ${b.text}. Todo mundo filmando. Assinar rende votos agora; se você ganhar, essa folha vai voltar para a sua mesa.`,
    choices: [
      { id: "assinar", label: "Assinar o compromisso", hint: `Mais apoio entre ${segLabel(String(b.seg)).toLowerCase()}; promessa cobrada no mandato`, tone: "bold" },
      { id: "estudar", label: "Prometer estudar o tema", hint: "Morno", tone: "neutral" },
      { id: "recusar", label: "Recusar: não promete o que não sabe se pode cumprir", hint: "Coerência; perde alguns votos", tone: "safe" },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    const seg = String(b.seg);
    if (choice === "assinar") {
      fx.seg([seg], 0.06, `compromisso com ${b.group}`);
      fx.promise(String(b.text), seg);
      return "Foto, aplauso, vídeo no grupo deles. A promessa agora tem a sua assinatura.";
    }
    if (choice === "estudar") {
      fx.seg([seg], 0.012);
      return "\"Vou estudar com carinho.\" Ninguém saiu bravo — ninguém saiu animado.";
    }
    fx.reputation(1);
    fx.seg([seg], -0.01);
    return "Você explicou por que não assina sem saber o custo. Alguns gostaram da franqueza; outros foram embora.";
  },
  fallback: "estudar",
};

const voluntarios_onda: EventDef = {
  id: "voluntarios_onda",
  kind: "OPORTUNIDADE",
  tags: ["CAMPANHA"],
  cooldown: 18,
  expires: 4,
  when: (c) => {
    const cand = running(c);
    return cand && (cand.campaign.momentum > 0.04 || cand.campaign.volunteers >= 25) ? { cand: cand.id, n: c.rng.int(20, 60) } : null;
  },
  render: (_c, b) => ({
    title: `${b.n} voluntários novos`,
    text: `Depois da última semana, ${b.n} pessoas se cadastraram para ajudar. Gente que nunca fez campanha, querendo fazer alguma coisa. Voluntário sem tarefa desanima em dez dias.`,
    choices: [
      { id: "mutirao", label: "Organizar um mutirão de panfletagem", hint: "Apoio nos grupos-alvo", tone: "safe", cost: { energy: 12 } },
      { id: "digital", label: "Montar um núcleo digital", hint: "Alcance nas redes", tone: "bold", cost: { energy: 8 } },
      { id: "depois", label: "Agradecer e deixar para depois", tone: "neutral" },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    const n = Number(b.n);
    if (choice === "mutirao") {
      fx.energy(-12);
      fx.volunteers(n);
      fx.seg("focus", 0.03, "mutirão de voluntários");
      return `Sábado de manhã, ${n} pessoas de camiseta nas feiras e pontos de ônibus.`;
    }
    if (choice === "digital") {
      fx.energy(-8);
      fx.volunteers(Math.round(n / 2));
      fx.reach(0.008);
      fx.momentum(0.015, "núcleo digital de voluntários");
      return "O núcleo digital produziu memes, cortes e respostas em tempo real. Sua campanha ficou mais rápida que a dos adversários.";
    }
    fx.volunteers(Math.round(n / 4));
    return "Metade desistiu na primeira semana sem tarefa.";
  },
  fallback: "depois",
};

const reta_final: EventDef = {
  id: "reta_final",
  kind: "DECISAO",
  tags: ["CAMPANHA"],
  milestone: true,
  weight: 8,
  cooldown: 5,
  expires: 2,
  when: (c) => {
    const cand = running(c);
    const left = c.daysToVote;
    if (!cand || left === null || left > 7 || left < 2) return null;
    const key = `reta:${cand.id}:${cand.status}`;
    if (c.flag(key)) return null;
    return { cand: cand.id, key, left };
  },
  render: (c, b) => {
    const cand = candOf(c, b.cand)!;
    const left = Math.max(0, cand.campaign.budget - cand.campaign.spent);
    const lp = cand.campaign.last_poll;
    return {
      title: "Última semana",
      text: `Faltam ${b.left} dias. ${lp ? `Na última pesquisa, você tinha ${pct(lp.pct)} (${lp.rank}º).` : ""} A equipe está exausta, sobram ${brl(left)} no caixa da campanha e sua energia está em ${Math.round(c.st.energy)}. Cada decisão agora vale o dobro.`,
      choices: [
        { id: "virada", label: "Virada nos bairros, de manhã à noite", hint: "Rende nos grupos onde você ia mal; cansa muito", tone: "bold", cost: { energy: 35 } },
        { id: "propaganda", label: "Despejar o que resta em propaganda", hint: `${brl(left * 0.85)} em mídia`, tone: "safe", requires: () => (left > c.money(1000) ? null : "Não sobrou dinheiro na campanha.") },
        { id: "apoios", label: "Ligar para todos os apoios e pedir mobilização", hint: "Depende de quantos aliados você tem", tone: "neutral", cost: { energy: 15 } },
        { id: "poupar", label: "Poupar energia para o dia da eleição", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const cand = candOf(c, b.cand)!;
    fx.flag(String(b.key), c.date);
    if (choice === "virada") {
      fx.energy(-35);
      fx.health(-2);
      fx.seg(weakSegments(c.ctx, cand).map((s) => s.segment), 0.05, "virada nos bairros");
      fx.volunteers(15);
      return "Seis bairros por dia, três comícios relâmpago, nenhuma noite inteira de sono. Se perder, não foi por falta de perna.";
    }
    if (choice === "propaganda") {
      const v = Math.round((Math.max(0, cand.campaign.budget - cand.campaign.spent) * 0.85) / 100) * 100;
      fx.campaignSpend(v, "Mídia da reta final", "propaganda");
      const race = c.ctx.t.races.get(cand.race_id);
      const scale = v / Math.max(1, (race?.electorate ?? 100_000) * c.money(1) * 0.5);
      fx.momentum(Math.min(0.08, 0.02 + scale * 0.04), "mídia pesada na reta final");
      return "Sua cara em todo intervalo, todo feed, toda rádio. O eleitor indeciso vai votar lembrando de você.";
    }
    if (choice === "apoios") {
      fx.energy(-15);
      const allies = [...c.ctx.t.relationships.values()].filter((r) => r.a_id === c.p.id && r.score >= 30 && canAct(c.ctx.person(r.b_id))).length;
      fx.seg("all", Math.min(0.05, 0.008 * allies), `mobilização de ${allies} aliado(s)`);
      return allies ? `${allies} aliado(s) colocaram sua turma na rua no último fim de semana.` : "Você ligou para todo mundo — e descobriu que tem menos aliados do que imaginava.";
    }
    fx.energy(25);
    return "Você descansou para o dia da votação: fiscais organizados, transporte combinado, cabeça fria.";
  },
  fallback: "poupar",
};

// ---------------------------------------------------------------- resultado
const resultado_eleicao: EventDef = {
  id: "resultado_eleicao",
  kind: "DECISAO",
  tags: ["ELEICAO"],
  chained: true,
  milestone: true,
  expires: 3,
  // tudo o que a tela precisa vai junto: depois que a eleição fecha, a candidatura sai da memória do mundo
  when: (c, d) => {
    const cand = candOf(c, d?.cand);
    if (!cand) return null;
    const race = c.ctx.t.races.get(cand.race_id);
    const prop = OFFICES[cand.office_code].system === "PROPORCIONAL";
    const mandate = [...c.ctx.t.mandates.values()].find((x) => x.person_id === c.p.id && x.status === "FUTURO" && x.office_code === cand.office_code && x.election_id === cand.election_id);
    return {
      cand: cand.id,
      round: Number(d!.round),
      status: cand.status,
      votes: cand.votes,
      share: cand.vote_share,
      office: OFFICES[cand.office_code].name,
      place: geoName(cand.geo, c.ctx.s),
      party: c.ctx.t.parties.get(cand.party_id)?.acronym ?? "",
      prop: prop ? 1 : 0,
      seats: prop ? race?.results.first?.parties?.find((x) => x.party_id === cand.party_id)?.seats ?? 0 : 0,
      election: cand.election_id,
      mandate: mandate?.id ?? "",
      start: mandate?.start_on ?? "",
    };
  },
  render: (c, b) => {
    const office = String(b.office);
    const place = String(b.place);
    const votes = Number(b.votes).toLocaleString("pt-BR");
    const share = Number(b.share).toFixed(2).replace(".", ",");
    const status = String(b.status);
    if (status === "SEGUNDO_TURNO") {
      return {
        title: "Você está no 2º turno!",
        text: `Apuração encerrada: ${votes} votos (${share}% dos válidos). A disputa por ${office.toLowerCase()} em ${place} vai para o segundo turno. São três semanas de uma eleição nova, mano a mano.`,
        choices: [
          { id: "rua", label: "Comemorar e voltar para a rua amanhã cedo", tone: "bold" },
          { id: "equipe", label: "Reunir a equipe e redesenhar a estratégia", tone: "safe" },
        ],
      };
    }
    const won = status === "ELEITO";
    const detail = Number(b.prop) ? `Você teve ${votes} votos; o ${b.party} fez ${b.seats} cadeira(s).` : `Você teve ${votes} votos (${share}% dos válidos).`;
    return {
      title: won ? `Eleito(a): ${office.toLowerCase()}!` : status === "SUPLENTE" ? "Suplência" : "Não foi desta vez",
      text: won
        ? `${detail} A partir da posse, você é ${office.toLowerCase()} de ${place}. O telefone não para: aliados, imprensa, gente pedindo emprego.`
        : `${detail} ${status === "SUPLENTE" ? "Você ficou como suplente: se alguém da chapa sair, a vaga pode ser sua." : "As urnas não confirmaram seu nome."} O que você diz hoje à noite vai ser lembrado na próxima eleição.`,
      choices: won
        ? [
            { id: "agradecer", label: "Agradecer nas ruas, bairro por bairro", hint: "Reputação", tone: "safe", cost: { energy: 15 } },
            { id: "festa", label: "Festa com a militância", hint: "Prestígio com quem trabalhou", tone: "bold", cost: { money: c.money(2000) } },
            { id: "uniao", label: "Discurso de união, estendendo a mão aos adversários", hint: "Pontes para governar", tone: "neutral" },
          ]
        : [
            { id: "reconhecer", label: "Reconhecer a derrota e cumprimentar o vencedor", hint: "Reputação", tone: "safe" },
            { id: "contestar", label: "Questionar o resultado", hint: "Mobiliza os fiéis, afasta o resto", tone: "risky" },
            { id: "voltar", label: "Agradecer e anunciar que volta na próxima", hint: "Mantém a militância acesa", tone: "bold" },
          ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const status = String(b.status);
    fx.flag("ultima_eleicao", `${b.election}:${status}`);
    if (status === "SEGUNDO_TURNO") {
      if (choice === "rua") {
        fx.momentum(0.02, "ânimo da ida ao 2º turno");
        return "Às seis da manhã do dia seguinte você já estava na porta de uma fábrica.";
      }
      fx.debate(5);
      return "A equipe virou a noite redesenhando a campanha para o mano a mano.";
    }
    if (status === "ELEITO") {
      fx.bump("vitorias");
      // a posse vira acontecimento no dia em que o mandato começa
      if (b.mandate) fx.schedule("posse", Math.max(0, diffDays(String(b.start), c.date)), { mandate: String(b.mandate) });
      if (choice === "agradecer") {
        fx.energy(-15);
        fx.reputation(2);
        return "Você voltou aos bairros para agradecer, voto por voto. Quem votou em você se sentiu parte da vitória.";
      }
      if (choice === "festa") {
        fx.money(-c.money(2000), "Festa da vitória");
        fx.standing(5);
        return "A festa foi até as três da manhã. A militância vai lembrar desta noite por anos.";
      }
      fx.reputation(3);
      return "Seu discurso de união foi elogiado até por adversários. Governar vai exigir pontes.";
    }
    fx.bump("derrotas");
    if (choice === "reconhecer") {
      fx.reputation(2);
      return "Você ligou para o vencedor antes de falar com a imprensa. Elegância também é capital político.";
    }
    if (choice === "contestar") {
      fx.reputation(-3);
      fx.visibility(3);
      return "Seus apoiadores mais fiéis aplaudiram. O restante da cidade achou que você não sabe perder.";
    }
    fx.activism(5);
    fx.flag("volta_na_proxima", String(b.election));
    return "\"Isso aqui foi só o começo.\" A militância saiu cantando.";
  },
  fallback: "reconhecer",
};

const segundo_turno_apoios: EventDef = {
  id: "segundo_turno_apoios",
  kind: "DECISAO",
  tags: ["CAMPANHA", "PARTIDO"],
  chained: true,
  expires: 4,
  when: (c, d) => {
    const cand = candOf(c, d?.cand);
    if (!cand || cand.status !== "SEGUNDO_TURNO") return null;
    const race = c.ctx.t.races.get(cand.race_id);
    const third = race?.results.first?.candidates?.[2];
    if (!third) return null;
    const party = partyOf(c, third.party_id);
    if (!party || party.id === cand.party_id) return null;
    return { cand: cand.id, party: party.id, share: third.share };
  },
  render: (c, b) => {
    const party = partyOf(c, b.party)!;
    return {
      title: "A corrida pelos apoios do 2º turno",
      who: partyLeader(c.ctx, c.p, party),
      text: `O ${party.acronym}, que ficou em terceiro com ${String(Number(b.share).toFixed(1)).replace(".", ",")}% dos votos, está dividido entre apoiar você ou seu adversário. A direção estadual vai decidir esta semana — e todo mundo sabe que apoio de segundo turno tem preço.`,
      choices: [
        { id: "cargos", label: "Oferecer espaço no governo ou no gabinete", hint: "Apoio quase certo; promessa a cumprir", tone: "risky" },
        { id: "programa", label: "Buscar apoio com base no programa, sem cargos", hint: "Depende da afinidade entre os partidos", tone: "bold", cost: { energy: 10 } },
        { id: "sozinho", label: "Seguir sem alianças", hint: "Coerência", tone: "safe" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const party = partyOf(c, b.party)!;
    if (choice === "cargos") {
      fx.seg("all", 0.04, `apoio do ${party.acronym}`);
      fx.flag(`promessa_cargo:${party.id}`, c.date);
      return `O ${party.acronym} fechou com você. A lista de indicações já chegou por e-mail.`;
    }
    if (choice === "programa") {
      fx.energy(-10);
      if (c.roll(c.affinity(party) - 0.25)) {
        fx.seg("all", 0.03, `apoio programático do ${party.acronym}`);
        return `O ${party.acronym} anunciou apoio "pelo programa". Raro — e valioso.`;
      }
      return `O ${party.acronym} liberou os filiados. Cada um vota em quem quiser.`;
    }
    fx.reputation(1);
    return "Você seguiu sozinho(a), com o discurso de que \"não negocia o que é do povo\".";
  },
  fallback: "sozinho",
};

const prestacao_contas: EventDef = {
  id: "prestacao_contas",
  kind: "DECISAO",
  tags: ["ELEICAO", "DINHEIRO"],
  chained: true,
  expires: 6,
  when: (c, d) => {
    if (!d?.cand) return null;
    const notes = Math.max(2, Math.round(Number(d.costs ?? 0) / c.money(5000)));
    return { cand: String(d.cand), notes: Math.min(notes, 40), spent: Number(d.spent ?? 0), since: String(d.since ?? "0000") };
  },
  render: (c, b) => ({
    title: "Prestação de contas da campanha",
    text: `A Justiça Eleitoral pediu esclarecimentos sobre ${b.notes} notas fiscais da sua campanha (${brl(Number(b.spent))} em gastos declarados). Conta desaprovada vira multa e manchete; conta não prestada impede você de se candidatar até regularizar.`,
    choices: [
      { id: "contador", label: "Contratar um contador eleitoral e corrigir tudo", tone: "safe", cost: { money: c.money(3500) } },
      { id: "sozinho", label: "Responder você mesmo(a)", hint: "Barato; depende de competência", tone: "neutral", cost: { energy: 15 } },
      { id: "ignorar", label: "Ignorar o prazo", hint: "Multa e problemas futuros", tone: "risky" },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    const cand = { id: String(b.cand) };
    const hidden = [...c.ctx.t.illicit_acts.values()].filter((a) => a.person_id === c.p.id && !a.discovered && a.kind === "CAIXA_DOIS" && a.created_on >= String(b.since));
    const exposure = () => {
      if (hidden.length && c.roll(0.3)) {
        hidden[0].paper_trail = Math.min(1, hidden[0].paper_trail + 0.25);
        c.ctx.save("illicit_acts", hidden[0]);
        return " Um técnico do tribunal estranhou pagamentos sem nota. O pente-fino ficou mais fino.";
      }
      return "";
    };
    if (choice === "contador") {
      fx.money(-c.money(3500), "Contador eleitoral");
      fx.flag(`contas:${cand.id}`, "APROVADAS");
      return `Contas aprovadas sem ressalvas.${hidden.length ? " O contador fingiu não ver os buracos — mas viu." : ""}`;
    }
    if (choice === "sozinho") {
      fx.energy(-15);
      if (c.roll(0.4 + c.competence * 0.45)) {
        fx.flag(`contas:${cand.id}`, "APROVADAS");
        return "Você virou duas noites com planilhas e notas. Contas aprovadas com ressalvas leves." + exposure();
      }
      fx.money(-c.money(1500), "Multa da Justiça Eleitoral");
      fx.reputation(-1);
      fx.flag(`contas:${cand.id}`, "DESAPROVADAS");
      return "Contas desaprovadas: multa e uma nota no jornal." + exposure();
    }
    fx.money(-c.money(2500), "Multa por contas não prestadas");
    fx.reputation(-3);
    fx.flag(`contas:${cand.id}`, "NAO_PRESTADAS");
    return "Contas julgadas não prestadas. Até regularizar, sua quitação eleitoral fica pendente." + exposure();
  },
  fallback: "ignorar",
};

export const CAMPAIGN_EVENTS: EventDef[] = [
  reuniao_estrategia,
  pesquisa_preocupante,
  pesquisa_divulgada,
  projecao_lista,
  proposta_financiamento,
  partido_corta_verba,
  cabo_eleitoral,
  vaquinha_apoiadores,
  debate_preparo,
  debate_ao_vivo,
  ataque_adversario,
  direito_resposta,
  fake_news,
  gafe,
  gafe_repercute,
  adversario_escandalo,
  apoio_lideranca,
  promessa_publico,
  voluntarios_onda,
  reta_final,
  resultado_eleicao,
  segundo_turno_apoios,
  prestacao_contas,
];
