import type { StoryCtx } from "../context";
import type { ChoiceDef, EventDef } from "../def";
import type { Effects } from "../effects";
import type { Binding, ChoiceTone, StoryKind, StoryTag } from "../types";
import { brl, city, communityLeader, home, localPolitician } from "./util";

/**
 * O dia a dia de quem faz política: trabalho, bairro, internet, dinheiro,
 * partido e gabinete. Cada acontecimento tem variações internas (quem, onde,
 * o quê) para a mesma situação não se repetir igual.
 */

/** Nomes de gente comum (personagens de passagem, sempre fictícios). */
export const NOMES = ["Dona Cida", "Seu Valdir", "Dona Lourdes", "Seu Jorge", "Rosângela", "Marcos", "Tânia", "Edson", "Dona Neide", "Seu Antônio", "Kátia", "Robson", "Dona Fátima", "Seu Zé Carlos", "Simone", "Wellington"];
export const AMIGOS = ["Rafa", "Júlia", "Diego", "Camila", "Thiago", "Bruna", "Léo", "Paula", "Gustavo", "Nanda"];

interface Opt {
  id: string;
  label: string;
  hint?: string;
  tone?: ChoiceTone;
  cost?: (c: StoryCtx, b: Binding) => { money?: number; energy?: number };
  requires?: ChoiceDef["requires"];
  run: (c: StoryCtx, b: Binding, fx: Effects) => string;
}

/** Monta um acontecimento a partir de título, texto e opções com o próprio desfecho. */
export function ev(spec: {
  id: string;
  kind: StoryKind;
  tags: StoryTag[];
  weight?: number;
  cooldown?: number;
  max?: number;
  expires?: number;
  when: (c: StoryCtx) => Binding | null;
  title: (c: StoryCtx, b: Binding) => string;
  text: (c: StoryCtx, b: Binding) => string;
  opts: Opt[];
  fallback: string;
}): EventDef {
  return {
    id: spec.id,
    kind: spec.kind,
    tags: spec.tags,
    weight: spec.weight,
    cooldown: spec.cooldown ?? 120,
    max: spec.max,
    expires: spec.expires,
    when: spec.when,
    render: (c, b) => ({
      title: spec.title(c, b),
      text: spec.text(c, b),
      choices: spec.opts.map((o) => ({ id: o.id, label: o.label, hint: o.hint, tone: o.tone, cost: o.cost?.(c, b), requires: o.requires })),
    }),
    resolve: (c, b, choice, fx) => {
      const o = spec.opts.find((x) => x.id === choice) ?? spec.opts.find((x) => x.id === spec.fallback)!;
      const cost = o.cost?.(c, b);
      if (cost?.energy) fx.energy(-cost.energy);
      if (cost?.money) fx.money(-cost.money, spec.title(c, b));
      return o.run(c, b, fx);
    },
    fallback: spec.fallback,
  };
}

const semCargo = (c: StoryCtx) => !c.p.office_code;
const month = (c: StoryCtx) => Number(c.date.slice(5, 7));

// ================================================================ bairro e cidade

const abaixo_assinado = ev({
  id: "abaixo_assinado",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE"],
  cooldown: 150,
  expires: 7,
  when: (c) => ({
    hood: c.rng.chance(0.6) ? home(c) : "centro",
    // já com a preposição certa ("por uma", "pela", "pelo")
    pedido: c.rng.pick(["por uma lombada na frente da escola", "por iluminação na praça", "por um posto de saúde aberto à noite", "pela volta da linha de ônibus noturna", "pela reforma da quadra"]),
    quem: c.rng.pick(NOMES),
  }),
  title: (_c, b) => `Abaixo-assinado ${b.pedido}`,
  text: (_c, b) => `${b.quem} está juntando assinaturas no ${b.hood} ${b.pedido}. Faltam umas trezentas, e alguém precisa levar o papel até a prefeitura.`,
  opts: [
    { id: "liderar", label: "Pegar a prancheta e liderar", hint: "Dois fins de semana batendo de porta em porta", tone: "safe", cost: () => ({ energy: 15 }), run: (c, b, fx) => {
      fx.activism(4);
      fx.reach(0.004);
      if (c.roll(0.5)) {
        fx.reputation(2);
        return "As assinaturas chegaram à prefeitura com você na frente. Duas semanas depois, o pedido foi atendido. O bairro sabe quem foi.";
      }
      fx.reputation(1);
      return "Você protocolou tudo. A prefeitura respondeu com um ofício de três linhas, mas o bairro viu quem foi até lá.";
    } },
    { id: "assinar", label: "Assinar e divulgar nas redes", tone: "neutral", run: (_c, _b, fx) => {
      fx.activism(1);
      return "Sua assinatura e um post. Ajudou um pouco, sem tirar você de casa.";
    } },
    { id: "ignorar", label: "Deixar para quem tem mais tempo", tone: "neutral", run: () => "O abaixo-assinado seguiu sem você. Ficou faltando assinatura." },
  ],
  fallback: "ignorar",
});

const protesto_cidade = ev({
  id: "protesto_cidade",
  kind: "DECISAO",
  tags: ["COMUNIDADE", "IMPRENSA"],
  cooldown: 200,
  expires: 3,
  when: (c) => ({
    motivo: c.inflation > 6 ? "o aumento da passagem de ônibus" : c.rng.pick(["o fechamento de uma escola estadual", "a demora na obra do hospital", "o corte de árvores no parque", "a falta de remédio nos postos"]),
    cidade: city(c),
  }),
  title: () => "Protesto marcado no centro",
  text: (c, b) => `Movimentos convocaram um ato em ${b.cidade} contra ${b.motivo}. ${c.p.party_id ? "Seu partido não fechou posição." : "Seus amigos vão."} Vai ter polícia, imprensa e muito celular gravando.`,
  opts: [
    { id: "discursar", label: "Ir e pedir o microfone", hint: "Visibilidade; pode virar briga", tone: "bold", cost: () => ({ energy: 12 }), run: (c, _b, fx) => {
      fx.visibility(3);
      fx.activism(4);
      if (c.roll(0.45 + c.charisma * 0.35)) {
        fx.reputation(2);
        fx.reach(0.008);
        return "Sua fala de dois minutos foi a mais compartilhada do ato. Gente que você nunca viu começou a te seguir.";
      }
      fx.reputation(-1);
      return "A voz falhou e o carro de som desligou no meio da frase. Viralizou, mas pelo motivo errado.";
    } },
    { id: "marchar", label: "Ir e marchar com o pessoal", tone: "safe", cost: () => ({ energy: 8 }), run: (_c, _b, fx) => {
      fx.activism(3);
      return "Você caminhou do começo ao fim, ajudou a segurar a faixa e voltou para casa sem voz e com a consciência tranquila.";
    } },
    { id: "ficar", label: "Ficar de fora", tone: "neutral", run: (c, _b, fx) => {
      if (c.p.party_id) fx.standing(-1);
      return "Você acompanhou pelas redes. Alguém do grupo perguntou onde você estava.";
    } },
  ],
  fallback: "ficar",
});

