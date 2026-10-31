import { addDays, diffDays } from "../../calendar";
import {
  activeProposals,
  advanceProposal,
  finishProposal,
  newProposal,
  placeFor,
  PROPOSAL_BY_ID,
  proposalById,
  scopeOf,
  templatesFor,
} from "../../gabinete";
import { OFFICES } from "../../ruleset";
import { SEGMENT_BY_KEY } from "../../segments";
import type { StoryCtx } from "../context";
import type { EventDef } from "../def";
import type { Binding, Proposal } from "../types";
import { brl, communityLeader } from "./util";

/**
 * O gabinete: propostas chegam, o jogador decide, e cada etapa (comissão, plenário,
 * sanção; licitação, obra, inauguração) volta como acontecimento com escolha.
 */

const prop = (c: StoryCtx, b: Binding): Proposal | undefined => proposalById(c.st, b.pid);
const segLabel = (k: string) => SEGMENT_BY_KEY[k]?.label.toLowerCase() ?? "eleitores";
const LEGIS = new Set(["VEREADOR", "DEP_ESTADUAL", "DEP_FEDERAL", "SENADOR"]);

/** Casa onde a proposta tramita, para os textos. */
function house(c: StoryCtx): string {
  switch (c.p.office_code) {
    case "VEREADOR":
      return "Câmara Municipal";
    case "DEP_ESTADUAL":
      return "Assembleia";
    case "SENADOR":
      return "Senado";
    default:
      return "Câmara";
  }
}

function executive(c: StoryCtx): string {
  switch (c.p.office_code) {
    case "VEREADOR":
      return "a prefeitura";
    case "DEP_ESTADUAL":
      return "o governo do estado";
    default:
      return "o governo federal";
  }
}

/** Chance de o Executivo sancionar: depende de o partido ser da base. */
function sanctionChance(c: StoryCtx): number {
  const al = c.party?.gov_alignment ?? 0;
  return al > 0 ? 0.85 : al < 0 ? 0.55 : 0.7;
}

// ------------------------------------------------------------------ chegada

