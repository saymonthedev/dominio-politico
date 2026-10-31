import type { StoryCtx } from "../context";
import type { EventDef } from "../def";
import { AMIGOS, NOMES, ev } from "./cotidiano";
import { bairro, brl, city, communityLeader, home, localPolitician } from "./util";

/**
 * Mais política de rua e de bairro: audiência pública, falta d'água, obra parada,
 * greve de ônibus, enchente, posto sem médico, rádio, universidade, influenciador,
 * time de várzea. Cada um com variações e limite por carreira, para o começo da
 * carreira (sem cargo) não girar sempre nas mesmas histórias.
 */

const semCargo = (c: StoryCtx) => !c.p.office_code;

const audiencia_publica = ev({
  id: "audiencia_publica",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE"],
  family: "bairro_pauta",
  cooldown: 200,
  max: 3,
  expires: 8,
  when: (c) => ({ tema: c.rng.pick(["o novo plano diretor", "o reajuste da passagem de ônibus", "a concessão do saneamento", "a reforma da praça central"]), hood: bairro(c, "audiencia") }),
  title: (_c, b) => `Audiência pública sobre ${b.tema}`,
  text: (c, b) => `A Câmara de ${city(c)} marcou audiência pública sobre ${b.tema}. Moradores do ${b.hood} pedem que alguém fale por eles no microfone.`,
  opts: [
    { id: "falar", label: "Preparar uma fala e se inscrever", hint: "Visibilidade e respeito de quem estava lá", tone: "bold", cost: () => ({ energy: 12 }), run: (c, _b, fx) => {
      fx.activism(3);
      fx.visibility(1);
      fx.debate(2);
      if (c.roll(0.25)) fx.reach(0.003);
      return "Três minutos no microfone, dados na mão. Saiu aplauso — e um vereador pediu seu contato.";
    } },
    { id: "assistir", label: "Ir e assistir", tone: "safe", cost: () => ({ energy: 6 }), run: (_c, _b, fx) => {
      fx.activism(1);
      return "Você anotou tudo e entendeu quem manda em quê na cidade.";
    } },
    { id: "nao", label: "Não ir", tone: "neutral", run: () => "A audiência aconteceu com a plateia vazia, como de costume." },
  ],
  fallback: "nao",
});

const falta_agua = ev({
  id: "falta_agua",
  kind: "DECISAO",
  tags: ["COMUNIDADE"],
  family: "bairro_crise",
  cooldown: 240,
  max: 2,
  expires: 5,
  when: (c) => ({ hood: home(c), dias: c.rng.int(3, 6) }),
  who: (c, b) => communityLeader(c, String(b.hood)),
  title: (_c, b) => `${b.dias} dias sem água no ${b.hood}`,
  text: (c, b) => `As torneiras secaram no ${b.hood} e a companhia de saneamento não dá prazo. ${communityLeader(c, String(b.hood)).name}, da associação, quer organizar uma cobrança coletiva.`,
  opts: [
    { id: "organizar", label: "Organizar a cobrança com a associação", hint: "Liderança no bairro", tone: "bold", cost: () => ({ energy: 15 }), run: (c, b, fx) => {
      fx.activism(4);
      fx.rel(communityLeader(c, String(b.hood)).id, 8);
      fx.reach(0.002);
      return c.roll(0.6) ? "Vans lotadas na porta da companhia e reportagem na TV local. No dia seguinte, a água voltou." : "A cobrança foi forte, mas a água só voltou depois de uma semana. Ficou o nome de quem puxou a fila.";
    } },
    { id: "denunciar", label: "Denunciar nas redes e ao Ministério Público", tone: "safe", cost: () => ({ energy: 6 }), run: (_c, _b, fx) => {
      fx.activism(2);
      fx.visibility(1);
      return "A denúncia virou procedimento no MP. A companhia passou a mandar caminhão-pipa.";
    } },
    { id: "galao", label: "Comprar galões e esperar", tone: "neutral", cost: (c) => ({ money: c.money(150) }), run: () => "Você se virou com galões, como todo mundo." },
  ],
  fallback: "galao",
});