const palestra_escola = ev({
  id: "palestra_escola",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE"],
  cooldown: 180,
  expires: 10,
  when: (c) => (c.st.activism >= 8 || c.p.party_id ? { escola: c.rng.pick(["a escola estadual do bairro", "um cursinho popular", "a escola onde você estudou", "um colégio técnico"]), tema: c.rng.pick(["cidadania", "como funciona uma eleição", "o papel do vereador", "política sem briga"]) } : null),
  title: () => "Convite para falar numa escola",
  text: (_c, b) => `A professora de sociologia de ${b.escola} quer que você converse com o terceiro ano sobre "${b.tema}". São 40 adolescentes, celular na mão e zero paciência para discurso.`,
  opts: [
    { id: "preparar", label: "Preparar algo de verdade", hint: "Uma noite montando a conversa", tone: "safe", cost: () => ({ energy: 10 }), run: (c, _b, fx) => {
      fx.debate(2);
      if (c.roll(0.55 + c.charisma * 0.3)) {
        fx.reputation(1.5);
        return "Você trocou o discurso por perguntas. No fim, uma fila de alunos querendo saber como se filiar. A professora já marcou a próxima.";
      }
      fx.reputation(0.5);
      return "Metade da turma dormiu, mas a outra metade fez perguntas difíceis. Você saiu de lá mais afiado(a).";
    } },
    { id: "improvisar", label: "Ir e improvisar", tone: "risky", cost: () => ({ energy: 4 }), run: (c, _b, fx) => {
      if (c.roll(0.3 + c.charisma * 0.4)) {
        fx.reputation(1);
        return "No improviso, você acertou o tom. Saiu um vídeo curto que os alunos postaram.";
      }
      return "Sem roteiro, a conversa se perdeu. A professora agradeceu com educação demais.";
    } },
    { id: "recusar", label: "Agradecer e recusar", tone: "neutral", run: () => "Você agradeceu. A professora chamou outra pessoa." },
  ],
  fallback: "recusar",
});

const mutirao = ev({
  id: "mutirao",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE", "SAUDE"],
  cooldown: 140,
  expires: 6,
  when: (c) => ({
    tipo: c.rng.pick(["limpeza do córrego", "doação de sangue", "pintura da creche", "plantio de árvores na praça", "arrecadação de agasalhos"]),
    hood: home(c),
  }),
  title: (_c, b) => `Mutirão de ${b.tipo}`,
  text: (_c, b) => `A associação do ${b.hood} marcou um mutirão de ${b.tipo} para sábado de manhã. Precisam de braços, de alguém que organize e, se possível, de café para todo mundo.`,
  opts: [
    { id: "organizar", label: "Organizar e pagar o café", tone: "safe", cost: (c) => ({ energy: 12, money: c.money(250) }), run: (c, b, fx) => {
      fx.activism(3);
      fx.reputation(1);
      fx.rel(communityLeader(c, String(b.hood)).id, 6);
      if (String(b.tipo).includes("sangue")) fx.health(-1);
      return "Manhã cheia, gente de todas as idades e você com a garrafa térmica na mão. A presidente da associação anotou seu nome.";
    } },
    { id: "ajudar", label: "Aparecer e ajudar", tone: "safe", cost: () => ({ energy: 8 }), run: (_c, _b, fx) => {
      fx.activism(2);
      return "Você trabalhou a manhã toda sem tirar foto. Quem estava lá viu.";
    } },
    { id: "passar", label: "Ficar em casa", tone: "neutral", run: () => "O mutirão aconteceu. Você descansou." },
  ],
  fallback: "passar",
});

const presidencia_associacao = ev({
  id: "presidencia_associacao",
  kind: "DECISAO",
  tags: ["COMUNIDADE"],
  cooldown: 400,
  max: 1,
  expires: 5,
  when: (c) => (semCargo(c) && c.st.activism >= 15 ? { hood: home(c) } : null),
  title: (_c, b) => `Eleição na associação do ${b.hood}`,
  text: (_c, b) => `A diretoria da associação de moradores do ${b.hood} vai ser renovada. Alguns vizinhos querem você na chapa — de presidente. É trabalho sem salário, reunião toda semana e briga com a prefeitura. Também é a melhor escola de política que existe.`,
  opts: [
    { id: "presidir", label: "Encabeçar a chapa", hint: "Mais tempo e energia; base de verdade", tone: "bold", cost: () => ({ energy: 15 }), run: (c, b, fx) => {
      if (c.roll(0.55 + c.st.activism / 200)) {
        fx.flag("associacao", String(b.hood));
        fx.activism(8);
        fx.reputation(3);
        fx.reach(0.01);
        return `Chapa eleita. Agora você preside a associação do ${b.hood}: a pauta do bairro passa pela sua mesa.`;
      }
      fx.activism(3);
      return "Perdeu por 14 votos para a chapa do síndico do conjunto. Você aprendeu como se ganha (e se perde) uma eleição pequena.";
    } },
    { id: "vice", label: "Entrar como vice", tone: "safe", cost: () => ({ energy: 6 }), run: (_c, _b, fx) => {
      fx.activism(4);
      fx.reputation(1);
      return "Vice-presidente: metade do trabalho, metade do crédito, todas as reuniões.";
    } },
    { id: "nao", label: "Não entrar", tone: "neutral", run: () => "Você apoiou de longe. A chapa saiu sem você." },
  ],
  fallback: "nao",
});

