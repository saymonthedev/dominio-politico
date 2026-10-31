import { diffDays } from "../../calendar";
import { homeCityOf } from "../../housing";
import { isPresident, partyMembersInScope, partyOfficersInScope, partyPostOf, postRank, setPartyPost } from "../../partypost";
import type { PersonRow } from "../../types";
import type { StoryCtx } from "../context";
import type { EventDef } from "../def";
import type { Effects } from "../effects";
import { canAct, findFigure } from "../world";
import { ev } from "./cotidiano";
import { actor, brl, city, partiesNear } from "./util";

/**
 * Quem manda no partido: disputas pelos diretórios estadual e nacional, reações de
 * quem foi afastado, conselho de ética, filiados querendo sair, pedidos de legenda,
 * tesoureiro com a mão no caixa, rebelião interna, a executiva impondo nomes e a
 * prestação de contas na Justiça Eleitoral.
 */

const post = (c: StoryCtx) => partyPostOf(c.ctx.s, c.p, c.st);
const presidente = (c: StoryCtx) => isPresident(post(c)?.level);
const acr = (c: StoryCtx) => c.party?.acronym ?? "partido";

/** Sai do partido (expulsão ou saída negociada): filiação encerrada, sem legenda. */
function removeFromParty(c: StoryCtx, who: PersonRow): void {
  for (const m of c.ctx.t.memberships.values()) {
    if (m.person_id === who.id && m.status === "ATIVA") {
      m.status = "ENCERRADA";
      m.left_on = c.date;
      c.ctx.save("memberships", m);
    }
  }
  who.party_id = null;
  who.faction_id = null;
  c.ctx.save("persons", who);
  const st = c.ctx.pstate(who.id);
  if (st) {
    st.party_standing = 0;
    c.ctx.save("person_states", st);
  }
}

/** Filiado fictício com mandato no alcance do cargo (quem pode querer sair ou pedir legenda). */
function memberWithOffice(c: StoryCtx): PersonRow | undefined {
  const level = post(c)?.level;
  if (!level) return undefined;
  const list = partyMembersInScope(c.ctx.s, c.p, level === "SECRETARIO" ? "PRES_MUNICIPAL" : level).filter((x) => canAct(x));
  const withOffice = list.filter((x) => x.office_code);
  return withOffice.length ? c.rng.pick(withOffice) : list.length ? c.rng.pick(list) : undefined;
}

// ------------------------------------------------------------------ subir na direção

