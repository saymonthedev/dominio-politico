import { addDays, diffDays } from "../../calendar";
import { OFFICES } from "../../ruleset";
import { activeInjury, INJURIES } from "../../wellbeing";
import type { StoryCtx } from "../context";
import type { EventDef } from "../def";
import { AMIGOS, chefe_reclama, ev } from "./cotidiano";
import { brl, city } from "./util";

/**
 * Corpo, trabalho e transições da vida: o ultimato do chefe (a cobrança não fica
 * voltando igual — na segunda vez ele decide), a lesão do futebol, o esgotamento,
 * a volta à vida civil quando o mandato acaba.
 */

const semCargo = (c: StoryCtx) => !c.p.office_code;

// ------------------------------------------------------------------ o ultimato do chefe

const chefe_ultimato: EventDef = {
  id: "chefe_ultimato",
  kind: "DECISAO",
  tags: ["TRABALHO"],
  family: "patrao",
  cooldown: 365,
  max: 2,
  expires: 4,
  when: (c) => {
    if (!semCargo(c) || c.jornada <= 0) return null;
    const avisou = c.flag("chefe_avisou");
    if (typeof avisou !== "string" || diffDays(c.date, avisou) < 60 || c.flag("chefe_resolvido")) return null;
    if (c.st.activism < 10 && !c.p.party_id && !c.phase) return null;
    // o chefe decide: quem prometeu foco tem mais chance de ficar; campanha em curso pesa contra
    const focus = c.flag("foco_trabalho");
    const keep = c.roll((focus ? 0.62 : 0.3) + c.competence * 0.25 - (c.phase ? 0.2 : 0) - (c.jornada < 1 ? 0.05 : 0));
    return { keep: keep ? 1 : 0, boss: c.rng.pick(["Seu chefe", "A diretora", "O dono da empresa", "A coordenação"]) };
  },
  render: (c, b) => {
    const keep = Number(b.keep) === 1;
    return {
      title: keep ? "O chefe decidiu: você fica — com regras" : "Demitido(a)",
      text: keep
        ? `${b.boss} chama de novo, desta vez com o RH junto: "Você pode ficar, mas sem sair no meio do expediente e sem campanha no horário de trabalho. É a última conversa sobre isso."`
        : `${b.boss} foi direto(a): "Já conversamos. A empresa precisa de alguém com a cabeça aqui." O RH já tinha a carta pronta. Você está demitido(a) do emprego de ${c.professionLabel}.`,
      choices: keep
        ? [
            { id: "aceitar", label: "Aceitar as regras", hint: "Emprego garantido; menos tempo para a política", tone: "safe" as const },
            { id: "sair", label: "Pedir demissão e viver a política", hint: "Sem salário; todo o tempo para a política", tone: "risky" as const },
          ]
        : [
            { id: "direitos", label: "Assinar e receber os direitos", hint: "Rescisão, aviso prévio e FGTS", tone: "safe" as const },
            { id: "justica", label: "Assinar e entrar na Justiça do Trabalho", hint: "Pode render mais; cansa e demora", tone: "bold" as const, cost: { energy: 10 } },
            { id: "meio", label: "Propor ficar em meio período", hint: "Talvez aceitem", tone: "neutral" as const },
          ],
    };
  },
  resolve: (c, b, choice, fx) => {
    fx.flag("chefe_resolvido", c.date);
    if (Number(b.keep) === 1) {
      if (choice === "aceitar") {
        fx.flag("regras_trabalho", c.date);
        fx.activism(-3);
        return "Combinado. A política vai caber nas noites e nos fins de semana — e o emprego está seguro.";
      }
      fx.flag("jornada", 0);
      fx.energy(25);
      return "Você pediu demissão. Sem salário a partir de agora: a reserva vai ter que segurar.";
    }
    if (choice === "meio" && c.roll(0.35 + c.charisma * 0.3)) {
      fx.flag("jornada", 0.5);
      return "Aceitaram, a contragosto: meio período, meio salário. Mais uma chance.";
    }
    fx.flag("jornada", 0);
    fx.flag("demitido", c.date);
    const rescisao = Math.round(c.salary * 2.2);
    fx.money(rescisao, "Rescisão, aviso prévio e FGTS");
    if (choice === "justica") fx.schedule("justica_trabalho", [60, 140], {});
    return choice === "meio" ? `Não aceitaram. Você saiu com a rescisão (${brl(rescisao)}) e o tempo todo livre.` : `Você saiu com ${brl(rescisao)} de rescisão e FGTS. Agora é a política em tempo integral — e a reserva contando.`;
  },
  fallback: "direitos",
};