const vizinho_barulho = ev({
  id: "vizinho_barulho",
  kind: "OPORTUNIDADE",
  tags: ["VIDA", "COMUNIDADE"],
  cooldown: 200,
  expires: 4,
  when: (c) => ({ quem: c.rng.pick(NOMES), coisa: c.rng.pick(["som alto até as três da manhã", "um muro que avança na calçada", "o cachorro que late a noite inteira", "lixo na frente da sua casa"]) }),
  title: () => "Problema com o vizinho",
  text: (_c, b) => `${b.quem}, da casa ao lado, e ${b.coisa}. Já é a terceira semana. Na rua todo mundo sabe que você "mexe com política", e estão de olho em como você resolve.`,
  opts: [
    { id: "conversar", label: "Bater na porta e conversar", tone: "safe", run: (c, _b, fx) => {
      if (c.roll(0.6 + c.charisma * 0.3)) {
        fx.reputation(0.5);
        return "Café, conversa e um acordo. A rua comentou: \"resolve as coisas no diálogo\".";
      }
      return "A conversa azedou. Pelo menos foi educada.";
    } },
    { id: "denunciar", label: "Chamar a fiscalização", tone: "bold", run: (_c, _b, fx) => {
      fx.reputation(-0.5);
      return "A fiscalização veio. O problema acabou — a amizade também. Metade da rua achou certo, a outra metade, \"coisa de político\".";
    } },
    { id: "aguentar", label: "Deixar pra lá", tone: "neutral", run: (_c, _b, fx) => {
      fx.energy(-4);
      return "Você aguentou mais umas noites mal dormidas.";
    } },
  ],
  fallback: "aguentar",
});

const animal_resgate = ev({
  id: "animal_resgate",
  kind: "OPORTUNIDADE",
  tags: ["VIDA"],
  cooldown: 365,
  max: 2,
  expires: 3,
  when: (c) => ({ bicho: c.rng.pick(["um vira-lata caramelo", "uma gata com três filhotes", "um cachorro velho, de coleira e sem dono"]), hood: home(c) }),
  title: () => "Um bicho abandonado na sua rua",
  text: (_c, b) => `Apareceu ${b.bicho} na sua rua, no ${b.hood}. Está magro e assustado. As crianças já deram nome.`,
  opts: [
    { id: "adotar", label: "Levar para casa", hint: "Veterinário e ração", tone: "safe", cost: (c) => ({ money: c.money(400) }), run: (_c, _b, fx) => {
      fx.health(1);
      fx.flag("pet", true);
      return "Banho, vacina e um lugar no sofá. A casa ficou mais barulhenta e mais alegre.";
    } },
    { id: "lar", label: "Achar um lar pelas redes", tone: "safe", cost: () => ({ energy: 4 }), run: (_c, _b, fx) => {
      fx.reach(0.002);
      return "Um post com foto e, em dois dias, uma família adotou. O post teve mais curtidas que qualquer coisa política sua.";
    } },
    { id: "nada", label: "Seguir a vida", tone: "neutral", run: () => "Alguém da rua acabou cuidando." },
  ],
  fallback: "nada",
});

// ================================================================ internet e imprensa

const fake_grupo_familia = ev({
  id: "fake_grupo_familia",
  kind: "OPORTUNIDADE",
  tags: ["VIDA", "IMPRENSA"],
  cooldown: 150,
  expires: 3,
  when: (c) => ({ quem: c.rng.pick(["seu tio", "sua tia", "um primo", "a madrinha"]), sobre: c.rng.pick(["vacinas", "urnas eletrônicas", "um político que teria fugido do país", "o fim do Pix"]) }),
  title: () => "Corrente falsa no grupo da família",
  text: (_c, b) => `${String(b.quem)[0].toUpperCase()}${String(b.quem).slice(1)} mandou no grupo da família um áudio sobre ${b.sobre}. É falso. Todo mundo olha para você, "que entende de política".`,
  opts: [
    { id: "desmentir", label: "Desmentir com calma e link", tone: "safe", run: (c, _b, fx) => {
      if (c.roll(0.5)) return "Você explicou com jeito. Ninguém pediu desculpa, mas o áudio parou de circular.";
      fx.energy(-3);
      return "Viraram 140 mensagens. Seu tio saiu do grupo e voltou no dia seguinte.";
    } },
    { id: "privado", label: "Chamar no privado", tone: "safe", run: () => "No privado, a conversa foi melhor. Ele apagou o áudio — sem admitir nada." },
    { id: "silenciar", label: "Silenciar o grupo", tone: "neutral", run: () => "Grupo silenciado por oito horas. Paz temporária." },
  ],
  fallback: "silenciar",
});

const post_viral = ev({
  id: "post_viral",
  kind: "DECISAO",
  tags: ["IMPRENSA"],
  cooldown: 160,
  expires: 2,
  when: (c) => ({ tema: c.rng.pick(["o preço do gás", "um buraco que engoliu um carro", "a fila do posto de saúde", "o salário dos professores"]), bom: c.rng.chance(0.6) ? 1 : 0 }),
  title: () => "Um post seu viralizou",
  text: (_c, b) => `Você postou sobre ${b.tema} e acordou com milhares de compartilhamentos. ${b.bom ? "A maioria concorda, alguns perfis grandes repostaram." : "Muita gente concorda, mas tem um exército de perfis atacando nos comentários."}`,
  opts: [
    { id: "dobrar", label: "Gravar um vídeo aprofundando", hint: "Aproveitar a onda", tone: "bold", cost: () => ({ energy: 6 }), run: (c, b, fx) => {
      fx.reach(0.012);
      fx.visibility(2);
      if (b.bom || c.roll(0.5)) {
        fx.reputation(1.5);
        return "O vídeo seguiu a onda. Você ganhou seguidores que agora esperam o próximo.";
      }
      fx.reputation(-1);
      return "Os ataques cresceram junto com o alcance. Você ficou conhecido(a) — e polêmico(a).";
    } },
    { id: "responder", label: "Responder os comentários", tone: "risky", cost: () => ({ energy: 8 }), run: (c, _b, fx) => {
      if (c.roll(0.4 + c.charisma * 0.3)) {
        fx.reputation(1);
        return "Respostas curtas e educadas. Um deles virou print elogiado.";
      }
      fx.reputation(-1.5);
      return "Uma resposta atravessada virou o assunto, não o post.";
    } },
    { id: "deixar", label: "Deixar rolar", tone: "neutral", run: (_c, _b, fx) => {
      fx.reach(0.004);
      return "A onda passou em dois dias. Ficaram alguns seguidores novos.";
    } },
  ],
  fallback: "deixar",
});