const obra_parada_bairro = ev({
  id: "obra_parada_bairro",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE", "IMPRENSA"],
  family: "bairro_pauta",
  cooldown: 300,
  max: 2,
  expires: 8,
  when: (c) => (semCargo(c) ? { hood: bairro(c, "obra"), obra: c.rng.pick(["a creche", "a unidade de saúde", "o viaduto", "a escola"]) } : null),
  title: (_c, b) => `A obra parada no ${b.hood}`,
  text: (_c, b) => `Há dois anos, ${b.obra} do ${b.hood} está abandonada: esqueleto de concreto, mato e placa desbotada com o valor da obra.`,
  opts: [
    { id: "video", label: "Gravar um vídeo na frente da obra cobrando a prefeitura", hint: "Viraliza ou some", tone: "bold", cost: () => ({ energy: 8 }), run: (c, _b, fx) => {
      if (c.roll(0.35)) {
        fx.visibility(3);
        fx.reach(0.004);
        return "O vídeo passou de cem mil visualizações. A prefeitura soltou nota prometendo retomar a obra.";
      }
      fx.visibility(1);
      return "O vídeo rodou nos grupos do bairro. Nada mudou, mas as pessoas lembram quem cobrou.";
    } },
    { id: "pedido", label: "Pedir informações pela Lei de Acesso", hint: "Trabalho de formiga", tone: "safe", cost: () => ({ energy: 5 }), run: (_c, _b, fx) => {
      fx.activism(2);
      fx.debate(1);
      return "A resposta veio em 20 dias: o contrato foi rescindido e há novo edital em análise. Agora você sabe mais do que muita gente.";
    } },
    { id: "nada", label: "Seguir a vida", tone: "neutral", run: () => "A obra continua lá, parada, como um monumento ao descaso." },
  ],
  fallback: "nada",
});

const greve_onibus = ev({
  id: "greve_onibus",
  kind: "DECISAO",
  tags: ["COMUNIDADE", "TRABALHO"],
  family: "cidade_crise",
  cooldown: 300,
  max: 2,
  expires: 4,
  when: (c) => ({ dias: c.rng.int(2, 4) }),
  title: () => "Greve de ônibus na cidade",
  text: (c, b) => `Motoristas e cobradores pararam por ${b.dias} dias: salários atrasados pela empresa concessionária. ${c.s.car ? "Você tem carro; muita gente da sua rua, não." : "Sem carro, você também está a pé."}`,
  opts: [
    { id: "carona", label: "Organizar caronas solidárias no bairro", hint: "Ajuda concreta; cansa", tone: "safe", cost: () => ({ energy: 12 }), run: (c, _b, fx) => {
      fx.activism(3);
      fx.fatigue(4);
      if (c.s.car) fx.reach(0.002);
      return "O grupo de caronas levou enfermeiras, porteiros e estudantes. Gente que você nem conhecia agora sabe seu nome.";
    } },
    { id: "apoiar", label: "Ir ao piquete apoiar os trabalhadores", hint: "Simpatia de uns, antipatia de outros", tone: "bold", cost: () => ({ energy: 8 }), run: (_c, _b, fx) => {
      fx.activism(2);
      fx.visibility(1);
      return "Você apareceu na foto do sindicato. Uns aplaudiram; outros reclamaram nos comentários.";
    } },
    { id: "trabalho", label: "Se virar para chegar ao trabalho", tone: "neutral", run: (c, _b, fx) => {
      if (!c.s.car) fx.fatigue(6);
      return c.s.car ? "Trânsito caótico, mas você chegou." : "Duas horas de caminhada e aplicativo caro. Cansaço puro.";
    } },
  ],
  fallback: "trabalho",
});

const enchente_bairro = ev({
  id: "enchente_bairro",
  kind: "DECISAO",
  tags: ["COMUNIDADE"],
  family: "bairro_crise",
  cooldown: 365,
  max: 2,
  expires: 3,
  when: (c) => ([1, 2, 3, 11, 12].includes(Number(c.date.slice(5, 7))) ? { hood: bairro(c, "enchente") } : null),
  title: (_c, b) => `Enchente no ${b.hood}`,
  text: (_c, b) => `A chuva da madrugada encheu o córrego e a água invadiu as casas do ${b.hood}. Famílias perderam móveis e documentos; a igreja do bairro virou abrigo.`,
  opts: [
    { id: "ajudar", label: "Passar o dia ajudando na limpeza e nas doações", hint: "Cansa muito; marca muito", tone: "safe", cost: () => ({ energy: 25 }), run: (c, b, fx) => {
      fx.activism(5);
      fx.fatigue(10);
      fx.reputation(1);
      fx.rel(communityLeader(c, String(b.hood)).id, 10);
      return "Botas na lama até o fim da tarde. Ninguém ali vai esquecer quem estava com o rodo na mão.";
    } },
    { id: "doar", label: "Doar e arrecadar com conhecidos", tone: "neutral", cost: (c) => ({ money: c.money(500) }), run: (_c, _b, fx) => {
      fx.activism(2);
      return "Colchões, cestas e água chegaram no fim do dia. Você ajudou de longe.";
    } },
    { id: "foto", label: "Ir rapidinho, tirar fotos e postar", hint: "Pode pegar mal", tone: "risky", run: (c, _b, fx) => {
      if (c.roll(0.5)) {
        fx.reputation(-2);
        return "\"Veio só tirar foto\", escreveu uma moradora. O print rodou mais que o seu post.";
      }
      fx.visibility(1);
      return "As fotos ajudaram a mobilizar doações. Por pouco não pegou mal.";
    } },
  ],
  fallback: "doar",
});

