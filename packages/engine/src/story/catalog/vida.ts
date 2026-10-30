import { diffDays, year } from "../../calendar";
import type { PersonRow } from "../../types";
import type { EventDef } from "../def";
import { endCareer } from "../life";
import { bestContact, brl, first } from "./util";

/**
 * A vida fora do palanque: aniversários, família, cansaço, saúde e, um dia, a
 * hora de parar. A saúde pesa na energia e na chance de morrer — e a política
 * desgasta.
 */

/** Aniversário estável do personagem (o cadastro só guarda o ano). */
export function birthdayOf(p: PersonRow): string {
  let h = 0;
  for (let i = 0; i < p.id.length; i++) h = (Math.imul(h, 31) + p.id.charCodeAt(i)) | 0;
  const d = new Date(Date.UTC(2001, 0, 1) + (Math.abs(h) % 365) * 86_400_000);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function healthWord(h: number): string {
  return h >= 80 ? "ótima" : h >= 65 ? "boa" : h >= 50 ? "razoável" : h >= 35 ? "frágil" : "muito frágil";
}

const aniversario: EventDef = {
  id: "aniversario",
  kind: "OPORTUNIDADE",
  tags: ["VIDA"],
  weight: 40,
  cooldown: 300,
  expires: 3,
  when: (c) => {
    const today = c.date.slice(5);
    const bd = birthdayOf(c.p);
    const thisYear = `${year(c.date)}-${bd}`;
    const delta = diffDays(c.date, thisYear);
    if (delta < 0 || delta > 2 || c.flag(`aniv:${year(c.date)}`)) return null;
    return { age: c.age, today };
  },
  render: (c, b) => {
    const allies = [...c.ctx.t.relationships.values()].filter((r) => r.a_id === c.p.id && r.score >= 30).length;
    return {
      title: `${b.age} anos`,
      text: `Hoje é seu aniversário: ${b.age} anos. Sua saúde está ${healthWord(c.s.health)}. ${allies ? `${allies} pessoa(s) da política mandaram mensagem antes do café.` : "O celular amanheceu com mensagens da família."} Como você quer comemorar?`,
      choices: [
        { id: "festa", label: "Festa com amigos, aliados e apoiadores", hint: "Fortalece relações", tone: "bold", cost: { money: c.money(1500) } },
        { id: "familia", label: "Jantar só com a família", hint: "Descanso de verdade", tone: "safe" },
        { id: "trabalho", label: "Trabalhar normalmente", tone: "neutral" },
      ],
    };
  },
  resolve: (c, _b, choice, fx) => {
    fx.flag(`aniv:${year(c.date)}`, c.date);
    if (choice === "festa") {
      fx.money(-c.money(1500), "Festa de aniversário");
      for (const r of [...c.ctx.t.relationships.values()].filter((x) => x.a_id === c.p.id && x.score >= 20).slice(0, 6)) fx.rel(r.b_id, 3);
      fx.energy(-5);
      return "Casa cheia, bolo de padaria e um discurso improvisado que fez metade da sala rir e a outra chorar.";
    }
    if (choice === "familia") {
      fx.health(2);
      fx.energy(15);
      return "Uma noite sem celular, com quem estava com você antes da política. Você lembrou por que começou.";
    }
    return "Você passou o dia em reuniões. Só lembrou do aniversário quando o bolo apareceu na sala.";
  },
  fallback: "trabalho",
};

const familia_cobra: EventDef = {
  id: "familia_cobra",
  kind: "DECISAO",
  tags: ["VIDA"],
  cooldown: 160,
  expires: 3,
  when: (c) => (c.phase || c.p.office_code || c.st.energy < 30 ? { who: c.rng.pick(["Sua mãe", "Seu irmão", "Seu filho mais velho", "Sua companheira", "Seu companheiro"]) } : null),
  render: (c, b) => ({
    title: "Você nunca está em casa",
    text: `${b.who} cobra, sem rodeios: "Faz um mês que você não janta com a gente. A política vai te engolir." Não é a primeira vez que você ouve isso — mas é a primeira vez com essa voz.`,
    choices: [
      { id: "folga", label: "Tirar um fim de semana inteiro com a família", hint: "Saúde e energia; agenda parada", tone: "safe" },
      { id: "prometer", label: "Prometer que depois desta fase melhora", hint: "Promessa que alguém vai lembrar", tone: "neutral" },
      { id: "seguir", label: "Seguir no ritmo", hint: "Desgaste", tone: "risky" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "folga") {
      fx.health(3);
      fx.energy(30);
      if (c.cand) fx.momentum(-0.01, "fim de semana fora da campanha");
      return "Dois dias sem agenda. Na segunda, você voltou com outra cara.";
    }
    if (choice === "prometer") {
      fx.flag("promessa_familia", c.date);
      fx.health(-1);
      return "\"Depois da eleição.\" Você já disse isso antes.";
    }
    fx.health(-3);
    return "Você seguiu. A cobrança ficou guardada na garganta de alguém.";
  },
  fallback: "seguir",
};

const estresse: EventDef = {
  id: "estresse",
  kind: "DECISAO",
  tags: ["SAUDE", "VIDA"],
  cooldown: 120,
  expires: 3,
  when: (c) => (c.s.health < 62 || ((c.phase === "CAMPANHA" || c.phase === "RETA_FINAL") && c.st.energy < 35) ? {} : null),
  weightFn: (c) => (c.s.health < 50 ? 2 : 1),
  render: (c) => ({
    title: "O corpo está cobrando",
    text: `Insônia, dor de cabeça, irritação com quem não merece. Sua saúde está ${healthWord(c.s.health)} e a energia não volta como antes. A médica foi direta: "Ou você desacelera, ou o corpo desacelera você."`,
    choices: [
      { id: "folga", label: "Tirar uma semana de folga", hint: "Saúde e energia; tudo parado", tone: "safe" },
      { id: "terapia", label: "Começar terapia e atividade física", hint: "Melhora aos poucos; custa todo mês", tone: "bold", cost: { money: c.money(900) } },
      { id: "seguir", label: "Seguir no ritmo", hint: "Saúde em queda", tone: "risky" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "folga") {
      fx.health(6);
      fx.energy(40);
      if (c.cand) fx.momentum(-0.02, "uma semana fora da campanha");
      return "Uma semana de sono, caminhada e comida de verdade. Ninguém ganhou eleição dormindo — mas ninguém ganha doente.";
    }
    if (choice === "terapia") {
      fx.money(-c.money(900), "Terapia e academia");
      fx.health(4);
      fx.flag("cuida_da_saude", c.date);
      return "Duas sessões por semana e caminhada às seis da manhã. Aos poucos, o sono voltou.";
    }
    fx.health(-4);
    if (c.s.health < 40) fx.schedule("mal_estar", [3, 20], {});
    return "Você tomou um remédio para dor de cabeça e foi para a próxima reunião.";
  },
  fallback: "seguir",
};

const checkup: EventDef = {
  id: "checkup",
  kind: "OPORTUNIDADE",
  tags: ["SAUDE"],
  cooldown: 330,
  expires: 20,
  when: (c) => (c.age >= 38 ? {} : null),
  weightFn: (c) => (c.age >= 55 ? 1.6 : 0.8),
  render: (c) => ({
    title: "Exames de rotina",
    text: `Seu médico insiste: aos ${c.age} anos, o check-up anual não é opcional. É meio dia de exames — e o medo de descobrir alguma coisa.`,
    choices: [
      { id: "fazer", label: "Fazer os exames", hint: "Descobrir cedo muda tudo", tone: "safe", cost: { money: c.money(700), energy: 8 } },
      { id: "adiar", label: "Deixar para depois", tone: "risky" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "fazer") {
      fx.money(-c.money(700), "Check-up médico");
      fx.energy(-8);
      fx.flag("ultimo_checkup", c.date);
      if (c.s.health < 58 || (c.age >= 55 && c.roll(0.25))) {
        fx.schedule("diagnostico", [3, 8], { early: 1 });
        return "Um dos exames veio alterado. O médico pediu para conversar pessoalmente.";
      }
      fx.health(2);
      return "Tudo dentro do esperado. O médico recomendou menos café e mais caminhada.";
    }
    fx.bump("checkups_adiados");
    if (c.s.health < 50 && c.roll(0.35)) fx.schedule("mal_estar", [20, 90], {});
    return "Fica para o mês que vem. (Você disse isso no ano passado.)";
  },
  fallback: "adiar",
};

const DIAGNOSES = [
  { k: "pressao", t: "hipertensão", sev: 1 },
  { k: "diabetes", t: "diabetes tipo 2", sev: 1 },
  { k: "coracao", t: "um problema nas coronárias", sev: 2 },
  { k: "tumor", t: "um tumor em estágio inicial", sev: 3 },
];

const diagnostico: EventDef = {
  id: "diagnostico",
  kind: "DECISAO",
  tags: ["SAUDE"],
  chained: true,
  milestone: true,
  expires: 5,
  when: (c, d) => {
    const pool = DIAGNOSES.filter((x) => x.sev <= (c.age >= 60 ? 3 : c.age >= 45 ? 2 : 1));
    const dx = c.rng.pick(pool);
    return { early: Number(d?.early ?? 0), k: dx.k, t: dx.t, sev: dx.sev };
  },
  render: (c, b) => ({
    title: "Um diagnóstico",
    text: `O médico fecha a porta antes de falar: ${b.t}. ${Number(b.early) ? "A boa notícia é que foi descoberto cedo." : "Poderia ter sido descoberto antes."} ${Number(b.sev) >= 3 ? "O tratamento é longo e vai exigir pausas." : "Com tratamento e mudança de hábitos, dá para levar uma vida normal."} ${c.p.office_code || c.cand ? "Você é uma figura pública: a notícia vai vazar, cedo ou tarde." : ""}`,
    choices: [
      { id: "tratar", label: "Seguir o tratamento à risca, mesmo que atrase a política", hint: "Saúde em primeiro lugar", tone: "safe", cost: { money: c.money(4000) } },
      { id: "conciliar", label: "Tratar sem parar de trabalhar", hint: "Meio-termo", tone: "neutral", cost: { money: c.money(2000) } },
      ...(c.p.office_code || c.cand ? [{ id: "publico", label: "Tornar público e falar abertamente", hint: "Empatia; adversários exploram", tone: "bold" as const, cost: { money: c.money(4000) } }] : []),
    ],
  }),
  resolve: (c, b, choice, fx) => {
    const sev = Number(b.sev);
    fx.flag("diagnostico", String(b.k));
    if (choice === "tratar" || choice === "publico") {
      fx.money(-c.money(4000), "Tratamento médico");
      fx.health(sev >= 3 ? 4 : 8);
      fx.energy(-20);
      if (c.cand) fx.momentum(-0.02, "pausa para tratamento de saúde");
      if (choice === "publico") {
        fx.reputation(2);
        fx.visibility(3);
        return "Seu vídeo contando o diagnóstico emocionou muita gente. Choveram mensagens de força — inclusive de adversários.";
      }
      return "Remédio na hora certa, consultas em dia, menos agenda. O corpo agradeceu.";
    }
    fx.money(-c.money(2000), "Tratamento médico");
    fx.health(sev >= 3 ? 0 : 3);
    if (sev >= 2 && c.roll(0.3)) fx.schedule("mal_estar", [30, 120], {});
    return "Você encaixou o tratamento entre uma reunião e outra. Funciona — quando você lembra.";
  },
  fallback: "conciliar",
};

const mal_estar: EventDef = {
  id: "mal_estar",
  kind: "INFO",
  tags: ["SAUDE"],
  chained: true,
  blocking: true,
  milestone: true,
  when: () => ({}),
  render: () => ({
    title: "Internação às pressas",
    text: "Você passou mal no meio de uma reunião e foi levado(a) às pressas para o hospital. Foram três dias internado(a). Os médicos foram claros: foi um aviso.",
    choices: [{ id: "ok", label: "Entendi o aviso" }],
  }),
  resolve: (c, _b, _choice, fx) => {
    fx.health(-8);
    fx.energy(-40);
    fx.money(-c.money(3000), "Despesas hospitalares");
    if (c.cand) fx.momentum(-0.03, "internação");
    fx.schedule("diagnostico", [2, 5], { early: 0 });
    return "Três dias de hospital, uma semana de repouso e uma pilha de exames para fazer.";
  },
};

const ferias: EventDef = {
  id: "ferias",
  kind: "OPORTUNIDADE",
  tags: ["VIDA"],
  cooldown: 300,
  expires: 15,
  when: (c) => (c.phase ? null : { place: c.rng.pick(["o litoral", "a serra", "a casa de parentes no interior", "uma viagem curta para outro estado"]) }),
  render: (c, b) => ({
    title: "Férias?",
    text: `Faz tempo que você não tira férias de verdade. Uma semana em ${b.place} sairia por ${brl(c.money(3500))}. A política não para — mas você pode.`,
    choices: [
      { id: "ir", label: "Ir e desligar o celular", hint: "Saúde e energia", tone: "safe", cost: { money: c.money(3500) } },
      { id: "nao", label: "Deixar para outro ano", tone: "neutral" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "ir") {
      fx.money(-c.money(3500), "Férias");
      fx.health(5);
      fx.energy(40);
      return "Uma semana sem grupo de WhatsApp. Você voltou com ideias novas e o sono em dia.";
    }
    return "As férias ficaram para depois. Sempre ficam.";
  },
  fallback: "nao",
};

const pensar_aposentadoria: EventDef = {
  id: "pensar_aposentadoria",
  kind: "DECISAO",
  tags: ["VIDA"],
  cooldown: 365,
  expires: 7,
  when: (c) => (c.age >= 68 || (c.age >= 55 && c.s.health < 32) ? {} : null),
  weightFn: (c) => (c.age >= 75 ? 2 : 1),
  render: (c) => {
    const heir = bestContact(c, 45);
    return {
      title: "Hora de parar?",
      text: `Aos ${c.age} anos, com a saúde ${healthWord(c.s.health)}, a família pede que você pense em deixar a vida pública. ${heir ? `${heir.name} seria um nome natural para herdar seus votos.` : "Ninguém está pronto para herdar seus votos."} Parar agora encerra a carreira — e o jogo com este personagem.`,
      choices: [
        { id: "seguir", label: "Seguir na vida pública", hint: "A carreira continua", tone: "bold" },
        { id: "aposentar", label: "Anunciar a aposentadoria", hint: "Encerra a carreira com um balanço de tudo o que você fez", tone: "safe" },
      ],
    };
  },
  resolve: (c, _b, choice, fx) => {
    if (choice === "aposentar") {
      const heir = bestContact(c, 45);
      if (heir) fx.rel(heir.id, 10);
      endCareer(c, "APOSENTADORIA", "aposentadoria anunciada");
      return `Você anunciou a aposentadoria${heir ? ` e pediu aos seus eleitores que confiem em ${first(heir)}` : ""}. Fim de uma trajetória.`;
    }
    fx.health(-1);
    return "\"Enquanto eu tiver voz, eu sigo.\" A família suspirou.";
  },
  fallback: "seguir",
};

export const LIFE_EVENTS: EventDef[] = [aniversario, familia_cobra, estresse, checkup, diagnostico, mal_estar, ferias, pensar_aposentadoria];