const podcast_local = ev({
  id: "podcast_local",
  kind: "OPORTUNIDADE",
  tags: ["IMPRENSA"],
  cooldown: 150,
  expires: 8,
  when: (c) => (c.p.reputation >= 15 || c.p.party_id ? { nome: c.rng.pick(["Papo de Esquina", "Cidade em Pauta", "Resenha da Quebrada", "Microfone Aberto"]), estilo: c.rng.pick(["descontraído", "de entrevistas longas", "conhecido por perguntas duras"]) } : null),
  title: (_c, b) => `Convite do podcast "${b.nome}"`,
  text: (c, b) => `O "${b.nome}", um podcast ${b.estilo} de ${city(c)}, quer você num episódio. A audiência é pequena e fiel — e os cortes rodam nas redes.`,
  opts: [
    { id: "ir", label: "Topar e se preparar", tone: "safe", cost: () => ({ energy: 8 }), run: (c, _b, fx) => {
      fx.debate(2);
      fx.reach(0.006);
      if (c.roll(0.55 + c.charisma * 0.3)) {
        fx.reputation(1.5);
        return "Um corte de 40 segundos seu rodou a cidade. O apresentador te chamou de \"a revelação da temporada\".";
      }
      return "Episódio morno, mas você treinou responder ao vivo. Isso vai servir.";
    } },
    { id: "polemica", label: "Ir para causar", hint: "Corte viral; risco de queimar", tone: "risky", cost: () => ({ energy: 6 }), run: (c, _b, fx) => {
      fx.visibility(3);
      fx.reach(0.01);
      if (c.roll(0.45)) {
        fx.reputation(1);
        return "Frases fortes, corte viral, seguidores novos. Os velhos do partido torceram o nariz.";
      }
      fx.reputation(-2);
      return "Uma frase fora de contexto virou manchete local. Você passou a semana se explicando.";
    } },
    { id: "nao", label: "Recusar", tone: "neutral", run: () => "Você recusou. O episódio saiu com outra pessoa." },
  ],
  fallback: "nao",
});

const pesquisadora = ev({
  id: "pesquisadora",
  kind: "OPORTUNIDADE",
  tags: ["IMPRENSA", "COMUNIDADE"],
  cooldown: 300,
  max: 2,
  expires: 10,
  when: (c) => (c.st.activism >= 10 ? { tema: c.rng.pick(["juventude e política", "lideranças de bairro", "como novatos entram nos partidos"]) } : null),
  title: () => "Uma pesquisadora quer entrevistar você",
  text: (_c, b) => `Uma mestranda da universidade estuda "${b.tema}" e quer uma entrevista longa com você. Sem câmera, sem palco — mas o trabalho será publicado.`,
  opts: [
    { id: "aceitar", label: "Dar a entrevista", tone: "safe", cost: () => ({ energy: 5 }), run: (_c, _b, fx) => {
      fx.capital(1);
      fx.debate(1);
      return "Duas horas de conversa que te obrigaram a explicar por que você faz o que faz. Saiu de lá com as ideias mais claras.";
    } },
    { id: "recusar", label: "Recusar", tone: "neutral", run: () => "Ela agradeceu e entrevistou outra pessoa." },
  ],
  fallback: "recusar",
});

// ================================================================ trabalho e dinheiro

const chefe_reclama = ev({
  id: "chefe_reclama",
  kind: "DECISAO",
  tags: ["TRABALHO"],
  cooldown: 180,
  expires: 4,
  when: (c) => (semCargo(c) && c.jornada > 0 && (c.st.activism >= 10 || c.p.party_id) ? { chefe: c.rng.pick(["Seu chefe", "A gerente", "O dono da empresa", "A coordenadora"]) } : null),
  title: () => "O trabalho está cobrando",
  text: (c, b) => `${b.chefe} chamou você numa sala: "Tenho visto você chegando cansado(a) e saindo cedo para reunião política. Aqui você é ${c.professionLabel}. Decide."`,
  opts: [
    { id: "focar", label: "Prometer foco no trabalho", hint: "Menos política por um tempo", tone: "safe", run: (_c, _b, fx) => {
      fx.activism(-2);
      fx.flag("foco_trabalho", true);
      return "Você segurou o emprego. A política vai ter que caber nas noites e fins de semana.";
    } },
    { id: "negociar", label: "Negociar um horário flexível", tone: "bold", run: (c, _b, fx) => {
      if (c.roll(0.5 + c.charisma * 0.3)) return "Acordo fechado: você compensa as horas. Ninguém saiu perdendo.";
      fx.reputation(-0.5);
      fx.energy(-6);
      return "Não colou. Você ficou com fama de \"enrolado(a)\" no trabalho.";
    } },
    { id: "enfrentar", label: "Dizer que a política é sua prioridade", tone: "risky", run: (c, _b, fx) => {
      if (c.roll(0.4)) {
        fx.activism(3);
        return "Silêncio na sala. Seu chefe respeitou — por enquanto.";
      }
      fx.money(-c.money(c.salary * 0.5), "Desconto por faltas");
      return "Veio advertência e desconto de dias no salário. A política ficou mais cara.";
    } },
  ],
  fallback: "focar",
});

const oferta_emprego = ev({
  id: "oferta_emprego",
  kind: "OPORTUNIDADE",
  tags: ["TRABALHO", "DINHEIRO"],
  cooldown: 300,
  expires: 7,
  when: (c) => (semCargo(c) && c.jornada > 0 && c.unemployment < 9 ? { aumento: c.rng.pick([20, 30, 40]) } : null),
  title: () => "Proposta de emprego",
  text: (c, b) => `Uma empresa de ${city(c)} ofereceu uma vaga de ${c.professionLabel} pagando ${b.aumento}% a mais. O problema: carga horária maior, inclusive aos sábados — dia de panfletagem.`,
  opts: [
    { id: "aceitar", label: "Aceitar o salário maior", hint: "Mais dinheiro, menos tempo", tone: "bold", run: (c, b, fx) => {
      fx.money(c.money(c.salary * (Number(b.aumento) / 100) * 2), "Diferença salarial dos primeiros meses");
      fx.activism(-3);
      fx.energy(-5);
      return "Conta bancária mais folgada, agenda mais apertada. A política vai ter que esperar um pouco.";
    } },
    { id: "negociar", label: "Usar a proposta para pedir aumento", tone: "risky", run: (c, _b, fx) => {
      if (c.roll(0.45)) {
        fx.money(c.money(c.salary * 0.6), "Aumento negociado");
        return "Seu chefe cobriu parte da oferta. Mesmo emprego, salário melhor.";
      }
      return "Seu chefe pagou para ver. Você ficou onde estava, com o clima meio estranho.";
    } },
    { id: "recusar", label: "Recusar e manter o tempo livre", tone: "safe", run: () => "Você recusou. Tempo também é dinheiro — e voto." },
  ],
  fallback: "recusar",
});

