import { respondToOffer } from "../../crime";
import { chargesText } from "../../crimes";
import type { EventDef } from "../def";
import { localOutlet } from "../world";
import { actor, brl, first } from "./util";

/**
 * Bastidores: a oferta indecente, a investigação que bate à porta e o
 * jornalista que faz perguntas demais. Cada escolha ilegal fica registrada e
 * pode voltar meses depois.
 */

const proposta_ilicita: EventDef = {
  id: "proposta_ilicita",
  kind: "DECISAO",
  tags: ["BASTIDORES", "DINHEIRO"],
  chained: true,
  expires: 7,
  when: (c, d) => (d && c.st.offers.some((o) => o.id === String(d.offer)) && actor(c, d.broker) ? d : null),
  valid: (c, b) => c.st.offers.some((o) => o.id === String(b.offer)),
  render: (c, b) => {
    const broker = actor(c, b.broker)!;
    const offer = c.st.offers.find((o) => o.id === String(b.offer))!;
    const bribe = offer.kind === "PROPINA";
    const favor = c.p.office_code ? "um voto favorável no projeto que interessa ao grupo dele" : "\"ajuda para abrir umas portas\" quando você tiver cargo";
    return {
      title: bribe ? "Uma proposta indecente" : "Dinheiro sem nome",
      who: broker,
      text: bribe
        ? `${broker.name}${broker.role_label ? `, ${broker.role_label},` : ""} marca um café num shopping e, entre um assunto e outro, oferece ${brl(Number(b.amount))} em troca de ${favor}. "Ninguém precisa saber. É assim que funciona."`
        : `${broker.name}${broker.role_label ? `, ${broker.role_label},` : ""} oferece ${brl(Number(b.amount))} em espécie, "para ajudar na sua caminhada". Sem recibo, sem registro, sem perguntas — por enquanto.`,
      choices: [
        { id: "recusar", label: "Recusar", tone: "safe" },
        { id: "denunciar", label: "Denunciar à Polícia Federal", hint: "Reputação; um inimigo com contatos", tone: "bold" },
        { id: "aceitar", label: "Aceitar", hint: bribe ? "Corrupção passiva: crime grave" : "Dinheiro não declarado: crime", tone: "illegal" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const broker = actor(c, b.broker)!;
    const offer = String(b.offer);
    if (choice === "aceitar") {
      const msg = respondToOffer(c.ctx, c.p, c.st, offer, "ACEITAR");
      fx.rel(broker.id, 8);
      fx.bump("propostas_aceitas");
      return msg;
    }
    if (choice === "denunciar") {
      const msg = respondToOffer(c.ctx, c.p, c.st, offer, "DENUNCIAR");
      fx.reputation(3);
      fx.rel(broker.id, -30);
      fx.bump("denuncias_feitas");
      return `${msg} A notícia de que você denunciou a tentativa de suborno correu — e ${first(broker)} tem amigos.`;
    }
    respondToOffer(c.ctx, c.p, c.st, offer, "RECUSAR");
    fx.rel(broker.id, -5);
    return `"Você é quem sabe." ${first(broker)} pagou o café e foi embora.`;
  },
  fallback: "recusar",
};

const investigacao_aberta: EventDef = {
  id: "investigacao_aberta",
  kind: "DECISAO",
  tags: ["BASTIDORES", "IMPRENSA"],
  chained: true,
  milestone: true,
  expires: 4,
  when: (c, d) => {
    const inv = d ? c.ctx.t.investigations.get(String(d.inv)) : undefined;
    return inv && !inv.outcome && inv.person_id === c.p.id ? { inv: inv.id } : null;
  },
  valid: (c, b) => !c.ctx.t.investigations.get(String(b.inv))?.outcome,
  render: (c, b) => {
    const inv = c.ctx.t.investigations.get(String(b.inv))!;
    const guilty = inv.act_ids.length > 0;
    const cost = c.money(50_000);
    return {
      title: "Você está sendo investigado(a)",
      text: `A investigação foi aberta: ${inv.crimes.length ? chargesText(inv.crimes) : "suspeitas ainda genéricas"}. O caso vai passar por etapas — busca de provas, denúncia, julgamento — e cada notícia vai pesar na sua imagem. ${guilty ? "Você sabe o que fez." : "Você sabe que não fez nada — mas isso não basta."}`,
      choices: [
        { id: "advogado", label: "Contratar um escritório de defesa", hint: `${brl(cost)}; defesa mais forte`, tone: "safe", cost: { money: cost } },
        { id: "entrevista", label: "Dar entrevista se dizendo inocente", hint: guilty ? "Se as provas aparecerem, a queda é maior" : "A verdade a seu favor", tone: "bold" },
        { id: "colaborar", label: "Colaborar e entregar documentos", hint: guilty ? "Reduz a pena; confirma a culpa" : "Acelera o arquivamento", tone: "neutral" },
        { id: "silencio", label: "Ficar em silêncio", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const inv = c.ctx.t.investigations.get(String(b.inv))!;
    const guilty = inv.act_ids.length > 0;
    if (choice === "advogado") {
      fx.money(-c.money(50_000), "Honorários de defesa");
      inv.defense = Math.min(1, inv.defense + 0.2);
      c.ctx.save("investigations", inv);
      return "Um escritório conhecido assumiu o caso. A primeira petição já questiona as provas.";
    }
    if (choice === "entrevista") {
      if (guilty) {
        fx.reputation(1);
        fx.flag("negou_publicamente", inv.id);
        return "Sua entrevista convenceu muita gente. Se as provas aparecerem, vai convencer o contrário.";
      }
      fx.reputation(2);
      return "Você falou com firmeza e mostrou documentos. A opinião pública ficou do seu lado — por enquanto.";
    }
    if (choice === "colaborar") {
      if (guilty) {
        inv.evidence = Math.min(1, inv.evidence + 0.15);
        inv.defense = Math.min(1, inv.defense + 0.1);
        c.ctx.save("investigations", inv);
        fx.reputation(-1);
        return "Você entregou documentos e explicações. A pena, se vier, tende a ser menor — mas agora há menos dúvida.";
      }
      inv.evidence = Math.max(0, inv.evidence - 0.2);
      c.ctx.save("investigations", inv);
      fx.reputation(1);
      return "Seus documentos desmontaram boa parte da suspeita. O caso perdeu força.";
    }
    return "Você não comentou. O silêncio, para uns, é prudência; para outros, confissão.";
  },
  fallback: "silencio",
};

const jornalista_investiga: EventDef = {
  id: "jornalista_investiga",
  kind: "DECISAO",
  tags: ["BASTIDORES", "IMPRENSA"],
  cooldown: 150,
  expires: 3,
  when: (c) => {
    const hidden = [...c.ctx.t.illicit_acts.values()].filter((a) => a.person_id === c.p.id && !a.discovered);
    if (!hidden.length && c.st.scandal < 15) return null;
    if (!c.p.office_code && !c.cand && c.p.visibility < 15) return null;
    return { outlet: localOutlet(c.rng), act: hidden[0]?.id ?? "", topic: hidden[0]?.description.toLowerCase() ?? "a origem do seu patrimônio" };
  },
  render: (c, b) => ({
    title: "Uma repórter faz perguntas demais",
    text: `Uma repórter da ${b.outlet} anda conversando com ex-assessores e ex-sócios. As perguntas giram em torno de ${b.topic}. Ela pediu uma entrevista "para ouvir o seu lado".`,
    choices: [
      { id: "entrevista", label: "Dar a entrevista e explicar", hint: "Depende do que há para explicar", tone: "bold", cost: { energy: 8 } },
      { id: "nao", label: "Não responder", hint: "A matéria sai do mesmo jeito", tone: "neutral" },
      { id: "anuncios", label: "Oferecer anúncios ao veículo para \"esfriar\" a pauta", hint: "Se vazar, vira o escândalo", tone: "risky", cost: { money: c.money(20_000) } },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    const act = b.act ? c.ctx.t.illicit_acts.get(String(b.act)) : undefined;
    const raise = (v: number) => {
      if (act) {
        act.exposure = Math.min(1, act.exposure + v);
        c.ctx.save("illicit_acts", act);
      }
    };
    if (choice === "entrevista") {
      fx.energy(-8);
      if (!act) {
        fx.reputation(1.5);
        return "Você respondeu tudo, com documentos. A matéria saiu morna — e a seu favor.";
      }
      if (c.roll(0.3 + c.charisma * 0.3)) {
        fx.scandal(3);
        return "Você convenceu a repórter de que não havia história. Por enquanto.";
      }
      raise(0.25);
      fx.scandal(8);
      return "Uma contradição na entrevista virou a manchete. Agora há mais gente investigando.";
    }
    if (choice === "anuncios") {
      fx.money(-c.money(20_000), "Publicidade em veículo local");
      if (c.roll(0.55)) {
        fx.scandal(2);
        return "A pauta \"esfriou\". O dinheiro foi; a dúvida ficou.";
      }
      fx.scandal(12);
      fx.reputation(-4);
      raise(0.2);
      return "A repórter publicou a oferta de anúncios junto com a reportagem. Pior impossível.";
    }
    fx.scandal(5);
    raise(0.1);
    return "A matéria saiu com \"procurado(a), não respondeu\". Não ajuda.";
  },
  fallback: "nao",
};

export const BACKSTAGE_EVENTS: EventDef[] = [proposta_ilicita, investigacao_aberta, jornalista_investiga];