const disputa_estadual: EventDef = {
  id: "disputa_estadual",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  family: "disputa_partido",
  cooldown: 500,
  max: 2,
  expires: 6,
  when: (c) => (post(c)?.level === "PRES_MUNICIPAL" && c.st.party_standing >= 60 && c.p.reputation >= 35 && !c.phase ? { party: c.p.party_id! } : null),
  valid: (c, b) => c.p.party_id === String(b.party),
  render: (c) => ({
    title: `Eleição do diretório estadual do ${acr(c)}`,
    text: `O mandato da direção estadual do ${acr(c)} em ${c.p.uf} acaba. Presidentes de diretórios do interior sondam você: "Quem arruma a casa na cidade pode arrumar no estado." A chapa da situação quer seu apoio — ou sua cabeça.`,
    choices: [
      { id: "eu", label: "Lançar sua chapa para presidir o estado", hint: "Prestígio alto ajuda; perder custa caro", tone: "risky" as const, cost: { energy: 15 } },
      { id: "apoiar", label: "Apoiar a chapa da situação em troca de espaço", hint: "Prestígio e aliados", tone: "safe" as const },
      { id: "fora", label: "Ficar de fora", tone: "neutral" as const },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "eu") {
      fx.schedule("estadual_resultado", [20, 40], { party: c.p.party_id ?? "" });
      return "Chapa registrada. Os próximos dias são de telefonema, viagem pelo interior e promessa de cargo.";
    }
    if (choice === "apoiar") {
      fx.standing(5);
      fx.capital(2);
      return "Você subiu no palanque da situação. Em troca, ganhou a vice-presidência de honra e a gratidão de quem manda.";
    }
    return "Você ficou de fora. A disputa foi quente, sem você no meio.";
  },
  fallback: "fora",
};

const estadual_resultado = ev({
  id: "estadual_resultado",
  kind: "INFO",
  tags: ["PARTIDO"],
  chained: true,
  blocking: true,
  milestone: true,
  when: (c, d) => (d && c.p.party_id === String(d.party) ? d : null),
  title: (c) => `Resultado no diretório estadual do ${acr(c)}`,
  text: () => "Os votos dos delegados foram contados.",
  opts: [
    { id: "ok", label: "Continuar", run: (c, _b, fx) => {
      const p = 0.2 + (c.st.party_standing - 60) / 80 + c.p.reputation / 250 + c.charisma * 0.15;
      if (c.roll(p)) {
        setPartyPost(c.ctx, c.p, c.st, "PRES_ESTADUAL");
        fx.standing(10);
        fx.capital(6);
        fx.news(`${c.p.name} vence e vai presidir o ${acr(c)} em ${c.p.uf}`, `A nova direção estadual do ${acr(c)} toma posse com promessa de renovação.`);
        return `Vitória! Você agora preside o ${acr(c)} no estado. Nomear, afastar, indicar candidatos e negociar alianças passam pela sua mesa.`;
      }
      fx.standing(-6);
      return "Derrota apertada. A situação manteve o estado — e anotou quem estava do outro lado.";
    } },
  ],
  fallback: "ok",
});

const disputa_nacional: EventDef = {
  id: "disputa_nacional",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  family: "disputa_partido",
  cooldown: 700,
  max: 1,
  expires: 6,
  when: (c) => (post(c)?.level === "PRES_ESTADUAL" && c.st.party_standing >= 75 && c.p.reputation >= 50 && !c.phase ? { party: c.p.party_id! } : null),
  valid: (c, b) => c.p.party_id === String(b.party),
  render: (c) => ({
    title: `Convenção nacional do ${acr(c)}`,
    text: `A presidência nacional do ${acr(c)} está em disputa. Seu nome aparece nas conversas de Brasília: estado arrumado, prestígio alto, gente devendo favor.`,
    choices: [
      { id: "eu", label: "Disputar a presidência nacional", hint: "O topo do partido", tone: "risky" as const, cost: { energy: 20 } },
      { id: "vice", label: "Negociar a vice e a tesouraria", hint: "Poder sem o desgaste", tone: "safe" as const },
      { id: "fora", label: "Seguir cuidando do estado", tone: "neutral" as const },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "eu") {
      fx.schedule("nacional_resultado", [20, 40], { party: c.p.party_id ?? "" });
      return "Candidatura lançada. Agora é voo, jantar e telefone para delegados do país inteiro.";
    }
    if (choice === "vice") {
      fx.standing(6);
      fx.capital(4);
      return "Você ficou com a vice nacional. Não é o topo, mas a caneta da tesouraria passa por perto.";
    }
    return "Você preferiu o estado. Em Brasília, notaram a prudência.";
  },
  fallback: "fora",
};

const nacional_resultado = ev({
  id: "nacional_resultado",
  kind: "INFO",
  tags: ["PARTIDO"],
  chained: true,
  blocking: true,
  milestone: true,
  when: (c, d) => (d && c.p.party_id === String(d.party) ? d : null),
  title: (c) => `Resultado da convenção nacional do ${acr(c)}`,
  text: () => "Os delegados votaram.",
  opts: [
    { id: "ok", label: "Continuar", run: (c, _b, fx) => {
      const p = 0.15 + (c.st.party_standing - 75) / 70 + c.p.reputation / 300 + c.charisma * 0.15;
      if (c.roll(p)) {
        setPartyPost(c.ctx, c.p, c.st, "PRES_NACIONAL");
        fx.standing(10);
        fx.capital(10);
        fx.visibility(4);
        fx.news(`${c.p.name} é eleito(a) presidente nacional do ${acr(c)}`, `Com a vitória na convenção, ${c.p.name} passa a comandar a legenda no país.`);
        return `Você é presidente nacional do ${acr(c)}. A bancada federal espera sua orientação nas votações.`;
      }
      fx.standing(-8);
      return "Os grandes caciques fecharam com o outro lado. Você volta para o estado, menor do que saiu.";
    } },
  ],
  fallback: "ok",
});

// ------------------------------------------------------------------ consequências das decisões

const afastado_reage = ev({
  id: "afastado_reage",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  chained: true,
  expires: 5,
  when: (c, d) => (d && actor(c, d.who) && c.p.party_id ? d : null),
  who: (c, b) => actor(c, b.who),
  title: (c, b) => `${actor(c, b.who)!.name} não engoliu o afastamento`,
  text: (c, b) => `${actor(c, b.who)!.name} foi aos grupos do partido dizer que foi "perseguido(a) por discordar" e está juntando assinaturas contra você.`,
  opts: [
    { id: "conversar", label: "Chamar para conversar e oferecer outro papel", hint: "Apaga o incêndio", tone: "safe", cost: () => ({ energy: 8 }), run: (c, b, fx) => {
      fx.rel(String(b.who), 12);
      return c.roll(0.6) ? "Café, conversa franca e a coordenação de um núcleo. A crise esfriou." : "Ele ouviu, mas saiu dizendo que \"não se vende\". A crise segue, menor.";
    } },
    { id: "responder", label: "Responder publicamente com os motivos", hint: "Firmeza; o barulho cresce", tone: "bold", run: (_c, b, fx) => {
      fx.standing(2);
      fx.rel(String(b.who), -10);
      fx.visibility(1);
      return "Você expôs os motivos. A maioria ficou do seu lado; uma minoria barulhenta, não.";
    } },
    { id: "ignorar", label: "Ignorar", tone: "neutral", run: (c, _b, fx) => {
      if (c.roll(0.4)) {
        fx.standing(-4);
        return "O abaixo-assinado chegou a um terço do diretório. Agora você vai ter que negociar.";
      }
      return "Sem resposta, a reclamação perdeu fôlego em uma semana.";
    } },
  ],
  fallback: "ignorar",
});

const ciumes_nomeacao = ev({
  id: "ciumes_nomeacao",
  kind: "DECISAO",
  tags: ["PARTIDO"],
  chained: true,
  expires: 5,
  when: (c, d) => (d && actor(c, d.who) && c.p.party_id ? d : null),
  title: () => "Ciúme na executiva",
  text: (c, b) => `A nomeação de ${actor(c, b.who)!.name} deixou dois antigos dirigentes enciumados: "Trabalhamos há dez anos e quem chega agora leva o cargo?"`,
  opts: [
    { id: "explicar", label: "Reunir os três e explicar os critérios", tone: "safe", cost: () => ({ energy: 8 }), run: (_c, _b, fx) => {
      fx.standing(1);
      return "Critérios na mesa, todo mundo ouvido. O mal-estar diminuiu.";
    } },
    { id: "compensar", label: "Dar uma coordenação para cada um", hint: "Paz; a executiva incha", tone: "neutral", run: (_c, _b, fx) => {
      fx.standing(2);
      fx.capital(-2);
      return "Duas coordenações novas. Paz comprada — por enquanto.";
    } },
    { id: "ignorar", label: "Ignorar o ciúme", tone: "risky", run: (_c, _b, fx) => {
      fx.standing(-2);
      return "Eles se afastaram das reuniões. A máquina ficou mais lenta.";
    } },
  ],
  fallback: "explicar",
});

const conselho_etica = ev({
  id: "conselho_etica",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  chained: true,
  blocking: true,
  expires: 5,
  when: (c, d) => {
    const who = d ? actor(c, d.who) : undefined;
    if (!who || who.party_id !== c.p.party_id) return null;
    const proof = [...c.ctx.t.illicit_acts.values()].some((a) => a.person_id === who.id && a.discovered) || [...c.ctx.t.investigations.values()].some((i) => i.person_id === who.id && !i.outcome);
    return { who: who.id, proof: proof ? 1 : 0 };
  },
  who: (c, b) => actor(c, b.who),
  title: (c, b) => `Conselho de ética: o caso de ${actor(c, b.who)!.name}`,
  text: (c, b) => `O conselho de ética do ${acr(c)} vai decidir sobre a expulsão de ${actor(c, b.who)!.name}. ${Number(b.proof) ? "Há denúncias e investigação aberta: os conselheiros tendem a seguir você." : "Não há prova de conduta irregular — só divergência política. Os conselheiros estão desconfortáveis."}`,
  opts: [
    { id: "expulsar", label: "Pedir a expulsão", hint: "Com prova, limpa o partido; sem prova, parece perseguição", tone: "bold", run: (c, b, fx) => {
      const who = actor(c, b.who)!;
      const ok = c.roll(Number(b.proof) ? 0.85 : 0.35);
      c.s.flags[`expulsao:${who.id}`] = false;
      if (ok) {
        removeFromParty(c, who);
        fx.standing(Number(b.proof) ? 4 : -2);
        if (!Number(b.proof)) fx.reputation(-1);
        fx.news(`${acr(c)} expulsa ${who.name}`, `O conselho de ética aprovou a expulsão por ${Number(b.proof) ? "conduta incompatível com o estatuto" : "infidelidade às decisões partidárias"}.`);
        return `${who.name} foi expulso(a) do ${acr(c)}. ${Number(b.proof) ? "A decisão foi elogiada." : "Parte do partido viu perseguição."}`;
      }
      fx.standing(-5);
      fx.rel(who.id, -10);
      return "O conselho rejeitou a expulsão. Uma derrota sua dentro de casa.";
    } },
    { id: "negociar", label: "Negociar uma saída voluntária", hint: "Menos barulho", tone: "safe", cost: () => ({ energy: 8 }), run: (c, b, fx) => {
      const who = actor(c, b.who)!;
      c.s.flags[`expulsao:${who.id}`] = false;
      if (c.roll(0.6)) {
        removeFromParty(c, who);
        return `${who.name} pediu desfiliação \"por motivos pessoais\". Ninguém perdeu a pose.`;
      }
      fx.standing(-2);
      return "Não houve acordo: o processo foi arquivado e a pessoa ficou — mais fortalecida.";
    } },
    { id: "arquivar", label: "Arquivar o processo", tone: "neutral", run: (c, b, fx) => {
      c.s.flags[`expulsao:${String(b.who)}`] = false;
      fx.standing(-3);
      fx.rel(String(b.who), 6);
      return "Processo arquivado. Você evitou a briga, mas pareceu fraco(a).";
    } },
  ],
  fallback: "arquivar",
});

// ------------------------------------------------------------------ a rotina de quem preside

const filiado_quer_sair = ev({
  id: "filiado_quer_sair",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  family: "comando_crise",
  cooldown: 200,
  max: 3,
  expires: 6,
  when: (c) => {
    if (!presidente(c)) return null;
    const who = memberWithOffice(c);
    return who ? { who: who.id } : null;
  },
  who: (c, b) => actor(c, b.who),
  title: (c, b) => `${actor(c, b.who)!.name} quer deixar o ${acr(c)}`,
  text: (c, b) => {
    const who = actor(c, b.who)!;
    return `${who.name}${who.office_code ? ", que tem mandato," : ""} avisou que recebeu convite de outra legenda e está "avaliando". Na prática, é um pedido: quer espaço — ou vai embora levando votos.`;
  },
  opts: [
    { id: "cargo", label: "Oferecer um cargo na executiva", hint: "Segura; incha a direção", tone: "safe", run: (c, b, fx) => {
      const who = actor(c, b.who)!;
      const m = [...c.ctx.t.memberships.values()].find((x) => x.person_id === who.id && x.status === "ATIVA");
      if (m && m.role === "MEMBRO") {
        m.role = "DIRIGENTE";
        c.ctx.save("memberships", m);
      }
      fx.rel(who.id, 10);
      return c.roll(0.75) ? `${who.name} ficou, com cargo novo e discurso de lealdade.` : `${who.name} aceitou o cargo e, três meses depois, saiu mesmo assim.`;
    } },
    { id: "liberar", label: "Liberar sem briga", tone: "neutral", run: (c, b, fx) => {
      const who = actor(c, b.who)!;
      const other = partiesNear(c, { exclude: c.p.party_id })[0];
      removeFromParty(c, who);
      if (other) {
        who.party_id = other.id;
        c.ctx.save("persons", who);
      }
      fx.standing(-1);
      return `${who.name} saiu${other ? ` para o ${other.acronym}` : ""}, agradecendo a convivência. O partido ficou menor.`;
    } },
    { id: "ameacar", label: "Ameaçar pedir o mandato na Justiça (infidelidade)", hint: "Funciona às vezes; cria inimigo", tone: "risky", run: (c, b, fx) => {
      fx.rel(String(b.who), -20);
      if (c.roll(0.55)) {
        fx.standing(2);
        return "A ameaça funcionou: o mandato pertence ao partido e a pessoa ficou — contrariada.";
      }
      fx.standing(-3);
      return "Pagou para ver e saiu assim mesmo, alegando perseguição. A briga foi parar no TRE.";
    } },
  ],
  fallback: "liberar",
});

const pedido_legenda = ev({
  id: "pedido_legenda",
  kind: "DECISAO",
  tags: ["PARTIDO", "ELEICAO"],
  family: "comando_eleicao",
  cooldown: 300,
  max: 3,
  expires: 7,
  when: (c) => {
    if (!presidente(c)) return null;
    const next = [...c.ctx.t.elections.values()].filter((e) => e.status !== "ENCERRADA").sort((a, b) => a.year - b.year)[0];
    if (!next || diffDays(next.first_round, c.date) > 540) return null;
    const who = memberWithOffice(c);
    return who ? { who: who.id } : null;
  },
  who: (c, b) => actor(c, b.who),
  title: (c, b) => `${actor(c, b.who)!.name} quer ser o nome do partido`,
  text: (c, b) => `${actor(c, b.who)!.name} pede a legenda do ${acr(c)} para a próxima eleição majoritária: "Tenho base, tenho votos, só preciso do partido."`,
  opts: [
    { id: "indicar", label: "Indicar a pessoa como nome do partido", hint: "Ganha um aliado", tone: "safe", run: (c, b, fx) => {
      const p = post(c)!;
      const geo = p.level === "PRES_NACIONAL" ? "BR" : p.level === "PRES_ESTADUAL" ? c.p.uf : homeCityOf(c.p);
      fx.flag(`indicacao:${geo}`, String(b.who));
      fx.rel(String(b.who), 15);
      return "Indicação fechada. A convenção vai seguir sua palavra.";
    } },
    { id: "previas", label: "Propor prévias com outros nomes", hint: "Democrático; pode rachar", tone: "bold", run: (c, b, fx) => {
      fx.standing(2);
      fx.rel(String(b.who), -3);
      return c.roll(0.5) ? "As prévias animaram a militância e o vencedor saiu fortalecido." : "As prévias viraram briga de grupos de WhatsApp.";
    } },
    { id: "eu", label: "Dizer que o nome vai ser você", hint: "Você larga na frente na convenção", tone: "risky", run: (c, b, fx) => {
      const p = post(c)!;
      const geo = p.level === "PRES_NACIONAL" ? "BR" : p.level === "PRES_ESTADUAL" ? c.p.uf : homeCityOf(c.p);
      fx.flag(`indicacao:${geo}`, c.p.id);
      fx.rel(String(b.who), -15);
      return "Você avisou que o nome é seu. Registre a pré-candidatura quando a pré-campanha abrir.";
    } },
  ],
  fallback: "previas",
});

const tesoureiro_desvio = ev({
  id: "tesoureiro_desvio",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  family: "comando_crise",
  cooldown: 600,
  max: 1,
  expires: 5,
  when: (c) => (presidente(c) ? { valor: c.money(c.rng.pick([40_000, 80_000, 150_000])) } : null),
  who: (c) => findFigure(c.ctx, c.p, `tesoureiro:${c.p.party_id}`, `tesoureiro do ${acr(c)}`, { partyId: c.p.party_id, age: [40, 66], reputation: 40 }),
  title: () => "Rombo no caixa do diretório",
  text: (c, b) => `O contador encontrou: ${brl(Number(b.valor))} saíram do caixa do diretório para empresas que não existem. As assinaturas são do tesoureiro, ${findFigure(c.ctx, c.p, `tesoureiro:${c.p.party_id}`, `tesoureiro do ${acr(c)}`, { partyId: c.p.party_id, age: [40, 66], reputation: 40 }).name}.`,
  opts: [
    { id: "denunciar", label: "Afastar o tesoureiro e denunciar à polícia e ao TRE", hint: "Doloroso agora, limpo depois", tone: "safe", run: (c, _b, fx) => {
      fx.reputation(2);
      fx.standing(-2);
      const party = c.party!;
      party.reputation = Math.max(0, party.reputation - 2);
      c.ctx.save("parties", party);
      fx.news(`Presidente do ${acr(c)} denuncia desvio no próprio partido`, `${c.p.name} afastou o tesoureiro e levou o caso à polícia.`);
      return "Você mesmo(a) levou os documentos à delegacia. A manchete doeu, mas a sua imagem saiu maior.";
    } },
    { id: "auditoria", label: "Auditoria interna e afastamento discreto", tone: "neutral", cost: (c) => ({ money: c.money(6000) }), run: (_c, _b, fx) => {
      fx.standing(1);
      return "Auditoria feita, tesoureiro fora, dinheiro parcialmente devolvido. Ninguém fora do partido soube.";
    } },
    { id: "abafar", label: "Abafar e cobrir o rombo por fora", hint: "Obstrução: o rastro fica", tone: "illegal", run: (c, b, fx) => {
      fx.illicit("OBSTRUCAO_JUSTICA", { amount: Number(b.valor), description: `Rombo no caixa do ${acr(c)} encoberto`, witnesses: 3, paperTrail: 0.5 });
      fx.scandal(4);
      return "O buraco foi tapado e os papéis sumiram. Quem sabe, sabe.";
    } },
  ],
  fallback: "auditoria",
});

const prestacao_contas = ev({
  id: "prestacao_contas_partido",
  kind: "DECISAO",
  tags: ["PARTIDO"],
  family: "comando_rotina",
  cooldown: 300,
  max: 6,
  expires: 8,
  when: (c) => (presidente(c) && [3, 4].includes(Number(c.date.slice(5, 7))) ? {} : null),
  title: () => "Prestação de contas do diretório",
  text: () => "O prazo para entregar as contas do ano na Justiça Eleitoral termina em 30 de abril. Sem contas aprovadas, o diretório perde o fundo partidário.",
  opts: [
    { id: "contador", label: "Contratar um escritório de contabilidade", tone: "safe", cost: (c) => ({ money: c.money(3500) }), run: () => "Contas entregues no prazo, com notas e extratos em ordem." },
    { id: "militancia", label: "Montar a prestação com a militância", hint: "Barato; pode ter erro", tone: "neutral", cost: () => ({ energy: 15 }), run: (c, _b, fx) => {
      if (c.roll(0.7)) return "Uma semana de planilha e café. Entregue no prazo.";
      fx.standing(-3);
      return "Faltaram documentos. O TRE desaprovou as contas e suspendeu o repasse por alguns meses.";
    } },
    { id: "atrasar", label: "Deixar para depois", tone: "risky", run: (c, _b, fx) => {
      fx.standing(-4);
      const party = c.party!;
      party.cash = Math.max(0, party.cash - c.money(20_000));
      c.ctx.save("parties", party);
      return "Multa e suspensão do fundo no diretório. A executiva estadual ligou bufando.";
    } },
  ],
  fallback: "atrasar",
});

const rebeliao_interna = ev({
  id: "rebeliao_interna",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  family: "comando_crise",
  cooldown: 400,
  max: 2,
  expires: 5,
  when: (c) => (presidente(c) && c.st.party_standing < 80 && c.since("rebeliao_interna") > 400 ? {} : null),
  title: () => "Moção de desconfiança",
  text: (c) => `Um grupo da executiva protocolou uma moção pedindo sua saída da presidência: dizem que você "centraliza tudo" e "só pensa no próprio mandato". A votação é na próxima reunião.`,
  opts: [
    { id: "negociar", label: "Negociar cargos e espaço com o grupo", hint: "Paz com custo", tone: "safe", run: (_c, _b, fx) => {
      fx.capital(-5);
      fx.standing(3);
      return "Duas secretarias e a promessa de reuniões semanais. A moção foi retirada.";
    } },
    { id: "voto", label: "Enfrentar no voto", hint: "Vitória fortalece; derrota tira o cargo", tone: "risky", cost: () => ({ energy: 12 }), run: (c, _b, fx) => {
      if (c.roll(0.3 + c.st.party_standing / 120)) {
        fx.standing(8);
        return "A moção foi derrotada com folga. Seu comando saiu mais forte do que nunca.";
      }
      setPartyPost(c.ctx, c.p, c.st, "SECRETARIO", "relações institucionais");
      fx.standing(-10);
      return "Você perdeu a votação e a presidência. Ficou com uma secretaria de consolação.";
    } },
    { id: "renunciar", label: "Renunciar à presidência", tone: "neutral", run: (c, _b, fx) => {
      setPartyPost(c.ctx, c.p, c.st, null);
      fx.reputation(1);
      return "Você renunciou dizendo que \"o partido é maior que qualquer um\". Saiu com dignidade.";
    } },
  ],
  fallback: "negociar",
});

const executiva_impoe = ev({
  id: "executiva_impoe",
  kind: "DECISAO",
  tags: ["PARTIDO", "ELEICAO"],
  family: "comando_eleicao",
  cooldown: 500,
  max: 2,
  expires: 6,
  when: (c) => {
    if (post(c)?.level !== "PRES_MUNICIPAL") return null;
    const next = [...c.ctx.t.elections.values()].filter((e) => e.status !== "ENCERRADA" && e.kind === "MUNICIPAL").sort((a, b) => a.year - b.year)[0];
    if (!next || diffDays(next.first_round, c.date) > 400) return null;
    const ally = partiesNear(c, { exclude: c.p.party_id })[0];
    return ally ? { ally: ally.id } : null;
  },
  title: () => "A direção estadual quer mandar na sua cidade",
  text: (c, b) => `A executiva estadual do ${acr(c)} fechou acordo com o ${c.ctx.t.parties.get(String(b.ally))?.acronym}: em ${city(c)}, o partido não teria candidato próprio a prefeito e apoiaria o nome deles.`,
  opts: [
    { id: "aceitar", label: "Aceitar o acordo", hint: "Disciplina e espaço no estado", tone: "safe", run: (_c, _b, fx) => {
      fx.standing(5);
      return "Você engoliu o acordo. Em troca, a vice na chapa e prestígio com a direção estadual.";
    } },
    { id: "resistir", label: "Resistir e manter candidatura própria", hint: "Autonomia; atrito com o estado", tone: "bold", run: (c, _b, fx) => {
      fx.standing(-4);
      fx.activism(2);
      return c.roll(0.5) ? "A militância local fechou com você e a executiva recuou." : "A executiva ameaçou intervir no diretório. A queda de braço continua.";
    } },
    { id: "vice", label: "Negociar a vice e secretarias", hint: "Meio-termo", tone: "neutral", cost: () => ({ energy: 10 }), run: (_c, _b, fx) => {
      fx.standing(2);
      fx.capital(2);
      return "Acordo melhorado: vice na chapa e duas secretarias se ganharem.";
    } },
  ],
  fallback: "aceitar",
});

const filiacao_figura = ev({
  id: "filiacao_figura",
  kind: "OPORTUNIDADE",
  tags: ["PARTIDO", "COMUNIDADE"],
  family: "comando_rotina",
  cooldown: 240,
  max: 3,
  expires: 8,
  when: (c) => (post(c) ? { quem: c.rng.pick(["um radialista popular", "um pastor de igreja grande", "uma empresária conhecida", "um ex-jogador do time da cidade", "uma médica que atende de graça na periferia"]) } : null),
  title: (_c, b) => `${String(b.quem).replace(/^./, (x) => x.toUpperCase())} quer se filiar`,
  text: (c, b) => `${String(b.quem).replace(/^./, (x) => x.toUpperCase())} de ${city(c)} procurou o ${acr(c)}. Traz seguidores, votos e uma condição: ser candidato(a) na próxima eleição.`,
  opts: [
    { id: "abonar", label: "Abonar a filiação com evento e foto", hint: "Votos e visibilidade; risco de passado", tone: "bold", run: (c, _b, fx) => {
      const party = c.party!;
      party.members += 150;
      party.territory[c.p.uf] = Math.min(1, (party.territory[c.p.uf] ?? 0) + 0.003);
      c.ctx.save("parties", party);
      fx.standing(3);
      if (c.roll(0.15)) {
        fx.reputation(-1);
        return "Festa bonita — até aparecerem prints antigos da pessoa. A semana foi de explicações.";
      }
      return "Evento cheio, filiação assinada no palco. O partido ganhou um puxador de votos.";
    } },
    { id: "condicoes", label: "Aceitar, mas exigir compromisso com o programa", tone: "safe", cost: () => ({ energy: 8 }), run: (_c, _b, fx) => {
      fx.standing(2);
      return "Conversa franca, carta-compromisso assinada. Entrou sabendo as regras.";
    } },
    { id: "recusar", label: "Recusar", tone: "neutral", run: () => "Você recusou. A pessoa foi para o partido rival." },
  ],
  fallback: "condicoes",
});

const militancia_cobra = ev({
  id: "militancia_cobra",
  kind: "DECISAO",
  tags: ["PARTIDO"],
  family: "comando_rotina",
  cooldown: 200,
  max: 3,
  expires: 6,
  when: (c) => (post(c) ? {} : null),
  title: () => "A militância quer ser ouvida",
  text: (c) => `Um grupo de militantes antigos do ${acr(c)} reclamou: "O partido virou escritório de candidato. Ninguém debate mais nada."`,
  opts: [
    { id: "assembleia", label: "Convocar uma assembleia aberta", hint: "Cansa; reacende a base", tone: "safe", cost: () => ({ energy: 12 }), run: (_c, _b, fx) => {
      fx.activism(3);
      fx.standing(3);
      return "Auditório cheio num sábado. Saiu um plano de formação e dois núcleos novos.";
    } },
    { id: "grupo", label: "Criar um grupo de trabalho e prometer retorno", tone: "neutral", run: (_c, _b, fx) => {
      fx.standing(1);
      return "Grupo criado. Agora é cumprir a promessa.";
    } },
    { id: "ignorar", label: "Ignorar", tone: "risky", run: (_c, _b, fx) => {
      fx.standing(-3);
      fx.activism(-2);
      return "Os militantes se afastaram. Na próxima campanha, vai faltar gente na rua.";
    } },
  ],
  fallback: "grupo",
});

const doacao_empresa = ev({
  id: "doacao_empresa",
  kind: "DECISAO",
  tags: ["PARTIDO", "DINHEIRO"],
  family: "comando_dinheiro",
  cooldown: 400,
  max: 2,
  expires: 5,
  when: (c) => (presidente(c) && Number(c.date.slice(0, 4)) >= 2016 ? { valor: c.money(c.rng.pick([50_000, 100_000, 200_000])) } : null),
  title: () => "Um empresário quer \"ajudar o partido\"",
  text: (_c, b) => `Um empresário da construção oferece ${brl(Number(b.valor))} para o caixa do diretório. Desde 2015, empresa não pode doar a partido; ele sugere "dar um jeito".`,
  opts: [
    { id: "recusar", label: "Recusar", tone: "safe", run: () => "Você recusou. Ele entendeu — e foi oferecer a outro partido." },
    { id: "pessoa_fisica", label: "Aceitar só doação como pessoa física, declarada e no limite", tone: "neutral", run: (c, _b, fx) => {
      const party = c.party!;
      party.cash += c.money(15_000);
      c.ctx.save("parties", party);
      fx.standing(1);
      return "Doação pessoal, com recibo e dentro da lei. Menos dinheiro, nenhum risco.";
    } },
    { id: "por_fora", label: "Aceitar por fora", hint: "Caixa dois partidário", tone: "illegal", run: (c, b, fx) => {
      fx.illicit("CAIXA_DOIS", { amount: Number(b.valor), description: `Doação empresarial não declarada ao ${acr(c)}`, witnesses: 2, paperTrail: 0.45 });
      const party = c.party!;
      party.cash += Number(b.valor);
      c.ctx.save("parties", party);
      fx.standing(3);
      return "O dinheiro entrou em espécie, em três parcelas. O empresário vai lembrar que ajudou.";
    } },
  ],
  fallback: "recusar",
});

/** Secretário sem cargo de comando ainda: a primeira tarefa de verdade na direção. */
const secretario_tarefa = ev({
  id: "secretario_tarefa",
  kind: "DECISAO",
  tags: ["PARTIDO"],
  family: "comando_rotina",
  cooldown: 180,
  max: 3,
  expires: 6,
  when: (c) => (post(c)?.level === "SECRETARIO" ? { area: String(c.flag("cargo_area") ?? "organização") } : null),
  title: (_c, b) => `Missão da secretaria de ${b.area}`,
  text: (c, b) => `A presidência do ${acr(c)} deu prazo: a secretaria de ${b.area} precisa entregar um plano para o semestre. É a chance de mostrar serviço — ou de sumir.`,
  opts: [
    { id: "caprichar", label: "Montar um plano ambicioso e executar", hint: "Prestígio; muito trabalho", tone: "bold", cost: () => ({ energy: 20 }), run: (_c, _b, fx) => {
      fx.standing(6);
      fx.fatigue(6);
      return "Plano entregue, metas batidas. Seu nome começa a circular para a presidência do diretório.";
    } },
    { id: "basico", label: "Fazer o básico", tone: "neutral", cost: () => ({ energy: 8 }), run: (_c, _b, fx) => {
      fx.standing(2);
      return "Plano entregue no prazo. Nada de mais, nada de menos.";
    } },
    { id: "delegar", label: "Delegar para a equipe", tone: "risky", run: (c, _b, fx) => {
      if (c.roll(0.5)) {
        fx.standing(2);
        return "A equipe deu conta. Você levou o crédito.";
      }
      fx.standing(-3);
      return "Ninguém entregou nada. A presidência anotou.";
    } },
  ],
  fallback: "basico",
});

/** Usado por quem ainda não tinha cargo mas chegou lá antes deste sistema: ajusta o efeito do tipo. */
export function commandRank(c: StoryCtx): number {
  return postRank(post(c)?.level);
}

export const COMMAND_EVENTS: EventDef[] = [
  disputa_estadual,
  estadual_resultado,
  disputa_nacional,
  nacional_resultado,
  afastado_reage,
  ciumes_nomeacao,
  conselho_etica,
  filiado_quer_sair,
  pedido_legenda,
  tesoureiro_desvio,
  prestacao_contas,
  rebeliao_interna,
  executiva_impoe,
  filiacao_figura,
  militancia_cobra,
  doacao_empresa,
  secretario_tarefa,
];

export type { Effects };
export { partyOfficersInScope };