const amigo_emprestimo = ev({
  id: "amigo_emprestimo",
  kind: "OPORTUNIDADE",
  tags: ["DINHEIRO", "VIDA"],
  cooldown: 200,
  expires: 4,
  when: (c) => (c.st.money > c.money(1500) ? { quem: c.rng.pick(AMIGOS), motivo: c.rng.pick(["pagar o aluguel atrasado", "consertar a moto de trabalho", "um tratamento dentário", "não perder o carro financiado"]), v: c.money(c.rng.pick([800, 1200, 2000])) } : null),
  title: (_c, b) => `${b.quem} precisa de dinheiro`,
  text: (_c, b) => `${b.quem}, amigo(a) de muitos anos, pediu ${brl(Number(b.v))} emprestados para ${b.motivo}. Promete devolver "no mês que vem".`,
  opts: [
    { id: "emprestar", label: `Emprestar`, tone: "safe", cost: (_c, b) => ({ money: Number(b.v) }), run: (c, b, fx) => {
      if (c.roll(0.55)) {
        fx.schedule("amigo_devolve", [25, 50], { quem: String(b.quem), v: Number(b.v) });
        return "Você fez a transferência. O abraço foi longo.";
      }
      return "Você emprestou. Lá no fundo, já sabe que esse dinheiro não volta.";
    } },
    { id: "metade", label: "Dar uma parte, sem cobrar", tone: "neutral", cost: (_c, b) => ({ money: Math.round(Number(b.v) / 3) }), run: () => "Você ajudou com o que dava. Amizade preservada, conta também." },
    { id: "negar", label: "Dizer que não dá", tone: "neutral", run: () => "Conversa difícil. Seu amigo entendeu — ou fingiu." },
  ],
  fallback: "negar",
});

const amigo_devolve: EventDef = {
  id: "amigo_devolve",
  kind: "INFO",
  tags: ["DINHEIRO", "VIDA"],
  chained: true,
  when: (_c, data) => data ?? null,
  render: (_c, b) => ({ title: `${b.quem} devolveu o empréstimo`, text: `${b.quem} apareceu com o dinheiro e uma caixa de bombons. "Falei que devolvia."`, choices: [] }),
  resolve: (_c, b, _choice, fx) => {
    fx.money(Number(b.v), `Devolução do empréstimo de ${b.quem}`);
    return "Dinheiro de volta e amizade inteira.";
  },
};

const golpe_mensagem = ev({
  id: "golpe_mensagem",
  kind: "DECISAO",
  tags: ["DINHEIRO"],
  cooldown: 240,
  expires: 1,
  when: (c) => ({ isca: c.rng.pick(["\"seu filho\" pedindo Pix de um número novo", "um falso aviso do banco sobre compra suspeita", "um \"assessor do partido\" pedindo contribuição urgente", "uma promoção imperdível no seu nome"]), v: c.money(c.rng.pick([600, 1500, 3000])) }),
  title: () => "Mensagem suspeita no celular",
  text: (_c, b) => `Chegou ${b.isca}. Pedem ${brl(Number(b.v))} agora, \"senão complica\". Parece urgente. Parece de verdade.`,
  opts: [
    { id: "ligar", label: "Ligar para confirmar antes", tone: "safe", run: () => "Uma ligação bastou: era golpe. Você avisou os grupos e ainda evitou que outras pessoas caíssem." },
    { id: "pagar", label: "Pagar logo para resolver", tone: "risky", run: (c, b, fx) => {
      fx.money(-Number(b.v), "Golpe por mensagem");
      return "Dez minutos depois veio a ficha: golpe. O banco disse que \"vai analisar\".";
    } },
    { id: "ignorar", label: "Ignorar", tone: "neutral", run: () => "Você apagou a mensagem. Era golpe mesmo." },
  ],
  fallback: "ignorar",
});

const curso_oratoria = ev({
  id: "curso_oratoria",
  kind: "OPORTUNIDADE",
  tags: ["TRABALHO"],
  cooldown: 365,
  max: 3,
  expires: 10,
  when: (c) => ({ curso: c.rng.pick(["oratória", "gestão pública", "comunicação nas redes", "orçamento público para iniciantes"]), v: c.money(c.rng.pick([600, 900, 1400])) }),
  title: (_c, b) => `Curso de ${b.curso}`,
  text: (_c, b) => `Abriu uma turma noturna de ${b.curso}: oito semanas, ${brl(Number(b.v))}. Quem já fez diz que muda o jogo — e cansa.`,
  opts: [
    { id: "fazer", label: "Fazer o curso", tone: "safe", cost: (_c, b) => ({ money: Number(b.v), energy: 10 }), run: (_c, b, fx) => {
      fx.debate(String(b.curso) === "oratória" ? 6 : 3);
      fx.capital(2);
      return "Oito semanas depois, você fala melhor, entende mais e conhece gente nova da área.";
    } },
    { id: "online", label: "Ver as aulas gratuitas na internet", tone: "neutral", cost: () => ({ energy: 4 }), run: (_c, _b, fx) => {
      fx.debate(1);
      return "Você aprendeu o básico de graça. Faltou a prática.";
    } },
    { id: "nao", label: "Deixar para outra hora", tone: "neutral", run: () => "Fica para a próxima turma." },
  ],
  fallback: "nao",
});

const academia = ev({
  id: "academia",
  kind: "OPORTUNIDADE",
  tags: ["SAUDE", "VIDA"],
  cooldown: 300,
  expires: 7,
  when: (c) => (c.s.health < 85 ? { ativ: c.rng.pick(["corrida no parque", "futebol de quinta à noite", "musculação", "natação", "caminhada com os vizinhos"]) } : null),
  title: () => "Hora de cuidar do corpo",
  text: (_c, b) => `Você se olhou no espelho depois de uma semana de reunião, café e salgado de padaria. Um amigo chamou para ${b.ativ}.`,
  opts: [
    { id: "comecar", label: "Começar de verdade", tone: "safe", cost: (c) => ({ money: c.money(150), energy: 4 }), run: (_c, _b, fx) => {
      fx.health(3);
      return "As primeiras semanas doeram. Depois, você passou a dormir melhor e ter mais fôlego para a rua.";
    } },
    { id: "talvez", label: "Ir de vez em quando", tone: "neutral", run: (_c, _b, fx) => {
      fx.health(1);
      return "Duas vezes no mês. Melhor que nada.";
    } },
    { id: "nao", label: "Agora não dá", tone: "neutral", run: () => "Segunda-feira que vem, quem sabe." },
  ],
  fallback: "nao",
});