const justica_trabalho = ev({
  id: "justica_trabalho",
  kind: "DECISAO",
  tags: ["TRABALHO", "DINHEIRO"],
  chained: true,
  expires: 6,
  when: (c, d) => d ?? {},
  title: () => "Audiência na Justiça do Trabalho",
  text: (c) => `Chegou o dia da audiência contra a antiga empresa. O advogado dela oferece um acordo de ${brl(c.salary * 1.5)} para encerrar o caso.`,
  opts: [
    { id: "acordo", label: "Aceitar o acordo", tone: "safe", run: (c, _b, fx) => {
      fx.money(Math.round(c.salary * 1.5), "Acordo trabalhista");
      return "Acordo assinado. Dinheiro na conta em trinta dias.";
    } },
    { id: "julgamento", label: "Ir até o fim", hint: "Pode ganhar mais ou nada", tone: "risky", run: (c, _b, fx) => {
      if (c.roll(0.5)) {
        fx.money(Math.round(c.salary * 3), "Sentença trabalhista");
        return "Sentença favorável: a empresa vai pagar horas extras e indenização.";
      }
      return "O juiz entendeu que a demissão foi regular. Você saiu sem nada além do cansaço.";
    } },
  ],
  fallback: "acordo",
});

// ------------------------------------------------------------------ lesões

const lesao_cuidado: EventDef = {
  id: "lesao_cuidado",
  kind: "DECISAO",
  tags: ["SAUDE", "LAZER"],
  chained: true,
  expires: 3,
  when: (c, d) => (d && activeInjury(c.s, c.date) ? d : null),
  render: (c, b) => {
    const inj = activeInjury(c.s, c.date)!;
    const where = b.from === "jogar_bola" ? "na pelada" : b.from === "pedalar" ? "numa queda de bicicleta" : b.from === "academia" ? "na academia" : "";
    return {
      title: `Você se machucou ${where}: ${inj.label}`,
      text: `Dor, inchaço e a certeza de que vai precisar de cuidado. Até ${inj.until.split("-").reverse().join("/")}, a energia volta mais devagar${inj.legs ? " e andar é um sacrifício" : ""}. Para onde você vai?`,
      choices: [
        { id: "sus", label: "Pronto-socorro do SUS", hint: "De graça; espera e recuperação normal", tone: "safe" as const, cost: { energy: 10 } },
        { id: "particular", label: "Hospital particular e fisioterapia", hint: "Caro; recupera mais rápido", tone: "neutral" as const, cost: { money: c.money(INJURIES[inj.kind]?.legs ? 4500 : 2500) } },
        { id: "casa", label: "Gelo, analgésico e torcer", hint: "Sem custo; pode piorar", tone: "risky" as const },
      ],
    };
  },
  resolve: (c, _b, choice, fx) => {
    const inj = c.s.injury!;
    if (choice === "particular") {
      inj.until = addDays(c.date, Math.max(5, Math.round(diffDays(inj.until, c.date) * 0.65)));
      return `Raio-x, gesso bem-feito e fisioterapia marcada. Liberação prevista para ${inj.until.split("-").reverse().join("/")}.`;
    }
    if (choice === "casa") {
      if (c.roll(0.45)) {
        inj.until = addDays(inj.until, 14);
        fx.health(-3);
        return "Piorou. Duas semanas depois você acabou no pronto-socorro do mesmo jeito — e com a recuperação mais longa.";
      }
      return "Por sorte, foi menos grave do que parecia. Mesmo assim, cuidado.";
    }
    fx.health(0.5);
    return "Seis horas de espera, um ortopedista atencioso e o gesso no lugar. O SUS resolveu.";
  },
  fallback: "sus",
};