const gab_chegou: EventDef = {
  id: "gab_chegou",
  kind: "DECISAO",
  tags: ["MANDATO"],
  weight: 3.2,
  cooldown: 9,
  expires: 7,
  when: (c) => {
    const office = c.p.office_code;
    if (!office || activeProposals(c.st).length >= 4) return null;
    const list = templatesFor(c.st, office, c.date);
    if (!list.length) return null;
    const t = c.rng.pick(list);
    const place = placeFor(c.ctx, c.p, c.rng, office);
    return { tpl: t.id, place };
  },
  render: (c, b) => {
    const t = PROPOSAL_BY_ID[String(b.tpl)];
    const place = String(b.place);
    const local = scopeOf(c.p.office_code!) === "MUNICIPAL";
    const who = local ? communityLeader(c, place) : null;
    const base = [
      `${t.from(place)} ${who ? `(com ${who.name} à frente) ` : ""}chega ao gabinete com um pedido: ${t.title(place).toLowerCase()}. ${t.pitch(place)}`,
      t.polemic ? `Aviso da assessoria: o tema divide — ${t.polemic.replace(/^as? /, "")}.` : "",
    ].join(" ");
    const choices =
      t.kind === "INDICACAO"
        ? [
            { id: "assinar", label: "Assinar a indicação e cobrar o Executivo", hint: "Rápido; o resultado depende de quem governa", tone: "safe" as const, cost: { energy: 5 } },
            { id: "junto", label: "Ir pessoalmente com eles cobrar a resposta", hint: "Mais pressão e foto ao lado do povo", tone: "bold" as const, cost: { energy: 15 } },
            { id: "recusar", label: "Dizer que não é prioridade agora", hint: "Quem pediu vai lembrar", tone: "neutral" as const },
          ]
        : t.kind === "PROJETO"
          ? [
              { id: "assinar", label: "Protocolar o projeto como autor(a)", hint: "Todo o crédito é seu — e a briga também", tone: "bold" as const, cost: { energy: 10 } },
              { id: "coautoria", label: "Chamar colegas para assinar junto", hint: "Mais votos; o crédito fica dividido", tone: "safe" as const, cost: { energy: 10 } },
              { id: "estudar", label: "Pedir um estudo técnico antes de decidir", hint: "Volta em algumas semanas, mais forte", tone: "neutral" as const },
              { id: "recusar", label: "Recusar", tone: "neutral" as const },
            ]
          : [
              { id: "assinar", label: "Incluir no plano de governo e mandar fazer o projeto", hint: "Obra demora, mas inauguração rende", tone: "bold" as const, cost: { energy: 10 } },
              { id: "estudar", label: "Pedir estudo de custo antes", hint: "Volta em algumas semanas", tone: "neutral" as const },
              { id: "recusar", label: "Dizer que não cabe no orçamento", tone: "neutral" as const },
            ];
    return { title: `Pedido no gabinete: ${t.title(place)}`, text: base, who, choices };
  },
  resolve: (c, b, choice, fx) => {
    const t = PROPOSAL_BY_ID[String(b.tpl)];
    const place = String(b.place);
    const local = scopeOf(c.p.office_code!) === "MUNICIPAL";
    const who = local ? communityLeader(c, place) : null;
    const spec = { tpl: t.id, title: t.title(place), kind: t.kind, from: t.from(place), from_id: who?.id ?? null, place, segment: t.segment, impact: t.impact, difficulty: t.difficulty };
    if (choice === "recusar") {
      c.s.flags[`gab:${t.id}`] = c.date;
      if (who) fx.rel(who.id, -6);
      if (t.impact >= 3) fx.approval(-0.5, `Recusou o pedido: ${t.title(place).toLowerCase()}`);
      return "Você agradeceu e disse que não dá agora. Saíram do gabinete com a cara fechada.";
    }
    if (choice === "estudar") {
      c.s.flags[`gab:${t.id}`] = c.date;
      fx.schedule("gab_estudo_pronto", [12, 24], { tpl: t.id, place });
      return "A assessoria vai levantar custos, leis parecidas e quem apoia. Em algumas semanas, a decisão volta para a sua mesa.";
    }
    if (who) fx.rel(who.id, choice === "junto" ? 12 : 8);
    if (t.polemic) fx.approval(-0.4, `Tema polêmico: ${t.title(place).toLowerCase()}`);
    if (t.kind === "INDICACAO") {
      const p = newProposal(c.ctx, c.p, c.st, spec, "ENVIADA", c.rng.int(12, 26));
      if (choice === "junto") {
        p.support = Math.min(0.95, p.support + 0.15);
        fx.approval(0.6, "Foi pessoalmente cobrar com os moradores");
        fx.visibility(1);
      }
      fx.schedule("gab_resposta", diffDays(p.next!, c.date), { pid: p.id });
      return choice === "junto" ? `Vocês foram juntos e a foto rodou os grupos de ${place}. Agora é esperar a resposta de ${executive(c)}.` : `Indicação assinada e enviada para ${executive(c)}. Os moradores agradeceram.`;
    }
    if (t.kind === "PROJETO") {
      const p = newProposal(c.ctx, c.p, c.st, spec, "PROTOCOLADA", c.rng.int(15, 32));
      if (choice === "coautoria") {
        p.shared = true;
        p.support = Math.min(0.95, p.support + 0.12);
        p.impact = Math.round(p.impact * 0.7 * 10) / 10;
      }
      fx.capital(-2);
      fx.schedule("gab_comissao", diffDays(p.next!, c.date), { pid: p.id });
      return choice === "coautoria" ? "Projeto protocolado com a assinatura de mais cinco colegas. Mais força, menos holofote." : `Projeto protocolado na ${house(c)}. Seu nome está na capa.`;
    }
    const p = newProposal(c.ctx, c.p, c.st, spec, "ESTUDO", c.rng.int(20, 38));
    fx.capital(-3);
    fx.schedule("gab_licitacao", diffDays(p.next!, c.date), { pid: p.id });
    return "A equipe técnica começou o projeto executivo. Os moradores já espalharam que a obra vem.";
  },
  fallback: "recusar",
};