const desempregado_pede = ev({
  id: "desempregado_pede",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE", "TRABALHO"],
  cooldown: 200,
  expires: 6,
  when: (c) => (c.unemployment >= 7 || c.rng.chance(0.3) ? { quem: c.rng.pick(NOMES), filho: c.rng.pick(["o filho", "a filha", "o sobrinho", "a neta"]) } : null),
  title: () => "Pedido de indicação para emprego",
  text: (c, b) => `${b.quem} pediu ajuda: ${b.filho} está desempregado(a) há meses. ${c.p.office_code ? "Querem uma vaga no gabinete ou na prefeitura." : "Querem saber se você conhece alguém que esteja contratando."}`,
  opts: [
    { id: "curriculo", label: "Ajudar com currículo e contatos", tone: "safe", cost: () => ({ energy: 6 }), run: (c, _b, fx) => {
      if (c.roll(0.45)) {
        fx.reputation(1.5);
        return "Uma entrevista, uma vaga. A família inteira agora fala bem de você no bairro.";
      }
      fx.reputation(0.5);
      return "Não saiu vaga ainda, mas o currículo ficou ótimo e eles sentiram o apoio.";
    } },
    { id: "cargo", label: "Prometer um cargo", hint: "Favor que se cobra", tone: "illegal", requires: (c) => (c.p.office_code ? null : "Só com mandato."), run: (c, b, fx) => {
      fx.illicit("NEPOTISMO", { amount: c.money(4000), description: `Cargo prometido a ${b.filho} de ${b.quem}`, witnesses: 2, paperTrail: 0.4 });
      fx.reputation(1);
      return "O cargo saiu. Gratidão eterna — e um papel com sua assinatura.";
    } },
    { id: "nao", label: "Dizer que não tem como ajudar", tone: "neutral", run: () => "Você foi sincero(a). Ficaram decepcionados." },
  ],
  fallback: "nao",
});

// ================================================================ partido

const panfletagem_chuva = ev({
  id: "panfletagem_chuva",
  kind: "OPORTUNIDADE",
  tags: ["PARTIDO"],
  cooldown: 90,
  expires: 4,
  when: (c) => (c.p.party_id && semCargo(c) ? { lugar: c.rng.pick(["no terminal de ônibus", "na feira de domingo", "na porta da fábrica", "no centro, na hora do almoço"]) } : null),
  title: () => "O diretório pede voluntários",
  text: (c, b) => `O ${c.party?.acronym ?? "partido"} vai fazer panfletagem ${b.lugar} no sábado. A previsão é de chuva. O grupo tem 80 pessoas e quatro confirmaram.`,
  opts: [
    { id: "ir", label: "Ir mesmo com chuva", tone: "safe", cost: () => ({ energy: 10 }), run: (_c, _b, fx) => {
      fx.standing(3);
      fx.activism(2);
      return "Encharcado(a), mas lá. O presidente do diretório tirou foto e postou: \"esses são os de verdade\".";
    } },
    { id: "levar", label: "Ir e levar mais gente", hint: "Mobilizar amigos", tone: "bold", cost: () => ({ energy: 14 }), run: (c, _b, fx) => {
      fx.standing(c.roll(0.6) ? 5 : 3);
      fx.activism(3);
      return "Você apareceu com cinco amigos e guarda-chuvas. Virou assunto na reunião seguinte.";
    } },
    { id: "nao", label: "Não ir", tone: "neutral", run: () => "Você ficou em casa. Ninguém cobrou — mas ninguém esqueceu." },
  ],
  fallback: "nao",
});

const nucleo_jovem = ev({
  id: "nucleo_jovem",
  kind: "OPORTUNIDADE",
  tags: ["PARTIDO"],
  cooldown: 400,
  max: 1,
  expires: 10,
  when: (c) => (c.p.party_id && c.age <= 32 ? {} : null),
  title: () => "Montar a juventude do partido na cidade",
  text: (c) => `O ${c.party?.acronym ?? "partido"} não tem núcleo de juventude em ${city(c)}. Um dirigente estadual sugeriu que você monte um. Dá trabalho, mas quem organiza a juventude costuma subir rápido.`,
  opts: [
    { id: "montar", label: "Assumir a tarefa", tone: "bold", cost: () => ({ energy: 15 }), run: (c, _b, fx) => {
      fx.standing(c.roll(0.6) ? 6 : 3);
      fx.activism(4);
      fx.flag("juventude", true);
      return "Primeira reunião com 12 pessoas numa lanchonete. Em três meses, 40 jovens e um grupo que faz barulho.";
    } },
    { id: "ajudar", label: "Ajudar quem for coordenar", tone: "safe", cost: () => ({ energy: 6 }), run: (_c, _b, fx) => {
      fx.standing(2);
      return "Você ajudou sem aparecer muito. O coordenador ficou te devendo uma.";
    } },
    { id: "nao", label: "Não ter tempo agora", tone: "neutral", run: () => "Outra pessoa assumiu. E vai subir com isso." },
  ],
  fallback: "nao",
});

const briga_grupo_partido = ev({
  id: "briga_grupo_partido",
  kind: "DECISAO",
  tags: ["PARTIDO"],
  cooldown: 160,
  expires: 2,
  when: (c) => (c.p.party_id ? { tema: c.rng.pick(["uma aliança com o partido rival", "a escolha do candidato a prefeito", "um post polêmico de um dirigente", "o uso do fundo partidário"]) } : null),
  title: () => "Briga no grupo do partido",
  text: (_c, b) => `O grupo do partido pegou fogo por causa de ${b.tema}. Já são 300 mensagens, dois áudios de cinco minutos e gente ameaçando sair.`,
  opts: [
    { id: "mediar", label: "Propor uma reunião para resolver", tone: "safe", cost: () => ({ energy: 5 }), run: (c, _b, fx) => {
      if (c.roll(0.5 + c.charisma * 0.3)) {
        fx.standing(3);
        return "Sua proposta acalmou o grupo. Na reunião, você saiu como \"a pessoa que une\".";
      }
      fx.standing(1);
      return "A reunião aconteceu e foi tensa, mas ninguém saiu do partido.";
    } },
    { id: "lado", label: "Tomar partido de um dos lados", tone: "risky", run: (c, _b, fx) => {
      if (c.roll(0.5)) {
        fx.standing(2);
        return "Você ficou do lado que venceu. Ganhou aliados — e alguns olhares tortos.";
      }
      fx.standing(-3);
      return "Você ficou do lado que perdeu. Tem gente que não vai esquecer.";
    } },
    { id: "calar", label: "Ficar quieto(a)", tone: "neutral", run: () => "Você leu tudo e não escreveu nada. Sábio, talvez." },
  ],
  fallback: "calar",
});