const gesso_foto = ev({
  id: "gesso_foto",
  kind: "OPORTUNIDADE",
  tags: ["SAUDE", "IMPRENSA"],
  cooldown: 200,
  max: 2,
  expires: 5,
  when: (c) => {
    const inj = activeInjury(c.s, c.date);
    return inj && (c.p.office_code || c.cand || c.p.visibility > 8) ? { lesao: inj.label } : null;
  },
  title: (_c, b) => `De ${b.lesao} e agenda cheia`,
  text: (c) => `Você apareceu ${c.p.office_code ? "na sessão" : "num evento"} de muleta e gesso. Um fotógrafo pediu uma foto; a assessoria acha que dá para transformar isso em história.`,
  opts: [
    { id: "posar", label: "Posar e brincar com a situação", hint: "Humaniza; gente gosta", tone: "bold", run: (_c, _b, fx) => {
      fx.visibility(2);
      fx.reputation(0.5);
      fx.approval(0.4, "Foto com gesso humanizou o mandato");
      return "\"Nem uma perna quebrada para\" virou a legenda. Os comentários foram de carinho.";
    } },
    { id: "repouso", label: "Cancelar a agenda e fazer repouso", hint: "Recupera; some por uns dias", tone: "safe", run: (_c, _b, fx) => {
      fx.energy(15);
      fx.fatigue(-8);
      return "Você ficou em casa, perna para cima. O corpo agradeceu.";
    } },
  ],
  fallback: "repouso",
});

// ------------------------------------------------------------------ cansaço

