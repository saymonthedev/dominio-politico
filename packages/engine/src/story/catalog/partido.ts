import {
  acceptanceProbability,
  affiliationConcern,
  AFFILIATION_RETRY_DAYS,
  computeAffiliation,
  infidelityRisk,
  joinParty,
  leaveParty,
  loseMandateForInfidelity,
  type AffiliationConcern,
} from "../../affiliation";
import { addDays, diffDays, formatDatePt } from "../../calendar";
import { geoName } from "../../elections";
import { AXES, AXIS_INFO, clampAxis, type Axis } from "../../ideology";
import { OFFICES } from "../../ruleset";
import type { MembershipRow, PartyRow } from "../../types";
import type { StoryCtx } from "../context";
import type { EventDef } from "../def";
import type { Effects } from "../effects";
import { partyLeader, partyPeople } from "../world";
import { actor, bestContact, brl, first, home, partiesNear, partyOf, relWith } from "./util";

/**
 * Partido por dentro: o caminho até a filiação (conversas, análise, objeções,
 * padrinhos, recusas fundamentadas) e a vida depois dela — tarefas, alas,
 * disputas, orientação da bancada, convites de outras legendas e a luta por
 * um lugar na chapa.
 */

function membership(c: StoryCtx): MembershipRow | undefined {
  return [...c.ctx.t.memberships.values()].find((m) => m.person_id === c.p.id && m.status === "ATIVA");
}

/** Convite formal de filiação (o mesmo pedido que a tela de partidos mostra). */
function inviteToJoin(c: StoryCtx, fx: Effects, party: PartyRow, inviterId: string | null): void {
  const id = c.ctx.id("inv", c.p.id, party.id);
  c.ctx.save("affiliation_requests", {
    id,
    world_id: c.ctx.world.id,
    person_id: c.p.id,
    party_id: party.id,
    kind: "CONVITE",
    created_on: c.date,
    decide_on: addDays(c.date, 30),
    status: "PENDENTE",
    breakdown: {},
    reason: inviterId ? `Convite feito por ${c.ctx.person(inviterId)?.name ?? "um dirigente"}.` : `Convite da direção do ${party.acronym}.`,
  });
  fx.schedule("convite_filiacao", 0, { req: id, party: party.id, inviter: inviterId ?? "" });
}

/** Eixo em que o personagem e o partido mais divergem. */
function biggestRift(c: StoryCtx, party: PartyRow): { axis: Axis; mine: number; theirs: number } {
  let best: Axis = AXES[0];
  let gap = -1;
  for (const ax of AXES) {
    const g = Math.abs(c.p.ideology[ax] - party.ideology[ax]);
    if (g > gap) {
      gap = g;
      best = ax;
    }
  }
  return { axis: best, mine: c.p.ideology[best], theirs: party.ideology[best] };
}

const side = (ax: Axis, v: number) => (v < 0 ? AXIS_INFO[ax].neg : AXIS_INFO[ax].pos);