const formacao_politica = ev({
  id: "formacao_politica",
  kind: "OPORTUNIDADE",
  tags: ["PARTIDO"],
  cooldown: 240,
  expires: 10,
  when: (c) => (c.p.party_id ? { tema: c.rng.pick(["história do partido", "como montar uma campanha", "legislação eleitoral", "comunicação política"]) } : null),
  title: () => "Curso de formação do partido",
  text: (c, b) => `O ${c.party?.acronym ?? "partido"} abriu um curso de formação sobre ${b.tema}. Quatro sábados, com dirigentes estaduais dando aula.`,
  opts: [
    { id: "fazer", label: "Fazer o curso", tone: "safe", cost: () => ({ energy: 10 }), run: (_c, _b, fx) => {
      fx.standing(3);
      fx.debate(2);
      fx.capital(1);
      return "Você aprendeu, fez perguntas boas e saiu com o telefone de dois dirigentes estaduais.";
    } },
    { id: "nao", label: "Pular", tone: "neutral", run: () => "Você não foi. A lista de presença ficou sem seu nome." },
  ],
  fallback: "nao",
});

const contribuicao_atrasada = ev({
  id: "contribuicao_atrasada",
  kind: "OPORTUNIDADE",
  tags: ["PARTIDO", "DINHEIRO"],
  cooldown: 200,
  expires: 7,
  when: (c) => (c.p.party_id ? { v: c.money(c.p.office_code ? 1500 : 120) } : null),
  title: () => "Contribuição partidária",
  text: (c, b) => `A tesouraria do ${c.party?.acronym ?? "partido"} mandou mensagem: sua contribuição está em aberto (${brl(Number(b.v))}). "Quem contribui, participa das decisões."`,
  opts: [
    { id: "pagar", label: "Pagar em dia", tone: "safe", cost: (_c, b) => ({ money: Number(b.v) }), run: (_c, _b, fx) => {
      fx.standing(1.5);
      return "Contribuição em dia. Seu nome aparece \"regular\" na lista que todo mundo consulta antes das convenções.";
    } },
    { id: "atrasar", label: "Deixar para depois", tone: "neutral", run: (_c, _b, fx) => {
      fx.standing(-1);
      return "Mais um mês em aberto. A tesoureira anotou.";
    } },
  ],
  fallback: "atrasar",
});

const congresso_estadual = ev({
  id: "congresso_estadual",
  kind: "OPORTUNIDADE",
  tags: ["PARTIDO"],
  cooldown: 365,
  expires: 12,
  when: (c) => (c.p.party_id ? { v: c.money(700) } : null),
  title: () => "Congresso estadual do partido",
  text: (c, b) => `O ${c.party?.acronym ?? "partido"} vai fazer o congresso estadual na capital. Viagem, hotel e comida: uns ${brl(Number(b.v))}. É lá que as lideranças se conhecem — e que se decide quem vai ter espaço.`,
  opts: [
    { id: "ir", label: "Ir e circular", tone: "bold", cost: (_c, b) => ({ money: Number(b.v), energy: 12 }), run: (c, _b, fx) => {
      fx.standing(4);
      fx.capital(3);
      const quem = localPolitician(c, { partyId: c.p.party_id });
      if (quem) fx.rel(quem.id, 6);
      return "Três dias de plenária, cafezinho e conversa de corredor. Você voltou com cartões, convites e um lugar na foto oficial.";
    } },
    { id: "online", label: "Acompanhar pela transmissão", tone: "neutral", run: (_c, _b, fx) => {
      fx.standing(0.5);
      return "Você assistiu tudo pelo celular. Faltou estar lá.";
    } },
  ],
  fallback: "online",
});

const dirigente_pede_apoio = ev({
  id: "dirigente_pede_apoio",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  cooldown: 220,
  expires: 4,
  when: (c) => {
    if (!c.p.party_id) return null;
    const quem = localPolitician(c, { partyId: c.p.party_id });
    return quem ? { quem: quem.id, nome: quem.name } : null;
  },
  title: () => "Pedido de apoio na disputa interna",
  text: (c, b) => `${b.nome} vai disputar a presidência do diretório e quer seu voto — e que você convença mais três filiados. "Quem está comigo agora, eu não esqueço depois."`,
  opts: [
    { id: "apoiar", label: "Apoiar e trazer votos", tone: "bold", cost: () => ({ energy: 8 }), run: (c, b, fx) => {
      fx.rel(String(b.quem), 10);
      if (c.roll(0.55)) {
        fx.standing(4);
        return `${b.nome} venceu. Você ganhou um aliado na direção.`;
      }
      fx.standing(-2);
      return `${b.nome} perdeu. A nova direção sabe de que lado você estava.`;
    } },
    { id: "neutro", label: "Ficar neutro(a)", tone: "safe", run: (_c, b, fx) => {
      fx.rel(String(b.quem), -4);
      return `Você não se comprometeu. ${b.nome} entendeu o recado.`;
    } },
  ],
  fallback: "neutro",
});

// ================================================================ mandato

const fila_gabinete = ev({
  id: "fila_gabinete",
  kind: "OPORTUNIDADE",
  tags: ["MANDATO", "COMUNIDADE"],
  cooldown: 120,
  expires: 5,
  when: (c) => (c.p.office_code ? { n: c.rng.int(20, 60), pedido: c.rng.pick(["remédio", "emprego", "vaga em creche", "cesta básica", "ajuda com a conta de luz"]) } : null),
  title: () => "Fila na porta do gabinete",
  text: (_c, b) => `Segunda de manhã: ${b.n} pessoas na porta do gabinete, a maioria pedindo ${b.pedido}. Sua equipe pergunta o que fazer.`,
  opts: [
    { id: "atender", label: "Atender um por um, pessoalmente", tone: "safe", cost: () => ({ energy: 14 }), run: (_c, _b, fx) => {
      fx.reputation(1.5);
      fx.reach(0.004);
      return "Oito horas de atendimento. Você não resolveu tudo, mas ouviu todo mundo — e isso é raro.";
    } },
    { id: "encaminhar", label: "Encaminhar aos órgãos certos", tone: "neutral", cost: () => ({ energy: 5 }), run: (_c, _b, fx) => {
      fx.reputation(0.5);
      return "Sua equipe fez uma triagem e encaminhou. Funcional, sem calor.";
    } },
    { id: "assistencialismo", label: "Distribuir ajuda com verba do gabinete", tone: "illegal", run: (c, _b, fx) => {
      fx.reputation(2);
      fx.illicit("USO_MAQUINA", { amount: c.money(5000), description: "Ajuda distribuída com verba do gabinete", witnesses: 6, paperTrail: 0.5 });
      return "A fila saiu feliz. O controle interno vai fazer perguntas.";
    } },
  ],
  fallback: "encaminhar",
});

