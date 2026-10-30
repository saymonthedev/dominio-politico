import { geoName } from "../../elections";
import { OFFICES } from "../../ruleset";
import { segLabel } from "../campaign";
import type { StoryCtx } from "../context";
import type { EventDef } from "../def";
import { companyName, localOutlet } from "../world";
import { actor, bairro, brl, city, first, localPolitician, partyOf } from "./util";

/**
 * O mandato: posse, gabinete, promessas cobradas, emendas, votações que
 * dividem, imprensa fiscalizando e os financiadores batendo na porta.
 */

const LEGISLATIVE = ["VEREADOR", "DEP_ESTADUAL", "DEP_FEDERAL", "SENADOR"];
const EXECUTIVE = ["PREFEITO", "GOVERNADOR", "PRESIDENTE"];

const posse: EventDef = {
  id: "posse",
  kind: "DECISAO",
  tags: ["MANDATO"],
  chained: true,
  milestone: true,
  expires: 4,
  when: (c, d) => {
    const m = d ? c.ctx.t.mandates.get(String(d.mandate)) : undefined;
    return m && m.person_id === c.p.id && m.status === "ATIVO" ? { mandate: m.id } : null;
  },
  render: (c, b) => {
    const m = c.ctx.t.mandates.get(String(b.mandate))!;
    const office = OFFICES[m.office_code].name;
    const promised = Object.keys(c.s.flags).filter((k) => k.startsWith("promessa_cargo:")).length;
    return {
      title: `Posse: ${office.toLowerCase()} de ${geoName(m.geo, c.ctx.s)}`,
      text: `Terno passado, família na plateia, mão no peito. Você toma posse como ${office.toLowerCase()} de ${geoName(m.geo, c.ctx.s)}. ${promised ? `Há ${promised} promessa(s) de cargo feitas na campanha esperando resposta.` : ""} A primeira decisão é a equipe: quem senta ao seu lado nos próximos anos diz muito sobre o mandato que você vai ter.`,
      choices: [
        { id: "tecnico", label: "Gabinete técnico, escolhido por currículo", hint: "Mandato mais eficiente; aliados enciumados", tone: "safe" },
        { id: "aliados", label: "Gabinete com quem trabalhou na campanha", hint: "Lealdade e prestígio no partido; críticas de loteamento", tone: "neutral" },
        { id: "enxuto", label: "Gabinete enxuto, devolvendo parte da verba", hint: "Ótimo para a imagem; menos braços para trabalhar", tone: "bold" },
      ],
    };
  },
  resolve: (c, _b, choice, fx) => {
    fx.flag("posse_em", c.date);
    for (const k of Object.keys(c.s.flags).filter((x) => x.startsWith("promessa_cargo:"))) {
      const id = k.slice("promessa_cargo:".length);
      if (actor(c, id) || partyOf(c, id)) fx.schedule("promessa_cargo_cobrada", [5, 25], { who: id });
    }
    if (choice === "tecnico") {
      fx.capital(5);
      fx.reputation(1);
      fx.standing(-2);
      return "Um gabinete de gente competente e pouco conhecida. O partido torceu o nariz; o trabalho vai render.";
    }
    if (choice === "aliados") {
      fx.standing(5);
      fx.reputation(-1);
      return "Os coordenadores de campanha viraram assessores. A militância comemorou; um colunista falou em \"cabide de emprego\".";
    }
    fx.reputation(3);
    fx.capital(-3);
    return "Você anunciou que vai devolver parte da verba de gabinete. Virou notícia — e virou alvo de colegas que não gostaram da comparação.";
  },
  fallback: "aliados",
};