const posto_sem_medico = ev({
  id: "posto_sem_medico",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE", "SAUDE"],
  family: "bairro_pauta",
  cooldown: 300,
  max: 2,
  expires: 8,
  when: (c) => ({ hood: bairro(c, "posto"), quem: c.rng.pick(NOMES) }),
  title: (_c, b) => `Posto do ${b.hood} sem médico há um mês`,
  text: (_c, b) => `${b.quem} conta que levou o neto três vezes ao posto do ${b.hood} e voltou sem consulta: o médico pediu exoneração e ninguém foi nomeado.`,
  opts: [
    { id: "conselho", label: "Levar o caso ao conselho municipal de saúde", hint: "O caminho institucional", tone: "safe", cost: () => ({ energy: 10 }), run: (c, _b, fx) => {
      fx.activism(3);
      fx.debate(1);
      return c.roll(0.5) ? "O conselho cobrou a secretaria e um médico foi remanejado em duas semanas." : "O conselho prometeu cobrar. Você vai ter que lembrar a eles.";
    } },
    { id: "abaixo", label: "Fazer um abaixo-assinado na fila do posto", tone: "bold", cost: () => ({ energy: 12 }), run: (_c, _b, fx) => {
      fx.activism(3);
      fx.reach(0.002);
      return "Seiscentas assinaturas em dois dias. A rádio local leu a lista no ar.";
    } },
    { id: "nada", label: "Lamentar e seguir", tone: "neutral", run: () => "Você lamentou. O posto continua sem médico." },
  ],
  fallback: "nada",
});

const time_varzea = ev({
  id: "time_varzea",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE", "LAZER"],
  cooldown: 400,
  max: 2,
  expires: 10,
  when: (c) => ({ hood: bairro(c, "time"), time: c.rng.pick(["Unidos", "Estrela", "Juventude", "Grêmio", "Ferroviário", "Real"]) }),
  title: (_c, b) => `O ${b.time} do ${b.hood} pede patrocínio`,
  text: (c, b) => `O time de várzea ${b.time} do ${b.hood} vai disputar o campeonato da cidade e não tem dinheiro para os uniformes. Pedem ${brl(c.money(1800))}; em troca, seu nome nas costas da camisa.`,
  opts: [
    { id: "patrocinar", label: "Patrocinar os uniformes", hint: "Seu nome no campo todo domingo", tone: "bold", cost: (c) => ({ money: c.money(1800) }), run: (c, _b, fx) => {
      fx.reach(0.003);
      fx.activism(2);
      return c.roll(0.3) ? "O time foi campeão! A foto da final, com seu nome na camisa, rodou a cidade inteira." : "O time caiu nas quartas, mas seu nome rodou todos os campos do campeonato.";
    } },
    { id: "jogo", label: "Ir assistir a um jogo e conversar com o pessoal", tone: "safe", cost: () => ({ energy: 6 }), run: (_c, _b, fx) => {
      fx.fatigue(-4);
      fx.activism(1);
      return "Domingo de sol, churrasquinho e resenha. Você não pagou nada, mas ganhou amigos.";
    } },
    { id: "nao", label: "Recusar", tone: "neutral", run: () => "O time conseguiu outro patrocinador: o rival político do bairro." },
  ],
  fallback: "nao",
});