const esgotamento: EventDef = {
  id: "esgotamento",
  kind: "DECISAO",
  tags: ["SAUDE"],
  chained: true,
  expires: 3,
  when: (c, d) => ((c.s.fatigue ?? 0) >= 85 ? d ?? {} : null),
  render: (c) => ({
    title: "Você está no limite",
    text: `Noites mal dormidas, dor de cabeça, irritação à toa. ${c.p.office_code ? "Na última sessão" : c.cand ? "No último comício" : "Na última reunião"} você esqueceu o que ia dizer. O médico é direto: "Ou você para alguns dias, ou o corpo vai parar por você."`,
    choices: [
      { id: "parar", label: "Tirar uma semana de descanso de verdade", hint: "O cansaço despenca; a agenda espera", tone: "safe" as const },
      { id: "reduzir", label: "Reduzir o ritmo pela metade", hint: "Meio-termo", tone: "neutral" as const },
      { id: "seguir", label: "Seguir no tranco", hint: "Risco real para a saúde", tone: "risky" as const },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "parar") {
      fx.fatigue(-45);
      fx.health(2);
      fx.energy(30);
      if (c.cand) fx.momentum(-0.03, "Uma semana fora da campanha");
      return "Sete dias longe de tudo. Você voltou com cara de gente — e com a cabeça no lugar.";
    }
    if (choice === "reduzir") {
      fx.fatigue(-20);
      fx.health(0.5);
      return "Menos compromissos, mais sono. Não resolve tudo, mas segura.";
    }
    fx.health(-6);
    if (c.roll(0.35)) {
      fx.health(-6);
      fx.fatigue(-15);
      return "Você desmaiou no meio de uma agenda e passou a noite internado(a) em observação. O susto foi grande.";
    }
    return "Você seguiu. O corpo cobrou em silêncio: a saúde caiu.";
  },
  fallback: "reduzir",
};

const insonia = ev({
  id: "insonia",
  kind: "DECISAO",
  tags: ["SAUDE"],
  family: "cansaco",
  cooldown: 120,
  max: 3,
  expires: 4,
  when: (c) => ((c.s.fatigue ?? 0) >= 65 ? {} : null),
  title: () => "Três noites sem dormir direito",
  text: () => "Você deita e a cabeça não desliga: grupo de WhatsApp, cobranças, a agenda do dia seguinte. Às três da manhã, ainda olhando o teto.",
  opts: [
    { id: "medico", label: "Procurar um médico", tone: "safe", cost: (c) => ({ money: c.money(350) }), run: (_c, _b, fx) => {
      fx.fatigue(-10);
      fx.health(1);
      return "Higiene do sono, celular fora do quarto e um remédio leve por uns dias. Funcionou.";
    } },
    { id: "celular", label: "Celular fora do quarto depois das 22h", tone: "bold", run: (c, _b, fx) => {
      if (c.roll(0.6)) {
        fx.fatigue(-8);
        return "Difícil nos primeiros dias, mas o sono voltou.";
      }
      return "Você aguentou dois dias. No terceiro, lá estava o celular na cabeceira.";
    } },
    { id: "nada", label: "Aguentar", tone: "risky", run: (_c, _b, fx) => {
      fx.health(-1.5);
      fx.fatigue(4);
      return "A insônia virou rotina. O cansaço acumula.";
    } },
  ],
  fallback: "nada",
});

const dor_costas = ev({
  id: "dor_costas",
  kind: "DECISAO",
  tags: ["SAUDE"],
  family: "cansaco",
  cooldown: 240,
  max: 2,
  expires: 5,
  when: (c) => (c.age >= 35 && (c.s.fatigue ?? 0) >= 55 ? {} : null),
  title: () => "A coluna reclamou",
  text: () => "Horas de carro, cadeira de plástico em reunião de bairro e nenhum alongamento. Hoje você acordou travado(a).",
  opts: [
    { id: "fisio", label: "Fazer fisioterapia", tone: "safe", cost: (c) => ({ money: c.money(900) }), run: (_c, _b, fx) => {
      fx.health(2);
      fx.fatigue(-6);
      return "Dez sessões depois, a coluna agradeceu.";
    } },
    { id: "pilates", label: "Começar pilates", hint: "Mais caro, efeito duradouro", tone: "bold", cost: (c) => ({ money: c.money(1600) }), run: (_c, _b, fx) => {
      fx.health(3);
      fx.fatigue(-10);
      return "Duas aulas por semana e uma postura nova. Até a voz no discurso melhorou.";
    } },
    { id: "remedio", label: "Analgésico e seguir", tone: "neutral", run: (_c, _b, fx) => {
      fx.health(-1);
      return "A dor passou. Por enquanto.";
    } },
  ],
  fallback: "remedio",
});

const convite_corrida = ev({
  id: "convite_corrida",
  kind: "OPORTUNIDADE",
  tags: ["LAZER", "COMUNIDADE"],
  cooldown: 300,
  max: 2,
  expires: 10,
  when: (c) => (!activeInjury(c.s, c.date) && c.age <= 65 ? { prova: c.rng.pick(["corrida de rua de 5 km", "caminhada beneficente", "passeio ciclístico"]) } : null),
  title: (_c, b) => `Convite: ${b.prova}`,
  text: (c, b) => `A ${b.prova} de ${city(c)} vai arrecadar fundos para o hospital infantil. Os organizadores querem você na largada${c.p.office_code ? " (e numa foto com a camiseta oficial)" : ""}.`,
  opts: [
    { id: "correr", label: "Treinar e participar", hint: "Saúde, foto e risco de vexame", tone: "bold", cost: () => ({ energy: 15 }), run: (c, _b, fx) => {
      fx.health(1.5);
      fx.fatigue(-6);
      fx.visibility(1);
      if (c.roll(0.15)) return "Você chegou entre os últimos, mancando, aplaudido pelos que ainda estavam lá. Virou meme carinhoso.";
      return "Você completou a prova, suado(a) e sorrindo. A foto na chegada rodou os grupos.";
    } },
    { id: "doar", label: "Só fazer uma doação", tone: "safe", cost: (c) => ({ money: c.money(300) }), run: (_c, _b, fx) => {
      fx.reputation(0.5);
      return "Doação feita. Seu nome saiu na lista de apoiadores.";
    } },
    { id: "nao", label: "Agradecer e não ir", tone: "neutral", run: () => "Ficou para a próxima." },
  ],
  fallback: "nao",
});

const pelada_rivais = ev({
  id: "pelada_rivais",
  kind: "OPORTUNIDADE",
  tags: ["LAZER", "BASTIDORES"],
  cooldown: 300,
  max: 2,
  expires: 7,
  when: (c) => (c.p.party_id && !activeInjury(c.s, c.date) ? { amigo: c.rng.pick(AMIGOS) } : null),
  title: () => "Pelada com gente de todos os partidos",
  text: (_c, b) => `${b.amigo} organizou um futebol de sábado com políticos da cidade, de todos os lados. "Dentro de campo não tem partido", promete.`,
  opts: [
    { id: "jogar", label: "Calçar a chuteira", hint: "Relações e risco de canelada", tone: "bold", cost: () => ({ energy: 15 }), run: (c, _b, fx) => {
      fx.fatigue(-12);
      fx.capital(2);
      if (c.roll(0.07)) {
        fx.health(-2);
        return "Uma dividida mais forte e você saiu mancando — mas saiu com três telefones novos na agenda.";
      }
      return "Você fez um gol de canela e virou assunto da resenha. Saiu com aliados improváveis.";
    } },
    { id: "assistir", label: "Ir só para o churrasco depois", tone: "safe", run: (_c, _b, fx) => {
      fx.capital(1);
      fx.fatigue(-5);
      return "Você não jogou, mas na resenha fechou duas conversas importantes.";
    } },
    { id: "nao", label: "Não ir", tone: "neutral", run: () => "Sábado em casa." },
  ],
  fallback: "nao",
});

// ------------------------------------------------------------------ fim do mandato

const volta_vida_civil: EventDef = {
  id: "volta_vida_civil",
  kind: "DECISAO",
  tags: ["TRABALHO", "MANDATO"],
  chained: true,
  milestone: true,
  expires: 6,
  when: (c, d) => (!c.p.office_code && d ? d : null),
  render: (c, b) => {
    const office = OFFICES[String(b.office) as keyof typeof OFFICES]?.name.toLowerCase() ?? "cargo";
    return {
      title: "O mandato acabou",
      text: `Fim do tempo como ${office}. O gabinete foi desmontado e o subsídio para de cair na conta. A licença do trabalho de ${c.professionLabel} acaba agora: o que você faz?`,
      choices: [
        { id: "voltar", label: `Voltar a trabalhar como ${c.professionLabel}`, hint: `Salário de ${brl(c.salary)}; menos tempo para a política`, tone: "safe" as const },
        { id: "meio", label: "Voltar em meio período", hint: "Metade do salário, metade do tempo", tone: "neutral" as const },
        { id: "politica", label: "Seguir só na política, preparando a volta", hint: "Sem salário; reserva e reconhecimento", tone: "bold" as const },
      ],
    };
  },
  resolve: (c, _b, choice, fx) => {
    fx.unflag("chefe_avisou");
    fx.unflag("chefe_resolvido");
    if (choice === "voltar") {
      fx.unflag("jornada");
      return "Crachá de volta. A rotina antiga parece estranha depois de tudo, mas o salário cai no dia certo.";
    }
    if (choice === "meio") {
      fx.flag("jornada", 0.5);
      return "Meio período negociado. As tardes ficam para a política.";
    }
    fx.flag("jornada", 0);
    fx.energy(20);
    return "Você decidiu não voltar ao emprego. A conta vai sentir, mas a agenda é toda sua.";
  },
  fallback: "voltar",
};

export const LIFE2_EVENTS: EventDef[] = [
  chefe_ultimato,
  justica_trabalho,
  lesao_cuidado,
  gesso_foto,
  esgotamento,
  insonia,
  dor_costas,
  convite_corrida,
  pelada_rivais,
  volta_vida_civil,
  // o antigo "trabalho está cobrando" só fecha pendências antigas: não sorteia mais
  { ...chefe_reclama, chained: true },
];