const promessa_cargo_cobrada: EventDef = {
  id: "promessa_cargo_cobrada",
  kind: "DECISAO",
  tags: ["MANDATO", "BASTIDORES"],
  chained: true,
  expires: 6,
  when: (c, d) => (c.p.office_code && d && c.flag(`promessa_cargo:${d.who}`) ? d : null),
  render: (c, b) => {
    const who = actor(c, b.who);
    const party = partyOf(c, b.who);
    const name = who?.name ?? `a direção do ${party?.acronym}`;
    return {
      title: "Hora de pagar a promessa",
      who: who ?? null,
      text: `Na campanha, você prometeu um cargo em troca de apoio. Agora ${name} quer a nomeação. "Promessa de campanha é dívida, né?"`,
      choices: [
        { id: "cumprir", label: "Cumprir a promessa e nomear", hint: "Aliado fiel; críticas de loteamento", tone: "neutral" },
        { id: "outra", label: "Oferecer outra coisa no lugar", hint: "Meio-termo que não agrada ninguém", tone: "safe" },
        { id: "negar", label: "Negar", hint: "Você ganha um inimigo que sabe dos acordos", tone: "risky" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const who = actor(c, b.who);
    fx.unflag(`promessa_cargo:${b.who}`);
    if (choice === "cumprir") {
      if (who) fx.rel(who.id, 15);
      fx.reputation(-0.5);
      fx.capital(2);
      return "Nomeação publicada. Promessa cumprida, aliado garantido para a próxima eleição.";
    }
    if (choice === "outra") {
      if (who) fx.rel(who.id, -8);
      return "Você ofereceu um cargo menor. Aceitaram, de má vontade.";
    }
    if (who) fx.rel(who.id, -25);
    fx.reputation(-1);
    return "Você negou. A história do acordo de campanha já está sendo contada nos bastidores — na versão de quem foi traído.";
  },
  fallback: "outra",
};

const cobranca_promessa: EventDef = {
  id: "cobranca_promessa",
  kind: "DECISAO",
  tags: ["MANDATO"],
  blocking: false,
  cooldown: 60,
  expires: 7,
  when: (c) => {
    if (!c.p.office_code) return null;
    const m = [...c.ctx.t.mandates.values()].find((x) => x.person_id === c.p.id && x.status === "ATIVO" && x.office_code === c.p.office_code);
    const promise = (c.s.promises ?? []).find((x) => !x.kept && x.election === m?.election_id && !c.flag(`cobrada:${x.id}`));
    return m && promise ? { promise: promise.id, text: promise.title, seg: promise.segment } : null;
  },
  weight: 1.6,
  render: (c, b) => ({
    title: "Cobrança de promessa de campanha",
    text: `Um grupo de ${segLabel(String(b.seg)).toLowerCase()} lotou a galeria com faixas: "Cadê a promessa?". Na campanha, você assinou: ${b.text}. A imprensa local está lá.`,
    choices: [
      { id: "projeto", label: "Apresentar um projeto para cumprir", hint: "Gasta capital político; promessa cumprida", tone: "safe", cost: { energy: 15 } },
      { id: "explicar", label: "Explicar que o orçamento não permite agora", hint: "Honesto; frustra", tone: "neutral" },
      { id: "ignorar", label: "Ignorar a cobrança", hint: "A conta chega na próxima eleição", tone: "risky" },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    const promise = (c.s.promises ?? []).find((x) => x.id === String(b.promise));
    fx.flag(`cobrada:${b.promise}`, c.date);
    if (choice === "projeto") {
      fx.energy(-15);
      if (c.st.political_capital >= 8 && c.roll(0.5 + c.competence * 0.3 + c.st.political_capital / 200)) {
        fx.capital(-8);
        fx.reputation(2.5);
        if (promise) promise.kept = true;
        fx.bump("promessas_cumpridas");
        return "O projeto passou. A galeria aplaudiu de pé — e a foto rodou a cidade.";
      }
      fx.capital(-3);
      fx.reputation(0.5);
      return "Você apresentou o projeto, mas ele empacou na comissão. Pelo menos ninguém pode dizer que você não tentou.";
    }
    if (choice === "explicar") {
      fx.reputation(-1);
      return "Você mostrou os números do orçamento. Uns entenderam, outros saíram dizendo que \"é tudo igual\".";
    }
    fx.reputation(-2.5);
    fx.bump("promessas_ignoradas");
    return "Você não apareceu. A faixa \"Cadê a promessa?\" agora tem a sua foto.";
  },
  fallback: "ignorar",
};

const pedido_emenda: EventDef = {
  id: "pedido_emenda",
  kind: "OPORTUNIDADE",
  tags: ["MANDATO", "COMUNIDADE"],
  cooldown: 75,
  expires: 10,
  when: (c) => {
    if (!c.p.office_code || !LEGISLATIVE.includes(c.p.office_code)) return null;
    const mayor = c.p.office_code === "VEREADOR" ? undefined : localPolitician(c, { office: "PREFEITO" });
    const what = c.rng.pick(["a reforma de uma UBS", "a pavimentação de uma estrada", "equipamentos para o hospital regional", "a cobertura da quadra da escola"]);
    return { mayor: mayor?.id ?? "", what, v: c.money(c.p.office_code === "VEREADOR" ? 80_000 : 500_000), hood: bairro(c, `emenda:${c.date.slice(0, 7)}`) };
  },
  render: (c, b) => {
    const mayor = actor(c, b.mayor);
    return {
      title: "Pedido de emenda",
      who: mayor ?? null,
      text: mayor
        ? `${mayor.name}, prefeito(a) de ${geoName(mayor.office_geo ?? mayor.municipality, c.ctx.s)}, pede uma emenda de ${brl(Number(b.v))} para ${b.what}. "É obra que o povo vê. E eu sei agradecer."`
        : `A associação do ${b.hood} pede uma emenda de ${brl(Number(b.v))} para ${b.what}. Seria a primeira obra do bairro em dez anos.`,
      choices: [
        { id: "destinar", label: "Destinar a emenda", hint: "Gasta capital político; reputação", tone: "safe" },
        ...(mayor ? [{ id: "troca", label: "Destinar em troca de apoio na próxima eleição", hint: "Aliado para a campanha", tone: "neutral" as const }] : []),
        { id: "negar", label: "Negar por enquanto", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const mayor = actor(c, b.mayor);
    if (choice === "negar") {
      if (mayor) fx.rel(mayor.id, -5);
      return "Ficou para o próximo orçamento.";
    }
    if (c.st.political_capital < 6) {
      fx.capital(-2);
      return "Você tentou, mas não tinha força na comissão para emplacar a emenda. Ficou a promessa.";
    }
    fx.capital(-6);
    fx.reputation(1.5);
    fx.reach(0.004);
    if (mayor) fx.rel(mayor.id, choice === "troca" ? 16 : 10);
    if (choice === "troca" && mayor) fx.flag(`apoio_prefeito:${mayor.id}`, c.date);
    return `Emenda empenhada. A placa da obra vai ter o seu nome${mayor && choice === "troca" ? ` — e ${first(mayor)} vai pedir voto para você` : ""}.`;
  },
  fallback: "negar",
};

const votacao_polemica: EventDef = {
  id: "votacao_polemica",
  kind: "DECISAO",
  tags: ["MANDATO", "IMPRENSA"],
  cooldown: 120,
  expires: 3,
  when: (c) => {
    if (!c.p.office_code || !LEGISLATIVE.includes(c.p.office_code)) return null;
    const topic = c.rng.pick([
      { k: "salario", t: "o aumento de 26% no salário dos próprios parlamentares" },
      { k: "verba", t: "a ampliação da verba de gabinete em plena crise" },
      { k: "carro", t: "a compra de carros novos para os gabinetes" },
    ]);
    return { k: topic.k, t: topic.t };
  },
  render: (c, b) => ({
    title: "Votação que ninguém quer explicar",
    text: `Entra na pauta, em votação simbólica e às pressas, ${b.t}. A maioria dos colegas quer aprovar sem barulho; ${c.party ? `a liderança do ${c.party.acronym} pede que você não atrapalhe` : "ninguém quer ser o chato da vez"}. Se a imprensa souber, vai ser manchete.`,
    choices: [
      { id: "sim", label: "Votar com a maioria", hint: "Paz com os colegas; risco de manchete", tone: "neutral" },
      { id: "nao", label: "Votar contra e pedir votação nominal", hint: "Imagem de independência; colegas irritados", tone: "bold" },
      { id: "ausente", label: "Sair do plenário na hora", tone: "neutral" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "sim") {
      fx.standing(2);
      fx.capital(2);
      if (c.roll(0.5)) {
        fx.reputation(-2.5);
        return "Aprovado. Dois dias depois, o portal da cidade publicou a lista de quem votou a favor — com a sua foto.";
      }
      return "Aprovado em votação simbólica. Ninguém notou — por enquanto.";
    }
    if (choice === "nao") {
      fx.reputation(2.5);
      fx.visibility(3);
      fx.capital(-4);
      fx.standing(-3);
      return "Sua exigência de votação nominal expôs todo mundo. O projeto foi adiado; o cafezinho com os colegas, também.";
    }
    fx.reputation(-0.5);
    return "Você saiu na hora da votação. Os colegas entenderam o recado; os eleitores, não.";
  },
  fallback: "ausente",
};

const imprensa_cobra: EventDef = {
  id: "imprensa_cobra",
  kind: "DECISAO",
  tags: ["MANDATO", "IMPRENSA"],
  cooldown: 110,
  expires: 3,
  when: (c) => (c.p.office_code ? { outlet: localOutlet(c.rng), what: c.rng.pick(["seus gastos com a cota parlamentar", "as viagens pagas pelo gabinete", "a contratação de assessores", "as diárias de viagem do último semestre"]) } : null),
  render: (c, b) => ({
    title: "A imprensa quer saber",
    text: `A repórter da ${b.outlet} manda doze perguntas sobre ${b.what} e dá prazo até amanhã. Na redação, a pauta já tem título provisório.`,
    choices: [
      { id: "abrir", label: "Abrir todos os dados, com planilhas", hint: "Transparência total — inclusive do que você preferia não mostrar", tone: "safe" },
      { id: "nota", label: "Responder com uma nota genérica", tone: "neutral" },
      { id: "atacar", label: "Acusar o veículo de perseguição", hint: "Mobiliza seus fiéis; irrita o resto", tone: "risky" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    const hidden = [...c.ctx.t.illicit_acts.values()].filter((a) => a.person_id === c.p.id && !a.discovered && ["DESVIO_COTA", "RACHADINHA", "FUNCIONARIO_FANTASMA", "PECULATO"].includes(a.kind));
    if (choice === "abrir") {
      if (hidden.length) {
        const a = hidden[0];
        a.paper_trail = Math.min(1, a.paper_trail + 0.3);
        a.exposure = Math.min(1, a.exposure + 0.2);
        c.ctx.save("illicit_acts", a);
        fx.reputation(0.5);
        return "Você abriu as planilhas. A repórter agradeceu — e começou a cruzar os nomes dos assessores com outras bases.";
      }
      fx.reputation(2.5);
      return "Os dados não mostraram nada de errado. A matéria saiu com o título \"Vereador(a) abre as contas e vira exemplo\".";
    }
    if (choice === "nota") {
      fx.reputation(-1);
      return "A matéria saiu com a frase \"o gabinete respondeu por meio de nota\". Ninguém gosta de ler isso.";
    }
    fx.visibility(3);
    fx.reputation(-2);
    return "Seu vídeo contra \"a imprensa que persegue\" rendeu curtidas entre os fiéis e editoriais duros nos jornais.";
  },
  fallback: "nota",
};

const assessor_problema: EventDef = {
  id: "assessor_problema",
  kind: "DECISAO",
  tags: ["MANDATO", "IMPRENSA"],
  cooldown: 200,
  expires: 2,
  when: (c) => (c.p.office_code ? { what: c.rng.pick(["usando o carro oficial para levar a família à praia", "postando ofensas contra eleitores nas redes", "cobrando \"taxa\" para agendar reuniões com você", "trabalhando ao mesmo tempo em outra prefeitura"]) } : null),
  render: (_c, b) => ({
    title: "Problema no gabinete",
    text: `Um assessor seu foi flagrado ${b.what}. O print chegou primeiro aos adversários, depois à imprensa. Todos esperam saber o que você vai fazer.`,
    choices: [
      { id: "demitir", label: "Demitir na hora e pedir desculpas", tone: "safe" },
      { id: "sindicancia", label: "Afastar e abrir apuração interna", hint: "Justo, mas demorado", tone: "neutral", cost: { energy: 5 } },
      { id: "defender", label: "Defender o assessor", hint: "Lealdade ao time; desgaste público", tone: "risky" },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    if (choice === "demitir") {
      fx.reputation(0.5);
      return "Exoneração publicada no mesmo dia. O caso morreu em 48 horas.";
    }
    if (choice === "sindicancia") {
      fx.energy(-5);
      fx.reputation(1);
      return "Você afastou o assessor e abriu apuração. A resposta foi elogiada como \"serena\".";
    }
    fx.reputation(-3);
    if (String(b.what).includes("taxa")) fx.scandal(6);
    return "Você saiu em defesa do assessor. A cada nova reportagem, a defesa fica mais difícil.";
  },
  fallback: "demitir",
};

const greve_servidores: EventDef = {
  id: "greve_servidores",
  kind: "DECISAO",
  tags: ["MANDATO"],
  cooldown: 220,
  expires: 3,
  when: (c) => (c.p.office_code && EXECUTIVE.includes(c.p.office_code) ? { who: c.rng.pick(["professores", "profissionais da saúde", "motoristas de ônibus", "servidores da limpeza urbana"]) } : null),
  render: (c, b) => ({
    title: `Greve dos ${b.who}`,
    text: `Os ${b.who} cruzaram os braços e acampam na porta da ${c.p.office_code === "PREFEITO" ? "prefeitura" : "sede do governo"}. Pedem reajuste de 15%. O caixa comporta 5%. A população apoia a greve nos primeiros dias — depois, cansa.`,
    choices: [
      { id: "negociar", label: "Negociar e escalonar o reajuste", hint: "Depende de habilidade", tone: "safe", cost: { energy: 15 } },
      { id: "ceder", label: "Ceder e dar o reajuste pedido", hint: "Fim da greve; conta pesada depois", tone: "neutral" },
      { id: "endurecer", label: "Endurecer e cortar o ponto", hint: "Imagem de firmeza; desgaste com servidores", tone: "risky" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "negociar") {
      fx.energy(-15);
      if (c.roll(0.4 + c.competence * 0.3 + c.charisma * 0.2)) {
        fx.reputation(2);
        fx.capital(2);
        return "Acordo fechado de madrugada: 8% agora, 7% no ano que vem. Os dois lados disseram que ganharam.";
      }
      fx.reputation(-1);
      return "A negociação travou. A greve continua e a cidade começa a culpar você.";
    }
    if (choice === "ceder") {
      fx.reputation(1);
      fx.capital(-6);
      return "Greve encerrada no mesmo dia. O secretário de Fazenda pediu uma reunião urgente.";
    }
    fx.capital(3);
    fx.reputation(-2);
    return "O corte de ponto acabou com a greve em uma semana — e criou uma categoria inteira contra você.";
  },
  fallback: "negociar",
};

const cobranca_doador: EventDef = {
  id: "cobranca_doador",
  kind: "DECISAO",
  tags: ["BASTIDORES", "DINHEIRO"],
  chained: true,
  expires: 6,
  when: (c, d) => (actor(c, d?.broker) ? d! : null),
  render: (c, b) => {
    const broker = actor(c, b.broker)!;
    const legal = Number(b.legal) === 1;
    const company = companyName(c.rng);
    if (!c.p.office_code) {
      return {
        title: `${first(broker)} quer conversar`,
        who: broker,
        text: legal
          ? `${broker.name}, que doou para a sua campanha, convida você para um jantar. Quer "manter a amizade" para a próxima eleição.`
          : `${broker.name} lembra do dinheiro por fora da campanha. Você não venceu, mas ele quer a parte dele de volta: "Negócio é negócio."`,
        choices: legal
          ? [
              { id: "jantar", label: "Ir ao jantar", tone: "neutral" },
              { id: "recusar", label: "Agradecer e recusar", tone: "safe" },
            ]
          : [
              { id: "devolver", label: "Devolver parte do dinheiro", tone: "neutral", cost: { money: c.money(15_000) } },
              { id: "negar", label: "Dizer que não deve nada", hint: "Ele sabe demais", tone: "risky" },
            ],
      };
    }
    return {
      title: legal ? "O doador pede uma reunião" : "A conta da campanha chegou",
      who: broker,
      text: legal
        ? `${broker.name}, que doou legalmente para a sua campanha, quer uma reunião para apresentar um projeto da ${company}. É direito dele pedir — e decisão sua o que fazer com o pedido.`
        : `${broker.name} quer a contrapartida combinada: que a próxima licitação de ${city(c)} "seja desenhada" para a ${company} vencer. "Você não chegou aí sozinho(a)."`,
      choices: legal
        ? [
            { id: "receber", label: "Receber, com agenda pública e registro", hint: "Transparente", tone: "safe" },
            { id: "favorecer", label: "Receber e prometer ajudar o projeto", hint: "Tráfico de influência", tone: "illegal" },
            { id: "recusar", label: "Recusar a reunião", tone: "neutral" },
          ]
        : [
            { id: "cumprir", label: "Cumprir o acordo", hint: "Fraude em licitação: crime grave", tone: "illegal" },
            { id: "enrolar", label: "Enrolar e ganhar tempo", hint: "Ele não vai esperar para sempre", tone: "risky" },
            { id: "romper", label: "Romper com ele de vez", hint: "Ele pode contar o que sabe", tone: "bold" },
          ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const broker = actor(c, b.broker)!;
    if (choice === "jantar") {
      fx.rel(broker.id, 6);
      return "Jantar caro, conversa mole. Ele já fala em \"próxima campanha\".";
    }
    if (choice === "recusar") {
      fx.rel(broker.id, -5);
      return `${first(broker)} não gostou de ouvir não.`;
    }
    if (choice === "devolver") {
      fx.money(-c.money(15_000), "Devolução a financiador");
      fx.rel(broker.id, 2);
      return "Você devolveu uma parte. Ele aceitou — por ora.";
    }
    if (choice === "negar" || choice === "romper") {
      fx.rel(broker.id, -30);
      fx.unflag(`contrapartida:${broker.id}`);
      if (c.roll(0.35)) {
        fx.scandal(10);
        const acts = [...c.ctx.t.illicit_acts.values()].filter((a) => a.person_id === c.p.id && !a.discovered && a.partners.includes(broker.id));
        for (const a of acts) {
          a.exposure = Math.min(1, a.exposure + 0.35);
          c.ctx.save("illicit_acts", a);
        }
        return `${broker.name} cumpriu a ameaça: contou a um jornalista como funcionou o caixa dois da sua campanha.`;
      }
      return `${broker.name} saiu xingando. Por enquanto, ficou nisso.`;
    }
    if (choice === "receber") {
      fx.reputation(0.5);
      return "Reunião registrada na agenda pública. Você ouviu, agradeceu e não prometeu nada.";
    }
    if (choice === "favorecer") {
      fx.rel(broker.id, 10);
      fx.illicit("TRAFICO_INFLUENCIA", { amount: c.money(50_000), description: `Favorecimento a projeto de ${broker.name}`, partners: [broker.id], witnesses: 2, paperTrail: 0.4 });
      return "Você prometeu ajudar \"no que for possível\". Nos bastidores, isso tem nome.";
    }
    if (choice === "cumprir") {
      fx.rel(broker.id, 15);
      fx.dirty(c.money(80_000));
      fx.illicit("FRAUDE_LICITACAO", { amount: c.money(400_000), description: `Licitação direcionada para empresa de ${broker.name}`, partners: [broker.id], witnesses: 4, paperTrail: 0.6 });
      return "O edital saiu com exigências que só uma empresa cumpre. Junto, chegou um envelope.";
    }
    fx.rel(broker.id, -8);
    fx.schedule("cobranca_doador", [30, 60], { broker: broker.id, legal: 0 });
    return "Você ganhou tempo. Ele vai voltar.";
  },
  fallback: "enrolar",
};

export const MANDATE_EVENTS: EventDef[] = [posse, promessa_cargo_cobrada, cobranca_promessa, pedido_emenda, votacao_polemica, imprensa_cobra, assessor_problema, greve_servidores, cobranca_doador];