const influencer_convite = ev({
  id: "influencer_convite",
  kind: "OPORTUNIDADE",
  tags: ["IMPRENSA"],
  cooldown: 300,
  max: 2,
  expires: 6,
  when: (c) => ({ nome: c.rng.pick(["@vozdaquebrada", "@cidadesemfiltro", "@papo_reto_local", "@bairro_em_pauta"]) }),
  title: (_c, b) => `${b.nome} quer você num vídeo`,
  text: (c, b) => `O perfil ${b.nome}, com milhares de seguidores em ${city(c)}, quer gravar um "papo sem roteiro" com você. Sem edição: o que você falar vai ao ar.`,
  opts: [
    { id: "topar", label: "Topar o papo sem roteiro", hint: "Alcance alto; risco de gafe", tone: "bold", cost: () => ({ energy: 8 }), run: (c, _b, fx) => {
      if (c.roll(0.2 + (1 - c.charisma) * 0.2)) {
        fx.visibility(2);
        fx.reputation(-1.5);
        return "Uma frase solta virou corte. Os comentários dividiram a cidade — e você aprendeu a respirar antes de responder.";
      }
      fx.visibility(3);
      fx.reach(0.004);
      return "O vídeo passou de cinquenta mil visualizações. Gente nova começou a seguir você.";
    } },
    { id: "roteiro", label: "Aceitar, mas com perguntas combinadas", tone: "safe", cost: () => ({ energy: 5 }), run: (_c, _b, fx) => {
      fx.visibility(1);
      return "Ficou certinho demais. Pouca gente comentou.";
    } },
    { id: "nao", label: "Recusar", tone: "neutral", run: () => "Você recusou. O perfil gravou com outra pessoa da política local." },
  ],
  fallback: "nao",
});

const pesquisa_universidade = ev({
  id: "pesquisa_universidade",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE"],
  cooldown: 400,
  max: 1,
  expires: 10,
  when: (c) => ({ curso: c.rng.pick(["Ciência Política", "Sociologia", "Serviço Social", "Arquitetura e Urbanismo"]) }),
  title: () => "Convite da universidade",
  text: (c, b) => `Uma professora de ${b.curso} da universidade de ${city(c)} quer você numa mesa sobre "participação política nos bairros". O auditório costuma lotar de estudantes.`,
  opts: [
    { id: "aceitar", label: "Aceitar e preparar a fala", hint: "Preparo e prestígio entre jovens", tone: "bold", cost: () => ({ energy: 10 }), run: (_c, _b, fx) => {
      fx.debate(4);
      fx.activism(2);
      fx.reach(0.002);
      return "Debate vivo, perguntas difíceis e uma fila de estudantes querendo ajudar na próxima campanha.";
    } },
    { id: "recusar", label: "Agradecer e recusar", tone: "neutral", run: () => "A mesa aconteceu com outros convidados." },
  ],
  fallback: "recusar",
});

const amigo_candidato = ev({
  id: "amigo_candidato",
  kind: "DECISAO",
  tags: ["VIDA", "ELEICAO"],
  cooldown: 500,
  max: 1,
  expires: 6,
  when: (c) => {
    const rival = localPolitician(c, { partyId: null });
    return c.p.party_id && rival && rival.party_id !== c.p.party_id ? { amigo: c.rng.pick(AMIGOS), rival: rival.id } : null;
  },
  title: (_c, b) => `${b.amigo} vai ser candidato(a) — por outro partido`,
  text: (c, b) => `${b.amigo}, amigo(a) de infância, avisou que vai disputar a próxima eleição pelo partido de ${c.ctx.person(String(b.rival))?.name ?? "um adversário"}. E quer seu apoio, "pela amizade".`,
  opts: [
    { id: "amizade", label: "Apoiar o amigo, mesmo de outro partido", hint: "Lealdade pessoal; atrito no seu partido", tone: "risky", run: (_c, _b, fx) => {
      fx.standing(-4);
      fx.fatigue(-3);
      return "Você gravou um vídeo pelo amigo. No seu partido, a pergunta foi uma só: \"de que lado você está?\"";
    } },
    { id: "conversa", label: "Explicar com carinho que não pode", tone: "safe", run: () => "A conversa foi difícil, mas a amizade ficou." },
    { id: "convidar", label: "Convidar o amigo para o seu partido", hint: "Uma conversa longa", tone: "bold", cost: () => ({ energy: 8 }), run: (c, _b, fx) => {
      if (c.roll(0.35)) {
        fx.standing(4);
        return "Ele topou trocar! Seu partido ganhou um candidato — e você, crédito.";
      }
      return "Ele agradeceu, mas já tinha compromisso. Ficou o respeito.";
    } },
  ],
  fallback: "conversa",
});

export const MORE_EVENTS: EventDef[] = [
  audiencia_publica,
  falta_agua,
  obra_parada_bairro,
  greve_onibus,
  enchente_bairro,
  posto_sem_medico,
  time_varzea,
  influencer_convite,
  pesquisa_universidade,
  amigo_candidato,
];