// ---------------------------------------------------------------- antes da filiação
const dirigente_interessado: EventDef = {
  id: "dirigente_interessado",
  kind: "OPORTUNIDADE",
  tags: ["PARTIDO", "FILIACAO"],
  weight: 1.1,
  cooldown: 90,
  expires: 10,
  when: (c, d) => {
    if (c.p.party_id) return null;
    if (d) {
      const party = partyOf(c, d.party);
      if (!party || party.status !== "ATIVO") return null;
      const leader = actor(c, d.leader) ?? partyLeader(c.ctx, c.p, party);
      return { party: party.id, leader: leader.id, warm: Number(d.warm ?? 0) };
    }
    if (c.st.activism < 12 && c.p.reputation < 45 && c.p.visibility < 10) return null;
    const options = partiesNear(c).slice(0, 4).filter((x) => !c.flag(`cafe:${x.id}`));
    if (!options.length) return null;
    const party = c.rng.weighted(options, (x) => Math.max(0.05, c.affinity(x) - 0.45));
    return { party: party.id, leader: partyLeader(c.ctx, c.p, party).id, warm: 0 };
  },
  render: (c, b) => {
    const party = partyOf(c, b.party)!;
    const leader = actor(c, b.leader);
    const pitch = c.affinity(party) > 0.78 ? "Pelo que vejo, você já pensa como a gente." : "A gente não concorda em tudo, mas partido grande é assim.";
    return {
      title: `O ${party.acronym} quer conversar`,
      who: leader,
      text: `${leader?.name ?? "Um dirigente"}${leader?.role_label ? `, ${leader.role_label},` : ""} manda mensagem: "${b.warm ? "Fulano me falou muito bem de você." : "Tenho acompanhado seu trabalho no bairro."} Vamos tomar um café? ${pitch}" O ${party.acronym} tem ${Math.round((party.territory[c.p.uf] ?? 0) * 100)}% de força eleitoral no estado e a cultura de entrada é ${party.entry_culture === "ABERTO" ? "aberta" : party.entry_culture === "RELACIONAMENTO" ? "de relacionamento: quem entra, entra apresentado por alguém" : "fechada: só entra quem é convidado"}.`,
      choices: [
        { id: "cafe", label: "Aceitar o café", hint: "Conhecer a direção por dentro", tone: "safe", cost: { energy: 5 } },
        { id: "outros", label: "Dizer que ainda está conhecendo outros partidos", hint: "Mantém a porta aberta, sem compromisso", tone: "neutral" },
        { id: "nao", label: "Recusar: sem partido por enquanto", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const party = partyOf(c, b.party)!;
    const leader = actor(c, b.leader);
    fx.flag(`cafe:${party.id}`, c.date);
    if (choice === "cafe") {
      fx.energy(-5);
      if (leader) fx.rel(leader.id, 10 + Number(b.warm) * 6);
      if (c.p.stage === "CIDADAO" || c.p.stage === "ATIVISTA") fx.stage("APROXIMACAO");
      const r = relWith(c, leader?.id) + 10;
      if (party.entry_culture !== "CONVITE" || r >= 35) {
        if (c.roll(0.25 + r / 120 + (c.affinity(party) - 0.6))) {
          fx.flag(`convite_prometido:${party.id}`, c.date);
          fx.schedule("convite_formal", [7, 20], { party: party.id, leader: leader?.id ?? "" });
          return `O café virou almoço. ${first(leader)} falou da história do ${party.acronym}, das brigas internas e terminou com um "pensa com carinho; a gente quer você".`;
        }
      }
      return `Conversa boa, sem promessas. ${first(leader)} disse que "o partido tem seus tempos". Você entendeu que vai precisar de mais estrada — ou de alguém de dentro.`;
    }
    if (choice === "outros") {
      if (leader) fx.rel(leader.id, 3);
      return `${first(leader)} riu: "Faz bem. Mas não demora, que lugar na chapa não espera."`;
    }
    return "Você agradeceu e disse que, por enquanto, prefere atuar sem partido.";
  },
  fallback: "nao",
};

const convite_formal: EventDef = {
  id: "convite_formal",
  kind: "INFO",
  tags: ["PARTIDO", "FILIACAO"],
  chained: true,
  when: (c, d) => {
    const party = partyOf(c, d?.party);
    if (c.p.party_id || !party || party.status !== "ATIVO") return null;
    return d!;
  },
  render: (c, b) => {
    const party = partyOf(c, b.party)!;
    return { title: `Chegou o convite do ${party.acronym}`, who: actor(c, b.leader), text: `A direção do ${party.acronym} formalizou o convite que ficou no ar naquele café.`, choices: [] };
  },
  resolve: (c, b, _choice, fx) => {
    const party = partyOf(c, b.party)!;
    inviteToJoin(c, fx, party, actor(c, b.leader)?.id ?? null);
    return `O convite do ${party.acronym} está na sua mesa.`;
  },
};

const convite_filiacao: EventDef = {
  id: "convite_filiacao",
  kind: "OPORTUNIDADE",
  tags: ["PARTIDO", "FILIACAO"],
  chained: true,
  expires: 25,
  when: (c, d) => {
    const req = d ? c.ctx.t.affiliation_requests.get(String(d.req)) : undefined;
    return req?.status === "PENDENTE" && !c.p.party_id ? d! : null;
  },
  valid: (c, b) => c.ctx.t.affiliation_requests.get(String(b.req))?.status === "PENDENTE" && !c.p.party_id,
  render: (c, b) => {
    const party = partyOf(c, b.party)!;
    const inviter = actor(c, b.inviter);
    const aff = Math.round(c.affinity(party) * 100);
    return {
      title: `Convite de filiação: ${party.acronym}`,
      who: inviter,
      text: `${inviter ? `${inviter.name} assina o convite` : `A direção do ${party.acronym} assina o convite`}: "${party.name} quer você nos nossos quadros." Afinidade com o programa: ${aff}%. Força no estado: ${Math.round((party.territory[c.p.uf] ?? 0) * 100)}%. Entrar por convite é diferente de entrar pedindo: você chega com quem abriu a porta — e com o que essa pessoa espera de você.`,
      choices: [
        { id: "aceitar", label: `Aceitar e se filiar ao ${party.acronym}`, tone: "bold" },
        { id: "recusar", label: "Recusar o convite", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const req = c.ctx.t.affiliation_requests.get(String(b.req))!;
    const party = partyOf(c, b.party)!;
    const inviter = actor(c, b.inviter);
    if (choice === "aceitar") {
      req.status = "ACEITO";
      c.ctx.save("affiliation_requests", req);
      joinParty(c.ctx, c.p, party);
      fx.standing(6);
      if (inviter) fx.rel(inviter.id, 8);
      if (inviter) fx.flag(`padrinho:${party.id}`, inviter.id);
      fx.schedule("tarefa_partido", [10, 25], {});
      c.ctx.notify(c.p.id, `Filiação: ${party.acronym}`, `Você agora é filiado(a) ao ${party.acronym}.`, "/jogo/carreira");
      return `Ficha assinada. Você é do ${party.acronym}${inviter ? `, apresentado(a) por ${inviter.name}` : ""}. Na lista de filiados, seu nome ainda está lá no fim.`;
    }
    req.status = "RECUSADO";
    c.ctx.save("affiliation_requests", req);
    if (inviter) fx.rel(inviter.id, -3);
    return "Convite recusado, com educação. Ninguém gosta de ouvir não — mas todo mundo respeita quem sabe o que quer.";
  },
  fallback: "recusar",
};

const CONCERN_TEXT: Record<AffiliationConcern, string> = {
  ESCANDALOS: "o seu histórico: o caso que saiu na imprensa ainda incomoda a direção",
  CULTURA: "o fato de ninguém de dentro ter apresentado você — no partido, ficha só é abonada com padrinho",
  AFINIDADE: "críticas públicas que você já fez a bandeiras do partido",
  TRAJETORIA: "a pouca estrada: quase nenhuma militância, nenhum trabalho de base conhecido",
  REPUTACAO: "a falta de reconhecimento: seu nome não diz nada para a maioria dos filiados",
  RELACIONAMENTO: "o fato de ninguém da direção conhecer você pessoalmente",
};

const filiacao_analise: EventDef = {
  id: "filiacao_analise",
  kind: "DECISAO",
  tags: ["FILIACAO", "PARTIDO"],
  chained: true,
  expires: 4,
  when: (c, d) => {
    const req = d ? c.ctx.t.affiliation_requests.get(String(d.req)) : undefined;
    const party = partyOf(c, d?.party);
    if (!req || req.status !== "PENDENTE" || !party || c.p.party_id) return null;
    const br = computeAffiliation(c.ctx, c.p, party, "PEDIDO");
    const concern = affiliationConcern(br);
    const prob = acceptanceProbability(br.total + (req.breakdown.apoio_na_analise ?? 0));
    if (!concern && prob >= 0.75) return null;
    return { req: req.id, party: party.id, concern: concern ?? "RELACIONAMENTO", leader: partyLeader(c.ctx, c.p, party).id };
  },
  valid: (c, b) => c.ctx.t.affiliation_requests.get(String(b.req))?.status === "PENDENTE",
  render: (c, b) => {
    const party = partyOf(c, b.party)!;
    const leader = actor(c, b.leader);
    const concern = String(b.concern) as AffiliationConcern;
    const req = c.ctx.t.affiliation_requests.get(String(b.req))!;
    let detail = CONCERN_TEXT[concern];
    if (concern === "AFINIDADE") {
      const r = biggestRift(c, party);
      detail = `críticas públicas suas a bandeiras do partido — em ${AXIS_INFO[r.axis].label.toLowerCase()}, você defende uma linha ${side(r.axis, r.mine)}, e o ${party.acronym}, ${side(r.axis, r.theirs)}`;
    }
    const sponsor = bestContact(c, 20, (x) => x.party_id === party.id);
    return {
      title: "Solicitação de filiação",
      who: leader,
      text: `Seu pedido de filiação ao ${party.acronym} está em análise no diretório${leader ? `, nas mãos de ${leader.name}` : ""}. Alguns dirigentes estão preocupados com ${detail}. A decisão sai até ${formatDatePt(req.decide_on)}.`,
      choices: [
        { id: "conversar", label: "Conversar com os dirigentes", hint: "Uma conversa franca pode desfazer a má impressão — ou confirmá-la", tone: "bold", cost: { energy: 10 } },
        {
          id: "padrinho",
          label: sponsor ? `Buscar o apoio de ${sponsor.name}` : "Buscar o apoio de um membro influente",
          hint: "Um padrinho abre portas — e depois cobra",
          tone: "risky",
          requires: () => (sponsor ? null : `Você não tem ninguém próximo no ${party.acronym} (relação de 20 ou mais).`),
        },
        { id: "manter", label: "Manter suas opiniões e aguardar", hint: "Coerência tem valor; a análise segue como está", tone: "safe" },
        { id: "desistir", label: "Desistir do pedido", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const req = c.ctx.t.affiliation_requests.get(String(b.req))!;
    const party = partyOf(c, b.party)!;
    const leader = actor(c, b.leader);
    const concern = String(b.concern) as AffiliationConcern;
    const add = (v: number) => {
      req.breakdown = { ...req.breakdown, apoio_na_analise: Math.round(((req.breakdown.apoio_na_analise ?? 0) + v) * 10) / 10 };
      c.ctx.save("affiliation_requests", req);
    };
    if (choice === "conversar") {
      fx.energy(-10);
      const p = 0.3 + c.charisma * 0.35 + (c.affinity(party) - 0.6) * 0.8 - (concern === "ESCANDALOS" ? 0.15 : 0);
      if (c.roll(p)) {
        add(16);
        if (leader) fx.rel(leader.id, 8);
        if (concern === "AFINIDADE") {
          const r = biggestRift(c, party);
          c.p.ideology[r.axis] = clampAxis(c.p.ideology[r.axis] * 0.85 + party.ideology[r.axis] * 0.15);
          fx.touch();
          return `Você explicou suas posições sem renegá-las e reconheceu pontos em comum. ${first(leader)} saiu dizendo que "dá para conviver". Você moderou um pouco o discurso em ${AXIS_INFO[r.axis].label.toLowerCase()}.`;
        }
        return `A conversa desfez boa parte da desconfiança. ${first(leader)} prometeu levar sua defesa à reunião.`;
      }
      add(3);
      if (leader) fx.rel(leader.id, -2);
      return "A conversa foi educada e fria. Você saiu sem saber se ajudou ou atrapalhou.";
    }
    if (choice === "padrinho") {
      const sponsor = bestContact(c, 20, (x) => x.party_id === party.id);
      if (!sponsor) return "Você não encontrou ninguém disposto a interceder.";
      const r = relWith(c, sponsor.id);
      add(Math.min(26, 9 + r * 0.3));
      fx.rel(sponsor.id, 3);
      fx.flag(`padrinho:${party.id}`, sponsor.id);
      fx.schedule("padrinho_cobra", [60, 200], { sponsor: sponsor.id, party: party.id });
      return `${sponsor.name} ligou para três pessoas da direção. "Pode ficar tranquilo(a), eu respondo por você." Agora existe uma dívida — e você sabe disso.`;
    }
    if (choice === "manter") {
      fx.reputation(0.5);
      return "Você manteve suas posições. Quem acompanha sua trajetória respeita a coerência; a direção vai decidir com o que tem.";
    }
    req.status = "RETIRADO";
    c.ctx.save("affiliation_requests", req);
    return `Você retirou o pedido. O ${party.acronym} fica para outra hora — ou para nunca.`;
  },
  fallback: "manter",
};

const filiacao_aprovada: EventDef = {
  id: "filiacao_aprovada",
  kind: "DECISAO",
  tags: ["FILIACAO", "PARTIDO"],
  chained: true,
  milestone: true,
  expires: 5,
  when: (c, d) => (d && c.p.party_id === String(d.party) ? { ...d, leader: partyLeader(c.ctx, c.p, partyOf(c, d.party)!).id } : null),
  render: (c, b) => {
    const party = partyOf(c, b.party)!;
    const leader = actor(c, b.leader);
    const fac = [...c.ctx.t.factions.values()].filter((f) => f.party_id === party.id).sort((a, b2) => b2.strength - a.strength)[0];
    return {
      title: `Bem-vindo(a) ao ${party.acronym}`,
      who: leader,
      text: `A ficha foi abonada na reunião do diretório${leader ? ` e ${leader.name} assinou` : ""}. Você é oficialmente filiado(a) ao ${party.name}. Na prática, ainda é só um nome no fim da lista: prestígio, espaço na chapa e acesso ao fundo partidário se conquistam por dentro. Como você quer começar?`,
      choices: [
        { id: "tarefas", label: "Oferecer-se para as tarefas do diretório", hint: "Trabalho de formiga, prestígio de verdade", tone: "safe", cost: { energy: 10 } },
        ...(fac ? [{ id: "ala", label: `Procurar a ${fac.name}`, hint: "Ter grupo dá proteção — e adversários", tone: "bold" as const }] : []),
        { id: "observar", label: "Começar discreto(a), observando", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const party = partyOf(c, b.party)!;
    const leader = actor(c, b.leader);
    fx.flag("filiado_em", c.date);
    if (choice === "tarefas") {
      fx.energy(-10);
      fx.standing(5);
      if (leader) fx.rel(leader.id, 5);
      fx.schedule("tarefa_partido", [6, 18], {});
      return `Na primeira reunião você já saiu com uma tarefa. ${first(leader)} gostou da disposição.`;
    }
    if (choice === "ala") {
      const fac = [...c.ctx.t.factions.values()].filter((f) => f.party_id === party.id).sort((a, b2) => b2.strength - a.strength)[0];
      if (fac) {
        c.p.faction_id = fac.id;
        fx.touch();
        fx.standing(3);
        if (fac.leader_id && actor(c, fac.leader_id)) fx.rel(fac.leader_id, 6);
        return `Você se aproximou da ${fac.name}. Agora tem quem defenda seu nome nas reuniões — e quem desconfie dele, do outro lado.`;
      }
    }
    fx.debate(1);
    return "Você passou as primeiras semanas ouvindo. Já sabe quem manda, quem obedece e quem finge que manda.";
  },
  fallback: "observar",
};

const WEAKEST_TIP: Array<[string, string]> = [
  ["afinidade_ideologica", "aproximar suas posições do programa ou escolher um partido mais próximo"],
  ["reputacao", "construir reputação: eventos, projetos, imprensa"],
  ["trajetoria", "mostrar trajetória: militância, voluntariado, trabalho de base"],
  ["relacionamento_local", "conhecer gente de dentro do partido"],
  ["historico_de_escandalos", "deixar o escândalo esfriar"],
  ["cultura_de_entrada", "chegar apresentado(a) por alguém do partido"],
];

const filiacao_recusada: EventDef = {
  id: "filiacao_recusada",
  kind: "DECISAO",
  tags: ["FILIACAO", "PARTIDO"],
  chained: true,
  expires: 5,
  // o pedido recusado não volta do banco nas próximas leituras: o evento leva o que precisa
  when: (c, d) => {
    const req = d ? c.ctx.t.affiliation_requests.get(String(d.req)) : undefined;
    const party = partyOf(c, d?.party);
    if (!req || !party) return null;
    const br = req.breakdown;
    const tip = [...WEAKEST_TIP].sort((x, y) => (br[x[0]] ?? 0) - (br[y[0]] ?? 0))[0][1];
    return {
      req: req.id,
      party: party.id,
      leader: partyLeader(c.ctx, c.p, party).id,
      reason: req.reason ?? "",
      prob: Math.round(br.probabilidade ?? 0),
      retry: addDays(req.decide_on, AFFILIATION_RETRY_DAYS),
      tip,
    };
  },
  render: (c, b) => {
    const party = partyOf(c, b.party)!;
    return {
      title: `O ${party.acronym} disse não`,
      who: actor(c, b.leader),
      text: `O diretório recusou seu pedido. ${b.reason} A chance estimada de aprovação era de ${b.prob}%. Um novo pedido ao ${party.acronym} só será analisado a partir de ${formatDatePt(String(b.retry))}.`,
      choices: [
        { id: "entender", label: "Pedir uma conversa para entender", hint: "Saber o que pesou ajuda na próxima", tone: "safe", cost: { energy: 5 } },
        { id: "seguir", label: "Seguir em frente e olhar outros partidos", tone: "neutral" },
        { id: "desabafar", label: "Desabafar nas redes", hint: "Ganha atenção; queima pontes", tone: "risky" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const party = partyOf(c, b.party)!;
    const leader = actor(c, b.leader);
    if (choice === "entender") {
      fx.energy(-5);
      if (leader) fx.rel(leader.id, 5);
      return `${first(leader)} foi franco(a): "Da próxima vez, tente ${b.tip}." Você saiu com um plano — e um contato que agora torce por você.`;
    }
    if (choice === "desabafar") {
      fx.visibility(2);
      if (leader) fx.rel(leader.id, -12);
      fx.flag(`magoa:${party.id}`, c.date);
      if (c.roll(0.4 + c.charisma * 0.2)) {
        fx.reputation(0.5);
        return "Seu desabafo sobre os \"caciques que não deixam gente nova entrar\" rendeu apoio — e uma inimizade no diretório.";
      }
      fx.reputation(-1.5);
      return "O desabafo soou como ressentimento. A direção do partido agora tem certeza de que acertou.";
    }
    return `Fica a lição. Há outros partidos — e o ${party.acronym} não é o único caminho.`;
  },
  fallback: "seguir",
};

const padrinho_cobra: EventDef = {
  id: "padrinho_cobra",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  chained: true,
  expires: 6,
  when: (c, d) => {
    const sponsor = actor(c, d?.sponsor);
    if (!sponsor || c.p.party_id !== String(d?.party)) return null;
    return d!;
  },
  render: (c, b) => {
    const sponsor = actor(c, b.sponsor)!;
    const ask = c.cand
      ? `que você ceda dois dias da sua agenda de campanha para pedir votos para ${first(sponsor)}`
      : c.p.office_code
        ? `que você apoie um projeto de interesse de ${first(sponsor)} na próxima votação`
        : `seu voto e seu empenho na eleição interna do diretório, em que ${first(sponsor)} é candidato(a)`;
    return {
      title: "O padrinho cobra a conta",
      who: sponsor,
      text: `${sponsor.name} foi quem abonou sua ficha no partido. Agora pede ${ask}. "Lembra quem segurou sua mão quando ninguém te conhecia."`,
      choices: [
        { id: "retribuir", label: "Retribuir o apoio", hint: "Lealdade fortalece a relação — e amarra você", tone: "safe", cost: { energy: 15 } },
        { id: "negociar", label: "Negociar uma ajuda menor", tone: "neutral" },
        { id: "negar", label: "Negar", hint: "Você ganha independência e um inimigo", tone: "risky" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const sponsor = actor(c, b.sponsor)!;
    if (choice === "retribuir") {
      fx.energy(-15);
      fx.rel(sponsor.id, 12);
      fx.standing(3);
      if (c.cand) fx.momentum(-0.01, "agenda cedida a aliado");
      return `${first(sponsor)} ficou satisfeito(a) e anda dizendo que você "é de confiança".`;
    }
    if (choice === "negociar") {
      fx.rel(sponsor.id, -3);
      return `Vocês chegaram a um meio-termo. ${first(sponsor)} aceitou — de cara fechada.`;
    }
    fx.rel(sponsor.id, -22);
    fx.standing(-4);
    fx.unflag(`padrinho:${String(b.party)}`);
    return `${sponsor.name} não esconde a mágoa: "Ingratidão eu não esqueço." Na próxima reunião, sentou do outro lado da mesa.`;
  },
  fallback: "negociar",
};

// ---------------------------------------------------------------- vida partidária
const tarefa_partido: EventDef = {
  id: "tarefa_partido",
  kind: "OPORTUNIDADE",
  tags: ["PARTIDO"],
  weight: 1.2,
  cooldown: 80,
  expires: 7,
  when: (c) => {
    if (!c.p.party_id || c.phase === "RETA_FINAL" || c.st.party_standing >= 75) return null;
    const task = c.rng.pick([
      { t: "coordenar a panfletagem do partido no {h}", g: 6 },
      { t: "organizar a plenária regional do mês que vem", g: 7 },
      { t: "cuidar das redes sociais do diretório por um mês", g: 6 },
      { t: "montar o cadastro de filiados do {h}", g: 5 },
      { t: "representar o partido numa audiência pública na Câmara", g: 7 },
    ]);
    return { task: task.t.replace("{h}", home(c)), gain: task.g, party: c.p.party_id };
  },
  valid: (c, b) => c.p.party_id === String(b.party),
  render: (c, b) => {
    const party = c.party!;
    return {
      title: `O ${party.acronym} precisa de alguém`,
      who: partyLeader(c.ctx, c.p, party),
      text: `Na reunião de segunda, a direção pergunta quem topa ${b.task}. Silêncio na sala. Quem levanta a mão nessas horas é lembrado na hora de montar chapa.`,
      choices: [
        { id: "assumir", label: "Levantar a mão", hint: "Prestígio interno", tone: "safe", cost: { energy: 18 } },
        { id: "caprichar", label: "Assumir e caprichar, tirando do próprio bolso", hint: "Mais prestígio, algum gasto", tone: "bold", cost: { energy: 22, money: c.money(400) } },
        { id: "passar", label: "Ficar quieto(a)", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const leader = partyLeader(c.ctx, c.p, c.party!);
    if (choice === "assumir") {
      fx.energy(-18);
      fx.standing(Number(b.gain));
      fx.activism(2);
      fx.rel(leader.id, 4);
      if (c.p.stage === "FILIADO" && c.st.party_standing >= 45) fx.stage("QUADRO");
      return `Tarefa cumprida. Na reunião seguinte, ${first(leader)} citou seu nome.`;
    }
    if (choice === "caprichar") {
      fx.energy(-22);
      fx.money(-c.money(400), "Material para tarefa do partido");
      fx.standing(Number(b.gain) + 3);
      fx.rel(leader.id, 7);
      if (c.p.stage === "FILIADO" && c.st.party_standing >= 45) fx.stage("QUADRO");
      return "Você fez além do pedido — com material próprio e relatório no fim. A direção notou.";
    }
    fx.standing(-1);
    return "Outra pessoa levantou a mão. Na próxima lista de indicações, o nome dela vem antes do seu.";
  },
  fallback: "passar",
};

const disputa_diretorio: EventDef = {
  id: "disputa_diretorio",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  cooldown: 300,
  expires: 5,
  when: (c) => {
    if (!c.p.party_id || c.st.party_standing < 15 || c.phase) return null;
    const people = partyPeople(c.ctx, c.p, c.party!).filter((x) => x.reputation >= 35);
    if (people.length < 2) return null;
    const [a, b2] = c.rng.shuffle([...people.slice(0, 6)]).slice(0, 2);
    return { a: a.id, b: b2.id, party: c.p.party_id! };
  },
  valid: (c, b) => c.p.party_id === String(b.party),
  render: (c, b) => {
    const a = actor(c, b.a)!;
    const o = actor(c, b.b)!;
    const party = c.party!;
    return {
      title: `Racha no diretório do ${party.acronym}`,
      text: `A eleição do diretório municipal virou guerra: ${a.name} quer renovar a direção; ${o.name} representa o grupo que comanda o partido há anos. Os dois pediram seu voto — e os dois vão lembrar dele.`,
      choices: [
        { id: "a", label: `Apoiar ${a.name}`, tone: "bold" },
        { id: "b", label: `Apoiar ${o.name}`, tone: "bold" },
        { id: "neutro", label: "Ficar neutro(a)", hint: "Ninguém ganha, ninguém perde", tone: "safe" },
        { id: "eu", label: "Lançar seu próprio nome", hint: "Arriscado: precisa de muito prestígio", tone: "risky", requires: () => (c.st.party_standing >= 45 ? null : "Exige prestígio interno de 45.") },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const a = actor(c, b.a)!;
    const o = actor(c, b.b)!;
    if (choice === "a" || choice === "b") {
      const mine = choice === "a" ? a : o;
      const other = choice === "a" ? o : a;
      fx.rel(mine.id, 10);
      fx.rel(other.id, -8);
    }
    fx.schedule("diretorio_resultado", [8, 18], { a: a.id, b: o.id, choice, party: c.p.party_id ?? "" });
    if (choice === "eu") return "Você registrou sua chapa. Metade do partido achou ousadia; a outra metade, petulância.";
    if (choice === "neutro") return "Você não se comprometeu. Os dois lados notaram — e nenhum gostou muito.";
    return `Você declarou apoio a ${choice === "a" ? a.name : o.name}. Agora é torcer.`;
  },
  fallback: "neutro",
};

const diretorio_resultado: EventDef = {
  id: "diretorio_resultado",
  kind: "INFO",
  tags: ["PARTIDO"],
  chained: true,
  milestone: false,
  blocking: true,
  when: (c, d) => (d && c.p.party_id && c.p.party_id === String(d.party) && actor(c, d.a) && actor(c, d.b) ? d : null),
  render: (c, b) => ({ title: `Resultado no diretório do ${c.party?.acronym}`, text: "A eleição interna terminou.", choices: [{ id: "ok", label: "Continuar" }] }),
  resolve: (c, b, _choice, fx) => {
    const a = actor(c, b.a)!;
    const o = actor(c, b.b)!;
    const choice = String(b.choice);
    if (choice === "eu") {
      const p = 0.15 + (c.st.party_standing - 45) / 100 + c.charisma * 0.2;
      if (c.roll(p)) {
        const m = membership(c);
        if (m) {
          m.role = "DIRIGENTE";
          c.ctx.save("memberships", m);
        }
        fx.standing(15);
        fx.capital(5);
        fx.rel(a.id, -6);
        fx.rel(o.id, -10);
        fx.flag("dirigente", c.date);
        return `Zebra! Você venceu a eleição do diretório e agora faz parte da direção municipal do ${c.party!.acronym}.`;
      }
      fx.standing(-8);
      fx.rel(o.id, -6);
      return "Você perdeu — feio. A direção eleita não esquece quem tentou derrubá-la.";
    }
    const sa = a.reputation + c.rng.normal(0, 12);
    const so = o.reputation + 8 + c.rng.normal(0, 12);
    const winner = sa > so ? "a" : "b";
    const w = winner === "a" ? a : o;
    if (choice === "neutro") return `${w.name} venceu. Você, que não tomou lado, segue onde estava.`;
    if (choice === winner) {
      fx.standing(8);
      fx.rel(w.id, 5);
      return `${w.name} venceu — e não esqueceu quem esteve do lado certo. Seu prestígio no partido subiu.`;
    }
    fx.standing(-6);
    return `${w.name} venceu. Você apostou no lado errado, e a nova direção sabe disso.`;
  },
};

const cargo_partidario_oferta: EventDef = {
  id: "cargo_partidario_oferta",
  kind: "OPORTUNIDADE",
  tags: ["PARTIDO"],
  cooldown: 365,
  max: 2,
  expires: 10,
  when: (c) => {
    const m = membership(c);
    if (!m || m.role !== "MEMBRO" || c.st.party_standing < 40) return null;
    return { area: c.rng.pick(["organização", "comunicação", "formação política", "juventude", "finanças"]), party: c.p.party_id! };
  },
  valid: (c, b) => c.p.party_id === String(b.party),
  render: (c, b) => ({
    title: "Um lugar na direção",
    who: partyLeader(c.ctx, c.p, c.party!),
    text: `A direção do ${c.party!.acronym} oferece a você a secretaria de ${b.area}. É trabalho sem salário e com muita reunião — e é também o primeiro degrau para decidir quem vai para a urna.`,
    choices: [
      { id: "aceitar", label: `Assumir a secretaria de ${b.area}`, hint: "Prestígio e poder interno; menos tempo livre", tone: "bold" },
      { id: "recusar", label: "Agradecer e recusar", tone: "neutral" },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    if (choice === "aceitar") {
      const m = membership(c);
      if (m) {
        m.role = "DIRIGENTE";
        c.ctx.save("memberships", m);
      }
      fx.standing(8);
      fx.capital(3);
      fx.energy(-10);
      fx.flag("dirigente", c.date);
      return `Você é secretário(a) de ${b.area} do ${c.party!.acronym}. Seu telefone não para mais.`;
    }
    fx.standing(-1);
    return "Você recusou. Alguém mais faminto(a) ficou com o lugar.";
  },
  fallback: "recusar",
};

const orientacao_partido: EventDef = {
  id: "orientacao_partido",
  kind: "DECISAO",
  tags: ["PARTIDO", "MANDATO"],
  cooldown: 200,
  expires: 4,
  when: (c) => {
    const party = c.party;
    if (!party || c.phase === "RETA_FINAL") return null;
    const r = biggestRift(c, party);
    if (Math.abs(r.mine - r.theirs) < 35) return null;
    return { axis: r.axis, party: party.id };
  },
  valid: (c, b) => c.p.party_id === String(b.party),
  weightFn: (c) => (c.p.office_code ? 1.5 : 0.7),
  render: (c, b) => {
    const party = c.party!;
    const ax = String(b.axis) as Axis;
    const theirs = side(ax, party.ideology[ax]);
    const mine = side(ax, c.p.ideology[ax]);
    const where = c.p.office_code ? `Na votação desta semana, a bancada vai fechar questão` : `Na próxima plenária, o partido vai aprovar uma resolução`;
    return {
      title: "O partido fechou questão",
      who: partyLeader(c.ctx, c.p, party),
      text: `${where} por uma posição ${theirs} em ${AXIS_INFO[ax].label.toLowerCase()}. Você sempre defendeu o contrário (${mine}) — e quem votou em você sabe disso. A direção espera disciplina.`,
      choices: [
        { id: "seguir", label: "Seguir a orientação do partido", hint: "Disciplina conta pontos dentro; sua base pode estranhar", tone: "safe" },
        { id: "contra", label: "Discordar publicamente", hint: "Coerência com sua base; atrito com a direção", tone: "bold" },
        { id: "ausente", label: "Se ausentar e não se posicionar", hint: "Ninguém aplaude, ninguém pune muito", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const ax = String(b.axis) as Axis;
    const party = c.party!;
    if (choice === "seguir") {
      fx.standing(4);
      fx.reputation(-1);
      c.p.ideology[ax] = clampAxis(c.p.ideology[ax] * 0.85 + party.ideology[ax] * 0.15);
      fx.touch();
      return "Você seguiu o partido. A direção agradeceu; nas redes, alguns eleitores cobraram coerência.";
    }
    if (choice === "contra") {
      fx.visibility(2);
      fx.reputation(1.5);
      fx.standing(-8);
      const n = fx.bump("rebeldia");
      if (n >= 2) fx.schedule("ameaca_expulsao", [10, 30], { axis: ax, party: party.id });
      return n >= 2 ? "Você votou contra de novo. Desta vez, a direção não deixou passar: fala-se em processo de ética." : "Seu discurso contra a orientação viralizou entre seus eleitores. Na direção, o clima azedou.";
    }
    fx.standing(-2);
    return "Você não apareceu. A ausência foi notada, mas não virou caso.";
  },
  fallback: "ausente",
};

const ameaca_expulsao: EventDef = {
  id: "ameaca_expulsao",
  kind: "DECISAO",
  tags: ["PARTIDO"],
  chained: true,
  milestone: true,
  expires: 5,
  when: (c, d) => (c.p.party_id && (!d?.party || c.p.party_id === String(d.party)) ? { ...(d ?? {}), party: c.p.party_id } : null),
  valid: (c, b) => c.p.party_id === String(b.party),
  render: (c) => {
    const party = c.party!;
    const allies = partyPeople(c.ctx, c.p, party).filter((x) => relWith(c, x.id) >= 30).length;
    return {
      title: "Processo de ética no partido",
      who: partyLeader(c.ctx, c.p, party),
      text: `O conselho de ética do ${party.acronym} abriu processo contra você por indisciplina. A pena pode ir de advertência à expulsão. Você tem ${allies} aliado(s) com voz dentro do partido.${infidelityRisk(c.ctx, c.p) ? " Atenção: sair por vontade própria agora, fora da janela partidária, custa o seu mandato." : ""}`,
      choices: [
        { id: "recuar", label: "Pedir desculpas e recuar", hint: "Salva a filiação; custa imagem", tone: "safe" },
        { id: "aliados", label: "Mobilizar seus aliados internos", hint: "Depende de quem está do seu lado", tone: "bold", cost: { energy: 15 } },
        { id: "sair", label: "Sair antes de ser expulso(a)", hint: infidelityRisk(c.ctx, c.p) ? "Você perde o mandato" : "Fica sem partido", tone: "risky" },
      ],
    };
  },
  resolve: (c, _b, choice, fx) => {
    const party = c.party!;
    fx.unflag("rebeldia");
    if (choice === "recuar") {
      fx.reputation(-2);
      fx.standing(5);
      return "Você leu uma nota de desculpas na reunião. O processo foi arquivado; sua base ficou decepcionada.";
    }
    if (choice === "aliados") {
      fx.energy(-15);
      const allies = partyPeople(c.ctx, c.p, party).filter((x) => relWith(c, x.id) >= 30).length;
      if (c.roll(0.25 + allies * 0.12 + c.st.party_standing / 200)) {
        fx.standing(2);
        fx.reputation(1);
        return "Seus aliados seguraram o processo: advertência e vida que segue. Você mostrou que tem grupo.";
      }
      leaveParty(c.ctx, c.p, "expulsão por indisciplina");
      fx.reputation(1);
      fx.flag(`expulso:${party.id}`, c.date);
      return `Expulsão aprovada por maioria. Você está sem partido — mas, expulso(a), mantém o que tinha de mandato.`;
    }
    const loses = infidelityRisk(c.ctx, c.p);
    leaveParty(c.ctx, c.p, "saída antes de processo de ética");
    if (loses) loseMandateForInfidelity(c.ctx, c.p);
    return loses ? "Você saiu do partido — e, fora da janela, perdeu o mandato por infidelidade partidária." : `Você deixou o ${party.acronym} antes do julgamento.`;
  },
  fallback: "recuar",
};

const convite_outro_partido: EventDef = {
  id: "convite_outro_partido",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  cooldown: 300,
  expires: 7,
  when: (c) => {
    const mine = c.party;
    if (!mine || c.cand) return null;
    // ninguém corteja quem acabou de chegar ao partido
    if (!c.st.filiation_date || diffDays(c.date, c.st.filiation_date) < 180) return null;
    if (c.p.reputation < 42 && !c.p.office_code && c.p.visibility < 18 && !c.flag("aberto_a_convites")) return null;
    const myAff = c.affinity(mine);
    const other = partiesNear(c, { exclude: mine.id, min: 0.03 }).find((x) => c.affinity(x) >= myAff - 0.06);
    if (!other) return null;
    return { party: other.id, leader: partyLeader(c.ctx, c.p, other).id, mine: mine.id };
  },
  valid: (c, b) => c.p.party_id === String(b.mine) && !c.cand,
  weightFn: (c) => (c.flag("aberto_a_convites") ? 2.5 : c.st.party_standing < 25 ? 1.4 : 0.7),
  render: (c, b) => {
    const other = partyOf(c, b.party)!;
    const mine = c.party!;
    const leader = actor(c, b.leader);
    const risk = infidelityRisk(c.ctx, c.p);
    const nextOffice = c.p.office_code === "VEREADOR" ? "deputado(a) estadual" : c.p.office_code ? "um cargo maior" : "vereador(a)";
    return {
      title: `O ${other.acronym} quer você`,
      who: leader,
      text: `${leader?.name ?? "A direção"} faz a proposta sem rodeios: legenda garantida para ${nextOffice}, estrutura de campanha e espaço na direção, se você trocar o ${mine.acronym} pelo ${other.acronym}. Trocar de partido tem preço: quem fica chama de traição, a imprensa chama de troca-troca, e no novo partido você recomeça do zero.${risk ? " E, fora da janela partidária, a troca custa o seu mandato." : ""}`,
      choices: [
        { id: "trocar", label: `Aceitar e ir para o ${other.acronym}`, hint: risk ? "Você perde o mandato (infidelidade)" : "Recomeça com padrinho forte", tone: "risky" },
        { id: "negociar", label: `Usar a proposta para negociar espaço no ${mine.acronym}`, hint: "Pode render prestígio — ou ser visto como chantagem", tone: "bold" },
        { id: "lealdade", label: "Recusar e reafirmar lealdade", tone: "safe" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const other = partyOf(c, b.party)!;
    const mine = c.party!;
    const leader = actor(c, b.leader);
    const oldLeader = partyLeader(c.ctx, c.p, mine);
    fx.unflag("aberto_a_convites");
    if (choice === "trocar") {
      const loses = infidelityRisk(c.ctx, c.p);
      fx.rel(oldLeader.id, -15);
      leaveParty(c.ctx, c.p, `troca para o ${other.acronym}`);
      if (loses) loseMandateForInfidelity(c.ctx, c.p);
      joinParty(c.ctx, c.p, other);
      fx.standing(14);
      if (leader) fx.rel(leader.id, 12);
      if (leader) fx.flag(`padrinho:${other.id}`, leader.id);
      fx.reputation(-2);
      fx.bump("trocas_de_partido");
      return loses
        ? `Você trocou o ${mine.acronym} pelo ${other.acronym} e perdeu o mandato por infidelidade partidária. Recomeço total.`
        : `Ficha nova no ${other.acronym}. No ${mine.acronym}, seu nome virou sinônimo de ingratidão.`;
    }
    if (choice === "negociar") {
      if (c.roll(0.35 + c.charisma * 0.3 + c.st.party_standing / 200)) {
        fx.standing(10);
        fx.rel(oldLeader.id, 3);
        return `Bastou deixar vazar o convite do ${other.acronym}: a direção do ${mine.acronym} ofereceu mais espaço para você ficar.`;
      }
      fx.standing(-6);
      fx.rel(oldLeader.id, -8);
      return `A direção do ${mine.acronym} pagou para ver: "Se quer ir, vai." Você ficou — menor do que era.`;
    }
    fx.standing(4);
    fx.rel(oldLeader.id, 5);
    if (leader) fx.rel(leader.id, -2);
    return `Você recusou. A notícia correu no ${mine.acronym}, e sua lealdade foi lembrada na reunião seguinte.`;
  },
  fallback: "lealdade",
};

// ---------------------------------------------------------------- disputa pela vaga
const vaga_chapa: EventDef = {
  id: "vaga_chapa",
  kind: "DECISAO",
  tags: ["PARTIDO", "ELEICAO"],
  cooldown: 60,
  max: 6,
  expires: 5,
  when: (c) => {
    const cand = c.cand;
    const e = c.election;
    if (!cand || cand.status !== "PRE" || !e || !c.proportional || c.st.party_standing >= 22) return null;
    if (c.date > e.calendar.conventionEnd || diffDays(e.calendar.conventionEnd, c.date) > 75) return null;
    return { cand: cand.id, party: c.p.party_id! };
  },
  valid: (c, b) => c.p.party_id === String(b.party) && c.ctx.t.candidacies.get(String(b.cand))?.status === "PRE",
  weight: 2,
  render: (c, b) => {
    const cand = c.ctx.t.candidacies.get(String(b.cand))!;
    const party = c.party!;
    const leader = partyLeader(c.ctx, c.p, party);
    return {
      title: "Lista de espera na chapa",
      who: leader,
      text: `A chapa de ${OFFICES[cand.office_code].name.toLowerCase()} do ${party.acronym} em ${geoName(cand.geo, c.ctx.s)} está quase fechada, e seu nome está na lista de espera. ${leader.name} explica: "Tem gente com mais tempo de casa." Seu prestígio interno é ${Math.round(c.st.party_standing)}; a convenção costuma exigir 20.`,
      choices: [
        { id: "dirigente", label: `Pedir o apoio de ${first(leader)}`, hint: "Depende da relação de vocês", tone: "bold", cost: { energy: 8 } },
        { id: "contribuir", label: "Contribuir com o caixa do partido", hint: "Abre portas — e cria expectativa", tone: "neutral", cost: { money: c.money(3000) } },
        { id: "trabalhar", label: "Trabalho dobrado até a convenção", hint: "Desgastante, mas respeitado", tone: "safe", cost: { energy: 30 } },
        { id: "esperar", label: "Esperar a decisão", tone: "neutral" },
      ],
    };
  },
  resolve: (c, _b, choice, fx) => {
    const party = c.party!;
    const leader = partyLeader(c.ctx, c.p, party);
    if (choice === "dirigente") {
      fx.energy(-8);
      const r = relWith(c, leader.id);
      if (c.roll(0.2 + r / 80 + c.charisma * 0.2)) {
        fx.standing(10);
        fx.rel(leader.id, 3);
        return `${first(leader)} prometeu "dar um jeito". No dia seguinte, seu nome subiu na lista.`;
      }
      fx.standing(2);
      return `${first(leader)} ouviu, anotou e não prometeu nada.`;
    }
    if (choice === "contribuir") {
      const v = c.money(3000);
      fx.money(-v, `Contribuição ao ${party.acronym}`, "CONTRIBUICAO_PARTIDO");
      party.cash += v;
      c.ctx.save("parties", party);
      fx.standing(8);
      return "A contribuição chegou na hora certa: o diretório estava com as contas no vermelho.";
    }
    if (choice === "trabalhar") {
      fx.energy(-30);
      fx.standing(6);
      fx.activism(3);
      return "Você virou presença obrigatória em toda reunião, panfletagem e plenária. Ninguém mais pergunta quem você é.";
    }
    return "Você esperou. A decisão vai ser da convenção.";
  },
  fallback: "esperar",
};

const legenda_disputada: EventDef = {
  id: "legenda_disputada",
  kind: "DECISAO",
  tags: ["PARTIDO", "ELEICAO"],
  cooldown: 400,
  expires: 5,
  when: (c) => {
    const cand = c.cand;
    const e = c.election;
    if (!cand || cand.status !== "PRE" || !e || c.proportional || c.date > e.calendar.conventionEnd) return null;
    const rival = partyPeople(c.ctx, c.p, c.party!).filter((x) => x.reputation >= 40 && x.id !== c.p.id)[0];
    if (!rival) return null;
    return { cand: cand.id, rival: rival.id, party: c.p.party_id! };
  },
  valid: (c, b) => c.p.party_id === String(b.party) && c.ctx.t.candidacies.get(String(b.cand))?.status === "PRE",
  weight: 2,
  render: (c, b) => {
    const cand = c.ctx.t.candidacies.get(String(b.cand))!;
    const rival = actor(c, b.rival)!;
    return {
      title: "Disputa pela legenda",
      who: rival,
      text: `${rival.name} também quer ser o nome do ${c.party!.acronym} para ${OFFICES[cand.office_code].name.toLowerCase()} em ${geoName(cand.geo, c.ctx.s)}. Tem mais tempo de partido e reputação de ${Math.round(rival.reputation)}. A convenção decide — e convenção se ganha antes do dia.`,
      choices: [
        { id: "direcao", label: "Buscar o apoio da direção", hint: "Prestígio interno decide", tone: "safe", cost: { energy: 15 } },
        { id: "previas", label: "Propor prévias abertas aos filiados", hint: "Tudo ou nada", tone: "risky", cost: { energy: 20 } },
        { id: "acordo", label: `Fazer acordo: apoiar ${first(rival)} agora, em troca da vez depois`, hint: "Você retira a pré-candidatura", tone: "neutral" },
        { id: "convencao", label: "Confiar na convenção", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const rival = actor(c, b.rival)!;
    const cand = c.ctx.t.candidacies.get(String(b.cand))!;
    if (choice === "direcao") {
      fx.energy(-15);
      fx.standing(c.roll(0.4 + c.charisma * 0.3) ? 9 : 3);
      fx.rel(rival.id, -5);
      return "Você passou a semana em reuniões fechadas. Alguns votos da convenção mudaram de lado.";
    }
    if (choice === "previas") {
      fx.energy(-20);
      const p = 0.35 + (c.p.reputation - rival.reputation) / 100 + (c.st.party_standing - 40) / 150 + c.charisma * 0.15;
      if (c.roll(p)) {
        fx.standing(14);
        fx.rel(rival.id, -10);
        fx.visibility(3);
        return `Você venceu as prévias com folga. ${rival.name} reconheceu a derrota — com um sorriso amarelo.`;
      }
      cand.status = "DESISTENTE";
      cand.note = `Derrotado(a) nas prévias por ${rival.name}.`;
      c.ctx.save("candidacies", cand);
      fx.stage("QUADRO");
      fx.standing(-5);
      return `As prévias foram de ${rival.name}. Sua pré-candidatura acabou ali.`;
    }
    if (choice === "acordo") {
      cand.status = "DESISTENTE";
      cand.note = `Retirada em acordo com ${rival.name}.`;
      c.ctx.save("candidacies", cand);
      fx.stage("QUADRO");
      fx.standing(8);
      fx.rel(rival.id, 18);
      fx.flag(`acordo:${rival.id}`, c.date);
      return `Acordo selado num almoço: você apoia ${first(rival)} agora e ganha o compromisso público de apoio na próxima. Política é paciência — e memória.`;
    }
    return "Você deixou para a convenção decidir.";
  },
  fallback: "convencao",
};

const convencao_resultado: EventDef = {
  id: "convencao_resultado",
  kind: "DECISAO",
  tags: ["ELEICAO", "PARTIDO"],
  chained: true,
  milestone: true,
  expires: 4,
  when: (c, d) => {
    const cand = d ? c.ctx.t.candidacies.get(String(d.cand)) : undefined;
    return cand ? { cand: cand.id, status: cand.status } : null;
  },
  render: (c, b) => {
    const cand = c.ctx.t.candidacies.get(String(b.cand))!;
    const office = OFFICES[cand.office_code].name.toLowerCase();
    const place = geoName(cand.geo, c.ctx.s);
    const party = c.ctx.t.parties.get(cand.party_id);
    if (b.status === "HOMOLOGADA") {
      return {
        title: "Seu nome está na urna",
        text: `A convenção do ${party?.acronym} confirmou: você é candidato(a) a ${office} em ${place}, com o número ${cand.ballot_number}. ${cand.campaign.fefc ? `O partido repassou ${brl(cand.campaign.fefc)} do fundo eleitoral.` : "O partido não vai repassar dinheiro do fundo para você — a campanha vai depender de doações e do seu bolso."} A campanha oficial começa em poucos dias. Como você quer largar?`,
        choices: [
          { id: "lancamento", label: "Lançamento com família, amigos e apoiadores", hint: "Voluntários e ânimo", tone: "safe", cost: { money: c.money(1500) } },
          { id: "rua", label: "Começar já na rua, de porta em porta", hint: "Cansativo e eficaz", tone: "bold", cost: { energy: 25 } },
          { id: "equipe", label: "Contratar coordenação profissional", hint: "Campanha organizada desde o primeiro dia", tone: "neutral", cost: { money: c.money(8000) } },
        ],
      };
    }
    return {
      title: "Fora da urna",
      text: `${cand.note ?? "A convenção não incluiu seu nome."} Você não será candidato(a) a ${office} em ${place} nesta eleição.`,
      choices: [
        { id: "apoiar", label: "Aceitar e trabalhar pela chapa", hint: "Prestígio para a próxima", tone: "safe" },
        { id: "reclamar", label: "Reclamar publicamente", hint: "Visibilidade; atrito com a direção", tone: "risky" },
        { id: "repensar", label: "Começar a pensar em outro partido", hint: "Você fica mais aberto(a) a convites", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    if (b.status === "HOMOLOGADA") {
      if (choice === "lancamento") {
        fx.money(-c.money(1500), "Evento de lançamento da candidatura");
        fx.volunteers(25);
        fx.momentum(0.03, "lançamento da candidatura");
        return "Salão cheio, bolo, discurso emocionado. Vinte e cinco pessoas saíram com camiseta e vontade de trabalhar.";
      }
      if (choice === "rua") {
        fx.energy(-25);
        fx.reach(0.01);
        fx.volunteers(8);
        return "Você bateu em duzentas portas na primeira semana. Ouviu muito \"não\" — e alguns \"pode contar comigo\".";
      }
      fx.campaignSpend(c.money(8000), "Coordenação de campanha", "equipe");
      fx.momentum(0.04, "coordenação profissional");
      const cand = c.ctx.t.candidacies.get(String(b.cand))!;
      cand.campaign.team.coordenacao = (cand.campaign.team.coordenacao ?? 0) + 1;
      return "Agenda, planilha, metas por bairro. A campanha tem cara de campanha.";
    }
    const leader = c.party ? partyLeader(c.ctx, c.p, c.party) : undefined;
    if (choice === "apoiar") {
      fx.standing(6);
      if (leader) fx.rel(leader.id, 5);
      return "Você vestiu a camisa da chapa. A direção anotou: na próxima, seu nome vem antes.";
    }
    if (choice === "reclamar") {
      fx.visibility(3);
      fx.standing(-8);
      if (leader) fx.rel(leader.id, -10);
      return "Sua entrevista acusando \"os caciques\" rendeu manchete — e um gelo na próxima reunião.";
    }
    fx.flag("aberto_a_convites", c.date);
    return "Você começou a ouvir propostas. Em política, a notícia de que alguém está \"disponível\" corre rápido.";
  },
  fallback: "apoiar",
};

export const PARTY_EVENTS: EventDef[] = [
  dirigente_interessado,
  convite_formal,
  convite_filiacao,
  filiacao_analise,
  filiacao_aprovada,
  filiacao_recusada,
  padrinho_cobra,
  tarefa_partido,
  disputa_diretorio,
  diretorio_resultado,
  cargo_partidario_oferta,
  orientacao_partido,
  ameaca_expulsao,
  convite_outro_partido,
  vaga_chapa,
  legenda_disputada,
  convencao_resultado,
];