const gab_estudo_pronto: EventDef = {
  id: "gab_estudo_pronto",
  kind: "DECISAO",
  tags: ["MANDATO"],
  chained: true,
  expires: 6,
  when: (c, d) => (d && c.p.office_code && PROPOSAL_BY_ID[String(d.tpl)]?.offices.includes(c.p.office_code) && activeProposals(c.st).length < 5 ? d : null),
  render: (c, b) => {
    const t = PROPOSAL_BY_ID[String(b.tpl)];
    const place = String(b.place);
    const odds = Math.round(Math.max(0.1, Math.min(0.9, 0.7 - t.difficulty * 0.45 + c.p.reputation / 400)) * 100);
    return {
      title: `Estudo pronto: ${t.title(place)}`,
      text: `A assessoria fechou o levantamento. Quem ganha: ${segLabel(t.segment)}. ${t.polemic ? `Quem reclama: ${t.polemic}.` : "Não há grande resistência."} Chance estimada de dar certo: ${odds}%. ${t.kind === "OBRA" ? "O custo cabe, com algum aperto." : ""}`,
      choices: [
        { id: "seguir", label: t.kind === "OBRA" ? "Tocar a obra" : "Apresentar, já com o estudo debaixo do braço", hint: "Começa mais forte", tone: "bold" as const, cost: { energy: 8 } },
        { id: "arquivar", label: "Arquivar a ideia", tone: "neutral" as const },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const t = PROPOSAL_BY_ID[String(b.tpl)];
    const place = String(b.place);
    if (choice !== "seguir") return "Ideia arquivada. Fica para outro momento.";
    const spec = { tpl: t.id, title: t.title(place), kind: t.kind, from: t.from(place), place, segment: t.segment, impact: t.impact, difficulty: t.difficulty };
    if (t.kind === "OBRA") {
      const p = newProposal(c.ctx, c.p, c.st, spec, "ESTUDO", c.rng.int(10, 20));
      p.support = Math.min(0.95, p.support + 0.08);
      fx.schedule("gab_licitacao", diffDays(p.next!, c.date), { pid: p.id });
      return "Com o estudo pronto, o projeto da obra anda rápido.";
    }
    if (t.kind === "INDICACAO") {
      const p = newProposal(c.ctx, c.p, c.st, spec, "ENVIADA", c.rng.int(10, 20));
      p.support = Math.min(0.95, p.support + 0.08);
      fx.schedule("gab_resposta", diffDays(p.next!, c.date), { pid: p.id });
      return "Indicação enviada, com números que dificultam dizer não.";
    }
    const p = newProposal(c.ctx, c.p, c.st, spec, "PROTOCOLADA", c.rng.int(12, 25));
    p.support = Math.min(0.95, p.support + 0.08);
    fx.capital(-2);
    fx.schedule("gab_comissao", diffDays(p.next!, c.date), { pid: p.id });
    return "Projeto protocolado com estudo técnico anexado. Os colegas notaram o capricho.";
  },
  fallback: "arquivar",
};

// ------------------------------------------------------------------ indicação

const gab_resposta: EventDef = {
  id: "gab_resposta",
  kind: "DECISAO",
  tags: ["MANDATO"],
  chained: true,
  expires: 6,
  when: (c, d) => {
    const p = d ? prop(c, d) : undefined;
    if (!p || p.stage !== "ENVIADA" || !c.p.office_code) return null;
    return { pid: p.id, ok: c.roll(p.support) ? 1 : 0 };
  },
  render: (c, b) => {
    const p = prop(c, b)!;
    const ok = Number(b.ok) === 1;
    return {
      title: ok ? `Atendido: ${p.title}` : `Negado: ${p.title}`,
      text: ok
        ? `${executive(c).replace(/^./, (x) => x.toUpperCase())} respondeu à sua indicação: vai fazer. ${p.bairro ? `No ${p.bairro}, já tem gente comemorando.` : ""}`
        : `${executive(c).replace(/^./, (x) => x.toUpperCase())} respondeu que "não há previsão orçamentária". ${p.from} quer saber o que você vai fazer.`,
      choices: ok
        ? [
            { id: "festa", label: "Ir até lá com os moradores ver o serviço começar", hint: "Foto, abraço e voto", tone: "safe" as const, cost: { energy: 8 } },
            { id: "discreto", label: "Agradecer nas redes e seguir", tone: "neutral" as const },
          ]
        : [
            { id: "insistir", label: "Insistir com um novo ofício e uma audiência", hint: "Uma segunda chance", tone: "bold" as const, cost: { energy: 10 } },
            { id: "tribuna", label: "Denunciar o descaso na tribuna", hint: "Visibilidade; atrito com quem governa", tone: "risky" as const },
            { id: "aceitar", label: "Explicar aos moradores e deixar quieto", tone: "neutral" as const },
          ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const p = prop(c, b)!;
    const ok = Number(b.ok) === 1;
    if (ok) {
      finishProposal(p, c.date, "ATENDIDA", "O Executivo atendeu à indicação.");
      fx.approval(p.impact + (choice === "festa" ? 0.8 : 0), `Indicação atendida: ${p.title.toLowerCase()}`);
      fx.reputation(p.impact / 2);
      if (p.from_id) fx.rel(p.from_id, 10);
      if (choice === "festa") fx.visibility(1);
      return choice === "festa" ? "Você chegou junto com a equipe da obra. Teve abraço, foto e promessa de voto." : "Serviço começando. Os moradores sabem a quem agradecer.";
    }
    if (choice === "insistir" && !c.flag(`gab_insistiu:${p.id}`)) {
      fx.flag(`gab_insistiu:${p.id}`, true);
      p.support = Math.min(0.95, p.support + 0.2);
      advanceProposal(p, c.date, "ENVIADA", c.rng.int(15, 25), "Novo ofício e audiência pedida.");
      fx.schedule("gab_resposta", diffDays(p.next!, c.date), { pid: p.id });
      return "Ofício novo, audiência marcada. Desta vez o secretário prometeu olhar com carinho.";
    }
    finishProposal(p, c.date, "NEGADA", "O Executivo negou a indicação.");
    if (choice === "tribuna") {
      fx.visibility(2);
      fx.approval(0.6, "Cobrou na tribuna o pedido negado");
      fx.capital(-2);
      return "Seu discurso viralizou nos grupos do bairro. Quem governa não gostou nada.";
    }
    if (p.from_id) fx.rel(p.from_id, -3);
    fx.approval(-0.4, `Pedido negado: ${p.title.toLowerCase()}`);
    return "Você explicou a situação. Uns entenderam; outros acharam que faltou empenho.";
  },
  fallback: "aceitar",
};

// ------------------------------------------------------------------ projeto de lei

const gab_comissao: EventDef = {
  id: "gab_comissao",
  kind: "DECISAO",
  tags: ["MANDATO", "BASTIDORES"],
  chained: true,
  expires: 6,
  when: (c, d) => {
    const p = d ? prop(c, d) : undefined;
    return p && p.stage === "PROTOCOLADA" && c.p.office_code && LEGIS.has(c.p.office_code) ? { pid: p.id } : null;
  },
  render: (c, b) => {
    const p = prop(c, b)!;
    return {
      title: `Na comissão: ${p.title}`,
      text: `Seu projeto chegou à Comissão de Constituição e Justiça da ${house(c)}. O relator ainda não decidiu o parecer. Chance atual de aprovação: ${Math.round(p.support * 100)}%.`,
      choices: [
        { id: "relator", label: "Articular com o relator", hint: "Gasta capital político; aumenta a chance", tone: "safe" as const, cost: { energy: 10 } },
        { id: "emendas", label: "Aceitar emendas que mudam o texto", hint: "Passa mais fácil; rende menos", tone: "neutral" as const },
        { id: "redes", label: "Fazer barulho nas redes", hint: "Pressão de fora; colegas torcem o nariz", tone: "bold" as const, cost: { energy: 6 } },
        { id: "rito", label: "Deixar seguir o rito", tone: "neutral" as const },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const p = prop(c, b)!;
    let msg = "O projeto seguiu o rito, sem pressa.";
    if (choice === "relator") {
      fx.capital(-4);
      p.support = Math.min(0.95, p.support + 0.15);
      msg = "Um café, duas conversas e um parecer favorável prometido.";
    } else if (choice === "emendas") {
      p.amended = true;
      p.support = Math.min(0.95, p.support + 0.22);
      p.impact = Math.round(p.impact * 0.6 * 10) / 10;
      msg = "Você aceitou as emendas. O texto ficou mais tímido, mas agora passa.";
    } else if (choice === "redes") {
      fx.visibility(2);
      fx.approval(0.5, `Defendeu nas redes: ${p.title.toLowerCase()}`);
      p.support = Math.min(0.95, p.support + 0.06);
      msg = "O vídeo rodou. Na comissão, alguns colegas acharam que foi pressão demais.";
    }
    advanceProposal(p, c.date, "COMISSAO", c.rng.int(20, 42), "Parecer na comissão.");
    fx.schedule("gab_plenario", diffDays(p.next!, c.date), { pid: p.id });
    return msg;
  },
  fallback: "rito",
};

const gab_plenario: EventDef = {
  id: "gab_plenario",
  kind: "DECISAO",
  tags: ["MANDATO"],
  chained: true,
  expires: 5,
  when: (c, d) => {
    const p = d ? prop(c, d) : undefined;
    return p && p.stage === "COMISSAO" && c.p.office_code && LEGIS.has(c.p.office_code) ? { pid: p.id } : null;
  },
  render: (c, b) => {
    const p = prop(c, b)!;
    return {
      title: `Votação em plenário: ${p.title}`,
      text: `Seu projeto entrou na pauta da ${house(c)}. A contagem de votos da sua equipe dá ${Math.round(p.support * 100)}% de chance. Dá para mexer nisso antes do painel abrir.`,
      choices: [
        { id: "negociar", label: "Negociar votos com outras bancadas", hint: "Apoio em troca de apoio (capital político)", tone: "neutral" as const },
        { id: "galeria", label: "Lotar a galeria com quem pediu o projeto", hint: "Pressão popular na hora do voto", tone: "bold" as const, cost: { energy: 15 } },
        ...(c.flag(`gab_adiou:${p.id}`) ? [] : [{ id: "adiar", label: "Pedir adiamento para ganhar tempo", hint: "Volta à pauta em algumas semanas", tone: "safe" as const }]),
        { id: "votar", label: "Ir para o voto assim", tone: "neutral" as const },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const p = prop(c, b)!;
    if (choice === "adiar") {
      fx.flag(`gab_adiou:${p.id}`, true);
      p.support = Math.min(0.95, p.support + 0.05);
      advanceProposal(p, c.date, "COMISSAO", c.rng.int(18, 30), "Votação adiada.");
      fx.schedule("gab_plenario", diffDays(p.next!, c.date), { pid: p.id });
      return "Votação adiada. Você ganhou tempo para contar votos.";
    }
    if (choice === "negociar") {
      fx.capital(-6);
      p.support = Math.min(0.95, p.support + 0.15);
    } else if (choice === "galeria") {
      p.support = Math.min(0.95, p.support + 0.08);
      fx.approval(0.8, "Lotou a galeria com os apoiadores do projeto");
    }
    if (c.roll(p.support)) {
      advanceProposal(p, c.date, "SANCAO", c.rng.int(7, 16), "Aprovado em plenário.");
      fx.reputation(1);
      fx.schedule("gab_sancao", diffDays(p.next!, c.date), { pid: p.id });
      return `Aprovado! O painel acendeu verde e ${choice === "galeria" ? "a galeria explodiu em aplausos" : "seus colegas vieram cumprimentar"}. Agora vai para ${executive(c)} sancionar.`;
    }
    finishProposal(p, c.date, "REJEITADA", "Rejeitado em plenário.");
    fx.approval(-1, `Projeto rejeitado: ${p.title.toLowerCase()}`);
    fx.reputation(-0.5);
    if (p.from_id) fx.rel(p.from_id, -2);
    return "Rejeitado. Faltaram votos — e sobraram explicações para dar a quem pediu.";
  },
  fallback: "votar",
};

const gab_sancao: EventDef = {
  id: "gab_sancao",
  kind: "DECISAO",
  tags: ["MANDATO"],
  chained: true,
  expires: 6,
  when: (c, d) => {
    const p = d ? prop(c, d) : undefined;
    if (!p || p.stage !== "SANCAO" || !c.p.office_code) return null;
    return { pid: p.id, ok: c.roll(sanctionChance(c)) ? 1 : 0 };
  },
  render: (c, b) => {
    const p = prop(c, b)!;
    const ok = Number(b.ok) === 1;
    return {
      title: ok ? `Virou lei: ${p.title}` : `Vetado: ${p.title}`,
      text: ok
        ? `${executive(c).replace(/^./, (x) => x.toUpperCase())} sancionou. Seu projeto agora é lei${p.amended ? " (com as emendas)" : ""}. Como você quer marcar o momento?`
        : `${executive(c).replace(/^./, (x) => x.toUpperCase())} vetou o projeto alegando "vício de iniciativa e impacto orçamentário". O veto volta para a ${house(c)}.`,
      choices: ok
        ? [
            { id: "festa", label: "Ato público com quem pediu a lei", hint: "Comemoração e voto", tone: "safe" as const, cost: { energy: 8 } },
            { id: "redes", label: "Explicar a lei nas redes", tone: "neutral" as const },
          ]
        : [
            { id: "derrubar", label: "Trabalhar para derrubar o veto", hint: "Capital político; meio a meio", tone: "bold" as const },
            { id: "imprensa", label: "Ir à imprensa contra o veto", hint: "Visibilidade; atrito com quem governa", tone: "risky" as const },
            { id: "aceitar", label: "Aceitar o veto", tone: "neutral" as const },
          ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const p = prop(c, b)!;
    const ok = Number(b.ok) === 1;
    const lei = () => {
      finishProposal(p, c.date, "LEI", "Sancionado: virou lei.");
      fx.approval(p.impact, `Lei aprovada: ${p.title.toLowerCase()}`);
      fx.reputation(p.impact / 2);
      if (p.from_id) fx.rel(p.from_id, 12);
      fx.bump("leis");
      fx.news(`Lei de autoria de ${c.p.name} é sancionada`, `${p.title}: a proposta, que começou com um pedido de ${p.from.toLowerCase()}, agora é lei.`);
      fx.schedule("gab_lei_pegou", [60, 120], { pid: p.id });
    };
    if (ok) {
      lei();
      if (choice === "festa") {
        fx.approval(0.8, "Ato público pela nova lei");
        fx.visibility(1);
      }
      return choice === "festa" ? "Ato lotado, discurso emocionado, a lei impressa em letras grandes. Vai entrar no seu santinho." : "Você explicou a lei em um vídeo curto. Choveram mensagens de quem vai ser beneficiado.";
    }
    if (choice === "derrubar") {
      fx.capital(-6);
      if (c.roll(0.45 + (p.support - 0.5) * 0.3)) {
        lei();
        return "Veto derrubado! Seus colegas ficaram do seu lado contra o Executivo.";
      }
      finishProposal(p, c.date, "VETADA", "Veto mantido.");
      fx.approval(-0.5, `Veto mantido: ${p.title.toLowerCase()}`);
      return "O veto foi mantido por poucos votos. Fica para a próxima.";
    }
    finishProposal(p, c.date, "VETADA", "Vetado pelo Executivo.");
    if (choice === "imprensa") {
      fx.visibility(2);
      fx.approval(0.4, "Criticou o veto na imprensa");
      return "As entrevistas repercutiram. Quem governa anotou seu nome na lista dos críticos.";
    }
    fx.approval(-0.6, `Projeto vetado: ${p.title.toLowerCase()}`);
    return "Você aceitou o veto. Quem pediu o projeto ficou frustrado.";
  },
  fallback: "aceitar",
};

const gab_lei_pegou: EventDef = {
  id: "gab_lei_pegou",
  kind: "DECISAO",
  tags: ["MANDATO"],
  chained: true,
  expires: 8,
  when: (c, d) => {
    const p = d ? prop(c, d) : undefined;
    return p && (p.result === "LEI" || p.result === "INAUGURADA") && c.p.office_code ? { pid: p.id } : null;
  },
  render: (c, b) => {
    const p = prop(c, b)!;
    return {
      title: `${p.result === "LEI" ? "A lei pegou?" : "A obra está funcionando?"} ${p.title}`,
      text: p.result === "LEI" ? `Faz alguns meses que a lei está em vigor. ${p.from} conta que, na prática, metade do que foi aprovado ainda não saiu do papel.` : `Meses depois da entrega, ${p.from.toLowerCase()} manda fotos: está funcionando, mas falta manutenção.`,
      choices: [
        { id: "fiscalizar", label: "Ir conferir e cobrar quem é responsável", hint: "Trabalho de formiga; aprovação", tone: "safe" as const, cost: { energy: 10 } },
        { id: "divulgar", label: "Fazer uma campanha para o povo conhecer seus direitos", hint: "Custa dinheiro; aparece", tone: "bold" as const, cost: { money: c.money(1500) } },
        { id: "deixar", label: "Deixar com o Executivo", hint: "Risco de virar \"lei que não pegou\"", tone: "neutral" as const },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const p = prop(c, b)!;
    if (choice === "fiscalizar") {
      fx.approval(1.5, `Cobrou a aplicação: ${p.title.toLowerCase()}`);
      return "Você apareceu sem avisar, fotografou, cobrou. Em duas semanas, as coisas andaram.";
    }
    if (choice === "divulgar") {
      fx.approval(1, `Divulgou a nova lei: ${p.title.toLowerCase()}`);
      fx.visibility(1);
      return "Panfleto, vídeo e carro de som. Agora todo mundo sabe que a lei existe — e quem fez.";
    }
    if (c.roll(0.4)) {
      fx.approval(-1, `"Lei que não pegou": ${p.title.toLowerCase()}`);
      return "Um jornal local publicou: mais uma lei que não pegou. Seu nome estava na matéria.";
    }
    return "A coisa foi andando, devagar, sem você.";
  },
  fallback: "deixar",
};

// ------------------------------------------------------------------ obra (Executivo)

const gab_licitacao: EventDef = {
  id: "gab_licitacao",
  kind: "DECISAO",
  tags: ["MANDATO", "BASTIDORES"],
  chained: true,
  expires: 6,
  when: (c, d) => {
    const p = d ? prop(c, d) : undefined;
    return p && p.stage === "ESTUDO" && c.p.office_code && !LEGIS.has(c.p.office_code) ? { pid: p.id } : null;
  },
  render: (c, b) => {
    const p = prop(c, b)!;
    return {
      title: `Licitação: ${p.title}`,
      text: `O projeto está pronto e a obra precisa de empresa. A procuradoria lembra dos prazos legais; um empresário conhecido manda recado de que "resolve rápido".`,
      choices: [
        { id: "aberta", label: "Licitação aberta e transparente", hint: "Mais lenta e segura", tone: "safe" as const },
        { id: "emergencial", label: "Contratação emergencial, mais rápida", hint: "Obra antes; órgãos de controle de olho", tone: "risky" as const },
        { id: "amigo", label: "Direcionar para a empresa do conhecido, com sobrepreço", hint: "Dinheiro por fora: fraude em licitação", tone: "illegal" as const },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const p = prop(c, b)!;
    if (choice === "amigo") {
      const amount = c.money(scopeOf(c.p.office_code!) === "MUNICIPAL" ? 120_000 : 600_000);
      fx.illicit("FRAUDE_LICITACAO", { amount, description: `Licitação direcionada: ${p.title}`, witnesses: 4, paperTrail: 0.55 });
      fx.dirty(Math.round(amount * 0.25));
      advanceProposal(p, c.date, "OBRA", c.rng.int(50, 90), "Contrato assinado (com sobrepreço).");
      fx.schedule("gab_obra", diffDays(p.next!, c.date) - c.rng.int(15, 30), { pid: p.id });
      return "Contrato assinado em tempo recorde. Uma parte do valor vai voltar para você — e para o rastro.";
    }
    if (choice === "emergencial") {
      fx.scandal(3);
      advanceProposal(p, c.date, "OBRA", c.rng.int(60, 100), "Contratação emergencial.");
    } else {
      advanceProposal(p, c.date, "OBRA", c.rng.int(80, 130), "Licitação concluída.");
      fx.reputation(0.5);
    }
    fx.schedule("gab_obra", Math.max(10, diffDays(p.next!, c.date) - c.rng.int(20, 40)), { pid: p.id });
    return choice === "emergencial" ? "Máquinas no canteiro em semanas. O Tribunal de Contas pediu os documentos." : "Licitação feita dentro da lei. Mais lenta, sem susto.";
  },
  fallback: "aberta",
};

const OBRA_PROBLEMAS = [
  { key: "aditivo", text: "A empreiteira pede um aditivo de 25% no contrato: \"o preço do aço subiu\"." },
  { key: "chuva", text: "Semanas de chuva atrasaram tudo. Os moradores reclamam da lama e do barulho." },
  { key: "protesto", text: "Um grupo de moradores protesta: a obra vai derrubar árvores antigas da rua." },
  { key: "abandono", text: "Os operários sumiram do canteiro: a empresa está atrasando salários." },
];

const gab_obra: EventDef = {
  id: "gab_obra",
  kind: "DECISAO",
  tags: ["MANDATO"],
  chained: true,
  expires: 6,
  when: (c, d) => {
    const p = d ? prop(c, d) : undefined;
    if (!p || p.stage !== "OBRA" || !c.p.office_code) return null;
    return { pid: p.id, prob: c.rng.pick(OBRA_PROBLEMAS).key };
  },
  render: (c, b) => {
    const p = prop(c, b)!;
    const pr = OBRA_PROBLEMAS.find((x) => x.key === b.prob)!;
    return {
      title: `Problema na obra: ${p.title}`,
      text: pr.text,
      choices: [
        { id: "resolver", label: "Ir ao canteiro e resolver pessoalmente", hint: "Gasta energia; a obra anda", tone: "safe" as const, cost: { energy: 15 } },
        { id: "ceder", label: pr.key === "aditivo" ? "Aceitar o aditivo" : "Aceitar o atraso e explicar à população", hint: pr.key === "aditivo" ? "Obra garantida; custo maior" : "Honesto; obra mais demorada", tone: "neutral" as const },
        { id: "endurecer", label: pr.key === "aditivo" ? "Negar o aditivo e ameaçar multar a empresa" : "Trocar a empresa", hint: "Pode atrasar mais", tone: "bold" as const },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const p = prop(c, b)!;
    let extra = 0;
    let msg = "";
    if (choice === "resolver") {
      fx.approval(0.6, `Foi ao canteiro: ${p.title.toLowerCase()}`);
      msg = "Capacete na cabeça, reunião no canteiro, cronograma refeito. A obra voltou a andar.";
    } else if (choice === "ceder") {
      extra = c.rng.int(15, 30);
      if (b.prob === "aditivo") fx.scandal(1);
      msg = b.prob === "aditivo" ? "Aditivo assinado. A oposição já pediu as notas." : "Você explicou o atraso. A paciência dos moradores tem prazo.";
    } else {
      extra = c.rng.int(10, 35);
      fx.reputation(0.5);
      msg = "Postura firme. A empresa recuou em parte, mas a obra perdeu semanas.";
    }
    advanceProposal(p, c.date, "OBRA", Math.max(10, diffDays(p.next ?? addDays(c.date, 30), c.date) + extra), "Obra em andamento.");
    fx.schedule("gab_inauguracao", diffDays(p.next!, c.date), { pid: p.id });
    return msg;
  },
  fallback: "ceder",
};

const gab_inauguracao: EventDef = {
  id: "gab_inauguracao",
  kind: "DECISAO",
  tags: ["MANDATO"],
  chained: true,
  milestone: true,
  expires: 6,
  when: (c, d) => {
    const p = d ? prop(c, d) : undefined;
    return p && p.stage === "OBRA" && c.p.office_code ? { pid: p.id } : null;
  },
  render: (c, b) => {
    const p = prop(c, b)!;
    // Lei 9.504/97, art. 77: candidato não pode ir a inauguração nos 3 meses antes da eleição
    const days = c.daysToVote;
    const vedado = c.cand && days != null && days <= 90;
    return {
      title: `Pronto: ${p.title}`,
      text: `A obra ficou pronta. ${p.from} pergunta como vai ser a entrega.${vedado ? " Atenção: você é candidato(a) e faltam menos de três meses para a eleição — a lei proíbe comparecer a inaugurações." : ""}`,
      choices: [
        { id: "festa", label: "Grande inauguração com placa e discurso", hint: "Rende muito; custa dinheiro", tone: "bold" as const, cost: { money: c.money(4000) }, requires: () => (vedado ? "Vedado a candidatos nos 3 meses antes da eleição." : null) },
        { id: "moradores", label: "Entregar junto com os moradores que pediram", hint: "Simples e simbólico", tone: "safe" as const, requires: () => (vedado ? "Vedado a candidatos nos 3 meses antes da eleição." : null) },
        { id: "sem_ato", label: "Entregar sem cerimônia", tone: "neutral" as const },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const p = prop(c, b)!;
    finishProposal(p, c.date, "INAUGURADA", "Obra entregue.");
    const bonus = choice === "festa" ? 1.2 : choice === "moradores" ? 0.8 : 0;
    fx.approval(p.impact + bonus, `Obra entregue: ${p.title.toLowerCase()}`);
    fx.reputation(p.impact / 2);
    if (p.from_id) fx.rel(p.from_id, 12);
    fx.bump("obras");
    fx.news(`${OFFICES[c.p.office_code!].name} ${c.p.name} entrega: ${p.title.toLowerCase()}`, `A obra pedida por ${p.from.toLowerCase()} foi concluída.`);
    fx.schedule("gab_lei_pegou", [70, 140], { pid: p.id });
    if (choice === "festa") {
      fx.visibility(2);
      return "Fita cortada, placa descerrada, banda tocando. Seu nome ficou gravado no bronze.";
    }
    return choice === "moradores" ? "Quem pediu a obra cortou a fita com você. A foto vale mais que qualquer propaganda." : "Obra entregue sem festa. Quem usa sabe quem fez.";
  },
  fallback: "sem_ato",
};

export const GABINETE_EVENTS: EventDef[] = [gab_chegou, gab_estudo_pronto, gab_resposta, gab_comissao, gab_plenario, gab_sancao, gab_lei_pegou, gab_licitacao, gab_obra, gab_inauguracao];