const radio_ao_vivo = ev({
  id: "radio_ao_vivo",
  kind: "DECISAO",
  tags: ["MANDATO", "IMPRENSA"],
  cooldown: 140,
  expires: 2,
  when: (c) => (c.p.office_code || c.p.reputation >= 30 ? { pergunta: c.rng.pick(["por que a obra da avenida está parada", "quanto você ganha e se acha justo", "se vai apoiar o aumento do IPTU", "o que fez de concreto pelo bairro dele"]) } : null),
  title: () => "Pergunta difícil ao vivo",
  text: (c, b) => `Entrevista na rádio de ${city(c)}. Um ouvinte liga e pergunta, ao vivo, ${b.pergunta}. O apresentador sorri e espera.`,
  opts: [
    { id: "franco", label: "Responder com franqueza", tone: "bold", run: (c, _b, fx) => {
      if (c.roll(0.55 + c.charisma * 0.25)) {
        fx.reputation(2);
        return "Resposta direta, sem enrolação. O apresentador elogiou no ar.";
      }
      fx.reputation(-1);
      return "Franca demais: um trecho foi recortado e circulou sem contexto.";
    } },
    { id: "dados", label: "Responder com números", tone: "safe", run: (c, _b, fx) => {
      fx.debate(1);
      if (c.roll(0.5 + c.competence * 0.3)) {
        fx.reputation(1);
        return "Dados na ponta da língua. Convenceu.";
      }
      return "Números demais para rádio. O ouvinte desligou sem entender.";
    } },
    { id: "desviar", label: "Desviar do assunto", tone: "risky", run: (_c, _b, fx) => {
      fx.reputation(-1.5);
      return "\"Não respondeu\", disse o apresentador. Todo mundo ouviu.";
    } },
  ],
  fallback: "desviar",
});

const visita_escola_mandato = ev({
  id: "visita_escola_mandato",
  kind: "OPORTUNIDADE",
  tags: ["MANDATO", "COMUNIDADE"],
  cooldown: 180,
  expires: 8,
  when: (c) => (c.p.office_code ? { prob: c.rng.pick(["telhado com goteira", "falta de merendeira", "quadra sem cobertura", "banheiros interditados"]), hood: home(c) } : null),
  title: () => "A diretora pede socorro",
  text: (_c, b) => `A diretora de uma escola do ${b.hood} convidou você para ver de perto: ${b.prob}. Os pais estarão lá.`,
  opts: [
    { id: "ir", label: "Ir e assumir o compromisso", tone: "bold", cost: () => ({ energy: 8 }), run: (c, b, fx) => {
      fx.reputation(1.5);
      fx.promise(`Resolver ${b.prob} na escola do ${b.hood}`, "trabalhadores_formais");
      return c.roll(0.5) ? "Você saiu de lá com um compromisso público e aplausos. Agora precisa entregar." : "Os pais gostaram de ver você lá. A cobrança vem junto.";
    } },
    { id: "oficio", label: "Mandar um ofício à secretaria", tone: "safe", run: () => "O ofício foi. A resposta deve chegar em 30 dias úteis." },
  ],
  fallback: "oficio",
});

// ================================================================ datas do ano

const festa_junina = ev({
  id: "festa_junina",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE", "VIDA"],
  cooldown: 300,
  expires: 6,
  when: (c) => (month(c) === 6 || month(c) === 7 ? { hood: home(c) } : null),
  title: () => "Arraiá do bairro",
  text: (_c, b) => `A paróquia do ${b.hood} vai fazer a festa junina e precisa de gente na barraca de quentão — e de alguém que \"mexa com política\" para conseguir a liberação da rua.`,
  opts: [
    { id: "barraca", label: "Trabalhar na barraca", tone: "safe", cost: () => ({ energy: 8 }), run: (_c, _b, fx) => {
      fx.activism(2);
      fx.reputation(1);
      return "Quentão, pé de moleque e muita conversa. Você saiu cheirando a fogueira e conhecendo meio bairro.";
    } },
    { id: "rua", label: "Resolver a liberação da rua", tone: "bold", cost: () => ({ energy: 6 }), run: (c, _b, fx) => {
      if (c.roll(0.6)) {
        fx.reputation(1.5);
        return "Rua liberada. O padre agradeceu no microfone, pelo nome.";
      }
      return "A prefeitura não liberou a tempo. A festa foi no pátio, mais apertada.";
    } },
    { id: "curtir", label: "Só aproveitar a festa", tone: "neutral", run: (_c, _b, fx) => {
      fx.health(1);
      return "Você dançou quadrilha e comeu canjica. Ninguém falou de política por uma noite.";
    } },
  ],
  fallback: "curtir",
});

const natal_cesta = ev({
  id: "natal_cesta",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE"],
  cooldown: 300,
  expires: 8,
  when: (c) => (month(c) === 12 ? { hood: home(c) } : null),
  title: () => "Campanha de Natal",
  text: (_c, b) => `Uma igreja do ${b.hood} está montando cestas de Natal para 200 famílias e falta metade dos alimentos.`,
  opts: [
    { id: "doar", label: "Doar e arrecadar com amigos", tone: "safe", cost: (c) => ({ money: c.money(400), energy: 8 }), run: (_c, _b, fx) => {
      fx.activism(3);
      fx.reputation(1);
      return "Na véspera, as 200 cestas estavam prontas. Você ajudou a carregar o caminhão.";
    } },
    { id: "postar", label: "Divulgar nas redes", tone: "neutral", run: (_c, _b, fx) => {
      fx.activism(1);
      return "Seu post ajudou a trazer doações. Simples e útil.";
    } },
    { id: "nada", label: "Não participar", tone: "neutral", run: () => "As cestas saíram sem você." },
  ],
  fallback: "nada",
});

export const DAILY_EVENTS: EventDef[] = [
  abaixo_assinado,
  protesto_cidade,
  palestra_escola,
  mutirao,
  presidencia_associacao,
  vizinho_barulho,
  animal_resgate,
  fake_grupo_familia,
  post_viral,
  podcast_local,
  pesquisadora,
  chefe_reclama,
  oferta_emprego,
  amigo_emprestimo,
  amigo_devolve,
  golpe_mensagem,
  curso_oratoria,
  academia,
  desempregado_pede,
  panfletagem_chuva,
  nucleo_jovem,
  briga_grupo_partido,
  formacao_politica,
  contribuicao_atrasada,
  congresso_estadual,
  dirigente_pede_apoio,
  fila_gabinete,
  radio_ao_vivo,
  visita_escola_mandato,
  festa_junina,
  natal_cesta,
];
